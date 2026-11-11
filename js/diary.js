// ── Dreamland diary: 꿈 일기장. 캐릭터가 자기 목소리로 그날의 이야기를 적어 두는 책 ──
// 책에는 일기 말고도 꿈 · 장면 기념품 · 이달의 편지가 시간 순으로 꽂힌다 (만드는 쪽은 f-almanac.js).
import { S, h, on, uid, now, msgText, download } from './core.js';
import { icon, btn, iconBtn, toast, modal, confirmBox, promptBox, registerPage, go, pageHead, moonIcon, moonPhase, menu } from './ui.js';
import { quickCall } from './engine.js';
import { parseLoose, Memory } from './memory.js';
import { Illust } from './illust.js';
import * as Alm from './f-almanac.js';
import * as K from './f-keepsake.js';

export const DIARY_PROMPT = `You are {{char}}. Tonight you write in your private diary about what happened since your last entry. Write in first person, in {{char}}'s own voice and habits of speech, honest in a way {{char}} would never be out loud: what happened, what you noticed about {{user}}, what you felt and did not say. Do not invent events that are not in the record. 120 to 220 words, in the same language as the roleplay.
Reply with ONE JSON object and nothing else: {"title":"a short title for the entry","date":"the in-story date or time if the story gives one, else empty","mood":"one or two words for how {{char}} feels tonight","weather":"the weather in the story today if the record shows it, else empty","text":"the diary entry, paragraphs separated by \\n\\n"}`;
const DIARY_DEF = { k: 'diary.prompt', label: '일기 쓰기', type: 'area', rows: 6, ph: DIARY_PROMPT, hint: 'JSON 형식(title · date · mood · weather · text)은 바꾸지 마세요. 비워 두면 기본 문장을 씁니다 (칸에 흐리게 보이는 글).' };

const charOf = chat => S.get('chars', chat.charIds[0]);
const hue = s => { let n = 0; for (const c of String(s)) n = (n * 31 + c.charCodeAt(0)) % 360; return n; };
const paras = t => String(t || '').split(/\n{2,}/).map(p => p.trim()).filter(Boolean).map(p => h('p', p));

/** 마지막 일기 이후의 대화를 읽고 캐릭터가 일기를 쓴다 (추가 호출 1회) */
export async function writeDiary(chat, msgs, signal) {
  const ch = charOf(chat); if (!ch) throw new Error('이 대화의 캐릭터를 찾을 수 없어요.');
  const user = S.persona(chat).name;
  let at = chat.diaryAt || 0;   // 메시지를 지워 자리가 어긋났으면 마지막 일기 뒤에 온 메시지부터
  if (at > msgs.length) { const t = (chat.diary || []).slice(-1)[0]?.ts || 0; at = msgs.findIndex(m => K.msgTs(m) > t); if (at < 0) at = msgs.length; }
  const fresh = msgs.slice(at).filter(m => !m.hidden);
  if (fresh.length < 2) throw new Error('일기에 적을 새 이야기가 아직 없어요.');
  const script = fresh.slice(-40).map(m => `${m.role === 'user' ? user : m.role === 'system' ? 'Narrator' : (m.name || ch.name)}: ${K.stripPromiseTags(Illust.strip(msgText(m))).slice(0, 1500)}`).join('\n\n');
  const prev = (chat.diary || []).slice(-1)[0];
  const sys = (String(S.settings.diary?.prompt || '').trim() || DIARY_PROMPT).replace(/\{\{char\}\}/g, ch.name).replace(/\{\{user\}\}/g, user);
  const out = await quickCall(sys, `[About ${ch.name}]\n${[ch.description, ch.personality].filter(Boolean).join('\n').slice(0, 2500)}\n\n${prev ? `[Previous entry]\n${prev.text.slice(0, 800)}\n\n` : ''}[What happened since]\n${script}`, { maxTokens: 1500, signal, conn: S.helperConn('all', chat) });
  const j = parseLoose(out);
  const text = (j?.text || out).trim(); if (!text) throw new Error('일기가 비어 있어요.');
  const scene = (Memory.get(chat.id)?.status || []).find(s => s.entity === 'scene' && s.slot === 'date');
  const pic = [...fresh].reverse().flatMap(m => m.swipes[m.sw]?.illust || []).filter(i => i && !i.hidden).map(i => i.id)[0] || '';
  const entry = { id: uid(), ts: now(), title: String(j?.title || '').trim(), storyDate: String(j?.date || scene?.value || '').trim(), mood: String(j?.mood || '').trim().slice(0, 24), weather: String(j?.weather || '').trim().slice(0, 24), text, by: ch.id, illust: pic, from: at, to: msgs.length };
  (chat.diary ||= []).push(entry); chat.diaryAt = msgs.length;
  await S.save('chats', chat, true);
  return entry;
}

// ── 책장 넘기기 ──
// 넘어가는 종이(leaf)의 앞면은 지금 쪽, 뒷면은 다음 펼침의 맞은편 쪽. 아직 가려져 있어야 할 반대쪽에는 옛 쪽을 잠깐 덮어 둔다.
function flipLeaves(book, before, dir, far = 1) {
  book.querySelectorAll('.bk-leaf, .bk-under, .bk-cast').forEach(x => x.remove());
  if (matchMedia('(max-width: 820px)').matches) {   // 한 단짜리 화면: 새 쪽이 옆에서 스르륵 들어온다
    const cls = dir > 0 ? 'swap-next' : 'swap-prev'; book.classList.remove('swap-next', 'swap-prev'); void book.offsetWidth; book.classList.add(cls); setTimeout(() => book.classList.remove(cls), 520);
    return;
  }
  const side = dir > 0 ? 'right' : 'left', newBack = book.querySelector(dir > 0 ? '.book-page.left' : '.book-page.right')?.cloneNode(true);
  const under = h(`div.bk-under.${dir > 0 ? 'left' : 'right'}`, skin(before, dir > 0 ? before.L : before.R)); book.append(under);
  const n = Math.min(6, Math.max(1, far)), gap = n > 1 ? 85 : 0, dur = n > 1 ? 620 : 820;
  const blank = cls => h(`div.book-page.${cls}.bk-blank`), nowLook = { shell: book.cloneNode(false) };
  for (let i = 0; i < n; i++) {
    const front = i === 0 ? (dir > 0 ? before.R : before.L).cloneNode(true) : blank(side), back = i === n - 1 && newBack ? newBack.cloneNode(true) : blank(dir > 0 ? 'left' : 'right');
    const leaf = h(`div.bk-leaf.${side}`, { style: { '--dur': dur + 'ms', '--delay': i * gap + 'ms', zIndex: String(20 + (n - i)) } },
      h('div.bk-face.front', i === 0 ? skin(before, front) : skin(nowLook, front), h('i.bk-shade')),
      h('div.bk-face.back', skin(nowLook, back), h('i.bk-shade')));
    book.append(leaf);
    const done = () => { leaf.remove(); if (i === n - 1) under.remove(); };
    leaf.addEventListener('animationend', done, { once: true }); setTimeout(done, dur + i * gap + 120);
  }
  // 종이가 드리우는 그림자: 넘어가는 쪽을 따라 반대편으로 건너간다
  const total = (n - 1) * gap + dur, cast = h(`i.bk-cast${dir > 0 ? '' : '.prev'}`, { style: { '--dur': total + 'ms' } }); book.append(cast); setTimeout(() => cast.remove(), total + 60);
  // 넘어가는 종이가 반대쪽에 내려앉기 전까지만 옛 쪽을 덮어 둔다
  setTimeout(() => under.remove(), (n - 1) * gap + dur * 0.5);
}
/** 옛 쪽의 생김새(꿈 쪽의 밤 색 · 글씨체)를 그대로 입힌 껍데기 */
function skin(look, pageEl) { const el = look.shell.cloneNode(false); el.classList.add('bk-skin'); el.classList.remove('swap-next', 'swap-prev'); el.append(pageEl); return el; }

// ── 기억에 올리기: 긴 글을 그대로 붓지 않고, 간추린 몇 줄만 올린다 ──
export const MEMO_PROMPT = `You turn a page of {{char}}'s private diary into long-term memory notes for an ongoing roleplay with {{user}}.
From the page, keep only what will still matter many scenes later: concrete events, promises and plans, decisions, changes in the relationship, facts newly learned about {{user}} or {{char}}.
Write 1 to 4 notes, one per line. Each note is one plain, self-contained sentence in third person that uses names instead of pronouns. No mood-only lines, no poetic wording, no line numbers or bullets, nothing that is not on the page.
Write in the same language as the page. Output only the lines.`;
const MEMO_DEF = { k: 'diary.memoPrompt', label: '기억으로 간추리기', type: 'area', rows: 6, ph: MEMO_PROMPT, hint: '일기 · 꿈 · 편지를 장기기억에 올릴 때 몇 줄로 간추리는 지시문입니다. 비워 두면 기본 문장을 씁니다.' };
function memoDialog(chat, p, { ch, user, onDone = () => { } } = {}) {
  const e = p.ref, kindName = TYPE[p.type][1], isDream = p.type === 'dream';
  const who = S.get('chars', e.by)?.name || ch.name, lines = () => ta.value.split('\n').map(x => x.replace(/^[\s\-•·*\d.)]+/, '').trim()).filter(Boolean);
  const ta = h('textarea.inp.memo-text', { rows: 6, placeholder: '기억에 남길 내용을 한 줄에 하나씩 적어 주세요.\n예: ' + who + '은(는) ' + user + '와(과) 토요일에 바다에 가기로 약속했다.' });
  const info = h('small.hint'), state = h('small.hint.memo-state');
  const count = () => { const n = lines(); info.textContent = n.length ? `기억 ${n.length}줄 · ${ta.value.trim().length}자 (원문 ${String(e.text || '').length}자)` : `원문 ${String(e.text || '').length}자 — 이대로 올리지 않고 몇 줄로 간추려 올립니다`; };
  ta.addEventListener('input', count);
  let busy = false, box;
  const have = () => [...(e.memIds || []), ...(e.memId ? [e.memId] : [])];
  const drawState = () => { const n = have().length; state.textContent = n ? `이 쪽에서 올린 기억 ${n}줄이 장기기억에 있어요. 다시 올리면 그 줄들을 바꿔 넣습니다.` : S.settings.memory?.enabled ? '' : '지금은 장기기억이 꺼져 있어요. 올려 두면 장기기억을 켰을 때부터 쓰입니다.'; };
  const ask = async btnEl => {
    if (busy) return; busy = true; const old = btnEl.textContent; btnEl.textContent = '간추리는 중…'; btnEl.disabled = true;
    try {
      const sys = (String(S.settings.diary?.memoPrompt || '').trim() || MEMO_PROMPT).replace(/\{\{char\}\}/g, who).replace(/\{\{user\}\}/g, user);
      const out = await quickCall(sys, `[${isDream ? 'A dream ' + who + ' had — not a real event. Note it as a dream.' : p.type === 'letter' ? 'A letter from ' + who + ' to ' + user : 'Diary page by ' + who}]${e.title ? '\nTitle: ' + e.title : ''}${e.storyDate ? '\nIn-story date: ' + e.storyDate : ''}\n\n${String(e.text || '').slice(0, 6000)}${e.note ? `\n\n[${user} wrote beside it]\n${e.note}` : ''}${e.answer ? `\n\n[${who} answered]\n${e.answer}` : ''}`, { maxTokens: 500, conn: S.helperConn('all', chat) });
      const got = String(out || '').split('\n').map(x => x.replace(/^[\s\-•·*\d.)]+/, '').trim()).filter(Boolean).slice(0, 6);
      if (!got.length) throw new Error('간추린 내용이 비어 있어요.');
      ta.value = got.join('\n'); count();
    } catch (er) { if (er?.name !== 'AbortError') toast(er.message || String(er), 'err'); }
    busy = false; btnEl.textContent = old; btnEl.disabled = false;
  };
  const put = async () => {
    const list = lines(); if (!list.length) { toast('기억에 올릴 줄이 없어요. 직접 적거나 간추리기를 눌러 주세요.', 'err'); return false; }
    const mem = await Memory.load(chat.id), gone = new Set(have());
    if (gone.size) { mem.memories = mem.memories.filter(m => !gone.has(m.id)); await Memory.save(mem); }
    const ids = [];
    for (const line of list) { const m = await Memory.add(chat.id, { kind: isDream ? 'impression' : 'event', summary: (isDream ? '[꿈 · 실제로 일어난 일이 아님] ' : '') + line.slice(0, 400), tags: ['manual', p.type === 'diary' ? 'diary' : p.type], importance: isDream ? 0.4 : 0.7, entities: [who] }); ids.push(m.id); }
    e.memIds = ids; delete e.memId; await S.save('chats', chat, true); toast(`${kindName}에서 기억 ${ids.length}줄을 올렸어요.`, 'ok'); onDone();
  };
  const drop = async () => { const gone = new Set(have()); const mem = await Memory.load(chat.id); mem.memories = mem.memories.filter(m => !gone.has(m.id)); await Memory.save(mem); delete e.memIds; delete e.memId; await S.save('chats', chat, true); toast('이 쪽에서 올린 기억을 내렸어요.'); onDone(); };
  // 이미 올린 줄이 있으면 그 줄들을 보여 준다
  const mem0 = Memory.get(chat.id), ids0 = new Set(have()); if (mem0 && ids0.size) ta.value = mem0.memories.filter(m => ids0.has(m.id)).map(m => m.summary.replace(/^\[꿈 · 실제로 일어난 일이 아님\]\s*/, '')).join('\n');
  count(); drawState();
  const askBtn = h('button.btn', { type: 'button', onclick: ev => ask(ev.currentTarget) }, 'AI가 간추리기 · 호출 1회');
  box = modal({ title: `기억에 올리기 · ${kindName}`, wide: true, body: h('div.memo-dlg',
    h('div.memo-src', h('span.field-label', `${kindName} 원문`), h('div.memo-page', paras(e.text))),
    h('div.memo-out', h('span.field-label', '기억에 올릴 내용'), ta, info,
      h('div.row.wrap', askBtn, iconBtn('sliders', '간추리는 지시문 고치기', () => Alm.editPrompts([], '기억으로 간추리는 지시문', [MEMO_DEF]))),
      h('small.hint', '한 줄이 기억 한 장이 됩니다. AI가 간추린 뒤에도 마음대로 고칠 수 있고, 처음부터 직접 적어도 됩니다.'), state)),
    actions: [have().length ? { label: '기억에서 내리기', onclick: drop } : null, { label: '취소' }, { label: '기억에 올리기', cls: 'primary', onclick: put }].filter(Boolean) });
}

const TYPE = { diary: ['DIARY', '일기'], dream: ['DREAM', '꿈'], keepsake: ['KEEPSAKE', '기념품'], letter: ['LETTER', '편지'] };
const titleOf = p => p.type === 'diary' ? (p.ref.title || '제목 없는 밤') : p.type === 'dream' ? (p.ref.title || '이름 없는 꿈') : p.type === 'keepsake' ? (p.ref.title || '이름 없는 장면') : (p.ref.title || `${+p.ref.month.slice(5)}월의 편지`);

/** 책을 펼친다. opt.at: 펼칠 쪽의 id (일기 · 꿈 · 기념품 · 편지) */
export async function openDiary(chat, opt = {}) {
  document.querySelector('.book-wrap')?.remove();
  const msgs = await Alm.loadChat(chat); await Alm.syncChat(chat, msgs, { quiet: true });
  const ch = charOf(chat) || { name: '?' }, user = S.persona(chat)?.name || '나';
  let pages = Alm.pagesOf(chat), page = opt.at ? pages.findIndex(p => p.id === opt.at) : pages.length - 1, busy = '', writing = false;
  if (page < 0) page = Math.max(0, pages.length - 1);
  const book = h('div.book'), bar = h('div.book-bar');
  const save = () => S.save('chats', chat, true);
  const reload = keep => { pages = Alm.pagesOf(chat); const i = keep ? pages.findIndex(p => p.id === keep) : -1; page = i >= 0 ? i : Math.min(Math.max(0, pages.length - 1), page); };
  const close = () => { wrap.classList.add('out'); setTimeout(() => wrap.remove(), 200); document.removeEventListener('keydown', key); offRoute(); offFont(); };
  const key = e => { if (!wrap.isConnected) return close(); if (document.querySelector('.modal-wrap') || e.target.matches?.('textarea, input, select')) return; if (e.key === 'Escape') close(); if (e.key === 'ArrowLeft') turn(-1); if (e.key === 'ArrowRight') turn(1); };
  const calm = () => S.settings.motion === false || matchMedia('(prefers-reduced-motion: reduce)').matches;
  const turn = d => {
    const next = Math.min(pages.length - 1, Math.max(0, page + d)); if (next === page || busy) return; writing = false;
    const before = calm() ? null : { shell: book.cloneNode(false), L: book.querySelector('.book-page.left')?.cloneNode(true), R: book.querySelector('.book-page.right')?.cloneNode(true) };
    const dir = next > page ? 1 : -1, far = Math.abs(next - page); page = next; draw();
    if (before?.L && before.R) flipLeaves(book, before, dir, far);
  };
  const run = async (kind, fn) => { if (busy) return; busy = kind; draw(); try { const id = await fn(); reload(id); } catch (e) { if (e?.name !== 'AbortError') toast(e.message || String(e), 'err'); } busy = ''; if (wrap.isConnected) draw(); };
  const write = () => run('diary', async () => (await writeDiary(chat, msgs)).id);
  const dream = () => run('dream', async () => (await Alm.dreamOf(chat, msgs)).id);
  const md = t => { const d = new Date(t); return `${d.getMonth() + 1}.${String(d.getDate()).padStart(2, '0')}`; };

  // ── 오른쪽 쪽: 종류마다
  const exchange = e => {   // 교환 일기: 내가 몇 줄 적으면 캐릭터가 여백에 답한다
    const box = h('div.bk-ex');
    if (writing) {
      const ta = h('textarea.bk-note-inp', { rows: 3, maxLength: 800, placeholder: `${ch.name}의 일기 옆에 몇 줄 적어 보세요.`, value: e.note || '' });
      box.append(h('div.bk-ex-head', h('span', '교환 일기'), h('small', `${user}의 자리`)), ta, h('div.bk-ex-acts', h('button.bk-btn', { onclick: () => { writing = false; draw(); } }, '그만두기'),
        h('button.bk-btn.ink', { onclick: async () => { const v = ta.value.trim(); if (v !== (e.note || '')) { if (v) { e.note = v; e.noteTs = now(); } else { delete e.note; delete e.noteTs; delete e.answer; delete e.answerTs; } await save(); } writing = false; draw(); } }, '적어 두기')));
      setTimeout(() => ta.focus(), 30);
      return box;
    }
    if (!e.note) return box.append(h('button.bk-ex-add', { onclick: () => { writing = true; draw(); } }, icon('feather', 15), h('span', '옆에 몇 줄 적기'), h('small', '교환 일기'))), box;
    box.append(h('div.bk-ex-head', h('span', '교환 일기'), h('small', e.noteTs ? md(e.noteTs) : '')),
      h('div.bk-note', paras(e.note), h('span.bk-by', `— ${user}`), h('button.bk-mini', { title: '고쳐 적기', onclick: () => { writing = true; draw(); } }, icon('edit', 13))),
      e.answer ? h('div.bk-ans', paras(e.answer), h('span.bk-by', `— ${S.get('chars', e.by)?.name || ch.name}`)) : null,
      h('div.bk-ex-acts', h('button.bk-btn.ink', { disabled: !!busy, onclick: () => run('answer', async () => { await Alm.answerNote(chat, e); return e.id; }) }, busy === 'answer' ? `${ch.name}이(가) 여백에 적는 중…` : e.answer ? '답글 다시 받기 · 호출 1회' : '답글 받기 · 호출 1회')));
    return box;
  };
  const rightOf = (p, when) => {
    const e = p.ref, sign = `— ${S.get('chars', e.by)?.name || ch.name}`, foot = (...mid) => h('div.book-foot', h('span.book-no', `${page + 1} / ${pages.length}`), mid, h('span.book-sign', sign));
    const head = small => h('div.book-head', h('span', when.toLocaleDateString('ko-KR', { month: 'long', day: 'numeric', weekday: 'short' })), small ? h('small', small) : null);
    if (p.type === 'diary') return [head(e.to > e.from ? `대화 ${e.from + 1}–${e.to}번째` : ''), h('div.bk-scroll', h('div.book-text', paras(e.text)), exchange(e)), foot()];
    if (p.type === 'dream') return [head(`${e.phaseName || moonPhase(when).name} 뜬 밤의 꿈`), h('div.bk-scroll', h('div.book-text', paras(e.text))), foot(h('span.bk-stamp', '꿈 · 정사가 아님'))];
    if (p.type === 'letter') return [head(`${e.days || 0}일의 이야기를 담아`), h('div.bk-scroll', h('div.book-text', paras(e.text), e.ps ? h('p.bk-ps', `추신. ${e.ps}`) : null)), foot()];
    // 기념품: 인화 사진 + 한 줄
    const scene = K.scenesOf(msgs).find(s => s.id === e.id), ids = [...new Set((scene?.photos || []).map(x => x.id).filter(id => id && Illust.data(id)))], src = Illust.data(e.photo);
    const swap = ids.length > 1 ? async () => { e.photo = ids[(ids.indexOf(e.photo) + 1) % ids.length]; e.picked = true; await save(); draw(); } : null;
    return [head(`장면 ${e.lines || 0}마디${e.photoCount ? ` · 사진 ${e.photoCount}장` : ''}`),
      h('div.bk-scroll.bk-keep', src ? Alm.polaroid(src, { cls: 'big', onclick: swap, title: swap ? '눌러서 다른 사진으로' : '' }) : h('div.bk-nophoto', moonIcon(54, when), h('small', '이 장면에는 남은 사진이 없어요.')),
        e.summary ? h('p.bk-sum', e.summary) : null, e.memo ? h('p.bk-memo', e.memo) : null,
        h('div.bk-ex-acts', h('button.bk-btn', { onclick: async () => { const v = await promptBox('기념품에 적어 둘 말', e.memo || '', { area: true, placeholder: '이 장면에 대해 남겨 두고 싶은 말' }); if (v === null) return; e.memo = v.trim().slice(0, 300); await save(); draw(); } }, e.memo ? '적어 둔 말 고치기' : '한마디 적어 두기'),
          msgs.some(m => m.id === e.id) ? h('button.bk-btn.ink', { onclick: () => { close(); Alm.jumpTo(chat.id, e.openId && msgs.some(m => m.id === e.openId) ? e.openId : e.id); } }, '이 장면으로 가기') : null)),
      h('div.book-foot', h('span.book-no', `${page + 1} / ${pages.length}`), h('span.bk-stamp', '추가 호출 없이 꽂아 둔 기념품'))];
  };
  const leftMid = (p, when) => {
    const e = p.ref;
    if (p.type === 'keepsake') return Alm.ticketEl(e);
    if (p.type === 'dream') return h('div.book-moon', moonIcon(96, when));
    if (p.type === 'letter') return h('div.bk-seal', Alm.moonDial({ target: e.days || 15, active: e.days || 15, fill: 1, full: true }, 'small'));
    return e.illust && Illust.data(e.illust) ? h('div.book-photo', h('img', { src: Illust.data(e.illust), alt: '' })) : (ch.avatar ? h('div.book-photo.small', h('img', { src: ch.avatar, alt: '' })) : h('div.book-moon', moonIcon(96, when)));
  };
  const chipsOf = p => {
    const e = p.ref;
    const list = p.type === 'diary' ? [e.storyDate && h('em', e.storyDate), e.weather && h('span', e.weather), e.mood && h('span', e.mood)] : p.type === 'dream' ? [e.phaseName && h('em', e.phaseName), h('span', '정사가 아님'), (e.memId || e.memIds?.length) ? h('span', '기억에 올림') : null]
      : p.type === 'keepsake' ? [e.place && h('em', e.place), e.time && h('span', e.time)] : [h('em', `${e.month.slice(0, 4)}년 ${+e.month.slice(5)}월`), h('span', '보름달')];
    return list.some(Boolean) ? h('div.book-chips', list) : null;
  };

  const draw = () => {
    const p = pages[page], e = p?.ref, when = p ? new Date(p.ts || now()) : new Date(), no = String(page + 1).padStart(2, '0');
    book.className = `book${p ? ' is-' + p.type : ''}`; Alm.applyFont(book, S.get('chars', e?.by) || ch, { ink: p?.type !== 'dream' });
    const left = h('div.book-page.left',
      h('div.book-top', h('span.book-tag', p ? `No. ${no} · ${TYPE[p.type][0]}` : 'DIARY'), h('span.book-phase', moonIcon(26, when), moonPhase(when).name)),
      h('div.book-day', h('b', String(when.getDate()).padStart(2, '0')), h('span', when.toLocaleDateString('ko-KR', { year: 'numeric', month: 'long' }), h('small', when.toLocaleDateString('ko-KR', { weekday: 'long' })))),
      p ? [h('h3.book-title', titleOf(p)), chipsOf(p)] : h('h3.book-title', `${ch.name}의 일기장`),
      h('div.book-mid', p ? leftMid(p, when) : (ch.avatar ? h('div.book-photo.small', h('img', { src: ch.avatar, alt: '' })) : h('div.book-moon', moonIcon(96, when)))),
      pages.length > 1 ? h('div.book-index', pages.map((x, i) => h(`button.book-idx${i === page ? '.on' : ''}`, { onclick: () => turn(i - page) }, h('i', String(i + 1).padStart(2, '0')), h('span', x.type !== 'diary' ? h('em.bk-kind', TYPE[x.type][1]) : null, titleOf(x)), h('small', md(x.ts))))) : null);
    const waiting = busy === 'diary' ? `${ch.name}이(가) 펜을 들었어요…` : busy === 'dream' ? `${ch.name}이(가) 잠들었어요…` : '';
    const right = h('div.book-page.right', p && !waiting ? rightOf(p, when)
      : h('div.book-empty', h('p', waiting || '아직 아무것도 적혀 있지 않아요.'), !busy ? btn('첫 일기 쓰기 · 호출 1회', { ic: 'feather', cls: 'primary', onclick: write }) : null));
    book.replaceChildren(h('i.book-ribbon'), left, h('i.book-spine'), right);
    book.querySelector('.book-idx.on')?.scrollIntoView({ block: 'nearest' });
    const range = p?.type === 'diary' && e.to > e.from ? msgs[e.from] : null;
    const more = ev => menu(ev.currentTarget, [
      p && p.type !== 'keepsake' && { label: '이 쪽 고치기', ic: 'edit', onclick: async () => { const v = await promptBox(`${TYPE[p.type][1]} 고치기`, e.text, { area: true }); if (v?.trim()) { e.text = v.trim(); await save(); draw(); } } },
      p && { label: p.type === 'keepsake' ? '이 기념품 빼기' : '이 쪽 찢기', ic: 'trash', danger: true, onclick: async () => {
        if (!(await confirmBox(`이 ${TYPE[p.type][1]}을(를) 지울까요?`, '지우기', true))) return;
        if (p.type === 'diary') chat.diary = chat.diary.filter(x => x !== e); else if (p.type === 'dream') chat.dreams = chat.dreams.filter(x => x !== e); else if (p.type === 'letter') chat.letters = chat.letters.filter(x => x !== e); else e.gone = true;   // 기념품은 다시 꽂히지 않게 표시만
        await save(); reload(); draw(); } },
      p && '-',
      range && { label: '이 일기의 대화로 가기', ic: 'chat', onclick: () => { close(); Alm.jumpTo(chat.id, range.id); } },
      { label: '달력에서 보기', ic: 'moon', onclick: () => { close(); go('diary', { tab: 'calendar', chatId: chat.id, day: p ? K.dayKey(p.ts) : undefined }); } },
      { label: `${ch.name}의 글씨체`, ic: 'feather', hint: Alm.fontOf(ch).ko, onclick: () => Alm.fontDialog(charOf(chat), { chat, onChange: draw }) },
      { label: '지시문 고치기', ic: 'sliders', onclick: () => Alm.editPrompts(['dream', 'exchange', 'letter'], '일기장 지시문', [DIARY_DEF, MEMO_DEF]) },
      '-',
      { label: '한 권으로 묶기', ic: 'book', hint: '인쇄용', onclick: () => Alm.bindDialog(chat) },
      (chat.diary || []).length ? { label: '일기 글만 내보내기', ic: 'import', hint: '.txt', onclick: () => download(`${ch.name}-diary.txt`, chat.diary.map(x => `${new Date(x.ts).toLocaleDateString('ko-KR')} ${x.storyDate ? `(${x.storyDate}) ` : ''}${x.title}\n\n${x.text}${x.note ? `\n\n[${user}] ${x.note}${x.answer ? `\n[${ch.name}] ${x.answer}` : ''}` : ''}`).join('\n\n— ✦ —\n\n'), 'text/plain') } : null]);
    const tool = (ic, label, cost, title, onclick, cls = '') => h(`button.bk-tool${cls}`, { type: 'button', title, disabled: !!busy, onclick }, icon(ic, 16), h('span', label), cost ? h('em', cost) : null);
    const memo = p && p.type !== 'keepsake' ? tool('up', (e.memIds?.length || e.memId) ? '기억됨' : '기억', '', (e.memIds?.length || e.memId) ? '기억에 올린 내용을 보거나 다시 올립니다' : '이 쪽을 간추려 장기기억에 올립니다', () => memoDialog(chat, p, { ch, user, onDone: draw }), (e.memIds?.length || e.memId) ? '.done' : '') : null;
    bar.replaceChildren(
      h('div.bk-nav', iconBtn('left', '앞 장 (←)', () => turn(-1)), h('span.bk-count', pages.length ? `${page + 1} / ${pages.length}` : '—'), iconBtn('right', '뒷 장 (→)', () => turn(1))),
      h('div.bk-tools',
        tool('feather', busy === 'diary' ? '쓰는 중' : '일기', '1회', '마지막 일기 이후의 이야기로 오늘의 일기를 씁니다 · 모델 호출 1회', write, '.ink'),
        tool('moon', busy === 'dream' ? '꿈꾸는 중' : '꿈', '1회', '가장 최근에 이야기한 날의 조각으로 꿈을 꿉니다. 오늘 밤 달의 위상에 따라 분위기가 달라져요 · 모델 호출 1회', dream),
        memo),
      h('div.bk-nav', iconBtn('more', '더 보기', more), iconBtn('x', '덮기 (Esc)', close)));
  };
  const wrap = h('div.book-wrap', { onmousedown: e => { if (e.target === wrap) close(); } }, book, bar);
  const offRoute = on('route', () => { if (wrap.isConnected) close(); }), offFont = on('almanac:font', () => { if (wrap.isConnected) draw(); });
  document.body.append(wrap); document.addEventListener('keydown', key); draw();
}
on('diary:open', a => a?.chat ? openDiary(a.chat, a) : a && openDiary(a));

// ── 일기장 화면: 달력 · 책장 · 약속 수첩 · 설정 ──
const pageCount = c => (c.diary || []).length + (c.dreams || []).length + (c.letters || []).length + (c.keepsakes || []).filter(k => !k.gone).length;
const lastTs = c => Alm.pagesOf(c).reduce((t, p) => Math.max(t, p.ts || 0), 0);
function renderShelf(host) {
  let q = '';
  const shelf = h('div.alm-shelf-host');
  const draw = () => {
    const t = q.trim().toLowerCase(), all = S.chats.filter(c => pageCount(c) && charOf(c)).sort((a, b) => lastTs(b) - lastTs(a));
    const books = all.filter(c => !t || `${charOf(c).name} ${c.name || ''}`.toLowerCase().includes(t));
    const recent = [...S.chats].sort((a, b) => b.updatedAt - a.updatedAt).filter(c => !pageCount(c) && charOf(c)).slice(0, 6);
    shelf.replaceChildren(
      books.length ? h('div.shelf', books.slice(0, 120).map(c => { const ch = charOf(c), n = pageCount(c), room = (c.name || '').trim(); return h('button.spine', { style: { '--hue': hue(ch.name) }, title: `${ch.name}${room ? ' · ' + room : ''} · ${n}쪽 (일기 ${(c.diary || []).length})`, onclick: () => openDiary(c) }, h('i'), h('b', ch.name), h('small', `${n}쪽`), moonIcon(18, new Date(lastTs(c) || now()))); }))
        : h('div.empty', moonIcon(46), h('p', all.length ? '찾는 일기장이 없어요.' : '아직 쓰인 일기가 없어요.')),
      books.length > 120 ? h('small.hint', `일기장이 많아요 (${books.length}권). 이름으로 찾아 좁혀 주세요.`) : null,
      h('div.col', h('h3.form-sec', '새 일기장 펼치기'), h('div.row.wrap', recent.map(c => { const ch = charOf(c); return h('button.chip', { onclick: () => openDiary(c) }, `${ch.name}${c.name ? ' · ' + c.name.slice(0, 14) : ''}`); }), h('button.chip', { onclick: () => Alm.pickChat({ title: '어느 대화의 일기장을 펼칠까요', onPick: c => openDiary(c) }) }, '다른 대화 고르기…'))));
  };
  host.replaceChildren(h('p.hint', '캐릭터가 자기 목소리로 그날의 이야기를 적어 두는 일기장입니다. 꿈 · 장면 기념품 · 이달의 편지도 같은 책에 꽂혀요. 대화 화면 위쪽의 책 아이콘으로도 펼칠 수 있어요.'),
    S.chats.filter(pageCount).length > 10 ? h('input.inp.search', { placeholder: '캐릭터나 방 이름으로 일기장 찾기', oninput: e => { q = e.target.value; draw(); } }) : null, shelf);
  draw();
}
const TABS = [['calendar', '달력'], ['shelf', '책장'], ['promises', '약속 수첩'], ['settings', '설정']];
registerPage('diary', (root, arg) => {
  const a = arg && typeof arg === 'object' ? arg : {};
  let tab = TABS.some(t => t[0] === a.tab) ? a.tab : TABS.some(t => t[0] === S.settings.almanac?.tab) ? S.settings.almanac.tab : 'calendar';
  const host = h('div.alm-host'), bar = h('div.tabs.alm-tabs');
  const show = (t, pass = {}) => {
    tab = t; (S.settings.almanac ||= {}).tab = t; S.saveSettings();
    bar.replaceChildren(...TABS.map(([k, l]) => h(`button.tab${k === tab ? '.on' : ''}`, { onclick: () => show(k) }, l)));
    host.className = `alm-host tab-${t}`; host._alm = null; host.replaceChildren();
    if (t === 'calendar') Alm.renderCalendar(host, pass).catch(e => { console.error(e); if (tab === 'calendar') host.replaceChildren(h('div.empty', h('p', '달력을 펼치지 못했어요: ' + e.message))); });
    else if (t === 'promises') Alm.renderPromises(host, pass);
    else if (t === 'settings') Alm.renderSettings(host, [DIARY_DEF]);
    else renderShelf(host);
  };
  root.append(h('section.pagebox.alm-page', pageHead('diary', '꿈 일기장'), bar, host));
  show(tab, a);
});
