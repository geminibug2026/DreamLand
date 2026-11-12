// ── Dreamland ext: 확장 기능 (설치 · 불러오기 · API) ── (옛 js/ext.js 그대로. 관리 화면 'exts' 는 src/pages 에 있다)
// 확장 API(makeApi)의 모양은 옛 것과 같다 — 확장은 DOM 을 돌려받고 DOM 을 건넨다. 창 · 폼은 src/ui 의 React 판 위에 DOM 을 얹는다
import { S, DB, h, on, emit, uid } from './core';
import { X, dropOwner } from './hooks';
import { icon, btn, iconBtn } from './icons';
import { go, registerPage, refresh } from './router';
import { applyTheme } from './theme';
import { quickCall, tokens, macro } from './engine';
import { render } from './format';
import { chatApi } from '../chat/actions';
import { toast, menu, confirmBox, promptBox } from '../ui';
import { avatar, modal, form } from '../ui/dom';

export const APP_VERSION = '1.1.0';
export interface CatalogItem { id: string; name: string; version?: string; author?: string; description?: string; source: 'folder' | 'installed'; entry?: string; css?: string; code?: string }
export interface Loaded { cleanup: (() => unknown)[]; error: string; meta: CatalogItem }
export const loaded = new Map<string, Loaded>();   // id → { cleanup[], error, meta }
export let catalog: CatalogItem[] = [];            // [{ id, name, version, author, description, source: 'folder'|'installed', entry, css, code }]
export const enabled = (id: string) => S.settings.exts?.[id] === true;

function makeApi(id: string) {
  const rec = loaded.get(id) as Loaded;
  const off = <F extends () => unknown>(fn: F) => { rec.cleanup.push(fn); return fn; };
  const reg = <T extends object>(list: T[], item: object) => { list.push({ owner: id, ...item } as unknown as T); emit('ext:changed'); };
  const data: { cache: Record<string, unknown> | null } = { cache: null };
  const store = {
    async get(key: string, def?: unknown) { data.cache ||= ((await DB.get('kv', 'extdata:' + id))?.data as Record<string, unknown>) || {}; return key in data.cache ? data.cache[key] : def; },
    async set(key: string, value: unknown) { data.cache ||= ((await DB.get('kv', 'extdata:' + id))?.data as Record<string, unknown>) || {}; data.cache[key] = value; await DB.put('kv', { id: 'extdata:' + id, data: data.cache }); },
  };
  type Fn = (...a: unknown[]) => unknown;
  return {
    id, appVersion: APP_VERSION,
    // 화면 도구
    h, icon, btn, iconBtn, avatar, toast, modal, menu, form, confirm: confirmBox, prompt: promptBox, go, render,
    // 데이터
    data: S, store,
    // 이벤트: ready · route · chat:open · message:sent · message:received · prompt:ready · generate:start · generate:end · settings
    on: (ev: string, fn: Fn) => off(on(ev, (...a: unknown[]) => { try { fn(...a); } catch (e) { console.error(`[확장 ${id}]`, e); } })),
    // 등록
    command: (name: string, def: Fn | { run: Fn; help?: string; [k: string]: unknown }) => { X.commands.set('/' + String(name).replace(/^\//, '').toLowerCase(), { owner: id, ...(typeof def === 'function' ? { run: def } : def) }); },
    macro: (name: string, fn: Fn) => { X.macros.set(String(name).toLowerCase(), { owner: id, fn }); },
    panel: (def: object) => reg(X.panels, def),
    messageAction: (def: object) => reg(X.actions, def),
    composerAction: (def: object) => reg(X.composer, def),
    textFilter: (fn: Fn) => reg(X.filters, { fn }),
    theme: (theme: { id?: string; [k: string]: unknown }) => { reg(X.themes, { theme: { ...theme, id: `ext-${id}-${theme.id || uid()}`, builtin: true } }); },
    page: (def: { id?: string; render(root: HTMLElement): unknown; [k: string]: unknown }) => { const pid = `ext-${id}-${def.id || 'page'}`; registerPage(pid, root => def.render(root)); reg(X.pages, { ...def, id: pid }); return pid; },
    style: (css: string) => { const el = h('style', { dataset: { ext: id } }, css); document.head.append(el); off(() => el.remove()); return el; },
    // 채팅 · AI
    chat: chatApi,
    ai: { quick: quickCall, tokens, macro },
  };
}
export type ExtApi = ReturnType<typeof makeApi>;
interface ExtModule { default?: { activate?: (api: ExtApi) => unknown; manifest?: Record<string, string> } & Record<string, unknown>; activate?: (api: ExtApi) => unknown; manifest?: Record<string, string> }

async function load(item: CatalogItem) {
  if (loaded.has(item.id)) return;
  const rec: Loaded = { cleanup: [], error: '', meta: item }; loaded.set(item.id, rec);
  try {
    let url = item.entry as string, blob: string | null = null;
    if (item.code != null) { blob = URL.createObjectURL(new Blob([item.code], { type: 'text/javascript' })); url = blob; }
    const mod = await import(/* @vite-ignore */ url) as ExtModule;
    if (blob) URL.revokeObjectURL(blob);
    if (item.css) { const l = h('link', { rel: 'stylesheet', href: item.css, dataset: { ext: item.id } }); document.head.append(l); rec.cleanup.push(() => l.remove()); }
    const def = (mod.default || mod) as ExtModule;
    const activate = def.activate || mod.activate;
    if (typeof activate !== 'function') throw new Error('activate(api) 함수를 찾을 수 없어요');
    const ret = await activate(makeApi(item.id));
    if (typeof ret === 'function') rec.cleanup.push(ret as () => unknown);
  } catch (e) { console.error(`[확장 ${item.id}]`, e); rec.error = (e as Error).message || String(e); }
  emit('ext:changed');
}
export function unload(id: string) {
  const rec = loaded.get(id); if (!rec) return;
  for (const fn of rec.cleanup.reverse()) { try { fn(); } catch (e) { console.warn(e); } }
  dropOwner(id); loaded.delete(id); applyTheme(); emit('ext:changed');
}

export async function readCatalog() {
  const folder: CatalogItem[] = await fetch('/api/extensions').then(r => r.ok ? r.json() : []).catch(() => []);
  const installed = (await DB.all('kv')).filter(r => String(r.id).startsWith('ext:')).map(r => ({ ...(r.meta as object), id: r.extId as string, code: r.code as string, source: 'installed' } as CatalogItem));
  catalog = [...folder.map(f => ({ ...f, source: 'folder' as const })), ...installed.filter(i => !folder.some(f => f.id === i.id))];
  return catalog;
}
export async function initExtensions() {
  await readCatalog();
  for (const item of catalog) if (enabled(item.id)) await load(item);
  emit('ready');
}
export async function setEnabled(item: CatalogItem, on: boolean) {
  S.set({ exts: { ...(S.settings.exts || {}), [item.id]: on } });
  if (on) await load(item); else unload(item.id);
}

// 코드에서 선언부 읽기: export const manifest = {...} 또는 export default { id, name, ... }
async function inspect(code: string) {
  const blob = URL.createObjectURL(new Blob([code], { type: 'text/javascript' }));
  try { const mod = await import(/* @vite-ignore */ blob) as ExtModule; const def = mod.default || {}; const m = (mod.manifest || def.manifest || def) as Record<string, string>; if (typeof (def.activate || mod.activate) !== 'function') throw new Error('activate(api) 함수가 없어요'); return { id: String(m.id || '').trim(), name: m.name || m.id || '이름 없는 확장', version: m.version || '', author: m.author || '', description: m.description || '' }; }
  finally { URL.revokeObjectURL(blob); }
}
export async function install(code: string, hint = '') {
  // 선언부를 읽으려면 코드를 한 번 돌려야 하므로, 돌리기 전에 먼저 묻는다
  if (!(await confirmBox(`${hint ? `"${hint}"` : '이 코드'}를 확장으로 설치할까요? 확장은 대화와 API 키를 포함한 드림랜드의 모든 데이터에 접근할 수 있습니다. 믿을 수 있는 것만 설치하세요.`, '설치'))) return;
  let meta;
  try { meta = await inspect(code); } catch (e) { return toast('확장으로 읽을 수 없어요: ' + (e as Error).message, 'err'); }
  if (!meta.id) meta.id = (hint.replace(/\.[^.]+$/, '') || 'ext-' + uid()).toLowerCase().replace(/[^\w-]+/g, '-');
  unload(meta.id);
  await DB.put('kv', { id: 'ext:' + meta.id, extId: meta.id, meta, code });
  await readCatalog();
  await setEnabled(catalog.find(c => c.id === meta.id) as CatalogItem, true);
  toast(`${meta.name} 을(를) 설치했어요`, 'ok'); refresh();
}
export async function installFromUrl(url: string) {
  url = url.trim().replace(/^https:\/\/github\.com\/([^/]+\/[^/]+)\/blob\//, 'https://raw.githubusercontent.com/$1/');
  let text: string;
  try { const r = await fetch(url); if (!r.ok) throw new Error(String(r.status)); text = await r.text(); }
  catch { const r = await fetch('/api/proxy', { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-dreamland': '1' }, body: JSON.stringify({ url, method: 'GET' }) }).catch(() => null); if (!r?.ok) return toast('그 주소에서 받아 오지 못했어요', 'err'); text = await r.text(); }
  await install(text, url.split('/').pop() as string);
}

export const TEMPLATE = `// my-extension.js — 드림랜드 확장의 가장 작은 모양
export const manifest = { id: 'my-extension', name: '내 확장', version: '1.0.0', author: '나', description: '설명' };

export function activate(api) {
  // 명령어:  /hello 이름
  api.command('hello', { help: '인사를 건넵니다', run: (arg) => api.toast('안녕, ' + (arg || '여행자')) });
  // 매크로:  {{moon}}
  api.macro('moon', () => ['초승달', '반달', '보름달'][new Date().getDate() % 3]);
  // 메시지 메뉴 · 장면 패널 · 입력창 메뉴 · 전용 화면
  api.messageAction({ label: '글자 수 세기', icon: 'note', run: (msg) => api.toast(msg.swipes[msg.sw].text.length + '자') });
  api.panel({ title: '내 패널', icon: 'heart', render: (chat, msgs) => api.h('p', '메시지 ' + msgs.length + '개') });
  // 이벤트: ready, route, chat:open, message:sent, message:received, prompt:ready, generate:start, generate:end
  api.on('prompt:ready', ({ messages }) => { /* messages 배열을 직접 고치면 전송 내용이 바뀝니다 */ });
  // 화면에 보이기 직전의 글 바꾸기 · CSS · 테마
  api.textFilter((text) => text);
  api.style('.msg-body { }');
  // 저장소:  await api.store.get('key', 기본값) / await api.store.set('key', 값)
  // 채팅:    api.chat.current() / send(text) / insert(text) / generate() / addSystemMessage(text) / redraw()
  // AI:      await api.ai.quick(시스템문, 사용자문)
  return () => { /* 끌 때 정리할 일 (등록한 것들은 자동으로 치워집니다) */ };
}
`;
