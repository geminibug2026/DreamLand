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
import { t } from '../i18n';

function setup() {
  useCss('f-translate.css');
  X.translate = translate;

  const cmdTranslate: Command = {
    owner: 'translate', get help() { return t('translate.cmd.translate'); },
    run: async arg => {
      const { msgs } = chatApi.current(); const n = parseInt(arg, 10);
      if (arg.trim() && isNaN(n)) return toast(t('translate.cmd.needNumber'), 'err');
      const m = !arg.trim() || n === -1 ? msgs[msgs.length - 1] : msgs[n - 1];
      if (!m || m.role === 'system') return toast(t('translate.cmd.notFound'), 'err');
      await translateMsg(m, true);
    },
  };
  const cmdText: Command = {
    owner: 'translate', get help() { return t('translate.cmd.text'); },
    run: async arg => {
      const { named, text } = parseArgs(arg);
      if (!text) return toast(t('translate.cmd.needText'), 'err');
      const conn = named.profile ? S.conns.find(c => c.id === named.profile || c.name === named.profile) : null;
      if (named.profile && !conn) return toast(t('translate.cmd.noConn', { name: named.profile }), 'err');
      if (named.preset && !cfg().presets.some(p => p.id === named.preset || p.name === named.preset)) return toast(t('translate.cmd.noPreset', { name: named.preset }), 'err');
      chatApi.setStatus(t('chat.status.translating'));
      try {
        const out = await (X.translate || translate)(text, (named.target || cfg().lang) as string, { chat: chatApi.current().chat, preset: named.preset, conn });
        openModal({ title: t('translate.cmd.resultTitle', { lang: langLabel(named.target || cfg().lang) }), spec: 'div.trx-result',
          actions: [{ label: t('translate.cmd.insert'), onclick: () => chatApi.insert(out) }, { label: t('common.copy'), cls: 'primary', ic: 'copy', onclick: () => { void navigator.clipboard.writeText(out); toast(t('chat.msg.copied')); } }] },
        () => <><div className="trx-result-src">{text}</div><div className="trx-result-out">{out}</div></>);
      } finally { chatApi.setStatus(''); }
    },
  };
  X.commands.set('/translate', cmdTranslate); X.commands.set('/magic-translate', { ...cmdTranslate, get help() { return t('translate.cmd.alias', { cmd: '/translate' }); } });
  X.commands.set('/translate-text', cmdText); X.commands.set('/magic-translate-text', { ...cmdText, get help() { return t('translate.cmd.alias', { cmd: '/translate-text' }); } });

  watchChat();

  X.studio = X.studio.filter(t => t.owner !== 'translate');
  X.studio.push({ owner: 'translate', title: '번역', render: () => reactNode('translate-studio', 'div.trx', <TranslateStudio />) });
}

export const feature: FeatureDef = { name: 'translate', setup };
