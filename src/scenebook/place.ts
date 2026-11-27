// ════════ 삽화를 둘 문단 찾기 ════════
// 1) 인용이 문단에 그대로 있으면 그 문단  2) 조금 달라도 가장 비슷한 문단  3) 그래도 못 찾으면(번역해서 보는 중 등) 원문에서의 문단 차례로 화면의 같은 차례
import { flat } from './util';

/** 비교 조각: 한글 · 한자 · 가나는 낱말 안의 두 글자씩, 로마자는 낱말 그대로 (조사 · 어미가 붙어도, 띄어쓰기가 달라도 맞는다) */
function grams(s: string): Set<string> {
  const out = new Set<string>();
  for (const w of String(s ?? '').normalize('NFC').toLowerCase().split(/[^\p{L}\p{N}]+/u)) {
    if (!w) continue;
    if (/^[\x00-\x7f]+$/.test(w)) { if (w.length > 1) out.add(w); continue; }
    if (w.length === 1) { out.add(w); continue; }
    for (let i = 0; i < w.length - 1; i++) out.add(w.slice(i, i + 2));
  }
  return out;
}
/** 인용의 조각이 문단에 얼마나 들어 있나 (0~1) */
function cover(q: Set<string>, p: Set<string>) { let n = 0; for (const g of q) if (p.has(g)) n++; return q.size ? n / q.size : 0; }

/** paras 가운데 quote 가 든 문단의 차례(0부터). 그대로 없으면 가장 비슷한 문단(충분히 비슷할 때만), 못 찾으면 -1 */
export function findQuote(quote: string | undefined, paras: string[], min = 0.6): number {
  const key = flat(quote).slice(0, 40); if (!key || !paras.length) return -1;
  const flats = paras.map(p => flat(p)), hit = flats.findIndex(p => p.includes(key)); if (hit >= 0) return hit;
  const q = grams(String(quote).slice(0, 300)); if (q.size < 3) return -1;
  let best = -1, score = 0, second = 0;
  paras.forEach((p, i) => { const s = cover(q, grams(p)); if (s > score) { second = score; score = s; best = i; } else if (s > second) second = s; });
  // 거의 같은 두 문단 사이에서 헷갈리면 고르지 않는다
  return score >= min && score - second >= 0.08 ? best : -1;
}

/** 원문 문단 차례를 화면 문단 수에 맞춘다 (수가 같으면 그대로) */
export const mapIndex = (i: number, from: number, to: number) => from === to ? i : Math.max(0, Math.min(to - 1, Math.round((i + 0.5) * to / from - 0.5)));

/**
 * 삽화 한 장을 둘 문단의 차례(0부터, shown 기준). 못 찾으면 -1 (답변 아래)
 * @param q anchor: 인용 · at: AI 가 고른 원문 문단 번호(1부터)
 * @param shown 화면에 보이는 문단 글
 * @param src 원문 문단 글 (번역 · 정규식으로 화면 글이 달라졌을 때 차례로 찾는다)
 */
export function placeAt(q: { anchor?: string; at?: number }, shown: string[], src?: string[] | null): number {
  if (!shown.length) return -1;
  const at = Number(q.at) >= 1 ? Math.round(Number(q.at)) : 0;
  if (q.anchor) { const i = findQuote(q.anchor, shown); if (i >= 0) return i; }
  if (src?.length) {
    let k = q.anchor ? findQuote(q.anchor, src) : -1;
    if (k < 0 && at && at <= src.length) k = at - 1;
    return k >= 0 ? mapIndex(k, src.length, shown.length) : -1;
  }
  return at && at <= shown.length ? at - 1 : -1;
}
