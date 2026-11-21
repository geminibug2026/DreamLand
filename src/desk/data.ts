// 책상 위젯이 같이 쓰는 셈: 날짜별 주고받은 수 · 모아 둔 문장 · 캐릭터를 마지막으로 만난 때. 모델을 부르지 않고 저장된 것만 읽는다
import { useEffect, useState } from 'react';
import { DB, S } from '../lib/core';
import type { Char, Chat } from '../lib/types';
import { dayKey, msgTs, swipeOf } from '../lib/f-keepsake';

export const DAY = 86400000;
export const p2 = (n: number) => String(Math.max(0, Math.round(n))).padStart(2, '0');
/** 씨앗 있는 난수 (같은 날에는 같은 값) */
export const seeded = (seed: number) => { let z = seed % 2147483647 || 1; return () => (z = (z * 16807) % 2147483647) / 2147483647; };
export const hash = (s: string) => { let n = 7; for (const c of s) n = (n * 33 + c.charCodeAt(0)) >>> 0; return n; };
/** 화면에 한 줄로 보일 글: 꼬리표 · 서식 기호를 걷어낸다 */
export const plain = (v: unknown) => String(v ?? '').replace(/<([A-Za-z_][\w-]*)[^>]*>[\s\S]*?<\/\1>/g, ' ').replace(/<[^>]*>?/g, ' ').replace(/\{\{[^}]*\}\}|\[[^\]]*\]|```[\s\S]*?(```|$)/g, ' ').replace(/[#*_>`|]+/g, ' ').replace(/\s+/g, ' ').trim();
export const charOf = (id: string): Char | undefined => S.get('chars', id);
export const charsOf = (c: Chat) => c.charIds.map(charOf).filter((x): x is Char => !!x);
export const whoOf = (c: Chat) => charsOf(c).map(x => x.name).join(', ');

/** 캐릭터마다 마지막으로 이야기한 때 */
export function lastUse(): Map<string, number> { const m = new Map<string, number>(); for (const c of S.chats) if (!c.temp) for (const id of c.charIds) m.set(id, Math.max(m.get(id) || 0, c.updatedAt || 0)); return m; }
/** 가장 오래된 대화방이 열린 때 (없으면 0) */
export const firstEver = () => S.chats.reduce((n, c) => c.createdAt && (!n || c.createdAt < n) ? c.createdAt : n, 0);

export interface Quote { chatId: string; msgId: string; text: string; who: string; at: number; from: 'pin' | 'mark' }
export interface Scan { days: Map<string, { user: number; ai: number }>; quotes: Quote[] }
const EMPTY: Scan = { days: new Map(), quotes: [] };
let cache: { key: string; scan: Scan } | null = null, running: Promise<Scan> | null = null, runKey = '';
// 최근에 움직인 방만 읽는다: 달력 · 막대는 지난 45일이면 되고, 고정한 문장은 최근 방 24개까지 찾는다
const WINDOW = 45 * DAY, MAX_ROOMS = 24;
const rooms = () => { const since = Date.now() - WINDOW; return [...S.chats].filter(c => !c.temp).sort((a, b) => b.updatedAt - a.updatedAt).filter((c, i) => i < MAX_ROOMS || c.updatedAt >= since).slice(0, 60); };
const keyOf = (list: Chat[]) => list.map(c => c.id + ':' + c.updatedAt + ':' + c.count).join('|');
// 방마다 따로 셈해 둔다: 한 방이 바뀌면 그 방만 다시 읽는다 (메시지가 수천 개인 방을 답장마다 통째로 다시 훑지 않게)
type RoomScan = { k: string; days: [string, number, number][]; quotes: Quote[] };
const perRoom = new Map<string, RoomScan>();
const idle = () => new Promise<void>(r => { const w = window as unknown as { requestIdleCallback?: (f: () => void, o?: { timeout: number }) => number }; if (w.requestIdleCallback) w.requestIdleCallback(() => r(), { timeout: 1500 }); else setTimeout(r, 0); });
async function scanRoom(c: Chat, since: number): Promise<RoomScan | null> {
  const k = c.updatedAt + ':' + c.count + ':' + dayKey(since), old = perRoom.get(c.id); if (old?.k === k) return old;
  await idle();
  let msgs; try { msgs = S.msgsCached(c.id) || await S.msgs(c.id); } catch { return null; }   // 방금까지 연 방은 메모리의 목록을 쓴다 (긴 방을 다시 읽지 않게 — 읽기만 한다)
  const days = new Map<string, [number, number]>(), quotes: Quote[] = [];
  for (const m of msgs) {
    if (m.role === 'system' || m.hidden) continue;
    const ts = msgTs(m);
    if (ts >= since) { const key = dayKey(ts), d = days.get(key) || [0, 0]; if (m.role === 'user') d[0]++; else d[1]++; days.set(key, d); }
    if (m.pin) { const text = plain(swipeOf(m).text); if (text) quotes.push({ chatId: c.id, msgId: m.id, text: text.slice(0, 220), who: m.role === 'user' ? '' : m.name || '', at: ts, from: 'pin' }); }
  }
  const r: RoomScan = { k, days: [...days].map(([key, [u, a]]) => [key, u, a]), quotes }; perRoom.set(c.id, r); return r;
}
async function scan(list: Chat[]): Promise<Scan> {
  const days: Scan['days'] = new Map(), quotes: Quote[] = [], since = Date.now() - WINDOW;
  for (const c of list) {
    const r = await scanRoom(c, since); if (!r) continue;
    for (const [k, u, a] of r.days) { const d = days.get(k) || { user: 0, ai: 0 }; d.user += u; d.ai += a; days.set(k, d); }
    quotes.push(...r.quotes);
  }
  // 예제 확장 "명장면 책갈피"가 켜져 있으면 그 책갈피도 문장으로 친다
  try {
    const marks = ((await DB.get('kv', 'extdata:moments'))?.data as { marks?: Record<string, { id: string; text: string; who: string; at: number }[]> } | undefined)?.marks || {};
    for (const [chatId, rows] of Object.entries(marks)) if (S.get('chats', chatId)) for (const r of rows || []) if (r?.text && !quotes.some(q => q.msgId === r.id)) quotes.push({ chatId, msgId: r.id, text: plain(r.text), who: r.who || '', at: r.at || 0, from: 'mark' });
  } catch { /* 확장 자료가 없으면 넘어간다 */ }
  return { days, quotes };
}
/** 메시지를 한 번 훑은 결과. 방이 바뀌지 않았으면 다시 읽지 않는다 */
export function useScan(): Scan {
  const list = rooms(), key = keyOf(list), [, bump] = useState(0);
  useEffect(() => {
    if (cache?.key === key) return; let live = true;
    if (!running || runKey !== key) { runKey = key; running = scan(list); }
    const mine = running;
    void mine.then(s => { if (runKey === key) cache = { key, scan: s }; if (live) bump(n => n + 1); }).catch(e => console.warn('[책상]', e));
    return () => { live = false; };
  }, [key]);
  return cache?.scan || EMPTY;
}
