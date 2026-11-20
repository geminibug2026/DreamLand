// 밤의 게시판: 모델에 보내는 글 — 지침(영어 상수)과 맥락 짜기. 맥락은 칸마다 토큰 몫이 있어 넘치면 뒤에서부터 덜어 낸다.
// 사생활: 대화 내용과 기억은 "게시판에서 이 대화를 언급해도 됨"을 켠 방에서만 가져온다.
import { DB, S, msgText } from '../lib/core';
import { tokens } from '../lib/engine';
import { scheduleOf, todayLine } from '../lib/f-schedule';
import { daysTogether } from '../lib/together';
import { getLang } from '../i18n';
import type { Char, Chat } from '../lib/types';
import { ME, type ChatFeed, type FeedCfg, type FeedState, type Note } from './types';
import { ago, carryItems, pairsFrom, quotaFor, sampleRecall, threadOf, visible, waiting, type Rnd, type Who } from './logic';

// ── 지침 ──
export const BOARD_PROMPT = `You keep a small fictional bulletin board alive. It is a quiet place where a handful of characters pin short notes for each other, the way people leave slips of paper on a corkboard at night. The characters have lives outside any conversation, and this board is where glimpses of those lives show up.

You will receive the members, what each is doing today, what is already on the board, and a quota. Write the next batch of activity as ONE JSON object and nothing else.

How members write here:
- Each member writes the way THEY would write on a board like this, which may differ from how they speak aloud. A terse or guarded member pins little and keeps it short, sometimes a single dry line. A chatty one rambles, jokes, overshares. Follow each member's "board voice" note.
- Notes come out of their day: something from today's schedule, a small annoyance, a thought at 2 a.m., something they will not say to anyone's face. Not every note is about the user, and most are not.
- Members answer each other as people who know each other. They may tease, disagree, ignore, or be kind, as fits them. Close pairs answer each other more often.
- When the reader has pinned or replied to something that is still waiting, the members who would care respond to it in their own manner. Do not have everyone pile on.
- Old notes may be picked up again ("still thinking about this") when it is natural.
- Never repeat or closely paraphrase a note that is already on the board.
- Private chat context and memories, when given, are background the member carries. They may allude to it the way a person would in a semi-public place: obliquely. They never quote private conversation or reveal anything the member would keep to themselves.

Hard rules:
- Never write a note, reply, mark, copy or vote as the reader. The reader's account is listed only so members can respond to it.
- Only listed members act. Follow the quota for new notes exactly; replies, marks and votes are up to you but keep them believable (a quiet board is fine).
- Refer to existing notes only by the short codes shown (e1, e2 …). Refer to notes of this batch by the "k" you gave them.
- "image" is optional and rare: one or two sentences describing a picture the member would attach (what is in the frame, no text overlay). Leave it out unless a picture truly belongs.

JSON shape:
{"notes":[{"k":"n1","by":"<handle>","text":"…","poll":{"q":"…","opts":["…","…"]},"image":"…"}],
 "acts":[{"by":"<handle>","on":"<k or code>","do":"like"},
         {"by":"<handle>","on":"<k or code>","do":"reply","text":"…","k":"r1"},
         {"by":"<handle>","on":"<k or code>","do":"reply","text":"…","under":"<reply k or code>"},
         {"by":"<handle>","on":"<k or code>","do":"echo"},
         {"by":"<handle>","on":"<k or code>","do":"vote","pick":0}],
 "ties":[{"a":"<handle>","b":"<handle>"}]}
"like" = a quiet mark of sympathy. "echo" = copying the note onto one's own corner so others see it. "vote" needs a note with a poll; "pick" is the option index from 0. "ties" = a member starts following another (rare). "poll" and "image" are optional. Output the JSON object only, no commentary, no code fence.`;

export const ANSWER_PROMPT = `You keep a small fictional bulletin board alive, where a handful of characters pin short notes for each other. The reader has just pinned or replied to something and is waiting. Decide which one or two members would actually respond, and write only their responses to that one note, each in that member's own board voice (terse members stay terse; a member who would not care stays silent).

Never write anything as the reader. Only listed members act. Output ONE JSON object and nothing else:
{"acts":[{"by":"<handle>","on":"<code>","do":"reply","text":"…"},{"by":"<handle>","on":"<code>","do":"like"}]}
"on" is the short code shown for the note. Use "under":"<code>" when answering a specific reply. If the note has a poll, a member may add {"do":"vote","pick":<index from 0>}.`;

export const PROFILE_PROMPT = `These characters are joining a small fictional bulletin board where they pin short notes for each other. For each one, invent the account they would set up themselves.

- "handle": the name they would pick. Lowercase letters, digits or underscores (the character's own script is fine), at most 16 characters, no "@". It should feel chosen by them: plain for a plain person, a private joke for a playful one.
- "bio": one line they would write about themselves, at most 60 characters. Understated is good. A secretive character may write almost nothing.
- "voice": a note for a writer, at most 160 characters, on how this character writes on the board as opposed to face to face: length, punctuation habits, how often they pin, what they pin about, what they never mention.

Output ONE JSON object and nothing else: {"profiles":[{"name":"<exactly as given>","handle":"…","bio":"…","voice":"…"}]}`;

/** 대화 모드에서 캐릭터에게 알려 주는 [post:] 사용법 */
export const POST_PROMPT = `{{char}} has an account on the Night Board, a small bulletin board where {{char}} and people they know pin short notes; {{user}} reads it. If, and only if, {{char}} would feel like pinning something right now, add one separate line: [post: the note text]. The note is written for the board, not addressed to {{user}}, in {{char}}'s board voice, at most 200 characters. Most replies have no such line; use it rarely.`;

const LANGS: Record<string, string> = { ko: 'Korean', en: 'English', 'zh-CN': 'Simplified Chinese', ja: 'Japanese' };
const langLine = (c: FeedCfg) => `Write every note and reply in ${LANGS[c.lang] || c.lang || LANGS[getLang()] || 'the language the members use'} unless a member would clearly write in another language.`;

// ── 도우미 ──
const one = (s: unknown, n: number) => { const t = String(s ?? '').replace(/\s+/g, ' ').trim(); return t.length > n ? t.slice(0, n - 1).trimEnd() + '…' : t; };
/** 줄들을 토큰 몫 안에서 앞에서부터 담는다 */
const fit = (lines: string[], budget: number) => { const out: string[] = []; let used = 0; for (const l of lines) { const n = tokens(l) + 1; if (used + n > budget) break; out.push(l); used += n; } return out; };
const sec = (title: string, lines: string[]) => lines.length ? `## ${title}\n${lines.join('\n')}` : '';
export const chatFeed = (c: Chat | null | undefined): ChatFeed => ((c as (Chat & { feed?: ChatFeed }) | null | undefined)?.feed) || {};
/** 내 계정 (손잡이 · 이름) */
export function meOf(st: FeedState) { const p = S.persona(null), a = st.accounts.find(x => x.id === ME); return { name: p?.name || 'You', handle: a?.handle || 'me', bio: a?.bio || '', desc: p?.description || '' }; }
/** 켜진 캐릭터 계정들 (지워진 캐릭터는 뺀다) */
export function members(st: FeedState): { char: Char; handle: string; bio: string; voice: string }[] {
  return st.accounts.filter(a => a.id !== ME && a.on).map(a => ({ a, char: S.get('chars', a.id) as Char | undefined })).filter((x): x is { a: typeof x.a; char: Char } => !!x.char).map(({ a, char }) => ({ char, handle: a.handle, bio: a.bio, voice: a.voice }));
}
export const whoList = (st: FeedState): Who[] => members(st).map(m => ({ id: m.char.id, handle: m.handle, name: m.char.name }));
const talkWord = (t: number) => t >= 0.8 ? 'pins often, chatty' : t >= 0.55 ? 'pins fairly often' : t >= 0.3 ? 'pins now and then' : t >= 0.12 ? 'pins rarely, few words' : 'almost never pins; one short line when they do';

/** 게시판의 글들을 짧은 표(e1 …)와 함께 적는다. refs 에 표 → 실제 id 를 채운다 */
function boardLines(st: FeedState, roots: Note[], now: number, refs: Record<string, string>, maxReplies = 4): string[] {
  const nameOf = (id: string) => { if (id === ME) { const m = meOf(st); return `${m.name} (@${m.handle}, the reader)`; } const a = st.accounts.find(x => x.id === id), c = S.get('chars', id); return `${c?.name || '?'} (@${a?.handle || '?'})`; };
  const short = (id: string) => id === ME ? meOf(st).name : (S.get('chars', id)?.name || '?');
  const code = (n: Note) => { const have = Object.keys(refs).find(k => refs[k] === n.id); if (have) return have; const k = 'e' + (Object.keys(refs).length + 1); refs[k] = n.id; return k; };
  const out: string[] = [];
  for (const n of roots) {
    const extra = [n.poll ? `{poll: ${n.poll.q || '(no question)'} | ${n.poll.opts.map((o, i) => `${i}) ${o} ×${Object.values(n.poll!.votes).filter(v => v === i).length}`).join(' | ')}}` : '', n.imagePrompt ? `{picture: ${one(n.imagePrompt, 90)}}` : n.image ? '{a picture is attached}' : '',
      n.likes.length ? `[marked by ${n.likes.map(short).join(', ')}]` : '', n.echoes.length ? `[echoed by ${n.echoes.map(short).join(', ')}]` : ''].filter(Boolean).join(' ');
    out.push(`${code(n)} · ${nameOf(n.by)} · ${ago(n.ts, now)}: ${one(n.text, 260)}${extra ? ' ' + extra : ''}`);
    const th = threadOf(st.notes, n.id), shown = th.slice(-maxReplies); if (th.length > shown.length) out.push(`  … ${th.length - shown.length} earlier replies`);
    for (const { n: r, depth } of shown) out.push(`${depth ? '    ' : '  '}↳ ${code(r)} · ${short(r.by)}${r.by === ME ? ' (the reader)' : ''} · ${ago(r.ts, now)}: ${one(r.text, 200)}`);
  }
  return out;
}

/** 허락한 대화의 최근 줄과 기억 (캐릭터별). 켜 둔 방이 없으면 빈 배열 */
async function privateLines(charId: string, cfg: FeedCfg): Promise<string[]> {
  const rooms = S.chats.filter(c => c.charIds?.includes(charId) && chatFeed(c).mention === true && !(c as { temp?: boolean }).temp).sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0)).slice(0, 2);
  const out: string[] = [];
  for (const c of rooms) {
    try {
      const persona = S.persona(c), msgs = (await S.msgs(c.id)).filter(m => !m.hidden && m.role !== 'system').slice(-Math.max(0, cfg.mentionLines));
      if (msgs.length) out.push(`  recent private chat (${ago(c.updatedAt || 0, Date.now())}; background only, never quote):`, ...msgs.map(m => `    ${m.role === 'user' ? persona?.name || 'Reader' : m.name || 'They'}: ${one(msgText(m), 160)}`));
      if (cfg.memLines > 0) {
        // 장기기억 기록(mem 저장소의 그 방 줄)을 읽기만 한다. 비밀 · 꺼 둔 것 · 지나간 기억은 싣지 않는다
        const mem = await DB.get('mem', c.id) as { memories?: { summary?: string; importance?: number; visibility?: string; disabled?: boolean; retired?: unknown }[] } | undefined;
        const top = (mem?.memories || []).filter(m => m && m.summary && !m.disabled && !m.retired && m.visibility !== 'secret').sort((a, b) => (b.importance || 0) - (a.importance || 0)).slice(0, cfg.memLines);
        if (top.length) out.push('  remembers:', ...top.map(m => `    - ${one(m.summary, 150)}`));
      }
    } catch (e) { console.warn('[게시판 맥락]', e); }
  }
  return out;
}

export interface Built { system: string; user: string; refs: Record<string, string>; who: Who[]; me: string[]; quota: Record<string, number> }
/** 새로 고침 한 번에 보낼 것을 짠다. only 가 있으면 그 글 하나에 대한 작은 호출이다 */
export async function buildBoard(st: FeedState, cfg: FeedCfg, { now = Date.now(), rnd = Math.random, only }: { now?: number; rnd?: Rnd; only?: Note } = {}): Promise<Built> {
  const mem = members(st), me = meOf(st), refs: Record<string, string> = {}, parts: string[] = [];
  const quota = only ? {} : quotaFor(mem.map(m => ({ id: m.char.id, talk: m.char.talk })), Math.max(1, Math.min(8, Math.round(cfg.n))), rnd);
  // 참여자: 설명 앞부분 + 말투 메모 + 오늘 일정 + 함께한 날 (+ 허락한 대화)
  const per = Math.max(120, Math.floor((only ? 1200 : 2600) / Math.max(1, mem.length))), who: string[] = [];
  for (const m of mem) {
    const c = m.char, sched = scheduleOf(c as unknown as Parameters<typeof scheduleOf>[0]), days = daysTogether(c.id, now), lines = [`- ${c.name} (@${m.handle})${m.bio ? ` — "${one(m.bio, 80)}"` : ''} [${talkWord(Number.isFinite(+c.talk) ? +c.talk : 0.5)}]`];
    const desc = one([c.description, c.personality].filter(Boolean).join(' '), only ? 320 : 520); if (desc) lines.push(`  who they are: ${desc}`);
    if (m.voice) lines.push(`  board voice: ${one(m.voice, 200)}`);
    if (sched && !only) { const tl = todayLine(sched, new Date(now)); if (tl) lines.push(`  today: ${one(tl, 320)}`); }
    if (days) lines.push(`  has known the reader for ${days} day${days > 1 ? 's' : ''}`);
    if (!only) lines.push(...await privateLines(c.id, cfg));
    who.push(...fit(lines, per));
  }
  parts.push(sec('Members', who));
  parts.push(sec('The reader (never write as them)', [`- ${me.name} (@${me.handle})${me.bio ? ` — "${one(me.bio, 80)}"` : ''}`, ...(me.desc ? [`  ${one(me.desc, 260)}`] : [])]));
  if (only) {
    const root = only.root ? st.notes.find(n => n.id === only.root) || only : only;
    parts.push(sec('The note in question', boardLines(st, [root], now, refs, 8)));
    const code = Object.keys(refs).find(k => refs[k] === only.id) || 'e1';
    parts.push(`The reader is waiting for a response to ${code}${only.root ? ' (their reply)' : ''}. ${langLine(cfg)}`);
  } else {
    const pairs = pairsFrom(S.chats, mem.map(m => m.char.id)).slice(0, 6).map(([a, b]) => `- ${S.get('chars', a)?.name} & ${S.get('chars', b)?.name}`);
    parts.push(sec('Close pairs (they share a group; more likely to answer each other)', pairs));
    const roots = st.notes.filter(n => !n.root && visible(n)), recent = roots.slice(-14), old = sampleRecall(roots.filter(n => !recent.includes(n)), { now, k: cfg.recall, rnd });
    if (old.length) parts.push(sec('Older notes that came back to mind (may be picked up again)', fit(boardLines(st, old, now, refs, 1), 500)));
    // 최근 글은 새것이 남도록 뒤에서부터 몫을 센다
    const lines = boardLines(st, recent, now, refs), kept = fit([...lines].reverse(), 1800).reverse();
    parts.push(sec('On the board now (oldest first)', kept.length ? kept : ['(the board is empty — this is the first night)']));
    const wait = waiting(st, now).map(n => { const k = Object.keys(refs).find(x => refs[x] === n.id); return k ? `- ${k}: ${one(n.text, 120)}` : ''; }).filter(Boolean);
    parts.push(sec('Waiting: the reader wrote these and nobody has answered yet', wait));
    const q = mem.filter(m => quota[m.char.id]).map(m => `${m.char.name} ×${quota[m.char.id]}`);
    parts.push(sec('Quota for this batch', [`New notes: ${q.join(', ') || 'none'}. Nobody else pins a new note. Replies, marks, echoes and votes may come from any member.`, `It is now ${new Date(now).toLocaleString('en-GB', { weekday: 'long', hour: '2-digit', minute: '2-digit' })}.`, langLine(cfg), ...(cfg.guide.trim() ? [cfg.guide.trim()] : [])]));
  }
  return { system: only ? ANSWER_PROMPT : BOARD_PROMPT, user: parts.filter(Boolean).join('\n\n'), refs, who: whoList(st), me: [me.handle, me.name, ME, 'reader', 'the reader', 'user'], quota };
}

/** 새 계정들의 손잡이 · 소개 · 말투를 한 번에 짓게 할 글 */
export function buildProfiles(chars: Char[], cfg: FeedCfg) {
  return { system: PROFILE_PROMPT, user: chars.map(c => `### ${c.name}\n${one([c.description, c.personality].filter(Boolean).join(' '), 700)}${c.mesExample ? `\nSpeech sample: ${one(c.mesExample, 240)}` : ''}`).join('\n\n') + `\n\nWrite "bio" in ${LANGS[cfg.lang] || cfg.lang || LANGS[getLang()] || 'the character\'s language'}; write "voice" in English.` };
}

/** 대화에 실을 "게시판에서 있었던 일" 블록 (없으면 '') */
export function carryBlock(st: FeedState, char: Char, cfg: FeedCfg, now = Date.now()): string {
  const items = carryItems(st, char.id, { now, hours: cfg.carryHours, max: cfg.carryMax }); if (!items.length) return '';
  const name = (id?: string) => id === ME ? '{{user}}' : (S.get('chars', id || '')?.name || 'someone');
  const lines = items.map(c => {
    const tail = [c.poll ? `(poll: ${one(c.poll, 100)})` : '', c.iLiked ? '{{user}} left a mark on it.' : '', ...c.myReplies.slice(-2).map(r => `{{user}} replied: "${one(r, 120)}"`)].filter(Boolean).join(' ');
    return c.kind === 'reply' ? `- ${ago(c.ts, now)}, replied to ${name(c.toBy)}${c.toText ? ` ("${one(c.toText, 80)}")` : ''}: "${one(c.text, 200)}"${tail ? ' ' + tail : ''}` : `- ${ago(c.ts, now)}, pinned: "${one(c.text, 240)}"${tail ? ' ' + tail : ''}`;
  });
  const head = `[Night Board — a small bulletin board where ${char.name} and people they know pin short notes; {{user}} reads it too. What ${char.name} did there lately. ${char.name} remembers writing these, and {{user}} may bring them up. Do not recite them unprompted.]`;
  return [head, ...fit(lines.reverse(), Math.max(60, cfg.carryTokens - tokens(head))).reverse()].join('\n');
}
