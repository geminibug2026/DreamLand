// 정규식 가져오기 창 · 켜짐 묶음 창
import { useState } from 'react';
import { Btn, IconBtn } from '../kit';
import type { Regex } from '../studio/parts';
import { Cards, G, RX, clip, isAllowed, scName, scOwner, setAllow, sets, snapshot, type RegexSet, type Sc } from './lib';
import { pickChar, pickPreset } from './pick';
import { uid, S } from '../lib/core';
import * as core from '../lib/core';
import { menu, openModal, promptBox, toast } from '../studio/parts';
import { t, tn } from '../i18n';

function Target({ to }: { to: { sc: Sc } }) {
  const [, bump] = useState(0), set = (sc: Sc) => { to.sc = sc; bump(n => n + 1); }, sc = to.sc;
  return <div className="rx-target">
    <button type="button" className={'chip' + (sc.kind === 'global' ? ' on' : '')} onClick={() => set(G)}>{t('regex.scope.global')}</button>
    <button type="button" className={'chip' + (sc.kind === 'preset' ? ' on' : '')} onClick={async () => { const id = await pickPreset(t('regex.import.whichPreset')); if (id) set({ kind: 'preset', id }); }}>{sc.kind === 'preset' ? t('regex.import.presetIs', { name: scOwner(sc) }) : t('regex.import.presetPick')}</button>
    <button type="button" className={'chip' + (sc.kind === 'char' ? ' on' : '')} onClick={async () => { const id = await pickChar(t('regex.import.whichChar')); if (id) set({ kind: 'char', id }); }}>{sc.kind === 'char' ? t('regex.import.charIs', { name: scOwner(sc) }) : t('regex.import.charPick')}</button>
  </div>;
}
/** 파일을 골라 정규식을 읽고, 넣을 범위를 물어 들여놓는다 */
export async function importFlow(defaultSc: Sc | null, after?: (to: Sc) => void) {
  const files = await core.pickFiles({ accept: '.json,application/json', multiple: true }); if (!files.length) return;
  const found: Regex[] = [], bad: string[] = [];
  for (const f of files) { try { const got = Cards.regexFromJson(JSON.parse(await f.text())); if (got.length) found.push(...got); else bad.push(f.name); } catch { bad.push(f.name); } }
  if (!found.length) return toast(bad.length ? t('regex.import.noneFoundFiles', { files: bad.slice(0, 3).join(', ') }) : t('regex.import.noneFound'), 'err');
  const to = { sc: defaultSc || G };
  openModal({ title: tn('regex.import.whereN', found.length), box: 'col rx-import',
    actions: [{ label: t('common.cancel') }, { label: t('common.import'), cls: 'primary', onclick: async () => { for (const r of found) await RX().Scope.add(to.sc, r); if (!isAllowed(to.sc)) setAllow(to.sc, true); toast(tn('regex.import.doneN', found.length, { scope: scName(to.sc) }), 'ok'); after?.(to.sc); } }] },
  () => <><Target to={to} />{bad.length ? <small className="hint err">{t('regex.import.badFiles', { files: bad.join(', ') })}</small> : null}
    <div className="rx-import-list">{found.slice(0, 60).map((r, i) => <div key={i}><b>{r.name}</b><code>{clip(r.find, 60)}</code></div>)}{found.length > 60 && <p className="dim">{tn('regex.import.moreN', found.length - 60)}</p>}</div></>);
}

function Sets({ after }: { after?: () => void }) {
  const [, bump] = useState(0), draw = () => bump(n => n + 1);
  const put = (next: RegexSet[]) => { S.set({ regexSets: next }); draw(); };
  return <>
    <div className="rx-sets">{sets().map(s => <div className={'rx-set' + (S.settings.regexSet === s.id ? ' on' : '')} key={s.id}>
      <div className="rx-set-text"><b>{s.name}</b><small>{t('regex.sets.stat', { on: s.on.length, known: s.known.length })}</small></div>
      <Btn label={t('common.apply')} cls="primary" onClick={async () => { const n = await RX().applySet(s); toast(n ? tn('regex.sets.appliedN', n, { name: s.name }) : t('regex.sets.alreadySame', { name: s.name }), 'ok'); draw(); after?.(); }} />
      <IconBtn ic="more" title={t('regex.more')} onClick={e => menu(e.currentTarget, [
        { label: t('regex.sets.overwrite'), ic: 'refresh', onclick: () => put(sets().map(x => (x.id === s.id ? { ...x, ...snapshot() } : x))) },
        { label: t('common.rename'), ic: 'edit', onclick: async () => { const name = (await promptBox(t('regex.sets.name'), s.name))?.trim(); if (name) put(sets().map(x => (x.id === s.id ? { ...x, name } : x))); } },
        { label: t('common.delete'), ic: 'trash', danger: true, onclick: () => put(sets().filter(x => x.id !== s.id)) }])} />
    </div>)}{!sets().length && <p className="dim">{t('regex.sets.empty')}</p>}</div>
    <Btn label={t('regex.sets.saveNew')} ic="plus" onClick={async () => { const name = (await promptBox(t('regex.sets.name'), ''))?.trim(); if (!name) return; put([...sets(), { id: uid(), name, ...snapshot() }]); }} />
    <small className="hint">{t('regex.sets.hint')}</small>
  </>;
}
/** 켜고 꺼 둔 상태를 저장해 두고 한 번에 바꾸는 창 */
export const setsDialog = (after?: () => void) => { openModal({ title: t('regex.sets.title'), box: 'col' }, () => <Sets after={after} />); };
