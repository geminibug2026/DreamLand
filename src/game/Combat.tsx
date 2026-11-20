// 전투: 모눈 위에서 한 차례씩. 움직이고(3칸) 행동 하나를 한다 — 붙어서 치거나, 떨어져서 쏘거나, 막거나, 마시거나, 달아난다.
// 바위는 길과 시야를 막는다. 계산은 모두 앱이 하고, 끝나면 결과만 진행자에게 알린다
import { useEffect, useMemo, useState } from 'react';
import { t } from '../i18n';
import { sfx } from './sfx';
import { gearOf, packBag, type BagCfg } from './bag';
import { Emblem, Terrain } from './Art';
import { foeKind, iconOf, traitOf, type Trait } from './bestiary';
import { airOfFight, allyTemper, bloodied, fade, mindOf, reactDmg, reactOf, temperOf, wantsOut, yields, type AllyTemper, type Aura, type Mind, type Reaction, type Temper } from './react';
import type { BossMove, BossScript } from './saga';
import { DIFF_HIT, WEAK, d, elementOf, isPotion, modOf, statsOf, type Element, type Foe, type Fx, type GameCfg, type Sheet, type StatKey } from './state';

export interface FightResult { outcome: 'win' | 'lose' | 'fled'; rounds: number; took: number; hp: number; fx: Fx[]; gold: number; xp: number; fallen: string[]; loot: string; /** 달아난 적 · 항복한 적 · 항복한 적을 베었는지 · 원소 반응 횟수 */ ran: string[]; yielded: string[]; merciless: boolean; reacts: number; /** 졌고, 기록하지 않고 체크포인트로 돌아가기를 골랐다 */ rewind?: boolean }
type End = '' | FightResult['outcome'];
/** 상태 이상: 남은 차례 수. 화상 · 중독 · 출혈은 차례마다 피해, 냉기는 걸음이 줄어든다 */
type Ail = 'burn' | 'poison' | 'bleed' | 'chill' | 'web';
type Ails = Partial<Record<Ail, number>>;
const AIL_OF: Record<Element, Ail | 'stun'> = { fire: 'burn', poison: 'poison', ice: 'chill', bolt: 'stun' };
const AIL_DMG: Partial<Record<Ail, number>> = { burn: 2, poison: 1, bleed: 1 };
interface Unit extends Foe { id: number; x: number; y: number; max: number; stun: number; ail: Ails; kind: string; trait: Trait | ''; /** 갈라져 나온 것 · 이미 한 번 되살아난 것 */ spent?: boolean;
  /** 기질과 지능 (피투성이가 되면 기질이 한 번 바뀐다) · 남은 원소의 기운 (원소를 타고난 적은 흩어져도 두 차례 뒤에 돌아온다) · 싸움에서 빠진 까닭 */ temper: Temper; mind: Mind; shifted?: boolean; aura: Aura | null; calm: number; out?: 'fled' | 'yield';
  /** 우두머리의 각본: 이미 한 말 · 지금 기대는 수 · 이번 차례에 버티는 중 */ said?: number[]; prefer?: BossMove; ward?: boolean }
const unitOf = (f: Foe, id: number, x: number, y: number): Unit => { const kind = foeKind(f.name), trait = traitOf(kind); return { ...f, id, x, y, max: f.hp, stun: 0, ail: {}, kind, trait, ranged: f.ranged || trait === 'root' || trait === 'gaze', temper: temperOf(f.name, kind, !!f.boss), mind: mindOf(kind, !!f.boss), aura: f.el ? { el: f.el, n: 9 } : null, calm: 0 }; };
interface Ally { name: string; x: number; y: number; hp: number; max: number; temper: AllyTemper }
interface St { ail: Ails; /** 보스가 예고한 일격: 맞는 칸들과 누가 치는지 */ mark: { cells: string[]; by: number } | null; x: number; y: number; hp: number; foes: Unit[]; allies: Ally[]; herbs: string[]; kegs: string[]; /** 방금 내가 한 일 (따로 크게 보여 준다) */ mine: string[]; /** 칸 위에 떠오르는 숫자 */ pop: { k: string; text: string; miss: boolean; n: number } | null; hurt: number; moved: boolean; guard: boolean; round: number; log: string[]; used: string[]; end: End; special: boolean; sure: boolean; aim: boolean; /** 내게 남은 원소의 기운 · 일어난 반응 수 · 내가 고른 원소 · 우두머리의 대사 · 이번 차례 적들이 독려받았다 */ aura: Aura | null; reacts: number; el: Element | ''; say: { who: string; text: string; n: number } | null; rally: boolean }
const W = 7, H = 6, MOVE = 3, RANGE = 5;
/** 전리품: 그림 열쇠 → 재료, 떨어지는 장비와 소모품 */
const MAT: Record<string, string> = { beast: 'pelt', bear: 'claw', boar: 'tusk', rat: 'tail', cat: 'fang', ape: 'pelt', croc: 'scale', dragon: 'dscale', frog: 'slimy', turtle: 'shell', crab: 'shell', beetle: 'shell', scorpion: 'venom', serpent: 'venom', spider: 'silk', bee: 'venom', wing: 'wingm', raptor: 'feather', owl: 'feather', phoenix: 'feather', slime: 'jelly', cube: 'jelly', ghost: 'ecto', banshee: 'ecto', wisp: 'ecto', skull: 'bone', zombie: 'bone', mummy: 'wrap', lich: 'bone', vampire: 'fang', golem: 'core', robot: 'core', mushroom: 'spore', tree: 'bark', plant: 'seed', eye: 'lens', beholder: 'lens', tentacle: 'tent', flayer: 'tent', fish: 'scale', goblin: 'ear', orc: 'tusk', ogre: 'tusk', minotaur: 'horn', demon: 'horn', satyr: 'horn', horn: 'horn', yeti: 'pelt', cerberus: 'fang', basilisk: 'scale', storm: 'spark', spark: 'spark', fairy: 'dust', mimic: 'coin', pumpkin: 'seed', horse: 'pelt' };
/** 사람꼴의 적은 재료 대신 지니고 있던 것을 떨군다 */
const FOLK = ['blade', 'bandit', 'assassin', 'knight', 'archer', 'crown', 'spark', 'goblin', 'orc'];
const FOLK_LOOT = ['pouch', 'note', 'badge', 'whet', 'flask', 'lockpick'];
const GEAR = ['dagger', 'sword', 'axe', 'bow', 'staff', 'shield', 'armor', 'helm', 'ring', 'amulet'];
const USE = ['potion', 'potion', 'antidote', 'bandage', 'torch', 'ration', 'bomb'];
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
    foes.forEach((f, i) => { const at = spots.splice(d(spots.length) - 1, 1)[0]; if (at) units.push(unitOf(f, i, at[0], at[1])); });
    const reach = walk(my.x, my.y, k => rocks.has(k));
    // 가끔 약초(밟으면 회복)와 화약통(치면 터진다)이 놓인다
    const free = (x: number, y: number) => !rocks.has(key(x, y)) && !high.has(key(x, y)) && !bush.has(key(x, y)) && !(x === my.x && y === my.y);
    const herbs: string[] = [], kegs: string[] = [];
    if (d(5) > 2) { const x = d(3), y = d(H) - 1; if (free(x, y)) herbs.push(key(x, y)); }
    if (d(2) === 1) { const x = 2 + d(3), y = d(H) - 1; if (free(x, y) && !herbs.includes(key(x, y))) kegs.push(key(x, y)); }
    if (units.length === foes.length && units.every(u => reach.has(key(u.x, u.y)))) return { rocks, high, bush, units, my, herbs, kegs };
  }
  return { rocks: new Set<string>(), high: new Set<string>(), bush: new Set<string>(), units: foes.map((f, i) => unitOf(f, i, W - 1, i % H)), my, herbs: [] as string[], kegs: [] as string[] };
}
const Bar = ({ v, max }: { v: number; max: number }) => <span className="gm-bar"><i style={{ width: `${Math.max(0, Math.min(100, v / max * 100))}%` }} /></span>;

export function Combat({ g, sheet, foes, onDone, faces = {}, air, edge: moodEdge = 0, canRewind = false, script }: { g: GameCfg; sheet: Sheet; foes: Foe[]; onDone(r: FightResult): void; /** 얼굴 그림: me 와 동료 이름 → 주소 */ faces?: Record<string, string>; /** 날씨와 실내 여부 */ air?: { weather: string; indoor: boolean }; /** 사기가 내 명중에 주는 보정 */ edge?: number; /** 졌을 때 돌아갈 체크포인트가 있다 */ canRewind?: boolean; /** 우두머리의 각본 (받아 오는 중일 수 있다) */ script?: Promise<BossScript | null> }) {
  const wx = useMemo(() => airOfFight(air?.weather || '', !!air?.indoor), [air?.weather, air?.indoor]);
  const face = (n: string) => faces[n.toLowerCase()] ? { backgroundImage: `url("${faces[n.toLowerCase()]}")` } : undefined;
  const lv = sheet.level || 1;
  const board = useMemo(() => makeBoard(foes), [foes]), { rocks, high, bush } = board;
  const M = { str: modOf(g, 'str'), dex: modOf(g, 'dex') };
  /** 걸친 무기 · 방어구가 주는 수치 */
  const gear = useMemo(() => gearOf(packBag(g.bag as BagCfg | undefined, sheet.items, sheet.level)), [g.bag, sheet.items, sheet.level]);
  /** 가진 물건에 원소가 깃들어 있으면 내 공격도 그 원소를 띤다 (횃불 → 불) */
  const myEls = useMemo(() => { const out: Element[] = [], add = (n: string) => { const e = elementOf(n); if (e && !out.includes(e)) out.push(e); }; if (gear.weapon) add(gear.weapon); for (const it of sheet.items) add(it.name); return out.slice(0, 3); }, [sheet.items, gear.weapon]);
  const tick = (a: Ails): [Ails, number] => { let dmg = 0; const next: Ails = {}; for (const k of Object.keys(a) as Ail[]) { if (!a[k]) continue; dmg += AIL_DMG[k] || 0; if (a[k]! > 1) next[k] = a[k]! - 1; } return [next, dmg]; };
  const top = (['str', 'dex', 'int', 'cha'] as StatKey[]).filter(k => statsOf(g).includes(k)).reduce((a, b) => modOf(g, b) > modOf(g, a) ? b : a, 'str' as StatKey);
  /** 높낮이와 엄폐에 따른 명중 보정: 위에서 아래로 +2, 아래에서 위로 -2, 덤불 속 상대를 쏘면 -2 */
  const edge = (ax: number, ay: number, bx: number, by: number, shot: boolean) => (high.has(key(ax, ay)) && !high.has(key(bx, by)) ? 2 : !high.has(key(ax, ay)) && high.has(key(bx, by)) ? -2 : 0) + (shot && bush.has(key(bx, by)) ? -2 : 0);
  const potions0 = sheet.items.filter(i => isPotion(i.name));
  const [st, setSt] = useState<St>(() => ({ ...board.my, hp: Math.max(1, sheet.hp), foes: board.units, herbs: board.herbs, kegs: board.kegs, mine: [], pop: null, hurt: 0, ail: {}, mark: null,
    // 동료는 내 곁에서 시작한다
    aura: null, reacts: 0, el: '', say: null, rally: false,
    allies: (sheet.party || []).slice(0, 3).map((name, i) => { const spots = [[0, board.my.y - 1], [0, board.my.y + 1], [1, board.my.y]].filter(([x, y]) => y >= 0 && y < H && !board.rocks.has(key(x, y))); const at = spots[i % Math.max(1, spots.length)] || [1, board.my.y]; return { name, x: at[0], y: at[1], hp: 8 + lv * 2, max: 8 + lv * 2, temper: allyTemper(name, sheet.people.find(p => p.name.toLowerCase() === name.toLowerCase())?.v || 0) }; }), moved: false, guard: false, round: 1, log: [], used: [], end: '', special: false, sure: false, aim: false }));
  /** 지금 내 타격에 실리는 원소: 원소가 깃든 물건이 여럿이면 골라 쓴다 (기운을 남기고 다른 원소로 반응을 일으키려고) */
  const myEl: Element | '' = st.el && myEls.includes(st.el) ? st.el : myEls[0] || '';
  // 우두머리의 각본이 도착하면 첫 대사를 띄운다
  const [boss, setBoss] = useState<BossScript | null>(null);
  useEffect(() => { let on = true; void script?.then(b => { if (!on || !b) return; setBoss(b); const who = foes.find(f => f.boss); if (b.open && who) setSt(s => s.round === 1 ? { ...s, say: { who: who.name, text: b.open, n: 1 } } : s); }); return () => { on = false; }; }, [script, foes]);
  /** 반응이 일었다: 기록에 남기고, 반응마다의 덤(멈춤 · 상태 · 약화)을 맞은 쪽에 얹는다 */
  const struck = (f: Unit, rx: Reaction, log: string[]) => { log.push(t('game.fight.log.react', { name: f.name, react: t('game.react.' + rx.id) })); if (rx.stun) f.stun = Math.max(f.stun, rx.stun); if (rx.ail) f.ail = { ...f.ail, [rx.ail]: rx.ailN || 2 }; if (rx.sap) f.atk = Math.max(0, f.atk - rx.sap); f.aura = null; f.calm = 2; };
  const alive = st.foes.filter(f => f.hp > 0);
  const left = (name: string) => (potions0.find(p => p.name === name)?.n || 0) - st.used.filter(u => u === name).length;
  const potion = potions0.find(p => left(p.name) > 0);
  const occupied = (foesNow: Unit[], except = -1) => (k: string) => rocks.has(k) || foesNow.some(f => f.hp > 0 && f.id !== except && key(f.x, f.y) === k) || st.allies.some(a => a.hp > 0 && key(a.x, a.y) === k);
  const reach = st.end || st.moved || st.ail.web ? new Map<string, number>() : walk(st.x, st.y, occupied(st.foes), st.ail.chill ? 1 : MOVE, high);
  const canHit = (f: Unit, x = st.x, y = st.y) => { const n = dist(x, y, f.x, f.y); return n <= 1 ? 'melee' : n <= RANGE + (high.has(key(x, y)) ? 1 : 0) && clear(x, y, f.x, f.y, rocks) ? 'shot' : ''; };

  /** 쓰러진 뒤에 벌어지는 일: 해골은 한 번 되살아날 수 있고, 슬라임은 둘로 갈라진다 */
  const aftermath = (list: Unit[], log: string[], s: St): Unit[] => {
    const out = list.map(f => ({ ...f }));
    for (const f of [...out]) {
      if (f.hp > 0 || f.spent) continue;
      if (f.trait === 'undying') { f.spent = true; if (d(2) === 1) { f.hp = Math.max(2, Math.ceil(f.max / 3)); f.ail = {}; log.push(t('game.fight.log.rise', { name: f.name })); } }
      else if (f.trait === 'split' && f.max >= 6 && out.filter(o => o.hp > 0).length < 6) {
        f.spent = true; let made = 0;
        for (const [dx, dy] of [[0, 0], ...STEPS, [1, 1], [-1, -1], [1, -1], [-1, 1]]) {
          const x = f.x + dx, y = f.y + dy, k = key(x, y); if (made >= 2) break;
          if (x < 0 || y < 0 || x >= W || y >= H || rocks.has(k) || (x === s.x && y === s.y) || s.allies.some(a => a.hp > 0 && a.x === x && a.y === y) || out.some(o => o.hp > 0 && o.x === x && o.y === y)) continue;
          const hp = Math.max(2, Math.ceil(f.max / 3)); out.push({ ...f, id: Math.max(...out.map(o => o.id)) + 1, x, y, hp, max: hp, atk: Math.max(1, f.atk - 1), stun: 0, ail: {}, spent: true, boss: false }); made++;
        }
        if (made) log.push(t('game.fight.log.split', { name: f.name }));
      }
    }
    return out;
  };
  /** 내가 주는 피해: 골렘은 단단하고(-2), 유령은 원소가 깃들지 않은 공격을 반만 받는다 */
  const soak = (f: Unit, dmg: number, el: boolean) => Math.max(1, f.trait === 'armor' ? dmg - 2 : f.trait === 'phase' && !el ? Math.ceil(dmg / 2) : dmg);
  /** 동료의 차례: 붙어 있는 적을 치고, 없으면 가장 가까운 적에게 두 칸 다가간다 */
  const alliesTurn = (s: St): St => {
    const log = [...s.log], foesNow = s.foes.map(f => ({ ...f })), allies = s.allies.map(a => ({ ...a }));
    for (const a of allies) {
      if (a.hp <= 0) continue; const live = foesNow.filter(f => f.hp > 0); if (!live.length) break;
      // 기질: 곁을 지키는 동료는 내게 가장 가까운 적을, 눈썰미 좋은 동료는 가장 약해진 적을 노린다. 조심스러운 동료는 크게 다치면 물러선다
      const tgt = a.temper === 'guardian' ? live.reduce((p, c) => dist(s.x, s.y, c.x, c.y) < dist(s.x, s.y, p.x, p.y) ? c : p) : a.temper === 'sharp' ? live.reduce((p, c) => c.hp < p.hp ? c : p) : live.reduce((p, c) => dist(a.x, a.y, c.x, c.y) < dist(a.x, a.y, p.x, p.y) ? c : p);
      if (a.temper === 'careful' && a.hp <= a.max * .4 && dist(a.x, a.y, tgt.x, tgt.y) <= 1) {
        const back = STEPS.map(([dx, dy]) => [a.x + dx, a.y + dy]).filter(([x, y]) => x >= 0 && y >= 0 && x < W && y < H && !rocks.has(key(x, y)) && !(x === s.x && y === s.y) && !allies.some(o => o !== a && o.hp > 0 && o.x === x && o.y === y) && !foesNow.some(f => f.hp > 0 && f.x === x && f.y === y) && live.every(f => dist(x, y, f.x, f.y) > 1))[0];
        if (back) { a.x = back[0]; a.y = back[1]; log.push(t('game.fight.log.allyBack', { ally: a.name })); continue; }
      }
      if (dist(a.x, a.y, tgt.x, tgt.y) > 1) {
        const from = walk(tgt.x, tgt.y, k => rocks.has(k) || (k !== key(a.x, a.y) && (key(s.x, s.y) === k || allies.some(o => o !== a && o.hp > 0 && key(o.x, o.y) === k) || foesNow.some(f => f.hp > 0 && f !== tgt && key(f.x, f.y) === k))));
        for (let n = 0; n < 2 && dist(a.x, a.y, tgt.x, tgt.y) > 1; n++) { let best: [number, number] | null = null, bestN = from.get(key(a.x, a.y)) ?? 999; for (const [dx, dy] of STEPS) { const v = from.get(key(a.x + dx, a.y + dy)); if (v != null && v > 0 && v < bestN) { best = [a.x + dx, a.y + dy]; bestN = v; } } if (!best) break; a.x = best[0]; a.y = best[1]; }
      }
      if (dist(a.x, a.y, tgt.x, tgt.y) <= 1) {
        if (d(20) + 2 + Math.floor(lv / 2) >= 10) { const dmg = soak(tgt, d(6) + 1 + (a.temper === 'bold' ? 1 : 0), false); tgt.hp = Math.max(0, tgt.hp - dmg); log.push(t('game.fight.log.allyHit', { ally: a.name, name: tgt.name, n: dmg })); if (tgt.hp <= 0) log.push(t('game.fight.log.down', { name: tgt.name })); }
        else log.push(t('game.fight.log.allyMiss', { ally: a.name, name: tgt.name }));
      }
    }
    return { ...s, foes: aftermath(foesNow, log, s), allies, log };
  };
  /** 상대의 차례: 나와 동료 가운데 가까운 쪽을 노린다. 붙어 있으면 치고, 쏘는 적은 보이면 쏘고, 아니면 두 칸까지 다가온다 (한 칸만 움직였으면 이어서 친다) */
  const foesTurn = (s: St): St => {
    const log = [...s.log]; let hp = s.hp; let list: Unit[] = s.foes.map(f => ({ ...f, ward: false })); const allies = s.allies.map(a => ({ ...a })); let myAil: Ails = { ...s.ail }, mark = s.mark, myAura = fade(s.aura), say = s.say, rally = false, reacts = s.reacts;
    const hadBoss = list.some(f => f.boss), leaderDown = hadBoss && !list.some(f => f.boss && f.hp > 0);
    // 예고된 일격이 떨어진다: 표시된 칸에 그대로 있으면 크게 다친다
    if (mark) { const by = list.find(f => f.id === mark!.by);
      if (by && by.hp > 0) { if (mark.cells.includes(key(s.x, s.y))) { const dmg = Math.max(2, Math.round((d(6) + by.atk * 1.5) * DIFF_HIT[g.diff] * (s.guard ? .5 : 1))); hp = Math.max(0, hp - dmg); log.push(t('game.fight.log.slam', { name: by.name, n: dmg })); if (by.trait === 'breath' && !by.boss) { myAil = { ...myAil, burn: 2 }; log.push(t('game.fight.ail.got.burn')); } } else log.push(t('game.fight.log.slamMiss', { name: by.name })); by.stun = Math.max(by.stun, 0); }
      mark = null; }
    for (const f of list) {
      if (f.hp <= 0 || hp <= 0) continue;
      { const [na, dmg] = tick(f.ail); f.ail = na; if (dmg) { f.hp = Math.max(0, f.hp - dmg); log.push(t('game.fight.log.ailFoe', { name: f.name, n: dmg })); if (f.hp <= 0) { log.push(t('game.fight.log.down', { name: f.name })); continue; } } }
      // 원소의 기운: 남이 묻힌 것은 옅어지고, 타고난 것은 흩어진 뒤 두 차례면 돌아온다
      if (f.el && !f.aura) { if (--f.calm <= 0) f.aura = { el: f.el, n: 9 }; } else if (f.aura && f.aura.n < 9) f.aura = fade(f.aura);
      // 피투성이가 되면 기질이 바뀐다 (한 번만)
      const others = list.filter(o => o.id !== f.id && o.hp > 0).length;
      if (!f.shifted && f.hp <= f.max / 2) { f.shifted = true; const next = bloodied(f.temper, f.mind, !!f.boss, !others); if (next !== f.temper) { f.temper = next; log.push(t('game.fight.log.shift', { name: f.name, temper: t('game.temper.' + next) })); } }
      // 말이 통하는 적은 혼자 남았거나 우두머리가 쓰러지면 무기를 버린다
      if (yields(f.kind, f.mind, f.hp, f.max, !!f.boss, !others, leaderDown)) { f.out = 'yield'; f.hp = 0; f.spent = true; log.push(t('game.fight.log.yield', { name: f.name })); continue; }
      // 겁먹은 적은 판 끝으로 달아난다. 끝에 닿아 있으면 사라진다 — 그 전에 잡을 수 있다
      if (f.stun <= 0 && wantsOut(f.temper, f.mind, f.hp, f.max, !!f.boss, f.kind)) {
        if (f.x >= W - 1) { f.out = 'fled'; f.hp = 0; f.spent = true; log.push(t('game.fight.log.ran', { name: f.name })); continue; }
        for (let n = 0; n < 2 && f.x < W - 1; n++) { const nx = f.x + 1, ok = (y: number) => y >= 0 && y < H && !rocks.has(key(nx, y)) && !list.some(o => o.hp > 0 && o.id !== f.id && o.x === nx && o.y === y) && !(s.x === nx && s.y === y) && !allies.some(a => a.hp > 0 && a.x === nx && a.y === y); const y = [f.y, f.y - 1, f.y + 1].find(ok); if (y == null) break; f.x = nx; f.y = y; }
        log.push(t('game.fight.log.running', { name: f.name })); continue;
      }
      // 우두머리의 각본: 체력이 4분의 3 · 절반 · 4분의 1 아래로 내려갈 때마다 한마디 하고, 기대는 수가 바뀐다
      if (f.boss && boss) for (const b of boss.beats) if (f.hp <= f.max * b.at / 100 && !(f.said || []).includes(b.at)) { f.said = [...(f.said || []), b.at]; f.prefer = b.prefer; say = { who: f.name, text: b.say, n: (say?.n || 0) + 1 }; }
      // 각본이 있으면 두 차례에 한 번 그 수를 쓴다. 쓸 수 없는 수(이미 예고 중 · 독려할 부하가 없음)는 쓸 수 있는 다른 수로 바꾼다
      if (f.boss && f.prefer && f.stun <= 0 && s.round % 2 === 0) {
        const legal: BossMove[] = [...(!mark && dist(f.x, f.y, s.x, s.y) <= 4 ? ['slam' as const] : []), ...(f.trait !== 'root' ? ['rush' as const] : []), 'ward', ...(others ? ['rally' as const] : [])], move = legal.includes(f.prefer) ? f.prefer : legal[0];
        if (move === 'ward') { f.ward = true; f.hp = Math.min(f.max, f.hp + 2); log.push(t('game.fight.log.ward', { name: f.name })); continue; }
        if (move === 'rally') { rally = true; log.push(t('game.fight.log.rally', { name: f.name })); continue; }
        if (move === 'slam') { const cells: string[] = []; for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) cells.push(key(s.x + dx, s.y + dy)); mark = { cells, by: f.id }; log.push(t('game.fight.log.windup', { name: f.name })); continue; }
        // 돌진: 세 칸까지 달려들어 가볍게 두 번 친다
        if (dist(f.x, f.y, s.x, s.y) > 1) { const from = walk(s.x, s.y, k => rocks.has(k) || list.some(o => o.hp > 0 && o.id !== f.id && key(o.x, o.y) === k) || allies.some(a => a.hp > 0 && key(a.x, a.y) === k)); for (let n = 0; n < 3 && dist(f.x, f.y, s.x, s.y) > 1; n++) { let best: [number, number] | null = null, bestN = from.get(key(f.x, f.y)) ?? 999; for (const [dx, dy] of STEPS) { const v = from.get(key(f.x + dx, f.y + dy)); if (v != null && v > 0 && v < bestN) { best = [f.x + dx, f.y + dy]; bestN = v; } } if (!best) break; f.x = best[0]; f.y = best[1]; } }
        if (dist(f.x, f.y, s.x, s.y) <= 1) { let total = 0; for (let n = 0; n < 2; n++) if (d(20) + f.atk >= 10 + M.dex + gear.def + (s.guard ? 4 : 0)) total += Math.max(1, Math.round((d(3) + f.atk / 3) * DIFF_HIT[g.diff] * (s.guard ? .5 : 1)) - gear.soak); if (total) { hp = Math.max(0, hp - total); log.push(t('game.fight.log.rush', { name: f.name, n: total })); } else log.push(t('game.fight.log.foeMiss', { name: f.name })); }
        else log.push(t('game.fight.log.rushShort', { name: f.name }));
        continue;
      }
      // 보스는 세 차례마다 주위를 휩쓰는 일격을 예고한다 — 그 차례에는 다른 공격을 하지 않는다
      if (f.boss && !f.prefer && !mark && s.round % 3 === 0 && dist(f.x, f.y, s.x, s.y) <= 4) { const cells: string[] = []; for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) cells.push(key(s.x + dx, s.y + dy)); mark = { cells, by: f.id }; log.push(t('game.fight.log.windup', { name: f.name })); continue; }
      // 용은 세 차례마다 내가 선 줄을 따라 불을 뿜으려 한다
      if (f.trait === 'breath' && !f.boss && !mark && s.round % 3 === 0) { const row = Math.abs(f.x - s.x) >= Math.abs(f.y - s.y), cells: string[] = []; for (let i = 0; i < (row ? W : H); i++) cells.push(row ? key(i, s.y) : key(s.x, i)); mark = { cells, by: f.id }; log.push(t('game.fight.log.breath', { name: f.name })); continue; }
      if (f.trait === 'root' && f.hp < f.max) f.hp++;
      if (f.stun > 0) { f.stun--; log.push(t('game.fight.log.stunned', { name: f.name })); continue; }
      const marks = [{ x: s.x, y: s.y, ally: null as Ally | null }, ...allies.filter(a => a.hp > 0).map(a => ({ x: a.x, y: a.y, ally: a as Ally | null }))];
      // 누구를 노리나: 본능은 가장 가까운 쪽, 거만한 자는 오직 나, 꾀 많은 자는 닿는 범위의 가장 약한 쪽, 전술을 아는 자는 내가 위태로우면 나를 끝내려 든다
      const near0 = marks.reduce((p, c) => dist(f.x, f.y, c.x, c.y) < dist(f.x, f.y, p.x, p.y) ? c : p), hpOf = (m: typeof near0) => m.ally ? m.ally.hp : hp, inReach = marks.filter(m => dist(f.x, f.y, m.x, m.y) <= (f.ranged ? RANGE : 3));
      let tg = f.temper === 'proud' ? marks[0] : f.mind === 'tactical' && hp <= sheet.hpMax * .35 ? marks[0] : (f.temper === 'cunning' || f.mind === 'tactical') && inReach.length ? inReach.reduce((p, c) => hpOf(c) < hpOf(p) ? c : p) : near0;
      // 곁을 지키는 동료가 내 옆에 있으면 절반은 대신 막아선다
      if (!tg.ally) { const shield = marks.find(m => m.ally?.temper === 'guardian' && dist(m.x, m.y, s.x, s.y) <= 1 && dist(f.x, f.y, m.x, m.y) <= dist(f.x, f.y, s.x, s.y) + 1); if (shield && d(2) === 1) { tg = shield; log.push(t('game.fight.log.cover', { ally: shield.ally!.name })); } }
      // 신중한 사수는 붙으면 한 칸 물러나서 쏜다
      if (f.ranged && f.temper === 'cautious' && f.trait !== 'root' && dist(f.x, f.y, tg.x, tg.y) <= 1) { const back = STEPS.map(([dx, dy]) => [f.x + dx, f.y + dy]).find(([x, y]) => x >= 0 && y >= 0 && x < W && y < H && !rocks.has(key(x, y)) && dist(x, y, tg.x, tg.y) > 1 && !list.some(o => o.hp > 0 && o.x === x && o.y === y) && !marks.some(m => m.x === x && m.y === y)); if (back) { f.x = back[0]; f.y = back[1]; } }
      let stepped = 0; const sees = () => !!f.ranged && dist(f.x, f.y, tg.x, tg.y) <= RANGE && clear(f.x, f.y, tg.x, tg.y, rocks);
      if (dist(f.x, f.y, tg.x, tg.y) > 1 && !sees()) {
        const over = f.trait === 'fly' || f.trait === 'phase', reachN = f.trait === 'root' ? 0 : f.trait === 'armor' ? 1 : f.trait === 'fly' ? 3 : 2;
        const taken = (k: string) => (!over && rocks.has(k)) || list.some(o => o.hp > 0 && o.id !== f.id && key(o.x, o.y) === k) || marks.some(m => m !== tg && key(m.x, m.y) === k);
        const from = walk(tg.x, tg.y, taken);
        for (; stepped < reachN && dist(f.x, f.y, tg.x, tg.y) > 1 && !sees(); stepped++) {
          let best: [number, number] | null = null, bestN = from.get(key(f.x, f.y)) ?? 999;
          for (const [dx, dy] of STEPS) { const nx = f.x + dx, ny = f.y + dy, n = from.get(key(nx, ny)); if (n != null && n > 0 && n < bestN) { best = [nx, ny]; bestN = n; } }
          if (!best) break; f.x = best[0]; f.y = best[1];
        }
      }
      const near = dist(f.x, f.y, tg.x, tg.y) <= 1;
      if ((near || sees()) && stepped <= (f.trait === 'fly' ? 2 : 1)) {
        const mine = !tg.ally, die = d(20), pack = f.trait === 'pack' && list.some(o => o.id !== f.id && o.hp > 0 && o.trait === 'pack' && dist(o.x, o.y, tg.x, tg.y) <= 1) ? 2 : 0, hit = die === 20 || (die !== 1 && die + f.atk + pack + edge(f.x, f.y, tg.x, tg.y, !near) + (near ? 0 : wx.shot) >= (mine ? 10 + M.dex + gear.def + (s.guard ? 4 : 0) : 11));
        const who = tg.ally?.name || '';
        if (!hit) log.push(mine ? t('game.fight.log.foeMiss', { name: f.name }) : t('game.fight.log.foeMissAlly', { name: f.name, ally: who }));
        else {
          // 원소: 날씨가 세기를 바꾸고, 내게 다른 원소의 기운이 남아 있으면 반응이 인다
          const rx = mine && f.el ? reactOf(myAura, f.el) : null;
          const dmg = reactDmg(Math.max(1, Math.round((d(4) + f.atk / 2 + (f.temper === 'reckless' ? 1 : 0) + (rally && !f.boss ? 2 : 0) + (f.el ? wx.el[f.el] || 0 : 0)) * DIFF_HIT[g.diff] * (mine && s.guard ? .5 : 1)) - (mine ? gear.soak : 0)), rx);
          if (mine && f.el) { if (rx) { reacts++; myAura = null; log.push(t('game.fight.log.reactMe', { react: t('game.react.' + rx.id) })); if (rx.ail) myAil = { ...myAil, [rx.ail]: rx.ailN || 2 }; if (rx.stun) myAil = { ...myAil, web: 1 }; } else myAura = { el: f.el, n: 2 }; }
          if (mine) { hp = Math.max(0, hp - dmg); log.push(t(near ? 'game.fight.log.foeHit' : 'game.fight.log.foeShot', { name: f.name, n: dmg }));
            if (f.trait === 'venom') { myAil = { ...myAil, poison: 4 }; log.push(t('game.fight.ail.got.poison')); }
            if ((f.trait === 'web' || f.trait === 'gaze') && d(2) === 1) { myAil = { ...myAil, web: 2 }; log.push(t(f.trait === 'web' ? 'game.fight.ail.got.web' : 'game.fight.ail.got.gaze')); }
            if (f.el && d(3) === 1) { const a = AIL_OF[f.el]; if (a !== 'stun') { myAil = { ...myAil, [a]: a === 'poison' ? 4 : 2 }; log.push(t('game.fight.ail.got.' + a)); } } }
          else { tg.ally!.hp = Math.max(0, tg.ally!.hp - dmg); log.push(t('game.fight.log.foeHitAlly', { name: f.name, ally: who, n: dmg })); if (tg.ally!.hp <= 0) log.push(t('game.fight.log.allyDown', { ally: who })); }
        }
      }
    }
    // 내 차례가 돌아오기 전에 화상 · 중독이 한 번 탄다
    if (hp > 0) { const [na, dmg] = tick(myAil); myAil = na; if (dmg) { hp = Math.max(0, hp - dmg); log.push(t('game.fight.log.ailMe', { n: dmg })); } }
    if (hp < s.hp) sfx('hurt');
    list = aftermath(list, log, s);
    return { ...s, hp, foes: list, allies, ail: myAil, mark, aura: myAura, say, rally, reacts, log: log.slice(-6), moved: false, guard: false, round: s.round + 1, hurt: hp < s.hp ? s.hurt + 1 : s.hurt, end: hp <= 0 ? 'lose' : list.every(f => f.hp <= 0) ? 'win' : s.end };
  };
  const won = (s: St) => s.foes.every(f => f.hp <= 0);
  /** 내 행동이 끝났다: 다 쓰러뜨렸으면 승리, 아니면 동료 → 상대 차례 */
  const after = (s00: St) => {
    const s0: St = { ...s00, mine: s00.log.slice(st.log.length) };
    if (s0.end) return setSt(s0);
    const s = won(s0) ? s0 : alliesTurn(s0), next: St = won(s) ? { ...s, log: s.log.slice(-5), end: 'win' } : foesTurn(s);
    if (next.end === 'win') sfx('win'); else if (next.end === 'lose') sfx('lose');
    // 우두머리가 쓰러지면 마지막 말을 남긴다
    const fell = boss?.fall ? next.foes.find(f => f.boss && f.hp <= 0 && !f.out && st.foes.some(o => o.id === f.id && o.hp > 0)) : null;
    setSt(fell ? { ...next, say: { who: fell.name, text: boss!.fall, n: (next.say?.n || 0) + 1 } } : next);
  };

  const moveTo = (x: number, y: number) => {
    const k = key(x, y); if (!reach.has(k) || (x === st.x && y === st.y)) return; sfx('place');
    if (st.herbs.includes(k)) { const heal = d(4) + 2; setSt({ ...st, x, y, moved: true, hp: Math.min(sheet.hpMax, st.hp + heal), herbs: st.herbs.filter(h => h !== k), log: [...st.log, t('game.fight.log.herb', { n: heal })] }); }
    else setSt({ ...st, x, y, moved: true });
  };
  /** 화약통: 붙어 있거나 쏠 수 있으면 터뜨린다. 둘레 한 칸의 모두가 다친다 (나와 동료도) */
  const canBlast = (k: string) => { const [x, y] = k.split(',').map(Number), n = dist(st.x, st.y, x, y); return n <= 1 || (n <= RANGE && clear(st.x, st.y, x, y, rocks)); };
  const blast = (k: string) => {
    if (st.end || !st.kegs.includes(k) || !canBlast(k)) return; const [x, y] = k.split(',').map(Number), log = [...st.log, t('game.fight.log.keg')]; sfx('hit');
    const foesNow = st.foes.map(f => f.hp > 0 && dist(f.x, f.y, x, y) <= 1 ? { ...f, hp: Math.max(0, f.hp - (5 + d(4))), ail: { ...f.ail, burn: 2 } } : f);
    for (const f of foesNow) if (f.hp <= 0 && st.foes.find(o => o.id === f.id)!.hp > 0) log.push(t('game.fight.log.down', { name: f.name }));
    const mine = dist(st.x, st.y, x, y) <= 1 ? 3 + d(3) : 0; if (mine) log.push(t('game.fight.log.kegMe', { n: mine }));
    const allies = st.allies.map(a => a.hp > 0 && dist(a.x, a.y, x, y) <= 1 ? { ...a, hp: Math.max(0, a.hp - 4) } : a);
    after({ ...st, hp: Math.max(mine ? 1 : 0, st.hp - mine), foes: aftermath(foesNow, log, st), allies, kegs: st.kegs.filter(q => q !== k), log, hurt: mine ? st.hurt + 1 : st.hurt });
  };
  const attack = (f: Unit) => {
    const how = canHit(f); if (!how || st.end) return;
    const mod = (how === 'melee' ? M.str : M.dex) + gear.aim + (st.aim ? 4 : 0) + edge(st.x, st.y, f.x, f.y, how === 'shot') + (how === 'shot' ? wx.shot : 0) + moodEdge + (f.temper === 'reckless' ? 1 : 0), die = d(20), hit = st.sure || die === 20 || (die !== 1 && die + mod >= (how === 'melee' ? 10 : 11));
    const log = [...st.log]; let foesNow = st.foes, pop: St['pop'] = null, reacts = st.reacts;
    if (hit) {
      // 반응: 상대에게 다른 원소의 기운이 남아 있으면 인다 (불과 얼음의 상성은 반응이 대신한다)
      const rx = reactOf(f.aura, myEl), weak = !rx && !!myEl && !!f.el && WEAK[f.el] === myEl, same = !!myEl && f.el === myEl, crit = die === 20 || st.sure;
      const base = Math.max(1, Math.round((d(6) + gear.dmg + Math.max(0, how === 'melee' ? M.str + 1 : M.dex) + (myEl ? wx.el[myEl] || 0 : 0)) * (crit ? 2 : 1) * (weak ? 1.5 : same ? .5 : 1))), raw = reactDmg(base, rx), dmg = Math.max(1, Math.round((rx?.pierce ? raw : soak(f, raw, !!myEl)) * (f.ward ? .5 : 1)));
      if (dmg < raw) log.push(t(f.trait === 'armor' ? 'game.fight.log.armor' : 'game.fight.log.phase', { name: f.name }));
      const gain: Ails = { ...f.ail }; if (crit) gain.bleed = 3; if (myEl && !same) { const a = AIL_OF[myEl]; if (a !== 'stun' && d(3) === 1) gain[a] = a === 'poison' ? 4 : 2; }
      foesNow = st.foes.map(o => o.id === f.id ? { ...o, hp: Math.max(0, o.hp - dmg), ail: gain, stun: myEl === 'bolt' && !same && d(wx.storm ? 2 : 4) === 1 ? Math.max(o.stun, 1) : o.stun, aura: myEl && !rx && !o.el ? { el: myEl, n: 3 } : o.aura } : o);
      if (rx) { reacts++; const hitNow = foesNow.find(o => o.id === f.id)!; struck(hitNow, rx, log);
        // 불벼락은 곁의 적들에게도 튄다
        if (rx.splash) foesNow = foesNow.map(o => o.id !== f.id && o.hp > 0 && dist(o.x, o.y, f.x, f.y) <= 1 ? { ...o, hp: Math.max(0, o.hp - rx.splash) } : o); }
      if (weak) log.push(t('game.fight.log.weak', { name: f.name }));
      log.push(t(die === 20 || st.sure ? 'game.fight.log.crit' : how === 'melee' ? 'game.fight.log.hit' : 'game.fight.log.shot', { name: f.name, n: dmg }));
      if (f.hp - dmg <= 0) log.push(t('game.fight.log.down', { name: f.name }));
      sfx('hit'); pop = { k: key(f.x, f.y), text: `-${dmg}`, miss: false, n: (st.pop?.n || 0) + 1 };
    } else { log.push(t('game.fight.log.miss', { name: f.name })); sfx('miss'); pop = { k: key(f.x, f.y), text: t('game.fight.missPop'), miss: true, n: (st.pop?.n || 0) + 1 }; }
    after({ ...st, foes: aftermath(foesNow, log, st), log, sure: false, pop, reacts });
  };
  // 공격 단추: 닿는 적 가운데 가장 약한 쪽을 친다. 닿는 적이 없으면 칠 수 있는 자리(없으면 가장 가까운 자리)로 다가간다
  const living = st.foes.filter(f => f.hp > 0);
  const target = living.filter(f => canHit(f)).sort((a, b) => a.hp - b.hp || dist(st.x, st.y, a.x, a.y) - dist(st.x, st.y, b.x, b.y))[0] || null;
  const approach = (() => {
    if (target || st.end || !living.length) return null;
    let best: { x: number; y: number; v: number } | null = null;
    for (const [k, steps] of reach) { const [x, y] = k.split(',').map(Number); if (x === st.x && y === st.y) continue;
      const near = Math.min(...living.map(f => dist(x, y, f.x, f.y))), v = (living.some(f => canHit(f, x, y)) ? 0 : 100) + near * 10 + steps + (st.mark?.cells.includes(k) ? 500 : 0);
      if (!best || v < best.v) best = { x, y, v }; }
    return best;
  })();
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
  const finish = (how: '' | 'rewind' | 'cruel' = '') => {
    if (!st.end) return;
    const ran = st.foes.filter(f => f.out === 'fled').map(f => f.name), yielded = st.foes.filter(f => f.out === 'yield').map(f => f.name), merciless = how === 'cruel';
    if (how === 'rewind') return onDone({ outcome: 'lose', rounds: st.round, took: 0, hp: sheet.hp, fx: [], gold: 0, xp: 0, fallen: [], loot: '', ran, yielded, merciless: false, reacts: st.reacts, rewind: true });
    const fx: Fx[] = []; if (st.hp !== sheet.hp) fx.push({ k: 'hp', n: st.hp - sheet.hp });
    for (const name of new Set(st.used)) fx.push({ k: 'item', name, n: -st.used.filter(u => u === name).length });
    // 이기면 전리품: 상대가 셀수록 많이 준다
    // 달아난 적은 아무것도 남기지 않는다. 항복한 적은 가진 것을 내놓는다(경험은 그대로)
    const won = st.end === 'win', paid = foes.filter(f => !ran.some(n => n === f.name)), xp = won ? Math.round(paid.reduce((n, f) => n + f.hp + f.atk * 3, 0)) : 0, gold = won ? paid.reduce((n, f) => n + d(4) + f.atk, 0) : 0;
    if (gold) fx.push({ k: 'gold', n: gold }); if (xp) fx.push({ k: 'xp', n: xp });
    // 전리품의 등급: 흔한 것은 물약, 드문 것은 운명 점, 보스를 잡으면 하나가 더 떨어진다
    // 전리품: 쓰러뜨린 것에게서 나오는 재료 + 등급 굴림 (소모품 → 보석 → 장비 → 운명 점). 보스나 큰 싸움이면 한 번 더 굴린다
    let loot = ''; if (won) {
      const got: string[] = [], give = (name: string) => { fx.push({ k: 'item', name, n: 1 }); got.push(name); };
      const firsts = st.foes.filter(f => (!f.spent || f.trait === 'undying') && (!f.out || (f.out === 'yield' && merciless)));
      for (const f of firsts.sort(() => Math.random() - .5).slice(0, firsts.length >= 4 ? 2 : 1)) if (d(10) <= 7) { const key = MAT[iconOf(f.kind)], folk = FOLK.includes(iconOf(f.kind)); give(key ? t('game.loot.mat.' + key) : folk ? t('game.loot.' + FOLK_LOOT[d(FOLK_LOOT.length) - 1]) : t('game.loot.mat.of', { name: f.name })); }
      const rolls = (paid.length ? 1 : 0) + (foes.some(f => f.boss) ? 1 : 0) + (paid.length >= 4 ? 1 : 0);
      for (let i = 0; i < rolls; i++) {
        const r = d(100) + foes.length * 3 + lv * 2;
        if (r > 100) { fx.push({ k: 'fate', n: 1 }); got.push(t('game.loot.fate')); }
        else if (r > 84) give(t(r > 94 ? 'game.loot.q2' : r > 89 ? 'game.loot.q1' : 'game.loot.q0', { item: t('game.loot.gear.' + GEAR[d(GEAR.length) - 1]) }));
        else if (r > 76) give(t('game.loot.gem'));
        else if (r > 40) give(t('game.loot.' + USE[d(USE.length) - 1]));
      }
      loot = got.join(', '); }
    onDone({ outcome: st.end, rounds: st.round, took: Math.max(0, sheet.hp - st.hp), hp: st.hp, fx, gold, xp, fallen: st.allies.filter(a => a.hp <= 0).map(a => a.name), loot, ran, yielded, merciless, reacts: st.reacts });
  };

  const cells = [];
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const k = key(x, y), f = alive.find(o => o.x === x && o.y === y), me = st.x === x && st.y === y, pal = st.allies.find(a => a.hp > 0 && a.x === x && a.y === y), rock = rocks.has(k), can = !st.end && f ? canHit(f) : '', keg = !f && !me && !pal && st.kegs.includes(k), boom = keg && !st.end && canBlast(k), herb = st.herbs.includes(k), go = !f && !me && !pal && !rock && !keg && reach.has(k);
    cells.push(<button key={k} type="button" disabled={!!st.end || (rock && !f) || me || !!pal || (!go && !can && !boom)} aria-label={f ? f.name : pal ? pal.name : me ? t('game.you') : rock ? t('game.fight.rock') : `${x + 1},${y + 1}`}
      className={`gm-cell${rock ? ' is-rock' : ''}${high.has(k) ? ' is-high' : ''}${bush.has(k) ? ' is-bush' : ''}${f?.ranged ? ' is-ranged' : ''}${me ? ' is-me' : ''}${pal ? ' is-pal' : ''}${f ? ' is-foe' : ''}${go ? ' is-go' : ''}${can ? ' is-aim' : ''}${f?.stun ? ' is-stun' : ''}${st.mark?.cells.includes(k) ? ' is-mark' : ''}${f?.boss ? ' is-boss' : ''}${boom ? ' is-boom' : ''}${herb && !f ? ' is-herb' : ''}`}
      onClick={() => f ? attack(f) : keg ? blast(k) : moveTo(x, y)}>{me ? <b style={faces.me ? { backgroundImage: `url("${faces.me}")` } : undefined}>{faces.me ? '' : t('game.fight.meMark')}</b> : pal ? <b style={face(pal.name)}>{face(pal.name) ? '' : pal.name.slice(0, 1)}</b> : f ? <><b><Emblem kind={f.kind} /></b><em>{f.id + 1}</em><i style={{ width: `${f.hp / f.max * 100}%` }} /></> : rock ? <Terrain kind="rock" /> : keg ? <Terrain kind="keg" /> : null}{st.pop && st.pop.k === k ? <span key={st.pop.n} className={`gm-pop${st.pop.miss ? ' is-miss' : ''}`}>{st.pop.text}</span> : null}{herb && !f && !me && !pal ? <span className="gm-land is-herb"><Terrain kind="herb" /></span> : null}{!rock && high.has(k) ? <span className="gm-land"><Terrain kind="high" /></span> : null}{!rock && bush.has(k) ? <span className="gm-land"><Terrain kind="bush" /></span> : null}</button>);
  }
  return <div className="gm-mini gm-fight">
    <div className="gm-roster">
      <div className="is-me"><small>{t('game.you')}</small><b>{st.hp}<i>/{sheet.hpMax}</i></b><Bar v={st.hp} max={sheet.hpMax} />{myEl || st.aura || Object.keys(st.ail).length ? <span className="gm-ails">{myEls.length > 1 ? myEls.map(e => <button key={e} type="button" className={`g2-el is-${e}${e === myEl ? ' on' : ''}`} aria-pressed={e === myEl} title={t('game.fight.elPick')} onClick={() => setSt({ ...st, el: e })}>{t('game.el.' + e)}</button>) : myEl ? <i className={'is-' + myEl}>{t('game.el.' + myEl)}</i> : null}{st.aura ? <i className="g2-aura" title={t('game.fight.auraTip')}>{t('game.fight.aura', { el: t('game.el.' + st.aura.el) })}</i> : null}{(Object.keys(st.ail) as Ail[]).map(a => <i key={a} className="is-ail">{t('game.fight.ail.' + a)} {st.ail[a]}</i>)}</span> : null}</div>
      {st.allies.map(a => <div key={a.name} className={a.hp <= 0 ? 'is-pal is-out' : 'is-pal'}><small>{a.name}</small><b>{a.hp}<i>/{a.max}</i></b><Bar v={a.hp} max={a.max} /></div>)}
      {st.foes.map(f => <div key={f.id} className={f.hp <= 0 ? 'is-out' : ''}><small>{f.id + 1} · {f.name}{f.ranged ? ' ➶' : ''}</small><span className="gm-ails">{f.out ? <i className="g2-out">{t('game.fight.out.' + f.out)}</i> : <i className="g2-temper" title={t('game.temper.' + f.temper + '.tip')}>{t('game.temper.' + f.temper)}</i>}{f.aura && f.aura.el !== f.el && f.hp > 0 ? <i className="g2-aura" title={t('game.fight.auraTip')}>{t('game.fight.aura', { el: t('game.el.' + f.aura.el) })}</i> : null}{f.prefer && f.hp > 0 ? <i className="g2-temper">{t('game.fight.move.' + f.prefer)}</i> : null}</span>{f.el || f.boss || f.trait || Object.keys(f.ail).length ? <span className="gm-ails">{f.boss ? <i className="is-boss">{t('game.fight.boss')}</i> : null}{f.trait ? <i className="is-trait" title={t('game.fight.trait.' + f.trait + '.tip')}>{t('game.fight.trait.' + f.trait)}</i> : null}{f.el ? <i className={'is-' + f.el}>{t('game.el.' + f.el)}</i> : null}{(Object.keys(f.ail) as Ail[]).map(a => <i key={a} className="is-ail">{t('game.fight.ail.' + a)} {f.ail[a]}</i>)}</span> : null}<b>{f.hp}<i>/{f.max}</i></b><Bar v={f.hp} max={f.max} /></div>)}
    </div>
    <div key={st.hurt} className={`gm-board${st.hurt ? ' is-hurt' : ''}`} style={{ gridTemplateColumns: `repeat(${W}, 1fr)` }}>{cells}</div>
    {wx.key ? <p className="g2 g2-air"><span className="fx-lbl kr">{t('game.fight.air')}</span>{t('game.fight.air.' + wx.key)}</p> : null}
    {st.say ? <p className="g2 g2-say fx-in" key={st.say.n}><span className="fx-lbl kr">{st.say.who}</span><q className="fx-serif">{st.say.text}</q></p> : null}
    <p className="gm-legend"><span><Terrain kind="rock" size={20} />{t('game.fight.rock')}</span><span><Terrain kind="high" size={20} />{t('game.fight.high')}</span><span><Terrain kind="bush" size={20} />{t('game.fight.bush')}</span>{st.herbs.length ? <span><Terrain kind="herb" size={20} />{t('game.fight.herb')}</span> : null}{st.kegs.length ? <span><Terrain kind="keg" size={20} />{t('game.fight.keg')}</span> : null}</p>
    {(() => { const seen = [...new Set(alive.map(f => f.trait).filter(Boolean))]; return seen.length ? <p className="gm-traits">{seen.map(k => <span key={k}><b>{t('game.fight.trait.' + k)}</b> {t('game.fight.trait.' + k + '.tip')}</span>)}</p> : null; })()}
    {st.mine.length ? <p className={`gm-mine${st.pop?.miss ? ' is-miss' : ''}`} key={st.round + ':' + st.mine.join('|')}><small>{t('game.fight.mine')}</small>{st.mine.map((l, i) => <span key={i}>{l}</span>)}</p> : null}
    <ol className="gm-log">{st.log.length ? st.log.map((l, i) => <li key={i}>{l}</li>) : <li className="dim">{t('game.fight.hint')}</li>}</ol>
    {st.end ? <div className="gm-done g2-done"><b className={`gm-verdict is-${st.end === 'win' ? 'win' : st.end === 'lose' ? 'lose' : 'draw'}`}>{t('game.fight.end.' + st.end)}</b>
      {/* 졌을 때: 게임이 끝나지 않는다 — 패배를 이야기로 이어 가거나, 마지막 체크포인트로 돌아간다 */}
      {st.end === 'lose' ? <><p className="hint">{t('game.fight.lostHint')}</p><div className="gm-foot">{canRewind ? <button type="button" className="btn" onClick={() => finish('rewind')}>{t('game.fight.toCheckpoint')}</button> : null}<button type="button" className="btn primary" onClick={() => finish()}>{t('game.fight.carryOn')}</button></div></>
        : st.end === 'win' && st.foes.some(f => f.out === 'yield') ? <><p className="hint">{t('game.fight.yieldHint', { names: st.foes.filter(f => f.out === 'yield').map(f => f.name).join(', ') })}</p><div className="gm-foot"><button type="button" className="btn ghost" onClick={() => finish('cruel')}>{t('game.fight.cutDown')}</button><button type="button" className="btn primary" onClick={() => finish()}>{t('game.fight.spare')}</button></div></>
          : <button type="button" className="btn primary" onClick={() => finish()}>{t('game.mini.finish')}</button>}</div>
      : <div className="gm-acts">
        {target ? <button type="button" className="btn primary gm-strike" onClick={() => attack(target)}>{t('game.fight.attack', { name: living.length > 1 ? `${target.id + 1} · ${target.name}` : target.name })}</button>
          : approach ? <button type="button" className="btn primary gm-strike" onClick={() => moveTo(approach.x, approach.y)}>{t('game.fight.approach')}</button>
            : <button type="button" className="btn gm-strike" disabled>{t('game.fight.noTarget')}</button>}
        <button type="button" className="btn" onClick={guard}>{t('game.fight.guard')}</button>
        <button type="button" className="btn" disabled={!potion} onClick={drink}>{potion ? `${potion.name} ×${left(potion.name)}` : t('game.fight.noPotion')}</button>
        <button type="button" className="btn" disabled={st.special} title={t('game.fight.sp.' + top + '.tip')} onClick={special}>{t('game.fight.sp.' + top)}<small>{t(st.special ? 'game.fight.spUsed' : 'game.fight.spOnce')}</small></button>
        <button type="button" className="btn ghost" title={t('game.fight.fleeTip')} onClick={flee}>{t('game.fight.flee')}</button>
      </div>}
  </div>;
}
