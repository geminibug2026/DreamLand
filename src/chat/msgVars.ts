// 메시지 변수 (실리태번 · Tavern Helper 의 message variables): 답변 후보(스와이프)마다 따로 둔다 — swipe.thData.
// 옛 꼴(메시지에 하나 · msg.thData)과 실리태번에서 가져온 대화의 variables 배열(msg.stRow.variables)은 처음 읽을 때 후보 쪽으로 옮긴다.
import type { Msg, Swipe } from '../lib/types';

export type Obj = Record<string, unknown>;
type SwipeD = Swipe & { thData?: Obj };
type MsgD = Msg & { thData?: Obj; stRow?: Obj & { variables?: unknown } };
const isObj = (v: unknown): v is Obj => !!v && typeof v === 'object' && !Array.isArray(v);

/** 옛 꼴을 후보마다의 꼴로 옮긴다 (바뀐 것이 있으면 true) */
export function migrateVars(mIn: Msg): boolean {
  const m = mIn as MsgD; let moved = false;
  const rows = m.stRow?.variables;
  if (Array.isArray(rows)) {
    rows.forEach((v, i) => { const s = m.swipes[i] as SwipeD | undefined; if (s && s.thData === undefined && isObj(v) && Object.keys(v).length) s.thData = v; });
    delete m.stRow!.variables; moved = true;
  }
  if (m.thData !== undefined) {
    const s = m.swipes[m.sw] as SwipeD | undefined;
    if (s && s.thData === undefined && isObj(m.thData)) s.thData = m.thData;
    delete m.thData; moved = true;
  }
  return moved;
}
/** 이 메시지(지금 고른 후보, 또는 sw 번째 후보)의 변수 */
export function varsOf(m: Msg | undefined | null, sw?: number): Obj | undefined {
  if (!m) return undefined;
  migrateVars(m);
  return (m.swipes[sw ?? m.sw] as SwipeD | undefined)?.thData;
}
/** 변수를 통째로 바꾼다 (undefined 면 지운다) */
export function setVarsOf(m: Msg, v: Obj | undefined, sw?: number) {
  migrateVars(m);
  const s = m.swipes[sw ?? m.sw] as SwipeD | undefined; if (!s) return;
  if (v === undefined) delete s.thData; else s.thData = v;
}
/** 후보마다의 변수 (없는 후보는 {}) — 실리태번의 swipes_data · variables 배열 */
export const swipesVars = (m: Msg): Obj[] => { migrateVars(m); return m.swipes.map(s => (s as SwipeD).thData || {}); };
