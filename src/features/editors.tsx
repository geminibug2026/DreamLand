// 편집 화면 묶음을 옛 자리에 끼운다: 캐릭터 프로필 창 · 캐릭터 편집기 · 카드 가져오기 · 프리셋 변수 패널
import { createRoot, type Root } from 'react-dom/client';
import { L } from '../legacy';
import { PresetVarsPanel, charEditor, charSheet, importDialog } from '../editors';
import { NEEDS, hooks } from '../editors/bridge';

export const feature = {
  name: 'editors', needs: NEEDS,
  setup() {
    // React 화면은 L.editors 로 부른다 — 그 자리를 React 판으로 바꾼다. 옛 화면이 js/editors.js 에서 직접 가져다 쓰는 것은 옛 것 그대로 동작한다
    L.editors = { ...L.editors, charSheet, charEditor, importDialog: accept => importDialog(accept) };
    // 대화 장면 패널의 "프리셋 변수": 옛 패널을 빼고 React 판을 올린다 (패널을 다시 그릴 때 앞의 것은 내린다)
    const X = hooks(); let last: Root | null = null;
    X.panels = X.panels.filter(p => p.owner !== 'presetvars');
    X.panels.push({ owner: 'presetvars', id: 'presetvars', title: '프리셋 변수', icon: 'sliders', render: chat => {
      const box = document.createElement('div'); box.className = 'col pv-panel';
      const old = last, root = last = createRoot(box);
      root.render(<PresetVarsPanel chat={chat} />);
      if (old) setTimeout(() => old.unmount());
      return box;
    } });
  },
};
