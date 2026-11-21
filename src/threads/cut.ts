// 끊고 들어오기: 캐릭터가 [cut: "원문 그대로의 구절"] 로 사용자의 긴 말을 중간에서 끊는다. 끊는 자리를 찾는 순수 함수
// 원문은 건드리지 않는다 — 끊은 자리(글자 위치)만 그 답장의 스와이프에 적어 두므로, 스와이프를 바꾸거나 "원문 복원"을 누르면 그대로 돌아온다.
export const CUT_GUIDE = `[cut: "exact words"] — {{char}} cuts in while {{user}} is still talking. Quote at least three consecutive words exactly as they appear in {{user}}'s latest message; that message is shown broken off right after those words, and your reply lands as the interruption. Only for a long message and only when {{char}} truly would not let them finish (alarm, anger, a secret about to slip, sheer impatience). Rare. Put it on the first line, then react only to what was said before the cut.`;
export const CUT_MIN_WORDS = 3;
const QUOTE = /["“”'‘’「」『』`]/;
/** 낱말 수: 띄어 쓴 덩어리로 세되, 띄어쓰기 없는 글(한자 · 가나)은 여섯 글자를 세 낱말로 친다 */
export const wordCount = (s: string) => { const w = s.trim().split(/\s+/).filter(Boolean).length; return w >= CUT_MIN_WORDS ? w : /[぀-ヿ一-鿿]/.test(s) && s.replace(/\s/g, '').length >= 6 ? CUT_MIN_WORDS : w; };
/** 견주기 쉽게: 소문자 · 공백 한 칸 · 따옴표 없음. map[i] = 다듬은 글의 i 번째 글자가 원문의 몇 번째였나 */
function norm(s: string): { text: string; map: number[] } {
  let text = ''; const map: number[] = []; let space = true;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i]; if (QUOTE.test(ch)) continue;
    if (/\s/.test(ch)) { if (!space) { text += ' '; map.push(i); space = true; } continue; }
    text += ch.toLowerCase(); map.push(i); space = false;
  }
  return { text, map };
}
/**
 * 원문에서 구절이 끝나는 자리(그 뒤를 잘라 낼 글자 위치)를 찾는다. 못 찾으면 -1.
 * 세 낱말이 안 되는 구절, 원문에 없는 구절, 이미 거의 끝난 자리(뒤에 남은 말이 여덟 글자가 안 됨)는 끊지 않는다.
 */
export function findCut(original: string, phrase: string): number {
  const p = norm(phrase.replace(/[\s.…,!?—-]+$/g, '')).text.trim(); if (!p || wordCount(p) < CUT_MIN_WORDS) return -1;
  const o = norm(original), i = o.text.indexOf(p); if (i < 0) return -1;
  const at = o.map[i + p.length - 1] + 1;
  if (original.slice(at).replace(/[\s.…,!?"”’」』)]+/g, '').length < 8) return -1;
  return at;
}
/** 끊긴 모습: 그 자리까지의 말 뒤에 긴 줄표 */
export const cutText = (original: string, at: number) => at > 0 && at < original.length ? original.slice(0, at).replace(/[\s,.…-]+$/, '') + '—' : original;
interface CMsg { role: string; swipes: object[]; sw: number }
/** 끊긴 자리 표: 내 메시지 id → 글자 위치. 그 뒤 답장의 "지금 고른 스와이프"가 정한다. skipLast = 다시 쓰는 중인 마지막 답장의 것은 세지 않는다 */
export function cutsOf(msgs: CMsg[], skipLast = false): Map<string, number> {
  const out = new Map<string, number>();
  for (let i = 0; i < msgs.length - (skipLast ? 1 : 0); i++) { const c = msgs[i].role === 'assistant' ? (msgs[i].swipes[msgs[i].sw] as { thCut?: { id: string; at: number } } | undefined)?.thCut : undefined; if (c) out.set(c.id, c.at); }
  return out;
}
