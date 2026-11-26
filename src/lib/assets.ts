// ── Dreamland assets: 이미지 보관함 (캐릭터 에셋 · 삽화) + ZIP 읽기 + 이름 찾기 ── (옛 js/assets.js 에서 이어 옴)
import { S, DB, uid, now, esc, shrinkImage, readDataURL, bytesToDataURL, mimeOf } from './core';
import { dataToBlob } from './blobUrl';
import { ALIASES as EMO_WORDS, DEFAULT_LABELS } from '../expressions/pure';
import { t } from '../i18n';

export interface ZipFile { name: string; data: Uint8Array }
export interface AssetRec { id: string; owner: string; name: string; data: string; disabled?: boolean; kind?: string; ts?: number; ver?: string; aliases?: string[]; [k: string]: unknown }
interface CharAssetCfg { link?: string; ver?: string; vers?: string[] }
interface AssetSettings { random?: boolean; style?: string; maxSize?: unknown; lazy?: boolean; zoom?: boolean; show?: boolean; caption?: boolean; fuzzy?: boolean; missing?: string; sprites?: boolean; chars?: Record<string, CharAssetCfg> }
interface SApi { settings: { assets: AssetSettings }; get(coll: string, id: unknown): unknown }
interface DbApi { byOwner(owner: string): Promise<AssetRec[]>; put(store: string, rec: unknown): Promise<unknown>; del(store: string, id: string): Promise<unknown> }
const SS = () => S as unknown as SApi;
const db = () => DB as unknown as DbApi;
const shrink = shrinkImage as unknown as (url: string, max?: number) => Promise<string | null>;
const toURL = bytesToDataURL as unknown as (u: Uint8Array, mime: string) => string;
const readURL = readDataURL as unknown as (f: Blob) => Promise<string>;
const mime = mimeOf as unknown as (name: string) => string;
const escape = esc as unknown as (s: unknown) => string;

/** ZIP 풀기 (저장·deflate 만) → [{ name, data: Uint8Array }] */
export async function unzip(buf: ArrayBuffer | Uint8Array): Promise<ZipFile[]> {
  const u = buf instanceof Uint8Array ? buf : new Uint8Array(buf), dv = new DataView(u.buffer, u.byteOffset, u.byteLength);
  let e = u.length - 22; while (e >= 0 && dv.getUint32(e, true) !== 0x06054b50) e--;
  if (e < 0) throw new Error(t('assets.zip.notZip'));
  const count = dv.getUint16(e + 10, true); let p = dv.getUint32(e + 16, true); const out: ZipFile[] = [];
  for (let i = 0; i < count && dv.getUint32(p, true) === 0x02014b50; i++) {
    const method = dv.getUint16(p + 10, true), csize = dv.getUint32(p + 20, true), n = dv.getUint16(p + 28, true), x = dv.getUint16(p + 30, true), c = dv.getUint16(p + 32, true), off = dv.getUint32(p + 42, true);
    const nb = u.subarray(p + 46, p + 46 + n); let name: string;   // 윈도우에서 만든 ZIP 의 한글 이름(CP949)도 읽는다
    try { name = new TextDecoder('utf-8', { fatal: true }).decode(nb); } catch { try { name = new TextDecoder('euc-kr').decode(nb); } catch { name = new TextDecoder().decode(nb); } }
    const start = off + 30 + dv.getUint16(off + 26, true) + dv.getUint16(off + 28, true);
    const raw = u.subarray(start, start + csize);
    if (!name.endsWith('/')) out.push({ name, data: method === 0 ? raw : new Uint8Array(await new Response(new Blob([raw as BlobPart]).stream().pipeThrough(new DecompressionStream('deflate-raw'))).arrayBuffer()) });
    p += 46 + n + x + c;
  }
  return out;
}

/** ZIP 만들기 (압축 없이 저장만) → Blob.  files: [{ name, data: Uint8Array }] */
let crcTable: number[] | undefined;
const crc32 = (u: Uint8Array) => { const T = crcTable ||= Array.from({ length: 256 }, (_, n) => { for (let k = 0; k < 8; k++) n = n & 1 ? 0xedb88320 ^ (n >>> 1) : n >>> 1; return n >>> 0; }); let c = 0xffffffff; for (let i = 0; i < u.length; i++) c = T[(c ^ u[i]) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
export function zip(files: ZipFile[]): Blob {
  const enc = new TextEncoder(), parts: BlobPart[] = [], central: (ArrayBuffer | Uint8Array)[] = []; let off = 0;
  const d = new Date(), time = (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1), date = ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();
  for (const f of files) {
    const name = enc.encode(f.name), data = f.data, crc = crc32(data);
    const head = new DataView(new ArrayBuffer(30));
    head.setUint32(0, 0x04034b50, true); head.setUint16(4, 20, true); head.setUint16(6, 0x0800, true); head.setUint16(8, 0, true); head.setUint16(10, time, true); head.setUint16(12, date, true);
    head.setUint32(14, crc, true); head.setUint32(18, data.length, true); head.setUint32(22, data.length, true); head.setUint16(26, name.length, true); head.setUint16(28, 0, true);
    const cen = new DataView(new ArrayBuffer(46));
    cen.setUint32(0, 0x02014b50, true); cen.setUint16(4, 20, true); cen.setUint16(6, 20, true); cen.setUint16(8, 0x0800, true); cen.setUint16(10, 0, true); cen.setUint16(12, time, true); cen.setUint16(14, date, true);
    cen.setUint32(16, crc, true); cen.setUint32(20, data.length, true); cen.setUint32(24, data.length, true); cen.setUint16(28, name.length, true); cen.setUint32(42, off, true);
    parts.push(head.buffer, name as BlobPart, data as BlobPart); central.push(cen.buffer, name); off += 30 + name.length + data.length;
  }
  const size = central.reduce((n, c) => n + c.byteLength, 0), end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true); end.setUint16(8, files.length, true); end.setUint16(10, files.length, true); end.setUint32(12, size, true); end.setUint32(16, off, true);
  return new Blob([...parts, ...(central as BlobPart[]), end.buffer], { type: 'application/zip' });
}

const IMG = /\.(png|webp|gif|jpe?g|avif)$/i;
const EXTS = /(\.(png|webp|gif|jpe?g|avif|bmp|svg))+$/i;
const keyOf = (name: unknown) => String(name).trim().replace(IMG, '').toLowerCase();
const baseOf = (key: string) => key.replace(/[_.\-]\d+$/, '');
const pickOf = (seed: string, n: number) => { let x = 2166136261; for (let i = 0; i < seed.length; i++) x = Math.imul(x ^ seed.charCodeAt(i), 16777619); return (x >>> 0) % n; };
const cache = new Map<string, AssetRec[]>();   // owner → [{ id, owner, name, data, disabled, ver, aliases }]
const loading = new Map<string, Promise<void>>();   // 읽는 중인 보관함 (여러 곳에서 한꺼번에 불러도 한 번만 읽는다)
let rev = 0;   // 보관함이 바뀔 때마다 오른다 → 이름 찾기 기억을 버린다
const byName = (a: AssetRec, b: AssetRec) => a.name.localeCompare(b.name, undefined, { numeric: true });
/** 캐릭터별 설정: { link: 다른 캐릭터 id, ver: 쓰는 버전, vers: [버전 이름] } */
const charCfg = (owner: string | null | undefined): CharAssetCfg => owner?.startsWith('char:') ? SS().settings.assets.chars?.[owner.slice(5)] || {} : {};
type Owner = string | null | undefined;
interface FileLike { name: string; type: string; arrayBuffer(): Promise<ArrayBuffer> }

// ════════ 이름 찾기 ════════
// 모델이 적은 이름을 그림에 잇는다: 정확한 이름 → 번호 묶음 → 별칭 → (비슷한 이름 켜짐) 구분자 · 대소문자 차이 → 같은 뜻 낱말 → 앞머리 → 한두 글자 오타 → (켜면) 표정 그림
/** 찾을 때 쓰는 이름: 앞뒤 공백 · 확장자(겹쳐도)를 떼고 소문자, 공백은 _ (저장된 이름과 같은 꼴) */
const lookKey = (name: unknown) => String(name ?? '').trim().replace(EXTS, '').trim().toLowerCase().replace(/\s+/g, '_');
const loose = (s: string) => s.replace(/[\s_\-.·~,'"()[\]]+/g, '');
const toks = (s: string) => s.split(/[\s_\-.·~,]+/).filter(Boolean);
// 같은 뜻으로 보는 낱말: 표정 기능의 감정 이름과 그 별칭(영어 · 한국어)에 일본어 · 중국어를 더하고, 감정 밖의 흔한 그림 이름 묶음도 둔다. 맨 앞 낱말이 대표
const MORE_WORDS: Record<string, string> = {
  joy: '嬉しい うれしい 喜び 笑顔 にこにこ 楽しい 开心 高兴 快乐 微笑 smiley grin grinning beaming', amusement: '笑う 爆笑 わらい 哈哈 大笑 giggle giggling', anger: '怒り 怒る おこ 生气 愤怒 发火 짜증나 화났',
  annoyance: 'イライラ むっ 烦 不耐烦', sadness: '悲しい かなしい 泣く 涙 寂しい 难过 伤心 哭 泪 sob sobbing tearful gloomy', surprise: '驚き びっくり 吃惊 惊讶 惊 amazed', embarrassment: '照れ 恥ずかしい 赤面 害羞 脸红',
  fear: '怖い こわい 恐怖 害怕 恐惧 scary', love: '好き 恋 大好き 爱 喜欢 爱心 lovestruck adoring', disgust: '嫌悪 気持ち悪い 恶心 讨厌 gross', neutral: '通常 無表情 普通 真顔 平静 默认 standard',
  confusion: '困惑 混乱 はてな 疑问', curiosity: '興味 好奇 好奇心', nervousness: '不安 緊張 紧张 焦虑', pride: 'ドヤ顔 得意 骄傲 自豪 confident cocky', relief: '安心 ほっと 放心',
  gratitude: '感謝 ありがとう 谢谢 感激', excitement: 'わくわく 興奮 兴奋 激动 hyped', caring: '優しい 心配 温柔 关心', disappointment: 'がっかり 失望', grief: '絶望 号泣 悲痛', remorse: 'ごめん 後悔 抱歉 内疚', desire: '欲望 渴望',
};
const OTHER_GROUPS = [
  'sleepy tired drowsy yawn yawning exhausted 졸림 졸린 피곤 피곤함 하품 眠い ねむい 疲れ 困 累', 'thinking think thoughtful pondering hmm 생각 생각중 고민 考え 考える 思考 想',
  'pout pouting sulk sulky sulking 삐짐 삐진 뾰로통 토라짐 ふくれっ面 むすっ 撅嘴', 'wink winking 윙크 ウインク 眨眼', 'serious stern determined focused 진지 진지함 단호 결의 真剣 认真',
  'hurt pain painful injured wounded 아픔 아파 고통 부상 痛い 疼', 'jealous jealousy envy envious 질투 시샘 嫉妬 吃醋', 'bored boring boredom 지루함 지루 심심 退屈 无聊',
  'night evening dusk 밤 저녁 夜 夕方 晚上', 'morning dawn sunrise 아침 새벽 朝 早上', 'day daytime noon 낮 한낮 昼 白天', 'sleep sleeping asleep 잠 수면 자는 寝る 睡觉', 'eat eating meal food 식사 먹는 밥 食事 吃饭',
];
let synMap: Map<string, string> | null = null;
const syn = () => synMap ||= (() => {
  const m = new Map<string, string>(), put = (w: string, c: string) => { const k = w.toLowerCase(); if (k && !m.has(k)) m.set(k, c); };
  for (const l of DEFAULT_LABELS) put(l, l);
  for (const l of DEFAULT_LABELS) for (const w of (EMO_WORDS[l] || '').split(' ')) put(w, l);
  for (const [l, ws] of Object.entries(MORE_WORDS)) for (const w of ws.split(' ')) put(w, l);
  for (const g of OTHER_GROUPS) { const ws = g.split(' '); for (const w of ws) put(w, ws[0]); }
  return m;
})();
/** 낱말마다 대표 낱말로 바꾼 이름 (happy_2 → joy_2, 기쁨 → joy) */
const canon = (key: string) => { const m = syn(), p = toks(key).map(w => m.get(w) || w); return p.filter((w, i) => w !== p[i - 1]).join('_'); };
/** 이름이 가리키는 감정 (표정 그림을 찾을 때) */
const emoOf = (key: string) => { const m = syn(), whole = m.get(key) || m.get(loose(key)); if (whole) return whole; for (const w of toks(key)) { const c = m.get(w.replace(/\d+$/, '')); if (c) return c; } return ''; };
/** 한글은 자모로 풀어 센다 (기쁨 · 기븜 이 한 자 차이) */
const jamo = (s: string) => s.replace(/[가-힣]/g, c => { const n = c.charCodeAt(0) - 0xac00, f = n % 28; return String.fromCharCode(0x1100 + ((n / 588) | 0), 0x1161 + (((n % 588) / 28) | 0)) + (f ? String.fromCharCode(0x11a7 + f) : ''); });
/** 고친 글자 수 (바꾸기 · 넣기 · 빼기 · 이웃한 두 글자 맞바꾸기). max 를 넘으면 일찍 그만두고 max + 1 */
function dist(a: string, b: string, max: number): number {
  if (a === b) return 0; const n = a.length, m = b.length; if (Math.abs(n - m) > max) return max + 1;
  let p2: number[] = [], p1 = Array.from({ length: m + 1 }, (_, j) => j);
  for (let i = 1; i <= n; i++) {
    const r = [i]; let low = i;
    for (let j = 1; j <= m; j++) {
      let v = Math.min(p1[j] + 1, r[j - 1] + 1, p1[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) v = Math.min(v, p2[j - 2] + 1);
      r.push(v); if (v < low) low = v;
    }
    if (low > max) return max + 1; p2 = p1; p1 = r;
  }
  return p1[m];
}
export type How = 'exact' | 'group' | 'alias' | 'loose' | 'synonym' | 'prefix' | 'typo' | 'sprite';
/** 찾은 것: list = 무작위로 고를 후보 (묶음) · main = 무작위가 아닐 때 쓸 것 · owner = 찾은 보관함 */
export interface Hit { list: AssetRec[]; main: AssetRec; how: How; owner: string }
interface Entry { o: number; a: AssetRec; base: string; lb: string; ln: string; cb: string; cn: string; jb?: string; al?: boolean }
interface Index { own: { o: string; exact: Map<string, AssetRec>; alias: Map<string, AssetRec>; groups: Map<string, AssetRec[]>; flat: Map<string, AssetRec> }[]; ents: Entry[]; memo: Map<string, Hit | null> }
const indexes = new Map<string, Index>();
/** 표정 그림을 대신 찾을 곳 (표정 기능이 채운다). 캐릭터 id → 그림 [{ label, … }] */
let sprites: { list(charId: string): AssetRec[] } | null = null;
// 브라우저 안에서만 쓰는 짧은 그림 주소 (blob:). 긴 data: 글자를 메시지 HTML 에 풀지 않는다 — 글이 짧아 꾸민 결과도 기억해 둘 수 있다
const urls = new Map<string, { k: string; u: string }>();
const dropUrl = (id: string) => { const h = urls.get(id); if (!h) return; urls.delete(id); if (h.u.startsWith('blob:')) setTimeout(() => URL.revokeObjectURL(h.u), 60000); };

export const Assets = {
  IMG, keyOf, baseOf, lookKey,
  ownerOfChar: (id: string) => 'char:' + id, ownerOfPersona: (id: string) => 'persona:' + id, ownerOfChat: (id: string) => 'chat:' + id,
  /** 보관함 번호: 바뀔 때마다 오른다 (화면이 다시 계산할 때 쓴다) */
  get rev() { return rev; },
  /** 에셋 링크: 다른 캐릭터의 에셋을 빌려 쓰면 그 캐릭터의 보관함 */
  source(owner: Owner): Owner { const l = charCfg(owner).link; return l && 'char:' + l !== owner && SS().get('chars', l) ? 'char:' + l : owner; },
  /** 지금 쓰는 에셋 버전 ('' = 기본) */
  verOf: (owner: Owner) => charCfg(owner).ver || '',
  /** 여러 보관함을 한꺼번에 읽는다 (멤버가 많은 방도 한 번에) */
  async load(owners: Owner[]) {
    const want = [...new Set([...owners, ...owners.map(o => this.source(o))])].filter((o): o is string => !!o && !cache.has(o));
    await Promise.all(want.map(o => { let p = loading.get(o); if (!p) { p = db().byOwner(o).then(l => { if (!cache.has(o)) { cache.set(o, l.filter(a => a.kind !== 'illust').sort(byName)); rev++; } }).finally(() => loading.delete(o)); loading.set(o, p); } return p; }));
  },
  /** 이 보관함들을 이미 읽어 두었는지 */
  ready(owners: Owner[]) { return [...owners, ...owners.map(o => this.source(o))].every(o => !o || cache.has(o)); },
  /** 보관함을 DB 에서 다시 읽는다 */
  async reload(owners: string[]) { for (const o of owners) cache.delete(o); rev++; await this.load(owners); },
  list: (owner: Owner) => (owner != null && cache.get(owner)) || [],
  /** 한 버전에 든 에셋 (끈 것 포함) */
  inVer(owner: Owner, ver = '') { return this.list(owner).filter(a => (a.ver || '') === ver); },
  /** 실제로 대화에 쓰이는 에셋: 링크·버전·끄기를 반영 */
  active(owner: Owner) { const ver = this.verOf(owner); return this.list(this.source(owner)).filter(a => !a.disabled && (a.ver || '') === ver); },
  /** id 로 찾기 (읽어 둔 보관함에서) */
  find(id: string): AssetRec | null { for (const l of cache.values()) { const a = l.find(x => x.id === id); if (a) return a; } return null; },
  /** 저장할 이름: 확장자를 떼고 소문자, 공백은 _. 태그를 깨는 { } 와 보이지 않는 글자는 뺀다 */
  // eslint-disable-next-line no-control-regex
  cleanName: (fileName: string) => keyOf(fileName).replace(/[{}\u0000-\u001f​-‏﻿]+/g, '').trim().replace(/\s+/g, '_'),
  /** 별칭 다듬기: 이름과 같은 꼴, 겹친 것 · 빈 것 · 제 이름은 뺀다 */
  cleanAliases(list: string[], name = '') { return [...new Set(list.map(x => this.cleanName(x)).filter(x => x && x !== name))]; },
  async add(owner: string, fileName: string, dataUrl: string, extra: Record<string, unknown> = {}): Promise<AssetRec> {
    await this.load([owner]);
    const name = this.cleanName(fileName), ver = (extra.ver as string) || '';
    const old = this.list(owner).find(a => a.name === name && (a.ver || '') === ver);
    // 같은 이름을 다시 올리면 그림만 바꾼다: 별칭 · 꺼 둔 상태는 그대로 남긴다
    const rec: AssetRec = { id: old?.id || uid(), owner, name, data: dataUrl, disabled: old?.disabled || false, kind: 'asset', ts: now(), ...(old?.aliases?.length ? { aliases: old.aliases } : {}), ...extra };
    await db().put('assets', rec);
    cache.set(owner, [...this.list(owner).filter(a => a.id !== rec.id), rec].sort(byName)); dropUrl(rec.id); rev++;
    return rec;
  },
  async addFiles(owner: string, files: Iterable<FileLike>, onProgress: (n: number) => void = () => { }, extra: Record<string, unknown> = {}) {
    let n = 0;
    for (const f of files) {
      if (/\.zip$/i.test(f.name)) { for (const z of await unzip(await f.arrayBuffer())) if (IMG.test(z.name) && !/(^|\/)(__MACOSX\/|\._)/.test(z.name)) { const d = await shrink(toURL(z.data, mime(z.name)), 1280); if (!d) continue; await this.add(owner, z.name.split('/').pop() as string, d, extra); onProgress(++n); } }
      else if (f.type.startsWith('image/')) { const d = f.type === 'image/gif' ? await readURL(f as unknown as Blob) : await shrink(await readURL(f as unknown as Blob), 1280); if (!d) continue; await this.add(owner, f.name, d, extra); onProgress(++n); }
    }
    return n;
  },
  /** 한 줄을 고쳐 저장 (이름 · 켜기 · 별칭 · 버전). 한 번의 쓰기라 바꾸는 도중에 그림을 잃지 않는다 */
  async update(rec: AssetRec) { await db().put('assets', rec); cache.set(rec.owner, this.list(rec.owner).map(a => a.id === rec.id ? rec : a).sort(byName)); if (urls.get(rec.id)?.k !== (rec.ts || 0) + ':' + (rec.data || '').length) dropUrl(rec.id); rev++; },
  async remove(rec: AssetRec) { await db().del('assets', rec.id); cache.set(rec.owner, this.list(rec.owner).filter(a => a.id !== rec.id)); dropUrl(rec.id); rev++; },
  async removeOwner(owner: string) { for (const a of await db().byOwner(owner)) { await db().del('assets', a.id); dropUrl(a.id); } cache.delete(owner); rev++; },
  /** 화면에 걸 그림 주소: 긴 data: 는 한 번만 blob: 으로 바꿔 기억한다 */
  url(a: AssetRec): string {
    const d = a.data || ''; if (d.length < 4096 || !d.startsWith('data:')) return d;
    const k = (a.ts || 0) + ':' + d.length, h = urls.get(a.id); if (h?.k === k) return h.u;
    dropUrl(a.id); const b = dataToBlob(d), u = b ? URL.createObjectURL(b) : d; urls.set(a.id, { k, u }); return u;
  },
  /** 표정 기능이 표정 그림 목록을 건넨다 (렌더링 › 표정 그림도 찾기) */
  useSprites(h: { list(charId: string): AssetRec[] } | null) { sprites = h; rev++; },
  /** 이 보관함들의 찾기 표 (보관함 · 링크 · 버전이 그대로면 만들어 둔 것을 쓴다) */
  indexOf(owners: Owner[]): Index {
    const st = SS().settings.assets, sp = sprites, spr = st.sprites && sp ? owners.map(o => o?.startsWith('char:') ? sp.list(o.slice(5)).length : 0).join(',') : '';
    const key = rev + '|' + spr + '|' + owners.map(o => o ? o + '>' + this.source(o) + '/' + this.verOf(o) : '').join('|');
    const had = indexes.get(key); if (had) return had;
    const ix: Index = { own: [], ents: [], memo: new Map() };
    owners.forEach((o, i) => {
      const exact = new Map<string, AssetRec>(), alias = new Map<string, AssetRec>(), groups = new Map<string, AssetRec[]>(), flat = new Map<string, AssetRec>();
      for (const a of this.active(o)) {
        const b = baseOf(a.name); exact.set(a.name, a); (groups.get(b) || groups.set(b, []).get(b)!).push(a); if (!flat.has(loose(a.name))) flat.set(loose(a.name), a);
        ix.ents.push({ o: i, a, base: b, lb: loose(b), ln: loose(a.name), cb: canon(b), cn: canon(a.name) });
        for (const al of a.aliases || []) { const k = lookKey(al); if (!k) continue; if (!alias.has(k)) alias.set(k, a); ix.ents.push({ o: i, a, base: b, lb: loose(k), ln: loose(k), cb: canon(k), cn: canon(k), al: true }); }
      }
      ix.own.push({ o: o || '', exact, alias, groups, flat });
    });
    if (indexes.size > 12) indexes.clear();
    indexes.set(key, ix); return ix;
  },
  /** 이름 → 찾은 것 { list, main, how, owner } (기억해 둔다). 캐릭터에 없으면 뒤 보관함(페르소나)에서 */
  match(owners: Owner[], name: string): Hit | null {
    const k = lookKey(name); if (!k) return null;
    const st = SS().settings.assets, ix = this.indexOf(owners), mk = k + (st.fuzzy === false ? '\u0001' : '') + (st.sprites ? '\u0002' : '');
    const had = ix.memo.get(mk); if (had !== undefined) return had;
    const hit = findIn(ix, k, st.fuzzy !== false, !!st.sprites);
    if (ix.memo.size > 3000) ix.memo.clear();
    ix.memo.set(mk, hit); return hit;
  },
  /** 이름으로 찾기: 위 순서로 찾고, 묶음이면 하나 (seed 를 주면 늘 같은 것) */
  resolve(owners: Owner[], name: string, seed: string | false = ''): AssetRec | null {
    const h = this.match(owners, name); if (!h) return null;
    const l = h.list; if (!SS().settings.assets.random || l.length < 2) return h.main;
    return l[seed ? pickOf(seed + '|' + keyOf(name), l.length) : Math.floor(Math.random() * l.length)];
  },
  /** 못 찾은 이름에 어울릴 에셋 (묶음마다 하나, 가까운 순) */
  suggest(owners: Owner[], name: string, n = 3): AssetRec[] {
    const k = lookKey(name), lk = loose(k), jk = jamo(lk), ck = canon(k), cb = canon(baseOf(k)), seen = new Set<string>(), out: [number, AssetRec][] = [];
    for (const x of this.indexOf(owners).ents) {
      const g = x.o + '|' + x.base; if (x.al || seen.has(g)) continue; seen.add(g);
      const jx = x.jb ||= jamo(x.lb), l = Math.max(jk.length, jx.length, 1);
      let s = 1 - dist(jk, jx, l) / l; if (x.cb === ck || x.cb === cb) s += .6; if (lk && x.lb && (x.lb.includes(lk) || lk.includes(x.lb))) s += .3;
      if (s > .4) out.push([s, x.a]);
    }
    return out.sort((a, b) => b[0] - a[0]).slice(0, n).map(x => x[1]);
  },
  /** 쓸 수 있는 이름들. 묶음 모드면 번호를 뗀 이름만 */
  names(owners: Owner[], { base = SS().settings.assets.random }: { base?: boolean } = {}) {
    const out = new Set<string>(); for (const o of owners) for (const a of this.active(o)) out.add(base ? baseOf(a.name) : a.name);
    return [...out].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  },
  /** 묶어서 적은 목록: angry_[1, 2, 3], happy, sad */
  grouped(owners: Owner[]) {
    const groups = new Map<string, string[]>();
    for (const o of owners) for (const a of this.active(o)) { const b = baseOf(a.name), g = groups.get(b) || groups.set(b, []).get(b) as string[]; if (a.name !== b) { const v = a.name.slice(b.length + 1); if (v && !g.includes(v)) g.push(v); } }
    return [...groups].sort((x, y) => x[0].localeCompare(y[0])).map(([b, vs]) => vs.length ? b + '_[' + vs.sort((x, y) => x.localeCompare(y, undefined, { numeric: true })).join(', ') + ']' : b).join(', ');
  },
  count(owners: Owner[]) { let n = 0; for (const o of owners) n += this.active(o).length; return n; },
  /** 모델에게 알려 줄 이름 목록: 묶음 모드면 angry, happy / 아니면 angry_[1, 2], happy */
  keywords(owners: Owner[]) { return SS().settings.assets.random ? this.names(owners, { base: true }).join(', ') : this.grouped(owners); },
  /** 글에 든 {{img::이름}} 의 이름들 */
  tags(text: string): string[] { return text && text.includes('{{') ? [...text.matchAll(TAG)].map(m => m[2].trim()).filter(Boolean) : []; },
  /** 화면 표시용: 파일 이름만 적은 그림(<img src="NAVI.png">)을 캐릭터 · 페르소나 에셋에서 찾아 넣는다. 못 찾으면 그대로 둔다 */
  inline(text: string, owners: Owner[]) {
    if (!text || !/<img\b/i.test(text)) return text;
    return text.replace(/(<img\b[^>]*?\bsrc\s*=\s*)(["'])([^"'<>:?#\\/]+?\.(?:png|jpe?g|gif|webp|avif|bmp|svg))\2/gi, (m, pre: string, q: string, file: string) => {
      const a = this.resolve(owners, file, false); return a ? pre + q + escape(this.url(a)) + q : m;
    });
  },
  /** 화면 표시용: {{img::이름}} → 틀에 넣은 <img>. partial: 받는 중인 글이면 아직 덜 쓴 태그를 가린다.
   *  꾸민 결과에 그림 주소 · 틀 · 크기 · 이름표가 다 들어가므로, 글로 기억해 두는 자리(renderKept)도 설정이 바뀌면 저절로 새로 꾸민다 */
  expand(text: string, owners: Owner[], seed = '', { partial = false }: { partial?: boolean } = {}) {
    const st = SS().settings.assets;
    if (!text || st.show === false) return text;
    const src = partial ? text.replace(/`?\{(\{\s*(i(m(g(:(:[^{}\n]*)?)?)?)?)?)?$/i, '') : text;
    if (src.indexOf('{{') < 0 || !/\{\{\s*img::/i.test(src)) return src;
    const style = ({ default: 'plain', border: 'ink', clean: 'plain', vignette: 'shadow', cinema: 'film' } as Record<string, string>)[st.style as string] || (/^[\w-]+$/.test(st.style || '') ? st.style : 'ink'), max = Math.round(+(st.maxSize as number)) || 0;
    const sp = st.sprites ? sprites : null, any = this.count(owners) > 0 || (!!sp && owners.some(o => o?.startsWith('char:') && sp.list(o.slice(5)).length > 0));
    const miss = st.missing === 'hide' || st.missing === 'keep' ? st.missing : 'hint', cap = !!st.caption, lazy = st.lazy === false ? '' : ' loading="lazy"';
    const frame = 'asset-frame as-' + style + (st.zoom === false ? '' : ' zoomable') + (cap ? ' captioned' : '');
    let n = 0;   // 같은 메시지를 다시 그려도 그림이 바뀌지 않게, 메시지와 자리로 고른다
    return src.replace(TAG, (m, _q: string, raw: string) => {
      const name = raw.trim(), a = this.resolve(owners, name, seed && seed + '#' + n++);
      // 에셋이 하나도 없으면 예전처럼 조용히 지운다 (에셋을 쓰지 않는 대화는 그대로)
      if (!a) return !any || miss === 'hide' ? '' : miss === 'keep' ? m : '<span class="asset-miss" data-miss="' + escape(name) + '" title="' + escape(t('assets.miss.tip')) + '">' + escape(name) + '</span>';
      return '<span class="' + frame + '"' + (max ? ' style="--as-max:' + max + 'px"' : '') + '><img class="asset-img" alt="' + escape(a.name) + '" src="' + escape(this.url(a)) + '" data-asset="' + escape(a.id) + '"' + lazy + '>' + (cap ? '<span class="asset-cap">' + escape(baseOf(a.name)) + '</span>' : '') + '</span>';
    });
  },
};
/** {{img::이름}} · 앞뒤 공백 · 인라인 코드(`…`)로 감싼 것까지 */
const TAG = /(`?)\{\{\s*img::\s*([^{}]+?)\s*\}\}\1/gi;

function findIn(ix: Index, k: string, fuzzy: boolean, spr: boolean): Hit | null {
  const hit = (o: number, list: AssetRec[], how: How, main = list[0]): Hit => ({ list, main, how, owner: ix.own[o].o });
  const groupOf = (x: Entry) => x.al ? [x.a] : ix.own[x.o].groups.get(x.base) || [x.a];
  // 1. 정확한 이름 · 번호 묶음 · 별칭 (보관함 차례대로: 캐릭터 → 페르소나). 비슷한 이름을 켜 두었으면 구분자만 다른 파일(angry-2 → angry_2)을 묶음보다 먼저
  const lk = loose(k);
  for (let o = 0; o < ix.own.length; o++) {
    const { exact, alias, groups, flat } = ix.own[o], e = exact.get(k), g = groups.get(k);
    if (e) return hit(o, g || [e], 'exact', e);
    if (g) return hit(o, g, 'group');
    const al = alias.get(k); if (al) return hit(o, [al], 'alias');
    const f = fuzzy && lk ? flat.get(lk) : undefined; if (f) { const fg = groups.get(baseOf(f.name)); return hit(o, f.name === baseOf(f.name) && fg ? fg : [f], 'loose', f); }
    const bg = groups.get(baseOf(k)); if (bg) return hit(o, bg, 'group');
  }
  const sprite = (): Hit | null => {
    if (!spr || !sprites) return null; const emo = emoOf(k);
    for (let o = 0; o < ix.own.length; o++) { const id = ix.own[o].o; if (!id.startsWith('char:')) continue; const l = sprites.list(id.slice(5)).filter(s => s.label === k || (!!emo && s.label === emo)); if (l.length) return hit(o, l, 'sprite'); }
    return null;
  };
  if (!fuzzy || !ix.ents.length) return sprite();
  const E = ix.ents, lb = loose(baseOf(k)), ck = canon(k), cb = canon(baseOf(k)), single = toks(k).length === 1 && lk.length >= 3;
  let x: Entry | undefined;
  // 2. 대소문자 · 띄어쓰기 · _ - . 차이 (Happy Smile → happy_smile, angry-2 → angry_2)
  if (lk && (x = E.find(e => e.ln === lk))) return hit(x.o, x.al ? [x.a] : x.ln === x.lb ? groupOf(x) : [x.a], 'loose');
  if (lb && (x = E.find(e => e.lb === lb))) return hit(x.o, groupOf(x), 'loose');
  // 3. 낱말 하나면 그 낱말로 시작하는 이름 (smile → smile_wide). 글자 그대로 맞는 것이 뜻으로 맞는 것보다 먼저
  if (single && (x = E.find(e => !e.al && toks(e.base)[0] === k))) return hit(x.o, groupOf(x), 'prefix');
  // 4. 같은 뜻 낱말 (기쁨 · joy · 嬉しい → happy). 그다음 같은 뜻 낱말로 시작하는 이름
  if (ck && (x = E.find(e => e.cn === ck))) return hit(x.o, x.cn === x.cb ? groupOf(x) : [x.a], 'synonym');
  if (cb && (x = E.find(e => e.cb === cb || e.cb === ck))) return hit(x.o, groupOf(x), 'synonym');
  if (single && ck && (x = E.find(e => !e.al && canon(toks(e.base)[0] || '') === ck))) return hit(x.o, groupOf(x), 'synonym');
  // 5. 한두 글자 오타 (suprised → surprised). 짧은 이름은 첫 글자가 같아야 하고, 똑같이 가까운 묶음이 둘이면 고르지 않는다
  const jk = jamo(lk), lim = jk.length <= 2 ? 0 : jk.length <= 5 ? 1 : 2;
  if (lim) {
    let best: Entry | null = null, bd = lim + 1, tie = false;
    for (const e of E) {
      const je = e.jb ||= jamo(e.lb); if (jk.length <= 4 && je[0] !== jk[0]) continue;
      const d = dist(jk, je, lim); if (d > lim) continue;
      if (d < bd) { bd = d; best = e; tie = false; } else if (d === bd && best && (best.o !== e.o || best.base !== e.base)) tie = true;
    }
    if (best && !tie) return hit(best.o, groupOf(best), 'typo');
  }
  // 6. 표정 그림 (켜 두었을 때)
  return sprite();
}

export const ASSET_PROMPT = `[Image assets]
You can show an image of the current scene or emotion by writing {{img::keyword}} on its own line between paragraphs. Use at most {{max}} per reply, only when it fits, and never invent keywords.
Available keywords: {{keywords}}`;
