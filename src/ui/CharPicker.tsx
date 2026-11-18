// 캐릭터 고르기: 많아져도 찾을 수 있게 검색 + 목록 (옛 ui.js 의 charPicker)
import { useReducer, useState } from 'react';
import { Avatar, Icon } from '../kit';
import type { Char } from '../types';
import { openModal, type ModalHandle } from './Modal';
import { S } from '../lib/core';
import { locale, t as tr, tn } from '../i18n';

export interface CharPickerOptions {
  title?: string; selected?: string[];
  /** false 면 누르는 즉시 그 하나로 끝난다 */
  multi?: boolean;
  /** 이름 아래에 붙는 꼬리표 */
  note?: (c: Char) => string;
  onDone: (ids: string[]) => void;
}

function Picker({ picked, multi, note, one }: { picked: Set<string>; multi: boolean; note: (c: Char) => string; one: (id: string) => void }) {
  const [q, setQ] = useState(''), [, bump] = useReducer((x: number) => x + 1, 0);
  const chars = S.chars, t = q.trim().toLowerCase();
  const rows = chars.filter(c => !t || (c.name + ' ' + (c.tags || []).join(' ')).toLowerCase().includes(t)).sort((a, b) => +picked.has(b.id) - +picked.has(a.id) || a.name.localeCompare(b.name, locale()));
  return <div className="col">
    <input className="inp search" placeholder={tr('ui.picker.searchPh')} value={q} onChange={e => setQ(e.target.value)} />
    <small className="hint">{multi ? tr('ui.picker.countMulti', { picked: picked.size, total: chars.length }) : tn('ui.picker.count', chars.length)}</small>
    <div className="picker-list">
      {rows.slice(0, 200).map(c => <button key={c.id} className={'picker-row' + (picked.has(c.id) ? ' on' : '')} onClick={() => { if (!multi) return one(c.id); if (!picked.delete(c.id)) picked.add(c.id); bump(); }}>
        <Avatar o={c} cls="sm" /><div className="picker-text"><b>{c.name}</b><small>{[note(c), (c.tags || []).slice(0, 3).map(x => '#' + x).join(' ')].filter(Boolean).join(' · ') || ' '}</small></div>{multi && <i className="picker-check"><Icon name="check" size={14} /></i>}
      </button>)}
      {!rows.length && <p className="dim">{tr('ui.picker.none')}</p>}
      {rows.length > 200 && <p className="dim">{tr('ui.picker.tooMany')}</p>}
    </div>
  </div>;
}

export function charPicker({ title = tr('ui.picker.title'), selected = [], multi = true, note = () => '', onDone }: CharPickerOptions): ModalHandle {
  const picked = new Set(selected);
  const box: ModalHandle = openModal({
    title, body: <Picker picked={picked} multi={multi} note={note} one={id => { box.close(); onDone([id]); }} />,
    actions: multi ? [{ label: tr('common.cancel') }, { label: tr('common.ok'), cls: 'primary', onclick: () => onDone([...picked]) }] : [],
  });
  return box;
}
