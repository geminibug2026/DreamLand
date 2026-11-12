// 일기장 · 달력이 대화 화면 등에 꽂는 것들: 약속 태그 지우기 · 프롬프트 조각 · 패널 · 메시지/입력창 메뉴 · 명령어 · 답변 뒤 처리
// 옛 diary.js · f-almanac.js 는 js/boot.js 의 FEATURES 에서 빠졌다 (등록은 여기 한 곳)
import { useEffect, useReducer } from 'react';
import { Btn, mountInto } from '../kit';
import { toast } from '../ui';
import { openDiary } from '../diary/Book';
import { bindDialog, promiseDialog } from '../diary/dialogs';
import { A, Promises, afterReply, cleanText, onChatOpen, promptPieces, seed, syncChat, syncLive } from '../diary/logic';
import { Glyph, MoonMini } from '../diary/parts';
import type { DChat, Msg } from '../diary/types';
import { chatApi } from '../chat/actions';
import { go } from '../lib/router';
import * as hooks from '../lib/hooks';
import * as core from '../lib/core';
import * as K from '../lib/f-keepsake';
import { t as tr, tn, getLang, fmtDate } from '../i18n';

const OWNER = 'almanac';
const now = () => core.now();
const toCal = (chatId?: string, day?: string) => go('diary', { tab: 'calendar', chatId, day });

/** 대화 화면 옆 패널: 이달의 달 · 다가오는 약속 */
function Panel({ chat, msgs: first, host }: { chat: DChat; msgs: Msg[]; host: HTMLElement }) {
  const [msgs, setMsgs] = useReducer((_: Msg[], m: Msg[]) => [...m], first);
  useEffect(() => core.on<DChat | null>('almanac:changed', c => { if (c && host.isConnected && c.id === chat.id) setMsgs(chatApi.current().msgs || []); }), [chat, host]);
  const k = K, today = k.dayKey(now()), mk = k.monthKey(now()), st = k.monthStats(k.collectDays(chat, msgs), mk, A().goal, today), list = Promises.of(chat).filter(p => !p.done && k.diffDays(today, p.date) >= -7).slice(0, 5);
  return <>
    <button className="alm-pmoon" title={tr('diary.panel.open')} onClick={() => toCal(chat.id)}><MoonMini fill={st.fill} size={34} /><div><b>{tr('diary.panel.month', { month: getLang() === 'ko' ? `${+mk.slice(5)}월` : fmtDate(new Date(+mk.slice(0, 4), +mk.slice(5) - 1, 1), { month: 'long' }), active: st.active, target: st.target })}</b><small>{st.full ? tr('diary.panel.full') : tn('diary.panel.left', st.left, { phase: k.phaseLabel(k.fillToPhase(st.fill)) })}</small></div></button>
    {list.length ? <div className="alm-plist">{list.map(p => { const s = k.promiseState(p, today); return <button key={p.id} className={`alm-pmini ${s}`} onClick={() => toCal(chat.id, p.date)}><Glyph name={s === 'upcoming' ? 'open' : s} /><span>{p.what}</span><small>{p.date === today ? tr('diary.today') : getLang() === 'ko' ? `${+p.date.slice(5, 7)}.${+p.date.slice(8)}` : fmtDate(K.keyDate(p.date), { month: 'numeric', day: 'numeric' })}</small></button>; })}</div> : <p className="dim">{tr('diary.panel.noPromise')}</p>}
    <div className="row wrap"><Btn label={tr('diary.promise.add')} ic="plus" cls="ghost" onClick={() => void promiseDialog(chat)} /><Btn label={tr('diary.tab.promises')} ic="note" cls="ghost" onClick={() => go('diary', { tab: 'promises', chatId: chat.id })} /><Btn label={tr('diary.bind.title')} ic="book" cls="ghost" onClick={() => void bindDialog(chat)} /></div>
  </>;
}

function setup() {
  if (!document.querySelector('link[data-almanac]')) { const l = document.createElement('link'); l.rel = 'stylesheet'; l.href = new URL('/css/almanac.css', location.origin).href; l.dataset.almanac = '1'; document.head.append(l); }
  const { on } = core, { X, dropOwner } = hooks;
  dropOwner(OWNER);   // 옛 모듈이 먼저 꽂아 둔 것이 있으면 걷어 내고 꽂는다
  // 화면에 보이기 직전: 약속 태그를 지운다 (쓰는 도중에도)
  X.filters.push({ owner: OWNER, fn: text => K.stripPromiseTags(text) });
  X.prompt.push({ owner: OWNER, fn: promptPieces });
  on('message:received', afterReply);
  on<DChat | null>('chat:open', c => void onChatOpen(c));
  on<{ chat?: DChat } | undefined>('scene:close', a => void syncLive(a));
  on<{ chat?: DChat } | undefined>('generate:end', a => void syncLive(a));
  on<DChat | { chat?: DChat; at?: string } | null>('diary:open', a => { if (!a) return; if ('chat' in a && a.chat) void openDiary((a as { chat: DChat }).chat, a as { at?: string }); else void openDiary(a as DChat); });

  let panelOff: (() => void) | null = null;
  X.panels.push({ owner: OWNER, id: 'almanac', get title() { return tr('diary.panel.title'); }, icon: 'moon', render: (chat, msgs) => {
    panelOff?.();
    const host = document.createElement('div'); host.className = 'alm-panel';
    panelOff = mountInto(host, <Panel chat={chat} msgs={msgs || []} host={host} />);
    syncChat(chat, msgs || [], { quiet: false }).catch(() => { });
    return host;
  } });
  X.actions.push({ owner: OWNER, id: 'alm-promise', get label() { return tr('diary.act.asPromise'); }, icon: 'note', run: (m, chat) => promiseDialog(chat!, null, { what: cleanText(m).split('\n').map(s => s.trim()).filter(Boolean)[0]?.replace(/^["“]|["”]$/g, '').slice(0, 60) || '', date: K.addDays(K.dayKey(now()), 1), msgId: m.id }) });
  X.actions.push({ owner: OWNER, id: 'alm-day', get label() { return tr('diary.act.dayCal'); }, icon: 'moon', run: (m, chat) => toCal(chat!.id, K.dayKey(K.msgTs(m) || now())) });
  X.composer.push({ owner: OWNER, id: 'alm-add', get label() { return tr('diary.promise.add'); }, icon: 'note', run: () => { const c = chatApi.current().chat; if (c) void promiseDialog(c); } });
  X.composer.push({ owner: OWNER, id: 'alm-open', get label() { return tr('diary.act.openCal'); }, icon: 'moon', run: () => toCal(chatApi.current().chat?.id) });
  X.commands.set('/promise', { owner: OWNER, get help() { return tr('diary.cmd.promise'); }, run: async (arg, api) => {
    const k = K, chat = api.current().chat; if (!chat) return; const tok = String(arg || '').trim().split(/\s+/).filter(Boolean);
    if (!tok.length) return promiseDialog(chat);
    for (let n = Math.min(3, tok.length - 1); n >= 1; n--) { const date = k.resolveDate(tok.slice(0, n).join(' ')); if (!date) continue; let rest = tok.slice(n), time = k.normTime(rest[0]); if (time && rest.length > 1) rest = rest.slice(1); else time = ''; const p = await Promises.add(chat, { date, time, what: rest.join(' ') }); return toast(tr('diary.toast.promiseAdded', { date: k.showDate(p.date, { year: false }), what: p.what })); }
    return promiseDialog(chat, null, { what: tok.join(' ') });
  } });
  X.commands.set('/almanac', { owner: OWNER, get help() { return tr('diary.cmd.almanac'); }, run: (_, api) => toCal(api.current().chat?.id) });
  X.commands.set('/bind', { owner: OWNER, get help() { return tr('diary.cmd.bind'); }, run: (_, api) => { const c = api.current().chat; if (c) return bindDialog(c); } });

  seed();
}

export const feature = { name: 'diary', setup };
