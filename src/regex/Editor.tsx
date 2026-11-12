// 정규식 스크립트 편집 + 시험 창 (고치는 대로 진단과 결과가 나온다)
import { Fragment, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Btn, Icon, IconBtn } from '../kit';
import type { ModalX, Regex } from '../studio/parts';
import { E, Lint, MODES, RX, WHO, chatLabel, clip, ctxOf, exportOne, lastChat, redrawChat, scName, type Match, type Sc } from './lib';
import { DiffText, HitsText, Issues, PlainText } from './parts';
import { pickMessage, pickTarget } from './pick';
import { Switch, arr, confirmBox, copyText, debounce, openModal, toast } from '../studio/parts';
import { t } from '../i18n';

const samples = new Map<string, string>();   // 스크립트 id → 마지막 시험 입력 (이번 실행 동안)
type View = 'diff' | 'hits' | 'result' | 'each';
type Out = { kind: 'wait' } | { kind: 'empty' } | { kind: 'stop'; msg: string } | { kind: 'none'; why: string[]; note: string }
  | { kind: 'ok'; text: string; result: string; matches: Match[]; found: number; removed: number; added: number; note: string };
const HANG = () => t('regex.ed.hang');
const cap = (g: string | undefined) => g === undefined ? <span className="dim">{t('regex.ed.capNone')}</span> : <code>{g || '∅'}</code>;

interface Ctl { sc: Sc; dead: boolean; seq: number }
function Body({ r, ctl, m, tab0 }: { r: Regex; ctl: Ctl; m: ModalX; tab0: 'form' | 'test' }) {
  const [tab, setTab] = useState(tab0), [tools] = useState(() => { const d = document.createElement('div'); d.className = 'rx-head-tools'; return d; });
  const root = useRef<HTMLDivElement>(null), head = useRef<Element | null>(null);
  // 창 머리의 닫기 단추 앞에 내보내기 · 삭제 단추를 끼운다
  useLayoutEffect(() => { const h = root.current?.closest('.modal-wrap')?.querySelector('.modal-head'); if (!h) return; head.current = h; h.insertBefore(tools, h.querySelector('.ibtn')); }, [tools]);   // 창 머리의 단추는 닫기 하나뿐 (title 글자는 언어마다 다르다)
  const [, bump] = useState(0), [sample, setSample] = useState(samples.get(r.id) || ''), [out, setOut] = useState<Out>({ kind: 'wait' }), [view, setView] = useState<View>('diff');
  const alive = useRef(true), sampleRef = useRef(sample); sampleRef.current = sample;
  const persist = async () => { if (!ctl.dead) await RX().Scope.save(ctl.sc, r); };
  const save = useMemo(() => debounce(() => { void persist(); }, 350), []);   // eslint-disable-line react-hooks/exhaustive-deps
  const run = async () => {
    const my = ++ctl.seq, text = sampleRef.current; samples.set(r.id, text);
    const set = (o: Out) => { if (alive.current && my === ctl.seq) setOut(o); };
    const lint = Lint.lintScript(r);
    if (!text) return set({ kind: 'empty' });
    if (!lint.ok) return set({ kind: 'stop', msg: t('regex.ed.stopLint') });
    const chat = lastChat(), ctx = ctxOf(chat), src = E.regexFind(r, ctx), re = E.compileRegex(src);
    if (!re) { const why = Lint.lintScript({ ...r, find: src }).issues.find(x => x.level === 'error')?.msg || ''; return set({ kind: 'stop', msg: t('regex.ed.stopMacro', { pattern: clip(src, 80), why }) }); }
    const pr = await RX().probe(re.source, re.flags, text); if (my !== ctl.seq) return;
    if (!pr.ok) return set({ kind: 'stop', msg: HANG() });
    const tr: { matches?: Match[] } = {}, result = E.runRegexScript({ ...r, enabled: true }, text, ctx, tr), T = Lint.tally(tr.matches);
    const note = /\{\{/.test(r.find + r.replace + arr(r.trim).join('')) ? (chat ? t('regex.ed.macroFrom', { chat: chatLabel(chat) }) : t('regex.ed.macroNone')) : '';
    if (!T.found) return set({ kind: 'none', why: Lint.whyNoMatch(lint, text), note });
    set({ kind: 'ok', text, result, matches: tr.matches || [], ...T, note });
  };
  const test = useMemo(() => debounce(() => { void run(); }, 220), []);   // eslint-disable-line react-hooks/exhaustive-deps
  const touched = () => { save(); bump(n => n + 1); test(); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { alive.current = true; test(); return () => { alive.current = false; }; }, []);
  useEffect(() => { const h2 = head.current?.querySelector('h2'); if (h2) h2.textContent = r.name || t('regex.ed.untitled'); });

  const lint = Lint.lintScript(r);
  const note = (s: string) => s ? <small className="hint">{s}</small> : null;
  let result: ReactNode = null;
  if (out.kind === 'empty') result = <p className="dim">{t('regex.ed.emptyTest')}</p>;
  else if (out.kind === 'stop') result = <p className="rx-stop">{out.msg}</p>;
  else if (out.kind === 'none') result = <><p className="rx-none">{t('regex.ed.noneFound')}</p><ul className="rx-why">{out.why.map((w, i) => <li key={i}>{w}</li>)}</ul>{note(out.note)}</>;
  else if (out.kind === 'ok') {
    const chips: [View, string][] = [['diff', t('regex.ed.view.diff')], ['hits', t('regex.ed.view.hits')], ['result', t('regex.ed.view.result')], ['each', t('regex.ed.view.each', { count: out.found })]];
    result = <>
      <p className="rx-sum"><b>{t('regex.ed.foundN', { count: out.found })}</b>{t('regex.ed.sumRest', { removed: out.removed.toLocaleString(), added: out.added.toLocaleString(), before: out.text.length.toLocaleString(), after: out.result.length.toLocaleString() })}{out.result === out.text ? t('regex.ed.sumSame') : ''}</p>
      <div className="rx-chips">{chips.map(([v, label]) => <button key={v} type="button" className={'chip' + (v === view ? ' on' : '')} data-v={v} onClick={() => setView(v)}>{label}</button>)}</div>
      <div className="rx-view">
        {view === 'diff' ? <DiffText text={out.text} matches={out.matches} /> : view === 'hits' ? <HitsText text={out.text} matches={out.matches} />
          : view === 'result' ? <><PlainText text={out.result} /><div className="row end"><Btn label={t('regex.ed.copyResult')} ic="copy" cls="ghost" onClick={() => copyText(out.result)} /></div></>
            : <>{out.matches.slice(0, 60).map((x, i) => <div className="rx-match" key={i}>
              <div className="rx-match-head"><b>{t('regex.ed.nth', { n: i + 1 })}</b><small>{t('regex.ed.at', { at: x.index + 1, len: x.match.length })}</small></div>
              <dl><dt>{t('regex.ed.matched')}</dt><dd><code>{x.match || t('regex.ed.emptySpot')}</code></dd>
                {x.groups.map((g, k) => <Fragment key={'g' + k}><dt>{`$${k + 1}`}</dt><dd>{cap(g)}</dd></Fragment>)}
                {Object.entries(x.named || {}).map(([k, g]) => <Fragment key={'n' + k}><dt>{`$<${k}>`}</dt><dd>{cap(g)}</dd></Fragment>)}
                {x.raw !== x.cut ? <><dt>{t('regex.ed.beforeTrim')}</dt><dd><code>{x.raw || '∅'}</code></dd><dt>{t('regex.ed.afterTrim')}</dt><dd><code>{x.cut || '∅'}</code></dd></> : null}
                {x.cut !== x.out ? <><dt>{t('regex.ed.macroFilled')}</dt><dd><code>{x.out || '∅'}</code></dd></> : null}
                <dt>{t('regex.ed.replaced')}</dt><dd><code className="rx-res">{x.out || t('regex.ed.removedSpot')}</code></dd></dl>
            </div>)}{out.matches.length > 60 && <p className="dim">{t('regex.ed.first60', { count: out.matches.length })}</p>}</>}
      </div>{note(out.note)}</>;
  }

  const field = (label: string, ctl_: ReactNode, hint?: string, cls = '') => <label className={('field ' + cls).trim()}><span className="field-label">{label}</span>{ctl_}{hint && <small className="hint">{hint}</small>}</label>;
  const txt = (key: 'name' | 'find' | 'replace', rows: number, placeholder: string) => rows
    ? <textarea className="inp rx-mono" defaultValue={r[key] ?? ''} spellCheck={false} autoComplete="off" rows={rows} placeholder={placeholder} onChange={e => { r[key] = e.target.value; touched(); }} />
    : <input className="inp" defaultValue={r[key] ?? ''} spellCheck={false} autoComplete="off" placeholder={placeholder} onChange={e => { r[key] = e.target.value; touched(); }} />;
  const num = (key: 'minDepth' | 'maxDepth', label: string, min: number) => field(label, <input className="inp" type="number" min={min} max={9999} defaultValue={r[key] ?? ''} placeholder={t('regex.ed.noLimit')} onChange={e => { r[key] = e.target.value === '' ? null : +e.target.value; touched(); }} />, undefined, 'half');
  const move = async (anchor: Element) => { const to = await pickTarget(anchor, ctl.sc); if (!to) return; await persist(); await RX().moveScripts([{ r, sc: ctl.sc }], to); ctl.sc = to; bump(n => n + 1); toast(t('regex.page.moved', { scope: scName(to) }), 'ok'); };
  const del = async () => { if (!(await confirmBox(t('regex.page.confirmDelete', { name: r.name }), t('common.delete'), true))) return; ctl.dead = true; await RX().Scope.remove(ctl.sc, r); m.close(); };
  const sc = ctl.sc;

  return <div className="rx-ed" data-tab={tab} ref={root}>
    {createPortal(<><IconBtn ic="import" title={t('regex.ed.exportSt')} onClick={() => exportOne(r)} /><IconBtn ic="trash" title={t('common.delete')} onClick={() => void del()} /></>, tools)}
    <div className="rx-seg"><button type="button" data-t="form" onClick={() => setTab('form')}>{t('regex.ed.tabForm')}</button><button type="button" data-t="test" onClick={() => setTab('test')}>{t('regex.ed.tabTest')}</button></div>
    <div className="rx-ed-form">
      <div className="rx-ed-top"><label className="rx-on"><Switch span checked={!!r.enabled} title={t('regex.ed.useThis')} onChange={v => { r.enabled = v; touched(); }} /><span>{t('regex.ed.use')}</span></label>
        <div className="rx-scope-line"><span className="rx-scope-tag"><Icon name={sc.kind === 'global' ? 'moon' : sc.kind === 'preset' ? 'sliders' : 'user'} size={14} />{scName(sc)}</span><Btn label={t('regex.move')} cls="ghost" ic="right" onClick={e => void move(e.currentTarget)} /></div></div>
      <div className="form">
        {field(t('common.name'), txt('name', 0, t('regex.ed.namePh')))}
        {field(t('regex.ed.find'), txt('find', 2, t('regex.ed.findPh')), t('regex.ed.findHint'))}
        <div className="field"><div className="rx-flags">{lint.ok ? lint.flagNotes.map((f, i) => <em className="badge" key={i}>{f}</em>) : null}{lint.ok && lint.groups ? <em className="badge">{t('regex.ed.groupsN', { count: lint.groups })}</em> : null}</div>
          <div className="rx-diag">{lint.issues.length ? <Issues issues={lint.issues} /> : <p className="rx-fine"><Icon name="check" size={14} />{t('regex.ed.fine')}</p>}</div></div>
        {field(t('regex.ed.replace'), txt('replace', 4, t('regex.ed.replacePh')), t('regex.ed.replaceHint'))}
        {field(t('regex.ed.trim'), <textarea className="inp rx-mono" rows={2} spellCheck={false} defaultValue={arr(r.trim).join('\n')} placeholder={t('regex.ed.trimPh')} onChange={e => { r.trim = e.target.value.split('\n').filter(x => x.length); touched(); }} />, t('regex.ed.trimHint'))}
        <div className="field"><span className="field-label">{t('regex.ed.who')}</span><div className="rx-pills">{WHO.map(([k, label]) => <label className="check pill" key={k}><input type="checkbox" defaultChecked={!!r[k]} onChange={e => { r[k] = e.target.checked; touched(); }} /><i /><span>{t(label)}</span></label>)}</div></div>
        {field(t('regex.ed.mode'), <select className="inp" defaultValue={String(r.mode ?? MODES[0][0])} onChange={e => { r.mode = e.target.value; touched(); }}>{MODES.map(x => <option key={x[0]} value={x[0]}>{t(x[1])}</option>)}</select>, t('regex.ed.modeHint'), 'half')}
        {field(t('regex.ed.subst'), <select className="inp" defaultValue={String(r.subst ?? 0)} onChange={e => { r.subst = +e.target.value; touched(); }}><option value="0">{t('regex.ed.subst0')}</option><option value="1">{t('regex.ed.subst1')}</option><option value="2">{t('regex.ed.subst2')}</option></select>, t('regex.ed.substHint'), 'half')}
        {num('minDepth', t('regex.ed.minDepth'), -1)}{num('maxDepth', t('regex.ed.maxDepth'), 0)}
        <small className="hint rx-wide">{t('regex.ed.depthHint')}</small>
        <label className="check"><input type="checkbox" defaultChecked={r.runOnEdit === true} onChange={e => { r.runOnEdit = e.target.checked; touched(); }} /><i /><span>{t('regex.ed.runOnEdit')}</span><small>{t('regex.ed.runOnEditHint')}</small></label>
      </div>
    </div>
    <div className="rx-ed-test">
      <div className="rx-test-head"><span className="field-label">{t('regex.ed.testInput')}</span><Btn label={t('regex.ed.fromChat')} cls="ghost" ic="chat" onClick={async () => { const got = await pickMessage(); if (got) { sampleRef.current = got.text; setSample(got.text); test(); } }} /></div>
      <textarea className="inp rx-mono" rows={6} spellCheck={false} placeholder={t('regex.ed.testPh')} value={sample} onChange={e => { sampleRef.current = e.target.value; setSample(e.target.value); test(); }} />
      <div className="rx-out">{result}</div>
    </div>
  </div>;
}

/** 스크립트 편집 창을 연다. 닫히면 저장하고 onClose(마지막 범위) 를 부른다 */
export function openEditor(r: Regex, sc: Sc, { tab = 'form', onClose }: { tab?: 'form' | 'test'; onClose?: (sc: Sc) => void } = {}) {
  if (r.subst === undefined) r.subst = String(r.find || '').includes('{{') ? 1 : 0;   // 옛 스크립트: 엔진이 보던 대로 값을 채워 보여 준다
  if (r.runOnEdit === undefined) r.runOnEdit = false;
  const ctl: Ctl = { sc, dead: false, seq: 0 };
  return openModal({ title: r.name || t('regex.ed.untitled'), wide: true, cls: 'rx-sheet',
    onClose: () => { ctl.seq++; void (async () => { if (!ctl.dead) await RX().Scope.save(ctl.sc, r); redrawChat(); onClose?.(ctl.sc); })(); } },
  m => <Body r={r} ctl={ctl} m={m} tab0={tab} />);
}
