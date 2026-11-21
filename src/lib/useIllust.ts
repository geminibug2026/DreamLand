// 삽화 한 장의 화면용 주소. 아직 안 읽었으면 '', 읽어 봤는데 없는 그림이면 GONE. 읽히면 다시 그린다
import { useSyncExternalStore } from 'react';
import { Illust } from './illust';

export const GONE = '#gone';
const sub = (f: () => void) => Illust.onPic(f);
export const useIllustUrl = (id: string) => useSyncExternalStore(sub, () => Illust.url(id) || (Illust.missing(id) ? GONE : ''), () => '');
