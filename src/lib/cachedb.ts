// 다시 만들 수 있는 것만 두는 브라우저 저장소 ('dreamland-lite'). 앱의 자료(dreamland)와 따로라서 자료 폴더 · 백업에 실리지 않고, 지워져도 다시 만들어진다.
//  · chars: 초상을 뺀 캐릭터 사본 (src/lib/avatars.ts)
//  · desk: 책상 위젯이 방마다 세어 둔 것 (src/desk/data.ts)
const STORES = ['chars', 'desk'];
let dbp: Promise<IDBDatabase | null> | null = null;
export const cacheDb = () => dbp ||= new Promise<IDBDatabase | null>(res => {
  try {
    const r = indexedDB.open('dreamland-lite', 1);
    r.onupgradeneeded = () => { for (const s of STORES) if (!r.result.objectStoreNames.contains(s)) r.result.createObjectStore(s, { keyPath: 'id' }); };
    r.onsuccess = () => res(STORES.every(s => r.result.objectStoreNames.contains(s)) ? r.result : null); r.onerror = () => res(null); r.onblocked = () => res(null);
  } catch { res(null); }
});
/** 한 트랜잭션. 저장소를 못 쓰거나 실패하면 undefined (캐시라서 실패해도 앱은 그대로 돈다) */
export async function cacheTx<T>(store: string, mode: IDBTransactionMode, fn: (o: IDBObjectStore) => IDBRequest | void): Promise<T | undefined> {
  const d = await cacheDb(); if (!d) return undefined;
  return new Promise<T | undefined>(res => { try { const t = d.transaction(store, mode), r = fn(t.objectStore(store)); t.oncomplete = () => res(r ? r.result as T : undefined); t.onerror = () => res(undefined); t.onabort = () => res(undefined); } catch { res(undefined); } });
}
