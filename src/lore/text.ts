// 로어북을 글로 주고받기 (순수 계산): Markdown · CSV 로 쓰고 읽기, 겹치는 항목 처리 계획. 화면도 저장소도 모른다 (node 로 따로 돌려 검증한다)
// 손으로 쓰기 쉬운 것이 먼저다 — 자주 쓰는 칸만 싣는다. 묶음 가중치 · 필터 같은 세부 설정까지 옮기려면 JSON 내보내기를 쓴다.
//
// Markdown:
//   # 책 이름
//   > 책 설명 (없어도 됨)
//   Scan depth: 4            ← 책 설정 (없어도 됨)
//
//   ## 항목 이름
//   Keys: 용, 드래곤          ← "이름: 값" 줄들. 빈 줄이 나오면 거기서부터 본문
//   Memo: 사람이 읽는 한 줄
//   Constant: yes
//
//   본문 …
// CSV: 첫 줄이 칸 이름 (book,name,keys,keys2,content,memo,enabled,constant,position,depth,order,probability,sticky,cooldown,delay,group,ask,ask_mode,locked)

export interface TextEntry {
  name: string; keys: string[]; keys2: string[]; content: string;
  description?: string; enabled?: boolean; constant?: boolean; position?: string; depth?: number; outlet?: string; order?: number; probability?: number;
  sticky?: number | null; cooldown?: number | null; delay?: number | null; group?: string; ask?: string; askMode?: 'off' | 'need' | 'wake'; locked?: boolean;
}
export interface TextBook { name: string; description?: string; scanDepth?: number; tokenBudget?: number; recursive?: boolean; entries: TextEntry[] }
export const TEXT_MAX_BYTES = 2 * 1024 * 1024, TEXT_MAX_ENTRIES = 20000;
const POSITIONS = ['before', 'after', 'em_top', 'em_bottom', 'an_top', 'an_bottom', 'depth', 'outlet'];

// ── 작은 도구 ──
/** 쉼표로 이은 목록. 쉼표가 든 값(정규식 등)은 큰따옴표로 감싼다 */
export const joinList = (list: string[]) => (list || []).map(k => String(k)).filter(k => k.trim()).map(k => /[,"]|^\s|\s$/.test(k) ? '"' + k.replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '"' : k).join(', ');
export function splitList(s: string): string[] {
  const out: string[] = []; let cur = '', i = 0, q = false, was = false; const src = String(s ?? '');
  const push = () => { const v = was ? cur : cur.trim(); if (v !== '') out.push(v); cur = ''; was = false; };
  while (i < src.length) {
    const c = src[i];
    if (q) { if (c === '\\' && i + 1 < src.length) { cur += src[++i]; } else if (c === '"') q = false; else cur += c; }
    else if (c === '"' && !cur.trim()) { q = true; was = true; cur = ''; }
    else if (c === ',' || c === '，') push();
    else if (!(was && /\s/.test(c))) cur += c;
    i++;
  }
  push(); return out;
}
const YES = /^(yes|y|true|1|on|예|네|켬|참|是|开)$/i, NO = /^(no|n|false|0|off|아니오|아니요|끔|거짓|否|关)$/i;
const bool = (v: string): boolean | undefined => YES.test(v.trim()) ? true : NO.test(v.trim()) ? false : undefined;
const num = (v: string): number | undefined => { const n = Number(String(v).trim().replace(/%$/, '')); return String(v).trim() !== '' && Number.isFinite(n) ? n : undefined; };
const numOrNull = (v: string): number | null | undefined => { const n = num(v); return n === undefined ? undefined : n > 0 ? n : null; };

// 칸 이름: 영어가 기준이고, 손으로 쓸 때를 위해 한국어 · 중국어 이름도 받는다
const FIELD: Record<string, string> = {};
for (const [k, names] of Object.entries({
  keys: 'keys,key,keywords,키,키워드,关键词', keys2: 'keys2,secondary,secondary keys,보조 키,보조 키워드,次要关键词', description: 'memo,description,note,메모,설명,备注',
  enabled: 'enabled,켬,사용,启用', constant: 'constant,always,상시,늘 켬,常驻', position: 'position,위치,位置', depth: 'depth,깊이,深度', order: 'order,순서,顺序', probability: 'probability,chance,확률,概率',
  sticky: 'sticky,유지,粘性', cooldown: 'cooldown,쉬기,쿨다운,冷却', delay: 'delay,늦추기,延迟', group: 'group,묶음,分组', ask: 'ask,물음,提问', askMode: 'ask_mode,ask mode,askmode,물음 방식,提问方式', locked: 'locked,lock,잠금,锁定',
  name: 'name,title,이름,名称', content: 'content,text,본문,내용,内容', book: 'book,lorebook,책,로어북,世界书',
  scanDepth: 'scan depth,scandepth,살필 깊이,扫描深度', tokenBudget: 'token budget,budget,예산,토큰 예산,预算', recursive: 'recursive,연쇄,递归',
})) for (const n of names.split(',')) FIELD[n] = k;
const fieldOf = (label: string) => FIELD[label.trim().toLowerCase().replace(/\s+/g, ' ')];
const ASK_MODE: Record<string, 'need' | 'wake' | 'off'> = { need: 'need', require: 'need', 필요: 'need', 필요조건: 'need', wake: 'wake', trigger: 'wake', 깨우기: 'wake', off: 'off', 끔: 'off' };

/** "이름: 값" 한 쌍을 항목에 적는다. 알아듣지 못한 값은 버린다 */
function setField(e: TextEntry, k: string, vIn: string, arg = '') {
  const v = vIn.trim();
  switch (k) {
    case 'keys': e.keys = splitList(v); break;
    case 'keys2': e.keys2 = splitList(v); break;
    case 'description': e.description = v; break;
    case 'enabled': { const b = bool(v); if (b !== undefined) e.enabled = b; break; }
    case 'constant': { const b = bool(v); if (b !== undefined) e.constant = b; break; }
    case 'locked': { const b = bool(v); if (b !== undefined) e.locked = b; break; }
    case 'position': { const [p, ...rest] = v.split(/\s+/), pos = p.toLowerCase(); if (!POSITIONS.includes(pos)) break; e.position = pos; const more = rest.join(' ').trim(); if (pos === 'depth' && num(more) !== undefined) e.depth = num(more); if (pos === 'outlet' && more) e.outlet = more; break; }
    case 'depth': { const n = num(v); if (n !== undefined) e.depth = n; break; }
    case 'order': { const n = num(v); if (n !== undefined) e.order = n; break; }
    case 'probability': { const n = num(v); if (n !== undefined) e.probability = Math.max(0, Math.min(100, n)); break; }
    case 'sticky': case 'cooldown': case 'delay': { const n = numOrNull(v); if (n !== undefined) e[k] = n; break; }
    case 'group': e.group = v; break;
    case 'ask': e.ask = v; if (arg && ASK_MODE[arg.trim().toLowerCase()]) e.askMode = ASK_MODE[arg.trim().toLowerCase()]; else if (v && !e.askMode) e.askMode = 'need'; break;
    case 'askMode': { const m = ASK_MODE[v.toLowerCase()]; if (m) e.askMode = m; break; }
    case 'name': e.name = v; break;
    case 'content': e.content = vIn; break;
  }
}
const blank = (name = ''): TextEntry => ({ name, keys: [], keys2: [], content: '' });
const UNNAMED = /^[-—–·]?$/;

// ════════ Markdown ════════
const esc = (line: string) => /^\\*#{1,2}(\s|$)/.test(line) ? '\\' + line : line, unesc = (line: string) => /^\\+#{1,2}(\s|$)/.test(line) ? line.slice(1) : line;
const yes = (b: unknown) => b ? 'yes' : 'no';
export function toMarkdown(books: TextBook[]): string {
  const out: string[] = [];
  for (const b of books) {
    out.push('# ' + (b.name || '').replace(/\s*\n\s*/g, ' ').trim());
    if (b.description?.trim()) out.push(...b.description.trim().split('\n').map(l => '> ' + l));
    if (b.scanDepth != null) out.push('Scan depth: ' + b.scanDepth);
    if (b.tokenBudget != null) out.push('Token budget: ' + b.tokenBudget);
    if (b.recursive) out.push('Recursive: yes');
    out.push('');
    for (const e of b.entries) {
      out.push('## ' + ((e.name || '').replace(/\s*\n\s*/g, ' ').trim() || '—'), 'Keys: ' + joinList(e.keys));
      if (e.keys2?.length) out.push('Secondary: ' + joinList(e.keys2));
      if (e.description?.trim()) out.push('Memo: ' + e.description.replace(/\s*\n\s*/g, ' ').trim());
      if (e.constant) out.push('Constant: yes');
      if (e.enabled === false) out.push('Enabled: no');
      if (e.position && e.position !== 'before') out.push('Position: ' + e.position + (e.position === 'depth' ? ' ' + (e.depth ?? 4) : e.position === 'outlet' && e.outlet ? ' ' + e.outlet : ''));
      if (e.order != null && e.order !== 100) out.push('Order: ' + e.order);
      if (e.probability != null && e.probability !== 100) out.push('Probability: ' + e.probability);
      for (const k of ['sticky', 'cooldown', 'delay'] as const) if (e[k]) out.push(k[0].toUpperCase() + k.slice(1) + ': ' + e[k]);
      if (e.group?.trim()) out.push('Group: ' + e.group.trim());
      if (e.ask?.trim() && e.askMode && e.askMode !== 'off') out.push(`Ask (${e.askMode}): ${e.ask.replace(/\s*\n\s*/g, ' ').trim()}`);
      if (e.locked) out.push('Locked: yes');
      out.push('', ...String(e.content || '').replace(/\r\n?/g, '\n').replace(/^\n+|\s+$/g, '').split('\n').map(esc), '');
    }
  }
  return out.join('\n').replace(/\n{3,}/g, '\n\n').replace(/\s+$/, '') + '\n';
}
const HEAD = /^([^:：(#>\n]{1,24}?)\s*(?:\(([^)]*)\))?\s*[:：]\s?(.*)$/;
export function parseMarkdown(src: string): TextBook[] {
  const lines = String(src ?? '').replace(/^﻿/, '').replace(/\r\n?/g, '\n').split('\n'), books: TextBook[] = [];
  let book: TextBook | null = null, e: TextEntry | null = null, body: string[] = [], inHead = false, bookHead = false;
  const close = () => { if (e) { e.content = body.join('\n').replace(/^\n+|\s+$/g, ''); (book ||= (books[books.push({ name: '', entries: [] }) - 1])).entries.push(e); } e = null; body = []; };
  for (const line of lines) {
    const h1 = /^#\s+(.*)$/.exec(line), h2 = /^##\s*(.*)$/.exec(line);
    if (h2 && !/^###/.test(line)) { close(); book ||= books[books.push({ name: '', entries: [] }) - 1]; const n = h2[1].trim(); e = blank(UNNAMED.test(n) ? '' : n); inHead = true; bookHead = false; continue; }
    if (h1) { close(); book = books[books.push({ name: h1[1].trim(), entries: [] }) - 1]; bookHead = true; continue; }
    if (e) {
      if (inHead) {
        if (!line.trim()) { inHead = false; continue; }
        const m = HEAD.exec(line), k = m && fieldOf(m[1]);
        if (m && k && k !== 'book' && k !== 'scanDepth' && k !== 'tokenBudget' && k !== 'recursive') { setField(e, k, m[3], m[2] || ''); continue; }
        inHead = false;   // 아는 칸이 아니면 여기서부터 본문
      }
      body.push(unesc(line)); continue;
    }
    if (book && bookHead) {
      if (/^>\s?/.test(line)) { book.description = [book.description, line.replace(/^>\s?/, '')].filter(x => x != null && x !== '').join('\n'); continue; }
      const m = HEAD.exec(line), k = m && fieldOf(m[1]);
      if (m && k === 'scanDepth') { const n = num(m[3]); if (n !== undefined) book.scanDepth = n; }
      else if (m && k === 'tokenBudget') { const n = num(m[3]); if (n !== undefined) book.tokenBudget = n; }
      else if (m && k === 'recursive') { const b = bool(m[3]); if (b !== undefined) book.recursive = b; }
    }
  }
  close();
  return books.filter(b => b.name || b.entries.length);
}

// ════════ CSV ════════
export const CSV_COLS = ['book', 'name', 'keys', 'keys2', 'content', 'memo', 'enabled', 'constant', 'position', 'depth', 'order', 'probability', 'sticky', 'cooldown', 'delay', 'group', 'ask', 'ask_mode', 'locked'];
const cell = (v: unknown) => { const s = v == null ? '' : String(v); return /[",\n\r]|^\s|\s$/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
export function toCsv(books: TextBook[]): string {
  const rows = [CSV_COLS.join(',')];
  for (const b of books) for (const e of b.entries) rows.push([b.name, e.name, joinList(e.keys), joinList(e.keys2 || []), String(e.content || '').replace(/\r\n?/g, '\n'), e.description || '', yes(e.enabled !== false), yes(e.constant),
    e.position === 'outlet' && e.outlet ? 'outlet ' + e.outlet : (e.position || 'before'), e.position === 'depth' ? (e.depth ?? 4) : '', e.order ?? 100, e.probability ?? 100, e.sticky || '', e.cooldown || '', e.delay || '', e.group || '',
    e.askMode && e.askMode !== 'off' ? (e.ask || '') : '', e.askMode && e.askMode !== 'off' && e.ask ? e.askMode : '', e.locked ? 'yes' : ''].map(cell).join(','));
  return rows.join('\r\n') + '\r\n';
}
/** CSV 한 덩이를 줄 · 칸으로 (따옴표 안의 줄바꿈 · 쉼표 · "" 를 지킨다) */
export function csvRows(src: string, delim = ','): string[][] {
  const s = String(src ?? '').replace(/^﻿/, ''), rows: string[][] = []; let row: string[] = [], cur = '', q = false, any = false;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (q) { if (c === '"') { if (s[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += c; continue; }
    if (c === '"' && cur === '') { q = true; any = true; }
    else if (c === delim) { row.push(cur); cur = ''; any = true; }
    else if (c === '\n' || c === '\r') { if (c === '\r' && s[i + 1] === '\n') i++; if (any || cur !== '') { row.push(cur); rows.push(row); } row = []; cur = ''; any = false; }
    else { cur += c; any = true; }
  }
  if (any || cur !== '') { row.push(cur); rows.push(row); }
  return rows;
}
export function parseCsv(src: string): TextBook[] {
  const first = String(src ?? '').replace(/^﻿/, '').split(/\r?\n/, 1)[0] || '', delim = [',', ';', '\t'].map(d => [d, first.split(d).length] as const).sort((a, b) => b[1] - a[1])[0][0];
  const rows = csvRows(src, delim); if (!rows.length) return [];
  const cols = rows[0].map(h => fieldOf(h) || ''), books = new Map<string, TextBook>();
  if (!cols.includes('content') && !cols.includes('keys')) return [];   // 칸 이름 줄이 없다
  for (const r of rows.slice(1)) {
    if (!r.some(x => x.trim())) continue;
    const e = blank(); let bname = '';
    cols.forEach((k, i) => { const v = r[i] ?? ''; if (!k) return; if (k === 'book') bname = v.trim(); else if (v.trim() !== '' || k === 'content') setField(e, k, k === 'content' ? v.replace(/\r\n?/g, '\n') : v); });
    e.content = e.content.replace(/^\n+|\s+$/g, ''); if (UNNAMED.test(e.name.trim())) e.name = '';
    if (!e.ask) delete e.askMode;
    if (!books.has(bname)) books.set(bname, { name: bname, entries: [] });
    books.get(bname)!.entries.push(e);
  }
  return [...books.values()];
}
/** 글의 모양을 보고 Markdown 인지 CSV 인지 */
export function sniff(src: string, fileName = ''): 'md' | 'csv' {
  if (/\.csv$/i.test(fileName) || /\.tsv$/i.test(fileName)) return 'csv';
  if (/\.(md|markdown|txt)$/i.test(fileName)) return 'md';
  const head = String(src ?? '').replace(/^﻿/, '').trimStart().split(/\r?\n/, 1)[0] || '';
  return /^#{1,2}\s/.test(head) ? 'md' : head.split(/[,;\t]/).filter(h => fieldOf(h.replace(/^"|"$/g, ''))).length >= 2 ? 'csv' : 'md';
}

// ════════ 겹치는 항목 ════════
export type DupMode = 'skip' | 'rename' | 'overwrite';
export interface PlanRow { entry: TextEntry; status: 'new' | 'skip' | 'rename' | 'overwrite'; /** overwrite 일 때 덮어쓸 기존 항목의 자리 */ target: number; /** 넣을 때 쓸 이름 */ name: string }
/** 같은 항목인지 가리는 값: 이름, 이름이 없으면 키워드 */
export const identity = (e: { name?: string; keys?: string[] }) => (e.name || '').trim().toLowerCase() || ((e.keys || []).length ? 'k:' + (e.keys || []).map(k => String(k).trim().toLowerCase()).join(',') : '');
/** 가져올 항목마다 무엇을 할지 정한다. 이름도 키워드도 없는 항목은 늘 새 항목 */
export function planImport(existing: { name?: string; keys?: string[] }[], incoming: TextEntry[], mode: DupMode): PlanRow[] {
  const at = new Map<string, number>(); existing.forEach((e, i) => { const id = identity(e); if (id && !at.has(id)) at.set(id, i); });
  const names = new Set(existing.map(e => (e.name || '').trim().toLowerCase()).filter(Boolean)), out: PlanRow[] = [];
  for (const e of incoming) {
    const id = identity(e), hit = id ? at.get(id) : undefined;
    if (hit === undefined) { out.push({ entry: e, status: 'new', target: -1, name: e.name }); if (id) at.set(id, -2); if (e.name.trim()) names.add(e.name.trim().toLowerCase()); continue; }
    if (mode === 'skip' || (mode === 'overwrite' && hit === -2)) { out.push({ entry: e, status: 'skip', target: hit, name: e.name }); continue; }   // 같은 파일 안에서 겹친 것은 먼저 나온 것을 쓴다
    if (mode === 'overwrite') { out.push({ entry: e, status: 'overwrite', target: hit, name: e.name }); continue; }
    const base = e.name.trim() || (e.keys[0] || '').trim() || 'entry'; let n = 2; while (names.has(`${base} (${n})`.toLowerCase())) n++;
    const name = `${base} (${n})`; names.add(name.toLowerCase()); out.push({ entry: e, status: 'rename', target: -1, name });
  }
  return out;
}
/** 글에서 읽은 칸만 항목에 옮겨 적는다 (글에 없는 세부 설정은 그대로 둔다) */
export function applyText(target: Record<string, unknown>, e: TextEntry, name = e.name): Record<string, unknown> {
  target.name = name; target.keys = [...e.keys]; target.keys2 = [...e.keys2]; target.content = e.content;
  for (const k of ['description', 'enabled', 'constant', 'position', 'depth', 'outlet', 'order', 'probability', 'sticky', 'cooldown', 'delay', 'group', 'ask', 'askMode', 'locked'] as const) if (e[k] !== undefined) target[k] = e[k];
  return target;
}
/** 로어북 항목(저장된 꼴)에서 글로 내보낼 칸만 뽑는다 */
export function fromEntry(e: Record<string, unknown>): TextEntry {
  const s = (v: unknown) => v == null ? '' : String(v), n = (v: unknown) => v == null || v === '' || !Number.isFinite(Number(v)) ? undefined : Number(v), list = (v: unknown) => Array.isArray(v) ? v.map(x => String(x)).filter(x => x.trim()) : [];
  const mode = e.askMode === 'need' || e.askMode === 'wake' ? e.askMode : undefined;
  return { name: s(e.name), keys: list(e.keys), keys2: list(e.keys2), content: s(e.content), description: s(e.description) || undefined, enabled: e.enabled !== false, constant: !!e.constant, position: s(e.position) || 'before', depth: n(e.depth), outlet: s(e.outlet) || undefined,
    order: n(e.order), probability: n(e.probability), sticky: n(e.sticky) || null, cooldown: n(e.cooldown) || null, delay: n(e.delay) || null, group: s(e.group) || undefined, ask: mode ? s(e.ask) : undefined, askMode: mode, locked: !!e.locked };
}
