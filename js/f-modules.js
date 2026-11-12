// ── Dreamland 모듈: 로어북 · 정규식 · 에셋 · 빠른 버튼 · CSS 조각을 한 묶음으로 켜고 끄고, 파일 하나로 주고받는다 ──
// 엔진은 건드리지 않는다. 모듈이 켜지면 기존 켜짐 장치(전역 로어북 목록 · 정규식의 enabled · 빠른 버튼 목록)를 대신 눌러 주고,
// 무엇을 모듈이 켰는지 S.settings.modules.applied 에 적어 둔다. 끌 때는 적어 둔 것만 되돌리므로 사용자가 따로 켜 둔 것은 그대로 남는다.
// 모듈 목록은 kv 저장소의 'modules' 한 줄, 모듈의 에셋은 assets 저장소의 'module:<id>' 보관함에 둔다.
import { S, DB, h, uid, now, on, download, pickFiles, debounce, fmtTime, newLore, newEntry, newRegex } from './core.js';
import { icon, btn, iconBtn, toast, modal, menu, confirmBox, promptBox, registerPage, go, route, pageHead, avatar, charPicker, form } from './ui.js';
import { X } from './hooks.js';
import { Assets } from './assets.js';
import { chatApi } from './chat.js';
import { worldToLore, stRegexToRegex } from './cards.js';

const HAS_DOM = typeof document !== 'undefined';
if (HAS_DOM) document.head.append(h('link', { rel: 'stylesheet', href: 'css/modules.css' }));

// ════════ 저장 ════════
const KEY = 'modules', FILE_APP = 'dreamland-module', FILE_VERSION = 1;
const store = { list: [], ready: null, loaded: false };
const plain = v => !!v && typeof v === 'object' && !Array.isArray(v);
const list = v => Array.isArray(v) ? v : [];
const text = (v, max = 400000) => (typeof v === 'string' ? v : v == null ? '' : typeof v === 'object' ? '' : String(v)).slice(0, max);
const ids = v => [...new Set(list(v).filter(x => typeof x === 'string' && x))];

export const newModule = (o = {}) => ({
  id: uid(), name: '새 모듈', description: '', author: '', version: '1.0', on: false,
  scope: 'global', charIds: [], chatIds: [], rooms: {},          // rooms: 장면 패널에서 방마다 따로 켜고 끈 기록 { 대화 id: true|false }
  lore: [], regex: [], quick: [], css: '', cssOn: false, assetCount: 0, imported: false, createdAt: now(), updatedAt: now(), ...o,
});
function norm(m) {
  const d = newModule({ id: text(m?.id, 80) || uid() }), s = plain(m) ? m : {};
  return {
    ...d, name: text(s.name, 120).trim() || d.name, description: text(s.description, 4000), author: text(s.author, 120), version: text(s.version, 40),
    on: s.on === true, scope: ['global', 'char', 'chat'].includes(s.scope) ? s.scope : 'global', charIds: ids(s.charIds), chatIds: ids(s.chatIds),
    rooms: plain(s.rooms) ? Object.fromEntries(Object.entries(s.rooms).filter(([, v]) => typeof v === 'boolean')) : {},
    lore: ids(s.lore), regex: ids(s.regex), quick: cleanQuick(s.quick), css: text(s.css, 200000), cssOn: s.cssOn === true,
    assetCount: Math.max(0, +s.assetCount || 0), imported: s.imported === true, createdAt: +s.createdAt || d.createdAt, updatedAt: +s.updatedAt || d.updatedAt,
  };
}
function cleanQuick(v) { return list(v).map(q => ({ label: text(q?.label, 60).trim(), text: text(q?.text, 4000) })).filter(q => q.label || q.text).slice(0, 60); }

const load = () => store.ready ||= (async () => { const r = await DB.get('kv', KEY); store.list = list(r?.list).map(norm); store.loaded = true; })();
const persist = () => DB.put('kv', { id: KEY, v: 1, list: store.list });
const touch = m => { m.updatedAt = now(); return persist(); };
const byId = id => store.list.find(m => m.id === id);
const ownerOf = m => 'module:' + (m.id || m);
/** 모듈이 켠 것의 기록. activeLore · quick 과 같은 설정 한 줄에 함께 저장된다 */
function cfg() {
  const c = plain(S.settings.modules) ? S.settings.modules : (S.settings.modules = {});
  const a = plain(c.applied) ? c.applied : (c.applied = {});
  if (!plain(a.lore)) a.lore = {}; if (!plain(a.regex)) a.regex = {}; if (!Array.isArray(a.quick)) a.quick = [];
  return c;
}

// ════════ 켜짐 판단 ════════
const SCOPES = [['global', '전역'], ['char', '캐릭터'], ['chat', '대화방']];
const covers = (m, chat) => m.scope === 'global' || (!!chat && (m.scope === 'char' ? list(chat.charIds).some(i => m.charIds.includes(i)) : m.chatIds.includes(chat.id)));
const baseOn = (m, chat) => m.on && covers(m, chat);
/** 이 대화에서 모듈이 실제로 켜져 있는가. 방마다 따로 정한 것이 있으면 그것이 먼저 */
const effective = (m, chat) => chat && Object.hasOwn(m.rooms, chat.id) ? m.rooms[chat.id] : baseOn(m, chat);
const booksOf = m => m.lore.map(id => S.get('lore', id)).filter(Boolean);
const regexOf = m => m.regex.map(id => S.get('regex', id)).filter(Boolean);
const counts = m => ({ lore: booksOf(m).length, regex: regexOf(m).length, assets: m.assetCount || 0, quick: m.quick.length, css: !!m.css.trim() });

let room = null;          // 지금 열어 둔 대화 id (대화 화면을 떠나면 비운다)
let live = [];            // 지금 켜져 있는 모듈
let liveOwners = [];      // 그중 에셋이 든 모듈의 보관함
let assetSig = '';
const roomChat = () => (room && S.get('chats', room)) || null;
const sameList = (a, b) => a.length === b.length && a.every((x, i) => x === b[i]);
const qkey = q => q.label + '\u0001' + q.text;

/** 바라는 상태와 적어 둔 기록을 맞춘다. 바뀐 것을 돌려준다 */
async function reconcile(chat) {
  const act = store.list.filter(m => effective(m, chat));
  const c = cfg(), ap = c.applied, out = { lore: false, regex: false, quick: false, act };

  // 로어북: 전역 활성 목록
  const wantLore = new Map();
  for (const m of act) for (const b of booksOf(m)) (wantLore.get(b.id) || wantLore.set(b.id, []).get(b.id)).push(m.id);
  let active = list(S.settings.activeLore).slice();
  for (const [id, mids] of wantLore) {
    if (ap.lore[id]) { if (!sameList(list(ap.lore[id]), mids)) { ap.lore[id] = mids; out.lore = true; } continue; }   // 이미 모듈이 켠 것 (사용자가 그 뒤에 직접 껐다면 그대로 둔다)
    if (active.includes(id)) continue;                                                                             // 사용자가 직접 켜 둔 것 → 기록하지 않는다
    active.push(id); ap.lore[id] = mids; out.lore = true;
  }
  for (const id of Object.keys(ap.lore)) if (!wantLore.has(id)) { active = active.filter(x => x !== id); delete ap.lore[id]; out.lore = true; }

  // 정규식: enabled
  const wantRe = new Map(), saveRe = [];
  for (const m of act) for (const r of regexOf(m)) (wantRe.get(r.id) || wantRe.set(r.id, []).get(r.id)).push(m.id);
  for (const [id, mids] of wantRe) {
    if (ap.regex[id]) { if (!sameList(list(ap.regex[id]), mids)) { ap.regex[id] = mids; out.regex = true; } continue; }
    const r = S.get('regex', id); if (r.enabled) continue;
    r.enabled = true; saveRe.push(r); ap.regex[id] = mids; out.regex = true;
  }
  for (const id of Object.keys(ap.regex)) if (!wantRe.has(id)) { const r = S.get('regex', id); if (r?.enabled) { r.enabled = false; saveRe.push(r); } delete ap.regex[id]; out.regex = true; }

  // 빠른 버튼
  let quick = list(S.settings.quick).slice();
  const wantQ = []; for (const m of act) for (const q of m.quick) if (q.label && q.text && !wantQ.some(w => w.mid === m.id && qkey(w) === qkey(q))) wantQ.push({ mid: m.id, label: q.label, text: q.text });
  ap.quick = ap.quick.filter(a => {
    if (wantQ.some(w => w.mid === a.mid && qkey(w) === qkey(a))) return true;
    const i = quick.findIndex(q => qkey(q) === qkey(a)); if (i >= 0) quick.splice(i, 1);
    out.quick = true; return false;
  });
  for (const w of wantQ) {
    if (ap.quick.some(a => a.mid === w.mid && qkey(a) === qkey(w))) continue;
    if (quick.some(q => qkey(q) === qkey(w))) continue;        // 같은 버튼이 이미 있다 (사용자 것이거나 다른 모듈 것)
    quick.push({ label: w.label, text: w.text }); ap.quick.push(w); out.quick = true;
  }

  for (const r of saveRe) await S.save('regex', r, true);
  if (out.lore || out.quick || out.regex) S.set({ ...(out.lore ? { activeLore: active } : {}), ...(out.quick ? { quick } : {}), modules: c });
  return out;
}

/** 바깥 주소를 부르지 못하게 다듬은 CSS */
export function safeCss(css) {
  const src = String(css || '').replace(/\/\*[\s\S]*?(?:\*\/|$)/g, '');
  let s = '', quote = '';
  for (let i = 0; i < src.length; i++) {      // 따옴표 밖의 역슬래시(u\72l 같은 숨김 표기)는 걷어 낸다
    const ch = src[i];
    if (quote) { if (ch === '\\' && i + 1 < src.length && src[i + 1] !== '\n') { s += ch + src[++i]; continue; } if (ch === quote || ch === '\n') quote = ''; s += ch; }
    else if (ch === '"' || ch === "'") { quote = ch; s += ch; }
    else if (ch !== '\\') s += ch;
  }
  return s.replace(/@import\b[^;]*;?/gi, '').replace(/url\(\s*(?!["']?\s*data:)[^)]*\)/gi, 'url("data:,")').replace(/(?:-webkit-)?image-set\s*\(/gi, 'none(').replace(/<\/?style/gi, '');
}
function applyCss(act) {
  if (!HAS_DOM) return;
  let el = document.getElementById('module-css');
  const css = act.filter(m => m.cssOn && m.css.trim()).map(m => `/* ${m.name.replace(/\*\//g, '')} */\n${safeCss(m.css)}`).join('\n');
  if (!css) { el?.remove(); return; }
  if (!el) { el = document.createElement('style'); el.id = 'module-css'; document.head.append(el); }
  if (el.textContent !== css) el.textContent = css;
}

let chain = Promise.resolve();
/** 지금 상황(열린 대화 · 스위치)에 맞게 켜고 끈다. 겹쳐 불려도 차례대로 처리한다 */
function sync() {
  const run = async () => {
    await load();
    const r = await reconcile(roomChat());
    live = r.act;
    const owners = live.filter(m => m.assetCount > 0).map(ownerOf);
    await Assets.load(owners);
    liveOwners = owners.filter(o => Assets.list(o).length);
    const sig = liveOwners.join('|'), assetsChanged = sig !== assetSig; assetSig = sig;
    applyCss(live);
    if (HAS_DOM && route.page === 'chat') {
      if (r.quick) patchQuick();
      if ((r.regex || r.lore || assetsChanged) && !chatApi.current().busy) chatApi.redraw();
    }
    return r;
  };
  return chain = chain.then(run, run).catch(e => { console.warn('[모듈]', e); });
}
const enter = chatId => { room = chatId || null; return sync(); };
const leave = () => { room = null; return sync(); };

/** 대화 화면의 빠른 버튼 줄을 지금 목록대로 다시 그린다 (대화 화면은 설정이 바뀌어도 이 줄을 다시 그리지 않는다) */
function patchQuick() {
  const box = document.querySelector('.composer .quick'); if (!box) return;
  box.querySelectorAll('button.chip:not(.scene-chip)').forEach(b => b.remove());
  const first = box.firstChild;
  for (const q of list(S.settings.quick)) box.insertBefore(h('button.chip', { type: 'button', onclick: () => runQuick(q.text) }, q.label), first);
}
function runQuick(t) {
  const inp = document.querySelector('.composer textarea'); if (!inp) return;
  if (t.startsWith('/')) { const keep = inp.value; chatApi.send(t); inp.value = keep; inp.dispatchEvent(new Event('input')); }
  else { inp.value = (inp.value ? inp.value + ' ' : '') + t; inp.dispatchEvent(new Event('input')); inp.focus(); }
}

// ── 항목 하나의 상태 ──
// mod: 모듈이 켬 · muted: 모듈이 켰지만 사용자가 직접 끔 · user: 사용자가 직접 켜 둠(모듈 스위치와 무관) · off: 꺼짐
const loreState = id => { const on = list(S.settings.activeLore).includes(id); return cfg().applied.lore[id] ? (on ? 'mod' : 'muted') : on ? 'user' : 'off'; };
const regexState = r => cfg().applied.regex[r.id] ? (r.enabled ? 'mod' : 'muted') : r.enabled ? 'user' : 'off';
/** 직접 켜 둔 것을 모듈 스위치에 맡긴다: 사용자 스위치를 내리고, 모듈이 켜져 있으면 모듈이 다시 켠다 */
async function handOver(kind, id) {
  if (kind === 'lore') S.set({ activeLore: list(S.settings.activeLore).filter(x => x !== id) });
  else { const r = S.get('regex', id); if (r) { r.enabled = false; await S.save('regex', r, true); } }
  return sync();
}
/** 직접 꺼 둔 것을 다시 모듈에 맞춘다 */
async function wake(kind, id) {
  const ap = cfg().applied; delete ap[kind][id]; S.set({ modules: cfg() });
  return sync();
}

// ── 방마다 따로 ──
function setRoom(m, chat, want) {
  if (m.scope === 'chat' && !Object.hasOwn(m.rooms, chat.id) && m.on) {       // 대화방 범위 모듈은 방 목록 자체를 고친다
    m.chatIds = want ? [...new Set([...m.chatIds, chat.id])] : m.chatIds.filter(i => i !== chat.id);
  } else if (want === baseOn(m, chat)) delete m.rooms[chat.id];
  else m.rooms[chat.id] = want;
  return touch(m).then(sync);
}

// ════════ 만들기 · 지우기 · 복제 ════════
const uniqueName = (name, skip) => { const taken = new Set(store.list.filter(m => m !== skip).map(m => m.name)); if (!taken.has(name)) return name; let n = 2; while (taken.has(`${name} (${n})`)) n++; return `${name} (${n})`; };
async function create(o = {}) { await load(); const m = newModule({ ...o, name: uniqueName(o.name || '새 모듈') }); store.list.push(m); await persist(); return m; }
/** 이 모듈과 함께 들어왔고 다른 모듈이 쓰지 않는 항목 */
function ownItems(m) {
  const used = (key, id) => store.list.some(o => o !== m && o[key].includes(id));
  return { lore: booksOf(m).filter(b => b.mod === m.id && !used('lore', b.id)), regex: regexOf(m).filter(r => r.mod === m.id && !used('regex', r.id)) };
}
async function remove(m, { withItems = false } = {}) {
  await load();
  const own = withItems ? ownItems(m) : { lore: [], regex: [] };
  store.list = store.list.filter(x => x !== m);
  await persist(); await sync();                    // 먼저 모듈이 켰던 것을 되돌린다
  await Assets.removeOwner(ownerOf(m));
  for (const b of own.lore) { await S.remove('lore', b.id); if (list(S.settings.activeLore).includes(b.id)) S.set({ activeLore: S.settings.activeLore.filter(i => i !== b.id) }); }
  for (const r of own.regex) await S.remove('regex', r.id);
}
async function duplicate(m) {
  const copy = await create({ ...JSON.parse(JSON.stringify(m)), id: uid(), name: m.name, on: false, rooms: {}, createdAt: now(), updatedAt: now() });
  await Assets.load([ownerOf(m)]);
  for (const a of Assets.list(ownerOf(m))) await Assets.add(ownerOf(copy), a.name, a.data);
  copy.assetCount = Assets.list(ownerOf(copy)).length; await persist();
  return copy;
}

// ════════ 파일: 내보내기 ════════
const strip = (o, keys) => { const c = JSON.parse(JSON.stringify(o)); for (const k of keys) delete c[k]; return c; };
/** 모듈 하나를 자급 파일 내용으로. 담긴 로어북 · 정규식 · 에셋(data URL)을 통째로 넣는다 */
async function pack(m) {
  await Assets.load([ownerOf(m)]);
  return {
    app: FILE_APP, version: FILE_VERSION, exportedAt: new Date().toISOString(),
    module: { name: m.name, description: m.description, author: m.author, version: m.version, quick: m.quick.map(q => ({ label: q.label, text: q.text })), css: m.css },
    lore: booksOf(m).map(b => ({ ...strip(b, ['id', 'createdAt', 'updatedAt', 'mod']), entries: list(b.entries).map(e => strip(e, ['id'])) })),
    regex: regexOf(m).map(r => ({ ...strip(r, ['id', 'createdAt', 'updatedAt', 'mod', 'enabled']), scope: 'global' })),     // 캐릭터 id 는 다른 곳에서 뜻이 없다
    assets: Assets.list(ownerOf(m)).map(a => ({ name: a.name, data: a.data })),
  };
}
const fileName = m => (m.name.replace(/[\\/:*?"<>|\u0000-\u001f]+/g, ' ').trim() || 'module') + '.dreamland-module.json';
async function exportModule(m) { download(fileName(m), JSON.stringify(await pack(m), null, 1)); }

// ════════ 파일: 읽기 (가져온 파일은 믿을 수 없는 데이터 — 아는 칸만, 형을 맞춰서 옮긴다) ════════
const IMG_DATA = /^data:image\/(?:png|jpeg|jpg|webp|gif|avif);base64,[A-Za-z0-9+/=\s]+$/;
const BAD_KEYS = new Set(['__proto__', 'constructor', 'prototype', 'id', 'mod', 'createdAt', 'updatedAt']);
const prim = v => v === null || ['string', 'number', 'boolean'].includes(typeof v);
/** 모르는 칸은 단순한 값(글 · 수 · 참거짓 · 그 목록)만 남긴다. 나중에 생긴 옵션이 왕복에서 사라지지 않게 */
function plainFields(o) {
  const out = {};
  for (const [k, v] of Object.entries(plain(o) ? o : {})) {
    if (BAD_KEYS.has(k)) continue;
    if (prim(v)) out[k] = typeof v === 'string' ? v.slice(0, 400000) : v;
    else if (Array.isArray(v) && v.length <= 500 && v.every(prim)) out[k] = v.map(x => typeof x === 'string' ? x.slice(0, 4000) : x);
  }
  return out;
}
const numOr = (v, d) => v !== '' && v != null && Number.isFinite(+v) ? +v : d;
const strList = v => list(typeof v === 'string' ? [v] : v).filter(prim).map(x => text(x, 4000)).filter(Boolean).slice(0, 500);
const POSITIONS = ['before', 'after', 'an_top', 'an_bottom', 'em_top', 'em_bottom', 'depth', 'outlet'], ROLES = ['system', 'user', 'assistant'], MODES = ['store', 'display', 'prompt', 'both'];
function cleanEntry(e) {
  const x = plainFields(e);
  return newEntry({
    ...x, name: text(x.name, 300), keys: strList(e?.keys), keys2: strList(e?.keys2), logic: [0, 1, 2, 3].includes(+x.logic) ? +x.logic : 0, content: text(x.content),
    constant: x.constant === true, enabled: x.enabled !== false, position: POSITIONS.includes(x.position) ? x.position : 'before', depth: numOr(x.depth, 4), role: ROLES.includes(x.role) ? x.role : 'system',
    order: numOr(x.order, 100), probability: Math.min(100, Math.max(0, numOr(x.probability, 100))), caseSensitive: typeof x.caseSensitive === 'boolean' ? x.caseSensitive : null, wholeWord: typeof x.wholeWord === 'boolean' ? x.wholeWord : null, useRegex: x.useRegex === true, noRecurse: x.noRecurse === true,
    outlet: text(x.outlet, 120), group: text(x.group, 120), sticky: numOr(x.sticky, null), cooldown: numOr(x.cooldown, null), delay: numOr(x.delay, null), scanDepth: numOr(x.scanDepth, null),
  });
}
function cleanBook(b, fallback = '로어북') {
  const x = plainFields(b);
  return { ...x, name: text(x.name, 120).trim() || fallback, description: text(x.description, 4000), scanDepth: Math.max(0, numOr(x.scanDepth, 4)), tokenBudget: Math.max(0, numOr(x.tokenBudget, 2048)), recursive: x.recursive === true, entries: list(b?.entries).filter(plain).slice(0, 5000).map(cleanEntry) };
}
function cleanRegex(r) {
  const x = plainFields(r);
  return { ...x, name: text(x.name, 120).trim() || '정규식', find: text(x.find, 20000), replace: text(x.replace, 200000), trim: strList(r?.trim), onUser: x.onUser === true, onAI: x.onAI !== false, mode: MODES.includes(x.mode) ? x.mode : 'display', minDepth: numOr(x.minDepth, null), maxDepth: numOr(x.maxDepth, null), scope: 'global', enabled: false };
}
function cleanAssets(v, notes) {
  const out = [], seen = new Set(); let bad = 0;
  for (const a of list(v).slice(0, 2000)) {
    const name = Assets.cleanName(text(a?.name, 120)), data = typeof a?.data === 'string' ? a.data : '';
    if (!name || seen.has(name) || data.length > 12e6 || !IMG_DATA.test(data)) { bad++; continue; }
    seen.add(name); out.push({ name, data });
  }
  if (bad) notes.push(`그림 ${bad}장은 이름이 없거나 겹치거나, 그림 데이터가 아니어서 뺐어요.`);
  return out;
}

// 다른 프런트엔드(네 번째 참고 리포)의 모듈 파일: 로어북과 정규식만 옮긴다
const foreignModule = j => plain(j) && typeof j.type === 'string' && /module$/i.test(j.type) && j.app !== FILE_APP && (plain(j.module) || typeof j.name === 'string');
const foreignLoreList = v => Array.isArray(v) && v.some(e => plain(e) && 'content' in e && ('key' in e || 'insertorder' in e || 'alwaysActive' in e));
function foreignLore(entries, name, notes) {
  let folders = 0;
  const out = [];
  for (const e of list(entries).filter(plain).slice(0, 5000)) {
    if (e.mode === 'folder') { folders++; continue; }
    const split = s => text(s, 20000).split(',').map(x => x.trim()).filter(Boolean);
    const ext = plain(e.extentions) ? e.extentions : plain(e.extensions) ? e.extensions : {};
    out.push(newEntry({
      name: text(e.comment, 300), keys: e.useRegex ? [text(e.key, 20000)].filter(Boolean) : split(e.key), keys2: e.selective ? split(e.secondkey) : [], content: text(e.content),
      constant: e.alwaysActive === true, order: numOr(e.insertorder, 100), probability: Math.min(100, Math.max(0, numOr(e.activationPercent, 100))), useRegex: e.useRegex === true,
      caseSensitive: Object.entries(ext).some(([k, v]) => /case_sensitive$/i.test(k) && v === true),
    }));
  }
  if (folders) notes.push(`로어북 폴더 ${folders}개는 풀어서 한 권에 담았어요.`);
  if (out.some(e => /^@@|\{\{#|\{\{\/|<\?/m.test(e.content))) notes.push('로어북 내용에 든 그 프런트엔드 고유 문법(@@ 지시자 · 조건 블록)은 풀지 않고 글자 그대로 남겼어요.');
  return out.length ? [{ name, description: '', scanDepth: 4, tokenBudget: 2048, recursive: false, entries: out }] : [];
}
function foreignRegex(scripts, notes) {
  const out = []; let special = 0, flagged = 0;
  for (const s of list(scripts).filter(plain).slice(0, 2000)) {
    const find = text(s.in, 20000), rep = text(s.out, 200000); if (!find) continue;
    if (/^@@/.test(rep)) { special++; continue; }
    let flags = s.ableFlag && typeof s.flag === 'string' ? s.flag : 'g';
    if (/</.test(flags)) { flagged++; flags = flags.replace(/<[^>]*>/g, ''); }
    flags = [...new Set(flags.replace(/[^dgimsuvy]/g, ''))].join('') || 'u';
    const type = text(s.type, 40);
    const where = type === 'editinput' ? { onUser: true, onAI: false, mode: 'store' } : type === 'editoutput' ? { onUser: false, onAI: true, mode: 'store' } : type === 'editprocess' ? { onUser: true, onAI: true, mode: 'prompt' } : { onUser: true, onAI: true, mode: 'display' };
    out.push({ name: text(s.comment, 120).trim() || '정규식', find: `/${find}/${flags}`, replace: rep, trim: [], minDepth: null, maxDepth: null, scope: 'global', enabled: false, ...where });
  }
  if (special) notes.push(`화면을 조작하는 특수 정규식(@@ 로 시작하는 바꾸기) ${special}개는 가져오지 않았어요.`);
  if (flagged) notes.push(`정규식 ${flagged}개의 특수 표시(순서 · 조건 등)는 떼고 일반 플래그만 남겼어요.`);
  return out;
}

/** 파일 내용 → 가져오기 계획 { source, module, lore, regex, assets, notes }. 모듈로 읽을 수 없으면 오류를 던진다 */
export function readPack(j, base = '') {
  const notes = [], title = text(base, 120).replace(/\.[^.]+$/, '').replace(/\.dreamland-module$/i, '').trim();
  const meta = (o, fallback) => ({ name: text(o?.name, 120).trim() || fallback || title || '가져온 모듈', description: text(o?.description, 4000), author: text(o?.author ?? o?.creator, 120), version: text(o?.version, 40), quick: [], css: '' });
  if (plain(j) && j.app === FILE_APP) {
    if (+j.version > FILE_VERSION) notes.push('더 새로운 드림랜드에서 만든 파일이에요. 모르는 내용은 건너뜁니다.');
    const m = meta(j.module); m.quick = cleanQuick(j.module?.quick); m.css = text(j.module?.css, 200000);
    return { source: '드림랜드 모듈 파일', module: m, lore: list(j.lore).filter(plain).slice(0, 200).map((b, i) => cleanBook(b, `${m.name} 로어북 ${i + 1}`)), regex: list(j.regex).filter(plain).slice(0, 2000).map(cleanRegex), assets: cleanAssets(j.assets, notes), notes };
  }
  if (foreignModule(j)) {
    const src = plain(j.module) ? j.module : j, m = meta(src);
    const lore = foreignLore(src.lorebook, m.name, notes), regex = foreignRegex(src.regex, notes);
    const skipped = [[list(src.trigger).length, n => `트리거 스크립트 ${n}개`], [text(src.cjs).trim() ? 1 : 0, () => '자바스크립트 코드'], [text(src.backgroundEmbedding).trim() ? 1 : 0, () => '배경에 끼워 넣는 HTML'], [text(src.customModuleToggle).trim() ? 1 : 0, () => '사용자 토글 정의'], [plain(src.mcp) ? 1 : 0, () => '외부 도구 서버 연결'], [src.lowLevelAccess ? 1 : 0, () => '저수준 접근 권한']].filter(([n]) => n).map(([n, f]) => f(n));
    if (skipped.length) notes.push(`실행되는 코드와 권한은 가져오지 않았어요: ${skipped.join(' · ')}.`);
    const pics = list(src.assets).filter(Array.isArray), assets = cleanAssets(pics.map(a => ({ name: a[0], data: a[1] })), []);
    if (pics.length > assets.length) notes.push(`에셋 ${pics.length - assets.length}개는 이 파일에 그림 데이터가 들어 있지 않아 가져오지 못했어요.`);
    return { source: '다른 프런트엔드의 모듈 파일 · 로어북과 정규식만 옮깁니다', module: m, lore, regex, assets, notes };
  }
  if (plain(j) && foreignLoreList(j.data)) { const m = meta(j, title || '가져온 로어북'); return { source: '로어북 파일 · 모듈 하나로 감쌉니다', module: m, lore: foreignLore(j.data, m.name, notes), regex: [], assets: [], notes }; }
  if (plain(j) && j.type === 'regex' && Array.isArray(j.data)) { const m = meta(j, title || '가져온 정규식'); return { source: '정규식 파일 · 모듈 하나로 감쌉니다', module: m, lore: [], regex: foreignRegex(j.data, notes), assets: [], notes }; }
  if (plain(j) && plain(j.entries) || (plain(j) && Array.isArray(j.entries) && j.entries.length)) {
    const b = worldToLore(j, title || '로어북'), m = meta({ name: b.name, description: b.description });
    return { source: '실리태번 로어북 파일 · 모듈 하나로 감쌉니다', module: m, lore: [cleanBook(b, m.name)], regex: [], assets: [], notes };
  }
  const scripts = (Array.isArray(j) ? j : [j]).filter(r => plain(r) && typeof r.findRegex === 'string');
  if (scripts.length) return { source: '실리태번 정규식 파일 · 모듈 하나로 감쌉니다', module: meta({}, title || '가져온 정규식'), lore: [], regex: scripts.slice(0, 2000).map(r => cleanRegex(stRegexToRegex(r))), assets: [], notes };
  throw new Error('모듈로 읽을 수 있는 파일이 아니에요.');
}

/** 계획대로 들여놓는다. replace 에 기존 모듈 id 를 주면 그 모듈의 내용을 바꾼다(스위치 · 범위는 유지) */
export async function installPack(plan, { replace = '' } = {}) {
  await load();
  const old = replace ? byId(replace) : null, m = old || newModule(), kept = { lore: 0, regex: 0 };
  const swap = async (coll, key, incoming, make) => {
    const before = old ? m[key].map(id => S.get(coll, id)).filter(Boolean) : [], out = [];
    for (const raw of incoming) {
      const src = JSON.parse(JSON.stringify(raw));
      if (Array.isArray(src.entries)) src.entries = src.entries.map(e => ({ ...e, id: uid() }));
      const hit = before.find(o => o.name === src.name && !out.includes(o.id));
      const rec = hit ? Object.assign(hit, make(src, hit)) : make(src, null);
      await S.save(coll, rec, true); out.push(rec.id);
    }
    kept[key] = before.filter(o => !out.includes(o.id)).length;    // 새 파일에 없는 예전 항목은 지우지 않고 모듈에서만 뺀다
    m[key] = out;
  };
  await swap('lore', 'lore', plan.lore, (b, hit) => hit ? { ...b, id: hit.id, createdAt: hit.createdAt } : newLore({ ...b, mod: m.id }));
  await swap('regex', 'regex', plan.regex, (r, hit) => hit ? { ...r, id: hit.id, enabled: hit.enabled, scope: hit.scope } : newRegex({ ...r, enabled: false, mod: m.id }));
  const owner = ownerOf(m);
  if (old) await Assets.removeOwner(owner);
  for (const a of plan.assets) await Assets.add(owner, a.name, a.data);
  await Assets.reload([owner]);
  const css = plan.module.css || '';
  Object.assign(m, { description: plan.module.description, author: plan.module.author, version: plan.module.version, quick: cleanQuick(plan.module.quick), cssOn: !!old && old.cssOn && old.css === css, css, assetCount: Assets.list(owner).length, imported: true, updatedAt: now() });
  if (!old) { m.name = uniqueName(plan.module.name); m.on = false; store.list.push(m); }
  await persist(); await sync();
  return { module: m, kept };
}

// ════════ 대화 속 그림 · 안내문 ════════
export const MOD_ASSET_PROMPT = `[Module image assets]
These extra image keywords are available in this chat. To show one, write {{img::keyword}} on its own line between paragraphs. Use at most {{max}} image(s) per reply in total, only when it fits the scene, and never invent keywords.
Extra keywords: {{keywords}}`;
const chatOwners = chat => chat ? [...list(chat.charIds).map(Assets.ownerOfChar), Assets.ownerOfPersona(S.persona(chat)?.id)] : [];
/** 모듈이 더해 주는 그림 이름 (캐릭터 · 페르소나 에셋에 같은 이름이 있으면 그쪽이 먼저) */
function extraNames(chat) {
  if (!liveOwners.length) return [];
  const have = new Set(Assets.names(chatOwners(chat)));
  return Assets.names(liveOwners).filter(n => !have.has(n));
}
X.prompt = X.prompt.filter(p => p.owner !== 'modules');
X.prompt.push({ owner: 'modules', fn: ({ chat }) => {
  const st = S.settings.assets || {}; if (st.inject === false) return [];
  const names = extraNames(chat); if (!names.length) return [];
  const tpl = text(cfg().assetPrompt).trim() || MOD_ASSET_PROMPT;
  return [{ where: 'depth', depth: Math.max(0, numOr(st.depth, 2)), order: 41, content: tpl.replace(/\{\{keywords\}\}/gi, names.join(', ')).replace(/\{\{max\}\}/gi, String(st.max || 2)), src: '모듈 에셋 안내문' }];
} });
X.filters = X.filters.filter(f => f.owner !== 'modules');
X.filters.push({ owner: 'modules', fn: (t, info) => {
  if (!t || !liveOwners.length || t.indexOf('{{img::') < 0) return t;
  const own = chatOwners(info?.chat), seed = info?.msg ? `${info.msg.id}:${info.msg.sw}:m` : ''; let n = 0;
  return t.replace(/\{\{img::([^}]+)\}\}/gi, (m, name) => Assets.resolve(own, name) ? m : (Assets.expand(m, liveOwners, seed && seed + n++) || m));
} });

// ════════ 이벤트 ════════
on('chat:open', chat => enter(chat?.id));
on('route', page => { if (page !== 'chat') leave(); else sync(); });

export const Modules = {
  load, sync, enter, leave, create, remove, duplicate, pack, readPack, installPack, exportModule, setRoom, handOver, wake, effective, loreState, regexState, safeCss, ownerOf,
  get list() { return store.list; }, get live() { return live; }, byId,
  async save(m) { await touch(m); return sync(); },
};

// ════════════════════════ 화면 ════════════════════════
const MODE_LABEL = { store: '원문 변경', display: '화면만', prompt: '전송만', both: '화면+전송' };
const scopeLabel = m => {
  if (m.scope === 'global') return '전역 · 모든 대화';
  if (m.scope === 'char') { const cs = m.charIds.map(i => S.get('chars', i)).filter(Boolean); return cs.length ? `캐릭터 · ${cs[0].name}${cs.length > 1 ? ` 외 ${cs.length - 1}명` : ''}` : '캐릭터 · 아직 고르지 않음'; }
  const n = m.chatIds.filter(i => S.get('chats', i)).length; return n ? `대화방 ${n}곳` : '대화방 · 아직 고르지 않음';
};
const roomNote = m => { const v = Object.entries(m.rooms).filter(([i]) => S.get('chats', i)), a = v.filter(([, on]) => on).length, b = v.length - a; return [a && `따로 켠 방 ${a}곳`, b && `따로 끈 방 ${b}곳`].filter(Boolean).join(' · '); };
const roomTitle = c => `${chatApi.groupTitle(c)} · ${chatApi.roomName(c)}`;
const switchEl = (checked, onchange, title) => h('label.switch', { title }, h('input', { type: 'checkbox', checked, 'aria-label': title, onchange: e => onchange(e.target.checked, e.target) }), h('i'));
const stat = (ic, label, n) => h(`span.mod-stat${n ? '' : '.zero'}`, { title: `${label} ${n}` }, icon(ic, 14), h('span', label), h('b', String(n)));
const statRow = m => { const n = counts(m); return h('div.mod-stats', stat('book', '로어북', n.lore), stat('code', '정규식', n.regex), stat('image', '에셋', n.assets), stat('play', '버튼', n.quick), n.css && h(`span.mod-stat${m.cssOn ? '' : '.zero'}`, icon('feather', 14), h('span', 'CSS'), h('b', m.cssOn ? '켬' : '끔'))); };
const star = () => { const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); s.setAttribute('viewBox', '0 0 24 24'); s.setAttribute('width', 12); s.setAttribute('height', 12); s.classList.add('mod-star'); s.innerHTML = '<path d="M12 1.5l2.1 8.4 8.4 2.1-8.4 2.1-2.1 8.4-2.1-8.4-8.4-2.1 8.4-2.1z" fill="currentColor"/>'; return s; };
const warnOn = m => { if (!m.on) return; if (m.scope === 'char' && !m.charIds.length) toast('켰지만 아직 캐릭터를 고르지 않았어요. 모듈을 열어 범위에서 골라 주세요.'); else if (m.scope === 'chat' && !m.chatIds.length) toast('켰지만 아직 대화방을 고르지 않았어요. 모듈을 열어 범위에서 골라 주세요.'); };

/** 여러 개 고르기: 많아도 찾을 수 있게 검색 · 보이는 것 모두 고르기 */
function pickItems({ title, items, multi = true, okLabel = '담기', ph = '이름으로 찾기', empty = '고를 수 있는 것이 없어요.', onDone }) {
  const picked = new Set(); let q = '', box;
  const rowsEl = h('div.picker-list.mod-pick'), count = h('small.hint');
  const shownItems = () => { const t = q.trim().toLowerCase(); return items.filter(it => !t || it.search.includes(t)); };
  const tally = () => { const n = shownItems().length; count.textContent = multi ? `${picked.size}개 고름 · ${q.trim() ? `찾은 것 ${n}개 · ` : ''}전체 ${items.length}개` : `${q.trim() ? `찾은 것 ${n}개 · ` : ''}전체 ${items.length}개`; };
  const draw = () => {
    const rows = shownItems();
    rowsEl.replaceChildren(...rows.slice(0, 200).map(it => {
      const el = h(`button.picker-row${picked.has(it.id) ? '.on' : ''}`, { type: 'button', onclick: () => { if (!multi) { box.close(); return onDone([it.id]); } picked.has(it.id) ? picked.delete(it.id) : picked.add(it.id); el.classList.toggle('on', picked.has(it.id)); tally(); } },
        it.thumb ? h('img.mod-pick-thumb', { src: it.thumb, alt: '', loading: 'lazy' }) : it.av ? avatar(it.av, 'sm') : h('span.mod-pick-ic', icon(it.ic || 'note', 16)),
        h('div.picker-text', h('b', it.title), h('small', it.sub || ' ')), multi && h('i.picker-check', icon('check', 14)));
      return el;
    }), !rows.length && h('p.dim.pad', items.length ? '찾는 것이 없어요.' : empty), rows.length > 200 && h('p.dim.pad', `${rows.length - 200}개가 더 있어요. 검색어를 넣어 좁혀 주세요.`));
    tally();
  };
  const search = h('input.inp.search', { placeholder: ph, oninput: e => { q = e.target.value; draw(); } });
  const all = multi && items.length > 1 ? h('div.row.mod-pick-tools', btn('보이는 것 모두', { cls: 'ghost', onclick: () => { for (const it of shownItems()) picked.add(it.id); draw(); } }), btn('고른 것 비우기', { cls: 'ghost', onclick: () => { picked.clear(); draw(); } })) : null;
  box = modal({ title, body: h('div.col', search, h('div.row.wrap.mod-pick-head', count, all), rowsEl), actions: multi ? [{ label: '취소' }, { label: okLabel, cls: 'primary', onclick: () => { if (picked.size) onDone([...picked]); } }] : [] });
  draw(); return box;
}

// ── 목록 ──
let listState = { q: '', filter: 'all' };
function drawList(root) {
  const st = listState; let shown = 60;
  const grid = h('div.mod-grid'), info = h('span.mod-info'), filters = h('div.mod-filters'), more = h('div.mod-more');
  const FILTERS = [['all', '전체', () => true], ['on', '켜짐', m => m.on], ['off', '꺼짐', m => !m.on], ['global', '전역', m => m.scope === 'global'], ['char', '캐릭터', m => m.scope === 'char'], ['chat', '대화방', m => m.scope === 'chat']];
  const card = m => {
    const el = h(`article.mod-card${m.on ? '.on' : ''}`,
      h('header.mod-card-head',
        h('button.mod-card-title', { type: 'button', title: '열어서 고치기', onclick: () => go('modules', m.id) }, h('b', m.name), m.version && h('span.mod-ver', 'v' + m.version.replace(/^v/i, ''))),
        switchEl(m.on, async v => { m.on = v; el.classList.toggle('on', v); await Modules.save(m); warnOn(m); drawFilters(); }, `${m.name} 켜기 · 끄기`)),
      m.author && h('p.mod-by', h('span', '만든이'), m.author),
      h(`p.mod-desc${m.description.trim() ? '' : '.none'}`, m.description.trim() || '설명을 적어 두지 않았어요.'),
      statRow(m),
      h('footer.mod-card-foot',
        h('span.mod-scope', icon(m.scope === 'global' ? 'moon' : m.scope === 'char' ? 'user' : 'chat', 14), h('span', scopeLabel(m))),
        roomNote(m) && h('small.mod-roomnote', roomNote(m)),
        m.imported && h('em.badge', '가져옴'),
        iconBtn('more', '더 보기', e => menu(e.currentTarget, [
          { label: '열어서 고치기', ic: 'edit', onclick: () => go('modules', m.id) },
          { label: '파일로 내보내기', ic: 'upload', onclick: () => exportModule(m).catch(err => toast(err.message, 'err')) },
          { label: '복제', ic: 'copy', onclick: async () => { const c = await duplicate(m); toast(`"${c.name}" 을(를) 만들었어요. 꺼진 채로 들어 있어요.`, 'ok'); draw(); } },
          '-',
          { label: '삭제', ic: 'trash', danger: true, onclick: () => removeDialog(m, draw) },
        ]), 'tiny')));
    return el;
  };
  const drawFilters = () => filters.replaceChildren(...FILTERS.map(([id, label, fn]) => { const n = store.list.filter(fn).length; return h(`button.chip${st.filter === id ? '.on' : ''}`, { type: 'button', onclick: () => { st.filter = id; shown = 60; draw(); } }, label, h('small', String(n))); }));
  const draw = () => {
    const t = st.q.trim().toLowerCase(), fn = FILTERS.find(f => f[0] === st.filter)?.[2] || (() => true);
    const rows = store.list.filter(fn).filter(m => !t || [m.name, m.author, m.description, ...booksOf(m).map(b => b.name), ...regexOf(m).map(r => r.name)].join(' ').toLowerCase().includes(t))
      .sort((a, b) => b.on - a.on || a.name.localeCompare(b.name, 'ko'));
    drawFilters();
    info.textContent = store.list.length ? `${rows.length === store.list.length ? `모두 ${rows.length}개` : `${rows.length}개 / 전체 ${store.list.length}개`} · 켜진 것 ${store.list.filter(m => m.on).length}개` : '';
    grid.replaceChildren(...rows.slice(0, shown).map(card));
    if (!store.list.length) grid.replaceChildren(h('div.empty.mod-empty', icon('panel', 34), h('p', '로어북 · 정규식 · 에셋을 한 묶음으로 만들어 두면 스위치 하나로 켜고 끌 수 있어요.'), h('div.row.wrap', btn('새 모듈', { ic: 'plus', cls: 'primary', onclick: make }), btn('파일에서 가져오기', { ic: 'import', onclick: () => importDialog() }))));
    else if (!rows.length) grid.replaceChildren(h('p.dim.mod-none', '찾는 모듈이 없어요.'));
    more.replaceChildren(rows.length > shown ? btn(`더 보기 · ${rows.length - shown}개 남음`, { cls: 'ghost wide', ic: 'down', onclick: () => { shown += 60; draw(); } }) : null);
  };
  const make = async () => { const m = await create(); go('modules', m.id); };
  const search = h('input.inp', { placeholder: '모듈 이름 · 만든이 · 담긴 로어북 이름으로 찾기', value: st.q, oninput: debounce(e => { st.q = e.target.value; shown = 60; draw(); }, 120) });
  const c = cfg(), promptBox_ = h('textarea.inp', { rows: 5, spellcheck: false, placeholder: MOD_ASSET_PROMPT, value: c.assetPrompt || '', oninput: debounce(e => { cfg().assetPrompt = e.target.value; S.set({ modules: cfg() }); }, 300) });
  root.append(h('section.mods',
    pageHead('modules', '모듈', btn('가져오기', { ic: 'import', title: '모듈 파일(JSON) 가져오기', onclick: () => importDialog() }), btn('새 모듈', { ic: 'plus', cls: 'primary', onclick: make })),
    h('div.mod-bar', h('div.search-wrap', icon('search', 16), search), info),
    filters, grid, more,
    h('details.mod-opts', h('summary', icon('sliders', 15), '모듈 에셋 안내문'),
      h('div.mod-opts-body', h('small.hint', '켜진 모듈에 그림이 들어 있을 때만 프롬프트에 덧붙습니다(추가 호출 없음). 비워 두면 아래 회색 글이 쓰여요. {{keywords}} 는 그림 이름 목록, {{max}} 는 답변당 최대 개수로 바뀝니다.'), promptBox_))));
  draw();
}

function removeDialog(m, after) {
  const own = ownItems(m), has = own.lore.length + own.regex.length > 0, opt = { withItems: false };
  const n = counts(m);
  modal({
    title: `"${m.name}" 모듈을 삭제할까요?`,
    body: h('div.col.mod-dialog',
      h('p', '모듈이 켜 두었던 것은 꺼지고, 모듈에 담아 둔 그림은 함께 지워집니다.', n.lore + n.regex ? ' 로어북과 정규식은 보관함에 그대로 남아요.' : ''),
      has && form(opt, [{ k: 'withItems', label: `이 모듈과 함께 들어온 ${[own.lore.length && `로어북 ${own.lore.length}권`, own.regex.length && `정규식 ${own.regex.length}개`].filter(Boolean).join(' · ')}도 지우기`, type: 'check', live: true }])),
    actions: [{ label: '취소' }, { label: '삭제', cls: 'danger', onclick: async () => { await remove(m, opt); toast('모듈을 삭제했어요'); after(); } }],
  });
}

// ── 편집 ──
function drawEditor(root, m) {
  let tab = 'lore';
  const save = debounce(() => Modules.save(m), 300);
  const body = h('div.mod-tabbody'), tabs = h('div.tabs.mod-tabs'), scopeBody = h('div.mod-scope-body');

  // 범위
  const drawScope = () => {
    const note = roomNote(m);
    const extra = note ? h('div.row.wrap.mod-rooms-note', h('small.hint', `장면 패널에서 ${note}`), btn('방마다 바꾼 것 지우기', { cls: 'ghost', onclick: async () => { m.rooms = {}; await Modules.save(m); drawScope(); } })) : null;
    if (m.scope === 'global') return scopeBody.replaceChildren(h('small.hint', '스위치를 켜면 모든 대화에 적용됩니다.'), extra);
    if (m.scope === 'char') {
      const cs = m.charIds.map(i => S.get('chars', i)).filter(Boolean);
      return scopeBody.replaceChildren(
        h('small.hint', '스위치가 켜져 있으면, 고른 캐릭터가 나오는 대화방을 열 때 적용되고 떠날 때 되돌립니다.'),
        h('div.mod-targets', cs.map(c => h('span.chip.static.mod-target', avatar(c, 'xs'), h('span', c.name), h('button', { type: 'button', title: '빼기', 'aria-label': `${c.name} 빼기`, onclick: async () => { m.charIds = m.charIds.filter(i => i !== c.id); await Modules.save(m); drawScope(); } }, icon('x', 12)))),
          btn(cs.length ? '캐릭터 고르기' : '캐릭터를 골라 주세요', { ic: 'users', onclick: () => charPicker({ title: '이 모듈을 쓸 캐릭터', selected: m.charIds, onDone: async sel => { m.charIds = sel; await Modules.save(m); drawScope(); } }) })), extra);
    }
    const rooms = m.chatIds.map(i => S.get('chats', i)).filter(Boolean);
    scopeBody.replaceChildren(
      h('small.hint', '스위치가 켜져 있으면, 고른 대화방을 열 때 적용되고 떠날 때 되돌립니다. 대화 화면의 장면 패널에서도 방마다 켜고 끌 수 있어요.'),
      h('div.mod-rows', rooms.slice(0, 40).map(c => h('div.mod-row', h('span.mod-row-ic', icon('chat', 15)), h('div.mod-row-text', h('b', roomTitle(c)), h('small', `메시지 ${c.count || 0}개 · ${fmtTime(c.updatedAt)}`)),
        iconBtn('x', '이 방 빼기', async () => { m.chatIds = m.chatIds.filter(i => i !== c.id); await Modules.save(m); drawScope(); }, 'tiny'))), rooms.length > 40 && h('p.dim', `외 ${rooms.length - 40}곳`)),
      h('div.row', btn(rooms.length ? '대화방 더 고르기' : '대화방을 골라 주세요', { ic: 'chat', onclick: () => {
        const lastId = S.settings.lastChat, pool = S.chats.filter(c => !m.chatIds.includes(c.id)).sort((a, b) => (b.id === lastId) - (a.id === lastId) || b.updatedAt - a.updatedAt);
        pickItems({ title: '이 모듈을 쓸 대화방', okLabel: '고르기', ph: '캐릭터나 방 이름으로 찾기', empty: '고를 대화방이 없어요.', items: pool.map(c => ({ id: c.id, ic: 'chat', title: roomTitle(c), sub: `${c.id === lastId ? '마지막으로 연 방 · ' : ''}메시지 ${c.count || 0}개 · ${fmtTime(c.updatedAt)}`, search: (roomTitle(c) + ' ' + (c.preview || '')).toLowerCase() })),
          onDone: async sel => { m.chatIds = [...m.chatIds, ...sel]; await Modules.save(m); drawScope(); } });
      } })), extra);
  };

  // 담긴 것
  const stateBadge = (kind, id, st) => {
    const act = effective(m, roomChat());
    if (st === 'mod') return [h('em.badge.on', '모듈이 켬')];
    if (st === 'muted') return [h('em.badge', '직접 꺼 둠'), btn('모듈에 맞추기', { cls: 'ghost mod-mini', title: '직접 꺼 둔 것을 풀고 모듈 스위치를 따르게 합니다', onclick: async () => { await wake(kind, id); drawTab(); } })];
    if (st === 'user') return [h('em.badge', '직접 켜 둠'), btn('모듈에 맡기기', { cls: 'ghost mod-mini', title: '지금은 모듈을 꺼도 켜져 있어요. 맡기면 모듈 스위치를 따라 켜지고 꺼집니다', onclick: async () => { await handOver(kind, id); drawTab(); } })];
    return [h('em.badge', act ? '꺼짐' : m.on && m.scope !== 'global' ? '해당 대화에서 켜짐' : '꺼짐')];
  };
  const rowsBox = (rows, emptyText) => h('div.mod-rows', rows.length ? rows : h('p.dim.mod-none', emptyText));
  const TABS = {
    lore: { label: '로어북', n: () => booksOf(m).length, draw: () => [
      h('div.row.wrap', btn('로어북 담기', { ic: 'plus', onclick: () => pickItems({ title: '모듈에 담을 로어북', empty: '담을 로어북이 없어요. 로어북 화면에서 먼저 만들어 주세요.', items: S.lore.filter(b => !m.lore.includes(b.id)).sort((a, b) => a.name.localeCompare(b.name, 'ko')).map(b => ({ id: b.id, ic: 'book', title: b.name, sub: `항목 ${list(b.entries).length}개${list(S.settings.activeLore).includes(b.id) ? ' · 지금 전역으로 켜져 있음' : ''}`, search: (b.name + ' ' + (b.description || '')).toLowerCase() })), onDone: async sel => { m.lore = [...m.lore, ...sel]; await Modules.save(m); drawAll(); } }) }),
        h('small.hint', '모듈이 켜지면 담긴 로어북을 전역 목록에 올리고, 꺼지면 모듈이 올린 것만 내립니다.')),
      rowsBox(booksOf(m).map(b => h('div.mod-row', h('span.mod-row-ic', icon('book', 15)), h('div.mod-row-text', h('b', b.name), h('small', `항목 ${list(b.entries).length}개${b.description ? ' · ' + b.description : ''}`)),
        h('div.mod-row-state', stateBadge('lore', b.id, loreState(b.id))),
        iconBtn('edit', '로어북 화면에서 열기', () => go('lore', b.id), 'tiny'), iconBtn('x', '모듈에서 빼기', async () => { m.lore = m.lore.filter(i => i !== b.id); await Modules.save(m); drawAll(); }, 'tiny'))), '아직 담긴 로어북이 없어요.')] },
    regex: { label: '정규식', n: () => regexOf(m).length, draw: () => [
      h('div.row.wrap', btn('정규식 담기', { ic: 'plus', onclick: () => pickItems({ title: '모듈에 담을 정규식', empty: '담을 정규식이 없어요. 정규식 화면에서 먼저 만들어 주세요.', items: S.regex.filter(r => !m.regex.includes(r.id)).sort((a, b) => a.name.localeCompare(b.name, 'ko')).map(r => ({ id: r.id, ic: 'code', title: r.name, sub: `${MODE_LABEL[r.mode] || r.mode}${r.scope && r.scope !== 'global' ? ' · ' + (S.get('chars', r.scope)?.name || '캐릭터') : ''}${r.enabled ? ' · 지금 켜져 있음' : ''}`, search: (r.name + ' ' + (r.find || '')).toLowerCase() })), onDone: async sel => { m.regex = [...m.regex, ...sel]; await Modules.save(m); drawAll(); } }) }),
        h('small.hint', '모듈이 켜지면 담긴 정규식을 켜고, 꺼지면 모듈이 켠 것만 끕니다.')),
      rowsBox(regexOf(m).map(r => h('div.mod-row', h('span.mod-row-ic', icon('code', 15)), h('div.mod-row-text', h('b', r.name), h('small', `${MODE_LABEL[r.mode] || r.mode}${r.scope && r.scope !== 'global' ? ' · ' + (S.get('chars', r.scope)?.name || '캐릭터') + ' 전용' : ''}`)),
        h('div.mod-row-state', stateBadge('regex', r.id, regexState(r))),
        iconBtn('edit', '정규식 화면에서 열기', () => go('regex', r.id), 'tiny'), iconBtn('x', '모듈에서 빼기', async () => { m.regex = m.regex.filter(i => i !== r.id); await Modules.save(m); drawAll(); }, 'tiny'))), '아직 담긴 정규식이 없어요.')] },
    assets: { label: '에셋', n: () => m.assetCount || 0, draw: () => { const box = h('div.col'); drawAssets(box); return [box]; } },
    quick: { label: '빠른 버튼', n: () => m.quick.length, draw: () => {
      const rows = h('div.mod-quick');
      const drawRows = () => rows.replaceChildren(...m.quick.map((q, i) => h('div.mod-quick-row',
        h('input.inp', { value: q.label, placeholder: '버튼 이름', 'aria-label': '버튼 이름', oninput: e => { q.label = e.target.value.trim(); save(); drawTabs(); } }),
        h('input.inp', { value: q.text, placeholder: '넣을 글 또는 /명령어', 'aria-label': '버튼 내용', spellcheck: false, oninput: e => { q.text = e.target.value; save(); } }),
        iconBtn('x', '버튼 지우기', async () => { m.quick.splice(i, 1); await Modules.save(m); drawRows(); drawTabs(); }, 'tiny'))), !m.quick.length && h('p.dim.mod-none', '아직 버튼이 없어요.'));
      drawRows();
      return [h('div.row.wrap', btn('버튼 추가', { ic: 'plus', onclick: () => { m.quick.push({ label: '', text: '' }); drawRows(); rows.lastElementChild?.querySelector('input')?.focus(); } }), h('small.hint', '모듈이 켜져 있는 동안 입력창 위에 나타납니다. 내용이 / 로 시작하면 명령어로 실행돼요. 이름과 내용을 모두 적은 버튼만 나옵니다.')), rows];
    } },
    css: { label: 'CSS', n: () => (m.css.trim() ? (m.cssOn ? '켬' : '끔') : 0), draw: () => {
      const sw = switchEl(m.cssOn, async v => { m.cssOn = v; await Modules.save(m); drawTabs(); }, 'CSS 조각 적용');
      return [
        m.imported && h('div.mod-warn', icon('lock', 16), h('div', h('b', '가져온 모듈의 CSS 입니다.'), h('span', ' 화면을 가리거나 다르게 보이게 만들 수 있으니, 내용을 읽어 보고 믿을 수 있을 때만 켜세요. 가져올 때는 항상 꺼진 채로 들어옵니다.'))),
        h('label.mod-switch-line', sw, h('span', '이 CSS 조각 적용'), h('small', '모듈이 켜져 있을 때만 함께 적용됩니다')),
        h('textarea.inp.mod-code', { rows: 12, spellcheck: false, placeholder: '.msg-body { letter-spacing: -0.01em; }', value: m.css, oninput: e => { m.css = e.target.value; save(); drawTabs(); } }),
        h('small.hint', '바깥 주소를 부르는 @import 와 url() 은 빼고 적용합니다(그림은 data: 주소만).')];
    } },
  };

  // 에셋 탭
  const drawAssets = async box => {
    const owner = ownerOf(m); await Assets.load([owner]);
    const all = Assets.list(owner); let shown = 120;
    if (m.assetCount !== all.length) { m.assetCount = all.length; touch(m); drawTabs(); }
    const grid = h('div.mod-assets'), more = h('div');
    const after = async () => { await Assets.reload([owner]); m.assetCount = Assets.list(owner).length; await Modules.save(m); drawAll(); };
    const drawGrid = () => {
      grid.replaceChildren(...all.slice(0, shown).map(a => h('figure.mod-asset',
        h('button.mod-asset-pic', { type: 'button', title: '크게 보기', onclick: () => modal({ title: a.name, wide: true, body: h('img.full-img', { src: a.data, alt: a.name }) }) }, h('img', { src: a.data, alt: a.name, loading: 'lazy' })),
        h('figcaption', h('button.mod-asset-name', { type: 'button', title: '이름 바꾸기', onclick: async () => {
          const v = await promptBox('에셋 이름', a.name); if (v == null) return; const name = Assets.cleanName(v);
          if (!name || name === a.name) return; if (all.some(o => o !== a && o.name === name)) return toast('같은 이름의 그림이 이미 있어요', 'err');
          await Assets.update({ ...a, name }); after();
        } }, a.name), iconBtn('x', '그림 빼기', async () => { await Assets.remove(a); after(); }, 'tiny')))),
        !all.length && h('p.dim.mod-none', '아직 담긴 그림이 없어요.'));
      more.replaceChildren(all.length > shown ? btn(`더 보기 · ${all.length - shown}장 남음`, { cls: 'ghost wide', ic: 'down', onclick: () => { shown += 120; drawGrid(); } }) : null);
    };
    const upload = async () => {
      const files = await pickFiles({ accept: 'image/*,.zip', multiple: true }); if (!files.length) return;
      try { const n = await Assets.addFiles(owner, files); toast(n ? `그림 ${n}장을 담았어요` : '담을 그림을 찾지 못했어요', n ? 'ok' : ''); } catch (e) { toast(e.message, 'err'); }
      after();
    };
    const fromChar = () => charPicker({ title: '어느 캐릭터의 에셋에서 담을까요?', multi: false, onDone: async ([cid]) => {
      const src = Assets.ownerOfChar(cid); await Assets.load([src]);
      const have = new Set(all.map(a => a.name)), pool = Assets.list(src);
      if (!pool.length) return toast('그 캐릭터에는 에셋이 없어요');
      pickItems({ title: `${S.get('chars', cid)?.name || '캐릭터'}의 에셋`, okLabel: '복사해서 담기', ph: '그림 이름으로 찾기', items: pool.map(a => ({ id: a.id, thumb: a.data, title: a.name, sub: [a.ver && `버전 ${a.ver}`, have.has(a.name) && '같은 이름이 이미 있음 · 덮어씀'].filter(Boolean).join(' · '), search: a.name.toLowerCase() })),
        onDone: async sel => { for (const a of pool.filter(x => sel.includes(x.id))) await Assets.add(owner, a.name, a.data); toast(`그림 ${sel.length}장을 복사해 담았어요`, 'ok'); after(); } });
    } });
    drawGrid();
    box.replaceChildren(
      h('div.row.wrap', btn('그림 올리기', { ic: 'upload', title: '이미지 여러 장 또는 ZIP', onclick: upload }), btn('캐릭터 에셋에서 담기', { ic: 'copy', onclick: fromChar }), all.length > 0 && h('span.mod-info', `${all.length}장`)),
      h('small.hint', '모듈이 켜진 대화에서 {{img::이름}} 으로 불러옵니다. 같은 이름이 캐릭터나 페르소나 에셋에 있으면 그쪽이 먼저예요. 그림은 원본을 복사해 모듈 안에 따로 보관합니다.'),
      grid, more);
  };

  const drawTabs = () => tabs.replaceChildren(...Object.entries(TABS).map(([id, t]) => { const n = t.n(); return h(`button.tab${tab === id ? '.on' : ''}`, { type: 'button', onclick: () => { tab = id; drawAll(); } }, t.label, n ? h('small.mod-tab-n', String(n)) : null); }));
  const drawTab = () => body.replaceChildren(...TABS[tab].draw().filter(Boolean));
  const drawAll = () => { drawTabs(); drawTab(); };

  const sw = switchEl(m.on, async v => { m.on = v; await Modules.save(m); warnOn(m); drawTab(); }, '모듈 켜기 · 끄기');
  const head = pageHead('module', m.name.trim() || '이름 없는 모듈',
      h('label.mod-switch-line', sw, h('span', '켜기')),
      btn('내보내기', { ic: 'upload', title: '이 모듈을 파일 하나로 내보내기', onclick: () => exportModule(m).catch(e => toast(e.message, 'err')) }),
      iconBtn('more', '더 보기', e => menu(e.currentTarget, [
        { label: '복제', ic: 'copy', onclick: async () => { const c = await duplicate(m); toast('복제했어요. 꺼진 채로 들어 있어요.', 'ok'); go('modules', c.id); } },
        '-', { label: '삭제', ic: 'trash', danger: true, onclick: () => removeDialog(m, () => go('modules')) }])));
  const title = head.querySelector('h1');
  root.append(h('section.mods.mod-edit',
    btn('모듈 목록', { ic: 'left', cls: 'ghost mod-back', onclick: () => go('modules') }),
    head,
    h('div.card.mod-sec', h('h3.form-sec', '정보'),
      form(m, [{ k: 'name', label: '이름', half: true }, { k: 'version', label: '버전', third: true, ph: '1.0' }, { k: 'author', label: '만든이', half: true }, { k: 'description', label: '설명', type: 'area', rows: 3, ph: '무엇을 하는 모듈인지, 어떤 캐릭터와 쓰면 좋은지' }],
        () => { m.name = text(m.name, 120); title.textContent = m.name.trim() || '이름 없는 모듈'; save(); })),
    h('div.card.mod-sec', h('h3.form-sec', '범위'),
      h('label.field.mod-scope-field', h('span.field-label', '어디에 적용할까요'), h('select.inp', { onchange: async e => { m.scope = e.target.value; await Modules.save(m); warnOn(m); drawScope(); drawTab(); } }, SCOPES.map(([v, l]) => h('option', { value: v, selected: m.scope === v }, l)))),
      scopeBody),
    h('div.card.mod-sec', h('h3.form-sec', '담긴 것'), tabs, body)));
  drawScope(); drawAll();
}

// ── 가져오기 ──
async function importDialog() {
  const [f] = await pickFiles({ accept: '.json,application/json' }); if (!f) return;
  let plan;
  try {
    if (f.size > 300e6) throw new Error('파일이 너무 커요.');
    const raw = await f.text(); let j;
    try { j = JSON.parse(raw); } catch { throw new Error(raw.charCodeAt(0) === 111 && raw.charCodeAt(1) === 0 ? '묶어서 압축한 모듈 파일은 읽지 못해요. JSON 으로 내보낸 파일을 써 주세요.' : 'JSON 파일이 아니에요.'); }
    await load(); plan = readPack(j, f.name);
  } catch (e) { return toast(e.message, 'err'); }
  previewDialog(plan);
}
function previewDialog(plan) {
  const p = plan.module, same = store.list.filter(m => m.name === p.name), opt = { how: 'new' };
  const entries = plan.lore.reduce((n, b) => n + b.entries.length, 0);
  const group = (ic, label, n, kids, open = false) => n ? h('details.mod-pv', { open }, h('summary', icon(ic, 15), h('b', label), h('span', n)), h('div.mod-pv-body', kids)) : null;
  const names = (arr, f, max = 14) => [arr.slice(0, max).map(f), arr.length > max && h('p.dim', `외 ${arr.length - max}개`)];
  const empty = !plan.lore.length && !plan.regex.length && !plan.assets.length && !p.quick.length && !p.css.trim();
  const box = modal({
    title: '모듈 가져오기', wide: true,
    body: h('div.col.mod-dialog',
      h('div.mod-pv-head', h('div.mod-pv-title', h('b', p.name), p.version && h('span.mod-ver', 'v' + p.version.replace(/^v/i, ''))), p.author && h('p.mod-by', h('span', '만든이'), p.author), p.description.trim() && h('p.mod-pv-desc', p.description), h('small.hint', plan.source)),
      empty ? h('p.dim', '가져올 내용이 들어 있지 않아요.') : h('div.mod-pv-list',
        plan.lore.length && group('book', '로어북', `${plan.lore.length}권 · 항목 ${entries}개`, names(plan.lore, b => h('div.mod-pv-row', h('b', b.name), h('small', `항목 ${b.entries.length}개${b.entries.some(e => e.constant) ? ` · 상시 ${b.entries.filter(e => e.constant).length}개` : ''}`))), true),
        plan.regex.length && group('code', '정규식', `${plan.regex.length}개`, names(plan.regex, r => h('div.mod-pv-row', h('b', r.name), h('small', MODE_LABEL[r.mode] || r.mode), h('code', r.find.slice(0, 80))))),
        plan.assets.length && group('image', '에셋', `${plan.assets.length}장`, h('div.mod-pv-pics', plan.assets.slice(0, 24).map(a => h('img', { src: a.data, alt: a.name, title: a.name, loading: 'lazy' })), plan.assets.length > 24 && h('span.dim', `외 ${plan.assets.length - 24}장`))),
        p.quick.length && group('play', '빠른 버튼', `${p.quick.length}개`, h('div.mod-pv-chips', p.quick.map(q => h('span.chip.static', { title: q.text }, q.label || q.text.slice(0, 20))))),
        p.css.trim() && group('feather', 'CSS 조각', `${p.css.split('\n').length}줄 · 꺼진 채로 들어옵니다`, [h('small.hint', '화면 모양을 바꾸는 코드입니다. 들여온 뒤 모듈의 CSS 탭에서 읽어 보고 직접 켜야 적용돼요.'), h('pre.mod-code', p.css.slice(0, 6000) + (p.css.length > 6000 ? '\n…' : ''))])),
      plan.notes.length ? h('ul.mod-notes', plan.notes.map(n => h('li', n))) : null,
      same.length ? h('label.field', h('span.field-label', `같은 이름의 모듈 "${p.name}" 이(가) 이미 있어요`), h('select.inp', { onchange: e => { opt.how = e.target.value; } },
        h('option', { value: 'new', selected: true }, '따로 두기 · 이름 뒤에 번호를 붙여 새로 들여놓기'), same.map(m => h('option', { value: m.id }, `덮어쓰기 · 기존 모듈의 내용을 이 파일로 바꾸기${same.length > 1 ? ` (${fmtTime(m.updatedAt)} 고침)` : ''}`))),
        h('small.hint', '덮어써도 스위치와 범위는 그대로 둡니다. 이름이 같은 로어북 · 정규식은 내용만 바꾸고, 새 파일에 없는 예전 항목은 지우지 않고 모듈에서만 뺍니다.')) : null,
      h('div.mod-warn', icon('lock', 16), h('div', h('b', '가져온 파일은 믿을 수 없는 데이터로 다룹니다.'), h('span', ' 들여놓아도 모듈은 꺼져 있고, 로어북은 전역에 올리지 않으며, 정규식과 CSS 도 꺼진 채입니다. 내용을 확인한 뒤 직접 켜세요.')))),
    actions: [{ label: '취소' }, !empty && { label: '가져오기', cls: 'primary', ic: 'import', onclick: async () => {
      try {
        const { module: m, kept } = await installPack(plan, { replace: opt.how === 'new' ? '' : opt.how });
        const left = [kept.lore && `로어북 ${kept.lore}권`, kept.regex && `정규식 ${kept.regex}개`].filter(Boolean).join(' · ');
        toast(`"${m.name}" 모듈을 들여놓았어요.${left ? ` 예전 ${left}은(는) 보관함에 남겼어요.` : ''}`, 'ok');
        go('modules', m.id);
      } catch (e) { console.error(e); toast('가져오지 못했어요: ' + e.message, 'err'); return false; }
    } }].filter(Boolean),
  });
  return box;
}

registerPage('modules', async (root, arg) => {
  await load();
  if (route.page !== 'modules' || route.arg !== arg || root.firstChild) return;   // 읽는 사이에 다른 화면으로 갔다
  const m = arg && byId(arg);
  if (m) drawEditor(root, m); else drawList(root);
});

// ════════ 장면 패널: 이 대화방의 모듈 ════════
X.panels = X.panels.filter(p => p.owner !== 'modules');
X.panels.push({ owner: 'modules', id: 'modules', title: '이 대화방의 모듈', icon: 'panel', render: chat => {
  const box = h('div.col.mod-panel');
  const flip = async (m, v) => { await setRoom(m, chat, v); draw(); };
  const origin = m => Object.hasOwn(m.rooms, chat.id) ? (m.rooms[chat.id] ? '이 방에서만 켬' : '이 방에서만 끔') : m.scope === 'global' ? '전역' : m.scope === 'char' ? '캐릭터' : '이 방';
  const row = (m, isOn) => { const n = counts(m); return h(`div.mod-prow${isOn ? '' : '.off'}`,
    h('div.mod-row-text', h('b', m.name), h('small', [origin(m), n.lore && `로어북 ${n.lore}`, n.regex && `정규식 ${n.regex}`, n.assets && `에셋 ${n.assets}`, n.quick && `버튼 ${n.quick}`, n.css && m.cssOn && 'CSS'].filter(Boolean).join(' · '))),
    switchEl(isOn, v => flip(m, v), `${m.name} — 이 방에서 켜기 · 끄기`)); };
  const draw = () => {
    const onHere = store.list.filter(m => effective(m, chat)).sort((a, b) => a.name.localeCompare(b.name, 'ko'));
    const offHere = store.list.filter(m => chat && m.rooms[chat.id] === false).sort((a, b) => a.name.localeCompare(b.name, 'ko'));
    const rest = store.list.filter(m => !onHere.includes(m) && !offHere.includes(m));
    box.replaceChildren(
      onHere.length || offHere.length ? h('div.mod-prows', onHere.map(m => row(m, true)), offHere.map(m => row(m, false))) : h('p.dim', store.list.length ? '이 방에 켜진 모듈이 없어요.' : '아직 모듈이 없어요.'),
      h('div.row.wrap',
        rest.length ? btn('이 방에 모듈 켜기', { ic: 'plus', cls: 'ghost', onclick: () => pickItems({ title: '이 방에서 켤 모듈', okLabel: '켜기', ph: '모듈 이름으로 찾기', items: rest.sort((a, b) => a.name.localeCompare(b.name, 'ko')).map(m => { const n = counts(m); return { id: m.id, ic: 'panel', title: m.name, sub: [`로어북 ${n.lore}`, `정규식 ${n.regex}`, `에셋 ${n.assets}`, m.on ? scopeLabel(m) : '꺼져 있음'].join(' · '), search: (m.name + ' ' + m.author + ' ' + m.description).toLowerCase() }; }),
          onDone: async sel => { for (const id of sel) { const m = byId(id); if (m) await setRoom(m, chat, true); } draw(); } }) }) : null,
        btn('모듈 화면', { ic: 'right', cls: 'ghost', onclick: () => go('modules') })));
  };
  if (store.loaded) draw(); else load().then(draw);
  return box;
} });
