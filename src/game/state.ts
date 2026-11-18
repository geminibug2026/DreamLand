// 게임 모드의 규칙과 상태. 화면도 모델도 모르는 순수한 계산만 둔다.
// 상태는 따로 저장하지 않는다 — 시작할 때의 값에 메시지마다 붙은 변화(fx)를 차례로 더해서 구한다.
// 그래서 답변을 다시 받거나, 지우거나, 갈래를 나눠도 언제나 그 대화의 내용과 맞는다.
import type { Chat, Msg } from '../lib/types';

export type StatKey = 'str' | 'dex' | 'con' | 'int' | 'wis' | 'cha';
/** 규칙서: 판정을 어떻게 굴리고 읽는지 */
export type RuleId = 'd20' | '5e' | '2d6' | 'd100' | 'pool';
export const RULE_IDS: RuleId[] = ['d20', '5e', '2d6', 'd100', 'pool'];
const FOUR: StatKey[] = ['str', 'dex', 'int', 'cha'];
export const RULES: Record<RuleId, { stats: StatKey[]; min: number; max: number; hi: number; mid: number; lo: number; even: number }> = {
  d20: { stats: FOUR, min: -2, max: 6, hi: 3, mid: 1, lo: 0, even: 1 },
  '5e': { stats: ['str', 'dex', 'con', 'int', 'wis', 'cha'], min: 3, max: 20, hi: 16, mid: 14, lo: 10, even: 12 },
  '2d6': { stats: FOUR, min: -1, max: 3, hi: 2, mid: 1, lo: 0, even: 1 },
  d100: { stats: FOUR, min: 5, max: 95, hi: 70, mid: 55, lo: 40, even: 55 },
  pool: { stats: FOUR, min: 1, max: 6, hi: 4, mid: 3, lo: 2, even: 3 },
};
export const STATS: StatKey[] = FOUR;
export type Diff = 'easy' | 'normal' | 'hard';
export interface GameCfg {
  on: boolean; rule?: RuleId; /** 새 장소 · 전투 때 삽화를 그린다 */ art?: boolean; /** 효과음 (기본 켬) */ sfx?: boolean; /** 배경 음악 (기본 켬) */ music?: boolean; /** 게임 화면으로 연다 (기본 켬) */ stage?: boolean; /** 자동 넘김: 문단마다 기다리는 초 (0 = 끔) */ auto?: number; /** 게임을 시작하기 전의 모드 */ prev?: string; /** 게임 화면에서 보던 문단 */ at?: string; genre: string; tone: string; diff: Diff; hero: string; goal: string;
  stats: Partial<Record<StatKey, number>>; hpMax: number; gold: number; items: string[];
  /** 손으로 고친 값 (시트에서 직접 바꾼 것) */
  adj?: Fx[];
  /** 끝낸 세션의 요약 (차례대로). 프롬프트에 '지금까지의 이야기'로 들어간다 */
  sessions?: { text: string; at: number }[];
}
export type Fx =
  | { k: 'hp'; n: number } | { k: 'hpmax'; n: number } | { k: 'gold'; n: number }
  | { k: 'item'; name: string; n: number } | { k: 'quest'; title: string; done: boolean } | { k: 'place'; name: string }
  /** 두 장소를 잇는 길 (아직 가 보지 않은 곳도 지도에 나타난다) */
  | { k: 'path'; a: string; b: string } | { k: 'xp'; n: number }
  /** 인물과의 사이 (-100 ~ 100) · 동료 · 작중 시간 · 날씨 · 진행 시계 */
  | { k: 'rep'; name: string; n: number } | { k: 'party'; name: string; add: boolean } | { k: 'time'; text: string } | { k: 'weather'; text: string } | { k: 'scene'; key: string } | { k: 'fate'; n: number } | { k: 'clock'; name: string; v: number; max: number };
export type MiniId = 'rps' | 'dice' | 'blackjack' | 'tictactoe' | 'numbers' | 'gomoku';
export const MINIS: MiniId[] = ['rps', 'dice', 'blackjack', 'tictactoe', 'gomoku', 'numbers'];
export interface Foe { name: string; hp: number; atk: number; ranged?: boolean }
/** 진행자가 앱에 맡긴 일: 판정 · 전투 · 미니게임 */
export type Ask =
  | { k: 'check'; stat: StatKey; dc: number; why: string; adv?: 'adv' | 'dis'; prof?: boolean; hard?: 'hard' | 'extreme' }
  | { k: 'fight'; foes: Foe[] }
  | { k: 'play'; game: MiniId; stake: string }
  /** 순간 반응: 제한 시간 안에 하나를 고른다 */
  | { k: 'qte'; secs: number; options: string[] };
export type Outcome = 'win' | 'lose' | 'draw';
export type Grade = 'crit' | 'ok' | 'partial' | 'fail' | 'fumble';
/** 대화에 남는 게임 기록 (시스템 메시지에 붙는다) */
export type GameRec =
  | { kind: 'start' }
  | { kind: 'session'; n: number; text: string }
  | { kind: 'qte'; choice: string; took: number; secs: number; speed: 'fast' | 'ok' | 'late' | 'timeout' }
  | { kind: 'check'; stat: StatKey; dc: number; die: number; mod: number; total: number; ok: boolean; crit?: 'hit' | 'miss'; why?: string; fx?: Fx[]; rule?: RuleId; dice?: number[]; grade?: Grade; note?: string; /** 실패했고 운명 점이 남아 있다: 받아들일지 다시 굴릴지 고르는 중 */ open?: boolean; rerolled?: boolean }
  | { kind: 'fight'; name: string; outcome: 'win' | 'lose' | 'fled'; rounds: number; took: number; hp: number; hpMax: number; fx?: Fx[]; loot?: string; fallen?: string[] }
  | { kind: 'play'; game: MiniId; outcome: Outcome; score: string; stake?: string; fx?: Fx[] };
export interface Sheet { hp: number; hpMax: number; gold: number; items: { name: string; n: number }[]; quests: { title: string; done: boolean }[]; place: string; places: { name: string; seen: boolean }[]; paths: [string, string][]; xp: number; level: number; people: { name: string; v: number }[]; party: string[]; time: string; weather: string; scene: string; fate: number; clocks: { name: string; v: number; max: number }[] }

export type GameChat = Chat & { game?: GameCfg };
export type GameSwipe = { /** 연출: 흔들림 · 섬광 · 어두워짐 · 위아래 띠 */ gcine?: string[]; gfx?: Fx[]; gask?: Ask; /** 진행자가 내놓은 선택지 */ gchoices?: string[] };
export type GameMsg = Msg & { gm?: GameRec };

export const PRESET_IDS = ['balanced', 'fighter', 'rogue', 'scholar', 'charmer'] as const;
const PRESET_TOP: Record<string, [StatKey, StatKey, StatKey]> = { fighter: ['str', 'con', 'dex'], rogue: ['dex', 'int', 'cha'], scholar: ['int', 'wis', 'cha'], charmer: ['cha', 'dex', 'wis'] };
/** 규칙서에 맞춘 능력치 묶음 */
export function presetStats(rule: RuleId, id: string): Partial<Record<StatKey, number>> {
  const R = RULES[rule], out: Partial<Record<StatKey, number>> = {}, top = PRESET_TOP[id];
  for (const k of R.stats) out[k] = !top ? R.even : k === top[0] ? R.hi : k === top[1] || (!R.stats.includes(top[1]) && k === top[2]) ? R.mid : R.lo;
  return out;
}
export const ruleOf = (g: GameCfg): RuleId => g.rule && RULES[g.rule] ? g.rule : 'd20';
export const statsOf = (g: GameCfg) => RULES[ruleOf(g)].stats;
export const statVal = (g: GameCfg, k: StatKey) => g.stats[k] ?? RULES[ruleOf(g)].even;
/** d20 에 더하는 보정으로 바꾼 값 (전투는 규칙서와 상관없이 이 값으로 계산한다) */
export function modOf(g: GameCfg, k: StatKey): number {
  const r = ruleOf(g), v = g.stats[k] ?? (k === 'con' ? g.stats.str : k === 'wis' ? g.stats.int : undefined) ?? RULES[r].even;
  return r === '5e' ? Math.floor((v - 10) / 2) : r === 'd100' ? Math.round((v - 50) / 10) : r === 'pool' ? v - 2 : v;
}
export const levelOf = (xp: number) => Math.min(20, 1 + Math.floor(Math.max(0, xp) / 100));
export const newGame = (): GameCfg => ({ on: true, genre: '', tone: '', diff: 'normal', hero: '', goal: '', rule: 'd20', stats: presetStats('d20', 'balanced'), hpMax: 20, gold: 10, items: [], adj: [] });
export const gameOf = (chat: Chat | null | undefined): GameCfg | null => { const g = (chat as GameChat | null | undefined)?.game; return g?.on ? g : null; };

const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();
const spot = (s: Sheet, name: string) => { let p = s.places.find(x => same(x.name, name)); if (!p) s.places.push(p = { name: name.trim(), seen: false }); return p; };
const link = (s: Sheet, a: string, b: string) => { if (!s.paths.some(([x, y]) => (same(x, a) && same(y, b)) || (same(x, b) && same(y, a)))) s.paths.push([a, b]); };
function apply(s: Sheet, fx: Fx) {
  if (fx.k === 'hp') s.hp = Math.min(s.hpMax, Math.max(0, s.hp + fx.n));
  else if (fx.k === 'hpmax') { s.hpMax = Math.max(1, s.hpMax + fx.n); s.hp = Math.min(s.hp, s.hpMax); }
  else if (fx.k === 'gold') s.gold = Math.max(0, s.gold + fx.n);
  else if (fx.k === 'xp') { s.xp = Math.max(0, s.xp + fx.n); const lv = levelOf(s.xp); if (lv > s.level) { const up = (lv - s.level) * 3; s.hpMax += up; s.hp += up; } s.level = Math.max(s.level, lv); }
  else if (fx.k === 'rep') { let p = s.people.find(x => same(x.name, fx.name)); if (!p) s.people.push(p = { name: fx.name.trim(), v: 0 }); p.v = Math.min(100, Math.max(-100, p.v + fx.n)); }
  else if (fx.k === 'party') { const i = s.party.findIndex(x => same(x, fx.name)); if (fx.add && i < 0 && s.party.length < 3) s.party.push(fx.name.trim()); if (!fx.add && i >= 0) s.party.splice(i, 1); }
  else if (fx.k === 'scene') s.scene = fx.key;
  else if (fx.k === 'fate') s.fate = Math.max(0, Math.min(5, s.fate + fx.n));
  else if (fx.k === 'time') s.time = fx.text; else if (fx.k === 'weather') s.weather = fx.text;
  else if (fx.k === 'clock') { const i = s.clocks.findIndex(x => same(x.name, fx.name)); if (fx.max <= 0) { if (i >= 0) s.clocks.splice(i, 1); } else if (i >= 0) s.clocks[i] = { name: s.clocks[i].name, v: Math.min(fx.max, Math.max(0, fx.v)), max: fx.max }; else s.clocks.push({ name: fx.name.trim(), v: Math.min(fx.max, Math.max(0, fx.v)), max: fx.max }); }
  else if (fx.k === 'place') { const from = s.place, p = spot(s, fx.name); p.seen = true; s.place = p.name; if (from && !same(from, p.name)) link(s, from, p.name); }
  else if (fx.k === 'path') { const a = spot(s, fx.a), b = spot(s, fx.b); if (!same(a.name, b.name)) link(s, a.name, b.name); }
  else if (fx.k === 'item') {
    const it = s.items.find(x => same(x.name, fx.name));
    if (it) { it.n += fx.n; if (it.n <= 0) s.items.splice(s.items.indexOf(it), 1); } else if (fx.n > 0) s.items.push({ name: fx.name, n: fx.n });
  } else if (fx.k === 'quest') {
    const q = s.quests.find(x => same(x.title, fx.title));
    if (q) q.done = q.done || fx.done; else s.quests.push({ title: fx.title, done: fx.done });
  }
}
/** 지금의 시트: 시작값 + 손으로 고친 값 + 메시지마다의 변화 */
export function sheetOf(g: GameCfg, msgs: Msg[]): Sheet {
  const s: Sheet = { hp: g.hpMax, hpMax: g.hpMax, gold: g.gold, items: [], quests: [], place: '', places: [], paths: [], xp: 0, level: 1, people: [], party: [], time: '', weather: '', scene: '', fate: g.diff === 'easy' ? 2 : g.diff === 'hard' ? 0 : 1, clocks: [] };
  for (const name of g.items) apply(s, { k: 'item', name, n: 1 });
  for (const m of msgs as GameMsg[]) {
    for (const fx of m.gm && 'fx' in m.gm && m.gm.fx || []) apply(s, fx);
    for (const fx of (m.swipes[m.sw] as GameSwipe | undefined)?.gfx || []) apply(s, fx);
  }
  for (const fx of g.adj || []) apply(s, fx);
  return s;
}
/** 마지막 답변이 맡긴 일 (그 뒤에 무엇이든 이어졌으면 끝난 것) */
/** 실패한 판정을 받아들일지 고르는 중인 기록 */
export function pendingFate(msgs: Msg[]): GameMsg | null { const m = msgs[msgs.length - 1] as GameMsg | undefined; return m?.gm?.kind === 'check' && m.gm.open ? m : null; }
export function pendingAsk(msgs: Msg[]): Ask | null {
  const m = msgs[msgs.length - 1]; if (!m || m.role !== 'assistant') return null;
  return (m.swipes[m.sw] as GameSwipe | undefined)?.gask || null;
}

/** 배경 그림의 이름들 (game/bg/<이름>.jpg). 진행자가 [scene 이름] 으로 고르고, 없으면 장소 이름에서 짐작한다 */
export const SCENES = ['forest', 'mountain', 'road', 'peak', 'sea', 'winter', 'ruins', 'meadow', 'castle', 'garden', 'night', 'city', 'street', 'hall', 'tavern', 'room', 'desert', 'bridge', 'harbor', 'lake', 'station', 'arena'];
const SCENE_WORDS: [string, RegExp][] = [
  ['hall', /cave|cavern|dungeon|mine|crypt|tomb|sewer|cloister|corridor|hall|vault|cellar|prison|church|chapel|동굴|던전|지하|광산|무덤|하수|회랑|복도|감옥|성당|교회|예배당|洞|地牢|地下|走廊|教堂/i], ['tavern', /tavern|inn|pub|bar\b|주점|여관|술집|선술집|酒馆|旅店/i], 
  ['castle', /castle|keep|fortress|palace|citadel|성\b|성채|요새|궁전|왕궁|城堡|宫殿/i], ['ruins', /ruin|temple|shrine|폐허|유적|신전|사원|废墟|遗迹|神殿/i], ['harbor', /harbor|harbour|port|dock|canal|항구|부두|선착장|운하|港|码头/i],
  ['sea', /sea|ocean|ship|coast|beach|shore|바다|해안|해변|배 위|海|船/i], ['lake', /lake|river|pond|marsh|swamp|호수|강가|강변|늪|湖|河/i], ['winter', /snow|ice|frost|winter|glacier|눈밭|설원|빙하|겨울|雪|冰/i],
  ['desert', /desert|dune|oasis|사막|오아시스|沙漠/i], ['peak', /peak|summit|cliff|ridge|정상|절벽|봉우리|山顶|悬崖/i], ['mountain', /mountain|valley|pass\b|canyon|산\b|산맥|계곡|협곡|山|峡谷/i],
  ['forest', /forest|wood|grove|jungle|숲|삼림|밀림|森林|树林/i], ['garden', /garden|park|courtyard|orchard|정원|공원|뜰|과수원|花园|庭院/i], 
  ['city', /city|downtown|station|office|tower|도시|시내|역\b|빌딩|사무실|城市|车站/i], ['street', /street|alley|avenue|town|village|cafe|café|restaurant|market|plaza|square|카페|식당|시장|광장|咖啡|市场|广场|거리|골목|마을|시가|街|巷|村/i], ['bridge', /bridge|gate|다리|성문|관문|桥|城门/i],
  ['station', /station|spaceport|hangar|starship|laborator|우주|정거장|격납고|연구소|함선|太空|飞船|实验室/i], ['arena', /arena|colise|training ground|duel|경기장|투기장|훈련장|결투장|竞技场|训练场/i],
  ['room', /room|house|home|apartment|school|class|hospital|chamber|librar|archive|study|bedroom|서재|도서관|서고|침실|书房|图书|卧室|방\b|집\b|교실|학교|병원|저택|房间|学校|医院/i], ['meadow', /meadow|field|plain|farm|hill|초원|들판|평원|농장|언덕|草原|田野/i], ['road', /road|path|trail|camp|길\b|야영|오솔길|도로|路|营地/i],
];
/** 지금 깔 배경: 진행자가 고른 것 → 장소 이름에서 짐작 → 밤이면 밤 그림 → 길. */
export function sceneOf(s: Sheet): string {
  if (s.scene && SCENES.includes(s.scene)) return s.scene;
  for (const [key, re] of SCENE_WORDS) if (re.test(s.place)) return key;
  return /night|midnight|밤|자정|夜/i.test(s.time) ? 'night' : 'road';
}
/** 지금 틀 음악 */
export function trackOf(s: Sheet, g: GameCfg, fighting: boolean): 'explore' | 'town' | 'battle' | 'dark' | 'rest' {
  if (fighting) return 'battle';
  const sc = sceneOf(s), dark = /horror|호러|공포|恐怖/i.test(g.genre) || ['hall', 'ruins', 'night'].includes(sc) || /night|midnight|밤|자정|夜/i.test(s.time);
  if (['tavern', 'room'].includes(sc) || /rest|camp|sleep|휴식|야영|쉬/i.test(s.place)) return 'rest';
  if (dark) return 'dark';
  return ['street', 'city', 'harbor', 'garden', 'castle', 'bridge'].includes(sc) ? 'town' : 'explore';
}

// ── 진행자가 쓰는 표시 ──
const TAG = /\[\s*(hp|maxhp|gold|xp|item|quest|place|path|rep|party|time|weather|backdrop|fx|fate|clock|choices|qte|check|save|fight|play)\b[\s:：]*([^[\]\n]{0,300})\]/gi;
const STAT_ALIAS: Record<string, StatKey> = { str: 'str', strength: 'str', 힘: 'str', 근력: 'str', 力量: 'str', dex: 'dex', dexterity: 'dex', agi: 'dex', 민첩: 'dex', 敏捷: 'dex', con: 'con', constitution: 'con', 건강: 'con', 体质: 'con', int: 'int', intelligence: 'int', 지능: 'int', 智力: 'int', wis: 'wis', wisdom: 'wis', 지혜: 'wis', 感知: 'wis', cha: 'cha', charisma: 'cha', 매력: 'cha', 魅力: 'cha' };
const MINI_ALIAS: Record<string, MiniId> = { gomoku: 'gomoku', omok: 'gomoku', 'five-in-a-row': 'gomoku', rps: 'rps', dice: 'dice', blackjack: 'blackjack', tictactoe: 'tictactoe', 'tic-tac-toe': 'tictactoe', ttt: 'tictactoe', numbers: 'numbers', baseball: 'numbers' };
const num = (s: string) => { const m = s.replace(/[−–]/g, '-').match(/[+-]?\s*\d+/); return m ? parseInt(m[0].replace(/\s+/g, ''), 10) : NaN; };
const clampN = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

/** 답변에서 표시를 읽어 변화와 맡긴 일을 꺼내고, 글에서는 지운다 */
export function readTags(text: string): { text: string; fx: Fx[]; ask: Ask | null; choices: string[]; cine: string[] } {
  const fx: Fx[] = [], cine: string[] = []; let ask: Ask | null = null, choices: string[] = [];
  const opts = (v: string) => v.split(/\s*[|｜]\s*/).map(x => x.trim().replace(/^["“](.*)["”]$/, '$1')).filter(Boolean).slice(0, 5).map(x => x.slice(0, 120));
  const out = String(text || '').replace(TAG, (all, key: string, rest: string) => {
    const k = key.toLowerCase(), v = rest.trim();
    if (k === 'hp' || k === 'gold' || k === 'maxhp' || k === 'xp') { const n = num(v); if (!isFinite(n) || !n) return ''; fx.push({ k: k === 'maxhp' ? 'hpmax' : k, n: clampN(n, -9999, 9999) }); return ''; }
    if (k === 'item') {
      const m = v.match(/^([+-−–])\s*(.+?)(?:\s*[x×*]\s*(\d+))?$/); if (!m) return all;
      const name = m[2].trim().slice(0, 60); if (!name) return all;
      fx.push({ k: 'item', name, n: (m[1] === '+' ? 1 : -1) * clampN(parseInt(m[3] || '1', 10) || 1, 1, 999) }); return '';
    }
    if (k === 'quest') {
      const done = /^(done|complete|completed|✓|✔|-)\s*[:：]?\s*/i.test(v), title = v.replace(/^(done|complete|completed|new|✓|✔|\+|-)\s*[:：]?\s*/i, '').trim().slice(0, 100);
      if (!title) return all; fx.push({ k: 'quest', title, done }); return '';
    }
    if (k === 'rep') { const m = v.match(/^(.+?)\s*([+-−–]\s*\d+)$/); if (!m) return all; fx.push({ k: 'rep', name: m[1].trim().slice(0, 40), n: clampN(num(m[2]), -100, 100) }); return ''; }
    if (k === 'party') { const m = v.match(/^([+-−–])\s*(.+)$/); if (!m) return all; fx.push({ k: 'party', name: m[2].trim().slice(0, 40), add: m[1] === '+' }); return ''; }
    if (k === 'fx') { for (const w of v.toLowerCase().split(/[\s,|]+/)) if (['shake', 'flash', 'dark', 'letterbox'].includes(w) && !cine.includes(w)) cine.push(w); return ''; }
    if (k === 'fate') { const n = num(v); if (!isFinite(n) || !n) return ''; fx.push({ k: 'fate', n: clampN(n, -5, 5) }); return ''; }
    if (k === 'backdrop') { const key = v.toLowerCase().replace(/[^a-z]/g, ''); if (!SCENES.includes(key)) return ''; fx.push({ k: 'scene', key }); return ''; }
    if (k === 'time' || k === 'weather') { if (!v) return all; fx.push({ k, text: v.slice(0, 60) }); return ''; }
    if (k === 'clock') { const m = v.match(/^(.+?)\s+(?:(\d+)\s*\/\s*(\d+)|(clear|done|off))$/i); if (!m) return all; fx.push({ k: 'clock', name: m[1].trim().slice(0, 40), v: +(m[2] || 0), max: m[4] ? 0 : clampN(+m[3], 1, 12) }); return ''; }
    if (k === 'choices') { const list = opts(v); if (list.length < 2) return all; choices = list; return ''; }
    if (k === 'qte') { const m = v.match(/^(\d+)\s*s?\s*[:：]\s*(.+)$/i), list = m ? opts(m[2]) : opts(v); if (list.length < 2) return all; ask = { k: 'qte', secs: clampN(m ? +m[1] : 6, 3, 15), options: list.slice(0, 4) }; return ''; }
    if (k === 'place') { if (!v) return all; fx.push({ k: 'place', name: v.slice(0, 60) }); return ''; }
    if (k === 'path') { const m = v.split(/\s+(?:-|–|—|<->|↔|to)\s+/i).map(x => x.trim()).filter(Boolean); if (m.length !== 2) return all; fx.push({ k: 'path', a: m[0].slice(0, 60), b: m[1].slice(0, 60) }); return ''; }
    if (k === 'check' || k === 'save') {
      const m = v.match(/^([^\s\d:：]+)\s*(?:dc\s*)?(\d+)?\s*([^:：]*)[:：]?\s*(.*)$/i), stat = m && STAT_ALIAS[m[1].toLowerCase()]; if (!m || !stat) return all;
      const flags = (m[3] || '').toLowerCase(), adv = /\badv/.test(flags) ? 'adv' as const : /\bdis/.test(flags) ? 'dis' as const : undefined, hard = /\bextreme/.test(flags) ? 'extreme' as const : /\bhard/.test(flags) ? 'hard' as const : undefined;
      ask = { k: 'check', stat, dc: clampN(parseInt(m[2] || '0', 10) || 0, 0, 30), why: (m[4] || '').trim().slice(0, 120), ...(adv ? { adv } : {}), ...(/\bprof/.test(flags) ? { prof: true } : {}), ...(hard ? { hard } : {}) }; return '';
    }
    if (k === 'fight') {
      // 여럿이면 ; 로 나눈다. "Goblin x3 hp=8 atk=2" 는 셋으로 편다
      const foes: Foe[] = [];
      for (const part of v.split(/\s*[;；]\s*/)) {
        const hp = part.match(/\bhp\s*[=:]?\s*(\d+)/i), atk = part.match(/\batk\s*[=:]?\s*(\d+)/i), ranged = /\branged\b/i.test(part), many = part.match(/(?:^|\s)[x×*]\s*(\d+)\b/i);
        const name = part.replace(/\b(hp|atk)\s*[=:]?\s*\d+/gi, '').replace(/\branged\b/gi, '').replace(/(?:^|\s)[x×*]\s*\d+\b/i, ' ').replace(/[,·|]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 40); if (!name) continue;
        const n = clampN(parseInt(many?.[1] || '1', 10), 1, 6);
        for (let i = 0; i < n && foes.length < 6; i++) foes.push({ name: n > 1 ? `${name} ${i + 1}` : name, hp: clampN(parseInt(hp?.[1] || '12', 10), 1, 200), atk: clampN(parseInt(atk?.[1] || '3', 10), 0, 20), ...(ranged ? { ranged: true } : {}) });
      }
      if (!foes.length) return all; ask = { k: 'fight', foes }; return '';
    }
    const m = v.match(/^([a-z-]+)\s*[:：]?\s*(.*)$/i), game = m && MINI_ALIAS[m[1].toLowerCase()]; if (!m || !game) return all;
    ask = { k: 'play', game, stake: (m[2] || '').trim().slice(0, 120) }; return '';
  });
  return { text: fx.length || ask || choices.length || cine.length ? out.replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim() : out, fx, ask, choices, cine };
}
/** 화면에서만 가린다 (받는 중에는 아직 닫히지 않은 표시도) */
export const hideTags = (text: string, streaming: boolean) => {
  let s = text.replace(TAG, '');
  if (streaming) s = s.replace(/\[\s*(hp|maxhp|gold|xp|item|quest|place|path|rep|party|time|weather|backdrop|fx|fate|clock|choices|qte|check|save|fight|play)\b[^\]\n]*$/i, '');
  return s;
};

// ── 주사위 ──
export const d = (sides: number) => { const a = new Uint32Array(1); crypto.getRandomValues(a); return 1 + (a[0] % sides); };
/** 판정을 굴린다. 규칙서마다 굴리는 법과 읽는 법이 다르다 */
export function rollCheck(g: GameCfg, ask: Extract<Ask, { k: 'check' }>, level = 1) {
  const rule = ruleOf(g), stat = ask.stat, v = statVal(g, stat);
  const base = { rule, stat, dc: ask.dc, die: 0, mod: 0, total: 0, ok: false, dice: [] as number[], grade: 'fail' as Grade, note: '' };
  if (rule === '2d6') {
    const dice = [d(6), d(6)], total = dice[0] + dice[1] + v, grade: Grade = total >= 10 ? 'ok' : total >= 7 ? 'partial' : 'fail';
    return { ...base, dice, die: dice[0] + dice[1], mod: v, total, dc: 7, grade, ok: grade !== 'fail' };
  }
  if (rule === 'd100') {
    const die = d(100), target = Math.max(1, Math.floor(v / (ask.hard === 'extreme' ? 5 : ask.hard === 'hard' ? 2 : 1)));
    const grade: Grade = die >= 96 ? 'fumble' : die <= Math.max(1, Math.floor(target / 5)) ? 'crit' : die <= target ? 'ok' : 'fail';
    return { ...base, dice: [die], die, total: die, dc: target, grade, ok: grade === 'ok' || grade === 'crit', note: ask.hard || '' };
  }
  if (rule === 'pool') {
    const dice = Array.from({ length: Math.max(1, v) }, () => d(6)), hits = dice.filter(x => x >= 5).length, need = clampN(ask.dc || 2, 1, 6);
    const grade: Grade = hits >= need + 2 ? 'crit' : hits >= need ? 'ok' : hits === 0 && dice.filter(x => x === 1).length * 2 >= dice.length ? 'fumble' : 'fail';
    return { ...base, dice, die: hits, total: hits, dc: need, grade, ok: hits >= need };
  }
  // d20 계열. 5e 는 유리 · 불리(두 번 굴려 큰/작은 값)와 숙련 보너스가 있다
  const two = rule === '5e' && ask.adv ? [d(20), d(20)] : [d(20)], die = ask.adv === 'dis' ? Math.min(...two) : Math.max(...two);
  const prof = rule === '5e' && ask.prof ? 2 + Math.floor((level - 1) / 4) : 0, mod = modOf(g, stat) + prof, total = die + mod, dc = ask.dc || 12;
  const grade: Grade = die === 20 ? 'crit' : die === 1 ? 'fumble' : total >= dc ? 'ok' : 'fail';
  return { ...base, dice: two, die, mod, total, dc, grade, ok: grade === 'crit' || grade === 'ok', crit: die === 20 ? 'hit' as const : die === 1 ? 'miss' as const : undefined, note: [ask.adv === 'adv' ? 'advantage' : ask.adv === 'dis' ? 'disadvantage' : '', prof ? 'proficient' : ''].filter(Boolean).join(', ') };
}
export const DIFF_HIT: Record<Diff, number> = { easy: .7, normal: 1, hard: 1.3 };
export const isPotion = (name: string) => /potion|elixir|포션|물약|회복약|药水|藥水/i.test(name);

// ── 모델에게 알려 주는 글 ──
const sign = (n: number) => (n >= 0 ? '+' : '') + n;
const RULE_TEXT: Record<RuleId, { stats: string; check: string }> = {
  d20: { stats: `{{user}}'s stats are modifiers added to a d20: STR, DEX, INT, CHA.`, check: `[check DEX 12: slipping past the guard] — whenever the outcome is uncertain and failing would be interesting. Guide: easy 8, normal 12, hard 16, heroic 20.` },
  '5e': { stats: `Rules: fifth-edition style. {{user}} has six ability scores (STR, DEX, CON, INT, WIS, CHA); the app adds the ability modifier to a d20.`, check: `[check DEX 13: slipping past the guard] — ability checks and saving throws alike (e.g. [check CON 12: resisting the poison]). DC guide: very easy 5, easy 10, medium 15, hard 20. Add the word prof before the colon when {{user}}'s role would be trained at it, and adv or dis for advantage or disadvantage: [check DEX 13 prof adv: ...].` },
  '2d6': { stats: `Rules: 2d6 + stat (STR, DEX, INT, CHA from -1 to +3), no difficulty numbers.`, check: `[check DEX: slipping past the guard] — whenever {{user}} does something risky. The result comes back as full success (10+), partial success (7–9: it works, but you add a cost, a hard choice or a complication) or miss (6-: things get worse — make a hard move).` },
  d100: { stats: `Rules: percentile. {{user}}'s STR, DEX, INT, CHA are chances out of 100; the app rolls d100 and must roll equal or under.`, check: `[check DEX: slipping past the guard] — whenever the outcome is uncertain. For tougher tasks add hard (half chance) or extreme (one fifth) before the colon: [check DEX hard: ...]. A very low roll is a critical success; 96+ is a fumble.` },
  pool: { stats: `Rules: dice pool. {{user}} rolls as many d6 as the stat (STR, DEX, INT, CHA); each 5 or 6 is a hit.`, check: `[check DEX 2: slipping past the guard] — the number is how many hits are needed: 1 easy, 2 normal, 3 hard, 4 heroic.` },
};
export function rulesPrompt(g: GameCfg): string {
  const diff = g.diff === 'easy' ? 'Be generous: prefer DC 8–12, give second chances, keep fights short.' : g.diff === 'hard' ? 'Be demanding: prefer DC 13–18, make mistakes cost something, enemies hit hard.' : 'Keep it fair: most checks DC 10–14.';
  return `[Game mode]
Besides playing your role, you run this as a tabletop adventure for {{user}}${g.genre ? ` — genre: ${g.genre}` : ''}${g.tone ? `, tone: ${g.tone}` : ''}.${g.hero ? ` {{user}} plays: ${g.hero}.` : ''}${g.goal ? ` The adventure's goal: ${g.goal}.` : ''}
Describe the scene, offer real choices with consequences, and let {{user}} decide. Never decide {{user}}'s actions, never roll dice, and never state the result of a roll yourself — the app rolls and reports it.
${RULE_TEXT[ruleOf(g)].stats}${g.sessions?.length ? `\nThe story so far (earlier sessions, oldest first):\n${g.sessions.map((x, i) => `Session ${i + 1}: ${x.text}`).join('\n')}` : ''}
When something changes, write the matching tag on its own line at the end of the reply. The app applies it to {{user}}'s sheet and hides it:
[hp -3]  [hp +5]  [gold +10]  [gold -4]  [xp +20] (for clever play or a finished quest; 100 XP is a level)  [item +Torch]  [item +Arrow x5]  [item -Rusty key]  [quest +Find the missing bell]  [quest done: Find the missing bell]
[place Old Mill] when {{user}} arrives somewhere (keep place names short and reuse the exact same name later).  [path Old Mill - River Dock] to reveal a route to a place {{user}} has heard of or can see. The app draws the map from these.
[rep Mira +10] / [rep Mira -15] when someone's opinion of {{user}} shifts (-100 enemy … +100 devoted).  [party +Mira] / [party -Mira] when someone joins or leaves as a companion (they fight alongside {{user}}; at most three).  [time Day 2, dusk]  [weather Heavy rain]  [backdrop forest] to change the backdrop when the setting changes — one of: ${SCENES.join(', ')}.  [clock Guards alerted 2/6] for a danger or countdown that fills step by step ([clock Guards alerted clear] to drop it).
[fx shake] for an impact or explosion, [fx flash] for lightning or magic, [fx dark] when the lights go out, [fx letterbox] for a dramatic reveal — at most one, only for big moments.  [fate +1] rewards daring or selfless play ({{user}} spends fate points to re-roll a failed check).
[choices Sneak around | Talk to the guard | Wait for night] — optional: two to four suggested actions shown as buttons; {{user}} may still type anything.
To hand something to the app, use ONE of these as the very last line, then stop — do not narrate what happens next:
${RULE_TEXT[ruleOf(g)].check}
[fight Goblin x2 hp=8 atk=2; Orc Chief hp=24 atk=5] — a tactical fight the app runs on a grid (up to 6 enemies; x2 means two of them; add the word ranged for archers and casters). The app also hands out gold and XP for a win. Guide: weak hp 8 atk 2, tough hp 18 atk 4, boss hp 30 atk 6.
[play rps: who pays for dinner] — settle something with a quick game against you: rps, dice, blackjack, tictactoe, gomoku or numbers.
[qte 6: Dive aside | Raise the shield | Grab the rope] — a split-second moment: {{user}} has that many seconds to pick. Use sparingly, for sudden danger.
${diff}
The result comes back as a bracketed line; narrate from there and honor it. Do not change the sheet without a tag, and do not show the tags' meaning to {{user}}.`;
}
export function sheetPrompt(g: GameCfg, s: Sheet): string {
  const items = s.items.map(i => i.n > 1 ? `${i.name} x${i.n}` : i.name).join(', ') || 'nothing', open = s.quests.filter(q => !q.done).map(q => q.title), done = s.quests.filter(q => q.done).map(q => q.title);
  return `[{{user}}'s sheet — HP ${s.hp}/${s.hpMax}${s.hp <= 0 ? ' (down: cannot act until helped or healed)' : ''} · Gold ${s.gold} · Fate ${s.fate} · Level ${s.level} (${s.xp} XP) · ${statsOf(g).map(k => `${STAT_EN[k]} ${ruleOf(g) === 'd20' || ruleOf(g) === '2d6' ? sign(statVal(g, k)) : statVal(g, k)}`).join(' ')} · Carrying: ${items}${open.length ? ` · Quests: ${open.join('; ')}` : ''}${done.length ? ` · Finished: ${done.join('; ')}` : ''}${s.place ? ` · Place: ${s.place}` : ''}${ways(s)}${s.time ? ` · Time: ${s.time}` : ''}${s.weather ? ` · Weather: ${s.weather}` : ''}${s.party.length ? ` · Companions: ${s.party.join(', ')}` : ''}${s.people.length ? ` · Standing: ${s.people.map(p => `${p.name} ${sign(p.v)} (${REP_EN[repTier(p.v)]})`).join(', ')}` : ''}${s.clocks.length ? ` · Clocks: ${s.clocks.map(c => `${c.name} ${c.v}/${c.max}${c.v >= c.max ? ' (FULL — it happens now)' : ''}`).join(', ')}` : ''}]`;
}
/** 사이의 단계: 0 원수 · 1 적대 · 2 중립 · 3 우호 · 4 신뢰 */
export const repTier = (v: number) => v <= -60 ? 0 : v <= -20 ? 1 : v < 20 ? 2 : v < 60 ? 3 : 4;
const REP_EN = ['enemy', 'hostile', 'neutral', 'friendly', 'devoted'];
const ways = (s: Sheet) => { if (!s.place) return ''; const near = s.paths.filter(([a, b]) => same(a, s.place) || same(b, s.place)).map(([a, b]) => same(a, s.place) ? b : a); return near.length ? ` · Routes from here: ${near.join(', ')}` : ''; };
const STAT_EN: Record<StatKey, string> = { str: 'STR', dex: 'DEX', con: 'CON', int: 'INT', wis: 'WIS', cha: 'CHA' };
const MINI_EN: Record<MiniId, string> = { gomoku: 'gomoku (five in a row)', rps: 'rock-paper-scissors', dice: 'a dice duel', blackjack: 'blackjack', tictactoe: 'tic-tac-toe', numbers: 'the number-guessing game (bulls and cows)' };
/** 기록 메시지의 글 (프롬프트에 들어간다) */
export function recText(r: GameRec, user: string, foe: string): string {
  if (r.kind === 'start') return `The game begins. Open the first scene for ${user}.`;
  if (r.kind === 'qte') return r.speed === 'timeout' ? `Split-second moment: ${user} froze and did not react within ${r.secs}s — it goes badly.` : `Split-second moment: ${user} chose "${r.choice}" after ${r.took.toFixed(1)}s of ${r.secs}s — ${r.speed === 'fast' ? 'lightning fast: give it a clear edge' : r.speed === 'ok' ? 'in good time' : 'barely in time: it works only partly'}.`;
  if (r.kind === 'session') return `Session ${r.n} ended. A new session begins — pick the story up from where it left off.`;
  if (r.kind === 'check') {
    const head = `${STAT_EN[r.stat]} check${r.why ? ` (${r.why})` : ''}${r.note ? ` [${r.note}]` : ''}: `, g = r.grade || (r.crit === 'hit' ? 'crit' : r.crit === 'miss' ? 'fumble' : r.ok ? 'ok' : 'fail');
    const word = g === 'crit' ? 'CRITICAL SUCCESS' : g === 'fumble' ? 'CRITICAL FAILURE' : g === 'partial' ? 'partial success (it works, but at a cost or with a complication)' : g === 'ok' ? 'success' : 'failure';
    if (r.rule === '2d6') return `${head}2d6 (${(r.dice || []).join('+')}) ${sign(r.mod)} = ${r.total} → ${g === 'ok' ? 'full success' : word}`;
    if (r.rule === 'd100') return `${head}d100 = ${r.die}, needed ${r.dc} or less → ${word}`;
    if (r.rule === 'pool') return `${head}${(r.dice || []).length}d6 [${(r.dice || []).join(', ')}] → ${r.total} hit${r.total === 1 ? '' : 's'}, needed ${r.dc} → ${word}`;
    if (r.open) return `${head}rolling…`;
    return `${r.rerolled ? '(re-rolled with a fate point) ' : ''}${head}d20 ${(r.dice?.length || 0) > 1 ? `(${r.dice!.join(', ')} → ${r.die})` : r.die} ${sign(r.mod)} = ${r.total} vs DC ${r.dc} → ${word}`;
  }
  if (r.kind === 'fight') return `Fight with ${r.name}: ${r.outcome === 'win' ? `${user} won` : r.outcome === 'fled' ? `${user} got away` : `${user} was beaten and is down`} after ${r.rounds} round${r.rounds === 1 ? '' : 's'}, taking ${r.took} damage (HP ${r.hp}/${r.hpMax}).${r.fallen?.length ? ` Knocked out during the fight: ${r.fallen.join(', ')}.` : ''}${r.loot ? ` The app awarded ${r.loot}.` : ''}`;
  return `${user} and ${foe} played ${MINI_EN[r.game]}${r.stake ? ` (at stake: ${r.stake})` : ''}: ${r.outcome === 'win' ? `${user} won` : r.outcome === 'lose' ? `${foe} won` : 'a draw'}${r.score ? ` — ${r.game === 'numbers' ? 'guesses used ' : ''}${r.score}` : ''}.`;
}

// ── 세션 요약 ──
export const SESSION_PROMPT = `You are the record keeper of a tabletop adventure. Summarize the session below so the game can continue later without the transcript.
Write 5–9 short sentences in the language the session was played in: what happened in order, where the party is now, what is unresolved, promises or debts, and how the main characters feel about each other.
Facts only — no commentary, no headings, no lists. Do not invent anything that is not in the transcript.`;

// ── 지도: 장소를 모눈 위에 놓는다 (처음 간 곳에서 길을 따라 퍼져 나가며 빈 칸을 찾는다) ──
export interface MapNode { name: string; seen: boolean; x: number; y: number; here: boolean }
export function layoutMap(s: Sheet): { nodes: MapNode[]; edges: [MapNode, MapNode][]; w: number; h: number } {
  const key = (n: string) => n.trim().toLowerCase(), pos = new Map<string, { x: number; y: number }>(), taken = new Set<string>();
  const near = (n: string) => s.paths.filter(([a, b]) => key(a) === key(n) || key(b) === key(n)).map(([a, b]) => key(a) === key(n) ? b : a);
  const DIRS = [[1, 0], [0, 1], [-1, 0], [0, -1], [1, 1], [-1, 1], [1, -1], [-1, -1]];
  const put = (n: string, x: number, y: number) => { pos.set(key(n), { x, y }); taken.add(`${x},${y}`); };
  const free = (cx: number, cy: number) => { for (let r = 1; r < 12; r++) for (const [dx, dy] of DIRS) { const x = cx + dx * r, y = cy + dy * r; if (!taken.has(`${x},${y}`)) return { x, y }; } return { x: cx + 12, y: cy }; };
  for (const p of s.places) {
    if (pos.has(key(p.name))) continue;
    const start = pos.size ? free(0, 0) : { x: 0, y: 0 }; put(p.name, start.x, start.y);
    const queue = [p.name];
    while (queue.length) { const cur = queue.shift()!, at = pos.get(key(cur))!; for (const n of near(cur)) if (!pos.has(key(n))) { const f = free(at.x, at.y); put(n, f.x, f.y); queue.push(n); } }
  }
  const xs = [...pos.values()].map(p => p.x), ys = [...pos.values()].map(p => p.y), minX = Math.min(0, ...xs), minY = Math.min(0, ...ys);
  const nodes = s.places.map(p => { const at = pos.get(key(p.name))!; return { name: p.name, seen: p.seen, x: at.x - minX, y: at.y - minY, here: key(p.name) === key(s.place) }; });
  const find = (n: string) => nodes.find(x => key(x.name) === key(n))!;
  return { nodes, edges: s.paths.map(([a, b]) => [find(a), find(b)] as [MapNode, MapNode]).filter(e => e[0] && e[1]), w: Math.max(0, ...nodes.map(n => n.x)) + 1, h: Math.max(0, ...nodes.map(n => n.y)) + 1 };
}

// ── 모험 일지: 있었던 일을 기록에서 그대로 뽑는다 (모델을 부르지 않는다) ──
export type JournalRow = { kind: 'place' | 'quest' | 'questDone' | 'item' | 'party' | 'check' | 'fight' | 'play' | 'session'; text: string; ok?: boolean; id: string };
export function journalOf(msgs: Msg[]): JournalRow[] {
  const out: JournalRow[] = [];
  for (const m of msgs as GameMsg[]) {
    const r = m.gm, fxs = [...(r && 'fx' in r && r.fx || []), ...((m.swipes[m.sw] as GameSwipe | undefined)?.gfx || [])];
    if (r?.kind === 'check') out.push({ kind: 'check', text: r.why || '', ok: r.ok, id: m.id });
    else if (r?.kind === 'fight') out.push({ kind: 'fight', text: r.name, ok: r.outcome === 'win', id: m.id });
    else if (r?.kind === 'play') out.push({ kind: 'play', text: r.game, ok: r.outcome === 'win', id: m.id });
    else if (r?.kind === 'qte') out.push({ kind: 'check', text: r.choice || '—', ok: r.speed !== 'timeout', id: m.id });
    else if (r?.kind === 'session') out.push({ kind: 'session', text: String(r.n), id: m.id });
    for (const fx of fxs) {
      if (fx.k === 'place') out.push({ kind: 'place', text: fx.name, id: m.id });
      else if (fx.k === 'quest') out.push({ kind: fx.done ? 'questDone' : 'quest', text: fx.title, id: m.id });
      else if (fx.k === 'party') out.push({ kind: 'party', text: fx.name, ok: fx.add, id: m.id });
      else if (fx.k === 'item' && fx.n > 0) out.push({ kind: 'item', text: fx.n > 1 ? `${fx.name} ×${fx.n}` : fx.name, id: m.id });
    }
  }
  return out;
}
/** 미니게임 전적 (기록에서 센다) */
export function tallyOf(msgs: Msg[]): { win: number; lose: number; draw: number } {
  const n = { win: 0, lose: 0, draw: 0 };
  for (const m of msgs as GameMsg[]) if (m.gm?.kind === 'play') n[m.gm.outcome]++;
  return n;
}
