// 장기기억 — 이야기 탭: 지금 · 맥박 · 흐름 / 연표 / 관계 / 표 · 전환점 · 턴별 기록 (옛 memoria-views.js 의 vStory)
import { useLayoutEffect, useRef, useState, type KeyboardEvent, type MouseEvent, type ReactNode } from 'react';
import { createPortal, flushSync } from 'react-dom';
import { Btn, Icon } from '../../kit';
import { confirmBox, promptBox, toast } from '../../ui';
import { THREAD_KINDS } from '../craft';
import { buildTimelineRows, filterTimelineRows, layoutTimelineGraph, timelineCsv, timelineMarkdown, type TimelineRow } from '../scene';
import { bondCardsHtml, bondMapSvg, flowHtml, heroHtml, pulseSvg, railHtml, statusListHtml, tableHtml } from '../story';
import type { Milestone, Summary, Turn } from '../types';
import { Del, Ib, None, Sec, busyBtn, confirmList, editBox, pct, useBump, type StOpen } from './parts';
import { MANUAL_MAX, Mx, bondViewRows, cut, cutLines, koDuration, noMap, onJump, sceneSlot, storeOf, storyState } from './viewsShared';
import * as memMod from '../../lib/memory';
import * as core from '../../lib/core';
import { t } from '../../i18n';

const JumpBtn = ({ n }: { n: number }) => <button className="mm-st-jump" type="button" data-mes={n}>{`#${n}`}</button>;
interface Slot { el: Element; s: Summary; chunk: boolean }

export function Story({ st }: { st: StOpen }) {
  const { fmtDays } = memMod, { uid, download } = core, M = Mx();
  const v = storyState(st), mem = st.mem, chat = st.chat, cfg = M.cfg(), T = mem.turns.length;
  // 보기만 다시 그린다 — 검색칸은 그대로 남아 한글 조합이 끊기지 않는다
  const drawView = useBump();
  const no = noMap(st), barNo = (x?: { msgId?: string; mesId?: number }) => x?.msgId != null ? (no.get(x.msgId) ?? -1) : Number.isInteger(x?.mesId) ? x!.mesId! + 1 : -1;
  const viewRef = useRef<HTMLDivElement>(null), pulseRef = useRef<HTMLDivElement>(null);

  // ── 지금
  const sc = M.scene(mem), bar = M.latestStatus?.(st.msgs) || null, days = mem.turns.reduce((a, t) => a + (t.days || 0), 0);
  const openThreads = mem.pledges.filter(p => p.status === 'active' && THREAD_KINDS.includes(p.kind)).length;
  const hero = heroHtml({ place: bar?.place || sc.location || '', when: bar?.when || [sc.date, sc.time].filter(Boolean).join(' '), present: String(sc.present ?? sceneSlot(mem, 'present') ?? '').split(/[,，、]/).map(x => x.trim()).filter(Boolean),
    tiles: [{ value: T, label: t('memoria.story.tile.turns') }, { value: days >= 1 / 24 ? koDuration(days) : '—', label: t('memoria.story.tile.inStory') }, { value: mem.chunks.length + mem.arcs.length, label: t('memoria.story.tile.summaries') }, { value: openThreads, label: t('memoria.story.tile.threads') }] });

  // ── 맥박: 막대를 누르면 그 턴의 기록을 보여준다
  const spans = [...mem.arcs.filter(s => !s.carried).map(s => ({ fromTurn: s.from + 1, toTurn: s.to + 1, level: 'arc' })), ...mem.chunks.map(s => ({ fromTurn: s.from + 1, toTurn: s.to + 1, level: 'chunk' }))];
  const [note, setNote] = useState<ReactNode>(null);
  const pickBar = (e: MouseEvent<HTMLDivElement>) => {
    const g = (e.target as Element).closest?.<HTMLElement>('.mm-st-pulse-bar'); if (!g) return; const i = +(g.dataset.turn || 0) - 1, tr = mem.turns[i]; if (!tr) return;
    pulseRef.current?.querySelector('.is-picked')?.classList.remove('is-picked'); g.classList.add('is-picked'); const n = no.get(tr.msgId) ?? -1;
    setNote(<>{n >= 0 ? <JumpBtn n={n} /> : <b>{`t${i + 1}`}</b>} {[tr.when, tr.where].filter(Boolean).join(' · ')}<span>{tr.failed && !tr.digest ? t('memoria.story.recordFailed') + (tr.error ? ' — ' + tr.error : '') : tr.digest || t('memoria.story.noRecord')}</span></>);
  };
  const pulse = T > 1 ? <div className="mm-st-pulse-wrap" ref={pulseRef} title={t('memoria.story.pulseTitle')} dangerouslySetInnerHTML={{ __html: pulseSvg(storeOf(st, no).turns || [], { spans, marks: mem.milestones.map(m => (m.turn ?? -1) + 1) }) }} onClick={pickBar} /> : null;

  // ── 보기 고르기 · 지금 요약 · 전체 다시 만들기
  const say = (s: string) => { v.prog = s; if (v.progEl) v.progEl.textContent = s; };
  const left = T - (mem.chunked || 0);
  const summarize = (e: MouseEvent<HTMLButtonElement>) => busyBtn(e.currentTarget, async () => {
    if (left <= 0) return toast(t('memoria.story.noNewTurns')); toast(t('memoria.story.summarizing'));
    const made = await M.summarize(chat, mem, { flush: true }); await M.save(mem); st.draw();
    toast(made ? t('memoria.story.made', { n: made }) : t('memoria.story.nothingToSummarize'), made ? 'ok' : '');
  });
  const rebuild = async () => {
    if (v.busy) { v.busy.stop = true; return say(t('memoria.story.stopping')); }
    if (!mem.turns.some(x => x.digest)) return toast(t('memoria.story.noDigests'), 'err');
    const calls = Math.ceil(T / Math.max(3, +cfg.chunkTurns || 8));
    if (!(await confirmList(t('memoria.story.rebuildConfirm', { n: T }), [t('memoria.story.rebuildCalls', { n: calls }), t('memoria.story.rebuildRevert'), t('memoria.story.rebuildCarried')], t('memoria.story.rebuildOk')))) return;
    const job = v.busy = { stop: false }; drawView(); say(t('memoria.story.preparing'));
    try {
      const made = await M.rebuildSummaries(chat, mem, { stop: () => job.stop, onProgress: (d, n) => say(t('memoria.story.progress', { done: d, total: n })) });
      if (made == null) toast(t('memoria.story.stopped')); else toast(t('memoria.story.rebuilt', { chunks: made, arcs: mem.arcs.filter(a => !a.carried).length }), 'ok');
    } catch (e) { const err = e as Error; console.error(e); if (err.name !== 'AbortError') toast(t('memoria.story.rebuildFail', { error: err.message || '' }), 'err'); }
    finally { v.busy = null; say(''); st.draw(); }
  };
  const setTab = (id: string) => { v.tab = id; drawView(); };

  // ── 고른 보기
  const editSum = async (s: Summary) => { const txt = await promptBox(t('memoria.story.editSummary'), s.text, { area: true }); if (!txt || !txt.trim()) return; s.text = cutLines(txt, 4000); delete s.av; delete s.avec; await M.save(mem); st.draw(); };   // 본문이 바뀌었으니 임베딩은 다음 회상 때 다시 계산
  const delSum = async (s: Summary) => { if (!(await confirmBox(t('memoria.story.deleteSummary'), t('common.delete'), true))) return; mem.chunks = mem.chunks.filter(x => x.id !== s.id); mem.arcs = mem.arcs.filter(x => x.id !== s.id); await M.save(mem); st.draw(); };
  const regen = (s: Summary, b: HTMLButtonElement) => busyBtn(b, async () => {
    if (!mem.turns.slice(s.from, s.to + 1).some(x => x.digest)) return toast(t('memoria.story.regenNoDigest'), 'err');
    let txt = ''; try { txt = await M.chunkText(chat, mem, s.from, s.to, undefined, true); } catch (e) { console.error(e); }
    if (!txt) return toast(t('memoria.story.regenFail'), 'err');
    s.text = txt; delete s.av; delete s.avec; await M.save(mem); st.draw(); toast(t('memoria.story.regenDone'), 'ok');
  });
  const copyMd = async (rows: TimelineRow[]) => { try { await navigator.clipboard.writeText(timelineMarkdown(rows)); toast(t('memoria.story.mdCopied'), 'ok'); } catch { toast(t('memoria.story.copyFail'), 'err'); } };
  const shownRows = () => filterTimelineRows(buildTimelineRows(storeOf(st, no)), v);
  const tools = () => <div className="mm-st-tools" key="tools">
    <input className="inp mm-st-query" type="search" placeholder={t('memoria.story.queryPh')} defaultValue={v.query} onChange={e => { v.query = e.target.value; drawView(); }} />
    <select className="inp auto mm-st-min" title={t('memoria.story.importance')} value={v.minStars} onChange={e => { v.minStars = +e.target.value || 0; drawView(); }}>{[0, 3, 4, 5].map(n => <option key={n} value={n}>{n ? `★${n}+` : t('memoria.story.all')}</option>)}</select>
    {v.tab === 'line' ? <span className="mm-st-seg">{([['people', t('memoria.story.by.people')], ['place', t('memoria.story.by.place')]] as const).map(([by, label]) => <button key={by} type="button" className={v.by === by ? 'on' : undefined} onClick={() => { v.by = by; drawView(); }}>{label}</button>)}</span>
      : <><button className="btn ghost mm-st-export" type="button" title={t('memoria.story.copyMd')} onClick={() => void copyMd(shownRows())}>MD</button><button className="btn ghost mm-st-export" type="button" title={t('memoria.story.saveCsv')} onClick={() => download('memoria-timeline.csv', timelineCsv(shownRows()), 'text/csv')}>CSV</button></>}</div>;
  const html = (cls: string | undefined, s: string, key: string) => <div key={key} className={cls} dangerouslySetInnerHTML={{ __html: s }} />;
  const rows = v.tab === 'line' || v.tab === 'table' ? buildTimelineRows(storeOf(st, no)) : [];
  let kids: ReactNode, flow = '';
  if (v.tab === 'flow') {
    const all = [...mem.arcs.map(s => ({ ...s, level: 'arc' })), ...mem.chunks.map(s => ({ ...s, level: 'chunk' }))].sort((a, b) => (a.carried ? -1 : 0) - (b.carried ? -1 : 0) || a.from - b.from);
    const marksIn = (s: Summary) => (s.carried ? [] : mem.milestones.filter(m => (m.turn as number) >= s.from && (m.turn as number) <= s.to));
    if (all.length) flow = flowHtml(all.map((s, i) => ({ id: s.id, level: s.level, fromTurn: s.from + 1, toTurn: s.to + 1, text: s.text, carried: s.carried, carriedFrom: s.carriedFrom, marks: marksIn(s), open: i >= all.length - 2 })));
    kids = all.length ? html(undefined, flow, 'flow') : <None text={t('memoria.story.emptyFlow')} />;
  } else if (v.tab === 'line') {
    const shown = new Set(filterTimelineRows(rows, v).map(r => r.id)), dim = new Set(rows.filter(r => !shown.has(r.id)).map(r => r.id));
    kids = rows.length ? [tools(), html('mm-st-results', railHtml(layoutTimelineGraph(rows, { by: v.by, maxLanes: 4 }), { dim, open: v.open }), 'res')] : <None text={t('memoria.story.emptyLine')} />;
  } else if (v.tab === 'bonds') {
    const bs = bondViewRows(mem), svg = bondMapSvg(bs, { picked: v.bond, focus: v.focus });
    kids = bs.length ? [svg ? html('mm-bond-mapwrap', svg, 'map') : null, html(undefined, bondCardsHtml(bs, { picked: v.bond, focus: v.focus }), 'cards')] : <None text={t('memoria.story.emptyBonds')} />;
  } else {
    const history = (M.statusHistory?.(st.msgs) || []).map(x => ({ mesId: barNo(x), when: x.when, place: x.place, weather: x.weather }));
    kids = [tools(), html('mm-st-results', `${tableHtml(filterTimelineRows(rows, v), v)}${history.length ? `<details class="mm-details"><summary>${t('memoria.story.statusLog', { n: history.length })}</summary>${statusListHtml(history)}</details>` : ''}`, 'res')];
  }
  // 흐름 카드 머리의 버튼 자리 — 눌러도 카드가 접히지 않게
  const [slots, setSlots] = useState<Slot[]>([]);
  useLayoutEffect(() => {
    const list: Slot[] = [];
    if (flow) viewRef.current?.querySelectorAll<HTMLElement>('.mm-st-card').forEach(card => {
      const s = mem.chunks.find(x => x.id === card.dataset.id) || mem.arcs.find(x => x.id === card.dataset.id), el = card.querySelector('[data-slot="acts"]'); if (!s || !el) return;
      el.addEventListener('click', e => e.preventDefault()); list.push({ el, s, chunk: card.dataset.level === 'chunk' });
    });
    setSlots(list);
  }, [flow]);   // eslint-disable-line react-hooks/exhaustive-deps
  const onView = (e: MouseEvent<HTMLDivElement>) => {
    const t = e.target as HTMLElement, box = viewRef.current; if (!t.closest || !box || t.closest('.mm-st-jump')) return;
    const stop = t.closest<HTMLElement>('.mm-st-stop'); if (stop) { const id = stop.dataset.id || ''; v.open = v.open === id ? '' : id; box.querySelector('.mm-st-stop.is-open')?.classList.remove('is-open'); if (v.open) stop.classList.add('is-open'); return; }
    const th = t.closest<HTMLElement>('th.is-sortable'); if (th) { const k = th.dataset.sort || ''; v.desc = v.sort === k ? !v.desc : false; v.sort = k; return drawView(); }
    const td = t.closest('td.mm-st-text'); if (td) return void td.classList.toggle('is-open');
    const edge = t.closest<HTMLElement>('.mm-bond-edge'); if (edge) { v.bond = edge.dataset.id || ''; flushSync(drawView); return void box.querySelector('.mm-bond-card.is-picked')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); }
    const who = t.closest<HTMLElement>('.mm-bond-person'); if (who) { const n = who.dataset.name || ''; v.focus = v.focus === n ? '' : n; drawView(); }
  };
  const onViewKey = (e: KeyboardEvent<HTMLDivElement>) => { if (e.key !== 'Enter' && e.key !== ' ') return; const el = (e.target as Element).closest?.('.mm-st-stop, .mm-bond-edge, .mm-bond-person'); if (el && el === e.target) { e.preventDefault(); el.dispatchEvent(new MouseEvent('click', { bubbles: true })); } };

  // 검색칸에 글을 쓰는 중에 화면이 통째로 새로 만들어지면 커서를 그 자리에 되돌린다
  useLayoutEffect(() => {
    const box = viewRef.current, q = box?.querySelector<HTMLInputElement>('.mm-st-query');
    if (v.caret && q) { q.focus(); try { q.setSelectionRange(v.caret[0], v.caret[1]); } catch { /* 검색칸이 자리를 못 잡는 브라우저 */ } }
    v.caret = null;
    return () => { const cur = box?.querySelector<HTMLInputElement>('.mm-st-query'); v.caret = cur && cur === document.activeElement ? [cur.selectionStart, cur.selectionEnd] : null; if (v.caret) setTimeout(() => { v.caret = null; }, 500); };
  }, []);   // eslint-disable-line react-hooks/exhaustive-deps

  // ── 전환점
  const miles = [...mem.milestones].sort((a, b) => (a.turn || 0) - (b.turn || 0));
  const editMile = async (e?: Milestone) => { const d = await editBox<Partial<Milestone>>(e ? t('memoria.story.editEvent') : t('memoria.story.addEvent'), e || { title: '', summary: '', participants: [], grade: 'major' }, [{ k: 'title', label: t('memoria.story.f.title'), half: true }, { k: 'grade', label: t('memoria.story.f.grade'), type: 'select', opts: [['major', t('memoria.story.major')], ['minor', t('memoria.story.minor')]], half: true }, { k: 'summary', label: t('memoria.story.f.summary') }, { k: 'participants', label: t('memoria.story.f.participants'), type: 'tags' }]); if (!d?.title?.trim()) return; if (e) Object.assign(e, d); else mem.milestones.push({ id: uid(), ...d, manual: true, turn: T } as Milestone); await M.save(mem); st.draw(); };
  const mileSec = <Sec title={t('memoria.story.milesTitle')} desc="" tools={<Btn label={t('common.add')} ic="plus" cls="ghost" title={t('memoria.story.addEvent')} onClick={() => void editMile()} />}>
    <div className="mm-miles">{miles.map(e => <div key={e.id} className={`mm-mile ${e.grade === 'minor' ? 'minor' : 'major'}`}><span className="mm-node" /><div><em className={`mm-tag${e.grade === 'minor' ? '' : ' on'}`}>{e.grade === 'minor' ? t('memoria.story.minor') : t('memoria.story.major')}</em> <b>{e.title}</b>{e.summary ? <p>{e.summary}</p> : null}<small>{[e.turn != null && `t${e.turn + 1}`, ...(e.participants || [])].filter(Boolean).join(' · ')}</small></div><span className="mm-actions"><Ib name="edit" title={t('common.edit')} onClick={() => editMile(e)} /><Del st={st} arr="milestones" x={e} what={t('memoria.story.thisEvent')} /></span></div>)}
      {!miles.length ? <None text={cfg.milestones ? t('memoria.story.emptyMiles') : t('memoria.story.emptyMilesOff')} /> : null}</div>
  </Sec>;

  // ── 턴별 기록
  const turns = mem.turns.map((tr, i) => ({ tr, i })).reverse().slice(0, 120);
  const editTurn = async (tr: Turn, i: number) => { const d = await editBox(t('memoria.story.editTurn', { n: i + 1 }), { digest: tr.digest || '', days: +(tr.days || 0).toFixed(3) }, [{ k: 'digest', label: t('memoria.story.f.digest'), type: 'area', rows: 4 }, { k: 'days', label: t('memoria.story.f.days'), type: 'num', step: 0.25, min: 0 }]); if (!d) return; tr.digest = cut(d.digest, MANUAL_MAX); tr.days = Math.max(0, +d.days || 0); if (tr.digest) { tr.failed = false; tr.error = ''; } mem.clockDays = mem.turns.reduce((a, x) => a + (x.days || 0), 0); await M.save(mem); st.draw(); };
  const recommit = (tr: Turn) => (e: MouseEvent<HTMLButtonElement>) => busyBtn(e.currentTarget, async () => { const m = st.msgs.find(x => x.id === tr.msgId); if (m) await M.commit(chat, st.msgs, m, { force: true }); st.draw(); });
  const digestSec = <section className="mm-sec"><details className="mm-details" open={!!v.digests} onToggle={e => { v.digests = e.currentTarget.open; }}><summary>{t('memoria.story.digestsTitle')}</summary><p className="hint">{t('memoria.story.digestsHint')}</p>
    <div className="mm-turns">{turns.map(({ tr, i }) => { const n = no.get(tr.msgId) ?? -1;
      return <div key={i} className={`mm-tline${tr.failed ? ' bad' : ''}${i < (mem.chunked || 0) ? ' folded' : ''}`}><span className="mm-node" /><b>{`t${i + 1}`}</b><div className="mm-tline-main">{tr.failed ? <span className="err">{t('memoria.story.failed') + (tr.error ? ' — ' + tr.error : '')}</span> : tr.digest || <span className="dim">{t('memoria.story.noRecord')}</span>}<small>{n >= 0 ? <JumpBtn n={n} /> : null}{[[tr.when, tr.where].filter(Boolean).join(' · '), (tr.days || 0) > 0 && `+${fmtDays(tr.days || 0)}`, tr.weight != null && t('memoria.story.weight', { pct: pct(tr.weight) })].filter(Boolean).join(' · ')}</small></div>
        <span className="mm-actions">{tr.failed ? <Ib name="refresh" title={t('memoria.story.recommit')} onClick={recommit(tr)} /> : null}<Ib name="edit" title={t('common.edit')} onClick={() => editTurn(tr, i)} /></span></div>; })}
      {!turns.length ? <None text={t('memoria.story.emptyTurns')} /> : null}</div>{T > 120 ? <small className="hint">{t('memoria.story.only120', { n: T })}</small> : null}</details></section>;

  return <div className="mm-view" data-chat={chat.id} onClick={onJump(st)}>
    <section className="mm-sec mm-st"><div dangerouslySetInnerHTML={{ __html: hero }} />{pulse}<div className="mm-st-pulse-note">{note}</div>
      <div className="mm-st-bar"><div className="mm-st-views" role="tablist">{([['flow', t('memoria.story.v.flow')], ['line', t('memoria.story.v.line')], ['bonds', t('memoria.story.v.bonds')], ['table', t('memoria.story.v.table')]] as const).map(([id, label]) => <button key={id} type="button" role="tab" data-view={id} className={v.tab === id ? 'on' : undefined} onClick={() => setTab(id)}>{label}</button>)}</div>
        <button className="btn ghost mm-st-tool" type="button" title={t('memoria.story.sumNowTitle', { n: left })} aria-label={t('memoria.story.sumNow')} onClick={e => void summarize(e)}><Icon name="sparkle" size={16} /></button>
        <button className="btn ghost mm-st-tool" type="button" title={t('memoria.story.rebuildTitle')} aria-label={t('memoria.story.rebuildAll')} onClick={() => void rebuild()}><Icon name="refresh" size={16} /><span>{v.busy ? t('memoria.story.stop') : ''}</span></button></div>
      <span className="mm-progress" ref={el => { if (el) { v.progEl = el; el.textContent = v.prog || ''; } }} />
      <div className="mm-st-view" ref={viewRef} data-view={v.tab} onClick={onView} onKeyDown={onViewKey}>{kids}
        {slots.map(x => createPortal(<>{!x.s.carried && x.chunk ? <Ib name="refresh" title={t('memoria.story.rebuildOk')} onClick={e => regen(x.s, e.currentTarget)} /> : null}<Ib name="edit" title={t('common.edit')} onClick={() => editSum(x.s)} /><Ib name="trash" title={t('common.delete')} onClick={() => delSum(x.s)} cls="del" /></>, x.el, x.s.id))}</div>
    </section>{mileSec}{digestSec}</div>;
}
