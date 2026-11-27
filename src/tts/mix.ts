// ── 소리 섞개: 읽어 주기 · 장면 소리 · 통화가 함께 쓰는 Web Audio 한 벌 ──
// 목소리 → (크기 고르기) → 목소리 줄 ─┐
// 효과음 ─────────────────→ 효과 줄 ─┼→ 끝 다듬기(살짝 누르기) → 스피커 · 녹음 갈래 · 크기 재기
// 바탕 소리 ──────────────→ 바탕 줄 ─┘   (말하는 동안 바탕 줄을 낮춘다)
// 처음 소리를 낼 때 만든다. 아무 소리도 없으면 시계(타이머)를 돌리지 않는다.

export interface Mixer { ctx: AudioContext; voice: GainNode; fx: GainNode; bed: GainNode; out: GainNode; tap: MediaStreamAudioDestinationNode; meter: AnalyserNode }
let M: Mixer | null = null;
const AC = () => (typeof window === 'undefined' ? undefined : window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext);

/** 섞개 (만들 수 없는 브라우저면 null) */
export function mixer(): Mixer | null {
  if (M) return M;
  const C = AC(); if (!C) return null;
  const ctx = new C();
  const voice = ctx.createGain(), fx = ctx.createGain(), bed = ctx.createGain(), out = ctx.createGain();
  // 끝 다듬기: 큰 소리만 살짝 눌러 찢어지지 않게 (목소리 크기를 올려도 안전하게)
  const lim = ctx.createDynamicsCompressor(); lim.threshold.value = -4; lim.knee.value = 6; lim.ratio.value = 12; lim.attack.value = 0.003; lim.release.value = 0.2;
  const meter = ctx.createAnalyser(); meter.fftSize = 512; meter.smoothingTimeConstant = 0.6;
  const tap = ctx.createMediaStreamDestination();
  voice.connect(out); fx.connect(out); bed.connect(out); out.connect(lim); lim.connect(ctx.destination); lim.connect(tap);
  voice.connect(meter);   // 말하는 모양은 목소리만 잰다
  M = { ctx, voice, fx, bed, out, tap, meter };
  return M;
}
// 아무 소리도 없으면 잠시 뒤 섞개를 재운다 (휴대폰 전지 · 오디오 스레드를 아낀다). 소리를 낼 때 wake() 가 깨운다
let napTimer = 0, keepAwake = 0;
/** 바탕 소리처럼 오래 이어지는 소리가 있는 동안 (+1 · -1) */
export function holdAwake(d: number) { keepAwake = Math.max(0, keepAwake + d); if (keepAwake) clearTimeout(napTimer); }
/** 읽기 · 효과음이 끝났다: 한동안 아무것도 없으면 재운다 */
export function maybeNap(ms = 4000) {
  clearTimeout(napTimer);
  napTimer = window.setTimeout(() => { const m = M; if (m && !keepAwake && m.ctx.state === 'running') void m.ctx.suspend().catch(() => { }); }, ms);
}
/** 소리를 낼 수 있게 깨운다 (브라우저는 누름 없이 시작한 소리를 막는다). 깨었으면 true */
export async function wake(): Promise<boolean> {
  const m = mixer(); if (!m) return false;
  clearTimeout(napTimer);
  if (m.ctx.state !== 'running') await Promise.race([m.ctx.resume().catch(() => { }), new Promise(r => setTimeout(r, 300))]);
  return m.ctx.state === 'running';
}
let buf: Float32Array<ArrayBuffer> | null = null;
/** 지금 목소리 크기 0~1 (말하는 모양 그리기용) */
export function voiceLevel(): number {
  const m = M; if (!m || m.ctx.state !== 'running') return 0;
  const n = m.meter.fftSize; if (!buf || buf.length !== n) buf = new Float32Array(n);
  m.meter.getFloatTimeDomainData(buf);
  let s = 0; for (let i = 0; i < n; i++) s += buf[i] * buf[i];
  return Math.min(1, Math.sqrt(s / n) * 4.2);
}
/** 바탕 줄 낮추기 (말하는 동안). rule.ok 가 false 면 낮추지 않는다 (통화 설정의 "말하는 동안 줄이기") */
let ducked = false;
export const duckRule = { ok: () => true };
export function duckBeds(on: boolean) {
  const m = M; if (on && !duckRule.ok()) on = false;
  if (!m || on === ducked) return; ducked = on;
  m.bed.gain.cancelScheduledValues(m.ctx.currentTime); m.bed.gain.setTargetAtTime(on ? 0.42 : 1, m.ctx.currentTime, on ? 0.12 : 0.45);
}

/** 디코드한 소리 파일 (blob · 주소) — 같은 것을 두 번 풀지 않는다 */
export function decode(data: ArrayBuffer): Promise<AudioBuffer> {
  const m = mixer(); if (!m) return Promise.reject(new Error('no audio'));
  return new Promise((res, rej) => { const p = m.ctx.decodeAudioData(data, res, rej) as Promise<AudioBuffer> | undefined; p?.catch?.(rej); });
}
/** 파일 앞뒤의 빈 소리(인코더가 붙인 침묵)를 잘라 되풀이 자리를 정한다 */
export function audibleSpan(b: AudioBuffer): [number, number] {
  const d = b.getChannelData(0), thr = 0.0004; let a = 0, z = d.length - 1;
  while (a < d.length && Math.abs(d[a]) < thr) a++;
  while (z > a && Math.abs(d[z]) < thr) z--;
  return [a / b.sampleRate, (z + 1) / b.sampleRate];
}
