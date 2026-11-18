// 게임 모드: 대화에 시트(HP · 소지품 · 임무)를 붙이고, 판정 · 전투 · 미니게임을 앱이 직접 진행한다.
// 진행자(모델)는 답변 끝에 짧은 표시만 쓰고, 굴리고 계산하는 일은 모두 앱이 한다 — 그래서 요청이 더 나가지 않는다.
import type { FeatureDef } from '../main';
import type { Chat, Msg } from '../lib/types';
import { S, on } from '../lib/core';
import { X } from '../lib/hooks';
import { chatApi, drawMain } from '../chat/actions';
import { reactNode } from '../addons/parts';
import { toast } from '../ui';
import { t } from '../i18n';
import { def, str } from '../stscript/run';
import { bagPrompt, packBag, type BagCfg } from '../game/bag';
import { MINIS, gameOf, hideTags, readTags, rulesPrompt, sheetOf, sheetPrompt, type GameSwipe, type MiniId } from '../game/state';
import { Sheet, drawFor, openGame, openMiniPicker, playMini, redrawGame } from '../game/ui';
import { closeStage, openStage, stageOpenFor } from '../game/Stage';
import type { GameChat } from '../game/state';

const OWNER = 'game';
const here = () => chatApi.current().chat;

/** 게임 화면을 연다. 닫으면 대화 화면으로 돌아가고, 다음에 이 방을 열 때도 대화 화면으로 열린다 */
export function showStage(chat: Chat) {
  const g = (chat as GameChat).game; if (!g?.on) return;
  if (g.stage === false) { g.stage = true; void S.save('chats', chat, true); }
  openStage(chat.id, () => { const c = S.chats.find(x => x.id === chat.id) as GameChat | undefined; if (c?.game) { c.game.stage = false; void S.save('chats', c, true); } closeStage(); redrawGame(); });
}
function setup() {
  on<Chat>('chat:open', chat => { const g = gameOf(chat); if (g && g.stage !== false) showStage(chat); else if (stageOpenFor()) closeStage(); });
  on<Chat>('game:start', chat => showStage(chat));
  // 진행자에게 알려 줄 내 음악 목록을 미리 읽어 둔다
  void import('../game/media').then(m => m.loadMedia()).catch(() => { });
  // 게임 모드로 들어가기: 하던 게임이 있으면 이어서, 없으면 시작 창. 게임은 RP 방식으로 진행한다 (대화 모드의 기능이 섞이지 않게)
  on<Chat>('game:enter', chat => {
    const g = (chat as GameChat).game;
    if (!g) return openGame(chat);
    if (!g.on) { g.on = true; g.stage = true; if (chat.mode !== 'rp') { g.prev = chat.mode; chat.mode = 'rp'; } void S.save('chats', chat, true); drawMain(); toast(t('game.resumed'), 'ok'); }
    showStage(chat); redrawGame();
  });
  // 잠시 멈추기: 시트 · 지도 · 일지는 그대로 두고 규칙과 표시 읽기만 끈다
  on<Chat>('game:pause', chat => { const g = (chat as GameChat).game; if (!g?.on) return; g.on = false; void S.save('chats', chat, true); closeStage(); redrawGame(); toast(t('game.paused')); });
  // 답변을 받으면 표시를 읽어 변화와 맡긴 일을 그 답변에 붙이고, 글에서는 지운다 (기다림 없이 — 뒤이어 도는 기억 기록 · 번역이 깨끗한 글을 보도록)
  on('message:received', data => {
    const { msg, chat } = data as { msg: Msg; chat: Chat };
    if (!gameOf(chat) || msg?.role !== 'assistant') return;
    const sw = msg.swipes[msg.sw] as (Msg['swipes'][number] & GameSwipe) | undefined; if (!sw?.text) return;
    const r = readTags(sw.text);
    if (r.fx.length || r.ask || r.choices.length || r.cine.length) {
      if (r.cine.length) sw.gcine = r.cine; else delete sw.gcine;
      sw.text = r.text; if (r.fx.length) sw.gfx = r.fx; else delete sw.gfx; if (r.ask) sw.gask = r.ask; else delete sw.gask; if (r.choices.length) sw.gchoices = r.choices; else delete sw.gchoices;
      if (here()?.id === chat.id) void chatApi.save(); else void S.msgs(chat.id).then(msgs => S.saveMsgs(chat, msgs));
    }
    redrawGame();
    // 삽화: 새 장소에 도착했거나, 전투 결과를 이어받은 답변만 그린다 (답변마다 그리지 않는다)
    // 새 장소에 닿으면 체크포인트를 남긴다 (그 장면으로 돌아오기 쉽게)
    { const place = r.fx.find(f => f.k === 'place'); if (place && place.k === 'place' && here()?.id === chat.id) void import('../flow/logic').then(f => f.addCheckpoint(msg, place.name)).catch(() => { }); }
    if (here()?.id === chat.id) { const msgs = chatApi.current().msgs, before = msgs[msgs.indexOf(msg) - 1] as (Msg & { gm?: { kind?: string } }) | undefined; if (r.fx.some(f => f.k === 'place') || before?.gm?.kind === 'fight') void drawFor(chat, msg); }
  });
  for (const ev of ['generate:end', 'message:deleted', 'message:swiped', 'message:edited', 'message:sent', 'chat:open']) on(ev, redrawGame);

  X.prompt = X.prompt.filter(p => p.owner !== OWNER);
  X.prompt.push({ owner: OWNER, fn: info => {
    const g = gameOf(info.chat); if (!g || info.type === 'impersonate') return [];
    return [{ where: 'before', content: rulesPrompt(g), src: '게임 규칙' }, { where: 'end', content: (() => { const sh = sheetOf(g, info.msgs); return sheetPrompt(g, sh, bagPrompt(packBag(g.bag as BagCfg | undefined, sh.items, sh.level))); })(), src: '게임 시트' }];
  } });
  // 화면에서는 표시를 가린다 (받는 중인 글에도)
  X.filters = X.filters.filter(f => f.owner !== OWNER);
  X.filters.push({ owner: OWNER, fn: (text, info) => {
    if (!text || text.indexOf('[') < 0 || info?.role !== 'assistant' || !gameOf(info.chat)) return text;
    return hideTags(text, chatApi.current().busy);
  } });

  X.composer = X.composer.filter(c => c.owner !== OWNER);
  X.composer.push({ owner: OWNER, id: 'game-open', icon: 'dice', get label() { return gameOf(here()) ? t('game.menu.sheet') : t('game.menu.start'); }, run: () => { const c = here(); if (c) openGame(c); } });
  X.composer.push({ owner: OWNER, id: 'game-stage', icon: 'image', get label() { return t('game.stage.open'); }, run: () => { const c = here(); if (!c) return; if (gameOf(c)) showStage(c); else openGame(c); } });
  X.composer.push({ owner: OWNER, id: 'game-mini', icon: 'play', get label() { return t('game.mini.title'); }, run: () => { const c = here(); if (c) openMiniPicker(c); } });
  X.panels = X.panels.filter(p => p.owner !== OWNER);
  X.panels.push({ owner: OWNER, id: 'game', get title() { return t('game.sheet.title'); }, icon: 'dice', render: (chat, msgs) => gameOf(chat) ? reactNode('game-panel', 'div.gm', <Sheet chat={chat} msgs={msgs} />) : null });

  def('game', { help: '', run: () => { const c = here(); if (c) openGame(c); return ''; } });
  def(['play', 'minigame'], { help: '', run: a => {
    const c = here(); if (!c) return '';
    const want = str(a.unnamed).trim().toLowerCase(), id = MINIS.find(m => m === want || t('game.mini.' + m).toLowerCase() === want) as MiniId | undefined;
    if (want && !id) toast(t('game.mini.unknown', { names: MINIS.join(', ') }), 'err');
    if (id) playMini(c, id); else openMiniPicker(c);
    return '';
  } });
}
export const feature: FeatureDef = { name: 'game', setup };
