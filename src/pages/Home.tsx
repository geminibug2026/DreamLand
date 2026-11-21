// 홈: 오늘 밤의 창 · 이어서 · 캐릭터 목록(폴더 · 정렬 · 검색 · 카드 크기)
import { useRef, useState, type DragEvent, type ReactNode } from 'react';
import { Btn, Emblem, Icon, IconBtn, InkName, thumbStyle, useEvents, useThumbs } from '../kit';
import type { Char, Folder } from '../types';
import { charPicker, confirmBox, menu, promptBox, usePaged } from '../ui';
import { moonPhase } from '../lib/moon';
import { go } from '../lib/router';
import { S, fmtTime, newChar, uid } from '../lib/core';
import { startMenu } from '../chat/start';
import { charEditor, charSheet, importDialog } from '../editors';
import { locale, t, tn } from '../i18n';
import { chatsOnlyOf, deleteChars, exportChars } from '../lib/bulk';
import { openModal, toast } from '../ui';
import { daysTogether, firstMet } from '../lib/together';
import { Desk } from '../desk/Desk';
import { ArchEmpty, FolderNone, SearchNone } from '../desk/art';

/** 통계: 캐릭터마다 대화방 · 메시지 수 · 처음 만난 날 · 함께한 날 · 마지막 대화 (저장된 숫자만 쓴다 — 메시지를 다시 읽지 않는다) */
function showStats() {
  const rows = S.chars.map(c => { const rooms = S.chats.filter(x => x.charIds.includes(c.id)); return { c, rooms: rooms.length, msgs: rooms.reduce((n, x) => n + (x.count || 0), 0), met: firstMet(c.id), days: daysTogether(c.id), last: rooms.reduce((n, x) => Math.max(n, x.updatedAt || 0), 0) }; })
    .filter(r => r.rooms).sort((a, b) => b.msgs - a.msgs);
  const total = S.chats.reduce((n, x) => n + (x.count || 0), 0), day = (ts: number) => ts ? new Date(ts).toLocaleDateString() : '—';
  openModal({ title: t('home.stats.title'), wide: true, body: <div className="stats">
    <div className="stats-top"><div><b>{S.chars.length.toLocaleString()}</b><span>{t('home.stats.chars')}</span></div><div><b>{S.chats.length.toLocaleString()}</b><span>{t('home.stats.rooms')}</span></div><div><b>{total.toLocaleString()}</b><span>{t('home.stats.msgs')}</span></div></div>
    {rows.length ? <div className="stats-scroll"><table className="stats-table"><thead><tr><th>{t('home.stats.char')}</th><th>{t('home.stats.msgs')}</th><th>{t('home.stats.rooms')}</th><th>{t('home.stats.met')}</th><th>{t('home.stats.days')}</th><th>{t('home.stats.last')}</th></tr></thead>
      <tbody>{rows.map(r => <tr key={r.c.id}><td>{r.c.name}</td><td>{r.msgs.toLocaleString()}</td><td>{r.rooms}</td><td>{day(r.met)}</td><td>{r.days ? t('together.badge', { days: r.days }) : '—'}</td><td>{day(r.last)}</td></tr>)}</tbody></table></div> : <p className="dim">{t('home.stats.none')}</p>}
  </div> });
}

// 화면을 떠났다 돌아와도 남는 보기 상태. folder: '' 전체 · '-' 폴더 없음 · 폴더 id
const view = { q: '', sort: 'recent' as 'recent' | 'new' | 'name', tag: '', fav: false, pick: 0, folder: '' };

// ── 캐릭터 폴더: 폴더 목록은 설정에, 어느 폴더인지는 캐릭터의 folder 에 둔다 ──
const folders = (): Folder[] => (S.settings.folders ||= []);
const folderOf = (c: Char) => folders().some(f => f.id === c.folder) ? c.folder! : '';
const saveFolders = () => S.set({ folders: folders() });
async function newFolder(): Promise<Folder | null> {
  const v = await promptBox(t('home.folder.name'), '', { placeholder: t('home.folder.namePh') }); if (!v?.trim()) return null;
  const fo = { id: uid(), name: v.trim().slice(0, 40) }; folders().push(fo); saveFolders(); return fo;
}
async function moveToFolder(ids: string[], folderId: string) {
  for (const id of ids) { const c = S.get('chars', id); if (c && (c.folder || '') !== folderId) { c.folder = folderId; await S.save('chars', c, true); } }
}
/** 캐릭터 카드의 메뉴: 담을 폴더 고르기 · 실리태번용으로 내보내기 */
function folderMenu(anchor: Element, c: Char, after: () => void) {
  const cur = folderOf(c);
  menu(anchor, [
    { label: t('stx.menu'), ic: 'upload', hint: 'ZIP', onclick: () => void import('../editors/StExport').then(m => m.stExport(c)) },
    '-',
    ...folders().map(fo => ({ label: fo.name, ic: cur === fo.id ? 'check' : 'folder', onclick: async () => { await moveToFolder([c.id], fo.id); after(); } })),
    cur ? { label: t('home.folder.takeOut'), ic: 'x', onclick: async () => { await moveToFolder([c.id], ''); after(); } } : null,
    folders().length ? '-' : null,
    { label: t('home.folder.putNew'), ic: 'plus', onclick: async () => { const fo = await newFolder(); if (fo) { await moveToFolder([c.id], fo.id); after(); } } }]);
}

/** 대화방 미리보기에서 꼬리표 덩어리 · 매크로 · 기호를 걷어낸다. 남는 글이 없으면 빈 글 */
const tidy = (v: string) => (v || '').replace(/<([A-Za-z_][\w-]*)[^>]*>[\s\S]*?<\/\1>/g, ' ').replace(/<[A-Z_]{3,}[^>]*>[\s\S]*$/, ' ').replace(/<[^>]*>?/g, ' ').replace(/\{\{[^}]*\}\}|\[[^\]]*\]|```[\s\S]*?(```|$)/g, ' ').replace(/[#*_>`◆|]+/g, ' ').replace(/\s+/g, ' ').trim();
const SIZES = [['lg', 'home.size.large'], ['md', 'home.size.medium'], ['sm', 'home.size.small']] as const;

/** [격자 클래스, 이름 키] — 설정에 저장된 번호 그대로 */
const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'], DAYS = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
const polar = (r: number, deg: number): [number, number] => [200 + Math.sin(deg * Math.PI / 180) * r, 200 - Math.cos(deg * Math.PI / 180) * r];
const seeded = (seed: number) => { let z = seed; return () => (z = (z * 16807) % 2147483647) / 2147483647; };
/** 성도의 선: 날짜 눈금 · 달 이름 · 달의 여덟 위상 · 별 먼지. 달과 위상만 날마다 바뀐다 */
function WheelArt({ month, phase }: { month: number; phase: number }) {
  const rnd = seeded(11), f = (n: number) => n.toFixed(1);
  // 눈금은 깊이 세 단계(달 · 닷새 · 하루)로 나눠, 굵기와 옅기를 같이 내린다
  const ticks = ['', '', '']; for (let d = 0; d < 365; d++) { const a = d / 365 * 360, k = d % 30 === 0 ? 0 : d % 5 === 0 ? 1 : 2, [x1, y1] = polar(192, a), [x2, y2] = polar(192 - [10, 6, 3][k], a); ticks[k] += `M${f(x1)} ${f(y1)}L${f(x2)} ${f(y2)}`; }
  return <svg viewBox="0 0 400 400" aria-hidden="true">
    <circle cx="200" cy="200" r="198" className="w-rim" /><circle cx="200" cy="200" r="192" className="w-hair" /><circle cx="200" cy="200" r="170" className="w-ring" /><circle cx="200" cy="200" r="136" className="w-ring" />
    <path d={ticks[2]} className="w-tick t3" /><path d={ticks[1]} className="w-tick t2" /><path d={ticks[0]} className="w-tick" />
    {Array.from({ length: 12 }, (_, i) => { const a = i * 30 - 7, [x, y] = polar(178, a), flip = a > 100 && a < 260; return <text key={i} x={f(x)} y={f(y)} transform={`rotate(${flip ? a + 180 : a} ${f(x)} ${f(y)})`} className={i ? 'w-month' : 'w-month on'}>{MONTHS[(month + i) % 12]}</text>; })}
    {Array.from({ length: 8 }, (_, i) => { const [x, y] = polar(153, i * 45 + 22.5), k = (phase + i) % 8, lit = (1 - Math.cos(k / 8 * 2 * Math.PI)) / 2, r = 7, wax = k < 4;
      return <g key={i} className={i ? 'w-moon' : 'w-moon on'}><circle cx={x} cy={y} r={r} />{lit > .02 && <path d={`M${x} ${y - r}a${r} ${r} 0 0 ${wax ? 1 : 0} 0 ${2 * r}a${f(Math.abs(lit - .5) * 2 * r)} ${r} 0 0 ${(lit > .5) === wax ? 1 : 0} 0 ${-2 * r}z`} />}</g>; })}
    {Array.from({ length: 80 }, (_, i) => { const [x, y] = polar(96 + rnd() * 38, rnd() * 360); return <circle key={i} cx={f(x)} cy={f(y)} r={(.4 + rnd() * .8).toFixed(2)} opacity={(.3 + rnd() * .6).toFixed(2)} className="w-dust" />; })}
    <circle cx="200" cy="200" r="128" className="w-link" />
  </svg>;
}
/** 성도 칸의 먼지 별 두 겹: 타일 크기가 서로소라 무늬가 되풀이되어 보이지 않고, 주기가 달라 따로 반짝인다 */
const Twinkle = () => <><i className="hm-tw a" aria-hidden="true" /><i className="hm-tw b" aria-hidden="true" /></>;
const Dust = ({ n, seed }: { n: number; seed: number }) => { const rnd = seeded(seed); return <svg className="hm-dust" aria-hidden="true">{Array.from({ length: n }, (_, i) => <circle key={i} cx={(rnd() * 100).toFixed(1) + '%'} cy={(rnd() * 100).toFixed(1) + '%'} r={(.4 + rnd() * .8).toFixed(2)} opacity={(.15 + rnd() * .45).toFixed(2)} />)}</svg>; };

/** 성도: 가운데에 최근에 만난 캐릭터, 둘레에 그다음 넷. 둘레의 별을 누르면 가운데로 온다 */
function Stage({ picks, redraw }: { picks: Char[]; redraw: () => void }) {
  useThumbs();
  const now = new Date(), moon = moonPhase(now), cur = Math.round(moon.p * 8) % 8;
  const at = view.pick % Math.max(1, picks.length), c: Char | undefined = picks[at];
  const day = <div className="hm-day"><i className="hm-star" />{`${DAYS[now.getDay()]} ${now.getDate()} ${MONTHS[now.getMonth()]}`}<b>{moon.name}</b></div>;
  const others = picks.map((p, i) => ({ p, i })).filter(x => x.i !== at).slice(0, 4);
  const wheel = <div className="hm-wheel"><WheelArt month={now.getMonth()} phase={cur} />
    {c ? <button className="hm-core" style={thumbStyle(c)} title={c.name} onClick={() => charSheet(c)}>{!c.avatar && <Emblem o={c} center />}</button> : <i className="hm-core"><Emblem o={{ tags: [], name: '' }} center /></i>}
    {others.map(({ p, i }, n) => { const [x, y] = polar(128, [45, 135, 225, 315][n]); return <button key={p.id} className="hm-sat" style={{ left: x / 4 + '%', top: y / 4 + '%' }} title={p.name} onClick={() => { view.pick = i; redraw(); }}>
      <i style={thumbStyle(p)}>{!p.avatar && <Emblem o={p} mini center />}</i><span>{p.name}</span></button>; })}
    <i className="hm-ptr" /></div>;
  if (!c) return <div className="hm-hero"><Dust n={90} seed={5} /><Twinkle />{wheel}
    <div className="hm-tx">{day}<h1 className="hm-name">{t('home.empty.title')}</h1>
      <div className="hm-acts"><Btn label={t('home.empty.migrate')} ic="folder" cls="hm-p" onClick={() => go('import')} /><Btn label={t('home.empty.importCard')} ic="import" cls="hm-o" onClick={() => void importDialog()} /><Btn label={t('home.empty.conns')} ic="plug" cls="hm-g" onClick={() => go('conns')} /></div></div>
  </div>;
  const last = S.chats.filter(x => x.charIds.includes(c.id)).sort((a, b) => b.updatedAt - a.updatedAt)[0];
  const days = daysTogether(c.id);
  return <div className="hm-hero"><Dust n={90} seed={5} /><Twinkle />{wheel}
    <div className="hm-tx">{day}
      <div className="hm-lb">{t('home.lastMet')}</div><h1 className="hm-name"><InkName name={c.name} /></h1>
      {c.tags.length ? <div className="hm-tg">{c.tags.slice(0, 4).map(x => <span key={x}>#{x}</span>)}</div> : null}
      <div className="hm-mt">{[last && fmtTime(last.updatedAt), days ? t('together.badge', { days }) : ''].filter(Boolean).join(' · ')}</div>
      <div className="hm-acts">
        {last && <Btn label={t('home.continue')} ic="play" cls="hm-p" onClick={() => go('chat', last.id)} />}
        <Btn label={t('home.newChat')} ic="chat" cls="hm-o" onClick={e => startMenu(e.currentTarget, [c.id])} />
        <Btn label={t('home.profile')} ic="user" cls="hm-g" onClick={() => charSheet(c)} />
      </div>
    </div>
  </div>;
}

const SecHead = ({ title, sub, children }: { title: string; sub: string; children?: ReactNode }) => <header className="hm-sh"><h2>{title}<i>{sub}</i></h2>{children}</header>;

export const page = { name: 'home', Component: Home };

function Home() {
  const redraw = useEvents('chars', 'chats'); useThumbs();
  const [q, setQ] = useState(view.q);
  const fs = folders();
  if (view.folder && view.folder !== '-' && !fs.some(f => f.id === view.folder)) view.folder = '';

  const lastUse = new Map<string, number>(); for (const c of S.chats) for (const id of c.charIds) lastUse.set(id, Math.max(lastUse.get(id) || 0, c.updatedAt));
  const used = (c: Char) => lastUse.get(c.id) || c.createdAt;
  const picks = [...S.chars].sort((a, b) => used(b) - used(a)).slice(0, 5);
  const recent = [...S.chats].sort((a, b) => b.updatedAt - a.updatedAt).slice(0, 8);
  const tags = [...new Set(S.chars.flatMap(c => c.tags))].slice(0, 12);

  const inFolder = (c: Char) => !view.folder || (view.folder === '-' ? !folderOf(c) : folderOf(c) === view.folder);
  const term = q.toLowerCase();
  const list = S.chars.filter(c => inFolder(c) && (!term || (c.name + ' ' + c.tags.join(' ') + ' ' + (c.creator ?? '')).toLowerCase().includes(term)) && (!view.tag || c.tags.includes(view.tag)) && (!view.fav || c.fav))
    .sort((a, b) => view.sort === 'name' ? a.name.localeCompare(b.name, locale()) : view.sort === 'new' ? b.createdAt - a.createdAt : used(b) - used(a));

  const size = Math.min(SIZES.length - 1, S.settings.homeCols ?? 1);
  // 캐릭터 격자 쪽 나누기: 한 쪽 개수는 사용자가 고른다 (실리태번처럼 10 ~ 1000, 기본 50)
  const grid = useRef<HTMLDivElement | null>(null);
  const pg = usePaged(list, { id: 'home-v2', perPage: 50, sizes: [10, 25, 50, 100, 250, 500, 1000], resetKey: [q, view.sort, view.tag, view.fav, view.folder].join('|') });
  const set = (patch: Partial<typeof view>) => { Object.assign(view, patch); redraw(); };
  const addFolder = async () => { const fo = await newFolder(); if (fo) set({ folder: fo.id }); };

  // 폴더 탭: 누르면 그 폴더만, 카드를 끌어다 놓으면 담긴다
  const count = (id: string) => S.chars.filter(c => (id === '-' ? !folderOf(c) : folderOf(c) === id)).length;
  const drop = (id: string) => ({
    onDragOver: (e: DragEvent<HTMLButtonElement>) => { e.preventDefault(); e.currentTarget.classList.add('over'); },
    onDragLeave: (e: DragEvent<HTMLButtonElement>) => e.currentTarget.classList.remove('over'),
    onDrop: async (e: DragEvent<HTMLButtonElement>) => { e.preventDefault(); e.currentTarget.classList.remove('over'); const cid = e.dataTransfer.getData('text/dreamland-char'); if (cid) { await moveToFolder([cid], id === '-' ? '' : id); redraw(); } },
  });
  const tab = (id: string, name: string, extra = {}) => <button key={id || 'all'} className={'folder-tab' + (view.folder === id ? ' on' : '')} onClick={() => set({ folder: id })} {...extra}><span>{name}</span><em>{id ? count(id) : S.chars.length}</em></button>;
  const shelf = !fs.length
    ? <button className="folder-tab add" title={t('home.folder.createTitle')} onClick={addFolder}><Icon name="plus" size={14} />{t('home.folder.create')}</button>
    : <>{tab('', t('home.folder.all'))}{fs.map(fo => tab(fo.id, fo.name, drop(fo.id)))}{tab('-', t('home.folder.none'), drop('-'))}<button className="folder-tab add" title={t('home.folder.new')} onClick={addFolder}><Icon name="plus" size={14} /></button></>;

  const fo = fs.find(f => f.id === view.folder);
  const swap = (d: -1 | 1) => { if (!fo) return; const i = fs.indexOf(fo), j = i + d; if (j < 0 || j >= fs.length) return; [fs[i], fs[j]] = [fs[j], fs[i]]; saveFolders(); redraw(); };
  const folderBar = fo && <div className="folder-bar"><Icon name="folder" size={16} /><b>{fo.name}</b>
    <Btn label={t('home.folder.addChars')} ic="plus" cls="ghost" onClick={() => charPicker({
      title: t('home.folder.pickTitle', { name: fo.name }), selected: S.chars.filter(c => folderOf(c) === fo.id).map(c => c.id),
      note: c => { const o = fs.find(f => f.id === folderOf(c)); return o && o.id !== fo.id ? o.name : ''; },
      onDone: async ids => { const keep = new Set(ids); await moveToFolder(S.chars.filter(c => folderOf(c) === fo.id && !keep.has(c.id)).map(c => c.id), ''); await moveToFolder(ids, fo.id); redraw(); },
    })} />
    <IconBtn ic="more" title={t('home.folder.menuTitle')} onClick={e => menu(e.currentTarget, [
      { label: t('common.rename'), ic: 'edit', onclick: async () => { const v = await promptBox(t('home.folder.name'), fo.name); if (v?.trim()) { fo.name = v.trim().slice(0, 40); saveFolders(); redraw(); } } },
      { label: t('home.folder.left'), ic: 'play', onclick: () => swap(-1) },
      { label: t('home.folder.right'), ic: 'play', onclick: () => swap(1) },
      '-',
      { label: t('home.folder.delete'), ic: 'trash', danger: true, hint: t('home.folder.deleteHint'), onclick: async () => {
        if (!(await confirmBox(t('home.folder.deleteConfirm', { name: fo.name }), t('common.delete'), true))) return;
        await moveToFolder(S.chars.filter(c => c.folder === fo.id).map(c => c.id), ''); S.set({ folders: fs.filter(f => f !== fo) }); set({ folder: '' });
      } }])} />
  </div>;

  const folderTag = (c: Char) => { const o = !view.folder && fs.find(f => f.id === folderOf(c)); return o ? <i className="in-folder"><Icon name="folder" size={11} />{o.name}</i> : null; };
  const addChar = async () => { const c = await S.save('chars', newChar({ folder: view.folder && view.folder !== '-' ? view.folder : '' }), true); charEditor(c); };

  return <section className="home hm">
    <Stage picks={picks} redraw={redraw} />
    {recent.length ? <div><SecHead title={t('home.recent')} sub="recently"><em>{recent.length}</em><span className="hm-sp" /></SecHead>
      <div className="hm-tl">{recent.map((c, i) => {
        const chars = c.charIds.map(id => S.get('chars', id)).filter((x): x is Char => !!x), first = chars[0];
        return <button key={c.id} className={'hm-th' + (i ? '' : ' on')} onClick={() => go('chat', c.id)}>
          <time>{fmtTime(c.updatedAt)}</time>
          <div className="hm-pt" style={thumbStyle(first)}>{first ? !first.avatar && <Emblem o={first} mini /> : <span>?</span>}</div>
          <div className="hm-tt"><b>{chars.map(x => x.name).join(', ') || t('home.deletedChar')}</b><span>{c.name}</span><p>{tidy(c.preview) || t('home.newChat')}</p></div>
        </button>;
      })}</div></div> : null}
    <Desk />
    <div>
      <SecHead title={t('home.chars')} sub="characters"><em>{tn('home.charCount', list.length)}</em><span className="hm-sp" />
        <Btn label={t('common.import')} ic="import" cls="hm-line hm-wide" onClick={() => void importDialog()} />
        <Btn label={t('home.newChar')} ic="plus" cls="hm-fill" onClick={() => void addChar()} />
        <IconBtn ic="more" cls="hm-line" title={t('home.bulk.title')} onClick={e => menu(e.currentTarget, [
          { label: t('common.import'), ic: 'import', onclick: () => void importDialog() },
          { label: t('reach.shop.menu'), ic: 'book', onclick: () => go('shop') },
          { label: t('home.stats.title'), ic: 'sparkle', onclick: showStats },
          { label: t('home.bulk.export'), ic: 'import', onclick: () => charPicker({ title: t('home.bulk.export'), selected: [], onDone: async ids => { if (!ids.length) return; const n = await exportChars(ids); toast(t('home.bulk.exported', { count: n }), 'ok'); } }) },
          { label: t('home.bulk.delete'), ic: 'trash', danger: true, onclick: () => charPicker({ title: t('home.bulk.delete'), selected: [], onDone: async ids => {
            if (!ids.length) return; const rooms = chatsOnlyOf(ids).length;
            if (!(await confirmBox(t('home.bulk.deleteConfirm', { count: ids.length, rooms }), t('common.delete'), true))) return;
            const n = await deleteChars(ids); toast(t('home.bulk.deleted', { count: n }), 'ok'); redraw();
          } }) },
        ])} />
      </SecHead>
      <div className="hm-bar">
        <div className="hm-find"><Icon name="search" size={16} /><input placeholder={t('home.searchPh')} value={q} onChange={e => { view.q = e.target.value; setQ(e.target.value); }} /></div>
        <div className="hm-seg">{([['recent', t('home.sort.recent')], ['new', t('home.sort.new')], ['name', t('common.name')]] as const).map(([k, l]) => <button key={k} className={view.sort === k ? 'on' : undefined} onClick={() => set({ sort: k })}>{l}</button>)}</div>
        <button className={'btn hm-line' + (view.fav ? ' on' : '')} onClick={() => set({ fav: !view.fav })}><Icon name="star" size={15} /><span>{t('home.sort.fav')}</span></button>
        <button className="btn hm-line" title={t('home.size.title', { size: t(SIZES[size][1]) })} onClick={() => { S.set({ homeCols: (size + 1) % SIZES.length }); redraw(); }}><Icon name="grip" size={15} /><span>{t(SIZES[size][1])}</span></button>
      </div>
      <div className="hm-tabs">{shelf}</div>
      {tags.length ? <div className="hm-tags">{tags.map(x => <button key={x} className={view.tag === x ? 'on' : undefined} onClick={() => set({ tag: view.tag === x ? '' : x })}>#{x}</button>)}</div> : null}
      {folderBar}
      <div className={'hm-grid ' + SIZES[size][0]} ref={el => { grid.current = el; pg.listRef(el); }}>
        {pg.rows.map(c => <button key={c.id} className={'hm-c' + (c.id === picks[view.pick % Math.max(1, picks.length)]?.id ? ' sel' : '')} draggable={fs.length > 0}
          onDragStart={e => { e.dataTransfer.setData('text/dreamland-char', c.id); e.dataTransfer.effectAllowed = 'move'; }}
          onClick={() => charSheet(c)} onContextMenu={e => { e.preventDefault(); folderMenu(e.currentTarget, c, redraw); }}>
          <div className="hm-im" style={thumbStyle(c)}>{!c.avatar && <><Dust n={30} seed={c.name.length * 97 + 13} /><Emblem o={c} /></>}{c.fav && <i className="fav"><Icon name="star" size={12} /></i>}{folderTag(c)}</div>
          <b>{c.name}</b><small>{c.tags.slice(0, 2).join(' · ') || '\u00a0'}</small>
        </button>)}
        {list.length ? null : term || view.tag || view.fav ? <div className="fx-empty hm-none"><SearchNone /><p>{t('home.none.search')}</p></div>
          : view.folder && view.folder !== '-' ? <div className="fx-empty hm-none folder-empty"><FolderNone /><p>{t('home.folder.empty')}</p></div>
          : !S.chars.length ? <div className="fx-empty hm-none"><ArchEmpty /><p>{t('home.none.chars')}</p></div> : null}
        <button className="hm-c add" onClick={() => void addChar()}><div className="hm-im"><Icon name="plus" size={26} /></div><b>{t('home.newChar')}</b><small>{t('home.newCharSub')}</small></button>
      </div>
      {pg.pager}
    </div>
  </section>;
}
