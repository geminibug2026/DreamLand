// 정규식 화면의 고르는 창: 하나 고르기 · 프리셋 · 캐릭터 · 옮길 곳 · 대화의 메시지
import { useState } from 'react';
import { Avatar, Icon } from '../kit';
import type { Char, Chat } from '../types';
import type { Msg } from '../studio/parts';
import { Cards, G, chatApi, chatLabel, clip, lastChat, type Sc } from './lib';
import { S } from '../lib/core';
import * as core from '../lib/core';
import { arr, menu, openModal, toast } from '../studio/parts';
import { locale, t } from '../i18n';

interface PickRow { id: string; title: string; sub?: string; ic?: string; av?: Char }
interface PickOpts { title: string; items: PickRow[]; empty?: string; ph?: string }

function PickBody({ o, pick }: { o: PickOpts; pick: (id: string) => void }) {
  const { items, empty = t('regex.pick.empty'), ph = t('regex.pick.byName') } = o;
  const [q, setQ] = useState('');
  const qt = q.trim().toLowerCase(), rows = items.filter(it => !qt || (it.title + ' ' + (it.sub || '')).toLowerCase().includes(qt));
  return <>
    {items.length > 8 ? <input className="inp search" placeholder={ph} value={q} onChange={e => setQ(e.target.value)} /> : null}
    <div className="picker-list">
      {rows.slice(0, 200).map(it => <button key={it.id} type="button" className="picker-row" onClick={() => pick(it.id)}>
        {it.av ? <Avatar o={it.av} cls="sm" /> : <span className="rx-pick-ic"><Icon name={it.ic || 'note'} size={16} /></span>}<div className="picker-text"><b>{it.title}</b><small>{it.sub || ' '}</small></div>
      </button>)}
      {!rows.length && <p className="dim pad">{items.length ? t('regex.pick.noMatch') : empty}</p>}{rows.length > 200 && <p className="dim pad">{t('regex.pick.narrow')}</p>}
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
export const pickPreset = (title = t('regex.page.pickPreset')) => pickOne({ title, items: S.presets.map(p => ({ id: p.id, ic: 'sliders', title: p.name, sub: t(p.id === S.settings.activePreset ? 'regex.pick.countActive' : 'regex.pick.count', { count: arr(p.regex).length }) })) });
export const pickChar = (title = t('regex.page.pickChar')) => pickOne({ title, ph: t('regex.pick.byName'), empty: t('regex.pick.noChars'),
  items: S.chars.map(c => ({ c, n: Cards.scopedRegex(c.id).length })).sort((a, b) => +(b.n > 0) - +(a.n > 0) || a.c.name.localeCompare(b.c.name, locale())).map(({ c, n }) => ({ id: c.id, av: c, title: c.name, sub: t('regex.pick.count', { count: n }) })) });
/** 옮길 곳을 고른다 → sc (메뉴를 그냥 닫으면 돌아오지 않는다) */
export function pickTarget(anchor: Element, except?: Sc) {
  return new Promise<Sc | null>(res => menu(anchor, [
    (!except || except.kind !== 'global') && { label: t('regex.pick.toGlobal'), ic: 'moon', onclick: () => res(G) },
    { label: t('regex.pick.toPreset'), ic: 'sliders', onclick: async () => { const id = await pickPreset(t('regex.pick.toPresetWhich')); res(id ? { kind: 'preset', id } : null); } },
    { label: t('regex.pick.toChar'), ic: 'user', onclick: async () => { const id = await pickChar(t('regex.pick.toCharWhich')); res(id ? { kind: 'char', id } : null); } },
  ]));
}
export interface Picked { text: string; m: Msg; chat: Chat; index: number; msgs: Msg[] }
/** 대화에서 메시지 하나 고르기 */
export async function pickMessage(chatIn?: Chat | null): Promise<Picked | null> {
  const chat = chatIn || lastChat(); if (!chat) { toast(t('regex.pick.noChats'), 'err'); return null; }
  const cur = chatApi.current(), msgs = cur.chat?.id === chat.id ? cur.msgs : await S.msgs(chat.id);
  if (!msgs.length) { toast(t('regex.pick.noMsgsInChat'), 'err'); return null; }
  const text = core.msgText;
  const items = msgs.map((m, i) => ({ id: String(i), ic: m.role === 'user' ? 'user' : m.role === 'system' ? 'note' : 'chat', title: `#${i + 1} ${m.role === 'user' ? t('regex.pick.me') : m.role === 'system' ? t('regex.pick.system') : m.name || t('regex.scope.char')}`, sub: clip(text(m), 90) })).reverse().slice(0, 300);
  const id = await pickOne({ title: chatLabel(chat), items, ph: t('regex.pick.byContent'), empty: t('regex.pick.noMsgs') });
  if (id == null) return null;
  const index = +id, m = msgs[index];
  return { text: text(m), m, chat, index, msgs };
}
