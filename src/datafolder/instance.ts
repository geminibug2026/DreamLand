// 지금 돌고 있는 거울 하나 (src/features/datafolder.tsx 가 정한다)
import type { Mirror } from './mirror';
let cur: Mirror | null = null;
export const setMirror = (m: Mirror) => { cur = m; };
export const getMirror = () => cur;
