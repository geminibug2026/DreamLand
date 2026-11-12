// 장면 패널 "이 대화방의 모듈": 옛 f-modules.js 가 꽂아 둔 패널의 그리기만 React 로 바꿔 끼운다
import { useEffect, useState } from 'react';
import { L, mod } from '../legacy';
import { Btn, mountInto } from '../kit';
import type { Chat } from '../types';
import { Switch } from '../studio/bridge';
import { M, counts, needs, scopeLabel, type Module } from '../modules/lib';
import { pickItems } from '../modules/PickItems';

interface Panel { owner?: string; id?: string; render(chat: Chat, msgs?: unknown): Node }
interface HooksMod { X: { panels: Panel[] } }

const byName = (a: Module, b: Module) => a.name.localeCompare(b.name, 'ko');

function ModPanel({ chat }: { chat: Chat }) {
  const [ready, setReady] = useState(false), [, bump] = useState(0), draw = () => bump(n => n + 1);
  useEffect(() => { let alive = true; void M().load().then(() => { if (alive) setReady(true); }); return () => { alive = false; }; }, []);
  if (!ready) return null;
  const all = M().list;
  const flip = async (m: Module, v: boolean) => { await M().setRoom(m, chat, v); draw(); };
  const origin = (m: Module) => Object.hasOwn(m.rooms, chat.id) ? (m.rooms[chat.id] ? '이 방에서만 켬' : '이 방에서만 끔') : m.scope === 'global' ? '전역' : m.scope === 'char' ? '캐릭터' : '이 방';
  const row = (m: Module, isOn: boolean) => {
    const n = counts(m);
    return <div className={'mod-prow' + (isOn ? '' : ' off')} key={m.id}>
      <div className="mod-row-text"><b>{m.name}</b><small>{[origin(m), n.lore && `로어북 ${n.lore}`, n.regex && `정규식 ${n.regex}`, n.assets && `에셋 ${n.assets}`, n.quick && `버튼 ${n.quick}`, n.css && m.cssOn && 'CSS'].filter(Boolean).join(' · ')}</small></div>
      <Switch checked={isOn} title={`${m.name} — 이 방에서 켜기 · 끄기`} onChange={v => void flip(m, v)} /></div>;
  };
  const onHere = all.filter(m => M().effective(m, chat)).sort(byName);
  const offHere = all.filter(m => m.rooms[chat.id] === false).sort(byName);
  const rest = all.filter(m => !onHere.includes(m) && !offHere.includes(m));
  const turnOn = () => pickItems({ title: '이 방에서 켤 모듈', okLabel: '켜기', ph: '모듈 이름으로 찾기',
    items: [...rest].sort(byName).map(m => { const n = counts(m); return { id: m.id, ic: 'panel', title: m.name, sub: [`로어북 ${n.lore}`, `정규식 ${n.regex}`, `에셋 ${n.assets}`, m.on ? scopeLabel(m) : '꺼져 있음'].join(' · '), search: (m.name + ' ' + m.author + ' ' + m.description).toLowerCase() }; }),
    onDone: async sel => { for (const id of sel) { const m = M().byId(id); if (m) await M().setRoom(m, chat, true); } draw(); } });
  return <>
    {onHere.length || offHere.length ? <div className="mod-prows">{onHere.map(m => row(m, true))}{offHere.map(m => row(m, false))}</div> : <p className="dim">{all.length ? '이 방에 켜진 모듈이 없어요.' : '아직 모듈이 없어요.'}</p>}
    <div className="row wrap">{rest.length ? <Btn label="이 방에 모듈 켜기" ic="plus" cls="ghost" onClick={turnOn} /> : null}<Btn label="모듈 화면" ic="right" cls="ghost" onClick={() => L.ui.go('modules')} /></div>
  </>;
}

export const feature = {
  name: 'modules-panel', needs: [...needs, 'hooks'],
  setup() {
    const p = mod<HooksMod>('hooks').X.panels.find(x => x.owner === 'modules');
    if (!p) return;
    p.render = chat => { const box = document.createElement('div'); box.className = 'col mod-panel'; mountInto(box, <ModPanel chat={chat} />); return box; };
  },
};
