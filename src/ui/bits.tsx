// 작은 것들: 화면 머리말 · 토큰 수 꼬리표
import type { ReactNode } from 'react';

/** 화면 머리말: 작은 영문 꼬리표 + 제목 + 오른쪽 도구(children) */
export const PageHead = ({ eyebrow, title, children }: { eyebrow: ReactNode; title: ReactNode; children?: ReactNode }) =>
  <header className="phead"><div className="phead-text"><span className="eyebrow">{eyebrow}</span><h1>{title}</h1></div><div className="phead-side">{children}</div></header>;

export const TokBadge = ({ n }: { n: number }) => <span className="tokbadge">{`≈${n.toLocaleString()} 토큰`}</span>;
