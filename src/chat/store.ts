// 대화 화면의 상태. 화면 조각마다 알림 통로가 따로 있어, 바뀐 조각만 다시 그린다 (스트리밍 중에는 그 메시지 하나만)
import { useSyncExternalStore } from 'react';
import { flushSync } from 'react-dom';
import type { Built, Msg, Room } from './types';

export const cur = {
  chat: null as Room | null, msgs: [] as Msg[], busy: false, prep: false, abort: null as AbortController | null,
  /** 답변 전 준비를 멈추는 것 · 돌고 있는 스크립트(QR · / 명령) 수 */
  prepAbort: null as AbortController | null, qr: 0,
  lastPrompt: null as Built | null, shown: 60, drawer: false, status: '', attach: [] as string[],
  gen: null as { chat: Room; msgs: Msg[] } | null, openedAt: 0, chimeRun: 0,
  fold: new Set<string>(), more: new Map<string, number>(),
  // ── 화면 ──
  sideOpen: false,
  /** 전체를 새로 그릴 때마다 오른다 (메시지 요소를 통째로 새로 만든다) */
  epoch: 0,
  /** 메시지 하나를 새로 만들 때 오르는 번호 */
  revs: new Map<string, number>(),
  /** 지금 그려 둔 첫 메시지 자리 · "더 보기" 단추에 적힌 남은 개수 */
  head: 0, from: 0,
  /** 방금 덧붙여서 등장 효과를 줄 메시지 */
  fresh: new Set<string>(),
  /** 스트리밍 · 한 줄씩 보여 주기 동안 본문 자리에 대신 넣는 HTML */
  paint: new Map<string, string>(),
};
/** 실제 요소 (스크롤 · 포커스처럼 직접 건드려야 하는 것) */
export const ui = {
  layout: null as HTMLElement | null, scroll: null as HTMLElement | null, msgs: null as HTMLElement | null,
  input: null as HTMLTextAreaElement | null, side: null as HTMLElement | null,
};

const vers = new Map<string, number>(), subs = new Map<string, Set<() => void>>();
export function bump(...chs: string[]) { for (const ch of chs) { vers.set(ch, (vers.get(ch) || 0) + 1); subs.get(ch)?.forEach(f => f()); } }
/** 알리고, 화면에 반영될 때까지 기다린다 (바로 뒤에 스크롤 위치를 재야 할 때) */
export function flush(...chs: string[]) { flushSync(() => bump(...chs)); }
/** 이 통로에 알림이 오면 다시 그린다 */
export function useCh(ch: string): number {
  return useSyncExternalStore(cb => { let s = subs.get(ch); if (!s) subs.set(ch, s = new Set()); s.add(cb); return () => { s.delete(cb); if (!s.size) subs.delete(ch); }; }, () => vers.get(ch) || 0);
}
