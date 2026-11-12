// 틀: 옆(아래) 내비 · 더보기 · 빠른 이동
import { useEffect, useMemo, useRef, useState } from 'react';
import { L } from './legacy';
import { Avatar, Icon, Moon, mountInto, useEvents } from './kit';
import type { Char, NavItem } from './types';
import { menu, openModal } from './ui';

function MoreGrid({ close }: { close: () => void }) {
  return <>{L.boot.navItems().filter(n => !n[3]).map(([page, label, ic]) =>
    <button key={page} onClick={() => { close(); L.ui.go(page); }}><Icon name={ic} size={24} />{label}</button>)}</>;
}
function moreSheet() {
  const m = openModal({ title: '더보기', body: <div className="more-grid"><MoreGrid close={() => m.close()} /></div> });
}

export function Rail() {
  useEvents('route', 'rail');
  const page = L.ui.route.page, items = L.boot.navItems(), rest = items.filter(n => !n[5]);
  const tab = ([p, label, ic, main, en, top]: NavItem) =>
    <button key={p} className={[main && 'main', top && 'top', page === p && 'on'].filter(Boolean).join(' ') || undefined} data-page={p} title={label} onClick={() => L.ui.go(p)}>
      <Icon name={ic} size={21} /><span className="ko">{label}</span><span className="en">{en || label}</span>
    </button>;
  return <>
    <button className="logo" title="Dreamland" onClick={() => L.ui.go('home')}><Moon size={22} /><b>DREAMLAND</b></button>
    <div className="rail-nav">{items.map(tab)}<button className="more" title="더보기" onClick={moreSheet}><Icon name="menu" size={21} /><span className="ko">더보기</span></button></div>
    <div className="rail-foot">
      <button title="빠른 이동 (Ctrl+K)" onClick={openPalette}><Icon name="search" size={19} /></button>
      <button title="꾸미기" onClick={() => L.ui.go('themes')}><Icon name="heart" size={19} /></button>
      <button title="더 많은 메뉴" onClick={e => menu(e.currentTarget, rest.map(([p, label, ic]) => ({ label, ic, onclick: () => L.ui.go(p) })))}><Icon name="menu" size={19} /></button>
    </div>
  </>;
}

interface PaletteItem { key: string; label: string; hint: string; ic?: string; av?: Char; run: () => void }
function Palette({ close }: { close: () => void }) {
  const [q, setQ] = useState(''), [sel, setSel] = useState(0);
  const inp = useRef<HTMLInputElement>(null);
  useEffect(() => { inp.current?.focus(); }, []);
  const all = useMemo<PaletteItem[]>(() => {
    const S = L.core.S;
    return [
      ...L.boot.navItems().map(([page, label, ic]) => ({ key: 'n' + page, label, hint: '메뉴', ic, run: () => L.ui.go(page) })),
      ...S.chars.map(c => ({ key: 'c' + c.id, label: c.name, hint: '캐릭터와 최근 대화', av: c, run: () => { const last = S.chats.filter(x => x.charIds.includes(c.id)).sort((a, b) => b.updatedAt - a.updatedAt)[0]; if (last) L.ui.go('chat', last.id); else void L.chat.startChat([c.id]); } })),
      ...[...S.chats].sort((a, b) => b.updatedAt - a.updatedAt).slice(0, 200).map(c => ({ key: 'r' + c.id, label: (c.name || c.preview || '대화').slice(0, 60), hint: c.charIds.map(i => S.get('chars', i)?.name).filter(Boolean).join(', '), ic: 'chat', run: () => L.ui.go('chat', c.id) })),
    ];
  }, []);
  const term = q.trim().toLowerCase();
  const items = all.filter(i => !term || (i.label + ' ' + i.hint).toLowerCase().includes(term)).slice(0, 30);
  const cur = Math.min(sel, Math.max(0, items.length - 1));
  const pick = (it: PaletteItem) => { close(); it.run(); };
  return <div className="palette-wrap" onMouseDown={e => { if (e.target === e.currentTarget) close(); }}>
    <div className="palette">
      <input ref={inp} className="inp" placeholder="어디로 갈까요? 캐릭터, 대화, 메뉴 이름…" value={q} onChange={e => { setQ(e.target.value); setSel(0); }}
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
