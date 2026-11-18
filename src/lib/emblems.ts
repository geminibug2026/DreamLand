// 드림랜드 엠블럼 — 작은 도우미로 조립해 그리는 선화
// 좌표: 가운데가 (0,0), 쓸 수 있는 범위는 대략 ±100. 각도는 12시가 0°, 시계 방향.
// 칠: (기본) 굵은 선 · p 종이 면 · q 종이색 가는 선 · h 가는 선 · d 점선 · ds 파선 · k 잉크 면 · w 종이 면+선 · wh 종이 면+가는 선 · c 포인트 색 면
// (옛 js/emblems.js 그대로)
type P = [number, number];
const R = (n: number) => Math.round(n * 100) / 100;
const pt = (r: number, deg: number, cx = 0, cy = 0): P => { const a = (deg - 90) * Math.PI / 180; return [R(cx + r * Math.cos(a)), R(cy + r * Math.sin(a))]; };
const tag = (name: string, attrs: Record<string, string | number>, cls?: string) => `<${name}${cls ? ` class="${cls}"` : ''}${Object.entries(attrs).map(([k, v]) => ` ${k}="${v}"`).join('')}/>`;
const path = (d: string, cls?: string) => tag('path', { d }, cls);
const circle = (cx: number, cy: number, r: number, cls?: string) => tag('circle', { cx, cy, r }, cls);
const ellipse = (cx: number, cy: number, rx: number, ry: number, cls?: string) => tag('ellipse', { cx, cy, rx, ry }, cls);
const line = (x1: number, y1: number, x2: number, y2: number, cls?: string) => tag('line', { x1, y1, x2, y2 }, cls);
const rect = (x: number, y: number, width: number, height: number, cls?: string) => tag('rect', { x, y, width, height }, cls);
const group = (body: string, transform: string) => `<g transform="${transform}">${body}</g>`;
const mirror = (body: string) => body + group(body, 'scale(-1 1)');

/** 네 갈래 반짝임 */
const glint = (x: number, y: number, r: number, cls = 'k', w = r * .11) => path(`M${x} ${R(y - r)}Q${R(x + w)} ${R(y - w)} ${R(x + r)} ${y}Q${R(x + w)} ${R(y + w)} ${x} ${R(y + r)}Q${R(x - w)} ${R(y + w)} ${R(x - r)} ${y}Q${R(x - w)} ${R(y - w)} ${x} ${R(y - r)}Z`, cls);
/** 원호 */
const arc = (r: number, a0: number, a1: number, cls?: string, cx = 0, cy = 0) => { const p0 = pt(r, a0, cx, cy), p1 = pt(r, a1, cx, cy); return path(`M${p0}A${r} ${r} 0 ${Math.abs(a1 - a0) > 180 ? 1 : 0} ${a1 > a0 ? 1 : 0} ${p1}`, cls); };
/** 방사 눈금 — alt 만큼 하나 걸러 짧게 */
const ticks = (r0: number, r1: number, a0: number, a1: number, n: number, cls = 'h', cx = 0, cy = 0, alt = 0) => Array.from({ length: n }, (_, i) => { const a = n > 1 ? a0 + (a1 - a0) * i / (n - 1) : a0; return line(...pt(r0, a, cx, cy), ...pt(i % 2 ? r1 - alt : r1, a, cx, cy), cls); }).join('');
/** 구슬 줄 */
const beads = (r: number, a0: number, a1: number, n: number, size = 1.4, cls = 'k', cx = 0, cy = 0) => Array.from({ length: n }, (_, i) => circle(...pt(r, n > 1 ? a0 + (a1 - a0) * i / (n - 1) : a0, cx, cy), size, cls)).join('');
/** 곡선을 따라 꿴 구슬 줄 — (x0,y0)→(x1,y1), 제어점 (qx,qy). every 번째마다 큰 구슬 */
const chain = (x0: number, y0: number, qx: number, qy: number, x1: number, y1: number, n: number, size = 1.3, every = 0, big = 2.5, cls = 'k') => Array.from({ length: n }, (_, i) => { const t = i / (n - 1), u = 1 - t; return circle(R(u * u * x0 + 2 * u * t * qx + t * t * x1), R(u * u * y0 + 2 * u * t * qy + t * t * y1), every && i % every === (every >> 1) ? big : size, cls); }).join('');
/** 휘어 흐르는 띠 — (cx,cy) 둘레 r0~r1 사이를 a0→a1 로 돌고 끝은 칼날처럼 모인다 */
const streamer = (cx: number, cy: number, r0: number, r1: number, a0: number, a1: number, taper: number, cls?: string) => {
  const dir = a1 > a0 ? 1 : -1, ae = a1 - dir * taper, m = (r0 + r1) / 2, am = ae + dir * taper * .55, P = (r: number, a: number) => pt(r, a, cx, cy), s = dir > 0 ? 1 : 0;
  return path(`M${P(r0, a0)}A${r0} ${r0} 0 0 ${s} ${P(r0, ae)}Q${P(r0 + (m - r0) * .25, am)} ${P(m, a1)}Q${P(r1 - (r1 - m) * .25, am)} ${P(r1, ae)}A${r1} ${r1} 0 0 ${1 - s} ${P(r1, a0)}Z`, cls);
};
/** 초승달 — 오른쪽이 트인 모양을 rot 만큼 돌린다. fat 이 클수록 두껍다 (최소 .89) */
const crescent = (cx: number, cy: number, r: number, cls = 'k', rot = -28, fat = .93, horn = 28) => { const a = pt(r, horn), b = pt(r, 180 - horn), r2 = R(r * fat); return group(path(`M${a}A${r} ${r} 0 1 0 ${b}A${r2} ${r2} 0 0 1 ${a}Z`, cls), `translate(${cx} ${cy}) rotate(${rot})`); };
/** 꽃잎 · 잎 */
const petal = (len: number, w: number, rot: number, cls?: string, cx = 0, cy = 0, base = 0) => group(path(`M0 ${-base}C${w} ${R(-base - len * .3)} ${w} ${R(-base - len * .78)} 0 ${R(-base - len)}C${-w} ${R(-base - len * .78)} ${-w} ${R(-base - len * .3)} 0 ${-base}Z`, cls), `translate(${cx} ${cy}) rotate(${rot})`);
/** 톱니바퀴 */
const gear = (cx: number, cy: number, ro: number, ri: number, n: number, cls?: string) => { const s = 360 / n; let d = ''; for (let i = 0; i < n; i++) { const a = i * s, p = [pt(ri, a - s * .3, cx, cy), pt(ro, a - s * .17, cx, cy), pt(ro, a + s * .17, cx, cy), pt(ri, a + s * .3, cx, cy)]; d += (i ? `A${ri} ${ri} 0 0 1 ${p[0]}` : `M${p[0]}`) + `L${p[1]}A${ro} ${ro} 0 0 1 ${p[2]}L${p[3]}`; } return path(d + `A${ri} ${ri} 0 0 1 ${pt(ri, -s * .3, cx, cy)}Z`, cls); };

const E: Record<string, () => string> = {};

// 달창 — 아치 창 너머의 초승달과 구름
E.window = () => [
  ticks(61, 70, -84, 84, 25, 'h', 0, -12, 4), arc(80, -60, 60, 'd', 0, -12),
  path('M-56 80V-12A56 56 0 0 1 56 -12V80Z', 'w'), path('M-46 80V-12A46 46 0 0 1 46 -12V80Z', 'k'),
  ticks(46, 56, -75, 75, 11, 'h', 0, -12), ...[6, 28, 50].map(y => line(-56, y, -46, y, 'h') + line(46, y, 56, y, 'h')),
  path('M-40.5 80V-12A40.5 40.5 0 0 1 40.5 -12V80', 'q'),
  crescent(4, -18, 25, 'p'), glint(-24, 20, 6, 'p'), circle(27, 16, 1.8, 'p'), circle(-27, -20, 1.5, 'p'), circle(20, -44, 1.3, 'p'),
  path('M-46 80V58a11.5 11.5 0 0 1 20 -7a15 15 0 0 1 28 -4a11.5 11.5 0 0 1 21 5a11 11 0 0 1 23 6V80Z', 'w'),
  line(-31, 66, -10, 66, 'h'), line(3, 62, 31, 62, 'h'), line(-18, 72, 15, 72, 'h'),
  rect(-68, 80, 136, 10, 'k'), line(-62, 85, 62, 85, 'q'),
  chain(-62, 95, -31, 111, 0, 95, 9, 1.2, 9, 2.6), chain(0, 95, 31, 111, 62, 95, 9, 1.2, 9, 2.6), circle(0, 96, 2.6, 'k'), circle(-64, 96, 2.6, 'k'), circle(64, 96, 2.6, 'k'),
  path('M0 -76l5.5 8l-5.5 8l-5.5 -8Z', 'k'),
  glint(78, -66, 13, 'c'), glint(-80, -40, 7, 'k'), circle(-82, 26, 2.6, 'h'),
].join('');

// 달못 — 돌 테를 두른 못에 비친 초승달, 부들과 종이배
E.water = () => {
  const on = (rx: number, ry: number, deg: number, cy = 42): P => { const a = deg * Math.PI / 180; return [R(rx * Math.cos(a)), R(cy + ry * Math.sin(a))]; };
  const ring = (rx: number, ry: number, a0: number, a1: number, cls?: string) => path(`M${on(rx, ry, a0)}A${rx} ${ry} 0 0 1 ${on(rx, ry, a1)}`, cls);
  const stem = (d: string, w = 1.8) => tag('path', { d, 'stroke-width': w });
  const head = (x1: number, y1: number, x2: number, y2: number) => tag('line', { x1, y1, x2, y2, 'stroke-width': 6.5 });
  return [
    // 하늘의 달
    ticks(35, 44, -68, 68, 15, 'h', 0, -48, 4), arc(56, -50, 50, 'd', 0, -48),
    crescent(0, -48, 26),
    circle(0, -13, 1.2, 'k'), circle(0, -6, 1.8, 'k'), circle(0, 1.5, 1.2, 'k'),
    // 부들 — 못 뒤에서 올라온다
    path('M-66 30C-70 12 -80 4 -93 3C-82 9 -75 17 -71 30Z', 'k'), path('M-58 30C-55 18 -48 12 -39 11C-46 16 -51 22 -53 30Z', 'k'),
    stem('M-62 30C-62 8 -63 -14 -66 -34'), head(-64.8, -14, -66, -29), line(-66, -29, -66.8, -40, 'h'),
    stem('M-70 30C-72 14 -76 2 -82 -8'), head(-77.4, -1, -81, -7), line(-81, -7, -84.4, -13, 'h'),
    stem('M-55 30C-54 16 -52 6 -49 -6'), head(-51.6, 3, -50.2, -4), line(-50.2, -4, -48.6, -12, 'h'),
    // 못 — 돌 테와 수면
    ellipse(0, 44, 86, 36, 'w'),
    ...Array.from({ length: 22 }, (_, i) => line(...on(76, 29, (i + .5) * 360 / 22), ...on(86, 36, (i + .5) * 360 / 22, 44), 'h')),
    ellipse(0, 42, 76, 29, 'k'), ellipse(0, 42, 70.5, 25.5, 'q'),
    // 비친 달과 물결
    group(crescent(0, 0, 16, 'p'), 'translate(-1 41) scale(1 -.72)'),
    ring(36, 14.5, 30, 150, 'q'), ring(50, 18.5, 196, 244, 'q'), ring(50, 18.5, 296, 344, 'q'), ring(52, 19.5, 74, 106, 'q'),
    circle(-30, 34, 1.2, 'p'), circle(22, 30, 1.2, 'p'), circle(8, 60, 1.2, 'p'),
    // 종이배와 연잎
    path('M25 38L37 42L44 27L51 42L63 38L55 52H33Z', 'p'), path('M37 42H51M44 27V42', 'h'),
    ellipse(-42, 53, 13, 5, 'p'), path('M-42 53L-30.5 49.5L-29.5 55Z', 'k'), ellipse(-22, 61.5, 7.5, 3, 'p'),
    path(`M${on(100, 46, 118, 48)}A100 46 0 0 1 ${on(100, 46, 62, 48)}`, 'd'), circle(0, 101, 2.2, 'k'),
    glint(62, -58, 11, 'c'), glint(-38, -82, 6, 'k'), circle(80, -6, 2.6, 'h'), circle(44, -28, 1.5, 'k'),
  ].join('');
};

// 달나방
E.moth = () => [
  arc(100, -44, 44, 'd'), crescent(0, -80, 12, 'k', -90),
  mirror([
    path('M4 -14C26 -58 78 -62 94 -36C100 -14 74 7 40 10C24 11 10 5 4 -4Z', 'w'),
    path('M60 -56C76 -58 90 -50 94 -36C99 -16 80 3 56 9C74 -2 83 -18 80 -32C77 -44 70 -51 60 -56Z', 'k'),
    path('M5 2C27 8 54 16 58 42C60 58 47 70 42 94C36 74 22 58 12 37C8 27 6 12 5 2Z', 'w'),
    path('M8 -10C30 -32 50 -44 66 -50', 'h'), path('M8 -6C30 -12 54 -12 76 -6', 'h'), path('M8 -2C26 2 40 6 54 7', 'h'),
    beads(17.5, 0, 330, 12, 1.1, 'k', 52, -25), circle(52, -25, 12.5, 'wh'), circle(52, -25, 6.5, 'c'),
    path('M14 -18C32 -46 58 -53 70 -47', 'h'),
    path('M10 12C29 22 41 42 43 80', 'h'), path('M12 20C22 30 28 42 30 56', 'h'), circle(36, 36, 9.5, 'h'), circle(36, 36, 5.5, 'k'), chain(47, 52, 46, 66, 42, 82, 5, 1.1),
    path('M2 -30C6 -46 14 -56 27 -62', 'h'), circle(28, -62.5, 2.4, 'k'),
  ].join('')),
  ellipse(0, 6, 6, 26, 'k'), circle(0, -25, 6.5, 'k'), ...[-6, 2, 10, 18].map(y => line(-4.5, y, 4.5, y, 'q')),
  circle(0, 62, 2.6, 'k'), circle(0, 73, 1.9, 'k'), circle(0, 82, 1.3, 'k'),
  glint(-86, 50, 8, 'k'), circle(82, 60, 2.6, 'h'),
].join('');

// 달열쇠
E.key = () => [
  group(ellipse(0, 0, 96, 30, 'd'), 'rotate(-24)'),
  group([
    ticks(37, 45, 0, 345, 24, 'h', 0, -48, 4),
    path('M-4 -12V88L0 93L4 88V-12Z', 'w'), path('M4 52H27V61H18V68H27V80H4', 'w'),
    rect(-9, -20, 18, 9, 'k'), line(-4, 12, 4, 12, 'h'), line(-4, 18, 4, 18, 'h'),
    circle(0, -48, 30, 'w'), beads(25.5, 0, 337.5, 16, 1.2, 'k', 0, -48), circle(0, -48, 21, 'h'), crescent(1, -48, 13),
    rect(-7, -7, 14, 4.5, 'k'), line(-4, 30, 4, 30, 'h'), line(-4, 36, 4, 36, 'h'),
  ].join(''), 'rotate(24)'),
  glint(-62, -58, 12, 'c'), glint(66, 36, 7.5, 'k'), circle(-66, 44, 2.6, 'h'),
].join('');

// 별 모래시계
E.hourglass = () => [
  arc(98, 62, 118, 'd'), arc(98, 242, 298, 'd'), ticks(92, 100, -24, 24, 13, 'h', 0, 0, 4), ticks(92, 100, 156, 204, 13, 'h', 0, 0, 4),
  line(-44, -76, -44, 76, 'h'), line(44, -76, 44, 76, 'h'),
  ...[-44, 44].map(x => circle(x, 0, 4.2, 'wh') + circle(x, -40, 2.6, 'wh') + circle(x, 40, 2.6, 'wh') + circle(x, -62, 1.5, 'k') + circle(x, 62, 1.5, 'k')),
  path('M-35 -76H35C35 -40 6 -17 6 0C6 17 35 40 35 76H-35C-35 40 -6 17 -6 0C-6 -17 -35 -40 -35 -76Z', 'w'),
  glint(-9, -53, 9, 'k'), glint(12, -42, 5.5, 'k'), circle(1, -26, 1.7, 'k'), circle(-15, -35, 1.4, 'k'), circle(17, -60, 1.4, 'k'),
  line(0, -8, 0, 36, 'd'),
  path('M-30 74C-28 57 -12 46 0 40C12 46 28 57 30 74Z', 'k'),
  glint(0, 61, 6, 'p'), circle(-13, 68, 1.3, 'p'), circle(12, 67, 1.3, 'p'),
  path('M-28 -62C-18 -56 18 -56 28 -62', 'h'),
  rect(-50, -89, 100, 13, 'k'), rect(-50, 76, 100, 13, 'k'), line(-44, -82.5, 44, -82.5, 'q'), line(-44, 82.5, 44, 82.5, 'q'),
  glint(72, -54, 11, 'c'), glint(-74, 48, 7, 'k'), circle(-70, -40, 2.6, 'h'),
].join('');

// 등불
E.lantern = () => [
  circle(0, 4, 90, 'd'), ticks(54, 70, 52, 128, 9, 'h', 0, 4, 7), ticks(54, 70, 232, 308, 9, 'h', 0, 4, 7),
  circle(0, -76, 9), line(0, -67, 0, -60),
  path('M-24 -42L-13 -60H13L24 -42Z', 'k'),
  path('M-26 -42H26L33 42H-33Z', 'w'), line(-11, -42, -14, 42, 'h'), line(11, -42, 14, 42, 'h'),
  line(-27.2, -28, 27.2, -28, 'h'), line(-32, 30, 32, 30, 'h'),
  ...[-18, -9, 0, 9, 18].map(x => circle(x, -35, 1.25, 'k') + circle(x * 1.2, 36, 1.25, 'k')),
  circle(0, 6, 21, 'ds'),
  path('M0 26C-15 18 -13 2 0 -22C13 2 15 18 0 26Z', 'c'), path('M0 22C-6 18 -5 10 0 2C5 10 6 18 0 22Z', 'wh'),
  rect(-38, 42, 76, 10, 'k'), line(-33, 47, 33, 47, 'q'), path('M-26 52V59H26V52', 'w'), line(-16, 52, -16, 59, 'h'), line(16, 52, 16, 59, 'h'),
  line(-13, -51, 13, -51, 'q'),
  line(-60, 74, 60, 74, 'h'),
  glint(-64, -56, 9, 'k'), circle(66, -50, 2.6, 'h'),
].join('');

// 혜성
E.comet = () => [
  // 꼬리 — 한 중심을 도는 띠 다섯 줄. 가운데가 가장 길고 바깥으로 갈수록 짧다
  arc(217, -15, -40, 'd', 96, 138), arc(155, -17, -44, 'd', 96, 138),
  streamer(96, 138, 203, 210, -15, -47, 13, 'k'), streamer(96, 138, 162, 169, -15, -51, 13, 'k'),
  arc(198.5, -17, -56, 'h', 96, 138), arc(173.5, -17, -60, 'h', 96, 138),
  circle(-74.1, 35.8, 1.7, 'k'), circle(-58.6, 59.2, 1.7, 'k'),
  streamer(96, 138, 178, 194, -14, -70, 26, 'k'),
  glint(-85, 91, 5.5, 'k'),
  // 머리 — 고리 안의 여덟 갈래 별
  ticks(33, 42, 4, 150, 15, 'h', 54, -43, 4),
  circle(54, -43, 27, 'w'), circle(54, -43, 22.5, 'h'),
  group(glint(0, 0, 14, 'k', 2.4), 'translate(54 -43) rotate(45)'), glint(54, -43, 21, 'k', 3),
  circle(54, -43, 7, 'p'), circle(54, -43, 4.4, 'c'),
  // 곁의 작은 행성과 달
  circle(52, 56, 14, 'w'), path('M40 51Q52 55 65 50', 'h'), path('M39 58Q52 63 66 57', 'h'),
  group(path('M-14.5 -3A26 7 0 1 0 14.5 -3', 'h'), 'translate(52 56) rotate(-18)'),
  crescent(-64, -64, 13), glint(-30, -84, 6, 'k'), circle(88, 22, 2.6, 'h'),
].join('');

// 달맞이꽃
E.bloom = () => [
  circle(0, -26, 76, 'd'),
  path('M0 24C3 52 -4 74 0 102'),
  path('M1 68C19 49 40 51 53 42C49 63 27 76 1 72Z', 'w'), path('M4 69C21 61 36 55 49 45', 'h'), path('M17 63.5L20 55M28 58L33 51.5M38 52.5L43 48M18 63.5L27 68M29 58L38 61', 'h'),
  path('M-4 86.5C-17 80 -31 73 -43 65', 'q'),
  path('M-1 86C-17 69 -36 71 -47 62C-45 83 -25 94 -1 90Z', 'k'),
  ...Array.from({ length: 8 }, (_, i) => petal(64, 10, i * 45 + 22.5, 'w', 0, -26)),
  ...Array.from({ length: 8 }, (_, i) => group(line(0, -44, 0, -58, 'h'), `translate(0 -26) rotate(${i * 45 + 22.5})`)),
  ...Array.from({ length: 8 }, (_, i) => petal(54, 15.5, i * 45, 'w', 0, -26)),
  ...Array.from({ length: 8 }, (_, i) => petal(30, 7.5, i * 45, 'h', 0, -26, 17)),
  ...Array.from({ length: 8 }, (_, i) => group(line(0, -24, 0, -40, 'h') + circle(0, -20, 1.3, 'k'), `translate(0 -26) rotate(${i * 45})`)),
  ...Array.from({ length: 8 }, (_, i) => petal(30, 7.5, i * 45 + 22.5, 'k', 0, -26)),
  circle(0, -26, 11.5, 'w'), circle(0, -26, 5.2, 'c'),
  crescent(76, -82, 11), glint(-80, -74, 8, 'k'), circle(-76, 40, 2.6, 'h'),
].join('');

// 찻잔
E.teacup = () => [
  line(-84, 86, 84, 86, 'h'), line(-60, 93, 60, 93, 'd'),
  ellipse(0, 70, 64, 9.5, 'w'), ellipse(0, 68, 30, 4, 'h'), chain(-50, 72.4, 0, 80.6, 50, 72.4, 13, 1.1),
  path('M40 26C66 20 68 50 33 50'), path('M41 32C56 30 57 44 37 45', 'h'),
  path('M-41 16C-41 50 -23 66 0 66C23 66 41 50 41 16Z', 'w'),
  path('M-40 25C-20 34 20 34 40 25', 'h'), path('M-37 36C-19 44 19 44 37 36', 'h'), chain(-34, 30.5, 0, 42.5, 34, 30.5, 9, 1.3), glint(0, 54, 5.5, 'k'),
  ellipse(0, 16, 41, 7.5, 'w'), ellipse(0, 16.5, 34, 5, 'k'),
  path('M-17 2C-28 -12 -6 -22 -17 -38'), path('M17 2C6 -12 28 -22 17 -38'),
  path('M0 -2C-11 -18 11 -30 0 -48C-5 -57 3 -64 0 -70', 'h'),
  crescent(-36, -62, 12), glint(0, -84, 9, 'k'), glint(36, -60, 8, 'c'),
  circle(62, -28, 2.6, 'h'),
].join('');

// 태엽 달
E.gear = () => [
  arc(92, 208, 332, 'd'), ticks(84, 91, 28, 152, 21, 'h', 0, 0, 3),
  gear(0, -4, 64, 51, 12, 'w'), circle(0, -4, 40, 'h'), beads(45.5, 15, 345, 12, 1.5, 'k', 0, -4),
  ticks(33, 38, 0, 348, 30, 'h', 0, -4, 2.5), crescent(2, -4, 23),
  gear(62, 58, 24, 17.5, 8, 'k'), circle(62, 58, 12, 'q'), circle(62, 58, 6, 'wh'),
  gear(-68, 44, 15, 10.5, 6, 'w'), circle(-68, 44, 6.5, 'h'), circle(-68, 44, 2.6, 'k'),
  glint(-66, -62, 11, 'c'), glint(74, -56, 6.5, 'k'),
].join('');

// 펼친 책
E.book = () => [
  arc(100, -56, 56, 'h'), ticks(100, 107, -56, 56, 15, 'h', 0, 0, 3),
  path('M-84 34V92C-56 84 -22 84 0 98C22 84 56 84 84 92V34C56 28 22 30 0 40C-22 30 -56 28 -84 34Z', 'k'),
  mirror([
    path('M0 32C-20 20 -52 20 -77 28V82C-52 74 -20 74 0 86Z', 'w'),
    ...[0, 1, 2, 3].map(i => path(`M-66 ${37 + i * 10}Q-38 ${30 + i * 10} -11 ${39 + i * 10}`, 'h')),
    path('M-80 88C-54 80 -22 80 -3 92', 'q'),
  ].join('')),
  path('M-4 86V108L0 102.5L4 108V86Z', 'c'),
  chain(-22, 14, -52, -24, -10, -58, 11, 1.2, 5, 2.4), chain(22, 14, 54, -22, 18, -58, 11, 1.2, 5, 2.4),
  crescent(4, -74, 16), glint(0, -14, 14, 'k'), glint(-36, -34, 7.5, 'k'), glint(36, -28, 5.5, 'k'),
  circle(58, -54, 2.6, 'h'), circle(-56, -62, 1.6, 'k'),
].join('');

// 닻
E.anchor = () => [
  circle(0, 6, 88, 'h'), arc(98, -60, 60, 'd', 0, 6), ticks(92, 99, 150, 210, 13, 'h', 0, 6, 3),
  path('M-62 22C-60 68 -27 90 0 90C27 90 60 68 62 22L48 32C45 57 23 72 0 72C-23 72 -45 57 -48 32Z', 'w'),
  path('M-55 29C-52 62 -25 81 0 81C25 81 52 62 55 29', 'h'),
  mirror(path('M-65 8L-79 40L-41 36Z', 'k') + path('M-65 16L-72 34L-50 32', 'q')),
  path('M-5 -56V82H5V-56Z', 'w'),
  rect(-32, -46, 64, 9, 'k'), circle(-33, -41.5, 6, 'k'), circle(33, -41.5, 6, 'k'),
  circle(0, -69, 12, 'w'), circle(0, -69, 6, 'h'), line(-5, 14, 5, 14, 'h'), line(-5, 20, 5, 20, 'h'), line(-5, -28, 5, -28, 'h'), line(-5, -22, 5, -22, 'h'),
  line(-26, -41.5, 26, -41.5, 'q'),
  path('M-50 -6q6 -7 12 0t12 0', 'h'), path('M26 -6q6 -7 12 0t12 0', 'h'), path('M-44 6q5 -6 10 0t10 0', 'h'), path('M24 6q5 -6 10 0t10 0', 'h'),
  glint(-60, -52, 11, 'c'), glint(58, -46, 6.5, 'k'), circle(-84, 60, 2.6, 'h'),
].join('');

const NAMES: Record<string, string> = { window: '달창', water: '달못', moth: '달나방', key: '달열쇠', hourglass: '별 모래시계', lantern: '등불', comet: '혜성', bloom: '달맞이꽃', teacup: '찻잔', gear: '태엽 달', book: '펼친 책', anchor: '닻' };
// 태그 → 엠블럼. 앞쪽 낱말일수록 무겁게 친다.
const RULES: Record<string, string[]> = {
  moth: ['다크', '고딕', '뱀파이어', '악마', '저주', '호러', '피폐', '집착', 'dark', 'horror', 'gothic', 'vampire', 'yandere'],
  key: ['미스터리', '추리', '탐정', '느와르', '비밀', '스릴러', 'mystery', 'noir', 'detective', 'thriller'],
  hourglass: ['회귀', '시간', '환생', '빙의', '역사', '사극', 'time', 'regression', 'historical'],
  lantern: ['판타지', '기사', '기사단', '중세', '용사', '던전', '마왕', 'fantasy', 'knight', 'medieval'],
  comet: ['액션', '배틀', '능력자', '히어로', '소년만화', 'action', 'battle', 'hero'],
  bloom: ['로맨스', '순애', '연애', '달달', '첫사랑', '소꿉친구', 'romance', 'fluff', 'love'],
  teacup: ['일상', '힐링', '카페', '현대', '오피스', '동거', 'slice of life', 'cozy', 'modern', 'office'],
  gear: ['sf', '안드로이드', '로봇', '사이버펑크', '스팀펑크', 'ai', '우주', 'android', 'robot', 'cyberpunk', 'sci-fi'],
  book: ['학원', '학교', '서점', '도서', '마법', '마녀', '마법사', 'school', 'academy', 'witch', 'magic'],
  anchor: ['해적', '바다', '모험', '항해', '인어', '여행', 'pirate', 'sea', 'adventure', 'ocean'],
  water: ['성녀', '신화', '동양', '무협', '선협', '요괴', '신', 'myth', 'wuxia', 'spirit'],
};
/** 태그로 엠블럼을 고른다. 맞는 게 없으면 이름으로 정해 늘 같은 것을 준다 */
const pick = (tags: unknown[] = [], name = '') => {
  const score: Record<string, number> = {};
  for (const t of tags.map(x => String(x).toLowerCase().trim())) for (const [k, words] of Object.entries(RULES)) { const i = words.findIndex(w => t === w || t.includes(w)); if (i >= 0) score[k] = (score[k] || 0) + (i < 4 ? 3 : i < 8 ? 2 : 1); }
  const best = Object.entries(score).sort((a, b) => b[1] - a[1])[0];
  if (best) return best[0];
  const keys = ['window', 'water', 'bloom', 'book', 'teacup', 'lantern']; let hash = 0; for (const ch of name) hash = (hash * 31 + (ch.codePointAt(0) as number)) >>> 0;
  return keys[hash % keys.length];
};
const svg = (kind: string, cls = '') => `<svg class="emb ${cls}" viewBox="-110 -110 220 220" aria-hidden="true">${(E[kind] || E.window)()}</svg>`;
export const Emblems = { svg, pick, NAMES, RULES, kinds: Object.keys(E) };
