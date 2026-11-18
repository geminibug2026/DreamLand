// 가방 화면: 칸 위에 물건이 크기대로 놓여 있다. 물건을 누르고 → 빈 칸을 누르면 옮기고, 돌리고, 걸치고, 버린다.
import { useState } from 'react';
import { t } from '../i18n';
import { ItemGlyph } from './Art';
import { SHAPE, SLOTS, SLOT_OF, fits, gearOf, itemKind, packBag, posOf, type BagCfg, type Slot } from './bag';
import type { GameCfg, Sheet } from './state';

export function Bag({ g, sheet, onSave, onDrop, onAdd }: { g: GameCfg; sheet: Sheet; onSave(): void; onDrop(name: string): void; onAdd(): void }) {
  const [sel, setSel] = useState(''), [, draw] = useState(0);
  const bag = (g.bag ||= {}) as BagCfg, p = packBag(bag, sheet.items, sheet.level), gear = gearOf(p);
  const low = (s: string) => s.trim().toLowerCase(), same = (a: string, b: string) => low(a) === low(b);
  const item = sel ? sheet.items.find(i => same(i.name, sel)) : null, kind = item ? itemKind(item.name) : null;
  const here = item ? p.placed.find(x => same(x.name, item.name)) : null, slot = kind ? SLOT_OF[kind] : undefined;
  const wornIn = item ? SLOTS.find(s => p.worn[s] && same(p.worn[s]!.name, item.name)) : undefined;
  /** 지금 놓인 자리를 모두 적은 뒤에 고친다 */
  const commit = (fn: (b: BagCfg) => void) => { bag.pos = { ...posOf(p) }; bag.eq = { ...(bag.eq || {}) }; fn(bag); onSave(); draw(n => n + 1); };
  const size = (r: boolean): [number, number] => { const [w, h] = SHAPE[kind!]; return r ? [h, w] : [w, h]; };
  const rNow = here ? here.r : false;
  const canDrop = (x: number, y: number) => { if (!item || wornIn) return false; const [w, h] = size(rNow); return fits(p.placed, p.w, p.h, x, y, w, h, item.name); };
  const moveTo = (x: number, y: number) => { if (!item || !canDrop(x, y)) return; commit(b => { b.pos![low(item.name)] = { x, y, r: rNow }; }); };
  const rotate = () => {
    if (!item || !here) return; const [w, h] = size(!here.r);
    // 제자리에서 돌려 보고, 안 되면 들어갈 수 있는 가장 가까운 곳으로
    let at: [number, number] | null = null, best = 1e9;
    for (let y = 0; y < p.h; y++) for (let x = 0; x < p.w; x++) if (fits(p.placed, p.w, p.h, x, y, w, h, item.name)) { const dd = Math.abs(x - here.x) + Math.abs(y - here.y); if (dd < best) { best = dd; at = [x, y]; } }
    if (at) commit(b => { b.pos![low(item.name)] = { x: at![0], y: at![1], r: !here.r }; });
  };
  const wear = () => { if (!item || !slot) return; commit(b => { b.eq![slot] = item.name; delete b.pos![low(item.name)]; }); };
  const takeOff = (s: Slot) => commit(b => { delete b.eq![s]; });
  const bonus = (k: ReturnType<typeof itemKind>) => { const s = SLOT_OF[k]; return s ? t('game.bag.bonus.' + (s === 'weapon' ? (['axe', 'bow', 'gun'].includes(k) ? 'big' : k === 'staff' ? 'staff' : 'weapon') : s)) : ''; };
  const cells = [];
  for (let y = 0; y < p.h; y++) for (let x = 0; x < p.w; x++) { const ok = !!item && !wornIn && canDrop(x, y); cells.push(<button key={`${x},${y}`} type="button" className={`gm-bcell${ok ? ' is-ok' : ''}`} style={{ gridColumn: x + 1, gridRow: y + 1 }} disabled={!ok} aria-label={`${x + 1},${y + 1}`} onClick={() => moveTo(x, y)} />); }
  return <div className="gm-bag">
    <div className="gm-worn">{SLOTS.map(s => { const w = p.worn[s]; return <button key={s} type="button" className={`gm-slot${w ? ' is-on' : ''}${w && same(w.name, sel) ? ' is-sel' : ''}${!w && slot === s && !wornIn ? ' is-want' : ''}`} onClick={() => w ? setSel(same(w.name, sel) ? '' : w.name) : slot === s && !wornIn ? wear() : undefined}>
      <small>{t('game.bag.slot.' + s)}</small>{w ? <><ItemGlyph kind={w.kind} /><em>{w.name}</em></> : <i>—</i>}</button>; })}</div>
    <p className="gm-gear">{gear.dmg || gear.aim || gear.soak || gear.def ? [gear.dmg ? t('game.bag.g.dmg', { n: gear.dmg }) : '', gear.aim ? t('game.bag.g.aim', { n: gear.aim }) : '', gear.soak ? t('game.bag.g.soak', { n: gear.soak }) : '', gear.def ? t('game.bag.g.def', { n: gear.def }) : ''].filter(Boolean).join(' · ') : t('game.bag.g.none')}</p>
    <div className="gm-bgrid" style={{ gridTemplateColumns: `repeat(${p.w}, 1fr)`, gridTemplateRows: `repeat(${p.h}, 1fr)`, aspectRatio: `${p.w} / ${p.h}` }}>
      {cells}
      {p.placed.map(it => <button key={it.name} type="button" className={`gm-item is-${it.kind}${same(it.name, sel) ? ' is-sel' : ''}${it.w > it.h ? ' is-wide' : ''}`} style={{ gridColumn: `${it.x + 1} / span ${it.w}`, gridRow: `${it.y + 1} / span ${it.h}` }} title={it.name} aria-label={it.name} onClick={() => setSel(same(it.name, sel) ? '' : it.name)}>
        <ItemGlyph kind={it.kind} />{it.n > 1 ? <em>×{it.n}</em> : null}<span>{it.name}</span></button>)}
    </div>
    <p className="gm-bcount">{t('game.bag.count', { used: p.used, all: p.w * p.h })}</p>
    {p.over.length ? <div className="gm-over"><small>{t('game.bag.over')}</small>{p.over.map(o => <button key={o.name} type="button" className={same(o.name, sel) ? 'is-sel' : ''} onClick={() => setSel(same(o.name, sel) ? '' : o.name)}><ItemGlyph kind={o.kind} size={18} />{o.name}{o.n > 1 ? ` ×${o.n}` : ''}</button>)}</div> : null}
    {item && kind ? <div className="gm-pick">
      <div><b>{item.name}{item.n > 1 ? ` ×${item.n}` : ''}</b><small>{t('game.bag.kind.' + kind)} · {t('game.bag.size', { w: SHAPE[kind][0], h: SHAPE[kind][1] })}{bonus(kind) ? ' · ' + bonus(kind) : ''}</small></div>
      <div className="gm-pick-acts">
        {wornIn ? <button type="button" className="btn sm" onClick={() => takeOff(wornIn)}>{t('game.bag.off')}</button> : slot ? <button type="button" className="btn sm primary" onClick={wear}>{t('game.bag.wear')}</button> : null}
        {here && SHAPE[kind][0] !== SHAPE[kind][1] ? <button type="button" className="btn sm" onClick={rotate}>{t('game.bag.rotate')}</button> : null}
        <button type="button" className="btn sm ghost" onClick={() => { onDrop(item.name); if (item.n <= 1) setSel(''); }}>{t('game.sheet.drop')}</button>
      </div>
      {!wornIn ? <small className="hint">{t('game.bag.moveHint')}</small> : null}
    </div> : <p className="hint">{sheet.items.length ? t('game.bag.hint') : t('game.items.none')}</p>}
    <button type="button" className="gm-link" onClick={onAdd}>{t('game.sheet.addItem')}</button>
  </div>;
}
