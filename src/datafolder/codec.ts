// 자료 폴더 거울: IndexedDB 값 ↔ JSON 바꾸기 · 해시 · 키 빼기
// IndexedDB 는 JSON 에 없는 것(undefined · 형식 배열 · Blob · Date · Map …)도 담으므로 {"$dl": 종류} 꼬리표로 감싸 정확히 되돌린다.
export type Json = null | boolean | number | string | Json[] | { [k: string]: Json };

const TA: Record<string, { new(b: ArrayBuffer): ArrayBufferView }> = {};
for (const n of ['Int8Array', 'Uint8Array', 'Uint8ClampedArray', 'Int16Array', 'Uint16Array', 'Int32Array', 'Uint32Array', 'Float32Array', 'Float64Array', 'BigInt64Array', 'BigUint64Array']) {
  const C = (globalThis as unknown as Record<string, unknown>)[n]; if (typeof C === 'function') TA[n] = C as { new(b: ArrayBuffer): ArrayBufferView };
}

export function bytesToB64(u: Uint8Array): string {
  let s = ''; for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode.apply(null, Array.from(u.subarray(i, i + 0x8000)));
  return btoa(s);
}
export function b64ToBytes(s: string): Uint8Array { const bin = atob(s); const u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); return u; }
const viewBytes = (v: ArrayBufferView) => new Uint8Array(v.buffer, v.byteOffset, v.byteLength).slice();

const isPlain = (v: object) => { const p = Object.getPrototypeOf(v); return p === Object.prototype || p === null; };

/** 값 안의 Blob 을 모두 찾는다 (Blob 은 읽는 데 기다려야 해서 먼저 읽어 둔다) */
function findBlobs(v: unknown, out: Set<Blob>, seen = new Set<object>()) {
  if (!v || typeof v !== 'object' || seen.has(v)) return; seen.add(v);
  if (typeof Blob !== 'undefined' && v instanceof Blob) { out.add(v); return; }
  if (ArrayBuffer.isView(v) || v instanceof ArrayBuffer || v instanceof Date || v instanceof RegExp) return;
  if (v instanceof Map) { for (const [k, x] of v) { findBlobs(k, out, seen); findBlobs(x, out, seen); } return; }
  if (v instanceof Set) { for (const x of v) findBlobs(x, out, seen); return; }
  for (const k of Object.keys(v)) findBlobs((v as Record<string, unknown>)[k], out, seen);
}

/** 동기 판: Blob 은 미리 읽어 둔 것(blobs)만 쓸 수 있다. 없으면 오류 */
export function encodeSync(v: unknown, blobs?: Map<Blob, string>): Json {
  if (v === null) return null;
  switch (typeof v) {
    case 'undefined': return { $dl: 'u' };
    case 'boolean': case 'string': return v;
    case 'number': return Number.isFinite(v) && !Object.is(v, -0) ? v : { $dl: 'n', v: Object.is(v, -0) ? '-0' : String(v) };
    case 'bigint': return { $dl: 'bi', v: v.toString() };
    case 'object': break;
    default: return null;   // 함수 · 심볼은 IndexedDB 에 들어가지 못한다
  }
  const o = v as object;
  if (Array.isArray(o)) { const a: Json[] = []; for (let i = 0; i < o.length; i++) a.push(i in o ? encodeSync(o[i], blobs) : { $dl: 'u' }); return a; }
  if (o instanceof Date) { const t = o.getTime(); return { $dl: 'd', v: Number.isNaN(t) ? null : t }; }
  if (o instanceof RegExp) return { $dl: 're', s: o.source, f: o.flags };
  if (o instanceof ArrayBuffer) return { $dl: 'ab', b: bytesToB64(new Uint8Array(o)) };
  if (o instanceof DataView) return { $dl: 'dv', b: bytesToB64(viewBytes(o)) };
  if (ArrayBuffer.isView(o)) return { $dl: 'ta', t: o.constructor.name, b: bytesToB64(viewBytes(o)) };
  if (typeof Blob !== 'undefined' && o instanceof Blob) {
    const b = blobs?.get(o); if (b == null) throw new Error('Blob 을 먼저 읽어야 합니다');
    const out: { [k: string]: Json } = { $dl: 'blob', type: o.type, b };
    if (typeof File !== 'undefined' && o instanceof File) { out.name = o.name; out.lm = o.lastModified; }
    return out;
  }
  if (o instanceof Map) return { $dl: 'map', v: [...o].map(([k, x]) => [encodeSync(k, blobs), encodeSync(x, blobs)]) };
  if (o instanceof Set) return { $dl: 'set', v: [...o].map(x => encodeSync(x, blobs)) };
  const rec = o as Record<string, unknown>, keys = Object.keys(rec), out: { [k: string]: Json } = {};
  for (const k of keys) out[k] = encodeSync(rec[k], blobs);
  if (!isPlain(o) || keys.some(k => k.startsWith('$dl'))) return { $dl: 'esc', v: out };   // 꼬리표와 헷갈리는 키를 가진 객체
  return out;
}

export async function encode(v: unknown): Promise<Json> {
  const set = new Set<Blob>(); findBlobs(v, set);
  const map = new Map<Blob, string>();
  for (const b of set) map.set(b, bytesToB64(new Uint8Array(await b.arrayBuffer())));
  return encodeSync(v, map);
}

export function decode(j: Json): unknown {
  if (j === null || typeof j !== 'object') return j;
  if (Array.isArray(j)) { const a: unknown[] = new Array(j.length); j.forEach((x, i) => { const d = decode(x); if (!(isTag(x, 'u'))) a[i] = d; }); return a; }
  const t = j.$dl;
  if (typeof t === 'string') {
    const s = (k: string) => String(j[k] ?? '');
    switch (t) {
      case 'u': return undefined;
      case 'n': return s('v') === '-0' ? -0 : Number(s('v'));
      case 'bi': return BigInt(s('v'));
      case 'd': return new Date(j.v == null ? NaN : Number(j.v));
      case 're': return new RegExp(s('s'), s('f'));
      case 'ab': { const u = b64ToBytes(s('b')); return u.buffer.slice(u.byteOffset, u.byteOffset + u.byteLength); }
      case 'dv': { const u = b64ToBytes(s('b')); return new DataView(u.buffer); }
      case 'ta': { const u = b64ToBytes(s('b')); const C = TA[s('t')] || TA.Uint8Array; return new C(u.buffer as ArrayBuffer); }
      case 'blob': { const u = b64ToBytes(s('b')); const parts = [u.buffer as ArrayBuffer]; return 'name' in j && typeof File !== 'undefined' ? new File(parts, s('name'), { type: s('type'), lastModified: Number(j.lm) || 0 }) : new Blob(parts, { type: s('type') }); }
      case 'map': return new Map((Array.isArray(j.v) ? j.v : []).map(p => { const [k, x] = Array.isArray(p) ? p : [null, null]; return [decode(k), decode(x)] as [unknown, unknown]; }));
      case 'set': return new Set((Array.isArray(j.v) ? j.v : []).map(decode));
      case 'esc': { const v = j.v; const o: Record<string, unknown> = {}; if (v && typeof v === 'object' && !Array.isArray(v)) for (const k of Object.keys(v)) o[k] = decode(v[k]); return o; }
    }
  }
  const o: Record<string, unknown> = {};
  for (const k of Object.keys(j)) o[k] = decode(j[k]);
  return o;
}
const isTag = (x: Json, t: string) => !!x && typeof x === 'object' && !Array.isArray(x) && x.$dl === t && Object.keys(x).length === 1;

/** 서버(server.js 의 dlHash)와 똑같은 해시 */
export function dlHash(str: string): string {
  let h1 = 0xdeadbeef, h2 = 0x41c6ce57, h3 = 0x9e3779b9 ^ str.length, h4 = 0x85ebca6b;
  for (let i = 0; i < str.length; i++) {
    const c = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 2654435761); h2 = Math.imul(h2 ^ c, 1597334677);
    h3 = Math.imul(h3 ^ c, 2246822507); h4 = Math.imul(h4 ^ c, 3266489909);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  h3 = Math.imul(h3 ^ (h3 >>> 16), 2246822507) ^ Math.imul(h4 ^ (h4 >>> 13), 3266489909);
  h4 = Math.imul(h4 ^ (h4 >>> 16), 2246822507) ^ Math.imul(h3 ^ (h3 >>> 13), 3266489909);
  const x = (n: number) => (n >>> 0).toString(16).padStart(8, '0');
  return x(h1) + x(h2) + x(h3) + x(h4) + str.length.toString(36);
}

// ── 키 빼기: API 키 원문은 자료 폴더로 보내지 않는다 (서버 보관 꼬리표 @@dl:…@@ 와 금고 암호문은 그대로) ──
const TAG = /^@@dl:[\w-]+:\w+@@$/;
const plainKey = (v: unknown) => typeof v === 'string' && v !== '' && !TAG.test(v);
type Rec = Record<string, unknown>;
const obj = (v: unknown): v is Rec => !!v && typeof v === 'object' && !Array.isArray(v);
export function stripSecrets(store: string, v: unknown): unknown {
  if (!obj(v)) return v;
  if (store === 'conns' && (plainKey(v.apiKey) || plainKey(v.serviceAccount))) return { ...v, ...(plainKey(v.apiKey) ? { apiKey: '' } : {}), ...(plainKey(v.serviceAccount) ? { serviceAccount: '' } : {}) };
  if (store === 'kv' && v.id === 'settings' && obj(v.illust) && plainKey(v.illust.naiKey)) return { ...v, illust: { ...v.illust, naiKey: '' } };
  return v;
}
/** 서버 판을 브라우저에 쓸 때: 서버 판에 키가 비어 있고 브라우저에 키가 있으면 브라우저의 키를 지킨다 */
export function keepSecrets(store: string, incoming: unknown, local: unknown): unknown {
  if (!obj(incoming) || !obj(local)) return incoming;
  if (store === 'conns') { const o = { ...incoming }; for (const f of ['apiKey', 'serviceAccount']) if (!o[f] && plainKey(local[f])) o[f] = local[f]; return o; }
  if (store === 'kv' && incoming.id === 'settings' && obj(incoming.illust) && obj(local.illust) && !incoming.illust.naiKey && plainKey(local.illust.naiKey)) return { ...incoming, illust: { ...incoming.illust, naiKey: local.illust.naiKey } };
  return incoming;
}

/** 보낼 꼴: 키를 뺀 뒤 JSON 으로 바꾸고 해시를 붙인다 */
export async function pack(store: string, v: unknown): Promise<{ json: Json; str: string; hash: string }> {
  const json = await encode(stripSecrets(store, v)); const str = JSON.stringify(json);
  return { json, str, hash: dlHash(str) };
}
export function packSync(store: string, v: unknown): { json: Json; str: string; hash: string } {
  const json = encodeSync(stripSecrets(store, v)); const str = JSON.stringify(json);
  return { json, str, hash: dlHash(str) };
}

/** 이 레코드가 언제 고쳐졌는지 (판단할 수 없으면 null). 메시지 묶음은 마지막 메시지의 시각 */
export function timeOf(store: string, v: unknown): number | null {
  if (!obj(v)) return null;
  if (store === 'msgs' && Array.isArray(v.list)) {
    let t = 0; for (const m of v.list.slice(-3)) { if (!obj(m)) continue; t = Math.max(t, Number(m.ts) || 0); const sw = Array.isArray(m.swipes) ? m.swipes : []; for (const s of sw) if (obj(s)) t = Math.max(t, Number(s.ts) || 0); }
    return t || null;
  }
  for (const k of ['updatedAt', 'ts', 'at', 'createdAt']) { const n = v[k]; if (typeof n === 'number' && Number.isFinite(n) && n > 0) return n; }
  return null;
}
