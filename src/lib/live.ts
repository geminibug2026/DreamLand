// ── Dreamland live: 대화 모드의 살아 있는 부분 ── (옛 js/live.js 의 로직, 동작 그대로)
// 장면 전환 · 약속한 연락 · 선톡 동기 · 캐릭터/사용자 상태 · 상태창 계산 · 프롬프트 조각 · 설정 기본값
// 화면(상태창 띠 hud · 고치기 창 editState · 설정 창 settings)은 src/chat/{Hud,LiveSettings}.tsx 에 있다. 그 셋은 옛것처럼 빈 칸으로 두고 화면 쪽이 채운다.
import { S, now, uid, on } from './core';
import { X } from './hooks';
import { Clock } from './clock';
import { scheduleOf, blockAt, todayLine, STATUS, STATUS_EN, DAY_EN, dayIndex, fmtMin, MOTIVES, MOTIVE_ORDER, motiveLabel, SCHEDULE_PROMPT, Schedule, type SchedChar } from './f-schedule';
import type { TrackState } from './types';

export interface Field { key: string; desc: string; min?: number; max?: number }
export interface Patch { w: Record<string, string>; c: Record<string, Record<string, string>>; gone: string[] }
interface PresenceRec { status: string; activity?: string; until?: number; hold?: boolean }
interface DiffRec { from: string; d?: number | null; at: number }
/** 이 파일이 읽고 쓰는 대화 칸 */
export interface LiveChat {
  id: string; charIds?: string[]; mode?: string; scene?: { on?: boolean; title?: string; place?: string }; sceneLive?: boolean;
  presence?: PresenceRec; presenceBy?: Record<string, PresenceRec>;
  tracker?: Record<string, string>; cast?: Record<string, Record<string, string>>; trackLock?: Record<string, boolean>; trackHide?: Record<string, boolean>;
  trackDiff?: Record<string, DiffRec>; castDiff?: Record<string, DiffRec>; trackLog?: { t: number; v: Record<string, string> }[]; snaps?: number; snap0?: TrackState; [k: string]: unknown;
}
export interface LiveMsg { role?: string; sw: number; swipes: { state?: TrackState | null; [k: string]: unknown }[]; [k: string]: unknown }
export type LiveChar = SchedChar & { id?: string; name: string };
type Bag = Record<string, unknown>;
interface SApi { settings: Bag & { modes?: Bag & { cd?: Record<string, unknown>; pm?: Bag; quietFrom?: string; quietTo?: string; notify?: boolean }; tracker?: Bag & { fields?: string; enabled?: boolean } }; set(patch: Bag): void }
const SS = () => S as unknown as SApi;

// ── pure:start ──
const args = (s: unknown) => { const o: Record<string, string> = {}; String(s || '').replace(/(\w+)\s*=\s*"([^"]*)"/g, (_, k: string, v: string) => { o[k] = v; return ''; }); return o; };
/** "2h", "30m", "1d", "90" (분) → 밀리초 */
export const parseDur = (s: unknown) => { const m = String(s || '').match(/([\d.]+)\s*(d|h|m|일|시간|분)?/i); if (!m) return 0; const u = (m[2] || 'm').toLowerCase(); return +m[1] * (u === 'd' || u === '일' ? 86400000 : u === 'h' || u === '시간' ? 3600000 : 60000); };
/** 항목 목록: "이름 (0-100): 설명" 형식이면 범위가 있는 항목 */
export const parseFields = (text: unknown): Field[] => String(text || '').split('\n').map(l => l.trim()).filter(Boolean).map(l => {
  const i = l.search(/[:：]/), head = (i < 0 ? l : l.slice(0, i)).trim(), desc = i < 0 ? '' : l.slice(i + 1).trim();
  const r = head.match(/^(.*?)\s*\(\s*(-?\d+)\s*[-~]\s*(-?\d+)\s*\)$/);
  return r ? { key: r[1].trim(), desc, min: +r[2], max: +r[3] } : { key: head, desc };
}).filter(f => f.key);
const same = (a: unknown, b: unknown) => String(a).normalize('NFKC').trim().toLowerCase().replace(/\s+/g, ' ') === String(b).normalize('NFKC').trim().toLowerCase().replace(/\s+/g, ' ');
const pick = (list: string[] | null | undefined, k: string) => (list || []).find(x => same(x, k));
const GONE = /^(gone|left|exit|퇴장|나감|떠남)$/i;
/**
 * <state> 안의 글을 읽는다. "항목: 값" 은 장면, "이름 / 항목: 값" 은 인물 카드.
 * castKeys 가 null 이면 인물 카드를 쓰지 않는 것이라 빗금이 든 줄도 장면 항목으로 본다.
 */
export function parseState(body: unknown, { castKeys = null }: { castKeys?: string[] | null } = {}): Patch {
  const out: Patch = { w: {}, c: {}, gone: [] };
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
export const copyState = (s: Partial<TrackState> | null | undefined): TrackState => ({ w: { ...(s?.w || {}) }, c: Object.fromEntries(Object.entries(s?.c || {}).map(([n, f]) => [n, { ...f }])) });
const numOf = (val: string, r: { min?: number; max?: number }) => { const m = String(val).match(/-?\d+(?:\.\d+)?/); if (!m) return null; return String(Math.max(r.min as number, Math.min(r.max as number, +m[0]))); };
export interface MergeOpt { keys?: string[]; castKeys?: string[]; ranges?: Record<string, { min?: number; max?: number }>; locks?: Record<string, boolean>; allow?: string[]; others?: boolean; maxCast?: number }
/**
 * 바뀐 것만 든 patch 를 지금 상태에 합친다 (증분). 빠진 항목은 그대로 둔다.
 * → { w, c, diff: { w: {항목: {from, d}}, c: {'이름:항목': {from}} }, changed }
 */
export function mergeState(cur: Partial<TrackState> | null | undefined, patch: Partial<Patch> | null | undefined, { keys, castKeys, ranges = {}, locks = {}, allow, others = true, maxCast = 6 }: MergeOpt = {}) {
  const { w, c } = copyState(cur), diff: { w: Record<string, { from: string; d: number | null }>; c: Record<string, { from: string }> } = { w: {}, c: {} };
  for (const [k0, v] of Object.entries(patch?.w || {})) {
    const k = keys ? pick(keys, k0) : k0; if (!k || locks['w:' + k]) continue;
    let val: string | null = String(v ?? '').trim(); if (!val) continue;
    if (ranges[k]) { val = numOf(val, ranges[k]); if (val == null) continue; }
    if (val === w[k]) continue;
    const a = parseFloat(w[k]), b = parseFloat(val);
    diff.w[k] = { from: w[k] ?? '', d: isFinite(a) && isFinite(b) ? b - a : null }; w[k] = val;
  }
  for (const [n0, fields] of Object.entries(patch?.c || {})) {
    const name = pick(Object.keys(c), n0) || pick(allow, n0) || (others && Object.keys(c).length < maxCast ? String(n0).trim() : ''); if (!name) continue;
    for (const [f0, v] of Object.entries(fields || {})) {
      const f = castKeys ? pick(castKeys, f0) : f0; if (!f || locks[`c:${name}:${f}`]) continue;
      let val: string | null = String(v ?? '').trim(); if (!val) continue;
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
export const snapOf = (m: LiveMsg | null | undefined) => m?.swipes?.[m.sw]?.state || null;
/** upto 번째 메시지 앞까지에서 가장 최근에 찍힌 상태 */
export function stateAt(msgs: LiveMsg[], upto = msgs.length) { for (let i = Math.min(upto, msgs.length) - 1; i >= 0; i--) { const s = snapOf(msgs[i]); if (s) return { i, state: copyState(s) }; } return null; }
/** 상태가 찍힌 메시지들의 자리 */
export const timeline = (msgs: LiveMsg[] | null | undefined) => (msgs || []).map((m, i) => snapOf(m) ? i : -1).filter(i => i >= 0);
/** 되감기: target 으로 돌아가되 잠근 항목은 지금 값을 지킨다 */
export function rewound(cur: Partial<TrackState> | null | undefined, target: Partial<TrackState> | null | undefined, locks: Record<string, boolean> = {}) {
  const next = copyState(target);
  for (const [k, onn] of Object.entries(locks)) { if (!onn) continue;
    if (k.startsWith('w:')) { const key = k.slice(2); if (cur?.w && key in cur.w) next.w[key] = cur.w[key]; }
    else if (k.startsWith('c:')) { const [, name, f] = k.match(/^c:(.*):([^:]*)$/) || []; if (name && cur?.c?.[name] && f in cur.c[name]) (next.c[name] ||= {})[f] = cur.c[name][f]; } }
  return next;
}
const hm = (t: unknown) => { const m = String(t || '').match(/^(\d{1,2}):?(\d{2})?$/); return m ? +m[1] * 60 + +(m[2] || 0) : null; };
/** 조용한 시간대("01:00"~"08:00", 자정을 넘겨도 됨)가 끝날 때까지 남은 분. 그 시간대가 아니면 0 */
export function quietLeft(from: unknown, to: unknown, d = new Date()) {
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
export const P_MOTIVE: Record<string, string> = {
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
const USER_ST: Record<string, string> = { online: '온라인', idle: '자리 비움', dnd: '방해 금지', hidden: '숨김' };
const USER_ST_EN: Record<string, string> = { online: 'online', idle: 'idle / away from their phone', dnd: 'do not disturb — they asked not to be bothered right now', hidden: 'appears offline (you cannot tell whether they are around)' };

/** 고칠 수 있는 프롬프트: [설정 키, 이름, 기본값, 설명] */
export const PROMPTS: Record<string, [string, string, string, string][]> = {
  tracker: [['tracker.inlinePrompt', '답변에 함께 적게 할 때의 규칙', STATE_RULES, '{{lines}} 는 항목 목록, {{current}} 는 지금 값, {{cast}} 는 인물 카드 안내가 들어갈 자리입니다. <state> … </state> 형식은 바꾸지 마세요.'], ['tracker.castInline', '인물 카드 안내 (답변에 함께 적기)', CAST_INLINE, '{{fields}} · {{cards}} · {{first}} 가 채워집니다. "이름 / 항목: 값" 형식은 바꾸지 마세요.'],
    ['tracker.callPrompt', '상태를 따로 물을 때의 지시문', TRACK_CALL, '{{fields}} 자리에 항목 목록, {{cast}} 자리에 인물 카드 안내가 들어갑니다.'], ['tracker.castCall', '인물 카드 안내 (따로 묻기)', CAST_CALL, '{{fields}} · {{names}} 가 채워집니다.']],
  scene: [['modes.sceneOffer', '장면을 열 수 있다는 안내 (대화 모드)', SCENE_OFFER, '[scene: …] 형식은 바꾸지 마세요.'], ['modes.sceneRules', '장면 안에서의 규칙', SCENE_RULES, '{{title}} · {{place}} 가 들어갑니다. [scene_end: …] 형식은 바꾸지 마세요.']],
  auto: [['modes.laterOffer', '나중에 연락하겠다는 약속 안내', LATER_OFFER, '[later: …] 형식은 바꾸지 마세요.'], ['modes.pLater', '약속한 시간이 되었을 때', P_LATER, '{{about}} 에 약속 내용이 들어갑니다.'], ['modes.pAway', '오래 자리를 비운 사이의 연락', P_AWAY, '{{hours}} 에 비운 시간이 들어갑니다.'], ['modes.pUnread', '내가 아직 읽지 않았을 때', P_UNREAD, ''], ['modes.pGhosted', '읽고도 답이 없을 때', P_GHOSTED, ''],
    ...Object.entries(P_MOTIVE).map(([k, v]): [string, string, string, string] => [`modes.pm.${k}`, `말 거는 이유 — ${motiveLabel(k)}`, v, '{{activity}} 는 지금 하는 일, {{before}} 는 방금까지 하던 일, {{hours}} 는 연락이 없던 시간입니다.'])],
  sched: [['modes.pToday', '오늘 일정 안내', SCHED_CTX, '{{day}} · {{schedule}} · {{now}} 가 채워집니다. 일정이 있는 캐릭터에게만 들어갑니다.'], ['modes.pUserStatus', '내 상태를 알리는 한 줄', USER_STATUS, '{{status}} 에 내 상태가 들어갑니다.'], ['modes.schedPrompt', '일정을 짤 때의 지시문', SCHEDULE_PROMPT, '{{char}} · {{description}} · {{guide}} · {{scope}} · {{shape}} 가 채워집니다. JSON 형식은 바꾸지 마세요.']],
  group: [['modes.pChime', '그룹에서 끼어들 때', P_CHIME, '{{from}} 에 방금 말한 캐릭터의 이름이 들어갑니다.']],
};
const get = (path: string, dflt: string): string => { const v = path.split('.').reduce<unknown>((o, k) => (o as Bag | undefined)?.[k], SS().settings); return String(v || '').trim() ? v as string : dflt; };

// ════════ 설정 기본값 (core 를 고치지 않고 읽는 쪽에서 채운다) ════════
export const MODE_DEFAULTS: Bag = { userStatus: 'online', userActivity: '', userIdleMin: 10, delayOnline: '0', delayIdle: '4-10', delayDnd: '9-18', delayNamed: 30, offlineWake: true, chime: false, chimeChance: 35, chimeMax: 2, chimeDaily: 20, sched: true, motives: true, longHours: 18, showWhy: true };
export const TRACK_DEFAULTS: Bag = { cast: false, castFields: '기분: 지금 감정 한 줄\n옷차림: 지금 입고 있는 옷\n속마음: 입 밖에 내지 않은 생각 한 줄', castOthers: true, castMax: 6 };
/** 대화 모드 설정 값 (없으면 기본값) */
export const mo = (k: string): unknown => SS().settings.modes?.[k] ?? MODE_DEFAULTS[k];
export const tk = (k: string): unknown => SS().settings.tracker?.[k] ?? TRACK_DEFAULTS[k];
/** 선톡 종류별 쿨다운(시간) */
export const cdHours = () => Object.fromEntries(Object.entries(MOTIVES).map(([k, v]) => [k, +((SS().settings.modes?.cd?.[k] ?? v[1]) as number)]));
export function ensureDefaults() {
  const st = SS().settings, M = st.modes ||= {}, T = st.tracker ||= {};
  for (const [k, v] of Object.entries(MODE_DEFAULTS)) M[k] ??= v;
  for (const [k, v] of Object.entries(TRACK_DEFAULTS)) T[k] ??= v;
  const cd = M.cd ||= {}; for (const k of MOTIVE_ORDER) cd[k] ??= MOTIVES[k][1];
  M.pm ||= {};
}
/** 지금 시각이 "연락하지 않는 시간대" 안인가 */
export const inQuietHours = (d = new Date()) => quietLeft(SS().settings.modes?.quietFrom, SS().settings.modes?.quietTo, d) > 0;
const clock = (t: number) => { const d = new Date(t), n = new Date(), days = Math.round((+new Date(d.getFullYear(), d.getMonth(), d.getDate()) - +new Date(n.getFullYear(), n.getMonth(), n.getDate())) / 86400000); return `${days === 0 ? '오늘' : days === 1 ? '내일' : days === -1 ? '어제' : `${d.getMonth() + 1}/${d.getDate()}`} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; };
const span = (ms: number) => { const m = Math.max(1, Math.round(ms / 60000)); return m < 60 ? `${m}분` : m < 1440 ? `${Math.floor(m / 60)}시간${m % 60 ? ` ${m % 60}분` : ''}` : `${Math.floor(m / 1440)}일${Math.floor(m % 1440 / 60) ? ` ${Math.floor(m % 1440 / 60)}시간` : ''}`; };

export interface Pending { kind: string; about?: string; hours?: number | string; from?: string; activity?: string; before?: string; [k: string]: unknown }
export interface Extracted { text: string; scene: Record<string, string> | null; sceneEnd: Record<string, string> | null; later: Record<string, string>[]; stats: Record<string, string> | null; patch: Patch | null }
type Mx = (t: string) => string;

let lastInput = Date.now(), lastUser = '';
export const Live = {
  trackPrompt: () => get('tracker.callPrompt', TRACK_CALL),
  /** 이 생성에만 덧붙일 사정 (약속한 연락, 선톡 동기, 끼어들기) */
  pending: null as Pending | null,
  /** 대화 화면이 채워 주는 연결 고리 */
  onChange: null as (() => void) | null, onUser: null as ((s: string) => void) | null, planOf: null as ((chat: LiveChat) => unknown) | null, poke: null as ((chat: LiveChat) => unknown) | null,
  view: null as { chat: string; i: number } | null, unseen: 0,
  /** 화면 쪽이 채우는 창들 (옛 live.js 에서는 여기서 그렸다) */
  hud: null as ((chat: LiveChat, opt?: Bag) => unknown) | null, editState: null as ((chat: LiveChat, opt?: Bag) => unknown) | null, settings: null as ((tab?: string, chat?: LiveChat) => unknown) | null,
  clock, span,
  trackCall: null as unknown as (chat: LiveChat, chars: { name: string }[], mx?: Mx) => { system: string; prev: Bag; any: boolean },
  readCall: null as unknown as (text: unknown) => Patch | null,

  // ──── 상태: 캐릭터 ────
  /** 지금 이 캐릭터의 상태. 임시로 바꾼 상태([status: …] · 직접 고름)가 살아 있으면 그것, 아니면 일정, 아니면 온라인 */
  presence(chat: LiveChat | null | undefined, ch: LiveChar | null | undefined) {
    const o = chat?.presenceBy?.[ch?.id as string] || chat?.presence, sched = scheduleOf(ch), B = sched ? blockAt(sched) : null;
    const alive = o && (STATUS as Record<string, string>)[o.status] && !(o.until && o.until < now()) && (o.until || o.hold || !sched) && !(o.status === 'online' && !o.activity && !o.until && !o.hold);
    if (alive) return { status: o.status, activity: o.activity || '', until: o.until || 0, from: 'override', block: B?.cur || null };
    if (B?.cur) return { status: B.cur.status as string, activity: B.cur.activity || '', until: now() + B.left * 60000, from: 'schedule', block: B.cur };
    return { status: 'online', activity: '', until: 0, from: '', block: null };
  },
  /** 상태를 임시로 바꾼다. 기간이 없으면 일정의 지금 칸이 끝날 때까지 (일정이 없으면 계속) */
  setPresence(chat: LiveChat, ch: LiveChar | null | undefined, { status, activity = '', durMs = 0, hold = false }: { status: string; activity?: string; durMs?: number; hold?: boolean }) {
    const sched = scheduleOf(ch), B = sched ? blockAt(sched) : null;
    const p: PresenceRec = { status: (STATUS as Record<string, string>)[status] ? status : 'online', activity: String(activity || '').slice(0, 80), until: durMs > 0 ? now() + durMs : hold ? 0 : B?.cur ? now() + Math.max(1, B.left) * 60000 : 0, ...(hold ? { hold: true } : {}) };
    if ((chat.charIds || []).length > 1 && ch?.id) (chat.presenceBy ||= {})[ch.id] = p; else chat.presence = p;
    return p;
  },
  clearPresence(chat: LiveChat, ch?: LiveChar | null) { if (chat.presenceBy && ch?.id) delete chat.presenceBy[ch.id]; if ((chat.charIds || []).length <= 1 || !ch) chat.presence = { status: 'online', activity: '', until: 0 }; },
  // ──── 상태: 사용자 ────
  /** 내 상태. 온라인으로 두었어도 한동안 입력이 없으면 자리 비움으로 본다 */
  userStatus() {
    const manual = USER_ST[mo('userStatus') as string] ? mo('userStatus') as string : 'online', idle = +(mo('userIdleMin') as number) || 0;
    if (manual === 'online' && idle > 0 && Date.now() - lastInput > idle * 60000) return { status: 'idle', auto: true, label: USER_ST.idle };
    return { status: manual, auto: false, label: USER_ST[manual] };
  },
  setUserStatus(status: string) { (SS().settings.modes ||= {}).userStatus = USER_ST[status] ? status : 'online'; lastInput = Date.now(); SS().set({}); watchUser(); },
  userStatuses: USER_ST,
  /** 무엇이든 입력이 있었다 */
  touch() { lastInput = Date.now(); if (lastUser === 'idle') watchUser(); },

  // ──── 상태창: 항목 ────
  /** 장면 항목: "이름 (0-100): 설명" 형식이면 막대로 보여 준다 */
  fields(ctxMacro: Mx = t => t) { return parseFields(ctxMacro(SS().settings.tracker?.fields || '')); },
  /** 인물 카드 항목 (꺼져 있으면 빈 목록) */
  castFields(ctxMacro: Mx = t => t) { return tk('cast') ? parseFields(ctxMacro(tk('castFields') as string)) : []; },
  state: (chat: LiveChat): TrackState => ({ w: chat.tracker || {}, c: chat.cast || {} }),
  /** 모델 답변에서 드림랜드 태그를 걷어 내고 따로 돌려준다 */
  extract(text: unknown): Extracted {
    const out: Extracted = { text: String(text || ''), scene: null, sceneEnd: null, later: [], stats: null, patch: null };
    const castKeys = tk('cast') ? this.castFields().map(f => f.key) : null;
    out.text = out.text.replace(/<state>([\s\S]*?)(?:<\/state>|$)/gi, (_, body: string) => { const p = parseState(body, { castKeys }); if (Object.keys(p.w).length || Object.keys(p.c).length || p.gone.length) { out.patch = out.patch ? { w: { ...out.patch.w, ...p.w }, c: { ...out.patch.c, ...p.c }, gone: [...out.patch.gone, ...p.gone] } : p; out.stats = out.patch.w; } return ''; });
    out.text = out.text.replace(/^[ \t]*\[(scene_end|scene|later)\s*:?\s*([^\]\n]*)\][ \t]*$/gim, (_, name: string, a: string) => { const o = args(a), n = name.toLowerCase(); if (n === 'scene') out.scene = o; else if (n === 'scene_end') out.sceneEnd = o; else if (parseDur(o.in)) out.later.push(o); return ''; })
      .replace(/\[(scene_end|scene|later)\s*:[^\]\n]*\]/gi, '').replace(/\n{3,}/g, '\n\n').trim();
    return out;
  },
  /** 바뀐 것만 든 patch({w, c, gone})를 반영하고, 무엇이 얼마나 바뀌었는지 기록한다 */
  apply(chat: LiveChat, patch: Partial<Patch> | null | undefined, { names, mx }: { names?: string[]; mx?: Mx } = {}) {
    if (!patch) return false;
    const f = this.fields(mx), cf = this.castFields(mx), ranges: Record<string, Field> = {};
    for (const x of f) if (x.max != null) ranges[x.key] = x; for (const x of cf) if (x.max != null) ranges['@' + x.key] = x;
    const r = mergeState(this.state(chat), tk('cast') ? patch : { w: patch.w } as Partial<Patch>, { keys: f.length ? f.map(x => x.key) : undefined, castKeys: cf.map(x => x.key), ranges, locks: chat.trackLock || {}, allow: names, others: tk('castOthers') !== false, maxCast: +(tk('castMax') as number) || 6 });
    if (!r.changed) return false;
    const at = now();
    chat.trackDiff = Object.fromEntries(Object.entries(r.diff.w).map(([k, d]) => [k, { ...d, at }]));
    chat.castDiff = Object.fromEntries(Object.entries(r.diff.c).map(([k, d]) => [k, { ...d, at }]));
    chat.tracker = r.w; chat.cast = r.c; (chat.trackLog ||= []).push({ t: at, v: r.w }); if (chat.trackLog.length > 40) chat.trackLog.shift();
    this.view = null;
    return true;
  },
  /** 예전 이름 (장면 항목만) */
  applyStats(chat: LiveChat, stats: Record<string, string> | null | undefined) { return this.apply(chat, stats ? { w: stats } : null); },

  // ──── 상태창: 스냅샷 ────
  /** 되감기의 바닥: 첫 스냅샷을 찍기 전의 상태를 기억해 둔다 */
  arm(chat: LiveChat) { if (!chat.snaps) { chat.snap0 = copyState(this.state(chat)); chat.snaps = 1; } },
  /** 지금 상태를 이 메시지(지금 스와이프)에 찍는다 */
  stamp(chat: LiveChat, m: LiveMsg | null | undefined) { const sw = m?.swipes?.[m.sw]; if (!sw || m!.role !== 'assistant') return false; this.arm(chat); sw.state = copyState(this.state(chat)); return true; },
  /** upto 번째 메시지 앞까지에서 가장 최근 상태로 되감는다. 바뀌었으면 true */
  rewind(chat: LiveChat | null | undefined, msgs: LiveMsg[], upto = msgs.length) {
    if (!chat?.snaps || !SS().settings.tracker?.enabled) return false;
    const hit = stateAt(msgs, upto), cur = this.state(chat), next = rewound(cur, hit ? hit.state : copyState(chat.snap0), chat.trackLock || {});
    if (JSON.stringify(next) === JSON.stringify(copyState(cur))) return false;
    chat.tracker = next.w; chat.cast = next.c; chat.trackDiff = {}; chat.castDiff = {}; this.view = null;
    return true;
  },
  /** 손으로 고친 값: 'w:항목' 또는 'c:이름:항목' */
  setValue(chat: LiveChat, key: string, value: unknown) {
    const v = String(value ?? '').trim();
    if (key.startsWith('w:')) { (chat.tracker ||= {})[key.slice(2)] = v; }
    else { const [, name, f] = key.match(/^c:(.*):([^:]*)$/) || []; if (!name) return; ((chat.cast ||= {})[name] ||= {})[f] = v; }
  },
  toggle(chat: LiveChat, bag: 'trackLock' | 'trackHide' | string, key: string) { const o = (chat[bag] ||= {}) as Record<string, boolean>; if (o[key]) delete o[key]; else o[key] = true; return !!o[key]; },

  /** 화면을 안 보고 있을 때 도착한 연락: 탭 제목과 (허락했다면) 알림으로 알린다 */
  ping(name: string, text: unknown) {
    if (!document.hidden) return;
    Live.unseen = (Live.unseen || 0) + 1; document.title = `(${Live.unseen}) ${name} — Dreamland`;
    if (SS().settings.modes?.notify && 'Notification' in window && Notification.permission === 'granted') { try { new Notification(name, { body: String(text).split('\n')[0].slice(0, 120), tag: 'dreamland' }); } catch { } }
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
const fill = (t: string, map: Record<string, unknown>) => Object.entries(map).reduce((s, [k, v]) => s.split(`{{${k}}}`).join(String(v ?? '')), t);
interface Piece { where: 'end' | 'depth'; depth?: number; order?: number; src: string; content: string }
interface PromptInfo { chat: LiveChat; char?: LiveChar; chars?: LiveChar[]; ctx?: { char?: string; user?: string }; type?: string }
/** 옛 X.prompt 에 거는 함수 (밖에서 시험할 수 있게 이름을 붙여 둔다) */
const promptFn = ({ chat, char, chars = [], ctx, type }: PromptInfo): Piece[] => {
  const M = SS().settings.modes || {}, T = SS().settings.tracker || {}, out: Piece[] = [];
  const mx = (t: string) => String(t).replace(/\{\{char\}\}/g, ctx?.char || 'the character').replace(/\{\{user\}\}/g, ctx?.user || 'the user');
  const talk = chat.mode === 'talk', scene = chat.scene?.on && (talk || chat.sceneLive);   // 장면 안내는 대화 모드에서 연 장면에만 (RP 로 바꿔 보는 동안에는 싣지 않는다)
  if (type === 'impersonate') return out;
  if (scene) out.push({ where: 'end', src: '장면 안내', content: mx(get('modes.sceneRules', SCENE_RULES)).replace('{{title}}', chat.scene!.title || 'untitled').replace('{{place}}', chat.scene!.place ? ` at ${chat.scene!.place}` : '') });
  else if (talk) {
    // 오늘 일정과 서로의 상태
    const lines: string[] = [], sched = scheduleOf(char), date = Clock.now(chat);
    if (sched) {
      const B = blockAt(sched, date), p = Live.presence(chat, char), nowMin = date.getHours() * 60 + date.getMinutes();
      const sayNow = B.cur ? `${B.cur.activity || STATUS_EN[B.cur.status]} (${STATUS_EN[B.cur.status]}) until ${fmtMin((nowMin + B.left) % 1440)}${B.next ? `; after that: ${B.next.activity || STATUS_EN[B.next.status]}` : ''}${p.from === 'override' ? `. For the moment you changed your own status to ${(STATUS_EN as Record<string, string>)[p.status]}${p.activity ? ` (${p.activity})` : ''}` : ''}` : 'nothing planned';
      lines.push(fill(mx(get('modes.pToday', SCHED_CTX)), { day: DAY_EN[dayIndex(date)], schedule: todayLine(sched, date) || 'nothing planned', now: sayNow }));
    }
    const others = chars.filter(c => c.id !== char?.id).map(c => { const p = Live.presence(chat, c); return p.from ? `${c.name} — ${(STATUS_EN as Record<string, string>)[p.status]}${p.activity ? ` (${p.activity})` : ''}` : ''; }).filter(Boolean);
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
  else if (p?.kind === 'away') out.push({ where: 'end', src: '자리를 비운 사이', content: mx(get('modes.pAway', P_AWAY)).replace('{{hours}}', p.hours as string) });
  else if (p?.kind === 'unread') out.push({ where: 'end', src: '읽지 않음', content: mx(get('modes.pUnread', P_UNREAD)) });
  else if (p?.kind === 'ghosted') out.push({ where: 'end', src: '읽고 답 없음', content: mx(get('modes.pGhosted', P_GHOSTED)) });
  else if (p?.kind === 'chime') out.push({ where: 'end', src: '끼어들기', content: fill(mx(get('modes.pChime', P_CHIME)), { from: p.from || 'someone' }) });
  else if (p?.kind && P_MOTIVE[p.kind]) out.push({ where: 'end', src: `말 거는 이유: ${motiveLabel(p.kind)}`, content: fill(mx(get(`modes.pm.${p.kind}`, P_MOTIVE[p.kind])), { activity: p.activity || 'a short break', before: p.before || 'what you were doing', hours: p.hours || 1 }) });

  // 상태창
  if (T.enabled) {
    const f = Live.fields(mx), cf = Live.castFields(mx), lock = chat.trackLock || {}, w = chat.tracker || {}, c = chat.cast || {};
    const names = [...new Set([...chars.map(x => x.name), ...Object.keys(c)])];
    const cards = () => names.map(n => `${n} — ${cf.map(x => `${x.key}: ${c[n]?.[x.key] || '(not set yet)'}${lock[`c:${n}:${x.key}`] ? ' (locked)' : ''}`).join(' | ')}`).join('\n');
    const fieldList = (list: Field[]) => list.map(x => `- ${x.key}${x.max != null ? ` (a number from ${x.min} to ${x.max})` : ''}${x.desc ? `: ${x.desc}` : ''}`).join('\n');
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
      const parts: string[] = [];
      if (talk && !scene && Object.keys(w).length) parts.push('[Current state]\n' + Object.entries(w).map(([k, v]) => `${k}: ${v}`).join('\n'));
      if (cf.length && Object.keys(c).length) parts.push('[People right now]\n' + Object.entries(c).map(([n, o]) => `${n} — ${cf.map(x => o[x.key] ? `${x.key}: ${o[x.key]}` : '').filter(Boolean).join(' | ')}`).filter(l => !l.endsWith('— ')).join('\n'));
      if (parts.length) out.push(talk && !scene ? { where: 'end', src: '지금 상태', content: parts.join('\n\n') } : { where: 'depth', depth: 1, order: 51, src: '인물 카드', content: parts.join('\n\n') });
    }
  }
  return out;
};
(X as unknown as { prompt: { owner: string; fn: (info: PromptInfo) => Piece[] }[] }).prompt.push({ owner: 'live', fn: promptFn });
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
  let j: Bag; try { j = JSON.parse(m[0].replace(/,\s*([\]}])/g, '$1')) as Bag; } catch { return null; }
  const { cast, gone, ...w } = j, c: Record<string, Record<string, string>> = {};
  if (cast && typeof cast === 'object') for (const [n, o] of Object.entries(cast as Bag)) if (o && typeof o === 'object') c[n] = Object.fromEntries(Object.entries(o as Bag).map(([k, v]) => [k, String(v ?? '')]));
  return { w: Object.fromEntries(Object.entries(w).filter(([, v]) => v != null && typeof v !== 'object').map(([k, v]) => [k.replace(/\s*\(locked\)$/, ''), String(v)])), c, gone: Array.isArray(gone) ? gone.map(String) : [] };
};
// 알림을 켜면 그 자리에서 브라우저 허락을 받는다
on('settings', () => { if (SS().settings.modes?.notify && 'Notification' in window && Notification.permission === 'default') Notification.requestPermission().catch(() => { }); });
export const newLater = (o: { in?: string; about?: string }) => ({ id: uid(), at: now() + parseDur(o.in), about: o.about || '', made: now() });
