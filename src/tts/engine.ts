// ── 읽어 주기 엔진: 한 번에 한 조각씩 재생하는 줄 · 문장 단위 스트리밍 · 녹음용 MediaStream ──
// 지금 읽는 자리(조각 · 글자)를 알려 주고(따라 읽기), 멈춤 · 이어 읽기 · 앞뒤 문장으로 옮기기를 받는다.
import { setTtsImpl, type Reading, type SpeakOpts, type SpeechStream, type TtsApi, type VoicePick } from './api';
import { cfg, connOf, DEFAULT_VOICE } from './config';
import { synthClip, type Clip } from './providers';
import { cleanForSpeech, guessLang, takeSentences } from './text';
import { charAtFraction, charAtTime, guessSeconds, weights, wordAt } from './follow';
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
const wake = () => { for (const w of [...waiters]) w(); waiters.clear(); };
async function whileHeld(signal: AbortSignal) {
  while (held && !signal.aborted) await new Promise<void>(r => { waiters.add(r); signal.addEventListener('abort', () => r(), { once: true }); });
}
/** 지금 돌고 있는 묶음 (앞뒤 문장으로 옮길 때 쓴다) */
let live: { job: number; idx: number; count: () => number; ended: () => boolean; jump: number | null } | null = null;

// ════════ 소리 내기 ════════
let ctx: AudioContext | null = null, gain: GainNode | null = null, tap: MediaStreamAudioDestinationNode | null = null;
function graph() {
  if (ctx) return ctx;
  const AC = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AC) return null;
  ctx = new AC(); gain = ctx.createGain(); tap = ctx.createMediaStreamDestination();
  gain.connect(ctx.destination); gain.connect(tap);
  return ctx;
}
async function running(): Promise<boolean> {
  const c = graph(); if (!c) return false;
  if (c.state !== 'running') await Promise.race([c.resume().catch(() => { }), new Promise(r => setTimeout(r, 300))]);
  return c.state === 'running';
}
/** 전화기 너머 목소리: 낮은 소리 · 높은 소리를 깎고 가운데를 살짝 올린다 */
function phoneChain(c: AudioContext, out: AudioNode): AudioNode {
  const hp = c.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 330; hp.Q.value = 0.8;
  const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 3300; lp.Q.value = 0.9;
  const mid = c.createBiquadFilter(); mid.type = 'peaking'; mid.frequency.value = 1700; mid.gain.value = 5; mid.Q.value = 1.1;
  const comp = c.createDynamicsCompressor(); comp.threshold.value = -26; comp.ratio.value = 4;
  hp.connect(lp); lp.connect(mid); mid.connect(comp); comp.connect(out);
  return hp;
}
/** 지금 소리 끄기용 (stopAll) */
const playing = new Set<() => void>();

/** 소리 파일 하나를 끝까지 (또는 멈출 때까지) 튼다. onTime(지금 초, 전체 초) 를 자주 부른다 */
async function playBlob(blob: Blob, signal: AbortSignal, volume: number, onTime: (sec: number, dur: number) => void, fx?: string): Promise<void> {
  if (signal.aborted) return;
  const url = URL.createObjectURL(blob), el = new Audio();
  el.src = url;
  let src: MediaElementAudioSourceNode | null = null;
  if (await running()) { try { src = ctx!.createMediaElementSource(el); src.connect(fx === 'phone' ? phoneChain(ctx!, gain!) : gain!); gain!.gain.value = volume; } catch { src = null; el.volume = volume; } }
  else el.volume = volume;
  await new Promise<void>(resolve => {
    let tick = 0;
    const fin = () => { clearInterval(tick); playing.delete(kill); signal.removeEventListener('abort', kill); el.onended = el.onerror = null; if (ctl === me) ctl = null; try { src?.disconnect(); } catch { } URL.revokeObjectURL(url); resolve(); };
    const kill = () => { try { el.pause(); el.removeAttribute('src'); el.load(); } catch { } fin(); };
    const me: Ctl = { hold: () => el.pause(), go: () => { void el.play().catch(() => { }); }, skip: kill };
    playing.add(kill); signal.addEventListener('abort', kill, { once: true });
    el.onended = fin; el.onerror = fin;
    ctl = me;
    tick = window.setInterval(() => { if (!el.paused) onTime(el.currentTime, el.duration); }, 90);
    if (held) return;   // 멈춘 채로 왔다: 이어 읽을 때 튼다
    el.play().catch(e => { console.warn('[TTS] 재생 실패', e); fin(); });
  });
}

/** 브라우저 음성으로 한 조각. onChar(지금 읽는 글자 위치) — 경계 알림이 오면 그것, 안 오는 목소리면 시간으로 짐작 */
function sayBrowser(text: string, v: VoicePick, speed: number, volume: number, signal: AbortSignal, onChar: (i: number) => void): Promise<void> {
  if (!('speechSynthesis' in window)) return Promise.reject(new Error(t('chat.speak.unsupported')));
  if (signal.aborted) return Promise.resolve();
  return new Promise<void>(resolve => {
    const want = String(v.voice || '').toLowerCase();
    const vs = speechSynthesis.getVoices(), hit = want ? vs.find(x => x.name.toLowerCase() === want || x.voiceURI.toLowerCase() === want) || vs.find(x => x.name.toLowerCase().includes(want)) : undefined;
    let done = false, cur: SpeechSynthesisUtterance | null = null, last = 0, bounds = false, startedAt = 0, spent = 0, firstAt = 0;
    const total = guessSeconds(text, speed) * 1000, acc = weights(text);
    // 멈췄다가 이어 읽을 때는 멈춘 낱말부터 새로 읽는다 (pause() 를 제대로 듣지 않는 브라우저가 많다)
    const make = (from: number) => {
      const u = new SpeechSynthesisUtterance(text.slice(from));
      if (hit) { u.voice = hit; u.lang = hit.lang; } else u.lang = guessLang(text);
      u.rate = Math.min(10, Math.max(0.1, speed)); u.pitch = Math.min(2, Math.max(0, +v.pitch || 1)); u.volume = volume;
      u.onboundary = e => { if (u !== cur || (e.name && e.name !== 'word')) return; bounds = true; last = from + (e.charIndex || 0); onChar(last); };
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
      const i = charAtFraction(acc, (spent + performance.now() - startedAt) / Math.max(1, total)); last = Math.max(last, i); onChar(last);
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

interface Seg { text: string; clip?: Promise<Clip | null>; acc?: number[] }

function makeStream(o: SpeakOpts = {}): SpeechStream & { error?: unknown } {
  const ac = new AbortController(); jobs.add(ac);
  const c = cfg(), v: VoicePick = { ...impl.voiceFor(o.charId), ...(o.voice || {}) } as VoicePick;
  const conn = connOf(v), readActions = c.actions !== 'skip';
  const speed = (+v.rate || 1) * (+c.rate || 1), volume = Math.min(1, Math.max(0, +c.volume));
  const job = ++jobNo, key = o.key || '';
  let error: unknown;
  let buf = '', all = '', ended = false, idx = 0, speaking = false, nudgeFn: (() => void) | null = null;
  const segs: Seg[] = [];
  const nudge = () => { const w = nudgeFn; nudgeFn = null; w?.(); };
  const add = (raw: string) => { const s = cleanForSpeech(raw, readActions); if (s && /[\p{L}\p{N}]/u.test(s)) { segs.push({ text: s }); nudge(); } };
  const fetchAhead = () => {   // 지금 것과 뒤로 두 조각까지 미리 받아 둔다 (앞 문장으로 돌아가면 받아 둔 것을 다시 튼다)
    if (!conn) return;
    for (let i = idx; i < Math.min(segs.length, idx + 3); i++) {
      const sg = segs[i]; if (sg.clip) continue;
      sg.clip = synthClip(conn, v, sg.text, speed, ac.signal).catch(e => { if (!ac.signal.aborted) { error ||= e; ac.abort(); } return null; });
    }
  };
  /** 지금 읽는 글자 위치가 바뀌었다 (낱말이 넘어갈 때만 알린다) */
  const at = (sg: Seg, i: number) => {
    if (!R || R.job !== job || R.seg !== sg.text) return;
    const w = wordAt(sg.text, i).start; if (w !== R.char) setR({ ...R, char: w });
  };
  const announce = (sg: Seg) => setR({ key, job, charId: o.charId, src: all, at: o.at || 0, seg: sg.text, segNo: idx, char: 0, paused: held, canBack: idx > 0, canNext: idx < segs.length - 1 || !ended });
  const prev = chain;
  const run = (async () => {
    await prev.catch(() => { });
    if (v.provider !== 'browser' && !conn) { error = new Error(t('tts.err.noConn')); return; }
    busy++;
    const me = live = { job, idx: 0, count: () => segs.length, ended: () => ended, jump: null as number | null };
    try {
      while (!ac.signal.aborted) {
        if (idx < segs.length) {
          await whileHeld(ac.signal); if (ac.signal.aborted) break;
          fetchAhead();
          const sg = segs[idx]; speaking = true; me.idx = idx; me.jump = null;
          announce(sg);
          if (conn) {
            const clip = await sg.clip;
            if (clip && !ac.signal.aborted) await playBlob(clip.blob, ac.signal, volume, (sec, dur) => {
              if (clip.marks) return at(sg, charAtTime(clip.marks, sec));
              if (isFinite(dur) && dur > 0) at(sg, charAtFraction(sg.acc ||= weights(sg.text), sec / dur));
            }, o.fx);
          } else await sayBrowser(sg.text, v, speed, volume, ac.signal, i => at(sg, i));
          speaking = false; idx = me.jump ?? idx + 1; me.jump = null;
        } else if (ended) break;
        else await new Promise<void>(r => { nudgeFn = r; ac.signal.addEventListener('abort', () => r(), { once: true }); });
      }
    } catch (e) { error ||= e; }
    finally {
      speaking = false; busy--; jobs.delete(ac);
      if (live === me) live = null;
      if (R?.job === job) setR(null);
    }
  })();
  chain = run;
  const out: SpeechStream & { error?: unknown } = {
    push(d: string) { if (ended || ac.signal.aborted || !d) return; buf += d; all += d; const r = takeSentences(buf, false); buf = r.rest; r.parts.forEach(add); if (idx < segs.length) fetchAhead(); },
    end() { if (ended) return; const r = takeSentences(buf, true); buf = ''; r.parts.forEach(add); ended = true; fetchAhead(); nudge(); if (R?.job === job) setR({ ...R, canNext: idx < segs.length - 1 }); },
    stop() { ended = true; ac.abort(); nudge(); },
    done: run,
    get speaking() { return speaking; },
    get error() { return error; },
  };
  return out;
}

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
  stream: o => makeStream(o),
  stopAll() {
    held = false; wake();
    for (const j of [...jobs]) j.abort();
    for (const k of [...playing]) k();
    if ('speechSynthesis' in window) speechSynthesis.cancel();
    setR(null);
  },
  captureStream() {
    const c = cfg();
    const all = [c.voice, ...Object.values(c.chars)].filter(x => x?.provider);
    if (all.every(x => x.provider === 'browser')) return null;   // 브라우저 음성은 담을 수 없다
    return graph() ? tap!.stream : null;
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
    held = false; ctl?.go(); wake();
    if (R) setR({ ...R, paused: false });
  },
  step(d) {
    const l = live; if (!l || !d) return;
    l.jump = Math.max(0, Math.min(l.idx + d, l.ended() ? l.count() : l.idx + d));
    const wasHeld = held; held = false; wake();
    if (wasHeld && R) setR({ ...R, paused: false });
    ctl?.skip();
  },
};
setTtsImpl(impl);
export const ttsImpl = impl;
/** 지금 무언가 읽고 있는가 */
export const ttsBusy = () => busy > 0;
