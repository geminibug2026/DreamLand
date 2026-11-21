// ── 따라 읽기 셈: 지금 읽는 자리를 화면 글에서 찾는다 (화면 · DOM 과 무관한 순수 함수 — 단위 시험이 있다) ──
// 읽는 글(조각)은 화면 글을 다듬은 것이라(마크업 · 코드 · 주소를 뺌) 글자 위치가 다르다.
// 글자와 숫자만 남겨 맞대어 보고, 그 자리를 다시 화면 글의 위치로 돌린다.

const WORD = /[\p{L}\p{N}]/u;
/** 화면 글에서 글자 · 숫자만 뽑은 것과 그 각각의 원래 위치 */
export interface Norm { s: string; at: number[] }
export function norm(text: string): Norm {
  let s = ''; const at: number[] = [];
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    // 짝 이룬 글자(이모지 · 확장 한자)도 한 글자로 본다
    const cp = text.codePointAt(i)!, ch = cp > 0xffff ? String.fromCodePoint(cp) : c;
    if (WORD.test(ch)) { s += ch.toLowerCase(); at.push(i); }
    if (cp > 0xffff) i++;
  }
  return { s, at };
}
/** 읽는 조각의 글자 위치 i 앞에 글자 · 숫자가 몇 개인가 */
export function wordCharsBefore(seg: string, i: number): number { let n = 0; for (let k = 0; k < Math.min(i, seg.length); k++) if (WORD.test(seg[k])) n++; return n; }

export interface Span { start: number; end: number }
/**
 * 읽는 조각 seg 가 화면 글(n = norm(화면 글))의 어디인지. from(화면 글 위치) 뒤에서만 찾는다(앞 조각 다음).
 * 그대로 없으면 앞머리 몇 글자로 찾는다(숫자 읽기 · 기호 정리로 조금 달라졌을 때). 못 찾으면 null.
 */
export function locate(n: Norm, seg: string, from = 0): Span | null {
  const q = norm(seg).s; if (!q) return null;
  let k0 = 0; while (k0 < n.at.length && n.at[k0] < from) k0++;
  let hit = n.s.indexOf(q, k0), len = q.length;
  if (hit < 0) {
    for (const cut of [24, 12, 6]) {
      if (q.length <= cut) continue;
      const h = n.s.indexOf(q.slice(0, cut), k0);
      if (h >= 0) { hit = h; len = Math.min(q.length, n.s.length - h); break; }
    }
  }
  if (hit < 0 || !len) return null;
  return { start: n.at[hit], end: n.at[Math.min(n.at.length - 1, hit + len - 1)] + 1 };
}
/** 조각 안의 글자 위치 i 가 화면 글에서는 어디인가 (span = 그 조각의 자리) */
export function toDisplay(n: Norm, span: Span, seg: string, i: number): number {
  let k0 = 0; while (k0 < n.at.length && n.at[k0] < span.start) k0++;
  const k = k0 + wordCharsBefore(seg, i);
  if (k >= n.at.length) return span.end;
  return Math.min(span.end, Math.max(span.start, n.at[k]));
}
/** 위치 i 를 품은 낱말(띄어쓰기로 나눈 덩어리)의 자리 */
export function wordAt(text: string, i: number): Span {
  const p = Math.max(0, Math.min(text.length, i));
  let s = p, e = p;
  while (s > 0 && !/\s/.test(text[s - 1])) s--;
  while (e < text.length && !/\s/.test(text[e])) e++;
  if (s === e && e < text.length) { while (e < text.length && /\s/.test(text[e])) e++; s = e; while (e < text.length && !/\s/.test(text[e])) e++; }
  return { start: s, end: e };
}

// ── 시간으로 짐작하기: 소리 길이를 글자 무게대로 나눈다 (쉼표 · 마침표에서 쉬는 시간도 넣는다) ──
const HANGUL = /[ㄱ-ㆎ가-힣]/, CJK = /[぀-ヿ㐀-鿿]/;
/** 글자 하나를 읽는 데 드는 무게 (한글 한 음절 = 1) */
export function weight(c: string): number {
  if (HANGUL.test(c) || CJK.test(c)) return 1;
  if (/[.!?…。！？]/.test(c)) return 2.2;
  if (/[,，、;:—–~]/.test(c)) return 1.2;
  if (/\s/.test(c)) return 0.15;
  if (/\p{N}/u.test(c)) return 0.9;
  if (/\p{L}/u.test(c)) return 0.42;
  return 0.1;
}
/** 무게 누적표 (끝 = 전체 무게) */
export function weights(text: string): number[] { const out: number[] = []; let w = 0; for (const c of text) { const x = weight(c); for (let k = 0; k < c.length; k++) out.push(w); w += x; } out.push(w); return out; }
/** 읽은 비율(0~1) → 글자 위치. acc = weights(text) */
export function charAtFraction(acc: number[], f: number): number {
  const total = acc[acc.length - 1] || 0; if (!total) return 0;
  const want = Math.max(0, Math.min(1, f)) * total;
  let lo = 0, hi = acc.length - 1;
  while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (acc[mid] <= want) lo = mid; else hi = mid - 1; }
  return Math.min(lo, acc.length - 2);
}
/** 소리 길이를 모를 때(브라우저 음성이 경계 알림을 주지 않을 때) 읽는 데 걸릴 초. 보통 빠르기에서 한글 1초에 약 6음절 */
export const guessSeconds = (text: string, rate = 1) => (weights(text).pop() || 0) / 6 / Math.max(0.1, rate);

// ── 공급자가 준 글자별 시각 (ElevenLabs alignment 따위) ──
/** 글자 위치와 그 글자가 시작하는 초. 시각은 커지는 차례 */
export interface Marks { at: number[]; t: number[] }
/** 지금(초) 읽는 글자 위치 */
export function charAtTime(m: Marks, sec: number): number {
  if (!m.t.length) return 0;
  let lo = 0, hi = m.t.length - 1;
  if (sec < m.t[0]) return m.at[0];
  while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (m.t[mid] <= sec) lo = mid; else hi = mid - 1; }
  return m.at[lo];
}
/** ElevenLabs 의 alignment(characters · character_start_times_seconds)를 Marks 로. 글자 수가 맞지 않으면 null */
export function marksFromAlignment(text: string, a: { characters?: string[]; character_start_times_seconds?: number[] } | null | undefined): Marks | null {
  const ch = a?.characters, ts = a?.character_start_times_seconds;
  if (!ch?.length || !ts || ts.length !== ch.length) return null;
  const at: number[] = [], t: number[] = []; let pos = 0;
  for (let i = 0; i < ch.length; i++) {
    const found = text.indexOf(ch[i], pos);
    if (found < 0 || found - pos > 8) continue;   // 서버가 바꾼 글자는 건너뛴다
    at.push(found); t.push(Math.max(t[t.length - 1] ?? 0, +ts[i] || 0)); pos = found + ch[i].length;
  }
  return at.length ? { at, t } : null;
}

// ── 화면에 그릴 문장 나누기 (누르면 그 문장부터 읽기) ──
/** 마침표 · 물음표 · 줄바꿈 뒤에서 나눈 문장 자리들 (빈 칸만 있는 조각은 앞 문장에 붙인다) */
export function sentences(text: string): Span[] {
  const out: Span[] = []; let start = 0;
  const re = /[.!?…。！？]+["'”’」』)\]]*(?=\s|$)|\n+/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    let end = m.index + m[0].length;
    while (end < text.length && /[ \t]/.test(text[end])) end++;
    if (end > start) { if (/[\p{L}\p{N}]/u.test(text.slice(start, end)) || !out.length) out.push({ start, end }); else out[out.length - 1].end = end; }
    start = end;
    if (m[0].length === 0) re.lastIndex++;
  }
  if (start < text.length) { if (/[\p{L}\p{N}]/u.test(text.slice(start)) || !out.length) out.push({ start, end: text.length }); else out[out.length - 1].end = text.length; }
  return out;
}
