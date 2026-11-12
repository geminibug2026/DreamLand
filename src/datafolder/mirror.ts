// 자료 폴더 거울: 앱의 DB 객체(put/del/clear/bulk)를 감싸 서버 자료 폴더(data/store)에도 같은 내용을 보낸다.
// js/core.js 의 DB 와 src/lib/core.ts 의 DB 는 모양이 같다 — installMirror(DB) 하나로 둘 다 감싼다.
// 원칙: 어떤 경우에도 조용히 지우지 않는다. 판단이 애매하면 둘 다 남긴다(서버의 _conflicts/).
import { decode, keepSecrets, pack, packSync, timeOf, type Json } from './codec';
import { t, tn } from '../i18n';

type Fn = (...a: never[]) => unknown;
export interface MirrorDb {
  all: (s: string) => Promise<unknown>;
  get: (s: string, id: unknown) => Promise<unknown>;
  put: (s: string, v: unknown) => Promise<unknown>;
  del: (s: string, id: unknown) => Promise<unknown>;
  clear: (s: string) => Promise<unknown>;
  bulk: (s: string, list: unknown[]) => Promise<unknown>;
  [k: string]: Fn | unknown;
}
export const STORES = ['chars', 'chats', 'msgs', 'personas', 'lore', 'presets', 'conns', 'regex', 'kv', 'assets', 'mem'];
const SKIP_KV = /^dlmirror:/;   // 거울 자신의 표시는 보내지 않는다
const BATCH = 4 * 1024 * 1024;

export interface MirrorState {
  server: 'unknown' | 'on' | 'off';   // 서버 자료 폴더를 쓸 수 있는가
  enabled: boolean;                   // 사용자가 켜 두었는가
  phase: 'idle' | 'sync' | 'restore';
  pending: number;                    // 보내지 못하고 쌓인 수
  lastSync: number;                   // 마지막으로 서버와 맞춘 시각
  error: string;
  dir: string;
  pulled: number; pushed: number; conflicts: number;
}

interface QEntry { k: string; store: string; id: unknown; del: boolean; t: number }
interface BaseEntry { k: string; h: string | null; gen: string }
interface Meta { store: string; id: unknown; hash: string; at: number }
interface Op { op: 'put' | 'del'; store: string; id: unknown; value?: Json; base?: string | null; keep?: boolean }

const keyOf = (store: string, id: unknown) => store + '\u0001' + JSON.stringify(id);
const idOf = (v: unknown) => (v && typeof v === 'object' ? (v as { id?: unknown }).id : undefined);
const skip = (store: string, id: unknown) => id == null || (store === 'kv' && SKIP_KV.test(String(id)));
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));
const lsGet = (k: string) => { try { return localStorage.getItem(k); } catch { return null; } };
const lsSet = (k: string, v: string) => { try { localStorage.setItem(k, v); } catch { /* 저장소를 못 쓰는 창 */ } };

// ── 거울 전용 IndexedDB: 보낼 줄(q)과 마지막으로 서버와 같았던 해시(base) ──
function openMirrorDb(): Promise<IDBDatabase> {
  return new Promise((res, rej) => {
    const r = indexedDB.open('dreamland-mirror', 1);
    r.onupgradeneeded = () => { for (const s of ['q', 'base']) if (!r.result.objectStoreNames.contains(s)) r.result.createObjectStore(s, { keyPath: 'k' }); };
    r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
  });
}
function mtx<T>(db: IDBDatabase, store: string, mode: IDBTransactionMode, fn: (o: IDBObjectStore) => IDBRequest | void): Promise<T> {
  return new Promise((res, rej) => {
    const t = db.transaction(store, mode); const r = fn(t.objectStore(store));
    t.oncomplete = () => res((r ? r.result : undefined) as T); t.onerror = () => rej(t.error); t.onabort = () => rej(t.error);
  });
}

export interface Mirror {
  state(): MirrorState;
  subscribe(fn: () => void): () => void;
  setEnabled(on: boolean): void;
  flush(): Promise<void>;
  sync(): Promise<void>;
  restore(name: string): Promise<void>;
  backupNow(): Promise<unknown>;
  ready: Promise<void>;
}

export interface MirrorOpts { base?: string; reload?: () => void; toast?: (msg: string, kind?: string) => void; autoStart?: boolean }

/** DB 객체를 받아 감싼다. 서버가 없으면 감싼 채로 아무것도 보내지 않고 앱은 그대로 돈다 */
export function installMirror(DB: MirrorDb, opts: MirrorOpts = {}): Mirror {
  const api = (opts.base || '') + '/api/store/';
  const raw = { all: DB.all.bind(DB), get: DB.get.bind(DB), put: DB.put, del: DB.del, clear: DB.clear, bulk: DB.bulk };
  const st: MirrorState = { server: 'unknown', enabled: lsGet('dl-datafolder') !== 'off', phase: 'idle', pending: 0, lastSync: Number(lsGet('dl-datafolder-last')) || 0, error: '', dir: '', pulled: 0, pushed: 0, conflicts: 0 };
  let snap = { ...st }; const subs = new Set<() => void>();
  const emit = () => { snap = { ...st }; subs.forEach(f => { try { f(); } catch { /* 화면 쪽 오류 */ } }); };
  let dev = lsGet('dl-mirror-dev'); if (!dev) { dev = Math.random().toString(36).slice(2, 12); lsSet('dl-mirror-dev', dev); }

  let mdb: Promise<IDBDatabase> | null = null;
  const mirrorDb = () => (mdb ||= openMirrorDb());
  const live = new Map<string, { store: string; id: unknown; del: boolean; val?: unknown }>();   // 창을 닫을 때 보낼 것 (값을 들고 있다)
  const qWrites = new Set<Promise<unknown>>();
  let needBackup = '';
  let gen = '';
  const baseMem = new Map<string, string | null>();   // 창을 닫을 때 쓸 base 사본

  async function count() { try { st.pending = await mtx<number>(await mirrorDb(), 'q', 'readonly', o => o.count()); } catch { st.pending = live.size; } emit(); }
  function note(store: string, id: unknown, del: boolean, val?: unknown) {
    if (skip(store, id)) return;
    const k = keyOf(store, id); live.set(k, { store, id, del, val });
    const p = mirrorDb().then(db => mtx(db, 'q', 'readwrite', o => o.put({ k, store, id, del, t: Date.now() + Math.random() } satisfies QEntry))).catch(() => { });
    qWrites.add(p); p.finally(() => qWrites.delete(p));
    st.pending = Math.max(st.pending, live.size); emit(); schedule(300);
  }

  // ── 감싸기 ──
  // frozen: 서버 자료를 받아 와 화면을 새로 열기 직전. 이 창의 메모리 상태는 낡았으므로 그 사이의 쓰기는 버린다 (받아 온 것을 덮지 않게)
  let frozen = false; const idle = () => Promise.resolve(undefined);
  DB.put = (s: string, v: unknown) => { if (frozen) return idle(); const p = raw.put(s, v); note(s, idOf(v), false, v); return p; };
  DB.del = (s: string, id: unknown) => { if (frozen) return idle(); const p = raw.del(s, id); note(s, id, true); return p; };
  DB.bulk = (s: string, list: unknown[]) => { if (frozen) return idle(); if (list.length >= 20) needBackup ||= 'pre-import'; const p = raw.bulk(s, list); for (const v of list) note(s, idOf(v), false, v); return p; };
  DB.clear = (s: string) => frozen ? idle() : (async () => {
    needBackup ||= 'pre-delete';
    let rows: unknown[] = []; try { rows = (await raw.all(s)) as unknown[] || []; } catch { /* 없는 저장소 */ }
    const r = await raw.clear(s); for (const v of rows) note(s, idOf(v), true); return r;
  })();

  // ── 서버와 주고받기 ──
  const headers = { 'Content-Type': 'application/json', 'x-dreamland': '1' };
  async function getJson<T>(path: string): Promise<T> {
    const r = await fetch(api + path, { cache: 'no-store' }); if (!r.ok || !(r.headers.get('content-type') || '').includes('json')) throw new Error(t('datafolder.err.status', { status: r.status })); return r.json() as Promise<T>;
  }
  async function post<T>(path: string, body: unknown): Promise<T> {
    const r = await fetch(api + path, { method: 'POST', headers, body: JSON.stringify(body) });
    const j = await r.json().catch(() => ({})) as T & { error?: string }; if (!r.ok) throw new Error(j.error || t('datafolder.err.status', { status: r.status })); return j;
  }
  async function ping() {
    try { const s = await getJson<{ on: boolean; dir: string }>('status'); st.server = s.on ? 'on' : 'off'; st.dir = s.dir || ''; }
    catch { st.server = 'off'; }
    emit(); return st.server === 'on';
  }

  // base: 마지막으로 서버와 같았던 해시. 브라우저 자료(dreamland DB)가 통째로 지워지면 gen 이 사라져 base 도 무효가 된다
  async function loadGen() {
    const rec = await raw.get('kv', 'dlmirror:gen').catch(() => undefined) as { gen?: string } | undefined;
    if (rec?.gen) gen = rec.gen; else { gen = Math.random().toString(36).slice(2) + Date.now().toString(36); await raw.put('kv', { id: 'dlmirror:gen', gen }); }
  }
  async function bases(): Promise<Map<string, string | null>> {
    const all = await mtx<BaseEntry[]>(await mirrorDb(), 'base', 'readonly', o => o.getAll());
    const m = new Map(all.filter(b => b.gen === gen).map(b => [b.k, b.h])); for (const [k, h] of m) baseMem.set(k, h); return m;
  }
  async function setBases(list: [string, string | null][]) {
    if (!list.length) return; for (const [k, h] of list) baseMem.set(k, h); const db = await mirrorDb();
    await mtx(db, 'base', 'readwrite', o => { for (const [k, h] of list) { if (h == null) o.delete(k); else o.put({ k, h, gen } satisfies BaseEntry); } });
  }

  /** 줄에 쌓인 것을 보낸다 */
  async function sendOps(ops: Op[]): Promise<{ ok: boolean; hash?: string; error?: string }[]> {
    const out: { ok: boolean; hash?: string; error?: string }[] = [];
    let batch: Op[] = [], size = 0;
    const go = async () => { if (!batch.length) return; const r = await post<{ results: { ok: boolean; hash?: string; error?: string }[] }>('put', { dev, ops: batch }); out.push(...r.results); batch = []; size = 0; };
    for (const op of ops) { const n = op.value === undefined ? 100 : JSON.stringify(op.value).length; if (size && size + n > BATCH) await go(); batch.push(op); size += n; }
    await go(); return out;
  }

  let flushing: Promise<void> | null = null, again = false, timer = 0, backoff = 1000;
  function schedule(ms: number) { clearTimeout(timer); timer = window.setTimeout(() => { void flush(); }, ms); }
  const locked = <T,>(fn: () => Promise<T>): Promise<T> => {
    const L = (navigator as Navigator & { locks?: { request(n: string, f: () => Promise<T>): Promise<T> } }).locks;
    return L ? L.request('dl-mirror', fn) : fn();
  };

  async function flushOnce() {
    if (!st.enabled) return;
    if (st.server !== 'on' && !(await ping())) throw new Error(t('datafolder.err.unreachable'));
    await Promise.all([...qWrites]);
    if (needBackup) { await post('backup', { reason: needBackup }); needBackup = ''; }
    const db = await mirrorDb();
    const q = await mtx<QEntry[]>(db, 'q', 'readonly', o => o.getAll()); if (!q.length) { live.clear(); await count(); return; }
    const base = await bases();
    const ops: Op[] = [], meta: { e: QEntry; hash: string | null }[] = [], done: QEntry[] = [];
    for (const e of q) {
      const v = await raw.get(e.store, e.id).catch(() => undefined);
      const b = base.has(e.k) ? base.get(e.k) : undefined;
      if (v === undefined) {
        if (!e.del) { done.push(e); continue; }   // 쓰라고 했는데 없다: 지우지 않는다 (다음 시작 때 다시 맞춘다)
        if (b === undefined) { /* 서버에 보낸 적이 없을 수도: 그래도 지우기를 알린다 (서버는 _trash 로 옮긴다) */ }
        ops.push({ op: 'del', store: e.store, id: e.id, ...(b !== undefined ? { base: b } : {}) }); meta.push({ e, hash: null }); continue;
      }
      const p = await pack(e.store, v);
      if (b === p.hash) { done.push(e); continue; }
      ops.push({ op: 'put', store: e.store, id: e.id, value: p.json, ...(b !== undefined ? { base: b } : {}) }); meta.push({ e, hash: p.hash });
    }
    const res = await sendOps(ops);
    const nb: [string, string | null][] = []; let bad = 0;
    res.forEach((r, i) => { const m = meta[i]; if (r.ok) { nb.push([m.e.k, m.hash === null ? null : r.hash || m.hash]); done.push(m.e); } else { bad++; st.error = r.error || t('datafolder.err.save'); } });
    await setBases(nb);
    // 보내는 사이 다시 바뀐 것(t 가 달라진 것)은 지우지 않고 남긴다
    await mtx(db, 'q', 'readwrite', o => { for (const e of done) { const g = o.get(e.k); g.onsuccess = () => { const cur = g.result as QEntry | undefined; if (cur && cur.t === e.t) o.delete(e.k); }; } });
    for (const e of done) { const l = live.get(e.k); if (l && !qWrites.size) live.delete(e.k); }
    st.pushed += nb.length; if (!bad) { st.error = ''; st.lastSync = Date.now(); lsSet('dl-datafolder-last', String(st.lastSync)); }
    await count();
  }
  async function flush(): Promise<void> {
    if (flushing) { again = true; return flushing; }
    flushing = (async () => {
      try { do { again = false; await locked(flushOnce); } while (again); backoff = 1000; }
      catch (e) { st.error = navigator.onLine === false ? t('datafolder.err.offline') : (e instanceof Error ? e.message : String(e)); emit(); schedule(backoff); backoff = Math.min(backoff * 2, 60000); }
      finally { flushing = null; }
    })();
    return flushing;
  }

  async function localRows(store: string): Promise<unknown[] | null> { try { return (await raw.all(store)) as unknown[] || []; } catch { return null; } }
  async function fetchValues(keys: { store: string; id: unknown }[]): Promise<Map<string, { hash: string; value: Json }>> {
    const out = new Map<string, { hash: string; value: Json }>();
    for (let i = 0; i < keys.length; i += 100) {
      const r = await post<({ store: string; id: unknown; hash: string; value: Json } | null)[]>('get', { keys: keys.slice(i, i + 100) });
      for (const x of r) if (x) out.set(keyOf(x.store, x.id), { hash: x.hash, value: x.value });
    }
    return out;
  }
  async function dump(): Promise<Map<string, { store: string; id: unknown; hash: string; value: Json }>> {
    const r = await fetch(api + 'dump', { cache: 'no-store' }); if (!r.ok || !r.body) throw new Error(t('datafolder.err.dump'));
    const out = new Map<string, { store: string; id: unknown; hash: string; value: Json }>();
    const rd = r.body.pipeThrough(new TextDecoderStream()).getReader(); let buf = '';
    for (; ;) {
      const { value, done } = await rd.read(); if (value) buf += value;
      let i; while ((i = buf.indexOf('\n')) >= 0) { const line = buf.slice(0, i); buf = buf.slice(i + 1); if (line) { const o = JSON.parse(line) as { store: string; id: unknown; hash: string; value: Json }; out.set(keyOf(o.store, o.id), o); } }
      if (done) break;
    }
    return out;
  }
  async function writeLocal(store: string, json: Json, local: unknown) { await raw.put(store, keepSecrets(store, decode(json), local)); }

  /** 시작할 때 맞추기. 서버에만 있거나 서버가 새로우면 받아 오고, 브라우저에만 있거나 브라우저가 새로우면 올린다 */
  let syncing: Promise<void> | null = null;
  function reconcile(): Promise<void> { return syncing ||= locked(reconcileOnce).finally(() => { syncing = null; }); }
  async function reconcileOnce() {
    if (!st.enabled || !(await ping())) return;
    st.phase = 'sync'; emit();
    try {
      await loadGen();
      // 줄에 남은 것은 먼저 보내지 않는다 (비어 있는 새 브라우저의 기본값이 서버 자료를 덮지 않게). 지우기 표시만 아래에서 따른다
      await Promise.all([...qWrites]);
      const qdb = await mirrorDb(); const queued = await mtx<QEntry[]>(qdb, 'q', 'readonly', o => o.getAll());
      const qDel = new Set(queued.filter(e => e.del).map(e => e.k));
      const metas = await getJson<Meta[]>('list');
      const server = new Map(metas.filter(m => !skip(m.store, m.id)).map(m => [keyOf(m.store, m.id), m]));
      const base = await bases();
      const stores = [...new Set([...STORES, ...metas.map(m => m.store)])];
      const local = new Map<string, { store: string; id: unknown; v: unknown; hash: string; json: Json }>();
      const known = new Set<string>();
      for (const s of stores) {
        const rows = await localRows(s); if (!rows) continue; known.add(s);
        for (const v of rows) { const id = idOf(v); if (skip(s, id)) continue; const p = await pack(s, v); local.set(keyOf(s, id), { store: s, id, v, hash: p.hash, json: p.json }); }
        await sleep(0);
      }
      const empty = ['chars', 'chats', 'msgs', 'lore', 'assets', 'mem'].every(s => ![...local.values()].some(l => l.store === s));
      const fresh = !base.size && empty && server.size > 0;   // 브라우저가 비었다 (지워졌거나 다른 기기): 서버 것을 따른다
      const pulls: Meta[] = [], pushes: Op[] = [], asides: { store: string; id: unknown; value: Json; note: string }[] = [], decide: string[] = [], nb: [string, string | null][] = [];
      for (const k of new Set([...local.keys(), ...server.keys()])) {
        const L = local.get(k), R = server.get(k), B = base.has(k) ? base.get(k) : undefined;
        if (R && !known.has(R.store)) continue;   // 브라우저에 없는 저장소 (새 판의 것): 그대로 둔다
        if (L && R && L.hash === R.hash) { if (B !== L.hash) nb.push([k, L.hash]); continue; }
        if (!L && R) { if (qDel.has(k) || (B !== undefined && B === R.hash)) pushes.push({ op: 'del', store: R.store, id: R.id, base: B }); else pulls.push(R); continue; }
        if (L && !R) {
          if (fresh && ['presets', 'personas'].includes(L.store) && (timeOf(L.store, L.v) || 0) > Date.now() - 10 * 60000) { asides.push({ store: L.store, id: L.id, value: L.json, note: '처음 불러올 때 저절로 만들어진 것' }); continue; }
          pushes.push({ op: 'put', store: L.store, id: L.id, value: L.json }); continue;
        }
        if (!L || !R) continue;
        if (B === L.hash) { pulls.push(R); continue; }
        if (B === R.hash) { pushes.push({ op: 'put', store: L.store, id: L.id, value: L.json, base: B }); continue; }
        decide.push(k);
      }
      // 양쪽이 다 바뀌었거나 이전 기록이 없다: 고친 시각으로 고르고, 밀려난 쪽은 _conflicts 에 남긴다
      if (decide.length) {
        const sv = await fetchValues(decide.map(k => { const m = server.get(k)!; return { store: m.store, id: m.id }; }));
        for (const k of decide) {
          const L = local.get(k)!, R = server.get(k)!, got = sv.get(k); if (!got) { pushes.push({ op: 'put', store: L.store, id: L.id, value: L.json }); continue; }
          const tl = timeOf(L.store, L.v), tr = timeOf(R.store, decode(got.value));
          const serverWins = fresh ? true : tl != null && tr != null && tr > tl;
          if (serverWins) { asides.push({ store: L.store, id: L.id, value: L.json, note: '서버 판이 더 새로워 브라우저 판을 남겨 둠' }); pulls.push(R); }
          else pushes.push({ op: 'put', store: L.store, id: L.id, value: L.json, keep: true });   // 서버 판은 서버가 _conflicts 로 옮긴다
        }
      }
      for (const a of asides) await post('conflict', { ...a, dev });
      st.conflicts += asides.length + pushes.filter(p => p.keep).length;
      // 받아 오기
      if (pulls.length || asides.length) frozen = true;
      if (pulls.length) {
        const vals = pulls.length > 200 ? await dump() : await fetchValues(pulls.map(m => ({ store: m.store, id: m.id })));
        for (const m of pulls) { const k = keyOf(m.store, m.id), got = vals.get(k); if (!got) continue; await writeLocal(m.store, got.value, local.get(k)?.v); nb.push([k, got.hash]); }
      }
      for (const a of asides) if (!pulls.some(p => keyOf(p.store, p.id) === keyOf(a.store, a.id))) await raw.del(a.store, a.id);   // 저절로 만들어진 기본값만: 서버 _conflicts 에 남긴 뒤
      // 올리기
      const res = await sendOps(pushes);
      res.forEach((r, i) => { const p = pushes[i]; if (r.ok) nb.push([keyOf(p.store, p.id), p.op === 'del' ? null : r.hash || null]); });
      await setBases(nb);
      // 맞추기 전에 쌓여 있던 줄은 이제 처리했다 (그 사이 다시 바뀐 것은 남긴다)
      await mtx(qdb, 'q', 'readwrite', o => { for (const e of queued) { const g = o.get(e.k); g.onsuccess = () => { const cur = g.result as QEntry | undefined; if (cur && cur.t === e.t) o.delete(e.k); }; } });
      for (const e of queued) live.delete(e.k);
      st.pulled += pulls.length; st.pushed += pushes.length; st.lastSync = Date.now(); lsSet('dl-datafolder-last', String(st.lastSync)); st.error = '';
      if (pulls.length || asides.length) {
        // 새로 연 뒤에도 또 받아 오면 무언가 맞지 않는 것: 2분 안에 세 번이면 멈추고 알린다 (무한히 새로 열지 않게)
        const hist = (sessionStorage.getItem('dl-mirror-reload') || '').split(',').map(Number).filter(t => t > Date.now() - 120000);
        if (hist.length < 3) { sessionStorage.setItem('dl-mirror-reload', [...hist, Date.now()].join(',')); opts.toast?.(tn('datafolder.pulled', pulls.length), 'ok'); await sleep(600); (opts.reload || (() => location.reload()))(); }
        else { frozen = false; st.error = t('datafolder.err.loop'); opts.toast?.(st.error, 'err'); }
      }
    } catch (e) { st.error = e instanceof Error ? e.message : String(e); schedule(5000); }
    finally { st.phase = 'idle'; await count(); }
  }

  /** 백업으로 되돌린다: 서버가 지금 상태를 먼저 백업하고 되돌린 뒤, 브라우저도 서버와 똑같이 맞춘다 */
  async function restore(name: string) {
    st.phase = 'restore'; emit();
    try {
      await flush(); if (st.pending) await flushOnce();
      await post('restore', { name });
      await locked(async () => {
        const all = await dump(); const nb: [string, string | null][] = [];
        for (const s of STORES) {
          const rows = await localRows(s); if (!rows) continue;
          const mine = new Map(rows.map(v => [keyOf(s, idOf(v)), v]));
          for (const [k, o] of all) if (o.store === s) { const lv = mine.get(k); if (!lv || (await pack(s, lv)).hash !== o.hash) await writeLocal(s, o.value, lv); nb.push([k, o.hash]); }
          for (const [k, v] of mine) if (!all.has(k) && !skip(s, idOf(v))) { await raw.del(s, idOf(v)); nb.push([k, null]); }   // 지우기 전 상태는 방금 서버가 백업했다
        }
        await setBases(nb);
        const db = await mirrorDb(); await mtx(db, 'q', 'readwrite', o => o.clear()); live.clear();
      });
      try { new BroadcastChannel('dl-mirror').postMessage('restored'); } catch { /* 없음 */ }
      (opts.reload || (() => location.reload()))();
    } finally { st.phase = 'idle'; await count(); }
  }

  // 창을 닫기 전에: 들고 있는 작은 것들을 sendBeacon 으로 (나머지는 줄에 남아 다음에 보낸다)
  function beacon() {
    if (!st.enabled || st.server !== 'on' || !live.size || !navigator.sendBeacon) return;
    const ops: Op[] = []; let size = 0;
    for (const l of live.values()) {
      try {
        const b = baseMem.get(keyOf(l.store, l.id)); const base = b === undefined ? {} : { base: b };
        if (l.del) { ops.push({ op: 'del', store: l.store, id: l.id, ...base }); size += 100; continue; }
        const p = packSync(l.store, l.val); if (size + p.str.length > 60000) continue; ops.push({ op: 'put', store: l.store, id: l.id, value: p.json, ...base }); size += p.str.length;
      } catch { /* Blob 등: 다음에 */ }
    }
    if (ops.length) navigator.sendBeacon(api + 'beacon', new Blob([JSON.stringify({ dev, ops })], { type: 'text/plain' }));
  }
  addEventListener('pagehide', beacon);
  addEventListener('online', () => { st.server = 'unknown'; void flush(); });
  try { new BroadcastChannel('dl-mirror').onmessage = e => { if (e.data === 'restored') (opts.reload || (() => location.reload()))(); }; } catch { /* 없음 */ }
  // 서버가 꺼져 있다가 켜지면 쌓인 것을 보낸다
  window.setInterval(() => { if (st.enabled && (st.pending || st.server !== 'on')) void (st.server === 'on' ? flush() : ping().then(ok => { if (ok) void reconcile(); })); }, 30000);

  const ready = opts.autoStart === false ? Promise.resolve() : reconcile();
  void count();
  return {
    state: () => snap,
    subscribe(fn) { subs.add(fn); return () => { subs.delete(fn); }; },
    setEnabled(on) { st.enabled = on; lsSet('dl-datafolder', on ? 'on' : 'off'); emit(); if (on) void reconcile(); },
    flush, sync: reconcile, restore,
    backupNow: () => post('backup', { reason: 'manual' }),
    ready,
  };
}
