// 표정: 설정 · 그림 보관 · 지금 표정 계산 · 기록 · 감정 판정 (화면 없음)
import type { AssetRec, ChatX, Msg, Swipe } from '../addons/types';
import { DEFAULT_LABELS, KO, RELATED, canonLabel, extractTag, hashStr, keywordLabel, plainText, type CustomLabel } from './pure';
import { DB, S, msgText, now, uid } from '../lib/core';
import { macro, makeCtx, quickCall } from '../lib/engine';
import { chatApi } from '../chat/actions';

// ════════ 설정 ════════
export const TAG_PROMPT = `[Expression tag]
After your reply is complete, add one hidden tag on its own final line that names {{char}}'s facial expression at the end of this reply: <emotion:label>
Choose exactly one label from this list and copy it as written: {{labels}}
Write the tag only once, after everything else. Never mention or explain it — it is removed before the reader sees the reply.`;
export const CALL_PROMPT = `You choose a portrait for a character in a roleplay chat. Read the latest reply and pick the one label that best matches {{char}}'s facial expression or mood at the end of that reply. Judge only {{char}}, not the other people in the scene. If nothing clearly fits, answer "neutral" when it is on the list, otherwise the closest label.
Labels: {{labels}}
Answer with the label only: one word, exactly as written in the list.`;
/** [값, 이름, 설명, 비용] */
export const MODES: readonly (readonly [string, string, string, string])[] = [
  ['off', '직접 고르기', '자동으로 판정하지 않습니다. 메시지의 ⋯ 메뉴나 /emote 로 바꿉니다.', '호출 없음'],
  ['tag', '답변 속 숨은 태그', '답변을 쓰는 모델이 끝에 감정을 한 낱말로 적고, 화면에서는 떼어 냅니다.', '추가 호출 없음'],
  ['call', '답변 뒤에 따로 묻기', '답변이 올 때마다 보조 연결에 감정을 한 번 더 묻습니다. 가장 정확합니다.', '답변마다 추가 호출 1회'],
  ['key', '키워드로 추정', '답변에 든 낱말(웃었다, 눈물, 놀라 …)로 어림합니다. 틀릴 수 있어요.', '호출 없음'],
];
export interface ExprCfg {
  show: boolean; mode: string; tagPrompt: string; tagFallback: boolean; callPrompt: string; callContext: number; callTokens: number; onlyHave: boolean;
  dossier: boolean; avatars: boolean; avatarFit: string; multi: boolean; fade: boolean;
  standing: boolean; side: string; size: number; sizeOver: number; overOpacity: number; dim: boolean; fallback: string; maxPx: number;
  custom: CustomLabel[]; chars: Record<string, { n: number; fallback: string }>; ui: { char?: string };
}
const DEF = { show: true, mode: 'off', tagPrompt: '', tagFallback: true, callPrompt: '', callContext: 1, callTokens: 300, onlyHave: true, dossier: true, avatars: true, avatarFit: 'contain', multi: true, fade: true,
  standing: false, side: 'right', size: 66, sizeOver: 40, overOpacity: 90, dim: true, fallback: 'neutral', maxPx: 1280 };
export function cfg(): ExprCfg {
  const st = S.settings; let c = st.expressions as Record<string, unknown> | undefined;
  if (!c || typeof c !== 'object' || Array.isArray(c)) c = st.expressions = {};
  for (const [k, v] of Object.entries(DEF)) if (c[k] === undefined) c[k] = v;
  if (!Array.isArray(c.custom)) c.custom = [];
  if (!c.chars || typeof c.chars !== 'object') c.chars = {};
  if (!c.ui || typeof c.ui !== 'object') c.ui = {};
  return c as unknown as ExprCfg;
}
export const save = () => S.set({ expressions: cfg() });
export const charCfg = (id: string) => { const c = cfg(); return (c.chars[id] ||= { n: 0, fallback: '' }); };
export const customOf = (label: string) => cfg().custom.find(x => x.label === label);
/** 화면에 적을 이름: 기쁨 */
export const nameOf = (label: string) => KO[label] || customOf(label)?.name || label;
export const fullName = (label: string) => nameOf(label) === label ? label : `${nameOf(label)} · ${label}`;

// ════════ 표정 그림 보관 (IndexedDB assets 스토어, kind: 'expr', owner: 'expr:캐릭터') ════════
export interface Sprite extends AssetRec { label: string }
const cache = new Map<string, Sprite[]>();   // 캐릭터 id → [{ id, owner, kind, label, name, data, ts }]
export const ownerOf = (id: string) => 'expr:' + id;
const order = (a: Sprite, b: Sprite) => a.label.localeCompare(b.label) || +(b.name === b.label) - +(a.name === a.label) || a.name.localeCompare(b.name, undefined, { numeric: true });
export const Sprites = {
  has: (id: string) => cache.has(id),
  list: (id: string): Sprite[] => cache.get(id) || [],
  of: (id: string, label: string) => (cache.get(id) || []).filter(a => a.label === label),
  labels: (id: string) => [...new Set((cache.get(id) || []).map(a => a.label))],
  async load(ids: string | string[] | undefined) {
    for (const id of ([] as string[]).concat(ids || [])) if (id && !cache.has(id)) { const list = ((await DB.byOwner(ownerOf(id))) as Sprite[]).filter(a => a.kind === 'expr').sort(order); if (!cache.has(id)) cache.set(id, list); }
  },
  note(id: string) { const n = this.list(id).length, cc = charCfg(id); if (cc.n !== n) { cc.n = n; save(); } },
  async put(id: string, label: string, name: string, data: string) {
    await this.load(id);
    const old = this.list(id).find(a => a.label === label && a.name === name);
    const rec: Sprite = { id: old?.id || uid(), owner: ownerOf(id), kind: 'expr', label, name, data, ts: now() };
    await DB.put('assets', rec);
    cache.set(id, [...this.list(id).filter(a => a.id !== rec.id), rec].sort(order));
    return rec;
  },
  async update(id: string, rec: Sprite) { await DB.put('assets', rec); cache.set(id, this.list(id).map(a => a.id === rec.id ? rec : a).sort(order)); },
  async remove(id: string, rec: Sprite) { await DB.del('assets', rec.id); cache.set(id, this.list(id).filter(a => a.id !== rec.id)); this.note(id); },
  async clear(id: string) { for (const a of await DB.byOwner(ownerOf(id))) await DB.del('assets', a.id); cache.set(id, []); this.note(id); },
  /** 캐릭터가 지워졌을 때: 읽어 둔 것을 잊는다 */
  forget(id: string) { cache.delete(id); },
  find(id: string): Sprite | null { for (const list of cache.values()) { const a = list.find(x => x.id === id); if (a) return a; } return null; },
};

/** 알고 있는 모든 감정: 기본 + 사용자 정의 + (그 캐릭터 그림에만 있는 이름) */
export function universe(charId?: string): string[] {
  const out = [...DEFAULT_LABELS];
  for (const c of cfg().custom) if (c.label && !out.includes(c.label)) out.push(c.label);
  if (charId) for (const l of Sprites.labels(charId)) if (!out.includes(l)) out.push(l);
  return out;
}
/** 모델에게 고르게 할 감정 */
export function candidates(charId: string): string[] {
  const have = Sprites.labels(charId);
  if (!cfg().onlyHave) return universe(charId);
  return universe(charId).filter(l => have.includes(l));
}
export const fallbackOf = (charId: string) => { const f = cfg().chars[charId]?.fallback; return f === '#none' ? '' : (f || (cfg().fallback === '#none' ? '' : cfg().fallback) || ''); };
/** 감정 → 보여 줄 그림: 그 감정 → 가까운 감정 → 기본 표정 */
function spritesFor(charId: string, label: string): Sprite[] {
  if (label) {
    const own = Sprites.of(charId, label); if (own.length) return own;
    for (const r of RELATED[label] || []) { const near = Sprites.of(charId, r); if (near.length) return near; }
  }
  const fb = fallbackOf(charId);
  return fb ? Sprites.of(charId, fb) : [];
}
export function pickSprite(charId: string, label: string, seed: string, pickId?: string): Sprite | null {
  const all = Sprites.list(charId); if (!all.length) return null;
  if (pickId) { const p = all.find(a => a.id === pickId); if (p) return p; }
  const list = spritesFor(charId, label); if (!list.length) return null;
  return cfg().multi && list.length > 1 ? list[hashStr(seed) % list.length] : list[0];
}

// ════════ 지금 표정 계산 ════════
export const live = new Map<string, string>();   // 메시지 id → 생성 중에 태그에서 읽은 감정
export const charIdOf = (m: Msg, chat?: ChatX | null) => m.charId || chat?.charIds?.[0] || '';
export const exprOf = (m: Msg) => live.get(m.id) || m.swipes?.[m.sw]?.expr || '';
export interface ExprState { label: string; msg: Msg | null; sprite: Sprite | null }
/** 그 캐릭터의 지금 표정: 마지막 답변의 기록. 아직 없으면(생성 중 · 판정 전) 그 앞 답변의 표정을 잇는다 */
export function currentOf(chat: ChatX, msgs: Msg[], charId: string): ExprState {
  let seen = 0;
  for (let i = msgs.length - 1; i >= 0 && seen < 2; i--) {
    const m = msgs[i]; if (m.role !== 'assistant' || charIdOf(m, chat) !== charId) continue;
    seen++; const label = exprOf(m);
    if (label) return { label, msg: m, sprite: pickSprite(charId, label, m.id + ':' + m.sw, live.has(m.id) ? '' : m.swipes[m.sw]?.exprPick) };
  }
  return { label: '', msg: null, sprite: pickSprite(charId, '', charId) };
}
export const lastReply = (msgs: Msg[], chat: ChatX, charId?: string): Msg | null => { for (let i = msgs.length - 1; i >= 0; i--) if (msgs[i].role === 'assistant' && (!charId || charIdOf(msgs[i], chat) === charId)) return msgs[i]; return null; };

/** 대화 화면 층(stage.ts)이 채워 넣는다 */
export const bus = { sync: () => { }, schedule: () => { } };

// ════════ 기록 ════════
export async function persist(chat: ChatX, msg: Msg) {
  const cur = chatApi.current();
  if (cur.chat?.id === chat.id && cur.msgs.includes(msg)) return chatApi.save();
  const list = await S.msgs(chat.id), m = list.find(x => x.id === msg.id); if (!m) return;
  m.swipes = msg.swipes; m.sw = msg.sw;
  await S.saveMsgs(chat, list);
}
export async function setExpr(chat: ChatX, msg: Msg, label: string, pickId = '') {
  const sw = msg.swipes?.[msg.sw]; if (!sw) return;
  if (label) sw.expr = label; else delete sw.expr;
  if (label && pickId) sw.exprPick = pickId; else delete sw.exprPick;
  live.delete(msg.id);
  await persist(chat, msg); bus.sync();
}

// ════════ 감정 판정 ════════
export const clip = (s: string, n: number) => s.length > n ? s.slice(0, Math.floor(n * 0.35)).trimEnd() + ' … ' + s.slice(-Math.ceil(n * 0.65)).trimStart() : s;
export const byKeyword = (text: string, charId: string) => keywordLabel(text, { labels: cfg().onlyHave ? candidates(charId) : [], custom: cfg().custom }).label;
/** 따로 묻기: 보조 연결로 한 번 호출 */
export async function classify(chat: ChatX, msgs: Msg[], msg: Msg, { signal }: { signal?: AbortSignal } = {}): Promise<string> {
  const c = cfg(), charId = charIdOf(msg, chat), char = S.get('chars', charId);
  const labels = candidates(charId); if (!labels.length) return '';
  const conn = S.helperConn('expr', chat); if (!conn) throw new Error('연결된 API 가 없어요');
  const chars = chat.charIds.map(id => S.get('chars', id)).filter(x => !!x), ctx = makeCtx({ chat, char: char || chars[0], chars, persona: S.persona(chat), msgs });
  if (msg.name && !char) ctx.char = msg.name;
  const sys = macro(String(c.callPrompt || '').trim() || CALL_PROMPT, { ...ctx, vars: {} }).replace(/\{\{labels\}\}/gi, labels.join(', '));
  const idx = msgs.indexOf(msg), n = Math.max(0, Math.min(6, Math.round(+c.callContext) || 0));
  const prev = idx > 0 && n ? msgs.slice(Math.max(0, idx - n), idx).filter(m => !m.hidden && m.role !== 'system').map(m => `${m.role === 'user' ? ctx.user : (m.name || ctx.char)}: ${clip(plainText(msgText(m)), 500)}`) : [];
  const user = (prev.length ? `[Earlier]\n${prev.join('\n\n')}\n\n` : '') + `[Latest reply by ${ctx.char}]\n${clip(plainText(extractTag(msgText(msg)).text), 1800)}`;
  const out = await quickCall(sys, user, { maxTokens: Math.max(16, Math.round(+c.callTokens) || 300), conn, signal });
  const hit = canonLabel(out, labels) || canonLabel(out, universe(charId));
  if (!hit) console.warn('[표정] 답에서 감정을 찾지 못했어요:', out);
  return hit;
}
export const typingIn = (id: string) => document.querySelector(`article.msg[data-id="${id}"] .msg-body .typing`);
/** 대화 모드에서 답변을 한 줄씩 보여 주는 동안에는 저장된 글을 건드리지 않고, 끝난 뒤에 태그를 뗀다 */
export async function stripLater(chat: ChatX, msg: Msg, sw: Swipe) {
  for (let i = 0; i < 240 && typingIn(msg.id); i++) await new Promise(r => setTimeout(r, 250));
  const ex = extractTag(sw.text); if (!ex.found) return;
  sw.text = ex.text; await persist(chat, msg);
}
/** 숨은 태그 지시 (추가 호출 없음) */
export function tagInstruction(char: { id: string; name: string }, ctx?: Record<string, unknown> | null): string {
  const labels = candidates(char.id); if (labels.length < 2) return '';
  return macro(String(cfg().tagPrompt || '').trim() || TAG_PROMPT, { ...(ctx || { char: char.name }), char: char.name }).replace(/\{\{labels\}\}/gi, labels.join(', '));
}
export function toggleStanding(v?: boolean) { const c = cfg(); c.standing = v === undefined ? !c.standing : !!v; save(); bus.sync(); }
