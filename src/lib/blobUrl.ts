// 긴 data: 그림(캐릭터 초상 등)을 화면에 걸 때는 짧은 blob: 주소로 바꿔 건다.
// 같은 그림을 수십 장 그리거나 다시 그릴 때마다 수 MB 글자를 스타일 · 속성에 다시 풀지 않게. 한 번 바꾼 것은 기억한다
const memo = new Map<string, string>();
const MIN = 4096;   // 짧은 것은 그대로

export function dataToBlob(d: string): Blob | null {
  if (!d.startsWith('data:')) return null;
  try {
    const at = d.indexOf(','), head = d.slice(5, at), b64 = /;base64$/i.test(head), body = d.slice(at + 1);
    const bin = b64 ? atob(body) : decodeURIComponent(body), u = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
    return new Blob([u], { type: head.split(';')[0] || 'image/png' });
  } catch { return null; }
}
/** 화면에 걸 주소 */
export function shownUrl(src?: string | null): string {
  if (!src || src.length < MIN || !src.startsWith('data:')) return src || '';
  let u = memo.get(src); if (u) return u;
  const b = dataToBlob(src); u = b ? URL.createObjectURL(b) : src;
  memo.set(src, u);
  if (memo.size > 400) { const [k, v] = memo.entries().next().value as [string, string]; memo.delete(k); if (v.startsWith('blob:')) setTimeout(() => URL.revokeObjectURL(v), 60000); }
  return u;
}

// ── 목록용 작은 초상 ──
// 카드 목록 · 작은 동그라미처럼 작게 그리는 자리에 수 MB 원본을 걸면, 장마다 원본 크기로 풀고 줄이느라 화면이 멈춘다.
// 처음 한 번 일꾼이 작은 그림(가로 THUMB_PX)을 만들어 브라우저 저장소에 두고, 다음부터는 그것을 건다. 원본은 그대로 둔다
const THUMB_PX = 448, THUMB_MIN = 120_000;   // 이보다 짧은 그림은 원본 그대로
const thumbs = new Map<string, string>(), state = new Map<string, 'wait' | 'orig'>();
let ver = 0, notifyT = 0; const subs = new Set<() => void>();
export const thumbSub = (f: () => void) => { subs.add(f); return () => { subs.delete(f); }; };
export const thumbVer = () => ver;
const notify = () => { if (notifyT) return; notifyT = window.setTimeout(() => { notifyT = 0; ver++; for (const f of subs) f(); }, 60); };
/** 그림을 가리키는 짧은 열쇠: 길이 + 군데군데 뽑은 글자의 해시 (수 MB 를 통째로 해시하지 않는다) */
function keyOf(src: string): string {
  let h = 2166136261; const step = Math.max(1, Math.floor(src.length / 512));
  for (let i = 0; i < src.length; i += step) h = Math.imul(h ^ src.charCodeAt(i), 16777619);
  for (let i = 0; i < Math.min(src.length, 1024); i++) h = Math.imul(h ^ src.charCodeAt(i), 16777619);   // 머리(카드 PNG 는 앞쪽 글자 자료가 다르다)
  for (let i = Math.max(0, src.length - 64); i < src.length; i++) h = Math.imul(h ^ src.charCodeAt(i), 16777619);
  return `${src.length}:${(h >>> 0).toString(36)}@${THUMB_PX}`;
}
let tdb: Promise<IDBDatabase | null> | null = null;
const thumbDb = () => tdb ||= new Promise(res => { try { const r = indexedDB.open('dreamland-thumbs', 1); r.onupgradeneeded = () => r.result.createObjectStore('t'); r.onsuccess = () => res(r.result); r.onerror = () => res(null); } catch { res(null); } });
const tget = async (k: string) => { const d = await thumbDb(); if (!d) return undefined; return new Promise<Blob | undefined>(res => { try { const q = d.transaction('t').objectStore('t').get(k); q.onsuccess = () => res(q.result as Blob | undefined); q.onerror = () => res(undefined); } catch { res(undefined); } }); };
const tput = async (k: string, b: Blob) => { const d = await thumbDb(); if (!d) return; try { d.transaction('t', 'readwrite').objectStore('t').put(b, k); } catch { /* 저장 못 해도 이번엔 쓴다 */ } };
let worker: Worker | null | undefined; let wn = 0; const waits = new Map<number, (r: { blob?: Blob; skip?: boolean; error?: string }) => void>();
const thumbWorker = () => {
  if (worker !== undefined) return worker;
  try {
    if (typeof Worker === 'undefined' || typeof OffscreenCanvas === 'undefined' || typeof createImageBitmap === 'undefined') return (worker = null);
    worker = new Worker(new URL('./thumb.worker.ts', import.meta.url), { type: 'module' });
    worker.onmessage = (e: MessageEvent<{ n: number; blob?: Blob; skip?: boolean; error?: string }>) => { const f = waits.get(e.data.n); if (f) { waits.delete(e.data.n); f(e.data); } };
    worker.onerror = () => { worker = null; for (const f of waits.values()) f({ error: 'worker' }); waits.clear(); };
  } catch { worker = null; }
  return worker;
};
// 한 번에 하나씩 (일꾼 하나가 차례로 줄인다)
const queue: (() => Promise<void>)[] = []; let running = false;
const pump = async () => { if (running) return; running = true; try { while (queue.length) await queue.shift()!().catch(() => { }); } finally { running = false; } };
async function make(k: string, src: string) {
  const hit = await tget(k);
  if (hit) { thumbs.set(k, URL.createObjectURL(hit)); state.delete(k); return notify(); }
  const w = thumbWorker();
  if (!w) { state.set(k, 'orig'); return notify(); }
  const r = await new Promise<{ blob?: Blob; skip?: boolean; error?: string }>(res => { const n = ++wn; waits.set(n, res); w.postMessage({ n, src, px: THUMB_PX }); });
  if (r.blob) { thumbs.set(k, URL.createObjectURL(r.blob)); state.delete(k); void tput(k, r.blob); }
  else state.set(k, 'orig');   // 작거나 못 줄였다: 원본을 건다
  notify();
}
/**
 * 작게 그릴 자리의 초상 주소. 작은 그림이 준비되기 전에는 '' (잠깐 빈 칸) — 원본을 걸면 그 순간 원본을 풀어야 해서 오히려 느리다.
 * 준비되면 thumbSub 로 알린다 (useThumbs 를 쓰는 화면이 다시 그린다)
 */
export function thumbUrl(src?: string | null): string {
  if (!src || src.length < THUMB_MIN || !src.startsWith('data:')) return shownUrl(src);
  const k = keyOf(src), t = thumbs.get(k); if (t) return t;
  const s = state.get(k);
  if (s === 'orig') return shownUrl(src);
  if (!s) { state.set(k, 'wait'); queue.push(() => make(k, src)); void pump(); }
  return '';
}
