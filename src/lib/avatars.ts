// 캐릭터 초상을 메모리에 통째로 올리지 않기.
// 캐릭터가 수백 명이면 chars 저장소는 초상(data URL) 때문에 수백 MB 다 — 켤 때마다 그것을 다 읽으면 몇 초 ~ 수십 초가 걸리고 메모리도 그만큼 먹는다.
// 그래서 그림을 뺀 사본을 따로 둔다 (IndexedDB 'dreamland-lite' — 다시 만들 수 있는 캐시, 자료 폴더 · 백업과 무관).
//  · 켤 때: chars 의 열쇠와 이 사본만 읽는다. 사본이 없는 줄은 일꾼이 저장소에서 읽어 그림을 빼고 보내 준다.
//  · 메모리의 c.avatar 는 꼬리표(avkey.ts). 그림은 작은 그림 · 원본 Blob 으로 일꾼이 꺼내 화면에 건다 (blobUrl.ts).
//  · 저장: chars 에 쓸 때 꼬리표면 같은 트랜잭션에서 저장된 그림을 읽어 끼워 넣는다 — 저장소에는 언제나 예전과 같은 꼴(그림 포함)로 들어간다.
//  · 지금 대화의 캐릭터는 그림을 통째로 들고 있는다 (hold) — 상태창 · 확장 등 그림 글자를 바로 쓰는 곳이 예전처럼 돌게.
//  · 사본이 어긋났는지(예전 판이 썼거나 쓰다 꺼졌을 때)는 켠 뒤 한가할 때 일꾼이 지문을 견주어 바로잡는다.
// 일꾼이나 사본 저장소를 못 쓰면 예전처럼 통째로 읽는다 (그때는 꼬리표가 생기지 않는다).
import { avHeavy, avKey, avTok, isAvTok, liteOf, strHash, tokParts, type LiteRow } from './avkey';
import { avStream, avWorkerOk } from './avwork';
import { cacheDb, cacheTx } from './cachedb';
import { shownUrlReady } from './blobUrl';

type Row = Record<string, unknown> & { id: string; avatar?: unknown };
export interface AvIo {
  /** chars 저장소의 한 트랜잭션 */
  tx(mode: IDBTransactionMode, fn: (o: IDBObjectStore) => void): Promise<unknown>;
  all(): Promise<Row[]>; keys(): Promise<IDBValidKey[]>; get(id: string): Promise<Row | undefined>;
  /** 메모리의 캐릭터 */
  find(id: string): Row | undefined; list(): Row[];
  /** 메모리의 캐릭터가 바뀌었다고 알린다 */
  changed(): void;
}
let io: AvIo | null = null;
let on = false;
const fpAt = new Map<string, string>(), tokAt = new Map<string, string>(), held = new Set<string>();
const peeked = new Map<string, string>(), peeking = new Set<string>();

// ── 그림을 뺀 사본 저장소 ──
const liteDb = cacheDb, ltx = <T,>(mode: IDBTransactionMode, fn: (o: IDBObjectStore) => IDBRequest | void) => cacheTx<T>('chars', mode, fn);
const litePut = (rows: LiteRow[]) => rows.length ? ltx('readwrite', o => { for (const r of rows) o.put(r); }) : Promise.resolve(undefined);
const liteDel = (ids: string[]) => ids.length ? ltx('readwrite', o => { for (const id of ids) o.delete(id); }) : Promise.resolve(undefined);
const note = (l: LiteRow) => { fpAt.set(l.id, l.fp); tokAt.set(l.id, String(l.v.avatar ?? '')); };
const forget = (id: string) => { fpAt.delete(id); tokAt.delete(id); };
const off = () => { try { return localStorage.getItem('dl-avatar-lite') === 'off'; } catch { return false; } };

/** 저장소에 넣을 꼴: 꼬리표면 src(그 그림이 든 줄)의 그림을 끼운다. 저장소에는 꼬리표가 들어가지 않는다 */
const realOf = (src: Row | undefined) => { const a = src?.avatar; return typeof a === 'string' && !isAvTok(a) ? a : ''; };
/** 메모리의 캐릭터를 사본과 같은 꼴(제 id 의 꼬리표)로 본 지문 */
function memFp(c: Row): string {
  const a = c.avatar, p = isAvTok(a) ? tokParts(a) : null;
  try { return strHash(JSON.stringify({ ...c, avatar: avHeavy(a) ? avTok(avKey(a), c.id) : p ? avTok(p.key, c.id) : a })); } catch { return ''; }
}

export const Av = {
  /** core.ts 가 저장소로 가는 길을 넘겨준다 */
  init(x: AvIo) { io = x; },
  /** 꼬리표 방식으로 돌고 있는가 */
  get on() { return on; },

  /** 켤 때: 캐릭터 목록. 그림은 꼬리표로 (못 쓰는 환경이면 예전처럼 통째로) */
  async loadChars(): Promise<Row[]> {
    const x = io!; fpAt.clear(); tokAt.clear();
    if (off() || !(await liteDb()) || !(await avWorkerOk())) { on = false; return x.all(); }
    try {
      const [keys, lite] = await Promise.all([x.keys(), ltx<LiteRow[]>('readonly', o => o.getAll())]);
      const ids = keys.map(String), have = new Map((lite || []).map(r => [r.id, r]));
      const missing = ids.filter(k => !have.has(k));
      if (missing.length) {
        const fresh: LiteRow[] = [];
        if (!(await avStream({ strip: missing }, r => { for (const l of r.rows || []) { have.set(l.id, l); fresh.push(l); } }))) throw new Error('strip');
        void litePut(fresh);
      }
      const idSet = new Set(ids); void liteDel([...have.keys()].filter(k => !idSet.has(k)));
      const out: Row[] = [];
      for (const id of ids) { const l = have.get(id); if (l) { note(l); out.push(l.v as Row); } }
      on = true; held.clear(); verifySoon();
      return out;
    } catch (e) { console.warn('[초상]', e); on = false; fpAt.clear(); tokAt.clear(); return x.all(); }
  },

  /** chars 에 한 줄 쓴다 (DB.put). 꼬리표는 저장된 그림으로 바꿔 넣는다 */
  put(v: Row): Promise<unknown> { return Av.bulk([v]); },
  bulk(list: Row[]): Promise<unknown> {
    const lites: LiteRow[] = [];
    return io!.tx('readwrite', o => {
      for (const v of list) {
        const p = isAvTok(v.avatar) ? tokParts(v.avatar) : null;
        if (!isAvTok(v.avatar)) { o.put(v); try { lites.push(liteOf(v)); } catch { /* 지문을 못 내면 다음에 켤 때 다시 만든다 */ } continue; }
        const g = o.get(p ? p.id : v.id);
        g.onsuccess = () => { const row = { ...v, avatar: realOf(g.result as Row | undefined) }; o.put(row); try { lites.push(liteOf(row)); } catch { /* 위와 같다 */ } };
      }
    }).then(r => { const ok = new Set(lites.map(l => l.id)); for (const l of lites) note(l); void litePut(lites); void liteDel(list.map(v => String(v.id)).filter(id => !ok.has(id))); return r; });
  },
  /** chars 에서 지웠다 · 비웠다 · 다른 길(batch)로 썼다 */
  dropped(ids: string[]) { for (const id of ids) { forget(id); held.delete(id); } void liteDel(ids); },
  cleared() { fpAt.clear(); tokAt.clear(); held.clear(); void ltx('readwrite', o => { o.clear(); }); },

  /** 저장한 뒤: 메모리에 그림을 통째로 들고 있으면 꼬리표로 바꾼다 (지금 대화의 캐릭터는 그대로 둔다). before = 저장을 시작할 때의 c.avatar — 그사이 그림을 또 바꿨으면 건드리지 않는다 */
  settle(c: Row, before: unknown) {
    if (!on || held.has(c.id) || c.avatar !== before) return;
    const t = tokAt.get(c.id); if (t !== undefined && (avHeavy(c.avatar) || isAvTok(c.avatar))) c.avatar = t;
  },

  /** 그림 글자 (data URL). 꼬리표면 저장소에서 읽는다 */
  async data(a: unknown): Promise<string> {
    if (!isAvTok(a)) return typeof a === 'string' ? a : '';
    const p = tokParts(a); if (!p || !io) return '';
    try { return realOf(await io.get(p.id)); } catch { return ''; }
  },
  /** 지금 바로 줄 수 있는 그림 글자 (기다릴 수 없는 곳용). 꼬리표인데 아직 읽지 않았으면 '' 를 주고 읽어 둔다 — 다음에 물으면 준다 */
  peek(a: unknown): string {
    if (!isAvTok(a)) return typeof a === 'string' ? a : '';
    const tok = a as string, hit = peeked.get(tok); if (hit !== undefined) return hit;
    if (!peeking.has(tok)) { peeking.add(tok); void Av.data(tok).then(v => { peeked.set(tok, v); if (peeked.size > 4) peeked.delete(peeked.keys().next().value as string); }).finally(() => peeking.delete(tok)); }
    return '';
  },
  /** 그림을 통째로 든 사본 (내보내기 · 복사처럼 그림 글자가 필요한 곳). 메모리의 캐릭터는 그대로 둔다 */
  async full<T extends { avatar?: unknown }>(c: T): Promise<T> { return isAvTok(c.avatar) ? { ...c, avatar: await Av.data(c.avatar) } : c; },

  /** 지금 대화의 캐릭터들: 그림을 통째로 들고 있는다. 나머지는 꼬리표로 되돌린다 */
  async hold(ids: string[]) {
    if (!on || !io) return;
    const want = new Set(ids);
    // 놓을 때: 메모리의 그림이 저장된 것과 같을 때만 꼬리표로 되돌린다 (방금 고른 새 그림이 아직 저장되기 전이면 그대로 둔다 — 저장하면서 바뀐다)
    for (const id of [...held]) if (!want.has(id)) { held.delete(id); const c = io.find(id), t = tokAt.get(id); if (c && t !== undefined && avHeavy(c.avatar) && tokParts(t)?.key === avKey(c.avatar)) c.avatar = t; }
    await Promise.all([...want].map(async id => {
      held.add(id); const c = io!.find(id); if (!c || !isAvTok(c.avatar)) return;
      // 원본 Blob 도 꺼내 달라고 해 둔다 (대화 화면이 초상을 걸 때 쓴다). 기다리지는 않는다 — 방을 여는 것이 늦어지지 않게
      const tok = c.avatar; void shownUrlReady(tok as string).catch(() => '');
      const real = await Av.data(tok);
      if (held.has(id) && c.avatar === tok && real) c.avatar = real;
    }));
  },
};

// ── 사본이 저장소와 같은지 살핀다 (켠 뒤 한가할 때 한 번) ──
let verifyT = 0;
function verifySoon() {
  clearTimeout(verifyT);
  verifyT = window.setTimeout(() => { const w = window as unknown as { requestIdleCallback?: (f: () => void, o?: { timeout: number }) => number }; if (w.requestIdleCallback) w.requestIdleCallback(() => void verify(), { timeout: 10000 }); else void verify(); }, 12000);
}
async function verify() {
  const x = io; if (!x || !on) return;
  const bad: string[] = [];
  // warm: 읽는 김에, 아직 없는 목록용 작은 그림도 만들어 둔다
  const ok = await avStream({ verify: true, warm: true, px: 448 }, r => { for (const [id, fp] of r.fps || []) if (fpAt.has(id) && fpAt.get(id) !== fp) bad.push(id); });
  if (!ok || !bad.length) return;
  console.debug('[초상] 저장소와 어긋난 사본', bad.length);
  const rows: LiteRow[] = []; let touched = false;
  await avStream({ strip: bad }, r => { for (const l of r.rows || []) rows.push(l); });
  for (const l of rows) {
    const c = x.find(l.id), was = fpAt.get(l.id);
    if (was === l.fp) continue;   // 그사이 이 창이 저장했다
    if (c) {
      const m = memFp(c);
      if (m !== l.fp && m === was) {   // 메모리는 켤 때 그대로인데 저장소가 다르다 (다른 곳에서 고쳤다): 저장소를 따른다
        for (const k of Object.keys(c)) delete c[k]; Object.assign(c, l.v); touched = true;
        if (held.has(l.id)) { const tok = c.avatar, real = await Av.data(tok); if (c.avatar === tok && real) c.avatar = real; }
      }
    }
    note(l);
  }
  void litePut(rows);
  if (touched) x.changed();
}
