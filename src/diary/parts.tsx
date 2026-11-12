// 일기장 묶음의 작은 그림 조각: 표식 · 그달의 달 · 작은 달 · 티켓 반쪽 · 인화 사진 · 기다리는 버튼
import { useEffect, useMemo, useRef, useState } from 'react';
import { Icon } from '../kit';
import { K, core } from './bridge';
import { tellErr } from './logic';
import type { Keepsake } from './types';

const star4 = (x: number, y: number, s: number) => `M${x} ${y - s}L${x + s * .22} ${y - s * .22}L${x + s} ${y}L${x + s * .22} ${y + s * .22}L${x} ${y + s}L${x - s * .22} ${y + s * .22}L${x - s} ${y}L${x - s * .22} ${y - s * .22}Z`;
const GLYPH: Record<string, string> = {
  diary: '<path d="M3 1.6h6v8.8H3zM4.6 4.2h2.8M4.6 6h2.8M4.6 7.8h1.6" fill="none" stroke="currentColor" stroke-width="1"/>',
  photo: '<rect x="1.8" y="1.4" width="8.4" height="9.2" fill="none" stroke="currentColor" stroke-width="1"/><rect x="3.3" y="2.9" width="5.4" height="4.6" fill="currentColor"/>',
  scene: `<path d="${star4(6, 6, 5.4)}" fill="currentColor"/>`,
  dream: '<path d="M10 7.7A4.7 4.7 0 0 1 4.3 2 4.7 4.7 0 1 0 10 7.7z" fill="currentColor"/>',
  open: '<circle cx="6" cy="6" r="3.6" fill="none" stroke="currentColor" stroke-width="1.2"/>',
  today: '<circle cx="6" cy="6" r="3.6" fill="none" stroke="currentColor" stroke-width="1.2"/><circle cx="6" cy="6" r="1.5" fill="currentColor"/>',
  kept: '<circle cx="6" cy="6" r="4.6" fill="none" stroke="currentColor" stroke-width="1.2"/><path d="M3.7 6.2l1.7 1.7 3-3.6" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/>',
  missed: '<path d="M2.6 2.6l6.8 6.8M9.4 2.6L2.6 9.4" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>',
  letter: '<path d="M1.4 2.8h9.2v6.6H1.4zM1.4 2.8L6 6.6l4.6-3.8" fill="none" stroke="currentColor" stroke-width="1"/>',
};
const escTitle = (s: string) => s.replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c] || c));
/** 달력 칸 · 목록에 찍는 작은 표식 */
export const Glyph = ({ name, title }: { name: string; title?: string }) =>
  <svg viewBox="0 0 12 12" className={`alm-g g-${name}`} aria-hidden="true" dangerouslySetInnerHTML={{ __html: (title ? `<title>${escTitle(title)}</title>` : '') + (GLYPH[name] || GLYPH.open) }} />;

export interface DialStats { target: number; active: number; fill: number; full: boolean }
/** 그달의 달: 대화한 날만큼 차오른다. 둘레의 눈금은 보름까지의 날 수 */
export function MoonDial({ st, cls = '' }: { st: DialStats; cls?: string }) {
  const id = useMemo(() => 'aht' + core().uid(), []);
  const k = K(), c = 100, R = 60, n = st.target, p = k.fillToPhase(st.fill);
  const ticks = Array.from({ length: n }, (_, i) => { const a = i / n * 2 * Math.PI - Math.PI / 2, on = i < st.active, r1 = 76, r2 = on ? 90 : 83, x = (r: number) => (c + r * Math.cos(a)).toFixed(2), y = (r: number) => (c + r * Math.sin(a)).toFixed(2); return `<line class="${on ? 'on' : ''}" x1="${x(r1)}" y1="${y(r1)}" x2="${x(r2)}" y2="${y(r2)}"/>${on ? `<circle class="end" cx="${x(r2)}" cy="${y(r2)}" r="1.9"/>` : ''}`; }).join('');
  const lit = st.fill >= 0.999 ? `<circle class="lit" cx="${c}" cy="${c}" r="${R}"/>` : st.fill > 0.004 ? `<path class="lit" d="${k.moonPath(p, R, c, c)}"/>` : '';
  const stars = st.full ? `<path class="st" d="${star4(170, 34, 11)}"/><path class="st" d="${star4(28, 158, 7)}"/><path class="st" d="${star4(182, 76, 4)}"/>` : `<path class="st dim" d="${star4(170, 34, 6)}"/>`;
  return <div className={`alm-dial${st.full ? ' full' : ''}${cls ? ' ' + cls : ''}`} dangerouslySetInnerHTML={{ __html: `<svg viewBox="0 0 200 200" aria-hidden="true"><defs><pattern id="${id}" width="5.2" height="5.2" patternUnits="userSpaceOnUse" patternTransform="rotate(32)"><circle cx="2.6" cy="2.6" r="1.05" fill="currentColor"/></pattern></defs><g class="ticks">${ticks}</g><circle class="dark" cx="${c}" cy="${c}" r="${R}" fill="url(#${id})"/>${lit}<circle class="edge" cx="${c}" cy="${c}" r="${R}"/>${stars}</svg>` }} />;
}
/** 작은 달 (연간 띠 · 패널용) */
export const MoonMini = ({ fill, size = 22 }: { fill: number; size?: number }) =>
  <svg viewBox="0 0 24 24" width={size} height={size} className="alm-mini" aria-hidden="true" dangerouslySetInnerHTML={{ __html: `<circle cx="12" cy="12" r="10" fill="currentColor" opacity=".16"/>${fill >= 0.999 ? '<circle cx="12" cy="12" r="10" fill="currentColor"/>' : fill > 0.004 ? `<path d="${K().moonPath(K().fillToPhase(fill))}" fill="currentColor"/>` : ''}<circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" stroke-width=".8"/>` }} />;

/** 티켓 반쪽: 장면 기념품 */
export function Ticket({ k, onClick, small }: { k: Keepsake; onClick?: () => void; small?: boolean }) {
  const kk = K(), d = new Date(k.ts || core().now()), cls = `alm-ticket${small ? ' small' : ''}`;
  const kids = <>
    <div className="t-main"><small>{`SCENE No. ${kk.pad(k.no || 1)}`}</small><b>{k.title || '이름 없는 장면'}</b>{(k.place || k.time) ? <span>{[k.place, k.time].filter(Boolean).join(' · ')}</span> : null}{!small && k.summary ? <p>{k.summary}</p> : null}</div>
    <div className="t-stub"><small>ADMIT ONE</small><b>{`${kk.pad(d.getMonth() + 1)}.${kk.pad(d.getDate())}`}</b><span>{kk.seatOf(k.id)}</span></div>
  </>;
  return onClick ? <button type="button" className={cls} onClick={onClick}>{kids}</button> : <div className={cls}>{kids}</div>;
}
/** 인화 사진 */
export function Polaroid({ src, title, onClick, cls = '' }: { src: string; title?: string; onClick?: () => void; cls?: string }) {
  const c = `alm-polaroid${cls ? ' ' + cls : ''}`, kids = <><img src={src} alt="" loading="lazy" />{title ? <span>{title}</span> : null}</>;
  return onClick ? <button type="button" className={c} title={title || undefined} onClick={onClick}>{kids}</button> : <div className={c} title={title || undefined}>{kids}</div>;
}

/** 단락마다 p 로 */
export const Paras = ({ text }: { text?: string }) => <>{String(text || '').split(/\n{2,}/).map(p => p.trim()).filter(Boolean).map((p, i) => <p key={i}>{p}</p>)}</>;

/** 모델을 부르는 버튼: 도는 동안 잠기고 글이 바뀐다. 실패는 알림으로 */
export function BusyBtn({ label, ic, cls = '', busy = '쓰는 중…', title, run }: { label: string; ic?: string; cls?: string; busy?: string; title?: string; run: () => Promise<unknown> }) {
  const [on, setOn] = useState(false), alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  const click = async () => { if (on) return; setOn(true); try { await run(); } catch (e) { tellErr(e); } finally { if (alive.current) setOn(false); } };
  return <button type="button" className={`btn ${cls}${on ? ' busy' : ''}`.replace(/\s+/g, ' ').trim()} title={title} disabled={on} onClick={() => void click()}>{ic && <Icon name={ic} />}<span>{on ? busy : label}</span></button>;
}

/** 화면이 살아 있는지 (비동기 뒤에 떠났으면 상태를 건드리지 않게) */
export function useAlive() {
  const alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  return alive;
}
