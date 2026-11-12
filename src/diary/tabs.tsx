// 일기장 화면의 네 탭: 달이 차오르는 달력 · 책장 · 약속 수첩 · 설정
import { useEffect, useReducer, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { Avatar, Btn, Icon, IconBtn, Moon } from '../kit';
import { Form, confirmBox, menu, toast, type FieldDef } from '../ui';
import { Illust, K, S, core, ui } from './bridge';
import { openDiary } from './Book';
import { editPrompts, pickChat, promiseDialog, showLetter } from './dialogs';
import {
  A, BY, DIARY_DEF, Promises, changed, charOf, defaultChat, dreamOf, errMsg, extractByCall, groupsOf, jumpTo, lastTs, levelOf, loadChat, moodDef, namesOf, pageCount, photoSrc, promptDefs, PROMPTS,
  roomLine, roomOf, save, syncChat, view, who, writeLetter,
} from './logic';
import { BusyBtn, Glyph, MoonDial, MoonMini, Polaroid, Ticket, useAlive } from './parts';
import type { DChat, DayRec, Days, GridCell, Msg, PromiseRec, PromiseState } from './types';

export interface DiaryArg { tab?: string; chatId?: string; day?: string }
const useDraw = () => useReducer((x: number) => x + 1, 0)[1];
const now = () => core().now();

// ════════ 달이 차오르는 달력 ════════
export function Calendar({ arg }: { arg: DiaryArg }) {
  const draw = useDraw(), alive = useAlive(), token = useRef(0), detailEl = useRef<HTMLElement>(null);
  const [data, setData] = useState<{ chat: DChat; msgs: Msg[] } | 'none' | null>(null), [err, setErr] = useState('');
  const cur = useRef<DChat | null>(null);
  const load = async (patch: DiaryArg = {}) => {
    const k = K();
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
    return core().on<DChat | null>('almanac:changed', c => { if (cur.current && (!c || c.id === cur.current.id)) draw(); });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (err) return <div className="empty"><p>{'달력을 펼치지 못했어요: ' + err}</p></div>;
  if (data === 'none') return <div className="empty"><Moon size={46} /><p>아직 대화가 없어요. 대화를 시작하면 달이 차오르기 시작합니다.</p><Btn label="캐릭터 보러 가기" ic="home" cls="primary" onClick={() => ui().go('home')} /></div>;
  if (!data) return <div className="alm-loading"><Moon size={28} /><span>달력을 펼치는 중…</span></div>;

  const { chat, msgs } = data, k = K(), today = k.dayKey(now());
  const a = A(), days = k.collectDays(chat, msgs), st = k.monthStats(days, view.mk, a.goal, today), [y, mo] = view.mk.split('-').map(Number), ch = charOf(chat);
  const letter = (chat.letters || []).find(l => l.month === view.mk);
  const askLetter = async (again: boolean) => {
    if (again) toast('편지를 쓰는 중이에요…');
    const rec = await writeLetter(chat, msgs, view.mk); if (!alive.current) return;
    draw(); showLetter(chat, rec, { onAgain });
  };
  const onAgain = () => void askLetter(true).catch(e => toast(errMsg(e), 'err'));
  const pick = () => pickChat({ current: chat.id, onPick: c => { view.sel = ''; reopen({ chatId: c.id }); } });

  // ── 누구와의 달력인가
  const others = groupsOf().filter(g => g.chat.charIds.join('+') !== chat.charIds.join('+')).slice(0, 8);
  const whoBar = <div className="alm-who">
    <button className="alm-me" title="다른 대화 고르기" onClick={pick}><Avatar o={ch || { name: namesOf(chat) }} /><div><b>{namesOf(chat)}</b><small>{`${roomOf(chat)} · ${roomLine(chat)}`}</small></div><Icon name="down" size={15} /></button>
    {others.length ? <div className="alm-others">{others.map(g => <button key={g.chat.id} title={`${g.name} · ${roomLine(g.chat)}`} onClick={() => { view.sel = ''; reopen({ chatId: g.chat.id }); }}><Avatar o={g.ch || { name: g.name }} cls="sm" /><span>{g.name}</span></button>)}</div> : null}
    <div className="alm-who-side"><IconBtn ic="search" title="대화 고르기" onClick={pick} /><IconBtn ic="chat" title="이 대화로 가기" onClick={() => ui().go('chat', chat.id)} /><IconBtn ic="book" title="일기장 펼치기" onClick={() => core().emit('diary:open', chat)} /></div>
  </div>;

  // ── 그달의 달
  const say = st.full ? '보름달이 떴어요' : st.when === 'future' ? '아직 오지 않은 달이에요' : st.when === 'past' ? (st.active ? `${st.active}일에서 멈춘 달` : '이야기가 없던 달') : st.active ? `보름까지 ${st.left}일${st.reachable ? '' : ' — 이번 달에는 닿지 않아요'}` : '오늘 이야기하면 달이 뜨기 시작해요';
  const letterBox = letter ? <button className="alm-env has" onClick={() => showLetter(chat, letter, { onAgain })}><Glyph name="letter" /><div><b>{`${mo}월의 편지 읽기`}</b><small>{letter.title || `${new Date(letter.ts).toLocaleDateString('ko-KR')}에 받음`}</small></div></button>
    : st.full ? <div className="alm-env ready"><BusyBtn label="이달의 편지 받기 · 호출 1회" ic="feather" cls="primary" busy="편지를 쓰는 중…" run={() => askLetter(false)} /><IconBtn ic="sliders" title="편지 지시문 고치기" cls="tiny" onClick={() => editPrompts(['letter'], '이달의 편지 지시문')} /><small>{`${ch?.name || '캐릭터'}이(가) 이달의 일기와 기억에서 뽑아 편지 한 통을 씁니다.`}</small></div>
      : <div className="alm-env locked"><Glyph name="letter" /><div><b>이달의 편지</b><small>{st.when === 'past' ? '보름을 채우지 못한 달이에요.' : `보름(${st.target}일)이 되면 열려요.`}</small></div></div>;
  const stats: [string, number | string][] = [['메시지', st.msgs], ['이어진 날', st.streak ? `${st.streak}일` : 0], ['일기', st.diary], ['사진', st.photos], ['기념품', st.keepsakes], ['꿈', st.dreams]];
  const moonPanel = <aside className="alm-moon">
    <div className="alm-moon-head"><b>{k.pad(mo)}</b><span>{k.MONTHS_EN[mo - 1]}<small>{String(y)}</small></span></div>
    <MoonDial st={st} />
    <div className="alm-moon-cap"><b>{`${st.active}`}<i>{` / ${st.target}일`}</i></b><span>{k.phaseName(k.fillToPhase(st.fill))}</span><small>{say}</small></div>
    <dl className="alm-stats">{stats.filter(([, v]) => v).map(([key, v]) => <div key={key}><dt>{key}</dt><dd>{String(v)}</dd></div>)}</dl>
    {letterBox}
  </aside>;

  // ── 달력 지면
  const weekStart = +(a.weekStart ?? 0) || 0, grid = k.monthGrid(view.mk, weekStart), wk = Array.from({ length: 7 }, (_, i) => (i + weekStart) % 7);
  const STATE_TITLE: Record<PromiseState, string> = { kept: '지킨 약속', missed: '지나간 약속', today: '오늘의 약속', upcoming: '약속' };
  const cell = (c: GridCell, ci: number, week: GridCell[]) => {
    const d = days.get(c.key), n = d?.n || 0, on = n > 0 && c.inMonth, nextOn = ci < 6 && week[ci + 1].inMonth && (days.get(week[ci + 1].key)?.n || 0) > 0, prevOn = ci > 0 && week[ci - 1].inMonth && (days.get(week[ci - 1].key)?.n || 0) > 0;
    const marks: ReactNode[] = d && c.inMonth ? [d.diary.length ? <Glyph key="d" name="diary" title={`일기 ${d.diary.length}`} /> : null, d.photos.length ? <Glyph key="p" name="photo" title={`사진 ${d.photos.length}`} /> : null, d.keepsakes.length ? <Glyph key="s" name="scene" title={`장면 기념품 ${d.keepsakes.length}`} /> : null, d.dreams.length ? <Glyph key="m" name="dream" title="꿈" /> : null,
      ...[...new Set(d.promises.map(p => k.promiseState(p, today)))].map(s => <Glyph key={s} name={s === 'upcoming' ? 'open' : s} title={STATE_TITLE[s]} />)].filter(Boolean) : [];
    const label = `${k.koDate(c.key)}${n ? ` · 메시지 ${n}개` : ''}${d?.promises.length ? ` · 약속 ${d.promises.length}` : ''}`;
    const cls = `alm-day${c.inMonth ? '' : ' out'}${on ? ` on lv${levelOf(n)}` : ''}${c.key === today ? ' today' : ''}${c.key === view.sel ? ' sel' : ''}${on && nextOn ? ' link-r' : ''}${on && prevOn ? ' link-l' : ''}${c.dow === 0 ? ' sun' : ''}`;
    return <button key={c.key} className={cls} title={label} aria-label={label} onClick={() => { view.sel = c.key; if (!c.inMonth) view.mk = c.key.slice(0, 7); draw(); requestAnimationFrame(() => detailEl.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })); }}>
      <span className="alm-n">{String(c.d)}</span>{on ? <i className="alm-dot" /> : null}{on ? <span className="alm-cnt">{String(n)}</span> : null}{marks.length ? <span className="alm-marks">{marks.slice(0, 4)}{marks.length > 4 ? <em>+</em> : null}</span> : null}
    </button>;
  };
  const go = (mk: string, sel = '') => { view.mk = mk; view.sel = sel; draw(); };
  const addPromise = async (date: string) => { if (await promiseDialog(chat, null, { date })) draw(); };
  const cal = <div className="alm-cal">
    <header className="alm-cal-head"><IconBtn ic="left" title="앞 달" onClick={() => go(k.shiftMonth(view.mk, -1))} /><h2>{`${y}년 ${mo}월`}</h2><IconBtn ic="right" title="다음 달" onClick={() => go(k.shiftMonth(view.mk, 1))} />
      <span className="alm-sp" />{view.mk !== k.monthKey(now()) || view.sel !== today ? <Btn label="오늘" cls="ghost" onClick={() => go(k.monthKey(now()), today)} /> : null}<Btn label="약속 적기" ic="plus" onClick={() => void addPromise(view.sel || today)} /></header>
    <div className="alm-week">{wk.map(i => <span key={i} className={i === 0 ? 'sun' : undefined}>{k.WEEK[i]}</span>)}</div>
    <div className="alm-grid" style={{ '--rows': grid.length } as CSSProperties}>{grid.flatMap(week => week.map((c, ci) => cell(c, ci, week)))}</div>
    <div className="alm-legend">{([['diary', '일기'], ['photo', '사진'], ['scene', '장면 기념품'], ['dream', '꿈'], ['open', '약속'], ['kept', '지킨 약속'], ['missed', '지나간 약속']] as const).map(([g, l]) => <span key={g}><Glyph name={g} />{l}</span>)}<span className="alm-dots"><i className="alm-dot demo" /><i className="alm-dot demo d2" /><i className="alm-dot demo d3" />대화한 날 (점이 클수록 많이)</span></div>
  </div>;

  // ── 한 해의 달들
  const yearBar = <div className="alm-year"><IconBtn ic="left" title="앞 해" cls="tiny" onClick={() => go(`${y - 1}-${k.pad(mo)}`)} /><b>{String(y)}</b><IconBtn ic="right" title="다음 해" cls="tiny" onClick={() => go(`${y + 1}-${k.pad(mo)}`)} />
    <div className="alm-months">{Array.from({ length: 12 }, (_, i) => { const mk = `${y}-${k.pad(i + 1)}`, s = k.monthStats(days, mk, a.goal, today), has = (chat.letters || []).some(l => l.month === mk); return <button key={mk} className={[mk === view.mk && 'on', s.active && 'has'].filter(Boolean).join(' ') || undefined} title={`${i + 1}월 · ${s.active}일${s.full ? ' · 보름달' : ''}${has ? ' · 편지' : ''}`} onClick={() => go(mk)}><MoonMini fill={s.fill} size={22} /><span>{`${i + 1}`}</span>{has ? <i /> : null}</button>; })}</div></div>;

  return <>{whoBar}<section className="alm-sheet">{moonPanel}{cal}</section>{yearBar}<DayDetail chat={chat} msgs={msgs} days={days} today={today} draw={draw} elRef={detailEl} /></>;
}

/** 고른 날 */
function DayDetail({ chat, msgs, days, today, draw, elRef }: { chat: DChat; msgs: Msg[]; days: Days; today: string; draw: () => void; elRef: React.RefObject<HTMLElement | null> }) {
  const k = K(), key = view.sel;
  if (!key) return <div className="alm-detail none" ref={elRef as React.RefObject<HTMLDivElement | null>}><p className="hint">날짜를 누르면 그날의 일기 · 사진 · 기념품 · 약속이 여기에 펼쳐져요.</p></div>;
  const blank: DayRec = { key, n: 0, user: 0, ai: 0, firstId: '', lastId: '', photos: [], diary: [], dreams: [], keepsakes: [], promises: [] };
  const d = days.get(key) || blank, date = k.keyDate(key), ph = ui().moonPhase(date), gap = k.diffDays(today, key);
  const rel = gap === 0 ? '오늘' : gap === 1 ? '내일' : gap === -1 ? '어제' : gap > 0 ? `${gap}일 뒤` : `${-gap}일 전`;
  const pics = d.photos.map(p => ({ ...p, src: photoSrc(p) })).filter(p => p.src);
  const sec = (title: string, n: number, kids: ReactNode) => <div className="alm-sec"><h4>{title}{n ? <i>{String(n)}</i> : null}</h4>{kids}</div>;
  const open = (at: string) => core().emit('diary:open', { chat, at });
  const prow = (p: PromiseRec) => { const s = k.promiseState(p, today); return <div key={p.id} className={`alm-pr ${s}`}>
    {p.later ? <Glyph name="today" title="연락 약속" /> : <button className="alm-pr-check" title={p.done ? '지킨 약속 — 눌러서 되돌리기' : '지켰어요'} onClick={async () => { await Promises.toggle(chat, p); draw(); }}><Glyph name={s === 'upcoming' ? 'open' : s} /></button>}
    <div className="alm-pr-text"><b>{p.what}</b><small>{[p.time, BY[p.by] || '', s === 'missed' ? '지켜지지 않고 지나갔어요' : s === 'kept' ? '지켰어요' : ''].filter(Boolean).join(' · ')}</small></div>
    {p.later ? <IconBtn ic="trash" title="이 연락 약속 지우기" cls="tiny" onClick={async () => { if (await confirmBox('이 연락 약속을 지울까요?', '지우기', true)) { await Promises.remove(chat, p); draw(); } }} /> : <IconBtn ic="edit" title="고치기" cls="tiny" onClick={async () => { if (await promiseDialog(chat, p)) draw(); }} />}
  </div>; };
  return <section className="alm-detail" ref={elRef}>
    <header className="alm-detail-head"><div className="alm-date"><b>{k.pad(date.getDate())}</b><span>{`${date.getMonth() + 1}월 · ${k.WEEK[date.getDay()]}요일`}<small>{rel}</small></span></div>
      <div className="alm-phase"><Moon size={20} date={date} /><span>{ph.name}</span></div><span className="alm-sp" />
      {d.n ? <span className="alm-count">{`메시지 ${d.n}개`}<small>{`나 ${d.user} · ${who(chat).char} ${d.ai}`}</small></span> : <span className="alm-count dim">이야기가 없던 날</span>}</header>
    <div className="alm-acts">{d.firstId ? <Btn label="이날의 대화로 가기" ic="chat" onClick={() => void jumpTo(chat.id, d.firstId)} /> : null}<Btn label="약속 적기" ic="plus" cls="ghost" onClick={async () => { if (await promiseDialog(chat, null, { date: key })) draw(); }} />
      {d.n >= 2 && !d.dreams.length ? <BusyBtn label="이날의 꿈 꾸기 · 호출 1회" ic="moon" cls="ghost" busy="꿈을 꾸는 중…" run={async () => { const r = await dreamOf(chat, msgs, key); draw(); open(r.id); }} /> : null}</div>
    {d.promises.length ? sec('약속', d.promises.length, d.promises.map(prow)) : null}
    {d.diary.length ? sec('일기', d.diary.length, d.diary.map(e => <button key={e.id} className="alm-entry" onClick={() => open(e.id)}><Glyph name="diary" /><div><b>{e.title || '제목 없는 밤'}</b><p>{String(e.text).replace(/\s+/g, ' ').slice(0, 150)}</p></div>{e.note ? <i className="alm-chip">{e.answer ? '교환 일기 · 답글' : '교환 일기'}</i> : null}</button>)) : null}
    {d.dreams.length ? sec('꿈', 0, d.dreams.map(e => <button key={e.id} className="alm-entry dream" onClick={() => open(e.id)}><Glyph name="dream" /><div><b>{e.title || '이름 없는 꿈'}</b><p>{String(e.text).replace(/\s+/g, ' ').slice(0, 150)}</p></div><i className="alm-chip">정사가 아님</i></button>)) : null}
    {d.keepsakes.length ? sec('장면 기념품', d.keepsakes.length, <div className="alm-keeps">{d.keepsakes.map(x => { const src = x.photo && Illust().data(x.photo); return <div key={x.id} className="alm-keep"><Ticket k={x} onClick={() => open(x.id)} />{src ? <Polaroid src={src} onClick={() => void jumpTo(chat.id, x.id)} title="이 장면으로 가기" /> : null}</div>; })}</div>) : null}
    {pics.length ? sec('사진', pics.length, <div className="alm-pics">{pics.slice(0, 12).map((p, i) => <Polaroid key={i} src={p.src} title={p.title || '대화에서 보기'} onClick={() => void jumpTo(chat.id, p.msgId)} />)}{pics.length > 12 ? <small className="hint">{`외 ${pics.length - 12}장 — 대화에서 볼 수 있어요.`}</small> : null}</div>) : null}
    {!d.n && !d.promises.length && !d.diary.length && !d.dreams.length && !d.keepsakes.length ? <p className="hint">{gap >= 0 ? '아직 비어 있는 날이에요. 약속을 적어 둘 수 있어요.' : '이날은 남은 것이 없어요.'}</p> : null}
  </section>;
}

// ════════ 약속 수첩 ════════
export function PromisesTab({ arg }: { arg: DiaryArg }) {
  const draw = useDraw();
  const [chat, setChat] = useState(() => { if (arg.chatId) view.chatId = arg.chatId; const c = defaultChat(); if (c) view.chatId = c.id; return c; });
  const [shown, setShown] = useState<Record<string, number>>({ missed: 12, kept: 12, upcoming: 40 });
  useEffect(() => core().on('almanac:changed', draw), [draw]);
  const k = K(), today = k.dayKey(now()), all = view.scope === 'all' || !chat;
  interface Row { p: PromiseRec; c: DChat; s: PromiseState }
  const rows: Row[] = (all ? S().chats : chat ? [chat] : []).flatMap(c => Promises.of(c).map(p => ({ p, c, s: k.promiseState(p, today) })));
  const by = (s: PromiseState) => rows.filter(r => r.s === s), up = by('upcoming').sort((x, z) => x.p.date.localeCompare(z.p.date)), missed = by('missed').sort((x, z) => z.p.date.localeCompare(x.p.date)), kept = by('kept').sort((x, z) => z.p.date.localeCompare(x.p.date));
  const toCal = (c: DChat, p: PromiseRec) => ui().go('diary', { tab: 'calendar', chatId: c.id, day: p.date });
  const row = ({ p, c, s }: Row) => { const d = k.keyDate(p.date), gap = k.diffDays(today, p.date); return <div key={c.id + p.id} className={`alm-prow ${s}`}>
    <button className="alm-pdate" title="달력에서 보기" onClick={() => toCal(c, p)}><b>{`${k.pad(d.getMonth() + 1)}.${k.pad(d.getDate())}`}</b><small>{`${k.WEEK[d.getDay()]} · ${gap === 0 ? '오늘' : gap > 0 ? `D-${gap}` : `${-gap}일 전`}`}</small></button>
    <div className="alm-ptext"><b>{p.what}</b><small>{[p.time, all ? `${namesOf(c)} · ${roomOf(c)}` : '', BY[p.by] || ''].filter(Boolean).join(' · ')}</small></div>
    {s === 'missed' ? <Glyph name="missed" title="지나간 약속" /> : null}
    {p.later ? null : <button className="alm-pr-check" title={p.done ? '되돌리기' : '지켰어요'} onClick={() => void Promises.toggle(c, p)}><Glyph name={p.done ? 'kept' : 'open'} /></button>}
    <IconBtn ic="more" title="더 보기" cls="tiny" onClick={e => menu(e.currentTarget, [!p.later && { label: '고치기', ic: 'edit', onclick: () => void promiseDialog(c, p) }, { label: '달력에서 보기', ic: 'moon', onclick: () => toCal(c, p) }, !!p.msgId && { label: '약속한 대화로 가기', ic: 'chat', onclick: () => void jumpTo(c.id, p.msgId) }, !p.msgId && { label: '이 대화로 가기', ic: 'chat', onclick: () => ui().go('chat', c.id) },
      s === 'missed' && !p.later && { label: p.excused ? '다시 서운해해도 돼요' : '서운해하지 않게 넘어가기', ic: 'heart', onclick: async () => { p.excused = !p.excused; await save(c); changed(c); } }, '-', { label: '지우기', ic: 'trash', danger: true, onclick: async () => { if (await confirmBox('이 약속을 지울까요?', '지우기', true)) await Promises.remove(c, p); } }])} />
  </div>; };
  const sec = (title: string, list: Row[], key: string, note?: string) => list.length ? <div className="alm-psec"><h3 className="form-sec">{title}<i className="badge">{String(list.length)}</i></h3>{note ? <small className="hint">{note}</small> : null}{list.slice(0, shown[key] || 99).map(row)}{list.length > (shown[key] || 99) ? <Btn label={`더 보기 (${list.length - shown[key]})`} cls="ghost wide" onClick={() => setShown({ ...shown, [key]: shown[key] + 40 })} /> : null}</div> : null;
  return <>
    <div className="alm-ptop">{chat ? <div className="alm-scope"><button className={'chip' + (!all ? ' on' : '')} onClick={() => { view.scope = 'one'; draw(); }}>{`${namesOf(chat)} · ${roomOf(chat)}`}</button><button className={'chip' + (all ? ' on' : '')} onClick={() => { view.scope = 'all'; draw(); }}>모든 대화</button><IconBtn ic="search" title="다른 대화 고르기" cls="tiny" onClick={() => pickChat({ current: chat.id, onPick: c => { view.scope = 'one'; view.chatId = c.id; setChat(c); setShown({ missed: 12, kept: 12, upcoming: 40 }); } })} /></div> : null}
      <span className="alm-sp" />{chat ? <Btn label="약속 적기" ic="plus" onClick={() => void promiseDialog(chat)} /> : null}
      {chat ? <BusyBtn label="대화에서 지금 뽑기 · 호출 1회" ic="sparkle" cls="primary" busy="찾는 중…" title={`${namesOf(chat)}와(과)의 최근 대화 60개에서 날짜가 있는 약속을 찾아 적습니다`} run={async () => { const r = await extractByCall(chat, await loadChat(chat)); toast(r.added.length ? `약속 ${r.added.length}개를 적었어요.` : r.found.length ? '찾은 약속은 이미 모두 적혀 있어요.' : '날짜가 있는 약속을 찾지 못했어요.'); }} /> : null}
      {chat ? <IconBtn ic="sliders" title="뽑기 지시문 고치기" cls="tiny" onClick={() => editPrompts(['extract', 'promiseOffer', 'promiseToday', 'promiseMissed'], '약속 수첩 지시문')} /> : null}</div>
    {rows.length ? null : <div className="empty"><Glyph name="open" /><p>아직 적힌 약속이 없어요.</p><small className="hint">대화 모드에서 날짜를 정해 약속하면 캐릭터가 직접 적어 두고, 여기서 직접 적거나 대화에서 뽑을 수도 있어요.</small></div>}
    {sec('오늘', by('today'), 'today', '오늘 이 대화방을 열면 캐릭터가 먼저 꺼냅니다.')}{sec('다가오는 약속', up, 'upcoming')}{sec('지나간 약속', missed, 'missed', A().promiseSulk !== false ? '지켜지지 않고 지나간 약속이에요. 캐릭터가 한 번 서운해할 수 있어요. 지켰다면 동그라미를 눌러 주세요.' : '지켜지지 않고 지나간 약속이에요.')}{sec('지킨 약속', kept, 'kept')}
  </>;
}

// ════════ 설정 ════════
export function SettingsTab() {
  const defs: FieldDef[] = [{ section: '달력' },
    { k: 'almanac.goal', label: '한 달에 며칠 대화하면 보름달이 되나요', type: 'num', min: 3, max: 28, step: 1, ph: '15', half: true, hint: '비워 두면 15일(보름). 그달의 날 수보다 크면 그달의 날 수로.' },
    { k: 'almanac.weekStart', label: '한 주의 시작', type: 'select', opts: [[0, '일요일'], [1, '월요일']], half: true },
    { k: 'almanac.keepsakeToast', label: '장면이 닫혀 기념품이 꽂힐 때 알려 주기', type: 'check' },
    { section: '약속 수첩' },
    { k: 'almanac.promiseInject', label: '약속한 날 대화방을 열면 캐릭터가 먼저 꺼내게 하기 (프롬프트에 한 줄)', type: 'check' },
    { k: 'almanac.promiseSulk', label: '지켜지지 않고 지나간 약속을 캐릭터가 한 번 서운해할 수 있게 하기', type: 'check' },
    { k: 'almanac.promiseTag', label: '캐릭터가 약속 태그로 직접 수첩에 적기', type: 'select', opts: [['talk', '대화 모드에서만'], ['all', '모든 대화에서'], ['off', '쓰지 않기']], hint: '켜면 안내문이 프롬프트에 들어갑니다 (약 90토큰). 실제 달력 날짜를 쓰므로 작중 시간이 따로 흐르는 이야기에서는 꺼 두는 편이 좋아요.' },
    { section: '교환 일기' },
    { k: 'almanac.exchangeInject', label: '내가 일기 옆에 적은 글과 답글을 다음 대화에 은근히 반영하기 (적은 뒤 7일 동안)', type: 'check' },
    { section: '지시문' }, DIARY_DEF, ...promptDefs(Object.keys(PROMPTS)), moodDef];
  const onChange = () => { const al = S().settings.almanac ||= {}; if (!al.goal) delete al.goal; al.weekStart = +(al.weekStart ?? 0) || 0; S().set({}); changed(null); };
  return <div className="card"><p className="hint">모델을 따로 부르는 기능은 버튼을 누를 때만 움직이고, 버튼에 "호출 1회"라고 적혀 있습니다. 아래 체크 항목들은 추가 호출 없이 프롬프트에 몇 줄을 더할 뿐입니다.</p><Form obj={S().settings} defs={defs} onChange={onChange} /></div>;
}

// ════════ 책장 ════════
const hue = (s: string) => { let n = 0; for (const c of String(s)) n = (n * 31 + c.charCodeAt(0)) % 360; return n; };
export function Shelf() {
  const [q, setQ] = useState('');
  const chats = S().chats, named = (c: DChat) => charOf(c)?.name || '';
  const t = q.trim().toLowerCase(), all = chats.filter(c => pageCount(c) && charOf(c)).sort((a, b) => lastTs(b) - lastTs(a));
  const books = all.filter(c => !t || `${named(c)} ${c.name || ''}`.toLowerCase().includes(t));
  const recent = [...chats].sort((a, b) => b.updatedAt - a.updatedAt).filter(c => !pageCount(c) && charOf(c)).slice(0, 6);
  const open = (c: DChat) => void openDiary(c);
  return <>
    <p className="hint">캐릭터가 자기 목소리로 그날의 이야기를 적어 두는 일기장입니다. 꿈 · 장면 기념품 · 이달의 편지도 같은 책에 꽂혀요. 대화 화면 위쪽의 책 아이콘으로도 펼칠 수 있어요.</p>
    {chats.filter(pageCount).length > 10 ? <input className="inp search" placeholder="캐릭터나 방 이름으로 일기장 찾기" value={q} onChange={e => setQ(e.target.value)} /> : null}
    <div className="alm-shelf-host">
      {books.length ? <div className="shelf">{books.slice(0, 120).map(c => { const n = pageCount(c), room = (c.name || '').trim(); return <button key={c.id} className="spine" style={{ '--hue': hue(named(c)) } as CSSProperties} title={`${named(c)}${room ? ' · ' + room : ''} · ${n}쪽 (일기 ${(c.diary || []).length})`} onClick={() => open(c)}><i /><b>{named(c)}</b><small>{`${n}쪽`}</small><Moon size={18} date={new Date(lastTs(c) || now())} /></button>; })}</div>
        : <div className="empty"><Moon size={46} /><p>{all.length ? '찾는 일기장이 없어요.' : '아직 쓰인 일기가 없어요.'}</p></div>}
      {books.length > 120 ? <small className="hint">{`일기장이 많아요 (${books.length}권). 이름으로 찾아 좁혀 주세요.`}</small> : null}
      <div className="col"><h3 className="form-sec">새 일기장 펼치기</h3><div className="row wrap">{recent.map(c => <button key={c.id} className="chip" onClick={() => open(c)}>{`${named(c)}${c.name ? ' · ' + c.name.slice(0, 14) : ''}`}</button>)}<button className="chip" onClick={() => pickChat({ title: '어느 대화의 일기장을 펼칠까요', onPick: open })}>다른 대화 고르기…</button></div></div>
    </div>
  </>;
}
