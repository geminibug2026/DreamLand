// 편집 화면 공용: 오류 글 · 지금 화면 다시 그리기
import { emit } from '../lib/core';
import { refresh, route } from '../lib/router';

export const errMsg = (e: unknown) => e instanceof Error ? e.message : String(e);
/** 지금 화면을 다시 그리게 한다 (옛 refresh 자리): 홈은 알림으로, 다른 화면은 다시 그린다 */
export const pageRefresh = () => { if (route.page === 'home') emit('chars', null); else refresh(); };
