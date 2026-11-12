// memory.js 2696–2728 줄(이벤트)을 그대로 옮긴 것
import { S, emit, on, msgText } from '../../lib/core';
import type { ChatM, Mem, Msg } from '../types';
import type { PromptMsg } from './part5';
import type { Unused } from './base';
import { Memory } from './memory';
import { G, cache, visibleProse, updateTimers } from './base';

/** 이벤트가 실어 오는 것 */
interface PromptReady { messages?: PromptMsg[]; type?: string }
interface MsgEvent { readonly chat?: ChatM; readonly msg?: Msg | null; readonly msgs?: Msg[] }

// ════════ 이벤트 ════════
// 보내는 대화에서 삼갈 표현 빼기 (설정 banInChat) — 대화 기록에서 온 답변만 고친다. 저장된 대화는 그대로다
on<PromptReady | undefined>('prompt:ready', x => { try { if (Array.isArray(x?.messages)) Memory.maskBannedInPrompt(x.messages.filter(m => m && (m.src == null || m.src === 'history')), x.type); } catch (e) { console.warn('[장기기억]', e); } });
// 메시지를 보내자마자 그 입력의 질의 임베딩을 시작해 둔다 — 답변 전 준비(prepare)가 같은 호출을 기다리고, 늦으면 다음 턴의 보조 질의로 쓰인다
on<{ msg?: Msg } | undefined>('message:sent', x => {
  try { const cfg = Memory.cfg(), m = x?.msg; if (!cfg.enabled || cfg.embed.mode !== 'api' || !m || m.hidden || Memory.isSideMessage(m)) return; const t = visibleProse(msgText(m)); if (t.trim()) Memory.embedQueriesViaApi([t]).catch(() => { }); }
  catch (e) { console.warn('[장기기억]', e); }
});
// 대화를 열면 저장된 턴 기록을 그 대화의 메시지와 맞춘다 (옛 해시 옮기기 · 요약 복구 · 이름 접기 포함). 설정 세트는 화면 쪽(memoria-settings)이 같은 이벤트에서 갈아 끼운다
on<ChatM | null | undefined>('chat:open', async chat => {
  try {
    for (const t of updateTimers.values()) clearTimeout(t); updateTimers.clear(); G.lastQuietPrompt = null;
    if (!chat?.id) return;
    const mem = await Memory.load(chat.id), msgs = await S.msgs(chat.id);
    if (!Array.isArray(msgs) || (!msgs.length && mem.turns.length)) return;   // 메시지를 읽지 못했을 때 기록을 통째로 걷어내지 않는다
    if (Memory.reconcile(mem, msgs)) await Memory.save(mem);
  } catch (e: any) { console.warn('[장기기억]', e); Memory.logActivity('error', `이벤트 처리 중 오류: ${e?.message || e}`); }
});
// 대화 화면이 메시지를 고치거나(수정 · 스와이프 · 삭제 · 다른 기능의 갱신) 알려 올 때 — { chat, msg, msgs }. msgs 가 없으면 저장된 대화에서 찾는다
const withMsgs = async (x: MsgEvent | undefined, fn: (chat: ChatM, msgs: Msg[], msg: Msg | null, mem: Mem) => unknown) => {
  try {
    if (!x?.chat?.id || !Memory.cfg().enabled) return;
    const msgs = Array.isArray(x.msgs) ? x.msgs : await S.msgs(x.chat.id), msg = x.msg ? msgs.find(m => m.id === x.msg!.id) || null : null;
    await fn(x.chat, msgs, msg, await Memory.load(x.chat.id));
  } catch (e: any) { console.warn('[장기기억]', e); Memory.logActivity('error', `이벤트 처리 중 오류: ${e?.message || e}`); }
};
on<MsgEvent | undefined>('message:swiped', x => withMsgs(x, async (chat, msgs, msg, mem): Promise<Unused<typeof msgs>> => { if (msg && mem.turns.some(t => t.msgId === msg.id)) { Memory.dropTurn(mem, msg.id); await Memory.save(mem); } emit('memory:check', { chatId: chat.id, msgId: msg?.id }); }));
on<MsgEvent | undefined>('message:edited', x => withMsgs(x, (chat, msgs, msg) => msg ? Memory.onMessageEdited(chat, msgs, msg) : null));
on<MsgEvent | undefined>('message:updated', x => withMsgs(x, (chat, msgs, msg) => { if (msg) Memory.onMessageUpdated(chat, msgs, msg); emit('memory:check', { chatId: chat.id, msgId: msg?.id }); }));
on<MsgEvent | undefined>('message:deleted', x => withMsgs(x, async (chat, msgs, msg, mem): Promise<Unused<typeof chat | typeof msg>> => { if (Memory.reconcile(mem, msgs)) await Memory.save(mem); }));

on<string>('chat:deleted', id => { cache.delete(id); });
on('data:imported', () => { cache.clear(); });   // 백업을 복원하면 옛 서고를 들고 있지 않는다
