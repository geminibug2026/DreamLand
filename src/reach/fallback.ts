// 실패하면 넘기기: 글자가 한 자도 나오기 전에 연결이 실패하면(끊김 · 429 · 5xx) 대체 연결로 한 번만 다시 보낸다
// 판단과 순서만 담는다. 실제 호출(run)은 밖에서 넣어 준다 — node 로 따로 돌려 볼 수 있게 아무것도 import 하지 않는다.

/** engine.call 이 오류에 달아 주는 꼬리표: status(HTTP 상태) · net(연결 자체가 안 됨) */
export interface TaggedError { status?: number; net?: boolean; name?: string }
export const isAbortErr = (e: unknown) => !!e && typeof e === 'object' && (e as TaggedError).name === 'AbortError';
/** 다른 연결로 넘겨 볼 만한 실패인지. 키가 틀렸거나(401·403) 요청이 잘못된(400) 것은 넘겨도 소용없거나 숨기면 안 되니 그대로 알린다 */
export function shouldFallback(e: unknown): boolean {
  if (!e || typeof e !== 'object' || isAbortErr(e)) return false;
  const { status, net } = e as TaggedError;
  return !!net || status === 408 || status === 429 || (typeof status === 'number' && status >= 500 && status <= 599);
}

export interface Sink { onText?: (t: string) => void; onThink?: (t: string) => void; signal?: AbortSignal | null }
export interface FallbackResult<R, C> { res: R; via: C; fell: boolean; /** 주 연결이 왜 안 됐는지 */ why?: string }
/**
 * primary 로 보내고, 넘길 만한 실패이며 아직 아무 글자도 받지 못했을 때만 다음 연결로 넘긴다.
 * backups 는 하나 또는 차례대로 늘어선 여럿: A 가 안 되면 B, B 도 안 되면 C … (연결마다 정해 둔 '안 되면 이 연결로'를 이어 붙인 줄).
 * 글자(또는 생각)가 나온 뒤의 오류 · 사용자가 멈춘 것 · 넘겨 봐야 소용없는 오류(키 · 요청 잘못)는 넘기지 않는다. 마지막 연결도 실패하면 그 오류를 던진다.
 */
export async function runWithFallback<C, R>(primary: C, backups: C | C[] | null | undefined, sink: Sink, run: (conn: C, sink: Sink) => Promise<R>, onSwitch: (why: string, from: C, to: C) => void = () => { }): Promise<FallbackResult<R, C>> {
  let got = false;
  const watch: Sink = { signal: sink.signal, onText: d => { if (d) got = true; sink.onText?.(d); }, onThink: d => { if (d) got = true; sink.onThink?.(d); } };
  const line = [primary, ...(Array.isArray(backups) ? backups : backups ? [backups] : [])].filter((c, i, a) => c && a.indexOf(c) === i);
  let why: string | undefined;
  for (let i = 0; ; i++) {
    const conn = line[i];
    try { return { res: await run(conn, watch), via: conn, fell: i > 0, ...(why ? { why } : {}) }; }
    catch (e) {
      const next = line[i + 1];
      if (!next || got || sink.signal?.aborted || !shouldFallback(e)) throw e;
      const w = e instanceof Error ? e.message : String(e); why ??= w;
      onSwitch(w, conn, next);
    }
  }
}
