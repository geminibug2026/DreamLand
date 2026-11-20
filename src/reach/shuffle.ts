// 섞어 쓰기: 표시해 둔 모델 풀에서 답장마다 하나를 뽑는다 (가중치 · 바로 앞과 다른 것 먼저)
// 뽑기만 담는다. 아무것도 import 하지 않는다.

export interface MixItem { /** 연결 id */ c: string; /** 모델 id */ m: string; /** 가중치 (비우면 1) */ w?: number }
export const mixKey = (x: { c: string; m: string }) => x.c + '|' + x.m;

/**
 * 풀에서 하나 뽑는다. last(바로 앞 답장에 쓴 것)와 다른 후보가 있으면 그 안에서만 뽑는다.
 * rnd 는 0 이상 1 미만 — 시험할 때 바꿔 끼운다.
 */
export function drawMix<T extends MixItem>(pool: T[], last = '', rnd: () => number = Math.random): T | null {
  const live = pool.filter(x => x && x.c && x.m && !(+(x.w ?? 1) <= 0));
  if (!live.length) return null;
  const others = live.filter(x => mixKey(x) !== last), from = others.length ? others : live;
  const total = from.reduce((n, x) => n + (+(x.w ?? 1) || 1), 0);
  let r = rnd() * total;
  for (const x of from) { r -= +(x.w ?? 1) || 1; if (r < 0) return x; }
  return from[from.length - 1];
}

/** 모델 찾기 순서: 0 별표 · 1 저장해 둔 것 · 2 앞글자가 맞는 것 · 3 가운데가 맞는 것. 맞지 않으면 -1 */
export function rankModel(id: string, q: string, starred: boolean, saved: boolean): number {
  const a = id.toLowerCase(), b = q.trim().toLowerCase();
  if (b && !a.includes(b)) { const bits = b.split(/[\s/:_-]+/).filter(Boolean); if (!bits.length || !bits.every(x => a.includes(x))) return -1; }
  return starred ? 0 : saved ? 1 : !b || a.startsWith(b) || a.split('/').pop()!.startsWith(b) ? 2 : 3;
}
/** 긴 모델 이름을 칩에 넣을 만큼 줄인다: 앞의 제공자 경로와 날짜 꼬리를 뗀다 */
export const shortModel = (id: string) => { const s = String(id || '').split('/').pop() || ''; return s.replace(/[-@]\d{8}$|-\d{4}-\d{2}-\d{2}$/, '').replace(/:(free|beta|extended)$/, ''); };
