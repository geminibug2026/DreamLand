// 턴별 되돌리기 기록 — 한 턴의 기록이 고친 칸의 "이전 모습"을 그 턴에 적어 둔다.
// 분기 · 스와이프 · 삭제로 뒤쪽 답변들이 사라지면, 가장 늦은 턴부터 거꾸로 되돌려 그 시점의 모습을 그대로 되찾는다.
import type { Mem, Turn } from '../types';

export const UNDO_SHELVES = ['cast', 'status', 'canon', 'items', 'bonds'] as const;
type Shelf = typeof UNDO_SHELVES[number];
type Row = { id: string; manual?: boolean; locked?: boolean };
export type Undo = Partial<Record<Shelf, Record<string, unknown>>>;
type Snap = Record<Shelf, Map<string, string>>;
/** 되돌리기 기록을 남겨 두는 최근 턴 수 — 그보다 앞으로 분기하면 예전 방식(한 단계 이전 값)으로 되돌린다 */
const KEEP = 400;

const rows = (mem: Mem, k: Shelf) => ((mem[k] || []) as unknown as Row[]);

export function snapUndo(mem: Mem): Snap {
  const out = {} as Snap;
  for (const k of UNDO_SHELVES) out[k] = new Map(rows(mem, k).filter(r => r && r.id).map(r => [r.id, JSON.stringify(r)]));
  return out;
}

/** 기록 전 사진과 지금을 견주어 바뀐 칸만 남긴다. 새로 생긴 칸은 null(되돌리면 지운다), 없어진 칸은 이전 모습 */
export function diffUndo(before: Snap, mem: Mem): Undo | null {
  const undo: Undo = {}; let any = false;
  for (const k of UNDO_SHELVES) {
    const was = before[k], seen = new Set<string>(), part: Record<string, unknown> = {};
    for (const r of rows(mem, k)) {
      if (!r || !r.id) continue; seen.add(r.id);
      const old = was.get(r.id);
      if (old === undefined) part[r.id] = null;
      else if (old !== JSON.stringify(r)) part[r.id] = JSON.parse(old);
    }
    for (const [id, old] of was) if (!seen.has(id)) part[id] = JSON.parse(old);
    if (Object.keys(part).length) { undo[k] = part; any = true; }
  }
  return any ? undo : null;
}

/** 같은 턴을 다시 기록할 때 — 앞선 기록의 "이전 모습"이 더 이르므로 그쪽을 우선한다 */
export function mergeUndo(next: Undo | null, prev: Undo | undefined): Undo | null {
  if (!prev) return next;
  const out: Undo = { ...(next || {}) };
  for (const k of UNDO_SHELVES) if (prev[k]) out[k] = { ...(out[k] || {}), ...prev[k] };
  return out;
}

/** 오래된 턴의 되돌리기 기록은 덜어 낸다 (저장 크기) */
export function trimUndo(mem: Mem) {
  const n = mem.turns.length - KEEP;
  for (let i = 0; i < n; i++) if (mem.turns[i].undo) delete mem.turns[i].undo;
}

/**
 * 사라진 턴들 가운데 "뒤에 살아남은 턴이 없는" 끝자락만 거꾸로 되돌린다 — 중간 턴 하나를 지울 때 되돌리면 그 뒤 턴들이 고친 내용까지 덮어쓰게 되므로 그때는 하지 않는다.
 * 사용자가 직접 적었거나 잠근 칸은 건드리지 않는다. 되돌리기 기록이 없는 턴을 만나면 거기서 멈춘다 (나머지는 원래 정리 방식이 맡는다). 반환: 되돌린 턴 수
 */
export function applyUndo(mem: Mem, dead: Set<Turn>): number {
  let done = 0;
  for (let i = mem.turns.length - 1; i >= 0; i--) {
    const t = mem.turns[i];
    if (!dead.has(t)) break;
    const undo = t.undo as Undo | undefined;
    if (!undo) break;
    for (const k of UNDO_SHELVES) {
      const part = undo[k]; if (!part) continue;
      const list = rows(mem, k);
      for (const [id, old] of Object.entries(part)) {
        const at = list.findIndex(r => r && r.id === id), cur = at >= 0 ? list[at] : null;
        if (cur && (cur.manual || cur.locked)) continue;
        if (old === null) { if (at >= 0) list.splice(at, 1); }
        else if (at >= 0) list[at] = old as Row;
        else list.push(old as Row);
      }
    }
    delete t.undo; done++;
  }
  return done;
}
