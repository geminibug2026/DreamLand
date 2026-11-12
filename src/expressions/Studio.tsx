// 기능 › 표정: 세트 · 판정 · 표시
import { useEffect, useRef, useState, type DragEvent, type ReactNode } from 'react';
import { Avatar, Btn, Icon, IconBtn } from '../kit';
import type { CharX } from '../addons/types';
import { errMsg } from '../addons/parts';
import { Check, Field, Select, openModal, useRedraw, type Opt } from '../addons/parts';
import { ALIASES, DEFAULT_LABELS, canonLabel, cleanLabel, keywordLabel, plainText } from './pure';
import { CALL_PROMPT, MODES, Sprites, TAG_PROMPT, bus, candidates, cfg, charCfg, clip, customOf, fallbackOf, fullName, nameOf, save, tagInstruction, universe } from './store';
import { exportZip, importFiles } from './upload';
import { S, pickFiles } from '../lib/core';
import { modal } from '../ui/dom';
import { charPicker, confirmBox, promptBox, toast } from '../ui';
import { macro, quickCall, tokens } from '../lib/engine';
import { chatApi } from '../chat/actions';
import { t, fmtNum } from '../i18n';

function Range({ value, min, max, step, unit, onChange }: { value: number; min: number; max: number; step: number; unit: string; onChange: (v: number) => void }) {
  return <div className="range"><input type="range" min={min} max={max} step={step} value={value} onChange={e => onChange(+e.target.value)} /><output>{value + unit}</output></div>;
}
const SecHead = ({ title, desc, children }: { title: string; desc?: string; children?: ReactNode }) => {
  const side = Array.isArray(children) ? children.some(Boolean) : !!children;
  return <div className="exs-sec-head"><div><h4>{title}</h4>{desc ? <p>{desc}</p> : null}</div>{side ? <div className="exs-actions">{children}</div> : null}</div>;
};
const bigImage = (title: string, src: string) => { const img = document.createElement('img'); img.className = 'full-img'; img.src = src; img.alt = ''; modal({ title, wide: true, body: img }); };

/** 한 감정의 그림들: 더하기 · 옮기기 · 지우기 · (사용자 정의면) 이름과 키워드 */
function labelDialog(char: CharX, label: string, onChange: () => void) {
  openModal({ title: `${char.name} · ${fullName(label)}`, wide: true, spec: 'div.exs-detail' }, close => <LabelDetail char={char} label={label} onChange={onChange} close={close} />);
}
function LabelDetail({ char, label, onChange, close }: { char: CharX; label: string; onChange: () => void; close: () => void }) {
  const redraw = useRedraw(), c = cfg();
  const changed = () => { redraw(); onChange(); bus.sync(); };
  const add = async () => { if (await importFiles(char.id, await pickFiles({ accept: 'image/*,.zip', multiple: true }), { label })) changed(); };
  const list = Sprites.of(char.id, label), custom = customOf(label), cc = charCfg(char.id), isFb = fallbackOf(char.id) === label;
  return <>
    <div className="exs-detail-top">
      <p className="hint">{list.length > 1 ? t('expressions.detail.many', { count: list.length }) : list.length ? t('expressions.detail.one') : t('expressions.detail.none')}</p>
      <div className="exs-actions"><Btn label={t('expressions.detail.addImages')} ic="upload" onClick={() => void add()} />
        {list.length ? <Btn label={isFb ? t('expressions.detail.isFallback') : t('expressions.detail.setFallback')} ic="star" cls={isFb ? 'ghost' : ''} title={t('expressions.detail.fallbackTip')} onClick={() => { cc.fallback = label; save(); changed(); }} /> : null}</div>
    </div>
    {list.length ? <div className="exs-detail-grid">{list.map(a => <figure key={a.id} className="exs-fig-card">
      <button type="button" className="exs-thumb big" title={t('expressions.zoom')} onClick={() => bigImage(a.name, a.data)}><img src={a.data} alt="" loading="lazy" /></button>
      <figcaption><span title={a.name}>{a.name}</span>
        <Select cls="exs-move" value={label} opts={universe(char.id).map(l => [l, l === label ? t('expressions.detail.move') : fullName(l)] as const)} onChange={async v => { if (v === label) return; await Sprites.update(char.id, { ...a, label: v }); toast(t('expressions.detail.moved', { name: nameOf(v) })); changed(); }} />
        <IconBtn ic="trash" title={t('expressions.detail.deleteImage')} cls="tiny" onClick={async () => { if (!(await confirmBox(t('expressions.detail.deleteImageAsk', { name: a.name }), t('expressions.delete'), true))) return; await Sprites.remove(char.id, a); changed(); }} /></figcaption>
    </figure>)}</div> : null}
    {custom ? <div className="exs-custom">
      <h4>{t('expressions.custom.title')}</h4>
      <Field label={t('expressions.custom.displayName')}><input className="inp" defaultValue={custom.name || ''} placeholder={label} onChange={e => { custom.name = e.target.value.trim(); save(); onChange(); }} /></Field>
      <Field label={t('expressions.custom.keys')} hint={t('expressions.custom.keysHint')}><input className="inp" defaultValue={custom.keys || ''} placeholder={t('expressions.custom.keysPh')} onChange={e => { custom.keys = e.target.value; save(); }} /></Field>
      <div className="exs-actions"><Btn label={t('expressions.custom.delete')} ic="trash" cls="danger" onClick={async () => {
        if (!(await confirmBox(t('expressions.custom.deleteAsk', { label }), t('common.delete'), true))) return;
        c.custom = c.custom.filter(x => x.label !== label); save(); close(); onChange();
      }} /></div>
    </div> : null}
  </>;
}

// 화면을 떠났다 돌아와도 남는 보기 상태
const view = { sub: 'set', filter: 'all', query: '' };
const pickChar = (): CharX | null => { const c = cfg(), { chat } = chatApi.current(); return S.get('chars', c.ui.char) || S.get('chars', chat?.charIds?.[0]) || [...S.chars].sort((a, b) => (c.chars[b.id]?.n || 0) - (c.chars[a.id]?.n || 0))[0] || null; };
const dragOver = (e: DragEvent<HTMLElement>, stop = false) => { e.preventDefault(); if (stop) e.stopPropagation(); e.currentTarget.classList.add('over'); };
const dragLeave = (e: DragEvent<HTMLElement>) => e.currentTarget.classList.remove('over');

// ── 세트 ──
function SetTab({ char, draw }: { char: CharX | null; draw: () => void }) {
  const prog = useRef<HTMLDivElement>(null), bar = useRef<HTMLElement>(null);
  if (!char) return <div className="card exs-card"><p className="dim exs-empty">{t('expressions.set.noChar')}</p></div>;
  const c = cfg(), pick = pickFiles, list = Sprites.list(char.id), have = Sprites.labels(char.id);
  const progress = (n: number, total: number) => { prog.current?.classList.toggle('on', n < total); if (bar.current) bar.current.style.width = Math.round(n / Math.max(1, total) * 100) + '%'; };
  const add = async (files: File[], label = '') => { if (!files?.length) return; prog.current?.classList.add('on'); if (bar.current) bar.current.style.width = '4%'; try { await importFiles(char.id, files, { label, onProgress: progress }); } finally { prog.current?.classList.remove('on'); } draw(); };
  const cc = charCfg(char.id), all = universe(char.id), fb = fallbackOf(char.id);
  const hit = (l: string) => { const q = view.query.trim().toLowerCase(); return (!q || (l + ' ' + nameOf(l) + ' ' + (ALIASES[l] || '')).toLowerCase().includes(q)) && (view.filter === 'all' || (view.filter === 'have') === have.includes(l)); };
  const addLabel = async () => {
    const v = await promptBox(t('expressions.set.newLabel'), '', { placeholder: t('expressions.set.newLabelPh') }); if (v == null) return;
    const lab = cleanLabel(v); if (!lab) return toast(t('expressions.set.needName'), 'err');
    if (universe(char.id).includes(lab)) return toast(t('expressions.set.exists'), 'err');
    const known = canonLabel(lab, DEFAULT_LABELS); if (known && !(await confirmBox(t('expressions.set.aliasAsk', { label: lab, known: fullName(known) }), t('expressions.set.makeAnyway')))) return;
    c.custom.push({ label: lab, name: '', keys: '' }); save(); view.filter = 'all'; view.query = ''; draw(); labelDialog(char, lab, draw);
  };
  const chips = [['all', t('expressions.set.filterAll', { count: all.length })], ['have', t('expressions.set.filterHave', { count: all.filter(l => have.includes(l)).length })], ['none', t('expressions.set.filterEmpty', { count: all.filter(l => !have.includes(l)).length })]];
  const fbOpts: Opt[] = [['', t('expressions.set.fbGlobal', { name: c.fallback === '#none' ? t('common.none') : nameOf(c.fallback) })], ['#none', t('expressions.fbNone')], ...all.filter(l => have.includes(l)).map(l => [l, fullName(l)] as const)];
  return <div className="card exs-card">
    <div className="exs-sec">
      <SecHead title={t('expressions.set.title', { name: char.name })} desc={t('expressions.set.desc')}>
        <Btn label={t('expressions.set.upload')} ic="upload" onClick={async () => add(await pick({ accept: 'image/*', multiple: true }))} />
        <Btn label={t('expressions.set.folder')} ic="folder" title={t('expressions.set.folderTip')} onClick={async () => add(await pick({ dir: true, multiple: true }))} />
        <Btn label="ZIP" ic="import" title={t('expressions.set.zipTip')} onClick={async () => add(await pick({ accept: '.zip,application/zip' }))} />
        {list.length ? <Btn label={t('common.export')} ic="import" cls="ghost" title={t('expressions.set.exportTip')} onClick={() => exportZip(char)} /> : null}
        {list.length ? <Btn label={t('expressions.set.clearAll')} ic="trash" cls="ghost" onClick={async () => { if (!(await confirmBox(t('expressions.set.clearAllAsk', { name: char.name, count: list.length }), t('expressions.delete'), true))) return; await Sprites.clear(char.id); toast(t('expressions.set.clearedAll'), 'ok'); bus.sync(); draw(); }} /> : null}
      </SecHead>
      <div className="dropzone small exs-drop" onClick={async () => add(await pick({ accept: 'image/*,.zip', multiple: true }))} onDragOver={e => dragOver(e)} onDragLeave={dragLeave}
        onDrop={e => { e.preventDefault(); e.currentTarget.classList.remove('over'); void add([...e.dataTransfer.files]); }}>
        <Icon name="upload" size={22} /><b>{t('expressions.set.drop')}</b><span>{t('expressions.set.dropHint')}</span></div>
      <div className="exs-prog" ref={prog}><i ref={bar} /></div>
    </div>
    <div className="exs-sec">
      <div className="exs-toolbar">
        <div className="search-wrap"><Icon name="search" size={16} /><input className="inp" placeholder={t('expressions.set.searchPh')} value={view.query} onChange={e => { view.query = e.target.value; draw(); }} /></div>
        <div className="exs-seg">{chips.map(([k, l]) => <button key={k} type="button" className={view.filter === k ? 'on' : undefined} onClick={() => { view.filter = k; draw(); }}>{l}</button>)}</div>
      </div>
      <div className="exs-grid">
        {all.filter(hit).map(l => {
          const imgs = Sprites.of(char.id, l), custom = !DEFAULT_LABELS.includes(l);
          return <button key={l} type="button" className={'exs-label' + (imgs.length ? '' : ' empty')} title={imgs.length ? t('expressions.set.labelTip', { name: fullName(l), count: imgs.length }) : t('expressions.set.labelTipNone', { name: fullName(l) })} onClick={() => labelDialog(char, l, draw)}
            onDragOver={e => dragOver(e, true)} onDragLeave={dragLeave} onDrop={e => { e.preventDefault(); e.stopPropagation(); e.currentTarget.classList.remove('over'); void add([...e.dataTransfer.files], l); }}>
            <span className="exs-thumb">{imgs.length ? <img src={imgs[0].data} alt="" loading="lazy" /> : <i>✦</i>}{imgs.length > 1 ? <span className="exs-count">{t('expressions.set.count', { count: imgs.length })}</span> : null}{fb === l && imgs.length ? <span className="exs-fb">{t('expressions.set.fbBadge')}</span> : null}</span>
            <span className="exs-label-cap"><b>{nameOf(l)}</b><small>{custom ? (nameOf(l) === l ? t('expressions.custom.tag') : t('expressions.custom.tagWith', { label: l })) : l}</small></span>
          </button>;
        })}
        <button type="button" className="exs-label add" title={t('expressions.set.addLabel')} onClick={() => void addLabel()}><span className="exs-thumb"><Icon name="plus" size={22} /></span><span className="exs-label-cap"><b>{t('expressions.set.addLabel')}</b><small>{t('expressions.custom.tag')}</small></span></button>
      </div>
      <div className="exs-fbrow"><Field cls="half" label={t('expressions.set.charFallback')} hint={t('expressions.set.charFallbackHint')}>
        <Select value={cc.fallback || ''} opts={fbOpts} onChange={v => { cc.fallback = v; save(); bus.sync(); draw(); }} /></Field></div>
    </div>
  </div>;
}

// ── 판정 ──
function DetectTab({ char, draw }: { char: CharX | null; draw: () => void }) {
  const c = cfg(), alive = useRef(true);
  const testIn = useRef<HTMLTextAreaElement>(null), [out, setOut] = useState<ReactNode>(null);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  const show = (n: ReactNode) => { if (alive.current) setOut(n); };
  const conns: Opt[] = [['', t('expressions.detect.connDefault')], ...S.conns.map(x => [x.id, `${x.name}${x.model ? ' · ' + x.model : ''}`] as const)];
  const sample = char && Sprites.has(char.id) ? tagInstruction(char, null) : '';
  const showScore = (r: { label: string; scores: Record<string, number> }) => { const top = Object.entries(r.scores).sort((a, b) => b[1] - a[1]).slice(0, 4); show(<><b>{r.label ? fullName(r.label) : t('expressions.detect.noGuess')}</b>{top.map(([l, s]) => <span key={l} className="chip static">{`${nameOf(l)} ${s.toFixed(1)}`}</span>)}</>); };
  const helpers = (S.settings.helpers || {}) as Record<string, string>;
  return <div className="exs-stack">
    <div className="card exs-card">
      <div className="exs-sec">
        <SecHead title={t('expressions.detect.howTitle')} desc={t('expressions.detect.howDesc')} />
        <div className="exs-modes">{MODES().map(([k, title, desc, cost]) => <button key={k} type="button" className={'exs-mode' + (c.mode === k ? ' on' : '')} onClick={() => { c.mode = k; save(); draw(); }}><b>{title}</b><span>{desc}</span><em>{cost}</em></button>)}</div>
        <Check label={t('expressions.detect.onlyHave')} on={c.onlyHave} onChange={v => { c.onlyHave = v; save(); draw(); }} hint={t('expressions.detect.onlyHaveHint')} />
      </div>
    </div>
    {c.mode === 'tag' ? <div className="card exs-card"><div className="exs-sec">
      <SecHead title={t('expressions.detect.tagTitle')} desc={t('expressions.detect.tagDesc')}><Btn label={t('expressions.default')} ic="refresh" cls="ghost" onClick={() => { c.tagPrompt = ''; save(); draw(); }} /></SecHead>
      <textarea className="inp exs-prompt" rows={7} spellCheck={false} value={c.tagPrompt || ''} placeholder={TAG_PROMPT} onChange={e => { c.tagPrompt = e.target.value; save(); draw(); }} />
      <small className="hint">{t('expressions.detect.tagHint')}</small>
      {sample ? <small className="hint">{t('expressions.detect.tagCost', { name: char!.name, count: fmtNum(tokens(sample)) })}</small> : char ? <small className="hint">{t('expressions.detect.tagNeed', { name: char.name })}</small> : null}
      <Check label={t('expressions.detect.tagFallback')} on={c.tagFallback} onChange={v => { c.tagFallback = v; save(); draw(); }} />
    </div></div> : null}
    {c.mode === 'call' ? <div className="card exs-card"><div className="exs-sec">
      <SecHead title={t('expressions.detect.callTitle')} desc={t('expressions.detect.callDesc')}><Btn label={t('expressions.default')} ic="refresh" cls="ghost" onClick={() => { c.callPrompt = ''; save(); draw(); }} /></SecHead>
      <div className="form">
        <Field cls="half" label={t('expressions.detect.conn')} hint={t('expressions.detect.connHint')}><Select value={helpers.expr || ''} opts={conns} onChange={v => { S.set({ helpers: { ...helpers, expr: v } }); draw(); }} /></Field>
        <Field cls="third" label={t('expressions.detect.context')}><input className="inp" type="number" min={0} max={6} defaultValue={c.callContext} onChange={e => { c.callContext = Math.max(0, Math.min(6, Math.round(+e.target.value) || 0)); save(); }} /></Field>
        <Field cls="third" label={t('expressions.detect.maxTokens')} hint={t('expressions.detect.maxTokensHint')}><input className="inp" type="number" min={16} max={4000} step={10} defaultValue={c.callTokens} onChange={e => { c.callTokens = Math.max(16, Math.round(+e.target.value) || 300); save(); }} /></Field>
      </div>
      <textarea className="inp exs-prompt" rows={6} spellCheck={false} value={c.callPrompt || ''} placeholder={CALL_PROMPT} onChange={e => { c.callPrompt = e.target.value; save(); draw(); }} />
      <small className="hint">{t('expressions.detect.callHint')}</small>
    </div></div> : null}
    <div className="card exs-card"><div className="exs-sec">
      <SecHead title={t('expressions.detect.testTitle')} desc={t('expressions.detect.testDesc')} />
      <textarea className="inp" rows={3} ref={testIn} placeholder={t('expressions.detect.testPh')} />
      <div className="exs-actions">
        <Btn label={t('expressions.byKeyword')} ic="search" onClick={() => showScore(keywordLabel(testIn.current?.value, { labels: char && c.onlyHave ? candidates(char.id) : [], custom: c.custom }))} />
        <Btn label={t('expressions.detect.askOnce')} ic="sparkle" cls="ghost" onClick={async e => {
          const text = testIn.current?.value || '';
          if (!text.trim()) return toast(t('expressions.detect.needText'));
          const labels = char && candidates(char.id).length > 1 ? candidates(char.id) : universe(char?.id), conn = S.helperConn('expr', chatApi.current().chat);
          if (!conn) return toast(t('expressions.noConn'), 'err');
          const b = e.currentTarget; b.disabled = true; show(t('expressions.detect.asking'));
          try {
            const sys = macro(String(c.callPrompt || '').trim() || CALL_PROMPT, { char: char?.name || 'the character', user: S.settings.userNameFallback as string | undefined, vars: {} }).replace(/\{\{labels\}\}/gi, labels.join(', '));
            const res = await quickCall(sys, `[Latest reply by ${char?.name || 'the character'}]\n${clip(plainText(text), 1800)}`, { maxTokens: Math.max(16, +c.callTokens || 300), conn });
            const l = canonLabel(res, labels) || canonLabel(res, universe(char?.id));
            show(<><b>{l ? fullName(l) : t('expressions.detect.notFound')}</b><span className="chip static">{t('expressions.detect.modelSaid', { text: String(res).slice(0, 60) || t('expressions.detect.emptyReply') })}</span></>);
          } catch (err) { show(t('expressions.detect.failed', { error: errMsg(err) })); } finally { b.disabled = false; }
        }} />
      </div>
      <div className="exs-test-out">{out}</div>
    </div></div>
  </div>;
}

// ── 표시 ──
function ViewTab({ char, draw }: { char: CharX | null; draw: () => void }) {
  const c = cfg(), all = universe(char?.id);
  const tog = <K extends 'show' | 'dossier' | 'avatars' | 'fade' | 'multi' | 'standing' | 'dim'>(k: K) => (v: boolean) => { c[k] = v; save(); draw(); };
  return <div className="exs-stack">
    <div className="card exs-card"><div className="exs-sec">
      <SecHead title={t('expressions.view.chatTitle')} desc={t('expressions.view.chatDesc')} />
      <div className="exs-toggles">
        <Check label={t('expressions.view.show')} on={c.show} onChange={tog('show')} hint={t('expressions.view.showHint')} />
        <Check label={t('expressions.view.dossier')} on={c.dossier} onChange={tog('dossier')} hint={t('expressions.view.dossierHint')} />
        <Check label={t('expressions.view.avatars')} on={c.avatars} onChange={tog('avatars')} hint={t('expressions.view.avatarsHint')} />
        <Check label={t('expressions.view.fade')} on={c.fade} onChange={tog('fade')} />
        <Check label={t('expressions.view.multi')} on={c.multi} onChange={tog('multi')} hint={t('expressions.view.multiHint')} />
      </div>
      <div className="form">
        <Field cls="half" label={t('expressions.view.fit')}><Select value={c.avatarFit} opts={[['contain', t('expressions.view.fitContain')], ['cover', t('expressions.view.fitCover')]]} onChange={v => { c.avatarFit = v; save(); draw(); }} /></Field>
        <Field cls="half" label={t('expressions.view.fallback')} hint={t('expressions.view.fallbackHint')}><Select value={c.fallback} opts={[['#none', t('expressions.fbNone')], ...all.map(l => [l, fullName(l)] as const)]} onChange={v => { c.fallback = v; save(); draw(); }} /></Field>
        <Field cls="half" label={t('expressions.view.maxPx')} hint={t('expressions.view.maxPxHint')}><input className="inp" type="number" min={256} max={4096} step={64} defaultValue={c.maxPx} onChange={e => { c.maxPx = Math.max(256, Math.min(4096, Math.round(+e.target.value) || 1280)); save(); }} /></Field>
      </div>
    </div></div>
    <div className="card exs-card"><div className="exs-sec">
      <SecHead title={t('expressions.standing.on')} desc={t('expressions.view.standingDesc')} />
      <div className="exs-toggles">
        <Check label={t('expressions.standing.on')} on={c.standing} onChange={tog('standing')} hint={t('expressions.view.standingHint')} />
        <Check label={t('expressions.view.dim')} on={c.dim} onChange={tog('dim')} />
      </div>
      <div className="form">
        <Field cls="half" label={t('expressions.view.side')}><Select value={c.side} opts={[['right', t('expressions.view.right')], ['left', t('expressions.view.left')]]} onChange={v => { c.side = v; save(); draw(); }} /></Field>
        <Field cls="half" label={t('expressions.view.size')} hint={t('expressions.view.sizeHint')}><Range value={c.size} min={30} max={96} step={2} unit="%" onChange={v => { c.size = v; save(); draw(); }} /></Field>
        <Field cls="half" label={t('expressions.view.sizeOver')} hint={t('expressions.view.sizeOverHint')}><Range value={c.sizeOver} min={20} max={80} step={2} unit="%" onChange={v => { c.sizeOver = v; save(); draw(); }} /></Field>
        <Field cls="half" label={t('expressions.view.opacity')} hint={t('expressions.view.opacityHint')}><Range value={c.overOpacity} min={30} max={100} step={5} unit="%" onChange={v => { c.overOpacity = v; save(); draw(); }} /></Field>
      </div>
    </div></div>
    <div className="card exs-card"><div className="exs-sec">
      <SecHead title={t('expressions.help.title')} />
      <ul className="exs-help">
        <li>{t('expressions.help.set')}</li>
        <li>{t('expressions.help.detect')}</li>
        <li><code>{t('expressions.help.emoteCode')}</code>{t('expressions.help.emoteBefore')}<code>{t('expressions.help.emoteGroupCode')}</code>{t('expressions.help.emoteAfter')}</li>
        <li>{t('expressions.help.menu')}</li>
        <li><code>{'{{expression}}'}</code>{t('expressions.help.macro')}</li>
      </ul>
    </div></div>
  </div>;
}

const TABS = [['set', 'expressions.tab.set', 'image'], ['detect', 'expressions.tab.detect', 'sparkle'], ['view', 'expressions.tab.view', 'eye']] as const;
export function ExprStudio() {
  const draw = useRedraw();
  useEffect(() => {
    let alive = true; const first = pickChar();
    if (first && !Sprites.has(first.id)) Sprites.load(first.id).then(() => { Sprites.note(first.id); if (alive) draw(); }).catch(e => console.warn('[표정]', e));
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const c = cfg(), char = pickChar();
  const list = char ? Sprites.list(char.id) : [], have = char ? Sprites.labels(char.id) : [];
  const modes = MODES(), mode = modes.find(m => m[0] === c.mode) || modes[0];
  const choose = () => charPicker({ title: t('expressions.head.pickTitle'), multi: false, selected: char ? [char.id] : [], note: x => c.chars[x.id]?.n ? t('expressions.head.pickNote', { count: c.chars[x.id].n }) : '', onDone: async ([id]) => { c.ui.char = id; save(); await Sprites.load(id); draw(); } });
  const sub = TABS.some(t => t[0] === view.sub) ? view.sub : 'set';
  return <>
    <div className="exs-head">
      {char ? <Avatar o={char} cls="sm" /> : <div className="avatar sm">?</div>}
      <div className="exs-head-text"><b>{char ? char.name : t('expressions.head.noChar')}</b><small>{char ? (list.length ? t('expressions.head.sum', { count: list.length, labels: have.length }) : t('expressions.head.empty')) : t('expressions.head.makeChar')}<em className="badge">{t('expressions.head.mode', { mode: mode[1] })}</em></small></div>
      {S.chars.length > 1 ? <Btn label={t('expressions.head.pickChar')} ic="users" onClick={choose} /> : null}
    </div>
    <div className="exs-tabs" role="tablist">{TABS.map(([k, l, ic]) => <button key={k} type="button" role="tab" className={sub === k ? 'on' : undefined} onClick={() => { view.sub = k; draw(); }}><Icon name={ic} size={16} /><span>{t(l)}</span></button>)}</div>
    {sub === 'set' ? <SetTab key={char?.id || ''} char={char} draw={draw} /> : sub === 'detect' ? <DetectTab key={c.mode} char={char} draw={draw} /> : <ViewTab char={char} draw={draw} />}
  </>;
}
