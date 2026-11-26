// 대화 화면의 동작: 보내기 · 생성 · 명령 · 분기 · 번역 · 삽화 · 장면 · 먼저 오는 연락 (옛 js/chat.js 의 흐름 그대로)
import { confirmBox, openModal, promptBox, toast } from '../ui';
import * as engine from '../lib/engine';
import { moN } from './order';
import type { AutoPlan, ChatApi } from './types';
import { bump, cur, flush, ui, runs, runFor, runDone } from './store';
import { flushSync } from 'react-dom';
import { ux } from '../features/usersettings';
import type { Cast, CmdItem, GenOpt, GenType, Motive, Msg, Room, SceneSpec, Swipe } from './types';
import { DB, S, emit, on, fmtTime, msgText, newChat, newMsg, uid } from '../lib/core';
import { isAvTok } from '../lib/avkey';
import { go, route } from '../lib/router';
import { applyRegex, macro, makeCtx, roll, tpl } from '../lib/engine';
import { Live, cdHours, inQuietHours, mo, newLater, quietLeft } from '../lib/live';
import { MOTIVE_ORDER, STATUS, cooldownLeft, pickMotive, planAuto, replyDelay, scheduleOf, wakeIn } from '../lib/f-schedule';
import { X, runFilters } from '../lib/hooks';
import { Assets } from '../lib/assets';
import { Memory, Auditor } from '../lib/memory';
import { Illust, translateText } from '../lib/illust';
import { Clock } from '../lib/clock';
import { render, renderKept } from '../lib/format';
import { t, getLang, fmtDate, has as hasKey } from '../i18n';
import { COMMANDS as ST_COMMANDS } from '../stscript/run';
import '../stscript/commands';
import { TTS } from '../tts/api';
import { readMessage } from '../tts/Dock';
import { pickReply, streamReply } from '../reach/route';

// ── 방 · 이름 ──
export const charsOf = (chat: Room): Cast[] => chat.charIds.map(id => S.get('chars', id)).filter((c): c is Cast => !!c);
export const titleOf = (chat: Room) => charsOf(chat).map(c => c.name).join(', ') || t('chat.deletedChar');
export const modeOf = (chat?: Room | null): 'rp' | 'talk' => chat?.mode === 'talk' ? 'talk' : 'rp';
export const groupKey = (c: Room) => [...c.charIds].sort().join('+') || '-';
let roomIdx: Map<string, number> | null = null, roomIdxKey = '';
const roomNo = (c: Room) => {
  const key = S.chats.length + ':' + (S.chats[S.chats.length - 1]?.id || '');
  if (!roomIdx || roomIdxKey !== key || !roomIdx.has(c.id)) { roomIdx = new Map(); roomIdxKey = key; const seen = new Map<string, number>(); for (const x of [...S.chats].sort((a, b) => a.createdAt - b.createdAt)) { const k = groupKey(x), n = (seen.get(k) || 0) + 1; seen.set(k, n); roomIdx.set(x.id, n); } }
  return roomIdx.get(c.id) || 1;
};
export const roomName = (c: Room) => { const ttl = titleOf(c), n = String(c.name || '').trim(); const cut = n.toLowerCase().startsWith(ttl.toLowerCase()) ? n.slice(ttl.length).replace(/^[\s\-–—·:@]+/, '') : n; return cut || t('chat.roomN', { n: roomNo(c) }); };
export const daysOf = (c: Room) => Math.max(1, Math.round(((c.updatedAt || c.createdAt) - c.createdAt) / 86400000) + 1);
export const ago = (ts: number) => { const d = (Date.now() - ts) / 60000; return d < 1 ? t('chat.ago.now') : d < 60 ? t('chat.ago.min', { n: Math.floor(d) }) : d < 1440 ? t('chat.ago.hour', { n: Math.floor(d / 60) }) : d < 43200 ? t('chat.ago.day', { n: Math.floor(d / 1440) }) : getLang() === 'ko' ? new Date(ts).toLocaleDateString('ko-KR', { year: '2-digit', month: 'numeric', day: 'numeric' }) : fmtDate(ts, { year: '2-digit', month: 'numeric', day: 'numeric' }); };
const now = () => Date.now();
/** 이 방을 저장한다. 고친 메시지를 넘기면 오래된 메시지라도 바로 쓰인다 (긴 대화는 바뀐 조각만 쓴다 — lib/msgstore) */
const save = (...touched: Msg[]) => { S.touchMsgs(...touched); return S.saveMsgs(cur.chat!, cur.msgs); };
const onChat = () => route.page === 'chat';
const errMsg = (e: unknown) => e instanceof Error ? e.message : String(e);

// ── 다시 그리기 (조각별) ──
export const drawSide = () => bump('side');
export const drawTop = () => bump('top');
export const drawHud = () => bump('hud');
export const drawDossier = () => bump('dossier');
export const drawDrawer = () => bump('drawer');
export const drawGauge = () => bump('gauge');
export function setStatus(t: string) { cur.status = t; bump('status'); }
// 429 자동 재시도 중이면 상태 줄에 알린다 (연결 설정에서 켠 경우만)
on('conn:hop', d => { const x = d as { conn: string; n: number; of: number }; if (cur.busy) setStatus(t('chat.status.hop429', x)); });
on('conn:retry', d => { const x = d as { conn: string; n: number; of: number; sec: number }; if (cur.busy) setStatus(t('chat.status.retry429', x)); });
/** 이 방의 답변 받는 중 · 답변 전 준비 중 표시 (방마다 따로 — 그 방을 볼 때 입력창의 멈추기 단추 · 목록의 표시에 보인다) */
function setBusy(chat: Room, msgs: Msg[], b: boolean, abort: AbortController | null = null) { const r = runFor(chat, msgs); r.busy = b; r.abort = b ? abort : null; bump('busy', 'side'); }
function setPrep(chat: Room, msgs: Msg[], b: boolean, stop: AbortController | null = null) { const r = runFor(chat, msgs); r.prep = b; r.prepAbort = b ? stop : null; if (!b) runDone(chat); bump('busy', 'side'); }
/** 그 글이 지금 걸려 있을 때만 지운다 (다른 방으로 간 사이 남은 '기억 떠올리는 중' 같은 글이 엉뚱한 방에 남지 않게) */
const clearStatusIf = (text: string) => { if (cur.status === text) setStatus(''); };
/** 답변 · 답변 전 준비 · 스크립트(QR) 가운데 하나라도 돌고 있나. 그동안 입력창의 보내기 단추는 멈추기가 되고 보낼 수 없다 */
export const running = () => cur.busy || cur.prep || cur.qr > 0;
let qrEpoch = 0, scriptStop: (() => void) | null = null;
/** 스크립트를 멈추는 길 (stscript/host 가 맡긴다) */
export function onStopScripts(fn: () => void) { scriptStop = fn; }
/** 스크립트 하나가 도는 동안 세어 둔다. 멈추기를 누르면 셈을 비워 입력창을 바로 풀어 준다 (스크립트는 다음 명령에서 멈춘다) */
export async function trackScript<T>(run: () => Promise<T>): Promise<T> {
  const ep = qrEpoch; cur.qr++; bump('busy');
  try { return await run(); } finally { if (ep === qrEpoch && cur.qr > 0) { cur.qr--; bump('busy'); } }
}
/** 멈추기 단추 · Esc: 답변, 답변 전 준비, 스크립트를 모두 멈춘다 */
export function stopAll() {
  cur.abort?.abort(); cur.prepAbort?.abort(); stopGroupAuto();
  if (cur.qr > 0) { qrEpoch++; cur.qr = 0; }
  scriptStop?.(); bump('busy');
}
export const nearBottom = () => { const sc = ui.scroll; return !!sc && sc.scrollHeight - sc.scrollTop - sc.clientHeight < 160; };
export const toBottom = () => { const sc = ui.scroll; if (sc) sc.scrollTop = sc.scrollHeight; };
export function setSide(open: boolean) { cur.sideOpen = open; bump('layout', 'side'); }
export function setDrawer(open: boolean) { cur.drawer = open; bump('layout', 'drawer'); }

const whenIdle = (fn: () => void) => { if ('requestIdleCallback' in window) requestIdleCallback(fn, { timeout: 160 }); else setTimeout(fn, 24); };
let drawJob = 0;
/** 메시지 목록을 새로 그린다. lazy(방에 막 들어왔을 때)면 보이는 끝부분만 먼저 그리고, 그 위쪽은 틈나는 대로 이어 붙인다 */
export function drawMsgs({ lazy = false } = {}) {
  const list = cur.msgs, total = list.length, from = Math.max(0, total - cur.shown), FIRST = 12;
  cur.epoch++; cur.fresh.clear(); cur.from = from;
  cur.head = lazy && total - from > FIRST + 8 ? total - FIRST : from;
  flush('msgs');
  growUp();
}
/** 그려 둔 첫 메시지(head)를 cur.from 까지 조금씩 위로 넓힌다. 이미 그린 메시지는 다시 만들지 않고, 보던 자리를 지킨다 */
// 보는 자리에서 위로 화면 몇 장 넘게 그려 두었으면 멈췄다가, 위로 스크롤해 다가오면 이어 그린다 (보지 않을 수백 개를 미리 그리느라 다른 동작이 느려지지 않게)
let growPaused = 0;
function growUp(first = false) {
  const job = ++drawJob, list = cur.msgs, base = Math.max(0, list.length - truncation()); growPaused = 0;
  if (cur.head <= cur.from) return;
  let per = 6;   // 한 번에 이어 붙이는 개수 — 걸린 시간을 보고 늘리거나 줄인다
  const step = () => {
    const sc = ui.scroll; if (job !== drawJob || list !== cur.msgs || !sc?.isConnected) return;   // 그사이 다시 그렸거나 방을 나갔다
    if (cur.head <= base && sc.scrollTop > sc.clientHeight * 4) { growPaused = job; return; }   // 처음 그리는 몫(최근 100개)은 쉬지 않고 채운다
    const t = performance.now(), gap = sc.scrollHeight - sc.scrollTop;
    cur.head = Math.max(cur.from, cur.head - per); flush('msgs');
    selfScroll(sc, sc.scrollHeight - gap);   // 위에 붙인 만큼 밀리지 않게 보던 자리를 지킨다
    per = Math.max(2, Math.min(24, Math.round(per * 12 / Math.max(1, performance.now() - t))));   // 한 묶음이 12ms 안팎이 되게
    if (cur.head > cur.from) whenIdle(step);
  };
  if (first) step(); else requestAnimationFrame(() => whenIdle(step));
}
/** 처음 그릴 메시지 수 = "더 보기" 한 번에 더 그리는 수 (실리태번 chat_truncation, 기본 100, 0 이면 전부) */
export function truncation() { const n = (S.settings as unknown as { chatTruncation?: number | null }).chatTruncation; return n == null || n < 0 ? 100 : n > 0 ? Math.round(n) : Infinity; }
/** 이전 메시지 더 보기: 이미 그린 메시지는 그대로 두고 위에 이어 붙인다 (보던 자리를 지킨다) */
export function showMore() {
  cur.shown += truncation(); cur.from = Math.max(0, cur.msgs.length - cur.shown);
  flush('msgs'); growUp(true);
}
// ── 스크롤 ──
// 맨 아래를 보고 있는지는 스크롤할 때 적어 둔다 (답변이 흘러나오는 동안 매 화면 높이를 다시 재지 않게)
let atBottom = true, trimT = 0, selfAt = 0, softJob = 0;
/** 앱이 스스로 스크롤한다 (사람이 스크롤한 것과 가린다) */
const selfScroll = (sc: HTMLElement, top: number) => { selfAt = performance.now(); sc.scrollTop = top; };
/** 대화 칸을 스크롤할 때 (pages/Chat 이 건다) */
export function onChatScroll() {
  atBottom = nearBottom();
  if (performance.now() - selfAt < 80) return;   // 앱이 위에 메시지를 붙이며 자리를 맞춘 것: 사람이 움직인 것이 아니다
  const sc = ui.scroll;
  if (growPaused && growPaused === drawJob && sc && cur.head > cur.from && sc.scrollTop < sc.clientHeight * 3) { growPaused = 0; requestAnimationFrame(() => growUp(true)); }
  // 위로 한참 펼쳐 봤다가 맨 아래로 돌아왔다: 화면 밖 위쪽 메시지는 내려놓는다 (수천 개를 들고 있으면 모든 동작이 느려진다)
  clearTimeout(trimT);
  if (atBottom && cur.msgs.length - cur.head > truncation() * 2 + 20) trimT = window.setTimeout(() => whenIdle(trimTop), 1200);
}
function trimTop() {
  const sc = ui.scroll; if (!sc?.isConnected || !nearBottom() || cur.busy || document.querySelector('.msgs .edit-box')) return;
  drawJob++; cur.shown = truncation(); cur.from = Math.max(0, cur.msgs.length - cur.shown);
  if (cur.head >= cur.from) return;
  const gap = sc.scrollHeight - sc.scrollTop; cur.head = cur.from; flush('msgs'); selfScroll(sc, sc.scrollHeight - gap);
}
// 맨 아래에 붙어 있기: 목록 높이가 바뀐 뒤(배치가 끝난 다음) 스크롤한다 — 그리는 도중에 높이를 재서 화면을 멈추지 않게
const follow = { on: false, ro: null as ResizeObserver | null, box: null as Element | null };
function followBottom(on: boolean) {
  follow.on = on; const box = ui.msgs; if (!on || !box || !window.ResizeObserver) return;
  if (follow.box !== box) { follow.ro?.disconnect(); follow.ro = new ResizeObserver(() => { const sc = ui.scroll; if (follow.on && sc?.isConnected) { selfScroll(sc, sc.scrollHeight); atBottom = true; } }); follow.ro.observe(box); follow.box = box; }
}
/** 보던 자리를 적어 둔다. 돌려받은 함수를 다시 그린 뒤 부르면 그 자리로 되돌린다.
 *  기준은 고친 메시지(id), 없으면 화면 맨 위에 걸친 메시지. 맨 아래를 보고 있었으면 맨 아래에 남는다 */
export function holdView(id?: string): () => void {
  const sc = ui.scroll, box = ui.msgs; if (!sc || !box) return () => { };
  if ((nearBottom() && !id) || pinned) return () => { if (sc.isConnected) sc.scrollTop = sc.scrollHeight; };   // 맨 아래에 붙어 있는 동안에는 고친 메시지의 자리를 지키지 않는다
  const top = sc.getBoundingClientRect().top, all = () => [...box.querySelectorAll<HTMLElement>('article.msg[data-id]')];
  let el = id ? all().find(a => a.dataset.id === id) : undefined;
  if (!el) el = all().find(a => a.getBoundingClientRect().bottom > top);
  if (!el) return () => { };
  const key = el.dataset.id, off = el.getBoundingClientRect().top - top;
  const fix = () => { const n = all().find(a => a.dataset.id === key); if (n && sc.isConnected) sc.scrollTop += n.getBoundingClientRect().top - top - off; };
  return () => { fix(); requestAnimationFrame(fix); setTimeout(fix, 80); };
}
/** 메시지 하나를 새로 만든다 (그 메시지가 화면에서 제자리에 남는다) */
export function redraw(m: Msg, quiet = false) {
  const back = holdView(m.id);
  cur.paint.delete(m.id); cur.revs.set(m.id, (cur.revs.get(m.id) || 0) + 1); if (!quiet) cur.fresh.add(m.id);
  flush('msgs'); back();
}
function appendMsg(m: Msg) { cur.fresh.add(m.id); flush('msgs'); }

/** 방을 연 직후 잠깐은 그림이 늦게 떠서 밀려도 맨 아래에 머문다. 손을 대거나 다른 메시지로 건너뛰면 바로 푼다 */
let unpin = () => { }, pinned = false;
export function pinBottom(ms = 1400) {
  unpin(); const sc = ui.scroll, box = ui.msgs; if (!sc || !box || !window.ResizeObserver) return;
  const ro = new ResizeObserver(() => { if (sc.isConnected) sc.scrollTop = sc.scrollHeight; }), evs = ['wheel', 'touchstart', 'pointerdown', 'keydown'];
  const down = () => { if (pinned && unpin === off && sc.isConnected) sc.scrollTop = sc.scrollHeight; };
  const off = () => { pinned = false; ro.disconnect(); clearTimeout(timer); evs.forEach(ev => sc.removeEventListener(ev, off)); if (unpin === off) unpin = () => { }; };
  const timer = setTimeout(off, ms); evs.forEach(ev => sc.addEventListener(ev, off, { passive: true })); ro.observe(box); unpin = off; pinned = true;
  // 바로 앞에서 '고친 메시지의 자리 지키기'가 예약해 둔 되돌림(다음 프레임 · 80ms 뒤)보다 나중에 한 번 더 내려간다
  requestAnimationFrame(down); setTimeout(down, 120); setTimeout(down, 300);
}
/** 대화 화면을 새로 그리고 맨 아래로 간다. 보이는 끝부분부터 그리고 위쪽은 틈나는 대로 잇는다 (모드를 바꾸거나 배경 · 등장인물을 고칠 때 수십 개를 한 번에 그리느라 화면이 멈추지 않게) */
export function drawMain({ lazy = true } = {}) {
  // 등장인물이 바뀌었으면(초대 등) 새로 온 사람의 초상도 통째로 올려 둔다
  const c0 = cur.chat; if (c0 && c0.charIds.some(id => isAvTok(S.get('chars', id)?.avatar))) void S.holdAvatars(c0.charIds).then(() => { if (cur.chat === c0) bump('top', 'dossier'); }).catch(() => { });
  bump('main', 'top', 'hud', 'composer', 'dossier');
  drawMsgs({ lazy });
  const sc = ui.scroll; requestAnimationFrame(() => { if (sc) sc.scrollTop = sc.scrollHeight; });
  pinBottom();
}

// ── 본문 ──
export const assetOwners = () => cur.chat ? [...cur.chat.charIds.map(Assets.ownerOfChar), Assets.ownerOfPersona(S.persona(cur.chat).id)] : [];
export const TYPING = '<span class="typing"><i></i><i></i><i></i></span>';
/** 화면에 보이는 글 (템플릿 · 정규식 · 표시 필터를 거친 것). 꾸미기 전의 글자 그대로 */
export function shownText(m: Msg) {
  const s = m.swipes[m.sw] || { text: '' };
  let depth: number | undefined; if (!m.hidden) { depth = 0; for (let i = cur.msgs.length - 1; i >= 0 && cur.msgs[i] !== m; i--) if (!cur.msgs[i].hidden) depth++; }
  // 화면에서도 <% … %> 템플릿은 처리한 결과만 보인다 (코드가 글자로 드러나지 않게)
  const raw = tpl(s.showTr && s.tr ? s.tr : s.text, { vars: (cur.chat?.vars || {}) as Record<string, unknown> });
  const text = runFilters(applyRegex(raw, { who: m.role === 'user' ? 'user' : 'ai', target: 'display', depth, charId: m.charId, chat: cur.chat }), { role: m.role, msg: m, chat: cur.chat });
  return Illust.strip(text);
}
/** 메시지 본문 HTML. keep: 다 쓴 글이면 꾸민 결과를 기억해 두었다 다시 쓴다 (받는 중인 글은 매번 달라지니 켜지 않는다) */
export function bodyHtml(m: Msg, keep = false) {
  const style = m.role === 'system' ? 'plain' : modeOf(cur.chat) === 'talk' && !m.scene ? 'chat' : S.settings.rpBubbles ? 'bubbles' : 'novel';
  const owners = assetOwners();
  return (keep ? renderKept : render)(Assets.inline(Assets.expand(shownText(m), owners, `${m.id}:${m.sw}`), owners), { style, prose: m.role !== 'user' });
}
/** 메시지 옆에 적는 시각: 이야기 시계를 쓰는 방은 이야기 시각, 시각을 쓰지 않는 방은 비움 */
export const msgClock = (m: Msg, s: Swipe) => { const k = Clock.mode(cur.chat); return k === 'none' ? '' : k === 'story' ? fmtTime(Clock.timeOf(cur.chat, m)) : fmtTime(s.ts || m.ts); };

/** 먼저 그려 둔 화면에, 뒤늦게 읽힌 에셋 · 삽화 · 기억을 채운다 */
export function fillLate(had: { assets: boolean; illust: boolean }, owners: string[]) {
  const fillAssets = !had.assets && Assets.count(owners) > 0;
  for (let i = cur.head; i < cur.msgs.length; i++) {
    const m = cur.msgs[i], s = m.swipes[m.sw]; if (!s || (m.role === 'system' && (m.dice || m.curtain))) continue;
    if (!((!had.illust && s.illust?.length) || (fillAssets && bodyHtml(m, true).includes('asset-frame')))) continue;
    cur.revs.set(m.id, (cur.revs.get(m.id) || 0) + 1);
  }
  flush('msgs'); drawHud(); drawDossier(); if (cur.drawer) drawDrawer();
}

// ── 메시지 동작 ──
/** 고친 글을 저장한다 (편집 상자의 저장) */
export async function commitEdit(m: Msg, value: string) {
  const s = m.swipes[m.sw], changed = s.text !== value;
  s.text = m.role === 'system' ? value : applyRegex(value, { who: m.role === 'user' ? 'user' : 'ai', target: 'store', edit: true, charId: m.charId, chat: cur.chat });
  delete s.tr; s.showTr = false; await save(m);
  redraw(m); if (changed) emit('message:edited', { chat: cur.chat, msg: m, msgs: cur.msgs });
}
/** 메시지가 지워지거나 스와이프가 바뀌면 상태창을 그 시점으로 되감는다 */
function rewindState() { if (cur.chat && Live.rewind(cur.chat, cur.msgs)) { drawHud(); drawDossier(); if (cur.drawer) drawDrawer(); } }
/** 장면 상태를 남아 있는 메시지에 맞춘다 (막을 올린 표시가 지워졌으면 장면도 닫힌 것). 바뀌었으면 true */
function syncScene(chat: Room, list: Msg[]) {
  const k = [...list].reverse().find(m => m.curtain)?.curtain, on = k?.kind === 'open'; if (!!chat.scene?.on === on) return false;
  chat.scene = on ? { on: true, title: k?.title || '만남', place: k?.place || '', at: list.length } : { ...(chat.scene || {}), on: false }; return true;
}
// 지운 뒤: 화면부터 바로 고치고(남은 메시지는 그대로 두고 지운 것만 빠진다) 저장은 그 뒤에. 전체를 새로 만들지 않아 끊김이 없다
async function afterDelete() {
  const sc = syncScene(cur.chat!, cur.msgs); rewindState();
  if (sc) drawMain();
  else { const back = holdView(); cur.from = Math.max(0, cur.msgs.length - cur.shown); cur.head = Math.max(cur.from, Math.min(cur.head, cur.msgs.length)); flush('msgs'); back(); }
  drawSide(); await save(); emit('message:deleted', { chat: cur.chat, msgs: cur.msgs });
}
export async function delMsg(m: Msg) {
  if (cur.msgs.indexOf(m) < 0 || (ux().confirmDelete && !(await confirmBox(t('chat.msg.confirmDelete'), t('common.delete'), true)))) return;
  const i = cur.msgs.indexOf(m); if (i < 0) return; emit('message:trashed', { chat: cur.chat, gone: cur.msgs.splice(i, 1), at: i, after: cur.msgs[i - 1]?.id || '' }); await afterDelete();   // 지운 것은 보관함(src/extras/trash)이 받아 둔다
}
export async function delFrom(m: Msg) {
  if (!(await confirmBox(t('chat.msg.confirmDeleteFrom'), t('common.delete'), true))) return;
  const i = cur.msgs.indexOf(m); if (i < 0) return; emit('message:trashed', { chat: cur.chat, gone: cur.msgs.splice(i), at: i, after: cur.msgs[i - 1]?.id || '' }); await afterDelete();
}
export async function toggleHidden(m: Msg) { m.hidden = !m.hidden; await save(m); redraw(m); }
/** 고정: 오래돼도 프롬프트에 남긴다. 숨겨져 있었으면 다시 보이게 한다 */
export async function togglePin(m: Msg) { m.pin = !m.pin; if (m.pin && m.hidden && m.memHidden) { m.hidden = false; delete m.memHidden; } await save(m); redraw(m); }
/** 나만 보는 메모 (모델에 보내지 않는다) */
export async function setMemo(m: Msg, text: string) { const v = text.trim(); if (v) m.memo = v; else delete m.memo; await save(m); redraw(m); }
export async function swipe(m: Msg, dir: number) {
  if (cur.busy) return;
  const n = m.sw + dir;
  if (n < 0) return;
  if (n >= m.swipes.length) { if (cur.msgs[cur.msgs.length - 1] === m) void generate('regen'); return; }
  m.sw = n; rewindState(); await save(m); redraw(m); emit('message:swiped', { chat: cur.chat, msg: m, msgs: cur.msgs });
}
const copy = <T,>(o: T): T => { try { return structuredClone(o); } catch { return JSON.parse(JSON.stringify(o)) as T; } };
/** 메시지 목록의 사본. 긴 대화는 조금씩 나눠 베껴 그동안 화면이 멈추지 않게 한다 */
async function copyList(list: Msg[]): Promise<Msg[]> {
  const out: Msg[] = [], n = list.length;
  for (let i = 0; i < n; i += 200) { for (const m of copy(list.slice(i, i + 200))) out.push(m); if (i + 200 < n) await new Promise(r => setTimeout(r, 0)); }
  return out;
}
/** 대화방 이름 바꾸기 (곁 목록 · 위쪽 제목 · 메뉴가 함께 쓴다). 비우면 기본 이름으로 돌아간다 */
export async function renameRoom(c: Room) {
  const v = await promptBox(t('chat.menu.renamePrompt'), c.name || '', { placeholder: t('chat.rename.ph') });
  if (v === null) return;
  c.name = v.trim().slice(0, 80); await S.save('chats', c, true); drawSide(); if (c.id === cur.chat?.id) drawTop();
}
export async function branch(idx: number) {
  const c = cur.chat!;
  try {
    const n = S.chats.filter(x => x.parent?.id === c.id).length + 1;
    // 갈라 낼 방의 이름을 먼저 묻는다 (기본 이름이 적혀 있고, 취소하면 갈라 내지 않는다)
    const asked = await promptBox(t('chat.branch.ask'), t('chat.branch.name', { room: roomName(c), n })); if (asked === null) return;
    const branchName = asked.trim().slice(0, 80) || t('chat.branch.name', { room: roomName(c), n });
    const chat = newChat({ ...copy(c), id: uid(), name: branchName, createdAt: now(), src: '', pinned: false, parent: { id: c.id, at: idx + 1 }, diary: copy((c.diary || []).filter(d => (d.to || 0) <= idx + 1)), diaryAt: Math.min(c.diaryAt || 0, idx + 1) });
    const list = await copyList(cur.msgs.slice(0, idx + 1));
    Live.rewind(chat, list); syncScene(chat, list); delete chat.owed; chat.later = [];
    // 삽화는 대화방마다 따로 보관하므로 새 방 몫으로 복사한다
    const pics = new Map((await DB.byOwner('chat:' + c.id)).filter(a => a.kind === 'illust').map(a => [a.id, a]));
    const moved = new Map<string, string>(), dup = async (id: string) => { const pic = pics.get(id); if (!pic) return id; if (!moved.has(id)) { const nid = uid(); await DB.put('assets', { ...pic, id: nid, owner: 'chat:' + chat.id }); moved.set(id, nid); } return moved.get(id)!; };
    for (const m of list) for (const sw of m.swipes || []) for (const it of sw.illust || []) { for (const v of it.versions || []) if (v.id) v.id = await dup(v.id); if (it.id) it.id = await dup(it.id); }
    // 장기기억도 이어받는다 (분기점 뒤의 기록은 다음 생성 때 걸러진다)
    const mem = await DB.get('mem', c.id).catch(() => null); if (mem) await DB.put('mem', { ...copy(mem), id: chat.id });
    await S.saveMsgs(chat, list);
    toast(t('chat.branch.done', { name: chat.name }), 'ok'); go('chat', chat.id);
  } catch (e) { console.error(e); toast(t('chat.branch.fail', { err: errMsg(e) }), 'err'); }
}
// 후처리(번역 · 삽화) 결과를 그 메시지가 속한 방에 저장한다. 기다리는 사이 방을 옮겼거나 다시 열었어도 같은 메시지를 찾아 옮겨 적는다
async function saveIn(chat: Room, list: Msg[], m: Msg, carry: (live: Msg) => void) {
  if (cur.chat?.id === chat.id) { let live = m; if (!cur.msgs.includes(m)) { const hit = cur.msgs.find(x => x.id === m.id); if (!hit) return; live = hit; carry(live); } await save(live); redraw(live); }
  else if (S.get('chats', chat.id) && list.includes(m)) await S.saveMsgs(chat, list);
}
const translator = () => X.translate || translateText;
export async function translate(m: Msg, { again = false, chat = cur.chat!, msgs: list = cur.msgs } = {}) {
  const s = m.swipes[m.sw];
  if (s.tr && !again) { s.showTr = !s.showTr; await save(m); return redraw(m); }
  const note = t('chat.status.translating'); if (cur.chat === chat) setStatus(note);
  try {
    const idx = list.indexOf(m), user = S.persona(chat).name, n = S.settings.translate.context || 0;
    const context = n ? list.slice(Math.max(0, idx - n), idx).filter(x => !x.hidden).map(x => ({ name: x.role === 'user' ? user : (x.name || 'Narrator'), text: msgText(x) })) : [];
    const src = s.text;
    s.tr = await translator()(Illust.strip(s.text), S.settings.translate.lang, { chat, context }); s.showTr = true;
    await saveIn(chat, list, m, live => { const t = live.swipes?.[m.swipes.indexOf(s)]; if (t && t.text === src) { t.tr = s.tr; t.showTr = true; } });
  } catch (e) { toast(t('chat.translate.fail', { err: errMsg(e) }), 'err'); } finally { clearStatusIf(note); }
}
export async function editTranslation(m: Msg) {
  const s = m.swipes[m.sw]; const v = await promptBox(t('chat.translate.edit'), s.tr || '', { area: true });
  if (v === null) return; if (v.trim()) { s.tr = v; s.showTr = true; } else { delete s.tr; s.showTr = false; }
  await save(m); redraw(m);
}
export async function translateInput() {
  const inp = ui.input, text = inp?.value.trim(); if (!inp || !text) return toast(t('chat.translate.empty'));
  setStatus(t('chat.status.translating'));
  try { inp.value = await translator()(text, S.settings.translate.inputLang || 'English', { chat: cur.chat }); inp.dispatchEvent(new Event('input')); } catch (e) { toast(t('chat.translate.fail', { err: errMsg(e) }), 'err'); } finally { setStatus(''); }
}
// ── 삽화 ──
export function drawScene(m: Msg, scene: SceneSpec, at?: { chat: Room; msgs: Msg[] }) {
  setStatus(t('chat.status.drawing'));
  const g = [...runs.values()].find(r => r.msgs.includes(m)), chat = at?.chat || g?.chat || cur.chat!, list = at?.msgs || g?.msgs || cur.msgs;
  Illust.enqueue(chat, m, scene as unknown as Record<string, unknown>, async err => {
    setStatus(''); if (err) return toast(t('chat.illust.fail', { err: err.message }), 'err');
    await saveIn(chat, list, m, live => m.swipes.forEach((sw, i) => { const t = live.swipes?.[i]; if (t && t.text === sw.text) { if (sw.illust) t.illust = sw.illust; if (sw.illustPlan) t.illustPlan = sw.illustPlan; if (sw.illustDraft) t.illustDraft = sw.illustDraft; } }));
  });
}
export async function removeIllust(m: Msg, s: Swipe, id: string) {
  if (!(await confirmBox(t('chat.illust.confirmRemove'), t('chat.illust.remove'), true))) return;
  const i = (s.illust || []).findIndex(x => x.id === id); if (i >= 0) s.illust!.splice(i, 1);
  await Illust.remove(id); await save(m); redraw(m);
}
export function speak(text: string, charId?: string, key = '') {   // 읽어 주기(src/tts) — 읽던 것은 멈추고 새로 읽는다. key 가 있으면 읽는 동안 그 글을 띄워 따라간다
  if (key) { void readMessage(text, { key, charId }).catch(e => toast(errMsg(e), 'err')); return; }
  TTS.stopAll();
  void TTS.speak(text, { charId }).catch(e => toast(errMsg(e), 'err'));
}

// ════════ 보내기 · 명령 ════════
export async function send() {
  const inp = ui.input; if (cur.busy || !inp || !cur.chat) return;
  const raw = inp.value.trim();
  if (raw.startsWith('/')) {   // 명령은 STscript 로 돈다 (| 로 잇기 · 변수 · /if 따위). 틀리면 입력창에 되돌려 고칠 수 있게
    inp.value = ''; inp.style.height = 'auto';
    const { runQrScript } = await import('../stscript/host');
    await runQrScript(raw, { onError: () => { if (ui.input && !ui.input.value) { ui.input.value = raw; ui.input.dispatchEvent(new Event('input')); } } });
    return;
  }
  // 보낼 방을 먼저 붙잡는다 — 입력 번역을 기다리는 사이 다른 방으로 가도 메시지와 답변은 이 방에 들어간다
  const chat = cur.chat, msgs = cur.msgs;
  if (raw || cur.attach.length) {
    const chars = charsOf(chat), persona = S.persona(chat);
    const ctx = makeCtx({ chat, char: chars[0], chars, persona, msgs, input: raw });
    let text = applyRegex(macro(raw, ctx), { who: 'user', target: 'store', ctx }), mine = '';
    if (S.settings.translate.autoInput && text.trim()) { setStatus(t('chat.status.translating')); try { mine = text; text = await translator()(text, S.settings.translate.inputLang || 'English', { chat }); } catch (e) { mine = ''; toast(t('chat.translate.inputFail', { err: errMsg(e) }), 'err'); } finally { setStatus(''); } }
    const m = newMsg('user', text, { name: persona.name, ...(modeOf(chat) === 'talk' && chat.scene?.on ? { scene: true } : {}) });
    chat.seenAt = now();
    if (mine) { m.swipes[0].tr = mine; m.swipes[0].showTr = true; }   // 화면에는 내가 쓴 말을, 모델에는 번역문을
    if (cur.attach.length) { m.images = cur.attach; cur.attach = []; bump('attach'); }
    msgs.push(m); if (cur.chat === chat) appendMsg(m); emit('message:sent', { msg: m, chat });
    if (chat.auto) chat.auto.streak = 0;
    cur.chimeRun = 0; clearTimeout(chimeTimer); Live.touch();
    inp.value = ''; inp.style.height = 'auto'; if (cur.chat === chat) toBottom();
    S.touchMsgs(m); await S.saveMsgs(chat, msgs);
  }
  groupAutoRun = 0; clearTimeout(groupAutoTimer);
  // 수동 순서인 그룹 방: 내가 보낸 뒤 아무도 저절로 답하지 않는다 — 입력창의 "다음에 말할 사람"으로 고른다
  if (chat.groupOrder === 'manual' && charsOf(chat).length > 1 && (raw || msgs[msgs.length - 1]?.role === 'user')) return;
  void generate('normal', { room: { chat, msgs } });
}
// ── 그룹 자동 진행: 답이 끝나면 잠시 뒤 다음 사람이 이어서 말한다 (입력 중이거나 연속 횟수를 채우면 멈춘다) ──
let groupAutoTimer = 0, groupAutoRun = 0;
function armGroupAuto(chat: Room) {
  clearTimeout(groupAutoTimer);
  const g = chat.groupAuto; if (!g?.on || charsOf(chat).length < 2 || modeOf(chat) === 'talk' || chat.groupOrder === 'manual') return;
  const max = Math.max(1, +(g.max ?? 5) || 5); if (groupAutoRun >= max) { groupAutoRun = 0; return void toast(t('chat.group.autoPaused', { count: max })); }
  groupAutoTimer = window.setTimeout(() => {
    if (cur.chat !== chat || cur.busy || cur.prep || cur.qr > 0 || ui.input?.value.trim() || !onChat() || !chat.groupAuto?.on) return;
    groupAutoRun++; void generate('normal');
  }, Math.max(1, +(g.delay ?? 5) || 5) * 1000);
}
/** 자동 진행을 멈춘다 (멈추기 단추 · 설정을 껐을 때) */
export function stopGroupAuto() { clearTimeout(groupAutoTimer); groupAutoRun = 0; }

// [명령, 인자 키, 설명 키] — 인자 이름 · 설명은 그릴 때 t() 로
const HELP_KEYS: [string, string, string][] = [['/roll', '', 'roll'], ['/sys', 'text', 'sys'], ['/continue', '', 'continue'], ['/regen', '', 'regen'], ['/imp', '', 'imp'],
  ['/note', 'text', 'note'], ['/setvar', 'nameValue', 'setvar'], ['/getvar', 'name', 'getvar'], ['/bg', 'url', 'bg']];
const HELP = (): [string, string][] => HELP_KEYS.map(([c, a, d]) => [c === '/roll' ? '/roll 2d6+1' : a ? c + ' ' + t('chat.cmd.arg.' + a) : c, t('chat.cmd.help.' + d)]);
const ALIAS: Record<string, string[]> = { '/roll': ['/r', '/dice'], '/sys': ['/narrate'], '/continue': ['/cont'], '/imp': ['/impersonate'], '/help': ['/?'] };
/** 입력창의 명령어 목록: 기본 명령어 + 기능 · 확장이 등록한 명령어 */
export function commandList(): CmdItem[] {
  const base: CmdItem[] = [...HELP(), ['/help', t('chat.cmd.help.help')] as [string, string]].map(([c, d]) => { const [cmd, ...a] = c.split(' '); return { cmd, args: a.join(' '), help: d, alias: ALIAS[cmd] }; });
  const seen = new Set(base.flatMap(b => [b.cmd, ...(b.alias || [])]));
  const ext = [...X.commands].filter(([k]) => !seen.has(k)).map(([k, v]) => ({ cmd: k, args: v.args || '', help: v.help || t('chat.cmd.extension') }));
  for (const x of ext) seen.add(x.cmd);
  // STscript 명령 (실리태번과 같은 이름). 같은 정의를 가리키는 별칭은 한 줄로
  const byDef = new Map<object, string[]>();
  for (const [k, d] of ST_COMMANDS) if (!seen.has('/' + k)) { const l = byDef.get(d) || []; l.push('/' + k); byDef.set(d, l); }
  // 설명 키는 그 정의의 이름 가운데 키가 있는 것으로 (목록에 남은 이름이 별칭뿐일 때도 — 예: /getvar 는 드림랜드 명령이라 /getchatvar 만 남는다)
  const allNames = new Map<object, string[]>(); for (const [k, d] of ST_COMMANDS) { const l = allNames.get(d) || []; l.push(k); allNames.set(d, l); }
  const keyOf = (d: object, kind: 'cmd' | 'args') => (allNames.get(d) || []).find(n => hasKey(`st.${kind}.${n}`));
  const st = [...byDef].map(([d, names]) => {
    const D = d as { help?: string; args?: string }, hk = keyOf(d, 'cmd'), ak = keyOf(d, 'args');
    return { cmd: names[0], alias: names.slice(1), args: ak ? t('st.args.' + ak) : D.args || '', help: (hk ? t('st.cmd.' + hk) : D.help || '') + ' · STscript' };
  });
  return [...base, ...[...ext, ...st].sort((x, y) => x.cmd.localeCompare(y.cmd))];
}
export async function command(line: string): Promise<unknown> {
  const chat = cur.chat; if (!chat) return;
  const [cmd, ...rest] = line.trim().split(/\s+/), arg = line.trim().slice(cmd.length).trim();
  const push = async (m: Msg) => { cur.msgs.push(m); appendMsg(m); toBottom(); await save(); };
  switch (cmd.toLowerCase()) {
    case '/roll': case '/r': case '/dice': {
      const r = roll(arg || '1d20'); if (!r) return toast(t('chat.cmd.badDice'), 'err');
      const who = S.persona(chat).name, sides = +r.expr.split('d')[1].replace(/[+-].*/, '');
      return push(newMsg('system', `${who}의 주사위 ${r.expr} → ${r.rolls.join(', ')}${r.mod ? ` (${r.mod > 0 ? '+' : ''}${r.mod})` : ''} = ${r.total}`, { dice: { expr: r.expr, rolls: r.rolls, mod: r.mod, total: r.total, sides }, diceBy: who }));
    }
    case '/sys': case '/narrate': return arg ? push(newMsg('system', applyRegex(arg, { who: 'slash', target: 'store', chat }))) : null;
    case '/continue': case '/cont': return generate('continue');
    case '/regen': return generate('regen');
    case '/imp': case '/impersonate': return generate('impersonate');
    case '/note': chat.note = { ...(chat.note || { depth: 4, role: 'system' }), text: arg }; await S.save('chats', chat, true); toast(arg ? t('chat.cmd.noteSet') : t('chat.cmd.noteCleared')); if (cur.drawer) drawDrawer(); return;
    case '/setvar': (chat.vars ||= {})[rest[0]] = rest.slice(1).join(' '); await S.save('chats', chat, true); toast(`${rest[0]} = ${rest.slice(1).join(' ')}`); if (cur.drawer) drawDrawer(); return;
    case '/getvar': return toast(`${rest[0]} = ${chat.vars?.[rest[0]] ?? t('chat.cmd.noValue')}`);
    case '/bg': chat.bg = arg; await S.save('chats', chat, true); return drawMain();
    case '/help': case '/?': return openModal({ title: t('chat.cmd.title'), body: <div className="help">{[...HELP(), ...[...X.commands].map(([k, v]): [string, string] => [k, v.help || t('chat.cmd.extension')])].map(([c, d], i) => <div className="help-row" key={i}><code>{c}</code><span>{d}</span></div>)}</div> });
    default: {
      const ext = X.commands.get(cmd.toLowerCase());
      if (!ext) { const inp = ui.input; if (inp && !inp.value) { inp.value = line; inp.dispatchEvent(new Event('input')); } return toast(t('chat.cmd.unknown', { cmd }), 'err'); }
      try { return await ext.run(arg, chatApi); } catch (e) { console.error(e); return toast(`${cmd}: ${errMsg(e)}`, 'err'); }
    }
  }
}

// ════════ 대화 모드: 상태 · 명령 · 먼저 말 걸기 ════════
/** 지금 이 캐릭터의 상태 (임시로 바꾼 상태 → 주간 일정 → 온라인) */
export const presenceOf = (chat: Room, ch: Cast | undefined = charsOf(chat)[0]) => Live.presence(chat, ch);
const awakeChars = (chat: Room) => { const cs = charsOf(chat), aw = cs.filter(c => !(chat.muted || []).includes(c.id)); return aw.length ? aw : cs; };
const nameCalled = (text: string, name: string) => { const t = String(text || '').toLowerCase(), n = String(name || '').trim().toLowerCase(), first = n.split(/\s+/)[0]; return !!n && (t.includes(n) || (first.length >= 2 && t.includes(first))); };
const weighted = <T,>(list: T[], w: (c: T) => number) => { const total = list.reduce((n, c) => n + w(c), 0); let r = Math.random() * total; for (const c of list) { r -= w(c); if (r <= 0) return c; } return list[0]; };
async function runTalkCommands(chat: Room, msgs: Msg[], target: Msg, cmds: { name: string; args: Record<string, string> }[]) {
    for (const c of cmds) {
    if (c.name === 'react' && c.args.emoji) { const u = [...msgs].reverse().find(m => m.role === 'user'); if (u) { (u.reactions ||= []).push({ emoji: c.args.emoji, by: target.name }); if (cur.chat === chat) redraw(u); } }
    else if (c.name === 'status') { const st = STATUS[c.args.state || c.args.status] ? (c.args.state || c.args.status) : 'online'; const dur = String(c.args.duration || '').match(/([\d.]+)\s*(m|h)/i); Live.setPresence(chat, S.get('chars', target.charId), { status: st, activity: c.args.activity || '', durMs: dur ? +dur[1] * (dur[2].toLowerCase() === 'h' ? 3600000 : 60000) : 0 }); }
    else if (c.name === 'call') emit('talk:call', { chat, reason: c.args.reason || '', charId: target.charId, lines: msgText(target).split('\n').filter(l => l.trim()).length });   // 전화는 src/call 이 받는다 (말풍선이 다 나온 뒤에 울린다)
    else if (c.name === 'time') { if (chat.clock?.ai) await Clock.move(chat, { set: c.args.set, advance: c.args.advance }); }
    else if (c.name === 'memory' && c.args.summary && S.settings.memory.enabled) await Memory.add(chat.id, { summary: c.args.summary, kind: 'fact', importance: 0.7, entities: [target.name] }).catch(() => { });
    else if (c.name === 'selfie') { const ch = S.get('chars', target.charId); drawScene(target, { title: '셀카', camera: 'selfie, upper body, looking at viewer', prompt: c.args.context || 'casual selfie', characters: [{ name: ch?.name || target.name, action: 'taking a selfie, ' + (c.args.context || 'smiling') }] }); }
  }
}
/** 말풍선을 한 줄씩 차례로 보여 준다 (저장은 이미 끝난 상태) */
async function revealLines(target: Msg) {
  const lines = msgText(target).split('\n').filter(l => l.trim()); if (lines.length < 2) return;
  const sw = target.swipes[target.sw], full = sw.text;
  for (let i = 1; i <= lines.length; i++) {
    if (!ui.msgs?.querySelector(`[data-id="${target.id}"] .msg-body`) || cur.busy || target.swipes[target.sw].text !== full) break;
    sw.text = lines.slice(0, i).join('\n'); cur.paint.set(target.id, bodyHtml(target) + (i < lines.length ? TYPING : '')); sw.text = full;
    flush('m:' + target.id);
    if (nearBottom()) toBottom();
    if (i < lines.length) await new Promise(r => setTimeout(r, Math.min(1800, 500 + lines[i].length * 28)));
  }
  const stick = nearBottom();
  if (cur.paint.delete(target.id)) bump('m:' + target.id);
  if (stick) pinBottom(600);   // 다 뜬 뒤 붙는 버튼 줄 · 넘기기까지 보이게
}

// ── 먼저 오는 연락: 답하지 못한 말 → 약속 → 조용할 때, 한 흐름으로 ──
let autoTimer = 0, chimeTimer = 0;
const capOf = (ch: Cast) => { const M = S.settings.modes, t = ch.talk ?? 0; return +(M.autoDaily || 0) > 0 ? +(M.autoDaily || 0) : t >= 0.8 ? 8 : t >= 0.6 ? 6 : t >= 0.4 ? 5 : t >= 0.2 ? 3 : 2; };
function autoState(chat: Room) { const a = chat.auto ||= { day: '', count: 0, streak: 0 }, today = new Date().toDateString(); if (a.day !== today) { a.day = today; a.count = 0; a.chime = 0; } return a; }
/** 오프라인이 풀릴 때까지 남은 시간 (밀리초) */
function wakeMsOf(chat: Room, ch: Cast) {
  const p = presenceOf(chat, ch); if (p.status !== 'offline') return 0;
  if (p.from === 'override') return p.until ? Math.max(1000, p.until - now()) : Infinity;
  const s = scheduleOf(ch); return s ? wakeIn(s) * 60000 : Infinity;
}
/** 선톡을 맡을 캐릭터: 가장 여유 있는 상태인 캐릭터 가운데서 (roll 이면 수다 정도에 따라 뽑는다) */
function autoChar(chat: Room, roll = false): Cast | null {
  const cs = awakeChars(chat), rank: Record<string, number> = { online: 0, idle: 1, dnd: 2, offline: 3 }; if (!cs.length) return null;
  const best = Math.min(...cs.map(c => rank[presenceOf(chat, c).status])), pool = cs.filter(c => rank[presenceOf(chat, c).status] === best);
  return roll ? weighted(pool, c => c.talk || 0.5) : pool[0];
}
/** 지금 말을 건다면 그 이유 */
function motiveFor(chat: Room, ch: Cast, msgs: Msg[]): Motive {
  const real = msgs.filter(m => m.role !== 'system'), last = real[real.length - 1], lastUser = [...real].reverse().find(m => m.role === 'user');
  const seen = !document.hidden && (chat.seenAt || 0) >= (last?.ts || 0);
  return pickMotive({ sched: scheduleOf(ch), now: Clock.now(chat), lastUserAt: lastUser?.ts || 0, lastRole: (last?.role || '') as '' | 'user' | 'assistant', seen, readReact: S.settings.modes.readReact !== false, owed: !!chat.owed,
    cd: chat.auto?.cd?.[ch.id] || {}, hours: cdHours(), longHours: mo('longHours') as number | undefined, use: mo('motives') !== false });
}
function markMotive(chat: Room, ch: Cast, kind: string) { const a = autoState(chat); ((a.cd ||= {})[ch.id] ||= {})[kind] = now(); a.last = { kind, at: now(), charId: ch.id }; }
/** 다음 연락이 언제인지, 무엇이 막고 있는지 (설정 창의 현황판과 타이머가 같은 계산을 쓴다) */
export function autoPlan(chat: Room, msgs: Msg[] = cur.msgs): AutoPlan | null {
  const M = S.settings.modes, a = autoState(chat), t = now(); if (!awakeChars(chat).length) return null;
  const real = msgs.filter(m => m.role !== 'system'), last = real[real.length - 1];
  const owed = chat.owed && mo('offlineWake') !== false && last?.role === 'user' ? chat.owed : null;
  const ch = (owed && S.get('chars', owed.charId)) || autoChar(chat); if (!ch) return null;
  const p = presenceOf(chat, ch);
  const due = (chat.later || []).filter(l => l.at > t - 86400000 * 3).sort((x, y) => x.at - y.at)[0];
  const tail = msgs[msgs.length - 1], cap = capOf(ch);
  const plan = planAuto({ nowTs: t, on: !!M.auto, talk: modeOf(chat) === 'talk', scene: !!chat.scene?.on, hasUser: real.some(m => m.role === 'user'), conn: !!(S.get('conns', M.autoConn) || S.connFor(chat)),
    status: p.status, wakeMs: wakeMsOf(chat, ch), count: a.count, cap, streak: a.streak, maxStreak: M.autoStreak || 3, minutes: M.autoMinutes || 10, backoff: M.autoBackoff || 2,
    base: Math.max(tail?.swipes?.[tail.sw]?.ts || tail?.ts || 0, a.lastAt || 0, cur.chat === chat ? cur.openedAt || 0 : 0), quietMs: quietLeft(M.quietFrom, M.quietTo) * 60000,
    userStatus: Live.userStatus().status, hidden: document.hidden && !M.autoHidden, laterAt: due?.at || 0, laterOn: M.later !== false, owedAt: owed?.at || 0 });
  const motive = motiveFor(chat, ch, msgs), cd = a.cd?.[ch.id] || {}, hours = cdHours();
  return { plan, ch, due, owed, motive, count: a.count, cap, streak: a.streak, last: a.last || null, who: ch.name, status: `${STATUS[p.status]}${p.activity ? ' · ' + p.activity : ''}`,
    cdLeft: Object.fromEntries(MOTIVE_ORDER.map(k => [k, cooldownLeft(k, cd, hours, t)])) };
}
/** 설정 창의 "지금 한 통 받기" — 한도에 넣지 않고, 이유는 지금 고를 수 있는 것으로 */
export async function poke(chat: Room) {
    if (cur.chat !== chat || cur.busy || modeOf(chat) !== 'talk' || !(S.get('conns', S.settings.modes.autoConn) || S.connFor(chat))) return false;
  const ch = autoChar(chat, true); if (!ch) return false;
  const mv = motiveFor(chat, ch, cur.msgs); markMotive(chat, ch, mv.kind); autoState(chat).lastAt = now(); await S.save('chats', chat, true);
  void generate('normal', { proactive: true, speaker: ch, live: mv }); return true;
}
export function armAuto() {
  clearTimeout(autoTimer); const chat = cur.chat;
  if (!chat || modeOf(chat) !== 'talk' || !onChat()) return;
  const P = autoPlan(chat); if (!P || !P.plan.at) return;
  autoTimer = window.setTimeout(() => void fireAuto(chat), Math.min(Math.max(1500, P.plan.at - now()), 2 ** 31 - 1));
}
async function fireAuto(chat: Room) {
  const later = (ms: number) => { clearTimeout(autoTimer); autoTimer = window.setTimeout(armAuto, ms); };
  if (cur.chat !== chat || !onChat()) return;
  if (cur.busy || ui.input?.value.trim()) return later(60000);                                  // 쓰고 있는 중이면 끼어들지 않는다
  const M = S.settings.modes, P = autoPlan(chat); if (!P || !P.plan.at) return;
  if (P.plan.at - now() > 2000) return armAuto();                                               // 그사이 사정이 바뀌었다 (오프라인 · 조용한 시간대 …)
  if (document.hidden && !M.autoHidden) return later(5 * 60000);                                // 안 보고 있으면 미룬다 (호출 없음)
  const a = autoState(chat);
  if (P.plan.kind === 'owed') {                                                                 // 오프라인이라 답하지 못한 말에 이제 답한다
    const mv = { ...P.motive, kind: 'back' }; delete chat.owed; markMotive(chat, P.ch, 'back'); await S.save('chats', chat, true);
    return generate('normal', { proactive: true, speaker: P.ch, live: mv });
  }
  if (P.plan.kind === 'later' && P.due) {                                                       // 약속한 연락
    chat.later = (chat.later || []).filter(l => l !== P.due); a.last = { kind: 'later', at: now(), charId: P.ch.id }; await S.save('chats', chat, true);
    return generate('normal', { proactive: true, speaker: P.ch, live: { kind: 'later', about: P.due.about } });
  }
  const ch = autoChar(chat, true); if (!ch) return;
  const mv = motiveFor(chat, ch, cur.msgs);
  a.count++; a.streak++; a.lastAt = now(); markMotive(chat, ch, mv.kind); await S.save('chats', chat, true);
  void generate('normal', { proactive: true, speaker: ch, live: mv });
}
/** 자리를 비운 사이: 기한이 지난 약속, 또는 오래 비웠을 때 그 사이에 온 것처럼 한 통 */
export async function catchUp(chat: Room, awayFor: number) {
  const M = S.settings.modes; if (modeOf(chat) !== 'talk' || cur.busy || chat.scene?.on || !S.connFor(chat) || Live.userStatus().status === 'dnd') return false;
  const a = autoState(chat), ch = autoChar(chat, true); if (!ch) return false;
  const due = M.later !== false ? (chat.later || []).filter(l => l.at <= now()).sort((x, y) => x.at - y.at)[0] : null;
  if (due) { chat.later = (chat.later || []).filter(l => l !== due); a.last = { kind: 'later', at: now(), charId: ch.id }; await S.save('chats', chat, true); await generate('normal', { proactive: true, speaker: ch, live: { kind: 'later', about: due.about }, stamp: Math.max(due.at, now() - 86400000 * 3) }); return true; }
  const last = cur.msgs[cur.msgs.length - 1];
  if (inQuietHours() || chat.owed) return false;                                         // 답하지 못한 말이 있으면 그쪽(복귀)이 먼저다
  if (!M.auto || M.away === false || !last || awayFor < (M.awayHours || 3) * 3600000 || a.count >= capOf(ch) || (a.awayAt || 0) > (last.ts || 0) || presenceOf(chat, ch).status === 'offline') return false;
  a.awayAt = now(); a.count++; a.lastAt = now(); a.last = { kind: 'away', at: now(), charId: ch.id }; await S.save('chats', chat, true);
  const base = Math.max(last.ts || 0, now() - awayFor), stamp = Math.round(base + (now() - base) * (0.35 + Math.random() * 0.5));
  await generate('normal', { proactive: true, speaker: ch, live: { kind: 'away', hours: Math.max(1, Math.round(awayFor / 3600000)) }, stamp });
  return true;
}
/** 그룹: 한 캐릭터가 말한 뒤 다른 캐릭터가 끼어든다 (기본 꺼짐 · 한 번에 답변 1회) */
function maybeChime(chat: Room, msgs: Msg[]) {
    if (modeOf(chat) !== 'talk' || chat.scene?.on || !mo('chime') || cur.chat !== chat || charsOf(chat).length < 2) return;
  const a = autoState(chat), tail = msgs[msgs.length - 1]; if (tail?.role !== 'assistant') return;
  if ((cur.chimeRun || 0) >= (moN('chimeMax') || 2) || (a.chime || 0) >= (moN('chimeDaily') || 20)) return;
  const text = msgText(tail), pool = awakeChars(chat).filter(c => c.id !== tail.charId && presenceOf(chat, c).status !== 'offline'); if (!pool.length) return;
  const mood = (c: Cast) => ({ online: 1, idle: 0.7, dnd: 0.3 } as Record<string, number>)[presenceOf(chat, c).status] || 1;
  let who = pool.find(c => nameCalled(text, c.name));
  if (!who) { if (Math.random() * 100 >= moN('chimeChance')) return; who = weighted(pool, c => (c.talk || 0.5) * mood(c)); }
  const speaker = who;
  cur.chimeRun = (cur.chimeRun || 0) + 1; a.chime = (a.chime || 0) + 1; void S.save('chats', chat, true);
  clearTimeout(chimeTimer);
  chimeTimer = window.setTimeout(() => { if (cur.chat === chat && !cur.busy && !ui.input?.value.trim() && onChat()) void generate('normal', { speaker, chime: true, live: { kind: 'chime', from: tail.name || '' } }); }, Math.min(9000, 1600 + text.split('\n').filter(l => l.trim()).length * 900 + Math.random() * 1500));
}

// ════════ 장면: 메시지에서 만남으로 ════════
export async function openScene(info: { title?: string; place?: string; time?: string } = {}, auto = false) {
  const chat = cur.chat; if (!chat || chat.scene?.on) return;
  const title = (info.title || '').trim() || '만남';
  chat.scene = { on: true, title, place: info.place || '', at: cur.msgs.length }; chat.scenes = (chat.scenes || 0) + 1;
  cur.msgs.push(newMsg('system', `Scene begins: ${title}${info.place ? ' — ' + info.place : ''}${info.time ? ' (' + info.time + ')' : ''}`, { curtain: { kind: 'open', title, place: info.place || '', time: info.time || '' } }));
  await save(); drawMain();
  if (auto && S.settings.modes.sceneStart !== false) void generate('normal');
}
export async function closeScene(summary = '', auto = false) {
  const chat = cur.chat; if (!chat?.scene?.on) return;
  if (!auto && !summary) { const v = await promptBox(t('chat.scene.closePrompt'), '', { placeholder: t('chat.scene.closePlaceholder') }); if (v === null) return; summary = v.trim(); }
  chat.scene = { ...chat.scene, on: false };
  cur.msgs.push(newMsg('system', `Scene ends${summary ? ': ' + summary : ''}. Back to texting.`, { curtain: { kind: 'close', summary } }));
  await save(); emit('scene:close', { chat }); drawMain(); armAuto();
}

// ════════ 생성 ════════
/** 다음에 말할 사람을 고르는 데 끼어드는 자리 (src/threads 가 건다: 눈치껏 순서 · 귓속말을 들은 사람 · 자리에 없는 사람 빼기). pick = 이 사람으로 정함, pool = 이 사람들 가운데서 평소대로 */
export const speakerHook: { fn: ((chat: Room, chars: Cast[], msgs: Msg[]) => { pick?: Cast; pool?: Cast[] } | null | undefined) | null } = { fn: null };
function pickSpeaker(chars: Cast[]) {
  const chat = cur.chat!, awake = chars.filter(c => !(chat.muted || []).includes(c.id)); if (awake.length) chars = awake;
  if (chars.length > 1 && speakerHook.fn) { try { const h = speakerHook.fn(chat, chars, cur.msgs); if (h?.pick) return h.pick; if (h?.pool?.length) chars = h.pool; } catch (e) { console.warn('[다음 화자]', e); } }
  if (chars.length === 1) return chars[0];
  const lastAi = [...cur.msgs].reverse().find(m => m.role === 'assistant'), tail = cur.msgs[cur.msgs.length - 1];
  const lastText = tail ? msgText(tail) : '';
  if (chat.groupOrder === 'list') { const i = chars.findIndex(c => c.id === lastAi?.charId); return chars[(i + 1) % chars.length]; }
  if (chat.groupOrder === 'pooled') {   // 돌아가며: 내 마지막 말 뒤로 아직 말하지 않은 사람 가운데 한 명. 모두 말했으면 방금 말한 사람만 빼고
    const spoke = new Set<string>(); for (let i = cur.msgs.length - 1; i >= 0 && cur.msgs[i].role !== 'user'; i--) if (cur.msgs[i].role === 'assistant') spoke.add(cur.msgs[i].charId);
    const fresh = chars.filter(c => !spoke.has(c.id)), rest = chars.filter(c => c.id !== lastAi?.charId), from = fresh.length ? fresh : rest.length ? rest : chars;
    return from[Math.floor(Math.random() * from.length)];
  }
  const lastSpeaker = tail?.charId;
  const named = chars.filter(c => c.id !== lastSpeaker && lastText.includes(c.name));
  if (named.length) return named[0];
  const pool = chars.filter(c => c.id !== lastAi?.charId); const list = pool.length ? pool : chars;
  return weighted(list, c => c.talk || 0.5);
}

export async function generate(type: GenType = 'normal', opt: GenOpt = {}): Promise<void> {
  // 이 답변이 들어갈 방을 처음에 붙잡는다. 답을 기다리는 동안 다른 방으로 가도 답은 이 방에만 들어가고, 화면은 이 방을 보고 있을 때만 고친다
  const chat = opt.room?.chat || cur.chat, msgs = (opt.room?.msgs || (chat === cur.chat ? cur.msgs : null)) as Msg[];
  if (!chat || !msgs) return;
  const r0 = runs.get(chat.id); if (r0?.busy || r0?.prep) return;   // 이 방이 이미 답을 받는 중 (다른 방은 상관없다)
  const shown = () => cur.chat === chat;
  if (shown()) clearChoices();
  const E = engine;
  const chars = charsOf(chat);
  if (!chars.length) return toast(t('chat.gen.noChar'), 'err');
  const conn = (opt.proactive && S.get('conns', S.settings.modes.autoConn)) || pickReply(chat, type);   // 이 대화에서 고른 모델 · 섞어 쓰기 (src/reach/route.ts)
  if (!conn) { if (opt.proactive) return; toast(t('chat.gen.noConn'), 'err'); return go('conns'); }
  let used = conn, fell = false;   // 실제로 답한 연결 (주 연결이 안 돼 대체 연결로 넘어갔으면 그쪽)
  const last = msgs[msgs.length - 1];
  if ((type === 'regen' || type === 'continue') && last?.role !== 'assistant') type = 'normal';
  let speaker = opt.speaker || (type === 'normal' || type === 'impersonate' ? pickSpeaker(chars) : (S.get('chars', last.charId) || chars[0]));
  const preset = S.presetFor(chat), persona = S.persona(chat);
  const inScene = modeOf(chat) === 'talk' && !!chat.scene?.on, talkNow = modeOf(chat) === 'talk' && !inScene;
  if (!opt.chime) { cur.chimeRun = opt.proactive ? 0 : cur.chimeRun || 0; clearTimeout(chimeTimer); }
  // 오프라인인 캐릭터는 답하지 않는다. 그룹이면 깨어 있는 다른 캐릭터가 받고, 아무도 없으면 깨어난 뒤에 답한다
  if (talkNow && mo('presenceDelay') && type === 'normal' && !opt.proactive && !opt.chime && presenceOf(chat, speaker).status === 'offline') {
    const up = opt.speaker ? [] : awakeChars(chat).filter(c => presenceOf(chat, c).status !== 'offline');
    if (up.length) speaker = pickSpeaker(up);
    else {
      const p = presenceOf(chat, speaker), wake = wakeMsOf(chat, speaker), owe = mo('offlineWake') !== false && last?.role === 'user';
      if (owe) { chat.owed ||= { at: now(), charId: speaker.id }; await S.save('chats', chat, true); }
      toast((p.activity ? t('chat.gen.offlineAct', { name: speaker.name, activity: p.activity }) : t('chat.gen.offline', { name: speaker.name })) + ' ' + (owe && isFinite(wake) ? t('chat.gen.replyAt', { time: Live.clock(now() + wake) }) : t('chat.gen.noReply')));
      if (shown()) { drawTop(); armAuto(); } return;
    }
  }
  const pres = talkNow ? presenceOf(chat, speaker) : null, trackOn = !!S.settings.tracker.enabled;
  // 상태창: 다시 생성할 때는 그 답변이 나오기 전의 상태로 되감고 시작한다
  if (trackOn && type !== 'impersonate') { Live.arm(chat); if (type === 'regen' && Live.rewind(chat, msgs, msgs.length - 1) && shown()) drawHud(); }
  if (X.before.length) {   // 답변 전 준비: 그동안 이 방에서는 다른 생성이 끼어들지 못한다. 다른 방으로 가도 준비와 답변은 이 방에서 이어 간다
    // 멈추기를 누르면 기다리던 준비를 두고 바로 그만둔다
    const stop = new AbortController(), stopped = new Promise<void>(r => stop.signal.addEventListener('abort', () => r(), { once: true })), note = t('chat.status.recalling');
    setPrep(chat, msgs, true, stop); if (shown()) setStatus(note);
    try { for (const b of X.before) { if (stop.signal.aborted) break; try { await Promise.race([b.fn({ chat, msgs, type, chars, persona, speaker }), stopped]); } catch (e) { console.warn('[생성 전 준비]', b.owner, e); } } } finally { setPrep(chat, msgs, false); clearStatusIf(note); }
    if (stop.signal.aborted || runs.get(chat.id)?.busy || !S.get('chats', chat.id)) return;
  }
  chat.loreState ||= {}; chat.vars ||= {};
  const pchat: Room = inScene ? Object.assign(Object.create(chat) as Room, { mode: 'rp' as const, sceneLive: true }) : chat, keepPresence = chat.presence;
  Live.pending = opt.live || null;
  if (pres) chat.presence = { status: pres.status, activity: pres.activity };   // 엔진이 읽는 자리에 지금의 실제 상태(일정 포함)를 잠깐 올려 둔다
  let built;
  try { built = E.buildPrompt({ chat: pchat, char: speaker, chars, persona, preset, msgs, type, commit: true, proactive: !!opt.proactive }); } catch (e) { console.error(e); return toast(t('chat.gen.buildFail', { err: errMsg(e) }), 'err'); }
  finally { Live.pending = null; if (pres) { if (keepPresence === undefined) delete chat.presence; else chat.presence = keepPresence; } }
  emit('prompt:ready', { messages: built.messages, chat, type, speaker });
  if (shown()) { cur.lastPrompt = built; drawGauge(); }

  let target: Msg | null = null, sw: Swipe | null = null, base = '';
  const stick = shown() && nearBottom();
  if (type === 'normal') { target = newMsg('assistant', '', { charId: speaker.id, name: speaker.name, ...(inScene ? { scene: true } : {}) }); msgs.push(target); if (shown()) appendMsg(target); }
  else if (type === 'regen') { target = last; target.swipes.push({ text: '', ts: now() }); target.sw = target.swipes.length - 1; if (shown()) redraw(target); }
  else if (type === 'continue') { target = last; base = target.swipes[target.sw].text; }
  if (target) { sw = target.swipes[target.sw]; delete sw.tr; sw.showTr = false; }
  const tail = built.messages[built.messages.length - 1];
  if (target && type !== 'continue' && tail?.prefill && E.prefillOk(conn)) base = tail.content;
  if (stick) toBottom();
  if (shown()) atBottom = stick || nearBottom();
  const startTop = ui.scroll?.scrollTop ?? 0;   // 답변을 받는 동안 위로 올려 봤는지 가리는 기준

  let acc = '', raf = 0, apiThink = false, bodyEl: Element | null = null, reasonLen = -1;
  const talkStagger = !!built.talk && S.settings.modes.stagger !== false && type !== 'continue';
  // 느린 기기에서는 받는 글을 그릴 때마다 한 화면이 넘게 걸린다. 그리는 데 걸린 시간을 재서, 오래 걸리면 그만큼 띄엄띄엄 그린다 (스크롤 · 누름이 끼어들 틈을 남긴다). 빠른 기기는 그대로 매 화면 그린다
  let paintAt = 0, paintMs = 0, paintTm = 0;
  const paint = () => {   // 이 메시지 하나만 고친다
    raf = 0; if (!target) return;
    const began = paintAt = performance.now(); requestAnimationFrame(() => { paintMs = performance.now() - began; });   // 다음 화면이 시작될 때까지 = 꾸미기 + 배치 + 그리기
    const html = (talkStagger ? '' : bodyHtml(target)) || TYPING;
    cur.paint.set(target.id, html);
    if (!shown()) return;   // 다른 방을 보고 있다: 이 방으로 돌아오면 목록이 cur.paint 에서 받는 중인 글을 그린다
    // 본문만 바뀌었으면 React 를 거치지 않고 그 자리의 글만 바꾼다 (생각 글이 늘었거나 아직 그리지 않았으면 메시지를 다시 그린다)
    const rl = (sw?.reasoning || '').length;
    if (bodyEl?.isConnected && rl === reasonLen) bodyEl.innerHTML = html;
    else { flush('m:' + target.id); reasonLen = rl; bodyEl = ui.msgs?.querySelector(`article.msg[data-id="${CSS.escape(target.id)}"] .msg-body`) || null; }
    if (S.settings.autoScroll) followBottom(atBottom);
    // 상태창 변수 블록(<UpdateVariable>)은 화면에 숨는다 — 답이 끝난 것처럼 보여도 아직 받는 중이면 그렇다고 알린다
    const open = acc.lastIndexOf('<UpdateVariable'), inVars = open >= 0 && acc.indexOf('</UpdateVariable>', open) < 0;
    if (inVars !== varsNote) { varsNote = inVars; if (inVars) setStatus(t('chat.status.vars')); else clearStatusIf(t('chat.status.vars')); }
  };
  let varsNote = false;
  const schedule = () => {
    if (raf || paintTm) return;
    const wait = paintMs > 40 ? paintAt + Math.min(300, paintMs * 2) - performance.now() : 0;
    if (wait > 8) paintTm = window.setTimeout(() => { paintTm = 0; if (!raf) raf = requestAnimationFrame(paint); }, wait);
    else raf = requestAnimationFrame(paint);
  };
  const abort = new AbortController(); setBusy(chat, msgs, true, abort); try { paint(); } catch (e) { console.warn(e); } emit('generate:start', { chat, type });
  if (built.talk && pres && mo('presenceDelay') && type === 'normal' && !opt.proactive && !opt.chime) {
    // 상태에 따라 답장이 늦게 온다. 내가 이름을 불렀으면 서둘러 본다
    const lastUser = [...msgs].reverse().find(m => m.role === 'user'), named = !!lastUser && nameCalled(msgText(lastUser), speaker.name);
    const wait = replyDelay(pres.status, { online: mo('delayOnline'), idle: mo('delayIdle'), dnd: mo('delayDnd') }, { named, namedPct: mo('delayNamed') as number | undefined });
    if (wait) await new Promise<void>(r => { const t = setTimeout(r, wait); abort.signal.addEventListener('abort', () => { clearTimeout(t); r(); }, { once: true }); });
  }
  const t0 = now(), impersonateBase = ui.input?.value || ''; let cutWhy = '';   // 답변이 끝까지 오지 못한 까닭: 'error' 연결이 끊김 · 'stop' 멈춤 · 'length' 출력 한도 ('' = 다 왔다)
  try {
    const talk = modeOf(chat) === 'talk' && !inScene && type !== 'impersonate';   // 대화 모드는 짧게 주고받는다
    const res = await streamReply(conn, { ...preset.params, ...(talk ? { maxTokens: Math.min(preset.params.maxTokens || 4096, (opt.proactive && +(S.settings.modes.autoTokens || 0)) || S.settings.modes.talkTokens || 400) } : {}), stop: [...(preset.params.stop || []), ...(S.settings.format?.stopStrings || [])], names: { char: speaker.name, user: persona.name, others: chars.filter(c => c.id !== speaker.id).map(c => c.name) } }, built.messages, {
      signal: abort.signal, label: `${type === 'normal' ? (opt.proactive ? 'reply (proactive)' : opt.chime ? 'reply (chime)' : 'reply') : type} · ${speaker.name}`,
      onText: d => { acc += d; if (target && sw) { const sp = E.splitThink(base + acc); sw.text = sp.text; if (sp.think && !apiThink) sw.reasoning = sp.think; schedule(); } else if (ui.input && shown()) { ui.input.value = impersonateBase + acc; ui.input.dispatchEvent(new Event('input')); } },
      onThink: d => { if (target && sw) { apiThink = true; sw.reasoning = (sw.reasoning || '') + d; schedule(); } },
    });
    used = res.via; fell = res.fell;
    if (!talk && /^(length|max_tokens)$/i.test(String(res.finish || ''))) cutWhy = 'length';
    if (target && sw && !res.text.trim() && !sw.reasoning) toast(t('chat.gen.empty'), 'err');
  } catch (e) {
    cutWhy = e instanceof Error && e.name === 'AbortError' ? 'stop' : 'error';
    if (!(e instanceof Error && e.name === 'AbortError')) { console.error(e); toast(errMsg(e), 'err'); }
  } finally {
    if (raf) cancelAnimationFrame(raf); clearTimeout(paintTm);
    // 답변이 끝날 때 맨 아래를 보고 있었는지 (끝난 뒤 붙는 버튼 줄 · 한 줄씩 뜨는 말풍선까지 따라 내려간다).
    // 자동 스크롤을 꺼 두었어도, 맨 아래에서 시작했고 위로 올려 보지 않았으며 답변이 한 화면에 다 들어오면 끝까지 내려간다 (넘기기가 화면 밖에 걸리지 않게)
    const scEnd = ui.scroll, elEnd = target && ui.msgs?.querySelector<HTMLElement>(`article.msg[data-id="${CSS.escape(target.id)}"]`);
    const endStick = shown() && (nearBottom() || (stick && !!scEnd && scEnd.scrollTop >= startTop - 4 && !!elEnd && elEnd.offsetHeight < scEnd.clientHeight * .8));
    if (shown()) follow.on = false;
    setBusy(chat, msgs, false); if (varsNote) { varsNote = false; clearStatusIf(t('chat.status.vars')); }
    const alive = S.get('chats', chat.id) === chat;   // 답변이 나오는 동안 지워진 방은 되살리지 않는다
    if (target) cur.paint.delete(target.id);
    if (!alive) { /* 답변이 나오는 동안 지워진 방 */ }
    else if (target && sw) {
      const plan = Illust.extract(E.splitThink(base + acc).text);
      const lv = Live.extract(plan.text); plan.text = lv.text;
      const talked = built.talk ? E.parseTalk(plan.text) : null;
      const final = E.postFormat(E.applyRegex(talked ? talked.text : plan.text, { who: 'ai', target: 'store', charId: target.charId, ctx: built.ctx }));
      if (final && plan.scenes.length && S.settings.illust.auto) for (const sc of plan.scenes) drawScene(target, sc, { chat, msgs });
      if (!final && !sw.reasoning) {
        if (type === 'normal') { const i = msgs.indexOf(target); if (i >= 0) msgs.splice(i, 1); }
        else if (type === 'regen') { target.swipes.pop(); target.sw = Math.max(0, target.swipes.length - 1); if (cur.chat === chat) rewindState(); else Live.rewind(chat, msgs); }
        if (cur.chat === chat) drawMsgs();
      } else {
        sw.text = final || sw.text; if (cutWhy) sw.cut = cutWhy; else delete sw.cut; /* 끊긴 답변은 표시해 둔다 — 장기기억이 끝 문장을 사실로 적지 않는다 */ sw.model = used.model; if (fell) sw.fb = used.name; else delete sw.fb; sw.ms = now() - t0; if (type !== 'continue') sw.ts = now(); if (opt.stamp && type === 'normal') { sw.ts = target.ts = opt.stamp; }
        if (cur.chat === chat) redraw(target);
      }
      if (talked?.cmds.length && final) { await runTalkCommands(chat, msgs, target, talked.cmds); if (cur.chat === chat) drawTop(); }
      if (final) {
        if (trackOn) { if (lv.patch) Live.apply(chat, lv.patch, { names: chars.map(c => c.name), mx: t => E.macro(t, built.ctx) }); Live.stamp(chat, target); if (cur.chat === chat) drawHud(); }   // 바뀐 항목만 합치고, 이 답변에 그 시점의 상태를 찍어 둔다
        if (opt.live?.kind) { target.why = opt.live.kind; if (cur.chat === chat) redraw(target); }   // 왜 온 연락인지 이름 옆에 작게
        if (chat.owed && !opt.chime) delete chat.owed;
        for (const o of lv.later) if (S.settings.modes.later !== false && (chat.later ||= []).length < (S.settings.modes.laterMax || 3)) chat.later.push(newLater(o));
        if (document.hidden || cur.chat !== chat) { chat.unread = (chat.unread || 0) + 1; Live.ping(speaker.name, final); } else chat.seenAt = now();
      }
      if (final) emit('message:received', { msg: target, chat });   // 저장 전에 알린다 (이야기 시각 등 메시지에 적히는 것이 함께 저장되게)
      if (final && X.received.length) {   // 저장 전에 기다려 주는 일 (변수 갱신 등: 답변 글에 덧붙일 수도 있다)
        for (const h of X.received) { try { await h.fn({ chat, msgs, msg: target, type }); } catch (e) { console.warn('[답변 뒤 처리]', h.owner, e); } }
        if (cur.chat === chat) redraw(target);
      }
      await S.saveMsgs(chat, msgs);
      if (final && cur.chat === chat) {
        const sc = lv.scene;
        if (lv.sceneEnd && chat.scene?.on) await closeScene(lv.sceneEnd.summary || '', true);
        else if (sc && modeOf(chat) === 'talk' && !chat.scene?.on && S.settings.modes.scenes !== false) setTimeout(() => { if (cur.chat === chat && !cur.busy) void openScene(sc, true); }, talked ? 1400 : 0);
      }
      if (endStick && cur.chat === chat) { toBottom(); pinBottom(talked ? 8000 : 1500); }   // 손을 대면 바로 풀린다
      if (talked && final && cur.chat === chat && S.settings.modes.stagger !== false && type !== 'continue') void revealLines(target);
      if (cur.chat === chat) { drawSide(); drawDossier(); if (cur.drawer) drawDrawer(); } else drawSide();   // 다른 방에 있으면 목록(답 받는 중 · 안 읽음)만
      if (final) void afterReply(chat, msgs);   // 기억 기록 · 번역 · 상태 갱신은 그 방을 보고 있지 않아도 한다 (선택지 · 이어 말하기처럼 화면에 붙은 것만 그 방일 때)
    } else if (ui.input && shown()) { ui.input.value = (impersonateBase + acc).trim(); ui.input.dispatchEvent(new Event('input')); ui.input.focus(); }
    runDone(chat);
    emit('generate:end', { chat, type });
  }
}

async function afterReply(chat: Room, msgs: Msg[]) {
  const st = S.settings, shown = () => cur.chat === chat;
  if (shown()) armAuto();
  const tail = msgs[msgs.length - 1];
  if (st.illust.auto && tail?.role === 'assistant' && !tail.swipes[tail.sw].illust?.length && (st.illust.mode === 'call') && msgs.filter(m => m.role === 'assistant').length % Math.max(1, st.illust.every || 1) === 0) Illust.analyze(chat, msgs, tail, undefined, { manual: false }).then(sc => sc.slice(0, st.illust.maxScenes || 1).forEach(x => drawScene(tail, x, { chat, msgs }))).catch(e => toast(t('chat.illust.planFail', { err: errMsg(e) }), 'err'));
  // 기억 정리는 뒤에서 한다 — 번역 · 상태 갱신 · 선택지가 기록(과 요약 · 검사)이 끝나기를 기다리지 않는다. 실패하면 장부에 남아 나중에 다시 한다
  if (st.memory.enabled && st.memory.auto && tail?.role === 'assistant') { const note = t('chat.status.memorizing'); if (shown()) setStatus(note); void Auditor.recordSoon(chat, msgs, tail).then(() => { if (cur.drawer && cur.chat === chat) drawDrawer(); }, e => toast(t('chat.memory.fail', { err: errMsg(e) }), 'err')).finally(() => { if (cur.status === note) setStatus(''); }); }
  if (st.translate.auto && tail?.role === 'assistant' && !tail.swipes[tail.sw].tr) await translate(tail, { chat, msgs });
  if (st.tracker.enabled && st.tracker.mode !== 'inline') await track(chat, msgs);
  if (shown()) maybeChime(chat, msgs);
  if (tail?.role === 'assistant' && cur.chat === chat) armGroupAuto(chat);
  if (tail?.role === 'assistant' && cur.chat === chat && st.modes.choices && !chat.groupAuto?.on && !(chat as { game?: { on?: boolean } }).game?.on) void makeChoices(chat, msgs, tail);
}
// ── 선택지: 답장 뒤에 내가 할 만한 말 · 행동을 몇 개 제안한다 (설정에서 켠다 · 답장마다 호출 1회) ──
export function clearChoices() { if (cur.choices) { cur.choices = null; bump('choices'); } }
export async function makeChoices(chat: Room, msgs: Msg[], tail: Msg) {
  const conn = S.helperConn('choices' as never, chat) || S.connFor(chat); if (!conn) return;
  const n = Math.max(2, Math.min(5, +(S.settings.modes.choiceCount ?? 3) || 3)), persona = S.persona(chat), u = persona.name || 'User';
  cur.choices = { msgId: tail.id, list: [], busy: true }; bump('choices');
  try {
    const recent = msgs.filter(m => !m.hidden && m.role !== 'system').slice(-8).map(m => `${m.role === 'user' ? u : m.name || '?'}: ${msgText(m).slice(0, 900)}`).join('\n\n');
    const sys = `You suggest what ${u} could do or say next in an ongoing ${modeOf(chat) === 'talk' ? 'text-message chat' : 'roleplay'}. Give exactly ${n} options that differ in direction (for example: go along, push back, change the subject, act boldly). Each option is one short line written as ${u} would send it${modeOf(chat) === 'talk' ? '' : ' — first person, action and/or speech'}, in the language of the story, at most 20 words. Output only the ${n} lines, numbered 1. to ${n}., nothing else.`;
    const out = await engine.quickCall(sys, recent, { maxTokens: 300, conn, lowThink: true });
    const list = out.split('\n').map(l => l.replace(/^\s*(?:\d+[.)]|[-*•])\s*/, '').trim().replace(/^["“](.*)["”]$/, '$1')).filter(Boolean).slice(0, n);
    if (cur.choices?.msgId === tail.id && cur.chat === chat && cur.msgs[cur.msgs.length - 1] === tail) { cur.choices = list.length ? { msgId: tail.id, list } : null; bump('choices'); }
  } catch (e) { console.warn('[선택지]', e); if (cur.choices?.msgId === tail.id) clearChoices(); }
}
/** 선택지를 고른다: 입력창에 넣고 보낸다 (Shift 를 누르고 고르면 넣기만 한다) */
export function pickChoice(text: string, fillOnly = false) {
  const inp = ui.input; if (!inp) return; inp.value = text; inp.dispatchEvent(new Event('input')); clearChoices();
  if (fillOnly) inp.focus(); else void send();
}

/** 예전 자동 요약 글을 장기기억의 기억 한 장으로 옮긴다 */
export async function moveOldSummary(chat: Room) {
  const text = String(chat.summary || '').trim(); if (!text) return;
  await Memory.add(chat.id, { summary: text, kind: 'event', importance: 0.8, entities: charsOf(chat).map(c => c.name) });
  chat.summary = ''; chat.summaryAt = 0; await S.save('chats', chat, true); toast(t('chat.memory.movedSummary'), 'ok'); if (cur.drawer && cur.chat === chat) drawDrawer();
}

export async function track(chat: Room, msgs: Msg[]) {
  const E = engine, chars = charsOf(chat), persona = S.persona(chat);
  const ctx = E.makeCtx({ chat, char: chars[0], chars, persona, msgs }), mx = (t: string) => E.macro(t, ctx);
  const call = Live.trackCall(chat, chars, mx); if (!call.any) return;
  const note = t('chat.status.tracking'); if (cur.chat === chat) setStatus(note);
  try {
    const recent = msgs.filter(m => !m.hidden).slice(-6).map(m => `${m.role === 'user' ? ctx.user : (m.name || 'Narrator')}: ${msgText(m)}`).join('\n\n');
    const out = await E.quickCall(call.system, `[Previous state]\n${JSON.stringify(call.prev)}\n\n[Latest messages]\n${recent}`, { maxTokens: 900, conn: S.connFor(chat) });
    const patch = Live.readCall(out), tail = [...msgs].reverse().find(m => m.role === 'assistant');
    if (!patch) return console.warn('tracker: 답을 읽지 못했어요', out);
    Live.arm(chat); Live.apply(chat, patch, { names: chars.map(c => c.name), mx });   // 바뀐 항목만 돌아온다 — 나머지는 그대로
    if (tail) Live.stamp(chat, tail);
    await S.saveMsgs(chat, msgs); if (cur.chat === chat) { drawHud(); drawDossier(); if (cur.drawer) drawDrawer(); }
  } catch (e) { console.warn('tracker', e); } finally { clearStatusIf(note); }
}

/** 그 메시지가 보이게 펼친 뒤 그리로 간다 (찾기 · 상태창의 "이 메시지로 가기") */
export function jumpTo(m: Msg) {
  const i = cur.msgs.indexOf(m); if (i < 0) return;
  cur.shown = Math.max(cur.shown, cur.msgs.length - i + 4); drawMsgs(); setTimeout(() => chatApi.scrollTo(m.id), 60);
}
const saveState = (() => { let t = 0; return () => { clearTimeout(t); t = window.setTimeout(() => { if (cur.chat) void S.saveMsgs(cur.chat, cur.msgs); }, 300); }; })();
/** 상태창이 대화 화면에 부탁하는 것들 */
export const hudOpts = () => {
  const c = cur.chat!;
  return { msgs: cur.msgs, chars: charsOf(c), saved: saveState, redraw: () => { drawHud(); drawDossier(); if (cur.drawer) drawDrawer(); }, onJump: jumpTo,
    onFold: async () => { c.hudFold = !c.hudFold; await S.save('chats', c, true); drawHud(); } };
};
export type HudOpts = ReturnType<typeof hudOpts>;

/** 확장 기능에 열어 주는 채팅 조작 (옛 chat.js 의 chatApi 자리에 그대로 끼운다) */
export const chatApi: ChatApi = {
  /** 접혀 있는 앞부분까지 펼쳐 그 메시지로 간다 */
  reveal(id) { unpin(); const i = cur.msgs.findIndex(m => m.id === id); if (i < 0) return false; const need = cur.msgs.length - i + 4; if (need > cur.shown || i < cur.head) { cur.shown = Math.max(cur.shown, need); drawMsgs(); } const el = ui.msgs?.querySelector(`[data-id="${id}"]`); if (!el) return false; el.scrollIntoView({ block: 'center' }); el.classList.add('flash'); setTimeout(() => el.classList.remove('flash'), 1600); return true; },
  roomName: c => roomName(c), groupTitle: c => titleOf(c),
  current: () => ({ chat: cur.chat, msgs: cur.msgs, busy: cur.busy }),
  generate: (type = 'normal') => generate(type as GenType),
  send: text => { if (ui.input) { ui.input.value = text; return send(); } },
  insert: text => { const inp = ui.input; if (inp) { inp.value += text; inp.dispatchEvent(new Event('input')); inp.focus(); } },
  addSystemMessage: text => command('/sys ' + text),
  save: () => cur.chat && save(),
  // 삽화 · 번역처럼 뒤에서 끝난 일이 목록을 다시 그려도 보던 자리를 지킨다 (맨 아래를 보고 있었으면 맨 아래에 머문다)
  // 메시지 요소를 새로 만들지 않고 그려 둔 메시지마다 다시 그린다: 글이 그대로인 메시지는 화면(상태창 iframe)도 그대로 남는다
  redraw: () => {
    if (!cur.chat || !ui.msgs) return;
    const stick = nearBottom(), back = holdView();
    cur.from = Math.max(0, cur.msgs.length - cur.shown); cur.head = Math.max(cur.from, Math.min(cur.head, cur.msgs.length));   // 메시지가 늘거나 줄었을 수 있다
    // 최근 몇 개는 바로, 나머지는 한가할 때 조금씩 (그려 둔 100개를 한 번에 다시 그리면 그동안 화면이 멈춘다)
    const list = cur.msgs, job = ++softJob, NOW = 6;
    let i = list.length - NOW;
    flushSync(() => { for (let k = Math.max(cur.head, i); k < list.length; k++) bump('m:' + list[k].id); bump('msgs'); });
    back(); if (stick) pinBottom(1200);
    let per = 6;
    const more = () => {
      if (job !== softJob || list !== cur.msgs) return;
      const t0 = performance.now(); flushSync(() => { for (let k = 0; k < per && i > cur.head; k++) bump('m:' + list[--i].id); });
      per = Math.max(2, Math.min(30, Math.round(per * 12 / Math.max(1, performance.now() - t0))));   // 한 묶음이 12ms 안팎이 되게
      if (i > cur.head) whenIdle(more);
    };
    if (i > cur.head) whenIdle(more);
    if (cur.drawer) drawDrawer();
  },
  setStatus: t => setStatus(t),
  scrollTo: id => { unpin(); ui.msgs?.querySelector(`[data-id="${id}"]`)?.scrollIntoView({ block: 'center', behavior: 'smooth' }); },
  openDrawer: () => setDrawer(true),
  push: async m => { if (!cur.chat) return; cur.msgs.push(m); appendMsg(m); toBottom(); await save(); },
  stop: () => cur.abort?.abort(),
  getInput: () => ui.input?.value || '',
  setInput: text => { const inp = ui.input; if (inp) { inp.value = text; inp.dispatchEvent(new Event('input')); } },
};

/** 방향키로 마지막 답변 넘기기 · Esc 로 생성 중단 */
export function onKey(e: KeyboardEvent) {
  if (!onChat() || !cur.chat) return;
  if (e.key === 'Escape' && running() && !document.querySelector('.modal-wrap')) stopAll();
  // 비주얼 노벨 화면이 떠 있을 때는 방향키가 그 화면의 문단 넘기기다
  if ((e.key === 'ArrowLeft' || e.key === 'ArrowRight') && document.activeElement === document.body && !document.documentElement.classList.contains('vn-on')) {
    const last = cur.msgs[cur.msgs.length - 1];
    if (last?.role === 'assistant') void swipe(last, e.key === 'ArrowLeft' ? -1 : 1);
  }
}
/** 화면으로 돌아왔다: 읽음 처리 + 다음 연락 다시 잡기 */
export function onVisible() {
  if (document.hidden || !cur.chat) return;
  armAuto(); cur.chat.seenAt = now(); if (cur.chat.unread) { cur.chat.unread = 0; void S.save('chats', cur.chat, true); drawSide(); }
}
let presenceSig = '';
/** 일정의 칸이 바뀌면 상태 점도 따라 바뀐다 (30초마다 본다) */
export function watchPresence() {
  const chat = cur.chat; if (!onChat() || !chat || !ui.scroll || modeOf(chat) !== 'talk') return;
  const sig = charsOf(chat).map(ch => { const p = presenceOf(chat, ch); return p.status + p.activity; }).join('|');
  if (sig !== presenceSig) { const first = !presenceSig; presenceSig = sig; if (!first) { drawTop(); if (cur.drawer) drawDrawer(); armAuto(); } }
}
