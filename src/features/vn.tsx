// 비주얼 노벨 화면을 켜고 끄는 곳: 입력창 + 메뉴 · /vn 명령. 켜 둔 방은 다시 열 때도 그 화면으로 열린다
import type { FeatureDef } from '../main';
import type { Chat } from '../lib/types';
import { S, on } from '../lib/core';
import { X } from '../lib/hooks';
import { chatApi } from '../chat/actions';
import { toast } from '../ui';
import { t } from '../i18n';
import { closeVn, openVn, vnOpenFor } from '../vn/Screen';

const OWNER = 'vn';
type VnChat = Chat & { vn?: boolean };
const setFlag = (chat: VnChat, v: boolean) => { if (!!chat.vn === v) return; if (v) chat.vn = true; else delete chat.vn; void S.save('chats', chat, true); };
function show(chat: VnChat) { setFlag(chat, true); openVn(chat.id, () => { const c = S.chats.find(x => x.id === chat.id) as VnChat | undefined; if (c) setFlag(c, false); closeVn(); }); }
export function toggleVn() {
  const chat = chatApi.current().chat as VnChat | null; if (!chat) return toast(t('vn.noChat'), 'err');
  if (vnOpenFor() === chat.id) { setFlag(chat, false); closeVn(); } else show(chat);
}

function setup() {
  on<Chat>('chat:open', chat => { if ((chat as VnChat).vn) show(chat); else closeVn(); });
  X.composer = X.composer.filter(c => c.owner !== OWNER);
  X.composer.push({ owner: OWNER, id: 'vn-toggle', icon: 'image', get label() { return t('vn.open'); }, run: () => toggleVn() });
  X.commands.set('/vn', { owner: OWNER, get help() { return t('vn.cmd'); }, run: () => toggleVn() });
}
export const feature: FeatureDef = { name: 'vn', setup };
