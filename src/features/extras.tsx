// 곁들임: 딱지 · 내 반응 · 손끝 울림 · 배경 서가 · 캐릭터 꾸밈 · 지운 메시지 보관함 · 범위 내보내기 · 발자국(통계) — 여기서는 꽂기만 한다 (본체는 src/extras)
import type { FeatureDef } from '../main';
import { reactNode, useCss } from '../addons/parts';
import { on } from '../lib/core';
import { X } from '../lib/hooks';
import { I } from '../lib/icons';
import { route } from '../lib/router';
import type { Chat, Msg } from '../lib/types';
import { chatApi, redraw } from '../chat/actions';
import { chatMenuExtras } from '../chat/menus';
import { toast } from '../ui';
import { t } from '../i18n';
import { cfg } from '../extras/cfg';
import { Stickers, moodPick, showStickers, stickerPrompt, tagOf, tidyReply } from '../extras/stickers';
import { sendSticker } from '../extras/StickerPicker';
import { openReactBar, reactionLines } from '../extras/reactions';
import { BUZZ_PROMPT, buzz, canBuzz, hideBuzz, stopBuzz, takeBuzz } from '../extras/buzz';
import { BgShelf, bgAuto, bgPrompt, hideBg, openBgShelf, syncBg, takeBg } from '../extras/bgshelf';
import { applyCharCss } from '../extras/charcss';
import { Trash, openTrash, undoToast } from '../extras/trash';
import { lazyComp } from '../lib/lazy';
// 패널 · 꾸미기 화면 · 발자취 · 내보내기 창은 처음 열 때 받는다
const ExtrasPanel = lazyComp(() => import('../extras/ui').then(m => m.ExtrasPanel));
const ExtrasStudio = lazyComp(() => import('../extras/ui').then(m => m.ExtrasStudio));
const askCharCss = (c?: Chat | null) => { if (c) void import('../extras/ui').then(m => m.askCharCss(c)); };
const openInsights = (c: Chat) => import('../extras/insights').then(m => m.openInsights(c));
const openExport = (c: Chat) => import('../extras/exporter').then(m => m.openExport(c));

const OWNER = 'extras';
if (!I.footprint) I.footprint = 'M8 4c1.7 0 3 2 3 4.5S9.7 13 8 13s-3-2-3-4.5S6.3 4 8 4zM6.5 16h3v2a1.5 1.5 0 0 1-3 0zM16 9c1.7 0 3 2 3 4.5S17.7 18 16 18s-3-2-3-4.5S14.3 9 16 9zM14.5 6h3V5a1.5 1.5 0 0 0-3 0z';
const isTalk = (chat: Chat) => chat.mode === 'talk' && !(chat as { sceneLive?: boolean; scene?: { on?: boolean } }).sceneLive;
let wired = false, ringTimer = 0;

async function setup() {
  useCss('extras.css');
  await Stickers.load().catch(e => console.warn('[딱지]', e));
  void BgShelf.load().catch(() => { });
  void Trash.sweep().catch(e => console.warn('[지운 메시지]', e));

  // ── 화면 표시: 딱지 줄은 그림으로, 숨은 꼬리표는 감춘다 (스트리밍 중에도) ──
  X.filters = X.filters.filter(f => f.owner !== OWNER);
  X.filters.push({ owner: OWNER, fn: text => showStickers(hideBg(hideBuzz(String(text)))) });

  // ── 프롬프트: 딱지 안내 · 내 반응 한 줄 · 울림 명령 · 배경 꼬리표 (모두 추가 호출 없음) ──
  X.prompt = X.prompt.filter(p => p.owner !== OWNER);
  X.prompt.push({ owner: OWNER, fn: ({ chat, char, msgs, type }) => {
    if (type === 'impersonate') return [];
    const out: { where: 'end' | 'depth'; role?: string; content: string; depth?: number; src?: string }[] = [];
    const stk = stickerPrompt(chat, char.id, msgs); if (stk) out.push({ where: 'end', role: 'system', content: stk, src: '딱지' });
    const re = reactionLines(chat, msgs, type); if (re) out.push({ where: 'depth', depth: 0, role: 'system', content: re, src: '내 반응' });
    const b = cfg().buzz; if (isTalk(chat) && b.on && b.ai && canBuzz()) out.push({ where: 'end', role: 'system', content: BUZZ_PROMPT, src: '손끝 울림' });
    const bg = bgPrompt(chat); if (bg) out.push({ where: 'end', role: 'system', content: bg, src: '배경 서가' });
    return out;
  } });

  // ── 장면 패널 · 기능 탭 · 대화 메뉴 · 명령 ──
  X.panels = X.panels.filter(p => p.owner !== OWNER);
  X.panels.push({ owner: OWNER, id: 'extras', get title() { return t('extras.panel.title'); }, icon: 'sticker', render: chat => reactNode('xt-panel', 'div.col', <ExtrasPanel chat={chat} />) });
  X.studio = X.studio.filter(s => s.owner !== OWNER);
  X.studio.push({ owner: OWNER, get title() { return t('extras.studio.title'); }, preload: () => ExtrasStudio.preload(), render: () => reactNode('xt-studio', 'div.xt', <ExtrasStudio />) });
  const mine = (c: Chat) => [
    { label: t('extras.ins.open'), ic: 'footprint', hint: t('extras.ins.openHint'), onclick: () => void openInsights(c) },
    { label: t('extras.trash.open'), ic: 'trash', onclick: () => void openTrash(c) },
    { label: t('extras.export.open'), ic: 'import', hint: t('extras.export.openHint'), onclick: () => void openExport(c) }];
  const at = chatMenuExtras.findIndex(f => (f as { owner?: string }).owner === OWNER); if (at >= 0) chatMenuExtras.splice(at, 1);
  chatMenuExtras.push(Object.assign(mine, { owner: OWNER }));
  X.commands.set('/sticker', { owner: OWNER, get args() { return t('extras.cmd.stickerArgs'); }, get help() { return t('extras.cmd.sticker'); }, run: arg => {
    const { chat } = chatApi.current(), s = Stickers.find(String(arg || ''), Stickers.usable(chat));
    if (!s) return toast(t('extras.cmd.stickerNone', { name: String(arg || '').trim() || '—' }), 'err');
    return sendSticker(s);
  } });
  X.commands.set('/footprints', { owner: OWNER, get help() { return t('extras.cmd.footprints'); }, run: () => { const { chat } = chatApi.current(); if (chat) void openInsights(chat); } });

  if (wired) return; wired = true;
  // ── 답장이 왔을 때: 꼬리표를 떼고(저장 전) 그 뜻대로 움직인다 ──
  on<{ msg: Msg; chat: Chat }>('message:received', ({ msg, chat }) => {
    if (!msg || msg.role !== 'assistant') return;
    const sw = msg.swipes[msg.sw]; if (!sw) return;
    const before = sw.text, c = cfg(), talk = isTalk(chat), open = chatApi.current().chat === chat;
    let text = before;
    const bz = takeBuzz(text); text = bz.text;
    if (open && !document.hidden) { if (bz.names.length && talk) buzz(bz.names[0], 'ai'); else if (c.buzz.reply) buzz('reply', 'reply'); }
    const bg = takeBg(text); text = bg.text;
    if (bg.name && bgAuto(chat)) (sw as { bg?: string }).bg = bg.name;
    const pool = Stickers.forChar(chat, msg.charId), may = talk || c.stk.rp;
    text = tidyReply(text, pool, may && c.stk.ai === 'pick');
    if (may && c.stk.ai === 'mood' && text.trim()) { const s = moodPick(text, String(sw.expr || ''), pool, `${msg.id}:${msg.sw}`, c.stk.moodRate); if (s) text = text.trimEnd() + '\n' + tagOf(s, false); }
    if (text !== before) { sw.text = text; if (open) redraw(msg, true); }
    if (open && bgAuto(chat)) void syncBg(chat, chatApi.current().msgs);
  });
  for (const ev of ['message:swiped', 'message:deleted']) on<{ chat: Chat; msgs: Msg[] } | undefined>(ev, d => { if (d?.chat && bgAuto(d.chat)) void syncBg(d.chat, d.msgs || []); });

  // ── 지운 메시지 ──
  on<{ chat: Chat; gone: Msg[]; at: number; after?: string }>('message:trashed', d => { if (d?.chat && d.gone?.length) void Trash.add(d.chat, d.gone, d.at, d.after || '').then(b => undoToast(d.chat, b, d.gone.length)).catch(e => console.warn('[지운 메시지]', e)); });
  on<string>('chat:deleted', id => { void Trash.dropChat(id).catch(() => { }); });
  on('data:imported', () => { void Stickers.reload(); BgShelf.drop(); void BgShelf.load(); void Trash.sweep().catch(() => { }); });

  // ── 캐릭터 꾸밈 ──
  on<Chat | null>('chat:open', chat => { applyCharCss(chat); setTimeout(() => askCharCss(chatApi.current().chat), 700); });
  on('chars', () => { if (route.page === 'chat') applyCharCss(chatApi.current().chat); });
  on<string>('route', page => { if (page !== 'chat') applyCharCss(null); });

  // ── 화면의 단추가 보내는 알림 ──
  on<{ m: Msg; anchor: Element }>('xt:react', d => { if (d?.m && d.anchor) openReactBar(d.anchor, d.m); });
  on<Chat>('xt:bgshelf', c => { if (c) openBgShelf(c); });

  // ── 손끝 울림: 전화 벨 · 다른 기능이 보내는 연출(fx:buzz) ──
  on('talk:call', () => { clearTimeout(ringTimer); ringTimer = window.setTimeout(() => buzz('ring', 'call'), 1500); });
  on('call:end', () => { clearTimeout(ringTimer); stopBuzz(); });
  on<string | number[] | { pattern?: string | number[] }>('fx:buzz', p => { const v = p && typeof p === 'object' && !Array.isArray(p) ? p.pattern : p; if (v) buzz(v as string | number[], 'game'); });
}

export const feature: FeatureDef = { name: OWNER, setup };
