// 읽어 주기(TTS): 구현을 끼우고(src/tts/engine) · 기능 화면 탭 · 새 답변 자동 읽기
import type { FeatureDef } from '../main';
import { reactNode, useCss } from '../addons/parts';
import { X } from '../lib/hooks';
import { msgText, on } from '../lib/core';
import type { Chat, Msg } from '../lib/types';
import { cur } from '../chat/store';
import { TTS } from '../tts/api';
import '../tts/providers';
import '../tts/engine';
import { cfg } from '../tts/config';
import { TtsStudio } from '../tts/ui';

function setup() {
  useCss('tts.css');
  X.studio = X.studio.filter(s => s.owner !== 'tts');
  X.studio.push({ owner: 'tts', title: '읽어 주기', render: () => reactNode('tts-studio', 'div.tts', <TtsStudio />) });
  // 새 답변 자동 읽기 (보고 있는 방의 답변만)
  on<{ msg: Msg; chat: Chat }>('message:received', ({ msg, chat }) => {
    const c = cfg(); if (!c.on || !c.autoRead || !msg || msg.role !== 'assistant' || cur.chat?.id !== chat?.id || document.hidden) return;
    void TTS.speak(msgText(msg), { charId: msg.charId }).catch(e => console.warn('[TTS]', e));
  });
}

export const feature: FeatureDef = { name: 'tts', setup };
