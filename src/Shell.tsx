// 틀: 옆(아래) 내비 · 더보기 · 빠른 이동
import { useEffect, useMemo, useRef, useState } from 'react';
import { Avatar, Icon, Moon, mountInto, useEvents } from './kit';
import type { Char, NavItem } from './types';
import { menu, openModal } from './ui';
import { go, route } from './lib/router';
import { S } from './lib/core';
import { navItems } from './lib/boot';
import { startChat } from './chat/start';
import { t, useLang } from './i18n';

function MoreGrid({ close }: { close: () => void }) {
  return <>{navItems().filter(n => !n[3]).map(([page, label, ic]) =>
    <button key={page} onClick={() => { close(); go(page); }}><Icon name={ic} size={24} />{label}</button>)}</>;
}
function moreSheet() {
  const m = openModal({ title: t('common.more'), body: <div className="more-grid"><MoreGrid close={() => m.close()} /></div> });
}

export function Rail() {
  useEvents('route', 'rail'); useLang();
  const page = route.page, items = navItems(), rest = items.filter(n => !n[5]);
  const tab = ([p, label, ic, main, en, top]: NavItem) =>
    <button key={p} className={[main && 'main', top && 'top', page === p && 'on'].filter(Boolean).join(' ') || undefined} data-page={p} title={label} onClick={() => go(p)}>
      <Icon name={ic} size={21} /><span className="ko">{label}</span><span className="en">{en || label}</span>
    </button>;
  return <>
    <button className="logo" title="Dreamland" onClick={() => go('home')}><Moon size={22} /><b>DREAMLAND</b></button>
    <div className="rail-nav">{items.map(tab)}<button className="more" title={t('common.more')} onClick={moreSheet}><Icon name="menu" size={21} /><span className="ko">{t('common.more')}</span></button></div>
    <div className="rail-foot">
      <button title={t('shell.palette')} onClick={openPalette}><Icon name="search" size={19} /></button>
      <button title={t('nav.themes')} onClick={() => go('themes')}><Icon name="heart" size={19} /></button>
      <button title={t('shell.moreMenu')} onClick={e => menu(e.currentTarget, rest.map(([p, label, ic]) => ({ label, ic, onclick: () => go(p) })))}><Icon name="menu" size={19} /></button>
    </div>
  </>;
}

interface PaletteItem { key: string; label: string; hint: string; ic?: string; av?: Char; run: () => void }
function Palette({ close }: { close: () => void }) {
  const [q, setQ] = useState(''), [sel, setSel] = useState(0);
  const inp = useRef<HTMLInputElement>(null);
  useEffect(() => { inp.current?.focus(); }, []);
  const all = useMemo<PaletteItem[]>(() => {
    return [
      ...navItems().map(([page, label, ic]) => ({ key: 'n' + page, label, hint: t('shell.hintMenu'), ic, run: () => go(page) })),
      ...S.chars.map(c => ({ key: 'c' + c.id, label: c.name, hint: t('shell.hintChar'), av: c, run: () => { const last = S.chats.filter(x => x.charIds.includes(c.id)).sort((a, b) => b.updatedAt - a.updatedAt)[0]; if (last) go('chat', last.id); else void startChat([c.id]); } })),
      ...[...S.chats].sort((a, b) => b.updatedAt - a.updatedAt).slice(0, 200).map(c => ({ key: 'r' + c.id, label: (c.name || c.preview || t('shell.chatFallback')).slice(0, 60), hint: c.charIds.map(i => S.get('chars', i)?.name).filter(Boolean).join(', '), ic: 'chat', run: () => go('chat', c.id) })),
    ];
  }, []);
  const term = q.trim().toLowerCase();
  const items = all.filter(i => !term || (i.label + ' ' + i.hint).toLowerCase().includes(term)).slice(0, 30);
  const cur = Math.min(sel, Math.max(0, items.length - 1));
  const pick = (it: PaletteItem) => { close(); it.run(); };
  return <div className="palette-wrap" onMouseDown={e => { if (e.target === e.currentTarget) close(); }}>
    <div className="palette">
      <input ref={inp} className="inp" placeholder={t('shell.palettePh')} value={q} onChange={e => { setQ(e.target.value); setSel(0); }}
        onKeyDown={e => {
          if (e.key === 'ArrowDown') { setSel(Math.min(items.length - 1, cur + 1)); e.preventDefault(); }
          else if (e.key === 'ArrowUp') { setSel(Math.max(0, cur - 1)); e.preventDefault(); }
          else if (e.key === 'Enter' && items[cur]) pick(items[cur]);
          else if (e.key === 'Escape') close();
        }} />
      <div className="palette-list">{items.map((it, i) =>
        <button key={it.key} className={'palette-item' + (i === cur ? ' on' : '')} onClick={() => pick(it)}>{it.av ? <Avatar o={it.av} cls="xs" /> : <Icon name={it.ic || 'sparkle'} size={16} />}<b>{it.label}</b><small>{it.hint}</small></button>)}</div>
    </div>
  </div>;
}
let paletteOpen = false;
export function openPalette() {
  if (paletteOpen) return; paletteOpen = true;
  const holder = document.createElement('div'); holder.style.display = 'contents'; document.body.append(holder);
  let off = () => { };
  off = mountInto(holder, <Palette close={() => { off(); holder.remove(); paletteOpen = false; }} />);
}
