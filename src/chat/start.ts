// 새 대화방 열기 (옛 js/chat.js 의 startChat · startMenu). 2단계에서 L.chat · B.oldChat 대신 이것을 부른다
import { S, newChat, newMsg, now } from '../lib/core';
import { makeCtx, macro } from '../lib/engine';
import { menu } from '../ui';
import { go } from '../lib/router';
import type { Chat } from '../lib/types';

/** 새 대화: 어떤 모드로 시작할지 고르기 */
export function startMenu(anchor: Element, charIds: string[]) {
  menu(anchor, [{ label: 'RP 모드', ic: 'book', hint: '소설처럼', onclick: () => { void startChat(charIds, { mode: 'rp' }); } }, { label: '대화 모드', ic: 'chat', hint: '메신저처럼', onclick: () => { void startChat(charIds, { mode: 'talk' }); } }]);
}

/** 캐릭터들로 새 대화방을 만든다. 첫 인사말(대체 인사말은 넘겨 보기)을 넣어 저장하고, open 이면 그 방으로 간다 */
export async function startChat(charIds: string[], { open = true, mode }: { open?: boolean; mode?: 'rp' | 'talk' } = {}): Promise<Chat | null> {
  const chars = charIds.map(id => S.get('chars', id)).filter(c => !!c);
  if (!chars.length) return null;
  const chat = newChat({ charIds: chars.map(c => c.id), mode: mode || S.settings.defaultMode || 'rp' });
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
  return chat;
}
