// ── 장면 소리: 효과음(한 번) · 바탕 소리(되풀이) ──
// 녹음 파일(sounds/fx — 출처는 sounds/CREDITS.txt, 모두 퍼블릭 도메인 · CC0)을 처음 쓸 때 받는다.
// 파일이 없거나 받지 못하면 Web Audio 로 만든 소리를 쓴다. 만든 소리도 한 번만 만들어 둔다.
import { audibleSpan, decode, duckBeds, holdAwake, maybeNap, mixer, wake } from './mix';
import { BED_IDS, SOUND_IDS } from './marks';

const FILE = new Set(['door_open', 'door_close', 'footsteps', 'page', 'coins', 'blade', 'lock', 'rustle', 'sword', 'glass_break', 'heartbeat', 'gunshot', 'camera', 'message', 'doorbell', 'thunder', 'knock',
  'rain', 'storm', 'wind', 'cafe', 'street', 'night', 'forest', 'sea', 'fire']);
const url = (id: string) => `sounds/fx/${id}.mp3`;
/** 사용자가 바꿔 넣은 바탕 소리 (전화 설정의 소리 파일) — 있으면 그것을 먼저 */
export const bedOverride: { get?: (id: string) => Promise<string | null> } = {};

const SR = 22050;
type Recipe = (c: OfflineAudioContext, out: AudioNode, len: number) => void;
const rnd = (a: number, b: number) => a + Math.random() * (b - a);

// ── 만든 소리 도구 ──
function noiseBuf(c: BaseAudioContext, sec: number, kind: 'white' | 'brown' | 'pink' = 'white'): AudioBuffer {
  const n = Math.max(1, Math.floor(sec * c.sampleRate)), b = c.createBuffer(1, n, c.sampleRate), d = b.getChannelData(0);
  let last = 0, b0 = 0, b1 = 0, b2 = 0;
  for (let i = 0; i < n; i++) {
    const w = Math.random() * 2 - 1;
    if (kind === 'white') d[i] = w;
    else if (kind === 'brown') { last = (last + 0.02 * w) / 1.02; d[i] = last * 3.5; }
    else { b0 = 0.99765 * b0 + w * 0.099046; b1 = 0.963 * b1 + w * 0.2965164; b2 = 0.57 * b2 + w * 1.0526913; d[i] = (b0 + b1 + b2 + w * 0.1848) * 0.22; }
  }
  return b;
}
function noise(c: BaseAudioContext, out: AudioNode, t: number, dur: number, o: { kind?: 'white' | 'brown' | 'pink'; type?: BiquadFilterType; f?: number; f2?: number; q?: number; peak?: number; a?: number; r?: number } = {}) {
  const s = c.createBufferSource(); s.buffer = noiseBuf(c, dur + 0.05, o.kind);
  const f = c.createBiquadFilter(); f.type = o.type || 'lowpass'; f.frequency.setValueAtTime(o.f ?? 2000, t); if (o.f2) f.frequency.exponentialRampToValueAtTime(o.f2, t + dur); f.Q.value = o.q ?? 0.8;
  const g = c.createGain(); env(g.gain, t, o.a ?? 0.004, dur, o.peak ?? 0.5, o.r);
  s.connect(f); f.connect(g); g.connect(out); s.start(t); s.stop(t + dur + 0.05);
}
function tone(c: BaseAudioContext, out: AudioNode, t: number, dur: number, f0: number, o: { f1?: number; type?: OscillatorType; peak?: number; a?: number } = {}) {
  const s = c.createOscillator(); s.type = o.type || 'sine'; s.frequency.setValueAtTime(f0, t); if (o.f1) s.frequency.exponentialRampToValueAtTime(o.f1, t + dur);
  const g = c.createGain(); env(g.gain, t, o.a ?? 0.003, dur, o.peak ?? 0.5);
  s.connect(g); g.connect(out); s.start(t); s.stop(t + dur + 0.05);
}
/** 짧게 올라갔다 지수로 사라지는 크기 */
function env(p: AudioParam, t: number, a: number, dur: number, peak: number, r?: number) {
  p.setValueAtTime(0.0001, t); p.exponentialRampToValueAtTime(peak, t + a); p.exponentialRampToValueAtTime(0.0001, t + Math.max(a + 0.01, r ?? dur));
}
const bell = (c: BaseAudioContext, out: AudioNode, t: number, f: number, dur: number, peak: number, ratios = [1, 2.01, 3.02, 4.17]) => ratios.forEach((r, i) => tone(c, out, t, dur / (1 + i * 0.6), f * r, { peak: peak / (1 + i * 1.4) }));

// ── 효과음 만드는 법 (파일이 없을 때) ──
const SHOT: Record<string, [number, Recipe]> = {
  knock: [0.8, (c, o) => [0, 0.19, 0.36].forEach((t, i) => { noise(c, o, t, 0.06, { f: 900, peak: 0.55 - i * 0.05 }); tone(c, o, t, 0.1, 160, { f1: 90, peak: 0.7 }); })],
  door_close: [0.7, (c, o) => { tone(c, o, 0, 0.28, 85, { f1: 45, peak: 0.9 }); noise(c, o, 0, 0.14, { f: 700, peak: 0.5 }); noise(c, o, 0.05, 0.02, { type: 'highpass', f: 3000, peak: 0.3 }); }],
  door_open: [1.0, (c, o) => { const s = c.createOscillator(); s.type = 'sawtooth'; s.frequency.setValueAtTime(240, 0); s.frequency.linearRampToValueAtTime(390, 0.85); const v = c.createOscillator(); v.frequency.value = 23; const vg = c.createGain(); vg.gain.value = 18; v.connect(vg); vg.connect(s.frequency); const f = c.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 950; f.Q.value = 5; const g = c.createGain(); g.gain.setValueAtTime(0, 0); g.gain.linearRampToValueAtTime(0.35, 0.15); g.gain.linearRampToValueAtTime(0.2, 0.6); g.gain.linearRampToValueAtTime(0, 0.95); s.connect(f); f.connect(g); g.connect(o); s.start(0); v.start(0); s.stop(1); v.stop(1); }],
  footsteps: [2.6, (c, o) => { for (let i = 0; i < 5; i++) { const t = i * 0.48 + rnd(0, 0.03); noise(c, o, t, 0.08, { f: 1300, peak: 0.45 - (i % 2) * 0.1 }); tone(c, o, t, 0.07, 75, { peak: 0.5 }); } }],
  phone_buzz: [1.3, (c, o) => [0, 0.7].forEach(t => { const s = c.createOscillator(); s.type = 'square'; s.frequency.value = 152; const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 420; const g = c.createGain(); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.32, t + 0.02); g.gain.setValueAtTime(0.32, t + 0.42); g.gain.linearRampToValueAtTime(0, t + 0.46); const am = c.createOscillator(); am.frequency.value = 31; const ag = c.createGain(); ag.gain.value = 0.12; am.connect(ag); ag.connect(g.gain); s.connect(f); f.connect(g); g.connect(o); s.start(t); am.start(t); s.stop(t + 0.5); am.stop(t + 0.5); })],
  message: [0.9, (c, o) => { bell(c, o, 0, 1318, 0.35, 0.35, [1, 2]); bell(c, o, 0.12, 1760, 0.6, 0.35, [1, 2]); }],
  doorbell: [2.2, (c, o) => { bell(c, o, 0, 659, 1.2, 0.45); bell(c, o, 0.5, 523, 1.6, 0.45); }],
  glass_clink: [0.7, (c, o) => [0, 0.09].forEach(t => [2350, 3870, 5620, 7400].forEach((f, i) => tone(c, o, t, 0.5 - i * 0.08, f * rnd(0.99, 1.01), { peak: 0.22 / (1 + i * 0.5) })))],
  glass_break: [1.2, (c, o) => { [2350, 3870, 5620, 7400].forEach((f, i) => tone(c, o, 0, 0.4, f, { peak: 0.15 / (1 + i * 0.4) })); noise(c, o, 0, 0.9, { type: 'highpass', f: 2800, peak: 0.45 }); for (let i = 0; i < 14; i++) tone(c, o, rnd(0.05, 0.8), 0.08, rnd(3000, 8000), { peak: 0.08 }); }],
  page: [0.6, (c, o) => noise(c, o, 0, 0.38, { type: 'bandpass', f: 1800, f2: 4200, q: 1.2, peak: 0.35, a: 0.05 })],
  rustle: [0.8, (c, o) => { for (let i = 0; i < 4; i++) noise(c, o, i * 0.14 + rnd(0, 0.04), 0.16, { type: 'bandpass', f: rnd(1500, 2600), q: 1, peak: 0.22, a: 0.03 }); }],
  coins: [0.8, (c, o) => { for (let i = 0; i < 7; i++) { const t = rnd(0, 0.5); tone(c, o, t, 0.18, rnd(3200, 6200), { peak: 0.12 }); tone(c, o, t, 0.12, rnd(5000, 8000), { peak: 0.06 }); } }],
  lock: [0.4, (c, o) => { noise(c, o, 0, 0.012, { type: 'highpass', f: 2500, peak: 0.5 }); noise(c, o, 0.09, 0.015, { type: 'highpass', f: 2000, peak: 0.55 }); tone(c, o, 0.09, 0.12, 2200, { peak: 0.08 }); }],
  blade: [0.6, (c, o) => { noise(c, o, 0, 0.4, { type: 'bandpass', f: 2000, f2: 7000, q: 2, peak: 0.25, a: 0.08 }); tone(c, o, 0.32, 0.25, 3100, { peak: 0.1 }); }],
  sword: [1.0, (c, o) => { noise(c, o, 0, 0.05, { type: 'highpass', f: 1500, peak: 0.6 }); [1100, 2730, 4310].forEach((f, i) => tone(c, o, 0, 0.9 - i * 0.2, f, { peak: 0.25 / (1 + i) })); }],
  punch: [0.4, (c, o) => { tone(c, o, 0, 0.16, 110, { f1: 48, peak: 0.95 }); noise(c, o, 0, 0.06, { f: 1200, peak: 0.55 }); }],
  gunshot: [1.6, (c, o) => { noise(c, o, 0, 0.22, { f: 5000, peak: 0.95, a: 0.001 }); tone(c, o, 0, 0.18, 90, { f1: 40, peak: 0.9 }); noise(c, o, 0.05, 1.4, { kind: 'brown', f: 700, peak: 0.25, a: 0.02 }); }],
  thunder: [5, (c, o) => { noise(c, o, 0, 0.25, { type: 'highpass', f: 1500, peak: 0.35 }); noise(c, o, 0.08, 4.6, { kind: 'brown', f: 260, peak: 0.95, a: 0.5, r: 4.6 }); noise(c, o, 1.2, 2.4, { kind: 'brown', f: 160, peak: 0.6, a: 0.4 }); }],
  heartbeat: [1.9, (c, o) => [0, 0.9].forEach(t => { tone(c, o, t, 0.13, 62, { f1: 46, peak: 0.95 }); tone(c, o, t + 0.22, 0.11, 55, { f1: 42, peak: 0.7 }); })],
  camera: [0.4, (c, o) => { noise(c, o, 0, 0.012, { type: 'highpass', f: 3000, peak: 0.6 }); noise(c, o, 0.06, 0.05, { type: 'bandpass', f: 2200, q: 2, peak: 0.4 }); }],
};
// ── 바탕 소리 만드는 법 (len 초를 만든 뒤 끝을 처음에 겹쳐 되풀이되게 한다) ──
const BED: Record<string, Recipe> = {
  rain: (c, o, L) => { noise(c, o, 0, L, { type: 'highpass', f: 1100, peak: 0.16, a: 0.01, r: L }); for (let t = 0; t < L; t += rnd(0.01, 0.06)) tone(c, o, t, 0.02, rnd(2500, 6500), { peak: rnd(0.01, 0.04) }); },
  storm: (c, o, L) => { noise(c, o, 0, L, { type: 'highpass', f: 800, peak: 0.24, a: 0.01, r: L }); noise(c, o, 2, 5, { kind: 'brown', f: 200, peak: 0.7, a: 0.8 }); },
  wind: (c, o, L) => { const s = c.createBufferSource(); s.buffer = noiseBuf(c, L, 'pink'); const f = c.createBiquadFilter(); f.type = 'bandpass'; f.Q.value = 0.9; f.frequency.value = 520; const l = c.createOscillator(); l.frequency.value = 0.11; const lg = c.createGain(); lg.gain.value = 260; l.connect(lg); lg.connect(f.frequency); const g = c.createGain(); g.gain.value = 0.9; s.connect(f); f.connect(g); g.connect(o); s.start(0); l.start(0); },
  cafe: (c, o, L) => { for (let k = 0; k < 5; k++) { const s = c.createBufferSource(); s.buffer = noiseBuf(c, L, 'pink'); const f = c.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = rnd(350, 1400); f.Q.value = 2.5; const g = c.createGain(); g.gain.value = 0; for (let t = 0; t < L; t += rnd(0.12, 0.3)) g.gain.setTargetAtTime(rnd(0, 0.18), t, 0.05); s.connect(f); f.connect(g); g.connect(o); s.start(0); } for (let t = rnd(0.5, 2); t < L; t += rnd(1.5, 4)) [2350, 3870].forEach(f => tone(c, o, t, 0.3, f, { peak: 0.03 })); },
  street: (c, o, L) => { noise(c, o, 0, L, { kind: 'brown', f: 220, peak: 0.5, a: 0.5, r: L }); for (let t = rnd(0, 2); t < L - 2; t += rnd(2.5, 5)) noise(c, o, t, 3, { type: 'bandpass', f: 300, f2: 900, q: 0.8, peak: 0.25, a: 1.2 }); },
  night: (c, o, L) => { [4400, 4730].forEach((f, k) => { for (let t = k * 0.27; t < L; t += rnd(0.45, 0.7)) for (let p = 0; p < 3; p++) tone(c, o, t + p * 0.035, 0.025, f, { peak: 0.05 }); }); noise(c, o, 0, L, { kind: 'brown', f: 300, peak: 0.08, a: 0.5, r: L }); },
  forest: (c, o, L) => { noise(c, o, 0, L, { type: 'bandpass', f: 1500, q: 0.5, peak: 0.05, a: 0.5, r: L }); for (let t = rnd(0, 1); t < L; t += rnd(0.6, 2.2)) { const f = rnd(2500, 4800); for (let p = 0; p < 2 + Math.floor(rnd(0, 3)); p++) tone(c, o, t + p * 0.11, 0.08, f * rnd(0.9, 1.1), { f1: f * rnd(1.1, 1.4), peak: 0.06 }); } },
  sea: (c, o, L) => { for (let t = 0; t < L; t += 5.5) { noise(c, o, t, 5, { kind: 'brown', f: 500, peak: 0.6, a: 2.2, r: 5 }); noise(c, o, t + 1.8, 2.6, { type: 'highpass', f: 2000, peak: 0.12, a: 0.6 }); } },
  fire: (c, o, L) => { noise(c, o, 0, L, { kind: 'brown', f: 420, peak: 0.45, a: 0.5, r: L }); for (let t = 0; t < L; t += rnd(0.03, 0.35)) noise(c, o, t, 0.008, { type: 'highpass', f: rnd(1500, 4000), peak: rnd(0.05, 0.3) }); },
  room: (c, o, L) => { noise(c, o, 0, L, { kind: 'brown', f: 180, peak: 0.08, a: 0.5, r: L }); for (let t = 0.5; t < L; t += 1) noise(c, o, t, 0.006, { type: 'highpass', f: 3200, peak: t % 2 < 1 ? 0.16 : 0.12 }); },
};

async function render(sec: number, recipe: Recipe): Promise<AudioBuffer | null> {
  const OAC = window.OfflineAudioContext || (window as unknown as { webkitOfflineAudioContext?: typeof OfflineAudioContext }).webkitOfflineAudioContext; if (!OAC) return null;
  const c = new OAC(1, Math.ceil(sec * SR), SR), g = c.createGain(); g.connect(c.destination);
  recipe(c, g, sec);
  return c.startRendering();
}
/** 끝 xf 초를 처음에 겹쳐 끊김 없이 되풀이되는 소리로 */
function seamless(b: AudioBuffer, xf: number): AudioBuffer {
  const d = b.getChannelData(0), f = Math.floor(xf * b.sampleRate), n = d.length - f;
  for (let i = 0; i < f; i++) { const w = i / f; d[i] = d[i] * Math.sqrt(w) + d[n + i] * Math.sqrt(1 - w); }
  const out = new AudioBuffer({ length: n, sampleRate: b.sampleRate, numberOfChannels: 1 }); out.copyToChannel(d.subarray(0, n), 0); return out;
}
/** 소리 크기를 맞춘다 (만든 소리는 크기가 들쭉날쭉하다) */
function level(b: AudioBuffer, peak: number): AudioBuffer {
  const d = b.getChannelData(0); let m = 0; for (let i = 0; i < d.length; i++) m = Math.max(m, Math.abs(d[i]));
  if (m > 0) { const k = peak / m; for (let i = 0; i < d.length; i++) d[i] *= k; }
  return b;
}

const cache = new Map<string, Promise<{ buf: AudioBuffer; span: [number, number] } | null>>();
async function fromUrl(u: string): Promise<AudioBuffer | null> {
  try { const r = await fetch(u); if (!r.ok) return null; return await decode(await r.arrayBuffer()); } catch (e) { console.warn('[장면 소리]', u, e); return null; }
}
/** 소리 하나 (파일 → 안 되면 만든 소리). bed = 되풀이할 소리 */
function load(id: string, bed: boolean): Promise<{ buf: AudioBuffer; span: [number, number] } | null> {
  const k = (bed ? 'bed:' : 'fx:') + id;
  let p = cache.get(k);
  if (!p) {
    p = (async () => {
      if (!mixer()) return null;
      const own = bed ? await bedOverride.get?.(id).catch(() => null) : null;
      let buf = own ? await fromUrl(own) : null;
      if (!buf && FILE.has(id)) buf = await fromUrl(url(id));
      if (buf) return { buf, span: bed ? audibleSpan(buf) : [0, buf.duration] as [number, number] };
      if (bed && BED[id]) { const r = await render(12.5, BED[id]); if (!r) return null; const b = level(seamless(r, 1.5), 0.5); return { buf: b, span: [0, b.duration] as [number, number] }; }
      const sh = SHOT[id]; if (!sh) return null;
      const r = await render(sh[0], sh[1]); return r ? { buf: level(r, 0.8), span: [0, r.duration] as [number, number] } : null;
    })();
    cache.set(k, p);
  }
  return p;
}
/** 기억해 둔 소리를 버린다 (사용자 파일을 바꿨을 때) */
export function forgetSound(id: string, bed: boolean) { cache.delete((bed ? 'bed:' : 'fx:') + id); }
/** 효과음 · 바탕 소리의 소리 자료 (소리 파일로 저장할 때 쓴다) */
export const soundBuffer = (id: string) => load(id, false).then(x => x?.buf || null);
export const bedBuffer = (id: string) => load(id, true);
/** 미리 받아 둔다 (곧 쓸 소리) */
export function preload(ids: string[], bed = false) { for (const id of ids) void load(id, bed); }

/** 효과음을 한 번 울린다. 다 울리는 데 걸리는 초를 돌려준다 (못 울리면 0) */
export async function playSound(id: string, vol: number): Promise<number> {
  if (!(SOUND_IDS as readonly string[]).includes(id) || vol <= 0) return 0;
  const got = await load(id, false), m = mixer(); if (!got || !m || !(await wake())) return 0;
  const s = m.ctx.createBufferSource(), g = m.ctx.createGain(); s.buffer = got.buf; g.gain.value = Math.min(1.2, vol);
  s.connect(g); g.connect(m.fx); s.start(); s.onended = () => { try { g.disconnect(); } catch { } maybeNap(); };
  return got.buf.duration;
}

// ── 바탕 소리: 하나만 깔린다. 바꾸면 서로 겹치며 넘어간다 ──
// 누가 깔았는지(owner) 기억한다: 읽어 주기가 다 읽고 거둘 때 통화가 깐 소리는 건드리지 않는다
let bedNow: { id: string; src: AudioBufferSourceNode; g: GainNode } | null = null, bedWant = '', bedOwner = '';
/** 지금 깔린 바탕 소리 · 깐 쪽 */
export const currentBed = () => bedNow?.id || '';
export const bedOwnerNow = () => (bedNow ? bedOwner : '');
/** 바탕 소리를 깐다 ('' = 그친다). vol = 0~1. owner = 깐 쪽 ('read' 읽어 주기 · 'call' 통화) */
export async function setBed(id: string, vol: number, fade = 1.4, owner = 'read'): Promise<void> {
  if (!id && owner === 'read' && bedOwner && bedOwner !== 'read' && bedNow) return;   // 다른 쪽이 깐 소리는 읽어 주기가 거두지 않는다
  bedWant = id; bedOwner = owner;
  if ((bedNow?.id || '') === id) { if (bedNow) { const c = bedNow.g.context; bedNow.g.gain.setTargetAtTime(vol, c.currentTime, 0.3); } return; }
  const m = mixer(); if (!m) return;
  const old = bedNow; bedNow = null;
  if (old) { holdAwake(-1); const t = m.ctx.currentTime; old.g.gain.cancelScheduledValues(t); old.g.gain.setTargetAtTime(0, t, fade / 4); setTimeout(() => { try { old.src.stop(); } catch { } old.g.disconnect(); maybeNap(); }, fade * 1000 + 200); }
  if (!id || !(BED_IDS as readonly string[]).includes(id) || vol <= 0) return;
  const got = await load(id, true); if (!got || bedWant !== id || !(await wake())) return;
  const s = m.ctx.createBufferSource(), g = m.ctx.createGain();
  s.buffer = got.buf; s.loop = true; s.loopStart = got.span[0]; s.loopEnd = got.span[1];
  g.gain.setValueAtTime(0.0001, m.ctx.currentTime); g.gain.setTargetAtTime(vol, m.ctx.currentTime, fade / 4);
  s.connect(g); g.connect(m.bed);
  s.start(0, got.span[0] + Math.random() * Math.max(0, got.span[1] - got.span[0] - 1));   // 늘 같은 자리에서 시작하지 않게
  bedNow = { id, src: s, g }; holdAwake(1);
}
/** 바탕 소리 크기만 바꾼다 */
export function bedVolume(vol: number) { if (bedNow) bedNow.g.gain.setTargetAtTime(vol, bedNow.g.context.currentTime, 0.2); }
export { duckBeds };
