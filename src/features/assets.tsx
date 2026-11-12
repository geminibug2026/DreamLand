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

function setup() {
  useCss('f-assets.css');
  registerPrompt();
  watchChatImages();
  const As = A();
  X.studio = X.studio.filter(t => t.owner !== 'assets');
  X.studio.push({ owner: 'assets', title: '에셋', render: () => reactNode('assets-studio', 'div.ast', <AssetsStudio />) });

  // ════════ 명령어 ════════
  const currentChar = () => { const { chat } = chatApi.current(); return S.get('chars', chat?.charIds?.[0]) || null; };
  X.commands.set('/assets-upload', { owner: 'assets', help: '주소의 이미지를 지금 캐릭터의 에셋으로 올립니다 · 예: /assets-upload label=joy https://…/joy.png',
    run: async arg => {
      const m = String(arg || '').match(/^\s*(?:label=("([^"]*)"|'([^']*)'|\S+)\s+)?(\S+)\s*$/i);
      if (!m) return toast('이렇게 적어 주세요: /assets-upload label=키워드 주소', 'err');
      const char = currentChar(); if (!char) return toast('열린 대화의 캐릭터가 없어요', 'err');
      const owner = As.ownerOfChar(char.id);
      if (As.source(owner) !== owner) return toast('에셋 링크를 쓰는 캐릭터에는 올릴 수 없어요', 'err');
      chatApi.setStatus('에셋 올리는 중…');
      try { if (await uploadFromUrl(owner, As.verOf(owner), m[4], As.cleanName(m[2] ?? m[3] ?? m[1] ?? ''))) chatApi.redraw(); } finally { chatApi.setStatus(''); }
    } });
  X.commands.set('/assets-gallery', { owner: 'assets', help: '지금 캐릭터의 에셋 갤러리를 엽니다',
    run: async () => {
      const char = currentChar(); if (!char) return toast('열린 대화의 캐릭터가 없어요', 'err');
      const owner = As.ownerOfChar(char.id); await As.load([owner]);
      const src = As.source(owner); openGallery(src, As.verOf(owner), `${char.name}의 에셋 갤러리`, { locked: src !== owner, onChange: () => chatApi.redraw() });
    } });
  X.commands.set('/refresh-img-keywords', { owner: 'assets', help: '에셋 보관함을 다시 읽어 키워드를 새로 고칩니다',
    run: async () => { const { chat } = chatApi.current(); if (!chat) return toast('열린 대화가 없어요', 'err'); const owners = ownersOf(chat); await As.reload(owners); chatApi.redraw(); toast(`키워드를 새로 고쳤어요: ${As.names(owners).join(', ') || '(없음)'}`.slice(0, 200), 'ok'); } });
}

export const feature = { name: 'assets', setup };
