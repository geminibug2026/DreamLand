// 실리태번 스크립트(Tavern Helper 스크립트 라이브러리 형식): 가져와서 켜면 숨은 화면에서 돈다.
// 실리태번과 똑같이 앱 페이지 전체 권한(window.parent)으로 돌므로, 스크립트마다 처음 켤 때 사용자에게 한 번 묻는다.
import { DB, S, emit, on, uid } from './core';
import { Server } from './server';
import { frameHooks, framePost, bridgeFrames } from './format';
import { frameReady } from '../chat/frameEvents';
import { ejs } from './ejs';
import { cur } from '../chat/store';
import { confirmBox } from '../ui';
import { t } from '../i18n';
import type { Char } from './types';

export interface ThButton { name: string; visible: boolean }
export interface ThScript { id: string; name: string; content: string; enabled: boolean; trusted: boolean; info?: string; ts?: number; /** 스크립트 단추 (Tavern Helper 의 button) */ button?: { enabled: boolean; buttons: ThButton[] }; /** 스크립트 변수 (Tavern Helper 의 data · type: 'script') */ data?: Record<string, unknown> }
const btnOf = (x: Record<string, unknown>): ThScript['button'] => { const b = x.button && typeof x.button === 'object' ? x.button as Record<string, unknown> : null, list = Array.isArray(b?.buttons) ? b!.buttons : Array.isArray(x.buttons) ? x.buttons : []; const buttons = (list as unknown[]).filter((v): v is Record<string, unknown> => !!v && typeof v === 'object' && typeof (v as { name?: unknown }).name === 'string').map(v => ({ name: String(v.name), visible: v.visible !== false })); return buttons.length || b ? { enabled: b ? b.enabled !== false : true, buttons } : undefined; };
const dataOf = (x: Record<string, unknown>) => x.data && typeof x.data === 'object' && !Array.isArray(x.data) ? x.data as Record<string, unknown> : undefined;

const KEY = 'th-scripts';
export let scripts: ThScript[] = [];
const running = new Map<string, HTMLIFrameElement>();
let loaded: Promise<void> | null = null;

const vendor = () => (Server.frameUrl === '/frame' ? '/vendor/' : 'vendor/');
const save = async () => { await DB.put('kv', { id: KEY, data: scripts }); emit('thscripts:changed'); };

/** 실리태번 내보내기 JSON → 스크립트들 (낱개 · 배열 · { scripts: [] } 모두 받는다) */
export function parseScripts(j: unknown): ThScript[] {
  const list = Array.isArray(j) ? j : j && typeof j === 'object' && Array.isArray((j as { scripts?: unknown[] }).scripts) ? (j as { scripts: unknown[] }).scripts : [j];
  return list.filter((x): x is Record<string, unknown> => !!x && typeof x === 'object' && typeof (x as { content?: unknown }).content === 'string')
    .map(x => ({ id: String(x.id || uid()), name: String(x.name || '스크립트'), content: String(x.content), info: String(x.info || ''), enabled: false, trusted: false, ts: Date.now(), ...(btnOf(x) ? { button: btnOf(x) } : {}), ...(dataOf(x) ? { data: dataOf(x) } : {}) }));
}

export async function addScripts(list: ThScript[]) {
  await load();
  for (const s of list) { const i = scripts.findIndex(x => x.id === s.id); if (i >= 0) { stop(scripts[i]); scripts[i] = { ...s, trusted: scripts[i].trusted }; } else scripts.push(s); }
  await save();
}
export async function removeScript(id: string) { const s = scripts.find(x => x.id === id); if (s) stop(s); scripts = scripts.filter(x => x.id !== id); await save(); }
/** 켜기 · 끄기. 켤 때 trusted 가 아니면 부르는 쪽이 먼저 확인을 받아 trusted 를 넘긴다 */
export async function setEnabled(id: string, on: boolean, trusted = false) {
  const s = scripts.find(x => x.id === id); if (!s) return;
  if (on && trusted) s.trusted = true;
  s.enabled = on && s.trusted;
  if (s.enabled) start(s); else stop(s);
  await save();
}
export const isRunning = () => running.size > 0;

// ── 실리태번 화면 흉내: jQuery · 마법봉 메뉴(#extensionsMenu) · EJS 템플릿 도우미 ──
let jq: Promise<void> | null = null;
const loadScript = (src: string) => new Promise<void>(res => { const el = document.createElement('script'); el.src = src; el.onload = () => res(); el.onerror = () => res(); document.head.append(el); });
function ensureJq() {
  const w = window as unknown as { jQuery?: unknown; $?: unknown };
  if (w.jQuery) return Promise.resolve();
  return jq ||= loadScript(vendor() + 'jquery.min.js');
}
// 실리태번 화면에는 jQuery UI 가 늘 있다: 스크립트가 쓰면 앱 화면에도 깐다 (스크립트의 $ 는 앱 화면의 jQuery 다)
let jqui: Promise<void> | null = null;
const JQUI = /\.(?:draggable|droppable|resizable|selectable|sortable|accordion|autocomplete|checkboxradio|controlgroup|datepicker|dialog|selectmenu|slider|spinner|tabs|tooltip|effect)\s*\(|\$\.ui\b/;
function ensureJqUi() {
  if ((window as unknown as { jQuery?: { ui?: unknown } }).jQuery?.ui) return Promise.resolve();
  return jqui ||= loadScript(vendor() + 'th/jquery-ui.min.js').then(() => { const l = document.createElement('link'); l.rel = 'stylesheet'; l.href = vendor() + 'th/jquery-ui/theme.min.css'; document.head.append(l); });
}
function ensureMenu() {
  if (document.getElementById('extensionsMenu')) return;
  const m = document.createElement('div'); m.id = 'extensionsMenu'; m.className = 'st-ext-menu list-group'; m.hidden = true;
  m.addEventListener('click', () => { setTimeout(() => { m.hidden = true; }, 0); });
  document.body.append(m);
  document.addEventListener('pointerdown', e => { if (!m.hidden && !m.contains(e.target as Node) && !(e.target as HTMLElement).closest?.('.qr-wand')) m.hidden = true; });
  new MutationObserver(() => emit('thscripts:menu')).observe(m, { childList: true });
  // 스크립트가 띄운 메뉴(.ctx-menu)가 화면 밖에 그려지면 (누른 단추가 서랍과 함께 사라진 경우 등) 퀵 리플라이 줄 위로 당겨 온다
  new MutationObserver(recs => {
    for (const r of recs) for (const n of r.addedNodes) {
      if (!(n instanceof HTMLElement)) continue;
      const menu = n.matches('.ctx-menu') ? n : n.querySelector<HTMLElement>('.ctx-menu'); if (!menu) continue;
      requestAnimationFrame(() => {
        const box = menu.getBoundingClientRect();
        if (box.top >= 0 && box.bottom <= innerHeight && box.left >= 0 && box.right <= innerWidth) return;
        const bar = document.querySelector('.qr-more, .composer')?.getBoundingClientRect();
        menu.style.top = ''; menu.style.bottom = (innerHeight - (bar ? bar.top : innerHeight / 2) + 6) + 'px';
        menu.style.left = Math.max(8, Math.min(bar ? bar.left - box.width + 40 : (innerWidth - box.width) / 2, innerWidth - box.width - 8)) + 'px';
      });
    }
  }).observe(document.body, { childList: true });
}
/** 마법봉 메뉴를 단추 위에 펼치거나 접는다 */
export function toggleMenu(anchor: HTMLElement) {
  const m = document.getElementById('extensionsMenu'); if (!m) return;
  if (!m.hidden) { m.hidden = true; return; }
  const r = anchor.getBoundingClientRect();
  m.style.left = Math.max(8, Math.min(r.left, innerWidth - 260)) + 'px'; m.style.bottom = (innerHeight - r.top + 6) + 'px';
  m.hidden = false;
}
export const menuItems = () => document.getElementById('extensionsMenu')?.children.length || 0;
function ensureEjs() {
  const w = window as unknown as { EjsTemplate?: unknown };
  if (w.EjsTemplate) return;
  const getvar = (key: string, o: { scope?: string; defaults?: unknown } = {}) => {
    const g = (S.settings.globalVars || {}) as Record<string, unknown>, l = (cur.chat?.vars || {}) as Record<string, unknown>;
    const v = o.scope === 'global' ? g[key] : o.scope === 'local' ? l[key] : (key in l ? l[key] : g[key]);
    return v === undefined ? o.defaults : v;
  };
  const env = { getvar: (k: string) => getvar(k, { scope: 'local' }), getGlobalVar: (k: string) => getvar(k, { scope: 'global' }) };
  w.EjsTemplate = {
    prepareContext: async (extra: Record<string, unknown> = {}) => ({ ...extra, getvar, getGlobalVar: env.getGlobalVar, getLocalVar: env.getvar }),
    evalTemplate: async (text: string) => ejs(String(text || ''), env),
  };
}

// ── 알려진 외부 모듈을 앱에 든 것으로: 카드가 인터넷 없이도 돌고, 실리태번 내부에 매인 원래 묶음을 돌리지 않는다 ──
const MVU_BUNDLE = /https?:\/\/[^\s'"`]*MagVarUpdate[^\s'"`]*\/artifact\/bundle\.js[^\s'"`]*/g;
const MVU_ZOD = /https?:\/\/[^\s'"`]*tavern_resource[^\s'"`]*\/dist\/util\/(?:mvu_zod|variable_zod)\.js[^\s'"`]*/g;
const absVendor = (f: string) => new URL(vendor() + f, location.href).href;
/** 스크립트 · 화면 글 속 모듈 주소 바꾸기: 변수 갱신 틀 묶음 → 앱 안의 빈 모듈 (앱이 직접 맡는다) · mvu_zod.js → 앱에 든 같은 일을 하는 모듈 */
export function rewriteImports(code: string): string {
  if (code.indexOf('MagVarUpdate') < 0 && code.indexOf('tavern_resource') < 0) return code;
  return code.replace(MVU_BUNDLE, () => absVendor('mvu_bundle.js')).replace(MVU_ZOD, () => absVendor('mvu_zod.js'));
}
frameHooks.src = rewriteImports;
/** 스크립트 본문: 통째로 ``` 로 감쌌으면 벗긴다 (Tavern Helper 와 같다) */
const bodyOf = (content: string) => content.match(/^\s*```[^\n]*\n(.*)\n```\s*$/is)?.[1] ?? content;
let syncing: Promise<void> = Promise.resolve();
/** 켜 둔 스크립트가 다 실렸을 때 (허락을 묻는 중이면 답을 기다린다. 늦는 화면은 기다리지 않는다) */
export async function scriptsReady(): Promise<void> {
  await loaded; await syncing;
  await Promise.all([...running.values()].map(f => frameReady(f)));
}

function start(s: ThScript) {
  if (running.has(s.id)) return;
  ensureMenu(); ensureEjs(); bridgeFrames();
  const f = document.createElement('iframe');
  f.className = 'dl-frame-el dl-script-frame'; f.dataset.script = s.id; f.hidden = true; f.setAttribute('aria-hidden', 'true');
  const onReady = async (e: MessageEvent) => {
    if (e.source !== f.contentWindow || !(e.data as { dlFrameReady?: unknown })?.dlFrameReady) return;
    removeEventListener('message', onReady);
    await loadTh().catch(e => console.warn('[스크립트] 도우미를 불러오지 못함', e));
    await ensureJq();
    if (JQUI.test(s.content)) await ensureJqUi();
    const init = await Promise.resolve(frameHooks.init?.(f)).catch(() => ({}));
    const code = rewriteImports(bodyOf(s.content)).replace(/<\/script/gi, '<\\/script');
    // Tavern Helper 처럼 모듈 스크립트로 돌린다 (import 를 쓸 수 있다)
    f.contentWindow?.postMessage({ dlHtml: `<!doctype html><html><head></head><body><script type="module">\n${code}\n</script></body></html>`, init: { ...(init as object || {}), script: true } }, '*');
    setTimeout(() => f.contentWindow?.postMessage({ dlEvent: 'app_ready', args: [] }, '*'), 300);
  };
  addEventListener('message', onReady);
  f.src = Server.frameUrl;
  document.body.append(f);
  running.set(s.id, f); metas.set(s.id, s);
  if (s.button?.enabled !== false && s.button?.buttons.length) { btns.set(s.id, s.button.buttons.map(b => ({ ...b }))); emit('thscripts:buttons'); }
}
function stop(s: ThScript) { const f = running.get(s.id); if (f) { f.remove(); running.delete(s.id); if (btns.delete(s.id)) emit('thscripts:buttons'); emit('thscripts:changed'); } }

// ── Tavern Helper 의 나머지 도우미(로어북 · 프리셋 · 캐릭터 …)는 스크립트가 처음 돌 때 불러온다 (src/th) ──
let thMod: Promise<unknown> | null = null;
export const loadTh = () => thMod ||= import('../th').then(m => { m.install(); return m; });
// ── 스크립트 단추: 스크립트가 정한 단추를 입력창 위 줄에 보이고, 누르면 그 스크립트에 알린다 ──
const btns = new Map<string, ThButton[]>(), metas = new Map<string, ThScript>();
/** 돌고 있는 스크립트의 정보 (이름 · 설명 · 단추 · 변수) */
export const scriptMeta = (id: string) => metas.get(id) || scripts.find(s => s.id === id);
export const scriptFrame = (id: string) => running.get(id) || null;
/** 스크립트를 다시 띄운다 (reloadIframe) */
export async function restart(id: string) { const s = metas.get(id) || scripts.find(x => x.id === id); if (!s || !running.has(id)) return; stop(s); start(s); }
export const scriptOfFrame = (f: HTMLIFrameElement) => f.dataset.script || '';
/** 입력창 위에 보일 단추 */
export function scriptButtons(): { id: string; name: string; script: string }[] {
  const out: { id: string; name: string; script: string }[] = [];
  for (const [id, list] of btns) if (running.has(id)) for (const b of list) if (b.visible) out.push({ id: id + '_' + b.name, name: b.name, script: id });
  return out;
}
export const getButtons = (id: string): ThButton[] => (btns.get(id) || scriptMeta(id)?.button?.buttons || []).map(b => ({ ...b }));
export function setButtons(id: string, list: ThButton[]) {
  const next = list.filter(b => b && typeof b.name === 'string').map(b => ({ name: String(b.name), visible: b.visible !== false }));
  if (JSON.stringify(next) === JSON.stringify(btns.get(id) || [])) return;
  btns.set(id, next); emit('thscripts:buttons');
}
/** 단추를 눌렀다: 그 스크립트 화면에 단추 이벤트를 보낸다 (Tavern Helper 의 getButtonEvent 이름과, 옛 판처럼 단추 이름 그대로) */
export function clickButton(script: string, name: string) {
  const w = running.get(script)?.contentWindow; if (!w) return;
  w.postMessage({ dlEvent: script + '_' + name, args: [] }, '*');
  w.postMessage({ dlEvent: name, args: [] }, '*');
}
export function setScriptInfo(id: string, info: string) { const s = scriptMeta(id); if (!s) return; s.info = info; if (scripts.includes(s)) void save(); }
/** 스크립트 변수: 가져온 스크립트는 스크립트 안에, 카드 스크립트는 카드의 스크립트 칸에 둔다 (실리태번과 같다) */
export const scriptVars = (id: string): Record<string, unknown> => scriptMeta(id)?.data || {};
export async function setScriptVars(id: string, v: Record<string, unknown>) {
  const s = scriptMeta(id); if (!s) return;
  s.data = v;
  if (scripts.includes(s)) { await save(); return; }
  const m = /^char:([^:]+):(.*)$/.exec(id), ch = m ? S.get('chars', m[1]) as Char | undefined : undefined; if (!ch) return;
  const x = (ch.ext || {}) as Raw; let th = x.tavern_helper as unknown;
  if (Array.isArray(th)) th = Object.fromEntries((th as unknown[]).filter((p): p is [string, unknown] => Array.isArray(p) && typeof p[0] === 'string'));
  const walk = (list: unknown): boolean => Array.isArray(list) && list.some(it => { if (!it || typeof it !== 'object') return false; const r = it as Raw; if (r.type === 'folder') return walk(r.scripts ?? r.value); if (String(r.id || r.name) !== m![2]) return false; r.data = v; return true; });
  const tree = ((th as Raw | undefined)?.scripts ?? x.TavernHelper_scripts) as unknown;
  if (walk(tree)) { if (th && typeof th === 'object') x.tavern_helper = th; await S.save('chars', ch, true); }
}

export function load() {
  return loaded ||= (async () => {
    const r = await DB.get('kv', KEY).catch(() => null) as { data?: ThScript[] } | null;
    scripts = Array.isArray(r?.data) ? r.data : [];
    for (const s of scripts) if (s.enabled && s.trusted) start(s);
    emit('thscripts:changed');
  })();
}

// ── 캐릭터 카드에 실려 온 스크립트: 그 캐릭터의 대화를 열었을 때만 돈다 (실리태번처럼 캐릭터마다 처음 한 번 허락을 받는다) ──
type Raw = Record<string, unknown>;
/** 카드 확장 필드에서 스크립트 목록을 꺼낸다: tavern_helper.scripts · [['scripts', …]] 짝 배열 · 옛 TavernHelper_scripts · 폴더 */
export function charScripts(ch: Char | undefined | null): ThScript[] {
  const x = ((ch as unknown as { ext?: Raw })?.ext || {}) as Raw;
  let th = x.tavern_helper as unknown;
  if (Array.isArray(th)) th = Object.fromEntries((th as unknown[]).filter((p): p is [string, unknown] => Array.isArray(p) && typeof p[0] === 'string'));
  const raw = ((th as Raw | undefined)?.scripts ?? x.TavernHelper_scripts ?? []) as unknown;
  const flat = (list: unknown): Raw[] => Array.isArray(list) ? list.flatMap(it => it && typeof it === 'object' ? ((it as Raw).type === 'folder' ? flat((it as Raw).scripts ?? (it as Raw).value) : [it as Raw]) : []) : [];
  return flat(raw).filter(s => typeof s.content === 'string' && s.content.trim()).map(s => ({ id: 'char:' + (ch as Char).id + ':' + String(s.id || s.name), name: String(s.name || 'script'), content: String(s.content), info: String(s.info || ''), enabled: s.enabled !== false, trusted: true, ...(btnOf(s) ? { button: btnOf(s) } : {}), ...(dataOf(s) ? { data: dataOf(s) } : {}) }))
    .map(s => { const o = onMap()[s.id]; return o === undefined ? s : { ...s, enabled: o }; });
}
/** 카드 스크립트 하나씩 켜고 끄기 (카드에 적힌 켜짐 상태보다 앞선다) */
const onMap = () => ((S.settings as unknown as { thScriptOn?: Record<string, boolean> }).thScriptOn ||= {});
export async function setCharScript(id: string, on: boolean) { onMap()[id] = on; S.saveSettings(); await (syncing = syncChar()); emit('thscripts:changed'); }
const allow = () => ((S.settings as unknown as { thCharAllow?: Record<string, boolean> }).thCharAllow ||= {});
export const charAllowed = (id: string) => allow()[id];
export async function setCharAllowed(id: string, v: boolean | undefined) { if (v === undefined) delete allow()[id]; else allow()[id] = v; S.saveSettings(); await (syncing = syncChar()); emit('thscripts:changed'); }
let asking = false;
async function syncChar() {
  const chat = cur.chat, ids = chat?.charIds || [];
  for (const k of [...running.keys()]) if (k.startsWith('char:') && !ids.some(id => k.startsWith('char:' + id + ':'))) { running.get(k)?.remove(); running.delete(k); }
  for (const id of ids) {
    const ch = S.get('chars', id) as Char | undefined, all = charScripts(ch), list = all.filter(s => s.enabled);
    for (const s of all) if (!s.enabled) stop(s);
    if (!list.length) continue;
    if (allow()[id] === undefined) {
      if (asking) continue; asking = true;
      try { allow()[id] = await confirmBox(t('ths.charAsk', { name: ch?.name || '', n: list.length, names: list.map(s => s.name).join(', ') }), t('ths.trustOk'), true); S.saveSettings(); }
      finally { asking = false; }
      if (cur.chat !== chat) return;
    }
    for (const s of list) if (allow()[id]) start(s); else stop(s);
  }
  emit('thscripts:changed');
}

on('chat:open', () => { framePost({ dlEvent: 'chat_id_changed', args: [cur.chat?.id || ''] }); syncing = syncChar().catch(e => console.warn('[스크립트]', e)); });
