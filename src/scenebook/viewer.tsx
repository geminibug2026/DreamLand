// ════════ 큰 그림 보기 ════════
// 넘겨 보기: 좌우로 밀기 · ←/→ 키 · 양옆 단추. 끝에서 더 넘기면 처음으로, 처음에서 거꾸로 넘기면 끝으로
// 확대: 두 손가락 벌리기 · 두 번 톡톡(휴대폰), 휠 · 더블클릭(PC), 확대한 뒤 끌어서 옮기기, 오른쪽 아래 단추 · +/−/0 키. 확대 중에는 밀어도 넘어가지 않는다
import { useEffect, useLayoutEffect, useRef, useState, type MouseEvent as RMouseEvent, type PointerEvent as RPointerEvent } from 'react';
import { Icon } from '../kit';
import { Btn, IBtn, openModal, type Box } from './parts';
import { menu, toast } from '../ui';
import { errText, guard, saveImage } from './util';
import { t } from '../i18n';

export interface ViewAction { label: string; ic?: string; hint?: string; danger?: boolean; run?: () => unknown; onclick?: () => unknown }
export interface ViewItem { title?: string; src: string; sub?: string; actions?: ViewAction[]; more?: ViewAction[]; original?: () => Promise<string> }
/** 넘겨 보기: count 장 가운데 index 번째부터 연다. load 는 i 번째 그림을 준다 (없으면 null — 그 장은 건너뛴다) */
export interface ViewNav { count: number; index: number; load(i: number): ViewItem | null | Promise<ViewItem | null> }

const MAX = 6, STEP = 1.4;
/** 창 머리의 제목: 넘길 때마다 바뀐다 */
function hub(first: string) {
  let v = first; const subs = new Set<() => void>();
  return { get: () => v, set(x: string) { if (x !== v) { v = x; subs.forEach(f => f()); } }, sub(f: () => void) { subs.add(f); return () => { subs.delete(f); }; } };
}
type Hub = ReturnType<typeof hub>;
function Title({ h }: { h: Hub }) { const [, re] = useState(0); useEffect(() => h.sub(() => re(n => n + 1)), [h]); return <>{h.get()}</>; }

export function viewer(first: ViewItem, nav?: ViewNav | null) {
  const h = hub(first.title || '');   // 제목이 없으면 비워 둔다
  return openModal({ title: <Title h={h} />, wide: true, cls: 'sb-viewer' }, box => <Viewer box={box} first={first} nav={nav && nav.count > 1 ? nav : null} h={h} />);
}

function Viewer({ box, first, nav, h }: { box: Box; first: ViewItem; nav: ViewNav | null; h: Hub }) {
  const [at, setAt] = useState(nav?.index ?? 0), [item, setItem] = useState(first), [zoomed, setZoomed] = useState(false);
  const stage = useRef<HTMLDivElement>(null), img = useRef<HTMLImageElement>(null);
  // 확대 상태는 손가락을 따라 바로 그리도록 React 상태 밖에 둔다
  const z = useRef({ s: 1, x: 0, y: 0, swipe: 0 }), busy = useRef(false), seq = useRef(0);
  const paint = (anim = false) => {
    const el = img.current; if (!el) return; const { s, x, y, swipe } = z.current;
    el.style.transition = anim ? 'transform .18s ease-out, opacity .18s' : 'none';
    el.style.transform = s === 1 && !swipe ? '' : `translate(${x + swipe}px, ${y}px) scale(${s})`;
    el.style.opacity = swipe ? String(Math.max(0.55, 1 - Math.abs(swipe) / 600)) : '';
    if ((s > 1.001) !== zoomed) setZoomed(s > 1.001);
  };
  /** 확대한 그림이 칸 밖으로 다 빠져나가지 않게 옮길 거리를 묶는다 */
  const clamp = () => {
    const el = img.current, q = z.current; if (!el) return;
    const mx = el.offsetWidth * (q.s - 1) / 2, my = el.offsetHeight * (q.s - 1) / 2;
    q.x = Math.max(-mx, Math.min(mx, q.x)); q.y = Math.max(-my, Math.min(my, q.y));
  };
  /** (px, py: 칸 가운데 기준) 를 붙잡은 채로 배율을 바꾼다 */
  const zoomTo = (ns: number, px = 0, py = 0, anim = true) => {
    const q = z.current, s = Math.max(1, Math.min(MAX, ns));
    q.x = px - (px - q.x) * (s / q.s); q.y = py - (py - q.y) * (s / q.s); q.s = s;
    if (s === 1) { q.x = 0; q.y = 0; }
    clamp(); paint(anim);
  };
  const reset = (anim = true) => { z.current = { s: 1, x: 0, y: 0, swipe: 0 }; paint(anim); };
  const local = (cx: number, cy: number) => { const r = stage.current!.getBoundingClientRect(); return [cx - r.left - r.width / 2, cy - r.top - r.height / 2] as const; };

  const go = async (d: number) => {
    if (!nav || busy.current) return;
    busy.current = true; const my = ++seq.current;
    try {
      for (let k = 1; k < nav.count; k++) {
        const n = ((at + d * k) % nav.count + nav.count) % nav.count, next = await nav.load(n);
        if (my !== seq.current) return;
        if (!next) continue;
        z.current = { s: 1, x: 0, y: 0, swipe: 0 }; setAt(n); setItem(next); h.set(next.title || ''); return;
      }
      toast(t('scenebook.view.none'));
    } catch (e) { toast(errText(e), 'err'); } finally { busy.current = false; }
  };
  // 새 그림이 뜨면 확대 · 밀던 자리를 처음으로
  useLayoutEffect(() => { reset(false); }, [item]);   // eslint-disable-line react-hooks/exhaustive-deps

  // 키: 이 창이 맨 위일 때만 (입력 칸에서 누른 것은 건드리지 않는다)
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (box.el !== document.getElementById('modals')?.lastElementChild || e.altKey || e.ctrlKey || e.metaKey) return;
      if ((e.target as HTMLElement | null)?.closest?.('input, textarea, select, [contenteditable]')) return;
      const k = e.key;
      if (k === 'ArrowLeft' || k === 'ArrowRight') { if (!nav) return; e.preventDefault(); e.stopPropagation(); void go(k === 'ArrowLeft' ? -1 : 1); }
      else if (k === '+' || k === '=') { e.preventDefault(); zoomTo(z.current.s * STEP); }
      else if (k === '-' || k === '_') { e.preventDefault(); zoomTo(z.current.s / STEP); }
      else if (k === '0') { e.preventDefault(); reset(); }
    };
    addEventListener('keydown', key, true);   // 대화 화면의 단축키보다 먼저 받는다
    return () => removeEventListener('keydown', key, true);
  });
  // 휠: 그림 위에서 굴리면 그 자리를 중심으로 확대 · 축소 (창이 대신 스크롤되지 않게 수동 리스너)
  useEffect(() => {
    const el = stage.current; if (!el) return;
    const wheel = (e: WheelEvent) => { e.preventDefault(); const [px, py] = local(e.clientX, e.clientY); zoomTo(z.current.s * Math.exp(-Math.max(-120, Math.min(120, e.deltaY)) * 0.004), px, py, false); };
    el.addEventListener('wheel', wheel, { passive: false });
    return () => el.removeEventListener('wheel', wheel);
  });

  // 손가락 · 마우스
  const pts = useRef(new Map<number, { x: number; y: number }>());
  const g = useRef<{ mode: '' | 'pan' | 'swipe' | 'pinch'; x0: number; y0: number; t0: number; moved: boolean; d0: number; s0: number; mx: number; my: number; qx: number; qy: number; type: string }>({ mode: '', x0: 0, y0: 0, t0: 0, moved: false, d0: 0, s0: 1, mx: 0, my: 0, qx: 0, qy: 0, type: '' });
  const lastTap = useRef({ t: 0, x: 0, y: 0 });
  const pinchStart = () => {
    const [a, b] = [...pts.current.values()], st = g.current, q = z.current;
    st.mode = 'pinch'; st.d0 = Math.hypot(a.x - b.x, a.y - b.y) || 1; st.s0 = q.s; [st.mx, st.my] = local((a.x + b.x) / 2, (a.y + b.y) / 2); st.qx = q.x; st.qy = q.y; q.swipe = 0;
  };
  const down = (e: RPointerEvent<HTMLDivElement>) => {
    if (e.button > 0) return;
    try { (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId); } catch { /* 이미 뗀 손가락 — 잡지 않아도 칸 안의 움직임은 받는다 */ }
    pts.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const st = g.current; st.type = e.pointerType;
    if (pts.current.size === 2) { pinchStart(); return; }
    if (pts.current.size > 2) return;
    Object.assign(st, { mode: z.current.s > 1.001 ? 'pan' : nav ? 'swipe' : '', x0: e.clientX, y0: e.clientY, t0: performance.now(), moved: false, qx: z.current.x, qy: z.current.y });
  };
  const move = (e: RPointerEvent<HTMLDivElement>) => {
    const p = pts.current.get(e.pointerId); if (!p) return;
    p.x = e.clientX; p.y = e.clientY;
    const st = g.current, q = z.current;
    if (st.mode === 'pinch' && pts.current.size >= 2) {
      const [a, b] = [...pts.current.values()], d = Math.hypot(a.x - b.x, a.y - b.y), [mx, my] = local((a.x + b.x) / 2, (a.y + b.y) / 2);
      const s = Math.max(1, Math.min(MAX, st.s0 * d / st.d0));
      // 두 손가락 가운데 아래의 그림 자리가 손가락을 따라오게
      q.x = mx - (st.mx - st.qx) * (s / st.s0); q.y = my - (st.my - st.qy) * (s / st.s0); q.s = s; if (s === 1) { q.x = 0; q.y = 0; }
      clamp(); paint(); return;
    }
    const dx = e.clientX - st.x0, dy = e.clientY - st.y0;
    if (Math.hypot(dx, dy) > 8) st.moved = true;
    if (st.mode === 'pan') { q.x = st.qx + dx; q.y = st.qy + dy; clamp(); paint(); }
    else if (st.mode === 'swipe' && Math.abs(dx) > Math.abs(dy)) { q.swipe = dx; paint(); }
  };
  const up = (e: RPointerEvent<HTMLDivElement>) => {
    if (!pts.current.delete(e.pointerId)) return;
    const st = g.current, q = z.current;
    if (st.mode === 'pinch') { if (pts.current.size === 1) { const [p] = [...pts.current.values()]; Object.assign(st, { mode: q.s > 1.001 ? 'pan' : '', x0: p.x, y0: p.y, qx: q.x, qy: q.y, moved: true }); } else st.mode = ''; return; }
    if (pts.current.size) return;
    const dx = e.clientX - st.x0, dy = e.clientY - st.y0, mode = st.mode; st.mode = '';
    if (mode === 'swipe' && Math.abs(dx) > 56 && Math.abs(dx) > Math.abs(dy) * 1.2) { q.swipe = 0; void go(dx < 0 ? 1 : -1); return; }
    if (q.swipe) { q.swipe = 0; paint(true); }
    // 두 번 톡톡: 확대 ↔ 원래 크기 (마우스는 dblclick 이 한다)
    if (st.type !== 'mouse' && !st.moved && performance.now() - st.t0 < 300) {
      const now = performance.now(), l = lastTap.current;
      if (now - l.t < 320 && Math.hypot(e.clientX - l.x, e.clientY - l.y) < 40) { lastTap.current = { t: 0, x: 0, y: 0 }; const [px, py] = local(e.clientX, e.clientY); if (q.s > 1.001) reset(); else zoomTo(2.5, px, py); }
      else lastTap.current = { t: now, x: e.clientX, y: e.clientY };
    }
  };
  const cancel = (e: RPointerEvent<HTMLDivElement>) => { pts.current.delete(e.pointerId); if (!pts.current.size) { g.current.mode = ''; if (z.current.swipe) { z.current.swipe = 0; paint(true); } } };
  const dbl = (e: RMouseEvent<HTMLDivElement>) => { if (g.current.type && g.current.type !== 'mouse') return; const [px, py] = local(e.clientX, e.clientY); if (z.current.s > 1.001) reset(); else zoomTo(2.5, px, py); };

  const run = (a: ViewAction) => async () => { box.close(); try { await (a.run || a.onclick)?.(); } catch (e) { toast(errText(e), 'err'); } };
  const title = item.title || t('scenebook.illust');   // 그림 설명(alt)에만 쓴다 — 화면 제목은 비어 있을 수 있다
  return <>
    <div className={'sb-viewer-frame' + (zoomed ? ' zoomed' : '')}>
      <div className="sb-viewer-stage" ref={stage} onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={cancel} onDoubleClick={dbl}>
        <img ref={img} src={item.src} alt={title} draggable={false} />
      </div>
    </div>
    {/* 넘기기 · 확대 단추는 그림을 가리지 않게 그림 아래 한 줄에 */}
    <div className="sb-view-bar">
      {nav ? <div className="sb-view-nav" role="group" aria-label={t('scenebook.view.nav')}>
        <button type="button" title={t('scenebook.view.prev')} aria-label={t('scenebook.view.prev')} onClick={() => void go(-1)}><Icon name="left" size={18} /></button>
        <span className="sb-view-count" aria-live="polite">{`${at + 1} / ${nav.count}`}</span>
        <button type="button" title={t('scenebook.view.next')} aria-label={t('scenebook.view.next')} onClick={() => void go(1)}><Icon name="right" size={18} /></button>
      </div> : <span />}
      <div className="sb-view-zoom" role="group" aria-label={t('scenebook.view.zoom')}>
        <button type="button" title={t('scenebook.view.zoomOut')} aria-label={t('scenebook.view.zoomOut')} disabled={!zoomed} onClick={() => zoomTo(z.current.s / STEP)}><Icon name="minus" size={16} /></button>
        <button type="button" title={t('scenebook.view.zoomIn')} aria-label={t('scenebook.view.zoomIn')} onClick={() => zoomTo(z.current.s * STEP)}><Icon name="plus" size={16} /></button>
        <button type="button" title={t('scenebook.view.fit')} aria-label={t('scenebook.view.fit')} disabled={!zoomed} onClick={() => reset()}><Icon name="fit" size={16} /></button>
      </div>
    </div>
    {item.sub ? <p className="hint">{item.sub}</p> : null}
    <div className="sb-viewer-foot">{(item.actions || []).map((a, i) => <Btn key={i} label={a.label} ic={a.ic} cls="ghost" onClick={run(a)} />)}<Btn label={t('common.save')} ic="import" cls="ghost" onClick={guard(async () => saveImage((item.original && await item.original()) || item.src, title))} />
      {item.more?.length ? <IBtn ic="more" title={t('scenebook.more')} onClick={e => menu(e.currentTarget, item.more!.map(a => ({ label: a.label, ic: a.ic, hint: a.hint, danger: a.danger, onclick: run(a) })))} /> : null}</div>
    {nav ? <p className="hint sb-view-tip">{t('scenebook.view.tip')}</p> : null}
  </>;
}
