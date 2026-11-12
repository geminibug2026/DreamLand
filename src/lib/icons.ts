// 아이콘 표와 DOM 아이콘 · 단추 (옛 js/ui.js 의 I · icon · btn · iconBtn 그대로). btn · iconBtn 은 옛 확장 API 가 쓴다
import { h } from './core';

export const I: Record<string, string> = {
  home: 'M3 11l9-8 9 8v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z', chat: 'M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z',
  book: 'M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2zM4 21V5M8 8h7', sliders: 'M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12M16 4v4M10 10v4M18 16v4',
  user: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 21a8 8 0 0 1 16 0', code: 'M8 6l-6 6 6 6M16 6l6 6-6 6M14 4l-4 16', plug: 'M9 2v6M15 2v6M6 8h12v4a6 6 0 0 1-12 0zM12 18v4',
  import: 'M12 3v12M7 10l5 5 5-5M4 21h16', upload: 'M12 15V3M7 8l5-5 5 5M4 21h16', gear: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M4.9 19.1L7 17M17 7l2.1-2.1',
  plus: 'M12 5v14M5 12h14', x: 'M6 6l12 12M18 6L6 18', send: 'M4 12l16-8-6 16-3-7z', stop: 'M7 7h10v10H7z', edit: 'M4 20h4L19 9l-4-4L4 16zM14 6l4 4',
  trash: 'M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13', copy: 'M9 9h11v11H9zM5 15V4h11', refresh: 'M20 11a8 8 0 1 0-2.3 6.3M20 4v7h-7', left: 'M15 5l-7 7 7 7', right: 'M9 5l7 7-7 7',
  link: 'M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1', merge: 'M6 3v6c0 4 6 4 6 9v3M18 3v6c0 4-6 4-6 9M9 18l3 3 3-3', mark: 'M6 3h12v18l-6-4-6 4z',
  branch: 'M6 3v12M6 15a3 3 0 1 0 0 6 3 3 0 0 0 0-6zM18 3a3 3 0 1 0 0 6 3 3 0 0 0 0-6zM18 9c0 5-12 3-12 9', eye: 'M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12zM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z',
  eyeoff: 'M3 3l18 18M10.6 5.2A9.7 9.7 0 0 1 12 5c6 0 10 7 10 7a17 17 0 0 1-3.2 4M6.5 6.6C3.7 8.4 2 12 2 12s4 7 10 7c1.6 0 3-.4 4.3-1M9.9 9.9a3 3 0 0 0 4.2 4.2',
  more: 'M5 12h.01M12 12h.01M19 12h.01', lock: 'M6 11h12v9H6zM9 11V8a3 3 0 0 1 6 0v3', star: 'M12 3l2.7 5.6 6.1.8-4.5 4.3 1.1 6.1L12 17l-5.4 2.8 1.1-6.1L3.2 9.4l6.1-.8z', moon: 'M20 14.5A8 8 0 0 1 9.5 4 8 8 0 1 0 20 14.5z',
  search: 'M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14zM21 21l-5-5', dice: 'M5 3h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2zM8 8h.01M16 16h.01M12 12h.01M16 8h.01M8 16h.01',
  panel: 'M3 4h18v16H3zM15 4v16', play: 'M7 4l13 8-13 8z', users: 'M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM2 21a7 7 0 0 1 14 0M17 3.5a4 4 0 0 1 0 7.5M22 21a7 7 0 0 0-4-6.3',
  lang: 'M4 5h8M8 3v2M5 9c1 3 4 5 7 6M11 5c-1 4-3 7-7 9M13 21l4-9 4 9M14.5 18h5', volume: 'M4 9v6h4l5 4V5L8 9zM16 9a4 4 0 0 1 0 6', feather: 'M20 4c-7 0-12 5-13 12l-3 4M7 16h6c4-2 6-6 7-12',
  check: 'M5 12l5 5 9-11', menu: 'M4 6h16M4 12h16M4 18h16', sparkle: 'M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8zM19 16l.8 2.2L22 19l-2.2.8L19 22l-.8-2.2L16 19l2.2-.8z',
  grip: 'M9 6h.01M15 6h.01M9 12h.01M15 12h.01M9 18h.01M15 18h.01', up: 'M6 15l6-6 6 6', down: 'M6 9l6 6 6-6', folder: 'M3 6a1 1 0 0 1 1-1h5l2 3h9a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1z',
  image: 'M4 4h16v16H4zM4 16l5-5 4 4 3-3 4 4M9 9h.01', note: 'M5 3h10l4 4v14H5zM14 3v5h5M8 13h8M8 17h5', heart: 'M12 20s-7-4.5-9-9a5 5 0 0 1 9-3 5 5 0 0 1 9 3c-2 4.5-9 9-9 9z',
};
export const icon = (name: string, size = 18) => { const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); s.setAttribute('viewBox', '0 0 24 24'); s.setAttribute('width', String(size)); s.setAttribute('height', String(size)); s.classList.add('ic'); s.innerHTML = `<path d="${I[name] || I.sparkle}" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/>`; return s; };
export const btn = (label?: string | null, { ic, cls = '', onclick, title, type }: { ic?: string; cls?: string; onclick?: (e: MouseEvent) => unknown; title?: string; type?: string } = {}) => h<HTMLButtonElement>(`button.btn${cls ? '.' + cls.split(' ').join('.') : ''}`, { onclick, title: title || (label ? null : ''), type: type || 'button' }, ic && icon(ic), label && h('span', label));
export const iconBtn = (ic: string, title: string, onclick?: (e: MouseEvent) => unknown, cls = '') => h<HTMLButtonElement>(`button.ibtn${cls ? '.' + cls.split(' ').join('.') : ''}`, { title, 'aria-label': title, onclick, type: 'button' }, icon(ic));