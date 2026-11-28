// 배경 서가: 여러 대화가 함께 쓰는 배경 그림 모음 (폴더 · 즐겨찾기 · 이름/꼬리표 · 축소본) + 고르는 창 + 장면에 맞춰 바꾸기([bg: 이름], 추가 호출 없음)
// 보관: assets 저장소에 두 줄씩 — owner 'bg'(축소본 + 정보, 목록용)와 owner 'bgfull'(원본, 고를 때만 읽는다)
import { useEffect, useRef, useState } from 'react';
import { Btn, Icon } from '../kit';
import { confirmBox, menu, openModal, promptBox, toast, type ModalHandle } from '../ui';
import { DB, S, now, on, pickFiles, readDataURL, shrinkImage, uid } from '../lib/core';
import { I } from '../lib/icons';
import type { Chat, Msg } from '../lib/types';
import { bump, cur } from '../chat/store';
import { t } from '../i18n';

if (!I.shelf) I.shelf = 'M4 4v16M20 4v16M4 9h16M4 15h16M8 9V5.5M11 9V5M15 9V6M8 15v-3.5M12 15v-3M16 15v-4';

export interface BgRec { id: string; owner: 'bg'; name: string; data: string; kind: 'bg'; folder?: string; fav?: boolean; tags?: string[]; ts: number; /** 내장 풍경이면 파일 주소 */ url?: string }
type BgChat = Chat & { bgAuto?: boolean; bgBase?: string; bgName?: string };
/** 함께 들어 있는 풍경 (game/bg/<이름>.jpg) */
const BUILTIN = ['forest', 'forest-2', 'meadow', 'meadow-2', 'lake', 'sea', 'harbor', 'bridge', 'road', 'mountain', 'peak', 'winter', 'desert', 'desert-2', 'garden', 'night', 'city', 'street', 'station', 'room', 'tavern', 'hall', 'hall-2', 'castle', 'ruins', 'arena'];
const builtin = (): BgRec[] => BUILTIN.map(n => ({ id: 'b:' + n, owner: 'bg', name: n, data: `game/bg/${n}.jpg`, url: `game/bg/${n}.jpg`, kind: 'bg', ts: 0 }));
const norm = (s: string) => s.toLowerCase().normalize('NFKC').replace(/[\s_\-]+/g, ' ').trim();
let mine: BgRec[] | null = null;

export const BgShelf = {
  async load() { return mine ||= ((await DB.byOwner('bg', { wait: false }).catch(() => [])) as unknown as BgRec[]).sort((a, b) => b.ts - a.ts); },
  drop() { mine = null; },
  mine: () => mine || [],
  builtin,
  async add(file: File) {
    const src = await readDataURL(file), full = await shrinkImage(src, 1920, 'image/jpeg', 0.85), thumb = await shrinkImage(full || src, 360, 'image/webp', 0.8);
    if (!full || !thumb) return null;
    const names = new Set((mine || []).map(b => norm(b.name))); let name = file.name.replace(/\.[a-z0-9]+$/i, '').replace(/[\[\]\n]/g, ' ').trim().slice(0, 40) || 'background', i = 2; const base = name; while (names.has(norm(name))) name = `${base} ${i++}`;
    const rec: BgRec = { id: uid(), owner: 'bg', name, data: thumb, kind: 'bg', ts: now() };
    await DB.put('assets', { id: rec.id + ':full', owner: 'bgfull', name, data: full, kind: 'bgfull' }); await DB.put('assets', rec);
    (await this.load()).unshift(rec); return rec;
  },
  async save(b: BgRec) { if (!b.url) await DB.put('assets', b); },
  async remove(b: BgRec) { await DB.del('assets', b.id); await DB.del('assets', b.id + ':full'); mine = (mine || []).filter(x => x !== b); },
  /** 대화에 걸 주소 (원본) */
  async full(b: BgRec) { if (b.url) return new URL(b.url, document.baseURI).pathname;   // 배경은 스타일시트의 변수로 걸리므로, 문서 기준 주소로 바꿔 둔다 (css/ 기준으로 읽히지 않게)
    return ((await DB.get('assets', b.id + ':full')) as { data?: string } | undefined)?.data || b.data; },
  /** 모델에게 알려 줄 이름들: 내 서가(즐겨찾기 먼저)에서 30개까지, 서가가 비었으면 내장 풍경 */
  names() { const l = [...(mine || [])].sort((a, b) => +!!b.fav - +!!a.fav); return (l.length ? l : builtin()).slice(0, 30).map(b => b.name); },
  find(name: string) { const q = norm(name); if (!q) return null; const l = [...(mine || []), ...builtin()]; return l.find(b => norm(b.name) === q) || l.find(b => (b.tags || []).some(x => norm(x) === q)) || null; },
};

/** 배경을 바꾼다: 앞 그림을 한 겹 덮어 두었다가 서서히 걷는다 (메시지 목록은 건드리지 않는다) */
export async function setChatBg(chat: Chat, url: string, name = '') {
  const c = chat as BgChat, old = chat.bg; if (old === url) return;
  chat.bg = url; if (name) c.bgName = name; else delete c.bgName;
  await S.save('chats', chat, true);
  if (cur.chat !== chat) return;
  const main = document.querySelector<HTMLElement>('.chat-main');
  if (main && old) { const veil = document.createElement('i'); veil.className = 'xt-bgveil'; veil.style.backgroundImage = `url("${old}")`; main.append(veil); requestAnimationFrame(() => veil.classList.add('out')); setTimeout(() => veil.remove(), 900); }
  bump('main');
}

// ── 장면에 맞춰 바꾸기 ──
export const BG_PROMPT = `<backdrop>
The chat screen has a backdrop picture. When the story clearly moves to a different place, or the hour visibly changes, add [bg: name] alone on its own line at the very end of the reply. Use only one of these names, exactly as written: {{names}}
If none fits, or the place has not changed, write no tag. The tag is removed before {{user}} sees the reply; never mention it.
</backdrop>`;
const BG_RE = /^[ \t]*\[bg\s*:\s*"?([^\]\n"]+?)"?\s*\][ \t]*\n?/gim;
export const bgAuto = (chat?: Chat | null) => !!(chat as BgChat | null | undefined)?.bgAuto;
export function bgPrompt(chat: Chat): string { if (!bgAuto(chat) || chat.mode === 'talk') return ''; const n = BgShelf.names(); return n.length ? BG_PROMPT.replace('{{names}}', n.join(', ')) : ''; }
/** 답장에서 [bg: 이름] 을 떼어 낸다. 아는 이름이면 그 이름을 돌려준다 */
export function takeBg(text: string): { text: string; name: string } {
  if (text.indexOf('[bg') < 0) return { text, name: '' };
  let name = '';
  const out = text.replace(BG_RE, (_m, n: string) => { const b = BgShelf.find(n); if (b) name = b.name; return ''; }).replace(/\[bg\s*:[^\]\n]*\]/gi, '');
  return { text: out.replace(/\n{3,}/g, '\n\n').trim(), name };
}
export const hideBg = (text: string) => text.indexOf('[bg') < 0 ? text : text.replace(/\[bg\b[^\]\n]*(\]|$)/gi, '');
/** 남아 있는 메시지에 맞춰 배경을 다시 정한다 (스와이프 · 삭제 뒤): 가장 마지막에 적힌 이름, 없으면 자동으로 바뀌기 전의 배경 */
export async function syncBg(chat: Chat, msgs: Msg[]) {
  const c = chat as BgChat; if (!c.bgAuto) return;
  let name = ''; for (let i = msgs.length - 1; i >= 0 && !name; i--) name = String((msgs[i].swipes[msgs[i].sw] as { bg?: string } | undefined)?.bg || '');
  if (!name) { if (c.bgName && c.bgBase !== undefined) await setChatBg(chat, c.bgBase); return; }
  if (c.bgName === name) return;
  const b = BgShelf.find(name); if (!b) return;
  if (!c.bgName) c.bgBase = chat.bg || '';   // 처음 자동으로 바뀔 때, 내가 걸어 둔 배경을 적어 둔다
  await setChatBg(chat, await BgShelf.full(b), b.name);
}

// ════════ 고르는 창 ════════
/** 빈 서가: 빈 선반 세 칸 */
const EmptyArt = () => <svg viewBox="0 0 56 56" className="fx-art"><path d="M8 8v40M48 8v40M8 20h40M8 34h40M8 48h40" /><path className="t" d="M14 20v-8h6v8M24 34v-9h5v9M32 34v-7h4v7" /><path className="d" d="M30 20v-7M36 20v-9M14 48v-8M20 48v-10" /></svg>;

function Shelf({ chat, close }: { chat: Chat; close: () => void }) {
  const [list, setList] = useState<BgRec[] | null>(mine), [view, setView] = useState('@all'), [q, setQ] = useState(''), [, re] = useState(0), [busy, setBusy] = useState('');
  const redraw = () => { setList([...(mine || [])]); re(x => x + 1); }, c = chat as BgChat, seen = useRef(false);
  useEffect(() => { if (!seen.current) { seen.current = true; void BgShelf.load().then(l => setList([...l])); } }, []);
  const all = list || [], folders = [...new Set(all.map(b => (b.folder || '').trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b));
  const term = q.trim().toLowerCase();
  const pool = view === '@built' ? builtin() : view === '@fav' ? all.filter(b => b.fav) : view === '@all' ? all : all.filter(b => b.folder === view);
  const rows = term ? [...all, ...builtin()].filter(b => (b.name + ' ' + (b.tags || []).join(' ') + ' ' + (b.folder || '')).toLowerCase().includes(term)) : pool;
  const pick = async (b: BgRec) => { delete c.bgBase; await setChatBg(chat, await BgShelf.full(b), b.name); close(); };
  const upload = async () => {
    const files = (await pickFiles({ accept: 'image/*', multiple: true })).filter(f => f.type.startsWith('image/')); if (!files.length) return;
    let n = 0; for (const f of files) { setBusy(t('extras.bg.adding', { n: ++n, total: files.length })); const r = await BgShelf.add(f); if (r && view !== '@all' && !view.startsWith('@')) { r.folder = view; await BgShelf.save(r); } }
    setBusy(''); if (view === '@built' || view === '@fav') setView('@all'); redraw(); toast(t('extras.bg.added', { n }), 'ok');
  };
  const more = (e: Element, b: BgRec) => menu(e, [
    { label: t('extras.bg.rename'), ic: 'edit', onclick: async () => { const v = await promptBox(t('extras.bg.renameAsk'), b.name); if (v?.trim()) { b.name = v.replace(/[\[\]\n]/g, ' ').trim().slice(0, 40); await BgShelf.save(b); redraw(); } } },
    { label: t('extras.bg.tags'), ic: 'note', hint: (b.tags || []).join(', '), onclick: async () => { const v = await promptBox(t('extras.bg.tagsAsk'), (b.tags || []).join(', ')); if (v !== null) { b.tags = v.split(',').map(x => x.trim()).filter(Boolean).slice(0, 8); await BgShelf.save(b); redraw(); } } },
    { label: t('extras.bg.move'), ic: 'folder', hint: b.folder || '', onclick: () => menu(e, [...folders.map(f => ({ label: f, ic: f === b.folder ? 'check' : 'folder', onclick: async () => { b.folder = f; await BgShelf.save(b); redraw(); } })),
      { label: t('extras.bg.newFolder'), ic: 'plus', onclick: async () => { const v = await promptBox(t('extras.bg.folderAsk'), ''); if (v?.trim()) { b.folder = v.trim().slice(0, 30); await BgShelf.save(b); redraw(); } } },
      ...(b.folder ? [{ label: t('extras.bg.noFolder'), ic: 'x', onclick: async () => { delete b.folder; await BgShelf.save(b); redraw(); } }] : [])]) },
    '-', { label: t('common.delete'), ic: 'trash', danger: true, onclick: async () => { if (await confirmBox(t('extras.bg.removeAsk', { name: b.name }), t('common.delete'), true)) { await BgShelf.remove(b); redraw(); } } }]);
  const nav = (id: string, label: string, n: number, ic: string) => <button key={id} type="button" className={'xt-bg-nav fx-tap' + (view === id && !term ? ' on' : '')} aria-pressed={view === id} onClick={() => { setQ(''); setView(id); }}><Icon name={ic} size={14} /><span>{label}</span><small className="fx-num">{String(n).padStart(2, '0')}</small></button>;
  return <div className="xt-bg">
    <aside className="xt-bg-side">
      <span className="fx-lbl kr fx-head">{t('extras.bg.shelves')}</span>
      {nav('@all', t('extras.bg.all'), all.length, 'shelf')}{nav('@fav', t('extras.bg.favs'), all.filter(b => b.fav).length, 'star')}{nav('@built', t('extras.bg.builtin'), BUILTIN.length, 'moon')}
      {folders.length ? <span className="fx-lbl kr fx-head">{t('extras.bg.folders')}</span> : null}
      {folders.map(f => nav(f, f, all.filter(b => b.folder === f).length, 'folder'))}
      <label className="check xt-bg-auto"><input type="checkbox" checked={!!c.bgAuto} onChange={async e => { c.bgAuto = e.target.checked; if (!c.bgAuto) { delete c.bgBase; } await S.save('chats', chat, true); re(x => x + 1); }} /><i /><span>{t('extras.bg.auto')}</span></label>
      <small className="hint">{t('extras.bg.autoHint')}</small>
    </aside>
    <section className="xt-bg-main">
      <div className="xt-bg-bar"><input className="inp search" placeholder={t('extras.bg.search')} aria-label={t('extras.bg.search')} value={q} onChange={e => setQ(e.target.value)} />
        <Btn label={busy || t('extras.bg.upload')} ic="upload" cls="ghost" onClick={() => { if (!busy) void upload(); }} />
        {chat.bg ? <Btn label={t('extras.bg.clear')} cls="ghost" onClick={async () => { delete c.bgBase; await setChatBg(chat, ''); close(); }} /> : null}</div>
      {list === null ? <p className="dim">{t('extras.loading')}</p> : rows.length ? <div className="xt-bg-grid">{rows.map((b, i) => <figure key={b.id} className={'xt-bg-it fx-in' + (c.bgName === b.name && chat.bg ? ' on' : '')} style={{ ['--d' as string]: Math.min(i, 12) * 18 + 'ms' }}>
        <button type="button" className="xt-bg-pic" aria-label={t('extras.bg.use', { name: b.name })} onClick={() => void pick(b)}><img src={b.data} alt="" loading="lazy" /></button>
        <figcaption><span className="fx-num">{b.name}</span>
          {b.url ? <em className="fx-lbl kr">{t('extras.bg.builtinTag')}</em> : <><button type="button" className={'xt-star' + (b.fav ? ' on' : '')} aria-pressed={!!b.fav} title={t('extras.bg.fav')} aria-label={t('extras.bg.fav')} onClick={async () => { b.fav = !b.fav; await BgShelf.save(b); redraw(); }}><Icon name="star" size={13} /></button>
            <button type="button" className="xt-star" title={t('extras.bg.more')} aria-label={t('extras.bg.more')} onClick={e => more(e.currentTarget, b)}><Icon name="more" size={13} /></button></>}</figcaption>
      </figure>)}</div> : <div className="fx-empty"><EmptyArt /><p>{term ? t('extras.bg.noneFound') : view === '@fav' ? t('extras.bg.noFavs') : t('extras.bg.empty')}</p></div>}
    </section>
  </div>;
}
/** 서가에서 고르기 */
export function openBgShelf(chat: Chat) {
  const m: ModalHandle = openModal({ title: t('extras.bg.title'), wide: true, body: <Shelf chat={chat} close={() => m.close()} />, actions: [{ label: t('common.close') }] });
  m.el.classList.add('xt-bg-modal');
}

// 빈 브라우저로 켠 뒤 그림을 뒤에서 다 가져왔으면 다시 읽는다 (그동안은 기다리지 않고 있는 것만 보였다)
on('data:hydrated', () => { mine = null; });
