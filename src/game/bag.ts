// 가방: 칸이 정해진 가방에 물건을 크기에 맞춰 넣는다. 무기 · 방어구는 몸에 걸칠 수 있고(걸친 것은 가방 칸을 차지하지 않는다),
// 걸친 것에 따라 전투의 수치가 달라진다. 무엇이 어디 있는지는 방에 적어 두고, 실제 소지품(시트)에서 매번 다시 맞춘다.
import { isPotion } from './state';

export type ItemKind = 'sword' | 'dagger' | 'axe' | 'bow' | 'gun' | 'staff' | 'shield' | 'armor' | 'helm' | 'charm' | 'potion' | 'key' | 'paper' | 'food' | 'light' | 'tool' | 'gem' | 'misc';
export type Slot = 'weapon' | 'off' | 'body' | 'head' | 'charm';
export const SLOTS: Slot[] = ['weapon', 'off', 'body', 'head', 'charm'];
/** 가로 × 세로 (돌려 넣을 수 있다) */
export const SHAPE: Record<ItemKind, [number, number]> = { sword: [1, 3], dagger: [1, 2], axe: [2, 3], bow: [2, 3], gun: [2, 2], staff: [1, 4], shield: [2, 2], armor: [2, 3], helm: [2, 2], charm: [1, 1], potion: [1, 1], key: [1, 1], paper: [1, 2], food: [1, 1], light: [1, 2], tool: [2, 1], gem: [1, 1], misc: [1, 1] };
export const SLOT_OF: Partial<Record<ItemKind, Slot>> = { sword: 'weapon', dagger: 'weapon', axe: 'weapon', bow: 'weapon', gun: 'weapon', staff: 'weapon', shield: 'off', armor: 'body', helm: 'head', charm: 'charm' };
const KIND: [ItemKind, RegExp][] = [
  ['shield', /shield|buckler|방패|盾/i],
  ['dagger', /dagger|knife|dirk|shiv|단검|단도|나이프|비수|匕首|小刀/i],
  ['axe', /axe|hammer|mace|club|maul|도끼|망치|철퇴|곤봉|메이스|斧|锤/i],
  ['bow', /crossbow|\bbow|longbow|활|석궁|弓|弩/i],
  ['gun', /\bgun|pistol|rifle|revolver|musket|권총|소총|라이플|리볼버|머스킷|총|枪/i],
  ['staff', /staff|spear|wand|lance|halberd|pike|\brod\b|지팡이|스태프|완드|창$|창\s|미늘창|杖|矛|枪杆/i],
  ['sword', /sword|blade|saber|sabre|katana|rapier|scimitar|장검|대검|세검|검$|검\s|칼|도$|카타나|剑|刀/i],
  ['helm', /helm|\bhat\b|hood|\bcap\b|crown|circlet|투구|모자|두건|왕관|머리띠|盔|帽|冠/i],
  ['armor', /armou?r|chainmail|\bmail\b|plate|cuirass|robe|cloak|coat|vest|jacket|tunic|갑옷|흉갑|사슬|로브|망토|외투|조끼|재킷|甲|袍|斗篷/i],
  ['charm', /\bring\b|amulet|necklace|talisman|charm|pendant|brooch|반지|목걸이|부적|펜던트|브로치|护符|戒指|项链/i],
  ['potion', /antidote|tonic|salve|bandage|해독제|연고|붕대|해독|药膏|绷带/i],
  ['key', /\bkey|열쇠|钥匙/i],
  ['paper', /scroll|book|\bmap\b|letter|\bnote|tome|journal|deed|두루마리|책|지도|편지|쪽지|문서|일기|卷轴|书|地图|信/i],
  ['light', /torch|lantern|lamp|candle|횃불|랜턴|등불|초$|양초|火把|灯/i],
  ['food', /bread|meat|ration|food|apple|cheese|water|wine|\bale\b|jerky|빵|고기|식량|음식|사과|치즈|물$|포도주|육포|食|面包|肉|水/i],
  ['tool', /rope|pick|shovel|tool|\bkit\b|crowbar|hook|밧줄|로프|곡괭이|삽|도구|쇠지레|갈고리|绳|工具/i],
  ['gem', /\bgem|jewel|crystal|pearl|ruby|emerald|diamond|sapphire|보석|수정|진주|루비|에메랄드|다이아|사파이어|宝石|水晶|珍珠/i],
];
export const itemKind = (name: string): ItemKind => isPotion(name) ? 'potion' : KIND.find(([, re]) => re.test(name))?.[0] || 'misc';

export interface BagCfg { /** 물건(소문자 이름) → 놓인 자리. r 은 돌려 놓았는지 */ pos?: Record<string, { x: number; y: number; r?: boolean }>; /** 걸친 것 */ eq?: Partial<Record<Slot, string>> }
export interface Placed { name: string; n: number; kind: ItemKind; x: number; y: number; w: number; h: number; r: boolean }
export interface Packed { w: number; h: number; placed: Placed[]; worn: Partial<Record<Slot, { name: string; kind: ItemKind }>>; over: { name: string; n: number; kind: ItemKind }[]; used: number }
const id = (s: string) => s.trim().toLowerCase();
/** 가방 크기: 6 × 4 칸에서 시작해 3레벨마다 한 줄씩 늘어난다 (6줄까지) */
export const bagSize = (level: number) => ({ w: 6, h: 4 + Math.min(2, Math.floor((level || 1) / 3)) });
export const fits = (placed: Placed[], W: number, H: number, x: number, y: number, w: number, h: number, skip = '') =>
  x >= 0 && y >= 0 && x + w <= W && y + h <= H && !placed.some(p => id(p.name) !== id(skip) && x < p.x + p.w && p.x < x + w && y < p.y + p.h && p.y < y + h);
/** 지금 가진 물건을 가방에 놓는다: 적어 둔 자리가 맞으면 그대로, 아니면 빈 곳에. 들어갈 데가 없는 것은 over 로 */
export function packBag(bag: BagCfg | undefined, items: { name: string; n: number }[], level: number): Packed {
  const { w: W, h: H } = bagSize(level), placed: Placed[] = [], over: Packed['over'] = [], worn: Packed['worn'] = {};
  const wornIds = new Set<string>();
  for (const s of SLOTS) { const want = bag?.eq?.[s], it = want ? items.find(i => id(i.name) === id(want)) : null; if (it && SLOT_OF[itemKind(it.name)] === s) { worn[s] = { name: it.name, kind: itemKind(it.name) }; wornIds.add(id(it.name)); } }
  const rest = items.filter(i => !wornIds.has(id(i.name))), later: typeof rest = [];
  for (const it of rest) {
    const kind = itemKind(it.name), at = bag?.pos?.[id(it.name)], [sw, sh] = SHAPE[kind];
    if (at) { const w = at.r ? sh : sw, h = at.r ? sw : sh; if (fits(placed, W, H, at.x, at.y, w, h)) { placed.push({ name: it.name, n: it.n, kind, x: at.x, y: at.y, w, h, r: !!at.r }); continue; } }
    later.push(it);
  }
  for (const it of later) {
    const kind = itemKind(it.name), [sw, sh] = SHAPE[kind]; let done = false;
    for (const r of sw === sh ? [false] : [false, true]) { const w = r ? sh : sw, h = r ? sw : sh;
      for (let y = 0; y < H && !done; y++) for (let x = 0; x < W && !done; x++) if (fits(placed, W, H, x, y, w, h)) { placed.push({ name: it.name, n: it.n, kind, x, y, w, h, r }); done = true; }
      if (done) break; }
    if (!done) over.push({ name: it.name, n: it.n, kind });
  }
  return { w: W, h: H, placed, worn, over, used: placed.reduce((n, p) => n + p.w * p.h, 0) };
}
/** 지금 놓인 그대로를 적어 둔다 (그래야 하나를 옮겨도 나머지가 제자리에 있다) */
export const posOf = (p: Packed): NonNullable<BagCfg['pos']> => Object.fromEntries(p.placed.map(i => [id(i.name), { x: i.x, y: i.y, r: i.r }]));

export interface Gear { /** 내 공격의 피해 + */ dmg: number; /** 내 명중 + */ aim: number; /** 내가 받는 피해 - */ soak: number; /** 적이 나를 맞히기 어려워지는 정도 */ def: number; weapon: string }
const BIG: ItemKind[] = ['axe', 'bow', 'gun'];
/** 걸친 것이 주는 수치 */
export function gearOf(p: Packed): Gear {
  const wpn = p.worn.weapon;
  return { dmg: wpn ? (BIG.includes(wpn.kind) ? 2 : 1) : 0, aim: (p.worn.charm ? 1 : 0) + (wpn?.kind === 'staff' ? 1 : 0), soak: p.worn.body ? 1 : 0, def: (p.worn.off ? 1 : 0) + (p.worn.head ? 1 : 0), weapon: wpn?.name || '' };
}
/** 진행자에게 알리는 글 */
export function bagPrompt(p: Packed): string {
  const worn = SLOTS.filter(s => p.worn[s]).map(s => `${p.worn[s]!.name} (${s === 'off' ? 'off hand' : s})`);
  return `${worn.length ? ` · Equipped: ${worn.join(', ')}` : ''} · Bag ${p.used}/${p.w * p.h} cells${p.over.length ? ` — no room for: ${p.over.map(o => o.name).join(', ')} (carried awkwardly in hand until {{user}} drops or rearranges something; bulky gear takes more room)` : ''}`;
}
