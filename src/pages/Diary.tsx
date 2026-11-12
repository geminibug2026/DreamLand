// 일기장 화면: 달력 · 책장 · 약속 수첩 · 설정
import { useEffect, useState } from 'react';
import { PageHead } from '../ui';
import { NEEDS, S } from '../diary/bridge';
import { Calendar, PromisesTab, SettingsTab, Shelf, type DiaryArg } from '../diary/tabs';

const TABS = [['calendar', '달력'], ['shelf', '책장'], ['promises', '약속 수첩'], ['settings', '설정']] as const;
const isTab = (t?: string) => TABS.some(x => x[0] === t);
const keep = (t: string) => { (S().settings.almanac ||= {}).tab = t; S().saveSettings(); };

export const page = { name: 'diary', Component: Diary, needs: NEEDS };

function Diary({ arg }: { arg?: unknown }) {
  const [a] = useState<DiaryArg>(() => arg && typeof arg === 'object' ? arg as DiaryArg : {});
  // n: 같은 탭을 다시 눌러도 새로 그린다. pass: 처음 들어올 때만 넘겨받은 것(대화 · 날짜)을 쓴다
  const [st, setSt] = useState(() => ({ tab: isTab(a.tab) ? a.tab! : isTab(S().settings.almanac?.tab) ? S().settings.almanac!.tab! : 'calendar', pass: a, n: 0 }));
  useEffect(() => { keep(st.tab); /* 처음 한 번 */ }, []);   // eslint-disable-line react-hooks/exhaustive-deps
  const show = (t: string) => { keep(t); setSt(s => ({ tab: t, pass: {}, n: s.n + 1 })); };
  const t = st.tab;
  return <section className="pagebox alm-page">
    <PageHead eyebrow="diary" title="꿈 일기장" />
    <div className="tabs alm-tabs">{TABS.map(([k, l]) => <button key={k} className={'tab' + (k === t ? ' on' : '')} onClick={() => show(k)}>{l}</button>)}</div>
    <div className={`alm-host tab-${t}`} key={st.n}>
      {t === 'calendar' ? <Calendar arg={st.pass} /> : t === 'promises' ? <PromisesTab arg={st.pass} /> : t === 'settings' ? <SettingsTab /> : <Shelf />}
    </div>
  </section>;
}
