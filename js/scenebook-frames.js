// ── Dreamland 삽화: 삽화 액자 (기본 · 없음 · 라인 · 선 장식 8종 · 가져온 액자 그림) ──
// 액자 그림은 이 기기의 보관함(IndexedDB)에 두고, 설정에는 고른 액자의 id 만 남긴다. 화면 표시만 바꾸며 그림 원본은 그대로다.
import { DB, uid, now } from './core.js';
import { FRAMES } from './scenebook-framing.js';
import { ORNAMENTS, INKS, ORNAMENT_PAD, ornamentSvg } from './scenebook-ornaments.js';

export const FRAME_OWNER = 'illust:frames';
const store = new Map();   // id → { id, name, data, width, height, window:[x,y,w,h], mask }
let loading = null;
export const Frames = {
  /** 저장된 액자 그림을 읽어 둔다 (한 번만) */
  load() { return loading ||= DB.byOwner(FRAME_OWNER).then(list => { for (const f of list) if (f.kind === 'illust-frame') store.set(f.id, f); }).catch(e => console.warn('[삽화 액자]', e)); },
  list: () => [...store.values()].sort((a, b) => (a.ts || 0) - (b.ts || 0)),
  get: id => store.get(id),
  async add(file) {
    if (store.size >= 24) throw new Error('액자 그림은 최대 24개예요.');
    const rec = { id: uid(), owner: FRAME_OWNER, kind: 'illust-frame', ...await readFrameImage(file), ts: now() };
    await DB.put('assets', rec); store.set(rec.id, rec); return rec;
  },
  async remove(id) { await DB.del('assets', id); store.delete(id); },
};

/** 가운데가 투명한 PNG · WebP 에서 창의 위치와 모양을 찾는다 */
export async function readFrameImage(file) {
  if (!file || !['image/png', 'image/webp'].includes(file.type) || file.size > 6 * 1024 * 1024) throw new Error('6MB 이하 PNG · WebP 액자 그림을 골라 주세요.');
  const bitmap = await createImageBitmap(file);
  try {
    const scale = Math.min(1, 320 / Math.max(bitmap.width, bitmap.height)), w = Math.max(8, Math.round(bitmap.width * scale)), h = Math.max(8, Math.round(bitmap.height * scale));
    const canvas = document.createElement('canvas'); canvas.width = w; canvas.height = h;
    const context = canvas.getContext('2d', { willReadFrequently: true }); context.drawImage(bitmap, 0, 0, w, h);
    const alpha = context.getImageData(0, 0, w, h).data, clear = i => alpha[i * 4 + 3] < 110;
    // 가운데에서 시작하고, 가운데가 그림으로 덮여 있으면 가장 가까운 투명한 점에서 시작한다
    let start = -1, best = Infinity; const cx = w >> 1, cy = h >> 1;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const d = (x - cx) ** 2 + (y - cy) ** 2; if (d < best && clear(y * w + x)) { best = d; start = y * w + x; } }
    if (start < 0) throw new Error('투명한 창이 없는 그림이에요. 가운데가 뚫린 액자 PNG · WebP 를 골라 주세요.');
    const inside = new Uint8Array(w * h), stack = [start]; inside[start] = 1; let x0 = w, y0 = h, x1 = 0, y1 = 0, area = 0, edge = false;
    while (stack.length) {
      const i = stack.pop(), x = i % w, y = (i - x) / w; area++;
      if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; if (!x || !y || x === w - 1 || y === h - 1) edge = true;
      for (const j of [x > 0 ? i - 1 : -1, x < w - 1 ? i + 1 : -1, y > 0 ? i - w : -1, y < h - 1 ? i + w : -1]) if (j >= 0 && !inside[j] && clear(j)) { inside[j] = 1; stack.push(j); }
    }
    if (edge || area < w * h * .08) throw new Error('액자 안쪽 창을 찾지 못했어요. 테두리가 끊기지 않고 가운데가 투명한 그림을 골라 주세요.');
    // 창 모양 (창의 테두리 상자만큼 잘라 둔다) — 삽화가 액자 그림 밖으로 비치지 않게 한다
    const mw = x1 - x0 + 1, mh = y1 - y0 + 1, mask = document.createElement('canvas'); mask.width = mw; mask.height = mh;
    const mc = mask.getContext('2d'), pixels = mc.createImageData(mw, mh);
    for (let y = 0; y < mh; y++) for (let x = 0; x < mw; x++) {
      const i = (y + y0) * w + x + x0; let on = inside[i];
      if (!on) for (const j of [i - 1, i + 1, i - w, i + w]) if (j >= 0 && j < w * h && inside[j]) { on = 1; break; }   // 한 점 넓혀서 삽화가 액자의 부드러운 가장자리 밑으로 들어가게
      pixels.data[(y * mw + x) * 4 + 3] = on ? 255 : 0;
    }
    mc.putImageData(pixels, 0, 0);
    const data = await new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.onerror = () => reject(new Error('그림을 읽지 못했어요.')); reader.readAsDataURL(file); });
    return { data, width: bitmap.width, height: bitmap.height, window: [x0 / w, y0 / h, mw / w, mh / h].map(v => Number(v.toFixed(4))), mask: mask.toDataURL('image/png'), name: String(file.name ?? '액자').replace(/\.[^.]+$/, '').slice(0, 40) || '액자' };
  } finally { bitmap.close(); }
}

export const validFrame = id => FRAMES.some(([x]) => x === id) || ORNAMENTS.some(([x]) => `art:${x}` === id) || (String(id ?? '').startsWith('image:') && store.has(String(id).slice(6)));
/** 그림 한 장을 꾸민다. wrap 은 그림을 감싼 상자, picture 는 <img> 를 담은 요소. width · height 는 그림의 픽셀 크기 */
export function applyFrame(figure, wrap, picture, width, height, config) {
  let id = String(config.frame || 'soft');
  if (width > height && config.frameWide && validFrame(config.frameWide)) id = config.frameWide;
  if (id.startsWith('art:')) {
    figure.dataset.frame = 'art'; wrap.style.padding = `${ORNAMENT_PAD * 100}%`;
    if (INKS.some(([ink]) => ink && ink === config.frameInk)) wrap.style.setProperty('--sb-ink', config.frameInk);
    wrap.insertAdjacentHTML('beforeend', ornamentSvg(id.slice(4), width, height)); return;
  }
  const frame = id.startsWith('image:') && store.get(id.slice(6));
  if (frame && /^data:image\/(png|webp);base64,/.test(frame.data) && String(frame.mask).startsWith('data:image/png;base64,')) {
    const [x, y, w, h] = frame.window; figure.dataset.frame = 'image'; wrap.style.aspectRatio = `${frame.width} / ${frame.height}`;
    Object.assign(picture.style, { position: 'absolute', left: `${x * 100}%`, top: `${y * 100}%`, width: `${w * 100}%`, height: `${h * 100}%`, maskImage: `url("${frame.mask}")`, webkitMaskImage: `url("${frame.mask}")` });
    const art = document.createElement('img'); art.className = 'sb-frame-art'; art.src = frame.data; art.alt = ''; art.draggable = false; wrap.append(art); return;
  }
  figure.dataset.frame = FRAMES.some(([x]) => x === id) ? id : 'soft';
}
/** 선택기에 늘어놓을 액자 목록 */
export const frameChoices = () => [...FRAMES.map(([id, label]) => ({ id, label })), ...ORNAMENTS.map(([id, label]) => ({ id: `art:${id}`, label })), ...Frames.list().map(f => ({ id: `image:${f.id}`, label: f.name, custom: f }))];
