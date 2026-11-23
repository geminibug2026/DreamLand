// 장기기억 — 골라서 지우기: 서고의 선반을 종류별로 비운다 (순수 함수. 저장 · 복구 지점은 부르는 쪽이)
import type { Mem } from './types';

export const WIPE_KINDS = ['memories', 'cast', 'bonds', 'pledges', 'canon', 'status', 'items', 'summaries', 'dossier'] as const;
export type WipeKind = typeof WIPE_KINDS[number];

/** 종류마다 지금 몇 개가 있는가 (요약 = 묶음 + 연대기) */
export function wipeCounts(mem: Mem): Record<WipeKind, number> {
  return { memories: mem.memories.length, cast: mem.cast.length, bonds: (mem.bonds || []).length, pledges: mem.pledges.length, canon: mem.canon.length, status: mem.status.length, items: mem.items.length, summaries: mem.chunks.length + mem.arcs.length, dossier: mem.dossier.length };
}
/**
 * 고른 종류만 비운다. 턴 기록(어느 답변까지 적었는지)은 남긴다 — 지운 것이 저절로 다시 적히지는 않는다.
 * 요약을 지우면 요약 자리표(chunked · arcAt · arcCursor)도 처음으로 돌려 다음 요약 때 처음부터 다시 묶이게 한다.
 * 반환: 지운 줄 수
 */
export function wipeShelves(mem: Mem, kinds: Iterable<WipeKind>): number {
  const pick = new Set(kinds), before = wipeCounts(mem); let n = 0;
  for (const k of pick) n += before[k] || 0;
  if (pick.has('memories')) { mem.memories = []; mem.consolidatedAt = 0; }
  if (pick.has('cast')) mem.cast = [];
  if (pick.has('bonds')) mem.bonds = [];
  if (pick.has('pledges')) mem.pledges = [];
  if (pick.has('canon')) mem.canon = [];
  if (pick.has('status')) mem.status = [];
  if (pick.has('items')) mem.items = [];
  if (pick.has('summaries')) { mem.chunks = []; mem.arcs = []; mem.chunked = 0; mem.arcAt = 0; delete mem.arcCursor; }
  if (pick.has('dossier')) mem.dossier = [];
  if (pick.has('cast') && mem.nameApart) delete mem.nameApart;   // 인물이 없으면 "다른 사람" 목록도 뜻이 없다
  return n;
}
