// 밤의 게시판 화면: 내 캐릭터들이 대화 밖에서 꽂아 두는 쪽지 (본체는 src/feed/ui.tsx). arg 로 글 id 를 받으면 그 글로 간다
import { Board } from '../feed/ui';

export const page = { name: 'feed', Component: Board };
