// 일기장 화면의 네 탭: 달이 차오르는 달력 · 책장 · 약속 수첩 · 설정
import { useEffect, useReducer, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { Avatar, Btn, Icon, IconBtn, Moon } from '../kit';
import { Form, confirmBox, menu, toast, type FieldDef } from '../ui';
import { openDiary } from './Book';
import { editPrompts, pickChat, promiseDialog, showLetter } from './dialogs';
import {
  A, BY, DIARY_DEF, Promises, changed, charOf, defaultChat, dreamOf, errMsg, extractByCall, groupsOf, jumpTo, lastTs, levelOf, loadChat, moodDef, namesOf, pageCount, photoSrc, promptDefs, PROMPTS,
  monthLabel, roomLine, roomOf, save, syncChat, view, who, writeLetter,
} from './logic';
import { BusyBtn, Glyph, MoonDial, MoonMini, Polaroid, Ticket, useAlive } from './parts';
import type { DChat, DayRec, Days, GridCell, Msg, PromiseRec, PromiseState } from './types';
import { Illust } from '../lib/illust';
import { S } from '../lib/core';
import { go } from '../lib/router';
import { moonPhase } from '../lib/moon';
import * as core from '../lib/core';
import * as K from '../lib/f-keepsake';
import { t as tr, tn, getLang, fmtDate, locale } from '../i18n';

export interface DiaryArg { tab?: string; chatId?: string; day?: string }
const useDraw = () => useReducer((x: number) => x + 1, 0)[1];
const now = () => core.now();

// ════════ 달이 차오르는 달력 ════════
export function Calendar({ arg }: { arg: DiaryArg }) {
  const draw = useDraw(), alive = useAlive(), token = useRef(0), detailEl = useRef<HTMLElement>(null);
  const [data, setData] = useState<{ chat: DChat; msgs: Msg[] } | 'none' | null>(null), [err, setErr] = useState('');
  const cur = useRef<DChat | null>(null);
  const load = async (patch: DiaryArg = {}) => {
    const k = K;
    if (patch.chatId) view.chatId = patch.chatId; if (patch.day && k.validKey(patch.day)) { view.sel = patch.day; view.mk = patch.day.slice(0, 7); }
    const chat = defaultChat();
    if (!chat) { cur.current = null; setData('none'); return; }
    view.chatId = chat.id; view.mk ||= k.monthKey(now());
    cur.current = null; setData(null); const t = ++token.current;   // 불러오는 사이 다른 대화로 넘어갔으면 그리지 않는다
    const msgs = await loadChat(chat); await syncChat(chat, msgs, { quiet: true });
    if (!alive.current || token.current !== t || view.chatId !== chat.id) return;
    cur.current = chat; setData({ chat, msgs });
  };
  const reopen = (patch: DiaryArg = {}) => void load(patch).catch(e => { console.error(e); if (alive.current) setErr(errMsg(e)); });
  useEffect(() => {
    reopen(arg);
    return core.on<DChat | null>('almanac:changed', c => { if (cur.current && (!c || c.id === cur.current.id)) draw(); });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (err) return <div className="empty"><p>{tr('diary.cal.loadFail', { msg: err })}</p></div>;
  if (data === 'none') return <div className="empty"><Moon size={46} /><p>{tr('diary.cal.noChats')}</p><Btn label={tr('diary.cal.goChars')} ic="home" cls="primary" onClick={() => go('home')} /></div>;
  if (!data) return <div className="alm-loading"><Moon size={28} /><span>{tr('diary.cal.loading')}</span></div>;

  const { chat, msgs } = data, k = K, today = k.dayKey(now());
  const a = A(), days = k.collectDays(chat, msgs), st = k.monthStats(days, view.mk, a.goal, today), [y, mo] = view.mk.split('-').map(Number), ch = charOf(chat);
  const letter = (chat.letters || []).find(l => l.month === view.mk);
  const askLetter = async (again: boolean) => {
    if (again) toast(tr('diary.letter.writingToast'));
    const rec = await writeLetter(chat, msgs, view.mk); if (!alive.current) return;
    draw(); showLetter(chat, rec, { onAgain });
  };
  const onAgain = () => void askLetter(true).catch(e => toast(errMsg(e), 'err'));
  const pick = () => pickChat({ current: chat.id, onPick: c => { view.sel = ''; reopen({ chatId: c.id }); } });

  // ── 누구와의 달력인가
  const others = groupsOf().filter(g => g.chat.charIds.join('+') !== chat.charIds.join('+')).slice(0, 8);
  const whoBar = <div className="alm-who">
    <button className="alm-me" title={tr('diary.pick.other')} onClick={pick}><Avatar o={ch || { name: namesOf(chat) }} /><div><b>{namesOf(chat)}</b><small>{`${roomOf(chat)} · ${roomLine(chat)}`}</small></div><Icon name="down" size={15} /></button>
    {others.length ? <div className="alm-others">{others.map(g => <button key={g.chat.id} title={`${g.name} · ${roomLine(g.chat)}`} onClick={() => { view.sel = ''; reopen({ chatId: g.chat.id }); }}><Avatar o={g.ch || { name: g.name }} cls="sm" /><span>{g.name}</span></button>)}</div> : null}
    <div className="alm-who-side"><IconBtn ic="search" title={tr('diary.pick.title')} onClick={pick} /><IconBtn ic="chat" title={tr('diary.goChat')} onClick={() => go('chat', chat.id)} /><IconBtn ic="book" title={tr('diary.openBook')} onClick={() => core.emit('diary:open', chat)} /></div>
  </div>;

  // ── 그달의 달
  const say = st.full ? tr('diary.cal.say.full') : st.when === 'future' ? tr('diary.cal.say.future') : st.when === 'past' ? (st.active ? tn('diary.cal.say.stopped', st.active) : tr('diary.cal.say.empty')) : st.active ? (st.reachable ? tn('diary.cal.say.left', st.left) : tn('diary.cal.say.leftFar', st.left)) : tr('diary.cal.say.start');
  const letterBox = letter ? <button className="alm-env has" onClick={() => showLetter(chat, letter, { onAgain })}><Glyph name="letter" /><div><b>{tr('diary.letter.read', { month: monthLabel(view.mk) })}</b><small>{letter.title || tr('diary.letter.got', { date: new Date(letter.ts).toLocaleDateString(locale()) })}</small></div></button>
    : st.full ? <div className="alm-env ready"><BusyBtn label={tr('diary.letter.get')} ic="feather" cls="primary" busy={tr('diary.letter.busy')} run={() => askLetter(false)} /><IconBtn ic="sliders" title={tr('diary.letter.editPrompt')} cls="tiny" onClick={() => editPrompts(['letter'], tr('diary.letter.promptTitle'))} /><small>{tr('diary.letter.readyHint', { name: ch?.name || tr('diary.charFallback') })}</small></div>
      : <div className="alm-env locked"><Glyph name="letter" /><div><b>{tr('diary.prompt.letter.label')}</b><small>{st.when === 'past' ? tr('diary.letter.missed') : tn('diary.letter.locked', st.target)}</small></div></div>;
  const stats: [string, number | string][] = [[tr('diary.stat.msgs'), st.msgs], [tr('diary.stat.streak'), st.streak ? tn('diary.days', st.streak) : 0], [tr('diary.type.diary'), st.diary], [tr('diary.stat.photos'), st.photos], [tr('diary.type.keepsake'), st.keepsakes], [tr('diary.type.dream'), st.dreams]];
  const moonPanel = <aside className="alm-moon">
    <div className="alm-moon-head"><b>{k.pad(mo)}</b><span>{k.MONTHS_EN[mo - 1]}<small>{String(y)}</small></span></div>
    <MoonDial st={st} />
    <div className="alm-moon-cap"><b>{`${st.active}`}<i>{tr('diary.cal.ofTarget', { target: st.target })}</i></b><span>{k.phaseLabel(k.fillToPhase(st.fill))}</span><small>{say}</small></div>
    <dl className="alm-stats">{stats.filter(([, v]) => v).map(([key, v]) => <div key={key}><dt>{key}</dt><dd>{String(v)}</dd></div>)}</dl>
    {letterBox}
  </aside>;

  // ── 달력 지면
  const weekStart = +(a.weekStart ?? 0) || 0, grid = k.monthGrid(view.mk, weekStart), wk = Array.from({ length: 7 }, (_, i) => (i + weekStart) % 7);
  const STATE_TITLE: Record<PromiseState, string> = { kept: tr('diary.pstate.kept'), missed: tr('diary.pstate.missed'), today: tr('diary.pstate.today'), upcoming: tr('diary.pstate.upcoming') };
  const cell = (c: GridCell, ci: number, week: GridCell[]) => {
    const d = days.get(c.key), n = d?.n || 0, on = n > 0 && c.inMonth, nextOn = ci < 6 && week[ci + 1].inMonth && (days.get(week[ci + 1].key)?.n || 0) > 0, prevOn = ci > 0 && week[ci - 1].inMonth && (days.get(week[ci - 1].key)?.n || 0) > 0;
    const marks: ReactNode[] = d && c.inMonth ? [d.diary.length ? <Glyph key="d" name="diary" title={tn('diary.mark.diary', d.diary.length)} /> : null, d.photos.length ? <Glyph key="p" name="photo" title={tn('diary.mark.photos', d.photos.length)} /> : null, d.keepsakes.length ? <Glyph key="s" name="scene" title={tn('diary.mark.keepsakes', d.keepsakes.length)} /> : null, d.dreams.length ? <Glyph key="m" name="dream" title={tr('diary.type.dream')} /> : null,
      ...[...new Set(d.promises.map(p => k.promiseState(p, today)))].map(s => <Glyph key={s} name={s === 'upcoming' ? 'open' : s} title={STATE_TITLE[s]} />)].filter(Boolean) : [];
    const label = `${k.showDate(c.key)}${n ? ' · ' + tn('diary.cell.msgs', n) : ''}${d?.promises.length ? ' · ' + tn('diary.cell.promises', d.promises.length) : ''}`;
    const cls = `alm-day${c.inMonth ? '' : ' out'}${on ? ` on lv${levelOf(n)}` : ''}${c.key === today ? ' today' : ''}${c.key === view.sel ? ' sel' : ''}${on && nextOn ? ' link-r' : ''}${on && prevOn ? ' link-l' : ''}${c.dow === 0 ? ' sun' : ''}`;
    return <button key={c.key} className={cls} title={label} aria-label={label} onClick={() => { view.sel = c.key; if (!c.inMonth) view.mk = c.key.slice(0, 7); draw(); requestAnimationFrame(() => detailEl.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })); }}>
      <span className="alm-n">{String(c.d)}</span>{on ? <i className="alm-dot" /> : null}{on ? <span className="alm-cnt">{String(n)}</span> : null}{marks.length ? <span className="alm-marks">{marks.slice(0, 4)}{marks.length > 4 ? <em>+</em> : null}</span> : null}
    </button>;
  };
  const go = (mk: string, sel = '') => { view.mk = mk; view.sel = sel; draw(); };
  const addPromise = async (date: string) => { if (await promiseDialog(chat, null, { date })) draw(); };
  const cal = <div className="alm-cal">
    <header className="alm-cal-head"><IconBtn ic="left" title={tr('diary.cal.prevMonth')} onClick={() => go(k.shiftMonth(view.mk, -1))} /><h2>{monthLabel(view.mk, true)}</h2><IconBtn ic="right" title={tr('diary.cal.nextMonth')} onClick={() => go(k.shiftMonth(view.mk, 1))} />
      <span className="alm-sp" />{view.mk !== k.monthKey(now()) || view.sel !== today ? <Btn label={tr('diary.today')} cls="ghost" onClick={() => go(k.monthKey(now()), today)} /> : null}<Btn label={tr('diary.promise.add')} ic="plus" onClick={() => void addPromise(view.sel || today)} /></header>
    <div className="alm-week">{wk.map(i => <span key={i} className={i === 0 ? 'sun' : undefined}>{k.weekLabel(i)}</span>)}</div>
    <div className="alm-grid" style={{ '--rows': grid.length } as CSSProperties}>{grid.flatMap(week => week.map((c, ci) => cell(c, ci, week)))}</div>
    <div className="alm-legend">{([['diary', 'diary.type.diary'], ['photo', 'diary.stat.photos'], ['scene', 'diary.legend.scene'], ['dream', 'diary.type.dream'], ['open', 'diary.pstate.upcoming'], ['kept', 'diary.pstate.kept'], ['missed', 'diary.pstate.missed']] as const).map(([g, l]) => <span key={g}><Glyph name={g} />{tr(l)}</span>)}<span className="alm-dots"><i className="alm-dot demo" /><i className="alm-dot demo d2" /><i className="alm-dot demo d3" />{tr('diary.legend.dots')}</span></div>
  </div>;

  // ── 한 해의 달들
  const yearBar = <div className="alm-year"><IconBtn ic="left" title={tr('diary.cal.prevYear')} cls="tiny" onClick={() => go(`${y - 1}-${k.pad(mo)}`)} /><b>{String(y)}</b><IconBtn ic="right" title={tr('diary.cal.nextYear')} cls="tiny" onClick={() => go(`${y + 1}-${k.pad(mo)}`)} />
    <div className="alm-months">{Array.from({ length: 12 }, (_, i) => { const mk = `${y}-${k.pad(i + 1)}`, s = k.monthStats(days, mk, a.goal, today), has = (chat.letters || []).some(l => l.month === mk); return <button key={mk} className={[mk === view.mk && 'on', s.active && 'has'].filter(Boolean).join(' ') || undefined} title={`${monthLabel(mk)} · ${tn('diary.days', s.active)}${s.full ? ' · ' + tr('diary.fullMoon') : ''}${has ? ' · ' + tr('diary.type.letter') : ''}`} onClick={() => go(mk)}><MoonMini fill={s.fill} size={22} /><span>{`${i + 1}`}</span>{has ? <i /> : null}</button>; })}</div></div>;

  return <>{whoBar}<section className="alm-sheet">{moonPanel}{cal}</section>{yearBar}<DayDetail chat={chat} msgs={msgs} days={days} today={today} draw={draw} elRef={detailEl} /></>;
}

/** 고른 날 */
function DayDetail({ chat, msgs, days, today, draw, elRef }: { chat: DChat; msgs: Msg[]; days: Days; today: string; draw: () => void; elRef: React.RefObject<HTMLElement | null> }) {
  const k = K, key = view.sel;
  if (!key) return <div className="alm-detail none" ref={elRef as React.RefObject<HTMLDivElement | null>}><p className="hint">{tr('diary.day.pickHint')}</p></div>;
  const blank = { key, n: 0, user: 0, ai: 0, firstId: '', lastId: '', photos: [], diary: [], dreams: [], keepsakes: [], promises: [] } as unknown as DayRec;
  const d = days.get(key) || blank, date = k.keyDate(key), ph = moonPhase(date), gap = k.diffDays(today, key);
  const rel = gap === 0 ? tr('diary.today') : gap === 1 ? tr('diary.tomorrow') : gap === -1 ? tr('diary.yesterday') : gap > 0 ? tn('diary.daysLater', gap) : tn('diary.daysAgo', -gap);
  const pics = d.photos.map(p => ({ ...p, src: photoSrc(p) })).filter(p => p.src);
  const sec = (title: string, n: number, kids: ReactNode) => <div className="alm-sec"><h4>{title}{n ? <i>{String(n)}</i> : null}</h4>{kids}</div>;
  const open = (at: string) => core.emit('diary:open', { chat, at });
  const prow = (p: PromiseRec) => { const s = k.promiseState(p, today); return <div key={p.id} className={`alm-pr ${s}`}>
    {p.later ? <Glyph name="today" title={tr('diary.by.later')} /> : <button className="alm-pr-check" title={p.done ? tr('diary.pr.undoKept') : tr('diary.pr.kept')} onClick={async () => { await Promises.toggle(chat, p); draw(); }}><Glyph name={s === 'upcoming' ? 'open' : s} /></button>}
    <div className="alm-pr-text"><b>{p.what}</b><small>{[p.time, BY[p.by] || '', s === 'missed' ? tr('diary.pr.missed') : s === 'kept' ? tr('diary.pr.kept') : ''].filter(Boolean).join(' · ')}</small></div>
    {p.later ? <IconBtn ic="trash" title={tr('diary.pr.removeLater')} cls="tiny" onClick={async () => { if (await confirmBox(tr('diary.pr.removeLaterAsk'), tr('diary.remove'), true)) { await Promises.remove(chat, p); draw(); } }} /> : <IconBtn ic="edit" title={tr('diary.fix')} cls="tiny" onClick={async () => { if (await promiseDialog(chat, p)) draw(); }} />}
  </div>; };
  return <section className="alm-detail" ref={elRef}>
    <header className="alm-detail-head"><div className="alm-date"><b>{k.pad(date.getDate())}</b><span>{getLang() === 'ko' ? `${date.getMonth() + 1}월 · ${k.WEEK[date.getDay()]}요일` : `${fmtDate(date, { month: 'long' })} · ${fmtDate(date, { weekday: 'long' })}`}<small>{rel}</small></span></div>
      <div className="alm-phase"><Moon size={20} date={date} /><span>{ph.name}</span></div><span className="alm-sp" />
      {d.n ? <span className="alm-count">{tn('diary.cell.msgs', d.n)}<small>{tr('diary.day.split', { user: d.user, char: who(chat).char, ai: d.ai })}</small></span> : <span className="alm-count dim">{tr('diary.day.none')}</span>}</header>
    <div className="alm-acts">{d.firstId ? <Btn label={tr('diary.day.goChat')} ic="chat" onClick={() => void jumpTo(chat.id, d.firstId)} /> : null}<Btn label={tr('diary.promise.add')} ic="plus" cls="ghost" onClick={async () => { if (await promiseDialog(chat, null, { date: key })) draw(); }} />
      {d.n >= 2 && !d.dreams.length ? <BusyBtn label={tr('diary.day.dream')} ic="moon" cls="ghost" busy={tr('diary.day.dreaming')} run={async () => { const r = await dreamOf(chat, msgs, key); draw(); open(r.id); }} /> : null}</div>
    {d.promises.length ? sec(tr('diary.pstate.upcoming'), d.promises.length, d.promises.map(prow)) : null}
    {d.diary.length ? sec(tr('diary.type.diary'), d.diary.length, d.diary.map(e => <button key={e.id} className="alm-entry" onClick={() => open(e.id)}><Glyph name="diary" /><div><b>{e.title || tr('diary.untitledNight')}</b><p>{String(e.text).replace(/\s+/g, ' ').slice(0, 150)}</p></div>{e.note ? <i className="alm-chip">{e.answer ? tr('diary.exchange.withAnswer') : tr('diary.exchange.title')}</i> : null}</button>)) : null}
    {d.dreams.length ? sec(tr('diary.type.dream'), 0, d.dreams.map(e => <button key={e.id} className="alm-entry dream" onClick={() => open(e.id)}><Glyph name="dream" /><div><b>{e.title || tr('diary.untitledDream')}</b><p>{String(e.text).replace(/\s+/g, ' ').slice(0, 150)}</p></div><i className="alm-chip">{tr('diary.notCanon')}</i></button>)) : null}
    {d.keepsakes.length ? sec(tr('diary.legend.scene'), d.keepsakes.length, <div className="alm-keeps">{d.keepsakes.map(x => { const src = x.photo && Illust.data(x.photo); return <div key={x.id} className="alm-keep"><Ticket k={x} onClick={() => open(x.id)} />{src ? <Polaroid src={src} onClick={() => void jumpTo(chat.id, x.id)} title={tr('diary.goScene')} /> : null}</div>; })}</div>) : null}
    {pics.length ? sec(tr('diary.stat.photos'), pics.length, <div className="alm-pics">{pics.slice(0, 12).map((p, i) => <Polaroid key={i} src={p.src} title={p.title || tr('diary.day.seeInChat')} onClick={() => void jumpTo(chat.id, p.msgId)} />)}{pics.length > 12 ? <small className="hint">{tn('diary.day.morePics', pics.length - 12)}</small> : null}</div>) : null}
    {!d.n && !d.promises.length && !d.diary.length && !d.dreams.length && !d.keepsakes.length ? <p className="hint">{gap >= 0 ? tr('diary.day.emptyFuture') : tr('diary.day.emptyPast')}</p> : null}
  </section>;
}

// ════════ 약속 수첩 ════════
export function PromisesTab({ arg }: { arg: DiaryArg }) {
  const draw = useDraw();
  const [chat, setChat] = useState(() => { if (arg.chatId) view.chatId = arg.chatId; const c = defaultChat(); if (c) view.chatId = c.id; return c; });
  const [shown, setShown] = useState<Record<string, number>>({ missed: 12, kept: 12, upcoming: 40 });
  useEffect(() => core.on('almanac:changed', draw), [draw]);
  const k = K, today = k.dayKey(now()), all = view.scope === 'all' || !chat;
  interface Row { p: PromiseRec; c: DChat; s: PromiseState }
  const rows: Row[] = (all ? S.chats : chat ? [chat] : []).flatMap(c => Promises.of(c).map(p => ({ p, c, s: k.promiseState(p, today) })));
  const by = (s: PromiseState) => rows.filter(r => r.s === s), up = by('upcoming').sort((x, z) => x.p.date.localeCompare(z.p.date)), missed = by('missed').sort((x, z) => z.p.date.localeCompare(x.p.date)), kept = by('kept').sort((x, z) => z.p.date.localeCompare(x.p.date));
  const toCal = (c: DChat, p: PromiseRec) => go('diary', { tab: 'calendar', chatId: c.id, day: p.date });
  const row = ({ p, c, s }: Row) => { const d = k.keyDate(p.date), gap = k.diffDays(today, p.date); return <div key={c.id + p.id} className={`alm-prow ${s}`}>
    <button className="alm-pdate" title={tr('diary.seeCal')} onClick={() => toCal(c, p)}><b>{getLang() === 'ko' ? `${k.pad(d.getMonth() + 1)}.${k.pad(d.getDate())}` : fmtDate(d, { month: '2-digit', day: '2-digit' })}</b><small>{`${k.weekLabel(d.getDay())} · ${gap === 0 ? tr('diary.today') : gap > 0 ? `D-${gap}` : tn('diary.daysAgo', -gap)}`}</small></button>
    <div className="alm-ptext"><b>{p.what}</b><small>{[p.time, all ? `${namesOf(c)} · ${roomOf(c)}` : '', BY[p.by] || ''].filter(Boolean).join(' · ')}</small></div>
    {s === 'missed' ? <Glyph name="missed" title={tr('diary.pstate.missed')} /> : null}
    {p.later ? null : <button className="alm-pr-check" title={p.done ? tr('diary.pr.undo') : tr('diary.pr.kept')} onClick={() => void Promises.toggle(c, p)}><Glyph name={p.done ? 'kept' : 'open'} /></button>}
    <IconBtn ic="more" title={tr('common.more')} cls="tiny" onClick={e => menu(e.currentTarget, [!p.later && { label: tr('diary.fix'), ic: 'edit', onclick: () => void promiseDialog(c, p) }, { label: tr('diary.seeCal'), ic: 'moon', onclick: () => toCal(c, p) }, !!p.msgId && { label: tr('diary.pr.goPromiseChat'), ic: 'chat', onclick: () => void jumpTo(c.id, p.msgId) }, !p.msgId && { label: tr('diary.goChat'), ic: 'chat', onclick: () => go('chat', c.id) },
      s === 'missed' && !p.later && { label: p.excused ? tr('diary.pr.unexcuse') : tr('diary.pr.excuse'), ic: 'heart', onclick: async () => { p.excused = !p.excused; await save(c); changed(c); } }, '-', { label: tr('diary.remove'), ic: 'trash', danger: true, onclick: async () => { if (await confirmBox(tr('diary.pr.removeAsk'), tr('diary.remove'), true)) await Promises.remove(c, p); } }])} />
  </div>; };
  const sec = (title: string, list: Row[], key: string, note?: string) => list.length ? <div className="alm-psec"><h3 className="form-sec">{title}<i className="badge">{String(list.length)}</i></h3>{note ? <small className="hint">{note}</small> : null}{list.slice(0, shown[key] || 99).map(row)}{list.length > (shown[key] || 99) ? <Btn label={tr('diary.moreN', { count: list.length - shown[key] })} cls="ghost wide" onClick={() => setShown({ ...shown, [key]: shown[key] + 40 })} /> : null}</div> : null;
  return <>
    <div className="alm-ptop">{chat ? <div className="alm-scope"><button className={'chip' + (!all ? ' on' : '')} onClick={() => { view.scope = 'one'; draw(); }}>{`${namesOf(chat)} · ${roomOf(chat)}`}</button><button className={'chip' + (all ? ' on' : '')} onClick={() => { view.scope = 'all'; draw(); }}>{tr('diary.ptab.allChats')}</button><IconBtn ic="search" title={tr('diary.pick.other')} cls="tiny" onClick={() => pickChat({ current: chat.id, onPick: c => { view.scope = 'one'; view.chatId = c.id; setChat(c); setShown({ missed: 12, kept: 12, upcoming: 40 }); } })} /></div> : null}
      <span className="alm-sp" />{chat ? <Btn label={tr('diary.promise.add')} ic="plus" onClick={() => void promiseDialog(chat)} /> : null}
      {chat ? <BusyBtn label={tr('diary.ptab.extract')} ic="sparkle" cls="primary" busy={tr('diary.ptab.finding')} title={tr('diary.ptab.extractTitle', { name: namesOf(chat) })} run={async () => { const r = await extractByCall(chat, await loadChat(chat)); toast(r.added.length ? tn('diary.ptab.added', r.added.length) : r.found.length ? tr('diary.ptab.allThere') : tr('diary.ptab.noneFound')); }} /> : null}
      {chat ? <IconBtn ic="sliders" title={tr('diary.ptab.editPrompt')} cls="tiny" onClick={() => editPrompts(['extract', 'promiseOffer', 'promiseToday', 'promiseMissed'], tr('diary.ptab.promptTitle'))} /> : null}</div>
    {rows.length ? null : <div className="empty"><Glyph name="open" /><p>{tr('diary.ptab.empty')}</p><small className="hint">{tr('diary.ptab.emptyHint')}</small></div>}
    {sec(tr('diary.today'), by('today'), 'today', tr('diary.ptab.todayNote'))}{sec(tr('diary.ptab.upcoming'), up, 'upcoming')}{sec(tr('diary.pstate.missed'), missed, 'missed', A().promiseSulk !== false ? tr('diary.ptab.missedSulk') : tr('diary.ptab.missedNote'))}{sec(tr('diary.pstate.kept'), kept, 'kept')}
  </>;
}

// ════════ 설정 ════════
export function SettingsTab() {
  const defs: FieldDef[] = [{ section: tr('diary.tab.calendar') },
    { k: 'almanac.goal', label: tr('diary.set.goal.label'), type: 'num', min: 3, max: 28, step: 1, ph: '15', half: true, hint: tr('diary.set.goal.hint') },
    { k: 'almanac.weekStart', label: tr('diary.set.weekStart'), type: 'select', opts: [[0, tr('diary.set.sunday')], [1, tr('diary.set.monday')]], half: true },
    { k: 'almanac.keepsakeToast', label: tr('diary.set.keepsakeToast'), type: 'check' },
    { section: tr('diary.tab.promises') },
    { k: 'almanac.promiseInject', label: tr('diary.set.promiseInject'), type: 'check' },
    { k: 'almanac.promiseSulk', label: tr('diary.set.promiseSulk'), type: 'check' },
    { k: 'almanac.promiseTag', label: tr('diary.set.promiseTag.label'), type: 'select', opts: [['talk', tr('diary.set.promiseTag.talk')], ['all', tr('diary.set.promiseTag.all')], ['off', tr('diary.set.promiseTag.off')]], hint: tr('diary.set.promiseTag.hint') },
    { section: tr('diary.exchange.title') },
    { k: 'almanac.exchangeInject', label: tr('diary.set.exchangeInject'), type: 'check' },
    { section: tr('diary.set.prompts') }, DIARY_DEF, ...promptDefs(Object.keys(PROMPTS)), moodDef];
  const onChange = () => { const al = S.settings.almanac ||= {}; if (!al.goal) delete al.goal; al.weekStart = +(al.weekStart ?? 0) || 0; S.set({}); changed(null); };
  return <div className="card"><p className="hint">{tr('diary.set.hint')}</p><Form obj={S.settings} defs={defs} onChange={onChange} /></div>;
}

// ════════ 책장 ════════
const hue = (s: string) => { let n = 0; for (const c of String(s)) n = (n * 31 + c.charCodeAt(0)) % 360; return n; };
export function Shelf() {
  const [q, setQ] = useState('');
  const chats = S.chats, named = (c: DChat) => charOf(c)?.name || '';
  const t = q.trim().toLowerCase(), all = chats.filter(c => pageCount(c) && charOf(c)).sort((a, b) => lastTs(b) - lastTs(a));
  const books = all.filter(c => !t || `${named(c)} ${c.name || ''}`.toLowerCase().includes(t));
  const recent = [...chats].sort((a, b) => b.updatedAt - a.updatedAt).filter(c => !pageCount(c) && charOf(c)).slice(0, 6);
  const open = (c: DChat) => void openDiary(c);
  return <>
    <p className="hint">{tr('diary.shelf.hint')}</p>
    {chats.filter(pageCount).length > 10 ? <input className="inp search" placeholder={tr('diary.shelf.search')} value={q} onChange={e => setQ(e.target.value)} /> : null}
    <div className="alm-shelf-host">
      {books.length ? <div className="shelf">{books.slice(0, 120).map(c => { const n = pageCount(c), room = (c.name || '').trim(); return <button key={c.id} className="spine" style={{ '--hue': hue(named(c)) } as CSSProperties} title={`${named(c)}${room ? ' · ' + room : ''} · ${tr('diary.shelf.spine', { pages: tn('diary.pages', n), diary: (c.diary || []).length })}`} onClick={() => open(c)}><i /><b>{named(c)}</b><small>{tn('diary.pages', n)}</small><Moon size={18} date={new Date(lastTs(c) || now())} /></button>; })}</div>
        : <div className="empty"><Moon size={46} /><p>{all.length ? tr('diary.shelf.noHit') : tr('diary.shelf.none')}</p></div>}
      {books.length > 120 ? <small className="hint">{tn('diary.shelf.many', books.length)}</small> : null}
      <div className="col"><h3 className="form-sec">{tr('diary.shelf.new')}</h3><div className="row wrap">{recent.map(c => <button key={c.id} className="chip" onClick={() => open(c)}>{`${named(c)}${c.name ? ' · ' + c.name.slice(0, 14) : ''}`}</button>)}<button className="chip" onClick={() => pickChat({ title: tr('diary.shelf.pickTitle'), onPick: open })}>{tr('diary.shelf.pickOther')}</button></div></div>
    </div>
  </>;
}
