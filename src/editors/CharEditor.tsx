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
import { S } from '../lib/core';
import { AssetsPane } from '../studio/AssetsPane';
import * as engine from '../lib/engine';

const TABS = ['기본', '설정', '인사말', '에셋', '고급 정의'] as const;
const tokText = (v: unknown) => v ? `≈${engine.tokens(String(v)).toLocaleString()} 토큰` : '';

/** 카드에 실려 온 나머지 필드: 고쳐 쓸 수 있게 JSON 으로 보여 준다 */
function JsonField({ c, k, label, hint, save }: { c: XChar; k: 'ext' | 'more'; label: string; hint: string; save: () => void }) {
  const [bad, setBad] = useState(false);
  return <label className="field"><span className="field-label">{label}</span>
    <textarea className="inp af-json" rows={4} spellCheck={false} placeholder="{ }" defaultValue={Object.keys(c[k] || {}).length ? JSON.stringify(c[k], null, 2) : ''} onChange={e => {
      const v = e.target.value.trim();
      try { const j: unknown = v ? JSON.parse(v) : {}; if (!j || typeof j !== 'object' || Array.isArray(j)) throw new Error(); c[k] = j as Record<string, unknown>; setBad(false); save(); } catch { setBad(true); }
    }} />
    <small className={'hint' + (bad ? ' bad' : '')}>{bad ? 'JSON 객체 형식이 아니라서 아직 저장하지 않았어요.' : hint}</small></label>;
}

function Greets({ c, save }: { c: XChar; save: () => void }) {
  const redraw = useBump(), gen = useRef(0), alt = c.altGreetings ||= [];
  const again = () => { gen.current++; redraw(); };   // 순서 · 개수가 바뀌면 칸을 새로 만든다
  const swap = (i: number, j: number) => { [alt[i], alt[j]] = [alt[j], alt[i]]; save(); again(); };
  return <div className="greets">
    <label className="field"><span className="field-label">첫 인사</span><textarea className="inp" rows={7} spellCheck={false} defaultValue={c.firstMes ?? ''} onChange={e => { c.firstMes = e.target.value; save(); }} /></label>
    <p className="hint">다른 인사를 넣어 두면 새 대화의 첫 메시지를 좌우로 넘겨 고를 수 있어요.</p>
    {alt.map((g, i) => <label className="field" key={`${gen.current}-${i}`}>
      <span className="field-label">{`다른 인사 ${i + 1}`}<em className="tok">{g ? `≈${engine.tokens(g).toLocaleString()} 토큰` : ''}</em>
        <IconBtn ic="up" title="위로" cls="tiny" onClick={() => { if (i > 0) swap(i, i - 1); }} />
        <IconBtn ic="down" title="아래로" cls="tiny" onClick={() => { if (i < alt.length - 1) swap(i, i + 1); }} />
        <IconBtn ic="trash" title="삭제" cls="tiny" onClick={async () => { if ((alt[i] || '').trim() && !(await confirmBox('이 첫 메시지를 삭제할까요?', '삭제', true))) return; alt.splice(i, 1); save(); again(); }} /></span>
      <textarea className="inp" rows={5} spellCheck={false} defaultValue={g} onChange={e => { alt[i] = e.target.value; save(); }} /></label>)}
    <Btn label="다른 인사 추가" ic="plus" cls="ghost" onClick={() => { alt.push(''); again(); }} />
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
    '기본': [{ k: 'name', label: '이름' }, { k: 'avatar', label: '초상', type: 'image', max: 900 }, { k: 'tags', label: '태그', type: 'tags' }],
    '설정': [{ k: 'description', label: '설명', type: 'area', rows: 12, count: true }, { k: 'personality', label: '성격 요약', type: 'area', rows: 3, count: true, ph: '(성격을 짧게 요약)' }, { k: 'scenario', label: '시나리오', type: 'area', rows: 4, count: true, ph: '(대화가 벌어지는 상황과 맥락)' }],
    '고급 정의': [
      { section: '프롬프트 덮어쓰기' },
      { el: <p className="hint">{'채팅 완성형에서는 프리셋의 메인 프롬프트 · 후속 지시 블록을, 텍스트 완성형에서는 고급 포맷팅의 시스템 프롬프트를 이 캐릭터에 한해 바꿉니다. {{original}} 을 넣으면 그 자리에 원래 프롬프트가 들어갑니다.'}</p> },
      { k: 'systemPrompt', label: '메인 프롬프트', type: 'area', rows: 3, count: true, ph: '여기에 적은 내용이 이 캐릭터의 메인 프롬프트를 대신합니다. (V2 스펙: system_prompt)' },
      { k: 'postHistory', label: '후속 지시', type: 'area', rows: 3, count: true, ph: '여기에 적은 내용이 이 캐릭터의 후속 지시를 대신합니다. (V2 스펙: post_history_instructions)' },
      { section: '제작자 정보 (프롬프트에 들어가지 않음)' },
      { k: 'creator', label: '제작자', half: true, ph: '(만든 사람 이름 · 연락처)' }, { k: 'version', label: '캐릭터 버전', half: true, ph: '(버전을 관리하고 싶다면)' },
      { k: 'creatorNotes', label: '제작자 노트', type: 'area', rows: 4, ph: '(캐릭터 소개, 쓰는 요령, 시험해 본 모델 등. 캐릭터 프로필에 보입니다.)' },
      { section: '캐릭터 노트' },
      { k: 'depthPrompt.prompt', label: '캐릭터 노트', type: 'area', rows: 3, count: true, ph: '(대화 중간의 지정한 깊이와 역할로 계속 삽입되는 글)' }, { k: 'depthPrompt.depth', label: '@ 깊이', type: 'num', min: 0, half: true }, { k: 'depthPrompt.role', label: '역할', type: 'select', opts: [['system', '시스템'], ['user', '사용자'], ['assistant', '어시스턴트']], half: true },
      { section: '수다스러움' },
      { k: 'talk', label: '그룹 채팅에서 얼마나 자주 말하는지', type: 'range', min: 0, max: 1, step: 0.05 }, { el: <div className="af-talk"><span>수줍음</span><span>보통</span><span>수다쟁이</span></div> },
      { section: '대화 예시' },
      { k: 'mesExample', label: '말투와 문체를 잡는 데 중요합니다', type: 'area', rows: 6, count: true, ph: '(대화 예시. 예시마다 새 줄에 <START> 로 시작합니다.)\n<START>\n{{user}}: …\n{{char}}: …' },
      { section: '로어북' },
      { el: <div className="field"><span className="field-label">연결된 로어북</span><LoreLinker holder={c} save={saveNow} /><small className="hint">맨 처음 연결한 로어북은 카드를 내보낼 때 카드 안에 함께 담깁니다.</small></div> },
      { section: '이 캐릭터 전용 설정' },
      { k: 'bind.connId', label: 'API 연결', type: 'select', opts: [['', '기본 연결을 따름'], ...pick(S.conns)], third: true }, { k: 'bind.presetId', label: '프리셋', type: 'select', opts: [['', '기본 프리셋을 따름'], ...pick(S.presets)], third: true }, { k: 'bind.personaId', label: '페르소나', type: 'select', opts: [['', '기본 페르소나를 따름'], ...pick(S.personas)], third: true },
      { section: '카드의 나머지 필드' },
      { el: <JsonField c={c} k="ext" label="확장 필드 (extensions)" hint="다른 프런트엔드나 확장이 카드에 넣어 둔 값입니다. 내보낼 때 그대로 실립니다." save={saveNow} /> },
      { el: <JsonField c={c} k="more" label="V3 필드" hint="nickname · source · group_only_greetings · creator_notes_multilingual 같은 V3 스펙 필드입니다. 내보낼 때 그대로 실립니다." save={saveNow} /> }],
  };
  return <div>
    <div className="tabs">{TABS.map(t => <button key={t} className={'tab' + (t === tab ? ' on' : '')} onClick={() => setTab(t)}>{t}</button>)}<span className="tokbadge">{`≈${charTokens(c).toLocaleString()} 토큰`}</span></div>
    <div className="tab-pane" ref={pane}>
      {tab === '인사말' ? <Greets c={c} save={saveNow} /> : tab === '에셋' ? <span style={{ display: 'contents' }}><AssetsPane owner={Assets.ownerOfChar(c.id)} holder={c} save={saveNow} /></span> : <Form key={tab} obj={c} defs={forms[tab]} onChange={saveNow} />}
    </div>
  </div>;
}

export function charEditor(ch: Char) {
  const c = ch as XChar;
  c.bind ||= { connId: '', presetId: '', personaId: '' }; c.depthPrompt ||= { prompt: '', depth: 4, role: 'system' }; c.ext ||= {}; c.more ||= {}; c.altGreetings ||= []; c.loreIds ||= [];
  openModal({ title: '캐릭터 편집', wide: true, body: <Editor c={c} />, onClose: () => { void S.save('chars', c, true).then(pageRefresh); }, actions: [{ label: '완료', cls: 'primary' }] });
}
