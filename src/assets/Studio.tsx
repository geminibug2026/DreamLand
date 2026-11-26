// 기능 화면 › 에셋: 요약 · 시작하기 · 프롬프트 · 에셋 · 렌더링 · 도구
import { Fragment, useEffect, useRef, useState, type CSSProperties, type MouseEvent, type ReactElement } from 'react';
import { Avatar, Btn, Icon } from '../kit';
import { Check, PathIcon, Select, openModal, useRedraw } from '../addons/parts';
import type { CharX, ChatX } from '../addons/types';
import type { Persona } from '../lib/types';
import { A, DEFAULT_PRESETS, MACROS, PATHS, ROLES, SAMPLE, STYLES, WHERE, addAlias, cfg, charCfg, chatSrcs, cleanup, cleanupPlan, copy, exportPreset, exportSettings, exportZip, frameRegex, importPresets, importSettings, inspect, isDirty, ownersOf, presetName, presetOf, promptStats, refreshChat, regexClash, renderPrompt, resetChar, save, srcOf, type Inspect, type Src, type Where } from './logic';
import { Board, Sec } from './Manager';
import { SBtn, Tiny, openGallery, setPreviewOwners, sheet, smartRename } from './windows';
import { choiceBox, confirmBox, promptBox, toast } from '../ui';
import { S, esc } from '../lib/core';
import { render } from '../lib/format';
import { chatApi } from '../chat/actions';
import { t } from '../i18n';

const asMax = (px: string) => ({ '--as-max': px }) as CSSProperties;
const Lines = () => <span className="ast-lines"><i /><i /><i /><i /></span>;
const num = (n: number) => n.toLocaleString();

interface Ctx { c: ReturnType<typeof cfg>; As: ReturnType<typeof A>; owners: string[]; charId?: string; char: CharX | null; room: ChatX | null; srcs: Src[]; persona?: Persona; pOwner: string; linkChar?: CharX; copyPrompt: () => void; draw: () => void }

export function AssetsStudio() {
  // draw: 탭 안을 새로 만든다 · soft: 값만 다시 읽어 그린다
  const [gen, setGen] = useState(0), draw = () => setGen(g => g + 1), soft = useRedraw();
  const c = cfg(), As = A();
  const room = chatApi.current().chat, group = !!room && room.charIds.length > 1, inChat = group && c.ui.char === '#chat';
  const char = inChat ? null : S.get('chars', c.ui.char) || S.get('chars', room?.charIds?.[0]) || S.chars[0] || null;
  const owner = char ? As.ownerOfChar(char.id) : '', cc = char ? charCfg(char.id) : null;
  if (char && cc && cc.link && (cc.link === char.id || !S.get('chars', cc.link))) cc.link = '';
  const persona = S.get('personas', c.ui.persona) || (room ? S.persona(room) : undefined) || S.get('personas', S.settings.activePersona as string) || S.personas[0];
  const pOwner = persona ? As.ownerOfPersona(persona.id) : '';
  const srcs = inChat ? chatSrcs(room).filter(s => s.owner.startsWith('char:')) : char ? [srcOf(owner)] : [];
  const owners = inChat ? ownersOf(room) : char ? [owner, ...(pOwner ? [pOwner] : [])] : [];
  const charId = inChat ? room?.charIds[0] : char?.id;
  const ownersKey = owners.join('|');
  useEffect(() => {
    let alive = true;
    As.load([...owners, ...(pOwner ? [pOwner] : [])]).then(() => { if (alive) draw(); }).catch(e => console.warn('[에셋]', e));
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ownersKey, pOwner]);
  setPreviewOwners(() => owners);

  const tab = c.ui.tab || 'assets', setTab = (k: string) => { c.ui.tab = k; save(); draw(); };
  const copyPrompt = () => void copy(renderPrompt(owners, charId), t('assets.studio.copiedPrompt'));
  const files = srcs.flatMap(s => As.inVer(s.src, s.ver)), off = files.filter(a => a.disabled).length, keys = new Set(files.filter(a => !a.disabled).map(a => As.baseOf(a.name))).size;
  const linked = !!char && !!srcs[0]?.locked, linkChar = linked ? S.get('chars', cc?.link) : undefined, ver = cc?.ver || '';

  // ── 요약 ──
  const status = <div className="ast-status">
    {inChat ? <span className="avatar sm ast-many"><Icon name="users" size={18} /></span> : char ? <Avatar o={char} cls="sm" /> : <div className="avatar sm">?</div>}
    <div className="ast-status-main">
      {S.chars.length ? <Select value={inChat ? '#chat' : char?.id} cls="ast-charsel" opts={[...(group ? [['#chat', t('assets.studio.thisChat', { count: room!.charIds.length })] as const] : []), ...S.chars.map(x => [x.id, x.name] as const)]} onChange={v => { c.ui.char = v; save(); draw(); }} /> : <b>{t('assets.studio.noChar')}</b>}
      {char || inChat ? <span className="ast-chips">
        <span className="fx-pill"><b className="fx-num">{num(files.length)}</b>{t('assets.sum.files')}</span>
        <span className="fx-pill"><b className="fx-num">{num(keys)}</b>{t('assets.sum.keys')}</span>
        {off ? <span className="fx-pill dim"><b className="fx-num">{num(off)}</b>{t('assets.sum.off')}</span> : null}
        {ver ? <span className="fx-pill"><PathIcon d={PATHS.layers} size={12} />{ver}</span> : null}
        {linked ? <span className="fx-pill acc"><PathIcon d={PATHS.link} size={12} />{t('assets.studio.linkBadge', { name: linkChar?.name })}</span> : null}
        <span className={'fx-pill' + (c.inject ? ' on' : ' dim')}>{c.inject ? t('assets.sum.injectOn') : t('assets.sum.injectOff')}</span>
        {c.show === false ? <span className="fx-pill dim">{t('assets.sum.hidden')}</span> : null}
      </span> : <span className="ast-status-sum">{t('assets.studio.makeChar')}</span>}
    </div>
    {char || inChat ? <div className="ast-actions">
      <SBtn label={t('assets.gallery')} d={PATHS.grid} onClick={() => openGallery([...srcs, ...(pOwner ? [srcOf(pOwner)] : [])], t('assets.galleryTitle', { name: char ? char.name : t('assets.gal.chatMembers') }), { onChange: soft })} />
      <Btn label={t('assets.studio.copyPrompt')} ic="copy" title={t('assets.studio.copyPromptTip')} onClick={copyPrompt} />
    </div> : null}
  </div>;

  // ── 시작하기: 올리기 → 대화에 보이기 → 안내문 넣기. 다 하면 사라진다 ──
  const steps: [string, boolean, string, () => void][] = [
    ['upload', files.length > 0, t('assets.start.upload'), () => setTab('assets')],
    ['show', c.show !== false, t('assets.start.show'), () => { c.show = true; save(); refreshChat(); draw(); }],
    ['prompt', !!c.inject, t('assets.start.prompt'), () => { c.inject = true; save(); draw(); }],
  ];
  const left = steps.filter(s => !s[1]).length;
  const start = (char || inChat) && left && !c.ui.setupHidden ? <div className="ast-start fx-frame">
    <div className="ast-start-head"><b>{t('assets.start.title')}</b><span className="fx-num">{`${3 - left} / 3`}</span><Tiny title={t('assets.start.hide')} onClick={() => { c.ui.setupHidden = true; save(); draw(); }}><Icon name="x" size={14} /></Tiny></div>
    <ol>{steps.map(([k, done, label, go], i) => <li key={k} className={done ? 'done' : ''}><i className="fx-num">{done ? '✓' : i + 1}</i><span>{label}</span>{done ? null : <button type="button" className="btn ghost" onClick={go}>{t(k === 'upload' ? 'assets.start.go' : 'assets.start.turnOn')}</button>}</li>)}</ol>
  </div> : null;

  // ── 에셋 ──
  const assetsTab = () => {
    if (!srcs.length) return <div className="card ast-card"><p className="dim ast-empty">{t('assets.studio.needChar')}</p></div>;
    if (inChat) return <div className="ast-stack"><p className="hint ast-note">{t('assets.studio.chatNote')}</p><div className="card ast-card"><Board srcs={srcs} onChange={soft} /></div></div>;
    const ch = char!, cfgc = cc!, others = S.chars.filter(x => x.id !== ch.id), src = srcs[0].src;
    const vers = [...new Set([...cfgc.vers, ...(linked ? charCfg(cfgc.link).vers : []), ...(ver ? [ver] : [])])];
    const setVer = (v: string) => { cfgc.ver = v; save(); refreshChat(); draw(); };
    const lockMsg = linked ? t('assets.link.lockMsg', { name: linkChar?.name }) : '';
    return <div className="ast-stack">
      <details className="card ast-card ast-folder" open={!!(cfgc.link || ver) || undefined}>
        <summary><PathIcon d={PATHS.layers} size={16} /><b>{t('assets.folder.title')}</b><span>{linked ? t('assets.studio.linkBadge', { name: linkChar?.name }) : ver ? t('assets.studio.verBadge', { ver }) : t('assets.folder.base')}</span></summary>
        <div className="ast-two">
          <div className="ast-sec">
            <Sec ic={<PathIcon d={PATHS.link} size={16} />} title={t('assets.link.title')} desc={t('assets.link.desc')} />
            <div className="ast-row">
              <Select value={cfgc.link || ''} opts={[['', t('assets.link.none')], ...others.map(x => [x.id, x.name] as const)]} onChange={async v => { cfgc.link = v; save(); await As.load([owner]); refreshChat(); draw(); }} />
              <Tiny title={t('assets.link.unlink')} onClick={() => { if (!cfgc.link) return; cfgc.link = ''; save(); refreshChat(); draw(); }}><Icon name="x" size={14} /></Tiny>
            </div>
            <small className="ast-info">{linked ? (ver ? t('assets.link.usingVer', { name: linkChar?.name, ver, count: As.inVer(src, ver).length }) : t('assets.link.using', { name: linkChar?.name, count: As.inVer(src, ver).length })) : t('assets.link.own')}</small>
          </div>
          <div className="ast-sec">
            <Sec ic={<PathIcon d={PATHS.layers} size={16} />} title={t('assets.ver.title')} desc={t('assets.ver.desc')} />
            <div className="ast-row">
              <Select value={ver} opts={[['', t('assets.ver.base')], ...vers.map(v => [v, v] as const)]} onChange={setVer} />
              <Tiny title={t('assets.ver.add')} onClick={async () => {
                const name = (await promptBox(t('assets.ver.newAsk'), ''))?.trim(); if (!name) return;
                if (vers.includes(name)) return toast(t('assets.ver.taken'), 'err');
                cfgc.vers.push(name); setVer(name);
              }}><Icon name="plus" size={14} /></Tiny>
              <Tiny title={t('assets.ver.rename')} onClick={async () => {
                if (!ver) return toast(t('assets.ver.baseNoRename')); if (linked) return toast(lockMsg);
                const name = (await promptBox(t('assets.ver.nameAsk'), ver))?.trim(); if (!name || name === ver) return;
                if (vers.includes(name)) return toast(t('assets.ver.taken'), 'err');
                for (const a of As.inVer(owner, ver)) await As.update({ ...a, ver: name });
                cfgc.vers = cfgc.vers.map(v => v === ver ? name : v); setVer(name);
              }}><Icon name="edit" size={14} /></Tiny>
              <Tiny title={t('assets.ver.delete')} cls="bad" onClick={async () => {
                if (!ver) return toast(t('assets.ver.baseNoDelete')); if (linked) return toast(lockMsg);
                const list = As.inVer(owner, ver);
                if (!(await confirmBox(t('assets.ver.deleteAsk', { ver, count: list.length }), t('common.delete'), true))) return;
                for (const a of list) await As.remove(a);
                cfgc.vers = cfgc.vers.filter(v => v !== ver); setVer('');
              }}><Icon name="trash" size={14} /></Tiny>
            </div>
            <small className="ast-info">{ver ? t('assets.ver.using', { ver }) : t('assets.ver.usingBase')}</small>
          </div>
        </div>
      </details>
      <div className="card ast-card"><Board srcs={srcs} onChange={soft} /></div>
    </div>;
  };

  const x: Ctx = { c, As, owners, charId, char, room, srcs, persona, pOwner, linkChar, copyPrompt, draw };
  const TABS: [string, string, string, () => ReactElement][] = [['prompt', t('assets.tab.prompt'), 'note', () => <PromptTab x={x} />], ['assets', t('assets.title'), 'folder', assetsTab], ['render', t('assets.tab.render'), 'sparkle', () => <RenderTab x={x} />], ['tools', t('assets.tab.tools'), 'gear', () => <ToolsTab x={x} />]];
  const cur = TABS.find(x => x[0] === tab) || TABS[1];
  return <>
    {status}
    {start}
    <div className="ast-tabs" role="tablist">{TABS.map(([k, l, ic]) => <button key={k} type="button" role="tab" aria-selected={cur[0] === k} className={cur[0] === k ? 'on' : undefined} onClick={() => setTab(k)}><Icon name={ic} size={16} /><span>{l}</span></button>)}</div>
    <Fragment key={cur[0] + ':' + gen}>{cur[3]()}</Fragment>
  </>;
}

// ── 프롬프트 ──
function PromptTab({ x }: { x: Ctx }) {
const { c, As, owners, charId, char, draw } = x;
  const p = presetOf(), [text, setText] = useState(p.prompt), area = useRef<HTMLTextAreaElement>(null), redraw = useRedraw();
  const isDefault = /^d\d$/.test(p.id), dirty = isDirty(p), st = promptStats(text, owners, charId);
  const edit = (v: string) => { p.prompt = v; setText(v); save(); };
  const keep = () => { p.saved = p.prompt; save(); redraw(); toast(t('assets.prompt.saved', { name: presetName(p) }), 'ok'); };
  const revert = () => { if (p.saved != null) edit(p.saved); redraw(); };
  const switchTo = async (id: string) => {
    if (id === p.id) return;
    if (dirty) {
      const k = await choiceBox(t('assets.prompt.unsavedTitle'), <p>{t('assets.prompt.unsavedBody', { name: presetName(p) })}</p>, [{ key: 'drop', label: t('assets.prompt.dropGo'), cls: 'danger' }, { key: 'save', label: t('assets.prompt.saveGo'), cls: 'primary' }]);
      if (!k) return draw();
      if (k === 'save') p.saved = p.prompt; else p.prompt = p.saved ?? p.prompt;
    }
    c.preset = id; save(); draw();
  };
  const more = (e: MouseEvent<HTMLElement>) => sheet(e.currentTarget, [
    { label: t('assets.prompt.newPreset'), ic: 'plus', run: async () => {
      const name = (await promptBox(t('assets.prompt.newPresetAsk'), ''))?.trim(); if (!name) return;
      if (c.presets.some(x => x.name === name)) return toast(t('assets.prompt.presetTaken'), 'err');
      const id = 'p' + Date.now().toString(36); c.presets.push({ id, name, prompt: p.prompt, saved: p.prompt }); c.preset = id; save(); draw(); toast(t('assets.prompt.presetMade'), 'ok');
    } },
    { label: t('assets.prompt.renamePreset'), ic: 'edit', run: async () => {
      const name = (await promptBox(t('assets.prompt.presetNameAsk'), p.name))?.trim(); if (!name || name === p.name) return;
      if (c.presets.some(x => x.name === name)) return toast(t('assets.prompt.presetTaken'), 'err');
      p.name = name; save(); draw();
    } },
    { label: t('common.delete'), ic: 'trash', danger: true, off: c.presets.length <= 1, run: async () => {
      if (!(await confirmBox(t('assets.prompt.deleteAsk', { name: presetName(p) }), t('common.delete'), true))) return;
      c.presets = c.presets.filter(x => x !== p); c.preset = c.presets[0].id; save(); draw();
    } },
    '-',
    { label: t('assets.prompt.replaceKeys'), ic: 'sparkle', hint: t('assets.prompt.replaceKeysTip'), run: () => {
      if (!/\{\{img_keywords(_autogen)?\}\}/i.test(p.prompt)) return toast(t('assets.prompt.noKeysMacro'));
      const list = As.names(owners).join(', '); if (!list) return toast(t('assets.prompt.noActive'));
      edit(p.prompt.replace(/\{\{img_keywords(_autogen)?\}\}/gi, list)); toast(t('assets.prompt.replaced'), 'ok');
    } },
    isDefault && { label: t('assets.prompt.default'), ic: 'refresh', hint: t('assets.prompt.defaultTip'), run: async () => { if (await confirmBox(t('assets.prompt.resetAsk', { name: presetName(p) }), t('assets.prompt.revert'))) edit(DEFAULT_PRESETS[+p.id.slice(1)].prompt); } },
    '-',
    { label: t('assets.prompt.exportPreset'), d: PATHS.down, run: exportPreset },
    { label: t('assets.prompt.importPreset'), ic: 'import', run: () => void importPresets(draw) },
  ], t('assets.prompt.preset'));
  const where = c.where || 'depth';
  return <div className="card ast-card">
    <div className="ast-sec">
      <Sec ic={<Icon name="note" size={16} />} title={t('assets.prompt.title')} desc={t('assets.prompt.desc')} />
      <div className="ast-inject">
        <Check label={t('assets.prompt.inject')} on={c.inject} onChange={v => { c.inject = v; save(); redraw(); }} hint={t('assets.prompt.injectHint')} />
        <div className={'ast-inject-row' + (c.inject ? '' : ' dim')}>
          <label className="field inline"><span className="field-label">{t('assets.where.label')}</span><Select value={where} opts={WHERE.map(([v, k]) => [v, t(k)] as const)} onChange={v => { c.where = v as Where; save(); redraw(); }} /></label>
          {where === 'depth' ? <label className="field inline"><span className="field-label">{t('assets.prompt.depth')}</span><input className="inp" type="number" min={0} max={20} defaultValue={c.depth ?? 2} title={t('assets.prompt.depthTip')} onChange={e => { c.depth = Math.min(20, Math.max(0, Math.round(+e.target.value) || 0)); save(); }} /></label> : null}
          <label className="field inline"><span className="field-label">{t('assets.role.label')}</span><Select value={c.role || 'system'} opts={ROLES.map(([v, k]) => [v, t(k)] as const)} onChange={v => { c.role = v; save(); redraw(); }} /></label>
          <label className="field inline"><span className="field-label">{t('assets.maxPerReply')}</span><input className="inp" type="number" min={1} max={6} defaultValue={c.max ?? 2} onChange={e => { c.max = Math.min(6, Math.max(1, Math.round(+e.target.value) || 1)); save(); }} /></label>
        </div>
      </div>
      <div className="ast-preset-row"><span className="field-label">{t('assets.prompt.preset')}</span>
        <Select value={c.preset} opts={c.presets.map(x => [x.id, presetName(x) + (isDirty(x) ? ' •' : '')] as const)} onChange={v => void switchTo(v)} />
        <button type="button" className="ibtn ast-ib" title={t('assets.prompt.presetTools')} aria-label={t('assets.prompt.presetTools')} aria-haspopup="menu" onClick={more}><PathIcon d={PATHS.dots} /></button></div>
      <div className={'ast-editor' + (dirty ? ' dirty' : '')}>
        <div className="ast-editor-head">
          <span className={'ast-mark' + (dirty ? ' on' : '')}>{dirty ? t('assets.prompt.dirty') : t('assets.prompt.clean')}</span>
          <span className="ast-stats fx-num">{t('assets.prompt.stats', { chars: num(st.chars), tok: num(st.tok) })}{st.filled ? t('assets.prompt.statsFilled', { tok: num(st.filled) }) : ''}</span>
        </div>
        <textarea className="inp ast-prompt" ref={area} value={text} rows={14} spellCheck={false} onChange={e => edit(e.target.value)} />
        <div className="ast-editor-acts">
          <Btn label={t('common.save')} ic="check" cls={dirty ? 'primary' : ''} onClick={() => dirty ? keep() : toast(t('assets.prompt.nothingNew'))} />
          <Btn label={t('assets.prompt.revert')} ic="refresh" onClick={() => dirty ? revert() : toast(t('assets.prompt.nothingNew'))} />
          <Btn label={t('assets.preview')} ic="eye" onClick={() => openModal({ title: t('assets.prompt.previewTitle', { name: char?.name || t('assets.gal.chatMembers') }), wide: true, spec: 'pre.ast-preview' }, () => owners.length ? renderPrompt(owners, charId, text) : t('assets.studio.needChar'))} />
        </div>
      </div>
      <div className="ast-macros">{MACROS.map(([m, d]) => <button key={m} type="button" className="ast-macro" title={t('assets.prompt.macroTip', { desc: t(d) })} onClick={() => { const ta = area.current; if (!ta) return; const at = ta.selectionStart ?? ta.value.length; ta.setRangeText(m, at, ta.selectionEnd ?? at, 'end'); ta.focus(); edit(ta.value); }}><code>{m}</code><span>{t(d)}</span></button>)}</div>
    </div>
  </div>;
}

// ── 렌더링 ──
function RenderTab({ x }: { x: Ctx }) {
const { c, As, owners, char, room } = x;
  const redraw = useRedraw(), [probe, setProbe] = useState('');
  const set = (k: 'show' | 'random' | 'lazy' | 'zoom' | 'caption' | 'fuzzy' | 'sprites', v: boolean) => { c[k] = v; save(); refreshChat(); redraw(); };
  const live = owners.length ? As.active(owners[0])[0] || As.active(owners[1])[0] : undefined, sample = live ? As.url(live) : SAMPLE;
  const style = STYLES.some(s => s[0] === c.style) ? c.style : 'ink', max = Math.round(+c.maxSize) || 400;
  const clash = regexClash(room?.charIds || (char ? [char.id] : []));
  // 미리 보기: 실제 대화와 같은 렌더러로 그린다 (에셋이 없으면 견본 그림)
  const fake = '<span class="asset-frame as-' + style + '" style="--as-max:' + max + 'px"><img class="asset-img" alt="" src="' + esc(sample) + '"></span>';
  const pv = t('assets.render.sample1') + '\n\n' + (live ? `{{img::${live.name}}}` : fake) + '\n\n' + t('assets.render.sample2') + (live && c.missing !== 'hide' ? ` {{img::${t('assets.render.sampleMiss')}}}` : '');
  const html = render(As.expand(pv, owners, 'preview'), { style: 'novel' });
  const hit = probe.trim() ? As.match(owners, probe) : null, cand = probe.trim() && !hit ? As.suggest(owners, probe, 4) : [];
  return <div className="ast-stack">
    <div className="card ast-card">
      <div className="ast-sec">
        <Sec ic={<Icon name="sparkle" size={16} />} title={t('assets.render.title')} desc={<span>{t('assets.render.descBefore')}<code>{t('assets.render.descCode')}</code>{t('assets.render.descAfter')}</span>} />
        <Check cls="ast-master" label={<b>{t('assets.render.show')}</b>} on={c.show !== false} onChange={v => set('show', v)} hint={t('assets.render.showHint')} />
        {clash.length ? <div className="ast-warn"><Icon name="code" size={16} /><span>{t('assets.render.clash', { names: clash.map(r => r.name).join(', ') })}</span></div> : null}
        <div className="ast-toggles">
          <Check label={t('assets.render.random')} on={c.random} onChange={v => set('random', v)} hint={t('assets.render.randomHint')} />
          <Check label={t('assets.render.zoom')} on={c.zoom !== false} onChange={v => set('zoom', v)} hint={t('assets.render.zoomHint')} />
          <Check label={t('assets.render.caption')} on={c.caption} onChange={v => set('caption', v)} hint={t('assets.render.captionHint')} />
          <Check label={t('assets.render.lazy')} on={c.lazy !== false} onChange={v => set('lazy', v)} hint={t('assets.render.lazyHint')} />
        </div>
        <div className="field"><span className="field-label">{t('assets.render.maxSize')}</span>
          <div className="range"><input type="range" min={120} max={Math.max(800, max)} step={20} value={max} onChange={e => { c.maxSize = +e.target.value; save(); refreshChat(); redraw(); }} /><output className="fx-num">{`${max}px`}</output></div>
          <small className="hint">{t('assets.render.maxSizeHint')}</small></div>
      </div>
      <div className="ast-sec">
        <Sec ic={<Icon name="image" size={16} />} title={t('assets.render.style')} desc={t('assets.render.styleDesc')} />
        <div className="ast-styles" role="radiogroup" aria-label={t('assets.render.style')}>{STYLES.map(([id, name, desc]) => <button key={id} type="button" role="radio" aria-checked={style === id} className={'ast-style' + (style === id ? ' on' : '')} onClick={() => { c.style = id; save(); refreshChat(); redraw(); }}>
          <span className={'ast-pv' + (id.startsWith('float') ? ' side' + (id === 'float-right' ? ' r' : '') : '')}><span className={`asset-frame as-${id}`} style={asMax('104px')}><img className="asset-img" alt="" src={sample} /></span>{id.startsWith('float') ? <Lines /> : null}</span>
          <b>{t(name)}</b><small>{t(desc)}</small></button>)}</div>
        <div className="ast-live-wrap"><span className="ast-live-tag">{t('assets.preview')}</span>
          {c.show === false ? <p className="dim ast-empty">{t('assets.render.offNote')}</p> : <div className="msg-body ast-live" dangerouslySetInnerHTML={{ __html: html }} />}</div>
      </div>
    </div>
    <div className="card ast-card">
      <div className="ast-sec">
        <Sec ic={<Icon name="search" size={16} />} title={t('assets.match.title')} desc={t('assets.match.desc')} />
        <div className="ast-toggles">
          <Check label={t('assets.match.fuzzy')} on={c.fuzzy !== false} onChange={v => set('fuzzy', v)} hint={t('assets.match.fuzzyHint')} />
          <Check label={t('assets.match.sprites')} on={c.sprites} onChange={v => set('sprites', v)} hint={t('assets.match.spritesHint')} />
        </div>
        <label className="field"><span className="field-label">{t('assets.miss.label')}</span>
          <Select value={c.missing || 'hint'} opts={[['hint', t('assets.miss.hint')], ['hide', t('assets.miss.hide')], ['keep', t('assets.miss.keep')]]} onChange={v => { c.missing = v as 'hint'; save(); refreshChat(); redraw(); }} /></label>
        <div className="ast-probe">
          <div className="search-wrap"><Icon name="search" size={16} /><input className="inp" value={probe} placeholder={t('assets.match.probePh')} onChange={e => setProbe(e.target.value)} /></div>
          {probe.trim() ? hit ? <div className="ast-probe-hit">
            <img src={As.url(hit.main)} alt="" /><div><b>{hit.main.name}</b><small>{t('assets.how.' + hit.how)}{hit.list.length > 1 ? ' · ' + t('assets.match.group', { count: hit.list.length }) : ''}{hit.owner.startsWith('persona:') ? ' · ' + t('assets.match.fromPersona') : ''}</small></div>
          </div> : <div className="ast-probe-miss"><span>{t('assets.match.none')}</span>{cand.map(a => <button key={a.id} type="button" className="fx-pill fx-tap" title={t('assets.miss.useHint', { alias: probe.trim() })} onClick={async () => { const skip = await addAlias(a, probe.trim()); toast(skip ? t('assets.alias.clash') : t('assets.miss.added', { alias: probe.trim(), name: a.name }), skip ? '' : 'ok'); redraw(); }}>{`→ ${a.name}`}</button>)}</div> : null}
        </div>
      </div>
    </div>
  </div>;
}

// ── 도구 ──
function ToolsTab({ x }: { x: Ctx }) {
const { c, As, char, srcs, persona, pOwner, linkChar, copyPrompt, draw } = x;
  const redraw = useRedraw(), [res, setRes] = useState<Inspect | null>(null);
  const run = () => { const { chat, msgs } = chatApi.current(); if (!chat) return toast(t('assets.cmd.noChat')); void As.load(ownersOf(chat)).then(() => setRes(inspect(msgs, ownersOf(chat)))); };
  const room2 = chatApi.current().chat;
  const [frame, setFrame] = useState(c.style);
  return <div className="ast-stack">
    <div className="card ast-card">
      <div className="ast-sec">
        <Sec ic={<PathIcon d={PATHS.stethoscope} size={16} />} title={t('assets.insp.title')} desc={room2 ? t('assets.insp.desc', { name: chatApi.roomName(room2) }) : t('assets.cmd.noChat')}><Btn label={t('assets.insp.run')} ic="search" cls="primary" onClick={run} /></Sec>
        {res ? <div className="ast-insp">
          <div className="ast-stats4">
            <div><b className="fx-num">{num(res.total)}</b><span>{t('assets.insp.tags')}</span></div>
            <div><b className="fx-num">{num(res.used.length)}</b><span>{t('assets.insp.used')}</span></div>
            <div className={res.miss.length ? 'warn' : ''}><b className="fx-num">{num(res.miss.length)}</b><span>{t('assets.insp.miss')}</span></div>
            <div><b className="fx-num">{num(res.unused.length)}</b><span>{t('assets.insp.unused')}</span></div>
          </div>
          {!res.total ? <p className="dim">{t('assets.insp.noTags')}</p> : res.miss.length ? <>
            <h5>{t('assets.insp.missTitle')}</h5>
            <ul className="ast-insp-list fx-rows">{res.miss.slice(0, 24).map(m => <li key={m.name}><code>{m.name}</code><small className="fx-num">{t('assets.insp.times', { count: m.n })}</small>
              <span className="ast-cands">{m.cand.length ? m.cand.map(a => <button key={a.id} type="button" className="fx-pill fx-tap" onClick={async () => { const skip = await addAlias(a, m.name); toast(skip ? t('assets.alias.clash') : t('assets.miss.added', { alias: m.name, name: a.name }), skip ? '' : 'ok'); run(); }}>{`→ ${a.name}`}</button>) : <small className="dim">{t('assets.miss.none')}</small>}</span></li>)}</ul>
            <p className="hint">{t('assets.insp.candHint')}</p>
          </> : <p className="ast-ok"><Icon name="check" size={16} />{t('assets.insp.allOk')}</p>}
          {res.near.length ? <><h5>{t('assets.insp.nearTitle')}</h5><ul className="ast-insp-list fx-rows">{res.near.slice(0, 16).map(n => <li key={n.name}><code>{n.name}</code><i>→</i><code>{n.file}</code><small>{t('assets.how.' + n.how)} · {t('assets.insp.times', { count: n.n })}</small></li>)}</ul></> : null}
          {res.used.length ? <><h5>{t('assets.insp.topTitle')}</h5><div className="ast-chipset">{res.used.slice(0, 10).map(([k, n]) => <span key={k} className="fx-pill">{k}<b className="fx-num">{n}</b></span>)}</div></> : null}
          {res.unused.length && res.total ? <><h5>{t('assets.insp.unusedTitle')}</h5><div className="ast-chipset">{res.unused.slice(0, 40).map(k => <span key={k} className="fx-pill dim">{k}</span>)}{res.unused.length > 40 ? <span className="dim">{t('assets.tidy.more', { count: res.unused.length - 40 })}</span> : null}</div></> : null}
        </div> : null}
      </div>
    </div>
    <div className="card ast-card">
      <div className="ast-sec">
        <Sec ic={<Icon name="user" size={16} />} title={t('assets.tools.persona')} desc={t('assets.tools.personaDesc')} />
        {persona ? <div className="ast-row"><Avatar o={persona} cls="xs" /><Select value={persona.id} opts={S.personas.map(x => [x.id, x.name] as const)} onChange={async v => { c.ui.persona = v; save(); await As.load([As.ownerOfPersona(v)]); draw(); }} /></div> : null}
      </div>
      {persona ? <Board srcs={[srcOf(pOwner)]} onChange={redraw} /> : <p className="dim ast-empty">{t('assets.tools.noPersona')}</p>}
    </div>
    <div className="card ast-card">
      <div className="ast-sec">
        <Sec ic={<PathIcon d={PATHS.broom} size={16} />} title={t('assets.tools.tidyTitle')} desc={t('assets.tools.tidyDesc')} />
        <div className="ast-btngrid three">
          <SBtn label={t('assets.mgr.tidy')} d={PATHS.broom} title={t('assets.mgr.tidyTip')} onClick={() => { const s = srcs[0]; if (!char || !s) return toast(t('assets.tools.noChar')); if (s.locked) return toast(t('assets.link.lockMsg', { name: linkChar?.name })); smartRename(s.src, s.ver, redraw); }} />
          <SBtn label={t('assets.clean.btn')} d={PATHS.eraser} onClick={async () => {
            const p = await cleanupPlan(), n = p.gone.length + p.links.length + p.orphan.length + p.ui;
            if (!n) return toast(t('assets.clean.nothing'));
            if (!(await confirmBox(t('assets.clean.ask', { gone: p.gone.length, links: p.links.length, files: p.orphan.length }), t('assets.clean.go'), p.orphan.length > 0))) return;
            await cleanup(p); toast(t('assets.clean.done'), 'ok'); draw();
          }} />
          <SBtn label={t('assets.reset.btn')} d={PATHS.eraser} cls="danger" onClick={async () => {
            if (!char) return toast(t('assets.tools.noChar'));
            if (!(await confirmBox(t('assets.reset.ask', { name: char.name }), t('common.reset'), true))) return;
            await resetChar(char.id); toast(t('assets.reset.done'), 'ok'); draw();
          }} />
        </div>
      </div>
    </div>
    <div className="card ast-card">
      <div className="ast-sec">
        <Sec ic={<Icon name="folder" size={16} />} title={t('assets.tools.backup')} desc={t('assets.tools.backupDesc')} />
        <div className="ast-btngrid">
          <SBtn label={t('assets.tools.exportZip')} d={PATHS.zip} title={t('assets.tools.exportZipTip')} onClick={() => char ? void exportZip(char) : toast(t('assets.tools.noChar'))} />
          <Btn label={t('assets.studio.copyPrompt')} ic="copy" onClick={copyPrompt} />
          <SBtn label={t('assets.tools.backupSettings')} d={PATHS.down} title={t('assets.tools.backupSettingsTip')} onClick={exportSettings} />
          <Btn label={t('assets.tools.restore')} ic="import" onClick={() => void importSettings(draw)} />
        </div>
      </div>
    </div>
    <div className="card ast-card">
      <div className="ast-sec">
        <Sec ic={<PathIcon d={PATHS.code} size={16} />} title={t('assets.regex.title')} desc={t('assets.regex.desc')} />
        <div className="ast-row"><Select value={frame} opts={STYLES.map(([id, k]) => [id, t(k)] as const)} onChange={setFrame} /><Btn label={t('assets.regex.make')} ic="plus" onClick={() => void frameRegex(frame)} /></div>
      </div>
    </div>
    <div className="card ast-card">
      <div className="ast-sec">
        <Sec ic={<Icon name="book" size={16} />} title={t('assets.help.title')} desc={t('assets.help.desc')} />
        <details className="ast-details" open><summary>{t('assets.help.basics')}</summary><ol>
          <li>{t('assets.help.step1')}</li>
          <li>{t('assets.help.step2')}</li>
          <li>{t('assets.help.step3Before')}<code>{t('assets.render.descCode')}</code>{t('assets.help.step3After')}</li></ol></details>
        <details className="ast-details"><summary>{t('assets.help.naming')}</summary><ul>
          <li><code>joy.png</code>{t('assets.help.name1')}</li>
          <li><code>joy_1.png</code>, <code>joy-2.png</code>, <code>joy.3.png</code>{t('assets.help.name2')}</li>
          <li>{t('assets.help.name3Before')}<code>{'{{img::joy.png}}'}</code>{t('assets.help.name3After')}</li>
          <li>{t('assets.help.name4')}</li></ul></details>
        <details className="ast-details"><summary>{t('assets.help.macros')}</summary><div className="ast-macros plain">{MACROS.map(([m, d]) => <div key={m} className="ast-macro"><code>{m}</code><span>{t(d)}</span></div>)}</div></details>
        <details className="ast-details"><summary>{t('assets.help.commands')}</summary><ul>
          <li><code>{t('assets.help.cmdUploadCode')}</code>{t('assets.help.cmdUpload')}</li>
          <li><code>/assets-gallery</code>{t('assets.help.cmdGallery')}</li>
          <li><code>/assets-list</code>{t('assets.help.cmdList')}</li>
          <li><code>/refresh-img-keywords</code>{t('assets.help.cmdRefresh')}</li></ul></details>
      </div>
    </div>
  </div>;
}
