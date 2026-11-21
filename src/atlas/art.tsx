// 성좌 도감의 선 그림: 큰 성도 · 별자리 하나 · 한 사람과의 별자리 · 별 한 알. 전부 인라인 SVG 이고 색은 놓인 자리(.fx-night)의 잉크를 따른다
// 별의 밝기는 모양으로 나눈다 — 꺼진 별은 빈 고리, 1등급은 점, 2등급은 고리 두른 점, 3등급은 네 꼭지 섬광
import { useMemo, type KeyboardEvent } from 'react';
import { CONS, MILES } from './defs';
import type { ConDef, StarDef } from './types';

/** 씨앗 있는 난수 (같은 씨앗이면 늘 같은 하늘) */
export function rng(seed: number) { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) | 0; let x = Math.imul(a ^ (a >>> 15), 1 | a); x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x; return ((x ^ (x >>> 14)) >>> 0) / 4294967296; }; }
export const hash = (s: string) => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };
const f1 = (n: number) => +n.toFixed(1);

/** 별의 등급: 단계가 하나뿐인 별은 켜지면 2등급, 마지막 단계는 3등급 */
export const gradeOf = (tier: number, max: number) => !tier ? 0 : tier >= max ? (max === 1 ? 2 : 3) : tier;

/** 별 한 알. k 는 크기 배율 (성도에서는 화면 픽셀, 상자 그림에서는 상자 칸) */
export function StarGlyph({ x, y, grade, k = 1, hidden, gold, hot }: { x: number; y: number; grade: number; k?: number; hidden?: boolean; gold?: boolean; hot?: boolean }) {
  const cls = 'at-star g' + grade + (gold ? ' gold' : '') + (hot ? ' hot' : '');
  if (!grade) return <g className={cls}><circle cx={x} cy={y} r={2 * k} className="at-off" strokeDasharray={hidden ? `${.6 * k} ${1.1 * k}` : undefined} /></g>;
  const L = 7.5 * k, w = .9 * k;
  return <g className={cls}>
    {grade >= 2 && <circle cx={x} cy={y} r={(grade === 3 ? 4.6 : 3.9) * k} className={grade === 3 ? 'h' : 't'} />}
    {grade === 3 && <path className="f" d={`M${f1(x)} ${f1(y - L)}L${f1(x + w)} ${f1(y - w)}L${f1(x + L)} ${f1(y)}L${f1(x + w)} ${f1(y + w)}L${f1(x)} ${f1(y + L)}L${f1(x - w)} ${f1(y + w)}L${f1(x - L)} ${f1(y)}L${f1(x - w)} ${f1(y - w)}Z`} />}
    <circle cx={x} cy={y} r={(grade === 1 ? 1.5 : 1.9) * k} className="f" />
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

const W = 1200, Hh = 760, OX = 600, OY = 980;   // 눈금의 중심은 그림 아래 바깥 — 위도선이 완만한 활로 지나간다
/** 뒤에 깔리는 것: 잔별 · 위도 활 · 경도선 · 테두리 눈금. 한 번만 만든다 */
function Backdrop() {
  const g = useMemo(() => {
    const r = rng(20250), dots: { x: number; y: number; r: number; o: number; tw: boolean }[] = [];
    for (let i = 0; i < 170; i++) dots.push({ x: f1(18 + r() * (W - 36)), y: f1(18 + r() * (Hh - 36)), r: f1(.35 + r() * r() * 1.1), o: f1(.18 + r() * .5), tw: r() < .09 });
    const arcs = [300, 430, 560, 690, 820, 950].map(R => `M${f1(OX - Math.sqrt(Math.max(0, R * R - (OY - Hh) ** 2)))} ${Hh}A${R} ${R} 0 0 1 ${f1(OX + Math.sqrt(Math.max(0, R * R - (OY - Hh) ** 2)))} ${Hh}`);
    const rays: string[] = []; for (let a = -60; a <= 60; a += 10) { const t = a * Math.PI / 180; rays.push(`M${f1(OX + Math.sin(t) * 300)} ${f1(OY - Math.cos(t) * 300)}L${f1(OX + Math.sin(t) * 1100)} ${f1(OY - Math.cos(t) * 1100)}`); }
    let fine = '', bold = ''; for (let x = 20; x <= W - 20; x += 10) { const long = (x - 20) % 50 === 0; (long ? (bold += `M${x} 12v8M${x} ${Hh - 12}v-8`) : (fine += `M${x} 12v4M${x} ${Hh - 12}v-4`)); }
    for (let y = 20; y <= Hh - 20; y += 10) { const long = (y - 20) % 50 === 0; (long ? (bold += `M12 ${y}h8M${W - 12} ${y}h-8`) : (fine += `M12 ${y}h4M${W - 12} ${y}h-4`)); }
    return { dots, arcs, rays, fine, bold };
  }, []);
  return <g aria-hidden="true">
    <g className="at-grid">{g.arcs.map((d, i) => <path key={i} d={d} className="h" />)}{g.rays.map((d, i) => <path key={i} d={d} className="h" />)}
      {/* 황도: 성도를 비스듬히 가로지르는 점선 한 줄 */}
      <path className="d" d={`M12 ${Hh - 150}C340 ${Hh - 330} 800 180 ${W - 12} 250`} /></g>
    {g.dots.map((d, i) => <circle key={i} cx={d.x} cy={d.y} r={d.r} className={'f' + (d.tw ? ' fx-twinkle' : '')} opacity={d.o} style={d.tw ? { ['--d' as string]: `${(i % 7) * .6}s` } : undefined} />)}
    <rect x="12" y="12" width={W - 24} height={Hh - 24} className="t" /><path d={g.fine} className="h" /><path d={g.bold} className="t" />
    <g className="at-scale">{Array.from({ length: 11 }, (_, i) => <text key={i} x={120 + i * 100} y="34" textAnchor="middle">{String((22 - i * 2 + 24) % 24).padStart(2, '0')}h</text>)}
      {['+60°', '+40°', '+20°', '00°', '−20°'].map((s, i) => <text key={s} x="26" y={124 + i * 150}>{s}</text>)}</g>
  </g>;
}

/** 큰 성도. 별자리를 누르면 onPick(id). name 은 별자리 이름, count 는 "3/7" 같은 표시 */
export function Sky({ tiers, sel, onPick, name, starName }: { tiers: Tiers; sel: string | null; onPick: (id: string) => void; name: (c: ConDef) => string; starName: (s: StarDef) => string }) {
  return <svg className="fx-art at-skysvg" viewBox={`0 0 ${W} ${Hh}`} role="group" aria-label="star chart">
    <Backdrop />
    {CONS.map((c, ci) => {
      const pos = new Map(c.stars.map(s => [s.id, place(c, s)])), lit = c.stars.filter(s => tiers(s.id) > 0).length, done = lit === c.stars.length, h = c.s / 2 + 8, on = sel === c.id;
      return <g key={c.id} className={'at-con' + (done ? ' done' : '') + (on ? ' on' : '')} role="button" tabIndex={0} aria-pressed={on} aria-label={`${name(c)} ${lit}/${c.stars.length}`} onClick={() => onPick(c.id)} onKeyDown={keyGo(() => onPick(c.id))}>
        <rect x={c.cx - h} y={c.cy - h} width={h * 2} height={h * 2 + 34} className="at-hit" />
        {/* 고른 별자리: 네 귀의 꺾쇠 */}
        <path className="at-brk t" d={[[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([sx, sy]) => `M${c.cx + sx * h} ${c.cy + sy * h - sy * 10}v${sy * 10}h${-sx * 10}`).join('')} />
        {c.edges.map(([a, b], i) => { const full = tiers(a) > 0 && tiers(b) > 0; return <path key={i} d={seg(pos.get(a)!, pos.get(b)!, 7)} pathLength={full ? 1 : undefined} className={full ? 'at-ln fx-draw' : 'at-ln d'} style={full ? { ['--d' as string]: `${.15 + ci * .08 + i * .09}s` } : undefined} />; })}
        {c.stars.map(s => { const p = pos.get(s.id)!, tr = tiers(s.id); return <g key={s.id}><title>{tr || !s.hidden ? starName(s) : '?????'}</title><StarGlyph x={f1(p[0])} y={f1(p[1])} grade={gradeOf(tr, s.at.length)} k={1.25} hidden={s.hidden} gold={done} /></g>; })}
        <text className="at-cname" x={c.cx} y={c.cy + h + 14} textAnchor="middle">{name(c)}</text>
        <text className="at-cno" x={c.cx} y={c.cy + h + 29} textAnchor="middle">{c.no} · {String(lit).padStart(2, '0')}/{String(c.stars.length).padStart(2, '0')}</text>
      </g>;
    })}
  </svg>;
}

/** 별자리 하나 (100칸 상자). nums 면 별 옆에 번호를 적고, onStar 가 있으면 별마다 초점을 받는다. hot 은 도드라지게 할 별 */
export function ConArt({ con, tiers, nums, hot, onStar, starName, draw = true, k = .72 }: { con: ConDef; tiers: Tiers; nums?: boolean; hot?: string | null; onStar?: (id: string | null) => void; starName?: (s: StarDef) => string; draw?: boolean; /** 별의 크기 — 작은 그림일수록 키운다 */ k?: number }) {
  const pos = new Map(con.stars.map(s => [s.id, [s.x, s.y] as [number, number]])), done = con.stars.every(s => tiers(s.id) > 0);
  return <svg className={'fx-art at-conart' + (done ? ' done' : '') + (k > 1 ? ' sm' : '')} viewBox="-10 -8 120 116" aria-hidden={onStar ? undefined : true}>
    {nums && <g aria-hidden="true"><path className="h" d="M-6 104h112M-6 104v-108" /><path className="h" d={Array.from({ length: 11 }, (_, i) => `M${-6 + i * 11.2} 104v${i % 5 ? 1.6 : 3}`).join('')} /></g>}
    {con.edges.map(([a, b], i) => { const full = tiers(a) > 0 && tiers(b) > 0; return <path key={i} d={seg(pos.get(a)!, pos.get(b)!, 4.2)} pathLength={full && draw ? 1 : undefined} className={full ? 'at-ln' + (draw ? ' fx-draw' : '') : 'at-ln d'} style={full && draw ? { ['--d' as string]: `${.1 + i * .1}s` } : undefined} />; })}
    {con.stars.map((s, i) => {
      const tr = tiers(s.id), g = <StarGlyph x={s.x} y={s.y} grade={gradeOf(tr, s.at.length)} k={k} hidden={s.hidden} gold={done} hot={hot === s.id} />;
      const num = nums ? <text className="at-num" x={s.x + (s.x > 80 ? -6 : 6)} y={s.y - 4.5} textAnchor={s.x > 80 ? 'end' : 'start'}>{String(i + 1).padStart(2, '0')}</text> : null;
      return onStar ? <g key={s.id} className={'at-pick' + (hot === s.id ? ' on' : '')} tabIndex={0} role="img" aria-label={starName ? (tr || !s.hidden ? starName(s) : '?????') : s.id} onFocus={() => onStar(s.id)} onBlur={() => onStar(null)} onMouseEnter={() => onStar(s.id)} onMouseLeave={() => onStar(null)}><circle cx={s.x} cy={s.y} r="7.5" className="at-hit" />{hot === s.id && <circle cx={s.x} cy={s.y} r="6.4" className="d" />}{g}{num}</g> : <g key={s.id}>{g}{num}</g>;
    })}
  </svg>;
}

// ── 한 사람과의 별자리: 이름을 씨앗으로 아홉 점을 놓고, 가장 가까운 것끼리 이어 나무 꼴을 만든다 ──
export interface Shape { pts: [number, number][]; edges: [number, number][] }
const shapes = new Map<string, Shape>();
export function personShape(name: string): Shape {
  const hit = shapes.get(name); if (hit) return hit;
  const r = rng(hash(name || '?')), n = MILES.length, raw: [number, number][] = [];
  // 서로 너무 붙지 않게 놓는다. 한가운데 한 점을 먼저 두면 모양이 한쪽으로 쏠리지 않는다
  raw.push([42 + r() * 16, 42 + r() * 16]);
  for (let tries = 0; raw.length < n && tries < 4000; tries++) { const p: [number, number] = [8 + r() * 84, 8 + r() * 84], min = tries < 2500 ? 21 : 14; if (raw.every(q => Math.hypot(q[0] - p[0], q[1] - p[1]) >= min) && raw.some(q => Math.hypot(q[0] - p[0], q[1] - p[1]) < 46)) raw.push(p); }
  while (raw.length < n) raw.push([10 + r() * 80, 10 + r() * 80]);
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
/** lit[i] = i 번째 마일스톤이 켜졌나. 큰 마일스톤(100일 · 1000마디)은 더 밝은 모양으로 */
export function PersonArt({ name, lit, nums, hot, draw = true, k = .72 }: { name: string; lit: boolean[]; nums?: boolean; hot?: number | null; draw?: boolean; k?: number }) {
  const sh = personShape(name), done = lit.length > 0 && lit.every(Boolean), big = (i: number) => MILES[i].at >= 1000 || (MILES[i].m === 'days' && MILES[i].at >= 100) ? 3 : MILES[i].at > 1 ? 2 : 1;
  return <svg className={'fx-art at-conart' + (done ? ' done' : '') + (k > 1 ? ' sm' : '')} viewBox="-10 -8 120 116" aria-hidden="true">
    {nums && <g><circle cx="50" cy="50" r="56" className="h" /><circle cx="50" cy="50" r="38" className="h" strokeDasharray="1 3" /><path className="h" d="M50 -6v8M50 98v8M-6 50h8M98 50h8" /></g>}
    {sh.edges.map(([a, b], i) => { const full = lit[a] && lit[b]; return <path key={i} d={seg(sh.pts[a], sh.pts[b], 4.2)} pathLength={full && draw ? 1 : undefined} className={full ? 'at-ln' + (draw ? ' fx-draw' : '') : 'at-ln d'} style={full && draw ? { ['--d' as string]: `${.1 + i * .1}s` } : undefined} />; })}
    {sh.pts.map((p, i) => <g key={i}>{hot === i && <circle cx={p[0]} cy={p[1]} r="6.4" className="d" />}<StarGlyph x={p[0]} y={p[1]} grade={lit[i] ? big(i) : 0} k={k} gold={done} hot={hot === i} />{nums && <text className="at-num" x={p[0] + (p[0] > 80 ? -6 : 6)} y={p[1] - 4.5} textAnchor={p[0] > 80 ? 'end' : 'start'}>{String(i + 1).padStart(2, '0')}</text>}</g>)}
  </svg>;
}

/** 빈 자리 그림: 아직 이어지지 않은 별 셋 */
export const EmptyArt = () => <svg className="fx-art" viewBox="0 0 56 56" aria-hidden="true"><path className="d" d="M14 40L27 20M31 19L43 33" /><circle cx="12" cy="43" r="2.2" className="t" /><circle cx="29" cy="17" r="2.2" className="t" /><circle cx="45" cy="36" r="2.2" className="t" /><path className="h" d="M4 52h48" /></svg>;
