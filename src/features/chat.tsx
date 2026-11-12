// 대화 화면이 옛 모듈과 만나는 자리: 옛 chat.js 가 내보낸 chatApi 와 Live 의 연결 고리를 React 판으로 바꿔 끼운다
import { B, NEEDS, orderHooks } from '../chat/bridge';
import { cur, ui } from '../chat/store';
import { armAuto, autoPlan, chatApi, drawDrawer, drawHud, drawMsgs, drawTop, modeOf, onKey, onVisible, poke, watchPresence } from '../chat/actions';

import { liveSettings } from '../chat/LiveSettings';
import { editState } from '../chat/Hud';

const shown = () => B.ui.route.page === 'chat' && !!cur.chat && !!ui.scroll;

export const feature = {
  name: 'chat', needs: NEEDS,
  setup() {
    // 다른 모듈은 옛 chat.js 의 chatApi 객체를 그대로 들고 있다 — 그 객체의 내용만 바꾼다. startChat · startMenu 는 화면과 무관해 옛 것을 그대로 쓴다
    Object.assign(B.oldChat.chatApi, chatApi);
    const Live = B.Live;
    Live.onChange = () => { if (!shown()) return; drawTop(); drawHud(); if (cur.drawer) drawDrawer(); armAuto(); };
    Live.onUser = () => { if (!shown()) return; drawTop(); armAuto(); };
    Live.planOf = chat => (cur.chat === chat && modeOf(chat) === 'talk' ? autoPlan(chat) : null);
    Live.poke = poke;
    Live.settings = liveSettings; Live.editState = editState;   // 옛 모듈이 여는 설정 창 · 고치기 창도 새 것으로
    B.core.on('route', orderHooks);   // 기능이 모두 뜬 뒤(첫 화면을 그릴 때)부터 화면을 옮길 때마다 차례를 맞춘다
    B.core.on('clock', c => { if (c === cur.chat && shown()) { drawTop(); drawMsgs(); if (cur.drawer) drawDrawer(); armAuto(); } });
    B.core.on('clock:tick', c => { if (c === cur.chat && shown()) drawTop(); });
    B.core.on('settings', p => { const o = (p || {}) as object; if (shown() && ('bubbles' in o || 'showMeta' in o || 'avatarShape' in o)) drawMsgs(); });
    document.addEventListener('keydown', onKey);
    document.addEventListener('visibilitychange', onVisible);
    setInterval(watchPresence, 30000);
  },
};
