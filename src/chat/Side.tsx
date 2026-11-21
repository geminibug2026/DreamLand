// 왼쪽 대화방 목록: 캐릭터(또는 그룹)별로 묶고, 방마다 분량 · 기간 · 분기 관계를 보여 준다
import { memo, useEffect, useRef, useState, type ReactNode } from 'react';
import { Avatar, Icon, IconBtn } from '../kit';
import { cur, ui, useCh } from './store';
import { ago, charsOf, daysOf, drawSide, groupKey, modeOf, renameRoom, roomName, setSide, titleOf } from './actions';
import { usePaged } from '../ui/Pager';
import { chatMenu, groupDialog } from './menus';
import type { Room } from './types';
import { go } from '../lib/router';
import { startMenu } from './start';
import { S } from '../lib/core';
import { RoomMarks } from '../threads/ui';
import { t } from '../i18n';

/** 실리태번 지난 대화 검색처럼: 낱말을 띄어 나눠 모두 들어 있어야 맞는다 */
const matcher = (term: string) => { const fr = term.split(/\s+/).filter(Boolean); return (c: Room) => { if (!fr.length) return true; const hay = [titleOf(c), roomName(c), c.preview || ''].join(' ').toLowerCase(); return fr.every(f => hay.includes(f)); }; };
const pin = (a: Room, b: Room) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0) || b.updatedAt - a.updatedAt;

/** tree: 분기한 방이면 줄기에 어떻게 매달리는지 (last = 그 묶음의 마지막 줄, via = 뿌리가 아닌 다른 분기에서 갈라졌으면 그 방 이름). kids = 접어 둘 수 있는 분기 수 */
function room(c: Room, max: number, depth = 0, isFlat = false, tree: { last?: boolean; via?: string; kids?: number; folded?: boolean; toggle?: () => void } = {}) {
  const parent = c.parent && S.get('chats', c.parent.id), n = c.count || 0, mode = modeOf(c);
  return <button key={c.id} className={['room', c.id === cur.chat?.id && 'on', depth > 0 && 'sub', depth > 0 && tree.last && 'last'].filter(Boolean).join(' ')}
    onClick={() => { setSide(false); go('chat', c.id); }} onContextMenu={e => { e.preventDefault(); chatMenu(e.currentTarget, c); }}>
    <div className="room-top">{depth ? null : <i className={'room-mode ' + mode}>{mode === 'talk' ? t('chat.side.talk') : 'RP'}</i>}<b>{isFlat ? `${titleOf(c)} · ${roomName(c)}` : roomName(c)}</b>
      {c.temp ? <i className="room-scene">{t('chat.side.temp')}</i> : null}{c.pinned ? <i className="room-pin">✦</i> : null}{c.unread ? <i className="room-unread">{String(c.unread)}</i> : null}{c.scene?.on ? <i className="room-scene">{t('chat.side.scene')}</i> : null}<time>{ago(c.updatedAt)}</time>
      <span className="room-edit" role="button" tabIndex={0} title={t('chat.menu.rename')} aria-label={t('chat.menu.rename')} onClick={e => { e.stopPropagation(); void renameRoom(c); }} onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); void renameRoom(c); } }}><Icon name="edit" size={13} /></span></div>
    <small className="room-prev">{c.preview || t('chat.side.noMsgs')}</small>
    <RoomMarks c={c} />
    <div className="room-meta"><span className="room-bar" title={t('chat.side.msgCount', { count: n })}><i style={{ width: Math.max(n ? 6 : 0, Math.round(n / Math.max(30, max) * 100)) + '%' }} /></span><span>{t('chat.side.count', { count: n })}</span><span>{t('chat.side.days', { count: daysOf(c) })}</span>
      {(c.diary || []).length ? <span>{t('chat.side.diary', { count: (c.diary || []).length })}</span> : null}{c.parent ? <span title={parent ? t('chat.side.branchedFrom', { name: roomName(parent) }) : ''}>{tree.via ? t('chat.side.branchVia', { n: c.parent.at, name: tree.via }) : t('chat.side.branchAt', { n: c.parent.at })}</span> : null}
      {tree.kids ? <span className="room-kids" role="button" tabIndex={0} aria-expanded={!tree.folded} onClick={e => { e.stopPropagation(); tree.toggle?.(); }} onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); tree.toggle?.(); } }}><Icon name="branch" size={11} />{t('chat.side.branches', { count: tree.kids })}<Icon name={tree.folded ? 'right' : 'down'} size={11} /></span> : null}</div>
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
    // 분기가 분기를 낳아도 들여 쓰지 않는다 — 뿌리 방 아래 한 줄기에 차례로 매달고, 다른 분기에서 갈라진 것은 어디서 왔는지 적는다 (목록이 좁아지지 않게).
    // 분기가 많으면 접어 둔다: 넷 이상이고 그 안에 지금 방이 없으면 처음엔 접혀 있다
    const below = (c: Room): Room[] => (kids.get(c.id) || []).sort((a, b) => a.createdAt - b.createdAt).flatMap(x => [x, ...below(x)]);
    const walk = (c: Room): ReactNode[] => {
      const all = below(c); if (!all.length) return [room(c, max, 0)];
      const fk = 'br:' + c.id, hereIn = all.some(x => x.id === cur.chat?.id), folded = term ? false : fold.has(fk) ? true : fold.has('+' + fk) ? false : (all.length >= 4 && !hereIn);
      const toggle = () => { if (folded) { fold.delete(fk); fold.add('+' + fk); } else { fold.delete('+' + fk); fold.add(fk); } redraw(x => x + 1); };
      return [room(c, max, 0, false, { kids: all.length, folded, toggle }), ...(folded ? [] : all.map((x, i) => room(x, max, 1, false, { last: i === all.length - 1, via: x.parent && x.parent.id !== c.id ? roomName(S.get('chats', x.parent.id) || x) : '' })))];
    };
    const roots = rooms.filter(c => !c.parent || !ids.has(c.parent.id)).sort(pin);
    return <section key={k} className={['cgroup', open && 'open', here && 'here'].filter(Boolean).join(' ')}>
      <div className="cgroup-head">
        <button className="cgroup-main" onClick={() => { if (open) { fold.delete('+' + k); fold.add(k); } else { fold.delete(k); fold.add('+' + k); } redraw(x => x + 1); }}>
          <div className="av-stack">{chars.slice(0, 2).map(ch => <Avatar key={ch.id} o={ch} cls="sm" />)}{chars.length > 2 ? <i className="av-more">{`+${chars.length - 2}`}</i> : null}</div>
          <div className="cgroup-text"><b>{titleOf(rooms[0])}</b><small>{t('chat.side.groupSummary', { rooms: rooms.length, msgs: total.toLocaleString(), ago: ago(newest(rooms)) })}</small></div>
          <Icon name={open ? 'down' : 'right'} size={15} /></button>
        <IconBtn ic="plus" title={t('chat.side.newRoom')} onClick={e => startMenu(e.currentTarget, rooms[0].charIds)} /></div>
      {open ? <div className="cgroup-rooms">{roots.flatMap(c => walk(c))}</div> : null}
    </section>;
  })}{sorted.length ? null : empty(term)}</div>;
}

/** 폴더별: 내가 만든 폴더로 방을 묶는다 (폴더는 방 메뉴의 "폴더로 옮기기"로 정한다) */
function ByFolder({ term }: { term: string }) {
  const [, redraw] = useState(0), fold = cur.fold, hit = matcher(term);
  const groups = new Map<string, Room[]>(); for (const c of S.chats) { if (!hit(c)) continue; const k = (c.folder || '').trim(), g = groups.get(k); if (g) g.push(c); else groups.set(k, [c]); }
  const names = [...groups.keys()].sort((a, b) => (a ? 0 : 1) - (b ? 0 : 1) || a.localeCompare(b));   // 폴더 없는 방은 맨 아래
  return <div className="chat-list">{names.map(name => {
    const rooms = groups.get(name)!.sort(pin), max = Math.max(1, ...rooms.map(c => c.count || 0)), k = 'folder:' + name;
    const here = rooms.some(c => c.id === cur.chat?.id), open = term ? true : fold.has(k) ? false : fold.has('+' + k) ? true : (here || names.length <= 2);
    return <section key={k} className={['cgroup', open && 'open', here && 'here'].filter(Boolean).join(' ')}>
      <div className="cgroup-head"><button className="cgroup-main" onClick={() => { if (open) { fold.delete('+' + k); fold.add(k); } else { fold.delete(k); fold.add('+' + k); } redraw(x => x + 1); }}>
        <Icon name="folder" size={18} /><div className="cgroup-text"><b>{name || t('chat.side.noFolder')}</b><small>{t('chat.side.rooms', { count: rooms.length })}</small></div><Icon name={open ? 'down' : 'right'} size={15} /></button></div>
      {open ? <div className="cgroup-rooms">{rooms.map(c => room(c, max, 0, true))}</div> : null}
    </section>;
  })}{names.length ? null : empty(term)}</div>;
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
    <div className="side-view">{([['chars', t('chat.side.byChar')], ['recent', t('chat.side.recent')], ['folders', t('chat.side.byFolder')]] as const).map(([k, l]) => <button key={k} className={view === k ? 'on' : undefined} onClick={() => { S.set({ sideView: k }); drawSide(); }}>{l}</button>)}
      <span>{t('chat.side.rooms', { count: S.chats.length })}</span></div>
    {view === 'recent' ? <Flat key={'r' + opened.current} term={term} /> : view === 'folders' ? <ByFolder key={'f' + opened.current} term={term} /> : <ByChar key={'c' + opened.current} term={term} />}
  </>;
});
export const sideRef = (el: HTMLElement | null) => { ui.side = el; };
