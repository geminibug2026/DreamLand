// 기본 부품: 아이콘 · 달 · 엠블럼 · 버튼 · 초상 + 화면을 다시 그리게 하는 훅
import { useEffect, useReducer, type CSSProperties, type MouseEvent, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { flushSync } from 'react-dom';
import { on } from './lib/core';
import { I } from './lib/icons';
import { moonPhase } from './lib/moon';
import { Emblems } from './lib/emblems';
import { tint } from './lib/tone';
import type { Char } from './types';

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

/** 그림이 없는 캐릭터의 초상 칸에 들어가는 문양 */
export function Emblem({ o, mini = false, center = false }: { o?: Pick<Char, 'tags' | 'name'> | null; mini?: boolean; center?: boolean }) {
  const E = Emblems;
  // center: 둥근 자리에 놓을 때. 그림마다 무게 중심이 달라(찻잔의 김, 등불의 고리 …) 격자 한가운데에 두면 치우쳐 보인다.
  // 실제로 그려진 범위를 재서 그 한가운데가 원의 중심에 오도록 보는 창(viewBox)을 다시 잡는다
  const fit = (el: HTMLSpanElement | null) => {
    const svg = center ? el?.querySelector('svg') : null; if (!svg) return;
    try { const b = (svg as SVGSVGElement).getBBox(); if (!b.width || !b.height) return; const side = Math.max(b.width, b.height) * 1.2; svg.setAttribute('viewBox', `${b.x + b.width / 2 - side / 2} ${b.y + b.height / 2 - side / 2} ${side} ${side}`); } catch { /* 아직 그려지지 않은 그림 */ }
  };
  return <span ref={fit} style={{ display: 'contents' }} dangerouslySetInnerHTML={{ __html: E.svg(E.pick(Array.isArray(o?.tags) ? o.tags : [], o?.name || ''), mini ? 'mini' : '') }} />;
}

const EMO = /(\p{Extended_Pictographic}(?:️|‍\p{Extended_Pictographic}️?)*)/u;
/** 색이 흐르는 이름: 그림 문자는 따로 감싸 제 색으로 둔다 */
export const InkName = ({ name }: { name?: string }) => <>{String(name ?? '').split(EMO).map((s, i) => i % 2 ? <span className="emo" key={i}>{s}</span> : s)}</>;

export const artStyle = (c?: { avatar?: string } | null): CSSProperties => c?.avatar ? { backgroundImage: `url("${c.avatar}")` } : {};

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
  if (o?.avatar) return <div className={`avatar ${cls}`.trim()} style={artStyle(o)} />;
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
