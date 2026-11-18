// Memory 객체 조립 — 옛 memory.js 와 같은 순서로 다섯 조각을 합친다 (이벤트는 events.ts 가 이 파일에서 가져다 쓴다)
import type { MemoryApi } from './api';
import { part1 } from './part1';
import { part2 } from './part2';
import { part3 } from './part3';
import { part4 } from './part4';
import { part5 } from './part5';
export const Memory: MemoryApi = { ...part1, ...part2, ...part3, ...part4, ...part5 };
