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
import { isDuringExtra, pending as mvuPending } from '../mvu/app';

type Obj = Record<string, unknown>;
type MsgD = Msg & { thData?: Obj };
const hostGen = (p: string, o: { raw?: boolean }) => (appHost() as unknown as { gen: (p: string, o: { raw?: boolean }) => Promise<string> }).gen(p, o);

// 화면 안의 localStorage 를 대신 보관한다 (모든 화면이 함께 쓴다)
let ls: Record<string, string> = {};
const lsReady = DB.get('kv', 'frame-ls').then(r => { ls = ((r as { data?: Record<string, string> } | undefined)?.data) || {}; }).catch(() => { });
let lsTimer = 0;
const lsSave = () => { clearTimeout(lsTimer); lsTimer = window.setTimeout(() => void DB.put('kv', { id: 'frame-ls', data: ls }), 300); };

const roleOf = (m: Msg) => m.role === 'user' ? 'user' : m.role === 'system' ? 'system' : 'assistant';
const view = (m: MsgD, i: number) => ({ message_id: i, name: m.name || (m.role === 'user' ? S.persona(cur.chat!)?.name : '') || '', role: roleOf(m), is_hidden: !!m.hidden, message: msgText(m), data: m.thData || {}, swipe_id: m.sw, swipes: m.swipes.map(s => s.text) });
const LIMIT = 300;
const snapshot = () => { const ms = cur.msgs as MsgD[], from = Math.max(0, ms.length - LIMIT); return ms.slice(from).map((m, j) => view(m, from + j)); };
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
  return { ls, msgId: msgIndexOf(f), lastId: cur.msgs.length - 1, messages: snapshot(), vars: vars(), user: chat ? S.persona(chat)?.name : '', char: ch?.name || '', charId: ch?.id || '', charAvatar: ch?.avatar || '', mvuExtra: isDuringExtra(), mvuNotify: !!(S.settings as { mvu?: { notifyErr?: boolean } }).mvu?.notifyErr, mvuText: mvuText() };
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
  }
  if (!chat) throw new Error('no chat open');
  const ms = cur.msgs as MsgD[];
  switch (fn) {
    case 'setMsgs': {
      for (const p of (args[0] as Obj[]) || []) {
        const m = ms[Number(p.message_id)]; if (!m) continue;
        if (typeof p.message === 'string') { const s = m.swipes[m.sw]; if (s) { s.text = p.message; delete s.tr; } }
        if (typeof p.name === 'string') m.name = p.name;
        if (typeof p.is_hidden === 'boolean') m.hidden = p.is_hidden;
        if (p.data && typeof p.data === 'object') m.thData = p.data as Obj;
      }
      await commit(); return null;
    }
    case 'createMsgs': {
      const list = (args[0] as Obj[]) || [], at = (args[1] as Obj)?.insert_at;
      const made = list.map(p => { const role = p.role === 'user' ? 'user' : p.role === 'system' ? 'system' : 'assistant'; const m = newMsg(role, String(p.message ?? ''), { name: String(p.name || '') }) as MsgD; if (role === 'assistant') m.charId = chat.charIds[0] || ''; if (p.is_hidden) m.hidden = true; if (p.data) m.thData = p.data as Obj; return m; });
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
      if (t === 'message') { const m = ms[Number(id)]; if (m) m.thData = v || {}; await chatApi.save(); }
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
const send = (ev: string, i?: number) => framePost({ dlState: { lastId: cur.msgs.length - 1, messages: snapshot(), vars: vars(), mvuExtra: isDuringExtra() }, dlEvent: ev, args: i == null ? [] : [i] });
/** 변수 갱신이 끝난 뒤에 알린다 (실리태번에서 변수 갱신이 먼저 끝나는 것과 같게) */
const after = (ev: string, d: unknown, i: () => number) => { const chat = (d as { chat?: unknown })?.chat || cur.chat; void Promise.resolve().then(() => mvuPending(chat as typeof cur.chat)).then(() => send(ev, i())); };
on('mvu:updated', () => framePost({ dlState: { lastId: cur.msgs.length - 1, messages: snapshot(), vars: vars(), mvuExtra: isDuringExtra() } }));
const idx = (d: unknown) => { const m = (d as { msg?: Msg })?.msg; return m ? cur.msgs.indexOf(m) : cur.msgs.length - 1; };
on('message:received', d => { const i = idx(d); after('message_received', d, () => i); });
on('message:sent', d => { const i = idx(d); after('message_sent', d, () => i); });
on('message:edited', d => { const i = idx(d); after('message_edited', d, () => i); });
on('message:swiped', d => { const i = idx(d); after('message_swiped', d, () => i); });
on('message:deleted', () => send('message_deleted', cur.msgs.length));
on('generate:start', () => send('generation_started'));
on('generate:end', () => send('generation_ended', cur.msgs.length - 1));
