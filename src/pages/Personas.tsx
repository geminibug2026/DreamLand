// 페르소나: 이름 · 초상 · 설명 + 연결(기본 · 캐릭터 · 대화) · 로어북 · 에셋
import { useMemo } from 'react';
import { Avatar, Btn, IconBtn } from '../kit';
import { Form, LibraryPage, charPicker, confirmBox, toast } from '../ui';
import { chatPicker, roomLabel } from '../editors/ChatPicker';
import { LorePicker } from '../editors/lore';
import { NEEDS, assets, core, engine, store, studio, type Persona, type XChat } from '../editors/bridge';
import { Host, editorApi, useBump, useDebounced, type EditorApi } from '../editors/parts';

export const page = { name: 'personas', Component: PersonasPage, needs: NEEDS };

/** 페르소나 연결: 대화 > 캐릭터 > 기본 순으로 적용된다 */
function PersonaLinks({ p, api }: { p: Persona; api: EditorApi }) {
  const S = store(), draw = useBump();
  const chars = S.chars, mine = chars.filter(c => c.bind?.personaId === p.id), chats = S.chats.filter(c => c.personaId === p.id && c.personaAuto === false).sort((a, b) => b.updatedAt - a.updatedAt);
  const cur = S.get('chats', S.settings.lastChat);
  const nameOf = (c: XChat) => c.charIds.map(i => S.get('chars', i)?.name).filter(Boolean).join(', ') || '삭제된 캐릭터';
  const other = (id?: string) => { const o = id && id !== p.id ? S.get('personas', id)?.name : ''; return o ? `지금은 "${o}"` : ''; };
  return <div className="card links">
    <h3 className="form-sec">연결</h3><p className="hint">어떤 대화에서 이 페르소나로 말할지 정합니다. 대화에 연결한 것이 가장 먼저, 그다음 캐릭터에 연결한 것, 마지막이 기본 페르소나입니다.</p>
    <div className="link-row"><span className="field-label">기본</span>{p.id === S.settings.activePersona ? <em className="badge on">기본 페르소나</em> : <Btn label="기본으로 쓰기" ic="check" cls="ghost" onClick={() => { S.set({ activePersona: p.id }); api.refresh(); }} />}</div>
    <div className="link-row"><span className="field-label">캐릭터</span><div className="link-chips">
      {mine.map(c => <button key={c.id} className="chip with-av on" title="눌러서 연결 풀기" onClick={async () => { c.bind = { ...(c.bind || {}), personaId: '' }; await S.save('chars', c, true); draw(); }}><Avatar o={c} cls="xs" />{c.name}{' ✕'}</button>)}
      <Btn label="캐릭터 고르기" ic="search" cls="ghost" onClick={() => charPicker({ title: `${p.name}(으)로 말할 캐릭터`, selected: mine.map(c => c.id), note: c => other(S.get('chars', c.id)?.bind?.personaId),
        onDone: async ids => { for (const c of S.chars) { const want = ids.includes(c.id), has = c.bind?.personaId === p.id; if (want !== has) { c.bind = { connId: '', presetId: '', ...(c.bind || {}), personaId: want ? p.id : '' }; await S.save('chars', c, true); } } draw(); } })} />
    </div></div>
    <div className="link-row"><span className="field-label">대화</span><div className="link-chips">
      {chats.slice(0, 8).map(c => <button key={c.id} className="chip on" title="눌러서 연결 풀기" onClick={async () => { c.personaId = ''; c.personaAuto = undefined; await S.save('chats', c, true); draw(); }}>{nameOf(c)}{' · '}{roomLabel(c).slice(0, 18)}{' ✕'}</button>)}
      {chats.length > 8 ? <small className="hint">{`외 ${chats.length - 8}개`}</small> : null}
      <Btn label={chats.length ? `대화방 고르기 (${chats.length})` : '대화방 고르기'} ic="search" cls="ghost" onClick={() => chatPicker({ title: `${p.name}(으)로 말할 대화방`, selected: chats.map(c => c.id), note: c => other(c.personaId),
        onDone: async ids => { for (const c of S.chats) { const want = ids.includes(c.id), has = c.personaId === p.id && c.personaAuto === false; if (want !== has) { c.personaId = want ? p.id : ''; c.personaAuto = want ? false : undefined; await S.save('chats', c, true); } } draw(); } })} />
      {cur && !(cur.personaId === p.id && cur.personaAuto === false) ? <Btn label={`지금 대화(${nameOf(cur)})에 연결`} ic="plus" cls="ghost" onClick={async () => { cur.personaId = p.id; cur.personaAuto = false; await S.save('chats', cur, true); draw(); }} /> : null}
    </div></div>
  </div>;
}

function PersonaEditor({ p, api }: { p: Persona; api: EditorApi }) {
  const S = store(), A = assets();
  const changed = useDebounced(() => { void api.save(); api.redraw(); }, 400), save = useDebounced(() => api.save(), 300);
  const pane = useMemo(() => studio().assetsPane(A.ownerOfPersona(p.id), p, save), [A, p, save]);
  const hint = useMemo(() => `≈${engine().tokens(p.description)} 토큰`, [p]);   // 열 때의 값 (옛 것과 같게)
  return <div className="editor">
    <header className="editor-head"><h2>{p.name}</h2><div className="row">
      {p.id === S.settings.activePersona ? <em className="badge on">기본</em> : <Btn label="기본으로" ic="check" cls="primary" onClick={() => { S.set({ activePersona: p.id }); api.refresh(); }} />}
      <IconBtn ic="trash" title="삭제" onClick={async () => {
        if (S.personas.length < 2) return toast('마지막 페르소나는 지울 수 없어요');
        if (await confirmBox(`"${p.name}" 페르소나를 삭제할까요?`, '삭제', true)) { await A.removeOwner(A.ownerOfPersona(p.id)).catch(() => { }); await S.remove('personas', p.id); if (S.settings.activePersona === p.id) S.set({ activePersona: S.personas[0].id }); api.refresh(); }
      }} />
    </div></header>
    <Form obj={p} defs={[{ k: 'name', label: '이름', hint: '{{user}} 로 쓰입니다.' }, { k: 'avatar', label: '초상', type: 'image' }, { k: 'description', label: '설명', type: 'area', rows: 10, hint }]} onChange={changed} />
    <PersonaLinks p={p} api={api} />
    <LorePicker holder={p} save={save} hint="이 페르소나로 말하는 대화에서 함께 쓰는 로어북입니다." />
    <Host node={pane} />
  </div>;
}

function PersonasPage({ arg }: { arg?: unknown }) {
  const S = store();
  return <LibraryPage<Persona> arg={arg} title="페르소나" eyebrow="persona" coll="personas" ic="user" thumb={p => <Avatar o={p} cls="sm" />} create={() => core().newPersona({ name: '새 페르소나' })} label={p => p.name}
    sub={p => p.id === S.settings.activePersona ? '기본 페르소나' : (p.description.slice(0, 40) || ' ')}
    editor={(p, api) => <PersonaEditor p={p} api={editorApi(api, 'personas')} />} />;
}
