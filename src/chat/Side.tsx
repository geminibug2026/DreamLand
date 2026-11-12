// 왼쪽 대화방 목록: 캐릭터(또는 그룹)별로 묶고, 방마다 분량 · 기간 · 분기 관계를 보여 준다
import { memo, useEffect, useRef, useState, type ReactNode } from 'react';
import { Avatar, Icon, IconBtn } from '../kit';
import { B } from './bridge';
import { cur, ui, useCh } from './store';
import { ago, charsOf, daysOf, drawSide, groupKey, modeOf, roomName, setSide, titleOf } from './actions';
import { chatMenu, groupDialog } from './menus';
import type { Room } from './types';

const PAGE = 6;

function List({ term }: { term: string }) {
  const [, redraw] = useState(0), list = () => redraw(x => x + 1);
  const S = B.S, fold = cur.fold, more = cur.more, flat = S.settings.sideView === 'recent';
  const room = (c: Room, max: number, depth = 0, isFlat = false) => {
    const parent = c.parent && S.get('chats', c.parent.id), n = c.count || 0, mode = modeOf(c);
    return <button key={c.id} className={['room', c.id === cur.chat?.id && 'on', depth > 0 && 'sub'].filter(Boolean).join(' ')} style={depth ? { marginLeft: Math.min(depth, 3) * 14 + 'px' } : undefined}
      onClick={() => { setSide(false); B.ui.go('chat', c.id); }} onContextMenu={e => { e.preventDefault(); chatMenu(e.currentTarget, c); }}>
      <div className="room-top">{depth ? <Icon name="branch" size={13} /> : null}<i className={'room-mode ' + mode}>{mode === 'talk' ? '대화' : 'RP'}</i><b>{isFlat ? `${titleOf(c)} · ${roomName(c)}` : roomName(c)}</b>
        {c.pinned ? <i className="room-pin">✦</i> : null}{c.unread ? <i className="room-unread">{String(c.unread)}</i> : null}{c.scene?.on ? <i className="room-scene">장면 중</i> : null}<time>{ago(c.updatedAt)}</time></div>
      <small className="room-prev">{c.preview || '아직 아무 말도 없어요'}</small>
      <div className="room-meta"><span className="room-bar" title={`메시지 ${n}개`}><i style={{ width: Math.max(n ? 6 : 0, Math.round(n / Math.max(30, max) * 100)) + '%' }} /></span><span>{`${n}개`}</span><span>{`${daysOf(c)}일`}</span>
        {(c.diary || []).length ? <span>{`일기 ${(c.diary || []).length}`}</span> : null}{c.parent ? <span title={parent ? `${roomName(parent)}에서 갈라진 방` : ''}>{`${c.parent.at}번째에서 분기`}</span> : null}</div>
    </button>;
  };
  const hit = (c: Room) => !term || (titleOf(c) + ' ' + roomName(c) + ' ' + c.preview).toLowerCase().includes(term);
  const all = S.chats.filter(hit), els: ReactNode[] = [];
  const pin = (a: Room, b: Room) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0) || b.updatedAt - a.updatedAt;
  if (flat) {
    const max = Math.max(1, ...all.map(c => c.count || 0)), sorted = [...all].sort(pin), lim = more.get('*') || 40;
    els.push(...sorted.slice(0, lim).map(c => room(c, max, 0, true)));
    if (sorted.length > lim) els.push(<button className="room-more" key="#more" onClick={() => { more.set('*', lim + 40); list(); }}>{`대화방 ${sorted.length - lim}개 더 보기`}</button>);
  } else {
    const groups = new Map<string, Room[]>(); for (const c of all) { const k = groupKey(c), g = groups.get(k); if (g) g.push(c); else groups.set(k, [c]); }
    const newest = (rooms: Room[]) => Math.max(...rooms.map(c => c.updatedAt));
    const sorted = [...groups.entries()].sort((a, b) => newest(b[1]) - newest(a[1]));
    const gLim = term ? 60 : (more.get('#groups') || 40);   // 캐릭터가 아주 많으면 묶음도 나눠서 그린다
    for (const [k, rooms] of sorted.slice(0, gLim)) {
      const chars = charsOf(rooms[0]), total = rooms.reduce((n, c) => n + (c.count || 0), 0), max = Math.max(1, ...rooms.map(c => c.count || 0));
      const here = rooms.some(c => c.id === cur.chat?.id), open = term ? true : fold.has(k) ? false : fold.has('+' + k) ? true : (here || sorted.length === 1);
      // 분기한 방은 원래 방 바로 아래에 들여 쓴다
      const ids = new Set(rooms.map(c => c.id)), kids = (c: Room) => rooms.filter(x => x.parent?.id === c.id).sort((a, b) => a.createdAt - b.createdAt);
      const roots = rooms.filter(c => !c.parent || !ids.has(c.parent.id)).sort(pin);
      const walk = (c: Room, d: number): ReactNode[] => [room(c, max, d), ...kids(c).flatMap(x => walk(x, d + 1))];
      // 방이 많으면 처음 몇 개만 — 지금 열려 있는 방이 든 갈래는 항상 보이게
      const lim = term ? Infinity : (more.get(k) || PAGE), holds = (c: Room): boolean => c.id === cur.chat?.id || kids(c).some(holds);
      const shown = roots.filter((c, i) => i < lim || holds(c)), rest = roots.length - shown.length;
      els.push(<section key={k} className={['cgroup', open && 'open', here && 'here'].filter(Boolean).join(' ')}>
        <div className="cgroup-head">
          <button className="cgroup-main" onClick={() => { if (open) { fold.delete('+' + k); fold.add(k); } else { fold.delete(k); fold.add('+' + k); } list(); }}>
            <div className="av-stack">{chars.slice(0, 2).map(ch => <Avatar key={ch.id} o={ch} cls="sm" />)}{chars.length > 2 ? <i className="av-more">{`+${chars.length - 2}`}</i> : null}</div>
            <div className="cgroup-text"><b>{titleOf(rooms[0])}</b><small>{`대화방 ${rooms.length} · 메시지 ${total.toLocaleString()} · ${ago(newest(rooms))}`}</small></div>
            <Icon name={open ? 'down' : 'right'} size={15} /></button>
          <IconBtn ic="plus" title="이 캐릭터와 새 대화방" onClick={e => B.oldChat.startMenu(e.currentTarget, rooms[0].charIds)} /></div>
        {open ? <div className="cgroup-rooms">{shown.flatMap(c => walk(c, 0))}
          {rest > 0 ? <button className="room-more" onClick={() => { more.set(k, lim + PAGE * 2); list(); }}>{`이 캐릭터의 대화방 ${rest}개 더 보기`}</button>
            : (lim > PAGE && roots.length > PAGE && !term ? <button className="room-more" onClick={() => { more.delete(k); list(); }}>접기</button> : null)}</div> : null}
      </section>);
    }
    if (sorted.length > gLim) els.push(<button className="room-more" key="#more" onClick={() => { more.set('#groups', gLim + 60); list(); }}>{term ? `캐릭터 ${sorted.length - gLim}명 더 있어요 — 검색어를 더 넣어 좁혀 주세요` : `캐릭터 ${sorted.length - gLim}명 더 보기`}</button>);
  }
  return <div className="chat-list">{els}{!els.length ? <p className="dim pad">{term ? '검색 결과가 없어요.' : '대화가 여기에 쌓여요.'}</p> : null}</div>;
}

export const Side = memo(function Side() {
  useCh('side');
  const [term, setTerm] = useState(''), timer = useRef(0), kept = useRef<ReactNode>(null);
  useEffect(() => () => clearTimeout(timer.current), []);
  if (!cur.sideOpen) return kept.current;   // 닫혀 있으면 열 때 그린다 (대화방이 아주 많을 때 방을 여는 시간을 아낀다)
  const S = B.S, view = S.settings.sideView || 'chars';
  return kept.current = <>
    <header className="side-head">
      <input className="inp search" placeholder="캐릭터 · 대화방 · 내용 찾기" onChange={e => { const v = e.target.value.trim().toLowerCase(); clearTimeout(timer.current); timer.current = window.setTimeout(() => setTerm(v), 140); }} />
      <IconBtn ic="users" title="그룹 채팅 만들기" onClick={groupDialog} /><IconBtn ic="x" title="닫기" onClick={() => setSide(false)} /></header>
    <div className="side-view">{([['chars', '캐릭터별'], ['recent', '최근순']] as const).map(([k, l]) => <button key={k} className={view === k ? 'on' : undefined} onClick={() => { S.set({ sideView: k }); drawSide(); }}>{l}</button>)}
      <span>{`대화방 ${S.chats.length}`}</span></div>
    <List term={term} />
  </>;
});
export const sideRef = (el: HTMLElement | null) => { ui.side = el; };
