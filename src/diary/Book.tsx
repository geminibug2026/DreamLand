// 꿈 일기장 책: 캐릭터가 자기 목소리로 그날의 이야기를 적어 두는 책. 일기 · 꿈 · 장면 기념품 · 이달의 편지가 시간 순으로 꽂힌다
import { useEffect, useReducer, useRef, type CSSProperties, type MouseEvent, type ReactNode } from 'react';
import { flushSync } from 'react-dom';
import { Btn, Icon, IconBtn, Moon, mountInto } from '../kit';
import { confirmBox, menu, promptBox } from '../ui';
import { bindDialog, editPrompts, fontDialog, memoDialog } from './dialogs';
import { DIARY_DEF, MEMO_DEF, TYPE, answerNote, book, charOf, dreamOf, fontOf, fontStyle, jumpTo, loadChat, pagesOf, save, syncChat, tellErr, titleOf, writeDiary } from './logic';
import { MoonDial, Paras, Polaroid, Ticket } from './parts';
import type { DChar as Char, DChat, DiaryEntry, Msg, Page } from './types';
import { Illust } from '../lib/illust';
import { S } from '../lib/core';
import { moonPhase } from '../lib/moon';
import { go } from '../lib/router';
import * as core from '../lib/core';
import * as K from '../lib/f-keepsake';

// ── 책장 넘기기 ──
// 넘어가는 종이(leaf)의 앞면은 지금 쪽, 뒷면은 다음 펼침의 맞은편 쪽. 아직 가려져 있어야 할 반대쪽에는 옛 쪽을 잠깐 덮어 둔다.
interface Look { shell: HTMLElement; L?: Node; R?: Node }
const mk = (tag: string, cls: string) => { const el = document.createElement(tag); el.className = cls; return el; };
/** 옛 쪽의 생김새(꿈 쪽의 밤 색 · 글씨체)를 그대로 입힌 껍데기 */
function skin(look: { shell: HTMLElement }, pageEl: Node) { const el = look.shell.cloneNode(false) as HTMLElement; el.classList.add('bk-skin'); el.classList.remove('swap-next', 'swap-prev'); el.append(pageEl); return el; }
function flipLeaves(bookEl: HTMLElement, before: Required<Look>, dir: number, far = 1) {
  bookEl.querySelectorAll('.bk-leaf, .bk-under, .bk-cast').forEach(x => x.remove());
  if (matchMedia('(max-width: 820px)').matches) {   // 한 단짜리 화면: 새 쪽이 옆에서 스르륵 들어온다
    const cls = dir > 0 ? 'swap-next' : 'swap-prev'; bookEl.classList.remove('swap-next', 'swap-prev'); void bookEl.offsetWidth; bookEl.classList.add(cls); setTimeout(() => bookEl.classList.remove(cls), 520);
    return;
  }
  const side = dir > 0 ? 'right' : 'left', newBack = bookEl.querySelector(dir > 0 ? '.book-page.left' : '.book-page.right')?.cloneNode(true);
  const under = mk('div', `bk-under ${dir > 0 ? 'left' : 'right'}`); under.append(skin(before, dir > 0 ? before.L : before.R)); bookEl.append(under);
  const n = Math.min(6, Math.max(1, far)), gap = n > 1 ? 85 : 0, dur = n > 1 ? 620 : 820;
  const blank = (cls: string) => mk('div', `book-page ${cls} bk-blank`), nowLook = { shell: bookEl.cloneNode(false) as HTMLElement };
  for (let i = 0; i < n; i++) {
    const front = i === 0 ? (dir > 0 ? before.R : before.L).cloneNode(true) : blank(side), back = i === n - 1 && newBack ? newBack.cloneNode(true) : blank(dir > 0 ? 'left' : 'right');
    const leaf = mk('div', `bk-leaf ${side}`); leaf.style.setProperty('--dur', dur + 'ms'); leaf.style.setProperty('--delay', i * gap + 'ms'); leaf.style.zIndex = String(20 + (n - i));
    const face = (cls: string, inner: Node) => { const f = mk('div', `bk-face ${cls}`); f.append(inner, mk('i', 'bk-shade')); return f; };
    leaf.append(face('front', i === 0 ? skin(before, front) : skin(nowLook, front)), face('back', skin(nowLook, back)));
    bookEl.append(leaf);
    const done = () => { leaf.remove(); if (i === n - 1) under.remove(); };
    leaf.addEventListener('animationend', done, { once: true }); setTimeout(done, dur + i * gap + 120);
  }
  // 종이가 드리우는 그림자: 넘어가는 쪽을 따라 반대편으로 건너간다
  const total = (n - 1) * gap + dur, cast = mk('i', `bk-cast${dir > 0 ? '' : ' prev'}`); cast.style.setProperty('--dur', total + 'ms'); bookEl.append(cast); setTimeout(() => cast.remove(), total + 60);
  // 넘어가는 종이가 반대쪽에 내려앉기 전까지만 옛 쪽을 덮어 둔다
  setTimeout(() => under.remove(), (n - 1) * gap + dur * 0.5);
}

const pad2 = (n: number) => String(n).padStart(2, '0');
const md = (t: number) => { const d = new Date(t); return `${d.getMonth() + 1}.${pad2(d.getDate())}`; };
const calm = () => S.settings.motion === false || matchMedia('(prefers-reduced-motion: reduce)').matches;

function Book({ chat, msgs, at, close }: { chat: DChat; msgs: Msg[]; at?: string; close: () => void }) {
  const [, bump] = useReducer((x: number) => x + 1, 0);
  const bookEl = useRef<HTMLDivElement>(null), noteEl = useRef<HTMLTextAreaElement>(null), alive = useRef(true), wantFocus = useRef(false);
  const st = useRef<{ page: number; busy: string; writing: boolean } | null>(null);
  if (!st.current) { const all = pagesOf(chat); let page = at ? all.findIndex(p => p.id === at) : all.length - 1; if (page < 0) page = Math.max(0, all.length - 1); st.current = { page, busy: '', writing: false }; }
  const s = st.current, pages = pagesOf(chat);
  if (s.page > pages.length - 1) s.page = Math.max(0, pages.length - 1);
  const page = s.page, busy = s.busy, ch: Char = charOf(chat) || ({ id: '', name: '?' } as Char), user = S.persona(chat)?.name || '나';

  const draw = () => { if (alive.current) bump(); };
  const reload = (keep?: string) => { const all = pagesOf(chat), i = keep ? all.findIndex(p => p.id === keep) : -1; s.page = i >= 0 ? i : Math.min(Math.max(0, all.length - 1), s.page); };
  const turn = (d: number) => {
    const next = Math.min(pagesOf(chat).length - 1, Math.max(0, s.page + d)); if (next === s.page || s.busy) return; s.writing = false;
    const el = bookEl.current, before = calm() || !el ? null : { shell: el.cloneNode(false) as HTMLElement, L: el.querySelector('.book-page.left')?.cloneNode(true), R: el.querySelector('.book-page.right')?.cloneNode(true) };
    const dir = next > s.page ? 1 : -1, far = Math.abs(next - s.page); s.page = next; flushSync(bump);
    if (el && before?.L && before.R) flipLeaves(el, { shell: before.shell, L: before.L, R: before.R }, dir, far);
  };
  const run = async (kind: string, fn: () => Promise<string>) => { if (s.busy) return; s.busy = kind; draw(); try { reload(await fn()); } catch (e) { tellErr(e); } s.busy = ''; draw(); };
  const write = () => void run('diary', async () => (await writeDiary(chat, msgs)).id);
  const dream = () => void run('dream', async () => (await dreamOf(chat, msgs)).id);

  const live = useRef({ turn, close });
  live.current = { turn, close };
  useEffect(() => {
    alive.current = true;
    const key = (e: KeyboardEvent) => {
      if (document.querySelector('.modal-wrap') || (e.target instanceof Element && e.target.matches('textarea, input, select'))) return;
      if (e.key === 'Escape') live.current.close(); if (e.key === 'ArrowLeft') live.current.turn(-1); if (e.key === 'ArrowRight') live.current.turn(1);
    };
    document.addEventListener('keydown', key);
    const offRoute = core.on('route', () => live.current.close()), offFont = core.on('almanac:font', () => { if (alive.current) bump(); });
    return () => { alive.current = false; document.removeEventListener('keydown', key); offRoute(); offFont(); };
  }, []);
  useEffect(() => {
    bookEl.current?.querySelector('.book-idx.on')?.scrollIntoView({ block: 'nearest' });
    if (wantFocus.current && noteEl.current) { wantFocus.current = false; const ta = noteEl.current; setTimeout(() => ta.focus(), 30); }
  });

  const p: Page | undefined = pages[page], when = p ? new Date(p.ts || core.now()) : new Date(), no = pad2(page + 1);
  const startWriting = () => { s.writing = true; wantFocus.current = true; draw(); };

  // ── 오른쪽 쪽: 종류마다
  const exchange = (e: DiaryEntry) => {   // 교환 일기: 내가 몇 줄 적으면 캐릭터가 여백에 답한다
    if (s.writing) return <div className="bk-ex">
      <div className="bk-ex-head"><span>교환 일기</span><small>{`${user}의 자리`}</small></div>
      <textarea key={e.id} ref={noteEl} className="bk-note-inp" rows={3} maxLength={800} placeholder={`${ch.name}의 일기 옆에 몇 줄 적어 보세요.`} defaultValue={e.note || ''} />
      <div className="bk-ex-acts"><button className="bk-btn" onClick={() => { s.writing = false; draw(); }}>그만두기</button>
        <button className="bk-btn ink" onClick={async () => { const v = (noteEl.current?.value || '').trim(); if (v !== (e.note || '')) { if (v) { e.note = v; e.noteTs = core.now(); } else { delete e.note; delete e.noteTs; delete e.answer; delete e.answerTs; } await save(chat); } s.writing = false; draw(); }}>적어 두기</button></div>
    </div>;
    if (!e.note) return <div className="bk-ex"><button className="bk-ex-add" onClick={startWriting}><Icon name="feather" size={15} /><span>옆에 몇 줄 적기</span><small>교환 일기</small></button></div>;
    return <div className="bk-ex">
      <div className="bk-ex-head"><span>교환 일기</span><small>{e.noteTs ? md(e.noteTs) : ''}</small></div>
      <div className="bk-note"><Paras text={e.note} /><span className="bk-by">{`— ${user}`}</span><button className="bk-mini" title="고쳐 적기" onClick={startWriting}><Icon name="edit" size={13} /></button></div>
      {e.answer ? <div className="bk-ans"><Paras text={e.answer} /><span className="bk-by">{`— ${S.get('chars', e.by)?.name || ch.name}`}</span></div> : null}
      <div className="bk-ex-acts"><button className="bk-btn ink" disabled={!!busy} onClick={() => void run('answer', async () => { await answerNote(chat, e); return e.id; })}>{busy === 'answer' ? `${ch.name}이(가) 여백에 적는 중…` : e.answer ? '답글 다시 받기 · 호출 1회' : '답글 받기 · 호출 1회'}</button></div>
    </div>;
  };
  const rightOf = (pg: Page): ReactNode => {
    const sign = `— ${S.get('chars', 'by' in pg.ref ? pg.ref.by : '')?.name || ch.name}`;
    const foot = (mid?: ReactNode) => <div className="book-foot"><span className="book-no">{`${page + 1} / ${pages.length}`}</span>{mid}<span className="book-sign">{sign}</span></div>;
    const head = (small?: string) => <div className="book-head"><span>{when.toLocaleDateString('ko-KR', { month: 'long', day: 'numeric', weekday: 'short' })}</span>{small ? <small>{small}</small> : null}</div>;
    if (pg.type === 'diary') { const e = pg.ref; return <>{head(e.to > e.from ? `대화 ${e.from + 1}–${e.to}번째` : '')}<div className="bk-scroll"><div className="book-text"><Paras text={e.text} /></div>{exchange(e)}</div>{foot()}</>; }
    if (pg.type === 'dream') { const e = pg.ref; return <>{head(`${e.phaseName || moonPhase(when).name} 뜬 밤의 꿈`)}<div className="bk-scroll"><div className="book-text"><Paras text={e.text} /></div></div>{foot(<span className="bk-stamp">꿈 · 정사가 아님</span>)}</>; }
    if (pg.type === 'letter') { const e = pg.ref; return <>{head(`${e.days || 0}일의 이야기를 담아`)}<div className="bk-scroll"><div className="book-text"><Paras text={e.text} />{e.ps ? <p className="bk-ps">{`추신. ${e.ps}`}</p> : null}</div></div>{foot()}</>; }
    // 기념품: 인화 사진 + 한 줄
    const e = pg.ref, scene = K.scenesOf(msgs).find(x => x.id === e.id), ids = [...new Set((scene?.photos || []).map(x => x.id).filter((id): id is string => !!id && !!Illust.data(id)))], src = Illust.data(e.photo);
    const swap = ids.length > 1 ? async () => { e.photo = ids[(ids.indexOf(e.photo) + 1) % ids.length]; e.picked = true; await save(chat); draw(); } : undefined;
    return <>{head(`장면 ${e.lines || 0}마디${e.photoCount ? ` · 사진 ${e.photoCount}장` : ''}`)}
      <div className="bk-scroll bk-keep">{src ? <Polaroid src={src} cls="big" onClick={swap} title={swap ? '눌러서 다른 사진으로' : ''} /> : <div className="bk-nophoto"><Moon size={54} date={when} /><small>이 장면에는 남은 사진이 없어요.</small></div>}
        {e.summary ? <p className="bk-sum">{e.summary}</p> : null}{e.memo ? <p className="bk-memo">{e.memo}</p> : null}
        <div className="bk-ex-acts"><button className="bk-btn" onClick={async () => { const v = await promptBox('기념품에 적어 둘 말', e.memo || '', { area: true, placeholder: '이 장면에 대해 남겨 두고 싶은 말' }); if (v === null) return; e.memo = v.trim().slice(0, 300); await save(chat); draw(); }}>{e.memo ? '적어 둔 말 고치기' : '한마디 적어 두기'}</button>
          {msgs.some(m => m.id === e.id) ? <button className="bk-btn ink" onClick={() => { close(); void jumpTo(chat.id, e.openId && msgs.some(m => m.id === e.openId) ? e.openId : e.id); }}>이 장면으로 가기</button> : null}</div></div>
      <div className="book-foot"><span className="book-no">{`${page + 1} / ${pages.length}`}</span><span className="bk-stamp">추가 호출 없이 꽂아 둔 기념품</span></div></>;
  };
  const blankMid = () => ch.avatar ? <div className="book-photo small"><img src={ch.avatar} alt="" /></div> : <div className="book-moon"><Moon size={96} date={when} /></div>;
  const leftMid = (pg: Page) => {
    if (pg.type === 'keepsake') return <Ticket k={pg.ref} />;
    if (pg.type === 'dream') return <div className="book-moon"><Moon size={96} date={when} /></div>;
    if (pg.type === 'letter') return <div className="bk-seal"><MoonDial st={{ target: pg.ref.days || 15, active: pg.ref.days || 15, fill: 1, full: true }} cls="small" /></div>;
    const pic = pg.ref.illust && Illust.data(pg.ref.illust);
    return pic ? <div className="book-photo"><img src={pic} alt="" /></div> : blankMid();
  };
  const chipsOf = (pg: Page) => {
    const list: ReactNode[] = pg.type === 'diary' ? [pg.ref.storyDate && <em key="a">{pg.ref.storyDate}</em>, pg.ref.weather && <span key="b">{pg.ref.weather}</span>, pg.ref.mood && <span key="c">{pg.ref.mood}</span>]
      : pg.type === 'dream' ? [pg.ref.phaseName && <em key="a">{pg.ref.phaseName}</em>, <span key="b">정사가 아님</span>, (pg.ref.memId || pg.ref.memIds?.length) ? <span key="c">기억에 올림</span> : null]
        : pg.type === 'keepsake' ? [pg.ref.place && <em key="a">{pg.ref.place}</em>, pg.ref.time && <span key="b">{pg.ref.time}</span>] : [<em key="a">{`${pg.ref.month.slice(0, 4)}년 ${+pg.ref.month.slice(5)}월`}</em>, <span key="b">보름달</span>];
    return list.some(Boolean) ? <div className="book-chips">{list.filter(Boolean)}</div> : null;
  };

  const waiting = busy === 'diary' ? `${ch.name}이(가) 펜을 들었어요…` : busy === 'dream' ? `${ch.name}이(가) 잠들었어요…` : '';
  const range = p?.type === 'diary' && p.ref.to > p.ref.from ? msgs[p.ref.from] : null;
  const more = (ev: MouseEvent<HTMLButtonElement>) => menu(ev.currentTarget, [
    p && p.type !== 'keepsake' && { label: '이 쪽 고치기', ic: 'edit', onclick: async () => { const v = await promptBox(`${TYPE[p.type][1]} 고치기`, p.ref.text, { area: true }); if (v?.trim()) { p.ref.text = v.trim(); await save(chat); draw(); } } },
    p && { label: p.type === 'keepsake' ? '이 기념품 빼기' : '이 쪽 찢기', ic: 'trash', danger: true, onclick: async () => {
      if (!(await confirmBox(`이 ${TYPE[p.type][1]}을(를) 지울까요?`, '지우기', true))) return;
      if (p.type === 'diary') chat.diary = (chat.diary || []).filter(x => x !== p.ref); else if (p.type === 'dream') chat.dreams = (chat.dreams || []).filter(x => x !== p.ref); else if (p.type === 'letter') chat.letters = (chat.letters || []).filter(x => x !== p.ref); else p.ref.gone = true;   // 기념품은 다시 꽂히지 않게 표시만
      await save(chat); reload(); draw(); } },
    p && '-',
    range && { label: '이 일기의 대화로 가기', ic: 'chat', onclick: () => { close(); void jumpTo(chat.id, range.id); } },
    { label: '달력에서 보기', ic: 'moon', onclick: () => { close(); go('diary', { tab: 'calendar', chatId: chat.id, day: p ? K.dayKey(p.ts) : undefined }); } },
    { label: `${ch.name}의 글씨체`, ic: 'feather', hint: fontOf(charOf(chat) || null).ko, onclick: () => { fontDialog(charOf(chat), { chat, onChange: draw }); } },
    { label: '지시문 고치기', ic: 'sliders', onclick: () => { editPrompts(['dream', 'exchange', 'letter'], '일기장 지시문', [DIARY_DEF, MEMO_DEF]); } },
    '-',
    { label: '한 권으로 묶기', ic: 'book', hint: '인쇄용', onclick: () => void bindDialog(chat) },
    (chat.diary || []).length ? { label: '일기 글만 내보내기', ic: 'import', hint: '.txt', onclick: () => core.download(`${ch.name}-diary.txt`, (chat.diary || []).map(x => `${new Date(x.ts).toLocaleDateString('ko-KR')} ${x.storyDate ? `(${x.storyDate}) ` : ''}${x.title}\n\n${x.text}${x.note ? `\n\n[${user}] ${x.note}${x.answer ? `\n[${ch.name}] ${x.answer}` : ''}` : ''}`).join('\n\n— ✦ —\n\n'), 'text/plain') } : null]);
  const tool = (ic: string, label: string, cost: string, title: string, onClick: () => void, cls = '') => <button type="button" className={`bk-tool${cls}`} title={title} disabled={!!busy} onClick={onClick}><Icon name={ic} size={16} /><span>{label}</span>{cost ? <em>{cost}</em> : null}</button>;
  const memod = p && p.type !== 'keepsake' ? !!(p.ref.memIds?.length || p.ref.memId) : false;

  return <>
    <div ref={bookEl} className={`book${p ? ' is-' + p.type : ''}`} style={fontStyle(S.get('chars', p && 'by' in p.ref ? p.ref.by : '') || (ch.id ? ch : null), { ink: p?.type !== 'dream' }) as CSSProperties}>
      <i className="book-ribbon" />
      <div className="book-page left">
        <div className="book-top"><span className="book-tag">{p ? `No. ${no} · ${TYPE[p.type][0]}` : 'DIARY'}</span><span className="book-phase"><Moon size={26} date={when} />{moonPhase(when).name}</span></div>
        <div className="book-day"><b>{pad2(when.getDate())}</b><span>{when.toLocaleDateString('ko-KR', { year: 'numeric', month: 'long' })}<small>{when.toLocaleDateString('ko-KR', { weekday: 'long' })}</small></span></div>
        {p ? <><h3 className="book-title">{titleOf(p)}</h3>{chipsOf(p)}</> : <h3 className="book-title">{`${ch.name}의 일기장`}</h3>}
        <div className="book-mid">{p ? leftMid(p) : blankMid()}</div>
        {pages.length > 1 ? <div className="book-index">{pages.map((x, i) => <button key={x.type + x.id} className={'book-idx' + (i === page ? ' on' : '')} onClick={() => turn(i - page)}><i>{pad2(i + 1)}</i><span>{x.type !== 'diary' ? <em className="bk-kind">{TYPE[x.type][1]}</em> : null}{titleOf(x)}</span><small>{md(x.ts)}</small></button>)}</div> : null}
      </div>
      <i className="book-spine" />
      <div className="book-page right">{p && !waiting ? rightOf(p)
        : <div className="book-empty"><p>{waiting || '아직 아무것도 적혀 있지 않아요.'}</p>{!busy ? <Btn label="첫 일기 쓰기 · 호출 1회" ic="feather" cls="primary" onClick={write} /> : null}</div>}</div>
    </div>
    <div className="book-bar">
      <div className="bk-nav"><IconBtn ic="left" title="앞 장 (←)" onClick={() => turn(-1)} /><span className="bk-count">{pages.length ? `${page + 1} / ${pages.length}` : '—'}</span><IconBtn ic="right" title="뒷 장 (→)" onClick={() => turn(1)} /></div>
      <div className="bk-tools">
        {tool('feather', busy === 'diary' ? '쓰는 중' : '일기', '1회', '마지막 일기 이후의 이야기로 오늘의 일기를 씁니다 · 모델 호출 1회', write, ' ink')}
        {tool('moon', busy === 'dream' ? '꿈꾸는 중' : '꿈', '1회', '가장 최근에 이야기한 날의 조각으로 꿈을 꿉니다. 오늘 밤 달의 위상에 따라 분위기가 달라져요 · 모델 호출 1회', dream)}
        {p && p.type !== 'keepsake' ? tool('up', memod ? '기억됨' : '기억', '', memod ? '기억에 올린 내용을 보거나 다시 올립니다' : '이 쪽을 간추려 장기기억에 올립니다', () => { memoDialog(chat, p, { ch, user, onDone: draw }); }, memod ? ' done' : '') : null}
      </div>
      <div className="bk-nav"><IconBtn ic="more" title="더 보기" onClick={more} /><IconBtn ic="x" title="덮기 (Esc)" onClick={close} /></div>
    </div>
  </>;
}

/** 책을 펼친다. opt.at: 펼칠 쪽의 id (일기 · 꿈 · 기념품 · 편지) */
export async function openDiary(chat: DChat, opt: { at?: string } = {}) {
  book.shut();
  const msgs = await loadChat(chat); await syncChat(chat, msgs, { quiet: true });
  book.shut();   // 불러오는 사이 다른 책이 펼쳐졌으면 덮는다
  const wrap = document.createElement('div'); wrap.className = 'book-wrap';
  let off = () => { }, closed = false;
  const shut = () => { closed = true; if (book.shut === shut) book.shut = () => { }; off(); wrap.remove(); };
  const close = () => { if (closed) return; closed = true; wrap.classList.add('out'); setTimeout(shut, 200); };
  wrap.addEventListener('mousedown', e => { if (e.target === wrap) close(); });
  document.body.append(wrap);
  off = mountInto(wrap, <Book chat={chat} msgs={msgs} at={opt.at} close={close} />);
  book.shut = shut;
}
