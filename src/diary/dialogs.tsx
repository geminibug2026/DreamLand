// 일기장 묶음의 창들: 지시문 고치기 · 기억에 올리기 · 글씨체 · 약속 적기 · 대화 고르기 · 편지 · 한 권으로 묶기
import { Fragment, useEffect, useReducer, useRef, useState } from 'react';
import { Avatar, Btn, Icon, IconBtn } from '../kit';
import { Form, confirmBox, openModal, toast, type FieldDef, type ModalAction, type ModalHandle } from '../ui';
import {
  FONTS, INKS, MEMO_DEF, fontLabel, monthLabel, Promises, TYPE, charOf, clearFont, fontOf, fontStyle, groupsOf, loadChat, loadFont, makeBook, md, memoByCall, memoDrop, memoHave, memoLines, memoLoaded, memoPut,
  moodDef, namesOf, pickFontByCall, promptDefs, roomLine, roomOf, sampleOf, save, changed, saveFont, syncChat, tellErr, who, type BookOpt, type Group,
} from './logic';
import { BusyBtn, MoonMini, Paras } from './parts';
import type { DChar, DChat, FontPref, Letter, Page, PromiseRec } from './types';
import { S } from '../lib/core';
import * as core from '../lib/core';
import * as K from '../lib/f-keepsake';
import { t as tr, tn } from '../i18n';

const acts = (list: (ModalAction | null | false | undefined)[]) => list.filter((a): a is ModalAction => !!a);

// ════════ 지시문 고치기 ════════
/** 버튼 옆의 "지시문" — 그 기능의 지시문만 바로 고친다 */
export function editPrompts(keys: string[], title = tr('diary.prompts.edit'), extra: FieldDef[] = []) {
  return openModal({ title, wide: true, actions: [{ label: tr('common.close'), cls: 'primary' }],
    body: <div className="col"><p className="hint">{tr('diary.prompts.nextCall')}</p><Form obj={S.settings} defs={[...extra, ...promptDefs(keys), keys.includes('dream') ? moodDef : null]} onChange={() => S.set({})} /></div> });
}

// ════════ 기억에 올리기 ════════
type MemoPage = Exclude<Page, { type: 'keepsake' }>;
function MemoBody({ chat, p, whoName, user, live }: { chat: DChat; p: MemoPage; whoName: string; user: string; live: { text: string } }) {
  const e = p.ref, kindName = TYPE[p.type][1], src = String(e.text || '').length;
  const [val, setVal] = useState(live.text), [busy, setBusy] = useState(false), alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  const [state] = useState(() => { const n = memoHave(e).length; return n ? tn('diary.memo.already', n) : S.settings.memory?.enabled ? '' : tr('diary.memo.memOff'); });
  const put = (v: string) => { live.text = v; setVal(v); };
  const n = memoLines(val);
  const ask = async () => {
    if (busy) return; setBusy(true);
    try { const got = await memoByCall(chat, p, whoName, user); if (alive.current) put(got.join('\n')); } catch (er) { tellErr(er); }
    if (alive.current) setBusy(false);
  };
  return <div className="memo-dlg">
    <div className="memo-src"><span className="field-label">{tr('diary.memo.source', { kind: kindName })}</span><div className="memo-page"><Paras text={e.text} /></div></div>
    <div className="memo-out"><span className="field-label">{tr('diary.memo.content')}</span>
      <textarea className="inp memo-text" rows={6} placeholder={tr('diary.memo.ph', { char: whoName, user })} value={val} onChange={ev => put(ev.target.value)} />
      <small className="hint">{n.length ? tr('diary.memo.count', { lines: n.length, chars: val.trim().length, src }) : tr('diary.memo.srcOnly', { src })}</small>
      <div className="row wrap"><button type="button" className="btn" disabled={busy} onClick={() => void ask()}>{busy ? tr('diary.memo.busy') : tr('diary.memo.ask')}</button><IconBtn ic="sliders" title={tr('diary.memo.editPrompt')} onClick={() => editPrompts([], tr('diary.memo.promptTitle'), [MEMO_DEF])} /></div>
      <small className="hint">{tr('diary.memo.hint')}</small><small className="hint memo-state">{state}</small></div>
  </div>;
}
/** 쪽 하나를 간추려 장기기억에 올리는 창 */
export function memoDialog(chat: DChat, p: MemoPage, { ch, user, onDone = () => { } }: { ch: { name: string }; user: string; onDone?: () => void }) {
  const e = p.ref, kindName = TYPE[p.type][1], whoName = S.get('chars', e.by)?.name || ch.name, live = { text: memoLoaded(chat, p) };
  const put = async () => {
    const list = memoLines(live.text); if (!list.length) { toast(tr('diary.memo.noLines'), 'err'); return false; }
    const ids = await memoPut(chat, p, list, whoName); toast(tn('diary.memo.put', ids.length, { kind: kindName }), 'ok'); onDone();
  };
  const drop = async () => { await memoDrop(chat, p); toast(tr('diary.memo.dropped')); onDone(); };
  return openModal({ title: tr('diary.memo.title', { kind: kindName }), wide: true, body: <MemoBody chat={chat} p={p} whoName={whoName} user={user} live={live} />,
    actions: acts([memoHave(e).length ? { label: tr('diary.memo.drop'), onclick: drop } : null, { label: tr('common.cancel') }, { label: tr('diary.memo.putBtn'), cls: 'primary', onclick: put }]) });
}

// ════════ 약속 적기 · 고치기 ════════
interface PromiseVals { what: string; date: string; time: string; focus: () => void }
function PromiseBody({ chat, v }: { chat: DChat; v: PromiseVals }) {
  const k = K, today = k.dayKey(core.now()), [, bump] = useReducer((x: number) => x + 1, 0), whatEl = useRef<HTMLInputElement>(null);
  v.focus = () => whatEl.current?.focus();
  const quick: [string, string][] = [[tr('diary.today'), today], [tr('diary.tomorrow'), k.addDays(today, 1)], [tr('diary.pd.thisSat'), k.resolveDate('이번 주 토요일')], [tr('diary.pd.nextWeek'), k.addDays(today, 7)]];
  return <div className="form">
    <label className="field"><span className="field-label">{tr('diary.pd.what')}</span><input className="inp" ref={whatEl} defaultValue={v.what} placeholder={tr('diary.pd.whatPh')} maxLength={120} onChange={e => { v.what = e.target.value; }} /></label>
    <label className="field half"><span className="field-label">{tr('diary.pd.when')}</span><input className="inp" type="date" value={v.date} onChange={e => { v.date = e.target.value; bump(); }} /></label>
    <label className="field half"><span className="field-label">{tr('diary.pd.time')}</span><input className="inp" type="time" defaultValue={v.time} onChange={e => { v.time = e.target.value; }} /></label>
    <div className="row wrap">{quick.map(([l, key]) => <button key={l} type="button" className="chip" onClick={() => { v.date = key; bump(); }}>{l}</button>)}</div>
    <small className="hint">{tr('diary.pd.where', { room: `${namesOf(chat)} · ${roomOf(chat)}` })}</small>
  </div>;
}
/** 약속 적기 · 고치기. 적었거나 고쳤으면 그 약속, 지웠으면 'removed', 그만두면 null */
export function promiseDialog(chat: DChat, p?: PromiseRec | null, preset: { what?: string; date?: string; msgId?: string } = {}) {
  const k = K, today = k.dayKey(core.now()), isNew = !p;
  const v: PromiseVals = { what: p?.what || preset.what || '', date: p?.date || preset.date || today, time: p?.time || '', focus: () => { } };
  return new Promise<PromiseRec | 'removed' | null>(res => {
    let out: PromiseRec | 'removed' | null = null;
    openModal({ title: isNew ? tr('diary.promise.add') : tr('diary.pd.editTitle'), onClose: () => res(out), body: <PromiseBody chat={chat} v={v} />,
      actions: acts([{ label: tr('common.cancel') }, p && { label: tr('diary.remove'), cls: 'danger', onclick: async () => { await Promises.remove(chat, p); out = 'removed'; } },
        { label: isNew ? tr('diary.pd.save') : tr('diary.fix'), cls: 'primary', onclick: async () => {
          const f = { date: v.date, time: k.normTime(v.time), what: v.what.trim() };
          if (!k.validKey(f.date)) { toast(tr('diary.pd.noDate'), 'err'); return false; } if (!f.what) { toast(tr('diary.pd.noWhat'), 'err'); v.focus(); return false; }
          if (!p) out = await Promises.add(chat, f, 'user', preset.msgId ? { msgId: preset.msgId } : {});
          else { if (p.date !== f.date) { delete p.raised; delete p.aired; } Object.assign(p, f); await save(chat); changed(chat); out = p; }
        } }]) });
  });
}

// ════════ 대화 고르기 ════════ (캐릭터가 많아도: 검색 + 캐릭터별 묶음 + 방은 분량 · 날짜로 구분)
function PickBody({ current, onPick }: { current?: string; onPick: (c: DChat) => void }) {
  const [q, setQ] = useState(''), [openKey, setOpenKey] = useState(() => (current ? S.get('chats', current)?.charIds.join('+') : '') || ''), [shown, setShown] = useState(40);
  const t = q.trim().toLowerCase(), all = groupsOf();
  const hit = all.map((g): Group | null => { if (!t) return g; const byName = g.name.toLowerCase().includes(t), rooms = byName ? g.rooms : g.rooms.filter(c => `${roomOf(c)} ${c.preview || ''}`.toLowerCase().includes(t)); return rooms.length ? { ...g, rooms, hit: !byName } : null; }).filter((g): g is Group => !!g);
  return <div className="col">
    <input className="inp search" placeholder={tr('diary.pick.search')} value={q} onChange={e => { setQ(e.target.value); setShown(40); }} />
    <small className="hint">{tr('diary.pick.count', { chars: all.length, rooms: S.chats.length }) + (t ? ' · ' + tr('diary.pick.found', { count: hit.length }) : '')}</small>
    <div className="picker-list alm-pick">
      {hit.slice(0, shown).map(g => {
        const key = g.chat.charIds.join('+'), one = g.rooms.length === 1, open = !one && (openKey === key || g.hit || (!!t && g.rooms.length <= 3));
        return <Fragment key={key}>
          <button className={'picker-row' + (g.rooms.some(c => c.id === current) ? ' on' : '')} onClick={() => { if (one) return onPick(g.rooms[0]); setOpenKey(openKey === key ? '' : key); }}>
            <Avatar o={g.ch || { name: g.name }} cls="sm" /><div className="picker-text"><b>{g.name}</b><small>{one ? `${roomOf(g.rooms[0])} · ${roomLine(g.rooms[0])}` : tr('diary.pick.group', { count: g.rooms.length, date: md(g.at) })}</small></div>{one ? null : <i className="alm-caret"><Icon name={open ? 'up' : 'down'} size={14} /></i>}
          </button>
          {open ? <div className="alm-rooms">{g.rooms.slice(0, 30).map(c => <button key={c.id} className={'alm-room' + (c.id === current ? ' on' : '')} onClick={() => onPick(c)}><b>{roomOf(c)}</b><small>{roomLine(c)}</small>{c.id === current ? <i>{tr('diary.pick.now')}</i> : null}</button>)}{g.rooms.length > 30 ? <small className="hint">{tr('diary.pick.manyRooms')}</small> : null}</div> : null}
        </Fragment>;
      })}
      {!hit.length ? <p className="dim pad">{tr('diary.pick.noHit')}</p> : null}
      {hit.length > shown ? <Btn label={tr('diary.moreN', { count: hit.length - shown })} cls="ghost wide" onClick={() => setShown(shown + 40)} /> : null}
    </div>
  </div>;
}
export function pickChat({ current, title = tr('diary.pick.title'), onPick }: { current?: string; title?: string; onPick: (c: DChat) => void }) {
  const box: ModalHandle = openModal({ title, body: <PickBody current={current} onPick={c => { box.close(); onPick(c); }} /> });
  return box;
}

// ════════ 편지 한 통 ════════
export function showLetter(chat: DChat, letter: Letter, { onAgain }: { onAgain?: () => void } = {}) {
  const ch = S.get('chars', letter.by) || charOf(chat), [y, mo] = letter.month.split('-').map(Number);
  return openModal({ title: '', wide: true,
    body: <div className="alm-letter" style={fontStyle(ch)}><div className="alm-letter-in">
      <header><span className="alm-tag">{`${y} · ${K.MONTHS_EN[mo - 1]}`}</span><MoonMini fill={1} size={26} /></header><h3>{letter.title || tr('diary.letterOf', { month: monthLabel(letter.month) })}</h3>
      <div className="alm-letter-text">{String(letter.text).split(/\n{2,}/).map((p, i) => <p key={i}>{p}</p>)}</div>{letter.ps ? <p className="alm-ps">{tr('diary.ps', { ps: letter.ps })}</p> : null}<div className="alm-sign">{`— ${ch?.name || ''}`}</div>
    </div></div>,
    actions: acts([onAgain && { label: tr('diary.letter.again'), ic: 'refresh', onclick: async () => { if (!(await confirmBox(tr('diary.letter.againAsk'), tr('diary.letter.againOk')))) return false; onAgain(); } },
      { label: tr('diary.letter.inBook'), ic: 'book', onclick: () => core.emit('diary:open', { chat, at: letter.id }) }, { label: tr('common.close'), cls: 'primary' }]) });
}

// ════════ 한 권으로 묶기 ════════
export async function bindDialog(chat: DChat) {
  const msgs = await loadChat(chat); await syncChat(chat, msgs, { quiet: true });
  const k = K, w = who(chat), o: BookOpt = { title: tr('diary.bind.defaultTitle', { name: w.char }), sub: roomOf(chat), mode: (chat.diary || []).some(e => e.to > 0) ? 'diary' : (chat.keepsakes || []).some(x => !x.gone) ? 'scene' : 'day', size: 40, page: 'A5', cover: 'avatar', talk: true, diary: true, dreams: true, letters: true, keepsakes: true, photos: true, almanac: true, hand: true };
  const count = msgs.filter(m => !m.hidden && m.role !== 'system').length, nPics = msgs.flatMap(m => m.hidden ? [] : k.photosOf(m)).length;
  const make = () => makeBook(chat, msgs, o);
  const defs: FieldDef[] = [{ k: 'title', label: tr('diary.bind.bookTitle'), half: true }, { k: 'sub', label: tr('diary.bind.sub'), half: true },
    { k: 'mode', label: tr('diary.bind.mode'), type: 'select', opts: [['diary', tr('diary.bind.mode.diary')], ['day', tr('diary.bind.mode.day')], ['scene', tr('diary.bind.mode.scene')], ['count', tr('diary.bind.mode.count')]], third: true }, { k: 'size', label: tr('diary.bind.size'), type: 'num', min: 5, step: 1, third: true },
    { k: 'page', label: tr('diary.bind.page'), type: 'select', opts: [['A5', tr('diary.bind.a5')], ['A4', 'A4']], third: true },
    { k: 'cover', label: tr('diary.bind.cover'), type: 'select', opts: [['avatar', tr('diary.bind.cover.avatar')], ['photo', tr('diary.bind.cover.photo')], ['none', tr('diary.bind.cover.none')]], half: true },
    { section: tr('diary.bind.include') }, { k: 'talk', label: tr('diary.bind.inc.talk'), type: 'check' }, { k: 'photos', label: tr('diary.bind.inc.photos'), type: 'check' }, { k: 'diary', label: tr('diary.bind.inc.diary'), type: 'check' }, { k: 'dreams', label: tr('diary.prompt.dream.label'), type: 'check' }, { k: 'keepsakes', label: tr('diary.legend.scene'), type: 'check' }, { k: 'letters', label: tr('diary.prompt.letter.label'), type: 'check' }, { k: 'almanac', label: tr('diary.bind.inc.almanac'), type: 'check' },
    { k: 'hand', label: tr('diary.bind.hand', { name: w.char, font: fontLabel(fontOf(charOf(chat))) }), type: 'check', hint: tr('diary.bind.handHint') }];
  openModal({ title: tr('diary.bind.title'), wide: true,
    body: <div className="col"><p className="hint">{tr('diary.bind.hint')}</p>
      <Form obj={o} defs={defs} />
      <small className="hint">{tr('diary.bind.summary', { msgs: count, pics: nPics, diary: (chat.diary || []).length, dreams: (chat.dreams || []).length, letters: (chat.letters || []).length, keeps: (chat.keepsakes || []).filter(x => !x.gone).length })}</small></div>,
    actions: [{ label: tr('common.close') }, { label: tr('diary.bind.print'), ic: 'eye', onclick: () => { const url = URL.createObjectURL(new Blob([make()], { type: 'text/html' })); if (!window.open(url, '_blank')) toast(tr('diary.bind.blocked'), 'err'); setTimeout(() => URL.revokeObjectURL(url), 120000); return false; } },
      { label: tr('diary.bind.save'), ic: 'import', cls: 'primary', onclick: () => { const html = make(); core.download(`${`${w.char}-${o.title}`.replace(/[\\/:*?"<>|\s]+/g, '_').slice(0, 80)}.html`, html, 'text/html'); toast(tr('diary.bind.done', { size: (html.length / 1048576).toFixed(1) })); return false; } }] });
}

// ════════ 캐릭터의 일기장 글씨체 ════════
/** 미는 동안은 견본만 바꾸고, 놓았을 때(change) 저장한다 */
function Range({ label, min, max, val, onLive, onSet }: { label: string; min: number; max: number; val: number; onLive: (v: number) => void; onSet: (v: number) => void }) {
  const [v, setV] = useState(val), el = useRef<HTMLInputElement>(null), set = useRef(onSet);
  set.current = onSet;
  useEffect(() => { const inp = el.current; if (!inp) return; const fn = () => set.current(+inp.value); inp.addEventListener('change', fn); return () => inp.removeEventListener('change', fn); }, []);
  return <label className="field half"><span className="field-label">{label}</span><div className="range"><input type="range" ref={el} min={min} max={max} step={0.05} value={v} onChange={e => { setV(+e.target.value); onLive(+e.target.value); }} /><output>{`${Math.round(v * 100)}%`}</output></div></label>;
}
function FontBody({ ch, chat, onChange }: { ch: DChar; chat?: DChat | null; onChange?: () => void }) {
  const [, bump] = useReducer((x: number) => x + 1, 0), [sample] = useState(() => sampleOf(ch)), [over, setOver] = useState<{ size?: number; lh?: number }>({}), alive = useRef(true);
  useEffect(() => { alive.current = true; FONTS.forEach(f => loadFont(f.name)); return () => { alive.current = false; }; }, []);
  const draw = () => { if (alive.current) { setOver({}); bump(); } onChange?.(); };
  const set = async (patch: FontPref) => { await saveFont(ch, { ...patch, by: patch.by || 'user' }); draw(); };
  const f = fontOf(ch), raw = ch.diaryFont || {};
  return <div className="alm-fonts">
    <div className="alm-font-top"><div className="alm-font-paper" style={fontStyle(ch, { over })}><p>{sample}</p><p>{`— ${ch.name}`}</p></div><div className="alm-font-side">
      {f.reason ? <p className="alm-font-why"><small>{raw.by === 'ai' ? tr('diary.font.why') : tr('diary.font.whyWas')}</small>{f.reason}</p> : <p className="hint">{f.custom ? tr('diary.font.custom') : tr('diary.font.default')}</p>}
      <div className="row wrap"><BusyBtn label={tr('diary.font.ask')} ic="sparkle" cls="primary" busy={tr('diary.font.reading')} run={async () => { const p = await pickFontByCall(ch, chat); draw(); toast(tr('diary.font.picked', { font: ((f0) => f0 ? fontLabel(f0) : p.font)(FONTS.find(x => x.name === p.font)) })); }} /><IconBtn ic="sliders" title={tr('diary.font.editPrompt')} cls="tiny" onClick={() => editPrompts(['font'], tr('diary.font.promptTitle'))} /></div>
      <small className="hint">{tr('diary.font.askHint', { name: ch.name, count: FONTS.length })}</small></div></div>
    <div className="alm-font-grid">{FONTS.map(x => <button key={x.name} type="button" className={'alm-font' + (x.name === f.name ? ' on' : '')} onClick={() => void set({ font: x.name })}><span className="alm-font-s" style={{ fontFamily: `"${x.name}", var(--font)`, fontSize: `${(1.25 * x.k).toFixed(2)}rem` }}>{sample}</span><span className="alm-font-n"><b>{fontLabel(x)}</b><small>{`${x.name} · ${x.note}`}</small></span>{raw.ai?.font === x.name ? <i className="alm-chip">{tr('diary.font.aiPick')}</i> : null}</button>)}</div>
    <div className="form"><Range key={'s' + f.size} label={tr('diary.font.size')} min={0.7} max={1.6} val={f.size} onLive={v => setOver({ size: v })} onSet={v => void set({ size: v })} /><Range key={'l' + f.lh} label={tr('diary.font.lh')} min={0.8} max={1.5} val={f.lh} onLive={v => setOver({ lh: v })} onSet={v => void set({ lh: v })} />
      <div className="field"><span className="field-label">{tr('diary.font.ink')}</span><div className="alm-inks">{Object.entries(INKS).map(([key, v]) => <button key={key} type="button" className={key === f.ink ? 'on' : undefined} title={v[0]} aria-label={v[0]} style={{ ['--c' as string]: v[1] }} onClick={() => void set({ ink: key })}><i /><span>{v[0]}</span></button>)}</div></div></div>
    <div className="row wrap">{raw.ai && raw.by !== 'ai' ? <Btn label={tr('diary.font.backToAi')} ic="refresh" cls="ghost" onClick={() => void set({ ...raw.ai, by: 'ai' })} /> : null}{f.custom ? <Btn label={tr('diary.font.toDefault')} cls="ghost" onClick={async () => { await clearFont(ch); draw(); }} /> : null}</div>
  </div>;
}
/** 글씨체 고르기: 견본을 보며 직접 고르거나, AI 에게 맡긴다 */
export function fontDialog(ch: DChar | undefined, { chat, onChange }: { chat?: DChat | null; onChange?: () => void } = {}) {
  if (!ch) return toast(tr('diary.err.noChar'), 'err');
  return openModal({ title: tr('diary.font.title', { name: ch.name }), wide: true, body: <FontBody ch={ch} chat={chat} onChange={onChange} />, actions: [{ label: tr('common.close'), cls: 'primary' }] });
}
