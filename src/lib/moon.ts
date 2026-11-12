// ── 오늘의 달 (실제 위상) ── (옛 js/ui.js 의 moonPhase · moonIcon 그대로)
export function moonPhase(date: Date = new Date()) {
  const p = (((+date - Date.UTC(2000, 0, 6, 18, 14)) / 864e5 / 29.530588853) % 1 + 1) % 1;
  const name = ['삭', '초승달', '상현달', '차오르는 달', '보름달', '기우는 달', '하현달', '그믐달'][Math.round(p * 8) % 8];
  return { p, name };
}
export function moonIcon(size = 22, date?: Date) {
  const { p, name } = moonPhase(date); const waxing = p < 0.5; const rx = (10 * Math.abs(Math.cos(2 * Math.PI * p))).toFixed(2);
  const gibbous = p > 0.25 && p < 0.75;
  const lit = `M12 2 A10 10 0 0 ${waxing ? 1 : 0} 12 22 A${rx} 10 0 0 ${waxing ? (gibbous ? 1 : 0) : (gibbous ? 0 : 1)} 12 2Z`;
  const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); s.setAttribute('viewBox', '0 0 24 24'); s.setAttribute('width', String(size)); s.setAttribute('height', String(size)); s.classList.add('ic', 'moon');
  s.innerHTML = `<title>${name}</title><circle cx="12" cy="12" r="10" fill="currentColor" opacity=".22"/><path d="${lit}" fill="currentColor"/>`;
  return s;
}
