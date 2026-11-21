// 변수 갱신 틀이 쓰는 lodash 꼴 도우미: 경로 읽기 · 쓰기 · 지우기 · 깊은 합치기 · 같은지 견주기.
// 카드들은 실리태번의 lodash(_.get · _.set · _.toPath …) 규칙에 맞춰 경로를 적으므로, 그 규칙을 그대로 따른다.
// 바탕: lodash 4.17 (MIT, © OpenJS Foundation and other contributors) 의 경로 규칙을 옮겨 적었다.

export type Obj = Record<string, unknown>;
type Key = string;

export const isObject = (v: unknown): v is object => v != null && (typeof v === 'object' || typeof v === 'function');
export const isArray = Array.isArray;
export const isDate = (v: unknown): v is Date => v instanceof Date;
export function isPlainObject(v: unknown): v is Obj {
  if (!v || typeof v !== 'object' || Object.prototype.toString.call(v) !== '[object Object]') return false;
  const p = Object.getPrototypeOf(v); if (p === null) return true;
  const C = Object.prototype.hasOwnProperty.call(p, 'constructor') && p.constructor;
  return typeof C === 'function' && Function.prototype.toString.call(C) === Function.prototype.toString.call(Object);
}
export const isString = (v: unknown): v is string => typeof v === 'string';
const hasOwn = (o: unknown, k: PropertyKey) => o != null && Object.prototype.hasOwnProperty.call(o, k);

// ── 경로 ──
const reIsDeepProp = /\.|\[(?:[^[\]]*|(["'])(?:(?!\1)[^\\]|\\.)*?\1)\]/, reIsPlainProp = /^\w*$/;
const rePropName = /[^.[\]]+|\[(?:(-?\d+(?:\.\d+)?)|(["'])((?:(?!\2)[^\\]|\\.)*?)\2)\]|(?=(?:\.|\[\])(?:\.|\[\]|$))/g;
const reEscapeChar = /\\(\\)?/g;
const memo = new Map<string, string[]>();
function stringToPath(s: string): string[] {
  const hit = memo.get(s); if (hit) return hit.slice();
  const out: string[] = [];
  if (s.charCodeAt(0) === 46) out.push('');
  s.replace(rePropName, (match: string, num?: string, quote?: string, sub?: string) => { out.push(quote ? (sub as string).replace(reEscapeChar, '$1') : (num || match)); return ''; });
  if (memo.size > 500) memo.clear();
  memo.set(s, out); return out.slice();
}
const toKey = (v: unknown): Key => typeof v === 'string' ? v : (typeof v === 'number' && 1 / v === -Infinity) ? '-0' : String(v);
function isKey(v: unknown, o: unknown): boolean {
  if (isArray(v)) return false;
  if (typeof v === 'number' || typeof v === 'boolean' || v == null || typeof v === 'symbol') return true;
  const s = String(v);
  return reIsPlainProp.test(s) || !reIsDeepProp.test(s) || (o != null && s in Object(o));
}
/** 'a.b[0]["c d"]' → ['a','b','0','c d'] (lodash _.toPath) */
export function toPath(v: unknown): string[] { return isArray(v) ? v.map(toKey) : stringToPath(v == null ? '' : String(v)); }
const castPath = (v: unknown, o: unknown): string[] => isArray(v) ? v.map(toKey) : isKey(v, o) ? [toKey(v)] : stringToPath(v == null ? '' : String(v));
const isIndex = (v: unknown, len = Number.MAX_SAFE_INTEGER) => { const t = typeof v; return !!len && (t === 'number' || (t !== 'symbol' && /^(?:0|[1-9]\d*)$/.test(String(v)))) && Number(v) > -1 && Number(v) % 1 === 0 && Number(v) < len; };

export function get(o: unknown, path: unknown, def?: unknown): any {
  const p = castPath(path, o); let cur: any = o, i = 0;
  while (cur != null && i < p.length) cur = cur[p[i++]];
  const r = i && i === p.length ? cur : undefined;
  return r === undefined ? def : r;
}
export function has(o: unknown, path: unknown): boolean {
  const p = castPath(path, o); let cur: any = o, ok = false, i = -1;
  while (++i < p.length) { const k = p[i]; if (!(ok = cur != null && hasOwn(cur, k))) break; cur = cur[k]; }
  if (ok || ++i !== p.length) return ok;
  const len = cur == null ? 0 : cur.length;
  return !!len && Number.isSafeInteger(len) && isIndex(p[p.length - 1], len) && isArray(cur);
}
const same = (a: unknown, b: unknown) => a === b || (a !== a && b !== b);
function assign(o: any, k: Key, v: unknown) {
  if (!(hasOwn(o, k) && same(o[k], v)) || (v === undefined && !(k in o))) {
    if (k === '__proto__') Object.defineProperty(o, k, { configurable: true, enumerable: true, value: v, writable: true }); else o[k] = v;
  }
}
export function set<T>(o: T, path: unknown, value: unknown): T {
  if (!isObject(o)) return o;
  const p = castPath(path, o), last = p.length - 1; let nest: any = o;
  for (let i = 0; i < p.length && nest != null; i++) {
    const k = p[i]; let nv: unknown = value;
    if (k === '__proto__' || k === 'constructor' || k === 'prototype') return o;
    if (i !== last) { const cur = nest[k]; nv = isObject(cur) ? cur : (isIndex(p[i + 1]) ? [] : {}); }
    assign(nest, k, nv); nest = nest[k];
  }
  return o;
}
export function unset(o: unknown, path: unknown): boolean {
  const p = castPath(path, o); if (o == null) return true;
  const parent = p.length < 2 ? o : get(o, p.slice(0, -1));
  const k = p[p.length - 1];
  if (parent == null) return true;
  if (k === '__proto__' || (k === 'constructor' && typeof (parent as any)[k] === 'function') || (k === 'prototype')) return false;
  return delete (parent as any)[k];
}
export function update<T>(o: T, path: unknown, fn: (v: any) => unknown): T { return set(o, path, fn(get(o, path))); }

// ── 복사 · 비교 ──
/** 깊은 복사 (klona 처럼: 배열 · 일반 객체 · 날짜) */
export function clone<T>(v: T): T {
  if (v == null || typeof v !== 'object') return v;
  if (isDate(v)) return new Date(v.getTime()) as unknown as T;
  if (isArray(v)) { const out = new Array(v.length); for (let i = 0; i < v.length; i++) out[i] = clone(v[i]); return out as unknown as T; }
  const out: Obj = Object.create(Object.getPrototypeOf(v));
  for (const k of Object.keys(v as object)) { const x = (v as Obj)[k]; if (k === '__proto__') Object.defineProperty(out, k, { value: clone(x), configurable: true, enumerable: true, writable: true }); else out[k] = clone(x); }
  return out as T;
}
export function isEqual(a: unknown, b: unknown, seen: WeakMap<object, object> = new WeakMap()): boolean {
  if (same(a, b)) return true;
  if (!a || !b || typeof a !== 'object' || typeof b !== 'object') return false;
  if (Object.prototype.toString.call(a) !== Object.prototype.toString.call(b)) return false;
  if (isDate(a)) return a.getTime() === (b as Date).getTime();
  if (seen.get(a) === b) return true; seen.set(a, b);
  if (isArray(a)) { const bb = b as unknown[]; if (a.length !== bb.length) return false; for (let i = 0; i < a.length; i++) if (!isEqual(a[i], bb[i], seen)) return false; return true; }
  const ka = Object.keys(a), kb = Object.keys(b); if (ka.length !== kb.length) return false;
  for (const k of ka) if (!hasOwn(b, k) || !isEqual((a as Obj)[k], (b as Obj)[k], seen)) return false;
  return true;
}

// ── 합치기 (lodash _.merge / _.mergeWith) ──
type Customizer = (objValue: unknown, srcValue: unknown, key: Key, object: unknown, source: unknown) => unknown;
const keysIn = (o: object) => { const out: string[] = []; for (const k in o) out.push(k); return out; };
const safeGet = (o: any, k: Key) => (k === 'constructor' && typeof o[k] === 'function') || k === '__proto__' ? undefined : o[k];
function assignMerge(o: any, k: Key, v: unknown) { if ((v !== undefined && !same(o[k], v)) || (v === undefined && !(k in o))) assign(o, k, v); }
function baseMerge(o: any, src: any, fn: Customizer | undefined, stack: Map<unknown, unknown>) {
  if (o === src) return;
  for (const k of keysIn(src)) {
    const sv = safeGet(src, k);
    if (isObject(sv)) { mergeDeep(o, src, k, fn, stack); continue; }
    let nv = fn ? fn(safeGet(o, k), sv, k, o, src) : undefined;
    if (nv === undefined) nv = sv;
    assignMerge(o, k, nv);
  }
}
function mergeDeep(o: any, src: any, k: Key, fn: Customizer | undefined, stack: Map<unknown, unknown>) {
  const ov = safeGet(o, k), sv = safeGet(src, k), stacked = stack.get(sv);
  if (stacked) { assignMerge(o, k, stacked); return; }
  let nv = fn ? fn(ov, sv, k, o, src) : undefined, common = nv === undefined;
  if (common) {
    nv = sv;
    if (isArray(sv)) nv = isArray(ov) ? ov : (ov && typeof ov === 'object' && typeof (ov as { length?: unknown }).length === 'number' ? Array.from(ov as ArrayLike<unknown>) : []);
    else if (isPlainObject(sv)) { nv = ov; if (!isObject(ov) || typeof ov === 'function') nv = Object.create(Object.getPrototypeOf(sv)); }
    else common = false;
  }
  if (common) { stack.set(sv, nv); baseMerge(nv, sv, fn, stack); stack.delete(sv); }
  assignMerge(o, k, nv);
}
export function merge<T>(o: T, ...sources: unknown[]): T { for (const s of sources) if (s != null) baseMerge(o, s, undefined, new Map()); return o; }
export function mergeWith<T>(o: T, src: unknown, fn: Customizer): T { if (src != null) baseMerge(o, src, fn, new Map()); return o; }
/** 배열은 합치지 않고 통째로 바꾸는 합치기 ([1,2,3] + [4,5] → [4,5]) */
export const correctlyMerge = <T,>(a: T, b: unknown): T => mergeWith(a, b, (_x, y) => isArray(y) ? y : undefined);
export const escapeHtml = (s: string) => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));
