// 전투의 속사정: 원소의 기운과 반응 · 날씨가 싸움에 미치는 것 · 적과 동료의 기질과 지능. 순수한 계산만 둔다.
import { iconOf, traitOf } from './bestiary';
import type { Element } from './state';

// ── 원소 반응 ──
// 원소가 깃든 타격은 맞은 쪽에 그 "기운"을 두 차례 남긴다. 기운이 남은 채로 다른 원소가 닿으면 반응이 일고 기운은 흩어진다.
export type ReactId = 'thaw' | 'shatter' | 'flare' | 'rime' | 'miasma' | 'venomfrost' | 'corrode';
export interface Reaction { id: ReactId; /** 피해 배수 */ mul: number; /** 덤 피해 */ add: number; /** 곁의 다른 이들에게 튀는 피해 */ splash: number; /** 몇 차례 멈추는지 */ stun: number; /** 단단함(갑옷 · 형체 없음)을 뚫는다 */ pierce: boolean; /** 공격력이 깎인다 */ sap: number; /** 걸리는 상태 */ ail?: 'burn' | 'chill' | 'poison'; ailN?: number }
const R = (id: ReactId, o: Partial<Reaction>): Reaction => ({ id, mul: 1, add: 0, splash: 0, stun: 0, pierce: false, sap: 0, ...o });
/** 남은 기운 → 닿은 원소 → 반응. 불과 얼음만 차례에 따라 이름이 다르다(녹아내림 · 산산조각) */
export const REACTIONS: Record<Element, Partial<Record<Element, Reaction>>> = {
  fire: { ice: R('thaw', { mul: 1.5 }), bolt: R('flare', { add: 1, splash: 3 }), poison: R('miasma', { add: 3, ail: 'burn', ailN: 2 }) },
  ice: { fire: R('shatter', { mul: 1.5, pierce: true }), bolt: R('rime', { add: 1, stun: 1 }), poison: R('venomfrost', { ail: 'poison', ailN: 6, add: 1 }) },
  bolt: { fire: R('flare', { add: 1, splash: 3 }), ice: R('rime', { add: 1, stun: 1 }), poison: R('corrode', { add: 1, sap: 1, pierce: true }) },
  poison: { fire: R('miasma', { add: 3, ail: 'burn', ailN: 2 }), ice: R('venomfrost', { ail: 'poison', ailN: 6, add: 1 }), bolt: R('corrode', { add: 1, sap: 1, pierce: true }) },
};
export interface Aura { el: Element; n: number }
export const reactOf = (aura: Aura | null | undefined, hit: Element | ''): Reaction | null => aura && hit && aura.el !== hit ? REACTIONS[aura.el][hit] || null : null;
/** 반응이 얹힌 피해 */
export const reactDmg = (dmg: number, r: Reaction | null) => r ? Math.max(1, Math.round(dmg * r.mul) + r.add) : dmg;
/** 차례가 지나면 기운이 옅어진다 */
export const fade = (a: Aura | null | undefined): Aura | null => a && a.n > 1 ? { el: a.el, n: a.n - 1 } : null;

// ── 날씨 ── 실내에서는 아무 영향이 없다
export interface Air { /** 원소별 피해 보정 */ el: Partial<Record<Element, number>>; /** 멀리서 쏠 때의 명중 보정 */ shot: number; /** 번개가 멈추게 할 확률이 오른다 */ storm: boolean; key: '' | 'rain' | 'storm' | 'fog' | 'snow' | 'wind' }
export function airOfFight(weather: string, indoor: boolean): Air {
  const w = indoor ? '' : weather.toLowerCase();
  if (/storm|thunder|폭풍|뇌우|천둥|雷|暴风/.test(w)) return { el: { fire: -2, bolt: 2 }, shot: -1, storm: true, key: 'storm' };
  if (/rain|shower|drizzle|비\b|비가|폭우|소나기|雨/.test(w)) return { el: { fire: -2, bolt: 1 }, shot: 0, storm: false, key: 'rain' };
  if (/fog|mist|haze|안개|雾/.test(w)) return { el: {}, shot: -2, storm: false, key: 'fog' };
  if (/snow|blizzard|sleet|눈\b|눈이|눈보라|雪/.test(w)) return { el: { ice: 1, fire: -1 }, shot: -1, storm: false, key: 'snow' };
  if (/wind|gale|바람|강풍|风/.test(w)) return { el: { poison: -1 }, shot: -1, storm: false, key: 'wind' };
  return { el: {}, shot: 0, storm: false, key: '' };
}

// ── 기질과 지능 ──
export type Temper = 'reckless' | 'cautious' | 'cowardly' | 'guardian' | 'cunning' | 'proud';
export type Mind = 'mindless' | 'instinct' | 'cunning' | 'tactical';
const MINDLESS = ['zombie', 'skull', 'mummy', 'slime', 'cube', 'golem', 'robot', 'mushroom', 'tree', 'plant', 'pumpkin', 'eye'];
const SPEAKS = ['blade', 'bandit', 'assassin', 'knight', 'archer', 'crown', 'spark', 'goblin', 'orc', 'ogre', 'satyr', 'fairy', 'vampire', 'lich', 'demon', 'minotaur', 'flayer'];
const SMART = ['knight', 'crown', 'lich', 'vampire', 'flayer', 'beholder', 'dragon', 'spark'];
/** 말이 통하는 적인가 (항복하거나 흥정할 수 있다) */
export const speaks = (kind: string) => SPEAKS.includes(iconOf(kind));
export function mindOf(kind: string, boss = false): Mind {
  const ic = iconOf(kind);
  return MINDLESS.includes(ic) ? 'mindless' : boss || SMART.includes(ic) ? 'tactical' : SPEAKS.includes(ic) ? 'cunning' : 'instinct';
}
const hash = (s: string) => { let h = 2166136261; for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619) >>> 0; return h; };
const BY_WORD: [Temper, RegExp][] = [
  ['reckless', /frenz|rabid|berserk|mad\b|feral|enraged|wild\b|bloodthirst|광포|광전사|미친|굶주린|성난|흉포|狂|暴怒/i],
  ['cowardly', /coward|skulk|scaveng|runt|scout|lookout|겁쟁이|겁 많은|졸개|정찰|망보|胆小|喽啰/i],
  ['guardian', /guard|sentinel|warden|keeper|protector|bodyguard|수호|경비|파수|호위|문지기|守卫|护卫/i],
  ['proud', /lord|king|queen|champion|captain|chief|master|elder|ancient|왕|군주|대장|두목|우두머리|챔피언|고대|长老|首领|队长/i],
  ['cunning', /assassin|trickster|stalker|shadow|sly|암살|그림자|교활|추적자|刺客|狡猾/i],
  ['cautious', /veteran|old\b|wary|sniper|sage|노련|늙은|신중|저격|현자|老练|谨慎/i],
];
const BY_ICON: Record<string, Temper> = { goblin: 'cowardly', rat: 'cowardly', fairy: 'cowardly', wing: 'cowardly', orc: 'reckless', ogre: 'reckless', boar: 'reckless', bear: 'reckless', minotaur: 'reckless', zombie: 'reckless', slime: 'reckless', croc: 'reckless', archer: 'cautious', spark: 'cautious', eye: 'cautious', plant: 'cautious', owl: 'cautious', knight: 'guardian', golem: 'guardian', robot: 'guardian', turtle: 'guardian', assassin: 'cunning', bandit: 'cunning', serpent: 'cunning', spider: 'cunning', beast: 'cunning', cat: 'cunning', crown: 'proud', dragon: 'proud', demon: 'proud', vampire: 'proud', lich: 'proud', beholder: 'proud' };
const SPREAD: Temper[] = ['reckless', 'cautious', 'cunning', 'reckless', 'cautious', 'cowardly'];
/** 이름 · 종류에서 기질을 정한다. 이름에 드러난 말이 먼저다 */
export function temperOf(name: string, kind: string, boss = false): Temper {
  for (const [t, re] of BY_WORD) if (re.test(name)) return t;
  if (boss) return 'proud';
  return BY_ICON[iconOf(kind)] || SPREAD[hash(name.replace(/\s*\d+$/, '')) % SPREAD.length];
}
/** 피투성이(체력 절반 이하)가 되면 기질이 바뀐다: 거만한 자는 조심스러워지고, 신중한 자와 꾀 많은 자는 겁을 먹는다. 생각이 없는 것은 그대로다 */
export function bloodied(t: Temper, mind: Mind, boss: boolean, alone: boolean): Temper {
  if (mind === 'mindless') return t;
  if (t === 'proud') return 'cautious';
  if (boss) return t;
  if (t === 'cautious') return 'cowardly';
  if (t === 'cunning') return alone ? 'cowardly' : 'cunning';
  return t;
}
/** 달아날 마음이 드는가: 겁먹었고, 체력이 4할 아래이고, 뿌리박힌 것 · 우두머리가 아닐 때 */
export const wantsOut = (t: Temper, mind: Mind, hp: number, max: number, boss: boolean, kind: string) => t === 'cowardly' && mind !== 'mindless' && !boss && hp <= max * .4 && traitOf(kind) !== 'root';
/** 항복하는가: 말이 통하고, 크게 다쳤고, 혼자 남았거나 우두머리가 쓰러졌을 때. 거만한 우두머리는 꺾이지 않는다 */
export const yields = (kind: string, mind: Mind, hp: number, max: number, boss: boolean, alone: boolean, leaderDown: boolean) => speaks(kind) && mind !== 'mindless' && !boss && hp <= max * .35 && (alone || leaderDown);

/** 동료의 기질: 나를 깊이 믿는 동료는 곁을 지키고, 그 밖에는 이름에서 정해진다 */
export type AllyTemper = 'guardian' | 'bold' | 'careful' | 'sharp';
export const allyTemper = (name: string, rep: number): AllyTemper => rep >= 60 ? 'guardian' : (['bold', 'careful', 'sharp', 'bold'] as AllyTemper[])[hash(name) % 4];
