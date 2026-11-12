// ── Dreamland schedule: 캐릭터 주간 일정 · 선톡 동기 · 연락 계획 ── (옛 js/f-schedule.js 의 로직, 동작 그대로)
// 순수 계산은 src/schedule/logic.ts 와 한 글자도 다르지 않다 (그쪽은 옛 clock 다리를, 이쪽은 ./clock 을 쓴다). 화면(주간 띠 · 편집기 · 기능 탭)은 src/schedule/ 에 있다.
import { S, now, debounce } from './core';
import { quickCall } from './engine';
import { Clock } from './clock';
import { t } from '../i18n';

const clockDate = () => Clock.date();

export type Status = 'online' | 'idle' | 'dnd' | 'offline';
export interface Block { from: number; to: number; status: Status; activity: string }
export interface Sched { on?: boolean; days: Block[][]; guide?: string; at?: number }
type RawBlock = { from?: unknown; to?: unknown; status?: unknown; activity?: unknown };

/** 한국어 요일 이름 (모델 답을 읽을 때 쓰는 식별자. 화면에는 dayName · dayFull) */
export const DAYS = ['월', '화', '수', '목', '금', '토', '일'];
export const DAY_EN = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
/** 화면에 쓰는 요일 이름 (월요일이 0): 짧게 · 길게 */
export const dayName = (i: number) => t(`schedule.day.${i}`);
export const dayFull = (i: number) => t(`schedule.dayFull.${i}`);
/** 상태 이름 (화면용, 읽을 때마다 지금 언어로) */
export const STATUS: Record<string, string> = Object.defineProperties({} as Record<string, string>, Object.fromEntries(['online', 'idle', 'dnd', 'offline'].map(k => [k, { enumerable: true, get: () => t(`schedule.status.${k}`) }])));
export const STATUS_EN: Record<Status, string> = { online: 'online', idle: 'idle / half-available', dnd: 'busy / do not disturb', offline: 'offline' };
export const DAY = 1440, WEEK = 10080, FREE = '자유 시간';
const isStatus = (v: unknown): v is Status => typeof v === 'string' && Object.prototype.hasOwnProperty.call(STATUS, v);
/** 월요일이 0 */
export const dayIndex = (d: Date) => (d.getDay() + 6) % 7;
/** "7:30", "07:30", "0730", "24:00" → 분 (못 읽으면 null) */
export const toMin = (s: unknown): number | null => { const m = String(s ?? '').trim().match(/^(\d{1,2})\s*[:：시.]?\s*(\d{2})?/); if (!m) return null; const v = +m[1] * 60 + +(m[2] || 0); return v >= 0 && v <= DAY && +(m[2] || 0) < 60 ? v : null; };
export const fmtMin = (n: number) => n >= DAY ? '24:00' : `${String(Math.floor(n / 60)).padStart(2, '0')}:${String(n % 60).padStart(2, '0')}`;
const KEYWORDS: [Status, RegExp][] = [
  ['offline', /sleep|asleep|nap|passed out|잠|수면|취침|낮잠|자는|기절/i],
  ['dnd', /work|class|school|lecture|stud(y|ying)|meeting|training|practice|exam|shift|gym|rehears|on duty|근무|업무|회사|수업|강의|공부|회의|훈련|연습|시험|알바|아르바이트|촬영|수술|진료|순찰|임무|작업|일하는/i],
  ['idle', /commut|driv|travel|shower|bath|cook|eat|meal|breakfast|lunch|dinner|brunch|getting ready|routine|출근|퇴근|통학|등교|하교|이동|샤워|목욕|씻|요리|식사|아침|점심|저녁|밥|준비|장보/i],
];
export const inferStatus = (activity: unknown): Status => { for (const [st, re] of KEYWORDS) if (re.test(String(activity || ''))) return st; return 'online'; };
export const MEAL_RE = /eat|meal|breakfast|lunch|dinner|brunch|snack|식사|아침 ?(밥|식)|점심|저녁|밥|간식|야식|브런치|도시락/i;
const clean = (b: RawBlock): Block => ({ from: Math.max(0, Math.min(DAY, Math.round(+(b.from as number) || 0))), to: Math.max(0, Math.min(DAY, Math.round(+(b.to as number) || 0))), status: isStatus(b.status) ? b.status : inferStatus(b.activity), activity: String(b.activity ?? '').replace(/\s+/g, ' ').trim().slice(0, 60) });
/** 하루치 블록을 빈틈·겹침 없이 00:00~24:00 로 맞춘다. fill 은 빈틈에 먼저 깔 블록(전날에서 넘어온 밤샘 등). 아무것도 없으면 [] */
export function normDay(blocks: RawBlock[] = [], fill: RawBlock[] = []): Block[] {
  const own = blocks.map(clean).filter(b => b.to > b.from).sort((a, b) => a.from - b.from), low = fill.map(clean).filter(b => b.to > b.from).sort((a, b) => a.from - b.from);
  if (!own.length && !low.length) return [];
  const out: Block[] = []; let at = 0;
  const gap = (a: number, b: number) => { let p = a; for (const f of low) { if (f.to <= p || f.from >= b) continue; if (f.from > p) out.push({ from: p, to: f.from, status: 'online', activity: FREE }); out.push({ ...f, from: Math.max(p, f.from), to: Math.min(b, f.to) }); p = Math.min(b, f.to); } if (p < b) out.push({ from: p, to: b, status: 'online', activity: FREE }); };
  for (const b of own) { if (b.to <= at) continue; if (b.from > at) gap(at, b.from); out.push({ ...b, from: Math.max(at, b.from) }); at = b.to; }
  if (at < DAY) gap(at, DAY);
  const merged: Block[] = [];
  for (const b of out) { const p = merged[merged.length - 1]; if (p && p.status === b.status && p.activity === b.activity && p.to === b.from) p.to = b.to; else merged.push({ ...b }); }
  return merged;
}
/** 저장된 일정을 안전한 모양으로 (요일 7칸, 각 칸은 정리된 블록) */
export const normWeek = (days?: unknown): Block[][] => Array.from({ length: 7 }, (_, i) => { const d = (days as unknown[] | undefined)?.[i]; return normDay(Array.isArray(d) ? d as RawBlock[] : []); });
export const hasBlocks = (sched?: Sched | null) => !!sched?.days?.some(d => d?.length);
/** 일주일을 하나의 고리로 편다: 같은 상태·활동이 자정을 넘어 이어지면 한 블록으로 본다 */
export function ring(sched?: Sched | null): Block[] {
  const out: Block[] = [];
  (sched?.days || []).forEach((day, i) => { for (const b of day || []) { const p = out[out.length - 1], from = i * DAY + b.from, to = i * DAY + b.to; if (p && p.to === from && p.status === b.status && p.activity === b.activity) p.to = to; else out.push({ from, to, status: b.status, activity: b.activity }); } });
  if (out.length > 1) { const a = out[0], z = out[out.length - 1]; if (a.from === 0 && z.to === WEEK && a.status === z.status && a.activity === z.activity) { z.to = WEEK + a.to; out.shift(); } }
  return out;
}
export interface At { cur: Block | null; prev: Block | null; next: Block | null; since: number; left: number }
/** 지금 시각의 블록과 앞뒤 블록. since/left 는 이 블록이 시작된 지·끝나기까지의 분 */
export function blockAt(sched?: Sched | null, date: Date = clockDate()): At {
  const R = ring(sched), none: At = { cur: null, prev: null, next: null, since: 0, left: 0 }; if (!R.length) return none;
  const m = dayIndex(date) * DAY + date.getHours() * 60 + date.getMinutes();
  const i = R.findIndex(b => (b.from <= m && m < b.to) || (b.from <= m + WEEK && m + WEEK < b.to)); if (i < 0) return none;
  const cur = R[i], at = cur.from <= m && m < cur.to ? m : m + WEEK;
  if (R.length === 1) return { cur, prev: null, next: null, since: at - cur.from, left: cur.to - at };
  const p = R[(i - 1 + R.length) % R.length], n = R[(i + 1) % R.length];
  const touch = (a: Block, b: Block) => a.to % WEEK === b.from % WEEK;
  return { cur, prev: touch(p, cur) ? p : null, next: touch(cur, n) ? n : null, since: at - cur.from, left: cur.to - at };
}
/** 오프라인이 풀릴 때까지 남은 분 (지금 오프라인이 아니거나 일정이 없으면 0, 내내 오프라인이면 Infinity) */
export function wakeIn(sched?: Sched | null, date: Date = clockDate()): number {
  const R = ring(sched); if (!R.length) return 0;
  const B = blockAt(sched, date), c = B.cur; if (!c || c.status !== 'offline') return 0;
  const i = Math.max(0, R.findIndex(b => b.from === c.from && b.to === c.to)); let mins = B.left;
  for (let k = 1; k < R.length; k++) { const b = R[(i + k) % R.length]; if (b.status !== 'offline') return mins; mins += b.to - b.from; }
  return Infinity;
}
/** 프롬프트에 넣을 오늘 일정 한 줄 */
export const todayLine = (sched?: Sched | null, date: Date = clockDate()) => (sched?.days?.[dayIndex(date)] || []).map(b => `${fmtMin(b.from)}-${fmtMin(b.to)} ${b.activity || STATUS_EN[b.status]} (${b.status})`).join('; ');

/** 모델이 돌려준 일정 JSON 을 읽는다. { days: [7칸], found: 읽힌 요일 수 } */
export function parseSchedule(text: unknown): { days: Block[][]; found: number } {
  let s = String(text || '').trim(); const fence = s.match(/```(?:json)?\s*([\s\S]*?)```/i); if (fence) s = fence[1].trim();
  const a = s.indexOf('{'), z = s.lastIndexOf('}'); if (a < 0 || z <= a) throw new Error(t('schedule.err.noJson'));
  s = s.slice(a, z + 1).replace(/,\s*([\]}])/g, '$1');
  let j: Record<string, unknown>; try { j = JSON.parse(s) as Record<string, unknown>; } catch { throw new Error(t('schedule.err.badJson')); }
  const src = (j.days && typeof j.days === 'object' ? j.days : j) as Record<string, unknown>, raw: RawBlock[][] = Array.from({ length: 7 }, () => []), carry: RawBlock[][] = Array.from({ length: 7 }, () => []);
  const key = (k: string) => { const t = String(k).trim().toLowerCase(); let i = DAY_EN.findIndex(d => t.startsWith(d.toLowerCase().slice(0, 3))); if (i < 0) i = DAYS.findIndex(d => t.startsWith(d)); if (i < 0 && /^[0-6]$/.test(t) && Array.isArray(src)) i = +t; return i; };
  let found = 0;
  for (const [k, list] of Object.entries(src)) {
    const i = key(k); if (i < 0 || !Array.isArray(list)) continue; found++;
    for (const b of list as ({ time?: unknown; from?: unknown; to?: unknown; activity?: unknown; what?: unknown; status?: unknown } | null)[]) {
      const t = String(b?.time ?? `${b?.from ?? ''}-${b?.to ?? ''}`).split(/\s*[-~–—]\s*/), from = toMin(t[0]); let to = toMin(t[1]);
      const activity = String(b?.activity ?? b?.what ?? '').trim(); if (from == null || to == null) continue;
      const blk = { status: isStatus(b?.status) ? b.status : inferStatus(activity), activity };
      if (to === 0 && from > 0) to = DAY;
      if (to > from) raw[i].push({ ...blk, from, to });
      else if (to < from) { raw[i].push({ ...blk, from, to: DAY }); if (to > 0) carry[(i + 1) % 7].push({ ...blk, from: 0, to }); }   // 자정을 넘기는 블록은 둘로 나눈다
    }
  }
  if (!found) throw new Error(t('schedule.err.noDays'));
  return { days: raw.map((d, i) => normDay(d, d.length ? carry[i] : [])), found };
}

// ── 선톡 동기 ──
/** 종류: [이름, 기본 쿨다운(시간), 설명] */
const MOTIVE_HOURS: Record<string, number> = { later: 0, away: 0, back: 4, longAbsence: 36, morning: 20, night: 20, afterBusy: 3, meal: 3, transition: 2, unread: 0, ghosted: 0, checkin: 0, chime: 0 };
/** 이름 · 설명은 읽을 때마다 지금 언어로 (schedule.motive.<종류>.name / .desc) */
export const MOTIVES: Record<string, [string, number, string]> = Object.defineProperties({} as Record<string, [string, number, string]>, Object.fromEntries(Object.entries(MOTIVE_HOURS).map(([k, h]) => [k, { enumerable: true, get: (): [string, number, string] => [t(`schedule.motive.${k}.name`), h, t(`schedule.motive.${k}.desc`)] }])));
export const motiveLabel = (k: string) => MOTIVES[k]?.[0] || '';
/** 일정과 시각에서 고르는 순서 */
export const MOTIVE_ORDER = ['longAbsence', 'back', 'morning', 'night', 'afterBusy', 'meal', 'transition'] as const;
type Kind = typeof MOTIVE_ORDER[number];
export const cooldownLeft = (kind: string, cd: Record<string, number> = {}, hours: Record<string, number> = {}, nowTs = Date.now()) => { const hrs = +(hours[kind] ?? MOTIVES[kind]?.[1] ?? 0); return hrs > 0 && cd[kind] ? Math.max(0, cd[kind] + hrs * 3600000 - nowTs) : 0; };
export interface MotiveEnv {
  sched?: Sched | null; now?: Date; realNow?: number; lastUserAt: number; lastRole: 'user' | 'assistant' | ''; seen?: boolean; readReact?: boolean; owed?: unknown;
  cd?: Record<string, number>; hours?: Record<string, number>; off?: Record<string, boolean>; longHours?: number; use?: boolean;
}
/**
 * 지금 말을 건다면 그 이유.
 * → { kind, activity, before, hours, skipped: [쿨다운으로 건너뛴 종류] }
 */
export function pickMotive(env: MotiveEnv) {
  const date = env.now || clockDate(), hr = date.getHours(), mins = hr * 60 + date.getMinutes();
  const sched = hasBlocks(env.sched) ? env.sched : null, B: At = sched ? blockAt(sched, date) : { cur: null, prev: null, next: null, since: 0, left: 0 };
  const { cur, prev, next } = B, avail = !!cur && cur.status !== 'offline', unanswered = env.lastRole === 'user';
  const real = env.realNow || Date.now();
  const quietH = env.lastUserAt ? Math.max(0, real - env.lastUserAt) / 3600000 : 0;
  const hit: Record<Kind, boolean> = {
    longAbsence: !unanswered && env.lastUserAt > 0 && quietH >= (+(env.longHours ?? 0) || 18),
    back: unanswered && (!!env.owed || (!!prev && (prev.status === 'offline' || prev.status === 'dnd') && avail && cur!.status !== 'dnd' && B.since <= 120 && env.lastUserAt <= real - B.since * 60000)),   // 내 말이 그 바쁜 시간 안에 온 것이어야 한다
    morning: sched ? (!!prev && prev.status === 'offline' && avail && B.since <= 120 && hr >= 4 && hr < 13) : (hr >= 6 && hr < 10),
    night: sched ? (avail && !!next && next.status === 'offline' && next.to - next.from >= 240 && B.left <= 90) : (mins >= 22 * 60 || mins < 60),
    afterBusy: !!prev && prev.status === 'dnd' && !!cur && (cur.status === 'online' || cur.status === 'idle') && B.since <= 60,
    meal: sched ? (avail && cur!.status !== 'dnd' && MEAL_RE.test(cur!.activity) && cur!.to - cur!.from <= 120) : ((mins >= 690 && mins < 810) || (mins >= 1080 && mins < 1200)),
    transition: !!prev && avail && prev.status !== cur!.status && B.since <= 30,
  };
  const info = (kind: string) => ({ kind, activity: cur?.activity || '', before: prev?.activity || '', hours: Math.max(1, Math.round(quietH)) }), skipped: string[] = [];
  if (env.use !== false) for (const k of MOTIVE_ORDER) {
    if (!hit[k] || env.off?.[k]) continue;
    if (cooldownLeft(k, env.cd, env.hours, real) > 0) { skipped.push(k); continue; }
    return { ...info(k), skipped };
  }
  if (env.lastRole === 'assistant' && env.readReact !== false) return { ...info(env.seen ? 'ghosted' : 'unread'), skipped };
  return { ...info('checkin'), skipped };
}

export interface PlanEnv {
  nowTs?: number; on?: boolean; talk?: boolean; scene?: boolean; hasUser?: boolean; conn?: unknown; status?: string; wakeMs: number; count: number; cap: number; streak: number; maxStreak: number;
  minutes?: number; backoff?: number; base?: number; quietMs: number; userStatus?: string; hidden?: boolean; laterAt?: number; laterOn?: boolean; owedAt?: number;
}
/**
 * 다음 선톡이 언제인지, 무엇이 막고 있는지.
 * → { at, kind: 'later'|'owed'|'auto'|'', blocks: [막힌 이유], notes: [미뤄지는 이유] }
 */
export function planAuto(env: PlanEnv) {
  const tr = t, t0 = env.nowTs || Date.now(), blocks: string[] = [], notes: string[] = [];
  const hold = (at: number) => { let x = at; if (env.wakeMs > 0) x = Math.max(x, t0 + env.wakeMs); if (env.quietMs > 0) x = Math.max(x, t0 + env.quietMs); return x; };
  if (!env.talk) return { at: 0, kind: '', blocks: [tr('schedule.plan.notTalk')], notes };
  if (!env.conn) blocks.push(tr('schedule.plan.noConn'));
  if (env.scene) blocks.push(tr('schedule.plan.scene'));
  if (env.userStatus === 'dnd') blocks.push(tr('schedule.plan.userDnd'));
  if (env.wakeMs === Infinity) blocks.push(tr('schedule.plan.alwaysOffline'));
  const hard = blocks.length > 0;
  if (env.wakeMs > 0 && isFinite(env.wakeMs)) notes.push(tr('schedule.plan.offlineWait'));
  if (env.quietMs > 0) notes.push(tr('schedule.plan.quietWait'));
  if (env.hidden) notes.push(tr('schedule.plan.hiddenWait'));
  // 답하지 못한 내 말이 먼저, 그다음 약속, 그다음 조용할 때
  const cand: { at: number; kind: string }[] = [];
  if (env.owedAt && !hard) cand.push({ at: hold(Math.max(env.owedAt, t0)), kind: 'owed' });
  if (env.laterAt && env.laterOn !== false && !hard) cand.push({ at: hold(Math.max(env.laterAt, t0)), kind: 'later' });
  const auto: string[] = [];
  if (!env.on) auto.push(tr('schedule.plan.autoOff'));
  if (!env.hasUser) auto.push(tr('schedule.plan.noUser'));
  if (env.count >= env.cap) auto.push(tr('schedule.plan.cap', { count: env.count, cap: env.cap }));
  if (env.streak >= env.maxStreak) auto.push(tr('schedule.plan.streak', { streak: env.streak }));
  if (!auto.length && !hard) {
    const wait = (env.minutes || 10) * 60000 * Math.pow(Math.max(1, +(env.backoff ?? 0) || 2), env.streak || 0) * (env.status === 'dnd' ? 3 : 1);
    if (env.status === 'dnd') notes.push(tr('schedule.plan.busyWait'));
    cand.push({ at: hold(Math.max((env.base || t0) + wait, t0)), kind: 'auto' });
  }
  cand.sort((a, b) => a.at - b.at);
  return { at: cand[0]?.at || 0, kind: cand[0]?.kind || '', blocks: [...blocks, ...(cand.some(c => c.kind === 'auto') ? [] : auto)], notes };
}
/** "4-10" → [4, 10] 초. 하나만 적으면 고정 */
export const parseRange = (s: unknown, dflt: [number, number] = [0, 0]): [number, number] => { const m = String(s ?? '').match(/(\d+(?:\.\d+)?)(?:\s*[-~]\s*(\d+(?:\.\d+)?))?/); if (!m) return dflt; const a = +m[1], b = m[2] != null ? +m[2] : a; return [Math.min(a, b), Math.max(a, b)]; };
/** 상태에 따른 답장 지연(밀리초). named 면 이름이 불린 것이라 짧아진다 */
export function replyDelay(status: string, ranges?: Record<string, unknown> | null, { named = false, namedPct = 30, rnd = Math.random() }: { named?: boolean; namedPct?: number; rnd?: number } = {}) {
  const [a, b] = parseRange(ranges?.[status], status === 'idle' ? [4, 10] : status === 'dnd' ? [9, 18] : [0, 0]);
  return Math.round((a + (b - a) * rnd) * 1000 * (named ? Math.max(0, Math.min(100, +namedPct)) / 100 : 1));
}

// ════════ 저장 ════════
export const SCHEDULE_PROMPT = `You plan the ordinary week of a fictional character, so that texting them feels like texting someone who has a life of their own.

<character name="{{char}}">
{{description}}
</character>
{{guide}}
Write {{char}}'s routine for {{scope}}. Rules:
- Each day is a list of blocks that together cover 00:00 to 24:00 with no gaps and no overlaps. Use 24-hour "HH:MM-HH:MM" times. A block that runs past midnight is split at 00:00 into two blocks.
- 5 to 10 blocks per day. Weekdays and days off should differ the way they would for this person.
- "status" is how reachable they are by text: "online" (free, phone in hand), "idle" (half-available: meals, commuting, getting ready), "dnd" (busy: work, class, practice — replies come slowly), "offline" (asleep or truly unreachable).
- "activity" is a short phrase in the language of the character sheet (Korean if unsure), the way {{char}} would put it.
- Stay faithful to the sheet: their job or school, habits, world and era. This is a normal week, so do not invent dramatic events.

Reply with ONLY one JSON object — no markdown, no comments, no ellipsis:
{"days":{"Monday":[{"time":"00:00-07:00","status":"offline","activity":"…"},{"time":"07:00-08:00","status":"idle","activity":"…"}],"Tuesday":[]}}
{{shape}}`;
export interface SchedChar { id?: string; name: string; description?: string; personality?: string; scenario?: string; bind?: { connId?: string }; ext?: { dreamSchedule?: Sched; [k: string]: unknown }; [k: string]: unknown }
interface SApi { settings: { modes?: { sched?: boolean; schedPrompt?: string }; helpers?: { all?: string }; userNameFallback?: string }; get(coll: string, id: unknown): unknown; conn(): unknown; save(coll: string, obj: unknown, quiet?: boolean): Promise<unknown> }
const SS = () => S as unknown as SApi;
const ask = quickCall as unknown as (sys: string, user: string, o: { maxTokens: number; conn: unknown; signal?: AbortSignal }) => Promise<string>;
const modes = () => SS().settings.modes || {};
/** 캐릭터에 저장된 일정 (없으면 null). 꺼 둔 일정은 raw 로만 보인다 */
export const rawSchedule = (ch?: SchedChar | null): Sched | null => ch?.ext?.dreamSchedule || null;
export const scheduleOf = (ch?: SchedChar | null) => { const s = rawSchedule(ch); return s && s.on !== false && modes().sched !== false && hasBlocks(s) ? s : null; };
const saveChar = (debounce as unknown as (fn: (ch: SchedChar) => unknown, ms: number) => (ch: SchedChar) => void)(ch => SS().save('chars', ch, true), 350);
/** 일정 저장 (옛 파일에서는 편집기 안에서만 쓰던 것) */
export function putSchedule(ch: SchedChar, patch: Partial<Sched>): Sched {
  ch.ext ||= {}; ch.ext.dreamSchedule = { on: true, days: Array.from({ length: 7 }, () => []), guide: '', ...(ch.ext.dreamSchedule || {}), ...patch, at: now() };
  saveChar(ch); Schedule.onChange?.(ch);
  return ch.ext.dreamSchedule;
}

export const Schedule = {
  onChange: null as ((ch?: SchedChar) => void) | null,
  /** LLM 으로 일주일(또는 하루) 일정을 짠다 — 호출 1회 */
  async generate(ch: SchedChar, { guide = '', only = -1, signal }: { guide?: string; only?: number; signal?: AbortSignal } = {}): Promise<Block[][]> {
    const S = SS(), conn = S.get('conns', S.settings.helpers?.all) || S.get('conns', ch.bind?.connId) || S.conn();
    if (!conn) throw new Error(t('schedule.err.noConn'));
    const cur = rawSchedule(ch), sheet = [ch.description, ch.personality && `Personality: ${ch.personality}`, ch.scenario && `Situation: ${ch.scenario}`].filter(Boolean).join('\n').replace(/\{\{char\}\}/gi, ch.name).replace(/\{\{user\}\}/gi, S.settings.userNameFallback || 'the user').slice(0, 6000);
    const others = only >= 0 && hasBlocks(cur) ? DAY_EN.map((d, i) => i === only ? '' : `${d}: ${(cur!.days[i] || []).map(b => `${fmtMin(b.from)}-${fmtMin(b.to)} ${b.activity} (${b.status})`).join('; ') || 'unscheduled'}`).filter(Boolean).join('\n') : '';
    const sys = (String(modes().schedPrompt || '').trim() || SCHEDULE_PROMPT)
      .replace(/\{\{char\}\}/g, ch.name).replace('{{description}}', sheet || '(no description)')
      .replace('{{guide}}', guide.trim() ? `\nWhat the user wants from this routine (follow it even if it bends the usual pattern):\n${guide.trim()}\n` : '')
      .replace('{{scope}}', only >= 0 ? `${DAY_EN[only]} only` : 'all seven days, Monday to Sunday')
      .replace('{{shape}}', only >= 0 ? `Return only the "${DAY_EN[only]}" key.${others ? ` The other days, for consistency (do not rewrite them):\n${others}` : ''}` : 'Include all seven keys, Monday to Sunday, each fully filled in.');
    const out = await ask(sys, only >= 0 ? `Write ${DAY_EN[only]} now.` : 'Write the week now.', { maxTokens: only >= 0 ? 1500 : 5000, conn, signal });
    const got = parseSchedule(out);
    if (only >= 0) { if (!got.days[only].length) throw new Error(t('schedule.err.dayEmpty', { day: dayFull(only) })); const days = normWeek(cur?.days); days[only] = got.days[only]; return days; }
    if (got.days.filter(d => d.length).length < 7) throw new Error(t('schedule.err.partial', { count: got.days.filter(d => d.length).length }));
    return got.days;
  },
};
