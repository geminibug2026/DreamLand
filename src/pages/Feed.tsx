// 밤의 게시판 화면: 내 휴대폰의 게시판 앱 화면을 그대로 (src/phone/apps/Board.tsx). arg 로 글 id 를 받으면 그 글로 간다.
// 휴대폰 틀(상태 줄 · 홈 막대) 없이 화면만 앱 페이지 안에 놓는다. 참여자 · 설정은 화면 위 "게시판 관리"에서 (창으로 뜬다)
import { useEffect, useMemo, useState } from 'react';
import { loadCss } from '../addons/parts';
import { emit } from '../lib/core';
import { go } from '../lib/router';
import { useEvents } from '../kit';
import { F } from '../feed/store';
import { view } from '../feed/parts';
import { Board as PhoneBoard } from '../phone/apps/Board';
import { PhoneCtx, type PhoneApi } from '../phone/ui';
import { prefs } from '../phone/prefs';

type Scr = { k: string; id?: string } | undefined;
/** 다른 곳에서 "그 글로" 하고 넘어왔을 때(feed/parts 의 show): 그 화면부터 */
function firstStack(arg: unknown): Scr[] {
  const from = view.stack.splice(0) as Scr[];
  if (typeof arg === 'string' && arg) { const n = F.notes.find(x => x.id === arg); if (n) return [undefined, { k: 'note', id: n.root || n.id }]; }
  return [undefined, ...from.filter(Boolean)];
}

function FeedPage({ arg }: { arg?: unknown }) {
  useEvents('feed:changed', 'chars', 'personas');
  const [css, setCss] = useState(false);
  useEffect(() => { let live = true; void loadCss('phone.css').then(() => { if (live) setCss(true); }); return () => { live = false; }; }, []);
  const [stack, setStack] = useState<Scr[]>(() => firstStack(arg));
  const api = useMemo<PhoneApi>(() => ({
    home: null, fav: null, p: prefs(), v: 0, fresh: new Map(), notifs: [], sns: null, inPage: true,
    open: (app, a) => { if (app === 'board') setStack(s => [...s, a as Scr]); else emit('phone:open'); },
    back: () => setStack(s => s.length > 1 ? s.slice(0, -1) : (go('home'), s)),
    home2: () => setStack([undefined]),
    leave: after => after?.(),
    toChat: c => go('chat', c.id),
    dial: c => { go('chat', c.id); setTimeout(() => emit('call:dial', c), 400); },
    read: () => { }, mute: () => { }, setCc: () => { }, edit: false, setEdit: () => { },
  }), []);
  // 화면이 바뀌면 맨 위로
  useEffect(() => { document.querySelector('.pn-inpage .pn-appscroll')?.scrollTo(0, 0); }, [stack.length]);
  if (!css) return null;
  return <div className="pn-dev pn-inpage" data-theme={api.p.theme}>
    <div className="pn-scr"><div className="pn-app"><div className="pn-appscroll">
      <PhoneCtx.Provider value={api}><PhoneBoard arg={stack[stack.length - 1]} /></PhoneCtx.Provider>
    </div></div></div>
  </div>;
}

export const page = { name: 'feed', Component: FeedPage };
