// 입력창 위 퀵 리플라이 줄: 꺼내 둔(★) 버튼 → 세트마다 칩 하나(누르면 서랍) 또는 늘어놓은 버튼
// 오른쪽 클릭(휴대폰은 길게 누르기): 꺼내 두기 · 다른 세트로 옮기기/베끼기 · 편집 · 이어 둔 세트의 버튼(실리태번의 컨텍스트 메뉴)
import { useEffect, useRef, useState, type MouseEvent, type PointerEvent, type ReactNode, type RefObject } from 'react';
import { createPortal } from 'react-dom';
import { Icon, useEvents } from '../kit';
import { menu, type MenuItem } from '../ui';
import { go } from '../lib/router';
import { qrActive, qrInline, qrSave, qrStore, qrTrayClose, qrTransfer, type QrItem, type QrSet } from '../lib/qr-data';
import type { Chat } from '../lib/types';
import { t } from '../i18n';
import { qrContextMenu, runItem } from './host';

const visible = (s: QrSet) => s.items.filter(i => !i.hidden);
let lastMenu = 0;

/** 버튼 메뉴 (줄 · 서랍 · 관리 화면 공용) */
export function qrItemMenu(el: Element, it: QrItem, set: QrSet, run?: (fn: () => Promise<unknown>) => void) {
  if (Date.now() - lastMenu < 600) return; lastMenu = Date.now();
  const others = qrStore().sets.filter(s => s !== set);
  const pickSet = (copy: boolean) => menu(el, others.length ? others.map(s => ({ label: s.name, ic: 'folder', hint: String(s.items.length), onclick: () => { qrTransfer([it], s, copy); } })) : [{ label: t('qr.ux.noOtherSet'), onclick: () => { } }]);
  const items: MenuItem[] = [
    { label: it.pinned ? t('qr.ux.unpin') : t('qr.ux.pin'), ic: 'star', onclick: () => { it.pinned = !it.pinned; qrSave(); } },
    { label: t('qr.ux.moveTo'), ic: 'right', onclick: () => pickSet(false) },
    { label: t('qr.ux.copyTo'), ic: 'copy', onclick: () => pickSet(true) },
    { label: t('common.edit'), ic: 'edit', onclick: () => go('qr', { set: set.id, item: it.id }) },
  ];
  const nodes = qrContextMenu(it, set);
  if (nodes.length) items.push('-', ...nodes.map((n): MenuItem => n.header
    ? { label: '— ' + n.label, ic: 'folder', hint: '', onclick: () => { } }
    : { label: '  '.repeat(n.depth) + n.label, ic: 'play', hint: n.title.slice(0, 60), onclick: () => { if (n.run) run ? run(n.run) : void n.run(); } }));
  menu(el, items);
}

export function QrBar({ chat }: { chat: Chat }) {
  useEvents('qr:changed', 'chat:open');
  const [busy, setBusy] = useState('');
  const [tray, setTray] = useState('');
  const hold = useRef<{ timer: number; fired: boolean }>({ timer: 0, fired: false });
  const anchor = useRef<HTMLButtonElement>(null);
  if (!qrStore().bar) return null;
  const sets = qrActive(chat).filter(s => s.items.some(i => !i.hidden));
  if (!sets.length) return null;
  const press = async (id: string, fn: () => Promise<unknown>) => { if (busy) return; setBusy(id); try { await fn(); } finally { setBusy(''); } };
  const hasCtx = (i: QrItem) => (i.contextList || []).some(c => qrStore().sets.some(s => s.name === c.set));
  const btn = (i: QrItem, s: QrSet, cls: string, after?: () => void): ReactNode => <button key={i.id} type="button"
    className={cls + (busy === i.id ? ' busy' : '') + (hasCtx(i) ? ' has-ctx' : '') + (i.pinned ? ' pinned' : '')} title={i.title || i.text.slice(0, 200)}
    disabled={!!busy && busy !== i.id}
    onClick={() => { if (hold.current.fired) { hold.current.fired = false; return; } void press(i.id, () => runItem(i, { set: s })); after?.(); }}
    onContextMenu={(e: MouseEvent<HTMLButtonElement>) => { e.preventDefault(); qrItemMenu(e.currentTarget, i, s, fn => void press(i.id, fn)); }}
    onPointerDown={(e: PointerEvent<HTMLButtonElement>) => { hold.current.fired = false; if (e.pointerType !== 'touch') return; const el = e.currentTarget; clearTimeout(hold.current.timer); hold.current.timer = window.setTimeout(() => { hold.current.fired = true; qrItemMenu(el, i, s, fn => void press(i.id, fn)); }, 500); }}
    onPointerUp={() => clearTimeout(hold.current.timer)} onPointerLeave={() => clearTimeout(hold.current.timer)} onPointerCancel={() => clearTimeout(hold.current.timer)}
  >{i.pinned ? <span className="qr-pin" aria-hidden>✦</span> : null}{i.stIcon && i.showLabel === false ? <span className="qr-ic-text">{i.label}</span> : i.label}</button>;
  const pinned = sets.flatMap(s => visible(s).filter(i => i.pinned).map(i => btn(i, s, 'chip qr-chip')));
  const cur = sets.find(s => s.id === tray);
  return <>{pinned.length ? <span className="qr-set qr-pinned">{pinned}</span> : null}
    {sets.map(s => qrInline(s)
      ? <span className="qr-set" key={s.id} title={sets.length > 1 ? s.name : undefined}>{visible(s).filter(i => !i.pinned).map(i => btn(i, s, 'chip qr-chip'))}</span>
      : <button key={s.id} type="button" className={'chip qr-setchip' + (tray === s.id ? ' on' : '')} aria-expanded={tray === s.id} title={s.name}
        onClick={() => setTray(tray === s.id ? '' : s.id)}><span className="qr-setname">{s.name}</span><small>{visible(s).length}</small></button>)}
    <button ref={anchor} type="button" className="chip ghost qr-more" title={t('qr.bar.manage')} onClick={e => menu(e.currentTarget, [
      { label: t('qr.bar.manage'), ic: 'sliders', onclick: () => go('qr') },
      { label: t('qr.bar.hide'), ic: 'eye', onclick: () => { qrStore().bar = false; qrSave(); } },
    ])}>⋯</button>
    {cur ? <Tray sets={sets} set={cur} anchor={anchor} pick={setTray} close={() => setTray('')}
      btn={(i, s) => btn(i, s, 'qr-cell', () => { if (qrTrayClose(s)) setTray(''); })} /> : null}</>;
}

/** 서랍: PC 는 입력창 위에 붙은 판, 휴대폰은 아래에서 올라오는 시트 */
function Tray({ sets, set, anchor, pick, close, btn }: { sets: QrSet[]; set: QrSet; anchor: RefObject<HTMLButtonElement | null>; pick: (id: string) => void; close: () => void; btn: (i: QrItem, s: QrSet) => ReactNode }) {
  const [q, setQ] = useState({ id: '', v: '' });
  const box = useRef<HTMLDivElement>(null);
  const drag = useRef({ y: 0, on: false });
  // 자리: 입력창(.composer) 너비 · 단추 줄 바로 위
  useEffect(() => {
    const place = () => {
      const el = box.current, comp = anchor.current?.closest('.composer'), quick = anchor.current?.closest('.quick'); if (!el || !comp || !quick) return;
      const c = (comp.querySelector('.composer-box') || comp).getBoundingClientRect(), r = quick.getBoundingClientRect();
      el.style.setProperty('--qr-left', c.left + 'px'); el.style.setProperty('--qr-w', c.width + 'px'); el.style.setProperty('--qr-bottom', (innerHeight - r.top + 6) + 'px');
    };
    place(); addEventListener('resize', place);
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') close(); };
    const off = (e: globalThis.PointerEvent) => { const tg = e.target; if (!(tg instanceof Element) || tg.closest('.qr-tray, .qr-setchip, .menu, .modal-wrap')) return; close(); };
    addEventListener('keydown', key); document.addEventListener('pointerdown', off, true);
    return () => { removeEventListener('resize', place); removeEventListener('keydown', key); document.removeEventListener('pointerdown', off, true); };
  }, [anchor, close]);
  const all = visible(set), k = q.id === set.id ? q.v.trim().toLowerCase() : '';   // 찾는 글은 세트마다 따로
  const shown = k ? all.filter(i => (i.label + '\n' + i.title).toLowerCase().includes(k)) : all;
  const handle = {
    onPointerDown: (e: PointerEvent<HTMLDivElement>) => { drag.current = { y: e.clientY, on: true }; e.currentTarget.setPointerCapture(e.pointerId); },
    onPointerMove: (e: PointerEvent<HTMLDivElement>) => { if (!drag.current.on || !box.current) return; const dy = Math.max(0, e.clientY - drag.current.y); box.current.style.transform = dy ? `translateY(${dy}px)` : ''; },
    onPointerUp: (e: PointerEvent<HTMLDivElement>) => { if (!drag.current.on) return; drag.current.on = false; const dy = e.clientY - drag.current.y; if (box.current) box.current.style.transform = ''; if (dy > 70) close(); },
  };
  return createPortal(<>
    <div className="qr-tray-back" onClick={close} />
    <div ref={box} className="qr-tray" role="dialog" aria-label={set.name}>
      <div className="qr-tray-handle" {...handle}><i /></div>
      <div className="qr-tray-head">
        <div className="qr-tabs" role="tablist">{sets.map(s => <button key={s.id} type="button" role="tab" aria-selected={s === set} className={'qr-tab' + (s === set ? ' on' : '')} onClick={() => pick(s.id)}>
          {s.name}<small>{visible(s).length}</small></button>)}</div>
        <button type="button" className="ibtn qr-tray-x" title={t('common.close')} aria-label={t('common.close')} onClick={close}><Icon name="x" size={16} /></button>
      </div>
      {all.length > 12 ? <label className="qr-tray-search"><Icon name="search" size={15} /><input className="inp" type="search" value={q.id === set.id ? q.v : ''} placeholder={t('qr.ux.searchSet')} aria-label={t('qr.ux.searchSet')} onChange={e => setQ({ id: set.id, v: e.target.value })} /></label> : null}
      <div className="qr-grid">{shown.length ? shown.map(i => btn(i, set)) : <p className="dim qr-none">{t('qr.ux.noMatch')}</p>}</div>
    </div>
  </>, document.body);
}
