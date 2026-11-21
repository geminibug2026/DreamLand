// 이어진 방: 묶인 방끼리 서로의 최근 일을 알게 하는 글(추가 호출 없음)과, 방 이름 찾기 · 장면 초안 읽기 — 순수 함수 (방을 만들고 읽는 일은 bridge.ts)
import type { Frame } from './types';

export const SHARE_N = 6;
export const TO_GUIDE = `[to: Room | message] — leave a short message in another room you share with {{user}}, as {{char}}. Rooms you can reach: {{rooms}}. Use it when {{user}} asks you to pass something on or says "tell the others", or when {{char}} would naturally post it there instead of here. One or two sentences; your reply here continues as usual.`;
export const STAGE_GUIDE = `[stage: one line] — offer to step out of the messenger and play this out as a full story scene (a place, a moment, something about to happen). {{user}} gets an invitation and decides. Only when the talk is clearly heading toward a real meeting or an event worth living through, and never twice in a row.`;
export const STAGE_SYSTEM = `You turn the end of a messenger conversation into the opening of a face-to-face roleplay scene between the same people.
Answer with one JSON object and nothing else:
{"title": "2-5 words", "place": "where, concretely", "time": "when (short)", "situation": "2-3 sentences: what led here, what each side wants or fears, one thing that is about to happen — written for the storyteller, not shown as dialogue", "opening": "the first paragraph of the scene: 90-150 words of third-person narration and, if natural, one spoken line from {{char}}. Concrete senses, no summary of the chat, and it must end on a beat that invites {{user}} to act. Never write {{user}}'s words, thoughts or actions."}
Write title, place, time and opening in the language the conversation is written in. Stay faithful to what was actually said; invent only what the place needs.`;
export const BLEND_SYSTEM = `You are rewriting one reply in an ongoing roleplay. Two drafts of the same reply follow. Write a single new reply that keeps what works best in each — the stronger beats, lines and images — as one seamless piece in the same voice, tense, point of view and language, about as long as the longer draft. Do not add new plot turns, do not mention the drafts, and never write for {{user}}. Output only the reply.`;

export interface Line { who: string; text: string }
const clip = (s: string, n: number) => { const t = s.replace(/\s+/g, ' ').trim(); return t.length > n ? t.slice(0, n - 1).trimEnd() + '…' : t; };
/** 최근 메시지 몇 줄: 뒤에서부터 n 줄을 고르되 전체가 budget 글자를 넘지 않게 (한 줄은 240자까지) */
export function linesDigest(lines: Line[], n = SHARE_N, budget = 1400): string[] {
  const out: string[] = []; let used = 0;
  for (let i = lines.length - 1; i >= 0 && out.length < n; i--) {
    const l = lines[i]; if (!l.text.trim()) continue;
    const row = `${l.who}: ${clip(l.text, 240)}`; if (used + row.length > budget && out.length) break;
    out.push(row); used += row.length;
  }
  return out.reverse();
}
export interface MemLike { memories?: { summary?: string; turn?: number | null; importance?: number; disabled?: boolean; retired?: unknown; visibility?: string }[]; chunks?: { summary?: string; text?: string }[]; chapters?: { summary?: string; text?: string }[] }
/** 장기기억 기록에서: 가장 새 묶음 요약 한 줄 + 가장 최근의 기억 n 개 (꺼 둔 것 · 지나간 것 · 비밀은 뺀다) */
export function memDigest(mem: MemLike | null | undefined, n = SHARE_N, budget = 1400): string[] {
  if (!mem) return [];
  const out: string[] = [], chunks = mem.chunks?.length ? mem.chunks : mem.chapters || [], last = chunks[chunks.length - 1], sum = last?.summary || last?.text;
  if (sum) out.push('Earlier: ' + clip(String(sum), 360));
  const ms = (mem.memories || []).map((m, i) => ({ m, i })).filter(({ m }) => m.summary && !m.disabled && !m.retired && m.visibility !== 'private' && m.visibility !== 'secret')
    .sort((a, b) => (b.m.turn ?? -1) - (a.m.turn ?? -1) || b.i - a.i).slice(0, n).reverse();
  let used = out.join('').length;
  for (const { m } of ms) { const row = '- ' + clip(String(m.summary), 220); if (used + row.length > budget && out.length) break; out.push(row); used += row.length; }
  return out;
}
/**
 * 이어진 방의 일을 이 방의 캐릭터에게 알려 주는 글.
 * here/there = 이 방과 저 방의 모드. 톡 방에서 이야기 방을 볼 때는 "극 밖에서" 말하게 한다: self = 그 일을 직접 겪은 본인으로, actor = 그 배역을 연기한 배우로.
 * 이야기 방에서 톡 방을 볼 때는 그 수다가 이야기 안의 사실이 되지 않게 막되, 거기서 한 부탁은 이야기의 방향으로 받아들이게 한다.
 */
export function frameBlock(o: { here: 'rp' | 'talk'; there: 'rp' | 'talk'; room: string; rows: string[]; frame?: Frame; kind: 'lines' | 'memory'; ago?: string }): string {
  if (!o.rows.length) return '';
  const head = o.kind === 'memory' ? 'What is remembered from there' : 'The latest lines from there', when = o.ago ? ` (last active ${o.ago})` : '';
  let lead: string;
  if (o.here === 'talk' && o.there === 'rp') lead = o.frame === 'actor'
    ? `You and {{user}} have also been playing out a story together in another room, "${o.room}"${when}. Here in the messenger you are outside that story: you are the one who plays your part in it, like an actor between takes. You can talk about scenes, laugh about what your character did, admit what was hard to play, and plan what could happen next — as yourself, not in the story's voice. Do not continue the story here.`
    : `You and {{user}} also share another room, "${o.room}"${when}, where things happen between you face to face. Those events are real to you and you remember them. Here in the messenger you can bring them up the way a person texts about something that just happened — a look back, a tease, a worry, a thank-you — without narrating or replaying the scene.`;
  else if (o.here === 'rp' && o.there === 'talk') lead = o.frame === 'actor'
    ? `Outside this story, you and {{user}} chat in a messenger room, "${o.room}"${when}. That chatter is not part of the story world and the characters know nothing of it. But when {{user}} said there what they hope for, enjoy or want changed in the story, quietly let it guide where the story goes.`
    : `Between scenes, {{char}} and {{user}} also text each other in a messenger room, "${o.room}"${when}. It is the same two people and the same continuity: what was said there has been said. Let it colour this scene where it fits, without reciting it.`;
  else lead = `You and {{user}} also have another room, "${o.room}"${when}. It is the same continuity, so you know what happened there.`;
  return `<linked_room name="${o.room}">\n${lead}\n${head}:\n${o.rows.join('\n')}\n</linked_room>`;
}
/** 방 이름으로 찾기: 똑같은 이름 → 품은 이름. 하나도 못 찾았는데 갈 수 있는 방이 하나뿐이면 그 방 */
export function matchRoom<T extends { name: string }>(name: string, rooms: T[]): T | null {
  const n = name.trim().toLowerCase().replace(/^["“#]+|["”]+$/g, '');
  if (!rooms.length) return null;
  return rooms.find(r => r.name.toLowerCase() === n) || (n ? rooms.find(r => r.name.toLowerCase().includes(n) || n.includes(r.name.toLowerCase())) : null) || (rooms.length === 1 ? rooms[0] : null);
}
export interface StageDraft { title: string; place: string; time: string; situation: string; opening: string }
/** 장면 초안 읽기: JSON 을 찾아 읽고, 깨졌으면 낱말표 줄("title: …")이라도 건진다. 첫 문단이 없으면 null */
export function parseDraft(raw: string): StageDraft | null {
  const s = String(raw || '').replace(/```(?:json)?/gi, '').trim(), a = s.indexOf('{'), b = s.lastIndexOf('}');
  let o: Record<string, unknown> | null = null;
  if (a >= 0 && b > a) { try { o = JSON.parse(s.slice(a, b + 1)) as Record<string, unknown>; } catch { o = null; } }
  if (!o) { o = {}; for (const k of ['title', 'place', 'time', 'situation', 'opening']) { const m = new RegExp(`"?${k}"?\\s*[:=]\\s*"((?:[^"\\\\]|\\\\.)*)"`, 'i').exec(s); if (m) o[k] = m[1].replace(/\\n/g, '\n').replace(/\\"/g, '"'); } }
  const str = (k: string, n: number) => clip(String(o![k] ?? ''), n), opening = String(o.opening ?? '').trim();
  if (!opening) return null;
  return { title: str('title', 60) || 'Scene', place: str('place', 120), time: str('time', 60), situation: str('situation', 600), opening };
}
