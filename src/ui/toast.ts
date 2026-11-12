// 잠깐 떴다 사라지는 알림 (#toasts). kind: '' | 'err' | 'ok' …
export function toast(msg: string | Node, kind = '') {
  const t = document.createElement('div'); t.className = kind ? `toast ${kind}` : 'toast'; t.append(msg);
  document.getElementById('toasts')!.append(t);
  setTimeout(() => { t.classList.add('out'); setTimeout(() => t.remove(), 400); }, kind === 'err' ? 6000 : 2600);
}
