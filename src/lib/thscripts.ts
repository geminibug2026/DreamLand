// 실리태번 스크립트(Tavern Helper 스크립트 라이브러리 형식): 가져와서 켜면 숨은 화면에서 돈다.
// 실리태번과 똑같이 앱 페이지 전체 권한(window.parent)으로 돌므로, 스크립트마다 처음 켤 때 사용자에게 한 번 묻는다.
import { DB, S, emit, on, uid } from './core';
import { Server } from './server';
import { frameHooks, framePost, bridgeFrames } from './format';
import { ejs } from './ejs';
import { cur } from '../chat/store';

export interface ThScript { id: string; name: string; content: string; enabled: boolean; trusted: boolean; info?: string; ts?: number }

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
    .map(x => ({ id: String(x.id || uid()), name: String(x.name || '스크립트'), content: String(x.content), info: String(x.info || ''), enabled: false, trusted: false, ts: Date.now() }));
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
function ensureJq() {
  const w = window as unknown as { jQuery?: unknown; $?: unknown };
  if (w.jQuery) return Promise.resolve();
  return jq ||= new Promise<void>(res => { const el = document.createElement('script'); el.src = vendor() + 'jquery.min.js'; el.onload = () => res(); el.onerror = () => res(); document.head.append(el); });
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

function start(s: ThScript) {
  if (running.has(s.id)) return;
  ensureMenu(); ensureEjs(); bridgeFrames();
  const f = document.createElement('iframe');
  f.className = 'dl-frame-el dl-script-frame'; f.dataset.script = s.id; f.hidden = true; f.setAttribute('aria-hidden', 'true');
  const onReady = async (e: MessageEvent) => {
    if (e.source !== f.contentWindow || !(e.data as { dlFrameReady?: unknown })?.dlFrameReady) return;
    removeEventListener('message', onReady);
    await ensureJq();
    const init = await Promise.resolve(frameHooks.init?.(f)).catch(() => ({}));
    const code = s.content.replace(/<\/script/gi, '<\\/script');
    f.contentWindow?.postMessage({ dlHtml: `<!doctype html><html><head></head><body><script>${code}</script></body></html>`, init: init || {} }, '*');
    setTimeout(() => f.contentWindow?.postMessage({ dlEvent: 'app_ready', args: [] }, '*'), 300);
  };
  addEventListener('message', onReady);
  f.src = Server.frameUrl;
  document.body.append(f);
  running.set(s.id, f);
}
function stop(s: ThScript) { const f = running.get(s.id); if (f) { f.remove(); running.delete(s.id); emit('thscripts:changed'); } }

export function load() {
  return loaded ||= (async () => {
    const r = await DB.get('kv', KEY).catch(() => null) as { data?: ThScript[] } | null;
    scripts = Array.isArray(r?.data) ? r.data : [];
    for (const s of scripts) if (s.enabled && s.trusted) start(s);
    emit('thscripts:changed');
  })();
}

on('chat:open', () => framePost({ dlEvent: 'chat_id_changed', args: [cur.chat?.id || ''] }));
