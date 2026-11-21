// 성좌 도감의 살림: kv 의 'atlas' 한 줄을 읽고 쓰고, 방들을 훑어 숫자판을 만들고, 문턱을 넘은 별을 켠다. 모델은 부르지 않는다
// 한 번 켜진 별은 꺼지지 않는다 — 답을 넘기거나 방을 지워도 그날 있었던 일은 남는다 (훑어 둔 숫자만 버린다)
import { DB, S, emit, on } from '../lib/core';
import type { Chat, Msg } from '../lib/types';
import { daysTogether } from '../lib/together';
import { CONS, MILES, STARS } from './defs';
import { emptyStat, roomBits, scan, tally, tierOf } from './stat';
import type { AtlasCfg, AtlasRec, Fresh, Lit, MsgStat, Tally } from './types';

const KEY = 'atlas';
const blank = (): AtlasRec => ({ id: KEY, v: 1, got: {}, per: {}, fresh: [], scan: {}, born: 0 });
export const A: { rec: AtlasRec; loaded: boolean; busy: boolean } = { rec: blank(), loaded: false, busy: false };
/** 설정 (S.settings.atlas). 카드와 소리는 켜짐, 캐릭터에게 알리기는 꺼짐이 기본 */
export const cfg = (): AtlasCfg => { const st = S.settings as unknown as { atlas?: Partial<AtlasCfg> }; return (st.atlas = { card: true, sound: true, tell: false, ...(st.atlas || {}) }) as AtlasCfg; };

let ready: Promise<void> | null = null;
export const load = () => ready ||= (async () => {
  try { const r = await DB.get('kv', KEY) as Partial<AtlasRec> | undefined; if (r) A.rec = { ...blank(), ...r, id: KEY, v: 1 }; } catch (e) { console.warn('[성좌 도감] 읽기', e); }
  A.loaded = true;
})();
let saveT = 0;
const persist = () => { clearTimeout(saveT); saveT = window.setTimeout(() => void DB.put('kv', A.rec).catch(e => console.warn('[성좌 도감] 저장', e)), 400); };

// ── 훑기 ──
const rooms = () => S.chats.filter(c => !c.temp);
const sigOf = (c: Chat) => `${c.updatedAt || 0}|${c.count || 0}`;
const byId = (id: string) => S.get('chats', id);
/** 갈래 방은 원래 방에서 베껴 온 앞부분을 세지 않는다 (원래 방이 남아 있을 때만) */
const skipOf = (c: Chat) => c.parent && byId(c.parent.id) ? c.parent.at || 0 : 0;
const memCount = async (id: string) => { try { return ((await DB.get('mem', id)) as { memories?: unknown[] } | undefined)?.memories?.length || 0; } catch { return 0; } };
/** 방 하나를 다시 센다 (msgs 를 주면 저장소를 읽지 않는다) */
export async function touch(chat: Chat, msgs?: Msg[]) {
  if (chat.temp) return;
  const list = msgs || await S.msgs(chat.id);
  A.rec.scan[chat.id] = { sig: sigOf(chat), s: scan(list, skipOf(chat), await memCount(chat.id)) };
}
/** 바뀐 방만 다시 읽는다. 한 번에 몰아 읽지 않게 방 몇 개마다 숨을 돌린다 */
export async function rescan(force = false) {
  await load(); let n = 0;
  for (const c of rooms()) {
    if (!force && A.rec.scan[c.id]?.sig === sigOf(c)) continue;
    try { await touch(c); } catch (e) { console.warn('[성좌 도감] 훑기', c.id, e); }
    if (++n % 6 === 0) await new Promise(r => setTimeout(r, 0));
  }
  for (const id of Object.keys(A.rec.scan)) if (!byId(id)) delete A.rec.scan[id];
  if (n) persist();
}

// ── 숫자판 ──
const rowsOf = (list: Chat[]) => list.map(c => ({ s: A.rec.scan[c.id]?.s || emptyStat(), b: roomBits(c, byId) }));
/** 한 사람과의 숫자판: 그 사람이 있는 방만 */
export function charTally(charId: string): Tally {
  const T = tally(rowsOf(rooms().filter(c => c.charIds?.includes(charId))));
  T.days = T.turns ? daysTogether(charId) : 0; return T;
}
/** 전체 숫자판 */
export function worldTally(): Tally {
  const T = tally(rowsOf(rooms())), met = new Set<string>(); let daysMax = 0, circle = 0;
  for (const c of rooms()) if ((A.rec.scan[c.id]?.s.turns || 0) > 0) for (const id of c.charIds || []) met.add(id);
  for (const id of met) { if (!S.get('chars', id)) continue; const d = daysTogether(id); daysMax = Math.max(daysMax, d); if (d >= 30) circle++; }
  return Object.assign(T, { nChars: S.chars.length, personas: S.personas.length, masked: S.personas.filter(p => (p.description || '').trim()).length, lore: S.lore.length, entries: S.lore.reduce((n, l) => n + (l.entries?.length || 0), 0), met: met.size, daysMax, circle });
}

// ── 별 켜기 ──
export const tierNow = (id: string) => A.rec.got[id]?.length || 0;
export const conDone = (conId: string) => !!CONS.find(c => c.id === conId)?.stars.every(s => tierNow(s.id) > 0);
export const litCount = () => STARS.filter(s => tierNow(s.id) > 0).length;
export const doneCount = () => CONS.filter(c => conDone(c.id)).length;
/** 최근에 켜진 별 (가장 최근 단계가 켜진 때 순) */
export const recent = (n = 3) => STARS.map(s => ({ s, at: A.rec.got[s.id]?.[tierNow(s.id) - 1] || 0, tier: tierNow(s.id) })).filter(x => x.at).sort((a, b) => b.at - a.at).slice(0, n);

/**
 * 숫자판을 문턱에 대 보고 새로 넘은 별을 켠다. quiet 면 알리지 않는다 (처음 도감을 만들 때 옛 기록을 한꺼번에 켜는 경우).
 * chat 은 지금 일이 일어난 방 — 그 방 사람들의 별자리만 본다. all 이면 모든 사람을 본다 (앱을 열 때 한 번).
 */
export function evaluate({ quiet = false, chat, all = false }: { quiet?: boolean; chat?: Chat | null; all?: boolean } = {}): Lit[] {
  if (!A.loaded) return [];
  const now = Date.now(), W = worldTally(), lit: Lit[] = [], r = A.rec;
  for (const c of CONS) {
    const was = conDone(c.id); let hit = false;
    for (const s of c.stars) {
      const tier = tierOf(W[s.m] || 0, s.at), have = tierNow(s.id); if (tier <= have) continue;
      r.got[s.id] = [...(r.got[s.id] || []), ...Array(tier - have).fill(now)]; hit = true;
      lit.push({ kind: 'star', id: s.id, tier, con: c.id });
    }
    if (hit && !was && conDone(c.id)) lit[lit.length - 1].done = true;
  }
  const who = chat ? chat.charIds || [] : all ? S.chars.map(c => c.id) : [];
  for (const id of who) {
    if (!S.get('chars', id)) continue;
    const T = charTally(id); if (!T.turns) continue; const mine = r.per[id] ||= {};
    for (const m of MILES) {
      if (mine[m.id] || (T[m.m] || 0) < m.at) continue;
      mine[m.id] = now; lit.push({ kind: 'mile', id: m.id, tier: 1, charId: id });
      if (!quiet && m.fact) r.fresh = [...r.fresh.filter(f => !(f.charId === id && f.mile === m.id)), { charId: id, mile: m.id, at: now }].slice(-12);
    }
  }
  if (lit.length) { persist(); emit('atlas:changed'); if (!quiet) emit('atlas:lit', lit); }
  return lit;
}

// ── 캐릭터에게 알리기 ──
/** 이 방의 그 사람에게 아직 말하지 않은 별 하나 (1:1 방에서만. 열흘 넘게 묵은 것은 버린다) */
export function freshFor(chat: Chat | null | undefined): Fresh | null {
  if (!chat || chat.charIds?.length !== 1) return null;
  return A.rec.fresh.find(f => f.charId === chat.charIds[0] && Date.now() - f.at < 10 * 86400000) || null;
}
export const factOf = (f: Fresh) => MILES.find(m => m.id === f.mile)?.fact || '';
/** 한 번 실어 보냈으면 지운다 */
export function spend(f: Fresh) { A.rec.fresh = A.rec.fresh.filter(x => x !== f && !(x.charId === f.charId && x.mile === f.mile)); persist(); }

// ── 시작과 사건 ──
let t = 0, pending: Chat | null = null;
/** 일이 생기면 조금 뒤(여러 사건을 한 번으로 모아) 그 방을 다시 세고 별을 본다 */
export function poke(chat?: Chat | null, msgs?: Msg[]) {
  if (chat) pending = chat; clearTimeout(t);
  t = window.setTimeout(async () => {
    const c = pending; pending = null; if (!A.loaded) return;
    try { if (c && byId(c.id)) await touch(c, msgs); persist(); evaluate({ chat: c }); } catch (e) { console.warn('[성좌 도감]', e); }
  }, 700);
}
/** 앱을 열었을 때 한 번: 바뀐 방을 훑고 전부 대 본다. 도감을 처음 만드는 날에는 옛 기록의 별을 조용히 켜고 몇 개인지만 알린다 */
export async function boot() {
  if (A.busy) return; A.busy = true;
  try {
    await load(); const first = !A.rec.born; await rescan();
    const lit = evaluate({ quiet: first, all: true });
    if (first) { A.rec.born = Date.now(); persist(); const n = lit.filter(l => l.kind === 'star').length; if (n) emit('atlas:lit', [{ kind: 'many', id: '', tier: 0, n }] as Lit[]); }
  } finally { A.busy = false; emit('atlas:changed'); }
}
/** 방이 지워지면 훑어 둔 숫자를 버린다 (켜진 별은 남는다) */
export function wire() {
  on<string>('chat:deleted', id => { if (A.rec.scan[id]) { delete A.rec.scan[id]; persist(); } });
  on('data:imported', () => { ready = null; A.loaded = false; void boot(); });
}
/** 도감을 비운다 (다시 훑으면 지금 기록으로 켜질 것은 다시 켜진다) */
export async function reset() { A.rec = { ...blank(), born: Date.now() }; await DB.put('kv', A.rec); await rescan(true); evaluate({ quiet: true, all: true }); emit('atlas:changed'); }
export type { MsgStat };
