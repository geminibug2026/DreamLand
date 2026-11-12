// 메시지 목록: 필요한 만큼만 그리고, 바뀐 메시지 하나만 다시 그린다
import { memo, useEffect, useRef, useState, type MouseEvent, type ReactNode } from 'react';
import { flushSync } from 'react-dom';
import { L } from '../legacy';
import { Avatar, Btn, Icon, IconBtn } from '../kit';
import { menu, openModal, toast } from '../ui';
import { B } from './bridge';
import { cur, ui, useCh } from './store';
import { DiceCard } from './Dice';
import { bodyHtml, branch, commitEdit, holdView, redraw, delFrom, delMsg, drawScene, editTranslation, generate, msgClock, removeIllust, showMore, speak, swipe, toggleHidden, translate } from './actions';
import { ux } from '../features/usersettings';
import type { IllustItem, Msg, SceneSpec, Swipe } from './types';

const dayFmt = new Intl.DateTimeFormat('ko-KR', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'short' });
const dayOf = (t: number) => { const d = new Date(t || 0); return isNaN(+d) ? '' : dayFmt.format(d); };
const bigImage = (src: string) => openModal({ title: '', wide: true, body: <img className="full-img" src={src} /> });

/** 삽화 그리기: 프롬프트를 적거나 이 메시지에서 뽑는다 */
export function illustDialog(m: Msg, preset = '') {
  let ta: HTMLTextAreaElement | null = null, scene: SceneSpec | undefined;
  openModal({
    title: '삽화 그리기',
    body: <div className="col"><textarea className="inp" rows={5} defaultValue={preset} ref={el => { ta = el; }} placeholder={'그릴 장면을 적어 주세요. 비워 두고 "장면에서 뽑기"를 누르면 이 메시지에서 자동으로 만들어요.'} /><p className="hint">인물의 외형은 캐릭터 편집 › 에셋 탭에 적어 둔 내용이 자동으로 붙습니다.</p></div>,
    actions: [
      { label: '장면에서 뽑기', ic: 'sparkle', onclick: async () => { if (!ta || !cur.chat) return false; try { ta.value = '생각 중…'; const sc = await B.Illust.analyze(cur.chat, cur.msgs, m); ta.value = sc[0]?.prompt || ''; scene = sc[0]; } catch (e) { ta.value = ''; toast(e instanceof Error ? e.message : String(e), 'err'); } return false; } },
      { label: '그리기', cls: 'primary', ic: 'image', onclick: () => { const p = ta?.value.trim(); if (!p) { toast('프롬프트가 비어 있어요'); return false; } drawScene(m, { ...(scene || {}), prompt: p }); } }],
  });
}

function Illusts({ m, s }: { m: Msg; s: Swipe }) {
  if (!s.illust?.length) return null;
  const big = (it: IllustItem) => openModal({ title: '', wide: true, body: <div className="col"><img className="full-img" src={B.Illust.data(it.id)} />{it.title && <b>{it.title}</b>}<p className="hint">{[it.camera, it.prompt, ...(it.characters || []).map(x => typeof x === 'string' ? x : `${x.name || ''}: ${[x.outfit, x.action].filter(Boolean).join(', ')}`)].filter(Boolean).join(' · ')}</p></div> });
  return <div className="illusts">{s.illust.map(it => <figure className="illust" key={it.id}>
    <img src={B.Illust.data(it.id)} alt="삽화" loading="lazy" onClick={() => big(it)} />
    <figcaption>
      <IconBtn ic="refresh" title="다시 그리기" cls="tiny" onClick={() => drawScene(m, { title: it.title, camera: it.camera, prompt: it.prompt, negative: it.negative, characters: it.characters })} />
      <IconBtn ic="edit" title="프롬프트 고쳐서 그리기" cls="tiny" onClick={() => illustDialog(m, it.prompt)} />
      <IconBtn ic="trash" title="삽화 지우기" cls="tiny" onClick={() => void removeIllust(m, s, it.id)} />
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
    <div className="row end"><Btn label="취소" cls="ghost" onClick={close} /><Btn label="저장" cls="primary" ic="check" onClick={ok} /></div>
  </div>;
}

interface MsgProps { m: Msg; idx: number; last: boolean; cont: boolean; still: boolean; picked: boolean }
const MsgItem = memo(function MsgItem({ m, idx, last, cont, still, picked }: MsgProps) {
  useCh('m:' + m.id);
  const [editing, setEditingRaw] = useState(false);
  // 편집 상자로 바뀌어 높이가 달라져도 이 메시지가 화면에서 제자리에 남게
  const setEditing = (v: boolean) => { const back = holdView(m.id); flushSync(() => setEditingRaw(v)); back(); };
  const S = B.S, chat = cur.chat!;
  const s: Swipe = m.swipes[m.sw] || { text: '' };
  const who = m.role === 'user' ? S.persona(chat) : m.role === 'assistant' ? (S.get('chars', m.charId) || { name: m.name }) : null;
  const grouped = chat.charIds.length > 1;
  const castNo = grouped && m.role === 'assistant' ? chat.charIds.indexOf(m.charId) + 1 : 0;
  const toned = grouped && m.role === 'assistant' && !!(who && 'avatar' in who && who.avatar);   // 여럿이 있는 방: 말하는 이마다 제 색
  const cls = ['msg', m.role === 'user' ? 'user' : m.role === 'assistant' ? 'ai' : 'sys', m.hidden && 'hidden-msg', grouped && m.role !== 'system' && 'grouped', cont && 'cont', m.scene && 'in-scene',
    m.role === 'system' && m.curtain && 'curtain-msg', m.role === 'system' && m.curtain?.kind, m.role === 'system' && !m.curtain && m.dice && 'dice-msg', still && 'still', picked && 'picked'].filter(Boolean).join(' ');
  const art = (kids: ReactNode) => <article className={cls} data-id={m.id} ref={el => { if (el && toned) L.tone.tint(el, S.get('chars', m.charId) ?? null); }}>{kids}</article>;
  const del = <IconBtn ic="trash" title="삭제" onClick={() => void delMsg(m)} />;

  if (m.role === 'system' && m.curtain) {
    const k = m.curtain, open = k.kind === 'open';
    return art(<div className="curtain"><i>{open ? '☾' : '✦'}</i>
      <div><small>{open ? '장면이 열려요' : '장면이 닫혔어요'}</small><b>{open ? (k.title || '이름 없는 장면') : (k.summary || '다시 메시지로 돌아왔어요')}</b>{open && (k.place || k.time) ? <span>{[k.place, k.time].filter(Boolean).join(' · ')}</span> : null}</div>
      <div className="msg-tools">{del}</div></div>);
  }
  if (m.role === 'system' && m.dice) return art(<><DiceCard m={m} /><div className="msg-tools">{del}</div></>);

  const streaming = cur.paint.has(m.id);
  const body = editing ? <EditBox m={m} close={() => redraw(m)} /> : <div className="msg-body" dangerouslySetInnerHTML={{ __html: cur.paint.get(m.id) ?? bodyHtml(m) }} />;
  if (m.role === 'system') return art(<div className="sys-line">{body}<div className="msg-tools"><IconBtn ic="edit" title="수정" onClick={() => setEditing(true)} />{del}</div></div>);

  const canSwipe = m.role === 'assistant' && (m.swipes.length > 1 || last);
  const more = (e: MouseEvent<HTMLButtonElement>) => menu(e.currentTarget, [
    { label: '여기서 분기', ic: 'branch', hint: '새 대화로', onclick: () => void branch(cur.msgs.indexOf(m)) },
    { label: s.showTr ? '원문 보기' : (s.tr ? '번역 보기' : '번역'), ic: 'lang', onclick: () => void translate(m) },
    s.tr && { label: '다시 번역', ic: 'refresh', onclick: () => void translate(m, { again: true }) },
    s.tr && { label: '번역 고치기', ic: 'edit', onclick: () => void editTranslation(m) },
    { label: '삽화 그리기', ic: 'image', onclick: () => illustDialog(m) },
    { label: '소리 내어 읽기', ic: 'volume', onclick: () => speak(s.text) },
    ...B.X.actions.map(a => ({ label: a.label, ic: a.icon || 'sparkle', onclick: () => { void a.run(m, cur.chat); } })),
    { label: m.hidden ? '프롬프트에 다시 포함' : '프롬프트에서 숨기기', ic: m.hidden ? 'eye' : 'eyeoff', onclick: () => void toggleHidden(m) },
    '-',
    { label: '이 메시지 삭제', ic: 'trash', danger: true, onclick: () => void delMsg(m) },
    { label: '여기부터 아래 모두 삭제', ic: 'trash', danger: true, onclick: () => void delFrom(m) },
  ]);
  const clock = msgClock(m, s);
  const U = ux(), meta = [U.metaTime && clock, ...(S.settings.showMeta ? [U.metaModel && s.model, U.metaTimer && s.ms ? (s.ms / 1000).toFixed(1) + '초' : '', U.metaTokens && s.text ? `≈${B.engine.tokens(s.text)}토큰` : ''] : [])].filter(Boolean).join(' · ');
  const why = m.why && B.live.mo('showWhy') !== false ? B.sched.motiveLabel(m.why) : '';
  return art(<>
    <Avatar o={who} cls={S.settings.avatarShape === 'tall' ? 'tall' : ''} />
    <div className="msg-main">
      <header className="msg-head">{castNo ? <span className="cast-no">{String(castNo).padStart(2, '0')}</span> : null}<b>{who?.name || m.name || ''}</b><span className="msg-no">{String(idx + 1).padStart(3, '0')}</span><time>{meta}</time>
        {why ? <em className="why" title="캐릭터가 먼저 보낸 연락이에요">{why}</em> : null}{m.hidden && <em className="badge">숨김</em>}</header>
      {m.images?.length ? <div className="msg-images">{m.images.map((u, i) => <img key={i} src={u} alt="첨부 이미지" onClick={() => bigImage(u)} />)}</div> : null}
      {s.reasoning ? <details className="reason" open={!streaming && !!S.settings.format?.reasoning?.autoExpand}><summary><Icon name="sparkle" size={14} />생각 과정</summary><div>{s.reasoning}</div></details> : null}
      {body}
      {m.reactions?.length ? <div className="reacts">{m.reactions.map((r, i) => <span key={i} title={r.by || ''}>{r.emoji}</span>)}</div> : null}
      <Illusts m={m} s={s} />
      <div className="msg-tools">
        {canSwipe && <div className="swipe"><IconBtn ic="left" title="이전 답변" onClick={() => void swipe(m, -1)} /><span>{`${m.sw + 1} / ${m.swipes.length}`}</span><IconBtn ic="right" title={last && m.sw === m.swipes.length - 1 ? '새 답변 생성' : '다음 답변'} onClick={() => void swipe(m, 1)} /></div>}
        {m.role === 'assistant' && last && <><IconBtn ic="refresh" title="다시 생성" onClick={() => void generate('regen')} /><IconBtn ic="play" title="이어 쓰기" onClick={() => void generate('continue')} /></>}
        <IconBtn ic="edit" title="수정" onClick={() => setEditing(true)} />
        <IconBtn ic="copy" title="복사" onClick={() => { void navigator.clipboard.writeText(s.text); toast('복사했어요'); }} />
        <IconBtn ic="more" title="더 보기" onClick={more} />
      </div>
    </div>
  </>);
});

export function Messages() {
  useCh('msgs');
  const [picked, setPicked] = useState('');
  const chat = cur.chat!, list = cur.msgs, total = list.length, Clock = B.Clock;
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
    {cur.from > 0 ? <Btn label={`이전 메시지 ${cur.from}개 더 보기`} cls="ghost more-btn" onClick={showMore} /> : null}
    {out}
  </div>;
}
