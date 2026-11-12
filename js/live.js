// ── Dreamland live: 대화 모드의 살아 있는 부분 ──
// 장면 전환 · 약속한 연락 · 선톡 동기 · 캐릭터/사용자 상태 · 상태창(스냅샷 · 잠금 · 인물 카드) · 설정 창
import { S, h, now, uid, on, debounce } from './core.js';
import { X } from './hooks.js';
import { Clock } from './clock.js';
import { form, modal, btn, iconBtn, icon, avatar, menu, promptBox, toast, confirmBox } from './ui.js';
import { Schedule, scheduleOf, rawSchedule, hasBlocks, blockAt, todayLine, STATUS, STATUS_EN, DAY_EN, dayIndex, fmtMin, MOTIVES, MOTIVE_ORDER, motiveLabel, SCHEDULE_PROMPT } from './f-schedule.js';

// ── pure:start ──
const args = s => { const o = {}; String(s || '').replace(/(\w+)\s*=\s*"([^"]*)"/g, (_, k, v) => { o[k] = v; }); return o; };
/** "2h", "30m", "1d", "90" (분) → 밀리초 */
export const parseDur = s => { const m = String(s || '').match(/([\d.]+)\s*(d|h|m|일|시간|분)?/i); if (!m) return 0; const u = (m[2] || 'm').toLowerCase(); return +m[1] * (u === 'd' || u === '일' ? 86400000 : u === 'h' || u === '시간' ? 3600000 : 60000); };
/** 항목 목록: "이름 (0-100): 설명" 형식이면 범위가 있는 항목 */
export const parseFields = text => String(text || '').split('\n').map(l => l.trim()).filter(Boolean).map(l => {
  const i = l.search(/[:：]/), head = (i < 0 ? l : l.slice(0, i)).trim(), desc = i < 0 ? '' : l.slice(i + 1).trim();
  const r = head.match(/^(.*?)\s*\(\s*(-?\d+)\s*[-~]\s*(-?\d+)\s*\)$/);
  return r ? { key: r[1].trim(), desc, min: +r[2], max: +r[3] } : { key: head, desc };
}).filter(f => f.key);
const same = (a, b) => String(a).normalize('NFKC').trim().toLowerCase().replace(/\s+/g, ' ') === String(b).normalize('NFKC').trim().toLowerCase().replace(/\s+/g, ' ');
const pick = (list, k) => (list || []).find(x => same(x, k));
const GONE = /^(gone|left|exit|퇴장|나감|떠남)$/i;
/**
 * <state> 안의 글을 읽는다. "항목: 값" 은 장면, "이름 / 항목: 값" 은 인물 카드.
 * castKeys 가 null 이면 인물 카드를 쓰지 않는 것이라 빗금이 든 줄도 장면 항목으로 본다.
 */
export function parseState(body, { castKeys = null } = {}) {
  const out = { w: {}, c: {}, gone: [] };
  for (const raw of String(body || '').split('\n')) {
    const l = raw.replace(/^[\s\-*•·]+/, '').trim(), i = l.search(/[:：]/); if (i <= 0) continue;
    const head = l.slice(0, i).trim(), val = l.slice(i + 1).trim().replace(/^["“'](.*)["”']$/, '$1').trim(); if (!val) continue;
    const cut = head.lastIndexOf('/');
    if (castKeys && cut > 0) {
      const name = head.slice(0, cut).replace(/^[@\[\s]+|[\]\s]+$/g, '').trim(), field = head.slice(cut + 1).trim();
      if (name && GONE.test(field)) { if (!/^(no|false|아니|x)$/i.test(val)) out.gone.push(name); continue; }
      const fk = pick(castKeys, field); if (name && fk) { (out.c[name] ||= {})[fk] = val; continue; }
    }
    out.w[head] = val;
  }
  return out;
}
export const copyState = s => ({ w: { ...(s?.w || {}) }, c: Object.fromEntries(Object.entries(s?.c || {}).map(([n, f]) => [n, { ...f }])) });
const numOf = (val, r) => { const m = String(val).match(/-?\d+(?:\.\d+)?/); if (!m) return null; return String(Math.max(r.min, Math.min(r.max, +m[0]))); };
/**
 * 바뀐 것만 든 patch 를 지금 상태에 합친다 (증분). 빠진 항목은 그대로 둔다.
 * opt: keys(장면 항목 이름들), castKeys, ranges({항목: {min,max}}, 인물 항목은 '@항목'), locks({'w:항목'|'c:이름:항목': true}),
 *      allow(항상 받아들이는 인물 이름), others(그 밖의 인물도 받기), maxCast
 * → { w, c, diff: { w: {항목: {from, d}}, c: {'이름:항목': {from}} }, changed }
 */
export function mergeState(cur, patch, { keys, castKeys, ranges = {}, locks = {}, allow, others = true, maxCast = 6 } = {}) {
  const { w, c } = copyState(cur), diff = { w: {}, c: {} };
  for (const [k0, v] of Object.entries(patch?.w || {})) {
    const k = keys ? pick(keys, k0) : k0; if (!k || locks['w:' + k]) continue;
    let val = String(v ?? '').trim(); if (!val) continue;
    if (ranges[k]) { val = numOf(val, ranges[k]); if (val == null) continue; }
    if (val === w[k]) continue;
    const a = parseFloat(w[k]), b = parseFloat(val);
    diff.w[k] = { from: w[k] ?? '', d: isFinite(a) && isFinite(b) ? b - a : null }; w[k] = val;
  }
  for (const [n0, fields] of Object.entries(patch?.c || {})) {
    const name = pick(Object.keys(c), n0) || pick(allow, n0) || (others && Object.keys(c).length < maxCast ? String(n0).trim() : ''); if (!name) continue;
    for (const [f0, v] of Object.entries(fields || {})) {
      const f = castKeys ? pick(castKeys, f0) : f0; if (!f || locks[`c:${name}:${f}`]) continue;
      let val = String(v ?? '').trim(); if (!val) continue;
      if (ranges['@' + f]) { val = numOf(val, ranges['@' + f]); if (val == null) continue; }
      if (val === c[name]?.[f]) continue;
      diff.c[`${name}:${f}`] = { from: c[name]?.[f] ?? '' }; (c[name] ||= {})[f] = val;
    }
  }
  for (const n0 of patch?.gone || []) { const name = pick(Object.keys(c), n0); if (!name || pick(allow, name) || Object.keys(locks).some(k => k.startsWith(`c:${name}:`) && locks[k])) continue; diff.c[`${name}:`] = { from: 'gone' }; delete c[name]; }
  const changed = Object.keys(diff.w).length + Object.keys(diff.c).length > 0;
  if (changed && keys) for (const k of Object.keys(w)) if (!keys.includes(k)) delete w[k];
  return { w, c, diff, changed };
}
/** 이 메시지(지금 고른 스와이프)에 찍힌 상태 */
export const snapOf = m => m?.swipes?.[m.sw]?.state || null;
/** upto 번째 메시지 앞까지에서 가장 최근에 찍힌 상태 */
export function stateAt(msgs, upto = msgs.length) { for (let i = Math.min(upto, msgs.length) - 1; i >= 0; i--) { const s = snapOf(msgs[i]); if (s) return { i, state: copyState(s) }; } return null; }
/** 상태가 찍힌 메시지들의 자리 */
export const timeline = msgs => (msgs || []).map((m, i) => snapOf(m) ? i : -1).filter(i => i >= 0);
/** 되감기: target 으로 돌아가되 잠근 항목은 지금 값을 지킨다 */
export function rewound(cur, target, locks = {}) {
  const next = copyState(target);
  for (const [k, onn] of Object.entries(locks)) { if (!onn) continue;
    if (k.startsWith('w:')) { const key = k.slice(2); if (cur?.w && key in cur.w) next.w[key] = cur.w[key]; }
    else if (k.startsWith('c:')) { const [, name, f] = k.match(/^c:(.*):([^:]*)$/) || []; if (name && cur?.c?.[name] && f in cur.c[name]) (next.c[name] ||= {})[f] = cur.c[name][f]; } }
  return next;
}
const hm = t => { const m = String(t || '').match(/^(\d{1,2}):?(\d{2})?$/); return m ? +m[1] * 60 + +(m[2] || 0) : null; };
/** 조용한 시간대("01:00"~"08:00", 자정을 넘겨도 됨)가 끝날 때까지 남은 분. 그 시간대가 아니면 0 */
export function quietLeft(from, to, d = new Date()) {
  const a = hm(from), b = hm(to); if (a == null || b == null || a === b) return 0;
  const n = d.getHours() * 60 + d.getMinutes(), inside = a < b ? n >= a && n < b : n >= a || n < b;
  return inside ? ((b - n + 1440) % 1440 || 1440) : 0;
}
// ── pure:end ──

// ════════ 지시문 (모두 설정 창에서 고칠 수 있고, 비우면 여기 기본값을 쓴다) ════════
export const SCENE_OFFER = `[scene: title="short title", place="where", time="when"] — use this ONLY at the moment you and {{user}} actually meet face to face, or something starts happening that cannot be texted (arriving at the door, a call turning into a visit, an accident). From then on the story is told as a written scene instead of messages. Never use it for ordinary chatting.`;
export const SCENE_RULES = `<scene>
The messenger chat has moved into a live scene: "{{title}}"{{place}}. You and {{user}} are now in the same place, so this is no longer texting and the one-line message format is set aside until the scene ends.
- Write roleplay prose in the same language as the chat: narration, {{char}}'s actions, and {{char}}'s spoken lines in "double quotes". Never write {{user}}'s actions, lines or thoughts; stop where {{user}} would respond.
- Keep continuity with the messages above: what was said and promised, the mood you were both in, the time of day.
- Each reply moves the scene one step — something is done, said or noticed. A few short paragraphs, not a chapter.
- When the scene has naturally ended (you part ways, someone leaves or falls asleep), finish your reply and add one last line: [scene_end: summary="one sentence about what happened"]. After that you two go back to texting. Do not end it early.
</scene>`;
export const LATER_OFFER = `[later: in="2h", about="what you will text about"] — when you promise to get back to {{user}} later ("I'll text you after class", "tell you tomorrow"), add this so that you really do. in= accepts m, h or d.`;
export const STATE_RULES = `<state_rules>
A status window follows this story. When something in it changed during your reply, end the reply with a hidden state block. {{user}} never sees it.
<state>
key: new value
</state>
- Write ONLY the lines whose value actually changed in this reply; leave out everything that stayed the same. If nothing changed, write no state block at all.
- A key that is still "(not set yet)" counts as changed: fill it in.
- One line per key, "key: value", short, in the language of the story. Keys with a range take a number only.
- Lines marked (locked) were fixed by {{user}}. Never write them.
Keys:
{{lines}}
Current values:
{{current}}
{{cast}}
</state_rules>`;
export const CAST_INLINE = `People cards — one small card per person in the scene, with these fields:
{{fields}}
A card line goes inside the same state block as "Name / field: value" (for example "{{char}} / {{first}}: …"). The same rules apply: only lines that changed, only people who are actually present. A field about inner thoughts holds what that person is privately thinking right now, one short sentence in their own voice; nobody else in the scene knows it. When someone has left for good, write "Name / gone: yes".
Current cards:
{{cards}}`;
export const TRACK_CALL = `You keep the status window of an ongoing story up to date. Read the previous state and the latest messages, then report only what changed.
Reply with ONLY one JSON object. Include a key only when its value changed or is still empty; leave out everything that stayed the same; reply {} when nothing changed. Values are short strings in the story's language; keys with a range take digits only. Never include a key marked (locked).
Scene keys:
{{fields}}
{{cast}}`;
export const CAST_CALL = `People cards: add a "cast" key shaped like {"Name": {"field": "value"}}, holding only the changed fields of people who are actually present in the scene. A field about inner thoughts holds what that person is privately thinking right now, one short sentence in their own voice. People who left for good go in "gone": ["Name"].
Card fields:
{{fields}}
People already on the cards: {{names}}`;
export const P_LATER = `Earlier you told {{user}} you would get back to them about: "{{about}}". Now is that time — text them about it first, naturally.`;
export const P_AWAY = `{{user}} has not opened the chat for about {{hours}} hours. This message is one you sent during that time, on your own, about something from your day or something you kept thinking about. Do not ask why they were gone.`;
export const P_UNREAD = `{{user}} has not opened your last message yet — it still shows as unread, so they have not seen it and are not ignoring you. React the way {{char}} would: shrug it off, add what you forgot to say, or nudge once. Do not send the same message again.`;
export const P_GHOSTED = `{{user}} read your last message a while ago and still has not answered. React to being left on read the way {{char}} would — once, in character. Do not repeat the earlier message and do not answer it for them.`;
export const P_MOTIVE = {
  morning: `Why you are texting now: you have just woken up and your day is starting. This is your first message to {{user}} today — let it sound like the morning you are actually having.`,
  night: `Why you are texting now: your day is ending and you will be asleep soon. You want to say something to {{user}} before you put the phone down.`,
  meal: `Why you are texting now: you are eating or taking a short break ({{activity}}) and have a quiet moment with your phone.`,
  afterBusy: `Why you are texting now: you have just finished {{before}} and can finally breathe. {{user}} is the first person you thought of.`,
  back: `Why you are texting now: {{user}} wrote to you while you could not answer ({{before}}). You are free again and getting back to them — answer what they actually said, in your own time and tone.`,
  longAbsence: `Why you are texting now: you and {{user}} have not talked for about {{hours}} hours. You reach out lightly, the way {{char}} would after a gap — no guilt-tripping.`,
  transition: `Why you are texting now: you just went from {{before}} to {{activity}}, and something in that small in-between moment made you think of {{user}}.`,
  checkin: `Why you are texting now: no special reason — {{user}} simply crossed your mind. Share a small thing from your moment or pick up something you two left unfinished.`,
};
export const P_CHIME = `{{from}} just said that in the group chat. You jump in, the way {{char}} would — answer or tease {{from}}, not only {{user}}. One or two short lines, and do not repeat what was already said.`;
export const SCHED_CTX = `<today>
Your schedule today ({{day}}): {{schedule}}
Right now: {{now}}
Your status and schedule shape how you text. While you are busy, your replies are short and may trail off; you would not chat at length in the middle of it. Bring up what you are doing only when it comes up naturally, and never recite the schedule.
</today>`;
export const USER_STATUS = `{{user}}'s status: {{status}}.`;
const USER_ST = { online: '온라인', idle: '자리 비움', dnd: '방해 금지', hidden: '숨김' };
const USER_ST_EN = { online: 'online', idle: 'idle / away from their phone', dnd: 'do not disturb — they asked not to be bothered right now', hidden: 'appears offline (you cannot tell whether they are around)' };

/** 고칠 수 있는 프롬프트: [설정 키, 이름, 기본값, 설명] */
export const PROMPTS = {
  tracker: [['tracker.inlinePrompt', '답변에 함께 적게 할 때의 규칙', STATE_RULES, '{{lines}} 는 항목 목록, {{current}} 는 지금 값, {{cast}} 는 인물 카드 안내가 들어갈 자리입니다. <state> … </state> 형식은 바꾸지 마세요.'], ['tracker.castInline', '인물 카드 안내 (답변에 함께 적기)', CAST_INLINE, '{{fields}} · {{cards}} · {{first}} 가 채워집니다. "이름 / 항목: 값" 형식은 바꾸지 마세요.'],
    ['tracker.callPrompt', '상태를 따로 물을 때의 지시문', TRACK_CALL, '{{fields}} 자리에 항목 목록, {{cast}} 자리에 인물 카드 안내가 들어갑니다.'], ['tracker.castCall', '인물 카드 안내 (따로 묻기)', CAST_CALL, '{{fields}} · {{names}} 가 채워집니다.']],
  scene: [['modes.sceneOffer', '장면을 열 수 있다는 안내 (대화 모드)', SCENE_OFFER, '[scene: …] 형식은 바꾸지 마세요.'], ['modes.sceneRules', '장면 안에서의 규칙', SCENE_RULES, '{{title}} · {{place}} 가 들어갑니다. [scene_end: …] 형식은 바꾸지 마세요.']],
  auto: [['modes.laterOffer', '나중에 연락하겠다는 약속 안내', LATER_OFFER, '[later: …] 형식은 바꾸지 마세요.'], ['modes.pLater', '약속한 시간이 되었을 때', P_LATER, '{{about}} 에 약속 내용이 들어갑니다.'], ['modes.pAway', '오래 자리를 비운 사이의 연락', P_AWAY, '{{hours}} 에 비운 시간이 들어갑니다.'], ['modes.pUnread', '내가 아직 읽지 않았을 때', P_UNREAD, ''], ['modes.pGhosted', '읽고도 답이 없을 때', P_GHOSTED, ''],
    ...Object.entries(P_MOTIVE).map(([k, v]) => [`modes.pm.${k}`, `말 거는 이유 — ${motiveLabel(k)}`, v, '{{activity}} 는 지금 하는 일, {{before}} 는 방금까지 하던 일, {{hours}} 는 연락이 없던 시간입니다.'])],
  sched: [['modes.pToday', '오늘 일정 안내', SCHED_CTX, '{{day}} · {{schedule}} · {{now}} 가 채워집니다. 일정이 있는 캐릭터에게만 들어갑니다.'], ['modes.pUserStatus', '내 상태를 알리는 한 줄', USER_STATUS, '{{status}} 에 내 상태가 들어갑니다.'], ['modes.schedPrompt', '일정을 짤 때의 지시문', SCHEDULE_PROMPT, '{{char}} · {{description}} · {{guide}} · {{scope}} · {{shape}} 가 채워집니다. JSON 형식은 바꾸지 마세요.']],
  group: [['modes.pChime', '그룹에서 끼어들 때', P_CHIME, '{{from}} 에 방금 말한 캐릭터의 이름이 들어갑니다.']],
};
const get = (path, dflt) => { const v = path.split('.').reduce((o, k) => o?.[k], S.settings); return String(v || '').trim() ? v : dflt; };

// ════════ 설정 기본값 (core.js 를 고치지 않고 읽는 쪽에서 채운다) ════════
export const MODE_DEFAULTS = { userStatus: 'online', userActivity: '', userIdleMin: 10, delayOnline: '0', delayIdle: '4-10', delayDnd: '9-18', delayNamed: 30, offlineWake: true, chime: false, chimeChance: 35, chimeMax: 2, chimeDaily: 20, sched: true, motives: true, longHours: 18, showWhy: true };
export const TRACK_DEFAULTS = { cast: false, castFields: '기분: 지금 감정 한 줄\n옷차림: 지금 입고 있는 옷\n속마음: 입 밖에 내지 않은 생각 한 줄', castOthers: true, castMax: 6 };
/** 대화 모드 설정 값 (없으면 기본값) */
export const mo = k => S.settings.modes?.[k] ?? MODE_DEFAULTS[k];
export const tk = k => S.settings.tracker?.[k] ?? TRACK_DEFAULTS[k];
/** 선톡 종류별 쿨다운(시간) */
export const cdHours = () => Object.fromEntries(Object.entries(MOTIVES).map(([k, v]) => [k, +(S.settings.modes?.cd?.[k] ?? v[1])]));
function ensureDefaults() {
  const M = S.settings.modes ||= {}, T = S.settings.tracker ||= {};
  for (const [k, v] of Object.entries(MODE_DEFAULTS)) M[k] ??= v;
  for (const [k, v] of Object.entries(TRACK_DEFAULTS)) T[k] ??= v;
  M.cd ||= {}; for (const k of MOTIVE_ORDER) M.cd[k] ??= MOTIVES[k][1];
  M.pm ||= {};
}
/** 지금 시각이 "연락하지 않는 시간대" 안인가 */
export const inQuietHours = (d = new Date()) => quietLeft(S.settings.modes?.quietFrom, S.settings.modes?.quietTo, d) > 0;
const clock = t => { const d = new Date(t), n = new Date(), days = Math.round((new Date(d.getFullYear(), d.getMonth(), d.getDate()) - new Date(n.getFullYear(), n.getMonth(), n.getDate())) / 86400000); return `${days === 0 ? '오늘' : days === 1 ? '내일' : days === -1 ? '어제' : `${d.getMonth() + 1}/${d.getDate()}`} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; };
const span = ms => { const m = Math.max(1, Math.round(ms / 60000)); return m < 60 ? `${m}분` : m < 1440 ? `${Math.floor(m / 60)}시간${m % 60 ? ` ${m % 60}분` : ''}` : `${Math.floor(m / 1440)}일${Math.floor(m % 1440 / 60) ? ` ${Math.floor(m % 1440 / 60)}시간` : ''}`; };
const THINK = /속마음|생각|독백|thought|mind/i;

let lastInput = Date.now(), lastUser = '';
export const Live = {
  trackPrompt: () => get('tracker.callPrompt', TRACK_CALL),
  /** 이 생성에만 덧붙일 사정 (약속한 연락, 선톡 동기, 끼어들기) */
  pending: null,
  /** chat.js 가 채워 주는 연결 고리 */
  onChange: null, onUser: null, planOf: null, poke: null, view: null, unseen: 0,
  clock, span,

  // ──── 상태: 캐릭터 ────
  /** 지금 이 캐릭터의 상태. 임시로 바꾼 상태([status: …] · 직접 고름)가 살아 있으면 그것, 아니면 일정, 아니면 온라인 */
  presence(chat, ch) {
    const o = chat?.presenceBy?.[ch?.id] || chat?.presence, sched = scheduleOf(ch), B = sched ? blockAt(sched) : null;
    const alive = o && STATUS[o.status] && !(o.until && o.until < now()) && (o.until || o.hold || !sched) && !(o.status === 'online' && !o.activity && !o.until && !o.hold);
    if (alive) return { status: o.status, activity: o.activity || '', until: o.until || 0, from: 'override', block: B?.cur || null };
    if (B?.cur) return { status: B.cur.status, activity: B.cur.activity || '', until: now() + B.left * 60000, from: 'schedule', block: B.cur };
    return { status: 'online', activity: '', until: 0, from: '', block: null };
  },
  /** 상태를 임시로 바꾼다. 기간이 없으면 일정의 지금 칸이 끝날 때까지 (일정이 없으면 계속) */
  setPresence(chat, ch, { status, activity = '', durMs = 0, hold = false }) {
    const sched = scheduleOf(ch), B = sched ? blockAt(sched) : null;
    const p = { status: STATUS[status] ? status : 'online', activity: String(activity || '').slice(0, 80), until: durMs > 0 ? now() + durMs : hold ? 0 : B?.cur ? now() + Math.max(1, B.left) * 60000 : 0, ...(hold ? { hold: true } : {}) };
    if ((chat.charIds || []).length > 1 && ch?.id) (chat.presenceBy ||= {})[ch.id] = p; else chat.presence = p;
    return p;
  },
  clearPresence(chat, ch) { if (chat.presenceBy && ch?.id) delete chat.presenceBy[ch.id]; if ((chat.charIds || []).length <= 1 || !ch) chat.presence = { status: 'online', activity: '', until: 0 }; },
  // ──── 상태: 사용자 ────
  /** 내 상태. 온라인으로 두었어도 한동안 입력이 없으면 자리 비움으로 본다 */
  userStatus() {
    const manual = USER_ST[mo('userStatus')] ? mo('userStatus') : 'online', idle = +mo('userIdleMin') || 0;
    if (manual === 'online' && idle > 0 && Date.now() - lastInput > idle * 60000) return { status: 'idle', auto: true, label: USER_ST.idle };
    return { status: manual, auto: false, label: USER_ST[manual] };
  },
  setUserStatus(status) { (S.settings.modes ||= {}).userStatus = USER_ST[status] ? status : 'online'; lastInput = Date.now(); S.set({}); watchUser(); },
  userStatuses: USER_ST,
  /** 무엇이든 입력이 있었다 */
  touch() { lastInput = Date.now(); if (lastUser === 'idle') watchUser(); },

  // ──── 상태창: 항목 ────
  /** 장면 항목: "이름 (0-100): 설명" 형식이면 막대로 보여 준다 */
  fields(ctxMacro = t => t) { return parseFields(ctxMacro(S.settings.tracker?.fields || '')); },
  /** 인물 카드 항목 (꺼져 있으면 빈 목록) */
  castFields(ctxMacro = t => t) { return tk('cast') ? parseFields(ctxMacro(tk('castFields'))) : []; },
  state: chat => ({ w: chat.tracker || {}, c: chat.cast || {} }),
  /** 모델 답변에서 드림랜드 태그를 걷어 내고 따로 돌려준다 */
  extract(text) {
    const out = { text: String(text || ''), scene: null, sceneEnd: null, later: [], stats: null, patch: null };
    const castKeys = tk('cast') ? this.castFields().map(f => f.key) : null;
    out.text = out.text.replace(/<state>([\s\S]*?)(?:<\/state>|$)/gi, (_, body) => { const p = parseState(body, { castKeys }); if (Object.keys(p.w).length || Object.keys(p.c).length || p.gone.length) { out.patch = out.patch ? { w: { ...out.patch.w, ...p.w }, c: { ...out.patch.c, ...p.c }, gone: [...out.patch.gone, ...p.gone] } : p; out.stats = out.patch.w; } return ''; });
    out.text = out.text.replace(/^[ \t]*\[(scene_end|scene|later)\s*:?\s*([^\]\n]*)\][ \t]*$/gim, (_, name, a) => { const o = args(a), n = name.toLowerCase(); if (n === 'scene') out.scene = o; else if (n === 'scene_end') out.sceneEnd = o; else if (parseDur(o.in)) out.later.push(o); return ''; })
      .replace(/\[(scene_end|scene|later)\s*:[^\]\n]*\]/gi, '').replace(/\n{3,}/g, '\n\n').trim();
    return out;
  },
  /** 바뀐 것만 든 patch({w, c, gone})를 반영하고, 무엇이 얼마나 바뀌었는지 기록한다 */
  apply(chat, patch, { names, mx } = {}) {
    if (!patch) return false;
    const f = this.fields(mx), cf = this.castFields(mx), ranges = {};
    for (const x of f) if (x.max != null) ranges[x.key] = x; for (const x of cf) if (x.max != null) ranges['@' + x.key] = x;
    const r = mergeState(this.state(chat), tk('cast') ? patch : { w: patch.w }, { keys: f.length ? f.map(x => x.key) : undefined, castKeys: cf.map(x => x.key), ranges, locks: chat.trackLock || {}, allow: names, others: tk('castOthers') !== false, maxCast: +tk('castMax') || 6 });
    if (!r.changed) return false;
    const at = now();
    chat.trackDiff = Object.fromEntries(Object.entries(r.diff.w).map(([k, d]) => [k, { ...d, at }]));
    chat.castDiff = Object.fromEntries(Object.entries(r.diff.c).map(([k, d]) => [k, { ...d, at }]));
    chat.tracker = r.w; chat.cast = r.c; (chat.trackLog ||= []).push({ t: at, v: r.w }); if (chat.trackLog.length > 40) chat.trackLog.shift();
    this.view = null;
    return true;
  },
  /** 예전 이름 (장면 항목만) */
  applyStats(chat, stats) { return this.apply(chat, stats ? { w: stats } : null); },

  // ──── 상태창: 스냅샷 ────
  /** 되감기의 바닥: 첫 스냅샷을 찍기 전의 상태를 기억해 둔다 */
  arm(chat) { if (!chat.snaps) { chat.snap0 = copyState(this.state(chat)); chat.snaps = 1; } },
  /** 지금 상태를 이 메시지(지금 스와이프)에 찍는다 */
  stamp(chat, m) { const sw = m?.swipes?.[m.sw]; if (!sw || m.role !== 'assistant') return false; this.arm(chat); sw.state = copyState(this.state(chat)); return true; },
  /** upto 번째 메시지 앞까지에서 가장 최근 상태로 되감는다. 바뀌었으면 true */
  rewind(chat, msgs, upto = msgs.length) {
    if (!chat?.snaps || !S.settings.tracker?.enabled) return false;
    const hit = stateAt(msgs, upto), cur = this.state(chat), next = rewound(cur, hit ? hit.state : copyState(chat.snap0), chat.trackLock || {});
    if (JSON.stringify(next) === JSON.stringify(copyState(cur))) return false;
    chat.tracker = next.w; chat.cast = next.c; chat.trackDiff = {}; chat.castDiff = {}; this.view = null;
    return true;
  },
  /** 손으로 고친 값: 'w:항목' 또는 'c:이름:항목' */
  setValue(chat, key, value) {
    const v = String(value ?? '').trim();
    if (key.startsWith('w:')) { (chat.tracker ||= {})[key.slice(2)] = v; }
    else { const [, name, f] = key.match(/^c:(.*):([^:]*)$/) || []; if (!name) return; ((chat.cast ||= {})[name] ||= {})[f] = v; }
  },
  toggle(chat, bag, key) { const o = chat[bag] ||= {}; if (o[key]) delete o[key]; else o[key] = true; return !!o[key]; },

  /** 대화 위에 떠 있는 상태창. opt: { msgs, chars, redraw(), saved(), onJump(msgId), onFold() } */
  hud(chat, opt = {}) {
    const st = S.settings.tracker || {}; if (!st.enabled || st.hud === false) return null;
    const msgs = opt.msgs || [], fields = this.fields(), cf = this.castFields(), lock = chat.trackLock || {}, hide = chat.trackHide || {};
    const tl = timeline(msgs), vi = this.view?.chat === chat.id && tl.includes(this.view.i) ? this.view.i : -1, past = vi >= 0;
    const state = past ? copyState(snapOf(msgs[vi])) : this.state(chat), before = past ? (stateAt(msgs, vi)?.state || copyState(chat.snap0)) : null;
    const keys = (fields.length ? fields.map(f => f.key) : Object.keys(state.w)).filter(k => !hide['w:' + k]);
    const people = cf.length ? [...new Set([...(opt.chars || []).map(c => c.name), ...Object.keys(state.c)])] : [];
    if (!keys.length && !people.length) return null;
    const diff = chat.trackDiff || {}, cdiff = chat.castDiff || {};
    const fresh = k => past ? (before.w[k] ?? '') !== (state.w[k] ?? '') : !!diff[k] && now() - diff[k].at < 90000;
    const freshC = (n, f) => past ? (before.c[n]?.[f] ?? '') !== (state.c[n]?.[f] ?? '') : !!cdiff[`${n}:${f}`] && now() - cdiff[`${n}:${f}`].at < 90000;
    const done = (stampIt = true) => { if (stampIt) { const last = [...msgs].reverse().find(m => m.role === 'assistant'); if (last) this.stamp(chat, last); } opt.saved?.(); opt.redraw?.(); };
    const cellMenu = (anchor, key, label, value) => past ? null : menu(anchor, [
      { label: '고치기', ic: 'edit', onclick: async () => { const v = await promptBox(label, value || ''); if (v === null) return; this.setValue(chat, key, v); done(); } },
      { label: lock[key] ? '잠금 풀기' : '잠그기', ic: 'lock', hint: lock[key] ? '' : '모델이 못 바꿔요', onclick: () => { this.toggle(chat, 'trackLock', key); done(false); } },
      { label: '숨기기', ic: 'eyeoff', hint: '띠에서만', onclick: () => { this.toggle(chat, 'trackHide', key); done(false); } }]);
    const cell = k => {
      const f = fields.find(x => x.key === k) || { key: k }, v = state.w[k] ?? '', d = diff[k], meter = f.max != null && isFinite(parseFloat(v)), fr = fresh(k);
      const dv = past ? parseFloat(v) - parseFloat(before.w[k]) : d?.d;
      const delta = fr && dv && isFinite(dv) ? h(`i.hud-d.${dv > 0 ? 'up' : 'down'}`, `${dv > 0 ? '▲' : '▼'}${Math.abs(Math.round(dv * 10) / 10)}`) : null;
      return h(`button.hud-cell${meter ? '.meter' : ''}${fr ? '.fresh' : ''}${lock['w:' + k] ? '.locked' : ''}`, { type: 'button', title: [f.desc, fr && (past ? before.w[k] : d?.from) ? `이전: ${past ? before.w[k] : d.from}` : '', lock['w:' + k] ? '잠겨 있어요' : ''].filter(Boolean).join(' · '), onclick: e => cellMenu(e.currentTarget, 'w:' + k, k, v) },
        h('span.hud-k', k, lock['w:' + k] ? icon('lock', 10) : null), meter ? h('span.hud-bar', h('i', { style: { width: Math.max(0, Math.min(100, (parseFloat(v) - f.min) / ((f.max - f.min) || 1) * 100)) + '%' } })) : null,
        h('b.hud-v', v === '' ? '—' : meter ? String(parseFloat(v)) : v), delta);
    };
    // 인물 카드
    const card = name => {
      const ch = (opt.chars || []).find(c => c.name === name), data = state.c[name] || {}, rows = cf.filter(f => !hide[`c:${name}:${f.key}`]);
      const row = f => {
        const key = `c:${name}:${f.key}`, v = data[f.key] ?? '', meter = f.max != null && isFinite(parseFloat(v)), fr = freshC(name, f.key);
        const base = { type: 'button', title: [f.desc, lock[key] ? '잠겨 있어요' : ''].filter(Boolean).join(' · '), onclick: e => cellMenu(e.currentTarget, key, `${name} · ${f.key}`, v) };
        if (THINK.test(f.key)) return h(`button.pcard-think${fr ? '.fresh' : ''}${v ? '' : '.blank'}`, base, h('span.pcard-k', f.key, lock[key] ? icon('lock', 10) : null), h('p', v || '아직 알 수 없어요'));
        return h(`button.pcard-row${fr ? '.fresh' : ''}`, base, h('span.pcard-k', f.key, lock[key] ? icon('lock', 10) : null), meter ? h('span.hud-bar', h('i', { style: { width: Math.max(0, Math.min(100, (parseFloat(v) - f.min) / ((f.max - f.min) || 1) * 100)) + '%' } })) : null, h('b', v === '' ? '—' : v));
      };
      return h('article.pcard', h('header.pcard-head', avatar(ch || { name }, 'sm'), h('b', name), ch ? null : h('small', '함께 있는 사람'),
        past ? null : iconBtn('more', '카드 메뉴', e => menu(e.currentTarget, [
          ...cf.filter(f => hide[`c:${name}:${f.key}`]).map(f => ({ label: `${f.key} 다시 보이기`, ic: 'eye', onclick: () => { this.toggle(chat, 'trackHide', `c:${name}:${f.key}`); done(false); } })),
          { label: '카드 비우기', ic: 'trash', danger: true, onclick: () => { if (chat.cast) delete chat.cast[name]; for (const k of Object.keys(lock)) if (k.startsWith(`c:${name}:`)) delete lock[k]; done(); } }]), 'tiny')),
        h('div.pcard-body', rows.filter(f => !THINK.test(f.key)).map(row), rows.filter(f => THINK.test(f.key)).map(row)));
    };
    const go = i => { this.view = i < 0 ? null : { chat: chat.id, i }; opt.redraw?.(); };
    const at = past ? tl.indexOf(vi) : tl.length - 1, older = at > 0 ? tl[at - 1] : -1, newer = past ? (at + 1 >= tl.length - 1 ? -1 : tl[at + 1]) : -2;
    const nav = tl.length > 1 ? h('div.hud-nav',
      h('button', { type: 'button', title: '이전 시점', disabled: older < 0, onclick: () => go(older) }, icon('left', 13)),
      h('button.hud-when', { type: 'button', title: past ? '이 시점의 메시지로 가기 · 되돌리기' : '지금 상태예요. 화살표로 지난 시점을 훑어볼 수 있어요', onclick: e => past && menu(e.currentTarget, [
        { label: '이 메시지로 가기', ic: 'search', onclick: () => opt.onJump?.(msgs[vi]) },
        { label: '이 시점 값으로 되돌리기', ic: 'refresh', hint: '메시지는 그대로', onclick: async () => { if (!(await confirmBox(`상태창을 ${vi + 1}번째 메시지 시점의 값으로 되돌릴까요? 메시지는 지워지지 않아요.`, '되돌리기'))) return; const next = rewound(this.state(chat), state, lock); chat.tracker = next.w; chat.cast = next.c; chat.trackDiff = {}; chat.castDiff = {}; this.view = null; done(); } },
        { label: '지금으로', ic: 'right', onclick: () => go(-1) }]) }, past ? `#${String(vi + 1).padStart(3, '0')}` : '지금', past ? h('small', `${at + 1}/${tl.length}`) : null),
      h('button', { type: 'button', title: past ? '다음 시점' : '지금이 가장 최근이에요', disabled: !past, onclick: () => go(newer) }, icon('right', 13))) : null;
    const fold = !!chat.hudFold, head = fold ? keys.slice(0, 3).map(k => `${k} ${state.w[k] ?? '—'}`).join('  ·  ') : '';
    const castOpen = people.length && chat.hudCast !== false;
    return h(`div.hud${fold ? '.fold' : ''}${past ? '.past' : ''}`,
      h('div.hud-line',
        h('button.hud-tab', { type: 'button', title: fold ? '상태창 펼치기' : '상태창 접기', onclick: opt.onFold }, h('i', '✦'), fold ? h('span', head || '상태') : '상태'),
        fold ? null : h('div.hud-grid', keys.map(cell), !keys.length ? h('span.hud-none', '장면 항목은 모두 숨겨 두었어요') : null),
        fold ? null : h('div.hud-side', nav,
          people.length ? h(`button.hud-people${castOpen ? '.on' : ''}`, { type: 'button', title: castOpen ? '인물 카드 접기' : '인물 카드 펼치기', onclick: () => { chat.hudCast = !castOpen; opt.saved?.(); opt.redraw?.(); } }, h('i', '☾'), `인물 ${people.length}`) : null,
          h('button.hud-edit', { type: 'button', title: '상태창 고치기 · 잠금 · 숨김', onclick: () => this.editState(chat, opt) }, '⋯'))),
      !fold && castOpen ? h('div.hud-cast', people.map(card)) : null);
  },
  /** 상태창 고치기: 값 · 잠금 · 숨김을 한곳에서 */
  editState(chat, opt = {}) {
    const msgs = opt.msgs || [], body = h('div.state-edit'), lock = chat.trackLock ||= {}, hide = chat.trackHide ||= {};
    const flush = debounce(() => { const last = [...msgs].reverse().find(m => m.role === 'assistant'); if (last) this.stamp(chat, last); opt.saved?.(); opt.redraw?.(); }, 300);
    const row = (key, label, value, f) => h(`div.se-row${hide[key] ? '.se-off' : ''}`,
      h('span.se-k', label, f?.max != null ? h('small', `${f.min}–${f.max}`) : null),
      h('input.inp', { value: value ?? '', placeholder: f?.desc || '아직 없음', oninput: e => { this.setValue(chat, key, e.target.value); flush(); } }),
      h(`button.se-tog${lock[key] ? '.on' : ''}`, { type: 'button', title: lock[key] ? '잠겨 있어요 — 모델이 바꾸지 못합니다 (눌러서 풀기)' : '잠그기 — 모델이 이 값을 바꾸지 못하게', onclick: () => { this.toggle(chat, 'trackLock', key); flush(); draw(); } }, icon('lock', 15)),
      h(`button.se-tog${hide[key] ? '.on' : ''}`, { type: 'button', title: hide[key] ? '띠에서 숨겨 두었어요 (눌러서 다시 보이기)' : '띠에서 숨기기 — 값은 계속 따라갑니다', onclick: () => { this.toggle(chat, 'trackHide', key); flush(); draw(); } }, icon(hide[key] ? 'eyeoff' : 'eye', 15)));
    const draw = () => {
      const fields = this.fields(), cf = this.castFields(), w = chat.tracker || {}, c = chat.cast || {};
      const keys = fields.length ? fields.map(f => f.key) : Object.keys(w), people = cf.length ? [...new Set([...(opt.chars || []).map(x => x.name), ...Object.keys(c)])] : [];
      body.replaceChildren(
        h('p.hint', '값을 직접 고치면 그 자리에서 반영됩니다. 자물쇠를 채운 항목은 모델이 바꾸지 못하고, 되감아도 지금 값을 지킵니다. 눈을 감긴 항목은 띠에서만 사라지고 계속 기록됩니다.'),
        h('h3.form-sec', h('i.se-mark', '✦'), '장면'),
        keys.length ? h('div.se-list', keys.map(k => row('w:' + k, k, w[k], fields.find(f => f.key === k)))) : h('p.dim', '항목이 없어요. 설정에서 항목을 적어 주세요.'),
        cf.length ? h('h3.form-sec', h('i.se-mark', '☾'), '인물 카드') : null,
        ...(cf.length ? people.map(name => h('section.se-person', h('header', avatar((opt.chars || []).find(x => x.name === name) || { name }, 'xs'), h('b', name),
          (opt.chars || []).some(x => x.name === name) ? null : iconBtn('trash', '이 카드 지우기', () => { delete c[name]; for (const k of Object.keys(lock)) if (k.startsWith(`c:${name}:`)) delete lock[k]; flush(); draw(); }, 'tiny')),
          h('div.se-list', cf.map(f => row(`c:${name}:${f.key}`, f.key, c[name]?.[f.key], f))))) : []),
        cf.length ? h('div.row', btn('인물 추가', { ic: 'plus', cls: 'ghost', onclick: async () => { const n = (await promptBox('카드를 만들 사람의 이름', ''))?.trim(); if (!n) return; (chat.cast ||= {})[n] ||= {}; flush(); draw(); } })) : null,
        h('div.row.wrap', btn('상태창 설정', { ic: 'sliders', cls: 'ghost', onclick: () => this.settings('tracker', chat) }),
          btn('모두 비우기', { cls: 'ghost', onclick: async () => { if (!(await confirmBox('지금 상태창의 값을 모두 비울까요? 잠금과 숨김은 그대로 둡니다.', '비우기', true))) return; chat.tracker = {}; chat.cast = {}; chat.trackDiff = {}; chat.castDiff = {}; flush(); draw(); } })));
    };
    draw();
    return modal({ title: '상태창 고치기', wide: true, body, actions: [{ label: '닫기', cls: 'primary' }] });
  },

  /** 선톡 · 일정 · 상태 · 장면 · 상태창을 한곳에서 */
  settings(tab = 'auto', chat) {
    ensureDefaults();
    const st = S.settings, apply = () => { S.set({}); Live.onChange?.(); if (tab === 'auto') board(); };
    const prompts = kind => PROMPTS[kind].map(([k, label, dflt, hint]) => ({ k, label, type: 'area', rows: 5, ph: dflt, hint: `${hint ? hint + ' ' : ''}비워 두면 기본 문장을 씁니다 (칸에 흐리게 보이는 글).` }));
    const fold = (title, defs) => ({ el: h('details.live-fold', h('summary', icon('edit', 14), title), form(st, defs, apply)) });
    const conns = [['', '이 대화의 연결 그대로'], ...S.conns.map(c => [c.id, `${c.name}${c.model ? ' · ' + c.model : ''}`])];
    const chars = chat ? chat.charIds.map(id => S.get('chars', id)).filter(Boolean) : [];
    const boardEl = h('div.plan-board'); let timer = 0;
    const board = () => {
      const p = chat ? Live.planOf?.(chat) : null;
      if (!p) return boardEl.replaceChildren(h('p.hint', chat ? '이 대화방을 열어 두면 여기에서 다음 연락 예정과 막힌 이유를 볼 수 있어요.' : '대화방 안에서 열면 그 방의 연락 현황이 보입니다.'));
      const next = p.plan.at ? `${clock(p.plan.at)}` : '없음', kindName = p.plan.kind === 'later' ? '약속한 연락' : p.plan.kind === 'owed' ? '복귀 (내 말에 답장)' : p.plan.kind === 'auto' ? `${motiveLabel(p.motive?.kind) || '그냥 안부'} 예상` : '';
      const cds = MOTIVE_ORDER.map(k => [k, p.cdLeft?.[k] || 0]);
      boardEl.replaceChildren(
        h('div.plan-cells',
          h('div.plan-cell', h('span', '오늘 보낸 연락'), h('b', `${p.count} / ${p.cap}`), h('i.plan-bar', h('i', { style: { width: Math.min(100, p.count / Math.max(1, p.cap) * 100) + '%' } }))),
          h('div.plan-cell', h('span', '다음 연락 예정'), h('b', next), kindName ? h('small', kindName) : null),
          h('div.plan-cell', h('span', '마지막으로 온 연락'), h('b', p.last?.at ? clock(p.last.at) : '아직 없음'), p.last?.kind ? h('small', motiveLabel(p.last.kind)) : null),
          h('div.plan-cell', h('span', '지금 상태'), h('b', p.who || ''), h('small', p.status || ''))),
        p.plan.blocks.length ? h('div.plan-why', h('b', '지금 연락이 오지 않는 이유'), h('ul', p.plan.blocks.map(x => h('li', x)))) : null,
        p.plan.notes.length ? h('div.plan-why.soft', h('b', '참고'), h('ul', p.plan.notes.map(x => h('li', x)))) : null,
        h('div.plan-cds', h('span.plan-cds-label', '말 거는 이유'), cds.map(([k, left]) => h(`span.plan-cd${left ? '.wait' : ''}`, { title: MOTIVES[k][2] }, motiveLabel(k), h('small', left ? `${span(left)} 뒤` : '가능')))),
        h('div.row.wrap', btn('지금 한 통 받기', { ic: 'send', cls: 'ghost', title: '답변 1회와 같은 비용', onclick: async () => { const r = await Live.poke?.(chat); if (r === false) toast('지금은 보낼 수 없어요 (생성 중이거나 연결이 없어요)'); else box?.close(); } }),
          h('small.hint', '한도와 상관없이 지금 바로 한 통을 받습니다 (호출 1회). 이유는 위 예상대로 정해져요.')));
    };
    const cdDefs = MOTIVE_ORDER.map(k => ({ k: `modes.cd.${k}`, label: `${motiveLabel(k)} (시간)`, type: 'num', min: 0, step: 0.5, third: true, hint: MOTIVES[k][2] }));
    const tabs = {
      auto: () => { board(); return [h('p.hint', '먼저 오는 연락 한 통은 보통 답변 한 번과 같은 비용이 듭니다. 아래 한도 안에서만 보내고, 대화방을 열어 두지 않은 캐릭터는 연락하지 않습니다.'), boardEl,
        form(st, [{ section: '조용할 때 먼저 말 걸기' }, { k: 'modes.auto', label: '내가 조용하면 캐릭터가 먼저 말 걸기', type: 'check' },
          { k: 'modes.autoMinutes', label: '몇 분 조용하면', type: 'num', min: 1, third: true }, { k: 'modes.autoBackoff', label: '연달아 걸 때 간격 배수', type: 'num', min: 1, step: 0.5, third: true, hint: '2 면 10분 → 20분 → 40분.' }, { k: 'modes.autoStreak', label: '답이 없을 때 연속 최대', type: 'num', min: 1, max: 10, third: true },
          { k: 'modes.autoDaily', label: '하루 최대 횟수', type: 'num', min: 0, third: true, hint: '0 이면 캐릭터의 수다 정도에 따라 2~8회.' }, { k: 'modes.quietFrom', label: '연락하지 않는 시간 — 부터', third: true, ph: '01:00' }, { k: 'modes.quietTo', label: '까지', third: true, ph: '08:00' },
          { k: 'modes.autoHidden', label: '화면을 안 보고 있을 때도 보내기 (끄면 이 탭을 보고 있을 때만 — 모르는 사이에 비용이 나가지 않아요)', type: 'check' },
          { section: '말 거는 이유' }, { k: 'modes.motives', label: '일정과 시각에서 말 걸 이유를 골라 주기 (아침 인사 · 밤 인사 · 식사 · 바쁜 뒤 · 복귀 · 장기 부재 · 일과 전환 · 그냥 안부)', type: 'check', hint: '추가 호출 없음 — 선톡 지시문에 한 줄이 더해질 뿐입니다.' },
          { k: 'modes.readReact', label: '읽지 않음 · 읽고 답 없음에 따라 다르게 반응하기', type: 'check' }, { k: 'modes.showWhy', label: '먼저 온 연락 옆에 이유를 작게 적어 두기', type: 'check' },
          { k: 'modes.longHours', label: '"장기 부재"로 보는 시간', type: 'num', min: 1, third: true, hint: '이만큼 서로 말이 없었을 때.' },
          fold('이유별 쿨다운 — 같은 이유로 다시 말 걸기까지', [...cdDefs, { el: h('small.hint', '0 이면 쿨다운 없음. 일정이 없는 캐릭터는 시계만 보고 아침 · 밤 · 식사 시간을 짐작합니다.') }]),
          { section: '약속과 부재' }, { k: 'modes.later', label: '"이따 연락할게" 같은 약속을 기억했다가 그 시간에 연락하기', type: 'check' }, { k: 'modes.laterMax', label: '한 대화방에서 기억할 약속 수', type: 'num', min: 1, max: 10, half: true },
          { k: 'modes.away', label: '오래 자리를 비우면 그 사이에 온 연락 남겨 두기 (돌아왔을 때 한 통)', type: 'check' }, { k: 'modes.awayHours', label: '몇 시간 넘게 비웠을 때', type: 'num', min: 1, half: true },
          { section: '비용' }, { k: 'modes.autoConn', label: '먼저 오는 연락에 쓸 연결', type: 'select', opts: conns, half: true, hint: '값싼 모델을 따로 지정할 수 있습니다.' }, { k: 'modes.autoTokens', label: '먼저 오는 연락의 최대 토큰', type: 'num', min: 0, half: true, hint: '0 이면 대화 모드의 기본 길이.' },
          { k: 'modes.notify', label: '화면을 안 보고 있을 때 온 연락을 브라우저 알림으로 받기', type: 'check' },
          fold('지시문 고치기', prompts('auto'))], apply)]; },
      sched: () => [h('p.hint', '캐릭터마다 일주일 일과(요일 × 시간대)를 정해 두면, 지금 시각의 칸이 그 캐릭터의 상태와 하는 일이 되고 오늘 일정이 대화 모드 프롬프트에 들어갑니다. 캐릭터가 답장에서 스스로 상태를 바꾸면 그 칸이 끝날 때까지만 그 상태가 앞섭니다.'),
        form(st, [{ k: 'modes.sched', label: '캐릭터 일정을 대화 모드에 반영하기', type: 'check', hint: '추가 호출 없음. 일정을 AI 로 짜는 것만 버튼을 누를 때 1회씩 부릅니다.' }], apply),
        h('div.sched-items', chars.length ? chars.map(c => Schedule.row(c, () => { Live.onChange?.(); draw('sched'); })) : h('p.dim', '대화방 안에서 열면 그 방의 캐릭터가 여기에 보입니다. 모든 캐릭터의 일정은 기능 › 일정 에서 고칠 수 있어요.')),
        form(st, [fold('지시문 고치기', prompts('sched'))], apply)],
      presence: () => [h('p.hint', '여기 있는 것은 모두 추가 호출 없이 동작합니다 — 끼어들기만 빼고요.'),
        form(st, [{ section: '내 상태' }, { k: 'modes.userStatus', label: '지금 내 상태', type: 'select', half: true, opts: Object.entries(USER_ST), hint: '방해 금지면 캐릭터가 먼저 연락하지 않습니다. 숨김이면 캐릭터에게는 오프라인처럼 보입니다.' }, { k: 'modes.userActivity', label: '하는 일 (선택)', half: true, ph: '예: 회의 중' },
          { k: 'modes.userIdleMin', label: '입력이 없으면 자리 비움으로 (분)', type: 'num', min: 0, third: true, hint: '0 이면 자동으로 바꾸지 않습니다.' },
          { section: '답장이 오기까지' }, { k: 'modes.presenceDelay', label: '캐릭터의 상태에 따라 답장을 늦추기', type: 'check', hint: '오프라인이면 답장이 오지 않습니다.' },
          { k: 'modes.delayOnline', label: '온라인일 때 (초)', third: true, ph: '0' }, { k: 'modes.delayIdle', label: '자리 비움일 때 (초)', third: true, ph: '4-10' }, { k: 'modes.delayDnd', label: '방해 금지일 때 (초)', third: true, ph: '9-18', hint: '"4-10" 처럼 범위로 적으면 그 사이에서 고릅니다.' },
          { k: 'modes.delayNamed', label: '내가 이름을 부르면 (%)', type: 'num', min: 0, max: 100, third: true, hint: '기다리는 시간을 이 비율로 줄입니다. 30 이면 30% 만 기다려요.' },
          { k: 'modes.offlineWake', label: '오프라인이라 답하지 못한 말은, 캐릭터가 깨어나면 답장하기 (답변 1회 — 내가 보낸 말에 대한 답이라 하루 한도에 넣지 않아요)', type: 'check' },
          { section: '그룹: 캐릭터끼리 끼어들기' }, { k: 'modes.chime', label: '한 캐릭터가 말한 뒤 다른 캐릭터가 끼어들 수 있게 하기', type: 'check', hint: '끼어들 때마다 답변 1회와 같은 비용이 듭니다. 그룹 대화 모드에서만 동작합니다.' },
          { k: 'modes.chimeChance', label: '끼어들 확률 (%)', type: 'num', min: 0, max: 100, third: true, hint: '이름이 불린 캐릭터는 확률과 상관없이 답합니다.' }, { k: 'modes.chimeMax', label: '내 말 한 번에 최대 몇 번', type: 'num', min: 1, max: 5, third: true }, { k: 'modes.chimeDaily', label: '하루 한도', type: 'num', min: 1, third: true },
          fold('지시문 고치기', prompts('group'))], apply)],
      scene: () => [h('p.hint', '대화 모드에서 실제로 만나거나 문자로 할 수 없는 일이 벌어지면, 그때부터는 메시지 대신 장면으로 이어집니다. 입력창 위의 "장면 열기 / 닫기"로 직접 할 수도 있어요.'),
        form(st, [{ k: 'modes.scenes', label: '캐릭터가 스스로 장면을 열 수 있게 하기', type: 'check' }, { k: 'modes.sceneStart', label: '장면이 열리면 캐릭터가 바로 첫 장면을 쓰기 (답변 1회)', type: 'check' }, fold('지시문 고치기', prompts('scene'))], apply)],
      tracker: () => [h('p.hint', '기본은 꺼져 있습니다. 켜면 대화 위에 지금 상태가 띠로 뜨고, 끄면 프롬프트에도 아무것도 들어가지 않습니다.'),
        form(st, [{ k: 'tracker.enabled', label: '상태창 켜기', type: 'check' }, { k: 'tracker.mode', label: '상태를 갱신하는 방법', type: 'select', opts: [['call', '답변 뒤에 따로 묻기 (답변마다 추가 호출 1회)'], ['inline', '답변에 함께 적게 하기 (추가 호출 없음)']], hint: '어느 쪽이든 모델은 바뀐 항목만 적습니다. 적지 않은 항목은 그대로 남아요.' },
          { k: 'tracker.hud', label: '대화 화면 위에 띠로 보이기', type: 'check' }, { k: 'tracker.inject', label: '지금 상태를 프롬프트에 넣기', type: 'check' },
          { k: 'tracker.fields', label: '장면 항목', type: 'area', rows: 6, hint: '한 줄에 하나씩 "이름: 설명". "호감도 (0-100): 설명" 처럼 범위를 적으면 막대로 보입니다.' },
          { section: '인물 카드' }, { k: 'tracker.cast', label: '등장인물마다 카드 만들기 (기분 · 옷차림 · 속마음 …)', type: 'check', hint: '그룹 채팅에서는 캐릭터마다 한 장씩. 추가 호출은 없고, 프롬프트가 조금 길어집니다.' },
          { k: 'tracker.castFields', label: '카드 항목', type: 'area', rows: 4, hint: '한 줄에 하나씩 "이름: 설명". 이름에 "속마음"이나 "생각"이 들어간 항목은 생각 풍선으로 보입니다.' },
          { k: 'tracker.castOthers', label: '대화방의 캐릭터가 아닌 사람도 장면에 있으면 카드 만들기', type: 'check', half: true }, { k: 'tracker.castMax', label: '카드 최대 장수', type: 'num', min: 1, max: 12, half: true },
          { el: h('p.hint', '상태는 답변마다 그 메시지에 함께 찍혀서, 답변을 넘기거나 다시 생성하거나 지우면 그 시점의 값으로 되감깁니다. 띠의 화살표로 지난 시점을 훑어볼 수 있고, 항목을 누르면 고치기 · 잠그기 · 숨기기가 나옵니다.') },
          fold('지시문 고치기', prompts('tracker'))], apply)],
    };
    const body = h('div.live-set'), bar = h('div.tabs.live-tabs'); let box;
    const draw = t => { tab = tabs[t] ? t : 'auto'; bar.replaceChildren(...[['auto', '먼저 오는 연락'], ['sched', '일정'], ['presence', '상태 · 그룹'], ['scene', '장면 전환'], ['tracker', '상태창']].map(([k, l]) => h(`button.tab${k === tab ? '.on' : ''}`, { type: 'button', onclick: () => draw(k) }, l))); body.replaceChildren(...tabs[tab]().flat().filter(Boolean)); };
    draw(tab);
    timer = setInterval(() => { if (tab === 'auto') board(); }, 20000);
    box = modal({ title: '대화 모드 설정', wide: true, body: h('div.col', bar, body), onClose: () => clearInterval(timer), actions: [{ label: '닫기', cls: 'primary' }] });
    return box;
  },
  /** 화면을 안 보고 있을 때 도착한 연락: 탭 제목과 (허락했다면) 알림으로 알린다 */
  ping(name, text) {
    if (!document.hidden) return;
    Live.unseen = (Live.unseen || 0) + 1; document.title = `(${Live.unseen}) ${name} — Dreamland`;
    if (S.settings.modes?.notify && 'Notification' in window && Notification.permission === 'granted') { try { new Notification(name, { body: String(text).split('\n')[0].slice(0, 120), tag: 'dreamland' }); } catch { } }
  },
};
document.addEventListener('visibilitychange', () => { if (!document.hidden && Live.unseen) { Live.unseen = 0; document.title = 'Dreamland'; } });
Schedule.onChange = () => Live.onChange?.();

// 내 상태: 입력이 끊기면 자리 비움, 돌아오면 온라인 (바뀐 순간에만 화면을 다시 그린다)
function watchUser() { const s = Live.userStatus().status; if (s !== lastUser) { lastUser = s; Live.onUser?.(s); } }
let touchAt = 0;
for (const ev of ['keydown', 'pointerdown', 'touchstart', 'wheel']) document.addEventListener(ev, () => { const t = Date.now(); if (t - touchAt < 3000) return; touchAt = t; Live.touch(); }, { passive: true, capture: true });
setInterval(watchUser, 30000);

// ════════ 프롬프트 조각: 오늘 일정 · 상태 · 말 거는 이유 · 장면 · 상태창 ════════
const fill = (t, map) => Object.entries(map).reduce((s, [k, v]) => s.split(`{{${k}}}`).join(String(v ?? '')), t);
X.prompt.push({ owner: 'live', fn: ({ chat, char, chars = [], ctx, type }) => {
  const M = S.settings.modes || {}, T = S.settings.tracker || {}, out = [];
  const mx = t => String(t).replace(/\{\{char\}\}/g, ctx?.char || 'the character').replace(/\{\{user\}\}/g, ctx?.user || 'the user');
  const talk = chat.mode === 'talk', scene = chat.scene?.on && (talk || chat.sceneLive);   // 장면 안내는 대화 모드에서 연 장면에만 (RP 로 바꿔 보는 동안에는 싣지 않는다)
  if (type === 'impersonate') return out;
  if (scene) out.push({ where: 'end', src: '장면 안내', content: mx(get('modes.sceneRules', SCENE_RULES)).replace('{{title}}', chat.scene.title || 'untitled').replace('{{place}}', chat.scene.place ? ` at ${chat.scene.place}` : '') });
  else if (talk) {
    // 오늘 일정과 서로의 상태
    const lines = [], sched = scheduleOf(char), date = Clock.now(chat);
    if (sched) {
      const B = blockAt(sched, date), p = Live.presence(chat, char), nowMin = date.getHours() * 60 + date.getMinutes();
      const sayNow = B.cur ? `${B.cur.activity || STATUS_EN[B.cur.status]} (${STATUS_EN[B.cur.status]}) until ${fmtMin((nowMin + B.left) % 1440)}${B.next ? `; after that: ${B.next.activity || STATUS_EN[B.next.status]}` : ''}${p.from === 'override' ? `. For the moment you changed your own status to ${STATUS_EN[p.status]}${p.activity ? ` (${p.activity})` : ''}` : ''}` : 'nothing planned';
      lines.push(fill(mx(get('modes.pToday', SCHED_CTX)), { day: DAY_EN[dayIndex(date)], schedule: todayLine(sched, date) || 'nothing planned', now: sayNow }));
    }
    const others = chars.filter(c => c.id !== char?.id).map(c => { const p = Live.presence(chat, c); return p.from ? `${c.name} — ${STATUS_EN[p.status]}${p.activity ? ` (${p.activity})` : ''}` : ''; }).filter(Boolean);
    if (others.length) lines.push(`The others in this chat right now: ${others.join('; ')}.`);
    const u = Live.userStatus(), act = String(mo('userActivity') || '').replace(/\s+/g, ' ').trim().slice(0, 120);
    if (u.status !== 'online' || act) lines.push(fill(mx(get('modes.pUserStatus', USER_STATUS)), { status: USER_ST_EN[u.status] + (act && u.status !== 'hidden' ? ` — ${act}` : '') }));
    if (lines.length) out.push({ where: 'end', src: '오늘 일정 · 상태', content: lines.join('\n') });
    const cmds = [M.scenes !== false && get('modes.sceneOffer', SCENE_OFFER), M.later !== false && get('modes.laterOffer', LATER_OFFER)].filter(Boolean);
    if (cmds.length) out.push({ where: 'end', src: '장면 · 약속 명령', content: mx(`<more_commands>\nThese work like the other commands: on their own line, removed before {{user}} sees the message.\n${cmds.join('\n')}\n</more_commands>`) });
  }
  // 이 생성에만 붙는 사정
  const p = Live.pending;
  if (p?.kind === 'later') out.push({ where: 'end', src: '약속한 연락', content: mx(get('modes.pLater', P_LATER)).replace('{{about}}', p.about || 'something you promised') });
  else if (p?.kind === 'away') out.push({ where: 'end', src: '자리를 비운 사이', content: mx(get('modes.pAway', P_AWAY)).replace('{{hours}}', p.hours) });
  else if (p?.kind === 'unread') out.push({ where: 'end', src: '읽지 않음', content: mx(get('modes.pUnread', P_UNREAD)) });
  else if (p?.kind === 'ghosted') out.push({ where: 'end', src: '읽고 답 없음', content: mx(get('modes.pGhosted', P_GHOSTED)) });
  else if (p?.kind === 'chime') out.push({ where: 'end', src: '끼어들기', content: fill(mx(get('modes.pChime', P_CHIME)), { from: p.from || 'someone' }) });
  else if (p?.kind && P_MOTIVE[p.kind]) out.push({ where: 'end', src: `말 거는 이유: ${motiveLabel(p.kind)}`, content: fill(mx(get(`modes.pm.${p.kind}`, P_MOTIVE[p.kind])), { activity: p.activity || 'a short break', before: p.before || 'what you were doing', hours: p.hours || 1 }) });

  // 상태창
  if (T.enabled) {
    const f = Live.fields(mx), cf = Live.castFields(mx), lock = chat.trackLock || {}, w = chat.tracker || {}, c = chat.cast || {};
    const names = [...new Set([...chars.map(x => x.name), ...Object.keys(c)])];
    const cards = () => names.map(n => `${n} — ${cf.map(x => `${x.key}: ${c[n]?.[x.key] || '(not set yet)'}${lock[`c:${n}:${x.key}`] ? ' (locked)' : ''}`).join(' | ')}`).join('\n');
    const fieldList = list => list.map(x => `- ${x.key}${x.max != null ? ` (a number from ${x.min} to ${x.max})` : ''}${x.desc ? `: ${x.desc}` : ''}`).join('\n');
    if (T.mode === 'inline') {
      const open = f.filter(x => !lock['w:' + x.key]);
      if (f.length || cf.length) {
        const castPart = cf.length ? fill(mx(get('tracker.castInline', CAST_INLINE)), { fields: fieldList(cf), first: cf[0].key, cards: cards() }) : '';
        const tpl = mx(get('tracker.inlinePrompt', STATE_RULES));
        let content = fill(tpl, { lines: open.map(x => `${x.key}: ${x.max != null ? `a number from ${x.min} to ${x.max}` : '…'}${x.desc ? `   (${x.desc})` : ''}`).join('\n') || '(none)', current: f.map(x => `${x.key}: ${w[x.key] || '(not set yet)'}${lock['w:' + x.key] ? ' (locked)' : ''}`).join('\n') || '(none)', cast: castPart });
        if (castPart && !tpl.includes('{{cast}}')) content += '\n' + castPart;
        out.push({ where: 'end', src: '상태창 규칙', content: content.replace(/\n{3,}/g, '\n\n') });
      }
    } else if (T.inject !== false) {
      // 따로 묻는 방식: RP 는 엔진이 장면 항목을 넣어 주므로 인물 카드만, 대화 모드는 둘 다 여기서 넣는다
      const parts = [];
      if (talk && !scene && Object.keys(w).length) parts.push('[Current state]\n' + Object.entries(w).map(([k, v]) => `${k}: ${v}`).join('\n'));
      if (cf.length && Object.keys(c).length) parts.push('[People right now]\n' + Object.entries(c).map(([n, o]) => `${n} — ${cf.map(x => o[x.key] ? `${x.key}: ${o[x.key]}` : '').filter(Boolean).join(' | ')}`).filter(l => !l.endsWith('— ')).join('\n'));
      if (parts.length) out.push(talk && !scene ? { where: 'end', src: '지금 상태', content: parts.join('\n\n') } : { where: 'depth', depth: 1, order: 51, src: '인물 카드', content: parts.join('\n\n') });
    }
  }
  return out;
} });
/** 상태를 따로 물을 때 보낼 지시문과 이전 상태 */
Live.trackCall = (chat, chars, mx = t => t) => {
  const f = Live.fields(mx), cf = Live.castFields(mx), lock = chat.trackLock || {}, c = chat.cast || {};
  const list = f.filter(x => !lock['w:' + x.key]).map(x => `- "${x.key}": ${x.desc || x.key}${x.max != null ? ` — a number from ${x.min} to ${x.max}, digits only` : ''}`).join('\n') || '(none)';
  const names = [...new Set([...chars.map(x => x.name), ...Object.keys(c)])];
  const castPart = cf.length ? fill(get('tracker.castCall', CAST_CALL), { fields: cf.map(x => `- "${x.key}": ${x.desc || x.key}${x.max != null ? ` — a number from ${x.min} to ${x.max}` : ''}`).join('\n'), names: names.join(', ') || '(none yet)' }) : '';
  const tpl = Live.trackPrompt();
  let system = tpl.includes('{{fields}}') ? fill(tpl, { fields: list, cast: castPart }) : fill(tpl, { cast: castPart }) + '\n' + list;
  if (castPart && !tpl.includes('{{cast}}')) system += '\n' + castPart;
  const prev = { ...Object.fromEntries(f.map(x => [x.key + (lock['w:' + x.key] ? ' (locked)' : ''), chat.tracker?.[x.key] ?? ''])), ...(cf.length ? { cast: c } : {}) };
  return { system: system.trim(), prev, any: f.length + cf.length > 0 };
};
/** 따로 물은 답(JSON)을 patch 로 */
Live.readCall = text => {
  const m = String(text || '').match(/\{[\s\S]*\}/); if (!m) return null;
  let j; try { j = JSON.parse(m[0].replace(/,\s*([\]}])/g, '$1')); } catch { return null; }
  const { cast, gone, ...w } = j, c = {};
  if (cast && typeof cast === 'object') for (const [n, o] of Object.entries(cast)) if (o && typeof o === 'object') c[n] = Object.fromEntries(Object.entries(o).map(([k, v]) => [k, String(v ?? '')]));
  return { w: Object.fromEntries(Object.entries(w).filter(([, v]) => v != null && typeof v !== 'object').map(([k, v]) => [k.replace(/\s*\(locked\)$/, ''), String(v)])), c, gone: Array.isArray(gone) ? gone.map(String) : [] };
};
// 알림을 켜면 그 자리에서 브라우저 허락을 받는다
on('settings', () => { if (S.settings.modes?.notify && 'Notification' in window && Notification.permission === 'default') Notification.requestPermission().catch(() => { }); });
export const newLater = (o) => ({ id: uid(), at: now() + parseDur(o.in), about: o.about || '', made: now() });
