// 왼쪽 대화방 목록: 캐릭터(또는 그룹)별로 묶고, 방마다 분량 · 기간 · 분기 관계를 보여 준다
import { memo, useEffect, useRef, useState, type ReactNode } from 'react';
import { Avatar, Icon, IconBtn } from '../kit';
import { cur, ui, useCh } from './store';
import { ago, charsOf, daysOf, drawSide, groupKey, modeOf, roomName, setSide, titleOf } from './actions';
import { usePaged } from '../ui/Pager';
import { chatMenu, groupDialog } from './menus';
import type { Room } from './types';
import { go } from '../lib/router';
import { startMenu } from './start';
import { S } from '../lib/core';
import { t } from '../i18n';

/** 실리태번 지난 대화 검색처럼: 낱말을 띄어 나눠 모두 들어 있어야 맞는다 */
const matcher = (term: string) => { const fr = term.split(/\s+/).filter(Boolean); return (c: Room) => { if (!fr.length) return true; const hay = [titleOf(c), roomName(c), c.preview || ''].join(' ').toLowerCase(); return fr.every(f => hay.includes(f)); }; };
const pin = (a: Room, b: Room) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0) || b.updatedAt - a.updatedAt;

function room(c: Room, max: number, depth = 0, isFlat = false) {
  const parent = c.parent && S.get('chats', c.parent.id), n = c.count || 0, mode = modeOf(c);
  return <button key={c.id} className={['room', c.id === cur.chat?.id && 'on', depth > 0 && 'sub'].filter(Boolean).join(' ')} style={depth ? { marginLeft: Math.min(depth, 3) * 14 + 'px' } : undefined}
    onClick={() => { setSide(false); go('chat', c.id); }} onContextMenu={e => { e.preventDefault(); chatMenu(e.currentTarget, c); }}>
    <div className="room-top">{depth ? <Icon name="branch" size={13} /> : null}<i className={'room-mode ' + mode}>{mode === 'talk' ? t('chat.side.talk') : 'RP'}</i><b>{isFlat ? `${titleOf(c)} · ${roomName(c)}` : roomName(c)}</b>
      {c.pinned ? <i className="room-pin">✦</i> : null}{c.unread ? <i className="room-unread">{String(c.unread)}</i> : null}{c.scene?.on ? <i className="room-scene">{t('chat.side.scene')}</i> : null}<time>{ago(c.updatedAt)}</time></div>
    <small className="room-prev">{c.preview || t('chat.side.noMsgs')}</small>
    <div className="room-meta"><span className="room-bar" title={t('chat.side.msgCount', { count: n })}><i style={{ width: Math.max(n ? 6 : 0, Math.round(n / Math.max(30, max) * 100)) + '%' }} /></span><span>{t('chat.side.count', { count: n })}</span><span>{t('chat.side.days', { count: daysOf(c) })}</span>
      {(c.diary || []).length ? <span>{t('chat.side.diary', { count: (c.diary || []).length })}</span> : null}{c.parent ? <span title={parent ? t('chat.side.branchedFrom', { name: roomName(parent) }) : ''}>{t('chat.side.branchAt', { n: c.parent.at })}</span> : null}</div>
  </button>;
}
const empty = (term: string) => <p className="dim pad">{term ? t('chat.side.noResults') : t('chat.side.empty')}</p>;

/** 최근순: 방 하나가 한 줄. 실리태번 캐릭터 목록처럼 쪽으로 나누고 쪽 이동은 목록 위에 둔다 */
function Flat({ term }: { term: string }) {
  const sorted = S.chats.filter(matcher(term)).sort(pin), max = Math.max(1, ...sorted.map(c => c.count || 0));
  const pg = usePaged(sorted, { id: 'sideRecent', resetKey: term, focusIndex: term ? -1 : sorted.findIndex(c => c.id === cur.chat?.id) });
  return <div className="chat-list" ref={pg.listRef}>{pg.pager}{pg.rows.map(c => room(c, max, 0, true))}{sorted.length ? null : empty(term)}</div>;
}

/** 캐릭터별: 캐릭터(그룹) 묶음을 쪽으로 나누고, 묶음 안의 방은 실리태번 지난 대화처럼 모두 보여 준다 */
function ByChar({ term }: { term: string }) {
  const [, redraw] = useState(0), fold = cur.fold, hit = matcher(term);
  const groups = new Map<string, Room[]>(); for (const c of S.chats) { if (!hit(c)) continue; const k = groupKey(c), g = groups.get(k); if (g) g.push(c); else groups.set(k, [c]); }
  const newest = (rooms: Room[]) => rooms.reduce((n, c) => Math.max(n, c.updatedAt), 0);
  const sorted = [...groups.entries()].sort((a, b) => newest(b[1]) - newest(a[1]));
  const pg = usePaged(sorted, { id: 'sideChars', resetKey: term, focusIndex: term ? -1 : sorted.findIndex(([, rs]) => rs.some(c => c.id === cur.chat?.id)) });
  return <div className="chat-list" ref={pg.listRef}>{pg.pager}{pg.rows.map(([k, rooms]) => {
    const chars = charsOf(rooms[0]), total = rooms.reduce((n, c) => n + (c.count || 0), 0), max = Math.max(1, ...rooms.map(c => c.count || 0));
    const here = rooms.some(c => c.id === cur.chat?.id), open = term ? true : fold.has(k) ? false : fold.has('+' + k) ? true : (here || sorted.length === 1);
    // 분기한 방은 원래 방 바로 아래에 들여 쓴다
    const ids = new Set(rooms.map(c => c.id)), kids = new Map<string, Room[]>();
    for (const c of rooms) if (c.parent && ids.has(c.parent.id)) { const l = kids.get(c.parent.id); if (l) l.push(c); else kids.set(c.parent.id, [c]); }
    const walk = (c: Room, d: number): ReactNode[] => [room(c, max, d), ...(kids.get(c.id) || []).sort((a, b) => a.createdAt - b.createdAt).flatMap(x => walk(x, d + 1))];
    const roots = rooms.filter(c => !c.parent || !ids.has(c.parent.id)).sort(pin);
    return <section key={k} className={['cgroup', open && 'open', here && 'here'].filter(Boolean).join(' ')}>
      <div className="cgroup-head">
        <button className="cgroup-main" onClick={() => { if (open) { fold.delete('+' + k); fold.add(k); } else { fold.delete(k); fold.add('+' + k); } redraw(x => x + 1); }}>
          <div className="av-stack">{chars.slice(0, 2).map(ch => <Avatar key={ch.id} o={ch} cls="sm" />)}{chars.length > 2 ? <i className="av-more">{`+${chars.length - 2}`}</i> : null}</div>
          <div className="cgroup-text"><b>{titleOf(rooms[0])}</b><small>{t('chat.side.groupSummary', { rooms: rooms.length, msgs: total.toLocaleString(), ago: ago(newest(rooms)) })}</small></div>
          <Icon name={open ? 'down' : 'right'} size={15} /></button>
        <IconBtn ic="plus" title={t('chat.side.newRoom')} onClick={e => startMenu(e.currentTarget, rooms[0].charIds)} /></div>
      {open ? <div className="cgroup-rooms">{roots.flatMap(c => walk(c, 0))}</div> : null}
    </section>;
  })}{sorted.length ? null : empty(term)}</div>;
}

export const Side = memo(function Side() {
  useCh('side');
  const [term, setTerm] = useState(''), timer = useRef(0), kept = useRef<ReactNode>(null), was = useRef(false), opened = useRef(0);
  useEffect(() => () => clearTimeout(timer.current), []);
  if (!cur.sideOpen) { was.current = false; return kept.current; }
  if (!was.current) { was.current = true; opened.current++; }   // 열 때마다 지금 방이 든 쪽부터   // 닫혀 있으면 열 때 그린다 (대화방이 아주 많을 때 방을 여는 시간을 아낀다)
  const view = S.settings.sideView || 'chars';
  return kept.current = <>
    <header className="side-head">
      <input className="inp search" placeholder={t('chat.side.search')} onChange={e => { const v = e.target.value.trim().toLowerCase(); clearTimeout(timer.current); timer.current = window.setTimeout(() => setTerm(v), 140); }} />
      <IconBtn ic="users" title={t('chat.side.newGroup')} onClick={groupDialog} /><IconBtn ic="x" title={t('common.close')} onClick={() => setSide(false)} /></header>
    <div className="side-view">{([['chars', t('chat.side.byChar')], ['recent', t('chat.side.recent')]] as const).map(([k, l]) => <button key={k} className={view === k ? 'on' : undefined} onClick={() => { S.set({ sideView: k }); drawSide(); }}>{l}</button>)}
      <span>{t('chat.side.rooms', { count: S.chats.length })}</span></div>
    {view === 'recent' ? <Flat key={'r' + opened.current} term={term} /> : <ByChar key={'c' + opened.current} term={term} />}
  </>;
});
export const sideRef = (el: HTMLElement | null) => { ui.side = el; };
