// 주간 일정: 주간 띠 · 편집 창 · 캐릭터 한 줄 · 기능 화면 › 일정
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { Avatar, Btn, IconBtn, useEvents } from '../kit';
import { usePaged, type ModalHandle, confirmBox, menu, toast } from '../ui';
import type { CharX } from '../addons/types';
import { errMsg, isAbort } from '../addons/parts';
import { openModal } from '../addons/parts';
import { DAY, DAYS, FREE, STATUS, Schedule, blockAt, dayIndex, fmtMin, hasBlocks, normDay, normWeek, putSchedule, rawSchedule, scheduleOf, toMin, type Block, type Sched, type Status } from '../lib/f-schedule';
import * as libClock from '../lib/clock';
import { S } from '../lib/core';

const clock = () => libClock.Clock.date();
const pct = (n: number) => n / DAY * 100 + '%';

/** 주간 띠: 요일마다 24시간을 상태 무늬로 */
export function Strip({ sched, pick, sel = -1, mini = false }: { sched?: Sched | null; pick?: (i: number) => void; sel?: number; mini?: boolean }) {
  const d = clock(), today = dayIndex(d), nowMin = d.getHours() * 60 + d.getMinutes();
  return <div className={mini ? 'wk mini' : 'wk'}>
    {mini ? null : <div className="wk-scale"><span /><div>{[0, 6, 12, 18, 24].map(t => <i key={t} style={{ left: t / 24 * 100 + '%' }}>{String(t)}</i>)}</div></div>}
    {DAYS.map((name, i) => {
      const cls = 'wk-row' + (i === sel ? ' on' : '') + (i === today ? ' today' : ''), list = sched?.days?.[i] || [];
      const kids = <><span className="wk-day">{name}</span>
        <div className="wk-bar">{list.map((b, k) => <i key={k} className={`st-${b.status}`} title={`${fmtMin(b.from)}–${fmtMin(b.to)} ${b.activity} · ${STATUS[b.status]}`} style={{ left: pct(b.from), width: pct(b.to - b.from) }} />)}
          {i === today ? <b className="wk-now" style={{ left: pct(nowMin) }}>✦</b> : null}{!list.length ? <em>비어 있음</em> : null}</div></>;
      return pick ? <button key={i} type="button" className={cls} title={`${name}요일 고치기`} onClick={() => pick(i)}>{kids}</button> : <div key={i} className={cls}>{kids}</div>;
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
    if (only < 0 && hasBlocks(cur.current) && !(await confirmBox('지금 일정을 새로 짠 일정으로 바꿀까요? (호출 1회)', '새로 짜기'))) return;
    const ctl = job.ctl = new AbortController(); setBusy(true);
    try { const days = await Schedule.generate(ch, { guide: cur.current.guide || '', only, signal: ctl.signal }); commit({ days, on: true }); toast(only >= 0 ? `${DAYS[only]}요일 일정을 새로 짰어요` : '일주일 일정을 짰어요', 'ok'); }
    catch (e) { if (!isAbort(e)) toast('일정 만들기 실패: ' + errMsg(e), 'err'); }
    finally { job.ctl = null; if (alive.current) setBusy(false); }
  };
  const copyTo = (anchor: Element) => menu(anchor, ([['평일 모두 (월–금)', [0, 1, 2, 3, 4]], ['주말 (토·일)', [5, 6]], ['모든 요일', [0, 1, 2, 3, 4, 5, 6]], ...DAYS.map((d, i) => [`${d}요일`, [i]])] as [string, number[]][])
    .filter(([, to]) => to.some(i => i !== day)).map(([label, to]) => ({ label, onclick: () => { const src = cur.current.days[day]; commit({ days: cur.current.days.map((d, i) => to.includes(i) ? src.map(b => ({ ...b })) : d) }); toast('복사했어요'); } })));
  const [tick, setTick] = useState(0);   // 못 읽은 시각을 적었을 때 칸을 저장된 값으로 되돌린다
  const list = sched.days[day], At = hasBlocks(sched) ? blockAt(sched) : null, off = sched.on === false, now = new Date();
  const blockRow = (b: Block, i: number): ReactNode => <div key={i} className={`sched-row st-${b.status}`}>
    <i className="sched-mark" title={STATUS[b.status]} />
    <div className="sched-when"><Committed key={`${day}:${b.from}:${tick}`} className="inp sched-time" type="time" defaultValue={fmtMin(b.from)} disabled={i === 0} title={i === 0 ? '하루는 00:00 에 시작해요' : '시작 시각'} onCommit={val => {
      const v = toMin(val), lo = list[i - 1].from + 5, hi = b.to - 5; if (v == null) return setTick(t => t + 1);
      const at = Math.max(lo, Math.min(hi, v)); setDayBlocks(day, list.map((x, k) => k === i ? { ...x, from: at } : k === i - 1 ? { ...x, to: at } : x)); setTick(t => t + 1);
    }} /><span>{`– ${fmtMin(b.to)}`}</span></div>
    <select className="inp sched-st" title="이 시간의 상태" value={b.status} onChange={e => setDayBlocks(day, list.map((x, k) => k === i ? { ...x, status: e.target.value as Status } : x))}>{(Object.entries(STATUS) as [Status, string][]).map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
    <Committed key={`${day}:${i}:${b.activity}:${tick}`} className="inp sched-act" defaultValue={b.activity} placeholder="무엇을 하는 시간인지" maxLength={60} onCommit={val => { setDayBlocks(day, list.map((x, k) => k === i ? { ...x, activity: val } : x)); setTick(t => t + 1); }} />
    <div className="sched-tools">
      <IconBtn ic="plus" title="이 시간을 둘로 나누기" cls="tiny" onClick={() => {
        const mid = Math.round((b.from + b.to) / 2 / 5) * 5; if (mid - b.from < 5 || b.to - mid < 5) return toast('더 나눌 수 없어요');
        const next = [...list]; next.splice(i, 1, { ...b, to: mid }, { ...b, from: mid, activity: '', status: 'online' });
        const days = cur.current.days.map((d, k) => k === day ? next : d); cur.current = { ...cur.current, days }; putSchedule(ch, { days }); setSched(cur.current);
      }} />
      {list.length > 1 ? <IconBtn ic="trash" title="이 시간 지우기 (앞뒤 시간에 합쳐져요)" cls="tiny" onClick={() => { const next = list.filter((_, k) => k !== i); if (i === 0) next[0] = { ...next[0], from: 0 }; else next[i - 1] = { ...next[i - 1], to: b.to }; setDayBlocks(day, next); }} /> : null}
    </div>
  </div>;
  return <>
    <div className="sched-head"><Avatar o={ch} cls="sm" />
      <div className="sched-who"><b>{ch.name}</b><small>{!hasBlocks(sched) ? '아직 일정이 없어요' : off ? '일정을 쓰지 않는 중' : At?.cur ? `지금 ${STATUS[At.cur.status]}${At.cur.activity ? ' · ' + At.cur.activity : ''} · ${fmtMin((now.getHours() * 60 + now.getMinutes() + At.left) % DAY)} 까지` : '지금은 비어 있는 시간'}</small></div>
      <label className="switch" title="이 캐릭터의 일정을 대화 모드에 반영하기"><input type="checkbox" checked={!off} onChange={e => commit({ on: e.target.checked })} /><i /></label></div>
    <Strip sched={sched} sel={day} pick={setDay} /><Legend />
    <div className="sched-day">
      <div className="sched-day-head"><b>{`${DAYS[day]}요일`}</b><span>{list.length ? `${list.length}칸` : '비어 있음'}</span>
        <div className="row">{list.length ? <Btn label="다른 요일에 복사" cls="ghost" onClick={e => copyTo(e.currentTarget)} /> : null}
          <Btn label={busy ? '멈추기' : '이 요일만 다시 짜기'} ic={busy ? 'stop' : 'sparkle'} cls="ghost" title="모델 호출 1회" onClick={() => void run(day)} /></div></div>
      {list.length ? <div className="sched-list">{list.map(blockRow)}</div>
        : <div className="sched-empty"><i>☾</i><p>이 요일은 비어 있어요. 비어 있는 날은 하루 종일 온라인으로 봅니다.</p><Btn label="직접 채우기" ic="plus" onClick={() => setDayBlocks(day, [{ from: 0, to: 420, status: 'offline', activity: '잠' }, { from: 420, to: 1380, status: 'online', activity: FREE }, { from: 1380, to: DAY, status: 'offline', activity: '잠' }])} /></div>}
    </div>
    <div className="sched-gen">
      <label className="field"><span className="field-label">바라는 점 (선택)</span><Committed as="textarea" className="inp" rows={2} defaultValue={sched.guide || ''} placeholder="예: 야간 근무라 낮에 자요 / 주말에는 늦잠" onTyping={v => { guide.current = v; cur.current.guide = v; }} onCommit={() => commit({ guide: guide.current })} /></label>
      <div className="row wrap"><Btn label={busy ? '멈추기' : hasBlocks(sched) ? 'AI 로 일주일 다시 짜기' : 'AI 로 일주일 짜기'} ic={busy ? 'stop' : 'sparkle'} cls="primary" onClick={() => void run(-1)} />
        {hasBlocks(sched) ? <Btn label="모두 비우기" cls="ghost" onClick={async () => { if (await confirmBox(`${ch.name}의 일정을 모두 비울까요?`, '비우기', true)) commit({ days: Array.from({ length: 7 }, () => []) }); }} /> : null}
        <small className="hint">{busy ? '일정을 짜는 중…' : '버튼을 누를 때만 모델을 부릅니다 (일주일 1회 · 요일 하나 1회). 캐릭터 설명을 읽고 짜며, 짠 뒤에는 손으로 고칠 수 있어요.'}</small></div>
    </div>
  </>;
}
/** 주간 일정 창을 연다 */
export function editSchedule(ch?: CharX | null, { onClose }: { onClose?: () => void } = {}): ModalHandle | undefined {
  if (!ch) return;
  const job: Job = { ctl: null };
  return openModal({ title: '주간 일정', wide: true, spec: 'div.sched', onClose: () => { job.ctl?.abort(); onClose?.(); }, actions: [{ label: '닫기', cls: 'primary' }] }, () => <Editor ch={ch} job={job} />);
}

/** 캐릭터 한 줄: 요약 띠 + 편집 버튼 (div.sched-item 안) */
export function Row({ ch, onDone }: { ch: CharX; onDone?: () => void }) {
  const s = rawSchedule(ch), At = scheduleOf(ch) ? blockAt(s) : null, has = hasBlocks(s);
  return <><Avatar o={ch} cls="sm" />
    <div className="sched-item-text"><b>{ch.name}</b><small>{!has ? '일정 없음 — 항상 온라인' : s?.on === false ? '일정 꺼 둠' : At?.cur ? `지금 ${STATUS[At.cur.status]}${At.cur.activity ? ' · ' + At.cur.activity : ''}` : '지금은 비어 있는 시간'}</small></div>
    {has ? <Strip sched={s} mini /> : null}
    <Btn label={has ? '고치기' : '만들기'} ic={has ? 'edit' : 'plus'} cls="ghost" onClick={() => editSchedule(ch, { onClose: onDone })} /></>;
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
  const t = q.trim().toLowerCase(), rows = S.chars.filter(c => !t || (c.name + ' ' + (c.tags || []).join(' ')).toLowerCase().includes(t)).sort((a, b) => +hasBlocks(rawSchedule(b)) - +hasBlocks(rawSchedule(a)) || a.name.localeCompare(b.name, 'ko'));
  const pg = usePaged(rows, { id: 'schedule', perPage: 30, resetKey: t });
  return <>
    <p className="hint">캐릭터마다 일주일 일과를 정해 두면, 대화 모드에서 지금 시각의 일과가 그 캐릭터의 상태(온라인 · 자리 비움 · 방해 금지 · 오프라인)가 되고 먼저 오는 연락의 이유가 됩니다. 일정을 짜는 것은 버튼을 누를 때만 모델을 부릅니다.</p>
    <input className="inp search" placeholder="캐릭터 찾기" value={q} onChange={e => setQ(e.target.value)} />
    <div className="sched-items" ref={pg.listRef}>
      {pg.rows.map(c => <div className="sched-item" key={c.id}><Row ch={c} onDone={draw} /></div>)}
      {!rows.length ? <p className="dim">{S.chars.length ? '찾는 캐릭터가 없어요.' : '캐릭터를 먼저 만들어 주세요.'}</p> : null}
    </div>
    {pg.pager}
  </>;
}
