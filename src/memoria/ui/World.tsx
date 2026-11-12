// 장기기억 — 세계 탭: 인물 도감 · 관계선 · 아이템 도감 · 서약 · 캐논 · 상태 보드 · 자료실 (옛 memoria-views.js 의 vWorld)
import { Children, type KeyboardEvent, type MouseEvent, type ReactNode } from 'react';
import { Btn } from '../../kit';
import { confirmBox, openModal, type FormDefs } from '../../ui';
import { core, memMod, toast } from '../bridge';
import { bondMapSvg } from '../story';
import type { Bond, BondStep, CanonRow, CastCard, CastNote, DossierDoc, Item, Pledge, StatusRow } from '../types';
import { Chip, Del, Ib, Ico, Meter, None, SceneLine, Sec, editBox, mergeCast, safe, type StOpen } from './parts';
import { GROWTH_MAX, Gi, HAND, LINES_MAX, Mx, bondNow, bondViewRows, cut, storyState } from './viewsShared';

/** 인물 편집 — 칸과 상한.
 *  달라진 점 · 남긴 말은 문구가 그대로면 원래 적힌 턴을 지키고, 새로 적은 것은 직접 적음으로 둔다 — 직접 적은 남긴 말은 고정이라 밀려나지 않는다. */
async function editCard(st: StOpen, c?: CastCard) {
  const mem = st.mem, M = Mx(), T = mem.turns.length, src: Partial<CastCard> = c || { name: '', role: '', age: '', occupation: '', appearance: '', voice: '', core: '' };
  const draft = { name: src.name || '', aka: [...(src.aka || [])], role: src.role || '', age: src.age || '', occupation: src.occupation || '', appearance: src.appearance || '', voice: src.voice || '', core: src.core || '', traits: [...(src.traits || [])],
    rel: (src.relationships || []).map(r => `${r.target} = ${r.relation}`), growthTexts: (src.growth || []).map(g => g.text), lineTexts: (src.lines || []).map(l => l.text), provisional: !!src.provisional };
  const d = await editBox(c ? `${c.name} — 인물 정보 수정` : '인물 추가', draft, [
    { k: 'name', label: '이름', half: true }, { k: 'aka', label: '별칭', type: 'tags', half: true }, { k: 'role', label: '역할', third: true }, { k: 'age', label: '나이', third: true }, { k: 'occupation', label: '직업', third: true },
    { k: 'appearance', label: '외모', type: 'area', rows: 2 }, { k: 'voice', label: '말투', type: 'area', rows: 2 },
    { k: 'core', label: '바탕', type: 'area', rows: 3, hint: '한 번 적히면 사서가 다시 쓰지 못하는 기준입니다. 여기서만 고칠 수 있어요. 비우면 사서가 다시 적을 수 있습니다.' }, { k: 'traits', label: '특성', type: 'tags' },
    { k: 'rel', label: '관계 (한 줄에 하나, 이름 = 관계)', type: 'lines', ph: '아리아 = 소꿉친구' },
    { k: 'growthTexts', label: `달라진 점 (한 줄에 하나 · ${GROWTH_MAX}개까지)`, type: 'lines', ph: '이야기 속에서 생긴 변화 — 바탕 위에 천천히 얹힙니다' },
    { k: 'lineTexts', label: `남긴 말 (한 줄에 하나 · ${LINES_MAX}개까지)`, type: 'lines', ph: '실제로 한 대사 — 장면에 있을 때 말투 견본으로 실립니다', hint: '직접 적은 말은 고정이라 새 대사에 밀려나지 않습니다. 줄을 지우면 그 말이 빠집니다.' },
    { k: 'provisional', label: '아직 이름이 밝혀지지 않은 인물 (미확인)', type: 'check' }], { wide: true });
  if (!d || !cut(d.name, 60)) return;
  // 빈 칸은 옛 자료 그대로 null 로 둔다
  const blank = (v: string, n: number) => (cut(v, n) || null) as string | undefined;
  const prof = { name: cut(d.name, 60), aka: (d.aka || []).map(a => cut(a, 60)).filter(Boolean).slice(0, 6), role: blank(d.role, 200), age: blank(d.age, 200), occupation: blank(d.occupation, 200), appearance: blank(d.appearance, 200), voice: blank(d.voice, 200), core: blank(d.core, 500),
    traits: (d.traits || []).map(t => cut(t, 40)).filter(Boolean).slice(0, 10), relationships: (d.rel || []).map(l => { const [t, ...r] = l.split('='); return { target: cut(t, 60), relation: cut(r.join('='), 80) }; }).filter(r => r.target && r.relation).slice(0, 10), provisional: !!d.provisional };
  const oldG = new Map((c?.growth || []).map(g => [g.text, g])), oldL = new Map((c?.lines || []).map(l => [l.text, l]));
  const growth: CastNote[] = (d.growthTexts || []).map(t => cut(t, 200)).filter(Boolean).map(t => oldG.get(t) || { text: t, turn: HAND }).slice(-GROWTH_MAX);
  const lines: CastNote[] = (d.lineTexts || []).map(t => cut(t, 160)).filter(Boolean).map(t => oldL.get(t) || { text: t, turn: HAND, pinned: true }).slice(-LINES_MAX);
  const wasLocked = c?.locked;
  if (c) { Object.assign(c, prof, { growth, lines, manual: true }); if (!c.core) c.coreTurn = null; if (M.cfg().lockEdited !== false) c.locked = true; }   // 직접 고친 프로필은 기본적으로 잠근다 — 애써 고쳐 놔도 사서가 되돌려 놓는 일을 막는다
  else { mem.cast.push({ id: core().uid(), ...prof, growth, lines, coreTurn: null, manual: true, first: T, updated: T }); toast('인물을 추가했습니다.', 'ok'); }
  const folded = M.foldAliases(mem);   // 별칭을 손봤다면 그 이름으로 갈라져 있던 상태 · 기억도 바로 이 카드로 접는다
  await M.save(mem); st.draw();
  if (folded.states || folded.memories) toast(`별칭으로 갈라져 있던 기록을 합쳤습니다 — 상태 ${folded.states}건 · 기억 ${folded.memories}건`, 'ok');
  if (c && c.locked && !wasLocked) toast(`"${c.name}" 프로필을 고정했습니다. 자물쇠 아이콘으로 해제할 수 있습니다.`);
}
/** 관계선 추가 · 지금 단계 고치기 — 방향(누가 → 누구에게)은 줄의 정체라 고칠 때는 바꾸지 않는다 */
async function editBond(st: StOpen, b?: Bond) {
  const mem = st.mem, M = Mx(), cur = b ? bondNow(b) : null, names = mem.cast.map(c => c.name).join(', ');
  const d = await editBox(b ? `${b.from} → ${b.to} — 지금 단계 고치기 (이전 단계는 지나온 길로 남습니다)` : '관계선 추가 — 한 사람이 다른 한 사람을 지금 어떻게 대하는지 (방향이 있어요)',
    { from: b?.from || '', to: b?.to || '', stage: cur?.stage || '', basis: cur?.basis || '', calls: cur?.calls || '', unsaid: cur?.unsaid || '' }, [
      !b && { k: 'from', label: '누가', half: true, ph: names }, !b && { k: 'to', label: '누구에게', half: true, ph: names },
      { k: 'stage', label: '지금 단계' }, { k: 'basis', label: '근거 (그렇게 보게 된 장면)' }, { k: 'calls', label: '부르는 말', half: true }, { k: 'unsaid', label: '말하지 못한 것', half: true }], { wide: true });
  if (!d) return;
  const f = { from: b ? b.from : cut(d.from, 60), to: b ? b.to : cut(d.to, 60), stage: cut(d.stage, 120), basis: cut(d.basis, 200), calls: cut(d.calls, 100), unsaid: cut(d.unsaid, 160) };
  if (!f.from || !f.to || !f.stage) return toast('누가 · 누구에게 · 지금 단계는 꼭 적어 주세요.', 'err');
  try {
    if (!Array.isArray(mem.bonds)) mem.bonds = [];
    const row = M.upsertBond(mem, f, mem.turns.length, { manual: true });
    if (!row) return toast('같은 인물끼리는 관계선을 만들 수 없습니다.', 'err');
    row.disabled = false; await M.save(mem); st.draw();
  } catch (e) { console.error(e); toast((e as Error).message || String(e), 'err'); }
}

const pledgeDefs: FormDefs = [{ k: 'kind', label: '종류', type: 'select', opts: [['loose_end', '열린 떡밥 — 언젠가 회수해야 할 실마리'], ['keep_unresolved', '미해결 유지 — 이야기가 성급히 매듭짓지 말 것'], ['keep_secret', '비밀 유지 — 새어 나가면 안 되는 사실'], ['knowledge_gap', '정보 격차 — 특정 인물이 아직 몰라야 하는 것'], ['consent', '동의 경계 — 넘지 말아야 할 선'], ['world_limit', '세계 제약 — 세계관의 불변 규칙'], ['foreshadow', '복선 — 심어 두고 회수를 기다리는 것']] },
  { k: 'summary', label: '내용', type: 'area', rows: 3, ph: '예: 은우는 도윤이 편지를 읽었다는 사실을 아직 모른다' }, { k: 'priority', label: '우선순위', type: 'select', opts: [[1, 'P1 — 절대 어기면 안 됨'], [2, 'P2 — 중요'], [3, 'P3 — 참고']] }];
const stDefs: FormDefs = [{ k: 'entity', label: '누구 · 무엇 (장면은 scene)', half: true }, { k: 'slot', label: '슬롯', half: true, ph: 'location · outfit · condition · mood · activity …' }, { k: 'value', label: '값', type: 'area', rows: 2 }, { k: 'claim', label: '객관인가 믿음인가', type: 'select', opts: [['objective', '객관'], ['belief', '믿음 (누군가의 생각)']], half: true }, { k: 'owner', label: '믿는 이', half: true }];
const isScene = (n: unknown) => String(n).toLowerCase() === 'scene';
const pline = (ic: ReactNode, title: string, ...body: ReactNode[]) => <p className="mm-pline" title={title}>{ic}<span>{Children.toArray(body)}</span></p>;
const row = (key: string, cls: string, text: ReactNode, ...tools: ReactNode[]) => <div key={key} className={`mm-row${cls ? ' ' + cls : ''}`}><div className="mm-row-text">{text}</div>{Children.toArray(tools)}</div>;

export function World({ st }: { st: StOpen }) {
  const { LOCKS, SCOPES, DOSSIER_MAX, chunkDossier } = memMod(), { uid, now, pickFiles } = core(), M = Mx();
  const LOCK_KO: Record<string, string> = { ...LOCKS, foreshadow: LOCKS.foreshadow || '복선' };
  const mem = st.mem, cfg = M.cfg(), T = mem.turns.length, bonds = mem.bonds || [];
  type Flag = 'locked' | 'disabled';
  function tog<X extends { locked?: boolean; disabled?: boolean }>(x: X, key: Flag, onT: string, offT: string, onI = 'eye', offI = 'eyeoff', after?: (x: X) => void) {
    return <Ib name={x[key] ? offI : onI} title={x[key] ? offT : onT} onClick={async () => { x[key] = !x[key]; await M.save(mem); st.draw(); after?.(x); }} cls={x[key] && key === 'locked' ? 'on' : ''} />;
  }

  // ── 인물 도감
  const cast = [...mem.cast].sort((a, b) => (b.updated || 0) - (a.updated || 0));
  const dropLine = async (c: CastCard, l: CastNote) => { if (!(await confirmBox(`남긴 말 “${cut(l.text, 40)}”을(를) 지울까요?`, '지우기', true))) return; c.lines = (c.lines || []).filter(x => x !== l); await M.save(mem); st.draw(); };
  const castSec = <Sec title="인물 도감" desc={<>대화에 등장한 인물의 프로필입니다. <b>바탕</b>(<Gi name="anchor" size={12} />)은 한 번 적히면 사서가 다시 쓰지 못하는 기준이고, 이야기 속에서 생긴 변화(<Gi name="sprout" size={12} />)와 실제로 한 대사(<Gi name="quote" size={12} />)는 따로 쌓입니다. 연필로 모두 직접 고칠 수 있습니다.</>} tools={<Btn label="추가" ic="plus" title="인물 추가" onClick={() => void editCard(st)} />}>
    <div className="mm-cast">{cast.map(c => <article key={c.id} className={`mm-person${c.disabled ? ' off' : ''}${c.locked ? ' locked' : ''}`}>
      <header><i className="mm-initial">{(c.name || '?').trim().slice(0, 1)}</i><div className="mm-person-name"><b>{c.name}</b><small>{[c.role, c.age, c.occupation].filter(Boolean).join(' · ')}</small></div>
        {c.provisional ? <em className="mm-tag dash" title="아직 이름이 밝혀지지 않은 인물 — 정체가 드러나면 자동 병합됩니다">미확인</em> : null}{c.locked ? <em className="mm-tag" title="프로필 고정 — 사서가 이 카드의 이름·나이·외모·말투·특성을 바꾸지 못합니다 (관계만 계속 갱신)">고정</em> : null}</header>
      {(c.aka || []).length ? <p className="mm-meta">{'별칭: ' + c.aka!.join(', ')}</p> : null}{c.appearance ? <p>{c.appearance}</p> : null}
      {c.core ? pline(<Gi name="anchor" size={13} />, '바탕 — 한 번 적히면 사서가 다시 쓰지 못합니다. 연필로만 고칠 수 있어요', c.core) : null}
      {c.voice ? <p className="mm-voice" title="말투"><Ico name="chat" size={13} />{c.voice}</p> : null}
      {(c.growth || []).length ? pline(<Gi name="sprout" size={13} />, '달라진 점 — 이야기 속에서 생긴 변화. 바탕 위에 천천히 얹힙니다', c.growth!.map(g => g.text).join(' · ')) : null}
      {(c.lines || []).length ? <div className="mm-pline mm-said" title="남긴 말 — 실제로 한 대사. 장면에 있을 때 말투 견본으로 실립니다"><Gi name="quote" size={13} /><span>{c.lines!.map((l, i) => <q key={i} className={l.pinned ? 'pin' : undefined} title={(l.pinned ? '직접 적은 말 — 고정이라 밀려나지 않습니다' : l.msgId != null && l.turn != null ? `t${l.turn + 1}` : '') || undefined}>{l.text}<button type="button" title="이 말 지우기" aria-label="이 말 지우기" onClick={() => void dropLine(c, l)}>×</button></q>)}</span></div> : null}
      {(c.traits || []).length ? <div className="mm-chips">{c.traits!.map((t, i) => <Chip key={i} text={t} />)}</div> : null}{(c.relationships || []).length ? <div className="mm-chips">{c.relationships!.map((r, i) => <span key={i} className="mm-chip rel"><Ico name="link" size={12} />{`${r.target}: ${r.relation}`}</span>)}</div> : null}
      <footer>{tog(c, 'locked', '프로필 고정 — 사서가 이 카드의 프로필을 바꾸지 못하게 잠급니다 (관계는 계속 갱신)', '프로필 고정 해제 — 사서가 다시 갱신합니다', 'unlock', 'lock', x => toast(x.locked ? `"${x.name}" 프로필을 고정했습니다. 사서가 더는 바꾸지 않습니다. (관계는 계속 갱신)` : `"${x.name}" 프로필 고정을 해제했습니다.`))}
        {tog(c, 'disabled', '주입·기록에서 제외 (사서가 이 인물을 다시 등록하지 않음)', '주입에 포함')}<Ib name="merge" title="다른 카드를 이 카드로 병합" onClick={() => mergeCast(st, c)} /><Ib name="edit" title="편집" onClick={() => editCard(st, c)} /><Del st={st} arr="cast" x={c} what={`인물 "${c.name}"`} /></footer>
    </article>)}
      {!cast.length ? <None text={cfg.cast === false ? '설정 탭에서 "인물 도감"을 켜면 인물이 자동으로 기록됩니다.' : '아직 기록된 인물이 없습니다. 대화 중 새 인물이 등장하면 자동으로 기록됩니다.'} /> : null}</div>
  </Sec>;

  // ── 관계선
  const svg = bondMapSvg(bondViewRows(mem));
  // 작은 관계도에서 화살표를 누르면 이야기 탭의 관계 보기로
  const toStory = (e: MouseEvent | KeyboardEvent) => { const g = (e.target as Element).closest?.<HTMLElement>('.mm-bond-edge'); if (!g) return; const v = storyState(st); v.tab = 'bonds'; v.bond = g.dataset.id || ''; st.tab = 'summaries'; st.draw(); };
  const bondSec = <Sec title="관계선" desc="한 사람이 다른 한 사람을 지금 어떻게 대하는지 — 단계, 근거가 된 장면, 부르는 말, 아직 말하지 못한 것. 관계가 실제로 움직인 장면에서만 기록되고, 지나온 단계가 함께 남아 AI가 감정선을 건너뛰거나 되돌리지 않게 합니다." tools={<Btn label="추가" ic="plus" title="관계선 추가" onClick={() => void editBond(st)} />}>
    {svg ? <div className="mm-bond-mapwrap" dangerouslySetInnerHTML={{ __html: svg }} onClick={toStory} onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') toStory(e); }} /> : null}
    <div className="mm-bond-rows">{[...bonds].sort((a, b) => (bondNow(b)?.turn || 0) - (bondNow(a)?.turn || 0)).map(b => {
      const cur: Partial<BondStep> = bondNow(b) || {}, path: string[] = []; for (const e of b.log || []) if (path[path.length - 1] !== e.stage) path.push(e.stage);
      return <article key={b.id} className={`mm-bond-row${b.disabled ? ' off' : ''}`}>
        <header><b>{b.from}<span className="mm-bond-arrow">→</span>{b.to}</b><em className="mm-bond-stage">{cur.stage || ''}</em><span className="mm-actions">{tog(b, 'disabled', '주입·기록에서 제외 (사서가 이 줄을 다시 쓰지 않음)', '주입에 포함')}<Ib name="edit" title="지금 단계 고치기" onClick={() => editBond(st, b)} /><Del st={st} arr="bonds" x={b} what={`관계선 "${b.from} → ${b.to}"`} /></span></header>
        {cur.basis ? pline(<Ico name="search" size={13} />, '근거가 된 장면', cur.basis) : null}{cur.calls ? pline(<Ico name="chat" size={13} />, '부르는 말', '부르는 말: ', cur.calls) : null}{cur.unsaid ? pline(<Ico name="more" size={13} />, '말하지 못한 것', '말하지 못한 것: ', cur.unsaid) : null}
        {path.length > 1 ? <div className="mm-chips mm-bond-path" title="지나온 길">{path.flatMap((p, i) => [i ? <span key={'a' + i} className="mm-bond-arrow">→</span> : null, <span key={'p' + i} className={`mm-chip${i === path.length - 1 ? ' ent' : ''}`}>{p}</span>])}</div> : null}
      </article>; })}
      {!bonds.length ? <None text="아직 기록된 관계선이 없습니다. 관계가 실제로 움직이는 장면이 나오면 자동으로 기록됩니다." /> : null}</div>
  </Sec>;

  // ── 아이템 도감
  const addItem = async () => {
    const d = await editBox('아이템 추가 — 이름만 필수, 나머지는 비워도 됩니다.', { name: '', meaning: '', holder: '', status: '' }, [{ k: 'name', label: '이름', half: true }, { k: 'holder', label: '소유자', half: true }, { k: 'meaning', label: '의미' }, { k: 'status', label: '상태' }]);
    if (!d) return; const name = cut(d.name, 60); if (!name) return toast('이름이 비어 있습니다.', 'err');
    const old = mem.items.find(x => String(x.name).toLowerCase() === name.toLowerCase()), rec = { name, meaning: cut(d.meaning, 160), holder: cut(d.holder, 160), status: cut(d.status, 160), manual: true };   // 수기 항목은 스와이프 롤백에서 보호
    if (old) Object.assign(old, rec, { updated: T }); else mem.items.push({ id: uid(), ...rec, turn: T });
    await M.save(mem); st.draw(); toast(`아이템 "${cut(name, 40)}"을(를) 추가했습니다.`, 'ok');
  };
  const itemSec = <Sec title="아이템 도감" desc="스토리에 의미 있는 물건들. 소유자와 상태가 자동으로 갱신됩니다." tools={<Btn label="추가" ic="plus" cls="ghost" title="아이템 추가" onClick={() => void addItem()} />}>
    <div className="mm-rows">{[...mem.items].sort((a, b) => (b.updated ?? b.turn ?? 0) - (a.updated ?? a.turn ?? 0)).map((it: Item) => row(it.id, it.disabled ? 'off' : '', <><b>{it.name}</b>{it.holder ? <small>{` (${it.holder})`}</small> : null}{it.meaning ? ` — ${it.meaning}` : null}{it.status ? <small>{` [${it.status}]`}</small> : null}</>, tog(it, 'disabled', '주입에서 제외', '주입에 포함'), <Del st={st} arr="items" x={it} what="이 아이템" />))}
      {!mem.items.length ? <None text={cfg.items ? '아직 기록된 아이템이 없습니다. 스토리에 중요한 물건이 등장하면 자동 기록됩니다.' : '설정 탭에서 "아이템 도감"을 켜면 중요한 물건이 자동 기록됩니다.'} /> : null}</div>
  </Sec>;

  // ── 서약
  const editPledge = async (p?: Pledge) => {
    const d = await editBox<{ kind: string; summary: string; priority: number | string }>(p ? '서약 수정' : '서약 추가', p ? { kind: p.kind, summary: p.summary, priority: p.priority || 2 } : { kind: 'loose_end', summary: '', priority: 2 }, pledgeDefs); if (!d) return;
    const summary = cut(d.summary, 200); if (!summary) return toast('내용이 비어 있습니다.', 'err'); const rec = { kind: d.kind, summary, priority: +d.priority || 2 };
    if (p) Object.assign(p, rec, { manual: true }); else mem.pledges.push({ id: 'p' + (mem.pledges.reduce((a, x) => Math.max(a, +String(x.id).replace(/\D/g, '') || 0), 0) + 1), ...rec, status: 'active', owner: null as unknown as undefined, manual: true, turn: T, createdTurn: T });   // 수기 서약은 스와이프 롤백에서 보호
    await M.save(mem); st.draw(); if (!p) toast('서약을 추가했습니다.', 'ok');
  };
  const flip = async (p: Pledge) => {
    p.status = p.status === 'active' ? 'resolved' : 'active';
    if (p.status === 'active') { p.turn = T; p.resolvedTurn = null; p.resolvedBy = null as unknown as undefined; p.resolution = null; p.sleptTurn = null; }   // 깨운 떡밥은 방금 다뤄진 것으로 친다 — 곧바로 다시 잠들지 않게
    p.suggestResolved = false; p.suggestTurn = null; p.suggestBy = null as unknown as undefined;   // 직접 결정했으니 사서 의견은 정리
    await M.save(mem); st.draw();
  };
  const rank = (p: Pledge) => p.status === 'resolved' ? 2 : p.status === 'dormant' ? 1 : 0;
  const pledgeSec = <Sec title="서약" desc="비밀·미해결 떡밥·건너뛰면 안 되는 전개 등, 이야기가 지켜야 할 약속. 토큰이 부족해도 가장 마지막까지 유지됩니다." tools={<Btn label="추가" ic="plus" cls="ghost" title="서약 추가" onClick={() => void editPledge()} />}>
    <div className="mm-rows">{[...mem.pledges].sort((a, b) => rank(a) - rank(b) || (a.priority || 2) - (b.priority || 2)).map(p => row(p.id, p.status === 'resolved' ? 'done' : p.status === 'dormant' ? 'mm-dormant' : '', <><em className={`mm-lock l-${safe(p.kind)}`}>{LOCK_KO[p.kind] || p.kind}</em>
      {p.status === 'dormant' ? <em className="mm-tag dash" title="오래 진전이 없어 주입에서 뺐습니다. 다시 언급되면 깨어납니다">휴면</em> : null} <span className="mm-pledge-text">{p.summary}</span><small>{` (P${p.priority || 2}${p.turn != null ? ` · t${p.turn + 1}` : ''}${p.manual ? ' · 수기' : ''})`}</small>
      {p.resolution && p.status === 'resolved' ? <small className="mm-resolution" title="해소 경위">{` — ${p.resolution}`}</small> : null}
      {p.suggestResolved && p.status === 'active' ? <em className="mm-suggest" title="사서가 이야기 속에서 해소됐다고 판단한 수기 서약입니다. 동의하면 체크로 확정하세요."><Ico name="bell" size={12} />해소된 듯 — 체크로 확정</em> : null}</>,
      <Ib name={p.status === 'active' ? 'check' : 'refresh'} title={p.status === 'active' ? '해결됨으로 표시' : p.status === 'dormant' ? '깨우기 — 다시 활성화' : '다시 활성화'} onClick={() => flip(p)} />, <Ib name="edit" title="편집" onClick={() => editPledge(p)} />, <Del st={st} arr="pledges" x={p} what="이 서약" />))}
      {!mem.pledges.length ? <None text="기록된 서약이 없습니다." /> : null}</div>
  </Sec>;

  // ── 캐논 (세계 설정)
  const canonDefs: FormDefs = [{ k: 'key', label: '키 (snake_case)', half: true }, { k: 'scope', label: '범위', type: 'select', opts: SCOPES, half: true }, { k: 'value', label: '내용', type: 'area', rows: 2 }];
  const editCanon = async (c?: CanonRow) => { const d = await editBox<Partial<CanonRow>>(c ? '캐논 수정' : '캐논 추가', c || { scope: 'world', key: '', value: '' }, canonDefs); if (!d?.key?.trim() || !d.value?.trim()) return; d.key = d.key.trim().toLowerCase().replace(/[\s-]+/g, '_'); if (c) Object.assign(c, d, { manual: true }); else mem.canon.push({ id: uid(), ...d, prev: null, manual: true, turn: T } as CanonRow); await M.save(mem); st.draw(); };
  const canonSec = <Sec title="캐논 (세계 설정)" desc="세계관의 지속적 사실. 같은 키가 다시 기록되면 덮어씁니다." tools={<Btn label="추가" ic="plus" cls="ghost" title="캐논 추가" onClick={() => void editCanon()} />}>
    <div className="mm-rows">{mem.canon.map(c => row(c.id, '', <><b>{c.key}</b> = {c.value}<small>{` (${c.scope}${c.scopeName ? ':' + c.scopeName : ''}${c.turn != null ? ` · t${c.turn + 1}` : ''})`}</small></>, <Ib name="edit" title="편집" onClick={() => editCanon(c)} />, <Del st={st} arr="canon" x={c} what="이 캐논" />))}{!mem.canon.length ? <None text="기록된 캐논이 없습니다." /> : null}</div>
  </Sec>;

  // ── 상태 보드
  const editStatus = async (s?: StatusRow) => { const d = await editBox<Partial<StatusRow>>(s ? '상태 수정' : '상태 추가', s || { entity: '', slot: '', value: '', claim: 'objective', owner: '' }, stDefs); if (!d?.entity?.trim() || !d.slot?.trim()) return; d.slot = d.slot.trim().toLowerCase().replace(/[\s-]+/g, '_'); if (s) { if (s.value !== d.value) d.prev = s.value; Object.assign(s, d, { manual: true, turn: T }); } else mem.status.push({ id: uid(), ...d, prev: null, manual: true, turn: T } as StatusRow); await M.save(mem); st.draw(); };
  const groups = new Map<string, StatusRow[]>(); for (const s of mem.status) { const k = s.entity; if (!groups.has(k)) groups.set(k, []); groups.get(k)!.push(s); }
  const statusSec = <Sec title="상태 보드" desc="인물·사물·장면의 현재 값(위치, 복장, 부상, 목표…). 슬롯별 최신 값만 유지됩니다." tools={<Btn label="추가" ic="plus" cls="ghost" title="상태 추가" onClick={() => void editStatus()} />}><SceneLine m={mem} />
    <div className="mm-board">{[...groups].sort((a, b) => (isScene(a[0]) ? -1 : 0) - (isScene(b[0]) ? -1 : 0)).map(([name, rows], gi) => <div key={gi} className="mm-entity"><h4>{isScene(name) ? '장면' : name}</h4>
      {rows.map(s => <div key={s.id} className={`mm-slot${s.claim === 'belief' ? ' belief' : ''}`} title={`${s.claim === 'belief' ? `믿음${s.owner ? ':' + s.owner : ''}` : '객관'}${s.turn != null ? ` · t${s.turn + 1}` : ''}`}><span className="mm-slot-k">{s.slot}</span><span className="mm-slot-v">{s.value}{s.prev != null ? <s title="이전 값">{String(s.prev)}</s> : null}{s.claim === 'belief' ? <em className="mm-tag dash">{`믿음${s.owner ? ':' + s.owner : ''}`}</em> : null}</span><span className="mm-actions"><Ib name="edit" title="편집" onClick={() => editStatus(s)} /><Del st={st} arr="status" x={s} what="이 상태" /></span></div>)}</div>)}</div>
    {!mem.status.length ? <None text="기록된 개체 상태가 없습니다." /> : null}
  </Sec>;

  // ── 자료실
  const chars = M.dossierChars(mem), over = (n: number) => chars + n > DOSSIER_MAX && (toast(`자료실 용량 초과 — 전체 ${DOSSIER_MAX.toLocaleString()}자까지 담을 수 있습니다.`, 'err'), true);
  const putDoc = async (title: string, text: string) => { const chunks = chunkDossier(text); if (!chunks.length) return toast('내용이 비어 있습니다.', 'err'); mem.dossier.push({ id: uid(), title: cut(title, 80), chunks, addedAt: now(), disabled: false }); await M.save(mem); st.draw(); toast(`"${cut(title, 40)}" — ${chunks.length}개 대목으로 등록했습니다.`, 'ok'); };
  const addDoc = async () => { const d = await editBox('문서 추가', { title: '', text: '' }, [{ k: 'title', label: '문서 이름', ph: '예: 원작 1권 요약, 세계관 설정집' }, { k: 'text', label: '문서 내용', type: 'area', rows: 14, hint: '문단 단위로 나뉘어 저장되고, 매 턴 관련 대목만 주입됩니다.' }], { wide: true, okLabel: '추가' }); if (!d?.title?.trim() || !d.text?.trim() || over(d.text.length)) return; await putDoc(d.title, d.text); };
  const addFile = async () => { const [f] = await pickFiles({ accept: '.txt,.md,text/plain' }); if (!f) return; const text = await f.text(); if (over(text.length)) return; await putDoc(f.name.replace(/\.[^.]+$/, ''), text); };
  const showDoc = (d: DossierDoc) => openModal({ title: d.title, wide: true, body: <div className="mm-review-list">{d.chunks.map((c, i) => <article key={i} className="mm-diff"><header><b>{`대목 ${i + 1}`}</b></header><div className="mm-after">{c}</div></article>)}</div> });
  const dossierSec = <Sec title="자료실" desc="원작 소설·설정 문서를 붙여넣어 두면, 매 턴 지금 장면과 관련된 대목만 골라 배경 참고로 주입합니다. 채팅에서 확정된 사실이 항상 우선하며, 토큰 예산이 부족하면 가장 먼저 줄어듭니다." tools={<><Btn label="추가" ic="plus" cls="ghost" title="문서 추가" onClick={() => void addDoc()} /><Btn label="파일" ic="upload" cls="ghost" title="글 파일에서 문서 추가" onClick={() => void addFile()} /></>}>
    <div className="mm-rows">{mem.dossier.map(d => row(d.id, d.disabled ? 'off' : '', <><b>{d.title}</b><small>{` (${d.chunks.length}개 대목 · ${d.chunks.reduce((n, c) => n + c.length, 0).toLocaleString()}자)`}</small></>, <Ib name="note" title="대목 보기" onClick={() => showDoc(d)} />, tog(d, 'disabled', '주입에서 제외', '주입에 포함'), <Del st={st} arr="dossier" x={d} what="이 문서" />))}
      {!mem.dossier.length ? <None text={'등록된 문서가 없습니다. "추가"로 원작·설정 자료를 붙여넣으면 관련 대목만 골라 배경 참고로 주입됩니다.'} /> : null}</div>{chars ? <div className="mm-budget"><span className="mm-tok">{`${chars.toLocaleString()} / ${DOSSIER_MAX.toLocaleString()}자`}</span><Meter v={chars} max={DOSSIER_MAX} cls="big" /></div> : null}
  </Sec>;
  return <div className="mm-view">{castSec}{bondSec}{itemSec}{pledgeSec}{canonSec}{statusSec}{dossierSec}</div>;
}
