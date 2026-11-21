// 미국 동부 (워싱턴 DC) 에서 도는 중계
import { relay } from '../lib/relay.js';
export const config = { runtime: 'edge', regions: ['iad1'] };
export default request => relay(request, 'iad1');
