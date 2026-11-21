// 메시지 속 HTML 화면(iframe)이 부르는 실리태번 JS 러너 도우미를 실제로 처리한다 (vendor/th-shim.js 의 짝)
import type { Msg } from '../lib/types';
import { DB, S, msgText, newMsg, on } from '../lib/core';
import { frameHooks, framePost } from '../lib/format';
import { toast } from '../ui';
import { t } from '../i18n';
import { cur } from './store';
import { chatApi } from './actions';
import { appHost, runQrScript } from '../stscript/host';
import { appCalls, onFrameMessage, relayEmit } from './frameEvents';
import { setVarsOf, swipesVars, varsOf } from './msgVars';
import { isDuringExtra, pending as mvuPending } from '../mvu/app';

type Obj = Record<string, unknown>;
const hostGen = (p: string, o: { raw?: boolean }) => (appHost() as unknown as { gen: (p: string, o: { raw?: boolean }) => Promise<string> }).gen(p, o);

// 화면 안의 localStorage 를 대신 보관한다 (모든 화면이 함께 쓴다)
let ls: Record<string, string> = {};
const lsReady = DB.get('kv', 'frame-ls').then(r => { ls = ((r as { data?: Record<string, string> } | undefined)?.data) || {}; }).catch(() => { });
let lsTimer = 0;
const lsSave = () => { clearTimeout(lsTimer); lsTimer = window.setTimeout(() => void DB.put('kv', { id: 'frame-ls', data: ls }), 300); };

const roleOf = (m: Msg) => m.role === 'user' ? 'user' : m.role === 'system' ? 'system' : 'assistant';
const view = (m: Msg, i: number) => ({ message_id: i, name: m.name || (m.role === 'user' ? S.persona(cur.chat!)?.name : '') || '', role: roleOf(m), is_hidden: !!m.hidden, message: msgText(m), data: varsOf(m) || {}, swipe_id: m.sw, swipes: m.swipes.map(s => s.text), swipes_data: swipesVars(m) });
const LIMIT = 300;
// 화면들이 들고 있는 메시지 사본 (실리태번 도우미의 getChatMessages 는 바로 답해야 한다).
// 일이 있을 때마다 최근 300개를 통째로 화면마다 보내면 (변수가 큰 방은 수 MB) 그동안 화면이 멈춘다 — 지난번에 보낸 것과 달라진 메시지만 보낸다.
// 화면은 받은 판(ver)을 적어 두고, 자기 판(base)이 아닌 것을 받으면 통째로 다시 달라고 한다 (vendor/th-shim.js)
let stateVer = 0, sentFrom = 0, sentChat = '';
const sent = new Map<number, string>(), sentView = new Map<number, Obj>();
/** 지금 메시지들을 지난번 보낸 것과 견준다. 달라진 것이 없으면 null */
function stateDelta(): Obj | null {
  const ms = cur.msgs, from = Math.max(0, ms.length - LIMIT), lastId = ms.length - 1, chatId = cur.chat?.id || '';
  if (chatId !== sentChat) { sent.clear(); sentView.clear(); sentChat = chatId; }
  const upd: Obj[] = [], next = new Map<number, string>(), nextView = new Map<number, Obj>();
  for (let i = from; i < ms.length; i++) {
    const v = view(ms[i], i) as Obj; let j: string; try { j = JSON.stringify(v); } catch { j = String(Math.random()); }
    next.set(i, j); nextView.set(i, v); if (sent.get(i) !== j) upd.push(v);
  }
  if (!upd.length && from === sentFrom && sent.size === next.size) return null;
  const base = stateVer; stateVer++;
  sent.clear(); sentView.clear(); for (const [k, j] of next) sent.set(k, j); for (const [k, v] of nextView) sentView.set(k, v); sentFrom = from;
  return upd.length > LIMIT / 2 ? { ver: stateVer, messages: [...sentView.values()], lastId } : { ver: stateVer, base, from, lastId, upd };
}
/** 지금 상태를 보낸 것으로 맞춘 뒤 (달라졌으면 화면들에 먼저 알리고) 통째 사본 */
function fullState() {
  const d = stateDelta(); if (d) framePost({ dlState: d });
  return { ver: stateVer, messages: [...sentView.values()] };
}
const vars = () => ({ chat: cur.chat?.vars || {}, global: S.settings.globalVars || {}, character: {}, message: {} });

function msgIndexOf(f: HTMLIFrameElement) {
  const id = f.closest<HTMLElement>('[data-id]')?.dataset.id;
  const i = id ? cur.msgs.findIndex(m => m.id === id) : -1;
  return i >= 0 ? i : cur.msgs.length - 1;
}

frameHooks.msg = onFrameMessage;
/** zod 스키마 카드 도우미(vendor/mvu_zod.js)가 띄우는 말 */
const mvuText = () => ({ path: t('mvu.zod.path'), input: t('mvu.zod.input'), cmdErr: t('mvu.zod.cmdErr', { cmd: '{cmd}' }), initErr: t('mvu.zod.initErr', { n: '{n}' }), notNumber: t('mvu.zod.notNumber', { type: '{type}' }), moveMissing: t('mvu.zod.moveMissing', { path: '{path}' }), ok: t('mvu.zod.ok') });
frameHooks.init = async f => {
  await lsReady;
  const chat = cur.chat, ch = chat ? S.get('chars', chat.charIds[0]) : undefined;
  const st = fullState();
  return { ls, msgId: msgIndexOf(f), lastId: cur.msgs.length - 1, messages: st.messages, ver: st.ver, vars: vars(), user: chat ? S.persona(chat)?.name : '', char: ch?.name || '', charId: ch?.id || '', charAvatar: ch?.avatar || '', userAvatar: chat ? S.persona(chat)?.avatar || '' : '', viewH: innerHeight, mvuExtra: isDuringExtra(), mvuNotify: !!(S.settings as { mvu?: { notifyErr?: boolean } }).mvu?.notifyErr, mvuText: mvuText() };
};

async function commit() { await chatApi.save(); chatApi.redraw?.(); }

frameHooks.call = async (f, fn, args) => {
  const chat = cur.chat;
  const own = appCalls[fn]; if (own) return await own(f, args);
  switch (fn) {
    case 'lsSet': ls[String(args[0])] = String(args[1]); lsSave(); return null;
    case 'lsDel': delete ls[String(args[0])]; lsSave(); return null;
    case 'lsClear': ls = {}; lsSave(); return null;
    case 'toast': { const [kind, m, title] = args as string[]; toast([title, m].filter(Boolean).join(' — '), (kind || '') as 'ok'); return null; }
    case 'slash': return await runQrScript(String(args[0] || ''));
    case 'emit': return await relayEmit(f, String(args[0] ?? ''), Array.isArray(args[1]) ? args[1] as unknown[] : []);   // 다른 화면 · 앱에도 알리고, 고쳐진 인자를 돌려준다
    case 'state': return { ...fullState(), lastId: cur.msgs.length - 1 };   // 화면이 받은 판이 어긋났다: 통째로 다시
  }
  if (!chat) throw new Error('no chat open');
  const ms = cur.msgs;
  switch (fn) {
    case 'setMsgs': {
      for (const p of (args[0] as Obj[]) || []) {
        const m = ms[Number(p.message_id)]; if (!m) continue;
        if (typeof p.message === 'string') { const s = m.swipes[m.sw]; if (s) { s.text = p.message; delete s.tr; } }
        if (typeof p.name === 'string') m.name = p.name;
        if (typeof p.is_hidden === 'boolean') m.hidden = p.is_hidden;
        if (Array.isArray(p.swipes) && p.swipes.length) { const texts = p.swipes.map(x => String(x ?? '')); m.swipes = texts.map((tx, k) => m.swipes[k] ? { ...m.swipes[k], text: tx } : { text: tx, ts: Date.now() }); m.sw = Math.min(m.sw, m.swipes.length - 1); }
        if (typeof p.swipe_id === 'number' && m.swipes[p.swipe_id]) m.sw = p.swipe_id;
        if (Array.isArray(p.swipes_data)) p.swipes_data.forEach((v, k) => { if (m.swipes[k] && v && typeof v === 'object') setVarsOf(m, v as Obj, k); });
        if (p.data && typeof p.data === 'object') setVarsOf(m, p.data as Obj);
      }
      await commit(); return null;
    }
    case 'createMsgs': {
      const list = (args[0] as Obj[]) || [], at = (args[1] as Obj)?.insert_at;
      const made = list.map(p => { const role = p.role === 'user' ? 'user' : p.role === 'system' ? 'system' : 'assistant'; const m = newMsg(role, String(p.message ?? ''), { name: String(p.name || '') }); if (role === 'assistant') m.charId = chat.charIds[0] || ''; if (p.is_hidden) m.hidden = true; if (p.data && typeof p.data === 'object') setVarsOf(m, p.data as Obj); return m; });
      const pos = typeof at === 'number' ? (at < 0 ? ms.length + 1 + at : at) : ms.length;
      ms.splice(Math.max(0, Math.min(ms.length, pos)), 0, ...made);
      await commit(); return null;
    }
    case 'delMsgs': {
      const ids = new Set(((args[0] as number[]) || []).map(Number));
      for (let i = ms.length - 1; i >= 0; i--) if (ids.has(i)) ms.splice(i, 1);
      await commit(); return null;
    }
    case 'setVars': {
      const [t, id, v] = args as [string, number | null, Obj];
      if (t === 'message') { const m = ms[Number(id)]; if (m) setVarsOf(m, v || {}); await chatApi.save(); }
      else if (t === 'global') { S.settings.globalVars = v as Record<string, string>; S.saveSettings(); }
      else { chat.vars = v as Record<string, string>; await S.save('chats', chat, true); }
      return null;
    }
    case 'generate': { const c = (args[0] || {}) as Obj; return await hostGen(String(c.user_input ?? c.prompt ?? ''), {}); }
    case 'generateRaw': {
      const c = (args[0] || {}) as Obj, ordered = Array.isArray(c.ordered_prompts) ? (c.ordered_prompts as unknown[]).map(x => typeof x === 'string' ? x : String((x as Obj)?.content ?? '')).join('\n\n') : '';
      return await hostGen([ordered, String(c.user_input ?? '')].filter(Boolean).join('\n\n'), { raw: true });
    }
  }
  throw new Error(`${fn} is not supported`);
};

// 앱에서 일어난 일을 화면들에 알린다 (실리태번 이벤트 이름으로)
const state = () => ({ ...(stateDelta() || {}), lastId: cur.msgs.length - 1, vars: vars(), mvuExtra: isDuringExtra() });
const anyFrame = () => !!document.querySelector('iframe.dl-frame-el');   // 화면이 하나도 없으면 사본을 만들 것도 없다
const send = (ev: string, i?: number) => { if (anyFrame()) framePost({ dlState: state(), dlEvent: ev, args: i == null ? [] : [i] }); };
/** 변수 갱신이 끝난 뒤에 알린다 (실리태번에서 변수 갱신이 먼저 끝나는 것과 같게) */
const after = (ev: string, d: unknown, i: () => number) => { const chat = (d as { chat?: unknown })?.chat || cur.chat; void Promise.resolve().then(() => mvuPending(chat as typeof cur.chat)).then(() => send(ev, i())); };
on('mvu:updated', () => { if (anyFrame()) framePost({ dlState: state() }); });
const idx = (d: unknown) => { const m = (d as { msg?: Msg })?.msg; return m ? cur.msgs.indexOf(m) : cur.msgs.length - 1; };
on('message:received', d => { const i = idx(d); after('message_received', d, () => i); });
on('message:sent', d => { const i = idx(d); after('message_sent', d, () => i); });
on('message:edited', d => { const i = idx(d); after('message_edited', d, () => i); });
on('message:swiped', d => { const i = idx(d); after('message_swiped', d, () => i); });
on('message:deleted', () => send('message_deleted', cur.msgs.length));
on('generate:start', () => send('generation_started'));
on('generate:end', () => send('generation_ended', cur.msgs.length - 1));
// 앱 창 높이가 바뀌면 화면들의 --TH-viewport-height 를 맞춘다
let vhTimer = 0;
addEventListener('resize', () => { clearTimeout(vhTimer); vhTimer = window.setTimeout(() => framePost({ dlState: { viewH: innerHeight } }), 150); });
