// 분당 요청 수 제한: 연결마다 지난 60초 동안 보낸 횟수를 세고, 넘치면 자리가 날 때까지 기다린다
// 아무것도 import 하지 않는다 (engine.ts 가 부르고, node 로 따로 돌려 볼 수 있게).

export interface Limiter {
  /** rpm 이 0 이면 바로 지나간다. 기다리는 동안 signal 이 끊기면 AbortError */
  gate(key: string, rpm: number, signal?: AbortSignal | null): Promise<number>;
  /** 지금 보내면 몇 ms 기다리게 되는지 (화면 표시용) */
  due(key: string, rpm: number): number;
}
const WINDOW = 60000;
const aborted = () => { const e = new Error('Aborted'); e.name = 'AbortError'; return e; };

/** now · sleep 을 바꿔 끼울 수 있다 (시험할 때 가짜 시계를 쓴다) */
export function makeLimiter(now: () => number = Date.now, sleep: (ms: number, signal?: AbortSignal | null) => Promise<void> = realSleep, onWait: (key: string, ms: number) => void = () => { }): Limiter {
  const sent = new Map<string, number[]>(), line = new Map<string, Promise<unknown>>();
  const fresh = (key: string) => { const t = now(), list = (sent.get(key) || []).filter(x => t - x < WINDOW); sent.set(key, list); return list; };
  const waitOf = (key: string, rpm: number) => { const list = fresh(key); return list.length < rpm ? 0 : Math.max(0, list[list.length - rpm] + WINDOW - now()); };
  return {
    due: (key, rpm) => rpm > 0 ? waitOf(key, Math.floor(rpm)) : 0,
    gate(key, rpmIn, signal) {
      const rpm = Math.floor(+rpmIn || 0); if (!(rpm > 0) || !key) return Promise.resolve(0);
      // 같은 연결의 요청은 한 줄로 선다 (동시에 여럿이 "자리 있음"으로 보고 함께 나가지 않게)
      const turn = (line.get(key) || Promise.resolve()).catch(() => { }).then(async () => {
        let waited = 0;
        for (let i = 0; i < 4; i++) {   // 깨어난 뒤 한 번 더 본다 (시계가 어긋났을 때)
          if (signal?.aborted) throw aborted();
          const ms = waitOf(key, rpm); if (!ms) break;
          onWait(key, ms); waited += ms; await sleep(ms + 5, signal);
        }
        if (signal?.aborted) throw aborted();
        fresh(key).push(now()); return waited;
      });
      line.set(key, turn); return turn;
    },
  };
}
function realSleep(ms: number, signal?: AbortSignal | null) {
  return new Promise<void>((ok, no) => {
    const t = setTimeout(() => { signal?.removeEventListener('abort', stop); ok(); }, ms), stop = () => { clearTimeout(t); no(aborted()); };
    signal?.addEventListener('abort', stop, { once: true });
  });
}

/** 앱이 쓰는 하나뿐인 제한기. 기다리게 되면 waitHook 으로 알린다 (reach 기능이 상태 줄에 적는다) */
export const rpmHook = { wait: (_key: string, _ms: number) => { } };
export const Rpm = makeLimiter(Date.now, realSleep, (k, ms) => rpmHook.wait(k, ms));
