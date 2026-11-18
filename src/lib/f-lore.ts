// ── Dreamland f-lore: 로어북 편집기의 화면 아닌 부분 (옛 js/f-lore.js 의 LORE_POS · loreLinks) ──
import { S } from './core';
import { t } from '../i18n';

export const LORE_POS: [string, string][] = [['before', '캐릭터 설명 앞'], ['after', '캐릭터 설명 뒤'], ['em_top', '대화 예시 앞'], ['em_bottom', '대화 예시 뒤'], ['an_top', '작가 노트 위'], ['an_bottom', '작가 노트 아래'], ['depth', '대화 깊이에 삽입'], ['outlet', '아울렛 ({{outlet::이름}})']];
/** 삽입 위치 선택지 (화면용 · 지금 언어로). LORE_POS 는 한국어 원문 그대로 둔다 */
export const lorePosOpts = (): [string, string][] => LORE_POS.map(([v]) => [v, t('lore.pos.' + v)]);
/** 이 로어북이 묶인 곳 ("캐릭터 2" 처럼). 꺼 두어도 여기서는 쓰인다 */
export const loreLinks = (b: { id: string }): string[] => { const n = (list: { loreIds?: string[] }[]) => list.filter(x => (x.loreIds || []).includes(b.id)).length, c = n(S.chars), p = n(S.personas), r = n(S.chats); return [c && t('lore.links.chars', { n: c }), p && t('lore.links.personas', { n: p }), r && t('lore.links.chats', { n: r })].filter((x): x is string => !!x); };
