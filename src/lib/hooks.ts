// ── Dreamland hooks: 확장 기능이 끼어드는 지점들의 등록부 ── (옛 js/hooks.js 그대로)
// 각 항목은 { owner, ... } 형태. owner 는 확장 id.
import type { Char, Chat, Conn, Msg, Persona, Theme } from './types';
import type { Ctx } from './engine';

export interface Owned { owner: string }
/** 명령어 · 확장이 받는 대화 화면 조작 (src/chat/actions.tsx 의 chatApi) */
export interface CmdApi {
  current(): { chat: Chat | null; msgs: Msg[]; busy: boolean };
  reveal(id: string): boolean; roomName(c: Chat): string; groupTitle(c: Chat): string;
  generate(type?: string): unknown; send(text: string): unknown; insert(text: string): void;
  addSystemMessage(text: string): unknown; save(): unknown; redraw(): void; setStatus(t: string): void;
  scrollTo(id: string): void; openDrawer(): void;
}
export interface Command extends Owned { help?: string; args?: string; run(arg: string, api: CmdApi): unknown; [k: string]: unknown }
export interface Macro extends Owned { fn(args: unknown, ctx?: unknown): unknown }
export interface Panel extends Owned { id?: string; title?: string; icon?: string; render(chat: Chat, msgs: Msg[]): Node | null | undefined; [k: string]: unknown }
export interface Action extends Owned { id?: string; label?: string; icon?: string; run(msg: Msg, chat: Chat | null): unknown; [k: string]: unknown }
export interface ExtPage extends Owned { id: string; label?: string; icon?: string; render(root: HTMLElement): unknown; [k: string]: unknown }
export interface FilterInfo { role?: string; msg?: Msg; chat?: Chat | null }
export interface Filter extends Owned { fn(text: string, info?: FilterInfo): unknown }
export interface ThemeReg extends Owned { theme: Theme }
export interface Composer extends Owned { id?: string; label?: string; icon?: string; run(input: unknown): unknown; [k: string]: unknown }
export interface PromptPiece { where: 'before' | 'depth' | 'end'; role?: string; content: string; depth?: number; order?: number; src?: string }
/** 프롬프트 조각을 만들 때 받는 것 (engine.buildPrompt 가 넘긴다) */
export interface PromptInfo { chat: Chat; char: Char; chars: Char[]; persona: Persona; history: { role: string; content: string }[]; msgs: Msg[]; type: string; commit?: boolean; ctx: Ctx }
export interface PromptHook extends Owned { fn(info: PromptInfo): PromptPiece[] | null | undefined | void }
export interface StudioTab extends Owned { title: string; render(): Node; [k: string]: unknown }
export interface BeforeHook extends Owned { fn(o: { chat: Chat; msgs: Msg[]; type: string; signal?: AbortSignal; chars?: Char[]; persona?: Persona }): Promise<unknown> }

export interface TranslateOpt { chat?: Chat | null; context?: { name: string; text?: string; mes?: string }[]; signal?: AbortSignal; name?: string | null; preset?: string; conn?: Conn | null }
export interface Hooks {
  commands: Map<string, Command>; macros: Map<string, Macro>;
  panels: Panel[]; actions: Action[]; pages: ExtPage[]; filters: Filter[]; themes: ThemeReg[]; composer: Composer[];
  prompt: PromptHook[]; studio: StudioTab[]; before: BeforeHook[];
  loreVec: ((entryId: string) => boolean) | null;
  translate: ((text: string, language?: string, o?: TranslateOpt) => Promise<string>) | null;
  covered: ((chat: Chat) => number) | null;
}

export const X: Hooks = {
  commands: new Map(),   // '/이름' → { owner, help, run(arg, ctx) }
  macros: new Map(),     // 이름 → { owner, fn(args, ctx) }
  panels: [],            // { owner, id, title, icon, render(chat, msgs) → Node }
  actions: [],           // { owner, id, label, icon, run(msg, chat) }
  pages: [],             // { owner, id, label, icon, render(root) }
  filters: [],           // { owner, fn(text, info) → text }   화면 표시 직전 텍스트 변환
  themes: [],            // { owner, theme }
  composer: [],          // { owner, id, label, icon, run(input) }   입력창 + 메뉴 항목
  prompt: [],            // { owner, fn(info) → [{ where: 'before'|'depth'|'end', role, content, depth, order, src }] }  프롬프트에 덧붙일 조각
  studio: [],            // { owner, title, render() → Node }  기능 화면의 탭
  before: [],            // { owner, fn({ chat, msgs, type, signal }) → Promise }  프롬프트를 조립하기 직전에 기다려 주는 준비 (임베딩 왕복 등)
  loreVec: null,         // (entryId) → 벡터 검색이 이번 턴에 깨운 로어북 항목인가
  translate: null,       // (text, language, { chat, context, signal }) → 번역문. 번역 기능이 등록한다
  covered: null,         // (chat) → 장기기억이 기록해 둔 턴 수
};
type OwnedList = 'panels' | 'actions' | 'pages' | 'filters' | 'themes' | 'composer' | 'prompt' | 'before';
export function dropOwner(owner: string) {
  for (const [k, v] of X.commands) if (v.owner === owner) X.commands.delete(k);
  for (const [k, v] of X.macros) if (v.owner === owner) X.macros.delete(k);
  const bag = X as unknown as Record<OwnedList, Owned[]>;
  for (const key of ['panels', 'actions', 'pages', 'filters', 'themes', 'composer', 'prompt', 'before'] as OwnedList[]) bag[key] = bag[key].filter(v => v.owner !== owner);
}
export function runFilters(text: string, info?: FilterInfo) {
  for (const f of X.filters) { try { const r = f.fn(text, info); if (typeof r === 'string') text = r; } catch (e) { console.warn('[확장 필터]', f.owner, e); } }
  return text;
}
