// 성좌 도감의 정의: 아홉 별자리와 그 별들(좌표는 100칸 상자 안에 손으로 놓았다) · 한 사람과의 별자리의 마일스톤
// 이름과 조건 글은 i18n 의 atlas.c.<별자리> · atlas.s.<별>.n / .c 에 있다. 숫자판(Tally)의 칸 이름은 stat.ts 가 채운다
import type { ConDef, MileDef, StarDef } from './types';

type Row = [id: string, x: number, y: number, m: string, at: number[], opt?: { hidden?: boolean; unit?: number }];
const stars = (con: string, rows: Row[]): StarDef[] => rows.map(([id, x, y, m, at, o]) => ({ id, con, x, y, m, at, ...(o || {}) }));
const chain = (...ids: string[]): [string, string][] => ids.slice(1).map((b, i) => [ids[i], b]);
const H = { hidden: true };

/** 성도(1200 × 760) 위의 별자리들. cx · cy 는 상자 한가운데, s 는 상자 한 변의 길이, rot 는 기울기(도) */
export const CONS: ConDef[] = [
  // 첫 문장 — 깃펜: 촉에서 깃 끝까지 한 줄, 옆으로 깃털 한 가닥
  { id: 'first', no: 'I', cx: 150, cy: 152, s: 172, rot: -6, edges: [...chain('hello', 'answer', 'cast', 'tome', 'again'), ['cast', 'mask'], ['mask', 'again']],
    stars: stars('first', [['hello', 14, 88, 'turns', [1]], ['answer', 32, 66, 'replies', [1]], ['cast', 50, 46, 'nChars', [1]], ['tome', 70, 26, 'lore', [1]], ['again', 88, 10, 'swipes', [1]], ['mask', 76, 54, 'personas', [1]]]) },
  // 오래된 약속 — 매듭: 다섯 별의 고리와 풀려 나온 끈 하나
  { id: 'vow', no: 'II', cx: 525, cy: 148, s: 164, rot: 8, edges: [...chain('kept', 'days', 'circle', 'back', 'made', 'kept'), ['circle', 'year']],
    stars: stars('vow', [['kept', 50, 14, 'kept', [1, 5, 20]], ['days', 78, 32, 'daysMax', [7, 30, 100]], ['circle', 70, 62, 'circle', [2, 5]], ['back', 38, 70, 'gap', [30], H], ['made', 22, 40, 'made', [1]], ['year', 88, 88, 'daysMax', [365], H]]) },
  // 긴 이야기 — 굽이치는 강
  { id: 'long', no: 'III', cx: 935, cy: 142, s: 226, rot: 0, edges: chain('turns', 'active', 'ink', 'room', 'tall', 'mem'),
    stars: stars('long', [['turns', 8, 34, 'turns', [100, 1000, 5000]], ['active', 26, 22, 'active', [30, 100, 365]], ['ink', 46, 36, 'ink', [100000, 500000, 2000000]], ['room', 42, 58, 'roomMax', [300, 1000]], ['tall', 62, 70, 'longest', [3000]], ['mem', 86, 58, 'mem', [10, 100, 500]]]) },
  // 밤샘 — 그믐달과 곁의 별 하나
  { id: 'night', no: 'IV', cx: 300, cy: 392, s: 184, rot: -10, edges: [...chain('full', 'three', 'owl', 'streak', 'dark', 'moons', 'full'), ['moons', 'allday']],
    stars: stars('night', [['full', 62, 8, 'full', [1, 5, 12]], ['three', 38, 18, 'three', [1], H], ['owl', 24, 40, 'night', [1, 30, 200]], ['streak', 30, 66, 'streak', [3, 7, 30]], ['dark', 52, 84, 'dark', [1], H], ['moons', 50, 46, 'phases', [8]], ['allday', 84, 36, 'dayMax', [100], H]]) },
  // 갈림길 — 한 뿌리에서 갈라진 두 가지
  { id: 'fork', no: 'V', cx: 662, cy: 402, s: 172, rot: 4, edges: [...chain('swipe', 'branch', 'cp', 'ten'), ['branch', 'group'], ['group', 'deep']],
    stars: stars('fork', [['swipe', 50, 92, 'swipes', [10, 100, 1000]], ['branch', 50, 62, 'branch', [1, 5, 20]], ['cp', 30, 40, 'cps', [1, 10, 30]], ['ten', 14, 16, 'maxSwipes', [10], H], ['group', 68, 42, 'group', [1]], ['deep', 86, 20, 'deep', [2], H]]) },
  // 주사위꾼 — 정육면체 주사위와 굴러 나온 눈 두 개
  { id: 'dice', no: 'VI', cx: 1010, cy: 424, s: 192, rot: 6, edges: [...chain('crit', 'fights', 'boss', 'quests', 'minis', 'sessions', 'crit'), ['rolls', 'sessions'], ['rolls', 'fights'], ['rolls', 'quests'], ['fights', 'places'], ['places', 'fumble']],
    stars: stars('dice', [['crit', 42, 22, 'crit', [1, 5, 20]], ['fights', 70, 38, 'fights', [1, 10, 50]], ['boss', 70, 70, 'boss', [1, 5]], ['quests', 42, 86, 'quests', [1, 10, 30]], ['minis', 14, 70, 'minis', [1, 10, 30]], ['sessions', 14, 38, 'sessions', [1, 5, 20]], ['rolls', 42, 54, 'rolls', [10, 100]], ['places', 88, 18, 'places', [5, 30, 100]], ['fumble', 96, 46, 'fumble', [1], H]]) },
  // 마주 앉은 자리 — 등 하나 아래의 탁자
  { id: 'scene', no: 'VII', cx: 150, cy: 622, s: 164, rot: 0, edges: [['scenes', 'calls'], ['scenes', 'illust'], ['calls', 'react'], ['illust', 'react'], ['calls', 'hours'], ['illust', 'missed'], ['hours', 'missed']],
    stars: stars('scene', [['scenes', 50, 12, 'scenes', [1, 10, 50]], ['calls', 22, 44, 'calls', [1, 10, 50]], ['illust', 78, 44, 'illust', [1, 20, 100]], ['react', 50, 58, 'react', [10, 100]], ['hours', 32, 84, 'callSecs', [3600, 36000], { unit: 3600 }], ['missed', 68, 84, 'missed', [1], H]]) },
  // 종이 서랍 — 열린 봉투
  { id: 'paper', no: 'VIII', cx: 505, cy: 632, s: 160, rot: -4, edges: [...chain('diary', 'dreams', 'keeps', 'notes', 'diary'), ['diary', 'letters'], ['letters', 'dreams'], ['diary', 'tr'], ['tr', 'dreams']],
    stars: stars('paper', [['diary', 14, 34, 'diary', [1, 10, 50]], ['dreams', 86, 34, 'dreams', [1, 5, 20]], ['keeps', 86, 80, 'keeps', [1, 10, 30]], ['notes', 14, 80, 'notes', [1, 10]], ['letters', 50, 60, 'letters', [1, 3, 12]], ['tr', 50, 10, 'tr', [1, 50, 500]]]) },
  // 수집가 — 열쇠: 고리와 자루와 이
  { id: 'keep', no: 'IX', cx: 835, cy: 640, s: 172, rot: 10, edges: [...chain('faces', 'masks', 'rooms', 'books', 'faces'), ['rooms', 'entries'], ['entries', 'met']],
    stars: stars('keep', [['faces', 20, 26, 'nChars', [5, 20, 50]], ['masks', 40, 12, 'personas', [2, 5]], ['rooms', 56, 30, 'rooms', [10, 50, 200]], ['books', 34, 44, 'lore', [3, 10]], ['entries', 88, 62, 'entries', [100, 500, 2000]], ['met', 76, 78, 'met', [3, 10, 30]]]) },
];
export const STARS: StarDef[] = CONS.flatMap(c => c.stars);
export const starOf = (id: string) => STARS.find(s => s.id === id);
export const conOf = (id: string) => CONS.find(c => c.id === id);

/** 한 사람과의 별자리: 그 사람과의 기록만으로 켜진다. fact 는 켜진 뒤 캐릭터가 한 번 말할 수 있게 넣는 사실 (설정을 켰을 때만) */
export const MILES: MileDef[] = [
  { id: 'met', m: 'turns', at: 1, fact: '' },
  { id: 'd7', m: 'days', at: 7, fact: 'It has now been a week since {{user}} and {{char}} first talked.' },
  { id: 't100', m: 'turns', at: 100, fact: '{{user}} has now written to {{char}} more than a hundred times.' },
  { id: 'scene', m: 'faced', at: 1, fact: '{{user}} and {{char}} have now shared their first time face to face or on a call, beyond text.' },
  { id: 'vow', m: 'kept', at: 1, fact: '{{user}} has kept a promise made with {{char}} for the first time.' },
  { id: 'd30', m: 'days', at: 30, fact: 'It has now been a month since {{user}} and {{char}} first talked.' },
  { id: 'page', m: 'pages', at: 1, fact: 'The first page (a diary entry, a dream or a letter) about the days with {{user}} has been written.' },
  { id: 't1000', m: 'turns', at: 1000, fact: '{{user}} has now written to {{char}} more than a thousand times.' },
  { id: 'd100', m: 'days', at: 100, fact: 'It has now been a hundred days since {{user}} and {{char}} first talked.' },
];
