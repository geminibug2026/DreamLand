// 소리: 벨 · 연결음 · 종료음 · 키패드음 · 배경 소리. 신호음은 Web Audio 로 만들고, 벨은 녹음 파일(사용자가 넣은 파일)이 있으면 그것.
// 배경 소리는 읽어 주기의 장면 소리(src/tts/sfx — 녹음 파일, 없으면 만든 소리)를 함께 쓴다. 사용자가 넣은 카페 · 비 · 거리 소리가 있으면 그것을 먼저
import { DB } from '../lib/core';
import { BED_IDS, type BedId } from '../tts/marks';
import { bedOverride, forgetSound, setBed } from '../tts/sfx';
import { cfg as ttsCfg } from '../tts/config';
let ctx: AudioContext | null = null;
const ac = () => {
  if (!ctx) { const C = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext; if (!C) return null; ctx = new C(); }
  if (ctx.state === 'suspended') void ctx.resume().catch(() => { });
  return ctx;
};
// 신호음만 내는 작은 소리판: 울리는 소리가 없으면 잠시 뒤 재운다 (통화가 끝난 뒤에도 오디오 스레드가 돌지 않게)
let loops = 0, napAt = 0, napTimer = 0;
function napLater(endsIn: number) {
  napAt = Math.max(napAt, Date.now() + endsIn * 1000 + 2500); clearTimeout(napTimer);
  napTimer = window.setTimeout(() => { if (!loops && ctx && ctx.state === 'running' && Date.now() >= napAt) void ctx.suspend().catch(() => { }); }, Math.max(0, napAt - Date.now()));
}
function beep(freqs: number[], at: number, len: number, vol = 0.08) {
  const c = ac(); if (!c) return;
  napLater(at + len);
  const g = c.createGain(); g.gain.setValueAtTime(0, c.currentTime + at); g.gain.linearRampToValueAtTime(vol, c.currentTime + at + 0.02); g.gain.setValueAtTime(vol, c.currentTime + at + len - 0.03); g.gain.linearRampToValueAtTime(0, c.currentTime + at + len); g.connect(c.destination);
  for (const f of freqs) { const o = c.createOscillator(); o.type = 'sine'; o.frequency.value = f; o.connect(g); o.start(c.currentTime + at); o.stop(c.currentTime + at + len + 0.05); }
}
/** 되풀이되는 소리. 돌려받은 함수로 멈춘다 */
function loop(play: () => void, every: number): () => void { loops++; play(); const id = window.setInterval(play, every); let on = true; return () => { if (!on) return; on = false; loops--; clearInterval(id); napLater(0); }; }

// ── 사용자가 넣은 소리 파일 (assets 저장소, id = call-sound:<kind>) ──
export type SoundKind = 'ring' | 'cafe' | 'rain' | 'street';
export const SOUND_KINDS: SoundKind[] = ['ring', 'cafe', 'rain', 'street'];
const OWNER = 'call-sound';
export async function customSound(kind: SoundKind): Promise<{ name: string; data: string } | null> {
  try { const a = await DB.get('assets', `${OWNER}:${kind}`); return a ? { name: a.name, data: a.data } : null; } catch { return null; }
}
export async function setCustomSound(kind: SoundKind, file: File | null) {
  if (!file) { await DB.del('assets', `${OWNER}:${kind}`); bufs.delete(kind); if (kind !== 'ring') forgetSound(kind, true); return; }
  const data = await new Promise<string>((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result)); r.onerror = () => rej(r.error); r.readAsDataURL(file); });
  await DB.put('assets', { id: `${OWNER}:${kind}`, owner: OWNER, name: file.name, data });
  bufs.delete(kind); if (kind !== 'ring') forgetSound(kind, true);
}
// 장면 소리가 바탕 소리를 읽을 때 사용자 파일을 먼저 본다
bedOverride.get = async id => (SOUND_KINDS as string[]).includes(id) && id !== 'ring' ? (await customSound(id as SoundKind))?.data || null : null;
const bufs = new Map<SoundKind, Promise<AudioBuffer | null>>();
/** 사용자가 넣은 벨소리 파일. 없거나 못 풀면 null (그러면 만든 벨) */
function loadBuf(kind: SoundKind): Promise<AudioBuffer | null> {
  let p = bufs.get(kind);
  if (!p) {
    p = (async () => {
      const c = ac(); if (!c) return null;
      const own = await customSound(kind);
      const urls = [own?.data].filter(Boolean) as string[];   // 벨만 여기서 읽는다 (배경 소리는 장면 소리가 맡는다)
      for (const u of urls) { try { const r = await fetch(u); if (!r.ok) continue; return await c.decodeAudioData(await r.arrayBuffer()); } catch (e) { console.warn('[call sound]', kind, e); } }
      return null;
    })();
    bufs.set(kind, p);
  }
  return p;
}
/** 배경 소리 손잡이: 부르면 멈추고, duck(true) 면 소리를 줄인다 (캐릭터가 말하는 동안) */
export type AmbHandle = (() => void) & { duck(on: boolean): void };
const DUCK = 0.35;
/** 파일 소리를 되풀이해 튼다. 파일이 없으면 fallback 을 쓴다. 돌려받은 함수로 멈춘다 */
function playFile(kind: SoundKind, vol: number, fallback: () => AmbHandle | (() => void)): AmbHandle {
  let stop: (() => void) | null = null, dead = false, ducked = false, g: GainNode | null = null, inner: AmbHandle | null = null;
  loops++;   // 울리는 동안은 재우지 않는다
  void loadBuf(kind).then(buf => {
    if (dead) return;
    const c = ac();
    if (!buf || !c) { const f = fallback(); stop = f; if ('duck' in f) { inner = f; f.duck(ducked); } return; }
    const src = c.createBufferSource(); src.buffer = buf; src.loop = true;
    g = c.createGain(); g.gain.setValueAtTime(0, c.currentTime); g.gain.linearRampToValueAtTime(vol * (ducked ? DUCK : 1), c.currentTime + 0.6);
    src.connect(g); g.connect(c.destination);
    // 녹음 앞부분이 늘 같지 않게 아무 데서나 시작
    src.start(0, kind === 'ring' ? 0 : Math.random() * buf.duration);
    const gn = g; stop = () => { try { src.stop(); } catch { } gn.disconnect(); };
  });
  const h = (() => { if (dead) return; dead = true; stop?.(); loops--; napLater(0); }) as AmbHandle;
  h.duck = on => {
    if (on === ducked) return; ducked = on; inner?.duck(on);
    const c = ctx; if (g && c) { g.gain.cancelScheduledValues(c.currentTime); g.gain.setTargetAtTime(vol * (on ? DUCK : 1), c.currentTime, 0.25); }
  };
  return h;
}

const synthRing = () => loop(() => { [0, 0.25, 0.5, 0.75].forEach((t, i) => beep([i % 2 ? 1320 : 1046, i % 2 ? 1568 : 1318], t, 0.2, 0.06)); }, 2400);
/** 걸려 올 때 울리는 벨 (넣은 파일이 있으면 그것) */
export const ringtone = (): () => void => playFile('ring', 0.5, synthRing);
/** 내가 걸었을 때 들리는 연결음 */
export const ringback = () => loop(() => beep([440, 480], 0, 2, 0.05), 4000);
/** 통화 종료음 */
export const endTone = () => { beep([480, 620], 0, 0.18); beep([480, 620], 0.28, 0.18); beep([480, 620], 0.56, 0.18); };
/** 음성 메시지 녹음 시작 신호 (삐) */
export const vmBeep = () => beep([1000], 0, 0.42, 0.07);
/** 통화 연결음 (짧게 한 번) */
export const connectTone = () => beep([880], 0, 0.08, 0.05);
/** 보류음 */
export const holdTone = () => loop(() => { beep([523], 0, 0.3, 0.04); beep([659], 0.35, 0.3, 0.04); beep([784], 0.7, 0.5, 0.04); }, 3500);
const DTMF: Record<string, [number, number]> = { 1: [697, 1209], 2: [697, 1336], 3: [697, 1477], 4: [770, 1209], 5: [770, 1336], 6: [770, 1477], 7: [852, 1209], 8: [852, 1336], 9: [852, 1477], '*': [941, 1209], 0: [941, 1336], '#': [941, 1477] };
export const dtmf = (k: string) => { const f = DTMF[k]; if (f) beep(f, 0, 0.12, 0.06); };

/** 통화 배경 소리 (장면 소리의 바탕 소리와 같은 이름들) */
export type Ambient = BedId;
export const AMBIENTS = BED_IDS;
/** 배경 소리를 깐다. 돌려받은 함수로 거둔다. 캐릭터가 말하는 동안 줄이는 것은 읽어 주기가 맡는다 (src/tts/mix duckBeds) */
export function ambient(kind: Ambient): AmbHandle {
  const vol = Math.max(0.05, Math.min(1, +(ttsCfg().bedVol ?? 0.45)));
  void setBed(kind, vol, 1.2, 'call');
  return Object.assign(() => { void setBed('', 0, 0.9, 'call'); }, { duck() { } });
}
