// 목록 + 편집기 2단 화면 (옛 ui.js 의 libraryPage)
import { Fragment, useReducer, useState, type ReactNode } from 'react';
import { Btn, Icon, IconBtn } from '../kit';
import { usePaged } from './Pager';
import { route } from '../lib/router';
import { S } from '../lib/core';

export interface LibApi {
  /** 목록만 다시 그린다 (편집기는 그대로) */
  redraw(): void;
  /** 지금 항목을 조용히 저장 */
  save(): Promise<unknown>;
  /** 다른 항목을 골라 편집기까지 새로 만든다 */
  reselect(id: string): void;
}
export interface LibraryProps<T extends { id: string }> {
  /** 화면이 받은 arg — 처음 고를 항목의 id */
  arg?: unknown;
  title: ReactNode; eyebrow?: string;
  /** S 의 모음 이름 (S[coll] · S.get(coll, id) · S.save(coll, o, true)) */
  coll: string;
  /** 고른 것이 없을 때 빈 자리에 보이는 아이콘 */
  ic: string;
  create: () => T;
  label: (o: T) => ReactNode; sub?: (o: T) => ReactNode; thumb?: (o: T) => ReactNode;
  /** 목록에서 바로 누르는 스위치 자리. 있으면 줄이 div.lib-row 로 감싸인다 */
  trail?: (o: T, redraw: () => void) => ReactNode;
  note?: () => ReactNode;
  editor: (o: T, api: LibApi) => ReactNode;
  /** + 왼쪽의 아이콘 단추들. draw 를 부르면 편집기까지 새로 만든다 */
  actions?: { ic: string; title: string; onclick: (draw: () => void) => void }[];
  empty?: ReactNode;
  /** 목록 자리를 직접 그린다 (정렬 · 폴더 · 쪽 나누기 등). item(x) 는 기본 줄, pick(id) 는 그 항목 고르기 */
  /** 기본 목록에 검색 + 쪽 나누기를 붙인다. id 는 한 쪽 개수를 기억할 이름, text 는 검색할 글 */
  paged?: { id: string; perPage?: number; text?: (o: T) => string; placeholder?: string };
  list?: (ctx: { all: T[]; current?: string; item: (x: T) => ReactNode; pick: (id: string) => void; redraw: () => void }) => ReactNode;
}

interface AnyStore { get(coll: string, id: string): unknown; save(coll: string, o: unknown, silent?: boolean): Promise<unknown> }

export function LibraryPage<T extends { id: string }>({ arg, title, eyebrow, coll, ic, create, label, sub, thumb, trail, note, editor, actions = [], empty, list, paged }: LibraryProps<T>) {
  const St = S as unknown as AnyStore & Record<string, unknown>;
  const all = (St[coll] as T[] | undefined) || [];
  const [current, setCurrent] = useState<string | undefined>(() => (typeof arg === 'string' && arg) || all[0]?.id);
  const [show, setShow] = useState(!!arg);
  const [gen, draw] = useReducer((x: number) => x + 1, 0);       // 편집기까지 새로
  const [, redraw] = useReducer((x: number) => x + 1, 0);        // 목록만
  const pick = (id: string) => { setCurrent(id); route.arg = id; setShow(true); draw(); };
  const o = current ? St.get(coll, current) as T | undefined : undefined;
  const row = (x: T) => {
    const item = <button key={x.id} className={'lib-item' + (x.id === current ? ' on' : '') + (thumb ? ' has-thumb' : '')} onClick={() => pick(x.id)}>
      {thumb && thumb(x)}<div className="lib-text"><b>{label(x)}</b>{sub && <small>{sub(x)}</small>}</div>
    </button>;
    return trail ? <div key={x.id} className={'lib-row' + (x.id === current ? ' on' : '')}>{item}{trail(x, redraw)}</div> : item;
  };

  return <section className={'lib' + (show ? ' show-editor' : '')}>
    <aside className="lib-side">
      <header className="lib-head">
        <div className="phead-text"><span className="eyebrow">{`${eyebrow || coll} · ${String(all.length).padStart(2, '0')}`}</span><h1>{title}</h1></div>
        <div className="row">
          {actions.map((a, i) => <IconBtn key={i} ic={a.ic} title={a.title} onClick={() => a.onclick(draw)} />)}
          <IconBtn ic="plus" title="새로 만들기" cls="accent" onClick={async () => { const n = create(); await St.save(coll, n, true); pick(n.id); }} />
        </div>
      </header>
      {note ? <div className="lib-note">{note()}</div> : null}
      {list ? list({ all, current, item: x => row(x), pick, redraw })
        : paged ? <PagedLib all={all} current={current} row={row} {...paged} label={label} />
        : <div className="lib-list">{all.map(x => row(x))}</div>}
    </aside>
    <div className="lib-editor">
      <Btn label="목록으로" ic="left" cls="ghost lib-back" onClick={() => setShow(false)} />
      <Fragment key={gen}>{o
        ? editor(o, { redraw, save: () => St.save(coll, o, true), reselect: id => { setCurrent(id); draw(); } })
        : <div className="empty"><Icon name={ic} size={34} /><p>{empty || '왼쪽에서 항목을 고르거나 새로 만들어 보세요.'}</p></div>}</Fragment>
    </div>
  </section>;
}

function PagedLib<T extends { id: string }>({ all, current, row, id, perPage = 30, text, placeholder = '이름으로 찾기', label }: { all: T[]; current?: string; row: (x: T) => ReactNode; id: string; perPage?: number; text?: (o: T) => string; placeholder?: string; label: (o: T) => ReactNode }) {
  const [q, setQ] = useState(''), t = q.trim().toLowerCase();
  const rows = t ? all.filter(o => (text ? text(o) : String(label(o) ?? '')).toLowerCase().includes(t)) : all;
  const pg = usePaged(rows, { id, perPage, resetKey: t, focusIndex: rows.findIndex(o => o.id === current) });
  return <>
    <div className="shelf-bar"><div className="search-wrap"><Icon name="search" size={15} /><input className="inp search" placeholder={placeholder} value={q} onChange={e => setQ(e.target.value)} /></div></div>
    <div className="lib-list" ref={pg.listRef}>{pg.rows.map(x => row(x))}{!rows.length && <p className="dim shelf-none">찾는 항목이 없어요.</p>}</div>
    {pg.pager}
  </>;
}
