// 삽화 엔진(src/lib/illust.ts)을 이 묶음의 자료 꼴로 본다 — 같은 객체다
import { Illust as engine } from '../lib/illust';
import type { IllustApi } from './types';

export const Illust = engine as unknown as IllustApi;
