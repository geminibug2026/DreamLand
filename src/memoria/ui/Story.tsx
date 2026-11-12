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
    tiles: [{ value: T, label: '턴' }, { value: days >= 1 / 24 ? koDuration(days) : '—', label: '이야기 속' }, { value: mem.chunks.length + mem.arcs.length, label: '요약' }, { value: openThreads, label: '열린 떡밥' }] });

  // ── 맥박: 막대를 누르면 그 턴의 기록을 보여준다
  const spans = [...mem.arcs.filter(s => !s.carried).map(s => ({ fromTurn: s.from + 1, toTurn: s.to + 1, level: 'arc' })), ...mem.chunks.map(s => ({ fromTurn: s.from + 1, toTurn: s.to + 1, level: 'chunk' }))];
  const [note, setNote] = useState<ReactNode>(null);
  const pickBar = (e: MouseEvent<HTMLDivElement>) => {
    const g = (e.target as Element).closest?.<HTMLElement>('.mm-st-pulse-bar'); if (!g) return; const i = +(g.dataset.turn || 0) - 1, t = mem.turns[i]; if (!t) return;
    pulseRef.current?.querySelector('.is-picked')?.classList.remove('is-picked'); g.classList.add('is-picked'); const n = no.get(t.msgId) ?? -1;
    setNote(<>{n >= 0 ? <JumpBtn n={n} /> : <b>{`t${i + 1}`}</b>} {[t.when, t.where].filter(Boolean).join(' · ')}<span>{t.failed && !t.digest ? `기록 실패${t.error ? ' — ' + t.error : ''}` : t.digest || '(기록 없음)'}</span></>);
  };
  const pulse = T > 1 ? <div className="mm-st-pulse-wrap" ref={pulseRef} title="턴마다의 무게 — 높을수록 이야기가 크게 움직인 턴" dangerouslySetInnerHTML={{ __html: pulseSvg(storeOf(st, no).turns || [], { spans, marks: mem.milestones.map(m => (m.turn ?? -1) + 1) }) }} onClick={pickBar} /> : null;

  // ── 보기 고르기 · 지금 요약 · 전체 다시 만들기
  const say = (t: string) => { v.prog = t; if (v.progEl) v.progEl.textContent = t; };
  const left = T - (mem.chunked || 0);
  const summarize = (e: MouseEvent<HTMLButtonElement>) => busyBtn(e.currentTarget, async () => {
    if (left <= 0) return toast('요약할 새 턴이 없습니다.'); toast('요약을 생성합니다…');
    const made = await M.summarize(chat, mem, { flush: true }); await M.save(mem); st.draw();
    toast(made ? `요약 ${made}개를 만들었습니다.` : '새로 요약할 턴 기록이 없습니다. (기록이 비어 있는 구간은 건너뜁니다)', made ? 'ok' : '');
  });
  const rebuild = async () => {
    if (v.busy) { v.busy.stop = true; return say('중단하는 중… (진행 중인 요약 하나가 끝나면 원래대로 되돌립니다)'); }
    if (!mem.turns.some(t => t.digest)) return toast('턴 기록이 없어 요약을 만들 수 없습니다. 도구 탭에서 먼저 색인하세요.', 'err');
    const calls = Math.ceil(T / Math.max(3, +cfg.chunkTurns || 8));
    if (!(await confirmList(`이 채팅의 요약·연대기를 모두 지우고, 턴 기록(${T}턴)에서 처음부터 다시 만듭니다. 계속할까요?`, [`사서 호출 약 ${calls}번 (+ 연대기 정리 몇 번)`, '도중에 중단하거나 실패하면 원래 요약으로 되돌립니다', '다른 채팅에서 인계받은 연대기는 그대로 둡니다'], '다시 만들기'))) return;
    const job = v.busy = { stop: false }; drawView(); say('준비 중…');
    try {
      const made = await M.rebuildSummaries(chat, mem, { stop: () => job.stop, onProgress: (d, t) => say(`요약 ${d} / ${t}`) });
      if (made == null) toast('중단했습니다. 원래 요약으로 되돌렸습니다.'); else toast(`요약을 다시 만들었습니다 — 청크 ${made}개, 연대기 ${mem.arcs.filter(a => !a.carried).length}개`, 'ok');
    } catch (e) { const err = e as Error; console.error(e); if (err.name !== 'AbortError') toast(`요약 다시 만들기에 실패해 원래 요약으로 되돌렸습니다. ${err.message || ''}`, 'err'); }
    finally { v.busy = null; say(''); st.draw(); }
  };
  const setTab = (id: string) => { v.tab = id; drawView(); };

  // ── 고른 보기
  const editSum = async (s: Summary) => { const t = await promptBox('요약 수정', s.text, { area: true }); if (!t || !t.trim()) return; s.text = cutLines(t, 4000); delete s.av; delete s.avec; await M.save(mem); st.draw(); };   // 본문이 바뀌었으니 임베딩은 다음 회상 때 다시 계산
  const delSum = async (s: Summary) => { if (!(await confirmBox('이 요약을(를) 삭제할까요?', '삭제', true))) return; mem.chunks = mem.chunks.filter(x => x.id !== s.id); mem.arcs = mem.arcs.filter(x => x.id !== s.id); await M.save(mem); st.draw(); };
  const regen = (s: Summary, b: HTMLButtonElement) => busyBtn(b, async () => {
    if (!mem.turns.slice(s.from, s.to + 1).some(t => t.digest)) return toast('이 구간의 턴 기록이 남아 있지 않아 다시 생성할 수 없습니다.', 'err');
    let t = ''; try { t = await M.chunkText(chat, mem, s.from, s.to, undefined, true); } catch (e) { console.error(e); }
    if (!t) return toast('요약 재생성에 실패했습니다. (모델 응답 오류)', 'err');
    s.text = t; delete s.av; delete s.avec; await M.save(mem); st.draw(); toast('요약을 다시 생성했습니다.', 'ok');
  });
  const copyMd = async (rows: TimelineRow[]) => { try { await navigator.clipboard.writeText(timelineMarkdown(rows)); toast('마크다운 표를 복사했습니다.', 'ok'); } catch { toast('복사하지 못했습니다.', 'err'); } };
  const shownRows = () => filterTimelineRows(buildTimelineRows(storeOf(st, no)), v);
  const tools = () => <div className="mm-st-tools" key="tools">
    <input className="inp mm-st-query" type="search" placeholder="인물 · 장소 · 내용" defaultValue={v.query} onChange={e => { v.query = e.target.value; drawView(); }} />
    <select className="inp auto mm-st-min" title="중요도" value={v.minStars} onChange={e => { v.minStars = +e.target.value || 0; drawView(); }}>{[0, 3, 4, 5].map(n => <option key={n} value={n}>{n ? `★${n}+` : '전체'}</option>)}</select>
    {v.tab === 'line' ? <span className="mm-st-seg">{([['people', '인물'], ['place', '장소']] as const).map(([by, label]) => <button key={by} type="button" className={v.by === by ? 'on' : undefined} onClick={() => { v.by = by; drawView(); }}>{label}</button>)}</span>
      : <><button className="btn ghost mm-st-export" type="button" title="마크다운 표 복사" onClick={() => void copyMd(shownRows())}>MD</button><button className="btn ghost mm-st-export" type="button" title="CSV 저장" onClick={() => download('memoria-timeline.csv', timelineCsv(shownRows()), 'text/csv')}>CSV</button></>}</div>;
  const html = (cls: string | undefined, s: string, key: string) => <div key={key} className={cls} dangerouslySetInnerHTML={{ __html: s }} />;
  const rows = v.tab === 'line' || v.tab === 'table' ? buildTimelineRows(storeOf(st, no)) : [];
  let kids: ReactNode, flow = '';
  if (v.tab === 'flow') {
    const all = [...mem.arcs.map(s => ({ ...s, level: 'arc' })), ...mem.chunks.map(s => ({ ...s, level: 'chunk' }))].sort((a, b) => (a.carried ? -1 : 0) - (b.carried ? -1 : 0) || a.from - b.from);
    const marksIn = (s: Summary) => (s.carried ? [] : mem.milestones.filter(m => (m.turn as number) >= s.from && (m.turn as number) <= s.to));
    if (all.length) flow = flowHtml(all.map((s, i) => ({ id: s.id, level: s.level, fromTurn: s.from + 1, toTurn: s.to + 1, text: s.text, carried: s.carried, carriedFrom: s.carriedFrom, marks: marksIn(s), open: i >= all.length - 2 })));
    kids = all.length ? html(undefined, flow, 'flow') : <None text="아직 요약이 없습니다. 턴이 쌓이면 자동으로 만들어집니다." />;
  } else if (v.tab === 'line') {
    const shown = new Set(filterTimelineRows(rows, v).map(r => r.id)), dim = new Set(rows.filter(r => !shown.has(r.id)).map(r => r.id));
    kids = rows.length ? [tools(), html('mm-st-results', railHtml(layoutTimelineGraph(rows, { by: v.by, maxLanes: 4 }), { dim, open: v.open }), 'res')] : <None text="아직 그릴 사건이 없습니다. 턴이 기록되면 채워집니다." />;
  } else if (v.tab === 'bonds') {
    const bs = bondViewRows(mem), svg = bondMapSvg(bs, { picked: v.bond, focus: v.focus });
    kids = bs.length ? [svg ? html('mm-bond-mapwrap', svg, 'map') : null, html(undefined, bondCardsHtml(bs, { picked: v.bond, focus: v.focus }), 'cards')] : <None text="관계선이 아직 없습니다. 관계가 움직이는 장면이 나오면 그려집니다." />;
  } else {
    const history = (M.statusHistory?.(st.msgs) || []).map(x => ({ mesId: barNo(x), when: x.when, place: x.place, weather: x.weather }));
    kids = [tools(), html('mm-st-results', `${tableHtml(filterTimelineRows(rows, v), v)}${history.length ? `<details class="mm-details"><summary>상태창 기록 ${history.length}</summary>${statusListHtml(history)}</details>` : ''}`, 'res')];
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
  const editMile = async (e?: Milestone) => { const d = await editBox<Partial<Milestone>>(e ? '사건 수정' : '사건 추가', e || { title: '', summary: '', participants: [], grade: 'major' }, [{ k: 'title', label: '제목', half: true }, { k: 'grade', label: '무게', type: 'select', opts: [['major', '전환점'], ['minor', '사건']], half: true }, { k: 'summary', label: '한 줄 요약' }, { k: 'participants', label: '함께한 인물', type: 'tags' }]); if (!d?.title?.trim()) return; if (e) Object.assign(e, d); else mem.milestones.push({ id: uid(), ...d, manual: true, turn: T } as Milestone); await M.save(mem); st.draw(); };
  const mileSec = <Sec title="전환점" desc="" tools={<Btn label="추가" ic="plus" cls="ghost" title="사건 추가" onClick={() => void editMile()} />}>
    <div className="mm-miles">{miles.map(e => <div key={e.id} className={`mm-mile ${e.grade === 'minor' ? 'minor' : 'major'}`}><span className="mm-node" /><div><em className={`mm-tag${e.grade === 'minor' ? '' : ' on'}`}>{e.grade === 'minor' ? '사건' : '전환점'}</em> <b>{e.title}</b>{e.summary ? <p>{e.summary}</p> : null}<small>{[e.turn != null && `t${e.turn + 1}`, ...(e.participants || [])].filter(Boolean).join(' · ')}</small></div><span className="mm-actions"><Ib name="edit" title="편집" onClick={() => editMile(e)} /><Del st={st} arr="milestones" x={e} what="이 사건" /></span></div>)}
      {!miles.length ? <None text={cfg.milestones ? '아직 기록된 사건이 없습니다. 이야기의 전환점이 생기면 자동 기록됩니다.' : '설정 탭에서 "이벤트 연표"를 켜면 결정적 전환점이 자동 기록됩니다.'} /> : null}</div>
  </Sec>;

  // ── 턴별 기록
  const turns = mem.turns.map((t, i) => ({ t, i })).reverse().slice(0, 120);
  const editTurn = async (t: Turn, i: number) => { const d = await editBox(`t${i + 1} — 턴 기록 수정 (이후 요약 생성에 반영됩니다)`, { digest: t.digest || '', days: +(t.days || 0).toFixed(3) }, [{ k: 'digest', label: '턴 기록', type: 'area', rows: 4 }, { k: 'days', label: '이 턴에서 흐른 이야기 속 시간 (일)', type: 'num', step: 0.25, min: 0 }]); if (!d) return; t.digest = cut(d.digest, MANUAL_MAX); t.days = Math.max(0, +d.days || 0); if (t.digest) { t.failed = false; t.error = ''; } mem.clockDays = mem.turns.reduce((a, x) => a + (x.days || 0), 0); await M.save(mem); st.draw(); };
  const recommit = (t: Turn) => (e: MouseEvent<HTMLButtonElement>) => busyBtn(e.currentTarget, async () => { const m = st.msgs.find(x => x.id === t.msgId); if (m) await M.commit(chat, st.msgs, m, { force: true }); st.draw(); });
  const digestSec = <section className="mm-sec"><details className="mm-details" open={!!v.digests} onToggle={e => { v.digests = e.currentTarget.open; }}><summary>턴별 기록</summary><p className="hint">요약은 이 기록을 엮어 만듭니다. 여기서 고치면 다음 요약부터 반영됩니다.</p>
    <div className="mm-turns">{turns.map(({ t, i }) => { const n = no.get(t.msgId) ?? -1;
      return <div key={i} className={`mm-tline${t.failed ? ' bad' : ''}${i < (mem.chunked || 0) ? ' folded' : ''}`}><span className="mm-node" /><b>{`t${i + 1}`}</b><div className="mm-tline-main">{t.failed ? <span className="err">{`⚠ 실패${t.error ? ' — ' + t.error : ''}`}</span> : t.digest || <span className="dim">(기록 없음)</span>}<small>{n >= 0 ? <JumpBtn n={n} /> : null}{[[t.when, t.where].filter(Boolean).join(' · '), (t.days || 0) > 0 && `+${fmtDays(t.days || 0)}`, t.weight != null && `무게 ${pct(t.weight)}`].filter(Boolean).join(' · ')}</small></div>
        <span className="mm-actions">{t.failed ? <Ib name="refresh" title="다시 기록" onClick={recommit(t)} /> : null}<Ib name="edit" title="편집" onClick={() => editTurn(t, i)} /></span></div>; })}
      {!turns.length ? <None text="아직 턴 기록이 없습니다." /> : null}</div>{T > 120 ? <small className="hint">{`최근 120턴만 보여 줍니다 (전체 ${T}턴)`}</small> : null}</details></section>;

  return <div className="mm-view" data-chat={chat.id} onClick={onJump(st)}>
    <section className="mm-sec mm-st"><div dangerouslySetInnerHTML={{ __html: hero }} />{pulse}<div className="mm-st-pulse-note">{note}</div>
      <div className="mm-st-bar"><div className="mm-st-views" role="tablist">{([['flow', '흐름'], ['line', '연표'], ['bonds', '관계'], ['table', '표']] as const).map(([id, label]) => <button key={id} type="button" role="tab" data-view={id} className={v.tab === id ? 'on' : undefined} onClick={() => setTab(id)}>{label}</button>)}</div>
        <button className="btn ghost mm-st-tool" type="button" title={`지금 요약 — 주기를 못 채운 자투리 턴까지 요약합니다 (아직 요약되지 않은 턴 ${left}개)`} aria-label="지금 요약" onClick={e => void summarize(e)}><Icon name="sparkle" size={16} /></button>
        <button className="btn ghost mm-st-tool" type="button" title="전체 다시 만들기 — 요약·연대기를 턴 기록에서 처음부터 다시 만듭니다. 중단·실패하면 원래 요약을 그대로 둡니다." aria-label="전체 다시 만들기" onClick={() => void rebuild()}><Icon name="refresh" size={16} /><span>{v.busy ? '중단' : ''}</span></button></div>
      <span className="mm-progress" ref={el => { if (el) { v.progEl = el; el.textContent = v.prog || ''; } }} />
      <div className="mm-st-view" ref={viewRef} data-view={v.tab} onClick={onView} onKeyDown={onViewKey}>{kids}
        {slots.map(x => createPortal(<>{!x.s.carried && x.chunk ? <Ib name="refresh" title="다시 만들기" onClick={e => regen(x.s, e.currentTarget)} /> : null}<Ib name="edit" title="편집" onClick={() => editSum(x.s)} /><Ib name="trash" title="삭제" onClick={() => delSum(x.s)} cls="del" /></>, x.el, x.s.id))}</div>
    </section>{mileSec}{digestSec}</div>;
}
