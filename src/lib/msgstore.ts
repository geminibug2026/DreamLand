// 메시지 저장소 (msgs): 긴 대화를 조각으로 나눠 둔다 — 저장할 때마다 메시지 목록 전체를 통째로 다시 쓰지 않게.
//
// 꼴 (모두 같은 'msgs' 저장소 안):
//   · 짧은 대화 (HEAD_MAX 개 미만)       { id: 방, list: [...] }                    — 예전과 똑같은 꼴
//   · 긴 대화의 머리                     { id: 방, v: 2, list: [최근 메시지], parts: [{ id, n, a, z, h }], total }
//   · 긴 대화의 오래된 조각 (봉인)       { id: 방 + '!' + 고유값, chat: 방, part: 1, at, h, list: [...] }
// 머리의 list 에는 늘 최근 메시지가 들어 있으므로, 조각을 모르는 예전 판도 이 방을 (최근 부분만) 읽고 쓸 수 있다.
// 예전 판이 머리를 예전 꼴로 덮어쓰면 조각은 그대로 남고, 다시 이 판으로 열 때 이어 붙인다 (지우지 않는다).
//
// 저장: 메시지 객체가 그대로(같은 객체 · 같은 차례)인 조각은 다시 쓰지 않는다. 바뀐 메시지를 알려 주면(touch) 그 조각만 다시 쓴다.
// 알리지 않고 오래된 메시지 속을 고친 것은, 저장한 뒤 한가할 때 조각마다 내용을 견주어(sweep) 다시 쓴다.
// 조각은 한 번 쓰면 바꾸지 않는다: 바뀌면 새 id 로 쓰고 머리를 고친 뒤, 같은 묶음(트랜잭션) 안에서 옛 조각을 지운다.
import type { Msg } from './types';

/** 봉인 조각 하나의 메시지 수 · 머리에 늘 남기는 최근 메시지 수 (머리는 KEEP ~ KEEP + PART - 1 개) */
export const PART = 100, KEEP = 100, HEAD_MAX = KEEP + PART;
const SEP = '!';
export interface PartMeta { id: string; n: number; a: string; z: string; h: string }
export interface HeadRow { id: string; list: Msg[]; v?: number; parts?: PartMeta[]; total?: number; [k: string]: unknown }
export interface PartRow { id: string; chat: string; part: 1; at: number; h: string; list: Msg[] }
type Row = HeadRow | PartRow;
export const isPart = (r: unknown): r is PartRow => !!r && typeof r === 'object' && (r as PartRow).part === 1 && typeof (r as PartRow).chat === 'string' && Array.isArray((r as PartRow).list);
const isV2 = (r: unknown): r is HeadRow & { parts: PartMeta[] } => !!r && typeof r === 'object' && (r as HeadRow).v === 2 && Array.isArray((r as HeadRow).parts);
/** 이 레코드 id 가 어느 방의 것인지 (조각이면 앞부분) */
export const chatOfId = (id: unknown) => { const s = String(id ?? ''); const i = s.indexOf(SEP); return i > 0 ? s.slice(0, i) : s; };
const range = (chatId: string) => IDBKeyRange.bound(chatId + SEP, chatId + SEP + '￿');
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 9);

/** 빠른 해시 (내용이 같은지 견주는 데만 쓴다) */
export function hashStr(s: string): string {
  let h1 = 0xdeadbeef, h2 = 0x41c6ce57;
  for (let i = 0; i < s.length; i++) { const c = s.charCodeAt(i); h1 = Math.imul(h1 ^ c, 2654435761); h2 = Math.imul(h2 ^ c, 1597334677); }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (h2 >>> 0).toString(36) + (h1 >>> 0).toString(36) + s.length.toString(36);
}
const hashOf = (list: Msg[]) => { try { return hashStr(JSON.stringify(list)); } catch { return 'x' + uid(); } };

// ── 메모리에 들고 있는 조각 배치 (방마다) ──
interface LPart extends PartMeta { refs: Msg[] | null; at?: number }   // refs: 그 조각에 든 메시지 객체 (null = 저장소에서 찾지 못한 조각: 그대로 둔다)
interface Layout { parts: LPart[]; checked: boolean }
const layouts = new Map<string, Layout>();
const keep = (id: string, L: Layout) => { layouts.delete(id); layouts.set(id, L); while (layouts.size > 8) layouts.delete(layouts.keys().next().value as string); };
/** 다른 곳(다른 탭 · 가져오기 · 자료 폴더)에서 이 방을 썼다: 배치를 잊는다 (다음 저장 때 저장소에서 다시 확인한다) */
export function forget(chatId?: string | null) { if (chatId == null) layouts.clear(); else layouts.delete(chatId); }
const dirty = new WeakSet<Msg>();
/** 이 메시지를 고쳤다고 알린다 — 오래된 조각에 든 메시지라도 다음 저장 때 바로 다시 쓴다 */
export function touch(...ms: (Msg | null | undefined)[]) { for (const m of ms) if (m && typeof m === 'object') dirty.add(m); }

// ── 저장소와의 길 (core.ts 가 넘겨준다) ──
export interface Io {
  /** 한 트랜잭션 안에서 fn 을 돌린다 (끝나면 풀린다) */
  tx(mode: IDBTransactionMode, fn: (o: IDBObjectStore) => void): Promise<unknown>;
  /** 쓰는 트랜잭션: put · del 을 적어 두고(거울이 따라 보낸다) 끝나면 풀린다 */
  batch(fn: (o: IDBObjectStore, log: { put(v: Row): void; del(id: string): void }) => void): Promise<unknown>;
}

// ── 읽기 ──
/** 머리와 그 방의 조각들로 메시지 목록을 짠다 (저장소를 건드리지 않는 순수 계산 — 내보내기도 쓴다) */
export function assemble(head: Row | undefined, parts: Map<string, PartRow> | ((id: string) => PartRow | undefined), orphans: PartRow[] = []): { list: Msg[]; layout: Layout | null; missing: number } {
  if (!head || isPart(head)) return { list: [], layout: null, missing: 0 };
  const own = Array.isArray(head.list) ? head.list : [];
  const get = typeof parts === 'function' ? parts : (id: string) => parts.get(id);
  if (isV2(head)) {
    const list: Msg[] = [], lp: LPart[] = []; let missing = 0;
    for (const p of head.parts) {
      const r = get(p.id);
      const ok = !!r && isPart(r) && r.list.length === p.n && r.list[0]?.id === p.a && r.list[r.list.length - 1]?.id === p.z;
      if (ok) { for (const m of r!.list) list.push(m); lp.push({ ...p, refs: r!.list }); } else { missing += p.n; lp.push({ ...p, refs: null }); }
    }
    for (const m of own) list.push(m);
    return { list, layout: { parts: lp, checked: !missing }, missing };
  }
  // 예전 꼴의 머리. 조각이 남아 있고 머리가 그 조각의 메시지를 갖고 있지 않으면 (예전 판이 최근 부분만 읽고 덮어썼다) 앞에 이어 붙인다
  const ps = orphans.filter(isPart).sort((a, b) => (a.at - b.at) || ((a.list[0]?.ts || 0) - (b.list[0]?.ts || 0)));
  if (ps.length && ps[0].list.length) {
    const first = ps[0].list[0]?.id, inHead = new Set(own.map(m => m?.id));
    if (!inHead.has(first)) {
      const seen = new Set<unknown>(), list: Msg[] = [], lp: LPart[] = [];
      for (const r of ps) { const fresh = r.list.filter(m => !seen.has(m?.id) && !inHead.has(m?.id)); fresh.forEach(m => seen.add(m?.id)); if (!fresh.length) continue; for (const m of fresh) list.push(m); if (fresh.length === r.list.length && r.h) lp.push({ id: r.id, n: r.list.length, a: r.list[0]?.id, z: r.list[r.list.length - 1]?.id, h: r.h, refs: r.list }); }
      for (const m of own) list.push(m);
      return { list, layout: { parts: lp, checked: false }, missing: 0 };
    }
  }
  return { list: own, layout: null, missing: 0 };
}

const legacyBig = new Set<string>();
/** 마지막으로 읽었을 때 예전 꼴(한 줄)의 긴 방이었나 — 한가할 때 미리 조각으로 옮겨 두면 첫 저장이 가볍다 */
export const splitDue = (chatId: string) => legacyBig.has(chatId);
/** 한 방의 메시지 목록 (한 트랜잭션으로 머리와 조각을 함께 읽는다) */
export async function read(io: Io, chatId: string, adopt = true): Promise<{ list: Msg[]; missing: number }> {
  let head: Row | undefined; const parts = new Map<string, PartRow>(); let orphans: PartRow[] = [];
  await io.tx('readonly', o => {
    const g = o.get(chatId);
    g.onsuccess = () => {
      head = g.result as Row | undefined;
      if (isV2(head)) { for (const p of head.parts) { const q = o.get(p.id); q.onsuccess = () => { if (q.result) parts.set(p.id, q.result as PartRow); }; } }
      else if (head) { const q = o.getAll(range(chatId)); q.onsuccess = () => { orphans = (q.result as PartRow[]).filter(r => isPart(r) && r.chat === chatId); }; }
    };
  });
  const r = assemble(head, parts, orphans);
  if (head && !isPart(head) && !isV2(head) && !r.layout && r.list.length >= HEAD_MAX * 2) legacyBig.add(chatId); else legacyBig.delete(chatId);
  // 배치는 대화 화면이 쓰는 목록의 것을 들고 있는다. 다른 기능이 따로 읽은 사본(다른 객체)으로 바꾸면 화면이 저장할 때 조각을 모두 견주어야 한다
  // 예전 꼴(조각 없음) · 없는 방은 빈 배치로 적어 둔다 — 저장할 때 머리를 다시 읽어 보지 않게 (긴 예전 꼴 머리는 그것만으로 오래 걸린다)
  if (adopt || !layouts.has(chatId)) keep(chatId, r.layout || { parts: [], checked: true });
  return { list: r.list, missing: r.missing };
}

// ── 쓰기 ──
const slice = (list: Msg[], a: number, b: number) => list.slice(a, b);
const meta = (id: string, refs: Msg[], h: string, at: number): LPart => ({ id, n: refs.length, a: refs[0]?.id, z: refs[refs.length - 1]?.id, h, refs, at });
/** 지난 배치(prev)와 지금 목록으로 새 배치를 정한다. 다시 쓸 조각은 h 가 '' 이다 */
function plan(prev: LPart[], list: Msg[], exists: (id: string) => boolean) {
  const out: LPart[] = []; let cur = 0, ix: Map<unknown, number> | null = null;
  const idx = () => { if (!ix) { ix = new Map(); for (let i = list.length - 1; i >= 0; i--) ix.set(list[i]?.id, i); } return ix; };
  const gap = (a: number, b: number) => { for (let i = a; i < b; i += PART) out.push(meta('', slice(list, i, Math.min(b, i + PART)), '', i)); };
  for (const p of prev) {
    if (!p.refs) { out.push(p); continue; }                    // 찾지 못한 조각: 자리만 지킨다 (지우지 않는다)
    if (!exists(p.id)) continue;                               // 저장소에서 사라졌다 (다른 탭 · 가져오기): 그 메시지는 새 조각으로
    let i = list[cur] === p.refs[0] ? cur : (idx().get(p.a) ?? -1);
    if (i < cur || i + p.n > list.length) continue;
    let same = true, ids = true;
    for (let k = 0; k < p.n; k++) { const m = list[i + k]; if (m !== p.refs[k]) { same = false; if (m?.id !== p.refs[k]?.id) { ids = false; break; } } else if (dirty.has(m)) same = false; }
    if (!ids) continue;
    if (!same) {   // 같은 메시지들이지만 객체가 다르거나 고쳤다고 알려 왔다: 내용이 같으면 그대로 쓴다
      const refs = slice(list, i, i + p.n); if (refs.some(m => dirty.has(m)) || hashOf(refs) !== p.h) continue;
      if (i > cur) gap(cur, i); out.push({ ...p, refs }); cur = i + p.n; continue;
    }
    if (i > cur) gap(cur, i);
    out.push(p); cur = i + p.n;
  }
  // 봉인되지 않은 꼬리: 길어졌으면 앞에서부터 봉인하고 최근 KEEP 개 이상은 머리에 둔다
  while (list.length - cur >= HEAD_MAX) { out.push(meta('', slice(list, cur, cur + PART), '', cur)); cur += PART; }
  // 끝부분을 지워 머리가 너무 짧아졌으면 마지막 조각을 머리로 되돌린다 (조각을 모르는 예전 판도 최근 대화를 넉넉히 보게)
  while (list.length - cur < KEEP && out.length && out[out.length - 1].refs) cur -= out.pop()!.n;
  return { parts: out, head: slice(list, cur, list.length) };
}

let writing: Promise<unknown> = Promise.resolve();
/** 한 방의 메시지 목록을 저장한다 */
export function write(io: Io, chatId: string, list: Msg[]): Promise<void> {
  const job = writing.then(() => writeNow(io, chatId, list), () => writeNow(io, chatId, list));
  writing = job.catch(() => { }); return job;
}
async function writeNow(io: Io, chatId: string, list: Msg[]) {
  let L = layouts.get(chatId) || null, done: LPart[] = [];
  if (!L) {   // 이 방을 아직 읽거나 쓴 적이 없다: 저장소에 없는 방(새 방 · 분기)이면 빈 배치로 시작한다
    let has = true; await io.tx('readonly', o => { const q = o.getKey(chatId); q.onsuccess = () => { has = q.result !== undefined; }; });
    if (!has) L = { parts: [], checked: true };
  }
  let known = (L?.parts || []).filter(p => p.refs);
  // 처음으로 조각을 만드는 긴 방 (예전 꼴에서 옮기기 · 분기 · 가져온 방): 조각을 하나씩 따로 써서 한 번에 오래 멈추지 않게 한다.
  // 머리는 맨 끝에 한 번에 바꾸므로, 그 전에 멈춰도 저장소에는 예전 꼴의 온전한 목록이 그대로 있다
  if (L && !L.parts.length && list.length >= HEAD_MAX * 2) {
    const pre: LPart[] = [];
    for (let at = 0; list.length - at >= HEAD_MAX; at += PART) {
      const p = meta(chatId + SEP + uid(), list.slice(at, at + PART), '', at);
      await io.batch((_o, log) => { p.h = hashOf(p.refs!); log.put({ id: p.id, chat: chatId, part: 1, at, h: p.h, list: p.refs! } satisfies PartRow); });
      pre.push(p); await new Promise(r => setTimeout(r, 0));
    }
    L = { parts: pre, checked: false }; known = pre;
  }
  await io.batch((o, log) => {
    const go = (exists: Set<string>, headParts: PartMeta[] | null) => {
      // 메모리에 배치가 없다 (오래 열지 않은 방 · 다른 곳에서 씀): 저장소의 머리가 가리키는 조각을 내용으로 견주어 쓸 수 있는 것은 그대로 쓴다
      const { parts, head } = L ? plan(L.parts, list, id => exists.has(id)) : planByContent(headParts || [], list, id => exists.has(id));
      if (!parts.length) {   // 짧다: 예전 꼴 그대로
        log.put({ id: chatId, list });
      } else {
        for (const p of parts) if (!p.h && p.refs) { p.id = chatId + SEP + uid(); p.h = hashOf(p.refs); log.put({ id: p.id, chat: chatId, part: 1, at: p.at ?? 0, h: p.h, list: p.refs } satisfies PartRow); }
        log.put({ id: chatId, v: 2, list: head, parts: parts.map(({ id, n, a, z, h }) => ({ id, n, a, z, h })), total: list.length } satisfies HeadRow);
      }
      const now = new Set(parts.map(p => p.id));
      // 지난 배치에 있다가 빠진 조각 (이 탭이 쓴 것) · 저장소의 머리가 가리키던 조각을 지운다. 찾지 못한 조각은 지우지 않는다
      for (const p of (L ? known : headParts || [])) if (!now.has(p.id) && exists.has(p.id)) log.del(p.id);
      done = parts;
    };
    if (L) {
      if (!known.length) return go(new Set(), null);
      const exists = new Set<string>(); let left = known.length;
      for (const p of known) { const q = o.getKey(p.id); q.onsuccess = () => { if (q.result !== undefined) exists.add(p.id); if (--left === 0) go(exists, null); }; }
    } else {
      const g = o.get(chatId);
      g.onsuccess = () => {
        const h = g.result as Row | undefined, hp = isV2(h) ? h.parts : null;
        if (!hp?.length) return go(new Set(), hp);
        const exists = new Set<string>(); let left = hp.length;
        for (const p of hp) { const q = o.getKey(p.id); q.onsuccess = () => { if (q.result !== undefined) exists.add(p.id); if (--left === 0) go(exists, hp); }; }
      };
    }
  });
  for (const m of list) dirty.delete(m);
  legacyBig.delete(chatId);
  keep(chatId, { parts: done, checked: !done.length });
  if (done.length) sweepSoon(io, chatId);
}
/** 메모리에 배치가 없을 때: 저장소의 조각 정보(n · a · z · h)와 지금 목록을 id 로 맞춰 보고, 내용(h)이 같은 조각만 그대로 쓴다 */
function planByContent(prev: PartMeta[], list: Msg[], exists: (id: string) => boolean) {
  const ix = new Map<unknown, number>(); for (let i = list.length - 1; i >= 0; i--) ix.set(list[i]?.id, i);
  const cand: LPart[] = [];
  let cur = 0;
  for (const p of prev) {
    if (!exists(p.id)) { cand.push({ ...p, refs: null }); continue; }   // 머리가 가리키는데 없는 조각 (아직 받아 오지 못했다): 자리를 지킨다
    const i = ix.get(p.a) ?? -1; if (i < cur || i + p.n > list.length || list[i + p.n - 1]?.id !== p.z) continue;
    const refs = slice(list, i, i + p.n); if (refs.some(m => dirty.has(m)) || hashOf(refs) !== p.h) continue;
    cand.push({ ...p, refs }); cur = i + p.n;
  }
  return plan(cand, list, () => true);
}

// ── 한가할 때 확인 (알리지 않고 고친 오래된 메시지) ──
let sweepT = 0; const pending = new Set<string>();
const idle = (fn: (d: { timeRemaining(): number }) => void) => { const w = window as unknown as { requestIdleCallback?: (f: (d: { timeRemaining(): number }) => void, o?: { timeout: number }) => number }; if (w.requestIdleCallback) w.requestIdleCallback(fn, { timeout: 4000 }); else setTimeout(() => fn({ timeRemaining: () => 8 }), 30); };
let ioRef: Io | null = null, lastSweep = 0;
// 확인은 메시지 전체를 글로 바꿔 견주므로 (변수가 큰 긴 방은 수십 MB) 저장할 때마다 하지 않는다: 저장이 멈추고 1.5초 뒤, 그리고 앞 확인에서 20초가 지난 뒤.
// 창을 숨기거나 닫을 때는 기다리지 않고 바로 한다 (sweepNow)
function sweepSoon(io: Io, chatId: string) {
  ioRef = io; pending.add(chatId); clearTimeout(sweepT);
  sweepT = window.setTimeout(() => idle(d => { lastSweep = Date.now(); void sweep(io, d); }), Math.max(1500, lastSweep + 20000 - Date.now()));
}
/** 조각마다 지금 메모리의 내용과 저장한 내용(h)을 견준다. 다르면 그 조각만 새로 쓴다. now 면 쉬지 않고 끝까지 */
async function sweep(io: Io, d: { timeRemaining(): number } | null) {
  for (const chatId of [...pending]) {
    const L = layouts.get(chatId); if (!L) { pending.delete(chatId); continue; }
    const parts = L.parts.filter(p => p.refs);
    const changed: LPart[] = [];
    for (const p of parts) {
      if (d && d.timeRemaining() < 4) { await new Promise<void>(r => idle(n => { d = n; r(); })); if (layouts.get(chatId) !== L) break; }
      if (p.refs!.some(m => dirty.has(m)) || hashOf(p.refs!) !== p.h) changed.push(p);
    }
    if (layouts.get(chatId) !== L) continue;   // 그사이 다시 저장했다: 그 저장 뒤에 다시 확인한다
    pending.delete(chatId);
    if (!changed.length) { L.checked = true; continue; }
    const job = writing.then(() => rewrite(io, chatId, L, changed)); writing = job.catch(() => { });
    await job.catch(e => console.warn('[메시지 저장] 확인', e));
  }
}
/** 확인에서 달라진 조각만 새로 쓴다. 머리는 저장소에 있는 그대로 두고 조각 목록만 고친다 (화면에서 아직 저장하지 않은 것을 쓰지 않게) */
async function rewrite(io: Io, chatId: string, L: Layout, changed: LPart[]) {
  let ok = false;
  await io.batch((o, log) => {
    const g = o.get(chatId);
    g.onsuccess = () => {
      const h = g.result as Row | undefined;
      if (!isV2(h) || layouts.get(chatId) !== L || h.parts.length !== L.parts.length || h.parts.some((p, i) => p.id !== L.parts[i].id)) return;   // 그사이 바뀌었다
      for (const p of changed) {
        const id = chatId + SEP + uid(), hh = hashOf(p.refs!), old = p.id, i = L.parts.indexOf(p), at = L.parts.slice(0, i).reduce((n, x) => n + x.n, 0);
        log.put({ id, chat: chatId, part: 1, at, h: hh, list: p.refs! } satisfies PartRow);
        Object.assign(p, { id, h: hh, n: p.refs!.length, a: p.refs![0]?.id, z: p.refs![p.refs!.length - 1]?.id });
        log.del(old);
      }
      log.put({ ...h, parts: L.parts.map(({ id, n, a, z, h: x }) => ({ id, n, a, z, h: x })) });
      ok = true;
    };
  });
  if (ok) { for (const p of changed) for (const m of p.refs!) dirty.delete(m); L.checked = true; }
}
/** 확인을 기다리지 않고 지금 끝낸다 (창을 숨기거나 닫을 때) */
export function sweepNow() { if (!ioRef || !pending.size) return; clearTimeout(sweepT); void sweep(ioRef, null); }
if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') sweepNow(); });
  addEventListener('pagehide', sweepNow);
}

// ── 저장된 메시지 몇 개만 고치기 ──
/** 저장된 목록에서 ids 의 메시지만 fn 으로 고쳐 쓴다 (화면이 들고 있는 목록을 통째로 덮어쓰지 않게). fn 은 고쳤으면 true. 고친 수 */
export async function patch(io: Io, chatId: string, ids: string[], fn: (row: Msg) => boolean): Promise<number> {
  const want = new Set(ids); let n = 0; const moved: [string, PartMeta][] = [];
  const job = writing.then(() => io.batch((o, log) => {
    const g = o.get(chatId);
    g.onsuccess = () => {
      const h = g.result as Row | undefined; if (!h || isPart(h) || !Array.isArray(h.list)) return;
      let headDirty = false;
      for (const m of h.list) if (m && want.has(m.id)) { want.delete(m.id); if (fn(m)) { n++; headDirty = true; } }
      if (!want.size || !isV2(h)) { if (headDirty) log.put(h); return; }
      const parts = h.parts; let left = parts.length;
      if (!left) { if (headDirty) log.put(h); return; }
      const got: (PartRow | undefined)[] = [];
      parts.forEach((p, i) => { const q = o.get(p.id); q.onsuccess = () => { got[i] = q.result as PartRow | undefined; if (--left) return;
        parts.forEach((pm, k) => {
          const r = got[k]; if (!r || !isPart(r)) return; let changed = false;
          for (const m of r.list) if (m && want.has(m.id)) { want.delete(m.id); if (fn(m)) { n++; changed = true; } }
          if (!changed) return;
          const id = chatId + SEP + uid(), hh = hashOf(r.list);
          log.put({ ...r, id, h: hh }); log.del(pm.id); moved.push([pm.id, { id, n: r.list.length, a: r.list[0]?.id, z: r.list[r.list.length - 1]?.id, h: hh }]);
          parts[k] = moved[moved.length - 1][1]; headDirty = true;
        });
        if (headDirty) log.put(h);
      }; });
    };
  }));
  writing = job.catch(() => { }); await job;
  // 메모리의 배치도 새 조각 id 를 따른다 (내용은 한가할 때 확인에서 견준다)
  const L = layouts.get(chatId);
  if (L && moved.length) { for (const [old, m] of moved) { const p = L.parts.find(x => x.id === old); if (p) { p.id = m.id; p.h = m.h; } } sweepSoon(io, chatId); }
  return n;
}

// ── 지우기 · 내보내기 ──
/** 방 하나의 머리와 조각을 모두 지운다 */
export async function remove(io: Io, chatId: string) {
  // 앞서 부탁한 저장이 끝난 뒤에 지운다 (지운 방이 뒤늦은 저장으로 되살아나지 않게)
  const job = writing.then(() => io.batch((o, log) => { log.del(chatId); const q = o.getAllKeys(range(chatId)); q.onsuccess = () => { for (const k of q.result) log.del(String(k)); }; }));
  writing = job.catch(() => { }); await job;
  forget(chatId); pending.delete(chatId); legacyBig.delete(chatId);
}
/** 저장소의 모든 줄(머리 · 조각)을 방마다 예전 꼴 { id, list } 로 (백업 · 내보내기) */
export function flatten(rows: Row[]): { id: string; list: Msg[] }[] {
  const parts = new Map<string, PartRow>(), by = new Map<string, PartRow[]>();
  for (const r of rows) if (isPart(r)) { parts.set(r.id, r); (by.get(r.chat) || by.set(r.chat, []).get(r.chat)!).push(r); }
  return rows.filter(r => !isPart(r)).map(h => ({ id: h.id, list: assemble(h, parts, by.get(h.id) || []).list }));
}
/** 가져온 줄들을 그대로 넣기 전에: 가져오는 방의 이 저장소 조각 가운데 가져온 줄에 없는 것 (가져온 머리와 어긋나므로 지운다) */
export async function staleParts(io: Io, rows: Row[]): Promise<string[]> {
  const ids = new Set(rows.map(r => String(r.id))), chats = [...new Set(rows.filter(r => !isPart(r)).map(r => String(r.id)))];
  const out: string[] = [];
  if (!chats.length) return out;
  await io.tx('readonly', o => { for (const c of chats) { const q = o.getAllKeys(range(c)); q.onsuccess = () => { for (const k of q.result) if (!ids.has(String(k))) out.push(String(k)); }; } });
  return out;
}
