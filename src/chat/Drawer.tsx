// 장면 패널: 연결 · 등장인물 · 상태 · 작가 노트 · 상태 트래커 · 로어북 · 변수 · 배경 + 다른 기능이 꽂는 칸(X.panels)
import { editSchedule } from '../schedule/Editor';
import { memo, useRef, type ReactNode } from 'react';
import { Avatar, Btn, Dom, Icon, IconBtn } from '../kit';
import { menu } from '../ui';
import { cur, useCh } from './store';
import { armAuto, charsOf, drawDrawer, drawGauge, drawMain, drawMsgs, drawSide, drawTop, hudOpts, modeOf, moveOldSummary, presenceOf, setDrawer, track } from './actions';
import { editState } from './Hud';
import { inspector } from './Inspector';
import { liveSettings } from './LiveSettings';
import type { Cast, Room } from './types';
import { S, pickFiles, readDataURL, shrinkImage } from '../lib/core';
import { STATUS, scheduleOf } from '../lib/f-schedule';
import { LoreLinker } from '../editors/lore';
import { X } from '../lib/hooks';
import { Live } from '../lib/live';

const Sec = ({ title, ic, open, children }: { title: string; ic: string; open: boolean; children: ReactNode }) =>
  <details className="dsec" open={open}><summary><Icon name={ic} size={16} />{title}</summary><div className="dsec-body">{children}</div></details>;
const Sel = ({ label, value, opts, onChange }: { label: string; value: string; opts: [string, string][]; onChange: (v: string) => void }) =>
  <label className="field"><span className="field-label">{label}</span><select className="inp" defaultValue={value} onChange={e => onChange(e.target.value)}>{opts.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></label>;

function Body({ c }: { c: Room }) {
  const chars = charsOf(c);
  const timer = useRef(0);
  const saveChat = () => { clearTimeout(timer.current); timer.current = window.setTimeout(() => void S.save('chats', c, true), 300); };
  const muted = (ch: Cast) => (c.muted || []).includes(ch.id);
  // 상태: 캐릭터마다 지금 상태(일정 또는 직접 고른 것)와 일정 편집
  const presRow = (ch: Cast) => {
    const p = presenceOf(c, ch), over = p.from === 'override', has = !!scheduleOf(ch);
    return <div className="pres-row" key={ch.id}>
      <div className="pres-who"><i className={'presence ' + p.status} /><b>{ch.name}</b><small>{[STATUS[p.status], p.activity, over ? (p.until ? `${Live.clock(p.until)} 까지` : '직접 정함') : has ? '일정대로' : ''].filter(Boolean).join(' · ')}</small></div>
      <div className="pres-set">
        <select className="inp" title="상태를 직접 정하기" defaultValue={over ? p.status : ''} onChange={e => { const v = e.target.value; if (v) Live.setPresence(c, ch, { status: v, activity: over ? p.activity : '', hold: true }); else Live.clearPresence(c, ch); saveChat(); drawTop(); drawDrawer(); armAuto(); }}>
          {([['', has ? '일정대로' : '온라인 (기본)'], ...Object.entries(STATUS)] as [string, string][]).map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
        <IconBtn ic="moon" title={`${ch.name}의 주간 일정`} onClick={() => editSchedule(ch)} /></div>
      {over ? <input className="inp" defaultValue={p.activity || ''} placeholder="무엇을 하는 중인지 (예: 수업 중)" onChange={e => { const o = c.presenceBy?.[ch.id] || c.presence; if (o) o.activity = e.target.value; saveChat(); }} /> : null}
    </div>;
  };
  const trk = Object.entries(c.tracker || {}).filter(([k]) => !c.trackHide?.['w:' + k]), people = Object.keys(c.cast || {});
  const globals = new Set(S.settings.activeLore), charBooks = new Set(chars.flatMap(x => x.loreIds || []));
  const hits = cur.lastPrompt?.lore || [];
  const trackOn = !!S.settings.tracker.enabled;
  return <div className="drawer-body">
    <Sec title="연결과 화자" ic="plug" open>
      <Sel label="API 연결" value={S.settings.activeConn || ''} opts={S.conns.length ? S.conns.map((x): [string, string] => [x.id, `${x.name}${x.model ? ' · ' + x.model : ''}`]) : [['', '연결 없음']]} onChange={v => { S.set({ activeConn: v }); drawTop(); }} />
      <Sel label="프리셋" value={S.settings.activePreset || ''} opts={S.presets.map((x): [string, string] => [x.id, x.name])} onChange={v => { S.set({ activePreset: v }); drawGauge(); }} />
      <Sel label="이 대화의 페르소나" value={S.persona(c)?.id || ''} opts={S.personas.map((x): [string, string] => [x.id, x.name])} onChange={v => { c.personaId = v; c.personaAuto = false; saveChat(); drawMsgs(); }} />
    </Sec>
    {modeOf(c) === 'talk' ? <Sec title="상태" ic="heart" open={false}>{chars.map(presRow)}<small className="hint">일정이 있으면 지금 시각의 칸이 상태가 됩니다. 캐릭터가 답장에서 스스로 바꾸면 그 칸이 끝날 때까지만 앞섭니다.</small><Btn label="먼저 오는 연락 · 일정 · 상태 설정" ic="sliders" cls="ghost" onClick={() => liveSettings('auto', c)} /></Sec> : null}
    <Sec title="등장인물" ic="users" open={chars.length > 1}>
      <div className="members">{chars.map(ch => <div key={ch.id} className={'member' + (muted(ch) ? ' muted' : '')}><Avatar o={ch} cls="xs" /><span>{ch.name}</span>
        {chars.length > 1 && <IconBtn ic={muted(ch) ? 'eyeoff' : 'eye'} title="잠시 쉬게 하기 / 다시 부르기" onClick={() => { const mu = new Set(c.muted || []); if (!mu.delete(ch.id)) mu.add(ch.id); c.muted = [...mu]; saveChat(); drawDrawer(); }} />}
        {chars.length > 1 && <IconBtn ic="x" title="대화에서 빼기" onClick={async () => { c.charIds = c.charIds.filter(i => i !== ch.id); await S.save('chats', c, true); drawMain(); drawDrawer(); drawSide(); }} />}</div>)}</div>
      <div className="row"><Btn label="캐릭터 초대" ic="plus" cls="ghost" onClick={e => menu(e.currentTarget, S.chars.filter(x => !c.charIds.includes(x.id)).map(x => ({ label: x.name, onclick: async () => { c.charIds.push(x.id); await S.save('chats', c, true); drawMain(); drawDrawer(); drawSide(); } })))} /></div>
      {chars.length > 1 && <Sel label="발화 순서" value={c.groupOrder || ''} opts={[['natural', '자연스럽게 (이름이 불리면 응답)'], ['list', '목록 순서대로']]} onChange={v => { c.groupOrder = v; saveChat(); }} />}
    </Sec>
    <Sec title="작가 노트" ic="note" open={!!c.note?.text}>
      <textarea className="inp" rows={4} defaultValue={c.note?.text || ''} placeholder="지금 장면에만 적용할 지시나 분위기를 적어 두세요." onChange={e => { c.note = c.note ? { ...c.note, text: e.target.value } : { depth: 4, role: 'system', text: e.target.value }; saveChat(); }} />
      <label className="field inline"><span className="field-label">삽입 깊이</span><input className="inp" type="number" min={0} defaultValue={c.note?.depth ?? 4} onChange={e => { c.note = c.note ? { ...c.note, depth: +e.target.value || 0 } : { text: '', role: 'system', depth: +e.target.value || 0 }; saveChat(); }} /></label>
    </Sec>
    {c.summary ? <Sec title="옛 요약" ic="sparkle" open={false}>
      <textarea className="inp" rows={5} defaultValue={c.summary} onChange={e => { c.summary = e.target.value; saveChat(); }} />
      <small className="hint">예전 자동 요약 방식으로 남아 있던 글이에요. 이제 줄거리는 장기기억이 맡습니다. 장기기억으로 옮기거나 지우면 이 칸은 사라져요.</small>
      <div className="row"><Btn label="장기기억으로 옮기기" ic="sparkle" cls="ghost" onClick={() => void moveOldSummary(c)} /><Btn label="지우기" cls="ghost" onClick={() => { c.summary = ''; c.summaryAt = 0; saveChat(); drawDrawer(); }} /></div>
    </Sec> : null}
    <Sec title="상태 트래커" ic="heart" open={trackOn}>{trackOn ? <>
      {trk.length ? <div className="tracker read">{trk.map(([k, v]) => <div className="trk" key={k}><span>{k}{c.trackLock?.['w:' + k] ? <Icon name="lock" size={11} /> : null}</span><b>{v || '—'}</b></div>)}</div> : <p className="dim">다음 답변부터 자동으로 채워져요.</p>}
      {people.length ? <small className="hint">{`인물 카드 ${people.length}장 · ${people.join(', ')}`}</small> : null}
      <div className="row wrap"><Btn label="고치기 · 잠금 · 숨김" ic="edit" cls="ghost" onClick={() => editState(c, hudOpts())} /><Btn label="지금 갱신" ic="refresh" cls="ghost" title="모델 호출 1회" onClick={() => void track(c, cur.msgs)} /><Btn label="설정 · 지시문" ic="sliders" cls="ghost" onClick={() => liveSettings('tracker', c)} /></div>
    </> : <><p className="dim">꺼져 있어요. 켜면 시간·장소·기분 같은 상태가 대화 위에 뜹니다.</p><Btn label="상태창 켜기 · 설정" ic="sliders" cls="ghost" onClick={() => liveSettings('tracker', c)} /></>}</Sec>
    <Sec title="로어북" ic="book" open={false}>
      <LoreLinker holder={c} save={saveChat} fixed={() => S.lore.filter(b => globals.has(b.id) || charBooks.has(b.id)).map(b => [b, globals.has(b.id) ? '전역' : '캐릭터'])} />
      {hits.length ? <div className="hits"><small className="hint">{`마지막 생성에서 발동한 항목 ${hits.length}개`}</small>{hits.map((e, i) => <span className="chip static" key={i}>{e.name || e.keys?.[0] || e.book}</span>)}</div> : null}
    </Sec>
    <Sec title="변수" ic="code" open={false}>
      <textarea className="inp" rows={3} placeholder="호감도=50" defaultValue={Object.entries(c.vars || {}).map(([k, v]) => `${k}=${v}`).join('\n')} onChange={e => { c.vars = Object.fromEntries(e.target.value.split('\n').map(l => l.split('=')).filter(p => p[0].trim()).map(p => [p[0].trim(), p.slice(1).join('=')])); saveChat(); }} />
      <small className="hint">한 줄에 하나씩 "이름=값" 으로 적습니다 (쉼표로 나누지 않아요). 값 안에는 쉼표나 = 가 들어가도 됩니다. 프롬프트에서는 {'{{getvar::이름}}'} 으로 불러오고, 대화 중에는 /setvar 이름 값 으로 바꿉니다.</small>
    </Sec>
    <Sec title="배경" ic="image" open={false}><div className="row">
      <Btn label="이미지 선택" ic="upload" cls="ghost" onClick={async () => { const [f] = await pickFiles({ accept: 'image/*' }); if (!f) return; c.bg = await shrinkImage(await readDataURL(f), 1920, 'image/jpeg', 0.85); await S.save('chats', c, true); drawMain(); }} />
      {c.bg && <Btn label="지우기" cls="ghost" onClick={async () => { c.bg = ''; await S.save('chats', c, true); drawMain(); }} />}</div></Sec>
    {X.panels.map((p, i) => { try { return <Sec key={i} title={p.title || ''} ic={p.icon || 'sparkle'} open={!!p.open}><Dom node={p.render(c, cur.msgs)} /></Sec>; } catch (e) { console.warn('[확장 패널]', p.owner, e); return null; } })}
    <Btn label="프롬프트 살펴보기" ic="search" cls="ghost wide" onClick={inspector} />
  </div>;
}

export const Drawer = memo(function Drawer() {
  const ver = useCh('drawer'), kept = useRef<ReactNode>(null);
  const c = cur.chat;
  if (!cur.drawer || !c) return kept.current;   // 닫혀 있으면 열 때 그린다
  // 옛 것처럼 그릴 때마다 통째로 새로 만든다 (다른 기능이 꽂은 칸도 그때 다시 그려진다)
  return kept.current = <><header className="drawer-head"><b>장면 패널</b><IconBtn ic="x" title="닫기" onClick={() => setDrawer(false)} /></header><Body key={ver} c={c} /></>;
});
