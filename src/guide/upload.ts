// 등불지기에게 붙이는 파일을 읽는다: 그림 · 글 파일 · 캐릭터 카드(PNG · CharX · JSON) → 대화에 담을 꼴(Attach)
// 그림은 줄여서(저장 공간 · 요청 크기), 글은 길면 잘라서 둔다. 카드는 cards.ts 와 같은 방법으로 속에 든 카드 자료를 꺼낸다
import { IMG_EXT, IMG_SIDE, MAX_BYTES, TEXT_CAP, TEXT_EXT } from './attach';
import type { Attach } from './types';

const extOf = (name: string) => (name.split('.').pop() || '').toLowerCase();
const toDataURL = (blob: Blob) => new Promise<string>((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result as string); r.onerror = rej; r.readAsDataURL(blob); });
/** 그림을 줄인다: 긴 변 IMG_SIDE. 작고 모델이 받는 꼴(png · jpeg · webp)이면 그대로, 아니면 다시 그린다 (투명한 곳이 있을 수 있어 webp, 못 만들면 jpeg) */
function shrink(src: string): Promise<string> {
  return new Promise(resolve => {
    const img = new Image();
    img.onload = () => {
      const k = Math.min(1, IMG_SIDE / Math.max(img.width || 1, img.height || 1));
      if (k === 1 && src.length < 500000 && /^data:image\/(png|jpeg|webp);/.test(src)) return resolve(src);
      const c = document.createElement('canvas'); c.width = Math.max(1, Math.round(img.width * k)); c.height = Math.max(1, Math.round(img.height * k));
      const g = c.getContext('2d'); if (!g) return resolve('');
      g.drawImage(img, 0, 0, c.width, c.height);
      let out = c.toDataURL('image/webp', 0.85);
      if (!/^data:image\/webp/.test(out)) { g.globalCompositeOperation = 'destination-over'; g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height); out = c.toDataURL('image/jpeg', 0.85); }
      resolve(out.length < 3_000_000 ? out : '');
    };
    img.onerror = () => resolve('');
    img.src = src;
  });
}
/** 글을 cap 까지 자른다 */
const capText = (s: string, cap = TEXT_CAP): Pick<Attach, 'text' | 'full'> => s.length > cap ? { text: s.slice(0, cap), full: s.length } : { text: s };
const cardJson = (card: unknown) => JSON.stringify(card, (_k, v) => typeof v === 'string' && v.length > 600 && /^data:[^;,]+;base64,/.test(v) ? `[image data ${Math.round(v.length / 1024)}KB]` : v, 1);
const looksCard = (j: unknown) => !!j && typeof j === 'object' && (/^chara_card/.test(String((j as { spec?: unknown }).spec || '')) || (!!(j as { data?: { name?: unknown } }).data && typeof (j as { data: { name?: unknown } }).data.name === 'string') || ('first_mes' in (j as object) && 'name' in (j as object)));

export class AttachError extends Error { constructor(public code: 'big' | 'type' | 'read', public file: string) { super(code); } }

/** 파일 하나를 읽는다. 못 읽으면 AttachError */
export async function readAttach(f: File): Promise<Attach> {
  const name = f.name || 'file', ext = extOf(name), size = f.size;
  if (size > MAX_BYTES) throw new AttachError('big', name);
  try {
    if (ext === 'charx') {   // CharX: ZIP 안의 card.json + 대표 그림
      const { unzip } = await import('../lib/assets');
      const files = await unzip(await f.arrayBuffer()), cj = files.find(x => /(^|\/)card\.json$/i.test(x.name));
      if (!cj) throw new AttachError('type', name);
      const card = JSON.parse(new TextDecoder().decode(cj.data)) as unknown;
      const isImg = (n: string) => /\.(png|webp|jpe?g|gif|avif)$/i.test(n), pic = files.find(x => isImg(x.name) && /icon|main/i.test(x.name)) || files.find(x => isImg(x.name));
      const image = pic ? await shrink(await toDataURL(new Blob([pic.data as BlobPart], { type: /\.png$/i.test(pic.name) ? 'image/png' : /\.webp$/i.test(pic.name) ? 'image/webp' : 'image/jpeg' }))) : '';
      return { kind: 'card', name, size, ...capText(cardJson(card)), ...(image ? { image } : {}) };
    }
    if (IMG_EXT.has(ext) || f.type.startsWith('image/')) {
      if (ext === 'svg' || f.type === 'image/svg+xml') return { kind: 'text', name, size, ...capText(await f.text()) };
      const bytes = new Uint8Array(await f.arrayBuffer());
      let card: unknown = null;
      if (['png', 'webp', 'jpg', 'jpeg'].includes(ext) || /png|webp|jpe?g/.test(f.type)) { const { readPngCard } = await import('../lib/cards'); try { card = readPngCard(bytes); } catch { card = null; } }
      const image = await shrink(await toDataURL(new Blob([bytes as BlobPart], { type: f.type || 'image/png' })));
      if (card) return { kind: 'card', name, size, ...capText(cardJson(card)), ...(image ? { image } : {}) };
      if (!image) throw new AttachError('read', name);
      return { kind: 'image', name, size, image };
    }
    if (TEXT_EXT.has(ext) || f.type.startsWith('text/') || /json|xml|yaml|javascript/.test(f.type)) {
      const text = (await f.text()).replace(/^\uFEFF/, '');
      if (ext === 'json') { try { const j = JSON.parse(text) as unknown; if (looksCard(j)) return { kind: 'card', name, size, ...capText(cardJson(j)) }; } catch { /* 글 그대로 */ } }
      return { kind: 'text', name, size, ...capText(text) };
    }
  } catch (e) { if (e instanceof AttachError) throw e; console.warn('[등불지기] 파일', name, e); throw new AttachError('read', name); }
  throw new AttachError('type', name);
}

