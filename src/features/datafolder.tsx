// 자료 폴더 거울: 브라우저 저장소에 쓰는 모든 것을 서버의 data/store 에도 보낸다 (src/datafolder/mirror.ts)
import { mod } from '../legacy';
import { installMirror, type MirrorDb } from '../datafolder/mirror';
import { setMirror } from '../datafolder/instance';
import { toast } from '../ui';

export const feature = {
  name: 'datafolder', needs: ['core'],
  setup() {
    // 파일로 열었으면(서버 없음) 감싸지 않는다 — 앱은 지금처럼 돈다
    if (!/^https?:$/.test(location.protocol)) return;
    const DB = mod<{ DB: MirrorDb }>('core').DB;
    setMirror(installMirror(DB, { toast: (m, k) => toast(m, k) }));   // 맞추기는 뒤에서 돈다 (첫 화면을 막지 않는다)
  },
};
