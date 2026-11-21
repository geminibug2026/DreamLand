// 닿기: 이 대화의 모델 고르기 · 섞어 쓰기 · 실패하면 넘기기 · 분당 제한 · 차림 · 서점 (본체는 src/reach/)
import type { FeatureDef } from '../main';
import type { Chat } from '../lib/types';
import { S, on } from '../lib/core';
import { X } from '../lib/hooks';
import { go, route } from '../lib/router';
import { reactNode, useCss } from '../addons/parts';
import { toast } from '../ui';
import { bump } from '../chat/store';
import { t } from '../i18n';
import { chooseFor, clearChoice, wireRpm, type RChat } from '../reach/route';
import { openPicker } from '../reach/models';
import { applyGlobals, autoDress, outfits, wear, wornBy } from '../reach/outfit';
import { FitPanel, openWardrobe } from '../reach/OutfitUi';

const OWNER = 'reach';
function setup() {
  useCss('reach.css');
  wireRpm();

  X.panels = X.panels.filter(p => p.owner !== OWNER);
  X.panels.push({ owner: OWNER, id: 'reach-fit', get title() { return t('reach.fit.title'); }, icon: 'user', render: chat => reactNode('reach-fit', 'div.col', <FitPanel chat={chat as RChat} />) });

  // /model — 창을 연다 · /model <id> — 이 대화의 모델을 바꾼다 · /model default — 기본으로
  X.commands.set('/model', { owner: OWNER, get args() { return t('reach.cmd.modelArgs'); }, get help() { return t('reach.cmd.model'); }, run: async (arg, api) => {
    const chat = api.current().chat as RChat | null, id = arg.trim(); if (!chat) return;
    if (!id) return openPicker(chat);
    if (/^(default|기본|默认)$/i.test(id)) { await clearChoice(chat); toast(t('reach.pick.backDone')); }
    else { const conn = S.connFor(chat); if (!conn) return toast(t('reach.pick.noConn'), 'err'); await chooseFor(chat, S.get('conns', conn.id) || conn, id); toast(t('reach.pick.chosen', { model: id }), 'ok'); }
    bump('composer', 'top');
  } });
  X.commands.set('/outfit', { owner: OWNER, get args() { return t('reach.cmd.outfitArgs'); }, get help() { return t('reach.cmd.outfit'); }, run: async (arg, api) => {
    const chat = api.current().chat as RChat | null, k = arg.trim().toLowerCase(); if (!chat) return;
    if (!k) return openWardrobe(chat);
    const o = outfits().find(x => x.name.toLowerCase() === k) || outfits().find(x => x.name.toLowerCase().includes(k));
    if (!o) return toast(t('reach.fit.notFound', { name: arg.trim() }), 'err');
    await wear(chat, o); toast(t('reach.fit.worn', { name: o.name }), 'ok'); go('chat', chat.id);
  } });

  // 모드별 기본 차림: 새 대화를 열 때, 게임을 시작할 때 (아직 아무 차림도 입지 않은 대화만)
  const auto = (chat: Chat, mode: string) => {
    const open = route.page === 'chat' && route.arg === chat.id;
    void autoDress(chat as RChat, mode, open).then(o => { if (!o) return; toast(t('reach.fit.autoWorn', { name: o.name })); if (route.page === 'chat' && route.arg === chat.id) go('chat', chat.id); }).catch(e => console.warn('[차림]', e));
  };
  on<Chat>('chat:new', chat => auto(chat, chat.mode === 'talk' ? 'talk' : 'rp'));
  on<Chat>('game:start', chat => auto(chat, 'game'));
  // 차림을 입은 대화를 열면, 앱 설정 쪽에 있는 칸(번역)도 그 차림대로 맞춘다
  on('route', pg => { if (pg !== 'chat') return; const o = wornBy(S.get('chats', (route.arg as string) || (S.settings.lastChat as string))); if (o) applyGlobals(o); });
}
export const feature: FeatureDef = { name: 'reach', setup };
