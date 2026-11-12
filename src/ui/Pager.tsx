// 쪽 나누기: const pg = usePaged(rows, { id: 'presets', resetKey: q + sort, focusIndex }); pg.rows 를 그리고 {pg.pager} 를 아래에 둔다
// · 실리태번 캐릭터 목록과 같은 꼴: 처음 · 이전 · "1–50 / 400" · 다음 · 끝 · 한 쪽 개수(10 · 25 · 50 · 100 · 250 · 500 · 1000, 기본 50, 설정 pageSizes[id] 에 기억)
// · resetKey 가 바뀌면 1쪽 · 지워서 쪽이 비면 앞쪽 · 쪽을 넘기면 목록(listRef) 맨 위로
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { Icon } from '../kit';
import { S } from '../lib/core';

export interface PagedOpts {
  /** 한 쪽 개수를 기억할 이름. 없으면 기억하지 않는다 */
  id?: string;
  perPage?: number;
  /** 고를 수 있는 한 쪽 개수 */
  sizes?: number[];
  /** 이 값이 바뀌면 1쪽으로 (검색어 · 정렬 · 필터를 이어 붙여 넘긴다) */
  resetKey?: unknown;
  /** 처음 열 때 이 자리가 있는 쪽을 보여 준다 */
  focusIndex?: number;
  /** 한 쪽 개수를 이 수의 배수로 맞춘다 (격자의 한 줄 칸 수). reserve 는 쪽마다 따로 차지하는 칸 수 */
  unit?: number; reserve?: number;
}
export interface Paged<T> { rows: T[]; start: number; page: number; pages: number; perPage: number; setPage(p: number): void; pager: ReactNode; listRef: (el: HTMLElement | null) => void }

type Sizes = Record<string, number>;
const saved = (id?: string) => (id ? ((S.settings as unknown as { pageSizes?: Sizes }).pageSizes || {})[id] : undefined);
const remember = (id: string, n: number) => { const St = S as unknown as { settings: { pageSizes?: Sizes }; set(p: object): void }; St.set({ pageSizes: { ...(St.settings.pageSizes || {}), [id]: n } }); };

/** 1 … 4 5 [6] 7 8 … 20 */
export function pageList(page: number, pages: number): (number | '…')[] {
  const out: (number | '…')[] = [], near = new Set([0, pages - 1, page - 1, page, page + 1]);
  if (page <= 2) [1, 2, 3].forEach(i => near.add(i)); if (page >= pages - 3) [pages - 2, pages - 3, pages - 4].forEach(i => near.add(i));
  let last = -1; for (let i = 0; i < pages; i++) { if (!near.has(i)) continue; if (i - last > 1) out.push('…'); out.push(i); last = i; }
  return out;
}

export function usePaged<T>(list: T[], { id, perPage: base = 50, sizes = [10, 25, 50, 100, 250, 500, 1000], resetKey, focusIndex, unit = 1, reserve = 0 }: PagedOpts = {}): Paged<T> {
  const [size, setSize] = useState(() => saved(id) || base);
  const fit = Math.max(1, unit > 1 ? Math.max(1, Math.round((size + reserve) / unit)) * unit - reserve : size);
  const pages = Math.max(1, Math.ceil(list.length / fit));
  const [page, setPageRaw] = useState(() => (focusIndex != null && focusIndex >= 0 ? Math.floor(focusIndex / fit) : 0));
  const key = useRef(resetKey); if (key.current !== resetKey) { key.current = resetKey; if (page) setPageRaw(0); }
  const pg = Math.min(page, pages - 1), el = useRef<HTMLElement | null>(null), jumped = useRef(false);
  const setPage = useCallback((p: number) => { jumped.current = true; setPageRaw(p); }, []);
  useEffect(() => {   // 쪽을 넘기면 목록 맨 위로
    if (!jumped.current || !el.current) return; jumped.current = false;
    const box = el.current, first = (getComputedStyle(box).display === 'contents' ? box.firstElementChild : box) as HTMLElement | null; if (!first) return;
    let sc: HTMLElement | null = box; while (sc && !(sc.scrollHeight > sc.clientHeight + 2 && /(auto|scroll)/.test(getComputedStyle(sc).overflowY))) sc = sc.parentElement;
    const top = first.getBoundingClientRect().top;
    if (sc) { const d = top - sc.getBoundingClientRect().top; if (sc === box) sc.scrollTop = 0; else if (d < 0 || d > sc.clientHeight / 2) sc.scrollTop += d - 8; }
    else if (top < 0 || top > innerHeight / 2) scrollBy({ top: top - 70 });
  }, [pg]);
  const listRef = useCallback((x: HTMLElement | null) => { el.current = x; }, []);
  const start = pg * fit, rows = list.slice(start, start + fit);
  const opts = [...new Set([...sizes, size])].sort((a, b) => a - b);
  const end = Math.min(list.length, start + fit), dbl = (ic: string) => <span className="pg-dbl"><Icon name={ic} size={14} /><Icon name={ic} size={14} /></span>;
  const pager = list.length > Math.min(fit, ...sizes) || pages > 1 ? <nav className="pager" aria-label="쪽 이동">
    <button type="button" className="pg-step" disabled={pg === 0} title="첫 쪽" aria-label="첫 쪽" onClick={() => setPage(0)}>{dbl('left')}</button>
    <button type="button" className="pg-step" disabled={pg === 0} title="앞 쪽" aria-label="앞 쪽" onClick={() => setPage(pg - 1)}><Icon name="left" size={16} /></button>
    <small className="pg-info" title={`${pg + 1} / ${pages}쪽`}>{`${start + 1}–${end} / ${list.length}`}</small>
    <button type="button" className="pg-step" disabled={pg >= pages - 1} title="다음 쪽" aria-label="다음 쪽" onClick={() => setPage(pg + 1)}><Icon name="right" size={16} /></button>
    <button type="button" className="pg-step" disabled={pg >= pages - 1} title="마지막 쪽" aria-label="마지막 쪽" onClick={() => setPage(pages - 1)}>{dbl('right')}</button>
    <select className="inp pg-size" aria-label="한 쪽에 보일 수" title="한 쪽에 보일 수" value={size} onChange={e => { const n = +e.target.value; setSize(n); if (id) remember(id, n); setPage(0); }}>
      {opts.map(n => <option key={n} value={n}>{`${unit > 1 ? Math.max(1, Math.round((n + reserve) / unit)) * unit - reserve : n}개씩`}</option>)}</select>
  </nav> : null;
  return { rows, start, page: pg, pages, perPage: fit, setPage, pager, listRef };
}

/** 한 쪽 안에서만 끌어 옮길 수 있는 목록에 붙이는 "다른 쪽으로" 메뉴 항목 */
export function crossPageItems(at: number, total: number, perPage: number, move: (from: number, to: number) => void) {
  const page = Math.floor(at / perPage), start = page * perPage;
  return [
    page > 0 && { label: '앞 쪽 끝으로', ic: 'up', onclick: () => move(at, start - 1) },
    start + perPage < total && { label: '다음 쪽 처음으로', ic: 'down', onclick: () => move(at, start + perPage) },
    at > 0 && { label: '맨 처음으로', ic: 'up', onclick: () => move(at, 0) },
    at < total - 1 && { label: '맨 끝으로', ic: 'down', onclick: () => move(at, total - 1) },
  ];
}
