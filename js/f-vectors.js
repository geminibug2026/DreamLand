// ── Dreamland f-vectors: 벡터 검색 — 지난 대화와 로어북을 "뜻"으로 찾아 프롬프트에 싣는다 ──
// 흐름: 메시지를 조각 내어 임베딩해 두고, 최근 메시지를 질의로 삼아 비슷한 조각을 골라 싣는다.
// 임베딩 호출은 답변 직전에 한 번(질의) + 아직 벡터가 없는 조각만큼. 벡터는 kv 저장소의 'vec:<대화 id>' · 'vec:lore' 에 두고 백업에는 넣지 않는다.
// 기본은 꺼짐. 대화 화면에는 X 등록부(before · prompt · loreVec)로만 닿는다.
import { S, DB, h, msgText, on } from './core.js';
import { btn, toast, form } from './ui.js';
import { X } from './hooks.js';
import { activeBooks, tokens } from './engine.js';
import { embedTexts, embedKind, embedModel, cosine, EMBED_KINDS } from './embed.js';
import { chatApi } from './chat.js';

export const VEC_TEMPLATE = 'Past events relevant to the current scene (retrieved from earlier in this chat, oldest first):\n{{text}}';
export const VEC_DEFAULTS = {
  enabled: false, connId: '', kind: 'auto', model: '',
  chat: true, query: 2, insert: 3, protect: 20, threshold: 0.25, chunk: 400, template: '', position: 'depth', depth: 2,
  lore: false, loreAll: false, loreMax: 5, loreThreshold: 0.3,
};
const cfg = () => { const v = S.settings.vectors ||= {}; for (const k in VEC_DEFAULTS) if (v[k] === undefined) v[k] = VEC_DEFAULTS[k]; return v; };
const hash = s => { let a = 0x811c9dc5, b = 0x1b873593; for (let i = 0; i < s.length; i++) { const c = s.charCodeAt(i); a = Math.imul(a ^ c, 0x01000193); b = Math.imul(b ^ c, 0x85ebca6b) + a | 0; } return (a >>> 0).toString(36) + (b >>> 0).toString(36); };
const clean = t => String(t || '').replace(/<[^>]{1,80}>/g, ' ').replace(/\s+\n/g, '\n').trim();

/** 긴 글을 문장 경계에서 size 자 안팎으로 나눈다 */
export function chunkText(text, size = 400) {
  const t = clean(text); if (!t) return []; if (!(size > 0) || t.length <= size * 1.25) return [t];
  const parts = t.split(/(?<=[.!?。！？…”"'\n])\s+/), out = []; let cur = '';
  for (const p of parts) {
    if (cur && cur.length + p.length + 1 > size) { out.push(cur); cur = ''; }
    if (p.length > size * 1.5) { if (cur) { out.push(cur); cur = ''; } for (let i = 0; i < p.length; i += size) out.push(p.slice(i, i + size)); continue; }
    cur = cur ? cur + ' ' + p : p;
  }
  if (cur) out.push(cur);
  return out;
}

// ── 저장 ──
const stores = new Map();   // id → { id, sig, items: { hash: Float32Array } }
async function loadStore(id, sig, peek = false) {
  let st = stores.get(id);
  if (!st) { const raw = await DB.get('kv', id).catch(() => null); st = { id, sig: raw?.sig || '', items: {} }; for (const [k, v] of Object.entries(raw?.items || {})) st.items[k] = v instanceof Float32Array ? v : Float32Array.from(Object.values(v || {})); stores.set(id, st); }
  if (st.sig !== sig) { if (peek) return { id, sig, items: {} }; st.sig = sig; st.items = {}; }   // 임베딩 모델이 바뀌면 처음부터 (상태만 볼 때는 건드리지 않는다)
  return st;
}
const saveStore = st => DB.put('kv', { id: st.id, sig: st.sig, items: st.items });
const sigOf = c => { const conn = S.get('conns', c.connId); return conn ? `${embedKind(conn, c.kind)}:${embedModel(conn, c.kind, c.model)}` : ''; };
const embedOpt = (c, extra = {}) => ({ connId: c.connId, kind: c.kind, model: c.model, ...extra });

/** 조각 목록 [{ key, text }] 의 벡터를 맞춰 둔다 (없는 것만 계산, 사라진 것은 지움). 반환: 새로 계산한 수 */
async function sync(st, pieces, c, { signal, onProgress, prune = true, max = 0 } = {}) {
  const want = new Set(pieces.map(p => p.key)), todo = pieces.filter(p => !st.items[p.key]); let changed = false;
  if (prune) for (const k of Object.keys(st.items)) if (!want.has(k)) { delete st.items[k]; changed = true; }
  if (changed) await saveStore(st);
  // 한 묶음씩 계산하고 그때그때 저장한다: 도중에 끊겨도 한 만큼은 남고, 멈춘 서버에 끝없이 매달리지 않는다
  const work = max > 0 ? todo.slice(-max) : todo; let done = 0;
  for (let i = 0; i < work.length; i += 64) {
    const part = work.slice(i, i + 64), vs = await embedTexts(part.map(p => p.text.slice(0, 6000)), embedOpt(c, { signal, timeoutMs: 30000 }));
    part.forEach((p, k) => { st.items[p.key] = vs[k]; }); done += part.length; await saveStore(st); onProgress?.(done, work.length);
  }
  return done;
}

// ── 지난 대화 ──
function chatPieces(chat, msgs, c) {
  const user = S.persona(chat)?.name || 'User', vis = msgs.filter(m => !m.hidden && m.role !== 'system' && !m.dice), old = vis.slice(0, Math.max(0, vis.length - Math.max(0, +c.protect || 0))), out = [];
  old.forEach((m, n) => { const who = m.role === 'user' ? user : (m.name || 'Character'); chunkText(msgText(m), +c.chunk || 0).forEach((t, k) => out.push({ key: hash(m.id + '|' + k + '|' + t), text: t, who, order: n * 1000 + k, ts: m.ts })); });
  return out;
}
function queryText(msgs, c) { return msgs.filter(m => !m.hidden && m.role !== 'system').slice(-Math.max(1, +c.query || 2)).map(m => clean(msgText(m))).filter(Boolean).join('\n').slice(-4000); }

const hits = new Map();        // 대화 id → { text, n, best }
const loreHits = new Set();    // 이번 턴에 벡터가 깨운 로어북 항목 id
let lastInfo = null;           // 화면에 보여 줄 마지막 검색 결과

function lorePieces(chat, c) {
  const chars = (chat.charIds || []).map(id => S.get('chars', id)).filter(Boolean), books = activeBooks(chat, chars, S.persona(chat)), out = [];
  for (const b of books) for (const e of b.entries || []) { if (e.enabled === false || e.constant || !(e.content || '').trim() || !(c.loreAll || e.vectorized)) continue; const text = clean([e.name, (e.keys || []).join(', '), e.content].filter(Boolean).join('\n')); out.push({ key: e.id + ':' + hash(text), text, id: e.id, name: e.name || (e.keys || [])[0] || '항목' }); }
  return out;
}

/** 로어북 벡터: 고쳐서 낡은 것과, 이제 없는 항목의 것을 치운다 */
function pruneLore(st, lore) {
  const live = new Set(lore.map(p => p.key)), here = new Set(lore.map(p => p.id)), all = new Set(S.lore.flatMap(b => (b.entries || []).map(e => e.id))); let n = 0;
  for (const k of Object.keys(st.items)) { const id = k.includes(':') ? k.slice(0, k.lastIndexOf(':')) : ''; if (!id || !all.has(id) || (here.has(id) && !live.has(k))) { delete st.items[k]; n++; } }
  if (n) saveStore(st).catch(() => { });
}
/** 답변 직전: 벡터를 맞추고 질의로 찾아 둔다 */
async function prepare({ chat, msgs, type }) {
  const c = cfg(); hits.delete(chat?.id); loreHits.clear();
  if (!c.enabled || !chat || !msgs?.length) return;
  if (!S.get('conns', c.connId)) return;
  const qm = (type === 'regen' || type === 'swipe') && msgs[msgs.length - 1]?.role === 'assistant' ? msgs.slice(0, -1) : msgs;   // 다시 쓸 답변은 질의에서 뺀다
  const q = queryText(qm, c); if (q.length < 2) return;
  const sig = sigOf(c), pieces = c.chat ? chatPieces(chat, msgs, c) : [], lore = c.lore ? lorePieces(chat, c) : [];
  if (!pieces.length && !lore.length) return;
  const cst = pieces.length ? await loadStore('vec:' + chat.id, sig) : null, lst = lore.length ? await loadStore('vec:lore', sig) : null;
  const fresh = (cst ? pieces.filter(p => !cst.items[p.key]).length : 0) + (lst ? lore.filter(p => !lst.items[p.key]).length : 0);
  if (fresh > 24) chatApi.setStatus?.(`벡터 만드는 중… ${fresh}조각`);
  // 답변 직전에는 가장 최근 조각 256개까지만 새로 만든다 (나머지는 다음 턴이나 「지금 만들기」에서)
  if (cst) await sync(cst, pieces, c, { max: 256 });
  if (lst) { await sync(lst, lore, c, { prune: false, max: 256 }); pruneLore(lst, lore); }
  const [qv] = await embedTexts([q], embedOpt(c, { query: true, timeoutMs: 20000 }));
  const info = { at: Date.now(), chat: [], lore: [] };
  if (cst) {
    const top = pieces.map(p => ({ p, s: cosine(qv, cst.items[p.key]) })).filter(x => x.s >= (+c.threshold || 0)).sort((a, b) => b.s - a.s).slice(0, Math.max(1, +c.insert || 3));
    if (top.length) { top.sort((a, b) => a.p.order - b.p.order); hits.set(chat.id, { text: top.map(x => `${x.p.who}: ${x.p.text}`).join('\n\n'), n: top.length }); info.chat = top.map(x => ({ who: x.p.who, text: x.p.text, score: x.s })); }
  }
  if (lst) {
    const top = lore.map(p => ({ p, s: cosine(qv, lst.items[p.key]) })).filter(x => x.s >= (+c.loreThreshold || 0)).sort((a, b) => b.s - a.s).slice(0, Math.max(1, +c.loreMax || 5));
    for (const x of top) loreHits.add(x.p.id); info.lore = top.map(x => ({ name: x.p.name, score: x.s }));
  }
  lastInfo = info;
}

X.before = X.before.filter(p => p.owner !== 'vectors');
X.before.push({ owner: 'vectors', fn: async a => { try { await prepare(a); } catch (e) { if (e?.name !== 'AbortError') { console.warn('[벡터 검색]', e); toast('벡터 검색을 건너뛰었어요: ' + String(e.message || e).slice(0, 120), 'err'); } } } });
X.loreVec = id => cfg().enabled && cfg().lore && loreHits.has(id);
X.prompt = X.prompt.filter(p => p.owner !== 'vectors');
X.prompt.push({ owner: 'vectors', fn: ({ chat }) => {
  const c = cfg(), hit = c.enabled && c.chat ? hits.get(chat.id) : null; if (!hit) return [];
  const content = (String(c.template || '').trim() || VEC_TEMPLATE).replace(/\{\{text\}\}/g, hit.text);
  return [c.position === 'before' ? { where: 'before', content, src: '벡터 검색 (지난 대화)' } : { where: 'depth', depth: Math.max(0, +c.depth || 0), order: 55, content, src: '벡터 검색 (지난 대화)' }];
} });

// ── 기능 화면의 탭 ──
function pane() {
  const host = h('div.card.vec-card'), c = cfg(), status = h('div.vec-status');
  const shape = () => JSON.stringify([c.enabled, c.chat, c.lore, c.position, c.connId, c.kind]); let shown = shape();
  const save = () => { S.set({ vectors: S.settings.vectors }); if (shape() !== shown) { shown = shape(); draw(); } else drawStatus().catch(() => { }); };   // 칸이 늘고 주는 변화일 때만 다시 그린다 (입력 중인 칸의 초점을 지킨다)
  const conns = [['', '골라 주세요'], ...S.conns.map(x => [x.id, x.name])];
  const cur = () => chatApi.current();
  const drawStatus = async () => {
    const { chat, msgs } = cur(), conn = S.get('conns', c.connId);
    if (!conn) return status.replaceChildren(h('small.hint', '임베딩에 쓸 연결을 고르면 여기에 상태가 보입니다.'));
    const rows = [h('div', h('span', '임베딩'), h('b', `${EMBED_KINDS[embedKind(conn, c.kind)].split(' — ')[0]} · ${embedModel(conn, c.kind, c.model)}`))];
    if (chat) { const st = await loadStore('vec:' + chat.id, sigOf(c), true), ps = chatPieces(chat, msgs, c), have = ps.filter(p => st.items[p.key]).length; rows.push(h('div', h('span', '열려 있는 대화'), h('b', `조각 ${ps.length}개 중 ${have}개 준비됨`), h('small', `≈${ps.reduce((n, p) => n + tokens(p.text), 0).toLocaleString()} 토큰 분량`))); }
    if (lastInfo && (lastInfo.chat.length || lastInfo.lore.length)) rows.push(h('div.vec-last', h('span', '마지막 검색'), h('div', ...lastInfo.chat.map(x => h('p', h('em', x.score.toFixed(2)), `${x.who}: ${x.text.slice(0, 110)}${x.text.length > 110 ? '…' : ''}`)), ...lastInfo.lore.map(x => h('p', h('em', x.score.toFixed(2)), `로어북 · ${x.name}`)))));
    status.replaceChildren(...rows);
  };
  const busy = async (el, fn) => { const t = el.textContent; el.disabled = true; try { await fn(el); } catch (e) { toast(String(e.message || e).slice(0, 200), 'err'); } el.disabled = false; el.textContent = t; drawStatus(); };
  const draw = () => {
    host.replaceChildren(
      h('p.hint', '지난 대화와 로어북을 낱말이 아니라 뜻으로 찾아 프롬프트에 싣습니다. 켜 두면 답변마다 임베딩 호출이 1회 더 나가고, 처음 한 번은 지난 메시지만큼 더 나갑니다. 임베딩은 채팅 모델보다 훨씬 싸지만 공짜는 아니에요.'),
      form(S.settings, [
        { k: 'vectors.enabled', label: '벡터 검색 쓰기', type: 'check', live: true },
        c.enabled && { section: '임베딩' },
        c.enabled && { k: 'vectors.connId', label: '임베딩에 쓸 연결', type: 'select', opts: conns, half: true, live: true, hint: '이 연결의 주소와 키를 빌려 씁니다.' },
        c.enabled && { k: 'vectors.kind', label: '방식', type: 'select', opts: Object.entries(EMBED_KINDS), half: true, live: true },
        c.enabled && { k: 'vectors.model', label: '임베딩 모델', ph: S.get('conns', c.connId) ? embedModel(S.get('conns', c.connId), c.kind, '') : 'text-embedding-3-small', half: true, hint: '비우면 방식의 기본 모델. 모델을 바꾸면 벡터를 처음부터 다시 만듭니다.' },
        c.enabled && { section: '지난 대화' },
        c.enabled && { k: 'vectors.chat', label: '지난 대화에서 비슷한 대목을 찾아 싣기', type: 'check', live: true },
        c.enabled && c.chat && { k: 'vectors.insert', label: '한 번에 실을 조각 수', type: 'num', min: 1, max: 20, third: true },
        c.enabled && c.chat && { k: 'vectors.query', label: '질의로 쓸 최근 메시지 수', type: 'num', min: 1, max: 10, third: true },
        c.enabled && c.chat && { k: 'vectors.protect', label: '최근 몇 개는 찾지 않기', type: 'num', min: 0, max: 500, third: true, hint: '어차피 프롬프트에 들어가는 최근 메시지는 건너뜁니다.' },
        c.enabled && c.chat && { k: 'vectors.threshold', label: '유사도 문턱', type: 'num', min: 0, max: 1, step: 0.01, third: true, hint: '이보다 덜 비슷하면 싣지 않습니다.' },
        c.enabled && c.chat && { k: 'vectors.chunk', label: '조각 크기 (글자)', type: 'num', min: 0, max: 4000, step: 50, third: true, hint: '긴 메시지를 이 크기로 나눕니다. 0 = 나누지 않음.' },
        c.enabled && c.chat && { k: 'vectors.position', label: '싣는 자리', type: 'select', opts: [['depth', '대화 기록 사이 (깊이)'], ['before', '대화 기록 앞']], third: true, live: true },
        c.enabled && c.chat && c.position !== 'before' && { k: 'vectors.depth', label: '깊이 (끝에서 몇 번째 앞)', type: 'num', min: 0, max: 100, third: true },
        c.enabled && c.chat && { k: 'vectors.template', label: '싣는 글의 틀', type: 'area', rows: 3, ph: VEC_TEMPLATE, hint: '{{text}} 자리에 찾은 대목이 들어갑니다. 비워 두면 기본 문장을 씁니다.' },
        c.enabled && { section: '로어북' },
        c.enabled && { k: 'vectors.lore', label: '로어북 항목을 뜻으로 깨우기', type: 'check', live: true, hint: '항목 편집의 "벡터로 발동"을 켠 항목이 대상입니다. 키워드 발동은 그대로 함께 움직여요.' },
        c.enabled && c.lore && { k: 'vectors.loreAll', label: '표시하지 않은 항목도 모두 대상으로', type: 'check' },
        c.enabled && c.lore && { k: 'vectors.loreMax', label: '한 번에 깨울 항목 수', type: 'num', min: 1, max: 30, third: true },
        c.enabled && c.lore && { k: 'vectors.loreThreshold', label: '유사도 문턱', type: 'num', min: 0, max: 1, step: 0.01, third: true },
      ].filter(Boolean), save),
      c.enabled ? h('div.row.wrap',
        btn('연결 시험', { ic: 'plug', cls: 'ghost', onclick: e => busy(e.currentTarget, async () => { const [v] = await embedTexts(['connection test'], embedOpt(c, { timeoutMs: 20000 })); toast(v?.length ? `임베딩 연결 성공 (${v.length}차원)` : '응답이 비어 있어요', v?.length ? 'ok' : 'err'); }) }),
        btn('이 대화 벡터 지금 만들기', { ic: 'sparkle', cls: 'ghost', title: '열려 있는 대화의 지난 메시지를 미리 임베딩해 둡니다. 하지 않아도 답변 직전에 자동으로 만듭니다.', onclick: e => busy(e.currentTarget, async el => { const { chat, msgs } = cur(); if (!chat) return toast('열려 있는 대화가 없어요'); const st = await loadStore('vec:' + chat.id, sigOf(c)); const n = await sync(st, chatPieces(chat, msgs, c), c, { onProgress: (d, t) => { el.textContent = `${d} / ${t}`; } }); toast(n ? `조각 ${n}개의 벡터를 만들었어요.` : '이미 모두 준비되어 있어요.', 'ok'); }) }),
        btn('이 대화 벡터 지우기', { ic: 'trash', cls: 'ghost', onclick: e => busy(e.currentTarget, async () => { const { chat } = cur(); if (!chat) return; stores.delete('vec:' + chat.id); await DB.del('kv', 'vec:' + chat.id); hits.delete(chat.id); toast('이 대화의 벡터를 지웠어요.'); }) })) : null,
      c.enabled ? status : null);
    if (c.enabled) drawStatus().catch(() => { });
  };
  draw();
  return host;
}
X.studio = X.studio.filter(t => t.owner !== 'vectors');
X.studio.push({ owner: 'vectors', title: '벡터 검색', render: pane });

on('chat:deleted', id => { stores.delete('vec:' + id); hits.delete(id); });
on('data:imported', () => stores.clear());
