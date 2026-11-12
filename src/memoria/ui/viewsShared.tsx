// 기억 · 세계 · 이야기 탭이 함께 쓰는 작은 도구 (옛 memoria-views.js 의 「작은 도구」)
import type { MouseEvent } from 'react';
import { L } from '../../legacy';
import { Memory, chatApi, toast, ui, type MemoryUi } from '../bridge';
import type { TimelineStore } from '../scene';
import type { Bond, BondStep, ChatM, Mem, Msg } from '../types';
import { makeIcons, type StOpen } from './parts';

/** 이 세 화면만 쓰는 엔진 메서드 */
export type MemoryViews = MemoryUi & {
  canonName(mem: Mem, name: string): string;
  upsertBond(mem: Mem, b: { from: string; to: string; stage: string; basis?: string; calls?: string; unsaid?: string }, turn: number, o?: { manual?: boolean }): Bond | null;
  dossierChars(mem: Mem): number;
  latestStatus?(msgs: Msg[]): { when?: string; place?: string } | null;
  statusHistory?(msgs: Msg[]): { msgId?: string; mesId?: number; when?: string; place?: string; weather?: string }[];
  summarize(chat: ChatM, mem: Mem, o?: { flush?: boolean }): Promise<number>;
  rebuildSummaries(chat: ChatM, mem: Mem, o?: { stop?: () => boolean; onProgress?: (done: number, total: number) => void }): Promise<number | null | undefined>;
  chunkText(chat: ChatM, mem: Mem, from: number, to: number, signal?: AbortSignal, strict?: boolean): Promise<string>;
};
export const Mx = () => Memory<MemoryViews>();

const GL: Record<string, string> = { anchor: 'M12 8a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5zM12 8v13M8 12h8M4 13a8 8 0 0 0 16 0', sprout: 'M12 21v-9M12 12c0-4-3-6-7-6 0 4 3 6 7 6zM12 15c0-3 2.5-5 6.5-5 0 3-2.5 5-6.5 5z', quote: 'M5 17c2-1 3-3 3-5H5V7h5v5c0 3-2 5-4 6zM14 17c2-1 3-3 3-5h-3V7h5v5c0 3-2 5-4 6z' };
const GlIco = makeIcons(GL).Ico;
/** 닻 · 새싹 · 따옴표 그림 */
export const Gi = ({ name, size = 14 }: { name: 'anchor' | 'sprout' | 'quote'; size?: number }) => <GlIco name={name} size={size} />;

export const cut = (s: unknown, n = 400) => String(s ?? '').replace(/\s+/g, ' ').trim().slice(0, n);
export const cutLines = (s: unknown, n = 2000) => String(s ?? '').replace(/\r/g, '').split('\n').map(l => l.replace(/[ \t]+/g, ' ').trimEnd()).join('\n').replace(/\n{3,}/g, '\n\n').trim().slice(0, n);
export const LINES_MAX = 6, GROWTH_MAX = 5, MANUAL_MAX = 2000;   // 인물 칸의 상한
export const HAND = 0;   // 직접 적은 달라진 점 · 남긴 말의 턴
export const bondNow = (b?: Bond | null): BondStep | null => b?.log?.[b.log.length - 1] || null;
export const bondViewRows = (mem: Mem) => (mem.bonds || []).filter(b => !b.disabled && bondNow(b)).map(b => ({ id: b.id, from: b.from, to: b.to, stage: bondNow(b)!.stage, log: b.log }));
/** 이야기 속 시간 — 끊는 자리 (시간 · 일 · 주 · 개월 · 년) */
export const koDuration = (d: number) => d < 1 ? `${Math.max(1, Math.round(d * 24))}시간` : d < 14 ? `${Math.round(d)}일` : d < 60 ? `${Math.round(d / 7)}주` : d < 365 * 2 ? `${Math.round(d / 30)}개월` : `${Math.round(d / 365)}년`;
export const sceneSlot = (mem: Mem, slot: string) => { for (let i = mem.status.length - 1; i >= 0; i--) { const s = mem.status[i]; if (String(s.entity || '').toLowerCase() === 'scene' && String(s.slot || '').toLowerCase() === slot) return s.value; } return ''; };
/** 메시지 id → 화면에 보이는 번호(#1부터) */
export const noMap = (st: StOpen) => new Map(st.msgs.map((m, i) => [m.id, i + 1]));
/** 서고를 연표 도구가 기대하는 모양으로 (턴 번호는 화면에 보이는 t1부터, 메시지는 #번호) */
export function storeOf(st: StOpen, no = noMap(st)): TimelineStore {
  const mem = st.mem, n = (id?: string) => no.get(id as string) ?? -1;
  return {
    turns: mem.turns.map((t, i) => ({ turnIndex: i + 1, mesId: n(t.msgId), when: t.when || '', where: t.where || '', importance: t.weight, summary: t.digest || '', failed: !!t.failed })),
    memories: mem.memories.map(m => ({ id: m.id, kind: m.kind, disabled: m.disabled, importance: m.importance, tags: m.tags || [], turnIndex: (m.turn ?? -1) + 1, mesId: n(m.msgId), entities: m.entities || [], summary: m.summary, visibility: m.visibility })),
    milestones: mem.milestones.map(e => ({ id: e.id, turnIndex: (e.turn ?? -1) + 1, participants: e.participants || [], title: e.title, summary: e.summary, grade: e.grade })),
  };
}
/** 이야기 탭의 상태 (탭을 옮겨도 남는다) */
export interface StoryState {
  tab: string; by: string; query: string; minStars: number; sort: string; desc: boolean; open: string; bond: string; focus: string;
  busy: { stop: boolean } | null; prog: string; progEl?: HTMLElement | null; digests?: boolean;
  /** 다시 그려질 때 검색칸에 있던 커서 자리 */
  caret?: [number | null, number | null] | null;
}
export const storyState = (st: StOpen): StoryState => (st.story ||= { tab: 'flow', by: 'people', query: '', minStars: 0, sort: 'order', desc: false, open: '', bond: '', focus: '', busy: null, prog: '' }) as StoryState;
/** 그 번호의 메시지로 간다 (열려 있는 대화일 때) */
export function jumpTo(st: StOpen, n: number) {
  const msg = st.msgs[n - 1];
  if (!msg || chatApi().current().chat?.id !== st.chat?.id) return toast(`#${n} 메시지는 지금 화면에 불러와져 있지 않아요.`);
  st.close?.(); if (ui().route.page !== 'chat') L.ui.go('chat', st.chat.id);
  setTimeout(() => { chatApi().scrollTo(msg.id); const el = document.querySelector(`article.msg[data-id="${msg.id}"]`); if (el) { el.classList.add('mm-flash'); setTimeout(() => el.classList.remove('mm-flash'), 1600); } }, 300);
}
/** 화면 맨 바깥에 건다 — #번호 단추를 누르면 그 메시지로 */
export const onJump = (st: StOpen) => (e: MouseEvent<HTMLElement>) => { const j = (e.target as Element).closest?.<HTMLElement>('.mm-st-jump'); if (j) { e.preventDefault(); e.stopPropagation(); jumpTo(st, +(j.dataset.mes || 0)); } };
