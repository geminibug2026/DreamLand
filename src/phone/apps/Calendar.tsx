// 캘린더: 오늘(동그라미) · 이야기 속 오늘(점선 고리) · 약속 · 일기 · 기념일, 고른 날의 일과 그 사람의 그날 일정. 크게 보기는 일기장 달력으로
import { useMemo, useState } from 'react';
import { S } from '../../lib/core';
import { go } from '../../lib/router';
import { STATUS, scheduleOf, dayIndex, fmtMin } from '../../lib/f-schedule';
import { addDays, dayKey, keyDate, monthGrid, monthKey, shiftMonth, showDate, weekLabel } from '../../lib/f-keepsake';
import { firstMet, milestone } from '../../lib/together';
import { markLabel } from '../../features/together';
import { t, getLang, fmtDate } from '../../i18n';
import { Glyph } from '../art';
import { AppHead, IBtn, usePhone } from '../ui';
import { nameOf, talkChats } from '../data';
import { hasStory, useMinute } from '../time';
import { Clock } from '../../lib/clock';

interface Ev { k: 'promise' | 'diary' | 'mark'; text: string; sub: string; done?: boolean }
export function Calendar() {
  const P = usePhone(); useMinute();
  const real = dayKey(Date.now()), story = hasStory(P.home) ? dayKey(Clock.ms(P.home)) : '', today = P.p.story && story ? story : real;
  const [mk, setMk] = useState(monthKey(keyDate(today))), [sel, setSel] = useState(today);
  // 이 달에 걸린 일: 약속 · 일기(대화 모드 방들) · 함께한 날 기념일(위젯의 그 사람)
  const evs = useMemo(() => {
    const m = new Map<string, Ev[]>(), add = (k: string, e: Ev) => { if (k.startsWith(mk)) (m.get(k) || m.set(k, []).get(k)!).push(e); };
    for (const c of talkChats().slice(0, 60)) {
      for (const p of c.promises || []) add(p.date, { k: 'promise', text: p.what, sub: [nameOf(c), p.time].filter(Boolean).join(' · '), done: !!p.done });
      for (const d of c.diary || []) add(dayKey(d.ts), { k: 'diary', text: d.title || d.text.slice(0, 40), sub: nameOf(c) });
    }
    const fav = P.fav, met = fav && (S.settings.modes as { together?: boolean }).together !== false ? firstMet(fav.id) : 0;
    if (fav && met) { const first = keyDate(mk + '-01'); for (let i = 0; i < 31; i++) { const k = addDays(dayKey(first), i); if (!k.startsWith(mk)) break; const n = Math.round((+keyDate(k) - +keyDate(dayKey(met))) / 86400000) + 1; const mark = n > 0 ? milestone(n, fav.id, +keyDate(k)) : null; if (mark) add(k, { k: 'mark', text: markLabel(mark), sub: fav.name }); } }
    return m;
  }, [mk, P.v, P.fav]);   // eslint-disable-line react-hooks/exhaustive-deps
  const weeks = monthGrid(mk, 0), d = keyDate(mk + '-01'), list = evs.get(sel) || [];
  const sch = P.fav ? scheduleOf(P.fav) : null, blocks = sch?.days[dayIndex(keyDate(sel))] || [];
  const head = getLang() === 'ko' ? `${d.getFullYear()}년 ${d.getMonth() + 1}월` : fmtDate(d, { year: 'numeric', month: 'long' });
  return <div className="pn-appbody">
    <AppHead title={t('phone.app.calendar')} big right={<IBtn ic="open" label={t('phone.cal.big')} onClick={() => P.leave(() => go('diary', { tab: 'calendar', chatId: P.home?.id }))} />} />
    <div className="pn-cal-nav"><IBtn ic="back" label={t('phone.cal.prev')} onClick={() => setMk(shiftMonth(mk, -1))} /><b>{head}</b><IBtn ic="next" label={t('phone.cal.next')} onClick={() => setMk(shiftMonth(mk, 1))} /></div>
    <div className="pn-cal" role="grid" aria-label={head}>
      {[0, 1, 2, 3, 4, 5, 6].map(i => <span key={'h' + i} className="pn-cal-h" role="columnheader">{weekLabel(i)}</span>)}
      {weeks.flat().map(c => { const e = evs.get(c.key); return <button key={c.key} type="button" role="gridcell" aria-selected={sel === c.key} aria-label={showDate(c.key)} disabled={!c.inMonth}
        className={['pn-cal-d', !c.inMonth && 'out', c.key === real && 'today', story && c.key === story && story !== real && 'story', sel === c.key && 'sel'].filter(Boolean).join(' ')} onClick={() => setSel(c.key)}>
        <span>{c.inMonth ? c.d : ''}</span>{e && c.inMonth ? <i className="pn-cal-dots">{[...new Set(e.map(x => x.k))].slice(0, 3).map(k => <i key={k} className={k} />)}</i> : null}</button>; })}
    </div>
    {story && story !== real ? <div className="pn-cal-jump">{([['story', story, t('phone.cal.storyDay')], ['real', real, t('phone.cal.realDay')]] as const).map(([k, d, l]) =>
      <button key={k} type="button" className={k + (sel === d ? ' on' : '')} onClick={() => { setMk(monthKey(keyDate(d))); setSel(d); }}><i aria-hidden="true" /><span><small>{l}</small><b>{showDate(d, { year: d.slice(0, 4) !== real.slice(0, 4), week: false })}</b></span></button>)}</div> : null}
    <div className="pn-card"><h3>{showDate(sel, { year: false })}</h3>
      {list.length ? <ul className="pn-evs">{list.map((e, i) => <li key={i} className={e.k + (e.done ? ' done' : '')}><Glyph name={e.k === 'promise' ? 'pin' : e.k === 'diary' ? 'diary' : 'heart'} size={16} /><span><b>{e.text}</b><small>{e.sub}</small></span></li>)}</ul>
        : <p className="pn-dim">{t('phone.cal.nothing')}</p>}</div>
    {P.fav ? <div className="pn-card"><h3>{t('phone.cal.schedOf', { name: P.fav.name })}</h3>
      {blocks.length ? <ol className="pn-sched">{blocks.map(b => <li key={b.from}><time>{fmtMin(b.from)}</time><i className={'pn-dot ' + b.status} /><span>{b.activity || STATUS[b.status]}</span></li>)}</ol> : <p className="pn-dim">{t('phone.contact.noSched')}</p>}</div> : null}
  </div>;
}
