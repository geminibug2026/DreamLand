// 등불지기(앱 안의 조수)와 첫걸음 안내 — 등록만 한다. 머리는 src/guide/agent.ts, 화면은 src/guide/ui.tsx · Tour.tsx
import type { FeatureDef } from '../main';
import { S, on } from '../lib/core';
import { X } from '../lib/hooks';
import { I } from '../lib/icons';
import { useCss } from '../addons/parts';
import { t } from '../i18n';
import { G, closeGuide, openGuide } from '../guide/agent';
import { mountGuide } from '../guide/ui';
import { maybeOffer, startTour } from '../guide/Tour';

const OWNER = 'guide';
// 아이콘: 책갈피에 걸린 등불 (24 격자 한 줄 path)
if (!I.guide) I.guide = 'M5 3h8v18l-4-3.4L5 21zM13 6h3.2q2 0 2 2v1M16.2 9.5h4M16.6 10.8l-.8 5h4.8l-.8-5M15 16.8h6.4M18.2 12.4v1.6';

/** 열려 있으면 닫고, 닫혀 있으면 연다 */
export const toggleGuide = () => { if (G.open) closeGuide(); else openGuide(); };

function setup() {
  useCss('guide.css');
  mountGuide();
  // Ctrl/⌘+J: 어느 화면에서든
  addEventListener('keydown', e => { if ((e.ctrlKey || e.metaKey) && !e.altKey && !e.shiftKey && e.key.toLowerCase() === 'j') { e.preventDefault(); toggleGuide(); } });
  on('guide:toggle', toggleGuide); on('guide:tour', () => startTour());

  // 대화에서 바로 묻기: 입력창 + 메뉴와 메시지 ⋯ 메뉴 (모델은 사용자가 보내기를 눌러야 불린다)
  X.composer = X.composer.filter(a => a.owner !== OWNER);
  X.composer.push({ owner: OWNER, id: 'guide-ask', get label() { return t('guide.entry.ask'); }, icon: 'guide', run: () => openGuide() });
  X.actions = X.actions.filter(a => a.owner !== OWNER);
  X.actions.push({ owner: OWNER, id: 'guide-why', get label() { return t('guide.entry.why'); }, icon: 'guide', run: () => openGuide({ draft: t('guide.cmd.why.name') + ' ', fresh: true }) });
  X.commands.set('/guide', { owner: OWNER, get help() { return t('guide.entry.cmd'); }, run: () => openGuide() });
  X.commands.set('/tour', { owner: OWNER, get help() { return t('guide.tour.again'); }, run: () => startTour() });

  // 처음 온 사람에게만, 첫 화면이 자리 잡은 뒤 조용히 제안한다
  if (!S.settings.onboarded) setTimeout(maybeOffer, 1200);
}
export const feature: FeatureDef = { name: 'guide', setup };
