// 입력창 위 퀵 리플라이 버튼: 이 대화에서 켜진 세트의 버튼들. 세트가 여럿이면 세트마다 묶는다
// 오른쪽 클릭(휴대폰은 길게 누르기)하면 그 버튼에 이어 둔 세트의 버튼이 메뉴로 뜬다 (실리태번의 컨텍스트 메뉴)
import { useRef, useState, type MouseEvent, type PointerEvent } from 'react';
import { useEvents } from '../kit';
import { menu, type MenuItem } from '../ui';
import { go } from '../lib/router';
import { qrActive, qrSave, qrStore, type QrItem, type QrSet } from '../lib/qr-data';
import type { Chat } from '../lib/types';
import { t } from '../i18n';
import { qrContextMenu, runItem } from './host';

export function QrBar({ chat }: { chat: Chat }) {
  useEvents('qr:changed', 'chat:open');
  const [busy, setBusy] = useState('');
  const hold = useRef<{ timer: number; fired: boolean }>({ timer: 0, fired: false });
  if (!qrStore().bar) return null;
  const sets = qrActive(chat).filter(s => s.items.some(i => !i.hidden));
  if (!sets.length) return null;
  const press = async (id: string, fn: () => Promise<unknown>) => { if (busy) return; setBusy(id); try { await fn(); } finally { setBusy(''); } };
  const hasCtx = (i: QrItem) => (i.contextList || []).some(c => qrStore().sets.some(s => s.name === c.set));
  const openCtx = (el: Element, i: QrItem, s: QrSet) => {
    const nodes = qrContextMenu(i, s); if (!nodes.length) return;
    const items: MenuItem[] = nodes.map(n => n.header
      ? { label: '— ' + n.label, ic: 'folder', hint: '', onclick: () => { } }
      : { label: '  '.repeat(n.depth) + n.label, ic: 'play', hint: n.title.slice(0, 60), onclick: () => { if (n.run) void press(i.id, n.run); } });
    menu(el, items);
  };
  const many = sets.length > 1;
  return <>{sets.map((s: QrSet) => <span className="qr-set" key={s.id} title={many ? s.name : undefined}>
    {s.items.filter(i => !i.hidden).map(i => <button key={i.id} type="button" className={'chip qr-chip' + (busy === i.id ? ' busy' : '') + (hasCtx(i) ? ' has-ctx' : '')} title={i.title || i.text.slice(0, 200)}
      disabled={!!busy && busy !== i.id}
      onClick={() => { if (hold.current.fired) { hold.current.fired = false; return; } void press(i.id, () => runItem(i, { set: s })); }}
      onContextMenu={(e: MouseEvent<HTMLButtonElement>) => { if (!hasCtx(i)) return; e.preventDefault(); openCtx(e.currentTarget, i, s); }}
      onPointerDown={(e: PointerEvent<HTMLButtonElement>) => { if (e.pointerType !== 'touch' || !hasCtx(i)) return; const el = e.currentTarget; hold.current.fired = false; clearTimeout(hold.current.timer); hold.current.timer = window.setTimeout(() => { hold.current.fired = true; openCtx(el, i, s); }, 500); }}
      onPointerUp={() => clearTimeout(hold.current.timer)} onPointerLeave={() => clearTimeout(hold.current.timer)}
    >{i.stIcon && i.showLabel === false ? null : i.label}{i.stIcon && i.showLabel === false ? <span className="qr-ic-text">{i.label}</span> : null}</button>)}
  </span>)}
    <button type="button" className="chip ghost qr-more" title={t('qr.bar.manage')} onClick={e => menu(e.currentTarget, [
      { label: t('qr.bar.manage'), ic: 'sliders', onclick: () => go('qr') },
      { label: t('qr.bar.hide'), ic: 'eye', onclick: () => { qrStore().bar = false; qrSave(); } },
    ])}>⋯</button></>;
}
