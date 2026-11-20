// 한 번에 판정: 진행자가 결과를 모른 채 성공 · 실패를 둘 다 써 두면, 앱이 굴려서 한쪽만 남긴다. 본문 속 굴림 자리([[2d6+3]])도 여기서 채운다.
// 화면도 저장소도 모르는 순수한 계산만 둔다 — 굴리는 일은 밖에서 넘겨받는다(그래야 같은 원문을 정해진 결과로 다시 풀 수 있다).
import { readTags, hideTags, type Ask, type Fx, type Grade, type RuleId, type StatKey } from './state';

export type CheckAsk = Extract<Ask, { k: 'check' }>;
export interface Rolled { rule: RuleId; stat: StatKey; dc: number; die: number; mod: number; total: number; ok: boolean; dice: number[]; grade: Grade; note: string; crit?: 'hit' | 'miss' }
export type ArmKey = 'success' | 'fail' | 'crit' | 'fumble' | 'partial';
/** 답장 안에서 끝난 판정 하나. arm 은 남긴 갈래, head 는 그 갈래의 첫머리(화면이 자리를 찾을 때 쓴다) */
export interface RollRec extends Rolled { why: string; arm: ArmKey; head: string; fx?: Fx[]; edge?: number; rerolled?: boolean; ask: CheckAsk }
/** 본문 속 굴림 자리 하나 */
export interface SlotRec { expr: string; total: number; dice: number[]; mod: number; name?: string; miss?: string }

const ARM_WORD: Record<string, ArmKey> = { success: 'success', pass: 'success', ok: 'success', 성공: 'success', 成功: 'success', fail: 'fail', failure: 'fail', miss: 'fail', 실패: 'fail', 失败: 'fail', crit: 'crit', critical: 'crit', 대성공: 'crit', 大成功: 'crit', fumble: 'fumble', botch: 'fumble', 대실패: 'fumble', 大失败: 'fumble', partial: 'partial', mixed: 'partial', 부분: 'partial', 部分: 'partial' };
const ARM_SRC = `\\[\\s*(${Object.keys(ARM_WORD).join('|')})\\s*\\]`;
const CHECK = /\[\s*(?:check|save)\b[^[\]\n]*\]/gi, END = /\[\s*(?:end|\/check|끝|结束)\s*\]/i;
/** 갈래 끝에 붙어 있어도 어느 쪽이든 쓰일 것들 (선택지 · 맡긴 일) — [end] 를 빠뜨렸을 때 마지막 갈래가 삼키지 않게 */
const SHARED_TAIL = /\n[ \t]*\[\s*(?:choices|qte|fight|play)\b[^\n]*\]\s*$/i;

interface Block { from: number; to: number; ask: CheckAsk; arms: Partial<Record<ArmKey, string>> }
/** 원문에서 "판정 + 갈래" 묶음을 찾는다. 성공과 실패가 다 있어야 묶음으로 친다 (하나뿐이면 예전 방식의 판정으로 둔다) */
export function findBlocks(text: string): Block[] {
  const out: Block[] = []; CHECK.lastIndex = 0; let m: RegExpExecArray | null;
  while ((m = CHECK.exec(text))) {
    const after = m.index + m[0].length, first = new RegExp('^\\s*' + ARM_SRC, 'i').exec(text.slice(after)); if (!first) continue;
    const ask = readTags(m[0]).ask; if (!ask || ask.k !== 'check') continue;
    // 묶음의 끝: [end], 없으면 다음 판정 앞, 그것도 없으면 글의 끝
    const rest = text.slice(after), end = END.exec(rest), next = rest.slice(1).search(/\[\s*(?:check|save)\b/i);
    let stop = rest.length, skip = 0;
    if (end && (next < 0 || end.index < next + 1)) { stop = end.index; skip = end[0].length; } else if (next >= 0) stop = next + 1;
    let body = rest.slice(0, stop);
    if (!skip) { const tail = SHARED_TAIL.exec(body); if (tail) { body = body.slice(0, tail.index); stop = tail.index; } }
    const arms: Block['arms'] = {}, re = new RegExp(ARM_SRC, 'gi'); let a: RegExpExecArray | null, key: ArmKey | null = null, at = 0;
    while ((a = re.exec(body))) { if (key) arms[key] = ((arms[key] || '') + '\n' + body.slice(at, a.index)).trim(); key = ARM_WORD[a[1].toLowerCase()]; at = a.index + a[0].length; }
    if (key) arms[key] = ((arms[key] || '') + '\n' + body.slice(at)).trim();
    if (!arms.success || !arms.fail) continue;
    out.push({ from: m.index, to: after + stop + skip, ask, arms }); CHECK.lastIndex = after + stop + skip;
  }
  return out;
}
/** 굴림의 등급이 고르는 갈래: 따로 쓰지 않은 대성공 · 대실패 · 부분 성공은 성공 · 실패로 넘어간다 */
export const armOf = (grade: Grade, arms: Partial<Record<ArmKey, string>>): ArmKey =>
  grade === 'crit' ? (arms.crit ? 'crit' : 'success') : grade === 'fumble' ? (arms.fumble ? 'fumble' : 'fail') : grade === 'partial' ? (arms.partial ? 'partial' : 'success') : grade === 'ok' ? 'success' : 'fail';

// ── 굴림 자리 ──
const SLOT = /\[\[\s*(?:roll\s*[:：]\s*)?(?:([^\s\d[\]:：+\-][^[\]:：+\-]{0,20})\s*[:：]\s*)?(\d{0,2})\s*d\s*(\d{1,4})((?:\s*[+\-−–]\s*[^\s[\]+\-−–]{1,16})*)\s*\]\]/gi;
const SLOT_REF = /\[\[\s*([^\s\d[\]:：+\-][^[\]:：+\-]{0,20})\s*\]\]/g;
export interface SlotCtx { d(sides: number): number; /** 능력치 · 레벨 이름을 숫자로 (모르면 null) */ mod(name: string): number | null }
/** [[2d6+3]] · [[1d8+힘]] · [[베임: 1d6+1]] … [[베임]] 을 굴려 숫자로 바꾼다. 같은 이름은 같은 값을 다시 쓴다 */
export function fillSlots(text: string, ctx: SlotCtx, forced?: SlotRec[]): { text: string; slots: SlotRec[] } {
  const slots: SlotRec[] = [], named = new Map<string, number>(); let n = 0;
  let out = text.replace(SLOT, (all, name: string | undefined, cnt: string, sides: string, mods: string) => {
    if (slots.length >= 12) return all;
    const count = Math.min(20, Math.max(1, parseInt(cnt || '1', 10) || 1)), sd = Math.min(1000, Math.max(2, parseInt(sides, 10) || 6));
    const had = forced?.[n++]; let mod = 0, miss = '';
    for (const part of mods.match(/[+\-−–]\s*[^\s[\]+\-−–]+/g) || []) {
      const neg = !part.startsWith('+'), word = part.slice(1).trim(), v = /^\d+$/.test(word) ? parseInt(word, 10) : ctx.mod(word);
      if (v == null) miss = word; else mod += neg ? -v : v;
    }
    const dice = had?.dice.length === count ? had.dice : Array.from({ length: count }, () => ctx.d(sd)), total = Math.max(0, dice.reduce((a, b) => a + b, 0) + mod);
    const rec: SlotRec = { expr: `${count > 1 ? count : ''}d${sd}${mods.replace(/\s+/g, '').replace(/[−–]/g, '-')}`, total, dice, mod, ...(name ? { name: name.trim() } : {}), ...(miss ? { miss } : {}) };
    slots.push(rec); if (name) named.set(name.trim().toLowerCase(), total);
    return String(total);
  });
  out = out.replace(SLOT_REF, (all, name: string) => { const v = named.get(name.trim().toLowerCase()); return v == null ? all : String(v); });
  return { text: out, slots };
}

/** 받은 원문을 푼다: 묶음마다 굴려 한 갈래만 남기고, 굴림 자리를 채운다. forced 를 주면 그 결과를 그대로 쓴다 (운명 점으로 뒤집을 때) */
export function resolveReply(raw: string, roll: (ask: CheckAsk, i: number) => Omit<RollRec, 'why' | 'arm' | 'head' | 'ask'>, ctx: SlotCtx, forced?: { rolls?: RollRec[]; slots?: SlotRec[] }): { text: string; rolls: RollRec[]; slots: SlotRec[] } {
  const blocks = findBlocks(raw), rolls: RollRec[] = []; let text = '', at = 0;
  blocks.forEach((b, i) => {
    const had = forced?.rolls?.[i], r = had && had.stat === b.ask.stat ? had : roll(b.ask, i), arm = armOf(r.grade, b.arms), body = b.arms[arm] || '';
    rolls.push({ ...r, why: b.ask.why, ask: b.ask, arm, head: '' });
    // 자리표(\u0001n\u0001)를 잠깐 꽂아 둔다 — 굴림 자리를 채운 뒤에 갈래의 첫머리를 읽으려고
    text += raw.slice(at, b.from).replace(/\s+$/, '') + `\n\n\u0001${i}\u0001${body}\n\n`; at = b.to;
  });
  text += raw.slice(at).replace(/^\s+/, blocks.length ? '' : '$&');
  const filled = fillSlots(text, ctx, forced?.slots);
  text = filled.text.replace(/\u0001(\d+)\u0001([^\u0001]{0,200})/g, (_all, i: string, after: string) => { rolls[+i].head = headOf(after); return after; });
  return { text: (blocks.length ? text.replace(/\n{3,}/g, '\n\n') : text).trim(), rolls, slots: filled.slots };
}
/** 갈래의 첫머리: 표시와 꾸밈 기호를 걷어 낸 처음 스물몇 글자 */
export const headOf = (s: string) => hideTags(s, false).replace(/[*_`#>]/g, '').replace(/\s+/g, ' ').trim().slice(0, 28);

/** 받는 중의 글에서 갈래를 가린다: 첫 갈래 표시부터 [end] 까지(아직 안 왔으면 글 끝까지)를 mark 로 바꾸고, 굴림 자리는 slot() 으로 */
export function veil(text: string, streaming: boolean, mark: string, slot: (expr: string) => string): string {
  if (text.indexOf('[') < 0) return text;
  let s = text;
  if (streaming) {
    const armRe = new RegExp(ARM_SRC, 'i'); let guard = 0;
    for (let a = armRe.exec(s); a && guard++ < 6; a = armRe.exec(s)) {
      const rest = s.slice(a.index), end = END.exec(rest), next = rest.search(/\[\s*(?:check|save)\b/i);
      const stop = end && (next < 0 || end.index < next) ? end.index + end[0].length : next >= 0 ? next : rest.length;
      s = s.slice(0, a.index).replace(/\s+$/, '') + `\n\n${mark}\n\n` + rest.slice(stop).replace(/^\s+/, '');
    }
    s = s.replace(/\[\[[^\]\n]{0,60}$/, '').replace(/\[\s*(?:suc|fai|cri|fum|par|end|성|실|대|부|끝)[^\]\n]{0,10}$/i, '');
  } else s = s.replace(new RegExp(ARM_SRC, 'gi'), '').replace(new RegExp(END.source, 'gi'), '');
  return s.replace(SLOT, (_a, name: string | undefined, cnt: string, sides: string, mods: string) => slot(`${name ? name.trim() + ' ' : ''}${cnt || ''}d${sides}${mods.replace(/\s+/g, '')}`)).replace(SLOT_REF, (_a, name: string) => slot(name));
}
