// 밤의 게시판이 앱에 꽂는 것들: 자료 읽기 · 대화 프롬프트에 게시판 활동 싣기 · 대화 중 [post: …] 받기 · 대화 서랍 스위치 · 자동 새로 고침(기본 꺼짐)
import type { FeatureDef } from '../main';
import { reactNode, useCss } from '../addons/parts';
import { on } from '../lib/core';
import { X, type PromptPiece } from '../lib/hooks';
import { go } from '../lib/router';
import type { Chat, Msg } from '../lib/types';
import { chatApi, redraw } from '../chat/actions';
import { toast } from '../ui';
import { t } from '../i18n';
import { hidePosts, takePosts } from '../feed/logic';
import { POST_PROMPT, carryBlock, chatFeed } from '../feed/prompt';
import { F, OWNER, account, autoTick, cfg, chatPost, dropChat, load, reconcile } from '../feed/store';
import { ChatPanel } from '../feed/parts';

type LiveChat = Chat & { scene?: { on?: boolean }; sceneLive?: boolean };
/** 메신저처럼 주고받는 중인가 (대화 모드이고, 마주 보는 장면이 열려 있지 않다) */
const texting = (c: LiveChat) => c.mode === 'talk' && !c.scene?.on;
let wired = false;

async function setup() {
  useCss('feed.css');
  await load().catch(e => console.warn('[게시판]', e));

  // ── 대화로 되돌아오기: 그 캐릭터가 게시판에서 한 일을 프롬프트에 (추가 호출 없음) ──
  X.prompt = X.prompt.filter(p => p.owner !== OWNER);
  X.prompt.push({ owner: OWNER, fn: ({ chat, char, type }) => {
    if (type === 'impersonate' || !char || !account(char.id)?.on) return [];
    const c = cfg(), f = chatFeed(chat), talk = chat.mode === 'talk', out: PromptPiece[] = [];
    if (f.carry ?? (talk && c.carry)) { const block = carryBlock(F, char, c); if (block) out.push(talk ? { where: 'end', role: 'system', content: block, src: '밤의 게시판' } : { where: 'depth', depth: 4, order: 58, role: 'system', content: block, src: '밤의 게시판' }); }
    if (c.chatPost && texting(chat) && type !== 'continue') out.push({ where: 'end', role: 'system', content: POST_PROMPT, src: '게시판에 글 올리기' });
    return out;
  } });
  // 화면에서는 [post: …] 줄을 가린다 (쓰는 중에도)
  X.filters = X.filters.filter(f => f.owner !== OWNER);
  X.filters.push({ owner: OWNER, fn: text => hidePosts(String(text)) });
  X.panels = X.panels.filter(p => p.owner !== OWNER);
  X.panels.push({ owner: OWNER, id: 'feed', icon: 'fdboard', get title() { return t('feed.title'); }, render: chat => reactNode('feed-panel', 'div.col', <ChatPanel chat={chat} />) });
  X.commands.set('/board', { owner: OWNER, get help() { return t('feed.cmd.board'); }, run: () => go('feed') });

  if (wired) return; wired = true;
  // ── 답장에 실려 온 [post: …] 를 떼어 게시판에 꽂는다 (저장 전이라 고친 글이 함께 저장된다) ──
  on<{ msg: Msg; chat: Chat }>('message:received', ({ msg, chat }) => {
    if (!msg || msg.role !== 'assistant' || !/\[post/i.test(msg.swipes[msg.sw]?.text || '')) return;
    const sw = msg.swipes[msg.sw], got = takePosts(sw.text); if (got.text === sw.text) return;
    sw.text = got.text;
    if (cfg().chatPost && chat.mode === 'talk') { const ids = chatPost(chat, msg, got.posts); if (ids.length) toast(t('feed.toast.posted', { name: msg.name || '' }), 'ok'); }
    const cur = chatApi.current(); if (cur.chat === chat) { redraw(msg, true); void reconcile(chat, cur.msgs); }   // 다시 생성해 스와이프가 늘었으면 앞 스와이프의 글은 거둔다
  });
  // 스와이프를 넘기거나 메시지를 지우면 거기서 올라온 글도 따라 움직인다
  for (const ev of ['message:swiped', 'message:deleted', 'message:edited']) on<{ chat: Chat; msgs: Msg[] } | undefined>(ev, d => { if (d?.chat && d.msgs) void reconcile(d.chat, d.msgs); });
  on<string>('chat:deleted', id => { void dropChat(id); });
  on('data:imported', () => { void load(); });
  // 자동 새로 고침: 10분마다 살펴본다 (설정에서 하루 횟수를 정했을 때만 움직인다)
  setInterval(autoTick, 600e3); setTimeout(autoTick, 90e3);
}
export const feature: FeatureDef = { name: OWNER, setup };
