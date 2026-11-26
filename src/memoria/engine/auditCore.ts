// 검사의 순수한 부분 — 모델을 부르지 않는다: 어긋난 곳의 근거 확인, 「지금」 쪽 바로잡기 메모, 요약의 번호 · 날짜 · 이름 점검과 한 번에 고치기, 채점 · 수정 답 읽기
import { msgText } from '../../lib/core';
import type { Cfg, Mem, Msg, Summary } from '../types';
import { cleanMultiline, cleanStr, mesHashOf, sanitizeRecord } from './base';
import { parseRecord } from '../scene';
import { dayDiff, isIsoDate, parseStoryDate, storyDatesOf } from '../calendar';
import { mentions, nameKey, strayPeople } from '../people';
import { looksRefused } from '../craft';

// ════════ 꼴 ════════
export type CheckMode = 'off' | 'each' | 'batch';
export type DriftKind = 'fact' | 'knows' | 'address' | 'time';
export const DRIFT_KINDS: DriftKind[] = ['fact', 'knows', 'address', 'time'];
export type SrcKind = 'summary' | 'arc' | 'scene' | 'canon' | 'cast' | 'bond' | 'status' | 'pledge' | 'memory' | 'item' | 'ledger';
/** 근거가 나온 곳 — from · to 는 메시지 번호(#1부터). 번호를 모르면 없다 */
export interface DriftSrc { kind: SrcKind; name?: string; from?: number; to?: number }
/** 어긋난 곳 한 건. ok = 근거 문장을 저장된 기록에서 찾았다 · h = 검사한 글의 해시 (글이 바뀌면 이 건은 지난 일이다) */
export interface DriftFinding { id: string; msgId: string; no: number; h: string; who: string; kind: DriftKind; text: string; quote: string; evidence: string; src: DriftSrc | null; ok: boolean; dismissed?: boolean }
export interface DriftReport { at: number; from: number; to: number; ids: string[]; checked: number; findings: DriftFinding[]; tokIn: number; tokOut: number; every: number; manual?: boolean }
export type GradeKind = 'wrong' | 'missing' | 'invented';
export interface GradeItem { sum: string; kind: GradeKind; text: string; refs: number[] }
export interface GradeReport { at: number; sums: string[]; items: GradeItem[]; tokIn: number; tokOut: number; auto?: boolean; /** 마지막으로 고쳐 달라고 보낸 결과 */ fixed?: string[]; kept?: string[] }
/** 서고에 함께 저장하는 검사 상태 (mem.audit) */
export interface AuditState {
  drift?: DriftReport | null;
  /** 마지막으로 검사한 답변 ('^' = 대화 처음부터 센다) · 잇달아 실패한 횟수 */
  driftAt?: string; driftFail?: number;
  grade?: GradeReport | null;
  /** 채점한 요약 → 그때의 글 해시 · 마지막으로 채점했을 때의 요약 수 · 자동 채점이 이미 본 점검 결과 */
  graded?: Record<string, string>; gradeCount?: number; gradeSeen?: string;
  /** 다음 요약 때 채울 범위 (턴 번호, 0부터) */
  gaps?: [number, number][]; gapsAt?: number;
  /** 「괜찮아요」로 넘긴 점검 항목 */
  skip?: string[];
}
export type SumIssueType = 'tail' | 'gap' | 'overlap' | 'order' | 'range' | 'dead' | 'empty' | 'short' | 'date' | 'name';
export type SumFix = '' | 'extend' | 'queue' | 'sort' | 'trim' | 'clamp' | 'sync' | 'unfix';
/** 점검에 걸린 곳 한 건. from · to · cov · sec 는 메시지 번호, turns 는 턴 번호(0부터) */
export interface SumIssue { key: string; type: SumIssueType; fix: SumFix; sum?: string; sum2?: string; from?: number; to?: number; cov?: number; sec?: number; turns?: [number, number]; said?: string; real?: string; name?: string; n?: number; queued?: boolean; what?: string }
/** 요약 한 칸 (묶음 · 연대기)과 그 칸이 덮는 메시지 범위 */
export interface SumSec { s: Summary; level: 'chunk' | 'arc'; from: number; to: number }

// ════════ 설정 읽기 ════════
/** 어긋난 곳 검사 방식 — 답변마다(replyCheck)와 묶어서(batch)는 함께 켜지지 않는다: 옛 토글이 켜져 있으면 늘 답변마다 */
export const checkModeOf = (cfg: Pick<Cfg, 'checkMode' | 'replyCheck'>): CheckMode => cfg.replyCheck ? 'each' : cfg.checkMode === 'batch' ? 'batch' : 'off';
export const checkEveryOf = (cfg: Pick<Cfg, 'checkEvery'>) => { const n = Math.round(Number(cfg.checkEvery)); return Number.isFinite(n) && n > 0 ? Math.max(2, Math.min(30, n)) : 5; };
export const gradeEveryOf = (cfg: Pick<Cfg, 'gradeEvery'>) => { const n = Math.round(Number(cfg.gradeEvery)); return Number.isFinite(n) && n > 0 ? Math.max(1, Math.min(20, n)) : 3; };
/** 바로잡기 메모를 싣는 답 수 */
export const NOTE_REPLIES = 3;

// ════════ 글 견주기 ════════
/** 띄어쓰기 · 따옴표 · 문장부호를 지우고 견준다 */
export const squash = (s: unknown) => String(s ?? '').normalize('NFKC').toLowerCase().replace(/[\s"'`“”‘’「」『』《》〈〉()[\]{}…·.,!?~\-—–:;。、！？，＊*_=→|/]/g, '');
const hash = (s: string) => { let h = 5381; for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0; return (h >>> 0).toString(36); };
export const textHash = (s: unknown) => hash(String(s ?? ''));

// ════════ 턴 · 요약이 덮는 메시지 범위 ════════
/** 턴마다 덮는 메시지 번호 [처음, 끝] (#1부터). 메시지를 찾지 못한 턴은 null */
export function turnRanges(mem: Pick<Mem, 'turns'>, msgs: Msg[]): ([number, number] | null)[] {
  const at = new Map(msgs.map((m, i) => [m.id, i + 1])); let prev = 0;
  return mem.turns.map(t => {
    const end = at.get(t.msgId); if (!end) return null;
    const parts = (Array.isArray(t.parts) ? t.parts : []).map(p => at.get(p?.[0]) || 0).filter(n => n > prev && n < end);
    // 함께 읽은 메시지(내 말 · 묶음의 앞 답장)가 적혀 있으면 거기서부터, 옛 기록이면 바로 앞의 내 말부터
    const start = parts.length ? Math.min(...parts) : end - 1 > prev && msgs[end - 2]?.role === 'user' ? end - 1 : end;
    prev = Math.max(prev, end);
    return [Math.min(start, end), end];
  });
}
const spanOf = (ranges: ([number, number] | null)[], from: number, to: number): [number, number] | null => {
  let a = 0, b = 0;
  for (let i = Math.max(0, from); i <= to && i < ranges.length; i++) { const r = ranges[i]; if (!r) continue; if (!a) a = r[0]; b = r[1]; }
  return a ? [a, b] : null;
};
/** 요약 칸들 — 이 대화에서 만든 연대기와 묶음 (이어받은 연대기는 메시지가 없어 뺀다). 오래된 것부터 */
export function sumSecs(mem: Mem, msgs: Msg[], ranges = turnRanges(mem, msgs)): SumSec[] {
  const row = (s: Summary, level: 'chunk' | 'arc'): SumSec => { const r = spanOf(ranges, s.from, s.to); return { s, level, from: r?.[0] || 0, to: r?.[1] || 0 }; };
  return [...mem.arcs.filter(a => !a.carried).map(a => row(a, 'arc')), ...mem.chunks.map(c => row(c, 'chunk'))].sort((x, y) => x.s.from - y.s.from);
}
/** 요약 머리의 때 · 곳 한 줄 (없으면 '') */
export const whenOf = (s: Pick<Summary, 'text'>) => cleanStr(parseRecord(s.text).when, 48);

// ════════ 근거 확인 ════════
export interface EvidRow { kind: SrcKind; name: string; text: string; from?: number; to?: number; sq?: string }
/** 저장된 기록을 근거로 찾아볼 수 있는 줄들로 편다 — 요약 · 장면 기록이 먼저 (어디서 나온 말인지 범위까지 댈 수 있다) */
export function evidenceRows(mem: Mem, msgs: Msg[]): EvidRow[] {
  const ranges = turnRanges(mem, msgs), no = new Map(msgs.map((m, i) => [m.id, i + 1])), out: EvidRow[] = [];
  const add = (kind: SrcKind, name: unknown, bits: unknown[], from?: number, to?: number) => { const text = bits.map(b => String(b ?? '').trim()).filter(Boolean).join('\n'); if (text) out.push({ kind, name: cleanStr(name, 48), text, ...(from ? { from, to: to || from } : {}) }); };
  const at = (id?: string) => (id ? no.get(id) : 0) || 0;
  for (const x of sumSecs(mem, msgs, ranges)) add(x.level === 'arc' ? 'arc' : 'summary', whenOf(x.s), [x.s.text], x.from, x.to);
  for (const a of mem.arcs.filter(a => a.carried)) add('arc', a.carriedFrom || '', [a.text]);
  mem.turns.forEach((t, i) => add('scene', [t.when, t.where].filter(Boolean).join(' · '), [t.digest, t.now, ...(t.beats || []).flatMap(b => [b.text, b.q])], ranges[i]?.[0], ranges[i]?.[1]));
  for (const r of mem.canon) add('canon', r.key, [`${r.key} = ${r.value}`], at(r.msgId));
  for (const c of mem.cast) if (!c.disabled) add('cast', c.name, [c.name, ...(c.aka || []), c.role, c.age, c.occupation, c.appearance, c.voice, c.core, ...(c.traits || []), ...(c.relationships || []).map(r => `${r.target}: ${r.relation}`), ...(c.growth || []).map(g => g.text), ...(c.lines || []).map(l => l.text)], at(c.msgId));
  for (const b of mem.bonds || []) if (!b.disabled) for (const st of b.log || []) add('bond', `${b.from} → ${b.to}`, [st.stage, st.basis, st.calls, st.unsaid], at(st.msgId));
  for (const s of mem.status) if (s.expired == null) add('status', `${s.entity} · ${s.slot}`, [`${s.entity}.${s.slot} = ${s.value}`], at(s.msgId));
  for (const p of mem.pledges) add('pledge', '', [p.summary, p.latest?.text, p.resolution], at(p.msgId));
  for (const m of mem.memories) if (!m.disabled) add('memory', '', [m.summary, m.quote], at(m.msgId));
  for (const it of mem.items) if (!it.disabled) add('item', it.name, [it.name, it.holder, it.meaning, it.status], at(it.msgId));
  for (const e of mem.milestones) add('item', e.title, [e.title, e.summary], at(e.msgId));
  return out;
}
/** 근거 문장이 든 줄 (없으면 null). 네 글자가 안 되는 근거는 확인한 것으로 치지 않는다 */
export function findEvidence(rows: EvidRow[], evidence: unknown): EvidRow | null {
  const e = squash(evidence); if (e.length < 4) return null;
  for (const r of rows) { r.sq ??= squash(r.text); if (r.sq.includes(e)) return r; }
  return null;
}

/** 검사한 답변 하나 */
export interface DriftWin { no: number; msg: Msg; who: string; text: string }
const KIND_ALIAS: Record<string, DriftKind> = { fact: 'fact', facts: 'fact', knows: 'knows', knowledge: 'knows', secret: 'knows', address: 'address', speech: 'address', tone: 'address', voice: 'address', time: 'time', order: 'time', timeline: 'time', date: 'time' };
/**
 * 모델이 낸 어긋난 곳을 가린다.
 * - 검사한 답변이 아닌 번호를 짚었으면 지어낸 것이다 → 버린다.
 * - 답변에서 옮겼다는 말이 그 답변에 없거나, 근거 문장이 저장된 기록(없으면 보여 준 장부)에 없으면 확인하지 못한 것이다 → 남기되 ok 를 세우지 않는다.
 */
export function readFindings(raw: unknown, win: DriftWin[], rows: EvidRow[], shown: string, newId: () => string): DriftFinding[] {
  const by = new Map(win.map(w => [w.no, w])), shownSq = squash(shown), seen = new Set<string>(), out: DriftFinding[] = [];
  for (const x of Array.isArray(raw) ? raw as (Record<string, unknown> | null)[] : []) {
    if (!x || typeof x !== 'object') continue;
    const no = Number(String(x.n ?? x.no ?? x.number ?? '').replace(/[^\d]/g, '')), w = by.get(no); if (!w) continue;
    const text = cleanStr(x.problem ?? x.text, 300); if (!text) continue;
    const quote = cleanStr(x.quote, 240), evidence = cleanStr(x.evidence, 300), q = squash(quote), key = `${no}|${q || squash(text)}`;
    if (seen.has(key)) continue; seen.add(key);
    const quoteOk = q.length >= 3 && squash(w.text).includes(q), row = findEvidence(rows, evidence), e = squash(evidence), inShown = !row && e.length >= 4 && shownSq.includes(e);
    const src: DriftSrc | null = row ? { kind: row.kind, ...(row.name ? { name: row.name } : {}), ...(row.from ? { from: row.from, to: row.to } : {}) } : inShown ? { kind: 'ledger' } : null;
    out.push({ id: newId(), msgId: w.msg.id, no, h: mesHashOf(w.msg), who: w.who, kind: KIND_ALIAS[String(x.kind ?? '').trim().toLowerCase()] || 'fact', text, quote, evidence, src, ok: quoteOk && !!src });
    if (out.length >= 12) break;
  }
  return out;
}

// ════════ 바로잡기 메모 (매 턴 바뀌는 구간에만 싣는다) ════════
/** 지금도 살아 있는 건 — 근거를 확인했고, 넘기지 않았고, 그 답변이 그때 글 그대로다 */
export function liveFindings(report: DriftReport | null | undefined, msgs: Msg[] | null | undefined): DriftFinding[] {
  if (!report || !Array.isArray(msgs)) return [];
  const by = new Map(msgs.map(m => [m.id, m]));
  return report.findings.filter(f => { const m = by.get(f.msgId); return f.ok && !f.dismissed && !!m && mesHashOf(m) === f.h; });
}
/** 검사 뒤로 온 답 수 (검사한 마지막 답변을 찾지 못하면 -1) */
export function repliesSince(report: DriftReport | null | undefined, msgs: Msg[] | null | undefined): number {
  if (!report || !Array.isArray(msgs)) return -1;
  const ids = new Set(report.ids); let last = -1;
  for (let i = msgs.length - 1; i >= 0; i--) if (ids.has(msgs[i].id)) { last = i; break; }
  if (last < 0) return -1;
  let n = 0; for (let i = last + 1; i < msgs.length; i++) if (msgs[i].role === 'assistant' && !msgs[i].hidden && msgText(msgs[i]).trim()) n++;
  return n;
}
/**
 * 「지금」 쪽에 실을 메모 줄 — 마지막 검사에서 근거를 확인한 어긋남을 기록 쪽 문장과 함께 짧게. 검사 뒤 답 keep 개가 지나면 싣지 않는다.
 * 보고서가 없거나 설정(driftNote)이 꺼져 있으면 빈 목록 — 장부는 한 글자도 달라지지 않는다
 */
export function driftNoteLines(mem: Pick<Mem, 'audit'>, msgs: Msg[] | null | undefined, on: boolean, keep = NOTE_REPLIES): string[] {
  const report = mem.audit?.drift; if (!on || !report || !Array.isArray(msgs)) return [];
  const since = repliesSince(report, msgs); if (since < 0 || since >= keep) return [];
  const live = liveFindings(report, msgs).slice(0, 4); if (!live.length) return [];
  return ['## Keep Consistent with the Record (a check of the latest replies found these slips — from here on follow what the record says; do not point out the correction or mention this note)',
    ...live.map(f => `- On record: "${cleanStr(f.evidence, 200)}" — reply #${f.no} said otherwise: ${cleanStr(f.text, 200)}`)];
}

// ════════ 요약 점검 (번호 · 날짜 · 이름) ════════
const DAY_RE = [/\bday\s*(\d{1,4})\b/gi, /(\d{1,4})\s*일\s*(?:째|차)/g, /第\s*(\d{1,4})\s*[天日]/g, /(\d{1,4})\s*日\s*目/g];
const daysSaid = (when: string) => { const out: number[] = []; for (const re of DAY_RE) for (const m of when.matchAll(re)) { const n = +m[1]; if (n >= 1) out.push(n); } return out; };
/** 턴마다의 며칠째 — 사서가 적은 날(day)이 한 번이라도 나온 뒤부터만 안다 (그 전은 0) */
function dayAtTurns(turns: Mem['turns']): number[] {
  let base = 0, add = 0;
  return turns.map(t => { if (t.day && t.day >= 1) { base = t.day; add = 0; } else add += t.days || 0; return base ? Math.max(1, Math.round(base + Math.floor(add))) : 0; });
}
/**
 * 요약 · 장면 기록의 번호와 날짜 · 이름을 견준다. known: 인물 목록 밖에서 아는 이름 (내 캐릭터 · 캐릭터 카드).
 * 메시지를 읽지 못했으면(빈 목록) 메시지와 견주는 점검은 하지 않는다 — 기록을 걷어 내라고 권하지 않게
 */
export function sumChecks(mem: Mem, msgs: Msg[], known: string[] = []): SumIssue[] {
  const out: SumIssue[] = [], T = mem.turns.length, ranges = turnRanges(mem, msgs), secs = sumSecs(mem, msgs, ranges), queued = new Set((mem.audit?.gaps || []).map(g => g.join('-')));
  const first = (i: number) => spanOf(ranges, i, T - 1)?.[0] || 0, last = (i: number) => { for (let k = Math.min(i, T - 1); k >= 0; k--) if (ranges[k]) return ranges[k]![1]; return 0; };
  // ── 없어진 메시지를 가리키는 기록
  if (msgs.length) {
    const ids = new Set(msgs.map(m => m.id)), dead = mem.turns.filter(t => !ids.has(t.msgId)).length, fx = (mem.dateFix || []).filter(f => !ids.has(f.msgId)).length;
    if (dead) out.push({ key: `dead:turn:${dead}`, type: 'dead', fix: 'sync', n: dead, what: 'turn' });
    if (fx) out.push({ key: `dead:date:${fx}`, type: 'dead', fix: 'unfix', n: fx, what: 'date' });
  }
  // ── 범위가 어긋난 칸 · 순서 · 겹침
  const valid = secs.filter(x => { const { from, to } = x.s, bad = !Number.isInteger(from) || !Number.isInteger(to) || from < 0 || from > to || to >= T; if (bad) out.push({ key: `range:${x.s.id}`, type: 'range', fix: Number.isInteger(from) && from >= 0 && from < T && (to >= T || from > to) && T > 0 ? 'clamp' : '', sum: x.s.id, from: x.from, to: x.to }); return !bad; });
  const sorted = (list: Summary[]) => list.every((s, i) => !i || list[i - 1].from <= s.from);
  if (!sorted(mem.chunks) || !sorted(mem.arcs.filter(a => !a.carried))) out.push({ key: 'order', type: 'order', fix: 'sort' });
  for (let i = 1; i < valid.length; i++) {
    const a = valid[i - 1], b = valid[i]; if (b.s.from > a.s.to) continue;
    const r = spanOf(ranges, b.s.from, Math.min(a.s.to, b.s.to));
    out.push({ key: `overlap:${a.s.id}:${b.s.id}`, type: 'overlap', fix: b.s.to > a.s.to ? 'trim' : '', sum: a.s.id, sum2: b.s.id, from: r?.[0] || 0, to: r?.[1] || 0, turns: [b.s.from, Math.min(a.s.to, b.s.to)] });
  }
  // ── 압축한 범위 안에서 어느 칸에도 들지 않은 곳
  const covered = new Array<boolean>(T).fill(false); let secEnd = 0;
  for (const x of valid) { for (let i = x.s.from; i <= x.s.to; i++) covered[i] = true; secEnd = Math.max(secEnd, x.s.to + 1); }
  const cursor = Math.min(T, Math.max(mem.chunked || 0, secEnd));
  for (let i = 0; i < cursor; i++) {
    if (covered[i]) continue;
    let j = i; while (j + 1 < cursor && !covered[j + 1]) j++;
    const written = mem.turns.slice(i, j + 1).some(t => t.digest && !t.failed), tail = i >= secEnd, key = `${i}-${j}`;
    // 적힌 것이 없는 구간은 잃을 것이 없다 — 이웃 칸의 범위만 늘리면 된다. 적힌 것이 있으면 다음 요약 때 채운다
    if (written || valid.length) out.push({ key: `${tail ? 'tail' : 'gap'}:${key}`, type: tail ? 'tail' : 'gap', fix: written ? 'queue' : 'extend', from: first(i), to: last(j), cov: last(cursor - 1), sec: secEnd ? last(secEnd - 1) : 0, turns: [i, j], ...(queued.has(key) ? { queued: true } : {}) });
    i = j;
  }
  // ── 비었거나 너무 짧은 요약 · 달력과 다른 날 · 인물 목록에 없는 이름
  const dayAt = dayAtTurns(mem.turns), dates = storyDatesOf(mem.turns, mem.dateFix);
  const registry = new Set([...mem.cast.flatMap(c => [c.name, ...(c.aka || []), ...(c.aliases || [])]), ...known].map(nameKey).filter(Boolean)), stray = strayPeople(mem).filter(n => n.length >= 2 && !registry.has(nameKey(n))), named = new Map<string, SumIssue>();
  for (const x of valid) {
    const text = String(x.s.text || '').trim(), turns = mem.turns.slice(x.s.from, x.s.to + 1), notes = turns.filter(t => t.digest && !t.failed), size = notes.reduce((a, t) => a + String(t.digest).length, 0);
    if (!text) { out.push({ key: `empty:${x.s.id}`, type: 'empty', fix: '', sum: x.s.id, from: x.from, to: x.to }); continue; }
    if ((text.length < 40 && notes.length >= 2) || (size >= 600 && text.length < size * 0.06)) out.push({ key: `short:${x.s.id}:${text.length}`, type: 'short', fix: '', sum: x.s.id, from: x.from, to: x.to, n: text.length });
    const when = parseRecord(text).when;
    if (when) {
      const said = daysSaid(when), onFile = dayAt.slice(x.s.from, x.s.to + 1).filter(Boolean);
      if (said.length && onFile.length) { const lo = Math.min(...onFile), hi = Math.max(...onFile); if (said.every(d => d < lo - 1 || d > hi + 1)) out.push({ key: `date:${x.s.id}:${said[0]}:${lo}`, type: 'date', fix: '', sum: x.s.id, from: x.from, to: x.to, said: String(said[0]), real: lo === hi ? String(lo) : `${lo}–${hi}`, what: 'day' }); }
      const real = dates.slice(x.s.from, x.s.to + 1).filter(isIsoDate), read = real.length ? parseStoryDate(when, real[0]) : '';
      if (read && (dayDiff(read, real[0]) > 1 || dayDiff(real[real.length - 1], read) > 1)) out.push({ key: `date:${x.s.id}:${read}`, type: 'date', fix: '', sum: x.s.id, from: x.from, to: x.to, said: read, real: real[0] === real[real.length - 1] ? real[0] : `${real[0]} ~ ${real[real.length - 1]}`, what: 'date' });
    }
    for (const n of stray) if (mentions(text, [n])) { const hit = named.get(nameKey(n)); if (hit) hit.n = (hit.n || 1) + 1; else if (named.size < 6) named.set(nameKey(n), { key: `name:${nameKey(n)}`, type: 'name', fix: '', sum: x.s.id, from: x.from, to: x.to, name: n, n: 1 }); }
  }
  out.push(...named.values());
  return out;
}

/** 점검 항목을 그 자리에서 고친다 (모델 호출 없음 · 요약 글은 건드리지 않는다). 'sync' 는 엔진의 맞추기가 맡는다. 반환: 고쳤는가 */
export function applySumFix(mem: Mem, issue: SumIssue, msgs: Msg[] = []): boolean {
  const T = mem.turns.length, all = () => [...mem.chunks, ...mem.arcs.filter(a => !a.carried)], byId = (id?: string) => all().find(s => s.id === id), st = (mem.audit ||= {});
  if (issue.fix === 'sort') { mem.chunks.sort((a, b) => a.from - b.from); mem.arcs.sort((a, b) => (a.carried ? -1 : 0) - (b.carried ? -1 : 0) || a.from - b.from); return true; }
  if (issue.fix === 'clamp') { const s = byId(issue.sum); if (!s || T < 1 || s.from >= T) return false; s.to = Math.max(s.from, Math.min(s.to >= s.from ? s.to : s.from, T - 1)); return true; }
  if (issue.fix === 'trim') { const a = byId(issue.sum), b = byId(issue.sum2); if (!a || !b || b.to <= a.to) return false; b.from = a.to + 1; return true; }
  if (issue.fix === 'unfix') { const ids = new Set(msgs.map(m => m.id)); if (!msgs.length || !mem.dateFix) return false; mem.dateFix = mem.dateFix.filter(f => ids.has(f.msgId)); if (!mem.dateFix.length) delete mem.dateFix; return true; }
  const [a, b] = issue.turns || [-1, -1]; if (a < 0 || b < a || b >= T) return false;
  if (issue.fix === 'extend') {   // 앞 칸의 끝을 늘린다 — 앞 칸이 없으면 뒤 칸의 처음을 당긴다
    const prev = all().filter(s => s.to < a).sort((x, y) => y.to - x.to)[0], next = all().filter(s => s.from > b).sort((x, y) => x.from - y.from)[0];
    if (prev) prev.to = b; else if (next) next.from = a; else return false;
    return true;
  }
  if (issue.fix === 'queue') {
    if (issue.type === 'tail') { mem.chunked = Math.min(mem.chunked || 0, a); return true; }   // 끝자락: 요약 커서를 되감으면 다음 요약이 이 범위부터 묶는다
    const gaps = (st.gaps ||= []); if (!gaps.some(g => g[0] === a && g[1] === b)) gaps.push([a, b]);
    st.gapsAt = mem.chunks.length + mem.arcs.length; return true;
  }
  return false;
}
/** 아직 채워야 하는 대기 범위만 남긴다 (그사이 다른 요약이 덮었거나 턴이 사라졌으면 뺀다) */
export function pendingGaps(mem: Mem): [number, number][] {
  const T = mem.turns.length, secs = [...mem.chunks, ...mem.arcs.filter(a => !a.carried)];
  return (mem.audit?.gaps || []).filter(([a, b]) => Number.isInteger(a) && Number.isInteger(b) && a >= 0 && b >= a && b < T && !secs.some(s => s.from <= b && s.to >= a) && mem.turns.slice(a, b + 1).some(t => t.digest && !t.failed));
}

// ════════ 원문 발췌 (채점 · 수정에 보낸다) ════════
/**
 * #from ~ #to 의 메시지를 예산(글자 수) 안에서 발췌한다. focus(메시지 번호)와 중요 표시한 메시지를 먼저, 나머지는 고르게.
 * 긴 메시지는 앞과 끝만 남기고 가운데를 " … " 로 줄인다. 반환: "[#131 이름] 글" 줄들 (대화 순서)
 */
export function excerptsFor(msgs: Msg[], from: number, to: number, budget: number, nameOf: (m: Msg) => string, clean: (m: Msg) => string, focus: number[] = []): string[] {
  const pool: { no: number; m: Msg; text: string }[] = [];
  for (let n = Math.max(1, from); n <= to && n <= msgs.length; n++) { const m = msgs[n - 1]; if (!m || m.role === 'system') continue; const text = clean(m).replace(/\s+/g, ' ').trim(); if (text) pool.push({ no: n, m, text }); }
  if (!pool.length) return [];
  const cut = (s: string, head: number, tail: number) => s.length <= head + tail + 12 ? s : `${s.slice(0, head)} … ${s.slice(-tail)}`;
  const per = Math.max(160, Math.min(700, Math.floor(budget / Math.min(pool.length, 10)))), want = new Set<number>(), near = new Set(focus.flatMap(n => [n - 1, n, n + 1]));
  for (const p of pool) if (near.has(p.no) || p.m.memStar) want.add(p.no);
  const room = Math.max(want.size, Math.floor(budget / per)), rest = pool.filter(p => !want.has(p.no)), take = Math.max(0, room - want.size);
  for (let i = 0; i < take && rest.length; i++) want.add(rest[Math.min(rest.length - 1, Math.round(i * (rest.length - 1) / Math.max(1, take - 1)))].no);
  return pool.filter(p => want.has(p.no)).map(p => `[#${p.no} ${nameOf(p.m)}] ${cut(p.text, Math.round(per * 0.65), Math.round(per * 0.35))}`);
}

// ════════ 채점 · 수정 답 읽기 ════════
const GRADE_KIND: Record<string, GradeKind> = { wrong: 'wrong', incorrect: 'wrong', error: 'wrong', missing: 'missing', omitted: 'missing', invented: 'invented', fabricated: 'invented', unsupported: 'invented' };
/** 채점 답을 읽는다 — 꼬리표(S1…)가 보낸 요약의 것이 아니면 버리고, 메시지 번호는 그 요약의 범위 안의 것만 남긴다 */
export function readGrade(raw: unknown, tags: Map<string, SumSec>): GradeItem[] {
  const out: GradeItem[] = [], per = new Map<string, number>();
  for (const x of Array.isArray(raw) ? raw as (Record<string, unknown> | null)[] : []) {
    if (!x || typeof x !== 'object') continue;
    const sec = tags.get(String(x.sec ?? x.tag ?? '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '')), kind = GRADE_KIND[String(x.kind ?? '').trim().toLowerCase()], text = cleanStr(x.text ?? x.problem, 300);
    if (!sec || !kind || !text || (per.get(sec.s.id) || 0) >= 4) continue;
    const refs = [...new Set((Array.isArray(x.refs) ? x.refs : [x.refs]).map(r => Number(String(r ?? '').replace(/[^\d]/g, ''))).filter(n => Number.isInteger(n) && n >= sec.from && n <= sec.to && sec.from > 0))].slice(0, 3);
    per.set(sec.s.id, (per.get(sec.s.id) || 0) + 1); out.push({ sum: sec.s.id, kind, text, refs });
    if (out.length >= 12) break;
  }
  return out;
}
/** 수정 답을 꼬리표별 글로 나눈다 ("=== S2 ===" 줄 아래가 그 요약의 새 글) */
export function readRepair(reply: unknown, cap: (tag: string) => number): Map<string, string> {
  const out = new Map<string, string>(), src = String(reply ?? '').replace(/\r/g, ''), re = /^[ \t]*={2,}[ \t]*\[?(S\d+)\]?[ \t]*={2,}[ \t]*$/gim, marks: { tag: string; at: number; end: number }[] = [];
  for (const m of src.matchAll(re)) marks.push({ tag: m[1].toUpperCase(), at: m.index!, end: m.index! + m[0].length });
  marks.forEach((k, i) => { const body = cleanMultiline(sanitizeRecord(src.slice(k.end, marks[i + 1]?.at ?? src.length)), cap(k.tag)); if (body && !out.has(k.tag)) out.set(k.tag, body); });
  return out;
}
export type RepairBad = '' | 'empty' | 'refused' | 'shrunk' | 'fields';
/** 고쳐 쓴 요약을 받아도 되는가 — 훨씬 짧아졌거나, 있던 칸(WHEN · PLOT)이 빠졌거나, 줄거리 줄이 줄었으면 받지 않는다. weak: 원래 글이 비었거나 너무 짧아 고쳐 달라고 한 요약 */
export function repairBad(before: string, after: string, weak = false): RepairBad {
  const b = String(before || '').trim(), a = String(after || '').trim();
  if (!a) return 'empty';
  if (looksRefused(a) && !/(?:^|\n)\s*(?:WHEN|PLOT|SHIFTS|OPEN)\s*[:：]/i.test(a)) return 'refused';
  if (weak) return a.length >= Math.max(80, b.length) ? '' : 'shrunk';
  if (a.length < b.length * 0.7) return 'shrunk';
  const was = parseRecord(b), now = parseRecord(a);
  if (was.structured && (!now.structured || (was.when && !now.when) || (was.beats.length && now.beats.length < Math.ceil(was.beats.length * 0.7)) || (was.shifts.length >= 2 && !now.shifts.length))) return 'fields';
  return '';
}
