// 전화: /call 명령 · 입력창 + 메뉴 · 통화 화면 · 프롬프트 조각(통화 중 말투 · 끊김 인지) · 캐릭터가 먼저 거는 계획 · 기능 화면 › 전화
import type { FeatureDef } from '../main';
import type { Chat, Msg } from '../lib/types';
import { reactNode, useCss } from '../addons/parts';
import { X } from '../lib/hooks';
import { on } from '../lib/core';
import { cur } from '../chat/store';
import { mountPhone } from '../call/Phone';
import { CallStudio } from '../call/Studio';
import { tt } from '../call/strings';
import * as C from '../call/logic';

function setup() {
  useCss('call.css');
  mountPhone();
  // /call 은 실리태번 STscript 의 /run 별칭이라 그대로 두고(호환), 전화는 /phone 으로. "/phone ring" 은 캐릭터가 지금 거는 것
  X.commands.set('/phone', {
    owner: 'call', args: '[ring]', get help() { return tt('call.cmd.help'); },
    run: arg => { const a = arg.trim().toLowerCase(); if (a === 'ring' || a === 'in') C.ring(cur.chat); else C.dial(cur.chat); },
  });
  X.composer.push({ owner: 'call', id: 'call', get label() { return tt('call.btn'); }, icon: 'phone', run: () => C.dial(cur.chat) });
  X.prompt.push({ owner: 'call', fn: info => C.promptPieces(info.chat) });
  // 대화 화면 위 전화 단추 (Top.tsx 가 보낸다)
  on<Chat>('call:dial', chat => C.dial(chat || cur.chat));
  // 캐릭터가 답하면 "다음 대화에서 알아차릴 일"은 끝
  on<{ msg: Msg; chat: Chat }>('message:received', d => { if (d?.chat && d.msg?.role === 'assistant') C.clearPending(d.chat); });
  setInterval(C.tick, 60000);
  X.studio = X.studio.filter(s => s.owner !== 'call');
  X.studio.push({ owner: 'call', get title() { return tt('call.studio.title'); }, render: () => reactNode('call-studio', 'div.call-studio-root', <CallStudio />) });
}

export const feature: FeatureDef = { name: 'call', setup };
