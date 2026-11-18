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
import { t, tn } from '../i18n';
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

/** [범위, 글자 키] — 그릴 때 t() */
export const SCOPES: [Scope, string][] = [['global', 'modules.scope.global'], ['char', 'modules.scope.char'], ['chat', 'modules.scope.chat']];
const MODE_LABEL: Record<string, string> = { store: 'modules.mode.store', display: 'modules.mode.display', prompt: 'modules.mode.prompt', both: 'modules.mode.both' };
export const modeLabel = (mode: string) => MODE_LABEL[mode] ? t(MODE_LABEL[mode]) : mode;
export function scopeLabel(m: Module) {
  if (m.scope === 'global') return t('modules.scopeLabel.global');
  if (m.scope === 'char') { const cs = m.charIds.map(i => S.get('chars', i)).filter((c): c is Char => !!c); return cs.length ? (cs.length > 1 ? tn('modules.scopeLabel.charMany', cs.length - 1, { name: cs[0].name }) : t('modules.scopeLabel.charOne', { name: cs[0].name })) : t('modules.scopeLabel.charNone'); }
  const n = m.chatIds.filter(i => S.get('chats', i)).length; return n ? tn('modules.scopeLabel.chats', n) : t('modules.scopeLabel.chatNone');
}
export function roomNote(m: Module) {
  const v = Object.entries(m.rooms).filter(([i]) => S.get('chats', i)), a = v.filter(([, on]) => on).length, b = v.length - a;
  return [a && tn('modules.roomNote.on', a), b && tn('modules.roomNote.off', b)].filter(Boolean).join(' · ');
}
export const roomTitle = (c: ChatX) => `${chatApi.groupTitle(c)} · ${chatApi.roomName(c)}`;
export const verLabel = (v: string) => 'v' + v.replace(/^v/i, '');

export { debounce } from '../studio/parts';
