// ════════ NovelAI PNG 에서 설정 읽기 ════════ (옛 f-scenebook.js 의 것을 동작 그대로)
import { IL, Illust, blankScene, pickKeys } from './bridge';
import type { GenConfig, Scene } from './types';

type Bag = Record<string, unknown>;
const isBag = (v: unknown): v is Bag => !!v && typeof v === 'object' && !Array.isArray(v);
const MAX_FILE = 32 * 1024 * 1024, MAX_TEXT = 8 * 1024 * 1024, MAX_PIXELS = 16 * 1024 * 1024;
const utf8 = new TextDecoder('utf-8', { fatal: true }), latin = new TextDecoder('iso-8859-1');
const decodeText = (b: Uint8Array) => { try { return utf8.decode(b); } catch { return latin.decode(b); } };
async function inflate(bytes: Uint8Array, format: CompressionFormat) {
  if (bytes.length > MAX_TEXT) throw new Error('메타데이터가 너무 커요.');
  const out = new Uint8Array(await new Response(new Blob([bytes as BlobPart]).stream().pipeThrough(new DecompressionStream(format))).arrayBuffer());
  if (out.length > MAX_TEXT) throw new Error('압축을 푼 메타데이터가 너무 커요.'); return out;
}
export async function pngText(bytes: Uint8Array) {
  if (bytes.length < 33 || bytes.length > MAX_FILE || [137, 80, 78, 71, 13, 10, 26, 10].some((b, i) => bytes[i] !== b)) throw new Error('NovelAI 에서 내려받은 원본 PNG 를 골라 주세요.');
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength), fields: Bag = {}; let p = 8, width = 0, height = 0, ended = false;
  const zero = (data: Uint8Array, start: number) => { const z = data.indexOf(0, start); if (z < 0) throw new Error('PNG 텍스트 정보가 손상되었어요.'); return z; };
  while (p + 12 <= bytes.length) {
    const length = view.getUint32(p), kind = latin.decode(bytes.subarray(p + 4, p + 8));
    if (p + 12 + length > bytes.length) throw new Error('PNG 파일이 중간에 잘렸어요.');
    const data = bytes.subarray(p + 8, p + 8 + length);
    if (kind === 'IHDR') { width = view.getUint32(p + 8); height = view.getUint32(p + 12); if (!width || !height || width * height > MAX_PIXELS) throw new Error('이미지는 최대 1,600만 픽셀까지 읽을 수 있어요.'); }
    if (kind === 'tEXt' || kind === 'iTXt' || kind === 'zTXt') {
      const sep = zero(data, 0), key = latin.decode(data.subarray(0, sep)); let txt = '';
      if (kind === 'tEXt') txt = decodeText(data.subarray(sep + 1));
      if (kind === 'zTXt') txt = decodeText(await inflate(data.subarray(sep + 2), 'deflate'));
      if (kind === 'iTXt') { const compressed = data[sep + 1], lang = zero(data, sep + 3), tr = zero(data, lang + 1), raw = data.subarray(tr + 1); txt = utf8.decode(compressed ? await inflate(raw, 'deflate') : raw); }
      if (['Comment', 'Description', 'Source', 'Software', 'Title'].includes(key)) fields[key] = txt;
    }
    p += length + 12; if (kind === 'IEND') { ended = true; break; }
  }
  if (!ended) throw new Error('PNG 파일이 완전하지 않아요.'); return { fields, width, height };
}
/** 알파 채널 맨 아랫비트에 숨겨 둔 생성 정보 */
export async function stealthMeta({ data, width, height }: { data: Uint8ClampedArray | Uint8Array; width: number; height: number }): Promise<Bag | null> {
  const pixels = width * height, magic = 'stealth_pngcomp'; if (pixels > MAX_PIXELS || pixels < (magic.length + 4) * 8) return null;
  let cursor = 0;
  const byte = () => { let v = 0; for (let b = 0; b < 8; b++) { if (cursor >= pixels) throw new Error('숨은 메타데이터가 중간에 잘렸어요.'); const x = Math.floor(cursor / height), y = cursor % height; v = (v << 1) | (data[(y * width + x) * 4 + 3] & 1); cursor++; } return v; };
  let found = ''; for (let i = 0; i < magic.length; i++) found += String.fromCharCode(byte());
  if (found !== magic && found !== 'stealth_pnginfo') return null;
  const bits = byte() * 16777216 + byte() * 65536 + byte() * 256 + byte();
  if (!bits || bits % 8 || bits > pixels - cursor || bits / 8 > MAX_TEXT) throw new Error('숨은 메타데이터 길이가 올바르지 않아요.');
  const packed = Uint8Array.from({ length: bits / 8 }, byte), parsed: unknown = JSON.parse(utf8.decode(found === magic ? await inflate(packed, 'gzip') : packed));
  return isBag(parsed) ? parsed : null;
}
export function metaModel(source: unknown, explicit: unknown): string | null {
  const MODELS = IL().MODELS;
  if (typeof explicit === 'string' && MODELS[explicit]) return explicit; if (typeof source !== 'string') return null; if (MODELS[source]) return source;
  const v5 = /NovelAI Diffusion V5\b/i.test(source), v45 = /NovelAI Diffusion V4\.5\b|DiffusionModelMetaName\.NAIv4next/i.test(source);
  if (v5 && (/\bFull\b/i.test(source) || /\b(?:657484A5|0ADF9AB7)\b/i.test(source))) return 'nai-diffusion-5-full';
  if (v5 && /\bCurated\b/i.test(source)) return 'nai-diffusion-5-curated';
  if (v45 && (/\bFull\b/i.test(source) || /\b(?:4BDE2A90|1229B44F|B9F340FD|F3D95188)\b/i.test(source))) return 'nai-diffusion-4-5-full';
  if ((v45 && /\bCurated\b/i.test(source)) || ((v45 || /NovelAI Diffusion V4\b/.test(source)) && /\b(?:C02D4F98|5AB81C7C|B5A2A797)\b/i.test(source))) return 'nai-diffusion-4-5-curated';
  return null;
}
export interface NaiMeta { patch: Bag; warnings: string[]; source: string; scene: Scene; storage?: string }
const caption = (v: unknown): unknown => isBag(v) && isBag(v.caption) ? v.caption.base_caption : undefined;
export function normalizeMeta(fields: Bag, dim: { width?: number; height?: number } = {}): NaiMeta {
  const { SAMPLERS, SCHEDULERS } = IL();
  let raw: unknown = fields.Comment ?? {}; if (typeof raw === 'string') { try { raw = JSON.parse(raw); } catch { throw new Error('이미지의 생성 설정 JSON 이 손상되었어요.'); } }
  if (!isBag(raw)) throw new Error('이미지의 생성 설정을 읽을 수 없어요.');
  const p = raw, prompt = caption(p.v4_prompt) ?? p.prompt ?? fields.Description;
  if (typeof prompt !== 'string' || !prompt.trim() || prompt.length > 12000) throw new Error('NovelAI 생성 프롬프트를 찾을 수 없어요.');
  const patch: Bag = {}, warnings: string[] = [], skipped: string[] = [], model = metaModel(fields.Source, p.model);
  if (model) patch.model = model; else warnings.push('모델을 확정할 수 없어요. 적용할 모델을 직접 골라 주세요.');
  for (const [from, to, min, max, int] of [['width', 'width', 64, 2048, true], ['height', 'height', 64, 2048, true], ['steps', 'steps', 1, 50, true], ['scale', 'scale', 0, 10, false], ['cfg_rescale', 'cfgRescale', 0, 1, false]] as [string, string, number, number, boolean][]) {
    const v = p[from] ?? (from === 'width' ? dim.width : from === 'height' ? dim.height : undefined); if (v === undefined) continue;
    if (typeof v !== 'number' || !Number.isFinite(v) || v < min || v > max || (int && !Number.isInteger(v))) throw new Error(`${from}: 지원 범위를 벗어난 이미지 설정이에요.`); patch[to] = v;
  }
  if (p.sampler !== undefined) { if (SAMPLERS.includes(p.sampler as string)) patch.sampler = p.sampler; else warnings.push(`지원하지 않는 샘플러: ${String(p.sampler).slice(0, 100)}. 지금 샘플러를 그대로 씁니다.`); }
  if (p.noise_schedule !== undefined) { if (SCHEDULERS.includes(p.noise_schedule as string)) patch.scheduler = p.noise_schedule; else warnings.push('지원하지 않는 스케줄러는 적용하지 않아요.'); }
  if (typeof p.straight_alpha === 'boolean') patch.transparent = p.straight_alpha;
  for (const [k, l] of Object.entries({ sm: 'SMEA', sm_dyn: 'SMEA DYN', dynamic_thresholding: '동적 Guidance', legacy: 'Legacy', legacy_v3_extend: 'Legacy prompt', deliberate_euler_ancestral_bug: '구형 Euler 동작' })) if (p[k]) skipped.push(l);
  if (p.uncond_scale !== undefined && p.uncond_scale !== 1) skipped.push('Undesired Content strength');
  if (p.strength || p.noise || p.image || /img2img|inpaint|infilling/i.test(String(p.request_type ?? ''))) skipped.push('Img2Img / Inpaint 원본');
  if (['reference_image_multiple', 'director_reference_images'].some(k => { const v = p[k]; return Array.isArray(v) && v.length; })) skipped.push('Vibe / Precise 참조');
  if (skipped.length) warnings.push(`가져오지 않는 항목: ${skipped.join(', ')}. 원본과 결과가 달라질 수 있어요.`);
  return { patch, warnings, source: String(fields.Source ?? p.model ?? '모델 정보 없음').slice(0, 300), scene: { ...blankScene(), title: typeof fields.Title === 'string' && fields.Title ? fields.Title.slice(0, 150) : '가져온 장면', prompt, negative: (caption(p.v4_negative_prompt) ?? p.uc ?? p.negative_prompt ?? '') as string } };
}
export async function readNaiImage(file: File): Promise<NaiMeta> {
  if (!file || file.size > MAX_FILE) throw new Error('32MB 이하 원본 PNG 를 골라 주세요.');
  const png = await pngText(new Uint8Array(await file.arrayBuffer())); let firstError: unknown;
  if (png.fields.Comment || png.fields.Description) { try { return { ...normalizeMeta(png.fields, png), storage: 'PNG 텍스트' }; } catch (e) { firstError = e; } }
  const bmp = await createImageBitmap(file);
  try {
    const cv = document.createElement('canvas'); cv.width = bmp.width; cv.height = bmp.height;
    const ctx = cv.getContext('2d', { willReadFrequently: true })!; ctx.drawImage(bmp, 0, 0);
    const hidden = await stealthMeta(ctx.getImageData(0, 0, bmp.width, bmp.height)); cv.width = cv.height = 1;
    if (hidden) return { ...normalizeMeta(hidden, png), storage: '알파 채널' };
  } finally { bmp.close(); }
  throw firstError || new Error('생성 정보가 없어요. 스크린샷이나 변환본 말고 NovelAI 에서 내려받은 원본 PNG 를 써 주세요.');
}
export function importedConfig(base: GenConfig, result: NaiMeta, { model, relax, forScene }: { model: string; relax: boolean; forScene: boolean }): GenConfig {
  const MODELS = IL().MODELS;
  if (!MODELS[model]) throw new Error('적용할 이미지 모델을 골라 주세요.');
  const patch = pickKeys(result.patch, ['width', 'height', 'steps', 'scale', 'sampler', 'scheduler', 'cfgRescale', 'transparent']), v5 = MODELS[model].family === 5;
  const next: GenConfig = { ...base, ...patch, backend: 'nai', model, budgetGuard: relax ? false : base.budgetGuard };
  if (v5) next.scheduler = 'karras'; else if (patch.transparent === undefined || !v5) next.transparent = false;
  if (forScene) Object.assign(next, { style: '', negative: '', quality: false, references: [] });   // 펼쳐진 프롬프트에는 품질 태그가 이미 들어 있다
  else { Object.assign(next, { style: result.scene.prompt, negative: result.scene.negative, quality: false }); if (!MODELS[model].references && base.references?.length) throw new Error('지금 켜 둔 참조를 해제한 뒤 V5 설정을 가져와 주세요.'); }
  return Illust().validate(next);
}
