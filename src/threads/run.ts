// 대화에 끼어드는 자리들: 기록 가리기(귓속말 · 자리에 없던 동안 · 끊긴 말) · 프롬프트 조각 · 답장의 숨은 꼬리표 읽기 · 다음 화자 고르기
import { S, msgText } from '../lib/core';
import type { Char, Chat, Msg } from '../lib/types';
import type { PromptInfo, PromptPiece } from '../lib/hooks';
import type { HistoryLens } from '../lib/engine';
import { chatApi, charsOf } from '../chat/actions';
import { bump } from '../chat/store';
import { hideTags, splitArg, takeTags, unquote } from './tags';
import { NOTES_GUIDE, cleanNote, liveNotes, notesBlock } from './notes';
import { CUT_GUIDE, cutText, cutsOf, findCut } from './cut';
import { WHISPER_GUIDE, findWho, veilChar, veilUser } from './whisper';
import { AWAY_GUIDE, BACK_NOTE, applyMoves, heard, missedTail } from './presence';
import { pickSmart, scoreSpeakers, type Score } from './order';
import { STAGE_GUIDE, TO_GUIDE } from './link';
import { ABOUT_GUIDE, ABOUT_REST, aboutAt, aboutBlock, setAbout } from './about';
import { appendTo, card, findRoom, linkPieces, reachable, relay } from './bridge';
import { swOf, thOf, thPeek, type ThMsg, type ThSwipe } from './types';

/** 전체 설정 (S.settings.threads) */
export interface Cfg { /** 톡 프로필의 소개 줄을 프롬프트에 싣는다 */ about: boolean; /** 캐릭터가 [about:] 로 스스로 고친다 */ aboutSelf: boolean }
export const cfg = (): Cfg => { const s = S.settings as unknown as { threads?: Partial<Cfg> }, c = (s.threads ||= {}); c.about ??= true; c.aboutSelf ??= true; return c as Cfg; };
const isTalk = (chat: Chat) => chat.mode === 'talk' && !(chat as { sceneLive?: boolean }).sceneLive;
const who = (chars: Char[]) => chars.map(c => ({ id: c.id, name: c.name }));
const withText = (m: Msg, text: string): Msg => ({ ...m, swipes: [{ ...m.swipes[m.sw], text }], sw: 0 });

// ── 끊긴 말 ── 어느 내 메시지가 어디서 끊겼는지는 그 뒤 답장의 "지금 고른 스와이프"가 정한다
let cutCache: { msgs: Msg[]; map: Map<string, number> } | null = null;
export const dirty = () => { cutCache = null; };
const cutsNow = (): Map<string, number> => { const { msgs } = chatApi.current(); if (cutCache?.msgs !== msgs) cutCache = { msgs, map: cutsOf(msgs) }; return cutCache.map; };

// ── 기록 가리기 ── 이번에 말할 캐릭터가 보고 들은 것만 남긴다. 원본은 건드리지 않고, 바뀌는 메시지만 복사한다
export const lens: HistoryLens = (source, { chat, char, chars, type }) => {
  const group = chars.length > 1, me = type === 'impersonate' ? 'user' : char.id, user = S.persona(chat).name, cast = who(chars);
  const again = type === 'regen' || type === 'swipe', cuts = cutsOf(source, again);
  if (!group && !cuts.size) return source;
  const out: Msg[] = []; let changed = false;
  source.forEach((m0, i) => {
    const m = m0 as ThMsg, last = i === source.length - 1;
    if (group && me !== 'user' && m.charId !== me && !heard(m, me) && !(again && last)) { changed = true; return; }   // 자리에 없던 동안의 말
    let text = msgText(m); const before = text;
    if (m.role === 'user') {
      const at = cuts.get(m.id); if (at != null) text = cutText(text, at);
      if (group && m.thW?.to.length && me !== 'user') text = veilUser(text, m.thW.to, me, cast, user);
    } else if (m.role === 'assistant' && group) {
      const wh = swOf(m).thWh;
      if (wh?.length && !(again && last)) { const add = veilChar(wh, { id: m.charId, name: m.name }, me, cast, user); if (add) text = text === '…' ? add : `${text}\n${add}`; }
    }
    if (text !== before) { changed = true; out.push(withText(m, text)); } else out.push(m0);
  });
  return changed ? out : source;
};

// ── 프롬프트 조각 ──
export function pieces({ chat, char, chars, persona, msgs, type, ctx }: PromptInfo): PromptPiece[] {
  const t = thPeek(chat), talk = isTalk(chat), group = chars.length > 1, out: PromptPiece[] = [], again = type === 'regen' || type === 'swipe';
  out.push(...linkPieces(chat, char));
  if (talk && cfg().about) { const a = aboutBlock(chars, persona, String(ctx.user || persona?.name || 'User')); if (a) out.push({ where: 'before', role: 'system', content: a.replace(/\{\{/g, '{ {'), src: '자기소개' }); }
  if (type === 'impersonate') return out;
  const shown = msgs.filter(m => !m.hidden);
  if (t.notes) { const b = notesBlock(char.name, liveNotes(shown as Parameters<typeof liveNotes>[0], char.id, { skipLast: again })); if (b) out.push({ where: 'depth', depth: 1, order: 62, role: 'system', content: b, src: '속내 쪽지' }); }
  if (group) { const n = missedTail((again ? shown.slice(0, -1) : shown) as ThMsg[], char.id); if (n) out.push({ where: 'depth', depth: 0, order: 40, role: 'system', content: BACK_NOTE(char.name, n), src: '자리에 없던 동안' }); }
  // 숨은 꼬리표 안내: 켜 둔 것만, 쓸 수 있는 때만 싣는다 (안 쓸 안내로 프롬프트를 채우지 않는다)
  const tail = (again ? shown.slice(0, -1) : shown).pop(), g: string[] = [];
  if (t.notes) g.push(NOTES_GUIDE);
  if (t.cut && type !== 'continue' && tail?.role === 'user' && msgText(tail).length >= 140) g.push(CUT_GUIDE);
  if (group && t.whisper === true) g.push(WHISPER_GUIDE);
  if (group && t.autoAway) g.push(AWAY_GUIDE);
  if (talk) {
    const rooms = reachable(chat, char); if (rooms.length) g.push(TO_GUIDE.replace('{{rooms}}', rooms.map(r => `"${r.name.replace(/[{}"]/g, '')}"`).join(', ')));
    if (t.stage && !chat.scene?.on && !t.origin && !shown.slice(-6).some(m => (m as ThMsg).thCard?.kind === 'invite')) g.push(STAGE_GUIDE);
    if (cfg().about && cfg().aboutSelf && !group && Date.now() - aboutAt(char) > ABOUT_REST) g.push(ABOUT_GUIDE);
  }
  if (g.length) out.push({ where: 'end', role: 'system', content: `<hidden_tags>\nOptional tags. They are removed before {{user}} reads your reply, so never mention them. Use one only when it truly fits — most replies need none.\n${g.join('\n')}\n</hidden_tags>`, src: '숨은 꼬리표 (이어진 방 · 속내)' });
  return out;
}

// ── 답장이 왔을 때: 꼬리표를 떼고(저장 전) 그 뜻대로 적는다 ──
export function onReceived({ msg, chat }: { msg: Msg; chat: Chat }) {
  if (!msg || msg.role !== 'assistant') return;
  const sw = msg.swipes[msg.sw] as ThSwipe | undefined; if (!sw) return;
  const t = thPeek(chat), chars = charsOf(chat), group = chars.length > 1, talk = isTalk(chat), char = S.get('chars', msg.charId), user = S.persona(chat).name;
  const open = chatApi.current().chat === chat, list = open ? chatApi.current().msgs : null;
  const away0 = t.away || [];
  if (group && away0.length) (msg as ThMsg).thGone = away0.filter(id => id !== msg.charId); else delete (msg as ThMsg).thGone;
  const r = takeTags(sw.text); if (!r.tags.length) return;
  const moves: { kind: 'leave' | 'enter'; id: string }[] = []; let touched: Msg | null = null;
  for (const tag of r.tags) {
    if (tag.name === 'notes' && t.notes) { const n = cleanNote(tag.arg); if (n.wipe) { sw.thWipe = true; delete sw.thNotes; } else if (n.text) sw.thNotes = n.text; }
    else if (tag.name === 'cut' && t.cut && list) {
      const i = list.indexOf(msg), prev = list[i - 1];
      if (prev?.role === 'user' && !prev.hidden) { const at = findCut(msgText(prev), unquote(tag.arg)); if (at > 0) { sw.thCut = { id: prev.id, at }; touched = prev; } }
    } else if (tag.name === 'whisper' && group && t.whisper === true) {
      const [name, text] = splitArg(tag.arg), id = findWho(name, who(chars), user);
      if (id && id !== msg.charId && text) (sw.thWh ||= []).push({ to: id, text: text.slice(0, 400) });
    } else if ((tag.name === 'leave' || tag.name === 'enter') && group && t.autoAway) {
      const id = findWho(unquote(tag.arg), who(chars), user); if (id && id !== 'user') moves.push({ kind: tag.name, id });
    } else if (tag.name === 'to' && char) {
      const [name, text] = splitArg(tag.arg), room = text ? findRoom(chat, char, name) : null;
      if (room) { (sw.thTo ||= []).push({ id: room.chat.id, room: room.name, text }); void relay(chat, room.chat, char, text).catch(e => console.warn('[옮겨 말하기]', e)); }
    } else if (tag.name === 'stage' && talk && t.stage && tag.arg && char) {
      const premise = unquote(tag.arg).slice(0, 240);
      setTimeout(() => void appendTo(chat, card(`${char.name} suggests playing this out as a scene: ${premise}`, { kind: 'invite', premise, by: char.name })).catch(e => console.warn('[장면 건네기]', e)), 600);
    } else if (tag.name === 'about' && talk && cfg().aboutSelf && char && tag.arg) void setAbout(char, tag.arg, 'self').then(() => bump('dossier', 'side'));
  }
  sw.text = r.text || '…';   // 꼬리표만 온 답장이 빈 말풍선으로 남지 않게
  if (moves.length) { thOf(chat).away = applyMoves(away0, moves); void S.save('chats', chat, true); }
  dirty();
  if (open) setTimeout(() => bump('m:' + msg.id, ...(touched ? ['m:' + touched.id] : []), 'composer'), 0);   // 한 줄씩 보여 주는 중인 그림은 건드리지 않고 표시만 다시 그린다
}

// ── 내가 보낼 때: 귓속말 대상과, 그때 자리에 없던 사람을 메시지에 찍는다 ──
const whisperTo = new Map<string, string[]>();
export const whisperOf = (chat: Chat) => whisperTo.get(chat.id) || [];
export function setWhisper(chat: Chat, ids: string[]) { if (ids.length) whisperTo.set(chat.id, ids); else whisperTo.delete(chat.id); bump('composer'); }
export function onSent({ msg, chat }: { msg: Msg; chat: Chat }) {
  if (!msg || chat.charIds.length < 2) return;
  const m = msg as ThMsg, t = thPeek(chat), to = whisperOf(chat).filter(id => chat.charIds.includes(id));
  if (to.length && msg.role === 'user') { m.thW = { to }; whisperTo.delete(chat.id); setTimeout(() => bump('composer'), 0); }
  const gone = (t.away || []).filter(id => !to.includes(id));
  // 귓속말은 들은 사람 말고는 내용이 가려지므로 따로 찍지 않아도 되지만, 자리에 없는 사람은 귓속말이 있었다는 것조차 모른다
  if (gone.length) m.thGone = gone;
}

// ── 다음에 말할 사람 ──
export function scoresFor(chat: Chat, chars: Char[], msgs: Msg[]): Score[] {
  const t = thPeek(chat), away = new Set(t.away || []), muted = new Set(chat.muted || []);
  return scoreSpeakers(chars.map(c => ({ id: c.id, name: c.name, talk: c.talk, away: away.has(c.id), muted: muted.has(c.id) })),
    msgs.slice(-24).map(m => ({ role: m.role, charId: m.charId, text: msgText(m), hidden: m.hidden, to: (m as ThMsg).thW?.to })));
}
export function speaker(chat: Chat, chars: Char[], msgs: Msg[]): { pick?: Char; pool?: Char[] } | null {
  const t = thPeek(chat), away = new Set(t.away || []), pool = chars.filter(c => !away.has(c.id)); if (!pool.length) return null;
  const tail = msgs[msgs.length - 1] as ThMsg | undefined, heardIt = tail?.role === 'user' ? pool.find(c => tail.thW?.to.includes(c.id)) : undefined;
  if (heardIt) return { pick: heardIt };   // 귓속말에는 들은 사람이 답한다
  if (chat.groupOrder === 'smart') { const s = pickSmart(scoresFor(chat, chars, msgs)), c = s && pool.find(x => x.id === s.id); if (c) return { pick: c }; }
  return pool.length < chars.length ? { pool } : null;
}
/** 자리에 있음 · 없음 바꾸기 */
export async function setAway(chat: Chat, id: string, away: boolean) {
  const t = thOf(chat); t.away = applyMoves(t.away || [], [{ kind: away ? 'leave' : 'enter', id }]);
  await S.save('chats', chat, true); bump('composer', 'drawer', 'dossier');
}

// ── 화면에 보일 때 ── 숨은 꼬리표를 가리고(오는 중에도), 끊긴 내 말은 끊긴 모습으로
export function show(text: string, info?: { role?: string; msg?: Msg; chat?: Chat | null }): string {
  let out = hideTags(text);
  const m = info?.msg;
  if (m && m.role === 'user' && info?.chat && info.chat === chatApi.current().chat) {
    const at = cutsNow().get(m.id);
    if (at != null) {
      const raw = msgText(m), kept = cutText(raw, at);
      if (out === raw) out = kept;
      else { const key = kept.slice(0, -1).slice(-18), i = key.length >= 6 ? out.lastIndexOf(key) : -1; if (i >= 0) out = out.slice(0, i + key.length) + '—'; }   // 정규식 · 번역으로 글이 달라졌으면 끊긴 자리의 끝말을 찾아 맞춘다
    }
  }
  return out;
}
