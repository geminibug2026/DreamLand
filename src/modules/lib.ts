// 모듈 화면이 쓰는 자료 꼴과 표시용 도우미. 켜고 끄는 로직 · 파일 읽기는 ./logic 의 Modules
import type { Char } from '../types';
import type { ChatX, Lore, Obj, Regex } from '../studio/parts';
import { S } from '../lib/core';
import { plain } from '../studio/parts';

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
export type { Asset } from '../lib/types';
import { Modules } from './logic';
import { chatApi } from '../chat/actions';
export { Modules, MOD_ASSET_PROMPT } from './logic';
export { Assets } from '../lib/assets';

/** 모듈 설정 한 줄 (에셋 안내문 등). 옛 cfg() 와 같은 자리 */
export function cfg(): Obj {
  const st = S.settings;
  if (!plain(st.modules)) st.modules = {};
  return st.modules as Obj;
}
export const list = <T,>(v: unknown): T[] => Array.isArray(v) ? v as T[] : [];
export const text = (v: unknown, max = 400000) => (typeof v === 'string' ? v : v == null ? '' : typeof v === 'object' ? '' : String(v)).slice(0, max);
export const booksOf = (m: Module) => m.lore.map(id => S.get('lore', id)).filter((b): b is Lore => !!b);
export const regexOf = (m: Module) => m.regex.map(id => S.get('regex', id)).filter((r): r is Regex => !!r);
export const counts = (m: Module) => ({ lore: booksOf(m).length, regex: regexOf(m).length, assets: m.assetCount || 0, quick: m.quick.length, css: !!m.css.trim() });
/** 이 모듈과 함께 들어왔고 다른 모듈이 쓰지 않는 항목 */
export function ownItems(m: Module) {
  const used = (key: Kind, id: string) => Modules.list.some(o => o !== m && o[key].includes(id));
  return { lore: booksOf(m).filter(b => b.mod === m.id && !used('lore', b.id)), regex: regexOf(m).filter(r => r.mod === m.id && !used('regex', r.id)) };
}

export const SCOPES: [Scope, string][] = [['global', '전역'], ['char', '캐릭터'], ['chat', '대화방']];
export const MODE_LABEL: Record<string, string> = { store: '원문 변경', display: '화면만', prompt: '전송만', both: '화면+전송' };
export function scopeLabel(m: Module) {
  if (m.scope === 'global') return '전역 · 모든 대화';
  if (m.scope === 'char') { const cs = m.charIds.map(i => S.get('chars', i)).filter((c): c is Char => !!c); return cs.length ? `캐릭터 · ${cs[0].name}${cs.length > 1 ? ` 외 ${cs.length - 1}명` : ''}` : '캐릭터 · 아직 고르지 않음'; }
  const n = m.chatIds.filter(i => S.get('chats', i)).length; return n ? `대화방 ${n}곳` : '대화방 · 아직 고르지 않음';
}
export function roomNote(m: Module) {
  const v = Object.entries(m.rooms).filter(([i]) => S.get('chats', i)), a = v.filter(([, on]) => on).length, b = v.length - a;
  return [a && `따로 켠 방 ${a}곳`, b && `따로 끈 방 ${b}곳`].filter(Boolean).join(' · ');
}
export const roomTitle = (c: ChatX) => `${chatApi.groupTitle(c)} · ${chatApi.roomName(c)}`;
export const verLabel = (v: string) => 'v' + v.replace(/^v/i, '');

export { debounce } from '../studio/parts';
