// 낱말 단위 비교: 변경 카드에서 긴 글의 바뀐 곳만 짚어 보이려고 쓴다. 작게 직접 만든다 (LCS 표, 너무 길면 앞뒤 같은 곳만 걷어 내고 통째로)
export interface Seg { t: '=' | '+' | '-'; s: string }

/** 낱말과 그 사이 공백 · 문장부호를 따로 떼어 낸다. 한글 · 한자는 띄어쓰기가 드물어 글자 단위로 자른다 */
export function words(s: string): string[] {
  return s.match(/[A-Za-z0-9_'’]+|[가-힣]+|\s+|[\s\S]/gu) || [];
}
const push = (out: Seg[], t: Seg['t'], s: string) => { if (!s) return; const l = out[out.length - 1]; if (l && l.t === t) l.s += s; else out.push({ t, s }); };

/** a → b 로 가는 조각들. 표가 limit 칸을 넘으면 가운데는 통째로 지움 · 더함으로 둔다 */
export function diffWords(a: string, b: string, limit = 1_500_000): Seg[] {
  if (a === b) return a ? [{ t: '=', s: a }] : [];
  const A = words(a), B = words(b); let lo = 0, ea = A.length, eb = B.length;
  while (lo < ea && lo < eb && A[lo] === B[lo]) lo++;
  while (ea > lo && eb > lo && A[ea - 1] === B[eb - 1]) { ea--; eb--; }
  const out: Seg[] = []; push(out, '=', A.slice(0, lo).join(''));
  const n = ea - lo, m = eb - lo;
  if (!n || !m || n * m > limit) { push(out, '-', A.slice(lo, ea).join('')); push(out, '+', B.slice(lo, eb).join('')); }
  else {
    // 뒤에서부터 채운 LCS 길이 표
    const W = m + 1, T = new Uint32Array((n + 1) * W);
    for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) T[i * W + j] = A[lo + i] === B[lo + j] ? T[(i + 1) * W + j + 1] + 1 : Math.max(T[(i + 1) * W + j], T[i * W + j + 1]);
    let i = 0, j = 0;
    while (i < n && j < m) {
      if (A[lo + i] === B[lo + j]) { push(out, '=', A[lo + i]); i++; j++; }
      else if (T[(i + 1) * W + j] >= T[i * W + j + 1]) push(out, '-', A[lo + i++]);
      else push(out, '+', B[lo + j++]);
    }
    push(out, '-', A.slice(lo + i, ea).join('')); push(out, '+', B.slice(lo + j, eb).join(''));
  }
  push(out, '=', A.slice(ea).join(''));
  return tidy(out);
}
/** 바뀐 조각 사이에 낀 공백 한 칸짜리 '같음'은 읽기 어지러우니 양쪽에 붙인다 */
function tidy(segs: Seg[]): Seg[] {
  const out: Seg[] = [];
  for (let i = 0; i < segs.length; i++) {
    const s = segs[i], p = out[out.length - 1], nx = segs[i + 1];
    if (s.t === '=' && /^\s+$/.test(s.s) && s.s.length <= 2 && p && p.t !== '=' && nx && nx.t !== '=') { push(out, '-', s.s); push(out, '+', s.s); continue; }
    push(out, s.t, s.s);
  }
  // 한 자리에서 지움이 더함보다 먼저 오게 모은다
  const res: Seg[] = []; let del = '', add = '';
  const flush = () => { push(res, '-', del); push(res, '+', add); del = add = ''; };
  for (const s of out) { if (s.t === '-') del += s.s; else if (s.t === '+') add += s.s; else { flush(); push(res, '=', s.s); } }
  flush(); return res;
}
/** 바뀐 곳 둘레만 남기고 긴 같은 구간은 줄인다 (keep 글자씩) */
export function fold(segs: Seg[], keep = 60): Seg[] {
  return segs.map((s, i) => {
    if (s.t !== '=' || s.s.length <= keep * 2 + 12) return s;
    const head = i === 0 ? '' : s.s.slice(0, keep), tail = i === segs.length - 1 ? '' : s.s.slice(-keep);
    return { t: '=', s: `${head} ⋯ ${tail}` } as Seg;
  });
}
/** 더한 글자 · 지운 글자 수 */
export const tally = (segs: Seg[]) => segs.reduce((o, s) => { if (s.t === '+') o.add += s.s.length; else if (s.t === '-') o.del += s.s.length; return o; }, { add: 0, del: 0 });

// ── 줄 단위 비교 (코드용): 스크립트 · 정규식 · JSON · HTML 은 줄마다 − / + 로 보인다 ──
export interface Row { t: '=' | '+' | '-' | '…'; s: string; a?: number; b?: number }
export function diffLines(a: string, b: string, limit = 4_000_000): Row[] {
  const A = a.split('\n'), B = b.split('\n'); let lo = 0, ea = A.length, eb = B.length;
  while (lo < ea && lo < eb && A[lo] === B[lo]) lo++;
  while (ea > lo && eb > lo && A[ea - 1] === B[eb - 1]) { ea--; eb--; }
  const out: Row[] = []; for (let i = 0; i < lo; i++) out.push({ t: '=', s: A[i], a: i + 1, b: i + 1 });
  const n = ea - lo, m = eb - lo;
  if (!n || !m || n * m > limit) { for (let i = lo; i < ea; i++) out.push({ t: '-', s: A[i], a: i + 1 }); for (let j = lo; j < eb; j++) out.push({ t: '+', s: B[j], b: j + 1 }); }
  else {
    const W = m + 1, T = new Uint32Array((n + 1) * W);
    for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) T[i * W + j] = A[lo + i] === B[lo + j] ? T[(i + 1) * W + j + 1] + 1 : Math.max(T[(i + 1) * W + j], T[i * W + j + 1]);
    let i = 0, j = 0; const dels: Row[] = [], adds: Row[] = [], flush = () => { out.push(...dels, ...adds); dels.length = adds.length = 0; };
    while (i < n || j < m) {
      if (i < n && j < m && A[lo + i] === B[lo + j]) { flush(); out.push({ t: '=', s: A[lo + i], a: lo + i + 1, b: lo + j + 1 }); i++; j++; }
      else if (j >= m || (i < n && T[(i + 1) * W + j] >= T[i * W + j + 1])) { dels.push({ t: '-', s: A[lo + i], a: lo + i + 1 }); i++; }
      else { adds.push({ t: '+', s: B[lo + j], b: lo + j + 1 }); j++; }
    }
    flush();
  }
  for (let i = ea, j = eb; i < A.length; i++, j++) out.push({ t: '=', s: A[i], a: i + 1, b: j + 1 });
  return out;
}
/** 바뀐 줄 둘레 ctx 줄만 남기고 나머지는 '…' 한 줄로 줄인다 */
export function foldLines(rows: Row[], ctx = 2): Row[] {
  const keep = new Uint8Array(rows.length); rows.forEach((r, i) => { if (r.t !== '=') for (let k = Math.max(0, i - ctx); k <= Math.min(rows.length - 1, i + ctx); k++) keep[k] = 1; });
  const out: Row[] = []; let gap = 0;
  rows.forEach((r, i) => { if (keep[i]) { if (gap) { out.push({ t: '…', s: String(gap) }); gap = 0; } out.push(r); } else gap++; });
  if (gap) out.push({ t: '…', s: String(gap) });
  return out;
}
/** 코드로 보일 글인지: 스크립트 · 정규식 · CSS 칸이거나, 글이 JSON · HTML · STscript · MVU 명령처럼 생겼다 */
export function looksCode(kind: string | undefined, field: string, text: string): boolean {
  if (kind === 'regex' && /^(find|replace)\b/.test(field)) return true;
  if (kind === 'theme' && /^css\b/.test(field)) return true;
  if (kind === 'ext') return !/\.(md|txt)$/i.test(field);   // 확장의 파일: 글(README)이 아니면 코드
  const t = text.trim(); if (!t) return false;
  if (/^[[{][\s\S]*[\]}]$/.test(t) && /["']?[\w가-힣$]+["']?\s*:/.test(t)) return true;   // JSON · YAML 풍
  const lines = t.split('\n'), cmd = lines.filter(l => /^\s*(\/[a-z#:=-]|\{:|:\}|\|)/i.test(l)).length;
  if (cmd >= Math.max(1, lines.length * .4)) return true;   // STscript
  if (/<\/?(div|span|style|table|details|section|p|b|i|img|svg)\b[^>]*>/i.test(t) && (t.match(/<[a-z/][^>]*>/gi) || []).length >= 3) return true;   // HTML
  if (/_\.(set|add|insert|remove|assign)\(/.test(t) || /^\s*(function|const|let|import)\b/m.test(t)) return true;
  return false;
}
