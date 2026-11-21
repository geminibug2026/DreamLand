// 오늘의 하늘: 날짜 · 진짜 달 위상 · 다음 보름과 그믐까지 · 이번 달 달력(이야기한 날에 점)
import { S } from '../../lib/core';
import { SYNODIC, dayKey, monthGrid, monthKey, phaseAt, weekLabel } from '../../lib/f-keepsake';
import { moonPhase } from '../../lib/moon';
import { fmtDate, t } from '../../i18n';
import { MoonArt } from '../art';
import { p2, useScan } from '../data';

export function Sky() {
  const { days } = useScan(), now = new Date(), p = phaseAt(now), today = dayKey(now), mk = monthKey(now);
  // 반올림해서 30 이 되면 오늘이다 (한 바퀴는 29.5일)
  const left = (to: number) => Math.round((((to - p) % 1 + 1) % 1) * SYNODIC) % 30, full = left(.5), dark = left(0);
  const ws = Math.min(6, Math.max(0, +(S.settings.almanac?.weekStart ?? 0) || 0)), weeks = monthGrid(mk, ws), met = weeks.flat().filter(c => c.inMonth && days.has(c.key)).length;
  return <div className="dk-sky fx-night">
    <div className="dk-sky-a">
      <div className="dk-date"><span className="fx-lbl">{fmtDate(now, { weekday: 'long' })}</span><b className="fx-num">{p2(now.getDate())}</b><span className="dk-ym">{fmtDate(now, { year: 'numeric', month: 'long' })}</span></div>
      <MoonArt p={p} />
      <div className="dk-ph"><h3>{moonPhase(now).name}</h3>
        <div className="fx-kv"><span>{t('desk.sky.toFull')}</span><i /><b>{full ? t('desk.days', { n: p2(full) }) : t('desk.today')}</b></div>
        <div className="fx-kv"><span>{t('desk.sky.toDark')}</span><i /><b>{dark ? t('desk.days', { n: p2(dark) }) : t('desk.today')}</b></div></div>
    </div>
    <div className="dk-cal" role="img" aria-label={t('desk.sky.calLabel', { n: met })}>
      <div className="dk-cal-h">{Array.from({ length: 7 }, (_, i) => <span key={i} className="fx-lbl">{weekLabel((i + ws) % 7)}</span>)}</div>
      {weeks.map((w, i) => <div key={i} className="dk-cal-w">{w.map(c => <span key={c.key} className={'fx-num' + (c.inMonth ? '' : ' out') + (c.key === today ? ' now' : '') + (days.has(c.key) ? ' met' : '')}>{p2(c.d)}</span>)}</div>)}
      <div className="dk-cal-f fx-kv"><span><i className="dk-dot" />{t('desk.sky.met')}</span><i /><b>{t('desk.days', { n: p2(met) })}</b></div>
    </div>
  </div>;
}
