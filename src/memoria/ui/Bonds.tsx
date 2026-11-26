// 장기기억 — 관계 · 변화 탭: 관계도 · 관계 한눈에 · 사람마다의 감정 변화 · 변화 기록 · 이 카드가 연기하는 인물
// 사이 이름과 변화 기록은 턴을 기록할 때 함께 받는다 (호출은 늘지 않는다). 지난 요약에서 채우는 「찾기」만 따로 모델을 부른다
import { useReducer } from 'react';
import { Btn } from '../../kit';
import { confirmBox, toast } from '../../ui';
import { t, tn } from '../../i18n';
import { S } from '../../lib/core';
import { Memory } from '../../lib/memory';
import type { Bond, Shift } from '../types';
import { hostOf, scanTies, setTieName, tieScanPlan } from '../engine/ties';
import { SHIFT_KINDS, TIE_KINDS, tieKind, type TieEdge } from '../ties';
import { Ico, None, Sec, editBox, ensureCfg, progressBox, saveCfg, type StOpen } from './parts';
import { Tr } from './ReaderView';
import { TieMap, tieMapView, type TieMapView } from './TieMap';
import { bondNow, jumpTo, noMap } from './viewsShared';

/** 이 탭의 보기 상태 (탭을 옮기거나 다시 그려도 남는다) */
interface TiesView { map: TieMapView; kind: string; who: string; more: number; open: Record<string, boolean> }
const viewOf = (st: StOpen): TiesView => (st.ties ||= { map: tieMapView(), kind: '', who: '', more: 40, open: {} }) as TiesView;
const nameKey = (s: string) => String(s || '').toLowerCase().replace(/[\s._\-'"`]+/g, '');
function useCss() { if (typeof document !== 'undefined' && !document.querySelector('link[data-memoria-ties]')) { const l = document.createElement('link'); l.rel = 'stylesheet'; l.href = new URL('css/f-memoria-ties.css', document.baseURI).href; l.dataset.memoriaTies = '1'; document.head.append(l); } }
const kindLabel = (k?: string) => (k && (TIE_KINDS as readonly string[]).includes(k) ? t('memoria.bonds.kind.' + k) : '');

/** 사이 이름 · 종류 고치기 — 직접 고친 이름은 사서가 덮어쓰지 않는다 (이름을 비우면 다시 사서에게 맡긴다) */
async function editTie(st: StOpen, b: Bond) {
  const d = await editBox(t('memoria.bonds.edit.title', { from: b.from, to: b.to }), { name: b.name || '', kind: tieKind(b.kind) || '' }, [
    { k: 'name', label: t('memoria.bonds.edit.name'), ph: t('memoria.bonds.edit.namePh'), hint: t('memoria.bonds.edit.nameHint') },
    { k: 'kind', label: t('memoria.bonds.edit.kind'), type: 'select', opts: [['', t('memoria.bonds.kind.none')], ...TIE_KINDS.map(k => [k, t('memoria.bonds.kind.' + k)] as const)] }]);
  if (!d) return;
  setTieName(b, d.name, d.kind); await Memory.save(st.mem); st.draw();
}

export function Bonds({ st }: { st: StOpen }) {
  useCss();
  const [, redraw] = useReducer((x: number) => x + 1, 0), M = Memory, mem = st.mem, chat = st.chat, v = viewOf(st), cfg = M.cfg(), no = noMap(st);
  const host = hostOf(M, chat, mem); let me = ''; try { me = S.persona(chat)?.name || ''; } catch { /* 페르소나가 없어도 된다 */ }
  const isHost = (n: string) => host.many && nameKey(n) === nameKey(host.label), shown = (n: string) => (/\{\{\s*user\s*\}\}/i.test(n) && me ? me : n);
  const bonds = (mem.bonds || []).filter(b => !b.disabled && bondNow(b) && !isHost(b.from) && !isHost(b.to));
  const edges: TieEdge[] = bonds.map(b => ({ id: b.id, from: shown(b.from), to: shown(b.to), label: b.name || bondNow(b)!.stage, kind: tieKind(b.kind) || '' }));
  const shifts = (mem.shifts || []).filter(s => !isHost(s.who)), plan = tieScanPlan(M, mem);

  // ── 메시지 범위: 그 변화가 적힌 기록이 덮는 메시지 (#시작~#끝) — 누르면 그 장면으로 간다
  const rangeOf = (s: Shift): [number, number] | null => {
    const a = s.span ? s.span[0] : s.turn, b = s.span ? s.span[1] : s.turn, end = no.get(mem.turns[b]?.msgId || ''); if (!end) return null;
    const prev = a > 0 ? no.get(mem.turns[a - 1]?.msgId || '') : 0; return [Math.min(end, prev != null ? prev + 1 : end), end];
  };
  const RangeChip = ({ s }: { s: Shift }) => { const r = rangeOf(s); return r ? <button type="button" className="mm-ti-jump fx-num" title={t('memoria.bonds.jump')} onClick={() => jumpTo(st, r[0])}>{r[0] === r[1] ? `#${r[0]}` : `#${r[0]}~#${r[1]}`}</button> : <span className="mm-ti-jump off fx-num">{`t${s.turn + 1}`}</span>; };

  // ── 지난 요약에서 찾기 (모델 호출: 표시한 횟수까지 · 원문은 다시 읽지 않는다)
  const scan = async () => {
    if (M.busy()) return toast(t('memoria.bonds.scan.busy'));
    if (!(await confirmBox(t('memoria.bonds.scan.ask', { rows: plan.rows, calls: plan.calls }), t('memoria.bonds.scan.btn')))) return;
    const pb = progressBox(t('memoria.bonds.scan.title'));
    try {
      const r = await M.enqueue(() => scanTies(M, chat, mem, { signal: pb.signal, onProgress: (done, total) => pb.set(done, total, t('memoria.bonds.scan.progress')) }));
      await M.save(mem);
      toast(r.calls ? t('memoria.bonds.scan.done', { names: r.named, shifts: r.shifts }) + (r.left ? t('memoria.bonds.scan.left', { n: r.left }) : '') : t('memoria.bonds.scan.none'), 'ok');
    } catch (e) { if ((e as Error).name !== 'AbortError') { console.error(e); toast(t('memoria.bonds.scan.fail', { error: (e as Error).message || String(e) }), 'err'); } }
    finally { pb.close(); st.draw(); }
  };
  const scanCard = plan.rows ? <div className="mm-ti-scan"><div><b>{t('memoria.bonds.scan.head')}</b><p>{t('memoria.bonds.scan.note', { rows: plan.rows, calls: plan.calls })}</p></div>
    <Btn label={t('memoria.bonds.scan.btn')} ic="search" cls="primary" title={t('memoria.bonds.scan.btnTitle')} onClick={() => void scan()} /></div> : null;

  // ── 관계도 · 관계 한눈에
  const focus = v.map.focus, listed = focus ? bonds.filter(b => shown(b.from) === focus || shown(b.to) === focus) : bonds;
  const used = [...new Set(bonds.map(b => tieKind(b.kind)).filter(Boolean))];
  const mapSec = <Sec title={t('memoria.bonds.map.title')} desc={t('memoria.bonds.map.desc')}>
    {edges.length ? <>
      <TieMap edges={edges} v={v.map} redraw={redraw} />
      {used.length ? <div className="mm-ti-legend">{used.map(k => <span key={k} className={`mm-tk-${k}`}><i className="mm-ti-dot" />{kindLabel(k)}</span>)}</div> : null}
      <p className="mm-ti-sub">{focus ? t('memoria.bonds.list.of', { name: focus }) : t('memoria.bonds.list.title')}<b className="fx-num">{listed.length}</b></p>
      <div className="mm-ti-rows">{listed.map(b => { const now = bondNow(b)!, k = tieKind(b.kind); return <div key={b.id} className={`mm-ti-row mm-tk-${k || 'none'}`}>
        <div className="mm-ti-main">
          <p className="mm-ti-pair"><b>{shown(b.from)}</b><span className="mm-ti-arrow"><i className="mm-ti-dot" />{b.name ? <em><Tr>{b.name}</Tr></em> : <em className="none">{t('memoria.bonds.list.unnamed')}</em>}<i className="mm-ti-tip">▶</i></span><b>{shown(b.to)}</b></p>
          <small>{k ? <span className="mm-ti-kind">{kindLabel(k)}</span> : null}<span><Tr>{now.stage}</Tr></span>{b.nameManual ? <span className="mm-ti-hand">{t('memoria.bonds.list.manual')}</span> : null}</small>
        </div>
        <button type="button" className="mm-ti-btn" title={t('memoria.bonds.edit.btn')} aria-label={t('memoria.bonds.edit.btn')} onClick={() => void editTie(st, b)}><Ico name="edit" size={15} /></button>
      </div>; })}</div>
    </> : <None text={t('memoria.bonds.map.empty')} />}
  </Sec>;

  // ── 감정 변화: 사람마다, 지금 마음이 맨 위 (접고 펼 수 있다)
  const felt = shifts.filter(s => s.kind === 'emotion' || s.kind === 'relationship'), byWho = new Map<string, Shift[]>();
  for (const s of felt) { const k = shown(s.who); if (!byWho.has(k)) byWho.set(k, []); byWho.get(k)!.push(s); }
  const people = [...byWho.entries()].map(([name, rows]) => ({ name, rows: [...rows].sort((a, b) => b.turn - a.turn) })).sort((a, b) => b.rows[0].turn - a.rows[0].turn);
  const feelSec = <Sec title={t('memoria.bonds.feel.title')} desc={t('memoria.bonds.feel.desc')}>
    {people.length ? <div className="mm-ti-people">{people.map(p => { const cur = p.rows[0], open = v.open[p.name] ?? false; return <details key={p.name} className="mm-ti-person" open={open} onToggle={e => { v.open[p.name] = (e.currentTarget as HTMLDetailsElement).open; }}>
      <summary><b>{p.name}</b><span className="mm-ti-now">{cur.toward ? <i>{t('memoria.bonds.feel.toward', { name: shown(cur.toward) })}</i> : null}<em><Tr>{cur.to}</Tr></em></span><span className="mm-ti-count fx-num">{p.rows.length}</span></summary>
      <ol className="mm-ti-line">{p.rows.map((s, i) => <li key={s.id} className={i ? '' : 'cur'}>
        <p>{s.toward ? <i>{t('memoria.bonds.feel.toward', { name: shown(s.toward) })}</i> : null}{s.from ? <><s><Tr>{s.from}</Tr></s><span className="mm-ti-to">→</span></> : null}<em><Tr>{s.to}</Tr></em></p>
        <small>{s.why ? <span><Tr>{s.why}</Tr></span> : null}<RangeChip s={s} /></small></li>)}</ol>
    </details>; })}</div> : <None text={t('memoria.bonds.feel.empty')} />}
  </Sec>;

  // ── 변화 기록: 종류(개수) · 인물로 거른다
  const names = [...new Set(shifts.flatMap(s => [shown(s.who), s.toward ? shown(s.toward) : '']).filter(Boolean))].sort((a, b) => a.localeCompare(b));
  if (v.who && !names.includes(v.who)) v.who = '';
  const ofWho = shifts.filter(s => !v.who || shown(s.who) === v.who || (s.toward && shown(s.toward) === v.who)), rows = ofWho.filter(s => !v.kind || s.kind === v.kind).sort((a, b) => b.turn - a.turn);
  const drop = async (s: Shift) => { if (!(await confirmBox(t('memoria.bonds.log.deleteAsk'), t('common.delete'), true))) return; mem.shifts = (mem.shifts || []).filter(x => x !== s); await M.save(mem); st.draw(); };
  const pick = (k: string) => { v.kind = k; v.more = 40; redraw(); };
  const logSec = <Sec title={t('memoria.bonds.log.title')} desc={t('memoria.bonds.log.desc')}>
    {shifts.length ? <>
      <div className="mm-ti-filter">
        <div className="mm-ti-kinds" role="group" aria-label={t('memoria.bonds.log.byKind')}>
          <button type="button" className={`mm-ti-chip${!v.kind ? ' on' : ''}`} aria-pressed={!v.kind} onClick={() => pick('')}>{t('memoria.bonds.log.all')}<b className="fx-num">{ofWho.length}</b></button>
          {SHIFT_KINDS.map(k => <button key={k} type="button" className={`mm-ti-chip sk-${k}${v.kind === k ? ' on' : ''}`} aria-pressed={v.kind === k} onClick={() => pick(k)}>{t('memoria.bonds.shift.' + k)}<b className="fx-num">{ofWho.filter(s => s.kind === k).length}</b></button>)}
        </div>
        <select className="inp mm-ti-who" aria-label={t('memoria.bonds.log.byWho')} value={v.who} onChange={e => { v.who = e.target.value; v.more = 40; redraw(); }}>
          <option value="">{t('memoria.bonds.log.everyone')}</option>{names.map(n => <option key={n} value={n}>{n}</option>)}</select>
      </div>
      {rows.length ? <div className="mm-ti-rows">{rows.slice(0, v.more).map(s => <div key={s.id} className="mm-ti-row">
        <div className="mm-ti-main">
          <p><em className={`mm-ti-tag sk-${s.kind}`}>{t('memoria.bonds.shift.' + s.kind)}</em><b>{shown(s.who)}</b>{s.toward ? <span className="mm-ti-dim">{` → ${shown(s.toward)}`}</span> : null}</p>
          <p className="mm-ti-change">{s.from ? <><s><Tr>{s.from}</Tr></s><span className="mm-ti-to">→</span></> : null}<em><Tr>{s.to}</Tr></em></p>
          <small>{s.why ? <span><Tr>{s.why}</Tr></span> : null}<RangeChip s={s} />{s.scan ? <span className="mm-ti-hand">{t('memoria.bonds.log.scanned')}</span> : null}</small>
        </div>
        <button type="button" className="mm-ti-btn del" title={t('common.delete')} aria-label={t('common.delete')} onClick={() => void drop(s)}><Ico name="trash" size={15} /></button>
      </div>)}</div> : <None text={t('memoria.bonds.log.noMatch')} />}
      {rows.length > v.more ? <button type="button" className="btn ghost mm-ti-more" onClick={() => { v.more += 40; redraw(); }}>{tn('memoria.bonds.log.more', rows.length - v.more)}</button> : null}
    </> : <None text={cfg.tieNotes === false ? t('memoria.bonds.log.off') : t('memoria.bonds.log.empty')} />}
  </Sec>;

  // ── 이 카드가 연기하는 인물 (대화마다) · 기록 설정
  const solo = (chat.charIds || []).length === 1, mode = mem.cardCast || 'auto';
  const setCast = async (m: 'auto' | 'one' | 'many') => {
    if (m === 'auto') delete mem.cardCast; else mem.cardCast = m;
    const stray = m === 'many' ? mem.cast.find(c => !c.disabled && nameKey(c.name) === nameKey(host.label)) : null;
    if (stray) stray.disabled = true;   // 카드 이름으로 잘못 생긴 인물 카드는 치워 둔다 (지우지 않는다 — 세계 탭에서 되돌릴 수 있다)
    await M.save(mem); M.reinjectNow?.(chat); st.draw();
    toast(m === 'many' ? t('memoria.bonds.cast.setMany', { name: host.label }) + (stray ? t('memoria.bonds.cast.strayOff') : '') : m === 'one' ? t('memoria.bonds.cast.setOne', { name: host.label }) : t('memoria.bonds.cast.setAuto'), 'ok');
  };
  const autoNow = !solo ? '' : hostOf(M, chat, { ...mem, cardCast: undefined }).many ? t('memoria.bonds.cast.autoMany') : t('memoria.bonds.cast.autoOne');
  const flag = (key: 'tieNotes' | 'feelingLines', on: boolean) => { const c = ensureCfg(); if (key === 'tieNotes') c.tieNotes = on; else c.feelingLines = on ? 3 : 0; saveCfg(); M.reinjectNow?.(chat); st.draw(); };
  const setSec = <Sec title={t('memoria.bonds.cast.title')} desc={t('memoria.bonds.cast.desc')}>
    {solo ? <><div className="mm-ti-seg" role="radiogroup" aria-label={t('memoria.bonds.cast.title')}>
      {(['auto', 'one', 'many'] as const).map(m => <button key={m} type="button" role="radio" aria-checked={mode === m} className={`mm-ti-chip${mode === m ? ' on' : ''}`} onClick={() => void setCast(m)}>{t('memoria.bonds.cast.' + m)}</button>)}</div>
      <p className="mm-ti-hint">{mode === 'auto' ? t('memoria.bonds.cast.autoNow', { now: autoNow }) : mode === 'many' ? t('memoria.bonds.cast.manyHint', { name: host.label }) : t('memoria.bonds.cast.oneHint', { name: host.label })}</p></>
      : <p className="mm-ti-hint">{t('memoria.bonds.cast.group')}</p>}
    <label className="check mm-opt"><input type="checkbox" defaultChecked={cfg.tieNotes !== false} onChange={e => flag('tieNotes', e.target.checked)} /><span>{t('memoria.bonds.opt.tieNotes')}</span></label>
    <label className="check mm-opt"><input type="checkbox" defaultChecked={(Number(cfg.feelingLines) || 0) > 0} onChange={e => flag('feelingLines', e.target.checked)} /><span>{t('memoria.bonds.opt.feelings')}</span></label>
  </Sec>;

  return <div className="mm-view mm-ti">{scanCard}{mapSec}{feelSec}{logSec}{setSec}</div>;
}
