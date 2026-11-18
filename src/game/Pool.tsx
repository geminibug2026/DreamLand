// 당구(8볼, 간단 규칙): 내 공은 단색 일곱 개, 상대는 줄무늬 일곱 개. 자기 공을 다 넣은 뒤 8번을 넣으면 이긴다.
// 흰 공을 빠뜨리면 차례가 넘어가고, 자기 공을 넣으면 한 번 더 친다. 8번을 먼저 넣으면 진다. 움직임은 모두 여기서 계산한다
import { useEffect, useRef, useState } from 'react';
import { t } from '../i18n';
import { Done, Score, type P } from './Minis';

const W = 400, H = 200, R = 6, PR = 11.5, FRICTION = .9905, STOP = .03;
const POCKETS: [number, number][] = [[4, 4], [W / 2, 1], [W - 4, 4], [4, H - 4], [W / 2, H - 1], [W - 4, H - 4]];
export interface Ball { id: number; x: number; y: number; vx: number; vy: number; in: boolean }
/** 0 = 흰 공, 1~7 = 단색(나), 8 = 8번, 9~15 = 줄무늬(상대) */
export function rack(): Ball[] {
  const balls: Ball[] = [{ id: 0, x: 100, y: H / 2, vx: 0, vy: 0, in: false }], order = [1, 9, 2, 10, 8, 3, 11, 4, 12, 5, 13, 6, 14, 7, 15]; let k = 0;
  for (let col = 0; col < 5; col++) for (let row = 0; row <= col; row++) balls.push({ id: order[k++], x: 285 + col * (R * 2 * .88), y: H / 2 + (row - col / 2) * (R * 2 + .4), vx: 0, vy: 0, in: false });
  return balls;
}
export const groupOf = (id: number) => id === 0 ? 'cue' : id === 8 ? 'eight' : id < 8 ? 'me' : 'it';
/** 한 걸음 움직인다. 빠진 공의 번호를 돌려준다. 빠른 공이 다른 공을 지나치거나 엇맞지 않게, 한 걸음을 잘게 나눠 간다 */
export function stepPool(balls: Ball[]): number[] {
  const potted: number[] = [], fast = Math.max(0, ...balls.map(b => b.in ? 0 : Math.hypot(b.vx, b.vy))), sub = Math.max(1, Math.ceil(fast / 1.2));
  for (let n = 0; n < sub; n++) {
    for (const b of balls) { if (b.in) continue; b.x += b.vx / sub; b.y += b.vy / sub;
      if (POCKETS.some(([px, py]) => Math.hypot(b.x - px, b.y - py) < PR)) { b.in = true; b.vx = b.vy = 0; potted.push(b.id); continue; }
      if (b.x < R) { b.x = R; b.vx = Math.abs(b.vx) * .86; } else if (b.x > W - R) { b.x = W - R; b.vx = -Math.abs(b.vx) * .86; }
      if (b.y < R) { b.y = R; b.vy = Math.abs(b.vy) * .86; } else if (b.y > H - R) { b.y = H - R; b.vy = -Math.abs(b.vy) * .86; } }
    for (let i = 0; i < balls.length; i++) for (let j = i + 1; j < balls.length; j++) { const a = balls[i], b = balls[j]; if (a.in || b.in) continue;
      const dx = b.x - a.x, dy = b.y - a.y, dist = Math.hypot(dx, dy); if (dist >= R * 2 || dist === 0) continue;
      const nx = dx / dist, ny = dy / dist, push = (R * 2 - dist) / 2; a.x -= nx * push; a.y -= ny * push; b.x += nx * push; b.y += ny * push;
      const rel = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny; if (rel > 0) continue;   // 이미 멀어지는 중
      a.vx += rel * nx * .98; a.vy += rel * ny * .98; b.vx -= rel * nx * .98; b.vy -= rel * ny * .98; }
  }
  for (const b of balls) { if (b.in) continue; b.vx *= FRICTION; b.vy *= FRICTION; if (Math.hypot(b.vx, b.vy) < STOP) b.vx = b.vy = 0; }
  return potted;
}
export const moving = (balls: Ball[]) => balls.some(b => !b.in && (b.vx || b.vy));
/** 두 점 사이를 다른 공이 막고 있는가 */
const blocked = (balls: Ball[], ax: number, ay: number, bx: number, by: number, skip: number[]) => balls.some(o => { if (o.in || skip.includes(o.id)) return false; const dx = bx - ax, dy = by - ay, len2 = dx * dx + dy * dy || 1, u = Math.max(0, Math.min(1, ((o.x - ax) * dx + (o.y - ay) * dy) / len2)); return Math.hypot(o.x - (ax + dx * u), o.y - (ay + dy * u)) < R * 2 - .5; });
/** 상대의 샷: 넣을 공과 구멍을 견주어 가장 쉬운 것을 고른다 (꺾이는 각이 작고 길이 트인 것). 조금은 빗나간다 */
export function aiShot(balls: Ball[], target: 'it' | 'eight'): { ang: number; power: number } {
  const cue = balls[0]; let best: { ang: number; power: number; score: number } | null = null;
  for (const b of balls) { if (b.in || groupOf(b.id) !== target) continue;
    for (const [px, py] of POCKETS) { const tx = px - b.x, ty = py - b.y, tl = Math.hypot(tx, ty), gx = b.x - tx / tl * R * 2, gy = b.y - ty / tl * R * 2;   // 맞혀야 할 자리 (공 뒤쪽)
      const ax = gx - cue.x, ay = gy - cue.y, al = Math.hypot(ax, ay), cut = Math.acos(Math.max(-1, Math.min(1, (ax * tx + ay * ty) / (al * tl || 1))));
      if (cut > 1.25) continue; const clear = !blocked(balls, cue.x, cue.y, gx, gy, [0, b.id]) && !blocked(balls, b.x, b.y, px, py, [0, b.id]);
      const score = (clear ? 0 : 3) + cut * 1.6 + (al + tl) / 400; if (!best || score < best.score) best = { ang: Math.atan2(ay, ax), power: Math.min(13, 5.5 + (al + tl) / 55 + cut * 3), score }; } }
  if (!best) { const any = balls.find(b => !b.in && groupOf(b.id) === target) || balls.find(b => !b.in && b.id !== 0)!; return { ang: Math.atan2(any.y - cue.y, any.x - cue.x), power: 8 }; }
  return { ang: best.ang + (Math.random() - .5) * .03, power: best.power };   // 먼 공일수록 이 작은 오차가 크게 벌어진다
}
const COLORS = ['#f4f1e8', '#d9a520', '#2c5fb8', '#c8402f', '#6a3fa0', '#d9722a', '#2f7d4f', '#7a2a2a', '#16130f'];

export function Pool({ foe, onDone }: P) {
  const cv = useRef<HTMLCanvasElement>(null), balls = useRef<Ball[]>(rack()), aim = useRef(0), raf = useRef(0), shot = useRef<{ by: 'me' | 'it'; potted: number[] } | null>(null);
  const [turn, setTurn] = useState<'me' | 'it'>('me'), [power, setPower] = useState(60), [busy, setBusy] = useState(false), [end, setEnd] = useState<'' | 'win' | 'lose'>(''), [note, setNote] = useState(''), [, redraw] = useState(0);
  const left = (g: 'me' | 'it') => balls.current.filter(b => !b.in && groupOf(b.id) === g).length;
  const draw = () => { const c = cv.current; if (!c) return; const g = c.getContext('2d')!, dpr = Math.min(2, devicePixelRatio || 1), w = c.clientWidth, k = w / W; if (c.width !== Math.round(w * dpr)) { c.width = Math.round(w * dpr); c.height = Math.round(w / 2 * dpr); }
    g.setTransform(dpr * k, 0, 0, dpr * k, 0, 0); g.fillStyle = '#2d6a4d'; g.fillRect(0, 0, W, H);
    g.strokeStyle = 'rgba(255,255,255,.14)'; g.lineWidth = .6; g.beginPath(); g.moveTo(100, 0); g.lineTo(100, H); g.stroke();
    for (const [px, py] of POCKETS) { g.fillStyle = '#0d0c0a'; g.beginPath(); g.arc(px, py, PR - 1, 0, 6.283); g.fill(); }
    const cue = balls.current[0];
    if (!busy && !end && turn === 'me' && !cue.in) { g.strokeStyle = 'rgba(255,255,255,.55)'; g.lineWidth = .8; g.setLineDash([3, 3]); g.beginPath(); g.moveTo(cue.x, cue.y); g.lineTo(cue.x + Math.cos(aim.current) * 150, cue.y + Math.sin(aim.current) * 150); g.stroke(); g.setLineDash([]); }
    for (const b of balls.current) { if (b.in) continue; const stripe = b.id > 8, col = COLORS[b.id > 8 ? b.id - 8 : b.id];
      g.fillStyle = 'rgba(0,0,0,.28)'; g.beginPath(); g.arc(b.x + 1.2, b.y + 1.6, R, 0, 6.283); g.fill();
      g.fillStyle = stripe ? '#f4f1e8' : col; g.beginPath(); g.arc(b.x, b.y, R, 0, 6.283); g.fill();
      if (stripe) { g.save(); g.beginPath(); g.arc(b.x, b.y, R, 0, 6.283); g.clip(); g.fillStyle = col; g.fillRect(b.x - R, b.y - R * .45, R * 2, R * .9); g.restore(); }
      if (b.id) { g.fillStyle = '#f4f1e8'; g.beginPath(); g.arc(b.x, b.y, R * .42, 0, 6.283); g.fill(); g.fillStyle = '#16130f'; g.font = '600 4.6px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(String(b.id), b.x, b.y + .3); }
      g.fillStyle = 'rgba(255,255,255,.35)'; g.beginPath(); g.arc(b.x - R * .35, b.y - R * .38, R * .22, 0, 6.283); g.fill(); }
  };
  /** 공이 다 멈춘 뒤: 누가 이어 칠지, 끝났는지 */
  const settle = () => {
    const s = shot.current!; shot.current = null; const B = balls.current, by = s.by, other = by === 'me' ? 'it' : 'me', cueIn = s.potted.includes(0), eight = s.potted.includes(8);
    const mineBefore = B.filter(b => groupOf(b.id) === by && (!b.in || s.potted.includes(b.id))).length;
    if (eight) { const win = mineBefore === 0 && !cueIn; setEnd(win === (by === 'me') ? 'win' : 'lose'); setBusy(false); return; }
    if (cueIn) { const c = B[0]; c.in = false; c.x = 100; c.y = H / 2; c.vx = c.vy = 0; while (B.some(o => o.id && !o.in && Math.hypot(o.x - c.x, o.y - c.y) < R * 2)) c.y += R * 2.2; }
    const again = !cueIn && s.potted.some(id => groupOf(id) === by);
    setNote(cueIn ? t(by === 'me' ? 'game.pool.scratch' : 'game.pool.foeScratch', { name: foe }) : again ? t(by === 'me' ? 'game.pool.again' : 'game.pool.foeAgain', { name: foe }) : '');
    setTurn(again ? by : other); setBusy(false);
  };
  const run = () => { cancelAnimationFrame(raf.current); const loop = () => { for (let i = 0; i < 3; i++) { const p = stepPool(balls.current); if (p.length) shot.current?.potted.push(...p); } draw(); if (moving(balls.current)) raf.current = requestAnimationFrame(loop); else { redraw(n => n + 1); settle(); } }; raf.current = requestAnimationFrame(loop); };
  const strike = (by: 'me' | 'it', ang: number, pw: number) => { const c = balls.current[0]; c.vx = Math.cos(ang) * pw; c.vy = Math.sin(ang) * pw; shot.current = { by, potted: [] }; setBusy(true); setNote(''); run(); };
  useEffect(() => { draw(); });
  useEffect(() => () => cancelAnimationFrame(raf.current), []);
  useEffect(() => { if (turn !== 'it' || busy || end) return; const tm = window.setTimeout(() => { const s = aiShot(balls.current, left('it') ? 'it' : 'eight'); strike('it', s.ang, s.power); }, 900); return () => clearTimeout(tm); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [turn, busy, end]);
  const point = (e: React.PointerEvent) => { if (busy || end || turn !== 'me') return; const c = cv.current!, r = c.getBoundingClientRect(), x = (e.clientX - r.left) / r.width * W, y = (e.clientY - r.top) / r.height * H, cue = balls.current[0]; aim.current = Math.atan2(y - cue.y, x - cue.x); draw(); };
  return <div className="gm-mini gm-pool">
    <Score me={`${t('game.you')} · ${t('game.pool.solid')}`} foe={`${foe} · ${t('game.pool.stripe')}`} a={left('me')} b={left('it')} />
    <canvas ref={cv} className="gm-felt" onPointerDown={e => { (e.target as Element).setPointerCapture?.(e.pointerId); point(e); }} onPointerMove={e => { if (e.buttons || e.pointerType === 'touch') point(e); }} />
    <p className="gm-line">{end ? '' : busy ? '' : turn === 'it' ? t('game.thinking', { name: foe }) : note || t(left('me') ? 'game.pool.hint' : 'game.pool.hint8')}</p>
    {end ? <Done r={{ outcome: end, score: `${left('me')} : ${left('it')}` }} onDone={onDone} />
      : <div className="gm-acts gm-poolbar"><label><small>{t('game.pool.power')}</small><input type="range" min={15} max={100} value={power} onChange={e => setPower(+e.target.value)} disabled={busy || turn !== 'me'} /></label>
        <button type="button" className="btn primary" disabled={busy || turn !== 'me'} onClick={() => strike('me', aim.current, 2 + power / 100 * 12)}>{t('game.pool.shoot')}</button></div>}
  </div>;
}
