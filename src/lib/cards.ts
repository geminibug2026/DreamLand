// ── Dreamland cards: 캐릭터 카드(PNG/JSON) · 외부 형식 변환과 가져오기 (옛 js/cards.js 그대로) ──
import { tplKind, tplImport, KINDS } from './advanced';
import { stQrToSet, qrAddSet } from './qr-data';
import { S, uid, now, arr, bool, parseMaybe, parseDate, bytesToDataURL, dataURLToBytes, mimeOf, shrinkImage, newChar, newPersona, newLore, newEntry, newRegex, newChat, newMsg, defaultPreset, MARKERS, emit } from './core';
import type { Chat, Msg, Regex } from './types';
import { t } from '../i18n';

// ── 자료 꼴 ──
type O = Record<string, unknown>;
export interface CharFilter { names?: string[]; tags?: string[]; exclude?: boolean }
export interface LoreEntry {
  id?: string; name?: string; keys?: string[]; keys2?: string[]; logic?: number | string; content?: string; constant?: boolean; enabled?: boolean; position?: string; depth?: number;
  role?: string; order?: number; probability?: number; caseSensitive?: boolean | null; wholeWord?: boolean | null; useGroupScoring?: boolean | null; outlet?: string; group?: string;
  groupWeight?: number | null; groupOverride?: boolean | null; sticky?: number | null; cooldown?: number | null; delay?: number | null; scanDepth?: number | null; delayUntilRecursion?: number;
  automationId?: string; charFilter?: CharFilter; triggers?: string[]; useRegex?: boolean; vectorized?: boolean; more?: { addMemo?: boolean; vectorized?: boolean; [k: string]: unknown }; [k: string]: unknown;
}
export interface LoreBook { id: string; name: string; description?: string; scanDepth?: number; tokenBudget?: number; recursive?: boolean; caseSensitive?: boolean; wholeWord?: boolean; entries: LoreEntry[]; src?: string; [k: string]: unknown }
export type DRegex = Regex;
export interface DepthPrompt { prompt: string; depth: number; role: string }
export interface DChar {
  id: string; name: string; avatar?: string; description?: string; personality?: string; scenario?: string; firstMes?: string; altGreetings?: string[]; mesExample?: string; systemPrompt?: string;
  postHistory?: string; creatorNotes?: string; creator?: string; version?: string; tags?: string[]; fav?: boolean; talk?: number; depthPrompt?: DepthPrompt; worldName?: string;
  ext?: O; more?: O; loreIds: string[]; createdAt?: number; updatedAt?: number; src?: string; [k: string]: unknown;
}
export interface DPersona { id: string; name: string; avatar?: string; description?: string; src?: string; [k: string]: unknown }
export interface Swipe { text: string; ts: number; reasoning?: string; model?: unknown }
export interface DMsg { id: string; role: string; charId: string; name: string; swipes: Swipe[]; sw: number; hidden: boolean; ts: number; [k: string]: unknown }
export interface DChat {
  id: string; name?: string; charIds: string[]; createdAt: number; updatedAt?: number; note?: { text: string; depth: number; role: string }; vars?: O; src?: string; summary?: string; summaryAt?: number; [k: string]: unknown;
}
export interface Block { id: string; kind: string; name?: string; role?: string; content?: string; enabled?: boolean; depth?: number | string | null; [k: string]: unknown }
export interface PVar { id: string; name: string; label: string; type: string; default: unknown; onText?: string; options?: { label: string; value: string }[] }
export interface DPreset { id: string; name: string; params: O; blocks: Block[]; regex: DRegex[]; vars?: PVar[]; src?: string; [k: string]: unknown }
export interface Tally { chars: number; chats: number; msgs: number; lore: number; presets: number; personas: number; regex: number; quick: number; templates: number; skipped: number; errors: string[] }
export interface FsItem { name: string; dir: boolean; size?: number; mtime?: number }
export interface Source { label: string; kind?: string | null; list(sub: string): Promise<FsItem[]>; bytes(rel: string): Promise<Uint8Array>; text(rel: string): Promise<string> }
export interface Found { kind: string; root: string; label: string }
export type Want = Record<string, boolean | undefined>;
export type Progress = (t: string) => void;
type Coll = 'chars' | 'chats' | 'lore' | 'presets' | 'personas' | 'regex';
interface CStore {
  chars: DChar[]; chats: DChat[]; lore: LoreBook[]; presets: DPreset[]; personas: DPersona[]; regex: DRegex[];
  settings: { regexAllow?: Record<string, Record<string, string>>; activeLore: string[]; [k: string]: unknown };
  get(coll: 'lore', id?: string): LoreBook | undefined;
  save<T>(coll: Coll, obj: T, silent?: boolean): Promise<T>;
  saveMsgs(chat: DChat, msgs: DMsg[]): Promise<unknown>;
  set(patch: O): void;
  importAll(data: unknown, replace: boolean): Promise<unknown>;
}
interface CoreApi {
  uid(): string; now(): number; arr<T = unknown>(v: unknown): T[]; bool(v: unknown): boolean; parseMaybe<T = unknown>(v: unknown, fallback: T): T; parseDate(v: unknown): number;
  bytesToDataURL(bytes: Uint8Array, mime?: string): string; dataURLToBytes(url: string): Uint8Array; mimeOf(name: string): string; shrinkImage(src: string, max?: number): Promise<string>;
  newChar(o: O): DChar; newPersona(o: O): DPersona; newLore(o: O): LoreBook; newEntry(o: O): LoreEntry; newRegex(o: O): DRegex; newChat(o: O): DChat;
  newMsg(role: string, text: string, o?: O): DMsg; defaultPreset(): DPreset; MARKERS: Record<string, string>; emit(ev: string, data?: unknown): void;
}
const St = S as unknown as CStore;
const K = { uid, now, arr, bool, parseMaybe, parseDate, bytesToDataURL, dataURLToBytes, mimeOf, shrinkImage, newChar, newPersona, newLore, newEntry, newRegex, newChat, newMsg, defaultPreset, MARKERS, emit } as unknown as CoreApi;
const isObj = (v: unknown): v is O => !!v && typeof v === 'object';

// ════════ PNG 메타데이터 ════════
const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
const crc32 = (b: Uint8Array) => { let c = 0xffffffff; for (let i = 0; i < b.length; i++) c = CRC[(c ^ b[i]) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
const b64ToUtf8 = (s: string) => new TextDecoder().decode(Uint8Array.from(atob(s), c => c.charCodeAt(0)));
const fromCodes = (u: Uint8Array) => String.fromCharCode.apply(null, u as unknown as number[]);
const utf8ToB64 = (s: string) => { const u = new TextEncoder().encode(s); let o = ''; for (let i = 0; i < u.length; i += 0x8000) o += fromCodes(u.subarray(i, i + 0x8000)); return btoa(o); };

interface Chunk { type: string; start: number; end: number; data: Uint8Array }
function* pngChunks(u: Uint8Array): Generator<Chunk> {
  const dv = new DataView(u.buffer, u.byteOffset, u.byteLength);
  let p = 8;
  while (p + 8 <= u.length) {
    const len = dv.getUint32(p), type = String.fromCharCode(u[p + 4], u[p + 5], u[p + 6], u[p + 7]);
    yield { type, start: p, end: p + 12 + len, data: u.subarray(p + 8, p + 8 + len) };
    p += 12 + len;
  }
}
/** 그림 파일에 든 캐릭터 카드. PNG 는 tEXt · iTXt 의 chara / ccv3, 그 밖의 그림(WEBP · JPG 등)은 EXIF · XMP 따위에 실린 같은 값을 찾는다 */
export function readPngCard(bytes: Uint8Array | ArrayBuffer | ArrayLike<number>): Card | null {
  const u = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes as ArrayBuffer);
  if (u[0] === 0x89 && u[1] === 0x50) {
    const found: Record<string, string> = {};
    for (const c of pngChunks(u)) {
      if (c.type !== 'tEXt' && c.type !== 'iTXt') continue;
      const z = c.data.indexOf(0); if (z < 0) continue;
      const key = String.fromCharCode(...c.data.subarray(0, z)).toLowerCase();
      if (key !== 'chara' && key !== 'ccv3') continue;
      let d = c.data.subarray(z + 1);
      if (c.type === 'iTXt') {   // 압축 표시 · 방식 · 언어\0 · 번역된 키\0 · 글 (압축된 것은 읽지 않는다)
        if (d[0] !== 0) continue;
        const a = d.indexOf(0, 2); if (a < 0) continue; const b = d.indexOf(0, a + 1); if (b < 0) continue;
        d = d.subarray(b + 1);
      }
      let s = ''; for (let i = 0; i < d.length; i += 0x8000) s += fromCodes(d.subarray(i, i + 0x8000)); found[key] = s.trim();
    }
    for (const raw of [found.ccv3, found.chara]) if (raw) { const c = parseCardText(raw); if (c) return c; }
    return null;
  }
  return scanCard(u);
}
/** base64 또는 JSON 글자 → 카드 (카드 모양이 아니면 null) */
function parseCardText(raw: string): Card | null {
  const looks = (j: unknown): j is Card => !!j && typeof j === 'object' && (typeof (j as Card).spec === 'string' || typeof (j as Card).data === 'object' || typeof (j as Card).name === 'string');
  for (const f of [() => JSON.parse(b64ToUtf8(raw)), () => JSON.parse(raw)]) { try { const j: unknown = f(); if (looks(j)) return j; } catch { /* 다음 방법 */ } }
  return null;
}
/** PNG 가 아닌 그림: 파일 안에서 "chara"/"ccv3" 뒤의 base64, 또는 카드 JSON 을 찾는다. 새 판(ccv3)을 먼저 */
function scanCard(u: Uint8Array): Card | null {
  let s = ''; for (let i = 0; i < u.length; i += 0x8000) s += fromCodes(u.subarray(i, i + 0x8000));
  for (const key of ['ccv3', 'chara']) {
    const re = new RegExp(key + '[^A-Za-z0-9+/={]{0,24}([A-Za-z0-9+/]{40,}={0,2})', 'gi');
    for (const m of s.matchAll(re)) { const c = parseCardText(m[1]); if (c) return c; }
  }
  for (const m of s.matchAll(/eyJ[A-Za-z0-9+/]{60,}={0,2}/g)) { const c = parseCardText(m[0]); if (c && (c.spec || c.data)) return c; }   // 이름표 없이 실린 base64 JSON
  const at = s.search(/\{\s*"spec"\s*:\s*"chara_card_v[23]"/);
  if (at >= 0) { const txt = new TextDecoder().decode(u.subarray(at)); let tries = 0; for (let end = txt.lastIndexOf('}'); end > 0 && tries++ < 400; end = txt.lastIndexOf('}', end - 1)) { try { return JSON.parse(txt.slice(0, end + 1)); } catch { /* 더 짧게 */ } } }
  return null;
}
export function writePngCard(pngBytes: Uint8Array, card: unknown, v3: unknown = null): Uint8Array {
  const parts: Uint8Array[] = []; let iend: Uint8Array | null = null;
  parts.push(pngBytes.subarray(0, 8));
  for (const c of pngChunks(pngBytes)) {
    if (c.type === 'IEND') { iend = pngBytes.subarray(c.start, c.end); continue; }
    if (c.type === 'tEXt') { const z = c.data.indexOf(0); const k = String.fromCharCode(...c.data.subarray(0, Math.max(0, z))).toLowerCase(); if (k === 'chara' || k === 'ccv3') continue; }
    parts.push(pngBytes.subarray(c.start, c.end));
  }
  const text = (key: string, obj: unknown) => {
    const payload = new TextEncoder().encode(key + '\0' + utf8ToB64(JSON.stringify(obj)));
    const chunk = new Uint8Array(12 + payload.length); const dv = new DataView(chunk.buffer);
    dv.setUint32(0, payload.length); chunk.set([0x74, 0x45, 0x58, 0x74], 4); chunk.set(payload, 8);
    dv.setUint32(8 + payload.length, crc32(chunk.subarray(4, 8 + payload.length)));
    return chunk;
  };
  parts.push(text('chara', card)); if (v3) parts.push(text('ccv3', v3));   // V2(chara) 와 V3(ccv3) 를 함께 넣는다
  parts.push(iend || new Uint8Array([0, 0, 0, 0, 0x49, 0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82]));
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0)); let o = 0;
  for (const p of parts) { out.set(p, o); o += p.length; }
  return out;
}

// ════════ 변환기 ════════
const ROLE = ['system', 'user', 'assistant'];
// 월드 인포의 삽입 위치 번호: 0 설명 앞 · 1 설명 뒤 · 2 작가 노트 위 · 3 작가 노트 아래 · 4 깊이 · 5 예시 앞 · 6 예시 뒤 · 7 아울렛
const ST_POS = ['before', 'after', 'an_top', 'an_bottom', 'depth', 'em_top', 'em_bottom', 'outlet'];
const posNum = (p: unknown) => Math.max(0, ST_POS.indexOf(p as string));
const tri = (v: unknown) => v === true || v === false ? v : null;                                   // 켬 · 끔 · 따름(null)
const numOrNull = (v: unknown) => v === null || v === undefined || v === '' || isNaN(+(v as number)) ? null : +(v as number);
// [드림랜드 이름, 월드 인포 파일 이름, 캐릭터 카드 책(extensions) 이름, 읽을 때 변환]
const WI_FLAGS: [string, string, string][] = [
  ['ignoreBudget', 'ignoreBudget', 'ignore_budget'], ['excludeRecursion', 'excludeRecursion', 'exclude_recursion'], ['noRecurse', 'preventRecursion', 'prevent_recursion'], ['groupOverride', 'groupOverride', 'group_override'],
  ['matchPersona', 'matchPersonaDescription', 'match_persona_description'], ['matchCharDesc', 'matchCharacterDescription', 'match_character_description'], ['matchCharPersonality', 'matchCharacterPersonality', 'match_character_personality'],
  ['matchCharNote', 'matchCharacterDepthPrompt', 'match_character_depth_prompt'], ['matchScenario', 'matchScenario', 'match_scenario'], ['matchCreatorNotes', 'matchCreatorNotes', 'match_creator_notes'],
];
const WI_TRIGGERS = ['normal', 'continue', 'impersonate', 'swipe', 'regenerate', 'quiet'];

/** 월드 인포 · 카드 책의 항목 (두 형식의 필드가 섞여 들어온다) */
export interface WiEntry { comment?: string; name?: string; content?: string; constant?: boolean; enabled?: boolean; disable?: boolean; selective?: boolean; position?: number | string; order?: number; insertion_order?: number; displayIndex?: number; extensions?: O; addMemo?: boolean; [k: string]: unknown }
export interface WorldJson { name?: string; description?: string; scan_depth?: number; token_budget?: number; recursive_scanning?: boolean; extensions?: O; entries?: WiEntry[] | Record<string, WiEntry>; [k: string]: unknown }
/** 월드 인포(.json) · 캐릭터 카드에 든 책(character_book) → 드림랜드 로어북 */
export function worldToLore(json: WorldJson, name?: string): LoreBook {
  const book = K.newLore({ name: json.name || name || '로어북', description: json.description || '' });
  if (json.scan_depth != null) book.scanDepth = json.scan_depth;
  if (json.token_budget) book.tokenBudget = json.token_budget;
  if (json.recursive_scanning != null) book.recursive = !!json.recursive_scanning;
  const dx = json.extensions?.dreamland; if (isObj(dx)) for (const k of ['scanDepth', 'tokenBudget', 'recursive', 'caseSensitive', 'wholeWord']) if (dx[k] !== undefined) book[k] = dx[k];
  const list: WiEntry[] = Array.isArray(json.entries) ? json.entries : Object.values(json.entries || {});
  const sorted = list.every(e => (e.displayIndex ?? e.extensions?.display_index) != null) ? [...list].sort((a, b) => (a.displayIndex ?? (a.extensions as O).display_index as number) - (b.displayIndex ?? (b.extensions as O).display_index as number)) : list;
  for (const e of sorted) {
    const x: O = e.extensions || {};
    const isCardBook = 'keys' in e || 'insertion_order' in e;
    const g = (st: string, cb: string): unknown => isCardBook ? x[cb] : e[st];                                    // 같은 뜻의 필드를 형식에 맞게 읽는다
    const pos = isCardBook ? (x.position != null ? ST_POS[x.position as number] : (e.position === 'after_char' ? 'after' : 'before')) : ST_POS[(e.position ?? 0) as number];
    const cf = ((isCardBook ? x.character_filter : e.characterFilter) || {}) as { names?: unknown; tags?: unknown; isExclude?: unknown }, dur = g('delayUntilRecursion', 'delay_until_recursion');
    const more: O = {}; const vectorized = !!g('vectorized', 'vectorized'); if (e.addMemo === false) more.addMemo = false;
    const entry = K.newEntry({
      name: e.comment || e.name || '', keys: K.arr(isCardBook ? e.keys : e.key).map(String), keys2: e.selective !== false ? K.arr(isCardBook ? e.secondary_keys : e.keysecondary).map(String) : [],
      logic: +(((isCardBook ? (x.selectiveLogic ?? e.selectiveLogic) : e.selectiveLogic) ?? 0) as number) || 0, content: e.content || '', constant: !!e.constant,
      enabled: isCardBook ? e.enabled !== false : !e.disable, position: pos || 'before', depth: g('depth', 'depth') ?? 4,
      role: ROLE[(g('role', 'role') ?? 0) as number] || 'system', order: (isCardBook ? e.insertion_order : e.order) ?? 100,
      probability: (g('useProbability', 'useProbability') === false ? 100 : g('probability', 'probability')) ?? 100,
      caseSensitive: tri(isCardBook ? (e.case_sensitive ?? x.case_sensitive) : e.caseSensitive), wholeWord: tri(g('matchWholeWords', 'match_whole_words')), useGroupScoring: tri(g('useGroupScoring', 'use_group_scoring')),
      outlet: g('outletName', 'outlet_name') || '', group: g('group', 'group') || '', groupWeight: numOrNull(g('groupWeight', 'group_weight')) ?? 100,
      sticky: g('sticky', 'sticky') || null, cooldown: g('cooldown', 'cooldown') || null, delay: g('delay', 'delay') || null, scanDepth: numOrNull(g('scanDepth', 'scan_depth')),
      delayUntilRecursion: dur === true ? 1 : Math.max(0, +(dur as number) || 0), automationId: g('automationId', 'automation_id') || '',
      charFilter: { names: K.arr(cf.names).map(String), tags: K.arr(cf.tags).map(String), exclude: !!cf.isExclude },
      triggers: K.arr<string>(g('triggers', 'triggers')).filter(t => WI_TRIGGERS.includes(t)), useRegex: !!(e.use_regex ?? x.use_regex ?? x.dreamland_use_regex ?? e.extensions?.dreamland_use_regex),
      ...(vectorized ? { vectorized: true } : {}), ...(Object.keys(more).length ? { more } : {}),
    });
    for (const [mine, st, cb] of WI_FLAGS) entry[mine] = !!g(st, cb);
    book.entries.push(entry);
  }
  return book;
}
/** 드림랜드 로어북 → 월드 인포(.json). 드림랜드에만 있는 책 설정은 extensions.dreamland 에 담아 되돌아올 수 있게 한다 */
export function loreToWorld(book: LoreBook) {
  const entries: Record<number, O> = {};
  (book.entries || []).forEach((e, i) => {
    const cf = e.charFilter || {};
    entries[i] = {
      uid: i, key: e.keys || [], keysecondary: e.keys2 || [], comment: e.name || '', content: e.content || '', constant: !!e.constant, vectorized: !!(e.vectorized || e.more?.vectorized), use_regex: !!e.useRegex, selective: true, selectiveLogic: +(e.logic as number) || 0,
      addMemo: e.more?.addMemo !== false, order: e.order ?? 100, position: posNum(e.position), disable: e.enabled === false,
      probability: e.probability ?? 100, useProbability: true, depth: e.depth ?? 4, role: Math.max(0, ROLE.indexOf(e.role as string)), outletName: e.outlet || '',
      group: e.group || '', groupOverride: !!(e.groupOverride ?? true), groupWeight: e.groupWeight ?? 100, scanDepth: numOrNull(e.scanDepth),
      caseSensitive: tri(e.caseSensitive), matchWholeWords: tri(e.wholeWord), useGroupScoring: tri(e.useGroupScoring), automationId: e.automationId || '',
      sticky: +(e.sticky as number) || 0, cooldown: +(e.cooldown as number) || 0, delay: +(e.delay as number) || 0, delayUntilRecursion: +(e.delayUntilRecursion as number) || 0,
      characterFilter: { isExclude: !!cf.exclude, names: cf.names || [], tags: cf.tags || [] }, triggers: e.triggers || [], displayIndex: i,
      ...Object.fromEntries(WI_FLAGS.map(([mine, st]) => [st, mine === 'groupOverride' ? !!(e.groupOverride ?? true) : !!e[mine]])),
    };
  });
  return { name: book.name, description: book.description || '', entries, extensions: { dreamland: { scanDepth: book.scanDepth ?? 4, tokenBudget: book.tokenBudget || 2048, recursive: !!book.recursive, caseSensitive: !!book.caseSensitive, wholeWord: !!book.wholeWord } } };
}
/** 캐릭터 카드에 넣는 책(character_book)의 항목 */
export function loreToCardBook(book: LoreBook) {
  return {
    name: book.name, description: book.description || '', scan_depth: book.scanDepth ?? 4, token_budget: book.tokenBudget || 2048, recursive_scanning: !!book.recursive,
    extensions: { dreamland: { caseSensitive: !!book.caseSensitive, wholeWord: !!book.wholeWord } },
    entries: (book.entries || []).map((e, i) => {
      const cf = e.charFilter || {};
      return {
        id: i, keys: e.keys || [], secondary_keys: e.keys2 || [], comment: e.name || '', content: e.content || '', constant: !!e.constant, selective: true, insertion_order: e.order ?? 100, enabled: e.enabled !== false,
        position: e.position === 'after' ? 'after_char' : 'before_char', use_regex: !!e.useRegex,
        extensions: {
          position: posNum(e.position), depth: e.depth ?? 4, role: Math.max(0, ROLE.indexOf(e.role as string)), probability: e.probability ?? 100, useProbability: true, selectiveLogic: +(e.logic as number) || 0, display_index: i,
          outlet_name: e.outlet || '', group: e.group || '', group_weight: e.groupWeight ?? 100, scan_depth: numOrNull(e.scanDepth), case_sensitive: tri(e.caseSensitive), match_whole_words: tri(e.wholeWord), use_group_scoring: tri(e.useGroupScoring),
          automation_id: e.automationId || '', vectorized: !!(e.vectorized || e.more?.vectorized), sticky: +(e.sticky as number) || 0, cooldown: +(e.cooldown as number) || 0, delay: +(e.delay as number) || 0, delay_until_recursion: +(e.delayUntilRecursion as number) || 0,
          character_filter: { isExclude: !!cf.exclude, names: cf.names || [], tags: cf.tags || [] }, triggers: e.triggers || [],
          ...Object.fromEntries(WI_FLAGS.map(([mine, , cb]) => [cb, mine === 'groupOverride' ? !!(e.groupOverride ?? true) : !!e[mine]])),
        },
      };
    }),
  };
}

// ── 정규식 스크립트 ↔ 드림랜드 ──
// placement: 1 사용자 입력 · 2 AI 응답 · 3 슬래시 명령 · 5 월드 인포 · 6 생각 과정 (0 은 옛 'MD 표시', 4 는 옛 sendAs)
const depthNum = (v: unknown) => (v == null || v === '' || isNaN(+(v as number)) ? null : +(v as number));
/** 은 /…/플래그 꼴이 아니면 플래그 없이(처음 한 곳만) 돌린다. 드림랜드의 맨 패턴은 전체 검색이라 슬래시로 감싸 뜻을 지킨다 */
const stFind = (s: unknown) => { s = String(s ?? ''); return !s || /^\/[\s\S]+\/[a-z]*$/i.test(s as string) ? s as string : `/${s}/`; };
export interface StRegex {
  id?: string; scriptName?: string; name?: string; findRegex?: unknown; replaceString?: unknown; trimStrings?: unknown; placement?: unknown; disabled?: unknown; enabled?: unknown;
  markdownOnly?: unknown; promptOnly?: unknown; runOnEdit?: unknown; substituteRegex?: unknown; minDepth?: unknown; maxDepth?: unknown; applyMode?: string; [k: string]: unknown;
}
export function stRegexToRegex(r: StRegex, scope = 'global'): DRegex {
  let pl = K.arr(r.placement), md = !!r.markdownOnly, pr = K.bool(r.promptOnly);
  if (pl.includes(0)) { pl = pl.length === 1 ? [1, 2, 3, 5, 6] : pl.filter(x => x !== 0); md = pr = true; }        // 옛 형식: 표시 전용이었다
  if (pl.includes(4)) pl = pl.length === 1 ? [3] : pl.filter(x => x !== 4);
  const has = (n: number, word: string) => pl.includes(n) || pl.includes(String(n)) || pl.includes(word);
  const sub = Number(r.substituteRegex);
  return K.newRegex({
    name: r.scriptName || r.name || '정규식', find: stFind(r.findRegex), replace: String(r.replaceString ?? ''), trim: K.arr(r.trimStrings).map(String).filter(Boolean),
    onUser: has(1, 'user_input'), onAI: has(2, 'ai_output'), onSlash: has(3, 'slash_command'), onLore: has(5, 'world_info'), onReason: has(6, 'reasoning'),
    mode: r.applyMode ? r.applyMode : (md && pr ? 'both' : md ? 'display' : pr ? 'prompt' : 'store'),
    enabled: r.enabled != null ? K.bool(r.enabled) : !r.disabled, runOnEdit: !!r.runOnEdit, subst: sub === 1 || sub === 2 ? sub : 0,
    minDepth: depthNum(r.minDepth), maxDepth: depthNum(r.maxDepth), scope,
  });
}
/** JSON 에서 정규식 스크립트들을 찾아낸다: 낱개 · 묶음(배열), 드림랜드 형식, 그리고 프리셋(extensions.regex_scripts) · 캐릭터 카드에 실린 것 */
export function regexFromJson(j: unknown, scope = 'global'): DRegex[] {
  const J = j as { extensions?: { regex_scripts?: unknown }; data?: { extensions?: { regex_scripts?: unknown } }; regex?: unknown } | null | undefined;
  const list = (Array.isArray(j) ? j : Array.isArray(J?.extensions?.regex_scripts) ? J.extensions.regex_scripts : Array.isArray(J?.data?.extensions?.regex_scripts) ? J.data.extensions.regex_scripts : Array.isArray(J?.regex) ? J.regex : [j]) as unknown[];
  const out: DRegex[] = [];
  for (const r of list) {
    if (!r || typeof r !== 'object') continue;
    const R = r as StRegex & { find?: unknown; trim?: unknown };
    if (typeof R.findRegex === 'string' || R.scriptName !== undefined) out.push(stRegexToRegex(R, scope));
    else if (typeof R.find === 'string') { const { id, createdAt, updatedAt, src, mod, ...rest } = R; void id; void createdAt; void updatedAt; void src; void mod; out.push(K.newRegex({ ...rest, trim: K.arr(R.trim).map(String).filter(Boolean), scope })); }
  }
  return out;
}

/** 캐릭터 카드 V1 · V2 · V3 */
export interface CardData {
  name?: string; description?: string; personality?: string; scenario?: string; first_mes?: string; alternate_greetings?: unknown; mes_example?: string; system_prompt?: string;
  post_history_instructions?: string; creator_notes?: string; creator?: string; character_version?: string; tags?: unknown; extensions?: CardExt; character_book?: WorldJson;
  creator_notes_multilingual?: Record<string, string>; [k: string]: unknown;
}
export interface CardExt { fav?: unknown; talkativeness?: unknown; depth_prompt?: { prompt?: string; depth?: number; role?: string }; world?: string; regex_scripts?: unknown; backstory?: string; appearance?: string; [k: string]: unknown }
export interface Card extends CardData { spec?: string; data?: CardData; creatorcomment?: string; fav?: unknown }
/** 캐릭터 카드(V1/V2/V3) → 드림랜드 캐릭터 (+내장 로어북, 정규식) */
export function cardToChar(card: Card, avatar = '') {
  const d: CardData = card.data && typeof card.data === 'object' ? card.data : card;
  const x: CardExt = d.extensions || {};
  const ch = K.newChar({
    name: d.name || card.name || '이름 없음', avatar, description: d.description || '', personality: d.personality || '', scenario: d.scenario || '',
    firstMes: d.first_mes || '', altGreetings: K.arr(d.alternate_greetings).filter(Boolean), mesExample: d.mes_example || '', systemPrompt: d.system_prompt || '',
    postHistory: d.post_history_instructions || '', creatorNotes: d.creator_notes || card.creatorcomment || '', creator: d.creator || '', version: d.character_version || '',
    tags: K.arr(d.tags).map(String), fav: K.bool(x.fav ?? card.fav), talk: Number(x.talkativeness ?? 0.5) || 0.5,
    depthPrompt: { prompt: x.depth_prompt?.prompt || '', depth: x.depth_prompt?.depth ?? 4, role: x.depth_prompt?.role || 'system' }, worldName: x.world || '',
    ext: Object.fromEntries(Object.entries(x).filter(([k]) => !EXT_OWN.includes(k))),                                                  // 드림랜드가 따로 다루지 않는 확장 필드는 그대로 보관
    more: Object.fromEntries(Object.entries(d).filter(([k]) => !DATA_OWN.includes(k))),                                                // V3 의 nickname · source · group_only_greetings · assets 등
  });
  if (!ch.creatorNotes && d.creator_notes_multilingual && typeof d.creator_notes_multilingual === 'object') ch.creatorNotes = d.creator_notes_multilingual.ko || d.creator_notes_multilingual.en || Object.values(d.creator_notes_multilingual)[0] || '';
  const extraBits = [x.backstory && `[Backstory]\n${x.backstory}`, x.appearance && `[Appearance]\n${x.appearance}`].filter(Boolean); // 형식 B 의 확장 필드
  if (extraBits.length) ch.description = [ch.description, ...extraBits].filter(Boolean).join('\n\n');
  const cb = d.character_book;
  const lore = (cb?.entries as { length?: number } | undefined)?.length ? worldToLore(cb as WorldJson, (cb as WorldJson).name || `${ch.name}의 로어북`) : null;
  const regex = K.arr<StRegex>(x.regex_scripts).map(r => stRegexToRegex(r, ch.id));
  return { char: ch, lore, regex };
}
const EXT_OWN = ['talkativeness', 'fav', 'world', 'depth_prompt', 'regex_scripts'];
const DATA_OWN = ['name', 'description', 'personality', 'scenario', 'first_mes', 'mes_example', 'creator_notes', 'system_prompt', 'post_history_instructions', 'alternate_greetings', 'tags', 'creator', 'character_version', 'extensions', 'character_book'];
/** v3 = true 면 캐릭터 카드 V3 스펙(chara_card_v3)으로 */
export function charToCard(ch: DChar, v3 = false) {
  const book = St.get('lore', (ch.loreIds || [])[0]);
  const more: O = { ...(ch.more || {}) };
  if (v3) { more.group_only_greetings = Array.isArray(more.group_only_greetings) ? more.group_only_greetings : []; more.creation_date ??= Math.floor((ch.createdAt || Date.now()) / 1000); more.modification_date = Math.floor((ch.updatedAt || Date.now()) / 1000); }
  return {
    spec: v3 ? 'chara_card_v3' : 'chara_card_v2', spec_version: v3 ? '3.0' : '2.0',
    data: {
      ...more,
      name: ch.name, description: ch.description, personality: ch.personality, scenario: ch.scenario, first_mes: ch.firstMes, mes_example: ch.mesExample,
      creator_notes: ch.creatorNotes, system_prompt: ch.systemPrompt, post_history_instructions: ch.postHistory, alternate_greetings: ch.altGreetings, tags: ch.tags,
      creator: ch.creator, character_version: ch.version,
      extensions: { ...(ch.ext || {}), talkativeness: ch.talk, fav: ch.fav, world: book?.name || '', depth_prompt: ch.depthPrompt, regex_scripts: scopedRegex(ch.id).map(regexToSt) },
      ...(book ? { character_book: loreToCardBook(book) } : {}),
    },
  };
}
/** 캐릭터에 묶인 정규식을 순서대로 */
export const scopedRegex = (charId: string) => St.regex.map((r, i) => [r, i] as const).filter(([r]) => r.scope === charId).sort((a, b) => (+(a[0].order as number) || 0) - (+(b[0].order as number) || 0) || a[1] - b[1]).map(x => x[0]);
/** 드림랜드 → 정규식 스크립트. 맨 패턴(전체 검색)은 /…/g 로 적어 뜻을 지킨다 */
export const regexToSt = (r: DRegex) => {
  const find = String(r.find || ''), slashed = !find || /^\/[\s\S]+\/[a-z]*$/i.test(find);
  return {
    id: r.id, scriptName: r.name, findRegex: slashed ? find : `/${find}/g`, replaceString: r.replace || '', trimStrings: K.arr(r.trim).filter(Boolean),
    placement: [r.onUser && 1, r.onAI && 2, r.onSlash && 3, r.onLore && 5, r.onReason && 6].filter(Boolean), disabled: !r.enabled,
    markdownOnly: r.mode === 'display' || r.mode === 'both', promptOnly: r.mode === 'prompt' || r.mode === 'both', runOnEdit: r.runOnEdit === true,
    substituteRegex: Number(r.subst ?? (find.includes('{{') ? 1 : 0)) || 0, minDepth: depthNum(r.minDepth), maxDepth: depthNum(r.maxDepth),
  };
};
/** 캐릭터 · 프리셋에 실려 들어온 정규식은 처음 쓸 때 한 번 물어본다. kind: 'chars' | 'presets' */
function askRegexLater(kind: string, id: string) {
  const a = St.settings.regexAllow || {}, cur = a[kind] || {};
  if (cur[id] !== undefined) return;
  St.set({ regexAllow: { ...a, [kind]: { ...cur, [id]: 'ask' } } });
}

export async function exportCharPng(ch: DChar): Promise<Uint8Array> {
  const img = new Image();
  const c = document.createElement('canvas');
  await new Promise(res => { img.onload = res; img.onerror = res; img.src = ch.avatar || 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="400" height="600"><rect width="400" height="600" fill="#8b7fd6"/></svg>'); });
  c.width = img.width || 400; c.height = img.height || 600;
  (c.getContext('2d') as CanvasRenderingContext2D).drawImage(img, 0, 0);
  return writePngCard(K.dataURLToBytes(c.toDataURL('image/png')), charToCard(ch), charToCard(ch, true));
}

const ST_KIND: Record<string, string> = { main: 'main', worldInfoBefore: 'worldInfoBefore', worldInfoAfter: 'worldInfoAfter', personaDescription: 'personaDescription', charDescription: 'charDescription', charPersonality: 'charPersonality', scenario: 'scenario', dialogueExamples: 'dialogueExamples', chatHistory: 'chatHistory', jailbreak: 'jailbreak' };
const ST_NAME: Record<string, string> = { nsfw: '보조 프롬프트', enhanceDefinitions: '설정 강화' };
export interface StPrompt { identifier: string; name?: string; content?: string; role?: string; marker?: boolean; enabled?: boolean; injection_position?: number; injection_depth?: number; [k: string]: unknown }
export interface StOrder { identifier: string; enabled?: boolean }
export interface StPreset {
  name?: string; temperature?: number; top_p?: number; top_k?: number; openai_max_tokens?: number; openai_max_context?: number; frequency_penalty?: number; presence_penalty?: number;
  stream_openai?: boolean; squash_system_messages?: boolean; assistant_prefill?: string; reasoning_effort?: string; prompts?: StPrompt[]; prompt_order?: { character_id?: number; order?: StOrder[] }[];
  personality_format?: string; scenario_format?: string; wi_format?: string; extensions?: { regex_scripts?: unknown; [k: string]: unknown }; [k: string]: unknown;
}
/** 정하지 않은 값을 파일에 적을 때 쓰는 값 (presetToSt 와 같아야 한다) */
const UNSET_AS: Record<string, unknown> = { topP: 1, freqPen: 0, presPen: 0, topK: 0, minP: 0, topA: 0, repPen: 1, seed: -1 };
/** 드림랜드가 직접 다루는 프리셋 키. 그 밖의 키(모델 선택 · 다른 지시문 등)는 preset.st.cc 에 그대로 두었다가 내보낼 때 되돌린다 */
const CC_OWN = new Set(['name', 'temperature', 'top_p', 'top_k', 'openai_max_tokens', 'openai_max_context', 'frequency_penalty', 'presence_penalty', 'min_p', 'top_a', 'repetition_penalty', 'seed', 'stream_openai', 'squash_system_messages', 'assistant_prefill', 'reasoning_effort', 'continue_nudge_prompt', 'impersonation_prompt', 'group_nudge_prompt', 'prompts', 'prompt_order', 'personality_format', 'scenario_format', 'wi_format', 'extensions']);
/** 보관하지 않는 키: 접속 주소 · 비밀번호 */
const CC_SECRET = new Set(['reverse_proxy', 'proxy_password']);
const EFFORTS = ['low', 'medium', 'high', 'xhigh', 'max'];
/** [드림랜드 프리셋 값, 프리셋 파일 키] — 비어 있으면 드림랜드 기본 문구를 쓴다 */
const NUDGES: [string, string][] = [['continueNudge', 'continue_nudge_prompt'], ['impersonatePrompt', 'impersonation_prompt'], ['groupNudge', 'group_nudge_prompt']];
const num = (v: unknown) => typeof v === 'number' && isFinite(v) ? v : null;
export function stPresetToPreset(j: StPreset, name?: string): { preset: DPreset; regex: DRegex[] } {
  const p = K.defaultPreset(); p.name = name || j.name || '가져온 프리셋';
  const pick = <T,>(v: T | null | undefined, d: T) => (v === undefined || v === null ? d : v);
  Object.assign(p.params, {
    temperature: pick(j.temperature, 1), topP: pick(j.top_p, null), topK: j.top_k ? j.top_k : null, maxTokens: pick(j.openai_max_tokens, 4096), contextSize: pick(j.openai_max_context, 128000),
    freqPen: j.frequency_penalty || null, presPen: j.presence_penalty || null, stream: pick(j.stream_openai, true), squash: pick(j.squash_system_messages, true),
    minP: num(j.min_p) || null, topA: num(j.top_a) || null, repPen: num(j.repetition_penalty) && j.repetition_penalty !== 1 ? j.repetition_penalty : null, seed: num(j.seed) !== null && j.seed !== -1 ? j.seed : null,
    prefill: j.assistant_prefill || '', effort: EFFORTS.includes(j.reasoning_effort as string) ? j.reasoning_effort : '',
  });
  for (const [mine, theirs] of NUDGES) if (typeof j[theirs] === 'string' && j[theirs]) (p.params as Record<string, unknown>)[mine] = j[theirs];
  // 드림랜드에서 내보낼 때 "정하지 않음"이던 값은 파일에 기본값으로 적혀 있다. 그 값이 그대로면 다시 "정하지 않음"으로
  const dl = j.extensions?.dreamland as { unset?: unknown } | undefined, unset = K.arr<string>(dl?.unset);
  const asWritten: Record<string, unknown> = { topP: j.top_p, freqPen: j.frequency_penalty, presPen: j.presence_penalty, topK: j.top_k, minP: j.min_p, topA: j.top_a, repPen: j.repetition_penalty, seed: j.seed };
  for (const k of unset) if (k in asWritten && asWritten[k] === UNSET_AS[k]) (p.params as Record<string, unknown>)[k] = null;
  const keep = Object.fromEntries(Object.entries(j).filter(([k]) => !CC_OWN.has(k) && !CC_SECRET.has(k)));
  const extOther = Object.fromEntries(Object.entries(j.extensions || {}).filter(([k]) => k !== 'regex_scripts' && k !== 'dreamland'));
  if (Object.keys(extOther).length) keep.extensions = extOther;
  const prompts = new Map(K.arr<StPrompt>(j.prompts).map(x => [x.identifier, x]));
  const orders = K.arr<{ character_id?: number; order?: StOrder[] }>(j.prompt_order);
  const order: StOrder[] = (orders.find(o => o.character_id === 100001) || orders[orders.length - 1])?.order || K.arr<StPrompt>(j.prompts).map(x => ({ identifier: x.identifier, enabled: x.enabled !== false }));
  const fmt = (s: unknown, key: string) => typeof s === 'string' && s.trim() && s.trim() !== `{{${key}}}` && s.trim() !== '{0}' ? s.replace(`{{${key}}}`, '{{slot}}').replace('{0}', '{{slot}}') : '';
  const blocks: Block[] = [];
  for (const o of order) {
    const x: StPrompt = prompts.get(o.identifier) || { identifier: o.identifier };
    const kind = ST_KIND[o.identifier] || 'text';
    if (kind === 'text' && !x.content && x.marker) continue;
    let content = x.content || '';
    if (kind === 'charPersonality') content = fmt(j.personality_format, 'personality');
    else if (kind === 'scenario') content = fmt(j.scenario_format, 'scenario');
    else if (kind === 'worldInfoBefore' || kind === 'worldInfoAfter') content = fmt(j.wi_format, 'x');
    else if (kind !== 'text' && kind !== 'main' && kind !== 'jailbreak') content = '';
    if (kind === 'chatHistory' && !blocks.some(b => b.kind === 'summary')) blocks.push({ id: K.uid(), kind: 'summary', name: K.MARKERS.summary, role: 'system', content: '{{slot}}', enabled: true, depth: null });
    blocks.push({ id: K.uid(), kind, name: kind === 'text' ? (x.name || ST_NAME[o.identifier] || o.identifier) : K.MARKERS[kind], role: x.role || 'system', content, enabled: o.enabled !== false, depth: x.injection_position === 1 ? (x.injection_depth ?? 4) : null, ...(kind === 'text' ? { stId: o.identifier } : {}) });
  }
  if (!blocks.some(b => b.kind === 'chatHistory')) blocks.push({ id: K.uid(), kind: 'chatHistory', name: K.MARKERS.chatHistory, role: 'system', content: '', enabled: true, depth: null });
  p.blocks = blocks;
  // 순서에 없는 프롬프트 · 다른 캐릭터용 순서는 쓰지 않지만 보관했다가 그대로 내보낸다
  const inOrder = new Set(order.map(o => o.identifier));
  const unused = K.arr<StPrompt>(j.prompts).filter(x => !inOrder.has(x.identifier));
  const otherOrders = orders.filter(o => o.order !== order);
  p.st = { cc: keep, ...(unused.length ? { prompts: unused } : {}), ...(otherOrders.length ? { orders: otherOrders } : {}) };
  p.regex = K.arr<unknown>(j.extensions?.regex_scripts).filter((r): r is StRegex => !!r && typeof r === 'object').map((r, i) => ({ ...stRegexToRegex(r, 'preset'), order: i }));   // 프리셋에 실린 정규식은 프리셋과 함께 다닌다
  return { preset: p, regex: [] };
}
/** 드림랜드 프리셋 → Chat Completion 프리셋 JSON. 프리셋에 실린 정규식은 extensions.regex_scripts 로 함께 나간다 */
export function presetToSt(p: DPreset) {
  const P = (p.params || {}) as { temperature?: number; freqPen?: number; presPen?: number; topP?: number; topK?: number; minP?: number; topA?: number; repPen?: number; seed?: number; contextSize?: number; maxTokens?: number; stream?: boolean; squash?: boolean; prefill?: string; effort?: string };
  const prompts: O[] = [], order: StOrder[] = [], seen = new Set<string>();
  const fmtOf = (kind: string, key: string) => { const c = (p.blocks || []).find(b => b.kind === kind)?.content || ''; return c.includes('{{slot}}') ? c.replace(/\{\{slot\}\}/g, () => key) : key; };
  for (const b of p.blocks || []) {
    const text = b.kind === 'text' || b.kind === 'main' || b.kind === 'jailbreak';
    if (!text && !ST_KIND[b.kind]) continue;                       // 장기기억 자리처럼 드림랜드에만 있는 칸
    const identifier = b.kind === 'text' ? String(b.stId || b.id) : b.kind;
    if (seen.has(identifier)) continue; seen.add(identifier);
    const depth = b.depth != null && b.depth !== '' && !isNaN(+b.depth) ? +b.depth : null;
    prompts.push(text
      ? { identifier, name: b.name || identifier, system_prompt: b.kind !== 'text', role: b.role || 'system', content: b.content || '', injection_position: depth === null ? 0 : 1, injection_depth: depth ?? 4, forbid_overrides: false }
      : { identifier, name: b.name || identifier, system_prompt: true, marker: true });
    order.push({ identifier, enabled: b.enabled !== false });
  }
  const st = (p.st || {}) as { cc?: O; prompts?: StPrompt[]; orders?: { character_id?: number; order?: StOrder[] }[] };
  for (const x of st.prompts || []) if (!seen.has(x.identifier)) { seen.add(x.identifier); prompts.push(x); }
  const keep = (st.cc || {}) as O, keepExt = (keep.extensions && typeof keep.extensions === 'object' ? keep.extensions : {}) as O;
  const out: O = {
    ...keep,
    temperature: P.temperature ?? 1, frequency_penalty: P.freqPen ?? 0, presence_penalty: P.presPen ?? 0, top_p: P.topP ?? 1, top_k: P.topK ?? 0,
    min_p: P.minP ?? 0, top_a: P.topA ?? 0, repetition_penalty: P.repPen ?? 1, seed: P.seed ?? -1,
    openai_max_context: P.contextSize ?? 128000, openai_max_tokens: P.maxTokens ?? 4096, stream_openai: P.stream !== false, squash_system_messages: P.squash !== false,
    assistant_prefill: P.prefill || '', personality_format: fmtOf('charPersonality', '{{personality}}'), scenario_format: fmtOf('scenario', '{{scenario}}'), wi_format: fmtOf('worldInfoBefore', '{0}'),
    prompts, prompt_order: [...(st.orders || []), { character_id: 100001, order }],
    extensions: { ...keepExt, regex_scripts: K.arr<DRegex>(p.regex).map(regexToSt), dreamland: { unset: Object.keys(UNSET_AS).filter(k => (P as Record<string, unknown>)[k] == null) } },
  };
  if (EFFORTS.includes(P.effort as string)) out.reasoning_effort = P.effort;
  for (const [mine, theirs] of NUDGES) { const v = (P as Record<string, unknown>)[mine]; if (typeof v === 'string' && v) out[theirs] = v; }
  return out;
}
/** 텍스트 완성형 프리셋(KoboldAI · Text Generation WebUI 계열)인가 */
export const isStTcPreset = (j: unknown): j is O => !!j && typeof j === 'object' && !Array.isArray(j) && 'temp' in j && ('rep_pen' in j || 'genamt' in j || 'sampler_order' in j || 'sampler_priority' in j) && !('prompts' in j);
/** [드림랜드 값, 파일 키, 정하지 않았을 때 파일에 적는 값] */
const TC_MAP: [string, string, unknown][] = [['temperature', 'temp', 1], ['topP', 'top_p', 1], ['topK', 'top_k', 0], ['topA', 'top_a', 0], ['minP', 'min_p', 0], ['repPen', 'rep_pen', 1], ['freqPen', 'freq_pen', 0], ['presPen', 'presence_pen', 0], ['seed', 'seed', -1]];
/** 텍스트 완성형 프리셋 → 드림랜드 프리셋. 드림랜드가 쓰지 않는 샘플러 값은 preset.st.tc 에 그대로 두었다가 내보낼 때 되돌린다 */
export function stTcToPreset(j: O, name?: string): DPreset {
  const p = K.defaultPreset(); p.name = name || (j.name as string) || '가져온 프리셋';
  const P = p.params as Record<string, unknown>;
  for (const [mine, theirs, unset] of TC_MAP) { const v = num(j[theirs]); P[mine] = v === null || v === unset ? (mine === 'temperature' ? v : null) : v; }
  if (num(j.genamt)) P.maxTokens = j.genamt; if (num(j.max_length)) P.contextSize = j.max_length;
  p.st = { tc: structuredClone(j) };
  return p;
}
/** 드림랜드 프리셋 → 텍스트 완성형 프리셋. 텍스트 완성형에서 온 프리셋이면 원래 파일의 나머지 값을 그대로 살린다 */
export function presetToStTc(p: DPreset): O {
  const P = (p.params || {}) as Record<string, unknown>, base = { ...(((p.st || {}) as { tc?: O }).tc || {}) };
  for (const [mine, theirs, unset] of TC_MAP) if (P[mine] != null || theirs in base || theirs !== 'seed') base[theirs] = P[mine] ?? unset;
  if ('genamt' in base || !p.st) base.genamt = P.maxTokens; if ('max_length' in base || !p.st) base.max_length = P.contextSize;
  return base;
}
/** 이미 가진 프리셋 JSON 에 정규식만 갈아 끼운다 (다른 설정은 그대로) */
export const stPresetWithRegex = (j: O, scripts: unknown) => ({ ...j, extensions: { ...(j.extensions && typeof j.extensions === 'object' && !Array.isArray(j.extensions) ? j.extensions : {}), regex_scripts: K.arr<DRegex>(scripts).map(regexToSt) } });

interface StRow {
  mes?: unknown; name?: string; is_user?: boolean; is_system?: boolean; send_date?: unknown; swipes?: unknown[]; swipe_id?: number; original_avatar?: string;
  swipe_info?: { extra?: { reasoning?: string; model?: unknown } }[]; extra?: { type?: string; reasoning?: string; model?: unknown }; create_date?: unknown; character_name?: string;
  chat_metadata?: { note_prompt?: string; note_depth?: number; note_role?: number; variables?: O }; [k: string]: unknown;
}
/** .jsonl 채팅 → { chat, msgs }.  resolve(m) 은 그룹 채팅에서 화자 캐릭터를 찾는다 */
export function stChatToChat(text: string, { charIds, name, resolve }: { charIds: string[]; name?: string; resolve?: (r: StRow) => string }): { chat: DChat; msgs: DMsg[] } {
  const rows = text.split(/\r?\n/).filter(l => l.trim()).map((l): StRow | null => { try { return JSON.parse(l); } catch { return null; } }).filter((x): x is StRow => !!x);
  const head: StRow = rows[0] && rows[0].mes === undefined ? rows.shift() as StRow : {};
  const meta = head.chat_metadata || {};
  const chat = K.newChat({ name: name || '', charIds, createdAt: K.parseDate(head.create_date) || K.now() });
  if (meta.note_prompt) chat.note = { text: meta.note_prompt, depth: meta.note_depth ?? 4, role: ROLE[meta.note_role ?? 0] || 'system' };
  if (meta.variables && typeof meta.variables === 'object') chat.vars = { ...meta.variables };
  const msgs: DMsg[] = [];
  for (const r of rows) {
    if (typeof r.mes !== 'string') continue;
    const ts = K.parseDate(r.send_date) || K.now();
    const narrator = r.extra?.type === 'narrator' || (r.is_system && !r.is_user && r.name === 'System');
    const role = r.is_user ? 'user' : narrator ? 'system' : 'assistant';
    const swipes: Swipe[] = (Array.isArray(r.swipes) && r.swipes.length ? r.swipes : [r.mes]).map((t, i) => ({ text: String(t), ts, reasoning: (r.swipe_info?.[i]?.extra?.reasoning) || undefined, model: r.swipe_info?.[i]?.extra?.model }));
    const sw = Math.min(swipes.length - 1, Math.max(0, r.swipe_id ?? 0));
    swipes[sw].text = r.mes;
    if (r.extra?.reasoning && !swipes[sw].reasoning) swipes[sw].reasoning = r.extra.reasoning;
    if (r.extra?.model) swipes[sw].model = r.extra.model;
    const m = K.newMsg(role, r.mes, { swipes, sw, ts, name: r.name || '', hidden: !!r.is_system && !narrator });
    if (role === 'assistant') m.charId = resolve ? resolve(r) : charIds[0];
    // 드림랜드가 쓰지 않는 값(그림 · 생성 시각 · 확장 기록 등)은 그대로 두었다가 내보낼 때 되돌린다
    const rest = Object.fromEntries(Object.entries(r).filter(([k]) => !ROW_OWN.has(k)));
    const extra = Object.fromEntries(Object.entries(r.extra || {}).filter(([k]) => k !== 'reasoning' && k !== 'model'));
    if (Object.keys(extra).length) rest.extra = extra;
    if (Array.isArray(r.swipe_info)) rest.swipe_info = r.swipe_info;
    if (Object.keys(rest).length) m.stRow = rest;
    msgs.push(m);
  }
  if (msgs.length) chat.updatedAt = msgs[msgs.length - 1].ts;
  if (meta.note_role != null || Object.keys(meta).some(k => !META_OWN.has(k))) chat.stMeta = Object.fromEntries(Object.entries(meta).filter(([k]) => !META_OWN.has(k) || k === 'note_role'));
  return { chat, msgs };
}
/** 줄에서 드림랜드가 직접 읽는 키 */
const ROW_OWN = new Set(['mes', 'name', 'is_user', 'is_system', 'send_date', 'swipes', 'swipe_id', 'swipe_info', 'extra']);
const META_OWN = new Set(['note_prompt', 'note_depth', 'note_role', 'variables']);
export function chatToStJsonl(chat: Chat, msgs: Msg[], userName: string, charName: string): string {
  const stamp = (t: number) => new Date(t).toISOString();
  const kept = (chat.stMeta || {}) as O;
  const role = Math.max(0, ROLE.indexOf(chat.note?.role as string));
  const lines = [JSON.stringify({ user_name: userName, character_name: charName, create_date: stamp(chat.createdAt), chat_metadata: { ...kept, note_prompt: chat.note?.text || '', note_depth: chat.note?.depth ?? 4, note_role: chat.note?.text || 'note_role' in kept ? role : undefined, variables: chat.vars || {} } })];
  for (const m of msgs) {
    const rest = (m.stRow || {}) as O & { extra?: O; swipe_info?: O[] }, cur = m.swipes[m.sw];
    const extra: O = { ...(rest.extra || {}), ...(m.role === 'system' ? { type: 'narrator' } : {}) };
    if (cur?.reasoning) extra.reasoning = cur.reasoning; if (cur?.model) extra.model = cur.model;
    const many = m.role === 'assistant';
    const info = many ? m.swipes.map((s, i) => { const o: O = { ...(rest.swipe_info?.[i] || {}) }; const x: O = { ...((o.extra as O) || {}) }; if (s.reasoning) x.reasoning = s.reasoning; else delete x.reasoning; if (s.model) x.model = s.model; o.extra = x; o.send_date ??= stamp(s.ts || m.ts); return o; }) : undefined;
    const { extra: _e, swipe_info: _s, ...other } = rest; void _e; void _s;
    lines.push(JSON.stringify({ ...other, name: m.role === 'user' ? userName : (m.name || charName), is_user: m.role === 'user', is_system: m.role === 'system' || !!m.hidden, send_date: stamp(m.ts), mes: cur.text, swipes: many ? m.swipes.map(s => s.text) : undefined, swipe_id: many ? m.sw : undefined, swipe_info: info, extra }));
  }
  return lines.join('\n');
}

// ── 형식 B ──
interface MeRow { id?: string; data?: unknown; avatarPath?: string; [k: string]: unknown }
function meCharData(row: MeRow): CardData {
  let d: unknown = row.data;
  for (let i = 0; i < 3 && typeof d === 'string'; i++) d = K.parseMaybe(d, {});
  if (isObj(d) && d['0'] !== undefined) { // 문자열이 객체로 펼쳐져 저장된 행 복구
    const D = d;
    const nk = Object.keys(D).filter(k => /^\d+$/.test(k)).sort((a, b) => (a as unknown as number) - (b as unknown as number));
    const base = K.parseMaybe<O>(nk.map(k => D[k]).join(''), {});
    const extra = Object.fromEntries(Object.entries(D).filter(([k]) => !/^\d+$/.test(k)));
    d = { ...base, ...extra };
  }
  return (d || {}) as CardData;
}
const ME_LOGIC: Record<string, number> = { and: 0, or: 0, not_all: 1, not: 2, and_all: 3 };
interface MeBook { id?: string; name?: string; description?: string; scanDepth?: number; tokenBudget?: number; recursiveScanning?: unknown; characterId?: string; characterIds?: unknown; isGlobal?: unknown; enabled?: unknown; _chars?: Set<unknown>; [k: string]: unknown }
interface MeEntry {
  lorebookId?: string; name?: string; keys?: unknown; secondaryKeys?: unknown; selective?: unknown; selectiveLogic?: string; content?: string; constant?: unknown; enabled?: unknown; position?: number; depth?: number;
  role?: string; order?: number; probability?: number; caseSensitive?: unknown; matchWholeWords?: unknown; useRegex?: unknown; preventRecursion?: unknown; outletName?: string; group?: string;
  sticky?: number; cooldown?: number; delay?: number; scanDepth?: number; characterFilterMode?: string; characterFilterIds?: unknown; [k: string]: unknown;
}
function meLoreToLore(lb: MeBook, entries: MeEntry[]): LoreBook {
  const book = K.newLore({ name: lb.name || '로어북', description: lb.description || '', scanDepth: lb.scanDepth ?? 4, tokenBudget: lb.tokenBudget || 2048, recursive: K.bool(lb.recursiveScanning) });
  const J = (v: unknown) => K.arr(K.parseMaybe(v, []));
  for (const e of [...entries].sort((a, b) => (a.order ?? 0) - (b.order ?? 0))) {
    book.entries.push(K.newEntry({
      name: e.name || '', keys: J(e.keys).map(String), keys2: K.bool(e.selective) ? J(e.secondaryKeys).map(String) : [], logic: ME_LOGIC[e.selectiveLogic as string] ?? 0, content: e.content || '',
      constant: K.bool(e.constant), enabled: K.bool(e.enabled ?? true), position: ({ 0: 'before', 1: 'after', 2: 'depth', 7: 'outlet' } as Record<number, string>)[e.position as number] || 'before', depth: e.depth ?? 4,
      role: e.role || 'system', order: e.order ?? 100, probability: e.probability ?? 100, caseSensitive: K.bool(e.caseSensitive), wholeWord: K.bool(e.matchWholeWords),
      useRegex: K.bool(e.useRegex), noRecurse: K.bool(e.preventRecursion), outlet: e.outletName || '', group: e.group || '', sticky: e.sticky || null, cooldown: e.cooldown || null, delay: e.delay || null, scanDepth: e.scanDepth ?? null,
    }));
  }
  return book;
}
const snake = (s: unknown) => String(s || '').trim().toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '_').replace(/^_|_$/g, '') || 'section';
interface MePreset { id?: string; name?: string; parameters?: unknown; variableValues?: unknown; defaultChoices?: unknown; wrapFormat?: string; sectionOrder?: unknown; [k: string]: unknown }
interface MeSection {
  id?: string; presetId?: string; groupId?: string; name?: string; content?: string; role?: string; enabled?: unknown; injectionPosition?: string; injectionDepth?: number; injectionOrder?: number;
  isMarker?: unknown; markerConfig?: unknown; identifier?: string; skipWrap?: unknown; wrapInXml?: unknown; xmlTagName?: string; [k: string]: unknown;
}
interface MeGroup { id?: string; presetId?: string; name?: string; enabled?: unknown; [k: string]: unknown }
interface MeChoice { presetId?: string; variableName?: string; separator?: string; multiSelect?: unknown; randomPick?: unknown; options?: unknown; question?: string; [k: string]: unknown }
interface MeParams { temperature?: number; topP?: number; topK?: number; maxTokens?: number; maxContext?: number; frequencyPenalty?: number; presencePenalty?: number; squashSystemMessages?: boolean; stopSequences?: unknown; reasoningEffort?: string }
function mePresetToPreset(pr: MePreset, sections: MeSection[], groups: MeGroup[], choices: MeChoice[]): DPreset {
  const p = K.defaultPreset(); p.name = pr.name || 'Marinara 프리셋';
  const P = K.parseMaybe<MeParams>(pr.parameters, {}) || {};
  Object.assign(p.params, {
    temperature: P.temperature ?? 1, topP: P.topP ?? null, topK: P.topK || null, maxTokens: P.maxTokens ?? 4096, contextSize: P.maxContext ?? 128000,
    freqPen: P.frequencyPenalty || null, presPen: P.presencePenalty || null, squash: P.squashSystemMessages ?? true, stop: K.arr(P.stopSequences),
    effort: ['low', 'medium', 'high', 'xhigh', 'max'].includes(P.reasoningEffort as string) ? P.reasoningEffort : '',
  });
  // 변수(선택지) 값
  const vals: O = { ...(K.parseMaybe<O>(pr.variableValues, {}) || {}), ...(K.parseMaybe<O>(pr.defaultChoices, {}) || {}) };
  const sepOf: Record<string, string> = Object.fromEntries(choices.map(c => [c.variableName as string, c.separator || ', ']));
  // 하나만 고르는 선택지는 프리셋 변수로 옮긴다 (대화방마다 다시 고를 수 있게). 여러 개 고르는 선택지는 고른 값으로 채워 둔다
  p.vars = [];
  for (const c of choices) {
    if (!c.variableName || K.bool(c.multiSelect) || K.bool(c.randomPick)) continue;
    const opts = K.arr<{ id?: unknown; label?: unknown; value?: unknown }>(K.parseMaybe(c.options, [])).map(o => ({ id: o.id, label: String(o.label ?? o.value ?? '').trim(), value: String(o.value ?? '') })).filter(o => o.label);
    if (!opts.length) continue;
    const cur = vals[c.variableName], hit = opts.find(o => o.value === cur || o.label === cur || o.id === cur);
    p.vars.push(opts.length === 1
      ? { id: K.uid(), name: c.variableName, label: c.question || c.variableName, type: 'toggle', default: !!hit, onText: opts[0].value }
      : { id: K.uid(), name: c.variableName, label: c.question || c.variableName, type: 'select', default: (hit || opts[0]).label, options: opts.map(o => ({ label: o.label, value: o.value })) });
    delete vals[c.variableName];
  }
  const fill = (t: unknown) => String(t || '').replace(/\{\{\s*([\w-]+)\s*\}\}/g, (m, k: string) => k in vals ? (Array.isArray(vals[k]) ? (vals[k] as unknown[]).join(sepOf[k] || ', ') : String(vals[k])) : m);
  const wrap = pr.wrapFormat || 'xml';
  const order = K.arr(K.parseMaybe(pr.sectionOrder, []));
  const sorted = [...sections].sort((a, b) => { const ia = order.indexOf(a.id), ib = order.indexOf(b.id); return (ia < 0 || ib < 0) ? (a.injectionOrder ?? 0) - (b.injectionOrder ?? 0) : ia - ib; });
  const gById = new Map(groups.map(g => [g.id, g]));
  const blocks: Block[] = []; let openGroup: MeGroup | null = null;
  const text = (name: string, content: string, extra: O = {}) => blocks.push({ id: K.uid(), kind: 'text', name, role: 'system', content, enabled: true, depth: null, ...extra });
  const closeGroup = () => { if (openGroup && wrap === 'xml') text(`그룹 닫기: ${openGroup.name}`, `</${snake(openGroup.name)}>`); openGroup = null; };
  const frame = (s: MeSection, body: string) => {
    if (K.bool(s.skipWrap)) return body;
    if (K.bool(s.wrapInXml) || wrap === 'xml') { const t = s.xmlTagName || snake(s.name); return `<${t}>\n${body}\n</${t}>`; }
    if (wrap === 'markdown') return `## ${s.name}\n${body}`;
    return body;
  };
  const KIND: Record<string, string[]> = { persona: ['personaDescription'], chat_history: ['chatHistory'], chat_summary: ['summary'], world_info_before: ['worldInfoBefore'], world_info_after: ['worldInfoAfter'], dialogue_examples: ['dialogueExamples'], lorebook: ['worldInfoBefore', 'worldInfoAfter'], character: ['charDescription', 'charPersonality', 'scenario'] };
  for (const s of sorted) {
    const g = s.groupId ? gById.get(s.groupId) : null;
    if ((g?.id || null) !== ((openGroup as MeGroup | null)?.id || null)) { closeGroup(); if (g && K.bool(g.enabled ?? true)) { openGroup = g; if (wrap === 'xml') text(`그룹 열기: ${g.name}`, `<${snake(g.name)}>`); else if (wrap === 'markdown') text(`그룹: ${g.name}`, `# ${g.name}`); } }
    const enabled = K.bool(s.enabled ?? true), role = s.role || 'system';
    const depth = s.injectionPosition === 'depth' ? (s.injectionDepth ?? 0) : null;
    if (K.bool(s.isMarker)) {
      const type = (K.parseMaybe<{ type?: string }>(s.markerConfig, {}) || {}).type || s.identifier;
      const kinds = KIND[type as string]; if (!kinds) continue;
      if (kinds[0] === 'chatHistory') { closeGroup(); blocks.push({ id: K.uid(), kind: 'chatHistory', name: K.MARKERS.chatHistory, role: 'system', content: '', enabled: true, depth: null }); continue; }
      kinds.forEach(kind => blocks.push({ id: K.uid(), kind, name: K.MARKERS[kind], role, enabled, depth, content: kinds.length === 1 ? frame(s, '{{slot}}') : (kind === 'charPersonality' ? "[{{char}}'s personality: {{slot}}]" : kind === 'scenario' ? '[Scenario: {{slot}}]' : '') }));
    } else if ((s.content || '').trim()) {
      text(s.name || '프롬프트', frame(s, fill(s.content)), { role, enabled, depth });
    }
  }
  closeGroup();
  if (!blocks.some(b => b.kind === 'chatHistory')) blocks.push({ id: K.uid(), kind: 'chatHistory', name: K.MARKERS.chatHistory, role: 'system', content: '', enabled: true, depth: null });
  p.blocks = blocks;
  return p;
}

// ════════ 소스 (브리지 서버 / 선택한 폴더) ════════
const BH = { 'Content-Type': 'application/json', 'x-dreamland': '1' };
export const bridge = {
  async ok(): Promise<boolean> { try { return (await (await fetch('/api/ping')).json()).bridge === true; } catch { return false; } },
  async detect(): Promise<Found[]> { try { return await (await fetch('/api/detect')).json(); } catch { return []; } },
  async resolve(path: string): Promise<Found[]> { const r = await fetch('/api/resolve', { method: 'POST', headers: BH, body: JSON.stringify({ path }) }); return r.ok ? r.json() : []; },
};
export function bridgeSource(root: string): Source {
  const post = (url: string, body: O) => fetch(url, { method: 'POST', headers: BH, body: JSON.stringify(body) });
  return {
    label: root,
    async list(sub) { const r = await post('/api/fs/list', { root, sub }); return r.ok ? r.json() : []; },
    async bytes(rel) { const r = await post('/api/fs/read', { root, rel }); if (!r.ok) throw new Error(t('cards.err.readFailed', { file: rel })); return new Uint8Array(await r.arrayBuffer()); },
    async text(rel) { return new TextDecoder().decode(await this.bytes(rel)); },
  };
}
/** <input webkitdirectory> 로 고른 폴더. 가져올 데이터 폴더를 그 안에서 찾아낸다 */
export function filesSource(files: File[]): Source | null {
  const paths = files.map(f => (f.webkitRelativePath || f.name).replace(/\\/g, '/'));
  let prefix: string | null = null, kind: string | null = null;
  const mi = paths.find(p => /(^|\/)storage\/manifest\.json$/.test(p));
  if (mi) { prefix = mi.replace(/storage\/manifest\.json$/, ''); kind = 'marinara'; }
  else {
    const si = paths.filter(p => /(^|\/)settings\.json$/.test(p)).map(p => p.replace(/settings\.json$/, '')).filter(pre => paths.some(p => p.startsWith(pre + 'characters/')));
    if (si.length) { prefix = si.sort((a, b) => a.length - b.length)[0]; kind = 'st'; }
  }
  if (prefix === null) return null;
  const pfx = prefix;
  const map = new Map<string, File>();
  files.forEach((f, i) => { if (paths[i].startsWith(pfx)) map.set(paths[i].slice(pfx.length), f); });
  return {
    kind, label: prefix || files[0]?.name,
    async list(sub) {
      const pre = sub ? sub.replace(/\/?$/, '/') : ''; const seen = new Map<string, FsItem>();
      for (const [p, f] of map) { if (!p.startsWith(pre)) continue; const rest = p.slice(pre.length); const i = rest.indexOf('/'); const name = i < 0 ? rest : rest.slice(0, i); if (name && !seen.has(name)) seen.set(name, { name, dir: i >= 0, size: i < 0 ? f.size : 0, mtime: f.lastModified }); }
      return [...seen.values()];
    },
    async bytes(rel) { const f = map.get(rel); if (!f) throw new Error(t('cards.err.missing', { file: rel })); return new Uint8Array(await f.arrayBuffer()); },
    async text(rel) { const f = map.get(rel); if (!f) throw new Error(t('cards.err.missing', { file: rel })); return f.text(); },
  };
}

// ════════ 저장 도우미 (중복 가져오기 방지: src 키로 갱신) ════════
function tally(): Tally { return { chars: 0, chats: 0, msgs: 0, lore: 0, presets: 0, personas: 0, regex: 0, quick: 0, templates: 0, skipped: 0, errors: [] }; }
interface Upsertable { id: string; src?: string; loreIds?: string[]; createdAt?: number; [k: string]: unknown }
async function upsert<T extends Upsertable>(coll: Coll, obj: T, src: string): Promise<T> {
  obj.src = src;
  const old = src ? (St[coll] as Upsertable[]).find(x => x.src === src) : null;
  if (old) { obj.id = old.id; if (coll === 'chars') { obj.loreIds = [...new Set([...(old.loreIds || []), ...(obj.loreIds || [])])]; obj.createdAt = old.createdAt; } }
  await St.save(coll, obj, true);
  return obj;
}
const avatarFrom = async (bytes: Uint8Array, name: string) => K.shrinkImage(K.bytesToDataURL(bytes, K.mimeOf(name)), 720);
const safe = async <R,>(T: Tally, label: unknown, fn: () => Promise<R>): Promise<R | null> => { try { return await fn(); } catch (e) { console.warn(label, e); T.errors.push(`${label}: ${(e as Error).message}`); return null; } };

async function saveCard(card: Card, avatar: string, src: string, T: Tally): Promise<DChar> {
  const { char, lore, regex } = cardToChar(card, avatar);
  if (lore) { const lb = await upsert('lore', lore, src ? src + '#book' : ''); char.loreIds = [lb.id]; T.lore++; }
  const fresh = !(src && St.chars.some(x => x.src === src));
  const saved = await upsert('chars', char, src);
  let n = 0;
  for (const r of regex) { r.scope = saved.id; r.order = n++; await upsert('regex', r, src ? `${src}#re:${r.name}` : ''); T.regex++; }
  if (regex.length && fresh) askRegexLater('chars', saved.id);
  T.chars++;
  return saved;
}

// ════════ 가져오기: 형식 A ════════
export interface StInventory { chars: string[]; worlds: string[]; presets: string[]; groups: string[]; quick: string[]; chats: string[]; personas: number; regex: number }
interface StSettings {
  world_info_settings?: { world_info_depth?: number; world_info_recursive?: boolean; world_info?: { globalSelect?: unknown } }; world_info?: { globalSelect?: unknown };
  power_user?: { personas?: Record<string, string>; persona_descriptions?: Record<string, { description?: string }>; default_persona?: string }; extension_settings?: { regex?: unknown };
}
export async function scanST(src: Source): Promise<StInventory> {
  const names = async (sub: string, re: RegExp) => (await src.list(sub)).filter(x => !x.dir && re.test(x.name)).map(x => x.name);
  const inv: StInventory = { chars: await names('characters', /\.png$/i), worlds: await names('worlds', /\.json$/i), presets: await names('OpenAI Settings', /\.json$/i), groups: await names('groups', /\.json$/i), quick: await names('QuickReplies', /\.json$/i), chats: [], personas: 0, regex: 0 };
  for (const d of (await src.list('chats')).filter(x => x.dir)) for (const f of await names('chats/' + d.name, /\.jsonl$/i)) inv.chats.push(`${d.name}/${f}`);
  try { const s: StSettings = JSON.parse(await src.text('settings.json')); inv.personas = Object.keys(s.power_user?.personas || {}).length; inv.regex = K.arr(s.extension_settings?.regex).length; } catch { /* 설정 파일이 없으면 0 */ }
  return inv;
}

export async function importST(src: Source, want: Want, progress: Progress = () => { }): Promise<Tally> {
  const T = tally(); const inv = await scanST(src);
  const tag = (s: string) => 'st:' + s;
  let settings: StSettings = {};
  try { settings = JSON.parse(await src.text('settings.json')); } catch { /* 없으면 빈 설정 */ }
  const worldIds = new Map<string, string>();

  if (want.lore) for (const f of inv.worlds) {
    progress(t('cards.progress.lore', { name: f }));
    await safe(T, f, async () => {
      const name = f.replace(/\.json$/i, '');
      const book = worldToLore(JSON.parse(await src.text('worlds/' + f)), name); book.name = name;
      const wi = settings.world_info_settings || {};
      if (wi.world_info_depth != null) book.scanDepth = wi.world_info_depth;
      if (wi.world_info_recursive != null) book.recursive = !!wi.world_info_recursive;
      worldIds.set(name, (await upsert('lore', book, tag('world/' + f))).id); T.lore++;
    });
  }
  if (want.lore) {
    const sel = K.arr<string>(settings.world_info_settings?.world_info?.globalSelect ?? settings.world_info?.globalSelect).map(n => worldIds.get(n)).filter(Boolean) as string[];
    if (sel.length) St.set({ activeLore: [...new Set([...St.settings.activeLore, ...sel])] });
  }

  const charByFile = new Map<string, DChar>();
  if (want.chars) for (const f of inv.chars) {
    progress(t('cards.progress.char', { name: f }));
    await safe(T, f, async () => {
      const bytes = await src.bytes('characters/' + f);
      const card = readPngCard(bytes); if (!card) throw new Error(t('cards.err.noCardShort'));
      const ch = await saveCard(card, await avatarFrom(bytes, f), tag('char/' + f), T);
      const linked = worldIds.get(ch.worldName as string) || St.lore.find(l => l.name === ch.worldName)?.id;
      if (linked && !ch.loreIds.includes(linked)) { ch.loreIds.push(linked); await St.save('chars', ch, true); }
      charByFile.set(f, ch);
    });
  } else for (const c of St.chars) if (c.src?.startsWith('st:char/')) charByFile.set(c.src.slice(8), c);

  if (want.chats) {
    for (const rel of inv.chats) {
      const [dir, file] = rel.split('/'); const key = tag('chat/' + rel);
      const ch = charByFile.get(dir + '.png') || [...charByFile.values()].find(c => c.name === dir);
      if (!ch || St.chats.some(c => c.src === key)) { T.skipped++; continue; }
      progress(t('cards.progress.chat', { name: rel }));
      await safe(T, rel, async () => {
        const { chat, msgs } = stChatToChat(await src.text('chats/' + rel), { charIds: [ch.id], name: file.replace(/\.jsonl$/i, '') });
        if (!msgs.length) { T.skipped++; return; }
        chat.src = key; await St.saveMsgs(chat, msgs); T.chats++; T.msgs += msgs.length;
      });
    }
    for (const gf of inv.groups) await safe(T, gf, async () => {
      const g: { members?: unknown; chats?: unknown; name?: string } = JSON.parse(await src.text('groups/' + gf));
      const members = K.arr<string>(g.members).map(m => charByFile.get(m)).filter(Boolean) as DChar[];
      if (!members.length) { T.skipped++; return; }
      for (const id of K.arr(g.chats)) {
        const key = tag(`gchat/${id}`); if (St.chats.some(c => c.src === key)) { T.skipped++; continue; }
        progress(t('cards.progress.group', { name: g.name }));
        const text = await src.text(`group chats/${id}.jsonl`).catch(() => ''); if (!text) continue;
        const { chat, msgs } = stChatToChat(text, { charIds: members.map(m => m.id), name: `${g.name} · ${id}`, resolve: r => (charByFile.get(r.original_avatar as string) || members.find(m => m.name === r.name) || members[0]).id });
        if (!msgs.length) continue;
        chat.src = key; await St.saveMsgs(chat, msgs); T.chats++; T.msgs += msgs.length;
      }
    });
  }

  // 고급 포맷팅 템플릿 (instruct · context · sysprompt · reasoning 폴더): 기본 제공과 다른 것만 보관함에 넣는다
  if (want.presets) for (const kind of Object.keys(KINDS)) {
    let files: string[] = []; try { files = (await src.list(kind)).filter(x => !x.dir && /\.json$/i.test(x.name)).map(x => x.name); } catch { /* 폴더가 없다 */ }
    for (const f of files) await safe(T, `${kind}/${f}`, async () => { const j = JSON.parse(await src.text(`${kind}/${f}`)); if (tplKind(j) !== kind) return; T.templates += tplImport(j, f).filter(x => !x.same).length; });
  }
  if (want.presets) for (const f of inv.presets) {
    progress(t('cards.progress.preset', { name: f }));
    await safe(T, f, async () => {
      const { preset } = stPresetToPreset(JSON.parse(await src.text('OpenAI Settings/' + f)), f.replace(/\.json$/i, ''));
      if (!want.regex) preset.regex = [];
      const fresh = !St.presets.some(x => x.src === tag('preset/' + f));
      const sp = await upsert('presets', preset, tag('preset/' + f)); T.presets++; T.regex += preset.regex.length;
      if (preset.regex.length && fresh) askRegexLater('presets', sp.id);
    });
  }

  // 텍스트 완성형 프리셋 (KoboldAI · TextGen 폴더)
  if (want.presets) for (const dir of ['KoboldAI Settings', 'TextGen Settings']) {
    let files: string[] = []; try { files = (await src.list(dir)).filter(x => !x.dir && /\.json$/i.test(x.name)).map(x => x.name); } catch { /* 폴더가 없다 */ }
    for (const f of files) await safe(T, `${dir}/${f}`, async () => {
      const j: unknown = JSON.parse(await src.text(`${dir}/${f}`)); if (!isStTcPreset(j)) return;
      await upsert('presets', stTcToPreset(j, f.replace(/\.json$/i, '')), tag(`tc/${dir}/${f}`)); T.presets++;
    });
  }

  if (want.personas) {
    const pu = settings.power_user || {};
    for (const [file, name] of Object.entries(pu.personas || {})) {
      progress(t('cards.progress.persona', { name }));
      await safe(T, name, async () => {
        const avatar = await src.bytes('User Avatars/' + file).then(b => avatarFrom(b, file)).catch(() => '');
        const p = await upsert('personas', K.newPersona({ name, avatar, description: pu.persona_descriptions?.[file]?.description || '' }), tag('persona/' + file)); T.personas++;
        if (pu.default_persona === file) St.set({ activePersona: p.id });
      });
    }
  }

  if (want.regex) for (const r of K.arr<StRegex>(settings.extension_settings?.regex)) { await upsert('regex', stRegexToRegex(r), tag('re/' + (r.id || r.scriptName))); T.regex++; }

  if (want.quick) for (const f of inv.quick) await safe(T, f, async () => {
    const q = JSON.parse(await src.text('QuickReplies/' + f));
    T.quick += qrAddSet(stQrToSet(q, f.replace(/\.json$/i, '')));   // 세트째로 (명령 스크립트 · 자동 실행 설정 포함)
  });

  K.emit('imported'); return T;
}

// ════════ 가져오기: 형식 B ════════
async function meTable<T = O>(src: Source, name: string): Promise<T[]> {
  const rowsOf = (j: unknown): T[] => Array.isArray(j) ? j : K.arr<T>((j as { rows?: unknown } | null)?.rows);
  try { return rowsOf(JSON.parse(await src.text(`storage/tables/${name}.json`))); } catch { /* 폴더 꼴로 다시 */ }
  const out: T[] = [];
  for (const f of await src.list(`storage/tables/${name}`)) {
    if (f.dir || f.name.startsWith('.') || !/\.json$/i.test(f.name)) continue;
    try { out.push(...rowsOf(JSON.parse(await src.text(`storage/tables/${name}/${f.name}`)))); } catch { /* 읽지 못한 파일은 건너뛴다 */ }
  }
  return out;
}
const isMariBuiltin = (row: MeRow, d: CardData) => row.id?.startsWith('__') || (d?.extensions as { isBuiltInAssistant?: unknown } | undefined)?.isBuiltInAssistant;

export interface MeInventory { chars: number; personas: number; chats: number; lore: number; presets: number; regex: number }
export async function scanME(src: Source): Promise<MeInventory> {
  const [chars, personas, chats, lore, presets, regex] = await Promise.all(['characters', 'personas', 'chats', 'lorebooks', 'prompt_presets', 'regex_scripts'].map(t => meTable<MeRow>(src, t)));
  return { chars: chars.filter(r => !isMariBuiltin(r, meCharData(r))).length, personas: personas.length, chats: chats.filter(c => !K.arr(K.parseMaybe(c.characterIds, [])).some(id => String(id).startsWith('__'))).length, lore: lore.length, presets: presets.length, regex: regex.length };
}

interface MePersona { id?: string; name?: string; description?: string; personality?: string; appearance?: string; backstory?: string; avatarPath?: string; isActive?: unknown }
interface MeRegexRow extends StRegex { id?: string; name?: string; targetCharacterIds?: unknown; findRegex?: string; flags?: string }
interface MeChat { id?: string; name?: string; characterIds?: unknown; mode?: string; personaId?: string; createdAt?: unknown; metadata?: unknown }
interface MeMessage { id?: string; chatId?: string; createdAt?: unknown; extra?: unknown; content?: string; activeSwipeIndex?: number; role?: string; characterId?: string }
interface MeSwipe { messageId?: string; index: number; content?: string; createdAt?: unknown; extra?: unknown }
interface MeExtra { thinking?: string; generationInfo?: { model?: unknown } }
export async function importME(src: Source, want: Want, progress: Progress = () => { }): Promise<Tally> {
  const T = tally(); const tag = (s: unknown) => 'me:' + s;
  const avatarOf = async (p: unknown) => {
    const m = String(p || '').match(/\/api\/avatars\/file\/([^?#]+)/); if (!m) return '';
    const f = decodeURIComponent(m[1]);
    return src.bytes('avatars/' + f).then(b => avatarFrom(b, f)).catch(() => '');
  };
  const charMap = new Map<unknown, DChar>(), loreMap = new Map<unknown, string>(), personaMap = new Map<unknown, string>();
  let meBooks: MeBook[] | undefined;

  if (want.lore) {
    const books = await meTable<MeBook>(src, 'lorebooks'), entries = await meTable<MeEntry>(src, 'lorebook_entries');
    const globals: string[] = [];
    for (const lb of books) {
      progress(t('cards.progress.lore', { name: lb.name }));
      await safe(T, lb.name, async () => {
        const mine = entries.filter(e => e.lorebookId === lb.id);
        const saved = await upsert('lore', meLoreToLore(lb, mine), tag('lore/' + lb.id));
        loreMap.set(lb.id, saved.id); T.lore++;
        // 항목에 캐릭터 필터가 걸려 있으면 전역이 아니라 그 캐릭터 전용으로 연결한다
        lb._chars = new Set([lb.characterId, ...K.arr(K.parseMaybe(lb.characterIds, [])), ...mine.flatMap(e => e.characterFilterMode === 'exclude' ? [] : K.arr(K.parseMaybe(e.characterFilterIds, [])))].filter(Boolean));
        if (K.bool(lb.isGlobal) && K.bool(lb.enabled ?? true) && !lb._chars.size) globals.push(saved.id);
      });
    }
    if (globals.length) St.set({ activeLore: [...new Set([...St.settings.activeLore, ...globals])] });
    meBooks = books;
  }

  if (want.chars) for (const row of await meTable<MeRow>(src, 'characters')) {
    const d = meCharData(row); if (isMariBuiltin(row, d)) continue;
    progress(t('cards.progress.char', { name: d.name || row.id }));
    await safe(T, d.name || row.id, async () => {
      const ch = await saveCard({ data: d }, await avatarOf(row.avatarPath), tag('char/' + row.id), T);
      charMap.set(row.id, ch);
    });
  } else for (const c of St.chars) if (c.src?.startsWith('me:char/')) charMap.set(c.src.slice(8), c);

  for (const b of meBooks || []) for (const cid of b._chars || []) {
    const ch = charMap.get(cid), lid = loreMap.get(b.id);
    if (ch && lid && !ch.loreIds.includes(lid)) { ch.loreIds.push(lid); await St.save('chars', ch, true); }
  }

  if (want.personas) for (const p of await meTable<MePersona>(src, 'personas')) {
    progress(t('cards.progress.persona', { name: p.name }));
    await safe(T, p.name, async () => {
      const desc = [p.description, p.personality && `[Personality]\n${p.personality}`, p.appearance && `[Appearance]\n${p.appearance}`, p.backstory && `[Backstory]\n${p.backstory}`].filter(Boolean).join('\n\n');
      const saved = await upsert('personas', K.newPersona({ name: p.name || '나', avatar: await avatarOf(p.avatarPath), description: desc }), tag('persona/' + p.id));
      personaMap.set(p.id, saved.id); T.personas++;
      if (K.bool(p.isActive)) St.set({ activePersona: saved.id });
    });
  } else for (const p of St.personas) if (p.src?.startsWith('me:persona/')) personaMap.set(p.src.slice(11), p.id);

  if (want.presets) {
    const [sections, groups, choices] = await Promise.all([meTable<MeSection>(src, 'prompt_sections'), meTable<MeGroup>(src, 'prompt_groups'), meTable<MeChoice>(src, 'choice_blocks')]);
    for (const pr of await meTable<MePreset>(src, 'prompt_presets')) {
      progress(t('cards.progress.preset', { name: pr.name }));
      await safe(T, pr.name, async () => { await upsert('presets', mePresetToPreset(pr, sections.filter(s => s.presetId === pr.id), groups.filter(g => g.presetId === pr.id), choices.filter(c => c.presetId === pr.id).map(c => ({ ...c }))), tag('preset/' + pr.id)); T.presets++; });
    }
  }

  if (want.regex) for (const r of await meTable<MeRegexRow>(src, 'regex_scripts')) {
    const targets = K.arr(K.parseMaybe(r.targetCharacterIds, []));
    const rx = stRegexToRegex({ ...r, scriptName: r.name, placement: K.arr(K.parseMaybe(r.placement, [])), trimStrings: K.arr(K.parseMaybe(r.trimStrings, [])), applyMode: r.applyMode || (K.bool(r.promptOnly) ? 'prompt' : 'display'), findRegex: /^\/[\s\S]+\/[a-z]*$/.test(r.findRegex || '') ? r.findRegex : `/${String(r.findRegex || '').replace(/\//g, '\\/')}/${r.flags || 'g'}` }, charMap.get(targets[0])?.id || 'global');
    await upsert('regex', rx, tag('re/' + r.id)); T.regex++;
  }

  if (want.chats) {
    const chats = await meTable<MeChat>(src, 'chats'), messages = await meTable<MeMessage>(src, 'messages'), swipes = await meTable<MeSwipe>(src, 'message_swipes');
    const swByMsg = new Map<unknown, MeSwipe[]>(); for (const s of swipes) ((swByMsg.get(s.messageId) || swByMsg.set(s.messageId, []).get(s.messageId)) as MeSwipe[]).push(s);
    for (const c of chats) {
      const ids = K.arr(K.parseMaybe(c.characterIds, [])); const key = tag('chat/' + c.id);
      const members = ids.map(id => charMap.get(id)).filter(Boolean) as DChar[];
      if (!members.length || St.chats.some(x => x.src === key)) { T.skipped++; continue; }
      progress(t('cards.progress.chat', { name: c.name }));
      await safe(T, c.name, async () => {
        const meta = K.parseMaybe<{ summary?: unknown; activeLorebookIds?: unknown }>(c.metadata, {}) || {};
        const chat = K.newChat({ name: c.name || '', mode: c.mode === 'conversation' ? 'talk' : 'rp', charIds: members.map(m => m.id), personaId: personaMap.get(c.personaId) || '', createdAt: K.parseDate(c.createdAt) || K.now(), summary: typeof meta.summary === 'string' ? meta.summary : '', loreIds: K.arr(meta.activeLorebookIds).map(id => loreMap.get(id)).filter(Boolean), src: key });
        const msgs = messages.filter(m => m.chatId === c.id).sort((a, b) => K.parseDate(a.createdAt) - K.parseDate(b.createdAt)).map(m => {
          const ts = K.parseDate(m.createdAt) || K.now(); const ex = K.parseMaybe<MeExtra>(m.extra, {}) || {};
          const sw = (swByMsg.get(m.id) || []).sort((a, b) => a.index - b.index).map(s => { const e = K.parseMaybe<MeExtra>(s.extra, {}) || {}; return { text: s.content || '', ts: K.parseDate(s.createdAt) || ts, reasoning: e.thinking || undefined, model: e.generationInfo?.model }; });
          const list = sw.length ? sw : [{ text: m.content || '', ts, reasoning: ex.thinking || undefined, model: ex.generationInfo?.model }];
          const idx = Math.min(list.length - 1, Math.max(0, m.activeSwipeIndex ?? 0));
          const role = m.role === 'user' ? 'user' : m.role === 'assistant' ? 'assistant' : 'system';
          const who = charMap.get(m.characterId) || members[0];
          return K.newMsg(role, '', { swipes: list, sw: idx, ts, charId: role === 'assistant' ? who.id : '', name: role === 'assistant' ? who.name : '' });
        });
        if (!msgs.length) { T.skipped++; return; }
        chat.updatedAt = msgs[msgs.length - 1].ts; chat.summaryAt = chat.summary ? msgs.length : 0;
        await St.saveMsgs(chat, msgs); T.chats++; T.msgs += msgs.length;
      });
    }
  }
  K.emit('imported'); return T;
}

// ════════ 개별 파일 (자동 판별) ════════
interface MeExport { app?: string; type?: unknown; data?: O & { data?: unknown; avatar?: string; name?: string; description?: string; personality?: string; appearance?: string; backstory?: string; lorebook?: MeBook; entries?: unknown; preset?: MePreset; sections?: unknown; groups?: unknown; choiceBlocks?: unknown }; chars?: unknown; chats?: unknown; [k: string]: unknown }
export async function importFiles(files: File[], progress: Progress = () => { }): Promise<Tally> {
  const T = tally();
  for (const f of files) {
    progress(f.name);
    await safe(T, f.name, async () => {
      const ext = (f.name.split('.').pop() as string).toLowerCase(); const base = f.name.replace(/\.[^.]+$/, '');
      if (['png', 'webp', 'jpg', 'jpeg'].includes(ext)) {
        const bytes = new Uint8Array(await f.arrayBuffer()); const card = readPngCard(bytes);
        if (!card) throw new Error(t('cards.err.noCard'));
        await saveCard(card, await avatarFrom(bytes, f.name), '', T); return;
      }
      const text = await f.text();
      if (ext === 'jsonl') {
        const head = JSON.parse(text.split(/\r?\n/).find(l => l.trim()) || '{}');
        const firstAi = text.split(/\r?\n/).map((l): StRow | null => { try { return JSON.parse(l); } catch { return null; } }).find(r => r && r.mes !== undefined && !r.is_user);
        const cname = (head.character_name && head.character_name !== 'unused' ? head.character_name : firstAi?.name) || base;
        let ch = St.chars.find(c => c.name === cname);
        if (!ch) { ch = await St.save('chars', K.newChar({ name: cname }), true); T.chars++; }
        const { chat, msgs } = stChatToChat(text, { charIds: [ch.id], name: base });
        await St.saveMsgs(chat, msgs); T.chats++; T.msgs += msgs.length; return;
      }
      const j = JSON.parse(text);
      const M = j as MeExport;
      if (M.app === 'dreamland') { await St.importAll(j, false); T.chars += K.arr(M.chars).length; T.chats += K.arr(M.chats).length; return; }
      if (typeof M.type === 'string' && M.type.startsWith('marinara_') && M.data) {
        const d = M.data;
        if (M.type === 'marinara_character') { await saveCard((d.data ? d : { data: d }) as Card, d.avatar ? await K.shrinkImage(d.avatar, 720) : '', '', T); return; }
        if (M.type === 'marinara_persona') { await St.save('personas', K.newPersona({ name: d.name || '나', description: [d.description, d.personality, d.appearance, d.backstory].filter(Boolean).join('\n\n'), avatar: d.avatar ? await K.shrinkImage(d.avatar, 720) : '' }), true); T.personas++; return; }
        if (M.type === 'marinara_lorebook') { await St.save('lore', meLoreToLore((d.lorebook || d) as MeBook, K.arr<MeEntry>(d.entries)), true); T.lore++; return; }
        if (M.type === 'marinara_preset') { await St.save('presets', mePresetToPreset((d.preset || d) as MePreset, K.arr<MeSection>(d.sections), K.arr<MeGroup>(d.groups), K.arr<MeChoice>(d.choiceBlocks)), true); T.presets++; return; }
        throw new Error(t('cards.err.meUnsupported', { type: M.type }));
      }
      if (j.spec || (j.name && (j.first_mes !== undefined || j.description !== undefined)) || j.data?.first_mes !== undefined) { await saveCard(j, '', '', T); return; }
      if (j.entries && typeof j.entries === 'object') { const b = worldToLore(j, base); if (!j.name) b.name = base; await St.save('lore', b, true); T.lore++; return; }
      if (Array.isArray(j.prompts) || j.prompt_order || j.openai_max_tokens !== undefined) {
        const { preset } = stPresetToPreset(j, base); await St.save('presets', preset, true); T.presets++; T.regex += preset.regex.length;
        if (preset.regex.length) askRegexLater('presets', preset.id);
        return;
      }
      if (isStTcPreset(j)) { await St.save('presets', stTcToPreset(j, base), true); T.presets++; return; }   // 텍스트 완성형 프리셋
      const rs: unknown[] = Array.isArray(j) ? j : [j];
      if (rs.length && rs.every(r => r && ((r as StRegex).findRegex !== undefined || (r as { find?: unknown }).find !== undefined))) { let n = St.regex.reduce((m, r) => Math.max(m, +(r.order as number) || 0), 0); for (const r of regexFromJson(rs)) { r.order = ++n; await St.save('regex', r, true); T.regex++; } return; }
      if (tplKind(j) || Object.keys(KINDS).some(k => tplKind(j[k]) === k)) { T.templates += tplImport(j, base).length; return; }   // 고급 포맷팅 템플릿 (낱개 · 전체 내보내기)
      if (Array.isArray(j.qrList) || Array.isArray(j.quickReplySlots)) { T.quick += qrAddSet(stQrToSet(j, base)); return; }   // Quick Reply 세트
      throw new Error(t('cards.err.unknown'));
    });
  }
  K.emit('imported'); return T;
}

export const summarize = (T: Tally) => ([['chars', T.chars], ['chats', T.chats], ['msgs', T.msgs], ['lore', T.lore], ['presets', T.presets], ['personas', T.personas], ['regex', T.regex], ['quick', T.quick], ['templates', T.templates]] as [string, number][]).filter(([, n]) => n).map(([k, n]) => t('cards.sum.' + k, { n })).join(' · ') || t('cards.sum.none');
