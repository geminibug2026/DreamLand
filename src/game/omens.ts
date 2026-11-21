// 차례마다 앱이 미리 굴려 두는 것들: 우연한 만남 · 눈썰미(눈에 띄는 것) · 가방에 없는 물건 알아채기.
// 모두 순수한 계산이다. 굴림은 "게임의 씨앗 + 내 메시지의 id" 에서 나오므로, 같은 차례를 다시 받아도 같은 일이 벌어진다(다시 받기로 운을 고를 수 없다).
import { itemKind } from './bag';

/** 씨앗 있는 난수 (mulberry32) */
export function rng(seed: number, key: string): () => number {
  let h = seed >>> 0; for (let i = 0; i < key.length; i++) { h = Math.imul(h ^ key.charCodeAt(i), 2654435761) >>> 0; h ^= h >>> 13; }
  return () => { h = (h + 0x6D2B79F5) >>> 0; let t = h; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const pick = <T,>(r: () => number, list: T[]): T => list[Math.floor(r() * list.length) % list.length];

// ── 장소의 위험도: 0 안전 · 1 마을 · 2 길 · 3 야생 · 4 폐허 · 5 던전 · 6 적지 ──
export const DANGER_EN = ['safe', 'settled', 'road', 'wilderness', 'ruins', 'dungeon', 'hostile ground'];
const DANGER_WORDS: [number, RegExp][] = [
  [6, /lair|nest|stronghold|enemy camp|war ?camp|battlefield|front ?line|hideout|den\b|소굴|둥지|적진|전장|본거지|은신처|巢穴|战场|敌营/i],
  [5, /cave|cavern|dungeon|mine|crypt|tomb|catacomb|sewer|labyrinth|maze|abyss|pit\b|동굴|던전|지하|광산|무덤|묘|하수|미궁|미로|심연|洞|地牢|地下|墓|迷宫/i],
  [4, /ruin|abandon|haunted|forsaken|cursed|wreck|폐허|유적|버려진|저주|흉가|난파|废墟|遗迹|荒废/i],
  [0, /\bhome\b|\bhouse\b|\binn\b|tavern|\bshop\b|store|guild|chapel|church|sanctuary|bedroom|library|집\b|여관|주점|상점|가게|길드|성당|교회|성소|침실|도서관|家|旅店|酒馆|商店|公会|教堂/i],
  [1, /city|town|village|street|market|plaza|square|harbor|harbour|port|castle|palace|school|station|도시|마을|거리|시장|광장|항구|성\b|궁|학교|역\b|城|镇|村|街|市场|港/i],
  [3, /forest|wood|jungle|swamp|marsh|mountain|peak|cliff|desert|sea\b|ocean|glacier|wild|숲|밀림|늪|산\b|산맥|절벽|사막|바다|설원|황야|森林|沼泽|山|沙漠|海|荒野/i],
  [2, /road|path|trail|bridge|pass\b|camp|field|meadow|farm|river|lake|길\b|다리|야영|들판|초원|농장|강|호수|路|桥|营地|田野|河|湖/i],
];
const SCENE_DANGER: Record<string, number> = { hall: 5, ruins: 4, forest: 3, mountain: 3, peak: 3, sea: 3, winter: 3, desert: 3, night: 3, road: 2, meadow: 2, bridge: 2, lake: 2, harbor: 1, city: 1, street: 1, castle: 1, garden: 1, station: 1, arena: 2, tavern: 0, room: 0 };
export const dangerOf = (place: string, scene = ''): number => { for (const [n, re] of DANGER_WORDS) if (re.test(place)) return n; return SCENE_DANGER[scene] ?? 2; };

// ── 내 말에서 무엇을 하려는지 읽는다 ──
export type Act = 'travel' | 'explore' | 'camp' | 'rest' | 'other';
export function actOf(text: string): Act {
  const s = text.toLowerCase();
  if (/\b(sleep|make camp|set up camp|camp for|rest for the night|turn in|bed down)\b|야영|잠을 |잠든|잔다|자러|숙박|하룻밤|눈을 붙|睡觉|过夜|露营|扎营/.test(s)) return 'camp';
  if (/\b(travel|head (to|for|toward|back|out|north|south|east|west)|set (out|off)|journey|walk to|ride|sail|go to|leave for|make (my|our) way|march|hike|follow the (road|path|trail|river))\b|로 간다|으로 간다|로 향|으로 향|떠난다|떠나자|출발|이동한|이동하|걸어간|길을 따라|前往|出发|赶路|启程|走向/.test(s)) return 'travel';
  if (/\b(search|explore|look around|investigat|scout|examine|inspect|poke around|rummage|sneak (in|into|through)|pick through)\b|살핀|살펴|탐색|조사|둘러본|둘러보|뒤진|뒤져|수색|찾아본|搜索|探索|调查|查看|搜查/.test(s)) return 'explore';
  if (/\b(rest|catch (my|our) breath|take a break|sit down|tend (my|our) wounds)\b|쉰다|쉬자|쉬어|휴식|숨을 돌|休息|歇/.test(s)) return 'rest';
  return 'other';
}

// ── 우연한 만남 ──
export type EncKind = 'combat' | 'social' | 'trap' | 'puzzle' | 'merchant' | 'event';
export interface Enc { kind: EncKind; act: Act; roll: number; under: number; danger: number; hint: string; /** 전투라면 알맞은 적의 수와 세기 */ foes?: { n: number; hp: number; atk: number } }
const BASE: Record<Act, number> = { travel: 30, explore: 22, camp: 18, rest: 8, other: 4 };
const DANGER_ADD = [-20, -12, -4, 0, 8, 14, 22], DIFF_MUL: Record<string, number> = { easy: .6, normal: 1, hard: 1.35 };
/** 위험도 묶음(안전한 곳 · 바깥 · 깊은 곳)과 쉬는 중일 때의 종류별 무게 */
const MIX: Record<'town' | 'wild' | 'deep' | 'rest', Record<EncKind, number>> = {
  town: { combat: 8, social: 35, trap: 8, puzzle: 4, merchant: 25, event: 20 },
  wild: { combat: 34, social: 16, trap: 14, puzzle: 8, merchant: 9, event: 19 },
  deep: { combat: 36, social: 6, trap: 24, puzzle: 19, merchant: 2, event: 13 },
  rest: { combat: 34, social: 24, trap: 4, puzzle: 2, merchant: 6, event: 30 },
};
const SEEDS: Record<EncKind, { town: string[]; wild: string[]; deep: string[] }> = {
  combat: {
    town: ['Someone who has been following {{user}} for three streets finally closes in, and they did not come alone.', 'A brawl spills out of a doorway and one side decides {{user}} is with the other.', 'Hired muscle steps out to collect a debt — from the wrong person, or the right one.'],
    wild: ['Something that hunts here has been pacing them for a while and now breaks cover.', 'An ambush: the road ahead is blocked by something placed there on purpose.', 'They have wandered into a territory that is fiercely defended.', 'A wounded, cornered creature lashes out at whoever is nearest.'],
    deep: ['The noise they made a while ago has drawn the things that live down here.', 'A patrol comes round the corner at the worst moment.', 'What looked like part of the room stirs and stands up.', 'The owners of this place return and find intruders.'],
  },
  social: {
    town: ['A stranger mistakes {{user}} for someone else and says something they should not have heard.', 'A child tugs at a sleeve: someone paid them a coin to deliver a message.', 'An old acquaintance of someone {{user}} knows recognises a face — or a piece of gear.', 'A person in obvious trouble asks for help while glancing over their shoulder.'],
    wild: ['A lone traveller shares the road for a while and knows more about this region than they first let on.', 'Refugees coming the other way warn of what lies ahead — and their stories do not quite match.', 'A hunter or herder watches from a distance, deciding whether to approach.', 'Someone is camped where nobody should be camping.'],
    deep: ['Someone else is down here: lost, hiding, or pretending to be one of those.', 'A prisoner or survivor calls out softly from the dark.', 'A rival party is after the same thing and proposes a truce they may not mean.'],
  },
  trap: {
    town: ['A friendly offer is a setup: a rigged game, a cut purse, a door that locks from outside.', 'The shortcut someone recommended is watched.'],
    wild: ['The ground, the bridge or the ford ahead is not as sound as it looks.', 'A snare meant for game — or for people — lies across the path.', 'The weather or terrain turns the next stretch into a hazard that demands a quick decision.'],
    deep: ['A mechanism older than anyone alive is still armed: let {{user}} notice one small wrong detail first.', 'The floor, the air or the water here is the danger.', 'Something valuable sits in plain view and that is exactly the problem.', 'The way back closes behind them.'],
  },
  puzzle: {
    town: ['A coded notice, a ledger that does not add up, or a lock with an unusual key — a small riddle with a local answer.'],
    wild: ['Standing stones, carved markers or an old shrine ask for something before the way opens.', 'Two paths, and the signs that mark them have been swapped by someone.'],
    deep: ['A sealed door with a mechanism that can be reasoned out from what is in the room.', 'Inscriptions that describe the right order of doing something — and what happens when the order is wrong.', 'The room is a lock: light, weight, sound or water is the key.'],
  },
  merchant: {
    town: ['A peddler with one item far too good for their stall, and a reason for selling it cheap.', 'A shop is closing in a hurry and wants its stock gone before nightfall.'],
    wild: ['A travelling trader has made camp and trades in news as readily as goods.', 'A caravan with a broken wheel will pay, or barter, for help.'],
    deep: ['Against all sense, someone does business down here — and their prices are not in coin.'],
  },
  event: {
    town: ['A bell, a procession, a fire or an arrest pulls the whole street one way.', 'News arrives that changes the price of something {{user}} cares about.', 'A notice goes up on the board that concerns an open thread of the story.'],
    wild: ['The weather turns sharply and forces a choice about shelter.', 'Smoke, lights or a sound on the horizon, in the direction they were heading.', 'They come across the aftermath of something recent: tracks, wreckage, a thing left behind.', 'Animals are fleeing in one direction.'],
    deep: ['A tremor, a draft or a distant sound shows the place is bigger — or less empty — than thought.', 'Their light source gutters, or something answers it with a light of its own.', 'They find what the last people who came here left behind.'],
  },
};
const NIGHT_SEEDS = ['A fire-lit visitor asks to share the camp and will not say where they came from.', 'Something circles the camp just beyond the light and tests whoever is on watch.', 'A dream, a distant sound or a light in the dark wakes them — and it is real.', 'Whoever was on watch has dozed off, and something is missing in the morning.'];
export interface EncIn { seed: number; key: string; text: string; place: string; scene: string; diff: string; party: number; level: number; /** 최근 두 차례에 만남이 있었다 */ recent: boolean; hp: number; hpMax: number }
/** 이번 차례에 만남이 있는지 굴린다 */
export function rollEncounter(q: EncIn): Enc | null {
  if (q.recent || /^\s*\[(ooc|to companions)\]/i.test(q.text) || q.hp <= 0) return null;
  const act = actOf(q.text), danger = dangerOf(q.place, q.scene), r = rng(q.seed, 'enc:' + q.key);
  const under = Math.round(Math.min(75, Math.max(0, BASE[act] * (DIFF_MUL[q.diff] ?? 1) + (act === 'other' ? Math.max(0, DANGER_ADD[danger]) / 2 : DANGER_ADD[danger])))), roll = 1 + Math.floor(r() * 100);
  if (roll > under) return null;
  const zone = danger <= 1 ? 'town' : danger <= 3 ? 'wild' : 'deep', mix = { ...MIX[act === 'camp' || act === 'rest' ? 'rest' : zone] };
  // 다친 일행에게는 싸움을 덜 붙인다
  if (q.hp <= q.hpMax / 3) mix.combat = Math.round(mix.combat / 2);
  let n = r() * Object.values(mix).reduce((a, b) => a + b, 0), kind: EncKind = 'event';
  for (const k of Object.keys(mix) as EncKind[]) { n -= mix[k]; if (n <= 0) { kind = k; break; } }
  const hint = (act === 'camp' || act === 'rest') && kind !== 'merchant' && kind !== 'puzzle' && kind !== 'trap' ? pick(r, NIGHT_SEEDS) : pick(r, SEEDS[kind][zone]);
  const enc: Enc = { kind, act, roll, under, danger, hint };
  if (kind === 'combat') enc.foes = { n: Math.min(5, Math.max(1, q.party + (q.diff === 'hard' ? 1 : 0) - (q.diff === 'easy' ? 1 : 0) + (r() < .3 ? 1 : r() > .8 ? -1 : 0))), hp: 6 + q.level * 2, atk: Math.min(8, 2 + Math.floor(q.level / 3)) };
  return enc;
}
const ENC_DO: Record<EncKind, string> = {
  combat: 'Build it up in the narration and let {{user}} see it coming for a breath; if it comes to blows, end with a [fight …].',
  social: 'Give this person a name, a want and one thing they are not saying.',
  trap: 'Show one small warning sign first, then call for a check to notice or avoid it; a failure costs something concrete.',
  puzzle: 'Describe it concretely enough that {{user}} can actually reason it out; reward a good idea without a roll.',
  merchant: 'Name two or three specific things on offer with prices in gold, and one thing the seller wants.',
  event: 'Let it change the situation or open a choice — it should matter later.',
};
export const encPrompt = (e: Enc) => `[Chance encounter — the app rolled ${e.roll} (needed ${e.under} or less; ${DANGER_EN[e.danger]}) while {{user}} ${e.act === 'travel' ? 'travels' : e.act === 'explore' ? 'explores' : e.act === 'camp' ? 'makes camp' : e.act === 'rest' ? 'rests' : 'acts'}. Weave this in as part of answering {{user}}'s action, fitted to the place and the story so far (change the details freely, keep the kind): ${e.kind.toUpperCase()} — ${e.hint} ${ENC_DO[e.kind]}${e.foes ? ` Sized for this party: about ${e.foes.n} enem${e.foes.n === 1 ? 'y' : 'ies'} of roughly hp ${e.foes.hp} atk ${e.foes.atk} each.` : ''} Do not mention the roll.]`;

// ── 눈썰미: 굴리지 않고도 눈에 띄는 것 ──
export type SightKind = 'tracks' | 'sound' | 'smell' | 'light' | 'build' | 'people' | 'sky' | 'trace' | 'threat' | 'hidden';
interface Sight { k: SightKind; dc: number; in: string; text: string }
const Z = (k: SightKind, dc: number, where: string, text: string): Sight => ({ k, dc, in: where, text });
/** in: 어울리는 곳 (빈칸으로 나눈 꼬리표 가운데 하나라도 맞으면 된다). any 는 어디서나 */
export const SIGHTS: Sight[] = [
  Z('tracks', 10, 'wild road', 'fresh tracks cross the way — more feet than {{user}} would expect, and one set dragging'),
  Z('tracks', 12, 'wild road snow', 'prints that lead in one direction only, with none coming back'),
  Z('tracks', 13, 'deep ruins', 'the dust on the floor is disturbed in a clear line; someone walks this route often'),
  Z('tracks', 14, 'town', 'the same muddy boot print outside two doors that should have nothing to do with each other'),
  Z('tracks', 15, 'wild', 'claw marks high on a trunk or rock — higher than anything that should live here could reach'),
  Z('tracks', 11, 'wet road wild', 'wheel ruts filled with rainwater: a heavy cart passed not long before the rain'),
  Z('sound', 10, 'deep ruins', 'a slow drip that stops for a moment whenever someone speaks'),
  Z('sound', 11, 'wild night', 'the insects and birds have gone quiet on one side only'),
  Z('sound', 12, 'town indoor', 'a conversation next door breaks off a little too neatly when footsteps approach'),
  Z('sound', 13, 'deep', 'a faint regular scraping from below, like something being sharpened or dug'),
  Z('sound', 12, 'indoor', 'a floorboard overhead takes weight, then is carefully relieved of it'),
  Z('sound', 14, 'fog night', 'footsteps that keep pace with the party and stop half a beat after they do'),
  Z('sound', 10, 'town', 'a bell or signal sounding at the wrong hour'),
  Z('sound', 13, 'wet', 'under the rain, a rhythm that is not rain: someone moving when the gusts cover it'),
  Z('smell', 10, 'wild road', 'woodsmoke on the wind where there should be no camp'),
  Z('smell', 11, 'deep ruins', 'a sweetish rot that is stronger near one wall than the others'),
  Z('smell', 12, 'indoor town', 'lamp oil, far more than a room this size needs'),
  Z('smell', 13, 'deep', 'the air turns sharp and metallic, as before a storm, though there is no sky here'),
  Z('smell', 12, 'town', 'an expensive perfume on someone dressed far too plainly for it'),
  Z('smell', 11, 'wild', 'a musky animal reek that is fresh, close and upwind'),
  Z('smell', 14, 'indoor', 'bitter almonds, faintly, near the cups'),
  Z('light', 10, 'night wild road', 'a single light far off that goes out when looked at directly for too long'),
  Z('light', 12, 'deep ruins', 'one torch bracket is clean of cobwebs; it has been used recently'),
  Z('light', 13, 'indoor', 'a line of light under a door that is supposed to lead to an empty room'),
  Z('light', 12, 'night town', 'a window signalling with a shutter: open, closed, open'),
  Z('light', 14, 'deep', 'a faint glow in the stone itself, brighter where hands have touched it'),
  Z('light', 11, 'fog', 'the fog thins in a straight corridor, as though something large passed through it'),
  Z('build', 11, 'deep ruins indoor', 'the mortar in one stretch of wall is newer than the rest'),
  Z('build', 13, 'deep ruins', 'the floor tiles change pattern three paces ahead'),
  Z('build', 12, 'indoor town', 'the room is a good arm\'s length shorter inside than the building is outside'),
  Z('build', 14, 'deep', 'scorch marks fan out from a small hole at knee height'),
  Z('build', 12, 'ruins', 'the statues all face one way — except one'),
  Z('build', 10, 'town indoor', 'a lock that has been picked before: fine scratches round the keyhole'),
  Z('build', 13, 'road wild', 'the bridge or ledge ahead has been cut partway through on the underside'),
  Z('build', 15, 'deep ruins', 'a draft from a wall with no door in it'),
  Z('people', 10, 'town', 'someone has been at the edge of every crowd {{user}} has walked through today'),
  Z('people', 11, 'town indoor', 'the person speaking keeps one hand out of sight'),
  Z('people', 12, 'town indoor', 'two strangers who claim not to know each other use the same turn of phrase'),
  Z('people', 12, 'any', 'the companion or NPC nearest {{user}} is hiding a small injury or a tremor'),
  Z('people', 13, 'town', 'the guards here are wearing the right colours and the wrong boots'),
  Z('people', 14, 'indoor', 'the host has laid one place more than the number of guests'),
  Z('people', 11, 'road wild', 'the travellers on this road are all going the other way'),
  Z('people', 13, 'any', 'whoever {{user}} last spoke to answered a question that had not been asked yet'),
  Z('sky', 9, 'wild road', 'the wind has swung round and the birds are flying low: the weather will break within hours'),
  Z('sky', 11, 'wet', 'the water is rising: what was a trickle on the way in is now ankle-deep'),
  Z('sky', 12, 'snow', 'the snow on the slope above has a clean crack running across it'),
  Z('sky', 11, 'fog', 'the fog carries sound strangely; a voice that seems near is far, and the reverse'),
  Z('sky', 10, 'night', 'the moon or stars give enough light to see by — and to be seen by'),
  Z('sky', 12, 'wild', 'a column of carrion birds turning over one spot ahead'),
  Z('sky', 13, 'wet night', 'lightning shows, for an instant, a shape on the ridge that was not there at the last flash'),
  Z('trace', 10, 'any', 'something small dropped in a hurry: a button, a coin, a torn scrap with writing on it'),
  Z('trace', 11, 'indoor town', 'a cup still warm in a room said to have been empty all day'),
  Z('trace', 12, 'deep ruins', 'old bloodstains that someone later tried to scrub away'),
  Z('trace', 12, 'wild road', 'a campfire buried rather than left to burn out — the mark of people who do not want to be followed'),
  Z('trace', 13, 'indoor', 'the dust on the shelf shows the outline of something recently taken'),
  Z('trace', 14, 'any', 'a mark scratched low on a wall or post: a sign left by one traveller for another'),
  Z('trace', 13, 'town', 'ink still wet on a notice that claims to be a week old'),
  Z('trace', 11, 'ruins deep', 'gear from an earlier expedition, laid down neatly as if its owner meant to come back'),
  Z('threat', 12, 'wild night', 'a pair of eyes catches the light at the edge of sight and does not blink'),
  Z('threat', 13, 'deep', 'thin threads across the passage at ankle and throat height'),
  Z('threat', 12, 'town', 'three people who are not together have drifted to cover all the exits'),
  Z('threat', 14, 'deep ruins', 'the bones here are arranged, not fallen'),
  Z('threat', 13, 'wild road', 'the obvious place to rest ahead is too obvious, and too tidy'),
  Z('threat', 15, 'indoor', 'the drink, the gift or the handshake being offered is being watched too closely by the one offering'),
  Z('threat', 14, 'any', 'something about the next few steps is wrong — a silence, a stillness — a moment before it becomes clear why'),
  Z('hidden', 14, 'indoor town', 'a seam in the panelling, worn smooth at hand height'),
  Z('hidden', 15, 'deep ruins', 'one flagstone rings hollow'),
  Z('hidden', 14, 'wild', 'a path that has been deliberately brushed over where it leaves the road'),
  Z('hidden', 15, 'any', 'something tucked where only a person of {{user}}\'s exact height or habits would look'),
  Z('hidden', 16, 'indoor', 'a book, a brick or a picture that sits a finger\'s width proud of its neighbours'),
  Z('hidden', 13, 'ruins wild', 'a cache marker: three stones that nature would not have stacked'),
];
export interface Seen { k: SightKind; dc: number; text: string }
export interface SeeIn { seed: number; key: string; place: string; scene: string; time: string; weather: string; indoor: boolean; passive: number; text: string }
/** 이번 차례에 눈에 띄는 것 (0~2). passive = 10 + 지혜(없으면 지능) 보정 + 사기 보정 */
export function rollSights(q: SeeIn): Seen[] {
  if (/^\s*\[ooc\]/i.test(q.text)) return [];
  const r = rng(q.seed, 'see:' + q.key), danger = dangerOf(q.place, q.scene), all = `${q.time} ${q.weather}`.toLowerCase();
  const tags = new Set<string>(['any', danger <= 1 ? 'town' : danger <= 3 ? (danger === 2 ? 'road' : 'wild') : danger === 4 ? 'ruins' : 'deep']);
  if (danger === 6) tags.add('wild'); if (q.indoor) tags.add('indoor');
  if (/night|midnight|dusk|밤|자정|새벽|夜/.test(all)) tags.add('night'); if (/rain|storm|shower|비|폭우|폭풍|雨/.test(all)) tags.add('wet'); if (/fog|mist|안개|雾/.test(all)) tags.add('fog'); if (/snow|blizzard|눈|雪/.test(all)) tags.add('snow');
  // 살피는 중이면 더 자주, 위험한 곳일수록 조금 더 자주 눈에 띈다
  const p = Math.min(.8, .18 + danger * .03 + (actOf(q.text) === 'explore' ? .25 : 0)), first = r(), count = first < p * .25 ? 2 : first < p ? 1 : 0;
  if (!count) return [];
  const pool = SIGHTS.filter(s => s.in.split(' ').some(t => tags.has(t)) && !(q.indoor && /\b(wild|road)\b/.test(s.in) && !/indoor|any/.test(s.in))), out: Seen[] = [];
  for (let i = 0; i < 8 && out.length < count && pool.length; i++) {
    const s = pool.splice(Math.floor(r() * pool.length), 1)[0];
    // 수동 감각: 굴리지 않는다. 다만 그날의 컨디션(-2~+2)이 조금 흔든다
    if (q.passive + Math.floor(r() * 5) - 2 >= s.dc && !out.some(o => o.k === s.k)) out.push({ k: s.k, dc: s.dc, text: s.text });
  }
  return out;
}
export const seePrompt = (list: Seen[]) => `[Keen eyes — {{user}} notices without being asked (the app compared their senses to how hidden each thing is). Work ${list.length > 1 ? 'these' : 'this'} into the scene naturally, adapted to what is actually here, as a detail {{user}} catches — do not explain what it means and do not call for a check to see it: ${list.map((s, i) => `${list.length > 1 ? `(${i + 1}) ` : ''}${s.text}`).join('; ')}.]`;

// ── 가방에 없는 물건 ──
const USE_EN = /\b(?:use|using|draw|drawing|drink|quaff|throw|light|wield|equip|unsheathe|fire|shoot with|swing|read|show|hand over|give (?:him|her|them)|pull out|take out|produce|open (?:it|the \w+) with|unlock (?:it|the \w+) with)\s+(?:my|the|a|an|our)\s+([a-z][a-z' -]{1,28}?)(?=[.,!?;:)]|\s+(?:and|to|at|on|in|from|with|for|then|so|before|while)\b|$)/gi;
const USE_KO = /([가-힣A-Za-z]{1,12})[을를]\s*(?:꺼내|꺼낸|사용|써서|쓴다|마신|마셔|들이켜|던진|던져|휘두|뽑아|뽑는|겨눈|겨누|장착|착용|건넨|건네|내민|내밀|보여|켠다|켜서|펼친|펼쳐)/g;
const USE_ZH = /(?:拿出|掏出|使用|喝下|喝掉|扔出|拔出|举起|点燃|亮出|递出)(?:我的|一[把瓶个张支根]|那[把瓶个张支根])?([一-龥]{1,8})/g;
const norm = (s: string) => s.toLowerCase().replace(/\s+/g, ' ').trim();
/** 내 말에 "꺼낸다 · 쓴다 · 마신다" 고 한 물건 가운데, 가방에 없고 장비 · 소모품으로 알아볼 수 있는 것 */
export function missingItems(text: string, items: { name: string }[]): string[] {
  if (/^\s*\[ooc\]/i.test(text)) return [];
  const have = items.map(i => norm(i.name)), kinds = new Set(items.map(i => itemKind(i.name))), out: string[] = [];
  const test = (raw: string) => {
    const name = norm(raw.replace(/^(?:내|나의|그|이)\s+/, '')); if (name.length < 2 || out.includes(name)) return;
    const kind = itemKind(name); if (kind === 'misc') return;   // 무엇인지 알아볼 수 있는 것만 따진다 (손 · 문 · 동료 같은 말에 걸리지 않게)
    if (have.some(h => h.includes(name) || name.includes(h)) || kinds.has(kind)) return;   // 같은 종류를 하나라도 가졌으면 그것을 가리킨 것으로 본다
    out.push(name);
  };
  for (const re of [USE_EN, USE_KO, USE_ZH]) { re.lastIndex = 0; let m: RegExpExecArray | null; while ((m = re.exec(text)) && out.length < 3) test(m[1]); }
  return out;
}
export const missPrompt = (names: string[], carrying: string) => `[Inventory check — {{user}} wrote as if using ${names.map(n => `"${n}"`).join(' and ')}, but carries no such thing (carrying: ${carrying || 'nothing'}). Do not let it appear. In the story the hand comes up empty or finds something else; let {{user}} improvise, and do not scold.]`;
