// 소리: 벨 · 연결음 · 종료음 · 키패드음 · 배경 소리. 신호음은 Web Audio 로 만들고, 배경 소리 · 벨은 녹음 파일(sounds/ 또는 사용자가 넣은 파일)
import { DB } from '../lib/core';
let ctx: AudioContext | null = null;
const ac = () => {
  if (!ctx) { const C = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext; if (!C) return null; ctx = new C(); }
  if (ctx.state === 'suspended') void ctx.resume().catch(() => { });
  return ctx;
};
function beep(freqs: number[], at: number, len: number, vol = 0.08) {
  const c = ac(); if (!c) return;
  const g = c.createGain(); g.gain.setValueAtTime(0, c.currentTime + at); g.gain.linearRampToValueAtTime(vol, c.currentTime + at + 0.02); g.gain.setValueAtTime(vol, c.currentTime + at + len - 0.03); g.gain.linearRampToValueAtTime(0, c.currentTime + at + len); g.connect(c.destination);
  for (const f of freqs) { const o = c.createOscillator(); o.type = 'sine'; o.frequency.value = f; o.connect(g); o.start(c.currentTime + at); o.stop(c.currentTime + at + len + 0.05); }
}
/** 되풀이되는 소리. 돌려받은 함수로 멈춘다 */
function loop(play: () => void, every: number): () => void { play(); const id = window.setInterval(play, every); return () => clearInterval(id); }

// ── 사용자가 넣은 소리 파일 (assets 저장소, id = call-sound:<kind>) ──
export type SoundKind = 'ring' | 'cafe' | 'rain' | 'street';
export const SOUND_KINDS: SoundKind[] = ['ring', 'cafe', 'rain', 'street'];
const OWNER = 'call-sound';
export async function customSound(kind: SoundKind): Promise<{ name: string; data: string } | null> {
  try { const a = await DB.get('assets', `${OWNER}:${kind}`); return a ? { name: a.name, data: a.data } : null; } catch { return null; }
}
export async function setCustomSound(kind: SoundKind, file: File | null) {
  if (!file) { await DB.del('assets', `${OWNER}:${kind}`); bufs.delete(kind); return; }
  const data = await new Promise<string>((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result)); r.onerror = () => rej(r.error); r.readAsDataURL(file); });
  await DB.put('assets', { id: `${OWNER}:${kind}`, owner: OWNER, name: file.name, data });
  bufs.delete(kind);
}
const bufs = new Map<SoundKind, Promise<AudioBuffer | null>>();
/** 사용자 파일 → 기본 녹음(sounds/) 순으로 읽는다. 둘 다 없거나 못 풀면 null */
function loadBuf(kind: SoundKind): Promise<AudioBuffer | null> {
  let p = bufs.get(kind);
  if (!p) {
    p = (async () => {
      const c = ac(); if (!c) return null;
      const own = await customSound(kind);
      const urls = [own?.data, kind === 'ring' ? '' : `/sounds/${kind}.ogg`].filter(Boolean) as string[];
      for (const u of urls) { try { const r = await fetch(u); if (!r.ok) continue; return await c.decodeAudioData(await r.arrayBuffer()); } catch (e) { console.warn('[call sound]', kind, e); } }
      return null;
    })();
    bufs.set(kind, p);
  }
  return p;
}
/** 파일 소리를 되풀이해 튼다. 파일이 없으면 fallback 을 쓴다. 돌려받은 함수로 멈춘다 */
function playFile(kind: SoundKind, vol: number, fallback: () => () => void): () => void {
  let stop: (() => void) | null = null, dead = false;
  void loadBuf(kind).then(buf => {
    if (dead) return;
    const c = ac();
    if (!buf || !c) { stop = fallback(); return; }
    const src = c.createBufferSource(); src.buffer = buf; src.loop = true;
    const g = c.createGain(); g.gain.setValueAtTime(0, c.currentTime); g.gain.linearRampToValueAtTime(vol, c.currentTime + 0.6);
    src.connect(g); g.connect(c.destination);
    // 녹음 앞부분이 늘 같지 않게 아무 데서나 시작
    src.start(0, kind === 'ring' ? 0 : Math.random() * buf.duration);
    stop = () => { try { src.stop(); } catch { } g.disconnect(); };
  });
  return () => { dead = true; stop?.(); };
}

const synthRing = () => loop(() => { [0, 0.25, 0.5, 0.75].forEach((t, i) => beep([i % 2 ? 1320 : 1046, i % 2 ? 1568 : 1318], t, 0.2, 0.06)); }, 2400);
/** 걸려 올 때 울리는 벨 (넣은 파일이 있으면 그것) */
export const ringtone = () => playFile('ring', 0.5, synthRing);
/** 내가 걸었을 때 들리는 연결음 */
export const ringback = () => loop(() => beep([440, 480], 0, 2, 0.05), 4000);
/** 통화 종료음 */
export const endTone = () => { beep([480, 620], 0, 0.18); beep([480, 620], 0.28, 0.18); beep([480, 620], 0.56, 0.18); };
/** 통화 연결음 (짧게 한 번) */
export const connectTone = () => beep([880], 0, 0.08, 0.05);
/** 보류음 */
export const holdTone = () => loop(() => { beep([523], 0, 0.3, 0.04); beep([659], 0.35, 0.3, 0.04); beep([784], 0.7, 0.5, 0.04); }, 3500);
const DTMF: Record<string, [number, number]> = { 1: [697, 1209], 2: [697, 1336], 3: [697, 1477], 4: [770, 1209], 5: [770, 1336], 6: [770, 1477], 7: [852, 1209], 8: [852, 1336], 9: [852, 1477], '*': [941, 1209], 0: [941, 1336], '#': [941, 1477] };
export const dtmf = (k: string) => { const f = DTMF[k]; if (f) beep(f, 0, 0.12, 0.06); };

export type Ambient = 'cafe' | 'rain' | 'street';
/** 지금 하고 있는 일 · 장소 글에서 배경 소리를 고른다 (없으면 '') */
export function ambientFor(activity: string): Ambient | '' {
  const a = activity.toLowerCase();
  if (/cafe|café|coffee|카페|커피|찻집/.test(a)) return 'cafe';
  if (/rain|비 ?(오|내)|빗/.test(a)) return 'rain';
  if (/street|walk|commut|bus|subway|outside|거리|길|산책|출근|퇴근|이동|버스|지하철|밖/.test(a)) return 'street';
  return '';
}
/** 배경 소리를 깐다 (녹음 파일, 못 읽으면 만든 소리). 돌려받은 함수로 멈춘다 */
export const ambient = (kind: Ambient): (() => void) => playFile(kind, 0.35, () => synthAmbient(kind));
function synthAmbient(kind: Ambient): () => void {
  const c = ac(); if (!c) return () => { };
  const len = c.sampleRate * 2, buf = c.createBuffer(1, len, c.sampleRate), d = buf.getChannelData(0);
  let last = 0; for (let i = 0; i < len; i++) { const w = Math.random() * 2 - 1; last = kind === 'rain' ? w : (last + 0.02 * w) / 1.02; d[i] = kind === 'rain' ? w : last * 3.5; }
  const src = c.createBufferSource(); src.buffer = buf; src.loop = true;
  const f = c.createBiquadFilter(); f.type = kind === 'rain' ? 'highpass' : 'lowpass'; f.frequency.value = kind === 'rain' ? 1800 : kind === 'cafe' ? 900 : 500;
  const g = c.createGain(); g.gain.value = kind === 'rain' ? 0.02 : 0.05;
  src.connect(f); f.connect(g); g.connect(c.destination); src.start();
  // 카페: 가끔 잔 부딪히는 소리 · 거리: 가끔 멀리 지나가는 소리
  const tick = kind === 'rain' ? 0 : window.setInterval(() => { if (Math.random() < 0.35) beep(kind === 'cafe' ? [2400 + Math.random() * 800] : [120 + Math.random() * 60], 0, kind === 'cafe' ? 0.05 : 0.9, kind === 'cafe' ? 0.012 : 0.02); }, 1500);
  return () => { try { src.stop(); } catch { } g.disconnect(); clearInterval(tick); };
}
