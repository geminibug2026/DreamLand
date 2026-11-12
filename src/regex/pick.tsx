// 정규식 화면의 고르는 창: 하나 고르기 · 프리셋 · 캐릭터 · 옮길 곳 · 대화의 메시지
import { useState } from 'react';
import { Avatar, Icon } from '../kit';
import type { Char, Chat } from '../types';
import type { Msg } from '../studio/parts';
import { Cards, G, chatApi, chatLabel, clip, lastChat, type Sc } from './lib';
import { S } from '../lib/core';
import * as core from '../lib/core';
import { arr, menu, openModal, toast } from '../studio/parts';

interface PickRow { id: string; title: string; sub?: string; ic?: string; av?: Char }
interface PickOpts { title: string; items: PickRow[]; empty?: string; ph?: string }

function PickBody({ o, pick }: { o: PickOpts; pick: (id: string) => void }) {
  const { items, empty = '고를 것이 없어요.', ph = '이름으로 찾기' } = o;
  const [q, setQ] = useState('');
  const t = q.trim().toLowerCase(), rows = items.filter(it => !t || (it.title + ' ' + (it.sub || '')).toLowerCase().includes(t));
  return <>
    {items.length > 8 ? <input className="inp search" placeholder={ph} value={q} onChange={e => setQ(e.target.value)} /> : null}
    <div className="picker-list">
      {rows.slice(0, 200).map(it => <button key={it.id} type="button" className="picker-row" onClick={() => pick(it.id)}>
        {it.av ? <Avatar o={it.av} cls="sm" /> : <span className="rx-pick-ic"><Icon name={it.ic || 'note'} size={16} /></span>}<div className="picker-text"><b>{it.title}</b><small>{it.sub || ' '}</small></div>
      </button>)}
      {!rows.length && <p className="dim pad">{items.length ? '찾는 것이 없어요.' : empty}</p>}{rows.length > 200 && <p className="dim pad">검색어를 넣어 좁혀 주세요.</p>}
    </div>
  </>;
}
/** 목록에서 하나 고르기 → id (닫으면 null) */
export function pickOne(o: PickOpts) {
  return new Promise<string | null>(res => {
    let done = false;
    openModal({ title: o.title, box: 'col', onClose: () => { if (!done) res(null); } }, m => <PickBody o={o} pick={id => { done = true; m.close(); res(id); }} />);
  });
}
export const pickPreset = (title = '프리셋 고르기') => pickOne({ title, items: S.presets.map(p => ({ id: p.id, ic: 'sliders', title: p.name, sub: `정규식 ${arr(p.regex).length}개${p.id === S.settings.activePreset ? ' · 사용 중' : ''}` })) });
export const pickChar = (title = '캐릭터 고르기') => pickOne({ title, ph: '이름으로 찾기', empty: '아직 캐릭터가 없어요.',
  items: S.chars.map(c => ({ c, n: Cards.scopedRegex(c.id).length })).sort((a, b) => +(b.n > 0) - +(a.n > 0) || a.c.name.localeCompare(b.c.name, 'ko')).map(({ c, n }) => ({ id: c.id, av: c, title: c.name, sub: `정규식 ${n}개` })) });
/** 옮길 곳을 고른다 → sc (메뉴를 그냥 닫으면 돌아오지 않는다) */
export function pickTarget(anchor: Element, except?: Sc) {
  return new Promise<Sc | null>(res => menu(anchor, [
    (!except || except.kind !== 'global') && { label: '전역으로', ic: 'moon', onclick: () => res(G) },
    { label: '프리셋으로…', ic: 'sliders', onclick: async () => { const id = await pickPreset('어느 프리셋으로 옮길까요?'); res(id ? { kind: 'preset', id } : null); } },
    { label: '캐릭터로…', ic: 'user', onclick: async () => { const id = await pickChar('어느 캐릭터로 옮길까요?'); res(id ? { kind: 'char', id } : null); } },
  ]));
}
export interface Picked { text: string; m: Msg; chat: Chat; index: number; msgs: Msg[] }
/** 대화에서 메시지 하나 고르기 */
export async function pickMessage(chatIn?: Chat | null): Promise<Picked | null> {
  const chat = chatIn || lastChat(); if (!chat) { toast('아직 대화가 없어요', 'err'); return null; }
  const cur = chatApi.current(), msgs = cur.chat?.id === chat.id ? cur.msgs : await S.msgs(chat.id);
  if (!msgs.length) { toast('이 대화에는 메시지가 없어요', 'err'); return null; }
  const text = core.msgText;
  const items = msgs.map((m, i) => ({ id: String(i), ic: m.role === 'user' ? 'user' : m.role === 'system' ? 'note' : 'chat', title: `#${i + 1} ${m.role === 'user' ? '나' : m.role === 'system' ? '시스템' : m.name || '캐릭터'}`, sub: clip(text(m), 90) })).reverse().slice(0, 300);
  const id = await pickOne({ title: chatLabel(chat), items, ph: '내용으로 찾기', empty: '메시지가 없어요.' });
  if (id == null) return null;
  const index = +id, m = msgs[index];
  return { text: text(m), m, chat, index, msgs };
}
