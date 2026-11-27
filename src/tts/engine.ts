// ── 읽어 주기 엔진: 한 번에 한 조각씩 재생하는 줄 · 문장 단위 스트리밍 · 목소리 연기 · 녹음용 MediaStream ──
// 지금 읽는 자리(조각 · 글자 · 누가)를 알려 주고(따라 읽기), 멈춤 · 이어 읽기 · 앞뒤 문장으로 옮기기를 받는다.
// 조각마다 제 목소리 · 말투 · 효과음이 있을 수 있다 (perform). 흘려 읽기(stream)는 한 목소리로.
import { setTtsImpl, type Reading, type SpeakOpts, type SpeechStream, type Take, type TtsApi, type VoicePick } from './api';
import { cfg, connOf, DEFAULT_VOICE } from './config';
import { actFor, synthClip, type Acted, type Clip } from './providers';
import { cleanForSpeech, guessLang, takeSentences } from './text';
import { charAtFraction, charAtTime, guessSeconds, weights, wordAt } from './follow';
import { respell, wordsFor } from './pron';
import { cachedClip, clipKey } from './cache';
import { decode, duckBeds, maybeNap, mixer, voiceLevel, wake } from './mix';
import { playSound, setBed } from './sfx';
import type { Conn } from '../lib/types';
import { t } from '../i18n';

// ════════ 지금 읽는 자리 ════════
let R: Reading | null = null;
const subs = new Set<() => void>();
function setR(next: Reading | null) {
  if (R === next) return;
  R = next; for (const f of [...subs]) { try { f(); } catch (e) { console.warn('[TTS watch]', e); } }
}

/** 지금 소리를 내는 조각 하나의 손잡이: 잠시 멈춤 · 이어서 · 이 조각만 그만 */
interface Ctl { hold(): void; go(): void; skip(): void }
let ctl: Ctl | null = null, held = false;
const waiters = new Set<() => void>();
const wake2 = () => { for (const w of [...waiters]) w(); waiters.clear(); };
async function whileHeld(signal: AbortSignal) {
  while (held && !signal.aborted) await new Promise<void>(r => { waiters.add(r); signal.addEventListener('abort', () => r(), { once: true }); });
}
/** 지금 돌고 있는 묶음 (앞뒤 문장으로 옮길 때 쓴다) */
let live: { job: number; idx: number; count: () => number; ended: () => boolean; jump: number | null } | null = null;

// ════════ 소리 내기 ════════
/** 전화기 너머 목소리: 낮은 소리 · 높은 소리를 깎고 가운데를 살짝 올린다 */
function phoneChain(c: BaseAudioContext, out: AudioNode): AudioNode {
  const hp = c.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 330; hp.Q.value = 0.8;
  const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 3300; lp.Q.value = 0.9;
  const mid = c.createBiquadFilter(); mid.type = 'peaking'; mid.frequency.value = 1700; mid.gain.value = 5; mid.Q.value = 1.1;
  const comp = c.createDynamicsCompressor(); comp.threshold.value = -26; comp.ratio.value = 4;
  hp.connect(lp); lp.connect(mid); mid.connect(comp); comp.connect(out);
  return hp;
}
/** 속마음: 가까이서 속삭이듯 — 높은 소리를 조금 깎고, 짧은 울림을 옅게 섞는다 */
let roomIR: AudioBuffer | null = null;
function innerChain(c: BaseAudioContext, out: AudioNode): AudioNode {
  const input = c.createGain(), dry = c.createGain(), wet = c.createGain();
  const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 5200;
  const hp = c.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 140;
  if (!roomIR || roomIR.sampleRate !== c.sampleRate) {
    const n = Math.floor(c.sampleRate * 0.9); roomIR = c.createBuffer(2, n, c.sampleRate);
    for (let ch = 0; ch < 2; ch++) { const d = roomIR.getChannelData(ch); for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / n, 3.2); }
  }
  const verb = c.createConvolver(); verb.buffer = roomIR;
  dry.gain.value = 0.86; wet.gain.value = 0.22;
  input.connect(hp); hp.connect(lp); lp.connect(dry); dry.connect(out); lp.connect(verb); verb.connect(wet); wet.connect(out);
  return input;
}
/** 조각에 거는 소리 효과 */
type Fx = 'phone' | 'inner' | undefined;
export function fxChain(c: BaseAudioContext, fx: Fx, out: AudioNode): AudioNode { return fx === 'phone' ? phoneChain(c, out) : fx === 'inner' ? innerChain(c, out) : out; }

// ── 목소리마다 소리 크기 고르기: 소리 나는 부분의 크기를 재어 목소리별로 기억하고, 목표 크기에 맞춘다 (낮추기 넉넉히 · 올리기 조금) ──
const TARGET = -19, levels = new Map<string, number>();
/** 소리 나는 부분의 크기 (dBFS). 조용한 틈은 뺀다 */
export function loudness(b: AudioBuffer): number {
  const d = b.getChannelData(0), win = Math.max(1, Math.floor(b.sampleRate * 0.05)), rms: number[] = [];
  for (let i = 0; i + win <= d.length; i += win) { let s = 0; for (let k = i; k < i + win; k++) s += d[k] * d[k]; rms.push(Math.sqrt(s / win)); }
  const loud = rms.filter(x => x > 0.006).sort((a, b) => b - a), top = loud.slice(0, Math.max(1, Math.ceil(loud.length * 0.7)));
  if (!top.length) return -60;
  return 20 * Math.log10(top.reduce((a, x) => a + x, 0) / top.length);
}
function evenGain(voiceKey: string, b: AudioBuffer): number {
  const now = loudness(b); if (now < -50) return 1;
  const prev = levels.get(voiceKey), lv = prev == null ? now : prev * 0.7 + now * 0.3;   // 목소리마다 천천히 따라간다 (문장마다 들쭉날쭉하지 않게)
  levels.set(voiceKey, lv);
  return Math.pow(10, Math.max(-9, Math.min(5, TARGET - lv)) / 20);
}

/** 지금 소리 끄기용 (stopAll) */
const playing = new Set<() => void>();

/** 풀어 둔 소리 하나를 끝까지 (또는 멈출 때까지) 튼다. onTime(지금 초, 전체 초) 를 자주 부른다 */
async function playBuffer(buf: AudioBuffer, signal: AbortSignal, gain: number, onTime: (sec: number, dur: number) => void, fx: Fx): Promise<void> {
  const m = mixer()!; if (signal.aborted) return;
  const g = m.ctx.createGain(); g.gain.value = gain;
  const head = fxChain(m.ctx, fx, m.voice); g.connect(head);
  await new Promise<void>(resolve => {
    let src: AudioBufferSourceNode | null = null, startAt = 0, offset = 0, tick = 0, done = false;
    const start = () => {
      const s = m.ctx.createBufferSource(); s.buffer = buf; s.connect(g); src = s;
      s.onended = () => { if (src === s && !done) fin(); };
      startAt = m.ctx.currentTime; s.start(0, offset);
    };
    const stopSrc = () => { const s = src; src = null; if (s) { s.onended = null; try { s.stop(); } catch { } try { s.disconnect(); } catch { } } };
    const fin = () => { if (done) return; done = true; clearInterval(tick); stopSrc(); playing.delete(kill); signal.removeEventListener('abort', kill); if (ctl === me) ctl = null; setTimeout(() => { try { g.disconnect(); } catch { } }, 400); resolve(); };
    const kill = () => fin();
    const me: Ctl = {
      hold: () => { if (!src) return; offset += m.ctx.currentTime - startAt; stopSrc(); },
      go: () => { if (src || done) return; if (offset >= buf.duration - 0.02) return fin(); start(); },
      skip: kill,
    };
    playing.add(kill); signal.addEventListener('abort', kill, { once: true });
    ctl = me;
    tick = window.setInterval(() => { if (src) onTime(offset + m.ctx.currentTime - startAt, buf.duration); }, 90);
    if (held) return;   // 멈춘 채로 왔다: 이어 읽을 때 튼다
    start();
  });
}
/** 풀지 못한 소리 파일: <audio> 로 그냥 튼다 (효과 · 크기 고르기 없이) */
async function playElement(blob: Blob, signal: AbortSignal, volume: number, onTime: (sec: number, dur: number) => void): Promise<void> {
  if (signal.aborted) return;
  const url = URL.createObjectURL(blob), el = new Audio(); el.src = url; el.volume = Math.min(1, volume);
  await new Promise<void>(resolve => {
    let tick = 0;
    const fin = () => { clearInterval(tick); playing.delete(kill); signal.removeEventListener('abort', kill); el.onended = el.onerror = null; if (ctl === me) ctl = null; URL.revokeObjectURL(url); resolve(); };
    const kill = () => { try { el.pause(); el.removeAttribute('src'); el.load(); } catch { } fin(); };
    const me: Ctl = { hold: () => el.pause(), go: () => { void el.play().catch(() => { }); }, skip: kill };
    playing.add(kill); signal.addEventListener('abort', kill, { once: true });
    el.onended = fin; el.onerror = fin; ctl = me;
    tick = window.setInterval(() => { if (!el.paused) onTime(el.currentTime, el.duration); }, 90);
    if (held) return;
    el.play().catch(e => { console.warn('[TTS] 재생 실패', e); fin(); });
  });
}

/** 브라우저 음성으로 한 조각. onChar(지금 읽는 글자 위치) — 경계 알림이 오면 그것, 안 오는 목소리면 시간으로 짐작 */
function sayBrowser(text: string, v: VoicePick, speed: number, volume: number, signal: AbortSignal, onChar: (i: number) => void, map?: number[] | null): Promise<void> {
  if (!('speechSynthesis' in window)) return Promise.reject(new Error(t('chat.speak.unsupported')));
  if (signal.aborted) return Promise.resolve();
  const back = (i: number) => map ? map[Math.min(i, map.length - 1)] : i;   // 발음 사전으로 바꾼 글 → 원래 글의 위치
  return new Promise<void>(resolve => {
    const want = String(v.voice || '').toLowerCase();
    const vs = speechSynthesis.getVoices(), hit = want ? vs.find(x => x.name.toLowerCase() === want || x.voiceURI.toLowerCase() === want) || vs.find(x => x.name.toLowerCase().includes(want)) : undefined;
    let done = false, cur: SpeechSynthesisUtterance | null = null, last = 0, bounds = false, startedAt = 0, spent = 0, firstAt = 0;
    const total = guessSeconds(text, speed) * 1000, acc = weights(text);
    // 멈췄다가 이어 읽을 때는 멈춘 낱말부터 새로 읽는다 (pause() 를 제대로 듣지 않는 브라우저가 많다)
    const make = (from: number) => {
      const u = new SpeechSynthesisUtterance(text.slice(from));
      if (hit) { u.voice = hit; u.lang = hit.lang; } else u.lang = guessLang(text);
      u.rate = Math.min(10, Math.max(0.1, speed)); u.pitch = Math.min(2, Math.max(0, +v.pitch || 1)); u.volume = Math.min(1, volume);
      u.onboundary = e => { if (u !== cur || (e.name && e.name !== 'word')) return; bounds = true; last = from + (e.charIndex || 0); onChar(back(last)); };
      u.onend = u.onerror = () => { if (u === cur) fin(); };
      cur = u; startedAt = performance.now(); firstAt ||= startedAt;
      speechSynthesis.speak(u);
    };
    const fin = () => { if (done) return; done = true; cur = null; if (ctl === me) ctl = null; playing.delete(kill); signal.removeEventListener('abort', kill); clearInterval(keep); clearInterval(guess); resolve(); };
    const kill = () => { cur = null; speechSynthesis.cancel(); fin(); };
    const me: Ctl = {
      hold() { if (!cur) return; spent += performance.now() - startedAt; cur = null; speechSynthesis.cancel(); },
      go() { if (cur || done) return; make(wordAt(text, last).start); },
      skip: kill,
    };
    // 크롬은 15초쯤 넘는 발화를 스스로 끊는 일이 있어 가끔 살짝 깨운다
    const keep = setInterval(() => { if (cur && speechSynthesis.speaking && !speechSynthesis.paused) { speechSynthesis.pause(); speechSynthesis.resume(); } }, 10000);
    // 경계 알림을 주지 않는 목소리: 읽기 시작한 지 조금 지나도 알림이 없으면 흐른 시간으로 짐작한다
    const guess = setInterval(() => {
      if (bounds || !cur || performance.now() - firstAt < 450) return;
      const i = charAtFraction(acc, (spent + performance.now() - startedAt) / Math.max(1, total)); last = Math.max(last, i); onChar(back(last));
    }, 120);
    playing.add(kill); signal.addEventListener('abort', kill, { once: true });
    ctl = me;
    if (!held) make(0);
  });
}

// ════════ 줄: 묶음(job)이 차례로 하나씩 ════════
let chain: Promise<void> = Promise.resolve();
const jobs = new Set<AbortController>();
let busy = 0, jobNo = 0;

/** 목소리 하나를 읽을 준비: 고른 목소리 · 연결 · 빠르기 */
export interface Voice { v: VoicePick; conn?: Conn; speed: number; key: string; charId?: string | null; name?: string }
/** 읽을 조각 하나 (문장 하나쯤). 토막에서 나왔으면 그 토막의 목소리 · 말투 · 효과음을 가진다 */
export interface Seg { text: string; voice: Voice; how?: string[]; kind?: Take['kind']; fx: Fx; sound?: string; bed?: string; clip?: Promise<Clip | null>; acc?: number[]; acted?: Acted }

function voiceOf(charId: string | null | undefined, over: Partial<VoicePick> | undefined, name?: string): Voice {
  const c = cfg(), v = { ...impl.voiceFor(charId), ...(over || {}) } as VoicePick;
  return { v, conn: connOf(v), speed: (+v.rate || 1) * (+c.rate || 1), key: `${v.provider}|${v.connId || ''}|${v.voice}|${v.model || ''}`, charId, name };
}

/** 대본(토막들)을 읽을 조각으로: 토막마다 문장으로 나누고 (효과음 · 바탕 소리는 그 토막의 첫 조각에) 목소리 · 말투 · 효과를 붙인다 */
export function segsOf(takes: Take[], o: SpeakOpts = {}): Seg[] {
  const c = cfg(), readActions = c.actions !== 'skip', base = voiceOf(o.charId, o.voice), out: Seg[] = [];
  for (const tk of takes) {
    const voice = tk.voice?.provider || tk.charId !== undefined ? voiceOf(tk.charId ?? null, tk.voice, tk.name) : base;
    if (tk.name) voice.name = tk.name;
    const fx: Fx = o.fx === 'phone' ? 'phone' : tk.kind === 'think' ? 'inner' : undefined;
    let first = true;
    for (const p of tk.text ? takeSentences(tk.text, true).parts : []) {
      const s = cleanForSpeech(p, readActions); if (!s || !/[\p{L}\p{N}]/u.test(s)) continue;
      out.push({ text: s, voice, how: tk.how ?? o.how, kind: tk.kind, fx, ...(first ? { sound: tk.sound, bed: tk.bed } : {}) }); first = false;
    }
    if (first && (tk.sound || tk.bed !== undefined)) out.push({ text: '', voice, kind: tk.kind, fx: undefined, sound: tk.sound, bed: tk.bed });
  }
  return out;
}
/** 한 조각을 소리로 (보관한 것이 있으면 그것). 말투 · 발음 사전을 반영한 글을 보낸다. 음성 연결이 아니면(브라우저 음성) null */
export function clipOf(sg: Seg, signal?: AbortSignal): Promise<Clip> | null {
  const vc = sg.voice; if (!vc.conn) return null;
  const c = cfg(), power = Math.max(0, Math.min(2, +c.acting || 0)), model = String(vc.v.model || vc.conn.model || '');
  const acted = sg.acted ||= actFor(vc.conn.provider, model, vc.v, sg.how, power);
  const sp = respell(sg.text, wordsFor(c.pron, vc.charId)), send = acted.prefix + sp.text;
  const v = { ...vc.v, ...acted.voice, pitch: (+vc.v.pitch || 1) * acted.pitch } as VoicePick, speed = vc.speed * acted.rate;
  const make = () => synthClip(vc.conn!, v, send, speed, signal, { lead: acted.prefix.length, map: sp.map });
  const k = clipKey([vc.conn.provider, vc.conn.id, vc.conn.baseUrl || '', v.voice, model, +speed.toFixed(3), v.pitch, v.stability, v.similarity, v.style, v.instructions, v.azStyle, v.azDegree, v.emotion, send]);
  return cachedClip(k, make, c.keep !== false);
}
/** 이 조각의 소리 크기 배율 (말투의 크기 · 목소리마다 고르기) */
export function gainOf(sg: Seg, b: AudioBuffer | null): number {
  const c = cfg(), acted = sg.acted || { gainDb: 0 };
  return (b && c.even !== false ? evenGain(sg.voice.key, b) : 1) * Math.pow(10, acted.gainDb / 20);
}

function makeStream(o: SpeakOpts = {}, takes?: Take[]): SpeechStream & { error?: unknown } {
  const ac = new AbortController(); jobs.add(ac);
  const c = cfg(), readActions = c.actions !== 'skip', volume = Math.min(1, Math.max(0, +c.volume)), power = Math.max(0, Math.min(2, +c.acting || 0));
  const base = voiceOf(o.charId, o.voice);
  const job = ++jobNo, key = o.key || '';
  let error: unknown, how = o.how;
  let buf = '', all = '', ended = false, idx = 0, speaking = false, nudgeFn: (() => void) | null = null;
  const segs: Seg[] = [];
  const nudge = () => { const w = nudgeFn; nudgeFn = null; w?.(); };
  const add = (raw: string, voice: Voice) => {
    const s = cleanForSpeech(raw, readActions);
    if (s && /[\p{L}\p{N}]/u.test(s)) { segs.push({ text: s, voice, how, fx: o.fx }); nudge(); }
  };
  if (takes) { segs.push(...segsOf(takes, o)); all = takes.map(x => x.text).join('\n'); ended = true; }
  const synthOf = (sg: Seg): Promise<Clip | null> => {
    const p = clipOf(sg, ac.signal); if (!p) return Promise.resolve(null);
    return p.catch(e => { if (!ac.signal.aborted) { error ||= e; ac.abort(); } return null; });
  };
  const fetchAhead = () => {   // 지금 것과 뒤로 두 조각까지 미리 받아 둔다 (앞 문장으로 돌아가면 받아 둔 것을 다시 튼다)
    for (let i = idx; i < Math.min(segs.length, idx + 3); i++) { const sg = segs[i]; if (!sg.clip && sg.text && sg.voice.conn) sg.clip = synthOf(sg); }
  };
  /** 지금 읽는 글자 위치가 바뀌었다 (낱말이 넘어갈 때만 알린다) */
  const at = (sg: Seg, i: number) => {
    if (!R || R.job !== job || R.seg !== sg.text) return;
    const w = wordAt(sg.text, i).start; if (w !== R.char) setR({ ...R, char: w });
  };
  const announce = (sg: Seg) => setR({ key, job, charId: sg.voice.charId ?? o.charId, src: all, at: o.at || 0, seg: sg.text, segNo: idx, char: 0, paused: held, canBack: idx > 0, canNext: idx < segs.length - 1 || !ended, ...(sg.voice.name ? { name: sg.voice.name } : {}), ...(sg.kind ? { kind: sg.kind } : {}) });
  const prev = chain;
  const run = (async () => {
    await prev.catch(() => { });
    busy++;
    const me = live = { job, idx: 0, count: () => segs.length, ended: () => ended, jump: null as number | null };
    let lastVoice = '';
    try {
      while (!ac.signal.aborted) {
        if (idx < segs.length) {
          await whileHeld(ac.signal); if (ac.signal.aborted) break;
          fetchAhead();
          const sg = segs[idx]; me.idx = idx; me.jump = null;
          if (sg.voice.v.provider !== 'browser' && !sg.voice.conn) { error = new Error(t('tts.err.noConn')); break; }
          // 장면 소리: 바탕 소리는 깔고 넘어가고, 효과음은 울린 뒤(긴 것은 조금 겹쳐서) 읽는다
          if (sg.bed !== undefined && c.sfx !== false) void setBed(sg.bed, c.bedVol ?? 0.45);
          if (sg.sound && c.sfx !== false) { const d = await playSound(sg.sound, c.sfxVol ?? 0.8); if (d && !ac.signal.aborted) await pause(Math.min(d * 0.7, 1.4) * 1000, ac.signal); }
          if (!sg.text) { idx = me.jump ?? idx + 1; continue; }
          // 말하는 사람이 바뀌면 잠깐 숨을 쉰다
          if (lastVoice && lastVoice !== sg.voice.key + (sg.voice.name || '') && (+c.gap || 0) > 0) await pause(+c.gap, ac.signal);
          lastVoice = sg.voice.key + (sg.voice.name || '');
          speaking = true; announce(sg); duckBeds(true);
          if (sg.voice.conn) {
            const clip = await sg.clip;
            if (clip && !ac.signal.aborted) {
              const onTime = (sec: number, dur: number) => { if (clip.marks) return at(sg, charAtTime(clip.marks, sec)); if (isFinite(dur) && dur > 0) at(sg, charAtFraction(sg.acc ||= weights(sg.text), sec / dur)); };
              const b = await wake() ? await decode(await clip.blob.arrayBuffer()).catch(() => null) : null;
              if (b) await playBuffer(b, ac.signal, volume * gainOf(sg, b), onTime, sg.fx);
              else await playElement(clip.blob, ac.signal, volume, onTime);
            }
          } else {
            const acted = actFor('browser', '', sg.voice.v, sg.how, power), sp = respell(sg.text, wordsFor(c.pron, sg.voice.charId));
            await sayBrowser(sp.text, { ...sg.voice.v, pitch: (+sg.voice.v.pitch || 1) * acted.pitch }, sg.voice.speed * acted.rate, volume * Math.pow(10, Math.min(0, acted.gainDb) / 20), ac.signal, i => at(sg, i), sp.map);
          }
          speaking = false; idx = me.jump ?? idx + 1; me.jump = null;
        } else if (ended) break;
        else await new Promise<void>(r => { nudgeFn = r; ac.signal.addEventListener('abort', () => r(), { once: true }); });
      }
    } catch (e) { error ||= e; }
    finally {
      speaking = false; busy--; jobs.delete(ac); duckBeds(false);
      if (live === me) live = null;
      if (R?.job === job) setR(null);
      // 다 읽고 한동안 다음 읽기가 없으면 바탕 소리를 거둔다 (이어 읽기 중이면 그대로 이어진다)
      clearTimeout(bedTimer); bedTimer = window.setTimeout(() => { if (!busy) void setBed('', 0, 2.4); }, 2600);
      if (!busy) maybeNap(6000);
    }
  })();
  chain = run;
  const out: SpeechStream & { error?: unknown } = {
    push(d: string) { if (ended || ac.signal.aborted || !d) return; buf += d; all += d; const r = takeSentences(buf, false); buf = r.rest; r.parts.forEach(p => add(p, base)); if (idx < segs.length) fetchAhead(); },
    end() { if (ended) return; const r = takeSentences(buf, true); buf = ''; r.parts.forEach(p => add(p, base)); ended = true; fetchAhead(); nudge(); if (R?.job === job) setR({ ...R, canNext: idx < segs.length - 1 }); },
    stop() { ended = true; ac.abort(); nudge(); },
    tone(h: string[]) { how = h.length ? h : undefined; },
    done: run,
    get speaking() { return speaking; },
    get error() { return error; },
  };
  return out;
}
let bedTimer = 0, stops = 0;
const pause = (ms: number, signal: AbortSignal) => new Promise<void>(r => { if (signal.aborted) return r(); const id = setTimeout(r, ms); signal.addEventListener('abort', () => { clearTimeout(id); r(); }, { once: true }); });

const impl: TtsApi = {
  enabled: () => !!cfg().on,
  voiceFor(charId) {
    const c = cfg(), own = charId ? c.chars[charId] : undefined;
    return { ...DEFAULT_VOICE, ...(own?.provider ? own : c.voice) };
  },
  async speak(text, o = {}) {
    const st = makeStream(o);
    if (o.signal) { if (o.signal.aborted) st.stop(); else o.signal.addEventListener('abort', () => st.stop(), { once: true }); }
    st.push(text); st.end();
    await st.done;
    if (st.error) throw st.error;
  },
  async perform(takes, o = {}) {
    const st = makeStream(o, takes);
    if (o.signal) { if (o.signal.aborted) st.stop(); else o.signal.addEventListener('abort', () => st.stop(), { once: true }); }
    await st.done;
    if (st.error) throw st.error;
  },
  stream: o => makeStream(o),
  stopAll() {
    stops++; held = false; wake2();
    for (const j of [...jobs]) j.abort();
    for (const k of [...playing]) k();
    if ('speechSynthesis' in window) speechSynthesis.cancel();
    setR(null);
  },
  captureStream() {
    const c = cfg();
    const all = [c.voice, ...Object.values(c.chars)].filter(x => x?.provider);
    if (all.every(x => x.provider === 'browser')) return null;   // 브라우저 음성은 담을 수 없다
    return mixer()?.tap.stream || null;
  },
  reading: () => R,
  watch(f) { subs.add(f); return () => { subs.delete(f); }; },
  pause() {
    if (!live || held) return;
    held = true; ctl?.hold();
    if (R) setR({ ...R, paused: true });
  },
  resume() {
    if (!held) return;
    held = false; ctl?.go(); wake2();
    if (R) setR({ ...R, paused: false });
  },
  step(d) {
    const l = live; if (!l || !d) return;
    l.jump = Math.max(0, Math.min(l.idx + d, l.ended() ? l.count() : l.idx + d));
    const wasHeld = held; held = false; wake2();
    if (wasHeld && R) setR({ ...R, paused: false });
    ctl?.skip();
  },
  level: () => (busy ? voiceLevel() : 0),
  epoch: () => stops,
};
setTtsImpl(impl);
export const ttsImpl = impl;
/** 지금 무언가 읽고 있는가 */
export const ttsBusy = () => busy > 0;
