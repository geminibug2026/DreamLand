// 편집 화면이 쓰는 자료 꼴과, 아직 옮기지 않은 옛 모듈(/js)의 타입 · 꺼내 쓰는 함수
import { L, mod } from '../legacy';
import type { Char, Chat, Settings } from '../types';

// ── 자료 꼴 ──
export interface Bind { connId?: string; presetId?: string; personaId?: string }
export interface XChar extends Char {
  firstMes?: string; altGreetings?: string[]; mesExample?: string; systemPrompt?: string; postHistory?: string; talk?: number;
  depthPrompt?: { prompt: string; depth: number; role: string }; ext?: Record<string, unknown>; more?: Record<string, unknown>;
  loreIds?: string[]; bind?: Bind; src?: string;
}
export interface XChat extends Chat { personaId?: string; personaAuto?: boolean; loreIds?: string[]; count?: number; mode?: string; pvars?: Record<string, Record<string, unknown>> }
export interface Persona { id: string; name: string; avatar?: string; description: string; loreIds?: string[]; [k: string]: unknown }
export interface Entry {
  id: string; name?: string; keys?: string[]; keys2?: string[]; logic?: number | string; content?: string; constant?: boolean; enabled?: boolean;
  position?: string; order?: number; probability?: number; group?: string; outlet?: string; automationId?: string;
  sticky?: number | null; cooldown?: number | null; delay?: number | null; ignoreBudget?: boolean; useRegex?: boolean;
  caseSensitive?: boolean | string | null; wholeWord?: boolean | string | null; useGroupScoring?: boolean | string | null;
  noRecurse?: boolean; excludeRecursion?: boolean; delayUntilRecursion?: number; groupWeight?: number | null; groupOverride?: boolean | null;
  charFilter?: { names?: string[]; tags?: string[]; exclude?: boolean }; triggers?: string[];
  [k: string]: unknown;
}
export interface Lore { id: string; name: string; description?: string; entries: Entry[]; [k: string]: unknown }
export interface Block { id: string; kind: string; name?: string; role?: string; content?: string; enabled?: boolean; depth?: number | string | null; when?: string }
export interface PVOption { label: string; value?: string }
export interface PVar { id: string; name: string; label?: string; hint?: string; type: string; default?: unknown; options?: PVOption[]; min?: number; max?: number; step?: number; onText?: string; offText?: string }
export interface Preset { id: string; name: string; blocks: Block[]; params: Record<string, unknown>; vars?: PVar[]; regex?: unknown[]; [k: string]: unknown }
export interface Conn {
  id: string; name: string; provider: string; baseUrl?: string; apiKey?: string; model?: string; serviceAccount?: string; saEmail?: string; saProject?: string;
  project?: string; region?: string; instruct?: string; [k: string]: unknown;
}
export interface Regex { id: string; scope: string; enabled: boolean; [k: string]: unknown }
export interface XSettings extends Settings {
  activeConn: string; activePreset: string; activePersona: string; activeLore: string[];
  lore?: Record<string, unknown>; security?: { serverKeys?: boolean; blockRemoteImages?: boolean };
  assets?: { chars?: Record<string, unknown> }; bridge: { st?: string; me?: string }; vault?: unknown;
}
export interface XColls { chars: XChar; chats: XChat; personas: Persona; lore: Lore; presets: Preset; conns: Conn; regex: Regex }
export type Coll = keyof XColls;
export interface XStore {
  chars: XChar[]; chats: XChat[]; personas: Persona[]; lore: Lore[]; presets: Preset[]; conns: Conn[]; regex: Regex[]; settings: XSettings;
  get<K extends Coll>(coll: K, id?: string | null): XColls[K] | undefined;
  save<K extends Coll>(coll: K, obj: XColls[K], silent?: boolean): Promise<XColls[K]>;
  remove(coll: Coll, id: string): Promise<void>;
  set(patch: Partial<XSettings>): void;
  conn(): Conn | undefined; presetFor(chat?: XChat | null): Preset; persona(chat?: XChat | null): Persona | undefined;
  exportAll(): Promise<unknown>; importAll(data: unknown, replace: boolean): Promise<void>;
}

// ── 옛 모듈 ──
type Debounced<A extends unknown[]> = (...a: A) => void;
export interface HProps { [k: string]: unknown }
export interface CoreX {
  S: XStore;
  DB: { clear(store: string): Promise<unknown> };
  h(spec: string, props?: HProps | Node | string | null, ...kids: unknown[]): HTMLElement;
  uid(): string; now(): number;
  debounce<A extends unknown[]>(fn: (...a: A) => unknown, ms?: number): Debounced<A>;
  download(name: string, data: string | Blob, type?: string): void;
  pickFiles(o?: { accept?: string; multiple?: boolean; dir?: boolean }): Promise<File[]>;
  newPersona(o?: Partial<Persona>): Persona; newLore(): Lore; newEntry(): Entry; newConn(): Conn; defaultPreset(): Preset;
  MARKERS: Record<string, string>;
  Secrets: {
    ok: boolean; on: boolean; items: Record<string, Record<string, { tail?: string; hosts?: string[] }>>;
    is(v: unknown): boolean; tail(id: string, field: string): string;
    put(id: string, field: string, value: string, hosts: string[], note?: string): Promise<string>;
    del(id: string, field?: string): Promise<void>; hostsFor(conn: Conn, fallback?: string): string[]; restore(): Promise<void>;
  };
  Vault: { on: boolean; locked: boolean; enable(pass: string): Promise<void>; unlock(pass: string): Promise<boolean>; disable(): Promise<void> };
}
export interface Provider { name: string; group: string; kind: string; base?: string; ph?: string; models: string[]; note?: string; keyless?: boolean }
export interface LoreHit extends Entry { tok: number }
export interface EngineX {
  tokens(text?: unknown): number;
  PROVIDERS: Record<string, Provider>;
  listModels(conn: Conn): Promise<string[]>;
  streamChat(conn: Conn, P: Record<string, unknown>, messages: { role: string; content: string }[]): Promise<{ text: string }>;
  scanLore(books: Lore[], history: { content: string }[], ctx: Record<string, unknown>, o: Record<string, unknown>): LoreHit[];
  parseServiceAccount(text: string): { project_id?: string; client_email?: string };
  CONTINUE_NUDGE: string; IMPERSONATE_NUDGE: string; GROUP_NUDGE: string; TALK_DEFAULT: string;
}
export interface Tally { errors: string[]; chars?: number; chats?: number; skipped?: number; [k: string]: unknown }
export interface Source { label?: string; kind?: string }
export interface Found { kind: string; root: string; label: string }
type Scan = (src: Source) => Promise<Record<string, unknown>>;
type Run = (src: Source, want: Record<string, boolean>, progress: (t: string) => void) => Promise<Tally>;
export interface CardsX {
  importFiles(files: File[], progress?: (t: string) => void): Promise<Tally>;
  summarize(T: Tally): string;
  charToCard(c: XChar, v3?: boolean): unknown; exportCharPng(c: XChar): Promise<BlobPart>; loreToWorld(b: Lore): unknown;
  bridge: { ok(): Promise<boolean>; detect(): Promise<Found[]>; resolve(path: string): Promise<Found[]> };
  bridgeSource(root: string): Source; filesSource(files: File[]): Source | null;
  scanST: Scan; importST: Run; scanME: Scan; importME: Run;
}
export interface AssetsX { Assets: { removeOwner(owner: string): Promise<void>; ownerOfChar(id: string): string; ownerOfPersona(id: string): string } }
export interface StudioX { assetsPane(owner: string, holder: object, save: () => void): HTMLElement }
export interface Panel { owner: string; id: string; title: string; icon?: string; open?: boolean; render(chat: XChat, msgs?: unknown): Node }
export interface HooksX { X: { panels: Panel[] } }
export interface CondX {
  PV_TYPES: Record<string, string>; pvName(s: unknown): string; pvDefs(p?: Preset | null): PVar[];
  pvDefault(d: PVar): string | number | boolean; pvCoerce(d: PVar, raw: unknown): string | number | boolean; usedVars(text: unknown): Iterable<string>;
}
interface Tpl { name: string; enabled?: boolean }
export interface AdvX {
  AF(): { context: Tpl; instruct: Tpl; reasoning: Tpl };
  TEXT_PROVIDER_KINDS: string[]; tplList(kind: string): Tpl[]; instructName(v: string): string;
}
export interface ThemeX { applyTheme(): void }

/** 이 묶음의 화면 · 기능이 needs 에 적는 옛 모듈 */
export const NEEDS = ['core', 'engine', 'cards', 'assets', 'studio', 'hooks', 'cond', 'advanced', 'theme'];
export const core = () => mod<CoreX>('core');
export const store = () => core().S;
export const engine = () => mod<EngineX>('engine');
export const cards = () => mod<CardsX>('cards');
export const assets = () => mod<AssetsX>('assets').Assets;
export const studio = () => mod<StudioX>('studio');
export const hooks = () => mod<HooksX>('hooks').X;
export const cond = () => mod<CondX>('cond');
export const adv = () => mod<AdvX>('advanced');
export const theme = () => mod<ThemeX>('theme');

export const errMsg = (e: unknown) => e instanceof Error ? e.message : String(e);
/** 지금 화면을 다시 그리게 한다 (옛 refresh 자리): 홈은 알림으로, 아직 옮기지 않은 화면은 옛 방식으로 */
export const pageRefresh = () => { if (L.ui.route.page === 'home') L.core.emit('chars', null); else L.ui.refresh(); };
