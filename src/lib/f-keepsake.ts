// ── Dreamland keepsake: 날짜 · 달 · 월간 집계 · 약속 태그 · 장면 기념품 · 장(章) 나누기 ── (옛 js/f-keepsake.js, 동작 그대로)
// 화면도 저장소도 건드리지 않는 계산만 모아 둔 파일.

import { t, getLang, fmtDate } from '../i18n';
import type { Chat, Curtain, DayRec, Keepsake, Msg, Photo, PromiseRec, Swipe } from './types';
export type { Curtain, Keepsake, Photo };
export type KSwipe = Swipe;
export type KMsg = Msg;
export type Promise_ = PromiseRec;
export type KChat = Chat;
export type Day = DayRec;

export const pad = (n: unknown) => String(n).padStart(2, '0');
const clamp01 = (v: unknown) => Math.min(1, Math.max(0, +(v as number) || 0));

// ════════ 날짜 ════════ (모두 이 기기의 시간대 기준, 'YYYY-MM-DD' 글자로 주고받는다)
export const dayKey = (t: Date | number | string) => { const d = t instanceof Date ? t : new Date(t); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
export const monthKey = (t: Date | number | string) => dayKey(t).slice(0, 7);
/** 날짜 글자 → 그날 정오 (서머타임 경계에서 하루가 밀리지 않게) */
export const keyDate = (k: unknown) => { const [y, m, d] = String(k).split('-').map(Number); return new Date(y, (m || 1) - 1, d || 1, 12); };
export const validKey = (k: unknown): k is string => /^\d{4}-\d{2}-\d{2}$/.test(String(k)) && dayKey(keyDate(k)) === k;
export const addDays = (k: string, n: number) => { const d = keyDate(k); d.setDate(d.getDate() + n); return dayKey(d); };
export const diffDays = (a: string, b: string) => Math.round((+keyDate(b) - +keyDate(a)) / 864e5);
/** m 은 1~12 */
export const daysIn = (y: number, m: number) => new Date(y, m, 0).getDate();
export const shiftMonth = (mk: string, n: number) => { const [y, m] = mk.split('-').map(Number); const d = new Date(y, m - 1 + n, 1, 12); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`; };
export const WEEK = ['일', '월', '화', '수', '목', '금', '토'];
export const MONTHS_EN = ['JANUARY', 'FEBRUARY', 'MARCH', 'APRIL', 'MAY', 'JUNE', 'JULY', 'AUGUST', 'SEPTEMBER', 'OCTOBER', 'NOVEMBER', 'DECEMBER'];
export const koDate = (k: string, { year = true, week = true }: { year?: boolean; week?: boolean } = {}) => { const d = keyDate(k); return `${year ? d.getFullYear() + '년 ' : ''}${d.getMonth() + 1}월 ${d.getDate()}일${week ? ' ' + WEEK[d.getDay()] + '요일' : ''}`; };
/** 화면에 보이는 날짜: 한국어면 koDate 그대로, 아니면 그 언어 꼴 (koDate 는 프롬프트·저장 글에도 쓰여 한국어로 둔다) */
export const showDate = (k: string, o: { year?: boolean; week?: boolean } = {}) => getLang() === 'ko' ? koDate(k, o) : fmtDate(keyDate(k), { year: (o.year ?? true) ? 'numeric' : undefined, month: 'long', day: 'numeric', weekday: (o.week ?? true) ? 'long' : undefined });
/** 화면에 보이는 요일 짧은 이름 (WEEK 는 날짜 읽기에도 쓰여 한국어로 둔다) */
export const weekLabel = (i: number) => getLang() === 'ko' ? WEEK[i] : fmtDate(new Date(2024, 0, 7 + i, 12), { weekday: 'short' });
export const normTime = (s: unknown) => { const m = String(s || '').match(/^\s*(\d{1,2})\s*(?::|시)\s*(\d{1,2})?/); if (!m) return ''; const hh = +m[1], mm = +(m[2] || 0); return hh < 24 && mm < 60 ? `${pad(hh)}:${pad(mm)}` : ''; };

export interface Cell { key: string; d: number; dow: number; inMonth: boolean }
/** 한 달의 지면: 주(週) 단위 칸 배열. 앞뒤로 이웃 달 날짜를 채운다 */
export function monthGrid(mk: string, weekStart = 0): Cell[][] {
  const [y, m] = mk.split('-').map(Number), first = new Date(y, m - 1, 1, 12), lead = (first.getDay() - weekStart + 7) % 7, n = daysIn(y, m);
  const rows = Math.ceil((lead + n) / 7), out: Cell[][] = [];
  for (let r = 0; r < rows; r++) {
    const week: Cell[] = [];
    for (let c = 0; c < 7; c++) { const d = new Date(y, m - 1, 1 - lead + r * 7 + c, 12); week.push({ key: dayKey(d), d: d.getDate(), dow: d.getDay(), inMonth: d.getMonth() === m - 1 }); }
    out.push(week);
  }
  return out;
}

// ════════ 달 ════════
export const SYNODIC = 29.530588853;
export const PHASES = ['삭', '초승달', '상현달', '차오르는 달', '보름달', '기우는 달', '하현달', '그믐달'];
/** 실제 달의 위상 0~1 (0 삭, .5 보름) — ui.js 의 moonPhase 와 같은 식 */
export const phaseAt = (date: Date | number = new Date()) => (((+date - Date.UTC(2000, 0, 6, 18, 14)) / 864e5 / SYNODIC) % 1 + 1) % 1;
export const phaseIndex = (p: number) => Math.round(p * 8) % 8;
export const phaseName = (p: number) => PHASES[phaseIndex(p)];
/** 화면에 보이는 달 이름 (PHASES 는 저장값이라 한국어로 둔다) */
export const phaseLabel = (p: number) => t('keepsake.phase.' + phaseIndex(p));
/** 저장된 한국어 달 이름 → 화면 글 (모르는 이름은 그대로) */
export const phaseNameLabel = (name: string) => { const i = PHASES.indexOf(name); return i < 0 ? name : t('keepsake.phase.' + i); };
/** 밝은 부분의 넓이(0~1) → 차오르는 쪽의 위상(0~.5) */
export const fillToPhase = (f: unknown) => Math.acos(1 - 2 * clamp01(f)) / (2 * Math.PI);
/** 위상 p 일 때 밝은 부분의 넓이 */
export const litOf = (p: number) => (1 - Math.cos(2 * Math.PI * p)) / 2;
/** 밝은 부분의 SVG 경로 (중심 cx,cy 반지름 r) */
export function moonPath(p: number, r = 10, cx = 12, cy = 12) {
  const waxing = p < 0.5, gib = p > 0.25 && p < 0.75, rx = (r * Math.abs(Math.cos(2 * Math.PI * p))).toFixed(3);
  return `M${cx} ${cy - r}A${r} ${r} 0 0 ${waxing ? 1 : 0} ${cx} ${cy + r}A${rx} ${r} 0 0 ${waxing ? (gib ? 1 : 0) : (gib ? 0 : 1)} ${cx} ${cy - r}Z`;
}

// ════════ 메시지 → 날짜별 집계 ════════
export const msgTs = (m: KMsg | null | undefined): number => m?.ts || m?.swipes?.[m.sw as number]?.ts || m?.swipes?.[0]?.ts || 0;
export const swipeOf = (m: KMsg | null | undefined): KSwipe => m?.swipes?.[m.sw as number] || m?.swipes?.[0] || { text: '' };
/** 이 메시지에 붙어 있는 사진: 삽화(id) 와 첨부 이미지(src) */
export const photosOf = (m: KMsg): Photo[] => [
  ...(swipeOf(m).illust || []).filter(i => i && i.id && !i.hidden).map(i => ({ id: i.id, title: i.title || '', msgId: m.id })),
  ...(Array.isArray(m?.images) ? m.images as unknown[] : []).filter((u): u is string => typeof u === 'string' && !!u).map(u => ({ src: u, title: '', msgId: m.id })),
];
const blankDay = (key: string): Day => ({ key, n: 0, user: 0, ai: 0, firstId: '', lastId: '', firstIdx: -1, lastIdx: -1, photos: [], diary: [], dreams: [], keepsakes: [], promises: [] });

/** 대화 한 편을 날짜별로 모은다 → Map(날짜 → { n, user, ai, firstId, photos, diary, dreams, keepsakes, promises }) */
export function collectDays(chat: KChat = {} as KChat, msgs: KMsg[] = []) {
  const days = new Map<string, Day>(), at = (k: string) => { let d = days.get(k); if (!d) days.set(k, d = blankDay(k)); return d; };
  msgs.forEach((m, i) => {
    const ts = msgTs(m); if (!m || m.hidden || !ts) return;
    const d = at(dayKey(ts));
    if (m.role === 'user' || m.role === 'assistant') { d.n++; if (m.role === 'user') d.user++; else d.ai++; if (!d.firstId) { d.firstId = m.id as string; d.firstIdx = i; } d.lastId = m.id as string; d.lastIdx = i; }
    for (const p of photosOf(m)) d.photos.push(p);
  });
  for (const e of chat.diary || []) if (e?.ts) at(dayKey(e.ts)).diary.push(e);
  for (const e of chat.dreams || []) if (e?.ts) at(dayKey(e.ts)).dreams.push(e);
  for (const k of chat.keepsakes || []) if (k?.ts && !k.gone) at(dayKey(k.ts)).keepsakes.push(k);
  for (const p of chat.promises || []) if (validKey(p?.date)) at(p.date).promises.push(p);
  for (const l of chat.later || []) if (l?.at) at(dayKey(l.at)).promises.push({ id: l.id, date: dayKey(l.at), time: `${pad(new Date(l.at).getHours())}:${pad(new Date(l.at).getMinutes())}`, what: l.about || t('keepsake.laterPromise'), by: 'later', later: true, made: l.made || 0 });
  return days;
}

export interface MonthStats { mk: string; total: number; target: number; active: number; msgs: number; diary: number; dreams: number; photos: number; keepsakes: number; kept: number; missed: number; open: number; streak: number; activeKeys: string[]; fill: number; full: boolean; left: number; when: 'past' | 'future' | 'now'; reachable: boolean }
/** 한 달의 통계: 대화한 날 수 · 달이 얼마나 찼는지 · 가장 길게 이어진 날 */
export function monthStats(days: Map<string, Day>, mk: string, goal: unknown = 15, today = dayKey(Date.now())): MonthStats {
  const [y, m] = mk.split('-').map(Number), total = daysIn(y, m), target = Math.max(1, Math.min(total, Math.round(+(goal as number)) || 15));
  const st = { mk, total, target, active: 0, msgs: 0, diary: 0, dreams: 0, photos: 0, keepsakes: 0, kept: 0, missed: 0, open: 0, streak: 0, activeKeys: [] } as unknown as MonthStats;
  let run = 0;
  for (let d = 1; d <= total; d++) {
    const key = `${mk}-${pad(d)}`, day = days.get(key);
    if (day?.n) { st.active++; st.msgs += day.n; st.activeKeys.push(key); run++; st.streak = Math.max(st.streak, run); } else run = 0;
    if (!day) continue;
    st.diary += day.diary.length; st.dreams += day.dreams.length; st.photos += day.photos.length; st.keepsakes += day.keepsakes.length;
    for (const p of day.promises) { const s = promiseState(p, today); if (s === 'kept') st.kept++; else if (s === 'missed') st.missed++; else st.open++; }
  }
  st.fill = Math.min(1, st.active / target); st.full = st.active >= target; st.left = Math.max(0, target - st.active);
  const cur = monthKey(keyDate(today));
  st.when = mk < cur ? 'past' : mk > cur ? 'future' : 'now';
  // 이번 달이라면 남은 날로 보름을 채울 수 있는가
  if (st.when === 'now') { const dd = +today.slice(8), todayActive = !!days.get(today)?.n; st.reachable = st.full || (total - dd + (todayActive ? 0 : 1)) >= st.left; } else st.reachable = st.full;
  return st;
}

// ════════ 약속 ════════
/** 약속의 지금 상태: kept(지킴) · missed(지나감) · today(오늘) · upcoming(다가옴) */
export const promiseState = (p: Promise_, today = dayKey(Date.now())) => p.done ? 'kept' : p.date < today ? 'missed' : p.date === today ? 'today' : 'upcoming';
const WD_EN = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
/** "2026-11-20" · "11/20" · "11월 20일" · "+3d" · "내일" · "tomorrow" · "토요일" · "next friday" → 날짜 글자 (모르면 '') */
export function resolveDate(s: unknown, base: Date | number = Date.now()) {
  const t = String(s || '').trim().toLowerCase(); if (!t) return '';
  const today = dayKey(base), ok = (k: string) => validKey(k) ? k : '';
  let m = t.match(/^(\d{4})\s*[-./년]\s*(\d{1,2})\s*[-./월]\s*(\d{1,2})\s*일?/);
  if (m) return ok(`${m[1]}-${pad(m[2])}-${pad(m[3])}`);
  m = t.match(/^(\d{1,2})\s*(?:[-./]|월)\s*(\d{1,2})\s*일?$/);
  if (m) { const y = +today.slice(0, 4); let k = ok(`${y}-${pad(m[1])}-${pad(m[2])}`); if (k && k < today) k = ok(`${y + 1}-${pad(m[1])}-${pad(m[2])}`); return k; }
  m = t.match(/^(?:\+|in\s+)?(\d{1,3})\s*(d|days?|일)\s*(?:뒤|후|later)?$/);
  if (m) return addDays(today, +m[1]);
  m = t.match(/^(?:\+|in\s+)?(\d{1,2})\s*(w|weeks?|주)\s*(?:뒤|후|later)?$/);
  if (m) return addDays(today, +m[1] * 7);
  if (/^(today|tonight|오늘|오늘\s*밤)$/.test(t)) return today;
  if (/^(tomorrow|내일)$/.test(t)) return addDays(today, 1);
  if (/^(the day after tomorrow|모레)$/.test(t)) return addDays(today, 2);
  if (/^글피$/.test(t)) return addDays(today, 3);
  if (/^(next week|다음\s*주)$/.test(t)) return addDays(today, 7);
  m = t.match(/^(next\s+|this\s+|다음\s*주\s*|이번\s*주\s*)?(sun|mon|tue|wed|thu|fri|sat)[a-z]*$/) || t.match(/^(다음\s*주\s*|이번\s*주\s*)?([일월화수목금토])요일$/);
  if (m) {
    const want = WD_EN.includes(m[2]) ? WD_EN.indexOf(m[2]) : WEEK.indexOf(m[2]), now = keyDate(today).getDay();
    const inWeek = (want + 6) % 7 - (now + 6) % 7, pre = m[1] || '';   // 월요일부터 세는 한 주 안에서의 거리
    if (/next|다음/.test(pre)) return addDays(today, inWeek + 7);         // "다음 주 ○요일": 다음 주의 그 요일
    if (/this|이번/.test(pre)) return addDays(today, inWeek < 0 ? inWeek + 7 : inWeek);
    return addDays(today, (want - now + 7) % 7 || 7);                     // 그냥 "○요일": 다가오는 그 요일
  }
  return '';
}
const TAG_ARGS = /([a-z_]+)\s*=\s*(?:"([^"]*)"|“([^”]*)”|'([^']*)')/gi;
const PROMISE_LINE = /^[ \t]*\[promise\s*:?\s*([^\]\n]*)\][ \t]*$/gim, PROMISE_ANY = /\[promise\s*:?\s*([^\]\n]*)\]/gi, PROMISE_OPEN = /\[promise\b[^\]\n]*$/i;
/** 화면에 보이기 전: 약속 태그를 지운다 (쓰는 도중 덜 닫힌 태그도) */
export const stripPromiseTags = (text: unknown) => { const s = String(text ?? ''); if (!/\[promise/i.test(s)) return s; return s.replace(PROMISE_LINE, '').replace(PROMISE_ANY, '').replace(PROMISE_OPEN, '').replace(/\n{3,}/g, '\n\n').replace(/[ \t]+\n/g, '\n').trim(); };
export interface Found { date: string; time: string; what: string }
/** 답변에서 약속 태그를 걷어 내고 따로 돌려준다 → { text, found: [{ date, time, what }] } */
export function extractPromises(text: unknown, base: Date | number = Date.now()) {
  const found: Found[] = [], src = String(text ?? '');
  if (!/\[promise/i.test(src)) return { text: src, found };
  src.replace(PROMISE_ANY, (_, a: string) => {
    const o: Record<string, string> = {}; String(a).replace(TAG_ARGS, (__, k: string, v1?: string, v2?: string, v3?: string) => { o[k.toLowerCase()] = (v1 ?? v2 ?? v3 ?? '').trim(); return ''; });
    const date = resolveDate(o.date || o.on || o.day || o.when, base), what = (o.what || o.about || o.title || '').replace(/\s+/g, ' ').slice(0, 120);
    if (date && what) found.push({ date, time: normTime(o.time || o.at), what });
    return '';
  });
  return { text: stripPromiseTags(src), found };
}
const squish = (s: unknown) => String(s || '').toLowerCase().replace(/[\s.,!?~'"“”‘’·…]/g, '');
export const samePromise = (a: { date: string; what: string }, b: { date: string; what: string }) => a.date === b.date && (squish(a.what) === squish(b.what) || squish(a.what).includes(squish(b.what)) || squish(b.what).includes(squish(a.what)));
/** 새로 찾은 약속을 수첩에 더한다 (같은 날 같은 내용은 건너뜀) → 더해진 것들 */
export function mergePromises<T extends { date: string; what: string }>(list: T[], found: { date: string; what: string }[], make: (f: { date: string; what: string }) => T = x => x as T) {
  const added: T[] = [];
  for (const f of found) { if (!validKey(f.date) || !String(f.what || '').trim()) continue; if (list.some(p => samePromise(p, f)) || added.some(p => samePromise(p, f))) continue; added.push(make(f)); }
  list.push(...added); return added;
}
/** 프롬프트에 넣을 약속: 오늘 것 · 지나갔는데 아직 서운해하지 않은 것 · 곧 다가오는 것 */
export function promiseDigest(list: Promise_[] = [], today = dayKey(Date.now()), { missDays = 14, soonDays = 7 }: { missDays?: number; soonDays?: number } = {}) {
  const out: { today: Promise_[]; missed: Promise_[]; soon: Promise_[] } = { today: [], missed: [], soon: [] };
  for (const p of list) {
    if (!validKey(p?.date) || p.done) continue;
    const gap = diffDays(today, p.date);
    if (gap === 0) out.today.push(p);
    else if (gap < 0) { if (-gap <= missDays && !p.aired && !p.excused) out.missed.push(p); }
    else if (gap <= soonDays) out.soon.push(p);
  }
  out.missed.sort((a, b) => b.date.localeCompare(a.date)); out.soon.sort((a, b) => a.date.localeCompare(b.date));
  return out;
}

// ════════ 장면 기념품 ════════
export interface SceneSpan { id: string; openId: string; title: string; place: string; time: string; summary: string; from: number; to: number; openTs: number; ts: number; lines: number; photos: Photo[]; photo: string }
/** 메시지에서 닫힌 장면을 찾는다 (장면 막 메시지 m.curtain 의 open → close 구간) */
export function scenesOf(msgs: KMsg[] = []): SceneSpan[] {
  const out: SceneSpan[] = []; let cur: { openId: string; title: string; place: string; time: string; from: number; openTs: number } | null = null;
  const blank = (i: number, m: KMsg) => ({ openId: m?.id || '', title: m?.curtain?.title || '', place: m?.curtain?.place || '', time: m?.curtain?.time || '', from: i, openTs: msgTs(m) });
  msgs.forEach((m, i) => {
    const k = m?.curtain; if (!k) return;
    if (k.kind === 'open') { cur = blank(i, m); return; }
    if (k.kind !== 'close') return;
    const s = cur || { openId: '', title: '', place: '', time: '', from: i, openTs: msgTs(m) };
    const inside = msgs.slice(s.from + 1, i).filter(x => x && !x.hidden && (x.role === 'user' || x.role === 'assistant'));
    const photos = msgs.slice(s.from, i + 1).flatMap(photosOf);
    out.push({ id: m.id as string, openId: s.openId, title: s.title, place: s.place, time: s.time, summary: k.summary || '', from: s.from, to: i, openTs: s.openTs || msgTs(m), ts: msgTs(m) || s.openTs, lines: inside.length, photos, photo: photos.find(p => p.id)?.id || '' });
    cur = null;
  });
  return out;
}
/** 저장해 둔 기념품에 새로 닫힌 장면을 더한다. 메시지가 지워져도 기념품은 남는다 → { list, added, changed } */
export function syncKeepsakes(list: Keepsake[] = [], msgs: KMsg[] = []) {
  const have = new Map(list.map(k => [k.id, k])), added: Keepsake[] = []; let changed = false, no = list.reduce((a, k) => Math.max(a, k.no || 0), 0);
  for (const s of scenesOf(msgs)) {
    const k = have.get(s.id);
    if (!k) { const rec: Keepsake = { id: s.id, openId: s.openId, no: ++no, title: s.title, place: s.place, time: s.time, summary: s.summary, openTs: s.openTs, ts: s.ts, lines: s.lines, photo: s.photo, photoCount: s.photos.length, memo: '' }; list.push(rec); added.push(rec); changed = true; continue; }
    // 장면이 닫힌 뒤에 그려진 그림은 나중에라도 꽂아 준다 (사용자가 고른 사진은 건드리지 않음)
    if (!k.picked && !k.photo && s.photo) { k.photo = s.photo; changed = true; }
    if (k.photoCount !== s.photos.length) { k.photoCount = s.photos.length; changed = true; }
  }
  return { list, added, changed };
}
/** 티켓에 찍는 자리 번호 (꾸밈): id 에서 뽑은 열·번호 */
export const seatOf = (id: unknown) => { let n = 0; for (const c of String(id)) n = (n * 33 + c.charCodeAt(0)) >>> 0; return `${'ABCDEFGHJKLM'[n % 12]}-${pad(n % 97 + 1)}`; };

// ════════ 한 권으로 묶기: 장(章) 나누기 ════════
export interface Chapter { title: string; sub: string; from: number; to: number; diary?: string[]; scene?: boolean; day?: string }
/** mode: day(날짜별) · diary(일기별) · scene(장면별) · count(N개씩) → [{ title, sub, from, to }] (to 는 포함하지 않음) */
export function chaptersOf(msgs: KMsg[] = [], { mode = 'day', size = 40, diary = [] }: { mode?: string; size?: unknown; diary?: { id: string; to: number; title?: string }[] } = {}): Chapter[] {
  const n = msgs.length, out: Chapter[] = []; if (!n) return out;
  const span = (a: number, b: number) => { const x = msgs.slice(a, b).map(msgTs).filter(Boolean); if (!x.length) return ''; const s = dayKey(x[0]), e = dayKey(x[x.length - 1]); return s === e ? showDate(s) : `${showDate(s, { week: false })} – ${showDate(e, { week: false, year: s.slice(0, 4) !== e.slice(0, 4) })}`; };
  if (mode === 'diary') {
    const ends = [...diary].filter(e => e && e.to > 0).sort((a, b) => a.to - b.to); let at = 0;
    for (const e of ends) { const to = Math.min(n, e.to); if (to <= at) { if (out.length) (out[out.length - 1].diary ||= []).push(e.id); continue; } out.push({ title: e.title || t('keepsake.untitledNight'), sub: span(at, to), from: at, to, diary: [e.id] }); at = to; }
    if (out.length) { if (at < n) out.push({ title: t('keepsake.afterwards'), sub: span(at, n), from: at, to: n }); return out; }
    mode = 'day';
  }
  if (mode === 'scene') {
    let at = 0, open = -1, title = '';
    const push = (a: number, b: number, t: string) => { if (b > a) out.push({ title: t, sub: span(a, b), from: a, to: b, scene: !!t }); };
    msgs.forEach((m, i) => { const k = m?.curtain; if (!k) return; if (k.kind === 'open') { push(at, i, ''); at = i; open = i; title = k.title || t('keepsake.untitledScene'); } else if (k.kind === 'close') { push(at, i + 1, open >= 0 ? title : t('keepsake.untitledScene')); at = i + 1; open = -1; } });
    push(at, n, open >= 0 ? title : '');
    if (out.some(c => c.scene)) { let gap = 0; for (const c of out) if (!c.title) c.title = gap++ ? t('keepsake.messagesAgain') : t('keepsake.messages'); return out; }
    out.length = 0; mode = 'day';
  }
  if (mode === 'count') { const step = Math.max(5, Math.round(+(size as number)) || 40); for (let a = 0; a < n; a += step) out.push({ title: '', sub: span(a, Math.min(n, a + step)), from: a, to: Math.min(n, a + step) }); return out; }
  let from = 0, key = '';
  msgs.forEach((m, i) => { const k = dayKey(msgTs(m) || 0); if (i === 0) { key = k; return; } if (msgTs(m) && k !== key) { out.push({ title: showDate(key), sub: '', from, to: i, day: key }); from = i; key = k; } });
  out.push({ title: showDate(key), sub: '', from, to: n, day: key });
  return out;
}
