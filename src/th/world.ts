// 로어북(월드 인포): Tavern Helper 의 worldbook · lorebook · lorebook_entry 함수.
// 드림랜드 로어북 ↔ 실리태번 원래 항목 꼴은 가져오기 · 내보내기와 같은 변환(cards.ts 의 loreToWorld · worldToLore)을 쓰고,
// 그 위에 Tavern Helper 가 하는 변환(WorldbookEntry · LorebookEntry)을 그대로 옮겨 왔다
import { S, newLore } from '../lib/core';
import { loreToWorld, worldToLore, type LoreBook } from '../lib/cards';
import type { Lore, LoreEntry } from '../lib/types';
import { t } from '../i18n';
import { type Ctx, type Obj, bookByName, bookName, chat, curChar, fail, findChar, isObj, mayDelete, remember, str, undoToast } from './util';

// ════════ 실리태번 원래 항목 꼴 ════════
const RX = /^\/([\w\W]+?)\/([gimsuy]*)$/;
/** 실리태번의 parseRegexFromString: "/…/플래그" 꼴만 정규식으로 */
export function parseRx(s: unknown): RegExp | null {
  const m = RX.exec(String(s)); if (!m) return null;
  let [, p] = m; const f = m[2];
  if (/(^|[^\\])\//.test(p)) return null;
  p = p.replace('\\/', '/');
  try { return new RegExp(p, f); } catch { return null; }
}
/** 항목마다의 uid: 남겨 둔 uid 가 있으면 그것, 없으면 책 안의 차례 (드림랜드 · 실리태번 내보내기와 같다) */
function uidsOf(b: Lore): number[] {
  const used = new Set<number>(), out = b.entries.map(e => { const u = e.uid; if (Number.isInteger(u) && (u as number) >= 0 && !used.has(u as number)) { used.add(u as number); return u as number; } return -1; });
  let next = 0;
  return out.map((u, i) => { if (u >= 0) return u; let c = i; if (used.has(c)) { while (used.has(next)) next++; c = next; } used.add(c); return c; });
}
const wrapKey = (k: string, cs: boolean) => !k || RX.test(k) ? k : `/${k}/${cs ? '' : 'i'}`;
/** 책 → 실리태번 원래 항목들 (uid · 보이는 차례가 붙은 것) */
function rawsOf(b: Lore): Obj[] {
  const w = loreToWorld(b as unknown as LoreBook).entries as Record<number, Obj>, uids = uidsOf(b);
  return b.entries.map((e, i) => {
    const r: Obj = { ...w[i], uid: uids[i], displayIndex: i };
    if (isObj(e.thExtra)) r.extra = structuredClone(e.thExtra);
    if (e.useRegex) { const cs = !!(e.caseSensitive ?? b.caseSensitive); r.key = (e.keys || []).map(k => wrapKey(String(k), cs)); r.keysecondary = (e.keys2 || []).map(k => wrapKey(String(k), cs)); }
    return r;
  });
}
/** 원래 항목 하나 → 드림랜드 항목 (가져오기와 같은 변환). 같은 uid 의 옛 항목이 있으면 드림랜드에만 있는 칸(id · 잠금 · 물음 · 메모)을 지킨다 */
function rawToEntry(raw: Obj, old?: LoreEntry): LoreEntry {
  // selective 은 드림랜드에서 쓰지 않는다 (상수 항목의 둘째 열쇠도 지킨다)
  const e = worldToLore({ entries: [{ ...raw, selective: true, displayIndex: undefined }] as never }).entries[0] as LoreEntry;
  if (old) {
    for (const k of ['id', 'locked', 'ask', 'askMode', 'description'] as const) if (old[k] !== undefined) (e as Obj)[k] = old[k];
    if (isObj(old.more)) e.more = { ...old.more, ...(isObj(e.more) ? e.more : {}) };
    if (old.useRegex) {   // 드림랜드의 "열쇠를 정규식으로" 항목: 감싸서 보였던 열쇠를 다시 벗긴다
      const un = (k: string) => { const m = /^\/([\s\S]+)\/(i?)$/.exec(k); return m ? m[1] : k; };
      e.keys = e.keys.map(un); e.keys2 = e.keys2.map(un); e.useRegex = true;
    }
  }
  e.uid = Number(raw.uid);
  if (isObj(raw.extra)) e.thExtra = structuredClone(raw.extra); else delete e.thExtra;   // 스크립트가 항목에 붙여 두는 칸 (Tavern Helper 의 extra)
  return e;
}
/** 원래 항목들로 책을 통째로 바꿔 저장한다 (고치기 전 사본은 되돌리기 장부에) */
async function writeRaws(b: Lore, raws: Obj[]) {
  const before = structuredClone(b), uids = uidsOf(b), old = new Map(uids.map((u, i) => [u, b.entries[i]]));
  const sorted = [...raws].sort((x, y) => (Number(x.displayIndex) || 0) - (Number(y.displayIndex) || 0));
  b.entries = sorted.map(r => rawToEntry(r, old.get(Number(r.uid))));
  await S.save('lore', b);
  await remember('lore', b.id, b.name, before as unknown as Obj);
}
const MAX_UID = 1_000_000;
/** 겹치는 uid 를 비켜 준다 (Tavern Helper 와 같은 방식) */
function freeUids<T extends { uid?: unknown }>(list: T[]): (T & { uid: number })[] {
  const set = new Set<number>();
  return list.map(x => {
    let u = Number.isInteger(x.uid) ? x.uid as number : Math.floor(Math.random() * MAX_UID), i = 1;
    while (set.has(u)) { u = (u + i * i) % MAX_UID; i++; }
    set.add(u); return { ...x, uid: u };
  });
}

// ════════ WorldbookEntry (새 꼴) ════════
const POS_T: Record<number, string> = { 0: 'before_character_definition', 1: 'after_character_definition', 5: 'before_example_messages', 6: 'after_example_messages', 2: 'before_author_note', 3: 'after_author_note', 4: 'at_depth', 7: 'outlet' };
const POS_N: Record<string, number> = Object.fromEntries(Object.entries(POS_T).map(([k, v]) => [v, +k]));
const LOGIC_T = ['and_any', 'not_all', 'not_any', 'and_all'], ROLES = ['system', 'user', 'assistant'];
const IMPLICIT: Obj = { addMemo: true, matchPersonaDescription: false, matchCharacterDescription: false, matchCharacterPersonality: false, matchCharacterDepthPrompt: false, matchScenario: false, matchCreatorNotes: false, group: '', groupOverride: false, groupWeight: 100, caseSensitive: null, matchWholeWords: null, useGroupScoring: null, automationId: '', ignoreBudget: false, outletName: '', triggers: [], characterFilter: { isExclude: false, names: [], tags: [] } };
const pos = (n: unknown) => typeof n === 'number' && n > 0 ? n : null;
const pick = (o: Obj, keys: string[]) => Object.fromEntries(keys.filter(k => k in o).map(k => [k, structuredClone(o[k])]));
export function toWorldbookEntry(e: Obj): Obj {
  const out: Obj = {
    uid: e.uid, name: e.comment ?? '', enabled: !e.disable,
    strategy: { type: e.constant ? 'constant' : e.vectorized ? 'vectorized' : 'selective', keys: ((e.key as string[]) || []).map(v => parseRx(v) ?? v), keys_secondary: { logic: LOGIC_T[Number(e.selectiveLogic) || 0] || 'and_any', keys: ((e.keysecondary as string[]) || []).map(v => parseRx(v) ?? v) }, scan_depth: e.scanDepth ?? 'same_as_global' },
    position: { type: POS_T[Number(e.position) || 0] || 'before_character_definition', role: ROLES[Number(e.role) || 0] || 'system', depth: e.depth, order: e.order },
    content: e.content ?? '', probability: e.useProbability === false ? 100 : e.probability,
    recursion: { prevent_incoming: !!e.excludeRecursion, prevent_outgoing: !!e.preventRecursion, delay_until: pos(e.delayUntilRecursion) },
    effect: { sticky: pos(e.sticky), cooldown: pos(e.cooldown), delay: pos(e.delay) },
  };
  if (e.extra) out.extra = structuredClone(e.extra);
  return { ...out, ...pick(e, Object.keys(IMPLICIT)) };
}
const keyStr = (k: unknown) => k instanceof RegExp ? String(k) : str(k);
const g = (o: unknown, path: string): unknown => path.split('.').reduce<unknown>((v, k) => (isObj(v) ? v[k] : undefined), o);
export function fromWorldbookEntry(x: Obj, displayIndex: number): Obj {
  const type = g(x, 'strategy.type') as string | undefined, sd = g(x, 'strategy.scan_depth');
  const out: Obj = {
    uid: x.uid, displayIndex, comment: x.name ?? '', disable: !(x.enabled ?? true), constant: type ? type === 'constant' : true, selective: type === 'selective',
    key: ((g(x, 'strategy.keys') as unknown[]) || []).map(keyStr), selectiveLogic: Math.max(0, LOGIC_T.indexOf(str(g(x, 'strategy.keys_secondary.logic') ?? 'and_any'))),
    keysecondary: ((g(x, 'strategy.keys_secondary.keys') as unknown[]) || []).map(keyStr), scanDepth: sd === 'same_as_global' ? null : (sd ?? null), vectorized: type === 'vectorized',
    position: POS_N[str(g(x, 'position.type') ?? 'at_depth')] ?? 4, role: Math.max(0, ROLES.indexOf(str(g(x, 'position.role') ?? 'system'))), depth: g(x, 'position.depth') ?? 4, order: g(x, 'position.order') ?? 100,
    content: x.content ?? '', useProbability: true, probability: x.probability ?? 100,
    excludeRecursion: g(x, 'recursion.prevent_incoming') ?? false, preventRecursion: g(x, 'recursion.prevent_outgoing') ?? false, delayUntilRecursion: g(x, 'recursion.delay_until') ?? false,
    sticky: g(x, 'effect.sticky') ?? null, cooldown: g(x, 'effect.cooldown') ?? null, delay: g(x, 'effect.delay') ?? null,
  };
  if (x.extra) out.extra = x.extra;
  return { ...out, ...structuredClone(IMPLICIT), ...pick(x, Object.keys(IMPLICIT)) };
}

// ════════ LorebookEntry (옛 꼴) ════════
const POS_L: Record<number, string> = { 0: 'before_character_definition', 1: 'after_character_definition', 5: 'before_example_messages', 6: 'after_example_messages', 2: 'before_author_note', 3: 'after_author_note' };
export function toLorebookEntry(e: Obj): Obj {
  const p = Number(e.position) || 0, r = Number(e.role) || 0;
  return {
    uid: e.uid, display_index: e.displayIndex, comment: e.comment, enabled: !e.disable, type: e.constant ? 'constant' : e.vectorized ? 'vectorized' : 'selective',
    position: POS_L[p] ?? (r === 1 ? 'at_depth_as_user' : r === 2 ? 'at_depth_as_assistant' : 'at_depth_as_system'), depth: p === 4 ? e.depth : null, order: e.order, probability: e.probability,
    key: e.key, keys: e.key, logic: LOGIC_T[Number(e.selectiveLogic) || 0], filter: e.keysecondary, filters: e.keysecondary,
    scan_depth: e.scanDepth ?? 'same_as_global', case_sensitive: e.caseSensitive ?? 'same_as_global', match_whole_words: e.matchWholeWords ?? 'same_as_global', use_group_scoring: e.useGroupScoring ?? 'same_as_global',
    automation_id: e.automationId || null, exclude_recursion: !!e.excludeRecursion, prevent_recursion: !!e.preventRecursion, delay_until_recursion: e.delayUntilRecursion,
    content: e.content, group: e.group, group_prioritized: !!e.groupOverride, group_weight: e.groupWeight, sticky: e.sticky || null, cooldown: e.cooldown || null, delay: e.delay || null,
  };
}
const L_DEFAULT: Obj = { key: [], keysecondary: [], comment: '', content: '', constant: false, vectorized: false, selective: true, selectiveLogic: 0, addMemo: true, order: 100, position: 0, disable: false, excludeRecursion: false, preventRecursion: false, matchPersonaDescription: false, matchCharacterDescription: false, matchCharacterPersonality: false, matchCharacterDepthPrompt: false, matchScenario: false, matchCreatorNotes: false, delayUntilRecursion: 0, probability: 100, useProbability: true, depth: 4, group: '', groupOverride: false, groupWeight: 100, scanDepth: null, caseSensitive: null, matchWholeWords: null, useGroupScoring: null, automationId: '', role: 0, sticky: null, cooldown: null, delay: null };
const same = (v: unknown) => v === 'same_as_global' ? null : v;
const L_FROM: Record<string, (v: unknown) => Obj> = {
  uid: v => ({ uid: v }), display_index: v => ({ displayIndex: v }), comment: v => ({ comment: v }), enabled: v => ({ disable: !v }),
  type: v => ({ constant: v === 'constant', vectorized: v === 'vectorized' }),
  position: v => ({ position: ({ before_character_definition: 0, after_character_definition: 1, before_example_messages: 5, after_example_messages: 6, before_author_note: 2, after_author_note: 3, at_depth_as_system: 4, at_depth_as_user: 4, at_depth_as_assistant: 4 } as Record<string, number>)[str(v)], role: ({ at_depth_as_system: 0, at_depth_as_user: 1, at_depth_as_assistant: 2 } as Record<string, number>)[str(v)] ?? null }),
  depth: v => ({ depth: v === null ? 4 : v }), order: v => ({ order: v }), probability: v => ({ probability: v }), keys: v => ({ key: v }), key: v => ({ key: v }),
  logic: v => ({ selectiveLogic: Math.max(0, LOGIC_T.indexOf(str(v))) }), filters: v => ({ keysecondary: v }), filter: v => ({ keysecondary: v }),
  scan_depth: v => ({ scanDepth: same(v) }), case_sensitive: v => ({ caseSensitive: same(v) }), match_whole_words: v => ({ matchWholeWords: same(v) }), use_group_scoring: v => ({ useGroupScoring: same(v) }),
  automation_id: v => ({ automationId: v === null ? '' : v }), exclude_recursion: v => ({ excludeRecursion: v }), prevent_recursion: v => ({ preventRecursion: v }), delay_until_recursion: v => ({ delayUntilRecursion: v }),
  content: v => ({ content: v }), group: v => ({ group: v }), group_prioritized: v => ({ groupOverride: v }), group_weight: v => ({ groupWeight: v }),
  sticky: v => ({ sticky: v === null ? 0 : v }), cooldown: v => ({ cooldown: v === null ? 0 : v }), delay: v => ({ delay: v === null ? 0 : v }),
};
export function fromLorebookEntry(x: Obj): Obj {
  const out: Obj = { ...structuredClone(L_DEFAULT) };
  for (const [k, v] of Object.entries(x)) if (v !== undefined && L_FROM[k]) { const o = L_FROM[k](v); for (const [kk, vv] of Object.entries(o)) if (vv !== undefined) out[kk] = structuredClone(vv); }
  if (out.role === null) out.role = 0;
  return out;
}

// ════════ 찾기 · 묶기 ════════
const need = (name: unknown): Lore => bookByName(name) || fail('noBook', { name: str(name) });
const names = (ids: string[] | undefined) => (ids || []).map(id => bookName(id)).filter((x): x is string => !!x);
function charBooks(ref: unknown) {
  const ch = findChar(ref); if (!ch) return { primary: null, additional: [] as string[] };
  const list = (ch.loreIds || []).filter(id => S.get('lore', id));
  return { primary: bookName(list[0]), additional: names(list.slice(1)) };
}
const idsOf = (list: unknown[]) => list.map(n => { const b = bookByName(n); if (!b) fail('noBook', { name: str(n) }); return b!.id; });
async function bindChar(ref: unknown, books: { primary?: unknown; additional?: unknown[] }) {
  const ch = findChar(ref); if (!ch) return fail('noChar', { name: str(ref) });
  const now = ch.loreIds || [], prim = books.primary === undefined ? now[0] : books.primary ? idsOf([books.primary])[0] : undefined;
  const add = books.additional === undefined ? now.slice(1) : idsOf(books.additional);
  ch.loreIds = [...new Set([prim, ...add].filter((x): x is string => !!x))];
  await S.save('chars', ch);
}
async function bindChat(name: unknown) {
  const c = chat(); if (!c) return fail('noChat');
  const rest = (c.loreIds || []).slice(1);
  c.loreIds = name ? [...new Set([idsOf([name])[0], ...rest])] : rest;
  await S.save('chats', c, true);
}
async function chatBook(name?: unknown): Promise<string> {
  const c = chat(); if (!c) return fail('noChat');
  const have = bookName(c.loreIds?.[0]); if (have) return have;
  let n = str(name).trim() || `Chat Book ${c.name || c.id}`.slice(0, 64);
  if (bookByName(n) && !name) { const base = n; let i = 1; while (bookByName(n)) n = `${base} (${++i})`; }
  if (!bookByName(n)) await S.save('lore', newLore({ name: n }));
  await bindChat(n); return n;
}
async function makeBook(name: unknown, raws: Obj[] = []): Promise<boolean> {
  const n = str(name).trim(); if (!n) return fail('noName');
  if (bookByName(n)) return false;
  const b = newLore({ name: n }); b.entries = [...raws].sort((x, y) => (Number(x.displayIndex) || 0) - (Number(y.displayIndex) || 0)).map(r => rawToEntry(r));
  await S.save('lore', b); await remember('lore', b.id, b.name, null, true); return true;
}
async function dropBook(c: Ctx, name: unknown): Promise<boolean> {
  const b = bookByName(name); if (!b) return false;
  if (!(await mayDelete(c, t('th.what.book'), b.name))) return false;
  const before = structuredClone(b);
  await S.remove('lore', b.id);
  if ((S.settings.activeLore || []).includes(b.id)) S.set({ activeLore: S.settings.activeLore.filter(x => x !== b.id) });
  const undo = await remember('lore', b.id, b.name, before as unknown as Obj, true);
  if (c.script) undoToast(t('th.undo.deleted', { what: t('th.what.book'), name: b.name }), undo);
  return true;
}
const wbRaws = (name: unknown) => rawsOf(need(name));
const getWb = (name: unknown) => wbRaws(name).map(toWorldbookEntry);
async function replaceWb(name: unknown, list: unknown) {
  const b = need(name); const arr = Array.isArray(list) ? list as Obj[] : [];
  await writeRaws(b, freeUids(arr).map((x, i) => fromWorldbookEntry(x, i)));
}
const getLb = (name: unknown, opt?: unknown) => {
  let list = wbRaws(name).map(toLorebookEntry);
  const f = isObj(opt) && isObj(opt.filter) ? opt.filter : null;
  if (f) list = list.filter(e => Object.entries(f).every(([k, want]) => { const v = e[k]; return Array.isArray(v) ? (want as unknown[]).every(w => v.includes(w)) : typeof v === 'string' ? v.includes(str(want)) : v === want; }));
  return list;
};
/** 옛 꼴(LorebookEntry)에 없는 칸: 같은 uid 의 항목이 있으면 그 값을 지킨다 (인물 거르기 · 출구 이름 · 생성 종류 · 카드 필드 훑기) */
const KEEP_L = ['characterFilter', 'outletName', 'triggers', 'ignoreBudget', 'addMemo', 'use_regex', 'matchPersonaDescription', 'matchCharacterDescription', 'matchCharacterPersonality', 'matchCharacterDepthPrompt', 'matchScenario', 'matchCreatorNotes'];
async function replaceLb(name: unknown, list: unknown) {
  const b = need(name), arr = Array.isArray(list) ? list as Obj[] : [], old = new Map(rawsOf(b).map(r => [Number(r.uid), r]));
  let maxDi = Math.max(-1, ...arr.map(x => Number(x.display_index ?? -1)));
  await writeRaws(b, freeUids(arr).map(x => { const r = fromLorebookEntry({ ...x, display_index: x.display_index ?? ++maxDi }), base = old.get(x.uid); if (base) for (const k of KEEP_L) if (k in base) r[k] = base[k]; return r; }));
}
/** 전역 로어북 설정 ↔ 드림랜드 설정 (드림랜드에 없는 칸은 적어 두었다가 그대로 돌려준다) */
type LoreG = { includeNames?: boolean; minActivations?: number; minDepthMax?: number; maxRecursion?: number; groupScoring?: boolean; st?: Obj };
const loreG = () => (S.settings.lore || {}) as LoreG;
function lbSettings(): Obj {
  const G = loreG(), st = G.st || {};
  return {
    selected_global_lorebooks: names(S.settings.activeLore), scan_depth: st.scan_depth ?? 2, context_percentage: st.context_percentage ?? 25, budget_cap: st.budget_cap ?? 0,
    min_activations: Number(G.minActivations) || 0, max_depth: Number(G.minDepthMax) || 0, max_recursion_steps: Number(G.maxRecursion) || 0, insertion_strategy: st.insertion_strategy ?? 'character_first',
    include_names: !!G.includeNames, recursive: st.recursive ?? true, case_sensitive: st.case_sensitive ?? false, match_whole_words: st.match_whole_words ?? false, use_group_scoring: !!G.groupScoring, overflow_alert: st.overflow_alert ?? false,
  };
}
function setLbSettings(o: unknown) {
  if (!isObj(o)) return;
  const G = { ...loreG() }, st: Obj = { ...(G.st || {}) };
  if (Array.isArray(o.selected_global_lorebooks)) S.set({ activeLore: idsOf(o.selected_global_lorebooks) });
  if (o.min_activations !== undefined) G.minActivations = Number(o.min_activations) || 0;
  if (o.max_depth !== undefined) G.minDepthMax = Number(o.max_depth) || 0;
  if (o.max_recursion_steps !== undefined) G.maxRecursion = Number(o.max_recursion_steps) || 0;
  if (o.include_names !== undefined) G.includeNames = !!o.include_names;
  if (o.use_group_scoring !== undefined) G.groupScoring = !!o.use_group_scoring;
  for (const k of ['scan_depth', 'context_percentage', 'budget_cap', 'insertion_strategy', 'recursive', 'case_sensitive', 'match_whole_words', 'overflow_alert']) if (o[k] !== undefined) st[k] = o[k];
  G.st = st; S.set({ lore: G });
}

/** 메시지 속 화면이 바로 읽는 가벼운 사본에 넣는 것 (src/chat/frameBridge 의 thMeta 와 같은 뜻) */
export const charWorldbooks = charBooks;

type F = (c: Ctx, ...a: unknown[]) => unknown;
export const world: Record<string, F> = {
  // ── worldbook ──
  getWorldbookNames: () => S.lore.map(b => b.name),
  getGlobalWorldbookNames: () => names(S.settings.activeLore),
  rebindGlobalWorldbooks: (_c, list) => { S.set({ activeLore: idsOf(Array.isArray(list) ? list : []) }); },
  getCharWorldbookNames: (_c, ref) => charBooks(ref ?? 'current'),
  rebindCharWorldbooks: (_c, ref, books) => bindChar(ref ?? 'current', isObj(books) ? books : {}),
  getChatWorldbookName: () => bookName(chat()?.loreIds?.[0]),
  rebindChatWorldbook: (_c, _which, name) => bindChat(name),
  getOrCreateChatWorldbook: (_c, _which, name) => chatBook(name),
  getWorldbook: (_c, name) => getWb(name),
  createWorldbook: (_c, name, list) => makeBook(name, freeUids(Array.isArray(list) ? list as Obj[] : []).map((x, i) => fromWorldbookEntry(x, i))),
  createOrReplaceWorldbook: async (_c, name, list) => { if (bookByName(name)) { await replaceWb(name, list || []); return false; } return makeBook(name, freeUids(Array.isArray(list) ? list as Obj[] : []).map((x, i) => fromWorldbookEntry(x, i))); },
  deleteWorldbook: (c, name) => dropBook(c, name),
  replaceWorldbook: (_c, name, list) => replaceWb(name, list),
  createWorldbookEntries: async (_c, name, list) => {
    const have = getWb(name), add = Array.isArray(list) ? list as Obj[] : [];
    await replaceWb(name, [...have, ...add]);
    const all = getWb(name); return { worldbook: all, new_entries: all.slice(have.length) };
  },
  // ── lorebook (옛 꼴) ──
  getLorebookSettings: () => lbSettings(),
  setLorebookSettings: (_c, o) => setLbSettings(o),
  getLorebooks: () => S.lore.map(b => b.name),
  createLorebook: (_c, name) => makeBook(name),
  deleteLorebook: (c, name) => dropBook(c, name),
  getCharLorebooks: (_c, o) => { const r = charBooks(isObj(o) ? o.name ?? 'current' : 'current'), ty = isObj(o) ? o.type : undefined; return ty === 'primary' ? { primary: r.primary, additional: [] } : ty === 'additional' ? { primary: null, additional: r.additional } : r; },
  getCurrentCharPrimaryLorebook: () => charBooks('current').primary,
  setCurrentCharLorebooks: (_c, books) => curChar() ? bindChar('current', isObj(books) ? books : {}) : fail('noChar', { name: 'current' }),
  getChatLorebook: () => bookName(chat()?.loreIds?.[0]),
  setChatLorebook: (_c, name) => bindChat(name),
  getOrCreateChatLorebook: (_c, name) => chatBook(name),
  // ── lorebook_entry ──
  getLorebookEntries: (_c, name, opt) => getLb(name, opt),
  replaceLorebookEntries: (_c, name, list) => replaceLb(name, list),
  setLorebookEntries: async (_c, name, list) => {
    const have = getLb(name), byUid = new Map(have.map(e => [e.uid, e]));
    for (const x of (Array.isArray(list) ? list : []) as Obj[]) { const e = byUid.get(x.uid); if (e) Object.assign(e, structuredClone(x)); }
    await replaceLb(name, have); return getLb(name);
  },
  createLorebookEntries: async (_c, name, list) => {
    const have = getLb(name), used = new Set(have.map(e => Number(e.uid))), uids: number[] = [];
    const add = (Array.isArray(list) ? list as Obj[] : []).map(x => { let u = 0; while (used.has(u)) u++; used.add(u); uids.push(u); return { ...x, uid: u }; });
    await replaceLb(name, [...have, ...add]); return { entries: getLb(name), new_uids: uids };
  },
  createLorebookEntry: async (c, name, x) => ((await world.createLorebookEntries(c, name, [x || {}])) as { new_uids: number[] }).new_uids[0],
  deleteLorebookEntries: async (_c, name, uids) => {
    const drop = new Set((Array.isArray(uids) ? uids : []).map(Number)), have = getLb(name), keep = have.filter(e => !drop.has(Number(e.uid)));
    if (keep.length !== have.length) await replaceLb(name, keep);
    return { entries: getLb(name), delete_occurred: keep.length !== have.length };
  },
  deleteLorebookEntry: async (c, name, uid) => ((await world.deleteLorebookEntries(c, name, [uid])) as { delete_occurred: boolean }).delete_occurred,
};
