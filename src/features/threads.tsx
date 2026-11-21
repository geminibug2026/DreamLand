// 이어진 방 · 속내 쪽지 · 귓속말 · 자리에 없는 사람 · 끊고 들어오기 · 눈치껏 순서 · 자기소개 줄 — 여기서는 꽂기만 한다 (본체는 src/threads)
import type { FeatureDef } from '../main';
import { reactNode, useCss } from '../addons/parts';
import { S, on } from '../lib/core';
import { setHistoryLens } from '../lib/engine';
import { X } from '../lib/hooks';
import type { Chat, Msg } from '../lib/types';
import { chatApi, redraw, speakerHook } from '../chat/actions';
import { bump } from '../chat/store';
import { t } from '../i18n';
import { forget, prep } from '../threads/bridge';
import { dirty, lens, onReceived, onSent, pieces, show, speaker } from '../threads/run';
import { thOf, thPeek, type ThChat } from '../threads/types';
import { InnerPanel, LinksPanel, blendDialog, notesDialog, stageDialog } from '../threads/ui';

const OWNER = 'threads';
let wired = false;

function setup() {
  useCss('threads.css');
  // 기록 가리기 · 다음 화자: 훅(X)으로는 닿지 않는 두 자리에 건다
  setHistoryLens(lens);
  speakerHook.fn = speaker;

  X.filters = X.filters.filter(f => f.owner !== OWNER);
  X.filters.push({ owner: OWNER, fn: (text, info) => show(String(text), info) });
  X.prompt = X.prompt.filter(p => p.owner !== OWNER);
  X.prompt.push({ owner: OWNER, fn: pieces });
  // 답변 전 준비: 이어진 방의 최근 일을 읽어 두고(호출 없음), 자리에 없던 사람이 말하게 되면 돌아온 것으로 친다
  X.before = X.before.filter(b => b.owner !== OWNER);
  X.before.push({ owner: OWNER, fn: async ({ chat, speaker: who }) => {
    await prep(chat);
    const th = thPeek(chat);
    if (who && th.away?.includes(who.id)) { thOf(chat).away = th.away.filter(id => id !== who.id); await S.save('chats', chat, true); bump('composer', 'drawer'); }
  } });

  X.panels = X.panels.filter(p => p.owner !== OWNER);
  X.panels.push({ owner: OWNER, id: 'threads-links', get title() { return t('threads.panel.links'); }, icon: 'knot', render: chat => reactNode('th-links', 'div.col', <LinksPanel chat={chat} />) });
  X.panels.push({ owner: OWNER, id: 'threads-inner', get title() { return t('threads.panel.inner'); }, icon: 'seal', render: (chat, msgs) => reactNode('th-inner', 'div.col', <InnerPanel chat={chat} msgs={msgs} />) });
  X.actions = X.actions.filter(a => a.owner !== OWNER);
  X.actions.push({ owner: OWNER, id: 'th-notes', get label() { return t('threads.act.notes'); }, icon: 'seal', run: (m, chat) => { if (chat && m.role === 'assistant') notesDialog(m, chat); } });
  X.actions.push({ owner: OWNER, id: 'th-blend', get label() { return t('threads.act.blend'); }, icon: 'blend', run: (m, chat) => { if (chat) blendDialog(m, chat); } });
  X.commands.set('/stage', { owner: OWNER, get args() { return t('threads.cmd.stageArgs'); }, get help() { return t('threads.cmd.stage'); }, run: arg => { const { chat } = chatApi.current(); if (chat) stageDialog(chat, String(arg || '').trim()); } });

  if (wired) return; wired = true;
  on<{ msg: Msg; chat: Chat }>('message:received', onReceived);
  on<{ msg: Msg; chat: Chat }>('message:sent', onSent);
  // 스와이프를 바꾸면 끊긴 자리도 그 스와이프의 것으로: 바로 앞의 내 메시지를 다시 그린다
  on<{ msg: Msg; msgs: Msg[] }>('message:swiped', ({ msg, msgs }) => { dirty(); const prev = msgs?.[msgs.indexOf(msg) - 1]; if (prev?.role === 'user') redraw(prev, true); bump('drawer'); });
  for (const ev of ['message:deleted', 'message:trashed', 'message:edited', 'chat:open', 'generate:end']) on(ev, dirty);
  on<string>('chat:deleted', id => { void forget(String(id)).catch(e => console.warn('[이어진 방]', e)); });
  // 방을 열 때: 한쪽에만 적힌 끈(분기해 생긴 방 등)을 양쪽에 맞춰 적는다
  on<Chat>('chat:open', chat => {
    for (const id of thPeek(chat).links || []) { const o = S.get('chats', id) as ThChat | undefined; if (o && !thPeek(o).links?.includes(chat.id)) { thOf(o).links = [...(thPeek(o).links || []), chat.id]; void S.save('chats', o, true); } }
  });
  on('threads:changed', () => bump('side', 'composer'));
}

export const feature: FeatureDef = { name: OWNER, setup };
