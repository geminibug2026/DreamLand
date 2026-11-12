// ── Dreamland theme: 테마 엔진 (기본 테마 · 내 테마 · 가져오기 · 배경 효과) ── (옛 js/theme.js 그대로)
import { S, uid } from './core';
import { X } from './hooks';
import type { Theme } from './types';

type Colors = Record<string, string>;
const T = (id: string, name: string, tone: string, c: Colors, extra: Partial<Theme> = {}): Theme => ({ id, name, tone, builtin: true, radius: 3, pattern: 'grid', glass: 0, fx: 'none', bgImage: '', bgDim: 0.25, bgBlur: 0, css: '', ...extra, c });
export const BUILTIN: Theme[] = [
  T('moonpress', '백야', 'light', { bg: '#f3f3f1', bg2: '#f3f3f1', surface: '#ffffff', text: '#0e0e12', dim: '#63636d', accent: '#2447f0', accent2: '#2447f0', sayBg: '#ffffff', sayText: '#0e0e12', userBg: '#2447f0', userText: '#ffffff', nar: '#25252c', think: '#6f6f7a' }),
  T('nocturne', '극야', 'dark', { bg: '#0b0b0e', bg2: '#0b0b0e', surface: '#15151a', text: '#f2f2f0', dim: '#9a9aa6', accent: '#5b7bff', accent2: '#5b7bff', sayBg: '#1d1d24', sayText: '#f2f2f0', userBg: '#3f63ff', userText: '#ffffff', nar: '#dcdcd8', think: '#9a9aa6' }),
  T('rosemilk', '로즈 밀크', 'light', { bg: '#fbf5f2', bg2: '#f7ece9', surface: '#ffffff', text: '#4b3f44', dim: '#8f7f86', accent: '#d98a9e', accent2: '#e9a98f', sayBg: '#ffffff', sayText: '#4b3f44', userBg: '#e8a2b2', userText: '#ffffff', nar: '#6a5b61', think: '#a08a93' }),
  T('lavender', '라벤더 포그', 'light', { bg: '#f6f4fb', bg2: '#eeeaf8', surface: '#ffffff', text: '#433d57', dim: '#857e9c', accent: '#9d8bd6', accent2: '#c59bd8', sayBg: '#ffffff', sayText: '#433d57', userBg: '#a999dd', userText: '#ffffff', nar: '#5f587a', think: '#9189ab' }),
  T('butter', '버터 크림', 'light', { bg: '#fbf7ee', bg2: '#f6eeda', surface: '#fffdf8', text: '#4d4435', dim: '#8e826c', accent: '#d9a04e', accent2: '#e08f6b', sayBg: '#fffdf8', sayText: '#4d4435', userBg: '#e2b062', userText: '#40341d', nar: '#6b604c', think: '#9a8e77' }),
  T('mint', '민트 소다', 'light', { bg: '#f2f8f6', bg2: '#e6f2ee', surface: '#ffffff', text: '#35474a', dim: '#748c8c', accent: '#62b5a4', accent2: '#7fb6d8', sayBg: '#ffffff', sayText: '#35474a', userBg: '#6fbfae', userText: '#ffffff', nar: '#4f6466', think: '#82999a' }),
  T('skyletter', '하늘 편지', 'light', { bg: '#f3f7fc', bg2: '#e7eff9', surface: '#ffffff', text: '#3a4558', dim: '#7c889c', accent: '#7a9fe0', accent2: '#a59be6', sayBg: '#ffffff', sayText: '#3a4558', userBg: '#86a8e6', userText: '#ffffff', nar: '#56627a', think: '#8b96aa' }),
  T('moonlight', '문라이트', 'dark', { bg: '#1f1d2b', bg2: '#262336', surface: '#2a2739', text: '#ece7f2', dim: '#aaa3bb', accent: '#c4b0f0', accent2: '#f0a9c4', sayBg: '#353148', sayText: '#f1edf6', userBg: '#8e7bc8', userText: '#ffffff', nar: '#d2ccdf', think: '#a9a1bd' }),
  T('rosenoir', '로즈 누아르', 'dark', { bg: '#231c20', bg2: '#2b2227', surface: '#30262b', text: '#f3e9ec', dim: '#b8a6ad', accent: '#e79bb0', accent2: '#f0b79a', sayBg: '#3b2f35', sayText: '#f6edf0', userBg: '#b96f86', userText: '#ffffff', nar: '#dccfd4', think: '#b3a1a8' }),
  T('foresttea', '포레스트 티', 'dark', { bg: '#1b2321', bg2: '#202b28', surface: '#26312e', text: '#e6efea', dim: '#9fb2aa', accent: '#93d1b5', accent2: '#c8d48f', sayBg: '#2f3c38', sayText: '#ecf3ef', userBg: '#5c9c84', userText: '#ffffff', nar: '#cbd9d2', think: '#9db0a8' }),
  T('twilight', '황혼 (별빛)', 'dark', { bg: '#1b1730', bg2: '#3a2850', surface: '#2a2444', text: '#f1edff', dim: '#b0a8cf', accent: '#c7adff', accent2: '#ff9fce', sayBg: '#393258', sayText: '#f4f0ff', userBg: '#9a7fe0', userText: '#ffffff', nar: '#d6cfee', think: '#aaa2c9' }, { fx: 'stars' }),
];
export interface FontDef { name: string; stack: string; css?: string }
export const FONTS: Record<string, FontDef> = {
  pretendard: { name: '프리텐다드', stack: '"Pretendard Variable", Pretendard' },
  gowundodum: { name: '고운돋움', stack: '"Gowun Dodum"', css: 'https://fonts.googleapis.com/css2?family=Gowun+Dodum&display=swap' },
  nanumgothic: { name: '나눔고딕', stack: '"Nanum Gothic"', css: 'https://fonts.googleapis.com/css2?family=Nanum+Gothic:wght@400;700;800&display=swap' },
  notosans: { name: '노토 산스', stack: '"Noto Sans KR"', css: 'https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@400;500;700&display=swap' },
  ibmplex: { name: 'IBM 플렉스 산스', stack: '"IBM Plex Sans KR"', css: 'https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+KR:wght@400;500;600;700&display=swap' },
  gaegu: { name: '개구 (손글씨)', stack: 'Gaegu', css: 'https://fonts.googleapis.com/css2?family=Gaegu:wght@400;700&display=swap' },
  himelody: { name: '하이멜로디 (손글씨)', stack: '"Hi Melody"', css: 'https://fonts.googleapis.com/css2?family=Hi+Melody&display=swap' },
  system: { name: '기기 기본 글꼴', stack: 'system-ui' },
};
export const COLOR_FIELDS: [string, string][] = [['bg', '배경'], ['bg2', '배경 (아래쪽)'], ['surface', '패널 · 카드'], ['text', '글자'], ['dim', '보조 글자'], ['accent', '포인트'], ['accent2', '포인트 (보조)'],
  ['sayBg', '상대 말풍선'], ['sayText', '상대 말풍선 글자'], ['userBg', '내 말풍선'], ['userText', '내 말풍선 글자'], ['nar', '지문 글자'], ['think', '속마음 글자']];

export const allThemes = (): Theme[] => [...BUILTIN, ...X.themes.map(t => ({ ...t.theme, ext: t.owner })), ...(S.settings.customThemes || [])];
export const currentTheme = () => allThemes().find(t => t.id === S.settings.theme) || BUILTIN[0];
export const newCustomTheme = (base: Theme): Theme => ({ ...structuredClone(base), id: 'my-' + uid(), name: base.name + ' (내 테마)', builtin: false, ext: undefined });

let fxRun = () => { };
export function applyTheme() {
  const st = S.settings, root = document.documentElement, t = currentTheme();
  root.dataset.theme = t.id; root.dataset.tone = t.tone === 'dark' ? 'dark' : 'light';
  const set = (k: string, v: string | null | undefined) => v == null || v === '' ? root.style.removeProperty(k) : root.style.setProperty(k, v);
  const c: Colors = t.c || {};
  set('--bg', c.bg); set('--bg2', c.bg2 || c.bg); set('--surface', c.surface); set('--text', c.text); set('--dim', c.dim);
  set('--accent', c.accent); set('--accent2', c.accent2 || c.accent); set('--say-bg', c.sayBg || c.surface); set('--say-text', c.sayText || c.text);
  set('--on-accent', lum(c.accent || '#d98a9e') > 0.66 ? '#2b2430' : '#ffffff');
  set('--user-bg', c.userBg || c.accent); set('--user-text', c.userText || '#fff'); set('--nar', c.nar || c.text); set('--think', c.think || c.dim);
  set('--r', (t.radius ?? 20) + 'px'); set('--glass', String(1 - Math.min(0.9, Math.max(0, t.glass || 0))));
  set('--bg-image', t.bgImage ? `url("${t.bgImage}")` : 'none'); set('--bg-dim', String(t.bgDim ?? 0.25)); set('--bg-blur', (t.bgBlur || 0) + 'px');
  root.classList.toggle('has-bg-image', !!t.bgImage);
  root.dataset.pattern = t.bgImage ? 'none' : (t.pattern || 'grid');
  set('--fs', (st.fontSize || 16) + 'px'); set('--lh', String(st.lineHeight || 1.8)); set('--chat-w', (st.chatWidth || 780) + 'px');
  const f = FONTS[st.font] || FONTS.pretendard;
  if (f.css && !document.querySelector(`link[data-font="${st.font}"]`)) { const l = document.createElement('link'); l.rel = 'stylesheet'; l.href = f.css; l.dataset.font = st.font; document.head.append(l); }
  set('--font-user', st.fontCustom ? st.fontCustom : f.stack);
  root.classList.toggle('no-motion', !st.motion);
  let css = document.getElementById('user-css');
  if (!css) { css = document.createElement('style'); css.id = 'user-css'; document.head.append(css); }
  css.textContent = (t.css || '') + '\n' + (st.customCss || '');
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', c.bg || '#fff');
  fxRun();
}

// ── 다른 프로그램의 테마 가져오기 ──
const toHex = (v: unknown): string | { hex: string; a: number } | null => {
  const m = String(v).match(/rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:[,\s/]+([\d.]+%?))?/);
  if (!m) return /^#[0-9a-f]{3,8}$/i.test(String(v).trim()) ? String(v).trim() : null;
  const h = (n: string) => Math.round(+n).toString(16).padStart(2, '0');
  return { hex: '#' + h(m[1]) + h(m[2]) + h(m[3]), a: m[4] == null ? 1 : (String(m[4]).endsWith('%') ? parseFloat(m[4]) / 100 : +m[4]) };
};
const lum = (hex: string) => { const n = parseInt(hex.slice(1, 7), 16); return (0.299 * (n >> 16) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255; };
const mix = (a: string, b: string, k: number) => { const p = (h: string) => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16)); const [x, y] = [p(a), p(b)]; return '#' + x.map((v, i) => Math.round(v + (y[i] - v) * k).toString(16).padStart(2, '0')).join(''); };
const hexOf = (v: unknown) => { const r = toHex(v); return r ? (typeof r === 'string' ? r.slice(0, 7) : r.hex) : null; };

/** 실리태번 테마 JSON 의 칸 (쓰는 것만) */
export interface StTheme { name?: string; main_text_color?: string; blur_tint_color?: string; bot_mes_blur_tint_color?: string; user_mes_blur_tint_color?: string; quote_text_color?: string; underline_text_color?: string; italics_text_color?: string; blur_strength?: number; custom_css?: string; [k: string]: unknown }
/** JSON 테마 → 드림랜드 테마 */
export function fromSillyTavern(j: StTheme): Theme {
  const text = hexOf(j.main_text_color) || '#e8e8e8';
  const dark = lum(text) > 0.5;
  const base = dark ? '#1c1c22' : '#f6f4f2';
  const tint = toHex(j.blur_tint_color), bot = toHex(j.bot_mes_blur_tint_color), usr = toHex(j.user_mes_blur_tint_color);
  const over = (t: ReturnType<typeof toHex>, on: string) => t && typeof t === 'object' ? mix(on, t.hex, Math.max(0.35, t.a)) : on;
  const surface = over(tint, base), quote = hexOf(j.quote_text_color) || (dark ? '#c4b0f0' : '#9d8bd6');
  return {
    id: 'my-' + uid(), name: (j.name || '실리태번 테마') + ' (ST)', tone: dark ? 'dark' : 'light', builtin: false, radius: 14, glass: Math.min(0.5, (j.blur_strength || 0) / 30), fx: 'none', bgImage: '', bgDim: 0.25, bgBlur: 0,
    css: '', sourceCss: j.custom_css || '',
    c: { bg: mix(surface, dark ? '#000000' : '#ffffff', 0.25), bg2: surface, surface, text, dim: mix(text, surface, 0.4), accent: quote, accent2: hexOf(j.underline_text_color) || quote, sayBg: over(bot, surface), sayText: text, userBg: over(usr, surface), userText: text, nar: hexOf(j.italics_text_color) || text, think: mix(text, surface, 0.35) },
  };
}
/** CSS 변수 테마 (:root 변수) → 드림랜드 테마 */
export function fromMarinaraCss(css: string, name?: string): Theme | null {
  const vars: Record<string, string> = {}; css.replace(/--([\w-]+)\s*:\s*([^;}{]+);/g, (_, k: string, v: string) => { if (!(k in vars)) vars[k] = v.trim(); return ''; });
  const get = (...ks: string[]) => { for (const k of ks) { const h = hexOf(vars[k] || ''); if (h) return h; } return null; };
  const bg = get('background', 'bg', 'color-background'); const text = get('foreground', 'text', 'color-foreground');
  if (!bg || !text) return null;
  const surface = get('card', 'popover', 'secondary') || mix(bg, text, 0.04), accent = get('primary', 'accent', 'ring') || text;
  return {
    id: 'my-' + uid(), name: (name || '마리나라 테마') + ' (Marinara)', tone: lum(bg) < 0.5 ? 'dark' : 'light', builtin: false, radius: parseInt(vars.radius) ? Math.min(28, parseFloat(vars.radius) * (vars.radius.includes('rem') ? 16 : 1) + 8) : 18, glass: 0, fx: 'none', bgImage: '', bgDim: 0.25, bgBlur: 0, css: '', sourceCss: css,
    c: { bg, bg2: get('sidebar', 'muted') || bg, surface, text, dim: get('muted-foreground') || mix(text, bg, 0.4), accent, accent2: get('accent', 'secondary-foreground') || accent, sayBg: surface, sayText: get('card-foreground') || text, userBg: accent, userText: get('primary-foreground') || (lum(accent) > 0.6 ? '#222222' : '#ffffff'), nar: text, think: get('muted-foreground') || mix(text, bg, 0.4) },
  };
}
/** 남이 만든 테마 파일의 CSS: 주석 · 역슬래시 숨김 표기를 걷고 @import 와 바깥 주소(url)를 뺀다 */
const tameCss = (css: unknown) => String(css || '').replace(/\/\*[\s\S]*?(?:\*\/|$)/g, '').replace(/\\/g, '').replace(/@import\b[^;]*;?/gi, '').replace(/url\(\s*(?!["']?\s*data:)[^)]*\)/gi, 'url("data:,")').replace(/(?:-webkit-)?image-set\s*\(/gi, 'none(').replace(/<\/?style/gi, '');
export function importThemeText(text: string, fileName = ''): Theme | null {
  const base = fileName.replace(/\.[^.]+$/, '');
  try {
    const j = JSON.parse(text);
    if (j.app === 'dreamland-theme' && j.theme?.c) return { ...j.theme, css: tameCss(j.theme.css), bgImage: /^data:image\//.test(j.theme.bgImage || '') ? j.theme.bgImage : '', id: 'my-' + uid(), builtin: false };
    if (j.main_text_color || j.blur_tint_color) return fromSillyTavern({ name: base, ...j });
    if (typeof j.css === 'string') return fromMarinaraCss(j.css, j.name || base);
  } catch { }
  return fromMarinaraCss(text, base);
}

// ── 배경 효과 (기본은 꺼짐) ──
interface Part { x: number; y: number; r: number; p: number; s: number }
export function initFx() {
  const cv = document.querySelector('#sky canvas') as HTMLCanvasElement, g = cv.getContext('2d') as CanvasRenderingContext2D;
  let W = 0, H = 0, parts: Part[] = [], raf = 0, last = 0, kind = 'none';
  const seed = () => {
    const d = Math.min(2, devicePixelRatio || 1); W = cv.width = innerWidth * d; H = cv.height = innerHeight * d;
    const n = kind === 'stars' ? Math.round(innerWidth * innerHeight / 22000) : kind === 'petals' ? Math.round(innerWidth / 60) : 0;
    parts = Array.from({ length: n }, () => ({ x: Math.random() * W, y: Math.random() * H, r: (Math.random() * 1.2 + 0.4) * d, p: Math.random() * 6.28, s: 0.3 + Math.random() * 0.8 }));
  };
  const frame = (t: number) => {
    raf = requestAnimationFrame(frame);
    if (t - last < 60) return; last = t;
    g.clearRect(0, 0, W, H);
    const acc = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() || '#d98a9e';
    for (const s of parts) {
      if (kind === 'stars') { g.globalAlpha = 0.15 + 0.35 * (0.5 + 0.5 * Math.sin(s.p + t / 1400 * s.s)); g.fillStyle = '#fff'; g.beginPath(); g.arc(s.x, s.y, s.r, 0, 6.28); g.fill(); }
      else { s.y += s.s * 1.1; s.x += Math.sin(s.p + t / 1800) * 0.6; if (s.y > H + 20) { s.y = -20; s.x = Math.random() * W; } g.globalAlpha = 0.28; g.fillStyle = acc; g.beginPath(); g.ellipse(s.x, s.y, s.r * 4, s.r * 2.2, s.p + t / 2600, 0, 6.28); g.fill(); }
    }
    g.globalAlpha = 1;
  };
  fxRun = () => {
    const want = S.settings.motion && !matchMedia('(prefers-reduced-motion: reduce)').matches ? (currentTheme().fx || 'none') : 'none';
    cancelAnimationFrame(raf);
    if (want !== kind || !parts.length) { kind = want; seed(); }
    if (kind === 'none' || document.hidden) { g.clearRect(0, 0, W, H); return; }
    raf = requestAnimationFrame(frame);
  };
  addEventListener('resize', () => { seed(); fxRun(); });
  document.addEventListener('visibilitychange', fxRun);
  fxRun();
}
