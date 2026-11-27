// 홈 화면: 쪽 두 장(위젯 · 앱과 위젯)을 옆으로 넘기고(브라우저의 스크롤 맞춤 — 손가락을 따라 그리는 JS 없음), 아래에 독.
// 길게 누르면 편집: 위젯을 빼고 · 옮기고 · 더한다 (끌기 대신 단추로 — 휴대폰에서 버벅이지 않게)
import { memo, useEffect, useRef, useState, type CSSProperties, type PointerEvent as RPE } from 'react';
import { t, tn } from '../i18n';
import { Fill, Glyph } from './art';
import { WIDGETS, Widget } from './widgets';
import { setPrefs } from './prefs';
import { usePhone, type AppId } from './ui';
import { useMinute } from './time';
import type { Wall } from './wall';

interface AppDef { id: string; ic: string; label: () => string; app?: AppId; run?: () => void }
/** 독에 늘 있는 넷 */
const DOCK: AppDef[] = [
  { id: 'calls', ic: 'phone', label: () => t('phone.app.calls'), app: 'calls' },
  { id: 'messages', ic: 'messages', label: () => t('phone.app.messages'), app: 'messages' },
  { id: 'photos', ic: 'photos', label: () => t('phone.app.photos'), app: 'photos' },
  { id: 'contacts', ic: 'contacts', label: () => t('phone.app.contacts'), app: 'contacts' },
];

function CalTile() { const now = useMinute(), d = new Date(now); return <span className="pn-tile cal"><small>{d.toLocaleDateString(undefined, { weekday: 'short' })}</small><b>{d.getDate()}</b></span>; }
/** 앱 아이콘. 새 소식이 있으면 판 안쪽 귀퉁이에 작은 점 (개수는 읽어 주는 이름에) */
function AppIcon({ a, badge = 0 }: { a: AppDef; badge?: number }) {
  const P = usePhone(), name = a.label();
  return <button type="button" className="pn-app-ic" data-app={a.id} data-run={a.run ? '1' : undefined} aria-label={badge ? tn('phone.home.new', badge, { name }) : name}
    onClick={e => a.app ? P.open(a.app, undefined, e.currentTarget) : a.run?.()}>
    {a.id === 'calendar' ? <CalTile /> : <span className="pn-tile"><Fill name={a.ic} size={30} />{badge ? <i className="pn-new" aria-hidden="true" /> : null}</span>}<small aria-hidden="true">{name}</small></button>;
}

export const Home = memo(function Home({ wall }: { wall: Wall }) {
  const P = usePhone(), [page, setPage] = useState(0), [adding, setAdding] = useState(false), [picked, setPicked] = useState(''), pager = useRef<HTMLDivElement>(null), press = useRef<{ x: number; y: number; t: number } | null>(null);
  // 둘째 쪽 맨 위 한 줄(다섯): 음악 · 캘린더 · 메모 · 밤의 게시판 · 설정
  const APPS: AppDef[] = [
    { id: 'music', ic: 'music', label: () => t('phone.app.music'), app: 'music' },
    { id: 'calendar', ic: 'calendar', label: () => t('phone.app.calendar'), app: 'calendar' },
    { id: 'notes', ic: 'notes', label: () => t('phone.app.notes'), app: 'notes' },
    { id: 'board', ic: 'board', label: () => t('phone.app.board'), app: 'board' },
    { id: 'settings', ic: 'settings', label: () => t('phone.app.settings'), app: 'settings' },
  ];
  // 지금 보는 쪽: 쪽마다 반 넘게 보이면 그 쪽 (스크롤마다 셈하지 않는다)
  useEffect(() => {
    const root = pager.current; if (!root) return;
    const io = new IntersectionObserver(es => { for (const e of es) if (e.isIntersecting) setPage(Number((e.target as HTMLElement).dataset.page)); }, { root, threshold: 0.6 });
    root.querySelectorAll('.pn-page').forEach(el => io.observe(el)); return () => io.disconnect();
  }, []);
  const toPage = (i: number) => { const root = pager.current; if (root) root.scrollTo({ left: i * root.clientWidth, behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' }); };
  // 길게 누르기 → 편집 (손가락이 움직이거나 쪽을 넘기면 그만)
  const down = (e: RPE) => { if (P.edit || (e.target as Element).closest('.pn-dock, .pn-app-ic, .pn-on-top, .pn-editbar')) return; press.current = { x: e.clientX, y: e.clientY, t: window.setTimeout(() => { press.current = null; P.setEdit(true); }, 550) }; };
  const cancel = () => { if (press.current) { clearTimeout(press.current.t); press.current = null; } };
  const moved = (e: RPE) => { const p = press.current; if (p && Math.hypot(e.clientX - p.x, e.clientY - p.y) > 8) cancel(); };
  useEffect(() => cancel, []);

  const lists: [string[], 'w1' | 'w2'][] = [[P.p.w1, 'w1'], [P.p.w2, 'w2']];
  const move = (k: 'w1' | 'w2', id: string, d: number) => { const l = [...P.p[k]], i = l.indexOf(id), j = i + d; if (i < 0 || j < 0 || j >= l.length) return; [l[i], l[j]] = [l[j], l[i]]; setPrefs({ [k]: l }); };
  const drop = (k: 'w1' | 'w2', id: string) => setPrefs({ [k]: P.p[k].filter(x => x !== id) });
  const unused = Object.keys(WIDGETS).filter(id => !P.p.w1.includes(id) && !P.p.w2.includes(id));
  const unread = P.notifs.filter(n => n.kind === 'msg').reduce((a, n) => a + n.count, 0), missed = P.notifs.filter(n => n.kind === 'call').reduce((a, n) => a + n.count, 0);
  const grid = (ids: string[]) => ids.map(id => WIDGETS[id]).filter(Boolean).map((w, i) => <Widget key={w.id} w={w} i={i} edit={P.edit} picked={picked === w.id} onPick={() => setPicked(p => p === w.id ? '' : w.id)} />);
  const pk = picked && WIDGETS[picked], pkList: 'w1' | 'w2' = P.p.w2.includes(picked) ? 'w2' : 'w1', pkAt = P.p[pkList].indexOf(picked);
  useEffect(() => { if (!P.edit) setPicked(''); }, [P.edit]);
  return <div className={'pn-home' + (P.edit ? ' editing' : '')}>
    <div className={'pn-wall' + (wall.soft ? ' soft' : '')} style={wall.soft ? { backgroundImage: `url("${wall.soft}")` } : { background: wall.css }} />
    {P.edit && !pk ? <div className="pn-editbar"><button type="button" onClick={() => setAdding(true)} disabled={!unused.length}><Glyph name="plus" size={16} />{t('phone.edit.add')}</button><button type="button" className="done" onClick={() => { P.setEdit(false); setAdding(false); }}>{t('phone.edit.done')}</button></div> : null}
    <div className="pn-pages" ref={pager} onPointerDown={down} onPointerMove={moved} onPointerUp={cancel} onPointerCancel={cancel} onScroll={cancel}>
      <section className="pn-page" data-page="0" aria-label={t('phone.home.page', { n: 1 })}><div className="pn-grid">{grid(lists[0][0])}</div></section>
      <section className="pn-page" data-page="1" aria-label={t('phone.home.page', { n: 2 })}>
        <div className="pn-grid"><div className="pn-approw">{APPS.map(a => <AppIcon key={a.id} a={a} badge={a.id === 'board' ? P.sns?.count || 0 : 0} />)}</div>{grid(lists[1][0])}</div>
      </section>
    </div>
    <div className="pn-dots" role="tablist" aria-label={t('phone.home.pages')}>{[0, 1].map(i => <button key={i} type="button" role="tab" aria-selected={page === i} aria-label={t('phone.home.page', { n: i + 1 })} className={page === i ? 'on' : undefined} onClick={() => toPage(i)} />)}</div>
    <nav className="pn-dock" aria-label={t('phone.home.dock')}>{DOCK.map(a => <AppIcon key={a.id} a={a} badge={a.id === 'messages' ? unread : a.id === 'calls' ? missed : 0} />)}</nav>
    {pk ? <div className="pn-sheet-veil clear" onClick={() => setPicked('')}><div className="pn-sheet pn-wsheet" role="dialog" aria-label={pk.title()} onClick={e => e.stopPropagation()}>
      <i className="pn-sheet-grab" aria-hidden="true" /><h3>{pk.title()}</h3>
      <div className="pn-trio">
        <button type="button" className="pn-btn ghost" disabled={pkAt <= 0} onClick={() => move(pkList, picked, -1)}><Glyph name="back" size={17} />{t('phone.edit.left')}</button>
        <button type="button" className="pn-btn ghost" disabled={pkAt >= P.p[pkList].length - 1} onClick={() => move(pkList, picked, 1)}>{t('phone.edit.right')}<Glyph name="next" size={17} /></button>
        <button type="button" className="pn-btn danger" onClick={() => { drop(pkList, picked); setPicked(''); }}><Glyph name="minus" size={17} />{t('phone.edit.drop')}</button>
      </div>
    </div></div> : null}
    {adding ? <div className="pn-sheet-veil" onClick={() => setAdding(false)}><div className="pn-sheet" role="dialog" aria-label={t('phone.edit.add')} onClick={e => e.stopPropagation()}>
      <h3>{t('phone.edit.add')}</h3>
      <div className="pn-addlist">{unused.map(id => { const w = WIDGETS[id]; return <button type="button" key={id} onClick={() => { const k = page === 1 ? 'w2' : 'w1'; setPrefs({ [k]: [...P.p[k], id] }); setAdding(false); }}><span className={'pn-addsz'} style={{ '--c': w.size[0], '--r': w.size[1] } as CSSProperties} /><b>{w.title()}</b><Glyph name="plus" size={18} /></button>; })}</div>
    </div></div> : null}
  </div>;
});
