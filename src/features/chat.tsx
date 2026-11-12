// 대화 화면이 옛 모듈과 만나는 자리: 옛 chat.js 가 내보낸 chatApi 와 Live 의 연결 고리를 React 판으로 바꿔 끼운다
import { orderHooks } from '../chat/order';
import { cur, ui } from '../chat/store';
import { armAuto, autoPlan, drawDrawer, drawHud, drawMsgs, drawTop, modeOf, onKey, onVisible, poke, watchPresence } from '../chat/actions';

import { liveSettings } from '../chat/LiveSettings';
import { editState } from '../chat/Hud';
import { on } from '../lib/core';
import { route } from '../lib/router';
import { Live } from '../lib/live';

const shown = () => route.page === 'chat' && !!cur.chat && !!ui.scroll;

export const feature = {
  name: 'chat',
  setup() {
        Live.onChange = () => { if (!shown()) return; drawTop(); drawHud(); if (cur.drawer) drawDrawer(); armAuto(); };
    Live.onUser = () => { if (!shown()) return; drawTop(); armAuto(); };
    Live.planOf = chat => (cur.chat === chat && modeOf(chat) === 'talk' ? autoPlan(chat) : null);
    Live.poke = poke;
    Live.settings = liveSettings as typeof Live.settings; Live.editState = editState as typeof Live.editState;   // 옛 모듈이 여는 설정 창 · 고치기 창도 새 것으로
    on('route', orderHooks);   // 기능이 모두 뜬 뒤(첫 화면을 그릴 때)부터 화면을 옮길 때마다 차례를 맞춘다
    on('clock', c => { if (c === cur.chat && shown()) { drawTop(); drawMsgs(); if (cur.drawer) drawDrawer(); armAuto(); } });
    on('clock:tick', c => { if (c === cur.chat && shown()) drawTop(); });
    on('settings', p => { const o = (p || {}) as object; if (shown() && ('bubbles' in o || 'showMeta' in o || 'avatarShape' in o)) drawMsgs(); });
    document.addEventListener('keydown', onKey);
    document.addEventListener('visibilitychange', onVisible);
    setInterval(watchPresence, 30000);
  },
};
