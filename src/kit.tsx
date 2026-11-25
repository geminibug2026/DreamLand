// 기본 부품: 아이콘 · 달 · 엠블럼 · 버튼 · 초상 + 화면을 다시 그리게 하는 훅
import { useEffect, useReducer, useState, useSyncExternalStore, type CSSProperties, type HTMLAttributes, type MouseEvent, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { flushSync } from 'react-dom';
import { on } from './lib/core';
import { I } from './lib/icons';
import { moonPhase } from './lib/moon';
import { Emblems } from './lib/emblems';
import { tint } from './lib/tone';
import type { Char } from './types';
import { shownUrl, thumbUrl, thumbSub, thumbVer } from './lib/blobUrl';

export function Icon({ name, size = 18 }: { name: string; size?: number }) {
  return <svg viewBox="0 0 24 24" width={size} height={size} className="ic"><path d={I[name] || I.sparkle} fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" /></svg>;
}

/** 그날의 달 모양 */
export function Moon({ size = 22, date }: { size?: number; date?: Date }) {
  const { p, name } = moonPhase(date); const waxing = p < 0.5, gibbous = p > 0.25 && p < 0.75;
  const rx = (10 * Math.abs(Math.cos(2 * Math.PI * p))).toFixed(2);
  const lit = `M12 2 A10 10 0 0 ${waxing ? 1 : 0} 12 22 A${rx} 10 0 0 ${waxing ? (gibbous ? 1 : 0) : (gibbous ? 0 : 1)} 12 2Z`;
  return <svg viewBox="0 0 24 24" width={size} height={size} className="ic moon"><title>{name}</title><circle cx="12" cy="12" r="10" fill="currentColor" opacity=".22" /><path d={lit} fill="currentColor" /></svg>;
}

const fitBox = new Map<string, string>();
/** 그림이 없는 캐릭터의 초상 칸에 들어가는 문양 */
export function Emblem({ o, mini = false, center = false }: { o?: Pick<Char, 'tags' | 'name'> | null; mini?: boolean; center?: boolean }) {
  const E = Emblems;
  // center: 둥근 자리에 놓을 때. 그림마다 무게 중심이 달라(찻잔의 김, 등불의 고리 …) 격자 한가운데에 두면 치우쳐 보인다.
  // 실제로 그려진 범위를 재서 그 한가운데가 원의 중심에 오도록 보는 창(viewBox)을 다시 잡는다
  const kind = E.pick(Array.isArray(o?.tags) ? o.tags : [], o?.name || ''), key = kind + (mini ? '.m' : '');
  // 같은 그림은 한 번만 잰다 — 재는 일(getBBox)은 그때마다 화면 배치를 다시 계산하게 해서, 그릴 때마다 재면 목록이 버벅인다
  const fit = (el: HTMLSpanElement | null) => {
    const svg = center ? el?.querySelector('svg') : null; if (!svg) return;
    const known = fitBox.get(key); if (known) { if (svg.getAttribute('viewBox') !== known) svg.setAttribute('viewBox', known); return; }
    try { const b = (svg as SVGSVGElement).getBBox(); if (!b.width || !b.height) return; const side = Math.max(b.width, b.height) * 1.2, vb = `${b.x + b.width / 2 - side / 2} ${b.y + b.height / 2 - side / 2} ${side} ${side}`; fitBox.set(key, vb); svg.setAttribute('viewBox', vb); } catch { /* 아직 그려지지 않은 그림 */ }
  };
  return <span ref={fit} style={{ display: 'contents' }} dangerouslySetInnerHTML={{ __html: E.svg(kind, mini ? 'mini' : '') }} />;
}

const EMO = /(\p{Extended_Pictographic}(?:️|‍\p{Extended_Pictographic}️?)*)/u;
/** 색이 흐르는 이름: 그림 문자는 따로 감싸 제 색으로 둔다 */
export const InkName = ({ name }: { name?: string }) => <>{String(name ?? '').split(EMO).map((s, i) => i % 2 ? <span className="emo" key={i}>{s}</span> : s)}</>;

export const artStyle = (c?: { avatar?: string } | null): CSSProperties => { const u = c?.avatar ? shownUrl(c.avatar) : ''; return u ? { backgroundImage: `url("${u}")` } : {}; };
/** 원본 초상 그림 (img). 준비되기 전에는 그리지 않는다 */
export function ArtImg({ src, className }: { src?: string | null; className?: string }) { const u = useArt(src); return u ? <img className={className} src={u} alt="" /> : null; }
/** 원본 초상을 바탕으로 건 칸. 초상을 꼬리표로만 들고 있으면(src/lib/avatars.ts) 꺼내 오는 대로 다시 그린다 */
export function Art({ o, tag = 'div', children, ...rest }: { o?: { avatar?: string } | null; tag?: 'div' | 'button' | 'i' | 'span'; children?: ReactNode } & Omit<HTMLAttributes<HTMLElement>, 'style'>) {
  const u = useDecodedArt(o?.avatar), Tag = tag as 'div';
  return <Tag {...(rest as HTMLAttributes<HTMLDivElement>)} style={u ? { backgroundImage: `url("${u}")` } : undefined}>{children}</Tag>;
}
/** 큰 초상 주소. 작은 그림을 걸어 둔 채 원본이 오면, 원본이 다 풀린(decode) 뒤에 바꾼다 —
 *  안 풀린 큰 그림으로 바로 바꾸면 휴대폰에서 그 자리가 잠깐 비어 깜빡인다 (캐릭터 정보 창이 올라온 뒤 깜빡이던 것). 다른 그림으로 바뀔 때는 바로 건다 */
function useDecodedArt(src?: string | null): string {
  const u = useArt(src);
  const [held, setHeld] = useState<{ src?: string | null; u: string }>(() => ({ src, u }));
  const same = held.src === src;
  useEffect(() => {
    if (!same) { setHeld({ src, u }); return; }
    if (!u || u === held.u) return;
    if (!held.u) { setHeld({ src, u }); return; }   // 앞에 걸린 그림이 없으면 기다릴 것 없이
    let live = true; const im = new Image(); im.src = u;
    const done = () => { if (live) setHeld({ src, u }); };
    (typeof im.decode === 'function' ? im.decode() : Promise.resolve()).then(done, done);
    return () => { live = false; };
  }, [src, u, same, held.u]);
  return !same ? u : held.u || u;
}
/** 작게 그리는 자리(목록 · 동그라미)용: 큰 초상은 줄인 그림으로. 쓰는 컴포넌트는 useThumbs() 를 불러 준비되면 다시 그린다 */
export const thumbStyle = (c?: { avatar?: string } | null): CSSProperties => { if (!c?.avatar) return {}; const u = thumbUrl(c.avatar); return u ? { backgroundImage: `url("${u}")` } : {}; };
export const useThumbs = () => useSyncExternalStore(thumbSub, thumbVer);
/** 이 그림 하나의 작은 그림 주소. 그 그림이 준비됐을 때만 다시 그린다 (목록의 칸마다 쓴다 — 다른 칸의 그림이 올 때마다 목록 전체를 다시 그리지 않게) */
export const useThumb = (src?: string | null): string => useSyncExternalStore(thumbSub, () => thumbUrl(src));
/** 크게 거는 그림 주소 (원본). 꼬리표로만 들고 있는 초상은 꺼내 오는 대로 다시 그린다 */
export const useArt = (src?: string | null): string => useSyncExternalStore(thumbSub, () => shownUrl(src));

export function Btn({ label, ic, cls = '', title, onClick }: { label?: string; ic?: string; cls?: string; title?: string; onClick?: (e: MouseEvent<HTMLButtonElement>) => void }) {
  return <button type="button" className={`btn ${cls}`.trim()} title={title ?? (label ? undefined : '')} onClick={onClick}>{ic && <Icon name={ic} />}{label && <span>{label}</span>}</button>;
}
export function IconBtn({ ic, title, cls = '', onClick }: { ic: string; title: string; cls?: string; onClick?: (e: MouseEvent<HTMLButtonElement>) => void }) {
  return <button type="button" className={`ibtn ${cls}`.trim()} title={title} aria-label={title} onClick={onClick}><Icon name={ic} /></button>;
}

/** 요소를 캐릭터 초상의 색으로 물들이는 ref */
export const tintRef = (o?: Char | null) => (el: HTMLElement | null) => { if (el) tint(el, o ?? null); };

/** 작은 동그란 초상 */
export function Avatar({ o, cls = '' }: { o?: { avatar?: string; name?: string; tags?: string[] } | null; cls?: string }) {
  const u = useThumb(o?.avatar);
  if (o?.avatar) return <div className={`avatar ${cls}`.trim()} style={u ? { backgroundImage: `url("${u}")` } : undefined} />;
  if (Array.isArray(o?.tags) && cls !== 'xs') return <div className={`avatar ${cls} blank`.replace(/\s+/g, ' ')}><Emblem o={{ tags: o.tags, name: o.name || '' }} mini /></div>;
  return <div className={`avatar ${cls} blank`.replace(/\s+/g, ' ')}>{(o?.name || '?').trim().slice(0, 1)}</div>;
}

/** 아직 옮기지 않은 옛 코드가 만든 DOM 조각을 그대로 끼워 넣는다 (옮기는 동안만 쓴다) */
export function Dom({ node }: { node: Node | null | undefined }) {
  return <span style={{ display: 'contents' }} ref={el => { if (el) el.replaceChildren(...(node ? [node] : [])); }} />;
}

/** 이 이름의 알림이 오면 다시 그린다. 돌려주는 함수를 부르면 직접 다시 그린다 */
export function useEvents(...evs: string[]): () => void {
  const [, bump] = useReducer((x: number) => x + 1, 0);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { const offs = evs.map(e => on(e, bump)); return () => offs.forEach(f => f()); }, []);
  return bump;
}

/** 옛 창(modal) 안이나 문서 어딘가에 React 조각을 올린다. 돌려주는 함수로 내린다 */
export function mountInto(el: HTMLElement, node: ReactNode): () => void {
  const root: Root = createRoot(el); flushSync(() => root.render(node));
  return () => root.unmount();
}
