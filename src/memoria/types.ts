// 장기기억 자료 꼴 (IndexedDB 의 mem 저장소 · 설정 · 메시지). 옛 memory.js 가 쓰는 그대로다 — 꼴을 바꾸지 않는다
import type { Char, Chat, ModalAction, Msg as LibMsg } from '../lib/types';
import type { CmdApi, PromptPiece } from '../lib/hooks';

/** 메시지에 붙는 연속성 검사 결과 */
export interface CheckIssue { quote?: string; problem?: string; evidence?: string; source?: string; why?: string }
export interface MemCheck { issues?: CheckIssue[]; filtered?: CheckIssue[]; hash?: string; /** 점검한 글의 해시 */ h?: string; at?: number; [k: string]: unknown }
export type { Swipe } from '../lib/types';
/** 메시지 (공용 꼴) — 연속성 검사 결과가 붙는다 */
export type Msg = LibMsg & { memCheck?: MemCheck };
/** 대화방 (공용 꼴) */
export type ChatM = Chat;

export interface Turn { msgId: string; weight?: number; when?: string; where?: string; hash?: string; digest?: string; days?: number; failed?: boolean; error?: string; at?: number; [k: string]: unknown }
export interface MemItem {
  id: string; kind: string; summary: string; quote?: string; importance: number; entities?: string[]; tags?: string[]; hints?: string[];
  visibility?: string; owner?: string; trigger?: string; pinned?: boolean; disabled?: boolean; manual?: boolean;
  turn?: number | null; msgId?: string; av?: unknown; acv?: unknown; avm?: string; knowers?: string[];
  /** 회상 반영 채점 (received) */
  shown?: number; echoes?: number; coldRun?: number; ts?: number;
  [k: string]: unknown;
}
export interface Relation { target: string; relation: string }
export interface CastNote { text: string; turn?: number; msgId?: string; pinned?: boolean }
export interface CastCard {
  id: string; name: string; aka?: string[]; role?: string; age?: string; occupation?: string; appearance?: string; voice?: string; core?: string;
  traits?: string[]; relationships?: Relation[]; growth?: CastNote[]; lines?: CastNote[];
  provisional?: boolean; locked?: boolean; manual?: boolean; disabled?: boolean; first?: number; updated?: number; aliases?: string[];
  /** 이 카드를 낳은 · 마지막으로 고친 답변, 고치기 직전 값 한 단계, 바탕(core)을 적은 턴 */
  firstMsgId?: string; msgId?: string; prev?: { role?: string; age?: string; occupation?: string; appearance?: string; voice?: string; traits?: string[]; [k: string]: unknown } | null; prevTurn?: number | null; prevBy?: string; coreTurn?: number | null; coreMsgId?: string;
  [k: string]: unknown;
}
export interface BondStep { stage: string; basis?: string; calls?: string; unsaid?: string; turn?: number; msgId?: string; manual?: boolean; /** 같은 계단을 고쳐 쓰기 전의 글 */ was?: BondStep; [k: string]: unknown }
export interface Bond{ id: string; from: string; to: string; log: BondStep[]; disabled?: boolean; manual?: boolean; [k: string]: unknown }
/** 캐논 · 상태 줄이 함께 갖는 이력 칸 (upsertRow) */
export interface RowHistory { id: string; turn: number; createdTurn?: number; prev?: string | null; prevTurn?: number | null; prevMsgId?: string; msgId?: string; reMsgId?: string; manual?: boolean }
export interface CanonRow extends RowHistory { key: string; value: string; scope: string; scopeName?: string; [k: string]: unknown }
export interface StatusRow extends RowHistory { entity: string; slot: string; value: string; claim?: string; owner?: string; [k: string]: unknown }
export interface Pledge { id: string; kind: string; summary: string; status: string; turn?: number; msgId?: string; manual?: boolean; resolvedTurn?: number | null; resolution?: string | null; priority?: number; owner?: string; createdTurn?: number; created?: number; suggestResolved?: boolean; suggestTurn?: number | null; suggestBy?: string; resolvedBy?: string; updMsgId?: string; reMsgId?: string; prev?: { summary: string; status: string; priority?: number; owner?: string } | null; prevTurn?: number | null; sleptTurn?: number | null; [k: string]: unknown }
/** 연대기로 합치기 전 묶음의 경계 (되살릴 때 쓴다) */
export interface SummarySrc { from: number; to: number; text: string }
export interface Summary { id: string; from: number; to: number; text: string; carried?: boolean; carriedFrom?: string; saga?: boolean; src?: SummarySrc[]; av?: unknown; avm?: string; [k: string]: unknown }
export interface Item { id: string; name: string; holder?: string; meaning?: string; status?: string; disabled?: boolean; turn?: number; first?: number; updated?: number; msgId?: string; [k: string]: unknown }
export interface Milestone { id: string; title: string; summary?: string; participants?: string[]; turn?: number | null; msgId?: string; grade?: string; [k: string]: unknown }
export interface DossierDoc { id: string; name?: string; title?: string; chunks: string[]; disabled?: boolean; [k: string]: unknown }
export interface Plan { remember?: unknown[]; scene_goal?: unknown; ideas?: unknown[]; avoid?: unknown[]; tension?: unknown; /** 옛 이름 */ scene_mandate?: unknown; forbidden_moves?: unknown; next_beats?: unknown; pressure?: unknown }

/** 한 대화의 서고 (mem 저장소의 한 줄, id = 대화 id) */
export interface Mem {
  id: string; turns: Turn[]; memories: MemItem[]; canon: CanonRow[]; status: StatusRow[]; pledges: Pledge[]; cast: CastCard[];
  chunks: Summary[]; arcs: Summary[]; items: Item[]; milestones: Milestone[]; dossier: DossierDoc[]; bonds: Bond[];
  chunked: number; consolidatedAt: number; arcAt: number; clockDays: number; bondRev: number; arcCursor?: number;
  packetPin?: { text: string; turn?: number; at?: number } | null;
  direction?: { plan?: Plan | null; afterId?: string; [k: string]: unknown } | null;
  perspective?: string; perspectiveScope?: string;
  /** 옛 서고의 이름 (chunks · chunked 로 옮긴다) */
  chapters?: Summary[]; chaptered?: number;
  [k: string]: unknown;
}

/** 설정 (S.settings.memory). 기본값은 memory.js 의 MEMORY_DEFAULTS */
export interface Cfg {
  enabled: boolean; auto: boolean; recordDelay: number; tokenBudget: number; topK: number; minScore: number; minCosine: number; mmrLambda: number; maxPerKind: number; maxPerTurn: number; multiQueryRecent: number;
  chunkTurns: number; /** 대화 모드 방의 요약 주기 (0 = chunkTurns 그대로) */ chunkTurnsTalk: number; /** 대화 모드: 답장 몇 개를 모아 한 번에 기록하나 (1 = 답장마다) */ talkBatch: number; arcMergeAt: number; consolidateEvery: number; arcConsolidateEvery: number; maxMemories: number; responseTokens: number; summaryContextCount: number;
  fossil: { settling: number; fossilized: number; deep: number }; language: string;
  cast: boolean; lockEdited: boolean; items: boolean; milestones: boolean; storyClock: boolean; refProfile: boolean; refLore: boolean;
  trim: boolean; keepRecent: number; autoHide: boolean; preserveRecent: number;
  supervisor: boolean; associative: boolean; authorizePrivate: boolean; perspective: string; audit: boolean; reasoningHeadroom: number;
  position: string; depth: number; prompt: string;
  embed: { mode: string; connId: string; model: string; floor: number; kind?: string; [k: string]: unknown };
  prompts: { supervisor: string; chunk: string; arc: string; [k: string]: string };
  recallWaitSec: number; yieldToChat: boolean; watchUpdates: boolean; splitInjection: boolean; stableRefreshTurns: number; styleGuard: boolean; recallQuotes: boolean; voiceSamples: number;
  bannedPhrases: string; banInChat: boolean; banTell: boolean; threadSleepTurns: number; eraKeep: number;
  statusMode: string; statusPattern: string; statusInject: boolean; qrMode: string; replyCheck: boolean;
  bundles: Record<string, Record<string, unknown>>; bundleByOwner: Record<string, string>; activeBundle: string; bundleBase: Record<string, unknown> | null;
  noticed: Record<string, unknown>; promptRev: number; settingsRev: number; promptOutdated: Record<string, number>;
  [k: string]: unknown;
}

// ── 화면이 쓰는 꼴 (장기기억 엔진이 돌려주는 것 · 등록부 · 폼) ──
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

export interface SettingsM { memory?: Cfg; lastChat?: string; [k: string]: unknown }
export interface StoreM {
  chars: Char[]; chats: ChatM[]; settings: SettingsM;
  get(coll: 'chats', id?: string | null): ChatM | undefined;
  get(coll: 'chars', id?: string | null): Char | undefined;
  set(patch: Partial<SettingsM>): void;
  msgs(chatId: string): Promise<Msg[]>;
  saveMsgs(chat: ChatM, msgs: Msg[]): Promise<void>;
}
export interface ChatApi {
  current(): { chat: ChatM | null; msgs: Msg[]; busy?: boolean };
  redraw(): void; save(): Promise<void>; scrollTo(id: string): void; setStatus(text: string): void;
  groupTitle(chat: ChatM): string; roomName(chat: ChatM): string;
}
/** 명령어가 받는 대화 화면 API (chatApi 와 같다) */
export type { CmdApi } from '../lib/hooks';

// ── hooks.js 의 등록부 ──
export type { PromptPiece } from '../lib/hooks';
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

export interface MemoryMod {
  Memory: MemoryUi;
  KINDS: Record<string, string>; LOCKS: Record<string, string>; VIS: Record<string, string>; SCOPES: string[];
  SHELF_LABELS: Record<string, string>; PROMPTS: Record<string, string>; LANGS: Record<string, string>;
  NARRATOR: string; PUBLIC_ONLY: string; MEMORY_DEFAULTS: Cfg; DOSSIER_MAX: number;
  fmtDays(d: number): string;
  visibleProse(s: unknown): string;
  chunkDossier(text: string): string[];
}

