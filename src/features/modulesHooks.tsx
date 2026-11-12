// 모듈의 등록(프롬프트 조각 · 글 걸러내기 · chat:open / route 이벤트 · 장면 패널 자리). 패널 내용은 features/modulesPanel.tsx 가 채운다 — 이름 차례가 그보다 앞이어야 한다
import { X } from '../lib/hooks';
import { wireModules } from '../modules/logic';
import { t } from '../i18n';

export const feature = {
  name: 'modules-hooks',
  setup() {
    wireModules();
    X.panels = X.panels.filter((p: { owner?: string }) => p.owner !== 'modules');
    X.panels.push({ owner: 'modules', id: 'modules', get title() { return t('modules.panel.title'); }, icon: 'panel', render: () => { const box = document.createElement('div'); box.className = 'col mod-panel'; return box; } });
  },
};
