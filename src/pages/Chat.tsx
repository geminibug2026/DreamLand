// 대화 화면: 왼쪽 대화방 목록 · 옆 프로필 · 메시지와 입력창 · 장면 패널
import { memo, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { Btn, Icon } from '../kit';
import { orderHooks } from '../chat/order';
import { cur, ui, useCh } from '../chat/store';
import { armAuto, assetOwners, catchUp, charsOf, drawDrawer, drawMain, drawSide, fillLate, modeOf, truncation } from '../chat/actions';
import { Side, sideRef } from '../chat/Side';
import { Dossier, Top } from '../chat/Top';
import { Hud } from '../chat/Hud';
import { Messages } from '../chat/Messages';
import { Composer } from '../chat/Composer';
import { Drawer } from '../chat/Drawer';
import { go, route } from '../lib/router';
import { tint } from '../lib/tone';
import { S, emit } from '../lib/core';
import { Assets } from '../lib/assets';
import { Memory } from '../lib/memory';
import { Illust } from '../lib/illust';
import { t } from '../i18n';

export const page = { name: 'chat', Component: ChatPage };

const HudSlot = memo(function HudSlot() { return <div className="hud-slot"><Hud /></div>; });
const Scroll = memo(function Scroll() { return <div className="chat-scroll" ref={el => { ui.scroll = el; }}><Messages /></div>; });
const Foot = memo(function Foot() { return <Composer />; });

/** 가운데 칸: 상단 줄 · 상태창 · 메시지 · 입력창 */
function Main() {
  useCh('main');
  const c = cur.chat!, talk = modeOf(c) === 'talk';
  const cls = ['chat-main', c.bg && 'has-bg', c.charIds.length > 1 && 'is-group', talk ? 'mode-talk' : 'mode-rp', talk && c.scene?.on && 'in-scene'].filter(Boolean).join(' ');
  return <div className={cls} ref={el => { el?.style.setProperty('--chat-bg', c.bg ? `url("${c.bg}")` : 'none'); }}><Top /><HudSlot /><Scroll /><Foot /></div>;
}

function ChatPage({ arg }: { arg?: unknown }) {
  useState(() => { cur.sideOpen = false; orderHooks(); });   // 방을 열 때마다 목록은 닫힌 채로 시작한다 · 다른 기능이 꽂은 칸의 차례를 맞춘다
  useCh('layout');
  const [st, setSt] = useState<'wait' | 'none' | 'ready'>('wait');
  const layout = useRef<HTMLElement>(null);
  // 화면 틀의 class 를 React 가 다시 적으면 초상 색 표시가 지워지므로 그릴 때마다 다시 물들인다
  useLayoutEffect(() => { ui.layout = layout.current; if (st === 'ready' && cur.chat && layout.current) tint(layout.current, charsOf(cur.chat)[0] ?? null); });
  useEffect(() => {
    let live = true;
    void (async () => {
      await Promise.resolve();
      const id = (typeof arg === 'string' && arg) || S.settings.lastChat;
      const chat = S.get('chats', id) || [...S.chats].sort((a, b) => b.updatedAt - a.updatedAt)[0];
      if (!live) return;
      if (!chat) { setSt('none'); return; }
      const list = cur.gen?.chat === chat ? cur.gen.msgs : await S.msgsFast(chat.id);
      if (!live) return;   // 읽는 사이 다른 화면으로 넘어갔다
      cur.chat = chat; cur.msgs = list; cur.shown = truncation(); cur.lastPrompt = null; cur.openedAt = Date.now(); cur.chimeRun = 0;
      cur.head = list.length; cur.from = 0; cur.revs.clear(); cur.fresh.clear();
      if (!S.get('personas', chat.personaId)) {   // 정해 둔 페르소나가 없으면 이 방에서 마지막으로 쓴 이름, 그것도 없으면 지금 기본 페르소나로
        const last = [...list].reverse().find(m => m.role === 'user' && m.name), p = (last && S.personas.find(x => x.name === last.name)) || S.persona(chat);
        if (p) { chat.personaId = p.id; chat.personaAuto = true; S.save('chats', chat, true).catch(e => console.warn(e)); }
      }
      route.arg = chat.id; S.set({ lastChat: chat.id });
      // 에셋 · 기억 · 삽화를 기다리지 않고 먼저 그린다. 처음 여는 방이라 아직 읽지 못한 것은 읽는 대로 채워 넣는다
      const owners = assetOwners(), had = { assets: Assets.ready(owners), mem: !!Memory.get(chat.id), illust: Illust.ready(chat.id) };
      const loading = Promise.all([Assets.load(owners), Memory.load(chat.id), Illust.load(chat.id)]).catch(e => console.warn(e));
      flushSync(() => setSt('ready'));
      drawMain({ lazy: true }); drawSide(); if (cur.drawer) drawDrawer();
      await loading;
      if (!live || cur.chat !== chat) return;
      if (!had.assets || !had.mem || !had.illust) fillLate(had, owners);
      emit('chat:open', chat); const awayFor = Date.now() - (chat.seenAt || chat.updatedAt || Date.now()); if (chat.unread) { chat.unread = 0; void S.save('chats', chat, true); drawSide(); }
      if (!(await catchUp(chat, awayFor))) armAuto();
    })();
    return () => { live = false; ui.layout = ui.scroll = ui.msgs = ui.side = null; ui.input = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return <section className={['chat-layout', cur.drawer && 'with-drawer', cur.sideOpen && 'show-side'].filter(Boolean).join(' ')} ref={layout}>
    <aside className="chat-side" ref={sideRef}><Side /></aside>
    <aside className="dossier">{st === 'ready' ? <Dossier /> : null}</aside>
    {st === 'ready' ? <Main /> : <div className="chat-main">{st === 'none' ? <div className="empty big"><Icon name="moon" size={46} /><p>{t('chat.page.empty')}</p><Btn label={t('chat.page.toChars')} ic="home" cls="primary" onClick={() => go('home')} /></div> : null}</div>}
    <aside className="drawer"><Drawer /></aside>
  </section>;
}
