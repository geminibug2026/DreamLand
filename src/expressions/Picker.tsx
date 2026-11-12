// 표정 고르기 창
import { Btn } from '../kit';
import type { ChatX, Msg } from '../addons/types';
import { errMsg } from '../addons/parts';
import { openModal } from '../addons/parts';
import { Sprites, byKeyword, charIdOf, classify, fullName, nameOf, pickSprite, setExpr, universe } from './store';
import { toast } from '../ui';
import { S } from '../lib/core';
import { chatApi } from '../chat/actions';
import { t, tn } from '../i18n';

export async function openPicker(msg: Msg | null | undefined, chat: ChatX) {
  if (msg?.role !== 'assistant') return toast(t('expressions.picker.onlyReplies'));
  const charId = charIdOf(msg, chat), char = S.get('chars', charId);
  await Sprites.load(charId);
  openModal({ title: t('expressions.picker.title', { name: char?.name || msg.name || t('expressions.picker.character') }), wide: true, spec: 'div.exs-picker' }, close => <Picker msg={msg} chat={chat} charId={charId} charName={char?.name} close={close} />);
}

function Picker({ msg, chat, charId, charName, close }: { msg: Msg; chat: ChatX; charId: string; charName?: string; close: () => void }) {
  const sw = msg.swipes[msg.sw];
  const choose = async (label: string, pickId = '') => { await setExpr(chat, msg, label, pickId); close(); toast(label ? t('expressions.toast.set', { name: nameOf(label) }) : t('expressions.toast.cleared')); };
  const cur = sw.expr || '', list = Sprites.list(charId), have = Sprites.labels(charId), rest = universe(charId).filter(l => !have.includes(l));
  const showing = cur ? pickSprite(charId, cur, msg.id + ':' + msg.sw, sw.exprPick)?.id : '';   // 지금 이 답변에 보이는 바로 그 그림
  return <>
    <p className="exs-picker-now"><span>{t('expressions.picker.now')}</span><b>{cur ? fullName(cur) : t('expressions.picker.noRecord')}</b></p>
    {list.length ? <div className="exs-pick-grid">{list.map(a => <button key={a.id} type="button" className={'exs-pick' + (showing === a.id ? ' on' : '')} title={fullName(a.label)} onClick={() => void choose(a.label, Sprites.of(charId, a.label).length > 1 ? a.id : '')}>
      <span className="exs-thumb"><img src={a.data} alt="" loading="lazy" /></span><span className="exs-pick-cap"><b>{nameOf(a.label)}</b>{nameOf(a.label) !== a.label ? <small>{a.label}</small> : null}</span></button>)}</div>
      : <p className="dim">{t('expressions.picker.empty', { name: charName || t('expressions.picker.thisChar') })}</p>}
    {rest.length ? <details className="exs-more"><summary>{tn('expressions.picker.noImage', rest.length)}</summary><p className="hint">{t('expressions.picker.noImageHint')}</p>
      <div className="exs-chips">{rest.map(l => <button key={l} type="button" className={'chip' + (cur === l ? ' on' : '')} title={l} onClick={() => void choose(l)}>{nameOf(l)}</button>)}</div></details> : null}
    <div className="exs-picker-tools">
      <Btn label={t('expressions.byKeyword')} ic="search" title={t('expressions.picker.byKeywordTip')} onClick={() => { const l = byKeyword(sw.text, charId); if (l) void choose(l); else toast(t('expressions.noGuess')); }} />
      <Btn label={t('expressions.askModel')} ic="sparkle" title={t('expressions.picker.askModelTip')} onClick={async e => {
        const b = e.currentTarget; b.disabled = true;
        try { const cur2 = chatApi.current(), msgs = cur2.chat?.id === chat.id ? cur2.msgs : await S.msgs(chat.id); const l = await classify(chat, msgs, msg); if (l) void choose(l); else toast(t('expressions.picker.notFound'), 'err'); }
        catch (err) { toast(t('expressions.detectFailed', { error: errMsg(err) }), 'err'); } finally { b.disabled = false; }
      }} />
      {cur ? <Btn label={t('expressions.picker.clear')} ic="trash" cls="ghost" onClick={() => void choose('')} /> : null}
    </div>
    <small className="hint">{t('expressions.picker.costNote')}</small>
  </>;
}
