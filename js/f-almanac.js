// ── Dreamland almanac: 달이 차오르는 관계 달력 · 약속 수첩 · 이달의 편지 · 꿈 · 교환 일기 답글 · 장면 기념품 · 한 권으로 묶기 ──
// 계산은 f-keepsake.js, 책 HTML 은 f-bind.js. 이 파일은 저장 · 모델 호출 · 대화 화면 연결(X 등록부) · 달력 화면을 맡는다.
// 책 화면(일기장)은 diary.js 가 이 파일을 불러다 쓴다.
import { S, h, on, emit, uid, now, msgText, download, sleep } from './core.js';
import { icon, btn, iconBtn, toast, modal, menu, confirmBox, form, go, route, avatar, moonIcon, moonPhase } from './ui.js';
import { X } from './hooks.js';
import { quickCall } from './engine.js';
import { parseLoose, Memory } from './memory.js';
import { Illust } from './illust.js';
import { chatApi } from './chat.js';
import * as K from './f-keepsake.js';
import { buildBook } from './f-bind.js';

if (!document.querySelector('link[data-almanac]')) document.head.append(h('link', { rel: 'stylesheet', href: new URL('../css/almanac.css', import.meta.url).href, dataset: { almanac: '1' } }));

// ════════ 지시문 (모두 설정에서 고칠 수 있다. 비우면 아래 기본값) ════════
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
export const PROMPTS = {
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
};
export const DEFAULTS = { goal: 15, weekStart: 0, keepsakeToast: true, promiseInject: true, promiseSulk: true, promiseTag: 'talk', exchangeInject: true };
export const A = () => ({ ...DEFAULTS, ...(S.settings.almanac || {}) });
export const P = key => { const v = String(S.settings.almanac?.prompts?.[key] ?? '').trim(); return v || PROMPTS[key].text; };
const moods = () => { const mine = String(S.settings.almanac?.dreamMoods || '').split('\n').map(s => s.trim()); return DREAM_MOODS.map((d, i) => mine[i] || d); };
const fillT = (t, map) => String(t).replace(/\{\{(\w+)\}\}/g, (m, k) => k in map ? map[k] : m);

// ════════ 대화 한 편 ════════
const charOf = chat => S.get('chars', chat?.charIds?.[0]);
const namesOf = chat => (chat?.charIds || []).map(i => S.get('chars', i)?.name).filter(Boolean).join(', ') || '삭제된 캐릭터';
const roomOf = chat => { try { return chatApi.roomName(chat); } catch { return chat?.name || '대화'; } };
const who = chat => ({ char: charOf(chat)?.name || namesOf(chat), user: S.persona(chat)?.name || '나' });
const cleanText = m => { const s = K.swipeOf(m); return K.stripPromiseTags(Illust.strip(s.showTr && s.tr ? s.tr : s.text || '')); };
const speaker = (m, chat) => m.role === 'user' ? who(chat).user : m.role === 'system' ? 'Narrator' : (m.name || S.get('chars', m.charId)?.name || who(chat).char);
const save = chat => S.save('chats', chat, true);
const changed = chat => emit('almanac:changed', chat);
/** 지금 열려 있는 방이면 그 메시지 배열을, 아니면 저장된 것을 */
export async function loadChat(chat) {
  const live = chatApi.current(), msgs = live.chat?.id === chat.id ? live.msgs : await S.msgs(chat.id);
  await Promise.all([Illust.load(chat.id), Memory.load(chat.id)]).catch(e => console.warn('[달력]', e));
  return msgs;
}
const photoSrc = p => p?.src || Illust.data(p?.id) || '';

// ════════ 장면 기념품 (추가 호출 없음) ════════
export async function syncChat(chat, msgs, { quiet = false } = {}) {
  const r = K.syncKeepsakes(chat.keepsakes || [], msgs);
  if (!r.changed) return r;
  chat.keepsakes = r.list; await save(chat);
  if (r.added.length) { if (!quiet && A().keepsakeToast) toast(`장면 기념품을 일기장에 꽂아 두었어요 — ${r.added[r.added.length - 1].title || '이름 없는 장면'}`); changed(chat); }
  return r;
}
/** 책에 꽂히는 쪽들: 일기 · 꿈 · 기념품 · 편지를 시간 순으로 */
export const pagesOf = chat => [
  ...(chat.diary || []).map(e => ({ type: 'diary', id: e.id, ts: e.ts, ref: e })), ...(chat.dreams || []).map(e => ({ type: 'dream', id: e.id, ts: e.ts, ref: e })),
  ...(chat.keepsakes || []).filter(e => !e.gone).map(e => ({ type: 'keepsake', id: e.id, ts: e.ts, ref: e })), ...(chat.letters || []).map(e => ({ type: 'letter', id: e.id, ts: e.ts, ref: e })),
].sort((a, b) => (a.ts || 0) - (b.ts || 0));

// ════════ 약속 수첩 ════════
export const Promises = {
  make: (f, by = 'user', more = {}) => ({ id: uid(), date: f.date, time: f.time || '', what: String(f.what).trim().slice(0, 120), by, made: now(), done: false, ...more }),
  async add(chat, f, by = 'user', more = {}) { const p = this.make(f, by, more); (chat.promises ||= []).push(p); await save(chat); changed(chat); return p; },
  async remove(chat, p) { if (p.later) chat.later = (chat.later || []).filter(l => l.id !== p.id); else chat.promises = (chat.promises || []).filter(x => x.id !== p.id); await save(chat); changed(chat); },
  async toggle(chat, p) { p.done = !p.done; p.doneAt = p.done ? now() : 0; await save(chat); changed(chat); },
  /** 대화방 하나의 약속 + 연락 약속(chat.later)을 날짜 순으로 */
  of(chat) { const laters = (chat.later || []).filter(l => l?.at).map(l => ({ id: l.id, date: K.dayKey(l.at), time: `${K.pad(new Date(l.at).getHours())}:${K.pad(new Date(l.at).getMinutes())}`, what: l.about || '연락하기로 한 약속', by: 'later', later: true, made: l.made || 0 })); return [...(chat.promises || []).filter(p => K.validKey(p?.date)), ...laters].sort((a, b) => a.date.localeCompare(b.date) || (a.time || '').localeCompare(b.time || '')); },
};
const BY = { char: '캐릭터가 적음', user: '내가 적음', extract: '대화에서 뽑음', later: '연락 약속' };
/** 약속 적기 · 고치기 */
export function promiseDialog(chat, p, preset = {}) {
  const today = K.dayKey(now()), isNew = !p;
  const what = h('input.inp', { value: p?.what || preset.what || '', placeholder: '예: 같이 영화 보기', maxLength: 120 }), date = h('input.inp', { type: 'date', value: p?.date || preset.date || today }), time = h('input.inp', { type: 'time', value: p?.time || '' });
  const quick = [['오늘', today], ['내일', K.addDays(today, 1)], ['이번 토요일', K.resolveDate('이번 주 토요일')], ['다음 주', K.addDays(today, 7)]];
  return new Promise(res => {
    let out = null;
    modal({ title: isNew ? '약속 적기' : '약속 고치기', onClose: () => res(out),
      body: h('div.form', h('label.field', h('span.field-label', '무엇을'), what), h('label.field.half', h('span.field-label', '언제'), date), h('label.field.half', h('span.field-label', '시간 (비워도 돼요)'), time),
        h('div.row.wrap', quick.map(([l, k]) => h('button.chip', { type: 'button', onclick: () => { date.value = k; } }, l))), h('small.hint', `${namesOf(chat)} · ${roomOf(chat)}의 약속 수첩에 적어 둡니다.`)),
      actions: [{ label: '취소' }, !isNew && { label: '지우기', cls: 'danger', onclick: async () => { await Promises.remove(chat, p); out = 'removed'; } },
        { label: isNew ? '적어 두기' : '고치기', cls: 'primary', onclick: async () => {
          const f = { date: date.value, time: K.normTime(time.value), what: what.value.trim() };
          if (!K.validKey(f.date)) { toast('날짜를 골라 주세요.', 'err'); return false; } if (!f.what) { toast('무엇을 하기로 했는지 적어 주세요.', 'err'); what.focus(); return false; }
          if (isNew) out = await Promises.add(chat, f, 'user', preset.msgId ? { msgId: preset.msgId } : {});
          else { if (p.date !== f.date) { delete p.raised; delete p.aired; } Object.assign(p, f); await save(chat); changed(chat); out = p; }
        } }].filter(Boolean) });
  });
}
/** 대화에서 약속을 지금 뽑는다 (추가 호출 1회) */
export async function extractByCall(chat, msgs, signal) {
  const rows = msgs.filter(m => m && !m.hidden && m.role !== 'system' && K.msgTs(m)).slice(-60);
  if (rows.length < 2) throw new Error('약속을 찾을 대화가 아직 없어요.');
  const today = K.dayKey(now()), w = who(chat);
  const script = rows.map(m => { const k = K.dayKey(K.msgTs(m)); return `[${k} ${WD_EN[K.keyDate(k).getDay()].slice(0, 3)}] ${speaker(m, chat)}: ${cleanText(m).replace(/\s+/g, ' ').slice(0, 600)}`; }).join('\n');
  const out = await quickCall(fillT(P('extract'), { ...w, today, weekday: WD_EN[K.keyDate(today).getDay()] }), script, { maxTokens: 1200, signal, conn: S.helperConn('all', chat) });
  const j = parseLoose(out), list = Array.isArray(j?.promises) ? j.promises : null;
  if (!list) throw new Error('약속 목록을 읽지 못했어요. 다시 해 보세요.');
  const found = list.map(x => ({ date: K.resolveDate(x?.date, now()), time: K.normTime(x?.time), what: String(x?.what || '').replace(/\s+/g, ' ').trim().slice(0, 120) })).filter(x => x.date && x.what);
  const added = K.mergePromises(chat.promises ||= [], found, f => Promises.make(f, 'extract'));
  await save(chat); changed(chat);
  return { added, found };
}

// ════════ 이달의 편지 (추가 호출 1회) ════════
export async function writeLetter(chat, msgs, mk, signal) {
  const ch = charOf(chat); if (!ch) throw new Error('이 대화의 캐릭터를 찾을 수 없어요.');
  const w = who(chat), inMonth = t => t && K.monthKey(t) === mk, st = K.monthStats(K.collectDays(chat, msgs), mk, A().goal);
  const diary = (chat.diary || []).filter(e => inMonth(e.ts)).slice(-8), mem = Memory.get(chat.id), ids = new Set(msgs.filter(m => inMonth(K.msgTs(m))).map(m => m.id));
  const mems = (mem?.memories || []).filter(m => m?.summary && (inMonth(m.ts) || ids.has(m.msgId))).sort((a, b) => (b.importance || 0) - (a.importance || 0)).slice(0, 16);
  const keeps = (chat.keepsakes || []).filter(k => !k.gone && inMonth(k.ts)), prs = (chat.promises || []).filter(p => String(p.date).startsWith(mk));
  const parts = [`[About ${ch.name}]\n${[ch.description, ch.personality].filter(Boolean).join('\n').slice(0, 2000)}`];
  if (diary.length) parts.push(`[${ch.name}'s diary this month]\n${diary.map(e => `(${K.dayKey(e.ts)}) ${e.title || ''}\n${String(e.text).slice(0, 900)}${e.note ? `\n— ${w.user} wrote beside it: ${String(e.note).slice(0, 300)}` : ''}`).join('\n\n')}`);
  if (mems.length) parts.push(`[Memories of this month]\n${mems.map(m => `- ${String(m.summary).slice(0, 300)}`).join('\n')}`);
  if (keeps.length) parts.push(`[Scenes you kept a ticket from]\n${keeps.map(k => `- ${k.title || 'a meeting'}${k.place ? ` (${k.place})` : ''}${k.summary ? `: ${k.summary}` : ''}`).join('\n')}`);
  if (prs.length) parts.push(`[Promises this month]\n${prs.map(p => `- ${p.date} "${p.what}" — ${K.promiseState(p) === 'kept' ? 'kept' : K.promiseState(p) === 'missed' ? 'passed without being kept' : 'still ahead'}`).join('\n')}`);
  if (!diary.length && !mems.length) {   // 일기도 기억도 없는 달은 그달의 대화에서 직접
    const rows = msgs.filter(m => !m.hidden && m.role !== 'system' && inMonth(K.msgTs(m))); if (rows.length < 2) throw new Error('이 달에는 편지에 담을 이야기가 없어요.');
    const pick = rows.length > 30 ? rows.filter((_, i) => i % Math.ceil(rows.length / 30) === 0) : rows;
    parts.push(`[Moments from this month's conversation]\n${pick.map(m => `(${K.dayKey(K.msgTs(m))}) ${speaker(m, chat)}: ${cleanText(m).replace(/\s+/g, ' ').slice(0, 420)}`).join('\n')}`);
  }
  const [y, mo] = mk.split('-').map(Number), month = `${new Date(y, mo - 1, 1).toLocaleDateString('en-US', { month: 'long' })} ${y}`;
  const out = await quickCall(fillT(P('letter'), { ...w, month, days: st.active }), parts.join('\n\n'), { maxTokens: 2000, signal, conn: S.helperConn('all', chat) });
  const j = parseLoose(out), text = String(j?.text || out).trim(); if (!text) throw new Error('편지가 비어 있어요.');
  const rec = { id: uid(), month: mk, ts: now(), title: String(j?.title || '').trim().slice(0, 80), text, ps: String(j?.ps || '').trim().slice(0, 200), by: ch.id, days: st.active };
  chat.letters = [...(chat.letters || []).filter(l => l.month !== mk), rec].sort((a, b) => a.month.localeCompare(b.month));
  await save(chat); changed(chat);
  return rec;
}

// ════════ 꿈 페이지 (추가 호출 1회) ════════
export async function dreamOf(chat, msgs, day, signal) {
  const ch = charOf(chat); if (!ch) throw new Error('이 대화의 캐릭터를 찾을 수 없어요.');
  const days = K.collectDays(chat, msgs), today = K.dayKey(now());
  day ||= [...days.values()].filter(d => d.n).map(d => d.key).sort().pop();
  const rows = msgs.filter(m => m && !m.hidden && m.role !== 'system' && K.msgTs(m) && K.dayKey(K.msgTs(m)) === day).slice(-30);
  if (rows.length < 2) throw new Error('꿈의 재료가 될 그날의 대화가 없어요.');
  const night = day === today ? new Date() : new Date(K.keyDate(day).setHours(23, 50)), idx = K.phaseIndex(K.phaseAt(night)), w = who(chat);
  const script = rows.map(m => `${speaker(m, chat)}: ${cleanText(m).slice(0, 900)}`).join('\n\n');
  const out = await quickCall(fillT(P('dream'), { ...w, moon: MOON_EN[idx], mood: moods()[idx] }), `[About ${ch.name}]\n${[ch.description, ch.personality].filter(Boolean).join('\n').slice(0, 1800)}\n\n[The day's conversation]\n${script}`, { maxTokens: 1200, signal, conn: S.helperConn('all', chat) });
  const j = parseLoose(out), text = String(j?.text || out).trim(); if (!text) throw new Error('꿈이 비어 있어요.');
  const rec = { id: uid(), ts: +night, day, phase: idx, phaseName: K.PHASES[idx], title: String(j?.title || '').trim().slice(0, 80), text, by: ch.id };
  (chat.dreams ||= []).push(rec); chat.dreams.sort((a, b) => a.ts - b.ts);
  await save(chat); changed(chat);
  return rec;
}
/** 마음에 든 꿈을 장기기억으로 올린다 (꿈이었다는 표시와 함께) */
export async function promoteDream(chat, d) {
  if (typeof Memory.add !== 'function') throw new Error('장기기억에 올릴 수 없어요.');
  const ch = S.get('chars', d.by) || charOf(chat), body = String(d.text).replace(/\s+/g, ' ');
  const m = await Memory.add(chat.id, { kind: 'impression', summary: `[꿈 · 실제로 일어난 일이 아님] ${ch?.name || '캐릭터'}이(가) ${K.koDate(d.day || K.dayKey(d.ts), { year: false, week: false })} 밤에 꾼 꿈${d.title ? ` 「${d.title}」` : ''}: ${body.slice(0, 280)}${body.length > 280 ? '…' : ''}`, tags: ['manual', 'dream'], importance: 0.4, entities: ch ? [ch.name] : [] });
  d.memId = m.id; await save(chat); changed(chat);
  return m;
}

// ════════ 교환 일기 (답글은 추가 호출 1회) ════════
export async function answerNote(chat, entry, signal) {
  const note = String(entry.note || '').trim(); if (!note) throw new Error('먼저 일기 옆에 몇 줄 적어 주세요.');
  const ch = S.get('chars', entry.by) || charOf(chat); if (!ch) throw new Error('이 대화의 캐릭터를 찾을 수 없어요.');
  const w = { char: ch.name, user: S.persona(chat)?.name || '나' };
  const out = await quickCall(fillT(P('exchange'), w), `[About ${ch.name}]\n${[ch.description, ch.personality].filter(Boolean).join('\n').slice(0, 1800)}\n\n[Your diary entry${entry.title ? ` — ${entry.title}` : ''}]\n${String(entry.text).slice(0, 1600)}\n\n[What ${w.user} wrote beside it]\n${note.slice(0, 800)}`, { maxTokens: 500, signal, conn: S.helperConn('all', chat) });
  const text = out.trim().replace(/^["“「]+|["”」]+$/g, '').trim(); if (!text) throw new Error('답글이 비어 있어요.');
  entry.answer = text.slice(0, 600); entry.answerTs = now(); await save(chat); changed(chat);
  return entry.answer;
}

// ════════ 대화 화면과의 연결 ════════
// 화면에 보이기 직전: 약속 태그를 지운다 (쓰는 도중에도)
X.filters.push({ owner: 'almanac', fn: text => K.stripPromiseTags(text) });

// 프롬프트 조각: 약속 수첩 · 약속 태그 안내 · 교환 일기
X.prompt.push({ owner: 'almanac', fn: ({ chat, ctx, type }) => {
  if (!chat || type === 'impersonate') return [];
  const a = A(), out = [], today = K.dayKey(now()), weekday = WD_EN[K.keyDate(today).getDay()], w = { char: ctx?.char || who(chat).char, user: ctx?.user || who(chat).user };
  if (a.promiseInject !== false && (chat.promises || []).length) {
    const dg = K.promiseDigest(chat.promises, today), lines = [];
    for (const p of dg.today.slice(0, 3)) lines.push(fillT(P('promiseToday'), { ...w, what: p.what, time: p.time ? ` at ${p.time}` : '' }) + (p.raised === today ? ' (It was already brought up earlier today — do not repeat it unless it fits.)' : ''));
    if (a.promiseSulk !== false) for (const p of dg.missed.slice(0, 2)) lines.push(fillT(P('promiseMissed'), { ...w, what: p.what, date: p.date, ago: -K.diffDays(today, p.date) }));
    if (dg.soon.length) lines.push(`Coming up (background only — do not bring these up unless it fits): ${dg.soon.slice(0, 5).map(p => `${p.date}${p.time ? ' ' + p.time : ''} "${p.what}"`).join('; ')}`);
    if (lines.length) out.push({ where: 'end', src: '약속 수첩', content: `<promise_notebook>\nToday is ${today} (${weekday}).\n${lines.join('\n')}\n</promise_notebook>` });
  }
  if (a.promiseTag === 'all' || (a.promiseTag === 'talk' && chat.mode === 'talk' && !chat.scene?.on)) out.push({ where: 'end', src: '약속 태그 안내', content: `<promise_command>\n${fillT(P('promiseOffer'), { ...w, today, weekday })}\n</promise_command>` });
  if (a.exchangeInject !== false) {
    const e = [...(chat.diary || [])].reverse().find(x => String(x.note || '').trim());
    if (e && now() - (e.noteTs || e.ts || 0) < 7 * 864e5) out.push({ where: 'depth', depth: 4, order: 90, src: '교환 일기', content: `<exchange_diary>\n${fillT(P('exchangeNote'), { ...w, title: e.title || 'untitled', note: String(e.note).trim().slice(0, 500), answer: e.answer ? ` ${w.char} answered in the margin: "${String(e.answer).slice(0, 300)}"` : '' })}\n</exchange_diary>` });
  }
  return out;
} });

// 답변이 끝나면: 약속 태그를 수첩으로 옮기고, 오늘 약속 · 서운함을 한 번 꺼낸 것으로 표시하고, 닫힌 장면을 기념품으로
on('message:received', async ({ msg, chat }) => {
  try {
    if (!chat || !msg) return;
    const a = A(), today = K.dayKey(now()), sw = msg.swipes?.[msg.sw], live = chatApi.current();
    const list = live.chat?.id === chat.id ? live.msgs : await S.msgs(chat.id); let dirty = false;
    if (sw && /\[promise/i.test(sw.text || '')) {
      const ex = K.extractPromises(sw.text, now());
      if (ex.text) {
        sw.text = ex.text; const stored = list.find(m => m.id === msg.id);
        if (stored && stored !== msg && stored.swipes?.[stored.sw]) stored.swipes[stored.sw].text = ex.text;
        await S.saveMsgs(chat, list);
      }
      if (a.promiseTag !== 'off') {
        const added = K.mergePromises(chat.promises ||= [], ex.found, f => Promises.make(f, 'char', { msgId: msg.id }));
        if (added.length) { dirty = true; toast(`약속 수첩에 적었어요 — ${K.koDate(added[0].date, { year: false })} ${added[0].what}${added.length > 1 ? ` 외 ${added.length - 1}개` : ''}`); }
      }
    }
    if (a.promiseInject !== false && (chat.promises || []).length) {
      const dg = K.promiseDigest(chat.promises, today);
      for (const p of dg.today) if (p.raised !== today) { p.raised = today; dirty = true; }
      if (a.promiseSulk !== false) for (const p of dg.missed.slice(0, 2)) { p.aired = today; dirty = true; }
    }
    if (dirty) { await save(chat); changed(chat); }
    await syncChat(chat, list);
  } catch (e) { console.warn('[달력] 답변 뒤 처리', e); }
});
const greeted = new Set();
on('chat:open', async chat => {
  try {
    if (!chat) return;
    await syncChat(chat, await loadChat(chat));
    const today = K.dayKey(now()), key = chat.id + today, mine = (chat.promises || []).filter(p => !p.done && p.date === today);
    if (mine.length && !greeted.has(key)) { greeted.add(key); toast(`오늘은 약속한 날이에요 — ${mine[0].what}${mine.length > 1 ? ` 외 ${mine.length - 1}개` : ''}`); }
  } catch (e) { console.warn('[달력] 대화방 열기', e); }
});
on('scene:close', async ({ chat } = {}) => { try { const live = chatApi.current(); if (chat && live.chat?.id === chat.id) await syncChat(chat, live.msgs); } catch { } });   // 손으로 닫은 장면도 바로 기념품으로
on('generate:end', async ({ chat } = {}) => { try { const live = chatApi.current(); if (chat && live.chat?.id === chat.id) await syncChat(chat, live.msgs); } catch { } });

/** 대화 화면의 그 메시지로 간다 (접혀 있는 앞부분은 펼쳐 가며 찾는다) */
export async function jumpTo(chatId, msgId) {
  document.querySelector('.book-wrap')?.remove();
  go('chat', chatId); if (!msgId) return;
  for (let i = 0; i < 80; i++) {
    await sleep(110); if (route.page !== 'chat') return;
    const el = document.querySelector(`article.msg[data-id="${String(msgId).replace(/["\\]/g, '')}"]`);
    if (el) { el.scrollIntoView({ block: 'center' }); el.classList.add('alm-flash'); setTimeout(() => el.classList.remove('alm-flash'), 2000); return; }
    const more = document.querySelector('#page .more-btn'); if (more) more.click(); else if (document.querySelector('#page article.msg')) return toast('그 메시지는 지금 대화에 남아 있지 않아요.');
  }
}

// ════════ 그림 조각 ════════
const star4 = (x, y, s) => `M${x} ${y - s}L${x + s * .22} ${y - s * .22}L${x + s} ${y}L${x + s * .22} ${y + s * .22}L${x} ${y + s}L${x - s * .22} ${y + s * .22}L${x - s} ${y}L${x - s * .22} ${y - s * .22}Z`;
const svg = (html, cls, vb = '0 0 12 12', size) => { const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); s.setAttribute('viewBox', vb); if (size) { s.setAttribute('width', size); s.setAttribute('height', size); } s.setAttribute('class', cls); s.setAttribute('aria-hidden', 'true'); s.innerHTML = html; return s; };
const GLYPH = {
  diary: '<path d="M3 1.6h6v8.8H3zM4.6 4.2h2.8M4.6 6h2.8M4.6 7.8h1.6" fill="none" stroke="currentColor" stroke-width="1"/>',
  photo: '<rect x="1.8" y="1.4" width="8.4" height="9.2" fill="none" stroke="currentColor" stroke-width="1"/><rect x="3.3" y="2.9" width="5.4" height="4.6" fill="currentColor"/>',
  scene: `<path d="${star4(6, 6, 5.4)}" fill="currentColor"/>`,
  dream: '<path d="M10 7.7A4.7 4.7 0 0 1 4.3 2 4.7 4.7 0 1 0 10 7.7z" fill="currentColor"/>',
  open: '<circle cx="6" cy="6" r="3.6" fill="none" stroke="currentColor" stroke-width="1.2"/>',
  today: '<circle cx="6" cy="6" r="3.6" fill="none" stroke="currentColor" stroke-width="1.2"/><circle cx="6" cy="6" r="1.5" fill="currentColor"/>',
  kept: '<circle cx="6" cy="6" r="4.6" fill="none" stroke="currentColor" stroke-width="1.2"/><path d="M3.7 6.2l1.7 1.7 3-3.6" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/>',
  missed: '<path d="M2.6 2.6l6.8 6.8M9.4 2.6L2.6 9.4" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>',
  letter: '<path d="M1.4 2.8h9.2v6.6H1.4zM1.4 2.8L6 6.6l4.6-3.8" fill="none" stroke="currentColor" stroke-width="1"/>',
};
export const glyph = (name, title) => { const g = svg(GLYPH[name] || GLYPH.open, `alm-g g-${name}`); if (title) g.insertAdjacentHTML('afterbegin', `<title>${title}</title>`); return g; };
/** 그달의 달: 대화한 날만큼 차오른다. 둘레의 눈금은 보름까지의 날 수 */
export function moonDial(st, cls = '') {
  const id = 'aht' + uid(), c = 100, R = 60, n = st.target, p = K.fillToPhase(st.fill);
  const ticks = Array.from({ length: n }, (_, i) => { const a = i / n * 2 * Math.PI - Math.PI / 2, on = i < st.active, r1 = 76, r2 = on ? 90 : 83, x = r => (c + r * Math.cos(a)).toFixed(2), y = r => (c + r * Math.sin(a)).toFixed(2); return `<line class="${on ? 'on' : ''}" x1="${x(r1)}" y1="${y(r1)}" x2="${x(r2)}" y2="${y(r2)}"/>${on ? `<circle class="end" cx="${x(r2)}" cy="${y(r2)}" r="1.9"/>` : ''}`; }).join('');
  const lit = st.fill >= 0.999 ? `<circle class="lit" cx="${c}" cy="${c}" r="${R}"/>` : st.fill > 0.004 ? `<path class="lit" d="${K.moonPath(p, R, c, c)}"/>` : '';
  const stars = st.full ? `<path class="st" d="${star4(170, 34, 11)}"/><path class="st" d="${star4(28, 158, 7)}"/><path class="st" d="${star4(182, 76, 4)}"/>` : `<path class="st dim" d="${star4(170, 34, 6)}"/>`;
  return h(`div.alm-dial${st.full ? '.full' : ''}${cls ? '.' + cls : ''}`, { html: `<svg viewBox="0 0 200 200" aria-hidden="true"><defs><pattern id="${id}" width="5.2" height="5.2" patternUnits="userSpaceOnUse" patternTransform="rotate(32)"><circle cx="2.6" cy="2.6" r="1.05" fill="currentColor"/></pattern></defs><g class="ticks">${ticks}</g><circle class="dark" cx="${c}" cy="${c}" r="${R}" fill="url(#${id})"/>${lit}<circle class="edge" cx="${c}" cy="${c}" r="${R}"/>${stars}</svg>` });
}
/** 작은 달 (연간 띠 · 패널용) */
export const moonMini = (fill, size = 22) => svg(`<circle cx="12" cy="12" r="10" fill="currentColor" opacity=".16"/>${fill >= 0.999 ? '<circle cx="12" cy="12" r="10" fill="currentColor"/>' : fill > 0.004 ? `<path d="${K.moonPath(K.fillToPhase(fill))}" fill="currentColor"/>` : ''}<circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" stroke-width=".8"/>`, 'alm-mini', '0 0 24 24', size);
/** 티켓 반쪽: 장면 기념품 */
export function ticketEl(k, { onclick, small } = {}) {
  const d = new Date(k.ts || now());
  return h(`${onclick ? 'button' : 'div'}.alm-ticket${small ? '.small' : ''}`, { onclick, type: onclick ? 'button' : null },
    h('div.t-main', h('small', `SCENE No. ${K.pad(k.no || 1)}`), h('b', k.title || '이름 없는 장면'), (k.place || k.time) ? h('span', [k.place, k.time].filter(Boolean).join(' · ')) : null, !small && k.summary ? h('p', k.summary) : null),
    h('div.t-stub', h('small', 'ADMIT ONE'), h('b', `${K.pad(d.getMonth() + 1)}.${K.pad(d.getDate())}`), h('span', K.seatOf(k.id))));
}
export const polaroid = (src, { title, onclick, cls = '' } = {}) => h(`${onclick ? 'button' : 'div'}.alm-polaroid${cls ? '.' + cls : ''}`, { onclick, type: onclick ? 'button' : null, title: title || null }, h('img', { src, alt: '', loading: 'lazy' }), title ? h('span', title) : null);

// ════════ 지시문 고치기 ════════
const promptDefs = keys => keys.map(k => ({ k: `almanac.prompts.${k}`, label: PROMPTS[k].label, type: 'area', rows: 6, ph: PROMPTS[k].text, hint: `${PROMPTS[k].hint} 비워 두면 기본 문장을 씁니다 (칸에 흐리게 보이는 글).` }));
const moodDef = { k: 'almanac.dreamMoods', label: '달 위상별 꿈의 분위기 (한 줄에 하나씩: 삭 · 초승달 · 상현달 · 차오르는 달 · 보름달 · 기우는 달 · 하현달 · 그믐달)', type: 'area', rows: 8, ph: DREAM_MOODS.join('\n'), hint: '여덟 줄. 비워 둔 줄은 기본 문장을 씁니다.' };
/** 버튼 옆의 "지시문" — 그 기능의 지시문만 바로 고친다 */
export function editPrompts(keys, title = '지시문 고치기', extra = []) {
  return modal({ title, wide: true, body: h('div.col', h('p.hint', '여기서 고친 지시문은 다음 호출부터 쓰입니다.'), form(S.settings, [...extra, ...promptDefs(keys), keys.includes('dream') ? moodDef : null], () => S.set({}))), actions: [{ label: '닫기', cls: 'primary' }] });
}
/** 설정 탭 */
export function renderSettings(host, extraPrompts = []) {
  host.replaceChildren(h('div.card', h('p.hint', '모델을 따로 부르는 기능은 버튼을 누를 때만 움직이고, 버튼에 "호출 1회"라고 적혀 있습니다. 아래 체크 항목들은 추가 호출 없이 프롬프트에 몇 줄을 더할 뿐입니다.'),
    form(S.settings, [{ section: '달력' },
      { k: 'almanac.goal', label: '한 달에 며칠 대화하면 보름달이 되나요', type: 'num', min: 3, max: 28, step: 1, ph: '15', half: true, hint: '비워 두면 15일(보름). 그달의 날 수보다 크면 그달의 날 수로.' },
      { k: 'almanac.weekStart', label: '한 주의 시작', type: 'select', opts: [[0, '일요일'], [1, '월요일']], half: true },
      { k: 'almanac.keepsakeToast', label: '장면이 닫혀 기념품이 꽂힐 때 알려 주기', type: 'check' },
      { section: '약속 수첩' },
      { k: 'almanac.promiseInject', label: '약속한 날 대화방을 열면 캐릭터가 먼저 꺼내게 하기 (프롬프트에 한 줄)', type: 'check' },
      { k: 'almanac.promiseSulk', label: '지켜지지 않고 지나간 약속을 캐릭터가 한 번 서운해할 수 있게 하기', type: 'check' },
      { k: 'almanac.promiseTag', label: '캐릭터가 약속 태그로 직접 수첩에 적기', type: 'select', opts: [['talk', '대화 모드에서만'], ['all', '모든 대화에서'], ['off', '쓰지 않기']], hint: '켜면 안내문이 프롬프트에 들어갑니다 (약 90토큰). 실제 달력 날짜를 쓰므로 작중 시간이 따로 흐르는 이야기에서는 꺼 두는 편이 좋아요.' },
      { section: '교환 일기' },
      { k: 'almanac.exchangeInject', label: '내가 일기 옆에 적은 글과 답글을 다음 대화에 은근히 반영하기 (적은 뒤 7일 동안)', type: 'check' },
      { section: '지시문' }, ...extraPrompts, ...promptDefs(Object.keys(PROMPTS)), moodDef], () => { const al = S.settings.almanac ||= {}; if (!al.goal) delete al.goal; al.weekStart = +al.weekStart || 0; S.set({}); changed(null); })));
}
// 체크 항목은 저장된 값이 없어도 기본값(켜짐)이 보이도록, 시작할 때 한 번 채워 둔다
const seed = () => { const al = S.settings.almanac ||= {}; for (const [k, v] of Object.entries(DEFAULTS)) if (al[k] == null && k !== 'goal') al[k] = v; return al; };

// ════════ 대화 고르기 ════════ (캐릭터가 많아도: 검색 + 캐릭터별 묶음 + 방은 분량 · 날짜로 구분)
const md = t => { const d = new Date(t); return `${d.getFullYear() === new Date().getFullYear() ? '' : d.getFullYear() + '.'}${d.getMonth() + 1}.${d.getDate()}`; };
const roomLine = c => [`${c.count || 0}개`, (c.diary || []).length ? `일기 ${c.diary.length}` : '', (c.promises || []).length ? `약속 ${c.promises.length}` : '', md(c.updatedAt || c.createdAt)].filter(Boolean).join(' · ');
const groupsOf = () => { const map = new Map(); for (const c of S.chats) { if (!c.charIds?.length) continue; const key = c.charIds.join('+'); (map.get(key) || map.set(key, []).get(key)).push(c); } return [...map.values()].map(rooms => { rooms.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0)); return { rooms, chat: rooms[0], name: namesOf(rooms[0]), ch: charOf(rooms[0]), at: rooms[0].updatedAt || 0 }; }).sort((a, b) => b.at - a.at); };
export function pickChat({ current, title = '대화 고르기', onPick }) {
  let q = '', openKey = current ? S.get('chats', current)?.charIds.join('+') : '', shown = 40;
  const list = h('div.picker-list.alm-pick'), count = h('small.hint');
  const draw = () => {
    const t = q.trim().toLowerCase(), all = groupsOf();
    const hit = all.map(g => { if (!t) return g; const byName = g.name.toLowerCase().includes(t), rooms = byName ? g.rooms : g.rooms.filter(c => `${roomOf(c)} ${c.preview || ''}`.toLowerCase().includes(t)); return rooms.length ? { ...g, rooms, hit: !byName } : null; }).filter(Boolean);
    count.textContent = `캐릭터 ${all.length}명 · 대화방 ${S.chats.length}개${t ? ` · 찾은 것 ${hit.length}` : ''}`;
    list.replaceChildren(...hit.slice(0, shown).flatMap(g => {
      const key = g.chat.charIds.join('+'), one = g.rooms.length === 1, open = !one && (openKey === key || g.hit || (t && g.rooms.length <= 3));
      const head = h(`button.picker-row${g.rooms.some(c => c.id === current) ? '.on' : ''}`, { onclick: () => { if (one) { box.close(); return onPick(g.rooms[0]); } openKey = openKey === key ? '' : key; draw(); } },
        avatar(g.ch || { name: g.name }, 'sm'), h('div.picker-text', h('b', g.name), h('small', one ? `${roomOf(g.rooms[0])} · ${roomLine(g.rooms[0])}` : `대화방 ${g.rooms.length}개 · 최근 ${md(g.at)}`)), one ? null : h('i.alm-caret', icon(open ? 'up' : 'down', 14)));
      return [head, open ? h('div.alm-rooms', g.rooms.slice(0, 30).map(c => h(`button.alm-room${c.id === current ? '.on' : ''}`, { onclick: () => { box.close(); onPick(c); } }, h('b', roomOf(c)), h('small', roomLine(c)), c.id === current ? h('i', '지금') : null)), g.rooms.length > 30 ? h('small.hint', '방이 많아요. 방 이름으로 검색해 좁혀 주세요.') : null) : null];
    }), !hit.length ? h('p.dim.pad', '찾는 대화가 없어요.') : null, hit.length > shown ? btn(`더 보기 (${hit.length - shown})`, { cls: 'ghost wide', onclick: () => { shown += 40; draw(); } }) : null);
  };
  const box = modal({ title, body: h('div.col', h('input.inp.search', { placeholder: '캐릭터 이름이나 방 이름으로 찾기', oninput: e => { q = e.target.value; shown = 40; draw(); } }), count, list) });
  draw(); return box;
}

// ════════ 달력 화면 ════════
export const view = { chatId: '', mk: '', sel: '', scope: 'one' };
const defaultChat = () => S.get('chats', view.chatId) || S.get('chats', chatApi.current().chat?.id) || S.get('chats', S.settings.lastChat) || [...S.chats].sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))[0];
const levelOf = n => n >= 40 ? 3 : n >= 12 ? 2 : 1;
const busyBtn = (label, opt, run) => { const b = btn(label, { ...opt, onclick: async () => { if (b.disabled) return; b.disabled = true; b.classList.add('busy'); const span = b.querySelector('span'), old = span?.textContent; if (span) span.textContent = opt.busy || '쓰는 중…'; try { await run(); } catch (e) { if (e?.name !== 'AbortError') toast(e.message || String(e), 'err'); } finally { b.disabled = false; b.classList.remove('busy'); if (span && b.isConnected) span.textContent = old; } } }); return b; };

/** 편지 한 통 */
export function showLetter(chat, letter, { onAgain } = {}) {
  const ch = S.get('chars', letter.by) || charOf(chat), [y, mo] = letter.month.split('-').map(Number);
  const paper = h('div.alm-letter', h('div.alm-letter-in', h('header', h('span.alm-tag', `${y} · ${K.MONTHS_EN[mo - 1]}`), moonMini(1, 26)), h('h3', letter.title || `${mo}월의 편지`), h('div.alm-letter-text', String(letter.text).split(/\n{2,}/).map(p => h('p', p))), letter.ps ? h('p.alm-ps', `추신. ${letter.ps}`) : null, h('div.alm-sign', `— ${ch?.name || ''}`)));
  applyFont(paper, ch);
  const box = modal({ title: '', wide: true, body: paper,
    actions: [onAgain && { label: '다시 받기 · 호출 1회', ic: 'refresh', onclick: async () => { if (!(await confirmBox('지금 편지를 지우고 새로 받을까요? (호출 1회)', '다시 받기'))) return false; onAgain(); } }, { label: '일기장에 꽂힌 쪽 보기', ic: 'book', onclick: () => emit('diary:open', { chat, at: letter.id }) }, { label: '닫기', cls: 'primary' }].filter(Boolean) });
  return box;
}

/** 달이 차오르는 달력 */
export async function renderCalendar(host, arg = {}) {
  if (arg.chatId) view.chatId = arg.chatId; if (arg.day && K.validKey(arg.day)) { view.sel = arg.day; view.mk = arg.day.slice(0, 7); }
  const chat = defaultChat();
  if (!chat) return host.replaceChildren(h('div.empty', moonIcon(46), h('p', '아직 대화가 없어요. 대화를 시작하면 달이 차오르기 시작합니다.'), btn('캐릭터 보러 가기', { ic: 'home', cls: 'primary', onclick: () => go('home') })));
  view.chatId = chat.id; view.mk ||= K.monthKey(now());
  host.replaceChildren(h('div.alm-loading', moonIcon(28), h('span', '달력을 펼치는 중…')));
  const token = host._alm = uid();   // 불러오는 사이 다른 탭으로 넘어갔으면 그리지 않는다. 같은 자리에 다시 그리면 앞선 달력의 구독은 스스로 끊는다
  const msgs = await loadChat(chat); await syncChat(chat, msgs, { quiet: true });
  if (!host.isConnected || host._alm !== token || view.chatId !== chat.id) return;
  const today = K.dayKey(now());
  const reopen = (patch = {}) => renderCalendar(host, patch);
  const draw = () => {
    const a = A(), days = K.collectDays(chat, msgs), st = K.monthStats(days, view.mk, a.goal, today), [y, mo] = view.mk.split('-').map(Number), ch = charOf(chat);
    const letter = (chat.letters || []).find(l => l.month === view.mk);
    // ── 누구와의 달력인가
    const others = groupsOf().filter(g => g.chat.charIds.join('+') !== chat.charIds.join('+')).slice(0, 8);
    const whoBar = h('div.alm-who',
      h('button.alm-me', { title: '다른 대화 고르기', onclick: () => pickChat({ current: chat.id, onPick: c => { view.sel = ''; reopen({ chatId: c.id }); } }) }, avatar(ch || { name: namesOf(chat) }), h('div', h('b', namesOf(chat)), h('small', `${roomOf(chat)} · ${roomLine(chat)}`)), icon('down', 15)),
      others.length ? h('div.alm-others', others.map(g => h('button', { title: `${g.name} · ${roomLine(g.chat)}`, onclick: () => { view.sel = ''; reopen({ chatId: g.chat.id }); } }, avatar(g.ch || { name: g.name }, 'sm'), h('span', g.name)))) : null,
      h('div.alm-who-side', iconBtn('search', '대화 고르기', () => pickChat({ current: chat.id, onPick: c => { view.sel = ''; reopen({ chatId: c.id }); } })), iconBtn('chat', '이 대화로 가기', () => go('chat', chat.id)), iconBtn('book', '일기장 펼치기', () => emit('diary:open', chat))));
    // ── 그달의 달
    const say = st.full ? '보름달이 떴어요' : st.when === 'future' ? '아직 오지 않은 달이에요' : st.when === 'past' ? (st.active ? `${st.active}일에서 멈춘 달` : '이야기가 없던 달') : st.active ? `보름까지 ${st.left}일${st.reachable ? '' : ' — 이번 달에는 닿지 않아요'}` : '오늘 이야기하면 달이 뜨기 시작해요';
    const letterBox = letter ? h('button.alm-env.has', { onclick: () => showLetter(chat, letter, { onAgain: () => askLetter(true).catch(e => toast(e.message, 'err')) }) }, glyph('letter'), h('div', h('b', `${mo}월의 편지 읽기`), h('small', letter.title || `${new Date(letter.ts).toLocaleDateString('ko-KR')}에 받음`)))
      : st.full ? h('div.alm-env.ready', busyBtn('이달의 편지 받기 · 호출 1회', { ic: 'feather', cls: 'primary', busy: '편지를 쓰는 중…' }, () => askLetter(false)), iconBtn('sliders', '편지 지시문 고치기', () => editPrompts(['letter'], '이달의 편지 지시문'), 'tiny'), h('small', `${ch?.name || '캐릭터'}이(가) 이달의 일기와 기억에서 뽑아 편지 한 통을 씁니다.`))
        : h('div.alm-env.locked', glyph('letter'), h('div', h('b', '이달의 편지'), h('small', st.when === 'past' ? '보름을 채우지 못한 달이에요.' : `보름(${st.target}일)이 되면 열려요.`)));
    const moonPanel = h('aside.alm-moon',
      h('div.alm-moon-head', h('b', K.pad(mo)), h('span', K.MONTHS_EN[mo - 1], h('small', String(y)))),
      moonDial(st),
      h('div.alm-moon-cap', h('b', `${st.active}`, h('i', ` / ${st.target}일`)), h('span', K.phaseName(K.fillToPhase(st.fill))), h('small', say)),
      h('dl.alm-stats', [['메시지', st.msgs], ['이어진 날', st.streak ? `${st.streak}일` : 0], ['일기', st.diary], ['사진', st.photos], ['기념품', st.keepsakes], ['꿈', st.dreams]].filter(([, v]) => v).map(([k, v]) => h('div', h('dt', k), h('dd', String(v))))),
      letterBox);
    // ── 달력 지면
    const grid = K.monthGrid(view.mk, +a.weekStart || 0), wk = Array.from({ length: 7 }, (_, i) => (i + (+a.weekStart || 0)) % 7);
    const cell = (c, ci, week) => {
      const d = days.get(c.key), n = d?.n || 0, on = n > 0 && c.inMonth, nextOn = ci < 6 && week[ci + 1].inMonth && days.get(week[ci + 1].key)?.n > 0, prevOn = ci > 0 && week[ci - 1].inMonth && days.get(week[ci - 1].key)?.n > 0;
      const marks = d && c.inMonth ? [d.diary.length && glyph('diary', `일기 ${d.diary.length}`), d.photos.length && glyph('photo', `사진 ${d.photos.length}`), d.keepsakes.length && glyph('scene', `장면 기념품 ${d.keepsakes.length}`), d.dreams.length && glyph('dream', '꿈'),
        ...[...new Set(d.promises.map(p => K.promiseState(p, today)))].map(s => glyph(s === 'upcoming' ? 'open' : s, { kept: '지킨 약속', missed: '지나간 약속', today: '오늘의 약속', upcoming: '약속' }[s]))].filter(Boolean) : [];
      const label = `${K.koDate(c.key)}${n ? ` · 메시지 ${n}개` : ''}${d?.promises.length ? ` · 약속 ${d.promises.length}` : ''}`;
      return h(`button.alm-day${c.inMonth ? '' : '.out'}${on ? `.on.lv${levelOf(n)}` : ''}${c.key === today ? '.today' : ''}${c.key === view.sel ? '.sel' : ''}${on && nextOn ? '.link-r' : ''}${on && prevOn ? '.link-l' : ''}${c.dow === 0 ? '.sun' : ''}`,
        { title: label, 'aria-label': label, onclick: () => { view.sel = c.key; if (!c.inMonth) view.mk = c.key.slice(0, 7); draw(); requestAnimationFrame(() => host.querySelector('.alm-detail')?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })); } },
        h('span.alm-n', String(c.d)), on ? h('i.alm-dot') : null, on ? h('span.alm-cnt', String(n)) : null, marks.length ? h('span.alm-marks', marks.slice(0, 4), marks.length > 4 ? h('em', '+') : null) : null);
    };
    const cal = h('div.alm-cal',
      h('header.alm-cal-head', iconBtn('left', '앞 달', () => { view.mk = K.shiftMonth(view.mk, -1); view.sel = ''; draw(); }), h('h2', `${y}년 ${mo}월`), iconBtn('right', '다음 달', () => { view.mk = K.shiftMonth(view.mk, 1); view.sel = ''; draw(); }),
        h('span.alm-sp'), view.mk !== K.monthKey(now()) || view.sel !== today ? btn('오늘', { cls: 'ghost', onclick: () => { view.mk = K.monthKey(now()); view.sel = today; draw(); } }) : null, btn('약속 적기', { ic: 'plus', onclick: async () => { if (await promiseDialog(chat, null, { date: view.sel || today })) draw(); } })),
      h('div.alm-week', wk.map(i => h(`span${i === 0 ? '.sun' : ''}`, K.WEEK[i]))),
      h('div.alm-grid', { style: { '--rows': grid.length } }, grid.flatMap(week => week.map((c, ci) => cell(c, ci, week)))),
      h('div.alm-legend', [['diary', '일기'], ['photo', '사진'], ['scene', '장면 기념품'], ['dream', '꿈'], ['open', '약속'], ['kept', '지킨 약속'], ['missed', '지나간 약속']].map(([g, l]) => h('span', glyph(g), l)), h('span.alm-dots', h('i.alm-dot.demo'), h('i.alm-dot.demo.d2'), h('i.alm-dot.demo.d3'), '대화한 날 (점이 클수록 많이)')));
    // ── 한 해의 달들
    const yearBar = h('div.alm-year', iconBtn('left', '앞 해', () => { view.mk = `${y - 1}-${K.pad(mo)}`; view.sel = ''; draw(); }, 'tiny'), h('b', String(y)), iconBtn('right', '다음 해', () => { view.mk = `${y + 1}-${K.pad(mo)}`; view.sel = ''; draw(); }, 'tiny'),
      h('div.alm-months', Array.from({ length: 12 }, (_, i) => { const mk = `${y}-${K.pad(i + 1)}`, s = K.monthStats(days, mk, a.goal, today), has = (chat.letters || []).some(l => l.month === mk); return h(`button${mk === view.mk ? '.on' : ''}${s.active ? '.has' : ''}`, { title: `${i + 1}월 · ${s.active}일${s.full ? ' · 보름달' : ''}${has ? ' · 편지' : ''}`, onclick: () => { view.mk = mk; view.sel = ''; draw(); } }, moonMini(s.fill, 22), h('span', `${i + 1}`), has ? h('i') : null); })));
    host.replaceChildren(whoBar, h('section.alm-sheet', moonPanel, cal), yearBar, detail(days, st));
  };
  // ── 고른 날
  const detail = (days) => {
    const key = view.sel; if (!key) return h('div.alm-detail.none', h('p.hint', '날짜를 누르면 그날의 일기 · 사진 · 기념품 · 약속이 여기에 펼쳐져요.'));
    const d = days.get(key) || { n: 0, user: 0, ai: 0, photos: [], diary: [], dreams: [], keepsakes: [], promises: [] }, date = K.keyDate(key), ph = moonPhase(date), gap = K.diffDays(today, key);
    const rel = gap === 0 ? '오늘' : gap === 1 ? '내일' : gap === -1 ? '어제' : gap > 0 ? `${gap}일 뒤` : `${-gap}일 전`;
    const pics = d.photos.map(p => ({ ...p, src: photoSrc(p) })).filter(p => p.src);
    const sec = (title, n, ...kids) => h('div.alm-sec', h('h4', title, n ? h('i', String(n)) : null), kids);
    const prow = p => { const s = K.promiseState(p, today); return h(`div.alm-pr.${s}`,
      p.later ? glyph('today', '연락 약속') : h('button.alm-pr-check', { title: p.done ? '지킨 약속 — 눌러서 되돌리기' : '지켰어요', onclick: async () => { await Promises.toggle(chat, p); draw(); } }, glyph(s === 'upcoming' ? 'open' : s)),
      h('div.alm-pr-text', h('b', p.what), h('small', [p.time, BY[p.by] || '', s === 'missed' ? '지켜지지 않고 지나갔어요' : s === 'kept' ? '지켰어요' : ''].filter(Boolean).join(' · '))),
      p.later ? iconBtn('trash', '이 연락 약속 지우기', async () => { if (await confirmBox('이 연락 약속을 지울까요?', '지우기', true)) { await Promises.remove(chat, p); draw(); } }, 'tiny') : iconBtn('edit', '고치기', async () => { if (await promiseDialog(chat, p)) draw(); }, 'tiny')); };
    return h('section.alm-detail',
      h('header.alm-detail-head', h('div.alm-date', h('b', K.pad(date.getDate())), h('span', `${date.getMonth() + 1}월 · ${K.WEEK[date.getDay()]}요일`, h('small', rel))),
        h('div.alm-phase', moonIcon(20, date), h('span', ph.name)), h('span.alm-sp'),
        d.n ? h('span.alm-count', `메시지 ${d.n}개`, h('small', `나 ${d.user} · ${who(chat).char} ${d.ai}`)) : h('span.alm-count.dim', '이야기가 없던 날')),
      h('div.alm-acts', d.firstId ? btn('이날의 대화로 가기', { ic: 'chat', onclick: () => jumpTo(chat.id, d.firstId) }) : null, btn('약속 적기', { ic: 'plus', cls: 'ghost', onclick: async () => { if (await promiseDialog(chat, null, { date: key })) draw(); } }),
        d.n >= 2 && !d.dreams.length ? busyBtn('이날의 꿈 꾸기 · 호출 1회', { ic: 'moon', cls: 'ghost', busy: '꿈을 꾸는 중…' }, async () => { const r = await dreamOf(chat, msgs, key); draw(); emit('diary:open', { chat, at: r.id }); }) : null),
      d.promises.length ? sec('약속', d.promises.length, d.promises.map(prow)) : null,
      d.diary.length ? sec('일기', d.diary.length, d.diary.map(e => h('button.alm-entry', { onclick: () => emit('diary:open', { chat, at: e.id }) }, glyph('diary'), h('div', h('b', e.title || '제목 없는 밤'), h('p', String(e.text).replace(/\s+/g, ' ').slice(0, 150))), e.note ? h('i.alm-chip', e.answer ? '교환 일기 · 답글' : '교환 일기') : null))) : null,
      d.dreams.length ? sec('꿈', 0, d.dreams.map(e => h('button.alm-entry.dream', { onclick: () => emit('diary:open', { chat, at: e.id }) }, glyph('dream'), h('div', h('b', e.title || '이름 없는 꿈'), h('p', String(e.text).replace(/\s+/g, ' ').slice(0, 150))), h('i.alm-chip', '정사가 아님')))) : null,
      d.keepsakes.length ? sec('장면 기념품', d.keepsakes.length, h('div.alm-keeps', d.keepsakes.map(k => h('div.alm-keep', ticketEl(k, { onclick: () => emit('diary:open', { chat, at: k.id }) }), k.photo && Illust.data(k.photo) ? polaroid(Illust.data(k.photo), { onclick: () => jumpTo(chat.id, k.id), title: '이 장면으로 가기' }) : null)))) : null,
      pics.length ? sec('사진', pics.length, h('div.alm-pics', pics.slice(0, 12).map(p => polaroid(p.src, { title: p.title || '대화에서 보기', onclick: () => jumpTo(chat.id, p.msgId) })), pics.length > 12 ? h('small.hint', `외 ${pics.length - 12}장 — 대화에서 볼 수 있어요.`) : null)) : null,
      !d.n && !d.promises.length && !d.diary.length && !d.dreams.length && !d.keepsakes.length ? h('p.hint', gap >= 0 ? '아직 비어 있는 날이에요. 약속을 적어 둘 수 있어요.' : '이날은 남은 것이 없어요.') : null);
  };
  const askLetter = async again => {
    if (again) toast('편지를 쓰는 중이에요…');
    const rec = await writeLetter(chat, msgs, view.mk); if (!host.isConnected) return;
    draw(); showLetter(chat, rec, { onAgain: () => askLetter(true).catch(e => toast(e.message, 'err')) });
  };
  draw();
  const off = on('almanac:changed', c => { if (!host.isConnected || host._alm !== token) return off(); if (!c || c.id === chat.id) draw(); });
}

// ════════ 약속 수첩 화면 ════════
export function renderPromises(host, arg = {}) {
  if (arg.chatId) view.chatId = arg.chatId;
  const chat = defaultChat(); if (chat) view.chatId = chat.id;
  let shown = { missed: 12, kept: 12, upcoming: 40 }, busy = false;
  const draw = () => {
    const today = K.dayKey(now()), all = view.scope === 'all' || !chat;
    const rows = (all ? S.chats : [chat]).flatMap(c => Promises.of(c).map(p => ({ p, c, s: K.promiseState(p, today) })));
    const by = s => rows.filter(r => r.s === s), up = by('upcoming').sort((a, b) => a.p.date.localeCompare(b.p.date)), missed = by('missed').sort((a, b) => b.p.date.localeCompare(a.p.date)), kept = by('kept').sort((a, b) => b.p.date.localeCompare(a.p.date));
    const row = ({ p, c, s }) => { const d = K.keyDate(p.date), gap = K.diffDays(today, p.date); return h(`div.alm-prow.${s}`,
      h('button.alm-pdate', { title: '달력에서 보기', onclick: () => go('diary', { tab: 'calendar', chatId: c.id, day: p.date }) }, h('b', `${K.pad(d.getMonth() + 1)}.${K.pad(d.getDate())}`), h('small', `${K.WEEK[d.getDay()]} · ${gap === 0 ? '오늘' : gap > 0 ? `D-${gap}` : `${-gap}일 전`}`)),
      h('div.alm-ptext', h('b', p.what), h('small', [p.time, all ? `${namesOf(c)} · ${roomOf(c)}` : '', BY[p.by] || ''].filter(Boolean).join(' · '))),
      s === 'missed' ? glyph('missed', '지나간 약속') : null,
      p.later ? null : h('button.alm-pr-check', { title: p.done ? '되돌리기' : '지켰어요', onclick: async () => { await Promises.toggle(c, p); } }, glyph(p.done ? 'kept' : 'open')),
      iconBtn('more', '더 보기', e => menu(e.currentTarget, [!p.later && { label: '고치기', ic: 'edit', onclick: () => promiseDialog(c, p) }, { label: '달력에서 보기', ic: 'moon', onclick: () => go('diary', { tab: 'calendar', chatId: c.id, day: p.date }) }, p.msgId && { label: '약속한 대화로 가기', ic: 'chat', onclick: () => jumpTo(c.id, p.msgId) }, !p.msgId && { label: '이 대화로 가기', ic: 'chat', onclick: () => go('chat', c.id) },
        s === 'missed' && !p.later && { label: p.excused ? '다시 서운해해도 돼요' : '서운해하지 않게 넘어가기', ic: 'heart', onclick: async () => { p.excused = !p.excused; await save(c); changed(c); } }, '-', { label: '지우기', ic: 'trash', danger: true, onclick: async () => { if (await confirmBox('이 약속을 지울까요?', '지우기', true)) await Promises.remove(c, p); } }]), 'tiny')); };
    const sec = (title, list, key, note) => list.length ? h('div.alm-psec', h('h3.form-sec', title, h('i.badge', String(list.length))), note ? h('small.hint', note) : null, list.slice(0, shown[key] || 99).map(row), list.length > (shown[key] || 99) ? btn(`더 보기 (${list.length - shown[key]})`, { cls: 'ghost wide', onclick: () => { shown[key] += 40; draw(); } }) : null) : null;
    host.replaceChildren(
      h('div.alm-ptop', chat ? h('div.alm-scope', h(`button.chip${!all ? '.on' : ''}`, { onclick: () => { view.scope = 'one'; draw(); } }, `${namesOf(chat)} · ${roomOf(chat)}`), h(`button.chip${all ? '.on' : ''}`, { onclick: () => { view.scope = 'all'; draw(); } }, '모든 대화'), iconBtn('search', '다른 대화 고르기', () => pickChat({ current: chat.id, onPick: c => { view.scope = 'one'; renderPromises(host, { chatId: c.id }); } }), 'tiny')) : null,
        h('span.alm-sp'), chat ? btn('약속 적기', { ic: 'plus', onclick: () => promiseDialog(chat) }) : null,
        chat ? busyBtn(busy ? '찾는 중…' : '대화에서 지금 뽑기 · 호출 1회', { ic: 'sparkle', cls: 'primary', busy: '찾는 중…', title: `${namesOf(chat)}와(과)의 최근 대화 60개에서 날짜가 있는 약속을 찾아 적습니다` }, async () => { const r = await extractByCall(chat, await loadChat(chat)); toast(r.added.length ? `약속 ${r.added.length}개를 적었어요.` : r.found.length ? '찾은 약속은 이미 모두 적혀 있어요.' : '날짜가 있는 약속을 찾지 못했어요.'); }) : null,
        chat ? iconBtn('sliders', '뽑기 지시문 고치기', () => editPrompts(['extract', 'promiseOffer', 'promiseToday', 'promiseMissed'], '약속 수첩 지시문'), 'tiny') : null),
      rows.length ? null : h('div.empty', glyph('open'), h('p', '아직 적힌 약속이 없어요.'), h('small.hint', '대화 모드에서 날짜를 정해 약속하면 캐릭터가 직접 적어 두고, 여기서 직접 적거나 대화에서 뽑을 수도 있어요.')),
      sec('오늘', by('today'), 'today', '오늘 이 대화방을 열면 캐릭터가 먼저 꺼냅니다.'), sec('다가오는 약속', up, 'upcoming'), sec('지나간 약속', missed, 'missed', A().promiseSulk !== false ? '지켜지지 않고 지나간 약속이에요. 캐릭터가 한 번 서운해할 수 있어요. 지켰다면 동그라미를 눌러 주세요.' : '지켜지지 않고 지나간 약속이에요.'), sec('지킨 약속', kept, 'kept'));
  };
  draw();
  const token = host._alm = uid();
  const off = on('almanac:changed', () => { if (!host.isConnected || host._alm !== token) return off(); draw(); });
}

// ════════ 한 권으로 묶기 ════════
/** 대화 한 편을 f-bind.js 가 받는 모양으로 모은다 */
export function gatherBook(chat, msgs, o = {}) {
  const opt = { title: '', sub: '', mode: 'day', size: 40, page: 'A5', cover: 'avatar', talk: true, diary: true, dreams: true, letters: true, keepsakes: true, photos: true, almanac: true, hand: true, ...o };
  const ch = charOf(chat), w = who(chat), a = A(), today = K.dayKey(now()), days = K.collectDays(chat, msgs);
  const hm = t => { const d = new Date(t); return t ? `${K.pad(d.getMonth() + 1)}.${K.pad(d.getDate())} ${K.pad(d.getHours())}:${K.pad(d.getMinutes())}` : ''; };
  const pics = m => opt.photos ? K.photosOf(m).map(p => ({ src: photoSrc(p), title: p.title })).filter(p => p.src) : [];
  const chapters = !opt.talk ? [] : K.chaptersOf(msgs, { mode: opt.mode, size: opt.size, diary: chat.diary || [] }).map(c => ({ ...c, startTs: K.msgTs(msgs.slice(c.from, c.to).find(K.msgTs)), extras: [],
    blocks: msgs.slice(c.from, c.to).filter(m => m && !m.hidden).map(m => m.curtain ? { t: 'curtain', ...m.curtain } : m.role === 'system' ? { t: 'sys', text: m.dice ? '' : cleanText(m) } : { t: 'msg', role: m.role, name: speaker(m, chat), text: cleanText(m), time: hm(K.msgTs(m)), style: chat.mode === 'talk' && !m.scene ? 'chat' : 'prose', photos: pics(m) }).filter(b => b.t !== 'sys' || b.text) })).filter(c => c.blocks.length);
  const idx = new Map(msgs.map((m, i) => [m.id, i]));
  const items = [
    ...(opt.diary ? (chat.diary || []).map(e => ({ t: 'diary', ts: e.ts, at: e.to > 0 ? e.to - 1 : -1, title: e.title, text: e.text, storyDate: e.storyDate, mood: e.mood, weather: e.weather, note: e.note, noteBy: w.user, answer: e.answer, sign: S.get('chars', e.by)?.name || w.char })) : []),
    ...(opt.dreams ? (chat.dreams || []).map(e => ({ t: 'dream', ts: e.ts, at: -1, title: e.title, text: e.text, phaseName: e.phaseName })) : []),
    ...(opt.keepsakes ? (chat.keepsakes || []).filter(k => !k.gone).map(k => ({ t: 'keepsake', ts: k.ts, at: idx.has(k.id) ? idx.get(k.id) : -1, id: k.id, no: k.no, title: k.title, place: k.place, time: k.time, summary: k.summary, memo: k.memo, day: K.dayKey(k.ts || now()), photo: opt.photos ? Illust.data(k.photo) : '' })) : []),
  ].sort((x, y) => (x.ts || 0) - (y.ts || 0));
  const loose = [];
  for (const it of items) {
    let c = it.at >= 0 ? chapters.find(x => it.at >= x.from && it.at < x.to) : null;
    if (!c) c = [...chapters].reverse().find(x => x.startTs && x.startTs <= it.ts);
    (c ? c.extras : loose).push(it);
  }
  const keys = [...days.values()].filter(d => d.n).map(d => d.key).sort(), first = keys[0], last = keys[keys.length - 1];
  const months = []; if (opt.almanac && first) { let mk = first.slice(0, 7); const end = last.slice(0, 7); while (mk <= end && months.length < 240) { const s = K.monthStats(days, mk, a.goal, today); if (s.active || months.length) months.push({ mk, active: s.active, target: s.target, fill: s.fill, full: s.full, weeks: K.monthGrid(mk).map(wk => wk.map(c => { const d = days.get(c.key); return { d: c.d, inMonth: c.inMonth, n: d?.n || 0, mark: !!(d && (d.diary.length || d.keepsakes.length || d.promises.length)) }; })) }); mk = K.shiftMonth(mk, 1); } while (months.length && !months[months.length - 1].active) months.pop(); }
  const firstPic = opt.cover === 'photo' ? msgs.flatMap(m => m && !m.hidden ? K.photosOf(m) : []).map(photoSrc).find(Boolean) : '';
  return { title: opt.title.trim() || `${w.char}와(과)의 이야기`, sub: opt.sub.trim(), charName: w.char, userName: w.user, page: opt.page, accent: getComputedStyle(document.documentElement).getPropertyValue('--accent').trim(), madeKey: today, hand: opt.hand ? (f => ({ family: f.name, q: f.q || '', scale: +(f.k * f.size).toFixed(3), lh: f.lh, color: f.color }))(fontOf(ch)) : null,
    avatar: opt.cover === 'avatar' ? ch?.avatar || '' : '', cover: firstPic || '', moonFill: months.length ? months[months.length - 1].fill : 0.18,
    stats: { msgs: [...days.values()].reduce((n, d) => n + d.n, 0), days: keys.length, from: first || '', to: last || '' }, chapters, loose,
    letters: opt.letters ? (chat.letters || []).map(l => ({ t: 'letter', label: `${l.month.slice(0, 4)}년 ${+l.month.slice(5)}월`, title: l.title, text: l.text, ps: l.ps, sign: S.get('chars', l.by)?.name || w.char })) : [],
    months, promises: opt.almanac ? (chat.promises || []).filter(p => K.validKey(p.date)).sort((x, y) => x.date.localeCompare(y.date)).map(p => ({ date: p.date, time: p.time, what: p.what, state: K.promiseState(p, today) })) : [] };
}
export async function bindDialog(chat) {
  const msgs = await loadChat(chat); await syncChat(chat, msgs, { quiet: true });
  const w = who(chat), o = { title: `${w.char}와(과)의 이야기`, sub: roomOf(chat), mode: (chat.diary || []).some(e => e.to > 0) ? 'diary' : (chat.keepsakes || []).some(k => !k.gone) ? 'scene' : 'day', size: 40, page: 'A5', cover: 'avatar', talk: true, diary: true, dreams: true, letters: true, keepsakes: true, photos: true, almanac: true, hand: true };
  const count = msgs.filter(m => !m.hidden && m.role !== 'system').length, nPics = msgs.flatMap(m => m.hidden ? [] : K.photosOf(m)).length, info = h('small.hint');
  const make = () => buildBook(gatherBook(chat, msgs, o));
  const note = () => { info.textContent = `메시지 ${count}개 · 사진 ${nPics}장 · 일기 ${(chat.diary || []).length} · 꿈 ${(chat.dreams || []).length} · 편지 ${(chat.letters || []).length} · 기념품 ${(chat.keepsakes || []).filter(k => !k.gone).length}. 사진은 파일 안에 함께 담기므로 많으면 파일이 커집니다. 추가 호출은 없습니다.`; };
  note();
  modal({ title: '한 권으로 묶기', wide: true, body: h('div.col', h('p.hint', '이 대화를 표지 · 장(章) · 일기 · 사진 · 기념품과 함께 HTML 한 파일로 만듭니다. 파일을 열어 인쇄 창에서 "PDF로 저장"을 고르면 책이 됩니다.'),
    form(o, [{ k: 'title', label: '책 제목', half: true }, { k: 'sub', label: '부제 (비워도 돼요)', half: true },
      { k: 'mode', label: '장(章) 나누기', type: 'select', opts: [['diary', '일기가 쓰인 곳마다'], ['day', '날짜마다'], ['scene', '장면마다'], ['count', '메시지 수로']], third: true }, { k: 'size', label: '한 장의 메시지 수 (메시지 수로 나눌 때)', type: 'num', min: 5, step: 1, third: true },
      { k: 'page', label: '판형', type: 'select', opts: [['A5', 'A5 (책 크기)'], ['A4', 'A4']], third: true },
      { k: 'cover', label: '표지 사진', type: 'select', opts: [['avatar', '캐릭터 초상'], ['photo', '대화의 첫 사진'], ['none', '넣지 않기']], half: true },
      { section: '담을 것' }, { k: 'talk', label: '대화 본문', type: 'check' }, { k: 'photos', label: '사진 (삽화 · 첨부 이미지)', type: 'check' }, { k: 'diary', label: '일기와 교환 일기', type: 'check' }, { k: 'dreams', label: '꿈 페이지', type: 'check' }, { k: 'keepsakes', label: '장면 기념품', type: 'check' }, { k: 'letters', label: '이달의 편지', type: 'check' }, { k: 'almanac', label: '달력과 약속 수첩 (부록)', type: 'check' },
      { k: 'hand', label: `일기 · 편지 · 꿈을 ${w.char}의 일기장 글씨체(${fontOf(charOf(chat)).ko})로 쓰기`, type: 'check', hint: '이것만은 파일을 열 때 인터넷에서 글꼴을 받아 옵니다. 연결이 없으면 기본 글꼴로 보여요.' }], note), info),
    actions: [{ label: '닫기' }, { label: '열어서 인쇄하기', ic: 'eye', onclick: () => { const url = URL.createObjectURL(new Blob([make()], { type: 'text/html' })); if (!window.open(url, '_blank')) toast('새 창이 막혔어요. "파일로 저장"을 써 주세요.', 'err'); setTimeout(() => URL.revokeObjectURL(url), 120000); return false; } },
      { label: '파일로 저장', ic: 'import', cls: 'primary', onclick: () => { const html = make(); download(`${`${w.char}-${o.title}`.replace(/[\\/:*?"<>|\s]+/g, '_').slice(0, 80)}.html`, html, 'text/html'); toast(`책 한 권을 묶었어요 (${(html.length / 1048576).toFixed(1)}MB)`); return false; } }] });
}

// ════════ 캐릭터의 일기장 글씨체 ════════
// 구글 폰트의 한글 손글씨. k 는 글꼴마다 다른 눈대중 크기를 맞추는 배율, q 는 굵기 축. 고른 글꼴만 그때 불러온다.
export const FONTS = [
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
export const INKS = { ink: ['먹색', '#2b2622', 'black ink'], navy: ['남색', '#1f2a52', 'dark navy'], cobalt: ['코발트', '#2340b8', 'cobalt blue pen'], brown: ['밤색', '#5a3a26', 'sepia brown'], green: ['솔잎색', '#2c4a3a', 'deep green'], plum: ['자두색', '#5a2748', 'plum'], pencil: ['연필', '#55555c', 'pencil grey'] };
PROMPTS.font = { label: '일기장 글씨체 고르기', hint: '{{fonts}} 후보 목록, {{inks}} 잉크 색 목록이 들어갑니다. JSON 형식(font · reason · ink · size)은 바꾸지 마세요.', text: `You choose the handwriting for {{char}}'s private diary. Read the character below — personality, manner of speech, age and temperament — and pick the ONE font from the list whose hand feels most like how {{char}} would really write.
Candidates (name — impression):
{{fonts}}
Ink colours: {{inks}}.
Reply with ONE JSON object and nothing else: {"font":"the exact name from the list","reason":"one short sentence in Korean saying why this hand suits {{char}}","ink":"one ink key from the list, or empty","size":"small, normal or large — how big {{char}} writes"}` };
const clampN = (v, a, b, d) => { const n = +v; return isFinite(n) && n ? Math.min(b, Math.max(a, n)) : d; };
/** 이 캐릭터의 글씨: 정해 둔 것이 없으면 기본(Gaegu · 먹색) */
export function fontOf(ch) {
  const f = ch?.diaryFont || {}, def = FONTS.find(x => x.name === f.font) || FONTS[0], ink = INKS[f.ink] ? f.ink : 'ink';
  return { ...def, size: clampN(f.size, 0.7, 1.6, 1), lh: clampN(f.lh, 0.8, 1.5, 1), ink, color: INKS[ink][1], reason: String(f.reason || ''), by: f.by || '', ai: f.ai || null, custom: !!ch?.diaryFont };
}
export const loadFont = name => { const f = FONTS.find(x => x.name === name); if (!f) return; const slug = f.name.toLowerCase().replace(/\s+/g, '-'); if (!document.querySelector(`link[data-font="${slug}"]`)) document.head.append(h('link', { rel: 'stylesheet', href: `https://fonts.googleapis.com/css2?family=${f.name.replace(/ /g, '+')}${f.q || ''}&display=swap`, dataset: { font: slug } })); };
/** 요소에 글씨체 변수를 건다 (--bk-font · --bk-size · --blh · --bk-ink). 종이가 어두운 쪽은 ink:false */
export function applyFont(el, ch, { ink = true } = {}) {
  const f = fontOf(ch); loadFont(f.name);
  el.style.setProperty('--bk-font', `"${f.name}"`); el.style.setProperty('--bk-size', `${(1.3 * f.k * f.size).toFixed(3)}rem`); el.style.setProperty('--blh', `${(2.05 * f.size * f.lh).toFixed(3)}rem`);
  if (ink) el.style.setProperty('--bk-ink', f.color); else el.style.removeProperty('--bk-ink');
  return f;
}
const saveFont = async (ch, patch) => { ch.diaryFont = { ...(ch.diaryFont || {}), ...patch }; await S.save('chars', ch, true); emit('almanac:font', ch); };
/** AI 에게 글씨체를 골라 달라고 한다 (추가 호출 1회) */
export async function pickFontByCall(ch, chat, signal) {
  const user = (chat ? S.persona(chat)?.name : '') || S.settings.userNameFallback || 'the user';
  const sys = fillT(P('font'), { char: ch.name, user, fonts: FONTS.map(f => `- ${f.name} — ${f.en}`).join('\n'), inks: Object.entries(INKS).map(([k, v]) => `${k} (${v[2]})`).join(', ') });
  const card = [`[Character: ${ch.name}]`, [ch.description, ch.personality].filter(Boolean).join('\n').slice(0, 3000), ch.mesExample ? `[How ${ch.name} talks]\n${String(ch.mesExample).slice(0, 1400)}` : '', ch.firstMes ? `[First message]\n${String(ch.firstMes).slice(0, 700)}` : ''].filter(Boolean).join('\n\n');
  const j = parseLoose(await quickCall(sys, card, { maxTokens: 400, signal, conn: S.helperConn('all', chat) }));
  const want = String(j?.font || '').trim().toLowerCase(), hit = FONTS.find(f => f.name.toLowerCase() === want) || FONTS.find(f => want && (want.includes(f.name.toLowerCase()) || f.name.toLowerCase().includes(want)));
  if (!hit) throw new Error('글씨체를 고르지 못했어요. 다시 해 보세요.');
  const pick = { font: hit.name, reason: String(j?.reason || '').replace(/\s+/g, ' ').trim().slice(0, 160), ink: INKS[String(j?.ink || '').trim().toLowerCase()] ? String(j.ink).trim().toLowerCase() : 'ink', size: /small|작/i.test(j?.size) ? 0.9 : /large|big|크/i.test(j?.size) ? 1.12 : 1 };
  await saveFont(ch, { ...pick, lh: ch.diaryFont?.lh || 1, by: 'ai', ai: { ...pick } });
  return pick;
}
const sampleOf = ch => { for (const c of [...S.chats].filter(x => x.charIds?.[0] === ch.id && (x.diary || []).length).sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))) { const line = String(c.diary[c.diary.length - 1].text || '').split(/\n|(?<=[.!?。…])\s/).map(s => s.trim()).find(s => s.length >= 8); if (line) return line.slice(0, 64); } return '오늘은 별일 없었는데, 자꾸 그 말이 생각난다.'; };
/** 글씨체 고르기: 견본을 보며 직접 고르거나, AI 에게 맡긴다 */
export function fontDialog(ch, { chat, onChange } = {}) {
  if (!ch) return toast('이 대화의 캐릭터를 찾을 수 없어요.', 'err');
  FONTS.forEach(f => loadFont(f.name));
  const sample = sampleOf(ch), body = h('div.alm-fonts');
  const set = async patch => { await saveFont(ch, { ...patch, by: patch.by || 'user' }); draw(); onChange?.(); };
  const draw = () => {
    const f = fontOf(ch), raw = ch.diaryFont || {};
    const paper = h('div.alm-font-paper', h('p', sample), h('p', `— ${ch.name}`)); applyFont(paper, ch);
    const range = (label, key, min, max, val) => { const out = h('output', `${Math.round(val * 100)}%`); return h('label.field.half', h('span.field-label', label), h('div.range', h('input', { type: 'range', min, max, step: 0.05, value: val, oninput: e => { out.textContent = `${Math.round(e.target.value * 100)}%`; paper.style.setProperty(key === 'size' ? '--bk-size' : '--blh', key === 'size' ? `${(1.3 * f.k * e.target.value).toFixed(3)}rem` : `${(2.05 * f.size * e.target.value).toFixed(3)}rem`); }, onchange: e => set({ [key]: +e.target.value }) }), out)); };
    body.replaceChildren(
      h('div.alm-font-top', paper, h('div.alm-font-side',
        f.reason ? h('p.alm-font-why', h('small', raw.by === 'ai' ? 'AI가 고른 이유' : 'AI가 골랐던 이유'), f.reason) : h('p.hint', f.custom ? '직접 고른 글씨체예요.' : '아직 정해 둔 글씨체가 없어 기본 글씨(개구)로 씁니다.'),
        h('div.row.wrap', busyBtn('글씨체 골라 달라고 하기 · 호출 1회', { ic: 'sparkle', cls: 'primary', busy: '성격과 말투를 읽는 중…' }, async () => { const p = await pickFontByCall(ch, chat); draw(); onChange?.(); toast(`${FONTS.find(x => x.name === p.font)?.ko || p.font} 글씨로 골랐어요.`); }), iconBtn('sliders', '고르기 지시문 고치기', () => editPrompts(['font'], '글씨체 고르기 지시문'), 'tiny')),
        h('small.hint', `${ch.name}의 설명 · 성격 · 예시 대화를 읽고 후보 ${FONTS.length}종 가운데 하나를 고릅니다. ${ch.name}의 모든 대화방 일기장에 적용돼요.`))),
      h('div.alm-font-grid', FONTS.map(x => h(`button.alm-font${x.name === f.name ? '.on' : ''}`, { type: 'button', onclick: () => set({ font: x.name }) }, h('span.alm-font-s', { style: { fontFamily: `"${x.name}", var(--font)`, fontSize: `${(1.25 * x.k).toFixed(2)}rem` } }, sample), h('span.alm-font-n', h('b', x.ko), h('small', `${x.name} · ${x.note}`)), raw.ai?.font === x.name ? h('i.alm-chip', 'AI 추천') : null))),
      h('div.form', range('글자 크기', 'size', 0.7, 1.6, f.size), range('줄 간격', 'lh', 0.8, 1.5, f.lh),
        h('div.field', h('span.field-label', '잉크 색'), h('div.alm-inks', Object.entries(INKS).map(([k, v]) => h(`button${k === f.ink ? '.on' : ''}`, { type: 'button', title: v[0], 'aria-label': v[0], style: { '--c': v[1] }, onclick: () => set({ ink: k }) }, h('i'), h('span', v[0])))))),
      h('div.row.wrap', raw.ai && raw.by !== 'ai' ? btn('AI가 고른 것으로 되돌리기', { ic: 'refresh', cls: 'ghost', onclick: () => set({ ...raw.ai, by: 'ai' }) }) : null, f.custom ? btn('기본 글씨로', { cls: 'ghost', onclick: async () => { delete ch.diaryFont; await S.save('chars', ch, true); emit('almanac:font', ch); draw(); onChange?.(); } }) : null));
  };
  draw();
  return modal({ title: `${ch.name}의 일기장 글씨체`, wide: true, body, actions: [{ label: '닫기', cls: 'primary' }] });
}

// ════════ 대화 화면: 패널 · 메뉴 · 명령어 ════════
let panelHost = null, panelChat = null;
const drawPanel = (chat, msgs) => {
  const today = K.dayKey(now()), mk = K.monthKey(now()), st = K.monthStats(K.collectDays(chat, msgs), mk, A().goal, today), list = Promises.of(chat).filter(p => !p.done && K.diffDays(today, p.date) >= -7).slice(0, 5);
  return [h('button.alm-pmoon', { title: '달력 펼치기', onclick: () => go('diary', { tab: 'calendar', chatId: chat.id }) }, moonMini(st.fill, 34), h('div', h('b', `${+mk.slice(5)}월 · ${st.active} / ${st.target}일`), h('small', st.full ? '보름달이 떴어요 — 이달의 편지를 받을 수 있어요' : `${K.phaseName(K.fillToPhase(st.fill))} · 보름까지 ${st.left}일`))),
    list.length ? h('div.alm-plist', list.map(p => { const s = K.promiseState(p, today); return h(`button.alm-pmini.${s}`, { onclick: () => go('diary', { tab: 'calendar', chatId: chat.id, day: p.date }) }, glyph(s === 'upcoming' ? 'open' : s), h('span', p.what), h('small', p.date === today ? '오늘' : `${+p.date.slice(5, 7)}.${+p.date.slice(8)}`)); })) : h('p.dim', '적어 둔 약속이 없어요.'),
    h('div.row.wrap', btn('약속 적기', { ic: 'plus', cls: 'ghost', onclick: () => promiseDialog(chat) }), btn('약속 수첩', { ic: 'note', cls: 'ghost', onclick: () => go('diary', { tab: 'promises', chatId: chat.id }) }), btn('한 권으로 묶기', { ic: 'book', cls: 'ghost', onclick: () => bindDialog(chat) }))];
};
X.panels.push({ owner: 'almanac', id: 'almanac', title: '달력 · 약속', icon: 'moon', render: (chat, msgs) => { panelChat = chat; panelHost = h('div.alm-panel', drawPanel(chat, msgs || [])); syncChat(chat, msgs || [], { quiet: false }).catch(() => { }); return panelHost; } });
on('almanac:changed', c => { if (c && panelHost?.isConnected && panelChat?.id === c.id) panelHost.replaceChildren(...drawPanel(c, chatApi.current().msgs || [])); });
X.actions.push({ owner: 'almanac', id: 'alm-promise', label: '약속으로 적기', icon: 'note', run: (m, chat) => promiseDialog(chat, null, { what: cleanText(m).split('\n').map(s => s.trim()).filter(Boolean)[0]?.replace(/^["“]|["”]$/g, '').slice(0, 60) || '', date: K.addDays(K.dayKey(now()), 1), msgId: m.id }) });
X.actions.push({ owner: 'almanac', id: 'alm-day', label: '이날의 달력 보기', icon: 'moon', run: (m, chat) => go('diary', { tab: 'calendar', chatId: chat.id, day: K.dayKey(K.msgTs(m) || now()) }) });
X.composer.push({ owner: 'almanac', id: 'alm-add', label: '약속 적기', icon: 'note', run: () => { const c = chatApi.current().chat; if (c) promiseDialog(c); } });
X.composer.push({ owner: 'almanac', id: 'alm-open', label: '달력 · 약속 수첩', icon: 'moon', run: () => { const c = chatApi.current().chat; go('diary', { tab: 'calendar', chatId: c?.id }); } });
X.commands.set('/promise', { owner: 'almanac', help: '약속 수첩에 적기 — /promise 내일 같이 영화 보기 · /promise 2026-12-24 19:00 저녁', run: async (arg, api) => {
  const chat = api.current().chat; if (!chat) return; const tok = String(arg || '').trim().split(/\s+/).filter(Boolean);
  if (!tok.length) return promiseDialog(chat);
  for (let n = Math.min(3, tok.length - 1); n >= 1; n--) { const date = K.resolveDate(tok.slice(0, n).join(' ')); if (!date) continue; let rest = tok.slice(n), time = K.normTime(rest[0]); if (time && rest.length > 1) rest = rest.slice(1); else time = ''; const p = await Promises.add(chat, { date, time, what: rest.join(' ') }); return toast(`약속 수첩에 적었어요 — ${K.koDate(p.date, { year: false })} ${p.what}`); }
  return promiseDialog(chat, null, { what: tok.join(' ') });
} });
X.commands.set('/almanac', { owner: 'almanac', help: '이 대화의 달력 펼치기', run: (_, api) => go('diary', { tab: 'calendar', chatId: api.current().chat?.id }) });
X.commands.set('/bind', { owner: 'almanac', help: '이 대화를 한 권으로 묶기 (인쇄용 HTML)', run: (_, api) => { const c = api.current().chat; if (c) return bindDialog(c); } });

seed();
