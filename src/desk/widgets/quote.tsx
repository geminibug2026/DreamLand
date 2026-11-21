// 문장 수집: 고정한 메시지나 책갈피 가운데 한 문장을 인용 카드로. 누르면 그 대화의 그 메시지로 간다
import { useState } from 'react';
import { IconBtn } from '../../kit';
import { S } from '../../lib/core';
import { dayKey } from '../../lib/f-keepsake';
import { fmtDate, t } from '../../i18n';
import { Glyph } from '../art';
import { hash, seeded, useScan } from '../data';
import { None, openAt } from '../parts';

let turn = 0;   // "다른 문장"을 누른 횟수 — 같은 날에는 같은 순서로 넘어간다
export function Quote() {
  const { quotes } = useScan(), [, bump] = useState(0);
  if (!quotes.length) return <None art={<Glyph name="quote" size={44} />} text={t('desk.quote.none')} />;
  const order = quotes.map((q, i) => ({ q, r: seeded(hash(dayKey(Date.now()) + q.msgId) + i)() })).sort((a, b) => a.r - b.r), q = order[turn % order.length].q;
  const chat = S.get('chats', q.chatId), who = q.who || (chat ? S.persona(chat).name : '') || t('desk.quote.me');
  return <figure className="dk-quote">
    <button className="dk-q fx-tap" onClick={() => openAt(q.chatId, q.msgId)} aria-label={t('desk.quote.open')}><blockquote>{q.text}</blockquote></button>
    <figcaption><span>— {who}{q.at ? <>, <time className="fx-num">{fmtDate(q.at, { year: 'numeric', month: '2-digit', day: '2-digit' })}</time></> : null}</span>
      {order.length > 1 ? <IconBtn ic="refresh" cls="dk-ib" title={t('desk.quote.next')} onClick={() => { turn++; bump(x => x + 1); }} /> : null}</figcaption>
  </figure>;
}
