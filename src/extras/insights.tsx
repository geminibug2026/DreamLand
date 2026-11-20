// 발자국: 이 대화의 통계 창. 모델을 부르지 않고 저장된 메시지만으로 센다. 그림은 전부 가는 선 SVG, 숫자는 모노
import type { ReactNode } from 'react';
import { openModal } from '../ui';
import { S, msgText } from '../lib/core';
import { tokens } from '../lib/engine';
import type { Chat, Msg } from '../lib/types';
import { titleOf } from '../chat/actions';
import { fmtDate, t } from '../i18n';
import { rng } from './cfg';

const DAY = 86400000, pad = (n: number, w = 2) => String(n).padStart(w, '0');
const dayKey = (ts: number) => { const d = new Date(ts); return Math.floor((ts - d.getTimezoneOffset() * 60000) / DAY); };
const num = (n: number) => Math.round(n).toLocaleString();

// ── 낱말 세기: 조사 · 어미는 간단한 규칙으로 떼고, 흔한 말은 뺀다 ──
const JOSA = /(으로서|으로써|에게서|한테서|이라고|라고|에서는|에서도|으로는|으로도|에서|에게|한테|까지|부터|처럼|보다|마저|조차|이나|이란|이라|으로|이랑|하고|은|는|이|가|을|를|에|의|도|와|과|로|만|랑|야|요)$/;
const STOP = new Set(('그리고 그러나 하지만 그래서 그런데 그냥 정말 진짜 너무 조금 아주 이제 다시 지금 여기 거기 저기 이거 그거 저거 이건 그건 우리 나는 내가 너는 네가 그는 그녀 것이 거야 있어 없어 있는 없는 하는 했다 한다 있다 없다 같아 같은 그런 이런 저런 어떤 무슨 뭔가 누가 아니 아냐 그래 응 음 어 아 네 예 '
  + 'the and for that this with you your have has had not but are was were what when where who how why will would could should can just like about from into than then them they their there here been being its his her him she out over more some any all one too very really much also did does doing done get got going know think want yeah okay well').split(/\s+/));
export function topWords(texts: string[], n = 12): [string, number][] {
  const count = new Map<string, number>();
  for (const raw of texts) {
    const text = raw.replace(/\[[a-z_]+\s*:[^\]\n]*\]/gi, ' ').replace(/<[^>]+>/g, ' ').replace(/https?:\S+/g, ' ').toLowerCase();
    for (let w of text.match(/[\p{L}\p{N}']+/gu) || []) {
      w = w.replace(/^'+|'+$/g, '');
      if (/[가-힣]/.test(w)) { if (w.length >= 3) w = w.replace(JOSA, ''); if (w.length < 2) continue; }
      else if (w.length < 3 || /^\d+$/.test(w)) continue;
      if (STOP.has(w)) continue;
      count.set(w, (count.get(w) || 0) + 1);
    }
  }
  return [...count].filter(([, c]) => c >= 2).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, n);
}

export interface Insights {
  total: number; user: { n: number; chars: number }; ai: { n: number; chars: number };
  first: number; last: number; span: number; active: number; streak: number;
  days: { key: number; n: number }[]; hours: number[]; peak: number;
  trend: number[]; avgReply: number; swiped: number; extra: number; maxSw: number;
  models: { name: string; n: number; ms: number; tok: number }[];
  words: { user: [string, number][]; ai: [string, number][] };
}
export function compute(msgs: Msg[]): Insights {
  const real = msgs.filter(m => m.role !== 'system'), U = real.filter(m => m.role === 'user'), A = real.filter(m => m.role === 'assistant');
  const len = (m: Msg) => msgText(m).length, sum = (l: Msg[]) => l.reduce((n, m) => n + len(m), 0);
  const stamped = real.filter(m => m.ts > 0), first = stamped.length ? Math.min(...stamped.map(m => m.ts)) : 0, last = stamped.length ? Math.max(...stamped.map(m => m.ts)) : 0;
  const perDay = new Map<number, number>(), hours = new Array<number>(24).fill(0);
  for (const m of stamped) { const k = dayKey(m.ts); perDay.set(k, (perDay.get(k) || 0) + 1); hours[new Date(m.ts).getHours()]++; }
  const keys = [...perDay.keys()].sort((a, b) => a - b);
  let streak = 0, run = 0; keys.forEach((k, i) => { run = i && k === keys[i - 1] + 1 ? run + 1 : 1; streak = Math.max(streak, run); });
  const days = keys.length ? Array.from({ length: keys[keys.length - 1] - keys[0] + 1 }, (_, i) => ({ key: keys[0] + i, n: perDay.get(keys[0] + i) || 0 })) : [];
  // 답장 길이의 흐름: 차례대로 최대 32 토막으로 나눠 토막마다 평균
  const lens = A.map(len).filter(n => n > 0), B = Math.min(32, lens.length), trend = Array.from({ length: B }, (_, i) => { const s = lens.slice(Math.floor(i * lens.length / B), Math.floor((i + 1) * lens.length / B)); return s.reduce((a, b) => a + b, 0) / Math.max(1, s.length); });
  const models = new Map<string, { n: number; ms: number; msN: number; tok: number }>();
  for (const m of A) { const s = m.swipes[m.sw]; if (!s?.model) continue; const o = models.get(s.model) || models.set(s.model, { n: 0, ms: 0, msN: 0, tok: 0 }).get(s.model)!; o.n++; if (s.ms) { o.ms += s.ms; o.msN++; } o.tok += tokens(s.text || ''); }
  const swiped = A.filter(m => m.swipes.length > 1);
  return {
    total: real.length, user: { n: U.length, chars: sum(U) }, ai: { n: A.length, chars: sum(A) }, first, last, span: first ? dayKey(last) - dayKey(first) + 1 : 0, active: keys.length, streak,
    days, hours, peak: hours.indexOf(Math.max(...hours)), trend, avgReply: lens.length ? lens.reduce((a, b) => a + b, 0) / lens.length : 0,
    swiped: swiped.length, extra: swiped.reduce((n, m) => n + m.swipes.length - 1, 0), maxSw: Math.max(1, ...A.map(m => m.swipes.length)),
    models: [...models].map(([name, o]) => ({ name, n: o.n, ms: o.msN ? o.ms / o.msN : 0, tok: o.tok / Math.max(1, o.n) })).sort((a, b) => b.n - a.n).slice(0, 6),
    words: { user: topWords(U.map(msgText)), ai: topWords(A.map(msgText)) },
  };
}

// ════════ 그림 ════════
/** 머리의 발자국 길: 굽은 점선 위로 좌우 번갈아 찍힌 작은 자국 (함께한 날이 많을수록 길게) */
function Trail({ seed, steps }: { seed: string; steps: number }) {
  const r = rng(seed), n = Math.max(4, Math.min(22, steps)), W = 320, amp = 7 + r() * 4, ph = r() * 6;
  const y = (x: number) => 20 + Math.sin(x / 46 + ph) * amp, dy = (x: number) => Math.cos(x / 46 + ph) * amp / 46;
  const path = Array.from({ length: 41 }, (_, i) => `${i ? 'L' : 'M'}${(i * W / 40).toFixed(1)} ${y(i * W / 40).toFixed(1)}`).join('');
  return <svg viewBox={`0 0 ${W} 40`} className="fx-art xt-trail" aria-hidden="true"><path className="d" d={path} />
    {Array.from({ length: n }, (_, i) => { const x = 10 + i * (W - 20) / (n - 1), a = Math.atan(dy(x)) * 180 / Math.PI, side = i % 2 ? 4 : -4, last = i === n - 1;
      return <ellipse key={i} className={last ? 'a' : i > n - 4 ? '' : 't'} cx={x} cy={y(x) + side} rx={3.2} ry={1.5} transform={`rotate(${a.toFixed(1)} ${x} ${y(x) + side})`} />; })}
    <path className="af" d={`M${W - 4} ${y(W - 4) - 9}l1 2.6 2.6 1-2.6 1-1 2.6-1-2.6-2.6-1 2.6-1z`} /></svg>;
}
/** 날짜별 활동: 가는 막대. 날이 많으면 같은 너비의 토막으로 묶는다. 축은 바닥 선 하나, 값 라벨은 가장 높은 것만 */
function DayBars({ I }: { I: Insights }) {
  const W = 560, H = 86, base = H - 16, MAXB = 90, d = I.days; if (!d.length) return null;
  const per = Math.max(1, Math.ceil(d.length / MAXB)), bins = Array.from({ length: Math.ceil(d.length / per) }, (_, i) => { const s = d.slice(i * per, (i + 1) * per); return { from: s[0].key, to: s[s.length - 1].key, n: s.reduce((a, b) => a + b.n, 0) }; });
  const max = Math.max(1, ...bins.map(b => b.n)), step = W / bins.length, top = bins.findIndex(b => b.n === max);
  const date = (k: number, o: Intl.DateTimeFormatOptions = { month: 'numeric', day: 'numeric' }) => fmtDate(new Date(k * DAY + new Date(k * DAY).getTimezoneOffset() * 60000 + 3600000), o);
  return <svg viewBox={`0 0 ${W} ${H}`} className="xt-chart" role="img" aria-label={t('extras.ins.daily')}>
    <line className="ax" x1={0} y1={base + .5} x2={W} y2={base + .5} />
    {bins.map((b, i) => { const h = b.n ? Math.max(2, b.n / max * (base - 14)) : 0, x = i * step + step / 2;
      return <g key={i}>{h ? <line className={'bar' + (i === top ? ' hi' : '')} x1={x} x2={x} y1={base} y2={base - h} strokeWidth={Math.max(1, Math.min(4, step - 2))} /> : <circle className="nil" cx={x} cy={base - 3} r={.6} />}
        <rect className="hit" x={i * step} y={0} width={step} height={base}><title>{`${date(b.from)}${b.to !== b.from ? '–' + date(b.to) : ''} · ${b.n}`}</title></rect></g>; })}
    <text className="val" x={Math.max(14, Math.min(W - 14, top * step + step / 2))} y={base - Math.max(2, (base - 14)) - 4} textAnchor="middle">{max}</text>
    <text className="lab" x={0} y={H - 2}>{date(d[0].key, { year: '2-digit', month: 'numeric', day: 'numeric' })}</text>
    <text className="lab" x={W} y={H - 2} textAnchor="end">{date(d[d.length - 1].key, { year: '2-digit', month: 'numeric', day: 'numeric' })}</text>
    {per > 1 ? <text className="lab" x={W / 2} y={H - 2} textAnchor="middle">{t('extras.ins.perBin', { n: per })}</text> : null}
  </svg>;
}
/** 시간대 고리: 24칸. 안쪽 고리에서 바깥으로 뻗는 눈금의 길이가 그 시각의 메시지 수 */
function HourRing({ I }: { I: Insights }) {
  const S0 = 168, c = S0 / 2, r0 = 34, L = 34, max = Math.max(1, ...I.hours);
  const pt = (h: number, r: number) => { const a = (h / 24) * Math.PI * 2 - Math.PI / 2; return [c + Math.cos(a) * r, c + Math.sin(a) * r]; };
  return <svg viewBox={`0 0 ${S0} ${S0}`} className="xt-chart xt-ring" role="img" aria-label={t('extras.ins.hours')}>
    <circle className="ax" cx={c} cy={c} r={r0} /><circle className="ax faint" cx={c} cy={c} r={r0 + L} strokeDasharray="1 4" />
    {I.hours.map((n, h) => { const [x1, y1] = pt(h + .5, r0 + 2), [x2, y2] = pt(h + .5, r0 + 2 + (n / max) * (L - 3)), [hx, hy] = pt(h + .5, r0 + L / 2);
      return <g key={h}>{n ? <line className={'bar' + (h === I.peak ? ' hi' : '')} x1={x1} y1={y1} x2={x2} y2={y2} strokeWidth={2.4} /> : <circle className="nil" cx={x1} cy={y1} r={.6} />}
        <circle className="hit" cx={hx} cy={hy} r={9}><title>{`${pad(h)}:00–${pad(h)}:59 · ${n}`}</title></circle></g>; })}
    {[0, 6, 12, 18].map(h => { const [x, y] = pt(h, r0 + L + 9); return <text key={h} className="lab" x={x} y={y + 3.5} textAnchor="middle">{pad(h)}</text>; })}
    <text className="val big" x={c} y={c + 1} textAnchor="middle">{pad(I.peak)}</text><text className="lab" x={c} y={c + 14} textAnchor="middle">{t('extras.ins.peak')}</text>
  </svg>;
}
/** 답장 길이의 흐름: 한 줄의 꺾은선과 평균 점선, 끝 값만 적는다 */
function Trend({ I }: { I: Insights }) {
  const W = 560, H = 78, v = I.trend; if (v.length < 2) return null;
  const max = Math.max(...v) * 1.08, min = 0, X = (i: number) => 4 + i * (W - 56) / (v.length - 1), Y = (n: number) => H - 14 - (n - min) / (max - min || 1) * (H - 26);
  return <svg viewBox={`0 0 ${W} ${H}`} className="xt-chart" role="img" aria-label={t('extras.ins.trend')}>
    <line className="ax" x1={0} y1={H - 13.5} x2={W - 48} y2={H - 13.5} />
    <line className="ax faint" x1={0} y1={Y(I.avgReply)} x2={W - 48} y2={Y(I.avgReply)} strokeDasharray="2 4" />
    <path className="ln fx-draw" pathLength={1} d={v.map((n, i) => `${i ? 'L' : 'M'}${X(i).toFixed(1)} ${Y(n).toFixed(1)}`).join('')} />
    {v.map((n, i) => <circle key={i} className="hit" cx={X(i)} cy={Y(n)} r={8}><title>{num(n)}</title></circle>)}
    <circle className="dot" cx={X(v.length - 1)} cy={Y(v[v.length - 1])} r={3} />
    <text className="val" x={W - 40} y={Y(v[v.length - 1]) + 3.5}>{num(v[v.length - 1])}</text>
    <text className="lab" x={0} y={H - 1}>{t('extras.ins.early')}</text><text className="lab" x={W - 48} y={H - 1} textAnchor="end">{t('extras.ins.recent')}</text>
    <text className="lab" x={W - 40} y={Math.min(H - 16, Math.max(9, Y(I.avgReply) + (Math.abs(Y(I.avgReply) - Y(v[v.length - 1])) < 12 ? 14 : 3.5)))}>{t('extras.ins.avg')}</text>
  </svg>;
}
function Words({ title, rows, acc }: { title: string; rows: [string, number][]; acc?: boolean }) {
  const max = Math.max(1, ...rows.map(r => r[1]));
  return <div className="xt-words"><span className={'fx-lbl kr' + (acc ? ' acc' : ' ink')}>{title}</span>
    {rows.length ? <ol>{rows.map(([w, n], i) => <li key={w}><span className="fx-num xt-rank">{pad(i + 1)}</span><b>{w}</b><i className={'xt-wbar' + (acc ? ' acc' : '')} style={{ ['--p' as string]: n / max }} /><span className="fx-num">{n}</span></li>)}</ol> : <p className="dim">{t('extras.ins.noWords')}</p>}</div>;
}
const Stat = ({ label, value, sub, d = 0 }: { label: string; value: ReactNode; sub?: ReactNode; d?: number }) => <div className="xt-stat fx-in" style={{ ['--d' as string]: d * 50 + 'ms' }}><span className="fx-lbl kr">{label}</span><b className="fx-num">{value}</b>{sub ? <small>{sub}</small> : null}</div>;
const Sec = ({ title, note, children }: { title: string; note?: string; children: ReactNode }) => <section className="xt-ins-sec"><header><span className="fx-lbl kr ink fx-head">{title}</span>{note ? <small className="fx-num">{note}</small> : null}</header>{children}</section>;

function View({ chat, msgs }: { chat: Chat; msgs: Msg[] }) {
  const I = compute(msgs), me = S.persona(chat).name, them = titleOf(chat), full = (ts: number) => fmtDate(ts, { year: 'numeric', month: 'long', day: 'numeric' });
  if (!I.total) return <div className="fx-empty"><svg viewBox="0 0 56 56" className="fx-art"><path className="d" d="M6 40c10-14 18 6 28-8s10-10 16-14" /><ellipse cx="14" cy="36" rx="3.4" ry="1.7" /><ellipse className="t" cx="24" cy="40" rx="3.4" ry="1.7" /></svg><p>{t('extras.ins.empty')}</p></div>;
  const share = I.user.chars + I.ai.chars ? I.user.chars / (I.user.chars + I.ai.chars) : 0, swPct = I.ai.n ? I.swiped / I.ai.n : 0;
  return <div className="xt-ins">
    <header className="xt-ins-head"><div><span className="fx-lbl">Footprints</span><h3 className="fx-title">{them}</h3>
      <p className="xt-ins-since">{I.first ? t('extras.ins.since', { date: full(I.first), days: I.span }) : ''}</p></div><Trail seed={chat.id} steps={I.active} /></header>
    <div className="xt-stats">
      <Stat d={0} label={t('extras.ins.msgs')} value={num(I.total)} sub={<>{me} <i className="fx-num">{num(I.user.n)}</i> · {them} <i className="fx-num">{num(I.ai.n)}</i></>} />
      <Stat d={1} label={t('extras.ins.chars')} value={num(I.user.chars + I.ai.chars)} sub={<>{me} <i className="fx-num">{num(I.user.chars)}</i> · {them} <i className="fx-num">{num(I.ai.chars)}</i></>} />
      <Stat d={2} label={t('extras.ins.activeDays')} value={pad(I.active)} sub={t('extras.ins.ofSpan', { n: I.span })} />
      <Stat d={3} label={t('extras.ins.streak')} value={pad(I.streak)} sub={t('extras.ins.streakSub')} />
    </div>
    <div className="xt-share" role="img" aria-label={t('extras.ins.share', { me: Math.round(share * 100), them: Math.round((1 - share) * 100) })}><span>{me}<b className="fx-num">{Math.round(share * 100)}%</b></span><i style={{ ['--p' as string]: share }} /><span><b className="fx-num">{Math.round((1 - share) * 100)}%</b>{them}</span></div>
    <Sec title={t('extras.ins.daily')} note={I.days.length ? t('extras.ins.dailyNote', { n: I.days.length }) : ''}><DayBars I={I} /></Sec>
    <div className="xt-ins-two">
      <Sec title={t('extras.ins.hours')}><HourRing I={I} /></Sec>
      <div>
        <Sec title={t('extras.ins.trend')} note={t('extras.ins.avgN', { n: num(I.avgReply) })}>{I.trend.length > 1 ? <Trend I={I} /> : <p className="dim">{t('extras.ins.tooFew')}</p>}</Sec>
        <Sec title={t('extras.ins.swipes')} note={`${Math.round(swPct * 100)}%`}>
          <div className={'fx-meter' + (swPct > .5 ? ' acc' : '')} style={{ ['--p' as string]: swPct }} role="img" aria-label={`${Math.round(swPct * 100)}%`} />
          <div className="fx-kv"><span>{t('extras.ins.swiped')}</span><i /><b>{pad(I.swiped, 3)} / {pad(I.ai.n, 3)}</b></div>
          <div className="fx-kv"><span>{t('extras.ins.extra')}</span><i /><b>{pad(I.extra, 3)}</b></div>
          <div className="fx-kv"><span>{t('extras.ins.maxSw')}</span><i /><b>{pad(I.maxSw)}</b></div>
        </Sec>
      </div>
    </div>
    {I.models.length ? <Sec title={t('extras.ins.models')}><table className="xt-tbl"><thead><tr><th>{t('extras.ins.model')}</th><th>{t('extras.ins.replies')}</th><th>{t('extras.ins.delay')}</th><th>{t('extras.ins.tokens')}</th></tr></thead>
      <tbody>{I.models.map(m => <tr key={m.name}><td>{m.name}</td><td className="fx-num">{pad(m.n, 3)}</td><td className="fx-num">{m.ms ? (m.ms / 1000).toFixed(1) + 's' : '—'}</td><td className="fx-num">{num(m.tok)}</td></tr>)}</tbody></table></Sec> : null}
    <Sec title={t('extras.ins.words')}><div className="xt-words-two"><Words title={me} rows={I.words.user} acc /><Words title={them} rows={I.words.ai} /></div></Sec>
    <p className="hint xt-ins-foot">{t('extras.ins.foot')}</p>
  </div>;
}
export async function openInsights(chat: Chat) {
  const msgs = await S.msgs(chat.id);
  const m = openModal({ title: t('extras.ins.title'), wide: true, body: <View chat={chat} msgs={msgs} />, actions: [{ label: t('common.close') }] });
  m.el.classList.add('xt-ins-modal');
}
