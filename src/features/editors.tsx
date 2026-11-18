// 대화 장면 패널의 "프리셋 변수" 자리
import { createRoot, type Root } from 'react-dom/client';
import { PresetVarsPanel } from '../editors';
import { X } from '../lib/hooks';
import { t } from '../i18n';

export const feature = {
  name: 'editors',
  setup() {
    // 대화 장면 패널의 "프리셋 변수": 옛 패널을 빼고 React 판을 올린다 (패널을 다시 그릴 때 앞의 것은 내린다)
    let last: Root | null = null;
    X.panels = X.panels.filter(p => p.owner !== 'presetvars');
    X.panels.push({ owner: 'presetvars', id: 'presetvars', get title() { return t('presets.sec.vars'); }, icon: 'sliders', render: chat => {
      const box = document.createElement('div'); box.className = 'col pv-panel';
      const old = last, root = last = createRoot(box);
      root.render(<PresetVarsPanel chat={chat} />);
      if (old) setTimeout(() => old.unmount());
      return box;
    } });
  },
};
