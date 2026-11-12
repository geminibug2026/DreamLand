// 대화 모드 설정 창: 선톡 · 일정 · 상태 · 장면 · 상태창을 한곳에서 (옛 js/live.js 의 settings)
import { rowNode } from '../schedule/Editor';
import { useEffect, useMemo, useReducer, useState, type ReactNode } from 'react';
import * as sched from '../lib/f-schedule';
import { Btn, Dom, Icon } from '../kit';
import { Form, openModal, toast, type FieldDef, type ModalHandle } from '../ui';
import { charsOf } from './actions';
import type { Room } from './types';
import { Live, PROMPTS } from '../lib/live';
import { S } from '../lib/core';
import * as libLive from '../lib/live';

type Tab = 'auto' | 'sched' | 'presence' | 'scene' | 'tracker';
const TABS: [Tab, string][] = [['auto', '먼저 오는 연락'], ['sched', '일정'], ['presence', '상태 · 그룹'], ['scene', '장면 전환'], ['tracker', '상태창']];

/** 연락 현황판: 다음 연락 예정과 막힌 이유 */
function Board({ chat, close }: { chat?: Room; close: () => void }) {
  const { MOTIVES, MOTIVE_ORDER, motiveLabel } = sched;
  const p = chat ? Live.planOf?.(chat) : null;
  if (!p) return <div className="plan-board"><p className="hint">{chat ? '이 대화방을 열어 두면 여기에서 다음 연락 예정과 막힌 이유를 볼 수 있어요.' : '대화방 안에서 열면 그 방의 연락 현황이 보입니다.'}</p></div>;
  const next = p.plan.at ? `${Live.clock(p.plan.at)}` : '없음', kindName = p.plan.kind === 'later' ? '약속한 연락' : p.plan.kind === 'owed' ? '복귀 (내 말에 답장)' : p.plan.kind === 'auto' ? `${motiveLabel(p.motive?.kind) || '그냥 안부'} 예상` : '';
  return <div className="plan-board">
    <div className="plan-cells">
      <div className="plan-cell"><span>오늘 보낸 연락</span><b>{`${p.count} / ${p.cap}`}</b><i className="plan-bar"><i style={{ width: Math.min(100, p.count / Math.max(1, p.cap) * 100) + '%' }} /></i></div>
      <div className="plan-cell"><span>다음 연락 예정</span><b>{next}</b>{kindName ? <small>{kindName}</small> : null}</div>
      <div className="plan-cell"><span>마지막으로 온 연락</span><b>{p.last?.at ? Live.clock(p.last.at) : '아직 없음'}</b>{p.last?.kind ? <small>{motiveLabel(p.last.kind)}</small> : null}</div>
      <div className="plan-cell"><span>지금 상태</span><b>{p.who || ''}</b><small>{p.status || ''}</small></div>
    </div>
    {p.plan.blocks.length ? <div className="plan-why"><b>지금 연락이 오지 않는 이유</b><ul>{p.plan.blocks.map((x, i) => <li key={i}>{x}</li>)}</ul></div> : null}
    {p.plan.notes.length ? <div className="plan-why soft"><b>참고</b><ul>{p.plan.notes.map((x, i) => <li key={i}>{x}</li>)}</ul></div> : null}
    <div className="plan-cds"><span className="plan-cds-label">말 거는 이유</span>{MOTIVE_ORDER.map(k => { const left = p.cdLeft?.[k] || 0; return <span key={k} className={'plan-cd' + (left ? ' wait' : '')} title={MOTIVES[k][2]}>{motiveLabel(k)}<small>{left ? `${Live.span(left)} 뒤` : '가능'}</small></span>; })}</div>
    <div className="row wrap"><Btn label="지금 한 통 받기" ic="send" cls="ghost" title="답변 1회와 같은 비용" onClick={async () => { const r = chat ? await Live.poke?.(chat) : false; if (r === false) toast('지금은 보낼 수 없어요 (생성 중이거나 연결이 없어요)'); else close(); }} />
      <small className="hint">한도와 상관없이 지금 바로 한 통을 받습니다 (호출 1회). 이유는 위 예상대로 정해져요.</small></div>
  </div>;
}

function Settings({ first, chat, close }: { first: Tab; chat?: Room; close: () => void }) {
  const [tab, setTab] = useState<Tab>(first), [, redraw] = useReducer((x: number) => x + 1, 0);
  const st = S.settings, { MOTIVES, MOTIVE_ORDER, motiveLabel } = sched;
  const apply = () => { S.set({}); Live.onChange?.(); redraw(); };
  useEffect(() => { const t = setInterval(redraw, 20000); return () => clearInterval(t); }, []);
  const prompts = (kind: string): FieldDef[] => PROMPTS[kind].map(([k, label, dflt, hint]) => ({ k, label, type: 'area', rows: 5, ph: dflt, hint: `${hint ? hint + ' ' : ''}비워 두면 기본 문장을 씁니다 (칸에 흐리게 보이는 글).` }));
  const form = (defs: (FieldDef | null)[]) => <Form obj={st} defs={defs} onChange={apply} />;
  const fold = (title: string, defs: FieldDef[]): FieldDef => ({ el: <details className="live-fold"><summary><Icon name="edit" size={14} />{title}</summary>{form(defs)}</details> });
  const conns: [string, string][] = [['', '이 대화의 연결 그대로'], ...S.conns.map((c): [string, string] => [c.id, `${c.name}${c.model ? ' · ' + c.model : ''}`])];
  const chars = chat ? charsOf(chat) : [];
  // 일정 줄은 옛 화면 조각이다. 일정이 바뀔 때만 새로 만든다
  const [schedGen, bumpSched] = useReducer((x: number) => x + 1, 0);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const schedRows = useMemo(() => chars.map(c => <Dom key={c.id} node={rowNode(c, () => { Live.onChange?.(); bumpSched(); })} />), [schedGen, chat]);
  const cdDefs: FieldDef[] = MOTIVE_ORDER.map(k => ({ k: `modes.cd.${k}`, label: `${motiveLabel(k)} (시간)`, type: 'num', min: 0, step: 0.5, third: true, hint: MOTIVES[k][2] }));
  const body: Record<Tab, () => ReactNode> = {
    auto: () => <><p className="hint">먼저 오는 연락 한 통은 보통 답변 한 번과 같은 비용이 듭니다. 아래 한도 안에서만 보내고, 대화방을 열어 두지 않은 캐릭터는 연락하지 않습니다.</p><Board chat={chat} close={close} />
      {form([{ section: '조용할 때 먼저 말 걸기' }, { k: 'modes.auto', label: '내가 조용하면 캐릭터가 먼저 말 걸기', type: 'check' },
        { k: 'modes.autoMinutes', label: '몇 분 조용하면', type: 'num', min: 1, third: true }, { k: 'modes.autoBackoff', label: '연달아 걸 때 간격 배수', type: 'num', min: 1, step: 0.5, third: true, hint: '2 면 10분 → 20분 → 40분.' }, { k: 'modes.autoStreak', label: '답이 없을 때 연속 최대', type: 'num', min: 1, max: 10, third: true },
        { k: 'modes.autoDaily', label: '하루 최대 횟수', type: 'num', min: 0, third: true, hint: '0 이면 캐릭터의 수다 정도에 따라 2~8회.' }, { k: 'modes.quietFrom', label: '연락하지 않는 시간 — 부터', third: true, ph: '01:00' }, { k: 'modes.quietTo', label: '까지', third: true, ph: '08:00' },
        { k: 'modes.autoHidden', label: '화면을 안 보고 있을 때도 보내기 (끄면 이 탭을 보고 있을 때만 — 모르는 사이에 비용이 나가지 않아요)', type: 'check' },
        { section: '말 거는 이유' }, { k: 'modes.motives', label: '일정과 시각에서 말 걸 이유를 골라 주기 (아침 인사 · 밤 인사 · 식사 · 바쁜 뒤 · 복귀 · 장기 부재 · 일과 전환 · 그냥 안부)', type: 'check', hint: '추가 호출 없음 — 선톡 지시문에 한 줄이 더해질 뿐입니다.' },
        { k: 'modes.readReact', label: '읽지 않음 · 읽고 답 없음에 따라 다르게 반응하기', type: 'check' }, { k: 'modes.showWhy', label: '먼저 온 연락 옆에 이유를 작게 적어 두기', type: 'check' },
        { k: 'modes.longHours', label: '"장기 부재"로 보는 시간', type: 'num', min: 1, third: true, hint: '이만큼 서로 말이 없었을 때.' },
        fold('이유별 쿨다운 — 같은 이유로 다시 말 걸기까지', [...cdDefs, { el: <small className="hint">0 이면 쿨다운 없음. 일정이 없는 캐릭터는 시계만 보고 아침 · 밤 · 식사 시간을 짐작합니다.</small> }]),
        { section: '약속과 부재' }, { k: 'modes.later', label: '"이따 연락할게" 같은 약속을 기억했다가 그 시간에 연락하기', type: 'check' }, { k: 'modes.laterMax', label: '한 대화방에서 기억할 약속 수', type: 'num', min: 1, max: 10, half: true },
        { k: 'modes.away', label: '오래 자리를 비우면 그 사이에 온 연락 남겨 두기 (돌아왔을 때 한 통)', type: 'check' }, { k: 'modes.awayHours', label: '몇 시간 넘게 비웠을 때', type: 'num', min: 1, half: true },
        { section: '비용' }, { k: 'modes.autoConn', label: '먼저 오는 연락에 쓸 연결', type: 'select', opts: conns, half: true, hint: '값싼 모델을 따로 지정할 수 있습니다.' }, { k: 'modes.autoTokens', label: '먼저 오는 연락의 최대 토큰', type: 'num', min: 0, half: true, hint: '0 이면 대화 모드의 기본 길이.' },
        { k: 'modes.notify', label: '화면을 안 보고 있을 때 온 연락을 브라우저 알림으로 받기', type: 'check' },
        fold('지시문 고치기', prompts('auto'))])}</>,
    sched: () => <><p className="hint">캐릭터마다 일주일 일과(요일 × 시간대)를 정해 두면, 지금 시각의 칸이 그 캐릭터의 상태와 하는 일이 되고 오늘 일정이 대화 모드 프롬프트에 들어갑니다. 캐릭터가 답장에서 스스로 상태를 바꾸면 그 칸이 끝날 때까지만 그 상태가 앞섭니다.</p>
      {form([{ k: 'modes.sched', label: '캐릭터 일정을 대화 모드에 반영하기', type: 'check', hint: '추가 호출 없음. 일정을 AI 로 짜는 것만 버튼을 누를 때 1회씩 부릅니다.' }])}
      <div className="sched-items">{chars.length ? schedRows : <p className="dim">대화방 안에서 열면 그 방의 캐릭터가 여기에 보입니다. 모든 캐릭터의 일정은 기능 › 일정 에서 고칠 수 있어요.</p>}</div>
      {form([fold('지시문 고치기', prompts('sched'))])}</>,
    presence: () => <><p className="hint">여기 있는 것은 모두 추가 호출 없이 동작합니다 — 끼어들기만 빼고요.</p>
      {form([{ section: '내 상태' }, { k: 'modes.userStatus', label: '지금 내 상태', type: 'select', half: true, opts: Object.entries(Live.userStatuses), hint: '방해 금지면 캐릭터가 먼저 연락하지 않습니다. 숨김이면 캐릭터에게는 오프라인처럼 보입니다.' }, { k: 'modes.userActivity', label: '하는 일 (선택)', half: true, ph: '예: 회의 중' },
        { k: 'modes.userIdleMin', label: '입력이 없으면 자리 비움으로 (분)', type: 'num', min: 0, third: true, hint: '0 이면 자동으로 바꾸지 않습니다.' },
        { section: '답장이 오기까지' }, { k: 'modes.presenceDelay', label: '캐릭터의 상태에 따라 답장을 늦추기', type: 'check', hint: '오프라인이면 답장이 오지 않습니다.' },
        { k: 'modes.delayOnline', label: '온라인일 때 (초)', third: true, ph: '0' }, { k: 'modes.delayIdle', label: '자리 비움일 때 (초)', third: true, ph: '4-10' }, { k: 'modes.delayDnd', label: '방해 금지일 때 (초)', third: true, ph: '9-18', hint: '"4-10" 처럼 범위로 적으면 그 사이에서 고릅니다.' },
        { k: 'modes.delayNamed', label: '내가 이름을 부르면 (%)', type: 'num', min: 0, max: 100, third: true, hint: '기다리는 시간을 이 비율로 줄입니다. 30 이면 30% 만 기다려요.' },
        { k: 'modes.offlineWake', label: '오프라인이라 답하지 못한 말은, 캐릭터가 깨어나면 답장하기 (답변 1회 — 내가 보낸 말에 대한 답이라 하루 한도에 넣지 않아요)', type: 'check' },
        { section: '그룹: 캐릭터끼리 끼어들기' }, { k: 'modes.chime', label: '한 캐릭터가 말한 뒤 다른 캐릭터가 끼어들 수 있게 하기', type: 'check', hint: '끼어들 때마다 답변 1회와 같은 비용이 듭니다. 그룹 대화 모드에서만 동작합니다.' },
        { k: 'modes.chimeChance', label: '끼어들 확률 (%)', type: 'num', min: 0, max: 100, third: true, hint: '이름이 불린 캐릭터는 확률과 상관없이 답합니다.' }, { k: 'modes.chimeMax', label: '내 말 한 번에 최대 몇 번', type: 'num', min: 1, max: 5, third: true }, { k: 'modes.chimeDaily', label: '하루 한도', type: 'num', min: 1, third: true },
        fold('지시문 고치기', prompts('group'))])}</>,
    scene: () => <><p className="hint">대화 모드에서 실제로 만나거나 문자로 할 수 없는 일이 벌어지면, 그때부터는 메시지 대신 장면으로 이어집니다. 입력창 위의 "장면 열기 / 닫기"로 직접 할 수도 있어요.</p>
      {form([{ k: 'modes.scenes', label: '캐릭터가 스스로 장면을 열 수 있게 하기', type: 'check' }, { k: 'modes.sceneStart', label: '장면이 열리면 캐릭터가 바로 첫 장면을 쓰기 (답변 1회)', type: 'check' }, fold('지시문 고치기', prompts('scene'))])}</>,
    tracker: () => <><p className="hint">기본은 꺼져 있습니다. 켜면 대화 위에 지금 상태가 띠로 뜨고, 끄면 프롬프트에도 아무것도 들어가지 않습니다.</p>
      {form([{ k: 'tracker.enabled', label: '상태창 켜기', type: 'check' }, { k: 'tracker.mode', label: '상태를 갱신하는 방법', type: 'select', opts: [['call', '답변 뒤에 따로 묻기 (답변마다 추가 호출 1회)'], ['inline', '답변에 함께 적게 하기 (추가 호출 없음)']], hint: '어느 쪽이든 모델은 바뀐 항목만 적습니다. 적지 않은 항목은 그대로 남아요.' },
        { k: 'tracker.hud', label: '대화 화면 위에 띠로 보이기', type: 'check' }, { k: 'tracker.inject', label: '지금 상태를 프롬프트에 넣기', type: 'check' },
        { k: 'tracker.fields', label: '장면 항목', type: 'area', rows: 6, hint: '한 줄에 하나씩 "이름: 설명". "호감도 (0-100): 설명" 처럼 범위를 적으면 막대로 보입니다.' },
        { section: '인물 카드' }, { k: 'tracker.cast', label: '등장인물마다 카드 만들기 (기분 · 옷차림 · 속마음 …)', type: 'check', hint: '그룹 채팅에서는 캐릭터마다 한 장씩. 추가 호출은 없고, 프롬프트가 조금 길어집니다.' },
        { k: 'tracker.castFields', label: '카드 항목', type: 'area', rows: 4, hint: '한 줄에 하나씩 "이름: 설명". 이름에 "속마음"이나 "생각"이 들어간 항목은 생각 풍선으로 보입니다.' },
        { k: 'tracker.castOthers', label: '대화방의 캐릭터가 아닌 사람도 장면에 있으면 카드 만들기', type: 'check', half: true }, { k: 'tracker.castMax', label: '카드 최대 장수', type: 'num', min: 1, max: 12, half: true },
        { el: <p className="hint">상태는 답변마다 그 메시지에 함께 찍혀서, 답변을 넘기거나 다시 생성하거나 지우면 그 시점의 값으로 되감깁니다. 띠의 화살표로 지난 시점을 훑어볼 수 있고, 항목을 누르면 고치기 · 잠그기 · 숨기기가 나옵니다.</p> },
        fold('지시문 고치기', prompts('tracker'))])}</>,
  };
  return <div className="col">
    <div className="tabs live-tabs">{TABS.map(([k, l]) => <button key={k} type="button" className={'tab' + (k === tab ? ' on' : '')} onClick={() => setTab(k)}>{l}</button>)}</div>
    <div className="live-set" key={tab}>{body[tab]()}</div>
  </div>;
}

/** 대화 모드 설정 창을 연다 */
export function liveSettings(tab: string = 'auto', chat?: Room | null): ModalHandle {
  libLive.ensureDefaults();
  const first: Tab = TABS.some(t => t[0] === tab) ? tab as Tab : 'auto';
  const box: ModalHandle = openModal({ title: '대화 모드 설정', wide: true, body: <Settings first={first} chat={chat ?? undefined} close={() => box.close()} />, actions: [{ label: '닫기', cls: 'primary' }] });
  return box;
}
