// 캐릭터 프로필 창
import { useRef, useState } from 'react';
import { Btn, Emblem, Icon, IconBtn, InkName, artStyle, tintRef } from '../kit';
import type { Char, Folder } from '../types';
import type { XChar } from './types';
import { confirmBox, menu, openModal, promptBox, type ModalHandle } from '../ui';
import { useBump } from './parts';
import { charEditor } from './CharEditor';
import { go } from '../lib/router';
import { S, fmtTime, uid } from '../lib/core';
import { startChat } from '../chat/start';
import { Assets } from '../lib/assets';
import { pageRefresh } from './refresh';
import * as engine from '../lib/engine';
import * as core from '../lib/core';
import * as cards from '../lib/cards';
import { t, tn } from '../i18n';

export const charTokens = (c: XChar) => engine.tokens([c.description, c.personality, c.scenario, c.mesExample, c.systemPrompt, c.postHistory].join('\n'));

// ── 캐릭터 폴더 (홈과 같은 규칙: 폴더 목록은 설정에, 어느 폴더인지는 캐릭터의 folder 에) ──
const folders = (): Folder[] => (S.settings.folders ||= []);
const folderOf = (c: Char) => folders().some(f => f.id === c.folder) ? c.folder! : '';
async function moveToFolder(c: XChar, folderId: string) { if ((c.folder || '') !== folderId) { c.folder = folderId; await S.save('chars', c, true); } }
function folderMenu(anchor: Element, c: XChar, after: () => void) {
  const cur = folderOf(c);
  menu(anchor, [
    ...folders().map(fo => ({ label: fo.name, ic: cur === fo.id ? 'check' : 'folder', onclick: async () => { await moveToFolder(c, fo.id); after(); } })),
    cur ? { label: t('editors.sheet.folderOut'), ic: 'x', onclick: async () => { await moveToFolder(c, ''); after(); } } : null,
    folders().length ? '-' : null,
    { label: t('editors.sheet.folderNew'), ic: 'plus', onclick: async () => {
      const v = await promptBox(t('editors.sheet.folderName'), '', { placeholder: t('editors.sheet.folderPh') }); if (!v?.trim()) return;
      const fo = { id: uid(), name: v.trim().slice(0, 40) }; folders().push(fo); S.set({ folders: folders() });
      await moveToFolder(c, fo.id); after();
    } }]);
}

function Sheet({ c, close }: { c: XChar; close: () => void }) {
  const { download, uid, now } = core;
  const redraw = useBump(), [tab, setTab] = useState('대화'), title = useRef<HTMLDivElement>(null);
  const [chats] = useState(() => S.chats.filter(x => x.charIds.includes(c.id)).sort((a, b) => b.updatedAt - a.updatedAt));
  const more = (anchor: Element) => menu(anchor, [
    { label: t('editors.sheet.exportPng'), ic: 'image', onclick: async () => download(`${c.name}.png`, new Blob([await cards.exportCharPng(c) as BlobPart], { type: 'image/png' })) },
    { label: t('editors.sheet.exportJson'), ic: 'import', hint: 'V2', onclick: () => download(`${c.name}.json`, JSON.stringify(cards.charToCard(c), null, 2)) },
    { label: t('editors.sheet.exportJson'), ic: 'import', hint: 'V3', onclick: () => download(`${c.name}.v3.json`, JSON.stringify(cards.charToCard(c, true), null, 2)) },
    { label: t('editors.sheet.folder'), ic: 'folder', hint: folders().find(f => f.id === folderOf(c))?.name || '', onclick: () => folderMenu(title.current || document.body, c, () => { redraw(); pageRefresh(); }) },
    { label: t('common.duplicate'), ic: 'copy', onclick: async () => { await S.save('chars', { ...structuredClone(c), id: uid(), name: c.name + ' (사본)', src: '', createdAt: now() }, true); close(); pageRefresh(); } },
    '-',
    { label: t('editors.sheet.delete'), ic: 'trash', danger: true, onclick: async () => {
      if (!(await confirmBox(tn('editors.sheet.confirmDelete', chats.length, { name: c.name }), t('common.delete'), true))) return;
      await Assets.removeOwner(Assets.ownerOfChar(c.id)).catch(() => { });
      if (S.settings.assets?.chars) delete S.settings.assets.chars[c.id];
      for (const r of S.regex) if (r.scope === c.id) { r.scope = 'global'; r.enabled = false; await S.save('regex', r, true); }
      await S.remove('chars', c.id); close(); pageRefresh();
    } },
  ]);
  return <div className="sheet-pane">
    <div className="sheet-title" ref={title}><h3><InkName name={c.name} /></h3>
      <button className={'ibtn star' + (c.fav ? ' on' : '')} title={t('editors.sheet.fav')} onClick={async () => { c.fav = !c.fav; redraw(); await S.save('chars', c, true); }}><Icon name="star" /></button></div>
    <p className="dim">{[c.creator && `by ${c.creator}`, c.version && `v${c.version}`, tn('editors.sheet.chats', chats.length), t('editors.tokens', { n: charTokens(c).toLocaleString() })].filter(Boolean).join(' · ')}</p>
    {c.tags.length ? <div className="tag-row">{c.tags.map((t, i) => <span className="chip static" key={i}>#{t}</span>)}</div> : null}
    <div className="row wrap">
      <Btn label={t('editors.sheet.startRp')} ic="book" cls="primary" onClick={() => { close(); void startChat([c.id], { mode: 'rp' }); }} />
      <Btn label={t('editors.sheet.startTalk')} ic="chat" onClick={() => { close(); void startChat([c.id], { mode: 'talk' }); }} />
      {chats[0] && <Btn label={t('editors.sheet.resume')} ic="play" onClick={() => { close(); go('chat', chats[0].id); }} />}
      <Btn label={t('common.edit')} ic="edit" onClick={() => { close(); charEditor(c); }} />
      <IconBtn ic="more" title={t('editors.sheet.more')} onClick={e => more(e.currentTarget)} />
    </div>
    <div className="tabs">{['대화', '소개'].map(x => <button key={x} className={'tab' + (x === tab ? ' on' : '')} onClick={() => setTab(x)}>{t(x === '대화' ? 'editors.sheet.tabChats' : 'editors.sheet.tabAbout')}</button>)}</div>
    {tab === '대화'
      ? (chats.length ? <div className="sheet-chats">{chats.slice(0, 8).map(x => <button key={x.id} className="mini-chat" onClick={() => { close(); go('chat', x.id); }}><span>{x.name || x.preview || t('editors.sheet.newChat')}</span><time>{fmtTime(x.updatedAt)}</time></button>)}</div> : <p className="dim">{t('editors.sheet.noChats')}</p>)
      : <div className="sheet-notes">{c.creatorNotes || c.description || t('editors.sheet.noDesc')}</div>}
  </div>;
}

export function charSheet(ch: Char) {
  const c = ch as XChar;
  const m: ModalHandle = openModal({ title: '', wide: true, body: <div className="sheet" ref={tintRef(c)}>
    <div className="sheet-window"><i className="orbit" /><div className="arch lg" style={artStyle(c)}>{!c.avatar && <Emblem o={c} />}</div></div>
    <Sheet c={c} close={() => m.close()} />
  </div> });
}
