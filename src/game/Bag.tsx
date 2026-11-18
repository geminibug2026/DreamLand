// 가방 화면: 칸 위에 물건이 크기대로 놓여 있다. 물건을 누르고 → 빈 칸을 누르면 옮기고, 돌리고, 걸치고, 버린다.
import { useState } from 'react';
import { t } from '../i18n';
import { ItemGlyph } from './Art';
import { SHAPE, SLOTS, SLOT_OF, bonusOf, fits, gearOf, tierOf, itemKind, packBag, posOf, type BagCfg, type Slot } from './bag';
import type { GameCfg, Sheet } from './state';

export function Bag({ g, sheet, onSave, onDrop, onUndo, onAdd }: { g: GameCfg; sheet: Sheet; onSave(): void; onDrop(name: string, n: number): void; /** 방금 뺀 것을 되돌린다 */ onUndo(name: string, n: number): void; onAdd(): void }) {
  const [sel, setSel] = useState(''), [, draw] = useState(0), [gone, setGone] = useState<{ name: string; n: number; at?: { x: number; y: number; r?: boolean }; slot?: Slot } | null>(null);
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
  /** 걸쳤을 때의 수치를 글로 (등급이 반영된 실제 값) */
  const bonus = (k: ReturnType<typeof itemKind>, name = '') => { if (!SLOT_OF[k]) return ''; const b = bonusOf(name, k); return t('game.bag.whenWorn', { what: [b.dmg ? t('game.bag.g.dmg', { n: b.dmg }) : '', b.aim ? t('game.bag.g.aim', { n: b.aim }) : '', b.soak ? t('game.bag.g.soak', { n: b.soak }) : '', b.def ? t('game.bag.g.def', { n: b.def }) : ''].filter(Boolean).join(', ') }); };
  /** 빼기: 하나 또는 전부. 놓여 있던 자리와 걸친 자리를 기억해 두었다가 되돌릴 때 그대로 돌려놓는다 */
  const drop = (all: boolean) => {
    if (!item) return; const n = all ? item.n : 1, prev = gone && same(gone.name, item.name) ? gone : null;
    setGone({ name: item.name, n: n + (prev?.n || 0), at: here ? { x: here.x, y: here.y, r: here.r } : prev?.at, slot: wornIn || prev?.slot });
    onDrop(item.name, n); if (item.n - n <= 0) setSel('');
  };
  const undo = () => { if (!gone) return; const g0 = gone; setGone(null); onUndo(g0.name, g0.n); commit(b => { if (g0.slot) b.eq![g0.slot] = g0.name; else if (g0.at) b.pos![low(g0.name)] = g0.at; }); setSel(g0.name); };
  const cells = [];
  for (let y = 0; y < p.h; y++) for (let x = 0; x < p.w; x++) { const ok = !!item && !wornIn && canDrop(x, y); cells.push(<button key={`${x},${y}`} type="button" className={`gm-bcell${ok ? ' is-ok' : ''}`} style={{ gridColumn: x + 1, gridRow: y + 1 }} disabled={!ok} aria-label={`${x + 1},${y + 1}`} onClick={() => moveTo(x, y)} />); }
  return <div className="gm-bag">
    <div className="gm-worn">{SLOTS.map(s => { const w = p.worn[s]; return <button key={s} type="button" className={`gm-slot${w ? ' is-on' : ''}${w && same(w.name, sel) ? ' is-sel' : ''}${!w && slot === s && !wornIn ? ' is-want' : ''}`} onClick={() => w ? setSel(same(w.name, sel) ? '' : w.name) : slot === s && !wornIn ? wear() : undefined}>
      <small>{t('game.bag.slot.' + s)}</small>{w ? <><ItemGlyph name={w.name} kind={w.kind} /><em>{w.name}</em></> : <i>—</i>}</button>; })}</div>
    <p className="gm-gear">{gear.dmg || gear.aim || gear.soak || gear.def ? [gear.dmg ? t('game.bag.g.dmg', { n: gear.dmg }) : '', gear.aim ? t('game.bag.g.aim', { n: gear.aim }) : '', gear.soak ? t('game.bag.g.soak', { n: gear.soak }) : '', gear.def ? t('game.bag.g.def', { n: gear.def }) : ''].filter(Boolean).join(' · ') : t('game.bag.g.none')}</p>
    <div className="gm-bgrid" style={{ gridTemplateColumns: `repeat(${p.w}, 1fr)`, gridTemplateRows: `repeat(${p.h}, 1fr)`, aspectRatio: `${p.w} / ${p.h}` }}>
      {cells}
      {p.placed.map(it => <button key={it.name} type="button" className={`gm-item is-${it.kind}${same(it.name, sel) ? ' is-sel' : ''}${it.w > it.h ? ' is-wide' : ''}${it.h === 1 ? ' is-short' : ''}`} style={{ gridColumn: `${it.x + 1} / span ${it.w}`, gridRow: `${it.y + 1} / span ${it.h}` }} title={it.name} aria-label={it.name} onClick={() => setSel(same(it.name, sel) ? '' : it.name)}>
        <ItemGlyph name={it.name} kind={it.kind} />{it.n > 1 ? <em>×{it.n}</em> : null}<span>{it.name}</span></button>)}
    </div>
    <p className="gm-bcount">{t('game.bag.count', { used: p.used, all: p.w * p.h })}</p>
    {p.over.length ? <div className="gm-over"><small>{t('game.bag.over')}</small>{p.over.map(o => <button key={o.name} type="button" className={same(o.name, sel) ? 'is-sel' : ''} onClick={() => setSel(same(o.name, sel) ? '' : o.name)}><ItemGlyph name={o.name} kind={o.kind} size={18} />{o.name}{o.n > 1 ? ` ×${o.n}` : ''}</button>)}</div> : null}
    {item && kind ? <div className="gm-pick">
      <div><b>{item.name}{item.n > 1 ? ` ×${item.n}` : ''}</b><small>{t('game.bag.kind.' + kind)} · {t('game.bag.size', { w: SHAPE[kind][0], h: SHAPE[kind][1] })}{SLOT_OF[kind] && tierOf(item.name) ? ' · ' + t('game.bag.tier', { n: tierOf(item.name) }) : ''}{bonus(kind, item.name) ? ' · ' + bonus(kind, item.name) : ''}</small></div>
      <div className="gm-pick-acts">
        {wornIn ? <button type="button" className="btn sm" onClick={() => takeOff(wornIn)}>{t('game.bag.off')}</button> : slot ? <button type="button" className="btn sm primary" onClick={wear}>{t('game.bag.wear')}</button> : null}
        {here && SHAPE[kind][0] !== SHAPE[kind][1] ? <button type="button" className="btn sm" onClick={rotate}>{t('game.bag.rotate')}</button> : null}
        <button type="button" className="btn sm ghost" onClick={() => drop(false)}>{t('game.sheet.drop')}</button>
        {item.n > 1 ? <button type="button" className="btn sm ghost" onClick={() => drop(true)}>{t('game.bag.dropAll', { n: item.n })}</button> : null}
      </div>
      {!wornIn ? <small className="hint">{t('game.bag.moveHint')}</small> : null}
    </div> : <p className="hint">{sheet.items.length ? t('game.bag.hint') : t('game.items.none')}</p>}
    {gone ? <p className="gm-undo"><span>{t('game.bag.dropped', { item: gone.n > 1 ? `${gone.name} ×${gone.n}` : gone.name })}</span><button type="button" className="btn sm" onClick={undo}>{t('game.bag.undo')}</button></p> : null}
    <button type="button" className="gm-link" onClick={onAdd}>{t('game.sheet.addItem')}</button>
  </div>;
}
