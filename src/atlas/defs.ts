// 성좌 도감의 정의: 아홉 별자리와 그 별들(좌표는 100칸 상자 안, figures.ts 의 형상 그림에서 뜻이 있는 자리에 손으로 놓았다) · 한 사람과의 별자리의 마일스톤
// 이름과 조건 글은 i18n 의 atlas.c.<별자리> · atlas.s.<별>.n / .c 에 있다. 숫자판(Tally)의 칸 이름은 stat.ts 가 채운다
import type { ConDef, MileDef, StarDef } from './types';

type Row = [id: string, x: number, y: number, m: string, at: number[], opt?: { hidden?: boolean; unit?: number }];
const stars = (con: string, rows: Row[]): StarDef[] => rows.map(([id, x, y, m, at, o]) => ({ id, con, x, y, m, at, ...(o || {}) }));
const chain = (...ids: string[]): [string, string][] => ids.slice(1).map((b, i) => [ids[i], b]);
const H = { hidden: true };

/** 성도(1200 × 760) 위의 별자리들. cx · cy 는 상자 한가운데, s 는 상자 한 변의 길이, rot 는 기울기(도) */
export const CONS: ConDef[] = [
  // 첫 문장 — 깃펜과 잉크병: 촉 끝 · 첫 획의 끝 · 깃이 시작되는 곳 · 깃대 · 깃 끝 · 병 주둥이
  { id: 'first', no: 'I', cx: 152, cy: 150, s: 178, rot: -4, edges: [...chain('hello', 'cast', 'again', 'mask'), ['hello', 'answer'], ['answer', 'tome']],
    stars: stars('first', [['hello', 20, 84, 'turns', [1]], ['answer', 47, 92, 'replies', [1]], ['cast', 40, 56, 'nChars', [1]], ['tome', 74, 69, 'lore', [1]], ['again', 60.7, 34.4, 'swipes', [1]], ['mask', 86, 8, 'masked', [1]]]) },
  // 오래된 약속 — 매듭 지은 리본: 매듭 · 두 고리의 끝 · 두 끈의 끝 · 고리 위
  { id: 'vow', no: 'II', cx: 528, cy: 146, s: 168, rot: 5, edges: [['kept', 'made'], ['kept', 'days'], ['days', 'year'], ['kept', 'circle'], ['kept', 'back']],
    stars: stars('vow', [['kept', 50, 47.5, 'kept', [1, 5, 20]], ['days', 89.5, 39.5, 'daysMax', [7, 30, 100]], ['circle', 76.5, 91, 'circle', [2, 5]], ['back', 23.5, 91, 'gap', [30], H], ['made', 10.5, 39.5, 'made', [1]], ['year', 78, 25, 'daysMax', [365], H]]) },
  // 긴 이야기 — 펼친 두루마리: 머리글자 · 위 가장자리 · 본문 한가운데 · 아랫단 · 매달린 봉인 · 오른쪽 축
  { id: 'long', no: 'III', cx: 935, cy: 142, s: 214, rot: -3, edges: [...chain('turns', 'active', 'mem'), ['turns', 'room'], ['room', 'ink'], ['ink', 'tall']],
    stars: stars('long', [['turns', 28, 37.5, 'turns', [100, 1000, 5000]], ['active', 44, 30, 'active', [30, 100, 365]], ['ink', 52, 52.5, 'ink', [100000, 500000, 2000000]], ['room', 30, 64.5, 'roomMax', [300, 1000]], ['tall', 61, 87.6, 'longest', [3000]], ['mem', 87.5, 25.5, 'mem', [10, 100, 500]]]) },
  // 밤샘 — 촛대의 초와 그믐달: 불꽃 · 불빛의 가장자리 · 초의 몸 · 달 · 접시의 가장자리 · 손잡이 고리 · 굽
  { id: 'night', no: 'IV', cx: 300, cy: 392, s: 190, rot: -6, edges: [['owl', 'streak'], ['owl', 'full'], ['owl', 'moons'], ['streak', 'dark'], ['streak', 'three'], ['dark', 'allday'], ['allday', 'three']],
    stars: stars('night', [['full', 25.5, 23, 'full', [1, 5, 12]], ['three', 77.5, 78, 'three', [1], H], ['owl', 46, 12.5, 'night', [1, 30, 200]], ['streak', 46, 58, 'streak', [3, 7, 30]], ['dark', 21, 78.5, 'dark', [1], H], ['moons', 87.6, 25.4, 'phases', [8]], ['allday', 46, 89.4, 'dayMax', [100], H]]) },
  // 갈림길 — 세 갈래 이정표: 뿌리 · 기둥의 갈림목 · 세 널빤지의 끝 · 꼭대기
  { id: 'fork', no: 'V', cx: 662, cy: 400, s: 178, rot: 3, edges: [...chain('swipe', 'branch', 'ten'), ['branch', 'cp'], ['branch', 'group'], ['swipe', 'deep']],
    stars: stars('fork', [['swipe', 50, 89, 'swipes', [10, 100, 1000]], ['branch', 50, 40, 'branch', [1, 5, 20]], ['cp', 11, 48.6, 'cps', [1, 10, 30]], ['ten', 50, 9.5, 'maxSwipes', [10], H], ['group', 89, 29.4, 'group', [1]], ['deep', 78.6, 67.4, 'deep', [2], H]]) },
  // 주사위꾼 — 가죽 컵과 주사위: 주사위의 여섯 모서리와 한가운데 · 컵의 입 · 멀리 튄 작은 주사위
  { id: 'dice', no: 'VI', cx: 1012, cy: 420, s: 196, rot: 4, edges: [...chain('crit', 'fights', 'boss', 'quests', 'minis', 'sessions', 'crit'), ['rolls', 'sessions'], ['rolls', 'fights'], ['rolls', 'quests'], ['sessions', 'places'], ['crit', 'fumble']],
    stars: stars('dice', [['crit', 68, 39.5, 'crit', [1, 5, 20]], ['fights', 87, 49.5, 'fights', [1, 10, 50]], ['boss', 87, 72.5, 'boss', [1, 5]], ['quests', 68, 83, 'quests', [1, 10, 30]], ['minis', 49, 72.5, 'minis', [1, 10, 30]], ['sessions', 49, 49.5, 'sessions', [1, 5, 20]], ['rolls', 68, 60, 'rolls', [10, 100]], ['places', 25, 33.5, 'places', [5, 30, 100]], ['fumble', 88, 22.2, 'fumble', [1], H]]) },
  // 마주 앉은 자리 — 등 아래 찻잔 둘: 등불 · 두 잔 · 가운데 꽃 · 피어오른 김 · 탁자의 발
  { id: 'scene', no: 'VII', cx: 152, cy: 600, s: 170, rot: 0, edges: [['scenes', 'calls'], ['scenes', 'illust'], ['calls', 'react'], ['illust', 'react'], ['calls', 'hours'], ['react', 'missed']],
    stars: stars('scene', [['scenes', 50, 25.4, 'scenes', [1, 10, 50]], ['calls', 30, 51.4, 'calls', [1, 10, 50]], ['illust', 70, 51.4, 'illust', [1, 20, 100]], ['react', 50.6, 46.2, 'react', [10, 100]], ['hours', 27.2, 36, 'callSecs', [3600, 36000], { unit: 3600 }], ['missed', 50, 92, 'missed', [1], H]]) },
  // 종이 서랍 — 열린 서랍과 편지: 손잡이 · 봉랍 · 봉투의 귀 · 접은 편지의 귀 · 서랍의 두 모서리
  { id: 'paper', no: 'VIII', cx: 505, cy: 606, s: 168, rot: -3, edges: [['tr', 'letters'], ['letters', 'dreams'], ['letters', 'diary'], ['diary', 'notes'], ['diary', 'keeps'], ['dreams', 'keeps']],
    stars: stars('paper', [['diary', 44, 72.6, 'diary', [1, 10, 50]], ['dreams', 87, 19.6, 'dreams', [1, 5, 20]], ['keeps', 90, 76, 'keeps', [1, 10, 30]], ['notes', 13, 89, 'notes', [1, 10]], ['letters', 50.4, 37.4, 'letters', [1, 3, 12]], ['tr', 38.6, 19, 'tr', [1, 50, 500]]]) },
  // 수집가 — 유리종 아래의 나비 표본: 꼭지 · 네 날개 끝 · 이름표
  { id: 'keep', no: 'IX', cx: 835, cy: 610, s: 176, rot: 6, edges: [['faces', 'masks'], ['faces', 'rooms'], ['masks', 'books'], ['rooms', 'entries'], ['books', 'met'], ['entries', 'met']],
    stars: stars('keep', [['faces', 50, 10.4, 'nChars', [5, 20, 50]], ['masks', 30, 34.6, 'personas', [2, 5]], ['rooms', 70, 34.6, 'rooms', [10, 50, 200]], ['books', 36, 66.6, 'lore', [3, 10]], ['entries', 64, 66.6, 'entries', [100, 500, 2000]], ['met', 50, 91.2, 'met', [3, 10, 30]]]) },
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
