// 독일 (프랑크푸르트) 에서 도는 중계
import { relay } from '../lib/relay.js';
export const config = { runtime: 'edge', regions: ['fra1'] };
export default request => relay(request, 'fra1');
