// 기능이 꽂은 것(패널 · 메뉴 · 명령 · 프롬프트 조각)의 차례 맞추기와 대화 모드 설정 값
import { X } from '../lib/hooks';
import { mo } from '../lib/live';
import type { Modes } from './types';

// 다른 기능이 꽂은 것(패널 · 메뉴 항목 · 명령어 · 프롬프트 조각 · 생성 전 준비)이 놓이는 차례. 기능 모듈이 뜨는 순서가 바뀌어도 화면과 프롬프트가 늘 같은 차례로 나오게 한다
const OWNER_ORDER = ['clock', 'live', 'mode', 'illust', 'presetvars', 'translate', 'assets', 'expr', 'vectors', 'modules', 'scenebook', 'regex', 'almanac', 'memoria'];
const rank = (o?: string) => { const i = OWNER_ORDER.indexOf(o || ''); return i < 0 ? OWNER_ORDER.length : i; };
/** 꽂힌 것들을 정해 둔 차례로 다시 줄 세운다 (모르는 주인 — 확장 — 은 뒤에, 등록한 순서 그대로) */
export function orderHooks() {
  const by = (a: { owner?: string }, b: { owner?: string }) => rank(a.owner) - rank(b.owner);
  X.panels.sort(by); X.actions.sort(by);
  X.filters.sort((a, b) => (a.owner === 'core' ? -1 : rank(a.owner)) - (b.owner === 'core' ? -1 : rank(b.owner)));   // 본체 필터가 맨 앞
  X.composer.sort(by); X.before.sort(by); X.prompt.sort(by);
  const cmds = [...X.commands].sort((a, b) => by(a[1], b[1])); X.commands.clear(); for (const [k, v] of cmds) X.commands.set(k, v);
}
/** 대화 모드 설정 값 (숫자로) */
export const moN = (k: keyof Modes & string) => +(mo(k) as number) || 0;
