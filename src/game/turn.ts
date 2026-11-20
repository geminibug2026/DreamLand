// 차례의 이음매: 내가 말을 보낼 때(만남 · 눈썰미를 굴린다), 답장이 올 때(갈라 쓴 판정을 풀고 굴림 자리를 채운다), 프롬프트를 만들 때(그 차례의 알림을 싣는다).
// 계산은 oneshot · omens · mood · bonds 의 순수 함수가 하고, 여기서는 그것을 메시지에 붙이고 떼는 일만 한다.
import type { Chat, Msg } from '../lib/types';
import type { PromptPiece } from '../lib/hooks';
import { chatApi } from '../chat/actions';
import { fillSlots, resolveReply, trimBroken, veil, type CheckAsk, type RollRec, type SlotCtx } from './oneshot';
import { encPrompt, missPrompt, missingItems, rng, rollEncounter, rollSights, seePrompt } from './omens';
import { moodEdge, moodTier } from './mood';
import { marksPrompt } from './bonds';
import { sagaPrompt } from './saga';
import { STAT_ALIAS, checkHelp, d, gameOf, modOf, readTags, rollCheck, ruleOf, sceneOf, sheetOf, weatherOf, type Fx, type GameCfg, type GameMsg, type GameSwipe, type Sheet, type TurnOmen } from './state';

type Sw = Msg['swipes'][number] & GameSwipe;
const INDOOR = ['hall', 'tavern', 'room', 'castle', 'station'];
export const indoorAt = (s: Sheet) => INDOOR.includes(sceneOf(s));

/** 판정 하나를 굴린다: 사기의 보정을 얹고, 대실패는 운명 점 하나, 기세가 오른 날의 성공은 넷에 한 번 운명 점을 돌려준다 */
export function rollWithMood(g: GameCfg, ask: CheckAsk, sh: Sheet) {
  const edge = moodEdge(sh.morale), r = rollCheck(g, ask, sh.level, edge), fx: Fx[] = [];
  if (r.grade === 'fumble') fx.push({ k: 'fate', n: 1 }); else if (r.ok && moodTier(sh.morale) === 4 && sh.fate < 5 && d(4) === 4) fx.push({ k: 'fate', n: 1 });
  return { ...r, ...(fx.length ? { fx } : {}) };
}
const slotCtx = (g: GameCfg, sh: Sheet): SlotCtx => ({ d, mod: w => { const k = w.toLowerCase(), st = STAT_ALIAS[k]; return st ? modOf(g, st) : /^(level|lv|lvl|레벨|等级)$/.test(k) ? sh.level : /^(prof|proficiency|숙련)$/.test(k) ? 2 + Math.floor((sh.level - 1) / 4) : null; } });

/** 답장의 표시를 읽어 그 답장(스와이프)에 붙이고 글에서는 지운다. 바뀐 것이 있으면 true */
export function settle(sw: Sw): ReturnType<typeof readTags> & { changed: boolean } {
  const r = readTags(sw.text), changed = !!(r.fx.length || r.ask || r.choices.length || r.cine.length);
  if (changed) {
    if (r.cine.length) sw.gcine = r.cine; else delete sw.gcine;
    sw.text = r.text; if (r.fx.length) sw.gfx = r.fx; else delete sw.gfx; if (r.ask) sw.gask = r.ask; else delete sw.gask; if (r.choices.length) sw.gchoices = r.choices; else delete sw.gchoices;
  }
  return { ...r, changed };
}
/** 답장이 왔다: 갈라 쓴 판정을 굴려 한쪽만 남기고, 굴림 자리를 채운다 (표시를 읽기 전에 부른다). 이어 쓰기라면 앞서 끝난 굴림 뒤에 덧붙인다 */
export function unfold(chat: Chat, msg: Msg, sw: Sw, msgs: Msg[]): boolean {
  const g = gameOf(chat); if (!g || sw.text.indexOf('[') < 0) return false;
  const i = msgs.indexOf(msg), before = i >= 0 ? msgs.slice(0, i) : msgs, sh = sheetOf(g, before), raw = g.oneShot ? trimBroken(sw.text) : sw.text;
  // 한 번에 판정을 꺼 두었으면 갈래는 건드리지 않고 굴림 자리만 채운다
  const out = g.oneShot ? resolveReply(raw, ask => rollWithMood(g, ask, sh), slotCtx(g, sh)) : { ...fillSlots(raw, slotCtx(g, sh)), rolls: [] as RollRec[] };
  if (!out.rolls.length && !out.slots.length) { if (raw === sw.text) return false; sw.text = raw; return true; }
  const cont = !!(sw.grolls?.length || sw.gdice?.length);
  sw.text = out.text;
  if (out.rolls.length) sw.grolls = [...(sw.grolls || []), ...out.rolls];
  if (out.slots.length) sw.gdice = [...(sw.gdice || []), ...out.slots];
  if (cont || !out.rolls.length) delete sw.graw; else sw.graw = raw;
  return true;
}
/** 그 답장이 받아 쓴 차례의 굴림을 답장에 옮겨 적는다 (화면에 카드로 보여 주려고) */
export function carryOmen(msg: Msg, sw: Sw, msgs: Msg[]) {
  const i = msgs.indexOf(msg), prev = i > 0 ? msgs[i - 1] as GameMsg : null, gt = prev?.role === 'user' ? prev.gt : null;
  if (gt && (gt.enc || gt.seen?.length)) sw.gturn = { ...(gt.enc ? { enc: gt.enc } : {}), ...(gt.seen?.length ? { seen: gt.seen } : {}) }; else delete sw.gturn;
}
/** 운명 점으로 뒤집기: 마지막 답장의 실패한 판정을 다시 굴리고, 써 두었던 다른 갈래로 바꿔 끼운다 (요청은 나가지 않는다) */
export async function flipFate(chat: Chat, msg: Msg, at: number): Promise<boolean> {
  const g = gameOf(chat), { msgs } = chatApi.current(), sw = msg.swipes[msg.sw] as Sw | undefined, old = sw?.grolls?.[at];
  if (!g || !sw?.graw || !old || old.ok || old.rerolled || msgs[msgs.length - 1] !== msg || sheetOf(g, msgs).fate < 1) return false;
  const sh = sheetOf(g, msgs.slice(0, -1)), r = rollWithMood(g, old.ask, sh);
  const next: RollRec = { ...r, why: old.why, ask: old.ask, arm: old.arm, head: '', rerolled: true, fx: [...(old.fx || []), { k: 'fate', n: -1 }] };
  const out = resolveReply(sw.graw, () => { throw new Error('unexpected roll'); }, slotCtx(g, sh), { rolls: sw.grolls!.map((x, i) => i === at ? next : x), slots: sw.gdice });
  sw.text = out.text; sw.grolls = out.rolls; if (out.slots.length) sw.gdice = out.slots; else delete sw.gdice;
  delete sw.gfx; delete sw.gask; delete sw.gchoices; delete sw.gcine; delete sw.tr; settle(sw);
  await chatApi.save(); chatApi.redraw();
  return true;
}

/** 내가 말을 보냈다: 이 차례의 만남 · 눈에 띄는 것 · 없는 물건 · 흔들리는 동료를 굴려 내 메시지에 적어 둔다 */
export function castOmens(chat: Chat, msg: Msg, msgs: Msg[]) {
  const g = gameOf(chat); if (!g || msg.role !== 'user') return;
  const text = msg.swipes[msg.sw]?.text || '', i = msgs.indexOf(msg), before = i >= 0 ? msgs.slice(0, i) : msgs, sh = sheetOf(g, before), seed = g.seed || 1, gt: TurnOmen = {};
  const waiting = (before[before.length - 1]?.swipes[before[before.length - 1].sw] as GameSwipe | undefined)?.gask;   // 맡긴 일이 걸려 있는 동안에는 새 일을 얹지 않는다
  if (g.chance !== false && !waiting) {
    const recent = before.filter(m => m.role === 'user').slice(-2).some(m => !!(m as GameMsg).gt?.enc);
    const enc = rollEncounter({ seed, key: msg.id, text, place: sh.place, scene: sceneOf(sh), diff: g.diff, party: 1 + sh.party.length, level: sh.level, recent, hp: sh.hp, hpMax: sh.hpMax }); if (enc) gt.enc = enc;
  }
  if (g.keen !== false && !waiting && !gt.enc) {
    const seen = rollSights({ seed, key: msg.id, place: sh.place, scene: sceneOf(sh), time: sh.time, weather: weatherOf(sh), indoor: indoorAt(sh), passive: 10 + modOf(g, 'wis') + moodEdge(sh.morale), text }); if (seen.length) gt.seen = seen;
  }
  const miss = missingItems(text, sh.items); if (miss.length) gt.miss = miss;
  if (moodTier(sh.morale) === 0 && sh.party.length && rng(seed, 'waver:' + msg.id)() < .25) gt.waver = sh.party[Math.floor(rng(seed, 'who:' + msg.id)() * sh.party.length)];
  if (Object.keys(gt).length) (msg as GameMsg).gt = gt; else delete (msg as GameMsg).gt;
}

// ── 프롬프트 ──
const ONE_ROLL = (g: GameCfg) => `One-roll checks — the usual way to resolve a risky action in this game. You do not know the roll, so do not stop and wait: write each way it can go and the app keeps only the branch the dice choose. Narrate up to the moment of risk, then:
[check …]   (written exactly as described above)
[success] what happens if it works — two to five sentences of real narration.
[fail] what happens if it does not — just as vivid, and it must change the situation (a cost, a complication, a new danger), never a dead end.
[end]
After [end] you may go on with narration that is true either way, or stop. Keep the branches about the same length and equally committed; never hint which is likelier; never mention dice, numbers or the words "success" and "failure" inside a branch. Sheet tags that belong to one outcome ([hp -3], [item +…], [rep …]) go inside that branch. ${ruleOf(g) === '2d6' ? 'This ruleset has a third outcome, so also write [partial] — it works, but at a cost or with a complication.' : 'Optional: [crit] for a spectacular success and [fumble] for a disaster; if you leave them out the app uses [success] and [fail].'} {{user}} sees only the branch that happened, so each must read as the natural next paragraph. At most two such checks in one reply.`;
const SLOTS = `Numbers the dice should decide — damage, healing, coins found, how many, how long — are never yours to pick. Write a slot inside the sentence and the app rolls it and puts the number there: "the blast scorches you for [[2d6+3]]", "you count out [[3d10]] silver". A slot may add one of {{user}}'s stats by name: [[1d8+STR]]. To use the same number twice, name it once and refer to it: "the blades bite for [[cut: 1d6+1]] … [hp -[[cut]]]".`;
/** 규칙 프롬프트에 끼워 넣을 것: 한 번에 판정 · 굴림 자리 · 캠페인 뼈대 */
export function moreRules(g: GameCfg): { check?: string; extra: string } {
  const extra = [SLOTS, g.oneShot ? ONE_ROLL(g) : '', g.saga ? sagaPrompt(g.saga) : ''].filter(Boolean).join('\n');
  return g.oneShot ? { check: `${checkHelp(g)} Written bare like this and as the last line, it makes the app wait for {{user}} to roll — keep that for the rare check whose outcome {{user}} must see before deciding anything else; otherwise use a one-roll check (below), which does not end the reply.`, extra } : { extra };
}
/** 이 요청에만 싣는 알림: 그 차례의 만남 · 눈에 띄는 것 · 없는 물건 · 떠나려는 동료 · 방금 넘은 이정표 · 내 수첩 */
export function turnPieces(g: GameCfg, msgs: Msg[], type: string): PromptPiece[] {
  const out: PromptPiece[] = [], put = (content: string, src: string) => { if (content) out.push({ where: 'end', content, src }); };
  if (g.notes?.trim()) put(`<player_notes>\nNotes {{user}} keeps for you, the game master — wishes, theories, things to remember. Read them as out-of-character guidance and honour them where the story allows; never quote them back.\n${g.notes.trim().slice(0, 2000)}\n</player_notes>`, '게임 수첩');
  if (type === 'continue') return out;
  let i = msgs.length - 1; if ((type === 'regen' || type === 'swipe') && msgs[i]?.role === 'assistant') i--;
  const me = msgs[i] as GameMsg | undefined, gt = me?.role === 'user' ? me.gt : null;
  // 이정표: 내 지난 말과 이번 말 사이에(답장 · 기록에서) 단계가 바뀐 사람들
  let from = i - 1; while (from >= 0 && msgs[from].role !== 'user') from--;
  const ids = new Set(msgs.slice(from + 1, i + 1).map(m => m.id)), sh = sheetOf(g, msgs.slice(0, i + 1));
  put(marksPrompt(sh.people.flatMap(p => p.marks.filter(m => ids.has(m.at)).slice(-1).map(m => ({ name: p.name, m })))), '게임 이정표');
  if (gt?.enc) put(encPrompt(gt.enc), '게임 만남');
  if (gt?.seen?.length) put(seePrompt(gt.seen), '게임 눈썰미');
  if (gt?.miss?.length) put(missPrompt(gt.miss, sh.items.map(x => x.name).join(', ')), '게임 소지품');
  if (gt?.waver) put(`[Morale has broken: ${gt.waver} has had enough. In this reply they say so plainly and start to leave. Unless {{user}} gives them a real reason to stay — an apology, a promise, a share, a rest — they go: write [party -${gt.waver}]. If {{user}} wins them back, write [mood rescued].]`, '게임 사기');
  return out;
}
/** 받는 중의 글: 갈래를 가리고 굴림 자리를 자리표로 바꾼다 */
export const veilText = (text: string, streaming: boolean, waitWord: string) => veil(text, streaming, `〔 ${waitWord} 〕`, e => `〔${e}〕`);
