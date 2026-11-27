// 처음 쓸 때 코드를 받는 부품 · 함수: 켤 때 읽고 푸는 코드를 줄인다 (그 기능을 쓰지 않는 사람은 끝까지 받지 않는다)
import { Suspense, createElement, lazy, type ComponentType } from 'react';

/** 처음 그릴 때 코드를 받는 React 부품. 받는 동안은 아무것도 그리지 않는다 */
export function lazyComp<P extends object>(load: () => Promise<ComponentType<P>>): ComponentType<P> {
  const L = lazy(() => load().then(c => ({ default: c })));
  const W = (p: P) => createElement(Suspense, { fallback: null }, createElement(L as unknown as ComponentType<P>, p));
  return W;
}
