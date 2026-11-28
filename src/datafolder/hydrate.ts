// 비어 있는 브라우저(처음 연 브라우저 · 브라우저 데이터를 지운 뒤): 앱을 그리기 전에 서버 자료 폴더(data/store)의 자료를 그대로 가져온다.
// 같은 서버(같은 주소 · 포트)로 열면 어느 브라우저에서든 같은 자료가 보인다 — 빈 앱을 먼저 보여 주지 않고, 백업에서 되살릴 필요도 없다.
// 바로 열기 위해 둘로 나눈다: 설정 · 캐릭터 · 대화방 목록 · 프리셋 · 로어 같은 작은 것만 먼저 가져와 열고,
// 대화 기록 · 기억 · 그림은 연 뒤 뒤에서 가져온다. 아직 안 온 방을 열면 그 방 것을 먼저 가져온다 (빈 방이 보이거나, 새 메시지가 옛 기록을 덮지 않게).
// 가져오는 도중에 끊기면(새로 열기 · 창 닫기) 다음에 켤 때 마저 가져온다.
import { DB, emit, setLazyGate } from '../lib/core';
import { chatOfId } from '../lib/msgstore';
import { SERVER_HEADERS, Server } from '../lib/server';
import { decode, keepSecrets, type Json } from './codec';
import { STORES, primeBases, holdReconcile } from './mirror';
import { t } from '../i18n';

const MARK = 'dl-hydrating', MARK_REST = 'dl-hydrating-rest';
// 연 뒤 뒤에서 가져오는 것
const LATER = ['msgs', 'mem', 'assets'];
// 이 가운데 하나라도 있으면 쓰던 브라우저다 (기본 프리셋 · 페르소나는 켤 때 저절로 생기므로 보지 않는다)
const MINE = ['chars', 'chats', 'msgs', 'lore', 'assets', 'mem'];
const BATCH_BYTES = 4 << 20, BATCH_ROWS = 200;

const lsGet = (k: string) => { try { return localStorage.getItem(k); } catch { return null; } };
const lsSet = (k: string, v: string | null) => { try { if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch { /* 저장소를 못 쓰는 창 */ } };

async function browserEmpty() {
  for (const s of MINE) { const k = await DB.keys(s as never).catch(() => [] as unknown[]); if (k.length) return false; }
  return !(await DB.get('kv' as never, 'settings').catch(() => undefined));
}

/** 서버 자료를 줄 단위로 받아 묶어서 쓴다. 받은 것의 [저장소, id, 서버 해시] 를 돌려준다 */
async function stream(query: string, write: (store: string, rows: unknown[]) => Promise<unknown>, onBatch: (n: number) => void, skip?: Set<string>): Promise<[string, unknown, string][]> {
  const r = await Server.get('store/dump' + query, { cache: 'no-store' }); if (!r.ok || !r.body) throw new Error(t('datafolder.err.dump'));
  const known = new Set(STORES), got: [string, unknown, string][] = [];
  let batch = new Map<string, unknown[]>(), rows = 0, bytes = 0, done = 0;
  const flush = async () => { for (const [store, list] of batch) await write(store, list); batch = new Map(); rows = 0; bytes = 0; onBatch(done); };
  const rd = r.body.pipeThrough(new TextDecoderStream()).getReader(); let buf = '';
  for (; ;) {
    const { value, done: end } = await rd.read(); if (value) buf += value;
    let i;
    while ((i = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, i); buf = buf.slice(i + 1); if (!line) continue;
      const o = JSON.parse(line) as { store: string; id: unknown; hash: string; value: Json };
      if (!known.has(o.store)) continue;
      got.push([o.store, o.id, o.hash]); done++;
      if (skip?.has(String(o.id))) continue;
      const list = batch.get(o.store) || []; list.push(keepSecrets(o.store, decode(o.value), undefined)); batch.set(o.store, list);
      rows++; bytes += line.length;
      if (rows >= BATCH_ROWS || bytes >= BATCH_BYTES) await flush();
    }
    if (end) break;
  }
  await flush();
  return got;
}

/** 자료 폴더 거울을 거치지 않고 브라우저 저장소에 바로 쓴다 (서버에서 온 것을 도로 서버로 보내지 않게) */
const rawDb = () => new Promise<IDBDatabase>((res, rej) => { const r = indexedDB.open('dreamland'); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
const rawPut = (d: IDBDatabase, store: string, rows: unknown[]) => new Promise<void>((res, rej) => { const tx = d.transaction(store, 'readwrite'), st = tx.objectStore(store); for (const v of rows) st.put(v); tx.oncomplete = () => res(); tx.onerror = () => rej(tx.error); tx.onabort = () => rej(tx.error); });
const rawHas = (d: IDBDatabase, store: string, id: unknown) => new Promise<boolean>(res => { try { const q = d.transaction(store, 'readonly').objectStore(store).getKey(id as IDBValidKey); q.onsuccess = () => res(q.result !== undefined); q.onerror = () => res(false); } catch { res(false); } });
const rawKeys = (d: IDBDatabase, store: string) => new Promise<Set<string>>(res => { try { const q = d.transaction(store, 'readonly').objectStore(store).getAllKeys(); q.onsuccess = () => res(new Set(q.result.map(String))); q.onerror = () => res(new Set()); } catch { res(new Set()); } });
type Meta = { store: string; id: unknown; hash: string };
const listOf = async (store: string) => { const r = await Server.get('store/list?store=' + store, { cache: 'no-store' }); if (!r.ok) throw new Error(t('datafolder.err.dump')); return await r.json() as Meta[]; };
const getMany = async (keys: { store: string; id: unknown }[]) => { const r = await Server.post('store/get', { keys }); if (!r.ok) throw new Error(t('datafolder.err.dump')); return await r.json() as ({ store: string; id: unknown; hash: string; value: Json } | null)[]; };
/** 몇 개씩 나란히 */
async function each<T>(list: T[], n: number, fn: (x: T) => Promise<unknown>) { let i = 0; await Promise.all(Array.from({ length: Math.min(n, list.length) }, async () => { while (i < list.length) { const x = list[i++]; try { await fn(x); } catch (e) { console.warn('[자료 폴더]', e); } } })); }

/** 연 뒤 뒤에서: 대화 기록(최근 방부터) → 기억 → 그림. 그 사이 앱이 아직 안 온 것을 찾으면 그것부터 (core 의 setLazyGate) */
function backgroundHere(before: [string, unknown, string][]): Promise<void> {
  const got: [string, unknown, string][] = [...before], pending = new Set(LATER);
  const waits = new Map(LATER.map(s => { let res!: () => void; const p = new Promise<void>(r => { res = r; }); return [s, { p, res }] as const; }));
  const finish = (s: string) => { pending.delete(s); waits.get(s)!.res(); };
  const dbp = rawDb();
  // 대화 기록: 방마다 한 번에 (그 방의 머리 · 조각을 한 트랜잭션으로 — 반만 들어가는 일이 없게)
  const msgIdx = listOf('msgs').then(list => { const m = new Map<string, Meta[]>(); for (const x of list) { const c = chatOfId(x.id); const a = m.get(c) || []; a.push(x); m.set(c, a); } return m; });
  const rooms = new Map<string, Promise<void>>();
  // 실패해도 앱의 읽기 · 쓰기를 막지 않는다 (있는 것으로 열고, 다음에 켤 때 마저 가져온다 — 덮인 서버 판은 서버가 _conflicts 에 남긴다)
  const safe = (p: Promise<void>) => p.catch(e => console.warn('[자료 폴더] 그 방 것을 가져오지 못함', e));
  const room = (chatId: string) => rooms.get(chatId) || (rooms.set(chatId, safe((async () => {
    const d = await dbp; if (await rawHas(d, 'msgs', chatId)) return;   // 이미 있다 (가져왔거나 이 브라우저에서 새로 쓴 방)
    const ids = (await msgIdx).get(chatId); if (!ids?.length) return;
    const vals = (await getMany(ids.map(x => ({ store: 'msgs', id: x.id })))).filter(Boolean) as { store: string; id: unknown; hash: string; value: Json }[];
    if (await rawHas(d, 'msgs', chatId)) return;
    await rawPut(d, 'msgs', vals.map(v => keepSecrets('msgs', decode(v.value), undefined)));
    for (const v of vals) got.push(['msgs', v.id, v.hash]);
  })())), rooms.get(chatId)!);
  const mems = new Map<string, Promise<void>>();
  const mem = (id: string, hash?: string) => mems.get(id) || (mems.set(id, safe((async () => {
    const d = await dbp; if (await rawHas(d, 'mem', id)) return;
    const [v] = await getMany([{ store: 'mem', id }]); if (!v || await rawHas(d, 'mem', id)) return;
    await rawPut(d, 'mem', [keepSecrets('mem', decode(v.value), undefined)]); got.push(['mem', v.id, v.hash || hash || '']);
  })())), mems.get(id)!);
  setLazyGate({
    store: s => pending.has(s) ? waits.get(s)!.p : null,
    one: (s, id) => s === 'msgs' && pending.has('msgs') ? room(chatOfId(id)) : s === 'mem' && pending.has('mem') ? mem(id) : null,
  });
  return (async () => {
    const d = await dbp;
    try {
      // 최근에 쓴 방부터
      const chats = await new Promise<{ id: string; updatedAt?: number }[]>(res => { try { const q = d.transaction('chats', 'readonly').objectStore('chats').getAll(); q.onsuccess = () => res(q.result); q.onerror = () => res([]); } catch { res([]); } });
      const order = [...chats].sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0)).map(c => c.id), idx = await msgIdx;
      for (const k of idx.keys()) if (!order.includes(k)) order.push(k);
      await each(order, 3, room); finish('msgs');
      const memList = await listOf('mem'); await each(memList, 4, x => mem(String(x.id), x.hash)); finish('mem');
      // 그림: 한 줄씩 흘려받아 묶어서 (도착하는 대로 화면의 그림을 다시 찾는다)
      const have = await rawKeys(d, 'assets'); let told = 0;
      const pics = await stream('?store=assets', (_s, rows) => rawPut(d, 'assets', rows), () => { if (Date.now() - told > 700) { told = Date.now(); void import('../lib/illust').then(m => m.assetsArrived()); } }, have);
      got.push(...pics); finish('assets');
      primeBases(got);
      lsSet(MARK_REST, null);
      void import('../lib/illust').then(m => m.assetsArrived());
    } finally {
      for (const s of LATER) finish(s);   // 실패해도 앱이 기다리다 멈추지 않게 (다음에 켤 때 마저 가져온다)
      setLazyGate(null); d.close();
    }
  })();
}

/** 뒤에서 가져오기: 일꾼(hydrate.worker.ts)이 받고 · 풀고 · 쓴다 (화면이 멈추지 않게). 일꾼을 못 쓰는 곳에서는 화면에서 */
function background(before: [string, unknown, string][]): Promise<void> {
  let w: Worker;
  try { w = new Worker(new URL('./hydrate.worker.ts', import.meta.url), { type: 'module' }); } catch { return backgroundHere(before); }
  const pending = new Set(LATER), waits = new Map(LATER.map(s => { let res!: () => void; const p = new Promise<void>(r => { res = r; }); return [s, { p, res }] as const; }));
  const finish = (s: string) => { if (!pending.delete(s)) return; waits.get(s)!.res(); };
  type Reply = { n: number; stage?: string; progress?: string; done?: boolean; error?: string; got?: [string, unknown, string][] };
  let n = 0; const calls = new Map<number, (d: Reply) => void>();
  const base = new URL(Server.url(''), location.href).href, headers = { ...SERVER_HEADERS };
  const call = (op: string, extra: Record<string, unknown>, on: (d: Reply) => boolean) => new Promise<void>(res => { const k = ++n; calls.set(k, d => { if (on(d)) { calls.delete(k); res(); } }); w.postMessage({ n: k, op, base, headers, ...extra }); });
  w.onmessage = (e: MessageEvent<Reply>) => calls.get(e.data.n)?.(e.data);
  const one = (op: 'room' | 'mem', id: string) => call(op, { id }, () => true);   // 실패해도 앱의 읽기 · 쓰기를 막지 않는다 (있는 것으로 연다)
  setLazyGate({
    store: s => pending.has(s) ? waits.get(s)!.p : null,
    one: (s, id) => s === 'msgs' && pending.has('msgs') ? one('room', chatOfId(id)) : s === 'mem' && pending.has('mem') ? one('mem', id) : null,
  });
  return new Promise<void>(res => {
    const end = (got: [string, unknown, string][], ok: boolean) => {
      for (const s of LATER) finish(s);
      setLazyGate(null); w.terminate();
      if (ok) { primeBases([...before, ...got]); lsSet(MARK_REST, null); }
      void import('../lib/illust').then(m => m.assetsArrived());
      emit('data:hydrated');
      res();
    };
    w.onerror = () => end([], false);
    void call('all', {}, d => {
      if (d.stage) finish(d.stage);
      if (d.progress) void import('../lib/illust').then(m => m.assetsArrived());
      if (d.done || d.error) { if (d.error) console.warn('[자료 폴더] 뒤에서 가져오지 못함', d.error); end(d.got || [], !!d.done); return true; }
      return false;
    });
  });
}

/** 필요하면 서버 자료를 가져온다. 가져왔으면 true. 서버가 없거나 · 꺼져 있거나 · 서버에 자료가 없으면 아무것도 하지 않는다
 *  작은 것(설정 · 캐릭터 · 대화방 목록 …)만 먼저 가져와 바로 열고, 대화 기록 · 기억 · 그림은 연 뒤 뒤에서 가져온다 */
export async function hydrateFromServer(): Promise<boolean> {
  if (!/^https?:$/.test(location.protocol) || lsGet('dl-datafolder') === 'off') return false;
  const again = lsGet(MARK) === '1';   // 지난번에 가져오다 끊겼다
  if (!again && !(await browserEmpty())) {
    // 먼저 것은 다 가져왔는데 대화 기록 · 기억 · 그림을 가져오다 끊겼다: 뒤에서 마저
    if (lsGet(MARK_REST) === '1') holdReconcile(background([]).catch(e => console.warn('[자료 폴더] 마저 가져오지 못함', e)));
    return false;
  }
  let total = 0;
  try {
    const r = await Server.get('store/status', { cache: 'no-store' }); if (!r.ok) return false;
    const s = await r.json() as { on?: boolean; records?: number; perStore?: Record<string, number> }; if (!s.on || !s.records) return false;
    total = s.records - LATER.reduce((a, k) => a + (s.perStore?.[k] || 0), 0);
  } catch { return false; }

  // 금방 끝나면 아무것도 보이지 않게: 0.6초 넘게 걸릴 때만 진행 화면
  let ui: ReturnType<typeof overlay> | null = null, last = 0;
  const showTimer = window.setTimeout(() => { ui = overlay(total); ui.set(last); }, 600);
  lsSet(MARK, '1');
  try {
    const got = await stream('?except=' + LATER.join(','), (store, rows) => DB.bulk(store as never, rows as object[]), n => { last = n; ui?.set(n); });
    primeBases(got);
    lsSet(MARK, null); lsSet(MARK_REST, '1');
    holdReconcile(background(got).catch(e => console.warn('[자료 폴더] 뒤에서 가져오지 못함', e)));
    clearTimeout(showTimer); (ui as ReturnType<typeof overlay> | null)?.close();
    return true;
  } catch (e) {
    // 끝까지 못 가져왔다: 반쪽 자료로 앱을 열지 않는다. 무엇이 막혔는지와 다시 시도 버튼만 (다음에 켤 때도 처음부터 다시 가져온다)
    console.error('[자료 폴더] 서버 자료를 가져오지 못함', e);
    clearTimeout(showTimer); const u = ui || overlay(total); u.fail(e instanceof Error ? e.message : String(e));
    return new Promise<boolean>(() => { });
  }
}

/** 가져오는 동안의 화면: 빈 앱 대신 (켜기 지킴이가 멈췄다고 보지 않도록 #page 안에 둔다) */
function overlay(total: number) {
  const page = document.getElementById('page') || document.body;
  const box = document.createElement('div');
  box.className = 'dl-hydrate';
  box.setAttribute('role', 'status');
  box.style.cssText = 'position:fixed;inset:0;z-index:9000;display:flex;align-items:center;justify-content:center;padding:24px;background:var(--bg,#fbf5f2);color:var(--ink,#3a2f33);text-align:center';
  const card = document.createElement('div'); card.style.cssText = 'max-width:320px;width:100%';
  const title = document.createElement('p'); title.textContent = t('datafolder.hydrate.title'); title.style.cssText = 'margin:0 0 6px;font-weight:700;font-size:17px';
  const hint = document.createElement('p'); hint.textContent = t('datafolder.hydrate.hint'); hint.style.cssText = 'margin:0 0 16px;font-size:13.5px;opacity:.7;line-height:1.55';
  const bar = document.createElement('div'); bar.style.cssText = 'height:4px;border-radius:4px;background:color-mix(in srgb,currentColor 12%,transparent);overflow:hidden';
  const fill = document.createElement('div'); fill.style.cssText = 'height:100%;width:0;background:var(--accent,#c97b8e);transition:width .2s'; bar.append(fill);
  const count = document.createElement('p'); count.style.cssText = 'margin:8px 0 0;font-size:12.5px;opacity:.6;font-variant-numeric:tabular-nums';
  card.append(title, hint, bar, count); box.append(card); page.append(box);
  const set = (n: number) => { fill.style.width = Math.min(100, total ? n / total * 100 : 0) + '%'; count.textContent = t('datafolder.hydrate.count', { done: n, total }); };
  set(0);
  return {
    set,
    fail(msg: string) {
      title.textContent = t('datafolder.hydrate.fail'); hint.textContent = msg; bar.remove(); count.remove();
      const b = document.createElement('button'); b.type = 'button'; b.className = 'btn primary'; b.textContent = t('datafolder.hydrate.retry'); b.onclick = () => location.reload(); card.append(b);
    },
    close() { box.remove(); },
  };
}
