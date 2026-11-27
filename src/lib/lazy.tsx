// 처음 쓸 때 코드를 받는 부품 · 함수: 켤 때 읽고 푸는 코드를 줄인다 (그 기능을 쓰지 않는 사람은 끝까지 받지 않는다)
import { Suspense, createElement, lazy, useState, type ComponentType } from 'react';

/** 코드를 미리 받아 둘 수 있는 부품 */
export type LazyComp<P extends object> = ComponentType<P> & { preload(): Promise<unknown> };

/**
 * 처음 그릴 때 코드를 받는 React 부품. 받는 동안은 아무것도 그리지 않는다.
 * preload() 로 한가할 때 미리 받아 두면, 그 뒤로는 기다림 없이 바로 그린다 (빈 화면 한 번도 거치지 않게)
 */
export function lazyComp<P extends object>(load: () => Promise<ComponentType<P>>): LazyComp<P> {
  let got: ComponentType<P> | null = null, wait: Promise<ComponentType<P>> | null = null;
  const get = () => wait ||= load().then(c => (got = c), e => { wait = null; throw e; });
  const L = lazy(() => get().then(c => ({ default: c })));
  // 처음 그릴 때 이미 받아 둔 코드면 바로, 아니면 기다리는 길로. 한 번 정한 길은 바꾸지 않는다 (도중에 바꾸면 안의 상태가 날아간다)
  const W = ((p: P) => { const [now] = useState(() => got); return now ? createElement(now, p) : createElement(Suspense, { fallback: null }, createElement(L as unknown as ComponentType<P>, p)); }) as LazyComp<P>;
  W.preload = () => get().catch(() => { });
  return W;
}
