// 주사위: 실제 다면체를 캔버스에 3D 로 그려 굴린다 (외부 라이브러리 없음. 옛 js/dice3d.js)
import { useEffect, useRef, useState } from 'react';
import { Icon } from '../kit';
import { B } from './bridge';
import type { Msg } from './types';

type V3 = [number, number, number];
type M3 = [V3, V3, V3];
const PHI = (1 + Math.sqrt(5)) / 2;
const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]], add = (a: V3, b: V3): V3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]], mul = (a: V3, k: number): V3 => [a[0] * k, a[1] * k, a[2] * k];
const dot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2], cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const len = (a: V3) => Math.hypot(a[0], a[1], a[2]), norm = (a: V3) => mul(a, 1 / (len(a) || 1));
const mmul = (A: M3, Bm: M3): M3 => A.map(r => [0, 1, 2].map(j => r[0] * Bm[0][j] + r[1] * Bm[1][j] + r[2] * Bm[2][j]) as V3) as M3;
const mapply = (M: M3, v: V3): V3 => [dot(M[0], v), dot(M[1], v), dot(M[2], v)];
const axisRot = (ax: V3, t: number): M3 => { const [x, y, z] = norm(ax), c = Math.cos(t), s = Math.sin(t), k = 1 - c; return [[c + x * x * k, x * y * k - z * s, x * z * k + y * s], [y * x * k + z * s, c + y * y * k, y * z * k - x * s], [z * x * k - y * s, z * y * k + x * s, c + z * z * k]]; };

// 꼭짓점 목록
const signs = (n: number) => { const out: number[][] = []; for (let i = 0; i < 1 << n; i++) out.push(Array.from({ length: n }, (_, k) => (i >> k & 1 ? 1 : -1))); return out; };
const signs3 = () => signs(3) as V3[];
// n각 엇쌍뿔: 면이 2n 개인 연 모양 주사위 (10면체의 일반형). 짝수 면이면 무엇이든 만들 수 있다
function trap(n: number): V3[] { const H = n <= 5 ? 1.05 : Math.min(1.5, 1.05 + (n - 5) * 0.03), c = (1 - Math.cos(Math.PI / n)) / (1 + Math.cos(Math.PI / n)) * H, v: V3[] = [[0, 0, H], [0, 0, -H]]; for (let k = 0; k < n; k++) { const a = k * 2 * Math.PI / n; v.push([Math.cos(a), Math.sin(a), c], [Math.cos(a + Math.PI / n), Math.sin(a + Math.PI / n), -c]); } return v; }
// n각 기둥: 옆면이 n 개인 굴림막대 주사위 (홀수 면)
function prism(n: number): V3[] { const r = n === 3 ? 0.62 : 0.56, v: V3[] = []; for (let k = 0; k < n; k++) { const a = k * 2 * Math.PI / n; v.push([1, r * Math.cos(a), r * Math.sin(a)], [-1, r * Math.cos(a), r * Math.sin(a)]); } return v; }
const dodeca = (): V3[] => [...signs3(), ...signs(2).flatMap(([a, b]): V3[] => [[0, a / PHI, b * PHI], [a / PHI, b * PHI, 0], [a * PHI, 0, b / PHI]])];
const VERTS: Record<string, V3[]> = {
  4: [[1, 1, 1], [1, -1, -1], [-1, 1, -1], [-1, -1, 1]],
  6: signs3(),
  8: [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]],
  10: trap(5),
  12: dodeca(),
  20: signs(2).flatMap(([a, b]): V3[] => [[0, a, b * PHI], [a, b * PHI, 0], [a * PHI, 0, b]]),
  30: [...dodeca(), ...signs(2).flatMap(([a, b]): V3[] => [[0, a * PHI, b], [a * PHI, b, 0], [b, 0, a * PHI]])],   // 마름모 30면체
  2: Array.from({ length: 28 }, (_, i): V3 => { const a = (i >> 1) * 2 * Math.PI / 14; return [Math.cos(a), Math.sin(a), i & 1 ? 0.13 : -0.13]; }),
};
interface Face { n: V3; c: V3; X: V3; Y: V3; ring: number[]; inr: number; area: number; side: boolean }
// 볼록 다면체의 면 찾기: 모든 꼭짓점이 한쪽에 놓이는 평면을 모은다
function build(key: string) {
  const odd = key[0] === 'p';
  let V = VERTS[key] || (odd ? prism(+key.slice(1)) : trap(+key.slice(1))); const R = Math.max(...V.map(len)); V = V.map(v => mul(v, 1 / R));
  const seen = new Set<string>(), faces: Face[] = [], EPS = 1e-6;
  for (let i = 0; i < V.length; i++) for (let j = i + 1; j < V.length; j++) for (let k = j + 1; k < V.length; k++) {
    let n = cross(sub(V[j], V[i]), sub(V[k], V[i])); if (len(n) < EPS) continue; n = norm(n);
    const d = dot(n, V[i]), side = V.map(v => dot(n, v) - d);
    if (side.some(s => s > EPS) && side.some(s => s < -EPS)) continue;
    if (side.some(s => s > EPS)) n = mul(n, -1);
    const on = V.map((_, x) => x).filter(x => Math.abs(side[x]) < EPS), id = on.join(',');
    if (seen.has(id)) continue; seen.add(id);
    const c = mul(on.reduce((s, x) => add(s, V[x]), [0, 0, 0] as V3), 1 / on.length);
    // 글자의 위쪽: 중심에서 가장 먼 꼭짓점 방향
    const far = on.reduce((b, x) => len(sub(V[x], c)) > len(sub(V[b], c)) + EPS ? x : b, on[0]);
    const nn = n, Y = odd && Math.abs(nn[0]) < 0.5 ? norm(cross([1, 0, 0], nn)) : norm(sub(V[far], c)), X = cross(Y, nn);
    const ring = on.map(x => ({ x, a: Math.atan2(dot(sub(V[x], c), Y), dot(sub(V[x], c), X)) })).sort((p, q) => p.a - q.a).map(p => p.x);
    let inr = Infinity, area = 0;
    ring.forEach((x, q) => { const a = V[x], b = V[ring[(q + 1) % ring.length]], e = norm(sub(b, a)); inr = Math.min(inr, len(sub(sub(c, a), mul(e, dot(sub(c, a), e))))); area += len(cross(sub(a, c), sub(b, c))) / 2; });
    faces.push({ n: nn, c, X, Y, ring, inr, area, side: !odd || Math.abs(nn[0]) < 0.5 });
  }
  faces.sort((a, b) => (b.side ? 1 : 0) - (a.side ? 1 : 0) || b.area - a.area || b.c[2] - a.c[2] || b.c[1] - a.c[1] || b.c[0] - a.c[0]);
  return { V, faces };
}
const cache: Record<string, ReturnType<typeof build>> = {}; const shape = (key: string) => cache[key] ||= build(key);
// 면수 → 모양. 정다면체 등은 그대로, 그 밖의 짝수는 엇쌍뿔(면 2n), 홀수는 n각 기둥
const keyOf = (sides: number) => VERTS[sides] ? String(sides) : sides < 2 ? '2' : sides % 2 ? 'p' + Math.min(sides, 99) : 't' + Math.min(sides, 200) / 2;

// 색: CSS 변수를 읽어 숫자로
function rgbOf(css: string, el: HTMLElement): number[] {
  const probe = document.createElement('i'); probe.style.color = css; probe.style.display = 'none'; el.append(probe);
  const c = document.createElement('canvas').getContext('2d')!; c.fillStyle = getComputedStyle(probe).color; probe.remove(); c.fillRect(0, 0, 1, 1);
  return [...c.getImageData(0, 0, 1, 1).data].slice(0, 3);
}
const shade = (c: number[], k: number) => `rgb(${c.map(v => Math.round(k <= 1 ? v * k : v + (255 - v) * Math.min(1, k - 1))).join(',')})`;
const TILT = mmul(axisRot([1, 0, 0], -0.3), axisRot([0, 1, 0], 0.24)), LIGHT = norm([-0.45, 0.75, 0.65]);
const ease = (t: number) => 1 - Math.pow(1 - t, 3);

interface DieProps { sides: number; value: number; animate?: boolean; delay?: number; size?: number; tone?: '' | 'crit' | 'fumble'; onSettle?: () => void }
/** 주사위 하나. 결과 값이 적힌 면이 정면을 향해 멈춘다 */
export function Die({ sides, value, animate = false, delay = 0, size = 104, tone = '', onSettle }: DieProps) {
  const box = useRef<HTMLDivElement>(null), cvRef = useRef<HTMLCanvasElement>(null), settle = useRef(onSettle);
  const [settled, setSettled] = useState(false);
  const dpr = Math.min(2, window.devicePixelRatio || 1), px = Math.round(size * dpr);
  useEffect(() => { settle.current = onSettle; });
  useEffect(() => {
    const el = box.current, cv = cvRef.current; if (!el || !cv) return;
    const key = keyOf(sides), { V, faces } = shape(key), nLab = key === '2' ? 2 : faces.filter(f => f.side).length, std = nLab >= sides;
    // 면마다 적힐 숫자. 결과 면(top)은 반드시 value
    const top = std ? Math.min(nLab, Math.max(1, value)) - 1 : 0, tiny = faces[top].inr < 0.16;   // 면이 아주 작으면 결과 숫자만 크게 적는다
    const labels = faces.map((_, i): number | '' => i >= nLab ? '' : std ? i + 1 : i === 0 ? value : 1 + (value * 7 + i * 13) % Math.max(1, sides));
    const f = faces[top], target = mmul(TILT, [f.X, f.Y, f.n]);   // 모델 → 화면
    const spinAxis = norm([Math.random() - 0.5, Math.random() - 0.5, Math.random() * 0.6 - 0.3]), turns = (5 + Math.random() * 3) * Math.PI, fromX = (Math.random() < 0.5 ? -1 : 1) * (0.5 + Math.random() * 0.4);
    let colors: { body: number[]; ink: number[]; num: number[] } | null = null;
    const draw = (t: number) => {   // t: 0 → 1 (1 이면 멈춘 모습)
      colors ||= { body: tone === 'crit' ? [231, 185, 60] : tone === 'fumble' ? rgbOf('var(--bad)', el) : rgbOf('var(--accent)', el), ink: rgbOf('var(--ink, var(--text))', el), num: tone === 'crit' ? [43, 34, 6] : rgbOf(tone === 'fumble' ? '#fff' : 'var(--on-accent)', el) };
      const ctx = cv.getContext('2d'); if (!ctx) return;
      const W = cv.width, s = W * (key === '2' ? 0.36 : 0.37), e = ease(t);
      const M = mmul(target, axisRot(spinAxis, (1 - e) * turns));
      const hop = Math.abs(Math.cos(t * Math.PI * 2.5)) * Math.pow(1 - t, 1.6);   // 통통 튀다 가라앉는다
      const cx = W / 2 + fromX * (1 - e) * W * 0.28, cy = W * 0.5 - hop * W * 0.3;
      ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, W, W);
      // 바닥 그림자
      ctx.fillStyle = `rgba(${colors.ink.join(',')},${0.2 - hop * 0.12})`; ctx.beginPath(); ctx.ellipse(cx, W * 0.9, s * (0.78 - hop * 0.3), s * (0.16 - hop * 0.06), 0, 0, Math.PI * 2); ctx.fill();
      const P = V.map(v => mapply(M, v));
      ctx.lineJoin = 'round'; ctx.lineWidth = Math.max(1, W / 90);
      for (let i = 0; i < faces.length; i++) {
        const F = faces[i], n = mapply(M, F.n); if (n[2] <= 0.02) continue;
        ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.beginPath();
        F.ring.forEach((x, q) => { const X = cx + P[x][0] * s, Y = cy - P[x][1] * s; if (q) ctx.lineTo(X, Y); else ctx.moveTo(X, Y); }); ctx.closePath();
        const lit = 0.62 + 0.5 * Math.max(0, dot(n, LIGHT)) + (i === top && t >= 1 ? 0.06 : 0);
        ctx.fillStyle = shade(colors.body, lit); ctx.fill(); ctx.strokeStyle = shade(colors.body, lit * 0.62); ctx.stroke();
        const lab = labels[i]; if (lab === '' || (F.inr < 0.1 && i !== top)) continue;
        // 숫자: 면에 붙은 채로 기울어진다
        const c = mapply(M, F.c), Xv = mapply(M, F.X), Yv = mapply(M, F.Y), k = s / 100, txt = String(lab) + (std && sides > 6 && (lab === 6 || lab === 9) ? '.' : '');
        ctx.setTransform(k * Xv[0], -k * Xv[1], -k * Yv[0], k * Yv[1], cx + c[0] * s, cy - c[1] * s);
        const big = i === top && tiny && t >= 1, fs = 100 * (big ? 0.52 : F.inr) * (F.ring.length === 3 ? 1.2 : key === '2' ? 0.9 : 1.2) * (txt.length > 2 ? 0.7 : txt.length > 1 ? 0.86 : 1);
        ctx.font = `800 ${fs}px Outfit, Pretendard, sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillStyle = `rgba(${colors.num.join(',')},${0.35 + 0.65 * Math.min(1, n[2] * 1.3)})`; if (big) { ctx.lineWidth = fs * 0.22; ctx.lineJoin = 'round'; ctx.strokeStyle = shade(colors.body, 0.5); ctx.strokeText(txt, 0, 0); ctx.lineWidth = Math.max(1, W / 90); }
        ctx.fillText(txt, 0, big ? 0 : fs * (F.ring.length === 3 ? 0.16 : 0.04));
      }
    };
    let raf = 0, live = true;
    const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (!animate || reduce) { raf = requestAnimationFrame(() => { draw(1); settle.current?.(); }); return () => cancelAnimationFrame(raf); }
    const dur = 1250 + Math.random() * 250; let t0 = 0;
    const frame = (ts: number) => {
      if (!live) return;   // 화면에서 사라지면 멈춘다
      if (!t0) t0 = ts; const t = Math.min(1, Math.max(0, (ts - t0 - delay) / dur));
      draw(t); if (t < 1) raf = requestAnimationFrame(frame); else { setSettled(true); settle.current?.(); }
    };
    raf = requestAnimationFrame(frame);
    return () => { live = false; cancelAnimationFrame(raf); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return <div className={['die3', tone, settled && 'settled'].filter(Boolean).join(' ')} role="img" aria-label={`${sides}면 주사위: ${value}`} ref={box}>
    <canvas ref={cvRef} width={px} height={px} style={{ width: size + 'px', height: size + 'px' }} />
  </div>;
}

/** 주사위 메시지 한 장 */
export function DiceCard({ m }: { m: Msg }) {
  const d = m.dice!;
  const [fresh] = useState(() => Date.now() - m.ts < 10000 && B.S.settings.motion !== false);
  const [done, setDone] = useState(!fresh), left = useRef(d.rolls.length);
  const many = d.rolls.length >= 6;
  const settle = () => { if (--left.current > 0 || !fresh) return; setDone(true); };
  const best = d.sides === 20 && d.rolls.length === 1 ? (d.rolls[0] === 20 ? '대성공' : d.rolls[0] === 1 ? '대실패' : '') : '';
  return <div className={['dice-card', many && 'many', done && 'done'].filter(Boolean).join(' ')}>
    <div className="dice-head"><Icon name="dice" size={15} /><span>{`${m.diceBy || ''} · ${d.expr}`}</span>{best ? <em>{best}</em> : null}</div>
    <div className="dice-row">{d.rolls.map((v, i) => <Die key={i} sides={d.sides} value={v} animate={fresh} delay={i * 130} size={many ? 76 : 132} tone={d.sides === 20 && v === 20 ? 'crit' : d.sides === 20 && v === 1 ? 'fumble' : ''} onSettle={settle} />)}</div>
    <div className="dice-foot"><span>{`${d.rolls.join(' + ')}${d.mod ? ` ${d.mod > 0 ? '+' : '−'} ${Math.abs(d.mod)}` : ''} =`}</span><strong className={fresh && done ? 'pop' : undefined}>{done ? String(d.total) : '…'}</strong></div>
  </div>;
}
