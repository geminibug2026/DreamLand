// 초상 일꾼(thumb.worker.ts)에 일을 맡기는 창구. 일꾼을 못 만들면 쓰는 쪽이 예전 방식으로 돈다
import type { LiteRow } from './avkey';

export interface AvReply { n: number; ok?: boolean; blob?: Blob; orig?: boolean; skip?: boolean; gone?: boolean; error?: string; rows?: LiteRow[]; fps?: [string, string][]; done?: boolean }
let worker: Worker | null | undefined, wn = 0, crashes = 0;
const waits = new Map<number, (r: AvReply) => void>();
function get(): Worker | null {
  if (worker !== undefined) return worker;
  try {
    if (typeof Worker === 'undefined') return (worker = null);
    worker = new Worker(new URL('./thumb.worker.ts', import.meta.url), { type: 'module' });
    worker.onmessage = (e: MessageEvent<AvReply>) => { const f = waits.get(e.data.n); if (f) f(e.data); };
    // 일꾼이 넘어지면 기다리던 일은 실패로 돌려주고, 두 번까지는 다음 일 때 새로 띄운다
    worker.onerror = () => { worker = ++crashes > 2 ? null : undefined; for (const f of [...waits.values()]) f({ n: 0, error: 'worker', done: true }); waits.clear(); };
  } catch { worker = null; }
  return worker;
}
/** 답이 한 번 오는 일 */
export function avJob(job: Record<string, unknown>): Promise<AvReply> {
  return new Promise(res => { const w = get(); if (!w) return res({ n: 0, error: 'worker' }); const n = ++wn; waits.set(n, r => { waits.delete(n); res(r); }); w.postMessage({ ...job, n }); });
}
/** 답이 여러 번 나눠 오는 일 (done 이 올 때까지 each 를 부른다). 끝까지 잘 왔으면 true */
export function avStream(job: Record<string, unknown>, each: (r: AvReply) => void): Promise<boolean> {
  return new Promise(res => { const w = get(); if (!w) return res(false); const n = ++wn; waits.set(n, r => { if (!r.error) each(r); if (r.done || r.error) { waits.delete(n); res(!r.error); } }); w.postMessage({ ...job, n }); });
}
let okP: Promise<boolean> | null = null;
const BAD = 'dl-avworker-bad';
/** 일꾼이 도는가 (켤 때 한 번 물어본다). 3초 안에 답이 없으면 못 쓰는 것으로 보고, 하루 동안은 다시 기다리지 않는다 (켤 때마다 3초씩 늦어지지 않게) */
export const avWorkerOk = (): Promise<boolean> => okP ||= (async () => {
  try { if (Date.now() - Number(localStorage.getItem(BAD) || 0) < 864e5) return false; } catch { /* 저장소를 못 쓰는 창 */ }
  const ok = await Promise.race([avJob({ ping: true }).then(r => !!r.ok), new Promise<boolean>(r => setTimeout(() => r(false), 3000))]);
  try { if (ok) localStorage.removeItem(BAD); else localStorage.setItem(BAD, String(Date.now())); } catch { /* 위와 같다 */ }
  return ok;
})();
