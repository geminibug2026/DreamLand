// 책상의 선 그림: 위젯마다 하나씩 있는 작은 표식(24 격자)과 큰 달, 빈 자리 그림. 전부 .fx-art 의 굵기 단계를 쓴다
import { useId, type ReactNode } from 'react';
import { moonPath } from '../lib/f-keepsake';
import { seeded } from './data';

const G = ({ children, size = 20 }: { children: ReactNode; size?: number }) => <svg className="fx-art dk-g" viewBox="0 0 24 24" width={size} height={size} aria-hidden="true">{children}</svg>;
const f = (n: number) => n.toFixed(1);

/** 위젯의 표식. 이름으로 고른다 */
export const Glyph = ({ name, size }: { name: keyof typeof GLYPHS; size?: number }) => <G size={size}>{GLYPHS[name]}</G>;
const GLYPHS = {
  // 오늘의 하늘: 초승달과 별 하나
  sky: <><path d="M15.5 4.2a8.2 8.2 0 1 0 4.3 12.6a6.6 6.6 0 0 1-4.3-12.6z" /><path className="t" d="M6 4.5v3M4.5 6h3" /><circle className="h" cx="12" cy="12" r="11" /></>,
  // 오늘의 인연: 실로 이어진 두 별
  bond: <><circle cx="6" cy="16.5" r="2.2" /><circle cx="18" cy="7.5" r="2.2" /><path className="d" d="M7.9 15.1Q13.5 14 16.3 9" /><path className="t" d="M18 14.5v3M16.5 16h3M5 5.5v2M4 6.5h2" /></>,
  // 기다리는 것들: 모래시계
  waiting: <><path d="M7 3.5h10M7 20.5h10" /><path d="M8.2 3.5c0 5 7.6 5.2 7.6 8.5s-7.6 3.5-7.6 8.5M15.8 3.5c0 5-7.6 5.2-7.6 8.5s7.6 3.5 7.6 8.5" /><path className="b" d="M12 12.5v5" /><path className="t" d="M10 18.6h4" /></>,
  // 이어 쓰기: 펜촉과 쓰다 만 줄
  resume: <><path d="M5 17.5l1-4L15.5 4a2 2 0 0 1 3 3L9 16.5z" /><path className="t" d="M13.8 5.8l3 3" /><path className="t" d="M4 21h8" /><path className="d" d="M14 21h6" /></>,
  // 기록: 눈금 위의 막대
  record: <><path d="M3 19.5h18" /><path d="M6 19.5v-5M10.5 19.5v-9.5M15 19.5v-3.5M19 19.5v-12" /><path className="t" d="M3 21.5v-2M21 21.5v-2M12 21.5v-2" /><circle className="p" cx="19" cy="6.5" r="1.4" /></>,
  // 한 줄 쪽지: 귀를 접은 종이
  memo: <><path d="M5.5 3.5h9l4 4v13h-13z" /><path className="t" d="M14.5 3.5v4h4" /><path className="t" d="M8.5 12h7M8.5 15h5" /></>,
  // 문장 수집: 따옴표
  quote: <><path d="M10 6.5c-2.6 1-4.2 3.2-4.2 6.2v3.3h4.2v-4.2H8c0-1.6.8-2.8 2-3.4z" /><path d="M19 6.5c-2.6 1-4.2 3.2-4.2 6.2v3.3H19v-4.2h-2c0-1.6.8-2.8 2-3.4z" /><path className="h" d="M4 20h16" /></>,
  // 빠른 시작: 열린 아치 문
  quick: <><path d="M7 20.5V10a5 5 0 0 1 10 0v10.5" /><path className="t" d="M4 20.5h16" /><path className="t" d="M12 8.5v5M9.5 11h5" /><path className="d" d="M12 15.5v5" /></>,
  // 성좌: 선으로 이은 별 셋
  atlas: <><path className="t" d="M5.6 17l4.8-7.6M13 8.6l4.6 5.8" /><circle cx="4.6" cy="18.6" r="1.4" /><circle cx="11.6" cy="7.4" r="1.4" /><circle cx="18.6" cy="15.8" r="1.4" /><path className="h" d="M18 4v3M16.5 5.5h3" /></>,
  // 서랍
  drawer: <><path d="M4 6.5h16v11H4z" /><path className="t" d="M4 12h16" /><path d="M10.5 9.2h3M10.5 14.8h3" /></>,
} as const;

/** 큰 달: 원반 · 밝은 쪽의 빗금 · 구덩이 · 둘레의 여덟 눈금과 오늘 자리. p 는 위상(0 삭 · .5 보름) */
export function MoonArt({ p }: { p: number }) {
  const id = useId().replace(/:/g, ''), rnd = seeded(29), R = 34, C = 60;
  const craters = Array.from({ length: 9 }, () => { const a = rnd() * Math.PI * 2, d = Math.sqrt(rnd()) * 26, r = 1.6 + rnd() * 4.2; return { x: C + Math.cos(a) * d, y: C + Math.sin(a) * d, r }; });
  const at = (r: number, deg: number): [number, number] => [C + Math.sin(deg * Math.PI / 180) * r, C - Math.cos(deg * Math.PI / 180) * r], [mx, my] = at(50, p * 360), [m2x, m2y] = at(43, p * 360);
  return <svg className="fx-art dk-moon" viewBox="0 0 120 120" aria-hidden="true">
    <defs><clipPath id={id + 'l'}><path d={moonPath(p, R, C, C)} /></clipPath><clipPath id={id + 'd'}><circle cx={C} cy={C} r={R} /></clipPath></defs>
    <circle className="h" cx={C} cy={C} r="50" /><circle className="h" cx={C} cy={C} r="57" strokeDasharray=".6 3.4" />
    {Array.from({ length: 8 }, (_, i) => { const [x1, y1] = at(50, i * 45), [x2, y2] = at(i % 2 ? 47 : 45, i * 45); return <path key={i} className="t" d={`M${f(x1)} ${f(y1)}L${f(x2)} ${f(y2)}`} />; })}
    <g clipPath={`url(#${id}l)`}><rect className="dk-lit" x="20" y="20" width="80" height="80" />{Array.from({ length: 23 }, (_, i) => <path key={i} className="t" d={`M22 ${28 + i * 3}h76`} />)}</g>
    <g clipPath={`url(#${id}d)`}>{craters.map((c, i) => <circle key={i} className={i % 3 ? 'h' : 't'} cx={f(c.x)} cy={f(c.y)} r={f(c.r)} />)}</g>
    <path className="t" d={moonPath(p, R, C, C)} /><circle cx={C} cy={C} r={R} />
    <path className="a" d={`M${f(mx)} ${f(my)}L${f(m2x)} ${f(m2y)}`} /><circle className="af" cx={f(mx)} cy={f(my)} r="2.2" />
  </svg>;
}

/** 빈 자리 그림들 (56 격자) */
const E = ({ children }: { children: ReactNode }) => <svg className="fx-art" viewBox="0 0 56 56" aria-hidden="true">{children}</svg>;
/** 캐릭터가 아직 없을 때: 비어 있는 아치 창과 그 위의 별 */
export const ArchEmpty = () => <E><path className="d" d="M16 48V26a12 12 0 0 1 24 0v22" /><path d="M10 48h36" /><path className="t" d="M28 6v7M24.5 9.5h7" /><path className="h" d="M21 48V27a7 7 0 0 1 14 0v21" /><circle className="f" cx="28" cy="30" r="1" /><path className="t" d="M44 18v3M42.5 19.5h3M11 22v2M10 23h2" /></E>;
/** 찾는 것이 없을 때: 아무것도 비치지 않은 돋보기 */
export const SearchNone = () => <E><circle cx="24" cy="24" r="13" /><circle className="h" cx="24" cy="24" r="9" /><path d="M33.6 33.6L46 46" /><path className="t" d="M42 46h8" /><path className="d" d="M17 24h14" /><path className="t" d="M44 10v4M42 12h4" /></E>;
/** 폴더가 비었을 때: 열린 서류철 */
export const FolderNone = () => <E><path d="M8 44V16h13l4 5h23v23z" /><path className="t" d="M8 26h40" /><path className="d" d="M18 35h20" /><path className="t" d="M40 8v4M38 10h4" /></E>;
/** 책상이 비었을 때: 스탠드 불빛만 있는 책상 */
export const DeskEmpty = () => <E><path d="M4 44h48" /><path className="t" d="M10 44v6M46 44v6" /><path d="M36 44V30l-8-10" /><path d="M21 15l10 4-4 7-10-4z" /><path className="d" d="M17 24l-5 20M26 27l4 17" /><path className="h" d="M32 44h10" /><circle className="p" cx="36" cy="30" r="1.6" /></E>;
