// 변수 갱신 틀: 답변에 적힌 _.set(...) · _.add(...) 같은 명령(또는 <JSONPatch>)을 읽어 stat_data 를 고친다.
// 카드의 HTML 상태창은 메시지 변수의 stat_data 를 읽어 그린다. 화면 · 저장과 무관한 순수 함수만 둔다.

export type Obj = Record<string, unknown>;
export interface MvuData { initialized_lorebooks: Record<string, unknown[]>; stat_data: Obj; schema: Obj; display_data?: Obj; delta_data?: Obj }
export interface Command { type: 'set' | 'insert' | 'delete' | 'add'; args: string[]; reason: string; values?: unknown[] }

const isObj = (v: unknown): v is Obj => !!v && typeof v === 'object' && !Array.isArray(v);
export const clone = <T,>(v: T): T => v == null ? v : JSON.parse(JSON.stringify(v)) as T;
export const emptyData = (): MvuData => ({ initialized_lorebooks: {}, stat_data: {}, schema: { type: 'object', properties: {} }, display_data: {}, delta_data: {} });
/** 메시지 변수에 이 틀의 자료가 들어 있는가 */
export const isMvu = (v: unknown): v is MvuData => isObj(v) && isObj(v.stat_data);
/** [값, "설명"] 꼴 */
const isVwd = (v: unknown): v is [unknown, string] => Array.isArray(v) && v.length === 2 && typeof v[1] === 'string';

// ── 경로 ──
const trimQ = (s: string) => s.replace(/^[\\"'` ]+/, '').replace(/[\\"'` ]+$/, '');
/** a.b[0]["c d"].e → ['a', 'b', '0', 'c d', 'e'] */
export function toPath(src: string): string[] {
  const s = trimQ(String(src ?? '')), out: string[] = []; let cur = '', i = 0;
  const push = () => { if (cur !== '') out.push(cur); cur = ''; };
  while (i < s.length) {
    const ch = s[i];
    if (ch === '.') { push(); i++; }
    else if (ch === '[') { push(); const e = s.indexOf(']', i); const inner = e < 0 ? s.slice(i + 1) : s.slice(i + 1, e); const k = trimQ(inner); if (k !== '') out.push(k); i = e < 0 ? s.length : e + 1; }
    else if ((ch === '"' || ch === "'") && cur === '') { const e = s.indexOf(ch, i + 1); if (e < 0) { cur += ch; i++; } else { out.push(s.slice(i + 1, e)); i = e + 1; } }
    else { cur += ch; i++; }
  }
  push(); return out;
}
const own = (o: unknown, k: string) => o != null && typeof o === 'object' && Object.prototype.hasOwnProperty.call(o, k);
function walk(root: unknown, path: string[]): { ok: boolean; value: unknown } {
  let cur = root; for (const k of path) { if (!own(cur, k)) return { ok: false, value: undefined }; cur = (cur as Obj)[k]; }
  return { ok: true, value: cur };
}
export const getAt = (root: unknown, path: string | string[]) => walk(root, Array.isArray(path) ? path : toPath(path)).value;
function parentOf(root: Obj, path: string[]): { box: Obj | unknown[] | null; key: string } {
  const p = walk(root, path.slice(0, -1)); return { box: p.ok && p.value && typeof p.value === 'object' ? p.value as Obj : null, key: path[path.length - 1] };
}
function setAt(root: Obj, path: string[], v: unknown) { const { box, key } = parentOf(root, path); if (box) (box as Obj)[key] = v; }
/** 바뀐 것을 적어 둘 때: 없는 중간 칸은 만든다 */
function putAt(root: Obj, path: string[], v: unknown) {
  let cur: Obj = root;   // 배열 칸([0])도 따라 들어가고, 없는 칸은 다음 키가 숫자면 배열로 만든다
  for (let i = 0; i < path.length - 1; i++) { const k = path[i]; if (!cur[k] || typeof cur[k] !== 'object') cur[k] = /^\d+$/.test(path[i + 1]) ? [] : {}; cur = cur[k] as Obj; }
  if (path.length) cur[path[path.length - 1]] = v;
}

// ── 느슨한 JSON (따옴표 없는 키 · 작은따옴표 · 끝 쉼표 · 주석) ──
export function loose(text: string): unknown {
  const s = String(text); let i = 0;
  const ws = () => { for (;;) { while (i < s.length && /\s/.test(s[i])) i++; if (s.startsWith('//', i)) { while (i < s.length && s[i] !== '\n') i++; } else if (s.startsWith('/*', i)) { const e = s.indexOf('*/', i + 2); i = e < 0 ? s.length : e + 2; } else break; } };
  const str = (q: string) => { let out = ''; i++; while (i < s.length && s[i] !== q) { if (s[i] === '\\' && i + 1 < s.length) { const n = s[++i]; out += n === 'n' ? '\n' : n === 't' ? '\t' : n === 'r' ? '\r' : n === 'u' ? String.fromCharCode(parseInt(s.slice(i + 1, (i += 4) + 1), 16)) : n; } else out += s[i]; i++; } if (s[i] !== q) throw new Error('닫히지 않은 따옴표'); i++; return out; };
  const bare = (stop: RegExp) => { const a = i; while (i < s.length && !stop.test(s[i])) i++; return s.slice(a, i).trim(); };
  const scalar = (t: string): unknown => t === 'true' ? true : t === 'false' ? false : t === 'null' ? null : t === 'undefined' ? null : t !== '' && !isNaN(Number(t)) ? Number(t) : t;
  const val = (): unknown => {
    ws(); const ch = s[i];
    if (ch === '{') { i++; const o: Obj = {}; for (;;) { ws(); if (s[i] === '}') { i++; return o; } if (i >= s.length) throw new Error('닫히지 않은 {'); const k = s[i] === '"' || s[i] === "'" ? str(s[i]) : bare(/[:,}\n]/); ws(); if (s[i] !== ':') throw new Error('키 뒤에 : 가 없음'); i++; o[k] = val(); ws(); if (s[i] === ',') i++; } }
    if (ch === '[') { i++; const a: unknown[] = []; for (;;) { ws(); if (s[i] === ']') { i++; return a; } if (i >= s.length) throw new Error('닫히지 않은 ['); a.push(val()); ws(); if (s[i] === ',') i++; } }
    if (ch === '"' || ch === "'") return str(ch);
    return scalar(bare(/[,}\]\n]/));
  };
  const v = val(); ws(); if (i < s.length) throw new Error('남은 글이 있음'); return v;
}

// ── 간단한 YAML (들여쓰기 맵 · "- " 목록 · 한 줄 값 · 인라인 [ ] { }) ──
function yamlScalar(t: string): unknown {
  t = t.trim(); if (t === '' || t === '~' || t === 'null') return null;
  if (t[0] === '[' || t[0] === '{') { try { return loose(t); } catch { return t; } }
  if ((t[0] === '"' && t.endsWith('"')) || (t[0] === "'" && t.endsWith("'"))) { try { return t[0] === '"' ? JSON.parse(t) : t.slice(1, -1).replace(/''/g, "'"); } catch { return t.slice(1, -1); } }
  if (t === 'true' || t === 'false') return t === 'true';
  const c = t.replace(/\s+#.*$/, ''); return c !== '' && !isNaN(Number(c)) ? Number(c) : c;
}
export function yaml(text: string): unknown {
  const lines = String(text).replace(/\t/g, '  ').split(/\r?\n/).filter(l => l.trim() !== '' && !/^\s*#/.test(l)).map(l => ({ ind: l.match(/^ */)![0].length, t: l.trim() }));
  let p = 0;
  const keyOf = (t: string) => { const m = t.match(/^("(?:[^"\\]|\\.)*"|'[^']*'|[^:#\[{][^:]*?)\s*:(\s+(.*))?$/); return m ? { k: String(yamlScalar(m[1])), rest: (m[3] ?? '').trim() } : null; };
  const block = (ind: number): unknown => {
    if (p >= lines.length) return null;
    if (lines[p].t.startsWith('- ') || lines[p].t === '-') {
      const arr: unknown[] = [];
      while (p < lines.length && lines[p].ind === ind && (lines[p].t.startsWith('- ') || lines[p].t === '-')) {
        const body = lines[p].t.slice(1).trim(), kv = body && keyOf(body);
        if (!body) { p++; arr.push(p < lines.length && lines[p].ind > ind ? block(lines[p].ind) : null); }
        else if (kv) { lines[p] = { ind: ind + 2, t: body }; arr.push(block(ind + 2)); }
        else { arr.push(yamlScalar(body)); p++; }
      }
      return arr;
    }
    const o: Obj = {};
    while (p < lines.length && lines[p].ind === ind) {
      const kv = keyOf(lines[p].t); if (!kv) throw new Error('YAML 을 읽지 못함: ' + lines[p].t.slice(0, 40));
      p++;
      if (kv.rest !== '') o[kv.k] = yamlScalar(kv.rest);
      else if (p < lines.length && (lines[p].ind > ind || (lines[p].ind === ind && lines[p].t.startsWith('- ')))) o[kv.k] = block(lines[p].ind);
      else o[kv.k] = null;
    }
    return o;
  };
  if (!lines.length) return {};
  const v = block(lines[0].ind); if (p < lines.length) throw new Error('YAML 들여쓰기가 맞지 않음'); return v;
}
/** 초기 변수 · 패치 본문: JSON → 느슨한 JSON → YAML 순으로 */
export function parseString(text: string): unknown {
  const s = String(text).trim();
  if (s[0] === '{' || s[0] === '[') { try { return JSON.parse(s); } catch { } try { return loose(s); } catch { } return yaml(s); }
  try { return yaml(s); } catch { } return loose(s);
}

// ── 명령 읽기 ──
function parseValue(src: string): unknown {
  const t = src.trim();
  if (t === 'true') return true; if (t === 'false') return false; if (t === 'null' || t === 'undefined') return null;
  try { return JSON.parse(t); } catch { }
  if ((t[0] === '{' && t.endsWith('}')) || (t[0] === '[' && t.endsWith(']'))) { try { const v = loose(t); if (v && typeof v === 'object') return v; } catch { } }
  if (t.length > 1 && t[0] === "'" && t.endsWith("'")) return t.slice(1, -1);
  if (/^[\d\s+\-*/().%]+$/.test(t) && /\d/.test(t)) { try { const v = Function('"use strict"; return (' + t + ')')() as unknown; if (typeof v === 'number' && isFinite(v)) return parseFloat(v.toPrecision(12)); } catch { } }
  return trimQ(t);
}
/** 괄호 · 따옴표를 따라가며 맨 바깥 쉼표에서 나눈다 */
function splitArgs(s: string): string[] {
  const out: string[] = []; let depth = 0, q = '', cur = '';
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (q) { cur += ch; if (ch === q && s[i - 1] !== '\\') q = ''; continue; }
    if (ch === '"' || ch === "'" || ch === '`') { q = ch; cur += ch; continue; }
    if (ch === '(' || ch === '[' || ch === '{') depth++; else if (ch === ')' || ch === ']' || ch === '}') depth--;
    if (ch === ',' && depth === 0) { out.push(cur.trim()); cur = ''; } else cur += ch;
  }
  if (cur.trim() !== '') out.push(cur.trim());
  return out;
}
const ALIAS: Record<string, Command['type']> = { set: 'set', insert: 'insert', assign: 'insert', remove: 'delete', unset: 'delete', delete: 'delete', add: 'add' };
const MIN: Record<string, number> = { set: 2, insert: 2, delete: 1, add: 2 };
const blank = (s: string) => s.replace(/[^\n]/g, ' ');
/** JSON Pointer(/a/b/0) → 경로 */
const pointer = (p: string) => String(p).split('/').slice(1).map(x => x.replace(/~1/g, '/').replace(/~0/g, '~'));

export function extractCommands(text: string): Command[] {
  let s = String(text || ''); const cmds: Command[] = [];
  // 생각 · 분석 블록 안의 명령은 실행하지 않는다
  s = s.replace(/<(think|thinking|reasoning|analysis|analyze)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, m => blank(m));
  // JSON Patch 블록
  s = s.replace(/<(json_?patch)\b[^>]*>([\s\S]*?)<\/\1\s*>/gi, (m, _n, body: string) => {
    if (/^\s*<!--\s*mvu:discard-incomplete-json-patch\s*-->/.test(body)) return blank(m);
    try {
      const ops = parseString(body.replace(/^\s*```[a-z0-9]*\s*\n/i, '').replace(/\n\s*```\s*$/, ''));
      if (Array.isArray(ops)) for (const op of ops as Obj[]) {
        if (!isObj(op) || typeof op.op !== 'string' || typeof op.path !== 'string') continue;
        const path = pointer(op.path), kind = op.op.toLowerCase();
        if (kind === 'replace') cmds.push({ type: 'set', args: [], reason: 'json_patch', values: [path, op.value] });
        else if (kind === 'delta') cmds.push({ type: 'add', args: [], reason: 'json_patch', values: [path, op.value] });
        else if (kind === 'insert' || kind === 'add') cmds.push({ type: 'insert', args: [], reason: 'json_patch', values: [path.slice(0, -1), path[path.length - 1], op.value] });
        else if (kind === 'remove') cmds.push({ type: 'delete', args: [], reason: 'json_patch', values: [path] });
      }
    } catch { }
    return blank(m);
  });
  const re = /_\.(set|insert|assign|remove|unset|delete|add)\(/g; let m: RegExpExecArray | null;
  while ((m = re.exec(s))) {
    let i = re.lastIndex, depth = 1, q = '';
    for (; i < s.length && depth > 0; i++) { const ch = s[i]; if (q) { if (ch === q && s[i - 1] !== '\\') q = ''; } else if (ch === '"' || ch === "'" || ch === '`') q = ch; else if (ch === '(') depth++; else if (ch === ')') depth--; }
    if (depth !== 0) continue;
    const tail = s.slice(i).match(/^[ \t]*;/); if (!tail && !/^[ \t]*(\r?\n|$)/.test(s.slice(i))) continue;   // 닫는 괄호 뒤에는 ; (또는 줄 끝)
    const args = splitArgs(s.slice(re.lastIndex, i - 1)), type = ALIAS[m[1]];
    const after = s.slice(i + (tail ? tail[0].length : 0)), why = after.match(/^\s*\/\/(.*)/);
    if (args.length < MIN[type]) continue;
    cmds.push({ type, args, reason: why ? why[1].trim() : '' });
    re.lastIndex = i;
  }
  return cmds;
}

// ── 명령 실행 ──
const show = (v: unknown) => trimQ(JSON.stringify(v) ?? 'null');
const isDateText = (v: unknown): v is string => typeof v === 'string' && isNaN(Number(v)) && !isNaN(new Date(v).getTime());

/** 글에 든 명령을 data 에 적용한다 (data 를 그 자리에서 고친다). 반환: 실제로 바뀐 것이 있는가 */
export function applyText(text: string, data: MvuData): boolean {
  const cmds = extractCommands(text); if (!cmds.length) { delete data.display_data; delete data.delta_data; return false; }
  const stat = data.stat_data, display = clone(stat), delta: Obj = {}; let changed = false;
  const note = (path: string[], str: string) => { changed = true; if (path.length) { putAt(display, path, str); putAt(delta, path, str); } };
  for (const c of cmds) {
    try {
      const why = c.reason ? `(${c.reason})` : '';
      const path = c.values ? c.values[0] as string[] : toPath(c.args[0]);
      const arg = (n: number) => c.values ? c.values[n] : parseValue(c.args[n]);
      const count = c.values ? c.values.length : c.args.length;
      if (c.type === 'set') {
        let nv = arg(count - 1);
        if (!path.length) { if (isObj(nv)) { data.stat_data = nv; changed = true; } continue; }
        const cur = walk(stat, path); if (!cur.ok) continue;                    // 없는 경로는 만들지 않는다
        const old = cur.value;
        if (isVwd(old) && !isVwd(nv)) { if (typeof old[0] === 'number' && nv != null && typeof nv !== 'object') nv = Number(nv); const before = old[0]; old[0] = nv; note(path, `${show(before)}->${show(nv)} ${why}`); }
        else { if (typeof old === 'number' && typeof nv === 'string') nv = Number(nv); setAt(stat, path, nv); note(path, `${show(isVwd(old) ? old[0] : old)}->${show(isVwd(nv) ? nv[0] : nv)} ${why}`); }
      } else if (c.type === 'add') {
        const cur = walk(stat, path), d = Number(arg(1)); if (!cur.ok || !isFinite(d)) continue;
        const vwd = isVwd(cur.value), old = vwd ? (cur.value as unknown[])[0] : cur.value; let nv: unknown;
        if (typeof old === 'number') nv = parseFloat((old + d).toPrecision(12));
        else if (isDateText(old)) nv = new Date(new Date(old).getTime() + d).toISOString();
        else if (old != null && old !== '' && !isNaN(Number(old))) nv = parseFloat((Number(old) + d).toPrecision(12));
        else continue;
        if (vwd) (cur.value as unknown[])[0] = nv; else setAt(stat, path, nv);
        note(path, `${JSON.stringify(old)}->${JSON.stringify(nv)} ${why}`);
      } else if (c.type === 'insert') {
        const cur = path.length ? walk(stat, path) : { ok: true, value: stat as unknown }; if (!cur.ok) continue;
        let box = cur.value; const three = count >= 3, key = three ? arg(1) : undefined, v = arg(three ? 2 : 1);
        if (box == null) { box = three && (typeof key === 'number' || key === '-') ? [] : (isObj(v) || three ? {} : []); setAt(stat, path, box); }
        if (Array.isArray(box)) {
          if (!three || key === '-') box.push(v); else if (typeof key === 'number' || /^\d+$/.test(String(key))) box.splice(Number(key), 0, v); else continue;
          note(path, `ASSIGNED ${JSON.stringify(v)} into array '${path.join('.')}' ${why}`);
        } else if (isObj(box)) {
          if (three) { box[String(key)] = v; note([...path, String(key)], `ASSIGNED key '${String(key)}' with value ${JSON.stringify(v)} into object '${path.join('.')}' ${why}`); }
          else if (isObj(v)) { Object.assign(box, v); note(path, `MERGED object ${JSON.stringify(v)} into object '${path.join('.')}' ${why}`); }
        }
      } else if (c.type === 'delete') {
        if (count >= 2) {
          const cur = walk(stat, path), k = arg(1); if (!cur.ok) continue; const box = cur.value;
          if (Array.isArray(box)) { const at = typeof k === 'number' ? k : box.findIndex(x => JSON.stringify(x) === JSON.stringify(k)); if (at < 0 || at >= box.length) continue; box.splice(at, 1); note(path, `REMOVED item from '${path.join('.')}' at index ${at} ${why}`); }
          else if (isObj(box)) { const name = typeof k === 'number' ? Object.keys(box)[k] : String(k); if (name == null || !own(box, name)) continue; delete box[name]; note(path, `REMOVED key '${name}' from object '${path.join('.')}' ${why}`); }
        } else {
          if (!path.length) continue; const { box, key } = parentOf(stat, path); if (!box || !own(box, key)) continue;
          if (Array.isArray(box) && /^\d+$/.test(key)) { box.splice(Number(key), 1); note(path.slice(0, -1), `REMOVED item from '${path.slice(0, -1).join('.')}' at index ${key} ${why}`); }
          else { delete (box as Obj)[key]; note(path.slice(0, -1), `REMOVED path '${path.join('.')}' ${why}`); }
        }
      }
    } catch (e) { console.warn('[변수 갱신] 명령을 건너뜀', c, e); }
  }
  if (changed) { data.display_data = display; data.delta_data = delta; } else { delete data.display_data; delete data.delta_data; }
  return changed;
}

// ── 초기 변수 ──
function deepMerge(a: Obj, b: Obj): Obj { for (const [k, v] of Object.entries(b)) { if (isObj(v) && isObj(a[k])) deepMerge(a[k] as Obj, v); else a[k] = v; } return a; }
/** $meta · 표식 문자열처럼 값이 아닌 것들을 걷어 낸다 */
function strip(v: unknown): unknown {
  if (Array.isArray(v)) return v.filter(x => x !== '$__META_EXTENSIBLE__$' && !(isObj(x) && x.$arrayMeta === true)).map(strip);
  if (isObj(v)) { const o: Obj = {}; for (const [k, x] of Object.entries(v)) if (k !== '$meta') o[k] = strip(x); return o; }
  return v;
}
/** 로어북 항목 · 첫 인사에서 초기 변수 본문을 꺼낸다 */
export function initBody(content: string): string {
  const a = content.match(/<initvar>[^\n]*\n([\s\S]*?)\n[^\n]*<\/initvar>/i); if (a) return a[1];
  const b = content.match(/```[^\n]*\n([\s\S]*?)\n```/); return b ? b[1] : content;
}
/** 이름에 [InitVar] 가 든 로어북 항목들로 초기 자료를 만든다 */
export function initFrom(books: { name: string; entries: { name?: string; content?: string }[] }[]): MvuData {
  const data = emptyData();
  for (const b of books) {
    const merged: Obj = {}; let any = false;
    for (const e of b.entries || []) {
      if (!String(e.name || '').toLowerCase().includes('[initvar]')) continue;
      try { const v = parseString(initBody(String(e.content || ''))); if (isObj(v)) { deepMerge(merged, v); any = true; } } catch (err) { console.warn('[변수 갱신] 초기 변수를 읽지 못함:', b.name, e.name, err); }
    }
    if (any) { data.initialized_lorebooks[b.name] = []; data.stat_data = { ...merged, ...data.stat_data }; }
  }
  data.stat_data = strip(data.stat_data) as Obj;
  return data;
}
/** 첫 인사 안의 <initvar> 블록은 초기 변수를 통째로 바꾼다 */
export function greetingInit(text: string): Obj | null {
  const m = String(text || '').match(/<initvar>([\s\S]*?)<\/initvar>/i); if (!m) return null;
  try { const v = parseString(m[1].replace(/^\s*```[a-z0-9]*\s*\n/i, '').replace(/\n\s*```\s*$/, '')); return isObj(v) ? strip(v) as Obj : null; } catch { return null; }
}

// ── 값 꺼내기 (매크로용) ──
/** 경로의 값을 글로: 객체 · 배열은 JSON, [값, 설명] 은 그대로 JSON */
export function readVar(root: unknown, path: string): string {
  const v = path ? getAt(root, path) : root; if (v === undefined || v === null) return '';
  return typeof v === 'object' ? JSON.stringify(v) : String(v);
}
/** 보기 좋게: 들여쓴 YAML 비슷한 글 */
export function formatVar(root: unknown, path: string): string {
  const v = path ? getAt(root, path) : root; if (v === undefined || v === null) return '';
  const line = (x: unknown, ind: string): string => {
    if (isVwd(x)) return JSON.stringify(x);
    if (Array.isArray(x)) return x.length ? '\n' + x.map(i => `${ind}- ${line(i, ind + '  ').replace(/^\n\s*/, '')}`).join('\n') : '[]';
    if (isObj(x)) { const ks = Object.keys(x); return ks.length ? '\n' + ks.map(k => `${ind}${k}: ${line(x[k], ind + '  ')}`).join('\n') : '{}'; }
    return typeof x === 'string' ? x : JSON.stringify(x);
  };
  return line(v, '').replace(/^\n/, '');
}
