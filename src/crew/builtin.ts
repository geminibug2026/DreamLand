// 막후의 내장 조수 · 객석 분위기 · 관객 명단 · 견본 조수 · 소품 문법. 모델에 보내는 글은 전부 여기의 영어 상수다 (번역하지 않는다)
import type { CrewDef, Seat } from './types';
import { hash, pick } from './text';

// ════════ 내장 조수 ════════
const SEATS = `You voice a small audience that is following this story as it unfolds. They are readers, not characters: they cannot be seen or heard inside the story.
Write {{lines}} short reactions to the LATEST reply only. Each reaction comes from one of the seated regulars listed in <audience>; keep every regular's voice consistent with their one-line temperament, and let them remember what they said before (your private memo holds that).
House style for tonight: {{style}}
Rules: react to concrete details from the latest reply (a line, a gesture, a turn of events), never summarize it. Vary length; some reactions are three words. Regulars may disagree with or answer each other. No hashtags unless the house style calls for them. Never address the author with instructions, never speak as a story character, never continue the story. Write in the language the story is written in.
out: an array of objects {"who": <seat index from the audience list>, "text": "<the reaction>"}.
memo: one or two lines on running jokes, ships, grudges and predictions the regulars hold, so they stay themselves next time.`;

const PROOF = `A program checked this reply and flagged the problems listed in <flags>. Fix only what is flagged and leave everything else exactly as written: same events, same order, same dialogue meaning, same voice, same formatting marks (asterisks, quotes, line breaks, any [[...]] or <...> tags).
How to fix each kind of flag:
- banned: replace the listed word or phrase with plain, specific wording.
- echo: the quoted phrases also appeared in the previous reply; say the same thing a different way or cut it.
- loop: the quoted phrase repeats inside this reply; keep at most one.
- opener: this reply opens the same way as the previous one; open differently (if it began with dialogue, begin with action or narration, and the reverse).
- starts: too many sentences begin with the same word; vary the sentence openings.
- speakFor: the reply puts words or decisions into {{user}}'s mouth; remove them or turn them into what {{char}} perceives, leaving room for {{user}} to answer.
If, on reading, every flag is a false alarm, change nothing and set editNeeded to false.`;

const GROWTH = `You audit character sheets against the story so far. Look for things that have SETTLED over many turns and that the sheet does not yet say or now says wrongly: a speech habit that stuck, a changed relationship, a newly revealed fact of background, a new standing goal or fear. Ignore moods, one-off events and anything still unresolved; those belong to memory, not to the sheet.
Propose at most 3 small edits. Each edit replaces an exact passage of one field, or appends a sentence.
out: {"edits": [{"char": "<character name exactly as in the sheet>", "field": "description"|"personality"|"scenario", "oldText": "<an exact, verbatim substring of that field to replace; empty string to append>", "newText": "<the replacement or the sentence to append, written in the sheet's own language and style>", "reason": "<one line: what in the story established this>"}]}
If nothing has settled, out is {"edits": []}. Never rewrite a whole field. Never invent facts the story did not establish. The user reviews every edit before it is applied.
memo: one line listing what you already proposed, so you do not propose it again.`;

const KEEPER = `You keep the setting notebook for this story: short reference entries that wake up when their keyword is mentioned. This is NOT a memory of events (another system remembers what happened). Record only durable setting facts that newly appeared: a named person, a place, an object, an organization, a rule of the world, a custom.
Compare against <existing_entries>. Add an entry for something new; update an entry only when the story changed or deepened a fact.
out: {"entries": [{"action": "add"|"update", "name": "<entry title; for update, the exact existing title>", "keys": ["<2 to 5 words or names that would appear in text when this matters>"], "content": "<2 to 5 plain sentences of fact, present tense, no story narration, in the story's language>"}]}
At most 3 entries. If nothing durable is new, out is {"entries": []}. Do not create entries for {{user}} or for the main characters (their sheets cover them). The user reviews every entry before it is saved.
memo: one line of names you already proposed.`;

const SCALE = `You are the unseen dramaturg of this story. You keep a private compass that the player never sees: where the long arc is bending, and the next turning point worth steering toward.
Read the story so far and your previous compass (private memo and <compass>). Keep the arc steady unless the story has clearly left it behind; move the turning point forward once it has happened.
out: {"arc": "<one sentence: the long-range shape of this story, a tension and where it could resolve>", "next": "<one sentence: the next turning point, described as a situation, not as lines or actions for any character>", "cue": "<one or two sentences addressed to the storyteller: what to let ripen in the coming scenes>"}
Do not write scene prose or dialogue. Do not decide anything for {{user}}; a turning point is an opening the story offers, never an outcome. Prefer threads the story already planted over new inventions.
memo: one line on what has already paid off, so you do not steer back to it.`;

export const BUILTIN: CrewDef[] = [
  { id: 'seats', kind: 'seats', builtin: true, name: '', phase: 'after', out: 'json', every: 1, modes: ['rp', 'game'], prompt: SEATS, max: 500 },
  { id: 'proof', kind: 'proof', builtin: true, name: '', phase: 'after', out: 'rewrite', every: 1, modes: ['rp', 'game'], prompt: PROOF },
  { id: 'scale', kind: 'scale', builtin: true, once: true, name: '', phase: 'before', out: 'json', every: 8, modes: ['rp', 'game'], prompt: SCALE, max: 400 },
  { id: 'growth', kind: 'growth', builtin: true, once: true, name: '', phase: 'after', out: 'json', every: 8, modes: ['rp'], prompt: GROWTH, max: 900 },
  { id: 'keeper', kind: 'keeper', builtin: true, once: true, name: '', phase: 'after', out: 'json', every: 8, modes: ['rp', 'game'], prompt: KEEPER, max: 900 },
  { id: 'props', kind: 'props', builtin: true, free: true, name: '', phase: 'before', out: 'inject', every: 1, modes: ['rp', 'game'], prompt: '' },
];

// ════════ 이야기 저울이 본문에 넣는 글 ════════
export const SCALE_INJECT = `[Storyteller's private compass. Never reveal, quote or hint that it exists.
Long arc: {{arc}}
Next turning point: {{next}}
{{cue}}
Let scenes lean this way only when the moment allows it. {{user}}'s choices always come first; if {{user}} takes the story elsewhere, follow.]`;
export const SCALE_PUSH = `[For this reply only: the story has idled long enough. Move decisively toward the turning point above — let something happen in this reply that cannot be taken back, through the world or through {{char}}, never by deciding for {{user}}.]`;
export const SCALE_PUSH_BARE = `[For this reply only: the story has idled long enough. Introduce a real development in this reply — an arrival, a discovery, a change of circumstance — through the world or through {{char}}, never by deciding for {{user}}.]`;

// ════════ 몰입 소품: 답장에 실어 보내는 꼬리표 문법 (추가 호출 없음) ════════
export const PROP_KINDS = ['letter', 'note', 'sms', 'news', 'sign', 'receipt', 'card'] as const;
export const PROPS_TEACH = `[Paper props. When the scene contains something the characters READ — a letter, a scribbled note, phone messages, a newspaper piece, a shop sign or notice, a receipt, a name card — you may show it as a prop instead of describing it. Write the prop on its own line, exactly in this form:
[[prop:KIND|HEADING|BODY]]
KIND is one of: letter, note, sms, news, sign, receipt, card. HEADING is short (sender, masthead, shop name; may be empty). BODY is the text exactly as it appears on the object; use " / " for a line break.
- sms: each line of BODY is "Name: message".
- receipt: each line of BODY is "item ... price". Do not add a total; it is added up for you.
- card: BODY lines are name / title / contact.
Use a prop only when an in-world text actually appears, at most two per reply, and keep narrating around it normally. Never put HTML or markdown inside a prop.]`;

// ════════ 객석 ════════
export const SEAT_STYLES: Record<string, string> = {
  serial: 'the comment section under a web serial chapter. Regulars quote a favorite line, guess what comes next, beg for the next chapter, tease each other. Warm, a little feral, typed fast.',
  stalls: 'a dark theater during the performance. Whispers between neighbors, a held breath, a stifled laugh, someone leaning over to murmur a guess. Brief and hushed; nobody raises their voice.',
  live: 'a live-stream chat scrolling beside the scene. Very short bursts, reactions in the moment, repeated letters and capitals for emphasis, people echoing each other. Fast and noisy, never cruel.',
  club: 'a book club that reads one passage at a time. Thoughtful remarks on character, motive, an image or a word choice; gentle disagreement; one person always brings up an earlier chapter.',
  cheer: 'a small, kind cheering section. They root for the characters like friends, celebrate small wins, worry aloud, hand out encouragement. Soft and sincere, never sarcastic.',
  critic: 'a row of sharp-tongued critics with notebooks. Dry, exacting, hard to impress: they point at a weak beat or a convenient coincidence, and grudgingly admit it when something lands. Witty, never abusive, never about the author as a person.',
};
export const STYLE_IDS = Object.keys(SEAT_STYLES);

/** 관객 명단: [한국어 별명, 영어 별명, 성격 한 줄(모델에 보내는 영어)] */
const POOL: [string, string, string][] = [
  ['새벽배달', 'dawn_courier', 'always the first to react; short, breathless'],
  ['밑줄긋는사람', 'underliner', 'quotes the exact phrase that struck them'],
  ['3열창가', 'row3_window', 'quiet, notices small gestures others miss'],
  ['복선수집가', 'threadcatcher', 'collects foreshadowing and announces theories'],
  ['울보독자', 'easily_wept', 'cries at everything, proud of it'],
  ['팔짱낀이', 'arms_crossed', 'skeptical, wants to be convinced'],
  ['찻잔', 'teacup', 'gentle, speaks in cozy asides'],
  ['막차', 'last_train', 'tired, deadpan, funny by accident'],
  ['각주', 'footnote', 'pedantic about details and continuity'],
  ['분위기파', 'here_for_vibes', 'cares only about mood, weather and lighting'],
  ['조연편애', 'side_char_stan', 'devoted to whichever minor character appeared last'],
  ['달력', 'page_a_day', 'keeps count of days and promises made in the story'],
  ['심장약', 'pulse_check', 'dramatic; every tense moment nearly kills them'],
  ['연필깎이', 'sharpener', 'blunt one-liners, no punctuation to spare'],
  ['우산', 'spare_umbrella', 'protective of the characters, worries first'],
  ['재독중', 'on_reread', 'claims to have seen it coming, sometimes has'],
  ['초승달', 'thin_moon', 'wistful, speaks in half sentences'],
  ['매표소', 'box_office', 'rates each scene out of ten, harshly'],
  ['책갈피', 'bookmarked', 'remembers earlier scenes and links them to this one'],
  ['야식', 'midnight_snack', 'easily distracted by any mention of food'],
  ['첫줄', 'front_row', 'loud enthusiasm, lots of exclamation'],
  ['반대편', 'devils_seat', 'takes the other side just to see what happens'],
  ['필사', 'copyist', 'admires craft: rhythm, a well-placed pause'],
  ['고양이', 'cat_on_lap', 'few words, oddly wise'],
];
const ROWS = 'ABCDEFGH';
/** 이 방의 관객: 방 id 가 씨앗이라 같은 방에는 늘 같은 사람들이 같은 자리에 앉는다 */
export function seatsOf(chatId: string, lang: string, n = 6): Seat[] {
  const seed = hash('seats:' + chatId), k = lang === 'ko' ? 0 : 1;
  return pick(POOL, n, seed).map(p => { const h = hash(chatId + p[1]); return { nick: p[k], trait: p[2], no: `${ROWS[h % ROWS.length]}${String(1 + (h >>> 8) % 24).padStart(2, '0')}` }; });
}

// ════════ 견본 (맞춤 조수를 만들 때 본보기로 들여온다) ════════
export const SAMPLES: (Omit<CrewDef, 'id'> & { key: string })[] = [
  { key: 'weather', name: 'Weather & hour', desc: 'Keeps the sky and the clock moving.', phase: 'before', out: 'inject', every: 3, modes: ['rp', 'game'], where: 'depth', depth: 1, max: 160,
    prompt: `You keep track of time of day and weather in this story so the world does not stand still. From the recent scene, work out roughly what hour it is now and what the sky and air are doing, letting time pass naturally since your last note (your memo holds it).
out: two sentences at most, written as a neutral stage note for the storyteller, e.g. the hour, the light, the weather, one sensory detail that changed. No plot, no character actions.
memo: the hour and weather you just set.` },
  { key: 'heart', name: 'Heartline memo', desc: 'A private note on where the feelings stand.', phase: 'after', out: 'aside', every: 2, modes: ['rp', 'talk'], max: 200,
    prompt: `You read the emotional undercurrent of the latest exchange for the player's eyes only. Note in two or three plain sentences: what {{char}} seems to feel but did not say, what shifted between {{char}} and {{user}} in this exchange, and one thing left hanging. Do not give advice and do not predict. Write in the language of the story.
out: the note as plain text.
memo: one line on the trend so far (warming, cooling, guarded, …).` },
  { key: 'threads', name: 'Loose threads', desc: 'Reminds the story of what it left hanging.', phase: 'after', out: 'inject', every: 5, modes: ['rp', 'game'], where: 'depth', depth: 2, max: 220,
    prompt: `You keep a short list of loose threads in this story: promises made, questions left unanswered, objects set down, people who said they would return. Update the list from the recent scene: add new threads, drop the ones that were resolved.
out: a bracketed note for the storyteller listing at most four open threads, one short clause each, ending with "Pick one up when it fits; do not force it."
memo: the current list.` },
];
