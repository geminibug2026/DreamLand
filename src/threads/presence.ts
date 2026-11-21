// 자리에 없는 사람: 그룹에서 캐릭터가 자리를 비운 동안 오간 말은 그 캐릭터의 프롬프트에서 빠진다 (돌아와도 모른다). 순수 함수
// 누가 없었는지는 메시지마다 찍어 둔다(thGone) — 그래야 나중에 지우거나 분기해도 "그때 누가 못 들었나"가 어긋나지 않는다.
export const AWAY_GUIDE = `[leave: Name] / [enter: Name] — when a character actually walks out of earshot or comes back in the story, mark it (your own name or another character's). While someone is gone they hear nothing of what is said, and they will not know it when they return. Only for real exits and entrances, never for a pause in talking.`;
export const BACK_NOTE = (name: string, n: number) => `${name} has just come back. While ${name} was away, ${n === 1 ? 'one exchange' : `${n} exchanges`} happened here that ${name} did not see or hear — they are not shown to you. Do not act as if you know them; you may notice that the mood has shifted or ask what you missed.`;
interface PMsg { role: string; hidden?: boolean; thGone?: string[] }
/** viewer 가 이 말을 들었는가 */
export const heard = (m: PMsg, viewer: string) => !m.thGone?.includes(viewer);
/** 드나든 표시를 차례로 적용한 새 "없는 사람" 목록 */
export function applyMoves(away: string[], moves: { kind: 'leave' | 'enter'; id: string }[]): string[] {
  const set = new Set(away);
  for (const mv of moves) { if (mv.kind === 'leave') set.add(mv.id); else set.delete(mv.id); }
  return [...set];
}
/** 방금 돌아왔는가: 기록 끝에서부터 viewer 가 못 들은 말이 잇달아 몇 개인지 (0 이면 줄곧 있었다) */
export function missedTail(msgs: PMsg[], viewer: string): number {
  let n = 0;
  for (let i = msgs.length - 1; i >= 0; i--) { const m = msgs[i]; if (m.hidden || m.role === 'system') continue; if (heard(m, viewer)) break; n++; }
  return n;
}
