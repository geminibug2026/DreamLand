// 긴 data: 그림(캐릭터 초상 등)을 화면에 걸 때는 짧은 blob: 주소로 바꿔 건다.
// 같은 그림을 수십 장 그리거나 다시 그릴 때마다 수 MB 글자를 스타일 · 속성에 다시 풀지 않게. 한 번 바꾼 것은 기억한다
// 캐릭터 초상은 메모리에 꼬리표(avkey.ts)로만 있을 수 있다 — 그때는 일꾼이 저장소에서 읽어 Blob 으로 건네준다 (그림 글자가 화면 쪽 메모리에 올라오지 않는다)
import { avKey, isAvTok, tokParts } from './avkey';
import { avJob } from './avwork';

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

// ── 알림: 그림이 준비되면 화면이 다시 그린다 (useThumbs · useThumb) ──
let ver = 0, notifyT = 0; const subs = new Set<() => void>();
export const thumbSub = (f: () => void) => { subs.add(f); return () => { subs.delete(f); }; };
export const thumbVer = () => ver;
const notify = () => { if (notifyT) return; notifyT = window.setTimeout(() => { notifyT = 0; ver++; for (const f of [...subs]) f(); }, 60); };

// ── 꼬리표의 원본 그림 (크게 보는 자리: 프로필 · 대화 머리 · 편집기) ──
const fulls = new Map<string, string>(), fullWait = new Map<string, Promise<string>>(), fullGone = new Set<string>();   // fullGone: 꺼내지 못한 것 (그림이 없어졌다) — 화면이 그릴 때마다 다시 찾지 않게
const FULL_MAX = 24;
// 그림 열쇠(avKey)로 기억한다 — 꼬리표로 꺼낸 것을, 같은 그림을 글자로 들고 있는 곳(지금 대화의 캐릭터)도 그대로 쓴다 (그림 글자를 화면 쪽에서 다시 풀지 않는다)
function fullLoad(tok: string): Promise<string> {
  const part = tokParts(tok), key = part?.key || tok;
  let p = fullWait.get(key); if (p) return p;
  if (fullGone.has(key) || !part) return Promise.resolve('');
  p = avJob({ full: part.id }).then(r => {
    const u = r.blob ? URL.createObjectURL(r.blob) : '';
    if (!u) fullGone.add(key);
    if (u) { fulls.set(key, u); if (fulls.size > FULL_MAX) { const [k, v] = fulls.entries().next().value as [string, string]; fulls.delete(k); setTimeout(() => URL.revokeObjectURL(v), 60000); } }
    return u;
  }).finally(() => { fullWait.delete(key); notify(); });
  fullWait.set(key, p); return p;
}
const fullHit = (key: string) => { const u = fulls.get(key); if (u) { fulls.delete(key); fulls.set(key, u); } return u; };   // 방금 쓴 것은 뒤로 (오래 안 쓴 것부터 버린다)

/** 화면에 걸 주소. 꼬리표인데 아직 꺼내 오지 못했으면 작은 그림(있으면)이나 '' — 준비되면 thumbSub 로 알린다 */
export function shownUrl(src?: string | null): string {
  if (!src) return '';
  if (isAvTok(src)) {
    const p = tokParts(src); if (!p) return '';
    const u = fullHit(p.key); if (u) return u;
    if (!fullGone.has(p.key)) void fullLoad(src);
    return thumbs.get(p.key + '@' + THUMB_PX) || '';
  }
  if (src.length < MIN || !src.startsWith('data:')) return src;
  let u = memo.get(src); if (u) return u;
  if (fulls.size && (u = fullHit(avKey(src)))) return u;
  const b = dataToBlob(src); u = b ? URL.createObjectURL(b) : src;
  memo.set(src, u);
  if (memo.size > 160) { const [k, v] = memo.entries().next().value as [string, string]; memo.delete(k); if (v.startsWith('blob:')) setTimeout(() => URL.revokeObjectURL(v), 60000); }
  return u;
}
/** 그림 주소를 그대로 쓰는 곳용: 꼬리표가 아니면 그대로, 꼬리표면 지금 준비된 주소(없으면 '' — 꼬리표가 주소 자리에 들어가지 않게) */
export const plainUrl = (src?: string | null): string => !src ? '' : isAvTok(src) ? shownUrl(src) : src;
/** 화면에 걸 주소를 기다려 받는다 (React 밖의 코드용) */
export const shownUrlReady = (src?: string | null): Promise<string> => !src ? Promise.resolve('') : isAvTok(src) ? (fullHit(tokParts(src)?.key || '') ? Promise.resolve(fulls.get(tokParts(src)!.key)!) : fullLoad(src)) : Promise.resolve(shownUrl(src));

// ── 목록용 작은 초상 ──
// 카드 목록 · 작은 동그라미처럼 작게 그리는 자리에 수 MB 원본을 걸면, 장마다 원본 크기로 풀고 줄이느라 화면이 멈춘다.
// 처음 한 번 일꾼이 작은 그림(가로 THUMB_PX)을 만들어 브라우저 저장소에 두고, 다음부터는 그것을 건다. 원본은 그대로 둔다
const THUMB_PX = 448, THUMB_MIN = 120_000;   // 이보다 짧은 그림은 원본 그대로
const thumbs = new Map<string, string>(), state = new Map<string, 'wait' | 'orig' | 'gone'>();
const keyOf = (src: string) => avKey(src) + '@' + THUMB_PX;
let tdb: Promise<IDBDatabase | null> | null = null;
const thumbDb = () => tdb ||= new Promise(res => { try { const r = indexedDB.open('dreamland-thumbs', 1); r.onupgradeneeded = () => r.result.createObjectStore('t'); r.onsuccess = () => res(r.result); r.onerror = () => res(null); } catch { res(null); } });
// 만들어 둔 작은 그림 찾기: 한 화면이 한꺼번에 찾는 수십 장을 트랜잭션 하나로 읽는다 (장마다 따로 열면 그만큼 늦게 뜬다)
let tq: [string, (b: Blob | undefined) => void][] = [], tqOn = false;
const tget = (k: string) => new Promise<Blob | undefined>(res => { tq.push([k, res]); if (!tqOn) { tqOn = true; void tflush(); } });
async function tflush() {
  const d = await thumbDb(), batch = tq; tq = []; tqOn = false;
  const none = () => { for (const [, r] of batch) r(undefined); };
  if (!d) return none();
  try { const o = d.transaction('t').objectStore('t'); for (const [k, r] of batch) { const q = o.get(k); q.onsuccess = () => r(q.result as Blob | undefined); q.onerror = () => r(undefined); } } catch { none(); }
}
const tput = async (k: string, b: Blob) => { const d = await thumbDb(); if (!d) return; try { d.transaction('t', 'readwrite').objectStore('t').put(b, k); } catch { /* 저장 못 해도 이번엔 쓴다 */ } };
// 줄 세우기: 가장 최근에 화면이 찾은 묶음부터 (쪽을 넘기거나 검색을 바꾸면, 지나간 쪽의 그림보다 지금 보이는 것을 먼저), 묶음 안에서는 찾은 차례대로. 둘씩 나란히
interface Task { k: string; run: () => Promise<void>; at: number; seq: number; tok: boolean }
const tasks = new Map<string, Task>(), done = new Map<string, Promise<void>>(); let running = 0, seq = 0;
const batchNow = () => Math.floor(performance.now() / 120);
function pump() {
  while (running < 2 && tasks.size) {
    let best: Task | null = null; for (const t of tasks.values()) if (!best || t.at > best.at || (t.at === best.at && t.seq < best.seq)) best = t;
    const t = best as Task; tasks.delete(t.k); running++;
    void t.run().catch(() => { state.set(t.k, t.tok ? 'gone' : 'orig'); }).finally(() => { running--; notify(); pump(); });
  }
}
// 먼저 만들어 둔 것을 찾고(바로 · 한꺼번에), 없으면 만드는 줄에 세운다
const ask = (k: string, tok: boolean, run: () => Promise<void>) => {
  state.set(k, 'wait'); let fin!: () => void; done.set(k, new Promise<void>(r => { fin = r; }));
  const end = () => { done.delete(k); fin(); }, at = batchNow(), n = seq++;
  void tget(k).then(hit => {
    if (hit) { keep(k, hit); end(); notify(); return; }
    tasks.set(k, { k, tok, at, seq: n, run: () => run().finally(end) }); pump();
  });
};
const keep = (k: string, b: Blob) => { thumbs.set(k, URL.createObjectURL(b)); state.delete(k); };
async function make(k: string, src: string) {
  const r = await avJob({ src, px: THUMB_PX });
  if (r.blob) { keep(k, r.blob); if (!r.orig) void tput(k, r.blob); }   // 줄이지 못한 것(원본 그대로)은 이번에만 쓴다
  else state.set(k, 'orig');   // 일꾼을 못 쓰거나 그림을 풀지 못했다: 원본을 건다
}
async function makeTok(k: string, id: string) {
  const r = await avJob({ id, px: THUMB_PX });
  if (!r.blob) { state.set(k, 'gone'); return; }   // 그림이 없어졌거나 일꾼을 못 쓴다
  keep(k, r.blob); if (!r.orig || r.blob.size < 400_000) void tput(k, r.blob);   // 줄이지 못한 큰 원본은 이번에만 쓴다
}
/**
 * 작게 그릴 자리의 초상 주소. 작은 그림이 준비되기 전에는 '' (잠깐 빈 칸) — 원본을 걸면 그 순간 원본을 풀어야 해서 오히려 느리다.
 * 준비되면 thumbSub 로 알린다 (useThumbs · useThumb 를 쓰는 화면이 다시 그린다)
 */
export function thumbUrl(src?: string | null): string {
  if (!src) return '';
  const p = isAvTok(src) ? tokParts(src) : null;
  if (!p && (src.length < THUMB_MIN || !src.startsWith('data:'))) return isAvTok(src) ? '' : shownUrl(src);
  const k = p ? p.key + '@' + THUMB_PX : keyOf(src), t = thumbs.get(k); if (t) return t;
  const s = state.get(k);
  if (s === 'orig') return shownUrl(src);
  if (s === 'gone') return p ? fulls.get(p.key) || '' : '';
  if (!s) ask(k, !!p, p ? () => makeTok(k, p.id) : () => make(k, src));
  else { const w = tasks.get(k); if (w) w.at = batchNow(); }   // 아직 줄에 있다: 지금 화면이 찾으니 앞으로
  return '';
}
/** 작은 그림 주소를 기다려 받는다 (React 밖의 코드용: 색 뽑기 등) */
export async function thumbUrlReady(src?: string | null): Promise<string> {
  for (let i = 0; i < 3; i++) {
    const u = thumbUrl(src); if (u || !src) return u;
    const p = isAvTok(src) ? tokParts(src) : null, k = p ? p.key + '@' + THUMB_PX : keyOf(src), w = done.get(k);
    if (!w) break; await w;
  }
  return thumbUrl(src) || (isAvTok(src) ? shownUrlReady(src) : '');
}
