// 일기장 묶음이 쓰는 자료 꼴 (대화방에 실려 다니는 일기 · 꿈 · 기념품 · 편지 · 약속)

export interface DiaryEntry {
  id: string; ts: number; title: string; storyDate: string; mood: string; weather: string; text: string; by: string; illust: string; from: number; to: number;
  note?: string; noteTs?: number; answer?: string; answerTs?: number; memIds?: string[]; memId?: string;
}
export interface Dream { id: string; ts: number; day: string; phase: number; phaseName: string; title: string; text: string; by: string; memIds?: string[]; memId?: string }
export interface Keepsake {
  id: string; openId: string; no: number; title: string; place: string; time: string; summary: string; openTs: number; ts: number; lines: number;
  photo: string; photoCount: number; memo: string; picked?: boolean; gone?: boolean;
}
export interface Letter { id: string; month: string; ts: number; title: string; text: string; ps: string; by: string; days: number; memIds?: string[]; memId?: string }
export interface PromiseRec {
  id: string; date: string; time: string; what: string; by: string; made: number; done?: boolean; doneAt?: number;
  msgId?: string; raised?: string; aired?: string; excused?: boolean; later?: boolean;
}
export interface Later { id: string; at: number; about?: string; made?: number }
export interface FontPref { font?: string; ink?: string; size?: number; lh?: number; reason?: string; by?: string; ai?: FontPick | null }
export interface FontPick { font: string; reason: string; ink: string; size: number }

export interface DChat {
  id: string; name?: string; preview?: string; charIds: string[]; createdAt: number; updatedAt: number; count?: number;
  mode?: string; scene?: { on?: boolean }; personaId?: string;
  diary?: DiaryEntry[]; diaryAt?: number; dreams?: Dream[]; keepsakes?: Keepsake[]; letters?: Letter[]; promises?: PromiseRec[]; later?: Later[];
}
export interface DChar {
  id: string; name: string; avatar?: string; tags?: string[];
  description?: string; personality?: string; mesExample?: string; firstMes?: string; diaryFont?: FontPref;
}
export interface IllustRef { id: string; hidden?: boolean; title?: string }
export interface Swipe { text?: string; tr?: string; showTr?: boolean; ts?: number; illust?: (IllustRef | null)[] }
export interface Curtain { kind: string; title?: string; place?: string; time?: string; summary?: string }
export interface Msg {
  id: string; role: 'user' | 'assistant' | 'system'; name?: string; charId?: string; hidden?: boolean; ts?: number;
  sw: number; swipes: Swipe[]; images?: string[]; curtain?: Curtain; dice?: unknown; scene?: unknown;
}

/** 책에 꽂히는 쪽 */
export type Page =
  | { type: 'diary'; id: string; ts: number; ref: DiaryEntry }
  | { type: 'dream'; id: string; ts: number; ref: Dream }
  | { type: 'keepsake'; id: string; ts: number; ref: Keepsake }
  | { type: 'letter'; id: string; ts: number; ref: Letter };
export type PageType = Page['type'];

export interface Photo { id?: string; src?: string; title: string; msgId: string }
export interface DayRec {
  key: string; n: number; user: number; ai: number; firstId: string; lastId: string;
  photos: Photo[]; diary: DiaryEntry[]; dreams: Dream[]; keepsakes: Keepsake[]; promises: PromiseRec[];
}
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

export interface AlmSettings {
  tab?: string; goal?: number; weekStart?: number | string; keepsakeToast?: boolean; promiseInject?: boolean; promiseSulk?: boolean;
  promiseTag?: string; exchangeInject?: boolean; prompts?: Record<string, string>; dreamMoods?: string;
}
export interface DSettings {
  almanac?: AlmSettings; diary?: { prompt?: string; memoPrompt?: string }; memory?: { enabled?: boolean };
  motion?: boolean; lastChat?: string; userNameFallback?: string;
}
