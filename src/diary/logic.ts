// 일기장 묶음의 화면 아닌 부분: 지시문 · 모델 호출 · 저장 · 약속 수첩 · 글씨체 · 책 묶기 자료 모으기
// (옛 diary.js 의 writeDiary 와 f-almanac.js 의 계산 · 호출 부분. 날짜 · 달 계산은 f-keepsake.js 를 다리로 쓴다)
import type { CSSProperties } from 'react';
import { toast, type FieldDef } from '../ui';
import type { PromptInfo, PromptPiece } from './types';
import type { AlmSettings, DChar, DChat, DiaryEntry, Dream, FontPick, FoundPromise, Keepsake, Letter, Msg, Page, Photo, PromiseRec } from './types';
import { Illust } from '../lib/illust';
import { Memory, parseLoose } from '../lib/memory';
import { S } from '../lib/core';
import { buildBook } from '../lib/f-bind';
import { chatApi } from '../chat/actions';
import { quickCall } from '../lib/engine';
import { go, route } from '../lib/router';
import * as core from '../lib/core';
import * as K from '../lib/f-keepsake';

// ════════ 지시문 (모두 설정에서 고칠 수 있다. 비우면 아래 기본값) ════════
export const DIARY_PROMPT = `You are {{char}}, writing tonight's page in a diary nobody else will ever read. The record below is what happened since your last entry.
- First person, in {{char}}'s own voice and habits of speech — the way {{char}} talks to themself, honest in a way they would never be out loud.
- Do not retell everything in order. Pick the one or two moments that stayed with you: what happened, what you noticed about {{user}}, what you felt and did not say.
- Use only what the record shows; do not invent events. Do not address {{user}} or a reader, and do not repeat the previous entry.
- 120 to 220 words, in the same language as the roleplay.
Reply with ONE JSON object and nothing else: {"title":"a short title for the entry","date":"the in-story date or time if the story gives one, else empty","mood":"one or two words for how {{char}} feels tonight","weather":"the weather in the story today if the record shows it, else empty","text":"the diary entry, paragraphs separated by \\n\\n"}`;
export const DIARY_DEF: FieldDef = { k: 'diary.prompt', label: '일기 쓰기', type: 'area', rows: 6, ph: DIARY_PROMPT, hint: 'JSON 형식(title · date · mood · weather · text)은 바꾸지 마세요. 비워 두면 기본 문장을 씁니다 (칸에 흐리게 보이는 글).' };

export const MEMO_PROMPT = `You turn a page of {{char}}'s private diary into long-term memory notes for an ongoing roleplay with {{user}}.
From the page, keep only what will still matter many scenes later: concrete events, promises and plans, decisions, changes in the relationship, facts newly learned about {{user}} or {{char}}.
Write 1 to 4 notes, one per line. Each note is one plain, self-contained sentence in third person that uses names instead of pronouns. No mood-only lines, no poetic wording, no line numbers or bullets, nothing that is not on the page.
Write in the same language as the page. Output only the lines.`;
export const MEMO_DEF: FieldDef = { k: 'diary.memoPrompt', label: '기억으로 간추리기', type: 'area', rows: 6, ph: MEMO_PROMPT, hint: '일기 · 꿈 · 편지를 장기기억에 올릴 때 몇 줄로 간추리는 지시문입니다. 비워 두면 기본 문장을 씁니다.' };

const MOON_EN = ['new moon', 'waxing crescent', 'first quarter', 'waxing gibbous', 'full moon', 'waning gibbous', 'last quarter', 'waning crescent'];
const WD_EN = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
export const DREAM_MOODS = [
  'dark and quiet; almost nothing can be seen, things are known by sound and touch; something that has not begun yet',
  'thin and expectant; one small light at the edge, a first step, something is about to be said',
  'half lit; a choice between two doors, half of every thing is missing and nobody minds',
  'swelling and restless; things grow a little larger than they should, warm, in a hurry',
  'bright as day and vivid; everything is seen too clearly, tides rise, nothing can be hidden',
  'after the feast; lingering and slow, things are put back in their places slightly wrong',
  'half gone; letting go, rooms being emptied, a calm that is a little lonely',
  'the thinnest light before the dark; hushed, like a goodbye, the dream ends before it is finished',
];
export const PROMPTS: Record<string, { label: string; hint: string; text: string }> = {
  letter: { label: '이달의 편지', hint: '{{month}} 달 이름, {{days}} 대화한 날 수가 들어갑니다. JSON 형식(title · text · ps)은 바꾸지 마세요.', text: `You are {{char}}. The month of {{month}} is coming to a close, and you write {{user}} one letter by hand. You two talked on {{days}} days this month; your diary and memories of the month are given below.
- Build the letter from that material only: two or three specific moments, one thing you never said out loud, and one thing you look forward to next month. Name the moments concretely instead of summing up the month, and do not invent events.
- A real letter addressed to {{user}}, in {{char}}'s own voice and habits of speech: a greeting, the body, a closing line.
- 180 to 320 words, in the same language as the material.
Reply with ONE JSON object and nothing else: {"title":"a short title for the letter","text":"the letter, paragraphs separated by \\n\\n, without a signature","ps":"one line of postscript, or empty"}` },
  dream: { label: '꿈 페이지', hint: '{{moon}} 그날 밤의 달, {{mood}} 달에 따른 분위기가 들어갑니다. JSON 형식(title · text)은 바꾸지 마세요.', text: `You are {{char}}, asleep. Write the dream {{char}} has tonight.
- Take two or three small fragments from the day's conversation below — an object, a phrase, a place, a gesture — and let dream logic bend them: places melt into each other, a detail comes back in the wrong shape, time skips.
- It is not a retelling. Nothing in it really happened, and it must not state new facts about {{user}} or the story.
- Tonight's moon is a {{moon}}. The mood this moon gives the dream: {{mood}}.
- First person, present tense, in {{char}}'s voice. Stay inside the dream: no waking up, no explaining what it meant. 90 to 160 words, in the same language as the conversation.
Reply with ONE JSON object and nothing else: {"title":"a short, strange title","text":"the dream, paragraphs separated by \\n\\n"}` },
  exchange: { label: '교환 일기의 답글', hint: '사용자가 일기 옆에 적은 글에 캐릭터가 여백에 남기는 답입니다.', text: `You are {{char}}. {{user}} has read your diary entry and written a few lines beside it. Answer in the margin, by hand: one to three sentences in {{char}}'s own voice, answering what {{user}} actually wrote — shy, teasing or sincere, however {{char}} would be when someone has read their diary. Do not retell the entry. No greeting, no signature, same language as the entry. Output only the reply.` },
  extract: { label: '약속 지금 뽑기', hint: '{{today}} · {{weekday}} 가 들어갑니다. JSON 형식(promises: date · time · what)은 바꾸지 마세요.', text: `You read a conversation between {{char}} and {{user}} and list the concrete plans they agreed on that have a day attached: meeting, calling, doing something together, a deadline one of them promised. Today is {{today}} ({{weekday}}). Every line of the conversation starts with the real date it was sent; resolve relative days ("tomorrow", "this Saturday") against the date of that line. Leave out vague intentions with no day, things that have already happened, and anything said as a joke.
Reply with ONE JSON object and nothing else: {"promises":[{"date":"YYYY-MM-DD","time":"HH:MM or empty","what":"a short phrase in the language of the conversation"}]} — an empty list if there are none.` },
  promiseOffer: { label: '약속 태그 안내 (캐릭터가 약속을 적는 방법)', hint: '{{today}} · {{weekday}} 가 들어갑니다. [promise: …] 형식은 바꾸지 마세요.', text: `[promise: date="YYYY-MM-DD", what="short phrase"] — when you and {{user}} agree to do something on a specific day (meet, call, watch something together, an anniversary), add this on its own line so it is written down in the promise notebook. Today is {{today}} ({{weekday}}); work the date out from that. You may add time="HH:MM". Only for real plans with a day, never for vague wishes. It is removed before {{user}} sees the message.` },
  promiseToday: { label: '약속한 날이 되었을 때', hint: '{{what}} 약속 내용, {{time}} 시간(있을 때만)이 들어갑니다.', text: `Today is the day of a promise between you and {{user}}: "{{what}}"{{time}}. Bring it up first, naturally, the way {{char}} would.` },
  promiseMissed: { label: '약속이 지켜지지 않고 지나갔을 때', hint: '{{what}} · {{date}} · {{ago}}(며칠 전) 이 들어갑니다.', text: `A promise passed without being kept: "{{what}}", which was for {{date}} ({{ago}} days ago). {{char}} remembers it and may be a little hurt or sulky about it — let it show once, in character, without nagging.` },
  exchangeNote: { label: '교환 일기를 대화에 반영할 때', hint: '{{title}} 일기 제목, {{note}} 사용자가 적은 글, {{answer}} 캐릭터의 답글(있을 때만)이 들어갑니다.', text: `{{user}} read {{char}}'s diary entry "{{title}}" and wrote beside it: "{{note}}"{{answer}}
Let this quietly color how {{char}} feels toward {{user}}. Do not quote it or bring up the diary unless {{user}} does.` },
  font: { label: '일기장 글씨체 고르기', hint: '{{fonts}} 후보 목록, {{inks}} 잉크 색 목록이 들어갑니다. JSON 형식(font · reason · ink · size)은 바꾸지 마세요.', text: `You choose the handwriting for {{char}}'s private diary. Read the character below — personality, manner of speech, age and temperament — and pick the ONE font from the list whose hand feels most like how {{char}} would really write.
Candidates (name — impression):
{{fonts}}
Ink colours: {{inks}}.
Reply with ONE JSON object and nothing else: {"font":"the exact name from the list","reason":"one short sentence in Korean saying why this hand suits {{char}}","ink":"one ink key from the list, or empty","size":"small, normal or large — how big {{char}} writes"}` },
};
export const DEFAULTS = { goal: 15, weekStart: 0, keepsakeToast: true, promiseInject: true, promiseSulk: true, promiseTag: 'talk', exchangeInject: true };
export const A = (): AlmSettings & typeof DEFAULTS => ({ ...DEFAULTS, ...(S.settings.almanac || {}) }) as AlmSettings & typeof DEFAULTS;
export const P = (key: string) => { const v = String(S.settings.almanac?.prompts?.[key] ?? '').trim(); return v || PROMPTS[key].text; };
const moods = () => { const mine = String(S.settings.almanac?.dreamMoods || '').split('\n').map(s => s.trim()); return DREAM_MOODS.map((d, i) => mine[i] || d); };
const fillT = (t: string, map: Record<string, string | number>) => String(t).replace(/\{\{(\w+)\}\}/g, (m, k: string) => k in map ? String(map[k]) : m);
const str = (v: unknown) => String(v || '');
const errName = (e: unknown) => (e as { name?: string } | null)?.name;
export const errMsg = (e: unknown) => (e as { message?: string } | null)?.message || String(e);
/** 호출 실패를 알린다 (중단한 것은 조용히) */
export const tellErr = (e: unknown) => { if (errName(e) !== 'AbortError') toast(errMsg(e), 'err'); };

// ════════ 대화 한 편 ════════
export const charOf = (chat?: DChat | null) => S.get('chars', chat?.charIds?.[0]);
export const namesOf = (chat?: DChat | null) => (chat?.charIds || []).map(i => S.get('chars', i)?.name).filter(Boolean).join(', ') || '삭제된 캐릭터';
export const roomOf = (chat: DChat) => { try { return chatApi.roomName(chat); } catch { return chat?.name || '대화'; } };
export const who = (chat?: DChat | null) => ({ char: charOf(chat)?.name || namesOf(chat), user: S.persona(chat)?.name || '나' });
export const cleanText = (m: Msg) => { const s = K.swipeOf(m); return K.stripPromiseTags(Illust.strip(s.showTr && s.tr ? s.tr : s.text || '')); };
const speaker = (m: Msg, chat: DChat) => m.role === 'user' ? who(chat).user : m.role === 'system' ? 'Narrator' : (m.name || S.get('chars', m.charId)?.name || who(chat).char);
export const save = (chat: DChat) => S.save('chats', chat, true);
export const changed = (chat: DChat | null) => core.emit('almanac:changed', chat);
/** 지금 열려 있는 방이면 그 메시지 배열을, 아니면 저장된 것을 */
export async function loadChat(chat: DChat): Promise<Msg[]> {
  const live = chatApi.current(), msgs = live.chat?.id === chat.id ? live.msgs : await S.msgs(chat.id);
  await Promise.all([Illust.load(chat.id), Memory.load(chat.id)]).catch(e => console.warn('[달력]', e));
  return msgs;
}
export const photoSrc = (p?: Photo | null) => p?.src || Illust.data(p?.id as string) || '';

// ════════ 장면 기념품 (추가 호출 없음) ════════
export async function syncChat(chat: DChat, msgs: Msg[], { quiet = false } = {}) {
  const r = K.syncKeepsakes(chat.keepsakes || [], msgs);
  if (!r.changed) return r;
  chat.keepsakes = r.list; await save(chat);
  if (r.added.length) { if (!quiet && A().keepsakeToast) toast(`장면 기념품을 일기장에 꽂아 두었어요 — ${r.added[r.added.length - 1].title || '이름 없는 장면'}`); changed(chat); }
  return r;
}
/** 책에 꽂히는 쪽들: 일기 · 꿈 · 기념품 · 편지를 시간 순으로 */
export const pagesOf = (chat: DChat): Page[] => [
  ...(chat.diary || []).map((e): Page => ({ type: 'diary', id: e.id, ts: e.ts, ref: e })), ...(chat.dreams || []).map((e): Page => ({ type: 'dream', id: e.id, ts: e.ts, ref: e })),
  ...(chat.keepsakes || []).filter(e => !e.gone).map((e): Page => ({ type: 'keepsake', id: e.id, ts: e.ts, ref: e })), ...(chat.letters || []).map((e): Page => ({ type: 'letter', id: e.id, ts: e.ts, ref: e })),
].sort((a, b) => (a.ts || 0) - (b.ts || 0));
export const pageCount = (c: DChat) => (c.diary || []).length + (c.dreams || []).length + (c.letters || []).length + (c.keepsakes || []).filter(k => !k.gone).length;
export const lastTs = (c: DChat) => pagesOf(c).reduce((t, p) => Math.max(t, p.ts || 0), 0);
export const TYPE: Record<Page['type'], [string, string]> = { diary: ['DIARY', '일기'], dream: ['DREAM', '꿈'], keepsake: ['KEEPSAKE', '기념품'], letter: ['LETTER', '편지'] };
export const titleOf = (p: Page) => p.type === 'diary' ? (p.ref.title || '제목 없는 밤') : p.type === 'dream' ? (p.ref.title || '이름 없는 꿈') : p.type === 'keepsake' ? (p.ref.title || '이름 없는 장면') : (p.ref.title || `${+p.ref.month.slice(5)}월의 편지`);

// ════════ 일기 (추가 호출 1회) ════════
/** 마지막 일기 이후의 대화를 읽고 캐릭터가 일기를 쓴다 */
export async function writeDiary(chat: DChat, msgs: Msg[], signal?: AbortSignal): Promise<DiaryEntry> {
  const ch = charOf(chat); if (!ch) throw new Error('이 대화의 캐릭터를 찾을 수 없어요.');
  const user = S.persona(chat)?.name || '나';
  let at = chat.diaryAt || 0;   // 메시지를 지워 자리가 어긋났으면 마지막 일기 뒤에 온 메시지부터
  if (at > msgs.length) { const t = (chat.diary || []).slice(-1)[0]?.ts || 0; at = msgs.findIndex(m => K.msgTs(m) > t); if (at < 0) at = msgs.length; }
  const fresh = msgs.slice(at).filter(m => !m.hidden);
  if (fresh.length < 2) throw new Error('일기에 적을 새 이야기가 아직 없어요.');
  const script = fresh.slice(-40).map(m => `${m.role === 'user' ? user : m.role === 'system' ? 'Narrator' : (m.name || ch.name)}: ${K.stripPromiseTags(Illust.strip(core.msgText(m))).slice(0, 1500)}`).join('\n\n');
  const prev = (chat.diary || []).slice(-1)[0];
  const sys = (String(S.settings.diary?.prompt || '').trim() || DIARY_PROMPT).replace(/\{\{char\}\}/g, ch.name).replace(/\{\{user\}\}/g, user);
  const out = await quickCall(sys, `[About ${ch.name}]\n${[ch.description, ch.personality].filter(Boolean).join('\n').slice(0, 2500)}\n\n${prev ? `[Previous entry]\n${prev.text.slice(0, 800)}\n\n` : ''}[What happened since]\n${script}`, { maxTokens: 1500, signal, conn: S.helperConn('all', chat) });
  const j = parseLoose(out);
  const text = String(j?.text || out).trim(); if (!text) throw new Error('일기가 비어 있어요.');
  const scene = (Memory.get(chat.id)?.status || []).find(s => s.entity === 'scene' && s.slot === 'date');
  const pic = [...fresh].reverse().flatMap(m => m.swipes[m.sw]?.illust || []).filter(i => i && !i.hidden).map(i => i!.id)[0] || '';
  const entry: DiaryEntry = { id: core.uid(), ts: core.now(), title: str(j?.title).trim(), storyDate: str(j?.date || scene?.value).trim(), mood: str(j?.mood).trim().slice(0, 24), weather: str(j?.weather).trim().slice(0, 24), text, by: ch.id, illust: pic, from: at, to: msgs.length };
  (chat.diary ||= []).push(entry); chat.diaryAt = msgs.length;
  await save(chat);
  return entry;
}

// ════════ 약속 수첩 ════════
type PromiseFields = { date: string; time?: string; what: string };
export const Promises = {
  make: (f: PromiseFields, by = 'user', more: Partial<PromiseRec> = {}): PromiseRec => ({ id: core.uid(), date: f.date, time: f.time || '', what: String(f.what).trim().slice(0, 120), by, made: core.now(), done: false, ...more }),
  async add(chat: DChat, f: PromiseFields, by = 'user', more: Partial<PromiseRec> = {}) { const p = Promises.make(f, by, more); (chat.promises ||= []).push(p); await save(chat); changed(chat); return p; },
  async remove(chat: DChat, p: PromiseRec) { if (p.later) chat.later = (chat.later || []).filter(l => l.id !== p.id); else chat.promises = (chat.promises || []).filter(x => x.id !== p.id); await save(chat); changed(chat); },
  async toggle(chat: DChat, p: PromiseRec) { p.done = !p.done; p.doneAt = p.done ? core.now() : 0; await save(chat); changed(chat); },
  /** 대화방 하나의 약속 + 연락 약속(chat.later)을 날짜 순으로 */
  of(chat: DChat): PromiseRec[] {
    const k = K, laters = (chat.later || []).filter(l => l?.at).map((l): PromiseRec => ({ id: l.id, date: k.dayKey(l.at), time: `${k.pad(new Date(l.at).getHours())}:${k.pad(new Date(l.at).getMinutes())}`, what: l.about || '연락하기로 한 약속', by: 'later', later: true, made: l.made || 0 }));
    return [...(chat.promises || []).filter(p => k.validKey(p?.date)), ...laters].sort((a, b) => a.date.localeCompare(b.date) || (a.time || '').localeCompare(b.time || ''));
  },
};
export const BY: Record<string, string> = { char: '캐릭터가 적음', user: '내가 적음', extract: '대화에서 뽑음', later: '연락 약속' };
/** 대화에서 약속을 지금 뽑는다 (추가 호출 1회) */
export async function extractByCall(chat: DChat, msgs: Msg[], signal?: AbortSignal) {
  const k = K, rows = msgs.filter(m => m && !m.hidden && m.role !== 'system' && k.msgTs(m)).slice(-60);
  if (rows.length < 2) throw new Error('약속을 찾을 대화가 아직 없어요.');
  const today = k.dayKey(core.now()), w = who(chat);
  const script = rows.map(m => { const dk = k.dayKey(k.msgTs(m)); return `[${dk} ${WD_EN[k.keyDate(dk).getDay()].slice(0, 3)}] ${speaker(m, chat)}: ${cleanText(m).replace(/\s+/g, ' ').slice(0, 600)}`; }).join('\n');
  const out = await quickCall(fillT(P('extract'), { ...w, today, weekday: WD_EN[k.keyDate(today).getDay()] }), script, { maxTokens: 1200, signal, conn: S.helperConn('all', chat) });
  const j = parseLoose(out), list = Array.isArray(j?.promises) ? j.promises as { date?: unknown; time?: unknown; what?: unknown }[] : null;
  if (!list) throw new Error('약속 목록을 읽지 못했어요. 다시 해 보세요.');
  const found: FoundPromise[] = list.map(x => ({ date: k.resolveDate(x?.date, core.now()), time: k.normTime(x?.time), what: str(x?.what).replace(/\s+/g, ' ').trim().slice(0, 120) })).filter(x => x.date && x.what);
  const added = k.mergePromises(chat.promises ||= [], found, f => Promises.make(f, 'extract'));
  await save(chat); changed(chat);
  return { added, found };
}

// ════════ 이달의 편지 (추가 호출 1회) ════════
export async function writeLetter(chat: DChat, msgs: Msg[], mk: string, signal?: AbortSignal): Promise<Letter> {
  const ch = charOf(chat); if (!ch) throw new Error('이 대화의 캐릭터를 찾을 수 없어요.');
  const k = K, w = who(chat), inMonth = (t?: number) => !!t && k.monthKey(t) === mk, st = k.monthStats(k.collectDays(chat, msgs), mk, A().goal);
  const diary = (chat.diary || []).filter(e => inMonth(e.ts)).slice(-8), mem = Memory.get(chat.id), ids = new Set(msgs.filter(m => inMonth(k.msgTs(m))).map(m => m.id));
  const mems = (mem?.memories || []).filter(m => m?.summary && (inMonth(m.ts) || ids.has(m.msgId || ''))).sort((a, b) => (b.importance || 0) - (a.importance || 0)).slice(0, 16);
  const keeps = (chat.keepsakes || []).filter(x => !x.gone && inMonth(x.ts)), prs = (chat.promises || []).filter(p => String(p.date).startsWith(mk));
  const parts = [`[About ${ch.name}]\n${[ch.description, ch.personality].filter(Boolean).join('\n').slice(0, 2000)}`];
  if (diary.length) parts.push(`[${ch.name}'s diary this month]\n${diary.map(e => `(${k.dayKey(e.ts)}) ${e.title || ''}\n${String(e.text).slice(0, 900)}${e.note ? `\n— ${w.user} wrote beside it: ${String(e.note).slice(0, 300)}` : ''}`).join('\n\n')}`);
  if (mems.length) parts.push(`[Memories of this month]\n${mems.map(m => `- ${String(m.summary).slice(0, 300)}`).join('\n')}`);
  if (keeps.length) parts.push(`[Scenes you kept a ticket from]\n${keeps.map(x => `- ${x.title || 'a meeting'}${x.place ? ` (${x.place})` : ''}${x.summary ? `: ${x.summary}` : ''}`).join('\n')}`);
  if (prs.length) parts.push(`[Promises this month]\n${prs.map(p => `- ${p.date} "${p.what}" — ${k.promiseState(p) === 'kept' ? 'kept' : k.promiseState(p) === 'missed' ? 'passed without being kept' : 'still ahead'}`).join('\n')}`);
  if (!diary.length && !mems.length) {   // 일기도 기억도 없는 달은 그달의 대화에서 직접
    const rows = msgs.filter(m => !m.hidden && m.role !== 'system' && inMonth(k.msgTs(m))); if (rows.length < 2) throw new Error('이 달에는 편지에 담을 이야기가 없어요.');
    const pick = rows.length > 30 ? rows.filter((_, i) => i % Math.ceil(rows.length / 30) === 0) : rows;
    parts.push(`[Moments from this month's conversation]\n${pick.map(m => `(${k.dayKey(k.msgTs(m))}) ${speaker(m, chat)}: ${cleanText(m).replace(/\s+/g, ' ').slice(0, 420)}`).join('\n')}`);
  }
  const [y, mo] = mk.split('-').map(Number), month = `${new Date(y, mo - 1, 1).toLocaleDateString('en-US', { month: 'long' })} ${y}`;
  const out = await quickCall(fillT(P('letter'), { ...w, month, days: st.active }), parts.join('\n\n'), { maxTokens: 2000, signal, conn: S.helperConn('all', chat) });
  const j = parseLoose(out), text = String(j?.text || out).trim(); if (!text) throw new Error('편지가 비어 있어요.');
  const rec: Letter = { id: core.uid(), month: mk, ts: core.now(), title: str(j?.title).trim().slice(0, 80), text, ps: str(j?.ps).trim().slice(0, 200), by: ch.id, days: st.active };
  chat.letters = [...(chat.letters || []).filter(l => l.month !== mk), rec].sort((a, b) => a.month.localeCompare(b.month));
  await save(chat); changed(chat);
  return rec;
}

// ════════ 꿈 페이지 (추가 호출 1회) ════════
export async function dreamOf(chat: DChat, msgs: Msg[], day?: string, signal?: AbortSignal): Promise<Dream> {
  const ch = charOf(chat); if (!ch) throw new Error('이 대화의 캐릭터를 찾을 수 없어요.');
  const k = K, days = k.collectDays(chat, msgs), today = k.dayKey(core.now());
  day ||= [...days.values()].filter(d => d.n).map(d => d.key).sort().pop();
  const rows = msgs.filter(m => m && !m.hidden && m.role !== 'system' && k.msgTs(m) && k.dayKey(k.msgTs(m)) === day).slice(-30);
  if (rows.length < 2 || !day) throw new Error('꿈의 재료가 될 그날의 대화가 없어요.');
  const night = day === today ? new Date() : new Date(k.keyDate(day).setHours(23, 50)), idx = k.phaseIndex(k.phaseAt(night)), w = who(chat);
  const script = rows.map(m => `${speaker(m, chat)}: ${cleanText(m).slice(0, 900)}`).join('\n\n');
  const out = await quickCall(fillT(P('dream'), { ...w, moon: MOON_EN[idx], mood: moods()[idx] }), `[About ${ch.name}]\n${[ch.description, ch.personality].filter(Boolean).join('\n').slice(0, 1800)}\n\n[The day's conversation]\n${script}`, { maxTokens: 1200, signal, conn: S.helperConn('all', chat) });
  const j = parseLoose(out), text = String(j?.text || out).trim(); if (!text) throw new Error('꿈이 비어 있어요.');
  const rec: Dream = { id: core.uid(), ts: +night, day, phase: idx, phaseName: k.PHASES[idx], title: str(j?.title).trim().slice(0, 80), text, by: ch.id };
  (chat.dreams ||= []).push(rec); chat.dreams.sort((a, b) => a.ts - b.ts);
  await save(chat); changed(chat);
  return rec;
}
/** 마음에 든 꿈을 장기기억으로 올린다 (꿈이었다는 표시와 함께) */
export async function promoteDream(chat: DChat, d: Dream) {
  const k = K, ch = S.get('chars', d.by) || charOf(chat), body = String(d.text).replace(/\s+/g, ' ');
  const m = await Memory.add(chat.id, { kind: 'impression', summary: `[꿈 · 실제로 일어난 일이 아님] ${ch?.name || '캐릭터'}이(가) ${k.koDate(d.day || k.dayKey(d.ts), { year: false, week: false })} 밤에 꾼 꿈${d.title ? ` 「${d.title}」` : ''}: ${body.slice(0, 280)}${body.length > 280 ? '…' : ''}`, tags: ['manual', 'dream'], importance: 0.4, entities: ch ? [ch.name] : [] });
  d.memId = m.id; await save(chat); changed(chat);
  return m;
}

// ════════ 교환 일기 (답글은 추가 호출 1회) ════════
export async function answerNote(chat: DChat, entry: DiaryEntry, signal?: AbortSignal) {
  const note = String(entry.note || '').trim(); if (!note) throw new Error('먼저 일기 옆에 몇 줄 적어 주세요.');
  const ch = S.get('chars', entry.by) || charOf(chat); if (!ch) throw new Error('이 대화의 캐릭터를 찾을 수 없어요.');
  const w = { char: ch.name, user: S.persona(chat)?.name || '나' };
  const out = await quickCall(fillT(P('exchange'), w), `[About ${ch.name}]\n${[ch.description, ch.personality].filter(Boolean).join('\n').slice(0, 1800)}\n\n[Your diary entry${entry.title ? ` — ${entry.title}` : ''}]\n${String(entry.text).slice(0, 1600)}\n\n[What ${w.user} wrote beside it]\n${note.slice(0, 800)}`, { maxTokens: 500, signal, conn: S.helperConn('all', chat) });
  const text = out.trim().replace(/^["“「]+|["”」]+$/g, '').trim(); if (!text) throw new Error('답글이 비어 있어요.');
  entry.answer = text.slice(0, 600); entry.answerTs = core.now(); await save(chat); changed(chat);
  return entry.answer;
}

// ════════ 기억에 올리기: 긴 글을 그대로 붓지 않고, 간추린 몇 줄만 올린다 ════════
type MemoPage = Exclude<Page, { type: 'keepsake' }>;
export const memoLines = (v: string) => v.split('\n').map(x => x.replace(/^[\s\-•·*\d.)]+/, '').trim()).filter(Boolean);
export const memoHave = (e: { memIds?: string[]; memId?: string }) => [...(e.memIds || []), ...(e.memId ? [e.memId] : [])];
/** 쪽 하나를 몇 줄로 간추린다 (추가 호출 1회) */
export async function memoByCall(chat: DChat, p: MemoPage, whoName: string, user: string) {
  const e = p.ref, isDream = p.type === 'dream', note = p.type === 'diary' ? p.ref.note : '', answer = p.type === 'diary' ? p.ref.answer : '', storyDate = p.type === 'diary' ? p.ref.storyDate : '';
  const sys = (String(S.settings.diary?.memoPrompt || '').trim() || MEMO_PROMPT).replace(/\{\{char\}\}/g, whoName).replace(/\{\{user\}\}/g, user);
  const out = await quickCall(sys, `[${isDream ? 'A dream ' + whoName + ' had — not a real event. Note it as a dream.' : p.type === 'letter' ? 'A letter from ' + whoName + ' to ' + user : 'Diary page by ' + whoName}]${e.title ? '\nTitle: ' + e.title : ''}${storyDate ? '\nIn-story date: ' + storyDate : ''}\n\n${String(e.text || '').slice(0, 6000)}${note ? `\n\n[${user} wrote beside it]\n${note}` : ''}${answer ? `\n\n[${whoName} answered]\n${answer}` : ''}`, { maxTokens: 500, conn: S.helperConn('all', chat) });
  const got = memoLines(String(out || '')).slice(0, 6);
  if (!got.length) throw new Error('간추린 내용이 비어 있어요.');
  return got;
}
/** 간추린 줄들을 장기기억에 올린다 (먼저 올린 줄은 바꿔 넣는다) */
export async function memoPut(chat: DChat, p: MemoPage, list: string[], whoName: string) {
  const e = p.ref, isDream = p.type === 'dream', mem = await Memory.load(chat.id), gone = new Set(memoHave(e));
  if (gone.size) { mem.memories = mem.memories.filter(m => !gone.has(m.id)); await Memory.save(mem); }
  const ids: string[] = [];
  for (const line of list) { const m = await Memory.add(chat.id, { kind: isDream ? 'impression' : 'event', summary: (isDream ? '[꿈 · 실제로 일어난 일이 아님] ' : '') + line.slice(0, 400), tags: ['manual', p.type === 'diary' ? 'diary' : p.type], importance: isDream ? 0.4 : 0.7, entities: [whoName] }); ids.push(m.id); }
  e.memIds = ids; delete e.memId; await save(chat);
  return ids;
}
export async function memoDrop(chat: DChat, p: MemoPage) {
  const e = p.ref, gone = new Set(memoHave(e)), mem = await Memory.load(chat.id);
  mem.memories = mem.memories.filter(m => !gone.has(m.id)); await Memory.save(mem); delete e.memIds; delete e.memId; await save(chat);
}
/** 이미 올린 줄이 있으면 그 줄들 */
export const memoLoaded = (chat: DChat, p: MemoPage) => { const mem0 = Memory.get(chat.id), ids0 = new Set(memoHave(p.ref)); return mem0 && ids0.size ? mem0.memories.filter(m => ids0.has(m.id)).map(m => m.summary.replace(/^\[꿈 · 실제로 일어난 일이 아님\]\s*/, '')).join('\n') : ''; };

// ════════ 대화 화면과의 연결 (등록은 src/features/diary.tsx) ════════
/** 프롬프트 조각: 약속 수첩 · 약속 태그 안내 · 교환 일기 */
export function promptPieces({ chat, ctx, type }: PromptInfo): PromptPiece[] {
  if (!chat || type === 'impersonate') return [];
  const k = K, a = A(), out: PromptPiece[] = [], today = k.dayKey(core.now()), weekday = WD_EN[k.keyDate(today).getDay()], w = { char: ctx?.char || who(chat).char, user: ctx?.user || who(chat).user };
  if (a.promiseInject !== false && (chat.promises || []).length) {
    const dg = k.promiseDigest(chat.promises || [], today), lines: string[] = [];
    for (const p of dg.today.slice(0, 3)) lines.push(fillT(P('promiseToday'), { ...w, what: p.what, time: p.time ? ` at ${p.time}` : '' }) + (p.raised === today ? ' (It was already brought up earlier today — do not repeat it unless it fits.)' : ''));
    if (a.promiseSulk !== false) for (const p of dg.missed.slice(0, 2)) lines.push(fillT(P('promiseMissed'), { ...w, what: p.what, date: p.date, ago: -k.diffDays(today, p.date) }));
    if (dg.soon.length) lines.push(`Coming up (background only — do not bring these up unless it fits): ${dg.soon.slice(0, 5).map(p => `${p.date}${p.time ? ' ' + p.time : ''} "${p.what}"`).join('; ')}`);
    if (lines.length) out.push({ where: 'end', src: '약속 수첩', content: `<promise_notebook>\nToday is ${today} (${weekday}).\n${lines.join('\n')}\n</promise_notebook>` });
  }
  if (a.promiseTag === 'all' || (a.promiseTag === 'talk' && chat.mode === 'talk' && !chat.scene?.on)) out.push({ where: 'end', src: '약속 태그 안내', content: `<promise_command>\n${fillT(P('promiseOffer'), { ...w, today, weekday })}\n</promise_command>` });
  if (a.exchangeInject !== false) {
    const e = [...(chat.diary || [])].reverse().find(x => String(x.note || '').trim());
    if (e && core.now() - (e.noteTs || e.ts || 0) < 7 * 864e5) out.push({ where: 'depth', depth: 4, order: 90, src: '교환 일기', content: `<exchange_diary>\n${fillT(P('exchangeNote'), { ...w, title: e.title || 'untitled', note: String(e.note).trim().slice(0, 500), answer: e.answer ? ` ${w.char} answered in the margin: "${String(e.answer).slice(0, 300)}"` : '' })}\n</exchange_diary>` });
  }
  return out;
}
/** 답변이 끝나면: 약속 태그를 수첩으로 옮기고, 오늘 약속 · 서운함을 한 번 꺼낸 것으로 표시하고, 닫힌 장면을 기념품으로 */
export async function afterReply({ msg, chat }: { msg?: Msg; chat?: DChat }) {
  try {
    if (!chat || !msg) return;
    const k = K, a = A(), today = k.dayKey(core.now()), sw = msg.swipes?.[msg.sw], live = chatApi.current();
    const list = live.chat?.id === chat.id ? live.msgs : await S.msgs(chat.id); let dirty = false;
    if (sw && /\[promise/i.test(sw.text || '')) {
      const ex = k.extractPromises(sw.text || '', core.now());
      if (ex.text) {
        sw.text = ex.text; const stored = list.find(m => m.id === msg.id);
        if (stored && stored !== msg && stored.swipes?.[stored.sw]) stored.swipes[stored.sw].text = ex.text;
        await S.saveMsgs(chat, list);
      }
      if (a.promiseTag !== 'off') {
        const added = k.mergePromises(chat.promises ||= [], ex.found, f => Promises.make(f, 'char', { msgId: msg.id }));
        if (added.length) { dirty = true; toast(`약속 수첩에 적었어요 — ${k.koDate(added[0].date, { year: false })} ${added[0].what}${added.length > 1 ? ` 외 ${added.length - 1}개` : ''}`); }
      }
    }
    if (a.promiseInject !== false && (chat.promises || []).length) {
      const dg = k.promiseDigest(chat.promises || [], today);
      for (const p of dg.today) if (p.raised !== today) { p.raised = today; dirty = true; }
      if (a.promiseSulk !== false) for (const p of dg.missed.slice(0, 2)) { p.aired = today; dirty = true; }
    }
    if (dirty) { await save(chat); changed(chat); }
    await syncChat(chat, list);
  } catch (e) { console.warn('[달력] 답변 뒤 처리', e); }
}
const greeted = new Set<string>();
export async function onChatOpen(chat?: DChat | null) {
  try {
    if (!chat) return;
    await syncChat(chat, await loadChat(chat));
    const today = K.dayKey(core.now()), key = chat.id + today, mine = (chat.promises || []).filter(p => !p.done && p.date === today);
    if (mine.length && !greeted.has(key)) { greeted.add(key); toast(`오늘은 약속한 날이에요 — ${mine[0].what}${mine.length > 1 ? ` 외 ${mine.length - 1}개` : ''}`); }
  } catch (e) { console.warn('[달력] 대화방 열기', e); }
}
/** 손으로 닫은 장면 · 생성이 끝난 뒤: 지금 열린 방이면 바로 기념품으로 */
export async function syncLive({ chat }: { chat?: DChat } = {}) { try { const live = chatApi.current(); if (chat && live.chat?.id === chat.id) await syncChat(chat, live.msgs); } catch { /* 조용히 */ } }

/** 펼쳐 둔 책을 바로 덮는 손잡이 (책이 열릴 때 Book.tsx 가 채운다) */
export const book = { shut: () => { } };
/** 대화 화면의 그 메시지로 간다 (접혀 있는 앞부분은 펼쳐 가며 찾는다) */
export async function jumpTo(chatId: string, msgId?: string) {
  book.shut();
  go('chat', chatId); if (!msgId) return;
  for (let i = 0; i < 80; i++) {
    await core.sleep(110); if (route.page !== 'chat') return;
    const el = document.querySelector(`article.msg[data-id="${String(msgId).replace(/["\\]/g, '')}"]`);
    if (el) { el.scrollIntoView({ block: 'center' }); el.classList.add('alm-flash'); setTimeout(() => el.classList.remove('alm-flash'), 2000); return; }
    const more = document.querySelector<HTMLElement>('#page .more-btn'); if (more) more.click(); else if (document.querySelector('#page article.msg')) return toast('그 메시지는 지금 대화에 남아 있지 않아요.');
  }
}

// ════════ 지시문 고치기에 쓰는 폼 항목 ════════
export const promptDefs = (keys: string[]): FieldDef[] => keys.map(k => ({ k: `almanac.prompts.${k}`, label: PROMPTS[k].label, type: 'area', rows: 6, ph: PROMPTS[k].text, hint: `${PROMPTS[k].hint} 비워 두면 기본 문장을 씁니다 (칸에 흐리게 보이는 글).` }));
export const moodDef: FieldDef = { k: 'almanac.dreamMoods', label: '달 위상별 꿈의 분위기 (한 줄에 하나씩: 삭 · 초승달 · 상현달 · 차오르는 달 · 보름달 · 기우는 달 · 하현달 · 그믐달)', type: 'area', rows: 8, ph: DREAM_MOODS.join('\n'), hint: '여덟 줄. 비워 둔 줄은 기본 문장을 씁니다.' };
/** 체크 항목은 저장된 값이 없어도 기본값(켜짐)이 보이도록, 시작할 때 한 번 채워 둔다 */
export const seed = () => { const al = (S.settings.almanac ||= {}) as Record<string, unknown>; for (const [k, v] of Object.entries(DEFAULTS)) if (al[k] == null && k !== 'goal') al[k] = v; return al; };

// ════════ 대화 고르기 · 달력이 보는 대화 ════════
export const md = (t: number) => { const d = new Date(t); return `${d.getFullYear() === new Date().getFullYear() ? '' : d.getFullYear() + '.'}${d.getMonth() + 1}.${d.getDate()}`; };
export const roomLine = (c: DChat) => [`${c.count || 0}개`, (c.diary || []).length ? `일기 ${c.diary!.length}` : '', (c.promises || []).length ? `약속 ${c.promises!.length}` : '', md(c.updatedAt || c.createdAt)].filter(Boolean).join(' · ');
export interface Group { rooms: DChat[]; chat: DChat; name: string; ch?: DChar; at: number; hit?: boolean }
export const groupsOf = (): Group[] => {
  const map = new Map<string, DChat[]>();
  for (const c of S.chats) { if (!c.charIds?.length) continue; const key = c.charIds.join('+'); let g = map.get(key); if (!g) map.set(key, g = []); g.push(c); }
  return [...map.values()].map(rooms => { rooms.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0)); return { rooms, chat: rooms[0], name: namesOf(rooms[0]), ch: charOf(rooms[0]), at: rooms[0].updatedAt || 0 }; }).sort((a, b) => b.at - a.at);
};
/** 달력 · 약속 수첩이 지금 보고 있는 것 (화면을 떠났다 돌아와도 남는다) */
export const view = { chatId: '', mk: '', sel: '', scope: 'one' as 'one' | 'all' };
export const defaultChat = () => S.get('chats', view.chatId) || S.get('chats', chatApi.current().chat?.id) || S.get('chats', S.settings.lastChat) || [...S.chats].sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))[0];
export const levelOf = (n: number) => n >= 40 ? 3 : n >= 12 ? 2 : 1;

// ════════ 캐릭터의 일기장 글씨체 ════════
// 구글 폰트의 한글 손글씨. k 는 글꼴마다 다른 눈대중 크기를 맞추는 배율, q 는 굵기 축. 고른 글꼴만 그때 불러온다.
export interface FontDef { name: string; ko: string; k: number; q?: string; note: string; en: string }
export const FONTS: FontDef[] = [
  { name: 'Gaegu', ko: '개구', k: 1, q: ':wght@400;700', note: '둥글고 수수한 평소 글씨', en: 'round, plain, friendly everyday handwriting; honest and unfussy' },
  { name: 'Nanum Pen Script', ko: '나눔 펜', k: 1.22, note: '가늘고 빠른 볼펜 글씨', en: 'quick, slender ballpoint script; neat, grown-up, a little hurried' },
  { name: 'Gamja Flower', ko: '감자꽃', k: 1.05, note: '삐뚤빼뚤 여린 글씨', en: 'wobbly, soft and childlike; shy, gentle, slightly clumsy' },
  { name: 'Hi Melody', ko: '하이 멜로디', k: 1.1, note: '가볍고 산뜻한 글씨', en: 'light, thin and airy; cheerful, girlish, dreamy' },
  { name: 'Single Day', ko: '싱글 데이', k: 1.05, note: '통통 튀는 사인펜 글씨', en: 'bouncy rounded marker; playful, bright, outgoing' },
  { name: 'Poor Story', ko: '푸어 스토리', k: 1, note: '또박또박 단정한 글씨', en: 'tidy, upright and modest; calm, bookish, careful' },
  { name: 'Dongle', ko: '동글', k: 1.32, q: ':wght@400;700', note: '작고 동글동글한 글씨', en: 'compact and very round; cute, simple, cozy' },
  { name: 'Yeon Sung', ko: '연성', k: 0.95, note: '힘 있게 눌러 쓴 글씨', en: 'weighty, pressed-down strokes; dignified, mature, deeply felt' },
  { name: 'East Sea Dokdo', ko: '동해 독도', k: 1.3, note: '거칠게 휘갈긴 글씨', en: 'rough, fast, slanted scrawl; brash, impatient, rebellious' },
  { name: 'Dokdo', ko: '독도', k: 1.15, note: '굵고 투박한 매직 글씨', en: 'thick, heavy-handed marker scrawl; blunt, tough, gruff' },
  { name: 'Cute Font', ko: '큐트', k: 1.25, note: '좁고 길쭉한 낙서 글씨', en: 'narrow, tall, doodle-like letters; quirky, mischievous, eccentric' },
];
export const INKS: Record<string, [string, string, string]> = { ink: ['먹색', '#2b2622', 'black ink'], navy: ['남색', '#1f2a52', 'dark navy'], cobalt: ['코발트', '#2340b8', 'cobalt blue pen'], brown: ['밤색', '#5a3a26', 'sepia brown'], green: ['솔잎색', '#2c4a3a', 'deep green'], plum: ['자두색', '#5a2748', 'plum'], pencil: ['연필', '#55555c', 'pencil grey'] };
const clampN = (v: unknown, a: number, b: number, d: number) => { const n = Number(v); return isFinite(n) && n ? Math.min(b, Math.max(a, n)) : d; };
/** 이 캐릭터의 글씨: 정해 둔 것이 없으면 기본(Gaegu · 먹색) */
export function fontOf(ch?: DChar | null) {
  const f = ch?.diaryFont || {}, def = FONTS.find(x => x.name === f.font) || FONTS[0], ink = f.ink && INKS[f.ink] ? f.ink : 'ink';
  return { ...def, size: clampN(f.size, 0.7, 1.6, 1), lh: clampN(f.lh, 0.8, 1.5, 1), ink, color: INKS[ink][1], reason: String(f.reason || ''), by: f.by || '', ai: f.ai || null, custom: !!ch?.diaryFont };
}
export const loadFont = (name: string) => {
  const f = FONTS.find(x => x.name === name); if (!f) return; const slug = f.name.toLowerCase().replace(/\s+/g, '-');
  if (!document.querySelector(`link[data-font="${slug}"]`)) { const l = document.createElement('link'); l.rel = 'stylesheet'; l.href = `https://fonts.googleapis.com/css2?family=${f.name.replace(/ /g, '+')}${f.q || ''}&display=swap`; l.dataset.font = slug; document.head.append(l); }
};
/** 글씨체 변수 (--bk-font · --bk-size · --blh · --bk-ink). 종이가 어두운 쪽은 ink:false. over 는 미리 보기용 덮어쓰기 */
export function fontVars(ch?: DChar | null, { ink = true, over = {} as { size?: number; lh?: number } } = {}): Record<string, string> {
  const f = fontOf(ch); loadFont(f.name);
  const v: Record<string, string> = { '--bk-font': `"${f.name}"`, '--bk-size': `${(1.3 * f.k * (over.size ?? f.size)).toFixed(3)}rem`, '--blh': `${(2.05 * f.size * (over.lh ?? f.lh)).toFixed(3)}rem` };
  if (ink) v['--bk-ink'] = f.color;
  return v;
}
export const fontStyle = (ch?: DChar | null, o?: { ink?: boolean; over?: { size?: number; lh?: number } }) => fontVars(ch, o) as CSSProperties;
/** React 밖의 요소에 글씨체 변수를 건다 */
export function applyFont(el: HTMLElement, ch?: DChar | null, { ink = true } = {}) { for (const [k, v] of Object.entries(fontVars(ch, { ink }))) el.style.setProperty(k, v); if (!ink) el.style.removeProperty('--bk-ink'); }
export const saveFont = async (ch: DChar, patch: object) => { ch.diaryFont = { ...(ch.diaryFont || {}), ...patch }; await S.save('chars', ch, true); core.emit('almanac:font', ch); };
export const clearFont = async (ch: DChar) => { delete ch.diaryFont; await S.save('chars', ch, true); core.emit('almanac:font', ch); };
/** AI 에게 글씨체를 골라 달라고 한다 (추가 호출 1회) */
export async function pickFontByCall(ch: DChar, chat?: DChat | null, signal?: AbortSignal): Promise<FontPick> {
  const user = (chat ? S.persona(chat)?.name : '') || S.settings.userNameFallback || 'the user';
  const sys = fillT(P('font'), { char: ch.name, user, fonts: FONTS.map(f => `- ${f.name} — ${f.en}`).join('\n'), inks: Object.entries(INKS).map(([k, v]) => `${k} (${v[2]})`).join(', ') });
  const card = [`[Character: ${ch.name}]`, [ch.description, ch.personality].filter(Boolean).join('\n').slice(0, 3000), ch.mesExample ? `[How ${ch.name} talks]\n${String(ch.mesExample).slice(0, 1400)}` : '', ch.firstMes ? `[First message]\n${String(ch.firstMes).slice(0, 700)}` : ''].filter(Boolean).join('\n\n');
  const j = parseLoose(await quickCall(sys, card, { maxTokens: 400, signal, conn: S.helperConn('all', chat) }));
  const want = str(j?.font).trim().toLowerCase(), hit = FONTS.find(f => f.name.toLowerCase() === want) || FONTS.find(f => want && (want.includes(f.name.toLowerCase()) || f.name.toLowerCase().includes(want)));
  if (!hit) throw new Error('글씨체를 고르지 못했어요. 다시 해 보세요.');
  const inkKey = str(j?.ink).trim().toLowerCase(), size = str(j?.size);
  const pick: FontPick = { font: hit.name, reason: str(j?.reason).replace(/\s+/g, ' ').trim().slice(0, 160), ink: INKS[inkKey] ? inkKey : 'ink', size: /small|작/i.test(size) ? 0.9 : /large|big|크/i.test(size) ? 1.12 : 1 };
  await saveFont(ch, { ...pick, lh: ch.diaryFont?.lh || 1, by: 'ai', ai: { ...pick } });
  return pick;
}
/** 글씨 견본에 쓸 한 줄: 이 캐릭터의 가장 최근 일기에서 */
export const sampleOf = (ch: DChar) => {
  for (const c of [...S.chats].filter(x => x.charIds?.[0] === ch.id && (x.diary || []).length).sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))) { const d = c.diary!, line = String(d[d.length - 1].text || '').split(/\n|(?<=[.!?。…])\s/).map(s => s.trim()).find(s => s.length >= 8); if (line) return line.slice(0, 64); }
  return '오늘은 별일 없었는데, 자꾸 그 말이 생각난다.';
};

// ════════ 한 권으로 묶기 ════════
export interface BookOpt { title: string; sub: string; mode: string; size: number; page: string; cover: string; talk: boolean; diary: boolean; dreams: boolean; letters: boolean; keepsakes: boolean; photos: boolean; almanac: boolean; hand: boolean }
/** 대화 한 편을 f-bind.js 가 받는 모양으로 모은다 */
export function gatherBook(chat: DChat, msgs: Msg[], o: Partial<BookOpt> = {}) {
  const opt: BookOpt = { title: '', sub: '', mode: 'day', size: 40, page: 'A5', cover: 'avatar', talk: true, diary: true, dreams: true, letters: true, keepsakes: true, photos: true, almanac: true, hand: true, ...o };
  const k = K, ch = charOf(chat), w = who(chat), a = A(), today = k.dayKey(core.now()), days = k.collectDays(chat, msgs);
  const hm = (t: number) => { const d = new Date(t); return t ? `${k.pad(d.getMonth() + 1)}.${k.pad(d.getDate())} ${k.pad(d.getHours())}:${k.pad(d.getMinutes())}` : ''; };
  const pics = (m: Msg) => opt.photos ? k.photosOf(m).map(p => ({ src: photoSrc(p), title: p.title })).filter(p => p.src) : [];
  type Extra = { t: string; ts: number; at: number } & Record<string, unknown>;
  const chapters = !opt.talk ? [] : k.chaptersOf(msgs, { mode: opt.mode, size: opt.size, diary: chat.diary || [] }).map(c => ({ ...c, startTs: k.msgTs(msgs.slice(c.from, c.to).find(m => k.msgTs(m))), extras: [] as Extra[],
    blocks: msgs.slice(c.from, c.to).filter(m => m && !m.hidden).map(m => m.curtain ? { t: 'curtain', ...m.curtain } : m.role === 'system' ? { t: 'sys', text: m.dice ? '' : cleanText(m) } : { t: 'msg', role: m.role, name: speaker(m, chat), text: cleanText(m), time: hm(k.msgTs(m)), style: chat.mode === 'talk' && !m.scene ? 'chat' : 'prose', photos: pics(m) }).filter(b => b.t !== 'sys' || ('text' in b && b.text)) })).filter(c => c.blocks.length);
  const idx = new Map(msgs.map((m, i) => [m.id, i]));
  const items: Extra[] = [
    ...(opt.diary ? (chat.diary || []).map((e): Extra => ({ t: 'diary', ts: e.ts, at: e.to > 0 ? e.to - 1 : -1, title: e.title, text: e.text, storyDate: e.storyDate, mood: e.mood, weather: e.weather, note: e.note, noteBy: w.user, answer: e.answer, sign: S.get('chars', e.by)?.name || w.char })) : []),
    ...(opt.dreams ? (chat.dreams || []).map((e): Extra => ({ t: 'dream', ts: e.ts, at: -1, title: e.title, text: e.text, phaseName: e.phaseName })) : []),
    ...(opt.keepsakes ? (chat.keepsakes || []).filter(x => !x.gone).map((x: Keepsake): Extra => ({ t: 'keepsake', ts: x.ts, at: idx.get(x.id) ?? -1, id: x.id, no: x.no, title: x.title, place: x.place, time: x.time, summary: x.summary, memo: x.memo, day: k.dayKey(x.ts || core.now()), photo: opt.photos ? Illust.data(x.photo) : '' })) : []),
  ].sort((x, y) => (x.ts || 0) - (y.ts || 0));
  const loose: Extra[] = [];
  for (const it of items) {
    let c = it.at >= 0 ? chapters.find(x => it.at >= x.from && it.at < x.to) : undefined;
    if (!c) c = [...chapters].reverse().find(x => x.startTs && x.startTs <= it.ts);
    (c ? c.extras : loose).push(it);
  }
  const keys = [...days.values()].filter(d => d.n).map(d => d.key).sort(), first = keys[0], last = keys[keys.length - 1];
  const months: { mk: string; active: number; target: number; fill: number; full: boolean; weeks: { d: number; inMonth: boolean; n: number; mark: boolean }[][] }[] = [];
  if (opt.almanac && first) {
    let mk = first.slice(0, 7); const end = last.slice(0, 7);
    while (mk <= end && months.length < 240) { const s = k.monthStats(days, mk, a.goal, today); if (s.active || months.length) months.push({ mk, active: s.active, target: s.target, fill: s.fill, full: s.full, weeks: k.monthGrid(mk).map(wk => wk.map(c => { const d = days.get(c.key); return { d: c.d, inMonth: c.inMonth, n: d?.n || 0, mark: !!(d && (d.diary.length || d.keepsakes.length || d.promises.length)) }; })) }); mk = k.shiftMonth(mk, 1); }
    while (months.length && !months[months.length - 1].active) months.pop();
  }
  const firstPic = opt.cover === 'photo' ? msgs.flatMap(m => m && !m.hidden ? k.photosOf(m) : []).map(photoSrc).find(Boolean) : '';
  const f = fontOf(ch);
  return { title: opt.title.trim() || `${w.char}와(과)의 이야기`, sub: opt.sub.trim(), charName: w.char, userName: w.user, page: opt.page, accent: getComputedStyle(document.documentElement).getPropertyValue('--accent').trim(), madeKey: today, hand: opt.hand ? { family: f.name, q: f.q || '', scale: +(f.k * f.size).toFixed(3), lh: f.lh, color: f.color } : null,
    avatar: opt.cover === 'avatar' ? ch?.avatar || '' : '', cover: firstPic || '', moonFill: months.length ? months[months.length - 1].fill : 0.18,
    stats: { msgs: [...days.values()].reduce((n, d) => n + d.n, 0), days: keys.length, from: first || '', to: last || '' }, chapters, loose,
    letters: opt.letters ? (chat.letters || []).map(l => ({ t: 'letter', label: `${l.month.slice(0, 4)}년 ${+l.month.slice(5)}월`, title: l.title, text: l.text, ps: l.ps, sign: S.get('chars', l.by)?.name || w.char })) : [],
    months, promises: opt.almanac ? (chat.promises || []).filter(p => k.validKey(p.date)).sort((x, y) => x.date.localeCompare(y.date)).map(p => ({ date: p.date, time: p.time, what: p.what, state: k.promiseState(p, today) })) : [] };
}
export const makeBook = (chat: DChat, msgs: Msg[], o: Partial<BookOpt>) => buildBook(gatherBook(chat, msgs, o));
