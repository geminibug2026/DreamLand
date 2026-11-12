// 일기장 묶음이 아직 옮기지 않은 옛 모듈을 불러 쓰는 다리 (쓰는 만큼만 적는다)
import { mod } from '../legacy';
import type { Chapter, DChar, DChat, DSettings, Days, FoundPromise, GridCell, Keepsake, MonthStats, Msg, Photo, PromiseRec, PromiseState, Scene, Swipe } from './types';

/** 화면 · 기능 파일의 needs 에 그대로 넣는다 */
export const NEEDS = ['core', 'ui', 'engine', 'memory', 'illust', 'chat', 'hooks', 'f-keepsake', 'f-bind'];

export interface DStore {
  chars: DChar[]; chats: DChat[]; settings: DSettings;
  get(coll: 'chars', id?: string): DChar | undefined;
  get(coll: 'chats', id?: string): DChat | undefined;
  save(coll: 'chars', o: DChar, silent?: boolean): Promise<DChar>;
  save(coll: 'chats', o: DChat, silent?: boolean): Promise<DChat>;
  persona(chat?: DChat | null): { name: string } | undefined;
  helperConn(task: string, chat?: DChat | null): unknown;
  msgs(chatId: string): Promise<Msg[]>;
  saveMsgs(chat: DChat, list: Msg[]): Promise<void> | void;
  set(patch: Partial<DSettings>): void;
  saveSettings(): void;
}
interface CoreX {
  S: DStore;
  on<T = unknown>(ev: string, fn: (data: T) => void): () => void;
  emit(ev: string, data?: unknown): void;
  uid(): string; now(): number;
  msgText(m: Msg): string;
  download(name: string, data: string | Blob, type?: string): void;
  sleep(ms: number): Promise<void>;
}
interface UiX {
  route: { page: string; arg: unknown };
  go(page: string, arg?: unknown): void;
  moonPhase(date?: Date): { p: number; name: string };
}
interface EngineX { quickCall(system: string, user: string, o?: { maxTokens?: number; signal?: AbortSignal; conn?: unknown }): Promise<string> }
export interface MemRec { id: string; summary: string; ts?: number; msgId?: string; importance?: number }
export interface MemDoc { id: string; memories: MemRec[]; status?: { entity: string; slot: string; value?: string }[] }
interface MemoryX {
  parseLoose(text: string): Record<string, unknown> | null;
  Memory: {
    get(chatId: string): MemDoc | null; load(chatId: string): Promise<MemDoc>; save(mem: MemDoc): Promise<void>;
    add(chatId: string, rec: { kind: string; summary: string; tags: string[]; importance: number; entities: string[] }): Promise<MemRec>;
  };
}
interface IllustX { Illust: { load(chatId: string): Promise<void>; data(id?: string): string; strip(text: string): string } }
export interface ChatApi { current(): { chat?: DChat | null; msgs: Msg[] }; roomName(c: DChat): string }
interface ChatX { chatApi: ChatApi }

export interface PromptInfo { chat?: DChat | null; ctx?: { char?: string; user?: string }; type?: string }
export interface PromptPiece { where: 'before' | 'depth' | 'end'; src: string; content: string; depth?: number; order?: number }
interface Hooks {
  filters: { owner: string; fn(text: string): string }[];
  prompt: { owner: string; fn(info: PromptInfo): PromptPiece[] }[];
  panels: { owner: string; id: string; title: string; icon: string; render(chat: DChat, msgs?: Msg[]): Node }[];
  actions: { owner: string; id: string; label: string; icon: string; run(m: Msg, chat: DChat): unknown }[];
  composer: { owner: string; id: string; label: string; icon: string; run(): unknown }[];
  commands: Map<string, { owner: string; help: string; run(arg: string, api: ChatApi): unknown }>;
}
interface HooksX { X: Hooks; dropOwner(owner: string): void }

/** f-keepsake.js: 날짜 · 달 · 집계 · 약속 태그 · 기념품 · 장 나누기 (계산만) */
export interface KeepsakeX {
  pad(n: number): string;
  dayKey(t: number | Date): string; monthKey(t: number | Date): string; keyDate(k: string): Date; validKey(k: unknown): boolean;
  addDays(k: string, n: number): string; diffDays(a: string, b: string): number; shiftMonth(mk: string, n: number): string;
  WEEK: string[]; MONTHS_EN: string[]; PHASES: string[];
  koDate(k: string, o?: { year?: boolean; week?: boolean }): string;
  normTime(s: unknown): string;
  monthGrid(mk: string, weekStart?: number): GridCell[][];
  phaseAt(date?: Date): number; phaseIndex(p: number): number; phaseName(p: number): string; fillToPhase(f: number): number;
  moonPath(p: number, r?: number, cx?: number, cy?: number): string;
  msgTs(m?: Msg | null): number; swipeOf(m: Msg): Swipe; photosOf(m: Msg): Photo[];
  collectDays(chat: DChat, msgs: Msg[]): Days;
  monthStats(days: Days, mk: string, goal?: number, today?: string): MonthStats;
  promiseState(p: PromiseRec, today?: string): PromiseState;
  resolveDate(s: unknown, base?: number): string;
  stripPromiseTags(text: string): string;
  extractPromises(text: string, base?: number): { text: string; found: FoundPromise[] };
  mergePromises(list: PromiseRec[], found: FoundPromise[], make: (f: FoundPromise) => PromiseRec): PromiseRec[];
  promiseDigest(list: PromiseRec[], today?: string): { today: PromiseRec[]; missed: PromiseRec[]; soon: PromiseRec[] };
  scenesOf(msgs: Msg[]): Scene[];
  syncKeepsakes(list: Keepsake[], msgs: Msg[]): { list: Keepsake[]; added: Keepsake[]; changed: boolean };
  seatOf(id: string): string;
  chaptersOf(msgs: Msg[], o: { mode: string; size: number; diary: unknown[] }): Chapter[];
}
interface BindX { buildBook(data: object): string }

export const core = () => mod<CoreX>('core');
export const S = () => core().S;
export const ui = () => mod<UiX>('ui');
export const quickCall: EngineX['quickCall'] = (s, u, o) => mod<EngineX>('engine').quickCall(s, u, o);
export const parseLoose = (t: string) => mod<MemoryX>('memory').parseLoose(t);
export const Memory = () => mod<MemoryX>('memory').Memory;
export const Illust = () => mod<IllustX>('illust').Illust;
export const chatApi = () => mod<ChatX>('chat').chatApi;
export const hooks = () => mod<HooksX>('hooks');
export const K = () => mod<KeepsakeX>('f-keepsake');
export const buildBook = (data: object) => mod<BindX>('f-bind').buildBook(data);
