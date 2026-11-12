// 장기기억 화면이 쓰는 옛 모듈 다리 (core · ui · hooks · engine · chat · memory). 엔진은 아직 옛 memory.js 하나만 살아 있다 —
// 대화 화면(chat.js) · 일기장 · 달력이 같은 서고 캐시를 쓰므로 화면도 그 인스턴스를 부른다
import { L, mod } from '../legacy';
import type { Char, ModalAction } from '../types';
import type { Bond, CastCard, Cfg, ChatM, Mem, MemCheck, MemItem, Msg, Plan } from './types';

/** 화면 · 기능 파일의 needs 에 그대로 적는다 */
export const NEEDS = ['core', 'ui', 'hooks', 'engine', 'chat', 'memory', 'embed'];

export type Obj = Record<string, unknown>;
type Opt = readonly [string | number, string];
/** 옛 form() 의 항목 정의 */
export interface FormDef {
  k?: string; label?: string; type?: string; section?: string; el?: Node; hint?: string; ph?: string; rows?: number;
  half?: boolean; third?: boolean; live?: boolean; min?: number; max?: number; step?: number; opts?: readonly (string | Opt)[]; nullable?: boolean;
}
export type FormDefs = (FormDef | false | null | undefined | '')[];
export interface ModalX { close(): void; el?: HTMLElement }
export interface ModalActionX extends ModalAction { ic?: string }
export interface ModalOpts { title?: string; body?: Node; actions?: ModalActionX[]; wide?: boolean; onClose?: () => void }

interface Db { get<T = Obj>(store: string, id: string): Promise<T | undefined>; put(store: string, rec: object): Promise<unknown>; del(store: string, id: string): Promise<unknown>; all<T = Obj>(store: string): Promise<T[]> }
export interface SettingsM { memory?: Cfg; lastChat?: string; [k: string]: unknown }
export interface StoreM {
  chars: Char[]; chats: ChatM[]; settings: SettingsM;
  get(coll: 'chats', id?: string | null): ChatM | undefined;
  get(coll: 'chars', id?: string | null): Char | undefined;
  set(patch: Partial<SettingsM>): void;
  msgs(chatId: string): Promise<Msg[]>;
  saveMsgs(chat: ChatM, msgs: Msg[]): Promise<void>;
}
interface CoreM {
  S: StoreM; DB: Db;
  on(ev: string, fn: (data?: never) => void): () => void;
  emit(ev: string, data?: unknown): void;
  uid(): string; now(): number;
  debounce<A extends unknown[]>(fn: (...a: A) => void, ms?: number): (...a: A) => void;
  download(name: string, data: string | Blob, type?: string): void;
  pickFiles(o?: { accept?: string; multiple?: boolean }): Promise<File[]>;
  msgText(m: Msg): string;
  fmtTime(ts: number): string;
}
interface UiM {
  form(obj: object, defs: FormDefs, onChange?: (o: object) => void): HTMLElement;
  modal(o: ModalOpts): ModalX;
  route: { page: string; arg: unknown };
}
export interface ChatApi {
  current(): { chat: ChatM | null; msgs: Msg[]; busy?: boolean };
  redraw(): void; save(): Promise<void>; scrollTo(id: string): void; setStatus(text: string): void;
  groupTitle(chat: ChatM): string; roomName(chat: ChatM): string;
}
/** 명령어가 받는 대화 화면 API (chatApi 와 같다) */
export type CmdApi = ChatApi;

// ── hooks.js 의 등록부 ──
export interface PromptPiece { where: string; depth?: number; order?: number; role?: string; content: string; src?: string }
export interface PromptInfo { chat: ChatM; history: HistLine[]; msgs?: Msg[]; type?: string; commit?: boolean }
export interface Hooks {
  commands: Map<string, { owner: string; help: string; run(arg: string, api: CmdApi): unknown }>;
  macros: Map<string, { owner: string; fn(): string }>;
  panels: { owner: string; id?: string; title: string; icon?: string; render(chat: ChatM, msgs: Msg[]): Node }[];
  actions: { owner: string; id: string; label: string; icon?: string; run(msg: Msg, chat: ChatM): unknown }[];
  prompt: { owner: string; fn(info: PromptInfo): PromptPiece[] }[];
  before: { owner: string; fn(info: { chat: ChatM; msgs: Msg[]; type?: string; signal?: AbortSignal }): unknown }[];
  studio: { owner: string; title: string; render(): Node }[];
}

// ── memory.js 가 돌려주는 것들 ──
export interface HistLine { role: string; content: string }
export interface SceneNow { any: boolean; location?: string; date?: string; time?: string; present?: string; mood?: string }
export interface RecallParts { cos: number; lex: number; imp: number; rec: number; bonus: number }
export interface RecallRow { id: string; kind: string; summary: string; included: boolean; reason?: string; excluded?: string; via?: string; score?: number; parts?: RecallParts }
export interface PacketDiag {
  sections: { name: string; tokens: number }[]; rows?: RecallRow[]; fallback?: boolean; narrator?: boolean; hidden: number;
  split?: { stableTokens?: number; nowTokens?: number; refreshed?: boolean; frozenAtTurn?: number | null; delta?: number };
}
export interface Packet { text: string; fixed?: string | boolean; trim: number; diag?: PacketDiag; stable?: string; live?: string; tokens: number; picked: unknown[] }
export interface Change { type: 'added' | 'changed' | 'removed'; shelf: string; before?: string; after?: string; impBefore?: number; impAfter?: number }
export interface CheckpointInfo { id: string; label: string; at: number; turn: number; bytes: number }
/** 사서가 제안하는 정정 한 건 */
export interface EditorOp {
  op: string; id?: string; key?: string; value?: string; scopeName?: string; entity?: string; slot?: string; claim?: string; owner?: string;
  fromTurn?: number; toTurn?: number; totalDays?: number | string; kind?: string; summary?: string; status?: string; name?: string; patch?: Obj; from?: string; to?: string; stage?: string;
  [k: string]: unknown;
}
export interface ActivityRow { kind: string; text: string; count: number; at: number }
export interface RecallTrace { score?: number }
export interface RecallResult { pinned: MemItem[]; triggered: MemItem[]; selected: MemItem[]; trace: Map<string, RecallTrace> }
export interface CarryCount { summaries: number; memories: number; cast: number; canon: number; pledges: number; bonds?: number }
export interface ExportRead { store: Obj; label: string; foreign?: boolean }
export interface PendingOpt { includeHidden?: boolean; from?: number; to?: number }

/** 화면이 부르는 Memory 메서드. 쓰는 것만 적는다 — 더 필요하면 여기에 서명을 보탠다 */
export interface MemoryUi {
  load(chatId: string): Promise<Mem>;
  get(chatId?: string | null): Mem | null;
  save(mem: Mem): Promise<void>;
  reset(chatId: string): Promise<Mem>;
  replace(chatId: string, data: Mem): Promise<Mem>;
  cfg(): Cfg;
  busy(): number;
  // 기록 · 맞추기
  commit(chat: ChatM, msgs: Msg[], ai: Msg, opts?: { force?: boolean; signal?: AbortSignal }): Promise<Mem>;
  reconcile(mem: Mem, msgs: Msg[]): boolean;
  pending(mem: Mem, msgs: Msg[], o?: PendingOpt): Msg[];
  dropTurn(mem: Mem, msgId: string): void;
  recalClock(chat: ChatM, mem: Mem, o?: { signal?: AbortSignal; onProgress?: (done: number, total: number) => void }): Promise<{ before: number; after: number; failed?: number } | null>;
  add(chatId: string, rec: Partial<MemItem>): Promise<unknown>;
  autoHide(chat: ChatM, msgs: Msg[]): number;
  post(chat: ChatM, msgs: Msg[], signal?: AbortSignal): Promise<unknown>;
  received(chat: ChatM, msg: Msg): Promise<unknown>;
  prepare(chat: ChatM, msgs: Msg[], o?: { type?: string; background?: boolean }): unknown;
  // 막간 · 연속성 검사
  isSideMessage(msg: Msg): boolean;
  tagSideMessage?(chat: ChatM, msgs: Msg[], msg: Msg, type?: string): unknown;
  checkOf?(msg: Msg): MemCheck | null;
  checkReply?(chat: ChatM, msgs: Msg[], msg: Msg): unknown;
  // 장부
  packet(chat: ChatM, history: HistLine[], opts?: { preview?: boolean; fresh?: boolean; msgs?: Msg[]; force?: boolean; type?: string }): Packet | null;
  injection?(chat: ChatM, history: HistLine[], opts?: { msgs?: Msg[]; type?: string; preview?: boolean }): PromptPiece[];
  reinjectNow?(chat: ChatM): void;
  last(chatId: string): { tokens: number; fixed?: string | boolean; picked: unknown[] } | null | undefined;
  override(chatId: string, text: string | null): void;
  overridden(chatId: string): string;
  pin(chatId: string, text: string | null): Promise<void>;
  rewritePacket(chat: ChatM, history: HistLine[], signal?: AbortSignal): Promise<string>;
  scene(mem: Mem): SceneNow;
  direct(chat: ChatM, msgs: Msg[], signal?: AbortSignal): Promise<unknown>;
  // 질문 · 정정
  ask(chat: ChatM, question: string, signal?: AbortSignal): Promise<string>;
  propose(chat: ChatM, request: string, log?: LogLine[]): Promise<{ reply?: string; ops?: EditorOp[] }>;
  applyOps(mem: Mem, ops: EditorOp[], skipped?: string[]): number;
  recallEx(chat: ChatM, mem: Mem, history: HistLine[], opt?: { query?: string; topK?: number }): RecallResult;
  // 복구 지점 · 백업 · 인계
  snapshot(mem: Mem): Mem;
  diff(before: Mem, after: Mem): Change[];
  checkpoint(mem: Mem, label: string): Promise<CheckpointInfo | null | undefined>;
  checkpoints(chatId: string): Promise<CheckpointInfo[]>;
  checkpointData(chatId: string, id: string): Promise<Mem | null | undefined>;
  normalize(data: Obj, chatId: string): Mem;
  exportData(chat: ChatM, mem: Mem | Obj): Obj;
  readExport(payload: unknown): ExportRead;
  carry(mem: Mem, src: Obj, label: string): CarryCount;
  consolidate(chat: ChatM, mem: Mem, signal?: AbortSignal): Promise<unknown>;
  regroup(chat: ChatM, mem: Mem, signal?: AbortSignal): Promise<number | null | undefined>;
  // 인물
  foldAliases(mem: Mem): { states: number; memories: number };
  mergeCast(mem: Mem, keep: CastCard, src: CastCard): void;
  bondNow?(b: Bond): Bond['log'][number] | null;
  // 사서 일지
  activity?(): ActivityRow[];
  activityLog?: { list?(): ActivityRow[]; clear?(): void };
  clearActivity?(): void;
  logActivity?(kind: string, text: string, extra?: Obj): void;
}
/** 편집 대화(사서에게 정정 요청)의 한 줄 */
export interface LogLine { role: 'user' | 'ai'; text: string; ops?: EditorOp[]; applied?: boolean; cancelled?: boolean; done?: number; skipped?: string[] }
export type { Plan };

export interface MemoryMod {
  Memory: MemoryUi;
  KINDS: Record<string, string>; LOCKS: Record<string, string>; VIS: Record<string, string>; SCOPES: string[];
  SHELF_LABELS: Record<string, string>; PROMPTS: Record<string, string>; LANGS: Record<string, string>;
  NARRATOR: string; PUBLIC_ONLY: string; MEMORY_DEFAULTS: Cfg; DOSSIER_MAX: number;
  fmtDays(d: number): string;
  visibleProse(s: unknown): string;
  chunkDossier(text: string): string[];
}

export const core = () => mod<CoreM>('core');
export const S = () => core().S;
export const DB = () => core().DB;
export const ui = () => mod<UiM>('ui');
export const X = () => mod<{ X: Hooks }>('hooks').X;
export const tokens = (text: string) => mod<{ tokens(t: string): number }>('engine').tokens(text);
export const chatApi = () => mod<{ chatApi: ChatApi }>('chat').chatApi;
/** 옛 memory.js 모듈 (Memory 와 상수들). 화면마다 필요한 메서드가 더 있으면 M 에 넓힌 꼴을 준다 */
export const memMod = () => mod<MemoryMod>('memory');
export function Memory<M extends MemoryUi = MemoryUi>(): M { return memMod().Memory as M; }
export const toast = (msg: string, kind?: string) => L.ui.toast(msg, kind);
