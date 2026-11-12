// ════════ 인물 배치판 ════════ 번호 점을 끌거나 눌러서, 방향키로 옮긴다
import { useRef, type KeyboardEvent, type PointerEvent } from 'react';
import { useBump } from './parts';
import * as IL from '../lib/illust';
import { t } from '../i18n';

export interface BoardEntry { name?: string; x: number; y: number; set(x: number, y: number): void }

export function Board({ model, width, height, bg, entries, selected, onSelect, onMove }: { model: string; width: number; height: number; bg?: string; entries: BoardEntry[]; selected: number; onSelect: (i: number) => void; onMove: () => void }) {
  const bump = useBump(), board = useRef<HTMLDivElement>(null), drag = useRef<number | null>(null);
  const { MODELS, snapPoint } = IL, free = MODELS[model]?.family !== 4.5;
  const sel = Math.max(0, Math.min(selected, entries.length - 1)), cur = useRef(sel); cur.current = sel;
  const commit = (i: number, x: number, y: number) => { const e = entries[i]; if (!e) return; const p = snapPoint(x, y, model); e.set(p.x, p.y); onMove(); bump(); };
  const fromPointer = (e: PointerEvent, i: number) => { const r = board.current?.getBoundingClientRect(); if (r?.width && r.height) commit(i, (e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height); };
  const pick = (i: number) => { if (cur.current !== i) { cur.current = i; onSelect(i); } };
  const keys = (ev: KeyboardEvent, i: number) => {
    const d = ({ ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] } as Record<string, number[]>)[ev.key]; if (!d) return; ev.preventDefault(); pick(i);
    const e = entries[i], p = snapPoint(e.x, e.y, model), st = free ? (ev.shiftKey ? 0.1 : 0.01) : 0.2; commit(i, p.x + d[0] * st, p.y + d[1] * st);
  };
  const end = (ev: PointerEvent<HTMLButtonElement>) => { if (drag.current === ev.pointerId) { drag.current = null; if (ev.currentTarget.hasPointerCapture(ev.pointerId)) ev.currentTarget.releasePointerCapture(ev.pointerId); } };
  const tool = (label: string, apply: (e: BoardEntry, i: number, n: number) => [number, number], only = false) =>
    <button type="button" className="chip" onClick={() => { entries.forEach((e, i) => { if (only && i !== sel) return; const p = snapPoint(...apply(e, i, entries.length), model); e.set(p.x, p.y); }); onMove(); bump(); }}>{label}</button>;
  const who = entries[sel];
  return <section className="sb-placement">
    <p className="hint">{t('scenebook.board.hint', { mode: free ? t('scenebook.board.free') : t('scenebook.board.grid') })}</p>
    <div ref={board} className={'sb-board' + (free ? '' : ' grid5')} aria-label={t('scenebook.board.label')} style={{ aspectRatio: `${width} / ${height}`, maxWidth: Math.round(Math.min(520, 320 * width / height)) + 'px' }}
      onPointerDown={e => { if (e.target === e.currentTarget && e.button === 0) { e.preventDefault(); fromPointer(e, sel); } }}>
      {bg ? <img className="sb-board-bg" src={bg} alt="" draggable={false} /> : null}
      {entries.map((e, i) => { const p = snapPoint(e.x, e.y, model), name = e.name || t('scenebook.person.n', { n: i + 1 });
        return <button key={i} type="button" className={'sb-marker' + (sel === i ? ' on' : '')} title={name} aria-label={t('scenebook.board.markerAria', { name, x: p.x, y: p.y })} style={{ left: p.x * 100 + '%', top: p.y * 100 + '%' }}
          onFocus={() => pick(i)} onClick={() => pick(i)} onKeyDown={ev => keys(ev, i)}
          onPointerDown={ev => { if (ev.button !== 0) return; ev.preventDefault(); pick(i); drag.current = ev.pointerId; ev.currentTarget.setPointerCapture(ev.pointerId); ev.currentTarget.focus(); }}
          onPointerMove={ev => { if (drag.current === ev.pointerId) fromPointer(ev, i); }}
          onPointerUp={end} onPointerCancel={end} onLostPointerCapture={() => { drag.current = null; }}>{String(i + 1)}</button>; })}
    </div>
    <output className="sb-readout">{who ? t('scenebook.board.readout', { name: who.name || t('scenebook.person.n', { n: sel + 1 }), x: Number(who.x).toFixed(2), y: Number(who.y).toFixed(2) }) : t('scenebook.board.empty')}</output>
    <div className="row wrap sb-board-tools">{tool(t('scenebook.board.spread'), (_e, i, n) => [(i + 1) / (n + 1), 0.5])}{tool(t('scenebook.board.flip'), e => [1 - Number(e.x), Number(e.y)])}{tool(t('scenebook.board.center'), () => [0.5, 0.5], true)}</div>
  </section>;
}
