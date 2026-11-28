// 딱지(스티커): 묶음 · 그림 보관 · 이름으로 찾기 · 프롬프트 안내 · 답장 속 [sticker: 이름] 읽기 · 감정으로 자동 고르기
// 메시지 글에는 [sticker: 이름 — 뜻] 한 줄이 그대로 남는다 — 모델은 그 줄로 뜻을 알고, 화면은 표시 필터가 그림으로 바꾼다 (스와이프마다 글이 따로라 어긋날 일이 없다)
import { DB, bytesToDataURL, esc, mimeOf, now, on, readDataURL, shrinkImage, uid } from '../lib/core';
import { unzip } from '../lib/assets';
import type { Chat, Msg } from '../lib/types';
import { t } from '../i18n';
import { cfg, hash, saveCfg } from './cfg';
import { DREAM, dreamSvg } from './dreampack';

export interface Pack { id: string; name: string; /** '' = 누구나 · 캐릭터 id = 그 캐릭터만 */ owner: string; off?: boolean; builtin?: boolean }
export interface Sticker { id: string; pack: string; name: string; keys: string; data: string; anim?: boolean; ts?: number }
interface Row { id: string; owner: string; name: string; data: string; kind: string; keys?: string; anim?: boolean; ts?: number }

const KV = 'xt-stickers', DREAM_ID = 'dream', MAX_RAW = 3_000_000, IMG = /\.(png|webp|gif|jpe?g|avif)$/i;
let packs: Pack[] = [], loaded = false;
const byPack = new Map<string, Sticker[]>();
const ownerOf = (packId: string) => 'stk:' + packId;
const norm = (s: string) => s.toLowerCase().normalize('NFKC').replace(/[\s_\-]+/g, ' ').trim();
const toSticker = (r: Row, pack: string): Sticker => ({ id: r.id, pack, name: r.name, keys: r.keys || '', data: r.data, anim: r.anim, ts: r.ts });
const dream = (): Sticker[] => DREAM.map(d => ({ id: 'dream:' + d.id, pack: DREAM_ID, name: d.name, keys: d.keys, get data() { return dreamSvg(d); } }));
const savePacks = () => DB.put('kv', { id: KV, packs: packs.map(({ id, name, owner, off, builtin }) => ({ id, name, owner, off, builtin })) });

/** 움직이는 그림인가 (GIF · 움직이는 WebP · APNG) — 그런 것은 줄이지 않고 원본을 둔다 */
function animated(u: Uint8Array, mime: string) {
  if (mime === 'image/gif') return true;
  const find = (tag: string, upto: number) => { const n = Math.min(u.length - 4, upto); for (let i = 0; i < n; i++) if (u[i] === tag.charCodeAt(0) && u[i + 1] === tag.charCodeAt(1) && u[i + 2] === tag.charCodeAt(2) && u[i + 3] === tag.charCodeAt(3)) return true; return false; };
  return mime === 'image/webp' ? find('ANIM', 200) : mime === 'image/png' ? find('acTL', 4096) : false;
}

export const Stickers = {
  DREAM_ID,
  async load() {
    if (loaded) return; loaded = true;
    const row = await DB.get('kv', KV).catch(() => undefined) as { packs?: Pack[] } | undefined;
    packs = Array.isArray(row?.packs) ? row.packs : [];
    if (!packs.some(p => p.id === DREAM_ID)) packs.unshift({ id: DREAM_ID, name: '', owner: '', builtin: true });
    byPack.set(DREAM_ID, dream());
    for (const p of packs) if (!p.builtin) byPack.set(p.id, ((await DB.byOwner(ownerOf(p.id), { wait: false }).catch(() => [])) as unknown as Row[]).map(r => toSticker(r, p.id)).sort((a, b) => (a.ts || 0) - (b.ts || 0)));
  },
  /** 백업을 되돌린 뒤 다시 읽는다 */
  async reload() { loaded = false; byPack.clear(); await this.load(); },
  packs: () => packs,
  packName: (p: Pack) => p.builtin ? t('extras.stk.dreamPack') : p.name,
  list: (packId: string) => byPack.get(packId) || [],
  /** 이 대화에서 쓸 수 있는 묶음 (끈 것 · 다른 캐릭터 것은 뺀다) */
  usablePacks(chat?: Chat | null) { const ids = new Set(chat?.charIds || []); return packs.filter(p => !p.off && (!p.owner || ids.has(p.owner))); },
  usable(chat?: Chat | null) { return this.usablePacks(chat).flatMap(p => this.list(p.id)); },
  /** 캐릭터가 쓸 수 있는 것: 그 캐릭터 묶음이 먼저, 그다음 모두의 묶음 */
  forChar(_chat: Chat | null | undefined, charId: string) { const ps = packs.filter(p => !p.off && (!p.owner || p.owner === charId)).sort((a, b) => +!a.owner - +!b.owner); return ps.flatMap(p => this.list(p.id)); },
  byId(id: string) { for (const l of byPack.values()) { const s = l.find(x => x.id === id); if (s) return s; } return null; },
  /** 이름으로 찾기: 꼭 맞는 이름 → 뜻 낱말 → 이름에 들어 있는 것 */
  find(name: string, pool: Sticker[]): Sticker | null {
    const q = norm(name); if (!q) return null;
    return pool.find(s => norm(s.name) === q) || pool.find(s => s.keys.split(',').some(k => norm(k) === q)) || (q.length >= 3 ? pool.find(s => norm(s.name).includes(q) || q.includes(norm(s.name))) || null : null);
  },
  async addPack(name: string, owner = '') { const p: Pack = { id: uid(), name: name.trim().slice(0, 40) || t('extras.stk.newPack'), owner }; packs.push(p); byPack.set(p.id, []); await savePacks(); return p; },
  async savePack() { await savePacks(); },
  async removePack(p: Pack) { if (p.builtin) return; for (const s of this.list(p.id)) await DB.del('assets', s.id); packs = packs.filter(x => x !== p); byPack.delete(p.id); await savePacks(); },
  async put(s: Sticker) { await DB.put('assets', { id: s.id, owner: ownerOf(s.pack), name: s.name, data: s.data, kind: 'sticker', keys: s.keys, anim: s.anim, ts: s.ts }); },
  async remove(s: Sticker) { await DB.del('assets', s.id); byPack.set(s.pack, this.list(s.pack).filter(x => x.id !== s.id)); },
  /** 이름이 겹치지 않게 (모델은 이름으로 고른다) */
  freeName(base: string, skip?: Sticker) { const all = new Set([...byPack.values()].flat().filter(s => s !== skip).map(s => norm(s.name))); let n = base.replace(/[\[\]\n—|]/g, ' ').trim().slice(0, 32) || 'sticker', i = 2; const b = n; while (all.has(norm(n))) n = `${b} ${i++}`; return n; },
  async addOne(packId: string, fileName: string, bytes: Uint8Array | null, url: string) {
    const mime = mimeOf(fileName), anim = !!bytes && animated(bytes, mime);
    if (anim && url.length > MAX_RAW * 1.37) throw new Error(t('extras.stk.tooBig', { name: fileName }));
    const data = anim ? url : await shrinkImage(url, 320, 'image/webp', 0.9); if (!data) return null;
    const s: Sticker = { id: uid(), pack: packId, name: this.freeName(fileName.split('/').pop()!.replace(IMG, '').replace(/[_]+/g, ' ')), keys: '', data, anim, ts: now() };
    await this.put(s); byPack.set(packId, [...this.list(packId), s]); return s;
  },
  /** 그림 여러 장 · ZIP 을 묶음에 넣는다. 넣은 수를 돌려준다 */
  async addFiles(packId: string, files: File[], onProgress: (n: number) => void = () => { }) {
    let n = 0; const errs: string[] = [];
    const one = async (name: string, bytes: Uint8Array, url: string) => { try { if (await this.addOne(packId, name, bytes, url)) onProgress(++n); } catch (e) { errs.push(e instanceof Error ? e.message : String(e)); } };
    for (const f of files) {
      if (/\.zip$/i.test(f.name)) { for (const z of await unzip(await f.arrayBuffer())) if (IMG.test(z.name) && !/(^|\/)(__MACOSX\/|\._)/.test(z.name)) await one(z.name, z.data, bytesToDataURL(z.data, mimeOf(z.name))); }
      else if (f.type.startsWith('image/')) await one(f.name, new Uint8Array(await f.slice(0, 4096).arrayBuffer()), await readDataURL(f));
    }
    return { n, errs };
  },
  recent(chat?: Chat | null) { const ok = new Set(this.usable(chat).map(s => s.id)); return cfg().stk.recent.filter(id => ok.has(id)).map(id => this.byId(id)!).filter(Boolean); },
  markUsed(s: Sticker) { const c = cfg().stk; c.recent = [s.id, ...c.recent.filter(x => x !== s.id)].slice(0, 16); saveCfg(); },
};
// 빈 브라우저로 켠 뒤 그림(딱지 그림 포함)을 뒤에서 다 가져왔으면 다시 읽는다 (켤 때는 기다리지 않고 있는 것만 읽었다)
on('data:hydrated', () => { if (loaded) void Stickers.reload(); });


// ── 글 속의 딱지 줄 ──
/** [sticker: 이름] 또는 [sticker: 이름 — 뜻] */
export const STK_RE = /\[sticker\s*:\s*"?([^\]\n—|"]+?)"?\s*(?:[—|][^\]\n]*)?\]/gi;
const STK_LINE = /^[ \t]*\[sticker\s*:[^\]\n]*\][ \t]*$/gim;
/** 메시지 글에 적는 줄. 뜻 낱말은 앞의 몇 개만 (모델이 뜻을 알 만큼) */
export const tagOf = (s: Sticker, withKeys = true) => { const k = withKeys ? s.keys.split(',').map(x => x.trim()).filter(Boolean).slice(0, 3).join(', ') : ''; return `[sticker: ${s.name}${k ? ' — ' + k : ''}]`; };
/** 화면 표시: 딱지 줄을 그림으로. 지워진 딱지는 이름만 작게 남긴다 */
export function showStickers(text: string): string {
  if (!text || text.indexOf('[sticker') < 0) return text.replace(/\[st(?:i(?:c(?:k(?:e(?:r)?)?)?)?)?$/i, '');
  const pool = [...byPack.values()].flat();
  return text.replace(STK_RE, (_m, name: string) => {
    const s = Stickers.find(name, pool);
    return s ? `<img class="xt-stk${s.anim ? ' anim' : ''}" alt="${esc(s.name)}" title="${esc(s.name)}" src="${esc(s.data)}">` : `<span class="xt-stk-gone">${esc(name.trim())}</span>`;
  }).replace(/\[sticker\b[^\]\n]*$/i, '');   // 아직 닫히지 않은 꼬리(스트리밍 중)는 감춘다
}

// ── 캐릭터가 보내는 딱지 ──
export const STICKER_PROMPT = `<stickers>
A line like [sticker: name — meaning] in the chat is a sticker image that was sent, not text; read it by its meaning.
You may send one sticker yourself by writing [sticker: name] alone on its own line. Do it only when {{char}} really would — a reaction that needs no words, a goodnight, a tease — and not in every reply. Use only these names, exactly as written: {{names}}
</stickers>`;
export const STICKER_READ_PROMPT = `A line like [sticker: name — meaning] in the chat is a sticker image {{user}} sent, not text; read it by its meaning. Do not write such lines yourself.`;
const lastChatUsesStickers = (msgs: Msg[]) => msgs.slice(-12).some(m => /\[sticker\s*:/i.test(m.swipes[m.sw]?.text || ''));
/** 프롬프트에 붙일 안내 (없으면 '') */
export function stickerPrompt(chat: Chat, charId: string, msgs: Msg[]): string {
  const c = cfg().stk, talk = chat.mode === 'talk' && !(chat as { sceneLive?: boolean }).sceneLive;
  const can = c.ai === 'pick' && (talk || c.rp);
  if (!can) return lastChatUsesStickers(msgs) ? STICKER_READ_PROMPT : '';
  const names = Stickers.forChar(chat, charId).slice(0, 40).map(s => s.name);
  return names.length ? STICKER_PROMPT.replace('{{names}}', names.join(', ')) : '';
}
/** 답장 글을 정리한다: 아는 이름은 바른 이름으로 고쳐 한 줄로, 모르는 이름은 지운다 (한 답장에 하나만) */
export function tidyReply(text: string, pool: Sticker[], allow: boolean): string {
  if (text.indexOf('[sticker') < 0) return text;
  let used = false;
  const out = text.replace(STK_RE, (_m, name: string) => { const s = allow && !used ? Stickers.find(name, pool) : null; if (!s) return ''; used = true; return '\n' + tagOf(s, false) + '\n'; });
  return out.replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
}
/** 감정으로 자동: 표정 라벨이나 답장 속 낱말과 뜻이 맞는 딱지를 고른다. 모델을 부르지 않는다. 같은 답장에는 늘 같은 결과 */
export function moodPick(text: string, label: string, pool: Sticker[], seed: string, rate: number): Sticker | null {
  if (!pool.length || STK_LINE.test(text)) { STK_LINE.lastIndex = 0; return null; }
  STK_LINE.lastIndex = 0;
  const roll = parseInt(hash(seed), 36) % 1000 / 1000; if (roll >= rate) return null;
  const body = norm(text), lab = norm(label || '');
  const score = (s: Sticker) => s.keys.split(',').map(norm).filter(Boolean).reduce((n, k) => n + (lab && k === lab ? 3 : 0) + (k.length >= 2 && body.includes(k) ? 2 : 0), 0);
  const ranked = pool.map(s => ({ s, n: score(s) })).filter(x => x.n > 0).sort((a, b) => b.n - a.n);
  if (!ranked.length) return null;
  const top = ranked.filter(x => x.n === ranked[0].n);
  return top[parseInt(hash(seed + '#'), 36) % top.length].s;
}
/** 내 딱지를 그림으로도 붙일 때: 모델이 읽을 수 있는 PNG 로 바꾼다 (SVG · 움직이는 그림은 한 장으로) */
export function rasterize(s: Sticker): Promise<string> {
  return new Promise(resolve => {
    const img = new Image();
    img.onload = () => { const k = Math.min(1, 384 / Math.max(img.width || 384, img.height || 384)), c = document.createElement('canvas'); c.width = Math.round((img.width || 384) * k); c.height = Math.round((img.height || 384) * k); c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height); try { resolve(c.toDataURL('image/png')); } catch { resolve(''); } };
    img.onerror = () => resolve(''); img.src = s.data;
  });
}
