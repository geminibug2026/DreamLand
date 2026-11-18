// 로어북: 목록(켜고 끄는 스위치) + 편집기
import { LibraryPage } from '../ui';
import { importDialog } from '../editors';
import { LoreEditor, LoreSwitch, loreLinks, loreSettingsDialog } from '../editors/lore';
import type { Lore } from '../editors/types';
import { editorApi } from '../editors/parts';
import { S } from '../lib/core';
import * as core from '../lib/core';
import { t, tn } from '../i18n';

export const page = { name: 'lore', Component: LorePage };

function LorePage({ arg }: { arg?: unknown }) {
  return <LibraryPage<Lore> arg={arg} title={t('lore.title')} eyebrow="lorebook" coll="lore" ic="book" create={() => core.newLore()} label={b => b.name} sub={b => [tn('lore.entries', b.entries.length), ...loreLinks(b)].join(' · ')}
    note={() => { const n = S.lore.filter(b => S.settings.activeLore.includes(b.id)).length; return <small>{n ? tn('lore.page.active', n) : t('lore.page.hint')}</small>; }}
    trail={(b, redraw) => <LoreSwitch b={b} after={redraw} />}
    paged={{ id: 'lore', text: b => b.name + ' ' + (b.description || ''), placeholder: t('lore.page.search') }}
    empty={t('lore.page.empty')}
    actions={[{ ic: 'sliders', title: t('lore.global.title'), onclick: () => loreSettingsDialog() }, { ic: 'import', title: t('lore.page.import'), onclick: draw => void importDialog('.json', draw) }]}
    editor={(b, api) => <LoreEditor b={b} api={editorApi(api, 'lore')} />} />;
}
