// 모듈 켜고 끄기 · 파일 읽기 · 설치 (옛 js/f-modules.js 의 화면이 아닌 부분 그대로). 등록(훅 · 이벤트)은 wireModules() 를 부를 때만 한다
// 엔진은 건드리지 않는다. 모듈이 켜지면 기존 켜짐 장치(전역 로어북 목록 · 정규식의 enabled · 빠른 버튼 목록)를 대신 눌러 주고,
// 무엇을 모듈이 켰는지 S.settings.modules.applied 에 적어 둔다. 끌 때는 적어 둔 것만 되돌리므로 사용자가 따로 켜 둔 것은 그대로 남는다.
import { S, DB, uid, now, on, download, newLore, newEntry, newRegex } from '../lib/core';
import { X } from '../lib/hooks';
import { Assets } from '../lib/assets';
import { worldToLore, stRegexToRegex } from '../lib/cards';
import { chatApi } from '../chat/actions';
import { route } from '../lib/router';
import type { Chat, Lore, Regex } from '../lib/types';
import type { ItemState, Kind, Module, Plan, Quick, Scope } from './lib';

type Obj = Record<string, unknown>;
type Book = Lore & { mod?: string };
type Rx = Regex & { mod?: string };
interface Applied { lore: Record<string, string[]>; regex: Record<string, string[]>; quick: { mid: string; label: string; text: string }[] }
interface Cfg { applied: Applied; assetPrompt?: string; [k: string]: unknown }
interface Info { chat?: Chat | null; msg?: { id: string; sw: number } | null }
type Room = Chat | null;

const HAS_DOM = typeof document !== 'undefined';
const routePage = () => route.page;

// ════════ 저장 ════════
const KEY = 'modules', FILE_APP = 'dreamland-module', FILE_VERSION = 1;
const store: { list: Module[]; ready: Promise<void> | null; loaded: boolean } = { list: [], ready: null, loaded: false };
const plain = (v: unknown): v is Obj => !!v && typeof v === 'object' && !Array.isArray(v);
const list = <T = unknown,>(v: unknown): T[] => Array.isArray(v) ? v as T[] : [];
const text = (v: unknown, max = 400000) => (typeof v === 'string' ? v : v == null ? '' : typeof v === 'object' ? '' : String(v)).slice(0, max);
const ids = (v: unknown) => [...new Set(list(v).filter((x): x is string => typeof x === 'string' && !!x))];

export const newModule = (o: Partial<Module> = {}): Module => ({
  id: uid(), name: '새 모듈', description: '', author: '', version: '1.0', on: false,
  scope: 'global', charIds: [], chatIds: [], rooms: {},          // rooms: 장면 패널에서 방마다 따로 켜고 끈 기록 { 대화 id: true|false }
  lore: [], regex: [], quick: [], css: '', cssOn: false, assetCount: 0, imported: false, createdAt: now(), updatedAt: now(), ...o,
});
function norm(m: unknown): Module {
  const d = newModule({ id: text((m as Obj | null)?.id, 80) || uid() }), s: Obj = plain(m) ? m : {};
  return {
    ...d, name: text(s.name, 120).trim() || d.name, description: text(s.description, 4000), author: text(s.author, 120), version: text(s.version, 40),
    on: s.on === true, scope: (['global', 'char', 'chat'].includes(s.scope as string) ? s.scope : 'global') as Scope, charIds: ids(s.charIds), chatIds: ids(s.chatIds),
    rooms: plain(s.rooms) ? Object.fromEntries(Object.entries(s.rooms).filter((e): e is [string, boolean] => typeof e[1] === 'boolean')) : {},
    lore: ids(s.lore), regex: ids(s.regex), quick: cleanQuick(s.quick), css: text(s.css, 200000), cssOn: s.cssOn === true,
    assetCount: Math.max(0, +(s.assetCount as number) || 0), imported: s.imported === true, createdAt: +(s.createdAt as number) || d.createdAt, updatedAt: +(s.updatedAt as number) || d.updatedAt,
  };
}
function cleanQuick(v: unknown): Quick[] { return list<Obj | null>(v).map(q => ({ label: text(q?.label, 60).trim(), text: text(q?.text, 4000) })).filter(q => q.label || q.text).slice(0, 60); }

const load = () => store.ready ||= (async () => { const r = await DB.get('kv', KEY) as { list?: unknown } | undefined; store.list = list(r?.list).map(norm); store.loaded = true; })();
const persist = () => DB.put('kv', { id: KEY, v: 1, list: store.list });
const touch = (m: Module) => { m.updatedAt = now(); return persist(); };
const byId = (id: string) => store.list.find(m => m.id === id);
const ownerOf = (m: Module | string) => 'module:' + (typeof m === 'string' ? m : m.id || m);
/** 모듈이 켠 것의 기록. activeLore · quick 과 같은 설정 한 줄에 함께 저장된다 */
function cfg(): Cfg {
  const st = S.settings as Obj;
  const c = (plain(st.modules) ? st.modules : (st.modules = {})) as Obj;
  const a = (plain(c.applied) ? c.applied : (c.applied = {})) as Obj;
  if (!plain(a.lore)) a.lore = {}; if (!plain(a.regex)) a.regex = {}; if (!Array.isArray(a.quick)) a.quick = [];
  return c as Cfg;
}

// ════════ 켜짐 판단 ════════
const covers = (m: Module, chat: Room) => m.scope === 'global' || (!!chat && (m.scope === 'char' ? list<string>(chat.charIds).some(i => m.charIds.includes(i)) : m.chatIds.includes(chat.id)));
const baseOn = (m: Module, chat: Room) => m.on && covers(m, chat);
/** 이 대화에서 모듈이 실제로 켜져 있는가. 방마다 따로 정한 것이 있으면 그것이 먼저 */
const effective = (m: Module, chat: Room) => chat && Object.hasOwn(m.rooms, chat.id) ? m.rooms[chat.id] : baseOn(m, chat);
const getLore = (id: string) => S.get('lore', id) as Book | undefined;
const getRegex = (id: string) => S.get('regex', id) as Rx | undefined;
const booksOf = (m: Module) => m.lore.map(getLore).filter((b): b is Book => !!b);
const regexOf = (m: Module) => m.regex.map(getRegex).filter((r): r is Rx => !!r);

let room: string | null = null;          // 지금 열어 둔 대화 id (대화 화면을 떠나면 비운다)
let live: Module[] = [];                 // 지금 켜져 있는 모듈
let liveOwners: string[] = [];           // 그중 에셋이 든 모듈의 보관함
let assetSig = '';
const roomChat = (): Room => (room && S.get('chats', room) as Chat | undefined) || null;
const sameList = (a: string[], b: string[]) => a.length === b.length && a.every((x, i) => x === b[i]);
const qkey = (q: { label: string; text: string }) => q.label + '\u0001' + q.text;

/** 바라는 상태와 적어 둔 기록을 맞춘다. 바뀐 것을 돌려준다 */
async function reconcile(chat: Room) {
  const act = store.list.filter(m => effective(m, chat));
  const c = cfg(), ap = c.applied, out = { lore: false, regex: false, quick: false, act };

  // 로어북: 전역 활성 목록
  const wantLore = new Map<string, string[]>();
  for (const m of act) for (const b of booksOf(m)) (wantLore.get(b.id) || wantLore.set(b.id, []).get(b.id)!).push(m.id);
  let active = list<string>(S.settings.activeLore).slice();
  for (const [id, mids] of wantLore) {
    if (ap.lore[id]) { if (!sameList(list(ap.lore[id]), mids)) { ap.lore[id] = mids; out.lore = true; } continue; }   // 이미 모듈이 켠 것 (사용자가 그 뒤에 직접 껐다면 그대로 둔다)
    if (active.includes(id)) continue;                                                                             // 사용자가 직접 켜 둔 것 → 기록하지 않는다
    active.push(id); ap.lore[id] = mids; out.lore = true;
  }
  for (const id of Object.keys(ap.lore)) if (!wantLore.has(id)) { active = active.filter(x => x !== id); delete ap.lore[id]; out.lore = true; }

  // 정규식: enabled
  const wantRe = new Map<string, string[]>(), saveRe: Rx[] = [];
  for (const m of act) for (const r of regexOf(m)) (wantRe.get(r.id) || wantRe.set(r.id, []).get(r.id)!).push(m.id);
  for (const [id, mids] of wantRe) {
    if (ap.regex[id]) { if (!sameList(list(ap.regex[id]), mids)) { ap.regex[id] = mids; out.regex = true; } continue; }
    const r = getRegex(id)!; if (r.enabled) continue;
    r.enabled = true; saveRe.push(r); ap.regex[id] = mids; out.regex = true;
  }
  for (const id of Object.keys(ap.regex)) if (!wantRe.has(id)) { const r = getRegex(id); if (r?.enabled) { r.enabled = false; saveRe.push(r); } delete ap.regex[id]; out.regex = true; }

  // 빠른 버튼
  const quick = list<Quick>(S.settings.quick).slice();
  const wantQ: Applied['quick'] = []; for (const m of act) for (const q of m.quick) if (q.label && q.text && !wantQ.some(w => w.mid === m.id && qkey(w) === qkey(q))) wantQ.push({ mid: m.id, label: q.label, text: q.text });
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
export function safeCss(css: unknown) {
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
function applyCss(act: Module[]) {
  if (!HAS_DOM) return;
  let el = document.getElementById('module-css');
  const css = act.filter(m => m.cssOn && m.css.trim()).map(m => `/* ${m.name.replace(/\*\//g, '')} */\n${safeCss(m.css)}`).join('\n');
  if (!css) { el?.remove(); return; }
  if (!el) { el = document.createElement('style'); el.id = 'module-css'; document.head.append(el); }
  if (el.textContent !== css) el.textContent = css;
}

type Out = Awaited<ReturnType<typeof reconcile>>;
let chain: Promise<Out | void> = Promise.resolve();
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
    if (HAS_DOM && routePage() === 'chat') {
      if (r.quick) patchQuick();
      if ((r.regex || r.lore || assetsChanged) && !chatApi.current().busy) chatApi.redraw();
    }
    return r;
  };
  return chain = chain.then(run, run).catch(e => { console.warn('[모듈]', e); });
}
const enter = (chatId?: string | null) => { room = chatId || null; return sync(); };
const leave = () => { room = null; return sync(); };

/** 대화 화면의 빠른 버튼 줄을 지금 목록대로 다시 그린다 (대화 화면은 설정이 바뀌어도 이 줄을 다시 그리지 않는다) */
function patchQuick() {
  const box = document.querySelector('.composer .quick'); if (!box) return;
  box.querySelectorAll('button.chip:not(.scene-chip)').forEach(b => b.remove());
  const first = box.firstChild;
  for (const q of list<Quick>(S.settings.quick)) { const b = document.createElement('button'); b.className = 'chip'; b.type = 'button'; b.onclick = () => runQuick(q.text); b.textContent = q.label; box.insertBefore(b, first); }
}
function runQuick(t: string) {
  const inp = document.querySelector<HTMLTextAreaElement>('.composer textarea'); if (!inp) return;
  if (t.startsWith('/')) { const keep = inp.value; void chatApi.send(t); inp.value = keep; inp.dispatchEvent(new Event('input')); }
  else { inp.value = (inp.value ? inp.value + ' ' : '') + t; inp.dispatchEvent(new Event('input')); inp.focus(); }
}

// ── 항목 하나의 상태 ──
// mod: 모듈이 켬 · muted: 모듈이 켰지만 사용자가 직접 끔 · user: 사용자가 직접 켜 둠(모듈 스위치와 무관) · off: 꺼짐
const loreState = (id: string): ItemState => { const on = list(S.settings.activeLore).includes(id); return cfg().applied.lore[id] ? (on ? 'mod' : 'muted') : on ? 'user' : 'off'; };
const regexState = (r: { id: string; enabled?: boolean }): ItemState => cfg().applied.regex[r.id] ? (r.enabled ? 'mod' : 'muted') : r.enabled ? 'user' : 'off';
/** 직접 켜 둔 것을 모듈 스위치에 맡긴다: 사용자 스위치를 내리고, 모듈이 켜져 있으면 모듈이 다시 켠다 */
async function handOver(kind: Kind, id: string) {
  if (kind === 'lore') S.set({ activeLore: list<string>(S.settings.activeLore).filter(x => x !== id) });
  else { const r = getRegex(id); if (r) { r.enabled = false; await S.save('regex', r, true); } }
  return sync();
}
/** 직접 꺼 둔 것을 다시 모듈에 맞춘다 */
async function wake(kind: Kind, id: string) {
  const ap = cfg().applied; delete ap[kind][id]; S.set({ modules: cfg() });
  return sync();
}

// ── 방마다 따로 ──
function setRoom(m: Module, chat: Chat, want: boolean) {
  if (m.scope === 'chat' && !Object.hasOwn(m.rooms, chat.id) && m.on) {       // 대화방 범위 모듈은 방 목록 자체를 고친다
    m.chatIds = want ? [...new Set([...m.chatIds, chat.id])] : m.chatIds.filter(i => i !== chat.id);
  } else if (want === baseOn(m, chat)) delete m.rooms[chat.id];
  else m.rooms[chat.id] = want;
  return touch(m).then(sync);
}

// ════════ 만들기 · 지우기 · 복제 ════════
const uniqueName = (name: string, skip?: Module) => { const taken = new Set(store.list.filter(m => m !== skip).map(m => m.name)); if (!taken.has(name)) return name; let n = 2; while (taken.has(`${name} (${n})`)) n++; return `${name} (${n})`; };
async function create(o: Partial<Module> = {}) { await load(); const m = newModule({ ...o, name: uniqueName(o.name || '새 모듈') }); store.list.push(m); await persist(); return m; }
/** 이 모듈과 함께 들어왔고 다른 모듈이 쓰지 않는 항목 */
function ownItems(m: Module) {
  const used = (key: Kind, id: string) => store.list.some(o => o !== m && o[key].includes(id));
  return { lore: booksOf(m).filter(b => b.mod === m.id && !used('lore', b.id)), regex: regexOf(m).filter(r => r.mod === m.id && !used('regex', r.id)) };
}
async function remove(m: Module, { withItems = false } = {}) {
  await load();
  const own = withItems ? ownItems(m) : { lore: [], regex: [] };
  store.list = store.list.filter(x => x !== m);
  await persist(); await sync();                    // 먼저 모듈이 켰던 것을 되돌린다
  await Assets.removeOwner(ownerOf(m));
  for (const b of own.lore) { await S.remove('lore', b.id); if (list(S.settings.activeLore).includes(b.id)) S.set({ activeLore: list<string>(S.settings.activeLore).filter(i => i !== b.id) }); }
  for (const r of own.regex) await S.remove('regex', r.id);
}
async function duplicate(m: Module) {
  const copy = await create({ ...JSON.parse(JSON.stringify(m)) as Module, id: uid(), name: m.name, on: false, rooms: {}, createdAt: now(), updatedAt: now() });
  await Assets.load([ownerOf(m)]);
  for (const a of Assets.list(ownerOf(m))) await Assets.add(ownerOf(copy), a.name, a.data);
  copy.assetCount = Assets.list(ownerOf(copy)).length; await persist();
  return copy;
}

// ════════ 파일: 내보내기 ════════
const strip = (o: object, keys: string[]) => { const c = JSON.parse(JSON.stringify(o)) as Obj; for (const k of keys) delete c[k]; return c; };
/** 모듈 하나를 자급 파일 내용으로. 담긴 로어북 · 정규식 · 에셋(data URL)을 통째로 넣는다 */
async function pack(m: Module) {
  await Assets.load([ownerOf(m)]);
  return {
    app: FILE_APP, version: FILE_VERSION, exportedAt: new Date().toISOString(),
    module: { name: m.name, description: m.description, author: m.author, version: m.version, quick: m.quick.map(q => ({ label: q.label, text: q.text })), css: m.css },
    lore: booksOf(m).map(b => ({ ...strip(b, ['id', 'createdAt', 'updatedAt', 'mod']), entries: list<object>(b.entries).map(e => strip(e, ['id'])) })),
    regex: regexOf(m).map(r => ({ ...strip(r, ['id', 'createdAt', 'updatedAt', 'mod', 'enabled']), scope: 'global' })),     // 캐릭터 id 는 다른 곳에서 뜻이 없다
    assets: Assets.list(ownerOf(m)).map(a => ({ name: a.name, data: a.data })),
  };
}
// eslint-disable-next-line no-control-regex
const fileName = (m: Module) => (m.name.replace(/[\\/:*?"<>|\u0000-\u001f]+/g, ' ').trim() || 'module') + '.dreamland-module.json';
async function exportModule(m: Module) { download(fileName(m), JSON.stringify(await pack(m), null, 1)); }

// ════════ 파일: 읽기 (가져온 파일은 믿을 수 없는 데이터 — 아는 칸만, 형을 맞춰서 옮긴다) ════════
const IMG_DATA = /^data:image\/(?:png|jpeg|jpg|webp|gif|avif);base64,[A-Za-z0-9+/=\s]+$/;
const BAD_KEYS = new Set(['__proto__', 'constructor', 'prototype', 'id', 'mod', 'createdAt', 'updatedAt']);
const prim = (v: unknown): v is string | number | boolean | null => v === null || ['string', 'number', 'boolean'].includes(typeof v);
/** 모르는 칸은 단순한 값(글 · 수 · 참거짓 · 그 목록)만 남긴다. 나중에 생긴 옵션이 왕복에서 사라지지 않게 */
function plainFields(o: unknown): Obj {
  const out: Obj = {};
  for (const [k, v] of Object.entries(plain(o) ? o : {})) {
    if (BAD_KEYS.has(k)) continue;
    if (prim(v)) out[k] = typeof v === 'string' ? v.slice(0, 400000) : v;
    else if (Array.isArray(v) && v.length <= 500 && v.every(prim)) out[k] = v.map(x => typeof x === 'string' ? x.slice(0, 4000) : x);
  }
  return out;
}
const numOr = <D,>(v: unknown, d: D): number | D => v !== '' && v != null && Number.isFinite(+(v as number)) ? +(v as number) : d;
const strList = (v: unknown) => list(typeof v === 'string' ? [v] : v).filter(prim).map(x => text(x, 4000)).filter(Boolean).slice(0, 500);
const POSITIONS = ['before', 'after', 'an_top', 'an_bottom', 'em_top', 'em_bottom', 'depth', 'outlet'], ROLES = ['system', 'user', 'assistant'], MODES = ['store', 'display', 'prompt', 'both'];
function cleanEntry(e: unknown) {
  const x = plainFields(e), o = (plain(e) ? e : {}) as Obj;
  return newEntry({
    ...x, name: text(x.name, 300), keys: strList(o.keys), keys2: strList(o.keys2), logic: [0, 1, 2, 3].includes(+(x.logic as number)) ? +(x.logic as number) : 0, content: text(x.content),
    constant: x.constant === true, enabled: x.enabled !== false, position: POSITIONS.includes(x.position as string) ? x.position as string : 'before', depth: numOr(x.depth, 4), role: ROLES.includes(x.role as string) ? x.role as string : 'system',
    order: numOr(x.order, 100), probability: Math.min(100, Math.max(0, numOr(x.probability, 100))), caseSensitive: typeof x.caseSensitive === 'boolean' ? x.caseSensitive : null, wholeWord: typeof x.wholeWord === 'boolean' ? x.wholeWord : null, useRegex: x.useRegex === true, noRecurse: x.noRecurse === true,
    outlet: text(x.outlet, 120), group: text(x.group, 120), sticky: numOr(x.sticky, null), cooldown: numOr(x.cooldown, null), delay: numOr(x.delay, null), scanDepth: numOr(x.scanDepth, null),
  });
}
function cleanBook(b: unknown, fallback = '로어북') {
  const x = plainFields(b);
  return { ...x, name: text(x.name, 120).trim() || fallback, description: text(x.description, 4000), scanDepth: Math.max(0, numOr(x.scanDepth, 4)), tokenBudget: Math.max(0, numOr(x.tokenBudget, 2048)), recursive: x.recursive === true, entries: list((b as Obj | null)?.entries).filter(plain).slice(0, 5000).map(cleanEntry) };
}
function cleanRegex(r: unknown) {
  const x = plainFields(r);
  return { ...x, name: text(x.name, 120).trim() || '정규식', find: text(x.find, 20000), replace: text(x.replace, 200000), trim: strList((r as Obj | null)?.trim), onUser: x.onUser === true, onAI: x.onAI !== false, mode: MODES.includes(x.mode as string) ? x.mode as string : 'display', minDepth: numOr(x.minDepth, null), maxDepth: numOr(x.maxDepth, null), scope: 'global', enabled: false };
}
function cleanAssets(v: unknown, notes: string[]) {
  const out: { name: string; data: string }[] = [], seen = new Set<string>(); let bad = 0;
  for (const a of list<Obj | null>(v).slice(0, 2000)) {
    const name = Assets.cleanName(text(a?.name, 120)), data = typeof a?.data === 'string' ? a.data : '';
    if (!name || seen.has(name) || data.length > 12e6 || !IMG_DATA.test(data)) { bad++; continue; }
    seen.add(name); out.push({ name, data });
  }
  if (bad) notes.push(`그림 ${bad}장은 이름이 없거나 겹치거나, 그림 데이터가 아니어서 뺐어요.`);
  return out;
}

// 다른 프런트엔드의 모듈 파일: 로어북과 정규식만 옮긴다
const foreignModule = (j: unknown): j is Obj => plain(j) && typeof j.type === 'string' && /module$/i.test(j.type) && j.app !== FILE_APP && (plain(j.module) || typeof j.name === 'string');
const foreignLoreList = (v: unknown) => Array.isArray(v) && v.some(e => plain(e) && 'content' in e && ('key' in e || 'insertorder' in e || 'alwaysActive' in e));
function foreignLore(entries: unknown, name: string, notes: string[]) {
  let folders = 0;
  const out: ReturnType<typeof newEntry>[] = [];
  for (const e of list(entries).filter(plain).slice(0, 5000)) {
    if (e.mode === 'folder') { folders++; continue; }
    const split = (s: unknown) => text(s, 20000).split(',').map(x => x.trim()).filter(Boolean);
    const ext: Obj = plain(e.extentions) ? e.extentions : plain(e.extensions) ? e.extensions : {};
    out.push(newEntry({
      name: text(e.comment, 300), keys: e.useRegex ? [text(e.key, 20000)].filter(Boolean) : split(e.key), keys2: e.selective ? split(e.secondkey) : [], content: text(e.content),
      constant: e.alwaysActive === true, order: numOr(e.insertorder, 100), probability: Math.min(100, Math.max(0, numOr(e.activationPercent, 100))), useRegex: e.useRegex === true,
      caseSensitive: Object.entries(ext).some(([k, v]) => /case_sensitive$/i.test(k) && v === true),
    }));
  }
  if (folders) notes.push(`로어북 폴더 ${folders}개는 풀어서 한 권에 담았어요.`);
  if (out.some(e => /^@@|\{\{#|\{\{\/|<\?/m.test(String(e.content)))) notes.push('로어북 내용에 든 그 프런트엔드 고유 문법(@@ 지시자 · 조건 블록)은 풀지 않고 글자 그대로 남겼어요.');
  return out.length ? [{ name, description: '', scanDepth: 4, tokenBudget: 2048, recursive: false, entries: out }] : [];
}
function foreignRegex(scripts: unknown, notes: string[]) {
  const out: Obj[] = []; let special = 0, flagged = 0;
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
export function readPack(j: unknown, base = ''): Plan {
  const notes: string[] = [], title = text(base, 120).replace(/\.[^.]+$/, '').replace(/\.dreamland-module$/i, '').trim();
  const meta = (o: Obj | null | undefined, fallback?: string) => ({ name: text(o?.name, 120).trim() || fallback || title || '가져온 모듈', description: text(o?.description, 4000), author: text(o?.author ?? o?.creator, 120), version: text(o?.version, 40), quick: [] as Quick[], css: '' });
  const done = (p: { source: string; module: Plan['module']; lore: unknown[]; regex: unknown[]; assets: Plan['assets']; notes: string[] }) => p as unknown as Plan;
  if (plain(j) && j.app === FILE_APP) {
    if (+(j.version as number) > FILE_VERSION) notes.push('더 새로운 드림랜드에서 만든 파일이에요. 모르는 내용은 건너뜁니다.');
    const jm = (j.module || null) as Obj | null;
    const m = meta(jm); m.quick = cleanQuick(jm?.quick); m.css = text(jm?.css, 200000);
    return done({ source: '드림랜드 모듈 파일', module: m, lore: list(j.lore).filter(plain).slice(0, 200).map((b, i) => cleanBook(b, `${m.name} 로어북 ${i + 1}`)), regex: list(j.regex).filter(plain).slice(0, 2000).map(cleanRegex), assets: cleanAssets(j.assets, notes), notes });
  }
  if (foreignModule(j)) {
    const src = (plain(j.module) ? j.module : j) as Obj, m = meta(src);
    const lore = foreignLore(src.lorebook, m.name, notes), regex = foreignRegex(src.regex, notes);
    const skipped = ([[list(src.trigger).length, (n: number) => `트리거 스크립트 ${n}개`], [text(src.cjs).trim() ? 1 : 0, () => '자바스크립트 코드'], [text(src.backgroundEmbedding).trim() ? 1 : 0, () => '배경에 끼워 넣는 HTML'], [text(src.customModuleToggle).trim() ? 1 : 0, () => '사용자 토글 정의'], [plain(src.mcp) ? 1 : 0, () => '외부 도구 서버 연결'], [src.lowLevelAccess ? 1 : 0, () => '저수준 접근 권한']] as [number, (n: number) => string][]).filter(([n]) => n).map(([n, f]) => f(n));
    if (skipped.length) notes.push(`실행되는 코드와 권한은 가져오지 않았어요: ${skipped.join(' · ')}.`);
    const pics = list(src.assets).filter(Array.isArray) as unknown[][], assets = cleanAssets(pics.map(a => ({ name: a[0], data: a[1] })), []);
    if (pics.length > assets.length) notes.push(`에셋 ${pics.length - assets.length}개는 이 파일에 그림 데이터가 들어 있지 않아 가져오지 못했어요.`);
    return done({ source: '다른 프런트엔드의 모듈 파일 · 로어북과 정규식만 옮깁니다', module: m, lore, regex, assets, notes });
  }
  if (plain(j) && foreignLoreList(j.data)) { const m = meta(j, title || '가져온 로어북'); return done({ source: '로어북 파일 · 모듈 하나로 감쌉니다', module: m, lore: foreignLore(j.data, m.name, notes), regex: [], assets: [], notes }); }
  if (plain(j) && j.type === 'regex' && Array.isArray(j.data)) { const m = meta(j, title || '가져온 정규식'); return done({ source: '정규식 파일 · 모듈 하나로 감쌉니다', module: m, lore: [], regex: foreignRegex(j.data, notes), assets: [], notes }); }
  if (plain(j) && plain(j.entries) || (plain(j) && Array.isArray(j.entries) && j.entries.length)) {
    const b = worldToLore(j, title || '로어북') as Obj, m = meta({ name: b.name, description: b.description });
    return done({ source: '실리태번 로어북 파일 · 모듈 하나로 감쌉니다', module: m, lore: [cleanBook(b, m.name)], regex: [], assets: [], notes });
  }
  const scripts = (Array.isArray(j) ? j : [j]).filter(r => plain(r) && typeof r.findRegex === 'string');
  if (scripts.length) return done({ source: '실리태번 정규식 파일 · 모듈 하나로 감쌉니다', module: meta({}, title || '가져온 정규식'), lore: [], regex: scripts.slice(0, 2000).map(r => cleanRegex(stRegexToRegex(r))), assets: [], notes });
  throw new Error('모듈로 읽을 수 있는 파일이 아니에요.');
}

/** 계획대로 들여놓는다. replace 에 기존 모듈 id 를 주면 그 모듈의 내용을 바꾼다(스위치 · 범위는 유지) */
export async function installPack(plan: Plan, { replace = '' } = {}) {
  await load();
  const old = replace ? byId(replace) : null, m = old || newModule(), kept = { lore: 0, regex: 0 };
  const swap = async (coll: 'lore' | 'regex', key: Kind, incoming: unknown[], make: (src: Obj, hit: Obj | null) => Obj) => {
    const before = old ? m[key].map(id => S.get(coll, id) as Obj | undefined).filter((o): o is Obj => !!o) : [], out: string[] = [];
    for (const raw of incoming) {
      const src = JSON.parse(JSON.stringify(raw)) as Obj;
      if (Array.isArray(src.entries)) src.entries = src.entries.map((e: Obj) => ({ ...e, id: uid() }));
      const hit = before.find(o => o.name === src.name && !out.includes(o.id as string));
      const rec = hit ? Object.assign(hit, make(src, hit)) : make(src, null);
      await S.save(coll, rec as Lore & Regex, true); out.push(rec.id as string);
    }
    kept[key] = before.filter(o => !out.includes(o.id as string)).length;    // 새 파일에 없는 예전 항목은 지우지 않고 모듈에서만 뺀다
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
const chatOwners = (chat?: Room) => chat ? [...list<string>(chat.charIds).map(Assets.ownerOfChar), Assets.ownerOfPersona(S.persona(chat)?.id)] : [];
/** 모듈이 더해 주는 그림 이름 (캐릭터 · 페르소나 에셋에 같은 이름이 있으면 그쪽이 먼저) */
function extraNames(chat: Room) {
  if (!liveOwners.length) return [];
  const have = new Set(Assets.names(chatOwners(chat)));
  return Assets.names(liveOwners).filter((n: string) => !have.has(n));
}

let wired = false;
/** 옛 f-modules.js 가 뜨면서 하던 등록: 프롬프트 조각 · 글 걸러내기 · 대화 열기 / 화면 이동 이벤트. 장면 패널은 src/features/modulesHooks.tsx 에서 */
export function wireModules() {
  if (wired) return; wired = true;
  X.prompt = X.prompt.filter((p: { owner?: string }) => p.owner !== 'modules');
  X.prompt.push({ owner: 'modules', fn: ({ chat }: { chat: Room }) => {
    const st = (S.settings.assets || {}) as Obj; if (st.inject === false) return [];
    const names = extraNames(chat); if (!names.length) return [];
    const tpl = text(cfg().assetPrompt).trim() || MOD_ASSET_PROMPT;
    return [{ where: 'depth', depth: Math.max(0, numOr(st.depth, 2)), order: 41, content: tpl.replace(/\{\{keywords\}\}/gi, names.join(', ')).replace(/\{\{max\}\}/gi, String(st.max || 2)), src: '모듈 에셋 안내문' }];
  } });
  X.filters = X.filters.filter((f: { owner?: string }) => f.owner !== 'modules');
  X.filters.push({ owner: 'modules', fn: (t: string, info?: Info) => {
    if (!t || !liveOwners.length || t.indexOf('{{img::') < 0) return t;
    const own = chatOwners(info?.chat), seed = info?.msg ? `${info.msg.id}:${info.msg.sw}:m` : ''; let n = 0;
    return t.replace(/\{\{img::([^}]+)\}\}/gi, (m: string, name: string) => Assets.resolve(own, name) ? m : (Assets.expand(m, liveOwners, seed && seed + n++) || m));
  } });
  on('chat:open', (chat?: Room) => { void enter(chat?.id); });
  on('route', (page: unknown) => { if (page !== 'chat') void leave(); else void sync(); });
}

export const Modules = {
  load, sync, enter, leave, create, remove, duplicate, pack, readPack, installPack, exportModule, setRoom, handOver, wake, effective, loreState, regexState, safeCss, ownerOf,
  get list() { return store.list; }, get live() { return live; }, byId,
  async save(m: Module) { await touch(m); return sync(); },
};
