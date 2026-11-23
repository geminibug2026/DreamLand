// 장기기억 — 인물 보기 · 이름 정리의 집계 (화면이 읽기만 하는 순수 함수. 서고를 고치지 않는다)
// 엔진과 같은 이름 접기 규칙(ekey)을 쓰되 엔진을 끌어오지 않는다 — node 로 바로 돌려 볼 수 있게
import type { Bond, BondStep, CastCard, Item, Mem, MemDim, MemItem, Pledge, StatusRow, Tracker } from './types';

/** 이름 견주기용 열쇠 — 대소문자 · 띄어쓰기 · 점 · 따옴표를 무시한다 (엔진의 ekey 와 같다) */
export const nameKey = (s: unknown): string => String(s || '').toLowerCase().replace(/[\s._\-'"`]+/g, '').trim();
const isScene = (n: unknown) => nameKey(n) === 'scene';
const splitNames = (v: unknown) => String(v || '').split(/[,，、·]+/).map(s => s.trim()).filter(Boolean);

/** 별칭으로 적힌 이름을 인물 카드의 이름으로 (카드가 없으면 그대로) */
export function canonOf(mem: Mem, name: unknown): string {
  const raw = String(name || '').trim(), k = nameKey(raw); if (!k) return raw;
  const c = mem.cast.find(x => nameKey(x.name) === k || (x.aka || []).some(a => nameKey(a) === k));
  return c ? c.name : raw;
}
/** 지금 장면에 있는 사람들 (정식 이름의 열쇠). 상태 보드의 scene.present 가 먼저, 없으면 마지막으로 적힌 턴의 present */
export function presentKeys(mem: Mem): Set<string> {
  let names: string[] = [];
  for (let i = mem.status.length - 1; i >= 0; i--) { const s = mem.status[i]; if (isScene(s.entity) && String(s.slot || '').toLowerCase() === 'present' && s.expired == null) { names = splitNames(s.value); break; } }
  if (!names.length) for (let i = mem.turns.length - 1; i >= 0 && i > mem.turns.length - 6; i--) if (mem.turns[i].present?.length) { names = mem.turns[i].present!; break; }
  return new Set(names.map(n => nameKey(canonOf(mem, n))).filter(Boolean));
}
/** 글 안에 그 이름이 나오는가 — 로마자는 낱말 경계를 본다 (Ann 이 Anna 에 걸리지 않게), 한 글자 이름은 보지 않는다 */
export function mentions(text: unknown, names: string[]): boolean {
  const src = String(text || '').toLowerCase(); if (!src) return false;
  for (const n of names) {
    const w = String(n || '').trim().toLowerCase(); if (w.length < 2) continue;
    let at = src.indexOf(w);
    while (at >= 0) {
      if (!/^[a-z0-9]+$/.test(w)) return true;
      const before = src[at - 1] || ' ', after = src[at + w.length] || ' ';
      if (!/[a-z0-9]/.test(before) && !/[a-z0-9]/.test(after)) return true;
      at = src.indexOf(w, at + 1);
    }
  }
  return false;
}

// ════════ 인물 목록 ════════
export interface PersonRow {
  /** 정식 이름 (카드가 없으면 기록에 적힌 그대로) */
  name: string; card: CastCard | null; here: boolean;
  /** 이 사람이 든 기억 · 낀 관계선의 수 */
  memories: number; bonds: number;
  /** 마지막으로 손댄 턴 (정렬용) */
  at: number;
}
/** 카드는 없는데 사람 자리에 적힌 이름들 — 상태 보드의 주인 · 관계선의 양 끝 · 기억의 주인과 아는 사람 · 턴의 자리에 있던 사람 */
export function strayPeople(mem: Mem): string[] {
  const known = new Set(mem.cast.flatMap(c => [c.name, ...(c.aka || [])]).map(nameKey)), out = new Map<string, string>();
  const add = (n: unknown) => { const s = String(n || '').trim(), k = nameKey(s); if (k && !isScene(s) && !known.has(k) && !out.has(k) && s.length <= 60) out.set(k, s); };
  for (const s of mem.status) { add(s.entity); if (s.claim === 'belief') add(s.owner); }
  for (const b of mem.bonds || []) { add(b.from); add(b.to); }
  for (const m of mem.memories) { add(m.owner); for (const k of m.knowers || []) add(k); for (const k of m.guessers || []) add(k); }
  for (const t of mem.turns) for (const p of t.present || []) add(p);
  return [...out.values()];
}
/** 인물 목록 — 장면에 있는 사람이 먼저, 그다음 최근에 손댄 순. 카드 없는 이름은 맨 뒤 */
export function peopleList(mem: Mem): PersonRow[] {
  const here = presentKeys(mem), count = new Map<string, number>(), bonds = new Map<string, number>(), bump = (m: Map<string, number>, k: string) => m.set(k, (m.get(k) || 0) + 1);
  for (const m of mem.memories) for (const k of new Set((m.entities || []).map(e => nameKey(canonOf(mem, e))))) bump(count, k);
  for (const b of mem.bonds || []) { bump(bonds, nameKey(canonOf(mem, b.from))); bump(bonds, nameKey(canonOf(mem, b.to))); }
  const row = (name: string, card: CastCard | null): PersonRow => { const k = nameKey(name); return { name, card, here: here.has(k), memories: count.get(k) || 0, bonds: bonds.get(k) || 0, at: card?.updated ?? card?.first ?? -1 }; };
  const rows = [...mem.cast.map(c => row(c.name, c)), ...strayPeople(mem).map(n => row(n, null))];
  return rows.sort((a, b) => +!a.card - +!b.card || +b.here - +a.here || +!!a.card?.disabled - +!!b.card?.disabled || b.at - a.at || b.memories - a.memories || a.name.localeCompare(b.name));
}
/** 목록 검색 — 이름 · 다른 이름 · 역할 · 직업 */
export function matchPerson(p: PersonRow, query: string): boolean {
  const words = String(query || '').normalize('NFKC').toLowerCase().split(/\s+/).filter(Boolean); if (!words.length) return true;
  const hay = [p.name, ...(p.card?.aka || []), p.card?.role, p.card?.occupation].filter(Boolean).join(' ').normalize('NFKC').toLowerCase();
  return words.every(w => hay.includes(w));
}

// ════════ 한 사람의 모든 것 ════════
export type NowKind = 'location' | 'activity' | 'outfit' | 'injury' | 'mood' | 'other';
const NOW_SLOTS: Record<string, NowKind> = {
  location: 'location', place: 'location', whereabouts: 'location', position: 'location',
  activity: 'activity', doing: 'activity', action: 'activity', task: 'activity', posture: 'activity',
  outfit: 'outfit', clothing: 'outfit', clothes: 'outfit', attire: 'outfit', dress: 'outfit',
  injury: 'injury', injuries: 'injury', wound: 'injury', wounds: 'injury', condition: 'injury', health: 'injury', physical_state: 'injury',
  mood: 'mood', emotion: 'mood', emotions: 'mood', feeling: 'mood', feelings: 'mood',
};
export const NOW_ORDER: NowKind[] = ['location', 'activity', 'outfit', 'injury', 'mood', 'other'];
export const nowKind = (slot: unknown): NowKind => NOW_SLOTS[String(slot || '').trim().toLowerCase().replace(/[\s-]+/g, '_')] || 'other';

export interface PersonBond { bond: Bond; dir: 'out' | 'in'; other: string; step: BondStep }
/** 엔진의 인물 모아 보기(Memory.personView)가 돌려주는 것 가운데 여기서 쓰는 칸 — 꼴만 맞으면 된다 */
export interface PersonBase {
  name: string; card: CastCard | null; states: StatusRow[]; bondsOut: Bond[]; bondsIn: Bond[];
  memories: MemItem[]; own: MemItem[]; knows: MemItem[]; suspects: MemItem[]; dim: MemItem[]; pledges: Pledge[];
  trackers: { tracker: Tracker; text: string }[];
}
/** 인물 한 장 — 엔진이 모아 준 것(base)에 화면만 쓰는 집계를 보탠다 */
export interface PersonPage {
  base: PersonBase;
  /** 이 사람을 가리키는 모든 표기 (정식 이름 + 다른 이름) */
  names: string[]; here: boolean;
  /** 지금 모습 — 위치 · 하는 일 · 옷차림 · 다친 곳 · 기분 순, 그 밖의 칸은 뒤에 */
  now: { kind: NowKind; row: StatusRow }[];
  /** 관계 — 같은 상대끼리 붙여서, 최근에 움직인 관계가 위 */
  bonds: PersonBond[];
  /** 흐릿한 기억: 기억 id → 남은 정도 */
  dimOf: Map<string, MemDim>;
  /** 그 자리에 없었던 일 — 본 사람이 적힌 공개 사건 가운데 이 사람이 없던 것 (이 사람에 관한 일이 먼저) */
  absent: MemItem[];
  /** 모르는 일 — 다른 사람들만 아는 비공개 기억 (이 사람에 관한 일이 먼저) */
  unaware: MemItem[];
  /** 끝난 약속 (엔진은 살아 있는 것만 준다 — 접어서 보여 준다) */
  resolved: Pledge[];
  items: Item[];
  /** 함께한 장면 — 이 사람이 든 기억, 최근 것부터 */
  scenes: MemItem[];
}
const SCENES_MAX = 10;
const byTurnDesc = (a: MemItem, b: MemItem) => (b.turn ?? -1) - (a.turn ?? -1) || (b.ts || 0) - (a.ts || 0);

export function personPage(mem: Mem, base: PersonBase): PersonPage {
  const names = [...new Set([base.name, ...(base.card?.aka || [])].filter(Boolean))], keys = new Set(names.map(nameKey)), is = (n: unknown) => !!n && keys.has(nameKey(n)), has = (xs?: string[]) => (xs || []).some(is);

  const now = base.states.filter(s => !isScene(s.entity)).map(row => ({ kind: nowKind(row.slot), row }))
    .sort((a, b) => NOW_ORDER.indexOf(a.kind) - NOW_ORDER.indexOf(b.kind) || +(a.row.claim === 'belief') - +(b.row.claim === 'belief') || (b.row.turn || 0) - (a.row.turn || 0));

  const bonds: PersonBond[] = [];
  for (const [list, dir] of [[base.bondsOut, 'out'], [base.bondsIn, 'in']] as const) for (const b of list) { const step = b.log?.[b.log.length - 1]; if (step) bonds.push({ bond: b, dir, other: dir === 'out' ? b.to : b.from, step }); }
  const recent = new Map<string, number>(); for (const x of bonds) recent.set(nameKey(x.other), Math.max(recent.get(nameKey(x.other)) || 0, x.step.turn || 0));
  bonds.sort((a, b) => (recent.get(nameKey(b.other)) || 0) - (recent.get(nameKey(a.other)) || 0) || nameKey(a.other).localeCompare(nameKey(b.other)) || +(a.dir === 'in') - +(b.dir === 'in'));

  const dimOf = new Map<string, MemDim>(); for (const m of base.dim) { const d = (m.dim || []).find(x => is(x.who)); if (d) dimOf.set(m.id, d); }
  const about = (m: MemItem) => +has(m.entities), aboutFirst = (a: MemItem, b: MemItem) => about(b) - about(a) || byTurnDesc(a, b);
  const live = mem.memories.filter(m => !m.disabled && !(m.tags || []).includes('episode_raw'));
  const absent = live.filter(m => (m.visibility || 'public') === 'public' && (m.witnesses || []).length > 0 && !has(m.witnesses)).sort(aboutFirst);
  const unaware = live.filter(m => (m.visibility || 'public') !== 'public' && !is(m.owner) && !has(m.knowers) && !has(m.guessers)).sort(aboutFirst);

  const resolved = mem.pledges.filter(p => p.status === 'resolved' && (is(p.owner) || mentions(`${p.summary} ${p.latest?.text || ''}`, names)));
  const items = mem.items.filter(it => mentions(it.holder, names)).sort((a, b) => +(a.dormant != null) - +(b.dormant != null) || (b.updated ?? b.turn ?? 0) - (a.updated ?? a.turn ?? 0));
  const scenes = mem.memories.filter(m => has(m.entities)).sort(byTurnDesc).slice(0, SCENES_MAX);
  return { base, names, here: presentKeys(mem).has(nameKey(base.name)), now, bonds, dimOf, absent, unaware, resolved, items, scenes };
}

// ════════ 이름 정리 ════════
const HANGUL = /[\uac00-\ud7a3]/;
/** 한 이름이 다른 이름에 통째로 들어 있는가 (성+이름 ↔ 이름, 이름+호칭 ↔ 이름). 낱말로 떨어지거나, 붙여 쓴 한글이면 앞의 성(1~2자)만 다를 때 */
export function nameInside(a: unknown, b: unknown): boolean {
  const A = String(a || '').trim(), B = String(b || '').trim(), ka = nameKey(A), kb = nameKey(B);
  if (!ka || !kb || ka === kb) return false;
  const [long, short, ks, kl] = ka.length >= kb.length ? [A, B, kb, ka] : [B, A, ka, kb];
  if (ks.length < 2) return false;
  if (long.split(/[\s·\-_.]+/).some(tok => nameKey(tok) === ks)) return true;
  return HANGUL.test(short) && !/\s/.test(long) && kl.endsWith(ks) && kl.length - ks.length <= 2;
}

export type SuggestWhy = 'aka' | 'sound' | 'part';
export interface NameSuggestion { a: string; b: string; why: SuggestWhy; key: string; aCard: boolean; bCard: boolean }
/** 두 이름의 짝 열쇠 — 순서와 표기 차이에 흔들리지 않는다 */
export const pairKey = (a: unknown, b: unknown): string => [nameKey(a), nameKey(b)].sort().join('|');
const SUGGEST_MAX = 40;
/**
 * "같은 사람일 수 있음" 제안. 제안만 한다 — 합치는 것은 사람이 고른다.
 * 견주는 것: 인물 카드끼리, 카드와 카드 없는 이름(상태 · 관계 · 아는 사람 · 기억에 든 이름). 카드 없는 이름끼리는 사람 자리에 적힌 것만.
 * mem.nameApart 에 적힌 짝("다른 사람")은 다시 내지 않는다.
 * sameSound: 한글 ↔ 로마자 표기가 같은 이름으로 읽히는가 (craft.ts 의 crossScriptSame 을 넘긴다 — 이 파일은 화면 · 번역 모듈을 끌어오지 않는다)
 */
export function nameSuggestions(mem: Mem, sameSound: (a: string, b: string) => boolean = () => false): NameSuggestion[] {
  const apart = new Set(mem.nameApart || []), out: NameSuggestion[] = [], seen = new Set<string>();
  const cards = mem.cast.map(c => ({ name: c.name, all: [c.name, ...(c.aka || [])].filter(Boolean), card: true, person: true }));
  const known = new Set(cards.flatMap(c => c.all).map(nameKey)), people = strayPeople(mem), peopleKeys = new Set(people.map(nameKey));
  const things = [...new Map(mem.memories.flatMap(m => m.entities || []).map(e => [nameKey(e), String(e).trim()] as const)).entries()].filter(([k, e]) => k && !known.has(k) && !peopleKeys.has(k) && k !== 'scene' && e.length <= 40).map(([, e]) => e);
  const ids = [...cards, ...people.map(n => ({ name: n, all: [n], card: false, person: true })), ...things.map(n => ({ name: n, all: [n], card: false, person: false }))];
  const push = (x: typeof ids[number], y: typeof ids[number], why: SuggestWhy) => {
    const key = pairKey(x.name, y.name); if (seen.has(key) || apart.has(key)) return;
    seen.add(key); out.push({ a: x.name, b: y.name, why, key, aCard: x.card, bCard: y.card });
  };
  for (let i = 0; i < ids.length; i++) for (let j = i + 1; j < ids.length; j++) {
    const x = ids[i], y = ids[j];
    if (!x.card && !y.card && !(x.person && y.person)) continue;   // 사물 이름끼리 · 사물과 떠도는 이름은 견주지 않는다
    if (x.card && y.card && x.all.some(n => y.all.some(m => nameKey(n) === nameKey(m)))) { push(x, y, 'aka'); continue; }
    if (x.all.some(n => y.all.some(m => sameSound(n, m)))) { push(x, y, 'sound'); continue; }
    if ((x.person && y.person) && x.all.some(n => y.all.some(m => nameInside(n, m)))) push(x, y, 'part');
  }
  const order: Record<SuggestWhy, number> = { aka: 0, sound: 1, part: 2 };
  return out.sort((a, b) => order[a.why] - order[b.why] || +b.aCard + +b.bCard - (+a.aCard + +a.bCard)).slice(0, SUGGEST_MAX);
}

export interface MergePlan {
  /** 남길 카드 (없으면 대표 이름으로 새로 만든다) */
  keep: CastCard | null;
  /** 남길 카드의 이름을 대표 이름으로 바꿔야 하는가 (옛 이름은 다른 이름으로 간다) */
  rename: boolean;
  /** 남길 카드로 접을 다른 카드들 */
  cards: CastCard[];
  /** 다른 이름으로 달 표기 (카드 없는 이름들) */
  aliases: string[];
}
/** 고른 이름들을 대표 이름 하나로 합치는 순서를 짠다 (고치지는 않는다). 대표 이름을 가진 카드가 남고, 없으면 고른 것 가운데 첫 카드가 그 이름을 받는다 */
export function planMerge(mem: Mem, names: string[], rep: string): MergePlan {
  const picked = [...new Map(names.map(n => [nameKey(n), String(n).trim()] as const)).entries()].filter(([k]) => k);
  const cardOf = (k: string) => mem.cast.find(c => nameKey(c.name) === k || (c.aka || []).some(a => nameKey(a) === k)) || null;
  const cards = [...new Set(picked.map(([k]) => cardOf(k)).filter((c): c is CastCard => !!c))];
  const keep = cardOf(nameKey(rep)) || cards[0] || null, taken = new Set(cards.flatMap(c => [c.name, ...(c.aka || [])]).map(nameKey));
  return { keep, rename: !!keep && nameKey(keep.name) !== nameKey(rep), cards: cards.filter(c => c !== keep), aliases: picked.filter(([k]) => !taken.has(k) && k !== nameKey(rep)).map(([, n]) => n) };
}
