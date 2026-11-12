// 일기장 묶음의 창들: 지시문 고치기 · 기억에 올리기 · 글씨체 · 약속 적기 · 대화 고르기 · 편지 · 한 권으로 묶기
import { Fragment, useEffect, useReducer, useRef, useState } from 'react';
import { Avatar, Btn, Icon, IconBtn } from '../kit';
import { Form, confirmBox, openModal, toast, type FieldDef, type ModalAction, type ModalHandle } from '../ui';
import { K, S, core } from './bridge';
import {
  FONTS, INKS, MEMO_DEF, Promises, TYPE, charOf, clearFont, fontOf, fontStyle, groupsOf, loadChat, loadFont, makeBook, md, memoByCall, memoDrop, memoHave, memoLines, memoLoaded, memoPut,
  moodDef, namesOf, pickFontByCall, promptDefs, roomLine, roomOf, sampleOf, save, changed, saveFont, syncChat, tellErr, who, type BookOpt, type Group,
} from './logic';
import { BusyBtn, MoonMini, Paras } from './parts';
import type { DChar, DChat, FontPref, Letter, Page, PromiseRec } from './types';

const acts = (list: (ModalAction | null | false | undefined)[]) => list.filter((a): a is ModalAction => !!a);

// ════════ 지시문 고치기 ════════
/** 버튼 옆의 "지시문" — 그 기능의 지시문만 바로 고친다 */
export function editPrompts(keys: string[], title = '지시문 고치기', extra: FieldDef[] = []) {
  return openModal({ title, wide: true, actions: [{ label: '닫기', cls: 'primary' }],
    body: <div className="col"><p className="hint">여기서 고친 지시문은 다음 호출부터 쓰입니다.</p><Form obj={S().settings} defs={[...extra, ...promptDefs(keys), keys.includes('dream') ? moodDef : null]} onChange={() => S().set({})} /></div> });
}

// ════════ 기억에 올리기 ════════
type MemoPage = Exclude<Page, { type: 'keepsake' }>;
function MemoBody({ chat, p, whoName, user, live }: { chat: DChat; p: MemoPage; whoName: string; user: string; live: { text: string } }) {
  const e = p.ref, kindName = TYPE[p.type][1], src = String(e.text || '').length;
  const [val, setVal] = useState(live.text), [busy, setBusy] = useState(false), alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  const [state] = useState(() => { const n = memoHave(e).length; return n ? `이 쪽에서 올린 기억 ${n}줄이 장기기억에 있어요. 다시 올리면 그 줄들을 바꿔 넣습니다.` : S().settings.memory?.enabled ? '' : '지금은 장기기억이 꺼져 있어요. 올려 두면 장기기억을 켰을 때부터 쓰입니다.'; });
  const put = (v: string) => { live.text = v; setVal(v); };
  const n = memoLines(val);
  const ask = async () => {
    if (busy) return; setBusy(true);
    try { const got = await memoByCall(chat, p, whoName, user); if (alive.current) put(got.join('\n')); } catch (er) { tellErr(er); }
    if (alive.current) setBusy(false);
  };
  return <div className="memo-dlg">
    <div className="memo-src"><span className="field-label">{`${kindName} 원문`}</span><div className="memo-page"><Paras text={e.text} /></div></div>
    <div className="memo-out"><span className="field-label">기억에 올릴 내용</span>
      <textarea className="inp memo-text" rows={6} placeholder={'기억에 남길 내용을 한 줄에 하나씩 적어 주세요.\n예: ' + whoName + '은(는) ' + user + '와(과) 토요일에 바다에 가기로 약속했다.'} value={val} onChange={ev => put(ev.target.value)} />
      <small className="hint">{n.length ? `기억 ${n.length}줄 · ${val.trim().length}자 (원문 ${src}자)` : `원문 ${src}자 — 이대로 올리지 않고 몇 줄로 간추려 올립니다`}</small>
      <div className="row wrap"><button type="button" className="btn" disabled={busy} onClick={() => void ask()}>{busy ? '간추리는 중…' : 'AI가 간추리기 · 호출 1회'}</button><IconBtn ic="sliders" title="간추리는 지시문 고치기" onClick={() => editPrompts([], '기억으로 간추리는 지시문', [MEMO_DEF])} /></div>
      <small className="hint">한 줄이 기억 한 장이 됩니다. AI가 간추린 뒤에도 마음대로 고칠 수 있고, 처음부터 직접 적어도 됩니다.</small><small className="hint memo-state">{state}</small></div>
  </div>;
}
/** 쪽 하나를 간추려 장기기억에 올리는 창 */
export function memoDialog(chat: DChat, p: MemoPage, { ch, user, onDone = () => { } }: { ch: { name: string }; user: string; onDone?: () => void }) {
  const e = p.ref, kindName = TYPE[p.type][1], whoName = S().get('chars', e.by)?.name || ch.name, live = { text: memoLoaded(chat, p) };
  const put = async () => {
    const list = memoLines(live.text); if (!list.length) { toast('기억에 올릴 줄이 없어요. 직접 적거나 간추리기를 눌러 주세요.', 'err'); return false; }
    const ids = await memoPut(chat, p, list, whoName); toast(`${kindName}에서 기억 ${ids.length}줄을 올렸어요.`, 'ok'); onDone();
  };
  const drop = async () => { await memoDrop(chat, p); toast('이 쪽에서 올린 기억을 내렸어요.'); onDone(); };
  return openModal({ title: `기억에 올리기 · ${kindName}`, wide: true, body: <MemoBody chat={chat} p={p} whoName={whoName} user={user} live={live} />,
    actions: acts([memoHave(e).length ? { label: '기억에서 내리기', onclick: drop } : null, { label: '취소' }, { label: '기억에 올리기', cls: 'primary', onclick: put }]) });
}

// ════════ 약속 적기 · 고치기 ════════
interface PromiseVals { what: string; date: string; time: string; focus: () => void }
function PromiseBody({ chat, v }: { chat: DChat; v: PromiseVals }) {
  const k = K(), today = k.dayKey(core().now()), [, bump] = useReducer((x: number) => x + 1, 0), whatEl = useRef<HTMLInputElement>(null);
  v.focus = () => whatEl.current?.focus();
  const quick: [string, string][] = [['오늘', today], ['내일', k.addDays(today, 1)], ['이번 토요일', k.resolveDate('이번 주 토요일')], ['다음 주', k.addDays(today, 7)]];
  return <div className="form">
    <label className="field"><span className="field-label">무엇을</span><input className="inp" ref={whatEl} defaultValue={v.what} placeholder="예: 같이 영화 보기" maxLength={120} onChange={e => { v.what = e.target.value; }} /></label>
    <label className="field half"><span className="field-label">언제</span><input className="inp" type="date" value={v.date} onChange={e => { v.date = e.target.value; bump(); }} /></label>
    <label className="field half"><span className="field-label">시간 (비워도 돼요)</span><input className="inp" type="time" defaultValue={v.time} onChange={e => { v.time = e.target.value; }} /></label>
    <div className="row wrap">{quick.map(([l, key]) => <button key={l} type="button" className="chip" onClick={() => { v.date = key; bump(); }}>{l}</button>)}</div>
    <small className="hint">{`${namesOf(chat)} · ${roomOf(chat)}의 약속 수첩에 적어 둡니다.`}</small>
  </div>;
}
/** 약속 적기 · 고치기. 적었거나 고쳤으면 그 약속, 지웠으면 'removed', 그만두면 null */
export function promiseDialog(chat: DChat, p?: PromiseRec | null, preset: { what?: string; date?: string; msgId?: string } = {}) {
  const k = K(), today = k.dayKey(core().now()), isNew = !p;
  const v: PromiseVals = { what: p?.what || preset.what || '', date: p?.date || preset.date || today, time: p?.time || '', focus: () => { } };
  return new Promise<PromiseRec | 'removed' | null>(res => {
    let out: PromiseRec | 'removed' | null = null;
    openModal({ title: isNew ? '약속 적기' : '약속 고치기', onClose: () => res(out), body: <PromiseBody chat={chat} v={v} />,
      actions: acts([{ label: '취소' }, p && { label: '지우기', cls: 'danger', onclick: async () => { await Promises.remove(chat, p); out = 'removed'; } },
        { label: isNew ? '적어 두기' : '고치기', cls: 'primary', onclick: async () => {
          const f = { date: v.date, time: k.normTime(v.time), what: v.what.trim() };
          if (!k.validKey(f.date)) { toast('날짜를 골라 주세요.', 'err'); return false; } if (!f.what) { toast('무엇을 하기로 했는지 적어 주세요.', 'err'); v.focus(); return false; }
          if (!p) out = await Promises.add(chat, f, 'user', preset.msgId ? { msgId: preset.msgId } : {});
          else { if (p.date !== f.date) { delete p.raised; delete p.aired; } Object.assign(p, f); await save(chat); changed(chat); out = p; }
        } }]) });
  });
}

// ════════ 대화 고르기 ════════ (캐릭터가 많아도: 검색 + 캐릭터별 묶음 + 방은 분량 · 날짜로 구분)
function PickBody({ current, onPick }: { current?: string; onPick: (c: DChat) => void }) {
  const [q, setQ] = useState(''), [openKey, setOpenKey] = useState(() => (current ? S().get('chats', current)?.charIds.join('+') : '') || ''), [shown, setShown] = useState(40);
  const t = q.trim().toLowerCase(), all = groupsOf();
  const hit = all.map((g): Group | null => { if (!t) return g; const byName = g.name.toLowerCase().includes(t), rooms = byName ? g.rooms : g.rooms.filter(c => `${roomOf(c)} ${c.preview || ''}`.toLowerCase().includes(t)); return rooms.length ? { ...g, rooms, hit: !byName } : null; }).filter((g): g is Group => !!g);
  return <div className="col">
    <input className="inp search" placeholder="캐릭터 이름이나 방 이름으로 찾기" value={q} onChange={e => { setQ(e.target.value); setShown(40); }} />
    <small className="hint">{`캐릭터 ${all.length}명 · 대화방 ${S().chats.length}개${t ? ` · 찾은 것 ${hit.length}` : ''}`}</small>
    <div className="picker-list alm-pick">
      {hit.slice(0, shown).map(g => {
        const key = g.chat.charIds.join('+'), one = g.rooms.length === 1, open = !one && (openKey === key || g.hit || (!!t && g.rooms.length <= 3));
        return <Fragment key={key}>
          <button className={'picker-row' + (g.rooms.some(c => c.id === current) ? ' on' : '')} onClick={() => { if (one) return onPick(g.rooms[0]); setOpenKey(openKey === key ? '' : key); }}>
            <Avatar o={g.ch || { name: g.name }} cls="sm" /><div className="picker-text"><b>{g.name}</b><small>{one ? `${roomOf(g.rooms[0])} · ${roomLine(g.rooms[0])}` : `대화방 ${g.rooms.length}개 · 최근 ${md(g.at)}`}</small></div>{one ? null : <i className="alm-caret"><Icon name={open ? 'up' : 'down'} size={14} /></i>}
          </button>
          {open ? <div className="alm-rooms">{g.rooms.slice(0, 30).map(c => <button key={c.id} className={'alm-room' + (c.id === current ? ' on' : '')} onClick={() => onPick(c)}><b>{roomOf(c)}</b><small>{roomLine(c)}</small>{c.id === current ? <i>지금</i> : null}</button>)}{g.rooms.length > 30 ? <small className="hint">방이 많아요. 방 이름으로 검색해 좁혀 주세요.</small> : null}</div> : null}
        </Fragment>;
      })}
      {!hit.length ? <p className="dim pad">찾는 대화가 없어요.</p> : null}
      {hit.length > shown ? <Btn label={`더 보기 (${hit.length - shown})`} cls="ghost wide" onClick={() => setShown(shown + 40)} /> : null}
    </div>
  </div>;
}
export function pickChat({ current, title = '대화 고르기', onPick }: { current?: string; title?: string; onPick: (c: DChat) => void }) {
  const box: ModalHandle = openModal({ title, body: <PickBody current={current} onPick={c => { box.close(); onPick(c); }} /> });
  return box;
}

// ════════ 편지 한 통 ════════
export function showLetter(chat: DChat, letter: Letter, { onAgain }: { onAgain?: () => void } = {}) {
  const ch = S().get('chars', letter.by) || charOf(chat), [y, mo] = letter.month.split('-').map(Number);
  return openModal({ title: '', wide: true,
    body: <div className="alm-letter" style={fontStyle(ch)}><div className="alm-letter-in">
      <header><span className="alm-tag">{`${y} · ${K().MONTHS_EN[mo - 1]}`}</span><MoonMini fill={1} size={26} /></header><h3>{letter.title || `${mo}월의 편지`}</h3>
      <div className="alm-letter-text">{String(letter.text).split(/\n{2,}/).map((p, i) => <p key={i}>{p}</p>)}</div>{letter.ps ? <p className="alm-ps">{`추신. ${letter.ps}`}</p> : null}<div className="alm-sign">{`— ${ch?.name || ''}`}</div>
    </div></div>,
    actions: acts([onAgain && { label: '다시 받기 · 호출 1회', ic: 'refresh', onclick: async () => { if (!(await confirmBox('지금 편지를 지우고 새로 받을까요? (호출 1회)', '다시 받기'))) return false; onAgain(); } },
      { label: '일기장에 꽂힌 쪽 보기', ic: 'book', onclick: () => core().emit('diary:open', { chat, at: letter.id }) }, { label: '닫기', cls: 'primary' }]) });
}

// ════════ 한 권으로 묶기 ════════
export async function bindDialog(chat: DChat) {
  const msgs = await loadChat(chat); await syncChat(chat, msgs, { quiet: true });
  const k = K(), w = who(chat), o: BookOpt = { title: `${w.char}와(과)의 이야기`, sub: roomOf(chat), mode: (chat.diary || []).some(e => e.to > 0) ? 'diary' : (chat.keepsakes || []).some(x => !x.gone) ? 'scene' : 'day', size: 40, page: 'A5', cover: 'avatar', talk: true, diary: true, dreams: true, letters: true, keepsakes: true, photos: true, almanac: true, hand: true };
  const count = msgs.filter(m => !m.hidden && m.role !== 'system').length, nPics = msgs.flatMap(m => m.hidden ? [] : k.photosOf(m)).length;
  const make = () => makeBook(chat, msgs, o);
  const defs: FieldDef[] = [{ k: 'title', label: '책 제목', half: true }, { k: 'sub', label: '부제 (비워도 돼요)', half: true },
    { k: 'mode', label: '장(章) 나누기', type: 'select', opts: [['diary', '일기가 쓰인 곳마다'], ['day', '날짜마다'], ['scene', '장면마다'], ['count', '메시지 수로']], third: true }, { k: 'size', label: '한 장의 메시지 수 (메시지 수로 나눌 때)', type: 'num', min: 5, step: 1, third: true },
    { k: 'page', label: '판형', type: 'select', opts: [['A5', 'A5 (책 크기)'], ['A4', 'A4']], third: true },
    { k: 'cover', label: '표지 사진', type: 'select', opts: [['avatar', '캐릭터 초상'], ['photo', '대화의 첫 사진'], ['none', '넣지 않기']], half: true },
    { section: '담을 것' }, { k: 'talk', label: '대화 본문', type: 'check' }, { k: 'photos', label: '사진 (삽화 · 첨부 이미지)', type: 'check' }, { k: 'diary', label: '일기와 교환 일기', type: 'check' }, { k: 'dreams', label: '꿈 페이지', type: 'check' }, { k: 'keepsakes', label: '장면 기념품', type: 'check' }, { k: 'letters', label: '이달의 편지', type: 'check' }, { k: 'almanac', label: '달력과 약속 수첩 (부록)', type: 'check' },
    { k: 'hand', label: `일기 · 편지 · 꿈을 ${w.char}의 일기장 글씨체(${fontOf(charOf(chat)).ko})로 쓰기`, type: 'check', hint: '이것만은 파일을 열 때 인터넷에서 글꼴을 받아 옵니다. 연결이 없으면 기본 글꼴로 보여요.' }];
  openModal({ title: '한 권으로 묶기', wide: true,
    body: <div className="col"><p className="hint">이 대화를 표지 · 장(章) · 일기 · 사진 · 기념품과 함께 HTML 한 파일로 만듭니다. 파일을 열어 인쇄 창에서 "PDF로 저장"을 고르면 책이 됩니다.</p>
      <Form obj={o} defs={defs} />
      <small className="hint">{`메시지 ${count}개 · 사진 ${nPics}장 · 일기 ${(chat.diary || []).length} · 꿈 ${(chat.dreams || []).length} · 편지 ${(chat.letters || []).length} · 기념품 ${(chat.keepsakes || []).filter(x => !x.gone).length}. 사진은 파일 안에 함께 담기므로 많으면 파일이 커집니다. 추가 호출은 없습니다.`}</small></div>,
    actions: [{ label: '닫기' }, { label: '열어서 인쇄하기', ic: 'eye', onclick: () => { const url = URL.createObjectURL(new Blob([make()], { type: 'text/html' })); if (!window.open(url, '_blank')) toast('새 창이 막혔어요. "파일로 저장"을 써 주세요.', 'err'); setTimeout(() => URL.revokeObjectURL(url), 120000); return false; } },
      { label: '파일로 저장', ic: 'import', cls: 'primary', onclick: () => { const html = make(); core().download(`${`${w.char}-${o.title}`.replace(/[\\/:*?"<>|\s]+/g, '_').slice(0, 80)}.html`, html, 'text/html'); toast(`책 한 권을 묶었어요 (${(html.length / 1048576).toFixed(1)}MB)`); return false; } }] });
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
      {f.reason ? <p className="alm-font-why"><small>{raw.by === 'ai' ? 'AI가 고른 이유' : 'AI가 골랐던 이유'}</small>{f.reason}</p> : <p className="hint">{f.custom ? '직접 고른 글씨체예요.' : '아직 정해 둔 글씨체가 없어 기본 글씨(개구)로 씁니다.'}</p>}
      <div className="row wrap"><BusyBtn label="글씨체 골라 달라고 하기 · 호출 1회" ic="sparkle" cls="primary" busy="성격과 말투를 읽는 중…" run={async () => { const p = await pickFontByCall(ch, chat); draw(); toast(`${FONTS.find(x => x.name === p.font)?.ko || p.font} 글씨로 골랐어요.`); }} /><IconBtn ic="sliders" title="고르기 지시문 고치기" cls="tiny" onClick={() => editPrompts(['font'], '글씨체 고르기 지시문')} /></div>
      <small className="hint">{`${ch.name}의 설명 · 성격 · 예시 대화를 읽고 후보 ${FONTS.length}종 가운데 하나를 고릅니다. ${ch.name}의 모든 대화방 일기장에 적용돼요.`}</small></div></div>
    <div className="alm-font-grid">{FONTS.map(x => <button key={x.name} type="button" className={'alm-font' + (x.name === f.name ? ' on' : '')} onClick={() => void set({ font: x.name })}><span className="alm-font-s" style={{ fontFamily: `"${x.name}", var(--font)`, fontSize: `${(1.25 * x.k).toFixed(2)}rem` }}>{sample}</span><span className="alm-font-n"><b>{x.ko}</b><small>{`${x.name} · ${x.note}`}</small></span>{raw.ai?.font === x.name ? <i className="alm-chip">AI 추천</i> : null}</button>)}</div>
    <div className="form"><Range key={'s' + f.size} label="글자 크기" min={0.7} max={1.6} val={f.size} onLive={v => setOver({ size: v })} onSet={v => void set({ size: v })} /><Range key={'l' + f.lh} label="줄 간격" min={0.8} max={1.5} val={f.lh} onLive={v => setOver({ lh: v })} onSet={v => void set({ lh: v })} />
      <div className="field"><span className="field-label">잉크 색</span><div className="alm-inks">{Object.entries(INKS).map(([key, v]) => <button key={key} type="button" className={key === f.ink ? 'on' : undefined} title={v[0]} aria-label={v[0]} style={{ ['--c' as string]: v[1] }} onClick={() => void set({ ink: key })}><i /><span>{v[0]}</span></button>)}</div></div></div>
    <div className="row wrap">{raw.ai && raw.by !== 'ai' ? <Btn label="AI가 고른 것으로 되돌리기" ic="refresh" cls="ghost" onClick={() => void set({ ...raw.ai, by: 'ai' })} /> : null}{f.custom ? <Btn label="기본 글씨로" cls="ghost" onClick={async () => { await clearFont(ch); draw(); }} /> : null}</div>
  </div>;
}
/** 글씨체 고르기: 견본을 보며 직접 고르거나, AI 에게 맡긴다 */
export function fontDialog(ch: DChar | undefined, { chat, onChange }: { chat?: DChat | null; onChange?: () => void } = {}) {
  if (!ch) return toast('이 대화의 캐릭터를 찾을 수 없어요.', 'err');
  return openModal({ title: `${ch.name}의 일기장 글씨체`, wide: true, body: <FontBody ch={ch} chat={chat} onChange={onChange} />, actions: [{ label: '닫기', cls: 'primary' }] });
}
