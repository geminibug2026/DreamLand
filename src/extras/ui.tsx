// 곁들임의 설정 화면(기능 탭) · 장면 패널 칸 · 캐릭터 편집기의 꾸밈 칸 · 실려 온 꾸밈을 처음 한 번 묻는 창
import { useState } from 'react';
import { Btn } from '../kit';
import { openModal } from '../ui';
import { Check, useRedraw } from '../addons/parts';
import { S } from '../lib/core';
import type { Char, Chat } from '../lib/types';
import { route } from '../lib/router';
import { t } from '../i18n';
import { cfg, saveCfg } from './cfg';
import { AI_PATTERNS, buzz, canBuzz } from './buzz';
import { CSS_FIELD, MAX_CSS, allow, applyCharCss, asked, cssOn, rawCss, scopeCss, withCss } from './charcss';
import { StickerManager, openStickerManager } from './StickerPicker';
import { bgAuto, openBgShelf } from './bgshelf';
import { openTrash } from './trash';
import { openInsights } from './insights';
import { openExport } from './exporter';

type CssChat = Chat & { charCss?: boolean; bgAuto?: boolean };

// ════════ 기능 탭 ════════
export function ExtrasStudio() {
  const redraw = useRedraw(), c = cfg(), set = (fn: () => void) => { fn(); saveCfg(); redraw(); };
  const seg = <T extends string>(value: T, opts: [T, string, string][], on: (v: T) => void, label: string) => <div className="xt-seg" role="radiogroup" aria-label={label}>{opts.map(([v, l, d]) => <button key={v} type="button" role="radio" aria-checked={value === v} className={'xt-seg-b fx-tap' + (value === v ? ' on' : '')} onClick={() => on(v)}><b>{l}</b><small>{d}</small></button>)}</div>;
  return <div className="xt-studio">
    <section className="card xt-card"><span className="fx-lbl kr ink fx-head">{t('extras.set.stk')}</span>
      <p className="hint">{t('extras.set.stkHint')}</p>
      {seg(c.stk.ai, [['pick', t('extras.set.aiPick'), t('extras.set.aiPickD')], ['mood', t('extras.set.aiMood'), t('extras.set.aiMoodD')], ['off', t('extras.set.aiOff'), t('extras.set.aiOffD')]], v => set(() => { c.stk.ai = v; }), t('extras.set.aiMode'))}
      <Check label={t('extras.set.stkBtn')} hint={t('extras.set.stkBtnHint')} on={c.stk.btn} onChange={v => set(() => { c.stk.btn = v; })} />
      <Check label={t('extras.set.stkRp')} hint={t('extras.set.stkRpHint')} on={c.stk.rp} onChange={v => set(() => { c.stk.rp = v; })} />
      <Check label={t('extras.set.vision')} hint={t('extras.set.visionHint')} on={c.stk.vision} onChange={v => set(() => { c.stk.vision = v; })} />
      <StickerManager />
    </section>
    <section className="card xt-card"><span className="fx-lbl kr ink fx-head">{t('extras.set.react')}</span>
      <p className="hint">{t('extras.set.reactHint')}</p>
      <Check label={t('extras.set.reactTalk')} on={c.react.talk} onChange={v => set(() => { c.react.talk = v; })} />
      <Check label={t('extras.set.reactRp')} hint={t('extras.set.reactRpHint')} on={c.react.rp} onChange={v => set(() => { c.react.rp = v; })} />
    </section>
    {canBuzz() ? <section className="card xt-card"><span className="fx-lbl kr ink fx-head">{t('extras.set.buzz')}</span>
      <p className="hint">{t('extras.set.buzzHint')}</p>
      <Check label={t('extras.set.buzzOn')} on={c.buzz.on} onChange={v => set(() => { c.buzz.on = v; if (v) buzz('double'); })} />
      {c.buzz.on ? <>
        <label className="field"><span className="field-label">{t('extras.set.buzzLevel')}<em className="fx-num xt-lv">{Math.round(c.buzz.level * 100)}%</em></span><input type="range" className="range" min={0.5} max={1.6} step={0.1} value={c.buzz.level} onChange={e => set(() => { c.buzz.level = +e.target.value; })} onPointerUp={() => buzz('double')} /></label>
        <Check label={t('extras.set.buzzReply')} on={c.buzz.reply} onChange={v => set(() => { c.buzz.reply = v; })} />
        <Check label={t('extras.set.buzzAi')} hint={t('extras.set.buzzAiHint')} on={c.buzz.ai} onChange={v => set(() => { c.buzz.ai = v; })} />
        <Check label={t('extras.set.buzzGame')} on={c.buzz.game} onChange={v => set(() => { c.buzz.game = v; })} />
        <Check label={t('extras.set.buzzCall')} on={c.buzz.call} onChange={v => set(() => { c.buzz.call = v; })} />
        <div className="row wrap">{AI_PATTERNS.map(p => <button key={p} type="button" className="chip" onClick={() => buzz(p)}>{t('extras.set.buzzTry', { name: p })}</button>)}</div>
      </> : null}
    </section> : null}
    <section className="card xt-card"><span className="fx-lbl kr ink fx-head">{t('extras.set.trash')}</span>
      <label className="field inline"><span className="field-label">{t('extras.set.trashDays')}</span><input className="inp" type="number" min={1} max={365} value={c.trash.days} onChange={e => set(() => { c.trash.days = Math.max(1, Math.min(365, Math.round(+e.target.value || 30))); })} /></label>
      <p className="hint">{t('extras.set.trashHint')}</p>
    </section>
  </div>;
}

// ════════ 장면 패널의 칸 ════════
export function ExtrasPanel({ chat }: { chat: Chat }) {
  const redraw = useRedraw(), c = chat as CssChat, withC = withCss(chat), save = () => void S.save('chats', chat, true);
  return <div className="col xt-panel">
    {withC.length ? <><Check label={t('extras.css.on')} hint={t('extras.css.onHint', { names: withC.map(x => x.name).join(', ') })} on={cssOn(chat)} onChange={v => { c.charCss = v; if (v) withC.forEach(x => allow(x, true)); save(); applyCharCss(chat); redraw(); }} /></> : null}
    <Check label={t('extras.bg.auto')} hint={t('extras.bg.autoHint')} on={bgAuto(chat)} onChange={v => { c.bgAuto = v; save(); redraw(); }} />
    <div className="row wrap">
      <Btn label={t('extras.ins.open')} ic="footprint" cls="ghost" onClick={() => void openInsights(chat)} />
      <Btn label={t('extras.trash.open')} ic="trash" cls="ghost" onClick={() => void openTrash(chat)} />
      <Btn label={t('extras.export.open')} ic="import" cls="ghost" onClick={() => void openExport(chat)} />
      <Btn label={t('extras.bg.open')} ic="shelf" cls="ghost" onClick={() => openBgShelf(chat)} />
      <Btn label={t('extras.stk.manage')} ic="sticker" cls="ghost" onClick={openStickerManager} />
    </div>
  </div>;
}

// ════════ 캐릭터 편집기의 꾸밈 칸 ════════
export function CharCssField({ c, save }: { c: Char; save: () => void }) {
  const [text, setText] = useState(typeof c.ext?.[CSS_FIELD] === 'string' ? c.ext[CSS_FIELD] as string : ''), [peek, setPeek] = useState(false);
  const fromNotes = rawCss({ ...c, ext: {} } as Char).trim();
  return <div className="field xt-cssf"><span className="field-label">{t('extras.css.field')}<em className="tok fx-num">{text.length ? `${text.length.toLocaleString()} / ${MAX_CSS.toLocaleString()}` : ''}</em></span>
    <textarea className="inp af-json" rows={6} spellCheck={false} maxLength={MAX_CSS} placeholder={'.msg.ai .msg-body { font-family: serif; }\n.msg.ai .say { --say-bg: #f4ecd8; }'} value={text}
      onChange={e => { const v = e.target.value; setText(v); (c.ext ||= {}); if (v.trim()) c.ext[CSS_FIELD] = v; else delete c.ext[CSS_FIELD]; allow(c, true); save(); }} />
    <small className="hint">{t('extras.css.fieldHint')}{fromNotes ? ' ' + t('extras.css.notesToo') : ''}</small>
    {text.trim() || fromNotes ? <button type="button" className="xt-link" onClick={() => setPeek(!peek)}>{peek ? t('extras.css.hidePeek') : t('extras.css.peek')}</button> : null}
    {peek ? <pre className="xt-css-pre">{scopeCss(rawCss(c)) || '—'}</pre> : null}
  </div>;
}

// ════════ 실려 온 꾸밈: 처음 한 번 묻는다 ════════
export function askCharCss(chat?: Chat | null) {
  if (!chat || route.page !== 'chat' || document.querySelector('.xt-css-ask, .rx-ask')) return;
  const ch = withCss(chat).find(x => !asked(x)); if (!ch) return;
  let answered = false; const c = chat as CssChat;
  const m = openModal({ title: t('extras.css.askTitle', { name: ch.name }),
    body: <div className="col"><p>{t('extras.css.askBody')}</p><pre className="xt-css-pre">{scopeCss(rawCss(ch)).slice(0, 900) || '—'}</pre><small className="hint">{t('extras.css.askLater')}</small></div>,
    onClose: () => { if (!answered) allow(ch, false); setTimeout(() => askCharCss(chat), 250); },
    actions: [{ label: t('extras.css.askNo'), onclick: () => { answered = true; allow(ch, false); } }, { label: t('extras.css.askYes'), cls: 'primary', onclick: () => { answered = true; allow(ch, true); c.charCss = true; void S.save('chats', chat, true); applyCharCss(chat); } }] });
  m.el.classList.add('xt-css-ask');
}
