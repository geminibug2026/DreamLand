// ════════ 큰 그림 보기 ════════
// 넘겨 보기: 좌우로 밀기(살짝 튕겨도) · ←/→ 키 · 아래 단추. 끝에서 더 넘기면 처음으로, 처음에서 거꾸로 넘기면 끝으로
// 확대: 두 손가락 벌리기 · 두 번 톡톡(휴대폰), 휠 · 더블클릭(PC), 확대한 뒤 끌어서 옮기기, 아래 단추 · +/−/0 키. 확대 중에는 밀어도 넘어가지 않는다
// 손가락을 따라갈 때는 크기를 손을 댈 때 한 번만 재고, 화면은 한 프레임에 한 번만 고친다. 가장자리 · 한계를 넘으면 조금만 끌려오다 손을 떼면 제자리로 미끄러진다
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

const MIN = 1, MAX = 6, STEP = 1.4;
const clampN = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
/** 가장자리 · 한계를 넘으면 손가락을 일부만 따라간다 */
const resist = (v: number, limit: number, give = 0.35) => Math.abs(v) <= limit ? v : Math.sign(v) * (limit + (Math.abs(v) - limit) * give);
const soften = (s: number) => s < MIN ? MIN - (MIN - s) * 0.45 : s > MAX ? MAX + (s - MAX) * 0.25 : s;
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

type Size = { w: number; h: number; sw: number; sh: number; cx: number; cy: number };
function Viewer({ box, first, nav, h }: { box: Box; first: ViewItem; nav: ViewNav | null; h: Hub }) {
  const [at, setAt] = useState(nav?.index ?? 0), [item, setItem] = useState(first), [zoom, setZoom] = useState<'' | 'in' | 'max'>(''), pctEl = useRef<HTMLButtonElement>(null);
  const stage = useRef<HTMLDivElement>(null), img = useRef<HTMLImageElement>(null);
  // 확대 상태는 손가락을 따라 바로 그리도록 React 상태 밖에 둔다
  const z = useRef({ s: 1, x: 0, y: 0 }), size = useRef<Size | null>(null), frame = useRef(0), shown = useRef(''), busy = useRef(false), seq = useRef(0);
  const measure = (): Size => { const st = stage.current!, el = img.current!, r = st.getBoundingClientRect(); return (size.current = { w: el.offsetWidth, h: el.offsetHeight, sw: st.clientWidth, sh: st.clientHeight, cx: r.left + r.width / 2, cy: r.top + r.height / 2 }); };
  const limits = (s: number) => { const b = size.current ?? measure(); return [Math.max(0, (b.w * s - b.sw) / 2), Math.max(0, (b.h * s - b.sh) / 2)] as const; };
  const write = () => {
    frame.current = 0; const el = img.current; if (!el) return; const { s, x, y } = z.current;
    const v = s === 1 && !x && !y ? '' : `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0) scale(${s.toFixed(4)})`;
    if (v !== shown.current) { el.style.transform = v; shown.current = v; }
    el.style.opacity = s === 1 && x ? String(Math.max(0.55, 1 - Math.abs(x) / 600)) : '';
    // 배율 글자는 바로 고치고, 화면을 다시 그리는 것은 확대 · 최대에 들고 날 때만
    if (pctEl.current) pctEl.current.textContent = `${Math.round(s * 100)}%`; setZoom(s >= MAX - 0.001 ? 'max' : s > 1.001 ? 'in' : '');
  };
  const paint = () => { frame.current ||= requestAnimationFrame(write); };
  const now = () => { cancelAnimationFrame(frame.current); write(); };
  /** 한계 안으로 되돌린다 (손을 뗀 뒤에는 미끄러지며 돌아온다) */
  const settle = () => {
    const q = z.current; q.s = clampN(q.s, MIN, MAX);
    if (q.s === MIN) { q.x = 0; q.y = 0; } else { const [lx, ly] = limits(q.s); q.x = clampN(q.x, -lx, lx); q.y = clampN(q.y, -ly, ly); }
    now();
  };
  /** (cx, cy: 화면 좌표) 아래의 그림 자리를 붙잡은 채로 배율을 바꾼다 */
  const zoomAt = (next: number, cx?: number, cy?: number) => {
    const b = measure(), q = z.current, s = clampN(next, MIN, MAX), px = (cx ?? b.cx) - b.cx, py = (cy ?? b.cy) - b.cy;
    q.x = px - (px - q.x) * (s / q.s); q.y = py - (py - q.y) * (s / q.s); q.s = s; settle();
  };
  const reset = () => { z.current = { s: 1, x: 0, y: 0 }; size.current = null; now(); };
  const gesture = (on: boolean) => img.current?.classList.toggle('sb-gesture', on);

  const go = async (d: number) => {
    if (!nav || busy.current) return;
    busy.current = true; const my = ++seq.current;
    try {
      for (let k = 1; k < nav.count; k++) {
        const n = ((at + d * k) % nav.count + nav.count) % nav.count, next = await nav.load(n);
        if (my !== seq.current) return;
        if (!next) continue;
        setAt(n); setItem(next); h.set(next.title || ''); return;
      }
      toast(t('scenebook.view.none'));
    } catch (e) { toast(errText(e), 'err'); } finally { busy.current = false; }
  };
  // 새 그림이 뜨면 확대 · 밀던 자리를 처음으로
  useLayoutEffect(() => { gesture(false); reset(); }, [item]);   // eslint-disable-line react-hooks/exhaustive-deps
  // 창 크기가 바뀌면 원래 크기로 (잰 크기가 맞지 않게 된다)
  useEffect(() => { const f = () => reset(); addEventListener('resize', f); return () => { removeEventListener('resize', f); cancelAnimationFrame(frame.current); }; }, []);   // eslint-disable-line react-hooks/exhaustive-deps

  // 키: 이 창이 맨 위일 때만 (입력 칸에서 누른 것은 건드리지 않는다)
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (box.el !== document.getElementById('modals')?.lastElementChild || e.altKey || e.ctrlKey || e.metaKey) return;
      if ((e.target as HTMLElement | null)?.closest?.('input, textarea, select, [contenteditable]')) return;
      const k = e.key;
      if (k === 'ArrowLeft' || k === 'ArrowRight') { if (!nav) return; e.preventDefault(); e.stopPropagation(); void go(k === 'ArrowLeft' ? -1 : 1); }
      else if (k === '+' || k === '=') { e.preventDefault(); zoomAt(z.current.s * STEP); }
      else if (k === '-' || k === '_') { e.preventDefault(); zoomAt(z.current.s / STEP); }
      else if (k === '0') { e.preventDefault(); reset(); }
    };
    addEventListener('keydown', key, true);   // 대화 화면의 단축키보다 먼저 받는다
    return () => removeEventListener('keydown', key, true);
  });
  // 휠: 그림 위에서 굴리면 그 자리를 중심으로 확대 · 축소 (창이 대신 스크롤되지 않게 수동 리스너)
  useEffect(() => {
    const el = stage.current; if (!el) return;
    const wheel = (e: WheelEvent) => { e.preventDefault(); gesture(true); zoomAt(z.current.s * Math.exp(-clampN(e.deltaY, -120, 120) * 0.004), e.clientX, e.clientY); gesture(false); };
    el.addEventListener('wheel', wheel, { passive: false });
    return () => el.removeEventListener('wheel', wheel);
  });

  // 손가락 · 마우스: 한 손가락은 확대한 그림을 옮기거나 다음 그림으로 밀고, 두 손가락은 확대 · 축소. 확대 중이거나 막 오므린 뒤에는 넘기지 않는다
  const pts = useRef(new Map<number, { x: number; y: number }>());
  type G = { kind: 'pan' | 'swipe' | 'pinch'; x: number; y: number; t: number; moved: boolean; s0: number; x0: number; y0: number; d0: number; mx: number; my: number; type: string };
  const g = useRef<G | null>(null), lastTap = useRef<{ t: number; x: number; y: number } | null>(null);
  const local = (p: { x: number; y: number }) => { const b = size.current ?? measure(); return { x: p.x - b.cx, y: p.y - b.cy }; };
  const pair = () => [...pts.current.values()].slice(0, 2);
  const startPinch = (type: string) => { const [a, b] = pair(), q = z.current, m = local({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }); g.current = { kind: 'pinch', x: 0, y: 0, t: performance.now(), moved: true, s0: q.s, x0: q.x, y0: q.y, d0: Math.max(1, Math.hypot(a.x - b.x, a.y - b.y)), mx: m.x, my: m.y, type }; };
  const startOne = (p: { x: number; y: number }, afterPinch: boolean, type: string) => { const q = z.current; g.current = { kind: afterPinch || q.s > 1.001 ? 'pan' : 'swipe', x: p.x, y: p.y, t: performance.now(), moved: afterPinch, s0: q.s, x0: q.x, y0: q.y, d0: 0, mx: 0, my: 0, type }; };
  const down = (e: RPointerEvent<HTMLDivElement>) => {
    if (e.button > 0) return;
    try { (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId); } catch { /* 이미 뗀 손가락 — 잡지 않아도 칸 안의 움직임은 받는다 */ }
    if (!pts.current.size) { measure(); gesture(true); }
    pts.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pts.current.size === 2) startPinch(e.pointerType); else if (pts.current.size === 1) startOne({ x: e.clientX, y: e.clientY }, false, e.pointerType);
  };
  const move = (e: RPointerEvent<HTMLDivElement>) => {
    const p = pts.current.get(e.pointerId), st = g.current; if (!p || !st) return;
    p.x = e.clientX; p.y = e.clientY; const q = z.current;
    if (st.kind === 'pinch') {
      if (pts.current.size < 2) return;
      const [a, b] = pair(), m = local({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
      q.s = soften(st.s0 * Math.hypot(a.x - b.x, a.y - b.y) / st.d0); const r = q.s / st.s0, [lx, ly] = limits(q.s);
      // 두 손가락 가운데 아래의 그림 자리가 손가락을 따라오게
      q.x = resist(m.x - (st.mx - st.x0) * r, lx, 0.6); q.y = resist(m.y - (st.my - st.y0) * r, ly, 0.6); paint(); return;
    }
    const dx = e.clientX - st.x, dy = e.clientY - st.y;
    if (Math.hypot(dx, dy) > 8) st.moved = true;
    if (st.kind === 'pan') { const [lx, ly] = limits(q.s); q.x = resist(st.x0 + dx, lx); q.y = resist(st.y0 + dy, ly); paint(); }
    else if (nav && Math.abs(dx) > Math.abs(dy)) { q.x = dx; q.y = 0; paint(); }
  };
  const up = (e: RPointerEvent<HTMLDivElement>) => {
    if (!pts.current.delete(e.pointerId)) return;
    const st = g.current;
    // 오므린 뒤 한 손가락이 남으면 그 자리에서 이어 옮긴다 (튀지 않게)
    if (st?.kind === 'pinch') { if (pts.current.size >= 2) startPinch(st.type); else if (pts.current.size === 1) { const [p] = pts.current.values(); startOne(p, true, st.type); } else { g.current = null; gesture(false); settle(); } return; }
    if (pts.current.size) return;
    g.current = null; if (!st) { gesture(false); settle(); return; }
    const dx = e.clientX - st.x, dy = e.clientY - st.y, quick = performance.now() - st.t, sw = size.current?.sw ?? 360;
    if (st.kind === 'swipe' && nav) {
      // 멀리 밀었거나, 짧아도 빠르게 튕겼으면 넘긴다
      const far = Math.abs(dx) > Math.max(60, sw * 0.18) || (Math.abs(dx) > 30 && Math.abs(dx) / Math.max(1, quick) > 0.5);
      if (far && Math.abs(dx) > Math.abs(dy) * 1.2) { void go(dx < 0 ? 1 : -1).finally(() => { if (z.current.x) { gesture(false); settle(); } }); return; }   // 못 넘겼으면 제자리로
    }
    gesture(false); settle();
    // 두 번 톡톡: 그 자리를 확대 ↔ 원래 크기 (마우스는 dblclick 이 한다)
    if (st.type !== 'mouse' && !st.moved && quick < 300) {
      const tm = performance.now(), l = lastTap.current;
      if (l && tm - l.t < 320 && Math.hypot(e.clientX - l.x, e.clientY - l.y) < 40) { lastTap.current = null; if (z.current.s > 1.001) zoomAt(1); else zoomAt(2.5, e.clientX, e.clientY); }
      else lastTap.current = { t: tm, x: e.clientX, y: e.clientY };
    }
  };
  const dbl = (e: RMouseEvent<HTMLDivElement>) => { if (g.current && g.current.type !== 'mouse') return; if (z.current.s > 1.001) zoomAt(1); else zoomAt(2.5, e.clientX, e.clientY); };

  const run = (a: ViewAction) => async () => { box.close(); try { await (a.run || a.onclick)?.(); } catch (e) { toast(errText(e), 'err'); } };
  const title = item.title || t('scenebook.illust'), zoomed = !!zoom;   // 그림 설명(alt)에만 쓴다 — 화면 제목은 비어 있을 수 있다
  return <>
    <div className={'sb-viewer-frame' + (zoomed ? ' zoomed' : '')}>
      <div className="sb-viewer-stage" ref={stage} aria-label={t('scenebook.view.stage')} onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up} onLostPointerCapture={up} onDoubleClick={dbl}>
        <img ref={img} src={item.src} alt={title} draggable={false} />
      </div>
    </div>
    {/* 넘기기 · 확대 단추는 그림을 가리지 않게 그림 아래 한 줄에. 가운데 배율을 누르면 원래 크기 */}
    <div className="sb-view-bar">
      {nav ? <div className="sb-view-nav" role="group" aria-label={t('scenebook.view.nav')}>
        <button type="button" title={t('scenebook.view.prev')} aria-label={t('scenebook.view.prev')} onClick={() => void go(-1)}><Icon name="left" size={18} /></button>
        <span className="sb-view-count" aria-live="polite">{`${at + 1} / ${nav.count}`}</span>
        <button type="button" title={t('scenebook.view.next')} aria-label={t('scenebook.view.next')} onClick={() => void go(1)}><Icon name="right" size={18} /></button>
      </div> : <span />}
      <div className="sb-view-zoom" role="group" aria-label={t('scenebook.view.zoom')}>
        <button type="button" title={t('scenebook.view.zoomOut')} aria-label={t('scenebook.view.zoomOut')} disabled={!zoomed} onClick={() => zoomAt(z.current.s / STEP)}><Icon name="minus" size={16} /></button>
        <button type="button" ref={pctEl} className="sb-view-pct" title={t('scenebook.view.fit')} aria-label={t('scenebook.view.fit')} disabled={!zoomed} onClick={() => reset()}>100%</button>
        <button type="button" title={t('scenebook.view.zoomIn')} aria-label={t('scenebook.view.zoomIn')} disabled={zoom === 'max'} onClick={() => zoomAt(z.current.s * STEP)}><Icon name="plus" size={16} /></button>
      </div>
    </div>
    {item.sub ? <p className="hint">{item.sub}</p> : null}
    <div className="sb-viewer-foot">{(item.actions || []).map((a, i) => <Btn key={i} label={a.label} ic={a.ic} cls="ghost" onClick={run(a)} />)}<Btn label={t('common.save')} ic="import" cls="ghost" onClick={guard(async () => saveImage((item.original && await item.original()) || item.src, title))} />
      {item.more?.length ? <IBtn ic="more" title={t('scenebook.more')} onClick={e => menu(e.currentTarget, item.more!.map(a => ({ label: a.label, ic: a.ic, hint: a.hint, danger: a.danger, onclick: run(a) })))} /> : null}</div>
    {nav ? <p className="hint sb-view-tip">{t('scenebook.view.tip')}</p> : null}
  </>;
}
