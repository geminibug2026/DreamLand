// 장기기억 — 기억 탭 (옛 memoria-views.js 의 vMemories)
import { Btn } from '../../kit';
import type { FormDefs } from '../../ui';
import type { MemItem } from '../types';
import { Chip, Del, Ib, Ico, KindBadge, Meter, None, Sec, VIS_IC, editBox, pct, safe, showSource, turnTag, useBump, type StOpen } from './parts';
import { MANUAL_MAX, Mx, cut, noMap, onJump } from './viewsShared';
import { toast } from '../../ui';
import { t } from '../../i18n';
import * as memMod from '../../lib/memory';

const memDefs = (owners: string[]): FormDefs => {
  const { KINDS, VIS } = memMod;
  return [
    { k: 'summary', label: t('memoria.memories.f.summary'), type: 'area', rows: 3 }, { k: 'kind', label: t('memoria.memories.f.kind'), type: 'select', opts: Object.entries(KINDS), third: true }, { k: 'visibility', label: t('memoria.memories.f.visibility'), type: 'select', opts: Object.entries(VIS), third: true }, { k: 'owner', label: t('memoria.memories.f.owner'), third: true, ph: owners.join(', ') },
    { k: 'knowers', label: t('memoria.memories.f.knowers'), type: 'tags', hint: t('memoria.memories.f.knowersHint') },
    { k: 'importance', label: t('memoria.memories.f.importance'), type: 'range', min: 0, max: 1, step: 0.05 }, { k: 'quote', label: t('memoria.memories.f.quote') },
    { k: 'entities', label: t('memoria.memories.f.entities'), type: 'tags', half: true }, { k: 'hints', label: t('memoria.memories.f.hints'), type: 'tags', half: true }, { k: 'tags', label: t('memoria.memories.f.tags'), type: 'tags', half: true }, { k: 'trigger', label: t('memoria.memories.f.trigger'), half: true, ph: t('memoria.memories.f.triggerPh') },
    { k: 'pinned', label: t('memoria.memories.f.pinned'), type: 'check' }, { k: 'disabled', label: t('memoria.memories.f.disabled'), type: 'check' }];
};
async function editMem(st: StOpen, m?: MemItem) {
  const mem = st.mem, M = Mx(), owners = [...new Set([...mem.cast.map(c => c.name), ...mem.memories.map(x => x.owner).filter(Boolean)])] as string[];
  const d = await editBox<Partial<MemItem>>(m ? t('memoria.memories.editTitle') : t('memoria.memories.addTitle'), m ? { knowers: [], ...m } : { kind: 'fact', summary: '', quote: '', importance: 0.8, entities: [], tags: ['manual'], hints: [], visibility: 'public', owner: '', knowers: [], trigger: '', pinned: false, disabled: false }, memDefs(owners), { wide: true });
  if (!d || !d.summary?.trim()) return;
  d.summary = cut(d.summary, MANUAL_MAX);
  // 아는 사람은 비공개 기억에만 남긴다 — 이름은 인물 카드의 표기로 맞춘다
  d.knowers = (d.visibility || 'public') === 'public' ? [] : [...new Set((d.knowers || []).map(e => M.canonName(mem, cut(e, 60))).filter(Boolean))].slice(0, 6);
  if (m) { if (d.summary !== m.summary) { d.manual = true; delete m.av; } Object.assign(m, d); delete m.av; await M.save(mem); }   // 직접 다듬은 기억은 스와이프 롤백 · 상한 정리 · 서고 정리에서 보호한다
  else { await M.add(st.chat.id, d); toast(t('memoria.memories.added'), 'ok'); }
  st.draw();
}

type Sorter = (a: MemItem, b: MemItem) => number;
const sorts: Record<string, Sorter> = { new: (a, b) => (b.turn ?? 0) - (a.turn ?? 0) || (b.ts || 0) - (a.ts || 0), imp: (a, b) => (b.importance || 0) - (a.importance || 0), echo: (a, b) => (b.echoes || 0) - (a.echoes || 0) || (b.shown || 0) - (a.shown || 0) };
type FilterKey = 'kind' | 'vis' | 'owner' | 'sort' | 'only';

export function Memories({ st }: { st: StOpen }) {
  const { KINDS, VIS } = memMod, mem = st.mem, no = noMap(st), owners = [...new Set(mem.memories.map(m => m.owner).filter(Boolean))] as string[];
  // 검색칸에 글을 치는 동안에는 목록만 갈아 끼운다 — 검색칸까지 새로 만들면 한글 조합이 끊긴다
  const drawList = useBump();
  const save = async () => { await Mx().save(mem); drawList(); };
  const card = (m: MemItem) => {
    const n = no.get(m.msgId as string) ?? -1, others = (m.knowers || []).filter(k => k && k !== m.owner), hidden = (m.visibility || 'public') !== 'public', vis = m.visibility || '';
    return <article key={m.id} className={`mm-card${m.disabled ? ' off' : ''}${m.pinned ? ' pinned' : ''}`}>
      <header><KindBadge k={m.kind} />{n >= 0 ? <button className="mm-st-jump" type="button" title={t('memoria.memories.jumpTitle')} data-mes={n}>{`#${n}`}</button> : <span className="mm-turn" title={t('memoria.memories.noSource')}>{turnTag(mem, m)}</span>}
        <span className="mm-vis" title={`${VIS[vis] || VIS.public}${m.owner ? t('memoria.memories.ownerSuffix', { owner: m.owner }) : ''}${others.length ? t('memoria.memories.knowersSuffix', { names: others.join(', ') }) : ''}`}><Ico name={VIS_IC[vis] || 'globe'} size={13} />{hidden ? (m.owner || VIS[vis]) : null}</span>
        <span className="mm-imp" title={t('memoria.memories.importance')}><Meter v={m.importance || 0} max={1} />{pct(m.importance)}</span>{m.shown ? <span className="mm-echo" title={t('memoria.memories.echoTitle')}>{t('memoria.memories.echo', { shown: m.shown, echoes: m.echoes || 0 })}</span> : null}
        <span className="mm-actions"><Ib name="book" title={t('memoria.memories.source')} onClick={() => showSource(st, m)} /><Ib name="pin" title={m.pinned ? t('memoria.memories.unpin') : t('memoria.memories.pin')} onClick={() => { m.pinned = !m.pinned; void save(); }} cls={m.pinned ? 'on' : ''} />
          <Ib name={m.disabled ? 'eyeoff' : 'eye'} title={m.disabled ? t('memoria.memories.enable') : t('memoria.memories.disable')} onClick={() => { m.disabled = !m.disabled; void save(); }} /><Ib name="edit" title={t('common.edit')} onClick={() => editMem(st, m)} /><Del st={st} arr="memories" x={m} what={t('memoria.memories.thisMemory')} /></span></header>
      <p className="mm-sum">{m.summary}</p>{m.quote ? <blockquote>{`"${m.quote}"`}</blockquote> : null}
      {(m.entities || []).length || (m.tags || []).length || (m.hints || []).length || m.trigger || (hidden && others.length) ? <div className="mm-chips">{hidden && others.length ? <span className="mm-chip know" title={t('memoria.memories.knowChipTitle')}><Ico name={VIS_IC[vis] || 'lock'} size={11} />{t('memoria.memories.knowChip', { names: others.join(', ') })}</span> : null}
        {(m.entities || []).map((e, i) => <Chip key={'e' + i} text={'@' + e} cls="ent" />)}{(m.tags || []).map((t, i) => <Chip key={'t' + i} text={'#' + t} />)}{(m.hints || []).map((t, i) => <Chip key={'h' + i} text={'?' + t} cls="hint" />)}{m.trigger ? <Chip text={'⚑ ' + m.trigger} cls="trig" /> : null}</div> : null}
    </article>;
  };
  const q = String(st.q || '').toLowerCase();
  const items = mem.memories.filter(m => (!st.kind || m.kind === st.kind) && (!st.vis || m.visibility === st.vis) && (!st.owner || m.owner === st.owner || (m.knowers || []).includes(st.owner)) && (st.only !== 'pin' || m.pinned) && (st.only !== 'off' || m.disabled) && (st.only !== 'manual' || m.manual) && (st.only !== 'ep' || (m.tags || []).includes('episode_raw')) && (st.only !== 'noep' || !(m.tags || []).includes('episode_raw'))
    && (!q || `${m.summary} ${m.quote || ''} ${(m.entities || []).join(' ')} ${(m.tags || []).join(' ')} ${(m.hints || []).join(' ')} ${(m.knowers || []).join(' ')}`.toLowerCase().includes(q))).sort(sorts[st.sort] || sorts.new);
  const sel = (key: FilterKey, opts: (readonly [string, string])[], title: string, full = false) => <select className="inp auto" title={title} value={st[key] || ''} onChange={e => { st[key] = e.target.value; if (full) st.draw(); else drawList(); }}>{opts.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>;
  const kinds = Object.keys(KINDS).map(k => [k, mem.memories.filter(m => m.kind === k).length] as const).filter(x => x[1]);
  const people = [...new Set([...owners, ...mem.memories.flatMap(m => m.knowers || [])])];
  return <div className="mm-view" onClick={onJump(st)}><Sec title={t('memoria.memories.title')} desc={t('memoria.memories.desc')} tools={<Btn label={t('common.add')} ic="plus" title={t('memoria.memories.addBtnTitle')} onClick={() => void editMem(st)} />}>
    <div className="mm-toolbar"><input className="inp" type="search" placeholder={t('memoria.memories.searchPh')} defaultValue={st.q || ''} onChange={e => { st.q = e.target.value; drawList(); }} />{sel('kind', [['', t('memoria.memories.all')], ...Object.entries(KINDS)], t('memoria.memories.f.kind'), true)}{sel('vis', [['', t('memoria.memories.allVis')], ...Object.entries(VIS)], t('memoria.memories.vis'))}{people.length ? sel('owner', [['', t('memoria.memories.allKnowers')], ...people.map(o => [o, o] as const)], t('memoria.memories.ownerOrKnower')) : null}
      {sel('sort', [['new', t('memoria.memories.sort.new')], ['imp', t('memoria.memories.sort.imp')], ['echo', t('memoria.memories.sort.echo')]], t('memoria.memories.sort'))}{sel('only', [['', t('memoria.memories.all')], ['pin', t('memoria.memories.only.pin')], ['manual', t('memoria.memories.only.manual')], ['off', t('memoria.memories.only.off')], ['noep', t('memoria.memories.only.noep')], ['ep', t('memoria.memories.only.ep')]], t('memoria.memories.only'))}</div>
    {kinds.length ? <div className="mm-kindbar">{kinds.map(([k, n]) => <button key={k} type="button" className={`mm-kindchip k-${safe(k)}${st.kind === k ? ' on' : ''}`} onClick={() => { st.kind = st.kind === k ? '' : k; st.draw(); }}>{KINDS[k]}<small>{String(n)}</small></button>)}</div> : null}
    <small className="hint">{t('memoria.memories.count', { total: mem.memories.length, shown: items.length }) + (items.length > 200 ? t('memoria.memories.first200') : '')}</small>
    <div className="mm-list mm-st-results">{items.slice(0, 200).map(card)}{items.length ? null : <None text={mem.memories.length ? t('memoria.memories.emptyFiltered') : t('memoria.memories.empty')} />}</div>
  </Sec></div>;
}
