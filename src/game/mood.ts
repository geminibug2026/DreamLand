// 사기(士氣): 일행의 기세를 0~100 으로 센다. 일이 있을 때마다 오르내리고, 가만히 두면 50 으로 천천히 돌아간다.
// 값은 저장하지 않고 기록에서 접어 구한다 (state.ts 의 sheetOf 가 메시지마다 moodStep 을 부른다).
export type MoodEv = 'win' | 'boss' | 'lose' | 'fled' | 'down' | 'crit' | 'fumble' | 'quest' | 'joined' | 'left' | 'rest' | 'treasure' | 'trap' | 'betrayed' | 'rescued' | 'lost' | 'feast' | 'dread' | 'mercy' | 'cruel';
export const MOOD_DELTA: Record<MoodEv, number> = { win: 8, boss: 15, lose: -15, fled: -4, down: -8, crit: 5, fumble: -3, quest: 10, joined: 5, left: -6, rest: 10, treasure: 6, trap: -5, betrayed: -12, rescued: 8, lost: -20, feast: 6, dread: -7, mercy: 3, cruel: -4 };
/** 진행자가 [mood …] 로 쓸 수 있는 말 (앱이 스스로 알아채지 못하는 일들) */
export const MOOD_WORDS: Record<string, MoodEv> = { rest: 'rest', rested: 'rest', treasure: 'treasure', windfall: 'treasure', trap: 'trap', ambushed: 'trap', betrayed: 'betrayed', betrayal: 'betrayed', rescued: 'rescued', rescue: 'rescued', lost: 'lost', loss: 'lost', grief: 'lost', feast: 'feast', celebration: 'feast', song: 'feast', dread: 'dread', horror: 'dread', omen: 'dread', mercy: 'mercy', cruel: 'cruel', cruelty: 'cruel' };
/** 단계: 0 무너짐 · 1 낮음 · 2 보통 · 3 높음 · 4 고양 */
export const moodTier = (v: number) => v < 15 ? 0 : v < 35 ? 1 : v < 65 ? 2 : v < 85 ? 3 : 4;
export const MOOD_EN = ['broken', 'low', 'steady', 'high', 'inspired'];
export const moodStart = (diff: string) => diff === 'easy' ? 60 : diff === 'hard' ? 45 : 50;
const clamp = (n: number) => Math.min(100, Math.max(0, n));
/** 한 번의 일 */
export const moodApply = (v: number, ev: MoodEv) => clamp(v + (MOOD_DELTA[ev] || 0));
/** 답장 하나가 지나갈 때마다 가운데로 한 걸음 */
export const moodDrift = (v: number) => v > 55 ? v - 1 : v < 45 ? v + 1 : v;
/** 판정에 붙는 보정: 고양이면 +1, 무너졌으면 -1 */
export const moodEdge = (v: number) => { const t = moodTier(v); return t === 4 ? 1 : t === 0 ? -1 : 0; };
/** 진행자에게 주는 서술 지침 */
const GUIDE = [
  'BROKEN — the party is close to giving up: voices are flat, companions argue, hesitate and talk about turning back. Checks take -1. A companion may walk away unless {{user}} gives them a reason to stay.',
  'LOW — tired and wary: short tempers, gallows humour, companions second-guess risky plans.',
  'STEADY — nothing to add; play it straight.',
  'HIGH — in good spirits: banter comes easily, companions volunteer and back bold plans.',
  'INSPIRED — riding high: companions are fearless and generous, strangers feel it and warm to them. Checks take +1 and luck favours them.',
];
export const moodPrompt = (v: number) => { const t = moodTier(v); return t === 2 ? '' : ` · Morale ${v}/100: ${GUIDE[t]}`; };
