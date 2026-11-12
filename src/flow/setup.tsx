// 흐름 기능 켜기 (옛 js/f-flow.js 의 등록부). **아직 켜지 않는다** — 옛 판도 FEATURES 에 넣지 않은 미완성 기능이다.
// 켜려면 src/features/flow.tsx 를 만들어 `export { flowFeature as feature } from '../flow/setup';` 한 줄을 둔다.
import type { FeatureDef } from '../main';
import { B, NEEDS, useCss } from '../addons/legacy';
import { reactNode } from '../addons/parts';
import { cur, directOn, setDirect, wire } from './logic';
import { AutoPanel, CheckpointPanel, ProfilePanel, askRegen, checkpointAction } from './panels';

function setup() {
  const X = B.X, toast = B.ui.toast;
  useCss('quick.css');
  wire();

  X.actions = X.actions.filter(a => a.owner !== 'flow'); X.composer = X.composer.filter(a => a.owner !== 'flow');
  X.actions.push({ owner: 'flow', id: 'flow-regen-why', label: '이유를 적어 다시 생성', icon: 'refresh', run: msg => { const { msgs } = cur(); if (msgs[msgs.length - 1] !== msg || msg.role !== 'assistant') return toast('마지막 답변에서만 쓸 수 있어요'); askRegen(); } });
  X.composer.push({ owner: 'flow', id: 'flow-regen-why', label: '이유를 적어 다시 생성', icon: 'refresh', run: () => askRegen() });
  // "다시 생성" 버튼을 누를 때마다 묻기 (설정에서 켠 경우). Shift 를 누른 채 누르면 묻지 않는다
  document.addEventListener('click', e => {
    if (!(B.S.settings.regenWhy as { ask?: boolean } | undefined)?.ask || e.shiftKey) return;
    const b = (e.target as Element | null)?.closest?.<HTMLElement>('.msg-tools .ibtn'); if (!b || cur().busy) return;
    if (b.title !== '다시 생성' && b.title !== '새 답변 생성') return;
    e.stopPropagation(); e.preventDefault(); askRegen();
  }, true);

  X.composer.push({ owner: 'flow', id: 'flow-direct', get label() { return directOn(cur().chat) ? '연출 지시 모드 끄기' : '연출 지시 모드 켜기'; }, icon: 'feather', run: async () => { const v = await setDirect(cur().chat, 'toggle'); toast(v ? '연출 지시 모드 — 보내는 글이 대사가 아니라 지시로 전달돼요' : '연출 지시 모드를 껐어요'); } });
  X.actions.push({ owner: 'flow', id: 'flow-checkpoint', label: '체크포인트 남기기 · 고치기', icon: 'star', run: checkpointAction });

  X.panels = X.panels.filter(p => p.owner !== 'flow');
  X.panels.push(
    { owner: 'flow', id: 'flow-cp', title: '체크포인트', icon: 'star', render: (chat, msgs) => reactNode('flow-cp', 'div.col.cp-panel', <CheckpointPanel chat={chat} msgs={msgs} />) },
    { owner: 'flow', id: 'flow-profile', title: '연결 프로필', icon: 'plug', render: chat => reactNode('flow-profile', 'div.col.flow-panel', <ProfilePanel chat={chat} />) },
    { owner: 'flow', id: 'flow-auto', title: '자동 진행 · 연출', icon: 'play', render: chat => reactNode('flow-auto', 'div.col', <AutoPanel chat={chat} />) });
}

export const flowFeature: FeatureDef = { name: 'flow', needs: [...NEEDS, 'advanced'], setup };
