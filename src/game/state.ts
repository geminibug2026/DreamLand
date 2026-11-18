// 게임 모드의 규칙과 상태. 화면도 모델도 모르는 순수한 계산만 둔다.
// 상태는 따로 저장하지 않는다 — 시작할 때의 값에 메시지마다 붙은 변화(fx)를 차례로 더해서 구한다.
// 그래서 답변을 다시 받거나, 지우거나, 갈래를 나눠도 언제나 그 대화의 내용과 맞는다.
import type { Chat, Msg } from '../lib/types';

export type StatKey = 'str' | 'dex' | 'int' | 'cha';
export const STATS: StatKey[] = ['str', 'dex', 'int', 'cha'];
export type Diff = 'easy' | 'normal' | 'hard';
export interface GameCfg {
  on: boolean; genre: string; tone: string; diff: Diff; hero: string; goal: string;
  stats: Record<StatKey, number>; hpMax: number; gold: number; items: string[];
  /** 손으로 고친 값 (시트에서 직접 바꾼 것) */
  adj?: Fx[];
}
export type Fx =
  | { k: 'hp'; n: number } | { k: 'hpmax'; n: number } | { k: 'gold'; n: number }
  | { k: 'item'; name: string; n: number } | { k: 'quest'; title: string; done: boolean } | { k: 'place'; name: string };
export type MiniId = 'rps' | 'dice' | 'blackjack' | 'tictactoe' | 'numbers';
export const MINIS: MiniId[] = ['rps', 'dice', 'blackjack', 'tictactoe', 'numbers'];
/** 진행자가 앱에 맡긴 일: 판정 · 전투 · 미니게임 */
export type Ask =
  | { k: 'check'; stat: StatKey; dc: number; why: string }
  | { k: 'fight'; name: string; hp: number; atk: number }
  | { k: 'play'; game: MiniId; stake: string };
export type Outcome = 'win' | 'lose' | 'draw';
/** 대화에 남는 게임 기록 (시스템 메시지에 붙는다) */
export type GameRec =
  | { kind: 'start' }
  | { kind: 'check'; stat: StatKey; dc: number; die: number; mod: number; total: number; ok: boolean; crit?: 'hit' | 'miss'; why?: string; fx?: Fx[] }
  | { kind: 'fight'; name: string; outcome: 'win' | 'lose' | 'fled'; rounds: number; took: number; hp: number; hpMax: number; fx?: Fx[] }
  | { kind: 'play'; game: MiniId; outcome: Outcome; score: string; stake?: string; fx?: Fx[] };
export interface Sheet { hp: number; hpMax: number; gold: number; items: { name: string; n: number }[]; quests: { title: string; done: boolean }[]; place: string }

export type GameChat = Chat & { game?: GameCfg };
export type GameSwipe = { gfx?: Fx[]; gask?: Ask };
export type GameMsg = Msg & { gm?: GameRec };

export const PRESETS: Record<string, Record<StatKey, number>> = {
  balanced: { str: 1, dex: 1, int: 1, cha: 1 }, fighter: { str: 3, dex: 1, int: 0, cha: 0 }, rogue: { str: 0, dex: 3, int: 1, cha: 0 },
  scholar: { str: 0, dex: 0, int: 3, cha: 1 }, charmer: { str: 0, dex: 1, int: 0, cha: 3 },
};
export const newGame = (): GameCfg => ({ on: true, genre: '', tone: '', diff: 'normal', hero: '', goal: '', stats: { ...PRESETS.balanced }, hpMax: 20, gold: 10, items: [], adj: [] });
export const gameOf = (chat: Chat | null | undefined): GameCfg | null => { const g = (chat as GameChat | null | undefined)?.game; return g?.on ? g : null; };

const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();
function apply(s: Sheet, fx: Fx) {
  if (fx.k === 'hp') s.hp = Math.min(s.hpMax, Math.max(0, s.hp + fx.n));
  else if (fx.k === 'hpmax') { s.hpMax = Math.max(1, s.hpMax + fx.n); s.hp = Math.min(s.hp, s.hpMax); }
  else if (fx.k === 'gold') s.gold = Math.max(0, s.gold + fx.n);
  else if (fx.k === 'place') s.place = fx.name;
  else if (fx.k === 'item') {
    const it = s.items.find(x => same(x.name, fx.name));
    if (it) { it.n += fx.n; if (it.n <= 0) s.items.splice(s.items.indexOf(it), 1); } else if (fx.n > 0) s.items.push({ name: fx.name, n: fx.n });
  } else if (fx.k === 'quest') {
    const q = s.quests.find(x => same(x.title, fx.title));
    if (q) q.done = q.done || fx.done; else s.quests.push({ title: fx.title, done: fx.done });
  }
}
/** 지금의 시트: 시작값 + 손으로 고친 값 + 메시지마다의 변화 */
export function sheetOf(g: GameCfg, msgs: Msg[]): Sheet {
  const s: Sheet = { hp: g.hpMax, hpMax: g.hpMax, gold: g.gold, items: [], quests: [], place: '' };
  for (const name of g.items) apply(s, { k: 'item', name, n: 1 });
  for (const m of msgs as GameMsg[]) {
    for (const fx of m.gm && 'fx' in m.gm && m.gm.fx || []) apply(s, fx);
    for (const fx of (m.swipes[m.sw] as GameSwipe | undefined)?.gfx || []) apply(s, fx);
  }
  for (const fx of g.adj || []) apply(s, fx);
  return s;
}
/** 마지막 답변이 맡긴 일 (그 뒤에 무엇이든 이어졌으면 끝난 것) */
export function pendingAsk(msgs: Msg[]): Ask | null {
  const m = msgs[msgs.length - 1]; if (!m || m.role !== 'assistant') return null;
  return (m.swipes[m.sw] as GameSwipe | undefined)?.gask || null;
}

// ── 진행자가 쓰는 표시 ──
const TAG = /\[\s*(hp|maxhp|gold|item|quest|place|check|fight|play)\b[\s:：]*([^[\]\n]{0,200})\]/gi;
const STAT_ALIAS: Record<string, StatKey> = { str: 'str', strength: 'str', 힘: 'str', 근력: 'str', 力量: 'str', dex: 'dex', dexterity: 'dex', agi: 'dex', 민첩: 'dex', 敏捷: 'dex', int: 'int', intelligence: 'int', wis: 'int', 지능: 'int', 智力: 'int', cha: 'cha', charisma: 'cha', 매력: 'cha', 魅力: 'cha' };
const MINI_ALIAS: Record<string, MiniId> = { rps: 'rps', dice: 'dice', blackjack: 'blackjack', tictactoe: 'tictactoe', 'tic-tac-toe': 'tictactoe', ttt: 'tictactoe', numbers: 'numbers', baseball: 'numbers' };
const num = (s: string) => { const m = s.replace(/[−–]/g, '-').match(/[+-]?\s*\d+/); return m ? parseInt(m[0].replace(/\s+/g, ''), 10) : NaN; };
const clampN = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

/** 답변에서 표시를 읽어 변화와 맡긴 일을 꺼내고, 글에서는 지운다 */
export function readTags(text: string): { text: string; fx: Fx[]; ask: Ask | null } {
  const fx: Fx[] = []; let ask: Ask | null = null;
  const out = String(text || '').replace(TAG, (all, key: string, rest: string) => {
    const k = key.toLowerCase(), v = rest.trim();
    if (k === 'hp' || k === 'gold' || k === 'maxhp') { const n = num(v); if (!isFinite(n) || !n) return ''; fx.push({ k: k === 'maxhp' ? 'hpmax' : k, n: clampN(n, -9999, 9999) }); return ''; }
    if (k === 'item') {
      const m = v.match(/^([+-−–])\s*(.+?)(?:\s*[x×*]\s*(\d+))?$/); if (!m) return all;
      const name = m[2].trim().slice(0, 60); if (!name) return all;
      fx.push({ k: 'item', name, n: (m[1] === '+' ? 1 : -1) * clampN(parseInt(m[3] || '1', 10) || 1, 1, 999) }); return '';
    }
    if (k === 'quest') {
      const done = /^(done|complete|completed|✓|✔|-)\s*[:：]?\s*/i.test(v), title = v.replace(/^(done|complete|completed|new|✓|✔|\+|-)\s*[:：]?\s*/i, '').trim().slice(0, 100);
      if (!title) return all; fx.push({ k: 'quest', title, done }); return '';
    }
    if (k === 'place') { if (!v) return all; fx.push({ k: 'place', name: v.slice(0, 60) }); return ''; }
    if (k === 'check') {
      const m = v.match(/^([^\s\d:：]+)\s*(?:dc\s*)?(\d+)?\s*[:：]?\s*(.*)$/i), stat = m && STAT_ALIAS[m[1].toLowerCase()]; if (!m || !stat) return all;
      ask = { k: 'check', stat, dc: clampN(parseInt(m[2] || '12', 10), 2, 30), why: (m[3] || '').trim().slice(0, 120) }; return '';
    }
    if (k === 'fight') {
      const hp = v.match(/\bhp\s*[=:]?\s*(\d+)/i), atk = v.match(/\batk\s*[=:]?\s*(\d+)/i), name = v.replace(/\b(hp|atk)\s*[=:]?\s*\d+/gi, '').replace(/[,·|]+/g, ' ').trim().slice(0, 40);
      if (!name) return all; ask = { k: 'fight', name, hp: clampN(parseInt(hp?.[1] || '12', 10), 1, 200), atk: clampN(parseInt(atk?.[1] || '3', 10), 0, 20) }; return '';
    }
    const m = v.match(/^([a-z-]+)\s*[:：]?\s*(.*)$/i), game = m && MINI_ALIAS[m[1].toLowerCase()]; if (!m || !game) return all;
    ask = { k: 'play', game, stake: (m[2] || '').trim().slice(0, 120) }; return '';
  });
  return { text: fx.length || ask ? out.replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim() : out, fx, ask };
}
/** 화면에서만 가린다 (받는 중에는 아직 닫히지 않은 표시도) */
export const hideTags = (text: string, streaming: boolean) => {
  let s = text.replace(TAG, '');
  if (streaming) s = s.replace(/\[\s*(hp|maxhp|gold|item|quest|place|check|fight|play)\b[^\]\n]*$/i, '');
  return s;
};

// ── 주사위 ──
export const d = (sides: number) => { const a = new Uint32Array(1); crypto.getRandomValues(a); return 1 + (a[0] % sides); };
export function rollCheck(g: GameCfg, stat: StatKey, dc: number) {
  const die = d(20), mod = g.stats[stat] || 0, total = die + mod;
  const crit = die === 20 ? 'hit' as const : die === 1 ? 'miss' as const : undefined;
  return { die, mod, total, ok: crit === 'hit' ? true : crit === 'miss' ? false : total >= dc, crit };
}
export const DIFF_HIT: Record<Diff, number> = { easy: .7, normal: 1, hard: 1.3 };
export const isPotion = (name: string) => /potion|elixir|포션|물약|회복약|药水|藥水/i.test(name);

// ── 모델에게 알려 주는 글 ──
const sign = (n: number) => (n >= 0 ? '+' : '') + n;
export function rulesPrompt(g: GameCfg): string {
  const diff = g.diff === 'easy' ? 'Be generous: prefer DC 8–12, give second chances, keep fights short.' : g.diff === 'hard' ? 'Be demanding: prefer DC 13–18, make mistakes cost something, enemies hit hard.' : 'Keep it fair: most checks DC 10–14.';
  return `[Game mode]
Besides playing your role, you run this as a tabletop adventure for {{user}}${g.genre ? ` — genre: ${g.genre}` : ''}${g.tone ? `, tone: ${g.tone}` : ''}.${g.hero ? ` {{user}} plays: ${g.hero}.` : ''}${g.goal ? ` The adventure's goal: ${g.goal}.` : ''}
Describe the scene, offer real choices with consequences, and let {{user}} decide. Never decide {{user}}'s actions, never roll dice, and never state the result of a roll yourself — the app rolls and reports it.
{{user}}'s stats are modifiers added to a d20: STR, DEX, INT, CHA.
When something changes, write the matching tag on its own line at the end of the reply. The app applies it to {{user}}'s sheet and hides it:
[hp -3]  [hp +5]  [gold +10]  [gold -4]  [item +Torch]  [item +Arrow x5]  [item -Rusty key]  [quest +Find the missing bell]  [quest done: Find the missing bell]  [place Old Mill]
To hand something to the app, use ONE of these as the very last line, then stop — do not narrate what happens next:
[check DEX 12: slipping past the guard] — whenever the outcome is uncertain and failing would be interesting. Guide: easy 8, normal 12, hard 16, heroic 20.
[fight Goblin hp=12 atk=3] — a fight the app runs round by round. Guide: weak hp 8 atk 2, tough hp 18 atk 4, boss hp 30 atk 6.
[play rps: who pays for dinner] — settle something with a quick game against you: rps, dice, blackjack, tictactoe or numbers.
${diff}
The result comes back as a bracketed line; narrate from there and honor it. Do not change the sheet without a tag, and do not show the tags' meaning to {{user}}.`;
}
export function sheetPrompt(g: GameCfg, s: Sheet): string {
  const items = s.items.map(i => i.n > 1 ? `${i.name} x${i.n}` : i.name).join(', ') || 'nothing', open = s.quests.filter(q => !q.done).map(q => q.title), done = s.quests.filter(q => q.done).map(q => q.title);
  return `[{{user}}'s sheet — HP ${s.hp}/${s.hpMax}${s.hp <= 0 ? ' (down: cannot act until helped or healed)' : ''} · Gold ${s.gold} · STR ${sign(g.stats.str)} DEX ${sign(g.stats.dex)} INT ${sign(g.stats.int)} CHA ${sign(g.stats.cha)} · Carrying: ${items}${open.length ? ` · Quests: ${open.join('; ')}` : ''}${done.length ? ` · Finished: ${done.join('; ')}` : ''}${s.place ? ` · Place: ${s.place}` : ''}]`;
}
const STAT_EN: Record<StatKey, string> = { str: 'STR', dex: 'DEX', int: 'INT', cha: 'CHA' };
const MINI_EN: Record<MiniId, string> = { rps: 'rock-paper-scissors', dice: 'a dice duel', blackjack: 'blackjack', tictactoe: 'tic-tac-toe', numbers: 'the number-guessing game (bulls and cows)' };
/** 기록 메시지의 글 (프롬프트에 들어간다) */
export function recText(r: GameRec, user: string, foe: string): string {
  if (r.kind === 'start') return `The game begins. Open the first scene for ${user}.`;
  if (r.kind === 'check') return `${STAT_EN[r.stat]} check${r.why ? ` (${r.why})` : ''}: d20 ${r.die} ${sign(r.mod)} = ${r.total} vs DC ${r.dc} → ${r.crit === 'hit' ? 'CRITICAL SUCCESS' : r.crit === 'miss' ? 'CRITICAL FAILURE' : r.ok ? 'success' : 'failure'}`;
  if (r.kind === 'fight') return `Fight with ${r.name}: ${r.outcome === 'win' ? `${user} won` : r.outcome === 'fled' ? `${user} got away` : `${user} was beaten and is down`} after ${r.rounds} round${r.rounds === 1 ? '' : 's'}, taking ${r.took} damage (HP ${r.hp}/${r.hpMax}).`;
  return `${user} and ${foe} played ${MINI_EN[r.game]}${r.stake ? ` (at stake: ${r.stake})` : ''}: ${r.outcome === 'win' ? `${user} won` : r.outcome === 'lose' ? `${foe} won` : 'a draw'}${r.score ? ` — ${r.game === 'numbers' ? 'guesses used ' : ''}${r.score}` : ''}.`;
}
