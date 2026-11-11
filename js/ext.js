// ── Dreamland ext: 확장 기능 (설치 · 불러오기 · API · 관리 화면) ──
import { S, DB, h, on, emit, uid, pickFiles, download, debounce } from './core.js';
import { icon, btn, iconBtn, toast, modal, menu, form, confirmBox, promptBox, go, registerPage, refresh, avatar, pageHead } from './ui.js';
import { X, dropOwner } from './hooks.js';
import { chatApi } from './chat.js';
import { quickCall, tokens, macro } from './engine.js';
import { render } from './format.js';
import { applyTheme } from './theme.js';

export const APP_VERSION = '1.1.0';
const loaded = new Map();   // id → { cleanup[], error, meta }
let catalog = [];           // [{ id, name, version, author, description, source: 'folder'|'installed', entry, css, code }]
const enabled = id => S.settings.exts?.[id] === true;

function makeApi(id) {
  const rec = loaded.get(id);
  const off = fn => { rec.cleanup.push(fn); return fn; };
  const reg = (list, item) => { list.push({ owner: id, ...item }); emit('ext:changed'); };
  const data = { cache: null };
  const store = {
    async get(key, def) { data.cache ||= (await DB.get('kv', 'extdata:' + id))?.data || {}; return key in data.cache ? data.cache[key] : def; },
    async set(key, value) { data.cache ||= (await DB.get('kv', 'extdata:' + id))?.data || {}; data.cache[key] = value; await DB.put('kv', { id: 'extdata:' + id, data: data.cache }); },
  };
  return {
    id, appVersion: APP_VERSION,
    // 화면 도구
    h, icon, btn, iconBtn, avatar, toast, modal, menu, form, confirm: confirmBox, prompt: promptBox, go, render,
    // 데이터
    data: S, store,
    // 이벤트: ready · route · chat:open · message:sent · message:received · prompt:ready · generate:start · generate:end · settings
    on: (ev, fn) => off(on(ev, (...a) => { try { fn(...a); } catch (e) { console.error(`[확장 ${id}]`, e); } })),
    // 등록
    command: (name, def) => { X.commands.set('/' + String(name).replace(/^\//, '').toLowerCase(), { owner: id, ...(typeof def === 'function' ? { run: def } : def) }); },
    macro: (name, fn) => { X.macros.set(String(name).toLowerCase(), { owner: id, fn }); },
    panel: def => reg(X.panels, def),
    messageAction: def => reg(X.actions, def),
    composerAction: def => reg(X.composer, def),
    textFilter: fn => reg(X.filters, { fn }),
    theme: theme => { reg(X.themes, { theme: { ...theme, id: `ext-${id}-${theme.id || uid()}`, builtin: true } }); },
    page: def => { const pid = `ext-${id}-${def.id || 'page'}`; registerPage(pid, root => def.render(root)); reg(X.pages, { ...def, id: pid }); return pid; },
    style: css => { const el = h('style', { dataset: { ext: id } }, css); document.head.append(el); off(() => el.remove()); return el; },
    // 채팅 · AI
    chat: chatApi,
    ai: { quick: quickCall, tokens, macro },
  };
}

async function load(item) {
  if (loaded.has(item.id)) return;
  const rec = { cleanup: [], error: '', meta: item }; loaded.set(item.id, rec);
  try {
    let url = item.entry, blob = null;
    if (item.code != null) { blob = URL.createObjectURL(new Blob([item.code], { type: 'text/javascript' })); url = blob; }
    const mod = await import(/* @vite-ignore */ url);
    if (blob) URL.revokeObjectURL(blob);
    if (item.css) { const l = h('link', { rel: 'stylesheet', href: item.css, dataset: { ext: item.id } }); document.head.append(l); rec.cleanup.push(() => l.remove()); }
    const def = mod.default || mod;
    const activate = def.activate || mod.activate;
    if (typeof activate !== 'function') throw new Error('activate(api) 함수를 찾을 수 없어요');
    const ret = await activate(makeApi(item.id));
    if (typeof ret === 'function') rec.cleanup.push(ret);
  } catch (e) { console.error(`[확장 ${item.id}]`, e); rec.error = e.message || String(e); }
  emit('ext:changed');
}
function unload(id) {
  const rec = loaded.get(id); if (!rec) return;
  for (const fn of rec.cleanup.reverse()) { try { fn(); } catch (e) { console.warn(e); } }
  dropOwner(id); loaded.delete(id); applyTheme(); emit('ext:changed');
}

async function readCatalog() {
  const folder = await fetch('/api/extensions').then(r => r.ok ? r.json() : []).catch(() => []);
  const installed = (await DB.all('kv')).filter(r => String(r.id).startsWith('ext:')).map(r => ({ ...r.meta, id: r.extId, code: r.code, source: 'installed' }));
  catalog = [...folder.map(f => ({ ...f, source: 'folder' })), ...installed.filter(i => !folder.some(f => f.id === i.id))];
  return catalog;
}
export async function initExtensions() {
  await readCatalog();
  for (const item of catalog) if (enabled(item.id)) await load(item);
  emit('ready');
}
async function setEnabled(item, on) {
  S.set({ exts: { ...(S.settings.exts || {}), [item.id]: on } });
  if (on) await load(item); else unload(item.id);
}

// 코드에서 선언부 읽기: export const manifest = {...} 또는 export default { id, name, ... }
async function inspect(code) {
  const blob = URL.createObjectURL(new Blob([code], { type: 'text/javascript' }));
  try { const mod = await import(/* @vite-ignore */ blob); const def = mod.default || {}; const m = mod.manifest || def.manifest || def; if (typeof (def.activate || mod.activate) !== 'function') throw new Error('activate(api) 함수가 없어요'); return { id: String(m.id || '').trim(), name: m.name || m.id || '이름 없는 확장', version: m.version || '', author: m.author || '', description: m.description || '' }; }
  finally { URL.revokeObjectURL(blob); }
}
async function install(code, hint = '') {
  // 선언부를 읽으려면 코드를 한 번 돌려야 하므로, 돌리기 전에 먼저 묻는다
  if (!(await confirmBox(`${hint ? `"${hint}"` : '이 코드'}를 확장으로 설치할까요? 확장은 대화와 API 키를 포함한 드림랜드의 모든 데이터에 접근할 수 있습니다. 믿을 수 있는 것만 설치하세요.`, '설치'))) return;
  let meta;
  try { meta = await inspect(code); } catch (e) { return toast('확장으로 읽을 수 없어요: ' + e.message, 'err'); }
  if (!meta.id) meta.id = (hint.replace(/\.[^.]+$/, '') || 'ext-' + uid()).toLowerCase().replace(/[^\w-]+/g, '-');
  unload(meta.id);
  await DB.put('kv', { id: 'ext:' + meta.id, extId: meta.id, meta, code });
  await readCatalog();
  await setEnabled(catalog.find(c => c.id === meta.id), true);
  toast(`${meta.name} 을(를) 설치했어요`, 'ok'); refresh();
}
async function installFromUrl(url) {
  url = url.trim().replace(/^https:\/\/github\.com\/([^/]+\/[^/]+)\/blob\//, 'https://raw.githubusercontent.com/$1/');
  let text;
  try { const r = await fetch(url); if (!r.ok) throw new Error(String(r.status)); text = await r.text(); }
  catch { const r = await fetch('/api/proxy', { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-dreamland': '1' }, body: JSON.stringify({ url, method: 'GET' }) }).catch(() => null); if (!r?.ok) return toast('그 주소에서 받아 오지 못했어요', 'err'); text = await r.text(); }
  await install(text, url.split('/').pop());
}

const TEMPLATE = `// my-extension.js — 드림랜드 확장의 가장 작은 모양
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

registerPage('exts', async root => {
  const list = h('div.ext-list');
  const draw = () => list.replaceChildren(...(catalog.length ? catalog.map(item => {
    const rec = loaded.get(item.id);
    return h('div.ext-card', h('div.ext-ic', icon('plug', 20)),
      h('div.ext-meta', h('b', item.name, ' ', item.version && h('span.badge', 'v' + item.version)), h('small', [item.author && `만든이 ${item.author}`, item.source === 'folder' ? 'extensions 폴더' : '직접 설치'].filter(Boolean).join(' · ')), item.description && h('small', item.description), rec?.error && h('small.err', '불러오지 못했어요: ' + rec.error)),
      item.source === 'installed' && iconBtn('trash', '삭제', async () => { if (!(await confirmBox(`"${item.name}" 확장을 삭제할까요?`, '삭제', true))) return; unload(item.id); await DB.del('kv', 'ext:' + item.id); await DB.del('kv', 'extdata:' + item.id); await readCatalog(); draw(); }),
      h('label.switch', { title: '사용' }, h('input', { type: 'checkbox', checked: enabled(item.id), onchange: async e => { await setEnabled(item, e.target.checked); draw(); } }), h('i')));
  }) : [h('p.dim', '아직 설치한 확장이 없어요.')]));
  await readCatalog(); draw();
  root.append(h('section.pagebox',
    pageHead('plugins', '확장 · 플러그인'),
    h('p.hint', '확장은 명령어·매크로·패널·메뉴·화면·테마를 드림랜드에 더합니다. 대화와 API 키를 포함한 모든 데이터에 접근할 수 있으니 믿을 수 있는 것만 켜 주세요.'),
    h('div.card', h('div.row.wrap', h('h3.form-sec', '설치된 확장'),
      btn('파일로 설치', { ic: 'import', onclick: async () => { const [f] = await pickFiles({ accept: '.js,.mjs' }); if (f) install(await f.text(), f.name); } }),
      btn('주소로 설치', { ic: 'plug', cls: 'ghost', onclick: async () => { const u = await promptBox('확장 파일 주소 (.js)', '', { placeholder: 'https://github.com/…/blob/main/extension.js' }); if (u) installFromUrl(u); } }),
      btn('코드 붙여넣기', { ic: 'code', cls: 'ghost', onclick: async () => { const c = await promptBox('확장 코드', '', { area: true }); if (c) install(c); } })), list,
      h('p.hint', '드림랜드 폴더의 extensions/이름/ 안에 manifest.json 과 index.js 를 넣어 두면 여기에 나타납니다.')),
    h('div.card', h('h3.form-sec', '확장 만들기'),
      h('p.hint', 'ES 모듈 파일 하나면 됩니다. 아래 틀에서 시작해 보세요.'),
      h('details.api-doc', h('summary', '시작 틀과 API'), h('pre', TEMPLATE)),
      h('div.row', btn('틀 내려받기', { ic: 'import', onclick: () => download('my-extension.js', TEMPLATE, 'text/javascript') })))));
});
