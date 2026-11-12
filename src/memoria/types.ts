// 장기기억 자료 꼴 (IndexedDB 의 mem 저장소 · 설정 · 메시지). 옛 memory.js 가 쓰는 그대로다 — 꼴을 바꾸지 않는다
import type { Chat } from '../types';

/** 메시지에 붙는 연속성 검사 결과 */
export interface CheckIssue { quote?: string; problem?: string; evidence?: string; source?: string; why?: string }
export interface MemCheck { issues?: CheckIssue[]; filtered?: CheckIssue[]; hash?: string; /** 점검한 글의 해시 */ h?: string; at?: number; [k: string]: unknown }
export interface Swipe { text: string; ts?: number; reasoning?: string; [k: string]: unknown }
export interface Msg {
  id: string; role: string; charId?: string; name?: string; hidden?: boolean; greeting?: boolean; viaCommand?: boolean;
  swipes?: Swipe[]; sw?: number; ts?: number;
  /** 장기기억이 숨긴 메시지 · 막간 표시 · 연속성 검사 */
  memHidden?: boolean; memSide?: boolean; memCheck?: MemCheck;
  [k: string]: unknown;
}
export interface ChatM extends Chat { count?: number; parent?: string; personaId?: string; mode?: string; memBundle?: string }

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
  chunkTurns: number; arcMergeAt: number; consolidateEvery: number; arcConsolidateEvery: number; maxMemories: number; responseTokens: number; summaryContextCount: number;
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
