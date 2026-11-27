// 메모: 장기기억이 간직한 순간들과 일기장의 글을 읽기만 한다. 고치거나 더하는 것은 서고 · 일기장에서
import { useEffect, useState } from 'react';
import { S } from '../../lib/core';
import type { Chat, DiaryEntry } from '../../lib/types';
import { Memory } from '../../lib/memory';
import { emit } from '../../lib/core';
import { t, locale } from '../../i18n';
import { Emb } from '../art';
import { AppHead, Empty, Seg, usePhone } from '../ui';
import { nameOf, talkChats } from '../data';

type Tab = 'mem' | 'diary';
interface MemRow { id: string; text: string; kind: string; ts: number; star: boolean }
const day = (ts: number) => ts ? new Date(ts).toLocaleDateString(locale(), { month: 'long', day: 'numeric' }) : '';

function Mems({ chat }: { chat: Chat | null }) {
  const P = usePhone(), [rows, setRows] = useState<MemRow[] | null>(null), on = !!S.settings.memory?.enabled;
  useEffect(() => {
    if (!chat || !on) return; let live = true;
    void Memory.load(chat.id).then(() => {
      const m = Memory.get(chat.id), list = (m?.memories || []).filter(x => !x.retired && !x.disabled && x.summary);
      const r = list.map(x => ({ id: x.id, text: x.summary, kind: x.kind, ts: x.ts || 0, star: !!x.pinned || x.importance >= 0.75 })).sort((a, b) => (+b.star - +a.star) || b.ts - a.ts).slice(0, 60);
      if (live) setRows(r);
    }).catch(() => { if (live) setRows([]); });
    return () => { live = false; };
  }, [chat, on, P.v]);
  if (!on) return <Empty art={<Emb kind="hourglass" className="pn-empty-art" />} title={t('phone.note.memOff')} text={t('phone.note.memOffHint')} />;
  if (!chat) return <Empty art={<Emb kind="hourglass" className="pn-empty-art" />} title={t('phone.err.noTalk')} />;
  if (!rows) return <p className="pn-wait">{t('phone.loading')}</p>;
  if (!rows.length) return <Empty art={<Emb kind="hourglass" className="pn-empty-art" />} title={t('phone.note.noMem')} text={t('phone.note.noMemHint', { name: nameOf(chat) })} />;
  return <><p className="pn-note-src">{t('phone.note.memFrom', { name: nameOf(chat) })}</p>
    <ul className="pn-memos">{rows.map(r => <li key={r.id} className={r.star ? 'star' : undefined}><p>{r.text}</p><small>{[day(r.ts), r.star ? t('phone.note.important') : ''].filter(Boolean).join(' · ')}</small></li>)}</ul>
    <button type="button" className="pn-btn ghost wide" onClick={() => P.leave(() => void import('../../memoria/ui/Archive').then(m => m.openArchive(chat)))}>{t('phone.note.openArchive')}</button></>;
}
function Diary() {
  const P = usePhone(), [open, setOpen] = useState<{ d: DiaryEntry; c: Chat } | null>(null);
  const all = talkChats().flatMap(c => (c.diary || []).map(d => ({ d, c }))).sort((a, b) => b.d.ts - a.d.ts).slice(0, 40);
  if (open) return <article className="pn-diary-read"><button type="button" className="pn-btn ghost sm" onClick={() => setOpen(null)}>{t('phone.back')}</button>
    <h3>{open.d.title || day(open.d.ts)}</h3><small>{[nameOf(open.c), open.d.storyDate || day(open.d.ts), open.d.mood].filter(Boolean).join(' · ')}</small><p>{open.d.text}</p>
    <button type="button" className="pn-btn wide" onClick={() => { const c = open.c; P.leave(() => emit('diary:open', c)); }}>{t('phone.note.openDiary')}</button></article>;
  if (!all.length) return <Empty art={<Emb kind="book" className="pn-empty-art" />} title={t('phone.note.noDiary')} text={t('phone.note.noDiaryHint')}>{P.home ? <button type="button" className="pn-btn" onClick={() => { const c = P.home!; P.leave(() => emit('diary:open', c)); }}>{t('phone.note.openDiary')}</button> : null}</Empty>;
  return <ul className="pn-memos diary">{all.map(({ d, c }) => <li key={c.id + d.id}><button type="button" onClick={() => setOpen({ d, c })}><b>{d.title || day(d.ts)}</b><p>{d.text}</p><small>{[nameOf(c), day(d.ts)].join(' · ')}</small></button></li>)}</ul>;
}

export function Notes() {
  const P = usePhone(), [tab, setTab] = useState<Tab>('mem'), [cid, setCid] = useState(P.home?.id || ''), rooms = talkChats().slice(0, 8), chat = (cid && S.get('chats', cid)) || P.home;
  return <div className="pn-appbody">
    <AppHead title={t('phone.app.notes')} big />
    <Seg label={t('phone.app.notes')} value={tab} onChange={setTab} opts={[['mem', t('phone.note.mem')], ['diary', t('phone.note.diary')]] as const} />
    {tab === 'mem' && rooms.length > 1 && S.settings.memory?.enabled ? <div className="pn-chips" role="tablist" aria-label={t('phone.note.room')}>{rooms.map(c => <button key={c.id} type="button" role="tab" aria-selected={chat?.id === c.id} className={chat?.id === c.id ? 'on' : undefined} onClick={() => setCid(c.id)}>{nameOf(c)}</button>)}</div> : null}
    {tab === 'mem' ? <Mems key={chat?.id || ''} chat={chat || null} /> : <Diary />}
  </div>;
}
