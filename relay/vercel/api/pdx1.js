// 미국 서부 (포틀랜드) 에서 도는 중계
import { relay } from '../lib/relay.js';
export const config = { runtime: 'edge', regions: ['pdx1'] };
export default request => relay(request, 'pdx1');
