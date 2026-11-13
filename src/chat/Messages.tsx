// 메시지 목록: 필요한 만큼만 그리고, 바뀐 메시지 하나만 다시 그린다
import { memo, useEffect, useRef, useState, type MouseEvent, type ReactNode } from 'react';
import { flushSync } from 'react-dom';
import { Avatar, Btn, Icon, IconBtn } from '../kit';
import { menu, openModal, toast } from '../ui';
import { cur, ui, useCh } from './store';
import { DiceCard } from './Dice';
import { CallCard } from '../call/Card';
import { bodyHtml, branch, commitEdit, holdView, redraw, delFrom, delMsg, drawScene, editTranslation, generate, msgClock, removeIllust, showMore, speak, swipe, toggleHidden, translate } from './actions';
import { ux } from '../features/usersettings';
import type { IllustItem, Msg, SceneSpec, Swipe } from './types';
import { tint } from '../lib/tone';
import { tokens } from '../lib/engine';
import { mo } from '../lib/live';
import { motiveLabel } from '../lib/f-schedule';
import { S } from '../lib/core';
import { X } from '../lib/hooks';
import { Illust } from '../lib/illust';
import { Clock } from '../lib/clock';
import { t, getLang, fmtDate } from '../i18n';

const dayFmt = new Intl.DateTimeFormat('ko-KR', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'short' });
const dayOf = (ts: number) => { const d = new Date(ts || 0); return isNaN(+d) ? '' : getLang() === 'ko' ? dayFmt.format(d) : fmtDate(d, { year: 'numeric', month: 'long', day: 'numeric', weekday: 'short' }); };
const bigImage = (src: string) => openModal({ title: '', wide: true, body: <img className="full-img" src={src} /> });

/** 삽화 그리기: 프롬프트를 적거나 이 메시지에서 뽑는다 */
export function illustDialog(m: Msg, preset = '') {
  let ta: HTMLTextAreaElement | null = null, scene: SceneSpec | undefined;
  openModal({
    title: t('chat.illustDlg.title'),
    body: <div className="col"><textarea className="inp" rows={5} defaultValue={preset} ref={el => { ta = el; }} placeholder={t('chat.illustDlg.placeholder')} /><p className="hint">{t('chat.illustDlg.hint')}</p></div>,
    actions: [
      { label: t('chat.illustDlg.fromScene'), ic: 'sparkle', onclick: async () => { if (!ta || !cur.chat) return false; try { ta.value = t('chat.illustDlg.thinking'); const sc = await Illust.analyze(cur.chat, cur.msgs, m); ta.value = String(sc[0]?.prompt || ''); scene = sc[0]; } catch (e) { ta.value = ''; toast(e instanceof Error ? e.message : String(e), 'err'); } return false; } },
      { label: t('chat.illustDlg.draw'), cls: 'primary', ic: 'image', onclick: () => { const p = ta?.value.trim(); if (!p) { toast(t('chat.illustDlg.empty')); return false; } drawScene(m, { ...(scene || {}), prompt: p }); } }],
  });
}

function Illusts({ m, s }: { m: Msg; s: Swipe }) {
  if (!s.illust?.length) return null;
  const big = (it: IllustItem) => openModal({ title: '', wide: true, body: <div className="col"><img className="full-img" src={Illust.data(it.id)} />{it.title && <b>{it.title}</b>}<p className="hint">{[it.camera, it.prompt, ...(it.characters || []).map(x => typeof x === 'string' ? x : `${x.name || ''}: ${[x.outfit, x.action].filter(Boolean).join(', ')}`)].filter(Boolean).join(' · ')}</p></div> });
  return <div className="illusts">{s.illust.map(it => <figure className="illust" key={it.id}>
    <img src={Illust.data(it.id)} alt={t('chat.illust.alt')} loading="lazy" onClick={() => big(it)} />
    <figcaption>
      <IconBtn ic="refresh" title={t('chat.illust.redraw')} cls="tiny" onClick={() => drawScene(m, { title: it.title, camera: it.camera, prompt: it.prompt, negative: it.negative, characters: it.characters })} />
      <IconBtn ic="edit" title={t('chat.illust.editDraw')} cls="tiny" onClick={() => illustDialog(m, it.prompt)} />
      <IconBtn ic="trash" title={t('chat.illust.delete')} cls="tiny" onClick={() => void removeIllust(m, s, it.id)} />
    </figcaption>
  </figure>)}</div>;
}

/** 본문 자리에 뜨는 편집 상자 */
function EditBox({ m, close }: { m: Msg; close: () => void }) {
  const ta = useRef<HTMLTextAreaElement>(null);
  const fit = () => { const el = ta.current; if (!el) return; el.style.height = 'auto'; el.style.height = Math.min(el.scrollHeight + 4, innerHeight * 0.6) + 'px'; };
  useEffect(() => { fit(); ta.current?.focus({ preventScroll: true }); }, []);
  const ok = () => void commitEdit(m, ta.current?.value ?? '');
  return <div className="edit-box">
    <textarea className="inp edit-area" defaultValue={m.swipes[m.sw].text} spellCheck={false} ref={ta} onInput={fit}
      onKeyDown={e => { if (e.key === 'Escape') close(); if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) ok(); }} />
    <div className="row end"><Btn label={t('common.cancel')} cls="ghost" onClick={close} /><Btn label={t('common.save')} cls="primary" ic="check" onClick={ok} /></div>
  </div>;
}

interface MsgProps { m: Msg; idx: number; last: boolean; cont: boolean; still: boolean; picked: boolean }
const MsgItem = memo(function MsgItem({ m, idx, last, cont, still, picked }: MsgProps) {
  useCh('m:' + m.id);
  const [editing, setEditingRaw] = useState(false);
  // 편집 상자로 바뀌어 높이가 달라져도 이 메시지가 화면에서 제자리에 남게
  const setEditing = (v: boolean) => { const back = holdView(m.id); flushSync(() => setEditingRaw(v)); back(); };
  const chat = cur.chat!;
  const s: Swipe = m.swipes[m.sw] || { text: '' };
  const who = m.role === 'user' ? S.persona(chat) : m.role === 'assistant' ? (S.get('chars', m.charId) || { name: m.name }) : null;
  const grouped = chat.charIds.length > 1;
  const castNo = grouped && m.role === 'assistant' ? chat.charIds.indexOf(m.charId) + 1 : 0;
  const toned = grouped && m.role === 'assistant' && !!(who && 'avatar' in who && who.avatar);   // 여럿이 있는 방: 말하는 이마다 제 색
  const cls = ['msg', m.role === 'user' ? 'user' : m.role === 'assistant' ? 'ai' : 'sys', m.hidden && 'hidden-msg', grouped && m.role !== 'system' && 'grouped', cont && 'cont', m.scene && 'in-scene',
    m.role === 'system' && m.curtain && 'curtain-msg', m.role === 'system' && m.curtain?.kind, m.role === 'system' && !m.curtain && m.dice && 'dice-msg', still && 'still', picked && 'picked'].filter(Boolean).join(' ');
  const art = (kids: ReactNode) => <article className={cls} data-id={m.id} ref={el => { if (el && toned) tint(el, S.get('chars', m.charId) ?? null); }}>{kids}</article>;
  const del = <IconBtn ic="trash" title={t('common.delete')} onClick={() => void delMsg(m)} />;

  if (m.role === 'system' && m.curtain) {
    const k = m.curtain, open = k.kind === 'open';
    return art(<div className="curtain"><i>{open ? '☾' : '✦'}</i>
      <div><small>{open ? t('chat.curtain.opened') : t('chat.curtain.closed')}</small><b>{open ? (k.title || t('chat.curtain.untitled')) : (k.summary || t('chat.curtain.back'))}</b>{open && (k.place || k.time) ? <span>{[k.place, k.time].filter(Boolean).join(' · ')}</span> : null}</div>
      <div className="msg-tools">{del}</div></div>);
  }
  if (m.role === 'system' && m.call) return art(<><CallCard m={m} /><div className="msg-tools">{del}</div></>);
  if (m.role === 'system' && m.dice) return art(<><DiceCard m={m} /><div className="msg-tools">{del}</div></>);

  const streaming = cur.paint.has(m.id);
  const body = editing ? <EditBox m={m} close={() => redraw(m)} /> : <div className="msg-body" dangerouslySetInnerHTML={{ __html: cur.paint.get(m.id) ?? bodyHtml(m) }} />;
  if (m.role === 'system') return art(<div className="sys-line">{body}<div className="msg-tools"><IconBtn ic="edit" title={t('chat.msg.edit')} onClick={() => setEditing(true)} />{del}</div></div>);

  const canSwipe = m.role === 'assistant' && (m.swipes.length > 1 || last);
  const more = (e: MouseEvent<HTMLButtonElement>) => menu(e.currentTarget, [
    { label: t('chat.msgMenu.branch'), ic: 'branch', hint: t('chat.msgMenu.branchHint'), onclick: () => void branch(cur.msgs.indexOf(m)) },
    { label: s.showTr ? t('chat.msgMenu.original') : (s.tr ? t('chat.msgMenu.showTr') : t('chat.msgMenu.translate')), ic: 'lang', onclick: () => void translate(m) },
    s.tr && { label: t('chat.msgMenu.retranslate'), ic: 'refresh', onclick: () => void translate(m, { again: true }) },
    s.tr && { label: t('chat.translate.edit'), ic: 'edit', onclick: () => void editTranslation(m) },
    { label: t('chat.illustDlg.title'), ic: 'image', onclick: () => illustDialog(m) },
    { label: t('chat.msgMenu.speak'), ic: 'volume', onclick: () => speak(s.text, m.charId) },
    ...X.actions.map(a => ({ label: a.label, ic: a.icon || 'sparkle', onclick: () => { void a.run(m, cur.chat); } })),
    { label: m.hidden ? t('chat.msgMenu.unhide') : t('chat.msgMenu.hide'), ic: m.hidden ? 'eye' : 'eyeoff', onclick: () => void toggleHidden(m) },
    '-',
    { label: t('chat.msgMenu.delete'), ic: 'trash', danger: true, onclick: () => void delMsg(m) },
    { label: t('chat.msgMenu.deleteFrom'), ic: 'trash', danger: true, onclick: () => void delFrom(m) },
  ]);
  const clock = msgClock(m, s);
  const U = ux(), meta = [U.metaTime && clock, ...(S.settings.showMeta ? [U.metaModel && s.model, U.metaTimer && s.ms ? t('chat.meta.sec', { n: (s.ms / 1000).toFixed(1) }) : '', U.metaTokens && s.text ? t('chat.meta.tokens', { n: tokens(s.text) }) : ''] : [])].filter(Boolean).join(' · ');
  const why = m.why && mo('showWhy') !== false ? motiveLabel(m.why) : '';
  return art(<>
    <Avatar o={who} cls={S.settings.avatarShape === 'tall' ? 'tall' : ''} />
    <div className="msg-main">
      <header className="msg-head">{castNo ? <span className="cast-no">{String(castNo).padStart(2, '0')}</span> : null}<b>{who?.name || m.name || ''}</b><span className="msg-no">{String(idx + 1).padStart(3, '0')}</span><time>{meta}</time>
        {why ? <em className="why" title={t('chat.msg.whyTitle')}>{why}</em> : null}{m.hidden && <em className="badge">{t('chat.msg.hiddenBadge')}</em>}</header>
      {m.images?.length ? <div className="msg-images">{m.images.map((u, i) => <img key={i} src={u} alt={t('chat.msg.attachAlt')} onClick={() => bigImage(u)} />)}</div> : null}
      {s.reasoning && S.settings.format?.reasoning?.show !== false ? <details className="reason" open={!streaming && !!S.settings.format?.reasoning?.autoExpand}><summary><Icon name="sparkle" size={14} />{t('chat.msg.reasoning')}</summary><div>{s.reasoning}</div></details> : null}
      {body}
      {m.reactions?.length ? <div className="reacts">{m.reactions.map((r, i) => <span key={i} title={r.by || ''}>{r.emoji}</span>)}</div> : null}
      <Illusts m={m} s={s} />
      <div className="msg-tools">
        {canSwipe && <div className="swipe"><IconBtn ic="left" title={t('chat.msg.prevSwipe')} onClick={() => void swipe(m, -1)} /><span>{`${m.sw + 1} / ${m.swipes.length}`}</span><IconBtn ic="right" title={last && m.sw === m.swipes.length - 1 ? t('chat.msg.newSwipe') : t('chat.msg.nextSwipe')} onClick={() => void swipe(m, 1)} /></div>}
        {m.role === 'assistant' && last && <><IconBtn ic="refresh" title={t('chat.msg.regen')} onClick={() => void generate('regen')} /><IconBtn ic="play" title={t('chat.msg.continue')} onClick={() => void generate('continue')} /></>}
        <IconBtn ic="edit" title={t('chat.msg.edit')} onClick={() => setEditing(true)} />
        <IconBtn ic="copy" title={t('common.copy')} onClick={() => { void navigator.clipboard.writeText(s.text); toast(t('chat.msg.copied')); }} />
        <IconBtn ic="more" title={t('chat.msg.more')} onClick={more} />
      </div>
    </div>
  </>);
});

export function Messages() {
  useCh('msgs');
  const [picked, setPicked] = useState('');
  const chat = cur.chat!, list = cur.msgs, total = list.length;
  const grouped = chat.charIds.length > 1, clockOn = Clock.mode(chat) !== 'none';
  // 날짜가 바뀌는 자리
  const seps = new Map<number, string>(); let day = '';
  if (clockOn) for (let i = Math.min(cur.from, cur.head); i < total; i++) { const m = list[i]; if (!m.ts) continue; const d = dayOf(Clock.timeOf(chat, m)); if (d !== day) { day = d; seps.set(i, d); } }
  const out: ReactNode[] = [];
  for (let i = Math.max(0, cur.head); i < total; i++) {
    const m = list[i], prev = list[i - 1], sep = seps.get(i);
    if (sep !== undefined) out.push(<div className="daysep" key={`sep:${cur.epoch}:${i}`}><span>{sep}</span></div>);
    const cont = grouped && m.role !== 'system' && !!prev && prev.role === m.role && (prev.charId || '') === (m.charId || '') && !prev.dice && new Date(prev.ts).toDateString() === new Date(m.ts).toDateString();
    out.push(<MsgItem key={`${m.id}:${cur.epoch}:${cur.revs.get(m.id) || 0}`} m={m} idx={i} last={i === total - 1} cont={cont} still={!cur.fresh.has(m.id)} picked={picked === m.id} />);
  }
  // 누른 메시지 하나만 고른다 (좁은 화면 · 터치에서 도구를 여는 방법)
  const pick = (e: MouseEvent<HTMLDivElement>) => {
    const t = e.target as Element;
    if (t.closest('button, a, input, textarea, select, summary, label, img, figure, .msg-tools') || String(getSelection())) return;
    const id = t.closest<HTMLElement>('.msg')?.dataset.id || '';
    setPicked(id && id !== picked ? id : '');
  };
  return <div className="msgs" ref={el => { ui.msgs = el; }} onClick={pick}>
    {cur.from > 0 ? <Btn label={t('chat.msg.showMore', { count: cur.from })} cls="ghost more-btn" onClick={showMore} /> : null}
    {out}
  </div>;
}
