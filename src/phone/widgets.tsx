// 홈 화면 위젯: 전부 저장된 자료(대화 · 상태 · 일정 · 함께한 날 · 약속 · 일기 · 장기기억 · 사진 · 통화 기록)를 읽기만 한다.
// 크기는 4칸 격자의 [가로, 세로] 칸 수. 위젯 전체를 덮는 투명 단추가 그 앱을 열고, 안의 작은 단추들은 그 위에 놓인다
import { useEffect, useState, type CSSProperties, type ReactNode } from 'react';
import { S } from '../lib/core';
import type { Chat } from '../lib/types';
import { Illust } from '../lib/illust';
import { Live } from '../lib/live';
import { Clock } from '../lib/clock';
import { STATUS, scheduleOf, dayIndex, fmtMin } from '../lib/f-schedule';
import { dayKey, diffDays, monthGrid, monthKey, promiseState, swipeOf, weekLabel } from '../lib/f-keepsake';
import { Memory } from '../lib/memory';
import { t, getLang } from '../i18n';
import { Photos, type PhotoItem } from '../photos/api';
import { Emb, Fill, embOf } from './art';
import { Art } from '../kit';
import { anySongs, pause, play, useMusic } from './music';
import { usePhone, type AppId } from './ui';
import { chatWith, lineOf, nameOf, nextMark, presenceOf, recents, talkChats, together } from './data';
import { parts, shortDate, scriptMonth, storyOn, useMinute } from './time';

/** 이름이 든 라벨: 이름만 줄임표로 줄이고 나머지 말(「함께한 날」 · 「의 오늘」)은 늘 그대로 */
function NameLabel({ k, name }: { k: string; name: string }) {
  const [a, b = ''] = t(k, { name: '\u0001' }).split('\u0001');
  return <span className="pn-wl pn-wl-name">{a ? <span>{a}</span> : null}<span className="nm">{name}</span>{b ? <span>{b}</span> : null}</span>;
}

export interface WDef { id: string; size: [number, number]; title: () => string; app?: AppId; arg?: () => unknown; C: () => ReactNode }

// ── 시계: 둥근 숫자를 크게 쌓고 사이에 작은 알약, 밑에 날짜 한 줄 (이야기 시간이면 그 뒤에 작게) ──
function ClockW() {
  const now = useMinute(), { h, m } = parts(now), P = usePhone();
  return <div className="pn-wclock"><b>{h}</b><i className="pn-wclock-bar" /><b>{m}</b>
    <small>{P.p.theme === 'frost' ? <em className="pn-script">{scriptMonth(now)}</em> : null}{shortDate(now)}{storyOn() ? <span className="pn-story">{t('phone.storyShort')}</span> : null}</small></div>;
}
// ── 물높이 계기: 상태창 수치 · 오늘 하루 · 다음 기념일까지 ──
function gaugeOf(kind: string, home: Chat | null, favId: string, now: number): { v: number; label: string } | null {
  if (kind === 'tracker' || kind === 'auto') {
    const f = home ? Live.fields().find(x => x.max != null && x.min != null && home.tracker?.[x.key] != null) : null;
    if (f && home) { const v = (parseFloat(home.tracker[f.key]) - f.min!) / (f.max! - f.min!); if (isFinite(v)) return { v, label: f.key }; }
    if (kind === 'tracker') return null;
  }
  if (kind === 'together') {
    const days = favId && (S.settings.modes as { together?: boolean }).together !== false ? together(favId) : 0; if (!days) return null;
    const { prev, next } = nextMark(days); return { v: (days - prev) / (next - prev), label: t('phone.w.toMark') };
  }
  const d = new Date(now); return { v: (d.getHours() * 60 + d.getMinutes()) / 1440, label: t('phone.w.dayGone') };
}
function GaugeW() {
  const P = usePhone(), now = useMinute(), g = gaugeOf(P.p.gauge, P.home, P.fav?.id || '', now) || gaugeOf('day', null, '', now)!, pct = Math.round(Math.max(0, Math.min(1, g.v)) * 100);
  return <div className="pn-wgauge"><div className="pn-tank" role="meter" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label={g.label}>
    <i className="pn-water" style={{ transform: `translateY(${100 - pct}%)` }}><svg viewBox="0 0 60 8" preserveAspectRatio="none" aria-hidden="true"><path d="M0 4q7.5-4 15 0t15 0 15 0 15 0V8H0z" /></svg></i>
    <b>{pct}%</b></div><span className="pn-wl">{g.label}</span></div>;
}
// ── 작은 앱 판: 전화 · 사진 (채운 아이콘 하나) ──
const MiniW = (ic: string) => () => <div className="pn-wmini"><Fill name={ic} size={32} /></div>;
// ── 그 사람: 초상을 흰 테두리 사진처럼 크게, 밑에 이름 · 지금 하는 일 (초상이 없으면 그 사람의 엠블럼) ──
function StatusW() {
  const P = usePhone(); useMinute(); const ch = P.fav;
  if (!ch) return <div className="pn-wstatus none"><Emb kind="window" className="pn-sticker-emb" /><span className="pn-wl">{t('phone.w.noFav')}</span></div>;
  const pr = presenceOf(ch);
  return <div className="pn-wstatus"><Art o={ch} className={'pn-sticker' + (ch.avatar ? '' : ' emb')}>{!ch.avatar ? <Emb kind={embOf(ch)} /> : null}</Art>
    <span className="pn-wcap2"><b className="pn-wv"><i className={'pn-dot ' + pr.status} /><span className="nm">{ch.name}</span></b><span className="pn-wl">{pr.activity || STATUS[pr.status] || pr.status}</span></span></div>;
}
// ── 함께한 날: 큰 숫자 하나 ──
function DaysW() {
  const P = usePhone(); useMinute(); const ch = P.fav, n = ch && (S.settings.modes as { together?: boolean }).together !== false ? together(ch.id) : 0;
  if (!ch || !n) return <div className="pn-wdays none"><span className="pn-wl">{t('phone.wt.days')}</span><span className="pn-wv dim">{t('phone.w.noDays')}</span></div>;
  return <div className="pn-wdays"><NameLabel k="phone.w.withName" name={ch.name} /><b className="pn-wh">{n}<small>{t('phone.w.dayUnit')}</small></b></div>;
}
// ── 달력: 흰 판 안의 하늘색 우물, 오늘에 흰 동그라미 ──
function CalW() {
  const now = useMinute(), mk = monthKey(now), today = dayKey(now), weeks = monthGrid(mk, 0), lg = getLang();
  return <div className="pn-wcal"><div className="pn-wcal-in" aria-hidden="true">{[0, 1, 2, 3, 4, 5, 6].map(i => { const w = weekLabel(i); return <i key={'h' + i}>{lg === 'ko' ? w.slice(0, 1) : lg.startsWith('zh') ? w.slice(-1) : w.slice(0, 2)}</i>; })}
    {weeks.flat().map(c => <span key={c.key} className={c.key === today ? 'today' : undefined}>{c.inMonth ? c.d : ''}</span>)}</div></div>;
}
// ── 마지막 메시지: 누가 · 그 말 ──
function LatestW() {
  const P = usePhone(), c = talkChats().find(x => x.preview), line = c ? lineOf(c.preview) : null;
  void P.v;
  if (!c || !line) return <div className="pn-wquote none"><span className="pn-wl">{t('phone.wt.latest')}</span><span className="pn-wv dim">{t('phone.w.noMsg')}</span></div>;
  return <div className="pn-wquote"><span className="pn-wl">{nameOf(c)}</span><p className="pn-wv">{line.text || t('phone.msg.sticker')}</p></div>;
}
// ── 메모: 가장 최근 일기 · 없으면 중요한 기억 한 줄 ──
function NoteW() {
  const P = usePhone(), [mem, setMem] = useState(''), home = P.home;
  const diary = talkChats().flatMap(c => (c.diary || []).map(d => ({ d, c }))).sort((a, b) => b.d.ts - a.d.ts)[0];
  useEffect(() => { if (diary || !home || !S.settings.memory?.enabled) return; let live = true; void Memory.load(home.id).then(() => { const m = Memory.get(home.id)?.memories.filter(x => !x.retired && !x.disabled).sort((a, b) => b.importance - a.importance)[0]; if (live) setMem(m?.summary || ''); }).catch(() => { }); return () => { live = false; }; }, [home, diary]);
  const text = diary ? (diary.d.title ? diary.d.title + ' — ' : '') + diary.d.text : mem;
  return <div className="pn-wnote2"><span className="pn-wl">{diary ? t('phone.w.diary') : t('phone.w.memory')}</span><p className={'pn-wv' + (text ? '' : ' dim')}>{text || t('phone.w.noNote')}</p></div>;
}
// ── 오늘 일정 (그 사람 방의 시계로) ──
function TodayW() {
  const P = usePhone(); useMinute(); const ch = P.fav, now = Clock.ms(ch ? chatWith(ch.id) : null), sch = ch ? scheduleOf(ch) : null, day = sch?.days[dayIndex(new Date(now))] || [], cur = new Date(now).getHours() * 60 + new Date(now).getMinutes();
  if (!ch || !day.length) return <div className="pn-wtoday none"><span className="pn-wl">{t('phone.wt.today')}</span><span className="pn-wv dim">{ch ? t('phone.w.noSched', { name: ch.name }) : t('phone.w.noFav')}</span></div>;
  const at = Math.max(0, day.findIndex(b => cur >= b.from && cur < b.to)), rows = day.slice(Math.max(0, at - 1), Math.max(0, at - 1) + 3);
  return <div className="pn-wtoday"><NameLabel k="phone.w.todayOf" name={ch.name} />
    <ol>{rows.map(b => { const on = cur >= b.from && cur < b.to; return <li key={b.from} className={on ? 'on' : cur >= b.to ? 'past' : undefined}><time>{fmtMin(b.from)}</time><span>{b.activity || STATUS[b.status]}</span></li>; })}</ol></div>;
}
// ── 사진 한 장: 대화 모드 방들의 가장 최근 사진(사진 입구) → 없으면 바탕 대화의 가장 최근 삽화. 흰 테두리 사진처럼 ──
function PhotoW() {
  const P = usePhone(), [pic, setPic] = useState<{ item?: PhotoItem; il?: string } | null>(null), [, bump] = useState(0), home = P.home;
  useEffect(() => {
    let live = true;
    void (async () => {
      const rooms = [...(home ? [home] : []), ...talkChats().filter(x => x !== home).slice(0, 3)];
      for (const c of rooms) { const got = (await Photos.list(c.id).catch(() => [] as PhotoItem[])).find(x => x.state === 'done' && x.image); if (!live) return; if (got) return setPic({ item: got }); }
      for (const c of rooms.slice(0, 2)) {
        const list = S.msgsCached(c.id) || await S.msgs(c.id).catch(() => []); if (!live) return;
        for (let i = list.length - 1, k = 0; i >= 0 && k < 300; i--, k++) { const il = (swipeOf(list[i]).illust || []).find(x => x?.id && !x.hidden); if (il) return setPic({ il: il.versions?.[il.sel]?.id || il.id }); }
      }
      setPic(null);
    })();
    return () => { live = false; };
  }, [home, P.v]);
  const img = pic?.item?.image || pic?.il || '', u = pic?.item ? Photos.thumb(pic.item) : img ? Illust.thumb(img) : '';
  useEffect(() => { if (!img || u) return; const rel = Illust.thumbHold(img), off = Illust.onPic(() => { if (Illust.thumb(img)) bump(n => n + 1); }); return () => { off(); rel(); }; }, [img, u]);
  return <div className={'pn-wphoto' + (u ? '' : ' none')}>{u ? <img className="pn-sticker" src={u} alt="" decoding="async" /> : <><Emb kind="lantern" className="pn-sticker-emb" /><span className="pn-wl">{t('phone.w.noPhoto')}</span></>}</div>;
}
// ── 마지막 통화: 어떻게 · 언제, 누구 · 다시 걸기 ──
function CallW() {
  const P = usePhone(); void P.v; const r = recents(1)[0], ch = r ? S.get('chars', r.charId) : null, name = ch?.name || (r ? nameOf(r.chat) : '');
  if (!r) return <div className="pn-wcall none"><span className="pn-wl">{t('phone.wt.lastCall')}</span><span className="pn-wv dim">{t('phone.w.noCall')}</span></div>;
  return <div className="pn-wcall"><span><span className="pn-wl">{t('phone.call.res.' + r.result)}</span><b className="pn-wv">{name}</b></span>
    <button type="button" className="pn-rb pn-on-top" aria-label={t('phone.call.dialTo', { name })} title={t('phone.call.dialTo', { name })} onClick={() => P.dial(r.chat)}><Fill name="phone" size={20} /></button></div>;
}
// ── 음악: 지금 · 마지막 곡 이름과 큰 재생 단추 (곡이 하나도 없으면 「내 음악을 넣어 보세요」 — 누르면 음악 앱) ──
function MusicW() {
  const P = usePhone(), m = useMusic(), [any, setAny] = useState<boolean | null>(null), last = P.p.lastSong;
  useEffect(() => { if (m.cur || last) return; let live = true; void anySongs().then(v => { if (live) setAny(v); }); return () => { live = false; }; }, [m.cur, last, m.count]);
  const title = m.cur?.name || last?.name || '', empty = !title && any === false;
  const go = async () => { if (m.playing) return pause(); if (!(await play(m.cur ? undefined : last?.id))) P.open('music'); };
  return <div className="pn-wmusic"><span><span className="pn-wl">{t('phone.app.music')}</span><b className={'pn-wv' + (empty ? ' dim' : '')}>{empty ? t('phone.music.empty') : title || t('phone.music.mine')}</b></span>
    {empty ? null : <button type="button" className="pn-mbtn pn-on-top" aria-label={m.playing ? t('phone.music.pause') : t('phone.music.play')} title={m.playing ? t('phone.music.pause') : t('phone.music.play')} onClick={() => void go()}><Fill name={m.playing ? 'pause' : 'play'} size={22} /></button>}</div>;
}
// ── 다음 약속: 남은 날 · 무엇 ──
function PromiseW() {
  useMinute(); const today = dayKey(Date.now()), all = talkChats().flatMap(c => (c.promises || []).filter(p => { const s = promiseState(p, today); return s === 'today' || s === 'upcoming'; }).map(p => ({ p, c }))).sort((a, b) => (a.p.date + a.p.time).localeCompare(b.p.date + b.p.time)), n = all[0];
  if (!n) return <div className="pn-wpromise none"><span className="pn-wl">{t('phone.w.promise')}</span><span className="pn-wv dim">{t('phone.w.noPromise')}</span></div>;
  const d = diffDays(today, n.p.date);
  return <div className="pn-wpromise" title={[nameOf(n.c), n.p.time].filter(Boolean).join(' · ')}><b className="pn-wh">{d <= 0 ? t('phone.w.dToday') : 'D-' + d}</b><p className="pn-wv">{n.p.what}</p></div>;
}

export const WIDGETS: Record<string, WDef> = Object.fromEntries(([
  { id: 'clock', size: [2, 2], title: () => t('phone.wt.clock'), app: 'calendar', C: ClockW },
  { id: 'gauge', size: [1, 2], title: () => t('phone.wt.gauge'), app: 'calendar', C: GaugeW },
  { id: 'call', size: [1, 1], title: () => t('phone.app.calls'), app: 'calls', C: MiniW('phone') },
  { id: 'photos', size: [1, 1], title: () => t('phone.app.photos'), app: 'photos', C: MiniW('camera') },
  { id: 'status', size: [2, 2], title: () => t('phone.wt.status'), app: 'contacts', arg: () => 'fav', C: StatusW },
  { id: 'days', size: [2, 1], title: () => t('phone.wt.days'), app: 'calendar', C: DaysW },
  { id: 'latest', size: [2, 1], title: () => t('phone.wt.latest'), app: 'messages', C: LatestW },
  { id: 'note', size: [2, 1], title: () => t('phone.wt.note'), app: 'notes', C: NoteW },
  { id: 'calendar', size: [2, 2], title: () => t('phone.app.calendar'), app: 'calendar', C: CalW },
  { id: 'music', size: [2, 1], title: () => t('phone.app.music'), app: 'music', C: MusicW },
  { id: 'today', size: [4, 2], title: () => t('phone.wt.today'), app: 'contacts', arg: () => 'fav', C: TodayW },
  { id: 'photo', size: [2, 2], title: () => t('phone.wt.photo'), app: 'photos', C: PhotoW },
  { id: 'promise', size: [2, 1], title: () => t('phone.wt.promise'), app: 'calendar', C: PromiseW },
  { id: 'lastcall', size: [2, 1], title: () => t('phone.wt.lastCall'), app: 'calls', C: CallW },
] as WDef[]).map(w => [w.id, w]));

/** 위젯 한 칸: 판 · 덮개 단추(그 앱 열기). 편집 중이면 덮개 단추가 그 위젯을 고른다 (옮기기 · 빼기는 아래에서 올라오는 판에서) */
export function Widget({ w, i, edit, picked, onPick }: { w: WDef; i: number; edit: boolean; picked?: boolean; onPick?: () => void }) {
  const P = usePhone(), C = w.C;
  return <div className={`pn-w pn-w-${w.id}` + (picked ? ' picked' : '')} style={{ gridColumn: `span ${w.size[0]}`, gridRow: `span ${w.size[1]}`, '--i': i } as CSSProperties}>
    <C />
    {edit ? <button type="button" className="pn-wtap" aria-label={t('phone.edit.pick', { name: w.title() })} aria-pressed={!!picked} onClick={onPick} />
      : w.app ? <button type="button" className="pn-wtap" aria-label={w.title()} onClick={e => P.open(w.app!, w.arg?.(), e.currentTarget)} /> : null}
  </div>;
}
