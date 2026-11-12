// 옛 공용 모듈 다리 — 장기기억 엔진이 쓰는 것만 타입을 적는다 (core.js · engine.js · embed.js)
import { mod } from '../../legacy';
import type { Char } from '../../types';
import type { Cfg, ChatM, Mem, Msg } from '../types';

/** 페르소나 (core.js newPersona) */
export interface Persona { id: string; name: string; avatar?: string; description?: string; loreIds?: string[]; createdAt?: number; [k: string]: unknown }
/** 연결 (core.js newConn) */
export interface Conn { id: string; name?: string; provider: string; baseUrl?: string; apiKey?: string; model?: string; proxy?: boolean; [k: string]: unknown }
/** 로어북과 항목 (core.js newLore · newEntry) */
export interface LoreEntry { id?: string; name?: string; keys?: string[]; content?: string; enabled?: boolean; constant?: boolean; [k: string]: unknown }
export interface LoreBook { id: string; name?: string; description?: string; entries?: LoreEntry[]; [k: string]: unknown }
/** 캐릭터 — 엔진이 읽는 칸을 보탠 것 */
export interface CharM extends Char { loreIds?: string[] }

/** S.get 의 모음 이름 → 자료 꼴 */
export interface EngineColls { chars: CharM; chats: ChatM; personas: Persona; conns: Conn; lore: LoreBook }
export interface EngineSettings { memory?: Cfg; [k: string]: unknown }
export interface EngineStore {
  chars: CharM[]; chats: ChatM[]; personas: Persona[]; conns: Conn[]; lore: LoreBook[];
  settings: EngineSettings;
  get<K extends keyof EngineColls>(coll: K, id: string | null | undefined): EngineColls[K] | undefined;
  set(patch: Partial<EngineSettings>): void;
  msgs(chatId: string): Promise<Msg[]>;
  saveMsgs(chat: ChatM, list: Msg[]): Promise<void>;
  persona(chat?: ChatM | null): Persona;
  helperConn(task: string, chat?: ChatM | null): Conn | undefined;
}

/** IndexedDB 저장소 이름 → 한 줄의 꼴 */
export interface KvRow { id: string; [k: string]: unknown }
export interface DbRows { mem: Mem; msgs: { id: string; list: Msg[] }; kv: KvRow }
export interface EngineDB {
  get<K extends keyof DbRows>(store: K, id: string): Promise<DbRows[K] | undefined>;
  get<T = unknown>(store: string, id: string): Promise<T | undefined>;
  put<K extends keyof DbRows>(store: K, value: DbRows[K]): Promise<unknown>;
  put(store: string, value: { id: string }): Promise<unknown>;
  del(store: string, id: string): Promise<unknown>;
  all<K extends keyof DbRows>(store: K): Promise<DbRows[K][]>;
  all<T = unknown>(store: string): Promise<T[]>;
  byOwner<T = unknown>(owner: string): Promise<T[]>;
}

export interface CoreForEngine {
  S: EngineStore;
  DB: EngineDB;
  uid(): string;
  now(): number;
  msgText(m: Msg): string;
  emit(ev: string, data?: unknown): void;
  /** 받는 쪽이 자기 자료 꼴을 적는다: on<{ chat: ChatM }>('…', x => …) 또는 on('…', (x: T) => …) */
  on<T = unknown>(ev: string, fn: (data: T) => void): () => void;
}

export interface ProviderDef { name: string; group: string; base: string; models: string[]; kind: string; [k: string]: unknown }
export interface QuickCallOpt { maxTokens?: number; signal?: AbortSignal; conn?: Conn }
export interface EngineForEngine {
  tokens(text?: string | null): number;
  quickCall(system: string, user: string, opt?: QuickCallOpt): Promise<string>;
  activeBooks(chat: ChatM, chars: CharM[], persona?: Persona | null): LoreBook[];
  PROVIDERS: Record<string, ProviderDef>;
}

export interface EmbedOpt {
  conn?: Conn; connId?: string; model?: string; kind?: string; signal?: AbortSignal; timeoutMs?: number; query?: boolean;
  onProgress?: (done: number, total: number) => void;
}
export interface EmbedForEngine {
  embedTexts(texts: string[], opt?: EmbedOpt): Promise<Float32Array[]>;
  embedKind(conn?: Conn | null, pick?: string): string;
  embedModel(conn?: Conn | null, kind?: string, model?: string): string;
}

export const { S, DB, uid, now, msgText, emit, on } = mod<CoreForEngine>('core');
export const { tokens, quickCall, activeBooks, PROVIDERS } = mod<EngineForEngine>('engine');
export const { embedTexts, embedKind, embedModel } = mod<EmbedForEngine>('embed');
