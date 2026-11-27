// 연락처: 캐릭터들. 지금 상태(일정 · 직접 바꾼 상태) · 함께한 날 · 오늘 일정, 그리고 메시지 · 전화 · 일정 고치기 · 사진으로 이어진다
import { useMemo, useState } from 'react';
import { Art, Emblem } from '../../kit';
import { S } from '../../lib/core';
import type { Char } from '../../lib/types';
import { STATUS, scheduleOf, dayIndex, fmtMin } from '../../lib/f-schedule';
import { editSchedule } from '../../schedule/Editor';
import { t, tn, locale } from '../../i18n';
import { Fill, Glyph } from '../art';
import { AppHead, Empty, Face, usePhone } from '../ui';
import { chatWith, presenceOf, together } from '../data';
import { useMinute } from '../time';
import { Clock } from '../../lib/clock';
import { firstMet } from '../../lib/together';
import { textTo } from './Messages';

const PAGE = 60;
function Detail({ ch }: { ch: Char }) {
  const P = usePhone(); useMinute(); const c = chatWith(ch.id), now = Clock.ms(c), pr = presenceOf(ch), days = (S.settings.modes as { together?: boolean }).together !== false ? together(ch.id) : 0;   // 그 사람의 하루는 그 사람 방의 시계로
  const sch = scheduleOf(ch), day = sch?.days[dayIndex(new Date(now))] || [], cur = new Date(now).getHours() * 60 + new Date(now).getMinutes();
  return <div className="pn-appbody pn-contact">
    <AppHead title="" />
    <Art o={ch} className="pn-contact-art">{!ch.avatar ? <Emblem o={ch} center /> : null}</Art>
    <h2 className="pn-contact-name">{ch.name}</h2>
    <p className="pn-contact-st"><i className={'pn-dot ' + pr.status} />{STATUS[pr.status] || pr.status}{pr.activity ? ' · ' + pr.activity : ''}</p>
    <div className="pn-acts">
      <button type="button" onClick={() => void textTo(ch.id, P)}><Fill name="messages" size={24} /><span>{t('phone.app.messages')}</span></button>
      <button type="button" disabled={!c} onClick={() => c && P.dial(c)}><Fill name="phone" size={24} /><span>{t('phone.contact.call')}</span></button>
      <button type="button" onClick={() => editSchedule(ch)}><Fill name="clock" size={24} /><span>{t('phone.contact.sched')}</span></button>
      <button type="button" onClick={() => P.open('photos', ch.id)}><Fill name="photos" size={24} /><span>{t('phone.app.photos')}</span></button>
    </div>
    {days ? <div className="pn-card pn-contact-days"><b>{t('phone.w.dayN', { n: days })}</b><span>{t('phone.contact.since', { date: new Date(firstMet(ch.id)).toLocaleDateString(locale()) })}</span></div> : null}
    <div className="pn-card"><h3>{t('phone.contact.today')}</h3>
      {day.length ? <ol className="pn-sched">{day.map(b => <li key={b.from} className={cur >= b.from && cur < b.to ? 'on' : cur >= b.to ? 'past' : undefined}><time>{fmtMin(b.from)}</time><i className={'pn-dot ' + b.status} /><span>{b.activity || STATUS[b.status]}</span></li>)}</ol>
        : <p className="pn-dim">{t('phone.contact.noSched')}</p>}</div>
    {ch.tags?.length ? <p className="pn-tags">{ch.tags.slice(0, 6).map(x => <span key={x}>#{x}</span>)}</p> : null}
  </div>;
}

export function Contacts({ arg }: { arg?: unknown }) {
  const P = usePhone(), [q, setQ] = useState(''), [shown, setShown] = useState(PAGE);
  const sel = arg === 'fav' ? P.fav?.id : typeof arg === 'string' ? arg : '';
  const all = useMemo(() => { const talk = new Set(S.chats.filter(c => c.mode === 'talk').flatMap(c => c.charIds)); return [...S.chars].sort((a, b) => (+!!b.fav - +!!a.fav) || (+talk.has(b.id) - +talk.has(a.id)) || a.name.localeCompare(b.name)); }, [P.v]);   // eslint-disable-line react-hooks/exhaustive-deps
  const ch = sel ? S.get('chars', sel) : null;
  if (ch) return <Detail ch={ch} />;
  const term = q.trim().toLowerCase(), list = term ? all.filter(c => (c.name + ' ' + (c.tags || []).join(' ')).toLowerCase().includes(term)) : all;
  return <div className="pn-appbody">
    <AppHead title={t('phone.app.contacts')} big />
    <label className="pn-search"><Glyph name="search" size={17} /><input type="search" value={q} placeholder={t('phone.search')} aria-label={t('phone.search')} onChange={e => { setQ(e.target.value); setShown(PAGE); }} /></label>
    {!all.length ? <Empty title={t('phone.contact.none')} text={t('phone.contact.noneHint')} /> : !list.length ? <Empty title={t('phone.searchNone')} />
      : <ul className="pn-list">{list.slice(0, shown).map(c => { const pr = chatWith(c.id) ? presenceOf(c) : null; return <li key={c.id}><button type="button" className="pn-row" onClick={e => P.open('contacts', c.id, e.currentTarget)}>
        <Face o={c} size={42} status={pr?.status} /><span><b>{c.name}{c.fav ? <Glyph name="heart" size={12} /> : null}</b><small>{pr ? (pr.activity || STATUS[pr.status]) : t('phone.contact.noRoom')}</small></span><Glyph name="next" size={16} /></button></li>; })}</ul>}
    {list.length > shown ? <button type="button" className="pn-btn ghost wide" onClick={() => setShown(s => s + PAGE)}>{tn('phone.more', list.length - shown)}</button> : null}
  </div>;
}
