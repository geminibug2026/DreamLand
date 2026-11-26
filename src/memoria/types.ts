// 장기기억 자료 꼴 (IndexedDB 의 mem 저장소 · 설정 · 메시지). 옛 memory.js 가 쓰는 그대로다 — 꼴을 바꾸지 않는다
import type { Char, Chat, ModalAction, Msg as LibMsg } from '../lib/types';
import type { CmdApi, PromptPiece } from '../lib/hooks';

/** 메시지에 붙는 연속성 검사 결과 */
export interface CheckIssue { quote?: string; problem?: string; evidence?: string; source?: string; why?: string }
export interface MemCheck { issues?: CheckIssue[]; filtered?: CheckIssue[]; hash?: string; /** 점검한 글의 해시 */ h?: string; at?: number; /** 재확인을 거쳤다 */ confirmed?: boolean; [k: string]: unknown }
export type { Swipe } from '../lib/types';
/** 메시지 (공용 꼴) — 연속성 검사 결과가 붙는다 */
export type Msg = LibMsg & { memCheck?: MemCheck; /** 글(해시)마다 맡아 둔 점검 결과 — 다른 답변으로 넘겼다 돌아와도 그 글의 경고가 남는다 */ memChecks?: Record<string, MemCheck>; /** 중요 장면 표시 — 기록할 때 무게를 올리고 정리에서 지킨다 */ memStar?: boolean };
/** 대화방 (공용 꼴) */
export type ChatM = Chat;

export interface Turn { msgId: string; /** 끊긴 답변을 담은 기록 (연결이 끊기거나 멈춘 답변 — 끝 문장은 사실로 적지 않았다) */ cut?: boolean; /** 사서가 적은 이야기의 며칠째 (첫날 = 1) */ day?: number; /** 사서가 적은 "지금이 언제인지" 한 줄 */ now?: string; /** 이 기록에 든 다른 메시지(내 말 · 묶음의 앞 답장)의 [id, 해시] — 그 가운데 하나라도 고쳐지거나 지워지면 다시 기록한다 (없으면 옛 기록: 마지막 답장만 본다) */ parts?: [string, string][]; /** 이 턴이 끝난 날의 작중 날짜 (YYYY-MM-DD — 상태창에서 읽었거나 직접 고친 것) */ date?: string; /** 기록할 때 장면에 있던 사람들 (정식 이름) */ present?: string[]; /** 장면 카드 — 이 턴에서 있었던 일을 순서대로, 원문 대사와 함께 (옛 묶음을 떠올릴 때 펼친다) */ beats?: Beat[]; /** 이 기록이 덮는 답변 수 (묶음 기록 · 없으면 1) */ span?: number; weight?: number; when?: string; where?: string; hash?: string; digest?: string; days?: number; failed?: boolean; error?: string; at?: number; /** 숨긴 메시지를 일부러 기록했다 (색인의 「숨겨진 메시지도 포함」) — 숨김을 이유로 걷어 내지 않는다 */ hid?: boolean; /** 중요 장면으로 표시한 답변의 기록 */ star?: boolean; [k: string]: unknown }
export interface MemItem {
  id: string; kind: string; summary: string; quote?: string; importance: number; entities?: string[]; tags?: string[]; hints?: string[];
  visibility?: string; owner?: string; trigger?: string; pinned?: boolean; disabled?: boolean; manual?: boolean;
  turn?: number | null; msgId?: string; av?: unknown; acv?: unknown; avm?: string; knowers?: string[];
  /** 회상 반영 채점 (received) */
  shown?: number; echoes?: number; coldRun?: number; ts?: number;
  /** 지나간 기억 — 이야기가 흘러 더는 맞지 않게 됐다 (지우지 않는다: 평소 회상에서만 빠진다). turn = 물린 턴(0부터, 직접 물렸으면 -1), now = 지금은 어떤지, msgId = 물린 답변(사서가 기록하며 물렸을 때), manual = 직접 물림 */
  retired?: { turn: number; now: string; msgId?: string; manual?: boolean } | null;
  /** 공개된 사건을 그 자리에서 본 사람들 (정식 이름). 없으면 따지지 않는다 */
  witnesses?: string[];
  /** 자세히는 모르고 짐작만 하는 사람들 */
  guessers?: string[];
  /** 아는 사람을 손으로 고쳤다 — 사서가 덮어쓰지 않는다 */
  knowLock?: boolean;
  /** 나중에 알게 된 사람 (그 답변이 지워지면 되돌린다) */
  learned?: { who: string; msgId: string; guess?: boolean; /** 그 전에는 짐작만 하던 사람이었다 */ wasGuess?: boolean }[];
  /** 그 일을 온전히 기억하지 못하는 사람 (잠 · 술 · 기절 등). kept = 그 사람에게 남은 것 */
  dim?: MemDim[];
  /** 인용한 말을 한 사람 · 들은 사람 */
  by?: string; to?: string;
  /** 그때의 일 — past(회상) · dream(꿈 · 환상) · told(전해 들은 이야기). 없으면 지금 일 (지금 상태를 바꾸지 않았다) */
  when?: 'past' | 'dream' | 'told';
  /** 본문에 모른다고 나온 사람 (기록할 때의 근거) · 가진 사람이 일부러 숨기는 상대 */
  unaware?: string[]; keepFrom?: string[];
  [k: string]: unknown;
}
export interface MemDim { who: string; level: 'partial' | 'none'; kept?: string }
/** 장면 카드의 한 대목 — 턴을 기록할 때 함께 받아 둔다. q = 원문 그대로의 말 한 줄, by · to = 말한 사람 · 들은 사람 */
export interface Beat { text: string; major?: boolean; with?: string[]; q?: string; by?: string; to?: string }
/** 날 세기 · D-day · 주기 */
export interface Tracker {
  id: string; label: string; type: 'count' | 'until' | 'cycle'; people?: string[]; inject?: 'always' | 'present' | 'never'; disabled?: boolean;
  /** count: 시작한 날 (YYYY-MM-DD), firstDay: 시작한 날을 1일째로 셀지(1) 0일째로 셀지(0) */
  start?: string; firstDay?: 0 | 1;
  /** until: 그날 */
  target?: string;
  /** cycle: every 일마다 length 일 동안, starts = 시작한 날들(최근 12개) */
  every?: number; length?: number; starts?: string[];
  created?: number; updated?: number;
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
export interface Bond{ id: string; from: string; to: string; log: BondStep[]; disabled?: boolean; manual?: boolean;
  /**
   * 인연 — 관계선 위에 얹는 지금의 읽기 ("from" 쪽에서 본 것 — 방향마다 따로). types = 갈래 세 개까지(첫 번째가 대표 · 무리와 정해 둔 갈래, 또는 직접 쓴 말), word = 인연 한마디.
   * tieTurn · tieMsgId = 그 읽기를 적은 턴과 답변, tieWas = 그 전 읽기 (답변이 지워지면 되돌린다), tieHand = 직접 고친 읽기 (사서가 덮어쓰지 않는다)
   */
  types?: TieTypeRow[]; word?: string; tieTurn?: number; tieMsgId?: string; tieHand?: boolean; tieWas?: TieWas | null;
  /** 옛 꼴 (읽을 때 위의 칸으로 옮긴다): name · kind · nameTurn · nameMsgId · nameManual · nameWas */
  name?: string; kind?: string; nameTurn?: number; nameMsgId?: string; nameManual?: boolean; nameWas?: { name?: string; kind?: string; turn?: number; msgId?: string } | null;
  [k: string]: unknown }
/** 인연 읽기의 한 단계 전 */
/** 인연의 갈래 하나: group = 무리 (affection · family · friendship · work · conflict · fealty · debt · secret · other), type = 정해 둔 갈래(없으면 무리만), custom = type 이 직접 쓴 말이다 */
export interface TieTypeRow { group: string; type?: string; custom?: boolean }
export interface TieWas { types?: TieTypeRow[]; word?: string; turn?: number; msgId?: string }
/**
 * 전환점 한 줄 — 누가(누구와) 무엇에서 무엇으로, 왜. way: closer 가까워짐 · apart 멀어짐 · flip 뒤집힘 · heart 마음 · lot 처지 · grow 자람.
 * span = 요약에서 되짚은 것이면 그 요약이 덮는 턴 범위(0부터), scan = 요약에서 되짚었다
 */
export interface Pivot { id: string; way: string; who: string; with?: string; was?: string; now: string; why?: string; turn: number; msgId?: string; span?: [number, number]; scan?: boolean; manual?: boolean; [k: string]: unknown }
/** 캐논 · 상태 줄이 함께 갖는 이력 칸 (upsertRow) */
export interface RowHistory { id: string; turn: number; createdTurn?: number; prev?: string | null; prevTurn?: number | null; prevMsgId?: string; msgId?: string; reMsgId?: string; manual?: boolean }
export interface CanonRow extends RowHistory { key: string; value: string; scope: string; scopeName?: string; [k: string]: unknown }
export interface StatusRow extends RowHistory { entity: string; slot: string; value: string; claim?: string; owner?: string; /** 요약 때 "더는 맞지 않는다"고 본 턴 (다시 적히면 지워진다) */ expired?: number | null; [k: string]: unknown }
export interface Pledge { id: string; kind: string; summary: string; status: string; turn?: number; msgId?: string; manual?: boolean; resolvedTurn?: number | null; resolution?: string | null; priority?: number; owner?: string; createdTurn?: number; created?: number; suggestResolved?: boolean; suggestTurn?: number | null; suggestBy?: string; resolvedBy?: string; updMsgId?: string; reMsgId?: string; prev?: { summary: string; status: string; priority?: number; owner?: string } | null; prevTurn?: number | null; sleptTurn?: number | null;
  /** 사서가 "풀린 듯"이라며 적은 경위 (근거가 모자라 닫지 않았을 때 — ✔로 확정하면 해소 경위가 된다) */
  suggestHow?: string | null;
  /** 어떻게 끝났는가 — kept(지킴) · broken(어김) · dropped(없던 일) · replaced(다른 약속으로 바뀜). 사서가 "풀린 듯"이라 할 때의 판정은 suggestOutcome */
  outcome?: 'kept' | 'broken' | 'dropped' | 'replaced'; suggestOutcome?: 'kept' | 'broken' | 'dropped' | 'replaced' | null;
  /** 닫히지 않았지만 움직인 떡밥의 "지금" 한 줄 — turn · msgId 는 그 줄을 적은 턴과 답변, was 는 그 전 줄 (답변이 지워지면 되돌린다) */
  latest?: PledgeNow | null;
  /** 이 떡밥이 마지막으로 언급된 턴과 그 답변, 그 전 값 · 언급으로 깨어난 턴과 그 답변 (계산으로 적는다) */
  /** 사서 · 요약이 이 서약을 마지막으로 살펴본 턴 (점검 차례를 돌리는 데 쓴다) */
  checkedTurn?: number | null;
  /** 사용자가 "아직 유효"라고 한 서약 — 서약 훑기가 옛 요약만 보고 다시 "풀린 듯"을 붙이지 않는다 */
  upheld?: boolean;
  /** 맺힌 마음(feeling): 왜 생겼는지 · 무엇이 응어리를 풀지 */
  cause?: string; needs?: string;
  /** 작가 계획(author_plan): answer = 정해 둔 답(인물은 모른다), veil = 답을 가린 한 줄 (이것만 싣는다) */
  answer?: string; veil?: string;
  seenTurn?: number | null; seenPrev?: number | null; seenBy?: string; wokeTurn?: number | null; wokeBy?: string;
  /** 기한 — 그 말이 나온 턴(0부터)에서 작중 며칠 뒤까지인가 */
  due?: PledgeDue | null;
  [k: string]: unknown }
export interface PledgeNow { text: string; turn: number; msgId?: string; was?: PledgeNow | null }
export interface PledgeDue { turn: number; in: number; msgId?: string; was?: PledgeDue | null }
/** 연대기로 합치기 전 묶음의 경계 (되살릴 때 쓴다) */
export interface SummarySrc { from: number; to: number; text: string }
export interface Summary { id: string; from: number; to: number; text: string; carried?: boolean; carriedFrom?: string; saga?: boolean; src?: SummarySrc[]; av?: unknown; avm?: string; /** 검수에서 걸린 곳 — 원문에서 찾지 못한 숫자, 빠진 전환점(★tN) */ unverified?: string[]; [k: string]: unknown }
export interface Item { id: string; name: string; holder?: string; meaning?: string; status?: string; disabled?: boolean; turn?: number; first?: number; updated?: number; msgId?: string; manual?: boolean; /** 요약 때 "더는 의미 없다"고 본 턴 (본문에 다시 나오면 지워진다) */ dormant?: number | null; [k: string]: unknown }
export interface Milestone { id: string; title: string; summary?: string; participants?: string[]; turn?: number | null; msgId?: string; grade?: string; /** 직접 고정 — 오래돼도 장부에 늘 싣는다 */ pinned?: boolean; [k: string]: unknown }
export interface DossierDoc { id: string; name?: string; title?: string; chunks: string[]; disabled?: boolean; [k: string]: unknown }
export interface Plan { remember?: unknown[]; scene_goal?: unknown; ideas?: unknown[]; avoid?: unknown[]; tension?: unknown; /** 옛 이름 */ scene_mandate?: unknown; forbidden_moves?: unknown; next_beats?: unknown; pressure?: unknown }

/** 한 대화의 서고 (mem 저장소의 한 줄, id = 대화 id) */
export interface Mem {
  id: string; turns: Turn[]; memories: MemItem[]; canon: CanonRow[]; status: StatusRow[]; pledges: Pledge[]; cast: CastCard[];
  chunks: Summary[]; arcs: Summary[]; items: Item[]; milestones: Milestone[]; dossier: DossierDoc[]; bonds: Bond[];
  chunked: number; consolidatedAt: number; arcAt: number; clockDays: number; bondRev: number; arcCursor?: number;
  /** 대화마다 한 번 하는 손질을 했는지 — 소설 모드의 "누가 한 말" 다시 가리기 · 인물 카드의 밀린 칸 걷기 */
  speakerRev?: number; castRev?: number; statusRev?: number;
  packetPin?: { text: string; turn?: number; at?: number } | null;
  direction?: { plan?: Plan | null; afterId?: string; [k: string]: unknown } | null;
  perspective?: string; perspectiveScope?: string;
  /** 자동 숨김을 처음 했을 때 한 번 알렸다 */
  hideNoticed?: boolean;
  /** 이 대화에서 회상하지 않을 말 — 그 말이 든 기억 · 옛 묶음은 회상으로 싣지 않는다 (지우지 않는다) */
  recallMute?: string[];
  /** "둘 다 맞아요"로 넘긴 서로 다른 기록 쌍 ('키|키') — 다시 묻지 않는다 */
  conflictIgnore?: string[];
  /** 이름 정리에서 "다른 사람"이라고 한 이름 쌍 ('키|키') — 같은 사람일 수 있다고 다시 권하지 않는다 */
  nameApart?: string[];
  /** 날 세기 · D-day · 주기 */
  trackers?: Tracker[];
  /** 서약 훑기를 마지막으로 한 때 (그때까지 기록된 답변 수) */
  pledgeSweepAt?: number;
  /** 전환점 — 턴을 기록할 때 함께 받는다 */
  pivots?: Pivot[];
  /** 옛 꼴의 shifts (읽을 때 pivots 로 옮긴다) */
  shifts?: Record<string, unknown>[];
  /** 인연 · 전환점을 새 꼴로 옮겨 둔 판 */
  tieRev?: number;
  /** 이 카드는: 'one' 한 사람 · 'many' 무대(카드 하나가 여러 사람을 연기 — 카드 이름은 무대의 이름일 뿐) · 없으면 자동 */
  cardCast?: 'one' | 'many';
  /** 옛 이야기 접기가 검수에 걸려 미뤄 둔 때 (그때의 턴 수) */
  foldHold?: number;
  /** 작중 날짜 직접 고침 — 그 메시지부터 그 날짜로 이어진다 */
  dateFix?: { msgId: string; date: string }[];
  /** 검사 — 어긋난 곳 보고서 · 요약 채점 · 채울 범위 (engine/auditCore.ts) */
  audit?: import('./engine/auditCore').AuditState;
  /** 최근 답마다 실린 기억 (메시지 메뉴 "이 답에 실린 기억") */
  shownLog?: ShownEntry[];
  /** 최근에 읽은 답마다 사서가 준 답 (스와이프로 같은 답에 돌아오면 다시 쓴다 — 최근 몇 개만) */
  recCache?: { k: string; raw: string; tags: Record<string, string>; clock?: { day?: number; now?: string }; at: number }[];
  /** 옛 서고의 이름 (chunks · chunked 로 옮긴다) */
  chapters?: Summary[]; chaptered?: number;
  [k: string]: unknown;
}

/** 설정 (S.settings.memory). 기본값은 memory.js 의 MEMORY_DEFAULTS */
export interface Cfg {
  enabled: boolean; auto: boolean; recordDelay: number; tokenBudget: number; topK: number; minScore: number; minCosine: number; mmrLambda: number; maxPerKind: number; maxPerTurn: number; multiQueryRecent: number;
  /** 기억 정리 호출에서 생각(추론)을 적게 요청한다 */ lowThink?: boolean;
  chunkTurns: number; /** 대화 모드 방의 요약 주기 (0 = chunkTurns 그대로) */ chunkTurnsTalk: number; /** 대화 모드: 답장 몇 개를 모아 한 번에 기록하나 (1 = 답장마다) */ talkBatch: number; /** RP: 답장 몇 개를 모아 한 번에 기록하나 */ rpBatch: number; arcMergeAt: number; consolidateEvery: number; arcConsolidateEvery: number; maxMemories: number; responseTokens: number; summaryContextCount: number;
  fossil: { settling: number; fossilized: number; deep: number }; language: string;
  cast: boolean; lockEdited: boolean; items: boolean; milestones: boolean; storyClock: boolean; refProfile: boolean; refLore: boolean;
  /** 회상 · 꿈 · 전해 들은 이야기를 표시해 지금 상태를 바꾸지 않게 · 중요한 기록의 근거 글귀를 원문과 맞춰 보기 */
  timeRoles?: boolean; evidence?: boolean;
  /** 회상 다듬기 — 짧은 입력에 직전 장면 섞기 · 질문 종류별 비중 · 흔한 결 거르기 */ recallTune?: boolean; /** 임베딩 평균을 빼고 견주기 (recallTune 이 켜져 있을 때) */ embedCenter?: boolean;
  trim: boolean; keepRecent: number; /** 자동 숨김: 늘 원문으로 둘 최근 답변 수 · 그보다 옛것을 몇 개씩 묶어 숨기나 */ keepTurns: number; hideUnit: number; /** 옛 묶음 떠올리기 (기본 끔) */ chapterRecall: boolean; autoHide: boolean; preserveRecent: number;
  supervisor: boolean; associative: boolean; authorizePrivate: boolean; perspective: string; audit: boolean; reasoningHeadroom: number;
  position: string; depth: number; prompt: string;
  embed: { mode: string; connId: string; model: string; floor: number; kind?: string; [k: string]: unknown };
  prompts: { supervisor: string; chunk: string; arc: string; [k: string]: string };
  recallWaitSec: number; yieldToChat: boolean; watchUpdates: boolean; splitInjection: boolean; stableRefreshTurns: number; styleGuard: boolean; recallQuotes: boolean; voiceSamples: number;
  /** 회상 쉬어가기 — 앞선 답변들에 연달아 실린 기억은 순서를 미룬다 */ recallCooldown: boolean;
  /** OOC(이야기 밖) 대화는 기록하지 않는다 */ skipOoc?: boolean;
  /** 원문 회상 — 옛일을 되짚을 때 숨긴 옛 대화에서 그 대목을 글자 그대로 찾아 싣는다 ('auto' | 'off') */ rawRecall?: string;
  /** 연속성 검사가 경고를 냈을 때만 한 번 더 따져 본다 */ checkConfirm?: boolean;
  /** 기록한 뒤에 직접 숨긴 메시지의 기록은 걷어 낸다 */ forgetHidden?: boolean;
  /** 입력 칸에 글을 쓰는 중이면 요약 · 서고 정리를 미룬다 */ waitTyping?: boolean;
  /** 약속 · 기한을 작중 시간으로 센다 (사서에게 기한을 함께 묻는다) */ dueDates?: boolean;
  /** 장면에 있는 인물의 상태를 사람마다 한 줄로 */ presentNow?: boolean;
  /** 대사에서 서로 부르는 말을 모아 싣는다 */ addressTerms?: boolean;
  /** 비밀을 아는 사람은 그 자리에 있던 사람만, 장면에 있지만 모르는 사람을 이름으로 */ guardSecrets?: boolean;
  /** 떠올린 옛 묶음을 장면 카드(순서대로의 일과 원문 대사)로 펼치는 수 (0 = 끔) */ sceneCards?: number;
  /** 장면 속 인물마다 마음에 둔 것을 싣는 줄 수 (0 = 끔) */ mindLines?: number;
  /** 지난 일을 꺼내는 정도: quiet | natural | active */ recallVoice?: string;
  /** 작중 날짜를 상태창에서 읽어 턴에 적는다 */ storyDates?: boolean;
  bannedPhrases: string; banInChat: boolean; banTell: boolean; threadSleepTurns: number; eraKeep: number;
  /** 서약 훑기 주기(답변 수) — 오래된 서약을 요약과 견주어 끝난 것에 "풀린 듯" 의견을 붙인다 (0 = 끔) */ pledgeSweepTurns?: number;
  /** 인연(갈래 · 한마디) · 전환점을 턴 기록과 함께 받는다 */ tieNotes?: boolean;
  /** 답의 꼴 도움말(꾸며 낸 한 턴의 기록 · 읽지 못하는 꼴)을 붙일 때: 'auto' 형식을 틀린 적 있는 모델에게만 | 'always' | 'off' */ formatHelp?: string;
  /** 장면에 함께 있는 사람들의 지금 사이를 「지금」 쪽에 싣는 줄 수 (0 = 끔) */ feelingLines?: number;
  statusMode: string; statusPattern: string; statusInject: boolean; qrMode: string; replyCheck: boolean;
  /** 어긋난 곳 검사 방식: '' 옛 설정(replyCheck) 그대로 | 'off' | 'each' 답변마다 | 'batch' 답 N개마다 한 번 — replyCheck 가 켜져 있으면 늘 답변마다다 */ checkMode?: string;
  /** 답 몇 개마다 한 번 검사하나 (checkMode 'batch') */ checkEvery?: number;
  /** 검사에서 근거를 확인한 어긋남을 다음 답 몇 개 동안 「지금」 쪽에 메모로 싣는다 (호출 없음) */ driftNote?: boolean;
  /** 요약 채점: 'manual' 직접 | 'flagged' 번호 · 날짜 점검에 걸렸을 때만 | 'every' 새 요약 M개마다 */ gradeMode?: string;
  /** 새 요약 몇 개마다 채점하나 (gradeMode 'every') */ gradeEvery?: number;
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
/** 답 하나(스와이프마다)를 만들 때 실린 기억 · 아깝게 빠진 기억 (k: 메시지 id:스와이프 번호) */
export interface ShownEntry { k: string; at: number; tokens: number; intent?: string; short?: boolean; centered?: boolean; sections: { name: string; tokens: number }[]; rows: { id: string; kind: string; summary: string; inc: boolean; why?: string; out?: string; score?: number; mode?: string }[] }
export interface PacketDiag {
  sections: { name: string; tokens: number }[]; rows?: RecallRow[]; fallback?: boolean; narrator?: boolean; hidden: number;
  /** 회상이 본 질문 종류 · 짧은 입력 보정 · 흔한 결 거르기 */ intent?: string; shortQ?: boolean; centered?: boolean;
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
  syncHidden(chat: ChatM, msgs: Msg[]): number;
  post(chat: ChatM, msgs: Msg[], signal?: AbortSignal): Promise<unknown>;
  received(chat: ChatM, msg: Msg, msgs?: Msg[] | null): Promise<unknown>;
  shownFor?(mem: Mem | null | undefined, msg: Msg): ShownEntry | null;
  prepare(chat: ChatM, msgs: Msg[], o?: { type?: string; background?: boolean }): unknown;
  // 막간 · 연속성 검사
  isSideMessage(msg: Msg): boolean;
  tagSideMessage?(chat: ChatM, msgs: Msg[], msg: Msg, type?: string): unknown;
  checkOf?(msg: Msg): MemCheck | null;
  setCheck?(msg: Msg, h: string, check: MemCheck | null): void;
  turnOfMsg?(mem: Mem, msgId: string): Turn | null;
  starTurn?(mem: Mem, msgId: string, on: boolean): number;
  cutAfter?(mem: Mem, msgs: Msg[], keep: number): number;
  restoreHidden?(chat: ChatM, mem: Mem, msgs: Msg[], keep?: number): number;
  noteTyping?(hasText: boolean): void;
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

