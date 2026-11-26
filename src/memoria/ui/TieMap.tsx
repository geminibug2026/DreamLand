// 장기기억 — 관계도: 이름 상자와 색 선, 선 위의 짧은 사이 이름. 인물 칩으로 한 사람을 가운데 두고, − / 맞춤 / + 로 키우고 끌어서 옮긴다
import { useRef, type PointerEvent as RPointerEvent } from 'react';
import { t, tn } from '../../i18n';
import { layoutTies, rankPeople, type TieEdge } from '../ties';

/** 관계도의 보기 상태 — 탭을 다시 그려도 남게 서고 화면 상태에 둔다 */
export interface TieMapView { focus: string; pick: string; zoom: number; x: number; y: number }
export const tieMapView = (): TieMapView => ({ focus: '', pick: '', zoom: 1, x: 0, y: 0 });
const ZOOM_MIN = 0.6, ZOOM_MAX = 3, clampZoom = (z: number) => Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, Math.round(z * 100) / 100));

/** edges: 그릴 사이들 · v: 보기 상태(그 자리에서 고친다) · redraw: 보기 상태를 고친 뒤 다시 그리기 */
export function TieMap({ edges, v, redraw }: { edges: TieEdge[]; v: TieMapView; redraw: () => void }) {
  const svg = useRef<SVGSVGElement>(null), drag = useRef<{ id: number; x: number; y: number; moved: boolean } | null>(null);
  const narrow = typeof window !== 'undefined' && window.innerWidth < 640, limit = narrow ? 9 : 14;
  const people = rankPeople(edges); if (v.focus && !people.includes(v.focus)) v.focus = '';
  const L = layoutTies(edges, { focus: v.focus, limit, width: narrow ? 340 : 480 }), [bx, by, bw, bh] = L.box, z = clampZoom(v.zoom || 1);
  if (v.pick && !L.lines.some(l => l.id === v.pick)) v.pick = '';
  const vw = bw / z, vh = bh / z, viewBox = `${Math.round(bx + (bw - vw) / 2 + v.x)} ${Math.round(by + (bh - vh) / 2 + v.y)} ${Math.round(vw)} ${Math.round(vh)}`;
  const setFocus = (name: string) => { v.focus = v.focus === name ? '' : name; v.pick = ''; v.x = 0; v.y = 0; redraw(); };
  const zoomBy = (f: number) => { v.zoom = clampZoom(z * f); if (v.zoom <= 1) { v.x = 0; v.y = 0; } redraw(); };
  // 끌어서 옮기기 — 키웠을 때만 (맞춤일 때는 화면을 그대로 위아래로 넘길 수 있게 손대지 않는다)
  const down = (e: RPointerEvent<SVGSVGElement>) => { if (z <= 1) return; drag.current = { id: e.pointerId, x: e.clientX, y: e.clientY, moved: false }; };
  const move = (e: RPointerEvent<SVGSVGElement>) => {
    const d = drag.current, el = svg.current; if (!d || d.id !== e.pointerId || !el) return;
    const dx = e.clientX - d.x, dy = e.clientY - d.y; if (!d.moved && Math.hypot(dx, dy) < 4) return;
    if (!d.moved) { d.moved = true; try { el.setPointerCapture(e.pointerId); } catch { /* 잡지 못해도 옮기기는 된다 */ } }
    const k = vw / Math.max(1, el.clientWidth), lim = (span: number, view: number) => Math.max(0, (span - view) / 2 + 20);
    v.x = Math.max(-lim(bw, vw), Math.min(lim(bw, vw), v.x - dx * k)); v.y = Math.max(-lim(bh, vh), Math.min(lim(bh, vh), v.y - dy * k)); d.x = e.clientX; d.y = e.clientY;
    el.setAttribute('viewBox', `${Math.round(bx + (bw - vw) / 2 + v.x)} ${Math.round(by + (bh - vh) / 2 + v.y)} ${Math.round(vw)} ${Math.round(vh)}`);   // 끄는 동안에는 틀만 옮긴다 (다시 그리지 않는다)
  };
  const up = (e: RPointerEvent<SVGSVGElement>) => { const d = drag.current; if (d && d.id === e.pointerId) { drag.current = null; if (d.moved) e.preventDefault(); } };
  const picked = L.lines.find(l => l.id === v.pick);
  return <div className="mm-tm">
    {people.length > 2 ? <div className="mm-tm-chips" role="group" aria-label={t('memoria.bonds.map.people')}>
      {v.focus ? <button type="button" className="mm-ti-chip all" onClick={() => setFocus(v.focus)}>{t('memoria.bonds.map.all')}</button> : null}
      {people.map(n => <button key={n} type="button" className={`mm-ti-chip${v.focus === n ? ' on' : ''}`} aria-pressed={v.focus === n} onClick={() => setFocus(n)}>{n}</button>)}
    </div> : null}
    <div className="mm-tm-stage">
      <svg ref={svg} className={`mm-tm-svg${z > 1 ? ' pan' : ''}`} viewBox={viewBox} style={{ aspectRatio: `${bw} / ${Math.max(60, bh)}` }} role="img" aria-label={t('memoria.bonds.map.title')}
        onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up}>
        {L.lines.map(l => <g key={l.id} className={`mm-tm-edge mm-tk-${l.kind || 'none'}${v.pick === l.id ? ' on' : ''}`} onClick={() => { if (drag.current?.moved) return; v.pick = v.pick === l.id ? '' : l.id; redraw(); }}>
          <path className="mm-tm-line" d={l.d} /><path className="mm-tm-head" d={l.ah} /><path className="mm-tm-hit" d={l.d} />
          <text className="mm-tm-label" x={l.lx} y={l.ly} textAnchor="middle" dominantBaseline="central">{l.label}<title>{`${l.from} → ${l.to}: ${l.full}`}</title></text>
        </g>)}
        {L.nodes.map(n => <g key={n.name} className={`mm-tm-node${n.focus ? ' focus' : ''}`} onClick={() => { if (!drag.current?.moved && people.length > 2) setFocus(n.name); }}>
          <rect x={n.x - n.w / 2} y={n.y - n.h / 2} width={n.w} height={n.h} rx={3} /><text x={n.x} y={n.y} textAnchor="middle" dominantBaseline="central">{n.text}<title>{n.name}</title></text>
        </g>)}
      </svg>
    </div>
    <div className="mm-tm-bar">
      <span className="mm-tm-note">{v.focus ? t('memoria.bonds.map.focusNote', { name: v.focus }) : L.hidden > 0 ? tn('memoria.bonds.map.hidden', L.hidden) : ''}</span>
      <span className="mm-tm-zoom" role="group" aria-label={t('memoria.bonds.map.zoom')}>
        <button type="button" className="mm-ti-btn" title={t('memoria.bonds.map.zoomOut')} aria-label={t('memoria.bonds.map.zoomOut')} disabled={z <= ZOOM_MIN} onClick={() => zoomBy(1 / 1.3)}>−</button>
        <button type="button" className="mm-ti-btn wide" onClick={() => { v.zoom = 1; v.x = 0; v.y = 0; redraw(); }}>{t('memoria.bonds.map.fit')}</button>
        <button type="button" className="mm-ti-btn" title={t('memoria.bonds.map.zoomIn')} aria-label={t('memoria.bonds.map.zoomIn')} disabled={z >= ZOOM_MAX} onClick={() => zoomBy(1.3)}>+</button>
      </span>
    </div>
    {picked ? <p className={`mm-tm-picked mm-tk-${picked.kind || 'none'}`}><i className="mm-ti-swatch" /><span><b>{picked.from}</b>{' → '}<b>{picked.to}</b></span><em>{picked.full}</em></p> : null}
  </div>;
}
