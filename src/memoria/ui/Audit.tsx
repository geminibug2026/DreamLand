// 장기기억 — 검사 탭: 어긋난 곳 자동 감지(설정 · 보고서 · 바로잡기 메모) · 요약 검수(번호 점검과 한 번에 고치기 · 채점 · 고쳐 달라고 보내기)
import type { MouseEvent, ReactNode } from 'react';
import { Btn, useEvents } from '../../kit';
import { toast } from '../../ui';
import { fmtDate, t } from '../../i18n';
import { Memory } from '../../lib/memory';
import { Auditor, srcLabel } from '../engine/audit';
import { liveFindings, sumSecs, whenOf } from '../engine/auditCore';
import type { CheckMode, DriftFinding, GradeItem, SumIssue, SumSec } from '../engine/auditCore';
import { None, Sec, busyBtn, ensureCfg, saveCfg, type StOpen } from './parts';
import { onJump } from './viewsShared';

const Jump = ({ n }: { n?: number }) => n ? <button className="mm-st-jump" type="button" data-mes={n}>{`#${n}`}</button> : null;
const Span = ({ from, to }: { from?: number; to?: number }) => from ? <span className="mm-au-span"><Jump n={from} />{to && to > from ? <><i>–</i><Jump n={to} /></> : null}</span> : null;
const sameDay = (a: number, b: number) => new Date(a).toDateString() === new Date(b).toDateString();
/** "오늘 20:27" · "11. 25. 20:27" */
const whenText = (at: number) => { const time = fmtDate(at, { hour: '2-digit', minute: '2-digit', hour12: false }); return sameDay(at, Date.now()) ? t('memoria.audit.today', { time }) : `${fmtDate(at, { month: 'numeric', day: 'numeric' })} ${time}`; };
const num = (n: number) => Math.round(n).toLocaleString();
const run = (fn: () => unknown) => (e: MouseEvent<HTMLButtonElement>) => void busyBtn(e.currentTarget, fn);

/** 어긋난 곳 한 건 */
function Finding({ f, off, children }: { f: DriftFinding; off?: string; children?: ReactNode }) {
  return <article className={`mm-card mm-au-card${off ? ' off' : ''}`}>
    <header><Jump n={f.no} /><b>{f.who}</b><em className="mm-tag">{t('memoria.audit.kind.' + f.kind)}</em>{off ? <em className="mm-tag dash">{off}</em> : <em className="mm-tag on">{t('memoria.audit.verified')}</em>}</header>
    <p className="mm-sum">{f.text}</p>
    {f.quote ? <blockquote>{`“${f.quote}”`}</blockquote> : null}
    {f.evidence ? <div className="mm-evid mm-au-evid"><span>{t('memoria.audit.evidence', { text: f.evidence })}</span>{f.src ? <span className="mm-au-src"><small>{srcLabel({ ...f.src, from: 0 })}</small><Span from={f.src.from} to={f.src.to} /></span> : null}</div> : null}
    {children ? <footer className="mm-au-acts">{children}</footer> : null}
  </article>;
}

/** 1. 어긋난 곳 자동 감지 */
function Drift({ st, redraw }: { st: StOpen; redraw: () => void }) {
  const cfg = ensureCfg(), chat = st.chat, mem = st.mem, msgs = st.msgs, mode = Auditor.mode(), every = Auditor.every(), report = mem.audit?.drift || null;
  const setMode = (m: CheckMode) => { Auditor.setMode(m, every); redraw(); };
  const check = async () => { const r = await Auditor.runDrift(chat, msgs, { manual: true }); if (r) toast(r.findings.some(f => f.ok) ? t('memoria.audit.drift.doneFound', { n: r.findings.filter(f => f.ok).length }) : t('memoria.audit.drift.doneClean', { n: r.checked }), 'ok'); redraw(); };
  const dismiss = (f: DriftFinding, on: boolean) => async () => { await Auditor.dismiss(chat, mem, msgs, f.id, on); redraw(); };
  const live = liveFindings(report, msgs), liveIds = new Set(live.map(f => f.id)), aside = (report?.findings || []).filter(f => !liveIds.has(f.id)), due = Auditor.due(mem, msgs), note = Auditor.noteState(mem, msgs);
  const rest = report ? report.checked - new Set(live.map(f => f.msgId)).size : 0;
  const cadence = mode === 'batch' ? t('memoria.audit.drift.cadence', { n: every }) : mode === 'each' ? t('memoria.audit.drift.cadenceEach') : t('memoria.audit.drift.cadenceOff');
  return <Sec title={t('memoria.audit.drift.title')} desc={t('memoria.audit.drift.desc')}>
    <div className="mm-au-row"><span className="mm-st-seg mm-au-seg" role="group" aria-label={t('memoria.audit.mode.label')}>{([['off', t('memoria.audit.mode.off')], ['each', t('memoria.audit.mode.each')], ['batch', t('memoria.audit.mode.batch', { n: every })]] as const).map(([id, label]) => <button key={id} type="button" className={mode === id ? 'on' : undefined} aria-pressed={mode === id} onClick={() => setMode(id)}>{label}</button>)}</span>
      {mode === 'batch' ? <label className="mm-au-num">{t('memoria.audit.every.before')}<input className="inp" type="number" inputMode="numeric" min={2} max={30} step={1} defaultValue={every} aria-label={t('memoria.audit.every.aria')} onChange={e => { const n = Math.round(+e.target.value); if (n >= 2 && n <= 30) { Auditor.setMode('batch', n); redraw(); } }} />{t('memoria.audit.every.after')}</label> : null}
      <button className="btn primary" type="button" disabled={!cfg.enabled} title={t('memoria.audit.drift.nowTitle', { n: every })} onClick={run(check)}>{t('memoria.audit.drift.now')}</button></div>
    <p className="mm-au-foot">{mode === 'batch' ? (due.anchored ? (due.need ? t('memoria.audit.drift.next', { n: due.need }) : t('memoria.audit.drift.nextNow')) : t('memoria.audit.drift.nextStart', { n: every })) : mode === 'each' ? t('memoria.audit.mode.eachHint') : t('memoria.audit.mode.offHint')}</p>
    <label className="check mm-opt"><input type="checkbox" defaultChecked={cfg.driftNote !== false} onChange={e => { ensureCfg().driftNote = e.target.checked; saveCfg(); redraw(); }} /><i /><span className="mm-opt-text"><b>{t('memoria.audit.note.label')}</b><small>{t('memoria.audit.note.hint')}</small></span></label>
    {report ? <div className="mm-au-list">
      <p className="mm-au-head">{t('memoria.audit.drift.head', { n: live.length })}<small>{` · ${whenText(report.at)} · #${report.from}–#${report.to} · ${t('memoria.audit.drift.checked', { n: report.checked })}`}</small></p>
      {live.map(f => <Finding key={f.id} f={f}><button className="btn ghost" type="button" title={t('memoria.audit.fineTitle')} onClick={run(dismiss(f, true))}>{t('memoria.audit.fine')}</button></Finding>)}
      <p className="mm-au-foot">{live.length ? (rest > 0 ? t('memoria.audit.drift.rest', { n: rest }) : '') : t('memoria.audit.drift.allClean', { n: report.checked })}</p>
      {aside.length ? <details className="mm-details"><summary>{t('memoria.audit.drift.aside', { n: aside.length })}</summary><p className="hint">{t('memoria.audit.drift.asideHint')}</p>
        {aside.map(f => <Finding key={f.id} f={f} off={f.dismissed ? t('memoria.audit.fine') : !f.ok ? t('memoria.audit.unverified') : t('memoria.audit.changed')}>{f.dismissed ? <button className="btn ghost" type="button" onClick={run(dismiss(f, false))}>{t('memoria.audit.unfine')}</button> : null}</Finding>)}</details> : null}
      {note.lines ? <p className="mm-au-foot">{t('memoria.audit.note.on', { n: note.lines, left: note.left })}</p> : null}
      <p className="mm-au-foot mm-tok">{`${t('memoria.audit.cost', { n: num(report.tokIn + report.tokOut) })} · ${report.manual && mode !== 'batch' ? t('memoria.audit.drift.manual') : cadence}`}</p>
    </div> : <None text={cfg.enabled ? t('memoria.audit.drift.none') : t('memoria.audit.off')} />}
  </Sec>;
}

/** 점검 항목 한 줄의 글 */
function issueText(i: SumIssue): string {
  const v = { from: i.from || 0, to: i.to || 0, cov: i.cov || 0, sec: i.sec || 0, n: i.n || 0, said: i.said || '', real: i.real || '', name: i.name || '' };
  if (i.type === 'tail') return i.sec ? t('memoria.audit.issue.tail', v) : t('memoria.audit.issue.tailNone', v);
  if (i.type === 'dead') return i.what === 'date' ? t('memoria.audit.issue.deadDate', v) : t('memoria.audit.issue.deadTurn', v);
  if (i.type === 'date') return i.what === 'date' ? t('memoria.audit.issue.date', v) : t('memoria.audit.issue.day', v);
  return t('memoria.audit.issue.' + i.type, v);
}

/** 2. 요약 검수 · 채점 · 수정 */
function Sums({ st, redraw }: { st: StOpen; redraw: () => void }) {
  const cfg = ensureCfg(), chat = st.chat, mem = st.mem, msgs = st.msgs, a = mem.audit || {};
  const { list, skipped, secs, turns } = Auditor.sumIssues(chat, mem, msgs), plan = Auditor.gradePlan(chat, mem, msgs), fixes = Auditor.repairPlan(chat, mem, msgs), grade = a.grade || null;
  const all = sumSecs(mem, msgs), secOf = new Map<string, SumSec>(all.map(x => [x.s.id, x])), restorable = all.filter(x => typeof (x.s.was as { text?: string } | undefined)?.text === 'string');
  const fix = (i: SumIssue) => async () => { const ok = await Auditor.fix(chat, mem, msgs, i); toast(ok ? t('memoria.audit.fix.done') : t('memoria.audit.fix.none'), ok ? 'ok' : ''); st.draw(); };
  const skip = (i: SumIssue) => async () => { await Auditor.skip(mem, i.key); redraw(); };
  const doGrade = (force: boolean) => async () => { const r = await Auditor.grade(chat, mem, msgs, { force }); toast(!r ? t('memoria.audit.grade.nothing') : r.items.length ? t('memoria.audit.grade.doneFound', { n: r.items.length }) : t('memoria.audit.grade.doneClean'), r ? 'ok' : ''); redraw(); };
  const doRepair = async () => { const r = await Auditor.repair(chat, mem, msgs); toast(!r ? t('memoria.audit.repair.nothing') : t('memoria.audit.repair.done', { n: r.fixed.length, kept: r.kept.length }), r?.fixed.length ? 'ok' : ''); st.draw(); };
  const restore = (id: string) => async () => { if (await Auditor.restore(chat, mem, id)) toast(t('memoria.audit.repair.restored'), 'ok'); st.draw(); };
  const setGrade = (mode: string) => { ensureCfg().gradeMode = mode; saveCfg(); redraw(); };
  const item = (g: GradeItem, n: number) => { const x = secOf.get(g.sum), done = grade?.fixed?.includes(g.sum);
    return <div key={n} className={`mm-au-issue${done ? ' done' : ''}`}><p><em className="mm-tag">{t('memoria.audit.grade.kind.' + g.kind)}</em>{done ? <em className="mm-tag on">{t('memoria.audit.repair.fixedTag')}</em> : null} {g.text}</p>
      <div className="mm-au-acts">{x ? <small>{t('memoria.audit.grade.sec')}</small> : null}{x ? <Span from={x.from} to={x.to} /> : null}{g.refs.length ? <small>{t('memoria.audit.grade.refs')}</small> : null}{g.refs.map(r => <Jump key={r} n={r} />)}</div></div>; };
  return <Sec title={t('memoria.audit.sum.title')} desc={t('memoria.audit.sum.desc')} tools={<Btn label={t('memoria.audit.sum.recheck')} ic="refresh" cls="ghost" title={t('memoria.audit.sum.recheckTitle')} onClick={() => void st.reload()} />}>
    {list.length ? <><h4 className="mm-au-sub">{t('memoria.audit.sum.head', { n: list.length })}</h4>
      <div className="mm-au-issues">{list.map(i => <div key={i.key} className="mm-au-issue"><p>{issueText(i)}</p>
        <div className="mm-au-acts">{i.type === 'dead' || i.type === 'order' ? null : <Span from={i.from} to={i.to} />}
          {i.queued ? <em className="mm-tag dash">{t('memoria.audit.fix.queued')}</em> : i.fix ? <button className="btn" type="button" title={t('memoria.audit.fix.title.' + i.fix)} onClick={run(fix(i))}>{t('memoria.audit.fix.' + i.fix)}</button> : i.type === 'name' ? <button className="btn" type="button" onClick={() => { st.tab = 'people'; st.draw(); }}>{t('memoria.audit.fix.people')}</button> : <small>{i.type === 'date' ? t('memoria.audit.fix.byGrade') : t('memoria.audit.fix.byRepair')}</small>}
          <button className="btn ghost" type="button" title={t('memoria.audit.fineTitle')} onClick={run(skip(i))}>{t('memoria.audit.fine')}</button></div></div>)}</div></>
      : <p className="mm-au-foot">{secs || turns ? t('memoria.audit.sum.clean', { secs, turns }) : t('memoria.audit.sum.empty')}</p>}
    {skipped ? <p className="mm-au-foot">{t('memoria.audit.sum.skipped', { n: skipped })} <button className="btn ghost" type="button" onClick={run(async () => { await Auditor.unskip(mem); redraw(); })}>{t('memoria.audit.sum.unskip')}</button></p> : null}

    <h4 className="mm-au-sub">{t('memoria.audit.grade.title')}</h4>
    <div className="mm-au-row"><button className="btn primary" type="button" disabled={!cfg.enabled || !all.length} title={t('memoria.audit.grade.btnTitle')} onClick={run(doGrade(!plan.length))}>{plan.length ? t('memoria.audit.grade.btn') : t('memoria.audit.grade.again')}</button>
      <label className="mm-au-num">{t('memoria.audit.grade.auto')}<select className="inp auto" value={cfg.gradeMode || 'manual'} onChange={e => setGrade(e.target.value)}><option value="manual">{t('memoria.audit.grade.mode.manual')}</option><option value="flagged">{t('memoria.audit.grade.mode.flagged')}</option><option value="every">{t('memoria.audit.grade.mode.every')}</option></select></label>
      {cfg.gradeMode === 'every' ? <label className="mm-au-num">{t('memoria.audit.grade.everyBefore')}<input className="inp" type="number" inputMode="numeric" min={1} max={20} step={1} defaultValue={cfg.gradeEvery || 3} aria-label={t('memoria.audit.grade.everyAria')} onChange={e => { const n = Math.round(+e.target.value); if (n >= 1 && n <= 20) { ensureCfg().gradeEvery = n; saveCfg(); } }} />{t('memoria.audit.grade.everyAfter')}</label> : null}</div>
    <p className="mm-au-foot">{all.length ? (plan.length ? t('memoria.audit.grade.plan', { n: plan.length }) : t('memoria.audit.grade.planNone')) : t('memoria.audit.grade.noSums')}</p>
    {grade ? <article className="mm-card mm-au-card"><header><b>{t('memoria.audit.grade.card')}</b><span className="mm-tok">{`${whenText(grade.at)} · ${t('memoria.audit.grade.count', { n: grade.sums.length })} · ${t('memoria.audit.cost', { n: num(grade.tokIn + grade.tokOut) })}`}</span></header>
      {grade.items.length ? <div className="mm-au-issues">{grade.items.map(item)}</div> : <p className="mm-au-foot">{t('memoria.audit.grade.clean')}</p>}
      <p className="mm-au-foot">{t('memoria.audit.grade.hint')}</p></article> : null}
    {fixes.length ? <div className="mm-au-row"><button className="btn primary" type="button" disabled={!cfg.enabled} title={t('memoria.audit.repair.title')} onClick={run(doRepair)}>{t('memoria.audit.repair.btn')}</button><span className="mm-au-foot">{t('memoria.audit.repair.plan', { n: fixes.length })}</span></div> : null}
    {restorable.length ? <div className="mm-au-issues">{restorable.map(x => <div key={x.s.id} className="mm-au-issue"><p>{t('memoria.audit.repair.row', { name: whenOf(x.s) || t('memoria.audit.src.' + (x.level === 'arc' ? 'arc' : 'summary')) })}</p>
      <div className="mm-au-acts"><Span from={x.from} to={x.to} /><button className="btn" type="button" title={t('memoria.audit.repair.restoreTitle')} onClick={run(restore(x.s.id))}>{x.s.fixedAt && (x.s.was as { at?: number }).at === x.s.fixedAt ? t('memoria.audit.repair.restore') : t('memoria.audit.repair.redo')}</button></div></div>)}</div> : null}
  </Sec>;
}

export function Audit({ st }: { st: StOpen }) {
  const redraw = useEvents('memory:job', 'memory:check', 'memory');   // 뒤에서 끝난 검사 · 기록이 이 탭을 다시 그린다
  st.mem = Memory.get(st.chat.id) || st.mem;
  const job = Auditor.status(), owed = Auditor.owedCount(), busy = Memory.busy();
  return <div className="mm-view mm-au" data-chat={st.chat.id} onClick={onJump(st)}>
    <p className="mm-au-status" role="status"><i className={`mm-lamp${job || busy ? ' busy' : ''}`} /><span>{job ? job.text : busy ? t('memoria.archive.state.busy') : t('memoria.audit.job.idle')}{owed && !job ? t('memoria.audit.job.owed', { n: owed }) : ''}</span></p>
    <Drift st={st} redraw={redraw} /><Sums st={st} redraw={redraw} /></div>;
}
