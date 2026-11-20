// 인물과의 사이: 진행자가 숫자 대신 "무슨 일이 있었는지"를 동사로 쓰면 앱이 정해진 만큼 올리고 내린다.
// 단계의 경계를 넘으면 이정표가 된다 (일지 · 인물 수첩 · 진행자에게 알림). 순수한 계산만 둔다.
export const REP_VERBS: Record<string, number> = {
  helped: 6, aided: 6, gift: 5, gave: 5, praised: 4, honored: 5, thanked: 3, amused: 3, impressed: 6, comforted: 6, shared: 6, trusted: 7, kept: 8, healed: 8, defended: 10, freed: 12, avenged: 12, saved: 15, rescued: 15, sacrificed: 20,
  ignored: -3, annoyed: -3, refused: -4, insulted: -6, mocked: -6, lied: -8, deceived: -8, tricked: -8, cheated: -9, stole: -10, robbed: -10, threatened: -10, broke: -12, humiliated: -12, abandoned: -14, hurt: -15, attacked: -15, betrayed: -30,
};
/** 다른 말로 써도 알아듣는다 */
const ALIAS: Record<string, string> = { help: 'helped', aid: 'aided', gifted: 'gift', give: 'gave', praise: 'praised', honour: 'honored', honoured: 'honored', thank: 'thanked', impress: 'impressed', comfort: 'comforted', share: 'shared', trust: 'trusted', promise: 'kept', heal: 'healed', defend: 'defended', protected: 'defended', protect: 'defended', free: 'freed', avenge: 'avenged', save: 'saved', rescue: 'rescued', sacrifice: 'sacrificed', ignore: 'ignored', annoy: 'annoyed', refuse: 'refused', insult: 'insulted', mock: 'mocked', lie: 'lied', deceive: 'deceived', trick: 'tricked', cheat: 'cheated', steal: 'stole', rob: 'robbed', threaten: 'threatened', broken: 'broke', humiliate: 'humiliated', abandon: 'abandoned', harm: 'hurt', harmed: 'hurt', attack: 'attacked', betray: 'betrayed',
  도왔다: 'helped', 선물: 'gift', 칭찬: 'praised', 믿었다: 'trusted', 약속: 'kept', 치료: 'healed', 지켰다: 'defended', 풀어줬다: 'freed', 구했다: 'saved', 무시: 'ignored', 거절: 'refused', 모욕: 'insulted', 속였다: 'deceived', 훔쳤다: 'stole', 위협: 'threatened', 버렸다: 'abandoned', 해쳤다: 'hurt', 공격: 'attacked', 배신했다: 'betrayed', 배신: 'betrayed' };
export const verbOf = (word: string): string => { const w = word.trim().toLowerCase(); return REP_VERBS[w] != null ? w : ALIAS[w] || ''; };
/** 진행자에게 보여 줄 동사 목록 (좋은 일 · 나쁜 일) */
export const VERB_HELP = 'helped, gift, praised, impressed, comforted, shared (a secret), trusted, kept (a promise), healed, defended, freed, saved, sacrificed / ignored, refused, insulted, lied, cheated, stole, threatened, broke (a promise), humiliated, abandoned, hurt, betrayed';
/** 이정표: 사이의 단계가 바뀐 순간 */
export interface Mark { from: number; to: number; at: string; verb?: string }
export interface Person { name: string; v: number; /** 진행자가 [npc …] 로 적어 준 소개 */ role?: string; /** 처음 만난 곳 */ met?: string; marks: Mark[]; /** 마지막으로 있었던 일 */ last?: string }
const TIER_EN = ['a sworn enemy', 'hostile', 'neutral', 'friendly', 'devoted'];
/** 방금 넘어간 경계를 진행자에게 알린다 */
export const marksPrompt = (list: { name: string; m: Mark }[]) => list.length ? `[Milestone — ${list.map(x => `${x.name} is now ${TIER_EN[x.m.to]} toward {{user}} (was ${TIER_EN[x.m.from]})`).join('; ')}. Let it show from now on in how they speak, what they offer or withhold, and what they are willing to risk; mark the moment with one concrete gesture in the next scene they share.]` : '';
