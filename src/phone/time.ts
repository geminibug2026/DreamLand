// 휴대폰의 시계: 분이 바뀔 때 한 번만 다시 그린다 (분 경계에 맞춘 타이머 하나 · 보이는 동안만).
// 연 대화에 이야기 시계가 있으면 그 시각을 쓴다 — 멈춰 둔 시계 · 메시지마다 가는 시계는 타이머 없이 시계가 움직일 때만
import { useSyncExternalStore } from 'react';
import { on } from '../lib/core';
import { Clock } from '../lib/clock';
import type { Chat } from '../lib/types';
import { fmtDate, getLang } from '../i18n';

let src: Chat | null = null, story = false, ver = 0, timer = 0;
const subs = new Set<() => void>(); let offs: (() => void)[] = [];
/** 이야기 시계가 켜진 방인가 */
export const hasStory = (c: Chat | null | undefined) => Clock.mode(c) === 'story';
/** 시계를 따를 방과, 이야기 시각을 쓸지 */
export function setTimeSource(chat: Chat | null, useStory: boolean) { const s = useStory && hasStory(chat); if (chat === src && s === story) return; src = chat; story = s; tick(); }
/** 휴대폰의 지금 (ms) */
export const phoneNow = () => story ? Clock.ms(src) : Date.now();
/** 지금 이야기 시각을 보이는 중인가 */
export const storyOn = () => story;
const flows = () => !story || src?.clock?.flow === 'real';
function schedule() {
  clearTimeout(timer); timer = 0;
  if (!subs.size || document.hidden || !flows()) return;
  const ms = phoneNow(); timer = window.setTimeout(tick, 60000 - (((ms % 60000) + 60000) % 60000) + 50);
}
function tick() { ver++; subs.forEach(f => f()); schedule(); }
const vis = () => { if (document.hidden) { clearTimeout(timer); timer = 0; } else tick(); };
function subscribe(f: () => void) {
  subs.add(f);
  if (subs.size === 1) {   // 처음 보는 이가 생기면 켜고, 아무도 안 보면 끈다
    document.addEventListener('visibilitychange', vis);
    offs = [on('clock', tick), on('clock:tick', tick)];
    schedule();
  }
  return () => { subs.delete(f); if (!subs.size) { clearTimeout(timer); timer = 0; document.removeEventListener('visibilitychange', vis); offs.forEach(o => o()); offs = []; } };
}
/** 분이 바뀔 때 다시 그린다. 휴대폰의 지금(ms)을 돌려준다 */
export function useMinute(): number { useSyncExternalStore(subscribe, () => ver); return phoneNow(); }

const p2 = (n: number) => String(n).padStart(2, '0');
export const hhmm = (ms: number) => { const d = new Date(ms); return `${p2(d.getHours())}:${p2(d.getMinutes())}`; };
export const parts = (ms: number) => { const d = new Date(ms); return { h: p2(d.getHours()), m: p2(d.getMinutes()) }; };
/** 11월 27일 금요일 · Friday, November 27 */
export const longDate = (ms: number) => fmtDate(new Date(ms), { month: 'long', day: 'numeric', weekday: 'long' });
/** 03.14 금 · 3/14 Fri */
export const shortDate = (ms: number) => { const d = new Date(ms); return getLang() === 'ko' ? `${p2(d.getMonth() + 1)}.${p2(d.getDate())} ${fmtDate(d, { weekday: 'short' })}` : fmtDate(d, { month: 'numeric', day: 'numeric', weekday: 'short' }); };
/** 장식용 영문 달 이름 (필기체 글자) */
export const scriptMonth = (ms: number) => new Date(ms).toLocaleString('en', { month: 'long' });
