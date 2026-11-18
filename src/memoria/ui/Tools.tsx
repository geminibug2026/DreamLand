// 장기기억 — 도구 탭 (옛 f-memoria.js 의 vTools · activityRows · bible · backfill · recordNow)
// 사서 일지 · 색인 · 맞추기 · 서사 시계 · 서고 정리 · 복구 지점 · 인계 · 스토리 바이블 · 백업
import { Fragment, useEffect, useReducer, useRef, useState, type MouseEvent } from 'react';
import { Btn } from '../../kit';
import { confirmBox, toast } from '../../ui';
import type { CheckpointInfo, ExportRead, Obj } from '../types';
import type { Bond, ChatM, Mem } from '../types';
import { Ico, None, Sec, busyBtn, chatTitle, confirmList, editBox, ensureCfg, isCur, msgsOf, persistMsgs, progressBox, review, safe, type StOpen } from './parts';
import { Memory } from '../../lib/memory';
import { chatApi } from '../../chat/actions';
import { t, locale } from '../../i18n';
import * as memMod from '../../lib/memory';
import * as core from '../../lib/core';

/** 명령어 목록 [이름, 설명 키, 인자 키] — 도구 탭 맨 아래 안내가 쓴다 (설명 · 인자는 그릴 때 t()) */
export const COMMANDS: [string, string, string?][] = [['/memoria', 'memoria.tools.cmd.toggle'], ['/memoria-autorecord', 'memoria.tools.cmd.autorecord'], ['/memoria-remember', 'memoria.tools.cmd.remember', 'memoria.tools.cmd.argContent'], ['/memoria-search', 'memoria.tools.cmd.search', 'memoria.tools.cmd.argQuery'], ['/memoria-ask', 'memoria.tools.cmd.ask', 'memoria.tools.cmd.argQuestion'], ['/memoria-index', 'memoria.tools.cmd.index'], ['/memoria-clock', 'memoria.tools.cmd.clock'], ['/memoria-reconcile', 'memoria.tools.cmd.reconcile'], ['/memoria-open', 'memoria.tools.cmd.open']];

// ════════ 작업 ════════
/** 「기록」 — 마지막 답변 턴을 지금 바로 기록한다 */
export async function recordNow(chat: ChatM) {
  const M = Memory, api = chatApi;
  ensureCfg(); const msgs = await msgsOf(chat), last = [...msgs].reverse().find(m => m.role === 'assistant' && !m.hidden && !m.greeting);
  if (!last) return toast(t('memoria.tools.record.none'));
  toast(t('memoria.tools.record.start')); if (isCur(chat)) api.setStatus(t('memoria.tools.record.status'));
  try {
    // 묶음 기록: 밀린 게 많으면 묶음 단위로 먼저 기록하고(한 번에 너무 큰 요청이 되지 않게), 마지막 답장으로 남은 끝자락까지 기록한다
    if (M.batchSize(chat) > 1) { const m0 = await M.load(chat.id); for (const m of M.pending(m0, msgs)) if (m !== last) await M.commit(chat, msgs, m, { force: true }); }
    const mem = await M.commit(chat, msgs, last, { force: true }); const tr = mem.turns.find(x => x.msgId === last.id); toast(tr?.failed ? t('memoria.tools.record.failed', { error: tr.error || '' }) : t('memoria.tools.record.done'), tr?.failed ? 'err' : 'ok'); }
  catch (e) { toast(t('memoria.tools.record.error', { error: (e as Error).message }), 'err'); } finally { if (isCur(chat)) { api.setStatus(''); api.redraw(); } }
}
/** 「색인」 — 아직 기록되지 않은 턴과 기록에 실패한 턴을 순서대로 기록한다. 끝나면(10턴 이상) 서사 시계를 한 번 재계산한다 */
export async function backfill(chat: ChatM, { from = 0, to = Infinity, includeHidden = false }: { from?: number; to?: number; includeHidden?: boolean } = {}) {
  const M = Memory;
  if (!ensureCfg().enabled) return toast(t('memoria.tools.index.off'));
  const msgs = await msgsOf(chat), mem = await M.load(chat.id); M.reconcile(mem, msgs);
  const todo = M.pending(mem, msgs, { includeHidden, from, to });
  if (!todo.length) { const skipped = includeHidden ? 0 : M.pending(mem, msgs, { includeHidden: true, from, to }).length; return toast(skipped ? t('memoria.tools.index.noneSkipped', { count: skipped }) : t('memoria.tools.index.none')); }
  if (!(await confirmBox(t('memoria.tools.index.ask', { count: todo.length }), t('memoria.tools.index.btn')))) return;
  const pb = progressBox(t('memoria.tools.index.title')); let n = 0, failed = 0;
  try {
    for (const m of todo) { if (pb.stopped()) break; pb.set(n + 1, todo.length, t('memoria.tools.index.progress')); await M.commit(chat, msgs, m, { signal: pb.signal, force: true }); n++; if (mem.turns.find(x => x.msgId === m.id)?.failed) failed++; }
    toast(t(pb.stopped() ? 'memoria.tools.index.stopped' : 'memoria.tools.index.finished', { count: n }) + (failed ? t('memoria.tools.index.failedPart', { count: failed }) : ''), failed ? '' : 'ok');
    // 일괄 색인은 턴을 하나씩 떼어 보므로 경과 시간 어림이 쌓여 어긋난다 — 어느 정도 쌓였으면 전체를 이어 읽어 시계를 바로잡는다
    if (!pb.stopped() && n >= 10 && M.cfg().storyClock !== false) { pb.say(t('memoria.tools.index.clock')); await M.recalClock(chat, mem, { signal: pb.signal }).catch(() => { }); }
  } catch (e) { const err = e as Error; if (err.name !== 'AbortError') toast(t('memoria.tools.index.error', { error: err.message }), 'err'); }
  pb.close(); if (isCur(chat)) chatApi.redraw();
}

/** 스토리 바이블 — 지금까지의 서고 전체를 사람이 읽는 마크다운 문서로. 모델을 부르지 않는다 */
export function bible(chat: ChatM, m: Mem): string {
  const M = Memory, { fmtDays, LOCKS, KINDS } = memMod;
  const L = (k: string, v?: Record<string, unknown>) => t('memoria.tools.bible.' + k, v);
  const md = [`# ${L('docTitle', { name: chatTitle(chat) })}`, `> ${L('intro', { date: new Date().toLocaleString(locale()), turns: m.turns.length, memories: m.memories.length })}`], sc = M.scene(m);
  if (sc.any) md.push(`\n**${L('scene')}** — ${[sc.location, sc.date, sc.time].filter(Boolean).join(' · ')}`);
  const total = m.turns.reduce((a, x) => a + (x.days || 0), 0); if (total >= 1) md.push(`\n**${L('clock')}** — ${L('clockText', { days: fmtDays(total) })}`);
  const cast = m.cast.filter(c => !c.disabled);
  if (cast.length) {
    md.push(`\n## ${L('cast')}`);
    for (const c of cast) {
      const hd = [c.role, c.age, c.occupation].filter(Boolean).join(' · ');
      md.push(`\n### ${c.name}${c.provisional ? ` (${L('provisional')})` : ''}${hd ? ` (${hd})` : ''}`); if (c.aka?.length) md.push(`- ${L('aka')}: ${c.aka.join(', ')}`); if (c.appearance) md.push(`- ${L('appearance')}: ${c.appearance}`); if (c.core) md.push(`- ${L('core')}: ${c.core}`); if (c.voice) md.push(`- ${L('voice')}: ${c.voice}`); if (c.traits?.length) md.push(`- ${L('traits')}: ${c.traits.join(', ')}`);
      for (const g of c.growth || []) md.push(`- ${L('growth')}: ${g.text}`); for (const l of c.lines || []) md.push(`- ${L('line')}: "${l.text}"`); for (const r of c.relationships || []) md.push(`- ${L('rel')} → ${r.target}: ${r.relation}`);
    }
  }
  const now = (b: Bond) => M.bondNow ? M.bondNow(b) : b.log?.[b.log.length - 1] || null, bonds = (m.bonds || []).filter(b => !b.disabled && now(b));
  if (bonds.length) {
    md.push(`\n## ${L('bonds')}`);
    for (const b of bonds) {
      const n = now(b)!, path: string[] = []; for (const e of b.log) if (path[path.length - 1] !== e.stage) path.push(e.stage);
      md.push(`\n### ${b.from} → ${b.to}: ${n.stage}`); if (n.basis) md.push(`- ${L('basis')}: ${n.basis}`); if (n.calls) md.push(`- ${L('calls')}: ${n.calls}`); if (n.unsaid) md.push(`- ${L('unsaid')}: ${n.unsaid}`); if (path.length > 1) md.push(`- ${L('path')}: ${path.join(' → ')}`);
    }
  }
  if (m.canon.length) { md.push(`\n## ${L('canon')}`); for (const r of m.canon) md.push(`- **${r.key}** = ${r.value} _(${r.scope}${r.scopeName ? `:${r.scopeName}` : ''})_`); }
  const act = m.pledges.filter(p => p.status === 'active'); if (act.length) { md.push(`\n## ${L('pledges')}`); for (const l of act) md.push(`- [${LOCKS[l.kind] || l.kind}] ${l.summary}`); }
  if (m.status.length) { md.push(`\n## ${L('status')}`); for (const s of m.status) md.push(`- ${s.entity} · ${s.slot} = ${s.value}${s.claim === 'belief' ? ` (${L('belief')})` : ''}`); }
  if (m.milestones.length) { md.push(`\n## ${L('milestones')}`); for (const e of [...m.milestones].sort((a, b) => (a.turn || 0) - (b.turn || 0))) md.push(`- **t${e.turn != null ? e.turn + 1 : '?'} · ${e.title}**${e.summary ? ` — ${e.summary}` : ''}${(e.participants || []).length ? ` _(${(e.participants || []).join(', ')})_` : ''}`); }
  const items = m.items.filter(i => !i.disabled); if (items.length) { md.push(`\n## ${L('items')}`); for (const it of items) md.push(`- **${it.name}**${it.holder ? ` (${L('holder')}: ${it.holder})` : ''}${it.meaning ? ` — ${it.meaning}` : ''}${it.status ? ` [${it.status}]` : ''}`); }
  const sums = [...m.arcs.filter(a => a.carried), ...[...m.arcs.filter(a => !a.carried), ...m.chunks].sort((a, b) => a.from - b.from)];
  if (sums.length) { md.push(`\n## ${L('story')}`); for (const s of sums) { md.push(`\n**${s.carried ? L('carried', { from: s.carriedFrom || L('carriedDefault') }) : `t${s.from + 1}–t${s.to + 1}`}**`); md.push(s.text); } }
  const dg = m.turns.map((x, i) => x.digest && `- **t${i + 1}** — ${x.digest}`).filter((x): x is string => !!x); if (dg.length) md.push(`\n## ${L('timeline')}`, ...dg);
  const pins = m.memories.filter(x => x.pinned && !x.disabled); if (pins.length) { md.push(`\n## ${L('pinned')}`); for (const x of pins) md.push(`- (${KINDS[x.kind] || x.kind}${x.turn != null && !x.manual ? `, t${x.turn + 1}` : ''}) ${x.summary}`); }
  return md.join('\n');
}

// ════════ 사서 일지 ════════
const ACT_IC: Record<string, string> = { check: 'check', side: 'shuffle', recall: 'search', record: 'feather', summary: 'book', defer: 'glass', ledger: 'snow', update: 'edit', bundle: 'layers', error: 'warn' };
/** 사서 일지 — 저절로 일어난 일(회상 · 기록 · 요약 · 미룸 · 오류). 최신이 위, 60줄까지 */
export function ActivityRows() {
  const M = Memory, rows = M.activity?.() || M.activityLog?.list?.() || [], clock = (at: number) => new Date(at).toLocaleTimeString(locale(), { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  return rows.length ? <>{rows.slice(0, 60).map((r, i) => <div key={i} className={`mm-row mm-act a-${safe(r.kind)}`}><Ico name={ACT_IC[r.kind] || 'note'} size={14} /><span className="mm-row-text">{r.text}{r.count > 1 ? <small>{` ×${r.count}`}</small> : null}</span><small className="mm-act-at">{clock(r.at)}</small></div>)}</>
    : <None text={t('memoria.tools.log.empty')} />;
}

const DBtn = ({ label, ic, cls, title, onClick }: { label: string; ic: string; cls: string; title?: string; onClick: (e: MouseEvent<HTMLButtonElement>) => unknown }) => <Btn label={label} ic={ic} cls={cls} title={title} onClick={e => void onClick(e)} />;

export function Tools({ st }: { st: StOpen }) {
  const M = Memory, { download, pickFiles } = core, { fmtDays } = memMod;
  const { chat, mem, msgs } = st, cfg = M.cfg();
  // 사서 일지는 이 탭이 열려 있을 때만 알림을 받아 다시 그린다
  const [, bumpAct] = useReducer((x: number) => x + 1, 0);
  useEffect(() => core.on('memory:activity', core.debounce(bumpAct, 120)), []);
  const [cps, setCps] = useState<CheckpointInfo[] | null>(null), [prog, setProg] = useState(''), [cprog, setCprog] = useState('');
  const drawCps = () => M.checkpoints(chat.id).then(setCps, () => setCps([]));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { void drawCps(); }, [chat.id, mem]);
  const fromRef = useRef<HTMLInputElement>(null), toRef = useRef<HTMLInputElement>(null), hidRef = useRef<HTMLInputElement>(null);
  const pending = M.pending(mem, msgs).length, hiddenN = msgs.filter(m => m.hidden).length;
  const file = (name: string) => `${name}-${chatTitle(chat).replace(/[\\/:*?"<>|]/g, '_').slice(0, 40)}`;
  const restore = async (p: CheckpointInfo) => {
    if (M.busy()) return toast(t('memoria.tools.cp.busyRestore'), 'err');
    const data = await M.checkpointData(chat.id, p.id), turns = mem.turns.length; if (!data) return;
    if (!(await review(M.diff(mem, data), t('memoria.tools.cp.restoreTitle', { label: p.label }), t('memoria.tools.cp.restoreNote')))) return;
    if (M.busy() || (M.get(chat.id) || mem) !== mem || mem.turns.length !== turns) return toast(t('memoria.tools.cp.changed'), 'err');
    await M.checkpoint(mem, '복구 실행 전'); st.mem = await M.replace(chat.id, data); M.reconcile(st.mem, msgs); await M.save(st.mem); M.override(chat.id, null); st.draft = null; toast(t('memoria.tools.cp.restored'), 'ok'); st.draw();
  };
  const readFile = async (choose = false): Promise<ExportRead | null> => {
    const [f] = await pickFiles({ accept: '.json,application/json' }); if (!f) return null;
    try {
      let data = JSON.parse(await f.text()) as Obj;
      if (data?.type === 'dreamland-memoria-library' && Array.isArray(data.items)) {   // 서고 목록에서 한 번에 받은 묶음 백업
        const list = data.items as Obj[];
        let it: Obj | null | undefined = list.length === 1 ? list[0] : choose ? null : list.find(x => x.chatId === chat.id);
        if (!it && choose && list.length) { const d = await editBox(t('memoria.tools.carry.pickTitle'), { i: '0' }, [{ k: 'i', label: t('memoria.tools.carry.pickLabel'), type: 'select', opts: list.map((x, i) => [String(i), String(x.chatName || x.chatId || t('memoria.tools.carry.chatN', { n: i + 1 }))] as const) }], { okLabel: t('memoria.tools.carry.pickOk') }); if (!d) return null; it = list[+d.i]; }
        if (!it) throw new Error(t('memoria.tools.carry.notInBundle', { count: list.length, names: list.slice(0, 4).map(x => x.chatName || x.chatId).join(', ') + (list.length > 4 ? ' …' : '') }));
        data = it;
      }
      return M.readExport(data);
    } catch (e) { console.error('[장기기억] 가져오기 실패:', e); toast(t('memoria.tools.importFail', { error: (e as Error).message }), 'err'); return null; }
  };
  const fmt = (d: number) => d >= 1 ? fmtDays(d) : t('memoria.tools.clock.lessThanDay');
  return <div className="mm-view">
    <Sec title={t('memoria.tools.log.title')} desc={t('memoria.tools.log.desc')}
      tools={<Btn label={t('memoria.tools.log.clear')} ic="trash" cls="ghost" onClick={() => { if (M.clearActivity) M.clearActivity(); else M.activityLog?.clear?.(); bumpAct(); }} />}>
      <div className="mm-rows mm-actlist"><ActivityRows /></div></Sec>
    <Sec title={t('memoria.tools.index.title')} desc={t('memoria.tools.index.desc')}>
      <label className="check mm-inline" title={t('memoria.tools.index.hiddenTitle')}><input ref={hidRef} type="checkbox" /><i /><span>{t('memoria.tools.index.hidden')}</span></label>
      <div className="row wrap"><div className="mm-range"><input ref={fromRef} className="inp" type="number" min={1} step={1} placeholder={t('memoria.tools.index.from')} /><span>~</span><input ref={toRef} className="inp" type="number" min={1} step={1} placeholder={t('memoria.tools.index.to')} /></div>
        <DBtn label={t('memoria.tools.index.btn')} ic="play" cls="primary" title={t('memoria.tools.index.btnTitle')} onClick={async () => { await backfill(chat, { from: +(fromRef.current?.value || 0) || 0, to: +(toRef.current?.value || 0) || Infinity, includeHidden: !!hidRef.current?.checked }); await st.reload(); }} />
        <span className="mm-progress">{pending ? t('memoria.tools.index.pending', { count: pending }) : t('memoria.tools.index.noPending')}</span></div></Sec>
    <Sec title={t('memoria.tools.reconcile.title')} desc={<span>{t('memoria.tools.reconcile.descBefore')}<b>{t('memoria.tools.reconcile.descBold')}</b>{t('memoria.tools.reconcile.descAfter')}</span>}>
      <div className="row"><DBtn label={t('memoria.tools.reconcile.btn')} ic="link" cls="ghost" title={t('memoria.tools.reconcile.btnTitle')} onClick={async () => { const n = mem.turns.length, ch = M.reconcile(mem, msgs); if (ch) await M.save(mem); toast(ch ? t('memoria.tools.reconcile.done', { from: n, to: mem.turns.length }) : t('memoria.tools.reconcile.same'), ch ? 'ok' : ''); st.draw(); }} /></div></Sec>
    <Sec title={t('memoria.tools.clock.title')} desc={t('memoria.tools.clock.desc', { total: (mem.clockDays || 0) >= 1 ? fmtDays(mem.clockDays) : t('memoria.tools.clock.lessThanDay') })}>
      <div className="row"><DBtn label={t('memoria.tools.clock.btn')} ic="refresh" cls="ghost" title={t('memoria.tools.clock.btnTitle')} onClick={e => busyBtn(e.currentTarget, async () => {
        if (M.busy()) setProg(t('memoria.tools.clock.waiting'));
        const r = await M.recalClock(chat, mem, { onProgress: (d, tot) => { setProg(t('memoria.tools.clock.progress', { done: d, total: tot })); } }); if (!r) { setProg(''); return toast(t('memoria.tools.clock.none')); }
        toast(t('memoria.tools.clock.done', { after: fmt(r.after), before: fmt(r.before) }) + (r.failed ? t('memoria.tools.clock.failedPart', { count: r.failed }) : '') + t('memoria.tools.clock.doneEnd'), 'ok'); st.draw();
      })} /><span className="mm-progress">{prog}</span></div></Sec>
    <Sec title={t('memoria.tools.consolidate.title')} desc={t('memoria.tools.consolidate.desc')}>
      <div className="row wrap"><DBtn label={t('memoria.tools.consolidate.btn')} ic="sparkle" cls="ghost" title={t('memoria.tools.consolidate.btnTitle')} onClick={e => busyBtn(e.currentTarget, async () => {
        if (M.busy()) return toast(t('memoria.tools.consolidate.busy'));
        setCprog(t('memoria.tools.consolidate.making'));
        try {
          const draft = M.snapshot(mem), turns0 = mem.turns.length; await M.consolidate(chat, draft); const ch = M.diff(mem, draft), c = (ty: string) => ch.filter(x => x.type === ty).length;
          if (!ch.length) return toast(t('memoria.tools.consolidate.none'));
          if (!(await review(ch, t('memoria.tools.consolidate.reviewTitle')))) return toast(t('memoria.tools.consolidate.notApplied'));
          if (M.busy() || (M.get(chat.id) || mem) !== mem || mem.turns.length !== turns0) return toast(t('memoria.tools.consolidate.changed'), 'err');
          await M.checkpoint(mem, '서고 정리 전'); draft.consolidatedAt = draft.turns.length; st.mem = await M.replace(chat.id, draft); toast(t('memoria.tools.consolidate.done', { removed: c('removed'), changed: c('changed') }), 'ok'); st.draw();
        } catch (e) { const err = e as Error; if (err.name === 'AbortError') throw err; console.error('[장기기억] 서고 정리 실패:', err); toast(t('memoria.tools.consolidate.fail', { error: err.message || '' }), 'err'); } finally { setCprog(''); }
      })} />
        <DBtn label={t('memoria.tools.regroup.btn')} ic="merge" cls="ghost" title={t('memoria.tools.regroup.btnTitle')} onClick={e => busyBtn(e.currentTarget, async () => { await M.checkpoint(mem, '연대기 병합 전'); const n = await M.regroup(chat, mem); await M.save(mem); toast(n == null ? t('memoria.tools.regroup.none') : t('memoria.tools.regroup.done', { count: n }), n ? 'ok' : ''); st.draw(); })} />
        <span className="mm-progress">{cprog}</span></div></Sec>
    <Sec title={t('memoria.tools.cp.title')} desc={t('memoria.tools.cp.desc')}
      tools={<DBtn label={t('memoria.tools.cp.keep')} ic="mark" cls="ghost" title={t('memoria.tools.cp.keepTitle')} onClick={async () => { if (M.busy()) return toast(t('memoria.tools.cp.busySave'), 'err'); const p = await M.checkpoint(mem, '직접 저장한 서고'); toast(p ? t('memoria.tools.cp.saved') : t('memoria.tools.cp.tooBig'), p ? 'ok' : 'err'); await drawCps(); }} />}>
      <div className="mm-rows">{(cps || []).map(p => <div key={p.id} className="mm-row"><div className="mm-row-text"><b>{p.label}</b><small>{` ${new Date(p.at).toLocaleString(locale())} · t${p.turn} · ${Math.ceil(p.bytes / 1024)} KB`}</small></div><DBtn label={t('memoria.tools.cp.restore')} ic="refresh" cls="ghost" onClick={() => restore(p)} /></div>)}
        {cps && !cps.length ? <p className="hint">{t('memoria.tools.cp.empty')}</p> : null}</div></Sec>
    <Sec title={t('memoria.tools.carry.title')} desc={t('memoria.tools.carry.desc')}>
      <div className="row"><DBtn label={t('memoria.tools.carry.btn')} ic="users" cls="ghost" title={t('memoria.tools.carry.btnTitle')} onClick={async () => {
        if (M.busy()) return toast(t('memoria.tools.carry.busy'), 'err'); const r = await readFile(true); if (!r) return; const draft = M.snapshot(mem); M.carry(draft, r.store, r.label);
        if (!(await review(M.diff(mem, draft), t('memoria.tools.carry.reviewTitle', { label: r.label })))) return; await M.checkpoint(mem, '다른 대화 인계 전'); const n = M.carry(mem, r.store, r.label); await M.save(mem);
        toast(t('memoria.tools.carry.done', { summaries: n.summaries, memories: n.memories, cast: n.cast, canon: n.canon, pledges: n.pledges }) + (n.bonds ? t('memoria.tools.carry.doneBonds', { count: n.bonds }) : ''), 'ok'); st.draw();
      }} /></div></Sec>
    <Sec title={t('memoria.tools.bible.title')} desc={t('memoria.tools.bible.desc')}>
      <div className="row"><Btn label={t('common.export')} ic="book" cls="ghost" title={t('memoria.tools.bible.btnTitle')} onClick={() => { download(`${file('story-bible')}.md`, bible(chat, mem), 'text/markdown'); toast(t('memoria.tools.bible.done'), 'ok'); }} /></div></Sec>
    <Sec title={t('memoria.tools.backup.title')} desc={t('memoria.tools.backup.desc')}>
      <div className="row wrap"><Btn label={t('common.export')} ic="import" cls="ghost" onClick={() => { download(`${file('memoria')}.json`, JSON.stringify(M.exportData(chat, mem), null, 2)); toast(t('memoria.tools.backup.exported'), 'ok'); }} />
        <DBtn label={t('common.import')} ic="upload" cls="ghost" onClick={async () => {
          const r = await readFile(); if (!r) return; if (r.foreign) return toast(t('memoria.tools.backup.foreign'), 'err');
          const data = M.normalize(r.store, chat.id), turns = mem.turns.length; if (!(await review(M.diff(mem, data), t('memoria.tools.backup.reviewTitle'), t('memoria.tools.backup.reviewNote')))) return;
          if (M.busy() || (M.get(chat.id) || mem) !== mem || mem.turns.length !== turns) return toast(t('memoria.tools.backup.changed'), 'err');
          await M.checkpoint(mem, '파일 복원 전'); st.mem = await M.replace(chat.id, data); M.reconcile(st.mem, msgs); await M.save(st.mem); M.override(chat.id, null); st.draft = null; toast(t('memoria.tools.backup.restored'), 'ok'); st.draw();
        }} />
        <DBtn label={hiddenN ? t('memoria.tools.unhide.labelN', { count: hiddenN }) : t('memoria.tools.unhide.label')} ic="eye" cls="ghost" title={t('memoria.tools.unhide.title')} onClick={async () => { if (!hiddenN) return toast(t('memoria.tools.unhide.none')); if (!(await confirmBox(t('memoria.tools.unhide.ask', { count: hiddenN }), t('memoria.tools.unhide.ok')))) return; for (const m of msgs) { m.hidden = false; delete m.memHidden; } await persistMsgs(chat, msgs); toast(t('memoria.tools.unhide.done'), 'ok'); st.draw(); }} />
        {cfg.autoHide ? <DBtn label={t('memoria.tools.autoHide.label')} ic="eyeoff" cls="ghost" title={t('memoria.tools.autoHide.title')} onClick={async () => { const n = M.autoHide(chat, msgs); if (n) await persistMsgs(chat, msgs); toast(n ? t('memoria.tools.autoHide.done', { count: n }) : t('memoria.tools.autoHide.none')); st.draw(); }} /> : null}
        <DBtn label={t('common.reset')} ic="trash" cls="danger" title={t('memoria.tools.reset.title')} onClick={async () => {
          if (M.busy()) return toast(t('memoria.tools.reset.busy'), 'err');
          if (!(await confirmList(t('memoria.tools.reset.ask'), [t('memoria.tools.reset.line1'), t('memoria.tools.reset.line2'), t('memoria.tools.reset.line3')], t('memoria.tools.reset.ok'), true))) return;
          await M.checkpoint(mem, '서고 초기화 전'); st.mem = await M.reset(chat.id); st.draft = null; st.log = []; let shown = 0; for (const x of msgs) if (x.memHidden) { x.hidden = false; delete x.memHidden; shown++; } if (shown) await persistMsgs(chat, msgs);
          toast(t('memoria.tools.reset.done'), 'ok'); st.draw();
        }} /></div></Sec>
    <p className="mm-note"><b>{t('memoria.tools.note.commands')}</b>{' — '}{COMMANDS.map(([c, d, a], i) => <Fragment key={c}>{i ? ' · ' : null}<code>{a ? `${c} ${t(a)}` : c}</code>{' ' + t(d)}</Fragment>)}<br /><b>{t('memoria.tools.note.macros')}</b>{' — '}<code>{'{{memoria_story}}'}</code>{t('memoria.tools.note.macroStory')}<code>{'{{memoria_count}}'}</code>{t('memoria.tools.note.macroCount')}<br />
      <b>{t('memoria.tools.note.emptyTitle')}</b>{t('memoria.tools.note.emptyText')}</p>
  </div>;
}
