// 지금 읽는 글 (읽어 주기). src/tts/api.ts 가 내어 주는 것만, 있는지 보고 쓴다:
// nowPlaying · onNowPlaying 이 있으면 그것으로, 없으면 reading · watch 로. 낱말마다가 아니라 문장 · 사람 · 멈춤이 바뀔 때만 다시 그리고, 보는 동안만 듣는다
import { useEffect, useRef, useState } from 'react';
import * as TtsMod from '../tts/api';
import { TTS } from '../tts/api';
import { S } from '../lib/core';

export interface Playing { key: string; charId: string; name: string; line: string; paused: boolean; canBack: boolean; canNext: boolean }
type Now = { key: string; charId?: string | null; name?: string; line?: string; paused?: boolean } | null;
const mod = TtsMod as unknown as Record<string, unknown>;
/** 입구에 그 이름의 함수가 있으면 그것 (없으면 null) */
const fn = <F>(k: string): F | null => typeof mod[k] === 'function' ? mod[k] as F : null;
const T2 = TTS as unknown as { level?: () => number }, hasLevel = typeof T2.level === 'function';

function snap(): Playing | null {
  const r = TTS.reading(), now = fn<() => Now>('nowPlaying');
  const n: Now = now ? now() : r ? { key: r.key, charId: r.charId, line: r.seg || r.src, paused: r.paused } : null;
  const line = (n?.line || '').replace(/\s+/g, ' ').trim();
  return n && line ? { key: n.key, charId: n.charId || '', name: n.name || '', line, paused: !!n.paused, canBack: !!r?.canBack, canNext: !!r?.canNext } : null;
}
const sig = (p: Playing | null) => p ? [p.key, p.charId, p.name, p.line, p.paused, p.canBack, p.canNext].join('|') : '';

/** 지금 읽는 것 (없으면 null). 이 고리를 쓰는 판이 떠 있는 동안만 듣는다 */
export function usePlaying(): Playing | null {
  const [p, setP] = useState(snap);
  useEffect(() => {
    let last = sig(snap()), raf = 0;
    const check = () => { if (raf) return; raf = requestAnimationFrame(() => { raf = 0; const s = snap(), k = sig(s); if (k !== last) { last = k; setP(s); } }); };
    const onNow = fn<(f: () => void) => () => void>('onNowPlaying'), off = onNow ? onNow(check) : TTS.watch(check);
    check();
    return () => { off(); cancelAnimationFrame(raf); };
  }, []);
  return p;
}

/** 소리 크기 막대: 입구에 level 이 있을 때만, 읽는 동안만 (멈춤 · 움직임 줄이기면 멈춘 채). 요소의 --lv 만 바꾼다 */
export function useLevel(on: boolean) {
  const el = useRef<HTMLElement | null>(null);
  useEffect(() => {
    const node = el.current; if (!hasLevel || !on || !node || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    let raf = 0, last = -1;
    const f = () => { const v = Math.max(0, Math.min(1, T2.level?.() || 0)); if (Math.abs(v - last) > .03) { last = v; node.style.setProperty('--lv', v.toFixed(2)); } raf = requestAnimationFrame(f); };
    raf = requestAnimationFrame(f);
    return () => { cancelAnimationFrame(raf); node.style.removeProperty('--lv'); };
  }, [on]);
  return { ref: el, has: hasLevel };
}

/** 읽어 주기 켬 · 끔 — 기능 › 읽어 주기의 그 설정(settings.tts.on) 그대로 */
const ttsCfg = () => S.settings as unknown as { tts?: { on?: boolean } };
export const tts = {
  on: () => !!ttsCfg().tts?.on,
  toggle() { const st = ttsCfg(); (st.tts ||= {}).on = !st.tts.on; S.set({}); },
  enabled: () => TTS.enabled(),
  pause: () => TTS.pause(), resume: () => TTS.resume(), step: (d: number) => TTS.step(d),
  speak: (text: string, charId?: string, key?: string) => TTS.speak(text, { charId, key }).catch(() => { }),
};
