// 막후의 본체: 설정 · 누가 이번 턴에 일하는지 · 묶음 호출 · 결과를 스와이프와 대화에 적기 · 제안 검토 · 실행 기록
// 대화 화면에는 X 등록부 · 이벤트 · chatApi 로만 닿는다 (src/chat/actions.tsx 는 고치지 않는다)
import type { Char, Lore, Msg } from '../lib/types';
import type { PromptInfo, PromptPiece } from '../lib/hooks';
import { DB, S, emit, msgText, newEntry, newLore, now, uid } from '../lib/core';
import { quickCall, tokens } from '../lib/engine';
import { chatApi, roomName } from '../chat/actions';
import { inCall } from '../call/logic';
import { toast } from '../ui';
import { t, getLang } from '../i18n';
import type { Applied, ChatCrew, CrewCfg, CrewChat, CrewDef, CrewSwipe, LogItem, Mode, Proposal, SeatLine } from './types';
import { BUILTIN, PROPS_TEACH, SCALE_INJECT, SCALE_PUSH, SCALE_PUSH_BARE, SEAT_STYLES, seatsOf } from './builtin';
import { runBatch, runRewrite, type Call, type Pass, type Story, type Task } from './batch';
import { asText, checkReply, hash, rewriteOk, type Issue } from './text';
import { stripProps } from './props';

export const OWNER = 'crew';
const isAbort = (e: unknown) => e instanceof Error && e.name === 'AbortError';
const errMsg = (e: unknown) => e instanceof Error ? e.message : String(e);

// ════════ 설정 ════════
/** 처음 쓰는 금지어: 모델이 버릇처럼 쓰는 상투구 몇 개 (사용자가 고친다) */
export const DEFAULT_WORDS = ['shivers down', 'barely above a whisper', 'a mix of', 'ministrations', 'couldn\'t help but', 'little did'];
export function cfg(): CrewCfg {
  const c = (S.settings.crew ||= {}) as Partial<CrewCfg>;
  c.on ??= false; c.enabled ||= {}; c.every ||= {}; c.custom ||= []; c.prompts ||= {};
  c.seats = { style: 'serial', custom: '', lines: 4, ...(c.seats || {}) };
  c.proof = { words: [...DEFAULT_WORDS], repeat: true, opener: true, speakFor: true, ...(c.proof || {}) };
  return c as CrewCfg;
}
export const save = () => { S.set({ crew: cfg() }); emit('crew:changed'); };
export const defs = (): CrewDef[] => [...BUILTIN, ...cfg().custom];
export const defOf = (id: string) => defs().find(d => d.id === id);
/** 내장 조수의 이름과 설명은 화면 말에서 온다 */
export const nameOf = (d: CrewDef) => d.builtin ? t('crew.b.' + d.id + '.name') : d.name || d.id;
export const descOf = (d: CrewDef) => d.builtin ? t('crew.b.' + d.id + '.desc') : d.desc || '';
export const everyOf = (d: CrewDef) => Math.max(1, Math.round(+(cfg().every[d.id] ?? d.every) || 1));
export const promptOf = (d: CrewDef) => (d.builtin && cfg().prompts[d.id]?.trim()) || d.prompt;
export const st = (chat: CrewChat): ChatCrew => (chat.crew ||= {});
/** 이 대화에서 켜져 있는가: 대화에서 따로 정했으면 그것, 아니면 전체 설정 */
export const isOn = (d: CrewDef, chat?: CrewChat | null) => cfg().on && (chat?.crew?.on?.[d.id] ?? !!cfg().enabled[d.id]);
export const modeNow = (chat: CrewChat): Mode => chat.game?.on ? 'game' : chat.mode === 'talk' && !chat.scene?.on ? 'talk' : 'rp';
/** 턴 = 보이는 답장의 수 */
export const turnOf = (msgs: Msg[]) => msgs.filter(m => m.role === 'assistant' && !m.hidden).length;
const saveChat = (chat: CrewChat) => S.save('chats', chat, true);
/** 대화별 스위치: true 켬 · false 끔 · null 전체 설정을 따름 */
export async function setChatOn(chat: CrewChat, id: string, v: boolean | null) { const s = st(chat); s.on ||= {}; if (v == null) delete s.on[id]; else s.on[id] = v; await saveChat(chat); emit('crew:changed'); }

// ════════ 누가 이번에 일하나 ════════ 낱말 → 간격 → (낱말이 없어도) 오래 쉬었으면
const visible = (msgs: Msg[]) => msgs.filter(m => !m.hidden && m.role !== 'system');
export function due(d: CrewDef, chat: CrewChat, msgs: Msg[], turn: number, again = false): boolean {
  if (d.free || !isOn(d, chat) || !d.modes.includes(modeNow(chat))) return false;
  const last = st(chat).last?.[d.id];
  if (again && last === turn) return !d.once;   // 같은 턴을 다시 생성: 답장마다 붙는 조수만 다시 돈다
  const gap = last == null ? Infinity : turn - last, keys = (d.keywords || []).map(k => k.trim().toLowerCase()).filter(Boolean);
  if (keys.length) {
    const tail = visible(msgs).slice(-4).map(m => msgText(m).toLowerCase()).join('\n');
    if (!keys.some(k => tail.includes(k))) return !!d.maxSkip && gap >= Math.max(d.maxSkip, everyOf(d));
  }
  return gap >= everyOf(d);
}

// ════════ 실행 기록 ════════ kv 의 crewlog:<대화 id> 한 줄. 대화가 지워지면 같이 지운다
const logs = new Map<string, LogItem[]>();
export async function loadLog(chatId: string): Promise<LogItem[]> {
  if (!logs.has(chatId)) logs.set(chatId, ((await DB.get('kv', 'crewlog:' + chatId)) as { list?: LogItem[] } | undefined)?.list || []);
  return logs.get(chatId)!;
}
async function addLog(chatId: string, it: LogItem) {
  const list = await loadLog(chatId); list.unshift(it); if (list.length > 80) list.length = 80;
  await DB.put('kv', { id: 'crewlog:' + chatId, list }); emit('crew:log', chatId);
}
export async function clearLog(chatId: string) { logs.set(chatId, []); await DB.del('kv', 'crewlog:' + chatId); emit('crew:log', chatId); }
export const dropChat = (chatId: string) => { logs.delete(chatId); void DB.del('kv', 'crewlog:' + chatId); };

// ════════ 모델에 보낼 재료 ════════
const clip = (s: unknown, n: number) => { const x = String(s ?? '').trim(); return x.length > n ? x.slice(0, n) + ' …' : x; };
const charsOf = (chat: CrewChat) => chat.charIds.map(id => S.get('chars', id)).filter((c): c is Char => !!c);
function story(chat: CrewChat, msgs: Msg[], depth: number, latest?: string): Story {
  const chars = charsOf(chat), p = S.persona(chat), user = p?.name || S.settings.userNameFallback || 'User';
  const vis = visible(msgs), body = latest != null ? vis.slice(0, -1) : vis;
  return {
    cast: chars.map(c => `${c.name}: ${clip([c.description, c.personality].filter(Boolean).join(' '), 700)}`).join('\n') || '(none)',
    player: `${user}${p?.description ? ': ' + clip(p.description, 300) : ''}`,
    recent: body.slice(-depth).map(m => `${m.role === 'user' ? user : m.name || chars.find(c => c.id === m.charId)?.name || 'Character'}${m.direct ? ' (author direction)' : ''}: ${clip(stripProps(msgText(m)), 1400)}`).join('\n\n') || '(the story has not started)',
    ...(latest != null ? { latest: clip(stripProps(latest), 6000) } : {}),
  };
}
/** {{char}} · {{user}} 만 채운다 (조수 프롬프트는 본문 매크로를 다 돌리지 않는다 — 부작용이 있는 매크로가 헛돌지 않게) */
const fill = (s: string, chat: CrewChat, more: Record<string, string> = {}) => {
  const v: Record<string, string> = { char: charsOf(chat)[0]?.name || 'the character', user: S.persona(chat)?.name || S.settings.userNameFallback || 'User', ...more };
  return s.replace(/\{\{(\w+)\}\}/g, (m, k: string) => v[k] ?? m);
};
/** 내장 조수가 저마다 더 받는 자료 */
function extraOf(d: CrewDef, chat: CrewChat): string {
  const s = st(chat);
  if (d.kind === 'seats') return `<audience>\n${seatsOf(chat.id, getLang()).map((a, i) => `${i}. ${a.nick} — ${a.trait}`).join('\n')}\n</audience>`;
  if (d.kind === 'growth') return `<character_sheets>\n${charsOf(chat).map(c => `<sheet name="${c.name}">\n<description>\n${clip(c.description, 3000)}\n</description>\n<personality>\n${clip(c.personality, 1500)}\n</personality>\n<scenario>\n${clip(c.scenario, 1500)}\n</scenario>\n</sheet>`).join('\n')}\n</character_sheets>`;
  if (d.kind === 'keeper') { const b = bookOf(chat); return `<existing_entries>\n${b?.entries.map(e => `- ${e.name || e.keys[0]} [${e.keys.join(', ')}]: ${clip(e.content, 240)}`).join('\n') || '(none yet)'}\n</existing_entries>`; }
  if (d.kind === 'scale') return `<compass>\n${s.scale?.arc ? `arc: ${s.scale.arc}\nnext: ${s.scale.next}` : '(not set yet — this is your first reading)'}\n</compass>`;
  return '';
}
function taskOf(d: CrewDef, chat: CrewChat): Task {
  const c = cfg(), more: Record<string, string> = d.kind === 'seats' ? { lines: `${Math.max(3, Math.min(6, +c.seats.lines || 4))}`, style: c.seats.style === 'custom' ? (c.seats.custom.trim() || SEAT_STYLES.serial) : SEAT_STYLES[c.seats.style] || SEAT_STYLES.serial } : {};
  const shape = d.builtin ? '' : d.out === 'json' ? '\nout: a JSON value as the task describes.' : '\nout: plain text (a JSON string).';
  return { id: d.id, name: d.builtin ? d.id : d.name, prompt: fill(promptOf(d), chat, more) + (/\bout:/.test(promptOf(d)) ? '' : shape), memo: st(chat).memo?.[d.id], extra: extraOf(d, chat) };
}
const caller = (chat: CrewChat, tally: { in: number; out: number }, signal?: AbortSignal): Call => async (system, user, maxTokens) => {
  const conn = S.helperConn('crew', chat); if (!conn) throw new Error(t('crew.err.noConn'));
  tally.in += tokens(system) + tokens(user);
  const out = await quickCall(system, user, { maxTokens, signal, conn, lowThink: true });
  tally.out += tokens(out); return out;
};
const short = (o: Record<string, unknown>) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, clip(asText(v), 900)]));

/** 조수 여럿을 요청 하나로 돌리고 기록을 남긴다. 실패해도 던지지 않는다 (본문 답장을 막지 않게) */
async function batch(list: CrewDef[], chat: CrewChat, msgs: Msg[], phase: LogItem['phase'], turn: number, o: { latest?: string; signal?: AbortSignal } = {}) {
  const t0 = now(), tally = { in: 0, out: 0 }, ids = list.map(d => d.id);
  const depth = Math.max(8, Math.min(24, Math.max(...list.map(d => everyOf(d))) * 2 + 2)), max = Math.min(4000, 250 + list.reduce((a, d) => a + (d.max || 300), 0));
  try {
    const r = await runBatch(caller(chat, tally, o.signal), list.map(d => taskOf(d, chat)), story(chat, msgs, depth, o.latest), max);
    const s = st(chat); s.memo ||= {}; s.last ||= {};
    for (const id of Object.keys(r.out)) { if (r.out[id].memo) s.memo[id] = r.out[id].memo; s.last[id] = turn; }
    await addLog(chat.id, { ts: now(), turn, phase, ids, tokIn: tally.in, tokOut: tally.out, ms: now() - t0, ok: r.ok, note: r.ok ? (r.tries > 1 ? t('crew.log.retried') : '') : t('crew.log.badJson'), out: r.ok ? short(Object.fromEntries(Object.entries(r.out).map(([k, v]) => [k, v.out]))) : { raw: clip(r.raw, 900) } });
    return r.out;
  } catch (e) {
    if (!isAbort(e)) { console.warn('[막후]', e); await addLog(chat.id, { ts: now(), turn, phase, ids, tokIn: tally.in, tokOut: tally.out, ms: now() - t0, ok: false, note: errMsg(e).slice(0, 200) }); }
    return {};
  }
}

// ════════ 답장 전 ════════
/** 다시 생성하면 직전 메시지가 같다 — 그때는 앞서 받은 결과를 그대로 쓴다 (호출을 아낀다) */
const anchorKey = (msgs: Msg[], type: string) => { const v = visible(msgs), a = type === 'regen' ? v[v.length - 2] : v[v.length - 1]; return a ? `${a.id}:${a.sw}:${hash(msgText(a))}` : 'start'; };
export async function prepare({ chat: c0, msgs, type, signal }: { chat: unknown; msgs: Msg[]; type: string; signal?: AbortSignal }, only?: CrewDef) {
  const chat = c0 as CrewChat;
  if (!cfg().on || type === 'impersonate' || type === 'continue' || inCall(chat)) return;
  const s = st(chat), again = type === 'regen', turn = turnOf(msgs) + (again ? 0 : 1), key = anchorKey(msgs, type);
  let list = only ? [only] : defs().filter(d => d.phase === 'before' && due(d, chat, msgs, turn, again));
  if (!s.pre || s.pre.key !== key) s.pre = { key, out: s.pre?.out || {}, ran: [] };
  else if (!only) list = list.filter(d => !s.pre!.ran?.includes(d.id));
  if (!list.length) return;
  if (!only) chatApi.setStatus(t('crew.status.before', { names: list.map(nameOf).join(' · ') }));
  const out = await batch(list, chat, msgs, only ? 'manual' : 'before', turn, { signal });
  for (const d of list) {
    const r = out[d.id]; if (!r) continue;
    (s.pre.ran ||= []).push(d.id);
    if (d.kind === 'scale') { const j = (r.out && typeof r.out === 'object' ? r.out : {}) as Record<string, unknown>; if (typeof j.arc === 'string' && j.arc.trim()) s.scale = { arc: clip(j.arc, 400), next: clip(j.next, 400), cue: clip(j.cue, 500), turn }; }
    else s.pre.out[d.id] = clip(asText(r.out), 2000);
  }
  await saveChat(chat); emit('crew:changed');
}

// ════════ 본문 프롬프트에 넣는 조각 ════════
/** 답장 뒤 조수가 남긴 "다음 턴에 넣을 글": 가장 최근 답장의 지금 스와이프에서 찾는다 — 스와이프를 넘기거나 지워도 어긋나지 않는다 */
function carried(id: string, msgs: Msg[], skipLast: boolean): string {
  for (let i = msgs.length - 1, first = true; i >= 0; i--) {
    const m = msgs[i]; if (m.role !== 'assistant' || m.hidden) continue;
    if (first && skipLast) { first = false; continue; } first = false;
    const v = (m.swipes[m.sw] as CrewSwipe | undefined)?.crew?.[id]; if (typeof v === 'string' && v) return v;
  }
  return '';
}
export function pieces(info: PromptInfo): PromptPiece[] {
  const chat = info.chat as CrewChat;
  if (!cfg().on || info.type === 'impersonate' || inCall(chat)) return [];
  const s = chat.crew || {}, mode = modeNow(chat), out: PromptPiece[] = [], live = (d: CrewDef) => isOn(d, chat) && d.modes.includes(mode);
  for (const d of defs()) {
    if (!live(d)) continue;
    if (d.kind === 'props') out.push({ where: 'end', src: '막후 · 소품', content: PROPS_TEACH });
    else if (d.kind === 'scale') { if (s.scale?.arc) out.push({ where: 'depth', depth: 1, order: 70, role: 'system', src: '막후 · 저울', content: SCALE_INJECT.replace('{{arc}}', s.scale.arc).replace('{{next}}', s.scale.next).replace('{{cue}}', s.scale.cue) }); }
    else if (d.out === 'inject') {
      const text = d.phase === 'before' ? s.pre?.out?.[d.id] : carried(d.id, info.msgs, info.type === 'regen');
      if (text) out.push({ where: d.where || 'depth', depth: d.depth ?? 1, order: 72, role: 'system', src: '막후 · ' + d.name, content: text });
    }
  }
  if (s.push) out.push({ where: 'depth', depth: 0, order: 210, role: 'system', src: '막후 · 밀어 주기', content: s.scale?.arc && live(defOf('scale')!) ? SCALE_PUSH : SCALE_PUSH_BARE });
  return out;
}
/** 밀어 주기: 다음 답장 한 번만. 답장이 오면 스스로 꺼진다 */
export async function setPush(chat: CrewChat, v: boolean) { st(chat).push = v || undefined; await saveChat(chat); emit('crew:changed'); }

// ════════ 답장 뒤 ════════
/** 열린 대화면 화면의 메시지를, 아니면 저장된 것을 읽어 그 스와이프를 고치고 저장한다. 그사이 글이 바뀌었으면(다시 생성 · 편집) 손대지 않는다 */
async function commit(chat: CrewChat, msgId: string, sw: number, text: string, fn: (s: CrewSwipe) => void): Promise<boolean> {
  const c = chatApi.current(), open = c.chat?.id === chat.id, list = open ? c.msgs : await S.msgs(chat.id);
  const s = list.find(m => m.id === msgId)?.swipes[sw] as CrewSwipe | undefined;
  if (!s || s.text !== text) return false;
  fn(s);
  if (open) { await chatApi.save(); chatApi.redraw(); } else await S.saveMsgs(chat, list);
  return true;
}
const prevReply = (msgs: Msg[], m: Msg) => { for (let i = msgs.indexOf(m) - 1; i >= 0; i--) if (msgs[i].role === 'assistant' && !msgs[i].hidden) return msgText(msgs[i]); return ''; };
/** 금지어 자동 다시 생성(흐름)이 이 답장을 버릴 참이면 교정자는 물러선다 — 둘이 같은 답장을 붙잡지 않게 */
function autoSwipeWill(text: string) {
  const a = (S.settings.auto as { swipe?: { on?: boolean; minLen?: number; words?: string[]; threshold?: number } } | undefined)?.swipe; if (!a?.on) return false;
  const low = text.toLowerCase(), hits = (a.words || []).filter(w => String(w).trim() && low.includes(String(w).trim().toLowerCase())).length;
  return (+(a.minLen || 0) > 0 && text.trim().length < +(a.minLen || 0)) || hits >= Math.max(1, +(a.threshold || 1));
}
export const issuesOf = (chat: CrewChat, text: string, prev: string): Issue[] => { const p = cfg().proof; return checkReply(stripProps(text), stripProps(prev), { words: p.words, repeat: p.repeat, opener: p.opener, speakFor: p.speakFor, user: S.persona(chat)?.name }); };

/** 다시쓰기 한 번: 교정자(코드 검사에 걸렸을 때만)와 다시쓰기 맞춤 조수를 한 요청에 차례로 싣는다. 고친 글을 돌려준다 (안 고쳤으면 '') */
async function rewrite(list: CrewDef[], chat: CrewChat, msgs: Msg[], m: Msg, sw: number, turn: number, manual = false): Promise<string> {
  const s0 = m.swipes[sw] as CrewSwipe, text = s0.text, prev = prevReply(msgs, m), passes: Pass[] = [], ids: string[] = [];
  for (const d of list) {
    if (d.kind === 'proof') {
      if (s0.crewKept && !manual) continue;
      const is = issuesOf(chat, text, prev); if (!is.length) { if (manual) toast(t('crew.proof.clean'), 'ok'); continue; }
      passes.push({ name: 'line edit', prompt: fill(promptOf(d), chat), flags: is.map(i => `- ${i.kind}: ${i.detail}`).join('\n') }); ids.push(d.id);
    } else { passes.push({ name: d.name, prompt: fill(d.prompt, chat) }); ids.push(d.id); }
  }
  if (!passes.length) return '';
  const t0 = now(), tally = { in: 0, out: 0 }, log = (ok: boolean, note: string, out?: Record<string, string>) => addLog(chat.id, { ts: now(), turn, phase: manual ? 'manual' : 'rewrite', ids, tokIn: tally.in, tokOut: tally.out, ms: now() - t0, ok, note, out });
  chatApi.setStatus(t('crew.status.rewrite'));
  try {
    const r = await runRewrite(caller(chat, tally), passes, text, clip(prev, 3000), Math.min(8000, Math.round(tokens(text) * 1.6) + 400));
    const s = st(chat); s.last ||= {}; for (const id of ids) s.last[id] = turn;
    if (!r.ok) { await log(false, t('crew.log.badJson'), { raw: clip(r.raw, 600) }); return ''; }
    if (!r.editNeeded) { await log(true, t('crew.log.noEdit')); if (manual) toast(t('crew.log.noEdit')); return ''; }
    if (!rewriteOk(text, r.text)) { await log(false, t('crew.log.rejected', { a: text.length, b: r.text.trim().length }), { text: clip(r.text, 600) }); if (manual) toast(t('crew.log.rejected', { a: text.length, b: r.text.trim().length }), 'err'); return ''; }
    const next = r.text.trim(), done = await commit(chat, m.id, sw, text, x => { x.crewOrig ??= text; x.text = next; x.crewFix = r.changes.length ? r.changes : [t('crew.proof.fixed')]; delete x.tr; x.showTr = false; });
    await log(done, done ? r.changes.join(' · ') : t('crew.log.moved'), { text: clip(next, 900) });
    return done ? next : '';
  } catch (e) { if (!isAbort(e)) { console.warn('[막후 · 다시쓰기]', e); await log(false, errMsg(e).slice(0, 200)); } return ''; } finally { chatApi.setStatus(''); }
}
/** 고친 답장을 원문으로 되돌린다 (다시 고치지 않게 표시해 둔다) */
export async function revertFix(m: Msg) {
  const s = m.swipes[m.sw] as CrewSwipe; if (s.crewOrig == null) return;
  s.text = s.crewOrig; delete s.crewOrig; delete s.crewFix; s.crewKept = true; delete s.tr; s.showTr = false;
  await chatApi.save(); chatApi.redraw();
}

/** 객석이 낸 줄을 다듬는다: 자리 번호가 맞고 글이 있는 것만, 여섯 줄까지 */
export function cleanSeats(v: unknown, n: number): SeatLine[] {
  const a = Array.isArray(v) ? v : Array.isArray((v as { lines?: unknown })?.lines) ? (v as { lines: unknown[] }).lines : [];
  return a.map(x => x as { who?: unknown; text?: unknown }).filter(x => x && typeof x.text === 'string' && x.text.trim()).map(x => ({ who: Math.abs(Math.round(+(x.who as number) || 0)) % n, text: String(x.text).trim().slice(0, 280) })).slice(0, 6);
}
const FIELDS = ['description', 'personality', 'scenario'];
/** 제안을 검토함에 넣는다 (같은 제안은 다시 넣지 않는다) */
function propose(chat: CrewChat, kind: string, out: unknown, turn: number): number {
  const s = st(chat), pend = (s.pending ||= []), j = (out && typeof out === 'object' ? out : {}) as Record<string, unknown>; let n = 0;
  if (kind === 'growth') for (const e of (Array.isArray(j.edits) ? j.edits : []) as Record<string, unknown>[]) {
    const ch = charsOf(chat).find(c => c.name.trim().toLowerCase() === String(e.char || '').trim().toLowerCase()) || (charsOf(chat).length === 1 ? charsOf(chat)[0] : null), field = String(e.field || ''), oldText = String(e.oldText || ''), newText = String(e.newText || '').trim();
    if (!ch || !FIELDS.includes(field) || !newText || newText === oldText.trim() || String(ch[field] || '').includes(newText)) continue;
    if (pend.some(p => p.kind === 'card' && p.charId === ch.id && p.field === field && p.newText === newText)) continue;
    pend.push({ id: uid(), kind: 'card', turn, ts: now(), charId: ch.id, field, oldText, newText, reason: clip(e.reason, 300) }); n++;
  }
  if (kind === 'keeper') for (const e of (Array.isArray(j.entries) ? j.entries : []) as Record<string, unknown>[]) {
    const name = String(e.name || '').trim(), content = String(e.content || '').trim(), keys = (Array.isArray(e.keys) ? e.keys : []).map(k => String(k).trim()).filter(Boolean).slice(0, 6);
    if (!name || !content || pend.some(p => p.kind === 'lore' && p.name?.toLowerCase() === name.toLowerCase() && p.content === content)) continue;
    pend.push({ id: uid(), kind: 'lore', turn, ts: now(), action: e.action === 'update' ? 'update' : 'add', name, keys: keys.length ? keys : [name], content }); n++;
  }
  return n;
}
/** 답장 뒤의 일: 다시쓰기(최대 1회) → 나머지 조수 묶음(최대 1회) */
export async function after(chat: CrewChat, m: Msg, type: string, only?: CrewDef) {
  if (!cfg().on || type === 'impersonate' || m.role !== 'assistant' || inCall(chat)) return;
  const c = chatApi.current(), msgs = c.chat?.id === chat.id ? c.msgs : await S.msgs(chat.id), sw = m.sw, again = type !== 'normal', turn = turnOf(msgs);
  let text = m.swipes[sw]?.text || ''; if (!text.trim()) return;
  const list = only ? [only] : defs().filter(d => d.phase === 'after' && due(d, chat, msgs, turn, again));
  const rw = list.filter(d => d.out === 'rewrite'), rest = list.filter(d => d.out !== 'rewrite');
  if (rw.length && (only || !autoSwipeWill(text))) text = (await rewrite(rw, chat, msgs, m, sw, turn, !!only)) || text;
  if (rest.length) {
    if (only) chatApi.setStatus(t('crew.status.after', { names: rest.map(nameOf).join(' · ') }));
    try {
      const out = await batch(rest, chat, msgs, only ? 'manual' : 'after', turn, { latest: text }); let found = 0;
      const keep: Record<string, unknown> = {};
      for (const d of rest) {
        const r = out[d.id]; if (!r) continue;
        if (d.kind === 'seats') { const lines = cleanSeats(r.out, seatsOf(chat.id, getLang()).length); if (lines.length) keep.seats = lines; }
        else if (d.kind === 'growth' || d.kind === 'keeper') found += propose(chat, d.kind, r.out, turn);
        else keep[d.id] = d.out === 'json' ? r.out : clip(asText(r.out), 2000);
      }
      if (Object.keys(keep).length) await commit(chat, m.id, sw, text, s => { s.crew = { ...(s.crew || {}), ...keep }; });
      await saveChat(chat);
      if (found) toast(t('crew.review.arrived', { n: found }));
      if (keep.seats) emit('crew:seats', { chatId: chat.id, msgId: m.id });
    } finally { if (only) chatApi.setStatus(''); }
  }
  emit('crew:changed');
}
/** 조수 하나를 지금 돌린다 (간격과 상관없이). 답장 전 조수의 결과는 다음 답장에 쓰인다 */
export async function runNow(chat: CrewChat, d: CrewDef) {
  const { msgs, busy } = chatApi.current(); if (busy) return toast(t('crew.err.busy'));
  if (!cfg().on) return toast(t('crew.err.off'));
  if (d.free) return toast(t('crew.err.free'));
  if (d.phase === 'before') { chatApi.setStatus(t('crew.status.before', { names: nameOf(d) })); try { await prepare({ chat, msgs, type: 'normal' }, d); } finally { chatApi.setStatus(''); } }
  else { const m = [...msgs].reverse().find(x => x.role === 'assistant' && !x.hidden); if (!m) return toast(t('crew.err.noReply')); await after(chat, m, 'regen', d); }
  toast(t('crew.ran', { name: nameOf(d) }), 'ok');
}

// ════════ 검토: 받아들이기 · 거절 · 되돌리기 ════════
export const bookOf = (chat: CrewChat): Lore | undefined => S.get('lore', chat.crew?.loreId || '');
async function ensureBook(chat: CrewChat): Promise<Lore> {
  let b = bookOf(chat);
  if (!b) { b = newLore({ name: t('crew.keeper.book', { name: roomName(chat) }) }); await S.save('lore', b); st(chat).loreId = b.id; if (!chat.loreIds.includes(b.id)) chat.loreIds.push(b.id); await saveChat(chat); }
  return b;
}
const entryOf = (b: Lore | undefined, name?: string) => b?.entries.find(e => (e.name || '').trim().toLowerCase() === String(name || '').trim().toLowerCase());
/** 낡은 제안인가: 제안이 만들어진 뒤 카드가 바뀌어 바꿀 구절이 사라졌다 */
export function isStale(_chat: CrewChat, p: Proposal): boolean {
  if (p.kind !== 'card') return false;
  const ch = S.get('chars', p.charId || ''); if (!ch) return true;
  const cur = String(ch[p.field || ''] || '');
  return (!!p.oldText && !cur.includes(p.oldText)) || cur.includes(p.newText || '\u0000');
}
/** 제안이 바꾸려는 지금 글과 바뀐 뒤의 글 (검토 창의 비교에 쓴다) */
export function sidesOf(chat: CrewChat, p: Proposal): { before: string; after: string } {
  if (p.kind === 'card') return { before: p.oldText || '', after: p.newText || '' };
  return { before: entryOf(bookOf(chat), p.name)?.content || '', after: p.content || '' };
}
export async function accept(chat: CrewChat, p: Proposal): Promise<boolean> {
  const s = st(chat), done: Applied = { ...p, at: now() };
  if (p.kind === 'card') {
    const ch = S.get('chars', p.charId || ''); if (!ch || isStale(chat, p)) { toast(t('crew.review.stale'), 'err'); return false; }
    const f = p.field!, cur = String(ch[f] || ''); done.before = cur;
    (ch as Record<string, unknown>)[f] = p.oldText ? cur.replace(p.oldText, () => p.newText!) : (cur.trimEnd() ? cur.trimEnd() + '\n' : '') + p.newText;
    await S.save('chars', ch);
  } else {
    const b = await ensureBook(chat), e = entryOf(b, p.name);
    if (e) { done.before = e.content; done.entryId = e.id; e.content = p.content!; e.keys = [...new Set([...e.keys, ...(p.keys || [])])]; }
    else { const ne = newEntry({ name: p.name!, keys: p.keys || [p.name!], content: p.content! }); b.entries.push(ne); done.entryId = ne.id; }
    done.loreId = b.id; await S.save('lore', b);
  }
  s.pending = (s.pending || []).filter(x => x.id !== p.id); (s.done ||= []).unshift(done); if (s.done.length > 40) s.done.length = 40;
  await saveChat(chat); emit('crew:changed'); return true;
}
export async function reject(chat: CrewChat, p: Proposal) { const s = st(chat); s.pending = (s.pending || []).filter(x => x.id !== p.id); await saveChat(chat); emit('crew:changed'); }
export async function undo(chat: CrewChat, a: Applied): Promise<boolean> {
  if (a.undone) return false;
  if (a.kind === 'card') {
    const ch = S.get('chars', a.charId || ''), f = a.field!; if (!ch) return false;
    const cur = String(ch[f] || ''); if (!cur.includes(a.newText!)) { toast(t('crew.review.cantUndo'), 'err'); return false; }
    (ch as Record<string, unknown>)[f] = a.oldText ? cur.replace(a.newText!, () => a.oldText!) : cur.replace(a.newText!, '').trimEnd();
    await S.save('chars', ch);
  } else {
    const b = S.get('lore', a.loreId || ''), e = b?.entries.find(x => x.id === a.entryId); if (!b || !e) { toast(t('crew.review.cantUndo'), 'err'); return false; }
    if (a.before == null) b.entries = b.entries.filter(x => x !== e); else e.content = a.before;
    await S.save('lore', b);
  }
  a.undone = true; await saveChat(chat); emit('crew:changed'); return true;
}
/** 검토를 기다리는 제안이 있는 대화들 */
export const waiting = () => (S.chats as CrewChat[]).filter(c => c.crew?.pending?.length);

// ════════ 맞춤 조수: 만들기 · 가져오기 · 내보내기 ════════
export const blank = (): CrewDef => ({ id: 'c' + uid().slice(-7), name: t('crew.edit.newName'), desc: '', phase: 'after', out: 'aside', every: 1, keywords: [], maxSkip: 0, modes: ['rp'], prompt: '', where: 'depth', depth: 1, max: 300 });
/** 밖에서 온 조수 자료를 믿을 수 있는 꼴로 다듬는다. id 는 새로 준다 (내장 조수를 덮어쓰지 못하게) */
export function tidy(o: unknown): CrewDef | null {
  const x = (o && typeof o === 'object' ? o : {}) as Record<string, unknown>; if (typeof x.prompt !== 'string' || !x.prompt.trim()) return null;
  const one = <T extends string>(v: unknown, ok: readonly T[], d: T): T => ok.includes(v as T) ? v as T : d;
  const modes = (Array.isArray(x.modes) ? x.modes : []).filter((m): m is Mode => ['rp', 'talk', 'game'].includes(m as string));
  return { id: 'c' + uid().slice(-7), name: clip(x.name || 'Helper', 60), desc: clip(x.desc, 200), phase: one(x.phase, ['before', 'after'] as const, 'after'), out: one(x.out, ['inject', 'rewrite', 'aside', 'json'] as const, 'aside'),
    every: Math.max(1, Math.min(99, Math.round(+(x.every as number) || 1))), keywords: (Array.isArray(x.keywords) ? x.keywords : []).map(String).filter(Boolean).slice(0, 20), maxSkip: Math.max(0, Math.round(+(x.maxSkip as number) || 0)),
    modes: modes.length ? modes : ['rp'], prompt: String(x.prompt).slice(0, 8000), where: one(x.where, ['top', 'before', 'depth', 'end'] as const, 'depth'), depth: Math.max(0, Math.min(20, Math.round(+(x.depth as number) || 0))), max: Math.max(60, Math.min(2000, Math.round(+(x.max as number) || 300))) };
}
export const exportDefs = (list: CrewDef[]) => JSON.stringify({ app: 'dreamland', kind: 'crew', version: 1, helpers: list.map(d => { const { id: _id, builtin: _b, kind: _k, ...rest } = d; return rest; }) }, null, 2);
export function importDefs(text: string): CrewDef[] {
  const j = JSON.parse(text) as { helpers?: unknown[] } | unknown[];
  return (Array.isArray(j) ? j : Array.isArray(j.helpers) ? j.helpers : [j]).map(tidy).filter((d): d is CrewDef => !!d);
}
/** 답장 전 단계의 다시쓰기는 없다 — 편집기가 고르지 못하게 하고, 저장할 때도 한 번 더 맞춘다 */
export const fixDef = (d: CrewDef) => { if (d.out === 'rewrite') d.phase = 'after'; d.every = Math.max(1, Math.round(+d.every || 1)); return d; };
/** 지금 켜진 조수로 한 턴에 더 부를 수 있는 가장 많은 횟수 */
export function budget(chat?: CrewChat | null): { before: number; after: number; rewrite: number } {
  const on = defs().filter(d => !d.free && isOn(d, chat) && (!chat || d.modes.includes(modeNow(chat))));
  return { before: on.some(d => d.phase === 'before') ? 1 : 0, after: on.some(d => d.phase === 'after' && d.out !== 'rewrite') ? 1 : 0, rewrite: on.some(d => d.out === 'rewrite') ? 1 : 0 };
}
/** 가장 최근 결과 (서랍과 매크로가 쓴다) */
export function latestOf(chat: CrewChat, d: CrewDef, msgs: Msg[]): string {
  if (d.kind === 'scale') return chat.crew?.scale?.arc || '';
  if (d.phase === 'before') return chat.crew?.pre?.out?.[d.id] || '';
  for (let i = msgs.length - 1; i >= 0; i--) { const v = (msgs[i].swipes[msgs[i].sw] as CrewSwipe | undefined)?.crew?.[d.kind === 'seats' ? 'seats' : d.id]; if (v != null) return d.kind === 'seats' ? (v as SeatLine[]).map(l => l.text).join(' / ') : asText(v); }
  return '';
}
