// 캐릭터 에셋: 설정 · 안내문 채우기 · 올리기 · 별칭 · 대화 점검 · 정리 · 내보내기 (화면 없는 부분)
import type { ChatX, CharX } from '../addons/types';
import type { Msg, Persona, Settings } from '../lib/types';
import { errMsg } from '../addons/parts';
import * as libAssets from '../lib/assets';
import type { AssetRec, How } from '../lib/assets';
import { confirmBox, toast } from '../ui';
import { bytesToDataURL, mimeOf, readDataURL, S, DB, dataURLToBytes, download, pickFiles, newRegex, sleep } from '../lib/core';
import { X } from '../lib/hooks';
import { tokens } from '../lib/engine';
import { chatApi } from '../chat/actions';
import { cur, bump, ui } from '../chat/store';
import { t } from '../i18n';

export type { AssetRec };
interface ZipFile { name: string; data: Uint8Array }
export const A = () => libAssets.Assets;

export interface AstPreset { id: string; name: string; prompt: string; /** 마지막으로 저장한 내용 (고친 표시 · 되돌리기) */ saved?: string }
export interface CharCfg { link: string; ver: string; vers: string[] }
export type Where = 'top' | 'before' | 'depth' | 'end';
export interface AssetsCfg {
  inject?: boolean; max?: number; random?: boolean; prompt?: string;
  presets: AstPreset[]; preset: string; chars: Record<string, CharCfg>;
  ui: { char?: string; persona?: string; grid?: string; tab?: string; filter?: string; sort?: string; view?: string; setupHidden?: boolean; closed?: string[] };
  depth: number; where: Where; role: string; style: string; maxSize: number; lazy: boolean; zoom: boolean; webp: boolean; confirmOverwrite: boolean;
  show: boolean; caption: boolean; fuzzy: boolean; missing: 'hint' | 'hide' | 'keep'; sprites: boolean;
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
/** 안내문을 넣는 자리 [값, 이름 키] — 프롬프트 엔진의 조각 자리와 같다 */
export const WHERE: [Where, string][] = [['top', 'assets.where.top'], ['before', 'assets.where.before'], ['depth', 'assets.where.depth'], ['end', 'assets.where.end']];
export const ROLES: [string, string][] = [['system', 'assets.role.system'], ['user', 'assets.role.user'], ['assistant', 'assets.role.assistant']];
/** 옛 스타일 이름 → 지금 틀 */
const OLD_STYLE: Record<string, string> = { default: 'plain', border: 'ink', clean: 'plain', vignette: 'shadow', cinema: 'film' };
const DEFAULTS = { depth: 2, where: 'depth', role: 'system', style: 'ink', maxSize: 400, lazy: true, zoom: true, webp: false, confirmOverwrite: true, show: true, caption: false, fuzzy: true, missing: 'hint', sprites: false };

export function cfg(): AssetsCfg {
  const c = S.settings.assets as unknown as AssetsCfg;
  if (!Array.isArray(c.presets) || !c.presets.length) {
    c.presets = DEFAULT_PRESETS.map((p, i) => ({ id: 'd' + i, ...p }));
    if (c.prompt?.trim()) { c.presets.push({ id: 'custom', name: '내 안내문', prompt: c.prompt }); c.preset = 'custom'; }
  }
  for (const p of c.presets) if (typeof p.saved !== 'string') p.saved = p.prompt;
  if (!c.presets.some(p => p.id === c.preset)) c.preset = c.presets[0].id;
  if (!c.chars || typeof c.chars !== 'object') c.chars = {};
  if (!c.ui || typeof c.ui !== 'object') c.ui = {};
  const rec = c as unknown as Record<string, unknown>;
  for (const [k, d] of Object.entries(DEFAULTS)) if (rec[k] === undefined) rec[k] = d;
  if (OLD_STYLE[c.style]) c.style = OLD_STYLE[c.style]; else if (!STYLES.some(s => s[0] === c.style)) c.style = 'ink';
  if (!WHERE.some(w => w[0] === c.where)) c.where = 'depth';
  return c;
}
export const save = () => S.set({ assets: cfg() as unknown as Settings['assets'] });
/** 화면에 적을 프리셋 이름: 기본으로 만들어진 이름 그대로면 번역해서 */
const PRESET_KEYS: Record<string, [string, string]> = { d0: ['기본 프리셋', 'assets.preset.d0'], d1: ['1:1 감정/표정형', 'assets.preset.d1'], d2: ['시뮬레이션/장소·아이템형', 'assets.preset.d2'], custom: ['내 안내문', 'assets.preset.custom'] };
export const presetName = (p: AstPreset) => { const k = PRESET_KEYS[p.id]; return k && k[0] === p.name ? t(k[1]) : p.name; };
export const presetOf = (): AstPreset => { const c = cfg(); return c.presets.find(p => p.id === c.preset) || c.presets[0]; };
export const isDirty = (p: AstPreset) => (p.saved ?? p.prompt) !== p.prompt;
export const charCfg = (id: string): CharCfg => { const c = cfg(), cc = (c.chars[id] ||= { link: '', ver: '', vers: [] }); if (!Array.isArray(cc.vers)) cc.vers = []; return cc; };
export const ownersOf = (chat?: ChatX | null, persona?: Persona): string[] => chat ? [...chat.charIds.map(A().ownerOfChar), A().ownerOfPersona((persona || S.persona(chat))?.id)] : [];
const charKey = (id?: string) => { if (!id) return ''; const o = A().ownerOfChar(id), src = S.get('chars', (A().source(o) || '').slice(5)), v = A().verOf(o); return (src?.name || '') + (v ? '/' + v : ''); };
const randOf = (owners: string[], prefix: unknown) => { const k = String(prefix || '').trim().toLowerCase(); if (!k) return ''; const hit = owners.flatMap(o => A().active(o)).filter(a => a.name.startsWith(k)); return hit.length ? hit[Math.floor(Math.random() * hit.length)].name : ''; };

/** 안내문의 빈칸 채우기 */
export function renderPrompt(owners: string[], charId?: string, text: string = presetOf().prompt): string {
  const c = cfg(), As = A();
  const v: Record<string, () => string> = { img_keywords: () => As.names(owners).join(', '), img_keywords_autogen: () => As.names(owners).join(', '), img_keywords_grouped: () => As.grouped(owners) || As.names(owners).join(', '), keywords: () => As.keywords(owners), img_count: () => String(As.count(owners)), max: () => String(c.max || 2), charkey: () => charKey(charId) };
  return String(text || libAssets.ASSET_PROMPT).replace(/\{\{(img_keywords_autogen|img_keywords_grouped|img_keywords|img_count|keywords|max|charkey)\}\}/gi, (_m, k: string) => v[k.toLowerCase()]())
    .replace(/\{\{img_rand::([^{}]+)\}\}/gi, (_m, p: string) => randOf(owners, p)).replace(/\{\{img_resolve::([^{}]+)\}\}/gi, (_m, n: string) => As.resolve(owners, n)?.name || '');
}
/** 안내문 크기: 글자 수 · 토큰(어림) · 빈칸을 채운 뒤의 토큰 */
export const promptStats = (text: string, owners: string[], charId?: string) => ({ chars: text.length, tok: tokens(text), filled: owners.length ? tokens(renderPrompt(owners, charId, text)) : 0 });
/** 캐릭터 카드 · 작가 노트에 {{img_inprompt}} 를 직접 적어 두었는지 (그러면 자동으로 또 넣지 않는다) */
const handPlaced = (chat: ChatX, chars: CharX[]) => [chat.note?.text, ...chars.flatMap(c => [c.description, c.personality, c.scenario, c.systemPrompt, c.postHistory, c.depthPrompt?.prompt])].some(s => typeof s === 'string' && /\{\{img_inprompt\}\}/i.test(s));

/** 프롬프트 조각 · 매크로를 등록한다 (studio.js 의 기본 조각을 대신한다) */
export function registerPrompt() {
  const As = A();
  X.prompt = X.prompt.filter(p => p.owner !== 'assets');
  X.prompt.push({ owner: 'assets', fn: ({ chat, chars, persona }) => {
    const c = cfg(); if (!c.inject) return [];
    const owners = ownersOf(chat, persona); if (!As.count(owners) || handPlaced(chat, chars || [])) return [];
    return [{ where: c.where, role: c.role || 'system', depth: Math.max(0, +c.depth || 0), order: 40, content: renderPrompt(owners, chat.charIds[0]), src: `에셋 안내문 (${presetOf().name})` }];
  } });
  const here = () => { const { chat } = chatApi.current(); return { owners: ownersOf(chat), charId: chat?.charIds?.[0] || '' }; };
  const macro = (name: string, fn: (args: string[]) => string) => X.macros.set(name, { owner: 'assets', fn: a => fn(Array.isArray(a) ? a.map(String) : []) });
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
  dots: 'M12 5.5h.01M12 12h.01M12 18.5h.01', at: 'M16 12a4 4 0 1 1-1.2-2.9M16 8v5a2.5 2.5 0 0 0 5 0v-1a9 9 0 1 0-3.5 7.1', rows: 'M4 6h16M4 12h16M4 18h16',
  insert: 'M20 4v7a4 4 0 0 1-4 4H5M9 11l-4 4 4 4', stethoscope: 'M6 3v6a5 5 0 0 0 10 0V3M11 14v2a4 4 0 0 0 8 0v-2M19 12a2 2 0 1 0 0 .01', eraser: 'M8 20h12M5 15l9-9 5 5-9 9H8z', code: 'M8 7l-5 5 5 5M16 7l5 5-5 5',
};
export async function copy(text: string, msg: string) {
  try { await navigator.clipboard.writeText(text); }
  catch { const ta = document.createElement('textarea'); ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0'; (document.querySelector('#modals .modal-wrap:last-child') || document.body).append(ta); ta.select(); try { document.execCommand('copy'); } catch { /* 복사할 길이 없다 */ } ta.remove(); }
  toast(msg);
}
const EXT: Record<string, string> = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'image/gif': 'gif', 'image/avif': 'avif', 'image/svg+xml': 'svg', 'image/bmp': 'bmp' };
export const mimeOfData = (dataUrl: string) => String(dataUrl).slice(5, Math.max(5, String(dataUrl).indexOf(';')));
export const extOf = (dataUrl: string) => EXT[mimeOfData(dataUrl)] || 'png';
/** data: 글자 길이로 어림한 실제 크기 (바이트) */
export const bytesOf = (dataUrl: string) => { const d = String(dataUrl), i = d.indexOf(','); return i < 0 ? d.length : /;base64$/i.test(d.slice(0, i)) ? Math.floor((d.length - i - 1) * 3 / 4) : d.length - i - 1; };
export const fmtBytes = (n: number) => n < 1024 ? n + ' B' : n < 1048576 ? (n / 1024).toFixed(n < 10240 ? 1 : 0) + ' KB' : (n / 1048576).toFixed(1) + ' MB';
const safeFile = (s: unknown) => String(s || 'assets').replace(/[\\/:*?"<>|]+/g, '_').trim() || 'assets';
export const tagOf = (a: { name: string }) => `{{img::${a.name}}}`;
export const SAMPLE = 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="320" height="400" viewBox="0 0 160 200"><rect width="160" height="200" fill="#e9e9ee"/><circle cx="104" cy="62" r="30" fill="#1f2a5c"/><circle cx="116" cy="54" r="26" fill="#e9e9ee"/><path d="M0 200V150l42-44 34 32 28-22 56 52v32z" fill="#c9cbd6"/><path d="M36 40l3 9 9 3-9 3-3 9-3-9-9-3 9-3z" fill="#1f2a5c"/></svg>');
/** 보관함 주인 → 화면에 적을 사람 (캐릭터 · 페르소나) */
export const whoOf = (owner: string): { name: string; avatar?: string } | null => owner.startsWith('char:') ? S.get('chars', owner.slice(5)) || null : owner.startsWith('persona:') ? S.get('personas', owner.slice(8)) || null : null;
/** 화면이 다루는 보관함 하나: 주인 · 실제로 읽는 곳(링크) · 버전 · 잠김(빌려 쓰는 중) · 이름 */
export interface Src { owner: string; src: string; ver: string; locked: boolean; label: string }
export const srcOf = (owner: string): Src => { const As = A(), src = As.source(owner) || owner; return { owner, src, ver: As.verOf(owner), locked: src !== owner, label: whoOf(owner)?.name || owner }; };
/** 대화 하나의 보관함들: 멤버마다 · 그다음 페르소나 */
export const chatSrcs = (chat?: ChatX | null): Src[] => ownersOf(chat).filter(o => !!whoOf(o)).map(srcOf);

let redrawT = 0;
/** 에셋 · 표시 설정이 바뀌면 그림 태그가 들어 있을 만한 메시지만 다시 그린다 (대화 전체를 새로 꾸미지 않는다) */
export function refreshChat() {
  clearTimeout(redrawT);
  redrawT = window.setTimeout(() => {
    if (!cur.chat) return;
    const chs: string[] = [];
    for (let i = Math.max(0, cur.head); i < cur.msgs.length; i++) { const m = cur.msgs[i], s = m.swipes[m.sw]; if (s && /img/i.test(s.text + (s.tr || ''))) chs.push('m:' + m.id); }
    if (chs.length) bump(...chs);
  }, 30);
}
/** 입력창의 커서 자리에 태그를 넣는다. 대화 화면이 아니면 복사한다 */
export function insertTag(a: { name: string }) {
  const tag = tagOf(a), inp = ui.input;
  if (!inp?.isConnected) return void copy(tag, t('assets.copiedTag', { tag }));
  const at = inp.selectionStart ?? inp.value.length, end = inp.selectionEnd ?? at, before = inp.value.slice(0, at), glue = before && !/\s$/.test(before) ? ' ' : '';
  inp.setRangeText(glue + tag, at, end, 'end'); inp.dispatchEvent(new Event('input', { bubbles: true }));
  toast(t('assets.inserted', { tag }), 'ok');
}
export function downloadAsset(a: AssetRec) { const m = mimeOfData(a.data) || 'image/png'; download(`${safeFile(a.name)}.${extOf(a.data)}`, new Blob([dataURLToBytes(a.data) as BlobPart], { type: m }), m); }
/** 별칭 저장: 같은 보관함 · 버전의 다른 파일 이름과 같은 것은 뺀다 (그 파일이 먼저 쓰이므로) → 뺀 수 */
export async function setAliases(a: AssetRec, list: string[]) {
  const As = A(), names = new Set(As.inVer(a.owner, a.ver || '').map(x => x.name)), clean = As.cleanAliases(list, a.name), keep = clean.filter(x => !names.has(x));
  const { aliases: _old, ...rest } = a; await As.update(keep.length ? { ...rest, aliases: keep } : rest); refreshChat();
  return clean.length - keep.length;
}
export const addAlias = (a: AssetRec, alias: string) => setAliases(a, [...(a.aliases || []), alias]);
export async function setOff(list: AssetRec[], off: boolean) { for (const a of list) if (!!a.disabled !== off) await A().update({ ...a, disabled: off }); refreshChat(); }

// ════════ 올리기 ════════
// 일: 몇 개 중 몇 개 · 실패 수 · 멈추기. 화면(진행 막대)은 jobState 를 지켜본다
export interface Job { label: string; total: number; done: number; fail: number; stop: boolean; end?: string }
let job: Job | null = null; const jobSubs = new Set<() => void>();
const ping = (j: Job | null) => { job = j; for (const f of jobSubs) f(); };
export const jobState = { get: () => job, sub: (f: () => void) => { jobSubs.add(f); return () => { jobSubs.delete(f); }; } };
export const stopJob = () => { if (job && !job.end) ping({ ...job, stop: true }); };
const MANIFEST = '_dreamland-assets.json';
interface Manifest { files: { name: string; ver?: string; disabled?: boolean; aliases?: string[] }[] }
interface UpItem { fileName: string; mime: string; load(): Promise<string> }
/** 고른 파일(이미지 · ZIP)을 한 줄로 펼친다. 같은 이름은 뒤의 것 하나만. ZIP 에 든 목록표(별칭 · 꺼짐)도 읽는다 */
async function gather(files: File[]): Promise<{ items: UpItem[]; meta: Manifest | null }> {
  const out = new Map<string, UpItem>(); let meta: Manifest | null = null;
  const put = (it: UpItem) => { const k = A().cleanName(it.fileName); if (!k) return; out.delete(k); out.set(k, it); };
  for (const f of files) {
    if (/\.zip$/i.test(f.name) || /zip/.test(f.type || '')) {
      for (const z of await libAssets.unzip(await f.arrayBuffer())) {
        const base = z.name.split('/').pop() || '';
        if (base === MANIFEST) { try { const j = JSON.parse(new TextDecoder().decode(z.data)); if (Array.isArray(j?.files)) meta = j; } catch { /* 목록표가 깨졌으면 그림만 */ } continue; }
        if (A().IMG.test(z.name) && !/(^|\/)(__MACOSX\/|\._)/.test(z.name)) put({ fileName: base, mime: mimeOf(z.name), load: async () => bytesToDataURL(z.data, mimeOf(z.name)) });
      }
    } else if (f.type?.startsWith('image/') || A().IMG.test(f.name)) put({ fileName: f.name, mime: f.type || mimeOf(f.name), load: () => readDataURL(f) });
  }
  return { items: [...out.values()], meta };
}
/** PNG · JPEG 를 WebP 로 (더 커지면 원본을 쓴다. GIF 는 건드리지 않는다). ZIP 안의 그림도 같다 */
function toWebp(dataUrl: string, mime: string): Promise<string> {
  if (!cfg().webp || !/image\/(png|jpe?g)/.test(mime)) return Promise.resolve(dataUrl);
  return new Promise(res => {
    const img = new Image();
    img.onload = () => { try { const cv = document.createElement('canvas'); cv.width = img.naturalWidth; cv.height = img.naturalHeight; cv.getContext('2d')!.drawImage(img, 0, 0); const out = cv.toDataURL('image/webp', 0.9); res(out.startsWith('data:image/webp') && out.length < dataUrl.length ? out : dataUrl); } catch { res(dataUrl); } };
    img.onerror = () => res(dataUrl); img.src = dataUrl;
  });
}
/** 그림 · ZIP 을 한 보관함(버전)에 넣는다: 겹치는 이름은 먼저 묻고, 셋씩 나눠 읽고 저장하며, 실패한 것은 한 번 더 해 본다. 중간에 멈출 수 있다 */
export async function upload(owner: string, ver: string, files: File[], label = ''): Promise<number> {
  const As = A();
  if (job && !job.end) { toast(t('assets.up.busy')); return 0; }
  let got: Awaited<ReturnType<typeof gather>>;
  try { got = await gather(files); } catch (e) { toast(t('assets.up.readFail', { error: errMsg(e) }), 'err'); return 0; }
  const items = got.items; if (!items.length) { toast(t('assets.up.noImages')); return 0; }
  await As.load([owner]);
  if (cfg().confirmOverwrite) {
    const have = new Set(As.inVer(owner, ver).map(a => a.name)), dup = items.map(i => As.cleanName(i.fileName)).filter(n => have.has(n));
    if (dup.length && !(await confirmBox(t('assets.up.overwriteAsk', { count: dup.length, names: dup.slice(0, 5).join(', '), more: dup.length > 5 ? t('assets.up.more', { count: dup.length - 5 }) : '' }), t('assets.up.overwrite'), true))) return 0;
  }
  ping({ label: label || t('assets.up.label'), total: items.length, done: 0, fail: 0, stop: false });
  const one = async (it: UpItem) => {
    for (let tries = 0; ; tries++) {
      try { const data = await toWebp(await it.load(), it.mime); if (!data) throw new Error(t('assets.up.emptyFile')); await As.add(owner, it.fileName, data, { ver }); return true; }
      catch (e) { if (tries >= 1) { console.warn('[에셋 올리기]', it.fileName, e); return false; } await sleep(250); }
    }
  };
  let n = 0;
  for (let i = 0; i < items.length && !job?.stop; i += 3) {
    const res = await Promise.all(items.slice(i, i + 3).map(one)), fail = res.filter(ok => !ok).length;
    n += res.length - fail; if (job) ping({ ...job, done: Math.min(items.length, i + 3), fail: job.fail + fail });
  }
  // ZIP 에 든 목록표: 별칭 · 꺼 둔 상태를 되살린다
  if (got.meta) for (const f of got.meta.files) {
    const a = As.inVer(owner, ver).find(x => x.name === As.cleanName(f.name)); if (!a) continue;
    const al = As.cleanAliases(Array.isArray(f.aliases) ? f.aliases : [], a.name);
    if (al.length || f.disabled) await As.update({ ...a, ...(al.length ? { aliases: [...new Set([...(a.aliases || []), ...al])] } : {}), disabled: !!f.disabled });
  }
  const fail = job?.fail || 0, stopped = !!job?.stop;
  ping(job ? { ...job, end: stopped ? t('assets.up.stopped', { count: n }) : t('assets.up.done', { count: n }) + (fail ? t('assets.up.doneFail', { count: fail }) : '') } : null);
  setTimeout(() => { if (job?.end) ping(null); }, 2400);
  toast(stopped ? t('assets.up.stopped', { count: n }) : t('assets.up.done', { count: n }) + (fail ? t('assets.up.doneFail', { count: fail }) : ''), n ? 'ok' : 'err');
  refreshChat();
  return n;
}
/** 붙여 넣은 그림: 이름이 image.png 같은 것뿐이면 붙일 이름을 받는다 (ask 가 null 이면 그만둔다) */
export async function namePasted(files: File[], ask: (suggest: string) => Promise<string | null>): Promise<File[] | null> {
  const stamp = new Date().toISOString().replace(/\D/g, '').slice(2, 12), out: File[] = [];
  for (const [i, f] of files.entries()) {
    const ext = EXT[f.type] || (f.name.split('.').pop() || 'png').toLowerCase(), plain = !f.name || /^(image|clipboard|screenshot|blob)([\s_\-.(\d)]*)\.\w+$/i.test(f.name);
    let base = plain ? `pasted_${stamp}${files.length > 1 ? '_' + (i + 1) : ''}` : f.name.replace(/\.[^.]+$/, '');
    if (files.length === 1) { const v = await ask(base); if (v == null) return null; base = A().cleanName(v) || base; }
    out.push(new File([f], `${base}.${ext}`, { type: f.type || mimeOf('x.' + ext) }));
  }
  return out;
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
  // 받은 그림의 실제 형식으로 확장자를 붙인다 (jpg · webp · gif 를 png 로 적지 않게)
  const name = (label || A().keyOf(fromUrl) || 'image') + '.' + (EXT[mime] || 'png');
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
  if (o.special) b = b.replace(o.dot ? /[^\w가-힣ㄱ-ㅎㅏ-ㅣ぀-ヿ一-鿿_-]/g : /[^\w가-힣ㄱ-ㅎㅏ-ㅣ぀-ヿ一-鿿_.-]/g, '');
  if (o.clean) b = b.replace(/_+/g, '_').replace(/^_|_$/g, '');
  if (o.lower) b = b.toLowerCase();
  if (o.bare) b = b.replace(/([a-zA-Z가-힣])(\d+)$/, '$1_$2');
  return b;
}
export interface TidyStep { a: AssetRec; n: string; clash: boolean }
/** 바뀔 이름 미리 보기: 다른 파일과 이름이 겹치면(대소문자만 달라도) 건너뛴다. 한 줄을 고쳐 쓰는 것이라 별칭 · 꺼짐은 그대로 따라간다 */
export function tidyPlan(list: AssetRec[], o: TidyOpt): TidyStep[] {
  const low = (s: string) => s.toLowerCase(), taken = new Map(list.map(a => [low(a.name), a.id])), out: TidyStep[] = [];
  for (const a of list) {
    const n = tidyName(a.name, o); if (!n || n === a.name) continue;
    const owner = taken.get(low(n)), clash = owner !== undefined && owner !== a.id;
    if (!clash) { if (taken.get(low(a.name)) === a.id) taken.delete(low(a.name)); taken.set(low(n), a.id); }
    out.push({ a, n, clash });
  }
  return out;
}

// ════════ 대화 점검 ════════
export interface Inspect { msgs: number; withTags: number; total: number; used: [string, number][]; near: { name: string; file: string; how: How; n: number }[]; miss: { name: string; n: number; cand: AssetRec[] }[]; unused: string[] }
/** 이 대화에 나온 태그: 몇 개 · 어떤 이름이 많이 쓰였나 · 비슷한 이름으로 찾은 것 · 못 찾은 이름(과 후보) · 한 번도 안 쓰인 키워드 */
export function inspect(msgs: Msg[], owners: string[]): Inspect {
  const As = A(), used = new Map<string, number>(), near = new Map<string, Inspect['near'][number]>(), miss = new Map<string, number>(); let total = 0, withTags = 0;
  for (const m of msgs) {
    const tags = As.tags(m.swipes?.[m.sw]?.text || ''); if (!tags.length) continue; withTags++;
    for (const name of tags) {
      total++; const h = As.match(owners, name);
      if (!h) { miss.set(name, (miss.get(name) || 0) + 1); continue; }
      const b = As.baseOf(h.main.name); used.set(b, (used.get(b) || 0) + 1);
      if (h.how !== 'exact' && h.how !== 'group') { const k = As.lookKey(name), v = near.get(k) || { name, file: h.main.name, how: h.how, n: 0 }; v.n++; near.set(k, v); }
    }
  }
  const all = [...new Set(owners.flatMap(o => As.active(o)).map(a => As.baseOf(a.name)))];
  return { msgs: msgs.length, withTags, total, used: [...used].sort((a, b) => b[1] - a[1]), near: [...near.values()].sort((a, b) => b.n - a.n),
    miss: [...miss].sort((a, b) => b[1] - a[1]).map(([name, n]) => ({ name, n, cand: As.suggest(owners, name) })), unused: all.filter(b => !used.has(b)).sort((a, b) => a.localeCompare(b, undefined, { numeric: true })) };
}

// ════════ 정리 ════════
export interface Cleanup { gone: string[]; links: string[]; orphan: [string, string][]; ui: number }
/** 남은 것: 지워진 캐릭터의 설정 · 지워진 캐릭터를 가리키는 링크 · 주인 없는 그림(지워진 캐릭터 · 페르소나의 에셋) · 사라진 대상을 가리키는 화면 기억 */
export async function cleanupPlan(): Promise<Cleanup> {
  const c = cfg(), has = (k: 'chars' | 'personas', id?: string) => !!id && !!S.get(k, id);
  const gone = Object.keys(c.chars).filter(id => !has('chars', id)), links = Object.entries(c.chars).filter(([id, cc]) => has('chars', id) && cc.link && !has('chars', cc.link)).map(([id]) => id);
  const orphan = (await DB.owners()).filter(([, o]) => (o.startsWith('char:') && !has('chars', o.slice(5))) || (o.startsWith('persona:') && !has('personas', o.slice(8))));
  return { gone, links, orphan, ui: +(!!c.ui.char && !has('chars', c.ui.char)) + +(!!c.ui.persona && !has('personas', c.ui.persona)) };
}
export async function cleanup(p: Cleanup) {
  const c = cfg();
  for (const id of p.gone) delete c.chars[id];
  for (const id of p.links) c.chars[id].link = '';
  if (c.ui.char && !S.get('chars', c.ui.char)) delete c.ui.char;
  if (c.ui.persona && !S.get('personas', c.ui.persona)) delete c.ui.persona;
  save();
  if (p.orphan.length) { await DB.batch('assets', (_o, log) => { for (const [id] of p.orphan) log.del(id); }); await A().reload([...new Set(p.orphan.map(x => x[1]))]); }
}
/** 이 캐릭터의 설정만 처음으로: 링크 · 쓰는 버전 · 별칭 · 꺼 둔 상태. 그림은 그대로 (버전 목록은 그림이 든 버전으로 맞춘다) */
export async function resetChar(id: string) {
  const As = A(), o = As.ownerOfChar(id); await As.load([o]);
  for (const a of As.list(o)) if (a.disabled || a.aliases?.length) { const { aliases: _al, ...rest } = a; await As.update({ ...rest, disabled: false }); }
  cfg().chars[id] = { link: '', ver: '', vers: [...new Set(As.list(o).map(a => a.ver || '').filter(Boolean))] }; save(); refreshChat();
}
/** 화면에 보이기 전에 {{img::}} 를 먼저 바꾸는 정규식 (그러면 그 태그에는 여기 틀이 쓰이지 않는다) */
export const regexClash = (charIds: string[] = []) => S.regex.filter(r => r.enabled && (r.scope === 'global' || charIds.includes(r.scope)) && r.mode !== 'prompt' && r.mode !== 'store' && /img\\?:\\?:/i.test(r.find || ''));
/** 지금 틀을 고쳐 쓸 수 있는 정규식으로 만든다 (꺼 둔 채 정규식 목록에 넣는다). 바꾼 그림은 에셋 보관함에서 이름으로 찾는다 */
export async function frameRegex(style: string) {
  const nm = t(STYLES.find(s => s[0] === style)?.[1] || 'assets.style.ink');
  await S.save('regex', newRegex({ name: t('assets.regex.name', { style: nm }), find: '/`?\\{\\{\\s*img::\\s*([^{}]+?)(?:\\.(?:png|jpe?g|gif|webp|avif))?\\s*\\}\\}`?/gi', replace: `<span class="asset-frame as-${style}"><img class="asset-img" src="$1.png" alt="$1"></span>`, onAI: true, mode: 'display', enabled: false, runOnEdit: true }));
  toast(t('assets.regex.made', { name: t('assets.regex.name', { style: nm }) }), 'ok');
}

// ════════ 내보내기 · 백업 ════════
/** 모든 버전을 폴더로 나눠 ZIP 으로. 별칭 · 꺼 둔 상태는 목록표(_dreamland-assets.json)에 적어 다시 올릴 때 되살린다 */
export async function exportZip(char: CharX) {
  const As = A(), owner = As.ownerOfChar(char.id); await As.load([owner]);
  const list = As.list(owner); if (!list.length) return toast(t('assets.export.none'));
  const seen = new Set<string>(), files: ZipFile[] = [];
  for (const a of list) { let name = `${a.ver ? safeFile(a.ver) + '/' : ''}${safeFile(a.name)}.${extOf(a.data)}`; while (seen.has(name)) name = name.replace(/(\.\w+)$/, '_$1'); seen.add(name); files.push({ name, data: dataURLToBytes(a.data) }); }
  const meta = list.filter(a => a.disabled || a.aliases?.length).map(a => ({ name: a.name, ver: a.ver || '', disabled: !!a.disabled, aliases: a.aliases || [] }));
  if (meta.length) files.push({ name: MANIFEST, data: new TextEncoder().encode(JSON.stringify({ type: 'dreamland-assets', version: 1, files: meta }, null, 1)) });
  download(`${safeFile(char.name)}_assets.zip`, libAssets.zip(files), 'application/zip');
  toast(t('assets.export.zipDone', { count: list.length }), 'ok');
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
  toast(t('assets.import.restored'), 'ok'); refreshChat(); done();
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
    if (old) { if (await confirmBox(t('assets.import.presetExists', { name: p.name }), t('assets.up.overwrite'))) { old.prompt = old.saved = p.prompt; updated++; } }
    else { const id = 'p' + Date.now().toString(36) + added; c.presets.push({ id, name: p.name, prompt: p.prompt, saved: p.prompt }); c.preset = id; added++; }
  }
  save(); toast(t('assets.import.presetsDone', { count: added }) + (updated ? t('assets.import.presetsUpdated', { count: updated }) : ''), 'ok'); done();
}
