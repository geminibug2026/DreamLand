// 흐름 기능 켜기 (옛 js/f-flow.js 의 등록부). src/features/flow.tsx 가 이것을 feature 로 내보낸다.
import type { FeatureDef } from '../main';
import { useCss } from '../addons/parts';
import { reactNode } from '../addons/parts';
import { cur, directOn, regenWith, sendDirection, setDirect, wire } from './logic';
import { AutoPanel, CheckpointPanel, ProfilePanel, askRegen, checkpointAction } from './panels';
import { toast } from '../ui';
import { S } from '../lib/core';
import { X } from '../lib/hooks';
import { t } from '../i18n';

let wired = false;
/** 대화 화면의 "다시 생성" · 마지막 답변의 "새 답변 생성" 버튼인가 (지금 언어의 같은 키로 비교한다) */
const isRegenButton = (b: HTMLElement) => { const ti = b.title; return !!ti && (ti === t('chat.msg.regen') || ti === t('chat.msg.newSwipe')); };

function setup() {
  useCss('quick.css');
  if (!wired) {
    wired = true; wire();
    // "다시 생성" 버튼을 누를 때마다 묻기 (설정에서 켠 경우). Shift 를 누른 채 누르면 묻지 않는다
    document.addEventListener('click', e => {
      if (!(S.settings.regenWhy as { ask?: boolean } | undefined)?.ask || e.shiftKey) return;
      const b = (e.target as Element | null)?.closest?.<HTMLElement>('.msg-tools .ibtn'); if (!b || cur().busy || !isRegenButton(b)) return;
      e.stopPropagation(); e.preventDefault(); askRegen();
    }, true);
  }

  X.actions = X.actions.filter(a => a.owner !== 'flow'); X.composer = X.composer.filter(a => a.owner !== 'flow');
  X.actions.push({ owner: 'flow', id: 'flow-regen-why', get label() { return t('flow.regen.menu'); }, icon: 'refresh', run: msg => { const { msgs } = cur(); if (msgs[msgs.length - 1] !== msg || msg.role !== 'assistant') return toast(t('flow.regen.lastOnly')); askRegen(); } });
  X.composer.push({ owner: 'flow', id: 'flow-regen-why', get label() { return t('flow.regen.menu'); }, icon: 'refresh', run: () => askRegen() });
  X.composer.push({ owner: 'flow', id: 'flow-direct', get label() { return directOn(cur().chat) ? t('flow.direct.turnOff') : t('flow.direct.turnOn'); }, icon: 'feather', run: async () => { const v = await setDirect(cur().chat, 'toggle'); toast(v ? t('flow.direct.onToast') : t('flow.direct.offToast')); } });
  X.actions.push({ owner: 'flow', id: 'flow-checkpoint', get label() { return t('flow.cp.action'); }, icon: 'star', run: (msg, chat) => { if (chat) void checkpointAction(msg, chat); } });

  // 명령: /direct 지시 — 지시로 보내기 (글이 없으면 연출 지시 모드 켜고 끄기), /regen-why 이유 — 이유를 적어 다시 생성
  for (const k of [...X.commands.keys()]) if (X.commands.get(k)?.owner === 'flow') X.commands.delete(k);
  X.commands.set('/direct', { owner: 'flow', get args() { return t('flow.cmd.directArgs'); }, get help() { return t('flow.cmd.direct'); }, run: async arg => {
    if (arg.trim()) return sendDirection(arg.trim());
    const v = await setDirect(cur().chat, 'toggle'); toast(v ? t('flow.direct.onToast') : t('flow.direct.offToast'));
  } });
  X.commands.set('/regen-why', { owner: 'flow', get args() { return t('flow.cmd.regenArgs'); }, get help() { return t('flow.cmd.regen'); }, run: arg => arg.trim() ? regenWith(arg.trim()) : askRegen() });

  X.panels = X.panels.filter(p => p.owner !== 'flow');
  X.panels.push(
    { owner: 'flow', id: 'flow-cp', get title() { return t('flow.cp.panel'); }, icon: 'star', render: (chat, msgs) => reactNode('flow-cp', 'div.col.cp-panel', <CheckpointPanel chat={chat} msgs={msgs} />) },
    { owner: 'flow', id: 'flow-profile', get title() { return t('flow.prof.title'); }, icon: 'plug', render: chat => reactNode('flow-profile', 'div.col.flow-panel', <ProfilePanel chat={chat} />) },
    { owner: 'flow', id: 'flow-auto', get title() { return t('flow.auto.panel'); }, icon: 'play', render: chat => reactNode('flow-auto', 'div.col', <AutoPanel chat={chat} />) });
}

export const flowFeature: FeatureDef = { name: 'flow', setup };
