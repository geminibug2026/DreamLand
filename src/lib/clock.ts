// ── Dreamland clock: 대화방마다 따로 가는 시계 ── (옛 js/clock.js 의 로직, 동작 그대로. 시각 고르기 창은 src/chat/menus.tsx)
//   real  : 현실 시각 그대로 (기본)
//   story : 이야기 속 시각 — 시작 시각을 정하고, 현실처럼 흐르게 / 메시지마다 조금씩 / 멈춰 두기. 캐릭터가 직접 시간을 넘기게 할 수도 있다
//   none  : 시각을 쓰지 않는다
// chat.clock = { mode, at(이야기 시각 ms), setAt(그 시각을 맞춘 현실 시각 ms), flow: 'real'|'step'|'hold', step(분), ai }
import { S, on, emit } from './core';
import { X } from './hooks';
import { toast } from '../ui';
import { t, getLang, fmtDate } from '../i18n';
import type { Chat } from './types';

export type { ClockCfg } from './types';
export type ClockChat = Chat;
export interface ClockMsg { ts?: number; st?: number; sw?: number; swipes?: { ts?: number }[]; [k: string]: unknown }
interface SApi { save(coll: string, obj: unknown, quiet?: boolean): Promise<unknown> }
interface Cmd { owner: string; args: string; help: string; run(arg: string, api: { current(): { chat: ClockChat | null } }): unknown }
const SS = () => S as unknown as SApi;
const emitX = emit as unknown as (name: string, data?: unknown) => void;
const onX = on as unknown as (name: string, fn: (data: never) => unknown) => void;

const pad = (n: number) => String(n).padStart(2, '0');
const WEEK = ['일', '월', '화', '수', '목', '금', '토'];
const cfg = (chat: ClockChat | null | undefined) => chat?.clock && chat.clock.mode && chat.clock.mode !== 'real' ? chat.clock : null;
const short = (ms: number) => { const d = new Date(ms); if (getLang() !== 'ko') return fmtDate(d, { month: 'numeric', day: 'numeric', weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }); return `${d.getMonth() + 1}/${d.getDate()}(${WEEK[d.getDay()]}) ${pad(d.getHours())}:${pad(d.getMinutes())}`; };
const save = async (chat: ClockChat) => { await SS().save('chats', chat, true); emitX('clock', chat); };

/** "2h" · "90m" · "1d" · "2시간 30분" · "3일" → 분 (모르면 0) */
export function parseSpan(text: unknown) {
  let min = 0, hit = false;
  String(text || '').replace(/([\d.]+)\s*(d|day|days|일|h|hr|hrs|hour|hours|시간|m|min|mins|minute|minutes|분)/gi, (_, n: string, u: string) => {
    hit = true; u = u.toLowerCase(); min += +n * (/^(d|day|days|일)$/.test(u) ? 1440 : /^(h|hr|hrs|hour|hours|시간)$/.test(u) ? 60 : 1); return '';
  });
  return hit ? Math.round(min) : 0;
}
/** "22:30" · "2024-03-02 22:30" · "3/2 22:30" → 이야기 시각 ms (base 기준, 모르면 null). 시각만 주면 지금보다 이른 시각은 다음 날로 본다 */
export function parseMoment(text: unknown, base = Date.now()): number | null {
  const s = String(text || '').trim(); let m: RegExpMatchArray | null;
  if ((m = s.match(/^(\d{4})[-./](\d{1,2})[-./](\d{1,2})(?:[ T]+(\d{1,2}):(\d{2}))?/))) return new Date(+m[1], +m[2] - 1, +m[3], +(m[4] ?? new Date(base).getHours()), +(m[5] ?? new Date(base).getMinutes())).getTime();
  if ((m = s.match(/^(\d{1,2})\/(\d{1,2})(?:\s+(\d{1,2}):(\d{2}))?$/))) { const b = new Date(base); return new Date(b.getFullYear(), +m[1] - 1, +m[2], +(m[3] ?? b.getHours()), +(m[4] ?? b.getMinutes())).getTime(); }
  if ((m = s.match(/^(\d{1,2}):(\d{2})$/))) { const b = new Date(base), t = new Date(b.getFullYear(), b.getMonth(), b.getDate(), +m[1], +m[2]).getTime(); return t < base ? t + 86400000 : t; }
  return null;
}

export const Clock = {
  current: null as ClockChat | null,              // 지금 열려 있는 대화방 (일정 · 상태 계산이 기본으로 따르는 시계)
  mode: (chat: ClockChat | null | undefined) => cfg(chat)?.mode || 'real',
  /** 이 방의 지금 (ms) */
  ms(chat: ClockChat | null | undefined): number { const c = cfg(chat); if (!c || c.mode !== 'story') return Date.now(); return c.flow === 'real' ? c.at! + (Date.now() - (c.setAt || Date.now())) : c.at!; },
  now(chat: ClockChat | null | undefined) { return new Date(this.ms(chat)); },
  /** 열려 있는 방의 지금. 일정표 · 상태 계산처럼 대화방을 넘겨받지 않는 곳에서 쓴다 */
  date() { return this.now(this.current); },
  /** 메시지가 놓인 시각 (ms). 이야기 시계에서는 메시지에 적어 둔 이야기 시각 */
  timeOf(chat: ClockChat | null | undefined, m: ClockMsg | null | undefined): number { const c = cfg(chat), t = m?.swipes?.[m.sw as number]?.ts || m?.ts || Date.now(); if (!c || c.mode !== 'story') return t; return m?.st ?? (c.flow === 'real' ? c.at! + (t - (c.setAt || t)) : c.at!); },
  /** 시계를 옮긴다: { set: '22:30' | '2024-03-02 22:30' } 또는 { advance: '2h' }. 옮겼으면 true */
  async move(chat: ClockChat, { set, advance }: { set?: string; advance?: string } = {}) {
    const c = cfg(chat); if (!c || c.mode !== 'story') return false;
    const cur = this.ms(chat); let next: number | null = null;
    if (set) next = parseMoment(set, cur);
    if (next == null && advance) { const min = parseSpan(advance); if (min > 0) next = cur + min * 60000; }
    if (next == null || !isFinite(next)) return false;
    c.at = next; c.setAt = Date.now(); await save(chat); return true;
  },
  /** 프롬프트에 싣는 한 줄 (시각을 쓰지 않으면 빈 글) */
  line(chat: ClockChat | null | undefined) {
    const c = cfg(chat), d = this.now(chat), text = `${pad(d.getHours())}:${pad(d.getMinutes())}, ${d.toLocaleDateString('en-GB', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}`;
    if (c?.mode === 'none') return '';
    if (c?.mode !== 'story') return `The current time and date: ${text}.`;
    return `The current time and date inside this story: ${text}. This is story time, not the real-world clock — never refer to the real date.${c.flow === 'hold' ? ' Time stands still until someone moves it.' : ''}`;
  },
  /** 캐릭터에게 알려 줄 시계 명령 (허락했을 때만) */
  command(chat: ClockChat | null | undefined) { const c = cfg(chat); return c?.mode === 'story' && c.ai ? '[time: advance="2h"] or [time: set="YYYY-MM-DD HH:MM"] — when story time moves on (a time skip, falling asleep, the next morning). Use it sparingly.' : ''; },
};

// 메시지가 생길 때 이야기 시각을 적어 둔다. '메시지마다' 흐름이면 여기서 시계를 민다
async function mark({ msg, chat }: { msg?: ClockMsg; chat: ClockChat }) {
  const c = cfg(chat); if (!c || c.mode !== 'story' || !msg || msg.st != null) return;
  if (c.flow !== 'step') { msg.st = Clock.ms(chat); return; }
  c.at! += Math.max(0, +(c.step as number) || 0) * 60000; c.setAt = Date.now(); msg.st = c.at;   // 메시지에 먼저 적고 나서 저장한다
  await SS().save('chats', chat, true).catch(() => { }); emitX('clock:tick', chat);
}
onX('message:sent', mark); onX('message:received', mark);
onX('chat:open', (chat: ClockChat | null) => { Clock.current = chat || null; });

/** 상단 바에 붙는 짧은 표시 (현실 시각이면 빈 글) */
export const clockLabel = (chat: ClockChat | null | undefined) => { const c = cfg(chat); return !c ? '' : c.mode === 'none' ? '' : short(Clock.ms(chat)); };
export const clockHint = (chat: ClockChat | null | undefined) => { const c = cfg(chat); return !c ? t('clock.hint.real') : c.mode === 'none' ? t('clock.hint.none') : t('clock.hint.story', { time: short(Clock.ms(chat)) }); };

(X as unknown as { commands: Map<string, Cmd> }).commands.set('/time', { owner: 'clock', get args() { return t('clock.cmd.args'); }, get help() { return t('clock.cmd.help'); }, run: async (arg, api) => {
  const chat = api.current().chat; if (!chat) return;
  if (!arg) return toast(Clock.mode(chat) === 'story' ? t('clock.toast.now', { time: short(Clock.ms(chat)) }) : Clock.mode(chat) === 'none' ? t('clock.toast.none') : t('clock.toast.real'));
  const prev = chat.clock;
  if (Clock.mode(chat) !== 'story') { chat.clock = { flow: 'hold', step: 5, ai: false, ...(chat.clock || {}), mode: 'story', at: Date.now(), setAt: Date.now() }; }
  const ok = await Clock.move(chat, /^\s*\+/.test(arg) || (parseSpan(arg) && parseMoment(arg) == null) ? { advance: arg } : { set: arg });
  if (!ok) { if (prev === undefined) delete chat.clock; else chat.clock = prev; return toast(t('clock.toast.bad'), 'err'); }
  toast(t('clock.toast.now', { time: short(Clock.ms(chat)) }), 'ok');
} });
