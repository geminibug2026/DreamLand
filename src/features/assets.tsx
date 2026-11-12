// 캐릭터 에셋: 안내문 프리셋 · 에셋 관리 · 표시 스타일 · 도구 (옛 js/f-assets.js)
import { useCss } from '../addons/parts';
import { reactNode } from '../addons/parts';
import { A, ownersOf, registerPrompt, uploadFromUrl } from '../assets/logic';
import { AssetsStudio } from '../assets/Studio';
import { openGallery, watchChatImages } from '../assets/windows';
import { toast } from '../ui';
import { S } from '../lib/core';
import { X } from '../lib/hooks';
import { chatApi } from '../chat/actions';
import { t } from '../i18n';

function setup() {
  useCss('f-assets.css');
  registerPrompt();
  watchChatImages();
  const As = A();
  X.studio = X.studio.filter(t => t.owner !== 'assets');
  X.studio.push({ owner: 'assets', title: '에셋', render: () => reactNode('assets-studio', 'div.ast', <AssetsStudio />) });

  // ════════ 명령어 ════════
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
  X.commands.set('/assets-gallery', { owner: 'assets', get help() { return t('assets.cmd.gallery'); },
    run: async () => {
      const char = currentChar(); if (!char) return toast(t('assets.cmd.noChar'), 'err');
      const owner = As.ownerOfChar(char.id); await As.load([owner]);
      const src = As.source(owner); openGallery(src, As.verOf(owner), t('assets.galleryTitle', { name: t('assets.ofName', { name: char.name }) }), { locked: src !== owner, onChange: () => chatApi.redraw() });
    } });
  X.commands.set('/refresh-img-keywords', { owner: 'assets', get help() { return t('assets.cmd.refresh'); },
    run: async () => { const { chat } = chatApi.current(); if (!chat) return toast(t('assets.cmd.noChat'), 'err'); const owners = ownersOf(chat); await As.reload(owners); chatApi.redraw(); toast(t('assets.cmd.refreshed', { names: As.names(owners).join(', ') || t('assets.cmd.noneParen') }).slice(0, 200), 'ok'); } });
}

export const feature = { name: 'assets', setup };
