// 휴대폰이 보여 주는 것들을 저장된 자료에서 셈한다: 대화 모드 방 · 연락처 · 알림 · 통화 기록 · 음성 메시지. 모델 호출 0, 새로 저장하는 것 0
import { S, msgText } from '../lib/core';
import type { Char, Chat, Msg } from '../lib/types';
import { cur } from '../chat/store';
import { modeOf, titleOf } from '../chat/actions';
import { Live } from '../lib/live';
import { Stickers } from '../extras/stickers';
import { daysTogether } from '../lib/together';
import type { Prefs } from './prefs';
import { F } from '../feed/store';

/** 대화 모드 방 (임시 채팅 제외), 최근 순 */
export const talkChats = (): Chat[] => S.chats.filter(c => modeOf(c) === 'talk' && !c.temp).sort((a, b) => b.updatedAt - a.updatedAt);
export const charsIn = (c: Chat): Char[] => c.charIds.map(id => S.get('chars', id)).filter((x): x is Char => !!x);
export const nameOf = (c: Chat) => titleOf(c);
/** 휴대폰의 바탕이 되는 방: 연 자리의 대화(대화 모드면) → 가장 최근 대화 모드 방 */
export function homeChat(from: Chat | null): Chat | null {
  const c = from || cur.chat; if (c && modeOf(c) === 'talk' && S.get('chats', c.id)) return c;
  return talkChats()[0] || null;
}
/** 그 사람과 1:1 로 이야기하는 대화 모드 방 (없으면 그 사람이 든 아무 대화 모드 방) */
export function chatWith(charId: string): Chat | null {
  const list = talkChats();
  return list.find(c => c.charIds.length === 1 && c.charIds[0] === charId) || list.find(c => c.charIds.includes(charId)) || null;
}
/** 위젯이 보여 줄 사람 */
export function favChar(p: Prefs, home: Chat | null): Char | null {
  return (p.fav && S.get('chars', p.fav)) || (home && charsIn(home)[0]) || S.chars.find(c => c.fav) || S.chars[0] || null;
}
/** 지금 상태: 대화 모드 방이 있으면 그 방의 시계 · 일정으로 */
export function presenceOf(ch: Char) { try { return Live.presence(chatWith(ch.id), ch); } catch { return { status: 'online', activity: '', until: 0, from: '', block: null }; } }

// ── 메시지 글을 한 줄로: 딱지는 이름만 떼어 두고, 꼬리표 · 별표 지문 · 따옴표 · 서식은 걷는다 ──
const STK = /\[sticker\s*:\s*([^\]\n—–-]+?)\s*(?:[—–-][^\]\n]*)?\]/i;
export interface Line { text: string; sticker?: string }
export function lineOf(raw: unknown): Line {
  let s = String(raw ?? ''); const m = s.match(STK), sticker = m ? m[1].trim() : undefined;
  s = s.replace(/\[sticker[^\]\n]*\]/gi, ' ').replace(/<([A-Za-z_][\w-]*)[^>]*>[\s\S]*?<\/\1>/g, ' ').replace(/<[^>]*>?/g, ' ').replace(/\[[^\]\n]*\]/g, ' ')
    .replace(/\*([^*\n]+)\*/g, '($1)').replace(/["“”「」『』]/g, '').replace(/[#_>`|]+/g, ' ').replace(/\s+/g, ' ').trim();
  return { text: s, sticker };
}
/** 딱지 그림 (찾으면 그림 주소, 없으면 '') */
export function stickerSrc(name: string | undefined, chat?: Chat | null): string {
  if (!name) return ''; try { const s = Stickers.find(name, Stickers.usable(chat)) || Stickers.find(name, Stickers.packs().flatMap(p => Stickers.list(p.id))); return s?.data || ''; } catch { return ''; }
}

// ── 알림 ──
export interface Notif { id: string; kind: 'msg' | 'call'; chat: Chat; charId: string; title: string; line: Line; at: number; count: number }
interface CallChat extends Chat { callLog?: { at: number; dir: 'in' | 'out'; result: string; dur: number; msgId: string; charId: string }[] }
const callsOf = (c: Chat) => (c as CallChat).callLog || [];
/** 휴대폰에 걸린 알림: 안 읽은 대화 · 부재중 전화 · 지금 열린 동안 새로 온 메시지(fresh). 숨긴 방은 뺀다 */
export function notifications(p: Prefs, fresh: Map<string, { at: number; text: string; n: number }>): Notif[] {
  const out: Notif[] = [], weekAgo = Date.now() - 7 * 86400000;
  for (const c of talkChats().slice(0, 80)) {
    if (p.muted.includes(c.id)) continue;
    const f = fresh.get(c.id), n = Math.max(c.unread || 0, f?.n || 0), ch = charsIn(c)[0];
    if (n > 0) out.push({ id: 'm' + c.id, kind: 'msg', chat: c, charId: ch?.id || '', title: nameOf(c), line: lineOf(f?.text || c.preview), at: f?.at || c.updatedAt, count: n });
    const missed = callsOf(c).filter(x => x.dir === 'in' && x.result === 'missed' && x.at > (p.seenCalls[c.id] || 0) && x.at > weekAgo);
    if (missed.length) out.push({ id: 'c' + c.id, kind: 'call', chat: c, charId: missed[0].charId || ch?.id || '', title: S.get('chars', missed[0].charId)?.name || nameOf(c), line: { text: '' }, at: missed[0].at, count: missed.length });
  }
  return out.sort((a, b) => b.at - a.at);
}

// ── 게시판 소식 ── 내 글에 온 마음 · 답글 · 재게시 · 투표 가운데 아직 보지 않은 것 (읽음은 게시판의 「본 때」 하나)
export interface SnsNote { count: number; at: number; by: string; kind: string; text: string }
export function snsNotice(): SnsNote | null {
  const fresh = F.notices.filter(q => q.ts > F.seenAt); if (!fresh.length) return null;
  const q = fresh.reduce((a, b) => b.ts > a.ts ? b : a), n = F.notes.find(x => x.id === q.note);
  return { count: fresh.length, at: q.ts, by: q.by, kind: q.kind, text: n?.text || '' };
}

// ── 통화 기록 ──
export interface CallRow { key: string; chat: Chat; charId: string; at: number; dir: 'in' | 'out'; result: string; dur: number; msgId: string }
export function recents(limit = 60): CallRow[] {
  const out: CallRow[] = [];
  for (const c of S.chats) for (const x of callsOf(c)) out.push({ key: c.id + x.at, chat: c, charId: x.charId || c.charIds[0], at: x.at, dir: x.dir, result: x.result, dur: x.dur, msgId: x.msgId });
  return out.sort((a, b) => b.at - a.at).slice(0, limit);
}
export interface Voicemail { key: string; chat: Chat; charId: string; at: number; text: string; audio: string }
/** 음성 메시지: 부재중 전화 기록이 있는 방만 메시지를 읽는다 (최근 방 12개까지) */
export async function voicemails(): Promise<Voicemail[]> {
  const rooms = S.chats.filter(c => callsOf(c).some(x => x.result === 'missed')).sort((a, b) => b.updatedAt - a.updatedAt).slice(0, 12), out: Voicemail[] = [];
  for (const c of rooms) {
    const ids = new Set(callsOf(c).filter(x => x.result === 'missed').map(x => x.msgId)); if (!ids.size) continue;
    let list: Msg[]; try { list = S.msgsCached(c.id) || await S.msgs(c.id); } catch { continue; }
    for (const m of list) { const rec = m.call as { voicemail?: string; audio?: string } | undefined; if (rec?.voicemail && ids.has(m.id)) out.push({ key: c.id + m.id, chat: c, charId: m.charId || c.charIds[0], at: m.ts, text: rec.voicemail, audio: rec.audio || '' }); }
  }
  return out.sort((a, b) => b.at - a.at).slice(0, 30);
}
/** 그 방의 마지막 캐릭터 메시지 (읽어 주기 · 위젯) */
export async function lastReply(c: Chat): Promise<Msg | null> {
  let list: Msg[]; try { list = S.msgsCached(c.id) || await S.msgs(c.id); } catch { return null; }
  for (let i = list.length - 1; i >= 0; i--) if (list[i].role === 'assistant' && !list[i].hidden && msgText(list[i]).trim()) return list[i];
  return null;
}

// ── 함께한 날 · 기념일까지 ──
const MARKS = [7, 30, 50, 100];
/** 다음 기념일과 그 앞 기념일 (며칠째 기준) */
export function nextMark(days: number): { prev: number; next: number } {
  let prev = 0; for (const m of MARKS) { if (days < m) return { prev, next: m }; prev = m; }
  const next = Math.floor(days / 100) * 100 + 100; return { prev: next - 100, next };
}
export const together = (charId: string) => daysTogether(charId);
