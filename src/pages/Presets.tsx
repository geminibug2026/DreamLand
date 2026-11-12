// 프리셋: 생성 설정 · 프리셋 변수 · 프롬프트 블록
import { useLayoutEffect, useRef } from 'react';
import { Btn, Icon, IconBtn } from '../kit';
import { Form, LibraryPage, Shelf, confirmBox, stripShelf, toast, useDragSort, type FormDefs } from '../ui';
import { PresetVarsEditor } from '../editors/PresetVars';
import type { Block, Preset } from '../editors/types';
import { editorApi, useBump, useDebounced, type EditorApi } from '../editors/parts';
import { go } from '../lib/router';
import { errMsg } from '../editors/refresh';
import { S } from '../lib/core';
import * as engine from '../lib/engine';
import * as core from '../lib/core';
import * as cards from '../lib/cards';

export const page = { name: 'presets', Component: PresetsPage };

/** 자리 표시 블록 가운데 내용을 감싸는 틀로 쓰는 것 (메인 프롬프트 · 후속 지시는 내용 그대로) */
const wraps = (b: Block) => b.kind !== 'text' && b.kind !== 'main' && b.kind !== 'jailbreak';
const blockDefs = (b: Block): FormDefs => [
  b.kind === 'text' && { k: 'name', label: '이름', half: true }, { k: 'role', label: '역할', type: 'select', opts: ['system', 'user', 'assistant'], half: true },
  { k: 'content', label: wraps(b) ? '감싸는 틀' : '내용', type: 'area', rows: wraps(b) ? 3 : 9, hint: wraps(b) ? '{{slot}} 자리에 실제 내용이 들어갑니다. 비워 두면 내용만 넣어요.' : '{{char}} {{user}} {{random::a::b}} {{getvar::이름}} 같은 매크로를 쓸 수 있어요.' },
  { k: 'depth', label: '대화 중간에 삽입 (깊이)', type: 'num', nullable: true, ph: '비우면 목록 순서대로', half: true },
  b.kind !== 'chatHistory' && { k: 'when', label: '조건 (맞을 때만 이 블록을 넣음)', ph: '비우면 항상 · 예: 수위 && 문체 == "격하게"', half: true, hint: '프리셋 변수 · 대화 변수 · char · mode 같은 낱말로 식을 적습니다. 중괄호는 쓰지 않아요.' },
];
const NONE = '보내지 않음';

function PresetEditor({ p, api }: { p: Preset; api: EditorApi }) {
  const { uid, download, MARKERS } = core, { tokens, CONTINUE_NUDGE, IMPERSONATE_NUDGE, GROUP_NUDGE } = engine;
  const redraw = useBump(), sv = useDebounced(() => api.save(), 300), open = useRef(new Set<string>()).current;
  const list = useRef<HTMLDivElement | null>(null), focus = useRef(-1);
  const moveBlock = (from: number, to: number, grab = false) => { if (to < 0 || to >= p.blocks.length || to === from) return; const [x] = p.blocks.splice(from, 1); p.blocks.splice(to, 0, x); sv(); if (grab) focus.current = to; redraw(); };
  const drag = useDragSort((from, to) => moveBlock(from, to));
  // 방향키로 옮긴 뒤에는 그 줄의 손잡이를 다시 잡는다
  useLayoutEffect(() => { if (focus.current >= 0) { list.current?.children[focus.current]?.querySelector<HTMLElement>('.grip')?.focus(); focus.current = -1; } });
  const active = p.id === S.settings.activePreset;
  return <div className="editor">
    <header className="editor-head"><h2>{p.name}</h2><div className="row">
      {active ? <em className="badge on">사용 중</em> : <Btn label="이 프리셋 사용" ic="check" cls="primary" onClick={() => { S.set({ activePreset: p.id }); api.refresh(); }} />}
      <IconBtn ic="copy" title="복제" onClick={async () => { await S.save('presets', { ...stripShelf(structuredClone(p)), id: uid(), name: p.name + ' (사본)', src: '', folder: p.folder }, true); api.refresh(); }} />
      <IconBtn ic="code" title={`이 프리셋의 정규식 (${(p.regex || []).length})`} onClick={() => go('regex', 'preset:' + p.id)} />
      <IconBtn ic="import" title="내보내기" onClick={() => download(`${p.name}.dreamland-preset.json`, JSON.stringify(stripShelf(p), null, 2))} />
      <IconBtn ic="trash" title="삭제" onClick={async () => { if (S.presets.length < 2) return toast('마지막 프리셋은 지울 수 없어요'); if (await confirmBox(`"${p.name}" 프리셋을 삭제할까요?`, '삭제', true)) { await S.remove('presets', p.id); if (active) S.set({ activePreset: S.presets[0].id }); api.refresh(); } }} />
    </div></header>
    <Form obj={p} defs={[{ k: 'name', label: '이름' },
      { section: '생성 설정' },
      { k: 'params.temperature', label: '온도', type: 'num', nullable: true, step: 0.05, third: true, ph: NONE }, { k: 'params.topP', label: 'Top P', type: 'num', nullable: true, step: 0.01, third: true, ph: NONE }, { k: 'params.topK', label: 'Top K', type: 'num', nullable: true, third: true, ph: NONE },
      { k: 'params.maxTokens', label: '최대 응답 토큰', type: 'num', third: true }, { k: 'params.contextSize', label: '컨텍스트 크기', type: 'num', third: true }, { k: 'params.effort', label: '추론 강도', type: 'select', opts: [['', '기본값'], 'low', 'medium', 'high', 'xhigh', 'max'], third: true },
      { k: 'params.freqPen', label: '빈도 페널티', type: 'num', nullable: true, step: 0.05, third: true, ph: NONE }, { k: 'params.presPen', label: '존재 페널티', type: 'num', nullable: true, step: 0.05, third: true, ph: NONE }, { k: 'params.stop', label: '중단 문자열', type: 'tags', third: true },
      { k: 'params.minP', label: 'Min P', type: 'num', nullable: true, step: 0.01, third: true, ph: NONE }, { k: 'params.topA', label: 'Top A', type: 'num', nullable: true, step: 0.01, third: true, ph: NONE }, { k: 'params.repPen', label: '반복 페널티', type: 'num', nullable: true, step: 0.01, third: true, ph: NONE },
      { k: 'params.seed', label: '시드', type: 'num', nullable: true, third: true, ph: '무작위' },
      { k: 'params.prefill', label: '응답 시작 문구 (프리필)', type: 'area', rows: 2, hint: '지원하지 않는 모델(최신 Claude 등)에서는 자동으로 빠집니다.' },
      { k: 'params.stream', label: '스트리밍', type: 'check' }, { k: 'params.squash', label: '연속된 시스템 메시지 합치기', type: 'check' }, { k: 'params.cardOverrides', label: '캐릭터 카드의 프롬프트 덮어쓰기 허용', type: 'check' }, { k: 'params.namesInGroup', label: '그룹 채팅에서 이름 붙이기', type: 'check' },
      { section: '보조 지시문' },
      { k: 'params.continueNudge', label: '이어 쓰기 지시', type: 'area', rows: 2, ph: CONTINUE_NUDGE }, { k: 'params.impersonatePrompt', label: '대신 써 주기 지시', type: 'area', rows: 2, ph: IMPERSONATE_NUDGE }, { k: 'params.groupNudge', label: '그룹 채팅 화자 지시', type: 'area', rows: 2, ph: GROUP_NUDGE },
    ]} onChange={sv} />
    <h3 className="form-sec">프리셋 변수</h3><PresetVarsEditor p={p} sv={sv} />
    <h3 className="form-sec">프롬프트 구성</h3>
    <p className="hint">위에서 아래 순서로 조립됩니다. 반짝이 아이콘은 캐릭터·로어북·기록이 자동으로 채워지는 자리예요.</p>
    <div className="blocks" ref={el => { list.current = el; return drag(el); }}>{p.blocks.map((b, i) => {
      const marker = b.kind !== 'text', isOpen = open.has(b.id);
      return <div key={b.id} className={'block' + (b.enabled ? '' : ' off') + (isOpen ? ' open' : '') + (marker ? ' marker' : '')}>
        <div className="block-head" onClick={ev => { if ((ev.target as Element).closest('button,label,select')) return; if (b.kind === 'chatHistory') return; if (!open.delete(b.id)) open.add(b.id); redraw(); }}>
          <button className="grip" type="button" title="잡고 끌어서 순서 바꾸기 (방향키 ↑ ↓ 로도)" aria-label="순서 바꾸기" onKeyDown={ev => { if (ev.key === 'ArrowUp' || ev.key === 'ArrowDown') { ev.preventDefault(); moveBlock(i, i + (ev.key === 'ArrowUp' ? -1 : 1), true); } }}><Icon name="grip" size={16} /></button>
          <label className="switch"><input type="checkbox" checked={!!b.enabled} onChange={ev => { b.enabled = ev.target.checked; sv(); redraw(); api.redraw(); }} /><i /></label>
          <Icon name={marker ? 'sparkle' : 'note'} size={15} /><b>{b.name || MARKERS[b.kind] || '프롬프트'}</b>
          {b.depth != null && b.depth !== '' ? <em className="badge">{`깊이 ${b.depth}`}</em> : null}{b.when ? <em className="badge" title={b.when}>조건</em> : null}
          {b.kind !== 'chatHistory' && <span className="tokbadge">{b.content ? `≈${tokens(b.content)}` : (marker ? '자동' : '비어 있음')}</span>}
          {!marker && <IconBtn ic="trash" title="블록 삭제" cls="tiny" onClick={async () => { if (!(await confirmBox('이 블록을 삭제할까요?', '삭제', true))) return; p.blocks.splice(p.blocks.indexOf(b), 1); sv(); redraw(); api.redraw(); }} />}
        </div>
        {isOpen && <div className="block-body"><Form obj={b} defs={blockDefs(b)} onChange={sv} /></div>}
      </div>;
    })}</div>
    <Btn label="프롬프트 블록 추가" ic="plus" cls="ghost" onClick={() => { const b: Block = { id: uid(), kind: 'text', name: '새 프롬프트', role: 'system', content: '', enabled: true, depth: null }; const at = p.blocks.findIndex(x => x.kind === 'chatHistory'); p.blocks.splice(at < 0 ? p.blocks.length : at, 0, b); open.add(b.id); void api.save(); redraw(); }} />
  </div>;
}

function PresetsPage({ arg }: { arg?: unknown }) {
  return <LibraryPage<Preset> arg={arg} title="프리셋" eyebrow="preset" coll="presets" ic="sliders" create={() => { const p = core.defaultPreset(); p.name = '새 프리셋'; return p; }} label={p => p.name}
    sub={p => `${p.blocks.filter(b => b.enabled).length}개 블록${p.id === S.settings.activePreset ? ' · 사용 중' : ''}`}
    actions={[{ ic: 'import', title: '프리셋 가져오기 (실리태번 · 마리나라 · 드림랜드)', onclick: async draw => {
      const [f] = await core.pickFiles({ accept: '.json' }); if (!f) return;
      try {
        const j = JSON.parse(await f.text()) as Partial<Preset>;
        if (j.blocks && j.params) { await S.save('presets', { ...stripShelf(j), id: core.uid() } as Preset, true); toast('프리셋을 가져왔어요', 'ok'); }
        else { const T = await cards.importFiles([f]); toast(cards.summarize(T), T.errors.length ? 'err' : 'ok'); }
      } catch (e) { toast(errMsg(e), 'err'); }
      draw();
    } }]}
    list={ctx => <Shelf ctx={ctx} coll="presets" active={S.settings.activePreset} foldersKey="presetFolders" placeholder="프리셋 찾기" />}
    editor={(p, api) => <PresetEditor p={p} api={editorApi(api, 'presets')} />} />;
}
