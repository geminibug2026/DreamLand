// 도움말: 드림랜드 설명서를 찾아 읽는 화면. 같은 설명서를 등불지기도 읽는다 (src/guide/handbook.ts)
import { useMemo, useState } from 'react';
import { PageHead } from '../ui';
import { Btn } from '../kit';
import { go } from '../lib/router';
import { useCss } from '../addons/parts';
import { t, useLang } from '../i18n';
import { GROUPS, TOPICS, searchHelp, type HelpRow } from '../guide/handbook';
import { openGuide } from '../guide/agent';
import { Mark, startTour, tryNow } from '../guide/Tour';
import { navItems } from '../lib/boot';

export const page = { name: 'help', Component: Help };
let lastQ = '';

function Row({ r, no }: { r: HelpRow; no: number }) {
  const nav = r.topic.page ? navItems().find(n => n[0] === r.topic.page) : null;
  return <article className="gd-hrow" id={'gd-h-' + r.id}>
    <span className="fx-num gd-hno">{String(no).padStart(2, '0')}</span>
    <div className="gd-htx">
      <h3 className="fx-serif">{r.title}</h3>
      <p className="fx-body">{r.body}</p>
      <div className="gd-hacts">
        {nav ? <button type="button" className="gd-link" onClick={() => go(nav[0])}>{t('guide.help.goto', { page: nav[1] })}<svg className="fx-art" viewBox="0 0 16 8" width="16" height="8" aria-hidden="true"><path d="M1 4h13M11 1l3 3-3 3" /></svg></button> : null}
        <button type="button" className="gd-link dim" onClick={() => openGuide({ draft: t('guide.help.askDraft', { title: r.title }), fresh: true })}>{t('guide.help.ask')}</button>
      </div>
    </div>
  </article>;
}

function Help({ arg }: { arg?: unknown }) {
  useCss('guide.css'); useLang();
  const [q, setQ] = useState(typeof arg === 'string' ? arg : lastQ);
  const rows = useMemo(() => searchHelp(q), [q]);
  const no = (id: string) => TOPICS.findIndex(x => x.id === id) + 1;
  const term = q.trim();
  return <section className="pagebox gd-help">
    <PageHead eyebrow="handbook" title={t('guide.help.title')}>
      <Btn label={t('guide.tour.again')} ic="play" onClick={() => startTour()} />
      <Btn label={t('guide.help.openGuide')} ic="guide" cls="primary" onClick={() => openGuide()} />
    </PageHead>
    <div className="gd-hintro"><Mark size={52} draw /><p className="fx-body">{t('guide.help.intro')}</p></div>
    <div className="gd-hsearch"><input className="inp search" type="search" value={q} placeholder={t('guide.help.search')} aria-label={t('guide.help.search')} onChange={e => { setQ(e.target.value); lastQ = e.target.value; }} />
      <span className="fx-num dim">{String(rows.length).padStart(2, '0')} / {String(TOPICS.length).padStart(2, '0')}</span></div>
    {!rows.length ? <div className="fx-empty"><svg className="fx-art" viewBox="0 0 56 56" aria-hidden="true"><path d="M14 8h22v40l-11-9-11 9z" /><path className="t" d="M19 16h12M19 23h12M19 30h7" /><circle className="d" cx="41" cy="40" r="8" /><path d="M46.5 45.5l5 5" /></svg><p>{t('guide.help.none')}</p>
      <button type="button" className="btn" onClick={() => openGuide({ draft: term, fresh: true })}>{t('guide.help.askInstead')}</button></div>
      : term ? <div className="gd-hlist fx-rows">{rows.map(r => <Row key={r.id} r={r} no={no(r.id)} />)}</div>
        : <div className="gd-hbody">
          <nav className="gd-hnav" aria-label={t('guide.help.title')}>{GROUPS.map(g => <a key={g} href={'#gd-g-' + g} onClick={e => { e.preventDefault(); document.getElementById('gd-g-' + g)?.scrollIntoView({ behavior: 'smooth', block: 'start' }); }}><span>{t('guide.group.' + g)}</span><i /><b className="fx-num">{String(rows.filter(r => r.topic.group === g).length).padStart(2, '0')}</b></a>)}
            <button type="button" className="gd-link" onClick={() => void tryNow()}>{t('guide.offer.try')}</button></nav>
          <div className="gd-hgroups">{GROUPS.map(g => <section key={g} id={'gd-g-' + g}>
            <h2 className="fx-head"><span className="fx-lbl kr ink">{t('guide.group.' + g)}</span></h2>
            <div className="gd-hlist fx-rows">{rows.filter(r => r.topic.group === g).map(r => <Row key={r.id} r={r} no={no(r.id)} />)}</div>
          </section>)}</div>
        </div>}
  </section>;
}
