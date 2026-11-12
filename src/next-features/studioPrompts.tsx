// 2단계에서 켠다
// 옛 js/studio.js 가 뜨면서 하던 등록(X.covered · 'mode' · 'illust' 프롬프트 조각)을 TS 판으로 한다.
// 주인 이름으로 옛 조각을 걸러 낸 뒤 넣으므로 두 번 실리지는 않지만, 옛 studio.js 가 남아 있는 동안은 켜지 않는다. 켤 때: 이름을 feature 로 바꾸고 boot.js 의 import './studio.js' 를 뺀다
import { registerStudioPrompts } from '../studio/prompts';

export const studioPromptsFeature = { name: 'studio-prompts', setup: registerStudioPrompts };
