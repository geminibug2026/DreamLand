// 초상 일꾼. 화면(메인 스레드) 밖에서:
//  · 큰 초상(카드 PNG 통째인 경우가 많다)을 목록용 작은 그림으로 줄인다 — 그림 글자를 받거나(src), 캐릭터 id 를 받아 저장소에서 직접 읽는다(id)
//  · 캐릭터의 원본 그림을 Blob 으로 꺼낸다 (full)
//  · 캐릭터 줄에서 그림만 뺀 사본을 만든다 (strip) · 저장된 줄의 지문을 낸다 (verify) — 앱이 켜질 때 그림까지 통째로 읽지 않게
import { avHeavy, avKey, liteOf, type LiteRow } from './avkey';

interface Job { n: number; src?: string; id?: string; px?: number; full?: string; strip?: string[]; verify?: boolean; warm?: boolean; ping?: boolean }
const THUMB_MIN = 120_000;   // 이보다 짧은 그림은 줄이지 않는다 (원본 그대로)

let dbp: Promise<IDBDatabase> | null = null;
// 이름만으로 연다 (판을 올리지 않는다). 화면 쪽이 먼저 저장소를 만들어 둔 뒤에만 불린다
const db = () => dbp ||= new Promise<IDBDatabase>((res, rej) => { const r = indexedDB.open('dreamland'); r.onsuccess = () => { r.result.onversionchange = () => { r.result.close(); dbp = null; }; res(r.result); }; r.onerror = () => { dbp = null; rej(r.error); }; });
type Row = Record<string, unknown>;
// 작은 그림 저장소 (blobUrl.ts 와 같은 곳 · 같은 열쇠)
let tdbp: Promise<IDBDatabase | null> | null = null;
const tdb = () => tdbp ||= new Promise<IDBDatabase | null>(res => { try { const r = indexedDB.open('dreamland-thumbs', 1); r.onupgradeneeded = () => { if (!r.result.objectStoreNames.contains('t')) r.result.createObjectStore('t'); }; r.onsuccess = () => res(r.result); r.onerror = () => res(null); } catch { res(null); } });
const thumbHas = async (k: string) => { const d = await tdb(); if (!d) return true; return new Promise<boolean>(res => { try { const q = d.transaction('t').objectStore('t').getKey(k); q.onsuccess = () => res(q.result !== undefined); q.onerror = () => res(true); } catch { res(true); } }); };
const thumbPut = async (k: string, b: Blob) => { const d = await tdb(); if (!d) return; try { d.transaction('t', 'readwrite').objectStore('t').put(b, k); } catch { /* 캐시라 못 써도 된다 */ } };
/** 이 줄의 작은 그림이 아직 없으면 만들어 둔다 (목록의 다른 쪽 · 정렬 · 검색으로 처음 보이는 칸도 바로 뜨게) */
async function warm(row: Row, px: number) {
  const a = row.avatar; if (!avHeavy(a)) return;
  const k = avKey(a) + '@' + px; if (await thumbHas(k)) return;
  const orig = toBlob(a); if (!orig) return;
  let out: Blob | null = null; if (a.length >= THUMB_MIN) { try { out = await shrink(orig, px); } catch { out = null; } }
  if (out || orig.size < 400_000) await thumbPut(k, out || orig);
}
const getRow = async (id: string) => { const d = await db(); return new Promise<Row | undefined>((res, rej) => { const q = d.transaction('chars', 'readonly').objectStore('chars').get(id); q.onsuccess = () => res(q.result as Row | undefined); q.onerror = () => rej(q.error); }); };

function toBlob(src: string): Blob | null {
  const at = src.indexOf(','), head = src.slice(5, at);
  if (!src.startsWith('data:') || at < 0) return null;
  const b64 = /;base64$/i.test(head), body = src.slice(at + 1), bin = b64 ? atob(body) : decodeURIComponent(body), u = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
  return new Blob([u], { type: head.split(';')[0] || 'image/png' });
}
/** 작은 그림. null = 줄일 것이 없다 (원본을 쓴다) */
/** 움직이는 그림인가 (GIF · 움직이는 WebP · APNG) — 줄이면 멈춘 그림이 된다 */
async function animated(orig: Blob): Promise<boolean> {
  if (orig.type === 'image/gif') return true;
  if (orig.type !== 'image/webp' && orig.type !== 'image/png') return false;
  const u = new Uint8Array(await orig.slice(0, 65536).arrayBuffer()), tag = orig.type === 'image/webp' ? [65, 78, 73, 77] : [97, 99, 84, 76];   // 'ANIM' · 'acTL'
  for (let i = 8; i + 3 < u.length; i++) if (u[i] === tag[0] && u[i + 1] === tag[1] && u[i + 2] === tag[2] && u[i + 3] === tag[3]) return true;
  return false;
}
async function shrink(orig: Blob, px: number): Promise<Blob | null> {
  const bmp = await createImageBitmap(orig);
  const { width: w, height: h } = bmp;
  // 움직이는 그림은 예전 그대로: 가로가 이미 작으면 원본을 건다 (목록에서도 움직이게)
  if (w <= px * 1.25 && await animated(orig)) { bmp.close(); return null; }
  // 가로가 이미 작아도, 무거운 그림(무손실 PNG 카드 등)은 같은 크기로 다시 묶는다 — 목록에 수십 장을 원본으로 걸면 풀고 그리느라 화면이 멈춘다
  const k = Math.min(1, px / w), tw = Math.max(1, Math.round(w * k)), th = Math.max(1, Math.round(h * k)), c = new OffscreenCanvas(tw, th), g = c.getContext('2d');
  if (!g) { bmp.close(); return null; }
  g.imageSmoothingQuality = 'high'; g.drawImage(bmp, 0, 0, tw, th); bmp.close();
  let out = await c.convertToBlob({ type: 'image/webp', quality: 0.86 });
  if (out.type !== 'image/webp') out = await c.convertToBlob({ type: 'image/jpeg', quality: 0.88 });   // webp 를 못 만드는 브라우저
  return k === 1 && out.size > orig.size * 0.7 ? null : out;   // 줄지 않으면 원본 그대로
}

// 화면이 지금 기다리는 일(그림 꺼내기)의 수 — 뒤에서 도는 살피기 · 미리 만들기는 그동안 쉰다
let fg = 0;
self.onmessage = async (e: MessageEvent<Job>) => {
  const j = e.data, n = j.n, front = j.src != null || j.id != null || j.full != null;
  if (front) fg++;
  try {
    if (j.ping) return postMessage({ n, ok: typeof indexedDB !== 'undefined' });   // 그림을 줄이지 못하는 브라우저(OffscreenCanvas 없음)여도 저장소만 읽을 수 있으면 된다 — 그때는 원본을 Blob 으로 건넨다
    if (j.src != null) {   // 그림 글자를 받아 줄인다 (페르소나 · 방금 고른 그림)
      if (!/^data:[^,]*;base64,/i.test(j.src)) return postMessage({ n, skip: true });
      const orig = toBlob(j.src); if (!orig) return postMessage({ n, skip: true });
      const out = await shrink(orig, j.px || 448);
      return postMessage(out ? { n, blob: out } : { n, blob: orig, orig: true });   // 줄일 것이 없어도 Blob 으로 돌려준다 (화면 쪽에서 그림 글자를 다시 풀지 않게)
    }
    if (j.id != null || j.full != null) {   // 저장소에서 읽는다: 줄인 그림(id) 또는 원본(full). 언제나 Blob 을 돌려준다 (화면은 그림 글자를 들고 있지 않다)
      const row = await getRow((j.id ?? j.full) as string), a = row?.avatar;
      if (typeof a !== 'string' || !a.startsWith('data:')) return postMessage({ n, gone: true });
      const orig = toBlob(a); if (!orig) return postMessage({ n, gone: true });
      if (j.full != null || a.length < THUMB_MIN) return postMessage({ n, blob: orig, orig: true });
      let out: Blob | null = null; try { out = await shrink(orig, j.px || 448); } catch { out = null; }
      return postMessage(out ? { n, blob: out } : { n, blob: orig, orig: true });
    }
    if (j.strip) {   // 그림을 뺀 사본: 몇 줄씩 묶어 보낸다
      let rows: LiteRow[] = [], size = 0;
      const flush = (done = false) => { postMessage({ n, rows, done }); rows = []; size = 0; };
      for (const id of j.strip) { const row = await getRow(id); if (row) { const l = liteOf(row); rows.push(l); size += l.fp.length + 2000; if (rows.length >= 40 || size > 4e6) flush(); } }
      return flush(true);
    }
    if (j.verify) {   // 저장된 모든 줄의 지문 — 하나씩 읽어 메모리에 쌓이지 않게
      const d = await db(), keys = await new Promise<IDBValidKey[]>((res, rej) => { const q = d.transaction('chars', 'readonly').objectStore('chars').getAllKeys(); q.onsuccess = () => res(q.result); q.onerror = () => rej(q.error); });
      let fps: [string, string][] = [];
      for (const k of keys) {
        while (fg) await new Promise(r => setTimeout(r, 25));
        const row = await getRow(k as string); if (!row) continue;
        fps.push([String(row.id), liteOf(row).fp]);
        if (j.warm) await warm(row, j.px || 448).catch(() => { });
        if (fps.length >= 12) { postMessage({ n, fps, done: false }); fps = []; await new Promise(r => setTimeout(r, 70)); }   // 쉬엄쉬엄: 화면 쪽의 읽기(대화방 열기 등)가 밀리지 않게
      }
      return postMessage({ n, fps, done: true });
    }
    postMessage({ n, error: 'unknown job' });
  } catch (err) { postMessage({ n, error: String(err), done: true }); }
  finally { if (front) fg--; }
};
