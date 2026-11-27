// 사진이 앱에 꽂는 것들: 대화 모드의 사진 주고받기 안내(프롬프트 조각) · 명령 안내의 사진 줄 · 기록에 다시 싣는 보낸 사진 · [photo:] 받기 · 보낸 자리에 사진 말풍선 놓기
// 사진 주고받기를 켜지 않으면(기본) 예전과 같다: 명령 안내에 셀카 줄이 그대로 있고, 셀카는 장면 삽화로 그린다
import type { FeatureDef } from '../main';
import { useCss } from '../addons/parts';
import { X } from '../lib/hooks';
import { talkPhotos } from '../lib/engine';
import { photoHook } from '../chat/actions';
import { decorators } from '../scenebook/decorate';
import { historyText, noScene, photoLine, promptPieces, takeCommand } from '../photos/store';
import { decorateSent } from '../photos/chat';
import { hideCommands } from '../photos/prompt';

const OWNER = 'photos';
function setup() {
  useCss('photos.css');
  X.prompt = X.prompt.filter(p => p.owner !== OWNER);
  X.prompt.push({ owner: OWNER, fn: promptPieces });
  X.filters = X.filters.filter(f => f.owner !== OWNER);
  X.filters.push({ owner: OWNER, fn: (text, info) => info?.role === 'user' ? text : hideCommands(String(text)) });   // 받는 중에 사진 명령이 비치지 않게 (화면만)
  talkPhotos.line = photoLine; talkPhotos.history = historyText;
  photoHook.take = takeCommand; photoHook.noScene = noScene;
  if (!decorators.includes(decorateSent)) decorators.push(decorateSent);
}
export const feature: FeatureDef = { name: OWNER, setup };
