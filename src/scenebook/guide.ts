// 삽화 사용법 글. 옛 f-scenebook.js 의 것을 그대로 옮겼다 — 글은 언어 파일의 scenebook.guide.* 에 있다
import { t } from '../i18n';

const STEPS = ['engine', 'cast', 'auto', 'prompt', 'draw'];
const TOPICS = ['format', 'framing', 'quickEdit', 'frame', 'look', 'menu', 'automatic', 'planMode', 'noPlan', 'analysis', 'budget', 'retry', 'seed', 'placement',
  'scope', 'refs', 'imageRead', 'anchor', 'delete', 'queue', 'presets', 'adult', 'missing', 'where', 'saving', 'progress', 'share', 'scopeCopy', 'refDelete', 'revise',
  'review', 'export', 'model', 'size', 'steps', 'guidance', 'sampler', 'rescale', 'quality', 'order', 'conn', 'maxScenes', 'context', 'style', 'transparent', 'display', 'player'];
const pair = (k: string): [string, string] => [t(`scenebook.guide.${k}.title`), t(`scenebook.guide.${k}.body`)];
/** 처음 쓰는 사람을 위한 단계 [제목, 설명] */
export const guideSteps = (): [string, string][] => STEPS.map(k => pair('step.' + k));
/** 찾아볼 수 있는 기능 설명 [제목, 설명] */
export const guideTopics = (): [string, string][] => TOPICS.map(k => pair('topic.' + k));
