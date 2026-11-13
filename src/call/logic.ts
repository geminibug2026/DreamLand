// 전화 한 통의 흐름: 걸기 · 걸려 옴 · 받기/거절/부재중 · 주고받기(모델 → TTS 로 흘려 읽기) · 끊기 · 통화 카드 · 다음 대화의 반응
import * as E from '../lib/engine';
import type { Char, Chat, Msg } from '../lib/types';
import { S, emit, msgText, newMsg, now } from '../lib/core';
import { X, type PromptPiece } from '../lib/hooks';
import { Live, inQuietHours } from '../lib/live';
import { pickMotive, scheduleOf } from '../lib/f-schedule';
import { TTS, type SpeechStream } from '../tts/api';
import { cur } from '../chat/store';
import { chatApi } from '../chat/actions';
import { toast } from '../ui';
import { callConn, cfg, prompt } from './cfg';
import { tt } from './strings';
import * as A from './audio';

export type Dir = 'in' | 'out';
export type Result = 'answered' | 'declined' | 'missed' | 'unanswered';
export interface Line { who: 'u' | 'c'; text: string; cut?: boolean; at: number }
/** 대화 기록에 남는 통화 카드 (Msg.call) */
export interface CallRec { dir: Dir; result: Result; dur: number; rec: boolean; cut?: boolean; endedBy?: 'user' | 'char'; lines?: Line[]; voicemail?: string; audio?: string; missedN?: number; calls: number }
/** 다음 대화에서 캐릭터가 알아차릴 일 (Chat.callPending) */
export interface Pending { kind: 'declined' | 'missed' | 'hungUp' | 'cut' | 'noAnswer' | 'charBye'; at: number; last?: string; activity?: string }
type CallChat = Chat & { callPending?: Pending; callLog?: { at: number; dir: Dir; result: Result; dur: number; msgId: string; charId: string }[]; callAuto?: { day: string; count: number; lastAt: number }; callMissed?: number };

export interface Session {
  chat: CallChat; msgs: Msg[]; char: Char; dir: Dir; phase: 'ringing' | 'dialing' | 'connected' | 'ended';
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
const userName = (chat: Chat) => S.persona(chat).name || S.settings.userNameFallback || 'User';
export const fmtDur = (ms: number) => { const s = Math.max(0, Math.round(ms / 1000)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };

// ════════ 시작 ════════
function begin(chat: Chat, dir: Dir, reason = ''): Session | null {
  if (S0 && S0.phase !== 'ended') { toast(tt('call.err.busy'), 'err'); return null; }
  const ch = charOf(chat); if (!ch) { toast(tt('call.err.noChar'), 'err'); return null; }
  if (!callConn(chat)) { toast(tt('call.err.noConn'), 'err'); return null; }
  const p = Live.presence(chat, ch);
  S0 = { chat, msgs: cur.chat === chat ? cur.msgs : [], char: ch, dir, phase: dir === 'in' ? 'ringing' : 'dialing', ringAt: now(), startedAt: 0, endedAt: 0, lines: [], status: p.status, activity: p.activity,
    reason, rec: cfg().rec, muted: false, speaker: TTS.enabled(), hold: false, keypad: false, talking: false, calls: 0 };
  return S0;
}

/** 내가 건다. 캐릭터 상태에 따라 안 받을 수도 있다 */
export function dial(chat: Chat | null = cur.chat) {
  if (!chat) return toast(tt('call.err.noChat'), 'err');
  if (cur.busy) return toast(tt('call.err.genBusy'), 'err');
  const s = begin(chat, 'out'); if (!s) return;
  sound(A.ringback); changed();
  // 상태가 받을 확률을 정한다: 온라인 거의 늘 · 반쯤 자리 비움 가끔 · 바쁨 드물게 · 오프라인 안 받음
  const p = { online: 0.95, idle: 0.65, dnd: 0.25, offline: 0 }[s.status as 'online'] ?? 0.9;
  const pick = Math.random() < p, wait = 2500 + Math.random() * (pick ? 4000 : 0) + (pick ? 0 : Math.min(cfg().ringSec, 12) * 1000);
  ringTimer = window.setTimeout(() => { if (S0 !== s || s.phase !== 'dialing') return; if (pick) void connect(); else void finish('unanswered'); }, wait);
}

/** 캐릭터가 건다 (자동 · /call ring) */
export function ring(chat: Chat | null = cur.chat, reason = '') {
  if (!chat) return;
  const ch = charOf(chat); if (!ch) return;
  const s = begin(chat, 'in', reason || reasonFor(chat, ch)); if (!s) return;
  sound(A.ringtone); changed();
  ringTimer = window.setTimeout(() => { if (S0 === s && s.phase === 'ringing') void finish('missed'); }, Math.max(5, cfg().ringSec) * 1000);
}
export const accept = () => { if (S0?.phase === 'ringing') void connect(); };
export const decline = () => { if (S0?.phase === 'ringing') void finish('declined'); };

async function connect() {
  const s = S0; if (!s) return;
  clearTimeout(ringTimer); sound(null); if (cfg().tones) A.connectTone();
  s.phase = 'connected'; s.startedAt = now(); (s.chat as CallChat).callMissed = 0; changed();
  const amb = cfg().ambient, kind = amb === 'auto' ? A.ambientFor(s.activity) : amb === 'off' ? '' : amb;
  ambKind = kind; if (kind) stopAmb = A.ambient(kind);
  if (s.rec) startRec();
  await say('open');
}

// ════════ 주고받기 ════════
/** 내가 한 말 */
export async function userSays(text: string) {
  const s = S0; if (!s || s.phase !== 'connected' || s.muted || s.hold || !text.trim()) return;
  if (gen) stopTalking(true);
  s.lines.push({ who: 'u', text: text.trim(), at: now() }); changed();
  await say('reply');
}

const pendText = (p: Pending) => prompt(p.kind).replace(/\{\{last\}\}/g, p.last || '').replace(/\{\{activity\}\}/g, p.activity || 'busy');
let active: { chat: Chat; kind: 'open' | 'reply' | 'voicemail' } | null = null;
/** 통화 중일 때만 프롬프트 끝에 붙는 조각 (X.prompt) */
export function promptPieces(chat: Chat): PromptPiece[] {
  const c = chat as CallChat;
  if (active && active.chat === chat && S0) {
    const s = S0, fill = (t: string) => t.replace(/\{\{status\}\}/g, s.activity ? `${s.status}, ${s.activity}` : s.status).replace(/\{\{reason\}\}/g, s.reason || 'you just wanted to hear their voice');
    // 통화를 여는 말에는 지난 통화에서 남은 일(거절 · 부재중 · 끊김)도 함께 알려 준다
    const parts = [active.kind === 'voicemail' ? '' : prompt('style'), active.kind === 'open' ? prompt(s.dir === 'in' ? 'incoming' : 'pickup') : active.kind === 'voicemail' ? prompt('voicemail') : '', active.kind === 'open' && c.callPending ? pendText(c.callPending) : ''].filter(Boolean).map(fill);
    return [{ where: 'end', content: parts.join('\n\n'), src: 'call' }];
  }
  const p = c.callPending; if (!p) return [];
  return [{ where: 'end', content: pendText(p), src: 'call' }];
}

const strip = (raw: string, name: string) => {
  let t = E.splitThink(raw).text.replace(/<think(ing)?>[\s\S]*$/i, '');
  t = t.replace(/\[(react|status|schedule_update|selfie|memory|time|later|scene|scene_end)\b[^\]]*\]?/gi, '').replace(/\[hangup\]?/gi, '');
  t = t.replace(new RegExp('^\\s*' + name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s*:\\s*'), '').replace(/\[$|\[[a-z_]*$/i, '').replace(/<\/?[a-z]*$/i, '');
  // 따옴표로 감싼 말은 벗긴다
  t = t.replace(/^"([\s\S]*)"$/, '$1');
  return t;
};

/** 캐릭터가 말한다 (모델 호출 1회). 흘러나오는 대로 TTS 가 문장 단위로 읽는다 */
async function say(kind: 'open' | 'reply' | 'voicemail'): Promise<string> {
  const s = S0; if (!s) return '';
  const chat = s.chat, ch = s.char, conn = callConn(chat); if (!conn) return '';
  const preset = S.presetFor(chat), persona = S.persona(chat);
  const mark = newMsg('system', 'Phone call started');
  const history = kind === 'voicemail' ? [...s.msgs] : [...s.msgs, mark, ...s.lines.map(l => l.who === 'u' ? newMsg('user', l.text, { name: persona.name }) : newMsg('assistant', l.text, { charId: ch.id, name: ch.name }))];
  if (kind !== 'voicemail' && history[history.length - 1]?.role !== 'user') history.push(newMsg('user', kind === 'open' ? (s.dir === 'in' ? '(picks up the phone)' : '(calling…)') : '…', { name: persona.name }));
  const keep = chat.presence; chat.presence = { status: s.status, activity: s.activity };
  active = { chat, kind };
  let built: E.Built;
  try { built = E.buildPrompt({ chat, char: ch, chars: [ch], persona, preset, msgs: history, type: 'normal', commit: false }); }
  catch (e) { console.error(e); toast(String(e), 'err'); return ''; }
  finally { active = null; if (keep === undefined) delete chat.presence; else chat.presence = keep; }
  const line: Line = { who: 'c', text: '', at: now() };
  if (kind !== 'voicemail') s.lines.push(line);
  const speech = kind !== 'voicemail' && s.speaker && TTS.enabled() ? TTS.stream({ charId: ch.id }) : null;
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
    s.talking = false;
    const text = (built.talk ? E.parseTalk(strip(g.acc, ch.name)).text : strip(g.acc, ch.name)).trim();
    if (!line.cut) line.text = text;
    if (!line.text && kind !== 'voicemail') { const i = s.lines.indexOf(line); if (i >= 0) s.lines.splice(i, 1); }
    changed();
  }
  if (hung && S0 === s && s.phase === 'connected') { await speech?.done; void finish('answered', 'char'); }
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
  const raw = s.lines.map(l => `${l.who === 'u' ? u : ch.name}: ${l.text}${l.cut ? ' —(cut off)' : ''}`).join('\n');
  if (result === 'answered' && raw) {
    const mode = cfg().inPrompt;
    if (mode === 'raw') { const maxChars = Math.max(200, (+cfg().rawMax || 2000) * 3); body = '\n' + (raw.length > maxChars ? '…' + raw.slice(-maxChars) : raw); }
    else if (mode === 'summary') {
      try { s.calls++; changed(); const sum = await E.quickCall(prompt('summary').replace(/\{\{char\}\}/g, ch.name).replace(/\{\{user\}\}/g, u), raw, { maxTokens: 300, conn: callConn(chat) }); body = sum ? '\nSummary: ' + sum : ''; } catch (e) { console.warn('[call summary]', e); body = '\n' + raw.slice(-800); }
    }
  }
  if (voicemail) body += `\nVoicemail from ${ch.name}: ${voicemail}`;
  const who = s.dir === 'in' ? `${ch.name} called ${u}` : `${u} called ${ch.name}`;
  const res = { answered: 'talked', declined: `${u} declined`, missed: `${u} did not pick up`, unanswered: gaveUp ? `${u} hung up before ${ch.name} answered` : `${ch.name} did not pick up` }[result];
  const text = prompt('record').replace(/\{\{who\}\}/g, who).replace(/\{\{result\}\}/g, res).replace(/\{\{dur\}\}/g, dur ? ` · ${fmtDur(dur)}` : '').replace(/\{\{body\}\}/g, body).replace(/\{\{char\}\}/g, ch.name).replace(/\{\{user\}\}/g, u);
  const rec: CallRec = { dir: s.dir, result, dur, rec: s.rec, calls: s.calls, ...(by ? { endedBy: by } : {}), ...(cut ? { cut: true } : {}), ...(s.rec && s.lines.length ? { lines: s.lines.map(l => ({ ...l })) } : {}), ...(voicemail ? { voicemail } : {}), ...(audio ? { audio } : {}), ...(result === 'missed' && ((chat as CallChat).callMissed || 0) > 1 ? { missedN: (chat as CallChat).callMissed } : {}) };
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
      const sw = msg.swipes[msg.sw]; if (sw) { sw.msg = short; trimmed = true; }
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
