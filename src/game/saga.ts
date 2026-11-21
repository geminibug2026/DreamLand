// 캠페인 뼈대: 게임을 시작할 때 한 번의 요청으로 받아 두는, 진행자만 아는 이야기의 설계도.
// 비밀 줄거리 · 반전 · 압박 시계 · 세력 · 퀘스트 씨앗 · 시작 인물 · 시작 지도. 여기에는 프롬프트와 읽는 법만 둔다 (요청은 화면 쪽이 한다).
import type { Fx, GameCfg } from './state';

export interface Twist { truth: string; clue: string; cover: string; trigger: string }
export interface Saga { plot: string; twists: Twist[]; clocks: { name: string; max: number; note: string }[]; factions: { name: string; wants: string; method: string }[]; seeds: string[]; npcs: { name: string; role: string; wants: string; secret: string }[]; map: { name: string; note: string; links: string[] }[]; at: number }

export const SAGA_PROMPT = `You design the hidden skeleton of a tabletop campaign for one player. The game master will read it; the player never will.
Answer with one JSON object and nothing else. Write every string in the language of the brief. Be specific — names, places, motives — and keep each string to one or two sentences.
{"plot": "what is really going on underneath, and where it is heading if nobody interferes (3–5 sentences)",
 "twists": [{"truth": "a hidden fact", "clue": "the first small sign of it the player could notice", "cover": "the false explanation people believe", "trigger": "what makes the truth come out"}],
 "clocks": [{"name": "a short name for a pressure that grows", "max": 6, "note": "what happens when it fills"}],
 "factions": [{"name": "", "wants": "", "method": "how they go about it"}],
 "seeds": ["a concrete job, rumour or problem that could become a quest"],
 "npcs": [{"name": "", "role": "who they are", "wants": "what they want from the player", "secret": "what they are not saying"}],
 "map": [{"name": "a short place name (2–4 words)", "note": "what it is like", "links": ["names of the places it connects to"]}]}
Sizes: 2–3 twists, 0–2 clocks, 0–2 factions, at most 3 seeds, 2–5 npcs, 3–6 places (the first place is where the story opens; every place links to at least one other).
If the brief asks for something gentle — slice of life, cozy, romance without danger — leave twists, clocks and factions as empty lists and make the plot a quiet through-line instead of a conspiracy. Never contradict the brief.`;
export const sagaBrief = (g: GameCfg, char: string, user: string, about: string) => `Genre: ${g.genre || 'unspecified'}\nTone: ${g.tone || 'unspecified'}\nThe player (${user}) plays: ${g.hero || 'unspecified'}\nGoal of the adventure: ${g.goal || 'unspecified'}\nDifficulty: ${g.diff}\nThe game master also plays: ${char}${about ? `\nAbout ${char}: ${about.slice(0, 1500)}` : ''}${g.secret?.trim() ? `\nThe player's own notes for the game master (build on these, do not replace them): ${g.secret.trim().slice(0, 1500)}` : ''}`;

const str = (v: unknown, n = 400) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, n);
const arr = (v: unknown): Record<string, unknown>[] => Array.isArray(v) ? v.filter(x => x && typeof x === 'object') as Record<string, unknown>[] : [];
/** 조금 깨진 JSON 을 손본다: 코드 울타리 · 앞뒤의 말 · 둥근 따옴표 · 끝에 남은 쉼표 */
export function looseJson(raw: string): unknown {
  let s = raw.replace(/```(?:json)?/gi, '').trim(); const a = s.indexOf('{'), b = s.lastIndexOf('}'); if (a < 0 || b <= a) throw new Error('no JSON object');
  s = s.slice(a, b + 1);
  try { return JSON.parse(s); } catch { /* 손봐서 다시 */ }
  return JSON.parse(s.replace(/[“”]/g, '"').replace(/,\s*([}\]])/g, '$1'));
}
/** 받은 답을 뼈대로 읽는다. 못 읽으면 던진다 (화면이 "고쳐서 다시" 창을 띄운다) */
export function readSaga(raw: string): Saga {
  const o = looseJson(raw) as Record<string, unknown>, plot = str(o.plot, 1500); if (!plot) throw new Error('missing "plot"');
  return {
    plot, at: Date.now(),
    twists: arr(o.twists).map(t => ({ truth: str(t.truth), clue: str(t.clue), cover: str(t.cover), trigger: str(t.trigger) })).filter(t => t.truth).slice(0, 3),
    clocks: arr(o.clocks).map(c => ({ name: str(c.name, 40), max: Math.min(12, Math.max(2, Math.round(Number(c.max)) || 6)), note: str(c.note) })).filter(c => c.name).slice(0, 2),
    factions: arr(o.factions).map(f => ({ name: str(f.name, 60), wants: str(f.wants), method: str(f.method) })).filter(f => f.name).slice(0, 2),
    seeds: (Array.isArray(o.seeds) ? o.seeds : []).map(x => str(x)).filter(Boolean).slice(0, 3),
    npcs: arr(o.npcs).map(n => ({ name: str(n.name, 40), role: str(n.role), wants: str(n.wants), secret: str(n.secret) })).filter(n => n.name).slice(0, 5),
    map: arr(o.map).map(p => ({ name: str(p.name, 60), note: str(p.note), links: (Array.isArray(p.links) ? p.links : []).map(x => str(x, 60)).filter(Boolean).slice(0, 4) })).filter(p => p.name).slice(0, 6),
  };
}
/** 진행자에게 건네는 글 (규칙 프롬프트에 붙는다) */
export function sagaPrompt(s: Saga): string {
  const L: string[] = [`Campaign skeleton — for your eyes only. Never state any of it outright; steer by it, foreshadow it, and let {{user}} uncover it through play. Change it when {{user}}'s choices make a better story.`, `What is really going on: ${s.plot}`];
  s.twists.forEach((t, i) => L.push(`Twist ${i + 1}: ${t.truth} — first sign: ${t.clue}; what people believe instead: ${t.cover}; it comes out when: ${t.trigger}`));
  if (s.clocks.length) L.push(`Pressures (start each with a [clock] tag when it first makes itself felt, and advance it when {{user}} dawdles or fails): ${s.clocks.map(c => `${c.name} 0/${c.max} — when full: ${c.note}`).join(' | ')}`);
  if (s.factions.length) L.push(`Factions: ${s.factions.map(f => `${f.name} want ${f.wants} (${f.method})`).join(' | ')}`);
  if (s.seeds.length) L.push(`Quest seeds (offer them through people and events, never as a list): ${s.seeds.join(' | ')}`);
  if (s.npcs.length) L.push(`People to bring in (use [npc Name: …] with only what {{user}} can see when each first appears): ${s.npcs.map(n => `${n.name} — ${n.role}; wants ${n.wants}; hides ${n.secret}`).join(' | ')}`);
  if (s.map.length) L.push(`Places (use these exact names in [place] and [path]): ${s.map.map(p => `${p.name} — ${p.note}`).join(' | ')}. The story opens at ${s.map[0].name}.`);
  return L.join('\n');
}
/** 시작 지도를 시트에 깐다: 길만 알려 두고(가 보지 않은 곳으로), 어디에 있는지는 진행자가 정한다 */
export function sagaPaths(s: Saga): Fx[] {
  const out: Fx[] = [], seen = new Set<string>(), names = new Map(s.map.map(p => [p.name.toLowerCase(), p.name]));
  for (const p of s.map) for (const l of p.links) { const b = names.get(l.toLowerCase()); if (!b || b === p.name) continue; const k = [p.name, b].sort().join('\u0001'); if (!seen.has(k)) { seen.add(k); out.push({ k: 'path', a: p.name, b }); } }
  return out;
}

// ── 보스의 각본 (설정에서 켰을 때만 · 전투가 시작될 때 요청 한 번) ──
export type BossMove = 'slam' | 'rush' | 'ward' | 'rally';
export interface BossScript { open: string; beats: { at: 75 | 50 | 25; say: string; prefer: BossMove }[]; fall: string }
export const BOSS_PROMPT = `A boss fight is about to start in a tabletop game. Give the boss a voice and a plan. The app runs the fight; you only write the script.
Answer with one JSON object and nothing else, lines in the language of the story, each line under 90 characters, in character, no stage directions:
{"open": "what the boss says as the fight begins",
 "beats": [{"at": 75, "say": "a line when its health drops below 75%", "prefer": "slam"}, {"at": 50, "say": "…", "prefer": "rush"}, {"at": 25, "say": "…", "prefer": "ward"}],
 "fall": "its last words"}
"prefer" is the move the boss leans on from that point, one of: slam (a slow, telegraphed heavy blow around its target), rush (close the distance and strike twice, lightly), ward (brace: take half damage this round and recover a little), rally (drive its allies on: they all strike harder this round). Pick moves that fit who this boss is and let the lines show it changing as it is worn down.`;
const MOVES: BossMove[] = ['slam', 'rush', 'ward', 'rally'];
export function readBoss(raw: string): BossScript {
  const o = looseJson(raw) as Record<string, unknown>;
  const beats = arr(o.beats).map(b => ({ at: ([75, 50, 25] as const).find(n => n === Number(b.at)) || 50, say: str(b.say, 120), prefer: MOVES.includes(b.prefer as BossMove) ? b.prefer as BossMove : 'slam' })).filter(b => b.say).slice(0, 3);
  return { open: str(o.open, 120), beats, fall: str(o.fall, 120) };
}
