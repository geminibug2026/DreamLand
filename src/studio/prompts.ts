// 프롬프트에 싣는 것 (옛 js/studio.js 맨 위). 등록은 registerStudioPrompts() 를 부를 때만 한다 — 켜는 곳은 src/features/studioPrompts.tsx
import { S } from '../lib/core';
import { X } from '../lib/hooks';
import { macro } from '../lib/engine';
import { Memory } from '../memoria/engine';
import { Illust } from '../lib/illust';
import type { PromptPiece } from '../lib/hooks';
import type { Chat, Msg } from '../lib/types';

export const TALK_PROMPT = `[Conversation mode] This is a real-time messenger chat between {{char}} and {{user}}, not a novel. Reply the way {{char}} would text: one to three short messages, each on its own line, casual and fully in character. No narration, no scene description, no quotation marks around speech. A brief action may appear occasionally as *a few words in asterisks* on its own line.`;

interface PromptArgs { chat: Chat; msgs: Msg[]; type: string; ctx: Parameters<typeof macro>[1] }
type Piece = PromptPiece;

/** 옛 studio.js 가 뜨면서 하던 등록: X.covered · 'mode' · 'illust' 프롬프트 조각.
 *  옛 판의 'assets' 조각은 src/assets/logic.ts 가 이미 같은 주인 이름으로 갈아 끼우므로 여기서는 싣지 않는다 */
export function registerStudioPrompts() {
  X.covered = (chat: { id: string }) => Memory.get(chat.id)?.turns.length || 0;
  X.prompt = X.prompt.filter((p: { owner?: string }) => p.owner !== 'mode' && p.owner !== 'illust');
  X.prompt.push(
    { owner: 'mode', fn: (i): Piece[] => { const { chat, ctx } = i as unknown as PromptArgs; return chat.mode === 'talk' ? [{ where: 'end', content: macro(String(S.settings.modes.talkPrompt || TALK_PROMPT), ctx), src: '대화 모드 지시' }] : []; } },
    { owner: 'illust', fn: (i): Piece[] => { const { chat, msgs, type } = i as unknown as PromptArgs; return (type === 'normal' || type === 'regen') && Illust.wantsPlan(chat, msgs, type) ? [{ where: 'end', content: Illust.instruction(chat), src: '삽화 계획 지시' }] : []; } },
  );
}
