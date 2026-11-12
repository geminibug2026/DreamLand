// ── Dreamland 삽화: 삽화 액자 (기본 · 없음 · 라인 · 선 장식 8종 · 가져온 액자 그림) ──
// 액자 그림은 이 기기의 보관함(IndexedDB)에 두고, 설정에는 고른 액자의 id 만 남긴다. 화면 표시만 바꾸며 그림 원본은 그대로다.
// 옛 js/scenebook-frames.js 를 옮긴 것. applyFrame 은 DOM 을 건드리는 대신 무엇을 씌울지 알려 주는 frameLayout 이 되었다
import type { CSSProperties } from 'react';
import { FRAMES } from './framing';
import { ORNAMENTS, INKS, ORNAMENT_PAD, ornamentParts } from './ornaments';
import type { FrameRec } from './types';
import * as C from '../lib/core';
import { t } from '../i18n';

export const FRAME_OWNER = 'illust:frames';
const store = new Map<string, FrameRec>();   // id → { id, name, data, width, height, window:[x,y,w,h], mask }
let loading: Promise<void> | null = null;
export const Frames = {
  /** 저장된 액자 그림을 읽어 둔다 (한 번만) */
  load() { return loading ||= C.DB.byOwner(FRAME_OWNER).then(list => { for (const f of list) if (f.kind === 'illust-frame') store.set(f.id, f as unknown as FrameRec); }).catch(e => console.warn('[삽화 액자]', e)); },
  list: () => [...store.values()].sort((a, b) => (a.ts || 0) - (b.ts || 0)),
  get: (id: string) => store.get(id),
  async add(file: File): Promise<FrameRec> {
    if (store.size >= 24) throw new Error(t('scenebook.frames.max'));
    const rec: FrameRec = { id: C.uid(), owner: FRAME_OWNER, kind: 'illust-frame', ...await readFrameImage(file), ts: C.now() };
    await C.DB.put('assets', rec); store.set(rec.id, rec); return rec;
  },
  async remove(id: string) { await C.DB.del('assets', id); store.delete(id); },
};

/** 가운데가 투명한 PNG · WebP 에서 창의 위치와 모양을 찾는다 */
export async function readFrameImage(file: File): Promise<Pick<FrameRec, 'data' | 'width' | 'height' | 'window' | 'mask' | 'name'>> {
  if (!file || !['image/png', 'image/webp'].includes(file.type) || file.size > 6 * 1024 * 1024) throw new Error(t('scenebook.frames.pickFile'));
  const bitmap = await createImageBitmap(file);
  try {
    const scale = Math.min(1, 320 / Math.max(bitmap.width, bitmap.height)), w = Math.max(8, Math.round(bitmap.width * scale)), h = Math.max(8, Math.round(bitmap.height * scale));
    const canvas = document.createElement('canvas'); canvas.width = w; canvas.height = h;
    const context = canvas.getContext('2d', { willReadFrequently: true })!; context.drawImage(bitmap, 0, 0, w, h);
    const alpha = context.getImageData(0, 0, w, h).data, clear = (i: number) => alpha[i * 4 + 3] < 110;
    // 가운데에서 시작하고, 가운데가 그림으로 덮여 있으면 가장 가까운 투명한 점에서 시작한다
    let start = -1, best = Infinity; const cx = w >> 1, cy = h >> 1;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const d = (x - cx) ** 2 + (y - cy) ** 2; if (d < best && clear(y * w + x)) { best = d; start = y * w + x; } }
    if (start < 0) throw new Error(t('scenebook.frames.noWindow'));
    const inside = new Uint8Array(w * h), stack = [start]; inside[start] = 1; let x0 = w, y0 = h, x1 = 0, y1 = 0, area = 0, edge = false;
    while (stack.length) {
      const i = stack.pop()!, x = i % w, y = (i - x) / w; area++;
      if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; if (!x || !y || x === w - 1 || y === h - 1) edge = true;
      for (const j of [x > 0 ? i - 1 : -1, x < w - 1 ? i + 1 : -1, y > 0 ? i - w : -1, y < h - 1 ? i + w : -1]) if (j >= 0 && !inside[j] && clear(j)) { inside[j] = 1; stack.push(j); }
    }
    if (edge || area < w * h * .08) throw new Error(t('scenebook.frames.windowNotFound'));
    // 창 모양 (창의 테두리 상자만큼 잘라 둔다) — 삽화가 액자 그림 밖으로 비치지 않게 한다
    const mw = x1 - x0 + 1, mh = y1 - y0 + 1, mask = document.createElement('canvas'); mask.width = mw; mask.height = mh;
    const mc = mask.getContext('2d')!, pixels = mc.createImageData(mw, mh);
    for (let y = 0; y < mh; y++) for (let x = 0; x < mw; x++) {
      const i = (y + y0) * w + x + x0; let on = inside[i];
      if (!on) for (const j of [i - 1, i + 1, i - w, i + w]) if (j >= 0 && j < w * h && inside[j]) { on = 1; break; }   // 한 점 넓혀서 삽화가 액자의 부드러운 가장자리 밑으로 들어가게
      pixels.data[(y * mw + x) * 4 + 3] = on ? 255 : 0;
    }
    mc.putImageData(pixels, 0, 0);
    const data = await new Promise<string>((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.onerror = () => reject(new Error(t('scenebook.frames.readFail'))); reader.readAsDataURL(file); });
    return { data, width: bitmap.width, height: bitmap.height, window: [x0 / w, y0 / h, mw / w, mh / h].map(v => Number(v.toFixed(4))), mask: mask.toDataURL('image/png'), name: String(file.name ?? t('scenebook.frames.defaultName')).replace(/\.[^.]+$/, '').slice(0, 40) || t('scenebook.frames.defaultName') };
  } finally { bitmap.close(); }
}

export const validFrame = (id: unknown) => FRAMES.some(([x]) => x === id) || ORNAMENTS.some(([x]) => `art:${x}` === id) || (String(id ?? '').startsWith('image:') && store.has(String(id).slice(6)));

export interface FrameLayout {
  /** figure 의 data-frame 값 */
  frame: string;
  wrapStyle?: CSSProperties; picStyle?: CSSProperties;
  /** 선 장식 (wrap 안, 그림 뒤에 놓는 <svg class="sb-ornament">) */
  ornament?: { viewBox: string; inner: string } | null;
  /** 가져온 액자 그림 (wrap 안, 그림 뒤에 놓는 <img class="sb-frame-art">) */
  art?: string;
}
/** 그림 한 장을 어떻게 꾸밀지. width · height 는 그림의 픽셀 크기 (옛 applyFrame 이 요소에 하던 일을 값으로 돌려준다) */
export function frameLayout(width: number, height: number, config: { frame?: string; frameWide?: string; frameInk?: string }): FrameLayout {
  let id = String(config.frame || 'soft');
  if (width > height && config.frameWide && validFrame(config.frameWide)) id = config.frameWide;
  if (id.startsWith('art:')) {
    const wrapStyle: Record<string, string> = { padding: `${ORNAMENT_PAD * 100}%` };
    if (INKS.some(([ink]) => ink && ink === config.frameInk)) wrapStyle['--sb-ink'] = String(config.frameInk);
    return { frame: 'art', wrapStyle: wrapStyle as CSSProperties, ornament: ornamentParts(id.slice(4), width, height) };
  }
  const frame = id.startsWith('image:') && store.get(id.slice(6));
  if (frame && /^data:image\/(png|webp);base64,/.test(frame.data) && String(frame.mask).startsWith('data:image/png;base64,')) {
    const [x, y, w, h] = frame.window;
    return { frame: 'image', wrapStyle: { aspectRatio: `${frame.width} / ${frame.height}` }, art: frame.data,
      picStyle: { position: 'absolute', left: `${x * 100}%`, top: `${y * 100}%`, width: `${w * 100}%`, height: `${h * 100}%`, maskImage: `url("${frame.mask}")`, WebkitMaskImage: `url("${frame.mask}")` } };
  }
  return { frame: FRAMES.some(([x]) => x === id) ? id : 'soft' };
}
/** 선택기에 늘어놓을 액자 목록 */
export const frameChoices = (): { id: string; label: string; custom?: FrameRec }[] => [...FRAMES.map(([id, label]) => ({ id, label: t(label) })), ...ORNAMENTS.map(([id, label]) => ({ id: `art:${id}`, label: t(label) })), ...Frames.list().map(f => ({ id: `image:${f.id}`, label: f.name, custom: f }))];
