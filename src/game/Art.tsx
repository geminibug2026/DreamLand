// 게임 화면의 그림들. 모두 한 벌의 규칙으로 그렸다:
//  · 도구 아이콘은 24칸, 문장 · 지형 · 주사위는 32칸 격자. 가장자리 2칸은 비운다
//  · 선 굵기의 위계: 윤곽 1.5 → 안쪽 생김새 1 → 음영 빗금 0.75. 끝과 모서리는 둥글게
//  · 면은 같은 색을 옅게(이중 톤) 깔고 그 위에 윤곽을 얹는다. 빗금은 그림자 쪽(오른쪽 아래)에만
//  · 색은 모두 currentColor — 놓이는 자리의 글자색을 따른다
import type { ReactNode } from 'react';

const S = { fill: 'none', stroke: 'currentColor', strokeLinecap: 'round', strokeLinejoin: 'round' } as const;
const Out = ({ d, w = 1.5 }: { d: string; w?: number }) => <path d={d} {...S} strokeWidth={w} />;
const In = ({ d }: { d: string }) => <path d={d} {...S} strokeWidth={1} opacity={.85} />;
const Hatch = ({ d }: { d: string }) => <path d={d} {...S} strokeWidth={.75} opacity={.6} />;
const Tone = ({ d, o = .16 }: { d: string; o?: number }) => <path d={d} fill="currentColor" opacity={o} />;
const Solid = ({ d }: { d: string }) => <path d={d} fill="currentColor" />;
const Svg = ({ size, box = 24, children, cls }: { size?: number; box?: number; children: ReactNode; cls?: string }) =>
  <svg viewBox={`0 0 ${box} ${box}`} width={size} height={size} className={cls} aria-hidden="true">{children}</svg>;

// ── 도구 아이콘 (24칸) ──
export type GlyphName = 'map' | 'journal' | 'sheet' | 'soundOn' | 'soundOff' | 'back' | 'exit' | 'stop' | 'redo' | 'send';
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
    exit: <Out d="M6 6l12 12M18 6 6 18" />,
    stop: <><Tone d="M7 7h10v10H7z" o={.3} /><Out d="M7.500 6.500h9a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1h-9a1 1 0 0 1-1-1v-9a1 1 0 0 1 1-1z" /></>,
    redo: <><Out d="M19.500 12a7.500 7.500 0 1 1-2.400-5.500" /><Out d="M19.800 3.800v4.400h-4.400" /></>,
    // 보내기: 깃펜
    send: <><Tone d="M20 4c-6.500.500-11 3.500-13 9.500l3.500 3.500c6-2 9-6.500 9.500-13z" /><Out d="M20 4c-6.500.500-11 3.500-13 9.500l3.500 3.500c6-2 9-6.500 9.500-13z" /><In d="M17 7 5.500 18.500M4 20l1.500-1.500" /><Hatch d="M11.500 9.500l3 3M9.300 12.200l2.500 2.500" /></>,
  };
  return <Svg size={size}>{g[name]}</Svg>;
}

// ── 적의 문장 (32칸) ──
export type Kind = 'beast' | 'blade' | 'skull' | 'spark' | 'crown' | 'horn';
export const foeKind = (name: string): Kind =>
  /dragon|lord|king|queen|chief|boss|demon|용|왕|군주|두목|대장|마왕|龙|王|首领/i.test(name) ? 'crown'
    : /skelet|zombie|ghost|ghoul|undead|wraith|lich|vampire|해골|좀비|유령|망령|언데드|흡혈|骷髅|僵尸|幽灵/i.test(name) ? 'skull'
      : /mage|witch|wizard|sorcer|cultist|shaman|priest|spirit|elemental|마법|마녀|주술|사제|정령|法师|女巫|祭司/i.test(name) ? 'spark'
        : /wolf|bear|rat|boar|spider|bat|snake|hound|dog|cat|tiger|lion|beast|늑대|곰|쥐|멧돼지|거미|박쥐|뱀|개|호랑이|사자|짐승|狼|熊|鼠|蛇|虎/i.test(name) ? 'beast'
          : /bandit|thug|guard|soldier|knight|thief|rogue|assassin|goblin|orc|pirate|mercenar|archer|hunter|도적|산적|경비|병사|기사|도둑|암살|고블린|오크|해적|용병|궁수|사냥꾼|强盗|士兵|骑士|哥布林|兽人/i.test(name) ? 'blade' : 'horn';
export function Emblem({ kind, size }: { kind: Kind; size?: number }) {
  const e: Record<Kind, ReactNode> = {
    // 짐승: 정면을 보는 늑대 머리 — 곧추선 귀, 좁아지는 주둥이, 치켜뜬 눈
    beast: <><Tone d="M6 4.500l5.200 5.300h9.600L26 4.500l1.300 9.700-3.300 7.300L16 28l-8-6.500-3.300-7.300z" /><Out d="M6 4.500l5.200 5.300h9.600L26 4.500l1.300 9.700-3.300 7.300L16 28l-8-6.500-3.300-7.300z" /><Solid d="M9.800 14.200l4.400 1.900-.900 1.500-3.900-1.600zM22.200 14.200l-4.400 1.900.900 1.500 3.900-1.600zM14.300 22.600h3.400L16 25z" /><In d="M16 25v1.200M12.500 19.500 16 22.600l3.500-3.100" /><Hatch d="M7.700 7.800l2.300 3.400M24.300 7.800 22 11.200M21.500 20.500l2-4M22.800 21.800l1.700-3.400" /></>,
    // 무기: 엇갈린 두 자루의 칼 — 날은 면으로, 코등이와 자루는 선으로. 위에 놓인 칼 둘레를 바탕색으로 따서 겹침을 보인다
    blade: <>{[false, true].map(flip => <g key={String(flip)} transform={flip ? 'matrix(-1 0 0 1 32 0)' : undefined}>
      <path d="M5.500 5.500 9.200 6.800 20.600 18.200 18.200 20.600 6.800 9.200z" fill="currentColor" stroke="var(--tok-bg, #000)" strokeWidth={flip ? 1.500 : 0} strokeLinejoin="round" paintOrder="stroke" />
      <path d="M8.200 8.200 18.600 18.600" stroke="var(--tok-bg, #000)" strokeWidth={.750} strokeLinecap="round" opacity={.7} />
      <path d="M22.800 16.200 16.200 22.800" {...S} strokeWidth={2} /><path d="M20 20l3.800 3.800" {...S} strokeWidth={1.750} /><circle cx="25.300" cy="25.300" r="1.600" fill="currentColor" />
    </g>)}<Hatch d="M13 26.500h6M14.500 28.300h3" /></>,
    // 망자: 금이 간 해골 — 뼈는 밝은 면, 눈구멍과 코는 바탕색으로 파낸다
    skull: <><Tone d="M16 3.500c-6.200 0-10.500 4.300-10.500 9.800 0 3.300 1.600 5.800 4 7.300V24a2.500 2.500 0 0 0 2.500 2.500h8A2.500 2.500 0 0 0 22.500 24v-3.400c2.400-1.500 4-4 4-7.300 0-5.500-4.300-9.800-10.500-9.800z" o={.82} /><Out d="M16 3.500c-6.200 0-10.500 4.300-10.500 9.800 0 3.300 1.600 5.800 4 7.300V24a2.500 2.500 0 0 0 2.500 2.500h8A2.500 2.500 0 0 0 22.500 24v-3.400c2.400-1.500 4-4 4-7.300 0-5.500-4.300-9.800-10.500-9.800z" /><path d="M11.600 11c1.800 0 3.200 1.500 3.200 3.400 0 1.900-1.400 3.300-3.200 3.300s-3.200-1.400-3.200-3.300c0-1.900 1.400-3.400 3.200-3.400zM20.400 11c1.800 0 3.200 1.500 3.200 3.400 0 1.900-1.400 3.300-3.200 3.300s-3.200-1.400-3.200-3.300c0-1.900 1.400-3.400 3.200-3.400zM16 17.200l1.600 3.300h-3.200z" fill="var(--tok-bg, #000)" /><path d="M13 22.600v3.900M16 22.600v3.900M19 22.600v3.900M19.300 4.300l-.900 2.700 2 1.300-.800 2.200" fill="none" stroke="var(--tok-bg, #000)" strokeWidth={1} strokeLinecap="round" strokeLinejoin="round" /><circle cx="12.300" cy="13.800" r=".900" fill="currentColor" /><circle cx="19.700" cy="13.800" r=".900" fill="currentColor" /></>,
    // 술사: 고리 안의 네 갈래 별과 그 둘레를 도는 점들
    spark: <><circle cx="16" cy="16" r="11.500" {...S} strokeWidth={.75} opacity={.6} strokeDasharray="1.500 2.500" /><Tone d="M16 4.500l2.700 8.800 8.800 2.700-8.800 2.700L16 27.500l-2.700-8.800-8.800-2.700 8.800-2.700z" o={.2} /><Out d="M16 4.500l2.700 8.800 8.800 2.700-8.800 2.700L16 27.500l-2.700-8.800-8.800-2.700 8.800-2.700z" /><circle cx="16" cy="16" r="2.200" fill="currentColor" /><In d="M8.500 8.500l2.200 2.200M23.500 8.500l-2.200 2.200M8.500 23.500l2.200-2.200M23.500 23.500l-2.200-2.200" /><circle cx="24.800" cy="7.200" r="1" fill="currentColor" /><circle cx="7.200" cy="24.800" r="1" fill="currentColor" /></>,
    // 우두머리: 보석 박힌 왕관
    crown: <><Tone d="M4.500 10.500l5.500 5 6-9.500 6 9.500 5.500-5-2.300 12.500H6.800z" /><Out d="M4.500 10.500l5.500 5 6-9.500 6 9.500 5.500-5-2.300 12.500H6.800z" /><Out d="M7 26.500h18" /><circle cx="16" cy="5" r="1.500" fill="currentColor" /><circle cx="4.500" cy="9.500" r="1.300" fill="currentColor" /><circle cx="27.500" cy="9.500" r="1.300" fill="currentColor" /><Solid d="M16 16.200l1.900 2.300L16 20.800l-1.900-2.300z" /><In d="M10.500 19.500h1.500M20 19.500h1.500" /><Hatch d="M21.500 21.500l2.300-5M23.300 22.200l1.700-4" /></>,
    // 괴물: 뿔 달린 가면 — 치켜든 뿔, 째진 눈, 송곳니
    horn: <><Out d="M10 10.500C6 9.500 4.300 6.800 5 3c1.800 2.800 4 4.200 7 4.500M22 10.500c4-1 5.700-3.700 5-7.500-1.800 2.800-4 4.200-7 4.500" /><Tone d="M9.500 9.500h13l1.800 7.500-2.800 6.800L16 28.500l-5.500-4.700L7.700 17z" /><Out d="M9.500 9.500h13l1.800 7.500-2.800 6.800L16 28.500l-5.500-4.700L7.700 17z" /><Solid d="M10.200 14.300l4.300 1.400-.300 1.900-4.600-1.200zM21.800 14.300l-4.300 1.400.300 1.900 4.600-1.200z" /><In d="M13 22.500l1 2.600 1-2M19 22.500l-1 2.600-1-2M16 12v3" /><Hatch d="M20.800 20.500l1.700-3.800M22 21.500l1.200-2.700M6.300 5.800l1.700 1.500M25.700 5.800 24 7.300" /></>,
  };
  return <Svg box={32} size={size}>{e[kind]}</Svg>;
}

// ── 지형 (32칸) ──
export type Land = 'rock' | 'high' | 'bush';
export function Terrain({ kind, size }: { kind: Land; size?: number }) {
  const l: Record<Land, ReactNode> = {
    // 바위: 큰 덩이와 조약돌. 모서리 면을 나누고 그늘진 면에 빗금
    rock: <><Tone d="M5.500 24.500 8 15.500l5-5.300 6.800 1 4.200 5 3 8.300z" o={.2} /><Tone d="M14.200 17.200l5.600-6 4.200 5 3 8.300h-8.500z" o={.14} /><Out d="M5.500 24.500 8 15.500l5-5.300 6.800 1 4.200 5 3 8.300z" w={1.250} /><In d="M13 10.200l1.200 7-6.200-1.700M14.200 17.200l5.600-6M14.200 17.200l4.300 7.300M14.200 17.200l9.800-1" /><Hatch d="M20.500 22.500l2.500-4.500M22.500 23.200l2.200-4M24.500 23.500l1.300-2.300" /><Tone d="M3.500 27.500l1.200-2.500 3.300-.500 1.500 3z" o={.2} /><Out d="M3.500 27.500l1.200-2.500 3.300-.500 1.500 3z" w={1} /></>,
    // 언덕: 등고선이 겹친 둔덕, 위로 향한 표시
    high: <><Tone d="M3 26.500C5 16.500 10 10.500 16 10.500s11 6 13 16z" o={.13} /><Out d="M3 26.500C5 16.500 10 10.500 16 10.500s11 6 13 16" w={1.250} /><In d="M8 26.500c1.500-6.800 4.400-11 8-11s6.500 4.200 8 11" /><Hatch d="M12.500 26.500c.700-3.700 1.900-6 3.500-6s2.800 2.300 3.500 6M3 26.500h26" /><Out d="M13.200 6.800 16 4l2.800 2.800" w={1.250} /><In d="M16 4v4" /></>,
    // 덤불: 잎맥이 있는 세 장의 잎과 풀
    bush: <><Tone d="M16 27C9.300 26 5.400 21.300 5 13.500c6.800 1 10.600 5.800 11 13.500zM16 27c6.700-1 10.600-5.700 11-13.500-6.800 1-10.600 5.800-11 13.500z" o={.14} /><Tone d="M16 27c-3.600-5.300-3.600-12 0-20 3.600 8 3.600 14.700 0 20z" o={.24} /><Out d="M16 27C9.300 26 5.400 21.300 5 13.500c6.800 1 10.600 5.800 11 13.500zM16 27c6.700-1 10.600-5.700 11-13.500-6.800 1-10.600 5.800-11 13.500z" w={1.250} /><Out d="M16 27c-3.600-5.300-3.600-12 0-20 3.600 8 3.600 14.700 0 20z" w={1.250} /><Hatch d="M16 11v15M8 16.500l7.300 9.500M24 16.500 16.700 26M14.300 15.500 16 17.500l1.700-2M14 19.500l2 2.200 2-2.200" /><In d="M4.500 28.500h4M11 28.500h10M23.500 28.500h4" /></>,
  };
  return <Svg box={32} size={size}>{l[kind]}</Svg>;
}

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
