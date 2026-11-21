// 성좌 도감이 앱에 꽂는 것들: 사건을 듣고 별 켜기 · 구석 카드 · 대화 서랍 패널 · 프롬프트 한 줄(기본 꺼짐) · 매크로 {{stars}} {{constellations}} · /atlas
import { createRoot } from 'react-dom/client';
import type { FeatureDef } from '../main';
import type { Chat } from '../lib/types';
import { on } from '../lib/core';
import { X } from '../lib/hooks';
import { I } from '../lib/icons';
import { go } from '../lib/router';
import { chatApi } from '../chat/actions';
import { inCall } from '../call/logic';
import { reactNode, useCss } from '../addons/parts';
import { t } from '../i18n';
import { boot, cfg, doneCount, factOf, freshFor, litCount, load, poke, spend, wire } from '../atlas/logic';
import { Cards, PersonPanel } from '../atlas/ui';
import type { Fresh } from '../atlas/types';

const OWNER = 'atlas';
// 아이콘: 선으로 이은 별 셋 (24 격자 한 줄 path)
if (!I.atlas) I.atlas = 'M5 17.5l5.2-8.6M12.8 8.2l5 6.3M4 20a1.3 1.3 0 1 0 0-.01M11.5 6.5a1.3 1.3 0 1 0 0-.01M19 16.8a1.3 1.3 0 1 0 0-.01M18 4v3M16.5 5.5h3';

/** 사건이 일어난 방. 지금 열려 있는 방이면 화면에 있는 메시지를 그대로 센다 (저장을 기다리지 않게) */
function hit(a: unknown) {
  const chat = (a && typeof a === 'object' && 'chat' in a ? (a as { chat?: Chat }).chat : a as Chat | null) || null; if (!chat?.id) return poke();
  const cur = chatApi.current(); poke(chat, cur.chat?.id === chat.id ? cur.msgs : undefined);
}

async function setup() {
  useCss('atlas.css');
  await load(); wire();
  if (!document.getElementById('at-toasts')) { const el = document.createElement('div'); el.id = 'at-toasts'; document.body.append(el); createRoot(el).render(<Cards />); }

  for (const ev of ['message:sent', 'generate:end', 'chat:new', 'chat:open', 'scene:close', 'call:end', 'checkpoints:changed', 'almanac:changed', 'message:swiped']) on(ev, hit);
  // 캐릭터 · 페르소나 · 로어북이 늘면 수집가의 별만 본다 (방을 다시 훑지 않는다)
  for (const ev of ['chars', 'personas', 'lore']) on(ev, () => poke());
  // 첫 화면을 그린 뒤 한가할 때 한 번 전부 대 본다
  setTimeout(() => void boot().catch(e => console.warn('[성좌 도감]', e)), 1500);

  // 캐릭터가 최근 켜진 별을 한 번 말할 수 있게: 사실 한 줄을 끝에 싣고, 답을 받으면 지운다. 모델 호출은 늘지 않는다
  const sent = new Map<string, Fresh>();
  X.prompt = X.prompt.filter(p => p.owner !== OWNER);
  X.prompt.push({ owner: OWNER, fn: info => {
    const chat = info.chat as Chat; if (!cfg().tell || info.type === 'impersonate' || inCall(chat)) return [];
    const f = freshFor(chat), fact = f ? factOf(f) : ''; if (!f || !fact) return [];
    if (info.commit !== false) sent.set(chat.id, f);
    return [{ where: 'end', content: `[Quiet milestone — for {{char}}'s awareness only] ${fact} {{char}} may let this show once, lightly and in their own way, if the moment allows; never as a notice, a count or an achievement. If it does not fit, leave it unsaid.`, src: t('atlas.title') }];
  } });
  on<{ chat?: Chat }>('message:received', a => { const id = a?.chat?.id, f = id ? sent.get(id) : null; if (id && f) { sent.delete(id); spend(f); } });

  X.macros.set('stars', { owner: OWNER, fn: () => String(litCount()) });
  X.macros.set('constellations', { owner: OWNER, fn: () => String(doneCount()) });
  X.panels = X.panels.filter(p => p.owner !== OWNER);
  X.panels.push({ owner: OWNER, id: 'atlas', get title() { return t('atlas.panel'); }, icon: 'atlas', render: chat => reactNode('atlas-panel', 'div.col', <PersonPanel chat={chat} />) });
  X.commands.set('/atlas', { owner: OWNER, get help() { return t('atlas.cmd'); }, run: () => go('atlas') });
}
export const feature: FeatureDef = { name: 'atlas', setup };
