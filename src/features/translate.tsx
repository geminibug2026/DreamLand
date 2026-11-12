// 번역: X.translate · 명령어 · 대화 화면 단추 · 기능 화면 › 번역 (옛 js/f-translate.js)
import type { FeatureDef } from '../main';
import type { Command } from '../addons/types';
import { useCss } from '../addons/parts';
import { openModal, reactNode } from '../addons/parts';
import { langLabel } from '../translate/lang';
import { cfg, parseArgs, translate, translateMsg } from '../translate/logic';
import { watchChat } from '../translate/chat';
import { TranslateStudio } from '../translate/Studio';
import { toast } from '../ui';
import { S } from '../lib/core';
import { X } from '../lib/hooks';
import { chatApi } from '../chat/actions';

function setup() {
  useCss('f-translate.css');
  X.translate = translate;

  const cmdTranslate: Command = {
    owner: 'translate', help: '메시지를 번역합니다 (번호를 비우면 마지막 메시지) · 예: /translate 12',
    run: async arg => {
      const { msgs } = chatApi.current(); const n = parseInt(arg, 10);
      if (arg.trim() && isNaN(n)) return toast('메시지 번호를 숫자로 적어 주세요', 'err');
      const m = !arg.trim() || n === -1 ? msgs[msgs.length - 1] : msgs[n - 1];
      if (!m || m.role === 'system') return toast('그 번호의 메시지를 찾지 못했어요', 'err');
      await translateMsg(m, true);
    },
  };
  const cmdText: Command = {
    owner: 'translate', help: '적은 글을 번역합니다 · 예: /translate-text target=ja 안녕하세요 (preset=이름, profile=연결 이름도 됩니다)',
    run: async arg => {
      const { named, text } = parseArgs(arg);
      if (!text) return toast('번역할 글을 적어 주세요', 'err');
      const conn = named.profile ? S.conns.find(c => c.id === named.profile || c.name === named.profile) : null;
      if (named.profile && !conn) return toast(`"${named.profile}" 연결을 찾지 못했어요`, 'err');
      if (named.preset && !cfg().presets.some(p => p.id === named.preset || p.name === named.preset)) return toast(`"${named.preset}" 프리셋을 찾지 못했어요`, 'err');
      chatApi.setStatus('번역 중…');
      try {
        const out = await (X.translate || translate)(text, (named.target || cfg().lang) as string, { chat: chatApi.current().chat, preset: named.preset, conn });
        openModal({ title: `${langLabel(named.target || cfg().lang)} 번역`, spec: 'div.trx-result',
          actions: [{ label: '입력창에 넣기', onclick: () => chatApi.insert(out) }, { label: '복사', cls: 'primary', ic: 'copy', onclick: () => { void navigator.clipboard.writeText(out); toast('복사했어요'); } }] },
        () => <><div className="trx-result-src">{text}</div><div className="trx-result-out">{out}</div></>);
      } finally { chatApi.setStatus(''); }
    },
  };
  X.commands.set('/translate', cmdTranslate); X.commands.set('/magic-translate', { ...cmdTranslate, help: '/translate 와 같습니다' });
  X.commands.set('/translate-text', cmdText); X.commands.set('/magic-translate-text', { ...cmdText, help: '/translate-text 와 같습니다' });

  watchChat();

  X.studio = X.studio.filter(t => t.owner !== 'translate');
  X.studio.push({ owner: 'translate', title: '번역', render: () => reactNode('translate-studio', 'div.trx', <TranslateStudio />) });
}

export const feature: FeatureDef = { name: 'translate', setup };
