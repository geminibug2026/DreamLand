// 참조 이미지 손질: 등록할 때의 캔버스 사본(V4.5 · 분위기용)과 V5 용 사본(약 1 메가픽셀, 그림 모양에 가장 가까운 크기로 채우고 고르게 자름)
import { dataToBlob } from '../lib/blobUrl';
export type Bucket = { width: number; height: number; resizeWidth: number; resizeHeight: number; left: number; top: number };

/** V5 가 참조를 읽는 크기들: 넓이 약 1 메가픽셀, 변은 64 의 배수 */
export const REFERENCE_BUCKETS: [number, number][] = (() => {
  const tall: [number, number][] = []; for (let h = 4096; h >= 1024; h -= 64) tall.push([Math.floor(1048576 / h / 64) * 64, h]);
  return [...tall, ...tall.slice(0, -1).reverse().map(([w, h]): [number, number] => [h, w])];
})();
/** 그림 모양에 가장 가까운 크기와, 거기에 채워 넣을 때의 자리 */
export function referenceBucket(width: number, height: number): Bucket {
  const shape = Math.log(Math.max(width, 1) / Math.max(height, 1)); let best = REFERENCE_BUCKETS[0], distance = Infinity;
  for (const b of REFERENCE_BUCKETS) { const d = Math.abs(shape - Math.log(b[0] / b[1])); if (d < distance) { best = b; distance = d; } }
  const scale = Math.max(best[0] / width, best[1] / height), resizeWidth = Math.max(Math.floor(width * scale + .5), best[0]), resizeHeight = Math.max(Math.floor(height * scale + .5), best[1]);
  return { width: best[0], height: best[1], resizeWidth, resizeHeight, left: Math.floor((resizeWidth - best[0]) / 2), top: Math.floor((resizeHeight - best[1]) / 2) };
}
const blank = (w: number, h: number) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };
function bucketImage(source: CanvasImageSource, x: number, y: number, width: number, height: number): string {
  const b = referenceBucket(width, height), cv = blank(b.width, b.height), ctx = cv.getContext('2d')!;
  ctx.imageSmoothingQuality = 'high'; ctx.drawImage(source, x, y, width, height, -b.left, -b.top, b.resizeWidth, b.resizeHeight);
  return cv.toDataURL('image/png');
}
/** 고른 파일 → 저장할 두 사본. data 는 흰 여백을 둔 캔버스(V4.5 Precise · 분위기), v5 는 V5 용 */
export async function prepareReference(file: Blob): Promise<{ data: string; width: number; height: number; v5: string }> {
  const bmp = await createImageBitmap(file);
  try {
    const ratio = bmp.width / bmp.height, [width, height] = ratio > 1.2 ? [1536, 1024] : ratio < 0.83 ? [1024, 1536] : [1472, 1472];
    const cv = blank(width, height), ctx = cv.getContext('2d')!; ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, width, height);
    const k = Math.min(width / bmp.width, height / bmp.height); ctx.drawImage(bmp, (width - bmp.width * k) / 2, (height - bmp.height * k) / 2, bmp.width * k, bmp.height * k);
    return { data: cv.toDataURL('image/png'), width, height, v5: bucketImage(bmp, 0, 0, bmp.width, bmp.height) };
  } finally { bmp.close(); }
}
/** 예전에 등록한 참조에는 흰 여백 캔버스만 있다: 여백 띠를 걷어 내고 안쪽 그림으로 V5 사본을 만든다 */
export async function bucketFromPadded(dataUrl: string): Promise<string> {
  const blob = dataToBlob(dataUrl); if (!blob) throw new Error('reference image unreadable');   // fetch(data:) 는 앱 보안 정책에 막힌다
  const bmp = await createImageBitmap(blob);
  try {
    const { width, height } = bmp, cv = blank(width, height), ctx = cv.getContext('2d', { willReadFrequently: true })!; ctx.drawImage(bmp, 0, 0);
    const { data } = ctx.getImageData(0, 0, width, height);
    const white = (x: number, y: number) => { const i = (y * width + x) * 4; return data[i] === 255 && data[i + 1] === 255 && data[i + 2] === 255 && data[i + 3] === 255; };
    const bars = (size: number, across: number, at: (n: number, m: number) => [number, number]): [number, number] => {
      const clear = (n: number) => { for (let m = 0; m < across; m++) if (!white(...at(n, m))) return false; return true; };
      let a = 0, b = 0; while (a < size && clear(a)) a++; while (b < size - a && clear(size - 1 - b)) b++;
      // 여백은 가운데 맞춤이라 진짜 띠는 양쪽 두께가 같다. 띠에 번진 가장자리 한 줄까지 걷는다
      return a < 2 || Math.abs(a - b) > 2 || a + b > size - 64 ? [0, 0] : [a + 1, b + 1];
    };
    const [left, right] = bars(width, height, (x, y) => [x, y]), [top, bottom] = bars(height, width, (y, x) => [x, y]);
    return bucketImage(cv, left, top, width - left - right, height - top - bottom);
  } finally { bmp.close(); }
}
