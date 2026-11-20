// 이어진 방을 실제로 잇고 읽는 일: 묶기 · 풀기 · 저 방의 최근 일 간추리기(추가 호출 없음) · 옮겨 말하기 · 장면 건네기(호출 1번) · 돌아오기
import { DB, S, emit, newMsg, msgText } from '../lib/core';
import { macro, makeCtx, quickCall } from '../lib/engine';
import { go } from '../lib/router';
import type { Char, Chat, Msg } from '../lib/types';
import type { PromptPiece } from '../lib/hooks';
import { chatApi, charsOf, modeOf, roomName, titleOf } from '../chat/actions';
import { startChat } from '../chat/start';
import { BLEND_SYSTEM, SHARE_N, STAGE_SYSTEM, frameBlock, linesDigest, matchRoom, memDigest, parseDraft, type MemLike, type StageDraft } from './link';
import { thOf, thPeek, type ThCard, type ThChat, type ThMsg } from './types';

export const label = (c: Chat) => roomName(c) || titleOf(c);
/** 이어진 방들 (지워진 방은 빠진다) */
export const linked = (chat?: Chat | null): Chat[] => (thPeek(chat).links || []).map(id => S.get('chats', id)).filter((c): c is Chat => !!c);
/** 이을 수 있는 방: 같은 캐릭터가 한 명이라도 있는, 아직 잇지 않은 다른 방 (임시 방 제외) — 최근 것부터 */
export const candidates = (chat: Chat): Chat[] => { const has = new Set(thPeek(chat).links || []); return S.chats.filter(c => c.id !== chat.id && !c.temp && !has.has(c.id) && c.charIds.some(id => chat.charIds.includes(id))).sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0)); };
export async function link(a: Chat, b: Chat) {
  for (const [x, y] of [[a, b], [b, a]]) { const t = thOf(x); t.links = [...new Set([...(t.links || []), y.id])]; await S.save('chats', x, true); }
  emit('threads:changed', a.id);
}
export async function unlink(a: Chat, b: Chat) {
  for (const [x, y] of [[a, b], [b, a]]) { const t = thOf(x); t.links = (t.links || []).filter(id => id !== y.id); if (t.origin?.id === y.id) delete t.origin; await S.save('chats', x, true); }
  emit('threads:changed', a.id);
}
/** 방이 지워졌다: 다른 방들에 남은 끈과 "돌아갈 곳"을 걷는다 */
export async function forget(id: string) {
  digests.delete(id);
  for (const c of S.chats) { const t = (c as ThChat).th; if (!t) continue; const had = t.links?.includes(id) || t.origin?.id === id; if (!had) continue; t.links = (t.links || []).filter(x => x !== id); if (t.origin?.id === id) delete t.origin; await S.save('chats', c, true); }
}

// ── 저 방의 최근 일 ── 프롬프트를 만드는 자리는 기다려 주지 않으므로, 답변 전 준비(X.before)에서 미리 읽어 둔다. 저 방이 그대로면 다시 읽지 않는다
const digests = new Map<string, { key: string; rows: string[]; kind: 'lines' | 'memory' }>();
const ago = (ts: number) => { const m = Math.max(0, (Date.now() - ts) / 60000); return m < 90 ? `${Math.max(1, Math.round(m))} min ago` : m < 2880 ? `${Math.round(m / 60)} hours ago` : `${Math.round(m / 1440)} days ago`; };
const lineOf = (other: Chat, m: Msg) => ({ who: m.role === 'user' ? S.persona(other).name : m.name || S.get('chars', m.charId)?.name || 'Narrator', text: m.role === 'system' ? `[${msgText(m)}]` : msgText(m) });
/** 이 방이 받아 올 것들을 읽어 둔다 */
export async function prep(chat: Chat) {
  const t = thPeek(chat), share = t.share || 'lines'; if (share === 'off') return;
  const n = Math.max(1, Math.min(20, +(t.shareN ?? SHARE_N) || SHARE_N));
  for (const o of linked(chat)) {
    const key = `${o.updatedAt}:${o.count}:${share}:${n}`; if (digests.get(o.id)?.key === key) continue;
    try {
      const mem = await DB.get('mem', o.id).catch(() => null) as MemLike | null;
      let rows: string[] = [], kind: 'lines' | 'memory' = share;
      if (share === 'memory') rows = memDigest(mem, n);
      else {
        const list = (await S.msgsFast(o.id)).filter(m => !m.hidden && !(m as ThMsg).thCard), early = memDigest(mem, 0);   // 기록이 있으면 묶음 요약 한 줄을 앞에
        rows = [...early, ...linesDigest(list.map(m => lineOf(o, m)), n)];
      }
      digests.set(o.id, { key, rows, kind });
    } catch (e) { console.warn('[이어진 방]', e); }
  }
}
/** 이어진 방마다 한 조각 (이번에 말할 캐릭터가 그 방에도 있을 때만) */
export function linkPieces(chat: Chat, char: Char): PromptPiece[] {
  const t = thPeek(chat); if ((t.share || 'lines') === 'off') return [];
  const here = chat.mode === 'talk' && !(chat as { sceneLive?: boolean }).sceneLive ? 'talk' : 'rp', out: PromptPiece[] = [];
  for (const o of linked(chat)) {
    const d = digests.get(o.id); if (!d?.rows.length || !o.charIds.includes(char.id)) continue;
    const content = frameBlock({ here, there: modeOf(o), room: label(o), rows: d.rows.map(r => r.replace(/\{\{/g, '{ {')), frame: t.frame, kind: d.kind, ago: o.updatedAt ? ago(o.updatedAt) : '' });
    if (content) out.push({ where: 'before', role: 'system', content, src: '이어진 방' });
  }
  return out;
}
/** 이 캐릭터가 말을 남길 수 있는 방 (이어진 방 가운데 자기가 있는 방) */
export const reachable = (chat: Chat, char: Char) => linked(chat).filter(o => o.charIds.includes(char.id)).map(o => ({ name: label(o), chat: o }));
export const findRoom = (chat: Chat, char: Char, name: string) => matchRoom(name, reachable(chat, char));

/** 방에 메시지를 덧붙인다: 열려 있는 방이면 화면에도, 아니면 저장만 하고 안 읽음 표시를 올린다 */
export async function appendTo(chat: Chat, m: Msg, unread = false) {
  if (chatApi.current().chat === chat) return void await chatApi.push?.(m);
  const list = await S.msgsFast(chat.id); list.push(m); if (unread) chat.unread = (chat.unread || 0) + 1;
  await S.saveMsgs(chat, list); emit('chats');
}
/** 옮겨 말하기: 캐릭터의 말을 저 방에 그 캐릭터의 메시지로 남긴다 */
export const relay = (from: Chat, to: Chat, char: Char, text: string) => appendTo(to, newMsg('assistant', text, { charId: char.id, name: char.name, thFrom: { id: from.id, room: label(from) } } as Partial<ThMsg>), true);
export const card = (text: string, c: ThCard) => newMsg('system', text, { thCard: c } as Partial<ThMsg>);

// ── 장면 건네기 ── 톡에서 나눈 이야기를 한 번의 호출로 장면 초안(곳 · 때 · 상황 · 첫 문단)으로 만들어, 따로 있는 이야기 방으로 넘어간다
const recent = (chat: Chat, msgs: Msg[], n: number) => linesDigest(msgs.filter(m => !m.hidden && !(m as ThMsg).thCard).map(m => lineOf(chat, m)), n, 4000).join('\n');
export async function draftStage(chat: Chat, msgs: Msg[], premise: string, signal?: AbortSignal): Promise<StageDraft | null> {
  const chars = charsOf(chat), persona = S.persona(chat), ctx = makeCtx({ chat, char: chars[0], chars, persona, msgs });
  const who = chars.map(c => `${c.name}: ${macro(c.description, { ...ctx, char: c.name }).replace(/\s+/g, ' ').slice(0, 500)}`).join('\n');
  const user = [`People:\n${who}${persona?.description ? `\n${persona.name}: ${macro(persona.description, ctx).replace(/\s+/g, ' ').slice(0, 300)}` : ''}`, `The conversation so far (latest last):\n${recent(chat, msgs, 14)}`, premise.trim() && `What the scene should be about: ${premise.trim()}`].filter(Boolean).join('\n\n');
  return parseDraft(await quickCall(macro(STAGE_SYSTEM, ctx), user, { maxTokens: 900, conn: S.helperConn('all', chat), lowThink: true, signal }));
}
/** 초안으로 장면을 연다. into 가 있으면 그 이야기 방에 장면 전환으로 넣고, 없으면 새 이야기 방을 만든다. 톡 방에는 "장면으로 갔다" 카드가 남는다 */
export async function openStage(from: Chat, d: StageDraft, into?: Chat | null): Promise<Chat | null> {
  const chars = charsOf(from), lead = chars[0]; if (!lead) return null;
  const where = [d.place, d.time].filter(Boolean).join(' · ');
  const head = card(`Scene: ${d.title}${where ? ' — ' + where : ''}.${d.situation ? ' ' + d.situation : ''}`, { kind: 'arrived', title: d.title, place: d.place, line: d.situation, room: from.id });
  const open = newMsg('assistant', d.opening, { charId: lead.id, name: lead.name });
  let room = into || null;
  if (room) { const list = await S.msgsFast(room.id); list.push(head, open); await S.saveMsgs(room, list); }
  else {
    room = await startChat(from.charIds, { open: false, mode: 'rp' }); if (!room) return null;
    room.name = d.title; room.personaId = from.personaId; room.personaAuto = from.personaAuto;
    await S.saveMsgs(room, [head, open]);   // 새 장면은 카드의 첫 인사말 대신 초안의 첫 문단으로 시작한다
  }
  thOf(room).origin = { id: from.id, title: d.title, place: d.place, at: Date.now() };
  await link(from, room);
  await appendTo(from, card(`${S.persona(from).name} and ${chars.map(c => c.name).join(', ')} step out of the chat and into a scene: ${d.title}${where ? ' — ' + where : ''}`, { kind: 'left', title: d.title, place: where, room: room.id }));
  go('chat', room.id);
  return room;
}
/** 돌아가기: 장면을 마치고 톡 방으로. 톡 방에 "다녀온 장면" 한 줄 카드를 남긴다 */
export async function comeBack(room: Chat, line: string) {
  const t = thOf(room), o = t.origin, home = o && S.get('chats', o.id); if (!o) return;
  delete t.origin; await S.save('chats', room, true);
  if (!home) return;
  const l = line.replace(/\s+/g, ' ').trim().slice(0, 200);
  await appendTo(home, card(`Back from the scene "${o.title}"${l ? ': ' + l : ''}. Texting again.`, { kind: 'visited', title: o.title, place: o.place, line: l, room: room.id }));
  digests.delete(room.id);
  go('chat', home.id);
}

// ── 두 스와이프 섞기 (호출 1번) ──
export async function blend(chat: Chat, msgs: Msg[], m: Msg, a: number, b: number): Promise<string> {
  const chars = charsOf(chat), char = S.get('chars', m.charId) || chars[0], ctx = makeCtx({ chat, char, chars, persona: S.persona(chat), msgs });
  const before = msgs.slice(0, msgs.indexOf(m));
  const user = `What came just before:\n${recent(chat, before, 6) || '(the reply opens the scene)'}\n\n<draft_a>\n${m.swipes[a].text}\n</draft_a>\n\n<draft_b>\n${m.swipes[b].text}\n</draft_b>`;
  return quickCall(macro(BLEND_SYSTEM, ctx), user, { maxTokens: Math.min(4096, S.presetFor(chat)?.params?.maxTokens || 1200), conn: S.connFor(chat) });
}
