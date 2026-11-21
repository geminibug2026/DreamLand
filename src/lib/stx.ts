// ── 실리태번용으로 내보내기: 캐릭터 하나를 실리태번에서 바로 쓸 수 있는 묶음(.zip)으로 ──
// 카드(PNG, 연결된 로어북을 모두 합친 책 · 캐릭터 정규식 · Tavern Helper 스크립트) + 로어북 따로 · 퀵 리플라이 · 프리셋 · 전역 정규식 + README.txt
// 그리고 실리태번에서 그대로는 안 되는 것(드림랜드에만 있는 명령 · 매크로 · 기능)을 미리 짚는다.
// 저장소 · 화면을 모른다: 부르는 쪽(src/editors/StExport.tsx)이 자료를 모아 넘긴다 (node 로 따로 시험한다)
import { buildCard, stKeepsBlock, loreToCardBook, loreToWorld, presetToSt, presetToStTc, regexToSt, writePngCard, type DChar, type DPreset, type DRegex, type LoreBook, type LoreEntry, type PackNote } from './cards';
import { setToStQr, type QrSet } from './qr-data';
import type { ThScript } from './thscripts';
import { lintScript } from '../stscript/lint';
import { t } from '../i18n';

type O = Record<string, unknown>;
const isObj = (v: unknown): v is O => !!v && typeof v === 'object' && !Array.isArray(v);

// ════════ 확장 · 주소 ════════
/** 실리태번에 깔아야 할 수 있는 것: 이름 · 주소 (README 에 적는다) */
export const ST_EXT = {
  th: { name: 'Tavern Helper (JS-Slash-Runner, 酒馆助手)', url: 'https://github.com/N0VI028/JS-Slash-Runner' },
  mvu: { name: 'MVU (MagVarUpdate)', url: 'https://github.com/MagicalAstrogy/MagVarUpdate' },
  mvuZod: { name: 'MVU zod (mvu_zod.js)', url: 'https://github.com/StageDog/tavern_resource' },
  lalib: { name: 'LALib', url: 'https://github.com/LenAnderson/SillyTavern-LALib' },
  ejs: { name: 'ST-Prompt-Template', url: 'https://github.com/zonde306/ST-Prompt-Template' },
} as const;
export type Need = keyof typeof ST_EXT;
/** MVU 를 실리태번에서 돌리는 스크립트 한 줄 (MVU 설명서에 적힌 그대로) */
export const MVU_LOADER = "import 'https://gcore.jsdelivr.net/gh/MagicalAstrogy/MagVarUpdate@master/artifact/bundle.js';";
/** Tavern Helper 가 더하는 슬래시 명령 */
const TH_CMDS = ['event-emit', 'audioenable', 'audioimport', 'audiomode', 'audioplay', 'audioselect'];
/** 드림랜드 확장 매크로 가운데 실리태번에도 같은 이름이 있는 것 */
export const ST_MACROS_TOO = ['idle_duration', 'lastgenerationtype', 'pipe'];

// ════════ Tavern Helper 스크립트 꼴 (JS-Slash-Runner 의 캐릭터 설정: extensions.tavern_helper = { scripts, variables }) ════════
export interface ThOut { type: 'script'; enabled: boolean; name: string; id: string; content: string; info: string; button: { enabled: boolean; buttons: { name: string; visible: boolean }[] }; data: O; export_with: { data: boolean; button: boolean } }
export interface ThFolder { type: 'folder'; enabled: boolean; name: string; id: string; icon?: string; color?: string; scripts: ThOut[] }
export type ThTree = ThOut | ThFolder;
const str = (v: unknown, d = '') => typeof v === 'string' ? v : v == null ? d : String(v);
let seq = 0;
const newId = () => (globalThis.crypto?.randomUUID?.() || `dl-${Date.now().toString(36)}-${(++seq).toString(36)}`);
/** 스크립트 하나를 Tavern Helper 꼴로. on: 드림랜드에서 켜고 끈 상태 (없으면 스크립트에 적힌 대로, 적힌 것도 없으면 켬) */
export function thScript(raw: O, on?: boolean): ThOut {
  const b = isObj(raw.button) ? raw.button : null, buttons = (Array.isArray(b?.buttons) ? b.buttons : Array.isArray(raw.buttons) ? raw.buttons : []) as unknown[];
  const ew = isObj(raw.export_with) ? raw.export_with : {};
  return {
    type: 'script', enabled: on ?? (raw.enabled !== false), name: str(raw.name), id: str(raw.id) || newId(), content: str(raw.content), info: str(raw.info),
    button: { enabled: b ? b.enabled !== false : true, buttons: buttons.filter(isObj).map(x => ({ name: str(x.name), visible: x.visible !== false })) },
    data: isObj(raw.data) ? raw.data : {}, export_with: { data: ew.data !== false, button: ew.button !== false },
  };
}
/** 카드 확장 필드의 스크립트(새 꼴 · [키, 값] 짝 배열 · 옛 TavernHelper_scripts) + 고른 라이브러리 스크립트 → { scripts, variables }.
 *  onOf: 카드 스크립트 id → 드림랜드에서 정한 켜짐 */
export function thBlock(ext: O | undefined, extra: ThScript[] = [], onOf: (id: string) => boolean | undefined = () => undefined): { scripts: ThTree[]; variables: O } {
  const x = ext || {};
  let th = x.tavern_helper as unknown;
  if (Array.isArray(th)) th = Object.fromEntries(th.filter((p): p is [string, unknown] => Array.isArray(p) && typeof p[0] === 'string'));
  const T = isObj(th) ? th : {};
  const raw = (Array.isArray(T.scripts) ? T.scripts : Array.isArray(x.TavernHelper_scripts) ? x.TavernHelper_scripts : []) as unknown[];
  const variables = isObj(T.variables) ? T.variables : isObj(x.TavernHelper_characterScriptVariables) ? x.TavernHelper_characterScriptVariables : {};
  const one = (it: O): ThOut => { const s = it.type === 'script' && isObj(it.value) ? it.value : it; return thScript(s, onOf(str(s.id || s.name))); };
  const scripts: ThTree[] = raw.filter(isObj).map((it): ThTree => it.type === 'folder'
    ? { type: 'folder', enabled: it.enabled !== false, name: str(it.name), id: str(it.id) || newId(), ...(typeof it.icon === 'string' ? { icon: it.icon } : {}), ...(typeof it.color === 'string' && it.color ? { color: it.color } : {}),
      scripts: ((Array.isArray(it.scripts) ? it.scripts : Array.isArray(it.value) ? it.value : []) as unknown[]).filter(isObj).map(one) }
    : one(it));
  const flat = scripts.flatMap(s => s.type === 'folder' ? s.scripts : [s]);
  for (const s of extra) {
    if (flat.some(f => f.id === s.id || (f.content === s.content && f.name === s.name))) continue;
    const o = thScript({ id: s.id, name: s.name, content: s.content, info: s.info || '' }, true);
    scripts.push(o); flat.push(o);
  }
  return { scripts, variables };
}
export const flatScripts = (tree: ThTree[]) => tree.flatMap(s => s.type === 'folder' ? s.scripts : [s]);

// ════════ 로어북 합치기 ════════
/** 여러 책 → 카드에 넣을 책 하나. 순서 · 항목 설정은 그대로, 책마다 달랐던 설정(대소문자 · 낱말 단위 · 훑는 깊이 · 재귀)은 항목에 옮겨 적는다 */
export function mergeBooks(books: LoreBook[], name: string): LoreBook | null {
  if (!books.length) return null;
  if (books.length === 1) return books[0];
  const recursive = books.some(b => b.recursive), depth = Math.max(...books.map(b => b.scanDepth ?? 4));
  const entries: LoreEntry[] = books.flatMap(b => (b.entries || []).map(e => ({
    ...e,
    caseSensitive: e.caseSensitive ?? (b.caseSensitive ? true : null), wholeWord: e.wholeWord ?? (b.wholeWord ? true : null),
    scanDepth: e.scanDepth ?? ((b.scanDepth ?? 4) !== depth ? (b.scanDepth ?? 4) : null),
    ...(recursive && !b.recursive ? { noRecurse: true } : {}),
    more: { ...(e.more || {}), book: b.name },
  })));
  return { id: books[0].id, name, description: books.map(b => b.description).filter(Boolean).join('\n\n'), scanDepth: depth, tokenBudget: Math.max(...books.map(b => b.tokenBudget || 2048)), recursive, caseSensitive: false, wholeWord: false, entries };
}
/** 카드 책: 합친 책이면 항목마다 원래 책 이름을 extensions.dreamland_book 에 남긴다 */
export function cardBook(book: LoreBook) {
  const cb = loreToCardBook(book);
  cb.entries.forEach((e, i) => { const from = book.entries[i]?.more?.book; if (typeof from === 'string') (e.extensions as O).dreamland_book = from; });
  return cb;
}

// ════════ 모은 자료 ════════
export interface PackInput {
  char: DChar;
  /** 캐릭터에 연결된 로어북 (연결 순서) */
  books: LoreBook[];
  /** 캐릭터에 묶인 정규식 (순서대로) */
  regex: DRegex[];
  /** 라이브러리에서 골라 카드에 붙일 스크립트 */
  scripts?: ThScript[];
  /** 카드 스크립트 id → 드림랜드에서 정한 켜짐 */
  scriptOn?: (id: string) => boolean | undefined;
  /** 함께 담을 퀵 리플라이 세트 · 그 가운데 캐릭터 세트(이름) */
  qrSets?: QrSet[]; charQr?: string[];
  preset?: DPreset | null;
  globalRegex?: DRegex[];
  /** MVU 를 쓰는데 실리태번 쪽 준비물(불러오는 스크립트 · 변수 갱신 숨기기 정규식)이 없으면 넣는다 */
  mvuKit?: boolean;
  /** 이 캐릭터의 대화 가운데 게임 모드를 쓴 것이 있나 */
  game?: boolean;
  /** 대화방 수 (README 에 "대화는 담기지 않아요") */
  chats?: number;
}
/** 명령 · 매크로가 어디 것인지 가르는 표 (부르는 쪽이 앱의 명령 표에서 만든다) */
export interface CompatEnv { core: string[]; lalib: string[]; /** 드림랜드가 아는 모든 명령 이름 */ known: string[]; /** 드림랜드에만 있는 매크로 이름 (작은 글자) */ macros: string[] }

/** 글 조각 하나와 그 자리 (점검 · 확장 알아보기용) */
interface Piece { where: string; text: string; kind: 'card' | 'lore' | 'regex' | 'qr' | 'qrScript' | 'script' | 'preset' }
const MVU_HIDE = /UpdateVariable/;
function pieces(I: PackInput, extra: ThTree[]): Piece[] {
  const c = I.char, out: Piece[] = [];
  const add = (kind: Piece['kind'], where: string, text: unknown) => { if (typeof text === 'string' && text.trim()) out.push({ kind, where, text }); };
  for (const [k, v] of [['description', c.description], ['personality', c.personality], ['scenario', c.scenario], ['firstMes', c.firstMes], ['mesExample', c.mesExample], ['systemPrompt', c.systemPrompt], ['postHistory', c.postHistory], ['depthPrompt', c.depthPrompt?.prompt]] as [string, unknown][]) add('card', t('stx.where.card', { field: t('stx.field.' + k) }), v);
  (c.altGreetings || []).forEach((g, i) => add('card', t('stx.where.alt', { n: i + 1 }), g));
  for (const b of I.books) for (const e of b.entries || []) add('lore', t('stx.where.lore', { book: b.name, entry: e.name || (e.keys || [])[0] || '?' }), e.content);
  for (const r of [...I.regex, ...(I.globalRegex || [])]) { add('regex', t('stx.where.regex', { name: r.name }), r.replace); }
  for (const s of I.qrSets || []) for (const it of s.items) add(/^\s*\//.test(it.text || '') ? 'qrScript' : 'qr', t('stx.where.qr', { set: s.name, label: it.label }), it.text);
  for (const s of flatScripts(extra)) add('script', t('stx.where.script', { name: s.name }), s.content);
  if (I.preset) for (const b of I.preset.blocks || []) add('preset', t('stx.where.preset', { name: b.name || b.kind }), b.content);
  return out;
}

// ════════ 무엇이 필요한가 ════════
const RE = {
  thHtml: /<script\b|html>|<head>|<body\b/i,
  thMacro: /\{\{\s*(get|set)_(message|chat|global|character|preset|script)_variable\b/i,
  thApi: /\b(triggerSlash|getVariables|replaceVariables|insertOrAssignVariables|eventOn|tavern_events|getChatMessages|setChatMessages?|getCharData|TavernHelper)\b/,
  mvu: /<\/?UpdateVariable>|\[mvu_(update|plot)\]|MagVarUpdate|\bMvu\s*\.|mag_variable|stat_data/i,
  mvuZod: /registerMvuSchema|mvu_zod/,
  ejs: /<%[=_-]?[\s\S]*?%>/,
  mvuImport: /MagVarUpdate[^\s'"`]*\/artifact\/bundle\.js/,
  zodImport: /(mvu_zod|variable_zod)\.js/,
};
const initVar = (books: LoreBook[]) => books.some(b => (b.entries || []).some(e => /\[initvar\]/i.test(e.name || '')));
/** 실리태번 명령 표: 이름 그대로이거나 /^틀$/ */
const matcher = (list: string[]) => { const exact = new Set(list.filter(n => !n.startsWith('/'))), pats = list.filter(n => n.startsWith('/')).map(n => new RegExp(n.slice(1, -1))); return (n: string) => exact.has(n) || pats.some(p => p.test(n)); };
/** 글 조각에서 쓴 명령 이름들 (퀵 리플라이 스크립트는 그대로 읽고, 스크립트 · HTML 은 triggerSlash('/…') 같은 글자 속 명령을 찾는다) */
function commandsIn(p: Piece): string[] {
  if (p.kind === 'qrScript') return lintScript(p.text, { cmd: () => null, names: () => [] }).commands.filter(n => !n.startsWith('/:')).map(n => n.slice(1).toLowerCase());
  if (p.kind === 'script' || p.kind === 'regex' || p.kind === 'card') {
    const out: string[] = [];
    for (const m of p.text.matchAll(/\b(?:triggerSlash|executeSlashCommands\w*|slash)\s*\(\s*[`'"]([^`'"]*)/g)) {
      const src = m[1]; if (!/^\s*\//.test(src)) continue;
      try { out.push(...lintScript(src, { cmd: () => null, names: () => [] }).commands.filter(n => !n.startsWith('/:')).map(n => n.slice(1).toLowerCase())); } catch { /* 반쯤 끊긴 글 */ }
    }
    return out;
  }
  return [];
}
/** 쓴 명령마다 어디서 쓰였나 */
function commandUse(ps: Piece[]) {
  const use = new Map<string, Set<string>>();
  for (const p of ps) for (const n of commandsIn(p)) { if (n === '#' || n.startsWith('#')) continue; (use.get(n) || use.set(n, new Set()).get(n)!).add(p.where); }
  return use;
}

/** 실리태번에 깔아야 할 확장 (쓰는 것만) */
export function needsOf(I: PackInput, env: CompatEnv, tree?: ThTree[]): Need[] {
  const th = tree || thBlock(I.char.ext, I.scripts, I.scriptOn).scripts, ps = pieces(I, th), all = ps.map(p => p.text).join('\n');
  const isCore = matcher(env.core), isLalib = matcher(env.lalib);
  const use = commandUse(ps), need = new Set<Need>();
  const mvu = initVar(I.books) || RE.mvu.test(all);
  if (flatScripts(th).length || ps.some(p => p.kind !== 'script' && (RE.thHtml.test(p.text) || RE.thMacro.test(p.text) || (p.kind === 'regex' && RE.thApi.test(p.text)))) || [...use.keys()].some(n => TH_CMDS.includes(n)) || mvu) need.add('th');
  if (mvu) need.add('mvu');
  if (RE.mvuZod.test(all)) need.add('mvuZod');
  if ([...use.keys()].some(n => !isCore(n) && isLalib(n))) need.add('lalib');
  if (ps.some(p => p.kind !== 'script' && RE.ejs.test(p.text))) need.add('ejs');
  return (Object.keys(ST_EXT) as Need[]).filter(k => need.has(k));
}

// ════════ 미리 점검 ════════
export interface Note { level: 'warn' | 'info'; group: 'cmd' | 'macro' | 'feature' | 'script' | 'pack'; text: string; where?: string[] }
const list = (s: Set<string> | string[], n = 4) => { const a = [...s]; return a.length > n ? [...a.slice(0, n), t('stx.andMore', { n: a.length - n })] : a; };
/** 실리태번에서 그대로는 안 되는 것 · 알아 둘 것. 내보내기를 막지는 않는다 */
export function compatCheck(I: PackInput, env: CompatEnv): Note[] {
  const tree = thBlock(I.char.ext, I.scripts, I.scriptOn).scripts, ps = pieces(I, tree), out: Note[] = [];
  const isCore = matcher(env.core), isLalib = matcher(env.lalib), known = new Set(env.known.map(n => n.replace(/^\//, '').toLowerCase()));
  // 명령
  for (const [n, where] of commandUse(ps)) {
    if (isCore(n) || isLalib(n) || TH_CMDS.includes(n)) continue;
    out.push(known.has(n) ? { level: 'warn', group: 'cmd', text: t('stx.chk.dlCmd', { cmd: '/' + n }), where: list(where) } : { level: 'info', group: 'cmd', text: t('stx.chk.unknownCmd', { cmd: '/' + n }), where: list(where) });
  }
  // 매크로
  const dlm = new Set(env.macros.map(m => m.toLowerCase()).filter(m => !ST_MACROS_TOO.includes(m))), macroUse = new Map<string, Set<string>>(), pvar = new Set<string>(), each = new Set<string>(), asks = new Set<string>();
  for (const p of ps) {
    if (p.kind === 'script') continue;
    for (const m of p.text.matchAll(/\{\{\s*([#/]?[\w-]+)/g)) {
      const name = m[1].toLowerCase();
      if (name === 'var' || name === 'pvar') { pvar.add(p.where); continue; }
      if (name === '#each') { each.add(p.where); continue; }
      if (dlm.has(name)) { const k = [...macroUse.keys()].find(x => x.toLowerCase() === name) || m[1]; (macroUse.get(k) || macroUse.set(k, new Set()).get(k)!).add(p.where); }
    }
    if (/\{\{\s*#(if|unless)\b[^}]*\bask\s*:/i.test(p.text)) asks.add(p.where);
  }
  for (const [n, where] of macroUse) out.push({ level: 'warn', group: 'macro', text: t('stx.chk.dlMacro', { macro: `{{${n}}}` }), where: list(where) });
  if (each.size) out.push({ level: 'warn', group: 'macro', text: t('stx.chk.each'), where: list(each) });
  // 드림랜드 기능
  const pv = I.preset?.vars?.length || 0;
  if (pvar.size || pv) out.push({ level: 'warn', group: 'feature', text: t('stx.chk.pvars'), where: pvar.size ? list(pvar) : undefined });
  for (const b of I.books) for (const e of b.entries || []) if (e.ask && e.askMode !== 'off') asks.add(t('stx.where.lore', { book: b.name, entry: e.name || (e.keys || [])[0] || '?' }));
  if (asks.size) out.push({ level: 'warn', group: 'feature', text: t('stx.chk.asks'), where: list(asks) });
  if (I.game) out.push({ level: 'warn', group: 'feature', text: t('stx.chk.game') });
  if (I.preset) { const dropped = (I.preset.blocks || []).filter(b => b.kind && !stKeepsBlock(b.kind)).map(b => b.name || b.kind); if (dropped.length) out.push({ level: 'info', group: 'feature', text: t('stx.chk.presetBlocks', { names: list(dropped).join(', ') }) }); }
  out.push({ level: 'info', group: 'feature', text: t('stx.chk.stays') });
  // 화면 · 스크립트
  const frame = new Set<string>();
  for (const p of ps) if (p.kind !== 'script' && /<script\b/i.test(p.text) && !/html>|<head>|<body\b/i.test(p.text)) frame.add(p.where);
  if (frame.size) out.push({ level: 'warn', group: 'script', text: t('stx.chk.frame'), where: list(frame) });
  const scripts = flatScripts(tree), all = ps.map(p => p.text).join('\n'), mvu = initVar(I.books) || RE.mvu.test(all);
  for (const s of scripts) {
    if (RE.mvuZod.test(s.content) && /registerMvuSchema/.test(s.content) && !RE.zodImport.test(s.content)) out.push({ level: 'warn', group: 'script', text: t('stx.chk.zodImport', { name: s.name }) });
    if (/(?:from\s*|import\s*\(?\s*)['"`](?:\/vendor\/|vendor\/|https?:\/\/(?:localhost|127\.0\.0\.1)[:/])/.test(s.content)) out.push({ level: 'warn', group: 'script', text: t('stx.chk.localImport', { name: s.name }) });
  }
  if (mvu) {
    const loader = scripts.some(s => RE.mvuImport.test(s.content)), hide = [...I.regex, ...(I.globalRegex || [])].some(r => MVU_HIDE.test(r.find || ''));
    if (!loader || !hide) out.push(I.mvuKit ? { level: 'info', group: 'script', text: t('stx.chk.mvuAdded') } : { level: 'warn', group: 'script', text: t('stx.chk.mvuMissing') });
  }
  // 묶음
  if (I.books.length > 1) out.push({ level: 'info', group: 'pack', text: t('stx.chk.merged', { n: I.books.length }) });
  const names = new Set((I.qrSets || []).map(s => s.name)), missing = new Set<string>();
  for (const s of I.qrSets || []) for (const it of s.items) for (const c of it.contextList || []) if (!names.has(c.set)) missing.add(c.set);
  if (missing.size) out.push({ level: 'info', group: 'pack', text: t('stx.chk.qrLinks', { names: list(missing).join(', ') }) });
  if ((I.qrSets || []).some(s => s.scope !== 'global')) out.push({ level: 'info', group: 'pack', text: t('stx.chk.qrScope') });
  return out;
}

// ════════ 묶기 ════════
export interface ZipEntry { name: string; data: Uint8Array }
/** 파일 이름에 쓸 수 없는 글자를 걷어낸다 */
export const safeName = (s: string, d = 'file') => String(s || '').replace(/[\\/:*?"<>|\u0000-\u001f]+/g, ' ').replace(/\s+/g, ' ').trim().replace(/^\.+/, '').slice(0, 80) || d;
const uniq = () => { const used = new Set<string>(); return (base: string) => { let n = base, i = 2; while (used.has(n.toLowerCase())) n = `${base} (${i++})`; used.add(n.toLowerCase()); return n; }; };
const json = (o: unknown) => new TextEncoder().encode(JSON.stringify(o, null, 2));

export interface Pack { files: ZipEntry[]; card: ReturnType<typeof buildCard>; cardV3: ReturnType<typeof buildCard>; needs: Need[]; notes: Note[]; readme: string; book: LoreBook | null; scripts: ThTree[]; regex: unknown[] }
/** 카드 두 판(V2 · V3) · 책 · 스크립트 · 정규식을 만든다 */
export function stCard(I: PackInput) {
  const book = mergeBooks(I.books, I.books.length > 1 ? t('stx.mergedName', { name: I.char.name }) : '');
  const th = thBlock(I.char.ext, I.scripts, I.scriptOn), all = pieces(I, th.scripts).map(p => p.text).join('\n');
  const regex: unknown[] = I.regex.map(regexToSt);
  if (I.mvuKit && (initVar(I.books) || RE.mvu.test(all))) {
    if (!flatScripts(th.scripts).some(s => RE.mvuImport.test(s.content))) th.scripts.unshift(thScript({ id: newId(), name: t('stx.mvuScript'), content: MVU_LOADER, info: t('stx.mvuScriptInfo') }, true));
    if (![...I.regex, ...(I.globalRegex || [])].some(r => MVU_HIDE.test(r.find || ''))) regex.push({ id: newId(), scriptName: t('stx.mvuRegex'), findRegex: '/<UpdateVariable>[\\s\\S]*?<\\/UpdateVariable>/gm', replaceString: '', trimStrings: [], placement: [2], disabled: false, markdownOnly: true, promptOnly: true, runOnEdit: true, substituteRegex: 0, minDepth: null, maxDepth: null });
  }
  const patch: O = { tavern_helper: th.scripts.length || Object.keys(th.variables).length ? { scripts: th.scripts, variables: th.variables } : null, TavernHelper_scripts: null, TavernHelper_characterScriptVariables: null };
  // 상태창 자리: 드림랜드는 인사말에도 상태창 자리(<StatusPlaceHolderImpl/>)를 알아서 붙이지만, 실리태번의 MVU 는 대화가 시작된 뒤 처리한 답에만 붙인다.
  // 그래서 상태창 정규식이 있으면 인사말들 끝에 자리를 미리 적어 둔다 (첫 화면부터 상태창이 보이게)
  const HOLD = '<StatusPlaceHolderImpl/>', wantsBar = regex.some(r => /StatusPlaceHolderImpl/.test(String((r as { findRegex?: string }).findRegex || '')));
  const hold = (g: unknown) => typeof g === 'string' && g.trim() && !g.includes(HOLD) ? g.trimEnd() + '\n\n' + HOLD : g;
  const make = (v3: boolean) => { const c = buildCard(I.char, null, regex, v3, patch); if (book) { (c.data as O).character_book = cardBook(book); (c.data.extensions as O).world = book.name; }
    if (wantsBar) { const d = c.data as O; d.first_mes = hold(d.first_mes); if (Array.isArray(d.alternate_greetings)) d.alternate_greetings = d.alternate_greetings.map(hold); }
    return c; };
  return { card: make(false), cardV3: make(true), book, scripts: th.scripts, regex };
}
/** 묶음 전체. png: 카드를 적어 넣을 그림 (없으면 카드는 JSON 으로만 — 시험용) */
export function buildPack(I: PackInput, env: CompatEnv, png?: Uint8Array): Pack {
  const { card, cardV3, book, scripts, regex } = stCard(I), name = safeName(I.char.name, 'character');
  const files: ZipEntry[] = [];
  files.push(png ? { name: name + '.png', data: writePngCard(png, card, cardV3) } : { name: name + '.json', data: json(cardV3) });
  const lb = uniq(); for (const b of I.books) files.push({ name: `lorebooks/${lb(safeName(b.name, 'lorebook'))}.json`, data: json(loreToWorld(b)) });
  const qn = uniq(), qrNames: string[] = [];
  for (const s of I.qrSets || []) { const n = qn(safeName(s.name, 'quick-reply')); qrNames.push(n); files.push({ name: `quick-replies/${n}.json`, data: json(setToStQr(s)) }); }
  if (I.preset) files.push({ name: 'preset.json', data: json((I.preset.st as { tc?: unknown } | undefined)?.tc ? presetToStTc(I.preset) : presetToSt(I.preset)) });
  const rn = uniq(); for (const r of I.globalRegex || []) files.push({ name: `regex/${rn(safeName(r.name, 'regex'))}.json`, data: json(regexToSt(r)) });
  const needs = needsOf(I, env, scripts), notes = compatCheck(I, env);
  const readme = makeReadme(I, { files: files.map(f => f.name), needs, notes, scripts: flatScripts(scripts).length, regex: regex.length, book });
  files.push({ name: 'README.txt', data: new TextEncoder().encode(readme.replace(/\n/g, '\r\n')) });
  const note: PackNote = { app: 'dreamland-st-pack', v: 1, card: files[0].name, charQr: (I.qrSets || []).filter(s => (I.charQr || []).includes(s.id) || (I.charQr || []).includes(s.name)).map(s => s.name), books: I.books.map(b => b.name) };
  files.push({ name: 'dreamland.json', data: json(note) });
  return { files, card, cardV3, needs, notes, readme, book, scripts, regex };
}

// ════════ README.txt ════════
/** Tavern Helper 가 화면에서 값으로 바꿔 주는 변수 자리 */
const MACRO_VARS = /\{\{(?:get|format)_(?:message|chat|character|preset|global)_variable/;
function makeReadme(I: PackInput, P: { files: string[]; needs: Need[]; notes: Note[]; scripts: number; regex: number; book: LoreBook | null }): string {
  const L: string[] = [], card = P.files[0], ln = (s = '') => L.push(s);
  const has = (dir: string) => P.files.filter(f => f.startsWith(dir + '/'));
  ln(t('stx.rd.title', { name: I.char.name })); ln(t('stx.rd.made', { date: new Date().toISOString().slice(0, 10) })); ln();
  ln('[' + t('stx.rd.inside') + ']');
  ln('- ' + card + ' : ' + t('stx.rd.card', { books: I.books.length, entries: P.book?.entries.length || 0, regex: P.regex, scripts: P.scripts }));
  if (has('lorebooks').length) ln('- lorebooks/ : ' + t('stx.rd.books', { names: I.books.map(b => b.name).join(', ') }));
  if (has('quick-replies').length) ln('- quick-replies/ : ' + t('stx.rd.qr', { names: (I.qrSets || []).map(s => s.name).join(', ') }));
  if (P.files.includes('preset.json')) ln('- preset.json : ' + t('stx.rd.preset', { name: I.preset?.name || '' }));
  if (has('regex').length) ln('- regex/ : ' + t('stx.rd.regex', { n: has('regex').length }));
  ln('- dreamland.json : ' + t('stx.rd.note'));
  ln();
  ln('[' + t('stx.rd.needs') + ']');
  if (!P.needs.length) ln(t('stx.rd.needNone'));
  for (const n of P.needs) { ln('- ' + ST_EXT[n].name + ' — ' + t('stx.rd.why.' + n)); ln('  ' + ST_EXT[n].url); }
  if (P.needs.some(n => n !== 'mvu' && n !== 'mvuZod')) ln(t('stx.rd.install'));
  ln();
  ln('[' + t('stx.rd.steps') + ']');
  let k = 0; const step = (s: string) => ln(`${++k}. ${s}`);
  if (P.needs.length) step(t('stx.rd.s.ext'));
  step(t('stx.rd.s.card', { file: card }));
  if (P.book) step(t('stx.rd.s.book'));
  if (P.regex) step(t('stx.rd.s.regex'));
  if (P.scripts) step(t('stx.rd.s.scripts'));
  if (MACRO_VARS.test(JSON.stringify([I.regex, I.char]))) step(t('stx.rd.s.macro'));
  if (has('lorebooks').length) step(t('stx.rd.s.books'));
  if (has('quick-replies').length) step(t('stx.rd.s.qr'));
  if (P.files.includes('preset.json')) step(t('stx.rd.s.preset'));
  if (has('regex').length) step(t('stx.rd.s.gregex'));
  ln();
  const warns = P.notes.filter(n => n.level === 'warn'), infos = P.notes.filter(n => n.level === 'info');
  if (warns.length) { ln('[' + t('stx.rd.warns') + ']'); for (const n of warns) { ln('- ' + n.text); if (n.where?.length) ln('  (' + n.where.join(' · ') + ')'); } ln(); }
  if (infos.length) { ln('[' + t('stx.rd.infos') + ']'); for (const n of infos) { ln('- ' + n.text); if (n.where?.length) ln('  (' + n.where.join(' · ') + ')'); } ln(); }
  if (I.chats) { ln(t('stx.rd.chats', { n: I.chats })); ln(); }
  ln(t('stx.rd.back'));
  return L.join('\n');
}
