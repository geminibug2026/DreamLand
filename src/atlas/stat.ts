// 성좌 도감의 셈: 메시지 목록을 한 번 훑어 숫자로 줄이고, 여러 방의 숫자를 합친다. 화면도 저장소도 모르는 순수 함수만 둔다 (node 로 돌려 볼 수 있게)
import type { MsgStat, Tally } from './types';

const DAY = 86400000;
/** 그 지역 날짜의 일련번호 (자정에 바뀐다) */
export const dayNo = (ts: number) => Math.floor((ts - new Date(ts).getTimezoneOffset() * 60000) / DAY);
/** 달의 위상 0~1 (0 = 그믐 · .5 = 보름) — src/lib/moon.ts 와 같은 식 */
export const moonP = (ts: number) => (((ts - Date.UTC(2000, 0, 6, 18, 14)) / DAY / 29.530588853) % 1 + 1) % 1;

export const emptyStat = (): MsgStat => ({ turns: 0, replies: 0, ink: 0, longest: 0, swipes: 0, maxSwipes: 0, night: 0, three: 0, full: 0, dark: 0, phases: 0, dayMax: 0, days: [],
  scenes: 0, calls: 0, callSecs: 0, missed: 0, illust: 0, tr: 0, rolls: 0, react: 0, crit: 0, fumble: 0, fights: 0, boss: 0, quests: 0, minis: 0, sessions: 0, places: 0, mem: 0 });

// 메시지에 기능들이 덧붙인 칸 가운데 여기서 읽는 것만 (꼴은 각 기능의 types 그대로)
interface Sw { text?: string; tr?: string; illust?: unknown[]; gfx?: { k: string; done?: boolean }[]; gask?: { k: string; foes?: { boss?: boolean }[] } }
interface M {
  role: string; hidden?: boolean; ts?: number; sw?: number; swipes?: Sw[]; greeting?: boolean; curtain?: { kind?: string }; dice?: unknown; reactions?: unknown[];
  call?: { result?: string; dur?: number; overheard?: boolean }; gm?: { kind: string; crit?: string; outcome?: string };
}
/**
 * 메시지 목록을 훑는다. skip 은 갈래 방에서 원래 방과 겹치는 앞부분의 수 — 같은 말을 두 번 세지 않는다.
 * 숨긴 메시지도 센다 (기억 정리로 숨겨진 옛 대화도 함께한 기록이므로).
 */
export function scan(list: unknown[], skip = 0, mem = 0): MsgStat {
  const s = emptyStat(), days = new Map<number, number>(); s.mem = mem; let bossAhead = false;
  (list as M[]).forEach((m, i) => {
    if (i < skip || !m) return;
    const sws = m.swipes || [], sw = sws[m.sw || 0] || sws[0], text = sw?.text || '', ts = m.ts || 0;
    if (m.role === 'user') {
      s.turns++; s.ink += text.length;
      if (ts) {
        const d = dayNo(ts), h = new Date(ts).getHours(), p = moonP(ts);
        days.set(d, (days.get(d) || 0) + 1);
        if (h < 4) s.night++; if (h === 3) s.three++;
        if (Math.abs(p - .5) < .035) s.full++; if (p < .035 || p > .965) s.dark++;
        s.phases |= 1 << (Math.round(p * 8) % 8);
      }
    } else if (m.role === 'assistant') {
      if (!m.greeting) { s.replies++; s.ink += text.length; s.longest = Math.max(s.longest, text.length); s.swipes += Math.max(0, sws.length - 1); s.maxSwipes = Math.max(s.maxSwipes, sws.length); }
      for (const x of sws) { s.illust += x.illust?.length || 0; if (x.tr) s.tr++; }
      for (const fx of sw?.gfx || []) { if (fx.k === 'quest' && fx.done) s.quests++; else if (fx.k === 'place') s.places++; }
      if (sw?.gask?.k === 'fight') bossAhead = !!sw.gask.foes?.some(f => f.boss);
    }
    if (m.role === 'user' && sw?.tr) s.tr++;
    if (m.curtain?.kind === 'close') s.scenes++;
    if (m.dice) s.rolls++;
    s.react += m.reactions?.length || 0;
    if (m.call && !m.call.overheard) { if (m.call.result === 'answered') { s.calls++; s.callSecs += Math.max(0, m.call.dur || 0); } else if (m.call.result === 'missed') s.missed++; }
    const g = m.gm;
    if (g?.kind === 'check') { if (g.crit === 'hit') s.crit++; else if (g.crit === 'miss') s.fumble++; }
    else if (g?.kind === 'fight') { if (g.outcome === 'win') { s.fights++; if (bossAhead) s.boss++; } bossAhead = false; }
    else if (g?.kind === 'play') { if (g.outcome === 'win') s.minis++; }
    else if (g?.kind === 'session') s.sessions++;
  });
  s.days = [...days.keys()].sort((a, b) => a - b); s.dayMax = Math.max(0, ...days.values());
  return s;
}

/** 대화방 객체에 실려 다니는 것 (일기 · 약속 · 체크포인트 …) */
export interface RoomBits { diary: number; notes: number; dreams: number; letters: number; keeps: number; made: number; kept: number; cps: number; branch: number; deep: number; group: number }
interface C { id: string; charIds?: string[]; parent?: { id: string }; diary?: { note?: string }[]; dreams?: unknown[]; letters?: unknown[]; keepsakes?: { gone?: boolean }[]; promises?: { done?: boolean }[]; checkpoints?: unknown[] }
/** 방 객체에서 바로 읽는 수. byId 는 갈래의 깊이를 따라 올라갈 때 쓴다 */
export function roomBits(chat: unknown, byId: (id: string) => unknown): RoomBits {
  const c = chat as C; let deep = 0, p = c.parent?.id, guard = 0;
  while (p && guard++ < 20) { deep++; p = (byId(p) as C | undefined)?.parent?.id; }
  return { diary: c.diary?.length || 0, notes: (c.diary || []).filter(d => d.note).length, dreams: c.dreams?.length || 0, letters: c.letters?.length || 0, keeps: (c.keepsakes || []).filter(k => !k.gone).length,
    made: c.promises?.length || 0, kept: (c.promises || []).filter(x => x.done).length, cps: c.checkpoints?.length || 0, branch: c.parent ? 1 : 0, deep, group: (c.charIds?.length || 0) > 1 ? 1 : 0 };
}

const SUM = ['turns', 'replies', 'ink', 'swipes', 'night', 'three', 'full', 'dark', 'scenes', 'calls', 'callSecs', 'missed', 'illust', 'tr', 'rolls', 'react', 'crit', 'fumble', 'fights', 'boss', 'quests', 'minis', 'sessions', 'places', 'mem'] as const;
const MAX = ['longest', 'maxSwipes'] as const;
/** 날짜 목록(오름차순)에서 가장 긴 연속과 가장 긴 공백 */
export function runs(days: number[]): { streak: number; gap: number } {
  let streak = days.length ? 1 : 0, run = 1, gap = 0;
  for (let i = 1; i < days.length; i++) { const d = days[i] - days[i - 1]; if (d === 1) { run++; streak = Math.max(streak, run); } else { run = 1; gap = Math.max(gap, d - 1); } }
  return { streak, gap };
}
/** 여러 방을 한 숫자판으로. 더할 것은 더하고, 기록(가장 긴 답 등)은 큰 값을 고르고, 날짜는 합쳐서 연속을 센다 */
export function tally(rows: { s: MsgStat; b: RoomBits }[]): Tally {
  const T: Tally = {}, days = new Map<number, number>(); let phases = 0, roomMax = 0, rooms = 0, group = 0;
  for (const k of SUM) T[k] = 0; for (const k of MAX) T[k] = 0;
  const bk: (keyof RoomBits)[] = ['diary', 'notes', 'dreams', 'letters', 'keeps', 'made', 'kept', 'cps', 'branch']; for (const k of bk) T[k] = 0; T.deep = 0;
  for (const { s, b } of rows) {
    for (const k of SUM) T[k] += s[k] || 0; for (const k of MAX) T[k] = Math.max(T[k], s[k] || 0);
    for (const k of bk) T[k] += b[k]; T.deep = Math.max(T.deep, b.deep);
    phases |= s.phases; roomMax = Math.max(roomMax, s.turns); if (s.turns) { rooms++; if (b.group) group++; }
    // 하루에 보낸 말은 방을 넘어 합칠 수 없으니(날짜별 수를 남기지 않는다) 방 하나의 최고 기록을 쓴다
    for (const d of s.days) days.set(d, 1); T.dayMax = Math.max(T.dayMax || 0, s.dayMax);
  }
  const all = [...days.keys()].sort((a, b) => a - b), r = runs(all);
  let bits = 0; for (let i = 0; i < 8; i++) if (phases & (1 << i)) bits++;
  return Object.assign(T, { phases: bits, roomMax, rooms, group, active: all.length, streak: r.streak, gap: r.gap, faced: T.scenes + T.calls, pages: T.diary + T.dreams + T.letters });
}
/** 숫자가 문턱 몇 개를 넘었나 (= 별의 단계) */
export const tierOf = (v: number, at: number[]) => at.reduce((n, a) => n + (v >= a ? 1 : 0), 0);
