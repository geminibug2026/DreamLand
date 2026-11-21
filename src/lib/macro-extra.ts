// ── 매크로 보강 (순수 계산): 가중치 무작위 · 대소문자 블록 · 흐른 시간 말로 · 끼워 넣기(include)의 순환 막기 ──
// 화면 · 저장소를 모른다. 엔진과 src/gate 가 가져다 쓰고, node 로 따로 돌려 검증한다.

/** 선택지 끝의 "@숫자" 만 가중치로 읽는다. 하나도 없으면 null (예전처럼 고르게 뽑는다) */
export function weighted(opts: string[]): { items: string[]; w: number[] } | null {
  let any = false; const items: string[] = [], w: number[] = [];
  for (const o of opts) {
    const m = /^([\s\S]*?)@\s*(\d+(?:\.\d+)?|\.\d+)\s*$/.exec(o);
    if (m) { any = true; items.push(m[1].trim()); w.push(Number(m[2])); } else { items.push(o.trim()); w.push(1); }
  }
  return any ? { items, w } : null;
}
/** r(0 이상 1 미만)을 가중치 위에 떨어뜨려 하나를 고른다. 가중치 0 은 뽑히지 않고, 전부 0 이면 빈 글 */
export function wpick(items: string[], w: number[], r: number): string {
  const total = w.reduce((n, x) => n + (x > 0 ? x : 0), 0); if (!(total > 0)) return '';
  let at = Math.min(Math.max(r, 0), 0.999999999) * total;
  for (let i = 0; i < items.length; i++) { if (!(w[i] > 0)) continue; at -= w[i]; if (at < 0) return items[i]; }
  for (let i = items.length - 1; i >= 0; i--) if (w[i] > 0) return items[i];
  return '';
}

// {{uppercase}}…{{/uppercase}} · {{lowercase}}…{{/lowercase}}: 매크로가 표식만 남기고, 다 풀린 뒤에 한 번에 바꾼다
export const CASE_MARK = { U: '\u0003U\u0003', u: '\u0003/U\u0003', L: '\u0003L\u0003', l: '\u0003/L\u0003' };
/** 표식 사이의 글을 대문자 · 소문자로. 짝이 맞지 않는 표식은 그냥 지운다 */
export function caseFold(text: string): string {
  // eslint-disable-next-line no-control-regex
  let out = text.replace(/\u0003U\u0003([\s\S]*?)\u0003\/U\u0003/g, (_m, b: string) => b.toUpperCase()).replace(/\u0003L\u0003([\s\S]*?)\u0003\/L\u0003/g, (_m, b: string) => b.toLowerCase());
  // eslint-disable-next-line no-control-regex
  out = out.replace(/\u0003\/?[UL]\u0003/g, '');
  return out;
}

/** 흐른 시간을 사람 말로 (프롬프트에 들어가므로 영어). 1분 안쪽은 "just now" */
export function idleText(ms: number): string {
  if (!Number.isFinite(ms) || ms < 60000) return 'just now';
  const min = Math.floor(ms / 60000), n = (v: number, u: string) => `${v} ${u}${v === 1 ? '' : 's'}`;
  if (min < 60) return n(min, 'minute');
  const h = Math.floor(min / 60), m = min % 60;
  if (h < 24) return m && h < 6 ? `${n(h, 'hour')} ${n(m, 'minute')}` : n(h, 'hour');
  const d = Math.floor(h / 24), hh = h % 24;
  if (d < 14) return hh && d < 3 ? `${n(d, 'day')} ${n(hh, 'hour')}` : n(d, 'day');
  if (d < 60) return n(Math.floor(d / 7), 'week');
  if (d < 730) return n(Math.floor(d / 30), 'month');
  return n(Math.floor(d / 365), 'year');
}

// ── {{include::항목}} ──
export const INCLUDE_MAX = 5;
/**
 * 로어북 항목 본문을 끼워 넣는다. find(이름, 책) → { key: 항목을 가리키는 고유 값, text: 본문 } | null
 * expand(본문, 지금까지 거친 항목들) 이 본문 안의 매크로(다른 include 포함)를 푼다. 자기 자신으로 돌아오거나 너무 깊으면 빈 글
 */
export function includeText(name: string, book: string, stack: string[], find: (name: string, book: string) => { key: string; text: string } | null, expand: (text: string, stack: string[]) => string): string {
  const hit = find(name, book); if (!hit) return '';
  if (stack.includes(hit.key) || stack.length >= INCLUDE_MAX) return '';
  return expand(hit.text, [...stack, hit.key]);
}
