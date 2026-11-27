// 메시지: 대화 모드 방들을 문자 목록처럼. 누르면 그 대화방으로 간다 (보내기 · 답 받기는 대화 화면 그대로 — 휴대폰이 따로 답을 만들지 않는다)
import { useMemo, useState } from 'react';
import { S } from '../../lib/core';
import type { Chat } from '../../lib/types';
import { startChat } from '../../chat/start';
import { t, tn } from '../../i18n';
import { Emb, Glyph } from '../art';
import { AppHead, Empty, Face, IBtn, usePhone, listTime } from '../ui';
import { charsIn, chatWith, lineOf, nameOf, presenceOf, stickerSrc, talkChats } from '../data';

const PAGE = 40;
/** 새 메시지: 고른 사람과의 대화 모드 방으로 (없으면 새로 연다 — 첫 인사말까지는 대화 화면이 하던 그대로) */
export async function textTo(charId: string, P: ReturnType<typeof usePhone>) {
  const c = chatWith(charId); if (c) return P.toChat(c);
  P.leave(() => void startChat([charId], { mode: 'talk' }));
}

function Row({ c, fresh }: { c: Chat; fresh?: { text: string; at: number; n: number } }) {
  const P = usePhone(), ch = charsIn(c)[0], line = lineOf(fresh?.text || c.preview), n = Math.max(c.unread || 0, fresh?.n || 0), pr = ch ? presenceOf(ch) : null, stk = stickerSrc(line.sticker, c), muted = P.p.muted.includes(c.id);
  return <li><button type="button" className={'pn-msgrow' + (n ? ' unread' : '')} onClick={() => P.toChat(c)}>
    <Face o={ch} size={50} status={pr?.status} />
    <span className="pn-msgrow-main"><b>{nameOf(c)}{muted ? <Glyph name="mute" size={13} /> : null}</b><span>{stk ? <img className="pn-stk" src={stk} alt="" /> : null}{line.text || (line.sticker ? t('phone.msg.sticker') : t('phone.msg.empty'))}</span></span>
    <span className="pn-msgrow-side"><time>{listTime(fresh?.at || c.updatedAt)}</time>{n ? <em className="pn-badge">{n > 99 ? '99+' : n}</em> : null}</span>
  </button></li>;
}

export function Messages() {
  const P = usePhone(), [q, setQ] = useState(''), [shown, setShown] = useState(PAGE), [picking, setPicking] = useState(false);
  const all = useMemo(() => talkChats(), [P.v]);   // eslint-disable-line react-hooks/exhaustive-deps
  const term = q.trim().toLowerCase(), list = term ? all.filter(c => (nameOf(c) + ' ' + (c.preview || '')).toLowerCase().includes(term)) : all;
  if (picking) return <div className="pn-appbody">
    <AppHead title={t('phone.msg.newTo')} back={false} right={<IBtn ic="x" label={t('phone.cancel')} onClick={() => setPicking(false)} />} />
    <ul className="pn-list">{S.chars.slice(0, 200).map(ch => <li key={ch.id}><button type="button" className="pn-row" onClick={() => void textTo(ch.id, P)}><Face o={ch} size={38} /><span><b>{ch.name}</b><small>{chatWith(ch.id) ? t('phone.msg.hasRoom') : t('phone.msg.newRoom')}</small></span></button></li>)}</ul>
  </div>;
  return <div className="pn-appbody">
    <AppHead title={t('phone.app.messages')} big right={<IBtn ic="edit" label={t('phone.msg.new')} onClick={() => setPicking(true)} />} />
    <label className="pn-search"><Glyph name="search" size={17} /><input type="search" value={q} placeholder={t('phone.search')} aria-label={t('phone.search')} onChange={e => { setQ(e.target.value); setShown(PAGE); }} /></label>
    {!all.length ? <Empty art={<Emb kind="teacup" className="pn-empty-art" />} title={t('phone.msg.none')} text={t('phone.msg.noneHint')}>{S.chars.length ? <button type="button" className="pn-btn" onClick={() => setPicking(true)}>{t('phone.msg.new')}</button> : null}</Empty>
      : !list.length ? <Empty title={t('phone.searchNone')} />
        : <ul className="pn-msglist">{list.slice(0, shown).map(c => <Row key={c.id} c={c} fresh={P.fresh.get(c.id)} />)}</ul>}
    {list.length > shown ? <button type="button" className="pn-btn ghost wide" onClick={() => setShown(s => s + PAGE)}>{tn('phone.more', list.length - shown)}</button> : null}
  </div>;
}
