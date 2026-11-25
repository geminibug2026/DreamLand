// 그림 선반: 갤러리 · 참조 목록을 그림 글자 없이 읽는다.
// assets 저장소에는 삽화 말고도 배경 · 스티커 · 표정 · 영상이 함께 있고, IndexedDB 는 한 줄을 통째로만 읽는다.
// 목록을 열 때마다 다 읽으면 그림 수만큼 느려지고 메모리도 그만큼 든다. 그래서 한 번 읽은 줄의 가벼운 정보(제목 · 프롬프트 · 때)를
// 그림 상자(지워도 되는 사본)에 적어 두고, 다음부터는 열쇠만 읽어 새로 생기거나 고쳐진 줄만 다시 읽는다.
import * as C from '../lib/core';
import { REF_OWNER, boxGet, boxSet, thumbsIdle } from '../lib/illust';

export interface Card {
  id: string; owner: string; kind: 'illust' | 'illust-ref'; ts: number;
  /** 삽화: 제목 · 찾을 글(제목 · 프롬프트 · 구도 · 인물 이름, 소문자) · 검수 의견이 있는지 */
  title?: string; find?: string; review?: boolean;
  /** 원본이 차지하는 대략의 바이트 (저장 공간 표시용) */
  size?: number;
  /** 참조: 이름 · 어디서 왔는지('avatar:<캐릭터 id>') */
  name?: string; src?: string;
}
/** 0 = 삽화 · 참조가 아닌 줄 (영상 · 배경 …) — 다시 읽지 않는다 */
type Row = Card | 0;
const KEY = '#shelf', STALE = '#shelf-stale', VER = 2, CHUNK = 4;   // 2: 크기를 함께 적는다
let rows: Map<string, Row> | null = null, staleAll = false, run: Promise<Card[]> | null = null, saveTimer = 0, staleTimer = 0, staleReady: Promise<void> | null = null;
const stale = new Set<string>();
// 고쳐 쓴 줄(검수 의견이 붙은 그림 …)은 다음에 목록을 열 때 다시 읽는다. 목록을 열지 않고 앱을 닫아도 잊지 않게 적어 둔다
const loadStale = () => staleReady ||= boxGet<string[]>(STALE).then(l => { for (const id of l || []) { if (id === '*') staleAll = true; else stale.add(id); } }).catch(() => { });
const keepStale = () => { clearTimeout(staleTimer); staleTimer = window.setTimeout(() => void loadStale().then(() => { if (stale.size > 2000) { staleAll = true; stale.clear(); } return boxSet(STALE, staleAll ? ['*'] : [...stale]); }), 300); };
let rowsReady: Promise<Map<string, Row>> | null = null;
const loadRows = () => rowsReady ||= boxGet<{ v?: number; rows?: [string, Row][] }>(KEY).then(kept => rows = new Map(kept?.v === VER && Array.isArray(kept.rows) ? kept.rows : [])).catch(() => rows = new Map());
// 목록에 올라 있는 줄을 고쳐 썼을 때만 적는다 (스티커 · 표정처럼 목록과 상관없는 것이 쌓이지 않게). 새로 생긴 줄 · 지워진 줄은 열쇠를 맞춰 볼 때 알아챈다
C.onAssetWrite(id => { if (id == null) { staleAll = true; keepStale(); } else void loadRows().then(map => { if (map.has(id)) { stale.add(id); keepStale(); } }); });

type Rec = { id?: string; owner?: string; kind?: string; data?: string; ts?: number; title?: string; prompt?: string; name?: string; src?: string; review?: unknown; scene?: { camera?: string; characters?: { name?: string }[] } };
const cardOf = (r: Rec | undefined, id: string, owner: string): Row => {
  if (!r || !r.data) return 0;
  const size = Math.round(String(r.data).length * 0.75 + String((r as { v5?: string }).v5 || '').length * 0.75);   // 글자로 적힌 그림(base64)의 실제 크기쯤
  if (r.kind === 'illust-ref') return { id, owner, kind: 'illust-ref', ts: r.ts || 0, size, name: r.name || '', ...(r.src ? { src: String(r.src) } : {}) };
  if (r.kind !== 'illust') return 0;
  return { id, owner, kind: 'illust', ts: r.ts || 0, size, title: r.title || '', find: [r.title, r.prompt, r.scene?.camera, ...(r.scene?.characters || []).map(x => x.name)].filter(Boolean).join(' ').toLowerCase().slice(0, 2000), ...(r.review ? { review: true } : {}) };
};
const save = (now = false) => { clearTimeout(saveTimer); const go = () => { if (rows) void boxSet(KEY, { v: VER, rows: [...rows] }); }; if (now) go(); else saveTimer = window.setTimeout(go, 400); };   // now: 다 읽은 뒤에는 바로 적는다 (곧바로 앱을 닫아도 다음에 처음부터 다시 읽지 않게)

/** 삽화와 참조의 목록. 처음 한 번은 줄마다 읽어야 해서 오래 걸릴 수 있다 → progress(읽은 수, 읽을 수, 지금까지의 목록) — 새 그림부터 읽으므로 읽은 데까지 먼저 보여 줄 수 있다 */
export function shelf(progress?: (done: number, total: number, part: Card[]) => void): Promise<Card[]> {
  return run ||= (async () => {
    try {
      const map = await loadRows(); await loadStale(); let changed = false;
      if (staleAll) { map.clear(); changed = true; }
      for (const id of stale) changed = map.delete(id) || changed;
      if (staleAll || stale.size) { staleAll = false; stale.clear(); keepStale(); }
      // 열쇠와 주인만 읽어 맞춰 본다. 삽화는 대화(chat:…)에, 참조는 제 선반에 있다 — 다른 주인의 줄은 읽지 않는다
      const mine = (await C.DB.owners()).filter(([, o]) => o === REF_OWNER || o.startsWith('chat:')), have = new Map(mine);
      for (const id of [...map.keys()]) if (!have.has(id)) { map.delete(id); changed = true; }
      const cards = () => [...map.values()].filter((x): x is Card => !!x);
      const miss = mine.filter(([id]) => !map.has(id)).sort((a, b) => a[0] < b[0] ? 1 : a[0] > b[0] ? -1 : 0);   // id 는 만든 때로 시작한다: 새 그림부터
      for (let i = 0; i < miss.length; i += CHUNK) {
        if (i && i % (CHUNK * 2) === 0) await thumbsIdle(1500);   // 지금 보이는 작은 그림이 먼저다 — 처음 정리하는 동안에도 첫 화면의 그림은 바로 뜬다
        const part = miss.slice(i, i + CHUNK), recs = await C.DB.many('assets', part.map(x => x[0])) as unknown as (Rec | undefined)[];
        part.forEach(([id, owner], j) => map.set(id, cardOf(recs[j], id, owner)));
        changed = true; if (progress && (i % (CHUNK * 3) === 0 || i + CHUNK >= miss.length)) progress(Math.min(miss.length, i + CHUNK), miss.length, cards());
        if (i % (CHUNK * 8) === 0) save();   // 읽다가 닫아도 읽은 데까지는 남는다
      }
      if (changed) save(true);
      return cards();
    } finally { run = null; }
  })();
}
