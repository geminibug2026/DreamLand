// 꾸미기: 테마 고르기 · 내 테마 편집 · 가져오기/내보내기 · 글자와 배치 · 사용자 CSS
import { useState } from 'react';
import { Avatar, Btn, IconBtn } from '../kit';
import type { Opt } from '../studio/parts';
import * as libTheme from '../lib/theme';
import * as libFormat from '../lib/format';
import { S } from '../lib/core';
import type { Theme } from '../lib/types';
import * as core from '../lib/core';
import { LForm, PageHead, confirmBox, textModal, toast } from '../studio/parts';
import { t as tr, tn } from '../i18n';

interface LookSettings { customThemes?: Theme[]; bubbles?: boolean }

/** 자주 쓰는 이름 (CSS 참고표) — 설명 글은 언어마다 */
const NAMES = () => tr('themes.userCss.namesText');

export const page = { name: 'themes', Component: Themes };

/** 내 테마 다듬기: 옛 폼 안에 끼우는 배경 이미지 칸까지 한 벌 */
function Editor({ t, live, use, redraw }: { t: Theme; live: () => void; use: (id: string) => void; redraw: () => void }) {
  const T = libTheme, C = core;
  const pick = async () => { const [f] = await C.pickFiles({ accept: 'image/*' }); if (!f) return; t.bgImage = await C.shrinkImage(await C.readDataURL(f), 2200, 'image/jpeg', 0.86); live(); };
  // 폼 사이에 들어가는 배경 이미지 칸
  const bg = <div className="field half"><span className="field-label">{tr('themes.bgImage')}</span><div className="row"><Btn label={tr('themes.pick')} ic="image" onClick={() => void pick()} /><Btn label={tr('themes.clear')} cls="ghost" onClick={() => { t.bgImage = ''; live(); }} /></div></div>;
  const del = async () => {
    if (!(await confirmBox(tr('themes.deleteConfirm', { name: T.themeName(t) }), tr('common.delete'), true))) return;
    S.set({ customThemes: ((S.settings as LookSettings).customThemes || []).filter(x => x.id !== t.id), theme: 'rosemilk' }); T.applyTheme(); redraw();
  };
  return <div className="card"><div className="row"><h3 className="form-sec">{tr('themes.editor.title')}</h3>
    <IconBtn ic="copy" title={tr('common.duplicate')} onClick={() => { const c = T.newCustomTheme(t); saveCustom(c); use(c.id); }} />
    <IconBtn ic="trash" title={tr('themes.editor.delete')} onClick={() => void del()} /></div>
    <LForm obj={t} defs={[{ k: 'name', label: tr('common.name'), half: true }, { k: 'tone', label: tr('themes.tone'), type: 'select', opts: [['light', tr('themes.toneLight')], ['dark', tr('themes.toneDark')]], half: true, live: true }]} onChange={live} />
    <h3 className="form-sec">{tr('themes.colors')}</h3>
    <div className="color-grid">{T.COLOR_FIELDS.map(([k, label]) => <LForm key={k} obj={t.c} defs={[{ k, label: tr(label), type: 'color', live: true }]} onChange={live} />)}</div>
    <h3 className="form-sec">{tr('themes.shape')}</h3>
    <LForm obj={t} defs={[{ k: 'radius', label: tr('themes.radius'), type: 'range', min: 0, max: 30, half: true, live: true }, { k: 'glass', label: tr('themes.glass'), type: 'range', min: 0, max: 0.9, step: 0.05, half: true, live: true },
      { k: 'fx', label: tr('themes.fx'), type: 'select', opts: [['none', tr('common.none')], ['petals', tr('themes.fxPetals')], ['stars', tr('themes.fxStars')]], half: true, live: true },
      { k: 'pattern', label: tr('themes.pattern'), type: 'select', opts: [['stars', tr('themes.patStars')], ['dots', tr('themes.patDots')], ['grid', tr('themes.patGrid')], ['lines', tr('themes.patLines')], ['none', tr('themes.patNone')]], half: true, live: true },
      { el: bg },
      { k: 'bgDim', label: tr('themes.bgDim'), type: 'range', min: 0, max: 0.95, step: 0.05, half: true, live: true }, { k: 'bgBlur', label: tr('themes.bgBlur'), type: 'range', min: 0, max: 30, half: true, live: true },
      { k: 'css', label: tr('themes.css'), type: 'area', rows: 4, ph: '.say > span { border-radius: 8px; }' }]} onChange={live} />
    {t.sourceCss ? <p className="hint">{tr('themes.sourceHint')}<a href="#" onClick={e => { e.preventDefault(); textModal(tr('themes.sourceCss'), 'regex-out', t.sourceCss || ''); }}>{tr('themes.sourceView')}</a></p> : null}
  </div>;
}

function saveCustom(t: Theme) {
  const list = [...((S.settings as LookSettings).customThemes || [])], i = list.findIndex(x => x.id === t.id);
  if (i >= 0) list[i] = t; else list.push(t);
  S.set({ customThemes: list });
}

function Themes() {
  const [epoch, setEpoch] = useState(0), redraw = () => setEpoch(n => n + 1);
  const T = libTheme, { render } = libFormat, C = core;
  const st = S.settings as LookSettings, cur = T.currentTheme(), editable = !cur.builtin && !cur.ext;
  const use = (id: string) => { S.set({ theme: id }); T.applyTheme(); redraw(); };
  const look = () => { S.set({}); T.applyTheme(); };

  const importTheme = async () => {
    const files = await C.pickFiles({ accept: '.json,.css,.txt', multiple: true }); let n = 0, lastId = '';
    for (const f of files) { const t = T.importThemeText(await f.text(), f.name); if (t) { saveCustom(t); lastId = t.id; n++; } }
    if (!files.length) return;
    if (!n) return toast(tr('themes.importBad'), 'err');
    toast(tn('themes.imported', n), 'ok'); use(lastId);
  };
  const who = S.chars[0] || { name: tr('themes.preview.charName') }, me = S.persona();
  const fonts: Opt[] = Object.entries(T.FONTS).map(([k, f]) => [k, T.fontName(k) || f.name] as const);

  return <section className="pagebox"><PageHead eyebrow="decorate" title={tr('themes.title')} />
    <div className="card"><div className="row wrap"><h3 className="form-sec">{tr('themes.section')}</h3>
      <Btn label={tr('themes.import')} ic="import" title={tr('themes.importTitle')} onClick={() => void importTheme()} />
      <Btn label={tr('common.export')} ic="upload" cls="ghost" onClick={() => C.download(`${cur.name}.dreamland-theme.json`, JSON.stringify({ app: 'dreamland-theme', version: 1, theme: { ...cur, builtin: false, ext: undefined } }, null, 2))} /></div>
      <div className="theme-grid">{T.allThemes().map(t => <button key={t.id} className={'theme-card' + (t.id === cur.id ? ' on' : '')} title={T.themeName(t)} onClick={() => use(t.id)}>
        <div className="tc-preview" style={{ background: `linear-gradient(180deg, ${t.c.bg}, ${t.c.bg2 || t.c.bg})` }}><i style={{ background: t.c.sayBg || t.c.surface, boxShadow: '0 1px 4px rgba(0,0,0,.12)' }} /><i style={{ background: t.c.userBg || t.c.accent }} /></div>
        <div className="tc-name" style={{ background: t.c.surface, color: t.c.text }}><span>{T.themeName(t)}</span><small style={{ color: t.c.dim }}>{t.ext ? tr('themes.tagExt') : t.builtin ? '' : tr('themes.tagMine')}</small></div>
      </button>)}</div></div>
    <div className="preview-chat">
      <article className="msg ai"><Avatar o={who} /><div className="msg-main"><header className="msg-head"><b>{who.name}</b></header><div className="msg-body" dangerouslySetInnerHTML={{ __html: render(tr('themes.preview.ai'), { bubbles: st.bubbles }) }} /></div></article>
      <article className="msg user"><Avatar o={me} /><div className="msg-main"><header className="msg-head"><b>{me.name}</b></header><div className="msg-body" dangerouslySetInnerHTML={{ __html: render(tr('themes.preview.user'), { bubbles: st.bubbles }) }} /></div></article>
    </div>
    {!editable
      ? <div className="card"><h3 className="form-sec">{tr('themes.make.title')}</h3><p className="hint">{tr('themes.make.hint', { name: T.themeName(cur) })}</p>
        <div className="row wrap"><Btn label={tr('themes.make.btn')} ic="edit" cls="primary" onClick={() => { const t = T.newCustomTheme(cur); saveCustom(t); use(t.id); }} /></div></div>
      : <Editor key={cur.id + ':' + epoch} t={cur} live={() => { saveCustom(cur); T.applyTheme(); }} use={use} redraw={redraw} />}
    <div className="card" key={'look' + epoch}><LForm obj={st} defs={[{ section: tr('themes.text.section') },
      { k: 'font', label: tr('themes.text.font'), type: 'select', opts: fonts, half: true, live: true }, { k: 'fontCustom', label: tr('themes.text.fontCustom'), ph: tr('themes.text.fontCustomPh'), half: true },
      { k: 'fontSize', label: tr('themes.text.fontSize'), type: 'range', min: 13, max: 22, half: true, live: true }, { k: 'lineHeight', label: tr('themes.text.lineHeight'), type: 'range', min: 1.4, max: 2.3, step: 0.05, half: true, live: true },
      { k: 'chatWidth', label: tr('themes.text.chatWidth'), type: 'range', min: 520, max: 1280, step: 20, half: true, live: true }, { k: 'avatarShape', label: tr('themes.text.avatarShape'), type: 'select', opts: [['round', tr('themes.text.avatarRound')], ['tall', tr('themes.text.avatarTall')]], half: true, live: true },
      { k: 'rpBubbles', label: tr('themes.text.rpBubbles'), type: 'check' }, { k: 'motion', label: tr('themes.text.motion'), type: 'check' }]} onChange={look} /></div>
    <div className="card" key={'css' + epoch}><LForm obj={st} defs={[{ section: tr('themes.userCss.section') }, { k: 'customCss', label: tr('themes.userCss.label'), type: 'area', rows: 6, ph: '.msg-body { letter-spacing: -0.01em; }' }]} onChange={look} />
      <details className="api-doc"><summary>{tr('themes.userCss.names')}</summary><pre>{NAMES()}</pre></details></div>
  </section>;
}
