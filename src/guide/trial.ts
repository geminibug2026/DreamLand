// 확장 시험 돌리기: 등불지기가 만든 드림랜드 확장을 실제 앱에 켜지 않고, 격리된 틀(sandbox) 안에서 가짜 api 로 돌려 본다.
// activate 의 오류, 등록한 것(명령 · 패널 · 메시지 동작 · 글 필터 · 프롬프트 끼우기 …)을 견본 자료로 한 번씩 실행했을 때의 오류,
// 그리고 진짜였다면 일어났을 일(메시지 보내기 · 생성 · 모델 호출)을 세어 돌려준다. 앱의 자료와 화면은 건드리지 않는다
import { S } from '../lib/core';
import { Server } from '../lib/server';
import { cur } from '../chat/store';

export interface TrialReport {
  ok: boolean; activateError: string; errors: { where: string; error: string }[];
  registered: Record<string, string[]>; wouldDo: Record<string, number>; notes: string[];
}
type Obj = Record<string, unknown>;

/** 견본 자료: 지금 열린 대화의 끝부분과 캐릭터 몇 (글은 짧게) */
function sample(): Obj {
  const cut = (s: unknown, n = 400) => String(s ?? '').slice(0, n);
  const chat = cur.chat ? { id: cur.chat.id, name: cur.chat.name, charIds: cur.chat.charIds, vars: cur.chat.vars || {}, mode: cur.chat.mode } : { id: 'sample-chat', name: '', charIds: ['sample-char'], vars: {}, mode: 'rp' };
  const msgs = (cur.chat ? cur.msgs.slice(-6) : []).map(m => ({ id: m.id, role: m.role, name: m.name, swipes: [{ text: cut(m.swipes[m.sw]?.text) }], sw: 0 }));
  if (!msgs.length) msgs.push({ id: 'm1', role: 'assistant', name: 'Sample', swipes: [{ text: '"Hello." She looked up from the counter.' }], sw: 0 }, { id: 'm2', role: 'user', name: 'User', swipes: [{ text: 'Hi, one coffee please.' }], sw: 0 });
  const chars = S.chars.slice(0, 4).map(c => ({ id: c.id, name: c.name, description: cut(c.description, 300), tags: c.tags || [] }));
  return { chat, msgs, chars, personas: S.personas.slice(0, 2).map(p => ({ id: p.id, name: p.name })), settings: { lang: (S.settings as unknown as Obj).lang || 'ko', theme: S.settings.theme } };
}

// 틀 안에서 도는 글: 가짜 api 를 만들고, 확장 모듈을 data: 주소로 불러 activate 한 뒤 등록된 것을 차례로 불러 본다
const RUNNER = String.raw`
(function () {
  var D = JSON.parse(document.getElementById('sample').textContent), errs = [], reg = { commands: [], macros: [], panels: [], messageActions: [], composerActions: [], textFilters: [], events: [], pages: [], themes: [] }, would = { send: 0, generate: 0, modelCalls: 0, systemMessages: 0, navigation: 0, toasts: 0, modals: 0 }, notes = [];
  var held = { panels: [], actions: [], composer: [], filters: [], cmds: [], macros: [], events: [], pages: [] }, store = {};
  function err(where, e) { errs.push({ where: where, error: String(e && e.message || e).slice(0, 300) }); }
  function h(spec, props) { var m = /^([a-z0-9-]+)?((?:[.#][\w-]+)*)$/i.exec(spec || 'div') || [], el = document.createElement(m[1] || 'div'); (m[2] || '').replace(/([.#])([\w-]+)/g, function (_, t, n) { if (t === '.') el.classList.add(n); else el.id = n; });
    var kids = [].slice.call(arguments, 2); if (props && (props.nodeType || typeof props !== 'object' || Array.isArray(props))) { kids.unshift(props); props = null; }
    if (props) Object.keys(props).forEach(function (k) { var v = props[k]; if (k === 'style' && v && typeof v === 'object') Object.assign(el.style, v); else if (k === 'dataset') Object.assign(el.dataset, v); else if (k === 'text') el.textContent = v; else if (k === 'html') el.innerHTML = v; else if (k === 'class') el.className = v; else if (/^on/.test(k) && typeof v === 'function') el.addEventListener(k.slice(2), v); else if (v != null && v !== false) el.setAttribute(k, v === true ? '' : v); });
    (function add(list) { list.forEach(function (c) { if (c == null || c === false) return; if (Array.isArray(c)) add(c); else el.append(c.nodeType ? c : String(c)); }); })(kids); return el; }
  var chat = D.chat, msgs = D.msgs, input = '';
  var api = {
    id: 'trial', appVersion: 'trial', h: h, icon: function (n) { return h('span.ic', { text: '[' + n + ']' }); }, btn: function (label, o) { o = o || {}; return h('button.btn', { onclick: o.onclick, title: o.title }, label); }, iconBtn: function (ic, title, onclick) { return h('button.ibtn', { title: title, onclick: onclick }, '[' + ic + ']'); }, avatar: function () { return h('span.av'); },
    toast: function () { would.toasts++; }, modal: function (o) { would.modals++; var box = h('div.modal'); if (o && o.body && o.body.nodeType) box.append(o.body); document.body.append(box); return { close: function () { box.remove(); } }; }, menu: function () { }, form: function () { return h('form'); }, confirm: function () { return Promise.resolve(true); }, prompt: function () { return Promise.resolve('test'); }, go: function () { would.navigation++; }, render: function (t) { return h('div', { text: String(t || '') }); },
    data: { chars: D.chars, personas: D.personas, chats: [chat], settings: D.settings, get: function (coll, id) { return (this[coll] || []).find(function (x) { return x.id === id; }); } },
    store: { get: function (k, d) { return Promise.resolve(k in store ? store[k] : d); }, set: function (k, v) { store[k] = JSON.parse(JSON.stringify(v === undefined ? null : v)); return Promise.resolve(); } },
    on: function (ev, fn) { reg.events.push(ev); held.events.push([ev, fn]); return function () { }; },
    command: function (name, def) { name = String(name).replace(/^\//, '').toLowerCase(); reg.commands.push('/' + name); held.cmds.push([name, typeof def === 'function' ? { run: def } : def]); },
    macro: function (name, fn) { reg.macros.push('{{' + name + '}}'); held.macros.push([name, fn]); },
    panel: function (d) { reg.panels.push(d && (d.title || d.id) || '?'); held.panels.push(d); }, messageAction: function (d) { reg.messageActions.push(d && (d.label || d.id) || '?'); held.actions.push(d); }, composerAction: function (d) { reg.composerActions.push(d && (d.label || d.id) || '?'); held.composer.push(d); },
    textFilter: function (fn) { reg.textFilters.push('filter ' + (reg.textFilters.length + 1)); held.filters.push(fn); }, theme: function (t) { reg.themes.push(t && (t.name || t.id) || '?'); }, page: function (d) { reg.pages.push(d && (d.label || d.id) || '?'); held.pages.push(d); return 'ext-trial-' + (d && d.id || 'page'); },
    style: function (css) { var s = h('style'); s.textContent = css; document.head.append(s); return s; },
    chat: { current: function () { return { chat: chat, msgs: msgs, busy: false }; }, reveal: function () { return true; }, roomName: function () { return chat.name || 'Chat'; }, groupTitle: function () { return 'Chat'; }, generate: function () { would.generate++; return Promise.resolve(); }, send: function () { would.send++; return Promise.resolve(); }, insert: function (t) { input += t; }, getInput: function () { return input; }, setInput: function (t) { input = String(t); }, addSystemMessage: function () { would.systemMessages++; return Promise.resolve(); }, save: function () { return Promise.resolve(); }, redraw: function () { }, setStatus: function () { }, scrollTo: function () { }, openDrawer: function () { }, push: function () { return Promise.resolve(); }, stop: function () { } },
    ai: { quick: function () { would.modelCalls++; return Promise.resolve('{"ok": true, "text": "sample reply"}'); }, tokens: function (t) { return Math.ceil(String(t || '').length / 3); }, macro: function (t) { return String(t || ''); } },
  };
  window.addEventListener('error', function (e) { err('uncaught', e.message); });
  window.addEventListener('unhandledrejection', function (e) { err('uncaught (promise)', e.reason); });
  function call(where, fn) { try { var r = fn(); return Promise.resolve(r).catch(function (e) { err(where, e); }); } catch (e) { err(where, e); return Promise.resolve(); } }
  function wait(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
  var m0 = msgs[msgs.length - 1], textarea = h('textarea');
  import(document.getElementById('mod').textContent).then(function (mod) {
    var def = mod.default || mod, activate = def.activate || mod.activate;
    if (typeof activate !== 'function') throw new Error('no activate() export');
    return Promise.resolve(activate(api));
  }).then(function () { return wait(150); }, function (e) { throw { activate: String(e && e.message || e) }; }).then(function () {
    var jobs = [];
    held.panels.forEach(function (p, i) { jobs.push(call('panel ' + (p.title || p.id || i) + ' render', function () { var n = p.render && p.render(chat, msgs); if (n && !n.nodeType) notes.push('panel ' + (p.title || p.id) + ' render() should return a DOM node'); if (n && n.nodeType) document.body.append(n); })); });
    held.actions.forEach(function (a) { jobs.push(call('messageAction ' + (a.label || a.id) + ' run', function () { return a.run && a.run(m0, chat); })); });
    held.composer.forEach(function (a) { jobs.push(call('composerAction ' + (a.label || a.id) + ' run', function () { return a.run && a.run(textarea); })); });
    held.filters.forEach(function (f, i) { jobs.push(call('textFilter ' + (i + 1), function () { var out = f(m0.swipes[0].text, { role: m0.role, msg: m0, chat: chat }); if (typeof out !== 'string') notes.push('textFilter ' + (i + 1) + ' must return a string (got ' + typeof out + ')'); })); });
    held.cmds.forEach(function (c) { jobs.push(call('/' + c[0], function () { return c[1].run && c[1].run('test', chat); })); });
    held.macros.forEach(function (m) { jobs.push(call('{{' + m[0] + '}}', function () { var v = m[1](['a', 'b'], { chat: chat }); if (v != null && typeof v === 'object' && typeof v.then !== 'function') notes.push('macro ' + m[0] + ' should return text'); })); });
    held.pages.forEach(function (p) { jobs.push(call('page ' + (p.label || p.id) + ' render', function () { var root = h('div'); document.body.append(root); return p.render && p.render(root); })); });
    var sampleEv = { 'prompt:ready': { messages: [{ role: 'system', content: 'sys' }, { role: 'user', content: 'Hi' }], chat: chat, type: 'normal' }, 'message:received': { msg: m0, chat: chat }, 'message:sent': { msg: m0, chat: chat }, 'chat:open': chat, 'generate:start': { chat: chat, type: 'normal' }, 'generate:end': { chat: chat, type: 'normal' }, 'route': 'chat', 'settings': {}, 'ready': undefined };
    held.events.forEach(function (e) { jobs.push(call('on(' + e[0] + ')', function () { return e[1](sampleEv[e[0]]); })); });
    return Promise.all(jobs).then(function () { return wait(400); });
  }).then(function () { parent.postMessage({ trial: true, ok: true, errors: errs, registered: reg, would: would, notes: notes }, '*'); }, function (e) {
    parent.postMessage({ trial: true, ok: false, activateError: e && e.activate || String(e && e.message || e), errors: errs, registered: reg, would: would, notes: notes }, '*');
  });
})();`;

/** 드림랜드 확장 코드를 격리된 틀에서 돌려 본다 (앱의 자료 · 화면은 그대로).
 *  메시지 화면과 같은 빈 틀(Server.frameUrl)을 쓴다 — 앱 문서의 보안 규칙(인라인 스크립트 금지)이 틀 안에는 걸리지 않게 */
export function trialExt(code: string, timeout = 8000): Promise<TrialReport> {
  return new Promise(resolve => {
    const f = document.createElement('iframe');
    f.setAttribute('sandbox', 'allow-scripts'); f.setAttribute('aria-hidden', 'true'); f.tabIndex = -1;
    f.style.cssText = 'position:fixed;left:-10000px;top:0;width:400px;height:600px;border:0;opacity:0;pointer-events:none';
    const esc = (s: string) => s.replace(/<\/script/gi, '<\\/script');
    const mod = 'data:text/javascript;charset=utf-8,' + encodeURIComponent(code);
    const page = `<!doctype html><html><head><meta charset="utf-8"></head><body><script type="application/json" id="sample">${esc(JSON.stringify(sample()))}</script><script type="text/plain" id="mod">${esc(mod)}</script><script>${esc(RUNNER)}</script></body></html>`;
    let done = false;
    const finish = (r: TrialReport) => { if (done) return; done = true; removeEventListener('message', onMsg); clearTimeout(timer); f.remove(); resolve(r); };
    const onMsg = (e: MessageEvent) => {
      if (e.source !== f.contentWindow || !e.data) return;
      if (e.data.dlFrameReady != null) { f.contentWindow?.postMessage({ dlHtml: page, init: { script: true } }, '*'); return; }
      if (!e.data.trial) return;
      const d = e.data as { ok: boolean; activateError?: string; errors: TrialReport['errors']; registered: Record<string, string[]>; would: Record<string, number>; notes: string[] };
      const registered = Object.fromEntries(Object.entries(d.registered || {}).filter(([, v]) => v.length));
      const wouldDo = Object.fromEntries(Object.entries(d.would || {}).filter(([, v]) => v > 0));
      finish({ ok: d.ok && !d.errors.length && !d.activateError, activateError: d.activateError || '', errors: d.errors || [], registered, wouldDo, notes: d.notes || [] });
    };
    addEventListener('message', onMsg);
    const timer = setTimeout(() => finish({ ok: false, activateError: 'timed out — activate() or a handler never finished (an endless loop, or a promise that never settles)', errors: [], registered: {}, wouldDo: {}, notes: [] }), timeout);
    f.src = Server.frameUrl;
    document.body.append(f);
  });
}
