// 게임 모드: 대화에 시트(HP · 소지품 · 임무)를 붙이고, 판정 · 전투 · 미니게임을 앱이 직접 진행한다.
// 진행자(모델)는 답변 끝에 짧은 표시만 쓰고, 굴리고 계산하는 일은 모두 앱이 한다 — 그래서 요청이 더 나가지 않는다.
import type { FeatureDef } from '../main';
import type { Chat, Msg } from '../lib/types';
import { S, on } from '../lib/core';
import { X } from '../lib/hooks';
import { chatApi, drawMain } from '../chat/actions';
import { reactNode, useCss } from '../addons/parts';
import { carryOmen, castOmens, moreRules, settle, turnPieces, unfold, veilText } from '../game/turn';
import { toast } from '../ui';
import { t } from '../i18n';
import { def, str } from '../stscript/run';
import { bagPrompt, packBag, type BagCfg } from '../game/bag';
import { inCall } from '../call/logic';
import { MINIS, gameOf, hideTags, ruleOf, rulesPrompt, sheetOf, sheetPrompt, statCfg, type GameSwipe, type MiniId } from '../game/state';
import { latestStat, varsPrompt } from '../game/vars';
import { hook as linkVars } from '../game/sync';
import { Sheet, drawFor, openGame, openMiniPicker, playMini, redrawGame } from '../game/ui';
import { closeStage, openStage, stageOpenFor } from '../game/Stage';
import type { GameChat } from '../game/state';

const OWNER = 'game';
const here = () => chatApi.current().chat;

/** 게임 화면을 연다. 닫으면 대화 화면으로 돌아가고, 다음에 이 방을 열 때도 대화 화면으로 열린다 */
export function showStage(chat: Chat) {
  const g = (chat as GameChat).game; if (!g?.on) return;
  if (g.stage === false) { g.stage = true; void S.save('chats', chat, true); }
  openStage(chat.id, () => { const c = S.chats.find(x => x.id === chat.id) as GameChat | undefined; if (c?.game) { c.game.stage = false; void S.save('chats', c, true); } closeStage(); redrawGame(); behind.now(); });
}
/** 게임 화면에 가려진 대화 화면을 나중에 고친다. 게임 화면과 한 번에 그리면 들어가는 동안 화면이 멈추니, 게임 화면이 뜨고 한숨 돌린 뒤 틈날 때 한다.
 *  그 전에 대화 화면으로 돌아오면(now) 바로 고치고, 그사이 방이나 모드가 바뀌면(drop) 그만둔다 */
const behind = {
  job: null as (() => void) | null, tm: 0,
  later(chat: Chat) {
    this.drop();
    const run = this.job = () => { if (this.job !== run) return; this.drop(); if (here()?.id === chat.id) drawMain(); };
    const idle = () => { if ('requestIdleCallback' in window) requestIdleCallback(run, { timeout: 1500 }); else run(); };
    this.tm = window.setTimeout(idle, 600);
  },
  now() { this.job?.(); },
  drop() { clearTimeout(this.tm); this.job = null; },
};
function setup() {
  useCss('gm2.css');
  on<Chat>('chat:open', chat => { const g = gameOf(chat); if (g && g.stage !== false) showStage(chat); else if (stageOpenFor()) closeStage(); });
  on<Chat>('game:start', chat => showStage(chat));
  // 진행자에게 알려 줄 내 음악 목록을 미리 읽어 둔다
  void import('../game/media').then(m => m.loadMedia()).catch(() => { });
  // 게임 모드로 들어가기: 하던 게임이 있으면 이어서, 없으면 시작 창. 게임은 RP 방식으로 진행한다 (대화 모드의 기능이 섞이지 않게)
  on<Chat>('game:enter', chat => {
    const g = (chat as GameChat).game;
    if (!g) return openGame(chat);
    // 이어 하기: 게임 화면부터 띄우고, 그 뒤에 가려진 대화 화면(모드 · 표시 가림이 달라졌다)은 나중에 고친다
    const resumed = !g.on;
    if (resumed) { g.on = true; g.stage = true; if (chat.mode !== 'rp') { g.prev = chat.mode; chat.mode = 'rp'; } void S.save('chats', chat, true); toast(t('game.resumed'), 'ok'); }
    showStage(chat); redrawGame();
    if (resumed) { if (stageOpenFor() === chat.id) behind.later(chat); else drawMain(); }
  });
  // 잠시 멈추기: 시트 · 지도 · 일지는 그대로 두고 규칙과 표시 읽기만 끈다
  on<Chat>('game:pause', chat => { const g = (chat as GameChat).game; if (!g?.on) return; behind.drop(); g.on = false; void S.save('chats', chat, true); closeStage(); redrawGame(); toast(t('game.paused')); });
  // 답변을 받으면 표시를 읽어 변화와 맡긴 일을 그 답변에 붙이고, 글에서는 지운다 (기다림 없이 — 뒤이어 도는 기억 기록 · 번역이 깨끗한 글을 보도록)
  on('message:received', data => {
    const { msg, chat } = data as { msg: Msg; chat: Chat };
    if (!gameOf(chat) || msg?.role !== 'assistant') return;
    const sw = msg.swipes[msg.sw] as (Msg['swipes'][number] & GameSwipe) | undefined; if (!sw?.text) return;
    // 먼저 갈라 쓴 판정을 굴려 한쪽만 남기고 굴림 자리를 채운다 — 그래야 남은 갈래의 표시만 시트에 닿는다
    const mine = here()?.id === chat.id ? chatApi.current().msgs : [msg], had = sw.gturn;
    const opened = unfold(chat, msg, sw, mine); carryOmen(msg, sw, mine);
    const r = settle(sw);
    if (r.changed || opened || sw.gturn || had) { if (here()?.id === chat.id) void chatApi.save(); else void S.msgs(chat.id).then(msgs => S.saveMsgs(chat, msgs)); }
    if (opened && here()?.id === chat.id) chatApi.redraw();   // 갈래가 걷혀 글이 달라졌으니 그 답장을 다시 그린다
    redrawGame();
    // 삽화: 새 장소에 도착했거나, 전투 결과를 이어받은 답변만 그린다 (답변마다 그리지 않는다)
    // 새 장소에 닿으면 체크포인트를 남긴다 (그 장면으로 돌아오기 쉽게)
    { const place = r.fx.find(f => f.k === 'place'); if (place && place.k === 'place' && here()?.id === chat.id) void import('../flow/logic').then(f => f.addCheckpoint(msg, place.name)).catch(() => { }); }
    if (here()?.id === chat.id) { const msgs = chatApi.current().msgs, before = msgs[msgs.indexOf(msg) - 1] as (Msg & { gm?: { kind?: string } }) | undefined; if (r.fx.some(f => f.k === 'place') || before?.gm?.kind === 'fight') void drawFor(chat, msg); }
  });
  // 내가 말을 보내면 그 차례의 만남 · 눈에 띄는 것을 미리 굴려 메시지에 적어 둔다 (다시 받아도 같은 일이 벌어지게)
  on('message:sent', data => { const { msg, chat } = data as { msg: Msg; chat: Chat }; if (gameOf(chat) && here()?.id === chat.id) castOmens(chat, msg, chatApi.current().msgs); });
  for (const ev of ['generate:end', 'message:deleted', 'message:swiped', 'message:edited', 'message:sent', 'chat:open']) on(ev, redrawGame);
  // 상태 변수(MVU)와 잇기: 진행자의 답변을 계산할 때 게임 표시를 이어 둔 변수의 명령으로 바꾸고 (game/sync), 변수가 바뀌면 시트를 다시 그린다 (시트가 변수를 읽는다)
  linkVars();
  on('mvu:updated', () => { if (gameOf(here())?.vars) redrawGame(); });

  X.prompt = X.prompt.filter(p => p.owner !== OWNER);
  X.prompt.push({ owner: OWNER, fn: info => {
    const g = gameOf(info.chat); if (!g || info.type === 'impersonate' || inCall(info.chat)) return [];
    const sh = sheetOf(g, info.msgs), st = g.vars?.links.length ? latestStat(info.msgs) : null, linked = st ? varsPrompt(g.vars!, st, ruleOf(g)) : '';
    return [{ where: 'before', content: rulesPrompt(g, moreRules(g)), src: '게임 규칙' }, ...turnPieces(g, info.msgs, info.type), { where: 'end', content: sheetPrompt(statCfg(g, sh), sh, bagPrompt(packBag(g.bag as BagCfg | undefined, sh.items, sh.level))), src: '게임 시트' },
      // 이어 둔 상태 변수: 어느 칸이 어느 변수인지와 지금 값만 짧게 (트리 전체가 아니다), 그리고 겹침 규칙
      ...(linked ? [{ where: 'end' as const, content: linked, src: '게임 변수' }] : [])];
  } });
  // 화면에서는 표시를 가린다 (받는 중인 글에도)
  X.filters = X.filters.filter(f => f.owner !== OWNER);
  X.filters.push({ owner: OWNER, fn: (text, info) => {
    if (!text || text.indexOf('[') < 0 || info?.role !== 'assistant' || !gameOf(info.chat)) return text;
    const busy = chatApi.current().busy;
    return hideTags(veilText(text, busy, t('game.one.wait')), busy);
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
