// 작중 달력 · 날 세기 · 작가 계획 · 인물별 모아 보기 · 회상 시험 — 화면이 부르는 조회 · 편집 함수들 (서고를 고친 뒤 저장은 부르는 쪽이 한다)
import { S, uid, now } from '../../lib/core';
import type { MemoryApi } from './api';
import type { Bond, CastCard, ChatM, Mem, MemItem, Msg, Pledge, StatusRow, Tracker } from '../types';
import { ekey, low, cleanStr, normLockKind, parseLoose } from './base';
import { parseStoryDate, storyDatesOf, isIsoDate, trackerText, trackerLineOf, veilLeaks } from '../calendar';
import { VEIL_PROMPT, SWEEP_PROMPT } from '../directives';
import { groundedIn, soundsHedged, threadTouched } from '../craft';
import { t as tr } from '../../i18n';

/** 인물 한 사람에 얽힌 기록을 모은 것 (인물별 화면용) */
export interface PersonView {
  name: string; card: CastCard | null;
  /** 지금 상태 줄 (믿음 포함) */ states: StatusRow[];
  /** 이 사람이 남을 대하는 줄 · 남이 이 사람을 대하는 줄 */ bondsOut: Bond[]; bondsIn: Bond[];
  /** 이 사람이 나오는 공개 기억 */ memories: MemItem[];
  /** 이 사람이 쥔 속마음 · 비밀 */ own: MemItem[];
  /** 남의 비밀 가운데 이 사람이 아는 것 · 짐작만 하는 것 */ knows: MemItem[]; suspects: MemItem[];
  /** 온전히 기억하지 못하는 일 */ dim: MemItem[];
  /** 이 사람이 얽힌 서약 */ pledges: Pledge[];
  /** 이 사람에게 걸린 날 세기와 지금 글 */ trackers: { tracker: Tracker; text: string }[];
}
export interface RecallTestRow { id: string; kind: string; summary: string; hidden: boolean; reason: string; score: number }
export interface RecallTest { rows: RecallTestRow[]; chapter: string; cards: string[]; transcript: string[] }

export interface Part6 {
  /** 턴마다의 작중 날짜 ('' = 모름) · 지금 날짜 */
  storyDates(mem: Mem): string[];
  storyToday(mem: Mem): string;
  /** 턴의 "언제" 글에서 달력 날짜를 다시 읽어 적는다. 반환: 바뀐 턴 수 */
  restampDates(mem: Mem): number;
  /** 작중 날짜 직접 고침: 그 메시지(번호 0부터)를 덮는 턴부터 그 날짜로 잇는다. date 가 비면 고침을 지운다. 반환: 고친 턴의 답변 id ('' = 그 메시지를 덮는 기록이 없다) */
  setDateFix(mem: Mem, msgs: Msg[], msgIndex: number, date: string | null): string;
  addTracker(mem: Mem, input: Partial<Tracker>): Tracker | null;
  updateTracker(mem: Mem, id: string, patch: Partial<Tracker>): Tracker | null;
  removeTracker(mem: Mem, id: string): boolean;
  /** 날 세기마다 지금 글 (날짜를 모르면 text 는 '') */
  trackerRows(mem: Mem): { tracker: Tracker; text: string }[];
  /** 장부에 싣는 한 줄 — present: 지금 장면에 있는 사람 이름들 (없으면 '늘 싣기'와 사람이 정해지지 않은 것만) */
  trackerLine(mem: Mem, present?: string[]): string;
  /** 작가 계획의 가린 줄을 직접 정한다. 답을 흘리는 줄이면 적지 않고 leak: true */
  setVeil(mem: Mem, id: string, veil: string): { ok: boolean; leak: boolean };
  /** 가린 줄이 없는 작가 계획에 가린 줄을 받아 적는다 (모델 호출 1번 · 답을 흘리는 줄은 버린다) */
  veilPlans(chat: ChatM, mem: Mem, signal?: AbortSignal): Promise<{ made: number; rejected: number }>;
  /** 아는 사람 · 짐작하는 사람을 손으로 정한다 — 그 뒤로 사서가 덮어쓰지 않는다 */
  setKnowers(mem: Mem, id: string, who: { knowers?: string[]; guessers?: string[] } | null): boolean;
  personView(mem: Mem, name: string): PersonView;
  /** 서약 훑기 — 오래된 서약을 지금까지의 요약과 견주어 끝난 것에 "풀린 듯" 의견을 붙인다 (모델 호출 1번 · 닫거나 지우지 않는다). 반환 { checked(본 서약 수), flagged(의견을 붙인 수) } */
  sweepPledges(chat: ChatM, mem: Mem, signal?: AbortSignal): Promise<{ checked: number; flagged: number }>;
  /** 대화마다 한 번, 그 뒤로는 정해 둔 턴 수(pledgeSweepTurns)마다 서약을 훑는다. 실패해도 다음 주기까지 기다린다 */
  maybeSweepPledges(chat: ChatM, mem: Mem, signal?: AbortSignal): Promise<void>;
  /** "이 말을 보내면 무엇이 떠오르나" — 장부를 짓지 않고 회상만 해 본다 (학습 · 쉬어가기 기록에 남지 않는다) */
  recallTest(chat: ChatM, text: string, msgs?: Msg[] | null): RecallTest;
}

const TRACKER_MAX = 30;
/** 서약 훑기가 한 번에 보는 서약 수 · 요약에 싣는 글자 수 */
const SWEEP_MAX = 20, SWEEP_STORY = 30000;
function cleanTracker(input: Partial<Tracker>, base?: Tracker): Tracker | null {
  const t = { ...(base || {}), ...input } as Tracker, type = (['count', 'until', 'cycle'] as const).find(x => x === t.type) || 'count', label = cleanStr(t.label, 40);
  if (!label) return null;
  const out: Tracker = { id: base?.id || 'k' + uid(), label, type, people: [...new Set((t.people || []).map(p => cleanStr(p, 60)).filter(Boolean))].slice(0, 2), inject: t.inject === 'always' || t.inject === 'never' ? t.inject : 'present', created: base?.created || now(), updated: now() };
  if (t.disabled) out.disabled = true;
  if (type === 'count') { if (!isIsoDate(t.start)) return null; out.start = t.start; out.firstDay = t.firstDay === 0 ? 0 : 1; }
  if (type === 'until') { if (!isIsoDate(t.target)) return null; out.target = t.target; }
  if (type === 'cycle') { const every = Math.round(Number(t.every) || 0); if (!(every >= 1 && every <= 3660)) return null; out.every = every; out.length = Math.max(1, Math.min(every, Math.round(Number(t.length) || 1))); out.starts = [...new Set((t.starts || []).filter(isIsoDate))].sort().slice(-12); }
  return out;
}

export const part6: Part6 & ThisType<MemoryApi> = {
  storyDates(mem) { return storyDatesOf(mem.turns, mem.dateFix); },
  storyToday(mem) { const d = this.storyDates(mem); return d[d.length - 1] || ''; },
  restampDates(mem) {
    let n = 0, base = '';
    for (const t of mem.turns) { const d = parseStoryDate(t.when, base); if (d) base = d; if ((t.date || '') !== d) { if (d) t.date = d; else delete t.date; n++; } }
    return n;
  },
  setDateFix(mem, msgs, msgIndex, date) {
    const order = new Map(msgs.map((m, i) => [m.id, i])), turn = mem.turns.find(t => (order.get(t.msgId) ?? -1) >= msgIndex); if (!turn) return '';
    const rest = (mem.dateFix || []).filter(f => f.msgId !== turn.msgId);
    mem.dateFix = date && isIsoDate(date) ? [...rest, { msgId: turn.msgId, date }].slice(-40) : rest;
    if (!mem.dateFix.length) delete mem.dateFix;
    return turn.msgId;
  },
  addTracker(mem, input) { const t = cleanTracker(input); if (!t || (mem.trackers || []).length >= TRACKER_MAX) return null; t.people = (t.people || []).map(p => this.canonName(mem, p)); mem.trackers = [...(mem.trackers || []), t]; return t; },
  updateTracker(mem, id, patch) { const i = (mem.trackers || []).findIndex(t => t.id === id); if (i < 0) return null; const t = cleanTracker(patch, mem.trackers![i]); if (!t) return null; t.people = (t.people || []).map(p => this.canonName(mem, p)); mem.trackers![i] = t; return t; },
  removeTracker(mem, id) { const n = (mem.trackers || []).length; mem.trackers = (mem.trackers || []).filter(t => t.id !== id); if (!mem.trackers.length) delete mem.trackers; return (mem.trackers || []).length < n; },
  trackerRows(mem) { const today = this.storyToday(mem); return (mem.trackers || []).map(tracker => ({ tracker, text: trackerText(tracker, today) })); },
  trackerLine(mem, present = []) { return trackerLineOf(mem.trackers, this.storyToday(mem), new Set(present.map(n => ekey(this.canonName(mem, n)))), n => ekey(this.canonName(mem, n))); },
  setVeil(mem, id, veil) {
    const p = mem.pledges.find(x => x.id === id); if (!p) return { ok: false, leak: false };
    const v = cleanStr(veil, 200); if (!v) { delete p.veil; return { ok: true, leak: false }; }
    if (veilLeaks(v, p.summary, mem.cast.flatMap(c => [c.name, ...(c.aka || [])]))) return { ok: false, leak: true };
    p.veil = v; return { ok: true, leak: false };
  },
  async veilPlans(chat, mem, signal) {
    const plans = mem.pledges.filter(p => normLockKind(p.kind) === 'author_plan' && p.status === 'active' && !p.veil).slice(0, 8), tags = new Map(plans.map((p, i) => [`a${i + 1}`, p]));
    if (!plans.length) return { made: 0, rejected: 0 };
    const names = mem.cast.flatMap(c => [c.name, ...(c.aka || [])]);
    const parsed = await this.callJson(chat, VEIL_PROMPT, [...tags].map(([tag, p]) => `[${tag}] ${p.summary}`).join('\n'), 1200, signal, 'light') as { veils?: { tag?: unknown; veil?: unknown }[] } | null;
    let made = 0, rejected = 0;
    for (const v of Array.isArray(parsed?.veils) ? parsed!.veils! : []) {
      const p = tags.get(String(v?.tag || '').trim().toLowerCase()), veil = cleanStr(v?.veil, 200); if (!p || !veil || p.veil) continue;
      if (veilLeaks(veil, p.summary, names)) { rejected++; continue; }
      p.veil = veil; made++;
    }
    return { made, rejected };
  },
  setKnowers(mem, id, who) {
    const m = mem.memories.find(x => x.id === id); if (!m) return false;
    if (!who) { delete m.knowLock; return true; }
    const names = (xs?: string[]) => [...new Set((xs || []).map(n => this.canonName(mem, cleanStr(n, 60))).filter(Boolean))];
    if (who.knowers) m.knowers = names(who.knowers).filter(n => ekey(n) !== ekey(m.owner || ''));
    if (who.guessers) { const known = new Set([m.owner || '', ...(m.knowers || [])].map(ekey)); const g = names(who.guessers).filter(n => !known.has(ekey(n))); if (g.length) m.guessers = g; else delete m.guessers; }
    m.knowLock = true; delete m.learned;
    return true;
  },
  personView(mem, name) {
    const canon = this.canonName(mem, name), card = mem.cast.find(c => ekey(c.name) === ekey(canon)) || null, keys = new Set([canon, ...(card?.aka || [])].map(ekey));
    const is = (n?: string | null) => !!n && keys.has(ekey(n)), any = (xs?: string[]) => (xs || []).some(is), live = (m: MemItem) => !m.disabled;
    const hay = [canon, ...(card?.aka || [])].map(low).filter(n => n.length >= 2), today = this.storyToday(mem);
    return {
      name: canon, card,
      states: mem.status.filter(s => is(s.entity) && s.expired == null),
      bondsOut: (mem.bonds || []).filter(b => !b.disabled && is(b.from)), bondsIn: (mem.bonds || []).filter(b => !b.disabled && is(b.to)),
      memories: mem.memories.filter(m => live(m) && m.visibility === 'public' && !(m.tags || []).includes('episode_raw') && any(m.entities)),
      own: mem.memories.filter(m => live(m) && m.visibility !== 'public' && is(m.owner)),
      knows: mem.memories.filter(m => live(m) && m.visibility !== 'public' && !is(m.owner) && any(m.knowers)),
      suspects: mem.memories.filter(m => live(m) && any(m.guessers)),
      dim: mem.memories.filter(m => live(m) && (m.dim || []).some(d => is(d.who))),
      pledges: mem.pledges.filter(p => p.status !== 'resolved' && (is(p.owner) || hay.some(n => low(`${p.summary} ${p.latest?.text || ''}`).includes(n)))),
      trackers: (mem.trackers || []).filter(t => any(t.people)).map(tracker => ({ tracker, text: trackerText(tracker, today) })),
    };
  },
  /**
   * 서약 훑기. 묶음 요약의 떡밥 점검은 그 구간에서 풀린 것만 본다 — 풀린 대목이 요약된 뒤에 적힌 서약, 드러난 적 없이 그 대목 자체가 끝나 버린 비밀은 끝내 닫히지 않고 "지켜야 할 것"으로 남는다.
   * 그래서 요약이 다룬 구간보다 앞서 적힌 서약을 지금까지의 요약 전체와 한 번 견준다 (가장 오래 살펴보지 않은 것부터 SWEEP_MAX 개).
   * 요약에서 글자 그대로 옮긴 근거 글귀가 있고 말끝을 흐리지 않은 판정에만 "풀린 듯" 의견을 붙인다 — 닫거나 지우지 않는다 (의견이 붙은 서약을 실을지는 장부가 가린다: 직접 적은 것 · 최우선은 그대로 실린다).
   * 볼 서약이나 요약이 없으면 모델을 부르지 않는다
   */
  async sweepPledges(chat, mem, signal) {
    const T = mem.turns.length, covered = this.summaryCoveredTurn(mem);
    const story = [...mem.arcs.filter(a => a.carried), ...[...mem.arcs.filter(a => !a.carried), ...mem.chunks].sort((a, b) => a.from - b.from)].map(s => String(s.text || '').trim()).filter(Boolean).join('\n\n').slice(-SWEEP_STORY);
    const rows = mem.pledges.filter(l => l.status === 'active' && !l.suggestResolved && !l.upheld && normLockKind(l.kind) !== 'author_plan' && threadTouched(l) < covered)
      .sort((a, b) => (a.checkedTurn ?? -1) - (b.checkedTurn ?? -1) || threadTouched(a) - threadTouched(b)).slice(0, SWEEP_MAX), tags = new Map(rows.map((l, i) => [`p${i + 1}`, l]));
    mem.pledgeSweepAt = T;
    if (!rows.length || !story) return { checked: 0, flagged: 0 };
    const parsed = parseLoose(await this.call(chat, `${SWEEP_PROMPT}${this.langLine()}`, `The story so far:\n${story}\n\nPledges on file:\n${[...tags].map(([tag, l]) => `[${tag}] (${normLockKind(l.kind)}) ${l.summary}${l.latest?.text ? ` — now: ${l.latest.text}` : ''}`).join('\n')}`, 1500, signal, 'summary')) as { done?: { tag?: unknown; how?: unknown; said?: unknown }[] } | null;
    if ((this.get(mem.id) || mem) !== mem) return { checked: 0, flagged: 0 };   // 기다리는 사이 서고가 바뀌었다 (되돌리기 · 불러오기) — 낡은 판정은 버린다
    let flagged = 0;
    for (const d of Array.isArray(parsed?.done) ? parsed!.done! : []) {
      const l = tags.get(String(d?.tag || '').trim().toLowerCase().replace(/[\[\]]/g, '')), how = cleanStr(d?.how, 200);
      if (!l || l.status !== 'active' || l.suggestResolved || !groundedIn(d?.said, story) || soundsHedged(how)) continue;
      l.suggestResolved = true; l.suggestTurn = Math.max(0, covered - 1); l.suggestBy = ''; l.suggestHow = how || null; flagged++;
    }
    for (const l of rows) l.checkedTurn = Math.max(l.checkedTurn ?? -1, T - 1);
    return { checked: rows.length, flagged };
  },
  async maybeSweepPledges(chat, mem, signal) {
    const every = Math.round(Number(this.cfg().pledgeSweepTurns) || 0), T = mem.turns.length; if (every < 1) return;
    if (mem.pledgeSweepAt != null && mem.pledgeSweepAt > T) mem.pledgeSweepAt = T;   // 기록이 걷혀 턴 수가 줄었으면 그때부터 다시 센다
    if (mem.pledgeSweepAt != null ? T - mem.pledgeSweepAt < every : !(mem.chunks.length + mem.arcs.length)) return;   // 첫 훑기는 요약이 하나라도 생긴 뒤에
    try { const r = await this.sweepPledges(chat, mem, signal); if (r.flagged) this.logActivity('summary', tr('memoria.engine.log.pledgeSweep', { n: r.flagged })); }
    catch (e: any) { if (e?.name === 'AbortError' || signal?.aborted) throw e; mem.pledgeSweepAt = T; console.warn('[장기기억] 서약 훑기 실패 (다음 주기에 재시도)', e); }
  },
  recallTest(chat, text, msgs) {
    const mem = this.get(chat.id), q = String(text || '').trim(); if (!mem || !q) return { rows: [], chapter: '', cards: [], transcript: [] };
    const list = Array.isArray(msgs) ? msgs : undefined, P = this.buildPacketSections(chat, mem, [], { query: q, ...(list ? { msgs: list } : {}), noDirection: true, rawRecall: true });
    const row = (m: MemItem, hidden: boolean): RecallTestRow => { const tr = P.trace.get(m.id); return { id: m.id, kind: m.kind, summary: m.summary, hidden, reason: tr?.reason || '', score: tr?.score || 0 }; };
    return {
      rows: [...P.publicRecall.map(m => row(m, false)), ...P.protectedRecall.map(m => row(m, true))],
      chapter: P.summaries.find(s => s.recalled)?.text || '',
      cards: (P.cards || []).map(c => [c.head, ...c.lines].join('\n')),
      transcript: (P.transcript || []).map(h => h.lines.map(l => `${l.who}: ${l.text}`).join('\n')).filter(Boolean),
    };
  },
};
// 지금 열린 방의 페르소나 이름 (없으면 '')
export const personaNameOf = (chat: ChatM | null | undefined) => { try { return chat ? S.persona(chat)?.name || '' : ''; } catch { return ''; } };
