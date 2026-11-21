// 빠른 시작: 자주 이야기한 캐릭터 다섯의 초상과, 새 대화를 어떤 모드로 열지
import { useState } from 'react';
import { S } from '../../lib/core';
import type { Char } from '../../lib/types';
import { startChat } from '../../chat/start';
import { t } from '../../i18n';
import { ArchEmpty } from '../art';
import { cfg } from '../registry';
import { None, Port } from '../parts';

type Mode = 'rp' | 'talk' | 'temp';
const MODES: [Mode, () => string][] = [['rp', () => t('chat.start.rp')], ['talk', () => t('chat.start.talk')], ['temp', () => t('chat.start.temp')]];
/** 메시지를 많이 주고받은 순서 (같으면 최근에 만난 순) */
export function regulars(n = 5): Char[] {
  const score = new Map<string, number>(); for (const c of S.chats) if (!c.temp) for (const id of c.charIds) score.set(id, (score.get(id) || 0) + (c.count || 0) + 1);
  return [...S.chars].filter(c => score.has(c.id)).sort((a, b) => score.get(b.id)! - score.get(a.id)!).concat(S.chars.filter(c => !score.has(c.id))).slice(0, n);
}

export function Quick() {
  const [, bump] = useState(0), c = cfg(), mode: Mode = c.mode || (S.settings.defaultMode === 'talk' ? 'talk' : 'rp'), list = regulars();
  if (!list.length) return <None art={<ArchEmpty />} text={t('desk.bond.none')} />;
  return <div className="dk-quick">
    <div className="dk-seg" role="radiogroup" aria-label={t('desk.quick.mode')}>{MODES.map(([k, l]) => <button key={k} role="radio" aria-checked={mode === k} className={mode === k ? 'on' : undefined} onClick={() => { c.mode = k; S.set({ desk: c }); bump(x => x + 1); }}>{l()}</button>)}</div>
    <ul className="dk-faces">{list.map(ch => <li key={ch.id}><button className="fx-tap" onClick={() => void startChat([ch.id], mode === 'temp' ? { temp: true } : { mode })} aria-label={t('desk.quick.start', { name: ch.name })}><Port c={ch} cls="round" /><span>{ch.name}</span></button></li>)}</ul>
  </div>;
}
