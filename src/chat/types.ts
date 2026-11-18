// 대화 화면이 쓰는 자료 꼴 (쓰는 만큼만)

export type { TrackState, IllustWho, IllustItem, Swipe, Curtain, DiceRoll, Msg, Presence, Later, AutoState, ClockCfg, Diff, Persona, Conn, Preset, Motive, AutoPlan, Modes } from '../lib/types';
import type { Motive } from '../lib/types';
import type { Char, Chat, IllustWho, Lore, Settings } from '../lib/types';
export interface SceneSpec { title?: string; camera?: string; prompt?: string; negative?: string; characters?: (string | IllustWho)[] }
export interface PresenceNow { status: string; activity: string; until: number; from: '' | 'override' | 'schedule' }
/** 대화방 · 캐릭터 · 로어북 · 설정 (공용 꼴) */
export type Room = Chat;
export type Cast = Char;
export type Book = Lore;
export type SettingsX = Settings;

export type { PromptMsg as PMsg, LoreHit, Ctx, Built } from '../lib/engine';
export type GenType = 'normal' | 'regen' | 'continue' | 'impersonate';
export interface GenOpt { speaker?: Cast; proactive?: boolean; chime?: boolean; live?: Motive; stamp?: number }
export interface Field { key: string; desc?: string; min?: number; max?: number }
export interface StatePatch { w: Record<string, string>; c?: Record<string, Record<string, string>>; gone?: string[] }
export interface CmdItem { cmd: string; args: string; help: string; alias?: string[] }

// 대화 화면 · 다른 기능이 함께 쓰는 꼴
export type { CmdApi as ChatApi } from '../lib/hooks';
