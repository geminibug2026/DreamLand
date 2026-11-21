// 이어 쓰기: 쓰다 만 글 · 멈춰 둔 게임 · 고정한 대화
import { S, fmtTime } from '../../lib/core';
import type { Chat } from '../../lib/types';
import { go } from '../../lib/router';
import { roomName } from '../../chat/actions';
import { t } from '../../i18n';
import { Glyph } from '../art';
import { p2, plain, whoOf } from '../data';
import { Lbl, None, Row } from '../parts';

type GameRoom = Chat & { game?: { on?: boolean; sessions?: unknown[] } };
/** 이 기기에 남아 있는 쓰다 만 글 (그 방이 아직 있을 때만) */
function draft(): { chat: Chat; text: string } | null {
  try { const d = JSON.parse(localStorage.getItem('dreamland:draft') || 'null') as { id?: string; text?: string } | null, chat = d?.id ? S.get('chats', d.id) : null; return chat && d?.text?.trim() ? { chat, text: d.text.trim() } : null; } catch { return null; }
}

export function Resume() {
  const rooms = [...S.chats].filter(c => !c.temp).sort((a, b) => b.updatedAt - a.updatedAt), d = draft();
  const game = (rooms as GameRoom[]).find(c => c.game?.on), pins = rooms.filter(c => c.pinned && c.id !== d?.chat.id && c !== game).slice(0, 3), open = (c: Chat) => () => go('chat', c.id);
  if (!d && !game && !pins.length) return <None art={<Glyph name="resume" size={44} />} text={t('desk.resume.none')} />;
  return <>
    {d ? <button className="dk-draft fx-tap" onClick={open(d.chat)}><span className="fx-lbl kr">{t('desk.resume.draft')} · {whoOf(d.chat)}</span><p>{d.text.slice(0, 140)}<i className="dk-caret" /></p></button> : null}
    {game ? <><Lbl>{t('desk.resume.game')}</Lbl><ul className="dk-rows fx-rows"><Row main={whoOf(game) || roomName(game)} sub={roomName(game)} meta={t('desk.resume.session', { n: p2((game.game?.sessions?.length || 0) + 1) })} onClick={open(game)} /></ul></> : null}
    {pins.length ? <><Lbl>{t('desk.resume.pinned')}</Lbl><ul className="dk-rows fx-rows">{pins.map(c => <Row key={c.id} main={whoOf(c) || roomName(c)} sub={plain(c.preview).slice(0, 60) || roomName(c)} meta={fmtTime(c.updatedAt)} onClick={open(c)} />)}</ul></> : null}
  </>;
}
