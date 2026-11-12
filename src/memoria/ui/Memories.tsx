// 장기기억 — 기억 탭 (옛 memoria-views.js 의 vMemories)
import { Btn } from '../../kit';
import type { FormDefs } from '../../ui';
import { memMod, toast } from '../bridge';
import type { MemItem } from '../types';
import { Chip, Del, Ib, Ico, KindBadge, Meter, None, Sec, VIS_IC, editBox, pct, safe, showSource, turnTag, useBump, type StOpen } from './parts';
import { MANUAL_MAX, Mx, cut, noMap, onJump } from './viewsShared';

const memDefs = (owners: string[]): FormDefs => {
  const { KINDS, VIS } = memMod();
  return [
    { k: 'summary', label: '기억', type: 'area', rows: 3 }, { k: 'kind', label: '종류', type: 'select', opts: Object.entries(KINDS), third: true }, { k: 'visibility', label: '누가 아는가', type: 'select', opts: Object.entries(VIS), third: true }, { k: 'owner', label: '소유자 (개인 · 비밀일 때)', third: true, ph: owners.join(', ') },
    { k: 'knowers', label: '아는 사람 (개인 · 비밀일 때 — 소유자 말고도 이 일을 아는 인물)', type: 'tags', hint: '비밀은 누가 아는지까지 적어야 지켜집니다. 소유자만 적으면 함께 아는 인물까지 모르는 척하게 됩니다. 공개 기억에서는 비워집니다.' },
    { k: 'importance', label: '중요도', type: 'range', min: 0, max: 1, step: 0.05 }, { k: 'quote', label: '발췌 (본문 그대로 한 줄)' },
    { k: 'entities', label: '개체 (등장인물)', type: 'tags', half: true }, { k: 'hints', label: '떠올릴 단서', type: 'tags', half: true }, { k: 'tags', label: '태그', type: 'tags', half: true }, { k: 'trigger', label: '트리거 (정규식 — 입력이 맞으면 반드시 불러옵니다)', half: true, ph: '반지|ring' },
    { k: 'pinned', label: '고정 (예산 안에서 우선 주입)', type: 'check' }, { k: 'disabled', label: '비활성화', type: 'check' }];
};
async function editMem(st: StOpen, m?: MemItem) {
  const mem = st.mem, M = Mx(), owners = [...new Set([...mem.cast.map(c => c.name), ...mem.memories.map(x => x.owner).filter(Boolean)])] as string[];
  const d = await editBox<Partial<MemItem>>(m ? '기억 내용 수정' : '기억 추가 (수동 기억은 자동 정리에서 제외됩니다)', m ? { knowers: [], ...m } : { kind: 'fact', summary: '', quote: '', importance: 0.8, entities: [], tags: ['manual'], hints: [], visibility: 'public', owner: '', knowers: [], trigger: '', pinned: false, disabled: false }, memDefs(owners), { wide: true });
  if (!d || !d.summary?.trim()) return;
  d.summary = cut(d.summary, MANUAL_MAX);
  // 아는 사람은 비공개 기억에만 남긴다 — 이름은 인물 카드의 표기로 맞춘다
  d.knowers = (d.visibility || 'public') === 'public' ? [] : [...new Set((d.knowers || []).map(e => M.canonName(mem, cut(e, 60))).filter(Boolean))].slice(0, 6);
  if (m) { if (d.summary !== m.summary) { d.manual = true; delete m.av; } Object.assign(m, d); delete m.av; await M.save(mem); }   // 직접 다듬은 기억은 스와이프 롤백 · 상한 정리 · 서고 정리에서 보호한다
  else { await M.add(st.chat.id, d); toast('기억을 추가했습니다.', 'ok'); }
  st.draw();
}

type Sorter = (a: MemItem, b: MemItem) => number;
const sorts: Record<string, Sorter> = { new: (a, b) => (b.turn ?? 0) - (a.turn ?? 0) || (b.ts || 0) - (a.ts || 0), imp: (a, b) => (b.importance || 0) - (a.importance || 0), echo: (a, b) => (b.echoes || 0) - (a.echoes || 0) || (b.shown || 0) - (a.shown || 0) };
type FilterKey = 'kind' | 'vis' | 'owner' | 'sort' | 'only';

export function Memories({ st }: { st: StOpen }) {
  const { KINDS, VIS } = memMod(), mem = st.mem, no = noMap(st), owners = [...new Set(mem.memories.map(m => m.owner).filter(Boolean))] as string[];
  // 검색칸에 글을 치는 동안에는 목록만 갈아 끼운다 — 검색칸까지 새로 만들면 한글 조합이 끊긴다
  const drawList = useBump();
  const save = async () => { await Mx().save(mem); drawList(); };
  const card = (m: MemItem) => {
    const n = no.get(m.msgId as string) ?? -1, others = (m.knowers || []).filter(k => k && k !== m.owner), hidden = (m.visibility || 'public') !== 'public', vis = m.visibility || '';
    return <article key={m.id} className={`mm-card${m.disabled ? ' off' : ''}${m.pinned ? ' pinned' : ''}`}>
      <header><KindBadge k={m.kind} />{n >= 0 ? <button className="mm-st-jump" type="button" title="채팅 메시지 번호 — 누르면 그 메시지로" data-mes={n}>{`#${n}`}</button> : <span className="mm-turn" title="이 대화에 원문이 없는 기억">{turnTag(mem, m)}</span>}
        <span className="mm-vis" title={`${VIS[vis] || VIS.public}${m.owner ? ` (소유: ${m.owner})` : ''}${others.length ? ` · 아는 사람: ${others.join(', ')}` : ''}`}><Ico name={VIS_IC[vis] || 'globe'} size={13} />{hidden ? (m.owner || VIS[vis]) : null}</span>
        <span className="mm-imp" title="중요도"><Meter v={m.importance || 0} max={1} />{pct(m.importance)}</span>{m.shown ? <span className="mm-echo" title="프롬프트에 실린 횟수 · 답변에 반영된 횟수">{`실림 ${m.shown} · 반영 ${m.echoes || 0}`}</span> : null}
        <span className="mm-actions"><Ib name="book" title="대화 원문 확인" onClick={() => showSource(st, m)} /><Ib name="pin" title={m.pinned ? '고정 해제' : '예산 안에서 우선 주입(고정)'} onClick={() => { m.pinned = !m.pinned; void save(); }} cls={m.pinned ? 'on' : ''} />
          <Ib name={m.disabled ? 'eyeoff' : 'eye'} title={m.disabled ? '활성화' : '비활성화'} onClick={() => { m.disabled = !m.disabled; void save(); }} /><Ib name="edit" title="편집" onClick={() => editMem(st, m)} /><Del st={st} arr="memories" x={m} what="이 기억" /></span></header>
      <p className="mm-sum">{m.summary}</p>{m.quote ? <blockquote>{`"${m.quote}"`}</blockquote> : null}
      {(m.entities || []).length || (m.tags || []).length || (m.hints || []).length || m.trigger || (hidden && others.length) ? <div className="mm-chips">{hidden && others.length ? <span className="mm-chip know" title="소유자 말고도 이 일을 아는 인물"><Ico name={VIS_IC[vis] || 'lock'} size={11} />{`아는 사람 · ${others.join(', ')}`}</span> : null}
        {(m.entities || []).map((e, i) => <Chip key={'e' + i} text={'@' + e} cls="ent" />)}{(m.tags || []).map((t, i) => <Chip key={'t' + i} text={'#' + t} />)}{(m.hints || []).map((t, i) => <Chip key={'h' + i} text={'?' + t} cls="hint" />)}{m.trigger ? <Chip text={'⚑ ' + m.trigger} cls="trig" /> : null}</div> : null}
    </article>;
  };
  const q = String(st.q || '').toLowerCase();
  const items = mem.memories.filter(m => (!st.kind || m.kind === st.kind) && (!st.vis || m.visibility === st.vis) && (!st.owner || m.owner === st.owner || (m.knowers || []).includes(st.owner)) && (st.only !== 'pin' || m.pinned) && (st.only !== 'off' || m.disabled) && (st.only !== 'manual' || m.manual) && (st.only !== 'ep' || (m.tags || []).includes('episode_raw')) && (st.only !== 'noep' || !(m.tags || []).includes('episode_raw'))
    && (!q || `${m.summary} ${m.quote || ''} ${(m.entities || []).join(' ')} ${(m.tags || []).join(' ')} ${(m.hints || []).join(' ')} ${(m.knowers || []).join(' ')}`.toLowerCase().includes(q))).sort(sorts[st.sort] || sorts.new);
  const sel = (key: FilterKey, opts: (readonly [string, string])[], title: string, full = false) => <select className="inp auto" title={title} value={st[key] || ''} onChange={e => { st[key] = e.target.value; if (full) st.draw(); else drawList(); }}>{opts.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>;
  const kinds = Object.keys(KINDS).map(k => [k, mem.memories.filter(m => m.kind === k).length] as const).filter(x => x[1]);
  const people = [...new Set([...owners, ...mem.memories.flatMap(m => m.knowers || [])])];
  return <div className="mm-view" onClick={onJump(st)}><Sec title="기억 브라우저" desc="고정(핀)한 기억은 토큰 예산 안에서 우선 주입됩니다. 책 아이콘으로 대화 원문을 확인할 수 있습니다." tools={<Btn label="추가" ic="plus" title="기억 추가" onClick={() => void editMem(st)} />}>
    <div className="mm-toolbar"><input className="inp" type="search" placeholder="요약·발췌·개체·태그 검색…" defaultValue={st.q || ''} onChange={e => { st.q = e.target.value; drawList(); }} />{sel('kind', [['', '전체'], ...Object.entries(KINDS)], '종류', true)}{sel('vis', [['', '모든 공개 범위'], ...Object.entries(VIS)], '공개 범위')}{people.length ? sel('owner', [['', '아는 사람 전체'], ...people.map(o => [o, o] as const)], '소유자이거나 아는 사람') : null}
      {sel('sort', [['new', '최신순'], ['imp', '중요도순'], ['echo', '자주 쓰인 순']], '정렬')}{sel('only', [['', '전체'], ['pin', '고정한 것'], ['manual', '수동 기억'], ['off', '비활성화한 것'], ['noep', '사서가 고른 기억만'], ['ep', '턴 원문 증거만']], '걸러 보기')}</div>
    {kinds.length ? <div className="mm-kindbar">{kinds.map(([k, n]) => <button key={k} type="button" className={`mm-kindchip k-${safe(k)}${st.kind === k ? ' on' : ''}`} onClick={() => { st.kind = st.kind === k ? '' : k; st.draw(); }}>{KINDS[k]}<small>{String(n)}</small></button>)}</div> : null}
    <small className="hint">{`${mem.memories.length}개 중 ${items.length}개${items.length > 200 ? ' (앞의 200개만 보여 줍니다)' : ''}`}</small>
    <div className="mm-list mm-st-results">{items.slice(0, 200).map(card)}{items.length ? null : <None text={mem.memories.length ? '표시할 기억이 없습니다.' : '아직 기록된 기억이 없습니다. 답변이 오면 사서가 자동으로 기록합니다.'} />}</div>
  </Sec></div>;
}
