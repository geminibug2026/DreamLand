// 장기기억 — 세계 탭: 인물 도감 · 관계선 · 아이템 도감 · 서약 · 캐논 · 상태 보드 · 자료실 (옛 memoria-views.js 의 vWorld)
import { Children, type KeyboardEvent, type MouseEvent, type ReactNode } from 'react';
import { Btn } from '../../kit';
import { confirmBox, openModal, type FormDefs, toast } from '../../ui';
import { bondMapSvg } from '../story';
import type { Bond, BondStep, CanonRow, CastCard, CastNote, DossierDoc, Item, Pledge, StatusRow } from '../types';
import type { RecordClaim } from '../engine/part5';
import { pledgeHeldBack, type ConflictWhy } from '../craft';
import { dueLabel, storyDays } from '../stage';
import { Chip, Del, Ib, Ico, Meter, None, SceneLine, Sec, editBox, mergeCast, safe, type StOpen, Revive } from './parts';
import { GROWTH_MAX, Gi, HAND, LINES_MAX, Mx, bondNow, bondViewRows, cut, storyState } from './viewsShared';
import * as memMod from '../../lib/memory';
import { Memory } from '../../lib/memory';
import * as core from '../../lib/core';
import { t } from '../../i18n';
import { Tr } from './ReaderView';
import { TrackerSec } from './Trackers';
import { conflictsOf, useStaged, useWindow } from './parts';

/** 인물 편집 — 칸과 상한.
 *  달라진 점 · 남긴 말은 문구가 그대로면 원래 적힌 턴을 지키고, 새로 적은 것은 직접 적음으로 둔다 — 직접 적은 남긴 말은 고정이라 밀려나지 않는다. */
export async function editCard(st: StOpen, c?: CastCard) {
  const mem = st.mem, M = Mx(), T = mem.turns.length, src: Partial<CastCard> = c || { name: '', role: '', age: '', occupation: '', appearance: '', voice: '', core: '' };
  const draft = { name: src.name || '', aka: [...(src.aka || [])], role: src.role || '', age: src.age || '', occupation: src.occupation || '', appearance: src.appearance || '', voice: src.voice || '', core: src.core || '', traits: [...(src.traits || [])],
    rel: (src.relationships || []).map(r => `${r.target} = ${r.relation}`), growthTexts: (src.growth || []).map(g => g.text), lineTexts: (src.lines || []).map(l => l.text), provisional: !!src.provisional };
  const d = await editBox(c ? t('memoria.world.cast.editTitle', { name: c.name }) : t('memoria.world.cast.add'), draft, [
    { k: 'name', label: t('memoria.world.cast.f.name'), half: true }, { k: 'aka', label: t('memoria.world.cast.f.aka'), type: 'tags', half: true }, { k: 'role', label: t('memoria.world.cast.f.role'), third: true }, { k: 'age', label: t('memoria.world.cast.f.age'), third: true }, { k: 'occupation', label: t('memoria.world.cast.f.occupation'), third: true },
    { k: 'appearance', label: t('memoria.world.cast.f.appearance'), type: 'area', rows: 2 }, { k: 'voice', label: t('memoria.world.cast.f.voice'), type: 'area', rows: 2 },
    { k: 'core', label: t('memoria.world.cast.f.core'), type: 'area', rows: 3, hint: t('memoria.world.cast.f.coreHint') }, { k: 'traits', label: t('memoria.world.cast.f.traits'), type: 'tags' },
    { k: 'rel', label: t('memoria.world.cast.f.rel'), type: 'lines', ph: t('memoria.world.cast.f.relPh') },
    { k: 'growthTexts', label: t('memoria.world.cast.f.growth', { n: GROWTH_MAX }), type: 'lines', ph: t('memoria.world.cast.f.growthPh') },
    { k: 'lineTexts', label: t('memoria.world.cast.f.lines', { n: LINES_MAX }), type: 'lines', ph: t('memoria.world.cast.f.linesPh'), hint: t('memoria.world.cast.f.linesHint') },
    { k: 'provisional', label: t('memoria.world.cast.f.provisional'), type: 'check' }], { wide: true });
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
  else { mem.cast.push({ id: core.uid(), ...prof, growth, lines, coreTurn: null, manual: true, first: T, updated: T }); toast(t('memoria.world.cast.added'), 'ok'); }
  const folded = M.foldAliases(mem);   // 별칭을 손봤다면 그 이름으로 갈라져 있던 상태 · 기억도 바로 이 카드로 접는다
  await M.save(mem); st.draw();
  if (folded.states || folded.memories) toast(t('memoria.world.cast.folded', { states: folded.states, memories: folded.memories }), 'ok');
  if (c && c.locked && !wasLocked) toast(t('memoria.world.cast.lockedAuto', { name: c.name }));
}
/** 관계선 추가 · 지금 단계 고치기 — 방향(누가 → 누구에게)은 줄의 정체라 고칠 때는 바꾸지 않는다 */
export async function editBond(st: StOpen, b?: Bond) {
  const mem = st.mem, M = Mx(), cur = b ? bondNow(b) : null, names = mem.cast.map(c => c.name).join(', ');
  const d = await editBox(b ? t('memoria.world.bond.editTitle', { from: b.from, to: b.to }) : t('memoria.world.bond.addTitle'),
    { from: b?.from || '', to: b?.to || '', stage: cur?.stage || '', basis: cur?.basis || '', calls: cur?.calls || '', unsaid: cur?.unsaid || '' }, [
      !b && { k: 'from', label: t('memoria.world.bond.f.from'), half: true, ph: names }, !b && { k: 'to', label: t('memoria.world.bond.f.to'), half: true, ph: names },
      { k: 'stage', label: t('memoria.world.bond.f.stage') }, { k: 'basis', label: t('memoria.world.bond.f.basis') }, { k: 'calls', label: t('memoria.world.bond.calls'), half: true }, { k: 'unsaid', label: t('memoria.world.bond.unsaid'), half: true }], { wide: true });
  if (!d) return;
  const f = { from: b ? b.from : cut(d.from, 60), to: b ? b.to : cut(d.to, 60), stage: cut(d.stage, 120), basis: cut(d.basis, 200), calls: cut(d.calls, 100), unsaid: cut(d.unsaid, 160) };
  if (!f.from || !f.to || !f.stage) return toast(t('memoria.world.bond.required'), 'err');
  try {
    if (!Array.isArray(mem.bonds)) mem.bonds = [];
    const row = M.upsertBond(mem, f, mem.turns.length, { manual: true });
    if (!row) return toast(t('memoria.world.bond.self'), 'err');
    row.disabled = false; await M.save(mem); st.draw();
  } catch (e) { console.error(e); toast((e as Error).message || String(e), 'err'); }
}

const pledgeDefs = (): FormDefs => [{ k: 'kind', label: t('memoria.world.pledge.f.kind'), type: 'select', opts: [['loose_end', t('memoria.world.pledge.k.loose_end')], ['keep_unresolved', t('memoria.world.pledge.k.keep_unresolved')], ['keep_secret', t('memoria.world.pledge.k.keep_secret')], ['knowledge_gap', t('memoria.world.pledge.k.knowledge_gap')], ['consent', t('memoria.world.pledge.k.consent')], ['world_limit', t('memoria.world.pledge.k.world_limit')], ['foreshadow', t('memoria.world.pledge.k.foreshadow')], ['feeling', t('memoria.world.pledge.k.feeling')], ['author_plan', t('memoria.world.pledge.k.author_plan')]] },
  { k: 'summary', label: t('memoria.world.content'), type: 'area', rows: 3, ph: t('memoria.world.pledge.f.summaryPh') }, { k: 'priority', label: t('memoria.world.pledge.f.priority'), type: 'select', opts: [[1, t('memoria.world.pledge.p1')], [2, t('memoria.world.pledge.p2')], [3, t('memoria.world.pledge.p3')]] }];
const stDefs = (): FormDefs => [{ k: 'entity', label: t('memoria.world.status.f.entity'), half: true }, { k: 'slot', label: t('memoria.world.status.f.slot'), half: true, ph: 'location · outfit · condition · mood · activity …' }, { k: 'value', label: t('memoria.world.status.f.value'), type: 'area', rows: 2 }, { k: 'claim', label: t('memoria.world.status.f.claim'), type: 'select', opts: [['objective', t('memoria.world.status.objective')], ['belief', t('memoria.world.status.beliefOpt')]], half: true }, { k: 'owner', label: t('memoria.world.status.f.owner'), half: true }];
/** 서약 추가 · 고치기 — 세계 탭과 인물 보기가 함께 쓴다.
 *  기한은 "지금부터 작중 며칠 뒤"로 받는다 — 이미 있는 기한은 지금 남은 날로 보여 준다 (비우면 기한 없음) */
export async function editPledgeBox(st: StOpen, p?: Pledge) {
  const mem = st.mem, M = Mx(), cfg = M.cfg(), T = mem.turns.length;
  const leftDays = (p?: Pledge) => { if (!p?.due) return ''; const at = storyDays(mem.turns.map(x => x.days)), now = at.length ? at[at.length - 1] : 0, start = p.due.turn >= 0 && p.due.turn < at.length ? at[p.due.turn] : p.due.turn < 0 ? 0 : now; return String(Math.max(0, Math.round((start + p.due.in - now) * 10) / 10)); };
    const defs = [...pledgeDefs(), ...(cfg.dueDates !== false && cfg.storyClock !== false ? [{ k: 'dueIn', label: t('memoria.world.pledge.f.due'), half: true, ph: t('memoria.world.pledge.f.duePh') }] : [])];
    // 풀리지 않은 감정의 원인 · 풀리려면 필요한 것, 작가 계획의 가린 줄 (그 종류일 때만 쓰인다)
    defs.push({ k: 'cause', label: t('memoria.world.pledge.f.cause'), half: true, hint: t('memoria.world.pledge.f.feelingHint') }, { k: 'needs', label: t('memoria.world.pledge.f.needs'), half: true }, { k: 'veil', label: t('memoria.world.pledge.f.veil'), hint: t('memoria.world.pledge.f.veilHint') });
    const d = await editBox<{ kind: string; summary: string; priority: number | string; dueIn: string; cause: string; needs: string; veil: string }>(p ? t('memoria.world.pledge.edit') : t('memoria.world.pledge.add'), p ? { kind: p.kind, summary: p.summary, priority: p.priority || 2, dueIn: leftDays(p), cause: p.cause || '', needs: p.needs || '', veil: p.veil || '' } : { kind: 'loose_end', summary: '', priority: 2, dueIn: '', cause: '', needs: '', veil: '' }, defs); if (!d) return;
    const beforeSummary = p?.summary || '', summary = cut(d.summary, 200); if (!summary) return toast(t('memoria.world.contentEmpty'), 'err'); const rec = { kind: d.kind, summary, priority: +d.priority || 2 };
    const dueIn = Number(String(d.dueIn ?? '').replace(',', '.').trim()), before = leftDays(p);
    if (p) Object.assign(p, rec, { manual: true }); else mem.pledges.push({ id: 'p' + (mem.pledges.reduce((a, x) => Math.max(a, +String(x.id).replace(/\D/g, '') || 0), 0) + 1), ...rec, status: 'active', owner: null as unknown as undefined, manual: true, turn: T, createdTurn: T });   // 수기 서약은 스와이프 롤백에서 보호
    const row = p || mem.pledges[mem.pledges.length - 1];
    if (row.kind === 'feeling') { row.cause = cut(d.cause, 160); row.needs = cut(d.needs, 160); }
    if (row.kind === 'author_plan') { if (row.veil && summary !== (p ? beforeSummary : summary)) delete row.veil; const r = Memory.setVeil(mem, row.id, String(d.veil || '')); if (r.leak) toast(t('memoria.world.pledge.veilLeak'), 'err'); } else delete row.veil;
    if (String(d.dueIn ?? '').trim() !== before) row.due = String(d.dueIn ?? '').trim() && Number.isFinite(dueIn) && dueIn >= 0 ? { turn: T - 1, in: Math.max(1 / 24, dueIn) } : null;   // 직접 정한 기한은 답변에 묶이지 않는다 (스와이프로 사라지지 않게)
    await M.save(mem); st.draw(); if (!p) toast(t('memoria.world.pledge.added'), 'ok');
}
/** 상태 줄 추가 · 고치기 — 세계 탭과 인물 보기가 함께 쓴다. seed: 새 줄에 미리 채울 칸 (누구의 상태인지 등) */
export async function editStatusBox(st: StOpen, s?: StatusRow, seed?: Partial<StatusRow>) {
  const mem = st.mem, M = Mx(), T = mem.turns.length;
  const d = await editBox<Partial<StatusRow>>(s ? t('memoria.world.status.edit') : t('memoria.world.status.add'), s || { entity: '', slot: '', value: '', claim: 'objective', owner: '', ...seed }, stDefs()); if (!d?.entity?.trim() || !d.slot?.trim()) return; d.slot = d.slot.trim().toLowerCase().replace(/[\s-]+/g, '_'); if (s) { if (s.value !== d.value) d.prev = s.value; Object.assign(s, d, { manual: true, turn: T }); delete s.expired; } else mem.status.push({ id: core.uid(), ...d, prev: null, manual: true, turn: T } as StatusRow); await M.save(mem); st.draw();
}
/** 물건 추가 — 같은 이름이 있으면 그 줄을 고친다. 세계 탭과 인물 보기가 함께 쓴다 (seed: 미리 채울 칸) */
export async function editItemBox(st: StOpen, seed?: Partial<Item>) {
  const mem = st.mem, M = Mx(), T = mem.turns.length;
    const d = await editBox(t('memoria.world.item.addTitle'), { name: seed?.name || '', meaning: seed?.meaning || '', holder: seed?.holder || '', status: seed?.status || '' }, [{ k: 'name', label: t('memoria.world.cast.f.name'), half: true }, { k: 'holder', label: t('memoria.world.item.f.holder'), half: true }, { k: 'meaning', label: t('memoria.world.item.f.meaning') }, { k: 'status', label: t('memoria.world.item.f.status') }]);
    if (!d) return; const name = cut(d.name, 60); if (!name) return toast(t('memoria.world.item.nameEmpty'), 'err');
    const old = mem.items.find(x => String(x.name).toLowerCase() === name.toLowerCase()), rec = { name, meaning: cut(d.meaning, 160), holder: cut(d.holder, 160), status: cut(d.status, 160), manual: true };   // 수기 항목은 스와이프 롤백에서 보호
    if (old) { Object.assign(old, rec, { updated: T }); delete old.dormant; } else mem.items.push({ id: core.uid(), ...rec, turn: T });
    await M.save(mem); st.draw(); toast(t('memoria.world.item.added', { name: cut(name, 40) }), 'ok');
}
const isScene = (n: unknown) => String(n).toLowerCase() === 'scene';
/** 기한 꼬리표 (화면용) — 남은 날 · 오늘 · 지난 날 */
function dueText(mem: { turns: { days?: number }[] }, p: Pledge): string {
  const d = p.due; if (!d || !(d.in > 0)) return '';
  const at = storyDays(mem.turns.map(x => x.days)), now = at.length ? at[at.length - 1] : 0, start = d.turn >= 0 && d.turn < at.length ? at[d.turn] : d.turn < 0 ? 0 : now, left = start + d.in - now;
  if (!dueLabel(left)) return '';
  return left > 0.75 ? t('memoria.world.pledge.dueLeft', { n: Math.max(1, Math.round(left)) }) : left >= -0.5 ? t('memoria.world.pledge.dueToday') : t('memoria.world.pledge.dueOver', { n: Math.max(1, Math.round(-left)) });
}
const WHY_LABEL = (w: ConflictWhy) => ({ age: t('memoria.world.conflict.why.age'), height: t('memoria.world.conflict.why.height'), weight: t('memoria.world.conflict.why.weight'), negation: t('memoria.world.conflict.why.negation') })[w] || '';
function claimLabel(c: RecordClaim): string {
  if (c.src === 'status') return t('memoria.world.conflict.src.status', { name: c.name, field: c.field });
  if (c.src === 'canon') return t('memoria.world.conflict.src.canon', { key: c.name });
  if (c.src === 'cast') return t('memoria.world.conflict.src.cast', { name: c.name, field: ({ age: t('memoria.world.cast.f.age'), appearance: t('memoria.world.cast.f.appearance'), occupation: t('memoria.world.cast.f.occupation') } as Record<string, string>)[c.field] || c.field });
  return t('memoria.world.conflict.src.memory', { kind: c.field === 'preference' ? t('memoria.kindName.preference') : t('memoria.kindName.fact') });
}
const pline = (ic: ReactNode, title: string, ...body: ReactNode[]) => <p className="mm-pline" title={title}>{ic}<span>{Children.toArray(body)}</span></p>;
const row = (key: string, cls: string, text: ReactNode, ...tools: ReactNode[]) => <div key={key} className={`mm-row${cls ? ' ' + cls : ''}`}><div className="mm-row-text">{text}</div>{Children.toArray(tools)}</div>;

export function World({ st }: { st: StOpen }) {
  const { LOCKS, SCOPES, DOSSIER_MAX, chunkDossier } = memMod, { uid, now, pickFiles } = core, M = Mx();
  const LOCK_KO: Record<string, string> = { ...LOCKS, foreshadow: LOCKS.foreshadow || t('memoria.world.pledge.foreshadow') };
  const mem = st.mem, cfg = M.cfg(), T = mem.turns.length, bonds = mem.bonds || [], Mc = M as typeof M & { currentConflicts(m: typeof mem): { a: RecordClaim; b: RecordClaim; why: ConflictWhy; pair: string }[]; dropClaim(m: typeof mem, key: string): boolean };
  type Flag = 'locked' | 'disabled';
  function tog<X extends { locked?: boolean; disabled?: boolean }>(x: X, key: Flag, onT: string, offT: string, onI = 'eye', offI = 'eyeoff', after?: (x: X) => void) {
    return <Ib name={x[key] ? offI : onI} title={x[key] ? offT : onT} onClick={async () => { x[key] = !x[key]; await M.save(mem); st.draw(); after?.(x); }} cls={x[key] && key === 'locked' ? 'on' : ''} />;
  }

  // ── 인물 도감
  const cast = [...mem.cast].sort((a, b) => (b.updated || 0) - (a.updated || 0));
  // 긴 선반은 보이는 만큼만 그리고 내려가면 잇는다 · 아래쪽 구역은 첫 구역이 뜬 뒤에 잇는다 (인물 수십 명 · 상태 수백 줄을 한 번에 그리느라 탭이 1초 넘게 걸렸다)
  const stage = useStaged(st, 'world', 3), [castN, castMore] = useWindow(st, 'w-cast', cast.length, 4), [bondN, bondMore] = useWindow(st, 'w-bond', bonds.length, 12), [pledgeN, pledgeMore] = useWindow(st, 'w-pledge', mem.pledges.length, 20), [canonN, canonMore] = useWindow(st, 'w-canon', mem.canon.length, 24);
  const dropLine = async (c: CastCard, l: CastNote) => { if (!(await confirmBox(t('memoria.world.cast.dropLine', { text: cut(l.text, 40) }), t('memoria.world.cast.dropOk'), true))) return; c.lines = (c.lines || []).filter(x => x !== l); await M.save(mem); st.draw(); };
  const castSec = <Sec title={t('memoria.world.cast.title')} desc={<>{t('memoria.world.cast.desc1')}<b>{t('memoria.world.cast.f.core')}</b>(<Gi name="anchor" size={12} />){t('memoria.world.cast.desc2')}(<Gi name="sprout" size={12} />){t('memoria.world.cast.desc3')}(<Gi name="quote" size={12} />){t('memoria.world.cast.desc4')}</>} tools={<Btn label={t('common.add')} ic="plus" title={t('memoria.world.cast.add')} onClick={() => void editCard(st)} />}>
    <div className="mm-cast">{cast.slice(0, castN).map(c => <article key={c.id} className={`mm-person${c.disabled ? ' off' : ''}${c.locked ? ' locked' : ''}`}>
      <header><i className="mm-initial">{(c.name || '?').trim().slice(0, 1)}</i><div className="mm-person-name"><b>{c.name}</b><small>{[c.role, c.age, c.occupation].filter(Boolean).join(' · ')}</small></div>
        {c.provisional ? <em className="mm-tag dash" title={t('memoria.world.cast.provisionalTitle')}>{t('memoria.world.cast.provisional')}</em> : null}{c.locked ? <em className="mm-tag" title={t('memoria.world.cast.lockedTitle')}>{t('memoria.world.cast.locked')}</em> : null}</header>
      {(c.aka || []).length ? <p className="mm-meta">{t('memoria.world.cast.aka', { names: c.aka!.join(', ') })}</p> : null}{c.appearance ? <p><Tr>{c.appearance}</Tr></p> : null}
      {c.core ? pline(<Gi name="anchor" size={13} />, t('memoria.world.cast.coreTitle'), <Tr>{c.core}</Tr>) : null}
      {c.voice ? <p className="mm-voice" title={t('memoria.world.cast.f.voice')}><Ico name="chat" size={13} /><Tr>{c.voice}</Tr></p> : null}
      {(c.growth || []).length ? pline(<Gi name="sprout" size={13} />, t('memoria.world.cast.growthTitle'), <Tr>{c.growth!.map(g => g.text).join(' · ')}</Tr>) : null}
      {(c.lines || []).length ? <div className="mm-pline mm-said" title={t('memoria.world.cast.linesTitle')}><Gi name="quote" size={13} /><span>{c.lines!.map((l, i) => <span key={i} className="mm-line"><q className={l.pinned ? 'pin' : undefined} title={(l.pinned ? t('memoria.world.cast.pinnedLine') : l.msgId != null && l.turn != null ? `t${l.turn + 1}` : '') || undefined}>{l.text}</q>{'\u2060'}<button type="button" title={t('memoria.world.cast.dropLineBtn')} aria-label={t('memoria.world.cast.dropLineBtn')} onClick={() => void dropLine(c, l)}>×</button></span>)}</span></div> : null}
      {(c.traits || []).length ? <div className="mm-chips">{c.traits!.map((t, i) => <Chip key={i} text={t} />)}</div> : null}{(c.relationships || []).length ? <div className="mm-chips">{c.relationships!.map((r, i) => <span key={i} className="mm-chip rel"><Ico name="link" size={12} />{`${r.target}: ${r.relation}`}</span>)}</div> : null}
      <footer>{tog(c, 'locked', t('memoria.world.cast.lockOn'), t('memoria.world.cast.lockOff'), 'unlock', 'lock', x => toast(x.locked ? t('memoria.world.cast.lockedToast', { name: x.name }) : t('memoria.world.cast.unlockedToast', { name: x.name })))}
        {tog(c, 'disabled', t('memoria.world.cast.exclude'), t('memoria.world.include'))}<Ib name="merge" title={t('memoria.world.cast.merge')} onClick={() => mergeCast(st, c)} /><Ib name="edit" title={t('common.edit')} onClick={() => editCard(st, c)} /><Del st={st} arr="cast" x={c} what={t('memoria.world.cast.what', { name: c.name })} /></footer>
    </article>)}{castMore}
      {!cast.length ? <None text={cfg.cast === false ? t('memoria.world.cast.emptyOff') : t('memoria.world.cast.empty')} /> : null}</div>
  </Sec>;

  // ── 관계선
  const svg = bondMapSvg(bondViewRows(mem));
  // 작은 관계도에서 화살표를 누르면 이야기 탭의 관계 보기로
  const toStory = (e: MouseEvent | KeyboardEvent) => { const g = (e.target as Element).closest?.<HTMLElement>('.mm-bond-edge'); if (!g) return; const v = storyState(st); v.tab = 'bonds'; v.bond = g.dataset.id || ''; st.tab = 'summaries'; st.draw(); };
  const bondSec = <Sec title={t('memoria.world.bond.title')} desc={t('memoria.world.bond.desc')} tools={<Btn label={t('common.add')} ic="plus" title={t('memoria.world.bond.add')} onClick={() => void editBond(st)} />}>
    {svg ? <div className="mm-bond-mapwrap" dangerouslySetInnerHTML={{ __html: svg }} onClick={toStory} onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') toStory(e); }} /> : null}
    <div className="mm-bond-rows">{[...bonds].sort((a, b) => (bondNow(b)?.turn || 0) - (bondNow(a)?.turn || 0)).slice(0, bondN).map(b => {
      const cur: Partial<BondStep> = bondNow(b) || {}, path: string[] = []; for (const e of b.log || []) if (path[path.length - 1] !== e.stage) path.push(e.stage);
      return <article key={b.id} className={`mm-bond-row${b.disabled ? ' off' : ''}`}>
        <header><b>{b.from}<span className="mm-bond-arrow">→</span>{b.to}</b><em className="mm-bond-stage"><Tr>{cur.stage || ''}</Tr></em><span className="mm-actions">{tog(b, 'disabled', t('memoria.world.bond.exclude'), t('memoria.world.include'))}<Ib name="edit" title={t('memoria.world.bond.editStage')} onClick={() => editBond(st, b)} /><Del st={st} arr="bonds" x={b} what={t('memoria.world.bond.what', { from: b.from, to: b.to })} /></span></header>
        {cur.basis ? pline(<Ico name="search" size={13} />, t('memoria.world.bond.basis'), <Tr>{cur.basis}</Tr>) : null}{cur.calls ? pline(<Ico name="chat" size={13} />, t('memoria.world.bond.calls'), t('memoria.world.bond.callsPrefix'), cur.calls) : null}{cur.unsaid ? pline(<Ico name="more" size={13} />, t('memoria.world.bond.unsaid'), t('memoria.world.bond.unsaidPrefix'), <Tr>{cur.unsaid}</Tr>) : null}
        {path.length > 1 ? <div className="mm-chips mm-bond-path" title={t('memoria.world.bond.path')}>{path.map((p, i) => <span key={i} className="mm-bond-hop">{i ? <span className="mm-bond-arrow">→</span> : null}<span className={`mm-chip${i === path.length - 1 ? ' ent' : ''}`}>{p}</span></span>)}</div> : null}
      </article>; })}{bondMore}
      {!bonds.length ? <None text={t('memoria.world.bond.empty')} /> : null}</div>
  </Sec>;

  // ── 아이템 도감
  const addItem = () => editItemBox(st);
  const itemSec = <Sec title={t('memoria.world.item.title')} desc={t('memoria.world.item.desc')} tools={<Btn label={t('common.add')} ic="plus" cls="ghost" title={t('memoria.world.item.add')} onClick={() => void addItem()} />}>
    <div className="mm-rows">{[...mem.items].sort((a, b) => (b.updated ?? b.turn ?? 0) - (a.updated ?? a.turn ?? 0)).map((it: Item) => row(it.id, it.disabled ? 'off' : it.dormant != null ? 'mm-dormant' : '', <>{it.dormant != null ? <><Revive title={t('memoria.world.item.reviveTitle')} onClick={async () => { delete it.dormant; await M.save(mem); st.draw(); }} />{' '}</> : null}<b>{it.name}</b>{it.holder ? <small>{` (${it.holder})`}</small> : null}{it.meaning ? ` — ${it.meaning}` : null}{it.status ? <small>{` [${it.status}]`}</small> : null}</>, tog(it, 'disabled', t('memoria.world.excludeInj'), t('memoria.world.include')), <Del st={st} arr="items" x={it} what={t('memoria.world.item.what')} />))}
      {!mem.items.length ? <None text={cfg.items ? t('memoria.world.item.empty') : t('memoria.world.item.emptyOff')} /> : null}</div>
  </Sec>;

  // ── 서약
  const editPledge = (p?: Pledge) => editPledgeBox(st, p);
  const flip = async (p: Pledge) => {
    p.status = p.status === 'active' ? 'resolved' : 'active';
    if (p.status === 'active') { p.turn = T; p.resolvedTurn = null; p.resolvedBy = null as unknown as undefined; p.resolution = null; p.sleptTurn = null; delete p.outcome; }   // 깨운 떡밥은 방금 다뤄진 것으로 친다 — 곧바로 다시 잠들지 않게
    else if (p.suggestResolved) { if (p.suggestHow) p.resolution = p.suggestHow; if (p.suggestOutcome) p.outcome = p.suggestOutcome; }   // 사서가 "풀린 듯"이라며 적어 둔 경위 · 지켰는지 어겼는지가 있으면 확정할 때 그대로 남긴다
    p.suggestResolved = false; p.suggestTurn = null; p.suggestBy = null as unknown as undefined; p.suggestHow = null; p.suggestOutcome = null;   // 직접 결정했으니 사서 의견은 정리
    await M.save(mem); st.draw();
  };
  // 끝난 까닭(지킴 · 어김 · 없던 일 · 바뀜)을 눌러서 고친다 — 어긴 약속은 장부의 "Broken" 칸에 남아 그 일을 당한 사람의 태도에 배어난다
  const OUTCOMES = [undefined, 'kept', 'broken', 'dropped', 'replaced'] as const;
  const cycleOutcome = async (p: Pledge) => { const i = OUTCOMES.indexOf(p.outcome), next = OUTCOMES[(i + 1) % OUTCOMES.length]; if (next) p.outcome = next; else delete p.outcome; await M.save(mem); M.reinjectNow?.(st.chat); st.draw(); };
  // 「아직 유효」: 사서의 "해소된 듯" 의견을 물리고 다시 싣는다 — 방금 다뤄진 것으로 치고, 서약 훑기가 옛 요약만 보고 같은 의견을 다시 붙이지 않게 표시해 둔다
  const uphold = async (p: Pledge) => { p.suggestResolved = false; p.suggestTurn = null; p.suggestBy = null as unknown as undefined; p.suggestHow = null; p.suggestOutcome = null; p.upheld = true; p.turn = T; await M.save(mem); M.reinjectNow?.(st.chat); st.draw(); };
  // 서약 훑기 — 눌렀을 때 모델을 한 번 불러, 오래된 서약 가운데 지금까지의 요약이 이미 끝났다고 보여 주는 것에 "해소된 듯" 표시를 붙인다 (닫거나 지우지 않는다)
  const sweep = async () => {
    toast(t('memoria.world.pledge.sweeping'));
    try { const r = await Memory.sweepPledges(st.chat, mem); await M.save(mem); if (r.flagged) M.reinjectNow?.(st.chat); st.draw(); toast(r.checked ? t('memoria.world.pledge.sweepDone', { checked: r.checked, flagged: r.flagged }) : t('memoria.world.pledge.sweepNone'), r.flagged ? 'ok' : ''); }
    catch (e) { toast(t('memoria.world.pledge.sweepFail', { error: (e as Error).message }), 'err'); }
  };
  const rank = (p: Pledge) => p.status === 'resolved' ? 2 : p.status === 'dormant' ? 1 : 0;
  // 가린 줄이 없는 작가 계획 — 눌렀을 때만 모델을 한 번 불러 가린 줄을 받는다 (답을 흘리는 줄은 버린다)
  const bare = mem.pledges.filter(p => p.kind === 'author_plan' && p.status === 'active' && !p.veil).length;
  const makeVeils = async () => {
    try { const r = await Memory.veilPlans(st.chat, mem); await M.save(mem); st.draw(); toast(t('memoria.world.pledge.veilDone', { made: r.made, rejected: r.rejected }), r.made ? 'ok' : 'err'); }
    catch (e) { toast(t('memoria.world.pledge.veilFail', { error: (e as Error).message }), 'err'); }
  };
  const pledgeSec = <Sec title={t('memoria.world.pledge.title')} desc={t('memoria.world.pledge.desc')} tools={<>{bare ? <Btn label={t('memoria.world.pledge.veilBtn', { n: bare })} ic="sparkle" cls="ghost" title={t('memoria.world.pledge.veilBtnTitle')} onClick={() => void makeVeils()} /> : null}{mem.pledges.some(p => p.status === 'active' && p.kind !== 'author_plan') ? <Btn label={t('memoria.world.pledge.sweepBtn')} ic="search" cls="ghost" title={t('memoria.world.pledge.sweepBtnTitle')} onClick={() => void sweep()} /> : null}<Btn label={t('common.add')} ic="plus" cls="ghost" title={t('memoria.world.pledge.add')} onClick={() => void editPledge()} /></>}>
    <div className="mm-rows">{[...mem.pledges].sort((a, b) => rank(a) - rank(b) || (a.priority || 2) - (b.priority || 2)).slice(0, pledgeN).map(p => row(p.id, p.status === 'resolved' ? 'done' : p.status === 'dormant' || pledgeHeldBack(p) ? 'mm-dormant' : '', <><em className={`mm-lock l-${safe(p.kind)}`}>{LOCK_KO[p.kind] || p.kind}</em>
      {p.status === 'dormant' ? <em className="mm-tag dash" title={t('memoria.world.pledge.dormantTitle')}>{t('memoria.world.pledge.dormant')}</em> : null} <span className="mm-pledge-text"><Tr>{p.summary}</Tr></span><small>{` (P${p.priority || 2}${p.turn != null ? ` · t${p.turn + 1}` : ''}${p.manual ? t('memoria.world.pledge.manual') : ''})`}</small>
      {p.status !== 'resolved' && dueText(mem, p) ? <em className="mm-tag mm-due" title={t('memoria.world.pledge.dueTitle')}>{dueText(mem, p)}</em> : null}
      {p.kind === 'author_plan' && p.status === 'active' ? <small className="mm-lock-now" title={t('memoria.world.pledge.veilTitle')}>{` ${p.veil ? t('memoria.world.pledge.veilShown', { text: p.veil }) : t('memoria.world.pledge.veilNone')}`}</small> : null}
      {p.kind === 'feeling' && (p.cause || p.needs) ? <small className="mm-lock-now">{` ${[p.cause, p.needs].filter(Boolean).join(' → ')}`}</small> : null}
      {p.latest?.text && p.status !== 'resolved' ? <small className="mm-lock-now" title={t('memoria.world.pledge.nowTitle')}>{` ${t('memoria.world.pledge.now', { text: p.latest.text })}`}</small> : null}
      {p.status === 'resolved' ? <button type="button" className={`mm-tag mm-outcome o-${p.outcome || 'none'}`} title={t('memoria.world.pledge.outcomeTitle')} onClick={() => void cycleOutcome(p)}>{t(`memoria.world.pledge.outcome.${p.outcome || 'none'}`)}</button> : null}
      {p.resolution && p.status === 'resolved' ? <small className="mm-resolution" title={t('memoria.world.pledge.resolution')}>{` — ${p.resolution}`}</small> : null}
      {p.suggestResolved && p.status === 'active' ? <><em className="mm-suggest" title={(p.suggestHow ? t('memoria.world.pledge.suggestHowTitle', { how: p.suggestHow }) : t('memoria.world.pledge.suggestTitle')) + (pledgeHeldBack(p) ? t('memoria.world.pledge.heldNote') : '')}><Ico name="bell" size={12} />{pledgeHeldBack(p) ? t('memoria.world.pledge.suggestHeld') : t('memoria.world.pledge.suggest')}{p.suggestOutcome ? ` · ${t(`memoria.world.pledge.outcome.${p.suggestOutcome}`)}` : ''}</em>
        <button type="button" className="mm-tag dash mm-revive" title={t('memoria.world.pledge.stillValidTitle')} onClick={() => void uphold(p)}>{t('memoria.world.pledge.stillValid')} ↺</button></> : null}</>,
      <Ib name={p.status === 'active' ? 'check' : 'refresh'} title={p.status === 'active' ? t('memoria.world.pledge.markResolved') : p.status === 'dormant' ? t('memoria.world.pledge.wake') : t('memoria.world.pledge.reactivate')} onClick={() => flip(p)} />, <Ib name="edit" title={t('common.edit')} onClick={() => editPledge(p)} />, <Del st={st} arr="pledges" x={p} what={t('memoria.world.pledge.what')} />))}{pledgeMore}
      {!mem.pledges.length ? <None text={t('memoria.world.pledge.empty')} /> : null}</div>
  </Sec>;

  // ── 캐논 (세계 설정)
  const canonDefs: FormDefs = [{ k: 'key', label: t('memoria.world.canon.f.key'), half: true }, { k: 'scope', label: t('memoria.world.canon.f.scope'), type: 'select', opts: SCOPES, half: true }, { k: 'value', label: t('memoria.world.content'), type: 'area', rows: 2 }];
  const editCanon = async (c?: CanonRow) => { const d = await editBox<Partial<CanonRow>>(c ? t('memoria.world.canon.edit') : t('memoria.world.canon.add'), c || { scope: 'world', key: '', value: '' }, canonDefs); if (!d?.key?.trim() || !d.value?.trim()) return; d.key = d.key.trim().toLowerCase().replace(/[\s-]+/g, '_'); if (c) Object.assign(c, d, { manual: true }); else mem.canon.push({ id: uid(), ...d, prev: null, manual: true, turn: T } as CanonRow); await M.save(mem); st.draw(); };
  const canonSec = <Sec title={t('memoria.world.canon.title')} desc={t('memoria.world.canon.desc')} tools={<Btn label={t('common.add')} ic="plus" cls="ghost" title={t('memoria.world.canon.add')} onClick={() => void editCanon()} />}>
    <div className="mm-rows">{mem.canon.slice(0, canonN).map(c => row(c.id, '', <><b>{c.key}</b> = {c.value}<small>{` (${c.scope}${c.scopeName ? ':' + c.scopeName : ''}${c.turn != null ? ` · t${c.turn + 1}` : ''})`}</small></>, <Ib name="edit" title={t('common.edit')} onClick={() => editCanon(c)} />, <Del st={st} arr="canon" x={c} what={t('memoria.world.canon.what')} />))}{canonMore}{!mem.canon.length ? <None text={t('memoria.world.canon.empty')} /> : null}</div>
  </Sec>;

  // ── 상태 보드
  const editStatus = (s?: StatusRow) => editStatusBox(st, s);
  const groups = new Map<string, StatusRow[]>(); for (const s of mem.status) { const k = s.entity; if (!groups.has(k)) groups.set(k, []); groups.get(k)!.push(s); }
  const [boardN, boardMore] = useWindow(st, 'w-board', groups.size, 10);
  const statusSec = <Sec title={t('memoria.world.status.title')} desc={t('memoria.world.status.desc')} tools={<Btn label={t('common.add')} ic="plus" cls="ghost" title={t('memoria.world.status.add')} onClick={() => void editStatus()} />}><SceneLine m={mem} />
    <div className="mm-board">{[...groups].sort((a, b) => (isScene(a[0]) ? -1 : 0) - (isScene(b[0]) ? -1 : 0)).slice(0, boardN).map(([name, rows], gi) => <div key={gi} className="mm-entity"><h4>{isScene(name) ? t('memoria.world.status.scene') : name}</h4>
      {rows.map(s => <div key={s.id} className={`mm-slot${s.claim === 'belief' ? ' belief' : ''}${s.expired != null ? ' mm-dormant' : ''}`} title={`${s.claim === 'belief' ? `${t('memoria.world.status.belief')}${s.owner ? ':' + s.owner : ''}` : t('memoria.world.status.objective')}${s.turn != null ? ` · t${s.turn + 1}` : ''}`}><span className="mm-slot-k">{s.slot}</span><span className="mm-slot-v">{s.expired != null ? <><Revive title={t('memoria.world.status.reviveTitle')} onClick={async () => { delete s.expired; await M.save(mem); st.draw(); }} />{' '}</> : null}<Tr>{s.value}</Tr>{s.prev != null ? <s title={t('memoria.world.status.prev')}>{String(s.prev)}</s> : null}{s.claim === 'belief' ? <em className="mm-tag dash free">{`${t('memoria.world.status.belief')}${s.owner ? ':' + s.owner : ''}`}</em> : null}</span><span className="mm-actions"><Ib name="edit" title={t('common.edit')} onClick={() => editStatus(s)} /><Del st={st} arr="status" x={s} what={t('memoria.world.status.what')} /></span></div>)}</div>)}{boardMore}</div>
    {!mem.status.length ? <None text={t('memoria.world.status.empty')} /> : null}
  </Sec>;

  // ── 자료실
  const chars = M.dossierChars(mem), over = (n: number) => chars + n > DOSSIER_MAX && (toast(t('memoria.world.doc.over', { max: DOSSIER_MAX.toLocaleString() }), 'err'), true);
  const putDoc = async (title: string, text: string) => { const chunks = chunkDossier(text); if (!chunks.length) return toast(t('memoria.world.contentEmpty'), 'err'); mem.dossier.push({ id: uid(), title: cut(title, 80), chunks, addedAt: now(), disabled: false }); await M.save(mem); st.draw(); toast(t('memoria.world.doc.added', { title: cut(title, 40), n: chunks.length }), 'ok'); };
  const addDoc = async () => { const d = await editBox(t('memoria.world.doc.add'), { title: '', text: '' }, [{ k: 'title', label: t('memoria.world.doc.f.title'), ph: t('memoria.world.doc.f.titlePh') }, { k: 'text', label: t('memoria.world.doc.f.text'), type: 'area', rows: 14, hint: t('memoria.world.doc.f.textHint') }], { wide: true, okLabel: t('common.add') }); if (!d?.title?.trim() || !d.text?.trim() || over(d.text.length)) return; await putDoc(d.title, d.text); };
  const addFile = async () => { const [f] = await pickFiles({ accept: '.txt,.md,text/plain' }); if (!f) return; const text = await f.text(); if (over(text.length)) return; await putDoc(f.name.replace(/\.[^.]+$/, ''), text); };
  const showDoc = (d: DossierDoc) => openModal({ title: d.title, wide: true, body: <div className="mm-review-list">{d.chunks.map((c, i) => <article key={i} className="mm-diff"><header><b>{t('memoria.world.doc.passage', { n: i + 1 })}</b></header><div className="mm-after">{c}</div></article>)}</div> });
  const dossierSec = <Sec title={t('memoria.world.doc.title')} desc={t('memoria.world.doc.desc')} tools={<><Btn label={t('common.add')} ic="plus" cls="ghost" title={t('memoria.world.doc.add')} onClick={() => void addDoc()} /><Btn label={t('memoria.world.doc.file')} ic="upload" cls="ghost" title={t('memoria.world.doc.fileTitle')} onClick={() => void addFile()} /></>}>
    <div className="mm-rows">{mem.dossier.map(d => row(d.id, d.disabled ? 'off' : '', <><b>{d.title}</b><small>{t('memoria.world.doc.stats', { n: d.chunks.length, chars: d.chunks.reduce((n, c) => n + c.length, 0).toLocaleString() })}</small></>, <Ib name="note" title={t('memoria.world.doc.view')} onClick={() => showDoc(d)} />, tog(d, 'disabled', t('memoria.world.excludeInj'), t('memoria.world.include')), <Del st={st} arr="dossier" x={d} what={t('memoria.world.doc.what')} />))}
      {!mem.dossier.length ? <None text={t('memoria.world.doc.empty')} /> : null}</div>{chars ? <div className="mm-budget"><span className="mm-tok">{t('memoria.world.doc.usage', { chars: chars.toLocaleString(), max: DOSSIER_MAX.toLocaleString() })}</span><Meter v={chars} max={DOSSIER_MAX} cls="big" /></div> : null}
  </Sec>;
  // ── 서로 맞지 않는 기록 — 찾은 것이 있을 때만 맨 위에
  const conflicts = conflictsOf(mem);
  const keepSide = async (x: { a: RecordClaim; b: RecordClaim }, keep: 'a' | 'b') => {
    await M.checkpoint(mem, t('memoria.world.conflict.checkpoint')).catch(e => console.warn('[장기기억] 복구 지점', e));   // 고르기 전 상태는 복구 지점에 남긴다
    Mc.dropClaim(mem, (keep === 'a' ? x.b : x.a).key); await M.save(mem); M.reinjectNow?.(st.chat); st.draw(); toast(t('memoria.world.conflict.kept'), 'ok');
  };
  const bothRight = async (pair: string) => { mem.conflictIgnore = [...new Set([...(mem.conflictIgnore || []), pair])].slice(-200); await M.save(mem); st.draw(); };
  const conflictSec = conflicts.length ? <Sec title={t('memoria.world.conflict.title')} desc={t('memoria.world.conflict.desc')}>
    <div className="mm-conflicts">{conflicts.slice(0, 20).map(x => <article key={x.pair} className="mm-conflict"><b className="mm-conflict-why">{WHY_LABEL(x.why)}</b>
      {(['a', 'b'] as const).map(side => { const c = x[side]; return <div key={side} className="mm-conflict-side"><small>{claimLabel(c)}{c.turn ? ` · t${c.turn + 1}` : ''}</small><span>{c.show}</span><Btn label={t('memoria.world.conflict.keep')} cls="ghost" onClick={() => void keepSide(x, side)} /></div>; })}
      <div className="row"><Btn label={t('memoria.world.conflict.both')} cls="ghost" title={t('memoria.world.conflict.bothTitle')} onClick={() => void bothRight(x.pair)} /></div></article>)}</div>
  </Sec> : null;
  return <div className="mm-view">{conflictSec}{castSec}{stage > 1 ? <>{bondSec}{itemSec}{pledgeSec}</> : null}{stage > 2 ? <><TrackerSec st={st} />{canonSec}{statusSec}{dossierSec}</> : null}</div>;
}
