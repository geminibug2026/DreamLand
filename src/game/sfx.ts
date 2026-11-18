// 효과음: 파일 없이 그 자리에서 만들어 낸다 (짧은 음 몇 개). 게임 설정에서 끌 수 있다
let ctx: AudioContext | null = null;
const ac = () => { try { ctx ||= new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)(); if (ctx.state === 'suspended') void ctx.resume(); return ctx; } catch { return null; } };
function tone(freq: number, at: number, dur: number, type: OscillatorType = 'triangle', vol = .05, to = freq) {
  const a = ac(); if (!a) return; const o = a.createOscillator(), g = a.createGain(), t0 = a.currentTime + at;
  o.type = type; o.frequency.setValueAtTime(freq, t0); if (to !== freq) o.frequency.exponentialRampToValueAtTime(to, t0 + dur);
  g.gain.setValueAtTime(0, t0); g.gain.linearRampToValueAtTime(vol, t0 + .008); g.gain.exponentialRampToValueAtTime(.0001, t0 + dur);
  o.connect(g).connect(a.destination); o.start(t0); o.stop(t0 + dur + .02);
}
export type Sfx = 'dice' | 'hit' | 'miss' | 'hurt' | 'win' | 'lose' | 'tick' | 'place';
let enabled = true;
export const setSfx = (on: boolean) => { enabled = on; };
export function sfx(kind: Sfx) {
  if (!enabled) return;
  if (kind === 'dice') for (let i = 0; i < 5; i++) tone(500 + Math.random() * 700, i * .055, .04, 'square', .025);
  else if (kind === 'hit') tone(220, 0, .12, 'sawtooth', .05, 90);
  else if (kind === 'miss') tone(520, 0, .1, 'sine', .03, 760);
  else if (kind === 'hurt') tone(140, 0, .2, 'square', .05, 60);
  else if (kind === 'win') [523, 659, 784, 1047].forEach((f, i) => tone(f, i * .09, .18));
  else if (kind === 'lose') [392, 330, 262].forEach((f, i) => tone(f, i * .14, .26, 'sine'));
  else if (kind === 'tick') tone(880, 0, .04, 'square', .02);
  else tone(660, 0, .07, 'triangle', .035);
}
