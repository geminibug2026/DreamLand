// 전투: 모눈 위에서 한 차례씩. 움직이고(3칸) 행동 하나를 한다 — 붙어서 치거나, 떨어져서 쏘거나, 막거나, 마시거나, 달아난다.
// 바위는 길과 시야를 막는다. 계산은 모두 앱이 하고, 끝나면 결과만 진행자에게 알린다
import { useMemo, useState } from 'react';
import { t } from '../i18n';
import { sfx } from './sfx';
import { Emblem, Terrain, foeKind } from './Art';
import { DIFF_HIT, WEAK, d, elementOf, isPotion, modOf, statsOf, type Element, type Foe, type Fx, type GameCfg, type Sheet, type StatKey } from './state';

export interface FightResult { outcome: 'win' | 'lose' | 'fled'; rounds: number; took: number; hp: number; fx: Fx[]; gold: number; xp: number; fallen: string[]; loot: string }
type End = '' | FightResult['outcome'];
/** 상태 이상: 남은 차례 수. 화상 · 중독 · 출혈은 차례마다 피해, 냉기는 걸음이 줄어든다 */
type Ail = 'burn' | 'poison' | 'bleed' | 'chill';
type Ails = Partial<Record<Ail, number>>;
const AIL_OF: Record<Element, Ail | 'stun'> = { fire: 'burn', poison: 'poison', ice: 'chill', bolt: 'stun' };
const AIL_DMG: Partial<Record<Ail, number>> = { burn: 2, poison: 1, bleed: 1 };
interface Unit extends Foe { id: number; x: number; y: number; max: number; stun: number; ail: Ails }
interface Ally { name: string; x: number; y: number; hp: number; max: number }
interface St { ail: Ails; /** 보스가 예고한 일격: 맞는 칸들과 누가 치는지 */ mark: { cells: string[]; by: number } | null; x: number; y: number; hp: number; foes: Unit[]; allies: Ally[]; hurt: number; moved: boolean; guard: boolean; round: number; log: string[]; used: string[]; end: End; special: boolean; sure: boolean; aim: boolean }
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
    foes.forEach((f, i) => { const at = spots.splice(d(spots.length) - 1, 1)[0]; if (at) units.push({ ...f, id: i, x: at[0], y: at[1], max: f.hp, stun: 0, ail: {} }); });
    const reach = walk(my.x, my.y, k => rocks.has(k));
    if (units.length === foes.length && units.every(u => reach.has(key(u.x, u.y)))) return { rocks, high, bush, units, my };
  }
  return { rocks: new Set<string>(), high: new Set<string>(), bush: new Set<string>(), units: foes.map((f, i) => ({ ...f, id: i, x: W - 1, y: i % H, max: f.hp, stun: 0, ail: {} })), my };
}
const Bar = ({ v, max }: { v: number; max: number }) => <span className="gm-bar"><i style={{ width: `${Math.max(0, Math.min(100, v / max * 100))}%` }} /></span>;

export function Combat({ g, sheet, foes, onDone, faces = {} }: { g: GameCfg; sheet: Sheet; foes: Foe[]; onDone(r: FightResult): void; /** 얼굴 그림: me 와 동료 이름 → 주소 */ faces?: Record<string, string> }) {
  const face = (n: string) => faces[n.toLowerCase()] ? { backgroundImage: `url("${faces[n.toLowerCase()]}")` } : undefined;
  const lv = sheet.level || 1;
  const board = useMemo(() => makeBoard(foes), [foes]), { rocks, high, bush } = board;
  const M = { str: modOf(g, 'str'), dex: modOf(g, 'dex') };
  /** 가진 물건에 원소가 깃들어 있으면 내 공격도 그 원소를 띤다 (횃불 → 불) */
  const myEl = useMemo(() => { for (const it of sheet.items) { const e = elementOf(it.name); if (e) return e; } return '' as Element | ''; }, [sheet.items]);
  const tick = (a: Ails): [Ails, number] => { let dmg = 0; const next: Ails = {}; for (const k of Object.keys(a) as Ail[]) { if (!a[k]) continue; dmg += AIL_DMG[k] || 0; if (a[k]! > 1) next[k] = a[k]! - 1; } return [next, dmg]; };
  const top = (['str', 'dex', 'int', 'cha'] as StatKey[]).filter(k => statsOf(g).includes(k)).reduce((a, b) => modOf(g, b) > modOf(g, a) ? b : a, 'str' as StatKey);
  /** 높낮이와 엄폐에 따른 명중 보정: 위에서 아래로 +2, 아래에서 위로 -2, 덤불 속 상대를 쏘면 -2 */
  const edge = (ax: number, ay: number, bx: number, by: number, shot: boolean) => (high.has(key(ax, ay)) && !high.has(key(bx, by)) ? 2 : !high.has(key(ax, ay)) && high.has(key(bx, by)) ? -2 : 0) + (shot && bush.has(key(bx, by)) ? -2 : 0);
  const potions0 = sheet.items.filter(i => isPotion(i.name));
  const [st, setSt] = useState<St>(() => ({ ...board.my, hp: Math.max(1, sheet.hp), foes: board.units, hurt: 0, ail: {}, mark: null,
    // 동료는 내 곁에서 시작한다
    allies: (sheet.party || []).slice(0, 3).map((name, i) => { const spots = [[0, board.my.y - 1], [0, board.my.y + 1], [1, board.my.y]].filter(([x, y]) => y >= 0 && y < H && !board.rocks.has(key(x, y))); const at = spots[i % Math.max(1, spots.length)] || [1, board.my.y]; return { name, x: at[0], y: at[1], hp: 8 + lv * 2, max: 8 + lv * 2 }; }), moved: false, guard: false, round: 1, log: [], used: [], end: '', special: false, sure: false, aim: false }));
  const alive = st.foes.filter(f => f.hp > 0);
  const left = (name: string) => (potions0.find(p => p.name === name)?.n || 0) - st.used.filter(u => u === name).length;
  const potion = potions0.find(p => left(p.name) > 0);
  const occupied = (foesNow: Unit[], except = -1) => (k: string) => rocks.has(k) || foesNow.some(f => f.hp > 0 && f.id !== except && key(f.x, f.y) === k) || st.allies.some(a => a.hp > 0 && key(a.x, a.y) === k);
  const reach = st.end || st.moved ? new Map<string, number>() : walk(st.x, st.y, occupied(st.foes), st.ail.chill ? 1 : MOVE, high);
  const canHit = (f: Unit) => { const n = dist(st.x, st.y, f.x, f.y); return n <= 1 ? 'melee' : n <= RANGE + (high.has(key(st.x, st.y)) ? 1 : 0) && clear(st.x, st.y, f.x, f.y, rocks) ? 'shot' : ''; };

  /** 동료의 차례: 붙어 있는 적을 치고, 없으면 가장 가까운 적에게 두 칸 다가간다 */
  const alliesTurn = (s: St): St => {
    const log = [...s.log], foesNow = s.foes.map(f => ({ ...f })), allies = s.allies.map(a => ({ ...a }));
    for (const a of allies) {
      if (a.hp <= 0) continue; const live = foesNow.filter(f => f.hp > 0); if (!live.length) break;
      const tgt = live.reduce((p, c) => dist(a.x, a.y, c.x, c.y) < dist(a.x, a.y, p.x, p.y) ? c : p);
      if (dist(a.x, a.y, tgt.x, tgt.y) > 1) {
        const from = walk(tgt.x, tgt.y, k => rocks.has(k) || (k !== key(a.x, a.y) && (key(s.x, s.y) === k || allies.some(o => o !== a && o.hp > 0 && key(o.x, o.y) === k) || foesNow.some(f => f.hp > 0 && f !== tgt && key(f.x, f.y) === k))));
        for (let n = 0; n < 2 && dist(a.x, a.y, tgt.x, tgt.y) > 1; n++) { let best: [number, number] | null = null, bestN = from.get(key(a.x, a.y)) ?? 999; for (const [dx, dy] of STEPS) { const v = from.get(key(a.x + dx, a.y + dy)); if (v != null && v > 0 && v < bestN) { best = [a.x + dx, a.y + dy]; bestN = v; } } if (!best) break; a.x = best[0]; a.y = best[1]; }
      }
      if (dist(a.x, a.y, tgt.x, tgt.y) <= 1) {
        if (d(20) + 2 + Math.floor(lv / 2) >= 10) { const dmg = d(6) + 1; tgt.hp = Math.max(0, tgt.hp - dmg); log.push(t('game.fight.log.allyHit', { ally: a.name, name: tgt.name, n: dmg })); if (tgt.hp <= 0) log.push(t('game.fight.log.down', { name: tgt.name })); }
        else log.push(t('game.fight.log.allyMiss', { ally: a.name, name: tgt.name }));
      }
    }
    return { ...s, foes: foesNow, allies, log };
  };
  /** 상대의 차례: 나와 동료 가운데 가까운 쪽을 노린다. 붙어 있으면 치고, 쏘는 적은 보이면 쏘고, 아니면 두 칸까지 다가온다 (한 칸만 움직였으면 이어서 친다) */
  const foesTurn = (s: St): St => {
    const log = [...s.log]; let hp = s.hp; const list = s.foes.map(f => ({ ...f })), allies = s.allies.map(a => ({ ...a })); let myAil: Ails = { ...s.ail }, mark = s.mark;
    // 예고된 일격이 떨어진다: 표시된 칸에 그대로 있으면 크게 다친다
    if (mark) { const by = list.find(f => f.id === mark!.by);
      if (by && by.hp > 0) { if (mark.cells.includes(key(s.x, s.y))) { const dmg = Math.max(2, Math.round((d(6) + by.atk * 1.5) * DIFF_HIT[g.diff] * (s.guard ? .5 : 1))); hp = Math.max(0, hp - dmg); log.push(t('game.fight.log.slam', { name: by.name, n: dmg })); } else log.push(t('game.fight.log.slamMiss', { name: by.name })); by.stun = Math.max(by.stun, 0); }
      mark = null; }
    for (const f of list) {
      if (f.hp <= 0 || hp <= 0) continue;
      { const [na, dmg] = tick(f.ail); f.ail = na; if (dmg) { f.hp = Math.max(0, f.hp - dmg); log.push(t('game.fight.log.ailFoe', { name: f.name, n: dmg })); if (f.hp <= 0) { log.push(t('game.fight.log.down', { name: f.name })); continue; } } }
      // 보스는 세 차례마다 주위를 휩쓰는 일격을 예고한다 — 그 차례에는 다른 공격을 하지 않는다
      if (f.boss && !mark && s.round % 3 === 0 && dist(f.x, f.y, s.x, s.y) <= 4) { const cells: string[] = []; for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) cells.push(key(s.x + dx, s.y + dy)); mark = { cells, by: f.id }; log.push(t('game.fight.log.windup', { name: f.name })); continue; }
      if (f.stun > 0) { f.stun--; log.push(t('game.fight.log.stunned', { name: f.name })); continue; }
      const marks = [{ x: s.x, y: s.y, ally: null as Ally | null }, ...allies.filter(a => a.hp > 0).map(a => ({ x: a.x, y: a.y, ally: a as Ally | null }))];
      const tg = marks.reduce((p, c) => dist(f.x, f.y, c.x, c.y) < dist(f.x, f.y, p.x, p.y) ? c : p);
      let stepped = 0; const sees = () => !!f.ranged && dist(f.x, f.y, tg.x, tg.y) <= RANGE && clear(f.x, f.y, tg.x, tg.y, rocks);
      if (dist(f.x, f.y, tg.x, tg.y) > 1 && !sees()) {
        const taken = (k: string) => rocks.has(k) || list.some(o => o.hp > 0 && o.id !== f.id && key(o.x, o.y) === k) || marks.some(m => m !== tg && key(m.x, m.y) === k);
        const from = walk(tg.x, tg.y, taken);
        for (; stepped < 2 && dist(f.x, f.y, tg.x, tg.y) > 1 && !sees(); stepped++) {
          let best: [number, number] | null = null, bestN = from.get(key(f.x, f.y)) ?? 999;
          for (const [dx, dy] of STEPS) { const nx = f.x + dx, ny = f.y + dy, n = from.get(key(nx, ny)); if (n != null && n > 0 && n < bestN) { best = [nx, ny]; bestN = n; } }
          if (!best) break; f.x = best[0]; f.y = best[1];
        }
      }
      const near = dist(f.x, f.y, tg.x, tg.y) <= 1;
      if ((near || sees()) && stepped <= 1) {
        const mine = !tg.ally, die = d(20), hit = die === 20 || (die !== 1 && die + f.atk + edge(f.x, f.y, tg.x, tg.y, !near) >= (mine ? 10 + M.dex + (s.guard ? 4 : 0) : 11));
        const who = tg.ally?.name || '';
        if (!hit) log.push(mine ? t('game.fight.log.foeMiss', { name: f.name }) : t('game.fight.log.foeMissAlly', { name: f.name, ally: who }));
        else {
          const dmg = Math.max(1, Math.round((d(4) + f.atk / 2) * DIFF_HIT[g.diff] * (mine && s.guard ? .5 : 1)));
          if (mine) { hp = Math.max(0, hp - dmg); log.push(t(near ? 'game.fight.log.foeHit' : 'game.fight.log.foeShot', { name: f.name, n: dmg }));
            if (f.el && d(3) === 1) { const a = AIL_OF[f.el]; if (a !== 'stun') { myAil = { ...myAil, [a]: a === 'poison' ? 4 : 2 }; log.push(t('game.fight.ail.got.' + a)); } } }
          else { tg.ally!.hp = Math.max(0, tg.ally!.hp - dmg); log.push(t('game.fight.log.foeHitAlly', { name: f.name, ally: who, n: dmg })); if (tg.ally!.hp <= 0) log.push(t('game.fight.log.allyDown', { ally: who })); }
        }
      }
    }
    // 내 차례가 돌아오기 전에 화상 · 중독이 한 번 탄다
    if (hp > 0) { const [na, dmg] = tick(myAil); myAil = na; if (dmg) { hp = Math.max(0, hp - dmg); log.push(t('game.fight.log.ailMe', { n: dmg })); } }
    if (hp < s.hp) sfx('hurt');
    return { ...s, hp, foes: list, allies, ail: myAil, mark, log: log.slice(-6), moved: false, guard: false, round: s.round + 1, hurt: hp < s.hp ? s.hurt + 1 : s.hurt, end: hp <= 0 ? 'lose' : list.every(f => f.hp <= 0) ? 'win' : s.end };
  };
  const won = (s: St) => s.foes.every(f => f.hp <= 0);
  /** 내 행동이 끝났다: 다 쓰러뜨렸으면 승리, 아니면 동료 → 상대 차례 */
  const after = (s0: St) => {
    if (s0.end) return setSt(s0);
    const s = won(s0) ? s0 : alliesTurn(s0), next: St = won(s) ? { ...s, log: s.log.slice(-5), end: 'win' } : foesTurn(s);
    if (next.end === 'win') sfx('win'); else if (next.end === 'lose') sfx('lose');
    setSt(next);
  };

  const moveTo = (x: number, y: number) => { if (reach.has(key(x, y)) && (x !== st.x || y !== st.y)) { sfx('place'); setSt({ ...st, x, y, moved: true }); } };
  const attack = (f: Unit) => {
    const how = canHit(f); if (!how || st.end) return;
    const mod = (how === 'melee' ? M.str : M.dex) + (st.aim ? 4 : 0) + edge(st.x, st.y, f.x, f.y, how === 'shot'), die = d(20), hit = st.sure || die === 20 || (die !== 1 && die + mod >= (how === 'melee' ? 10 : 11));
    const log = [...st.log]; let foesNow = st.foes;
    if (hit) {
      const weak = !!myEl && !!f.el && WEAK[f.el] === myEl, same = !!myEl && f.el === myEl, crit = die === 20 || st.sure;
      const dmg = Math.max(1, Math.round((d(6) + Math.max(0, how === 'melee' ? M.str + 1 : M.dex)) * (crit ? 2 : 1) * (weak ? 1.5 : same ? .5 : 1)));
      const gain: Ails = { ...f.ail }; if (crit) gain.bleed = 3; if (myEl && !same) { const a = AIL_OF[myEl]; if (a !== 'stun' && d(3) === 1) gain[a] = a === 'poison' ? 4 : 2; }
      foesNow = st.foes.map(o => o.id === f.id ? { ...o, hp: Math.max(0, o.hp - dmg), ail: gain, stun: myEl === 'bolt' && !same && d(4) === 1 ? Math.max(o.stun, 1) : o.stun } : o);
      if (weak) log.push(t('game.fight.log.weak', { name: f.name }));
      log.push(t(die === 20 || st.sure ? 'game.fight.log.crit' : how === 'melee' ? 'game.fight.log.hit' : 'game.fight.log.shot', { name: f.name, n: dmg }));
      if (f.hp - dmg <= 0) log.push(t('game.fight.log.down', { name: f.name }));
      sfx('hit');
    } else { log.push(t('game.fight.log.miss', { name: f.name })); sfx('miss'); }
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
    // 전리품의 등급: 흔한 것은 물약, 드문 것은 운명 점, 보스를 잡으면 하나가 더 떨어진다
    let loot = ''; if (won) { const rolls = 1 + (foes.some(f => f.boss) ? 1 : 0), got: string[] = [];
      for (let i = 0; i < rolls; i++) { const r = d(100) + foes.length * 4; if (r > 92) { fx.push({ k: 'fate', n: 1 }); got.push(t('game.loot.fate')); } else if (r > 55) { fx.push({ k: 'item', name: t('game.loot.potion'), n: 1 }); got.push(t('game.loot.potion')); } }
      loot = got.join(', '); }
    onDone({ outcome: st.end, rounds: st.round, took: Math.max(0, sheet.hp - st.hp), hp: st.hp, fx, gold, xp, fallen: st.allies.filter(a => a.hp <= 0).map(a => a.name), loot });
  };

  const cells = [];
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const k = key(x, y), f = alive.find(o => o.x === x && o.y === y), me = st.x === x && st.y === y, pal = st.allies.find(a => a.hp > 0 && a.x === x && a.y === y), rock = rocks.has(k), can = !st.end && f ? canHit(f) : '', go = !f && !me && !pal && !rock && reach.has(k);
    cells.push(<button key={k} type="button" disabled={!!st.end || rock || me || !!pal || (!go && !can)} aria-label={f ? f.name : pal ? pal.name : me ? t('game.you') : rock ? t('game.fight.rock') : `${x + 1},${y + 1}`}
      className={`gm-cell${rock ? ' is-rock' : ''}${high.has(k) ? ' is-high' : ''}${bush.has(k) ? ' is-bush' : ''}${f?.ranged ? ' is-ranged' : ''}${me ? ' is-me' : ''}${pal ? ' is-pal' : ''}${f ? ' is-foe' : ''}${go ? ' is-go' : ''}${can ? ' is-aim' : ''}${f?.stun ? ' is-stun' : ''}${st.mark?.cells.includes(k) ? ' is-mark' : ''}${f?.boss ? ' is-boss' : ''}`}
      onClick={() => f ? attack(f) : moveTo(x, y)}>{me ? <b style={faces.me ? { backgroundImage: `url("${faces.me}")` } : undefined}>{faces.me ? '' : t('game.fight.meMark')}</b> : pal ? <b style={face(pal.name)}>{face(pal.name) ? '' : pal.name.slice(0, 1)}</b> : f ? <><b><Emblem kind={foeKind(f.name)} /></b><em>{f.id + 1}</em><i style={{ width: `${f.hp / f.max * 100}%` }} /></> : rock ? <Terrain kind="rock" /> : null}{!rock && high.has(k) ? <span className="gm-land"><Terrain kind="high" /></span> : null}{!rock && bush.has(k) ? <span className="gm-land"><Terrain kind="bush" /></span> : null}</button>);
  }
  return <div className="gm-mini gm-fight">
    <div className="gm-roster">
      <div className="is-me"><small>{t('game.you')}</small><b>{st.hp}<i>/{sheet.hpMax}</i></b><Bar v={st.hp} max={sheet.hpMax} />{myEl || Object.keys(st.ail).length ? <span className="gm-ails">{myEl ? <i className={'is-' + myEl}>{t('game.el.' + myEl)}</i> : null}{(Object.keys(st.ail) as Ail[]).map(a => <i key={a} className="is-ail">{t('game.fight.ail.' + a)} {st.ail[a]}</i>)}</span> : null}</div>
      {st.allies.map(a => <div key={a.name} className={a.hp <= 0 ? 'is-pal is-out' : 'is-pal'}><small>{a.name}</small><b>{a.hp}<i>/{a.max}</i></b><Bar v={a.hp} max={a.max} /></div>)}
      {st.foes.map(f => <div key={f.id} className={f.hp <= 0 ? 'is-out' : ''}><small>{f.id + 1} · {f.name}{f.ranged ? ' ➶' : ''}</small>{f.el || f.boss || Object.keys(f.ail).length ? <span className="gm-ails">{f.boss ? <i className="is-boss">{t('game.fight.boss')}</i> : null}{f.el ? <i className={'is-' + f.el}>{t('game.el.' + f.el)}</i> : null}{(Object.keys(f.ail) as Ail[]).map(a => <i key={a} className="is-ail">{t('game.fight.ail.' + a)} {f.ail[a]}</i>)}</span> : null}<b>{f.hp}<i>/{f.max}</i></b><Bar v={f.hp} max={f.max} /></div>)}
    </div>
    <div key={st.hurt} className={`gm-board${st.hurt ? ' is-hurt' : ''}`} style={{ gridTemplateColumns: `repeat(${W}, 1fr)` }}>{cells}</div>
    <p className="gm-legend"><span><Terrain kind="rock" size={20} />{t('game.fight.rock')}</span><span><Terrain kind="high" size={20} />{t('game.fight.high')}</span><span><Terrain kind="bush" size={20} />{t('game.fight.bush')}</span></p>
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
