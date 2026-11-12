// 편집 화면 공통 부품
import { useLayoutEffect, useMemo, useReducer, useRef } from 'react';
import type { LibApi } from '../ui';
import { core } from './bridge';

export const useBump = () => useReducer((x: number) => x + 1, 0)[1];
/** 한 번 만들어 계속 쓰는 지연 호출 (옛 debounce). 늘 가장 새 함수를 부르고, 떠난 뒤에도 기다리던 것은 불린다 */
export function useDebounced<A extends unknown[]>(fn: (...a: A) => unknown, ms = 300): (...a: A) => void {
  const cb = useRef(fn);
  useLayoutEffect(() => { cb.current = fn; });
  return useMemo(() => core().debounce((...a: A) => cb.current(...a), ms), [ms]);
}

/** 옛 코드가 만든 DOM 을 끼운다. kit 의 Dom 과 달리 다시 그려도 같은 노드면 건드리지 않는다 (그 안에서 입력 중인 칸의 포커스가 날아가지 않게) */
export function Host({ node }: { node: Node | null | undefined }) {
  const ref = useRef<HTMLSpanElement>(null);
  useLayoutEffect(() => { const el = ref.current; if (el && (el.firstChild !== (node ?? null) || el.childNodes.length > 1)) el.replaceChildren(...(node ? [node] : [])); }, [node]);
  return <span style={{ display: 'contents' }} ref={ref} />;
}

export interface EditorApi extends LibApi { /** 편집기를 통째로 새로 만든다 (옛 refresh 자리). 지운 뒤에 부르면 빈 자리가 된다 */ refresh(): void }
export const editorApi = (api: LibApi, id: string): EditorApi => ({ ...api, refresh: () => api.reselect(id) });
