// 전투: 모눈 위에서 한 차례씩. 움직이고(3칸) 행동 하나를 한다 — 붙어서 치거나, 떨어져서 쏘거나, 막거나, 마시거나, 달아난다.
// 바위는 길과 시야를 막는다. 계산은 모두 앱이 하고, 끝나면 결과만 진행자에게 알린다
import { useMemo, useState } from 'react';
import { t } from '../i18n';
import { DIFF_HIT, d, isPotion, modOf, statsOf, type Foe, type Fx, type GameCfg, type Sheet, type StatKey } from './state';

export interface FightResult { outcome: 'win' | 'lose' | 'fled'; rounds: number; took: number; hp: number; fx: Fx[]; gold: number; xp: number }
type End = '' | FightResult['outcome'];
interface Unit extends Foe { id: number; x: number; y: number; max: number; stun: number }
interface St { x: number; y: number; hp: number; foes: Unit[]; moved: boolean; guard: boolean; round: number; log: string[]; used: string[]; end: End; special: boolean; sure: boolean; aim: boolean }
const W = 7, H = 6, MOVE = 3, RANGE = 5;
const key = (x: number, y: number) => `${x},${y}`;
const dist = (ax: number, ay: number, bx: number, by: number) => Math.max(Math.abs(ax - bx), Math.abs(ay - by));
const STEPS = [[1, 0], [-1, 0], [0, 1], [0, -1]];

/** (x,y) 에서 걸어서 갈 수 있는 칸과 걸음 수. 낮은 곳에서 언덕으로 오를 때는 두 걸음이 든다 */
function walk(x: number, y: number, blocked: (k: string) => boolean, max = 99, high?: Set<string>) {
  const seen = new Map<string, number>([[key(x, y), 0]]), q: [number, number][] = [[x, y]];
  while (q.length) { const [cx, cy] = q.shift()!, n = seen.get(key(cx, cy))!;
    for (const [dx, dy] of STEPS) { const nx = cx + dx, ny = cy + dy, k = key(nx, ny); if (nx < 0 || ny < 0 || nx >= W || ny >= H || blocked(k)) continue;
      const cost = n + (high?.has(k) && !high.has(key(cx, cy)) ? 2 : 1); if (cost > max || (seen.get(k) ?? 999) <= cost) continue; seen.set(k, cost); q.push([nx, ny]); } }
  return seen;
}
/** 두 칸 사이에 바위가 없는지 */
function clear(ax: number, ay: number, bx: number, by: number, rocks: Set<string>) {
  const n = Math.max(Math.abs(bx - ax), Math.abs(by - ay));
  for (let i = 1; i < n; i++) if (rocks.has(key(Math.round(ax + (bx - ax) * i / n), Math.round(ay + (by - ay) * i / n)))) return false;
  return true;
}
function makeBoard(foes: Foe[]) {
  const my = { x: 0, y: Math.floor(H / 2) };
  for (let tries = 0; tries < 30; tries++) {
    const rocks = new Set<string>(), high = new Set<string>(), bush = new Set<string>(), units: Unit[] = [];
    for (let i = 0, n = 3 + d(3); i < n; i++) { const x = 1 + d(W - 3), y = d(H) - 1; rocks.add(key(x, y)); }
    // 언덕은 두세 칸이 붙어 있고, 덤불은 흩어져 있다
    const hx = 1 + d(W - 3), hy = d(H) - 1; for (const [dx, dy] of [[0, 0], [1, 0], [0, 1]].slice(0, 1 + d(2))) { const k = key(hx + dx, hy + dy); if (hx + dx < W - 1 && hy + dy < H && !rocks.has(k)) high.add(k); }
    for (let i = 0; i < 3; i++) { const k = key(d(W - 2), d(H) - 1); if (!rocks.has(k) && !high.has(k)) bush.add(k); }
    const spots: [number, number][] = []; for (let x = W - 1; x >= W - 2; x--) for (let y = 0; y < H; y++) if (!rocks.has(key(x, y))) spots.push([x, y]);
    foes.forEach((f, i) => { const at = spots.splice(d(spots.length) - 1, 1)[0]; if (at) units.push({ ...f, id: i, x: at[0], y: at[1], max: f.hp, stun: 0 }); });
    const reach = walk(my.x, my.y, k => rocks.has(k));
    if (units.length === foes.length && units.every(u => reach.has(key(u.x, u.y)))) return { rocks, high, bush, units, my };
  }
  return { rocks: new Set<string>(), high: new Set<string>(), bush: new Set<string>(), units: foes.map((f, i) => ({ ...f, id: i, x: W - 1, y: i % H, max: f.hp, stun: 0 })), my };
}
const Bar = ({ v, max }: { v: number; max: number }) => <span className="gm-bar"><i style={{ width: `${Math.max(0, Math.min(100, v / max * 100))}%` }} /></span>;

export function Combat({ g, sheet, foes, onDone }: { g: GameCfg; sheet: Sheet; foes: Foe[]; onDone(r: FightResult): void }) {
  const board = useMemo(() => makeBoard(foes), [foes]), { rocks, high, bush } = board;
  const M = { str: modOf(g, 'str'), dex: modOf(g, 'dex') };
  const top = (['str', 'dex', 'int', 'cha'] as StatKey[]).filter(k => statsOf(g).includes(k)).reduce((a, b) => modOf(g, b) > modOf(g, a) ? b : a, 'str' as StatKey);
  /** 높낮이와 엄폐에 따른 명중 보정: 위에서 아래로 +2, 아래에서 위로 -2, 덤불 속 상대를 쏘면 -2 */
  const edge = (ax: number, ay: number, bx: number, by: number, shot: boolean) => (high.has(key(ax, ay)) && !high.has(key(bx, by)) ? 2 : !high.has(key(ax, ay)) && high.has(key(bx, by)) ? -2 : 0) + (shot && bush.has(key(bx, by)) ? -2 : 0);
  const potions0 = sheet.items.filter(i => isPotion(i.name));
  const [st, setSt] = useState<St>(() => ({ ...board.my, hp: Math.max(1, sheet.hp), foes: board.units, moved: false, guard: false, round: 1, log: [], used: [], end: '', special: false, sure: false, aim: false }));
  const alive = st.foes.filter(f => f.hp > 0);
  const left = (name: string) => (potions0.find(p => p.name === name)?.n || 0) - st.used.filter(u => u === name).length;
  const potion = potions0.find(p => left(p.name) > 0);
  const occupied = (foesNow: Unit[], except = -1) => (k: string) => rocks.has(k) || foesNow.some(f => f.hp > 0 && f.id !== except && key(f.x, f.y) === k);
  const reach = st.end || st.moved ? new Map<string, number>() : walk(st.x, st.y, occupied(st.foes), MOVE, high);
  const canHit = (f: Unit) => { const n = dist(st.x, st.y, f.x, f.y); return n <= 1 ? 'melee' : n <= RANGE + (high.has(key(st.x, st.y)) ? 1 : 0) && clear(st.x, st.y, f.x, f.y, rocks) ? 'shot' : ''; };

  /** 상대의 차례: 붙어 있으면 치고, 아니면 두 칸까지 다가온다 (한 칸만 움직였으면 이어서 친다) */
  const foesTurn = (s: St): St => {
    const log = [...s.log]; let hp = s.hp; const list = s.foes.map(f => ({ ...f }));
    for (const f of list) {
      if (f.hp <= 0 || hp <= 0) continue;
      if (f.stun > 0) { f.stun--; log.push(t('game.fight.log.stunned', { name: f.name })); continue; }
      let stepped = 0; const sees = () => !!f.ranged && dist(f.x, f.y, s.x, s.y) <= RANGE && clear(f.x, f.y, s.x, s.y, rocks);
      if (dist(f.x, f.y, s.x, s.y) > 1 && !sees()) {
        const from = walk(s.x, s.y, k => rocks.has(k) || list.some(o => o.hp > 0 && o.id !== f.id && key(o.x, o.y) === k));
        for (; stepped < 2 && dist(f.x, f.y, s.x, s.y) > 1 && !sees(); stepped++) {
          let best: [number, number] | null = null, bestN = from.get(key(f.x, f.y)) ?? 999;
          for (const [dx, dy] of STEPS) { const nx = f.x + dx, ny = f.y + dy, n = from.get(key(nx, ny)); if (n != null && n > 0 && n < bestN && !list.some(o => o.hp > 0 && o.id !== f.id && o.x === nx && o.y === ny)) { best = [nx, ny]; bestN = n; } }
          if (!best) break; f.x = best[0]; f.y = best[1];
        }
      }
      const near = dist(f.x, f.y, s.x, s.y) <= 1;
      if ((near || sees()) && stepped <= 1) {
        const die = d(20), hit = die === 20 || (die !== 1 && die + f.atk + edge(f.x, f.y, s.x, s.y, !near) >= 10 + M.dex + (s.guard ? 4 : 0));
        if (!hit) log.push(t('game.fight.log.foeMiss', { name: f.name }));
        else { const dmg = Math.max(1, Math.round((d(4) + f.atk / 2) * DIFF_HIT[g.diff] * (s.guard ? .5 : 1))); hp = Math.max(0, hp - dmg); log.push(t(near ? 'game.fight.log.foeHit' : 'game.fight.log.foeShot', { name: f.name, n: dmg })); }
      }
    }
    return { ...s, hp, foes: list, log: log.slice(-5), moved: false, guard: false, round: s.round + 1, end: hp <= 0 ? 'lose' : s.end };
  };
  /** 내 행동이 끝났다: 다 쓰러뜨렸으면 승리, 아니면 상대 차례 */
  const after = (s: St) => setSt(s.end ? s : s.foes.every(f => f.hp <= 0) ? { ...s, end: 'win' } : foesTurn(s));

  const moveTo = (x: number, y: number) => { if (reach.has(key(x, y)) && (x !== st.x || y !== st.y)) setSt({ ...st, x, y, moved: true }); };
  const attack = (f: Unit) => {
    const how = canHit(f); if (!how || st.end) return;
    const mod = (how === 'melee' ? M.str : M.dex) + (st.aim ? 4 : 0) + edge(st.x, st.y, f.x, f.y, how === 'shot'), die = d(20), hit = st.sure || die === 20 || (die !== 1 && die + mod >= (how === 'melee' ? 10 : 11));
    const log = [...st.log]; let foesNow = st.foes;
    if (hit) {
      const dmg = (d(6) + Math.max(0, how === 'melee' ? M.str + 1 : M.dex)) * (die === 20 || st.sure ? 2 : 1);
      foesNow = st.foes.map(o => o.id === f.id ? { ...o, hp: Math.max(0, o.hp - dmg) } : o);
      log.push(t(die === 20 || st.sure ? 'game.fight.log.crit' : how === 'melee' ? 'game.fight.log.hit' : 'game.fight.log.shot', { name: f.name, n: dmg }));
      if (f.hp - dmg <= 0) log.push(t('game.fight.log.down', { name: f.name }));
    } else log.push(t('game.fight.log.miss', { name: f.name }));
    after({ ...st, foes: foesNow, log, sure: false });
  };
  const guard = () => after({ ...st, guard: true, log: [...st.log, t('game.fight.log.guard')] });
  const drink = () => { if (!potion) return; const heal = d(8) + 2; after({ ...st, hp: Math.min(sheet.hpMax, st.hp + heal), used: [...st.used, potion.name], log: [...st.log, t('game.fight.log.potion', { item: potion.name, n: heal })] }); };
  const flee = () => { if (st.x === 0 || d(20) + M.dex >= 12) setSt({ ...st, end: 'fled', log: [...st.log, t('game.fight.log.fled')] }); else after({ ...st, log: [...st.log, t('game.fight.log.noFlee')] }); };
  /** 한 번뿐인 특기 (행동을 쓰지 않는다): 가장 높은 능력치에 따라 다르다 */
  const special = () => {
    if (st.special || st.end) return; const log = [...st.log, t('game.fight.sp.' + top + '.log')];
    if (top === 'str') setSt({ ...st, special: true, sure: true, log });
    else if (top === 'dex') setSt({ ...st, special: true, moved: false, log });
    else if (top === 'int') setSt({ ...st, special: true, aim: true, log });
    else setSt({ ...st, special: true, foes: st.foes.map(f => ({ ...f, stun: f.hp > 0 ? 1 : 0 })), log });
  };
  const finish = () => {
    if (!st.end) return;
    const fx: Fx[] = []; if (st.hp !== sheet.hp) fx.push({ k: 'hp', n: st.hp - sheet.hp });
    for (const name of new Set(st.used)) fx.push({ k: 'item', name, n: -st.used.filter(u => u === name).length });
    // 이기면 전리품: 상대가 셀수록 많이 준다
    const won = st.end === 'win', xp = won ? Math.round(foes.reduce((n, f) => n + f.hp + f.atk * 3, 0)) : 0, gold = won ? foes.reduce((n, f) => n + d(4) + f.atk, 0) : 0;
    if (gold) fx.push({ k: 'gold', n: gold }); if (xp) fx.push({ k: 'xp', n: xp });
    onDone({ outcome: st.end, rounds: st.round, took: Math.max(0, sheet.hp - st.hp), hp: st.hp, fx, gold, xp });
  };

  const cells = [];
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const k = key(x, y), f = alive.find(o => o.x === x && o.y === y), me = st.x === x && st.y === y, rock = rocks.has(k), can = !st.end && f ? canHit(f) : '', go = !f && !me && !rock && reach.has(k);
    cells.push(<button key={k} type="button" disabled={!!st.end || rock || me || (!go && !can)} aria-label={f ? f.name : me ? t('game.you') : rock ? t('game.fight.rock') : `${x + 1},${y + 1}`}
      className={`gm-cell${rock ? ' is-rock' : ''}${high.has(k) ? ' is-high' : ''}${bush.has(k) ? ' is-bush' : ''}${f?.ranged ? ' is-ranged' : ''}${me ? ' is-me' : ''}${f ? ' is-foe' : ''}${go ? ' is-go' : ''}${can ? ' is-aim' : ''}${f?.stun ? ' is-stun' : ''}`}
      onClick={() => f ? attack(f) : moveTo(x, y)}>{me ? <b>{t('game.fight.meMark')}</b> : f ? <><b>{f.id + 1}</b><i style={{ width: `${f.hp / f.max * 100}%` }} /></> : null}</button>);
  }
  return <div className="gm-mini gm-fight">
    <div className="gm-roster">
      <div className="is-me"><small>{t('game.you')}</small><b>{st.hp}<i>/{sheet.hpMax}</i></b><Bar v={st.hp} max={sheet.hpMax} /></div>
      {st.foes.map(f => <div key={f.id} className={f.hp <= 0 ? 'is-out' : ''}><small>{f.id + 1} · {f.name}{f.ranged ? ' ➶' : ''}</small><b>{f.hp}<i>/{f.max}</i></b><Bar v={f.hp} max={f.max} /></div>)}
    </div>
    <div className="gm-board" style={{ gridTemplateColumns: `repeat(${W}, 1fr)` }}>{cells}</div>
    <p className="gm-legend"><span><i className="is-rock" />{t('game.fight.rock')}</span><span><i className="is-high" />{t('game.fight.high')}</span><span><i className="is-bush" />{t('game.fight.bush')}</span></p>
    <ol className="gm-log">{st.log.length ? st.log.map((l, i) => <li key={i}>{l}</li>) : <li className="dim">{t('game.fight.hint')}</li>}</ol>
    {st.end ? <div className="gm-done"><b className={`gm-verdict is-${st.end === 'win' ? 'win' : st.end === 'lose' ? 'lose' : 'draw'}`}>{t('game.fight.end.' + st.end)}</b><button type="button" className="btn primary" onClick={finish}>{t('game.mini.finish')}</button></div>
      : <div className="gm-acts">
        <button type="button" className="btn" onClick={guard}>{t('game.fight.guard')}</button>
        <button type="button" className="btn" disabled={!potion} onClick={drink}>{potion ? `${potion.name} ×${left(potion.name)}` : t('game.fight.noPotion')}</button>
        <button type="button" className="btn" disabled={st.special} title={t('game.fight.sp.' + top + '.tip')} onClick={special}>{t('game.fight.sp.' + top)}</button>
        <button type="button" className="btn ghost" title={t('game.fight.fleeTip')} onClick={flee}>{t('game.fight.flee')}</button>
      </div>}
  </div>;
}
