// ── Dreamland f-lore: 로어북 편집기의 화면 아닌 부분 (옛 js/f-lore.js 의 LORE_POS · loreLinks) ──
import { S } from './core';

interface Linked { loreIds?: string[] }
interface LStore { chars: Linked[]; personas: Linked[]; chats: Linked[] }
const St = S as unknown as LStore;

export const LORE_POS: [string, string][] = [['before', '캐릭터 설명 앞'], ['after', '캐릭터 설명 뒤'], ['em_top', '대화 예시 앞'], ['em_bottom', '대화 예시 뒤'], ['an_top', '작가 노트 위'], ['an_bottom', '작가 노트 아래'], ['depth', '대화 깊이에 삽입'], ['outlet', '아울렛 ({{outlet::이름}})']];
/** 이 로어북이 묶인 곳 ("캐릭터 2" 처럼) */
export const loreLinks = (b: { id: string }) => { const n = (list: Linked[]) => list.filter(x => (x.loreIds || []).includes(b.id)).length, c = n(St.chars), p = n(St.personas), r = n(St.chats); return [c && `캐릭터 ${c}`, p && `페르소나 ${p}`, r && `대화방 ${r}`].filter(Boolean) as string[]; };
