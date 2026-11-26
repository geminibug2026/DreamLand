// 딱지 서랍: 입력창 옆 단추 · 고르는 창(최근/묶음 · 찾기 · 격자) · 묶음 관리 · 내 딱지 보내기
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { Btn, IconBtn } from '../kit';
import { confirmBox, openModal, promptBox, toast } from '../ui';
import { S, emit, newMsg, pickFiles } from '../lib/core';
import { I } from '../lib/icons';
import type { Chat } from '../lib/types';
import { chatApi } from '../chat/actions';
import { t } from '../i18n';
import { cfg } from './cfg';
import { Stickers, rasterize, tagOf, type Pack, type Sticker } from './stickers';

if (!I.sticker) I.sticker = 'M5 4h14v9l-6 7H5zM19 13h-6v7M9 9h.01M14 9h.01M9 12.5c1.2 1.2 3.3 1.2 4.5 0';

/** 빈 묶음 그림: 귀퉁이가 접힌 쪽지와 작은 별 */
const EmptyArt = () => <svg viewBox="0 0 56 56" className="fx-art"><path d="M12 10h32v24l-10 12H12z" /><path className="t" d="M44 34H34v12" /><path className="d" d="M18 20h20M18 27h14" /><path className="a" d="M44 6l1.2 3.2L48.4 10l-3.2 1.2L44 14.4l-1.2-3.2L39.6 10l3.2-.8z" /></svg>;

/** 내가 딱지를 보낸다: 입력창에 적던 글이 있으면 그 글 아래에 붙여 함께 보낸다 */
export async function sendSticker(s: Sticker) {
  const { chat, busy } = chatApi.current(); if (!chat) return;
  if (busy) return void toast(t('extras.stk.busy'));
  const persona = S.persona(chat), typed = (chatApi.getInput?.() || '').trim();
  if (typed.startsWith('/')) return void toast(t('extras.stk.busy'));
  const live = chat as Chat & { scene?: { on?: boolean } };
  const m = newMsg('user', (typed ? typed + '\n' : '') + tagOf(s), { name: persona.name, ...(chat.mode === 'talk' && live.scene?.on ? { scene: true } : {}) });
  if (cfg().stk.vision) { const png = await rasterize(s); if (png) m.images = [png]; }   // 그림을 읽는 모델에게는 그림도 함께
  chatApi.setInput?.('');
  await chatApi.push?.(m); emit('message:sent', { msg: m, chat });
  Stickers.markUsed(s);
  if (chat.groupOrder === 'manual' && chat.charIds.length > 1) return;   // 수동 순서인 그룹은 누가 답할지 내가 고른다
  void chatApi.generate('normal');
}

function Cell({ s, onPick }: { s: Sticker; onPick: (s: Sticker) => void }) {
  return <button type="button" className="xt-cell fx-tap" title={s.keys ? `${s.name} — ${s.keys}` : s.name} aria-label={s.name} onClick={() => onPick(s)}><img src={s.data} alt="" loading="lazy" draggable={false} /><span>{s.name}</span></button>;
}
function PickerBody({ chat, onPick, close }: { chat: Chat | null; onPick: (s: Sticker) => void; close: () => void }) {
  const packs = Stickers.usablePacks(chat), recent = Stickers.recent(chat);
  const [tab, setTab] = useState(recent.length ? '@recent' : packs[0]?.id || ''), [q, setQ] = useState('');
  const term = q.trim().toLowerCase();
  const rows = useMemo(() => term ? Stickers.usable(chat).filter(s => (s.name + ' ' + s.keys).toLowerCase().includes(term)) : tab === '@recent' ? recent : Stickers.list(tab), [term, tab, chat]);   // eslint-disable-line react-hooks/exhaustive-deps
  const tabs: [string, string][] = [...(recent.length ? [['@recent', t('extras.stk.recent')] as [string, string]] : []), ...packs.map((p): [string, string] => [p.id, Stickers.packName(p)])];
  return <>
    <header className="xt-pick-head"><span className="fx-lbl kr ink">{t('extras.stk.title')}</span>
      <input className="xt-pick-q" placeholder={t('extras.stk.search')} aria-label={t('extras.stk.search')} value={q} onChange={e => setQ(e.target.value)} />
      <IconBtn ic="sliders" title={t('extras.stk.manage')} cls="tiny" onClick={() => { close(); openStickerManager(); }} /><IconBtn ic="x" title={t('common.close')} cls="tiny" onClick={close} /></header>
    {term ? <div className="xt-pick-tabs"><span className="fx-lbl kr">{t('extras.stk.found', { n: String(rows.length).padStart(2, '0') })}</span></div>
      : <div className="xt-pick-tabs" role="tablist">{tabs.map(([id, l]) => <button key={id} type="button" role="tab" aria-selected={tab === id} className={'xt-ptab' + (tab === id ? ' on' : '')} onClick={() => setTab(id)}>{l}</button>)}</div>}
    <div className="xt-grid">{rows.length ? rows.map(s => <Cell key={s.id} s={s} onPick={onPick} />)
      : <div className="fx-empty xt-grid-empty"><EmptyArt /><p>{term ? t('extras.stk.noneFound') : t('extras.stk.emptyPack')}</p></div>}</div>
    <footer className="xt-pick-foot"><span className="fx-num">{String(rows.length).padStart(2, '0')}</span><i /><span className="fx-lbl kr">{t('extras.stk.footHint')}</span></footer>
  </>;
}

let closeOpen: (() => void) | null = null;
/** 고르는 창을 anchor 위에 띄운다. 고르면 onPick 을 부르고 닫는다 */
export function openStickerPicker(anchor: Element, onPick: (s: Sticker) => void) {
  if (closeOpen) { const was = closeOpen; was(); if ((was as { anchor?: Element }).anchor === anchor) return; }
  const host = document.createElement('div'); host.className = 'xt-pick fx-frame fx-in'; host.setAttribute('role', 'dialog'); host.setAttribute('aria-label', t('extras.stk.title'));
  const root = createRoot(host), r = anchor.getBoundingClientRect(), narrow = innerWidth <= 820;
  if (narrow) { host.classList.add('xt-sheet'); host.style.bottom = Math.max(8, innerHeight - r.top + 8) + 'px'; }
  else { host.style.bottom = (innerHeight - r.top + 10) + 'px'; host.style.left = Math.max(12, Math.min(innerWidth - 372, r.left - 40)) + 'px'; }
  const close = () => { if (closeOpen !== close) return; closeOpen = null; document.removeEventListener('pointerdown', away, true); document.removeEventListener('keydown', key, true); root.unmount(); host.remove(); };
  (close as { anchor?: Element }).anchor = anchor;
  const away = (e: Event) => { const el = e.target as Node; if (!host.contains(el) && !anchor.contains(el)) close(); };
  const key = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); close(); } };
  document.addEventListener('pointerdown', away, true); document.addEventListener('keydown', key, true);
  document.body.append(host); closeOpen = close;
  root.render(<PickerBody chat={chatApi.current().chat} close={close} onPick={s => { close(); onPick(s); }} />);
}

/** 입력창 옆 단추 — 설정(곁들임 › 딱지)에서 켰을 때만. 꺼 두면 입력창 「+」 메뉴의 「딱지 보내기」로 보낸다 */
export function StickerBtn() {
  if (!cfg().stk.btn) return null;
  return <IconBtn ic="sticker" title={t('extras.stk.open')} onClick={e => openStickerPicker(e.currentTarget, s => void sendSticker(s))} />;
}

// ════════ 묶음 관리 ════════
function PackPane({ p, redraw }: { p: Pack; redraw: () => void }) {
  const [busy, setBusy] = useState(''), list = Stickers.list(p.id), timer = useRef(0);
  const later = (s: Sticker) => { clearTimeout(timer.current); timer.current = window.setTimeout(() => void Stickers.put(s), 400); };
  const upload = async () => {
    const files = await pickFiles({ accept: 'image/*,.zip', multiple: true }); if (!files.length) return;
    setBusy(t('extras.stk.adding', { n: 0 }));
    try { const { n, errs } = await Stickers.addFiles(p.id, files, k => setBusy(t('extras.stk.adding', { n: k }))); toast(t('extras.stk.added', { n }), 'ok'); if (errs.length) toast(errs[0], 'err'); }
    catch (e) { toast(e instanceof Error ? e.message : String(e), 'err'); } finally { setBusy(''); redraw(); }
  };
  return <div className="xt-pack">
    <div className="xt-pack-top">
      {p.builtin ? <b className="fx-serif xt-pack-name">{Stickers.packName(p)}</b>
        : <input className="xt-pack-name fx-serif" defaultValue={p.name} aria-label={t('extras.stk.packName')} onChange={e => { p.name = e.target.value.slice(0, 40); void Stickers.savePack(); }} onBlur={redraw} />}
      <span className="fx-num xt-count">{String(list.length).padStart(2, '0')}</span>
    </div>
    <div className="xt-pack-opts">
      <label className="check"><input type="checkbox" checked={!p.off} onChange={e => { p.off = !e.target.checked; void Stickers.savePack(); redraw(); }} /><i /><span>{t('extras.stk.packOn')}</span></label>
      {!p.builtin ? <label className="xt-own"><span className="fx-lbl kr">{t('extras.stk.owner')}</span><select className="inp" value={p.owner} onChange={e => { p.owner = e.target.value; void Stickers.savePack(); redraw(); }}>
        <option value="">{t('extras.stk.ownerAll')}</option>{S.chars.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label> : null}
      {!p.builtin ? <><Btn label={busy || t('extras.stk.upload')} ic="upload" cls="ghost" onClick={() => { if (!busy) void upload(); }} />
        <IconBtn ic="trash" title={t('extras.stk.removePack')} onClick={async () => { if (await confirmBox(t('extras.stk.removePackAsk', { name: p.name }), t('common.delete'), true)) { await Stickers.removePack(p); redraw(); } }} /></> : null}
    </div>
    <p className="hint">{p.builtin ? t('extras.stk.dreamHint') : t('extras.stk.uploadHint')}</p>
    {list.length ? <div className="xt-edit fx-rows">{list.map(s => <div className="xt-edit-row" key={s.id}>
      <img src={s.data} alt="" loading="lazy" />
      {p.builtin ? <div className="xt-edit-ro"><b className="fx-num">{s.name}</b><small>{s.keys}</small></div> : <div className="xt-edit-f">
        <input className="inp" defaultValue={s.name} aria-label={t('extras.stk.name')} placeholder={t('extras.stk.name')} onBlur={e => { const v = Stickers.freeName(e.target.value, s); e.target.value = s.name = v; void Stickers.put(s); }} />
        <input className="inp" defaultValue={s.keys} aria-label={t('extras.stk.keys')} placeholder={t('extras.stk.keysPh')} onChange={e => { s.keys = e.target.value.slice(0, 160); later(s); }} /></div>}
      {!p.builtin ? <IconBtn ic="x" title={t('common.delete')} cls="tiny" onClick={async () => { await Stickers.remove(s); redraw(); }} /> : null}
    </div>)}</div> : <div className="fx-empty"><EmptyArt /><p>{t('extras.stk.emptyPack')}</p></div>}
  </div>;
}
export function StickerManager() {
  const [, bump] = useState(0), redraw = () => bump(x => x + 1), packs = Stickers.packs();
  const [sel, setSel] = useState(packs[0]?.id || ''), p = packs.find(x => x.id === sel) || packs[0];
  useEffect(() => { if (p && p.id !== sel) setSel(p.id); });
  const name = (c: Pack): ReactNode => <><span>{Stickers.packName(c)}</span><small className="fx-num">{String(Stickers.list(c.id).length).padStart(2, '0')}</small></>;
  return <div className="xt-mgr">
    <nav className="xt-mgr-list" aria-label={t('extras.stk.packs')}>
      <span className="fx-lbl kr fx-head">{t('extras.stk.packs')}</span>
      {packs.map(c => <button key={c.id} type="button" className={'xt-mgr-item fx-tap' + (c === p ? ' on' : '') + (c.off ? ' off' : '')} onClick={() => setSel(c.id)}>{name(c)}{c.owner ? <em>{S.get('chars', c.owner)?.name || '—'}</em> : null}</button>)}
      <Btn label={t('extras.stk.addPack')} ic="plus" cls="ghost" onClick={async () => { const v = await promptBox(t('extras.stk.packName'), ''); if (v === null) return; const np = await Stickers.addPack(v); setSel(np.id); redraw(); }} />
    </nav>
    {p ? <PackPane key={p.id} p={p} redraw={redraw} /> : null}
  </div>;
}
export function openStickerManager() {
  openModal({ title: t('extras.stk.manage'), wide: true, body: <StickerManager />, actions: [{ label: t('common.close'), cls: 'primary' }] });
}
