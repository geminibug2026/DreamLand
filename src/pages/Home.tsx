// 홈: 오늘 밤의 창 · 이어서 · 캐릭터 목록(폴더 · 정렬 · 검색 · 카드 크기)
import { memo, startTransition, useDeferredValue, useEffect, useMemo, useReducer, useRef, useState, type DragEvent, type ReactNode } from 'react';
import { Btn, Emblem, Icon, IconBtn, InkName, useThumb } from '../kit';
import type { Char, Folder } from '../types';
import { charPicker, choiceBox, confirmBox, menu, promptBox, usePaged } from '../ui';
import { moonPhase } from '../lib/moon';
import { go } from '../lib/router';
import { S, fmtTime, newChar, on, uid } from '../lib/core';
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
const WheelArt = memo(function WheelArt({ month, phase }: { month: number; phase: number }) {
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
});
/** 성도 칸의 먼지 별 두 겹: 타일 크기가 서로소라 무늬가 되풀이되어 보이지 않고, 주기가 달라 따로 반짝인다 */
const Twinkle = () => <><i className="hm-tw a" aria-hidden="true" /><i className="hm-tw b" aria-hidden="true" /></>;
const Dust = memo(function Dust({ n, seed }: { n: number; seed: number }) { const rnd = seeded(seed); return <svg className="hm-dust" aria-hidden="true">{Array.from({ length: n }, (_, i) => <circle key={i} cx={(rnd() * 100).toFixed(1) + '%'} cy={(rnd() * 100).toFixed(1) + '%'} r={(.4 + rnd() * .8).toFixed(2)} opacity={(.15 + rnd() * .45).toFixed(2)} />)}</svg>; });
/** 작은 초상을 바탕으로 건 칸 (그 그림이 준비되면 이 칸만 다시 그린다) */
function Pic({ c, tag = 'div', children, ...rest }: { c?: Char | null; tag?: 'div' | 'button' | 'i'; children?: ReactNode; className?: string; title?: string; onClick?: () => void }) {
  const u = useThumb(c?.avatar), Tag = tag as 'div';
  return <Tag {...rest} style={u ? { backgroundImage: `url("${u}")` } : undefined}>{children}</Tag>;
}

/** 성도: 가운데에 최근에 만난 캐릭터, 둘레에 그다음 넷. 둘레의 별을 누르면 가운데로 온다 */
const Stage = memo(function Stage({ picks, pick, setPick }: { picks: Char[]; pick: number; setPick: (i: number) => void; ver: number }) {
  const now = new Date(), moon = moonPhase(now), cur = Math.round(moon.p * 8) % 8;
  const at = pick % Math.max(1, picks.length), c: Char | undefined = picks[at];
  const day = <div className="hm-day"><i className="hm-star" />{`${DAYS[now.getDay()]} ${now.getDate()} ${MONTHS[now.getMonth()]}`}<b>{moon.name}</b></div>;
  const others = picks.map((p, i) => ({ p, i })).filter(x => x.i !== at).slice(0, 4);
  const wheel = <div className="hm-wheel"><WheelArt month={now.getMonth()} phase={cur} />
    {c ? <Pic c={c} tag="button" className="hm-core" title={c.name} onClick={() => charSheet(c)}>{!c.avatar && <Emblem o={c} center />}</Pic> : <i className="hm-core"><Emblem o={{ tags: [], name: '' }} center /></i>}
    {others.map(({ p, i }, n) => { const [x, y] = polar(128, [45, 135, 225, 315][n]); return <button key={p.id} className={'hm-sat' + [' up', '', '', ' up l'][n]} style={{ left: x / 4 + '%', top: y / 4 + '%' }} title={p.name} onClick={() => setPick(i)}>
      <Pic c={p} tag="i">{!p.avatar && <Emblem o={p} mini center />}</Pic><span>{p.name}</span></button>; })}
    <i className="hm-ptr" /></div>;
  if (!c) return <div className="hm-hero"><Dust n={90} seed={5} /><Twinkle />{wheel}
    <div className="hm-tx">{day}<h1 className="hm-name">{t('home.empty.title')}</h1>
      <div className="hm-acts"><Btn label={t('home.empty.migrate')} ic="folder" cls="hm-p" onClick={() => go('import')} /><Btn label={t('home.empty.importCard')} ic="import" cls="hm-o" onClick={() => void importDialog()} /><Btn label={t('home.empty.conns')} ic="plug" cls="hm-g" onClick={() => go('conns')} /></div></div>
  </div>;
  let last: (typeof S.chats)[number] | undefined; for (const x of S.chats) if (x.charIds.includes(c.id) && (!last || x.updatedAt > last.updatedAt)) last = x;
  const days = daysTogether(c.id), quote = last ? tidy(last.preview).slice(0, 120) : '';
  return <div className="hm-hero"><Dust n={90} seed={5} /><Twinkle />{wheel}
    <div className="hm-tx">{day}
      <div className="hm-lb">{t('home.lastMet')}</div><h1 className="hm-name"><InkName name={c.name} /></h1>
      {c.tags.length ? <div className="hm-tg">{c.tags.slice(0, 4).map(x => <span key={x}>#{x}</span>)}</div> : null}
      {quote ? <p className="hm-q">{quote}</p> : null}
      <div className="hm-mt">{last && <div className="fx-kv"><span>{t('home.lastTalk')}</span><i /><b>{fmtTime(last.updatedAt)}</b></div>}{days ? <div className="fx-kv"><span>{t('desk.bond.together')}</span><i /><b>{t('together.badge', { days })}</b></div> : null}</div>
      <div className="hm-acts">
        {last && <Btn label={t('home.continue')} ic="play" cls="hm-p" onClick={() => go('chat', last.id)} />}
        <Btn label={t('home.newChat')} ic="chat" cls="hm-o" onClick={e => startMenu(e.currentTarget, [c.id])} />
        <Btn label={t('home.profile')} ic="user" cls="hm-g" onClick={() => charSheet(c)} />
      </div>
    </div>
  </div>;
}, (a, b) => a.ver === b.ver && a.pick === b.pick);

const SecHead = ({ title, sub, children }: { title: string; sub: string; children?: ReactNode }) => <header className="hm-sh"><h2>{title}<i>{sub}</i></h2>{children}</header>;

export const page = { name: 'home', Component: Home };

/** 이어서: 최근 대화 여덟 */
const Recent = memo(function Recent({ recent }: { recent: (typeof S.chats)[number][]; ver: number }) {
  return <div><SecHead title={t('home.recent')} sub="recently"><em>{recent.length}</em><span className="hm-sp" /></SecHead>
    <div className="hm-tl">{recent.map((c, i) => {
      const chars = c.charIds.map(id => S.get('chars', id)).filter((x): x is Char => !!x), first = chars[0];
      return <button key={c.id} className={'hm-th' + (i ? '' : ' on')} onClick={() => go('chat', c.id)}>
        <time>{fmtTime(c.updatedAt)}</time>
        <Pic c={first} className="hm-pt">{first ? !first.avatar && <Emblem o={first} mini /> : <span>?</span>}</Pic>
        <div className="hm-tt"><b>{chars.map(x => x.name).join(', ') || t('home.deletedChar')}</b><div className="fx-kv"><span>{c.name}</span><i /><b>{fmtTime(c.updatedAt)}</b></div><p>{tidy(c.preview) || t('home.newChat')}</p></div>
      </button>;
    })}</div></div>;
}, (a, b) => a.ver === b.ver);
const DeskSec = memo(Desk);

/** 캐릭터 한 칸. 보이는 값이 그대로면 다시 그리지 않는다 (검색 · 정렬 · 그림 하나가 준비될 때마다 쪽 전체를 다시 그리지 않게) */
const Card = memo(function Card({ c, name, sub, fav, noPic, sel, drag, folder, redraw }: { c: Char; name: string; sub: string; fav: boolean; noPic: boolean; sel: boolean; drag: boolean; folder: string; redraw: () => void; av: string }) {
  const u = useThumb(c.avatar);
  return <button className={'hm-c' + (sel ? ' sel' : '')} draggable={drag}
    onDragStart={e => { e.dataTransfer.setData('text/dreamland-char', c.id); e.dataTransfer.effectAllowed = 'move'; }}
    onClick={() => charSheet(c)} onContextMenu={e => { e.preventDefault(); folderMenu(e.currentTarget, c, redraw); }}>
    <div className="hm-im" style={u ? { backgroundImage: `url("${u}")` } : undefined}>{noPic && <><Dust n={30} seed={name.length * 97 + 13} /><Emblem o={c} /></>}{fav && <i className="fav"><Icon name="star" size={12} /></i>}{folder ? <i className="in-folder"><Icon name="folder" size={11} />{folder}</i> : null}</div>
    <b>{name}</b><small>{sub || '\u00a0'}</small>
  </button>;
});

/** 화면에 처음 그린 뒤 한 단계씩 오른다 (0 → n). 단계마다 그 화면이 실제로 그려진 다음(rAF 뒤의 작업)에, 끊어 그릴 수 있게(transition) 올린다 */
function useStages(n: number) {
  const [k, setK] = useState(0);
  useEffect(() => {
    if (k >= n) return; let tm = 0;
    const raf = requestAnimationFrame(() => { tm = window.setTimeout(() => startTransition(() => setK(x => Math.min(n, x + 1)))); });
    return () => { cancelAnimationFrame(raf); clearTimeout(tm); };
  }, [k, n]);
  return k;
}

function Home() {
  // ver: 캐릭터 · 대화방이 바뀌었거나 보기(정렬 · 폴더 …)를 바꿨을 때 오른다. 아래 셈은 ver 가 같으면 다시 하지 않는다
  const [ver, redraw] = useReducer((x: number) => x + 1, 0);
  // 홈에 올 때(켤 때 · 다른 화면에서 돌아올 때) 맨 위(성도 · 이어서)를 먼저 그려 보이고, 아래의 책상 · 캐릭터 목록은 그다음 화면부터 차례로 붙인다 (한 번에 수천 개를 만드느라 누른 뒤 화면이 멈추지 않게)
  const stage = useStages(2);
  useEffect(() => { const offs = [on('chars', redraw), on('chats', redraw)]; return () => offs.forEach(f => f()); }, []);
  const [q, setQ] = useState(view.q), dq = useDeferredValue(q);   // 글자는 바로 찍고, 목록은 한 박자 뒤에 따라온다 (타자가 밀리지 않게)
  const [pick, setPickRaw] = useState(view.pick), setPick = (i: number) => { view.pick = i; setPickRaw(i); };
  const fs = folders();
  if (view.folder && view.folder !== '-' && !fs.some(f => f.id === view.folder)) view.folder = '';

  const base = useMemo(() => {
    const lastUse = new Map<string, number>(); for (const c of S.chats) for (const id of c.charIds) { const v = lastUse.get(id); if (v === undefined || c.updatedAt > v) lastUse.set(id, c.updatedAt); }
    const used = (c: Char) => lastUse.get(c.id) || c.createdAt;
    // 가장 최근 다섯 · 여덟만 고른다 (전체를 정렬하지 않는다). 같은 값이면 앞에 있던 것이 먼저 — 전체를 정렬할 때와 같은 차례
    const top = <T,>(arr: T[], n: number, key: (x: T) => number) => { const out: T[] = []; for (const x of arr) { const k = key(x); if (out.length < n || k > key(out[out.length - 1])) { let i = out.length; while (i > 0 && key(out[i - 1]) < k) i--; out.splice(i, 0, x); if (out.length > n) out.pop(); } } return out; };
    const tags: string[] = [], seen = new Set<string>(); for (const c of S.chars) { for (const x of c.tags) if (!seen.has(x)) { seen.add(x); tags.push(x); } if (tags.length >= 12) break; }
    const fid = new Set(folders().map(f => f.id)), inF = new Map<string, number>(); let none = 0;
    for (const c of S.chars) { const f = c.folder && fid.has(c.folder) ? c.folder : ''; if (f) inF.set(f, (inF.get(f) || 0) + 1); else none++; }
    return { used, picks: top(S.chars, 5, used), recent: top(S.chats, 8, c => c.updatedAt), tags: tags.slice(0, 12), fid, inF, none };
  }, [ver]);
  const { used, picks, recent, tags } = base;

  const term = dq.toLowerCase();
  const list = useMemo(() => {
    const fo1 = (c: Char) => c.folder && base.fid.has(c.folder) ? c.folder : '';
    const inFolder = (c: Char) => !view.folder || (view.folder === '-' ? !fo1(c) : fo1(c) === view.folder);
    const coll = view.sort === 'name' ? new Intl.Collator(locale()) : null;   // 이름순: 비교기를 한 번만 만든다 (localeCompare 는 부를 때마다 새로 만든다)
    return S.chars.filter(c => inFolder(c) && (!term || (c.name + ' ' + c.tags.join(' ') + ' ' + (c.creator ?? '')).toLowerCase().includes(term)) && (!view.tag || c.tags.includes(view.tag)) && (!view.fav || c.fav))
      .sort((a, b) => coll ? coll.compare(a.name, b.name) : view.sort === 'new' ? b.createdAt - a.createdAt : used(b) - used(a));
  }, [base, used, term]);

  const size = Math.min(SIZES.length - 1, S.settings.homeCols ?? 1);
  // 캐릭터 격자 쪽 나누기: 한 쪽 개수는 사용자가 고른다 (실리태번처럼 10 ~ 1000, 기본 50)
  const grid = useRef<HTMLDivElement | null>(null);
  const pg = usePaged(list, { id: 'home-v2', perPage: 50, sizes: [10, 25, 50, 100, 250, 500, 1000], resetKey: [dq, view.sort, view.tag, view.fav, view.folder].join('|') });
  const set = (patch: Partial<typeof view>) => { Object.assign(view, patch); redraw(); };
  const addFolder = async () => { const fo = await newFolder(); if (fo) set({ folder: fo.id }); };

  // 폴더 탭: 누르면 그 폴더만, 카드를 끌어다 놓으면 담긴다
  const count = (id: string) => id === '-' ? base.none : base.inF.get(id) || 0;
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

  const folderName = (c: Char) => (!view.folder && c.folder && fs.find(f => f.id === c.folder)?.name) || '';
  const selId = picks[pick % Math.max(1, picks.length)]?.id;
  const addChar = async () => { const c = await S.save('chars', newChar({ folder: view.folder && view.folder !== '-' ? view.folder : '' }), true); charEditor(c); };

  // 휴대폰에서는 정렬이 제목 줄로, 새로 · 가져오기가 검색 옆으로, 폴더와 즐겨찾기가 한 줄 칩으로 모인다
  const narrow = matchMedia('(max-width: 700px)').matches;
  const seg = <div className="hm-seg">{([['recent', t('home.sort.recent')], ['new', t('home.sort.new')], ['name', t('common.name')]] as const).map(([k, l]) => <button key={k} className={view.sort === k ? 'on' : undefined} onClick={() => set({ sort: k })}>{l}</button>)}</div>;
  const more = <IconBtn ic="more" cls="hm-line" title={t('home.bulk.title')} onClick={e => menu(e.currentTarget, [
          { label: t('common.import'), ic: 'import', onclick: () => void importDialog() },
          { label: t('reach.shop.menu'), ic: 'book', onclick: () => go('shop') },
          { label: t('home.stats.title'), ic: 'sparkle', onclick: showStats },
          { label: t('home.bulk.export'), ic: 'import', onclick: () => charPicker({ title: t('home.bulk.export'), selected: [], onDone: async ids => { if (!ids.length) return; const n = await exportChars(ids); toast(t('home.bulk.exported', { count: n }), 'ok'); } }) },
          { label: t('home.bulk.delete'), ic: 'trash', danger: true, onclick: () => charPicker({ title: t('home.bulk.delete'), selected: [], onDone: async ids => {
            if (!ids.length) return; const rooms = chatsOnlyOf(ids).length;
            let withChats = false;
            if (rooms) { const pick = await choiceBox(t('home.bulk.deleteAsk', { count: ids.length }), <p className="del-ask">{t('home.bulk.deleteRooms', { rooms })}</p>, [{ key: 'char', label: t('editors.sheet.del.charOnly') }, { key: 'all', label: t('editors.sheet.del.withChats'), cls: 'danger' }]); if (!pick) return; withChats = pick === 'all'; }
            else if (!(await confirmBox(t('home.bulk.deleteAsk', { count: ids.length }), t('common.delete'), true))) return;
            const r = await deleteChars(ids, { withChats }); toast(r.chats ? t('home.bulk.deletedWith', { count: r.chars, rooms: r.chats }) : t('home.bulk.deleted', { count: r.chars }), 'ok'); redraw();
          } }) },
        ])} />;

  return <section className="home hm">
    <Stage picks={picks} pick={pick} setPick={setPick} ver={ver} />
    {recent.length ? <Recent recent={recent} ver={ver} /> : null}
    {stage > 0 ? <DeskSec /> : null}
    {stage > 1 ? <div>
      <SecHead title={t('home.chars')} sub="characters"><em>{tn('home.charCount', list.length)}</em><span className="hm-sp" />
        {narrow ? seg : <>
        <Btn label={t('common.import')} ic="import" cls="hm-line hm-wide" onClick={() => void importDialog()} />
        <Btn label={t('home.newChar')} ic="plus" cls="hm-fill" onClick={() => void addChar()} />
        {more}</>}
      </SecHead>
      {narrow ? <>
        <div className="hm-bar hm-nb">
          <div className="hm-find"><Icon name="search" size={16} /><input placeholder={t('home.searchPh')} value={q} onChange={e => { view.q = e.target.value; setQ(e.target.value); }} /></div>
          <Btn label={t('home.newShort')} ic="plus" cls="hm-line" onClick={() => void addChar()} />
          <Btn label={t('common.import')} ic="import" cls="hm-line" onClick={() => void importDialog()} />
          {more}
        </div>
        <div className="hm-shelf">
          <div className="hm-tabs"><button className={'folder-tab' + (view.fav ? ' on' : '')} onClick={() => set({ fav: !view.fav })}><Icon name="star" size={13} /><span>{t('home.sort.fav')}</span></button>
            {fs.length ? shelf : tab('', t('home.folder.all'))}</div>
          <button className="folder-tab pin" title={t('home.folder.createTitle')} onClick={addFolder}><Icon name="plus" size={13} /><span>{t('home.folder.addShort')}</span></button>
          <button className="folder-tab pin" title={t('home.size.title', { size: t(SIZES[size][1]) })} onClick={() => { S.set({ homeCols: (size + 1) % SIZES.length }); redraw(); }}><Icon name="grip" size={14} /></button>
        </div>
      </> : <>
      <div className="hm-bar">
        <div className="hm-find"><Icon name="search" size={16} /><input placeholder={t('home.searchPh')} value={q} onChange={e => { view.q = e.target.value; setQ(e.target.value); }} /></div>
        {seg}
        <button className={'btn hm-line' + (view.fav ? ' on' : '')} onClick={() => set({ fav: !view.fav })}><Icon name="star" size={15} /><span>{t('home.sort.fav')}</span></button>
        <button className="btn hm-line" title={t('home.size.title', { size: t(SIZES[size][1]) })} onClick={() => { S.set({ homeCols: (size + 1) % SIZES.length }); redraw(); }}><Icon name="grip" size={15} /><span>{t(SIZES[size][1])}</span></button>
      </div>
      <div className="hm-tabs">{shelf}</div>
      </>}
      {tags.length ? <div className="hm-tags">{tags.map(x => <button key={x} className={view.tag === x ? 'on' : undefined} onClick={() => set({ tag: view.tag === x ? '' : x })}>#{x}</button>)}</div> : null}
      {folderBar}
      <div className={'hm-grid ' + SIZES[size][0]} ref={el => { grid.current = el; pg.listRef(el); }}>

        {pg.rows.map(c => <Card key={c.id} c={c} name={c.name} sub={c.tags.slice(0, 2).join(' · ')} fav={!!c.fav} noPic={!c.avatar} av={c.avatar} sel={c.id === selId} drag={fs.length > 0} folder={folderName(c)} redraw={redraw} />)}
        {list.length ? null : term || view.tag || view.fav ? <div className="fx-empty hm-none"><SearchNone /><p>{t('home.none.search')}</p></div>
          : view.folder && view.folder !== '-' ? <div className="fx-empty hm-none folder-empty"><FolderNone /><p>{t('home.folder.empty')}</p></div>
          : !S.chars.length ? <div className="fx-empty hm-none"><ArchEmpty /><p>{t('home.none.chars')}</p></div> : null}
        <button className="hm-c add" onClick={() => void addChar()}><div className="hm-im"><Icon name="plus" size={26} /></div><b>{t('home.newChar')}</b><small>{t('home.newCharSub')}</small></button>
      </div>
      {pg.pager}
    </div> : null}
  </section>;
}
