// 성좌 도감의 선 그림: 큰 성도 · 별자리 도판 · 한 사람과의 별자리 · 별 한 알. 전부 인라인 SVG 이고 색은 놓인 자리(.fx-night)의 잉크를 따른다
// 옛 성도 판화처럼 — 별을 이은 선 뒤에 그 별자리의 형상(figures.ts)을 아주 가는 선으로 깔고, 켜진 별이 늘수록 형상이 또렷해진다
// 별의 밝기는 모양으로 나눈다: 꺼진 별은 빈 고리와 십자 눈금, 1등급은 짧은 섬광, 2등급은 여덟 갈래, 3등급은 긴 섬광과 옅은 겹고리
import { useId, useMemo, type KeyboardEvent, type ReactNode } from 'react';
import { CONS, MILES } from './defs';
import { arc, curve, dot, figure, poly, rng, rosette, type Fig } from './figures';
import { moonP } from './stat';
import type { ConDef, StarDef } from './types';

export { rng };
export const hash = (s: string) => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };
const f1 = (n: number) => +n.toFixed(1);
const css = (o: Record<string, string>) => o as React.CSSProperties;

/** 별의 등급: 단계가 하나뿐인 별은 켜지면 2등급, 마지막 단계는 3등급 */
export const gradeOf = (tier: number, max: number) => !tier ? 0 : tier >= max ? (max === 1 ? 2 : 3) : tier;

// ── 별 한 알 ──
/** 끝이 가늘어지는 섬광 한 쌍 (가운데가 w 만큼 통통한 마름모) */
const ray = (x: number, y: number, L: number, w: number, deg: number) => {
  const t = deg * Math.PI / 180, c = Math.cos(t), s = Math.sin(t), p = (a: number, b: number) => `${f1(x + a * c - b * s)} ${f1(y + a * s + b * c)}`;
  return `M${p(L, 0)}L${p(0, w)}L${p(-L, 0)}L${p(0, -w)}Z`;
};
/** k 는 크기 배율 (성도에서는 화면 픽셀, 도판에서는 상자 칸). pop 은 차례로 켜질 때의 늦춤(초) */
export function StarGlyph({ x, y, grade, k = 1, hidden, gold, hot, pop }: { x: number; y: number; grade: number; k?: number; hidden?: boolean; gold?: boolean; hot?: boolean; pop?: number }) {
  const cls = 'at-star g' + grade + (gold ? ' gold' : '') + (hot ? ' hot' : '') + (pop != null ? ' at-pop' : ''), st = pop != null ? css({ '--d': pop + 's' }) : undefined;
  if (!grade) {
    // 꺼진 별: 빈 고리와 네 방향의 짧은 눈금 (숨은 별은 점선 고리에 눈금을 비스듬히)
    const a = 3.2 * k, b = 4.9 * k, q = hidden ? .7071 : 1, ticks = hidden
      ? `M${f1(x + a * q)} ${f1(y + a * q)}L${f1(x + b * q)} ${f1(y + b * q)}M${f1(x - a * q)} ${f1(y + a * q)}L${f1(x - b * q)} ${f1(y + b * q)}M${f1(x + a * q)} ${f1(y - a * q)}L${f1(x + b * q)} ${f1(y - b * q)}M${f1(x - a * q)} ${f1(y - a * q)}L${f1(x - b * q)} ${f1(y - b * q)}`
      : `M${f1(x + a)} ${y}H${f1(x + b)}M${f1(x - a)} ${y}H${f1(x - b)}M${x} ${f1(y + a)}V${f1(y + b)}M${x} ${f1(y - a)}V${f1(y - b)}`;
    return <g className={cls} style={st}><circle cx={x} cy={y} r={2 * k} className="at-off" strokeDasharray={hidden ? `${.7 * k} ${.9 * k}` : undefined} /><path d={ticks} className="at-tick" /></g>;
  }
  const L = [0, 5.2, 8.2, 12.5][grade] * k, w = [0, .62, .7, .8][grade] * k;
  const rays = ray(x, y, L, w, 0) + ray(x, y, L * 1.28, w, 90) + (grade >= 2 ? ray(x, y, L * .46, w * .7, 45) + ray(x, y, L * .46, w * .7, 135) : '');
  return <g className={cls} style={st}>
    {hot && <circle cx={x} cy={y} r={10 * k} className="at-flash" />}
    {grade === 3 && <><circle cx={x} cy={y} r={6.6 * k} className="at-halo" /><circle cx={x} cy={y} r={9.4 * k} className="at-halo two" strokeDasharray={`${.5 * k} ${1.3 * k}`} /></>}
    <circle cx={x} cy={y} r={(grade === 1 ? 2.7 : 3.3) * k} className="at-ring" />
    <path className="f at-ray" d={rays} />
    <circle cx={x} cy={y} r={(grade === 1 ? 1.15 : grade === 2 ? 1.45 : 1.75) * k} className="f" />
  </g>;
}

// ── 형상 그림 ──
/** 켜진 별의 비율을 네 단계로: 0 = 아직 없음 · 1 = 절반 미만 · 2 = 절반 이상 · 3 = 완성 */
export const stage = (lit: number, all: number) => !lit ? 0 : lit >= all ? 3 : lit * 2 >= all ? 2 : 1;
/**
 * 형상의 겹들. mode: plate = 큰 도판(상자 칸 굵기, 선이 그려지며 나타난다) · keep = 성도 위(화면 픽셀 굵기) · mid = 중간 크기(빗금 없이) · min = 작은 그림(간추린 윤곽만)
 */
function FigLayers({ fig, p, mode, draw }: { fig: Fig; p: number; mode: 'plate' | 'keep' | 'mid' | 'min'; draw?: boolean }) {
  const go = !!draw && mode === 'plate' && p > 0, dr = (d: number) => go ? { pathLength: 1, className: ' at-draw', style: css({ '--d': d + 's' }) } : { pathLength: undefined, className: '', style: undefined };
  const o = dr(.05), t = dr(.7), a = dr(1.2), fade = go ? ' at-fade' : '';
  if (mode === 'min') return <g className={`at-fig p${p} ${mode}`} aria-hidden="true"><path d={fig.m} className="fo" /><path d={fig.a} className="fa" /></g>;
  return <g className={`at-fig p${p} ${mode}`} aria-hidden="true">
    {mode !== 'mid' && <path d={fig.h} className={'fh' + fade} style={go ? css({ '--d': '1.5s' }) : undefined} />}
    <path d={fig.t} className={'ft' + t.className} pathLength={t.pathLength} style={t.style} />
    <path d={fig.o} className={'fo' + o.className} pathLength={o.pathLength} style={o.style} />
    <path d={fig.a} className={'fa' + a.className} pathLength={a.pathLength} style={a.style} />
    <path d={fig.s} className={'fs' + fade} style={go ? css({ '--d': '1.3s' }) : undefined} />
  </g>;
}

/** 두 별 사이의 선: 별에 닿지 않게 양 끝을 조금 띄운다 */
function seg(a: [number, number], b: [number, number], gap: number) {
  const dx = b[0] - a[0], dy = b[1] - a[1], d = Math.hypot(dx, dy) || 1, ux = dx / d, uy = dy / d, g = Math.min(gap, d / 3);
  return `M${f1(a[0] + ux * g)} ${f1(a[1] + uy * g)}L${f1(b[0] - ux * g)} ${f1(b[1] - uy * g)}`;
}
/** 성도 위의 자리: 상자 안 좌표를 별자리의 크기 · 기울기 · 자리로 옮긴다 */
export function place(c: ConDef, s: { x: number; y: number }): [number, number] {
  const r = c.rot * Math.PI / 180, x = (s.x - 50) * c.s / 100, y = (s.y - 50) * c.s / 100;
  return [c.cx + x * Math.cos(r) - y * Math.sin(r), c.cy + x * Math.sin(r) + y * Math.cos(r)];
}
type Tiers = (id: string) => number;
const keyGo = (fn: () => void) => (e: KeyboardEvent) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fn(); } };

// ════════ 큰 성도 ════════
const W = 1200, Hh = 760, IN = 24, OX = 600, OY = 1160;   // 격자의 극은 그림 아래 바깥 — 위도선은 완만한 활, 경도선은 부챗살
/** 성도 좌표: 극에서의 거리 R 과 방위 a(도, 0 = 정북) */
const pol = (R: number, a: number): [number, number] => { const t = a * Math.PI / 180; return [OX + Math.sin(t) * R, OY - Math.cos(t) * R]; };
/** 은하수의 중심선: 왼쪽 위에서 오른쪽 아래로 흐르는 완만한 S */
const milky = (t: number): [number, number] => { const u = 1 - t; return [u * u * u * 40 + 3 * u * u * t * 420 + 3 * u * t * t * 700 + t * t * t * 1170, u * u * u * 90 + 3 * u * u * t * 250 + 3 * u * t * t * 470 + t * t * t * 700]; };

/** 뒤에 깔리는 것: 격자 · 은하수 · 잔별 · 황도 · 테두리와 눈금 띠 · 네 귀 장식. 한 번만 만들고, 요소 수를 줄이려고 종류마다 path 한 줄로 모은다 */
function Backdrop() {
  const uid = useId().replace(/[^a-z0-9]/gi, '');
  const g = useMemo(() => {
    const r = rng(20261), gauss = () => (r() + r() + r() + r() - 2) / 2;
    // 격자: 위도 활은 35 칸(=5°)마다 가는 선, 70 칸(=10°)마다 조금 굵게. 경도 부챗살은 5°마다, 15°(=1시간)마다 굵게
    let fineG = '', boldG = ''; const decs: { y: number; label: string }[] = [], ras: { x: number; label: string }[] = [];
    for (let R = 425, i = 0; R <= 1300; R += 35, i++) {
      const a = Math.min(64, Math.atan2(W / 2 + 10, Math.max(1, OY - Hh)) * 180 / Math.PI + 4), d = curve(arc(OX, OY, R, R, -90 - a, -90 + a, 26)), major = i % 2 === 1;
      if (major) boldG += d; else fineG += d;
      const dx = OX - IN, yy = R > dx ? OY - Math.sqrt(R * R - dx * dx) : -1;
      if (major && yy > IN + 30 && yy < Hh - IN - 20) decs.push({ y: yy, label: `${(i - 11) * 5 >= 0 ? '+' : '−'}${String(Math.abs((i - 11) * 5)).padStart(2, '0')}°` });
    }
    for (let a = -60; a <= 60; a += 5) {
      const d = poly([pol(410, a), pol(1320, a)]); if (a % 15 === 0) boldG += d; else fineG += d;
      const x = OX + Math.tan(a * Math.PI / 180) * (OY - IN); if (x > IN + 40 && x < W - IN - 40) { const min = 12 * 60 - a * 4, h = Math.floor(min / 60), m = min % 60; ras.push({ x, label: `${String(h).padStart(2, '0')}h${String(m).padStart(2, '0')}` }); }
    }
    // 은하수: 중심선 둘레에 흩뿌린 점. 밀도와 너비가 굽이마다 달라지고, 한가운데에 어두운 틈이 한 줄 지나간다
    let mw1 = '', mw2 = '';
    for (let i = 0; i < 1500; i++) {
      const t = r(), [cx, cy] = milky(t), [nx, ny] = milky(Math.min(1, t + .01)), tx = nx - cx, ty = ny - cy, tl = Math.hypot(tx, ty) || 1;
      const wide = 34 + 26 * Math.sin(t * 9.4 + 1) + 16 * Math.sin(t * 23), dens = .55 + .45 * Math.sin(t * 13 + 2) * Math.sin(t * 5.3);
      if (r() > dens) continue;
      const off = gauss() * wide; if (Math.abs(off - 6 * Math.sin(t * 30)) < 5 && t > .2 && t < .85 && r() < .8) continue;
      const x = cx - ty / tl * off + gauss() * 5, y = cy + tx / tl * off + gauss() * 5; if (x < IN + 3 || x > W - IN - 3 || y < IN + 3 || y > Hh - IN - 3) continue;
      if (r() < .78) mw1 += dot(x, y); else mw2 += dot(x, y);
    }
    // 잔별 세 등급: 작은 것이 가장 많고, 은하수 가까이에 더 모인다
    const st = ['', '', '']; const big: [number, number][] = [];
    for (let i = 0; i < 520; i++) {
      let x: number, y: number;
      if (r() < .42) { const [cx, cy] = milky(r()); x = cx + gauss() * 110; y = cy + gauss() * 110; } else { x = r() * W; y = r() * Hh; }
      if (x < IN + 4 || x > W - IN - 4 || y < IN + 4 || y > Hh - IN - 4) continue;
      const m = r(), k = m < .72 ? 0 : m < .95 ? 1 : 2; st[k] += dot(x, y); if (k === 2 && big.length < 9) big.push([x, y]);
    }
    // 테두리: 바깥 한 줄 · 눈금 띠 · 안쪽 굵은 줄 · 그 안의 가는 줄
    let tk = '', tkL = '';
    for (let x = IN; x <= W - IN; x += 8) { const L = (x - IN) % 40 === 0; (L ? (tkL += `M${x} ${IN}v-9M${x} ${Hh - IN}v9`) : (tk += `M${x} ${IN}v-5M${x} ${Hh - IN}v5`)); }
    for (let y = IN; y <= Hh - IN; y += 8) { const L = (y - IN) % 40 === 0; (L ? (tkL += `M${IN} ${y}h-9M${W - IN} ${y}h9`) : (tk += `M${IN} ${y}h-5M${W - IN} ${y}h5`)); }
    // 네 귀: 작은 방위 장미 (고리 둘과 여덟 살)
    let rose = '', roseF = '';
    for (const [x, y] of [[IN, IN], [W - IN, IN], [W - IN, Hh - IN], [IN, Hh - IN]]) {
      rose += curve(arc(x, y, 13, 13, 0, 360, 20), true) + curve(arc(x, y, 8.6, 8.6, 0, 360, 16), true);
      roseF += ray(x, y, 12.4, 1.7, 0) + ray(x, y, 12.4, 1.7, 90) + ray(x, y, 7.6, 1.2, 45) + ray(x, y, 7.6, 1.2, 135);
    }
    // 황도: 완만한 활과 5°쯤마다의 잔눈금
    const ecl = arc(OX, OY + 520, 1380, 1380, -116, -64, 40), eclD = curve(ecl); let eclT = '';
    ecl.forEach(([x, y], i) => { if (i % 2) return; const dx = x - OX, dy = y - (OY + 520), l = Math.hypot(dx, dy); eclT += `M${f1(x)} ${f1(y)}l${f1(dx / l * (i % 8 ? 4 : 7))} ${f1(dy / l * (i % 8 ? 4 : 7))}`; });
    return { fineG, boldG, decs, ras, mw1, mw2, st, big, tk, tkL, rose, roseF, eclD, eclT };
  }, []);
  return <g aria-hidden="true">
    <defs><clipPath id={uid + 'c'}><rect x={IN} y={IN} width={W - IN * 2} height={Hh - IN * 2} /></clipPath><path id={uid + 'e'} d={g.eclD} /></defs>
    <g clipPath={`url(#${uid}c)`}>
      <path d={g.fineG} className="at-g1" /><path d={g.boldG} className="at-g2" />
      <path d={g.mw1} className="at-mw" /><path d={g.mw2} className="at-mw two" />
      <path d={g.eclD} className="at-ecl" /><path d={g.eclT} className="at-g2" />
      <text className="at-scale at-eclt" dy="-7"><textPath href={`#${uid}e`} startOffset="71%">ECLIPTICA</textPath></text>
      <path d={g.st[0]} className="at-fs s0" /><path d={g.st[1]} className="at-fs s1" /><path d={g.st[2]} className="at-fs s2" />
      {g.big.map(([x, y], i) => <path key={i} className={'at-spark' + (i % 3 === 0 ? ' fx-twinkle' : '')} style={css({ '--d': `${i * .7}s`, '--t': `${5 + i % 3}s` })} d={ray(x, y, 4.6, .5, 0) + ray(x, y, 6, .5, 90)} />)}
    </g>
    <rect x="7" y="7" width={W - 14} height={Hh - 14} className="at-f1" /><rect x={IN} y={IN} width={W - IN * 2} height={Hh - IN * 2} className="at-f3" /><rect x={IN + 4} y={IN + 4} width={W - IN * 2 - 8} height={Hh - IN * 2 - 8} className="at-f1" />
    <path d={g.tk} className="at-f0" /><path d={g.tkL} className="at-f1" />
    <g className="at-rose"><path d={[[IN, IN], [W - IN, IN], [W - IN, Hh - IN], [IN, Hh - IN]].map(([x, y]) => curve(arc(x, y, 13, 13, 0, 360, 20), true)).join('')} className="at-rosebg" /><path d={g.rose} className="at-f1" /><path d={g.roseF} className="at-rosef" /></g>
    <g className="at-scale">{g.ras.map(a => <text key={a.label} x={f1(a.x)} y={IN + 22} textAnchor="middle">{a.label}</text>)}{g.decs.map(d => <text key={d.label} x={IN + 12} y={f1(d.y - 5)}>{d.label}</text>)}</g>
  </g>;
}

/** 카르투슈: 장식 틀 안의 제목 · 별 등급 범례 · 눈금자 · 오늘의 달 */
function Cartouche({ title, lit, total }: { title: string; lit: number; total: number }) {
  const x = 962, y = 584, w = 206, h = 140, c = 9, frame = (i: number) => `M${x + i + c} ${y + i}H${x + w - i - c}l${c} ${c}V${y + h - i - c}l${-c} ${c}H${x + i + c}l${-c} ${-c}V${y + i + c}Z`;
  const p = moonP(Date.now()), mx = x + w - 30, my = y + 30, rx = Math.abs(Math.cos(2 * Math.PI * p)) * 9, wax = p < .5, gib = p > .25 && p < .75;
  const moon = `M${mx} ${my - 9}A9 9 0 0 ${wax ? 1 : 0} ${mx} ${my + 9}A${f1(rx)} 9 0 0 ${wax ? (gib ? 1 : 0) : (gib ? 0 : 1)} ${mx} ${my - 9}Z`;
  let ruler = ''; for (let i = 0; i <= 20; i++) ruler += `M${x + 22 + i * 7} ${y + h - 20}v${i % 10 === 0 ? -8 : i % 5 === 0 ? -6 : -3.5}`;
  return <g className="at-cart2" aria-hidden="true">
    <path d={frame(0)} className="at-cartbg" /><path d={frame(0)} className="at-f3" /><path d={frame(4)} className="at-f1" />
    <path d={[[x + c, y + c], [x + w - c, y + c], [x + w - c, y + h - c], [x + c, y + h - c]].map(([a, b]) => dot(a, b)).join('')} className="at-fs s2" />
    <text className="at-ctitle" x={x + 20} y={y + 32}>{title}</text>
    <text className="at-scale" x={x + 20} y={y + 50}>{String(lit).padStart(2, '0')} / {String(total).padStart(2, '0')}</text>
    <circle cx={mx} cy={my} r="9" className="at-f1" /><path d={moon} className="at-moonf" /><circle cx={mx} cy={my} r="12.5" className="at-f0" strokeDasharray="1 3" />
    <path d={`M${x + 16} ${y + 60}H${x + w - 16}`} className="at-f1" />
    {[0, 1, 2, 3].map(gr => <g key={gr}><StarGlyph x={x + 32 + gr * 47} y={y + 80} grade={gr} k={gr === 3 ? .8 : .95} /><text className="at-scale" x={x + 32 + gr * 47} y={y + 104} textAnchor="middle">{['—', 'I', 'II', 'III'][gr]}</text></g>)}
    <path d={`M${x + 22} ${y + h - 20}h140`} className="at-f1" /><path d={ruler} className="at-f1" />
  </g>;
}

/** 별자리의 경계: 상자를 조금 넓혀 두 귀를 계단처럼 깎은 점선 (별자리마다 깎이는 귀가 다르다) */
function boundary(c: ConDef, i: number) {
  const r = rng(77 + i * 13), h = c.s / 2 + 16, x0 = c.cx - h, x1 = c.cx + h, y0 = c.cy - h, y1 = c.cy + h + 30, n = () => 14 + Math.floor(r() * 22), a = n(), b = n(), e = n(), k = Math.floor(r() * 4);
  const P: [number, number][][] = [[[x0, y0 + a], [x0 + b, y0 + a], [x0 + b, y0]], [[x1 - b, y0], [x1 - b, y0 + a], [x1, y0 + a]], [[x1, y1 - e], [x1 - a, y1 - e], [x1 - a, y1]], [[x0 + e, y1], [x0 + e, y1 - b], [x0, y1 - b]]];
  const corner = (j: number): [number, number][] => j === k || j === (k + 2) % 4 ? P[j] : [[[x0, y0], [x1, y0], [x1, y1], [x0, y1]][j] as [number, number]];
  return poly([0, 1, 2, 3].flatMap(corner), true);
}

/** 큰 성도. 별자리를 누르면 onPick(id) */
export function Sky({ tiers, sel, onPick, name, starName, title }: { tiers: Tiers; sel: string | null; onPick: (id: string) => void; name: (c: ConDef) => string; starName: (s: StarDef) => string; title: string }) {
  const bounds = useMemo(() => CONS.map(boundary).join(''), []), all = CONS.flatMap(c => c.stars), lit = all.filter(s => tiers(s.id) > 0).length;
  return <svg className="at-skysvg" viewBox={`0 0 ${W} ${Hh}`} role="group" aria-label={title}>
    <Backdrop />
    <path d={bounds} className="at-bound" aria-hidden="true" />
    {CONS.map((c, ci) => {
      const pos = new Map(c.stars.map(s => [s.id, place(c, s)])), n = c.stars.filter(s => tiers(s.id) > 0).length, done = n === c.stars.length, h = c.s / 2 + 8, on = sel === c.id, fig = figure(c.id);
      return <g key={c.id} className={'at-con' + (done ? ' done' : '') + (on ? ' on' : '')} role="button" tabIndex={0} aria-pressed={on} aria-label={`${name(c)} ${n}/${c.stars.length}`} onClick={() => onPick(c.id)} onKeyDown={keyGo(() => onPick(c.id))}>
        <rect x={c.cx - h} y={c.cy - h} width={h * 2} height={h * 2 + 38} className="at-hit" />
        <path className="at-brk" d={[[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([sx, sy]) => `M${c.cx + sx * h} ${c.cy + sy * h - sy * 12}v${sy * 12}h${-sx * 12}`).join('')} />
        {fig && <g transform={`translate(${c.cx} ${c.cy}) rotate(${c.rot}) scale(${c.s / 100}) translate(-50 -50)`}><FigLayers fig={fig} p={stage(n, c.stars.length)} mode="keep" /></g>}
        {c.edges.map(([a, b], i) => { const full = tiers(a) > 0 && tiers(b) > 0; return <path key={i} d={seg(pos.get(a)!, pos.get(b)!, 8)} pathLength={full ? 1 : undefined} className={full ? 'at-ln fx-draw' : 'at-ln off'} style={full ? css({ '--d': `${.15 + ci * .08 + i * .09}s` }) : undefined} />; })}
        {c.stars.map(s => { const p = pos.get(s.id)!, tr = tiers(s.id); return <g key={s.id}><title>{tr || !s.hidden ? starName(s) : '?????'}</title><StarGlyph x={f1(p[0])} y={f1(p[1])} grade={gradeOf(tr, s.at.length)} k={1.12} hidden={s.hidden} gold={done} /></g>; })}
        <text className="at-cname" x={c.cx} y={c.cy + h + 17} textAnchor="middle">{name(c)}</text>
        <text className="at-cno" x={c.cx} y={c.cy + h + 34} textAnchor="middle">{c.no} · {String(n).padStart(2, '0')}/{String(c.stars.length).padStart(2, '0')}</text>
      </g>;
    })}
    <Cartouche title={title} lit={lit} total={all.length} />
  </svg>;
}

// ════════ 도판: 별자리 하나 ════════
/** 도판 위의 한 점 */
interface Pt { key: string; x: number; y: number; grade: number; hidden?: boolean; label?: string; aria?: string }
type Size = 'plate' | 'mid' | 'min';
/** 글자 너비 어림 (상자 칸): 한글 · 한자는 넓고 라틴 글자는 좁다 */
const textW = (s: string, fs: number) => [...s].reduce((n, ch) => n + (ch.charCodeAt(0) > 0x2e7f ? fs : fs * .58), 0);
const VB = { plate: [-27, -11, 154, 122], mid: [-7, -7, 114, 114], min: [-7, -7, 114, 114] } as const, FS = 4.3;
/** 별 옆 이름표: 가는 인출선을 비스듬히 뽑아 옆으로 꺾고, 그 끝에 작은 글자. 자리가 모자란 쪽이면 반대로 뻗는다 */
function Callouts({ pts, hot }: { pts: Pt[]; hot: number | null }) {
  const cy = pts.reduce((n, p) => n + p.y, 0) / (pts.length || 1), cx = pts.reduce((n, p) => n + p.x, 0) / (pts.length || 1), x0 = VB.plate[0] + 2, x1 = VB.plate[0] + VB.plate[2] - 2;
  return <g className="at-call" aria-hidden="true">{pts.map((p, i) => {
    const no = String(i + 1).padStart(2, '0'), txt = p.label ? `${no} ${p.label}` : no, w = textW(txt, FS), up = p.y <= cy ? -1 : 1;
    let side = p.x >= cx ? 1 : -1; if (side > 0 ? p.x + 9 + w > x1 : p.x - 9 - w < x0) side = -side;
    const ex = p.x + side * 5.2, ey = p.y + up * 5.2, tx = ex + side * 2.6;
    return <g key={p.key} className={hot === i ? 'on' : ''}><path d={`M${f1(p.x + side * 2.5)} ${f1(p.y + up * 2.5)}L${f1(ex)} ${f1(ey)}H${f1(tx)}`} className="at-lead" /><text x={f1(tx + side * 1.1)} y={f1(ey + FS * .34)} textAnchor={side > 0 ? 'start' : 'end'}>{txt}</text></g>;
  })}</g>;
}
/** 도판의 눈금 틀: 네 변의 잔눈금과 귀의 꺾쇠 */
const plateFrame = (() => {
  const [x, y, w, h] = VB.plate, a = x + 3, b = y + 3, c = x + w - 3, d = y + h - 3; let t = '';
  for (let i = 0; i <= 37; i++) { const X = a + (c - a) * i / 37, L = i % 5 === 0 ? 2.2 : 1.1; t += `M${f1(X)} ${b}v${L}M${f1(X)} ${d}v${-L}`; }
  for (let i = 0; i <= 29; i++) { const Y = b + (d - b) * i / 29, L = i % 5 === 0 ? 2.2 : 1.1; t += `M${a} ${f1(Y)}h${L}M${c} ${f1(Y)}h${-L}`; }
  return { ticks: t, box: `M${a} ${b}H${c}V${d}H${a}Z` };
})();
/** 별자리 · 개인 별자리가 함께 쓰는 판: 형상 → 잇는 선 → 별 → 이름표 */
function Chart({ fig, pts, edges, size, hot, onStar, draw = true, k, done, children }: { fig: Fig | null; pts: Pt[]; edges: [number, number][]; size: Size; hot: number | null; onStar?: (i: number | null) => void; draw?: boolean; k?: number; done: boolean; children?: ReactNode }) {
  const big = size === 'plate', lit = pts.filter(p => p.grade > 0).length, kk = k ?? (big ? .62 : size === 'mid' ? 1.05 : 1.5), vb = VB[size], go = draw && big;
  return <svg className={`at-conart ${size}` + (done ? ' done' : '')} viewBox={vb.join(' ')} aria-hidden={onStar ? undefined : true}>
    {big && <g aria-hidden="true"><path d={plateFrame.box} className="at-f1" /><path d={plateFrame.ticks} className="at-f1" /></g>}
    {children}
    {fig && <FigLayers fig={fig} p={stage(lit, pts.length)} mode={big ? 'plate' : size} draw={draw} />}
    {edges.map(([a, b], i) => { const full = pts[a].grade > 0 && pts[b].grade > 0; return <path key={i} d={seg([pts[a].x, pts[a].y], [pts[b].x, pts[b].y], big ? 3.4 : 5)} pathLength={full && go ? 1 : undefined} className={full ? 'at-ln' + (go ? ' fx-draw' : '') : 'at-ln off'} style={full && go ? css({ '--d': `${1.5 + i * .12}s` }) : undefined} />; })}
    {pts.map((p, i) => {
      const g = <StarGlyph x={p.x} y={p.y} grade={p.grade} k={kk} hidden={p.hidden} gold={done} hot={hot === i} pop={go && p.grade ? 1.2 + i * .13 : undefined} />;
      return onStar ? <g key={p.key} className={'at-pick' + (hot === i ? ' on' : '')} tabIndex={0} role="img" aria-label={p.aria || p.key} onFocus={() => onStar(i)} onBlur={() => onStar(null)} onMouseEnter={() => onStar(i)} onMouseLeave={() => onStar(null)}><circle cx={p.x} cy={p.y} r="6.5" className="at-hit" />{hot === i && <circle cx={p.x} cy={p.y} r="6" className="at-aim" />}{g}</g> : <g key={p.key}>{g}</g>;
    })}
    {big && <Callouts pts={pts} hot={hot} />}
  </svg>;
}

/** 별자리 하나. size: plate = 이름표가 붙는 큰 도판 · mid = 카드용(빗금 없는 형상) · min = 작은 그림(간추린 윤곽). hot 은 도드라지게 할 별 */
export function ConArt({ con, tiers, size = 'min', hot, onStar, starName, draw = true, k }: { con: ConDef; tiers: Tiers; size?: Size; hot?: string | null; onStar?: (id: string | null) => void; starName?: (s: StarDef) => string; draw?: boolean; k?: number }) {
  const pts: Pt[] = con.stars.map(s => { const tr = tiers(s.id), nm = starName && (tr || !s.hidden) ? starName(s) : ''; return { key: s.id, x: s.x, y: s.y, grade: gradeOf(tr, s.at.length), hidden: s.hidden, label: nm, aria: nm || '?????' }; });
  const ix = new Map(con.stars.map((s, i) => [s.id, i])), hi = hot ? ix.get(hot) ?? null : null;
  return <Chart fig={figure(con.id)} pts={pts} edges={con.edges.map(([a, b]) => [ix.get(a)!, ix.get(b)!])} size={size} hot={hi} onStar={onStar ? i => onStar(i == null ? null : con.stars[i].id) : undefined} draw={draw} k={k} done={pts.every(p => p.grade > 0)} />;
}

// ── 한 사람과의 별자리: 이름을 씨앗으로 아홉 점을 놓고, 가장 가까운 것끼리 이어 나무 꼴을 만든다. 뒤에는 이름에서 나온 무늬 ──
export interface Shape { pts: [number, number][]; edges: [number, number][] }
const shapes = new Map<string, Shape>();
export function personShape(name: string): Shape {
  const hit = shapes.get(name); if (hit) return hit;
  const r = rng(hash(name || '?')), n = MILES.length, raw: [number, number][] = [], ok = (p: [number, number]) => Math.hypot(p[0] - 50, p[1] - 50) < 38;
  // 눈금 고리 안에, 서로 너무 붙지 않게 놓는다. 한가운데 가까이 한 점을 먼저 두면 모양이 한쪽으로 쏠리지 않는다
  raw.push([44 + r() * 12, 44 + r() * 12]);
  for (let tries = 0; raw.length < n && tries < 5000; tries++) { const p: [number, number] = [10 + r() * 80, 10 + r() * 80], min = tries < 3000 ? 19 : 13; if (ok(p) && raw.every(q => Math.hypot(q[0] - p[0], q[1] - p[1]) >= min) && raw.some(q => Math.hypot(q[0] - p[0], q[1] - p[1]) < 40)) raw.push(p); }
  while (raw.length < n) raw.push([28 + r() * 44, 28 + r() * 44]);
  // 가장 가까운 점부터 잇는 나무 (프림) — 이은 순서가 곧 마일스톤의 순서라, 켜지는 별이 늘 이미 켜진 별 옆에서 자란다
  const start = raw.reduce((b, p, i) => p[0] + p[1] * .3 < raw[b][0] + raw[b][1] * .3 ? i : b, 0), order = [start], links: [number, number][] = [];
  while (order.length < n) {
    let best = [-1, -1], bd = 1e9;
    for (const a of order) for (let b = 0; b < n; b++) if (!order.includes(b)) { const d = Math.hypot(raw[a][0] - raw[b][0], raw[a][1] - raw[b][1]); if (d < bd) { bd = d; best = [a, b]; } }
    order.push(best[1]); links.push([order.indexOf(best[0]), order.length - 1]);
  }
  const out: Shape = { pts: order.map(i => [f1(raw[i][0]), f1(raw[i][1])]), edges: links };
  shapes.set(name, out); return out;
}
const roses = new Map<string, Fig>();
const roseOf = (name: string) => { let f = roses.get(name); if (!f) { f = rosette(hash(name || '?')); roses.set(name, f); } return f; };
/** lit[i] = i 번째 마일스톤이 켜졌나. 큰 마일스톤(100일 · 1000마디)은 더 밝은 모양으로. labels 는 도판에 붙일 이름 */
export function PersonArt({ name, lit, size = 'min', hot, draw = true, labels, onStar, k }: { name: string; lit: boolean[]; size?: Size; hot?: number | null; draw?: boolean; labels?: string[]; onStar?: (i: number | null) => void; k?: number }) {
  const sh = personShape(name), big = (i: number) => MILES[i].at >= 1000 || (MILES[i].m === 'days' && MILES[i].at >= 100) ? 3 : MILES[i].at > 1 ? 2 : 1;
  const pts: Pt[] = sh.pts.map((p, i) => ({ key: MILES[i].id, x: p[0], y: p[1], grade: lit[i] ? big(i) : 0, label: labels?.[i], aria: labels?.[i] }));
  return <Chart fig={roseOf(name)} pts={pts} edges={sh.edges} size={size} hot={hot ?? null} onStar={onStar} draw={draw} k={k} done={lit.length > 0 && lit.every(Boolean)} />;
}

/** 빈 자리 그림: 아직 이어지지 않은 별 셋 */
export const EmptyArt = () => <svg className="fx-art" viewBox="0 0 56 56" aria-hidden="true"><path className="d" d="M14 40L27 20M31 19L43 33" /><circle cx="12" cy="43" r="2.2" className="t" /><circle cx="29" cy="17" r="2.2" className="t" /><circle cx="45" cy="36" r="2.2" className="t" /><path className="h" d="M9 43h-3M15 43h3M12 40v-3M12 46v3M29 13v-3M29 21v3M49 36h3M41 36h-3" /><path className="h" d="M4 52h48" /></svg>;
