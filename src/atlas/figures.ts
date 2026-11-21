// 성좌 도감의 형상 그림: 별자리마다 그 뜻을 담은 동판화풍 선 그림 (깃펜 · 매듭 · 두루마리 · 촛대 · 이정표 · 주사위 · 찻잔 · 서랍 · 표본 유리종)
// 좌표는 100칸 상자에 손으로 놓고, 빗금(해칭) · 깃털 결 · 점묘처럼 되풀이되는 것만 셈으로 채운다. 결과는 겹(layer)마다 path 한 줄 — 화면에 놓이는 요소 수를 줄이려고
// 화면도 저장소도 모르는 순수 함수만 둔다

/** 그림 한 장: 윤곽(o) · 세부(t) · 빗금(h) · 점묘(s, 둥근 끝의 아주 짧은 선) · 강조(a, 완성하면 금빛) · 간추린 윤곽(m, 작은 그림용) */
export interface Fig { o: string; t: string; h: string; s: string; a: string; m: string }
type P = [number, number];
const f = (n: number) => +n.toFixed(2);
const pts = (flat: number[]): P[] => { const out: P[] = []; for (let i = 0; i < flat.length; i += 2) out.push([flat[i], flat[i + 1]]); return out; };
/** 씨앗 있는 난수 */
export function rng(seed: number) { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) | 0; let x = Math.imul(a ^ (a >>> 15), 1 | a); x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x; return ((x ^ (x >>> 14)) >>> 0) / 4294967296; }; }

/** 꺾은선 */
export const poly = (p: P[], closed = false) => p.map((q, i) => `${i ? 'L' : 'M'}${f(q[0])} ${f(q[1])}`).join('') + (closed ? 'Z' : '');
/** 점들을 부드럽게 지나는 곡선 (캣멀-롬 → 3차 베지어) */
export function curve(p: P[], closed = false): string {
  const n = p.length; if (n < 3) return poly(p, closed);
  const at = (i: number) => closed ? p[(i + n) % n] : p[Math.max(0, Math.min(n - 1, i))];
  let d = `M${f(p[0][0])} ${f(p[0][1])}`;
  for (let i = 0; i < (closed ? n : n - 1); i++) {
    const a = at(i - 1), b = at(i), c = at(i + 1), e = at(i + 2);
    d += `C${f(b[0] + (c[0] - a[0]) / 6)} ${f(b[1] + (c[1] - a[1]) / 6)} ${f(c[0] - (e[0] - b[0]) / 6)} ${f(c[1] - (e[1] - b[1]) / 6)} ${f(c[0])} ${f(c[1])}`;
  }
  return d + (closed ? 'Z' : '');
}
/** 같은 곡선을 잘게 나눈 점들 (빗금을 곡선 안에 가둘 때 쓴다) */
export function sample(p: P[], closed = false, k = 6): P[] {
  const n = p.length, out: P[] = [], at = (i: number) => closed ? p[(i + n) % n] : p[Math.max(0, Math.min(n - 1, i))];
  for (let i = 0; i < (closed ? n : n - 1); i++) {
    const a = at(i - 1), b = at(i), c = at(i + 1), e = at(i + 2);
    for (let j = 0; j < k; j++) { const t = j / k, t2 = t * t, t3 = t2 * t; out.push([.5 * (2 * b[0] + (c[0] - a[0]) * t + (2 * a[0] - 5 * b[0] + 4 * c[0] - e[0]) * t2 + (3 * b[0] - a[0] - 3 * c[0] + e[0]) * t3), .5 * (2 * b[1] + (c[1] - a[1]) * t + (2 * a[1] - 5 * b[1] + 4 * c[1] - e[1]) * t2 + (3 * b[1] - a[1] - 3 * c[1] + e[1]) * t3)]); }
  }
  if (!closed) out.push(p[n - 1]); return out;
}
/** 타원(의 호)을 따라 놓은 점들. 각도는 도, 0 = 오른쪽, 시계 방향 */
export function arc(cx: number, cy: number, rx: number, ry: number, a0 = 0, a1 = 360, n = 28, rot = 0): P[] {
  const out: P[] = [], r = rot * Math.PI / 180, full = Math.abs(a1 - a0) >= 360, m = full ? n : n + 1;
  for (let i = 0; i < m; i++) { const t = (a0 + (a1 - a0) * i / n) * Math.PI / 180, x = Math.cos(t) * rx, y = Math.sin(t) * ry; out.push([cx + x * Math.cos(r) - y * Math.sin(r), cy + x * Math.sin(r) + y * Math.cos(r)]); }
  return out;
}
/** 빗금: 다각형 안을 한 방향의 평행선으로 채운다 (각도는 도, gap 은 선 사이). 오목한 꼴도 된다 */
export function hatch(shape: P[], ang: number, gap: number, phase = 0): string {
  const r = ang * Math.PI / 180, c = Math.cos(r), s = Math.sin(r), q = shape.map(([x, y]): P => [x * c + y * s, -x * s + y * c]);
  const ys = q.map(p => p[1]), y0 = Math.min(...ys), y1 = Math.max(...ys); let d = '';
  for (let y = y0 + gap * (.5 + phase); y < y1; y += gap) {
    const xs: number[] = [];
    for (let i = 0; i < q.length; i++) { const a = q[i], b = q[(i + 1) % q.length]; if ((a[1] <= y) !== (b[1] <= y)) xs.push(a[0] + (y - a[1]) / (b[1] - a[1]) * (b[0] - a[0])); }
    xs.sort((a, b) => a - b);
    for (let i = 0; i + 1 < xs.length; i += 2) { if (xs[i + 1] - xs[i] < .4) continue; d += `M${f(xs[i] * c - y * s)} ${f(xs[i] * s + y * c)}L${f(xs[i + 1] * c - y * s)} ${f(xs[i + 1] * s + y * c)}`; }
  }
  return d;
}
const inside = (shape: P[], x: number, y: number) => { let in_ = false; for (let i = 0, j = shape.length - 1; i < shape.length; j = i++) { const a = shape[i], b = shape[j]; if ((a[1] > y) !== (b[1] > y) && x < (b[0] - a[0]) * (y - a[1]) / (b[1] - a[1]) + a[0]) in_ = !in_; } return in_; };
/** 점묘: 다각형 안에 n 개쯤의 점 */
export function stipple(shape: P[], n: number, seed: number): string {
  const r = rng(seed), xs = shape.map(p => p[0]), ys = shape.map(p => p[1]), x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys); let d = '';
  for (let i = 0, got = 0; i < n * 6 && got < n; i++) { const x = x0 + r() * (x1 - x0), y = y0 + r() * (y1 - y0); if (inside(shape, x, y)) { d += dot(x, y); got++; } }
  return d;
}
export const dot = (x: number, y: number) => `M${f(x)} ${f(y)}h.01`;
const rect = (x: number, y: number, w: number, h: number): P[] => [[x, y], [x + w, y], [x + w, y + h], [x, y + h]];

/** 그림을 겹겹이 쌓는 판 */
class Plate {
  L: Record<keyof Fig, string[]> = { o: [], t: [], h: [], s: [], a: [], m: [] };
  add(k: keyof Fig, ...d: string[]) { this.L[k].push(...d); return this; }
  /** 윤곽이면서 작은 그림에도 남길 선 */
  main(...d: string[]) { this.L.o.push(...d); this.L.m.push(...d); return this; }
  done(): Fig { const j = (k: keyof Fig) => this.L[k].join(''); return { o: j('o'), t: j('t'), h: j('h'), s: j('s'), a: j('a'), m: j('m') }; }
}

// ── 첫 문장: 깃펜과 잉크병, 막 그은 첫 획 ──
function first(): Fig {
  const g = new Plate(), A: P = [40, 56], B: P = [86, 8], ux = B[0] - A[0], uy = B[1] - A[1], len = Math.hypot(ux, uy), nx = -uy / len, ny = ux / len;   // (nx, ny) 는 깃대의 오른쪽 아래
  const on = (t: number, w = 0): P => [A[0] + ux * t + nx * w, A[1] + uy * t + ny * w], wide = (t: number) => 9.5 * Math.sin(Math.PI * Math.min(1, t * 1.08)) ** .7 * (1 - t * .25);
  // 깃의 윤곽: 깃대 양쪽으로 부푼 잎 모양, 중간에 갈라진 틈 하나
  const up = [.02, .14, .3, .5, .7, .88].map(t => on(t, -wide(t))), dn = [.9, .72, .52, .44, .4, .3, .14, .03].map((t, i) => on(t, wide(t) * (i === 3 ? .45 : 1)));
  const vane: P[] = [A, ...up, B, ...dn];
  g.main(curve(vane, true));
  g.add('o', poly([on(-.02), B]));
  // 깃털 결: 깃대에서 끝 쪽으로 비스듬히 뻗는 가는 선
  for (let t = .05; t < .93; t += .042) for (const side of [-1, 1]) { const w = wide(t + .05) * (side > 0 && t > .38 && t < .46 ? .4 : .9); g.add('h', poly([on(t), on(t + .075, side * w)])); }
  // 깃촉: 속이 빈 대롱이 가늘어지다 비스듬히 깎인다
  g.main(poly([[41.2, 57.2], [26.4, 76.8], [20, 84], [24.2, 75], [38.9, 54.9]]));
  g.add('t', poly([[23.6, 79.4], [20, 84]]), poly([[30, 69.5], [31.6, 71]]), poly([[33.4, 65.2], [35, 66.7]]));
  g.add('h', hatch([[38.9, 54.9], [41.2, 57.2], [28, 74.8], [25.6, 73.2]], 40, 1.5));
  // 잉크병: 각진 어깨의 낮은 병, 종이 딱지, 병 주둥이
  const body: P[] = [[66.5, 70], [66.5, 73.5], [60, 79], [60, 92], [88, 92], [88, 79], [81.5, 73.5], [81.5, 70]];
  g.main(poly(body), curve(arc(74, 70, 7.5, 2, 0, 360, 20), true));
  g.add('o', curve(arc(74, 92, 14, 2.4, 0, 180, 14)), curve(arc(74, 68.4, 8.6, 2.3, 0, 360, 20), true));
  g.add('t', curve(arc(74, 79, 14, 2.2, 0, 180, 14)), poly(rect(64.5, 82, 12, 7), true), poly([[66.5, 84.4], [74.5, 84.4]]), poly([[66.5, 86.6], [72, 86.6]]), curve(arc(74, 70, 5.4, 1.3, 0, 360, 16), true));
  g.add('h', hatch([[78.5, 79.6], [88, 79], [88, 92], [78.5, 93.8]], 62, 1.25), hatch([[60, 79], [63.4, 79.6], [63.4, 93], [60, 92]], 62, 1.6));
  g.add('s', stipple(arc(74, 70, 5, 1.1, 0, 360, 12), 9, 3));
  // 첫 획: 촉 끝에서 흘러나온 한 줄
  g.add('a', curve(pts([20, 84, 15, 88.5, 9, 88, 8, 91.5, 14, 93.5, 24, 90, 33, 92.5, 42, 90.5, 47, 92])));
  g.add('m', curve(pts([20, 84, 15, 88.5, 9, 88, 8, 91.5, 14, 93.5, 24, 90, 33, 92.5, 42, 90.5, 47, 92])));
  g.add('s', dot(50.5, 92.4), dot(53, 92), dot(13, 81), dot(10.5, 83.5));
  return g.done();
}

// ── 오래된 약속: 매듭 지은 리본 ──
function vow(): Fig {
  const g = new Plate(), mir = (p: P[]): P[] => p.map(([x, y]) => [100 - x, y]);
  const loop = pts([47, 44, 38, 31, 22, 25, 10.5, 33, 11, 46, 23, 53.5, 39, 52.5, 47, 49]), inner = pts([42.5, 44.5, 35, 37.5, 24, 33.5, 17.5, 37.5, 18, 44, 25, 47.5, 36, 48.5]);
  const tail = pts([45.5, 52, 39, 64, 31, 76, 23.5, 91, 31.5, 86.5, 38.5, 94.5, 43.5, 78, 48.5, 64, 51, 53]);
  for (const m of [false, true]) {
    const L = m ? mir(loop) : loop, I = m ? mir(inner) : inner, T = m ? mir(tail) : tail;
    g.main(curve(L, true)); g.add('o', curve(I, true));
    // 고리의 뒷면(안쪽 띠)에 빗금 — 리본이 접혀 그늘진 자리
    const Ls = sample(L, true, 5), Is = sample(I, true, 5);
    g.add('h', hatch([...Ls.slice(0, 22), ...Is.slice(0, 18).reverse()], m ? 118 : 62, 1.35));
    g.main(poly(T, true));
    g.add('h', hatch([T[0], T[1], T[2], [T[2][0] + (m ? -4.5 : 4.5), T[2][1] + 1], T[7], T[8]], m ? 70 : 110, 1.5));
    g.add('t', poly([T[3], [T[4][0], T[4][1] - 4]]), poly([[T[4][0], T[4][1] - 4], T[5]]), curve([[T[0][0] + (m ? -1 : 1) * 1.4, 55], [T[1][0] + (m ? -1 : 1) * 2.6, 65], [T[2][0] + (m ? -1 : 1) * 3.2, 77]]));
    // 고리 가장자리의 바느질 땀
    g.add('s', ...sample(L, true, 3).filter((_, i) => i % 2 === 0 && i > 2 && i < 20).map(([x, y]) => dot(x + (50 - x) * .07, y + (40 - y) * .07)));
  }
  // 가운데 매듭: 둥글게 조인 띠와 주름
  const knot = pts([44.5, 42, 50, 40.2, 55.5, 42, 56.8, 47.5, 55, 53.2, 50, 54.6, 45, 53.2, 43.2, 47.5]);
  g.add('a', curve(knot, true)); g.add('m', curve(knot, true));
  g.add('t', curve(pts([46.5, 43.5, 48, 47.5, 46.8, 52.5])), curve(pts([53.5, 43.5, 52, 47.5, 53.2, 52.5])), curve(pts([50, 41.5, 50.6, 47.5, 50, 53.6])));
  g.add('h', hatch(sample(knot, true, 4).filter(p => p[0] > 51.5).concat([[52, 54], [52, 41]]), 60, 1.1));
  return g.done();
}

// ── 긴 이야기: 펼친 두루마리 ──
function long(): Fig {
  const g = new Plate(), top = pts([17, 30.5, 30, 27.5, 44, 30, 58, 27.2, 72, 29.6, 83, 28]), bot = pts([83, 72, 70, 75.2, 56, 72.4, 42, 75, 28, 72.6, 17, 74.5]);
  g.main(curve(top), curve(bot));
  // 양 끝의 말린 축: 위아래 타원과 옆선, 끝에 감긴 종이의 나선
  for (const x of [12.5, 87.5]) {
    const sgn = x < 50 ? 1 : -1;
    g.main(curve(arc(x, 25.5, 5.6, 2.2, 0, 360, 20), true), poly([[x - 5.6, 25.5], [x - 5.6, 77]]), poly([[x + 5.6, 25.5], [x + 5.6, 77]]), curve(arc(x, 77, 5.6, 2.2, 0, 180, 12)));
    g.add('t', curve(arc(x, 25.5, 3.4, 1.3, 30, 400, 20)), curve(arc(x + .4, 25.6, 1.6, .6, 60, 380, 12)));
    g.add('h', hatch(rect(x + (sgn > 0 ? 1.6 : -5.6), 27.6, 4, 49.6), 90, 1.05), hatch(rect(x + (sgn > 0 ? -5.6 : 3.8), 27.6, 1.8, 49.6), 90, .9));
    // 축 옆으로 종이에 지는 그늘
    g.add('h', hatch([[x + sgn * 5.6, 29], [x + sgn * 11, 28.4], [x + sgn * 9.2, 73.6], [x + sgn * 5.6, 74.6]], sgn > 0 ? 58 : 122, 1.5));
    // 축 끝의 손잡이
    g.add('o', poly([[x - 1.6, 23.2], [x - 1.6, 19.6], [x + 1.6, 19.6], [x + 1.6, 23.2]]), curve(arc(x, 18.2, 2.3, 1.5, 0, 360, 12), true), poly([[x - 1.6, 79.2], [x - 1.6, 82.6], [x + 1.6, 82.6], [x + 1.6, 79.2]]), curve(arc(x, 84, 2.3, 1.5, 0, 360, 12), true));
  }
  // 본문: 종이의 굴곡을 따라 살짝 물결치는 글줄, 문단 끝은 짧게
  const r = rng(31), wave = (x: number) => Math.sin((x - 17) / 66 * Math.PI * 2.4) * 1.3;
  for (let i = 0; i < 9; i++) {
    const y = 35.5 + i * 4.3, x0 = i < 2 ? 34 : 25, x1 = i === 4 || i === 8 ? 48 + r() * 12 : 77 - r() * 3; let x = x0, d = '';
    while (x < x1) { const w = 2.2 + r() * 5.2, e = Math.min(x1, x + w); d += `M${f(x)} ${f(y + wave(x))}L${f(e)} ${f(y + wave(e))}`; x = e + 1.3; }
    g.add('t', d);
  }
  // 머리글자: 작은 틀 안의 큰 첫 글자 자리
  g.add('a', poly(rect(24.2, 33.6, 7.6, 7.8), true)); g.add('m', poly(rect(24.2, 33.6, 7.6, 7.8), true));
  g.add('t', curve(pts([26, 39.6, 28, 35.2, 30, 39.6])), poly([[26.9, 38], [29.1, 38]]));
  g.add('s', stipple(rect(24.6, 34, 6.8, 7), 10, 9));
  // 아래 가장자리에 매달린 봉인 끈
  g.add('t', curve(pts([62, 73.4, 63.5, 80, 61, 85])), curve(pts([64.5, 73, 66, 79, 67.5, 84.5])));
  g.add('o', curve(arc(61, 87.6, 2.8, 2.8, 0, 360, 14), true)); g.add('t', curve(arc(61, 87.6, 1.5, 1.5, 0, 360, 10), true));
  return g.done();
}

// ── 밤샘: 촛대의 초와 창밖의 그믐달 ──
function night(): Fig {
  const g = new Plate();
  // 불꽃: 바깥 불꽃과 속 불꽃
  const flame = pts([46, 12.5, 49.6, 19.5, 51.4, 26, 49.6, 31.2, 46, 33, 42.4, 31.2, 40.8, 26, 43, 19.5]);
  g.add('a', curve(flame, true), curve(pts([46, 22, 47.8, 26.6, 46, 30.6, 44.2, 26.6]), true)); g.add('m', curve(flame, true));
  g.add('o', poly([[46, 33], [46, 38.6]]));
  // 불빛: 불꽃을 둘러싼 점선 고리와 짧은 빛살
  g.add('s', ...arc(46, 23, 14.5, 14.5, 0, 360, 40).map(p => dot(p[0], p[1])), ...arc(46, 23, 20.5, 20.5, 0, 360, 34).filter((_, i) => i % 2 === 0).map(p => dot(p[0], p[1])));
  for (let a = 0; a < 360; a += 30) { if (a > 60 && a < 120) continue; const t = a * Math.PI / 180, r0 = a % 60 ? 16.5 : 16, r1 = a % 60 ? 18.4 : 19.4; g.add('h', poly([[46 + Math.cos(t) * r0, 23 + Math.sin(t) * r0], [46 + Math.cos(t) * r1, 23 + Math.sin(t) * r1]])); }
  // 초: 녹아 흘러내린 촛농이 맺힌 윗면, 곧은 몸
  g.main(curve(pts([38, 40.5, 40, 39, 43.5, 40.2, 46, 38.8, 49, 40.4, 52, 39, 54, 40.5])), poly([[38, 40.5], [38, 78]]), poly([[54, 40.5], [54, 78]]));
  g.add('t', curve(pts([54, 41, 55.6, 46, 55.2, 51.5, 54, 53.5])), curve(pts([38, 41, 36.6, 44.6, 37.2, 48, 38, 49])), curve(pts([42, 40, 41.4, 45, 42.2, 48.6])), curve(arc(46, 42.2, 8, 1.6, 10, 170, 10)));
  g.add('h', hatch(rect(49.4, 42, 4.6, 36), 90, 1.05), hatch(rect(38, 50, 1.9, 28), 90, .95));
  // 촛대: 넓은 접시와 굽, 손가락 고리
  g.main(curve(arc(46, 78.5, 25, 5, 0, 360, 30), true));
  g.add('o', curve(arc(46, 81.6, 25, 5, 8, 172, 18)), curve(arc(46, 78.5, 9.4, 2, 0, 360, 18), true), curve(arc(46, 86.8, 12, 2.6, 0, 180, 12)), poly([[34.4, 85], [34, 86.8]]), poly([[57.6, 85], [58, 86.8]]));
  g.add('t', curve(arc(46, 78.5, 20.5, 3.9, 0, 360, 26), true));
  g.add('h', hatch([...arc(46, 78.5, 20.5, 3.9, -40, 60, 10), ...arc(46, 78.5, 9.4, 2, 60, -40, 8)], 20, 1.1));
  g.main(curve(arc(77.5, 78, 5.6, 4.4, 0, 360, 18), true)); g.add('t', curve(arc(77.5, 78, 3.5, 2.5, 0, 360, 14), true));
  // 그믐달: 두 활이 양 끝에서 만나는 가는 초승, 어두운 쪽은 옅은 윤곽과 점묘
  const out = arc(80, 21, 10, 10, -60, 120, 22), inn = arc(77.4, 19.5, 10.44, 10.44, -43.3, 103.3, 18);
  g.main(curve(out), curve(inn));
  g.add('h', hatch([...out, ...inn.slice().reverse()], 30, .8)); g.add('t', curve(arc(80, 21, 10, 10, 128, 292, 18)));
  g.add('s', stipple(arc(78.6, 20.2, 8, 8, 0, 360, 14), 14, 11));
  g.add('s', dot(68, 9), dot(92.5, 34), dot(71, 38), dot(18, 10), dot(12, 44), dot(24, 55), dot(88, 56));
  return g.done();
}

// ── 갈림길: 세 갈래 이정표 ──
function fork(): Fig {
  const g = new Plate();
  // 기둥과 꼭대기 장식
  g.main(poly([[48.2, 19], [48.2, 89]]), poly([[51.8, 19], [51.8, 89]]));
  g.add('a', poly([[50, 9.5], [53.4, 14.2], [50, 19], [46.6, 14.2]], true)); g.add('m', poly([[50, 9.5], [53.4, 14.2], [50, 19], [46.6, 14.2]], true));
  g.add('t', poly([[50, 12], [50, 16.4]]), poly([[46.4, 19], [53.6, 19]]), poly([[46.8, 20.6], [53.2, 20.6]]));
  g.add('h', hatch(rect(50.4, 21, 1.4, 68), 90, .7));
  // 널빤지 셋: 오른쪽 · 왼쪽 · 오른쪽 아래 (끝은 화살 꼴)
  const boards: [P[], number][] = [[pts([52, 24, 80, 23, 89, 29.4, 80.6, 36, 52, 37]), 1], [pts([48, 43, 20, 42, 11, 48.6, 19.4, 55.2, 48, 56]), -1], [pts([52, 61.4, 71.6, 62.4, 78.6, 67.4, 72, 72.2, 52, 73]), 1]];
  boards.forEach(([b, sgn], i) => {
    g.main(poly(b, true));
    const y0 = b[0][1], y1 = b[4][1], xa = b[0][0], xb = b[1][0];
    // 나뭇결과 글자 자리, 못 두 개, 아래쪽 두께의 그늘
    g.add('t', poly([[xa + sgn * 4, y0 + 4.2], [xb - sgn * 3, y0 + 3.6]]), poly([[xa + sgn * 4, y0 + 7.4], [xb - sgn * (6 + i * 2), y0 + 7]]), curve([[xb - sgn * 1.5, y0 + 2], [xb + sgn * 2.4, (y0 + y1) / 2], [xb - sgn * 1.5, y1 - 2]]));
    g.add('h', hatch([[xa, y1 - 3.2], [xb + sgn * 1.2, y1 - 2.6], b[3], b[4]], sgn > 0 ? 62 : 118, 1.05));
    g.add('s', dot(xa + sgn * 1.7, y0 + 2.2), dot(xa + sgn * 1.7, y1 - 2.2));
  });
  // 땅: 풀이 돋은 둔덕, 세 방향으로 흩어지는 길
  g.main(curve(pts([24, 91.5, 34, 88.4, 44, 89.4, 50, 88.6, 57, 89.6, 67, 88.2, 77, 91.5])));
  for (const [x, y, h] of [[37, 88.6, 3.4], [39.4, 88.9, 2.2], [43, 89.2, 2.8], [58.4, 89.4, 3], [61, 89, 2], [65.4, 88.4, 3.2], [29.6, 90, 2]]) g.add('t', curve([[x, y], [x - .5, y - h * .6], [x + .9, y - h]]));
  g.add('s', ...sample(pts([46, 92, 34, 95.2, 20, 95, 7, 97.4]), false, 5).map(p => dot(p[0], p[1])), ...sample(pts([54, 92, 66, 95.4, 80, 94.6, 94, 97]), false, 5).map(p => dot(p[0], p[1])), ...sample(pts([49, 93.4, 47, 96, 50, 98.6]), false, 3).map(p => dot(p[0], p[1])));
  g.add('h', hatch(pts([40, 90.4, 60, 90.4, 56, 93, 44, 93]), 0, .9));
  return g.done();
}

// ── 주사위꾼: 가죽 컵과 굴러 나온 주사위 ──
function dice(): Fig {
  const g = new Plate();
  // 주사위: 위 · 왼 · 오른 세 면
  const T: P = [68, 39.5], R: P = [87, 49.5], B: P = [68, 83], L: P = [49, 49.5], C: P = [68, 60], RB: P = [87, 72.5], LB: P = [49, 72.5];
  g.main(poly([T, R, RB, B, LB, L], true), poly([L, C, R]), poly([C, B]));
  g.add('h', hatch([C, R, RB, B], 68, 1.15), hatch([L, C, B, LB], 112, 2.3));
  g.add('t', poly([[50.6, 50.4], [68, 58.2], [85.4, 50.4]]), poly([[68, 61.6], [68, 81.4]]));
  // 눈: 윗면 하나(강조), 왼면 셋, 오른면 둘 — 면의 기울기를 따라 납작한 타원
  g.add('a', curve(arc(68, 49.6, 3.3, 1.75, 0, 360, 16), true)); g.add('m', curve(arc(68, 49.6, 3.3, 1.75, 0, 360, 16), true));
  for (const [x, y] of [[53.6, 58], [58.5, 66.2], [63.4, 74.4]]) g.add('o', curve(arc(x, y, 1.5, 2, 0, 360, 12, 28), true));
  for (const [x, y] of [[73.4, 71.6], [81.6, 61.4]]) g.add('o', curve(arc(x, y, 1.5, 2, 0, 360, 12, -28), true));
  // 멀리 튄 작은 주사위
  const s: P[] = [[88, 18.6], [93.4, 22], [88.6, 25.8], [83, 22.2]];
  g.add('o', poly(s, true), poly([[83, 22.2], [83.4, 28.6], [89, 32.2], [88.6, 25.8]]), poly([[89, 32.2], [93.8, 28.2], [93.4, 22]]));
  g.add('h', hatch([[88.6, 25.8], [93.4, 22], [93.8, 28.2], [89, 32.2]], 60, .95)); g.add('s', dot(88.1, 22.2), dot(85.6, 26.4), dot(86.6, 28.8));
  // 컵: 위가 넓은 가죽 통, 두 줄의 띠와 바느질 땀
  g.main(curve(arc(25, 33.5, 14.5, 4.2, 0, 360, 26), true), poly([[10.5, 33.5], [15, 77]]), poly([[39.5, 33.5], [35, 77]]), curve(arc(25, 77, 10, 3, 0, 180, 14)));
  g.add('o', curve(arc(25, 33.5, 12.3, 3.2, 0, 360, 24), true));
  g.add('t', curve(arc(25, 42, 13.6, 3.9, 4, 176, 16)), curve(arc(25, 45.4, 13.3, 3.8, 4, 176, 16)), curve(arc(25, 68, 11, 3.2, 4, 176, 14)), curve(arc(25, 71, 10.6, 3.1, 4, 176, 14)));
  g.add('s', ...arc(25, 43.7, 13.4, 3.85, 12, 168, 13).map(p => dot(p[0], p[1])), ...arc(25, 69.5, 10.8, 3.15, 14, 166, 10).map(p => dot(p[0], p[1])));
  g.add('h', hatch([[30.5, 49.6], [38, 46.8], [36.2, 66.6], [30, 70]], 98, 1.1), hatch(arc(25, 33.5, 12.3, 3.2, 180, 360, 14).concat(arc(25, 35.6, 12, 2.4, 0, -180, 14)), 0, .8));
  // 던진 자국: 컵 입에서 주사위까지의 점선 활
  g.add('s', ...sample(pts([33, 27, 44, 14.5, 58, 12.5, 70, 18, 80, 21]), false, 5).map(p => dot(p[0], p[1])));
  g.add('t', poly([[46.2, 76.4], [52, 79.4]]), poly([[44, 80], [53.6, 85]]), poly([[76, 86], [86.4, 80.6]]));
  return g.done();
}

// ── 마주 앉은 자리: 등 하나 아래, 찻잔 둘이 놓인 둥근 탁자 ──
function scene(): Fig {
  const g = new Plate();
  // 등: 줄에 매단 갓과 불빛
  g.add('o', poly([[50, 1], [50, 10.4]]), curve(arc(50, 11.6, 2.2, 1.2, 0, 360, 10), true));
  const shade = pts([44.6, 12.8, 55.4, 12.8, 62.6, 23.6, 37.4, 23.6]);
  g.main(poly(shade, true)); g.add('o', curve(arc(50, 23.6, 12.6, 2.1, 0, 180, 14)));
  g.add('a', curve(arc(50, 25.4, 2.5, 2.2, 0, 360, 12), true)); g.add('m', curve(arc(50, 25.4, 2.5, 2.2, 0, 360, 12), true));
  g.add('h', hatch(pts([51.4, 12.8, 55.4, 12.8, 62.6, 23.6, 53.6, 23.6]), 68, 1.05));
  g.add('t', poly([[47, 12.8], [42.8, 23.6]]), poly([[53, 12.8], [57.2, 23.6]]));
  // 불빛이 번지는 원뿔: 점선 두 줄과 사이의 성긴 점
  g.add('s', ...sample([[38.6, 26], [26, 40], [15, 51]], false, 6).map(p => dot(p[0], p[1])), ...sample([[61.4, 26], [74, 40], [85, 51]], false, 6).map(p => dot(p[0], p[1])), ...[[50, 31], [45, 36], [55, 36], [50, 41], [41, 43.4], [59, 43.4]].map(([x, y]) => dot(x, y)));
  // 탁자: 윗면 타원, 두께, 외다리와 발
  g.main(curve(arc(50, 62, 41, 9.4, 0, 360, 36), true)); g.add('o', curve(arc(50, 65, 41, 9.4, 3, 177, 22)));
  g.add('t', curve(arc(50, 62, 36.5, 7.8, 0, 360, 32), true));
  g.add('h', hatch([...arc(50, 62, 41, 9.4, 4, 176, 22), ...arc(50, 65, 41, 9.4, 176, 4, 22)], 90, 1.2));
  g.main(curve(pts([46, 74, 46.6, 80, 45, 86, 38.6, 91.6])), curve(pts([54, 74, 53.4, 80, 55, 86, 61.4, 91.6])), curve(arc(50, 92, 14.6, 2.8, 0, 180, 12)));
  g.add('h', hatch(pts([50.6, 74.4, 54, 74, 53.4, 80, 55, 86, 58.6, 90, 51, 91]), 90, .9)); g.add('t', curve(arc(50, 79.4, 3.4, 1, 0, 180, 8)));
  // 찻잔 둘: 받침, 잔, 손잡이, 피어오르는 김
  for (const m of [false, true]) {
    const X = (x: number) => m ? 100 - x : x, P = (flat: number[]) => pts(flat).map(([x, y]): P => [X(x), y]);
    g.main(curve(arc(X(30), 51.4, 8.4, 2.3, 0, 360, 20), true), curve(P([21.6, 51.4, 22.4, 56.4, 25.6, 59.6, 30, 60.2, 34.4, 59.6, 37.6, 56.4, 38.4, 51.4])));
    g.add('o', curve(arc(X(30), 60.6, 12, 2.7, 0, 360, 22), true), curve(P([22, 53.4, 18, 52.4, 16.6, 55, 18.6, 57.6, 23.2, 57.4])));
    g.add('t', curve(arc(X(30), 51.6, 6.6, 1.5, 0, 360, 16), true), curve(arc(X(30), 60.9, 8.6, 1.7, 10, 170, 12)));
    g.add('h', hatch(P([31.5, 53.9, 38.2, 52.8, 37.4, 56.6, 34.4, 59.5, 31.5, 60]), m ? 118 : 62, .95));
    g.add('t', curve(P([28, 47.6, 26.4, 43.6, 29, 40, 27.2, 36])), curve(P([32, 47.2, 33.6, 43, 31.2, 39, 33, 34.6])));
  }
  // 가운데의 작은 꽃병
  g.add('o', curve(pts([47.6, 62.6, 46.6, 59.4, 48.6, 57, 48.6, 54.6])), curve(pts([52.4, 62.6, 53.4, 59.4, 51.4, 57, 51.4, 54.6])), curve(arc(50, 54.6, 1.4, .5, 0, 360, 8), true), curve(arc(50, 62.6, 2.4, .8, 0, 180, 8)));
  g.add('t', curve(pts([50, 54.4, 49.4, 50.6, 50.6, 47.4])), curve(arc(50.6, 46.2, 1.5, 1.5, 0, 360, 8), true), curve(pts([49.7, 51.4, 47.4, 50.2, 46.6, 48.4])));
  return g.done();
}

// ── 종이 서랍: 열린 서랍과 꽂힌 편지들 ──
function paper(): Fig {
  const g = new Plate();
  // 서랍: 앞판, 위로 열린 입, 옆판
  const F = rect(13, 58, 62, 31), TL: P = [28, 45], TR: P = [90, 45], RB: P = [90, 76];
  g.main(poly(F, true), poly([[13, 58], TL, TR, [75, 58]]), poly([TR, RB, [75, 89]]));
  g.add('o', poly(rect(17.4, 62.4, 53.2, 22.2), true)); g.add('t', poly(rect(19, 64, 50, 19), true), poly([[16.6, 58], [30.4, 47], [87.4, 47]]));
  g.add('h', hatch([[75, 58], TR, RB, [75, 89]], 60, 1.2), hatch([[30.4, 47], [87.4, 47], [75.6, 57.2], [17.6, 57.2]], 0, 1.05));
  // 손잡이: 둥근 고리와 받침쇠
  g.add('a', curve(arc(44, 75.4, 4.2, 3.4, 20, 160, 12)), curve(arc(44, 72.6, 2.2, 1.5, 0, 360, 12), true)); g.add('m', curve(arc(44, 75.4, 4.2, 3.4, 20, 160, 12)), curve(arc(44, 72.6, 2.2, 1.5, 0, 360, 12), true));
  g.add('s', dot(21, 66), dot(67, 66), dot(21, 81), dot(67, 81));
  // 편지 셋: 뒤의 접은 종이, 가운데 봉투(봉랍), 앞의 봉투
  const s1 = pts([62, 50.6, 66.4, 15.4, 87, 19.6, 84.2, 50.6]);
  g.main(poly(s1)); g.add('t', ...[0, 1, 2, 3, 4, 5].map(i => poly([[68.6 - i * .56 + 0, 23 + i * 4.4], [(i === 5 ? 78 : 83.6) - i * .3, 24.6 + i * 4.4]])));
  g.add('o', poly([[66.4, 15.4], [70.4, 20.4], [87, 19.6]]));
  const e1 = pts([33, 52, 38.6, 19, 66.6, 25.4, 62.2, 52]);
  g.main(poly(e1)); g.add('o', poly([[38.6, 19], [50.4, 37.4], [66.6, 25.4]]));
  g.add('t', poly([[35, 50], [46.6, 36.4]]), poly([[62.6, 50], [54, 36.6]]), curve(arc(50.4, 37.4, 3.4, 3.4, 0, 360, 14), true));
  g.add('o', curve(arc(50.4, 37.4, 2.2, 2.2, 0, 360, 12), true));
  g.add('h', hatch(pts([38.6, 19, 50.4, 37.4, 66.6, 25.4, 60, 23.9, 50.6, 31.4, 43.4, 20.1]), 100, 1));
  const e2 = pts([17.6, 55.4, 16.4, 33, 36.8, 30.6, 38.8, 49.6]);
  g.main(poly(e2)); g.add('t', poly([[19.6, 39], [30, 37.8]]), poly([[19.8, 42.6], [33.6, 41]]), poly([[20, 46.2], [28, 45.3]]), poly(pts([30.4, 32.6, 35, 32.1, 35.4, 36.4, 30.8, 36.9]), true));
  g.add('s', stipple(pts([30.8, 33, 34.8, 32.6, 35, 36, 31.1, 36.5]), 7, 4));
  // 끈으로 묶은 묶음의 리본 끝
  g.add('t', curve(pts([84.2, 44, 91.6, 41.4, 95.6, 36.6])), curve(pts([84.2, 45.4, 92.4, 45, 97, 42])));
  return g.done();
}

// ── 수집가: 유리종 아래의 나비 표본 ──
function keep(): Fig {
  const g = new Plate(), mir = (p: P[]): P[] => p.map(([x, y]) => [100 - x, y]);
  // 유리종: 둥근 지붕, 곧은 옆, 꼭지
  const dome = pts([24, 82, 24, 44, 28, 28, 38, 17.6, 50, 14, 62, 17.6, 72, 28, 76, 44, 76, 82]);
  g.main(curve(dome)); g.add('o', curve(arc(50, 10.4, 3.4, 3.4, 0, 360, 14), true), poly([[48.4, 13.4], [48.4, 14.6]]), poly([[51.6, 13.4], [51.6, 14.6]]));
  g.add('t', curve(pts([28.6, 76, 28.6, 46, 32, 31, 39, 22.6])), curve(pts([71, 52, 71, 70])), curve(arc(50, 10, 1.6, 1.4, 180, 330, 8)));
  g.add('h', hatch(pts([24.8, 80, 24.8, 46, 28, 32, 30.4, 33.4, 27.4, 46, 27.4, 80]), 0, 1.4), hatch(pts([72.6, 44, 75.2, 44, 75.2, 80, 72.6, 80]), 0, 2.2));
  // 받침: 나무 받침대와 이름표
  g.main(curve(arc(50, 82, 31, 5.2, 0, 360, 34), true), curve(arc(50, 89.6, 33, 5.4, 0, 180, 20)), poly([[19, 82], [17, 89.6]]), poly([[81, 82], [83, 89.6]]));
  g.add('t', curve(arc(50, 82, 26, 4, 0, 360, 30), true)); g.add('h', hatch([...arc(50, 83.4, 31, 5.2, 6, 174, 20), ...arc(50, 89.6, 33, 5.4, 174, 6, 20)], 90, 1.15));
  g.add('a', poly(rect(42.6, 89, 14.8, 4.4), true)); g.add('m', poly(rect(42.6, 89, 14.8, 4.4), true)); g.add('t', poly([[45, 91.2], [55, 91.2]]));
  // 나비: 몸, 더듬이, 앞날개와 뒷날개, 날개맥과 무늬
  g.main(curve(arc(50, 49.6, 1.3, 7.4, 0, 360, 16), true)); g.add('o', curve(arc(50, 41, 1.5, 1.5, 0, 360, 10), true));
  g.add('t', poly([[50, 57], [50, 80.6]]), curve(arc(50, 80.6, 2.6, .8, 0, 360, 10), true), poly([[48.8, 46.4], [51.2, 46.4]]), poly([[48.7, 49.6], [51.3, 49.6]]), poly([[48.8, 52.8], [51.2, 52.8]]));
  const fore = pts([48.8, 45.6, 42, 37, 34.6, 32.4, 30, 34.6, 30.4, 42, 35.4, 49.4, 48.8, 51.6]), hind = pts([48.8, 51.8, 40, 53.6, 34.8, 59.6, 36, 66.6, 41.4, 68.4, 46, 64, 48.9, 56]);
  for (const m of [false, true]) {
    const W = (p: P[]) => m ? mir(p) : p, X = (x: number) => m ? 100 - x : x;
    g.main(curve(W(fore), true), curve(W(hind), true));
    g.add('o', curve(W(pts([48.8, 40.2, 46, 35.4, 42.6, 32.6]))), curve(arc(X(42.2), 32.2, .8, .8, 0, 360, 6), true));
    // 날개맥: 몸에서 가장자리로 퍼지는 가는 선
    for (const [x, y] of [[35.2, 33.4], [31.4, 37], [31.6, 42.6], [36.4, 48]]) g.add('t', curve(W([[48.4, 48], [(48.4 + x) / 2 + 1, (48 + y) / 2 - 1.2], [x, y]])));
    for (const [x, y] of [[36, 58.6], [37, 65], [43, 66.6]]) g.add('t', curve(W([[48.6, 53.4], [(48.6 + x) / 2 + .8, (53.4 + y) / 2 + .6], [x, y]])));
    g.add('o', curve(arc(X(36.4), 40.4, 2.4, 2.1, 0, 360, 12), true)); g.add('t', curve(arc(X(36.4), 40.4, 1.1, 1, 0, 360, 8), true), curve(arc(X(40), 61.6, 1.7, 1.9, 0, 360, 10), true));
    g.add('h', hatch(sample(W(fore), true, 4).filter(p => Math.abs(p[0] - 50) > 12.5).concat(W([[37.5, 49.6], [37.5, 33.6]])), m ? 60 : 120, 1.15));
    g.add('s', stipple(sample(W(hind), true, 3), 16, m ? 7 : 5), ...sample(W(fore), true, 4).filter((p, i) => i % 2 === 0 && Math.abs(p[0] - 50) > 6).map(([x, y]) => dot(x + (X(41) - x) * .12, y + (42 - y) * .12)));
  }
  return g.done();
}

const MAKE: Record<string, () => Fig> = { first, vow, long, night, fork, dice, scene, paper, keep };
const made = new Map<string, Fig>();
/** 그 별자리의 형상 그림 (처음 한 번만 만든다) */
export function figure(id: string): Fig | null { const hit = made.get(id); if (hit) return hit; const mk = MAKE[id]; if (!mk) return null; const fg = mk(); made.set(id, fg); return fg; }

/** 한 사람과의 별자리 뒤에 까는 무늬: 이름에서 나온 장미 곡선 두 겹과 눈금 고리 — 사람마다 다르다 */
export function rosette(seed: number): Fig {
  const r = rng(seed), k = 3 + Math.floor(r() * 6), k2 = k + (r() < .5 ? 2 : 4), a = 27 + r() * 5, b = 9 + r() * 6, ph = r() * 360, g = new Plate();
  const rose = (K: number, A: number, Bv: number, p0: number, n = 180): P[] => Array.from({ length: n }, (_, i) => { const t = i / n * Math.PI * 2, rr = A + Bv * Math.cos(K * t + p0); return [50 + Math.cos(t) * rr, 50 + Math.sin(t) * rr] as P; });
  g.main(poly(rose(k, a, b, ph * Math.PI / 180), true)); g.add('t', poly(rose(k2, a * .62, b * .7, 0), true), poly(rose(k, a * .3, b * .42, Math.PI), true));
  g.add('o', curve(arc(50, 50, 47, 47, 0, 360, 48), true)); g.add('t', curve(arc(50, 50, 44.4, 44.4, 0, 360, 48), true));
  for (let d = 0; d < 360; d += 5) { const t = d * Math.PI / 180, r0 = d % 30 ? (d % 10 ? 45.6 : 45) : 44.4; g.add('h', poly([[50 + Math.cos(t) * r0, 50 + Math.sin(t) * r0], [50 + Math.cos(t) * 47, 50 + Math.sin(t) * 47]])); }
  for (let i = 0; i < k; i++) { const t = (i / k) * Math.PI * 2 - ph * Math.PI / 180 / k, p: P = [50 + Math.cos(t) * (a + b), 50 + Math.sin(t) * (a + b)]; g.add('s', dot(p[0], p[1])); g.add('h', poly([[50 + Math.cos(t) * 6, 50 + Math.sin(t) * 6], [50 + Math.cos(t) * (a + b - 2), 50 + Math.sin(t) * (a + b - 2)]])); }
  g.add('a', curve(arc(50, 50, 4.4, 4.4, 0, 360, 16), true)); g.add('m', curve(arc(50, 50, 4.4, 4.4, 0, 360, 16), true));
  return g.done();
}
