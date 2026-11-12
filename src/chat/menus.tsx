// 대화 메뉴 · 그룹 만들기 · 상태 메뉴 · 이 대화에서 찾기 · 이 방의 시각
import { useReducer, useState } from 'react';
import { charPicker, confirmBox, menu, openModal, promptBox, toast, type MenuItem, type ModalHandle } from '../ui';
import { B } from './bridge';
import { cur, ui } from './store';
import { charsOf, drawMain, drawSide, drawTop, jumpTo, modeOf, presenceOf, titleOf } from './actions';
import { inspector } from './Inspector';
import { liveSettings } from './LiveSettings';
import type { Cast, ClockCfg, Room } from './types';

export interface TopHooks { narrow: boolean; setMode(k: 'rp' | 'talk'): void; find(): void; me(a: Element): void; pres(a: Element): void }

export const presItems = (c: Room, chars: Cast[]): MenuItem[] => [
  ...chars.map(ch => { const p = presenceOf(c, ch); return { label: `${ch.name} · ${B.sched.STATUS[p.status]}`, hint: p.activity || (B.sched.scheduleOf(ch) ? '' : '일정 없음'), ic: 'moon', onclick: () => B.sched.Schedule.edit(ch) }; }),
  '-', { label: '먼저 오는 연락 · 상태 설정', ic: 'sliders', onclick: () => { liveSettings('auto', c); } }];
export const meItems = (): MenuItem[] => {
  const mo = B.live.mo, Live = B.Live;
  return [
    ...Object.entries(Live.userStatuses).map(([k, l]) => ({ label: l, ic: mo('userStatus') === k ? 'check' : 'user', hint: k === 'dnd' ? '먼저 오는 연락 없음' : k === 'hidden' ? '오프라인처럼 보임' : k === 'idle' ? '' : `${mo('userIdleMin') || 0}분 뒤 자동 자리 비움`, onclick: () => Live.setUserStatus(k) })),
    '-', { label: '하는 일 적기', ic: 'edit', hint: String(mo('userActivity') || ''), onclick: async () => { const v = await promptBox('지금 하는 일 (캐릭터에게 보여요)', String(mo('userActivity') || ''), { placeholder: '예: 회의 중' }); if (v !== null) { B.S.settings.modes.userActivity = v.trim(); B.S.set({}); } } }];
};

export function chatMenu(anchor: Element, c: Room, top: TopHooks | null = null) {
  const S = B.S, talk = modeOf(c) === 'talk', N = top?.narrow ? top : null, parent = c.parent && S.get('chats', c.parent.id);
  menu(anchor, [
    ...(N ? [
      { label: talk ? 'RP 모드로 바꾸기' : '대화 모드로 바꾸기', ic: talk ? 'feather' : 'chat', hint: talk ? '소설처럼' : '메신저처럼', onclick: () => N.setMode(talk ? 'rp' : 'talk') },
      talk ? { label: '캐릭터 상태 · 일정', ic: 'moon', onclick: () => N.pres(anchor) } : null,
      talk ? { label: '내 상태', ic: 'user', hint: B.Live.userStatus().label, onclick: () => N.me(anchor) } : null,
      { label: '꿈 일기장', ic: 'book', onclick: () => B.core.emit('diary:open', c) },
      { label: '이 대화에서 찾기', ic: 'search', onclick: N.find },
      { label: '같은 캐릭터와 새 대화', ic: 'plus', onclick: () => B.oldChat.startMenu(anchor, c.charIds) },
      { label: '프롬프트 살펴보기', ic: 'code', onclick: inspector },
      '-'] as MenuItem[] : []),
    talk ? { label: '이 방의 시각', ic: 'moon', hint: B.clock.clockHint(c), onclick: () => { clockDialog(c, () => { if (c.id === cur.chat?.id) drawMain(); }); } } : null,
    { label: '대화 모드 설정', ic: 'sliders', hint: '선톡 · 장면 · 상태창', onclick: () => { liveSettings(modeOf(c) === 'talk' ? 'auto' : 'tracker', c); } },
    { label: c.pinned ? '고정 풀기' : '맨 위에 고정', ic: 'star', onclick: async () => { c.pinned = !c.pinned; await S.save('chats', c, true); drawSide(); } },
    parent ? { label: '원래 대화방으로', ic: 'branch', onclick: () => B.ui.go('chat', parent.id) } : null,
    { label: '이름 바꾸기', ic: 'edit', onclick: async () => { const v = await promptBox('대화 이름', c.name); if (v !== null) { c.name = v; await S.save('chats', c, true); drawSide(); if (c.id === cur.chat?.id) drawTop(); } } },
    { label: 'JSONL 로 내보내기', ic: 'import', hint: '실리태번 호환', onclick: async () => { const ms = await S.msgs(c.id); B.core.download(`${titleOf(c)}-${c.id}.jsonl`, B.cards.chatToStJsonl(c, ms, S.persona(c).name, charsOf(c)[0]?.name || 'Character'), 'application/jsonl'); } },
    { label: '텍스트로 내보내기', ic: 'note', onclick: async () => { const ms = await S.msgs(c.id); B.core.download(`${titleOf(c)}.txt`, ms.filter(m => !m.hidden).map(m => `${m.role === 'user' ? S.persona(c).name : m.role === 'system' ? '나레이션' : (m.name || titleOf(c))}: ${B.core.msgText(m)}`).join('\n\n'), 'text/plain'); } },
    '-',
    { label: '대화 삭제', ic: 'trash', danger: true, onclick: async () => {
      if (!(await confirmBox(`"${titleOf(c)}" 대화를 삭제할까요?`, '삭제', true))) return;
      if (cur.gen?.chat === c) cur.abort?.abort();
      await B.Assets.removeOwner('chat:' + c.id); await S.remove('chats', c.id);
      if (c.id === cur.chat?.id) { cur.chat = null; S.set({ lastChat: '' }); B.ui.go('chat'); } else drawSide();
    } },
  ]);
}

export function groupDialog() {
  if (B.S.chars.length < 2) return toast('그룹 채팅은 캐릭터가 둘 이상 있어야 해요');
  charPicker({ title: '그룹 채팅에 함께할 캐릭터', onDone: ids => { if (ids.length < 2) return toast('두 명 이상 골라 주세요'); B.oldChat.startMenu(ui.side || document.body, ids); } });
}

function Find({ close }: { close: () => void }) {
  const [q, setQ] = useState('');
  const term = q.trim().toLowerCase();
  const hits = term ? cur.msgs.map((x, i) => ({ x, i, t: B.core.msgText(x) })).filter(o => o.t.toLowerCase().includes(term)).slice(-80).reverse() : null;
  return <div className="col"><input className="inp" placeholder="찾을 말" value={q} onChange={e => setQ(e.target.value)} />
    <div className="find-list">{hits && (hits.length ? hits.map(o => { const at = o.t.toLowerCase().indexOf(term); return <button className="find-item" key={o.x.id} onClick={() => { close(); jumpTo(o.x); }}>
      <b>{`${String(o.i + 1).padStart(3, '0')} · ${o.x.role === 'user' ? B.S.persona(cur.chat).name : (o.x.name || '나레이션')}`}</b><span>{(at > 30 ? '…' : '') + o.t.slice(Math.max(0, at - 30), at + 90).replace(/\s+/g, ' ')}</span></button>; }) : <p className="dim">찾는 말이 없어요.</p>)}</div></div>;
}
export function findInChat() { const m: ModalHandle = openModal({ title: '이 대화에서 찾기', body: <Find close={() => m.close()} /> }); }

// ── 이 방의 시각 ──
const pad = (n: number) => String(n).padStart(2, '0');
const local = (t: number) => { const d = new Date(t); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`; };
function ClockDlg({ chat }: { chat: Room }) {
  const [gen, redraw] = useReducer((x: number) => x + 1, 0);
  const Clock = B.Clock;
  const set = async (patch: ClockCfg) => { chat.clock = { mode: 'real', at: Date.now(), setAt: Date.now(), flow: 'real', step: 5, ai: false, ...(chat.clock || {}), ...patch }; await B.S.save('chats', chat, true); B.core.emit('clock', chat); redraw(); };
  const c: ClockCfg = chat.clock || { mode: 'real' }, mode = c.mode || 'real';
  const card = (k: 'real' | 'story' | 'none', title: string, desc: string) => <button type="button" className={'clock-opt' + (mode === k ? ' on' : '')} onClick={() => void set(k === 'story' && mode !== 'story' ? { mode: k, at: Clock.ms(chat), setAt: Date.now() } : { mode: k })}><i /><b>{title}</b><small>{desc}</small></button>;
  const jump = (min: number) => { const now = Clock.ms(chat); let t = now + min * 60000; if (!min) { const d = new Date(now); t = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1, 8, 0).getTime(); } void set({ at: t, setAt: Date.now() }); };
  return <div className="clock-dlg">
    <div className="clock-opts">
      {card('real', '현실 시각', '지금 실제 시각과 날짜를 그대로 씁니다.')}
      {card('story', '이야기 속 시각', '이 방만의 날짜와 시각을 정합니다. 과거 · 미래 · 다른 시간대 무엇이든.')}
      {card('none', '시각 없음', '메시지에 시각을 붙이지 않고, 지금이 몇 시인지도 알려 주지 않습니다.')}
    </div>
    {mode === 'story' ? <div className="clock-story">
      <label className="field"><span className="field-label">지금 이 방의 시각</span><input className="inp" type="datetime-local" key={gen} defaultValue={local(Clock.ms(chat))} onChange={e => { const t = new Date(e.target.value).getTime(); if (isFinite(t)) void set({ at: t, setAt: Date.now() }); }} /></label>
      <div className="clock-jump">{([['+1시간', 60], ['+6시간', 360], ['다음 날 아침', 0], ['+1주', 10080]] as const).map(([l, min]) => <button type="button" className="chip" key={l} onClick={() => jump(min)}>{l}</button>)}</div>
      <label className="field"><span className="field-label">시간이 흐르는 방식</span><select className="inp" value={c.flow || 'real'} onChange={e => void set({ at: Clock.ms(chat), setAt: Date.now(), flow: e.target.value as ClockCfg['flow'] })}>
        <option value="real">현실처럼 흐름 — 1분에 1분씩</option><option value="step">메시지마다 조금씩</option><option value="hold">멈춰 둠 — 직접 옮길 때만</option></select></label>
      {c.flow === 'step' ? <label className="field"><span className="field-label">메시지 하나에 몇 분</span><input className="inp" type="number" min={0} max={1440} defaultValue={c.step ?? 5} onBlur={e => { const v = Math.max(0, +e.target.value || 0); if (v !== (c.step ?? 5)) void set({ step: v }); }} /></label> : null}
      <label className="check"><input type="checkbox" checked={!!c.ai} onChange={e => void set({ ai: e.target.checked })} /><i /><span>캐릭터가 시간을 넘길 수 있게 하기</span><small>잠들었다 깨거나 장면이 건너뛸 때 캐릭터가 스스로 시계를 옮깁니다. 추가 호출은 없습니다.</small></label>
      <small className="hint">입력창에서 /time 22:30 · /time +2시간 · /time 2024-03-02 08:00 으로도 옮길 수 있어요. 캐릭터의 일정과 상태도 이 시각을 따릅니다.</small>
    </div> : null}
  </div>;
}
/** 이 방의 시각 고르기. 고치는 즉시 저장된다 */
export function clockDialog(chat: Room, done: () => void = () => { }) {
  return openModal({ title: '이 방의 시각', body: <ClockDlg chat={chat} />, actions: [{ label: '닫기', cls: 'primary' }], onClose: done });
}
