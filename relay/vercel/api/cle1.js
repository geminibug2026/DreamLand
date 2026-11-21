// 미국 동부 (클리블랜드) 에서 도는 중계
import { relay } from '../lib/relay.js';
export const config = { runtime: 'edge', regions: ['cle1'] };
export default request => relay(request, 'cle1');
