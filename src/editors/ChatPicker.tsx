// 대화방 여러 개 고르기: 캐릭터별로 묶고, 찾고, 묶음째 고른다. 방이 아주 많아도 쓸 수 있게 묶음은 접혀 있다
import { useRef, useState } from 'react';
import { Avatar, Icon } from '../kit';
import { openModal, type ModalHandle } from '../ui';
import type { XChar, XChat } from './types';
import { useBump } from './parts';
import { S } from '../lib/core';
import { t as tr, tn, locale } from '../i18n';

const charName = (c: XChat) => c.charIds.map(i => S.get('chars', i)?.name).filter(Boolean).join(', ');
/** 대화방 이름: 가져온 이름 앞의 캐릭터 이름은 떼고, 이름이 없으면 날짜로 */
export const roomLabel = (c: XChat) => {
  const t = charName(c), n = String(c.name || '').trim();
  const cut = t && n.toLowerCase().startsWith(t.toLowerCase()) ? n.slice(t.length).replace(/^[\s\-–—·:@]+/, '') : n;
  return cut || tr('editors.picker.dated', { date: new Date(c.createdAt || 0).toLocaleDateString(locale(), { year: '2-digit', month: 'numeric', day: 'numeric' }) });
};
const keyOf = (c: XChat) => [...c.charIds].sort().join('+') || '-', titleOf = (c: XChat) => charName(c) || tr('editors.picker.deletedChar');
const day = (t?: number) => new Date(t || 0).toLocaleDateString(locale(), { month: 'numeric', day: 'numeric' });

function Picker({ picked, note }: { picked: Set<string>; note: (c: XChat) => string }) {
  const redraw = useBump(), open = useRef(new Set<string>()).current, [q, setQ] = useState('');
  const t = q.trim().toLowerCase(), groups = new Map<string, XChat[]>();
  for (const c of S.chats) { if (t && !(titleOf(c) + ' ' + roomLabel(c) + ' ' + (c.preview || '')).toLowerCase().includes(t)) continue; const k = keyOf(c); if (!groups.has(k)) groups.set(k, []); groups.get(k)!.push(c); }
  const has = (rooms: XChat[]) => +rooms.some(c => picked.has(c.id)), last = (rooms: XChat[]) => Math.max(...rooms.map(c => c.updatedAt || 0));
  const sorted = [...groups.entries()].sort((a, b) => has(b[1]) - has(a[1]) || last(b[1]) - last(a[1]));
  const flip = (id: string) => { if (!picked.delete(id)) picked.add(id); redraw(); };
  return <div className="col">
    <input className="inp search" placeholder={tr('editors.picker.search')} onChange={e => setQ(e.target.value)} />
    <small className="hint">{tr('editors.picker.status', { n: picked.size, total: S.chats.length })}</small>
    <div className="picker-list cpick">
      {sorted.slice(0, 120).flatMap(([k, rooms]) => {
        const n = rooms.filter(c => picked.has(c.id)).length, all = n === rooms.length, show = !!t || open.has(k) || sorted.length <= 3, first = rooms[0].charIds.map(i => S.get('chars', i)).find((x): x is XChar => !!x);
        rooms.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
        return [<div className={'cpick-group' + (show ? ' open' : '')} key={k}>
          <button className="cpick-head" onClick={() => { if (!open.delete(k)) open.add(k); redraw(); }}>{first ? <Avatar o={first} cls="sm" /> : null}<div className="picker-text"><b>{titleOf(rooms[0])}</b><small>{tn('editors.picker.rooms', rooms.length) + (n ? tr('editors.picker.roomsPicked', { n }) : '')}</small></div><Icon name={show ? 'down' : 'right'} size={15} /></button>
          <button className="cpick-all" title={all ? tr('editors.picker.unpickAllTitle') : tr('editors.picker.pickAllTitle')} onClick={() => { for (const c of rooms) { if (all) picked.delete(c.id); else picked.add(c.id); } redraw(); }}>{all ? tr('editors.picker.unpickAll') : tr('editors.picker.pickAll')}</button>
        </div>,
        ...(show ? rooms.slice(0, 80).map(c => <button key={c.id} className={'picker-row cpick-room' + (picked.has(c.id) ? ' on' : '')} onClick={() => flip(c.id)}>
          <div className="picker-text"><b>{roomLabel(c)}</b><small>{[note(c), tn('editors.picker.msgs', c.count || 0), day(c.updatedAt), c.mode === 'talk' ? tr('editors.picker.talk') : 'RP', (c.preview || '').slice(0, 40)].filter(Boolean).join(' · ')}</small></div><i className="picker-check"><Icon name="check" size={14} /></i></button>) : [])];
      })}
      {!sorted.length && <p className="dim">{tr('editors.picker.none')}</p>}
      {sorted.length > 120 && <p className="dim">{tr('editors.picker.narrow')}</p>}
    </div>
  </div>;
}

export function chatPicker({ title = tr('editors.picker.title'), selected = [], note = () => '', onDone }: { title?: string; selected?: string[]; note?: (c: XChat) => string; onDone: (ids: string[]) => void }): ModalHandle {
  const picked = new Set(selected);
  return openModal({ title, body: <Picker picked={picked} note={note} />, actions: [{ label: tr('common.cancel') }, { label: tr('common.ok'), cls: 'primary', onclick: () => onDone([...picked]) }] });
}
