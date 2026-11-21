// 책상: 홈에 놓는 위젯의 등록부와 배치(순서 · 크기 · 숨김 · 접기). 배치는 settings.desk 에 둔다
import type { ReactNode } from 'react';
import { S, emit, uid } from '../lib/core';
import { dayKey } from '../lib/f-keepsake';

export type Size = 's' | 'm' | 'l';
export const SIZES: Size[] = ['s', 'm', 'l'];
/**
 * 위젯 하나. 등록은 이것 하나로 끝난다:
 *   registerWidget({ id: 'feed', get title() { return t('feed.title'); }, size: 'm', render: () => <FeedMini /> });
 * title 은 getter 로 (언어를 바꾸면 따라가게). size 는 처음 놓일 때의 크기 — s 한 칸 · m 한 칸 반 · l 두 칸.
 */
export interface Widget {
  id: string; readonly title: string; size: Size; render(): ReactNode;
  /** 머리말 옆 작은 선 그림 (없으면 점 하나) */ art?: () => ReactNode;
  /** 서랍에서 보이는 한 줄 설명 */ readonly hint?: string;
  /** 처음에는 서랍에 넣어 둔다 */ off?: boolean;
  /** 틀과 머리말 없이 통째로 그린다 (제 틀을 가진 물건) */ bare?: boolean;
}
export interface Slot { id: string; size?: Size; off?: boolean }
export interface Note { id: string; text: string }
export interface DeskCfg { order: Slot[]; fold: boolean; notes: Note[]; visits: string[]; mode?: 'rp' | 'talk' | 'temp' }

const list: Widget[] = [];
/** 위젯을 올린다. 같은 id 로 다시 부르면 바꿔 끼운다 */
export function registerWidget(w: Widget) { const i = list.findIndex(x => x.id === w.id); if (i >= 0) list[i] = w; else list.push(w); emit('desk:changed'); }
export const unregisterWidget = (id: string) => { const i = list.findIndex(x => x.id === id); if (i >= 0) { list.splice(i, 1); emit('desk:changed'); } };
export const widgets = (): readonly Widget[] => list;

export function cfg(): DeskCfg {
  const c = (S.settings.desk ||= {}) as Partial<DeskCfg>;
  if (!Array.isArray(c.order)) c.order = []; if (!Array.isArray(c.notes)) c.notes = []; if (!Array.isArray(c.visits)) c.visits = []; c.fold = !!c.fold;
  return c as DeskCfg;
}
const save = () => { S.set({ desk: cfg() }); emit('desk:changed'); };

export interface Placed { w: Widget; size: Size; off: boolean }
/** 저장된 순서대로 늘어놓는다. 저장된 뒤에 새로 등록된 위젯은 끝에 붙고, 지금은 등록되지 않은 id 는 지우지 않고 건너뛴다 (그 기능이 나중에 켜질 수 있다) */
export function layout(): Placed[] {
  const c = cfg(), by = new Map(list.map(w => [w.id, w])), seen = new Set<string>(), out: Placed[] = [];
  for (const s of c.order) { const w = by.get(s.id); if (!w || seen.has(s.id)) continue; seen.add(s.id); out.push({ w, size: SIZES.includes(s.size as Size) ? s.size as Size : w.size, off: !!s.off }); }
  for (const w of list) if (!seen.has(w.id)) out.push({ w, size: w.size, off: !!w.off });
  return out;
}
/** 지금 보이는 배치를 그대로 적어 둔 뒤 고친다 (등록되지 않은 id 의 자리도 남긴다) */
function edit(fn: (rows: Slot[]) => void) {
  const c = cfg(), rows: Slot[] = layout().map(p => ({ id: p.w.id, size: p.size, off: p.off })), known = new Set(rows.map(r => r.id));
  fn(rows); c.order = [...rows, ...c.order.filter(s => !known.has(s.id))]; save();
}
/** 놓인 것들 사이에서 from 번째를 to 번째로 */
export const moveWidget = (from: number, to: number) => edit(rows => {
  const on = rows.filter(r => !r.off); if (from === to || !on[from] || !on[to]) return;
  const a = rows.indexOf(on[from]), [it] = rows.splice(a, 1), b = rows.indexOf(on[to]); rows.splice(from < to ? b + 1 : b, 0, it);
});
export const sizeWidget = (id: string, size: Size) => edit(rows => { const r = rows.find(x => x.id === id); if (r) r.size = size; });
/** 빼기 · 넣기. 넣을 때는 놓인 것들의 끝으로 */
export const toggleWidget = (id: string, off: boolean) => edit(rows => { const i = rows.findIndex(x => x.id === id); if (i < 0) return; const [r] = rows.splice(i, 1); r.off = off; rows.push(r); });
export const foldDesk = (fold: boolean) => { cfg().fold = fold; save(); };
export const resetDesk = () => { cfg().order = []; save(); };

// ── 쪽지 ──
export const addNote = (): Note => { const n = { id: uid(), text: '' }; cfg().notes.push(n); save(); return n; };
export const dropNote = (id: string) => { const c = cfg(); c.notes = c.notes.filter(n => n.id !== id); save(); };
let noteTimer = 0;
/** 쪽지 글은 치는 동안 자주 바뀌니 조금 모아서 저장한다 (알림은 보내지 않는다 — 치는 중에 다시 그려지지 않게) */
export const saveNotes = () => { clearTimeout(noteTimer); noteTimer = window.setTimeout(() => S.set({ desk: cfg() }), 400); };

// ── 방문한 날 ──
/** 오늘 들렀다고 적는다. 최근 400일만 남긴다 */
export function touchVisit() { const c = cfg(), k = dayKey(Date.now()); if (c.visits.includes(k)) return; c.visits = [...c.visits, k].sort().slice(-400); S.set({ desk: c }); }
/** 오늘(또는 어제)까지 이어진 날 수 */
export function streak(today = dayKey(Date.now())): number {
  const v = new Set(cfg().visits), d = new Date(); let n = 0;
  if (!v.has(today)) d.setDate(d.getDate() - 1);
  while (v.has(dayKey(d))) { n++; d.setDate(d.getDate() - 1); }
  return n;
}
