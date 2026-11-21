// 물음(판정문) · 매크로 보강 · 깨어난 설정: 엔진에 꽂는 자리와 화면 들머리만 등록한다 (계산은 src/gate · src/lore). 물음은 기본 꺼짐 — 켜면 물음이 있는 턴마다 호출 1번
import type { FeatureDef } from '../main';
import type { Chat } from '../lib/types';
import { on } from '../lib/core';
import { X } from '../lib/hooks';
import { I } from '../lib/icons';
import { reactNode, useCss } from '../addons/parts';
import { t } from '../i18n';
import { MACROS, OWNER, endLive, hook, noteGen, offSeen, prepare, setAskingText } from '../gate/logic';
import { GatePane, GatePanel, askDiag, macroDict } from '../gate/ui';
import { loreAwake } from '../lore/diag';

if (!I.ask) I.ask = 'M12 3a9 9 0 1 0 0 18a9 9 0 0 0 0-18M9.6 9.7a2.5 2.5 0 1 1 3.7 2.2c-.8.4-1.3 1-1.3 1.9M12 16.7v.1';

function setup() {
  useCss('gate.css');
  X.gate = hook;
  for (const [name, fn] of Object.entries(MACROS)) X.macros.set(name, { owner: OWNER, fn });
  setAskingText(() => t('gate.status'));
  X.before = X.before.filter(b => b.owner !== OWNER);
  X.before.push({ owner: OWNER, fn: async a => { try { await prepare(a); } catch (e) { console.warn('[물음]', e); } } });   // 실패해도 답변은 나간다 (물음은 닫힌 채로)
  on<{ chat?: Chat; type?: string }>('generate:end', d => { endLive(); if (d?.chat) noteGen(d.chat.id, d.type || 'normal'); });
  on('chat:open', endLive);
  on('chat:deleted', id => { offSeen.delete(String(id)); });

  X.panels = X.panels.filter(p => p.owner !== OWNER);
  X.panels.push({ owner: OWNER, id: 'gate', get title() { return t('gate.title'); }, icon: 'ask', render: chat => reactNode('gate-panel', 'div.col', <GatePanel chat={chat} />) });
  X.studio = X.studio.filter(s => s.owner !== OWNER);
  X.studio.push({ owner: OWNER, get title() { return t('gate.title'); }, render: () => reactNode('gate-studio', 'div.card.gt-card', <GatePane />) });

  X.commands.set('/macros', { owner: OWNER, get help() { return t('gate.cmd.macros'); }, run: () => macroDict() });
  X.commands.set('/asks', { owner: OWNER, get help() { return t('gate.cmd.asks'); }, run: (_a, api) => askDiag(api.current().chat) });
  X.commands.set('/lore-awake', { owner: OWNER, get help() { return t('gate.cmd.awake'); }, run: (_a, api) => loreAwake(api.current().chat) });
  // 다른 화면(인스펙터 · 서랍의 로어북 칸)이 알림으로 창을 연다
  on<Chat>('gate:diag', c => askDiag(c || undefined));
  on<Chat>('lore:awake', c => loreAwake(c || undefined));
}

export const feature: FeatureDef = { name: 'gate', setup };
