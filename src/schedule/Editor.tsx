// 주간 일정: 주간 띠 · 편집 창 · 캐릭터 한 줄 · 기능 화면 › 일정
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { Avatar, Btn, IconBtn, useEvents } from '../kit';
import { usePaged, type ModalHandle, confirmBox, menu, toast } from '../ui';
import type { CharX } from '../addons/types';
import { errMsg, isAbort } from '../addons/parts';
import { openModal } from '../addons/parts';
import { DAY, FREE, dayName, dayFull, STATUS, Schedule, blockAt, dayIndex, fmtMin, hasBlocks, normDay, normWeek, putSchedule, rawSchedule, scheduleOf, toMin, type Block, type Sched, type Status } from '../lib/f-schedule';
import * as libClock from '../lib/clock';
import { S } from '../lib/core';
import { t as tr, tn, locale } from '../i18n';

const clock = () => libClock.Clock.date();
const pct = (n: number) => n / DAY * 100 + '%';

/** 주간 띠: 요일마다 24시간을 상태 무늬로 */
export function Strip({ sched, pick, sel = -1, mini = false }: { sched?: Sched | null; pick?: (i: number) => void; sel?: number; mini?: boolean }) {
  const d = clock(), today = dayIndex(d), nowMin = d.getHours() * 60 + d.getMinutes();
  return <div className={mini ? 'wk mini' : 'wk'}>
    {mini ? null : <div className="wk-scale"><span /><div>{[0, 6, 12, 18, 24].map(t => <i key={t} style={{ left: t / 24 * 100 + '%' }}>{String(t)}</i>)}</div></div>}
    {Array.from({ length: 7 }, (_, i) => { const name = dayName(i);
      const cls = 'wk-row' + (i === sel ? ' on' : '') + (i === today ? ' today' : ''), list = sched?.days?.[i] || [];
      const kids = <><span className="wk-day">{name}</span>
        <div className="wk-bar">{list.map((b, k) => <i key={k} className={`st-${b.status}`} title={`${fmtMin(b.from)}–${fmtMin(b.to)} ${b.activity} · ${STATUS[b.status]}`} style={{ left: pct(b.from), width: pct(b.to - b.from) }} />)}
          {i === today ? <b className="wk-now" style={{ left: pct(nowMin) }}>✦</b> : null}{!list.length ? <em>{tr('schedule.empty')}</em> : null}</div></>;
      return pick ? <button key={i} type="button" className={cls} title={tr('schedule.strip.editDay', { day: dayFull(i) })} onClick={() => pick(i)}>{kids}</button> : <div key={i} className={cls}>{kids}</div>;
    })}
  </div>;
}
export const Legend = () => <div className="wk-legend">{(Object.entries(STATUS) as [Status, string][]).map(([k, l]) => <span key={k}><i className={`st-${k}`} />{l}</span>)}</div>;

/** 값이 확정될 때(change: 자리를 뜨거나 Enter)만 알리는 입력 칸 — 옛 onchange 와 같은 때 */
function Committed({ as = 'input', onCommit, onTyping, ...rest }: { as?: 'input' | 'textarea'; onCommit: (v: string) => void; onTyping?: (v: string) => void } & Record<string, unknown>) {
  const el = useRef<HTMLInputElement & HTMLTextAreaElement>(null), fn = useRef(onCommit); fn.current = onCommit;
  useEffect(() => { const n = el.current; if (!n) return; const h = () => fn.current(n.value); n.addEventListener('change', h); return () => n.removeEventListener('change', h); }, []);
  const Tag = as;
  return <Tag ref={el} {...rest} onInput={onTyping ? (e: { currentTarget: { value: string } }) => onTyping(e.currentTarget.value) : undefined} />;
}

interface Job { ctl: AbortController | null }
/** 주간 일정 편집기 (div.sched 안) */
function Editor({ ch, job }: { ch: CharX; job: Job }) {
  const [sched, setSched] = useState<Sched>(() => { const s = rawSchedule(ch) || { on: true, days: Array.from({ length: 7 }, () => []), guide: '' }; return { ...s, days: normWeek(s.days) }; });
  const [day, setDay] = useState(() => dayIndex(clock())), [busy, setBusy] = useState(false);
  const cur = useRef(sched); cur.current = sched;
  const guide = useRef(sched.guide || ''), alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  const commit = (patch: Partial<Sched>) => { const next = { ...cur.current, ...patch }; cur.current = next; putSchedule(ch, { on: next.on !== false, days: next.days, guide: next.guide || '' }); if (alive.current) setSched(next); };
  const setDayBlocks = (i: number, blocks: Block[]) => commit({ days: cur.current.days.map((d, k) => k === i ? normDay(blocks) : d) });
  const run = async (only: number) => {
    if (busy) { job.ctl?.abort(); return; }
    if (only < 0 && hasBlocks(cur.current) && !(await confirmBox(tr('schedule.confirm.regen'), tr('schedule.confirm.regenOk')))) return;
    const ctl = job.ctl = new AbortController(); setBusy(true);
    try { const days = await Schedule.generate(ch, { guide: cur.current.guide || '', only, signal: ctl.signal }); commit({ days, on: true }); toast(only >= 0 ? tr('schedule.toast.dayDone', { day: dayFull(only) }) : tr('schedule.toast.weekDone'), 'ok'); }
    catch (e) { if (!isAbort(e)) toast(tr('schedule.toast.fail', { msg: errMsg(e) }), 'err'); }
    finally { job.ctl = null; if (alive.current) setBusy(false); }
  };
  const copyTo = (anchor: Element) => menu(anchor, ([[tr('schedule.copy.weekdays'), [0, 1, 2, 3, 4]], [tr('schedule.copy.weekend'), [5, 6]], [tr('schedule.copy.all'), [0, 1, 2, 3, 4, 5, 6]], ...Array.from({ length: 7 }, (_, i) => [dayFull(i), [i]])] as [string, number[]][])
    .filter(([, to]) => to.some(i => i !== day)).map(([label, to]) => ({ label, onclick: () => { const src = cur.current.days[day]; commit({ days: cur.current.days.map((d, i) => to.includes(i) ? src.map(b => ({ ...b })) : d) }); toast(tr('schedule.toast.copied')); } })));
  const [tick, setTick] = useState(0);   // 못 읽은 시각을 적었을 때 칸을 저장된 값으로 되돌린다
  const list = sched.days[day], At = hasBlocks(sched) ? blockAt(sched) : null, off = sched.on === false, now = new Date();
  const blockRow = (b: Block, i: number): ReactNode => <div key={i} className={`sched-row st-${b.status}`}>
    <i className="sched-mark" title={STATUS[b.status]} />
    <div className="sched-when"><Committed key={`${day}:${b.from}:${tick}`} className="inp sched-time" type="time" defaultValue={fmtMin(b.from)} disabled={i === 0} title={i === 0 ? tr('schedule.row.firstStart') : tr('schedule.row.start')} onCommit={val => {
      const v = toMin(val), lo = list[i - 1].from + 5, hi = b.to - 5; if (v == null) return setTick(t => t + 1);
      const at = Math.max(lo, Math.min(hi, v)); setDayBlocks(day, list.map((x, k) => k === i ? { ...x, from: at } : k === i - 1 ? { ...x, to: at } : x)); setTick(t => t + 1);
    }} /><span>{`– ${fmtMin(b.to)}`}</span></div>
    <select className="inp sched-st" title={tr('schedule.row.status')} value={b.status} onChange={e => setDayBlocks(day, list.map((x, k) => k === i ? { ...x, status: e.target.value as Status } : x))}>{(Object.entries(STATUS) as [Status, string][]).map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
    <Committed key={`${day}:${i}:${b.activity}:${tick}`} className="inp sched-act" defaultValue={b.activity} placeholder={tr('schedule.row.activity')} maxLength={60} onCommit={val => { setDayBlocks(day, list.map((x, k) => k === i ? { ...x, activity: val } : x)); setTick(t => t + 1); }} />
    <div className="sched-tools">
      <IconBtn ic="plus" title={tr('schedule.row.split')} cls="tiny" onClick={() => {
        const mid = Math.round((b.from + b.to) / 2 / 5) * 5; if (mid - b.from < 5 || b.to - mid < 5) return toast(tr('schedule.row.cantSplit'));
        const next = [...list]; next.splice(i, 1, { ...b, to: mid }, { ...b, from: mid, activity: '', status: 'online' });
        const days = cur.current.days.map((d, k) => k === day ? next : d); cur.current = { ...cur.current, days }; putSchedule(ch, { days }); setSched(cur.current);
      }} />
      {list.length > 1 ? <IconBtn ic="trash" title={tr('schedule.row.remove')} cls="tiny" onClick={() => { const next = list.filter((_, k) => k !== i); if (i === 0) next[0] = { ...next[0], from: 0 }; else next[i - 1] = { ...next[i - 1], to: b.to }; setDayBlocks(day, next); }} /> : null}
    </div>
  </div>;
  return <>
    <div className="sched-head"><Avatar o={ch} cls="sm" />
      <div className="sched-who"><b>{ch.name}</b><small>{!hasBlocks(sched) ? tr('schedule.head.none') : off ? tr('schedule.head.off') : At?.cur ? tr('schedule.head.nowUntil', { now: `${STATUS[At.cur.status]}${At.cur.activity ? ' · ' + At.cur.activity : ''}`, until: fmtMin((now.getHours() * 60 + now.getMinutes() + At.left) % DAY) }) : tr('schedule.head.free')}</small></div>
      <label className="switch" title={tr('schedule.head.toggle')}><input type="checkbox" checked={!off} onChange={e => commit({ on: e.target.checked })} /><i /></label></div>
    <Strip sched={sched} sel={day} pick={setDay} /><Legend />
    <div className="sched-day">
      <div className="sched-day-head"><b>{dayFull(day)}</b><span>{list.length ? tn('schedule.day.blocks', list.length) : tr('schedule.empty')}</span>
        <div className="row">{list.length ? <Btn label={tr('schedule.copy.btn')} cls="ghost" onClick={e => copyTo(e.currentTarget)} /> : null}
          <Btn label={busy ? tr('schedule.gen.stop') : tr('schedule.gen.day')} ic={busy ? 'stop' : 'sparkle'} cls="ghost" title={tr('schedule.gen.oneCall')} onClick={() => void run(day)} /></div></div>
      {list.length ? <div className="sched-list">{list.map(blockRow)}</div>
        : <div className="sched-empty"><i>☾</i><p>{tr('schedule.day.emptyHint')}</p><Btn label={tr('schedule.day.fill')} ic="plus" onClick={() => setDayBlocks(day, [{ from: 0, to: 420, status: 'offline', activity: '잠' }, { from: 420, to: 1380, status: 'online', activity: FREE }, { from: 1380, to: DAY, status: 'offline', activity: '잠' }])} /></div>}
    </div>
    <div className="sched-gen">
      <label className="field"><span className="field-label">{tr('schedule.gen.guide')}</span><Committed as="textarea" className="inp" rows={2} defaultValue={sched.guide || ''} placeholder={tr('schedule.gen.guidePh')} onTyping={v => { guide.current = v; cur.current.guide = v; }} onCommit={() => commit({ guide: guide.current })} /></label>
      <div className="row wrap"><Btn label={busy ? tr('schedule.gen.stop') : hasBlocks(sched) ? tr('schedule.gen.weekAgain') : tr('schedule.gen.week')} ic={busy ? 'stop' : 'sparkle'} cls="primary" onClick={() => void run(-1)} />
        {hasBlocks(sched) ? <Btn label={tr('schedule.gen.clear')} cls="ghost" onClick={async () => { if (await confirmBox(tr('schedule.gen.clearAsk', { name: ch.name }), tr('schedule.gen.clearOk'), true)) commit({ days: Array.from({ length: 7 }, () => []) }); }} /> : null}
        <small className="hint">{busy ? tr('schedule.gen.busy') : tr('schedule.gen.hint')}</small></div>
    </div>
  </>;
}
/** 주간 일정 창을 연다 */
export function editSchedule(ch?: CharX | null, { onClose }: { onClose?: () => void } = {}): ModalHandle | undefined {
  if (!ch) return;
  const job: Job = { ctl: null };
  return openModal({ title: tr('schedule.modal.title'), wide: true, spec: 'div.sched', onClose: () => { job.ctl?.abort(); onClose?.(); }, actions: [{ label: tr('common.close'), cls: 'primary' }] }, () => <Editor ch={ch} job={job} />);
}

/** 캐릭터 한 줄: 요약 띠 + 편집 버튼 (div.sched-item 안) */
export function Row({ ch, onDone }: { ch: CharX; onDone?: () => void }) {
  const s = rawSchedule(ch), At = scheduleOf(ch) ? blockAt(s) : null, has = hasBlocks(s);
  return <><Avatar o={ch} cls="sm" />
    <div className="sched-item-text"><b>{ch.name}</b><small>{!has ? tr('schedule.item.none') : s?.on === false ? tr('schedule.item.off') : At?.cur ? tr('schedule.item.now', { now: `${STATUS[At.cur.status]}${At.cur.activity ? ' · ' + At.cur.activity : ''}` }) : tr('schedule.head.free')}</small></div>
    {has ? <Strip sched={s} mini /> : null}
    <Btn label={has ? tr('schedule.item.edit') : tr('schedule.item.make')} ic={has ? 'edit' : 'plus'} cls="ghost" onClick={() => editSchedule(ch, { onClose: onDone })} /></>;
}
/** 옛 코드(설정 창)가 바라는 Node 로 */
export function rowNode(ch: CharX, onDone?: () => void): HTMLElement {
  const el = document.createElement('div'); el.className = 'sched-item';
  createRoot(el).render(<Row ch={ch} onDone={onDone} />);
  return el;
}

/** 기능 화면의 탭 (div.card.sched-studio 안): 캐릭터가 많아도 찾을 수 있게 검색 + 일정이 있는 캐릭터 먼저 */
export function ScheduleStudio() {
  const draw = useEvents('chars');
  const [q, setQ] = useState('');
  const t = q.trim().toLowerCase(), rows = S.chars.filter(c => !t || (c.name + ' ' + (c.tags || []).join(' ')).toLowerCase().includes(t)).sort((a, b) => +hasBlocks(rawSchedule(b)) - +hasBlocks(rawSchedule(a)) || a.name.localeCompare(b.name, locale()));
  const pg = usePaged(rows, { id: 'schedule', perPage: 30, resetKey: t });
  return <>
    <p className="hint">{tr('schedule.studio.hint')}</p>
    <input className="inp search" placeholder={tr('schedule.studio.search')} value={q} onChange={e => setQ(e.target.value)} />
    <div className="sched-items" ref={pg.listRef}>
      {pg.rows.map(c => <div className="sched-item" key={c.id}><Row ch={c} onDone={draw} /></div>)}
      {!rows.length ? <p className="dim">{S.chars.length ? tr('schedule.studio.noHit') : tr('schedule.studio.noChars')}</p> : null}
    </div>
    {pg.pager}
  </>;
}
