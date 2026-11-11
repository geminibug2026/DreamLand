// ── Dreamland assets: 이미지 보관함 (캐릭터 에셋 · 삽화) + ZIP 읽기 ──
import { S, DB, uid, now, esc, shrinkImage, readDataURL, bytesToDataURL, mimeOf } from './core.js';

/** ZIP 풀기 (저장·deflate 만) → [{ name, data: Uint8Array }] */
export async function unzip(buf) {
  const u = buf instanceof Uint8Array ? buf : new Uint8Array(buf), dv = new DataView(u.buffer, u.byteOffset, u.byteLength);
  let e = u.length - 22; while (e >= 0 && dv.getUint32(e, true) !== 0x06054b50) e--;
  if (e < 0) throw new Error('ZIP 파일이 아닙니다');
  const count = dv.getUint16(e + 10, true); let p = dv.getUint32(e + 16, true); const out = [];
  for (let i = 0; i < count && dv.getUint32(p, true) === 0x02014b50; i++) {
    const method = dv.getUint16(p + 10, true), csize = dv.getUint32(p + 20, true), n = dv.getUint16(p + 28, true), x = dv.getUint16(p + 30, true), c = dv.getUint16(p + 32, true), off = dv.getUint32(p + 42, true);
    const nb = u.subarray(p + 46, p + 46 + n); let name;   // 윈도우에서 만든 ZIP 의 한글 이름(CP949)도 읽는다
    try { name = new TextDecoder('utf-8', { fatal: true }).decode(nb); } catch { try { name = new TextDecoder('euc-kr').decode(nb); } catch { name = new TextDecoder().decode(nb); } }
    const start = off + 30 + dv.getUint16(off + 26, true) + dv.getUint16(off + 28, true);
    const raw = u.subarray(start, start + csize);
    if (!name.endsWith('/')) out.push({ name, data: method === 0 ? raw : new Uint8Array(await new Response(new Blob([raw]).stream().pipeThrough(new DecompressionStream('deflate-raw'))).arrayBuffer()) });
    p += 46 + n + x + c;
  }
  return out;
}

/** ZIP 만들기 (압축 없이 저장만) → Blob.  files: [{ name, data: Uint8Array }] */
let crcTable;
const crc32 = u => { crcTable ||= Array.from({ length: 256 }, (_, n) => { for (let k = 0; k < 8; k++) n = n & 1 ? 0xedb88320 ^ (n >>> 1) : n >>> 1; return n >>> 0; }); let c = 0xffffffff; for (let i = 0; i < u.length; i++) c = crcTable[(c ^ u[i]) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
export function zip(files) {
  const enc = new TextEncoder(), parts = [], central = []; let off = 0;
  const d = new Date(), time = (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1), date = ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();
  for (const f of files) {
    const name = enc.encode(f.name), data = f.data, crc = crc32(data);
    const head = new DataView(new ArrayBuffer(30));
    head.setUint32(0, 0x04034b50, true); head.setUint16(4, 20, true); head.setUint16(6, 0x0800, true); head.setUint16(8, 0, true); head.setUint16(10, time, true); head.setUint16(12, date, true);
    head.setUint32(14, crc, true); head.setUint32(18, data.length, true); head.setUint32(22, data.length, true); head.setUint16(26, name.length, true); head.setUint16(28, 0, true);
    const cen = new DataView(new ArrayBuffer(46));
    cen.setUint32(0, 0x02014b50, true); cen.setUint16(4, 20, true); cen.setUint16(6, 20, true); cen.setUint16(8, 0x0800, true); cen.setUint16(10, 0, true); cen.setUint16(12, time, true); cen.setUint16(14, date, true);
    cen.setUint32(16, crc, true); cen.setUint32(20, data.length, true); cen.setUint32(24, data.length, true); cen.setUint16(28, name.length, true); cen.setUint32(42, off, true);
    parts.push(head.buffer, name, data); central.push(cen.buffer, name); off += 30 + name.length + data.length;
  }
  const size = central.reduce((n, c) => n + c.byteLength, 0), end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true); end.setUint16(8, files.length, true); end.setUint16(10, files.length, true); end.setUint32(12, size, true); end.setUint32(16, off, true);
  return new Blob([...parts, ...central, end.buffer], { type: 'application/zip' });
}

const IMG = /\.(png|webp|gif|jpe?g|avif)$/i;
const keyOf = name => String(name).trim().replace(IMG, '').toLowerCase();
const baseOf = key => key.replace(/[_.\-]\d+$/, '');
const pickOf = (seed, n) => { let x = 2166136261; for (let i = 0; i < seed.length; i++) x = Math.imul(x ^ seed.charCodeAt(i), 16777619); return (x >>> 0) % n; };
const cache = new Map();   // owner → [{ id, owner, name, data, disabled, ver }]
const byName = (a, b) => a.name.localeCompare(b.name, undefined, { numeric: true });
/** 캐릭터별 설정: { link: 다른 캐릭터 id, ver: 쓰는 버전, vers: [버전 이름] } */
const charCfg = owner => owner?.startsWith('char:') ? S.settings.assets.chars?.[owner.slice(5)] || {} : {};

export const Assets = {
  IMG, keyOf, baseOf,
  ownerOfChar: id => 'char:' + id, ownerOfPersona: id => 'persona:' + id, ownerOfChat: id => 'chat:' + id,
  /** 에셋 링크: 다른 캐릭터의 에셋을 빌려 쓰면 그 캐릭터의 보관함 */
  source(owner) { const l = charCfg(owner).link; return l && 'char:' + l !== owner && S.get('chars', l) ? 'char:' + l : owner; },
  /** 지금 쓰는 에셋 버전 ('' = 기본) */
  verOf: owner => charCfg(owner).ver || '',
  async load(owners) {
    for (const o of [...owners, ...owners.map(o => this.source(o))]) if (o && !cache.has(o)) cache.set(o, (await DB.byOwner(o)).filter(a => a.kind !== 'illust').sort(byName));
  },
  /** 보관함을 DB 에서 다시 읽는다 */
  async reload(owners) { for (const o of owners) cache.delete(o); await this.load(owners); },
  list: owner => cache.get(owner) || [],
  /** 한 버전에 든 에셋 (끈 것 포함) */
  inVer(owner, ver = '') { return this.list(owner).filter(a => (a.ver || '') === ver); },
  /** 실제로 대화에 쓰이는 에셋: 링크·버전·끄기를 반영 */
  active(owner) { const ver = this.verOf(owner); return this.list(this.source(owner)).filter(a => !a.disabled && (a.ver || '') === ver); },
  cleanName: fileName => keyOf(fileName).replace(/\s+/g, '_'),
  async add(owner, fileName, dataUrl, extra = {}) {
    await this.load([owner]);
    const name = this.cleanName(fileName), ver = extra.ver || '';
    const old = this.list(owner).find(a => a.name === name && (a.ver || '') === ver);
    const rec = { id: old?.id || uid(), owner, name, data: dataUrl, disabled: false, kind: 'asset', ts: now(), ...extra };
    await DB.put('assets', rec);
    cache.set(owner, [...this.list(owner).filter(a => a.id !== rec.id), rec].sort(byName));
    return rec;
  },
  async addFiles(owner, files, onProgress = () => { }, extra = {}) {
    let n = 0;
    for (const f of files) {
      if (/\.zip$/i.test(f.name)) { for (const z of await unzip(await f.arrayBuffer())) if (IMG.test(z.name) && !/(^|\/)(__MACOSX\/|\._)/.test(z.name)) { const d = await shrinkImage(bytesToDataURL(z.data, mimeOf(z.name)), 1280); if (!d) continue; await this.add(owner, z.name.split('/').pop(), d, extra); onProgress(++n); } }
      else if (f.type.startsWith('image/')) { const d = f.type === 'image/gif' ? await readDataURL(f) : await shrinkImage(await readDataURL(f), 1280); if (!d) continue; await this.add(owner, f.name, d, extra); onProgress(++n); }
    }
    return n;
  },
  async update(rec) { await DB.put('assets', rec); cache.set(rec.owner, this.list(rec.owner).map(a => a.id === rec.id ? rec : a).sort(byName)); },
  async remove(rec) { await DB.del('assets', rec.id); cache.set(rec.owner, this.list(rec.owner).filter(a => a.id !== rec.id)); },
  async removeOwner(owner) { for (const a of await DB.byOwner(owner)) await DB.del('assets', a.id); cache.delete(owner); },
  /** 이름으로 찾기: 대소문자·확장자 무시, 번호가 붙은 변형(joy_1, joy_2)은 묶음에서 하나 (seed 를 주면 늘 같은 것). 캐릭터에 없으면 뒤 보관함(페르소나)에서 찾는다 */
  resolve(owners, name, seed = '') {
    const key = keyOf(name), random = S.settings.assets.random;
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
  names(owners, { base = S.settings.assets.random } = {}) {
    const out = new Set(); for (const o of owners) for (const a of this.active(o)) out.add(base ? baseOf(a.name) : a.name);
    return [...out].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  },
  /** 묶어서 적은 목록: angry_[1, 2, 3], happy, sad */
  grouped(owners) {
    const groups = new Map();
    for (const o of owners) for (const a of this.active(o)) { const b = baseOf(a.name), g = groups.get(b) || groups.set(b, []).get(b); if (a.name !== b) { const v = a.name.slice(b.length + 1); if (v && !g.includes(v)) g.push(v); } }
    return [...groups].sort((x, y) => x[0].localeCompare(y[0])).map(([b, vs]) => vs.length ? b + '_[' + vs.sort((x, y) => x - y).join(', ') + ']' : b).join(', ');
  },
  count(owners) { let n = 0; for (const o of owners) n += this.active(o).length; return n; },
  /** 모델에게 알려 줄 이름 목록: 묶음 모드면 angry, happy / 아니면 angry_[1, 2], happy */
  keywords(owners) { return S.settings.assets.random ? this.names(owners, { base: true }).join(', ') : this.grouped(owners); },
  /** 화면 표시용: {{img::이름}} → 틀에 넣은 <img> */
  expand(text, owners, seed = '') {
    if (!text || text.indexOf('{{img::') < 0) return text;
    const st = S.settings.assets, style = ({ default: 'plain', border: 'ink', clean: 'plain', vignette: 'shadow', cinema: 'film' })[st.style] || (/^[\w-]+$/.test(st.style || '') ? st.style : 'ink'), max = Math.round(+st.maxSize) || 0;
    let n = 0;   // 같은 메시지를 다시 그려도 그림이 바뀌지 않게, 메시지와 자리로 고른다
    return text.replace(/\{\{img::([^}]+)\}\}/gi, (m, name) => {
      const a = this.resolve(owners, name, seed && seed + '#' + n++); if (!a) return '';
      return '<span class="asset-frame as-' + style + '"' + (max ? ' style="--as-max:' + max + 'px"' : '') + '><img class="asset-img" alt="' + esc(a.name) + '" src="' + a.data + '"' + (st.lazy === false ? '' : ' loading="lazy"') + '></span>';
    });
  },
};

export const ASSET_PROMPT = `[Image assets]
You can show an image of the current scene or emotion by writing {{img::keyword}} on its own line between paragraphs. Use at most {{max}} per reply, only when it fits, and never invent keywords.
Available keywords: {{keywords}}`;
