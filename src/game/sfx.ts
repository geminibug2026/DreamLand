// 소리: 효과음(파일 + 그 자리에서 만드는 짧은 음)과 배경 음악. 모두 자유 라이선스(CC0) — 출처는 game/CREDITS.md
let ctx: AudioContext | null = null;
const ac = () => { try { ctx ||= new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)(); if (ctx.state === 'suspended') void ctx.resume(); return ctx; } catch { return null; } };
function tone(freq: number, at: number, dur: number, type: OscillatorType = 'triangle', vol = .05, to = freq) {
  const a = ac(); if (!a) return; const o = a.createOscillator(), g = a.createGain(), t0 = a.currentTime + at;
  o.type = type; o.frequency.setValueAtTime(freq, t0); if (to !== freq) o.frequency.exponentialRampToValueAtTime(to, t0 + dur);
  g.gain.setValueAtTime(0, t0); g.gain.linearRampToValueAtTime(vol, t0 + .008); g.gain.exponentialRampToValueAtTime(.0001, t0 + dur);
  o.connect(g).connect(a.destination); o.start(t0); o.stop(t0 + dur + .02);
}
export type Sfx = 'dice' | 'hit' | 'miss' | 'hurt' | 'win' | 'lose' | 'tick' | 'place' | 'coin' | 'potion' | 'page' | 'door' | 'cast' | 'guard' | 'select' | 'confirm' | 'notify';
/** 파일로 내는 소리 (여럿이면 그때그때 하나를 고른다) */
const FILES: Partial<Record<Sfx, string[]>> = { hit: ['swing', 'slice'], miss: ['swing2'], hurt: ['ring'], place: ['step', 'step2'], coin: ['coin'], potion: ['potion'], page: ['page'], door: ['door'], cast: ['cast'], guard: ['guard'], select: ['select'], confirm: ['confirm'], notify: ['notify'], tick: ['click'] };
const pool = new Map<string, HTMLAudioElement>();
function file(name: string, vol: number) {
  try { let a = pool.get(name); if (!a) { a = new Audio(`game/sfx/${name}.mp3`); a.preload = 'auto'; pool.set(name, a); }
    const one = a.paused ? a : a.cloneNode() as HTMLAudioElement; one.volume = vol; one.currentTime = 0; void one.play().catch(() => { }); } catch { /* 소리를 낼 수 없는 곳 */ }
}
let enabled = true;
export const setSfx = (on: boolean) => { enabled = on; };
export function sfx(kind: Sfx) {
  if (!enabled) return;
  const f = FILES[kind]; if (f) return file(f[Math.floor(Math.random() * f.length)], kind === 'tick' || kind === 'place' ? .35 : .5);
  if (kind === 'dice') for (let i = 0; i < 6; i++) tone(500 + Math.random() * 700, i * .055, .04, 'square', .025);
  else if (kind === 'win') [523, 659, 784, 1047].forEach((f2, i) => tone(f2, i * .09, .18));
  else if (kind === 'lose') [392, 330, 262].forEach((f2, i) => tone(f2, i * .14, .26, 'sine'));
}

// ── 배경 음악: 장면이 바뀌면 부드럽게 넘어간다 ──
export type Track = 'explore' | 'town' | 'battle' | 'dark' | 'rest';
const VOL = .32;
let now: { key: string; el: HTMLAudioElement } | null = null, musicOn = true;
function fade(el: HTMLAudioElement, to: number, ms: number, then?: () => void) {
  const from = el.volume, t0 = performance.now();
  const step = () => { const k = Math.min(1, (performance.now() - t0) / ms); el.volume = Math.max(0, Math.min(1, from + (to - from) * k)); if (k < 1) requestAnimationFrame(step); else then?.(); };
  requestAnimationFrame(step);
}
export const Music = {
  on: () => musicOn,
  playing: () => now?.key || null,
  set(on: boolean) { musicOn = on; if (!on) this.stop(); },
  /** src 를 주면 그 주소를 튼다 (사용자가 올린 음악) */
  play(track: Track, src = `game/music/${track}.mp3`) {
    const key = src; if (!musicOn || now?.key === key) return;
    const old = now; if (old) fade(old.el, 0, 1200, () => old.el.pause());
    try { const el = new Audio(src); el.loop = true; el.volume = 0; now = { key, el }; void el.play().then(() => fade(el, VOL, 1600)).catch(() => { if (now?.el === el) now = null; }); } catch { now = null; }
  },
  stop() { const old = now; now = null; if (old) fade(old.el, 0, 600, () => old.el.pause()); },
};
