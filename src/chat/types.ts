// 대화 화면이 쓰는 자료 꼴 (쓰는 만큼만)
import type { Char, Chat } from '../types';

export interface TrackState { w: Record<string, string>; c: Record<string, Record<string, string>> }
export interface IllustWho { name?: string; outfit?: string; action?: string }
export interface IllustItem { id: string; title?: string; camera?: string; prompt?: string; negative?: string; characters?: (string | IllustWho)[]; versions?: { id?: string }[] }
export interface SceneSpec { title?: string; camera?: string; prompt?: string; negative?: string; characters?: (string | IllustWho)[] }
export interface Swipe {
  text: string; ts?: number; reasoning?: string; tr?: string; showTr?: boolean; model?: string; ms?: number;
  illust?: IllustItem[]; illustPlan?: unknown; illustDraft?: unknown; state?: TrackState;
}
export interface Curtain { kind: 'open' | 'close'; title?: string; place?: string; time?: string; summary?: string }
export interface DiceRoll { expr: string; rolls: number[]; mod: number; total: number; sides: number }
export interface Msg {
  id: string; role: 'user' | 'assistant' | 'system'; charId: string; name: string; swipes: Swipe[]; sw: number; hidden: boolean; ts: number;
  images?: string[]; scene?: boolean; curtain?: Curtain; dice?: DiceRoll; diceBy?: string; greeting?: boolean;
  reactions?: { emoji: string; by?: string }[]; why?: string; st?: number;
}

export interface Presence { status: string; activity?: string; until?: number; hold?: boolean }
export interface PresenceNow { status: string; activity: string; until: number; from: '' | 'override' | 'schedule' }
export interface Later { id: string; at: number; about: string; made: number }
export interface AutoState { day: string; count: number; streak: number; chime?: number; lastAt?: number; awayAt?: number; cd?: Record<string, Record<string, number>>; last?: { kind: string; at: number; charId: string } | null }
export interface ClockCfg { mode?: 'real' | 'story' | 'none'; at?: number; setAt?: number; flow?: 'real' | 'step' | 'hold'; step?: number; ai?: boolean }
export interface Diff { from: string; d?: number | null; at: number }

/** 대화방: 공용 Chat 에 대화 화면이 읽고 쓰는 칸을 더한 것 */
export interface Room extends Chat {
  mode?: 'rp' | 'talk'; personaId?: string; count?: number; pinned?: boolean; unread?: number; src?: string;
  scene?: { on: boolean; title?: string; place?: string; at?: number }; scenes?: number;
  parent?: { id: string; at: number }; diary?: { to?: number }[]; diaryAt?: number;
  bg?: string; muted?: string[]; groupOrder?: string; loreIds?: string[];
  note?: { text: string; depth: number; role: string }; summary?: string; summaryAt?: number; vars?: Record<string, string>;
  tracker?: Record<string, string>; cast?: Record<string, Record<string, string>>;
  trackHide?: Record<string, boolean>; trackLock?: Record<string, boolean>; trackDiff?: Record<string, Diff>; castDiff?: Record<string, Diff>;
  hudFold?: boolean; hudCast?: boolean; snaps?: number; snap0?: TrackState;
  auto?: AutoState; later?: Later[]; owed?: { at: number; charId: string }; seenAt?: number;
  presence?: Presence; presenceBy?: Record<string, Presence>; clock?: ClockCfg; loreState?: Record<string, unknown>;
}
export interface Cast extends Char { talk?: number; firstMes?: string; altGreetings?: string[]; loreIds?: string[] }
export interface Persona { id: string; name: string; avatar?: string }
export interface Conn { id: string; name: string; model?: string }
export interface Preset { id: string; name: string; params: { contextSize?: number; maxTokens?: number; stop?: string[]; squash?: boolean;[k: string]: unknown } }
export interface Book { id: string; name: string }

export interface Modes {
  auto?: boolean; autoConn?: string; autoDaily?: number; autoStreak?: number; autoMinutes?: number; autoBackoff?: number; autoHidden?: boolean; autoTokens?: number;
  quietFrom?: string; quietTo?: string; later?: boolean; laterMax?: number; away?: boolean; awayHours?: number; readReact?: boolean;
  stagger?: boolean; talkTokens?: number; scenes?: boolean; sceneStart?: boolean; userActivity?: string;
  [k: string]: unknown;
}
export interface SettingsX {
  lastChat?: string; sideView?: string; rpBubbles?: boolean; showMeta?: boolean; avatarShape?: string; enterSend?: boolean; autoScroll?: boolean; motion?: boolean;
  activeConn?: string; activePreset?: string; activeLore: string[]; defaultMode?: 'rp' | 'talk';
  quick: { label: string; text: string }[];
  modes: Modes;
  tracker: { enabled?: boolean; mode?: string; hud?: boolean; fields?: string;[k: string]: unknown };
  translate: { lang: string; auto?: boolean; autoInput?: boolean; inputLang?: string; context?: number };
  memory: { enabled?: boolean; auto?: boolean };
  illust: { auto?: boolean; mode?: string; every?: number; maxScenes?: number };
  format?: { reasoning?: { autoExpand?: boolean }; stopStrings?: string[] };
  [k: string]: unknown;
}

export type GenType = 'normal' | 'regen' | 'continue' | 'impersonate';
export interface PMsg { role: string; content: string; src?: string; prefill?: boolean }
export interface LoreHit { name?: string; keys?: string[]; book?: string }
export interface Ctx { user: string; char?: string }
export interface Built { messages: PMsg[]; total: number; lore: LoreHit[]; dropped?: number; talk?: boolean; ctx: Ctx }
export interface Motive { kind: string; about?: string; hours?: number; activity?: string; before?: string; from?: string }
export interface GenOpt { speaker?: Cast; proactive?: boolean; chime?: boolean; live?: Motive; stamp?: number }
export interface Field { key: string; desc?: string; min?: number; max?: number }
export interface StatePatch { w: Record<string, string>; c?: Record<string, Record<string, string>>; gone?: string[] }
export interface CmdItem { cmd: string; args: string; help: string; alias?: string[] }
