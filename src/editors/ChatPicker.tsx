// 대화방 여러 개 고르기: 캐릭터별로 묶고, 찾고, 묶음째 고른다. 방이 아주 많아도 쓸 수 있게 묶음은 접혀 있다
import { useRef, useState } from 'react';
import { Avatar, Icon } from '../kit';
import { openModal, type ModalHandle } from '../ui';
import { store, type XChar, type XChat } from './bridge';
import { useBump } from './parts';

const charName = (c: XChat) => c.charIds.map(i => store().get('chars', i)?.name).filter(Boolean).join(', ');
/** 대화방 이름: 가져온 이름 앞의 캐릭터 이름은 떼고, 이름이 없으면 날짜로 */
export const roomLabel = (c: XChat) => {
  const t = charName(c), n = String(c.name || '').trim();
  const cut = t && n.toLowerCase().startsWith(t.toLowerCase()) ? n.slice(t.length).replace(/^[\s\-–—·:@]+/, '') : n;
  return cut || new Date(c.createdAt || 0).toLocaleDateString('ko-KR', { year: '2-digit', month: 'numeric', day: 'numeric' }) + ' 대화';
};
const keyOf = (c: XChat) => [...c.charIds].sort().join('+') || '-', titleOf = (c: XChat) => charName(c) || '삭제된 캐릭터';
const day = (t?: number) => new Date(t || 0).toLocaleDateString('ko-KR', { month: 'numeric', day: 'numeric' });

function Picker({ picked, note }: { picked: Set<string>; note: (c: XChat) => string }) {
  const S = store(), redraw = useBump(), open = useRef(new Set<string>()).current, [q, setQ] = useState('');
  const t = q.trim().toLowerCase(), groups = new Map<string, XChat[]>();
  for (const c of S.chats) { if (t && !(titleOf(c) + ' ' + roomLabel(c) + ' ' + (c.preview || '')).toLowerCase().includes(t)) continue; const k = keyOf(c); if (!groups.has(k)) groups.set(k, []); groups.get(k)!.push(c); }
  const has = (rooms: XChat[]) => +rooms.some(c => picked.has(c.id)), last = (rooms: XChat[]) => Math.max(...rooms.map(c => c.updatedAt || 0));
  const sorted = [...groups.entries()].sort((a, b) => has(b[1]) - has(a[1]) || last(b[1]) - last(a[1]));
  const flip = (id: string) => { if (!picked.delete(id)) picked.add(id); redraw(); };
  return <div className="col">
    <input className="inp search" placeholder="캐릭터 · 대화방 이름 · 내용으로 찾기" onChange={e => setQ(e.target.value)} />
    <small className="hint">{`${picked.size}개 선택 · 전체 ${S.chats.length}개`}</small>
    <div className="picker-list cpick">
      {sorted.slice(0, 120).flatMap(([k, rooms]) => {
        const n = rooms.filter(c => picked.has(c.id)).length, all = n === rooms.length, show = !!t || open.has(k) || sorted.length <= 3, first = rooms[0].charIds.map(i => S.get('chars', i)).find((x): x is XChar => !!x);
        rooms.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
        return [<div className={'cpick-group' + (show ? ' open' : '')} key={k}>
          <button className="cpick-head" onClick={() => { if (!open.delete(k)) open.add(k); redraw(); }}>{first ? <Avatar o={first} cls="sm" /> : null}<div className="picker-text"><b>{titleOf(rooms[0])}</b><small>{`대화방 ${rooms.length}개${n ? ` · ${n}개 선택` : ''}`}</small></div><Icon name={show ? 'down' : 'right'} size={15} /></button>
          <button className="cpick-all" title={all ? '이 캐릭터의 대화방 모두 빼기' : '이 캐릭터의 대화방 모두 고르기'} onClick={() => { for (const c of rooms) { if (all) picked.delete(c.id); else picked.add(c.id); } redraw(); }}>{all ? '모두 빼기' : '모두'}</button>
        </div>,
        ...(show ? rooms.slice(0, 80).map(c => <button key={c.id} className={'picker-row cpick-room' + (picked.has(c.id) ? ' on' : '')} onClick={() => flip(c.id)}>
          <div className="picker-text"><b>{roomLabel(c)}</b><small>{[note(c), `${c.count || 0}개`, day(c.updatedAt), c.mode === 'talk' ? '대화 모드' : 'RP', (c.preview || '').slice(0, 40)].filter(Boolean).join(' · ')}</small></div><i className="picker-check"><Icon name="check" size={14} /></i></button>) : [])];
      })}
      {!sorted.length && <p className="dim">찾는 대화방이 없어요.</p>}
      {sorted.length > 120 && <p className="dim">검색어를 더 넣어 좁혀 주세요.</p>}
    </div>
  </div>;
}

export function chatPicker({ title = '대화방 고르기', selected = [], note = () => '', onDone }: { title?: string; selected?: string[]; note?: (c: XChat) => string; onDone: (ids: string[]) => void }): ModalHandle {
  const picked = new Set(selected);
  return openModal({ title, body: <Picker picked={picked} note={note} />, actions: [{ label: '취소' }, { label: '확인', cls: 'primary', onclick: () => onDone([...picked]) }] });
}
