// 흐름: 창 · 장면 패널 · 설정 화면의 조각 (옛 js/f-flow.js 의 화면, 아직 켜지 않은 기능)
import { useRef, useState } from 'react';
import { Btn, Icon, IconBtn } from '../kit';
import { Form, type FormDefs } from '../ui';
import { B, type ChatX, type Msg } from '../addons/legacy';
import { Check, openModal, useRedraw } from '../addons/parts';
import {
  A, DIRECT_HINT, REGEN_DEFAULT, TPL, addCheckpoint, adv, applyProfile, autoStat, branchFromCheckpoint, charsOf, checkpointMenu, copy, cps, cur, decorate, describe, directOn, findProfile, matches,
  posOf, profiles, regenCfg, regenWith, removeCheckpoint, rewindTo, saveChat, setDirect, showMessage, snapshot, type Profile,
} from './logic';

const fail = (e: unknown) => B.ui.toast(e instanceof Error ? e.message : String(e), 'err');

/** 자동 이어쓰기 · 자동 다시 생성 설정 (div.col.flow-auto) */
function AutoForm({ compact = false }: { compact?: boolean }) {
  const a = A(), sv = () => B.S.set({ auto: a });
  const defs: FormDefs = [
    !compact && { section: '자동 이어쓰기' },
    { k: 'cont.on', label: '답변이 목표 길이보다 짧으면 이어 쓰게 하기', type: 'check', hint: '이어쓰기 한 번마다 모델을 한 번 더 부릅니다. 프롬프트 전체를 다시 보내므로 입력 토큰도 그만큼 듭니다.' },
    { k: 'cont.target', label: '목표 길이 (토큰 어림)', type: 'num', min: 0, half: true }, { k: 'cont.max', label: '답변 하나에 최대 몇 번', type: 'num', min: 1, max: 10, half: true },
    !compact && { k: 'cont.talk', label: '대화 모드(메신저)에서도 이어 쓰기', type: 'check', hint: '대화 모드는 짧게 주고받는 것이 기본이라 꺼 두는 편이 자연스럽습니다. 장면 중에는 이 설정과 상관없이 이어 씁니다.' },
    !compact && { section: '자동 다시 생성' },
    { k: 'swipe.on', label: '너무 짧거나 금칙어가 든 답변은 다시 생성하기', type: 'check', hint: '다시 생성 한 번마다 모델을 한 번 더 부릅니다. 버려진 답변은 답변 넘기기로 다시 볼 수 있어요.' },
    { k: 'swipe.minLen', label: '최소 글자 수', type: 'num', min: 0, half: true, hint: '0 이면 길이는 보지 않음' }, { k: 'swipe.max', label: '답변 하나에 최대 몇 번', type: 'num', min: 1, max: 10, half: true },
    { k: 'swipe.words', label: '금칙어', type: compact ? 'tags' : 'lines', ph: compact ? '쉼표로 구분' : '한 줄에 하나씩 (대소문자 구분 없음)', half: !compact }, !compact && { k: 'swipe.threshold', label: '금칙어가 몇 가지 이상 나오면', type: 'num', min: 1, half: true },
  ];
  return <div className="col flow-auto"><Form obj={a} defs={defs} onChange={sv} /></div>;
}

/** 다시 생성할 이유를 묻는 창 */
export function askRegen() {
  const { chat, msgs, busy } = cur(); if (!chat || busy) return; if (msgs[msgs.length - 1]?.role !== 'assistant') return B.ui.toast('다시 생성할 답변이 없어요');
  const val = { text: '' }, recent = regenCfg().recent || [];
  function Body({ close }: { close: () => void }) {
    const inp = useRef<HTMLInputElement>(null);
    return <><input className="inp" ref={inp} placeholder="예: 더 짧게, 대사보다 행동 위주로" spellCheck={false} onChange={e => { val.text = e.target.value; }}
      onKeyDown={e => { if (e.key === 'Enter' && !e.nativeEvent.isComposing) { close(); void regenWith(e.currentTarget.value); } }} />
      {recent.length ? <div className="flow-recent">{recent.map(r => <button key={r} type="button" className="chip" title={r} onClick={() => { const i = inp.current; if (i) { i.value = r; val.text = r; i.focus(); } }}>{r.length > 28 ? r.slice(0, 28) + '…' : r}</button>)}</div> : null}
      <small className="hint">적은 이유는 이번 다시 생성에만 프롬프트 끝에 들어가고, 기록에는 남지 않습니다. 추가 호출은 없어요 (다시 생성 한 번).</small></>;
  }
  openModal({ title: '어떻게 다시 쓸까요?', spec: 'div.col', actions: [{ label: '이유 없이 다시 생성', onclick: () => { void regenWith(''); } }, { label: '반영해서 다시 생성', cls: 'primary', ic: 'refresh', onclick: () => { void regenWith(val.text); } }] }, close => <Body close={close} />);
}

/** 연출 지시 설정 */
function DirectForm() {
  const D = B.S.settings.direct as object;
  return <Form obj={D} onChange={() => B.S.set({ direct: D })} defs={[
    { k: 'prompt', label: '지시를 전달하는 글', type: 'area', rows: 5, ph: DIRECT_HINT, hint: '{{direction}} 자리에 적은 지시가 들어갑니다. 비워 두면 기본 글을 씁니다. {{char}} {{user}} 도 쓸 수 있어요.' },
    { k: 'past', label: '지난 지시는', type: 'select', opts: [['note', '짧은 꼬리표로 기록에 남기기'], ['drop', '프롬프트에서 빼기']], half: true }, { k: 'pastFormat', label: '꼬리표 모양', half: true, ph: '[Author direction: {{direction}}]' },
  ]} />;
}

/** 장면 패널: 체크포인트 (div.col.cp-panel 안) */
export function CheckpointPanel({ chat, msgs }: { chat: ChatX; msgs: Msg[] }) {
  const draw = useRedraw(), S = B.S, toast = B.ui.toast, room = (c: ChatX) => B.chat.roomName(c);
  const list = [...cps(chat)].map(c => ({ c, i: posOf(c, msgs) })).sort((a, b) => (a.i < 0 ? 1e9 : a.i) - (b.i < 0 ? 1e9 : b.i));
  const kids = S.chats.filter(x => x.parent?.id === chat.id).sort((a, b) => (a.parent?.at || 0) - (b.parent?.at || 0)), parent = chat.parent && S.get('chats', chat.parent.id);
  return <>
    <Btn label="지금 지점에 체크포인트" ic="star" cls="ghost" onClick={async () => { if (!msgs.length) return toast('아직 메시지가 없어요'); const name = await B.ui.promptBox('체크포인트 이름', `체크포인트 ${cps(chat).length + 1}`); if (name === null) return; await addCheckpoint(msgs[msgs.length - 1], name.trim()); draw(); }} />
    {list.length ? <div className="cp-list">{list.map(({ c, i }) => <div key={c.id} className={'cp-row' + (i < 0 ? ' gone' : '')}>
      <button className="cp-main" title="그 지점 보기" onClick={() => i >= 0 ? void showMessage(c.msgId) : toast('그 지점의 메시지가 지워졌어요')}><i className="cp-dot" /><div className="cp-text"><b>{c.name}</b><small>{i >= 0 ? `${String(i + 1).padStart(3, '0')}번째 · ${msgs.length - 1 - i ? `뒤로 ${msgs.length - 1 - i}개` : '지금 지점'} · ${B.core.fmtTime(c.ts)}` : '메시지가 지워졌어요'}</small></div></button>
      <IconBtn ic="branch" title="이 지점에서 새 방 열기" cls="tiny" onClick={() => { branchFromCheckpoint(c).catch(fail); }} />
      <IconBtn ic="more" title="더 보기" cls="tiny" onClick={e => B.ui.menu(e.currentTarget, [
        { label: '이름 바꾸기', ic: 'edit', onclick: async () => { const v = await B.ui.promptBox('체크포인트 이름', c.name); if (v === null || !v.trim()) return; c.name = v.trim(); await saveChat(chat); decorate(); draw(); } },
        i >= 0 && i < msgs.length - 1 ? { label: '이 방을 여기로 되돌리기', ic: 'refresh', hint: '뒤쪽은 따로 보관', onclick: () => { rewindTo(c).catch(fail); } } : null,
        '-', { label: '체크포인트 지우기', ic: 'trash', danger: true, onclick: async () => { await removeCheckpoint(c); draw(); } }])} />
    </div>)}</div> : <p className="dim">이름 붙여 둔 지점이 없어요. 메시지의 ⋯ 메뉴에서도 남길 수 있습니다.</p>}
    {parent || kids.length ? <div className="cp-rooms"><small className="hint">이어진 방</small>
      {parent ? <button className="cp-room" onClick={() => B.ui.go('chat', parent.id)}><Icon name="left" size={14} /><span>{room(parent)}</span><small>{`${chat.parent?.at}번째에서 갈라져 나옴`}</small></button> : null}
      {kids.map(k => <button key={k.id} className="cp-room" onClick={() => B.ui.go('chat', k.id)}><Icon name="branch" size={14} /><span>{room(k)}</span><small>{`${k.parent?.at}번째에서 · ${k.count || 0}개`}</small></button>)}</div> : null}
  </>;
}
/** 메시지 ⋯ 메뉴 › 체크포인트 남기기 · 고치기 */
export async function checkpointAction(msg: Msg, chat: ChatX) {
  const cp = cps(chat).find(c => c.msgId === msg.id);
  const name = await B.ui.promptBox(cp ? '체크포인트 이름 (비우면 지움)' : '체크포인트 이름', cp ? cp.name : `체크포인트 ${cps(chat).length + 1}`); if (name === null) return;
  if (cp && !name.trim()) { await removeCheckpoint(cp); return B.ui.toast('체크포인트를 지웠어요'); }
  await addCheckpoint(msg, name.trim()); B.ui.toast('체크포인트를 남겼어요', 'ok');
}
export { checkpointMenu };

// ── 연결 프로필 ──
function ProfileFields({ p, sv }: { p: Profile; sv: () => void }) {
  const S = B.S, { KINDS, tplList } = adv(), none: [string, string][] = [['', '바꾸지 않음']];
  return <Form obj={p} defs={[
    { k: 'name', label: '이름' },
    { k: 'connId', label: 'API 연결', type: 'select', opts: [...none, ...S.conns.map(c => [c.id, c.name] as [string, string])], half: true }, { k: 'model', label: '모델 (비우면 연결에 적힌 그대로)', half: true, ph: '모델 ID' },
    { k: 'presetId', label: '프리셋', type: 'select', opts: [...none, ...S.presets.map(x => [x.id, x.name] as [string, string])], half: true },
    { k: 'instructOn', label: '인스트럭트 모드', type: 'select', opts: [['', '바꾸지 않음'], ['true', '켬'], ['false', '끔']], half: true },
    ...TPL().map(k => ({ k: 'tpl.' + k, label: KINDS[k], type: 'select', opts: [...none, ...tplList(k).map(t => [t.name, t.name] as [string, string])], half: true })),
  ]} onChange={() => { p.instructOn = p.instructOn === 'true' || p.instructOn === true ? true : p.instructOn === 'false' || p.instructOn === false ? false : null; sv(); }} />;
}
/** 설정 화면: 연결 프로필 (div.col.flow-pane 안) */
export function ProfilesPane() {
  const draw = useRedraw(), S = B.S, list = profiles();
  const [open] = useState(() => new Set<string>()), [sv] = useState(() => B.core.debounce(() => S.set({ profiles: profiles() }), 250));
  const keep = () => { S.set({ profiles: list }); draw(); };
  return <>
    <div className="card"><h3 className="form-sec">연결 프로필</h3>
      <p className="hint">API 연결 · 모델 · 프리셋 · 고급 포맷팅 템플릿(컨텍스트 · 인스트럭트 · 시스템 프롬프트 · 추론 서식)을 한 묶음으로 저장해 두고 한 번에 바꿉니다. 대화방이나 캐릭터에 묶어 두면 그 대화를 열 때 저절로 바뀝니다. 캐릭터 편집에서 연결 · 프리셋을 따로 지정해 둔 캐릭터는 그 지정이 먼저입니다.</p>
      <div className="row wrap"><Btn label="지금 설정을 프로필로 저장" ic="plus" cls="primary" onClick={async () => { const name = await B.ui.promptBox('프로필 이름', `${S.conn()?.name || '연결 없음'} · ${S.preset()?.name || ''}`); if (name === null) return; const p = snapshot(name.trim()); list.push(p); open.add(p.id); keep(); }} />
        <small className="hint">{`지금: ${describe(snapshot(''))}`}</small></div></div>
    {list.map((p, i) => {
      const on = matches(p), isOpen = open.has(p.id);
      return <div key={p.id} className={'block flow-prof' + (isOpen ? ' open' : '')}>
        <div className="block-head" onClick={e => { if ((e.target as Element).closest('button')) return; if (isOpen) open.delete(p.id); else open.add(p.id); draw(); }}>
          <Icon name="plug" size={15} /><div className="flow-prof-text"><b>{p.name}</b><small>{describe(p)}</small></div>{on ? <em className="badge on">적용 중</em> : null}
          <Btn label="적용" cls="ghost" ic="check" onClick={async () => { await applyProfile(p); draw(); }} />
          <IconBtn ic="more" title="더 보기" cls="tiny" onClick={e => B.ui.menu(e.currentTarget, [
            { label: '지금 설정으로 덮어쓰기', ic: 'refresh', onclick: () => { Object.assign(p, { ...snapshot(p.name), id: p.id }); keep(); B.ui.toast('지금 설정을 담았어요', 'ok'); } },
            { label: '복제', ic: 'copy', onclick: () => { list.splice(i + 1, 0, { ...copy(p), id: B.core.uid(), name: p.name + ' (사본)' }); keep(); } },
            '-', { label: '프로필 삭제', ic: 'trash', danger: true, onclick: async () => { if (!(await B.ui.confirmBox(`"${p.name}" 프로필을 삭제할까요?`, '삭제', true))) return; list.splice(list.indexOf(p), 1); keep(); } }])} /></div>
        {isOpen ? <div className="block-body"><ProfileFields p={p} sv={() => { sv(); draw(); }} /></div> : null}
      </div>;
    })}
    {!list.length ? <p className="dim pad">저장한 프로필이 아직 없어요.</p> : null}
  </>;
}
/** 장면 패널: 연결 프로필 (div.col.flow-panel 안) */
export function ProfilePanel({ chat }: { chat: ChatX }) {
  const draw = useRedraw(), S = B.S, list = profiles(), ch = charsOf(chat)[0], now_ = list.find(matches);
  const pick = (label: string, value: string | undefined, onchange: (v: string) => Promise<void>, first: string) => <label className="field"><span className="field-label">{label}</span>
    <select className="inp" value={value || ''} onChange={e => { void onchange(e.target.value).then(draw); }}>{[['', first], ...list.map(p => [p.id, p.name])].map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></label>;
  if (!list.length) return <><p className="dim">연결 · 프리셋 · 포맷팅 템플릿을 한 묶음으로 저장해 두면 여기서 한 번에 바꿀 수 있어요.</p><Btn label="프로필 만들기" ic="plus" cls="ghost" onClick={() => B.ui.go('quick', 'profiles')} /></>;
  return <>
    {pick('지금 바로 바꾸기', now_?.id, async v => { const p = findProfile(v); if (!p) return; await applyProfile(p); B.ui.go('chat', chat.id); }, now_ ? '—' : '프로필과 다른 설정을 쓰는 중')}
    {pick('이 대화방에 묶기', chat.profileId, async v => { chat.profileId = v; await saveChat(chat); const p = findProfile(v); if (p && !matches(p)) { await applyProfile(p); B.ui.go('chat', chat.id); } }, '묶지 않음')}
    {ch ? pick(`${ch.name}의 모든 대화에 묶기`, ch.bind?.profileId, async v => { ch.bind = { connId: '', presetId: '', personaId: '', ...(ch.bind || {}), profileId: v }; await S.save('chars', ch, true); const p = !chat.profileId && findProfile(v); if (p && !matches(p)) { await applyProfile(p); B.ui.go('chat', chat.id); } }, '묶지 않음') : null}
    <small className="hint">대화방에 묶은 것이 캐릭터에 묶은 것보다 먼저입니다. 묶어 둔 대화를 열면 전체 설정이 그 프로필로 바뀝니다.</small>
    <Btn label="프로필 관리" ic="sliders" cls="ghost" onClick={() => B.ui.go('quick', 'profiles')} />
  </>;
}
/** 장면 패널: 자동 진행 · 연출 (div.col 안) */
export function AutoPanel({ chat }: { chat: ChatX }) {
  const draw = useRedraw(), R = regenCfg();
  return <>
    <Check label="연출 지시 모드" on={directOn(chat)} onChange={v => { void setDirect(chat, v).then(draw); }} hint="보내는 글을 대사가 아니라 지시로" />
    <Check label="다시 생성할 때마다 이유 묻기" on={!!R.ask} onChange={v => { R.ask = v; B.S.set({ regenWhy: R }); draw(); }} hint="Shift 를 누르면 건너뜀" />
    <AutoForm compact />
    {autoStat.calls ? <small className="hint">{`이번에 켜 둔 동안 자동으로 더 부른 횟수 ${autoStat.calls}회${autoStat.note ? ` · 마지막: ${autoStat.note}` : ''}`}</small> : null}
    <Btn label="자세한 설정" ic="sliders" cls="ghost" onClick={() => B.ui.go('quick', 'auto')} />
  </>;
}

// ════════ 설정 화면의 조각 (빠른 버튼 화면이 탭으로 싣는다 — 그 화면은 아직 없다). 각각 div.col.flow-pane 안을 그린다 ════════
export const flowPanes = {
  auto: () => <div className="card"><AutoForm />
    <p className="hint">{`둘 다 기본은 꺼져 있습니다. 답변 하나에 드는 호출은 많아야 1 + 다시 생성 ${A().swipe.max}회 + 이어쓰기 ${A().cont.max}회입니다. 생성을 직접 멈추면(멈춤 버튼 · Esc) 자동 진행도 그 답변에서는 멈춥니다.`}</p>
    <p className="hint">알아 둘 점: 자동으로 버려진 답변도 장기기억 · 자동 번역 · 상태창 갱신이 켜져 있으면 한 번씩 처리됩니다. 그 기능들의 호출이 아깝다면 금칙어 대신 프리셋 지시문으로 막는 편이 낫습니다.</p></div>,
  direct: () => <>
    <div className="card"><h3 className="form-sec">연출 지시 모드</h3>
      <p className="hint">켜 두면 입력창에 적어 보내는 글이 내 캐릭터의 대사가 아니라 작가의 지시로 전달됩니다. "갑자기 정전이 된다", "그가 먼저 사과하게 해 줘"처럼 적으면 캐릭터와 지문이 그 일을 이야기 안에서 풀어 냅니다. 입력창의 + 메뉴 · 빠른 버튼 줄의 "연출" · /direct 명령으로 켜고 끕니다. 추가 호출은 없습니다.</p>
      <DirectForm /></div>
    <div className="card"><h3 className="form-sec">재생성 이유</h3>
      <p className="hint">메시지의 ⋯ 메뉴나 입력창의 + 메뉴에서 "이유를 적어 다시 생성"을 고르면 한 줄 이유를 받아 그 한 번의 프롬프트 끝에만 넣습니다. /regen-why 이유 로도 됩니다.</p>
      <Form obj={regenCfg()} onChange={() => B.S.set({ regenWhy: regenCfg() })} defs={[
        { k: 'ask', label: '다시 생성 버튼 · 마지막 답변에서 넘기기를 누를 때마다 이유 묻기', type: 'check', hint: 'Shift 를 누른 채 누르면 묻지 않고 바로 다시 생성합니다.' },
        { k: 'withDraft', label: '버린 답변을 참고용으로 함께 보내기', type: 'check', hint: '무엇을 피해야 하는지 모델이 알 수 있지만, 그만큼 입력 토큰이 늘어납니다.' },
        { k: 'format', label: '이유를 전달하는 글', type: 'area', rows: 3, ph: REGEN_DEFAULT, hint: '{{reason}} 자리에 적은 이유가 들어갑니다. 비워 두면 기본 글을 씁니다.' },
      ]} /></div></>,
  profiles: () => <ProfilesPane />,
};
