// 함께한 날: 그 캐릭터와 처음 이야기한 날부터 며칠째인지, 오늘이 기념일(7일 · 30일 · 50일 · 100일마다 · 1년마다)인지.
// 모델 호출 없이 날짜만 센다. 대화 모드의 프롬프트 · 매크로 · 대화 화면 위 표시가 함께 쓴다.
import { S } from './core';
import type { Chat } from './types';

const DAY = 86400000;
const dayStart = (t: number) => { const d = new Date(t); d.setHours(0, 0, 0, 0); return d.getTime(); };
/** 그 캐릭터와 처음 대화방을 연 때 (없으면 0) */
export function firstMet(charId: string): number {
  // 목록 화면은 캐릭터마다 부른다 — 대화방을 캐릭터 수만큼 다시 훑지 않게, 방 목록이 바뀔 때만 한 번에 센다
  if (metOf.arr !== S.chats || metOf.len !== S.chats.length) {
    const m = new Map<string, number>();
    for (const c of S.chats) if (c.createdAt) for (const id of c.charIds || []) { const v = m.get(id); if (!v || c.createdAt < v) m.set(id, c.createdAt); }
    Object.assign(metOf, { arr: S.chats, len: S.chats.length, map: m });
  }
  return metOf.map.get(charId) || 0;
}
const metOf: { arr: unknown; len: number; map: Map<string, number> } = { arr: null, len: -1, map: new Map() };
/** 며칠째인가 — 처음 만난 날이 1일째 (한국식 D+). 만난 적이 없으면 0 */
export function daysTogether(charId: string, now = Date.now()): number {
  const at = firstMet(charId); if (!at) return 0;
  return Math.max(1, Math.round((dayStart(now) - dayStart(at)) / DAY) + 1);
}
/** 오늘이 기념일이면 그 이름 ('week' · 'month' · 'days' · 'year'), 아니면 '' */
export function milestone(n: number, charId = '', now = Date.now()): { kind: 'week' | 'month' | 'days' | 'year'; count: number } | null {
  if (charId) {   // 1년 · 2년 … 은 날짜(월 · 일)가 같은 날
    const at = firstMet(charId), a = new Date(at), b = new Date(now), years = b.getFullYear() - a.getFullYear();
    if (at && years >= 1 && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()) return { kind: 'year', count: years };
  }
  if (n === 7) return { kind: 'week', count: 1 };
  if (n === 30) return { kind: 'month', count: 1 };
  if (n === 50 || (n >= 100 && n % 100 === 0)) return { kind: 'days', count: n };
  return null;
}
/** 이 방에서 함께한 날을 셀 상대 — 1:1 대화 모드 방의 그 캐릭터 (설정에서 끄면 없음) */
export function togetherOf(chat: Chat | null | undefined): { charId: string; days: number; mark: ReturnType<typeof milestone> } | null {
  if (!chat || chat.mode !== 'talk' || chat.charIds.length !== 1 || (S.settings.modes as { together?: boolean }).together === false) return null;
  const charId = chat.charIds[0], days = daysTogether(charId); if (!days) return null;
  return { charId, days, mark: milestone(days, charId) };
}
