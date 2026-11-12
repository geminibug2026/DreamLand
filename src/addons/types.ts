// 번역 · 에셋 · 표정 · 일정 · 벡터 · 흐름 묶음이 함께 쓰는 자료 꼴 — 저장 꼴은 공용(src/lib/types.ts) 그대로
import type { Asset, Char, Chat, Msg, Persona } from '../lib/types';
export type { Swipe, Msg, Persona, Conn, Preset, LoreEntry, Lore as LoreBook } from '../lib/types';
export type CharX = Char;
export type ChatX = Chat;
/** IndexedDB assets 스토어의 한 줄 (에셋 · 표정 · 삽화가 함께 쓴다) */
export type AssetRec = Asset;
export interface FormDef {
  k?: string; label?: string; type?: string; hint?: string; ph?: string; opts?: (string | [string, string])[];
  half?: boolean; third?: boolean; live?: boolean; section?: string; min?: number; max?: number; step?: number; rows?: number;
}
export type { PromptPiece } from '../lib/hooks';
export interface PromptInfo { chat: ChatX; char?: CharX; persona?: Persona; type?: string; commit?: boolean; ctx?: MacroCtx }
export type { Command } from '../lib/hooks';
export interface Action { owner: string; id: string; label: string; icon?: string; run(msg: Msg, chat: ChatX): unknown }
export interface ComposerItem { owner: string; id: string; label: string; icon?: string; run(): unknown }
export interface Panel { owner: string; id: string; title: string; icon?: string; open?: boolean; render(chat: ChatX, msgs: Msg[]): Node }
export type { FilterInfo } from '../lib/hooks';
export type { TranslateOpt } from '../lib/hooks';
export type MacroCtx = Record<string, unknown> & { char?: string; user?: string };
