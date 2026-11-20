// 기록: 지난 이레 동안 주고받은 수의 막대 · 이어서 들른 날 · 처음 만난 뒤 지난 날
import { addDays, dayKey, keyDate, weekLabel } from '../../lib/f-keepsake';
import { fmtNum, t } from '../../i18n';
import { DAY, firstEver, p2, useScan } from '../data';
import { streak } from '../registry';

export function Record() {
  const { days } = useScan(), today = dayKey(Date.now()), keys = Array.from({ length: 7 }, (_, i) => addDays(today, i - 6));
  const rows = keys.map(k => ({ k, u: days.get(k)?.user || 0, a: days.get(k)?.ai || 0 })), max = Math.max(4, ...rows.map(r => Math.max(r.u, r.a))), sum = rows.reduce((n, r) => n + r.u + r.a, 0);
  const first = firstEver(), since = first ? Math.floor((Date.now() - first) / DAY) + 1 : 0, H = 40, y = (n: number) => 46 - (n / max) * H;
  return <div className="dk-rec">
    <svg className="fx-art dk-bars" viewBox="0 0 140 52" role="img" aria-label={t('desk.rec.barsLabel', { n: sum })}>
      {[0, .5, 1].map(g => <path key={g} className="h" d={`M4 ${46 - g * H}h132`} />)}
      {rows.map((r, i) => { const x = 10 + i * 20, now = r.k === today; return <g key={r.k} className={now ? 'now' : undefined}>
        <path className="t" d={`M${x} 46v3`} />
        {r.u ? <path d={`M${x - 2.5} 46V${y(r.u).toFixed(1)}`} /> : null}{r.a ? <path className="t" d={`M${x + 2.5} 46V${y(r.a).toFixed(1)}`} /> : null}
        {r.u ? <circle className={now ? 'af' : 'p'} cx={x - 2.5} cy={y(r.u).toFixed(1)} r="1.5" /> : null}
        {!r.u && !r.a ? <circle className="h" cx={x} cy="44" r="1" /> : null}</g>; })}
      <path d="M4 46h132" />
    </svg>
    <div className="dk-bars-x">{rows.map(r => <span key={r.k} className={'fx-lbl' + (r.k === today ? ' ink' : '')}>{weekLabel(keyDate(r.k).getDay())}</span>)}</div>
    <div className="dk-legend fx-lbl kr"><span><i className="a" />{t('desk.rec.mine')}</span><span><i className="b" />{t('desk.rec.theirs')}</span></div>
    <div className="dk-kvs">
      <div className="fx-kv"><span>{t('desk.rec.week')}</span><i /><b>{fmtNum(sum)}</b></div>
      <div className="fx-kv"><span>{t('desk.rec.streak')}</span><i /><b>{t('desk.days', { n: p2(streak()) })}</b></div>
      <div className="fx-kv"><span>{t('desk.rec.since')}</span><i /><b>{since ? t('desk.days', { n: p2(since) }) : '—'}</b></div>
    </div>
  </div>;
}
