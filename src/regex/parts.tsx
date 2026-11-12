// 정규식 시험 창 · 디버거가 함께 쓰는 글 조각 그리기
import type { ReactNode } from 'react';
import { Lint, type Issue, type Match } from './lib';

const MAX_SHOW = 40000;
const more = (n: number) => <span className="rx-more" key="more">{` … 뒤 ${n.toLocaleString()}자는 줄였어요`}</span>;

/** 바뀐 곳: 지워진 글과 들어간 글을 나란히 */
export function DiffText({ text, matches }: { text: string; matches?: Match[] }) {
  const out: ReactNode[] = []; let used = 0, k = 0;
  for (const p of Lint.diffParts(text, matches)) {
    if (used > MAX_SHOW) { out.push(more(text.length - used)); break; }
    if (p.t !== undefined) { out.push(p.t); used += p.t.length; continue; }
    if (p.del) out.push(<del key={k++}>{p.del}</del>);
    if (p.ins) out.push(<ins key={k++}>{p.ins}</ins>);
    if (!p.del && !p.ins) out.push(<ins className="rx-nil" key={k++}>∅</ins>);
    used += p.del.length + p.ins.length;
  }
  return <pre className="rx-text">{out}</pre>;
}
/** 찾은 곳: 원문에 표시만 */
export function HitsText({ text, matches }: { text: string; matches?: Match[] }) {
  const out: ReactNode[] = []; let used = 0, k = 0;
  for (const p of Lint.hitParts(text, matches)) {
    if (used > MAX_SHOW) { out.push(more(text.length - used)); break; }
    out.push(p.hit ? <mark key={k++} title={`${(p.i ?? 0) + 1}번째로 찾은 곳`}>{p.t || '∅'}</mark> : p.t); used += p.t.length;
  }
  return <pre className="rx-text">{out}</pre>;
}
export const PlainText = ({ text }: { text: string }) => <pre className="rx-text">{text.length > MAX_SHOW ? text.slice(0, MAX_SHOW) + ` … 뒤 ${(text.length - MAX_SHOW).toLocaleString()}자는 줄였어요` : text}</pre>;
export const Issues = ({ issues }: { issues: Issue[] }) => <ul className="rx-issues">{issues.map((x, i) => <li className={x.level} key={i}><i aria-hidden="true">{x.level === 'error' ? '오류' : x.level === 'warn' ? '주의' : '참고'}</i><span>{x.msg}</span></li>)}</ul>;
