// 새 대화방 열기 (옛 js/chat.js 의 startChat · startMenu). 2단계에서 L.chat · B.oldChat 대신 이것을 부른다
import { S, emit, newChat, newMsg, now } from '../lib/core';
import { makeCtx, macro } from '../lib/engine';
import { menu } from '../ui';
import { go } from '../lib/router';
import type { Chat } from '../lib/types';
import { t } from '../i18n';

/** 새 대화: 어떤 모드로 시작할지 고르기 */
export function startMenu(anchor: Element, charIds: string[]) {
  menu(anchor, [{ label: t('chat.start.rp'), ic: 'book', hint: t('chat.menu.likeNovel'), onclick: () => { void startChat(charIds, { mode: 'rp' }); } }, { label: t('chat.start.talk'), ic: 'chat', hint: t('chat.menu.likeMessenger'), onclick: () => { void startChat(charIds, { mode: 'talk' }); } },
    { label: t('chat.start.temp'), ic: 'sparkle', hint: t('chat.start.tempHint'), onclick: () => { void startChat(charIds, { temp: true }); } }]);
}

/** 캐릭터들로 새 대화방을 만든다. 첫 인사말(대체 인사말은 넘겨 보기)을 넣어 저장하고, open 이면 그 방으로 간다 */
/** 임시 채팅을 지운다 (지금 열려 있는 방은 빼고). 앱을 열 때와 다른 방을 열 때 부른다 */
export async function sweepTemp(keepId = '') {
  for (const c of [...S.chats]) if (c.temp && c.id !== keepId) { try { await S.remove('chats', c.id); } catch (e) { console.warn('[임시 채팅]', e); } }
}
export async function startChat(charIds: string[], { open = true, mode, temp = false }: { open?: boolean; mode?: 'rp' | 'talk'; temp?: boolean } = {}): Promise<Chat | null> {
  const chars = charIds.map(id => S.get('chars', id)).filter(c => !!c);
  if (!chars.length) return null;
  const chat = newChat({ charIds: chars.map(c => c.id), mode: mode || S.settings.defaultMode || 'rp', ...(temp ? { temp: true, name: t('chat.start.temp') } : {}) });
  const msgs = [];
  const persona = S.persona(chat);
  const first = chars[0];
  const greets = [first.firstMes, ...(first.altGreetings || [])].filter(g => g && g.trim());
  if (greets.length) {
    const ctx = makeCtx({ chat: chat as unknown as Parameters<typeof makeCtx>[0]['chat'], char: first, chars, persona, msgs: [] });
    const m = newMsg('assistant', '', { charId: first.id, name: first.name, swipes: greets.map(g => ({ text: macro(g, ctx), ts: now() })), greeting: true });
    msgs.push(m);
  }
  await S.saveMsgs(chat, msgs);
  if (open) go('chat', chat.id);
  emit('chat:new', chat);
  return chat;
}
