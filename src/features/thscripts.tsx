// 실리태번 스크립트: 앱이 뜨면 켜 둔 스크립트를 다시 돌린다
import { load } from '../lib/thscripts';

function setup() { void load(); }

export const feature = { name: 'thscripts', setup };
