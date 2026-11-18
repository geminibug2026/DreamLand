// 캐릭터 에셋: 설정 · 안내문 채우기 · 올리기 · 내보내기 (화면 없는 부분)
import type { AssetRec, ChatX, CharX, Persona } from '../addons/types';
import type { Settings } from '../lib/types';
import { errMsg } from '../addons/parts';
import * as libAssets from '../lib/assets';
import { confirmBox, toast } from '../ui';
import { bytesToDataURL, mimeOf, readDataURL, S, dataURLToBytes, download, pickFiles } from '../lib/core';
import { X } from '../lib/hooks';
import { chatApi } from '../chat/actions';
import { t } from '../i18n';

export interface AssetsApi {
  IMG: RegExp; keyOf(s: string): string; baseOf(s: string): string;
  ownerOfChar(id: string): string; ownerOfPersona(id?: string): string;
  source(owner: string): string; verOf(owner: string): string;
  load(owners: string[]): Promise<void>; reload(owners: string[]): Promise<void>;
  list(owner: string): AssetRec[]; inVer(owner: string, ver?: string): AssetRec[]; active(owner: string): AssetRec[];
  cleanName(s: string): string;
  add(owner: string, fileName: string, data: string, extra?: { ver?: string }): Promise<AssetRec>;
  update(rec: AssetRec): Promise<void>; remove(rec: AssetRec): Promise<void>;
  resolve(owners: string[], name: string, seed?: string): AssetRec | null;
  names(owners: string[]): string[]; grouped(owners: string[]): string; count(owners: string[]): number; keywords(owners: string[]): string;
}
interface ZipFile { name: string; data: Uint8Array }
export const A = (): AssetsApi => libAssets.Assets as unknown as AssetsApi;

export interface AstPreset { id: string; name: string; prompt: string }
export interface CharCfg { link: string; ver: string; vers: string[] }
export interface AssetsCfg {
  inject?: boolean; max?: number; random?: boolean; prompt?: string;
  presets: AstPreset[]; preset: string; chars: Record<string, CharCfg>; ui: { char?: string; persona?: string; grid?: string };
  depth: number; style: string; maxSize: number; lazy: boolean; zoom: boolean; webp: boolean; confirmOverwrite: boolean;
}

export const safeDecode = (s: string) => { try { return decodeURIComponent(s); } catch { return s; } };

// ════════ 안내문 프리셋 ════════
const DEFAULT_IMAGE_PROMPT = `### Prompt Instruction for Image Tag Insertion

When writing your reply, insert up to {{max}} internal image tag(s), placed between paragraphs (i.e., after a full paragraph has ended). Follow these guidelines precisely:

1. Tag Format:
   Always use the format \`{{img::keyword}}\` on its own line — this is a custom tag format used specifically for internal assets.
   - Write the keyword exactly as it appears in the list, without any file extension.
   - Do NOT use standard HTML tags like \`<img src="...">\` or markdown images — those are reserved for external images.
   - Example (correct): \`{{img::steampunk_city}}\`
   - Incorrect: \`<img src="steampunk_city.jpg">\`

2. Placement Limitation:
   - Insert no more than {{max}} image tag(s) per response.
   - Insert only if the image enhances the reader's understanding, mood, or emotional tone of the paragraph.
   - Each tag must be placed after a full paragraph ends, not mid-sentence.

3. Context Matching:
   Evaluate the content of each paragraph.
   If a keyword from the list clearly matches the subject, tone, or setting, insert the corresponding image tag after that paragraph.
   - If no keyword fits the context, skip insertion.

4. Avoiding Repetition:
   - Do not repeat the same keyword multiple times across recent responses.
   - Rotate and diversify your choices whenever possible.

5. Keyword List:
The available keywords are: \`{{img_keywords}}\`
(Grouped view: \`{{img_keywords_grouped}}\` — \`name_[1, 2]\` means the variants \`name_1\` and \`name_2\`.)
- Use only the exact keywords from the list.
- Do not guess, invent, or modify keywords.
`;
export const DEFAULT_PRESETS = [
  { name: '기본 프리셋', prompt: DEFAULT_IMAGE_PROMPT },
  { name: '1:1 감정/표정형', prompt: `### Character Asset Direction

Use internal image tags to emphasize the character's emotional state in a 1:1 chat.

- Insert at most 1 image tag per response.
- Place it on its own line after a complete paragraph, never inside a sentence.
- Prefer expressions, gestures, outfits, or close-up mood images.
- Use only exact keywords from this list: {{img_keywords}}
- Format: {{img::keyword}}
- If no image clearly fits, do not insert a tag.` },
  { name: '시뮬레이션/장소·아이템형', prompt: `### Simulation Asset Direction

Use internal image tags as scene, location, item, UI, or event illustrations for simulation-style play.

- Insert up to {{max}} image tags per response when they clarify the scene or state change.
- Place each tag on its own line after a full paragraph.
- Prioritize locations, important items, maps, status screens, CGs, and major event images.
- Use only exact keywords from this list: {{img_keywords}}
- Format: {{img::keyword}}
- If no image is relevant, skip image insertion.` },
];
/** [매크로, 설명 키] — 설명은 쓰는 자리에서 t() */
export const MACROS: [string, string][] = [['{{img_keywords}}', 'assets.macro.keywords'], ['{{img_keywords_grouped}}', 'assets.macro.grouped'], ['{{img_count}}', 'assets.macro.count'], ['{{max}}', 'assets.maxPerReply'], ['{{img_rand::머리말}}', 'assets.macro.rand'], ['{{img_resolve::이름}}', 'assets.macro.resolve'], ['{{charkey}}', 'assets.macro.charkey'], ['{{img_inprompt}}', 'assets.macro.inprompt']];
/** [id, 이름 키, 설명 키] */
export const STYLES: [string, string, string][] = [['plain', 'assets.style.plain', 'assets.style.plainDesc'], ['ink', 'assets.style.ink', 'assets.style.inkDesc'], ['print', 'assets.style.print', 'assets.style.printDesc'], ['polaroid', 'assets.style.polaroid', 'assets.style.polaroidDesc'], ['tape', 'assets.style.tape', 'assets.style.tapeDesc'], ['corner', 'assets.style.corner', 'assets.style.cornerDesc'], ['stamp', 'assets.style.stamp', 'assets.style.stampDesc'], ['film', 'assets.style.film', 'assets.style.filmDesc'], ['shadow', 'assets.style.shadow', 'assets.style.shadowDesc'], ['float-left', 'assets.style.floatLeft', 'assets.style.floatDesc'], ['float-right', 'assets.style.floatRight', 'assets.style.floatDesc']];
const DEFAULTS = { depth: 2, style: 'ink', maxSize: 400, lazy: true, zoom: true, webp: false, confirmOverwrite: true };

export function cfg(): AssetsCfg {
  const c = S.settings.assets as unknown as AssetsCfg;
  if (!Array.isArray(c.presets) || !c.presets.length) {
    c.presets = DEFAULT_PRESETS.map((p, i) => ({ id: 'd' + i, ...p }));
    if (c.prompt?.trim()) { c.presets.push({ id: 'custom', name: '내 안내문', prompt: c.prompt }); c.preset = 'custom'; }
  }
  if (!c.presets.some(p => p.id === c.preset)) c.preset = c.presets[0].id;
  if (!c.chars || typeof c.chars !== 'object') c.chars = {};
  if (!c.ui || typeof c.ui !== 'object') c.ui = {};
  const rec = c as unknown as Record<string, unknown>;
  for (const [k, d] of Object.entries(DEFAULTS)) if (rec[k] === undefined) rec[k] = d;
  return c;
}
export const save = () => S.set({ assets: cfg() as unknown as Settings['assets'] });
/** 화면에 적을 프리셋 이름: 기본으로 만들어진 이름 그대로면 번역해서 */
const PRESET_KEYS: Record<string, [string, string]> = { d0: ['기본 프리셋', 'assets.preset.d0'], d1: ['1:1 감정/표정형', 'assets.preset.d1'], d2: ['시뮬레이션/장소·아이템형', 'assets.preset.d2'], custom: ['내 안내문', 'assets.preset.custom'] };
export const presetName = (p: AstPreset) => { const k = PRESET_KEYS[p.id]; return k && k[0] === p.name ? t(k[1]) : p.name; };
export const presetOf = (): AstPreset => { const c = cfg(); return c.presets.find(p => p.id === c.preset) || c.presets[0]; };
export const charCfg = (id: string): CharCfg => { const c = cfg(), cc = (c.chars[id] ||= { link: '', ver: '', vers: [] }); if (!Array.isArray(cc.vers)) cc.vers = []; return cc; };
export const ownersOf = (chat?: ChatX | null, persona?: Persona): string[] => chat ? [...chat.charIds.map(A().ownerOfChar), A().ownerOfPersona((persona || S.persona(chat))?.id)] : [];
const charKey = (id?: string) => { if (!id) return ''; const o = A().ownerOfChar(id), src = S.get('chars', A().source(o).slice(5)), v = A().verOf(o); return (src?.name || '') + (v ? '/' + v : ''); };
const randOf = (owners: string[], prefix: unknown) => { const k = String(prefix || '').trim().toLowerCase(); if (!k) return ''; const hit = owners.flatMap(o => A().active(o)).filter(a => a.name.startsWith(k)); return hit.length ? hit[Math.floor(Math.random() * hit.length)].name : ''; };

/** 안내문의 빈칸 채우기 */
export function renderPrompt(owners: string[], charId?: string, text: string = presetOf().prompt): string {
  const c = cfg(), As = A();
  const v: Record<string, () => string> = { img_keywords: () => As.names(owners).join(', '), img_keywords_autogen: () => As.names(owners).join(', '), img_keywords_grouped: () => As.grouped(owners) || As.names(owners).join(', '), keywords: () => As.keywords(owners), img_count: () => String(As.count(owners)), max: () => String(c.max || 2), charkey: () => charKey(charId) };
  return String(text || libAssets.ASSET_PROMPT).replace(/\{\{(img_keywords_autogen|img_keywords_grouped|img_keywords|img_count|keywords|max|charkey)\}\}/gi, (_m, k: string) => v[k.toLowerCase()]())
    .replace(/\{\{img_rand::([^{}]+)\}\}/gi, (_m, p: string) => randOf(owners, p)).replace(/\{\{img_resolve::([^{}]+)\}\}/gi, (_m, n: string) => As.resolve(owners, n)?.name || '');
}

/** 프롬프트 조각 · 매크로를 등록한다 (studio.js 의 기본 조각을 대신한다) */
export function registerPrompt() {
  const As = A();
  X.prompt = X.prompt.filter(p => p.owner !== 'assets');
  X.prompt.push({ owner: 'assets', fn: ({ chat, persona }) => {
    const c = cfg(); if (!c.inject) return [];
    const owners = ownersOf(chat, persona); if (!As.count(owners)) return [];
    return [{ where: 'depth', depth: Math.max(0, +c.depth || 0), order: 40, content: renderPrompt(owners, chat.charIds[0]), src: `에셋 안내문 (${presetOf().name})` }];
  } });
  const here = () => { const { chat } = chatApi.current(); return { owners: ownersOf(chat), charId: chat?.charIds?.[0] || '' }; };
  const macro = (name: string, fn: (args: string[]) => string) => X.macros.set(name, { owner: 'assets', fn });
  macro('img_keywords', () => As.names(here().owners).join(', '));
  macro('img_keywords_autogen', () => As.names(here().owners).join(', '));
  macro('img_keywords_grouped', () => { const o = here().owners; return As.grouped(o) || As.names(o).join(', '); });
  macro('img_count', () => String(As.count(here().owners)));
  macro('img_rand', args => randOf(here().owners, args[0]));
  macro('img_resolve', args => As.resolve(here().owners, args[0] || '')?.name || '');
  macro('img_inprompt', () => { const { owners, charId } = here(); return As.count(owners) ? renderPrompt(owners, charId) : ''; });
  macro('charkey', () => charKey(here().charId));
}

// ════════ 작은 도우미 ════════
export const PATHS = {
  tag: 'M3 12V4h8l10 10-8 8zM7.5 8.5h.01', link: 'M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1',
  layers: 'M12 3l9 5-9 5-9-5zM3 12.5l9 5 9-5M3 17l9 5 9-5', grid: 'M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z', broom: 'M19 3l-7 7M9.5 9.5l5 5M8 11l5 5-3 5H4l-1-6z',
  down: 'M12 4v11M7 11l5 5 5-5M5 20h14', zip: 'M6 3h9l4 4v14H6zM14 3v5h5M10 11h2M10 14h2M10 17h2', checks: 'M2 13l4 4 8-9M12 16l1 1 8-9',
};
export async function copy(text: string, msg: string) {
  try { await navigator.clipboard.writeText(text); }
  catch { const t = document.createElement('textarea'); t.value = text; t.style.position = 'fixed'; t.style.opacity = '0'; document.body.append(t); t.select(); try { document.execCommand('copy'); } catch { /* 복사할 길이 없다 */ } t.remove(); }
  toast(msg);
}
const EXT: Record<string, string> = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'image/gif': 'gif', 'image/avif': 'avif' };
const extOf = (dataUrl: string) => EXT[String(dataUrl).slice(5, String(dataUrl).indexOf(';'))] || 'png';
const safeFile = (s: unknown) => String(s || 'assets').replace(/[\\/:*?"<>|]+/g, '_').trim() || 'assets';
export const SAMPLE = 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="320" height="400" viewBox="0 0 160 200"><rect width="160" height="200" fill="#e9e9ee"/><circle cx="104" cy="62" r="30" fill="#1f2a5c"/><circle cx="116" cy="54" r="26" fill="#e9e9ee"/><path d="M0 200V150l42-44 34 32 28-22 56 52v32z" fill="#c9cbd6"/><path d="M36 40l3 9 9 3-9 3-3 9-3-9-9-3 9-3z" fill="#1f2a5c"/></svg>');

// ════════ 올리기 ════════
interface UpItem { fileName: string; mime: string; load(): Promise<string> }
/** 고른 파일(이미지 · ZIP)을 한 줄로 펼친다 */
async function gather(files: File[]): Promise<UpItem[]> {
  const out: UpItem[] = [];
  for (const f of files) {
    if (/\.zip$/i.test(f.name)) { for (const z of await libAssets.unzip(await f.arrayBuffer())) if (A().IMG.test(z.name) && !/(^|\/)(__MACOSX\/|\._)/.test(z.name)) out.push({ fileName: z.name.split('/').pop() || '', mime: mimeOf(z.name), load: async () => bytesToDataURL(z.data, mimeOf(z.name)) }); }
    else if (f.type?.startsWith('image/') || A().IMG.test(f.name)) out.push({ fileName: f.name, mime: f.type || mimeOf(f.name), load: () => readDataURL(f) });
  }
  return out;
}
/** PNG · JPEG 를 WebP 로 (더 커지면 원본을 쓴다. GIF 는 건드리지 않는다) */
function toWebp(dataUrl: string, mime: string): Promise<string> {
  if (!cfg().webp || !/image\/(png|jpe?g)/.test(mime)) return Promise.resolve(dataUrl);
  return new Promise(res => {
    const img = new Image();
    img.onload = () => { try { const cv = document.createElement('canvas'); cv.width = img.naturalWidth; cv.height = img.naturalHeight; cv.getContext('2d')!.drawImage(img, 0, 0); const out = cv.toDataURL('image/webp', 0.9); res(out.startsWith('data:image/webp') && out.length < dataUrl.length ? out : dataUrl); } catch { res(dataUrl); } };
    img.onerror = () => res(dataUrl); img.src = dataUrl;
  });
}
export async function upload(owner: string, ver: string, files: File[], onProgress: (n: number, total: number) => void = () => { }): Promise<number> {
  const As = A();
  let items: UpItem[];
  try { items = await gather(files); } catch (e) { toast(t('assets.up.readFail', { error: errMsg(e) }), 'err'); return 0; }
  if (!items.length) { toast(t('assets.up.noImages')); return 0; }
  await As.load([owner]);
  if (cfg().confirmOverwrite) {
    const have = new Set(As.inVer(owner, ver).map(a => a.name)), dup = [...new Set(items.map(i => As.cleanName(i.fileName)).filter(n => have.has(n)))];
    if (dup.length && !(await confirmBox(t('assets.up.overwriteAsk', { count: dup.length, names: dup.slice(0, 5).join(', '), more: dup.length > 5 ? t('assets.up.more', { count: dup.length - 5 }) : '' }), t('assets.up.overwrite'), true))) return 0;
  }
  let n = 0, fail = 0;
  for (const it of items) {
    try { const data = await toWebp(await it.load(), it.mime); if (!data) throw new Error(t('assets.up.emptyFile')); await As.add(owner, it.fileName, data, { ver }); n++; }
    catch (e) { console.warn('[에셋 올리기]', it.fileName, e); fail++; }
    onProgress(n + fail, items.length);
  }
  toast(t('assets.up.done', { count: n }) + (fail ? t('assets.up.doneFail', { count: fail }) : ''), n ? 'ok' : 'err');
  return n;
}
export async function uploadFromUrl(owner: string, ver: string, rawUrl: string, label?: string): Promise<number> {
  const url = String(rawUrl || '').trim();
  if (!/^https?:\/\//i.test(url)) { toast(t('assets.up.needHttp'), 'err'); return 0; }
  let blob: Blob;
  try { const r = await fetch(url); if (!r.ok) throw new Error('HTTP ' + r.status); blob = await r.blob(); }
  catch (e) { toast(t('assets.up.fetchFail', { error: errMsg(e) }), 'err'); return 0; }
  const fromUrl = safeDecode(url.split(/[?#]/)[0].split('/').pop() || '');
  const mime = blob.type?.startsWith('image/') ? blob.type : A().IMG.test(fromUrl) ? mimeOf(fromUrl) : '';
  if (!mime) { toast(t('assets.up.notImage'), 'err'); return 0; }
  const name = (label || A().keyOf(fromUrl) || 'image') + '.' + (mime.split('/')[1] || 'png').replace('jpeg', 'jpg');
  return upload(owner, ver, [new File([blob], name, { type: mime })]);
}

// ════════ 이름 정돈 ════════
export type TidyKey = 'space' | 'special' | 'clean' | 'lower' | 'dot' | 'bare';
export type TidyOpt = Record<TidyKey, boolean>;
/** [키, 이름 키, 설명 키, 기본값] */
export const TIDY: [TidyKey, string, string, boolean][] = [['space', 'assets.tidy.space', 'assets.tidy.spaceHint', true], ['special', 'assets.tidy.special', 'assets.tidy.specialHint', true], ['clean', 'assets.tidy.clean', 'assets.tidy.cleanHint', true], ['lower', 'assets.tidy.lower', 'assets.tidy.lowerHint', true], ['dot', 'assets.tidy.dot', 'assets.tidy.dotHint', true], ['bare', 'assets.tidy.bare', 'assets.tidy.bareHint', false]];
export function tidyName(name: string, o: TidyOpt): string {
  let b = name;
  if (o.space) b = b.replace(/\s+/g, '_');
  if (o.dot) b = b.replace(/\./g, '_');
  if (o.special) b = b.replace(o.dot ? /[^\w가-힣_-]/g : /[^\w가-힣_.-]/g, '');
  if (o.clean) b = b.replace(/_+/g, '_').replace(/^_|_$/g, '');
  if (o.lower) b = b.toLowerCase();
  if (o.bare) b = b.replace(/([a-zA-Z가-힣])(\d+)$/, '$1_$2');
  return b;
}
export interface TidyStep { a: AssetRec; n: string; clash: boolean }
export function tidyPlan(list: AssetRec[], o: TidyOpt): TidyStep[] {
  const taken = new Set(list.map(a => a.name)), out: TidyStep[] = [];
  for (const a of list) { const n = tidyName(a.name, o); if (!n || n === a.name) continue; const clash = taken.has(n); if (!clash) { taken.delete(a.name); taken.add(n); } out.push({ a, n, clash }); }
  return out;
}

// ════════ 내보내기 · 백업 ════════
export async function exportZip(char: CharX) {
  const As = A(), owner = As.ownerOfChar(char.id); await As.load([owner]);
  const list = As.list(owner); if (!list.length) return toast(t('assets.export.none'));
  const seen = new Set<string>(), files: ZipFile[] = [];
  for (const a of list) { let name = `${a.ver ? safeFile(a.ver) + '/' : ''}${safeFile(a.name)}.${extOf(a.data)}`; while (seen.has(name)) name = name.replace(/(\.\w+)$/, '_$1'); seen.add(name); files.push({ name, data: dataURLToBytes(a.data) }); }
  download(`${safeFile(char.name)}_assets.zip`, libAssets.zip(files), 'application/zip');
  toast(t('assets.export.zipDone', { count: files.length }), 'ok');
}
export function exportSettings() {
  download(`dreamland-assets-settings_${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify({ type: 'dreamland-assets-settings', version: 1, exportedAt: new Date().toISOString(), settings: cfg() }, null, 2));
  toast(t('assets.export.settingsDone'), 'ok');
}
export async function importSettings(done: () => void) {
  const [f] = await pickFiles({ accept: '.json' }); if (!f) return;
  let data: { type?: string; settings?: Partial<AssetsCfg> } | null; try { data = JSON.parse(await f.text()); } catch { return toast(t('assets.import.badJson'), 'err'); }
  const s = data?.type === 'dreamland-assets-settings' ? data.settings : null;
  if (!s || typeof s !== 'object' || !Array.isArray(s.presets)) return toast(t('assets.import.notBackup'), 'err');
  if (!(await confirmBox(t('assets.import.restoreAsk'), t('assets.import.restore')))) return;
  S.set({ assets: { ...S.settings.assets, ...s } }); cfg();
  toast(t('assets.import.restored'), 'ok'); done();
}
export function exportPreset() {
  const p = presetOf();
  download(`asset-preset_${safeFile(p.name)}.json`, JSON.stringify([{ name: p.name, prompt: p.prompt }], null, 2));
  toast(t('assets.export.presetDone', { name: presetName(p) }), 'ok');
}
export async function importPresets(done: () => void) {
  const [f] = await pickFiles({ accept: '.json' }); if (!f) return;
  let data: unknown; try { data = JSON.parse(await f.text()); } catch { return toast(t('assets.import.badJson'), 'err'); }
  const wrap = data as { presets?: unknown } | null;
  const raw: unknown[] = Array.isArray(data) ? data : Array.isArray(wrap?.presets) ? wrap.presets : [data];
  const list = raw.filter((p): p is { name: string; prompt: string } => { const x = p as { name?: unknown; prompt?: unknown } | null; return !!x && typeof x.name === 'string' && typeof x.prompt === 'string' && !!x.prompt.trim(); });
  if (!list.length) return toast(t('assets.import.noPresets'), 'err');
  const c = cfg(); let added = 0, updated = 0;
  for (const p of list) {
    const old = c.presets.find(x => x.name === p.name);
    if (old) { if (await confirmBox(t('assets.import.presetExists', { name: p.name }), t('assets.up.overwrite'))) { old.prompt = p.prompt; updated++; } }
    else { const id = 'p' + Date.now().toString(36) + added; c.presets.push({ id, name: p.name, prompt: p.prompt }); c.preset = id; added++; }
  }
  save(); toast(t('assets.import.presetsDone', { count: added }) + (updated ? t('assets.import.presetsUpdated', { count: updated }) : ''), 'ok'); done();
}
