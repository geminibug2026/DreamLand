// 비어 있는 브라우저(처음 연 브라우저 · 브라우저 데이터를 지운 뒤): 앱을 그리기 전에 서버 자료 폴더(data/store)의 자료를 그대로 가져온다.
// 같은 서버(같은 주소 · 포트)로 열면 어느 브라우저에서든 같은 자료가 보인다 — 빈 앱을 먼저 보여 주지 않고, 백업에서 되살릴 필요도 없다.
// 가져오는 도중에 끊기면(새로 열기 · 창 닫기) 다음에 켤 때 처음부터 다시 가져온다.
import { DB } from '../lib/core';
import { Server } from '../lib/server';
import { decode, keepSecrets, type Json } from './codec';
import { STORES, primeBases } from './mirror';
import { t } from '../i18n';

const MARK = 'dl-hydrating';
// 이 가운데 하나라도 있으면 쓰던 브라우저다 (기본 프리셋 · 페르소나는 켤 때 저절로 생기므로 보지 않는다)
const MINE = ['chars', 'chats', 'msgs', 'lore', 'assets', 'mem'];
const BATCH_BYTES = 4 << 20, BATCH_ROWS = 200;

const lsGet = (k: string) => { try { return localStorage.getItem(k); } catch { return null; } };
const lsSet = (k: string, v: string | null) => { try { if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch { /* 저장소를 못 쓰는 창 */ } };

async function browserEmpty() {
  for (const s of MINE) { const k = await DB.keys(s as never).catch(() => [] as unknown[]); if (k.length) return false; }
  return !(await DB.get('kv' as never, 'settings').catch(() => undefined));
}

/** 필요하면 서버 자료를 가져온다. 가져왔으면 true. 서버가 없거나 · 꺼져 있거나 · 서버에 자료가 없으면 아무것도 하지 않는다 */
export async function hydrateFromServer(): Promise<boolean> {
  if (!/^https?:$/.test(location.protocol) || lsGet('dl-datafolder') === 'off') return false;
  const again = lsGet(MARK) === '1';   // 지난번에 가져오다 끊겼다
  if (!again && !(await browserEmpty())) return false;
  let total = 0;
  try {
    const r = await Server.get('store/status', { cache: 'no-store' }); if (!r.ok) return false;
    const s = await r.json() as { on?: boolean; records?: number }; if (!s.on || !s.records) return false;
    total = s.records;
  } catch { return false; }

  const ui = overlay(total); lsSet(MARK, '1');
  try {
    const r = await Server.get('store/dump', { cache: 'no-store' }); if (!r.ok || !r.body) throw new Error(t('datafolder.err.dump'));
    const known = new Set(STORES);
    let batch = new Map<string, unknown[]>(), rows = 0, bytes = 0, done = 0; const got: [string, unknown, string][] = [];
    const flush = async () => { for (const [store, list] of batch) await DB.bulk(store as never, list as object[]); batch = new Map(); rows = 0; bytes = 0; ui.set(done); };
    const rd = r.body.pipeThrough(new TextDecoderStream()).getReader(); let buf = '';
    for (; ;) {
      const { value, done: end } = await rd.read(); if (value) buf += value;
      let i;
      while ((i = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, i); buf = buf.slice(i + 1); if (!line) continue;
        const o = JSON.parse(line) as { store: string; id: unknown; hash: string; value: Json };
        if (!known.has(o.store)) continue;
        got.push([o.store, o.id, o.hash]);
        const list = batch.get(o.store) || []; list.push(keepSecrets(o.store, decode(o.value), undefined)); batch.set(o.store, list);
        rows++; bytes += line.length; done++;
        if (rows >= BATCH_ROWS || bytes >= BATCH_BYTES) await flush();
      }
      if (end) break;
    }
    await flush();
    primeBases(got);   // 자료 폴더 거울이 처음 맞출 때: 이것들은 서버와 같다
    lsSet(MARK, null);
    return true;
  } catch (e) {
    // 끝까지 못 가져왔다: 반쪽 자료로 앱을 열지 않는다. 무엇이 막혔는지와 다시 시도 버튼만 (다음에 켤 때도 처음부터 다시 가져온다)
    console.error('[자료 폴더] 서버 자료를 가져오지 못함', e);
    ui.fail(e instanceof Error ? e.message : String(e));
    return new Promise<boolean>(() => { });
  }
  finally { if (lsGet(MARK) !== '1') ui.close(); }
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
