// ── Dreamland assets: 이미지 보관함 (캐릭터 에셋 · 삽화) + ZIP 읽기 ── (옛 js/assets.js, 동작 그대로)
import { S, DB, uid, now, esc, shrinkImage, readDataURL, bytesToDataURL, mimeOf } from './core';
import { t } from '../i18n';

export interface ZipFile { name: string; data: Uint8Array }
export interface AssetRec { id: string; owner: string; name: string; data: string; disabled?: boolean; kind?: string; ts?: number; ver?: string; [k: string]: unknown }
interface CharAssetCfg { link?: string; ver?: string; vers?: string[] }
interface AssetSettings { random?: boolean; style?: string; maxSize?: unknown; lazy?: boolean; chars?: Record<string, CharAssetCfg> }
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
const keyOf = (name: unknown) => String(name).trim().replace(IMG, '').toLowerCase();
const baseOf = (key: string) => key.replace(/[_.\-]\d+$/, '');
const pickOf = (seed: string, n: number) => { let x = 2166136261; for (let i = 0; i < seed.length; i++) x = Math.imul(x ^ seed.charCodeAt(i), 16777619); return (x >>> 0) % n; };
const cache = new Map<string, AssetRec[]>();   // owner → [{ id, owner, name, data, disabled, ver }]
const byName = (a: AssetRec, b: AssetRec) => a.name.localeCompare(b.name, undefined, { numeric: true });
/** 캐릭터별 설정: { link: 다른 캐릭터 id, ver: 쓰는 버전, vers: [버전 이름] } */
const charCfg = (owner: string | null | undefined): CharAssetCfg => owner?.startsWith('char:') ? SS().settings.assets.chars?.[owner.slice(5)] || {} : {};
type Owner = string | null | undefined;
interface FileLike { name: string; type: string; arrayBuffer(): Promise<ArrayBuffer> }

export const Assets = {
  IMG, keyOf, baseOf,
  ownerOfChar: (id: string) => 'char:' + id, ownerOfPersona: (id: string) => 'persona:' + id, ownerOfChat: (id: string) => 'chat:' + id,
  /** 에셋 링크: 다른 캐릭터의 에셋을 빌려 쓰면 그 캐릭터의 보관함 */
  source(owner: Owner): Owner { const l = charCfg(owner).link; return l && 'char:' + l !== owner && SS().get('chars', l) ? 'char:' + l : owner; },
  /** 지금 쓰는 에셋 버전 ('' = 기본) */
  verOf: (owner: Owner) => charCfg(owner).ver || '',
  async load(owners: Owner[]) {
    for (const o of [...owners, ...owners.map(o => this.source(o))]) if (o && !cache.has(o)) cache.set(o, (await db().byOwner(o)).filter(a => a.kind !== 'illust').sort(byName));
  },
  /** 이 보관함들을 이미 읽어 두었는지 */
  ready(owners: Owner[]) { return [...owners, ...owners.map(o => this.source(o))].every(o => !o || cache.has(o)); },
  /** 보관함을 DB 에서 다시 읽는다 */
  async reload(owners: string[]) { for (const o of owners) cache.delete(o); await this.load(owners); },
  list: (owner: Owner) => (owner != null && cache.get(owner)) || [],
  /** 한 버전에 든 에셋 (끈 것 포함) */
  inVer(owner: Owner, ver = '') { return this.list(owner).filter(a => (a.ver || '') === ver); },
  /** 실제로 대화에 쓰이는 에셋: 링크·버전·끄기를 반영 */
  active(owner: Owner) { const ver = this.verOf(owner); return this.list(this.source(owner)).filter(a => !a.disabled && (a.ver || '') === ver); },
  cleanName: (fileName: string) => keyOf(fileName).replace(/\s+/g, '_'),
  async add(owner: string, fileName: string, dataUrl: string, extra: Record<string, unknown> = {}): Promise<AssetRec> {
    await this.load([owner]);
    const name = this.cleanName(fileName), ver = (extra.ver as string) || '';
    const old = this.list(owner).find(a => a.name === name && (a.ver || '') === ver);
    const rec: AssetRec = { id: old?.id || uid(), owner, name, data: dataUrl, disabled: false, kind: 'asset', ts: now(), ...extra };
    await db().put('assets', rec);
    cache.set(owner, [...this.list(owner).filter(a => a.id !== rec.id), rec].sort(byName));
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
  async update(rec: AssetRec) { await db().put('assets', rec); cache.set(rec.owner, this.list(rec.owner).map(a => a.id === rec.id ? rec : a).sort(byName)); },
  async remove(rec: AssetRec) { await db().del('assets', rec.id); cache.set(rec.owner, this.list(rec.owner).filter(a => a.id !== rec.id)); },
  async removeOwner(owner: string) { for (const a of await db().byOwner(owner)) await db().del('assets', a.id); cache.delete(owner); },
  /** 이름으로 찾기: 대소문자·확장자 무시, 번호가 붙은 변형(joy_1, joy_2)은 묶음에서 하나 (seed 를 주면 늘 같은 것). 캐릭터에 없으면 뒤 보관함(페르소나)에서 찾는다 */
  resolve(owners: Owner[], name: string, seed: string | false = ''): AssetRec | null {
    const key = keyOf(name), random = SS().settings.assets.random;
    for (const o of owners) {
      const list = this.active(o);
      const exact = list.find(a => a.name === key);
      const group = list.filter(a => baseOf(a.name) === key || (!exact && baseOf(a.name) === baseOf(key)));
      if (random && group.length) return group[seed ? pickOf(seed + '|' + key, group.length) : Math.floor(Math.random() * group.length)];
      if (exact || group.length) return exact || group[0];
    }
    return null;
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
    return [...groups].sort((x, y) => x[0].localeCompare(y[0])).map(([b, vs]) => vs.length ? b + '_[' + vs.sort((x, y) => (x as unknown as number) - (y as unknown as number)).join(', ') + ']' : b).join(', ');
  },
  count(owners: Owner[]) { let n = 0; for (const o of owners) n += this.active(o).length; return n; },
  /** 모델에게 알려 줄 이름 목록: 묶음 모드면 angry, happy / 아니면 angry_[1, 2], happy */
  keywords(owners: Owner[]) { return SS().settings.assets.random ? this.names(owners, { base: true }).join(', ') : this.grouped(owners); },
  /** 화면 표시용: {{img::이름}} → 틀에 넣은 <img> */
  expand(text: string, owners: Owner[], seed = '') {
    if (!text || text.indexOf('{{img::') < 0) return text;
    const st = SS().settings.assets, style = ({ default: 'plain', border: 'ink', clean: 'plain', vignette: 'shadow', cinema: 'film' } as Record<string, string>)[st.style as string] || (/^[\w-]+$/.test(st.style || '') ? st.style : 'ink'), max = Math.round(+(st.maxSize as number)) || 0;
    let n = 0;   // 같은 메시지를 다시 그려도 그림이 바뀌지 않게, 메시지와 자리로 고른다
    return text.replace(/\{\{img::([^}]+)\}\}/gi, (_m, name: string) => {
      const a = this.resolve(owners, name, seed && seed + '#' + n++); if (!a) return '';
      return '<span class="asset-frame as-' + style + '"' + (max ? ' style="--as-max:' + max + 'px"' : '') + '><img class="asset-img" alt="' + escape(a.name) + '" src="' + escape(a.data) + '"' + (st.lazy === false ? '' : ' loading="lazy"') + '></span>';
    });
  },
};

export const ASSET_PROMPT = `[Image assets]
You can show an image of the current scene or emotion by writing {{img::keyword}} on its own line between paragraphs. Use at most {{max}} per reply, only when it fits, and never invent keywords.
Available keywords: {{keywords}}`;
