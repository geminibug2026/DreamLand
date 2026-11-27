// 내 휴대폰: 이야기 속 내 전화기 (연락처는 캐릭터들). 여기서는 여는 길만 꽂는다 — 대화 ⋯ 메뉴 한 줄과 'phone:open' 알림 하나.
// 몸체(src/phone)와 모양(css/phone.css)은 처음 열 때 받고, 닫으면 통째로 내린다 (닫혀 있는 동안 도는 것 없음)
import type { FeatureDef } from '../main';
import { on } from '../lib/core';
import { mountInto } from '../kit';
import { loadCss } from '../addons/parts';
import { lazyComp } from '../lib/lazy';
import { chatMenuExtras } from '../chat/menus';
import type { Chat } from '../lib/types';
import { t } from '../i18n';

const Phone = lazyComp(() => import('../phone/Phone').then(m => m.Phone));
const OWNER = 'phone';
let host: HTMLDivElement | null = null, off: (() => void) | null = null, opening = false;

/** 코드와 모양을 미리 받아 둔다 (여는 단추에 손가락이 닿을 때) */
const warm = () => { void Phone.preload(); void loadCss('phone.css'); };
/** 연다. chat: 연 자리의 대화 (그 방의 이야기 시계를 따른다). 이미 열려 있으면 그대로 */
async function open(chat?: Chat | null) {
  if (host || opening) return; opening = true;
  try { await Promise.all([loadCss('phone.css'), Phone.preload()]); } finally { opening = false; }
  if (host) return;
  host = document.createElement('div'); host.className = 'pn-host'; document.body.append(host);
  off = mountInto(host, <Phone chat={chat || null} onGone={gone} />);
}
/** 닫는 몸짓이 끝났다: 내리고 자리를 치운다 (React 가 그리는 도중에 내리지 않게 한 박자 뒤에) */
function gone() { const h = host, f = off; host = null; off = null; setTimeout(() => { f?.(); h?.remove(); }, 0); }

function setup() {
  on<Chat | null | undefined>('phone:open', c => void open(c));
  on('phone:warm', warm);
  const at = chatMenuExtras.findIndex(f => (f as { owner?: string }).owner === OWNER); if (at >= 0) chatMenuExtras.splice(at, 1);
  chatMenuExtras.push(Object.assign((c: Chat) => [{ label: t('phone.open'), ic: 'device', hint: t('phone.openHint'), onclick: () => void open(c) }], { owner: OWNER }));
}

export const feature: FeatureDef = { name: 'phone', setup };
