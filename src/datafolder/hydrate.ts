// 비어 있는 브라우저(처음 연 브라우저 · 브라우저 데이터를 지운 뒤): 앱을 그리기 전에 서버 자료 폴더(data/store)의 자료를 그대로 가져온다.
// 같은 서버(같은 주소 · 포트)로 열면 어느 브라우저에서든 같은 자료가 보인다 — 빈 앱을 먼저 보여 주지 않고, 백업에서 되살릴 필요도 없다.
// 가져오는 도중에 끊기면(새로 열기 · 창 닫기) 다음에 켤 때 처음부터 다시 가져온다.
import { DB } from '../lib/core';
import { Server } from '../lib/server';
import { decode, keepSecrets, type Json } from './codec';
import { STORES, primeBases, holdReconcile } from './mirror';
import { t } from '../i18n';

const MARK = 'dl-hydrating', MARK_ASSETS = 'dl-hydrating-assets';
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

/** 그림(assets)은 화면을 연 뒤 뒤에서: 자료 폴더 거울을 거치지 않고 브라우저 저장소에 바로 쓴다 (도로 서버로 보내지 않게) */
const rawDb = () => new Promise<IDBDatabase>((res, rej) => { const r = indexedDB.open('dreamland'); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
async function assetsInBackground(before: [string, unknown, string][]) {
  const d = await rawDb();
  try {
    const have = await new Promise<Set<string>>(res => { try { const q = d.transaction('assets', 'readonly').objectStore('assets').getAllKeys(); q.onsuccess = () => res(new Set(q.result.map(String))); q.onerror = () => res(new Set()); } catch { res(new Set()); } });
    const put = (_store: string, rows: unknown[]) => new Promise<void>((res, rej) => { const tx = d.transaction('assets', 'readwrite'), st = tx.objectStore('assets'); for (const v of rows) st.put(v); tx.oncomplete = () => res(); tx.onerror = () => rej(tx.error); tx.onabort = () => rej(tx.error); });
    let told = 0;
    const got = await stream('?store=assets', put, () => { if (Date.now() - told > 700) { told = Date.now(); void import('../lib/illust').then(m => m.assetsArrived()); } }, have);
    primeBases([...before, ...got]);
    lsSet(MARK_ASSETS, null);
    void import('../lib/illust').then(m => m.assetsArrived());
  } finally { d.close(); }
}

/** 필요하면 서버 자료를 가져온다. 가져왔으면 true. 서버가 없거나 · 꺼져 있거나 · 서버에 자료가 없으면 아무것도 하지 않는다
 *  글(캐릭터 · 대화 · 설정 …)만 먼저 가져와 바로 열고, 그림은 연 뒤 뒤에서 가져온다 */
export async function hydrateFromServer(): Promise<boolean> {
  if (!/^https?:$/.test(location.protocol) || lsGet('dl-datafolder') === 'off') return false;
  const again = lsGet(MARK) === '1';   // 지난번에 가져오다 끊겼다
  if (!again && !(await browserEmpty())) {
    // 글은 다 가져왔는데 그림을 가져오다 끊겼다: 뒤에서 마저
    if (lsGet(MARK_ASSETS) === '1') holdReconcile(assetsInBackground([]).catch(e => console.warn('[자료 폴더] 그림을 마저 가져오지 못함', e)));
    return false;
  }
  let total = 0;
  try {
    const r = await Server.get('store/status', { cache: 'no-store' }); if (!r.ok) return false;
    const s = await r.json() as { on?: boolean; records?: number; perStore?: Record<string, number> }; if (!s.on || !s.records) return false;
    total = s.records - (s.perStore?.assets || 0);
  } catch { return false; }

  // 금방 끝나면 아무것도 보이지 않게: 0.6초 넘게 걸릴 때만 진행 화면
  let ui: ReturnType<typeof overlay> | null = null, last = 0;
  const showTimer = window.setTimeout(() => { ui = overlay(total); ui.set(last); }, 600);
  lsSet(MARK, '1');
  try {
    const got = await stream('?except=assets', (store, rows) => DB.bulk(store as never, rows as object[]), n => { last = n; ui?.set(n); });
    primeBases(got);
    lsSet(MARK, null); lsSet(MARK_ASSETS, '1');
    holdReconcile(assetsInBackground(got).catch(e => console.warn('[자료 폴더] 그림을 가져오지 못함', e)));
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
