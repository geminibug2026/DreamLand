// 드림랜드 공용 자료 꼴 — 저장 꼴은 js/core.js 의 new* · defaultSettings 그대로다 (꼴을 바꾸지 않는다)
// 흩어진 꼴(src/types.ts · src/chat/types.ts · src/diary/types.ts · src/memoria/types.ts …)을 여기로 모은다. 기존 파일은 2단계에서 이것으로 바꾼다
// 기능마다 덧붙이는 칸이 많아 각 꼴은 [k: string]: unknown 으로 열어 둔다

// ── 메시지 ──
export interface TrackState { w: Record<string, string>; c: Record<string, Record<string, string>> }
export interface IllustWho { name?: string; outfit?: string; action?: string }
// ── 삽화 ──
/** 장면 속 인물 한 명 */
export interface IllustPerson { name?: string; prompt?: string; negative?: string; x?: number; y?: number; id?: string }
/** 편집 · 생성에 쓰는 장면 */
export interface IllustScene { title?: string; prompt?: string; camera?: string; negative?: string; anchor?: string; finalPrompt?: boolean; characters: IllustPerson[]; size?: string }
export interface IllustRefUse { id: string; kind: string; mode?: string; strength?: number; fidelity?: number; information?: number }
/** 그림 한 장에 얼려 두는 생성 설정 */
export interface IllustGenConfig {
  backend: string; model: string; width: number; height: number; steps: number; scale: number; seed?: number;
  sampler?: string; scheduler?: string; cfgRescale?: number; style?: string; negative?: string; quality?: boolean;
  budgetGuard?: boolean; transparent?: boolean; references?: IllustRefUse[]; useCoords?: boolean; useOrder?: boolean;
  imgModel?: string; connId?: string; a1111?: string; sdSampler?: string;
  [k: string]: unknown;
}
export interface IllustReview { summary?: string; issues?: string[]; created?: number }
export interface IllustVersion { id: string; seed?: number | null; ts?: number; scene?: IllustScene; config?: IllustGenConfig | null; review?: IllustReview }
/** 답변에 붙은 삽화 한 자리 (버전 여러 장) */
export interface IllustSlot { id: string; slotId: string; title?: string; anchor?: string; hidden?: boolean; sel: number; versions: IllustVersion[] }
export interface IllustPlanRecord { status?: string; raw?: string; error?: string; repairs?: string[]; warnings?: string[]; seen?: boolean; ts?: number }
/** 메시지에 붙은 삽화 자리 (버전 여러 장). 옛 판의 한 장짜리 { id, title, camera, prompt, characters } 도 같은 자리에 있다 */
export type IllustItem = IllustSlot & { camera?: string; prompt?: string; negative?: string; characters?: (string | IllustWho)[]; [k: string]: unknown };
/** 그리기 전 장면 초안 */
export interface IllustDraftChar { name: string; prompt: string; negative: string; x: number; y: number }
export interface IllustDraft { title: string; camera: string; prompt: string; negative: string; finalPrompt: boolean; anchor: string; characters: IllustDraftChar[]; size?: string; [k: string]: unknown }
export interface Swipe {
  text: string; ts?: number; reasoning?: string; tr?: string; showTr?: boolean; model?: string; ms?: number;
  expr?: string; exprPick?: string; illust?: IllustItem[]; illustPlan?: IllustPlanRecord; illustDraft?: IllustScene[]; illustDraftConfig?: IllustGenConfig; state?: TrackState;
  [k: string]: unknown;
}
export interface Curtain { kind: 'open' | 'close'; title?: string; place?: string; time?: string; summary?: string }
export interface DiceRoll { expr: string; rolls: number[]; mod: number; total: number; sides: number }
export type Role = 'user' | 'assistant' | 'system';
export interface Msg {
  id: string; role: Role; charId: string; name: string; swipes: Swipe[]; sw: number; hidden: boolean; ts: number;
  images?: string[]; scene?: boolean; curtain?: Curtain; dice?: DiceRoll; diceBy?: string; greeting?: boolean; viaCommand?: boolean;
  reactions?: { emoji: string; by?: string }[]; why?: string; st?: number;
  memHidden?: boolean; memSide?: boolean;
  [k: string]: unknown;
}

// ── 캐릭터 · 페르소나 ──
export interface DepthPrompt { prompt: string; depth: number; role: string }
export interface Bind { connId: string; presetId: string; personaId: string; profileId?: string }
export interface Char {
  id: string; name: string; avatar: string; description: string; personality: string; scenario: string; firstMes: string; altGreetings: string[]; mesExample: string;
  systemPrompt: string; postHistory: string; creatorNotes: string; creator: string; version: string; tags: string[]; fav: boolean; talk: number;
  depthPrompt: DepthPrompt; ext: Record<string, unknown>; more: Record<string, unknown>; loreIds: string[]; bind: Bind; createdAt: number; updatedAt: number;
  folder?: string; diaryFont?: FontPref;
  [k: string]: unknown;
}
export interface Persona { id: string; name: string; avatar: string; description: string; loreIds: string[]; createdAt: number; updatedAt?: number; [k: string]: unknown }

// ── 대화 ──
export interface Presence { status: string; activity?: string; until?: number; hold?: boolean }
export interface Later { id: string; at: number; about: string; made: number }
export interface AutoState { day: string; count: number; streak: number; chime?: number; lastAt?: number; awayAt?: number; cd?: Record<string, Record<string, number>>; last?: { kind: string; at: number; charId: string } | null }
export interface ClockCfg { mode?: 'real' | 'story' | 'none'; at?: number; setAt?: number; flow?: 'real' | 'step' | 'hold'; step?: number; ai?: boolean }
export interface Diff { from: string; d?: number | null; at: number }
export interface Note { text: string; depth: number; role: string }
export interface Chat {
  id: string; name: string; charIds: string[]; personaId: string; personaAuto?: boolean; note: Note; summary: string; summaryAt: number; vars: Record<string, string>; loreIds: string[];
  tracker: Record<string, string>; bg: string; mode: 'rp' | 'talk'; diary: DiaryEntry[]; diaryAt: number; dreams?: Dream[]; keepsakes?: Keepsake[]; letters?: Letter[]; promises?: PromiseRec[]; groupOrder: string; count: number; preview: string; createdAt: number; updatedAt: number;
  pinned?: boolean; unread?: number; src?: string; muted?: string[]; folder?: string;
  scene?: { on: boolean; title?: string; place?: string; at?: number }; scenes?: number; parent?: { id: string; at: number };
  cast?: Record<string, Record<string, string>>; trackHide?: Record<string, boolean>; trackLock?: Record<string, boolean>; trackDiff?: Record<string, Diff>; castDiff?: Record<string, Diff>;
  hudFold?: boolean; hudCast?: boolean; snaps?: number; snap0?: TrackState; trackLog?: { t: number; v: Record<string, string> }[]; sceneLive?: boolean;
  auto?: AutoState; later?: Later[]; owed?: { at: number; charId: string }; seenAt?: number;
  presence?: Presence; presenceBy?: Record<string, Presence>; clock?: ClockCfg; loreState?: Record<string, unknown>; memBundle?: string;
  pvars?: Record<string, Record<string, unknown>>; direct?: { on?: boolean; [k: string]: unknown }; profileId?: string;
  [k: string]: unknown;
}

/** 먼저 오는 연락의 이유 */
export interface Motive { kind: string; about?: string; hours?: number | string; activity?: string; before?: string; from?: string; [k: string]: unknown }
/** 대화 모드: 다음 연락 예정과 막힌 이유 */
export interface AutoPlan {
  plan: { at: number; kind: string; blocks: string[]; notes: string[] }; ch: Char; due?: Later; owed: { at: number; charId: string } | null; motive: Motive;
  count: number; cap: number; streak: number; last: { kind: string; at: number; charId: string } | null; who: string; status: string; cdLeft: Record<string, number>;
}

// ── 일기장 · 달력 · 기념품 (대화방에 실려 다닌다) ──
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
export interface FontPref { font?: string; ink?: string; size?: number; lh?: number; reason?: string; by?: string; ai?: FontPick | null }
export interface FontPick { font: string; reason: string; ink: string; size: number }

export interface AlmSettings {
  tab?: string; goal?: number; weekStart?: number | string; keepsakeToast?: boolean; promiseInject?: boolean; promiseSulk?: boolean;
  promiseTag?: string; exchangeInject?: boolean; prompts?: Record<string, string>; dreamMoods?: string;
}

/** 달력의 하루 */
export interface Photo { id?: string; src?: string; title: string; msgId: string }
export interface DayRec {
  key: string; n: number; user: number; ai: number; firstId: string; lastId: string; firstIdx: number; lastIdx: number;
  photos: Photo[]; diary: DiaryEntry[]; dreams: Dream[]; keepsakes: Keepsake[]; promises: PromiseRec[];
}

// ── 로어북 ──
export interface CharFilter { names: string[]; tags: string[]; exclude: boolean }
export interface LoreEntry {
  id: string; name: string; keys: string[]; keys2: string[]; logic: number; content: string; constant: boolean; enabled: boolean; position: string; depth: number; role: string;
  order: number; probability: number; caseSensitive: boolean | null; wholeWord: boolean | null; useRegex: boolean; noRecurse: boolean; outlet: string; group: string;
  sticky: number | null; cooldown: number | null; delay: number | null; scanDepth: number | null;
  ignoreBudget: boolean; excludeRecursion: boolean; delayUntilRecursion: number; groupOverride: boolean; groupWeight: number; useGroupScoring: boolean | null;
  matchPersona: boolean; matchCharDesc: boolean; matchCharPersonality: boolean; matchCharNote: boolean; matchScenario: boolean; matchCreatorNotes: boolean;
  charFilter: CharFilter; triggers: string[]; automationId: string;
  [k: string]: unknown;
}
export interface Lore {
  id: string; name: string; description: string; scanDepth: number; tokenBudget: number; recursive: boolean; caseSensitive: boolean; wholeWord: boolean; entries: LoreEntry[]; createdAt: number; updatedAt?: number;
  [k: string]: unknown;
}

// ── 정규식 ──
export interface Regex {
  id: string; name: string; find: string; replace: string; trim: string[]; onUser: boolean; onAI: boolean; onSlash: boolean; onLore: boolean; onReason: boolean;
  mode: 'display' | 'prompt' | 'both' | 'store' | string; enabled: boolean; runOnEdit: boolean; subst: number; minDepth: number | null; maxDepth: number | null; scope: string; order: number; updatedAt?: number;
  [k: string]: unknown;
}

// ── 프리셋 ──
export interface PresetBlock { id: string; kind: string; name: string; role: string; content: string; enabled: boolean; depth: number | string | null; when?: string; [k: string]: unknown }
/** 프리셋 변수 */
export interface PresetVarOption { label: string; value?: string }
export interface PresetVar {
  id: string; name: string; label?: string; hint?: string; type: 'select' | 'slider' | 'toggle' | 'text' | string;
  default?: unknown; options?: PresetVarOption[]; min?: number; max?: number; step?: number; onText?: string; offText?: string;
}
export interface PresetParams {
  temperature: number | null; topP: number | null; topK: number | null; maxTokens: number; contextSize: number; freqPen: number | null; presPen: number | null; minP: number | null; topA: number | null; repPen: number | null; seed: number | null;
  stream: boolean; effort: string; squash: boolean; prefill: string; stop: string[]; cardOverrides: boolean; namesInGroup: boolean;
  [k: string]: unknown;
}
export interface Preset { id: string; name: string; createdAt: number; updatedAt?: number; params: PresetParams; blocks: PresetBlock[]; regex?: Regex[]; vars?: PresetVar[]; [k: string]: unknown }

// ── 연결 ──
export interface Conn {
  id: string; name: string; provider: string; baseUrl: string; apiKey: string; model: string; proxy: boolean; postProcess: string; extraHeaders: string; extraBody: string; cache: boolean;
  serviceAccount?: string; saEmail?: string; saProject?: string; sec?: string; updatedAt?: number; instruct?: string; project?: string; region?: string;
  [k: string]: unknown;
}

// ── 설정 ── (defaultSettings 의 꼴. 하위 묶음은 기능이 칸을 더하니 열어 둔다)
/** 대화 모드 설정 (settings.modes) */
export interface Modes {
  auto?: boolean; autoConn?: string; autoDaily?: number; autoStreak?: number; autoMinutes?: number; autoBackoff?: number; autoHidden?: boolean; autoTokens?: number;
  quietFrom?: string; quietTo?: string; later?: boolean; laterMax?: number; away?: boolean; awayHours?: number; readReact?: boolean;
  stagger?: boolean; talkTokens?: number; scenes?: boolean; sceneStart?: boolean; userActivity?: string; sched?: boolean; schedPrompt?: string;
  [k: string]: unknown;
}
type Open = Record<string, unknown>;
export interface Folder { id: string; name: string }
export interface Theme {
  id: string; name: string; tone: 'light' | 'dark' | string; builtin: boolean; radius?: number; pattern?: string; glass?: number; fx?: string; bgImage?: string; bgDim?: number; bgBlur?: number; css?: string; sourceCss?: string; ext?: string;
  c: Record<string, string>;
  [k: string]: unknown;
}
export interface Settings {
  id: 'settings'; theme: string; customThemes: Theme[]; font: string; fontCustom: string; fontSize: number; lineHeight: number; chatWidth: number; bubbles: boolean; motion: boolean; avatarShape: string; exts: Record<string, boolean>;
  enterSend: boolean | 'auto'; autoScroll: boolean; showMeta: boolean; customCss: string; userNameFallback: string;
  ux: Open & { sound: boolean; soundVolume: number; soundUnfocused: boolean; swipes: boolean; gestures: boolean; confirmDelete: boolean; autoLoadChat: boolean; restoreInput: boolean; clickEdit: boolean; mdKeys: boolean; logPrompts: boolean; toastPos: string; showIds: boolean; showAvatars: boolean; metaTime: boolean; metaModel: boolean; metaTimer: boolean; metaTokens: boolean };
  activeConn: string; activePreset: string; activePersona: string; activeLore: string[];
  summary: Open & { enabled: boolean; every: number; keep: number; trim: boolean; prompt: string };
  tracker: Open & { enabled: boolean; inject: boolean; mode: string; hud: boolean; fields: string };
  translate: Open & { lang: string; auto: boolean; autoInput: boolean; inputLang: string; context: number; prompt: string; maxTokens: number };
  memory: Open & { enabled: boolean; auto: boolean };
  illust: Open & { auto: boolean; mode: string; every: number; maxScenes: number; backend: string; naiKey: string; connId: string };
  defaultMode: 'rp' | 'talk'; rpBubbles: boolean;
  modes: Modes;
  format: Open & { v: number; context: Open; instruct: Open; sysprompt: Open; reasoning: Open; stopStrings: string[] };
  templates: { context: Open[]; instruct: Open[]; sysprompt: Open[]; reasoning: Open[] };
  security: { blockRemoteImages: boolean; serverKeys: boolean };
  assets: Open & { chars?: Record<string, unknown> }; helpers: Record<string, string>;
  quick: { label: string; text: string }[];
  bridge: { st: string; me: string }; lastChat: string; lastPage: string; globalVars: Record<string, string>; onboarded: boolean;
  lore: Open; qr: Open; auto: Open; regenWhy: Open; direct: Open; profiles: Open[];
  /** 저장된 뒤에 붙는 칸 */
  almanac?: AlmSettings; diary?: { prompt?: string; memoPrompt?: string };
  look4?: boolean; vault?: { salt: string; check: string }; illustSec?: string; migr?: Record<string, number>; folders?: Folder[]; homeCols?: number;
  [k: string]: unknown;
}

// ── 저장소 ──
/** S 의 목록 저장소 이름과 그 꼴 */
export interface Colls { chars: Char; chats: Chat; personas: Persona; lore: Lore; presets: Preset; conns: Conn; regex: Regex }
export type CollName = keyof Colls;
/** IndexedDB 저장소 이름 (js/core.js 의 STORES) */
export type StoreName = CollName | 'msgs' | 'kv' | 'assets' | 'mem';
export interface MsgsRow { id: string; list: Msg[] }
export interface Asset { id: string; owner: string; name: string; data: string; [k: string]: unknown }
/** kv 의 한 줄 (settings · ext: · extdata: · vec: · memcp: …) */
export interface KvRow { id: string; [k: string]: unknown }

// ── 화면 공용 ──
export type MenuItem = { label?: string; ic?: string; hint?: string; danger?: boolean; onclick: () => unknown } | '-' | null | false | undefined | '' | 0;
export interface ModalAction { label: string; ic?: string; cls?: string; onclick?: () => unknown }
export interface ModalHandle { close(): void; el: HTMLDivElement }
/** [화면, 이름, 아이콘, 휴대폰 아래 탭에 고정, 상단 메뉴 영문 이름, 상단에 바로 보이기] */
export type NavItem = [page: string, label: string, icon: string, main: boolean, en?: string, top?: boolean];
