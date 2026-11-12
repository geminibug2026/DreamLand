// 팝업 메뉴: 누른 것(anchor) 아래에 뜨고, 자리가 없으면 위로. 바깥을 누르거나 항목을 고르면 닫힌다
import { flushSync } from 'react-dom';
import { createRoot } from 'react-dom/client';
import { Icon } from '../kit';

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
  flushSync(() => root.render(<>{items.filter(it => !!it).map((it, i) => it === '-' ? <hr key={i} /> :
    <button key={i} className={'menu-item' + (it.danger ? ' danger' : '')} onClick={() => { close(); it.onclick(); }}>{it.ic && <Icon name={it.ic} size={16} />}<span>{it.label}</span>{it.hint && <small>{it.hint}</small>}</button>)}</>));
  const r = anchor.getBoundingClientRect(), w = el.offsetWidth, hh = el.offsetHeight;
  el.style.left = Math.max(8, Math.min(innerWidth - w - 8, r.left)) + 'px';
  el.style.top = (r.bottom + hh + 8 > innerHeight ? Math.max(8, r.top - hh - 6) : r.bottom + 6) + 'px';
  timer = window.setTimeout(() => document.addEventListener('mousedown', off, true));
  closeCur = close;
}
