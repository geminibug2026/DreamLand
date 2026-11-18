// ── 읽어 주기 엔진: 한 번에 한 조각씩 재생하는 줄 · 문장 단위 스트리밍 · 녹음용 MediaStream ──
import { setTtsImpl, type SpeechStream, type TtsApi, type VoicePick } from './api';
import { cfg, connOf, DEFAULT_VOICE } from './config';
import { synth } from './providers';
import { cleanForSpeech, guessLang, takeSentences } from './text';
import { t } from '../i18n';

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
/** 지금 소리 끄기용 (stopAll) */
const playing = new Set<() => void>();

/** 소리 파일 하나를 끝까지 (또는 멈출 때까지) 튼다 */
async function playBlob(blob: Blob, signal: AbortSignal, volume: number): Promise<void> {
  if (signal.aborted) return;
  const url = URL.createObjectURL(blob), el = new Audio();
  el.src = url;
  let src: MediaElementAudioSourceNode | null = null;
  if (await running()) { try { src = ctx!.createMediaElementSource(el); src.connect(gain!); gain!.gain.value = volume; } catch { src = null; el.volume = volume; } }
  else el.volume = volume;
  await new Promise<void>(resolve => {
    const fin = () => { playing.delete(kill); signal.removeEventListener('abort', kill); el.onended = el.onerror = null; try { src?.disconnect(); } catch { } URL.revokeObjectURL(url); resolve(); };
    const kill = () => { try { el.pause(); el.removeAttribute('src'); el.load(); } catch { } fin(); };
    playing.add(kill); signal.addEventListener('abort', kill, { once: true });
    el.onended = fin; el.onerror = fin;
    el.play().catch(e => { console.warn('[TTS] 재생 실패', e); fin(); });
  });
}

/** 브라우저 음성으로 한 조각 */
function sayBrowser(text: string, v: VoicePick, speed: number, volume: number, signal: AbortSignal): Promise<void> {
  if (!('speechSynthesis' in window)) return Promise.reject(new Error(t('chat.speak.unsupported')));
  if (signal.aborted) return Promise.resolve();
  return new Promise<void>(resolve => {
    const u = new SpeechSynthesisUtterance(text), want = String(v.voice || '').toLowerCase();
    const vs = speechSynthesis.getVoices(), hit = want ? vs.find(x => x.name.toLowerCase() === want || x.voiceURI.toLowerCase() === want) || vs.find(x => x.name.toLowerCase().includes(want)) : undefined;
    if (hit) { u.voice = hit; u.lang = hit.lang; } else u.lang = guessLang(text);
    u.rate = Math.min(10, Math.max(0.1, speed)); u.pitch = Math.min(2, Math.max(0, +v.pitch || 1)); u.volume = volume;
    let done = false;
    const fin = () => { if (done) return; done = true; playing.delete(kill); signal.removeEventListener('abort', kill); clearInterval(keep); resolve(); };
    const kill = () => { speechSynthesis.cancel(); fin(); };
    // 크롬은 15초쯤 넘는 발화를 스스로 끊는 일이 있어 가끔 살짝 깨운다
    const keep = setInterval(() => { if (speechSynthesis.speaking && !speechSynthesis.paused) { speechSynthesis.pause(); speechSynthesis.resume(); } }, 10000);
    u.onend = fin; u.onerror = fin;
    playing.add(kill); signal.addEventListener('abort', kill, { once: true });
    speechSynthesis.speak(u);
  });
}

// ════════ 줄: 묶음(job)이 차례로 하나씩 ════════
let chain: Promise<void> = Promise.resolve();
const jobs = new Set<AbortController>();
let busy = 0;

interface Seg { text: string; clip?: Promise<Blob | null> }

function makeStream(o: { charId?: string | null; voice?: Partial<VoicePick> } = {}): SpeechStream & { error?: unknown } {
  const ac = new AbortController(); jobs.add(ac);
  const c = cfg(), v: VoicePick = { ...impl.voiceFor(o.charId), ...(o.voice || {}) } as VoicePick;
  const conn = connOf(v), readActions = c.actions !== 'skip';
  const speed = (+v.rate || 1) * (+c.rate || 1), volume = Math.min(1, Math.max(0, +c.volume));
  let error: unknown;
  let buf = '', ended = false, idx = 0, speaking = false, wake: (() => void) | null = null;
  const segs: Seg[] = [];
  const nudge = () => { const w = wake; wake = null; w?.(); };
  const add = (raw: string) => { const s = cleanForSpeech(raw, readActions); if (s && /[\p{L}\p{N}]/u.test(s)) { segs.push({ text: s }); nudge(); } };
  const fetchAhead = () => {   // 지금 것과 뒤로 두 조각까지 미리 받아 둔다
    if (!conn) return;
    for (let i = idx; i < Math.min(segs.length, idx + 3); i++) {
      const sg = segs[i]; if (sg.clip) continue;
      sg.clip = synth(conn, v, sg.text, speed, ac.signal).catch(e => { if (!ac.signal.aborted) { error ||= e; ac.abort(); } return null; });
    }
  };
  const prev = chain;
  const run = (async () => {
    await prev.catch(() => { });
    if (v.provider !== 'browser' && !conn) { error = new Error(t('tts.err.noConn')); return; }
    busy++;
    try {
      while (!ac.signal.aborted) {
        if (idx < segs.length) {
          fetchAhead();
          const sg = segs[idx]; speaking = true;
          if (conn) { const b = await sg.clip; if (b && !ac.signal.aborted) await playBlob(b, ac.signal, volume); }
          else await sayBrowser(sg.text, v, speed, volume, ac.signal);
          speaking = false; idx++;
        } else if (ended) break;
        else await new Promise<void>(r => { wake = r; ac.signal.addEventListener('abort', () => r(), { once: true }); });
      }
    } catch (e) { error ||= e; }
    finally { speaking = false; busy--; jobs.delete(ac); }
  })();
  chain = run;
  const out: SpeechStream & { error?: unknown } = {
    push(d: string) { if (ended || ac.signal.aborted || !d) return; buf += d; const r = takeSentences(buf, false); buf = r.rest; r.parts.forEach(add); if (idx < segs.length) fetchAhead(); },
    end() { if (ended) return; const r = takeSentences(buf, true); buf = ''; r.parts.forEach(add); ended = true; fetchAhead(); nudge(); },
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
    for (const j of [...jobs]) j.abort();
    for (const k of [...playing]) k();
    if ('speechSynthesis' in window) speechSynthesis.cancel();
  },
  captureStream() {
    const c = cfg();
    const all = [c.voice, ...Object.values(c.chars)].filter(x => x?.provider);
    if (all.every(x => x.provider === 'browser')) return null;   // 브라우저 음성은 담을 수 없다
    return graph() ? tap!.stream : null;
  },
};
setTtsImpl(impl);
export const ttsImpl = impl;
/** 지금 무언가 읽고 있는가 */
export const ttsBusy = () => busy > 0;
