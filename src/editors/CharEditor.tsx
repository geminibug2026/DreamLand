// 캐릭터 편집기: 기본 · 설정 · 인사말 · 에셋 · 고급 정의
import { useEffect, useRef, useState } from 'react';
import { Btn, IconBtn } from '../kit';
import type { Char } from '../types';
import { Form, confirmBox, openModal, type FormDefs } from '../ui';
import type { XChar } from './types';
import { useBump, useDebounced } from './parts';
import { charTokens } from './CharSheet';
import { LoreLinker } from './lore';
import { Assets } from '../lib/assets';
import { pageRefresh } from './refresh';
import { S, chatConns } from '../lib/core';
import { CharVoiceField } from '../tts/ui';
import { AssetsPane } from '../studio/AssetsPane';
import * as engine from '../lib/engine';
import { t } from '../i18n';

const TABS = ['기본', '설정', '인사말', '에셋', '고급 정의'] as const;
const TAB_KEY: Record<typeof TABS[number], string> = { '기본': 'editors.char.tab.basic', '설정': 'editors.char.tab.settings', '인사말': 'editors.char.tab.greetings', '에셋': 'editors.char.tab.assets', '고급 정의': 'editors.char.tab.advanced' };
const tokText = (v: unknown) => v ? t('editors.tokens', { n: engine.tokens(String(v)).toLocaleString() }) : '';

/** 카드에 실려 온 나머지 필드: 고쳐 쓸 수 있게 JSON 으로 보여 준다 */
function JsonField({ c, k, label, hint, save }: { c: XChar; k: 'ext' | 'more'; label: string; hint: string; save: () => void }) {
  const [bad, setBad] = useState(false);
  return <label className="field"><span className="field-label">{label}</span>
    <textarea className="inp af-json" rows={4} spellCheck={false} placeholder="{ }" defaultValue={Object.keys(c[k] || {}).length ? JSON.stringify(c[k], null, 2) : ''} onChange={e => {
      const v = e.target.value.trim();
      try { const j: unknown = v ? JSON.parse(v) : {}; if (!j || typeof j !== 'object' || Array.isArray(j)) throw new Error(); c[k] = j as Record<string, unknown>; setBad(false); save(); } catch { setBad(true); }
    }} />
    <small className={'hint' + (bad ? ' bad' : '')}>{bad ? t('editors.char.jsonBad') : hint}</small></label>;
}

function Greets({ c, save }: { c: XChar; save: () => void }) {
  const redraw = useBump(), gen = useRef(0), alt = c.altGreetings ||= [];
  const again = () => { gen.current++; redraw(); };   // 순서 · 개수가 바뀌면 칸을 새로 만든다
  const swap = (i: number, j: number) => { [alt[i], alt[j]] = [alt[j], alt[i]]; save(); again(); };
  return <div className="greets">
    <label className="field"><span className="field-label">{t('editors.char.greet.first')}</span><textarea className="inp" rows={7} spellCheck={false} defaultValue={c.firstMes ?? ''} onChange={e => { c.firstMes = e.target.value; save(); }} /></label>
    <p className="hint">{t('editors.char.greet.hint')}</p>
    {alt.map((g, i) => <label className="field" key={`${gen.current}-${i}`}>
      <span className="field-label">{t('editors.char.greet.alt', { n: i + 1 })}<em className="tok">{g ? t('editors.tokens', { n: engine.tokens(g).toLocaleString() }) : ''}</em>
        <IconBtn ic="up" title={t('editors.moveUp')} cls="tiny" onClick={() => { if (i > 0) swap(i, i - 1); }} />
        <IconBtn ic="down" title={t('editors.moveDown')} cls="tiny" onClick={() => { if (i < alt.length - 1) swap(i, i + 1); }} />
        <IconBtn ic="trash" title={t('common.delete')} cls="tiny" onClick={async () => { if ((alt[i] || '').trim() && !(await confirmBox(t('editors.char.greet.confirmDelete'), t('common.delete'), true))) return; alt.splice(i, 1); save(); again(); }} /></span>
      <textarea className="inp" rows={5} spellCheck={false} defaultValue={g} onChange={e => { alt[i] = e.target.value; save(); }} /></label>)}
    <Btn label={t('editors.char.greet.add')} ic="plus" cls="ghost" onClick={() => { alt.push(''); again(); }} />
  </div>;
}

function Editor({ c }: { c: XChar }) {
  const [tab, setTab] = useState<typeof TABS[number]>('기본'), redraw = useBump(), pane = useRef<HTMLDivElement>(null);
  // 폼의 글자 수 꼬리표(em.tok[data-for])를 채운다
  const counts = () => pane.current?.querySelectorAll<HTMLElement>('em.tok[data-for]').forEach(el => { el.textContent = tokText((el.dataset.for || '').split('.').reduce<unknown>((a, k) => (a as Record<string, unknown> | undefined)?.[k], c)); });
  const saveNow = useDebounced(async () => { await S.save('chars', c, true); redraw(); }, 300);
  useEffect(counts);
  const pick = (list: { id: string; name: string }[]) => list.map(x => [x.id, x.name] as const);
  const forms: Record<'기본' | '설정' | '고급 정의', FormDefs> = {
    '기본': [{ k: 'name', label: t('common.name') }, { k: 'avatar', label: t('editors.char.f.avatar'), type: 'image', max: 900 }, { k: 'tags', label: t('editors.char.f.tags'), type: 'tags' }],
    '설정': [{ k: 'description', label: t('editors.char.f.description'), type: 'area', rows: 12, count: true }, { k: 'personality', label: t('editors.char.f.personality'), type: 'area', rows: 3, count: true, ph: t('editors.char.f.personalityPh') }, { k: 'scenario', label: t('editors.char.f.scenario'), type: 'area', rows: 4, count: true, ph: t('editors.char.f.scenarioPh') }],
    '고급 정의': [
      { section: t('editors.char.sec.override') },
      { el: <p className="hint">{t('editors.char.overrideHint')}</p> },
      { k: 'systemPrompt', label: t('editors.char.f.systemPrompt'), type: 'area', rows: 3, count: true, ph: t('editors.char.f.systemPromptPh') },
      { k: 'postHistory', label: t('editors.char.f.postHistory'), type: 'area', rows: 3, count: true, ph: t('editors.char.f.postHistoryPh') },
      { section: t('editors.char.sec.creator') },
      { k: 'creator', label: t('editors.char.f.creator'), half: true, ph: t('editors.char.f.creatorPh') }, { k: 'version', label: t('editors.char.f.version'), half: true, ph: t('editors.char.f.versionPh') },
      { k: 'creatorNotes', label: t('editors.char.f.creatorNotes'), type: 'area', rows: 4, ph: t('editors.char.f.creatorNotesPh') },
      { section: t('editors.char.sec.charNote') },
      { k: 'depthPrompt.prompt', label: t('editors.char.sec.charNote'), type: 'area', rows: 3, count: true, ph: t('editors.char.f.charNotePh') }, { k: 'depthPrompt.depth', label: t('editors.char.f.depth'), type: 'num', min: 0, half: true }, { k: 'depthPrompt.role', label: t('editors.char.f.role'), type: 'select', opts: [['system', t('editors.role.system')], ['user', t('editors.role.user')], ['assistant', t('editors.role.assistant')]], half: true },
      { section: t('editors.char.sec.talk') },
      { k: 'talk', label: t('editors.char.f.talk'), type: 'range', min: 0, max: 1, step: 0.05 }, { el: <div className="af-talk"><span>{t('editors.char.talk.shy')}</span><span>{t('editors.char.talk.normal')}</span><span>{t('editors.char.talk.chatty')}</span></div> },
      { section: t('editors.char.sec.examples') },
      { k: 'mesExample', label: t('editors.char.f.examples'), type: 'area', rows: 6, count: true, ph: t('editors.char.f.examplesPh') },
      { section: t('editors.char.sec.lore') },
      { el: <div className="field"><span className="field-label">{t('editors.char.f.linkedLore')}</span><LoreLinker holder={c} save={saveNow} /><small className="hint">{t('editors.char.f.linkedLoreHint')}</small></div> },
      { section: t('editors.char.sec.bind') },
      { k: 'bind.connId', label: t('editors.char.f.conn'), type: 'select', opts: [['', t('editors.char.f.connDefault')], ...pick(chatConns())], third: true }, { k: 'bind.presetId', label: t('editors.char.f.preset'), type: 'select', opts: [['', t('editors.char.f.presetDefault')], ...pick(S.presets)], third: true }, { k: 'bind.personaId', label: t('editors.char.f.persona'), type: 'select', opts: [['', t('editors.char.f.personaDefault')], ...pick(S.personas)], third: true },
      { el: <CharVoiceField charId={c.id} /> },
      { section: t('editors.char.sec.rest') },
      { el: <JsonField c={c} k="ext" label={t('editors.char.f.ext')} hint={t('editors.char.f.extHint')} save={saveNow} /> },
      { el: <JsonField c={c} k="more" label={t('editors.char.f.v3')} hint={t('editors.char.f.v3Hint')} save={saveNow} /> }],
  };
  return <div>
    <div className="tabs">{TABS.map(x => <button key={x} className={'tab' + (x === tab ? ' on' : '')} onClick={() => setTab(x)}>{t(TAB_KEY[x])}</button>)}<span className="tokbadge">{t('editors.tokens', { n: charTokens(c).toLocaleString() })}</span></div>
    <div className="tab-pane" ref={pane}>
      {tab === '인사말' ? <Greets c={c} save={saveNow} /> : tab === '에셋' ? <span style={{ display: 'contents' }}><AssetsPane owner={Assets.ownerOfChar(c.id)} holder={c} save={saveNow} /></span> : <Form key={tab} obj={c} defs={forms[tab]} onChange={saveNow} />}
    </div>
  </div>;
}

export function charEditor(ch: Char) {
  const c = ch as XChar;
  c.bind ||= { connId: '', presetId: '', personaId: '' }; c.depthPrompt ||= { prompt: '', depth: 4, role: 'system' }; c.ext ||= {}; c.more ||= {}; c.altGreetings ||= []; c.loreIds ||= [];
  openModal({ title: t('editors.char.title'), wide: true, body: <Editor c={c} />, onClose: () => { void S.save('chars', c, true).then(pageRefresh); }, actions: [{ label: t('editors.done'), cls: 'primary' }] });
}
