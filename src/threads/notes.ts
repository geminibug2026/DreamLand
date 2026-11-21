// 속내 쪽지: 캐릭터가 답장 끝에 남기는, 독자에게 보이지 않는 자기 메모. 수명과 프롬프트 글을 정하는 순수 함수
// 장기기억(memoria)은 "있었던 일"을 오래 간직하고, 이것은 "지금 품은 마음"을 몇 턴만 이어 준다 — 그래서 가장 새것 세 장만 살아 있다.
export const NOTES_KEEP = 3;
export const NOTES_GUIDE = `[notes: …] — a private note to your future self; {{user}} never sees it. Use it for what {{char}} keeps inside right now: a feeling being hidden, an attitude that just changed, a plan being held back, a lie told. 1–3 short lines, under 60 words, written as {{char}} thinking. Only when something inside actually moved this turn — most replies need none. Put it on the last line. Your three newest notes are handed back to you each turn; [notes: clear] drops them all.`;

/** 모델이 쓴 메모를 다듬는다: 불릿 정리 · 최대 3줄 · 320자. wipe = 지난 메모를 지우라는 뜻 */
export function cleanNote(raw: string): { text: string; wipe: boolean } {
  const t = String(raw || '').replace(/\\n/g, '\n').trim();
  if (/^(clear|none|dismiss|-+|x)$/i.test(t)) return { text: '', wipe: true };
  const lines = t.split(/\n|(?:\s+[•·]\s+)/).map(l => l.replace(/^\s*[-*•·\d.)]+\s*/, '').replace(/[{}]/g, '').trim()).filter(Boolean).slice(0, 3);
  let text = lines.join('\n'); if (text.length > 320) text = text.slice(0, 319).trimEnd() + '…';
  return { text, wipe: false };
}
interface NMsg { id?: string; role: string; charId?: string; hidden?: boolean; swipes: { thNotes?: string; thWipe?: boolean }[]; sw: number }
export interface LiveNote { text: string; /** 그 뒤로 이 캐릭터가 몇 번 더 말했나 (0 = 바로 앞의 내 답장) */ ago: number; id?: string }
/**
 * 지금 살아 있는 속내: 그 캐릭터가 고른 스와이프에 적힌 것 가운데 새것부터 keep 장 (돌려줄 때는 오래된 것부터).
 * 숨긴 메시지의 것은 빼고, "지움" 표시를 만나면 그 앞의 것은 버린다. skipLast = 다시 쓰는 중인 마지막 답장은 세지 않는다
 */
export function liveNotes(msgs: NMsg[], charId: string, { keep = NOTES_KEEP, skipLast = false } = {}): LiveNote[] {
  const out: LiveNote[] = []; let ago = 0;
  for (let i = msgs.length - 1 - (skipLast ? 1 : 0); i >= 0 && out.length < keep; i--) {
    const m = msgs[i]; if (m.role !== 'assistant' || m.charId !== charId || m.hidden) continue;
    const s = m.swipes[m.sw]; if (!s) continue;
    if (s.thNotes) out.push({ text: s.thNotes, ago, id: m.id });
    if (s.thWipe) break;
    ago++;
  }
  return out.reverse();
}
/** 다음 턴에 그 캐릭터에게만 돌려주는 글 */
export function notesBlock(name: string, notes: LiveNote[]): string {
  if (!notes.length) return '';
  const when = (n: number) => n === 0 ? 'last turn' : `${n + 1} turns ago`;
  return `<private_notes of="${name}">\nYour own earlier notes to yourself. Only you know them: let them steer what ${name} does and holds back, and never quote or reveal them.\n${notes.map(n => `- (${when(n.ago)}) ${n.text.replace(/\n/g, ' / ')}`).join('\n')}\n</private_notes>`;
}
