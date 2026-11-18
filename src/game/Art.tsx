// 게임 화면의 그림들. 모두 한 벌의 규칙으로 그렸다:
//  · 도구 아이콘은 24칸, 문장 · 지형 · 주사위는 32칸 격자. 가장자리 2칸은 비운다
//  · 선 굵기의 위계: 윤곽 1.5 → 안쪽 생김새 1 → 음영 빗금 0.75. 끝과 모서리는 둥글게
//  · 면은 같은 색을 옅게(이중 톤) 깔고 그 위에 윤곽을 얹는다. 빗금은 그림자 쪽(오른쪽 아래)에만
//  · 색은 모두 currentColor — 놓이는 자리의 글자색을 따른다
import type { ReactNode } from 'react';
import { ICONS } from './icons.gen';
import { foeKind, iconOf, itemIcon } from './bestiary';

const S = { fill: 'none', stroke: 'currentColor', strokeLinecap: 'round', strokeLinejoin: 'round' } as const;
const Out = ({ d, w = 1.5 }: { d: string; w?: number }) => <path d={d} {...S} strokeWidth={w} />;
const In = ({ d }: { d: string }) => <path d={d} {...S} strokeWidth={1} opacity={.85} />;
const Hatch = ({ d }: { d: string }) => <path d={d} {...S} strokeWidth={.75} opacity={.6} />;
const Tone = ({ d, o = .16 }: { d: string; o?: number }) => <path d={d} fill="currentColor" opacity={o} />;
const Svg = ({ size, box = 24, children, cls }: { size?: number; box?: number; children: ReactNode; cls?: string }) =>
  <svg viewBox={`0 0 ${box} ${box}`} width={size} height={size} className={cls} aria-hidden="true">{children}</svg>;

// ── 도구 아이콘 (24칸) ──
export type GlyphName = 'end' | 'fwd' | 'rewind' | 'map' | 'journal' | 'sheet' | 'soundOn' | 'soundOff' | 'back' | 'exit' | 'stop' | 'redo' | 'send';
export function Glyph({ name, size = 20 }: { name: GlyphName; size?: number }) {
  const g: Record<GlyphName, ReactNode> = {
    // 접힌 지도: 가운데 면만 옅게, 길은 점선, 목적지에 점
    map: <><Tone d="M9 4.500 15 6.500v13L9 17.500z" /><Out d="M3.500 6.500 9 4.500l6 2 5.500-2v13L15 19.500l-6-2-5.500 2z" /><In d="M9 4.500v13M15 6.500v13" /><path d="M5.800 14.200c1.200-1.800 2-2.300 3.200-1.400s2 1.300 3.200-.300" {...S} strokeWidth={1} strokeDasharray="0.100 2.200" /><circle cx="17.700" cy="10.200" r="1.100" fill="currentColor" /></>,
    // 일지: 책등과 가름끈
    journal: <><Tone d="M6 5a1.500 1.500 0 0 1 1.500-1.500H18V17.500H7.500A1.500 1.500 0 0 0 6 19z" /><Out d="M6 19V5a1.500 1.500 0 0 1 1.500-1.500H18v17H7.500A1.500 1.500 0 0 1 6 19zm0 0a1.500 1.500 0 0 1 1.500-1.500H18" /><Out d="M12.500 3.500v5.800l1.750-1.300L16 9.300V3.500" w={1} /><Hatch d="M9 12h6M9 14.500h4" /></>,
    // 시트: 인물이 그려진 패
    sheet: <><Tone d="M12 6.800a2.300 2.300 0 1 0 0 4.600 2.300 2.300 0 0 0 0-4.600zM7.800 17.200c.500-2.500 2.100-3.800 4.200-3.800s3.700 1.300 4.200 3.800z" o={.22} /><Out d="M6.500 3.500h11A1.500 1.500 0 0 1 19 5v14a1.500 1.500 0 0 1-1.500 1.500h-11A1.500 1.500 0 0 1 5 19V5a1.500 1.500 0 0 1 1.500-1.500z" /><In d="M12 6.800a2.300 2.300 0 1 0 0 4.600 2.300 2.300 0 0 0 0-4.600zM7.800 17.200c.500-2.500 2.100-3.800 4.200-3.800s3.700 1.300 4.200 3.800" /></>,
    soundOn: <><Tone d="M4 9.500h3.200L12 5.500v13l-4.800-4H4z" /><Out d="M4 9.500h3.200L12 5.500v13l-4.800-4H4z" /><In d="M15.200 9.200a4 4 0 0 1 0 5.600" /><Out d="M17.800 6.600a7.600 7.600 0 0 1 0 10.800" w={1.250} /></>,
    soundOff: <><Tone d="M4 9.500h3.200L12 5.500v13l-4.800-4H4z" /><Out d="M4 9.500h3.200L12 5.500v13l-4.800-4H4z" /><Out d="M15.500 9.500l5 5M20.500 9.500l-5 5" w={1.250} /></>,
    back: <Out d="M14.500 5.500 8 12l6.500 6.500" />,
    fwd: <Out d="M9.500 5.500 16 12l-6.500 6.500" />,
    // 끝으로: 겹친 화살과 벽
    end: <><Out d="M5.500 6 11.500 12l-6 6" /><Out d="M11.500 6 17.500 12l-6 6" w={1.250} /><Out d="M19.500 5.500v13" /></>,
    // 되돌아가기: 갈라지는 길
    rewind: <><Out d="M6.500 4v9.500a4 4 0 0 0 4 4H17" /><Out d="M14 14.500l3 3-3 3" /><In d="M6.500 9.500h7a3.500 3.500 0 0 0 3.500-3.500V4" /><circle cx="6.500" cy="4" r="1.500" fill="currentColor" /></>,
    exit: <Out d="M6 6l12 12M18 6 6 18" />,
    stop: <><Tone d="M7 7h10v10H7z" o={.3} /><Out d="M7.500 6.500h9a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1h-9a1 1 0 0 1-1-1v-9a1 1 0 0 1 1-1z" /></>,
    redo: <><Out d="M19.500 12a7.500 7.500 0 1 1-2.400-5.500" /><Out d="M19.800 3.800v4.400h-4.400" /></>,
    // 보내기: 깃펜
    send: <><Tone d="M20 4c-6.500.500-11 3.500-13 9.500l3.500 3.500c6-2 9-6.500 9.500-13z" /><Out d="M20 4c-6.500.500-11 3.500-13 9.500l3.500 3.500c6-2 9-6.500 9.500-13z" /><In d="M17 7 5.500 18.500M4 20l1.500-1.500" /><Hatch d="M11.500 9.500l3 3M9.300 12.200l2.500 2.500" /></>,
  };
  return <Svg size={size}>{g[name]}</Svg>;
}

// ── 적의 문장 · 물건: 실루엣 아이콘 (512칸, icons.gen.ts) ──
const Sil = ({ icon, size }: { icon: string; size?: number }) => <svg viewBox="0 0 512 512" width={size} height={size} aria-hidden="true"><path d={ICONS[icon] || ICONS['daemon-skull']} fill="currentColor" /></svg>;
export function Emblem({ kind, size }: { kind: string; size?: number }) { return <Sil icon={iconOf(kind)} size={size} />; }
export function ItemGlyph({ name, kind, size }: { name: string; kind: string; size?: number }) { return <Sil icon={itemIcon(name, kind)} size={size} />; }
export { foeKind };

// ── 지형 (32칸) ──
export type Land = 'rock' | 'high' | 'bush' | 'herb' | 'keg';
const LAND: Record<Land, string> = { rock: 'stone-pile', high: 'hills', bush: 'high-grass', herb: 'herbs-bundle', keg: 'barrel' };
export function Terrain({ kind, size }: { kind: Land; size?: number }) { return <Sil icon={LAND[kind]} size={size} />; }

// ── 스무 면 주사위 (32칸): 가운데 세모에 숫자가 놓인다 ──
export function D20({ children, size = 54, dim }: { children?: ReactNode; size?: number; dim?: boolean }) {
  return <span className={`gm-d20${dim ? ' is-off' : ''}`} style={{ width: size, height: size }}>
    <Svg box={32} size={size}>
      <Tone d="M16 2.500 27.700 9.200v13.600L16 29.500 4.300 22.800V9.200z" o={.1} />
      <Tone d="M16 9 23.800 22.200H8.200z" o={.16} />
      <Out d="M16 2.500 27.700 9.200v13.600L16 29.500 4.300 22.800V9.200z" w={1.250} />
      <In d="M16 9 23.800 22.200H8.200zM16 2.500V9M16 9 4.300 9.200M16 9l11.700.200M8.200 22.200 4.300 9.200M8.200 22.200l-3.900.600M8.200 22.200 16 29.500M23.800 22.200l3.900-13M23.800 22.200l3.900.600M23.800 22.200 16 29.500" />
      <Hatch d="M19.500 25.200l5.500-2M21.500 26.300l4-1.500" />
    </Svg><b>{children}</b></span>;
}

// ── 진행 시계: 조각으로 나뉜 원. 찬 만큼 칠해진다 ──
export function ClockDial({ v, max, size = 22 }: { v: number; max: number; size?: number }) {
  const R = 13, C = 16, pt = (i: number, r = R) => { const a = (i / max) * Math.PI * 2 - Math.PI / 2; return `${(C + Math.cos(a) * r).toFixed(2)} ${(C + Math.sin(a) * r).toFixed(2)}`; };
  return <Svg box={32} size={size} cls={v >= max ? 'is-full' : undefined}>
    {Array.from({ length: Math.min(v, max) }, (_, i) => <path key={i} d={`M${C} ${C}L${pt(i)}A${R} ${R} 0 0 1 ${pt(i + 1)}z`} fill="currentColor" opacity={.85} />)}
    <circle cx={C} cy={C} r={R} {...S} strokeWidth={1.250} />
    {Array.from({ length: max }, (_, i) => <path key={i} d={`M${C} ${C}L${pt(i)}`} {...S} strokeWidth={.75} opacity={v > i || v > (i + max - 1) % max ? 1 : .7} style={{ mixBlendMode: 'normal' }} />)}
    <circle cx={C} cy={C} r={1.300} fill="currentColor" />
  </Svg>;
}

// ── 장식 ──
/** 가는 선 사이에 마름모 하나 — 글 상자 위의 가름선 */
export function Rule() {
  return <span className="gs-rule" aria-hidden="true"><i /><svg viewBox="0 0 44 12" width="44" height="12"><path d="M22 1.500 26.500 6 22 10.500 17.500 6z" {...S} strokeWidth={1} /><path d="M22 4.200 23.800 6 22 7.800 20.200 6z" fill="currentColor" /><path d="M2 6h10M32 6h10" {...S} strokeWidth={1} /><circle cx="14.500" cy="6" r=".900" fill="currentColor" /><circle cx="29.500" cy="6" r=".900" fill="currentColor" /></svg><i /></span>;
}
/** 아치 액자의 머릿돌 */
export function Keystone() {
  return <svg className="gs-key" viewBox="0 0 40 20" width="40" height="20" aria-hidden="true"><path d="M20 2l6 6-6 6-6-6z" fill="var(--gs-night, #100e0b)" {...{ stroke: 'currentColor', strokeWidth: 1, strokeLinejoin: 'round' }} /><path d="M20 5.200 22.800 8 20 10.800 17.200 8z" fill="currentColor" /><path d="M2 8h8M30 8h8" {...S} strokeWidth={1} /><circle cx="12" cy="8" r=".900" fill="currentColor" /><circle cx="28" cy="8" r=".900" fill="currentColor" /></svg>;
}

// ── 지도의 장소 그림 (24칸): 블록 위에 얹는 작은 상징 ──
export function PlaceGlyph({ scene }: { scene: string }) {
  const k = ['forest', 'garden'].includes(scene) ? 'tree' : ['mountain', 'peak', 'winter'].includes(scene) ? 'peak' : ['street', 'city', 'room', 'tavern', 'station'].includes(scene) ? 'house' : ['castle', 'arena'].includes(scene) ? 'tower'
    : ['hall', 'ruins'].includes(scene) ? 'arch' : ['sea', 'harbor', 'lake', 'bridge'].includes(scene) ? 'wave' : scene === 'desert' ? 'dune' : scene === 'night' ? 'moon' : 'post';
  const g: Record<string, ReactNode> = {
    tree: <><Tone d="M12 3 6 12h3l-3.500 5.500h13L15 12h3z" o={.3} /><Out d="M12 3 6 12h3l-3.500 5.500h13L15 12h3z" w={1.250} /><Out d="M12 17.500V21" w={1.500} /></>,
    peak: <><Tone d="M3 20 9.500 7l3.500 6 2.500-3.500L21 20z" o={.3} /><Out d="M3 20 9.500 7l3.500 6 2.500-3.500L21 20z" w={1.250} /><In d="M8 10.200l1.500 1.300 1.500-1.300M14.300 11.300l1.200 1 1.300-1" /></>,
    house: <><Tone d="M4.500 11 12 4.500 19.500 11v9h-15z" o={.3} /><Out d="M3 11.500 12 4l9 7.500M5 10v10h14V10" w={1.250} /><In d="M10 20v-5h4v5M15.500 6.500V4.500h2v3.700" /></>,
    tower: <><Tone d="M7 20V8.500h10V20z" o={.3} /><Out d="M7 20V8.500M17 20V8.500M5.500 8.500V4.500h2.500v1.800h2.200V4.500h3.600v1.800H16V4.500h2.500v4zM4 20h16" w={1.250} /><In d="M10.500 20v-4a1.500 1.500 0 0 1 3 0v4M12 11v2" /></>,
    arch: <><Tone d="M5 20V11a7 7 0 0 1 14 0v9h-4v-8.500a3 3 0 0 0-6 0V20z" o={.3} /><Out d="M5 20V11a7 7 0 0 1 14 0v9M9 20v-8.500a3 3 0 0 1 6 0V20M3.500 20h17" w={1.250} /><Hatch d="M6.500 8l1.500 1M17.500 8 16 9M12 4v2" /></>,
    wave: <><Out d="M3 9c2-2 4-2 6 0s4 2 6 0 4-2 6 0M3 14c2-2 4-2 6 0s4 2 6 0 4-2 6 0M3 19c2-2 4-2 6 0s4 2 6 0 4-2 6 0" w={1.250} /></>,
    dune: <><Tone d="M2.500 20c4-7 8-7 11-2.500 2-3 4.500-3 8 2.500z" o={.3} /><Out d="M2.500 20c4-7 8-7 11-2.500 2-3 4.500-3 8 2.500" w={1.250} /><circle cx="17" cy="6.500" r="2.300" {...S} strokeWidth={1.250} /></>,
    moon: <><Tone d="M15.500 3.500a8.500 8.500 0 1 0 5 12.500 7 7 0 0 1-5-12.500z" o={.3} /><Out d="M15.500 3.500a8.500 8.500 0 1 0 5 12.500 7 7 0 0 1-5-12.500z" w={1.250} /></>,
    post: <><Out d="M12 21V4M12 6h6.500L20.500 8.500 18.500 11H12M12 12.500H6L4 15l2 2.500h6" w={1.250} /><Tone d="M12 6h6.500L20.500 8.500 18.500 11H12zM12 12.500H6L4 15l2 2.500h6z" o={.3} /></>,
  };
  return <>{g[k]}</>;
}
