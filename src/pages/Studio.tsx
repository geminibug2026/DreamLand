// 기능: 번역 · 삽화 · 에셋 · 보조 연결 설정 + 기능 모듈이 꽂은 탭
import { useMemo, useState, type ReactNode } from 'react';
import { Btn } from '../kit';
import type { FormDefs, Opt } from '../studio/parts';
import * as libIllust from '../lib/illust';
import * as libHooks from '../lib/hooks';
import * as libAssets from '../lib/assets';
import { S, chatConns } from '../lib/core';
import { Host, LForm, PageHead, textModal } from '../studio/parts';
import { t } from '../i18n';

interface StudioSettings { illust: { backend: string } }

// 화면을 떠났다 돌아와도 남는 탭
let tab = '번역';
const TAB_ORDER = ['번역', '삽화', '에셋', '보조 연결', '일정', '표정', '벡터 검색', '장기기억'];

export const page = { name: 'studio', Component: Studio };

/** 탭 제목은 식별자(한국어, 확장이 같은 제목으로 기본 탭을 대신함). 화면에는 아는 제목이면 번역해서 */
const TAB_KEYS: Record<string, string> = { '번역': 'studio.tab.translate', '삽화': 'studio.tab.illust', '에셋': 'studio.tab.assets', '보조 연결': 'studio.tab.helpers', '일정': 'studio.tab.schedule', '표정': 'studio.tab.expressions', '벡터 검색': 'studio.tab.vectors', '장기기억': 'studio.tab.memoria', '읽어 주기': 'studio.tab.tts' };
const tabLabel = (title: string) => TAB_KEYS[title] ? t(TAB_KEYS[title]) : title;

/** 기능 모듈이 등록한 탭: 옛 코드가 만든 DOM 을 그대로 끼운다 */
function ExtTab({ render }: { render: () => Node }) {
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const node = useMemo(() => render(), []);
  return <Host node={node} />;
}

function Studio() {
  const [, setTab] = useState(tab), [epoch, setEpoch] = useState(0);
  const st = S.settings as unknown as StudioSettings, sv = () => S.set({});
  const { NAI_MODELS, PLAN_PROMPT, TRANSLATE_PROMPT } = libIllust, { ASSET_PROMPT } = libAssets;
  const conns: Opt[] = [['', t('studio.connDefault')], ...chatConns().map(c => [c.id, `${c.name}${c.model ? ' · ' + c.model : ''}`] as const)];
  const il = st.illust, nai = il.backend === 'nai', api = il.backend === 'openai' || il.backend === 'gemini', sd = il.backend === 'a1111';
  const card = (defs: FormDefs, ...rest: ReactNode[]) => <div className="card"><LForm obj={st} defs={defs} onChange={sv} />{rest}</div>;

  const views: Record<string, () => ReactNode> = {
    '번역': () => card([{ section: t('studio.tab.translate') },
      { k: 'translate.auto', label: t('studio.tr.auto'), type: 'check' }, { k: 'translate.lang', label: t('studio.tr.lang'), half: true },
      { k: 'translate.autoInput', label: t('studio.tr.autoInput'), type: 'check' }, { k: 'translate.inputLang', label: t('studio.tr.inputLang'), half: true },
      { k: 'translate.context', label: t('studio.tr.context'), type: 'num', min: 0, max: 10, half: true }, { k: 'translate.maxTokens', label: t('studio.maxTokens'), type: 'num', half: true },
      { k: 'helpers.translate', label: t('studio.tr.conn'), type: 'select', opts: conns },
      { k: 'translate.prompt', label: t('studio.tr.prompt'), type: 'area', rows: 6, ph: TRANSLATE_PROMPT, hint: t('studio.tr.promptHint') }],
      <p className="hint" key="h">{t('studio.tr.hint')}</p>),
    '삽화': () => card([{ section: t('studio.tab.illust') },
      { k: 'illust.auto', label: t('studio.il.auto'), type: 'check' },
      { k: 'illust.mode', label: t('studio.il.mode'), type: 'select', opts: [['plan', t('studio.il.modePlan')], ['call', t('studio.il.modeCall')]], half: true }, { k: 'illust.every', label: t('studio.il.every'), type: 'num', min: 1, third: true }, { k: 'illust.maxScenes', label: t('studio.il.maxScenes'), type: 'num', min: 1, max: 4, third: true },
      { k: 'illust.backend', label: t('studio.il.backend'), type: 'select', opts: [['nai', 'NovelAI'], ['openai', t('studio.il.openai')], ['gemini', t('studio.il.gemini')], ['a1111', 'Stable Diffusion WebUI']], half: true, live: true },
      nai && { k: 'illust.naiKey', label: t('studio.il.naiKey'), type: 'password', half: true },
      nai && { k: 'illust.model', label: t('studio.il.model'), type: 'select', opts: NAI_MODELS, half: true },
      nai && { k: 'illust.sampler', label: t('studio.il.sampler'), type: 'select', opts: ['k_euler_ancestral', 'k_euler', 'k_dpmpp_2m', 'k_dpmpp_2m_sde', 'k_dpmpp_sde', 'k_dpmpp_2s_ancestral'], half: true },
      api && { k: 'illust.connId', label: t('studio.il.connId'), type: 'select', opts: [['', t('studio.il.pick')], ...chatConns().map(c => [c.id, c.name] as const)], half: true },
      api && { k: 'illust.imgModel', label: t('studio.il.imgModel'), ph: il.backend === 'gemini' ? 'gemini-3.1-flash-image' : 'gpt-image-1', half: true },
      sd && { k: 'illust.a1111', label: t('studio.il.a1111'), half: true },
      { k: 'illust.width', label: t('studio.il.width'), type: 'num', step: 64, third: true }, { k: 'illust.height', label: t('studio.il.height'), type: 'num', step: 64, third: true },
      (nai || sd) && { k: 'illust.steps', label: t('studio.il.steps'), type: 'num', third: true },
      (nai || sd) && { k: 'illust.scale', label: t('studio.il.scale'), type: 'num', step: 0.5, third: true },
      { k: 'illust.style', label: t('studio.il.style'), ph: 'watercolor, soft lighting …' }, { k: 'illust.direction', label: t('studio.il.direction'), ph: t('studio.il.directionPh') }, { k: 'illust.world', label: t('studio.il.world'), ph: t('studio.il.worldPh') },
      { k: 'illust.playerMode', label: t('studio.il.player'), type: 'select', opts: [['auto', t('studio.il.playerAuto')], ['always', t('studio.il.playerAlways')], ['never', t('studio.il.playerNever')]], half: true }, { k: 'illust.contextMessages', label: t('studio.il.context'), type: 'num', half: true }, { k: 'illust.negative', label: t('studio.il.negative') },
      { k: 'illust.quality', label: t('studio.il.quality'), type: 'check' },
      { k: 'helpers.illust', label: t('studio.il.conn'), type: 'select', opts: conns },
      { k: 'illust.planPrompt', label: t('studio.il.planPrompt'), type: 'area', rows: 5, ph: PLAN_PROMPT.slice(0, 500) + ' …', hint: t('studio.il.planPromptHint') }],
      <div className="row" key="a"><Btn label={t('studio.il.showDefault')} cls="ghost" ic="note" onClick={() => textModal(t('studio.il.defaultTitle'), 'regex-out', PLAN_PROMPT)} /></div>,
      <div className="row" key="b"><Btn label={t('studio.il.refresh')} cls="ghost" ic="refresh" onClick={() => setEpoch(n => n + 1)} /></div>,
      <p className="hint" key="h">{t('studio.il.hint')}</p>),
    '에셋': () => card([{ section: t('studio.as.section') },
      { k: 'assets.inject', label: t('studio.as.inject'), type: 'check' }, { k: 'assets.max', label: t('studio.as.max'), type: 'num', min: 1, max: 6, half: true },
      { k: 'assets.random', label: t('studio.as.random'), type: 'check' },
      { k: 'assets.prompt', label: t('studio.as.prompt'), type: 'area', rows: 5, ph: ASSET_PROMPT, hint: t('studio.as.promptHint') }],
      <p className="hint" key="h">{t('studio.as.hint')}</p>),
    '보조 연결': () => card([{ section: t('studio.hp.section') },
      { k: 'helpers.all', label: t('studio.hp.all'), type: 'select', opts: conns, hint: t('studio.hp.allHint') },
      { k: 'helpers.translate', label: t('studio.tab.translate'), type: 'select', opts: conns, third: true }, { k: 'helpers.memory', label: t('studio.tab.memoria'), type: 'select', opts: conns, third: true }, { k: 'helpers.illust', label: t('studio.hp.illust'), type: 'select', opts: conns, third: true }]),
  };
  // 기능 모듈이 등록한 탭이 같은 이름의 기본 탭을 대신한다
  for (const t of libHooks.X.studio) views[t.title] = () => <ExtTab render={() => t.render()} />;
  // 탭 순서는 옛 판과 같게 (기능이 등록되는 순서가 달라져도). 여기에 없는 탭은 등록된 순서대로 뒤에 온다
  const rank = (t: string) => { const i = TAB_ORDER.indexOf(t); return i < 0 ? TAB_ORDER.length : i; };
  const names = Object.keys(views).map((t, i) => [t, i] as const).sort((a, b) => rank(a[0]) - rank(b[0]) || a[1] - b[1]).map(x => x[0]);
  if (!views[tab]) tab = names[0];

  return <section className="pagebox"><PageHead eyebrow="features" title={t('studio.title')} />
    <div className="tabs">{names.map(n => <button key={n} data-tab={n} className={'tab' + (n === tab ? ' on' : '')} onClick={() => { tab = n; setTab(n); setEpoch(e => e + 1); }}>{tabLabel(n)}</button>)}</div>
    <span style={{ display: 'contents' }} key={tab + ':' + epoch}>{views[tab]()}</span>
  </section>;
}
