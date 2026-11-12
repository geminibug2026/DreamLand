// 로어북: 목록(켜고 끄는 스위치) + 편집기
import { LibraryPage } from '../ui';
import { importDialog } from '../editors';
import { LoreEditor, LoreSwitch, loreLinks, loreSettingsDialog } from '../editors/lore';
import { NEEDS, core, store, type Lore } from '../editors/bridge';
import { editorApi } from '../editors/parts';

export const page = { name: 'lore', Component: LorePage, needs: NEEDS };

function LorePage({ arg }: { arg?: unknown }) {
  const S = store();
  return <LibraryPage<Lore> arg={arg} title="로어북" eyebrow="lorebook" coll="lore" ic="book" create={() => core().newLore()} label={b => b.name} sub={b => [`항목 ${b.entries.length}개`, ...loreLinks(b)].join(' · ')}
    note={() => { const n = S.lore.filter(b => S.settings.activeLore.includes(b.id)).length; return <small>{n ? `켠 로어북 ${n}개가 모든 대화에서 쓰여요` : '스위치를 켠 로어북은 모든 대화에서 쓰여요'}</small>; }}
    trail={(b, redraw) => <LoreSwitch b={b} after={redraw} />}
    empty="세계관과 설정을 키워드로 불러오는 로어북을 만들어 보세요."
    actions={[{ ic: 'sliders', title: '로어북 전체 설정', onclick: () => loreSettingsDialog() }, { ic: 'import', title: '로어북 가져오기 (JSON · 실리태번 월드 인포)', onclick: draw => void importDialog('.json', draw) }]}
    editor={(b, api) => <LoreEditor b={b} api={editorApi(api, 'lore')} />} />;
}
