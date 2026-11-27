// 알림 카드: 캐릭터가 보낸 메시지 · 부재중 전화. 답장 | 읽음 | 숨기기 — 답장은 대화 화면의 보내기로 보낸다 (휴대폰이 따로 답을 만들지 않는다)
import { useRef, useState, type CSSProperties } from 'react';
import { S } from '../lib/core';
import { t, tn } from '../i18n';
import { Glyph } from './art';
import { Face, agoText, usePhone } from './ui';
import { stickerSrc, type Notif } from './data';

export function NotifCard({ n, i = 0 }: { n: Notif; i?: number }) {
  const P = usePhone(), [reply, setReply] = useState(false), inp = useRef<HTMLInputElement>(null);
  const ch = S.get('chars', n.charId), call = n.kind === 'call', stk = !call && P.p.previews ? stickerSrc(n.line.sticker, n.chat) : '';
  const body = call ? tn('phone.notif.missed', n.count) : !P.p.previews ? tn('phone.notif.hidden', n.count) : n.line.text || (n.line.sticker ? t('phone.msg.sticker') : tn('phone.notif.hidden', n.count));
  const send = () => { const v = inp.current?.value.trim(); if (v) P.toChat(n.chat, v); };
  return <article className="pn-note" style={{ '--i': i } as CSSProperties}>
    <div className="pn-note-top"><Glyph name={call ? 'phone' : 'messages'} size={14} /><span>{call ? t('phone.app.calls') : t('phone.app.messages')}</span><time>{agoText(n.at)}</time></div>
    <div className="pn-note-main"><Face o={ch} size={40} /><div><b>{n.title}{!call && n.count > 1 ? <em>{n.count}</em> : null}</b><p>{stk ? <img className="pn-stk" src={stk} alt={n.line.sticker} /> : null}{body}</p></div></div>
    {reply ? <form className="pn-note-reply" onSubmit={e => { e.preventDefault(); send(); }}>
      <input ref={inp} autoFocus placeholder={t('phone.notif.replyPh', { name: n.title })} aria-label={t('phone.notif.reply')} enterKeyHint="send" />
      <button type="submit" className="pn-ib solid" aria-label={t('phone.notif.send')} title={t('phone.notif.send')}><Glyph name="next" size={18} /></button></form>
      : <div className="pn-note-acts">
        {call ? <button type="button" onClick={() => P.dial(n.chat)}>{t('phone.notif.callBack')}</button> : <button type="button" onClick={() => setReply(true)}>{t('phone.notif.reply')}</button>}
        <button type="button" onClick={() => P.read(n)}>{t('phone.notif.read')}</button>
        <button type="button" onClick={() => P.mute(n.chat.id)}>{t('phone.notif.mute')}</button></div>}
  </article>;
}
/** 알림 묶음: 앞의 몇 장만 펼치고 나머지는 개수로 */
export function NotifStack({ list, max = 3 }: { list: Notif[]; max?: number }) {
  const [all, setAll] = useState(false), shown = all ? list.slice(0, 12) : list.slice(0, max);
  if (!list.length) return null;
  return <section className="pn-notes" aria-label={t('phone.notif.title')}>
    {shown.map((n, i) => <NotifCard key={n.id} n={n} i={i} />)}
    {list.length > shown.length ? <button type="button" className="pn-more-notes" onClick={() => setAll(true)}>{tn('phone.notif.more', list.length - shown.length)}</button> : null}
  </section>;
}
