// 게임 시트 ↔ 상태 변수(MVU) 잇기. 어떤 시트 칸이 stat_data 의 어느 경로와 같은 값인지 적어 두고 (대화마다, 게임 설정 g.vars 에),
// (1) 시트를 만들 때 이어 둔 칸은 가장 최근 메시지 변수에서 읽어 덮는다 — 이어 둔 값은 변수가 진짜다 (답변 후보마다 따로 저장되므로 다시 받기 · 되감기 · 갈래와도 맞는다)
// (2) 앱이 계산한 게임 일(전투 피해 · 회복 · 물건 · 돈 · 경험치 · 레벨 · 이동 · 시간 · 날씨 · 동료 · 사이)은 변수 갱신 명령(_.add · _.set · _.insert · _.remove)으로 바꾼다.
//     명령은 변수 갱신 틀의 같은 길(updateVariables)로 들어가므로 카드의 규칙 스크립트(zod 범위 맞추기) · 이벤트 · 상태창이 그대로 따라온다.
//
// 겹침 규칙 (하나뿐): 진행자의 한 답변 안에서 이어 둔 값을 게임 표시([hp -3] · [gold +10] · [item +…] · [place …])와 변수 명령(_.set('주인공.체력', …))으로
// 둘 다 바꾸면, 변수 명령만 쓰고 그 값에 대한 게임 표시는 버린다 — 그 경로나 그 안쪽 · 바깥쪽을 건드린 명령이 하나라도 있으면 그 칸 전체를 진행자에게 맡긴다.
// 다른 칸의 표시는 그대로 명령으로 바뀐다. 앱이 직접 만든 일(전투 · 판정 · 미니게임 기록, 시트에서 손으로 고친 값)은 진행자의 명령과 겹칠 수 없으므로 언제나 명령으로 적는다.
// 화면 · 모델 · 무거운 변수 모듈을 모르는 순수한 계산만 둔다.
import type { Msg } from '../lib/types';
import { varsOf } from '../chat/msgVars';
import { get, isPlainObject, toPath } from '../mvu/lo';
import type { RuleId, Sheet, StatKey } from './state';

export type LinkKey = 'hp' | 'hpMax' | 'mp' | 'mpMax' | 'gold' | 'xp' | 'level' | 'items' | 'place' | 'time' | 'weather' | 'party' | `stat.${StatKey}` | `bond.${string}`;
export interface VarLink { key: LinkKey; path: string }
/** 대화마다의 잇기 설정. 있으면 사용자가 한 번 정한 것이다 (links 가 비어 있으면 "잇지 않기"를 고른 것) */
export interface VarCfg { links: VarLink[]; /** 게임 화면에 함께 보일 값 (경로) */ show?: string[] }
export const FIELDS: LinkKey[] = ['hp', 'hpMax', 'mp', 'mpMax', 'gold', 'xp', 'level', 'items', 'place', 'time', 'weather', 'party'];
const ALL_STATS: StatKey[] = ['str', 'dex', 'con', 'int', 'wis', 'cha'];

type Obj = Record<string, unknown>;
/** [값, "설명"] 꼴 (값이 객체가 아닌 것) */
const isVwd = (v: unknown): v is [unknown, string] => Array.isArray(v) && v.length === 2 && typeof v[1] === 'string' && (v[0] === null || typeof v[0] !== 'object');
/** 값만 꺼낸다 ([값, "설명"] 이면 값) */
export const unwrap = (v: unknown, listy = false) => isVwd(v) && !(listy && typeof v[0] === 'string') ? v[0] : v;
const numOf = (v: unknown): number | undefined => { const x = unwrap(v); if (typeof x === 'number' && isFinite(x)) return x; if (typeof x === 'string' && /^\s*[+-]?\d+(\.\d+)?\s*$/.test(x)) return Number(x); return undefined; };
const strOf = (v: unknown): string | undefined => { const x = unwrap(v); return typeof x === 'string' ? x.trim() : typeof x === 'number' ? String(x) : undefined; };
/** 날짜로 읽히는 글 (변수 갱신 틀의 _.add 가 밀리초를 더해 주는 것) */
export const isDateText = (v: unknown) => { const x = unwrap(v); return typeof x === 'string' && isNaN(Number(x)) && /\d{4}-\d{2}-\d{2}/.test(x) && !isNaN(new Date(x).getTime()); };

// ── 경로 ──
const PLAIN = /^[^.[\]'"\s]+$/;
/** 칸 이름들을 lodash 경로 글로 ('주인공.체력' · '행낭["낡은 칼"]') */
export const pathOf = (segs: string[]) => segs.map((s, i) => PLAIN.test(s) ? (i ? '.' : '') + s : `["${s.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"]`).join('');
export const segsOf = (path: string) => toPath(path);
/** 한쪽이 다른 쪽의 앞부분인가 (같은 칸 · 그 안쪽 · 그 바깥쪽) */
export const overlaps = (a: string[], b: string[]) => { const n = Math.min(a.length, b.length); for (let i = 0; i < n; i++) if (a[i] !== b[i]) return false; return true; };

// ── stat_data 의 칸들 ──
export interface Leaf { path: string; segs: string[]; name: string; v: unknown; kind: 'num' | 'str' | 'bool' | 'list' | 'obj'; vwd: boolean }
/** 고를 수 있는 칸들 ($ 로 시작하는 칸은 뺀다). 객체는 자신도 하나의 칸(소지품 · 동료 묶음)이고 안쪽으로도 들어간다. 배열은 안으로 들어가지 않는다 */
export function leavesOf(stat: unknown, max = 400): Leaf[] {
  const out: Leaf[] = [];
  const walk = (o: Obj, segs: string[], depth: number) => {
    for (const k of Object.keys(o)) {
      if (out.length >= max) return;
      if (k.startsWith('$')) continue;
      const raw = o[k], s = [...segs, k], listy = LIST_NAME.test(norm(k)), v = unwrap(raw, listy), vwd = v !== raw, path = pathOf(s);
      if (isPlainObject(v)) { out.push({ path, segs: s, name: k, v, kind: 'obj', vwd }); if (depth < 6) walk(v, s, depth + 1); }
      else if (Array.isArray(v)) out.push({ path, segs: s, name: k, v, kind: 'list', vwd });
      else if (typeof v === 'number') out.push({ path, segs: s, name: k, v, kind: 'num', vwd });
      else if (typeof v === 'string') out.push({ path, segs: s, name: k, v, kind: /^\s*[+-]?\d+(\.\d+)?\s*$/.test(v) ? 'num' : 'str', vwd });
      else if (typeof v === 'boolean') out.push({ path, segs: s, name: k, v, kind: 'bool', vwd });
    }
  };
  if (isPlainObject(stat)) walk(stat, [], 0);
  return out;
}
/** 칸에 맞는 값의 꼴 */
export const kindsFor = (key: LinkKey): Leaf['kind'][] => key === 'items' || key === 'party' ? ['list', 'obj'] : key === 'place' || key === 'weather' ? ['str'] : key === 'time' ? ['str', 'num'] : key === 'level' ? ['num', 'str'] : ['num'];

// ── 이름으로 짐작하기 (한국어 · 영어 · 중국어) ──
const norm = (s: string) => s.toLowerCase().replace(/[\s_\-·.()（）[\]【】]/g, '');
const MAX = /최대|최댓값|상한|한계|max|maximum|上限|最大|满值/;
const CUR = /^(현재|지금|현|값|cur|current|now|value|val|当前|现|当前值|数值|值)$/;
const MAXK = /^(최대|최대치|최댓값|상한|max|maximum|上限|最大|最大值)$/;
const W: Record<string, RegExp> = {
  hp: /체력|생명|기혈|혈량|^hp$|^hp|hp$|health|^life$|lifepoint|vitality|血量|生命|气血|体力|血/,
  mp: /내공|내력|마나|마력|기력|진기|영력|법력|정신력|^mp$|^mp|mp$|^sp$|mana|energy|stamina|内力|内功|法力|灵力|真气|魔力|精力|蓝/,
  gold: /은량|은자|금화|은화|동전|골드|돈|재화|자금|소지금|재산|^gold$|gold|money|coin|cash|currency|funds|wealth|silver|银两|银子|金钱|金币|钱|灵石|货币|铜钱|财产/,
  xp: /경험치|경험|^exp$|^xp$|experience|修为|经验/,
  level: /레벨|경지|등급|단계|^lv$|^lvl$|level|rank|realm|tier|等级|境界|级别|修为境界/,
  items: /소지품|행낭|인벤토리|가방|물품|아이템|소지|inventory|items|^bag$|belongings|backpack|背包|物品|道具|行囊|持有物|随身物品|储物/,
  place: /위치|장소|지역|현재지|^곳$|있는곳|location|place|area|^where$|position|region|地点|位置|所在地|所在|当前位置|地区|场所/,
  time: /시간|시각|날짜|일시|^time$|clock|date|datetime|时间|日期|时刻|当前时间/,
  weather: /날씨|기상|weather|天气|气象/,
  party: /동료|일행|파티|동행|party|companion|ally|allies|team|^crew$|队友|同伴|队伍|伙伴|随从/,
  bond: /호감|호감도|애정|신뢰|친밀|affection|favor|favour|fondness|trust|intimacy|好感|好感度|信赖|亲密|爱意/,
};
const STAT_W: Record<StatKey, RegExp> = {
  str: /^(힘|근력|완력|괴력|str|strength|力量|膂力|臂力|力)$/, dex: /^(민첩|민첩성|신법|경공|dex|dexterity|agi|agility|敏捷|身法|轻功)$/,
  con: /^(체질|건강|골격|근골|con|constitution|体质|根骨|体魄)$/, int: /^(지능|지력|오성|깨달음|int|intelligence|智力|悟性|智慧)$/,
  wis: /^(지혜|감지|통찰|의지|wis|wisdom|感知|意志|洞察)$/, cha: /^(매력|카리스마|cha|charisma|魅力|容貌|颜值)$/,
};
const LIST_NAME = new RegExp(`${W.items.source}|${W.party.source}`);
const HERO = /^(주인공|플레이어|유저|나|내캐릭터|player|user|hero|protagonist|me|pc|主角|玩家|用户|我|主人公)$/;
const NPC = /^(npc|npcs|인물|등장인물|캐릭터|characters|角色|人物|配角)$/;
/** 경로의 점수: 주인공 쪽이 앞서고, 얕을수록 앞선다 */
const score = (l: Leaf, user = '') => (l.segs.slice(0, -1).some(s => HERO.test(norm(s)) || (!!user && norm(s) === norm(user))) ? 10 : 0) - (l.segs.slice(0, -1).some(s => NPC.test(norm(s))) ? 6 : 0) - l.segs.length;
const best = (ls: Leaf[], user: string) => ls.length ? ls.reduce((a, b) => score(b, user) > score(a, user) ? b : a) : undefined;

/** stat_data 를 보고 이을 칸을 추천한다 (stats: 이 규칙서가 쓰는 능력치, user: 내 이름 — 그 이름 아래의 칸을 주인공으로 친다) */
export function suggest(stat: unknown, stats: StatKey[] = ALL_STATS, user = ''): VarLink[] {
  const ls = leavesOf(stat), out: VarLink[] = [], used = new Set<string>();
  const take = (key: LinkKey, l: Leaf | undefined) => { if (l && !used.has(l.path)) { out.push({ key, path: l.path }); used.add(l.path); } };
  const parentName = (l: Leaf) => norm(l.segs[l.segs.length - 2] || '');
  // 체력 · 기력: "체력: 80" 과 "최대체력: 100" 따로, 또는 "체력: { 현재: 80, 최대: 100 }"
  for (const [cur, max] of [['hp', 'hpMax'], ['mp', 'mpMax']] as const) {
    const re = W[cur], nums = ls.filter(l => l.kind === 'num'), ok = (n: string) => re.test(n) && !(cur === 'mp' && W.hp.test(n));
    const plain = nums.filter(l => ok(norm(l.name)) && !MAX.test(norm(l.name)));
    const inner = nums.filter(l => CUR.test(norm(l.name)) && ok(parentName(l)));
    const pick = best(inner.length ? inner : plain, user);
    take(cur, pick);
    if (pick) {
      const sib = (l: Leaf) => overlaps(l.segs.slice(0, -1), pick.segs.slice(0, -1)) && l.segs.length === pick.segs.length;
      const mx = inner.includes(pick) ? nums.find(l => sib(l) && MAXK.test(norm(l.name))) : nums.find(l => sib(l) && MAX.test(norm(l.name)) && re.test(norm(l.name)));
      take(max, mx);
    }
  }
  const pickBy = (key: LinkKey, re: RegExp, kinds: Leaf['kind'][], not?: RegExp) => take(key, best(ls.filter(l => kinds.includes(l.kind) && re.test(norm(l.name)) && !MAX.test(norm(l.name)) && !(not && not.test(norm(l.name))) && !used.has(l.path)), user));
  pickBy('gold', W.gold, ['num']);
  pickBy('xp', W.xp, ['num'], W.level);
  pickBy('level', W.level, ['num', 'str']);
  pickBy('items', W.items, ['list', 'obj']);
  pickBy('place', W.place, ['str']);
  pickBy('time', W.time, ['str']);
  pickBy('weather', W.weather, ['str']);
  pickBy('party', W.party, ['list', 'obj']);
  for (const k of stats) take(`stat.${k}`, best(ls.filter(l => l.kind === 'num' && STAT_W[k].test(norm(l.name)) && !used.has(l.path)), user));
  // 사이: "리아: { 호감도: 30 }" (이름 = 윗칸) 또는 "호감도: { 리아: 30 }" (이름 = 칸)
  const bonds = new Map<string, string>();
  for (const l of ls) {
    if (l.kind !== 'num' || bonds.size >= 6) continue;
    const n = norm(l.name), up = l.segs[l.segs.length - 2] || '';
    const who = W.bond.test(n) ? up : W.bond.test(norm(up)) ? l.name : '';
    if (!who || HERO.test(norm(who)) || NPC.test(norm(who)) || W.bond.test(norm(who)) || (user && norm(who) === norm(user)) || used.has(l.path)) continue;
    if (!bonds.has(who.toLowerCase())) { bonds.set(who.toLowerCase(), l.path); out.push({ key: `bond.${who.trim()}`, path: l.path }); used.add(l.path); }
  }
  return out;
}

// ── 이어 둔 값 읽기 ──
export interface VarRead { hp?: number; hpMax?: number; mp?: number; mpMax?: number; gold?: number; xp?: number; level?: number; levelText?: string; items?: { name: string; n: number }[]; place?: string; time?: string; weather?: string; party?: string[]; stats: Partial<Record<StatKey, number>>; bonds: { name: string; v: number }[] }
const NAME_K = /^(이름|명칭|품명|name|title|名称|名字|名|物品名)$/i, COUNT_K = /^(수량|개수|갯수|count|qty|quantity|num|amount|n|数量|数目|个数)$/i;
const keyLike = (o: Obj, re: RegExp) => Object.keys(o).find(k => re.test(k.trim()));
/** 소지품 묶음을 { 이름, 개수 } 들로: 배열(글 · {이름, 수량}) 또는 객체(이름 → 개수 · [개수, 설명] · 설명 글 · {수량 …}) */
export function itemsOf(v: unknown): { name: string; n: number }[] {
  const out: { name: string; n: number }[] = [], add = (name: string, n: number) => { const nm = name.trim(); if (!nm || n <= 0) return; const it = out.find(x => x.name.toLowerCase() === nm.toLowerCase()); if (it) it.n += n; else out.push({ name: nm.slice(0, 60), n }); };
  const cnt = (x: unknown): number => { const n = numOf(x); if (n !== undefined) return Math.max(0, Math.floor(n)); if (isPlainObject(x)) { const k = keyLike(x, COUNT_K); const m = k ? numOf(x[k]) : undefined; return m === undefined ? 1 : Math.max(0, Math.floor(m)); } return 1; };
  const val = unwrap(v, true);
  if (Array.isArray(val)) for (const x of val) {
    if (typeof x === 'string') { if (x !== '$__META_EXTENSIBLE__$') add(x, 1); }
    else if (isVwd(x) && typeof x[0] === 'string') add(x[0], 1);
    else if (isPlainObject(x)) { const k = keyLike(x, NAME_K); if (k && typeof x[k] === 'string') add(x[k] as string, cnt(x)); }
  }
  else if (isPlainObject(val)) for (const k of Object.keys(val)) { if (!k.startsWith('$')) add(k, cnt(val[k])); }
  return out;
}
const namesOf = (v: unknown) => itemsOf(v).map(x => x.name);
export const linkOf = (cfg: VarCfg | undefined, key: LinkKey) => cfg?.links.find(l => l.key === key);
/** 이어 둔 칸의 지금 값들 */
export function readLinks(stat: unknown, cfg: VarCfg): VarRead {
  const r: VarRead = { stats: {}, bonds: [] };
  for (const l of cfg.links) {
    const raw = get(stat, l.path); if (raw === undefined || raw === null) continue;
    const k = l.key;
    if (k === 'hp' || k === 'hpMax' || k === 'mp' || k === 'mpMax' || k === 'gold' || k === 'xp') { const n = numOf(raw); if (n !== undefined) r[k] = n; }
    else if (k === 'level') { const n = numOf(raw); if (n !== undefined) r.level = n; else { const s = strOf(raw); if (s) r.levelText = s.slice(0, 30); } }
    else if (k === 'items') r.items = itemsOf(raw);
    else if (k === 'party') r.party = namesOf(raw);
    else if (k === 'place' || k === 'time' || k === 'weather') { const s = strOf(raw); if (s) r[k] = s.slice(0, 60); }
    else if (k.startsWith('stat.')) { const n = numOf(raw); if (n !== undefined) r.stats[k.slice(5) as StatKey] = n; }
    else if (k.startsWith('bond.')) { const n = numOf(raw); if (n !== undefined) r.bonds.push({ name: k.slice(5), v: n }); }
  }
  return r;
}
/** [0, end) 안에서 지금 고른 후보에 상태 변수가 있는 마지막 메시지의 stat_data */
export function latestStat(msgs: Msg[], end = msgs.length): Obj | null {
  for (let i = Math.min(end, msgs.length) - 1; i >= 0; i--) { const v = varsOf(msgs[i]); if (v && isPlainObject(v.stat_data)) return v.stat_data; }
  return null;
}

// ── 능력치: 변수의 값을 이 규칙서의 눈금으로 ──
export const RANGE: Record<RuleId, [number, number]> = { d20: [-2, 6], '5e': [3, 20], '2d6': [-1, 3], d100: [5, 95], pool: [1, 6] };
/** 규칙서의 눈금 안이면 그대로, 아니면 눈금을 짐작해 옮긴다 (3~30 은 능력치 점수, 100 까지는 백분율, 그 위는 천 점 만점으로) */
export function toRule(rule: RuleId, v: number): number {
  const [lo, hi] = RANGE[rule] || RANGE.d20, c = (n: number) => Math.min(hi, Math.max(lo, Math.round(n)));
  if (v >= lo && v <= hi) return Math.round(v);
  const m = v <= 30 ? Math.floor((v - 10) / 2) : v <= 100 ? Math.round((v - 50) / 10) : Math.round((Math.min(v, 1000) - 500) / 100);
  return c(rule === '5e' ? 10 + 2 * m : rule === '2d6' ? m / 2 : rule === 'd100' ? 50 + 10 * m : rule === 'pool' ? m + 2 : m);
}

// ── 시트에 덮기 (sheetOf 끝에서) ──
const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();
/** 이어 둔 값을 시트에 덮는다. spot: 지도에 장소를 두는 일 (state 의 것) */
export function overlay(s: Sheet, r: VarRead, rule: RuleId, cfg: VarCfg, spot: (s: Sheet, from: string, to: string) => void) {
  if (r.hpMax !== undefined) s.hpMax = Math.max(1, Math.round(r.hpMax));
  if (r.hp !== undefined) { s.hp = Math.max(0, Math.round(r.hp)); if (r.hpMax === undefined) s.hpMax = Math.max(s.hpMax, s.hp); else s.hp = Math.min(s.hp, s.hpMax); }
  if (r.gold !== undefined) s.gold = Math.max(0, Math.round(r.gold));
  if (r.xp !== undefined) s.xp = Math.max(0, Math.round(r.xp));
  if (r.level !== undefined) s.level = Math.max(1, Math.round(r.level));
  if (r.items) { const old = s.items; s.items = r.items.map(i => { const o = old.find(x => same(x.name, i.name)); return { ...i, ...(o?.hid ? { hid: o.hid, ...(o.known ? { known: true } : {}) } : {}) }; }); }
  if (r.place && !same(r.place, s.place)) spot(s, s.place, r.place);
  if (r.time) s.time = r.time;
  if (r.weather) { s.weather = r.weather; s.wx = ''; }
  if (r.party) s.party = r.party.slice(0, 3);
  for (const b of r.bonds) { const p = s.people.find(x => same(x.name, b.name)); const v = Math.min(100, Math.max(-100, Math.round(b.v))); if (p) p.v = v; else s.people.push({ name: b.name, v, marks: [] }); }
  const vs: Partial<Record<StatKey, number>> = {}, lab: Partial<Record<StatKey, string>> = {};
  for (const k of Object.keys(r.stats) as StatKey[]) { vs[k] = toRule(rule, r.stats[k]!); const l = linkOf(cfg, `stat.${k}`); if (l) lab[k] = `${tail(l.path)} ${r.stats[k]}`; }
  if (Object.keys(vs).length) { s.vstat = vs; s.vlab = lab; }
  if (r.levelText) s.vlevel = r.levelText;
  if (r.mp !== undefined) s.vmp = { name: tail(linkOf(cfg, 'mp')!.path), v: r.mp, ...(r.mpMax !== undefined ? { max: r.mpMax } : {}) };
}
/** 경로의 마지막 칸 이름 */
export const tail = (path: string) => { const s = segsOf(path); return s[s.length - 1] || path; };

/** 게임 화면에 함께 보일 값: 이름 · 글 · (숫자이고 옆에 최대값이 있으면) 막대 */
export interface Pin { path: string; name: string; text: string; v?: number; max?: number }
export function pinsOf(stat: unknown, cfg: VarCfg | undefined): Pin[] {
  if (!stat || !cfg?.show?.length) return [];
  const out: Pin[] = [];
  for (const path of cfg.show.slice(0, 4)) {
    const raw = get(stat, path); if (raw === undefined) continue;
    const v = unwrap(raw), segs = segsOf(path), name = segs[segs.length - 1] || path, n = numOf(v);
    let max: number | undefined;
    if (n !== undefined) { const up = segs.slice(0, -1), parent = up.length ? get(stat, pathOf(up)) : stat; if (isPlainObject(parent)) { const mk = Object.keys(parent).find(k => k !== name && ((MAXK.test(norm(k)) && CUR.test(norm(name))) || (MAX.test(norm(k)) && norm(k).includes(norm(name))))); if (mk) max = numOf(parent[mk]); } }
    const text = n !== undefined ? String(n) : Array.isArray(v) || isPlainObject(v) ? itemsOf(v).map(x => x.n > 1 ? `${x.name}×${x.n}` : x.name).join(', ') : String(v ?? '');
    out.push({ path, name, text: text.slice(0, 40), ...(n !== undefined ? { v: n } : {}), ...(max !== undefined && max > 0 ? { max } : {}) });
  }
  return out;
}
export const preview = (v: unknown) => { const x = unwrap(v); const s = Array.isArray(x) || isPlainObject(x) ? (itemsOf(x).map(i => i.n > 1 ? `${i.name}×${i.n}` : i.name).join(', ') || (Array.isArray(x) ? '[]' : '{}')) : String(x); return s.length > 28 ? s.slice(0, 27) + '…' : s; };

// ── 게임 일 → 변수 갱신 명령 ──
const q = (path: string) => `'${path}'`;
const J = (v: unknown) => JSON.stringify(v);
/** 명령을 적을 수 있는 경로인가 (작은따옴표가 든 경로는 명령 글을 깨뜨리므로 건너뛴다) */
const writable = (path: string) => !!path && !path.includes("'");
/** 앞 시트(before) → 뒤 시트(after) 의 차이를 이어 둔 칸의 명령으로. stat: 앞 상태의 stat_data (소지품 묶음의 꼴을 보려고). skip: 이 경로는 진행자가 이미 바꿨다 */
export function commandsFor(cfg: VarCfg, before: Sheet, after: Sheet, stat: unknown, o: { skip?: (segs: string[]) => boolean; why?: string } = {}): string {
  const out: string[] = [], why = o.why ? `//${o.why.replace(/\n/g, ' ')}` : '';
  const add = (p: string, n: number) => { if (n) out.push(`_.add(${q(p)}, ${n});${why}`); };
  const setv = (p: string, v: unknown) => out.push(`_.set(${q(p)}, ${J(v)});${why}`);
  for (const l of cfg.links) {
    if (!writable(l.path) || o.skip?.(segsOf(l.path))) continue;
    const k = l.key, cur = get(stat, l.path);
    if (cur === undefined) continue;
    // [값, "설명"] 이면 값 칸([0])에 적는다 — 변수 갱신 틀도, zod 카드 도우미도 그 칸을 바로 고친다 (설명은 그대로)
    const p = vp(l.path, cur);
    if (k === 'hp' || k === 'hpMax' || k === 'gold' || k === 'xp') { if (numOf(cur) !== undefined) add(p, Math.round(after[k] - before[k])); }
    else if (k === 'level') { if (numOf(cur) !== undefined) add(p, after.level - before.level); }
    else if (k === 'place') { if (after.place && !same(after.place, before.place) && typeof unwrap(cur) === 'string') setv(p, after.place); }
    else if (k === 'weather') { if (after.weather && after.weather !== before.weather && typeof unwrap(cur) === 'string') setv(p, after.weather); }
    else if (k === 'time') {
      // 날짜 꼴의 값은 흐른 시간만큼 더하고 (변수 갱신 틀이 날짜에 밀리초를 더한다), 글이면 진행자가 쓴 때를 그대로 적는다
      if (isDateText(cur)) add(p, (after.mins - before.mins) * 60000);
      else if (after.time && after.time !== before.time && typeof unwrap(cur) === 'string') setv(p, after.time);
    }
    else if (k === 'items') out.push(...itemCmds(l.path, cur, before.items, after.items, why));
    else if (k === 'party') out.push(...partyCmds(l.path, cur, before.party, after.party, why));
    else if (k.startsWith('bond.')) { const nm = k.slice(5), a = before.people.find(x => same(x.name, nm))?.v ?? 0, b = after.people.find(x => same(x.name, nm))?.v ?? 0; if (numOf(cur) !== undefined) add(p, b - a); }
  }
  return out.join('\n');
}
const vp = (path: string, raw: unknown) => isVwd(raw) ? path + '[0]' : path;
const child = (p: string, k: string) => p + (PLAIN.test(k) ? '.' + k : `["${k.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"]`);
/** 소지품의 차이 → 명령 (묶음의 꼴에 맞춰: 이름 → 개수 · [개수, 설명] · {수량} · 설명 글 / 글 배열 · {이름, 수량} 배열) */
function itemCmds(path: string, raw: unknown, was: { name: string; n: number }[], now: { name: string; n: number }[], why: string): string[] {
  const out: string[] = [], delta = new Map<string, { name: string; d: number }>();
  for (const i of now) delta.set(i.name.toLowerCase(), { name: i.name, d: i.n });
  for (const i of was) { const x = delta.get(i.name.toLowerCase()); if (x) x.d -= i.n; else delta.set(i.name.toLowerCase(), { name: i.name, d: -i.n }); }
  const base = isVwd(raw) ? path + '[0]' : path, c = unwrap(raw, true);
  for (const { name, d } of delta.values()) {
    if (!d || name.includes("'")) continue;
    if (isPlainObject(c)) {
      const key = Object.keys(c).find(k => same(k, name)), sib = Object.keys(c).filter(k => !k.startsWith('$')).map(k => c[k])[0];
      if (key !== undefined) {
        const v = c[key], n = numOf(v), cntK = isPlainObject(v) ? keyLike(v, COUNT_K) : undefined, have = n ?? (cntK ? numOf((v as Obj)[cntK]) ?? 1 : 1);
        if (have + d <= 0) out.push(`_.remove(${q(base)}, ${J(key)});${why}`);
        else if (n !== undefined) out.push(`_.add(${q(vp(child(base, key), v))}, ${d});${why}`);
        else if (cntK) out.push(`_.add(${q(child(child(base, key), cntK))}, ${d});${why}`);
      } else if (d > 0) {
        const shape = isVwd(sib) ? [d, ''] : typeof sib === 'number' ? d : typeof sib === 'string' ? (/^\s*\d+\s*$/.test(sib) ? String(d) : '') : isPlainObject(sib) ? (() => { const ck = keyLike(sib, COUNT_K); return ck ? { [ck]: d } : {}; })() : d;
        out.push(`_.insert(${q(base)}, ${J(name)}, ${J(shape)});${why}`);
      }
    } else if (Array.isArray(c)) {
      const objs = c.filter(isPlainObject) as Obj[], nk = objs.length ? keyLike(objs[0], NAME_K) : undefined;
      if (nk) {
        const at = c.findIndex(x => isPlainObject(x) && typeof x[nk] === 'string' && same(x[nk] as string, name)), it = at >= 0 ? c[at] as Obj : undefined, ck = it ? keyLike(it, COUNT_K) : keyLike(objs[0], COUNT_K), have = it ? (ck ? numOf(it[ck]) ?? 1 : 1) : 0;
        if (it && have + d <= 0) out.push(`_.remove(${q(base + `[${at}]`)});${why}`);
        else if (it && ck) out.push(`_.add(${q(child(base + `[${at}]`, ck))}, ${d});${why}`);
        else if (!it && d > 0) out.push(`_.insert(${q(base)}, ${J({ [nk]: name, ...(ck ? { [ck]: d } : {}) })});${why}`);
      } else {
        const exact = c.find(x => typeof x === 'string' && same(x, name)) as string | undefined;
        if (d > 0) for (let i = 0; i < Math.min(d, 20); i++) out.push(`_.insert(${q(base)}, ${J(exact || name)});${why}`);
        else if (exact) for (let i = 0; i < Math.min(-d, c.filter(x => typeof x === 'string' && same(x, name)).length); i++) out.push(`_.remove(${q(base)}, ${J(exact)});${why}`);
      }
    }
  }
  return out;
}
function partyCmds(path: string, raw: unknown, was: string[], now: string[], why: string): string[] {
  const out: string[] = [], base = isVwd(raw) ? path + '[0]' : path, c = unwrap(raw, true);
  const added = now.filter(n => !was.some(w => same(w, n))), gone = was.filter(w => !now.some(n => same(w, n)));
  for (const n of added) {
    if (n.includes("'")) continue;
    if (Array.isArray(c)) { if (!c.some(x => typeof x === 'string' && same(x, n))) out.push(`_.insert(${q(base)}, ${J(n)});${why}`); }
    else if (isPlainObject(c) && !Object.keys(c).some(k => same(k, n))) { const sib = Object.keys(c).filter(k => !k.startsWith('$')).map(k => c[k])[0]; out.push(`_.insert(${q(base)}, ${J(n)}, ${J(typeof sib === 'number' ? 0 : typeof sib === 'string' ? '' : {})});${why}`); }
  }
  for (const n of gone) {
    if (Array.isArray(c)) { const x = c.find(y => typeof y === 'string' && same(y, n)); if (x) out.push(`_.remove(${q(base)}, ${J(x)});${why}`); }
    else if (isPlainObject(c)) { const k = Object.keys(c).find(y => same(y, n)); if (k) out.push(`_.remove(${q(base)}, ${J(k)});${why}`); }
  }
  return out;
}

// ── 진행자에게 알리는 글 ──
const LABEL_EN: Record<string, string> = { hp: 'HP', hpMax: 'max HP', mp: 'energy', mpMax: 'max energy', gold: 'Gold', xp: 'XP', level: 'Level', items: 'Carrying', place: 'Place', time: 'Time', weather: 'Weather', party: 'Companions' };
const TAG_EN: Record<string, string> = { hp: '[hp ±N]', hpMax: '[maxhp ±N]', gold: '[gold ±N]', xp: '[xp +N]', items: '[item ±…]', place: '[place …]', time: '[time …] / [pass …]', weather: '[weather …]', party: '[party ±…]' };
/** 이어 둔 칸과 그 값을 짧게 (트리 전체가 아니다) · 겹침 규칙. stat 은 지금의 stat_data */
export function varsPrompt(cfg: VarCfg, stat: unknown, rule: RuleId): string {
  const rows: string[] = [], tags: string[] = [];
  for (const l of cfg.links) {
    const raw = get(stat, l.path); if (raw === undefined) continue;
    const k = l.key, v = preview(raw);
    if (k.startsWith('stat.')) { const n = numOf(raw); rows.push(`${k.slice(5).toUpperCase()} checks use ${l.path} (${v}${n !== undefined ? ` → ${['d20', '2d6'].includes(rule) ? (toRule(rule, n) >= 0 ? '+' : '') : ''}${toRule(rule, n)}` : ''})`); }
    else if (k.startsWith('bond.')) { rows.push(`${k.slice(5)}'s standing = ${l.path} (${v})`); tags.push(`[rep ${k.slice(5)} …]`); }
    else { rows.push(`${LABEL_EN[k] || k} = ${l.path} (${v})`); if (TAG_EN[k]) tags.push(TAG_EN[k]); }
  }
  if (!rows.length) return '';
  return `[Linked story variables — these game values and these variables are the same thing: ${rows.join(' · ')}.${tags.length ? ` For a change to one of them, the game tag alone is enough (${[...new Set(tags)].join(' ')}): the app writes the variable for you. If you also change one of these variables with a variable update command in the same reply, the app keeps your command and ignores the game tag for that value — so write only one of the two for any change.` : ''} Fights, checks and minigames the app runs already update these variables. Keep updating every other variable exactly as the variable rules ask, in their format.]`;
}
