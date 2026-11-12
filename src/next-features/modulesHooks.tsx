// 2단계에서 켠다
// 옛 js/f-modules.js 가 뜨면서 하던 등록(프롬프트 조각 · 글 걸러내기 · chat:open / route 이벤트 · 장면 패널 자리)을 TS 판으로 한다.
// 지금 켜면 옛 f-modules.js 와 두 번 등록되므로 feature 가 아닌 이름으로 내보낸다. 켤 때: 이름을 feature 로 바꾸고 boot.js FEATURES 에서 'f-modules' 를 뺀다.
// 패널의 내용은 features/modulesPanel.tsx 가 owner "modules" 패널을 찾아 render 를 바꿔 끼운다 — features/ 로 옮길 때 이름 차례가 modulesPanel 보다 앞이어야 한다(예: modulesHooks.tsx)
import { X } from '../lib/hooks';
import { wireModules } from '../modules/logic';

export const modulesHooksFeature = {
  name: 'modules-hooks',
  setup() {
    wireModules();
    X.panels = X.panels.filter((p: { owner?: string }) => p.owner !== 'modules');
    X.panels.push({ owner: 'modules', id: 'modules', title: '이 대화방의 모듈', icon: 'panel', render: () => { const box = document.createElement('div'); box.className = 'col mod-panel'; return box; } });
  },
};
