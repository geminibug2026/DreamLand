// 장기기억 — 개요 탭 (옛 f-memoria.js 의 vOverview): 주입 미리보기 · 회상 경로 · 장면 연출 · 서고에 질문 · 사서에게 정정 요청
import { useLayoutEffect, useRef, useState, type KeyboardEvent, type ReactNode, type RefObject } from 'react';
import { Btn, Icon } from '../../kit';
import type { EditorOp, LogLine, RecallRow } from '../types';
import { Ib, Ico, KindBadge, None, Sec, Stats, busyBtn, confirmList, histOf, review, safe, showSource, turnTag, withCheckpoint, type StOpen } from './parts';
import { Memory } from '../../lib/memory';
import { toast } from '../../ui';
import { tokens } from '../../lib/engine';
import * as memMod from '../../lib/memory';
import { t } from '../../i18n';

// 장부 절 이름(엔진의 영어 이름) → 화면 이름 키
const SEC_KEY: Record<string, string> = { Canon: 'canon', Cast: 'cast', Bonds: 'bonds', 'Notable Items': 'items', 'Turning Points': 'turningPoints', 'Story So Far': 'storySoFar', Pledges: 'pledges', 'Recent Turns': 'recentTurns', 'Recalled Moments': 'recalled', 'Hidden Knowledge': 'hidden', 'Source Excerpts': 'sources', 'Scene Now': 'sceneNow', 'Status Board': 'status', Direction: 'direction' };
const secName = (n: string) => SEC_KEY[n] ? t('memoria.overview.sec.' + SEC_KEY[n]) : n;
const PLEDGE_ST: Record<string, string> = { active: 'memoria.overview.pledge.active', resolved: 'memoria.overview.pledge.resolved', dormant: 'memoria.overview.pledge.dormant' };
/** 사서가 제안한 정정 한 건을 사람이 읽는 글로 */
export function opText(o: EditorOp): string {
  const { KINDS, LOCKS, fmtDays } = memMod, k = String(o.kind || '');
  const f: Record<string, () => string> = {
    canon: () => o.scopeName ? t('memoria.overview.op.canonScoped', { scope: o.scopeName, key: o.key, value: o.value }) : t('memoria.overview.op.canon', { key: o.key, value: o.value }), status: () => t('memoria.overview.op.status', { entity: o.entity, slot: o.slot, value: o.value }) + (o.claim === 'belief' ? t('memoria.overview.op.belief', { owner: o.owner || t('memoria.overview.op.someone') }) : ''),
    clock: () => t('memoria.overview.op.clock', { from: o.fromTurn, to: o.toTurn, days: fmtDays(+(o.totalDays || 0) || 0) }), addMemory: () => t('memoria.overview.op.addMemory', { kind: KINDS[k] || o.kind || KINDS.fact, summary: o.summary }), editMemory: () => t('memoria.overview.op.editMemory', { id: o.id, summary: o.summary }), deleteMemory: () => t('memoria.overview.op.deleteMemory', { id: o.id }),
    editSummary: () => t('memoria.overview.op.editSummary', { id: o.id }), deleteSummary: () => t('memoria.overview.op.deleteSummary', { id: o.id }), addPledge: () => t('memoria.overview.op.addPledge', { kind: LOCKS[k] || o.kind || LOCKS.keep_unresolved, summary: o.summary }), editPledge: () => t('memoria.overview.op.editPledge', { id: o.id }) + (o.status ? ` → ${PLEDGE_ST[o.status] ? t(PLEDGE_ST[o.status]) : o.status}` : '') + (o.summary ? ` "${o.summary}"` : ''), deletePledge: () => t('memoria.overview.op.deletePledge', { id: o.id }),
    character: () => t('memoria.overview.op.character', { name: o.name, fields: Object.keys(o.patch || {}).join(', ') }), bond: () => t('memoria.overview.op.bond', { from: o.from, to: o.to, stage: o.stage }),
  };
  return f[o.op]?.() || JSON.stringify(o);
}
const enter = (fn: () => void) => (e: KeyboardEvent<HTMLInputElement>) => { if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); fn(); } };

export function Overview({ st }: { st: StOpen }) {
  const M = Memory, cfg = M.cfg(), { chat, mem, msgs } = st, hist = histOf(msgs);
  const p = M.packet(chat, hist, { preview: true, msgs, force: true }), auto = M.packet(chat, hist, { preview: true, fresh: true, msgs, force: true });
  const once = M.overridden(chat.id), pin = mem.packetPin?.text, lastReal = M.last(chat.id), budget = cfg.tokenBudget;
  // 미리보기 글 — 다시 그려도 치던 글 · 커서가 남는다. 초안 · 장부가 바뀌었을 때만 새 값으로
  const init = st.draft ?? p?.text ?? '';
  const [text, setText] = useState(init), [seen, setSeen] = useState(init);
  if (seen !== init) { setSeen(init); setText(init); }
  const taRef = useRef<HTMLTextAreaElement>(null), qRef = useRef<HTMLInputElement>(null), eqRef = useRef<HTMLInputElement>(null), askRef = useRef<HTMLButtonElement>(null), sendRef = useRef<HTMLButtonElement>(null), logRef = useRef<HTMLDivElement>(null);
  const [ans, setAns] = useState<string>(st.answer || '');
  useLayoutEffect(() => { const l = logRef.current; if (l) l.scrollTop = l.scrollHeight; });
  const tk = tokens(text), mark = st.draft != null ? t('memoria.overview.mark.draft') : once ? t('memoria.overview.mark.once') : pin ? t('memoria.overview.mark.pinned') : '';
  const live = p && !p.fixed && st.draft == null;
  const trim = !live ? '' : p.trim === 0 ? t('memoria.overview.trim.full') : p.trim <= 4 ? t('memoria.overview.trim.some', { n: p.trim }) : t('memoria.overview.trim.heavy', { n: p.trim });
  // 고정 장부: 잘 안 바뀌는 부분은 프롬프트 앞쪽에, 매 턴 바뀌는 부분은 최근 대화 옆에 따로 실린다
  const sp = !live ? null : p.diag?.split || (p.stable && p.live ? { stableTokens: tokens(p.stable), nowTokens: tokens(p.live), refreshed: undefined, frozenAtTurn: undefined, delta: undefined } : null);
  const split = sp && <small>{t('memoria.overview.split.front', { mode: cfg.splitInjection ? t('memoria.overview.split.fixed') : t('memoria.overview.split.split'), tokens: (sp.stableTokens || 0).toLocaleString() }) + (sp.refreshed ? t('memoria.overview.split.refresh') : sp.frozenAtTurn != null ? t('memoria.overview.split.frozen', { turn: sp.frozenAtTurn }) : '') + t('memoria.overview.split.now', { delta: sp.delta ? t('memoria.overview.split.delta', { n: sp.delta }) : '', tokens: (sp.nowTokens || 0).toLocaleString() })}</small>;
  const unpin = async () => { await M.pin(chat.id, null); toast(t('memoria.overview.unpinned'), 'ok'); st.draw(); };
  const banner = st.draft != null ? <div className="mm-banner"><Ico name="sparkle" /><span><b>{t('memoria.overview.banner.draftB')}</b>{t('memoria.overview.banner.draftAfter')}</span><button className="mm-link" onClick={() => { st.draft = null; st.draw(); }}>{t('memoria.overview.banner.discard')}</button></div>
    : once ? <div className="mm-banner"><Ico name="edit" /><span><b>{t('memoria.overview.banner.onceB')}</b>{t('memoria.overview.banner.onceAfter')}</span><button className="mm-link" onClick={() => { M.override(chat.id, null); st.draw(); }}>{t('common.cancel')}</button></div>
      : pin ? <div className="mm-banner"><Ico name="pin" /><span><b>{t('memoria.overview.banner.pinB')}</b>{t('memoria.overview.banner.pinAfter', { turn: mem.packetPin?.turn || 0 })}</span><button className="mm-link" onClick={() => void unpin()}>{t('memoria.overview.unpin')}</button></div> : null;
  const tools = <>
    <Ib name="sparkle" title={t('memoria.overview.rewriteTitle')} onClick={e => busyBtn(e.currentTarget, async () => {
      toast(t('memoria.overview.rewriting'));
      try { st.draft = await M.rewritePacket(chat, hist); } catch (e) { const err = e as Error; if (err.name === 'AbortError') throw err; console.error('[장기기억] 장부 새로 쓰기 실패:', err); return toast(t('memoria.overview.rewriteFail', { error: err.message || '' }), 'err'); }
      st.draw(); const n = tokens(st.draft); toast(t('memoria.overview.draftReady', { tokens: n.toLocaleString() }) + (n > budget ? t('memoria.overview.draftOver', { budget: budget.toLocaleString() }) : '') + t('memoria.overview.draftApply'), 'ok');
    })} />
    <Ib name="pin" title={pin ? t('memoria.overview.pinOffTitle') : t('memoria.overview.pinOnTitle')} cls={pin ? 'on' : ''} onClick={async () => {
      if (pin && st.draft == null) return unpin();
      const v = text.trim(); if (!v) return toast(t('memoria.overview.pinEmpty'));
      if (!(await confirmList(t('memoria.overview.pinConfirm'), [t('memoria.overview.pinConfirm1'), t('memoria.overview.pinConfirm2'), t('memoria.overview.pinConfirm3')], t('memoria.overview.pinOk')))) return;
      await M.pin(chat.id, v); M.override(chat.id, null); st.draft = null; toast(t('memoria.overview.pinned'), 'ok'); st.draw();
    }} />
    <Ib name="edit" title={t('memoria.overview.onceTitle')} onClick={() => { const v = text.trim(); if (!v) return toast(t('memoria.overview.onceEmpty')); M.override(chat.id, v); st.draft = null; toast(t('memoria.overview.onceSet'), 'ok'); st.draw(); }} />
    <Ib name="copy" title={t('memoria.overview.copyTitle')} onClick={() => text.trim() ? navigator.clipboard?.writeText(text).then(() => toast(t('memoria.overview.copied'), 'ok'), () => { taRef.current?.select(); document.execCommand('copy'); toast(t('memoria.overview.copied'), 'ok'); }) : toast(t('memoria.overview.copyEmpty'))} />
  </>;
  // 장부 구성 비중
  const d = auto?.diag, total = d ? d.sections.reduce((n, s) => n + s.tokens, 0) || 1 : 1;
  const shares = d && <div className="mm-shares" aria-label={t('memoria.overview.sharesLabel')}><div className="mm-sharebar">{d.sections.map((s, i) => <i key={i} className={`s${i % 6}`} style={{ width: s.tokens / total * 100 + '%' }} title={t('memoria.overview.secTokens', { name: secName(s.name), tokens: s.tokens.toLocaleString() })} />)}</div>
    <div className="mm-chips">{d.sections.map((s, i) => <span key={i} className="mm-chip"><i className={`mm-dot s${i % 6}`} />{`${secName(s.name)} ${Math.round(s.tokens / total * 100)}%`}<small>{`${s.tokens.toLocaleString()}`}</small></span>)}</div></div>;
  // 회상 경로
  const bars = (r: RecallRow) => r.parts && <div className="mm-score" title={t('memoria.overview.scoreTitle', { cos: r.parts.cos.toFixed(2), lex: r.parts.lex.toFixed(2), imp: r.parts.imp.toFixed(2), rec: r.parts.rec.toFixed(2), bonus: r.parts.bonus.toFixed(2) })}>
    <div className="mm-scorebar"><i className="p-cos" style={{ width: 62 * r.parts.cos + '%' }} /><i className="p-lex" style={{ width: 18 * Math.min(1, r.parts.lex) + '%' }} /><i className="p-imp" style={{ width: 12 * r.parts.imp + '%' }} /><i className="p-rec" style={{ width: 8 * r.parts.rec + '%' }} /><i className="p-bonus" style={{ width: 100 * r.parts.bonus + '%' }} /></div><b>{(r.score || 0).toFixed(2)}</b></div>;
  const rows = d?.rows || [];
  const diag = !d ? <p className="hint">{p?.text ? t('memoria.overview.diagManual') : t('memoria.overview.diagEmpty')}</p> : <div className="col">
    {d.fallback ? <p className="mm-warn">{t('memoria.overview.fallback')}</p> : null}
    {d.narrator ? <p className="hint">{t('memoria.overview.narrator')}</p> : null}
    <p className="hint">{t('memoria.overview.rowCounts', { inc: rows.filter(r => r.included).length, exc: rows.filter(r => !r.included).length, hidden: d.hidden })}</p>{shares}
    {rows.length ? <div className="mm-legend"><span><i className="p-cos" />{t('memoria.overview.lg.cos')}</span><span><i className="p-lex" />{t('memoria.overview.lg.lex')}</span><span><i className="p-imp" />{t('memoria.overview.lg.imp')}</span><span><i className="p-rec" />{t('memoria.overview.lg.rec')}</span><span><i className="p-bonus" />{t('memoria.overview.lg.bonus')}</span></div> : null}
    {rows.map((r, i) => {
      const m = mem.memories.find(x => x.id === r.id), via = r.via ? mem.memories.find(x => x.id === r.via) : undefined;
      return <div key={i} className={`mm-recall${r.included ? '' : ' off'}`}><em className={`mm-flag${r.included ? ' on' : ''}`}>{r.included ? t('memoria.overview.included') : t('memoria.overview.excluded')}</em>
        <div className="mm-recall-main"><div><KindBadge k={r.kind} />{' '}{r.summary}</div><small>{`${m ? turnTag(mem, m) : ''} · ${r.reason || t('memoria.overview.related')}${r.excluded ? ` → ${r.excluded}` : ''}`}</small>{via ? <small>{t('memoria.overview.via', { summary: via.summary })}</small> : null}{bars(r)}</div>
        {m ? <Ib name="book" title={t('memoria.overview.source')} onClick={() => showSource(st, m)} /> : null}</div>;
    })}</div>;
  // 장면 연출 (설정에서 켰을 때)
  const dir = mem.direction, plan = dir?.plan, lastAi = [...msgs].reverse().find(m => m.role === 'assistant' && !m.hidden);
  const list = (xs: unknown[]) => <ul>{xs.map((x, i) => <li key={i}>{String(x)}</li>)}</ul>;
  const tension = plan?.tension ? String(plan.tension) : '';
  const direction = cfg.supervisor ? <Sec title={t('memoria.overview.dir.title')} desc={t('memoria.overview.dir.desc')}
    tools={<Btn label={t('memoria.overview.dir.replan')} ic="refresh" cls="ghost" title={t('memoria.overview.dir.replanTitle')} onClick={e => void busyBtn(e.currentTarget, async () => { await M.direct(chat, msgs); st.draw(); })} />}>
    {plan ? <div className="mm-plan">{dir?.afterId !== lastAi?.id ? <p className="hint">{t('memoria.overview.dir.stale')}</p> : null}
      {(plan.remember || []).length ? <div><b>{t('memoria.overview.dir.remember')}</b>{list(plan.remember || [])}</div> : null}{plan.scene_goal ? <div><b>{t('memoria.overview.dir.goal')}</b><p>{String(plan.scene_goal)}</p></div> : null}
      {(plan.ideas || []).length ? <div><b>{t('memoria.overview.dir.ideas')}</b>{list(plan.ideas || [])}</div> : null}{(plan.avoid || []).length ? <div><b>{t('memoria.overview.dir.avoid')}</b>{list(plan.avoid || [])}</div> : null}
      {tension ? <div><b>{t('memoria.overview.dir.tension')}</b><em className={`mm-tension t-${safe(tension)}`}>{['low', 'medium', 'high'].includes(tension) ? t('memoria.overview.dir.t.' + tension) : tension}</em></div> : null}</div> : <None text={t('memoria.overview.dir.none')} />}
  </Sec> : null;
  // 서고에 질문
  const ask = (b: HTMLButtonElement | null) => b && busyBtn(b, async () => {
    const q = (qRef.current?.value || '').trim(); if (!q) return toast(t('memoria.overview.askEmpty'));
    setAns(t('memoria.overview.asking'));
    try { st.answer = await M.ask(chat, q); } catch (e) { const err = e as Error; if (err.name === 'AbortError') throw err; st.answer = t('memoria.overview.askFail', { error: err.message }); }
    setAns(st.answer);
  });
  // 사서에게 정정 요청 (편집 대화)
  const apply = async (l: LogLine) => {
    const draft = M.snapshot(mem); M.applyOps(draft, l.ops || []); const ch = M.diff(mem, draft);
    if (!(await review(ch, t('memoria.overview.reviewTitle')))) return;
    await withCheckpoint(st, '사서 정정 전', async () => {
      const skipped: string[] = [], n = M.applyOps(mem, l.ops || [], skipped); l.applied = true; l.done = n; l.skipped = skipped;
      if (n) toast(t('memoria.overview.applied', { n }), 'ok'); if (skipped.length) toast(t('memoria.overview.skipped', { n: skipped.length }), 'err');
    });
  };
  const log = <div className="mm-log" ref={logRef}>{st.log.map((l, i) => <div key={i} className={`mm-say ${l.role}`}><small className="mm-who">{l.role === 'user' ? t('memoria.overview.me') : t('memoria.overview.librarian')}</small><span>{l.text}</span>
    {l.ops?.length ? <div className="mm-ops"><ul>{l.ops.map((o, j) => <li key={j}>{opText(o)}</li>)}</ul>
      {!l.applied && !l.cancelled ? <div className="row wrap"><Btn label={t('common.apply')} ic="check" cls="primary" title={t('memoria.overview.applyTitle')} onClick={() => void apply(l)} /><Btn label={t('common.cancel')} cls="ghost" onClick={() => { l.cancelled = true; st.draw(); }} /></div> : null}
      {l.applied ? <em className="badge on">{t('memoria.overview.doneBadge', { n: l.done ?? 0 })}</em> : null}{l.cancelled ? <em className="badge">{t('memoria.overview.cancelled')}</em> : null}{(l.skipped || []).map((x, j) => <small key={j} className="err">{'⚠ ' + x}</small>)}</div> : null}</div>)}</div>;
  const send = (b: HTMLButtonElement | null) => b && busyBtn(b, async () => {
    const eq = eqRef.current, v = (eq?.value || '').trim(); if (!v) return toast(t('memoria.overview.reqEmpty')); if (st.sending) return;
    st.sending = true; st.log.push({ role: 'user', text: v }); const wait: LogLine = { role: 'ai', text: t('memoria.overview.checking') }; st.log.push(wait); if (eq) eq.value = ''; st.draw();
    try { const r = await M.propose(chat, v, st.log.slice(0, -2)); Object.assign(wait, { text: r.reply || (r.ops?.length ? t('memoria.overview.willFix') : t('memoria.overview.nothingToFix')), ops: r.ops || [] }); } catch (e) { wait.text = t('memoria.overview.procFail', { error: (e as Error).message }); } finally { st.sending = false; }
    st.draw();
  });
  const btnEl = (label: string, ic: string, cls: string, ref: RefObject<HTMLButtonElement | null>, fn: () => void): ReactNode => <button type="button" ref={ref} className={`btn ${cls}`.trim()} onClick={fn}><Icon name={ic} /><span>{label}</span></button>;
  return <div className="mm-view"><Stats st={st} />
    <Sec title={t('memoria.overview.preview.title')} desc={t('memoria.overview.preview.desc')} tools={tools}>
      {banner}<div className="mm-budget"><span className="mm-tok">{text.trim() ? mark + t('memoria.overview.tokBudget', { tokens: tk.toLocaleString(), budget: budget.toLocaleString() }) : ''}</span><div className={`mm-meter big${tk > budget ? ' over' : ''}`}><i style={{ width: Math.min(100, tk / budget * 100) + '%' }} /></div>{trim ? <small>{trim}</small> : null}{split}</div>
      <textarea ref={taRef} className="inp mm-preview" rows={12} spellCheck={false} value={text} placeholder={t('memoria.overview.preview.ph')} onChange={e => setText(e.target.value)} />
      {lastReal ? <small className="hint">{t('memoria.overview.lastReal', { tokens: lastReal.tokens.toLocaleString(), extra: lastReal.fixed ? (lastReal.fixed === 'pin' ? t('memoria.overview.lastPinned') : t('memoria.overview.lastOnce')) : t('memoria.overview.lastRecall', { n: lastReal.picked.length }) })}</small> : null}
      <details className="mm-details" open={!!st.openDiag} onToggle={e => { st.openDiag = e.currentTarget.open; }}><summary>{t('memoria.overview.diagSummary')}</summary>{diag}</details>
    </Sec>
    {direction}
    <Sec title={t('memoria.overview.ask.title')} desc={<span>{t('memoria.overview.ask.descBefore')}<code>/memoria-ask</code>{t('memoria.overview.ask.descAfter')}</span>}>
      <div className="row"><input ref={qRef} className="inp" placeholder={t('memoria.overview.ask.ph')} defaultValue={st.question || ''} onChange={e => { st.question = e.target.value; }} onKeyDown={enter(() => void ask(askRef.current))} />{btnEl(t('memoria.overview.ask.btn'), 'search', 'primary', askRef, () => void ask(askRef.current))}</div>
      <div className="mm-answer" hidden={!ans}>{ans}</div>
      <details className="mm-details" open={!!st.openEdit || st.log.length > 0} onToggle={e => { st.openEdit = e.currentTarget.open; }}><summary>{t('memoria.overview.edit.summary')}</summary>
        <p className="hint">{t('memoria.overview.edit.hintBefore')}<b>{t('memoria.overview.edit.hintB')}</b>{t('memoria.overview.edit.hintAfter')}</p>
        {st.log.length ? log : null}<div className="row"><input ref={eqRef} className="inp" placeholder={t('memoria.overview.edit.ph')} onKeyDown={enter(() => void send(sendRef.current))} />{btnEl(t('memoria.overview.edit.send'), 'send', '', sendRef, () => void send(sendRef.current))}</div>
        <div className="row"><Btn label={t('common.reset')} cls="ghost" ic="trash" title={t('memoria.overview.edit.resetTitle')} onClick={() => { st.log = []; st.draw(); toast(t('memoria.overview.edit.resetDone')); }} /></div>
      </details>
    </Sec>
    <p className="mm-note"><b>{t('memoria.overview.note.howB')}</b>{t('memoria.overview.note.how')}<br />
      <b>{t('memoria.overview.note.swipeB')}</b>{t('memoria.overview.note.swipe')}</p>
  </div>;
}
