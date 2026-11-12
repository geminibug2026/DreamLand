// 번역 · 에셋 · 표정 · 일정 · 벡터 · 흐름 묶음이 함께 쓰는 옛 모듈 다리 (쓰는 만큼만 적은 타입)
import { mod } from '../legacy';
import { charPicker, confirmBox, menu, promptBox, toast } from '../ui';
import type { Char, Chat, MenuItem, ModalAction, ModalHandle, Settings } from '../types';

export interface Swipe { text: string; ts?: number; tr?: string; showTr?: boolean; expr?: string; exprPick?: string; illust?: { id: string }[]; [k: string]: unknown }
export interface Msg { id: string; role: 'user' | 'assistant' | 'system'; charId: string; name: string; swipes: Swipe[]; sw: number; hidden?: boolean; ts: number; dice?: unknown; direct?: boolean; scene?: boolean; [k: string]: unknown }
export interface Persona { id: string; name: string; avatar?: string; [k: string]: unknown }
export interface Conn { id: string; name: string; model?: string; provider?: string; [k: string]: unknown }
export interface Preset { id: string; name: string; [k: string]: unknown }
export interface LoreEntry { id: string; name?: string; keys?: string[]; content?: string; enabled?: boolean; constant?: boolean; vectorized?: boolean; [k: string]: unknown }
export interface LoreBook { id: string; name: string; entries?: LoreEntry[]; [k: string]: unknown }
export interface CharX extends Char { ext?: Record<string, unknown>; bind?: { connId?: string; presetId?: string; personaId?: string; profileId?: string } }
export interface ChatX extends Chat {
  mode?: 'rp' | 'talk'; personaId?: string; muted?: string[]; scene?: { on?: boolean }; count?: number; seenAt?: number;
  parent?: { id: string; at: number }; profileId?: string; direct?: { on?: boolean }; summaryAt?: number;
}
export interface CollsX { chars: CharX; chats: ChatX; personas: Persona; conns: Conn; lore: LoreBook; presets: Preset }
export interface StoreX {
  chars: CharX[]; chats: ChatX[]; personas: Persona[]; conns: Conn[]; lore: LoreBook[]; presets: Preset[]; settings: Settings;
  get<K extends keyof CollsX>(coll: K, id: string | null | undefined): CollsX[K] | undefined;
  save<K extends keyof CollsX>(coll: K, obj: CollsX[K], silent?: boolean): Promise<CollsX[K]>;
  set(patch: Record<string, unknown>): void;
  saveSettings?(): void;
  msgs(chatId: string): Promise<Msg[]>;
  saveMsgs(chat: ChatX, msgs: Msg[]): Promise<void>;
  persona(chat?: ChatX | null): Persona | undefined;
  helperConn(task: string, chat?: ChatX | null): Conn | undefined;
  conn(): Conn | undefined;
  preset(): Preset | undefined;
}
/** IndexedDB assets 스토어의 한 줄 (에셋 · 표정 · 삽화가 함께 쓴다) */
export interface AssetRec { id: string; owner: string; kind?: string; name: string; data: string; ts?: number; disabled?: boolean; ver?: string; label?: string; [k: string]: unknown }
export interface CoreX {
  S: StoreX;
  DB: {
    get(store: string, id: string): Promise<unknown>;
    put(store: string, v: object): Promise<unknown>;
    del(store: string, id: string): Promise<unknown>;
    byOwner(owner: string): Promise<AssetRec[]>;
  };
  on(ev: string, fn: (data?: unknown) => void): () => void;
  emit(ev: string, data?: unknown): void;
  uid(): string; now(): number;
  clamp(v: number, a: number, b: number): number;
  debounce<A extends unknown[]>(fn: (...a: A) => void, ms?: number): (...a: A) => void;
  download(name: string, data: string | Blob | Uint8Array, type?: string): void;
  pickFiles(o?: { accept?: string; multiple?: boolean; dir?: boolean }): Promise<File[]>;
  readDataURL(f: Blob): Promise<string>;
  bytesToDataURL(bytes: Uint8Array, mime?: string): string;
  dataURLToBytes(url: string): Uint8Array;
  mimeOf(name: string): string;
  shrinkImage(src: string, max?: number, mime?: string, q?: number): Promise<string>;
  msgText(m: Msg): string;
  fmtTime(ts: number): string;
  newMsg(role: Msg['role'], text: string, o?: Partial<Msg>): Msg;
  newChat(o?: Partial<ChatX>): ChatX;
  arr<T>(v: T | T[] | null | undefined | ''): T[];
}
export interface FormDef {
  k?: string; label?: string; type?: string; hint?: string; ph?: string; opts?: (string | [string, string])[];
  half?: boolean; third?: boolean; live?: boolean; section?: string; min?: number; max?: number; step?: number; rows?: number;
}
export interface UiX {
  route: { page: string; arg: unknown };
  go(page: string, arg?: unknown): void;
  toast(msg: string, kind?: string): void;
  modal(o: { title?: string; body?: Node; actions?: (ModalAction & { ic?: string })[]; wide?: boolean; onClose?: () => void }): ModalHandle & { el: HTMLElement };
  menu(anchor: Element, items: MenuItem[]): void;
  confirmBox(msg: string, okLabel?: string, danger?: boolean): Promise<boolean>;
  promptBox(title: string, value?: string, o?: { area?: boolean; placeholder?: string }): Promise<string | null>;
  charPicker(o: { title?: string; selected?: string[]; multi?: boolean; note?: (c: Char) => string; onDone: (ids: string[]) => void }): void;
  form(obj: object, defs: (FormDef | false | null | undefined)[], onChange?: (obj: object) => void): HTMLElement;
}
export interface PromptPiece { where: 'before' | 'depth' | 'end'; role?: string; content: string; depth?: number; order?: number; src?: string }
export interface PromptInfo { chat: ChatX; char?: CharX; persona?: Persona; type?: string; commit?: boolean; ctx?: MacroCtx }
export interface Command { owner: string; help: string; run(arg: string): unknown }
export interface Action { owner: string; id: string; label: string; icon?: string; run(msg: Msg, chat: ChatX): unknown }
export interface ComposerItem { owner: string; id: string; label: string; icon?: string; run(): unknown }
export interface Panel { owner: string; id: string; title: string; icon?: string; open?: boolean; render(chat: ChatX, msgs: Msg[]): Node }
export interface FilterInfo { msg?: Msg; chat?: ChatX; role?: string }
export interface TranslateOpt { chat?: ChatX | null; context?: { name: string; text?: string; mes?: string }[]; signal?: AbortSignal; name?: string | null; preset?: string; conn?: Conn | null }
export interface Hooks {
  X: {
    commands: Map<string, Command>;
    macros: Map<string, { owner: string; fn(args: string[]): string }>;
    panels: Panel[]; actions: Action[]; composer: ComposerItem[];
    filters: { owner: string; fn(text: string, info?: FilterInfo): string }[];
    prompt: { owner: string; fn(info: PromptInfo): PromptPiece[] }[];
    studio: { owner: string; title: string; render(): Node }[];
    before: { owner: string; fn(a: { chat?: ChatX; msgs?: Msg[]; type?: string; signal?: AbortSignal }): Promise<void> }[];
    loreVec: ((entryId: string) => boolean) | null;
    translate: ((text: string, language?: string, o?: TranslateOpt) => Promise<string>) | null;
  };
}
export type MacroCtx = Record<string, unknown> & { char?: string; user?: string };
export interface Engine {
  quickCall(system: string, user: string, o?: { maxTokens?: number; signal?: AbortSignal; conn?: Conn | null }): Promise<string>;
  tokens(text: string): number;
  macro(text: string, c?: MacroCtx): string;
  makeCtx(o: { chat: ChatX; char?: CharX; chars: CharX[]; persona?: Persona; msgs: Msg[] }): MacroCtx;
  activeBooks(chat: ChatX, chars: CharX[], persona?: Persona): LoreBook[];
}
export interface ChatApi {
  current(): { chat: ChatX | null; msgs: Msg[]; busy: boolean };
  roomName(c: ChatX): string;
  generate(type?: string): Promise<unknown>;
  insert(text: string): void;
  save(): Promise<unknown> | null;
  redraw(): void;
  setStatus(t: string): void;
  scrollTo(id: string): void;
}
export interface ChatModX { chatApi: ChatApi }

/** 이 묶음의 기능이 공통으로 쓰는 옛 모듈. feature.needs 에 펼쳐 넣는다 */
export const NEEDS = ['core', 'ui', 'hooks', 'engine', 'chat'];
export const B = {
  get core() { return mod<CoreX>('core'); },
  get S() { return mod<CoreX>('core').S; },
  /** 창 · 메뉴 · 알림은 공용 부품(src/ui), 화면 이동과 옛 폼 · 옛 창(Node 본문)은 다리 */
  get ui(): UiX { const u = mod<UiX>('ui'); return { route: u.route, go: u.go, modal: u.modal, form: u.form, toast, menu, confirmBox, promptBox, charPicker }; },
  get X() { return mod<Hooks>('hooks').X; },
  get engine() { return mod<Engine>('engine'); },
  get chat() { return mod<ChatModX>('chat').chatApi; },
};
/** 기능의 스타일 파일을 한 번만 건다 (옛 모듈이 하던 일) */
export function useCss(file: string) {
  if (document.querySelector(`link[rel="stylesheet"][href$="css/${file}"]`)) return;
  const l = document.createElement('link'); l.rel = 'stylesheet'; l.href = `/css/${file}`; document.head.append(l);
}
export const errMsg = (e: unknown) => e instanceof Error ? e.message : String(e);
export const isAbort = (e: unknown) => e instanceof Error && e.name === 'AbortError';
