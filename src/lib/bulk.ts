// 캐릭터 여러 개를 한꺼번에: 카드로 내보내기(ZIP) · 지우기(대화방 포함)
import { S, download } from './core';
import { Assets, zip } from './assets';
import { exportCharPng } from './cards';
import type { Char } from './types';
import { cur } from '../chat/store';

const safeName = (s: string) => s.replace(/[\\/:*?"<>|]+/g, '_').trim().slice(0, 80) || 'character';
/** 고른 캐릭터들을 PNG 카드로 만들어 ZIP 하나로 내려받는다. 반환: 담은 수 */
export async function exportChars(ids: string[]): Promise<number> {
  const files: { name: string; data: Uint8Array }[] = [], used = new Set<string>();
  for (const id of ids) {
    const c = S.get('chars', id); if (!c) continue;
    let name = safeName(c.name), n = 2; while (used.has(name.toLowerCase())) name = `${safeName(c.name)} (${n++})`; used.add(name.toLowerCase());
    files.push({ name: name + '.png', data: await exportCharPng(c as Parameters<typeof exportCharPng>[0]) });
  }
  if (files.length) (download as unknown as (name: string, data: Blob, type?: string) => void)(`dreamland-characters-${files.length}.zip`, zip(files), 'application/zip');
  return files.length;
}
/** 그 캐릭터만 나오는 대화방 수 (지우면 함께 지워진다) */
export const chatsOnlyOf = (ids: string[]) => { const set = new Set(ids); return S.chats.filter(c => c.charIds.length && c.charIds.every(i => set.has(i))); };
/** 그 캐릭터가 나오는 모든 대화방 (혼자 · 그룹) */
export const chatsWith = (ids: string[]) => { const set = new Set(ids); return S.chats.filter(c => c.charIds.some(i => set.has(i))); };
/** 고른 캐릭터들을 지운다: 에셋 · 그 캐릭터 전용 정규식(전역으로 돌려 끔).
 *  withChats 면 그 캐릭터들만 있는 대화방도 지우고 그룹 방에서는 그 사람만 뺀다. 아니면 대화방은 그대로 둔다. 반환: 지운 캐릭터 수 · 대화방 수 */
export async function deleteChars(ids: string[], { withChats = true }: { withChats?: boolean } = {}): Promise<{ chars: number; chats: number }> {
  let n = 0, rooms = 0;
  if (withChats) for (const chat of chatsOnlyOf(ids)) {
    if (cur.chat?.id === chat.id) { cur.abort?.abort(); cur.chat = null; }
    if (S.settings.lastChat === chat.id) S.set({ lastChat: '' });
    await Assets.removeOwner('chat:' + chat.id).catch(() => { }); await S.remove('chats', chat.id); rooms++;
  }
  for (const id of ids) {
    const c = S.get('chars', id) as Char | undefined; if (!c) continue;
    await Assets.removeOwner(Assets.ownerOfChar(c.id)).catch(() => { });
    if (S.settings.assets?.chars) delete S.settings.assets.chars[c.id];
    for (const r of S.regex) if (r.scope === c.id) { r.scope = 'global'; r.enabled = false; await S.save('regex', r, true); }
    if (withChats) for (const chat of S.chats) if (chat.charIds.includes(c.id)) { chat.charIds = chat.charIds.filter(i => i !== c.id); await S.save('chats', chat, true); }   // 그룹 방에서는 그 사람만 뺀다
    await S.remove('chars', c.id); n++;
  }
  return { chars: n, chats: rooms };
}
