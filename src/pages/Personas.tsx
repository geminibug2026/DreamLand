// 페르소나: 이름 · 초상 · 설명 + 연결(기본 · 캐릭터 · 대화) · 로어북 · 에셋
import { useMemo } from 'react';
import { Avatar, Btn, IconBtn } from '../kit';
import { Form, LibraryPage, Shelf, charPicker, confirmBox, toast } from '../ui';
import { chatPicker, roomLabel } from '../editors/ChatPicker';
import { LorePicker } from '../editors/lore';
import type { Persona, XChat } from '../editors/types';
import { editorApi, useBump, useDebounced, type EditorApi } from '../editors/parts';
import { Assets } from '../lib/assets';
import { S } from '../lib/core';
import { AssetsPane } from '../studio/AssetsPane';
import * as engine from '../lib/engine';
import * as core from '../lib/core';
import { t } from '../i18n';

export const page = { name: 'personas', Component: PersonasPage };

/** 페르소나 연결: 대화 > 캐릭터 > 기본 순으로 적용된다 */
function PersonaLinks({ p, api }: { p: Persona; api: EditorApi }) {
  const draw = useBump();
  const chars = S.chars, mine = chars.filter(c => c.bind?.personaId === p.id), chats = S.chats.filter(c => c.personaId === p.id && c.personaAuto === false).sort((a, b) => b.updatedAt - a.updatedAt);
  const cur = S.get('chats', S.settings.lastChat);
  const nameOf = (c: XChat) => c.charIds.map(i => S.get('chars', i)?.name).filter(Boolean).join(', ') || t('editors.picker.deletedChar');
  const other = (id?: string) => { const o = id && id !== p.id ? S.get('personas', id)?.name : ''; return o ? t('personas.links.current', { name: o }) : ''; };
  return <div className="card links">
    <h3 className="form-sec">{t('personas.links.title')}</h3><p className="hint">{t('personas.links.hint')}</p>
    <div className="link-row"><span className="field-label">{t('personas.links.default')}</span>{p.id === S.settings.activePersona ? <em className="badge on">{t('personas.defaultPersona')}</em> : <Btn label={t('personas.links.useDefault')} ic="check" cls="ghost" onClick={() => { S.set({ activePersona: p.id }); api.refresh(); }} />}</div>
    <div className="link-row"><span className="field-label">{t('personas.links.chars')}</span><div className="link-chips">
      {mine.map(c => <button key={c.id} className="chip with-av on" title={t('personas.links.unlink')} onClick={async () => { c.bind = { ...(c.bind || {}), personaId: '' }; await S.save('chars', c, true); draw(); }}><Avatar o={c} cls="xs" />{c.name}{' ✕'}</button>)}
      <Btn label={t('personas.links.pickChars')} ic="search" cls="ghost" onClick={() => charPicker({ title: t('personas.links.pickCharsTitle', { name: p.name }), selected: mine.map(c => c.id), note: c => other(S.get('chars', c.id)?.bind?.personaId),
        onDone: async ids => { for (const c of S.chars) { const want = ids.includes(c.id), has = c.bind?.personaId === p.id; if (want !== has) { c.bind = c.bind ? { ...c.bind, personaId: want ? p.id : '' } : { connId: '', presetId: '', personaId: want ? p.id : '' }; await S.save('chars', c, true); } } draw(); } })} />
    </div></div>
    <div className="link-row"><span className="field-label">{t('personas.links.chats')}</span><div className="link-chips">
      {chats.slice(0, 8).map(c => <button key={c.id} className="chip on" title={t('personas.links.unlink')} onClick={async () => { c.personaId = ''; c.personaAuto = undefined; await S.save('chats', c, true); draw(); }}>{nameOf(c)}{' · '}{roomLabel(c).slice(0, 18)}{' ✕'}</button>)}
      {chats.length > 8 ? <small className="hint">{t('personas.links.more', { n: chats.length - 8 })}</small> : null}
      <Btn label={chats.length ? t('personas.links.pickChatsN', { n: chats.length }) : t('editors.picker.title')} ic="search" cls="ghost" onClick={() => chatPicker({ title: t('personas.links.pickChatsTitle', { name: p.name }), selected: chats.map(c => c.id), note: c => other(c.personaId),
        onDone: async ids => { for (const c of S.chats) { const want = ids.includes(c.id), has = c.personaId === p.id && c.personaAuto === false; if (want !== has) { c.personaId = want ? p.id : ''; c.personaAuto = want ? false : undefined; await S.save('chats', c, true); } } draw(); } })} />
      {cur && !(cur.personaId === p.id && cur.personaAuto === false) ? <Btn label={t('personas.links.linkCurrent', { name: nameOf(cur) })} ic="plus" cls="ghost" onClick={async () => { cur.personaId = p.id; cur.personaAuto = false; await S.save('chats', cur, true); draw(); }} /> : null}
    </div></div>
  </div>;
}

function PersonaEditor({ p, api }: { p: Persona; api: EditorApi }) {
  const A = Assets;
  const changed = useDebounced(() => { void api.save(); api.redraw(); }, 400), save = useDebounced(() => api.save(), 300);
  const hint = useMemo(() => t('editors.tokens', { n: engine.tokens(p.description) }), [p]);   // 열 때의 값 (옛 것과 같게)
  return <div className="editor">
    <header className="editor-head"><h2>{p.name}</h2><div className="row">
      {p.id === S.settings.activePersona ? <em className="badge on">{t('personas.links.default')}</em> : <Btn label={t('personas.makeDefault')} ic="check" cls="primary" onClick={() => { S.set({ activePersona: p.id }); api.refresh(); }} />}
      <IconBtn ic="trash" title={t('common.delete')} onClick={async () => {
        if (S.personas.length < 2) return toast(t('personas.lastOne'));
        if (await confirmBox(t('personas.confirmDelete', { name: p.name }), t('common.delete'), true)) { await A.removeOwner(A.ownerOfPersona(p.id)).catch(() => { }); await S.remove('personas', p.id); if (S.settings.activePersona === p.id) S.set({ activePersona: S.personas[0].id }); api.refresh(); }
      }} />
    </div></header>
    <Form obj={p} defs={[{ k: 'name', label: t('common.name'), hint: t('personas.f.nameHint') }, { k: 'avatar', label: t('editors.char.f.avatar'), type: 'image' }, { k: 'description', label: t('editors.char.f.description'), type: 'area', rows: 10, hint }]} onChange={changed} />
    <PersonaLinks p={p} api={api} />
    <LorePicker holder={p} save={save} hint={t('personas.loreHint')} />
    <span style={{ display: 'contents' }}><AssetsPane owner={A.ownerOfPersona(p.id)} holder={p} save={save} /></span>
  </div>;
}

function PersonasPage({ arg }: { arg?: unknown }) {
  return <LibraryPage<Persona> arg={arg} title={t('personas.title')} eyebrow="persona" coll="personas" ic="user" thumb={p => <Avatar o={p} cls="sm" />} create={() => core.newPersona({ name: '새 페르소나' })} label={p => p.name}
    sub={p => p.id === S.settings.activePersona ? t('personas.defaultPersona') : (p.description.slice(0, 40) || ' ')}
    list={ctx => <Shelf ctx={ctx} coll="personas" active={S.settings.activePersona} text={p => p.name + ' ' + (p.description || '')} pageSize={20} placeholder={t('personas.search')} />}
    editor={(p, api) => <PersonaEditor p={p} api={editorApi(api, 'personas')} />} />;
}
