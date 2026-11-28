// 빈 브라우저로 켠 뒤 뒤에서 서버 자료를 가져오는 일꾼 (src/datafolder/hydrate.ts).
// 받기 · 풀기 · 저장을 화면 밖에서 한다 — 대화 기록 · 그림이 수백 MB 여도 그동안 화면이 멈추지 않게.
//  · room: 그 방의 메시지(머리 · 조각)를 한 트랜잭션으로 (반만 들어가는 일이 없게). 이미 있으면 건드리지 않는다
//  · mem: 그 방의 기억 한 줄
//  · all: 최근 방부터 대화 기록 → 기억 → 그림을 차례로. 단계가 끝날 때마다 알린다
import { decode, type Json } from './codec';

interface Job { n: number; op: 'room' | 'mem' | 'all'; id?: string; base: string; headers: Record<string, string> }
type Meta = { store: string; id: unknown; hash: string };
type Rec = { store: string; id: unknown; hash: string; value: Json };

let dbp: Promise<IDBDatabase> | null = null;
const db = () => dbp ||= new Promise((res, rej) => { const r = indexedDB.open('dreamland'); r.onsuccess = () => { r.result.onversionchange = () => { r.result.close(); dbp = null; }; res(r.result); }; r.onerror = () => rej(r.error); });
const has = async (store: string, id: unknown) => { const d = await db(); return new Promise<boolean>(res => { try { const q = d.transaction(store, 'readonly').objectStore(store).getKey(id as IDBValidKey); q.onsuccess = () => res(q.result !== undefined); q.onerror = () => res(false); } catch { res(false); } }); };
const keys = async (store: string) => { const d = await db(); return new Promise<Set<string>>(res => { try { const q = d.transaction(store, 'readonly').objectStore(store).getAllKeys(); q.onsuccess = () => res(new Set(q.result.map(String))); q.onerror = () => res(new Set()); } catch { res(new Set()); } }); };
const all = async <T,>(store: string) => { const d = await db(); return new Promise<T[]>(res => { try { const q = d.transaction(store, 'readonly').objectStore(store).getAll(); q.onsuccess = () => res(q.result as T[]); q.onerror = () => res([]); } catch { res([]); } }); };
const put = async (store: string, rows: unknown[]) => { if (!rows.length) return; const d = await db(); await new Promise<void>((res, rej) => { const tx = d.transaction(store, 'readwrite'), st = tx.objectStore(store); for (const v of rows) st.put(v); tx.oncomplete = () => res(); tx.onerror = () => rej(tx.error); tx.onabort = () => rej(tx.error); }); };

let cfg: { base: string; headers: Record<string, string> } = { base: '/api/', headers: {} };
const getJson = async <T,>(path: string) => { const r = await fetch(cfg.base + path, { cache: 'no-store' }); if (!r.ok) throw new Error('HTTP ' + r.status); return await r.json() as T; };
const getMany = async (k: { store: string; id: unknown }[]) => { const r = await fetch(cfg.base + 'store/get', { method: 'POST', headers: cfg.headers, body: JSON.stringify({ keys: k }) }); if (!r.ok) throw new Error('HTTP ' + r.status); return (await r.json() as (Rec | null)[]).filter((x): x is Rec => !!x); };

const chatOf = (id: unknown) => { const s = String(id ?? ''); const i = s.indexOf('!'); return i > 0 ? s.slice(0, i) : s; };
let msgIdx: Promise<Map<string, Meta[]>> | null = null;
const index = () => msgIdx ||= getJson<Meta[]>('store/list?store=msgs').then(list => { const m = new Map<string, Meta[]>(); for (const x of list) { const c = chatOf(x.id); const a = m.get(c) || []; a.push(x); m.set(c, a); } return m; });

const got: [string, unknown, string][] = [];
const rooms = new Map<string, Promise<void>>(), mems = new Map<string, Promise<void>>();
const room = (chatId: string) => rooms.get(chatId) || (rooms.set(chatId, (async () => {
  if (await has('msgs', chatId)) return;   // 이미 있다 (가져왔거나 이 브라우저에서 새로 쓴 방)
  const ids = (await index()).get(chatId); if (!ids?.length) return;
  const vals = await getMany(ids.map(x => ({ store: 'msgs', id: x.id })));
  if (await has('msgs', chatId)) return;
  await put('msgs', vals.map(v => decode(v.value)));
  for (const v of vals) got.push(['msgs', v.id, v.hash]);
})()), rooms.get(chatId)!);
const mem = (id: string) => mems.get(id) || (mems.set(id, (async () => {
  if (await has('mem', id)) return;
  const [v] = await getMany([{ store: 'mem', id }]); if (!v || await has('mem', id)) return;
  await put('mem', [decode(v.value)]); got.push(['mem', v.id, v.hash]);
})()), mems.get(id)!);

/** 몇 개씩 나란히 (하나가 실패해도 나머지는 간다) */
async function each<T>(list: T[], n: number, fn: (x: T) => Promise<unknown>) { let i = 0; await Promise.all(Array.from({ length: Math.min(n, list.length) }, async () => { while (i < list.length) { const x = list[i++]; try { await fn(x); } catch (e) { console.warn('[자료 폴더 일꾼]', e); } } })); }

/** 그림: 한 줄씩 흘려받아 묶어서 쓴다. 이미 있는 것은 건너뛴다 */
async function assets(progress: () => void) {
  const have = await keys('assets');
  const r = await fetch(cfg.base + 'store/dump?store=assets', { cache: 'no-store' }); if (!r.ok || !r.body) throw new Error('HTTP ' + r.status);
  const rd = r.body.pipeThrough(new TextDecoderStream()).getReader(); let buf = '', batch: unknown[] = [], bytes = 0;
  const flush = async () => { if (!batch.length) return; await put('assets', batch); batch = []; bytes = 0; progress(); };
  for (; ;) {
    const { value, done } = await rd.read(); if (value) buf += value;
    let i;
    while ((i = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, i); buf = buf.slice(i + 1); if (!line) continue;
      const o = JSON.parse(line) as Rec; got.push([o.store, o.id, o.hash]);
      if (have.has(String(o.id))) continue;
      batch.push(decode(o.value)); bytes += line.length;
      if (batch.length >= 100 || bytes >= 4 << 20) await flush();
    }
    if (done) break;
  }
  await flush();
}

self.onmessage = async (e: MessageEvent<Job>) => {
  const j = e.data; cfg = { base: j.base, headers: j.headers };
  try {
    if (j.op === 'room') { await room(String(j.id)); return postMessage({ n: j.n }); }
    if (j.op === 'mem') { await mem(String(j.id)); return postMessage({ n: j.n }); }
    // 전부: 최근 방부터
    const chats = await all<{ id: string; updatedAt?: number }>('chats'), idx = await index();
    const order = chats.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0)).map(c => c.id); for (const k of idx.keys()) if (!order.includes(k)) order.push(k);
    await each(order, 3, room); postMessage({ n: j.n, stage: 'msgs' });
    const memList = await getJson<Meta[]>('store/list?store=mem'); await each(memList, 4, x => mem(String(x.id))); postMessage({ n: j.n, stage: 'mem' });
    let told = 0; await assets(() => { if (Date.now() - told > 700) { told = Date.now(); postMessage({ n: j.n, progress: 'assets' }); } }); postMessage({ n: j.n, stage: 'assets' });
    postMessage({ n: j.n, done: true, got });
  } catch (err) { postMessage({ n: j.n, error: err instanceof Error ? err.message : String(err), got }); }
};
