// 일기장 묶음이 쓰는 자료 꼴. 대화방에 실려 다니는 일기 · 꿈 · 기념품 · 편지 · 약속은 공용(src/lib/types.ts)
import type { Char, Chat, Settings, DiaryEntry, Dream, Keepsake, Letter, Photo } from '../lib/types';
export type { DiaryEntry, Dream, Keepsake, Letter, PromiseRec, FontPref, FontPick, AlmSettings } from '../lib/types';

export interface Later { id: string; at: number; about?: string; made?: number }
export type DChat = Chat;
export type DChar = Char;
export type { Swipe, Msg, Curtain, IllustItem as IllustRef } from '../lib/types';

/** 책에 꽂히는 쪽 */
export type Page =
  | { type: 'diary'; id: string; ts: number; ref: DiaryEntry }
  | { type: 'dream'; id: string; ts: number; ref: Dream }
  | { type: 'keepsake'; id: string; ts: number; ref: Keepsake }
  | { type: 'letter'; id: string; ts: number; ref: Letter };
export type PageType = Page['type'];

export type { Photo, DayRec } from '../lib/types';
import type { DayRec } from '../lib/types';
export type Days = Map<string, DayRec>;
export interface MonthStats {
  mk: string; total: number; target: number; active: number; msgs: number; diary: number; dreams: number; photos: number; keepsakes: number;
  streak: number; fill: number; full: boolean; left: number; when: 'past' | 'future' | 'now'; reachable: boolean;
}
export type PromiseState = 'kept' | 'missed' | 'today' | 'upcoming';
export interface GridCell { key: string; d: number; dow: number; inMonth: boolean }
export interface Scene { id: string; photos: Photo[] }
export interface Chapter { title: string; sub: string; from: number; to: number }
export interface FoundPromise { date: string; time: string; what: string }

export type DSettings = Settings;

// 장기기억 · 프롬프트 조각 (일기장이 읽는 만큼)
export interface MemRec { id: string; summary: string; ts?: number; msgId?: string; importance?: number }
export interface MemDoc { id: string; memories: MemRec[]; status?: { entity: string; slot: string; value?: string }[] }
export interface PromptInfo { chat?: DChat | null; ctx?: { char?: string; user?: string }; type?: string }
export type { PromptPiece } from '../lib/hooks';
