// 화면(iframe)들이 함께 쓰는 이벤트 길: 카드 스크립트 · 상태창이 eventOn 으로 듣는 이벤트를 앱이 부르고, 듣는 쪽이 고친 인자를 돌려받는다.
// 실리태번에서는 모든 스크립트가 한 이벤트 통로를 쓰므로, 여기서도 화면마다 차례로 불러 그 결과를 다음 화면에 넘긴다.
type Obj = Record<string, unknown>;
interface Reg { types: Map<string, number> }
const reg = new Map<HTMLIFrameElement, Reg>();
const waits = new Map<number, (d: Obj) => void>();
const ready = new Set<HTMLIFrameElement>();
const readyWait = new Map<HTMLIFrameElement, (() => void)[]>();
let seq = 0, inv = 0;

/** 앱 쪽에서 스크립트가 부를 수 있는 일 (이름 → 처리). 다른 곳에서 채운다 */
export const appCalls: Record<string, (f: HTMLIFrameElement, args: unknown[]) => unknown> = {};
/** 화면이 eventEmit 한 이벤트를 앱이 직접 받는 곳 (이름 → 처리, 인자를 그 자리에서 고친다) */
export const appEvents: Record<string, (args: unknown[]) => unknown> = {};

const alive = (f: HTMLIFrameElement) => f.isConnected && !!f.contentWindow;
/** format.ts 의 메시지 길이 넘겨준다: 화면이 듣기 시작/그만 · 부름 결과 · 준비됨 */
export function onFrameMessage(f: HTMLIFrameElement, d: Obj) {
  if (d.dlReset != null) { reg.delete(f); ready.delete(f); return; }
  if (d.dlListen != null) {
    const r = reg.get(f) || { types: new Map() }; reg.set(f, r);
    const ty = String(d.dlListen);
    if (d.on) { if (!r.types.has(ty)) r.types.set(ty, ++seq); } else r.types.delete(ty);
  } else if (d.dlInvoked != null) waits.get(Number(d.dlInvoked))?.(d);
  else if (d.dlReady != null) { ready.add(f); for (const fn of readyWait.get(f) || []) fn(); readyWait.delete(f); }
}
/** 이 이벤트를 듣는 화면들 (먼저 듣기 시작한 차례) */
export function listeners(type: string): HTMLIFrameElement[] {
  const out: [HTMLIFrameElement, number][] = [];
  for (const [f, r] of reg) { if (!alive(f)) { reg.delete(f); ready.delete(f); continue; } const n = r.types.get(type); if (n != null) out.push([f, n]); }
  return out.sort((a, b) => a[1] - b[1]).map(x => x[0]);
}
export const hasListeners = (type: string) => listeners(type).length > 0;
/** 화면의 스크립트가 다 실렸을 때 (늦으면 기다리지 않는다) */
export function frameReady(f: HTMLIFrameElement, ms = 8000): Promise<void> {
  if (ready.has(f) || !alive(f)) return Promise.resolve();
  return new Promise(res => { const t = setTimeout(res, ms); (readyWait.get(f) || readyWait.set(f, []).get(f)!).push(() => { clearTimeout(t); res(); }); });
}

const isPlain = (v: unknown): v is Obj => !!v && typeof v === 'object' && !Array.isArray(v);
const jsonSafe = (v: unknown) => { try { return v === undefined ? null : JSON.parse(JSON.stringify(v)); } catch { return null; } };
/** 받은 값을 원래 객체에 그 자리에서 덮어쓴다 (엔진이 그 객체를 계속 쥐고 있으므로) */
export function adopt(orig: unknown, next: unknown): unknown {
  if (typeof orig === 'function') return orig;
  if (Array.isArray(orig) && Array.isArray(next)) { orig.length = 0; orig.push(...next); return orig; }
  if (isPlain(orig) && isPlain(next)) { for (const k of Object.keys(orig)) if (!(k in next)) delete orig[k]; Object.assign(orig, next); return orig; }
  return next;
}
function one(f: HTMLIFrameElement, type: string, args: unknown[], timeout: number): Promise<unknown[] | null> {
  const w = f.contentWindow; if (!w) return Promise.resolve(null);
  const id = ++inv, fns: number[] = [];
  const wire = args.map((a, i) => { if (typeof a === 'function') { fns.push(i); return { __dlFn: i }; } return jsonSafe(a); });
  return new Promise(res => {
    const t = setTimeout(() => { waits.delete(id); console.warn('[화면 이벤트] 답이 없어 넘어감', type); res(null); }, timeout);
    waits.set(id, d => {
      clearTimeout(t); waits.delete(id);
      for (const [i, callArgs] of (Array.isArray(d.calls) ? d.calls : []) as [number, unknown[]][]) { const fn = args[i]; if (typeof fn === 'function') try { (fn as (...a: unknown[]) => unknown)(...(callArgs || [])); } catch (e) { console.warn(e); } }
      res(Array.isArray(d.args) ? (d.args as unknown[]) : null);
    });
    w.postMessage({ dlInvoke: id, type, args: wire, fns }, '*');
  });
}
/**
 * 이 이벤트를 듣는 화면마다 차례로 부르고, 화면이 고친 인자를 args 의 원래 객체에 덮어쓴다.
 * exclude: 부른 쪽 화면 (자기 처리는 이미 했다)
 */
export async function invokeFrames(type: string, args: unknown[], { exclude, timeout = 10000 }: { exclude?: HTMLIFrameElement | null; timeout?: number } = {}): Promise<void> {
  for (const f of listeners(type)) {
    if (f === exclude) continue;
    const got = await one(f, type, args, timeout);
    if (got) for (let i = 0; i < args.length; i++) if (i < got.length && typeof args[i] !== 'function') args[i] = adopt(args[i], got[i]);
  }
}
/** 화면이 eventEmit 한 것: 앱이 받는 이벤트면 처리하고, 다른 화면들에도 알린 뒤 고쳐진 인자를 돌려준다 */
export async function relayEmit(from: HTMLIFrameElement, type: string, args: unknown[]): Promise<unknown[]> {
  const fn = appEvents[type]; if (fn) { try { await fn(args); } catch (e) { console.warn('[화면 이벤트]', type, e); } }
  await invokeFrames(type, args, { exclude: from });
  return args;
}
