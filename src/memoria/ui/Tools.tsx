// 장기기억 — 도구 탭 (옛 f-memoria.js 의 vTools · activityRows · bible · backfill · recordNow)
// 사서 일지 · 색인 · 맞추기 · 서사 시계 · 서고 정리 · 복구 지점 · 인계 · 스토리 바이블 · 백업
import { Fragment, useEffect, useReducer, useRef, useState, type MouseEvent } from 'react';
import { Btn } from '../../kit';
import { confirmBox } from '../../ui';
import { Memory, chatApi, core, memMod, toast, type CheckpointInfo, type ExportRead, type Obj } from '../bridge';
import type { Bond, ChatM, Mem } from '../types';
import { Ico, None, Sec, busyBtn, chatTitle, confirmList, editBox, ensureCfg, isCur, msgsOf, persistMsgs, progressBox, review, safe, type StOpen } from './parts';

/** 명령어 목록 [이름, 설명] — 도구 탭 맨 아래 안내와 명령 등록이 함께 쓴다 */
export const COMMANDS: [string, string][] = [['/memoria', '켜기/끄기'], ['/memoria-autorecord', '자동 기록 켜기/끄기'], ['/memoria-remember 내용', '수동 기억'], ['/memoria-search 검색어', '기억 검색'], ['/memoria-ask 질문', '서고에 질문'], ['/memoria-index', '전체 색인'], ['/memoria-clock', '서사 시계 재계산'], ['/memoria-reconcile', '대화와 기록 맞추기'], ['/memoria-open', '서고 열기']];

// ════════ 작업 ════════
/** 「기록」 — 마지막 답변 턴을 지금 바로 기록한다 */
export async function recordNow(chat: ChatM) {
  const M = Memory(), api = chatApi();
  ensureCfg(); const msgs = await msgsOf(chat), last = [...msgs].reverse().find(m => m.role === 'assistant' && !m.hidden && !m.greeting);
  if (!last) return toast('기록할 답변이 없습니다.');
  toast('마지막 턴을 기록합니다…'); if (isCur(chat)) api.setStatus('기억 정리 중…');
  try { const mem = await M.commit(chat, msgs, last, { force: true }); const t = mem.turns.find(x => x.msgId === last.id); toast(t?.failed ? '기록하지 못했습니다: ' + (t.error || '') : '마지막 턴을 기록했습니다.', t?.failed ? 'err' : 'ok'); }
  catch (e) { toast('기록 실패: ' + (e as Error).message, 'err'); } finally { if (isCur(chat)) { api.setStatus(''); api.redraw(); } }
}
/** 「색인」 — 아직 기록되지 않은 턴과 기록에 실패한 턴을 순서대로 기록한다. 끝나면(10턴 이상) 서사 시계를 한 번 재계산한다 */
export async function backfill(chat: ChatM, { from = 0, to = Infinity, includeHidden = false }: { from?: number; to?: number; includeHidden?: boolean } = {}) {
  const M = Memory();
  if (!ensureCfg().enabled) return toast('장기기억이 꺼져 있습니다.');
  const msgs = await msgsOf(chat), mem = await M.load(chat.id); M.reconcile(mem, msgs);
  const todo = M.pending(mem, msgs, { includeHidden, from, to });
  if (!todo.length) { const skipped = includeHidden ? 0 : M.pending(mem, msgs, { includeHidden: true, from, to }).length; return toast(skipped ? `색인할 새 메시지가 없습니다. 숨겨진 메시지 ${skipped}개를 건너뛰었습니다 — 「숨겨진 메시지도 포함」을 켜거나, 도구 탭의 「숨김 해제」 뒤에 다시 시도하세요.` : '색인할 새 메시지가 없습니다.'); }
  if (!(await confirmBox(`아직 기록되지 않았거나 기록에 실패한 답변 ${todo.length}개를 순서대로 색인할까요? 답변마다 사서를 한 번씩 부릅니다.`, '색인'))) return;
  const pb = progressBox('과거 대화 색인'); let n = 0, failed = 0;
  try {
    for (const m of todo) { if (pb.stopped()) break; pb.set(n + 1, todo.length, '색인 중…'); await M.commit(chat, msgs, m, { signal: pb.signal, force: true }); n++; if (mem.turns.find(t => t.msgId === m.id)?.failed) failed++; }
    toast(`${n}개 턴 색인 ${pb.stopped() ? '중단' : '완료'}${failed ? ` (실패 ${failed}개 — 다시 실행하면 재시도합니다)` : ''}`, failed ? '' : 'ok');
    // 일괄 색인은 턴을 하나씩 떼어 보므로 경과 시간 어림이 쌓여 어긋난다 — 어느 정도 쌓였으면 전체를 이어 읽어 시계를 바로잡는다
    if (!pb.stopped() && n >= 10 && M.cfg().storyClock !== false) { pb.say('색인이 끝나 서사 시계를 재계산합니다…'); await M.recalClock(chat, mem, { signal: pb.signal }).catch(() => { }); }
  } catch (e) { const err = e as Error; if (err.name !== 'AbortError') toast('색인 실패: ' + err.message, 'err'); }
  pb.close(); if (isCur(chat)) chatApi().redraw();
}

/** 스토리 바이블 — 지금까지의 서고 전체를 사람이 읽는 마크다운 문서로. 모델을 부르지 않는다 */
export function bible(chat: ChatM, m: Mem): string {
  const M = Memory(), { fmtDays, LOCKS, KINDS } = memMod();
  const md = [`# 스토리 바이블 — ${chatTitle(chat)}`, `> 장기기억 서고가 정리한 이 이야기의 기록입니다. (${new Date().toLocaleString('ko-KR')} · ${m.turns.length}턴 · 기억 ${m.memories.length}개)`], sc = M.scene(m);
  if (sc.any) md.push(`\n**현재 장면** — ${[sc.location, sc.date, sc.time].filter(Boolean).join(' · ')}`);
  const total = m.turns.reduce((a, t) => a + (t.days || 0), 0); if (total >= 1) md.push(`\n**서사 시계** — 이야기 시작 후 약 ${fmtDays(total)} 경과`);
  const cast = m.cast.filter(c => !c.disabled);
  if (cast.length) {
    md.push('\n## 등장인물');
    for (const c of cast) {
      const hd = [c.role, c.age, c.occupation].filter(Boolean).join(' · ');
      md.push(`\n### ${c.name}${c.provisional ? ' (미확인 — 아직 이름이 밝혀지지 않음)' : ''}${hd ? ` (${hd})` : ''}`); if (c.aka?.length) md.push(`- 별칭: ${c.aka.join(', ')}`); if (c.appearance) md.push(`- 외모: ${c.appearance}`); if (c.core) md.push(`- 바탕: ${c.core}`); if (c.voice) md.push(`- 말투: ${c.voice}`); if (c.traits?.length) md.push(`- 특성: ${c.traits.join(', ')}`);
      for (const g of c.growth || []) md.push(`- 달라진 점: ${g.text}`); for (const l of c.lines || []) md.push(`- 대사: "${l.text}"`); for (const r of c.relationships || []) md.push(`- 관계 → ${r.target}: ${r.relation}`);
    }
  }
  const now = (b: Bond) => M.bondNow ? M.bondNow(b) : b.log?.[b.log.length - 1] || null, bonds = (m.bonds || []).filter(b => !b.disabled && now(b));
  if (bonds.length) {
    md.push('\n## 관계선');
    for (const b of bonds) {
      const n = now(b)!, path: string[] = []; for (const e of b.log) if (path[path.length - 1] !== e.stage) path.push(e.stage);
      md.push(`\n### ${b.from} → ${b.to}: ${n.stage}`); if (n.basis) md.push(`- 근거: ${n.basis}`); if (n.calls) md.push(`- 부르는 말: ${n.calls}`); if (n.unsaid) md.push(`- 말하지 못한 것: ${n.unsaid}`); if (path.length > 1) md.push(`- 지나온 길: ${path.join(' → ')}`);
    }
  }
  if (m.canon.length) { md.push('\n## 캐논 (세계 설정)'); for (const r of m.canon) md.push(`- **${r.key}** = ${r.value} _(${r.scope}${r.scopeName ? `:${r.scopeName}` : ''})_`); }
  const act = m.pledges.filter(p => p.status === 'active'); if (act.length) { md.push('\n## 서약 (지켜지는 중)'); for (const l of act) md.push(`- [${LOCKS[l.kind] || l.kind}] ${l.summary}`); }
  if (m.status.length) { md.push('\n## 상태 보드'); for (const s of m.status) md.push(`- ${s.entity} · ${s.slot} = ${s.value}${s.claim === 'belief' ? ' (믿음)' : ''}`); }
  if (m.milestones.length) { md.push('\n## 주요 사건 연표'); for (const e of [...m.milestones].sort((a, b) => (a.turn || 0) - (b.turn || 0))) md.push(`- **t${e.turn != null ? e.turn + 1 : '?'} · ${e.title}**${e.summary ? ` — ${e.summary}` : ''}${(e.participants || []).length ? ` _(${(e.participants || []).join(', ')})_` : ''}`); }
  const items = m.items.filter(i => !i.disabled); if (items.length) { md.push('\n## 주요 아이템'); for (const it of items) md.push(`- **${it.name}**${it.holder ? ` (소유: ${it.holder})` : ''}${it.meaning ? ` — ${it.meaning}` : ''}${it.status ? ` [${it.status}]` : ''}`); }
  const sums = [...m.arcs.filter(a => a.carried), ...[...m.arcs.filter(a => !a.carried), ...m.chunks].sort((a, b) => a.from - b.from)];
  if (sums.length) { md.push('\n## 지금까지의 이야기'); for (const s of sums) { md.push(`\n**${s.carried ? `이전 대화 (${s.carriedFrom || '인계'})` : `t${s.from + 1}–t${s.to + 1}`}**`); md.push(s.text); } }
  const dg = m.turns.map((t, i) => t.digest && `- **t${i + 1}** — ${t.digest}`).filter((x): x is string => !!x); if (dg.length) md.push('\n## 타임라인 (턴별 기록)', ...dg);
  const pins = m.memories.filter(x => x.pinned && !x.disabled); if (pins.length) { md.push('\n## 고정된 기억'); for (const x of pins) md.push(`- (${KINDS[x.kind] || x.kind}${x.turn != null && !x.manual ? `, t${x.turn + 1}` : ''}) ${x.summary}`); }
  return md.join('\n');
}

// ════════ 사서 일지 ════════
const ACT_IC: Record<string, string> = { check: 'check', side: 'shuffle', recall: 'search', record: 'feather', summary: 'book', defer: 'glass', ledger: 'snow', update: 'edit', bundle: 'layers', error: 'warn' };
/** 사서 일지 — 저절로 일어난 일(회상 · 기록 · 요약 · 미룸 · 오류). 최신이 위, 60줄까지 */
export function ActivityRows() {
  const M = Memory(), rows = M.activity?.() || M.activityLog?.list?.() || [], clock = (at: number) => new Date(at).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  return rows.length ? <>{rows.slice(0, 60).map((r, i) => <div key={i} className={`mm-row mm-act a-${safe(r.kind)}`}><Ico name={ACT_IC[r.kind] || 'note'} size={14} /><span className="mm-row-text">{r.text}{r.count > 1 ? <small>{` ×${r.count}`}</small> : null}</span><small className="mm-act-at">{clock(r.at)}</small></div>)}</>
    : <None text="아직 기록이 없습니다. 회상·기록·요약처럼 저절로 일어난 일이 여기에 남습니다." />;
}

const DBtn = ({ label, ic, cls, title, onClick }: { label: string; ic: string; cls: string; title?: string; onClick: (e: MouseEvent<HTMLButtonElement>) => unknown }) => <Btn label={label} ic={ic} cls={cls} title={title} onClick={e => void onClick(e)} />;

export function Tools({ st }: { st: StOpen }) {
  const M = Memory(), { download, pickFiles } = core(), { fmtDays } = memMod();
  const { chat, mem, msgs } = st, cfg = M.cfg();
  // 사서 일지는 이 탭이 열려 있을 때만 알림을 받아 다시 그린다
  const [, bumpAct] = useReducer((x: number) => x + 1, 0);
  useEffect(() => core().on('memory:activity', core().debounce(bumpAct, 120)), []);
  const [cps, setCps] = useState<CheckpointInfo[] | null>(null), [prog, setProg] = useState(''), [cprog, setCprog] = useState('');
  const drawCps = () => M.checkpoints(chat.id).then(setCps, () => setCps([]));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { void drawCps(); }, [chat.id, mem]);
  const fromRef = useRef<HTMLInputElement>(null), toRef = useRef<HTMLInputElement>(null), hidRef = useRef<HTMLInputElement>(null);
  const pending = M.pending(mem, msgs).length, hiddenN = msgs.filter(m => m.hidden).length;
  const file = (name: string) => `${name}-${chatTitle(chat).replace(/[\\/:*?"<>|]/g, '_').slice(0, 40)}`;
  const restore = async (p: CheckpointInfo) => {
    if (M.busy()) return toast('기록이 끝난 뒤 복구해 주세요.', 'err');
    const data = await M.checkpointData(chat.id, p.id), turns = mem.turns.length; if (!data) return;
    if (!(await review(M.diff(mem, data), `${p.label} 복구`, '서고를 이 시점으로 되돌립니다. 이후 기록도 교체됩니다. 대화 원문은 변경하지 않으며, 현재 대화와 맞지 않는 기록은 동기화 과정에서 제외됩니다.'))) return;
    if (M.busy() || (M.get(chat.id) || mem) !== mem || mem.turns.length !== turns) return toast('검토 중 대화나 기록이 바뀌었습니다. 다시 검토해 주세요.', 'err');
    await M.checkpoint(mem, '복구 실행 전'); st.mem = await M.replace(chat.id, data); M.reconcile(st.mem, msgs); await M.save(st.mem); M.override(chat.id, null); st.draft = null; toast('서고를 복구했습니다. 복구 직전의 상태도 복구 지점에 남겼습니다.', 'ok'); st.draw();
  };
  const readFile = async (choose = false): Promise<ExportRead | null> => {
    const [f] = await pickFiles({ accept: '.json,application/json' }); if (!f) return null;
    try {
      let data = JSON.parse(await f.text()) as Obj;
      if (data?.type === 'dreamland-memoria-library' && Array.isArray(data.items)) {   // 서고 목록에서 한 번에 받은 묶음 백업
        const list = data.items as Obj[];
        let it: Obj | null | undefined = list.length === 1 ? list[0] : choose ? null : list.find(x => x.chatId === chat.id);
        if (!it && choose && list.length) { const d = await editBox('인계할 대화 고르기', { i: '0' }, [{ k: 'i', label: '이 묶음 백업에 든 대화', type: 'select', opts: list.map((x, i) => [String(i), String(x.chatName || x.chatId || `대화 ${i + 1}`)] as const) }], { okLabel: '고르기' }); if (!d) return null; it = list[+d.i]; }
        if (!it) throw new Error(`여러 대화를 묶은 백업 파일인데 이 대화의 기록이 들어 있지 않습니다 (${list.length}개 대화: ${list.slice(0, 4).map(x => x.chatName || x.chatId).join(', ')}${list.length > 4 ? ' …' : ''})`);
        data = it;
      }
      return M.readExport(data);
    } catch (e) { console.error('[장기기억] 가져오기 실패:', e); toast('가져오기 실패: ' + (e as Error).message, 'err'); return null; }
  };
  const fmt = (d: number) => d >= 1 ? fmtDays(d) : '1일 미만';
  return <div className="mm-view">
    <Sec title="사서 일지" desc="회상에 몇 초 걸렸는지, 무엇을 기록·요약했는지, 무엇을 미뤘는지, 오류가 났는지. 저절로 일어난 일은 알림 대신 여기에 남습니다. 답변이 늦다 싶으면 여기부터 보세요."
      tools={<Btn label="비우기" ic="trash" cls="ghost" onClick={() => { if (M.clearActivity) M.clearActivity(); else M.activityLog?.clear?.(); bumpAct(); }} />}>
      <div className="mm-rows mm-actlist"><ActivityRows /></div></Sec>
    <Sec title="과거 대화 색인" desc="아직 기록되지 않은 턴과 기록에 실패한 턴을 순서대로 기록합니다. 범위를 비우면 전체를 색인합니다.">
      <label className="check mm-inline" title="다른 기능이나 직접 숨겨 둔 메시지도 색인 대상에 포함합니다."><input ref={hidRef} type="checkbox" /><i /><span>숨겨진 메시지도 포함</span></label>
      <div className="row wrap"><div className="mm-range"><input ref={fromRef} className="inp" type="number" min={1} step={1} placeholder="시작 #" /><span>~</span><input ref={toRef} className="inp" type="number" min={1} step={1} placeholder="끝 #" /></div>
        <DBtn label="색인" ic="play" cls="primary" title="색인 시작" onClick={async () => { await backfill(chat, { from: +(fromRef.current?.value || 0) || 0, to: +(toRef.current?.value || 0) || Infinity, includeHidden: !!hidRef.current?.checked }); await st.reload(); }} />
        <span className="mm-progress">{pending ? `색인할 답변 ${pending}개` : '색인할 새 메시지가 없습니다'}</span></div></Sec>
    <Sec title="대화와 기록 맞추기" desc={<span>저장된 턴 기록을 현재 대화 메시지와 다시 대조합니다. 메시지를 지우거나 고친 뒤 기록이 꼬였을 때 쓰세요. <b>이미 지워진 기록은 복구하지 않습니다</b> — 복구가 필요하면 위 색인으로 해당 구간을 다시 기록하세요.</span>}>
      <div className="row"><DBtn label="맞추기" ic="link" cls="ghost" title="대화 메시지와 턴 기록을 다시 맞춥니다 (/memoria-reconcile)" onClick={async () => { const n = mem.turns.length, ch = M.reconcile(mem, msgs); if (ch) await M.save(mem); toast(ch ? `대화와 기록을 맞췄습니다. (기록 턴 ${n} → ${mem.turns.length})` : '이미 대화와 기록이 일치합니다.', ch ? 'ok' : ''); st.draw(); }} /></div></Sec>
    <Sec title="서사 시계 재계산" desc={`기록된 턴 다이제스트를 처음부터 이어 읽으며 이야기 속 경과 시간을 다시 추정합니다. 일괄 색인 뒤 날짜가 꼬였을 때 재색인 없이 바로잡을 수 있습니다. (일괄 색인이 끝나면 자동으로 한 번 실행됩니다) 지금 총 경과 ${(mem.clockDays || 0) >= 1 ? fmtDays(mem.clockDays) : '1일 미만'}.`}>
      <div className="row"><DBtn label="재계산" ic="refresh" cls="ghost" title="지금 재계산" onClick={e => busyBtn(e.currentTarget, async () => {
        if (M.busy()) setProg('턴 기록이 끝나길 기다리는 중…');
        const r = await M.recalClock(chat, mem, { onProgress: (d, t) => { setProg(`재계산 중… ${d}/${t}턴`); } }); if (!r) { setProg(''); return toast('재계산할 턴 기록이 없습니다.'); }
        toast(`서사 시계 재계산 완료 — 이야기 총 경과 ${fmt(r.after)} (${fmt(r.before)} → ${fmt(r.after)}${r.failed ? ` · 배치 ${r.failed}개 실패` : ''})`, 'ok'); st.draw();
      })} /><span className="mm-progress">{prog}</span></div></Sec>
    <Sec title="서고 정리" desc="중복 병합·소음 제거·중요도 변경을 먼저 비교하고 적용합니다. 고정·수동 기억과 서로 다른 비밀 등급·소유자는 병합하지 않습니다. 자동 정리는 검토 없이 실행되며, 변경 전 복구 지점을 남깁니다.">
      <div className="row wrap"><DBtn label="검토" ic="sparkle" cls="ghost" title="정리안을 만들어 비교한 뒤 적용합니다" onClick={e => busyBtn(e.currentTarget, async () => {
        if (M.busy()) return toast('진행 중인 작업이 끝난 뒤 정리해 주세요.');
        setCprog('정리안을 만드는 중…');
        try {
          const draft = M.snapshot(mem), turns0 = mem.turns.length; await M.consolidate(chat, draft); const ch = M.diff(mem, draft), c = (t: string) => ch.filter(x => x.type === t).length;
          if (!ch.length) return toast('정리할 것이 없습니다. (정리할 만큼 기억이 쌓이지 않았거나 — 최소 12개 — 사서가 고칠 곳을 찾지 못했습니다)');
          if (!(await review(ch, '서고 정리안'))) return toast('변경을 적용하지 않았습니다.');
          if (M.busy() || (M.get(chat.id) || mem) !== mem || mem.turns.length !== turns0) return toast('검토하는 동안 서고가 바뀌었습니다. 다시 검토해 주세요.', 'err');
          await M.checkpoint(mem, '서고 정리 전'); draft.consolidatedAt = draft.turns.length; st.mem = await M.replace(chat.id, draft); toast(`서고 정리 완료 — 병합·정리 ${c('removed')} · 변경 ${c('changed')}`, 'ok'); st.draw();
        } catch (e) { const err = e as Error; if (err.name === 'AbortError') throw err; console.error('[장기기억] 서고 정리 실패:', err); toast(`서고 정리에 실패했습니다. ${err.message || ''}`, 'err'); } finally { setCprog(''); }
      })} />
        <DBtn label="다시 묶기" ic="merge" cls="ghost" title="요약 묶음을 같은 사건끼리 다시 묶어 연대기로 병합합니다 (자동 서고 정리 때 하는 일)" onClick={e => busyBtn(e.currentTarget, async () => { await M.checkpoint(mem, '연대기 병합 전'); const n = await M.regroup(chat, mem); await M.save(mem); toast(n == null ? '묶을 만한 요약이 없습니다.' : `${n}개 그룹을 연대기로 병합했습니다.`, n ? 'ok' : ''); st.draw(); })} />
        <span className="mm-progress">{cprog}</span></div></Sec>
    <Sec title="서고 복구 지점" desc="기억 정리·사서 정정·요약 전체 다시 만들기·파일 복원·인계·초기화 직전의 기록을 보관합니다. 최근 3개, 합계 6MB까지 유지하며 대화 원문은 변경하지 않습니다. 오래 보관할 기록은 JSON으로 내보내세요."
      tools={<DBtn label="보관" ic="mark" cls="ghost" title="지금 상태 보관" onClick={async () => { if (M.busy()) return toast('기록이 끝난 뒤 저장해 주세요.', 'err'); const p = await M.checkpoint(mem, '직접 저장한 서고'); toast(p ? '복구 지점을 저장했습니다.' : '서고가 복구 지점 한도를 넘습니다. 아래 백업·복원에서 JSON으로 내보내 보관해 주세요.', p ? 'ok' : 'err'); await drawCps(); }} />}>
      <div className="mm-rows">{(cps || []).map(p => <div key={p.id} className="mm-row"><div className="mm-row-text"><b>{p.label}</b><small>{` ${new Date(p.at).toLocaleString('ko-KR')} · t${p.turn} · ${Math.ceil(p.bytes / 1024)} KB`}</small></div><DBtn label="검토·복구" ic="refresh" cls="ghost" onClick={() => restore(p)} /></div>)}
        {cps && !cps.length ? <p className="hint">아직 복구 지점이 없습니다. 정리·정정·복원 전 자동으로 만들어집니다.</p> : null}</div></Sec>
    <Sec title="다른 대화에서 이어가기 (인계)" desc="다른 대화에서 내보낸 파일을 불러와 요약·고정 기억·인물·관계선·캐논·서약을 이어받습니다. A→B→C처럼 계속 누적할 수 있습니다. 실리태번 Memoria 에서 내보낸 파일도 받습니다.">
      <div className="row"><DBtn label="인계" ic="users" cls="ghost" title="인계 파일 가져오기" onClick={async () => {
        if (M.busy()) return toast('기록이 끝난 뒤 같은 대화에서 다시 가져와 주세요.', 'err'); const r = await readFile(true); if (!r) return; const draft = M.snapshot(mem); M.carry(draft, r.store, r.label);
        if (!(await review(M.diff(mem, draft), `「${r.label}」에서 인계`))) return; await M.checkpoint(mem, '다른 대화 인계 전'); const n = M.carry(mem, r.store, r.label); await M.save(mem);
        toast(`인계 완료 — 요약 ${n.summaries} · 기억 ${n.memories} · 인물 ${n.cast} · 캐논 ${n.canon} · 서약 ${n.pledges}${n.bonds ? ` · 관계선 ${n.bonds}` : ''}`, 'ok'); st.draw();
      }} /></div></Sec>
    <Sec title="스토리 바이블" desc="인물·관계선·캐논·서약·타임라인·요약을 한 편의 마크다운 문서로 정리해 내려받습니다. 캐릭터 카드 공유나 설정 정리에 쓰기 좋습니다.">
      <div className="row"><Btn label="내보내기" ic="book" cls="ghost" title="스토리 바이블 내보내기" onClick={() => { download(`${file('story-bible')}.md`, bible(chat, mem), 'text/markdown'); toast('스토리 바이블을 내보냈습니다.', 'ok'); }} /></div></Sec>
    <Sec title="백업 · 복원" desc="이 대화의 기억 전체를 JSON으로 내보내거나 복원합니다. 내보낸 파일은 인계에도 쓸 수 있습니다.">
      <div className="row wrap"><Btn label="내보내기" ic="import" cls="ghost" onClick={() => { download(`${file('memoria')}.json`, JSON.stringify(M.exportData(chat, mem), null, 2)); toast('기억을 내보냈습니다.', 'ok'); }} />
        <DBtn label="가져오기" ic="upload" cls="ghost" onClick={async () => {
          const r = await readFile(); if (!r) return; if (r.foreign) return toast('실리태번 Memoria 파일은 위의 「인계」로 가져와 주세요.', 'err');
          const data = M.normalize(r.store, chat.id), turns = mem.turns.length; if (!(await review(M.diff(mem, data), '파일로 서고 복원', '현재 서고 전체를 파일의 기록으로 교체합니다. 현재 대화와 맞지 않는 턴 기록은 제외됩니다.'))) return;
          if (M.busy() || (M.get(chat.id) || mem) !== mem || mem.turns.length !== turns) return toast('대화나 서고가 바뀌었거나 기록 중입니다. 작업이 끝난 뒤 다시 가져와 주세요.', 'err');
          await M.checkpoint(mem, '파일 복원 전'); st.mem = await M.replace(chat.id, data); M.reconcile(st.mem, msgs); await M.save(st.mem); M.override(chat.id, null); st.draft = null; toast('기억을 복원했습니다.', 'ok'); st.draw();
        }} />
        <DBtn label={`숨김 해제${hiddenN ? ` (${hiddenN})` : ''}`} ic="eye" cls="ghost" title="숨긴 메시지 모두 표시" onClick={async () => { if (!hiddenN) return toast('숨긴 메시지가 없습니다.'); if (!(await confirmBox(`숨겨 둔 메시지 ${hiddenN}개를 모두 다시 표시할까요?`, '표시'))) return; for (const m of msgs) { m.hidden = false; delete m.memHidden; } await persistMsgs(chat, msgs); toast('숨긴 메시지를 모두 표시했습니다.', 'ok'); st.draw(); }} />
        {cfg.autoHide ? <DBtn label="자동 숨김" ic="eyeoff" cls="ghost" title="요약이 커버한 옛 메시지를 지금 숨깁니다 (설정의 「요약된 메시지 자동 숨김」)" onClick={async () => { const n = M.autoHide(chat, msgs); if (n) await persistMsgs(chat, msgs); toast(n ? `요약이 커버한 옛 메시지 ${n}개를 숨겼습니다.` : '숨길 메시지가 없습니다.'); st.draw(); }} /> : null}
        <DBtn label="초기화" ic="trash" cls="danger" title="이 대화 기억 초기화" onClick={async () => {
          if (M.busy()) return toast('진행 중인 기록이 끝난 뒤 초기화해 주세요.', 'err');
          if (!(await confirmList('이 대화의 모든 기억을 비웁니다. 계속할까요?', ['기억·인물·관계선·캐논·상태·서약·요약을 모두 비웁니다.', '장기기억이 숨겨 둔 메시지는 모두 표시로 되돌립니다 (재색인 가능하도록).', '초기화 직전의 서고는 복구 지점에 보관합니다.'], '전부 비우기', true))) return;
          await M.checkpoint(mem, '서고 초기화 전'); st.mem = await M.reset(chat.id); st.draft = null; st.log = []; let shown = 0; for (const x of msgs) if (x.memHidden) { x.hidden = false; delete x.memHidden; shown++; } if (shown) await persistMsgs(chat, msgs);
          toast('이 대화의 기억을 초기화했습니다. 도구 탭에서 복구하거나 다시 색인할 수 있습니다.', 'ok'); st.draw();
        }} /></div></Sec>
    <p className="mm-note"><b>명령어</b>{' — '}{COMMANDS.map(([c, d], i) => <Fragment key={c}>{i ? ' · ' : null}<code>{c}</code>{' ' + d}</Fragment>)}<br /><b>매크로</b>{' — '}<code>{'{{memoria_story}}'}</code> 지금까지의 이야기 · <code>{'{{memoria_count}}'}</code> 기억 수<br />
      <b>기억이 비어 보일 때</b> — 자동 숨김 여부와 위의 「숨김 해제」를 확인하세요. 이미 지워진 기록은 색인으로 해당 구간을 다시 기록해야 합니다.</p>
  </div>;
}
