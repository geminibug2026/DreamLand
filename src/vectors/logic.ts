// 벡터 검색 — 지난 대화와 로어북을 "뜻"으로 찾아 프롬프트에 싣는다 (옛 js/f-vectors.js 의 로직)
// 흐름: 메시지를 조각 내어 임베딩해 두고, 최근 메시지를 질의로 삼아 비슷한 조각을 골라 싣는다.
// 임베딩 호출은 답변 직전에 한 번(질의) + 아직 벡터가 없는 조각만큼. 벡터는 kv 저장소의 'vec:<대화 id>' · 'vec:lore' 에 두고 백업에는 넣지 않는다.
import { mod } from '../legacy';
import { B, type ChatX, type Conn, type Msg } from '../addons/legacy';

export interface EmbedOpt { connId?: string; kind?: string; model?: string; signal?: AbortSignal; timeoutMs?: number; query?: boolean }
export interface EmbedMod {
  EMBED_KINDS: Record<string, string>;
  embedKind(conn: Conn, pick?: string): string;
  embedModel(conn: Conn, kind?: string, model?: string): string;
  cosine(a?: Float32Array, b?: Float32Array): number;
  embedTexts(texts: string[], opt?: EmbedOpt): Promise<Float32Array[]>;
}
export const embed = () => mod<EmbedMod>('embed');

export const VEC_TEMPLATE = 'Past events relevant to the current scene (retrieved from earlier in this chat, oldest first):\n{{text}}';
export const VEC_DEFAULTS = {
  enabled: false, connId: '', kind: 'auto', model: '',
  chat: true, query: 2, insert: 3, protect: 20, threshold: 0.25, chunk: 400, template: '', position: 'depth', depth: 2,
  lore: false, loreAll: false, loreMax: 5, loreThreshold: 0.3,
};
export type VecCfg = typeof VEC_DEFAULTS;
export const cfg = (): VecCfg => {
  const v = (B.S.settings.vectors ||= {}) as Record<string, unknown>, d = VEC_DEFAULTS as Record<string, unknown>;
  for (const k in d) if (v[k] === undefined) v[k] = d[k];
  return v as VecCfg;
};
const hash = (s: string) => { let a = 0x811c9dc5, b = 0x1b873593; for (let i = 0; i < s.length; i++) { const c = s.charCodeAt(i); a = Math.imul(a ^ c, 0x01000193); b = Math.imul(b ^ c, 0x85ebca6b) + a | 0; } return (a >>> 0).toString(36) + (b >>> 0).toString(36); };
const clean = (t: unknown) => String(t || '').replace(/<[^>]{1,80}>/g, ' ').replace(/\s+\n/g, '\n').trim();

/** 긴 글을 문장 경계에서 size 자 안팎으로 나눈다 */
export function chunkText(text: unknown, size = 400): string[] {
  const t = clean(text); if (!t) return []; if (!(size > 0) || t.length <= size * 1.25) return [t];
  const parts = t.split(/(?<=[.!?。！？…”"'\n])\s+/), out: string[] = []; let cur = '';
  for (const p of parts) {
    if (cur && cur.length + p.length + 1 > size) { out.push(cur); cur = ''; }
    if (p.length > size * 1.5) { if (cur) { out.push(cur); cur = ''; } for (let i = 0; i < p.length; i += size) out.push(p.slice(i, i + size)); continue; }
    cur = cur ? cur + ' ' + p : p;
  }
  if (cur) out.push(cur);
  return out;
}

// ── 저장 ──
export interface VecStore { id: string; sig: string; items: Record<string, Float32Array> }
const stores = new Map<string, VecStore>();   // id → { id, sig, items: { hash: Float32Array } }
export async function loadStore(id: string, sig: string, peek = false): Promise<VecStore> {
  let st = stores.get(id);
  if (!st) {
    const raw = await B.core.DB.get('kv', id).catch(() => null) as { sig?: string; items?: Record<string, unknown> } | null;
    st = { id, sig: raw?.sig || '', items: {} };
    for (const [k, v] of Object.entries(raw?.items || {})) st.items[k] = v instanceof Float32Array ? v : Float32Array.from(Object.values((v || {}) as Record<string, number>));
    stores.set(id, st);
  }
  if (st.sig !== sig) { if (peek) return { id, sig, items: {} }; st.sig = sig; st.items = {}; }   // 임베딩 모델이 바뀌면 처음부터 (상태만 볼 때는 건드리지 않는다)
  return st;
}
const saveStore = (st: VecStore) => B.core.DB.put('kv', { id: st.id, sig: st.sig, items: st.items });
export const sigOf = (c: VecCfg) => { const conn = B.S.get('conns', c.connId), E = embed(); return conn ? `${E.embedKind(conn, c.kind)}:${E.embedModel(conn, c.kind, c.model)}` : ''; };
export const embedOpt = (c: VecCfg, extra: EmbedOpt = {}): EmbedOpt => ({ connId: c.connId, kind: c.kind, model: c.model, ...extra });

export interface Piece { key: string; text: string }
interface ChatPiece extends Piece { who: string; order: number; ts: number }
interface LorePiece extends Piece { id: string; name: string }
/** 조각 목록 [{ key, text }] 의 벡터를 맞춰 둔다 (없는 것만 계산, 사라진 것은 지움). 반환: 새로 계산한 수 */
export async function sync(st: VecStore, pieces: Piece[], c: VecCfg, { signal, onProgress, prune = true, max = 0 }: { signal?: AbortSignal; onProgress?: (done: number, total: number) => void; prune?: boolean; max?: number } = {}): Promise<number> {
  const want = new Set(pieces.map(p => p.key)), todo = pieces.filter(p => !st.items[p.key]); let changed = false;
  if (prune) for (const k of Object.keys(st.items)) if (!want.has(k)) { delete st.items[k]; changed = true; }
  if (changed) await saveStore(st);
  // 한 묶음씩 계산하고 그때그때 저장한다: 도중에 끊겨도 한 만큼은 남고, 멈춘 서버에 끝없이 매달리지 않는다
  const work = max > 0 ? todo.slice(-max) : todo; let done = 0;
  for (let i = 0; i < work.length; i += 64) {
    const part = work.slice(i, i + 64), vs = await embed().embedTexts(part.map(p => p.text.slice(0, 6000)), embedOpt(c, { signal, timeoutMs: 30000 }));
    part.forEach((p, k) => { st.items[p.key] = vs[k]; }); done += part.length; await saveStore(st); onProgress?.(done, work.length);
  }
  return done;
}

// ── 지난 대화 ──
export function chatPieces(chat: ChatX, msgs: Msg[], c: VecCfg): ChatPiece[] {
  const user = B.S.persona(chat)?.name || 'User', vis = msgs.filter(m => !m.hidden && m.role !== 'system' && !m.dice), old = vis.slice(0, Math.max(0, vis.length - Math.max(0, +c.protect || 0))), out: ChatPiece[] = [];
  old.forEach((m, n) => { const who = m.role === 'user' ? user : (m.name || 'Character'); chunkText(B.core.msgText(m), +c.chunk || 0).forEach((t, k) => out.push({ key: hash(m.id + '|' + k + '|' + t), text: t, who, order: n * 1000 + k, ts: m.ts })); });
  return out;
}
function queryText(msgs: Msg[], c: VecCfg) { return msgs.filter(m => !m.hidden && m.role !== 'system').slice(-Math.max(1, +c.query || 2)).map(m => clean(B.core.msgText(m))).filter(Boolean).join('\n').slice(-4000); }

const hits = new Map<string, { text: string; n: number }>();        // 대화 id → { text, n }
const loreHits = new Set<string>();    // 이번 턴에 벡터가 깨운 로어북 항목 id
export interface LastInfo { at: number; chat: { who: string; text: string; score: number }[]; lore: { name: string; score: number }[] }
let lastInfo: LastInfo | null = null;           // 화면에 보여 줄 마지막 검색 결과
export const lastSearch = () => lastInfo;

function lorePieces(chat: ChatX, c: VecCfg): LorePiece[] {
  const S = B.S, chars = (chat.charIds || []).map(id => S.get('chars', id)).filter(x => !!x), books = B.engine.activeBooks(chat, chars, S.persona(chat)), out: LorePiece[] = [];
  for (const b of books) for (const e of b.entries || []) { if (e.enabled === false || e.constant || !(e.content || '').trim() || !(c.loreAll || e.vectorized)) continue; const text = clean([e.name, (e.keys || []).join(', '), e.content].filter(Boolean).join('\n')); out.push({ key: e.id + ':' + hash(text), text, id: e.id, name: e.name || (e.keys || [])[0] || '항목' }); }
  return out;
}

/** 로어북 벡터: 고쳐서 낡은 것과, 이제 없는 항목의 것을 치운다 */
function pruneLore(st: VecStore, lore: LorePiece[]) {
  const live = new Set(lore.map(p => p.key)), here = new Set(lore.map(p => p.id)), all = new Set(B.S.lore.flatMap(b => (b.entries || []).map(e => e.id))); let n = 0;
  for (const k of Object.keys(st.items)) { const id = k.includes(':') ? k.slice(0, k.lastIndexOf(':')) : ''; if (!id || !all.has(id) || (here.has(id) && !live.has(k))) { delete st.items[k]; n++; } }
  if (n) saveStore(st).catch(() => { });
}
/** 답변 직전: 벡터를 맞추고 질의로 찾아 둔다 */
export async function prepare({ chat, msgs, type }: { chat?: ChatX; msgs?: Msg[]; type?: string }): Promise<void> {
  const c = cfg(), E = embed(); if (chat) hits.delete(chat.id); loreHits.clear();
  if (!c.enabled || !chat || !msgs?.length) return;
  if (!B.S.get('conns', c.connId)) return;
  const qm = (type === 'regen' || type === 'swipe') && msgs[msgs.length - 1]?.role === 'assistant' ? msgs.slice(0, -1) : msgs;   // 다시 쓸 답변은 질의에서 뺀다
  const q = queryText(qm, c); if (q.length < 2) return;
  const sig = sigOf(c), pieces = c.chat ? chatPieces(chat, msgs, c) : [], lore = c.lore ? lorePieces(chat, c) : [];
  if (!pieces.length && !lore.length) return;
  const cst = pieces.length ? await loadStore('vec:' + chat.id, sig) : null, lst = lore.length ? await loadStore('vec:lore', sig) : null;
  const fresh = (cst ? pieces.filter(p => !cst.items[p.key]).length : 0) + (lst ? lore.filter(p => !lst.items[p.key]).length : 0);
  if (fresh > 24) B.chat.setStatus?.(`벡터 만드는 중… ${fresh}조각`);
  // 답변 직전에는 가장 최근 조각 256개까지만 새로 만든다 (나머지는 다음 턴이나 「지금 만들기」에서)
  if (cst) await sync(cst, pieces, c, { max: 256 });
  if (lst) { await sync(lst, lore, c, { prune: false, max: 256 }); pruneLore(lst, lore); }
  const [qv] = await E.embedTexts([q], embedOpt(c, { query: true, timeoutMs: 20000 }));
  const info: LastInfo = { at: Date.now(), chat: [], lore: [] };
  if (cst) {
    const top = pieces.map(p => ({ p, s: E.cosine(qv, cst.items[p.key]) })).filter(x => x.s >= (+c.threshold || 0)).sort((a, b) => b.s - a.s).slice(0, Math.max(1, +c.insert || 3));
    if (top.length) { top.sort((a, b) => a.p.order - b.p.order); hits.set(chat.id, { text: top.map(x => `${x.p.who}: ${x.p.text}`).join('\n\n'), n: top.length }); info.chat = top.map(x => ({ who: x.p.who, text: x.p.text, score: x.s })); }
  }
  if (lst) {
    const top = lore.map(p => ({ p, s: E.cosine(qv, lst.items[p.key]) })).filter(x => x.s >= (+c.loreThreshold || 0)).sort((a, b) => b.s - a.s).slice(0, Math.max(1, +c.loreMax || 5));
    for (const x of top) loreHits.add(x.p.id); info.lore = top.map(x => ({ name: x.p.name, score: x.s }));
  }
  lastInfo = info;
}
export const loreWoken = (id: string) => cfg().enabled && cfg().lore && loreHits.has(id);
export const hitOf = (chatId: string) => hits.get(chatId);
/** 이 대화의 벡터를 지운다 */
export async function dropChat(chatId: string, db = true) { stores.delete('vec:' + chatId); hits.delete(chatId); if (db) await B.core.DB.del('kv', 'vec:' + chatId); }
export const dropAll = () => stores.clear();
