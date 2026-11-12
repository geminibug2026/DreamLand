// 캐릭터 프로필 창
import { useRef, useState } from 'react';
import { L } from '../legacy';
import { Btn, Emblem, Icon, IconBtn, InkName, artStyle, tintRef } from '../kit';
import type { Char, Folder } from '../types';
import { assets, cards, core, engine, pageRefresh, store, type XChar } from './bridge';
import { confirmBox, menu, openModal, promptBox, type ModalHandle } from '../ui';
import { useBump } from './parts';
import { charEditor } from './CharEditor';

export const charTokens = (c: XChar) => engine().tokens([c.description, c.personality, c.scenario, c.mesExample, c.systemPrompt, c.postHistory].join('\n'));

// ── 캐릭터 폴더 (홈과 같은 규칙: 폴더 목록은 설정에, 어느 폴더인지는 캐릭터의 folder 에) ──
const folders = (): Folder[] => (L.core.S.settings.folders ||= []);
const folderOf = (c: Char) => folders().some(f => f.id === c.folder) ? c.folder! : '';
async function moveToFolder(c: XChar, folderId: string) { if ((c.folder || '') !== folderId) { c.folder = folderId; await store().save('chars', c, true); } }
function folderMenu(anchor: Element, c: XChar, after: () => void) {
  const cur = folderOf(c);
  menu(anchor, [
    ...folders().map(fo => ({ label: fo.name, ic: cur === fo.id ? 'check' : 'folder', onclick: async () => { await moveToFolder(c, fo.id); after(); } })),
    cur ? { label: '폴더에서 꺼내기', ic: 'x', onclick: async () => { await moveToFolder(c, ''); after(); } } : null,
    folders().length ? '-' : null,
    { label: '새 폴더에 담기', ic: 'plus', onclick: async () => {
      const v = await promptBox('폴더 이름', '', { placeholder: '예: 판타지, 현대물, 친구가 준 카드' }); if (!v?.trim()) return;
      const fo = { id: L.core.uid(), name: v.trim().slice(0, 40) }; folders().push(fo); L.core.S.set({ folders: folders() });
      await moveToFolder(c, fo.id); after();
    } }]);
}

function Sheet({ c, close }: { c: XChar; close: () => void }) {
  const S = store(), { download, uid, now } = core();
  const redraw = useBump(), [tab, setTab] = useState('대화'), title = useRef<HTMLDivElement>(null);
  const [chats] = useState(() => S.chats.filter(x => x.charIds.includes(c.id)).sort((a, b) => b.updatedAt - a.updatedAt));
  const more = (anchor: Element) => menu(anchor, [
    { label: 'PNG 카드로 내보내기', ic: 'image', onclick: async () => download(`${c.name}.png`, new Blob([await cards().exportCharPng(c)], { type: 'image/png' })) },
    { label: 'JSON 으로 내보내기', ic: 'import', hint: 'V2', onclick: () => download(`${c.name}.json`, JSON.stringify(cards().charToCard(c), null, 2)) },
    { label: 'JSON 으로 내보내기', ic: 'import', hint: 'V3', onclick: () => download(`${c.name}.v3.json`, JSON.stringify(cards().charToCard(c, true), null, 2)) },
    { label: '폴더에 담기', ic: 'folder', hint: folders().find(f => f.id === folderOf(c))?.name || '', onclick: () => folderMenu(title.current || document.body, c, () => { redraw(); pageRefresh(); }) },
    { label: '복제', ic: 'copy', onclick: async () => { await S.save('chars', { ...structuredClone(c), id: uid(), name: c.name + ' (사본)', src: '', createdAt: now() }, true); close(); pageRefresh(); } },
    '-',
    { label: '캐릭터 삭제', ic: 'trash', danger: true, onclick: async () => {
      if (!(await confirmBox(`${c.name} 을(를) 삭제할까요? 대화 ${chats.length}개는 남겨 둡니다.`, '삭제', true))) return;
      await assets().removeOwner(assets().ownerOfChar(c.id)).catch(() => { });
      if (S.settings.assets?.chars) delete S.settings.assets.chars[c.id];
      for (const r of S.regex) if (r.scope === c.id) { r.scope = 'global'; r.enabled = false; await S.save('regex', r, true); }
      await S.remove('chars', c.id); close(); pageRefresh();
    } },
  ]);
  return <div className="sheet-pane">
    <div className="sheet-title" ref={title}><h3><InkName name={c.name} /></h3>
      <button className={'ibtn star' + (c.fav ? ' on' : '')} title="즐겨찾기" onClick={async () => { c.fav = !c.fav; redraw(); await S.save('chars', c, true); }}><Icon name="star" /></button></div>
    <p className="dim">{[c.creator && `by ${c.creator}`, c.version && `v${c.version}`, `대화 ${chats.length}개`, `≈${charTokens(c).toLocaleString()} 토큰`].filter(Boolean).join(' · ')}</p>
    {c.tags.length ? <div className="tag-row">{c.tags.map((t, i) => <span className="chip static" key={i}>#{t}</span>)}</div> : null}
    <div className="row wrap">
      <Btn label="RP 시작" ic="book" cls="primary" onClick={() => { close(); void L.chat.startChat([c.id], { mode: 'rp' }); }} />
      <Btn label="대화 시작" ic="chat" onClick={() => { close(); void L.chat.startChat([c.id], { mode: 'talk' }); }} />
      {chats[0] && <Btn label="이어서" ic="play" onClick={() => { close(); L.ui.go('chat', chats[0].id); }} />}
      <Btn label="편집" ic="edit" onClick={() => { close(); charEditor(c); }} />
      <IconBtn ic="more" title="내보내기 · 복제 · 삭제" onClick={e => more(e.currentTarget)} />
    </div>
    <div className="tabs">{['대화', '소개'].map(t => <button key={t} className={'tab' + (t === tab ? ' on' : '')} onClick={() => setTab(t)}>{t}</button>)}</div>
    {tab === '대화'
      ? (chats.length ? <div className="sheet-chats">{chats.slice(0, 8).map(x => <button key={x.id} className="mini-chat" onClick={() => { close(); L.ui.go('chat', x.id); }}><span>{x.name || x.preview || '새 대화'}</span><time>{L.core.fmtTime(x.updatedAt)}</time></button>)}</div> : <p className="dim">아직 대화가 없어요.</p>)
      : <div className="sheet-notes">{c.creatorNotes || c.description || '설명이 아직 없어요.'}</div>}
  </div>;
}

export function charSheet(ch: Char) {
  const c = ch as XChar;
  const m: ModalHandle = openModal({ title: '', wide: true, body: <div className="sheet" ref={tintRef(c)}>
    <div className="sheet-window"><i className="orbit" /><div className="arch lg" style={artStyle(c)}>{!c.avatar && <Emblem o={c} />}</div></div>
    <Sheet c={c} close={() => m.close()} />
  </div> });
}
