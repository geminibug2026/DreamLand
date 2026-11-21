// 변수 갱신 틀(MVU)의 가벼운 도우미: 메시지 변수에 이 틀의 자료가 있는지 · 매크로가 값을 꺼내는 일.
// 갱신 명령을 읽고 적용하는 무거운 부분(YAML · JSON5 읽기 포함)은 runtime.ts 에 있고, 쓰는 대화에서만 불러온다.
import { get } from './lo';
export type { MvuData } from './types';
export type Obj = Record<string, unknown>;

const isObj = (v: unknown): v is Obj => !!v && typeof v === 'object' && !Array.isArray(v);
export const clone = <T,>(v: T): T => v == null ? v : JSON.parse(JSON.stringify(v)) as T;
/** 메시지 변수에 이 틀의 자료가 들어 있는가 */
export const isMvu = (v: unknown): v is Obj & { stat_data: Obj } => isObj(v) && isObj(v.stat_data);
const isVwd = (v: unknown): v is [unknown, string] => Array.isArray(v) && v.length === 2 && typeof v[1] === 'string';
export const getAt = (root: unknown, path: string | string[]) => get(root, path);

/** 경로의 값을 글로: 객체 · 배열은 JSON */
export function readVar(root: unknown, path: string): string {
  const v = path ? get(root, path) : root; if (v === undefined || v === null) return '';
  return typeof v === 'object' ? JSON.stringify(v) : String(v);
}
/** 보기 좋게: 들여쓴 YAML 비슷한 글 */
export function formatVar(root: unknown, path: string): string {
  const v = path ? get(root, path) : root; if (v === undefined || v === null) return '';
  const line = (x: unknown, ind: string): string => {
    if (isVwd(x)) return JSON.stringify(x);
    if (Array.isArray(x)) return x.length ? '\n' + x.map(i => `${ind}- ${line(i, ind + '  ').replace(/^\n\s*/, '')}`).join('\n') : '[]';
    if (isObj(x)) { const ks = Object.keys(x); return ks.length ? '\n' + ks.map(k => `${ind}${k}: ${line(x[k], ind + '  ')}`).join('\n') : '{}'; }
    return typeof x === 'string' ? x : JSON.stringify(x);
  };
  return line(v, '').replace(/^\n/, '');
}
/** 무거운 부분 (처음 부를 때 한 번 불러온다) */
export const runtime = () => import('./runtime');
