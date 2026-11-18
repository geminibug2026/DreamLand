// 기능 화면 › 에셋: 프롬프트 · 에셋 · 렌더링 · 도구
import { Fragment, useEffect, useRef, useState, type CSSProperties, type ReactElement } from 'react';
import { Avatar, Btn, Icon } from '../kit';
import { Check, PathIcon, Select, openModal, useRedraw } from '../addons/parts';
import { A, DEFAULT_PRESETS, MACROS, PATHS, SAMPLE, STYLES, cfg, presetName, charCfg, copy, exportPreset, exportSettings, exportZip, importPresets, importSettings, presetOf, renderPrompt, save } from './logic';
import { Manager, Sec } from './Manager';
import { SBtn, Tiny } from './windows';
import { confirmBox, promptBox, toast } from '../ui';
import { S } from '../lib/core';
import { chatApi } from '../chat/actions';
import { t } from '../i18n';

let sub = 'prompt';
const asMax = (px: string) => ({ '--as-max': px }) as CSSProperties;
const Lines = () => <span className="ast-lines"><i /><i /><i /><i /></span>;

export function AssetsStudio() {
  // draw: 옛 draw() 처럼 탭 안을 새로 만든다 · soft: 값만 다시 읽어 그린다
  const [gen, setGen] = useState(0), draw = () => setGen(g => g + 1), soft = useRedraw();
  const area = useRef<HTMLTextAreaElement>(null);
  const As = A();
  const pickChar = () => { const c = cfg(), { chat } = chatApi.current(); return S.get('chars', c.ui.char) || S.get('chars', chat?.charIds?.[0]) || S.chars[0] || null; };
  useEffect(() => {
    let alive = true; const first = pickChar();
    As.load([...(first ? [As.ownerOfChar(first.id)] : []), ...S.personas.map(p => As.ownerOfPersona(p.id))]).then(() => { if (alive) draw(); }).catch(e => console.warn('[에셋]', e));
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const c = cfg(), char = pickChar(), p = presetOf();
  const owner = char ? As.ownerOfChar(char.id) : '', cc = char ? charCfg(char.id) : null;
  if (char && cc && cc.link && (cc.link === char.id || !S.get('chars', cc.link))) cc.link = '';
  const src = owner ? As.source(owner) : '', linked = !!owner && src !== owner, linkChar = linked ? S.get('chars', cc?.link) : undefined, ver = cc?.ver || '';
  const cur = chatApi.current().chat;
  const persona = S.get('personas', c.ui.persona) || (cur ? S.persona(cur) : undefined) || S.get('personas', S.settings.activePersona as string) || S.personas[0];
  const owners = char ? [owner, ...(persona ? [As.ownerOfPersona(persona.id)] : [])] : [];
  const copyPrompt = () => void copy(renderPrompt(owners, char?.id), t('assets.studio.copiedPrompt'));

  const act = char ? As.active(owner) : [], all = char ? As.inVer(src, ver) : [];
  const status = <div className="ast-status">
    {char ? <Avatar o={char} cls="sm" /> : <div className="avatar sm">?</div>}
    <div className="ast-status-main">
      {S.chars.length ? <Select value={char?.id} opts={S.chars.map(x => [x.id, x.name] as const)} cls="ast-charsel" onChange={async v => { c.ui.char = v; save(); await As.load([As.ownerOfChar(v)]); draw(); }} /> : <b>{t('assets.studio.noChar')}</b>}
      <span className="ast-status-sum">{!char ? t('assets.studio.makeChar') : <><b>{t('assets.studio.count', { count: all.length })}</b>{t('assets.studio.sum', { on: act.length, keys: new Set(act.map(a => As.baseOf(a.name))).size })}{ver ? <em className="badge">{t('assets.studio.verBadge', { ver })}</em> : ''}{linked ? <em className="badge on">{t('assets.studio.linkBadge', { name: linkChar?.name })}</em> : ''}</>}</span>
    </div>
    <div className="ast-actions"><Btn label={t('assets.studio.copyPrompt')} ic="copy" title={t('assets.studio.copyPromptTip')} onClick={copyPrompt} /></div>
  </div>;

  // ── 프롬프트 ──
  const promptTab = () => {
    const isDefault = /^d\d$/.test(p.id);
    return <div className="card ast-card">
      <div className="ast-sec">
        <Sec ic={<Icon name="note" size={16} />} title={t('assets.prompt.title')} desc={t('assets.prompt.desc')}>
          {isDefault && <Btn label={t('assets.prompt.default')} ic="refresh" title={t('assets.prompt.defaultTip')} onClick={async () => { if (await confirmBox(t('assets.prompt.resetAsk', { name: presetName(p) }), t('assets.prompt.revert'))) { p.prompt = DEFAULT_PRESETS[+p.id.slice(1)].prompt; save(); draw(); } }} />}
          <Btn label={t('assets.prompt.replaceKeys')} ic="sparkle" title={t('assets.prompt.replaceKeysTip')} onClick={() => {
            if (!/\{\{img_keywords(_autogen)?\}\}/i.test(p.prompt)) return toast(t('assets.prompt.noKeysMacro'));
            const list = As.names(owners).join(', '); if (!list) return toast(t('assets.prompt.noActive'));
            p.prompt = p.prompt.replace(/\{\{img_keywords(_autogen)?\}\}/gi, list); save(); draw(); toast(t('assets.prompt.replaced'), 'ok');
          }} />
        </Sec>
        <div className="ast-inject">
          <Check label={t('assets.prompt.inject')} on={c.inject} onChange={v => { c.inject = v; save(); soft(); }} hint={t('assets.prompt.injectHint')} />
          <label className="field inline"><span className="field-label">{t('assets.maxPerReply')}</span><input className="inp" type="number" min={1} max={6} defaultValue={c.max ?? 2} onChange={e => { c.max = Math.min(6, Math.max(1, Math.round(+e.target.value) || 1)); save(); }} /></label>
          <label className="field inline"><span className="field-label">{t('assets.prompt.depth')}</span><input className="inp" type="number" min={0} max={20} defaultValue={c.depth ?? 2} title={t('assets.prompt.depthTip')} onChange={e => { c.depth = Math.min(20, Math.max(0, Math.round(+e.target.value) || 0)); save(); }} /></label>
        </div>
        <div className="ast-preset-row"><span className="field-label">{t('assets.prompt.preset')}</span><Select value={c.preset} opts={c.presets.map(x => [x.id, presetName(x)] as const)} onChange={v => { c.preset = v; save(); draw(); }} /></div>
        <div className="ast-btngrid">
          <Btn label={t('assets.prompt.newPreset')} ic="plus" onClick={async () => {
            const name = (await promptBox(t('assets.prompt.newPresetAsk'), ''))?.trim(); if (!name) return;
            if (c.presets.some(x => x.name === name)) return toast(t('assets.prompt.presetTaken'), 'err');
            const id = 'p' + Date.now().toString(36); c.presets.push({ id, name, prompt: p.prompt }); c.preset = id; save(); draw(); toast(t('assets.prompt.presetMade'), 'ok');
          }} />
          <Btn label={t('assets.prompt.renamePreset')} ic="edit" onClick={async () => {
            const name = (await promptBox(t('assets.prompt.presetNameAsk'), p.name))?.trim(); if (!name || name === p.name) return;
            if (c.presets.some(x => x.name === name)) return toast(t('assets.prompt.presetTaken'), 'err');
            p.name = name; save(); draw();
          }} />
          <Btn label={t('common.delete')} ic="trash" cls="danger" onClick={async () => {
            if (c.presets.length <= 1) return toast(t('assets.prompt.lastPreset'));
            if (!(await confirmBox(t('assets.prompt.deleteAsk', { name: presetName(p) }), t('common.delete'), true))) return;
            c.presets = c.presets.filter(x => x !== p); c.preset = c.presets[0].id; save(); draw();
          }} />
          <Btn label={t('assets.preview')} ic="eye" onClick={() => openModal({ title: t('assets.prompt.previewTitle', { name: char?.name || t('assets.studio.noChar') }), wide: true, spec: 'pre.ast-preview' }, () => renderPrompt(owners, char?.id))} />
        </div>
        <textarea className="inp ast-prompt" ref={area} defaultValue={p.prompt} rows={16} spellCheck={false} onChange={e => { p.prompt = e.target.value; save(); }} />
        <div className="ast-macros">{MACROS.map(([m, d]) => <button key={m} type="button" className="ast-macro" title={t('assets.prompt.macroTip', { desc: t(d) })} onClick={() => { const ta = area.current; if (!ta) return; const at = ta.selectionStart ?? ta.value.length; ta.setRangeText(m, at, ta.selectionEnd ?? at, 'end'); ta.focus(); p.prompt = ta.value; save(); }}><code>{m}</code><span>{t(d)}</span></button>)}</div>
        <div className="ast-btngrid two">
          <SBtn label={t('assets.prompt.exportPreset')} d={PATHS.down} onClick={exportPreset} />
          <Btn label={t('assets.prompt.importPreset')} ic="import" onClick={() => void importPresets(draw)} />
        </div>
      </div>
    </div>;
  };

  // ── 에셋 ──
  const assetsTab = () => {
    if (!char || !cc) return <div className="card ast-card"><p className="dim ast-empty">{t('assets.studio.needChar')}</p></div>;
    const others = S.chars.filter(x => x.id !== char.id);
    const vers = [...new Set([...cc.vers, ...(linked ? charCfg(cc.link).vers : []), ...(ver ? [ver] : [])])];
    const setVer = (v: string) => { cc.ver = v; save(); draw(); };
    const lockMsg = linked ? t('assets.link.lockMsg', { name: linkChar?.name }) : '';
    return <div className="ast-stack">
      <div className="card ast-card ast-two">
        <div className="ast-sec">
          <Sec ic={<PathIcon d={PATHS.link} size={16} />} title={t('assets.link.title')} desc={t('assets.link.desc')} />
          <div className="ast-row">
            <Select value={cc.link || ''} opts={[['', t('assets.link.none')], ...others.map(x => [x.id, x.name] as const)]} onChange={async v => { cc.link = v; save(); await As.load([owner]); draw(); }} />
            <Tiny title={t('assets.link.unlink')} onClick={() => { if (!cc.link) return; cc.link = ''; save(); draw(); }}><Icon name="x" size={14} /></Tiny>
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
              cc.vers.push(name); setVer(name);
            }}><Icon name="plus" size={14} /></Tiny>
            <Tiny title={t('assets.ver.rename')} onClick={async () => {
              if (!ver) return toast(t('assets.ver.baseNoRename')); if (linked) return toast(lockMsg);
              const name = (await promptBox(t('assets.ver.nameAsk'), ver))?.trim(); if (!name || name === ver) return;
              if (vers.includes(name)) return toast(t('assets.ver.taken'), 'err');
              for (const a of As.inVer(owner, ver)) await As.update({ ...a, ver: name });
              cc.vers = cc.vers.map(v => v === ver ? name : v); setVer(name);
            }}><Icon name="edit" size={14} /></Tiny>
            <Tiny title={t('assets.ver.delete')} cls="bad" onClick={async () => {
              if (!ver) return toast(t('assets.ver.baseNoDelete')); if (linked) return toast(lockMsg);
              const list = As.inVer(owner, ver);
              if (!(await confirmBox(t('assets.ver.deleteAsk', { ver, count: list.length }), t('common.delete'), true))) return;
              for (const a of list) await As.remove(a);
              cc.vers = cc.vers.filter(v => v !== ver); setVer('');
            }}><Icon name="trash" size={14} /></Tiny>
          </div>
          <small className="ast-info">{ver ? t('assets.ver.using', { ver }) : t('assets.ver.usingBase')}</small>
        </div>
      </div>
      <div className="card ast-card"><Manager owner={owner} ver={ver} src={src} locked={linked} lockMsg={lockMsg} title={t('assets.ofName', { name: char.name })} onChange={soft} /></div>
    </div>;
  };

  // ── 렌더링 ──
  const renderTab = () => {
    const sample = (char && As.active(owner)[0]?.data) || SAMPLE;
    return <div className="card ast-card">
      <div className="ast-sec">
        <Sec ic={<Icon name="sparkle" size={16} />} title={t('assets.render.title')} desc={<span>{t('assets.render.descBefore')}<code>{t('assets.render.descCode')}</code>{t('assets.render.descAfter')}</span>} />
        <div className="ast-toggles">
          <Check label={t('assets.render.random')} on={c.random} onChange={v => { c.random = v; save(); soft(); }} hint={t('assets.render.randomHint')} />
          <Check label={t('assets.render.lazy')} on={c.lazy !== false} onChange={v => { c.lazy = v; save(); soft(); }} hint={t('assets.render.lazyHint')} />
          <Check label={t('assets.render.zoom')} on={c.zoom !== false} onChange={v => { c.zoom = v; save(); soft(); }} hint={t('assets.render.zoomHint')} />
        </div>
        <div className="field"><span className="field-label">{t('assets.render.maxSize')}</span>
          <div className="range"><input type="range" min={120} max={900} step={20} defaultValue={c.maxSize} onChange={e => { c.maxSize = +e.target.value; save(); soft(); }} /><output>{`${c.maxSize}px`}</output></div>
          <small className="hint">{t('assets.render.maxSizeHint')}</small></div>
      </div>
      <div className="ast-sec">
        <Sec ic={<Icon name="image" size={16} />} title={t('assets.render.style')} desc={t('assets.render.styleDesc')} />
        <div className="ast-styles">{STYLES.map(([id, name, desc]) => <button key={id} type="button" className={'ast-style' + (c.style === id ? ' on' : '')} onClick={() => { c.style = id; save(); draw(); }}>
          <span className={'ast-pv' + (id.startsWith('float') ? ' side' + (id === 'float-right' ? ' r' : '') : '')}><span className={`asset-frame as-${id}`} style={asMax('104px')}><img className="asset-img" alt="" src={sample} /></span>{id.startsWith('float') ? <Lines /> : null}</span>
          <b>{t(name)}</b><small>{t(desc)}</small></button>)}</div>
        <div className="ast-live-wrap"><span className="ast-live-tag">{t('assets.preview')}</span>
          <div className="ast-live"><p><Lines /></p><p><span className={'asset-frame as-' + (/^[\w-]+$/.test(c.style || '') ? c.style : 'ink')} style={asMax((Math.round(+c.maxSize) || 400) + 'px')}><img className="asset-img" alt="" src={sample} /></span></p><p><Lines /></p></div></div>
      </div>
    </div>;
  };

  // ── 도구 ──
  const toolsTab = () => <div className="ast-stack">
    <div className="card ast-card">
      <div className="ast-sec">
        <Sec ic={<Icon name="user" size={16} />} title={t('assets.tools.persona')} desc={t('assets.tools.personaDesc')} />
        {persona ? <div className="ast-row"><Avatar o={persona} cls="xs" /><Select value={persona.id} opts={S.personas.map(x => [x.id, x.name] as const)} onChange={async v => { c.ui.persona = v; save(); await As.load([As.ownerOfPersona(v)]); draw(); }} /></div> : null}
      </div>
      {persona ? <Manager owner={As.ownerOfPersona(persona.id)} title={t('assets.ofName', { name: persona.name })} /> : <p className="dim ast-empty">{t('assets.tools.noPersona')}</p>}
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
        <Sec ic={<Icon name="book" size={16} />} title={t('assets.help.title')} desc={t('assets.help.desc')} />
        <details className="ast-details" open><summary>{t('assets.help.basics')}</summary><ol>
          <li>{t('assets.help.step1')}</li>
          <li>{t('assets.help.step2')}</li>
          <li>{t('assets.help.step3Before')}<code>{t('assets.render.descCode')}</code>{t('assets.help.step3After')}</li></ol></details>
        <details className="ast-details"><summary>{t('assets.help.naming')}</summary><ul>
          <li><code>joy.png</code>{t('assets.help.name1')}</li>
          <li><code>joy_1.png</code>, <code>joy-2.png</code>, <code>joy.3.png</code>{t('assets.help.name2')}</li>
          <li>{t('assets.help.name3Before')}<code>{'{{img::joy.png}}'}</code>{t('assets.help.name3After')}</li></ul></details>
        <details className="ast-details"><summary>{t('assets.help.macros')}</summary><div className="ast-macros plain">{MACROS.map(([m, d]) => <div key={m} className="ast-macro"><code>{m}</code><span>{t(d)}</span></div>)}</div></details>
        <details className="ast-details"><summary>{t('assets.help.commands')}</summary><ul>
          <li><code>{t('assets.help.cmdUploadCode')}</code>{t('assets.help.cmdUpload')}</li>
          <li><code>/assets-gallery</code>{t('assets.help.cmdGallery')}</li>
          <li><code>/refresh-img-keywords</code>{t('assets.help.cmdRefresh')}</li></ul></details>
      </div>
    </div>
  </div>;

  const TABS: [string, string, string, () => ReactElement][] = [['prompt', t('assets.tab.prompt'), 'note', promptTab], ['assets', t('assets.title'), 'folder', assetsTab], ['render', t('assets.tab.render'), 'sparkle', renderTab], ['tools', t('assets.tab.tools'), 'gear', toolsTab]];
  return <>
    {status}
    <div className="ast-tabs" role="tablist">{TABS.map(([k, l, ic]) => <button key={k} type="button" role="tab" className={sub === k ? 'on' : undefined} onClick={() => { sub = k; draw(); }}><Icon name={ic} size={16} /><span>{l}</span></button>)}</div>
    <Fragment key={sub + ':' + gen}>{(TABS.find(t => t[0] === sub) || TABS[0])[3]()}</Fragment>
  </>;
}
