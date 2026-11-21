// 미국 서부 (샌프란시스코) 에서 도는 중계
import { relay } from '../lib/relay.js';
export const config = { runtime: 'edge', regions: ['sfo1'] };
export default request => relay(request, 'sfo1');
