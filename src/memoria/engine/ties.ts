// 사이 이름 · 변화 기록 · 한 카드가 여러 인물을 맡는 대화 · 끊긴 답변 — 턴 기록에 얹는 것과, 지난 요약에서 찾아 채우는 「찾기」.
// Memory 를 인자로 받는 함수들이다 (조각 파일의 서명을 늘리지 않는다). 서고를 고친 뒤 저장은 부르는 쪽이 한다
import { S, uid, msgText } from '../../lib/core';
import type { MemoryApi } from './api';
import type { Extraction } from './part2';
import type { Bond, ChatM, Mem, Msg, Shift } from '../types';
import { ekey, cleanStr, parseLooseEx, visibleProse } from './base';
import { ensembleLabel } from '../craft';
import { cardVoicesMany, endsMidSentence } from '../guards';
import { canonRecord, splitArrow, type LooseObj } from '../lenient';
import { tieKind, cleanTieName, cleanShift, sameShift, sameText, latestFeelings, type ShiftInput, type FeelingRow } from '../ties';
import { TIES_SCAN_PROMPT, hostNote } from '../tieprompts';

// ── 한 카드가 여러 인물을 맡는 대화 ──
/** many: 이 카드는 여러 인물을 연기한다(카드 이름은 해설자의 말머리) · label: 카드 이름 · auto: 스스로 알아본 것 · why: 직접 정함 | 카드 글 | 인물 명단 */
export interface HostInfo { many: boolean; label: string; auto: boolean; why: '' | 'set' | 'card' | 'cast' }
const hostHints = new WeakMap<object, { key: string; many: boolean }>();
/**
 * 이 대화의 카드가 연기하는 인물. 대화마다 정해 둔 값(mem.cardCast)이 먼저다. 자동일 때는 카드 글이 인물을 여럿 소개하고 그 가운데 카드 이름이 없는지 먼저 보고
 * (인물 명단이 비어 있는 첫 턴에도 알아본다 · 카드 이름의 인물 카드가 잘못 생겨 있어도 뒤집히지 않는다), 다음으로 인물 명단을 본다. 캐릭터가 여럿인 대화는 카드마다 한 인물이다
 */
export function hostOf(_M: MemoryApi, chat: ChatM | null | undefined, mem: Mem | null | undefined): HostInfo {
  const ids = chat?.charIds || [], card = ids.length === 1 ? S.get('chars', ids[0]) : undefined, label = String(card?.name || '').trim();
  if (!chat || !card || !label) return { many: false, label: '', auto: true, why: '' };
  if (mem?.cardCast === 'one' || mem?.cardCast === 'many') return { many: mem.cardCast === 'many', label, auto: false, why: 'set' };
  let me = ''; try { me = S.persona(chat)?.name || ''; } catch { /* 페르소나가 없어도 된다 */ }
  const key = `${(card.description || '').length}|${(card.personality || '').length}|${(card.scenario || '').length}|${me}|${label}`; let hint = hostHints.get(card);
  if (!hint || hint.key !== key) { hint = { key, many: cardVoicesMany(card, me).length >= 2 }; hostHints.set(card, hint); }
  if (hint.many) return { many: true, label, auto: true, why: 'card' };
  const byCast = mem ? ensembleLabel(label, me, mem.cast.filter(c => !c.disabled), true) : '';
  return { many: !!byCast, label, auto: true, why: byCast ? 'cast' : '' };
}
/** 점검 · 질문 · 정정 · 훑기 호출에 붙이는 한 줄 (여러 인물을 맡는 카드가 아니면 '') */
export function hostNoteOf(M: MemoryApi, chat: ChatM | null | undefined, mem: Mem | null | undefined): string { const h = hostOf(M, chat, mem); return h.many ? hostNote(h.label) : ''; }
/** 사서의 답에서 카드 이름으로 적힌 것을 걷어 낸다 — 인물 카드 · 상태 · 관계선은 통째로, 기억 · 장면 인물 목록에서는 그 이름만. 반환: 걷어 낸 수 */
export function stripHost(ext: Extraction, label: string): number {
  if (!label) return 0; const is = (n?: string | null) => !!n && ekey(n) === ekey(label); let n = 0;
  const keep = <T,>(rows: T[], bad: (r: T) => boolean) => { const out = rows.filter(r => !bad(r)); n += rows.length - out.length; return out; };
  ext.characters = keep(ext.characters, c => is(c.name));
  ext.bonds = keep(ext.bonds, b => is(b.from) || is(b.to));
  ext.entityStates = keep(ext.entityStates, s => is(s.entity));
  for (const s of ext.entityStates) if (ekey(s.entity) === 'scene' && s.slot === 'present') s.value = String(s.value).split(/\s*[,，、·]\s*/).filter(x => x && !is(x)).join(', ');
  ext.entityStates = ext.entityStates.filter(s => s.value);
  for (const m of ext.memories) { m.entities = m.entities.filter(e => !is(e)); if (is(m.owner)) m.owner = null; if (m.knowers) m.knowers = m.knowers.filter(e => !is(e)); if (is(m.by)) m.by = null; if (is(m.to)) m.to = null; }
  for (const c of ext.characters) c.relationships = c.relationships.filter(r => !is(r.target));
  for (const b of ext.beats || []) { b.with = b.with.filter(e => !is(e)); if (is(b.by)) b.by = null; if (is(b.to)) b.to = null; }
  return n;
}

// ── 답의 꼴 도움말: 형식을 틀린 적 있는 모델에게만 길게 붙인다 ──
const FORMAT_KEY = 'dreamland:memoria-format-help';
let slipped: Set<string> | null = null;
const slippedSet = () => { if (!slipped) { try { const j = JSON.parse(localStorage.getItem(FORMAT_KEY) || '[]'); slipped = new Set(Array.isArray(j) ? j.map(String) : []); } catch { slipped = new Set(); } } return slipped; };
const modelKey = (c?: { provider?: string; model?: string } | null) => (c?.model ? `${c.provider || ''}|${c.model}` : '');
/** 이 모델이 기록 형식을 틀린 적이 있는가 (있으면 예시 답 · 자주 하는 실수까지 붙인다) */
export const needsFormatHelp = (c?: { provider?: string; model?: string } | null): boolean => { const k = modelKey(c); return !!k && slippedSet().has(k); };
/** 이 모델이 방금 형식을 틀렸다고 적어 둔다 (기기에 남는다 — 모델 마흔 개까지). 반환: 처음 적은 것인가 */
export function noteFormatSlip(c?: { provider?: string; model?: string } | null): boolean {
  const k = modelKey(c), set = slippedSet(); if (!k || set.has(k)) return false;
  set.add(k); try { localStorage.setItem(FORMAT_KEY, JSON.stringify([...set].slice(-40))); } catch { /* 저장하지 못해도 이번 세션에는 남는다 */ }
  return true;
}

// ── 끊긴 답변 ──
/** 답변이 끝까지 오지 못했는가 — 생성이 끊기거나 멈췄다고 적어 둔 답변(지금 보이는 글의 cut), 또는 글이 문장 중간에서 끝난다 */
export function cutReply(m: Msg | null | undefined): '' | 'flag' | 'text' {
  if (!m || m.role !== 'assistant') return '';
  if (m.swipes?.[m.sw]?.cut) return 'flag';
  return endsMidSentence(visibleProse(msgText(m))) ? 'text' : '';
}

// ── 사이 이름 · 변화 기록 (턴 기록에 얹는다) ──
export interface TiesRead { names: { from: string; to: string; name: string; kind: string }[]; shifts: ShiftInput[] }
/** 사서의 답(칸 이름을 맞춘 것)에서 사이 이름과 변화를 읽는다 — 관계선의 단계가 없어도 이름만 적힌 줄을 받는다 */
export function readTies(raw: LooseObj | null | undefined): TiesRead {
  const rows = (v: unknown) => (Array.isArray(v) ? v : []).filter(x => x && typeof x === 'object') as LooseObj[], out: TiesRead = { names: [], shifts: [] };
  for (const b of rows(raw?.bonds).slice(0, 14)) {
    let from = cleanStr(b.from, 60), to = cleanStr(b.to, 60); if (!to) { const p = splitArrow(from); if (p) [from, to] = p; }
    const name = cleanTieName(b.name), kind = tieKind(b.kind);
    if (from && to && ekey(from) !== ekey(to) && (name || kind)) out.names.push({ from, to, name, kind });
  }
  for (const s of rows(raw?.shifts).slice(0, 8)) { const c = cleanShift(s); if (c && out.shifts.length < 4 && !out.shifts.some(x => sameShift(x, c))) out.shifts.push(c); }
  return out;
}
const SHIFTS_MAX = 600;
/**
 * 읽은 사이 이름 · 변화를 서고에 적는다 (at: 턴 번호, msgId: 그 답변 — 답변이 지워지면 dropTies 가 되돌린다).
 * 이름이 이미 있는 사이는 관계가 실제로 움직였을 때만 바꾼다: 이번 답변이 그 줄의 단계를 새로 적었거나, 같은 방향의 관계 변화를 함께 적었을 때. 직접 고친 이름은 건드리지 않는다.
 * host: 여러 인물을 맡는 카드의 이름 — 그 이름으로는 적지 않는다. 반환 { named, shifts }
 */
export function applyTies(M: MemoryApi, mem: Mem, ties: TiesRead, at: number, msgId: string, host = ''): { named: number; shifts: number } {
  const key = (n: string) => ekey(M.canonName(mem, n)), isHost = (n: string) => !!host && key(n) === ekey(host); let named = 0, added = 0;
  const shifts = ties.shifts.filter(s => !isHost(s.who) && !(s.toward && isHost(s.toward)));
  for (const n of ties.names) {
    const row = (mem.bonds || []).find(b => M.bondKey(b.from, b.to) === M.bondKey(M.canonName(mem, n.from), M.canonName(mem, n.to)));
    if (!row || row.disabled || row.nameManual) continue;
    if (!n.name || (row.name && sameText(row.name, n.name))) { if (n.kind && !row.kind) row.kind = n.kind; continue; }
    const moved = M.bondNow(row)?.msgId === msgId || shifts.some(s => s.kind === 'relationship' && !!s.toward && key(s.who) === ekey(row.from) && key(s.toward) === ekey(row.to));   // 방향이 같은 변화만 — 한쪽 마음이 움직였다고 다른 쪽 이름까지 바뀌지 않는다
    if (row.name && !moved) continue;
    row.nameWas = row.name ? { name: row.name, kind: row.kind, turn: row.nameTurn, msgId: row.nameMsgId } : null;
    row.name = n.name; if (n.kind) row.kind = n.kind; row.nameTurn = at; row.nameMsgId = msgId; named++;
  }
  if (shifts.length) {
    const list = Array.isArray(mem.shifts) ? mem.shifts : (mem.shifts = []);
    for (const s of shifts) {
      const who = M.canonName(mem, s.who), toward = s.toward ? M.canonName(mem, s.toward) : '';
      if (!who || (toward && ekey(who) === ekey(toward))) continue;
      if (list.some(o => Math.abs(at - o.turn) <= 3 && sameShift({ ...o, toward: o.toward || '' } as ShiftInput, { ...s, who, toward }, ekey))) continue;   // 같은 변화를 몇 턴 안에 또 적은 것
      list.push({ id: uid(), kind: s.kind, who, ...(toward ? { toward } : {}), ...(s.from ? { from: s.from } : {}), to: s.to, ...(s.why ? { why: s.why } : {}), turn: at, msgId }); added++;
    }
    if (list.length > SHIFTS_MAX) mem.shifts = list.filter(s => s.manual).concat(list.filter(s => !s.manual).slice(-SHIFTS_MAX)).sort((a, b) => a.turn - b.turn);
  }
  return { named, shifts: added };
}
/** 한 답변이 적은 사이 이름 · 변화를 걷어 낸다 (그 답변이 지워지거나 다시 기록될 때) — 이름은 그 전 이름으로 */
export function dropTies(mem: Mem, msgId?: string): void {
  if (!msgId) return;
  if (Array.isArray(mem.shifts)) mem.shifts = mem.shifts.filter(s => s.msgId !== msgId || s.manual);
  for (const b of mem.bonds || []) {
    if (b.nameMsgId !== msgId || b.nameManual) continue;
    const w = b.nameWas;
    if (w?.name) { b.name = w.name; b.kind = w.kind; b.nameTurn = w.turn; b.nameMsgId = w.msgId || ''; } else { delete b.name; delete b.kind; delete b.nameTurn; delete b.nameMsgId; }
    delete b.nameWas;
  }
}
/** 턴 번호가 밀릴 때 변화 기록 · 사이 이름의 턴도 함께 옮긴다 (sh: 번호를 옮기는 함수) */
export function moveTies(mem: Mem, sh: (v: number) => number): void {
  for (const s of mem.shifts || []) { s.turn = sh(s.turn); if (s.span) s.span = [sh(s.span[0]), sh(s.span[1])]; }
  for (const b of mem.bonds || []) { if (b.nameTurn != null) b.nameTurn = sh(b.nameTurn); if (b.nameWas?.turn != null) b.nameWas.turn = sh(b.nameWas.turn); }
}
/** 사이 이름 · 종류를 직접 고친다 — 그 뒤로 사서가 덮어쓰지 않는다. 이름을 비우면 직접 고침을 풀고 이름을 지운다 */
export function setTieName(b: Bond, name: string, kind: string): void {
  const n = cleanStr(name, 60), k = tieKind(kind);
  if (!n) { delete b.name; delete b.nameManual; delete b.nameMsgId; delete b.nameTurn; delete b.nameWas; if (k) b.kind = k; else delete b.kind; return; }
  b.name = n; if (k) b.kind = k; else delete b.kind; b.nameManual = true; delete b.nameMsgId; delete b.nameWas;
}
/** 장면에 함께 있는 사람들끼리의 가장 최근 마음 (keys: 장면에 있는 사람 이름의 열쇠들) */
export function feelingRows(M: MemoryApi, mem: Mem, keys: Set<string>, max: number): FeelingRow[] {
  if (max <= 0 || keys.size < 2 || !((mem.shifts || []).length || (mem.bonds || []).some(b => b.name))) return [];
  const here = (n: string) => keys.has(ekey(M.canonName(mem, n)));
  return latestFeelings(mem.shifts || [], (mem.bonds || []).filter(b => !b.disabled && b.name).map(b => ({ from: b.from, to: b.to, name: b.name, turn: b.nameTurn })), here, n => ekey(M.canonName(mem, n)), max);
}
/** 이 턴까지 사이 이름 · 변화를 받아 두었다는 표시 (지난 요약 훑기가 이 턴을 다시 읽지 않는다) */
export const TIE_MARK = 'tie';

// ── 지난 요약에서 찾기 ──
interface ScanRow { from: number; to: number; text: string }
/** 한 번 누를 때의 호출 상한 · 호출 하나에 싣는 글자 수 · 변화 기록 상한(요약 하나당) */
const SCAN_CALLS = 4, SCAN_CHARS = 9000, SCAN_PER_ROW = 6;
/**
 * 아직 훑지 않은 지난 기록 — 요약(연대기 · 묶음)이 덮는 구간은 그 요약 글로, 요약이 아직 없는 구간은 턴 기록을 이어 붙여 읽는다. 원문 메시지는 읽지 않는다.
 * 훑었는지는 턴마다 적어 둔다(turn.tie) — 요약이 나중에 합쳐지거나 다시 만들어져도 같은 구간을 두 번 읽지 않는다
 */
export function tieScanRows(_M: MemoryApi, mem: Mem): ScanRow[] {
  const T = mem.turns.length, todo = (a: number, b: number) => { for (let i = Math.max(0, a); i <= b && i < T; i++) if (!mem.turns[i][TIE_MARK] && !mem.turns[i].failed) return true; return false; };
  const rows: ScanRow[] = [], covered = new Array<boolean>(T).fill(false);
  for (const s of [...mem.arcs.filter(a => !a.carried), ...mem.chunks].sort((a, b) => a.from - b.from)) {
    for (let i = Math.max(0, s.from); i <= s.to && i < T; i++) covered[i] = true;
    if (String(s.text || '').trim() && todo(s.from, s.to)) rows.push({ from: s.from, to: s.to, text: String(s.text).trim() });
  }
  // 요약이 아직 없는 구간: 턴 기록을 스무 개까지 묶어 한 줄로
  let run: number[] = [];
  const flush = () => { if (run.length) { const text = run.map(i => mem.turns[i].digest).filter(Boolean).join('\n'); if (text) rows.push({ from: run[0], to: run[run.length - 1], text: text.slice(0, 2800) }); run = []; } };
  for (let i = 0; i < T; i++) { const t = mem.turns[i]; if (covered[i] || t[TIE_MARK] || t.failed || !t.digest) { flush(); continue; } run.push(i); if (run.length >= 20) flush(); }
  flush();
  return rows.sort((a, b) => a.from - b.from);
}
/** 「찾기」가 할 일의 크기 — 읽을 요약 수와 모델 호출 수 (한 번 누를 때의 상한까지) */
export function tieScanPlan(M: MemoryApi, mem: Mem): { rows: number; calls: number; more: boolean } {
  const rows = tieScanRows(M, mem); let calls = 0, room = 0;
  for (const r of rows) { if (!calls || room < r.text.length) { calls++; room = SCAN_CHARS; } room -= r.text.length; }
  return { rows: rows.length, calls: Math.min(calls, SCAN_CALLS), more: calls > SCAN_CALLS };
}
/**
 * 지난 요약에서 사이 이름 · 변화를 찾아 채운다 (모델 호출: 한 번 누를 때 SCAN_CALLS 번까지 · 요약 글만 읽는다).
 * 이름이 이미 있는 사이는 건드리지 않고, 같은 변화가 이미 있으면 다시 적지 않는다. 읽은 구간의 턴에는 표시를 남겨 다음에는 건너뛴다.
 * 반환 { calls, named, shifts, left(아직 남은 요약 수) }. onProgress(done, total)
 */
export async function scanTies(M: MemoryApi, chat: ChatM, mem: Mem, { signal, onProgress }: { signal?: AbortSignal; onProgress?: (done: number, total: number) => void } = {}): Promise<{ calls: number; named: number; shifts: number; left: number }> {
  const all = tieScanRows(M, mem), batches: ScanRow[][] = []; let room = 0;
  for (const r of all) { if (!batches.length || room < r.text.length) { if (batches.length >= SCAN_CALLS) break; batches.push([]); room = SCAN_CHARS; } batches[batches.length - 1].push(r); room -= r.text.length; }
  let calls = 0, named = 0, added = 0, done = 0; const host = hostOf(M, chat, mem), note = host.many ? hostNote(host.label) : '';
  const key = (n: string) => ekey(M.canonName(mem, n)), isHost = (n: string) => host.many && key(n) === ekey(host.label);
  for (const batch of batches) {
    if (signal?.aborted) break;
    onProgress?.(calls, batches.length);
    const rowTags = new Map(batch.map((r, i) => [`R${i + 1}`, r]));
    const unnamed = (mem.bonds || []).filter(b => !b.disabled && !b.name && M.bondNow(b)).slice(0, 24), bondTags = new Map(unnamed.map((b, i) => [`B${i + 1}`, b]));
    const user = `${note}${bondTags.size ? `Relationships on file without a name:\n${[...bondTags].map(([tag, b]) => `[${tag}] ${b.from} → ${b.to}: ${M.bondNow(b)!.stage}`).join('\n')}\n\n` : ''}Summaries:\n${[...rowTags].map(([tag, r]) => `[${tag}]\n${r.text}`).join('\n\n')}`;
    const reply = await M.call(chat, `${TIES_SCAN_PROMPT}${M.langLine()}`, user, 3000, signal, 'summary'); calls++;
    if ((M.get(mem.id) || mem) !== mem) break;   // 기다리는 사이 서고가 바뀌었다 (되돌리기 · 불러오기) — 낡은 답은 버린다
    const parsed = canonRecord(parseLooseEx(reply).value) as (LooseObj & { names?: unknown }) | null;
    if (!parsed) continue;   // 읽지 못한 답 — 이 구간은 표시하지 않고 남겨 둔다 (다음에 다시)
    const tagOf = (v: unknown) => String(v ?? '').trim().replace(/[\[\]]/g, '').toUpperCase();
    for (const n of (Array.isArray(parsed.names) ? parsed.names : []) as LooseObj[]) {
      if (!n || typeof n !== 'object') continue;
      const name = cleanTieName(n.name ?? n.label), kind = tieKind(n.kind ?? n.type); if (!name) continue;
      let row = bondTags.get(tagOf(n.tag ?? n.id));
      if (!row && n.from && n.to) {   // 명단에 없던 사이: 두 사람이 모두 서고의 인물일 때만 줄을 연다
        const from = M.canonName(mem, cleanStr(n.from, 60)), to = M.canonName(mem, cleanStr(n.to, 60)), known = (x: string) => mem.cast.some(c => !c.disabled && ekey(c.name) === ekey(x));
        if (!from || !to || isHost(from) || isHost(to) || !known(from) || !known(to)) continue;
        row = (mem.bonds || []).find(b => M.bondKey(b.from, b.to) === M.bondKey(from, to)) || M.upsertBond(mem, { from, to, stage: name }, batch[batch.length - 1].to) || undefined;
      }
      if (!row || row.disabled || row.name || row.nameManual) continue;
      row.name = name; if (kind) row.kind = kind; row.nameTurn = batch[batch.length - 1].to; named++;
    }
    const per = new Map<ScanRow, number>(), list = Array.isArray(mem.shifts) ? mem.shifts : (mem.shifts = []);
    for (const s of (Array.isArray(parsed.shifts) ? parsed.shifts : []) as LooseObj[]) {
      const c = cleanShift(s), r = rowTags.get(tagOf((s as LooseObj)?.at ?? (s as LooseObj)?.tag)) || (batch.length === 1 ? batch[0] : undefined); if (!c || !r || (per.get(r) || 0) >= SCAN_PER_ROW) continue;
      const who = M.canonName(mem, c.who), toward = c.toward ? M.canonName(mem, c.toward) : '';
      if (!who || isHost(who) || (toward && (isHost(toward) || ekey(who) === ekey(toward)))) continue;
      if (list.some(o => o.turn >= r.from - 1 && o.turn <= r.to + 1 && sameShift({ ...o, toward: o.toward || '' } as ShiftInput, { ...c, who, toward }, ekey))) continue;   // 이미 적혀 있는 변화 (기록할 때 받았거나 앞서 찾은 것)
      list.push({ id: uid(), kind: c.kind, who, ...(toward ? { toward } : {}), ...(c.from ? { from: c.from } : {}), to: c.to, ...(c.why ? { why: c.why } : {}), turn: r.to, span: [r.from, r.to], scan: true } as Shift);
      per.set(r, (per.get(r) || 0) + 1); added++;
    }
    for (const r of batch) for (let i = Math.max(0, r.from); i <= r.to && i < mem.turns.length; i++) mem.turns[i][TIE_MARK] = true;
    list.sort((a, b) => a.turn - b.turn);
    done += batch.length;
  }
  onProgress?.(calls, batches.length);
  return { calls, named, shifts: added, left: Math.max(0, all.length - done) };
}
