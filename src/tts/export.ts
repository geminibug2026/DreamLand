// ── 소리 파일로 저장: 메시지 하나를 목소리 연기 그대로(사람마다 목소리 · 쉼 · 효과음 · 바탕 소리) 한 파일(WAV)로 섞는다 ──
// 화면 밖에서(OfflineAudioContext) 섞으므로 듣는 동안처럼 기다리지 않는다. 보관해 둔 목소리는 다시 만들지 않는다.
// 브라우저 음성은 소리를 담을 수 없어 그 조각은 빼고, 몇 조각을 뺐는지 알려 준다.
import type { Take } from './api';
import { cfg } from './config';
import { clipOf, fxChain, gainOf, segsOf } from './engine';
import { decode, mixer } from './mix';
import { bedBuffer, soundBuffer } from './sfx';

const SR = 24000;
export interface Mixdown { blob: Blob; seconds: number; skipped: number; total: number }

/** 대본을 한 파일로. onStep(만든 조각, 전체) */
export async function mixdown(takes: Take[], o: { charId?: string | null; signal?: AbortSignal; onStep?: (done: number, total: number) => void } = {}): Promise<Mixdown> {
  if (!mixer()) throw new Error('no audio');
  const c = cfg(), segs = segsOf(takes, { charId: o.charId }), voiced = segs.filter(s => s.text);
  // 1) 목소리를 차례로 만든다 (보관한 것은 그대로) → 풀어 둔다
  const bufs = new Map<number, AudioBuffer>(); let skipped = 0, done = 0;
  for (let i = 0; i < segs.length; i++) {
    const sg = segs[i]; if (!sg.text) continue;
    if (o.signal?.aborted) throw new DOMException('aborted', 'AbortError');
    const p = clipOf(sg, o.signal);
    if (!p) { skipped++; continue; }
    const clip = await p; const b = await decode(await clip.blob.arrayBuffer());
    bufs.set(i, b); o.onStep?.(++done, voiced.length);
  }
  // 2) 시간표: 효과음 → (말하는 사람이 바뀌면 쉼) → 목소리. 바탕 소리는 바뀐 자리부터 다음 바뀜까지
  type Cue = { at: number; buf: AudioBuffer; gain: number; fx?: 'phone' | 'inner' };
  const plan: Cue[] = [], beds: { id: string; from: number; to: number }[] = [];
  let tm = 0.35, lastVoice = '', bedNow: { id: string; from: number } | null = null;
  const vol = Math.min(1, Math.max(0, +c.volume || 1));
  for (let i = 0; i < segs.length; i++) {
    const sg = segs[i];
    if (sg.bed !== undefined && c.sfx !== false) { if (bedNow) beds.push({ ...bedNow, to: tm }); bedNow = sg.bed ? { id: sg.bed, from: tm } : null; }
    if (sg.sound && c.sfx !== false) { const sb = await soundBuffer(sg.sound); if (sb) { plan.push({ at: tm, buf: sb, gain: c.sfxVol ?? 0.8 }); tm += Math.min(sb.duration * 0.7, 1.4); } }
    const b = bufs.get(i); if (!b) continue;
    const who = sg.voice.key + (sg.voice.name || '');
    if (lastVoice && lastVoice !== who) tm += Math.max(0, +c.gap || 0) / 1000;
    lastVoice = who;
    plan.push({ at: tm, buf: b, gain: vol * gainOf(sg, b), fx: sg.fx }); tm += b.duration;
  }
  const end = tm + 0.9;
  if (bedNow) beds.push({ ...bedNow, to: end });
  // 3) 섞기
  const OAC = window.OfflineAudioContext || (window as unknown as { webkitOfflineAudioContext?: typeof OfflineAudioContext }).webkitOfflineAudioContext;
  const ctx = new OAC(1, Math.ceil(end * SR), SR);
  const lim = ctx.createDynamicsCompressor(); lim.threshold.value = -4; lim.knee.value = 6; lim.ratio.value = 12; lim.attack.value = 0.003; lim.release.value = 0.2; lim.connect(ctx.destination);
  for (const p of plan) {
    const s = ctx.createBufferSource(), g = ctx.createGain(); s.buffer = p.buf; g.gain.value = p.gain;
    s.connect(g); g.connect(fxChain(ctx, p.fx, lim)); s.start(p.at);
  }
  for (const bd of beds) {
    const got = await bedBuffer(bd.id); if (!got || bd.to - bd.from < 0.3) continue;
    const s = ctx.createBufferSource(), g = ctx.createGain(); s.buffer = got.buf; s.loop = true; s.loopStart = got.span[0]; s.loopEnd = got.span[1];
    const v = (c.bedVol ?? 0.45) * 0.55;   // 목소리 아래에 낮게 (듣는 동안 말할 때 줄이는 만큼)
    g.gain.setValueAtTime(0.0001, bd.from); g.gain.exponentialRampToValueAtTime(v, bd.from + 1); g.gain.setValueAtTime(v, Math.max(bd.from + 1, bd.to - 1.2)); g.gain.exponentialRampToValueAtTime(0.0001, bd.to);
    s.connect(g); g.connect(lim); s.start(bd.from, got.span[0]); s.stop(bd.to + 0.05);
  }
  const out = await ctx.startRendering();
  return { blob: wav(out), seconds: out.duration, skipped, total: voiced.length };
}

/** 16비트 모노 WAV */
export function wav(b: AudioBuffer): Blob {
  const d = b.getChannelData(0), n = d.length, buf = new ArrayBuffer(44 + n * 2), v = new DataView(buf);
  const str = (o: number, s: string) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
  str(0, 'RIFF'); v.setUint32(4, 36 + n * 2, true); str(8, 'WAVE'); str(12, 'fmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
  v.setUint32(24, b.sampleRate, true); v.setUint32(28, b.sampleRate * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true); str(36, 'data'); v.setUint32(40, n * 2, true);
  for (let i = 0; i < n; i++) { const x = Math.max(-1, Math.min(1, d[i])); v.setInt16(44 + i * 2, x < 0 ? x * 0x8000 : x * 0x7fff, true); }
  return new Blob([buf], { type: 'audio/wav' });
}
