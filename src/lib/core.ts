// ── Dreamland core: 유틸 · IndexedDB · 스토어 · 기본값 ── (옛 js/core.js 그대로)
import { fmtDate, getLang, t as tr } from '../i18n';
import { Server } from './server';
import type { Char, Chat, Colls, CollName, Conn, KvRow, Lore, LoreEntry, Msg, MsgsRow, Persona, Preset, PresetBlock, Regex, Role, Settings, StoreName, Asset } from './types';
import * as MS from './msgstore';
import { Av } from './avatars';
import { ADULT_RULES, FINAL_PIN, FLOW_RULES, SEX_PACING } from './default-prompts';

// replaceChildren / append 에 null·false·undefined 가 섞여 들어가면 글자로 찍히므로 걸러 낸다
type Kid = Node | string;
type KidFn = (this: Element, ...kids: Kid[]) => void;
for (const name of ['replaceChildren', 'append', 'prepend'] as const) {
  const proto = Element.prototype as unknown as Record<string, KidFn>;
  const orig = proto[name];
  proto[name] = function (this: Element, ...kids: unknown[]) { return orig.apply(this, (kids.flat(Infinity) as unknown[]).filter(k => k != null && k !== false) as Kid[]); };
}

/** 새 id: 앞은 시각이라 만든 차례대로 정렬된다. 같은 1ms 안에 여럿을 만들어도 차례가 섞이지 않게 두 자리 순번을 붙인다 (저장소는 id 순으로 돌려준다) */
let uidT = 0, uidN = 0;
export const uid = () => { const t = Date.now(); uidN = t === uidT ? uidN + 1 : 0; uidT = t; return t.toString(36) + (uidN < 1296 ? uidN.toString(36).padStart(2, '0') : 'zz') + Math.random().toString(36).slice(2, 7).padEnd(5, '0'); };
export const now = () => Date.now();
export const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));
const ESC: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export const esc = (s: unknown) => String(s ?? '').replace(/[&<>"']/g, c => ESC[c]);
export const $ = <E extends Element = HTMLElement>(sel: string, root: ParentNode = document) => root.querySelector<E>(sel);
export const $$ = <E extends Element = HTMLElement>(sel: string, root: ParentNode = document) => [...root.querySelectorAll<E>(sel)];
export const sleep = (ms: number) => new Promise<void>(r => setTimeout(r, ms));
export const bool = (v: unknown) => v === true || v === 'true' || v === 1;
export const arr = <T>(v: T | T[] | null | undefined | ''): T[] => Array.isArray(v) ? v : (v == null || v === '' ? [] : [v]);
export function parseMaybe<T = unknown>(v: unknown, fallback?: T): T {
  if (typeof v !== 'string') return (v ?? fallback) as T;
  try { return JSON.parse(v) as T; } catch { return fallback as T; }
}

export function debounce<A extends unknown[]>(fn: (...a: A) => unknown, ms = 300): (...a: A) => void {
  let t: ReturnType<typeof setTimeout> | undefined; return (...a: A) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
}

/** h() 의 자식: 노드 · 글 · 수 · 배열. null · false 는 건너뛴다 */
export type HKid = Node | string | number | boolean | null | undefined | HKid[];
export type HProps = Record<string, unknown>;
/** h('div.cls#id', {onclick, title, html, ...attrs}, ...children) — 옛 확장 API 가 쓰므로 남긴다 */
export function h<E extends HTMLElement = HTMLElement>(spec: string, props?: HProps | HKid | null, ...kids: HKid[]): E {
  const m = spec.match(/^([a-z0-9]+)?((?:[.#][\w-]+)*)$/i);
  const el = document.createElement(m?.[1] || 'div') as E;
  (m?.[2] || '').replace(/([.#])([\w-]+)/g, (_, t: string, n: string) => { if (t === '.') el.classList.add(n); else el.id = n; return ''; });
  let pr: HProps | null = props as HProps | null;
  if (props != null && (typeof props !== 'object' || props instanceof Node || Array.isArray(props))) { kids.unshift(props as HKid); pr = null; }
  const bag = el as unknown as Record<string, unknown>;
  for (const [k, v] of Object.entries(pr || {})) {
    if (v == null || v === false) continue;
    if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v as EventListener);
    else if (k === 'html') el.innerHTML = v as string;
    else if (k === 'text') el.textContent = v as string;
    else if (k === 'style' && typeof v === 'object') { const st = el.style as unknown as Record<string, unknown>; for (const [p, val] of Object.entries(v as Record<string, string>)) p.startsWith('--') ? el.style.setProperty(p, val) : (st[p] = val); }
    else if (k === 'class') el.className += (el.className ? ' ' : '') + v;
    else if (k === 'dataset') Object.assign(el.dataset, v);
    else if (k in el && k !== 'list' && k !== 'form') { try { bag[k] = v; } catch { el.setAttribute(k, v as string); } }
    else el.setAttribute(k, v === true ? '' : v as string);
  }
  const add = (c: HKid): void => { if (c == null || c === false) return; if (Array.isArray(c)) c.forEach(add); else el.append(c instanceof Node ? c : document.createTextNode(String(c))); };
  kids.forEach(add);
  return el;
}

export function download(name: string, data: BlobPart | Blob, type = 'application/json') {
  const blob = data instanceof Blob ? data : new Blob([data], { type });
  if (Server.app) { void Server.saveFile(name, blob).catch(e => console.warn('[save]', e)); return; }
  const a = h<HTMLAnchorElement>('a', { href: URL.createObjectURL(blob), download: name });
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}

export function pickFiles({ accept = '', multiple = false, dir = false }: { accept?: string; multiple?: boolean; dir?: boolean } = {}) {
  return new Promise<File[]>(resolve => {
    if (/iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)) accept = accept.split(',').map(x => x.trim()).filter(x => x.includes('/')).join(',');   // 아이폰 · 아이패드: 확장자로 거르면 고를 수 없는 파일이 생긴다 — 종류(image/* 등)만 남긴다
    const inp = h<HTMLInputElement>('input', { type: 'file', accept, multiple, style: { display: 'none' } });
    if (dir) inp.webkitdirectory = true;
    inp.addEventListener('change', () => { resolve([...(inp.files || [])]); inp.remove(); });
    inp.addEventListener('cancel', () => { resolve([]); inp.remove(); });
    document.body.append(inp); inp.click();
  });
}

export const readText = (f: Blob) => f.text();
export const readBuf = (f: Blob) => f.arrayBuffer();
export const readDataURL = (f: Blob) => new Promise<string>((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result as string); r.onerror = rej; r.readAsDataURL(f); });
export function bytesToDataURL(bytes: Uint8Array | ArrayBuffer | ArrayLike<number>, mime = 'image/png') {
  let s = ''; const u = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes as ArrayBuffer);
  for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode.apply(null, u.subarray(i, i + 0x8000) as unknown as number[]);
  return `data:${mime};base64,${btoa(s)}`;
}
export function dataURLToBytes(url: string) {
  const b = atob(url.split(',')[1] || ''); const u = new Uint8Array(b.length);
  for (let i = 0; i < b.length; i++) u[i] = b.charCodeAt(i);
  return u;
}
const MIMES: Record<string, string> = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', gif: 'image/gif', avif: 'image/avif' };
export const mimeOf = (name: unknown) => MIMES[(String(name).split('.').pop() as string).toLowerCase()] || 'image/png';

/** 큰 이미지를 줄여 dataURL 로 (DB 용량 절약) */
export function shrinkImage(src: string, max = 720, mime = 'image/webp', q = 0.9) {
  return new Promise<string>(resolve => {
    const img = new Image();
    img.onload = () => {
      const k = Math.min(1, max / Math.max(img.width, img.height));
      if (k === 1 && src.length < 400000) return resolve(src);
      const c = document.createElement('canvas');
      c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
      (c.getContext('2d') as CanvasRenderingContext2D).drawImage(img, 0, 0, c.width, c.height);
      resolve(c.toDataURL(mime, q));
    };
    img.onerror = () => resolve('');
    img.src = src;
  });
}

export function fmtTime(ts: number | string | Date | null | undefined) {
  if (!ts) return '';
  const d = new Date(ts), n = new Date();
  const same = d.getFullYear() === n.getFullYear() && d.getMonth() === n.getMonth() && d.getDate() === n.getDate();
  if (same) return fmtDate(d, { hour: '2-digit', minute: '2-digit' });   // 만들어 둔 형식기를 다시 쓴다 (메시지마다 새로 만들면 느리다)
  if (d.getFullYear() === n.getFullYear()) return getLang() === 'ko' ? `${d.getMonth() + 1}월 ${d.getDate()}일` : fmtDate(d, { month: 'short', day: 'numeric' });
  return getLang() === 'ko' ? `${d.getFullYear()}.${d.getMonth() + 1}.${d.getDate()}` : fmtDate(d, { year: 'numeric', month: 'numeric', day: 'numeric' });
}
export function parseDate(v: unknown): number {
  if (!v) return 0;
  if (typeof v === 'number') return v < 1e12 ? v * 1000 : v;
  const t = Date.parse(v as string);
  if (!isNaN(t)) return t;
  // "2024-3-1@14h05m33s" / "2024-03-01 @14h 05m 33s 120ms"
  const m = String(v).match(/(\d{4})-(\d{1,2})-(\d{1,2})\s*@?\s*(\d{1,2})h\s*(\d{1,2})m\s*(\d{1,2})s/);
  if (m) return new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]).getTime();
  return 0;
}

// ── 이벤트 버스 ──
export type Listener = (data?: unknown) => void;
const listeners: Record<string, Set<Listener>> = {};
export const on = <T = unknown>(ev: string, fn: (data: T) => void) => { const f = fn as Listener; (listeners[ev] ||= new Set()).add(f); return () => { listeners[ev].delete(f); }; };
export const emit = (ev: string, data?: unknown) => { (listeners[ev] || []).forEach(fn => { try { fn(data); } catch (e) { console.error(e); } }); };

/** 이 브라우저에 저장된 설정이 있었는가 (없으면 처음 켠 · 비운 브라우저: 켜면서 기본 설정을 저장하지 않는다 — 서버 자료 폴더의 설정을 받아 오기 전에 덮지 않게) */
let settingsStored = false;
export const hasStoredSettings = () => settingsStored;
// ── IndexedDB ──
// assets: 캐릭터 에셋·삽화 이미지,  mem: 대화별 장기기억
const STORES: StoreName[] = ['chars', 'chats', 'msgs', 'personas', 'lore', 'presets', 'conns', 'regex', 'kv', 'assets', 'mem'];
let dbp: Promise<IDBDatabase> | undefined;
function db() {
  return dbp ||= new Promise<IDBDatabase>((res, rej) => {
    const r = indexedDB.open('dreamland', 3);
    r.onupgradeneeded = () => { for (const s of STORES) if (!r.result.objectStoreNames.contains(s)) r.result.createObjectStore(s, { keyPath: 'id' });
      const as = (r.transaction as IDBTransaction).objectStore('assets'); if (!as.indexNames.contains('owner')) as.createIndex('owner', 'owner'); };
    r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
  });
}
async function tx<T>(store: string, mode: IDBTransactionMode, fn: (o: IDBObjectStore) => IDBRequest | void): Promise<T> {
  const d = await db();
  return new Promise<T>((res, rej) => {
    const t = d.transaction(store, mode); const out = fn(t.objectStore(store));
    t.oncomplete = () => res(out?.result as T); t.onerror = () => rej(t.error); t.onabort = () => rej(t.error);
  });
}
// 최근에 연 대화의 메시지 목록은 메모리에 들고 있는다 — 방에 다시 들어갈 때 통째로 읽어 오지 않게 (S.msgsFast)
// 어디서든 msgs 저장소에 쓰면 그 방의 사본을 버린다. 다른 탭에서 쓴 것도 알려 받는다.
// 메시지 저장소는 긴 대화를 조각으로 나눠 둔다 (src/lib/msgstore.ts) — 이 앱이 아닌 쪽(다른 탭 · 가져오기 · 자료 폴더)이 쓰면 조각 배치도 잊는다
const msgCache = new Map<string, Msg[]>(); let msgVer = 0, msgBus: BroadcastChannel | null = null; const extVer = new Map<string, number>();
// own: 메시지 저장소(msgstore)가 메모리의 목록을 쓴 것 — 들고 있는 사본은 그대로 맞으므로 버리지 않는다
const msgDrop = (id?: string | null, own = false) => {
  msgVer++;
  const c = id == null ? null : MS.chatOfId(id);
  emit('msgs:wrote', c);   // 그 방(null = 전부)의 메시지가 쓰였다 — 메시지를 세어 둔 캐시(책상 위젯)가 듣는다
  if (own) return;
  if (c == null) { msgCache.clear(); extVer.clear(); MS.forget(null); }
  else { msgCache.delete(c); MS.forget(c); extVer.set(c, (extVer.get(c) || 0) + 1); }
};
const msgKeep = (id: string, list: Msg[]) => { msgCache.delete(id); msgCache.set(id, list); while (msgCache.size > 4) msgCache.delete(msgCache.keys().next().value as string); };
try { msgBus = new BroadcastChannel('dreamland-msgs'); msgBus.onmessage = e => msgDrop(e.data); } catch { }
/** assets 저장소에 쓰거나 지우면 알린다 (id 가 없으면 여러 줄이 한꺼번에 바뀐 것) — 그림 목록이 달라진 줄만 다시 읽는 데 쓴다 */
const assetSubs = new Set<(id?: string) => void>();
export const onAssetWrite = (f: (id?: string) => void) => { assetSubs.add(f); return () => { assetSubs.delete(f); }; };
const wrote = (s: string, id?: unknown, own = false) => { if (s === 'assets') { for (const f of assetSubs) try { f(id == null ? undefined : String(id)); } catch { } return; } if (s !== 'msgs') return; msgDrop(id as string | null | undefined, own); try { msgBus?.postMessage(id == null ? null : MS.chatOfId(id)); } catch { } };
/** 메시지 저장소에 닿는 길 (msgstore 가 쓴다). 쓰기는 DB.batch 를 거친다 — 자료 폴더 거울이 그것을 감싸 따라 보낸다 */
const msgIo: MS.Io = {
  tx: (mode, fn) => tx<unknown>('msgs', mode, o => { fn(o); }),
  batch: fn => DB.batch('msgs', fn as Parameters<typeof DB.batch>[1]),
};

// 빈 브라우저로 켠 뒤 뒤에서 서버 자료를 가져오는 동안(src/datafolder/hydrate.ts): 아직 안 온 것을 읽거나 쓰기 전에 그것부터 가져온다
//  · store(s): 그 저장소를 통째로 읽으려면(all · keys · byOwner) 다 올 때까지 기다린다
//  · one(s, id): 그 한 줄(메시지는 그 방 전부 · 기억은 그 방 것)을 먼저 가져온다 — 방을 열 때 빈 방이 보이거나, 새 메시지가 옛 기록을 덮지 않게
export interface LazyGate { store(s: string): Promise<void> | null; one(s: string, id: string): Promise<void> | null }
let lazy: LazyGate | null = null;
export const setLazyGate = (g: LazyGate | null) => { lazy = g; };
const ONE = new Set(['msgs', 'mem']);
const gateAll = <T,>(s: string, run: () => Promise<T>): Promise<T> => { const w = lazy?.store(s); return w ? w.then(run) : run(); };
const gateOne = <T,>(s: string, id: unknown, run: () => Promise<T>): Promise<T> => { const w = lazy && ONE.has(s) ? lazy.one(s, String(id)) : null; return w ? w.then(run) : run(); };

/** 저장소 이름 → 한 줄의 꼴 */
export interface Rows extends Colls { msgs: MsgsRow; kv: KvRow; assets: Asset; mem: { id: string; [k: string]: unknown } }
// 캐릭터(chars)는 Av 를 거친다: 메모리의 초상 꼬리표를 저장된 그림으로 바꿔 넣고, 그림을 뺀 사본도 맞춘다 (src/lib/avatars.ts)
const putNow = (s: StoreName, v: object): Promise<IDBValidKey> => { wrote(s, (v as { id?: unknown })?.id); return s === 'chars' ? Av.put(v as Parameters<typeof Av.put>[0]) as Promise<IDBValidKey> : tx<IDBValidKey>(s, 'readwrite', o => o.put(v)); };
const delNow = (s: StoreName, id: IDBValidKey): Promise<undefined> => { wrote(s, id); return tx<undefined>(s, 'readwrite', o => o.delete(id)).then(r => { if (s === 'chars') Av.dropped([String(id)]); return r; }); };
export const DB = {
  all: <K extends StoreName>(s: K) => gateAll(s, () => tx<Rows[K][]>(s, 'readonly', o => o.getAll())),
  get: <K extends StoreName>(s: K, id: IDBValidKey) => gateOne(s, id, () => tx<Rows[K] | undefined>(s, 'readonly', o => o.get(id))),
  put: <K extends StoreName>(s: K, v: Rows[K] | object): Promise<IDBValidKey> => lazy && ONE.has(s) ? gateOne(s, (v as { id?: unknown })?.id, () => putNow(s, v)) : putNow(s, v),
  del: (s: StoreName, id: IDBValidKey): Promise<undefined> => lazy && ONE.has(s) ? gateOne(s, id, () => delNow(s, id)) : delNow(s, id),
  clear: (s: StoreName) => { wrote(s); return tx<undefined>(s, 'readwrite', o => o.clear()).then(r => { if (s === 'chars') Av.cleared(); return r; }); },
  /** 열쇠(id)만 */
  keys: (s: StoreName) => gateAll(s, () => tx<IDBValidKey[]>(s, 'readonly', o => o.getAllKeys())),
  /** 여러 줄을 한 번의 읽기로 → 없는 것은 undefined */
  many: <K extends StoreName>(s: K, ids: IDBValidKey[]) => { const out: (Rows[K] | undefined)[] = []; return tx<unknown>(s, 'readonly', o => { ids.forEach((id, i) => { const q = o.get(id); q.onsuccess = () => { out[i] = q.result as Rows[K]; }; }); }).then(() => out); },
  /** wait: false — 빈 브라우저로 켠 뒤 그림을 아직 가져오는 중이어도 기다리지 않고 지금 있는 것만 (켤 때 읽는 딱지처럼: 다 오면 'data:hydrated' 로 다시 읽는다) */
  byOwner: (owner: string, { wait = true }: { wait?: boolean } = {}) => wait ? gateAll('assets', () => tx<Asset[]>('assets', 'readonly', o => o.index('owner').getAll(owner))) : tx<Asset[]>('assets', 'readonly', o => o.index('owner').getAll(owner)),
  /** assets 의 [id, 주인] 만 — 그림 글자를 읽지 않는다 (목록을 맞춰 볼 때) */
  owners: () => { const out: [string, string][] = []; return tx<unknown>('assets', 'readonly', o => { const q = o.index('owner').openKeyCursor(); q.onsuccess = () => { const c = q.result; if (c) { out.push([String(c.primaryKey), String(c.key)]); c.continue(); } }; }).then(() => out); },
  bulk: (s: StoreName, list: object[]) => { wrote(s); return s === 'chars' ? Av.bulk(list as Parameters<typeof Av.bulk>[0]) as Promise<undefined> : tx<undefined>(s, 'readwrite', o => { list.forEach(v => o.put(v)); }); },
  /** 한 트랜잭션 안에서 여러 줄을 쓰고 지운다 (fn 이 그 자리에서 읽어 보고 정할 수 있다). 다 되면 쓴 줄 · 지운 id 를 돌려준다 */
  batch: (s: StoreName, fn: (o: IDBObjectStore, log: { put(v: object): void; del(id: IDBValidKey): void }) => void) => {
    const put: object[] = [], del: IDBValidKey[] = [];
    return tx<unknown>(s, 'readwrite', o => { fn(o, { put: v => { o.put(v); put.push(v); }, del: id => { o.delete(id); del.push(id); } }); })
      .then(() => { const ids = new Set([...put.map(v => (v as { id?: unknown }).id), ...del].map(id => s === 'msgs' ? MS.chatOfId(id) : id)); for (const id of ids) wrote(s, id, true); if (s === 'chars') Av.dropped([...ids].map(String)); return { put, del }; });
  },
};

// ── 기본값 ──
export const MARKERS: Record<string, string> = {
  main: '메인 프롬프트', worldInfoBefore: '로어북 (앞)', personaDescription: '페르소나', charDescription: '캐릭터 설명',
  charPersonality: '캐릭터 성격', scenario: '시나리오', worldInfoAfter: '로어북 (뒤)', dialogueExamples: '대화 예시',
  summary: '장기기억 자리', chatHistory: '채팅 기록', jailbreak: '후속 지시',
};

// 기본 프리셋의 메인 지시문. 옛 문장을 그대로 쓰고 있는 프리셋만 불러올 때 새 문장으로 바꾼다 (직접 고친 것은 건드리지 않는다)
const MAIN_PROMPT_OLD = "Write {{char}}'s next reply in a fictional roleplay between {{char}} and {{user}}. Stay in character, keep the story moving, and never write {{user}}'s actions or dialogue for them. Put spoken dialogue in double quotes and inner thoughts in single quotes.";
export const MAIN_PROMPT = `You write {{char}}'s side of an ongoing roleplay with {{user}}. Write the next reply only.
- Stay inside {{char}}: their voice, knowledge, mood and motives, as the character sheet and the story so far show them. The world and its other characters are yours to write too. {{user}} is not — never write {{user}}'s words, actions, thoughts or decisions, and stop where {{user}} would need to respond.
- Every reply moves the scene: something is done, said, noticed or changed. Do not restate what just happened, and do not reuse phrasing or sentence patterns from your recent replies.
- Be concrete: specific actions, sensory detail and dialogue, rather than summaries of what someone feels.
- Spoken dialogue goes in "double quotes" and inner thoughts in 'single quotes'. Write in the language of the story so far.
- This is fiction written for and with consenting adults. Mature content (violence, dark themes, profanity and explicit sex) is allowed when the story calls for it: write it plainly and in full, without softening it, fading to black, adding warnings or stepping out of the story to comment. Anyone in a sexual scene is an adult.`;
/** 잠깐 썼던 기본 후속 지시 (손대지 않은 프리셋에서 새 고정핀으로 바꾼다) */
const AFTER_PROMPT_V1 = `[Before you write: continue from where the story last stopped and take it forward. Do not replay finished beats or repeat your last reply's lines, images or shape. Keep the intensity the scene already has — do not soften, sanitise, moralise or wrap things up early. In explicit moments use direct, unsoftened words.]`;
const MAIN_PROMPT_V4 = `You write {{char}}'s side of an ongoing roleplay with {{user}}. Write the next reply only.
- Stay inside {{char}}: their voice, knowledge, mood and motives, as the character sheet and the story so far show them. The world and its other characters are yours to write too. {{user}} is not — never write {{user}}'s words, actions, thoughts or decisions, and stop where {{user}} would need to respond.
- Pick up exactly where the story stopped and move it on: something is done, said, noticed or changed. Keep track of what has already happened, which lines were already crossed and what is still open — never replay a finished beat as if it were new (a first touch, a realisation, a fight that already happened). New wording for the same beat is still a repeat.
- Do not restate what just happened, and do not reuse phrasing, images or sentence patterns from your recent replies.
- Be concrete: specific actions, sensory detail and dialogue, rather than summaries of what someone feels.
- Let things build and pay off. A scene may run over many replies, but each reply changes something in it (position, pace, who leads, what is said, a choice, an outcome). When a moment has clearly built to its peak, let it happen instead of circling it, then stop at what comes right after.
- Spoken dialogue goes in "double quotes" and inner thoughts in 'single quotes'. Write in the language of the story so far.
- This is fiction written for and with consenting adults. Mature content (violence, dark themes, profanity and explicit sex) is allowed when the story calls for it: write it plainly and in full, without softening it, fading to black, adding warnings or stepping out of the story to comment. In sex scenes, name body parts and acts with the direct everyday words a native speaker would use — crude ones too, when the characters would say them — never clinical terms (like 성기) or coy euphemisms (like 그곳, 중심, 은밀한 곳), and show what actually happens rather than mood alone. Anyone in a sexual scene is an adult.`;
const MAIN_PROMPT_V2 = `You write {{char}}'s side of an ongoing roleplay with {{user}}. Write the next reply only.
- Stay inside {{char}}: their voice, knowledge, mood and motives, as the character sheet and the story so far show them. The world and its other characters are yours to write too. {{user}} is not — never write {{user}}'s words, actions, thoughts or decisions, and stop where {{user}} would need to respond.
- Every reply moves the scene: something is done, said, noticed or changed. Do not restate what just happened, and do not reuse phrasing or sentence patterns from your recent replies.
- Be concrete: specific actions, sensory detail and dialogue, rather than summaries of what someone feels.
- Spoken dialogue goes in "double quotes" and inner thoughts in 'single quotes'. Write in the language of the story so far.`;
/** 기본 프리셋에 싣는 지침 블록 (src/lib/default-prompts.ts): 성인 · 비순화 지침은 채팅 기록 앞, 전개 · 정사 완급은 채팅 기록 뒤 */
/** 내용 지문 (FNV-1a + 길이) — 손대지 않은 옛 기본 문장인지 견줄 때만 */
const fp = (t: string) => { let h = 0x811c9dc5; for (let i = 0; i < t.length; i++) { h ^= t.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; } return h.toString(36) + t.length.toString(36); };
/** 잠깐 실렸던 한국어판의 지문 */
const KO_V1: Record<string, string> = { 'dl-adult': '1tnjlix2i5', 'dl-flow': 'x687302yp', 'dl-sexpace': 'is5yyl1h3', pin: '1ipvyrhee' };
export const DL_RULES: [string, string, string][] = [['dl-adult', '성인 · 비순화 지침', ADULT_RULES], ['dl-flow', '전개 지침', FLOW_RULES], ['dl-sexpace', '정사 완급', SEX_PACING]];
const dlRuleBlocks = (): PresetBlock[] => DL_RULES.map(([stId, name, content]) => ({ id: uid(), kind: 'text', name, role: 'system', content, enabled: true, depth: null, stId }));
export function defaultPreset(): Preset {
  const b = (kind: string, extra: Partial<PresetBlock> = {}): PresetBlock => ({ id: uid(), kind, name: MARKERS[kind] || extra.name || '프롬프트', role: 'system', content: '', enabled: true, depth: null, ...extra });
  return {
    id: uid(), name: '드림랜드 기본', createdAt: now(), dlRules: 2,
    params: { temperature: 1, topP: null, topK: null, maxTokens: 4096, contextSize: 128000, freqPen: null, presPen: null, minP: null, topA: null, repPen: null, seed: null, stream: true, effort: '', squash: true, prefill: '', stop: [], cardOverrides: true, namesInGroup: true },
    blocks: [
      b('main', { content: MAIN_PROMPT }),
      b('worldInfoBefore'),
      b('personaDescription', { content: "[{{user}}'s persona]\n{{slot}}" }),
      b('charDescription'),
      b('charPersonality', { content: "[{{char}}'s personality: {{slot}}]" }),
      b('scenario', { content: '[Scenario: {{slot}}]' }),
      b('worldInfoAfter'),
      b('dialogueExamples'),
      ...dlRuleBlocks().slice(0, 1),
      b('summary', { content: '{{slot}}' }),
      b('chatHistory'),
      ...dlRuleBlocks().slice(1),
      b('jailbreak', { content: FINAL_PIN }),
    ],
  };
}

export const defaultSettings = (): Settings => ({
  id: 'settings', theme: 'moonpress', customThemes: [], font: 'pretendard', fontCustom: '', chatFont: '', chatFontCustom: '', fontSize: 16, lineHeight: 1.8, chatWidth: 780, bubbles: true, motion: true, avatarShape: 'round', exts: {},
  enterSend: 'auto', autoScroll: true, showMeta: true, customCss: '', userNameFallback: '나',   // enterSend: true(항상) · false(끔) · 'auto'(휴대폰에서는 줄바꿈)
  // 사용자 설정 (src/features/usersettings.tsx): 알림음 · 넘기기 · 삭제 확인 · 시작할 때 마지막 대화 · 쓰던 글 되살리기 · 메시지 표시
  ux: { sound: false, soundVolume: 60, soundUnfocused: false, swipes: true, gestures: false, confirmDelete: true, autoLoadChat: true, restoreInput: true, clickEdit: false, mdKeys: false, logPrompts: false, toastPos: 'bottom', showIds: true, showAvatars: true, metaTime: true, metaModel: true, metaTimer: true, metaTokens: true },
  activeConn: '', activePreset: '', activePersona: '', activeLore: [],
  summary: { enabled: false, every: 20, keep: 6, trim: true, prompt: 'Summarize the roleplay so far in a compact, factual way (events, relationships, current situation, unresolved threads). Merge it with the existing summary and write the result in the same language as the roleplay. Output only the summary.' },
  tracker: { enabled: false, inject: true, mode: 'call', hud: true, fields: '시간: 작중 현재 날짜와 시각\n장소: 현재 위치\n날씨: 현재 날씨\n분위기: 장면의 분위기 한 줄\n{{char}}의 기분: 현재 감정 상태' },
  translate: { lang: '한국어', auto: false, autoInput: false, inputLang: 'English', context: 3, prompt: '', maxTokens: 8000 },
  memory: { enabled: false, auto: true, tokenBudget: 8000, topK: 10, minScore: 0.12, minCosine: 0.05, mmrLambda: 0.74, maxPerKind: 3, maxPerTurn: 2, chunkTurns: 30, chunkTurnsTalk: 0, talkBatch: 5, rpBatch: 10, arcMergeAt: 6, consolidateEvery: 30, maxMemories: 400, cast: true, refProfile: true, summaryContextCount: 3, fossil: 40, language: 'auto', trim: false, keepRecent: 20, responseTokens: 6000, prompt: '' },
  illust: { auto: false, mode: 'plan', every: 1, maxScenes: 1, backend: 'nai', naiKey: '', connId: '', a1111: 'http://127.0.0.1:7860', model: 'nai-diffusion-5-full', imgModel: '', width: 832, height: 1216, steps: 23, scale: 7, sampler: 'k_euler_ancestral', style: '', direction: '', world: '', playerMode: 'auto', contextMessages: 8, negative: 'lowres, bad anatomy, watermark', quality: true, planPrompt: '', analysisPrompt: '' },
  defaultMode: 'rp', rpBubbles: false,
  modes: { choices: false, choiceCount: 3, together: true, talkPrompt: '', talkTokens: 400, commands: true, stagger: true, presenceDelay: false, auto: false, autoMinutes: 10, scenes: true, sceneStart: true, later: true, laterMax: 3, away: true, awayHours: 3, notify: false, autoBackoff: 2, autoStreak: 3, autoDaily: 0, quietFrom: '', quietTo: '', autoHidden: false, readReact: true, autoConn: '', autoTokens: 0 },
  // 고급 포맷팅: context · instruct · sysprompt · reasoning 은 템플릿 파일과 같은 키를 쓴다 (js/advanced.js)
  format: { v: 2, trimSpaces: true, trimSentences: false, collapseNewlines: false, singleLine: false, fixMarkdown: false, alwaysForceName2: true, stopStrings: [], stopMacro: true, tokenPadding: 64, startReplyWith: '', showBias: true, mdEscape: '', storyMode: true, ccExampleSep: '', ccChatStart: '', modelMap: {},
    context: { name: 'Default', story_string: '{{#if anchorBefore}}{{anchorBefore}}\n{{/if}}{{#if system}}{{system}}\n{{/if}}{{#if wiBefore}}{{wiBefore}}\n{{/if}}{{#if description}}{{description}}\n{{/if}}{{#if personality}}{{personality}}\n{{/if}}{{#if scenario}}{{scenario}}\n{{/if}}{{#if wiAfter}}{{wiAfter}}\n{{/if}}{{#if persona}}{{persona}}\n{{/if}}{{#if anchorAfter}}{{anchorAfter}}\n{{/if}}{{trim}}', example_separator: '***', chat_start: '***', use_stop_strings: false, names_as_stop_strings: true, story_string_position: 0, story_string_depth: 1, story_string_role: 0 },
    instruct: { enabled: false, name: 'Alpaca', bind_to_context: false, input_sequence: '### Instruction:', input_suffix: '\n\n', output_sequence: '### Response:', output_suffix: '\n\n', system_sequence: '### Input:', system_suffix: '\n\n', last_system_sequence: '', first_input_sequence: '', first_output_sequence: '', last_input_sequence: '', last_output_sequence: '', story_string_prefix: '', story_string_suffix: '\n\n', stop_sequence: '', wrap: true, macro: true, names_behavior: 'force', activation_regex: '', skip_examples: false, user_alignment_message: '', system_same_as_user: false, sequences_as_stop_strings: true },
    sysprompt: { enabled: true, name: 'Neutral - Chat', content: "Write {{char}}'s next reply in a fictional chat between {{char}} and {{user}}.", post_history: '' },
    reasoning: { name: 'Think XML', autoParse: true, autoExpand: false, addToPrompts: false, maxAdditions: 1, prefix: '<think>', suffix: '</think>', separator: '\n' } },
  templates: { context: [], instruct: [], sysprompt: [], reasoning: [] },
  security: { blockRemoteImages: false, serverKeys: true },
  assets: { inject: true, max: 2, random: true, prompt: '' },
  helpers: { all: '', translate: '', memory: '', illust: '' },
  quick: [{ label: '계속', text: '/continue' }, { label: '주사위', text: '/roll 1d20' }, { label: '장면 전환', text: '/sys 시간이 조금 흐른다.' }],
  bridge: { st: '', me: '' }, lastChat: '', lastPage: 'home', globalVars: {}, onboarded: false,
  // 로어북 전체 설정
  lore: { includeNames: false, minActivations: 0, minDepthMax: 0, maxRecursion: 0, groupScoring: false },
  // 빠른 버튼 세트 (js/qr-data.js) · 자동 이어쓰기 · 자동 다시 생성 · 재생성 이유 · 연출 지시 · 연결 프로필 (js/f-flow.js)
  qr: { v: 1, sets: [], bar: true },
  auto: { cont: { on: false, target: 400, max: 2, talk: false }, swipe: { on: false, minLen: 0, words: [], threshold: 1, max: 2 } },
  regenWhy: { ask: false, format: '', withDraft: false },
  direct: { prompt: '', past: 'drop', pastFormat: '', v: 2, hide: false },
  profiles: [],
});

export const newChar = (o: Partial<Char> = {}): Char => ({
  id: uid(), name: tr('core.newChar'), avatar: '', description: '', personality: '', scenario: '', firstMes: '', altGreetings: [], mesExample: '',
  systemPrompt: '', postHistory: '', creatorNotes: '', creator: '', version: '', tags: [], fav: false, talk: 0.5,
  depthPrompt: { prompt: '', depth: 4, role: 'system' }, ext: {}, more: {}, loreIds: [], bind: { connId: '', presetId: '', personaId: '' }, createdAt: now(), updatedAt: now(), ...o,
});
export const newPersona = (o: Partial<Persona> = {}): Persona => ({ id: uid(), name: '나', avatar: '', description: '', loreIds: [], createdAt: now(), ...o });
export const newLore = (o: Partial<Lore> = {}): Lore => ({ id: uid(), name: tr('core.newLore'), description: '', scanDepth: 4, tokenBudget: 2048, recursive: false, caseSensitive: false, wholeWord: false, entries: [], createdAt: now(), ...o });
export const newEntry = (o: Partial<LoreEntry> = {}): LoreEntry => ({
  id: uid(), name: '', keys: [], keys2: [], logic: 0, content: '', constant: false, enabled: true, position: 'before', depth: 4, role: 'system',
  order: 100, probability: 100, caseSensitive: null, wholeWord: null, useRegex: false, noRecurse: false, outlet: '', group: '', sticky: null, cooldown: null, delay: null, scanDepth: null,
  // 월드 인포의 고급 옵션 (caseSensitive · wholeWord · useGroupScoring 의 null 은 "로어북 설정을 따름")
  ignoreBudget: false, excludeRecursion: false, delayUntilRecursion: 0, groupOverride: false, groupWeight: 100, useGroupScoring: null,
  matchPersona: false, matchCharDesc: false, matchCharPersonality: false, matchCharNote: false, matchScenario: false, matchCreatorNotes: false,
  charFilter: { names: [], tags: [], exclude: false }, triggers: [], automationId: '', ...o,
});
// 정규식 스크립트. scope: 'global' 전역 · 캐릭터 id · 'preset'(프리셋의 regex 배열 안에 산다). 대상: onUser · onAI · onSlash(명령어로 넣은 글) · onLore(로어북 내용) · onReason(생각 과정).
// mode: display 화면만 · prompt 전송만 · both 둘 다 · store 원문을 바꿔 저장. subst: 찾기 안의 매크로 0 그대로 · 1 값 넣기 · 2 기호를 글자로 바꿔 넣기. order: 같은 범위 안의 순서
export const newRegex = (o: Partial<Regex> = {}): Regex => ({ id: uid(), name: tr('core.newRegex'), find: '', replace: '', trim: [], onUser: false, onAI: true, onSlash: false, onLore: false, onReason: false, mode: 'display', enabled: true, runOnEdit: true, subst: 0, minDepth: null, maxDepth: null, scope: 'global', order: 0, ...o });
export const newConn = (o: Partial<Conn> = {}): Conn => ({ id: uid(), name: tr('core.newConn'), provider: 'openai', baseUrl: '', apiKey: '', model: '', proxy: false, postProcess: 'none', extraHeaders: '', extraBody: '', cache: false, ...o });
export const newChat = (o: Partial<Chat> = {}): Chat => ({
  id: uid(), name: '', charIds: [], personaId: '', note: { text: '', depth: 4, role: 'system' }, summary: '', summaryAt: 0, vars: {}, loreIds: [],
  tracker: {}, bg: '', mode: 'rp', diary: [], diaryAt: 0, groupOrder: 'natural', count: 0, preview: '', createdAt: now(), updatedAt: now(), ...o,
});
/** 채팅 모델을 고르는 곳에 보일 연결 (음성 연결 'tts_…' 은 빼고 — 읽어 주기 src/tts 가 쓴다) */
export const chatConns = (): Conn[] => S.conns.filter(c => !String(c.provider || '').startsWith('tts_'));
export const newMsg =(role: Role, text: string, o: Partial<Msg> = {}): Msg => ({ id: uid(), role, charId: '', name: '', swipes: [{ text, ts: now() }], sw: 0, hidden: false, ts: now(), ...o });
export const msgText = (m: Pick<Msg, 'swipes' | 'sw'>) => m.swipes[m.sw]?.text ?? '';

// ── 서버 보관: 드림랜드 서버가 있으면 API 키를 서버 파일에만 두고, 여기에는 꼬리표만 남긴다 ──
const SEC_RE = /@@dl:[\w-]+:\w+@@/;
export interface SecretItem { tail: string; hosts?: string[]; note?: string }
type SecField = 'apiKey' | 'serviceAccount';
export const Secrets = {
  ok: false, items: {} as Record<string, Record<string, SecretItem>>,
  ref: (id: string, field: string) => `@@dl:${id}:${field}@@`,
  is: (v: unknown): v is string => typeof v === 'string' && SEC_RE.test(v),
  get on() { return this.ok && S.settings.security?.serverKeys !== false; },
  tail(id: string, field: string) { return this.items[id]?.[field]?.tail || ''; },
  has(id: string, field: string) { return !!this.items[id]?.[field]; },
  async post(path: string, body: unknown): Promise<Record<string, string>> { const r = await Server.post('secrets/' + path, body); const j = await r.json().catch(() => ({})) as Record<string, string>; if (!r.ok) throw new Error(j.error || tr('core.secretFail')); return j; },
  async init() { try { const r = await Server.get('secrets'); if (r.ok && (r.headers.get('content-type') || '').includes('json')) { this.items = await r.json(); this.ok = true; } } catch { this.ok = false; } return this.ok; },
  async put(id: string, field: string, value: string, hosts: string[], note = '') { const j = await this.post('put', { id, field, value, hosts, note }); (this.items[id] ||= {})[field] = { tail: j.tail || '', hosts, note }; return this.ref(id, field); },
  async del(id: string, field?: string) { if (!this.ok) return; await this.post('delete', { id, field }).catch(() => { }); if (field) delete this.items[id]?.[field]; else delete this.items[id]; },
  async reveal(id: string, field: string) { return (await this.post('reveal', { id, field })).value; },
  /** 연결의 키를 보낼 수 있는 주소 */
  hostsFor(conn: Partial<Conn> | null | undefined, fallback = '') {
    const out: string[] = []; for (const u of [...String(conn?.baseUrl || '').split(/[\s,]+/), fallback]) { try { if (u) out.push(new URL(u).hostname); } catch { } }   // 주소가 여럿(중계 여러 개)이면 모두
    if (conn?.provider === 'vertexai' || /aiplatform\.googleapis\.com/.test(fallback)) out.push('googleapis.com');
    return [...new Set(out)];
  },
  /** 브라우저에 남아 있는 키를 서버로 옮긴다. 옮긴 수를 돌려준다 */
  async sweep(baseOf: (c: Conn) => string = () => '') {
    if (!this.on || Vault.locked) return 0; let n = 0;
    for (const c of S.conns) {
      let touched = false;
      if (c.apiKey && !this.is(c.apiKey)) { const hosts = this.hostsFor(c, baseOf(c)); if (hosts.length) { c.apiKey = await this.put(c.id, 'apiKey', c.apiKey, hosts, c.name); touched = true; } }
      if (c.serviceAccount && !this.is(c.serviceAccount)) { try { const j = JSON.parse(c.serviceAccount); c.saEmail = j.client_email || ''; c.saProject = j.project_id || ''; c.serviceAccount = await this.put(c.id, 'serviceAccount', JSON.stringify(j), ['googleapis.com'], c.saEmail); touched = true; } catch { } }
      if (touched) { n++; await S.save('conns', c, true); }
    }
    const il = S.settings.illust; if (il?.naiKey && !this.is(il.naiKey)) { il.naiKey = await this.put('illust', 'naiKey', il.naiKey, ['novelai.net'], 'NovelAI'); S.saveSettings(); n++; }
    return n;
  },
  /** 서버 보관을 끄고 키를 브라우저로 되돌린다 (서버를 실행한 PC 에서만) */
  async restore() {
    for (const c of S.conns) { let t = false; for (const f of ['apiKey', 'serviceAccount'] as SecField[]) if (this.is(c[f])) { c[f] = await this.reveal(c.id, f); await this.del(c.id, f); t = true; } if (t) await S.save('conns', c, true); }
    const il = S.settings.illust; if (this.is(il?.naiKey)) { il.naiKey = await this.reveal('illust', 'naiKey'); await this.del('illust', 'naiKey'); S.saveSettings(); }
  },
};
// 꼬리표가 든 요청은 반드시 드림랜드 서버를 거친다 (서버가 실제 키를 끼워 넣는다)
declare global { interface Window { __dlFetch?: typeof fetch } }
if (typeof window !== 'undefined' && !window.__dlFetch) {
  const raw = window.__dlFetch = window.fetch.bind(window);
  window.fetch = (input: RequestInfo | URL, init: RequestInit = {}) => {
    try {
      if (typeof input === 'string' && !Server.isApi(input)) {
        const hs: Record<string, string> = init.headers instanceof Headers ? Object.fromEntries(init.headers.entries()) : { ...(init.headers as Record<string, string> || {}) }, body = typeof init.body === 'string' ? init.body : init.body instanceof URLSearchParams ? init.body.toString() : undefined;
        if (SEC_RE.test(input) || SEC_RE.test(JSON.stringify(hs)) || (body && SEC_RE.test(body))) return Server.proxy({ url: input, method: init.method || 'GET', headers: hs, body }, init.signal);
      }
    } catch { }
    return raw(input, init).catch((e: unknown) => { throw netError(e, input); });
  };
}
/** 브라우저가 요청을 아예 못 보냈을 때의 오류인지 (크롬 'Failed to fetch' · 사파리 'Load failed' · 파이어폭스 'NetworkError…') */
export const isNetFail = (e: unknown) => { const x = e as { name?: string; message?: string; net?: boolean } | null; return !!x && (x.net === true || (x.name === 'TypeError' && /^(Failed to fetch|Load failed|NetworkError|network error|The network connection was lost)/i.test(String(x.message || '')))); };
/** 'Failed to fetch' 같은 브라우저 문구만으로는 무엇이 안 됐는지 알 수 없다. 어디에 닿지 못했는지와 해 볼 일을 적은 오류로 바꾼다.
 *  원래 문구는 끝의 괄호와 raw 에 남긴다 (문구로 가리는 옛 코드가 그대로 돌게). 멈춘 요청(AbortError)과 그 밖의 오류는 그대로 둔다 */
function netError(e: unknown, input: RequestInfo | URL): unknown {
  if (!isNetFail(e) || (e as { net?: boolean }).net) return e;
  const rawMsg = String((e as Error).message || ''), url = typeof input === 'string' ? input : input instanceof URL ? input.href : (input as Request).url || '';
  let host = ''; try { host = new URL(url, location.href).host; } catch { /* 주소를 못 읽으면 비운다 */ }
  const mine = Server.isApi(url) || (!!host && host === location.host);
  const msg = typeof navigator !== 'undefined' && navigator.onLine === false ? tr('core.net.offline', { raw: rawMsg })
    : mine ? tr('core.net.server', { raw: rawMsg }) : tr('core.net.host', { host: host || url.slice(0, 60), raw: rawMsg });
  return Object.assign(new TypeError(msg), { net: true, raw: rawMsg, host, cause: e });
}

// ── 금고: 암호를 걸면 API 키·서비스 계정·NovelAI 키를 암호화해서 저장한다 ──
const b64e = (u: Uint8Array) => { let s = ''; for (const c of u) s += String.fromCharCode(c); return btoa(s); };
const b64d = (s: string) => Uint8Array.from(atob(s), c => c.charCodeAt(0));
export const Vault = {
  key: null as CryptoKey | null,
  get on() { return !!S.settings.vault; },
  get locked() { return this.on && !this.key; },
  async derive(pass: string, salt: Uint8Array) {
    if (!crypto?.subtle) throw new Error(tr('core.vaultInsecure'));
    const base = await crypto.subtle.importKey('raw', new TextEncoder().encode(pass), 'PBKDF2', false, ['deriveKey']);
    return crypto.subtle.deriveKey({ name: 'PBKDF2', salt: salt as BufferSource, iterations: 250000, hash: 'SHA-256' }, base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
  },
  async enc(this: { key: CryptoKey | null }, text: string, key: CryptoKey | null = this.key) { const iv = crypto.getRandomValues(new Uint8Array(12)); return 'v1:' + b64e(iv) + ':' + b64e(new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key as CryptoKey, new TextEncoder().encode(text)))); },
  async dec(this: { key: CryptoKey | null }, blob: unknown, key: CryptoKey | null = this.key) { const [, iv, ct] = String(blob).split(':'); return new TextDecoder().decode(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: b64d(iv) as BufferSource }, key as CryptoKey, b64d(ct) as BufferSource)); },
  async enable(pass: string) {
    const salt = crypto.getRandomValues(new Uint8Array(16)); const key = await this.derive(pass, salt);
    this.key = key; S.settings.vault = { salt: b64e(salt), check: await this.enc('dreamland', key) };
    await this.resave();
  },
  async unlock(pass: string) {
    const v = S.settings.vault as { salt: string; check: string }; const key = await this.derive(pass, b64d(v.salt));
    try { if (await this.dec(v.check, key) !== 'dreamland') return false; } catch { return false; }
    this.key = key;
    // 잠긴 동안 새로 적은 키는 그대로 두고, 비어 있는 칸만 보관해 둔 값으로 채운다. 그다음 지금 값을 다시 잠가 저장한다
    // (잠긴 채로는 키를 저장할 수 없어서, 그동안 적은 키는 메모리에만 있었다)
    for (const c of S.conns) if (c.sec) { try { const old = JSON.parse(await this.dec(c.sec)) as Record<string, string>; for (const [k, v] of Object.entries(old)) if (!(c as unknown as Record<string, unknown>)[k]) (c as unknown as Record<string, unknown>)[k] = v; } catch { } }
    if (S.settings.illustSec && !S.settings.illust.naiKey) { try { S.settings.illust.naiKey = await this.dec(S.settings.illustSec); } catch { } }
    await this.resave();
    return true;
  },
  async disable() { if (this.locked) throw new Error(tr('core.vaultUnlockFirst')); delete S.settings.vault; delete S.settings.illustSec; this.key = null; await this.resave(); },
  async resave() { for (const c of S.conns) await S.save('conns', c, true); await DB.put('kv', await this.packSettings()); emit('vault'); },
  /** 저장용 사본: 비밀 값은 암호문으로만 남긴다 */
  async packConn(c: Conn): Promise<Conn> {
    if (!this.on) { const { sec: _sec, ...plain } = c; void _sec; return plain as Conn; }
    if (!this.key) return { ...c, apiKey: '', serviceAccount: '' };   // 잠긴 채로는 기존 암호문을 그대로 둔다
    return { ...c, apiKey: '', serviceAccount: '', sec: await this.enc(JSON.stringify({ apiKey: c.apiKey || '', serviceAccount: c.serviceAccount || '' })) };
  },
  async packSettings(): Promise<Settings> {
    const s = S.settings; if (!this.on) return s;
    if (!this.key) return { ...s, illust: { ...s.illust, naiKey: '' } };
    return { ...s, illust: { ...s.illust, naiKey: '' }, illustSec: s.illust?.naiKey ? await this.enc(s.illust.naiKey) : '' };
  },
};

// ── 스토어 (메모리 캐시 + IndexedDB) ──
Av.init({
  tx: (mode, fn) => tx<unknown>('chars', mode, o => { fn(o); }),
  all: () => tx<Char[]>('chars', 'readonly', o => o.getAll()), keys: () => tx<IDBValidKey[]>('chars', 'readonly', o => o.getAllKeys()), get: id => tx<Char | undefined>('chars', 'readonly', o => o.get(id)),
  find: id => S.get('chars', id), list: () => S.chars, changed: () => emit('chars', null),
});
type Plain = Record<string, unknown>;
const LISTS: CollName[] = ['chars', 'chats', 'personas', 'lore', 'presets', 'conns', 'regex'];
export interface Store {
  chars: Char[]; chats: Chat[]; personas: Persona[]; lore: Lore[]; presets: Preset[]; conns: Conn[]; regex: Regex[]; settings: Settings;
  _ix?: Partial<Record<CollName, Map<string, number>>>;
  load(): Promise<void>;
  get<K extends CollName>(coll: K, id: string | null | undefined): Colls[K] | undefined;
  save<K extends CollName>(coll: K, obj: Colls[K], silent?: boolean): Promise<Colls[K]>;
  remove(coll: CollName, id: string): Promise<void>;
  saveSettings: () => void;
  set(patch: { [K in keyof Settings]?: unknown }): void;
  /** 이 캐릭터들의 초상을 메모리에 통째로 올려 둔다 (지금 대화의 등장인물 — 나머지는 꼬리표로 되돌린다. src/lib/avatars.ts) */
  holdAvatars(ids: string[]): Promise<void>;
  /** 초상 그림 글자(data URL). 메모리에 꼬리표로만 있으면 저장소에서 읽어 온다 */
  avatarData(o: { avatar?: unknown } | null | undefined): Promise<string>;
  /** 지금 바로 줄 수 있는 초상 그림 글자 (꼬리표인데 아직 읽지 않았으면 '' — 읽어 두니 다음에는 준다) */
  avatarNow(o: { avatar?: unknown } | null | undefined): string;
  msgs(chatId: string): Promise<Msg[]>;
  msgsFast(chatId: string): Promise<Msg[]>;
  /** 메모리에 들고 있는 그 방의 목록 (없으면 undefined) — 읽기만 할 때 */
  msgsCached(chatId: string): Msg[] | undefined;
  saveMsgs(chat: Chat, list: Msg[]): Promise<void>;
  /** 메시지 목록만 저장한다 (대화방의 미리보기 · 개수 · 시각은 고치지 않는다) */
  putMsgs(chatId: string, list: Msg[]): Promise<void>;
  /** 저장된 대화에서 ids 의 메시지만 fn 으로 고쳐 쓴다 (화면이 들고 있는 목록을 통째로 덮어쓰지 않게). 고친 수 */
  patchMsgs(chatId: string, ids: string[], fn: (row: Msg) => boolean): Promise<number>;
  /** 이 메시지를 고쳤다고 알린다 — 오래된 메시지라도 다음 저장 때 바로 쓰인다 (알리지 않아도 저장한 뒤 한가할 때 견주어 쓴다) */
  touchMsgs(...ms: (Msg | null | undefined)[]): void;
  /** 예전 꼴(한 줄)로 저장된 긴 방인가 — 한가할 때 putMsgs 로 미리 조각으로 옮겨 두면 첫 저장이 가볍다 */
  splitDue(chatId: string): boolean;
  conn(): Conn | undefined;
  helperConn(task: string, chat?: Chat | null): Conn | undefined;
  preset(): Preset;
  bindOf(chat?: Chat | null): Partial<Char['bind']>;
  connFor(chat?: Chat | null): Conn | undefined;
  presetFor(chat?: Chat | null): Preset;
  persona(chat?: Chat | null): Persona;
  exportAll(): Promise<Record<string, unknown>>;
  importAll(data: unknown, replace?: boolean): Promise<void>;
}
const ixOf: Record<string, { arr: unknown; len: number; last?: string } | undefined> = {};
export const S: Store = {
  chars: [], chats: [], personas: [], lore: [], presets: [], conns: [], regex: [], settings: defaultSettings(),
  async load() {
    const self = this as unknown as Record<CollName, unknown[]>;
    // 저장소들을 나란히 읽는다. 캐릭터는 초상을 빼고 읽는다 (Av) — 초상까지 통째로 읽으면 캐릭터가 많을 때 켜는 데만 몇 초가 걸린다
    const [rows, s] = await Promise.all([Promise.all(LISTS.map(c => c === 'chars' ? Av.loadChars() : DB.all(c))), DB.get('kv', 'settings') as Promise<Plain | undefined>]);
    LISTS.forEach((c, i) => { self[c] = rows[i] as unknown[]; }); this._ix = {};
    const d = defaultSettings() as unknown as Plain;
    this.settings = { ...d, ...(s || {}) } as unknown as Settings;
    settingsStored = !!s;
    const set = this.settings as unknown as Plain;
    const plain = (v: unknown): v is Plain => !!v && typeof v === 'object' && !Array.isArray(v);
    for (const k of Object.keys(d)) { const dk = d[k]; if (plain(dk)) {
      const cur: Plain = set[k] = { ...dk, ...(plain(s?.[k]) ? s[k] as Plain : {}) };
      for (const j of Object.keys(dk)) { const dj = dk[j]; if (plain(dj) && Object.keys(dj).length) cur[j] = { ...dj, ...(plain(cur[j]) ? cur[j] as Plain : {}) }; }   // 한 단계 더: 새로 생긴 하위 키를 기본값으로 채운다
    } }
    const sf = s?.format as Plain | undefined;
    if (sf && sf.v !== 2) this.settings.format.v = sf.v as number;   // 예전 형식은 js/advanced.js 의 AF() 가 옮긴다
    if (s && !s.look4) Object.assign(this.settings, { theme: d.theme, fontSize: d.fontSize, chatWidth: d.chatWidth }); // 새 디자인으로 한 번 맞춘다
    this.settings.look4 = true;
    // 연출 지시: 예전 설정(지난 지시를 꼬리표로 남기기)이 기본이던 때의 값은 '그 답변 한 번에만'으로 한 번 옮긴다
    if (plain(s?.direct) && (s.direct as Plain).v !== 2) { (set.direct as Plain).past = 'drop'; (set.direct as Plain).v = 2; }
    if (!this.presets.length) { const p = defaultPreset(); this.presets.push(p); await DB.put('presets', p); }
    // 손대지 않은 기본 프리셋(메인이 옛 기본 문장 그대로): 메인은 지금 기본으로, 지침 블록(성인 · 비순화 · 전개 · 정사 완급)과 후속 지시 고정핀을 한 번 넣는다 (프리셋에 표시해 두어 지운 블록을 다시 넣지 않는다)
    for (const p of this.presets) {
      const mark = p as Preset & { dlRules?: number }; if (mark.dlRules) continue;
      const bl = p.blocks || [], main = bl.find(b => b.kind === 'main'); if (!main || ![MAIN_PROMPT_OLD, MAIN_PROMPT_V2, MAIN_PROMPT_V4, MAIN_PROMPT].includes(main.content)) continue;
      main.content = MAIN_PROMPT;
      const sid = (b: PresetBlock) => (b as PresetBlock & { stId?: string }).stId, have = new Set(bl.map(sid)), adds = dlRuleBlocks().filter(b => !have.has(sid(b)));
      const adult = adds.find(b => sid(b) === 'dl-adult'), after = adds.filter(b => sid(b) !== 'dl-adult'), hi = bl.findIndex(b => b.kind === 'chatHistory');
      if (hi < 0) bl.push(...adds); else { bl.splice(hi + 1, 0, ...after); if (adult) bl.splice(hi, 0, adult); }
      const jb = bl.find(b => b.kind === 'jailbreak'); if (jb && (!String(jb.content || '').trim() || jb.content === AFTER_PROMPT_V1)) jb.content = FINAL_PIN;
      p.blocks = bl; mark.dlRules = 1; await DB.put('presets', p);
    }
    // 잠깐 한국어로 실렸던 지침 블록 · 고정핀: 손대지 않았으면(내용 지문이 같으면) 영어판으로
    for (const p of this.presets) {
      const mark = p as Preset & { dlRules?: number }; if (mark.dlRules !== 1) continue;
      let ch = false;
      for (const b of p.blocks || []) { const id = (b as PresetBlock & { stId?: string }).stId, f = fp(String(b.content || ''));
        const next = id && KO_V1[id] === f ? DL_RULES.find(r => r[0] === id)?.[2] : b.kind === 'jailbreak' && KO_V1.pin === f ? FINAL_PIN : undefined;
        if (next) { b.content = next; ch = true; } }
      mark.dlRules = 2; await DB.put('presets', p); void ch;
    }
    if (!this.personas.length) { const p = newPersona({ name: '나' }); this.personas.push(p); await DB.put('personas', p); }
    if (!this.get('presets', this.settings.activePreset)) this.settings.activePreset = this.presets[0].id;
    if (!this.get('personas', this.settings.activePersona)) this.settings.activePersona = this.personas[0].id;
    if (!this.get('conns', this.settings.activeConn)) this.settings.activeConn = this.conns[0]?.id || '';
  },
  get<K extends CollName>(coll: K, id: string | null | undefined): Colls[K] | undefined {
    const arr = (this as unknown as Record<string, Colls[K][] | undefined>)[coll]; if (!arr || id == null || id === '') return undefined;
    if (arr.length < 24) return arr.find(x => x.id === id);
    let ix = this._ix?.[coll]; if (ix) { const p = ix.get(id); if (p !== undefined && arr[p]?.id === id) return arr[p]; const m = ixOf[coll]; if (p === undefined && m && m.arr === arr && m.len === arr.length && m.last === arr[arr.length - 1]?.id) return undefined; }   // 없는 id 를 찾을 때마다 목록을 다시 훑지 않는다 (목록이 그대로일 때만)
    ix = new Map(); for (let i = 0; i < arr.length; i++) ix.set(arr[i].id, i); (this._ix ||= {})[coll] = ix; ixOf[coll] = { arr, len: arr.length, last: arr[arr.length - 1]?.id };
    const p = ix.get(id); return p === undefined ? undefined : arr[p];
  },
  async save<K extends CollName>(coll: K, obj: Colls[K], silent?: boolean) {
    if (coll !== 'chats') obj.updatedAt = now(); // 대화의 시각은 마지막 메시지 기준 (saveMsgs)
    const list = (this as unknown as Record<string, Colls[K][]>)[coll];
    const i = list.findIndex(x => x.id === obj.id);
    if (i >= 0) list[i] = obj; else list.push(obj);
    if (coll === 'conns') { const packed = await Vault.packConn(obj as Conn); if (packed.sec) (obj as Conn).sec = packed.sec; await DB.put(coll, packed); }
    else if (coll === 'chars') { const before = (obj as Char).avatar; await DB.put(coll, obj); Av.settle(obj as Char, before); }
    else await DB.put(coll, obj);
    if (!silent) emit(coll, obj);
    if (coll === 'conns') emit('conns:saved', obj);
    return obj;
  },
  async remove(coll, id) {
    const self = this as unknown as Record<string, { id: string }[]>;
    self[coll] = self[coll].filter(x => x.id !== id);
    await DB.del(coll, id);
    if (coll === 'conns') await Secrets.del(id);
    if (coll === 'chats') { await lazy?.one('msgs', id); await MS.remove(msgIo, id); await DB.del('mem', id); await DB.del('kv', 'vec:' + id).catch(() => { }); await DB.del('kv', 'memcp:' + id).catch(() => { }); emit('chat:deleted', id); }
    emit(coll, null);
  },
  saveSettings: debounce(async () => DB.put('kv', await Vault.packSettings()), 200),
  set(patch) { Object.assign(this.settings, patch); this.saveSettings(); emit('settings', patch); },
  holdAvatars: ids => Av.hold(ids),
  avatarData: o => Av.data(o?.avatar),
  avatarNow: o => Av.peek(o?.avatar),
  async msgs(chatId) { await lazy?.one('msgs', chatId); return (await MS.read(msgIo, chatId, false)).list; },
  /** 대화 화면용: 방금까지 열어 둔 방이면 메모리의 목록을 바로 돌려준다 (저장된 것과 같은 내용) */
  async msgsFast(chatId) {
    const hit = msgCache.get(chatId); if (hit) { msgKeep(chatId, hit); return hit; }
    await lazy?.one('msgs', chatId);
    const v = msgVer, r = await MS.read(msgIo, chatId, true);
    if (r.missing) emit('msgs:partial', { chatId, missing: r.missing });   // 조각 일부를 찾지 못했다 (자료 폴더에서 아직 다 받아 오지 못했다): 있는 만큼 보여 준다
    else if (v === msgVer) msgKeep(chatId, r.list);   // 읽는 사이 누가 저장했으면 들고 있지 않는다
    return r.list;
  },
  msgsCached: chatId => msgCache.get(chatId),
  async saveMsgs(chat, list) {
    chat.count = list.length;
    let last: Msg | undefined; for (let i = list.length - 1; i >= 0; i--) if (list[i].role !== 'system') { last = list[i]; break; }
    last ||= list[list.length - 1];
    const tail = list[list.length - 1];
    chat.updatedAt = tail ? Math.max(tail.ts || 0, tail.swipes?.[tail.sw]?.ts || 0) || now() : now();
    chat.preview = last ? msgText(last).replace(/\s+/g, ' ').slice(0, 90) : '';
    await lazy?.one('msgs', chat.id);
    const e = extVer.get(chat.id) || 0; await MS.write(msgIo, chat.id, list);
    if (e === (extVer.get(chat.id) || 0)) msgKeep(chat.id, list);   // 그사이 다른 곳에서 이 방을 썼으면 다음에 다시 읽는다
    await this.save('chats', chat, true);
  },
  async putMsgs(chatId, list) { await lazy?.one('msgs', chatId); if (msgCache.get(chatId) !== list) msgCache.delete(chatId); await MS.write(msgIo, chatId, list); },
  patchMsgs: async (chatId, ids, fn) => { await lazy?.one('msgs', chatId); return MS.patch(msgIo, chatId, ids, fn); },
  touchMsgs: (...ms) => MS.touch(...ms),
  splitDue: chatId => MS.splitDue(chatId),
  conn() { return this.get('conns', this.settings.activeConn); },
  // 번역·기억·삽화 같은 보조 작업에 쓸 연결 (지정하지 않으면 대화의 연결)
  helperConn(task, chat) {
    const c = this.get('conns', this.settings.helpers?.[task]) || this.get('conns', this.settings.helpers?.all) || this.connFor(chat), m = String((this.settings as { helperModel?: Record<string, string> }).helperModel?.[task] || '').trim();
    return c && m && m !== c.model ? { ...c, model: m } : c;   // 일마다 모델만 따로 정해 둘 수 있다 (연결은 그대로 — 기능 › 보조 연결의 표)
  },
  preset() { return this.get('presets', this.settings.activePreset) || this.presets[0]; },
  // 캐릭터에 지정해 둔 연결·프리셋·페르소나가 있으면 그것이 먼저
  bindOf(chat) { return this.get('chars', chat?.charIds?.[0])?.bind || {}; },
  // 대화에서 고른 연결 · 모델(chat.modelConn · chat.model)이 가장 먼저. 모델만 바꾼 것은 연결을 고치지 않고 사본으로 돌려준다 (다른 대화는 그대로)
  connFor(chat) {
    const c = this.get('conns', chat?.modelConn as string) || this.get('conns', this.bindOf(chat).connId) || this.conn(), m = typeof chat?.model === 'string' ? chat.model.trim() : '';
    return c && m && m !== c.model ? { ...c, model: m } : c;
  },
  presetFor(chat) { return this.get('presets', this.bindOf(chat).presetId) || this.preset(); },
  /** 이 대화에서 말할 페르소나. 대화에서 직접 고른 것(personaAuto === false)이 가장 먼저, 그다음 캐릭터에 연결한 것, 방을 열 때 저절로 적어 둔 것, 기본 페르소나 순 */
  persona(chat) {
    const own = this.get('personas', chat?.personaId), bound = this.get('personas', this.bindOf(chat).personaId);
    return (own && (chat as Chat).personaAuto === false ? own : bound || own) || this.get('personas', this.settings.activePersona) || this.personas[0];
  },
  async exportAll() {
    const out: Record<string, unknown> = { app: 'dreamland', version: 1, exportedAt: new Date().toISOString() };
    for (const c of STORES) out[c] = await DB.all(c);
    out.msgs = MS.flatten(out.msgs as MS.HeadRow[]);   // 긴 대화의 조각은 한 방 한 줄({ id, list })로 합쳐 넣는다 — 예전 판 · 다른 도구도 읽게
    out.conns = (out.conns as Conn[]).map(({ sec: _sec, ...c }) => { void _sec; return { ...c, apiKey: '', serviceAccount: '' }; });   // 비밀 값은 백업에 넣지 않는다 (암호문도)
    out.mem = (out.mem as unknown[]).map(m => JSON.parse(JSON.stringify(m, (_k, v) => ArrayBuffer.isView(v) ? undefined : v)));   // 벡터는 다시 계산할 수 있는 캐시
    out.kv = (out.kv as KvRow[]).filter(r => !String(r.id).startsWith('vec:'));   // 벡터는 다시 만들 수 있는 캐시라 백업에 넣지 않는다
    out.kv = (out.kv as KvRow[]).map(r => { if (r.id !== 'settings') return r; const { vault: _v, illustSec: _i, ...s } = r; void _v; void _i; return { ...s, illust: { ...(s.illust as Plain || {}), naiKey: '' } }; });
    return out;
  },
  async importAll(raw, replace) {
    const data = raw as Record<string, unknown> | null | undefined;
    if (data?.app !== 'dreamland') throw new Error(tr('core.notBackup'));
    // 백업에는 키가 없다: 같은 연결이 이미 있으면 그 키를 지킨다. 확장 코드와 확장 켜짐 목록, 키 잠금 정보는 파일에서 들이지 않는다
    const oldConns = new Map((await DB.all('conns')).map(c => [c.id, c])), oldSet = await DB.get('kv', 'settings') as Plain | undefined;
    for (const c of STORES) {
      if (!Array.isArray(data[c])) continue;
      let rows = (data[c] as unknown[]).filter((r): r is Plain => !!r && typeof r === 'object' && (r as Plain).id != null);
      if (c === 'conns') rows = rows.map(r => { const o = oldConns.get(r.id as string); return o ? { ...r, apiKey: r.apiKey || o.apiKey || '', serviceAccount: r.serviceAccount || o.serviceAccount || '', ...(o.sec ? { sec: o.sec } : {}) } : r; });
      if (c === 'kv') rows = rows.filter(r => !/^(ext:|extdata:|vec:)/.test(String(r.id)) && (replace || r.id !== 'settings'))   // 합쳐 넣을 때는 지금 설정을 그대로 둔다
        .map(r => r.id === 'settings' ? { ...r, exts: oldSet?.exts || {}, ...(oldSet?.vault ? { vault: oldSet.vault } : {}), ...(oldSet?.illustSec ? { illustSec: oldSet.illustSec } : {}), illust: { ...(r.illust as Plain || {}), naiKey: (r.illust as Plain | undefined)?.naiKey || (oldSet?.illust as Plain | undefined)?.naiKey || '' } } : r);
      if (replace) { if (c === 'kv') { for (const r of await DB.all('kv')) if (!/^(ext:|extdata:)/.test(String(r.id))) await DB.del('kv', r.id); } else await DB.clear(c); }
      else if (c === 'msgs') { const stale = await MS.staleParts(msgIo, rows as unknown as MS.HeadRow[]); if (stale.length) await DB.batch('msgs', (_o, log) => { for (const id of stale) log.del(id); }); }   // 덮어쓸 방에 남은 조각 (가져온 목록과 어긋난다)
      await DB.bulk(c, rows);
    }
    await this.load();
    if (Vault.key) { for (const c of this.conns) if (c.sec) { try { Object.assign(c, JSON.parse(await Vault.dec(c.sec))); } catch { } } if (this.settings.illustSec) { try { this.settings.illust.naiKey = await Vault.dec(this.settings.illustSec); } catch { } } }
    emit('data:imported');
  },
};
