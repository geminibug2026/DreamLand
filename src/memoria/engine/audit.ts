// 검사 — 어긋난 곳 자동 감지(답 N개마다 호출 1회) · 요약의 번호 점검과 채점 · 수정 · 답변 뒤 기억 작업의 장부(끊기거나 실패해도 나중에 잇는다)
// 모델을 부르는 일은 모두 기록과 같은 줄(Memory.enqueue)에 세운다 — 보조 모델을 동시에 두 번 부르지 않고, 답변을 받는 동안에는 시작하지 않는다
import { S, emit, on, uid, msgText } from '../../lib/core';
import { tokens } from '../../lib/engine';
import { t as tr, getLang } from '../../i18n';
import type { CheckIssue, ChatM, Cfg, Mem, Msg } from '../types';
import { Memory } from './memory';
import { G, PACKET_FOOTER, PACKET_HEADER, cleanMultiline, cleanStr, mesHashOf, parseLoose, sanitizeRecord, visibleProse } from './base';
import { withDeadline } from '../craft';
import { applySumFix, checkEveryOf, checkModeOf, evidenceRows, excerptsFor, gradeEveryOf, liveFindings, pendingGaps, readFindings, readGrade, readRepair, repairBad, repliesSince, sumChecks, sumSecs, textHash, NOTE_REPLIES } from './auditCore';
import type { AuditState, CheckMode, DriftFinding, DriftReport, DriftSrc, DriftWin, GradeReport, SumIssue, SumSec } from './auditCore';

// ════════ 모델에게 보내는 지시 ════════
const LANG_NAME: Record<string, string> = { ko: 'Korean', en: 'English', 'zh-CN': 'Simplified Chinese' };
const sayIn = () => LANG_NAME[getLang()] || 'Korean';
const driftPrompt = () => `You audit a stretch of an ongoing roleplay for continuity. You get the story's archive (what has been recorded so far) and the latest messages in order. Check ONLY the messages marked check="yes" against the archive; the other messages are there for context. You never rewrite anything.

How to judge:
- The story moves forward. A change the messages themselves show or explain — a move to another place, a healed wound, a new object, a relationship that shifted, time passing — is not a contradiction. The archive may lag a few replies behind the messages.
- Report only a plain contradiction of what the archive records, as one of these kinds:
  "fact" — a recorded fact is told differently: a name, a place, an injury, an object, who did what, a promise;
  "knows" — a character acts on or mentions something the archive shows they do not know: a secret, an event they did not witness;
  "address" — a character uses a form of address or a speech level that conflicts with how the archive records them speaking to that person;
  "time" — the order of events, the date, the day count or the time of day conflicts with the archive.
- Never report style, a new detail, a plausible development, or something the archive simply does not mention. When in doubt, leave it out — an empty list is the usual answer.

Reply with ONE minified JSON object and nothing else:
{"findings":[{"n":165,"kind":"fact","quote":"short exact quote from that message","evidence":"short exact quote, copied character for character from the archive, that states the recorded fact","problem":"one sentence: what the message says and what the record says — written in ${sayIn()}"}]}
"n" is the number of the checked message. Use an empty array when nothing is wrong.`;
const gradePrompt = () => `You grade "story so far" records of a roleplay chat against the original messages they summarize. Each record is tagged like [S2] with the message range it covers and is followed by excerpts of those messages. Not every message is shown, and " … " marks a cut inside a message.

Report only problems you can point to in the excerpts:
- "wrong": the record states something the messages contradict — who did what, a name, a place, the order of events, a number, a date;
- "missing": something that clearly matters later — a decision, a promise, a reveal, a lasting change — is in the messages but nowhere in the record;
- "invented": the record states something specific about a scene whose messages ARE shown, and those messages give no basis for it. Never use this just because a message is not shown.
Do not report wording, style, the order of bullets, or small omissions. An empty list is a fine answer.

Reply with ONE minified JSON object and nothing else:
{"items":[{"sec":"S2","kind":"wrong","text":"one sentence: what is off and what the messages show — written in ${sayIn()}","refs":[131,140]}]}
"refs" are one to three message numbers that show it.`;
const REPAIR_PROMPT = `You repair "story so far" records of a roleplay chat. For each record you get its current text, the problems found in it, the turn notes on file for the same stretch, and excerpts of the original messages.

Rewrite each record so the listed problems are fixed and everything else stays as it is: the same structure (the WHEN / PLOT / SHIFTS / OPEN lines it already uses), the same language, the same level of detail, and the same facts wherever they were not flagged. Never shorten a record and never drop a line that was not flagged. Add nothing the notes or excerpts do not show. Numbers, dates and names appear only as the material states them. Keep quoted dialogue word for word.

Output every record in full, each under its own marker line, and nothing else — no commentary before, between or after:
=== S1 ===
(the full rewritten record)`;

// ════════ 지금 하는 일 (상태 줄) ════════
export type JobKind = 'record' | 'drift' | 'grade' | 'repair' | 'fill';
export interface JobStatus { kind: JobKind; chatId: string; text: string; waiting: number }
const running: { kind: JobKind; chatId: string }[] = [];
const jobStatus = (): JobStatus | null => {
  const j = running[0]; if (!j) return null;
  const paused = G.chatGenerating && Memory.cfg().yieldToChat, waiting = running.length - 1;
  return { ...j, waiting, text: tr('memoria.audit.job.' + j.kind) + (paused ? tr('memoria.audit.job.paused') : '') + (waiting ? tr('memoria.audit.job.waiting', { n: waiting }) : '') };
};
const tell = () => emit('memory:job', jobStatus());
/** 줄에 선 순서대로 적어 둔다 — 맨 앞이 지금 하는 일이다 */
async function track<T>(kind: JobKind, chatId: string, fn: () => Promise<T>): Promise<T> {
  const j = { kind, chatId }; running.push(j); tell();
  try { return await fn(); } finally { const i = running.indexOf(j); if (i >= 0) running.splice(i, 1); tell(); }
}

// ════════ 답변 뒤 기록의 장부 — 방을 나가거나 창을 닫아도, 실패해도 남아 있다가 다시 줄에 선다 ════════
interface Owed { chatId: string; msgId: string; tries: number; next?: number; at: number }
const OWED_KEY = 'dreamland.memoria.owed', MAX_TRIES = 4;
const loadOwed = (): Owed[] => { try { const v = JSON.parse(globalThis.localStorage?.getItem(OWED_KEY) || '[]'); return Array.isArray(v) ? v.filter(o => o && typeof o.chatId === 'string' && typeof o.msgId === 'string') : []; } catch { return []; } };
let owed: Owed[] = loadOwed(), draining = false, drainTimer: ReturnType<typeof setTimeout> | null = null;
const saveOwed = () => { try { globalThis.localStorage?.setItem(OWED_KEY, JSON.stringify(owed.slice(-40))); } catch { /* 적지 못해도 이번 창에서는 그대로 돈다 */ } };
const inFlight = new Set<string>(), retried = new Map<string, number>();
const drainSoon = (ms: number) => { if (drainTimer) clearTimeout(drainTimer); drainTimer = setTimeout(() => { drainTimer = null; void Auditor.drain(); }, ms); };

// ════════ 작은 도구 ════════
const stateOf = (mem: Mem): AuditState => (mem.audit ||= {});
const stale = (chat: ChatM, mem: Mem) => !S.get('chats', chat.id) || (Memory.get(chat.id) || mem) !== mem;
const nameOf = (chat: ChatM) => { const persona = S.persona(chat); return (m: Msg) => m.name || (m.role === 'user' ? persona?.name || 'User' : S.get('chars', m.charId)?.name || 'Character'); };
const auditable = (m?: Msg | null) => !!m && m.role === 'assistant' && !m.hidden && !m.greeting && !m.viaCommand && !Memory.isSideMessage(m) && visibleProse(msgText(m)).trim().length >= 20;
/** 근거가 나온 곳을 한 줄로 — "요약 · 3일째 저녁 · #121–#150" */
export const srcLabel = (src?: DriftSrc | null) => !src ? '' : [tr('memoria.audit.src.' + src.kind), src.name, src.from ? `#${src.from}${src.to && src.to > src.from ? `–#${src.to}` : ''}` : ''].filter(Boolean).join(' · ');
const toIssue = (f: DriftFinding): CheckIssue => ({ quote: f.quote, problem: `${f.kind === 'address' ? '[말투] ' : ''}${f.text}`, evidence: f.evidence, source: srcLabel(f.src), ...(f.ok ? {} : { why: tr('memoria.engine.check.noEvidence') }) });
const sumCount = (mem: Mem) => mem.chunks.length + mem.arcs.length;
const knownNames = (chat: ChatM) => [S.persona(chat)?.name, ...(chat.charIds || []).map(id => S.get('chars', id)?.name)].filter((n): n is string => !!n);

export const Auditor = {
  // ════════ 설정 ════════
  mode(): CheckMode { return checkModeOf(Memory.cfg()); },
  every(): number { return checkEveryOf(Memory.cfg()); },
  /** 검사 방식을 정한다 — 답변마다(replyCheck)와 묶어서는 한 설정이다: 하나를 고르면 다른 쪽은 꺼진다 */
  setMode(mode: CheckMode, every?: number) {
    const m = S.settings.memory as Cfg; m.checkMode = mode; m.replyCheck = mode === 'each';
    if (every) m.checkEvery = Math.max(2, Math.min(30, Math.round(every)));
    S.set({ memory: { ...m } });
  },
  state: stateOf,

  // ════════ 1. 어긋난 곳 — 답 N개마다 한 번 ════════
  /** 마지막 검사 뒤로 쌓인 답 수와 다음 검사까지 남은 수. anchored: 세기 시작한 자리가 있는가 */
  due(mem: Mem, msgs: Msg[]) {
    const st = mem.audit || {}, every = this.every(), from = st.driftAt === '^' ? -1 : st.driftAt ? msgs.findIndex(m => m.id === st.driftAt) : -2;
    if (from < -1 || (st.driftAt !== '^' && from < 0)) return { count: 0, need: every, anchored: false, from: -1 };
    let count = 0; for (let i = msgs.length - 1; i > from; i--) if (auditable(msgs[i])) count++;
    return { count, need: Math.max(0, every - count), anchored: true, from };
  },
  /** 끝에서부터 검사할 만한 답 n 개 (대화 순서) — after 뒤의 것만 */
  lastReplies(msgs: Msg[], n: number, after = -1): Msg[] {
    const out: Msg[] = []; for (let i = msgs.length - 1; i > after && out.length < n; i--) if (auditable(msgs[i])) out.unshift(msgs[i]);
    return out;
  },
  /** 새 답변이 왔다 (묶어서 검사할 때만) — N개가 찼으면 검사를 줄에 세운다. 처음이면 세기 시작할 자리만 적는다 (호출 없음) */
  onReply(chat: ChatM, msgs: Msg[], msg: Msg): Promise<DriftReport | null> | null {
    const cfg = Memory.cfg(); if (!cfg.enabled || this.mode() !== 'batch' || !chat || !auditable(msg)) return null;
    const mem = Memory.get(chat.id); if (!mem) return Memory.load(chat.id).then(() => Memory.get(chat.id) ? this.onReply(chat, msgs, msg) : null);
    const d = this.due(mem, msgs);
    if (!d.anchored) { const at = msgs.indexOf(msg), prev = this.lastReplies(msgs.slice(0, Math.max(0, at)), 1)[0]; stateOf(mem).driftAt = prev?.id || '^'; void Memory.save(mem).catch(e => console.warn('[장기기억] 검사 자리 저장', e)); return null; }
    if (d.count < this.every()) return null;
    return this.runDrift(chat, msgs);
  },
  /** 검사 한 번 (호출 1회). manual: 「지금 검사」 — 세어 둔 자리와 상관없이 끝의 N개를 본다. 실패하면 오류를 던진다 (자동일 때는 일지에만 남긴다) */
  runDrift(chat: ChatM, msgs: Msg[], { manual = false, signal }: { manual?: boolean; signal?: AbortSignal } = {}): Promise<DriftReport | null> {
    return track('drift', chat.id, () => Memory.enqueue(() => this.driftNow(chat, msgs, manual, signal)));
  },
  async driftNow(chat: ChatM, msgs: Msg[], manual: boolean, signal?: AbortSignal): Promise<DriftReport | null> {
    const cfg = Memory.cfg(); if (!cfg.enabled || !chat) return null;
    await Memory.waitForChatIdle('연속성 검사');
    const mem = await Memory.load(chat.id), st = stateOf(mem), every = this.every(), d = this.due(mem, msgs);
    if (!manual && (this.mode() !== 'batch' || !d.anchored || d.count < every)) return null;   // 기다리는 사이 방식이 바뀌었거나 이미 검사했다
    const win = manual ? this.lastReplies(msgs, every) : this.lastReplies(msgs, 12, d.from);   // 밀린 것이 많아도 한 번에 12개까지
    if (!win.length) { if (manual) throw new Error(tr('memoria.audit.drift.nothing')); return null; }
    const who = nameOf(chat), at = new Map(msgs.map((m, i) => [m, i])), firstAt = at.get(win[0])!, lastAt = at.get(win[win.length - 1])!, checked = new Set(win), h0 = new Map(win.map(m => [m, mesHashOf(m)]));
    const rows: DriftWin[] = win.map(m => ({ no: at.get(m)! + 1, msg: m, who: who(m), text: visibleProse(msgText(m)) })), cap = Math.max(700, Math.min(2400, Math.floor(20000 / win.length)));
    // 검사할 답과 그 사이의 내 말, 그리고 바로 앞의 몇 개 — 그 안에서 바뀐 것을 어긋남으로 짚지 않게
    const lines: string[] = [];
    for (let i = Math.max(0, firstAt - 4); i <= lastAt; i++) {
      const m = msgs[i]; if (!m || m.hidden || m.role === 'system' || Memory.isSideMessage(m)) continue;
      const body = cleanMultiline(visibleProse(msgText(m)), checked.has(m) ? cap : 700); if (!body) continue;
      lines.push(`<message n="#${i + 1}" by="${who(m).replace(/"/g, "'")}"${checked.has(m) ? ' check="yes"' : ''}>\n${body}\n</message>`);
    }
    const query = win.map(m => visibleProse(msgText(m)).slice(0, 240)).join('\n').slice(0, 1200), parts = Memory.buildPacketSections(chat, mem, null, Memory.archiveQueryOpt(mem, query, msgs));
    const render = (lim: Parameters<typeof Memory.renderPacket>[1]) => String(Memory.renderPacket({ ...parts, voices: [], banned: [], banTell: false, driftNotes: [], supervisorPlan: null }, lim)).split('\n').filter(l => l !== PACKET_HEADER && l !== PACKET_FOOTER).slice(Memory.packetGuidance(parts).length).join('\n');
    let archive = render({ excerptLimit: 2, sourceLimit: 0 });
    if (tokens(archive) > 6000) archive = render({ withExcerpts: false, recallLimit: 6, protectedLimit: 4, summaryLimit: 4, charLimit: 8, extraLimit: 6, sourceLimit: 0 });
    const sys = driftPrompt(), user = `<archive>\n${archive}\n</archive>\n\n<messages>\n${lines.join('\n\n')}\n</messages>`;
    let raw: { findings?: unknown; issues?: unknown } | unknown[] | null = null, out = '', why = '';
    try {
      const r = await withDeadline(Memory.call(chat, sys, user, 1600, signal, 'check'), 150000, null);
      if (r.timedOut) why = tr('memoria.audit.drift.timeout'); else { out = String(r.value || ''); raw = parseLoose(out); if (!raw) why = tr('memoria.audit.drift.unreadable'); }
    } catch (e) { const err = e as Error; if (err?.name === 'AbortError' || signal?.aborted) throw e; why = err?.message || String(e); }
    if (stale(chat, mem)) return null;
    if (!raw) {
      // 실패: 세어 둔 자리를 그대로 둔다 — 다음 답변이 오면 다시 시도한다. 세 번 잇달아 실패하면 이 구간은 넘긴다 (답변마다 헛호출이 되지 않게)
      st.driftFail = (st.driftFail || 0) + 1;
      if (!manual && st.driftFail >= 3) { st.driftAt = win[win.length - 1].id; st.driftFail = 0; }
      await Memory.save(mem); Memory.logActivity('error', tr('memoria.audit.log.driftFail', { from: rows[0].no, to: rows[rows.length - 1].no, why }), { chatId: chat.id });
      if (manual) throw new Error(why);
      return null;
    }
    // 기다리는 사이 고쳤거나 넘긴 답변은 결과에서 뺀다
    const same = rows.filter(w => msgs.includes(w.msg) && mesHashOf(w.msg) === h0.get(w.msg));
    const findings = readFindings(Array.isArray(raw) ? raw : raw.findings ?? raw.issues, same, evidenceRows(mem, msgs), archive, uid);
    const report: DriftReport = { at: Date.now(), from: rows[0].no, to: rows[rows.length - 1].no, ids: win.map(m => m.id), checked: win.length, findings, tokIn: tokens(`${sys}\n${user}`), tokOut: tokens(out), every, ...(manual ? { manual: true } : {}) };
    st.drift = report; st.driftAt = win[win.length - 1].id; st.driftFail = 0;
    await Memory.save(mem);
    await this.stamp(chat, msgs, report, win);
    const sure = findings.filter(f => f.ok).length;
    Memory.logActivity('check', findings.length ? tr('memoria.audit.log.drift', { from: report.from, to: report.to, n: sure, loose: findings.length - sure }) : tr('memoria.audit.log.driftClean', { from: report.from, to: report.to, n: report.checked }), { chatId: chat.id });
    return report;
  },
  /** 보고서의 건을 메시지의 ⚠ 배지(memCheck)로 옮겨 적는다 — 근거를 확인한 건은 경고로, 못 한 건은 걸러 둔 쪽으로. 넘긴 건은 뺀다 */
  async stamp(chat: ChatM, msgs: Msg[], report: DriftReport, only?: Msg[]) {
    const ids = new Set(report.ids), marked: Msg[] = [];
    for (const m of only || msgs.filter(x => ids.has(x.id))) {
      if (!msgs.includes(m)) continue;
      const h = mesHashOf(m), mine = report.findings.filter(f => f.msgId === m.id && f.h === h && !f.dismissed), had = Memory.checkOf(m);
      if (!mine.length) { if (had?.batch) { Memory.setCheck(m, h, null); marked.push(m); } continue; }
      Memory.setCheck(m, h, { h, issues: mine.filter(f => f.ok).map(toIssue), filtered: mine.filter(f => !f.ok).map(toIssue), batch: true, at: report.at }); marked.push(m);
    }
    if (!marked.length) return;
    await Memory.saveMsgMarks(chat, marked).catch(e => console.warn('[장기기억] 검사 결과 저장', e));
    emit('memory:check', { chatId: chat.id });
  },
  /** 「괜찮아요」 — 그 건을 넘긴다 (바로잡기 메모와 ⚠ 배지에서 빠진다). on false 로 되돌린다 */
  async dismiss(chat: ChatM, mem: Mem, msgs: Msg[], id: string, on = true) {
    const report = mem.audit?.drift, f = report?.findings.find(x => x.id === id); if (!report || !f) return;
    if (on) f.dismissed = true; else delete f.dismissed;
    await Memory.save(mem);
    const m = msgs.find(x => x.id === f.msgId); if (m) await this.stamp(chat, msgs, report, [m]);
  },
  /** 바로잡기 메모가 지금 실리는가 — { lines: 실릴 건 수, left: 남은 답 수 } */
  noteState(mem: Mem, msgs: Msg[]) {
    const report = mem.audit?.drift, since = repliesSince(report, msgs), live = liveFindings(report, msgs).length;
    return { lines: Memory.cfg().driftNote !== false && since >= 0 && since < NOTE_REPLIES ? Math.min(4, live) : 0, left: since < 0 ? 0 : Math.max(0, NOTE_REPLIES - since), live };
  },

  // ════════ 2. 요약 검수 · 채점 · 수정 ════════
  /** 번호 · 날짜 · 이름 점검 (모델 호출 없음). 「괜찮아요」로 넘긴 것은 skipped 로 센다 */
  sumIssues(chat: ChatM, mem: Mem, msgs: Msg[]): { list: SumIssue[]; skipped: number; secs: number; turns: number } {
    const skip = new Set(mem.audit?.skip || []), all = sumChecks(mem, msgs, knownNames(chat));
    return { list: all.filter(i => !skip.has(i.key)), skipped: all.filter(i => skip.has(i.key)).length, secs: mem.chunks.length + mem.arcs.filter(a => !a.carried).length, turns: mem.turns.length };
  },
  /** 한 번에 고치기 (모델 호출 없음). 요약 글은 그대로라 얼려 둔 장부도 그대로다 */
  async fix(chat: ChatM, mem: Mem, msgs: Msg[], issue: SumIssue): Promise<boolean> {
    const ok = issue.fix === 'sync' ? (msgs.length ? Memory.reconcile(mem, msgs) : false) : applySumFix(mem, issue, msgs);
    if (ok) { await Memory.save(mem); Memory.logActivity('summary', tr('memoria.audit.log.fixed', { what: tr('memoria.audit.fix.' + issue.fix) }), { chatId: chat.id }); }
    return ok;
  },
  async skip(mem: Mem, key: string) { const st = stateOf(mem); st.skip = [...new Set([...(st.skip || []), key])].slice(-60); await Memory.save(mem); },
  async unskip(mem: Mem) { delete stateOf(mem).skip; await Memory.save(mem); },
  /** 대기 중인 빈 범위를 요약해 제자리에 끼운다 (범위마다 호출 1회 · 한 번에 둘까지). 실패한 범위는 남겨 두고 다음에 다시 한다 */
  async fillGaps(chat: ChatM, mem: Mem, signal?: AbortSignal): Promise<number> {
    const st = stateOf(mem); let made = 0;
    for (const [a, b] of pendingGaps(mem).slice(0, 2)) {
      await Memory.waitForChatIdle('요약·서고 정리');
      try {
        const r = await Memory.chunkRecord(chat, mem, a, b, signal, true); if (stale(chat, mem)) return made;
        mem.chunks.push({ id: 'c' + uid(), from: a, to: b, text: r.text, ...(r.unverified.length ? { unverified: r.unverified } : {}) }); mem.chunks.sort((x, y) => x.from - y.from); made++;
      } catch (e) { const err = e as Error; if (err?.name === 'AbortError' || signal?.aborted) throw e; Memory.logActivity('error', tr('memoria.audit.log.fillFail', { from: a + 1, to: b + 1, why: err?.message || String(e) }), { chatId: chat.id }); break; }
    }
    st.gaps = pendingGaps(mem); if (!st.gaps.length) { delete st.gaps; delete st.gapsAt; } else st.gapsAt = sumCount(mem);
    await Memory.save(mem);
    if (made) Memory.logActivity('summary', tr('memoria.audit.log.filled', { n: made }), { chatId: chat.id });
    return made;
  },
  /** 다음 채점이 볼 요약 — 점검에 걸린 것 먼저, 그다음 아직 채점하지 않은 최근 것 (넷까지). force: 채점한 적 있어도 최근 것부터 */
  gradePlan(chat: ChatM, mem: Mem, msgs: Msg[], force = false): SumSec[] {
    const st = mem.audit || {}, all = sumSecs(mem, msgs).filter(x => x.from > 0 && String(x.s.text || '').trim()), flagged = new Set(this.sumIssues(chat, mem, msgs).list.map(i => i.sum).filter(Boolean));
    const fresh = all.filter(x => force || st.graded?.[x.s.id] !== textHash(x.s.text));
    return fresh.sort((a, b) => +flagged.has(b.s.id) - +flagged.has(a.s.id) || b.s.from - a.s.from).slice(0, 4).sort((a, b) => a.s.from - b.s.from);
  },
  /** 채점 (호출 1회) — 요약과 그 요약이 덮는 원문 발췌를 함께 보내 틀린 곳 · 빠진 곳 · 지어낸 곳을 메시지 번호와 함께 받는다. 채점할 것이 없으면 null */
  grade(chat: ChatM, mem: Mem, msgs: Msg[], { force = false, auto = false, signal }: { force?: boolean; auto?: boolean; signal?: AbortSignal } = {}): Promise<GradeReport | null> {
    return track('grade', chat.id, () => Memory.enqueue(async () => {
      await Memory.waitForChatIdle('요약·서고 정리');
      const secs = this.gradePlan(chat, mem, msgs, force); if (!secs.length || stale(chat, mem)) return null;
      const who = nameOf(chat), clean = (m: Msg) => visibleProse(msgText(m)), tags = new Map<string, SumSec>(), budget = Math.max(2000, Math.floor(10000 / secs.length));
      const blocks = secs.map((x, i) => { const tag = `S${i + 1}`; tags.set(tag, x); return `[${tag}] record for messages #${x.from}–#${x.to}:\n${x.s.text}\n\nExcerpts of messages #${x.from}–#${x.to}:\n${excerptsFor(msgs, x.from, x.to, budget, who, clean).join('\n')}`; });
      const sys = gradePrompt(), user = blocks.join('\n\n────────\n\n'), out = String(await Memory.call(chat, sys, user, 1400, signal, 'summary') || ''), raw = parseLoose<{ items?: unknown }>(out);
      if (stale(chat, mem)) return null;
      if (!raw) throw new Error(tr('memoria.audit.drift.unreadable'));
      const st = stateOf(mem), report: GradeReport = { at: Date.now(), sums: secs.map(x => x.s.id), items: readGrade(Array.isArray(raw) ? raw : raw.items, tags), tokIn: tokens(`${sys}\n${user}`), tokOut: tokens(out), ...(auto ? { auto: true } : {}) };
      const alive = new Set([...mem.chunks, ...mem.arcs].map(s => s.id)); st.graded = Object.fromEntries(Object.entries(st.graded || {}).filter(([id]) => alive.has(id)));
      for (const x of secs) st.graded[x.s.id] = textHash(x.s.text);
      st.grade = report; st.gradeCount = sumCount(mem);
      await Memory.save(mem);
      Memory.logActivity('summary', tr('memoria.audit.log.graded', { n: secs.length, found: report.items.length }), { chatId: chat.id });
      return report;
    }));
  },
  /** 고쳐 달라고 보낼 요약 — 채점에 걸린 것(그 뒤로 글이 바뀌지 않은 것)과 비었거나 너무 짧은 것. 넷까지 */
  repairPlan(chat: ChatM, mem: Mem, msgs: Msg[]): { x: SumSec; notes: string[]; refs: number[]; weak: boolean }[] {
    const st = mem.audit || {}, items = st.grade?.items || [], done = new Set(st.grade?.fixed || []), weak = new Set(this.sumIssues(chat, mem, msgs).list.filter(i => i.type === 'short' || i.type === 'empty').map(i => i.sum));
    return sumSecs(mem, msgs).filter(x => x.from > 0).map(x => {
      const mine = done.has(x.s.id) || st.graded?.[x.s.id] !== textHash(x.s.text) ? [] : items.filter(i => i.sum === x.s.id);
      return { x, weak: weak.has(x.s.id), refs: mine.flatMap(i => i.refs), notes: [...mine.map(i => `(${i.kind}) ${i.text}${i.refs.length ? ` [${i.refs.map(n => `#${n}`).join(', ')}]` : ''}`), ...(weak.has(x.s.id) ? ['(too short) the record is far shorter than the stretch it covers — write it out in full from the notes and excerpts'] : [])] };
    }).filter(p => p.notes.length).slice(-4);
  },
  /**
   * 고쳐 달라고 보내기 (호출 1회) — 걸린 요약만, 그 구간의 턴 기록과 원문 발췌를 함께 보내 다시 쓰게 한다.
   * 받은 글이 훨씬 짧아졌거나 있던 칸이 빠졌으면 그 요약만 한 번 더 시키고, 그래도 그러면 옛 글을 그대로 둔다. 바꾼 요약은 직전 글을 was 에 남긴다 (restore 로 되돌린다).
   * 얼려 둔 장부는 고친 뒤 한 번만 새로 뜬다. 반환 { fixed, kept }: 고친 요약 · 그대로 둔 요약의 id
   */
  repair(chat: ChatM, mem: Mem, msgs: Msg[], { signal }: { signal?: AbortSignal } = {}): Promise<{ fixed: string[]; kept: string[] } | null> {
    return track('repair', chat.id, () => Memory.enqueue(async () => {
      await Memory.waitForChatIdle('요약·서고 정리');
      const plan = this.repairPlan(chat, mem, msgs); if (!plan.length || stale(chat, mem)) return null;
      const who = nameOf(chat), clean = (m: Msg) => visibleProse(msgText(m)), budget = Math.max(2000, Math.floor(9000 / plan.length)), capOf = (x: SumSec) => x.s.saga ? 2800 : x.level === 'arc' ? 2400 : 2000;
      const tagged = plan.map((p, i) => ({ ...p, tag: `S${i + 1}` })), byTag = new Map(tagged.map(p => [p.tag, p]));
      const block = (p: typeof tagged[number], extra = '') => {
        const turns = mem.turns.slice(p.x.s.from, p.x.s.to + 1).filter(t => t.digest && !t.failed), step = Math.max(1, Math.ceil(turns.length / 20));
        const notes = turns.filter((_, i) => i % step === 0).map(t => `- ${[t.when, t.where].filter(Boolean).length ? `[${[t.when, t.where].filter(Boolean).join(' · ')}] ` : ''}${cleanStr(t.digest, 300)}`);
        return [`[${p.tag}] record for messages #${p.x.from}–#${p.x.to}`, `Current text:\n${String(p.x.s.text || '').trim() || '(empty)'}`, `Problems:\n${[...p.notes, extra].filter(Boolean).map(n => `- ${n}`).join('\n')}`,
          notes.length ? `Turn notes on file for this stretch:\n${notes.join('\n')}` : '', `Excerpts of the original messages:\n${excerptsFor(msgs, p.x.from, p.x.to, budget, who, clean, p.refs).join('\n')}`].filter(Boolean).join('\n\n');
      };
      const ask = async (list: typeof tagged, extra: (p: typeof tagged[number]) => string = () => '') => {
        const reply = await Memory.call(chat, `${REPAIR_PROMPT}\n\n${Memory.languageDirective()}`, list.map(p => block(p, extra(p))).join('\n\n────────\n\n'), 4000, signal, 'summary'), got = readRepair(reply, tag => capOf(byTag.get(tag)?.x || tagged[0].x));
        if (!got.size && list.length === 1) { const whole = cleanMultiline(sanitizeRecord(reply), capOf(list[0].x)); if (whole) got.set(list[0].tag, whole); }   // 하나만 보냈는데 표시 줄 없이 글만 돌아온 경우
        return got;
      };
      const good = new Map<string, string>(), bad = new Map<string, string>();
      const sift = (got: Map<string, string>, list: typeof tagged) => { for (const p of list) { const text = got.get(p.tag) || '', why = repairBad(String(p.x.s.text || ''), text, p.weak); if (why) bad.set(p.tag, why); else { good.set(p.tag, text); bad.delete(p.tag); } } };
      sift(await ask(tagged), tagged);
      if (bad.size && !stale(chat, mem)) {   // 짧아졌거나 칸이 빠진 요약만 한 번 더 — 그래도 그러면 옛 글을 둔다
        const again = tagged.filter(p => bad.has(p.tag)), hint: Record<string, string> = { empty: 'your previous answer left this record out — output it in full under its marker line', refused: 'your previous answer was not a record — output only the rewritten record', shrunk: 'your previous rewrite was much shorter than the record — keep every line that was not flagged', fields: 'your previous rewrite dropped lines or labels (WHEN / PLOT / SHIFTS / OPEN) the record had — keep them all' };
        try { sift(await ask(again, p => hint[bad.get(p.tag) || 'shrunk']), again); } catch (e) { const err = e as Error; if (err?.name === 'AbortError' || signal?.aborted) throw e; console.debug('[장기기억] 요약 수정 다시 시키기 실패 — 옛 글을 둡니다', e); }
      }
      if (stale(chat, mem)) return null;
      const st = stateOf(mem), fixed: string[] = [], kept: string[] = [], at = Date.now();
      for (const p of tagged) {
        const text = good.get(p.tag), s = p.x.s;
        if (!text || text === s.text) { kept.push(s.id); continue; }
        s.was = { text: s.text, at, ...(s.unverified ? { unverified: s.unverified } : {}) }; s.text = text; s.fixedAt = at; delete s.av; delete s.avm; delete s.avec; delete s.unverified;   // 본문이 바뀌었으니 임베딩은 다음 회상 때 다시 잡는다
        if (st.graded) delete st.graded[s.id];
        fixed.push(s.id);
      }
      if (st.grade) { st.grade.fixed = [...new Set([...(st.grade.fixed || []), ...fixed])]; st.grade.kept = kept; }
      await Memory.save(mem);
      if (fixed.length) Memory.reinjectNow(chat);   // 고친 요약을 「달라진 줄」로 매 턴 싣지 않고, 얼려 둔 장부를 한 번 새로 뜬다
      Memory.logActivity('summary', tr('memoria.audit.log.repaired', { n: fixed.length, kept: kept.length }), { chatId: chat.id });
      return { fixed, kept };
    }));
  },
  /** 고치기 전 글로 되돌린다 (다시 누르면 고친 글로) — 모델 호출 없음 */
  async restore(chat: ChatM, mem: Mem, id: string): Promise<boolean> {
    const s = [...mem.chunks, ...mem.arcs].find(x => x.id === id), was = s?.was as { text?: string; unverified?: string[] } | undefined; if (!s || typeof was?.text !== 'string') return false;
    const now = s.text; s.text = was.text; s.was = { text: now, at: Date.now() }; if (was.unverified?.length) s.unverified = was.unverified; else delete s.unverified;
    delete s.av; delete s.avm; delete s.avec; if (mem.audit?.graded) delete mem.audit.graded[id];
    await Memory.save(mem); Memory.reinjectNow(chat); return true;
  },

  // ════════ 3. 답변 뒤 기록 — 기다리게 하지 않고, 잃지 않는다 ════════
  /** 이 답변의 기록을 빚으로 적어 둔다 (기록이 끝나면 지운다). 방을 나가 답변 뒤 처리가 돌지 않았거나 창을 닫았으면 drain 이 잇는다 */
  owe(chat: ChatM, msg: Msg) {
    const cfg = Memory.cfg(); if (!cfg.enabled || !cfg.auto || !chat?.id || msg?.role !== 'assistant') return;
    const had = owed.find(o => o.chatId === chat.id);
    owed = [...owed.filter(o => o.chatId !== chat.id), { chatId: chat.id, msgId: msg.id, tries: had?.msgId === msg.id ? had.tries : 0, at: Date.now() }]; saveOwed();
  },
  owedCount: () => owed.length,
  /**
   * 답변 뒤 기록을 뒤에서 한다 — 대화 화면은 기다리지 않는다 (번역 · 선택지 · 다음 입력이 기록 때문에 밀리지 않는다).
   * 기록은 엔진의 줄에서 차례로 돌고, 그사이 새 답변을 만들면 마지막으로 저장된 서고로 장부를 짓는다. 실패하면 빚으로 남아 나중에 다시 한다
   */
  async recordSoon(chat: ChatM, msgs: Msg[], tail: Msg, { retry = false }: { retry?: boolean } = {}): Promise<Mem | null> {
    const cfg = Memory.cfg(); if (!cfg.enabled || !cfg.auto || !chat || tail?.role !== 'assistant') return null;
    this.owe(chat, tail); inFlight.add(chat.id);
    const fail = () => { const o = owed.find(x => x.chatId === chat.id && x.msgId === tail.id); if (o) { o.tries++; o.next = Date.now() + Math.min(600000, 45000 * 2 ** (o.tries - 1)); saveOwed(); drainSoon(o.next - Date.now() + 1000); } };
    try {
      return await track('record', chat.id, async () => {
        // 실패했던 기록을 다시 할 때는 그 턴을 바로 다시 적는다 (묶음 기록의 실패한 끝자락은 평소 흐름이 다시 집지 않는다)
        const mem = await (retry ? Memory.commit(chat, msgs, tail, {}) : Memory.commit(chat, msgs, tail)), turn = mem.turns.find(x => x.msgId === tail.id);
        if (turn?.failed) fail(); else { owed = owed.filter(o => o.chatId !== chat.id); saveOwed(); }
        await this.afterRecord(chat, mem, msgs, tail).catch(e => console.warn('[장기기억] 기록 뒤 점검', e));
        return mem;
      });
    } catch (e) { fail(); throw e; }
    finally { inFlight.delete(chat.id); }
  },
  /** 기록이 끝난 뒤: 예전에 실패한 기록 하나를 다시 적고(턴마다 세 번까지), 대기 중인 빈 범위를 채우고, 요약의 번호를 점검하고, 설정에 따라 채점한다 */
  async afterRecord(chat: ChatM, mem: Mem, msgs: Msg[], tail: Msg) {
    const cfg = Memory.cfg(), byId = new Map(msgs.map(m => [m.id, m]));
    const old = [...mem.turns].reverse().find(t => { const m = byId.get(t.msgId); return t.failed && t.msgId !== tail.id && !!m && m.role === 'assistant' && !m.hidden && (retried.get(`${chat.id}\u0001${t.msgId}`) || 0) < 3; });
    if (old && cfg.auto) {
      const key = `${chat.id}\u0001${old.msgId}`, m = byId.get(old.msgId)!; retried.set(key, (retried.get(key) || 0) + 1);
      Memory.logActivity('defer', tr('memoria.audit.log.retry', { n: msgs.indexOf(m) + 1 }), { chatId: chat.id });
      await Memory.commit(chat, msgs, m, {}).catch(e => console.warn('[장기기억] 실패한 기록 다시 적기', e));
    }
    if (stale(chat, mem)) return;
    const st = stateOf(mem), count = sumCount(mem);
    if (pendingGaps(mem).length && count !== st.gapsAt) await track('fill', chat.id, () => Memory.enqueue(() => this.fillGaps(chat, mem))).catch(e => console.warn('[장기기억] 빈 범위 채우기', e));
    if (stale(chat, mem)) return;
    // 번호 · 날짜 · 이름 점검 (호출 없음) — 걸린 곳이 달라졌을 때만 일지에 한 줄 남긴다
    const keys = this.sumIssues(chat, mem, msgs).list.map(i => i.key).sort(), seen = keys.join('\u0001'), fresh = seen !== (st.gradeSeen || ''), now = sumCount(mem);
    if (fresh) { st.gradeSeen = seen; await Memory.save(mem); if (keys.length) Memory.logActivity('summary', tr('memoria.audit.log.flagged', { n: keys.length }), { chatId: chat.id }); }
    const mode = cfg.gradeMode, graded = () => this.grade(chat, mem, msgs, { auto: true }).then(() => { }, e => { Memory.logActivity('error', tr('memoria.audit.log.gradeFail', { why: (e as Error)?.message || e }), { chatId: chat.id }); });
    if (mode === 'every') { if (st.gradeCount == null) { st.gradeCount = now; await Memory.save(mem); } else if (now - st.gradeCount >= gradeEveryOf(cfg)) await graded(); }
    else if (mode === 'flagged' && fresh && keys.length) await graded();
  },
  /** 빚으로 남은 기록을 다시 줄에 세운다 — 방을 나가 있는 동안 끝난 답변, 창을 닫아 끊긴 기록, 실패한 기록. 답변을 받는 중이면 끝난 뒤에 */
  async drain() {
    if (draining || !owed.length) return; if (G.chatGenerating) return drainSoon(4000);
    draining = true;
    try {
      const cfg = Memory.cfg();
      for (const o of [...owed]) {
        if (inFlight.has(o.chatId)) continue;
        const chat = S.get('chats', o.chatId), drop = () => { owed = owed.filter(x => x !== o); saveOwed(); };
        if (!chat || !cfg.enabled || !cfg.auto) { drop(); continue; }
        if (o.tries >= MAX_TRIES) { drop(); Memory.logActivity('error', tr('memoria.audit.log.gaveUp', { name: chat.name || '' }), { chatId: chat.id }); continue; }   // 실패 표시는 턴에 남는다 — 색인으로 다시 적을 수 있다
        if (o.next && Date.now() < o.next) { drainSoon(o.next - Date.now() + 500); continue; }
        const msgs = await S.msgsFast(chat.id), tail = msgs.find(m => m.id === o.msgId); if (!tail) { drop(); continue; }
        const mem = await Memory.load(chat.id), failed = !!mem.turns.find(t => t.msgId === tail.id)?.failed;
        if (o.tries || failed) Memory.logActivity('defer', tr('memoria.audit.log.resume', { n: msgs.indexOf(tail) + 1 }), { chatId: chat.id });
        await this.recordSoon(chat, msgs, tail, { retry: failed }).catch(e => console.warn('[장기기억] 밀린 기록', e));
      }
    } finally { draining = false; }
  },
  /** 지금 하는 일 (없으면 null) — 상태 줄이 읽는다. 바뀔 때마다 'memory:job' 으로도 알린다 */
  status: jobStatus,
};

// ════════ 이벤트 ════════
// 옛 「연속성 검사」 토글을 켰으면 답변마다로 옮긴다 — 묶어서 검사와 함께 켜 두지 않는다 (끄면 그대로 꺼진다)
on('settings', () => { try { const m = S.settings.memory as Cfg | undefined; if (m?.replyCheck && m.checkMode === 'batch') { m.checkMode = 'each'; S.saveSettings(); } } catch (e) { console.warn('[장기기억]', e); } });
on('generate:start', tell);
on('generate:end', () => { tell(); if (owed.length) drainSoon(1500); });   // 방을 나가 있는 동안 끝난 답변은 대화 화면이 기록을 부르지 않는다 — 여기서 잇는다
on('chat:open', () => { if (owed.length) drainSoon(2500); });
on<string>('chat:deleted', id => { if (owed.some(o => o.chatId === id)) { owed = owed.filter(o => o.chatId !== id); saveOwed(); } });
if (owed.length) drainSoon(8000);   // 지난번에 창을 닫아 끊긴 기록
try { globalThis.addEventListener?.('online', () => { if (owed.length) drainSoon(2000); }); } catch { /* 창이 없는 곳 */ }
