// 전화 한 통의 흐름: 걸기 · 걸려 옴 · 받기/거절/부재중 · 주고받기(모델 → TTS 로 흘려 읽기) · 끊기 · 통화 카드 · 다음 대화의 반응
import * as E from '../lib/engine';
import type { Char, Chat, Msg } from '../lib/types';
import { S, emit, msgText, newMsg, now } from '../lib/core';
import { X, type PromptPiece } from '../lib/hooks';
import { Live, inQuietHours } from '../lib/live';
import { pickMotive, scheduleOf } from '../lib/f-schedule';
import { TTS, type SpeechStream } from '../tts/api';
import { cur, ui } from '../chat/store';
import { chatApi } from '../chat/actions';
import { toast } from '../ui';
import { callConn, cfg, prompt } from './cfg';
import { tt } from './strings';
import * as A from './audio';

export type Dir = 'in' | 'out';
export type Result = 'answered' | 'declined' | 'missed' | 'unanswered';
/** 통화의 한 마디. by: 말한 캐릭터(단체 통화) · alts/alt: "다른 답"으로 받아 둔 답들과 지금 고른 것 · note: 들어옴/나감 같은 알림 줄 */
export interface Line { who: 'u' | 'c'; text: string; cut?: boolean; at: number; by?: string; alts?: string[]; alt?: number; note?: boolean }
/** 대화 기록에 남는 통화 카드 (Msg.call) */
export interface CallRec { /** 함께 통화한 캐릭터들 (단체 통화 · 엿들은 통화) */ with?: string[]; /** 캐릭터끼리 한 통화를 엿들은 것 */ overheard?: boolean; dir: Dir; result: Result; dur: number; rec: boolean; cut?: boolean; endedBy?: 'user' | 'char'; lines?: Line[]; voicemail?: string; audio?: string; missedN?: number; calls: number }
/** 다음 대화에서 캐릭터가 알아차릴 일 (Chat.callPending) */
export interface Pending { kind: 'declined' | 'missed' | 'hungUp' | 'cut' | 'noAnswer' | 'charBye'; at: number; last?: string; activity?: string }
type CallChat = Chat & { callPending?: Pending; callLog?: { at: number; dir: Dir; result: Result; dur: number; msgId: string; charId: string }[]; callAuto?: { day: string; count: number; lastAt: number }; callMissed?: number };

export interface Session {
  chat: CallChat; msgs: Msg[]; char: Char; /** 통화에 들어와 있는 캐릭터들 (char 는 그 첫 사람) */ chars: Char[]; /** 걸었지만 받지 않은 사람들 */ absent: Char[]; dir: Dir; phase: 'ringing' | 'dialing' | 'connected' | 'ended';
  ringAt: number; startedAt: number; endedAt: number; lines: Line[]; status: string; activity: string; reason: string;
  rec: boolean; muted: boolean; speaker: boolean; hold: boolean; keypad: boolean; talking: boolean; calls: number; result?: Result;
}

// ── 화면이 구독하는 지금의 통화 ──
let S0: Session | null = null;
const subs = new Set<() => void>();
let ver = 0;
const changed = () => { ver++; subs.forEach(f => f()); };
export const subscribe = (f: () => void) => { subs.add(f); return () => { subs.delete(f); }; };
export const version = () => ver;
export const session = () => S0;

let gen: { abort: AbortController; speech: SpeechStream | null; acc: string; line: Line } | null = null;
let stopSound: (() => void) | null = null, stopAmb: (() => void) | null = null, ambKind: A.Ambient | '' = '', ringTimer = 0, recorder: MediaRecorder | null = null, chunks: Blob[] = [];
const sound = (f: (() => () => void) | null) => { stopSound?.(); stopSound = f && cfg().tones ? f() : null; };

const charOf = (chat: Chat) => S.get('chars', chat.charIds[0]);
/** 한 통화에 함께할 수 있는 캐릭터 수 */
export const MAX_PARTY = 4;
/** 이 방의 캐릭터들 */
export const membersOf = (chat: Chat): Char[] => chat.charIds.map(id => S.get('chars', id)).filter((c): c is Char => !!c);
/** 그 줄을 말한 캐릭터 */
export const charOfLine = (s: Session, l: Line): Char => lineChar(s, l);
/** 지금 상태 (온라인 · 자리 비움 …) */
export const statusOf = (chat: Chat, c: Char) => Live.presence(chat, c);
function lineChar(s: Session, l: Line): Char { return (l.by && (S.get('chars', l.by) as Char | undefined)) || s.char; }
const userName = (chat: Chat) => S.persona(chat).name || S.settings.userNameFallback || 'User';
export const fmtDur = (ms: number) => { const s = Math.max(0, Math.round(ms / 1000)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };

// ════════ 시작 ════════
function begin(chat: Chat, dir: Dir, reason = '', who?: Char[]): Session | null {
  if (S0 && S0.phase !== 'ended') { toast(tt('call.err.busy'), 'err'); return null; }
  queued = false;
  const chars = (who?.length ? who : [charOf(chat)]).filter((c): c is Char => !!c).slice(0, MAX_PARTY), ch = chars[0]; if (!ch) { toast(tt('call.err.noChar'), 'err'); return null; }
  if (!callConn(chat)) { toast(tt('call.err.noConn'), 'err'); return null; }
  const p = Live.presence(chat, ch);
  S0 = { chat, msgs: cur.chat === chat ? cur.msgs : [], char: ch, chars, absent: [], dir, phase: dir === 'in' ? 'ringing' : 'dialing', ringAt: now(), startedAt: 0, endedAt: 0, lines: [], status: p.status, activity: p.activity,
    reason, rec: cfg().rec, muted: false, speaker: TTS.enabled(), hold: false, keypad: false, talking: false, calls: 0 };
  return S0;
}

/** 내가 건다. 캐릭터 상태에 따라 안 받을 수도 있다. 그룹 방에서 who 없이 부르면 누구에게 걸지 고르는 화면을 연다 */
export function dial(chat: Chat | null = cur.chat, who?: Char[]) {
  if (!chat) return toast(tt('call.err.noChat'), 'err');
  if (cur.busy) return toast(tt('call.err.genBusy'), 'err');
  if (!who?.length && chat.charIds.length > 1) return openPicker(chat);
  const s = begin(chat, 'out', '', who); if (!s) return;
  sound(A.ringback); changed();
  // 상태가 받을 확률을 정한다: 온라인 거의 늘 · 반쯤 자리 비움 가끔 · 바쁨 드물게 · 오프라인 안 받음. 단체 통화는 사람마다 따로 정한다
  const odds = (c: Char) => ({ online: 0.95, idle: 0.65, dnd: 0.25, offline: 0 }[Live.presence(chat, c).status as 'online'] ?? 0.9);
  const joined = s.chars.filter(c => Math.random() < odds(c)), pick = joined.length > 0;
  const wait = 2500 + Math.random() * (pick ? 4000 : 0) + (pick ? 0 : Math.min(cfg().ringSec, 12) * 1000);
  ringTimer = window.setTimeout(() => {
    if (S0 !== s || s.phase !== 'dialing') return;
    if (!pick) return void finish('unanswered');
    s.absent = s.chars.filter(c => !joined.includes(c)); s.chars = joined; s.char = joined[0];
    const p = Live.presence(chat, s.char); s.status = p.status; s.activity = p.activity;
    void connect();
  }, wait);
}

// ── 그룹 방: 누구에게 걸지 고르기 ──
export interface Picker { chat: Chat; sel: string[]; busy: boolean }
let P0: Picker | null = null;
export const picker = () => P0;
export function openPicker(chat: Chat) { if (S0 && S0.phase !== 'ended') return toast(tt('call.err.busy'), 'err'); P0 = { chat, sel: [], busy: false }; changed(); }
export function closePicker() { if (P0 && !P0.busy) { P0 = null; changed(); } }
export function togglePick(id: string) {
  const p = P0; if (!p || p.busy) return;
  if (p.sel.includes(id)) p.sel = p.sel.filter(x => x !== id); else if (p.sel.length < MAX_PARTY) p.sel = [...p.sel, id]; else toast(tt('call.pick.max', { count: MAX_PARTY }));
  changed();
}
export function dialPicked() {
  const p = P0; if (!p || p.busy || !p.sel.length) return;
  const who = membersOf(p.chat).filter(c => p.sel.includes(c.id)); P0 = null; dial(p.chat, who);
}

/** 캐릭터가 건다 (자동 · /call ring) */
export function ring(chat: Chat | null = cur.chat, reason = '', charId = '') {
  if (!chat) return;
  const ch = (charId && chat.charIds.includes(charId) ? S.get('chars', charId) : null) || charOf(chat); if (!ch) return;
  P0 = null;
  const s = begin(chat, 'in', reason || reasonFor(chat, ch), [ch]); if (!s) return;
  sound(A.ringtone); changed();
  ringTimer = window.setTimeout(() => { if (S0 === s && s.phase === 'ringing') void finish('missed'); }, Math.max(5, cfg().ringSec) * 1000);
}
/** 대화 모드 답장의 [call]: 캐릭터가 스스로 건다. 설정에서 끌 수 있고, 이미 통화 중이거나 다른 방으로 옮겼으면 걸지 않는다 */
export function aiRing(chat: Chat, reason = '', lines = 1, charId = '') {
  if (cfg().aiCall === false || !chat || chat.mode !== 'talk') return;
  const wait = 1200 + Math.min(10, Math.max(1, lines)) * 900;   // 말풍선이 차례로 다 나온 뒤
  window.setTimeout(() => { if (cur.chat === chat && (!S0 || S0.phase === 'ended') && !P0 && !cur.busy && callConn(chat)) { if (S0) close(); ring(chat, reason, charId); } }, wait);
}
export const accept = () => { if (S0?.phase === 'ringing') void connect(); };
export const decline = () => { if (S0?.phase === 'ringing') void finish('declined'); };
/** 받지 않고 문자로 답한다: 거절하고 입력창으로 간다 */
export function textInstead() { if (S0?.phase !== 'ringing') return; void finish('declined'); setTimeout(() => ui.input?.focus(), 1700); }

async function connect() {
  const s = S0; if (!s) return;
  clearTimeout(ringTimer); sound(null); if (cfg().tones) A.connectTone();
  s.phase = 'connected'; s.startedAt = now(); (s.chat as CallChat).callMissed = 0; changed();
  const amb = cfg().ambient, kind = amb === 'auto' ? A.ambientFor(s.activity) : amb === 'off' ? '' : amb;
  ambKind = kind; if (kind) stopAmb = A.ambient(kind);
  if (s.rec) startRec();
  await runRound(s, [...s.chars], 'open');   // 받은 사람마다 한마디씩
}

// ════════ 주고받기 ════════
/** 내가 한 말 */
export async function userSays(text: string) {
  const s = S0; if (!s || s.phase !== 'connected' || s.muted || s.hold) return;
  const t = text.trim();
  // 빈 채로 보내면 내 말 없이 잠깐의 침묵 — 상대가 이어서 말한다
  if (t) { s.lines.push({ who: 'u', text: t, at: now() }); changed(); }
  // 캐릭터가 말하는 중(또는 답을 준비하는 중)이면 끊지 않는다: 하던 말을 마친 뒤, 그사이 보낸 말까지 보고 이어서 답한다
  if (gen || rounding) { if (t) queued = true; return; }
  await runRound(s, responders(s, t), 'reply');
}
/** 지금 한 차례(여러 사람이 차례로 말하는 중일 수 있다)가 돌고 있다 */
let rounding = false;
/** 마지막으로 말한 사람의 목소리 (다 읽은 뒤에 다음 사람이 말한다) */
let lastSpeech: SpeechStream | null = null;
const nameHit = (text: string, name: string) => { const t = text.toLowerCase(), n = name.trim().toLowerCase(); return !!n && (t.includes(n) || (n.length > 2 && t.includes(n.split(/\s+/)[0]))); };
/** 이번에 대답할 사람들. 혼자면 그 사람. 여럿이면: 이름을 부른 사람 → 없으면 방금 말하지 않은 사람 가운데 말수(talk)에 따라 한 명, 가끔 한 명 더 끼어든다 */
function responders(s: Session, said: string): Char[] {
  if (s.chars.length <= 1) return [s.char];
  const named = s.chars.filter(c => nameHit(said, c.name)); if (named.length) return named.slice(0, 2);
  const lastBy = [...s.lines].reverse().find(l => l.who === 'c' && !l.note)?.by, pool = s.chars.filter(c => c.id !== lastBy), from = pool.length ? pool : s.chars;
  const draw = (list: Char[]) => { const total = list.reduce((n, c) => n + (c.talk || 0.5), 0); let r = Math.random() * total; for (const c of list) { r -= c.talk || 0.5; if (r <= 0) return c; } return list[list.length - 1]; };
  const first = draw(from), rest = s.chars.filter(c => c !== first);
  return rest.length && Math.random() < 0.3 ? [first, draw(rest)] : [first];
}
/** 한 차례: who 가 차례로 말한다. 그사이 내가 보낸 말이 있으면 끝난 뒤 이어서 한 차례 더 */
async function runRound(s: Session, who: Char[], kind: 'open' | 'reply' | 'join') {
  if (rounding) return; rounding = true;
  try {
    for (const ch of who) {
      if (S0 !== s || s.phase !== 'connected' || !s.chars.includes(ch)) break;
      await say(kind, ch);
      await lastSpeech?.done.catch(() => { });   // 읽던 목소리는 다 읽고 나서
    }
  } finally { rounding = false; }
  if (queued && S0 === s && s.phase === 'connected' && !gen) { queued = false; const said = [...s.lines].reverse().find(l => l.who === 'u')?.text || ''; await runRound(s, responders(s, said), 'reply'); }
}
/** 캐릭터가 말하는 동안 내가 보낸 말이 있다 (말을 마치면 이어서 답한다) */
let queued = false;

const pendText = (p: Pending) => prompt(p.kind).replace(/\{\{last\}\}/g, p.last || '').replace(/\{\{activity\}\}/g, p.activity || 'busy');
let active: { chat: Chat; kind: 'open' | 'reply' | 'voicemail' | 'join'; ch: Char } | null = null;
/** 지금 이 방의 통화 대사를 받고 있는가 — 통화 중에는 삽화 · 게임 지시를 싣지 않는다 (말로 하는 대사에 태그가 섞이지 않게) */
export const inCall = (chat?: unknown) => !!active && (!chat || active.chat === chat);
/** 통화 중일 때만 프롬프트 끝에 붙는 조각 (X.prompt) */
export function promptPieces(chat: Chat): PromptPiece[] {
  const c = chat as CallChat;
  if (active && active.chat === chat && S0) {
    const s = S0, fill = (t: string) => t.replace(/\{\{status\}\}/g, s.activity ? `${s.status}, ${s.activity}` : s.status).replace(/\{\{reason\}\}/g, s.reason || 'you just wanted to hear their voice');
    // 통화를 여는 말에는 지난 통화에서 남은 일(거절 · 부재중 · 끊김)도 함께 알려 준다
    const parts = [active.kind === 'voicemail' ? '' : prompt('style'), active.kind === 'open' ? prompt(s.dir === 'in' ? 'incoming' : 'pickup') : active.kind === 'voicemail' ? prompt('voicemail') : '', active.kind === 'open' && c.callPending ? pendText(c.callPending) : ''].filter(Boolean).map(fill);
    // 단체 통화 · 중간에 들어온 사람 (프롬프트 설정과 별개로 덧붙인다)
    const me = active.ch, others = s.chars.filter(c => c !== me).map(c => c.name);
    if (others.length) parts.push(`This is a group call. On the line right now: ${[me.name, ...others].join(', ')} and {{user}}. You are ${me.name}: say only ${me.name}'s own next spoken turn, keep it short, react to what the others just said, and never speak for anyone else.`);
    if (active.kind === 'join') parts.push(`You were just added to this call while it was already going on. Say hello in ${me.name}'s own way and catch up naturally.`);
    return [{ where: 'end', content: parts.join('\n\n'), src: 'call' }];
  }
  const p = c.callPending; if (!p) return [];
  return [{ where: 'end', content: pendText(p), src: 'call' }];
}

const strip = (raw: string, name: string) => {
  let t = E.splitThink(raw).text.replace(/<think(ing)?>[\s\S]*$/i, '');
  // 삽화 계획 같은 숨은 주석은 말이 아니다 (받는 도중이라 아직 닫히지 않은 것도 지운다)
  t = t.replace(/<!--[\s\S]*?-->/g, '').replace(/<!--[\s\S]*$/, '').replace(/<!?-?-?$/, '');
  t = t.replace(/\[(react|status|schedule_update|selfie|memory|time|later|scene|scene_end|call)\b[^\]]*\]?/gi, '').replace(/\[hangup\]?/gi, '');
  t = t.replace(new RegExp('^\\s*' + name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s*:\\s*'), '').replace(/\[$|\[[a-z_]*$/i, '').replace(/<\/?[a-z]*$/i, '');
  // 따옴표로 감싼 말은 벗긴다
  t = t.replace(/^"([\s\S]*)"$/, '$1');
  return t;
};

/** 캐릭터가 말한다 (모델 호출 1회). 흘러나오는 대로 TTS 가 문장 단위로 읽는다 */
async function say(kind: 'open' | 'reply' | 'voicemail' | 'join', who?: Char): Promise<string> {
  const s = S0; if (!s) return '';
  const chat = s.chat, ch = who || s.char, conn = callConn(chat); if (!conn) return '';
  const preset = S.presetFor(chat), persona = S.persona(chat);
  const mark = newMsg('system', 'Phone call started');
  const history = kind === 'voicemail' ? [...s.msgs] : [...s.msgs, mark, ...s.lines.filter(l => l.text).map(l => l.note ? newMsg('system', l.text) : l.who === 'u' ? newMsg('user', l.text, { name: persona.name }) : newMsg('assistant', l.text, { charId: lineChar(s, l).id, name: lineChar(s, l).name }))];
  if (kind !== 'voicemail' && history[history.length - 1]?.role !== 'user') history.push(newMsg('user', kind === 'open' ? (s.dir === 'in' ? '(picks up the phone)' : '(calling…)') : '…', { name: persona.name }));
  const pres = ch === s.char ? { status: s.status, activity: s.activity } : Live.presence(chat, ch);
  const keep = chat.presence; chat.presence = { status: pres.status, activity: pres.activity };
  active = { chat, kind, ch };
  let built: E.Built;
  try { built = E.buildPrompt({ chat, char: ch, chars: s.chars.length > 1 ? s.chars : [ch], persona, preset, msgs: history, type: 'normal', commit: false }); }
  catch (e) { console.error(e); toast(String(e), 'err'); return ''; }
  finally { active = null; if (keep === undefined) delete chat.presence; else chat.presence = keep; }
  const line: Line = { who: 'c', text: '', at: now(), by: ch.id };
  if (kind !== 'voicemail') s.lines.push(line);
  const speech = kind !== 'voicemail' && s.speaker && TTS.enabled() ? TTS.stream({ charId: ch.id }) : null;
  lastSpeech = speech;
  const g = gen = { abort: new AbortController(), speech, acc: '', line };
  s.talking = true; s.calls++; changed();
  let sent = '', hung = false;
  try {
    await E.streamChat(conn, { ...preset.params, maxTokens: Math.max(40, +cfg().tokens || 500), stop: [...(preset.params.stop || [])], names: { char: ch.name, user: persona.name } }, built.messages, {
      signal: g.abort.signal,
      onText: d => {
        g.acc += d; const vis = strip(g.acc, ch.name);
        line.text = vis.trim();
        if (/\[hangup\]/i.test(g.acc)) hung = true;
        // 앞부분이 달라졌으면(이름 머리말 · 생각 묶음이 뒤늦게 지워짐) 읽은 자리를 다시 맞춘다 — 안 그러면 그 뒤로 소리가 끊긴다
        if (speech && !s.hold) { if (vis.startsWith(sent)) speech.push(vis.slice(sent.length)); sent = vis; }
        changed();
      },
    });
    speech?.end();
    // 목소리를 못 만들었으면 한 번 알리고 스피커를 끈다 (글로는 계속 통화)
    if (speech) void speech.done.then(() => { const e = (speech as { error?: unknown }).error; if (e && S0 === s && s.speaker) { s.speaker = false; toast(String((e as Error)?.message || e), 'err'); changed(); } });
  } catch (e) {
    if (!(e instanceof Error && e.name === 'AbortError')) { console.error(e); toast(String((e as Error)?.message || e), 'err'); }
  } finally {
    if (gen === g) gen = null;
    s.talking = !!gen;   // 뒤이어 시작한 답이 있으면 그 "말하는 중" 표시는 그대로 둔다
    const text = (built.talk ? E.parseTalk(strip(g.acc, ch.name)).text : strip(g.acc, ch.name)).trim();
    if (!line.cut) line.text = text;
    if (!line.text && kind !== 'voicemail') { const i = s.lines.indexOf(line); if (i >= 0) s.lines.splice(i, 1); }
    changed();
  }
  if (hung && S0 === s && s.phase === 'connected') {
    await speech?.done;
    // 단체 통화에서는 그 사람만 나가고 통화는 이어진다. 마지막 사람이면 통화가 끝난다
    if (s.chars.length > 1 && s.chars.includes(ch)) leave(s, ch);
    else { queued = false; void finish('answered', 'char'); }
  }
  return kind === 'voicemail' ? strip(g.acc, ch.name).trim() : line.text;
}

/** 캐릭터가 말하던 중이면 멈춘다. 그때까지 나온 말만 남기고 "끊김" 표시 */
function stopTalking(interrupted: boolean) {
  const g = gen; if (!g) return; gen = null;
  g.abort.abort(); g.speech?.stop();
  g.line.text = strip(g.acc, S0?.char.name || '').trim();
  if (interrupted && g.line.text) g.line.cut = true;
  if (S0) S0.talking = false;
}

// ════════ 통화 중 조작: 사람 추가 · 내보내기 · 다른 답 · 고치기 · 다시 듣기 · 대필 ════════
function leave(s: Session, ch: Char) {
  s.chars = s.chars.filter(c => c !== ch); if (s.char === ch) s.char = s.chars[0];
  s.lines.push({ who: 'c', by: ch.id, note: true, text: `(${ch.name} left the call)`, at: now() }); changed();
}
/** 통화 중에 이 방의 다른 캐릭터를 부른다 (들어오며 한마디 한다) */
export async function invite(charId: string) {
  const s = S0; if (!s || s.phase !== 'connected' || s.chars.length >= MAX_PARTY || s.chars.some(c => c.id === charId)) return;
  const ch = membersOf(s.chat).find(c => c.id === charId); if (!ch) return;
  s.chars = [...s.chars, ch]; s.absent = s.absent.filter(c => c !== ch);
  s.lines.push({ who: 'c', by: ch.id, note: true, text: `(${ch.name} joined the call)`, at: now() }); changed();
  if (gen || rounding) return;   // 누가 말하는 중이면 인사는 건너뛴다 — 다음 차례부터 함께한다
  await runRound(s, [ch], 'join');
}
/** 한 사람을 통화에서 내보낸다 (혼자 남은 사람은 내보낼 수 없다 — 끊기를 쓴다) */
export function kick(charId: string) {
  const s = S0; if (!s || s.phase !== 'connected' || s.chars.length <= 1) return;
  const ch = s.chars.find(c => c.id === charId); if (!ch) return;
  if (gen?.line.by === charId) stopTalking(true);
  leave(s, ch);
}
/** 맨 끝의 캐릭터 대사 (그 뒤에 내 말이 없을 때만) — "다른 답"과 ‹ › 가 다루는 줄 */
export function lastReply(s: Session | null = S0): Line | null { const l = s?.lines[s.lines.length - 1]; return l && l.who === 'c' && !l.note && !!l.text ? l : null; }
/** 다른 답: 마지막 대사를 새로 받는다. 앞서 받은 답들은 남아 ‹ › 로 오갈 수 있다 */
export async function another() {
  const s = S0, l = lastReply(s); if (!s || !l || s.phase !== 'connected' || gen || rounding || s.hold) return;
  const prev = l.alts?.length ? l.alts : [l.text], ch = lineChar(s, l), at = s.lines.indexOf(l);
  TTS.stopAll(); s.lines.splice(at, 1); changed();
  rounding = true;
  try { await say('reply', ch); } finally { rounding = false; }
  if (S0 !== s) return;
  const nl = s.lines[s.lines.length - 1];
  if (nl && nl.who === 'c' && !nl.note && nl.text && nl.by === l.by) { nl.alts = [...prev, nl.text]; nl.alt = nl.alts.length - 1; }
  else if (s.phase === 'connected' && !s.lines.includes(l)) s.lines.splice(Math.min(at, s.lines.length), 0, l);   // 새 답을 못 받았으면 원래 대사를 되돌린다
  changed();
}
/** ‹ › : 받아 둔 답들 사이를 오간다 */
export function swipe(dir: number) {
  const s = S0, l = lastReply(s); if (!s || !l || !l.alts || l.alts.length < 2 || gen || rounding) return;
  l.alt = ((l.alt ?? l.alts.length - 1) + dir + l.alts.length) % l.alts.length; l.text = l.alts[l.alt]; delete l.cut; changed();
  replay(s.lines.indexOf(l));
}
/** 대사를 고친다 (내 말 · 상대 말 모두). 이후의 답은 고친 대사를 보고 이어진다 */
export function editLine(i: number, text: string) {
  const s = S0, l = s?.lines[i], t = text.trim(); if (!s || !l || l.note || !t || gen?.line === l) return;
  l.text = t; delete l.cut; if (l.alts && l.alt != null) l.alts[l.alt] = t; changed();
}
/** 그 대사를 다시 들려준다 (캐릭터 대사 · 읽어 주기가 켜져 있을 때) */
export function replay(i: number) {
  const s = S0, l = s?.lines[i]; if (!s || !l || l.who !== 'c' || l.note || !l.text || !TTS.enabled()) return;
  TTS.stopAll(); void TTS.speak(l.text, { charId: lineChar(s, l).id }).catch(() => { });
}
/** 대필: 내가 할 말을 대신 써 준다. hint 가 있으면 그 뜻대로 (초안이면 다듬는다). 입력창에 넣을 글을 돌려준다 */
export async function ghost(hint = ''): Promise<string> {
  const s = S0; if (!s || s.phase !== 'connected') return '';
  const chat = s.chat, conn = callConn(chat); if (!conn) return '';
  const u = userName(chat), persona = S.persona(chat), others = s.chars.map(c => c.name).join(', ');
  const script = s.lines.filter(l => l.text && !l.note).slice(-16).map(l => `${l.who === 'u' ? u : lineChar(s, l).name}: ${l.text}`).join('\n');
  const sys = [`You are helping ${u} on a live phone call with ${others}. Write the next thing ${u} says out loud.`,
    persona.description ? `About ${u}: ${String(persona.description).slice(0, 1200)}` : '',
    `Rules: only ${u}'s spoken words, one or two short sentences, natural speech in the language the call is in, no quotation marks, no narration, no name label.`,
    hint ? `${u} wants to say this (keep the intent; if it is already a draft line, polish it): ${hint}` : `Decide what ${u} would naturally say next.`].filter(Boolean).join('\n');
  s.calls++; changed();
  try { return strip(await E.quickCall(sys, script || '(the call has just started)', { maxTokens: 200, conn }), u).trim(); }
  catch (e) { toast(String((e as Error)?.message || e), 'err'); return ''; }
}

// ════════ 통화 엿듣기: 이 방의 캐릭터끼리 하는 통화를 통째로 써서 기록으로 남긴다 ════════
/** 고른 사람들(2~4명)끼리의 통화를 모델이 한 번에 쓴다. 내 캐릭터는 그 통화에 없다. 대화에 통화 카드가 남고, 녹취록에서 들을 수 있다 */
export async function overhear(chat: Chat, ids: string[], topic = ''): Promise<boolean> {
  const who = membersOf(chat).filter(c => ids.includes(c.id)).slice(0, MAX_PARTY), conn = callConn(chat);
  if (who.length < 2) { toast(tt('call.pick.needTwo'), 'err'); return false; }
  if (!conn) { toast(tt('call.err.noConn'), 'err'); return false; }
  const u = userName(chat), names = who.map(c => c.name), msgs = cur.chat === chat ? cur.msgs : await S.msgs(chat.id);
  const recent = msgs.filter(m => !m.hidden && m.role !== 'system').slice(-14).map(m => `${m.role === 'user' ? u : m.name || S.get('chars', m.charId)?.name || '?'}: ${msgText(m).slice(0, 500)}`).join('\n');
  const sys = [`Write a private phone call between ${names.join(' and ')}, characters of an ongoing story. ${u} is NOT on this call and does not hear it.`,
    ...who.map(c => `About ${c.name}: ${[c.description, c.personality].filter(Boolean).join(' ').slice(0, 1400)}`),
    topic ? `What the call is about: ${topic}` : 'They talk about what is going on in the story right now, the way these people really would when no one else is listening.',
    `Format: 10 to 16 turns, one per line, exactly "Name: spoken words". Spoken words only — no narration, no stage directions, no quotation marks. Each line starts with one of: ${names.join(', ')}. Write in the language of the story. End the call naturally.`].join('\n');
  const out = E.splitThink(await E.quickCall(sys, recent ? `Recent story so far:\n${recent}` : '(the story has just begun)', { maxTokens: 1400, conn })).text;
  const lines: Line[] = [];
  for (const row of out.split('\n')) {
    const m = row.match(/^\s*[-*]?\s*\**([^:：*]{1,40})\**\s*[:：]\s*(.+)$/); if (!m) continue;
    const ch = who.find(c => c.name.trim().toLowerCase() === m[1].trim().toLowerCase()) || who.find(c => nameHit(m[1], c.name)); if (!ch) continue;
    const text = m[2].trim().replace(/^["“「『](.*)["”」』]$/, '$1'); if (text) lines.push({ who: 'c', by: ch.id, text, at: now() });
  }
  if (lines.length < 2) { toast(tt('call.listen.fail'), 'err'); return false; }
  const dur = lines.reduce((n, l) => n + 1500 + l.text.length * 90, 0);
  const body = lines.map(l => `${S.get('chars', l.by!)?.name}: ${l.text}`).join('\n');
  const text = `Phone call between ${names.join(' and ')} · ${fmtDur(dur)} (${u} was not on this call and knows nothing of it unless told)\n${body}`;
  const rec: CallRec = { with: who.map(c => c.id), overheard: true, dir: 'out', result: 'answered', dur, rec: true, calls: 1, lines };
  const m = newMsg('system', text, { call: rec, charId: who[0].id, name: who[0].name });
  if (cur.chat === chat && chatApi.push) await chatApi.push(m); else { msgs.push(m); await S.saveMsgs(chat, msgs); }
  emit('call:end', { chat, msg: m });
  return true;
}
/** 고르는 화면에서: 고른 사람들끼리의 통화를 엿듣는다 */
export async function overhearPicked(topic = '') {
  const p = P0; if (!p || p.busy || p.sel.length < 2) return;
  p.busy = true; changed();
  let ok = false;
  try { ok = await overhear(p.chat, p.sel, topic); } catch (e) { toast(String((e as Error)?.message || e), 'err'); }
  if (P0 === p) { if (ok) P0 = null; else p.busy = false; changed(); }
  if (ok) toast(tt('call.listen.done'), 'ok');
}

// ════════ 버튼 ════════
export function toggle(k: 'rec' | 'muted' | 'speaker' | 'hold' | 'keypad') {
  const s = S0; if (!s) return;
  s[k] = !s[k];
  if (k === 'speaker') { if (s.speaker && !TTS.enabled()) toast(tt('call.err.ttsOff')); if (!s.speaker) { gen?.speech?.stop(); if (gen) gen.speech = null; TTS.stopAll(); } }
  if (k === 'hold') { if (s.hold) { gen?.speech?.stop(); if (gen) gen.speech = null; TTS.stopAll(); stopAmb?.(); stopAmb = null; sound(A.holdTone); } else { sound(null); if (ambKind) stopAmb = A.ambient(ambKind); } }
  if (k === 'rec') { if (s.rec) startRec(); else stopRec(); }
  changed();
}
export function press(key: string) { if (cfg().tones) A.dtmf(key); }

function startRec() {
  if (!cfg().recAudio || recorder || typeof MediaRecorder === 'undefined') return;
  const stream = TTS.captureStream?.(); if (!stream) return;
  try { chunks = []; recorder = new MediaRecorder(stream); recorder.ondataavailable = e => { if (e.data.size) chunks.push(e.data); }; recorder.start(1000); } catch (e) { console.warn('[call rec]', e); recorder = null; }
}
function stopRec(): Promise<string> {
  const r = recorder; recorder = null; if (!r) return Promise.resolve('');
  return new Promise(res => { r.onstop = () => { if (!chunks.length) return res(''); const fr = new FileReader(); fr.onload = () => res(String(fr.result || '')); fr.onerror = () => res(''); fr.readAsDataURL(new Blob(chunks, { type: r.mimeType || 'audio/webm' })); }; try { r.stop(); } catch { res(''); } });
}

/** 내가 끊는다 */
export function hangup() {
  const s = S0; if (!s) return;
  if (s.phase === 'ringing') return decline();
  if (s.phase === 'dialing') { clearTimeout(ringTimer); return void finish('unanswered', 'user', true); }
  if (s.phase === 'connected') void finish('answered', 'user');
}
export const close = () => { if (S0?.phase === 'ended') { S0 = null; changed(); } };

// ════════ 끝 · 통화 카드 · 다음 대화 ════════
async function finish(result: Result, by: 'user' | 'char' = 'user', gaveUp = false) {
  const s = S0; if (!s || s.phase === 'ended') return;
  clearTimeout(ringTimer);
  const wasTalking = !!gen; stopTalking(by === 'user');
  sound(null); stopAmb?.(); stopAmb = null; TTS.stopAll();
  if (cfg().tones && (result === 'answered' || result === 'unanswered')) A.endTone();
  s.phase = 'ended'; s.endedAt = now(); s.result = result; changed();
  const chat = s.chat, ch = s.char, u = userName(chat);
  const dur = s.startedAt ? s.endedAt - s.startedAt : 0;
  const cutLine = s.lines.filter(l => l.who === 'c').pop();
  const cut = wasTalking && !!cutLine?.cut;
  // 부재중이면 음성 메시지 (설정, 호출 1회)
  let voicemail = '';
  if (result === 'missed') { (chat as CallChat).callMissed = ((chat as CallChat).callMissed || 0) + 1; if (cfg().voicemail) voicemail = await say('voicemail').catch(() => ''); }
  const audio = await stopRec();
  // 프롬프트에 들어갈 통화 내용
  let body = '';
  const party = s.chars.length > 1 ? s.chars : [ch], names = party.map(c => c.name).join(' and ');
  const raw = s.lines.filter(l => l.text).map(l => l.note ? l.text : `${l.who === 'u' ? u : lineChar(s, l).name}: ${l.text}${l.cut ? ' —(cut off)' : ''}`).join('\n');
  if (result === 'answered' && raw) {
    const mode = cfg().inPrompt;
    if (mode === 'raw') { const maxChars = Math.max(200, (+cfg().rawMax || 2000) * 3); body = '\n' + (raw.length > maxChars ? '…' + raw.slice(-maxChars) : raw); }
    else if (mode === 'summary') {
      try { s.calls++; changed(); const sum = await E.quickCall(prompt('summary').replace(/\{\{char\}\}/g, ch.name).replace(/\{\{user\}\}/g, u), raw, { maxTokens: 300, conn: callConn(chat) }); body = sum ? '\nSummary: ' + sum : ''; } catch (e) { console.warn('[call summary]', e); body = '\n' + raw.slice(-800); }
    }
  }
  if (voicemail) body += `\nVoicemail from ${ch.name}: ${voicemail}`;
  const who = s.dir === 'in' ? `${names} called ${u}` : `${u} called ${names}`;
  const res = { answered: 'talked', declined: `${u} declined`, missed: `${u} did not pick up`, unanswered: gaveUp ? `${u} hung up before ${names} answered` : `${names} did not pick up` }[result];
  const text = prompt('record').replace(/\{\{who\}\}/g, who).replace(/\{\{result\}\}/g, res).replace(/\{\{dur\}\}/g, dur ? ` · ${fmtDur(dur)}` : '').replace(/\{\{body\}\}/g, body).replace(/\{\{char\}\}/g, ch.name).replace(/\{\{user\}\}/g, u);
  const rec: CallRec = { ...(party.length > 1 ? { with: party.map(c => c.id) } : {}), dir: s.dir, result, dur, rec: s.rec, calls: s.calls, ...(by ? { endedBy: by } : {}), ...(cut ? { cut: true } : {}), ...(s.rec && s.lines.length ? { lines: s.lines.map(l => ({ ...l })) } : {}), ...(voicemail ? { voicemail } : {}), ...(audio ? { audio } : {}), ...(result === 'missed' && ((chat as CallChat).callMissed || 0) > 1 ? { missedN: (chat as CallChat).callMissed } : {}) };
  const m = newMsg('system', text, { call: rec, charId: ch.id, name: ch.name });
  // 다음 대화에서 알아차릴 일
  const c = chat as CallChat;
  const pend: Pending | null = result === 'declined' ? { kind: 'declined', at: now() } : result === 'missed' ? { kind: 'missed', at: now() }
    : result === 'unanswered' && !gaveUp ? { kind: 'noAnswer', at: now(), activity: s.activity || s.status }
      : result === 'answered' && cut ? { kind: 'cut', at: now(), last: cutLine?.text.slice(-200) } : result === 'answered' && by === 'user' && s.lines.length ? { kind: 'hungUp', at: now() } : result === 'answered' && by === 'char' && s.lines.length ? { kind: 'charBye', at: now() } : null;
  if (pend) c.callPending = pend; else delete c.callPending;
  (c.callLog ||= []).unshift({ at: now(), dir: s.dir, result, dur, msgId: m.id, charId: ch.id }); c.callLog.length = Math.min(c.callLog.length, 30);
  if (cur.chat === chat && chatApi.push) await chatApi.push(m);
  else { const list = s.msgs.length ? s.msgs : await S.msgs(chat.id); list.push(m); await S.saveMsgs(chat, list); }
  // 전체 통화 토큰 한도: 오래된 통화 카드의 원문을 축약
  if (cfg().inPrompt === 'raw') {
    const maxTotal = Math.max(500, (+cfg().rawTotal || 8000) * 3);
    const allMsgs = cur.chat === chat ? cur.msgs : s.msgs;
    const callMsgs = allMsgs.filter(msg => msg.call && msgText(msg).includes('\n'));
    let total = callMsgs.reduce((n, msg) => n + msgText(msg).length, 0);
    let trimmed = false;
    for (let i = 0; i < callMsgs.length - 1 && total > maxTotal; i++) {
      const msg = callMsgs[i], txt = msgText(msg), idx = txt.indexOf('\n');
      if (idx < 0) continue;
      const short = txt.slice(0, idx) + '\n(omitted)';
      total -= txt.length - short.length;
      const sw = msg.swipes[msg.sw]; if (sw) { sw.text = short; trimmed = true; }
    }
    if (trimmed) await S.saveMsgs(chat, allMsgs);
  }
  await S.save('chats', chat, true);
  emit('call:end', { chat, msg: m });
  if (result !== 'answered') setTimeout(() => { if (S0 === s) close(); }, 1600);
  // 통화한 뒤에는 캐릭터가 바로 문자를 보낸다 (작별 뒤 한마디 · 끊김에 대한 반응)
  else if (pend && cfg().afterText && cur.chat === chat) setTimeout(() => { if (S0 === s) close(); if (cur.chat === chat && !cur.busy && c.callPending === pend) void chatApi.generate?.('normal'); }, 1800);
}

/** 캐릭터가 대답하면 "알아차릴 일"은 끝난다 */
export function clearPending(chat: Chat) { const c = chat as CallChat; if (c.callPending) { delete c.callPending; void S.save('chats', chat, true); } }

// ════════ 캐릭터가 먼저 거는 계획 ════════
const REASON: Record<string, string> = {
  longAbsence: 'you have not heard from them in a long time and missed them', back: 'you are finally free again after being busy', morning: 'you just woke up and wanted to hear their voice first',
  night: 'your day is ending and you want to hear their voice before sleeping', afterBusy: 'you just finished something busy', meal: 'you are on a break and have a moment',
  transition: 'you are between things in your day', unread: 'they have not read your message yet', ghosted: 'they read your message but did not answer', checkin: 'you just felt like calling',
};
export function reasonFor(chat: Chat, ch: Char) {
  const real = (cur.chat === chat ? cur.msgs : []).filter(m => m.role !== 'system');
  const lastUser = [...real].reverse().find(m => m.role === 'user'), last = real[real.length - 1];
  const mv = pickMotive({ sched: scheduleOf(ch), lastUserAt: lastUser?.ts || 0, lastRole: (last?.role as 'user' | 'assistant') || '' });
  const p = Live.presence(chat, ch);
  return `${REASON[mv.kind] || REASON.checkin}${p.activity ? ` (right now: ${p.activity})` : ''}${last ? `; the last thing in your chat was: "${msgText(last).slice(0, 120)}"` : ''}`;
}
/** 1분마다: 켜져 있고 조건이 맞으면 확률로 걸려 온다 */
export function tick() {
  const c = cfg(), chat = cur.chat as CallChat | null; if (!c.auto || !chat || S0 || cur.busy || document.hidden || chat.mode !== 'talk' || chat.scene?.on) return;
  const ch = charOf(chat); if (!ch || !callConn(chat)) return;
  if (inQuietHours() || Live.userStatus().status === 'dnd') return;
  const p = Live.presence(chat, ch); if (p.status === 'offline' || p.status === 'dnd') return;
  const hr = new Date().getHours(), night = hr >= 22 || hr < 7; if (night && !c.night) return;
  const day = new Date().toDateString(), a = chat.callAuto && chat.callAuto.day === day ? chat.callAuto : { day, count: 0, lastAt: chat.callAuto?.lastAt || 0 };
  if (a.count >= Math.max(0, +c.daily || 0)) return;
  if (a.lastAt && now() - a.lastAt < Math.max(0, +c.gapHours || 0) * 3600000) return;
  const chance = Math.max(0, Math.min(100, +c.chance || 0)) / 100 / 10 * (night ? 0.25 : 1) * (p.status === 'idle' ? 0.5 : 1);
  if (Math.random() >= chance) return;
  chat.callAuto = { day, count: a.count + 1, lastAt: now() }; void S.save('chats', chat, true);
  ring(chat);
}

export const hasHook = () => X.prompt.some(p => p.owner === 'call');
