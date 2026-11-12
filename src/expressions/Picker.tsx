// 표정 고르기 창
import { Btn } from '../kit';
import { B, errMsg, type ChatX, type Msg } from '../addons/legacy';
import { openModal } from '../addons/parts';
import { Sprites, byKeyword, charIdOf, classify, fullName, nameOf, pickSprite, setExpr, universe } from './store';

export async function openPicker(msg: Msg | null | undefined, chat: ChatX) {
  if (msg?.role !== 'assistant') return B.ui.toast('캐릭터의 답변에서만 표정을 바꿀 수 있어요');
  const charId = charIdOf(msg, chat), char = B.S.get('chars', charId);
  await Sprites.load(charId);
  openModal({ title: `${char?.name || msg.name || '캐릭터'}의 표정`, wide: true, spec: 'div.exs-picker' }, close => <Picker msg={msg} chat={chat} charId={charId} charName={char?.name} close={close} />);
}

function Picker({ msg, chat, charId, charName, close }: { msg: Msg; chat: ChatX; charId: string; charName?: string; close: () => void }) {
  const sw = msg.swipes[msg.sw];
  const choose = async (label: string, pickId = '') => { await setExpr(chat, msg, label, pickId); close(); B.ui.toast(label ? `표정: ${nameOf(label)}` : '표정 기록을 지웠어요'); };
  const cur = sw.expr || '', list = Sprites.list(charId), have = Sprites.labels(charId), rest = universe(charId).filter(l => !have.includes(l));
  const showing = cur ? pickSprite(charId, cur, msg.id + ':' + msg.sw, sw.exprPick)?.id : '';   // 지금 이 답변에 보이는 바로 그 그림
  return <>
    <p className="exs-picker-now"><span>지금</span><b>{cur ? fullName(cur) : '기록 없음 (기본 표정)'}</b></p>
    {list.length ? <div className="exs-pick-grid">{list.map(a => <button key={a.id} type="button" className={'exs-pick' + (showing === a.id ? ' on' : '')} title={fullName(a.label)} onClick={() => void choose(a.label, Sprites.of(charId, a.label).length > 1 ? a.id : '')}>
      <span className="exs-thumb"><img src={a.data} alt="" loading="lazy" /></span><span className="exs-pick-cap"><b>{nameOf(a.label)}</b>{nameOf(a.label) !== a.label ? <small>{a.label}</small> : null}</span></button>)}</div>
      : <p className="dim">{`${charName || '이 캐릭터'}에게는 아직 표정 그림이 없어요. 기능 › 표정에서 올려 주세요.`}</p>}
    {rest.length ? <details className="exs-more"><summary>{`그림이 없는 감정 ${rest.length}가지`}</summary><p className="hint">고르면 기록은 남고, 가까운 감정이나 기본 표정의 그림이 보입니다.</p>
      <div className="exs-chips">{rest.map(l => <button key={l} type="button" className={'chip' + (cur === l ? ' on' : '')} title={l} onClick={() => void choose(l)}>{nameOf(l)}</button>)}</div></details> : null}
    <div className="exs-picker-tools">
      <Btn label="키워드로 추정" ic="search" title="호출 없이 답변의 낱말로 어림합니다" onClick={() => { const l = byKeyword(sw.text, charId); if (l) void choose(l); else B.ui.toast('짚이는 감정이 없어요'); }} />
      <Btn label="모델에게 묻기" ic="sparkle" title="보조 연결을 한 번 호출합니다" onClick={async e => {
        const b = e.currentTarget; b.disabled = true;
        try { const cur2 = B.chat.current(), msgs = cur2.chat?.id === chat.id ? cur2.msgs : await B.S.msgs(chat.id); const l = await classify(chat, msgs, msg); if (l) void choose(l); else B.ui.toast('모델의 답에서 감정을 찾지 못했어요', 'err'); }
        catch (err) { B.ui.toast('표정 판정 실패: ' + errMsg(err), 'err'); } finally { b.disabled = false; }
      }} />
      {cur ? <Btn label="기록 지우기" ic="trash" cls="ghost" onClick={() => void choose('')} /> : null}
    </div>
    <small className="hint">"모델에게 묻기"는 추가 호출 1회가 듭니다.</small>
  </>;
}
