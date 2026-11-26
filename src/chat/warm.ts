// 켠 뒤 한가할 때, 가장 최근 대화방 몇 개를 처음 열 때 드는 일을 미리 해 둔다 — 처음 여는 방도 두 번째 여는 것처럼 바로 뜨게.
//  · 메시지 목록을 읽어 메모리에 들고 있는다 (S.msgsFast — 방을 열 때 다시 읽지 않는다)
//  · 끝부분 메시지(처음 그리는 몫)의 본문을 꾸며 기억해 둔다 (renderKept — 열 때 꾸미기를 건너뛴다)
// 짧은 틈(requestIdleCallback)마다 메시지 몇 개씩만. 대화 화면을 보고 있거나 답을 받는 중이면 쉬었다 다시 본다. 켠 뒤 한 번만
import { S } from '../lib/core';
import { Assets } from '../lib/assets';
import { route } from '../lib/router';
import { assetOwners, bodyHtml } from './actions';
import { cur, runs } from './store';
import { orderHooks } from './order';
import type { Msg, Room } from './types';

const ROOMS = 3, TAIL = 12;
let done = false;
const idle = () => new Promise<IdleDeadline | null>(r => { if ('requestIdleCallback' in window) requestIdleCallback(d => r(d), { timeout: 5000 }); else setTimeout(() => r(null), 300); });
/** 지금은 비켜 준다: 대화 화면에 있거나(그 방은 화면이 직접 그린다) · 어느 방이든 답을 받는 중 */
const away = () => route.page === 'chat' || [...runs.values()].some(r => r.busy || r.prep);

export async function warmRecent() {
  if (done) return; done = true;
  orderHooks();   // 표시 필터 차례를 대화 화면이 열 때와 같게 (늦게 뜬 확장의 필터까지)
  const last = S.get('chats', S.settings.lastChat), recent = [...S.chats].filter(c => !c.temp).sort((a, b) => b.updatedAt - a.updatedAt);
  const rooms = [...new Set([last, ...recent].filter((c): c is Room => !!c))].slice(0, ROOMS);
  for (const chat of rooms) {
    let d = await idle(), wait = 0; while (away()) { if (++wait > 30) return; await new Promise(r => setTimeout(r, 2000)); d = await idle(); }   // 1분 넘게 대화 화면에 있으면 그만둔다 (계속 깨어 있지 않게)
    if (!S.get('chats', chat.id) || cur.chat === chat) continue;
    const msgs: Msg[] = await S.msgsFast(chat.id).catch(() => []); if (!msgs.length) continue;
    await Assets.load(assetOwners(chat)).catch(() => { });   // 열 때와 같은 꼴로 꾸미려면 그림 보관함이 먼저 있어야 한다
    const at = { chat, msgs };
    for (let i = msgs.length - 1, n = 0; i >= 0 && n < TAIL; i--, n++) {
      const m = msgs[i], s = m.swipes[m.sw];
      if (!s || m.role === 'system' || /<%/.test(s.text)) continue;   // 템플릿(<% %>)이 든 글은 그릴 때만 돌린다
      if (!d || d.timeRemaining() < 6) { d = await idle(); if (away() || cur.chat === chat) break; }
      try { bodyHtml(m, true, at); } catch { /* 열 때 다시 꾸민다 */ }
    }
  }
}
