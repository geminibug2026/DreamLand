// 고급 포맷팅: 컨텍스트 템플릿 · 인스트럭트 템플릿 · 시스템 프롬프트 · 추론 · 그 밖의 설정 (프롬프트 조립은 옛 advanced.js 가 맡는다)
import { Fragment, useState, type ReactNode } from 'react';
import { Btn, IconBtn } from '../kit';
import type { FormDef, FormDefs, Opt } from '../studio/parts';
import * as libEngine from '../lib/engine';
import * as libAdvanced from '../lib/advanced';
import { S } from '../lib/core';
import * as core from '../lib/core';
import { LForm, PageHead, confirmBox, errMsg, promptBox, toast } from '../studio/parts';
import { t as tr, tn } from '../i18n';

type Kind = 'context' | 'instruct' | 'sysprompt' | 'reasoning';
interface Tpl { name?: string; builtin?: boolean; edited?: boolean; [k: string]: unknown }

// 화면을 떠났다 돌아와도 남는 탭
let afTab = 'context';
const TABS = () => [['context', tr('advanced.kind.context')], ['instruct', tr('advanced.kind.instruct')], ['sysprompt', tr('advanced.kind.sysprompt')], ['reasoning', tr('advanced.tab.reasoning')], ['misc', tr('advanced.misc')]] as const;
const NAMES_OPTS = (): Opt[] => [['none', tr('advanced.names.none')], ['force', tr('advanced.names.force')], ['always', tr('advanced.names.always')]];
const ROLE_OPTS = (): Opt[] => [[0, tr('advanced.role.system')], [1, tr('advanced.role.user')], [2, tr('advanced.role.assistant')]];
const seq = (k: string, label: string, hint?: string, o: Partial<FormDef> = {}): FormDef => ({ k, label, type: 'area', rows: 2, half: true, hint, ...o });

export const page = { name: 'format', Component: Format };

/** 템플릿 고르기 · 저장 · 이름 바꾸기 · 가져오기 · 내보내기 · 되돌리기 · 삭제 */
function TplBar({ kind, redraw }: { kind: Kind; redraw: () => void }) {
  const A = libAdvanced, C = core;
  const cur = A.AF()[kind], list = A.tplList(kind), known = list.some(t => t.name === cur.name), mine = list.filter(t => !t.builtin), stock = list.filter(t => t.builtin);
  const opt = (t: Tpl) => <option key={t.name} value={t.name}>{t.name + (t.edited ? tr('advanced.tpl.edited') : '')}</option>;
  const saveAs = async () => { const name = (await promptBox(tr('advanced.tpl.newName'), cur.name ? tr('advanced.tpl.copySuffix', { name: cur.name }) : ''))?.trim(); if (!name) return; A.tplSave(kind, { ...A.tplCurrent(kind), name }); cur.name = name; S.set({}); toast(tr('advanced.tpl.savedAs', { name }), 'ok'); redraw(); };
  const rename = async () => { const old = cur.name, name = (await promptBox(tr('advanced.tpl.name'), old))?.trim(); if (!name || name === old) return; A.tplSave(kind, { ...A.tplCurrent(kind), name }); if (old && !A.tplIsBuiltin(kind, old)) A.tplDelete(kind, old); cur.name = name; S.set({}); redraw(); };
  const bring = async () => {
    const files = await C.pickFiles({ accept: '.json', multiple: true }); let n = 0;
    for (const f of files) { try { const got = A.tplImport(JSON.parse(await f.text()), f.name); n += got.length; const hit = got.find(g => g.kind === kind); if (hit) A.tplApply(kind, hit.name); } catch (e) { toast(`${f.name}: ${errMsg(e)}`, 'err'); } }
    if (n) { toast(tn('advanced.tpl.imported', n), 'ok'); redraw(); }
  };
  const revert = async () => {
    if (!known) return toast(tr('advanced.tpl.notStored'));
    const stockOnly = A.tplIsBuiltin(kind, cur.name) && list.find(t => t.name === cur.name)?.edited;
    if (stockOnly && await confirmBox(tr('advanced.tpl.revertAsk', { name: cur.name }), tr('advanced.tpl.revertOk'))) A.tplDelete(kind, cur.name);
    A.tplApply(kind, cur.name as string); redraw();
  };
  const del = async () => {
    if (!known || A.tplIsBuiltin(kind, cur.name)) return toast(tr('advanced.tpl.cantDelete'));
    if (!(await confirmBox(tr('advanced.tpl.deleteAsk', { name: cur.name }), tr('common.delete'), true))) return;
    A.tplDelete(kind, cur.name as string); A.tplApply(kind, A.tplList(kind)[0].name as string); redraw();
  };
  return <div className="af-bar">
    <select className="inp" title={tr('advanced.tpl.current', { kind: A.KINDS[kind] })} value={known ? cur.name : ''} onChange={e => { A.tplApply(kind, e.target.value); redraw(); }}>
      {!known && <option value="">{cur.name ? tr('advanced.tpl.notInLib', { name: cur.name }) : tr('advanced.tpl.unsavedParen')}</option>}
      {mine.length ? <optgroup label={tr('advanced.tpl.mine')}>{mine.map(opt)}</optgroup> : null}<optgroup label={tr('advanced.tpl.builtin')}>{stock.map(opt)}</optgroup>
    </select>
    <em className="badge af-dirty" hidden={!A.tplDirty(kind)}>{tr('advanced.tpl.dirty')}</em>
    <div className="af-tools">
      <IconBtn ic="check" title={tr('advanced.tpl.save')} onClick={() => { if (!cur.name) return void saveAs(); A.tplSave(kind, A.tplCurrent(kind)); toast(tr('advanced.tpl.saved', { name: cur.name }), 'ok'); redraw(); }} />
      <IconBtn ic="edit" title={tr('common.rename')} onClick={() => void rename()} />
      <IconBtn ic="copy" title={tr('advanced.tpl.saveAs')} onClick={() => void saveAs()} />
      <IconBtn ic="upload" title={tr('advanced.tpl.import')} onClick={() => void bring()} />
      <IconBtn ic="import" title={tr('advanced.tpl.export')} onClick={() => C.download(`${cur.name || A.KINDS[kind]}.json`, JSON.stringify(A.tplCurrent(kind), null, 4))} />
      <IconBtn ic="refresh" title={tr('advanced.tpl.revert')} onClick={() => void revert()} />
      <IconBtn ic="trash" title={tr('advanced.tpl.delete')} onClick={() => void del()} />
    </div>
  </div>;
}

function Format() {
  const [, setTick] = useState(0), [epoch, setEpoch] = useState(0);
  const A = libAdvanced, C = core;
  const F = A.AF(), conn = S.conn(), def = conn && libEngine.PROVIDERS[conn.provider], textConn = !!def && A.TEXT_PROVIDER_KINDS.includes(def.kind);
  const redraw = () => setEpoch(n => n + 1);                       // 폼까지 새로 만든다 (옛 refresh)
  const ch = () => { S.set({}); setTick(n => n + 1); };           // 저장하고 상태 줄 · 저장 안 됨 표시만 다시
  const form = (obj: object, defs: FormDefs) => <LForm obj={obj} defs={defs} onChange={ch} />;
  const card = (cls: string, ...kids: ReactNode[]) => <div className={`card af-card ${cls}${!textConn && conn && cls.includes('af-tc') ? ' af-dim' : ''}`.replace(/\s+/g, ' ').trim()}>{kids.map((k, i) => <Fragment key={i}>{k}</Fragment>)}</div>;
  const bar = (kind: Kind) => <TplBar kind={kind} redraw={redraw} />;

  let status: ReactNode;
  if (!conn) status = tr('advanced.status.noConn');
  else if (!textConn) status = <><b>{conn.name}</b>{tr('advanced.status.chatConn')}</>;
  else if (F.storyMode === false) status = <><b>{conn.name}</b>{tr('advanced.status.noStory')}</>;
  else { const r = A.resolve(conn); status = <><b>{conn.name}</b>{tr('advanced.status.instruct')}<em className={'badge' + (r.instruct ? ' on' : '')}>{r.instruct ? r.instruct.name || tr('advanced.unsaved') : tr('advanced.off')}</em>{tr('advanced.status.context')}<em className="badge on">{r.context.name || tr('advanced.unsaved')}</em>{r.why ? ` — ${r.why}` : ''}</>; }

  let pane: ReactNode;
  if (afTab === 'context') pane = <>
    {card('af-tc', bar('context'), form(F.context, [
      { k: 'story_string', label: tr('advanced.ctx.story'), type: 'area', rows: 9, hint: tr('advanced.ctx.storyHint') },
      { k: 'story_string_position', label: tr('advanced.ctx.position'), type: 'select', opts: [[0, tr('advanced.ctx.posDefault')], [1, tr('advanced.ctx.posDepth')]], third: true }, { k: 'story_string_depth', label: tr('advanced.ctx.depth'), type: 'num', min: 0, third: true }, { k: 'story_string_role', label: tr('advanced.ctx.role'), type: 'select', opts: ROLE_OPTS(), third: true },
      { k: 'example_separator', label: tr('advanced.ctx.exSep'), half: true, hint: tr('advanced.ctx.exSepHint') }, { k: 'chat_start', label: tr('advanced.ctx.chatStart'), half: true, hint: tr('advanced.ctx.chatStartHint') },
      { k: 'use_stop_strings', label: tr('advanced.ctx.sepStop'), type: 'check', hint: tr('advanced.ctx.sepStopHint') }, { k: 'names_as_stop_strings', label: tr('advanced.ctx.namesStop'), type: 'check', hint: tr('advanced.ctx.namesStopHint') }]))}
    {card('', form(F, [{ section: tr('advanced.ctx.formatting') },
      { k: 'alwaysForceName2', label: tr('advanced.ctx.forceName'), type: 'check', hint: tr('advanced.ctx.forceNameHint') }, { k: 'singleLine', label: tr('advanced.ctx.singleLine'), type: 'check' }, { k: 'collapseNewlines', label: tr('advanced.ctx.collapse'), type: 'check', hint: tr('advanced.ctx.collapseHint') },
      { k: 'trimSpaces', label: tr('advanced.ctx.trimSpaces'), type: 'check' }, { k: 'trimSentences', label: tr('advanced.ctx.trimSentences'), type: 'check' }, { k: 'fixMarkdown', label: tr('advanced.ctx.fixMd'), type: 'check' },
      { k: 'storyMode', label: tr('advanced.ctx.storyMode'), type: 'check', hint: tr('advanced.ctx.storyModeHint') }]))}
    {card('', form(F, [{ section: tr('advanced.ctx.ccSec') }, { k: 'ccExampleSep', label: tr('advanced.ctx.ccExSep'), half: true, ph: '[Example dialogue]', hint: tr('advanced.ctx.ccExSepHint') }, { k: 'ccChatStart', label: tr('advanced.ctx.ccChatStart'), half: true, ph: '[Start a new chat]', hint: tr('advanced.ctx.ccChatStartHint') }]))}
  </>;
  else if (afTab === 'instruct') pane = <>
    {card('af-tc', form(F.instruct, [{ k: 'enabled', label: tr('advanced.ins.enabled'), type: 'check', live: true, hint: tr('advanced.ins.enabledHint') }, { k: 'bind_to_context', label: tr('advanced.ins.bind'), type: 'check', hint: tr('advanced.ins.bindHint') }]),
      bar('instruct'), form(F.instruct, [
        { k: 'activation_regex', label: tr('advanced.ins.activation'), ph: tr('advanced.ins.activationPh'), hint: tr('advanced.ins.activationHint') },
        { k: 'wrap', label: tr('advanced.ins.wrap'), type: 'check' }, { k: 'macro', label: tr('advanced.ins.macro'), type: 'check' }, { k: 'sequences_as_stop_strings', label: tr('advanced.ins.seqStop'), type: 'check' }, { k: 'skip_examples', label: tr('advanced.ins.skipEx'), type: 'check' },
        { k: 'names_behavior', label: tr('advanced.ins.names'), type: 'select', opts: NAMES_OPTS(), half: true }]))}
    {card('af-tc af-seq', form(F.instruct, [
      { section: tr('advanced.ins.secStory') }, seq('story_string_prefix', tr('advanced.seq.ssPrefix'), tr('advanced.seq.ssPrefixHint')), seq('story_string_suffix', tr('advanced.seq.ssSuffix'), tr('advanced.seq.ssSuffixHint')),
      { section: tr('advanced.ins.secUser') }, seq('input_sequence', tr('advanced.seq.inPrefix'), tr('advanced.seq.inPrefixHint')), seq('input_suffix', tr('advanced.seq.inSuffix')),
      { section: tr('advanced.ins.secAsst') }, seq('output_sequence', tr('advanced.seq.outPrefix'), tr('advanced.seq.outPrefixHint')), seq('output_suffix', tr('advanced.seq.outSuffix')),
      { section: tr('advanced.ins.secSys') }, seq('system_sequence', tr('advanced.seq.sysPrefix'), tr('advanced.seq.sysPrefixHint')), seq('system_suffix', tr('advanced.seq.sysSuffix')),
      { k: 'system_same_as_user', label: tr('advanced.ins.sysSame'), type: 'check' },
      { section: tr('advanced.ins.secMisc') }, seq('first_output_sequence', tr('advanced.seq.firstOut'), tr('advanced.seq.firstOutHint')), seq('last_output_sequence', tr('advanced.seq.lastOut'), tr('advanced.seq.lastOutHint')),
      seq('first_input_sequence', tr('advanced.seq.firstIn'), tr('advanced.seq.firstInHint')), seq('last_input_sequence', tr('advanced.seq.lastIn'), tr('advanced.seq.lastInHint')),
      seq('last_system_sequence', tr('advanced.seq.lastSys'), tr('advanced.seq.lastSysHint')), seq('stop_sequence', tr('advanced.seq.stop'), tr('advanced.seq.stopHint')),
      seq('user_alignment_message', tr('advanced.seq.align'), tr('advanced.seq.alignHint'), { half: false })]))}
  </>;
  else if (afTab === 'sysprompt') pane = card('af-tc', form(F.sysprompt, [{ k: 'enabled', label: tr('advanced.sys.enabled'), type: 'check', hint: tr('advanced.sys.enabledHint') }]), bar('sysprompt'),
    form(F.sysprompt, [{ k: 'content', label: tr('advanced.sys.content'), type: 'area', rows: 9, hint: tr('advanced.sys.contentHint') }, { k: 'post_history', label: tr('advanced.sys.post'), type: 'area', rows: 4, hint: tr('advanced.sys.postHint') }]),
    <p className="hint">{tr('advanced.sys.ccNote')}</p>);
  else if (afTab === 'reasoning') pane = <>
    {card('', form(F.reasoning, [{ k: 'autoParse', label: tr('advanced.rs.autoParse'), type: 'check', hint: tr('advanced.rs.autoParseHint') }, { k: 'autoExpand', label: tr('advanced.rs.autoExpand'), type: 'check' }, { k: 'addToPrompts', label: tr('advanced.rs.add'), type: 'check', hint: tr('advanced.rs.addHint') }, { k: 'maxAdditions', label: tr('advanced.rs.max'), type: 'num', min: 0, third: true, hint: tr('advanced.rs.maxHint') }]))}
    {card('', <h3 className="form-sec">{tr('advanced.kind.reasoning')}</h3>, bar('reasoning'), form(F.reasoning, [{ k: 'prefix', label: tr('advanced.rs.prefix'), type: 'area', rows: 2, third: true, hint: tr('advanced.rs.prefixHint') }, { k: 'suffix', label: tr('advanced.rs.suffix'), type: 'area', rows: 2, third: true, hint: tr('advanced.rs.suffixHint') }, { k: 'separator', label: tr('advanced.rs.sep'), type: 'area', rows: 2, third: true, hint: tr('advanced.rs.sepHint') }]))}
  </>;
  else {
    const model = conn?.model || '', map = F.modelMap || {}, bound = !!map[model];
    const stops = (v: string) => { v = v.trim(); let list: string[] | null = null; if (v.startsWith('[')) { try { const j: unknown = JSON.parse(v); if (Array.isArray(j)) list = j.filter((x): x is string => typeof x === 'string' && !!x); } catch { /* JSON 이 아니면 줄 단위로 읽는다 */ } } F.stopStrings = list || v.split('\n').map(x => x.trim()).filter(Boolean); ch(); };
    const bind = (on: boolean) => { F.modelMap ||= {}; if (on) F.modelMap[model] = { instruct: F.instruct.enabled ? F.instruct.name as string : '', context: F.context.name as string }; else delete F.modelMap[model]; ch(); };
    pane = <>
      {card('', <h3 className="form-sec">{tr('advanced.misc.stops')}</h3>, <label className="field"><textarea className="inp" rows={3} spellCheck={false} placeholder={tr('advanced.misc.stopsPh')} defaultValue={(F.stopStrings || []).join('\n')} onChange={e => stops(e.target.value)} /><small className="hint">{tr('advanced.misc.stopsHint')}</small></label>, form(F, [{ k: 'stopMacro', label: tr('advanced.misc.stopMacro'), type: 'check', hint: '{{user}} · {{char}}' }]))}
      {card('', form(F, [{ section: tr('advanced.misc.tokens') }, { k: 'tokenPadding', label: tr('advanced.misc.padding'), type: 'num', half: true, hint: tr('advanced.misc.paddingHint') }]))}
      {card('', form(F, [{ section: tr('advanced.srw') }, { k: 'startReplyWith', label: tr('advanced.misc.srw'), type: 'area', rows: 2, hint: tr('advanced.misc.srwHint') }, { k: 'showBias', label: tr('advanced.misc.showBias'), type: 'check' }]))}
      {card('', form(F, [{ section: tr('advanced.misc.mdSec') }, { k: 'mdEscape', label: tr('advanced.misc.md'), ph: '***,---', hint: tr('advanced.misc.mdHint') }]))}
      {card('af-tc', <h3 className="form-sec">{tr('advanced.misc.bindSec')}</h3>, <p className="hint">{model ? tr('advanced.misc.curModel', { model }) : tr('advanced.misc.noModel')}</p>,
        model ? <label className="check" key={bound ? `on:${map[model].instruct}:${map[model].context}` : 'off'}><input type="checkbox" checked={bound} onChange={e => bind(e.target.checked)} /><i /><span>{tr('advanced.misc.bind')}</span>{bound && <small>{`${map[model].instruct || tr('advanced.misc.insOff')} · ${map[model].context || tr('advanced.misc.ctxKeep')}`}</small>}</label> : null,
        Object.keys(map).length ? <div className="af-map">{Object.entries(map).map(([m, v]) => <button key={m} className="chip on" title={tr('advanced.misc.unbind')} onClick={() => { delete map[m]; ch(); }}>{`${m} → ${v.instruct || tr('advanced.off')} / ${v.context || tr('advanced.misc.keep')} ✕`}</button>)}</div> : null)}
    </>;
  }

  const bringAll = async () => {
    const files = await C.pickFiles({ accept: '.json', multiple: true }); let n = 0;
    for (const f of files) { try { n += A.tplImport(JSON.parse(await f.text()), f.name).length; } catch (e) { toast(`${f.name}: ${errMsg(e)}`, 'err'); } }
    if (n) { toast(tn('advanced.importedN', n), 'ok'); redraw(); }
  };
  return <section className="pagebox af">
    <PageHead eyebrow="advanced formatting" title={tr('advanced.title')}>
      <Btn label={tr('advanced.importAll')} ic="upload" cls="ghost" title={tr('advanced.importAllTitle')} onClick={() => void bringAll()} />
      <Btn label={tr('advanced.exportAll')} ic="import" cls="ghost" title={tr('advanced.exportAllTitle')} onClick={() => C.download('dreamland-advanced-formatting.json', JSON.stringify(A.masterExport(), null, 4))} />
    </PageHead>
    <p className="hint af-status">{status}</p>
    <div className="tabs">{TABS().map(([k, l]) => <button key={k} className={'tab' + (afTab === k ? ' on' : '')} onClick={() => { afTab = k; redraw(); }}>{l}</button>)}</div>
    <div className="af-pane" key={afTab + ':' + epoch}>{pane}</div>
  </section>;
}
