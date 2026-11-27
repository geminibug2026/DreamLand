// 읽어 주기(TTS): 구현을 끼우고(src/tts/engine) · 기능 화면 탭 · 새 답변 자동 읽기 · 목소리 연기 표시(프롬프트 조각 · 표시 떼기)
import type { FeatureDef } from '../main';
import { reactNode, useCss } from '../addons/parts';
import { X } from '../lib/hooks';
import { on } from '../lib/core';
import type { Chat, Msg } from '../lib/types';
import { cur } from '../chat/store';
import '../tts/providers';
import '../tts/engine';
import { cfg } from '../tts/config';
import { lazyComp } from '../lib/lazy';
const TtsStudio = lazyComp(() => import('../tts/ui').then(m => m.TtsStudio));   // 읽어 주기 설정 화면은 처음 열 때 받는다
import { mountDock, readMsg } from '../tts/Dock';
import { setupStage } from '../tts/stage';
import { t } from '../i18n';

function setup() {
  useCss('tts.css');
  mountDock();
  setupStage();
  X.studio = X.studio.filter(s => s.owner !== 'tts');
  X.studio.push({ owner: 'tts', title: '읽어 주기', preload: () => TtsStudio.preload(), render: () => reactNode('tts-studio', 'div.tts', <TtsStudio />) });
  // 메시지 ⋯ › 소리 파일로 저장: 목소리 연기 그대로 한 파일로 (읽어 주기를 켜 두었을 때만 보인다)
  X.actions = X.actions.filter(a => a.owner !== 'tts');
  X.actions.push({ owner: 'tts', id: 'tts-save', get label() { return t('tts.save.act'); }, icon: 'volume', when: (m: Msg) => cfg().on && m.role === 'assistant', run: (m, chat) => void import('../tts/save').then(x => x.saveMsgAudio(m, chat)) });
  // 새 답변 자동 읽기 (보고 있는 방의 답변만)
  on<{ msg: Msg; chat: Chat }>('message:received', ({ msg, chat }) => {
    const c = cfg(); if (!c.on || !c.autoRead || !msg || msg.role !== 'assistant' || cur.chat?.id !== chat?.id || document.hidden) return;
    void readMsg(msg, { chat, queue: true }).catch(e => console.warn('[TTS]', e));
  });
}

export const feature: FeatureDef = { name: 'tts', setup };
