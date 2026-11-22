// 변수 갱신 틀(MVU)을 대화에 잇는다: 답변 · 내 메시지마다 갱신 명령을 읽어 메시지 변수(답변 후보마다 swipe.thData)에 적고,
// 카드 스크립트(zod 스키마 · 이벤트 듣는 스크립트)와 상태창 화면이 실리태번에서처럼 같은 이벤트를 같은 차례로 받게 한다.
// 흐름은 MagVarUpdate(MIT, © 2025 MagicalAstrogy & StageDog)의 initCheck · handleVariablesInMessage · onMessageReceived 를 따른다.
// 이 틀을 쓰지 않는 대화(초기 변수 · 변수 자료 · 이 틀을 부르는 카드 스크립트가 없는 대화)에서는 아무 일도 하지 않는다.
/* eslint-disable @typescript-eslint/no-explicit-any */
import type { Chat, Char, Lore, Msg } from '../lib/types';
import { S, emit, msgText } from '../lib/core';
import { activeBooks, applyRegex, buildPrompt, macro, makeCtx, scanLore, streamChat, type PromptList, type PromptMsg, type Structured } from '../lib/engine';
import { newMsg } from '../lib/core';
import { setVarsOf, varsOf } from '../chat/msgVars';
import { cur } from '../chat/store';
import { chatApi } from '../chat/actions';
import { invokeFrames } from '../chat/frameEvents';
import { framePost } from '../lib/format';
import * as TH from '../lib/thscripts';
import { t } from '../i18n';
import { toast } from '../ui';
import { isMvu, runtime, type Obj } from './engine';
import type { Host } from './update';
import type { MvuData } from './types';

type R = Awaited<ReturnType<typeof runtime>>;
export const HOLDER = '<StatusPlaceHolderImpl/>';
const EV = { INIT: 'mag_variable_initialized', BEFORE: 'mag_before_message_update' };
const KEYS = ['initialized_lorebooks', 'stat_data', 'schema', 'display_data', 'delta_data'] as const;

// ── 설정 ──
export interface MvuCfg {
  /** inline: 답변에 적힌 갱신을 읽는다 · extra: 답이 오면 따로 한 번 더 물어 갱신을 받는다 */
  mode: 'inline' | 'extra'; auto: boolean; minLen: number; trigger: string; history: number; tries: number; maxTokens: number;
  /** 한 번 더 물을 때: 어떻게 부를지 (차례로 다시 · 여러 번 함께 · 한 번 뒤 여러 번 함께) · 프롬프트 꼴 · 답의 꼴 */
  strategy: 'seq' | 'parallel' | 'oneThenParallel'; prompt: 'builtin' | 'preset' | 'other'; otherPreset: string; format: 'chat' | 'tool' | 'json' | 'json_v4';
  white: string; black: string; toChat: boolean; sendas: boolean; notifyErr: boolean; notifyInit: boolean;
  /** 오래된 메시지의 변수 정리 (원래 틀의 자동 정리): 켜기 · 남겨 둘 간격 · 최근 몇 개는 남기기 · 최근 몇 개에 변수가 없으면 되살리기 */
  cleanup: boolean; snapEvery: number; keepRecent: number; restoreRecent: number;
  /** 옛 기능 단추(기준점 · 다시 계산 · 정리)를 보이기 */
  legacy: boolean;
}
export const DEFAULTS: MvuCfg = { mode: 'inline', auto: true, minLen: 0, trigger: '', history: 2, tries: 3, maxTokens: 4096, strategy: 'seq', prompt: 'builtin', otherPreset: '', format: 'chat', white: '', black: '', toChat: false, sendas: false, notifyErr: false, notifyInit: true, cleanup: true, snapEvery: 50, keepRecent: 20, restoreRecent: 10, legacy: false };
export const cfg = (): MvuCfg => ({ ...DEFAULTS, ...(((S.settings as unknown as { mvu?: Partial<MvuCfg> }).mvu) || {}) });
export function setCfg(p: Partial<MvuCfg>) { (S.settings as unknown as { mvu?: Partial<MvuCfg> }).mvu = { ...cfg(), ...p }; S.saveSettings(); emit('mvu:changed'); }

/** 카드가 정한 설정 (캐릭터 로어북의 꺼 둔 [config_override] 항목, JSON) */
export interface CardOverride { mode?: 'inline' | 'extra'; auto?: boolean; white?: string; black?: string; toChat?: boolean; sendas?: boolean }
const charsOf = (chat: Chat) => (chat.charIds || []).map(id => S.get('chars', id) as Char | undefined).filter((c): c is Char => !!c);
const bookOf = (id: string) => S.get('lore', id) as Lore | undefined;
export const primaryBook = (chat: Chat): Lore | undefined => { const c = charsOf(chat)[0]; return c?.loreIds?.length ? bookOf(c.loreIds[0]) : undefined; };
export function overrideOf(chat: Chat | null | undefined): CardOverride {
  if (!chat) return {};
  const e = primaryBook(chat)?.entries?.find(x => x.enabled === false && String(x.name || '').trim().toLowerCase() === '[config_override]');
  if (!e) return {};
  try {
    const j = JSON.parse(String(e.content || '')) as Obj; if (!j || typeof j !== 'object' || Array.isArray(j)) return {};
    const em = j['额外模型解析配置'] as Obj | undefined, cp = j['兼容性'] as Obj | undefined, mode = j['更新方式'];
    const bad = (mode !== undefined && mode !== '随AI输出' && mode !== '额外模型解析') || (em !== undefined && (typeof em !== 'object' || (em.启用自动请求 !== undefined && typeof em.启用自动请求 !== 'boolean') || (em.世界书条目白名单正则 !== undefined && typeof em.世界书条目白名单正则 !== 'string') || (em.世界书条目黑名单正则 !== undefined && typeof em.世界书条目黑名单正则 !== 'string')))
      || (cp !== undefined && (typeof cp !== 'object' || (cp.更新到聊天变量 !== undefined && typeof cp.更新到聊天变量 !== 'boolean') || (cp.sendas不视为user消息 !== undefined && typeof cp.sendas不视为user消息 !== 'boolean')));
    if (bad) return {};   // 원래 틀처럼: 알려진 칸이 틀렸으면 덮어쓰기 전체를 쓰지 않는다
    const o: CardOverride = {};
    if (mode !== undefined) o.mode = mode === '额外模型解析' ? 'extra' : 'inline';
    if (typeof em?.启用自动请求 === 'boolean') o.auto = em.启用自动请求;
    if (typeof em?.世界书条目白名单正则 === 'string' && em.世界书条目白名单正则.trim()) o.white = em.世界书条目白名单正则;
    if (typeof em?.世界书条目黑名单正则 === 'string' && em.世界书条目黑名单正则.trim()) o.black = em.世界书条目黑名单正则;
    if (typeof cp?.更新到聊天变量 === 'boolean') o.toChat = cp.更新到聊天变量;
    if (typeof cp?.sendas不视为user消息 === 'boolean') o.sendas = cp.sendas不视为user消息;
    return o;
  } catch { return {}; }
}
/** 이 대화에서 실제로 쓰는 설정 (카드가 정한 것이 앞선다. 걸러 낼 항목 이름 규칙은 둘 다 쓴다) */
export function eff(chat: Chat | null | undefined): MvuCfg & { cardWhite: string; cardBlack: string; card: CardOverride } {
  const c = cfg(), o = overrideOf(chat);
  return { ...c, mode: o.mode ?? c.mode, auto: o.auto ?? c.auto, toChat: o.toChat ?? c.toChat, sendas: o.sendas ?? c.sendas, cardWhite: o.white || '', cardBlack: o.black || '', card: o };
}

// ── 이 틀을 쓰는 대화인가 ──
const SIGNAL = /\bMvu\b|mag_variable|mag_command_parsed|registerMvuSchema|MagVarUpdate|mvu_zod|variable_zod/;
const uniq = (a: Lore[]) => { const seen = new Set<string>(); return a.filter(b => !!b && !seen.has(b.id) && (seen.add(b.id), true)); };
/** 초기 변수를 읽는 로어북 차례: 전역 → 캐릭터(주 로어북 먼저) → 대화 → 페르소나 */
export function initBooks(chat: Chat): Lore[] {
  const g = (S.settings.activeLore || []).map(bookOf), c = charsOf(chat).flatMap(ch => (ch.loreIds || []).map(bookOf)), ch = (chat.loreIds || []).map(bookOf), p = (S.persona(chat)?.loreIds || []).map(bookOf);
  return uniq([...g, ...c, ...ch, ...p].filter((b): b is Lore => !!b));
}
const hasInitEntry = (chat: Chat) => initBooks(chat).some(b => (b.entries || []).some(e => /\[initvar\]/i.test(String(e.name || ''))));
// 카드에 실린 스크립트가 이 틀을 부르면 그 카드의 대화에서 쓴다. 가져온 스크립트(전체에 켜 둔 것)가 부르면, 실리태번처럼 로어북이 붙은 대화에서만 쓴다
const scriptSignal = (chat: Chat) => charsOf(chat).some(ch => TH.charScripts(ch).some(s => s.enabled && SIGNAL.test(s.content))) || (TH.scripts.some(s => s.enabled && SIGNAL.test(s.content)) && initBooks(chat).length > 0);
export function usesMvu(chat: Chat | null | undefined, msgs?: Msg[]): boolean {
  if (!chat) return false;
  const list = msgs || (cur.chat === chat ? cur.msgs : []);
  return list.some(m => isMvu(varsOf(m))) || hasInitEntry(chat) || scriptSignal(chat);
}

// ── 메시지 변수 (답변 후보마다) ──
/** 원래 틀의 isMvuData: stat_data 와 schema 가 둘 다 있어야 변수가 있는 메시지로 본다 */
const isMvuData = (v: unknown): v is MvuData => !!v && typeof v === 'object' && (v as Obj).stat_data !== undefined && (v as Obj).schema !== undefined;
const dataOf = (m: Msg | undefined, sw?: number): MvuData | null => { const v = varsOf(m, sw); return isMvuData(v) ? v : null; };
/** [0, end) 안에서 변수가 있는 마지막 메시지 (원래 틀의 getLastValidMessageId) */
export function lastValidIndex(msgs: Msg[], end = msgs.length): number { for (let i = Math.min(end, msgs.length) - 1; i >= 0; i--) if (dataOf(msgs[i])) return i; return -1; }
export function lastValidData(msgs: Msg[], end: number): MvuData | undefined { const i = lastValidIndex(msgs, end); return i < 0 ? undefined : clone(dataOf(msgs[i])!); }
const clone = <T,>(v: T): T => v === undefined ? v : JSON.parse(JSON.stringify(v)) as T;
/** 최신 변수 (상태창 패널 · 매크로가 읽는 것) */
export function latestData(chat?: Chat | null): Obj | null {
  if (!chat || cur.chat !== chat) return null;
  const ms = cur.msgs, i = lastValidIndex(ms); return i >= 0 ? varsOf(ms[i]) as Obj : null;
}
/** 실리태번 도우미의 매크로 문맥: 지금 후보의 변수가 객체인 마지막 메시지 (변수 갱신 틀이 아닌 것도) */
export function latestVars(chat?: Chat | null): Obj | null {
  if (!chat || cur.chat !== chat) return null;
  const ms = cur.msgs; for (let i = ms.length - 1; i >= 0; i--) { const v = varsOf(ms[i]); if (v && typeof v === 'object') return v; } return null;
}
const KEYSET = new Set<string>(KEYS);
/** 원래 틀의 updater: 다섯 칸만 바꾸고 다른 칸은 둔다 */
function writeKeys(target: Obj, d: MvuData) {
  target.initialized_lorebooks = d.initialized_lorebooks; target.stat_data = d.stat_data;
  for (const k of ['schema', 'display_data', 'delta_data'] as const) { if (d[k] !== undefined) target[k] = d[k]; else delete target[k]; }
  return target;
}
const writeMsg = (m: Msg, d: MvuData, sw?: number) => setVarsOf(m, writeKeys({ ...(varsOf(m, sw) || {}) }, d), sw);
function writeChat(chat: Chat, d: MvuData) { chat.vars ||= {}; writeKeys(chat.vars as unknown as Obj, d); }

// ── 갱신에 넘기는 바깥 ──
const ctxOf = (chat: Chat) => { const chars = charsOf(chat); return makeCtx({ chat, char: chars[0], chars, persona: S.persona(chat), msgs: cur.chat === chat ? cur.msgs : [] }); };
let extraNow = false;
export const isDuringExtra = () => extraNow;
export function hostFor(chat: Chat): Host {
  return {
    emit: (ev, ...args) => invokeFrames(ev, args),
    macros: text => macro(text, ctxOf(chat)),
    warn: (title, detail) => { if (eff(chat).notifyErr) toast(`${title}\n${detail}`, 'err'); },
    tr: (k, p) => t('mvu.err.' + k, p),
  };
}
export const mxOf = (chat: Chat) => (s: string) => macro(s, ctxOf(chat));
const onInitError = (book: string, entry: string, err: Error) => toast(t('mvu.toast.initBad', { book, entry, err: String(err.message || err).split('\n')[0] }), 'err');

/** 이 대화의 초기 자료 (로어북의 [InitVar] 항목들) — 점검 도구용 */
export async function initOf(chat: Chat): Promise<{ data: MvuData; updated: boolean }> {
  const R = await runtime(), data = R.createEmptyGameData();
  const updated = R.loadInitVarData(data, initBooks(chat), mxOf(chat), onInitError);
  R.finishInit(data, updated);
  return { data, updated };
}

// ── 차례로 돌리기 (한 대화의 일은 하나씩) ──
const queues = new Map<string, Promise<unknown>>();
function enqueue<T>(chat: Chat, fn: () => Promise<T>): Promise<T> {
  const prev = queues.get(chat.id) || Promise.resolve();
  const p = prev.then(fn, fn); queues.set(chat.id, p.catch(() => undefined)); return p;
}
const inflight = new Map<string, Set<Promise<unknown>>>();
function track<T>(chat: Chat, p: Promise<T>): Promise<T> {
  const set = inflight.get(chat.id) || new Set(); inflight.set(chat.id, set); set.add(p);
  void p.finally(() => set.delete(p)).catch(() => undefined); return p;
}
/** 이 대화에서 돌고 있는 변수 갱신(추가 호출 포함)이 다 끝날 때 */
export async function pending(chat?: Chat | null): Promise<void> {
  if (!chat) return;
  for (let n = 0; n < 5; n++) {
    const all = [queues.get(chat.id) || Promise.resolve(), ...(inflight.get(chat.id) || [])];
    await Promise.all(all.map(p => p.catch(() => undefined)));
    if (!(inflight.get(chat.id)?.size)) return;
  }
}
const live = (chat: Chat, msgs: Msg[]) => cur.chat === chat && cur.msgs === msgs;
/** 화면들에 바뀐 메시지 변수를 알린다 */
export function pushFrames() { framePost({ dlState: { mvuExtra: extraNow } }); emit('mvu:updated'); }
async function commit(chat: Chat, msgs: Msg[]) { if (live(chat, msgs)) { await chatApi.save(); chatApi.redraw?.(); } pushFrames(); }

// ── 원래 틀의 initCheck: 새 대화의 변수 채우기 · 나중에 붙은 로어북의 초기 변수 합치기 ──
async function initCheck(R: R, chat: Chat, msgs: Msg[]): Promise<boolean> {
  if (!msgs.length) { toast(t('mvu.toast.needGreeting'), 'err'); return false; }
  const variables: MvuData = lastValidData(msgs, msgs.length) ?? R.createEmptyGameData();
  if (!variables.initialized_lorebooks) variables.initialized_lorebooks = {};
  if (Array.isArray(variables.initialized_lorebooks)) variables.initialized_lorebooks = Object.fromEntries((variables.initialized_lorebooks as string[]).map(n => [n, []]));
  if (!variables.stat_data) variables.stat_data = {};
  if (!variables.schema) variables.schema = { extensible: false, properties: {}, type: 'object' };
  const books = initBooks(chat), updated = R.loadInitVarData(variables, books, mxOf(chat), onInitError);
  R.finishInit(variables, updated);
  if (!updated) return false;
  const E = eff(chat), host = hostFor(chat);
  if (E.toChat) Object.assign((chat.vars ||= {}) as unknown as Obj, clone(variables));
  if (msgs.length - 1 === 0) {
    // 첫 메시지만 있는 새 대화: 첫 인사의 후보마다 따로 채운다 (후보의 <initvar> 블록이 있으면 그것이 바탕)
    const m = msgs[0];
    for (let idx = 0; idx < m.swipes.length; idx++) {
      const text = m.swipes[idx].text || '';
      const cur0 = R.lo.correctlyMerge(clone(varsOf(m, idx) || {}), clone(variables)) as MvuData;
      const greet = R.greetingInitVar(text, mxOf(chat));
      if (greet) {
        cur0.stat_data = greet;
        cur0.initialized_lorebooks = { [primaryBook(chat)?.name || 'unknown']: [] };
        R.loadInitVarData(cur0, books, mxOf(chat), onInitError);
      }
      await host.emit(EV.INIT, cur0, idx);
      await R.updateVariables(text, cur0, undefined, host);
      setVarsOf(m, cur0, idx);
    }
  } else setVarsOf(msgs[msgs.length - 1], variables);   // 이어지던 대화: 마지막 메시지에 얹는다
  if (E.notifyInit) toast(t('mvu.toast.init', { books: Object.keys(variables.initialized_lorebooks || {}).join(', ') || '-' }));
  return true;
}

// ── 게임 모드와 잇기 (game/vars.ts · features/game 이 채운다. 비어 있으면 아무 일도 없다) ──
/** reply: 진행자의 답변 하나를 계산할 때, 그 답변의 게임 표시를 이어 둔 변수의 갱신 명령으로 바꿔 준다.
 *  touched 는 답변 자신의 갱신 명령이 건드린 경로들 — 겹침 규칙(같은 값을 둘 다 바꾸면 변수 명령만 쓴다)은 게임 쪽이 이것으로 지킨다.
 *  has: 이 답변에 게임 쪽 일이 있는가 (글이 짧아도 계산하게) */
export const gameLink: { reply?: (chat: Chat, msgs: Msg[], i: number, stat: Obj, touched: () => string[][]) => string; has?: (chat: Chat, msg: Msg) => boolean } = {};
const GAME_OPEN = '\n\n<UpdateVariable>\n', GAME_CLOSE = '\n</UpdateVariable>';

// ── 원래 틀의 handleVariablesInMessage: 한 메시지를 앞 상태에서 계산한다 ──
async function handle(R: R, chat: Chat, msgs: Msg[], i: number): Promise<void> {
  const m = msgs[i], sw = m?.swipes[m.sw]; if (!m || !sw) return;
  const text = sw.text || '';
  if (m.role === 'assistant' && text.length < 5 && !gameLink.has?.(chat, m)) return;
  const variables = lastValidData(msgs, i === 0 ? 1 : i);
  if (!variables || variables.stat_data === undefined) return;
  const host = hostFor(chat);
  // 게임 모드: 답변의 게임 표시에서 나온 명령을 답변의 명령 뒤에 붙여 한 번에 계산한다 (이벤트 · 규칙 스크립트가 한 번만 돈다). 글에는 남기지 않는다
  let extra = '';
  if (m.role === 'assistant' && gameLink.reply) { try { extra = gameLink.reply(chat, msgs, i, variables.stat_data as Obj, () => R.extractCommands(host.macros(text)).map(c => R.lo.toPath(c.reason === 'json_patch' ? c.args[0] : R.pathFix(R.trimQuotesAndBackslashes(c.args[0]))))); } catch (e) { console.warn('[변수 갱신] 게임', e); } }
  await R.updateVariables(extra ? text + GAME_OPEN + extra + GAME_CLOSE : text, variables, undefined, host);
  if (m.role !== 'user') {
    const now0 = sw.text || '';
    const ctx = { variables, message_content: now0 };
    await host.emit(EV.BEFORE, ctx);
    const data = ctx.variables && typeof ctx.variables === 'object' ? ctx.variables : variables;
    Object.assign(variables, data);
    let nt = ctx.message_content !== now0 && typeof ctx.message_content === 'string' ? ctx.message_content : (sw.text || '');
    if (!nt.includes(HOLDER)) nt += '\n\n' + HOLDER;
    if (nt.includes('<status_current_variable>')) nt = nt.replace(/<(status_current_variable)>(?:(?!<\1>).)*<\/\1?>/gis, '');
    if (nt !== sw.text) { sw.text = nt; delete sw.tr; }
  }
  if (eff(chat).toChat) writeChat(chat, variables);
  writeMsg(m, variables);
}

// ── 대화를 열 때 · 생성 전 · 보낸 뒤 ──
/** 대화를 열 때: 대화 변수 정리 · 옛 대화 정리 묻기 · 변수 채우기 (카드 스크립트가 다 실린 뒤) */
export function opened(chat: Chat | null | undefined): Promise<void> {
  if (!chat || cur.chat !== chat || !usesMvu(chat)) return Promise.resolve();
  const msgs = cur.msgs;
  return enqueue(chat, async () => {
    await TH.scriptsReady();
    if (!live(chat, msgs)) return;
    const R = await runtime(), E = eff(chat);
    let changed = false;
    if (!E.toChat && chat.vars) { const v = chat.vars as unknown as Obj; for (const k of KEYS) if (k in v) { delete v[k]; changed = true; } }
    if (await legacyCleanup(chat, msgs)) changed = true;
    if (await initCheck(R, chat, msgs)) changed = true;
    if (await restore(R, chat, msgs)) changed = true;   // 드림랜드 덧붙임: 정리된 옛 메시지에서 이어 가는 대화(가지치기 등)도 최근 변수를 되살린다
    if (changed) await commit(chat, msgs);
  });
}
/** 생성 전 (원래 틀은 GENERATION_STARTED 에서 initCheck) */
export function beforeGenerate(chat: Chat | null | undefined): Promise<void> {
  if (!chat || cur.chat !== chat || !usesMvu(chat)) return Promise.resolve();
  const msgs = cur.msgs;
  return enqueue(chat, async () => { const R = await runtime(); if (live(chat, msgs) && await initCheck(R, chat, msgs)) await commit(chat, msgs); });
}
/** 내가 보낸 메시지 (원래 틀은 MESSAGE_SENT 에서 initCheck 다음 handleVariablesInMessage) */
export function sent(chat: Chat | null | undefined, msg: Msg | undefined): Promise<void> {
  if (!chat || cur.chat !== chat || !msg || !usesMvu(chat)) return Promise.resolve();
  const msgs = cur.msgs;
  return enqueue(chat, async () => {
    const R = await runtime(); if (!live(chat, msgs)) return;
    await initCheck(R, chat, msgs);
    const i = msgs.indexOf(msg); if (i >= 0) await handle(R, chat, msgs, i);
    await commit(chat, msgs);
  });
}

// ── 오래된 메시지의 변수 정리 (원래 틀의 자동 정리) ──
/** [start, end] 안에서 snapEvery 의 배수 자리는 기준점으로 남기고 나머지의 변수 칸을 지운다. 지운 메시지 수 */
export function cleanupRange(msgs: Msg[], start: number, end: number, every: number, keepLorebooks = false): number {
  let n = 0;
  msgs.slice(Math.max(0, start), end + 1).forEach((m, k) => {
    if (!m.swipes.some((_s, i) => varsOf(m, i) !== undefined)) return;
    let counted = false;
    m.swipes.forEach((_s, i) => {
      const v = varsOf(m, i);
      if (v === undefined) { setVarsOf(m, {}, i); S.touchMsgs(m); return; }
      if (v.snapshot === true) return;
      if ((start + k) % every === 0) { v.snapshot = true; S.touchMsgs(m); return; }
      if (!counted) { counted = true; n++; }
      const o = { ...v }; for (const key of KEYS) if (!(keepLorebooks && key === 'initialized_lorebooks')) delete o[key]; setVarsOf(m, o, i); S.touchMsgs(m);
    });
  });
  return n;
}
async function cleanupAfter(chat: Chat, msgs: Msg[], i: number) {
  const E = eff(chat); if (!E.cleanup || msgs.length % 5 !== 0) return;
  const old = i - E.keepRecent;
  if (old > 0) cleanupRange(msgs, Math.max(1, old - 2 - E.keepRecent * 2), old, Math.max(1, E.snapEvery));
}
const restoreWarned = new Set<string>();
/** 메시지를 지운 뒤: 최근 메시지에 변수가 없으면 기준점부터 다시 계산해 되살린다 (원래 틀의 restoreVariables) */
async function restore(R: R, chat: Chat, msgs: Msg[]): Promise<boolean> {
  const E = eff(chat), last = msgs.length - 1; if (last < 1) return false;
  const lastN = Math.max(1, last - E.restoreRecent);
  // 주사위 · 안내 같은 시스템 메시지는 원래 변수를 갖지 않으므로 '변수가 빠진 메시지'로 치지 않는다
  let missing = -1; for (let i = last; i >= 0; i--) { const m = msgs[i]; if (m.role === 'system' || m.dice) continue; const v = varsOf(m); if (!v || v.stat_data === undefined || v.schema === undefined) { missing = i; break; } }
  if (lastN > missing) return false;
  const keepFrom = Math.max(1, last - E.keepRecent), snap = lastValidIndex(msgs, keepFrom);
  // 되살릴 기준점이 없다는 알림은 한 방에서 한 번만 (지울 때마다 다시 띄우지 않는다)
  if (snap === -1) { if (!restoreWarned.has(chat.id)) { restoreWarned.add(chat.id); toast(t('mvu.toast.restoreNone', { n: keepFrom })); } return false; }
  let variables = clone(dataOf(msgs[snap])!), changed = false;
  for (let i = snap + 1; i <= missing; i++) {
    await R.updateVariables(msgText(msgs[i]), variables, undefined, hostFor(chat));
    if (i >= keepFrom && !dataOf(msgs[i])) { writeMsg(msgs[i], variables); variables = clone(variables); changed = true; }
  }
  return changed;
}
let restoreTimer = 0;
/** 지운 뒤 2초 기다렸다가 (원래 틀처럼) 되살리기 */
export function deleted(chat: Chat | null | undefined) {
  if (!chat || cur.chat !== chat || !usesMvu(chat)) return;
  clearTimeout(restoreTimer);
  restoreTimer = window.setTimeout(() => { const msgs = cur.msgs; if (cur.chat !== chat) return; void enqueue(chat, async () => { const R = await runtime(); if (live(chat, msgs) && await restore(R, chat, msgs)) await commit(chat, msgs); }); }, 2000);
}
/** 옛 대화(오래 이어진 대화)를 처음 열 때 한 번: 정리할지 묻는다 */
async function legacyCleanup(chat: Chat, msgs: Msg[]): Promise<boolean> {
  const E = eff(chat), v1 = varsOf(msgs[1], 0);
  if (!E.cleanup || msgs.length <= E.keepRecent + 5 || !v1 || v1.stat_data === undefined || v1.ignore_cleanup !== undefined) return false;
  const { askLegacyCleanup } = await import('./Ui');
  const pick = await askLegacyCleanup();
  if (pick !== 'clean' && pick !== 'backup') { v1.ignore_cleanup = true; return true; }
  if (pick === 'backup') { const { chatToStJsonl } = await import('../lib/cards'); const { download } = await import('../lib/core'); download(`${chat.name || chat.id}.jsonl`, chatToStJsonl(chat, msgs, S.persona(chat)?.name || 'User', charsOf(chat)[0]?.name || 'Character'), 'application/jsonl'); }
  const n = cleanupRange(msgs, 1, msgs.length - 1 - E.keepRecent, Math.max(1, E.snapEvery));
  if (n > 0) toast(t('mvu.toast.cleaned', { n }));
  return true;
}

// ── 추가 호출 (따로 한 번 더 물어 변수 갱신 받기) ──
const TASK = `<must>
Variable update task:
  description: Stop role-playing right now. Do not continue, retell or rewrite the story. Your only job is to update the variables, following the given rules and format.
  reference: <past_observe> holds the latest part of the story. The variable values given earlier are the values from BEFORE that part happened.
  rule: As a neutral narrator, work out how the variables change after the story in <past_observe>, then output the update commands exactly as the variable update rules describe.
  format: |-
    $(output nothing except the <UpdateVariable> block)
    <UpdateVariable>
    ...$(follow the <UpdateVariable> format the rules already define)
    </UpdateVariable>
</must>`;
const HEAD = 'You keep the tracked variables of an interactive story up to date. You never write story text. Read the story information and the latest part of the story, then output only the variable update block that the rules ask for.';
const USER_INPUT = '遵循<must>指令';
const compileRx = (v: string): RegExp | undefined => { const s = String(v || '').trim(); if (!s) return; try { if (s.startsWith('/')) { const end = s.lastIndexOf('/'); if (end > 0) return new RegExp(s.slice(1, end), s.slice(end + 1)); } return new RegExp(s); } catch { toast(t('mvu.toast.badRegex', { rx: s }), 'err'); return; } };
const UPD = /\[mvu_update\]/i, PLOT = /\[mvu_plot\]/i;
/** [mvu_update] · [mvu_plot] 표식과 이름 규칙으로 로어북 항목을 거른다 (원래 틀의 filterEntries). extra: 추가 호출의 프롬프트인가 */
export function filterBooks(books: Lore[], chat: Chat, extra: boolean): Lore[] {
  const E = eff(chat); if (E.mode !== 'extra') return books;
  const charIds = new Set(charsOf(chat).flatMap(c => c.loreIds || [])), primary = primaryBook(chat);
  const supported = new Set<string>(), tagged = (b: Lore) => (b.entries || []).some(e => UPD.test(String(e.name || '')) || PLOT.test(String(e.name || '')));
  const drop = (name: string) => { const u = UPD.test(name), p = PLOT.test(name); return extra ? p && !u : !p && u; };
  const supportedOn = !!primary && tagged(primary);
  const white = [compileRx(E.white), compileRx(E.cardWhite)].filter((x): x is RegExp => !!x), black = [compileRx(E.black), compileRx(E.cardBlack)].filter((x): x is RegExp => !!x);
  const test = (rx: RegExp, s: string) => { rx.lastIndex = 0; return rx.test(s); };
  const out: Lore[] = [];
  for (const b of books) { if (tagged(b)) supported.add(b.id); }
  for (const b of books) {
    const isChar = charIds.has(b.id);
    if (!isChar && !supportedOn) { out.push(b); continue; }   // 캐릭터 로어북이 표식을 쓰지 않으면 다른 로어북은 그대로
    if (!isChar && extra && !supported.has(b.id)) continue;   // 추가 호출에는 표식을 쓰는 로어북만
    let entries = (b.entries || []).filter(e => !drop(String(e.name || '')));
    if (extra && supportedOn && (white.length || black.length)) entries = entries.filter(e => { const n = String(e.name || ''); if (UPD.test(n)) return true; if (white.length && !white.some(r => test(r, n))) return false; return !black.some(r => test(r, n)); });
    out.push(entries.length === (b.entries || []).length ? b : { ...b, entries });
  }
  return out;
}


/** 실리태번처럼 깊이로 끼워 넣는다: 0 = 대화 맨 뒤, 1 = 마지막 메시지 앞 … */
function injectAtDepth(list: PromptList, items: { depth: number; msg: PromptMsg }[]): PromptList {
  const out = [...list] as PromptList; const hist = out.map((m, k) => m.src === 'history' ? k : -1).filter(k => k >= 0);
  for (const it of [...items].sort((a, b) => a.depth - b.depth)) {
    const at = hist.length ? (it.depth === 0 ? hist[hist.length - 1] + 1 : hist[Math.max(0, hist.length - it.depth)]) : out.length;
    out.splice(at, 0, it.msg); for (let k = 0; k < hist.length; k++) if (hist[k] >= at) hist[k]++;
  }
  out.tc = list.tc; return out;
}
const strip = (s: string) => s.replaceAll('\n' + HOLDER, '').replaceAll(HOLDER, '');
/** 이번 추가 호출에 보낼 글 (프롬프트 꼴에 따라) */
function extraPrompt(chat: Chat, msgs: Msg[], i: number, task: string, E: ReturnType<typeof eff>): PromptList {
  const chars = charsOf(chat), char = chars[0], persona = S.persona(chat);
  const recent = msgs.slice(Math.max(0, i + 1 - Math.max(1, E.history)), i + 1);
  if (E.prompt === 'preset' || E.prompt === 'other') {
    // 지금(또는 고른) 프리셋의 꼴 그대로: 최근 메시지 몇 개 + "<must> 따르기" 사용자 말, 깊이 2 · 1 에 <past_observe> 표시, 맨 끝에 할 일
    const preset = (E.prompt === 'other' && S.get('presets', E.otherPreset)) || S.presetFor(chat);
    const built = buildPrompt({ chat, char, chars, persona, preset, msgs: [...recent, newMsg('user', USER_INPUT)], type: 'normal', commit: false });
    const list = injectAtDepth(built.messages, [{ depth: 0, msg: { role: 'system', content: task } }, { depth: 2, msg: { role: 'system', content: '<past_observe>' } }, { depth: 1, msg: { role: 'system', content: '</past_observe>' } }]);
    for (const m of list) if (typeof m.content === 'string') m.content = strip(m.content);
    return list;
  }
  const ctx = makeCtx({ chat, char, chars, persona, msgs: msgs.slice(0, i + 1) });
  const hist = recent.filter(m => !m.hidden).map((m, k, a) => ({ role: m.role === 'system' ? 'system' : m.role, content: strip(applyRegex(msgText(m), { who: m.role === 'user' ? 'user' : 'ai', target: 'prompt', depth: a.length - 1 - k, charId: m.charId, ctx })), src: 'history' }) as PromptMsg);
  let lore: string[] = [];
  try { lore = scanLore(filterBooks(activeBooks(chat, chars, persona), chat, true), hist, ctx, { commit: false, char, persona }).map(e => strip(e.text)); } catch (e) { console.warn('[변수 갱신] 로어북', e); }
  const sys = (content: string): PromptMsg => ({ role: 'system', content });
  const list: PromptMsg[] = [sys(HEAD), sys('<additional_information>'), ...(persona?.description ? [sys(macro(persona.description, ctx))] : []), ...(char ? [sys(macro(char.description, ctx))] : []), ...lore.map(sys), sys('</additional_information>'), sys('<past_observe>'), ...hist, sys('</past_observe>'), sys(task), { role: 'user', content: USER_INPUT }];
  return list.filter(m => String(m.content || '').trim()) as PromptList;
}
const FORMAT_JSON = '\n You are in formatted-output mode. Do not output <UpdateVariable> tags, markdown, or prose. Return only a JSON object matching the provided json_schema: {"analysis":"...","json_patch":[...]}. Put MVU JsonPatch dialect operations in `json_patch`.';
/** 추가 호출 한 번: 받은 답을 갱신 블록으로. 못 받으면 던진다 */
async function askOnce(R: R, chat: Chat, list: PromptList, E: ReturnType<typeof eff>, signal: AbortSignal, validate?: (b: string) => Promise<string | null>): Promise<string> {
  const conn = S.helperConn('mvu', chat); if (!conn) throw new Error(t('mvu.toast.noConn'));
  const structured: Structured | undefined = E.format === 'tool' ? { tool: R.MVU_TOOL } : E.format === 'json' ? { json: { name: R.MVU_JSON_PATCH_RESPONSE_SCHEMA.name, schema: R.MVU_JSON_PATCH_RESPONSE_SCHEMA.value as Obj } } : E.format === 'json_v4' ? { jsonObject: true } : undefined;
  const P = { ...S.presetFor(chat).params, stream: false, maxTokens: E.maxTokens, prefill: '', stop: [], lowThink: true, ...(structured ? { structured } : {}) };
  const r = await streamChat(conn, P, list, { signal, label: 'mvu' });
  let out = r.text;
  if (E.format === 'tool') out = R.extractFromToolArgs(r.tool) ?? r.text;
  else if (E.format === 'json' || E.format === 'json_v4') out = R.extractFromFormattedOutput(r.text) ?? r.text;
  if (validate) {
    let block = out;
    if (!R.extractCommands(block).length) { try { block = R.parseAndValidateExtraModelResult(out) ?? out; } catch { /* 그대로 검사 */ } }
    const bad = await validate(block); if (bad) throw new Error(bad); return block;
  }
  const block = R.parseAndValidateExtraModelResult(out);
  if (!block) throw new Error(t('mvu.toast.noBlock'));
  return block;
}
/** 추가 호출 (설정한 부르는 법대로 다시 해 보거나 여러 번 함께). 못 받으면 null */
export async function askExtra(chat: Chat, msgs: Msg[], i: number, o: { task?: string; tail?: string; validate?: (block: string) => Promise<string | null> } = {}): Promise<string | null> {
  const R = await runtime(), E = eff(chat);
  if (!S.helperConn('mvu', chat)) { toast(t('mvu.toast.noConn'), 'err'); return null; }
  let task = (o.task || TASK) + (o.tail ? '\n' + o.tail : '');
  if (E.format === 'tool') task += `\n use \`${R.MVU_TOOL_NAME}\` tool to update variables.`;
  else if (E.format === 'json') task += FORMAT_JSON;
  else if (E.format === 'json_v4') task += '\n You are in formatted-output mode. Do not output <UpdateVariable> tags, markdown, or prose. Return only a JSON object: {"analysis":"...","json_patch":[...]}. Put MVU JsonPatch dialect operations in `json_patch`. Return exactly one JSON object that conforms to this schema:' + JSON.stringify(R.MVU_JSON_PATCH_RESPONSE_SCHEMA.value);
  extraNow = true; setExtraFlag(chat, true); pushFrames();
  let last: unknown = null;
  try {
    const list = extraPrompt(chat, msgs, i, task, E), n = Math.max(1, E.tries);
    const one = (ac: AbortController) => askOnce(R, chat, list, E, ac.signal, o.validate);
    const together = async (k: number) => { const acs = Array.from({ length: k }, () => new AbortController()); try { return await Promise.any(acs.map(one)); } finally { for (const a of acs) a.abort(); } };
    if (E.strategy === 'parallel') { try { return await together(n); } catch (e) { last = e instanceof AggregateError ? e.errors.at(-1) : e; } }
    else if (E.strategy === 'oneThenParallel') {
      try { return await one(new AbortController()); } catch (e) { last = e; }
      if (n > 1) { try { return await together(n - 1); } catch (e) { last = e instanceof AggregateError ? e.errors.at(-1) : e; } }
    } else for (let k = 0; k < n; k++) { try { return await one(new AbortController()); } catch (e) { last = e; } }
  } finally { extraNow = false; setExtraFlag(chat, false); pushFrames(); }
  toast(t('mvu.toast.extraFail', { err: String((last as Error)?.message || last || '').split('\n')[0].slice(0, 200) }), 'err');
  return null;
}
/** 전역 변수 extra_analysis (카드의 템플릿이 추가 호출 중인지 본다) */
function setExtraFlag(chat: Chat, on: boolean) { if (!usesMvu(chat)) return; const g = (S.settings.globalVars ||= {}) as Record<string, unknown>; g.extra_analysis = on; }
/** 로어북 거르기가 지금 추가 호출 중인가 (프리셋 꼴로 프롬프트를 만들 때) */
export const extraPhase = () => extraNow;

// ── 답을 받은 뒤 (원래 틀의 onMessageReceived · 자동 정리) ──
const isSendas = (chat: Chat, m: Msg) => m.role === 'assistant' && !!m.charId && !(chat.charIds || []).includes(m.charId);
export function onReceived(chat: Chat, msgs: Msg[], msg: Msg, force = false): Promise<void> {
  if (!usesMvu(chat, msgs)) return Promise.resolve();
  return track(chat, received(chat, msgs, msg, force));
}
async function received(chat: Chat, msgs: Msg[], msg: Msg, force: boolean): Promise<void> {
  const i = msgs.indexOf(msg); if (i < 0) return;
  const E = eff(chat), sw = msg.swipes[msg.sw], text = sw?.text || '';
  if (!E.sendas && isSendas(chat, msg)) return;
  if (text.length < 5 && !gameLink.has?.(chat, msg)) return;
  const R = await runtime();
  if (E.mode === 'extra') {
    if (msgs.length <= 1) return;
    if (!force) {
      const trig = compileRx(E.trigger);
      if (!E.auto) return;
      if (E.minLen > 0 && Array.from(text.trim()).length < E.minLen) { toast(t('mvu.toast.short')); return; }
      if (trig && !trig.test(text)) { toast(t('mvu.toast.noTrigger')); return; }
    }
    await (queues.get(chat.id) || Promise.resolve());
    const live0 = cur.chat === chat; if (live0) chatApi.setStatus(t('mvu.status.extra'));
    try { const block = await askExtra(chat, msgs, i); if (block && sw) sw.text = (sw.text || '').trimEnd() + '\n\n' + block; }
    finally { if (live0) chatApi.setStatus(''); }
  }
  if (cur.chat !== chat) return;
  await enqueue(chat, async () => { try { await handle(R, chat, msgs, i); await cleanupAfter(chat, msgs, i); } catch (e) { console.error('[변수 갱신]', e); } pushFrames(); });
}

// ── 게임 모드가 만든 일 (전투 · 판정 기록, 시트에서 손으로 고친 값) ──
/** msg 의 변수를 make 가 준 명령으로 계산해 적는다: 앞 상태에서 (onTop 이면 그 메시지의 지금 변수 위에). 명령이 비어도 앞 상태를 그 메시지에 적는다.
 *  변수 갱신 틀의 같은 길(updateVariables)로 들어가므로 규칙 스크립트 · 이벤트 · 상태창이 그대로 따라온다. 변수가 없으면 false */
export function applyTo(chat: Chat | null | undefined, msg: Msg, make: (stat: Obj) => string, onTop = false): Promise<boolean> {
  if (!chat || cur.chat !== chat || !usesMvu(chat)) return Promise.resolve(false);
  const msgs = cur.msgs;
  return enqueue(chat, async () => {
    const i = msgs.indexOf(msg); if (!live(chat, msgs) || i < 0) return false;
    const own = onTop ? dataOf(msg) : null, base = own ? clone(own) : lastValidData(msgs, i); if (!base || base.stat_data === undefined) return false;
    const R = await runtime(), text = make(base.stat_data as Obj);
    if (text) await R.updateVariables(text, base, undefined, hostFor(chat));
    if (eff(chat).toChat) writeChat(chat, base);
    writeMsg(msg, base); await commit(chat, msgs); return true;
  });
}
/** 메시지 하나를 앞 상태에서 다시 계산한다 (운명 점으로 판정을 뒤집어 그 답변의 갈래가 바뀌었을 때) */
export function recalc(chat: Chat | null | undefined, msg: Msg): Promise<void> {
  if (!chat || cur.chat !== chat || !usesMvu(chat)) return Promise.resolve();
  const msgs = cur.msgs;
  return enqueue(chat, async () => { const i = msgs.indexOf(msg); if (!live(chat, msgs) || i < 0) return; const R = await runtime(); await handle(R, chat, msgs, i); await commit(chat, msgs); });
}
/** 이 대화(지금 연 대화)에 메시지 변수가 있는가 */
export const hasData = (chat: Chat | null | undefined) => !!chat && cur.chat === chat && lastValidIndex(cur.msgs) >= 0;

// ── 손으로 하는 일 (장면 패널의 단추) ──
const lastIdx = () => cur.msgs.length - 1;
/** 마지막 메시지의 변수를 지우고 다시 계산 (원래 틀의 "重新处理变量") */
export async function reprocessLast() {
  const chat = cur.chat; if (!chat || lastIdx() < 1) return;
  const msgs = cur.msgs, m = msgs[lastIdx()];
  await enqueue(chat, async () => {
    const R = await runtime(), v = { ...(varsOf(m) || {}) }; for (const k of ['stat_data', 'delta_data', 'display_data', 'schema']) delete v[k]; setVarsOf(m, v);
    await handle(R, chat, msgs, msgs.indexOf(m)); await commit(chat, msgs);
  });
  toast(t('mvu.toast.redone'));
}
/** 로어북의 초기 변수를 다시 읽어 마지막 메시지의 변수에 합친다 (설명 글도 새것으로) */
export async function reloadInit() {
  const chat = cur.chat; if (!chat) return;
  const ms = cur.msgs, li = lastValidIndex(ms, ms.length); if (li < 0) return toast(t('mvu.toast.noData'), 'err');
  await enqueue(chat, async () => {
    const R = await runtime(), base = R.createEmptyGameData();
    if (!R.loadInitVarData(base, initBooks(chat), mxOf(chat), onInitError)) { toast(t('mvu.toast.noInit'), 'err'); return; }
    R.reconcileAndApplySchema(base); R.cleanUpMetadata(base.stat_data);
    const old = dataOf(ms[li])!, merged: MvuData = { stat_data: R.lo.merge({}, base.stat_data, old.stat_data), schema: R.lo.merge({}, old.schema, base.schema), initialized_lorebooks: R.lo.merge({}, base.initialized_lorebooks, old.initialized_lorebooks), delta_data: old.delta_data };
    merged.display_data = R.lo.clone(merged.stat_data);
    R.updateDescriptions('', base.stat_data, old.stat_data, merged.stat_data);
    R.reconcileAndApplySchema(merged); R.cleanUpMetadata(merged.stat_data);
    setVarsOf(ms[ms.length - 1], merged);
    if (eff(chat).toChat) setChatAll(chat, merged);
    await commit(chat, ms);
    toast(t('mvu.toast.reloaded'));
  });
}
function setChatAll(chat: Chat, d: MvuData) { chat.vars = clone(d) as never; }
/** 추가 호출을 다시: 마지막 갱신 블록을 떼고 앞 상태로 돌린 뒤 다시 물어본다 */
export async function retryExtra() {
  const chat = cur.chat; if (!chat) return;
  if (eff(chat).mode !== 'extra') return toast(t('mvu.toast.notExtra'));
  const ms = cur.msgs, m = ms[lastIdx()]; if (!m) return;
  const sw = m.swipes[m.sw], s = sw.text || '', b = s.lastIndexOf('<UpdateVariable>');
  if (b >= 0) {
    const e = s.lastIndexOf('</UpdateVariable>'); sw.text = e < 0 ? s.slice(0, b) : s.slice(0, b) + s.slice(e + 17);
    const pi = lastValidIndex(ms, lastIdx());   // 이 메시지의 변수를 앞 상태로 (로어북이 이 메시지의 변수를 읽으므로 지우지는 않는다)
    if (pi >= 0) { const prev = clone(dataOf(ms[pi])!); setVarsOf(m, { ...(varsOf(m) || {}), stat_data: prev.stat_data, delta_data: prev.delta_data, display_data: prev.display_data, schema: prev.schema }); }
  }
  await onReceived(chat, ms, m, true);
  await commit(chat, ms);
  toast(t('mvu.toast.retried'));
}
/** 빠진 갱신 고치기: 이번 답변 뒤의 상태를 보여 주고 빠진 것만 더 받는다. 미리 시험해 보고, 확인을 받은 뒤 덧붙인다 */
export async function repairLast(direction: string, confirm: (cmds: string[], block: string) => Promise<boolean>) {
  const chat = cur.chat; if (!chat) return;
  if (eff(chat).mode !== 'extra') return toast(t('mvu.toast.notExtra'));
  const ms = cur.msgs, i = lastIdx(), m = ms[i], now = dataOf(m), prev = lastValidData(ms, i);
  if (i < 1 || m.role !== 'assistant' || !now || !prev) return toast(t('mvu.toast.noRepair'), 'err');
  const R = await runtime(), changes = R.collectStateChanges(prev.stat_data, now.stat_data), host = hostFor(chat);
  const task = `<must>\n<incremental_repair_directive>\nThis is an incremental correction, not a full retry.\n- The current variables are the values AFTER this reply and its updates were applied, not before.\n- <past_observe> holds the latest story and the original update. The list below only shows what already changed in this reply.\n- The variable rules and lorebook still decide. The user's focus only says where to look first; it cannot invent story facts or override the rules.\n- Only add updates that were missed, or fix ones that clearly contradict the latest story or the rules. Never repeat a change that is already correct.\n- Work from the current state; do not recalculate or overwrite all variables. Use insert only where the rules allow new fields, and remove only fields that are clearly wrong. If unsure, change nothing.\n- Output only one <UpdateVariable><JSONPatch>...</JSONPatch></UpdateVariable>. If nothing needs fixing, output an empty JSONPatch array.\n</incremental_repair_directive>\n<incremental_repair_context>\nChanges already applied in this reply:\n${R.formatStateChanges(changes)}\n</incremental_repair_context>\n</must>`;
  const tail = `<incremental_repair_final_check>\nFocus on what the user pointed out first, without going beyond the variable rules and the story facts.\n<user_focus>${direction.trim().slice(0, 500) || '(no focus given: check for missed and clearly wrong updates)'}</user_focus>\nKeep only the needed incremental operations against the current state. Do not repeat correct updates. No explanation outside the block.\n</incremental_repair_final_check>`;
  chatApi.setStatus(t('mvu.status.repair'));
  let block: string | null = null, trial: MvuData | null = null;
  try {
    block = await askExtra(chat, ms, i, { task, tail, validate: async b => { const tv = clone(now), errs: string[] = []; const mod = await R.updateVariables(b, tv, errs, host); if (errs.length) return errs.join('\n'); if (!mod) return t('mvu.toast.noChange'); trial = tv; return null; } });
  } finally { chatApi.setStatus(''); }
  if (!block || !trial || cur.chat !== chat || cur.msgs[i] !== m) return;
  if (!(await confirm(R.extractCommands(block).map(c => c.full_match), block))) return;
  // 원래 틀처럼: 시험해 본 결과를 이 메시지의 변수로 · 블록은 글에 덧붙인다 (다시 계산하지 않는다)
  const sw = m.swipes[m.sw]; sw.text = R.appendRepairBlock(sw.text || '', block);
  writeMsg(m, trial); if (eff(chat).toChat) writeChat(chat, trial);
  await commit(chat, ms);
  toast(t('mvu.toast.repaired'));
}

// ── 옛 기능 단추 (원래 틀의 "快照楼层" · "重演楼层" · "清除旧楼层变量") ──
/** n 번째 메시지(0 부터)를 기준점으로 남긴다 (자동 정리가 지우지 않는다) */
export async function snapshotAt(n: number) {
  const chat = cur.chat, m = cur.msgs[n]; if (!chat || !m) return toast(t('mvu.toast.badFloor', { n }), 'err');
  m.swipes.forEach((_s, i) => { const v = varsOf(m, i); if (v) v.snapshot = true; });
  await commit(chat, cur.msgs); toast(t('mvu.toast.snapshot', { n }));
}
/** from 번째 메시지의 변수에서 시작해 (from, to] 의 글을 차례로 다시 읽고 결과를 to 번째에 적는다 */
export async function replay(from: number, to: number) {
  const chat = cur.chat, ms = cur.msgs; if (!chat) return;
  const start = dataOf(ms[from]); if (!start) return toast(t('mvu.toast.replayNoData', { n: from }), 'err');
  await enqueue(chat, async () => {
    const R = await runtime(); let v = clone(start), k = 0;
    for (let i = from + 1; i <= to && i < ms.length; i++) { await R.updateVariables(msgText(ms[i]), v, undefined, hostFor(chat)); if (++k % 50 === 0) toast(t('mvu.toast.replaying', { k, n: to - from })); }
    writeMsg(ms[to], v); v = clone(v);
    await commit(chat, ms); toast(t('mvu.toast.replayed', { n: to, k }));
  });
}
/** 마지막 depth 개를 뺀 앞 메시지들의 변수를 지운다 (기준점 간격 자리는 남긴다) */
export async function cleanupOld(depth: number) {
  const chat = cur.chat, ms = cur.msgs; if (!chat) return;
  const E = eff(chat), every = Math.max(1, E.snapEvery);
  ms.slice(1, -depth - 1).forEach((m, k) => {
    if (!m.swipes.some((_s, i) => varsOf(m, i) !== undefined)) return;
    m.swipes.forEach((_s, i) => {
      const v = varsOf(m, i); if (v === undefined) { setVarsOf(m, {}, i); return; }
      if (v.snapshot === true) return;
      if ((k + 1) % every === 0) { v.snapshot = true; return; }
      const o = { ...v }; for (const key of ['stat_data', 'display_data', 'delta_data', 'schema']) delete o[key]; setVarsOf(m, o, i);
    });
  });
  await commit(chat, ms); toast(t('mvu.toast.cleanedDepth', { n: depth }));
}
void KEYSET;
