// 장기기억 — 인연 고치기 창: 한마디와 갈래(세 개까지 · 첫 번째가 대표). 휴대폰에서도 고르기 쉽게 — 최근 고른 것이 먼저, 찾기 칸, 무리마다 묶은 칩,
// 목록에 없으면 찾기 칸의 말을 그대로 「직접 쓰기」(무리를 고른다). 직접 고친 인연은 사서가 덮어쓰지 않는다
import { useState } from 'react';
import { openModal } from '../../ui';
import { t } from '../../i18n';
import { Memory } from '../../lib/memory';
import type { Bond } from '../types';
import { setTieRead } from '../engine/ties';
import { GROUPS, TIE_GROUPS, TYPES_MAX, cleanWord, readTieType, sameType, tieOf, OWN_TYPE_UNITS, type TieType } from '../ties';
import type { StOpen } from './parts';

/** 무리 · 갈래의 화면 이름 (직접 쓴 갈래는 그 말 그대로, 무리만 있으면 무리 이름) */
export const groupName = (g: string) => ((GROUPS as string[]).includes(g) ? t('memoria.ties.group.' + g) : g);
export const typeName = (x: TieType) => (!x.type ? groupName(x.group) : x.custom ? x.type : t('memoria.ties.type.' + x.type));

/** 갈래 칩 몇 개 (빛깔은 그 무리) — 인연 카드 · 고치기 창이 함께 쓴다 */
export function TypeChips({ types, main = true }: { types?: TieType[]; main?: boolean }) {
  if (!types?.length) return null;
  return <span className="mm-yn-types">{types.map((x, i) => <span key={`${x.group}:${x.type || ''}`} className={`mm-yn-type mm-tk-${x.group}${i === 0 && main && types.length > 1 ? ' main' : ''}${x.custom ? ' own' : ''}`} title={`${groupName(x.group)} · ${typeName(x)}`}>{typeName(x)}</span>)}</span>;
}

// ── 최근 고른 갈래 (이 기기에 남는다) ──
const RECENT_KEY = 'dreamland:memoria-tie-recent';
const recent = (): TieType[] => { try { const j = JSON.parse(localStorage.getItem(RECENT_KEY) || '[]'); return Array.isArray(j) ? j.map(x => readTieType(x)).filter((x): x is TieType => !!x).slice(0, 8) : []; } catch { return []; } };
const remember = (picked: TieType[]) => { try { const list = [...picked, ...recent()].filter((x, i, a) => a.findIndex(y => sameType(x, y)) === i).slice(0, 8); localStorage.setItem(RECENT_KEY, JSON.stringify(list)); } catch { /* 저장하지 못해도 고르기는 된다 */ } };
const fold = (s: string) => String(s || '').toLowerCase().replace(/[\s·・.,/\-_]+/g, '');

/** 창의 몸통 — draft 를 그 자리에서 고친다 */
function Picker({ draft }: { draft: { word: string; types: TieType[] } }) {
  const [types, setTypes] = useState<TieType[]>(draft.types), [q, setQ] = useState(''), [ownGroup, setOwnGroup] = useState('other'), [full, setFull] = useState(false);
  const put = (next: TieType[]) => { draft.types = next; setTypes(next); };
  const has = (x: TieType) => types.some(y => sameType(x, y));
  const toggle = (x: TieType) => { if (has(x)) return put(types.filter(y => !sameType(x, y))); if (types.length >= TYPES_MAX) { setFull(true); return; } setFull(false); put([...types, x]); };
  const toMain = (x: TieType) => put([x, ...types.filter(y => !sameType(x, y))]);
  const query = fold(q), match = (x: TieType) => !query || fold(typeName(x)).includes(query) || fold(groupName(x.group)).includes(query) || fold(x.type || '').includes(query);
  const known = GROUPS.map(g => ({ g, list: TIE_GROUPS[g].map(type => ({ group: g, type }) as TieType).filter(match) })).filter(x => x.list.length);
  const exact = known.some(x => x.list.some(y => fold(typeName(y)) === query)), ownText = cleanWord(q, OWN_TYPE_UNITS);
  const chip = (x: TieType) => <button key={`${x.group}:${x.type || ''}`} type="button" className={`mm-yn-pick mm-tk-${x.group}${has(x) ? ' on' : ''}`} aria-pressed={has(x)} onClick={() => toggle(x)}>{typeName(x)}</button>;
  const rec = recent().filter(match);
  return <div className="mm-yn-picker">
    <label className="field"><span className="field-label">{t('memoria.ties.edit.word')}</span>
      <input className="inp" defaultValue={draft.word} placeholder={t('memoria.ties.edit.wordPh')} autoComplete="off" onChange={e => { draft.word = e.target.value; }} />
      <small className="hint">{t('memoria.ties.edit.wordHint')}</small></label>
    <div className="mm-yn-chosen" aria-live="polite"><span className="field-label">{t('memoria.ties.edit.types', { n: TYPES_MAX })}</span>
      {types.length ? <span className="mm-yn-chosenlist">{types.map((x, i) => <span key={`${x.group}:${x.type || ''}`} className={`mm-yn-type mm-tk-${x.group}${i === 0 ? ' main' : ''}${x.custom ? ' own' : ''}`}>
        {i === 0 ? <em>{t('memoria.ties.edit.main')}</em> : <button type="button" className="mm-yn-mini" title={t('memoria.ties.edit.makeMain')} onClick={() => toMain(x)}>↑</button>}
        <span>{typeName(x)}</span><button type="button" className="mm-yn-mini" aria-label={t('memoria.ties.edit.remove', { name: typeName(x) })} onClick={() => toggle(x)}>×</button></span>)}</span>
        : <small className="hint">{t('memoria.ties.edit.none')}</small>}
      {full ? <small className="hint warn">{t('memoria.ties.edit.max', { n: TYPES_MAX })}</small> : null}</div>
    <input className="inp mm-yn-find" type="search" value={q} placeholder={t('memoria.ties.edit.find')} aria-label={t('memoria.ties.edit.find')} autoComplete="off" onChange={e => setQ(e.target.value)} />
    {ownText && !exact ? <div className="mm-yn-own"><button type="button" className="btn ghost" onClick={() => { const x = readTieType(ownText, ownGroup); if (x) { toggle(x); setQ(''); } }}>{t('memoria.ties.edit.own', { text: ownText })}</button>
      <select className="inp auto" aria-label={t('memoria.ties.edit.ownGroup')} value={ownGroup} onChange={e => setOwnGroup(e.target.value)}>{GROUPS.map(g => <option key={g} value={g}>{groupName(g)}</option>)}</select></div> : null}
    <div className="mm-yn-groups">
      {rec.length ? <section><h5>{t('memoria.ties.edit.recent')}</h5><div className="mm-yn-picks">{rec.map(chip)}</div></section> : null}
      {known.map(({ g, list }) => <section key={g}><h5 className={`mm-tk-${g}`}><i className="mm-ti-swatch" />{groupName(g)}</h5><div className="mm-yn-picks">{list.map(chip)}</div></section>)}
      {!known.length && !ownText ? <small className="hint">{t('memoria.ties.edit.noMatch')}</small> : null}
    </div>
  </div>;
}

/** 인연 고치기 — 직접 고친 읽기는 사서가 덮어쓰지 않는다 (한마디 · 갈래를 모두 비우면 다시 사서에게 맡긴다) */
export function editTie(st: StOpen, b: Bond) {
  const r = tieOf(b), draft = { word: r.word || '', types: (r.types || []).map(x => ({ ...x })) };
  let ok = false;
  openModal({
    title: t('memoria.ties.edit.title', { from: b.from, to: b.to }), body: <Picker draft={draft} />,
    onClose: () => { if (!ok) return; setTieRead(b, { word: draft.word, types: draft.types }); remember(draft.types); void Memory.save(st.mem).then(() => st.draw()); },
    actions: [{ label: t('common.cancel') }, { label: t('common.save'), cls: 'primary', onclick: () => { ok = true; } }],
  });
}
