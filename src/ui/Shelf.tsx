// 목록 정리: 정렬(최근 사용 · 자주 쓰는 순 · 이름 · 만든 순 · 직접 순서) · 즐겨찾기 · 폴더 · 검색 · 쪽 나누기
// LibraryPage 의 list 자리에 넣어 쓴다: list={ctx => <Shelf ctx={ctx} coll="presets" … />}
import { useLayoutEffect, useReducer, useRef, useState, type ReactNode } from 'react';
import { L } from '../legacy';
import { Icon, IconBtn } from '../kit';
import { useDragSort } from './dragSort';
import { menu, type MenuItem } from './menu';
import { confirmBox, openModal, promptBox } from './Modal';
import { crossPageItems, usePaged } from './Pager';

/** 항목에 붙는 정리 필드. 내보낼 때는 stripShelf 로 뺀다 */
export interface ShelfFields { pinned?: boolean; folder?: string; order?: number; usedAt?: number; useCount?: number; createdAt?: number }
export const SHELF_KEYS = ['pinned', 'folder', 'order', 'usedAt', 'useCount'] as const;
export function stripShelf<T extends object>(o: T): T { const c = { ...o } as Record<string, unknown>; for (const k of SHELF_KEYS) delete c[k]; return c as T; }

export type ShelfSort = 'recent' | 'freq' | 'name' | 'new' | 'manual';
const SORTS: [ShelfSort, string][] = [['recent', '최근 사용'], ['freq', '자주 쓰는 순'], ['name', '이름'], ['new', '만든 순'], ['manual', '직접 순서']];
export interface ShelfFolder { id: string; name: string }
interface ShelfPrefs { sort?: ShelfSort; closed?: string[]; flat?: boolean }

type Item = { id: string; name?: string } & ShelfFields & Record<string, unknown>;
interface AnyStore { settings: Record<string, unknown>; get(coll: string, id: string): unknown; save(coll: string, o: unknown, silent?: boolean): Promise<unknown>; set(patch: Record<string, unknown>): void }
const St = () => L.core.S as unknown as AnyStore & Record<string, unknown>;

/** 쓰였다고 적는다. count 가 false 면 시각만 (생성할 때마다 횟수가 불어나지 않게, 30분 안에 다시 쓰면 횟수는 그대로) */
export async function markUsed(coll: string, id: string | undefined, explicit = true) {
  if (!id) return; const S = St(), o = S.get(coll, id) as Item | undefined; if (!o) return;
  const t = Date.now(), fresh = explicit || !o.usedAt || t - o.usedAt > 30 * 60e3;
  o.usedAt = t; if (fresh) o.useCount = (o.useCount || 0) + 1;
  await S.save(coll, o, true);
}

const prefsOf = (coll: string): ShelfPrefs => { const all = (St().settings.shelf || {}) as Record<string, ShelfPrefs>; return all[coll] || {}; };
const setPrefs = (coll: string, p: ShelfPrefs) => { const S = St(), all = { ...((S.settings.shelf || {}) as Record<string, ShelfPrefs>) }; all[coll] = { ...(all[coll] || {}), ...p }; S.set({ shelf: all }); };

/** 여러 개를 한꺼번에 고르는 창 */
function pickMany(title: string, items: Item[], selected: string[], note: (o: Item) => string, onDone: (ids: string[]) => void) {
  const picked = new Set(selected);
  function Body() {
    const [q, setQ] = useState(''), [, bump] = useReducer((x: number) => x + 1, 0), t = q.trim().toLowerCase();
    const rows = items.filter(o => !t || String(o.name || '').toLowerCase().includes(t));
    return <div className="col">
      <input className="inp search" placeholder="이름으로 찾기" value={q} onChange={e => setQ(e.target.value)} />
      <small className="hint">{`${picked.size}개 선택 · 전체 ${items.length}개`}</small>
      <div className="picker-list">
        {rows.slice(0, 300).map(o => <button key={o.id} className={'picker-row' + (picked.has(o.id) ? ' on' : '')} onClick={() => { if (!picked.delete(o.id)) picked.add(o.id); bump(); }}>
          <div className="picker-text"><b>{o.name || '이름 없음'}</b><small>{note(o) || ' '}</small></div><i className="picker-check"><Icon name="check" size={14} /></i>
        </button>)}
        {!rows.length && <p className="dim">찾는 항목이 없어요.</p>}
      </div>
    </div>;
  }
  openModal({ title, body: <Body />, actions: [{ label: '취소' }, { label: '확인', cls: 'primary', onclick: () => onDone([...picked]) }] });
}

export interface ShelfProps<T> {
  ctx: { all: T[]; current?: string; item: (x: T) => ReactNode; pick: (id: string) => void; redraw: () => void };
  coll: string;
  /** 지금 쓰는 항목 — 최근 사용 순에서 맨 위 */
  active?: string;
  /** 검색에 넣을 글 (기본: 이름) */
  text?: (o: T) => string;
  /** 폴더 목록을 둘 설정 키. 없으면 폴더를 쓰지 않는다 */
  foldersKey?: string;
  /** 한 쪽에 보일 수. 없으면 나누지 않는다 */
  pageSize?: number;
  placeholder?: string;
}

export function Shelf<T extends { id: string }>({ ctx, coll, active, text, foldersKey, pageSize = 30, placeholder = '이름으로 찾기' }: ShelfProps<T>) {
  const S = St(), [, bump] = useReducer((x: number) => x + 1, 0);
  const all = ctx.all as unknown as Item[], prefs = prefsOf(coll), sort: ShelfSort = prefs.sort || 'recent', closed = new Set(prefs.closed || []);
  const [q, setQ] = useState(''), term = q.trim().toLowerCase();
  const folders: ShelfFolder[] = foldersKey ? ((S.settings[foldersKey] as ShelfFolder[] | undefined) || []) : [];
  const folderOf = (o: Item) => (o.folder && folders.some(f => f.id === o.folder) ? o.folder : '');
  const redraw = () => { bump(); ctx.redraw(); };
  const save = (o: Item) => S.save(coll, o, true);
  const saveFolders = (fs: ShelfFolder[]) => { if (foldersKey) S.set({ [foldersKey]: fs }); };

  // ── 정렬 ──
  const idx = new Map(all.map((o, i) => [o.id, i]));
  const made = (o: Item) => o.createdAt || idx.get(o.id) || 0;
  const manualKey = (o: Item) => o.order ?? 1e6 + (idx.get(o.id) || 0);
  const byName = (a: Item, b: Item) => String(a.name || '').localeCompare(String(b.name || ''), 'ko');
  const cmp = (a: Item, b: Item) => {
    if (sort === 'recent') return +(b.id === active) - +(a.id === active) || (b.usedAt || 0) - (a.usedAt || 0) || byName(a, b);
    if (sort === 'freq') return (b.useCount || 0) - (a.useCount || 0) || (b.usedAt || 0) - (a.usedAt || 0) || byName(a, b);
    if (sort === 'name') return byName(a, b);
    if (sort === 'new') return made(b) - made(a);
    return manualKey(a) - manualKey(b);
  };
  const hit = (o: Item) => !term || (text ? text(o as unknown as T) : String(o.name || '')).toLowerCase().includes(term);
  const sorted = all.filter(hit).sort(cmp);
  const pinned = sorted.filter(o => o.pinned), rest = sorted.filter(o => !o.pinned);
  const grouped = !!foldersKey && !term && !prefs.flat && folders.length > 0;

  // ── 직접 순서: 한 묶음 안에서 옮기면 전체 순서에 반영한다 ──
  const focusId = useRef('');
  useLayoutEffect(() => { if (focusId.current) { document.querySelector<HTMLElement>(`.shelf-row[data-id="${CSS.escape(focusId.current)}"] .grip`)?.focus(); focusId.current = ''; } });
  const moveIn = async (group: Item[], from: number, to: number, grab = false) => {
    if (to < 0 || to >= group.length || to === from) return;
    const seq = [...group]; const [x] = seq.splice(from, 1); seq.splice(to, 0, x);
    const global = [...all].sort((a, b) => manualKey(a) - manualKey(b)), slots = new Set(group.map(o => o.id));
    let k = 0; const next = global.map(o => (slots.has(o.id) ? seq[k++] : o));
    for (let i = 0; i < next.length; i++) if (next[i].order !== i) { next[i].order = i; await save(next[i]); }
    if (grab) focusId.current = x.id;
    redraw();
  };

  // ── 폴더 ──
  const newFolder = async () => {
    const v = await promptBox('폴더 이름', '', { placeholder: '예: 자주 쓰는 것, 실험용, 친구가 준 것' }); if (!v?.trim()) return null;
    const fo = { id: L.core.uid(), name: v.trim().slice(0, 40) }; saveFolders([...folders, fo]); if (prefs.flat) setPrefs(coll, { flat: false }); redraw(); return fo;
  };
  const moveTo = async (ids: string[], fid: string) => { for (const id of ids) { const o = S.get(coll, id) as Item | undefined; if (o && (o.folder || '') !== fid) { o.folder = fid; await save(o); } } };
  const fill = (fo: ShelfFolder) => pickMany(`"${fo.name}"에 담기`, [...all].sort(byName), all.filter(o => folderOf(o) === fo.id).map(o => o.id),
    o => { const f = folders.find(x => x.id === folderOf(o)); return f && f.id !== fo.id ? f.name : ''; },
    async ids => { const keep = new Set(ids); await moveTo(all.filter(o => folderOf(o) === fo.id && !keep.has(o.id)).map(o => o.id), ''); await moveTo(ids, fo.id); redraw(); });
  const folderMenu = (anchor: Element, fo: ShelfFolder) => {
    const i = folders.indexOf(fo), swap = (j: number) => { if (j < 0 || j >= folders.length) return; const fs = [...folders]; [fs[i], fs[j]] = [fs[j], fs[i]]; saveFolders(fs); redraw(); };
    menu(anchor, [
      { label: '여러 개 담기', ic: 'plus', onclick: () => fill(fo) },
      { label: '이름 바꾸기', ic: 'edit', onclick: async () => { const v = await promptBox('폴더 이름', fo.name); if (v?.trim()) { saveFolders(folders.map(f => (f === fo ? { ...f, name: v.trim().slice(0, 40) } : f))); redraw(); } } },
      i > 0 && { label: '위로', ic: 'up', onclick: () => swap(i - 1) },
      i < folders.length - 1 && { label: '아래로', ic: 'down', onclick: () => swap(i + 1) },
      '-',
      { label: '폴더 삭제', ic: 'trash', danger: true, hint: '안의 항목은 남아요', onclick: async () => {
        if (!(await confirmBox(`"${fo.name}" 폴더를 삭제할까요? 안에 있던 항목은 지워지지 않고 폴더 없음으로 돌아갑니다.`, '삭제', true))) return;
        await moveTo(all.filter(o => o.folder === fo.id).map(o => o.id), ''); saveFolders(folders.filter(f => f !== fo)); redraw();
      } }]);
  };
  const itemMenu = (anchor: Element, o: Item, full?: Item[], per?: number) => {
    const cur = folderOf(o), items: MenuItem[] = [
      { label: o.pinned ? '즐겨찾기 풀기' : '즐겨찾기 (맨 위에 고정)', ic: 'star', onclick: () => togglePin(o) },
    ];
    if (full && per && sort === 'manual' && !term && full.length > per) items.push('-', ...crossPageItems(full.indexOf(o), full.length, per, (a, b) => void moveIn(full, a, b)));
    if (foldersKey) items.push('-', ...folders.map(fo => ({ label: fo.name, ic: cur === fo.id ? 'check' : 'folder', onclick: async () => { await moveTo([o.id], fo.id); redraw(); } })),
      cur ? { label: '폴더에서 꺼내기', ic: 'x', onclick: async () => { await moveTo([o.id], ''); redraw(); } } : null,
      { label: '새 폴더에 담기', ic: 'plus', onclick: async () => { const fo = await newFolder(); if (fo) { await moveTo([o.id], fo.id); redraw(); } } });
    menu(anchor, items);
  };
  const togglePin = async (o: Item) => { o.pinned = !o.pinned; await save(o); redraw(); };
  const toggleClosed = (id: string) => { if (!closed.delete(id)) closed.add(id); setPrefs(coll, { closed: [...closed] }); bump(); };

  // ── 줄과 묶음 ──
  const row = (o: Item, group: Item[], i: number, full?: Item[], per?: number) => <div key={o.id} className={'shelf-row' + (o.id === ctx.current ? ' on' : '')} data-id={o.id}>
    {sort === 'manual' && !term && <button className="grip" type="button" title="잡고 끌어서 순서 바꾸기 (방향키 ↑ ↓ 로도)" aria-label="순서 바꾸기"
      onKeyDown={ev => { if (ev.key === 'ArrowUp' || ev.key === 'ArrowDown') { ev.preventDefault(); void moveIn(group, i, i + (ev.key === 'ArrowUp' ? -1 : 1), true); } }}><Icon name="grip" size={16} /></button>}
    {ctx.item(o as unknown as T)}
    <button className={'shelf-pin' + (o.pinned ? ' on' : '')} type="button" title={o.pinned ? '즐겨찾기 풀기' : '즐겨찾기 (맨 위에 고정)'} aria-pressed={!!o.pinned} onClick={() => void togglePin(o)}><Icon name="star" size={15} /></button>
    <IconBtn ic="more" title={foldersKey ? '즐겨찾기 · 폴더' : '즐겨찾기'} cls="tiny" onClick={e => itemMenu(e.currentTarget, o, full, per)} />
  </div>;
  const group = (rows: Item[], full?: Item[], per?: number) => <DragBox on={sort === 'manual' && !term} onMove={(from, to) => void moveIn(rows, from, to)}>{rows.map((o, i) => row(o, rows, i, full, per))}</DragBox>;
  const paged = (rows: Item[], k: string) => <PagedBox key={k} rows={rows} id={coll} perPage={pageSize} resetKey={`${term}|${sort}`} focusIndex={rows.findIndex(o => o.id === ctx.current)}>{(page, per) => group(page, rows, per)}</PagedBox>;
  const section = (id: string, name: string, rows: Item[], fo?: ShelfFolder) => {
    const shut = closed.has(id);
    return <div key={id} className={'shelf-sec' + (shut ? ' shut' : '')}>
      <div className="shelf-sec-head">
        <button type="button" className="shelf-fold" aria-expanded={!shut} onClick={() => toggleClosed(id)}><Icon name={shut ? 'right' : 'down'} size={14} />{fo ? <Icon name="folder" size={14} /> : id === ':pin' ? <Icon name="star" size={14} /> : null}<span>{name}</span><em>{rows.length}</em></button>
        {fo && <IconBtn ic="more" title="폴더 담기 · 이름 · 삭제" cls="tiny" onClick={e => folderMenu(e.currentTarget, fo)} />}
      </div>
      {!shut && (rows.length ? paged(rows, id) : <p className="dim shelf-none">{fo ? '비어 있어요. ⋯ 에서 여러 개 담기로 넣을 수 있어요.' : '없어요.'}</p>)}
    </div>;
  };

  const flat = [...pinned, ...rest];

  let body: ReactNode;
  if (!sorted.length) body = <p className="dim shelf-none">{term ? '찾는 항목이 없어요.' : '아직 없어요.'}</p>;
  else if (grouped) body = <>
    {pinned.length ? section(':pin', '즐겨찾기', pinned) : null}
    {folders.map(fo => section(fo.id, fo.name, rest.filter(o => folderOf(o) === fo.id), fo))}
    {section(':none', '폴더 없음', rest.filter(o => !folderOf(o)))}
  </>;
  else body = paged(flat, ':flat');

  return <>
    <div className="shelf-bar">
      <div className="search-wrap"><Icon name="search" size={15} /><input className="inp search" placeholder={placeholder} value={q} onChange={e => setQ(e.target.value)} /></div>
      <select className="inp shelf-sort" aria-label="정렬" value={sort} onChange={e => { setPrefs(coll, { sort: e.target.value as ShelfSort }); bump(); }}>{SORTS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
      {foldersKey && folders.length ? <IconBtn ic={prefs.flat ? 'folder' : 'menu'} title={prefs.flat ? '폴더별로 보기' : '한 줄로 보기'} onClick={() => { setPrefs(coll, { flat: !prefs.flat }); bump(); }} /> : null}
      {foldersKey && <IconBtn ic="plus" title="새 폴더" cls="shelf-addfolder" onClick={() => void newFolder()} />}
    </div>
    <div className="lib-list shelf-list">{body}</div>
  </>;
}

function DragBox({ on, onMove, children }: { on: boolean; onMove: (from: number, to: number) => void; children: ReactNode }) {
  const ref = useDragSort(onMove);
  return <div className="shelf-group" ref={on ? ref : undefined}>{children}</div>;
}
function PagedBox({ rows, id, perPage, resetKey, focusIndex, children }: { rows: Item[]; id: string; perPage: number; resetKey: string; focusIndex: number; children: (page: Item[], per: number) => ReactNode }) {
  const pg = usePaged(rows, { id, perPage, resetKey, focusIndex });
  return <><div className="shelf-page" ref={pg.listRef}>{children(pg.rows, pg.perPage)}</div>{pg.pager}</>;
}
