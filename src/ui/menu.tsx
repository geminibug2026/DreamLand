// 팝업 메뉴: 누른 것(anchor) 아래에 뜨고, 자리가 없으면 위로. 바깥을 누르거나 항목을 고르면 닫힌다
import { flushSync } from 'react-dom';
import { createRoot } from 'react-dom/client';
import { Icon } from '../kit';
import { t } from '../i18n';

/** 메뉴 한 줄. '-' 는 구분선, 거짓 값(조건 && { … } 의 결과)은 건너뛴다 */
import type { MenuItem } from '../lib/types';
export type { MenuItem };

let closeCur: (() => void) | null = null;

/** items: { label, ic?, hint?, danger?, onclick } 또는 '-'(구분선). null · false 는 건너뛴다 */
export function menu(anchor: Element, items: MenuItem[]) {
  closeCur?.(); document.querySelector('.menu')?.remove();   // 옛 코드가 띄운 메뉴도 함께 닫는다
  const el = document.createElement('div'); el.className = 'menu'; document.body.append(el);
  const root = createRoot(el);
  let timer = 0;
  const off = (e: MouseEvent) => { if (!(e.target instanceof Node && el.contains(e.target))) close(); };
  const close = () => {
    if (closeCur === close) closeCur = null;
    clearTimeout(timer); document.removeEventListener('mousedown', off, true);
    el.remove(); setTimeout(() => root.unmount());
  };
  // 좁은 화면에서는 메뉴가 화면을 덮어 바깥을 누를 자리가 없을 수 있다. 맨 위에 늘 보이는 닫기 줄을 둔다 (넓은 화면에서는 CSS 가 숨긴다)
  flushSync(() => root.render(<><button type="button" className="menu-x" onClick={() => close()}><Icon name="x" size={15} /><span>{t('common.close')}</span></button>{items.filter(it => !!it).map((it, i) => it === '-' ? <hr key={i} /> :
    <button key={i} className={'menu-item' + (it.danger ? ' danger' : '')} onClick={() => { close(); it.onclick(); }}>{it.ic && <Icon name={it.ic} size={16} />}<span className="mi-t"><span>{it.label}</span>{it.hint && <small>{it.hint}</small>}</span></button>)}</>));
  const r = anchor.getBoundingClientRect(), w = el.offsetWidth, hh = el.offsetHeight;
  el.style.left = Math.max(8, Math.min(innerWidth - w - 8, r.left)) + 'px';
  // 아래에 자리가 없으면 위로, 위에도 다 안 들어가면 화면 아래쪽에 붙인다 (어느 쪽이든 화면 밖으로 나가지 않게)
  const below = r.bottom + 6, above = r.top - hh - 6;
  el.style.top = (below + hh + 8 <= innerHeight ? below : above >= 8 ? above : Math.max(8, innerHeight - hh - 8)) + 'px';
  timer = window.setTimeout(() => document.addEventListener('mousedown', off, true));
  closeCur = close;
}
