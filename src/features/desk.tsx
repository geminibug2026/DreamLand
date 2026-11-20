// 책상(홈 위젯)이 앱에 꽂는 것: 스타일과 내장 위젯 등록. 전부 저장된 데이터만 읽는다 — 모델 호출 0
import type { FeatureDef } from '../main';
import { useCss } from '../addons/parts';
import { t } from '../i18n';
import { registerWidget, touchVisit } from '../desk/registry';
import { Glyph } from '../desk/art';
import { Sky } from '../desk/widgets/sky';
import { Bond } from '../desk/widgets/bond';
import { Waiting } from '../desk/widgets/waiting';
import { Resume } from '../desk/widgets/resume';
import { Record } from '../desk/widgets/record';
import { Memo } from '../desk/widgets/memo';
import { Quote } from '../desk/widgets/quote';
import { Quick } from '../desk/widgets/quick';
import { AtlasMini } from '../atlas/ui';

function setup() {
  useCss('desk.css');
  touchVisit();
  // 등록한 순서가 처음 배치다. 사용자가 옮긴 뒤로는 settings.desk.order 를 따른다
  registerWidget({ id: 'sky', get title() { return t('desk.w.sky'); }, get hint() { return t('desk.w.skyHint'); }, size: 'l', bare: true, art: () => <Glyph name="sky" />, render: () => <Sky /> });
  registerWidget({ id: 'bond', get title() { return t('desk.w.bond'); }, get hint() { return t('desk.w.bondHint'); }, size: 's', art: () => <Glyph name="bond" />, render: () => <Bond /> });
  registerWidget({ id: 'waiting', get title() { return t('desk.w.waiting'); }, get hint() { return t('desk.w.waitingHint'); }, size: 's', art: () => <Glyph name="waiting" />, render: () => <Waiting /> });
  registerWidget({ id: 'resume', get title() { return t('desk.w.resume'); }, get hint() { return t('desk.w.resumeHint'); }, size: 's', art: () => <Glyph name="resume" />, render: () => <Resume /> });
  registerWidget({ id: 'record', get title() { return t('desk.w.record'); }, get hint() { return t('desk.w.recordHint'); }, size: 's', art: () => <Glyph name="record" />, render: () => <Record /> });
  registerWidget({ id: 'quote', get title() { return t('desk.w.quote'); }, get hint() { return t('desk.w.quoteHint'); }, size: 's', art: () => <Glyph name="quote" />, render: () => <Quote /> });
  registerWidget({ id: 'memo', get title() { return t('desk.w.memo'); }, get hint() { return t('desk.w.memoHint'); }, size: 's', art: () => <Glyph name="memo" />, render: () => <Memo /> });
  registerWidget({ id: 'quick', get title() { return t('desk.w.quick'); }, get hint() { return t('desk.w.quickHint'); }, size: 'm', art: () => <Glyph name="quick" />, render: () => <Quick /> });
  // 다른 기능의 작은 요약. 제 틀을 가진 물건이라 bare 로 놓는다 (스타일은 그 기능이 건다)
  registerWidget({ id: 'atlas', get title() { return t('desk.w.atlas'); }, get hint() { return t('desk.w.atlasHint'); }, size: 's', bare: true, art: () => <Glyph name="atlas" />, render: () => <AtlasMini /> });
  // 소식(src/feed)의 FeedMini 가 생기면 여기에 한 줄:
  //   import { FeedMini } from '../feed/ui';
  //   registerWidget({ id: 'feed', get title() { return t('feed.title'); }, size: 'm', render: () => <FeedMini /> });
}

export const feature: FeatureDef = { name: 'desk', setup };
