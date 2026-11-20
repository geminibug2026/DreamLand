// 눈치껏: 그룹에서 다음에 말할 사람을 추가 호출 없이 점수로 고른다. 왜 그 점수인지도 함께 돌려준다(칩의 풍선말). 순수 함수
export interface OCast { id: string; name: string; /** 수다 정도 0~1 (카드의 talk) */ talk?: number; away?: boolean; muted?: boolean }
export interface OMsg { role: string; charId?: string; text: string; hidden?: boolean; /** 내 귓속말을 들은 사람 */ to?: string[] }
export type WhyKey = 'whisper' | 'named' | 'mine' | 'asked' | 'quiet' | 'fresh' | 'talk' | 'just' | 'away' | 'muted';
export interface Score { id: string; name: string; score: number; out: boolean; why: { key: WhyKey; pts: number }[] }
const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
/** 이름이 불렸는가: 온 이름이나 그 첫 토막이 낱말로 나오면 (한글 조사는 붙어도 된다) */
export function called(text: string, name: string): boolean {
  const parts = [name.trim(), name.trim().split(/\s+/)[0]].filter(p => p.length >= 2);
  return parts.some(p => new RegExp(`(^|[^\\p{L}\\p{N}])@?${esc(p)}(?![a-zA-Z0-9])`, 'iu').test(text));
}
const asks = (text: string) => /[?？]\s*["”’」』)]*\s*$/.test(text.trim()) || /[?？]/.test(text.split('\n').pop() || '');
/**
 * 점수표. 큰 것부터: 귓속말을 들었다(+8) · 방금 말에 이름이 불렸다(+5) · 내 말에 이름이 있었다(+3) · 질문을 받았다(+2, 이름 없이 던진 질문은 모두에게 +1)
 * · 오래 조용했다(턴당 +0.7, 최대 +2.8 · 아직 한마디도 안 했으면 +2) · 수다 정도(×2) · 방금 말했다(−4). 자리에 없거나 쉬게 한 사람은 빠진다.
 */
export function scoreSpeakers(cast: OCast[], msgsIn: OMsg[]): Score[] {
  const msgs = msgsIn.filter(m => !m.hidden && m.role !== 'system'), tail = msgs[msgs.length - 1];
  const lastUser = [...msgs].reverse().find(m => m.role === 'user'), userNear = !!lastUser && msgs.length - 1 - msgs.lastIndexOf(lastUser) <= cast.length;
  const lastAi = [...msgs].reverse().find(m => m.role === 'assistant');
  const anyNamed = !!tail && cast.some(c => c.id !== tail.charId && called(tail.text, c.name));
  return cast.map(c => {
    const why: Score['why'] = [], add = (key: WhyKey, pts: number) => { if (pts) why.push({ key, pts: Math.round(pts * 10) / 10 }); };
    if (c.away || c.muted) return { id: c.id, name: c.name, score: -Infinity, out: true, why: [{ key: c.away ? 'away' as const : 'muted' as const, pts: 0 }] };
    const mine = !!tail && tail.role === 'assistant' && tail.charId === c.id;
    if (tail?.role === 'user' && tail.to?.includes(c.id)) add('whisper', 8);
    if (tail && !mine && called(tail.text, c.name)) add('named', 5);
    else if (lastUser && userNear && lastUser !== tail && called(lastUser.text, c.name) && lastAi?.charId !== c.id) add('mine', 3);
    if (tail && !mine && asks(tail.text)) add('asked', called(tail.text, c.name) ? 2 : anyNamed ? 0 : 1);
    let quiet = 0, spoke = false;
    for (let i = msgs.length - 1; i >= 0; i--) { const m = msgs[i]; if (m.role !== 'assistant') continue; if (m.charId === c.id) { spoke = true; break; } quiet++; }
    if (!spoke && msgs.length) add('fresh', 2); else if (quiet > 0) add('quiet', Math.min(4, quiet) * 0.7);
    add('talk', Math.max(0, Math.min(1, c.talk ?? 0.5)) * 2);
    if (lastAi?.charId === c.id) add('just', -4);
    return { id: c.id, name: c.name, score: Math.round(why.reduce((n, w) => n + w.pts, 0) * 10) / 10, out: false, why };
  });
}
/** 가장 높은 사람. 0.5 점 안에서 비기면 그 가운데 한 명을 뽑는다 (rnd 는 0~1) */
export function pickSmart(scores: Score[], rnd: () => number = Math.random): Score | null {
  const live = scores.filter(s => !s.out); if (!live.length) return null;
  const top = Math.max(...live.map(s => s.score)), near = live.filter(s => top - s.score <= 0.5);
  return near[Math.min(near.length - 1, Math.floor(rnd() * near.length))];
}
