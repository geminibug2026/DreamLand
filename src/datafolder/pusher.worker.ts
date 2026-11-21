// 자료 폴더 거울의 무거운 보내기(긴 대화방의 메시지 묶음)를 화면 밖에서: 브라우저 저장소에서 직접 읽어 JSON · 해시를 만들고 서버로 보낸다.
// 화면(메인 스레드)은 수 MB 를 읽고 · 바꾸고 · 보내는 동안 멈추지 않는다
import { pack } from './codec';

interface Job { n: number; store: string; id: unknown; base?: string | null; dev: string; url: string; headers: Record<string, string> }
let dbp: Promise<IDBDatabase> | null = null;
const db = () => dbp ||= new Promise((res, rej) => { const r = indexedDB.open('dreamland'); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
const get = async (store: string, id: unknown) => { const d = await db(); return new Promise<unknown>((res, rej) => { const q = d.transaction(store, 'readonly').objectStore(store).get(id as IDBValidKey); q.onsuccess = () => res(q.result); q.onerror = () => rej(q.error); }); };

self.onmessage = async (e: MessageEvent<Job>) => {
  const j = e.data;
  try {
    const v = await get(j.store, j.id);
    if (v === undefined) return postMessage({ n: j.n, gone: true });
    const p = await pack(j.store, v);
    if (j.base === p.hash) return postMessage({ n: j.n, same: true, hash: p.hash });
    const op = '{"op":"put","store":' + JSON.stringify(j.store) + ',"id":' + JSON.stringify(j.id) + (j.base != null ? ',"base":' + JSON.stringify(j.base) : '') + ',"value":' + p.str + '}';
    const r = await fetch(j.url, { method: 'POST', headers: j.headers, body: '{"dev":' + JSON.stringify(j.dev) + ',"ops":[' + op + ']}' });
    const out = await r.json().catch(() => ({})) as { results?: { ok: boolean; hash?: string; error?: string }[]; error?: string };
    if (!r.ok) return postMessage({ n: j.n, error: out.error || 'HTTP ' + r.status });
    postMessage({ n: j.n, result: out.results?.[0] || { ok: false, error: 'no result' }, hash: p.hash });
  } catch (err) { postMessage({ n: j.n, error: err instanceof Error ? err.message : String(err) }); }
};
