// 잠깐 떴다 사라지는 알림 (#toasts). kind: '' | 'err' | 'ok' …
// 누르거나 × 를 누르면 바로 닫힌다 (안의 버튼 — 되돌리기 등 — 은 그대로 눌린다)
import { t as tr } from '../i18n';

export function toast(msg: string | Node, kind = '') {
  const t = document.createElement('div'); t.className = kind ? `toast ${kind}` : 'toast'; t.setAttribute('role', kind === 'err' ? 'alert' : 'status');
  const body = document.createElement('span'); body.className = 'toast-msg'; body.append(msg);
  const x = document.createElement('button'); x.type = 'button'; x.className = 'toast-x'; x.textContent = '×'; x.title = tr('common.close'); x.setAttribute('aria-label', tr('common.close'));
  t.append(body, x);
  let gone = false;
  const close = () => { if (gone) return; gone = true; clearTimeout(timer); t.classList.add('out'); setTimeout(() => t.remove(), 300); };
  t.addEventListener('click', e => { const b = (e.target as Element).closest('button, a'); if (b && b !== x) return; close(); });
  document.getElementById('toasts')!.append(t);
  const timer = setTimeout(close, kind === 'err' ? 6000 : 2600);
}
