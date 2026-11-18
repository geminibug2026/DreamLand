// 장면 패널 "이 대화방의 모듈": features/modulesHooks.tsx 가 꽂아 둔 자리의 그리기를 React 로 채운다
import { useEffect, useState } from 'react';
import { Btn, mountInto } from '../kit';
import type { Chat } from '../types';
import { Modules, counts, scopeLabel, type Module } from '../modules/lib';
import { pickItems } from '../modules/PickItems';
import { go } from '../lib/router';
import { X } from '../lib/hooks';
import { Switch } from '../studio/parts';
import { t } from '../i18n';

const byName = (a: Module, b: Module) => a.name.localeCompare(b.name, 'ko');

function ModPanel({ chat }: { chat: Chat }) {
  const [ready, setReady] = useState(false), [, bump] = useState(0), draw = () => bump(n => n + 1);
  useEffect(() => { let alive = true; void Modules.load().then(() => { if (alive) setReady(true); }); return () => { alive = false; }; }, []);
  if (!ready) return null;
  const all = Modules.list;
  const flip = async (m: Module, v: boolean) => { await Modules.setRoom(m, chat, v); draw(); };
  const origin = (m: Module) => Object.hasOwn(m.rooms, chat.id) ? (m.rooms[chat.id] ? t('modules.panel.onHereOnly') : t('modules.panel.offHereOnly')) : m.scope === 'global' ? t('modules.scope.global') : m.scope === 'char' ? t('modules.scope.char') : t('modules.panel.thisRoom');
  const row = (m: Module, isOn: boolean) => {
    const n = counts(m);
    return <div className={'mod-prow' + (isOn ? '' : ' off')} key={m.id}>
      <div className="mod-row-text"><b>{m.name}</b><small>{[origin(m), n.lore && t('modules.count.lore', { n: n.lore }), n.regex && t('modules.count.regex', { n: n.regex }), n.assets && t('modules.count.assets', { n: n.assets }), n.quick && t('modules.count.quick', { n: n.quick }), n.css && m.cssOn && 'CSS'].filter(Boolean).join(' · ')}</small></div>
      <Switch checked={isOn} title={t('modules.panel.toggleTitle', { name: m.name })} onChange={v => void flip(m, v)} /></div>;
  };
  const onHere = all.filter(m => Modules.effective(m, chat)).sort(byName);
  const offHere = all.filter(m => m.rooms[chat.id] === false).sort(byName);
  const rest = all.filter(m => !onHere.includes(m) && !offHere.includes(m));
  const turnOn = () => pickItems({ title: t('modules.panel.pickTitle'), okLabel: t('modules.panel.pickOk'), ph: t('modules.panel.pickPh'),
    items: [...rest].sort(byName).map(m => { const n = counts(m); return { id: m.id, ic: 'panel', title: m.name, sub: [t('modules.count.lore', { n: n.lore }), t('modules.count.regex', { n: n.regex }), t('modules.count.assets', { n: n.assets }), m.on ? scopeLabel(m) : t('modules.panel.isOff')].join(' · '), search: (m.name + ' ' + m.author + ' ' + m.description).toLowerCase() }; }),
    onDone: async sel => { for (const id of sel) { const m = Modules.byId(id); if (m) await Modules.setRoom(m, chat, true); } draw(); } });
  return <>
    {onHere.length || offHere.length ? <div className="mod-prows">{onHere.map(m => row(m, true))}{offHere.map(m => row(m, false))}</div> : <p className="dim">{all.length ? t('modules.panel.noneHere') : t('modules.panel.noneYet')}</p>}
    <div className="row wrap">{rest.length ? <Btn label={t('modules.panel.turnOn')} ic="plus" cls="ghost" onClick={turnOn} /> : null}<Btn label={t('modules.panel.openPage')} ic="right" cls="ghost" onClick={() => go('modules')} /></div>
  </>;
}

export const feature = {
  name: 'modules-panel',
  setup() {
    const p = X.panels.find(x => x.owner === 'modules');
    if (!p) return;
    p.render = chat => { const box = document.createElement('div'); box.className = 'col mod-panel'; mountInto(box, <ModPanel chat={chat} />); return box; };
  },
};
