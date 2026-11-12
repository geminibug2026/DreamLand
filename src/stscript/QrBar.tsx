// 입력창 위 퀵 리플라이 단추: 이 대화에서 켜진 세트의 단추들. 세트가 여럿이면 세트 이름으로 묶는다
import { useState } from 'react';
import { useEvents } from '../kit';
import { menu } from '../ui';
import { go } from '../lib/router';
import { qrActive, qrStore, type QrSet } from '../lib/qr-data';
import type { Chat } from '../lib/types';
import { t } from '../i18n';
import { runItem } from './host';

export function QrBar({ chat }: { chat: Chat }) {
  useEvents('qr:changed', 'chat:open');
  const [busy, setBusy] = useState('');
  if (!qrStore().bar) return null;
  const sets = qrActive(chat).filter(s => s.items.some(i => !i.hidden));
  if (!sets.length) return null;
  const press = async (id: string, fn: () => Promise<unknown>) => { if (busy) return; setBusy(id); try { await fn(); } finally { setBusy(''); } };
  const many = sets.length > 1;
  return <>{sets.map((s: QrSet) => <span className="qr-set" key={s.id} title={many ? s.name : undefined}>
    {s.items.filter(i => !i.hidden).map(i => <button key={i.id} type="button" className={'chip qr-chip' + (busy === i.id ? ' busy' : '')} title={i.title || i.text.slice(0, 200)}
      disabled={!!busy && busy !== i.id} onClick={() => void press(i.id, () => runItem(i))}>{i.stIcon ? <i className={'qr-ic ' + i.stIcon} /> : null}{i.label}</button>)}
  </span>)}
    <button type="button" className="chip ghost qr-more" title={t('qr.bar.manage')} onClick={e => menu(e.currentTarget, [
      { label: t('qr.bar.manage'), ic: 'sliders', onclick: () => go('qr') },
      { label: t('qr.bar.hide'), ic: 'eye', onclick: () => { qrStore().bar = false; void import('../lib/qr-data').then(m => m.qrSave()); } },
    ])}>⋯</button></>;
}
