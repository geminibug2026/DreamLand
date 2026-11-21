// 막후의 선 그림: 무대 뒤 밧줄 장치(막후) · 객석 줄(객석) · 저울(이야기 저울) · 빈 자리 그림. 전부 씨앗으로 그리는 인라인 SVG
import { I } from '../lib/icons';
import { hash, rng } from './text';

// 아이콘 (24 격자 · 선 하나)
Object.assign(I, {
  crew: I.crew || 'M4 4h16M7 4v9M12 4v13M17 4v6M5.5 13h3v3h-3zM10.5 17h3v3h-3zM15.5 10h3v3h-3z',
  seats: I.seats || 'M4 18v-5a3 3 0 0 1 6 0v5M14 18v-5a3 3 0 0 1 6 0v5M3 18h18M7 7.5a1.5 1.5 0 1 0 0-3a1.5 1.5 0 0 0 0 3M17 7.5a1.5 1.5 0 1 0 0-3a1.5 1.5 0 0 0 0 3',
  scale: I.scale || 'M12 4v16M8 20h8M5 7h14M5 7l-2.5 6a2.8 2.8 0 0 0 5 0zM19 7l-2.5 6a2.8 2.8 0 0 0 5 0z',
  nudge: I.nudge || 'M4 12h11M11 7l5 5l-5 5M19 6v12',
});

/** 막후: 위의 가로대에서 내려온 밧줄과 추. 켜진 조수 수만큼 추가 내려와 있다 */
export function RigArt({ seed = 'crew', on = 0 }: { seed?: string; on?: number }) {
  const r = rng(hash(seed)), n = 9, w = 220, h = 96;
  const ropes = Array.from({ length: n }, (_, i) => ({ x: 14 + i * ((w - 28) / (n - 1)), len: 22 + r() * 46, k: r() }));
  return <svg className="fx-art cr-rig" viewBox={`0 0 ${w} ${h}`} aria-hidden="true">
    <path d={`M2 8H${w - 2}`} /><path className="t" d={`M2 12H${w - 2}`} />
    {ropes.map((p, i) => <path key={'p' + i} className="h" d={`M${p.x - 3} 8a3 3 0 0 0 6 0`} />)}
    {ropes.map((p, i) => { const live = i < on, y = live ? p.len + 18 : p.len; return <g key={i}>
      <path className={live ? 'fx-draw' : 't'} pathLength={1} style={{ ['--d' as string]: `${i * 0.05}s` }} d={`M${p.x} 12V${y}`} />
      {live ? <rect className="p" x={p.x - 4} y={y} width={8} height={11} rx={1} /> : <path className="t" d={`M${p.x - 3} ${y}h6`} />}
      {live && <path className="t" d={`M${p.x - 4} ${y + 4}h8M${p.x - 4} ${y + 7.5}h8`} />}
    </g>; })}
    <path className="d" d={`M2 ${h - 6}H${w - 2}`} />
    {[0.18, 0.5, 0.82].map((k, i) => <path key={'m' + i} className="h" d={`M${w * k - 5} ${h - 6}l5 -5l5 5`} />)}
  </svg>;
}

/** 객석: 무대를 향해 휜 좌석 줄. 찬 자리는 점이 찍혀 있다 */
export function SeatsArt({ seed, taken = 6 }: { seed: string; taken?: number }) {
  const r = rng(hash('rows' + seed)), rows = [9, 11, 13], W = 150, H = 54, pts: { x: number; y: number; on: boolean }[] = [];
  rows.forEach((n, ri) => { for (let i = 0; i < n; i++) { const a = (i / (n - 1) - 0.5) * 1.5, R = 30 + ri * 11; pts.push({ x: W / 2 + Math.sin(a) * R * 1.9, y: 4 + Math.cos(a) * R * 0.62 + ri * 3, on: false }); } });
  for (let k = 0, guard = 0; k < taken && guard < 200; guard++) { const p = pts[Math.floor(r() * pts.length)]; if (!p.on) { p.on = true; k++; } }
  return <svg className="fx-art cr-rows" viewBox={`0 0 ${W} ${H}`} aria-hidden="true">
    <path className="t" d={`M${W / 2 - 34} 3H${W / 2 + 34}`} /><path className="h" d={`M${W / 2 - 30} 6H${W / 2 + 30}`} />
    {pts.map((p, i) => <g key={i}><path className={p.on ? '' : 't'} d={`M${(p.x - 3).toFixed(1)} ${(p.y + 2).toFixed(1)}a3 3 0 0 1 6 0`} />{p.on && <circle className="af" cx={p.x} cy={p.y - 1.6} r={1.3} />}</g>)}
  </svg>;
}

/** 이야기 저울: 한쪽으로 기운 접시저울. tilt 는 -1(왼쪽이 무거움)~1 */
export function ScaleArt({ tilt = 0.4, veiled = false }: { tilt?: number; veiled?: boolean }) {
  const a = tilt * 9, rad = a * Math.PI / 180, L = 30, lx = 44 - Math.cos(rad) * L, ly = 16 - Math.sin(rad) * L, rx = 44 + Math.cos(rad) * L, ry = 16 + Math.sin(rad) * L;
  const pan = (x: number, y: number, k: string) => <g key={k}><path className="t" d={`M${x} ${y}l-8 16M${x} ${y}l8 16`} /><path d={`M${x - 10} ${y + 16}a10 5 0 0 0 20 0z`} className={veiled ? 'd' : ''} /></g>;
  return <svg className="fx-art cr-scale-art" viewBox="0 0 88 60" aria-hidden="true">
    <path d="M44 10V52M34 52h20" /><path className="t" d="M38 55h12" /><circle className="p" cx="44" cy="10" r="2.6" />
    <path d={`M${lx.toFixed(1)} ${ly.toFixed(1)}L${rx.toFixed(1)} ${ry.toFixed(1)}`} />
    {pan(+lx.toFixed(1), +ly.toFixed(1), 'l')}{pan(+rx.toFixed(1), +ry.toFixed(1), 'r')}
    <path className="h" d="M44 4v3M40 5.5l1.5 2M48 5.5l-1.5 2" />
  </svg>;
}

/** 빈 검토함: 덮인 원고 한 묶음 */
export const EmptyTray = () => <svg className="fx-art" viewBox="0 0 56 56" aria-hidden="true"><path d="M10 38h36l-4 8H14z" /><path className="t" d="M16 38V18h24v20M20 24h16M20 29h16M20 34h9" /><path className="h" d="M19 18v-3h24v20h-3" /></svg>;
/** 빈 기록: 아직 아무것도 걸리지 않은 가로대 */
export const EmptyLog = () => <svg className="fx-art" viewBox="0 0 56 56" aria-hidden="true"><path d="M6 14h44" /><path className="t" d="M14 14v22M28 14v14M42 14v26" /><path className="d" d="M6 48h44" /><circle className="f" cx="14" cy="38" r="1.5" /><circle className="f" cx="28" cy="30" r="1.5" /><circle className="f" cx="42" cy="42" r="1.5" /></svg>;
