// 홈: 오늘 밤의 창 · 이어서 · 캐릭터 목록(폴더 · 정렬 · 검색 · 카드 크기)
import { useEffect, useRef, useState, type DragEvent, type ReactNode } from 'react';
import { L } from '../legacy';
import { Btn, Emblem, Icon, IconBtn, InkName, Moon, artStyle, tintRef, useEvents } from '../kit';
import type { Char, Folder } from '../types';
import { charPicker, confirmBox, menu, promptBox, usePaged } from '../ui';

// 화면을 떠났다 돌아와도 남는 보기 상태. folder: '' 전체 · '-' 폴더 없음 · 폴더 id
const view = { q: '', sort: 'recent' as 'recent' | 'new' | 'name', tag: '', fav: false, pick: 0, folder: '' };

// ── 캐릭터 폴더: 폴더 목록은 설정에, 어느 폴더인지는 캐릭터의 folder 에 둔다 ──
const folders = (): Folder[] => (L.core.S.settings.folders ||= []);
const folderOf = (c: Char) => folders().some(f => f.id === c.folder) ? c.folder! : '';
const saveFolders = () => L.core.S.set({ folders: folders() });
async function newFolder(): Promise<Folder | null> {
  const v = await promptBox('폴더 이름', '', { placeholder: '예: 판타지, 현대물, 친구가 준 카드' }); if (!v?.trim()) return null;
  const fo = { id: L.core.uid(), name: v.trim().slice(0, 40) }; folders().push(fo); saveFolders(); return fo;
}
async function moveToFolder(ids: string[], folderId: string) {
  const S = L.core.S;
  for (const id of ids) { const c = S.get('chars', id); if (c && (c.folder || '') !== folderId) { c.folder = folderId; await S.save('chars', c, true); } }
}
/** 캐릭터 한 명을 담을 폴더 고르기 */
function folderMenu(anchor: Element, c: Char, after: () => void) {
  const cur = folderOf(c);
  menu(anchor, [
    ...folders().map(fo => ({ label: fo.name, ic: cur === fo.id ? 'check' : 'folder', onclick: async () => { await moveToFolder([c.id], fo.id); after(); } })),
    cur ? { label: '폴더에서 꺼내기', ic: 'x', onclick: async () => { await moveToFolder([c.id], ''); after(); } } : null,
    folders().length ? '-' : null,
    { label: '새 폴더에 담기', ic: 'plus', onclick: async () => { const fo = await newFolder(); if (fo) { await moveToFolder([c.id], fo.id); after(); } } }]);
}

const firstLine = (c: Char) => (c.creatorNotes || c.personality || c.scenario || c.description || '').replace(/<[^>]+>/g, ' ').replace(/[#*_>`]/g, '').split(/\n/).map(s => s.trim()).find(Boolean)?.slice(0, 80) || '';
const phaseDate = (i: number) => new Date(Date.UTC(2000, 0, 6, 18, 14) + (i / 8 + 0.002) * 29.530588853 * 864e5);
const SIZES = [['', '크게'], ['cols-3', '보통'], ['cols-4', '작게']] as const;

/** 오늘 밤: 달의 위상 + 최근에 만난 캐릭터 */
function Stage({ picks, redraw }: { picks: Char[]; redraw: () => void }) {
  const el = useRef<HTMLDivElement>(null);
  const now = new Date(), moon = L.ui.moonPhase(now), cur = Math.round(moon.p * 8) % 8;
  const c: Char | undefined = picks[view.pick % Math.max(1, picks.length)];
  useEffect(() => { if (el.current) L.tone.tint(el.current, c ?? null); });
  const sky = <div className="dream-sky">
    <div className="moon-row">{Array.from({ length: 8 }, (_, i) => <span key={i} className={i === cur ? 'on' : undefined}><Moon size={i === cur ? 22 : 15} date={phaseDate(i)} /></span>)}</div>
    <small>{`${now.toLocaleDateString('ko-KR', { month: 'long', day: 'numeric', weekday: 'long' })} · ${moon.name}`}</small>
  </div>;
  if (!c) return <div className="dream" ref={el}>
    <div className="dream-text">{sky}<h2 className="dream-name">첫 꿈을 불러와요</h2>
      <div className="dream-actions"><Btn label="이식 센터" ic="folder" cls="primary" onClick={() => L.ui.go('import')} /><Btn label="카드 가져오기" ic="import" onClick={() => void L.editors.importDialog()} /><Btn label="API 연결" ic="plug" onClick={() => L.ui.go('conns')} /></div></div>
    <div className="dream-window blank"><i className="ellipse" /><i className="star s1">✦</i>
      <div className="print main blank"><i className="crescent" /><i className="halftone" /><i className="star s2">✧</i></div></div>
  </div>;
  const last = L.core.S.chats.filter(x => x.charIds.includes(c.id)).sort((a, b) => b.updatedAt - a.updatedAt)[0];
  const line = firstLine(c);
  return <div className="dream" ref={el}>
    <div className="dream-text">{sky}
      <h2 className="dream-name"><InkName name={c.name} /></h2>{line && <p className="dream-line">{line}</p>}
      {c.tags.length ? <div className="dream-tags">{c.tags.slice(0, 4).map(t => <span key={t}>#{t}</span>)}</div> : null}
      <div className="dream-actions">
        {last && <Btn label="이어서" ic="play" cls="primary" onClick={() => L.ui.go('chat', last.id)} />}
        <Btn label="새 대화" ic="chat" onClick={e => L.chat.startMenu(e.currentTarget, [c.id])} />
        <Btn label="프로필" ic="user" cls="ghost" onClick={() => L.editors.charSheet(c)} />
      </div>
    </div>
    <div className="dream-window"><i className="bigmoon"><Moon size={190} date={now} /></i><i className="halftone" /><i className="ellipse" /><i className="star s1">✦</i><i className="star s2">✧</i><i className="rule" />
      <button className="print main" style={artStyle(c)} title={c.name} onClick={() => L.editors.charSheet(c)}>{!c.avatar && <Emblem o={c} />}</button>
      {c.avatar ? <i className="print detail" style={artStyle(c)} /> : null}
      {picks.length > 1 ? <div className="dots">{picks.map((p, i) => <button key={p.id} className={i === view.pick % picks.length ? 'on' : undefined} title={p.name} onClick={() => { view.pick = i; redraw(); }} />)}</div> : null}
    </div>
  </div>;
}

const SecHead = ({ title, children }: { title: string; children?: ReactNode }) => <header className="sec-head"><Moon size={16} /><h2>{title}</h2><i />{children}</header>;

export const page = { name: 'home', Component: Home };

function Home() {
  const redraw = useEvents('chars', 'chats');
  const [q, setQ] = useState(view.q);
  const S = L.core.S, fs = folders();
  if (view.folder && view.folder !== '-' && !fs.some(f => f.id === view.folder)) view.folder = '';

  const lastUse = new Map<string, number>(); for (const c of S.chats) for (const id of c.charIds) lastUse.set(id, Math.max(lastUse.get(id) || 0, c.updatedAt));
  const used = (c: Char) => lastUse.get(c.id) || c.createdAt;
  const picks = [...S.chars].sort((a, b) => used(b) - used(a)).slice(0, 5);
  const recent = [...S.chats].sort((a, b) => b.updatedAt - a.updatedAt).slice(0, 8);
  const tags = [...new Set(S.chars.flatMap(c => c.tags))].slice(0, 12);

  const inFolder = (c: Char) => !view.folder || (view.folder === '-' ? !folderOf(c) : folderOf(c) === view.folder);
  const term = q.toLowerCase();
  const list = S.chars.filter(c => inFolder(c) && (!term || (c.name + ' ' + c.tags.join(' ') + ' ' + (c.creator ?? '')).toLowerCase().includes(term)) && (!view.tag || c.tags.includes(view.tag)) && (!view.fav || c.fav))
    .sort((a, b) => view.sort === 'name' ? a.name.localeCompare(b.name, 'ko') : view.sort === 'new' ? b.createdAt - a.createdAt : used(b) - used(a));

  const size = Math.min(SIZES.length - 1, S.settings.homeCols || 0);
  // 캐릭터 격자 쪽 나누기: 한 쪽 개수는 사용자가 고른다 (실리태번처럼 10 ~ 1000, 기본 50)
  const grid = useRef<HTMLDivElement | null>(null);
  const pg = usePaged(list, { id: 'home-v2', perPage: 50, sizes: [10, 25, 50, 100, 250, 500, 1000], resetKey: [q, view.sort, view.tag, view.fav, view.folder].join('|') });
  const set = (patch: Partial<typeof view>) => { Object.assign(view, patch); redraw(); };
  const addFolder = async () => { const fo = await newFolder(); if (fo) set({ folder: fo.id }); };

  // 폴더 탭: 누르면 그 폴더만, 카드를 끌어다 놓으면 담긴다
  const count = (id: string) => S.chars.filter(c => (id === '-' ? !folderOf(c) : folderOf(c) === id)).length;
  const drop = (id: string) => ({
    onDragOver: (e: DragEvent<HTMLButtonElement>) => { e.preventDefault(); e.currentTarget.classList.add('over'); },
    onDragLeave: (e: DragEvent<HTMLButtonElement>) => e.currentTarget.classList.remove('over'),
    onDrop: async (e: DragEvent<HTMLButtonElement>) => { e.preventDefault(); e.currentTarget.classList.remove('over'); const cid = e.dataTransfer.getData('text/dreamland-char'); if (cid) { await moveToFolder([cid], id === '-' ? '' : id); redraw(); } },
  });
  const tab = (id: string, name: string, extra = {}) => <button key={id || 'all'} className={'folder-tab' + (view.folder === id ? ' on' : '')} onClick={() => set({ folder: id })} {...extra}><span>{name}</span><em>{id ? count(id) : S.chars.length}</em></button>;
  const shelf = !fs.length
    ? <button className="folder-tab add" title="캐릭터를 묶어 둘 폴더를 만듭니다" onClick={addFolder}><Icon name="plus" size={14} />폴더 만들기</button>
    : <>{tab('', '전체')}{fs.map(fo => tab(fo.id, fo.name, drop(fo.id)))}{tab('-', '폴더 없음', drop('-'))}<button className="folder-tab add" title="새 폴더" onClick={addFolder}><Icon name="plus" size={14} /></button></>;

  const fo = fs.find(f => f.id === view.folder);
  const swap = (d: -1 | 1) => { if (!fo) return; const i = fs.indexOf(fo), j = i + d; if (j < 0 || j >= fs.length) return; [fs[i], fs[j]] = [fs[j], fs[i]]; saveFolders(); redraw(); };
  const folderBar = fo && <div className="folder-bar"><Icon name="folder" size={16} /><b>{fo.name}</b>
    <Btn label="캐릭터 담기" ic="plus" cls="ghost" onClick={() => charPicker({
      title: `"${fo.name}"에 담을 캐릭터`, selected: S.chars.filter(c => folderOf(c) === fo.id).map(c => c.id),
      note: c => { const o = fs.find(f => f.id === folderOf(c)); return o && o.id !== fo.id ? o.name : ''; },
      onDone: async ids => { const keep = new Set(ids); await moveToFolder(S.chars.filter(c => folderOf(c) === fo.id && !keep.has(c.id)).map(c => c.id), ''); await moveToFolder(ids, fo.id); redraw(); },
    })} />
    <IconBtn ic="more" title="폴더 이름 · 삭제" onClick={e => menu(e.currentTarget, [
      { label: '이름 바꾸기', ic: 'edit', onclick: async () => { const v = await promptBox('폴더 이름', fo.name); if (v?.trim()) { fo.name = v.trim().slice(0, 40); saveFolders(); redraw(); } } },
      { label: '왼쪽으로', ic: 'play', onclick: () => swap(-1) },
      { label: '오른쪽으로', ic: 'play', onclick: () => swap(1) },
      '-',
      { label: '폴더 삭제', ic: 'trash', danger: true, hint: '캐릭터는 남아요', onclick: async () => {
        if (!(await confirmBox(`"${fo.name}" 폴더를 삭제할까요? 안에 있던 캐릭터는 지워지지 않고 폴더 없음으로 돌아갑니다.`, '삭제', true))) return;
        await moveToFolder(S.chars.filter(c => c.folder === fo.id).map(c => c.id), ''); S.set({ folders: fs.filter(f => f !== fo) }); set({ folder: '' });
      } }])} />
  </div>;

  const folderTag = (c: Char) => { const o = !view.folder && fs.find(f => f.id === folderOf(c)); return o ? <i className="in-folder"><Icon name="folder" size={11} />{o.name}</i> : null; };
  const addChar = async () => { const c = await S.save('chars', L.core.newChar({ folder: view.folder && view.folder !== '-' ? view.folder : '' }), true); L.editors.charEditor(c); };

  return <section className="home">
    <Stage picks={picks} redraw={redraw} />
    {recent.length ? <div><SecHead title="이어서" />
      <div className="threads">{recent.map(c => {
        const chars = c.charIds.map(id => S.get('chars', id)).filter((x): x is Char => !!x), first = chars[0];
        return <button key={c.id} className="thread" ref={tintRef(first)} onClick={() => L.ui.go('chat', c.id)}>
          <div className="arch sm" style={artStyle(first)}>{first ? !first.avatar && <Emblem o={first} mini /> : <span>?</span>}</div>
          <div className="thread-text"><b>{chars.map(x => x.name).join(', ') || '삭제된 캐릭터'}</b><small>{c.preview || '새 대화'}</small><time>{L.core.fmtTime(c.updatedAt)}</time></div>
        </button>;
      })}</div></div> : null}
    <div>
      <SecHead title="캐릭터"><span className="count">{list.length}명</span>
        <button className="btn ghost size-btn" title={`카드 크기: ${SIZES[size][1]} (누르면 바뀝니다)`} onClick={() => { S.set({ homeCols: (size + 1) % SIZES.length }); redraw(); }}><Icon name="grip" size={15} /><span>{SIZES[size][1]}</span></button>
        <Btn label="가져오기" ic="import" cls="ghost" onClick={() => void L.editors.importDialog()} />
      </SecHead>
      <div className="filter-row">
        {([['recent', '최근'], ['new', '신규'], ['name', '이름']] as const).map(([k, l]) => <button key={k} className={'chip' + (view.sort === k && !view.fav ? ' on' : '')} onClick={() => set({ sort: k, fav: false })}>{l}</button>)}
        <button className={'chip' + (view.fav ? ' on' : '')} onClick={() => set({ fav: !view.fav })}>즐겨찾기</button>
        {tags.map(t => <button key={t} className={'chip' + (view.tag === t ? ' on' : '')} onClick={() => set({ tag: view.tag === t ? '' : t })}>#{t}</button>)}
        <div className="search-wrap"><Icon name="search" size={15} /><input className="inp search" placeholder="캐릭터 검색" value={q} onChange={e => { view.q = e.target.value; setQ(e.target.value); }} /></div>
      </div>
      <div className="folder-row">{shelf}</div>
      {folderBar}
      <div className={'arch-grid' + (SIZES[size][0] ? ' ' + SIZES[size][0] : '')} ref={el => { grid.current = el; pg.listRef(el); }}>
        {pg.rows.map(c => <button key={c.id} className="arch-card" ref={tintRef(c)} draggable={fs.length > 0}
          onDragStart={e => { e.dataTransfer.setData('text/dreamland-char', c.id); e.dataTransfer.effectAllowed = 'move'; }}
          onClick={() => L.editors.charSheet(c)} onContextMenu={e => { e.preventDefault(); folderMenu(e.currentTarget, c, redraw); }}>
          <div className="arch" style={artStyle(c)}>{!c.avatar && <Emblem o={c} />}{c.fav && <i className="fav"><Icon name="star" size={12} /></i>}{folderTag(c)}</div>
          <b>{c.name}</b><small>{firstLine(c) || c.tags.slice(0, 3).map(t => '#' + t).join(' ') || ' '}</small>
        </button>)}
        {!list.length && view.folder && view.folder !== '-' ? <p className="dim folder-empty">이 폴더는 아직 비어 있어요. 위의 "캐릭터 담기"로 한 번에 넣거나, 전체 목록에서 카드를 폴더 탭으로 끌어다 놓으세요.</p> : null}
        <button className="arch-card add" onClick={() => void addChar()}><div className="arch"><Icon name="plus" size={26} /></div><b>새 캐릭터</b><small>직접 만들기</small></button>
      </div>
      {pg.pager}
    </div>
  </section>;
}
