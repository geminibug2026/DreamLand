// 초상 색 — 그림 가장자리(틀과 맞닿는 곳)에서 대표 색을 뽑아 이름·그림자·바탕을 물들인다. (옛 js/tone.js 그대로)
// 결과는 요소의 --tone-d(밝은 바탕용 짙은 색) · --tone-l(어두운 바탕용 옅은 색)로 들어가고, CSS 가 .toned 에서 --tk 로 받아 쓴다.
/** [짙은 색, 옅은 색] 또는 0(색 없음) */
export type Tone = [string, string] | 0;
type Rgb = [number, number, number];
const KEY = 'dreamland.tones', MAX = 400;
const mem = new Map<string, Tone>(), waiting = new Map<string, Promise<Tone>>(), queue: [string, (t: Tone) => void][] = [];
let store: Record<string, Tone> = {}, busy = false, saveTimer: ReturnType<typeof setTimeout> | undefined = undefined;
try { store = JSON.parse(localStorage.getItem(KEY) || '{}') || {}; } catch { store = {}; }

/** 긴 data URL 을 그대로 열쇠로 쓰지 않도록 줄인 표식 */
const sig = (src: string) => src.length < 160 ? src : `${src.length}:${src.substr(src.length >> 1, 24)}:${src.slice(-40)}`;

const toHsl = (r: number, g: number, b: number): Rgb => {
  r /= 255; g /= 255; b /= 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2, d = mx - mn;
  if (!d) return [0, 0, l * 100];
  const s = d / (1 - Math.abs(2 * l - 1));
  const hue = mx === r ? ((g - b) / d + 6) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [hue * 60, s * 100, l * 100];
};
const toRgb = (hue: number, s: number, l: number): Rgb => { s /= 100; l /= 100; const a = s * Math.min(l, 1 - l), f = (n: number) => { const k = (n + hue / 30) % 12; return l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1)); }; return [f(0), f(8), f(4)]; };
const lum = ([r, g, b]: Rgb) => { const f = (v: number) => v <= .03928 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4; return .2126 * f(r) + .7152 * f(g) + .0722 * f(b); };
const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));

/** 한 색에서 글자로 읽히는 두 가지 농담을 만든다 */
function shades([hue, s]: [number, number]): [string, string] {
  const sd = clamp(s, 42, 76), sl = clamp(s, 46, 82);
  let d = 46; while (d > 20 && 1.05 / (lum(toRgb(hue, sd, d)) + .05) < 5.2) d -= 2;      // 흰 종이 위에서
  let l = 62; while (l < 88 && (lum(toRgb(hue, sl, l)) + .05) / .055 < 7.5) l += 2;       // 밤 바탕 위에서
  return [`hsl(${Math.round(hue)} ${Math.round(sd)}% ${d}%)`, `hsl(${Math.round(hue)} ${Math.round(sl)}% ${l}%)`];
}

/** 작은 캔버스에 옮겨 가장자리 띠에서 가장 넓게 깔린 색을 찾는다. 가장자리가 무채색이면 그림 전체에서 찾는다 */
function read(img: CanvasImageSource): Tone {
  const N = 36, cv = document.createElement('canvas'); cv.width = cv.height = N;
  const g = cv.getContext('2d', { willReadFrequently: true }) as CanvasRenderingContext2D; g.drawImage(img, 0, 0, N, N);
  const px = g.getImageData(0, 0, N, N).data;
  const scan = (edge: boolean) => {
    const bins = new Map<number, number[]>();
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      if (edge && Math.min(x, y, N - 1 - x, N - 1 - y) > 2) continue;
      const i = (y * N + x) * 4; if (px[i + 3] < 200) continue;
      const r = px[i], gr = px[i + 1], b = px[i + 2], chroma = (Math.max(r, gr, b) - Math.min(r, gr, b)) / 255;
      const k = (r >> 5) << 6 | (gr >> 5) << 3 | b >> 5; let bin = bins.get(k); if (!bin) bins.set(k, bin = [0, 0, 0, 0, 0]);
      bin[0] += r; bin[1] += gr; bin[2] += b; bin[3]++; bin[4] += chroma;
    }
    let best: number[] | null = null, top = 0;
    for (const bin of bins.values()) { const score = bin[3] * ((edge ? .3 : .08) + bin[4] / bin[3]); if (score > top) { top = score; best = bin; } }
    return best && { rgb: [best[0] / best[3], best[1] / best[3], best[2] / best[3]] as Rgb, chroma: best[4] / best[3] };
  };
  // 색이 있는 점만 색상별로 모은다 (흰 종이·검은 바탕에 색이 얹힌 그림용). share: 살핀 점 가운데 그 색상이 차지한 몫
  const hues = (edge: boolean) => {
    const bins = new Map<number, number[]>(); let all = 0;
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      if (edge && Math.min(x, y, N - 1 - x, N - 1 - y) > 2) continue;
      const i = (y * N + x) * 4; if (px[i + 3] < 200) continue; all++;
      const r = px[i], gr = px[i + 1], b = px[i + 2], chroma = (Math.max(r, gr, b) - Math.min(r, gr, b)) / 255; if (chroma < .14) continue;
      const k = Math.floor(toHsl(r, gr, b)[0] / 20) % 18; let bin = bins.get(k); if (!bin) bins.set(k, bin = [0, 0, 0, 0, 0]);
      bin[0] += r * chroma; bin[1] += gr * chroma; bin[2] += b * chroma; bin[3] += chroma; bin[4]++;
    }
    let best: number[] | null = null; for (const bin of bins.values()) if (!best || bin[3] > best[3]) best = bin;
    return best && { rgb: [best[0] / best[3], best[1] / best[3], best[2] / best[3]] as Rgb, share: best[4] / all };
  };
  let hit: { rgb: Rgb; chroma?: number; share?: number } | null = scan(true);
  if (!hit || (hit.chroma as number) < .07) { hit = hues(true); if (!hit || (hit.share as number) < .15) hit = hues(false); if (!hit || (hit.share as number) < .03) return 0; }
  const [hue, s] = toHsl(...hit.rgb);
  return shades([hue, s]);
}

const load = (src: string) => new Promise<Tone>(done => {
  const im = new Image(); if (!/^(data|blob):/.test(src)) im.crossOrigin = 'anonymous';
  im.onload = () => { try { done(read(im)); } catch { done(0); } };
  im.onerror = () => done(0); im.src = src;
});

const idle = (fn: () => void) => ((window as { requestIdleCallback?: unknown }).requestIdleCallback ? requestIdleCallback(fn, { timeout: 600 }) : setTimeout(fn, 30));
function pump() {
  if (busy || !queue.length) return; busy = true;
  const [src, done] = queue.shift() as [string, (t: Tone) => void];
  idle(async () => { const t = await load(src); busy = false; done(t); pump(); });
}
function remember(k: string, t: Tone) {
  store[k] = t; const keys = Object.keys(store); if (keys.length > MAX) for (const old of keys.slice(0, keys.length - MAX)) delete store[old];
  clearTimeout(saveTimer); saveTimer = setTimeout(() => { try { localStorage.setItem(KEY, JSON.stringify(store)); } catch { } }, 800);
}

/** 그림 주소 → [짙은 색, 옅은 색] 또는 0(색 없음). 한 번 본 그림은 다시 읽지 않는다 */
export function toneOf(src: string | null | undefined): Promise<Tone> {
  if (!src) return Promise.resolve(0);
  if (mem.has(src)) return Promise.resolve(mem.get(src) as Tone);
  const k = sig(src);
  if (k in store) { mem.set(src, store[k]); return Promise.resolve(store[k]); }
  if (!waiting.has(src)) waiting.set(src, new Promise<Tone>(done => { queue.push([src, t => { mem.set(src, t); waiting.delete(src); remember(k, t); done(t); }]); pump(); }));
  return waiting.get(src) as Promise<Tone>;
}

const want = new WeakMap<HTMLElement, string>();   // 요소 → 지금 물들이려는 그림 (늦게 온 결과가 덮어쓰지 않게)
const paint = (el: HTMLElement, t: Tone) => {
  if (!t) { if (el.classList.contains('toned')) { el.classList.remove('toned'); el.style.removeProperty('--tone-d'); el.style.removeProperty('--tone-l'); } return; }
  el.classList.add('toned'); el.style.setProperty('--tone-d', t[0]); el.style.setProperty('--tone-l', t[1]);
};

/** 요소를 캐릭터 초상의 색으로 물들인다. 그림이 없거나 색을 못 뽑으면 물을 빼고 그대로 둔다(포인트 색을 쓴다) */
export function tint<E extends HTMLElement | null | undefined>(el: E, o?: { avatar?: string } | null): E {
  if (!el) return el;
  const src = o?.avatar || ''; want.set(el, src);
  if (!src) { paint(el, 0); return el; }
  let t = mem.get(src);
  if (t === undefined) { const k = sig(src); if (k in store) mem.set(src, t = store[k]); }
  if (t !== undefined) paint(el, t); else toneOf(src).then(v => { if (want.get(el) === src) paint(el, v); });
  return el;
}
