// 장기기억 — 인연 탭: 관계선 위에 얹은 갈래(세 개까지) · 한마디를 관계도와 인연 카드로 보고, 사람마다의 마음 · 전환점을 한 탭에.
// 인연 읽기와 전환점은 턴을 기록할 때 함께 받는다 (호출은 늘지 않는다). 「지난 기록 되짚기」만 따로 모델을 부른다 (요약 글만 읽는다)
import { useReducer, type ReactNode } from 'react';
import { Btn } from '../../kit';
import { confirmBox, toast } from '../../ui';
import { t, tn } from '../../i18n';
import { S } from '../../lib/core';
import { Memory } from '../../lib/memory';
import type { Bond, Pivot } from '../types';
import { hostOf, pivotsOf, retracePlan, retraceTies } from '../engine/ties';
import { GROUPS, HEARTFELT, WAYS, mainGroup, tieOf, type TieEdge, type TieRead } from '../ties';
import { None, Sec, ensureCfg, progressBox, saveCfg, type StOpen } from './parts';
import { Tr } from './ReaderView';
import { TieMap, tieMapView, type TieMapView } from './TieMap';
import { TypeChips, editTie, groupName, typeName } from './TiePick';
import { bondNow, jumpTo, noMap } from './viewsShared';

/** 이 탭의 보기 상태 (탭을 옮기거나 다시 그려도 남는다) */
interface YeonView { map: TieMapView; way: string; who: string; more: number; open: Record<string, boolean> }
const viewOf = (st: StOpen): YeonView => (st.yeon ||= { map: tieMapView(), way: '', who: '', more: 30, open: {} }) as YeonView;
const nameKey = (s: string) => String(s || '').toLowerCase().replace(/[\s._\-'"`]+/g, '');
function useCss() { if (typeof document !== 'undefined' && !document.querySelector('link[data-memoria-yeon]')) { const l = document.createElement('link'); l.rel = 'stylesheet'; l.href = new URL('css/f-memoria-yeon.css', document.baseURI).href; l.dataset.memoriaYeon = '1'; document.head.append(l); } }

const wayName = (w: string) => ((WAYS as readonly string[]).includes(w) ? t('memoria.ties.way.' + w) : w);

/** 전환점 갈래의 작은 그림 (16칸) */
const WAY_D: Record<string, string> = {
  closer: 'M2 8h4.5M4.5 5.5 7 8l-2.5 2.5M14 8H9.5M11.5 5.5 9 8l2.5 2.5', apart: 'M6.5 8H2M4.5 5.5 2 8l2.5 2.5M9.5 8H14M11.5 5.5 14 8l-2.5 2.5',
  flip: 'M3 5.5h9l-2.2-2.2M13 10.5H4l2.2 2.2', heart: 'M8 13.2S3 10.2 3 6.6A2.5 2.5 0 0 1 8 5.4a2.5 2.5 0 0 1 5 1.2c0 3.6-5 6.6-5 6.6z',
  lot: 'M3 13.5V7.2L8 3l5 4.2v6.3zM6.4 13.5V9.6h3.2v3.9', grow: 'M8 14V7.5M8 9.4C5.2 9.4 4 7.6 4 5.4c2.8 0 4 1.8 4 4zM8 8.2c0-2.6 1.4-4.2 4-4.2 0 2.6-1.4 4.2-4 4.2z',
};
const WayIco = ({ way }: { way: string }) => <svg className="mm-yn-wi" viewBox="0 0 16 16" width={14} height={14} aria-hidden="true"><path d={WAY_D[way] || WAY_D.heart} /></svg>;
const PenIco = () => <svg viewBox="0 0 24 24" width={15} height={15} aria-hidden="true"><path d="M4 20h4L19 9l-4-4L4 16zM13.5 6.5l4 4" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinejoin="round" /></svg>;
const BinIco = () => <svg viewBox="0 0 24 24" width={15} height={15} aria-hidden="true"><path d="M5 7h14M10 7V4h4v3M7 7l1 13h8l1-13" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinejoin="round" /></svg>;

export function Ties({ st }: { st: StOpen }) {
  useCss();
  const [, redraw] = useReducer((x: number) => x + 1, 0), M = Memory, mem = st.mem, chat = st.chat, v = viewOf(st), cfg = M.cfg(), no = noMap(st);
  const host = hostOf(M, chat, mem); let me = ''; try { me = S.persona(chat)?.name || ''; } catch { /* 페르소나가 없어도 된다 */ }
  const isHost = (n: string) => host.many && nameKey(n) === nameKey(host.label), shown = (n: string) => (/\{\{\s*user\s*\}\}/i.test(n) && me ? me : n);
  const bonds = (mem.bonds || []).filter(b => !b.disabled && bondNow(b) && !isHost(b.from) && !isHost(b.to));
  const pivots = pivotsOf(mem).filter(p => !isHost(p.who) && !(p.with && isHost(p.with))), plan = retracePlan(M, mem);

  // ── 관계도의 재료: 선 위에는 인연 한마디(없으면 대표 갈래, 그것도 없으면 관계선의 단계), 빛깔은 대표 갈래의 무리 — 두 방향은 따로 그려진다
  const edges: TieEdge[] = bonds.map(b => { const r = tieOf(b); return { id: b.id, from: shown(b.from), to: shown(b.to), label: r.word || (r.types?.[0] ? typeName(r.types[0]) : bondNow(b)!.stage), kind: mainGroup(r) }; });
  const focus = v.map.focus;
  const pick = (name: string) => { v.map.focus = v.map.focus === name ? '' : name; v.map.pick = ''; v.map.x = 0; v.map.y = 0; redraw(); };

  // ── 메시지 범위: 그 전환점이 적힌 기록이 덮는 메시지 (#시작~#끝) — 누르면 그 장면으로 간다
  const rangeOf = (p: Pivot): [number, number] | null => {
    const a = p.span ? p.span[0] : p.turn, b = p.span ? p.span[1] : p.turn, end = no.get(mem.turns[b]?.msgId || ''); if (!end) return null;
    const prev = a > 0 ? no.get(mem.turns[a - 1]?.msgId || '') : 0; return [Math.min(end, prev != null ? prev + 1 : end), end];
  };
  const dayOf = (p: Pivot) => { const d = mem.turns[p.turn]?.day; return d ? t('memoria.ties.day', { n: d }) : ''; };
  const Where = ({ p }: { p: Pivot }) => { const r = rangeOf(p), day = dayOf(p); return <span className="mm-yn-where">{day ? <span>{day}</span> : null}{r ? <button type="button" className="mm-st-jump fx-num" title={t('memoria.ties.jump')} onClick={() => jumpTo(st, r[0])}>{r[0] === r[1] ? `#${r[0]}` : `#${r[0]}~#${r[1]}`}</button> : <span className="fx-num">{`t${p.turn + 1}`}</span>}</span>; };
  const Change = ({ p }: { p: Pivot }) => <span className="mm-yn-change">{p.was ? <><s><Tr>{p.was}</Tr></s><i aria-hidden="true">→</i></> : null}<em><Tr>{p.now}</Tr></em></span>;

  // ── 지난 기록 되짚기 (모델 호출: 표시한 횟수까지 · 요약 글만 읽는다)
  const retrace = async () => {
    if (M.busy()) return toast(t('memoria.ties.retrace.busy'));
    if (!(await confirmBox(t('memoria.ties.retrace.ask', { rows: plan.rows, calls: plan.calls }), t('memoria.ties.retrace.btn')))) return;
    const pb = progressBox(t('memoria.ties.retrace.running'));
    try {
      const r = await M.enqueue(() => retraceTies(M, chat, mem, { signal: pb.signal, onProgress: (done, total) => pb.set(done, total, t('memoria.ties.retrace.progress')) }));
      await M.save(mem);
      toast(r.calls ? t('memoria.ties.retrace.done', { read: r.read, pivots: r.pivots }) + (r.left ? t('memoria.ties.retrace.left', { n: r.left }) : '') : t('memoria.ties.retrace.none'), 'ok');
    } catch (e) { if ((e as Error).name !== 'AbortError') { console.error(e); toast(t('memoria.ties.retrace.fail', { error: (e as Error).message || String(e) }), 'err'); } }
    finally { pb.close(); st.draw(); }
  };
  const retraceRow = plan.rows ? <div className="mm-yn-retrace"><div><b>{t('memoria.ties.retrace.title')}</b><p>{t('memoria.ties.retrace.note', { rows: plan.rows, calls: plan.calls })}</p></div>
    <Btn label={t('memoria.ties.retrace.btn')} ic="refresh" cls="ghost" title={t('memoria.ties.retrace.btnTitle')} onClick={() => void retrace()} /></div> : null;
  const stageNote = host.many ? <p className="mm-yn-hint">{t('memoria.ties.stage.note', { name: host.label })} <button type="button" className="mm-link" onClick={() => { st.tab = 'config'; st.draw(); }}>{t('memoria.ties.stage.go')}</button></p> : null;

  if (!bonds.length && !pivots.length) return <div className="mm-view mm-yn"><None text={t('memoria.ties.empty')} />{retraceRow}{stageNote}</div>;

  // ── 관계도와 인연 카드 (두 사람마다 한 장 — 양쪽에서 본 읽기를 함께). 관계도에서 사람을 고르면 그 사람의 카드만
  const pairs = new Map<string, { a: string; b: string; ab?: Bond; ba?: Bond }>();
  for (const bd of bonds) {
    const f = shown(bd.from), to = shown(bd.to), first = focus === to ? to : focus === f ? f : f < to ? f : to, k = [f, to].sort().join('\u0001');
    let x = pairs.get(k); if (!x) { x = { a: first, b: first === f ? to : f }; pairs.set(k, x); }
    if (f === x.a) x.ab = bd; else x.ba = bd;
  }
  const rank = (x: { ab?: Bond; ba?: Bond }) => { const g = mainGroup(tieOf(x.ab)) || mainGroup(tieOf(x.ba)), i = (GROUPS as string[]).indexOf(g); return i < 0 ? 99 : i; };   // 무리 차례 (애정 → 가족 → … → 그 밖 → 아직 읽지 않음)
  const cards = [...pairs.values()].filter(x => !focus || x.a === focus || x.b === focus).sort((x, y) => rank(x) - rank(y) || x.a.localeCompare(y.a) || x.b.localeCompare(y.b));
  const lastBetween = (a: string, b: string) => [...pivots].reverse().find(p => p.with && ((shown(p.who) === a && shown(p.with) === b) || (shown(p.who) === b && shown(p.with) === a)));
  const toPerson = (name: string) => { const ps = (st.people ||= { name: '', q: '', view: 'list', open: new Set<string>(), more: new Map<string, number>() }) as { name: string; view: string }; ps.name = M.canonName(mem, name); ps.view = 'list'; st.tab = 'people'; st.draw(); };
  const readRow = (b: Bond | undefined, from: string, to: string) => {
    if (!b) return null; const r: TieRead = tieOf(b);
    // 한 방향 = 두 줄: 위는 누가 → 누구에게(작게)와 고치기, 아래는 한마디와 갈래 칩을 한 줄에 이어서
    return <div className="mm-yn-read">
      <div className="top"><span className="dir"><b>{from}</b><i aria-hidden="true">→</i><b>{to}</b></span>
        <button type="button" className="mm-yn-btn ghost" title={t('memoria.ties.edit.btn')} aria-label={`${t('memoria.ties.edit.btn')} — ${from} → ${to}`} onClick={() => editTie(st, b)}><PenIco /></button></div>
      <div className="body">{r.word ? <em className="word"><Tr>{r.word}</Tr></em> : <em className="word none">{t('memoria.ties.unread')}</em>}
        {r.types?.length ? <TypeChips types={r.types} /> : <span className="mm-yn-tag">{t('memoria.ties.noType')}</span>}{b.tieHand ? <span className="mm-yn-tag">{t('memoria.ties.hand')}</span> : null}</div></div>;
  };
  const used = [...new Set(edges.map(e => e.kind))].sort((x, y) => (GROUPS as string[]).indexOf(x) - (GROUPS as string[]).indexOf(y));
  const nameBtn = (n: string) => <button type="button" className="mm-yn-who" title={focus === n ? t('memoria.ties.map.all') : t('memoria.ties.focus.only', { name: n })} onClick={() => pick(n)}><b>{n}</b></button>;
  const mapSec = <Sec title={t('memoria.ties.map.title')} desc={t('memoria.ties.map.desc')}>
    <TieMap edges={edges} v={v.map} redraw={redraw} />
    {used.length ? <div className="mm-ti-legend">{used.map(k => <span key={k || 'none'} className={`mm-tk-${k || 'none'}`}><i className="mm-ti-swatch" />{k ? groupName(k) : t('memoria.ties.noType')}</span>)}</div> : null}
    <div className="mm-yn-focus"><h4><span>{focus ? t('memoria.ties.focus.title', { name: focus }) : t('memoria.ties.focus.all')}</span><b className="fx-num">{cards.length}</b></h4>
      {focus ? <button type="button" className="mm-link" onClick={() => toPerson(focus)}>{t('memoria.ties.focus.person')}</button> : null}</div>
    {cards.length ? <div className="mm-yn-cards">{cards.map(x => {
      const last = lastBetween(x.a, x.b), stage = bondNow(x.ab || x.ba)?.stage || '', g = mainGroup(tieOf(x.ab)) || mainGroup(tieOf(x.ba));
      return <article key={`${x.a}\u0001${x.b}`} className={`mm-yn-card mm-tk-${g || 'none'}`}>
        <header>{nameBtn(x.a)}<i className="mm-yn-link" aria-hidden="true" />{nameBtn(x.b)}</header>
        {stage ? <p className="mm-yn-stage" title={t('memoria.ties.focus.stage')}><Tr>{stage}</Tr></p> : null}
        {readRow(x.ab, x.a, x.b)}{readRow(x.ba, x.b, x.a)}
        {last ? <footer><div className="meta"><span className="mm-yn-way" data-way={last.way}><WayIco way={last.way} />{wayName(last.way)}</span><Where p={last} /></div><Change p={last} /></footer> : null}
      </article>; })}</div> : <None text={t('memoria.ties.focus.none')} />}
  </Sec>;

  // ── 마음: 사람마다 지금 마음 한 줄과 지나온 마음의 점 띠, 누르면 까닭이 펼쳐진다
  const byWho = new Map<string, Pivot[]>();
  for (const p of pivots) if (HEARTFELT.has(p.way)) { const k = shown(p.who); if (!byWho.has(k)) byWho.set(k, []); byWho.get(k)!.push(p); }
  const hearts = [...byWho.entries()].map(([name, rows]) => ({ name, rows: [...rows].sort((a, b) => b.turn - a.turn) })).sort((a, b) => b.rows[0].turn - a.rows[0].turn);
  const heartSec = <Sec title={t('memoria.ties.heart.title')} desc={t('memoria.ties.heart.desc')}>
    {hearts.length ? <div className="mm-yn-hearts">{hearts.map(h => {
      const cur = h.rows[0], open = !!v.open[h.name], same = h.rows.filter(p => nameKey(p.with || '') === nameKey(cur.with || '')), trail = same.slice(0, 4).reverse(), id = `yn-h-${nameKey(h.name)}`;   // 지금 마음과 같은 상대를 향한 마음만 차례로
      return <div key={h.name} className={`mm-yn-heart${open ? ' open' : ''}`}>
        <button type="button" className="mm-yn-hrow" aria-expanded={open} aria-controls={id} onClick={() => { v.open[h.name] = !open; redraw(); }}>
          <b>{h.name}</b>
          <span className="trail" title={t('memoria.ties.heart.trail', { n: h.rows.length })}>{cur.with ? <i className="to">{t('memoria.ties.heart.toward', { name: shown(cur.with) })}</i> : null}{same.length > trail.length ? <i className="more">…</i> : null}{trail.map((p, i) => <span key={p.id} className={i === trail.length - 1 ? 'cur' : ''}>{i ? <i aria-hidden="true">→</i> : null}<Tr>{p.now}</Tr></span>)}</span>
          <span className="chev" aria-hidden="true" />
        </button>
        {open ? <ol id={id} className="mm-yn-why">{h.rows.map(p => <li key={p.id}><p><span className="mm-yn-way" data-way={p.way}><WayIco way={p.way} />{wayName(p.way)}</span>{p.with ? <i>{t('memoria.ties.heart.toward', { name: shown(p.with) })}</i> : null}<Change p={p} /></p>
          <small>{p.why ? <span><Tr>{p.why}</Tr></span> : null}<Where p={p} /></small></li>)}</ol> : null}
      </div>; })}</div> : <None text={t('memoria.ties.heart.empty')} />}
  </Sec>;

  // ── 전환점: 갈래 · 사람으로 거른 시간의 줄
  const people = [...new Set(pivots.flatMap(p => [shown(p.who), p.with ? shown(p.with) : '']).filter(Boolean))].sort((a, b) => a.localeCompare(b));
  if (v.who && !people.includes(v.who)) v.who = '';
  const rows = pivots.filter(p => (!v.who || shown(p.who) === v.who || (p.with && shown(p.with) === v.who)) && (!v.way || p.way === v.way)).sort((a, b) => b.turn - a.turn);
  const drop = async (p: Pivot) => { if (!(await confirmBox(t('memoria.ties.turns.deleteAsk'), t('common.delete'), true))) return; mem.pivots = (mem.pivots || []).filter(x => x !== p); await M.save(mem); st.draw(); };
  const setWay = (w: string) => { v.way = v.way === w ? '' : w; v.more = 30; redraw(); };
  const wayBtn = (w: string): ReactNode => <button key={w} type="button" className={`mm-yn-wf${v.way === w ? ' on' : ''}`} data-way={w} aria-pressed={v.way === w} onClick={() => setWay(w)}><WayIco way={w} /><span>{wayName(w)}</span></button>;
  const turnSec = <Sec title={t('memoria.ties.turns.title')} desc={t('memoria.ties.turns.desc')}>
    {pivots.length ? <>
      <div className="mm-yn-filter">
        <div className="mm-yn-ways" role="group" aria-label={t('memoria.ties.turns.byWay')}>
          <span className="grp"><small>{t('memoria.ties.turns.between')}</small>{['closer', 'apart', 'flip'].map(wayBtn)}</span>
          <span className="grp"><small>{t('memoria.ties.turns.self')}</small>{['heart', 'lot', 'grow'].map(wayBtn)}</span>
        </div>
        <select className="inp auto mm-yn-whof" aria-label={t('memoria.ties.turns.byWho')} value={v.who} onChange={e => { v.who = e.target.value; v.more = 30; redraw(); }}>
          <option value="">{t('memoria.ties.turns.everyone')}</option>{people.map(n => <option key={n} value={n}>{n}</option>)}</select>
      </div>
      {rows.length ? <div className="mm-yn-line">{rows.slice(0, v.more).map(p => <div key={p.id} className="mm-yn-turn" data-way={p.way}><span className="mm-yn-node" aria-hidden="true" />
        <div className="mm-yn-tbody">
          <div className="mm-yn-ttop"><span className="mm-yn-way" data-way={p.way}><WayIco way={p.way} />{wayName(p.way)}</span><Where p={p} />{p.scan ? <span className="mm-yn-tag">{t('memoria.ties.turns.retraced')}</span> : null}
            <button type="button" className="mm-yn-btn del" title={t('common.delete')} aria-label={t('common.delete')} onClick={() => void drop(p)}><BinIco /></button></div>
          <p className="mm-yn-tpair"><b>{shown(p.who)}</b>{p.with ? <i>{t('memoria.ties.heart.toward', { name: shown(p.with) })}</i> : null}</p>
          <p><Change p={p} /></p>
          {p.why ? <small><Tr>{p.why}</Tr></small> : null}
        </div></div>)}</div> : <None text={t('memoria.ties.turns.noMatch')} />}
      {rows.length > v.more ? <button type="button" className="btn ghost mm-more" onClick={() => { v.more += 30; redraw(); }}>{tn('memoria.ties.turns.more', rows.length - v.more)}</button> : null}
    </> : <None text={cfg.tieNotes === false ? t('memoria.ties.turns.off') : t('memoria.ties.turns.empty')} />}
  </Sec>;

  // ── 함께 적기 · 되짚기 · 무대 카드 안내
  const flag = (key: 'tieNotes' | 'feelingLines', on: boolean) => { const c = ensureCfg(); if (key === 'tieNotes') c.tieNotes = on; else c.feelingLines = on ? 3 : 0; saveCfg(); M.reinjectNow?.(chat); st.draw(); };
  const optSec = <Sec title={t('memoria.ties.opt.title')}>
    <label className="check mm-opt"><input type="checkbox" defaultChecked={cfg.tieNotes !== false} onChange={e => flag('tieNotes', e.target.checked)} /><i /><span className="mm-opt-text"><b>{t('memoria.ties.opt.tieNotes')}</b><small>{t('memoria.ties.opt.tieNotesHint')}</small></span></label>
    <label className="check mm-opt"><input type="checkbox" defaultChecked={(Number(cfg.feelingLines) || 0) > 0} onChange={e => flag('feelingLines', e.target.checked)} /><i /><span className="mm-opt-text"><b>{t('memoria.ties.opt.between')}</b><small>{t('memoria.ties.opt.betweenHint')}</small></span></label>
    {retraceRow}{stageNote}
  </Sec>;

  return <div className="mm-view mm-yn">{bonds.length ? mapSec : null}{heartSec}{turnSec}{optSec}</div>;
}
