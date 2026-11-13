// 흐름 화면: 연결 프로필 · 자동 진행 · 연출 지시 · 재생성 이유 (src/flow/panels.tsx 의 flowPanes 를 탭으로)
import { useState } from 'react';
import { PageHead } from '../ui';
import { flowPanes } from '../flow/panels';
import { t } from '../i18n';

export const page = { name: 'flow', Component: Flow };

type Tab = keyof typeof flowPanes;
const TABS: Tab[] = ['profiles', 'auto', 'direct'];
const label = (k: Tab) => t(k === 'profiles' ? 'flow.page.tabProfiles' : k === 'auto' ? 'flow.page.tabAuto' : 'flow.page.tabDirect');

function Flow({ arg }: { arg?: unknown }) {
  const [tab, setTab] = useState<Tab>(() => TABS.includes(arg as Tab) ? arg as Tab : 'profiles');
  const Pane = flowPanes[tab];
  return <section className="pagebox flow-page">
    <PageHead eyebrow="flow" title={t('flow.page.title')} />
    <p className="hint">{t('flow.page.intro')}</p>
    <div className="tabs">{TABS.map(k => <button key={k} className={'tab' + (k === tab ? ' on' : '')} onClick={() => setTab(k)}>{label(k)}</button>)}</div>
    <div className="col flow-pane" key={tab}><Pane /></div>
  </section>;
}
