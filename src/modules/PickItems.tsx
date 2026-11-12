// 여러 개 고르기 창: 많아도 찾을 수 있게 검색 · 보이는 것 모두 고르기
import { useState } from 'react';
import { Avatar, Btn, Icon } from '../kit';
import type { Char } from '../types';
import { openModal, type ModalX } from '../studio/bridge';

export interface PickItem { id: string; title: string; sub?: string; search: string; ic?: string; thumb?: string; av?: Char }
interface PickOpts { title: string; items: PickItem[]; multi?: boolean; okLabel?: string; ph?: string; empty?: string; onDone: (ids: string[]) => void }

function Body({ o, picked, box }: { o: PickOpts; picked: Set<string>; box: ModalX }) {
  const { items, multi = true, ph = '이름으로 찾기', empty = '고를 수 있는 것이 없어요.' } = o;
  const [q, setQ] = useState(''), [, bump] = useState(0), redraw = () => bump(n => n + 1);
  const t = q.trim().toLowerCase(), rows = items.filter(it => !t || it.search.includes(t)), found = q.trim() ? `찾은 것 ${rows.length}개 · ` : '';
  const click = (it: PickItem) => { if (!multi) { box.close(); return o.onDone([it.id]); } if (picked.has(it.id)) picked.delete(it.id); else picked.add(it.id); redraw(); };
  return <>
    <input className="inp search" placeholder={ph} value={q} onChange={e => setQ(e.target.value)} />
    <div className="row wrap mod-pick-head"><small className="hint">{multi ? `${picked.size}개 고름 · ${found}전체 ${items.length}개` : `${found}전체 ${items.length}개`}</small>
      {multi && items.length > 1 ? <div className="row mod-pick-tools"><Btn label="보이는 것 모두" cls="ghost" onClick={() => { for (const it of rows) picked.add(it.id); redraw(); }} /><Btn label="고른 것 비우기" cls="ghost" onClick={() => { picked.clear(); redraw(); }} /></div> : null}</div>
    <div className="picker-list mod-pick">
      {rows.slice(0, 200).map(it => <button key={it.id} type="button" className={'picker-row' + (picked.has(it.id) ? ' on' : '')} onClick={() => click(it)}>
        {it.thumb ? <img className="mod-pick-thumb" src={it.thumb} alt="" loading="lazy" /> : it.av ? <Avatar o={it.av} cls="sm" /> : <span className="mod-pick-ic"><Icon name={it.ic || 'note'} size={16} /></span>}
        <div className="picker-text"><b>{it.title}</b><small>{it.sub || ' '}</small></div>{multi && <i className="picker-check"><Icon name="check" size={14} /></i>}
      </button>)}
      {!rows.length && <p className="dim pad">{items.length ? '찾는 것이 없어요.' : empty}</p>}
      {rows.length > 200 && <p className="dim pad">{`${rows.length - 200}개가 더 있어요. 검색어를 넣어 좁혀 주세요.`}</p>}
    </div>
  </>;
}

export function pickItems(o: PickOpts) {
  const picked = new Set<string>(), multi = o.multi ?? true;
  return openModal({ title: o.title, box: 'col', actions: multi ? [{ label: '취소' }, { label: o.okLabel || '담기', cls: 'primary', onclick: () => { if (picked.size) o.onDone([...picked]); } }] : [] },
    box => <Body o={o} picked={picked} box={box} />);
}
