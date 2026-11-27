// 휴대폰 설정 (S.settings.phone): 테마 · 배경 · 위젯 배치 · 숨긴 알림. 휴대폰 화면만 쓰고, 모델에게 가는 글에는 어디에도 실리지 않는다
import { useSyncExternalStore } from 'react';
import { DB, S } from '../lib/core';

export type ThemeId = 'soft' | 'frost' | 'mono' | 'night';
export const THEMES: ThemeId[] = ['soft', 'frost', 'mono', 'night'];
export type GaugeKind = 'auto' | 'day' | 'together' | 'tracker';
export interface Prefs {
  theme: ThemeId;
  /** 배경: theme(테마 기본) · g:<그러데이션> · char:<캐릭터 id> · il:<삽화 id> · photo(올린 사진) */
  wall: string;
  /** 위젯이 보여 줄 사람 (비우면 연 자리의 대화 상대 → 가장 최근에 이야기한 사람) */
  fav: string;
  /** 첫 쪽 · 둘째 쪽의 위젯 차례 */
  w1: string[]; w2: string[];
  /** 휴대폰 알림에서 숨긴 대화방 */
  muted: string[];
  /** 방마다: 이 시각 전의 부재중 전화는 읽은 것으로 */
  seenCalls: Record<string, number>;
  /** 연 대화에 이야기 시계가 있으면 그 시각을 쓴다 */
  story: boolean;
  /** 잠금 화면 알림에 글 내용을 보인다 */
  previews: boolean;
  /** 화면 밝기 (0.45 ~ 1) */
  bright: number;
  gauge: GaugeKind;
  /** 마지막으로 튼 곡 (음악 위젯이 다음에 열 때 보여 준다) */
  lastSong: { id: string; name: string } | null;
}
/** 첫 쪽은 4칸 격자 여섯 줄을 빈칸 없이 채우는 차례, 둘째 쪽은 앱 한 줄 밑에 */
export const W1 = ['clock', 'gauge', 'call', 'photos', 'status', 'days', 'latest', 'note', 'calendar', 'music'];
export const W2 = ['today', 'photo', 'promise', 'lastcall'];
const DEF: Prefs = { theme: 'soft', wall: 'theme', fav: '', w1: W1, w2: W2, muted: [], seenCalls: {}, story: true, previews: true, bright: 1, gauge: 'auto', lastSong: null };

const subs = new Set<() => void>(); let ver = 0, cache: { v: number; raw: unknown; p: Prefs } | null = null;
const stored = () => (S.settings as { phone?: Partial<Prefs> }).phone;
/** 지금 설정 (빠진 칸은 기본값) */
export function prefs(): Prefs {
  const raw = stored(); if (cache && cache.v === ver && cache.raw === raw) return cache.p;
  const p = { ...DEF, ...(raw || {}) } as Prefs;
  if (!THEMES.includes(p.theme)) p.theme = 'soft';
  if (!p.seenCalls || typeof p.seenCalls !== 'object') p.seenCalls = {};
  cache = { v: ver, raw, p }; return p;
}
export function setPrefs(patch: Partial<Prefs>) {
  S.set({ phone: { ...(stored() || {}), ...patch } });
  ver++; subs.forEach(f => f());
}
export const usePrefs = (): Prefs => { useSyncExternalStore(f => { subs.add(f); return () => { subs.delete(f); }; }, () => ver); return prefs(); };

// ── 올린 배경 사진: 설정에 넣지 않고 kv 한 줄로 (설정을 저장할 때마다 큰 그림을 다시 쓰지 않게) ──
const WALL_KEY = 'phone:wall';
export const loadWallPhoto = async (): Promise<string> => { try { return String(((await DB.get('kv', WALL_KEY)) as { data?: string } | undefined)?.data || ''); } catch { return ''; } };
export const saveWallPhoto = (data: string) => DB.put('kv', { id: WALL_KEY, data });
