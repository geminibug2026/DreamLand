// 모듈 화면이 쓰는 자료 꼴과 다리. 켜고 끄는 로직 · 파일 읽기는 옛 f-modules.js 의 Modules 를 그대로 부른다
import { mod } from '../legacy';
import type { Char, Chat } from '../types';
import { S, plain, type ChatX, type Lore, type Obj, type Regex } from '../studio/bridge';

export interface Quick { label: string; text: string }
export type Scope = 'global' | 'char' | 'chat';
export interface Module {
  id: string; name: string; description: string; author: string; version: string; on: boolean;
  scope: Scope; charIds: string[]; chatIds: string[]; rooms: Record<string, boolean>;
  lore: string[]; regex: string[]; quick: Quick[]; css: string; cssOn: boolean; assetCount: number; imported: boolean; createdAt: number; updatedAt: number;
}
export interface Plan {
  source: string; module: { name: string; description: string; author: string; version: string; quick: Quick[]; css: string };
  lore: { name: string; entries: { constant?: boolean }[] }[]; regex: { name: string; mode: string; find: string }[]; assets: { name: string; data: string }[]; notes: string[];
}
export type ItemState = 'mod' | 'muted' | 'user' | 'off';
export type Kind = 'lore' | 'regex';
interface ModulesApi {
  list: Module[];
  load(): Promise<void>; byId(id: string): Module | undefined; save(m: Module): Promise<unknown>;
  create(o?: Partial<Module>): Promise<Module>; remove(m: Module, o?: { withItems?: boolean }): Promise<void>; duplicate(m: Module): Promise<Module>;
  readPack(j: unknown, base?: string): Plan; installPack(plan: Plan, o?: { replace?: string }): Promise<{ module: Module; kept: { lore: number; regex: number } }>;
  exportModule(m: Module): Promise<void>; setRoom(m: Module, chat: Chat, want: boolean): Promise<unknown>;
  handOver(kind: Kind, id: string): Promise<unknown>; wake(kind: Kind, id: string): Promise<unknown>;
  effective(m: Module, chat: Chat | null): boolean; loreState(id: string): ItemState; regexState(r: Regex): ItemState; ownerOf(m: Module): string;
}
export interface Asset { id: string; owner: string; name: string; data: string; ver?: string }
interface AssetsApi {
  load(owners: string[]): Promise<void>; reload(owners: string[]): Promise<void>; list(owner: string): Asset[];
  add(owner: string, name: string, data: string): Promise<Asset>; update(a: Asset): Promise<void>; remove(a: Asset): Promise<void>;
  addFiles(owner: string, files: File[]): Promise<number>; cleanName(name: string): string; ownerOfChar(id: string): string;
}
interface ChatApi { groupTitle(c: Chat): string; roomName(c: Chat): string }

export const needs = ['f-modules', 'assets', 'chat'];
export const M = () => mod<{ Modules: ModulesApi }>('f-modules').Modules;
export const MOD_ASSET_PROMPT = () => mod<{ MOD_ASSET_PROMPT: string }>('f-modules').MOD_ASSET_PROMPT;
export const Assets = () => mod<{ Assets: AssetsApi }>('assets').Assets;
const chatApi = () => mod<{ chatApi: ChatApi }>('chat').chatApi;

/** 모듈 설정 한 줄 (에셋 안내문 등). 옛 cfg() 와 같은 자리 */
export function cfg(): Obj {
  const st = S().settings;
  if (!plain(st.modules)) st.modules = {};
  return st.modules as Obj;
}
export const list = <T,>(v: unknown): T[] => Array.isArray(v) ? v as T[] : [];
export const text = (v: unknown, max = 400000) => (typeof v === 'string' ? v : v == null ? '' : typeof v === 'object' ? '' : String(v)).slice(0, max);
export const booksOf = (m: Module) => m.lore.map(id => S().get<Lore>('lore', id)).filter((b): b is Lore => !!b);
export const regexOf = (m: Module) => m.regex.map(id => S().get<Regex>('regex', id)).filter((r): r is Regex => !!r);
export const counts = (m: Module) => ({ lore: booksOf(m).length, regex: regexOf(m).length, assets: m.assetCount || 0, quick: m.quick.length, css: !!m.css.trim() });
/** 이 모듈과 함께 들어왔고 다른 모듈이 쓰지 않는 항목 */
export function ownItems(m: Module) {
  const used = (key: Kind, id: string) => M().list.some(o => o !== m && o[key].includes(id));
  return { lore: booksOf(m).filter(b => b.mod === m.id && !used('lore', b.id)), regex: regexOf(m).filter(r => r.mod === m.id && !used('regex', r.id)) };
}

export const SCOPES: [Scope, string][] = [['global', '전역'], ['char', '캐릭터'], ['chat', '대화방']];
export const MODE_LABEL: Record<string, string> = { store: '원문 변경', display: '화면만', prompt: '전송만', both: '화면+전송' };
export function scopeLabel(m: Module) {
  if (m.scope === 'global') return '전역 · 모든 대화';
  if (m.scope === 'char') { const cs = m.charIds.map(i => S().get<Char>('chars', i)).filter((c): c is Char => !!c); return cs.length ? `캐릭터 · ${cs[0].name}${cs.length > 1 ? ` 외 ${cs.length - 1}명` : ''}` : '캐릭터 · 아직 고르지 않음'; }
  const n = m.chatIds.filter(i => S().get('chats', i)).length; return n ? `대화방 ${n}곳` : '대화방 · 아직 고르지 않음';
}
export function roomNote(m: Module) {
  const v = Object.entries(m.rooms).filter(([i]) => S().get('chats', i)), a = v.filter(([, on]) => on).length, b = v.length - a;
  return [a && `따로 켠 방 ${a}곳`, b && `따로 끈 방 ${b}곳`].filter(Boolean).join(' · ');
}
export const roomTitle = (c: ChatX) => `${chatApi().groupTitle(c)} · ${chatApi().roomName(c)}`;
export const verLabel = (v: string) => 'v' + v.replace(/^v/i, '');

export { debounce } from '../studio/bridge';
