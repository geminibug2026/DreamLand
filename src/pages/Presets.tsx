// 프리셋: 생성 설정 · 프리셋 변수 · 프롬프트 블록
import { useLayoutEffect, useRef } from 'react';
import { Btn, Icon, IconBtn } from '../kit';
import { Form, LibraryPage, Shelf, confirmBox, stripShelf, toast, useDragSort, type FormDefs } from '../ui';
import { PresetVarsEditor } from '../editors/PresetVars';
import type { Block, Preset } from '../editors/types';
import { editorApi, useBump, useDebounced, type EditorApi } from '../editors/parts';
import { go, route } from '../lib/router';
import { errMsg } from '../editors/refresh';
import { S } from '../lib/core';
import * as engine from '../lib/engine';
import * as core from '../lib/core';
import * as cards from '../lib/cards';
import { t } from '../i18n';

export const page = { name: 'presets', Component: PresetsPage };

/** 자리 표시 블록 가운데 내용을 감싸는 틀로 쓰는 것 (메인 프롬프트 · 후속 지시는 내용 그대로) */
const wraps = (b: Block) => b.kind !== 'text' && b.kind !== 'main' && b.kind !== 'jailbreak';
const blockDefs = (b: Block): FormDefs => [
  b.kind === 'text' && { k: 'name', label: t('common.name'), half: true }, { k: 'role', label: t('presets.block.role'), type: 'select', opts: ['system', 'user', 'assistant'], half: true },
  { k: 'content', label: wraps(b) ? t('presets.block.wrapper') : t('presets.block.content'), type: 'area', rows: wraps(b) ? 3 : 9, hint: wraps(b) ? t('presets.block.wrapperHint') : t('presets.block.contentHint') },
  { k: 'depth', label: t('presets.block.depth'), type: 'num', nullable: true, ph: t('presets.block.depthPh'), half: true },
  b.kind !== 'chatHistory' && { k: 'when', label: t('presets.block.when'), ph: t('presets.block.whenPh'), half: true, hint: t('presets.block.whenHint') },
];
const NONE = () => t('presets.notSent');

function PresetEditor({ p, api }: { p: Preset; api: EditorApi }) {
  const { uid, download, MARKERS } = core, { tokens, CONTINUE_NUDGE, IMPERSONATE_NUDGE, GROUP_NUDGE } = engine;
  const redraw = useBump(), sv = useDebounced(() => api.save(), 300), open = useRef(new Set<string>()).current;
  const list = useRef<HTMLDivElement | null>(null), focus = useRef(-1);
  const moveBlock = (from: number, to: number, grab = false) => { if (to < 0 || to >= p.blocks.length || to === from) return; const [x] = p.blocks.splice(from, 1); p.blocks.splice(to, 0, x); sv(); if (grab) focus.current = to; redraw(); };
  const drag = useDragSort((from, to) => moveBlock(from, to));
  // 방향키로 옮긴 뒤에는 그 줄의 손잡이를 다시 잡는다
  useLayoutEffect(() => { if (focus.current >= 0) { list.current?.children[focus.current]?.querySelector<HTMLElement>('.grip')?.focus(); focus.current = -1; } });
  const active = p.id === S.settings.activePreset, here = !active && hereId() === p.id;   // here: 기본은 아니지만 방금 보던 대화가 (캐릭터 연결로) 쓰는 프리셋
  return <div className="editor">
    <header className="editor-head"><h2>{p.name}</h2><div className="row">
      {active ? <em className="badge on">{t('presets.inUse')}</em> : here ? <em className="badge on">{t('presets.inUseHere')}</em> : <Btn label={t('presets.use')} ic="check" cls="primary" onClick={() => { S.set({ activePreset: p.id }); api.refresh(); }} />}
      <IconBtn ic="copy" title={t('common.duplicate')} onClick={async () => { await S.save('presets', { ...stripShelf(structuredClone(p)), id: uid(), name: p.name + ' (사본)', src: '', folder: p.folder }, true); api.refresh(); }} />
      <IconBtn ic="code" title={t('presets.regex', { n: (p.regex || []).length })} onClick={() => go('regex', 'preset:' + p.id)} />
      <IconBtn ic="import" title={t('common.export')} onClick={() => download(`${p.name}.dreamland-preset.json`, JSON.stringify(stripShelf(p), null, 2))} />
      <IconBtn ic="upload" title={t('presets.exportSt')} onClick={() => { const P = p as unknown as cards.DPreset, tc = !!(P.st as { tc?: unknown } | undefined)?.tc; download(`${p.name}.json`, JSON.stringify(tc ? cards.presetToStTc(P) : cards.presetToSt(P), null, 4)); }} />
      <IconBtn ic="trash" title={t('common.delete')} onClick={async () => { if (S.presets.length < 2) return toast(t('presets.lastOne')); if (await confirmBox(t('presets.confirmDelete', { name: p.name }), t('common.delete'), true)) { await S.remove('presets', p.id); if (active) S.set({ activePreset: S.presets[0].id }); api.refresh(); } }} />
    </div></header>
    <Form obj={p} defs={[{ k: 'name', label: t('common.name') },
      { section: t('presets.sec.gen') },
      { k: 'params.temperature', label: t('presets.p.temperature'), type: 'num', nullable: true, step: 0.05, third: true, ph: NONE() }, { k: 'params.topP', label: 'Top P', type: 'num', nullable: true, step: 0.01, third: true, ph: NONE() }, { k: 'params.topK', label: 'Top K', type: 'num', nullable: true, third: true, ph: NONE() },
      { k: 'params.maxTokens', label: t('presets.p.maxTokens'), type: 'num', third: true }, { k: 'params.contextSize', label: t('presets.p.contextSize'), type: 'num', third: true }, { k: 'params.effort', label: t('presets.p.effort'), type: 'select', opts: [['', t('presets.p.effortDefault')], 'low', 'medium', 'high', 'xhigh', 'max'], third: true },
      { k: 'params.freqPen', label: t('presets.p.freqPen'), type: 'num', nullable: true, step: 0.05, third: true, ph: NONE() }, { k: 'params.presPen', label: t('presets.p.presPen'), type: 'num', nullable: true, step: 0.05, third: true, ph: NONE() }, { k: 'params.stop', label: t('presets.p.stop'), type: 'tags', third: true },
      { k: 'params.minP', label: 'Min P', type: 'num', nullable: true, step: 0.01, third: true, ph: NONE() }, { k: 'params.topA', label: 'Top A', type: 'num', nullable: true, step: 0.01, third: true, ph: NONE() }, { k: 'params.repPen', label: t('presets.p.repPen'), type: 'num', nullable: true, step: 0.01, third: true, ph: NONE() },
      { k: 'params.seed', label: t('presets.p.seed'), type: 'num', nullable: true, third: true, ph: t('presets.p.seedPh') },
      { k: 'params.prefill', label: t('presets.p.prefill'), type: 'area', rows: 2, hint: t('presets.p.prefillHint') },
      { k: 'params.stream', label: t('presets.p.stream'), type: 'check' }, { k: 'params.squash', label: t('presets.p.squash'), type: 'check' }, { k: 'params.cardOverrides', label: t('presets.p.cardOverrides'), type: 'check' }, { k: 'params.namesInGroup', label: t('presets.p.namesInGroup'), type: 'check' },
      { section: t('presets.sec.nudges') },
      { k: 'params.continueNudge', label: t('presets.p.continueNudge'), type: 'area', rows: 2, ph: CONTINUE_NUDGE }, { k: 'params.impersonatePrompt', label: t('presets.p.impersonatePrompt'), type: 'area', rows: 2, ph: IMPERSONATE_NUDGE }, { k: 'params.groupNudge', label: t('presets.p.groupNudge'), type: 'area', rows: 2, ph: GROUP_NUDGE },
    ]} onChange={sv} />
    <h3 className="form-sec">{t('presets.sec.vars')}</h3><PresetVarsEditor p={p} sv={sv} />
    <h3 className="form-sec">{t('presets.sec.blocks')}</h3>
    <p className="hint">{t('presets.blocksHint')}</p>
    <div className="blocks" ref={el => { list.current = el; return drag(el); }}>{p.blocks.map((b, i) => {
      const marker = b.kind !== 'text', isOpen = open.has(b.id);
      return <div key={b.id} className={'block' + (b.enabled ? '' : ' off') + (isOpen ? ' open' : '') + (marker ? ' marker' : '')}>
        <div className="block-head" onClick={ev => { if ((ev.target as Element).closest('button,label,select')) return; if (b.kind === 'chatHistory') return; if (!open.delete(b.id)) open.add(b.id); redraw(); }}>
          <button className="grip" type="button" title={t('presets.grip')} aria-label={t('presets.gripLabel')} onKeyDown={ev => { if (ev.key === 'ArrowUp' || ev.key === 'ArrowDown') { ev.preventDefault(); moveBlock(i, i + (ev.key === 'ArrowUp' ? -1 : 1), true); } }}><Icon name="grip" size={16} /></button>
          <label className="switch"><input type="checkbox" checked={!!b.enabled} onChange={ev => { b.enabled = ev.target.checked; sv(); redraw(); api.redraw(); }} /><i /></label>
          <Icon name={marker ? 'sparkle' : 'note'} size={15} /><b>{b.name || MARKERS[b.kind] || t('presets.block.fallback')}</b>
          {b.depth != null && b.depth !== '' ? <em className="badge">{t('presets.block.depthBadge', { n: b.depth })}</em> : null}{b.when ? <em className="badge" title={b.when}>{t('presets.block.whenBadge')}</em> : null}
          {b.kind !== 'chatHistory' && <span className="tokbadge">{b.content ? `≈${tokens(b.content)}` : (marker ? t('presets.block.auto') : t('presets.block.empty'))}</span>}
          {!marker && <IconBtn ic="trash" title={t('presets.block.delete')} cls="tiny" onClick={async () => { if (!(await confirmBox(t('presets.block.confirmDelete'), t('common.delete'), true))) return; p.blocks.splice(p.blocks.indexOf(b), 1); sv(); redraw(); api.redraw(); }} />}
        </div>
        {isOpen && <div className="block-body"><Form obj={b} defs={blockDefs(b)} onChange={sv} /></div>}
      </div>;
    })}</div>
    <Btn label={t('presets.block.add')} ic="plus" cls="ghost" onClick={() => { const b: Block = { id: uid(), kind: 'text', name: '새 프롬프트', role: 'system', content: '', enabled: true, depth: null }; const at = p.blocks.findIndex(x => x.kind === 'chatHistory'); p.blocks.splice(at < 0 ? p.blocks.length : at, 0, b); open.add(b.id); void api.save(); redraw(); }} />
  </div>;
}

/** 대화 화면에서 넘어왔으면 그 대화가 실제로 쓰는 프리셋 (캐릭터에 연결한 것 포함) */
const hereId = () => { const c = route.from === 'chat' ? S.get('chats', S.settings.lastChat) : null; return c ? S.presetFor(c).id : ''; };

function PresetsPage({ arg }: { arg?: unknown }) {
  // 들어오면 쓰고 있는 프리셋이 바로 열리고, 목록에서 고르면 그 프리셋을 쓴다
  return <LibraryPage<Preset> arg={arg} initial={hereId() || S.settings.activePreset} openFirst switcher onPick={id => { if (S.settings.activePreset !== id) S.set({ activePreset: id }); }} title={t('presets.title')} eyebrow="preset" coll="presets" ic="sliders" create={() => { const p = core.defaultPreset(); p.name = '새 프리셋'; return p; }} label={p => p.name}
    sub={p => t('presets.sub', { n: p.blocks.filter(b => b.enabled).length }) + (p.id === S.settings.activePreset ? ' · ' + t('presets.inUse') : '')}
    actions={[{ ic: 'import', title: t('presets.import'), onclick: async draw => {
      const [f] = await core.pickFiles({ accept: '.json' }); if (!f) return;
      try {
        const j = JSON.parse(await f.text()) as Partial<Preset>;
        if (j.blocks && j.params) { await S.save('presets', { ...stripShelf(j), id: core.uid() } as Preset, true); toast(t('presets.imported'), 'ok'); }
        else { const T = await cards.importFiles([f]); toast(cards.summarize(T), T.errors.length ? 'err' : 'ok'); }
      } catch (e) { toast(errMsg(e), 'err'); }
      draw();
    } }]}
    list={ctx => <Shelf ctx={ctx} coll="presets" active={S.settings.activePreset} foldersKey="presetFolders" placeholder={t('presets.search')} />}
    editor={(p, api) => <PresetEditor p={p} api={editorApi(api, 'presets')} />} />;
}
