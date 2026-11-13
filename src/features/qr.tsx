// 퀵 리플라이 자동 실행: 앱을 열 때 · 대화를 열 때 · 새 대화 · 내가 보낸 뒤 · 답을 받은 뒤 · 생성 직전
// (실리태번 퀵 리플라이의 executeOn… 과 같다). 같은 일로 다시 불리는 고리를 막으려고 한 번에 하나씩만 돈다
import type { FeatureDef } from '../main';
import { on } from '../lib/core';
import { X } from '../lib/hooks';
import { useCss } from '../addons/parts';
import { qrActive, qrStore, type QrAuto, type QrItem } from '../lib/qr-data';
import { chatApi } from '../chat/actions';
import type { Chat } from '../lib/types';
import { runItem } from '../stscript/host';

const OWNER = 'qr';
let running = 0;
/** 이 대화(없으면 전역)에서 켜진 세트 가운데 when 에 맞는 버튼을 차례로 돈다 */
async function fire(when: keyof QrAuto, chat?: Chat | null) {
  if (running) return;   // 자동 실행이 또 자동 실행을 부르지 않게
  const items: QrItem[] = (chat ? qrActive(chat) : qrStore().sets.filter(s => s.on !== false && s.scope === 'global')).flatMap(s => s.items.filter(i => i.auto?.[when]));
  if (!items.length) return;
  running++;
  try { for (const it of items) await runItem(it, { auto: true }); }
  finally { running--; }
}

function setup() {
  useCss('qr.css');
  X.before = X.before.filter(b => b.owner !== OWNER);
  X.before.push({ owner: OWNER, fn: async ({ chat }) => { await fire('gen', chat); } });
  on('ready', () => void fire('start', chatApi.current().chat));
  on<Chat>('chat:open', chat => void fire('open', chat));
  on<Chat>('chat:new', chat => void fire('newChat', chat));
  on<{ chat: Chat }>('message:sent', d => void fire('user', d.chat));
  on<{ chat: Chat }>('message:received', d => void fire('ai', d.chat));
}

export const feature: FeatureDef = { name: 'qr', setup };
