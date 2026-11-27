// 캐릭터 에셋: 안내문 프리셋 · 에셋 관리 · 표시 스타일 · 도구 (옛 js/f-assets.js)
import { useCss } from '../addons/parts';
import { reactNode } from '../addons/parts';
import { A, cfg, chatSrcs, ownersOf, refreshChat, registerPrompt, uploadFromUrl } from '../assets/logic';
import { lazyComp } from '../lib/lazy';
const AssetsStudio = lazyComp(() => import('../assets/Studio').then(m => m.AssetsStudio));   // 에셋 작업실은 처음 열 때 받는다
import { openGallery, watchChatImages } from '../assets/windows';
import { Sprites } from '../expressions/store';
import { toast } from '../ui';
import { S, on } from '../lib/core';
import { X } from '../lib/hooks';
import { chatApi } from '../chat/actions';
import type { Chat } from '../lib/types';
import { t } from '../i18n';

function setup() {
  useCss('f-assets.css');
  registerPrompt();
  watchChatImages();
  const As = A();
  // 렌더링 › 표정 그림도 찾기: 에셋에 없는 감정 이름은 그 캐릭터의 표정 그림으로
  As.useSprites({ list: id => Sprites.list(id) });
  on<Chat>('chat:open', chat => { if (cfg().sprites && chat?.charIds?.some(id => !Sprites.has(id))) void Sprites.load(chat.charIds).then(refreshChat).catch(() => { }); });
  X.studio = X.studio.filter(t => t.owner !== 'assets');
  X.studio.push({ owner: 'assets', title: '에셋', render: () => reactNode('assets-studio', 'div.ast', <AssetsStudio />) });

  // ════════ 입력창 + 메뉴 · 명령어 ════════
  const gallery = async () => {
    const { chat } = chatApi.current(); if (!chat) return toast(t('assets.cmd.noChat'), 'err');
    const srcs = chatSrcs(chat); await As.load(srcs.flatMap(s => [s.owner, s.src]));
    const one = chat.charIds.length === 1 ? S.get('chars', chat.charIds[0]) : null;
    openGallery(srcs, t('assets.galleryTitle', { name: one ? t('assets.ofName', { name: one.name }) : t('assets.gal.chatMembers') }), { onChange: () => refreshChat() });
  };
  X.composer = X.composer.filter(a => a.owner !== 'assets');
  X.composer.push({ owner: 'assets', id: 'assets-gallery', icon: 'image', get label() { return t('assets.cmd.galleryMenu'); }, run: () => void gallery() });
  const currentChar = () => { const { chat } = chatApi.current(); return S.get('chars', chat?.charIds?.[0]) || null; };
  X.commands.set('/assets-upload', { owner: 'assets', get help() { return t('assets.cmd.upload'); },
    run: async arg => {
      const m = String(arg || '').match(/^\s*(?:label=("([^"]*)"|'([^']*)'|\S+)\s+)?(\S+)\s*$/i);
      if (!m) return toast(t('assets.cmd.usage'), 'err');
      const char = currentChar(); if (!char) return toast(t('assets.cmd.noChar'), 'err');
      const owner = As.ownerOfChar(char.id);
      if (As.source(owner) !== owner) return toast(t('assets.cmd.linked'), 'err');
      chatApi.setStatus(t('assets.cmd.uploading'));
      try { if (await uploadFromUrl(owner, As.verOf(owner), m[4], As.cleanName(m[2] ?? m[3] ?? m[1] ?? ''))) chatApi.redraw(); } finally { chatApi.setStatus(''); }
    } });
  X.commands.set('/assets-gallery', { owner: 'assets', get help() { return t('assets.cmd.gallery'); }, run: () => gallery() });
  // 켜져 있는 파일 이름을 쉼표로 이어 돌려준다 (스크립트에서 다음 명령으로 넘겨 쓴다)
  X.commands.set('/assets-list', { owner: 'assets', get help() { return t('assets.cmd.list'); },
    run: async () => { const { chat } = chatApi.current(); if (!chat) return ''; const owners = ownersOf(chat); await As.load(owners); return [...new Set(owners.flatMap(o => As.active(o)).map(a => a.name))].join(', '); } });
  X.commands.set('/refresh-img-keywords', { owner: 'assets', get help() { return t('assets.cmd.refresh'); },
    run: async () => { const { chat } = chatApi.current(); if (!chat) return toast(t('assets.cmd.noChat'), 'err'); const owners = ownersOf(chat); await As.reload(owners); refreshChat(); toast(t('assets.cmd.refreshed', { names: As.names(owners).join(', ') || t('assets.cmd.noneParen') }).slice(0, 200), 'ok'); } });
}

export const feature = { name: 'assets', setup };
