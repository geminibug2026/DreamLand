// 영국 (런던) 에서 도는 중계
import { relay } from '../lib/relay.js';
export const config = { runtime: 'edge', regions: ['lhr1'] };
export default request => relay(request, 'lhr1');
