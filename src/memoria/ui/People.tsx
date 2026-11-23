// 장기기억 — 인물 탭: 인물 목록 → 한 사람에 관한 모든 것을 한 장에
// 세계 탭은 선반별(인물 · 관계 · 약속 · 상태 …)로 쌓여 있어 "이 사람은 지금 어떤가"를 보려면 여러 칸을 오가야 한다. 여기서는 사람을 축으로 다시 모은다.
// 모으기만 한다 — 고칠 때는 세계 · 기억 탭의 편집 상자를 그대로 연다. 좁은 화면에서는 목록과 한 장이 서로 자리를 바꾼다(뒤로 단추).
import { useEffect, type ReactNode } from 'react';
import { Btn } from '../../kit';
import type { MemItem, Pledge } from '../types';
import { crossScriptSame } from '../craft';
import { NOW_ORDER, matchPerson, nameKey, nameSuggestions, peopleList, personPage, type NowKind, type PersonRow } from '../people';
import { Chip, Ib, Ico, None, mergeCast, safe, showSource, turnTag, useBump, type StOpen } from './parts';
import { Gi, noMap, onJump } from './viewsShared';
import { editMem } from './Memories';
import { NameTidy } from './NameTidy';
import { Tr } from './ReaderView';
import { NoDateNote, TrackerRows, editTracker } from './Trackers';
import { editBond, editCard, editItemBox, editPledgeBox, editStatusBox } from './World';
import { Memory } from '../../lib/memory';
import * as memMod from '../../lib/memory';
import * as core from '../../lib/core';
import { t } from '../../i18n';

/** 인물 탭의 상태 (탭을 옮겨도 남는다) — 고른 사람 · 검색어 · 펼쳐 둔 묶음 · 더 보기 */
interface PeopleState { name: string; q: string; view: 'list' | 'tidy'; open: Set<string>; more: Map<string, number>; /** 마지막으로 펼쳐 보인 사람 */ shown?: string }
const peopleState = (st: StOpen): PeopleState => (st.people ||= { name: '', q: '', view: 'list', open: new Set<string>(), more: new Map<string, number>() }) as PeopleState;
const PAGE = 8;   // 긴 묶음은 이만큼씩 보여 준다

const NOW_LABEL: Record<NowKind, string> = { location: 'memoria.people.now.location', activity: 'memoria.people.now.activity', outfit: 'memoria.people.now.outfit', injury: 'memoria.people.now.injury', mood: 'memoria.people.now.mood', other: 'memoria.people.now.other' };
/** 새 상태 줄을 만들 때 적어 줄 슬롯 이름 (엔진이 쓰는 이름) */
const NOW_SLOT: Record<NowKind, string> = { location: 'location', activity: 'activity', outfit: 'outfit', injury: 'injury', mood: 'mood', other: '' };

/** 묶음 하나 — 명조 제목 · 모노 숫자 · 가는 선, 오른쪽에 연필 · 더하기 */
function Group({ label, n, tools, children }: { label: string; n?: number; tools?: ReactNode; children?: ReactNode }) {
  return <section className="mm-pp-sec"><header className="mm-pp-h"><div className="fx-head"><h4>{label}</h4>{n != null ? <b className="fx-num">{n}</b> : null}</div>{tools ? <span className="mm-pp-tools">{tools}</span> : null}</header>{children}</section>;
}
const Blank = ({ text }: { text: string }) => <p className="mm-pp-blank">{text}</p>;

function Person({ st, row }: { st: StOpen; row: PersonRow }) {
  const mem = st.mem, v = peopleState(st), M = Memory, no = noMap(st), { LOCKS } = memMod;
  const page = personPage(mem, M.personView(mem, row.name)), { base } = page, c = base.card, name = base.name;
  // 좁은 화면에서는 목록 자리에 이 장이 들어선다 — 위에서부터 읽게 한다
  // (고친 뒤 다시 그려질 때는 읽던 자리를 지킨다 — 다른 사람으로 넘어왔을 때만 올린다)
  useEffect(() => { if (v.shown === name) return; v.shown = name; if (window.matchMedia('(max-width: 820px)').matches) st.host?.closest('.mm-scroll')?.scrollTo({ top: 0 }); }, [name, st.host, v]);
  const key = (k: string) => `${nameKey(name)}:${k}`;
  /** 접힌 묶음 — 펼친 것은 기억해 둔다 (고친 뒤 다시 그려져도 닫히지 않게) */
  const Fold = ({ id, label, n, hint, children }: { id: string; label: string; n: number; hint?: string; children: ReactNode }) => n ? <details className="mm-pp-fold" open={v.open.has(key(id))} onToggle={e => { if (e.currentTarget.open) v.open.add(key(id)); else v.open.delete(key(id)); }}><summary><span>{label}</span><b className="fx-num">{n}</b></summary>{hint ? <p className="mm-pp-hint">{hint}</p> : null}{children}</details> : null;
  /** 긴 목록은 조금만 보여 주고 「더 보기」 */
  const paged = <X,>(id: string, list: X[], draw: (x: X) => ReactNode) => { const lim = v.more.get(key(id)) || PAGE; return <>{list.slice(0, lim).map(draw)}{list.length > lim ? <button type="button" className="btn ghost mm-more" onClick={() => { v.more.set(key(id), lim + PAGE * 2); st.draw(); }}>{t('memoria.people.more', { n: list.length - lim })}</button> : null}</>; };
  const jump = (m: { msgId?: string }) => { const n = no.get(m.msgId as string) ?? -1; return n >= 0 ? <button className="mm-st-jump" type="button" title={t('memoria.memories.jumpTitle')} data-mes={n}>{`#${n}`}</button> : null; };
  const memRow = (m: MemItem, extra?: ReactNode) => <div key={m.id} className={`mm-pp-row${m.retired ? ' off' : ''}`}><div className="mm-pp-main"><p><Tr>{m.summary}</Tr></p>
    <small>{jump(m) || <span className="mm-turn">{turnTag(mem, m)}</span>}{extra}{m.retired ? <em className="mm-tag dash">{t('memoria.parts.passed')}</em> : null}</small></div>
    <Ib name="book" title={t('memoria.memories.source')} onClick={() => showSource(st, m)} /><Ib name="edit" title={t('common.edit')} onClick={() => editMem(st, m)} /></div>;
  const who = (m: MemItem) => { const others = [m.owner, ...(m.knowers || [])].filter((x): x is string => !!x && !page.names.some(n => nameKey(n) === nameKey(x))); return others.length ? <span className="mm-pp-who"><Ico name="lock" size={11} />{[...new Set(others)].join(', ')}</span> : null; };

  // ── 지금 모습: 다섯 칸은 비어 있어도 자리를 보여 준다 (무엇이 아직 적히지 않았는지도 정보다)
  const addStatus = (kind: NowKind) => editStatusBox(st, undefined, { entity: name, slot: NOW_SLOT[kind] });
  const nowRows = NOW_ORDER.flatMap(kind => {
    const rows = page.now.filter(x => x.kind === kind);
    if (!rows.length) return kind === 'other' ? [] : [<div key={kind} className="mm-pp-kv empty"><span className="fx-lbl kr">{t(NOW_LABEL[kind])}</span><span className="mm-pp-val">—</span><Ib name="plus" title={t('memoria.world.status.add')} onClick={() => addStatus(kind)} /></div>];
    return rows.map(({ row: s }) => <div key={s.id} className={`mm-pp-kv${s.claim === 'belief' ? ' belief' : ''}`}><span className="fx-lbl kr" title={s.slot}>{kind === 'other' ? s.slot : t(NOW_LABEL[kind])}</span>
      <span className="mm-pp-val"><Tr>{s.value}</Tr>{s.claim === 'belief' ? <em className="mm-tag dash">{`${t('memoria.world.status.belief')}${s.owner ? ':' + s.owner : ''}`}</em> : null}{s.turn != null ? <small className="fx-num">{` t${s.turn + 1}`}</small> : null}</span>
      <Ib name="edit" title={t('common.edit')} onClick={() => editStatusBox(st, s)} /></div>);
  });

  // ── 변하지 않는 것
  const makeCard = async () => { const card = { id: core.uid(), name, provisional: true, manual: true, first: mem.turns.length, updated: mem.turns.length }; mem.cast.push(card); await M.save(mem); st.draw(); void editCard(st, card); };
  const fact = (label: string, body: ReactNode, ic?: ReactNode) => <div className="mm-pp-kv"><span className="fx-lbl kr">{ic}{label}</span><span className="mm-pp-val">{body}</span></div>;
  const cardSec = c ? <Group label={t('memoria.people.sec.card')} tools={<Ib name="edit" title={t('common.edit')} onClick={() => editCard(st, c)} />}>
    <div className="mm-pp-kvs">
      {c.core ? fact(t('memoria.people.card.core'), <Tr>{c.core}</Tr>, <Gi name="anchor" size={11} />) : null}
      {c.appearance ? fact(t('memoria.world.cast.f.appearance'), <Tr>{c.appearance}</Tr>) : null}
      {c.voice ? fact(t('memoria.world.cast.f.voice'), <Tr>{c.voice}</Tr>) : null}
      {(c.lines || []).length ? fact(t('memoria.people.card.lines'), <span className="mm-pp-lines">{c.lines!.map((l, i) => <q key={i} className={l.pinned ? 'pin' : undefined}>{l.text}</q>)}</span>, <Gi name="quote" size={11} />) : null}
      {(c.growth || []).length ? fact(t('memoria.people.card.growth'), <Tr>{c.growth!.map(g => g.text).join(' · ')}</Tr>, <Gi name="sprout" size={11} />) : null}
      {(c.traits || []).length ? fact(t('memoria.world.cast.f.traits'), <span className="mm-chips">{c.traits!.map((x, i) => <Chip key={i} text={x} />)}</span>) : null}
    </div>
    {!(c.core || c.appearance || c.voice || (c.lines || []).length || (c.growth || []).length || (c.traits || []).length) ? <Blank text={t('memoria.people.card.empty')} /> : null}
  </Group> : <Group label={t('memoria.people.sec.card')}><Blank text={t('memoria.people.card.none')} /><div className="row"><Btn label={t('memoria.people.card.make')} ic="plus" cls="ghost" onClick={() => void makeCard()} /></div></Group>;

  // ── 관계: 서로 부르는 말은 대사에서 모은 것 (모델을 부르지 않는다)
  let calls: { from: string; to: string; term: string; count: number }[] = []; try { calls = M.addressRows(st.chat, mem, st.msgs); } catch (e) { console.warn('[장기기억] 부르는 말', e); }
  const isMe = (n: string) => page.names.some(x => nameKey(x) === nameKey(M.canonName(mem, n)));
  const termsOf = (other: string, out: boolean) => calls.filter(r => out ? isMe(r.from) && nameKey(M.canonName(mem, r.to)) === nameKey(other) : isMe(r.to) && nameKey(M.canonName(mem, r.from)) === nameKey(other)).map(r => r.term);
  const bondSec = <Group label={t('memoria.people.sec.bonds')} n={page.bonds.length || undefined}>
    {page.bonds.map(({ bond: b, dir, other, step }) => { const said = termsOf(other, dir === 'out'); return <div key={b.id} className="mm-pp-row"><div className="mm-pp-main">
      <p className="mm-pp-bond"><span className="mm-pp-dir">{dir === 'out' ? t('memoria.people.bond.out', { name: other }) : t('memoria.people.bond.in', { name: other })}</span><em><Tr>{step.stage}</Tr></em></p>
      {step.calls || said.length ? <small><Ico name="chat" size={11} />{t('memoria.world.bond.callsPrefix')}{[...new Set([step.calls, ...said].filter(Boolean))].join(' · ')}</small> : null}
      {step.unsaid ? <small><Ico name="more" size={11} />{t('memoria.world.bond.unsaidPrefix')}<Tr>{step.unsaid}</Tr></small> : null}</div>
      <Ib name="edit" title={t('memoria.world.bond.editStage')} onClick={() => editBond(st, b)} /></div>; })}
    {(c?.relationships || []).length ? <div className="mm-chips mm-pp-rel">{c!.relationships!.map((r, i) => <span key={i} className="mm-chip rel"><Ico name="link" size={12} />{`${r.target}: ${r.relation}`}</span>)}</div> : null}
    {!page.bonds.length && !(c?.relationships || []).length ? <Blank text={t('memoria.people.bond.empty')} /> : null}
  </Group>;

  // ── 아는 것 · 모르는 것: 드러난 일은 펼쳐 두고, 비밀과 모르는 일은 접어 둔다 (목록을 훑다가 스포일러를 보지 않게)
  const dimNote = (m: MemItem) => { const d = page.dimOf.get(m.id); return d ? <span className="mm-pp-who">{d.level === 'none' ? t('memoria.people.know.dimNone') : t('memoria.people.know.dimPartial')}{d.kept ? ` — ${d.kept}` : ''}</span> : null; };
  const dimIds = new Set(base.dim.map(m => m.id)), open = base.memories.filter(m => !dimIds.has(m.id));
  const knowSec = <Group label={t('memoria.people.sec.know')}>
    <p className="mm-pp-sub">{t('memoria.people.know.open')}<b className="fx-num">{open.length}</b></p>
    {open.length ? paged('open', open, m => memRow(m)) : <Blank text={t('memoria.people.know.openEmpty')} />}
    <Fold id="own" label={t('memoria.people.know.own')} n={base.own.length}>{paged('own', base.own, m => memRow(m, who(m)))}</Fold>
    <Fold id="knows" label={t('memoria.people.know.knows')} n={base.knows.length}>{paged('knows', base.knows, m => memRow(m, who(m)))}</Fold>
    <Fold id="suspects" label={t('memoria.people.know.suspects')} n={base.suspects.length}>{paged('suspects', base.suspects, m => memRow(m, who(m)))}</Fold>
    <Fold id="dim" label={t('memoria.people.know.dim')} n={base.dim.length}>{paged('dim', base.dim, m => memRow(m, dimNote(m)))}</Fold>
    <Fold id="absent" label={t('memoria.people.know.absent')} n={page.absent.length} hint={t('memoria.people.know.absentHint')}>{paged('absent', page.absent, m => memRow(m))}</Fold>
    <Fold id="unaware" label={t('memoria.people.know.unaware')} n={page.unaware.length} hint={t('memoria.people.know.unawareHint')}>{paged('unaware', page.unaware, m => memRow(m, who(m)))}</Fold>
  </Group>;

  // ── 걸린 약속
  const pledgeRow = (p: Pledge) => <div key={p.id} className={`mm-pp-row${p.status === 'resolved' ? ' done' : p.status === 'dormant' ? ' off' : ''}`}><div className="mm-pp-main"><p><em className={`mm-lock l-${safe(p.kind)}`}>{LOCKS[p.kind] || p.kind}</em> <Tr>{p.summary}</Tr></p>
    {p.latest?.text && p.status !== 'resolved' ? <small>{t('memoria.world.pledge.now', { text: p.latest.text })}</small> : null}{p.kind === 'feeling' && (p.cause || p.needs) ? <small>{[p.cause, p.needs].filter(Boolean).join(' → ')}</small> : null}
    {p.status === 'dormant' ? <small><em className="mm-tag dash">{t('memoria.world.pledge.dormant')}</em></small> : null}{p.resolution && p.status === 'resolved' ? <small>{p.resolution}</small> : null}</div>
    <Ib name="edit" title={t('common.edit')} onClick={() => editPledgeBox(st, p)} /></div>;
  const pledgeSec = <Group label={t('memoria.people.sec.pledges')} n={base.pledges.length || undefined} tools={<Ib name="plus" title={t('memoria.world.pledge.add')} onClick={() => editPledgeBox(st)} />}>
    {base.pledges.map(pledgeRow)}{!base.pledges.length ? <Blank text={t('memoria.people.pledge.empty')} /> : null}
    <Fold id="resolved" label={t('memoria.people.pledge.resolved')} n={page.resolved.length}>{page.resolved.map(pledgeRow)}</Fold>
  </Group>;

  // ── 날 세기 · 가진 물건
  const trackerSec = <Group label={t('memoria.tracker.title')} n={base.trackers.length || undefined} tools={<Ib name="plus" title={t('memoria.tracker.addTitle')} onClick={() => editTracker(st, undefined, { people: [name] })} />}>
    {base.trackers.length ? <><NoDateNote st={st} /><TrackerRows st={st} rows={base.trackers} /></> : <Blank text={t('memoria.people.tracker.empty')} />}</Group>;
  const itemSec = <Group label={t('memoria.people.sec.items')} n={page.items.length || undefined} tools={<Ib name="plus" title={t('memoria.world.item.add')} onClick={() => editItemBox(st, { holder: name })} />}>
    {page.items.map(it => <div key={it.id} className={`mm-pp-row${it.disabled || it.dormant != null ? ' off' : ''}`}><div className="mm-pp-main"><p><b>{it.name}</b>{it.meaning ? <>{' — '}<Tr>{it.meaning}</Tr></> : null}</p>{it.status ? <small><Tr>{it.status}</Tr></small> : null}</div><Ib name="edit" title={t('common.edit')} onClick={() => editItemBox(st, it)} /></div>)}
    {!page.items.length ? <Blank text={t('memoria.people.item.empty')} /> : null}</Group>;

  // ── 함께한 장면: 누르면 그 메시지로
  const sceneSec = <Group label={t('memoria.people.sec.scenes')} n={page.scenes.length || undefined}>
    <ol className="mm-pp-scenes">{page.scenes.map(m => { const n = no.get(m.msgId as string) ?? -1, tag = n >= 0 ? `#${n}` : turnTag(mem, m);
      return <li key={m.id}>{n >= 0 ? <button type="button" className="mm-st-jump mm-pp-scene" data-mes={n} title={t('memoria.memories.jumpTitle')}><b className="fx-num">{tag}</b><span><Tr>{m.summary}</Tr></span><Ico name="right" size={13} /></button>
        : <div className="mm-pp-scene"><b className="fx-num">{tag}</b><span><Tr>{m.summary}</Tr></span></div>}</li>; })}</ol>
    {!page.scenes.length ? <Blank text={t('memoria.people.scene.empty')} /> : null}</Group>;

  const meta = [c?.role, c?.age, c?.occupation].filter(Boolean).join(' · ');
  return <article className="mm-pp-page fx-in">
    <button type="button" className="mm-pp-back" onClick={() => { v.name = ''; v.shown = ''; st.draw(); }}><Ico name="left" size={15} /><span>{t('memoria.people.back')}</span></button>
    <header className="mm-pp-top fx-frame"><i className="mm-initial">{(name || '?').trim().slice(0, 1)}</i>
      <div className="mm-pp-id"><h3>{name}</h3>{meta ? <p>{meta}</p> : null}{(c?.aka || []).length ? <p className="mm-pp-aka">{t('memoria.world.cast.aka', { names: c!.aka!.join(', ') })}</p> : null}
        <div className="mm-pp-flags">{page.here ? <span className="fx-pill on"><i className="fx-dot" />{t('memoria.people.here')}</span> : null}{!c ? <span className="fx-pill">{t('memoria.people.noCard')}</span> : null}{c?.provisional ? <span className="fx-pill" title={t('memoria.world.cast.provisionalTitle')}>{t('memoria.world.cast.provisional')}</span> : null}{c?.locked ? <span className="fx-pill" title={t('memoria.world.cast.lockedTitle')}>{t('memoria.world.cast.locked')}</span> : null}{c?.disabled ? <span className="fx-pill">{t('memoria.people.excluded')}</span> : null}</div></div>
      {c ? <span className="mm-pp-tools"><Ib name="merge" title={t('memoria.world.cast.merge')} onClick={() => mergeCast(st, c)} /><Ib name="edit" title={t('common.edit')} onClick={() => editCard(st, c)} /></span> : null}</header>
    <Group label={t('memoria.people.sec.now')} tools={<Ib name="plus" title={t('memoria.world.status.add')} onClick={() => editStatusBox(st, undefined, { entity: name })} />}><div className="mm-pp-kvs">{nowRows}</div></Group>
    {cardSec}{bondSec}{knowSec}{pledgeSec}{trackerSec}{itemSec}{sceneSec}
  </article>;
}

export function People({ st }: { st: StOpen }) {
  const mem = st.mem, v = peopleState(st), drawList = useBump();
  if (v.view === 'tidy') return <NameTidy st={st} back={() => { v.view = 'list'; st.draw(); }} />;
  const all = peopleList(mem), sel = v.name ? all.find(p => nameKey(p.name) === nameKey(Memory.canonName(mem, v.name))) || null : null;
  const rows = all.filter(p => matchPerson(p, v.q)), hints = nameSuggestions(mem, crossScriptSame).length;
  const pick = (p: PersonRow) => { v.name = p.name; st.draw(); };
  const item = (p: PersonRow) => { const c = p.card, meta = [c?.role, c?.age, c?.occupation].filter(Boolean).join(' · ');
    return <button key={nameKey(p.name)} type="button" className={`mm-pp-item${sel && nameKey(sel.name) === nameKey(p.name) ? ' on' : ''}${c?.disabled ? ' off' : ''}${c ? '' : ' stray'}`} onClick={() => pick(p)}>
      <i className="mm-initial">{(p.name || '?').trim().slice(0, 1)}</i>
      <span className="mm-pp-name"><b>{p.name}</b><small>{meta || (c ? (c.aka || []).join(', ') : t('memoria.people.noCard'))}</small></span>
      {p.here ? <span className="fx-pill on"><i className="fx-dot" />{t('memoria.people.hereShort')}</span> : null}
      <span className="mm-pp-n fx-num" title={t('memoria.people.countTitle')}>{p.memories}</span><Ico name="right" size={14} /></button>; };
  const cards = rows.filter(p => p.card), stray = rows.filter(p => !p.card);
  return <div className={`mm-view mm-pp${sel ? ' has-sel' : ''}`} onClick={onJump(st)}>
    <aside className="mm-pp-list">
      <header className="mm-pp-listhead"><div><h3>{t('memoria.people.title')}</h3><p>{t('memoria.people.desc')}</p></div>
        <span className="mm-pp-tools"><Btn label={t('common.add')} ic="plus" cls="ghost" title={t('memoria.world.cast.add')} onClick={() => void editCard(st)} /></span></header>
      <button type="button" className={`mm-pp-tidy${hints ? ' has' : ''}`} onClick={() => { v.view = 'tidy'; st.draw(); }}><Ico name="merge" size={15} /><span>{t('memoria.tidy.title')}</span>{hints ? <b className="fx-num">{hints}</b> : null}<small>{hints ? t('memoria.people.tidyHint') : t('memoria.people.tidyNone')}</small><Ico name="right" size={14} /></button>
      <input className="inp mm-pp-q" type="search" placeholder={t('memoria.people.searchPh')} aria-label={t('memoria.people.searchPh')} autoComplete="off" defaultValue={v.q} onChange={e => { v.q = e.target.value; drawList(); }} />
      <div className="mm-pp-items fx-rows">{cards.map(item)}</div>
      {stray.length ? <><p className="mm-pp-sub">{t('memoria.people.strayTitle')}<b className="fx-num">{stray.length}</b></p><div className="mm-pp-items fx-rows">{stray.map(item)}</div></> : null}
      {!rows.length ? <None text={all.length ? t('memoria.people.emptyFiltered') : t('memoria.people.empty')} /> : null}
    </aside>
    {sel ? <Person st={st} row={sel} /> : <div className="mm-pp-page mm-pp-idle"><None text={t('memoria.people.pickOne')} /></div>}
  </div>;
}
