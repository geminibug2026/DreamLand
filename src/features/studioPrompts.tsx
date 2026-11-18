// 기능 화면의 등록: X.covered · 'mode' · 'illust' 프롬프트 조각
import { registerStudioPrompts } from '../studio/prompts';

export const feature = { name: 'studio-prompts', setup: registerStudioPrompts };
