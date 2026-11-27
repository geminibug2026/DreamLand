// ── 목소리 보관: 만든 소리 파일을 기억해 두었다 같은 글 · 같은 목소리면 다시 쓴다 (다시 듣기 · 앞 문장 · 파일로 저장할 때 비용이 들지 않게) ──
// 이 세션 동안은 메모리에, 설정을 켜 두면 이 브라우저의 캐시 저장소(dreamland-lite › voice)에도. 자료 폴더 · 백업에는 실리지 않는다.
import { cacheTx } from '../lib/cachedb';
import type { Clip } from './providers';

const MEM_MAX = 80, DISK_MAX = 600;
const mem = new Map<string, Promise<Clip | null>>();
interface Row { id: string; blob: Blob; marks?: Clip['marks']; at: number }

/** 보관 열쇠: 공급자 · 연결 · 목소리 · 모델 · 빠르기 · 말투 설정 · 보낸 글 */
export function clipKey(parts: unknown[]): string {
  const s = JSON.stringify(parts); let h1 = 0x811c9dc5, h2 = 5381;
  for (let i = 0; i < s.length; i++) { const c = s.charCodeAt(i); h1 = Math.imul(h1 ^ c, 16777619) >>> 0; h2 = ((h2 * 33) ^ c) >>> 0; }
  return `v1:${h1.toString(36)}${h2.toString(36)}:${s.length.toString(36)}`;
}

let puts = 0;
/** key 의 소리를 돌려준다. 없으면 make() 로 만들고 기억해 둔다 (disk: 브라우저에도 남긴다) */
export function cachedClip(key: string, make: () => Promise<Clip>, disk: boolean): Promise<Clip> {
  const hit = mem.get(key);
  if (hit) { mem.delete(key); mem.set(key, hit); return hit.then(c => c || make()); }
  const p = (async (): Promise<Clip | null> => {
    if (disk) { const row = await cacheTx<Row>('voice', 'readonly', o => o.get(key)); if (row?.blob) { void cacheTx('voice', 'readwrite', o => o.put({ ...row, at: Date.now() })); return { blob: row.blob, marks: row.marks || null }; } }
    return null;
  })().then(async got => {
    if (got) return got;
    const clip = await make();
    if (disk) { void cacheTx('voice', 'readwrite', o => o.put({ id: key, blob: clip.blob, marks: clip.marks || null, at: Date.now() } as Row)); if (++puts % 25 === 0) void prune(); }
    return clip;
  });
  mem.set(key, p.catch(() => null));
  p.catch(() => mem.delete(key));
  while (mem.size > MEM_MAX) mem.delete(mem.keys().next().value!);
  return p as Promise<Clip>;
}

/** 오래 안 쓴 것부터 지워 개수를 맞춘다 */
async function prune() {
  const rows = await cacheTx<{ id: string; at: number }[]>('voice', 'readonly', o => o.getAll());
  if (!rows || rows.length <= DISK_MAX) return;
  const old = rows.sort((a, b) => a.at - b.at).slice(0, rows.length - DISK_MAX);
  await cacheTx('voice', 'readwrite', o => { for (const r of old) o.delete(r.id); });
}
/** 보관한 목소리 수 · 크기 (설정 화면) */
export async function cacheInfo(): Promise<{ count: number; bytes: number }> {
  const rows = await cacheTx<Row[]>('voice', 'readonly', o => o.getAll());
  return { count: rows?.length || 0, bytes: (rows || []).reduce((n, r) => n + (r.blob?.size || 0), 0) };
}
/** 보관한 목소리를 모두 지운다 */
export async function clearCache() { mem.clear(); await cacheTx('voice', 'readwrite', o => o.clear()); }
