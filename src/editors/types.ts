// 편집 화면이 쓰는 자료 꼴 — 저장 꼴은 공용(src/lib/types.ts) 그대로
import type { Char, Chat, Settings } from '../lib/types';
export type { Persona, Lore, LoreEntry as Entry, PresetBlock as Block, PresetVar as PVar, PresetVarOption as PVOption, Preset, Conn, Regex, Bind, CollName as Coll } from '../lib/types';
export type { Store as XStore } from '../lib/core';
export type { ProviderDef as Provider, LoreHit } from '../lib/engine';
export type { Tally, Source, Found } from '../lib/cards';
export type XChar = Char;
export type XChat = Chat;
export type XSettings = Settings;
