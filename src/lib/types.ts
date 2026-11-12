// 드림랜드 공용 자료 꼴 — 저장 꼴은 js/core.js 의 new* · defaultSettings 그대로다 (꼴을 바꾸지 않는다)
// 흩어진 꼴(src/types.ts · src/chat/types.ts · src/diary/types.ts · src/memoria/types.ts …)을 여기로 모은다. 기존 파일은 2단계에서 이것으로 바꾼다
// 기능마다 덧붙이는 칸이 많아 각 꼴은 [k: string]: unknown 으로 열어 둔다

// ── 메시지 ──
export interface TrackState { w: Record<string, string>; c: Record<string, Record<string, string>> }
export interface IllustWho { name?: string; outfit?: string; action?: string }
export interface IllustItem { id: string; title?: string; camera?: string; prompt?: string; negative?: string; characters?: (string | IllustWho)[]; versions?: { id?: string }[]; [k: string]: unknown }
export interface Swipe {
  text: string; ts?: number; reasoning?: string; tr?: string; showTr?: boolean; model?: string; ms?: number;
  illust?: IllustItem[]; illustPlan?: unknown; illustDraft?: unknown; state?: TrackState;
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
export interface Bind { connId: string; presetId: string; personaId: string }
export interface Char {
  id: string; name: string; avatar: string; description: string; personality: string; scenario: string; firstMes: string; altGreetings: string[]; mesExample: string;
  systemPrompt: string; postHistory: string; creatorNotes: string; creator: string; version: string; tags: string[]; fav: boolean; talk: number;
  depthPrompt: DepthPrompt; ext: Record<string, unknown>; more: Record<string, unknown>; loreIds: string[]; bind: Bind; createdAt: number; updatedAt: number;
  folder?: string;
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
  tracker: Record<string, string>; bg: string; mode: 'rp' | 'talk'; diary: { to?: number; [k: string]: unknown }[]; diaryAt: number; groupOrder: string; count: number; preview: string; createdAt: number; updatedAt: number;
  pinned?: boolean; unread?: number; src?: string; muted?: string[]; folder?: string;
  scene?: { on: boolean; title?: string; place?: string; at?: number }; scenes?: number; parent?: { id: string; at: number };
  cast?: Record<string, Record<string, string>>; trackHide?: Record<string, boolean>; trackLock?: Record<string, boolean>; trackDiff?: Record<string, Diff>; castDiff?: Record<string, Diff>;
  hudFold?: boolean; hudCast?: boolean; snaps?: number; snap0?: TrackState;
  auto?: AutoState; later?: Later[]; owed?: { at: number; charId: string }; seenAt?: number;
  presence?: Presence; presenceBy?: Record<string, Presence>; clock?: ClockCfg; loreState?: Record<string, unknown>; memBundle?: string;
  [k: string]: unknown;
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
export interface PresetBlock { id: string; kind: string; name: string; role: string; content: string; enabled: boolean; depth: number | null; [k: string]: unknown }
export interface PresetParams {
  temperature: number | null; topP: number | null; topK: number | null; maxTokens: number; contextSize: number; freqPen: number | null; presPen: number | null; minP: number | null; topA: number | null; repPen: number | null; seed: number | null;
  stream: boolean; effort: string; squash: boolean; prefill: string; stop: string[]; cardOverrides: boolean; namesInGroup: boolean;
  [k: string]: unknown;
}
export interface Preset { id: string; name: string; createdAt: number; updatedAt?: number; params: PresetParams; blocks: PresetBlock[]; regex?: Regex[]; [k: string]: unknown }

// ── 연결 ──
export interface Conn {
  id: string; name: string; provider: string; baseUrl: string; apiKey: string; model: string; proxy: boolean; postProcess: string; extraHeaders: string; extraBody: string; cache: boolean;
  serviceAccount?: string; saEmail?: string; saProject?: string; sec?: string; updatedAt?: number;
  [k: string]: unknown;
}

// ── 설정 ── (defaultSettings 의 꼴. 하위 묶음은 기능이 칸을 더하니 열어 둔다)
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
  modes: Open;
  format: Open & { v: number; context: Open; instruct: Open; sysprompt: Open; reasoning: Open; stopStrings: string[] };
  templates: { context: Open[]; instruct: Open[]; sysprompt: Open[]; reasoning: Open[] };
  security: { blockRemoteImages: boolean; serverKeys: boolean };
  assets: Open; helpers: Record<string, string>;
  quick: { label: string; text: string }[];
  bridge: { st: string; me: string }; lastChat: string; lastPage: string; globalVars: Record<string, string>; onboarded: boolean;
  lore: Open; qr: Open; auto: Open; regenWhy: Open; direct: Open; profiles: Open[];
  /** 저장된 뒤에 붙는 칸 */
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
export type MenuItem = { label: string; ic?: string; hint?: string; danger?: boolean; onclick: () => unknown } | '-' | null | false | undefined | '' | 0;
export interface ModalAction { label: string; ic?: string; cls?: string; onclick?: () => unknown }
export interface ModalHandle { close(): void; el: HTMLElement }
/** [화면, 이름, 아이콘, 휴대폰 아래 탭에 고정, 상단 메뉴 영문 이름, 상단에 바로 보이기] */
export type NavItem = [page: string, label: string, icon: string, main: boolean, en?: string, top?: boolean];
