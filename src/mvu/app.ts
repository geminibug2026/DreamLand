// 변수 갱신 틀(MVU)을 대화에 잇는다: 답변 · 내 메시지마다 갱신 명령을 읽어 메시지 변수(msg.thData)에 적고,
// 카드 스크립트(zod 스키마 · 이벤트 듣는 스크립트)와 상태창 화면이 실리태번에서처럼 같은 이벤트를 같은 차례로 받게 한다.
// 흐름은 MagVarUpdate(MIT, © 2025 MagicalAstrogy & StageDog)의 initCheck · handleVariablesInMessage · onMessageReceived 를 따른다.
// 이 틀을 쓰지 않는 대화(초기 변수 · 변수 자료 · 이 틀을 부르는 카드 스크립트가 없는 대화)에서는 아무 일도 하지 않는다.
/* eslint-disable @typescript-eslint/no-explicit-any */
import type { Chat, Char, Lore, Msg } from '../lib/types';
import { S, emit, msgText } from '../lib/core';
import { activeBooks, applyRegex, macro, makeCtx, quickCall, scanLore } from '../lib/engine';
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

type MsgD = Msg & { thData?: Obj };
type R = Awaited<ReturnType<typeof runtime>>;
export const HOLDER = '<StatusPlaceHolderImpl/>';
const EV = { INIT: 'mag_variable_initialized', BEFORE: 'mag_before_message_update' };
const KEYS = ['initialized_lorebooks', 'stat_data', 'schema', 'display_data', 'delta_data'] as const;

// ── 설정 ──
export interface MvuCfg {
  /** inline: 답변에 적힌 갱신을 읽는다 · extra: 답이 오면 따로 한 번 더 물어 갱신을 받는다 */
  mode: 'inline' | 'extra'; auto: boolean; minLen: number; trigger: string; history: number; tries: number; maxTokens: number;
  white: string; black: string; toChat: boolean; sendas: boolean; notifyErr: boolean; notifyInit: boolean;
}
export const DEFAULTS: MvuCfg = { mode: 'inline', auto: true, minLen: 0, trigger: '', history: 2, tries: 3, maxTokens: 4096, white: '', black: '', toChat: false, sendas: false, notifyErr: false, notifyInit: false };
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
  const list = (msgs || (cur.chat === chat ? cur.msgs : [])) as MsgD[];
  return list.some(m => isMvu(m.thData)) || hasInitEntry(chat) || scriptSignal(chat);
}

// ── 메시지 변수 ──
const dataOf = (m: MsgD | undefined): MvuData | null => m && isMvu(m.thData) ? m.thData as unknown as MvuData : null;
export function lastValidIndex(msgs: MsgD[], end = msgs.length): number { for (let i = Math.min(end, msgs.length) - 1; i >= 0; i--) if (dataOf(msgs[i])) return i; return -1; }
/** 최신 변수 (매크로 · 화면이 읽는 것) */
export function latestData(chat?: Chat | null): Obj | null {
  if (!chat || cur.chat !== chat) return null;
  const ms = cur.msgs as MsgD[], i = lastValidIndex(ms); return i >= 0 ? ms[i].thData as Obj : null;
}
function writeData(m: MsgD, d: MvuData, whole = false) {
  const o: Obj = { ...(m.thData || {}) };
  if (whole) for (const [k, v] of Object.entries(d)) if (!KEYS.includes(k as typeof KEYS[number])) o[k] = v;
  for (const k of KEYS) { if (d[k] !== undefined) o[k] = d[k]; else delete o[k]; }
  m.thData = o;
}
const clearData = (m: MsgD) => { if (!m.thData) return; const o = { ...m.thData }; for (const k of KEYS) delete o[k]; m.thData = o; };

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

/** 이 대화의 초기 자료 (로어북의 [InitVar] 항목들) */
export async function initOf(chat: Chat): Promise<{ data: MvuData; updated: boolean }> {
  const R = await runtime(), data = R.createEmptyGameData();
  const updated = R.loadInitVarData(data, initBooks(chat), mxOf(chat), (book, entry, err) => toast(t('mvu.toast.initBad', { book, entry, err: String(err.message || err).split('\n')[0] }), 'err'));
  R.finishInit(data, updated);
  return { data, updated };
}

// ── 한 메시지 계산 ──
const isSendas = (chat: Chat, m: Msg) => m.role === 'assistant' && !!m.charId && !(chat.charIds || []).includes(m.charId);
/** fresh: 막 받은 · 보낸 메시지 (BEFORE_MESSAGE_UPDATE 를 부르고 답변 글을 고칠 수 있다). carry: 명령을 읽지 않고 앞 상태만 잇는다 */
async function computeAt(R: R, chat: Chat, msgs: MsgD[], i: number, { fresh = false, carry = false } = {}): Promise<void> {
  const m = msgs[i], sw = m?.swipes[m.sw]; if (!sw) return;
  const text = sw.text || '', host = hostFor(chat), E = eff(chat);
  if (i === 0 && lastValidIndex(msgs, 0) < 0) {
    // 대화의 시작: 초기 변수 → 첫 인사의 <initvar> → VARIABLE_INITIALIZED → 첫 메시지의 명령
    const { data: base } = await initOf(chat);
    const data = R.lo.correctlyMerge(Object.fromEntries(Object.entries(m.thData || {}).filter(([k]) => !KEYS.includes(k as typeof KEYS[number]))), R.lo.clone(base)) as MvuData;
    const greet = m.role !== 'user' ? R.greetingInitVar(text, mxOf(chat)) : null;
    if (greet) {
      // 첫 인사의 <initvar> 를 바탕으로 삼고, 캐릭터 로어북 밖의 로어북(전역 등)만 다시 읽어 합친다
      data.stat_data = greet; data.initialized_lorebooks = { [primaryBook(chat)?.name || 'unknown']: [] };
      data.schema = { type: 'object', properties: {} };
      R.loadInitVarData(data, initBooks(chat), mxOf(chat)); R.finishInit(data, true);
    }
    await host.emit(EV.INIT, data, m.sw);
    if (!carry) await R.updateVariables(text, data, undefined, host);
    writeData(m, data, true);
    if (E.notifyInit && fresh) toast(t('mvu.toast.init', { books: Object.keys(data.initialized_lorebooks || {}).join(', ') || '-' }));
    return;
  }
  const pi = lastValidIndex(msgs, i);
  let data: MvuData = pi >= 0 ? R.lo.clone(dataOf(msgs[pi])!) : (await initOf(chat)).data;
  const skip = carry || m.role === 'system' || (m.role === 'assistant' && text.length < 5) || (!E.sendas && isSendas(chat, m));
  if (skip) { delete data.display_data; delete data.delta_data; writeData(m, data); return; }
  await R.updateVariables(text, data, undefined, host);
  if (m.role !== 'user') {
    let nt = text;
    if (fresh) {
      const ctx = { variables: data, message_content: text };
      await host.emit(EV.BEFORE, ctx);
      if (ctx.variables && typeof ctx.variables === 'object') data = ctx.variables;
      if (typeof ctx.message_content === 'string') nt = ctx.message_content;
    }
    if (!nt.includes(HOLDER)) nt = nt + '\n\n' + HOLDER;
    if (nt.includes('<status_current_variable>')) nt = nt.replace(/<(status_current_variable)>(?:(?!<\1>).)*<\/\1?>/gis, '');
    if (nt !== sw.text) { sw.text = nt; delete sw.tr; }
  }
  writeData(m, data);
}

// ── 차례로 돌리기 ──
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
function pushFrames() { framePost({ dlState: { mvuExtra: extraNow } }); emit('mvu:updated'); }

/** from 번째부터 끝까지 다시 계산한다. fresh 번째 메시지에는 BEFORE_MESSAGE_UPDATE 를 부른다 */
async function run(chat: Chat, msgs: MsgD[], from: number, { fresh = -1, carryAt = -1 }: { fresh?: number; carryAt?: number } = {}) {
  const R = await runtime();
  let start = Math.max(0, from);
  if (lastValidIndex(msgs, start) < 0) start = 0;
  for (let i = start; i < msgs.length; i++) {
    if (!live(chat, msgs)) return;   // 그사이 대화를 옮겼거나 목록이 바뀌었다
    await computeAt(R, chat, msgs, i, { fresh: i === fresh, carry: i === carryAt });
  }
  if (eff(chat).toChat) { const d = dataOf(msgs[lastValidIndex(msgs)]); if (d) { chat.vars ||= {}; const v = chat.vars as unknown as Obj; for (const k of KEYS) { if (d[k] !== undefined) v[k] = R.lo.clone(d[k]); else delete v[k]; } } }
}
/** 열려 있는 대화를 from 부터 다시 계산하고 저장 · 다시 그린다 */
export function sync(chat: Chat | null | undefined, from: number, o: { fresh?: number; carryAt?: number; save?: boolean; draw?: boolean } = {}) {
  if (!chat || cur.chat !== chat || !usesMvu(chat)) return Promise.resolve();
  const msgs = cur.msgs as MsgD[];
  return enqueue(chat, async () => {
    try { await run(chat, msgs, from, o); } catch (e) { console.error('[변수 갱신]', e); toast(t('mvu.toast.fail', { err: String((e as Error)?.message || e) }), 'err'); }
    if (!live(chat, msgs)) return;
    if (o.save !== false) await chatApi.save();
    if (o.draw !== false) chatApi.redraw?.();
    pushFrames();
  });
}

/** 대화를 열 때 · 생성 전: 변수가 없는 메시지를 채우고, 나중에 붙은 로어북의 초기 변수를 합친다 (원래 틀의 initCheck) */
export function check(chat: Chat | null | undefined): Promise<void> {
  if (!chat || cur.chat !== chat || !usesMvu(chat)) return Promise.resolve();
  const msgs = cur.msgs as MsgD[]; if (!msgs.length) return Promise.resolve();
  return enqueue(chat, async () => {
    await TH.scriptsReady();   // 카드 스크립트(zod 스키마 등)가 다 실린 뒤에 계산한다
    if (!live(chat, msgs)) return;
    const R = await runtime();
    let changed = false;
    const li = lastValidIndex(msgs);
    if (li < msgs.length - 1) { await run(chat, msgs, li + 1); changed = true; }
    else {
      const d = R.lo.clone(dataOf(msgs[li])!);
      if (R.loadInitVarData(d, initBooks(chat), mxOf(chat))) { R.finishInit(d, true); writeData(msgs[li], d); changed = true; }
    }
    if (changed && live(chat, msgs)) { await chatApi.save(); chatApi.redraw?.(); pushFrames(); }
  });
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

/** 추가 호출 한 번: 최근 메시지 몇 개와 카드 · 로어북을 보내고 갱신 블록을 받는다. 못 받으면 null */
export async function askExtra(chat: Chat, msgs: MsgD[], i: number, o: { task?: string; tail?: string; validate?: (block: string) => Promise<string | null> } = {}): Promise<string | null> {
  const R = await runtime(), E = eff(chat), conn = S.helperConn('mvu', chat);
  if (!conn) { toast(t('mvu.toast.noConn'), 'err'); return null; }
  const chars = charsOf(chat), char = chars[0], persona = S.persona(chat), ctx = makeCtx({ chat, char, chars, persona, msgs: msgs.slice(0, i + 1) });
  const strip = (s: string) => s.replaceAll('\n' + HOLDER, '').replaceAll(HOLDER, '');
  const from = Math.max(0, i + 1 - Math.max(1, E.history));
  const hist = msgs.slice(from, i + 1).filter(m => !m.hidden).map((m, k, a) => ({ role: m.role, name: m.role === 'user' ? (persona?.name || 'User') : (m.name || char?.name || ''), content: strip(applyRegex(msgText(m), { who: m.role === 'user' ? 'user' : 'ai', target: 'prompt', depth: a.length - 1 - k, charId: m.charId, ctx })) }));
  const books = filterBooks(activeBooks(chat, chars, persona), chat, true);
  let lore: string[] = [];
  try { lore = scanLore(books, hist, ctx, { commit: false, char, persona }).map(e => strip(e.text)); } catch (e) { console.warn('[변수 갱신] 로어북', e); }
  const card = (c: Char) => macro(c.description, { ...ctx, char: c.name });
  const system = [HEAD, '<additional_information>', persona?.description ? macro(persona.description, ctx) : '', ...chars.map(card), ...lore, '</additional_information>', '<past_observe>', ...hist.map(h => `${h.name}: ${h.content}`), '</past_observe>'].filter(Boolean).join('\n\n');
  const task = (o.task || TASK) + (o.tail ? '\n' + o.tail : '');
  let last: unknown = null;
  extraNow = true; pushFrames();
  try {
    for (let n = 0; n < Math.max(1, E.tries); n++) {
      try {
        const out = await quickCall(system, task + '\n\nFollow the <must> instruction.', { maxTokens: E.maxTokens, conn, lowThink: true });
        if (o.validate) {
          let block = out;
          if (!R.extractCommands(block).length) { try { block = R.parseAndValidateExtraModelResult(out) ?? out; } catch { /* 그대로 검사 */ } }
          const bad = await o.validate(block); if (!bad) return block; last = new Error(bad); continue;
        }
        const block = R.parseAndValidateExtraModelResult(out);
        if (block) return block;
        last = new Error(t('mvu.toast.noBlock'));
      } catch (e) { last = e; }
    }
  } finally { extraNow = false; pushFrames(); }
  toast(t('mvu.toast.extraFail', { err: String((last as Error)?.message || last || '').split('\n')[0].slice(0, 200) }), 'err');
  return null;
}

/** 답변을 받은 뒤 (저장 전): 추가 호출 방식이면 갱신을 받아 덧붙이고, 변수를 계산한다 */
export function onReceived(chat: Chat, msgs: MsgD[], msg: MsgD, force = false): Promise<void> {
  if (!usesMvu(chat, msgs)) return Promise.resolve();
  return track(chat, received(chat, msgs, msg, force));
}
async function received(chat: Chat, msgs: MsgD[], msg: MsgD, force: boolean): Promise<void> {
  const i = msgs.indexOf(msg); if (i < 0) return;
  const E = eff(chat), sw = msg.swipes[msg.sw], text = sw?.text || '';
  let carry = false;
  if (E.mode === 'extra' && msg.role === 'assistant' && i > 0 && text.length >= 5 && (E.sendas || !isSendas(chat, msg))) {
    let go = true;
    if (!force) {
      const trig = compileRx(E.trigger);
      if (!E.auto) go = false;
      else if (E.minLen > 0 && Array.from(text.trim()).length < E.minLen) { toast(t('mvu.toast.short')); go = false; }
      else if (trig && !trig.test(text)) { toast(t('mvu.toast.noTrigger')); go = false; }
    }
    if (!go) carry = true;
    else {
      await (queues.get(chat.id) || Promise.resolve());
      clearData(msg);   // 이 메시지의 옛 변수를 지워야 로어북의 {{get_message_variable}} 이 앞 상태를 읽는다
      const live0 = cur.chat === chat; if (live0) chatApi.setStatus(t('mvu.status.extra'));
      try { const block = await askExtra(chat, msgs, i); if (block && sw) sw.text = (sw.text || '').trimEnd() + '\n\n' + block; }
      finally { if (live0) chatApi.setStatus(''); }
    }
  }
  if (cur.chat !== chat) return;
  await enqueue(chat, async () => { try { await run(chat, msgs, i, { fresh: i, carryAt: carry ? i : -1 }); } catch (e) { console.error('[변수 갱신]', e); } pushFrames(); });
}

// ── 손으로 하는 일 (장면 패널의 단추) ──
const lastIdx = () => cur.msgs.length - 1;
/** 마지막 메시지의 변수를 지우고 다시 계산 */
export async function reprocessLast() {
  const chat = cur.chat; if (!chat || lastIdx() < 1) return;
  clearData(cur.msgs[lastIdx()] as MsgD);
  await sync(chat, lastIdx(), { fresh: lastIdx() });
  toast(t('mvu.toast.redone'));
}
/** 로어북의 초기 변수를 다시 읽어 마지막 메시지의 변수에 합친다 (설명 글도 새것으로) */
export async function reloadInit() {
  const chat = cur.chat; if (!chat) return;
  const ms = cur.msgs as MsgD[], li = lastValidIndex(ms); if (li < 0) return toast(t('mvu.toast.noData'), 'err');
  await enqueue(chat, async () => {
    const R = await runtime(), base = R.createEmptyGameData();
    if (!R.loadInitVarData(base, initBooks(chat), mxOf(chat))) { toast(t('mvu.toast.noInit'), 'err'); return; }
    R.reconcileAndApplySchema(base); R.cleanUpMetadata(base.stat_data);
    const old = dataOf(ms[li])!, merged: MvuData = { stat_data: R.lo.merge({}, base.stat_data, old.stat_data), schema: R.lo.merge({}, old.schema, base.schema), initialized_lorebooks: R.lo.merge({}, base.initialized_lorebooks, old.initialized_lorebooks), delta_data: old.delta_data };
    merged.display_data = R.lo.clone(merged.stat_data);
    R.updateDescriptions('', base.stat_data, old.stat_data, merged.stat_data);
    R.reconcileAndApplySchema(merged); R.cleanUpMetadata(merged.stat_data);
    writeData(ms[ms.length - 1], merged);
    await chatApi.save(); chatApi.redraw?.(); pushFrames();
    toast(t('mvu.toast.reloaded'));
  });
}
/** 추가 호출을 다시: 마지막 갱신 블록을 떼고 앞 상태로 돌린 뒤 다시 물어본다 */
export async function retryExtra() {
  const chat = cur.chat; if (!chat) return;
  if (eff(chat).mode !== 'extra') return toast(t('mvu.toast.notExtra'));
  const ms = cur.msgs as MsgD[], m = ms[lastIdx()]; if (!m || m.role !== 'assistant') return;
  const sw = m.swipes[m.sw], s = sw.text || '', b = s.lastIndexOf('<UpdateVariable>');
  if (b >= 0) { const e = s.lastIndexOf('</UpdateVariable>'); sw.text = e < 0 ? s.slice(0, b) : s.slice(0, b) + s.slice(e + 17); }
  await onReceived(chat, ms, m, true);
  await chatApi.save(); chatApi.redraw?.();
  toast(t('mvu.toast.retried'));
}
/** 빠진 갱신 고치기: 이번 답변 뒤의 상태를 보여 주고 빠진 것만 더 받는다. 미리 시험해 보고, 확인을 받은 뒤 덧붙인다 */
export async function repairLast(direction: string, confirm: (cmds: string[], block: string) => Promise<boolean>) {
  const chat = cur.chat; if (!chat) return;
  if (eff(chat).mode !== 'extra') return toast(t('mvu.toast.notExtra'));
  const ms = cur.msgs as MsgD[], i = lastIdx(), m = ms[i], now = dataOf(m), pi = lastValidIndex(ms, i);
  if (i < 1 || m.role !== 'assistant' || !now || pi < 0) return toast(t('mvu.toast.noRepair'), 'err');
  const R = await runtime(), changes = R.collectStateChanges(dataOf(ms[pi])!.stat_data, now.stat_data);
  const host = hostFor(chat);
  const task = `<must>\n<incremental_repair_directive>\nThis is an incremental correction, not a full retry.\n- The current variables are the values AFTER this reply and its updates were applied, not before.\n- <past_observe> holds the latest story and the original update. The list below only shows what already changed in this reply.\n- The variable rules and lorebook still decide. The user's focus only says where to look first; it cannot invent story facts or override the rules.\n- Only add updates that were missed, or fix ones that clearly contradict the latest story or the rules. Never repeat a change that is already correct.\n- Work from the current state; do not recalculate or overwrite all variables. Use insert only where the rules allow new fields, and remove only fields that are clearly wrong. If unsure, change nothing.\n- Output only one <UpdateVariable><JSONPatch>...</JSONPatch></UpdateVariable>. If nothing needs fixing, output an empty JSONPatch array.\n</incremental_repair_directive>\n<incremental_repair_context>\nChanges already applied in this reply:\n${R.formatStateChanges(changes)}\n</incremental_repair_context>\n</must>`;
  const tail = `<incremental_repair_final_check>\nFocus on what the user pointed out first, without going beyond the variable rules and the story facts.\n<user_focus>${direction.trim().slice(0, 500) || '(no focus given: check for missed and clearly wrong updates)'}</user_focus>\nKeep only the needed incremental operations against the current state. Do not repeat correct updates. No explanation outside the block.\n</incremental_repair_final_check>`;
  chatApi.setStatus(t('mvu.status.repair'));
  let block: string | null = null;
  try {
    block = await askExtra(chat, ms, i, { task, tail, validate: async b => { const trial = R.lo.clone(now), errs: string[] = []; const mod = await R.updateVariables(b, trial, errs, host); return errs.length ? errs.join('\n') : mod ? null : t('mvu.toast.noChange'); } });
  } finally { chatApi.setStatus(''); }
  if (!block || cur.chat !== chat || cur.msgs[i] !== m) return;
  if (!(await confirm(R.extractCommands(block).map(c => c.full_match), block))) return;
  const sw = m.swipes[m.sw]; sw.text = R.appendRepairBlock(sw.text || '', block);
  await sync(chat, i, {});
  toast(t('mvu.toast.repaired'));
}
