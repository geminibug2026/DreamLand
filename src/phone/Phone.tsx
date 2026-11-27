// 내 휴대폰의 몸체: 잠금 화면 → 홈 → 앱, 위에서 내리는 조절 센터, 열려 있는 동안 온 메시지의 머리 알림.
// 휴대폰(좁은 화면)에서는 화면 전체, 넓은 화면에서는 가운데 기기 틀. 움직임은 transform · opacity 만.
// 열려 있는 동안만 듣고(자료 알림 · 키 · 뒤로 가기) 분마다 한 번 다시 그린다. 닫으면 통째로 내려 남는 것이 없다
import { startTransition, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ComponentType, type CSSProperties } from 'react';
import { S, emit, msgText, on } from '../lib/core';
import type { Chat, Msg } from '../lib/types';
import { backFirst, go } from '../lib/router';
import { cur, ui } from '../chat/store';
import { chatApi, drawSide, modeOf } from '../chat/actions';
import { toast } from '../ui';
import { t } from '../i18n';
import { Glyph } from './art';
import { PhoneCtx, type AppId, type PhoneApi } from './ui';
import { setPrefs, usePrefs } from './prefs';
import { favChar, homeChat, nameOf, notifications, snsNotice, talkChats, lineOf, type Notif } from './data';
import { hhmm, setTimeSource, useMinute } from './time';
import { useWall } from './wall';
import { Lock } from './Lock';
import { Home } from './Home';
import { Control } from './Control';
import { Messages } from './apps/Messages';
import { Calls } from './apps/Calls';
import { Contacts } from './apps/Contacts';
import { Gallery } from './apps/Gallery';
import { Calendar } from './apps/Calendar';
import { Notes } from './apps/Notes';
import { Music } from './apps/Music';
import { Board } from './apps/Board';
import { Settings } from './apps/Settings';

const APPS: Record<AppId, ComponentType<{ arg?: unknown }>> = { messages: Messages, calls: Calls, contacts: Contacts, photos: Gallery, calendar: Calendar, notes: Notes, music: Music, board: Board, settings: Settings };
interface Layer { id: AppId; arg?: unknown; key: number; ox: number; oy: number; out?: boolean }
/** 몇 분 안에 다시 열면 잠금 화면 없이 보던 곳으로 */
const RESUME_MS = 3 * 60000;
let lastClose = 0, lastStack: Layer[] = [];
/** 늘 같은 함수(그리기마다 새로 만들지 않는다)로 최신 구현을 부른다 — 이 함수들을 담은 조작 고리가 바뀌지 않아야 앱을 열고 닫을 때 홈 · 위젯이 다시 그려지지 않는다 */
function useStable<A extends unknown[], R>(f: (...a: A) => R): (...a: A) => R { const r = useRef(f); r.current = f; return useCallback((...a: A) => r.current(...a), []); }
const calm = () => matchMedia('(prefers-reduced-motion: reduce)').matches || document.documentElement.classList.contains('no-motion');
const later = (f: () => void, ms: number) => window.setTimeout(f, calm() ? 0 : ms);

/** 기기의 배터리 (navigator.getBattery 가 있으면 그 값, 휴대폰이 열려 있는 동안만 바뀜을 듣는다). 없으면 null */
type Batt = { level: number; charging: boolean; addEventListener(t: string, f: () => void): void; removeEventListener(t: string, f: () => void): void };
function useBattery(): number | null {
  const [lv, setLv] = useState<number | null>(null);
  useEffect(() => {
    const get = (navigator as Navigator & { getBattery?: () => Promise<Batt> }).getBattery; if (typeof get !== 'function') return;
    let b: Batt | null = null, live = true; const f = () => { if (live && b) setLv(Math.round(b.level * 100)); };
    get.call(navigator).then(x => { b = x; f(); b.addEventListener('levelchange', f); }).catch(() => { });
    return () => { live = false; b?.removeEventListener('levelchange', f); };
  }, []);
  return lv;
}
/** 상태 줄: 왼쪽은 시각(가늘게), 오른쪽은 가는 신호 막대 · 작은 망 이름 · 숫자를 품은 테두리 배터리. 누르거나 끌어 내리면 조절 센터 */
function StatusBar({ onPull }: { onPull: () => void }) {
  const now = useMinute(), y0 = useRef<number | null>(null), batt = useBattery(), lv = batt ?? 80;
  const net = String((navigator as Navigator & { connection?: { effectiveType?: string } }).connection?.effectiveType || '4g').replace(/^slow-/, '').toUpperCase(), off = !navigator.onLine;
  return <div className="pn-sb" role="button" tabIndex={0} aria-label={t('phone.cc.open')} onClick={onPull} onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onPull(); } }}
    onPointerDown={e => { y0.current = e.clientY; }} onPointerMove={e => { if (y0.current != null && e.clientY - y0.current > 26) { y0.current = null; onPull(); } }} onPointerUp={() => { y0.current = null; }}>
    <b>{hhmm(now)}</b><i className="pn-island" aria-hidden="true" />
    <span aria-hidden="true">
      {off ? null : <small className="pn-sb-net">{net}</small>}
      <svg viewBox="0 0 17 12" className="pn-sb-sig">{[3, 5, 7, 9, 11].map((h, i) => <rect key={i} x={i * 3.5} y={12 - h} width="2.1" height={h} rx=".7" className={off || i > 3 ? 'weak' : undefined} />)}</svg>
      <svg viewBox="0 0 28 13" className="pn-sb-bat"><rect x=".6" y=".6" width="24" height="11.8" rx="3.4" className="case" /><rect x="2.2" y="2.2" width={Math.max(1.5, 20.8 * lv / 100)} height="8.6" rx="2" className="lvl" /><rect x="25.8" y="4.4" width="1.7" height="4.2" rx=".8" className="nub" /><text x="12.6" y="9.5" textAnchor="middle">{lv}</text></svg>
    </span>
  </div>;
}

export function Phone({ chat, onGone }: { chat: Chat | null; onGone: () => void }) {
  const p = usePrefs();
  const [home] = useState(() => homeChat(chat));
  const resume = Date.now() - lastClose < RESUME_MS;
  const [screen, setScreen] = useState<'lock' | 'home'>(resume ? 'home' : 'lock'), [unlocking, setUnlocking] = useState(false), [homeUp, setHomeUp] = useState(resume);
  const [stack, setStack] = useState<Layer[]>(() => resume ? lastStack.slice(-1) : []), [cc, setCc] = useState<'' | 'in' | 'out'>(''), [edit, setEdit] = useState(false);
  const [closing, setClosing] = useState(false), [v, setV] = useState(0), [fresh] = useState(() => new Map<string, { at: number; text: string; n: number }>()), [banner, setBanner] = useState<{ n: Notif; k: number } | null>(null);
  const scr = useRef<HTMLDivElement>(null), seq = useRef(0), after = useRef<(() => void) | null>(null), gone = useRef(false), popped = useRef(false), closingPop = useRef(false);
  const fav = favChar(p, home), wall = useWall(p);
  // 시계가 따를 방: 처음 그리기 전에 한 번, 그 뒤로는 바뀔 때 (그리는 도중에 다른 판을 다시 그리게 하지 않게). 내려가면 놓는다
  useState(() => setTimeSource(home, p.story));
  useLayoutEffect(() => setTimeSource(home, p.story), [home, p.story]);
  useEffect(() => () => setTimeSource(null, false), []);
  lastStack = stack.filter(l => !l.out);

  // ── 닫기: 몸짓이 끝나면 내리고, 맡긴 일(다른 화면으로 가기 · 전화)을 한다. 뒤로 가기 기록에 넣어 둔 한 칸도 거둔다 ──
  const finish = useCallback(() => {
    if (gone.current) return; gone.current = true; lastClose = Date.now(); onGone();
    const f = after.current; after.current = null; if (f) setTimeout(f, 0);
  }, [onGone]);
  const leave = useStable((then?: () => void) => {
    if (closing || gone.current) return; after.current = then || null; setClosing(true);
    // 뒤로 가기 기록의 우리 칸을 거두고, 그 popstate 를 우리가 받은 뒤에 내린다 (먼저 내리면 그 알림이 대화 화면을 다시 그린다)
    later(() => { if (history.state?.pn && !popped.current) { popped.current = true; closingPop.current = true; history.back(); window.setTimeout(finish, 900); } else finish(); }, 220);
  });

  // ── 앱 쌓기 ──
  const open = useStable((id: AppId, arg?: unknown, from?: Element | null) => {
    const r = scr.current?.getBoundingClientRect(), f = from?.getBoundingClientRect(), k = r && scr.current?.offsetWidth ? r.width / scr.current.offsetWidth : 1;   // 넓은 화면에서 줄인 만큼 되돌려 화면 안의 자리로
    const ox = r && f ? (f.left + f.width / 2 - r.left) / k : 195, oy = r && f ? (f.top + f.height / 2 - r.top) / k : 422;
    if (id === 'calls') { const seen = { ...p.seenCalls }; let ch = false; for (const c of talkChats()) if ((c as { callLog?: unknown[] }).callLog?.length) { seen[c.id] = Date.now(); ch = true; } if (ch) setPrefs({ seenCalls: seen }); }   // 전화를 열면 부재중 표시는 본 것으로
    setScreen('home'); setHomeUp(true); setCc(''); setStack(s => [...s.filter(l => !l.out), { id, arg, key: ++seq.current, ox, oy }]);
  });
  const popTop = useStable(() => { setStack(s => { const top = s.filter(l => !l.out).pop(); return top ? s.map(l => l === top ? { ...l, out: true } : l) : s; }); later(() => setStack(s => s.filter(l => !l.out)), 200); });
  const back = useStable(() => {
    if (cc === 'in') { setCc('out'); later(() => setCc(''), 220); return; }
    if (stack.some(l => !l.out)) return popTop();
    if (edit) return setEdit(false);
    leave();
  });
  const home2 = useStable(() => { setCc(''); setStack(s => s.map(l => ({ ...l, out: true }))); later(() => setStack([]), 200); });
  const unlock = useStable(() => { if (unlocking || screen === 'home') return; setHomeUp(true); setUnlocking(true); later(() => { setScreen('home'); setUnlocking(false); }, 300); });

  // ── 대화 · 전화로 이어 가기: 휴대폰을 닫은 뒤 대화 화면에 맡긴다 ──
  const whenOpen = (c: Chat, f: () => void) => {
    if (cur.chat?.id === c.id && ui.input) return f();
    go('chat', c.id);
    let off = () => { }; const tm = window.setTimeout(() => off(), 10000);
    off = on<Chat | null>('chat:open', x => { if (x?.id !== c.id) return; off(); clearTimeout(tm); setTimeout(f, 60); });
  };
  const toChat = useStable((c: Chat, reply?: string) => {
    fresh.delete(c.id);
    leave(() => whenOpen(c, () => { if (!reply) return void ui.input?.focus({ preventScroll: true }); if (cur.busy) { chatApi.setInput?.(reply); toast(t('phone.notif.queued')); } else void chatApi.send(reply); }));
  });
  const dial = useStable((c: Chat) => leave(() => whenOpen(c, () => emit('call:dial', c))));
  const read = useStable((n: Notif) => {
    if (n.kind === 'call') { setPrefs({ seenCalls: { ...p.seenCalls, [n.chat.id]: Date.now() } }); return; }
    fresh.delete(n.chat.id); if (n.chat.unread) { n.chat.unread = 0; void S.save('chats', n.chat, true); drawSide(); }
    setV(x => x + 1);
  });
  const mute = useStable((id: string) => { if (!p.muted.includes(id)) setPrefs({ muted: [...p.muted, id] }); const c = S.get('chats', id); toast(t('phone.notif.muted', { name: c ? nameOf(c) : '' })); });

  // ── 열려 있는 동안만: 자료가 바뀌면 다시 셈하고(한 프레임에 한 번), 새로 온 메시지는 머리 알림으로 ──
  useEffect(() => {
    let raf = 0; const bump = () => { if (!raf) raf = requestAnimationFrame(() => { raf = 0; startTransition(() => setV(x => x + 1)); }); };
    const offs = ['chats', 'chars', 'message:sent', 'call:end', 'settings', 'chat:open', 'msgs:wrote', 'clock', 'feed:changed'].map(e => on(e, bump));
    offs.push(on<{ msg: Msg; chat: Chat }>('message:received', d => {
      bump(); const c = d?.chat, m = d?.msg; if (!c || !m || m.role !== 'assistant' || modeOf(c) !== 'talk' || c.temp) return;
      const text = msgText(m), f = fresh.get(c.id); fresh.set(c.id, { at: Date.now(), text, n: (f?.n || 0) + 1 });
      if (!p.muted.includes(c.id)) setBanner({ n: { id: 'b' + c.id, kind: 'msg', chat: c, charId: m.charId || c.charIds[0], title: nameOf(c), line: lineOf(text), at: Date.now(), count: 1 }, k: Date.now() });
    }));
    return () => { cancelAnimationFrame(raf); offs.forEach(o => o()); };
  }, [p.muted, fresh]);
  // 넓은 화면의 기기 틀: 창에 맞게 줄이는 비율 (열려 있는 동안만 창 크기를 듣는다)
  const dev = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const fit = () => dev.current?.style.setProperty('--pn-k', Math.max(.5, Math.min(1, (innerHeight - 36) / 866, (innerWidth - 150) / 412)).toFixed(3));
    fit(); addEventListener('resize', fit); return () => removeEventListener('resize', fit);
  }, []);
  const [covered, setCovered] = useState(false), anyApp = stack.some(l => !l.out);
  useEffect(() => { if (!anyApp) { setCovered(false); return; } const tm = later(() => setCovered(true), 380); return () => clearTimeout(tm); }, [anyApp]);
  useEffect(() => { if (!banner) return; const tm = window.setTimeout(() => setBanner(null), 4500); return () => clearTimeout(tm); }, [banner]);
  // 잠금 화면이 먼저 뜨고, 홈은 그 뒤 한가할 때 밑에 미리 그려 둔다 (밀어 열 때 바로 보이게)
  useEffect(() => { if (homeUp) return; const raf = requestAnimationFrame(() => { const tm = window.setTimeout(() => startTransition(() => setHomeUp(true)), 120); cleanup = () => clearTimeout(tm); }); let cleanup = () => { }; return () => { cancelAnimationFrame(raf); cleanup(); }; }, [homeUp]);
  // 뒤로 가기(휴대폰의 뒤로 · 브라우저): 대화 화면이 다시 그려지지 않게 먼저 받아 휴대폰 안에서 처리한다
  const backRef = useRef(back); backRef.current = back;
  useEffect(() => {
    try { history.pushState({ ...(history.state || {}), pn: 1 }, ''); } catch { }
    // 라우터보다 먼저 받는다(backFirst): 받았으면 라우터는 대화 화면을 다시 그리지 않는다
    const pop = () => {
      if (gone.current) return false;
      if (closingPop.current) { finish(); return true; }   // 닫으면서 우리가 거둔 한 칸
      if (popped.current) return true;
      popped.current = true;
      const modal = document.querySelector<HTMLElement>('#modals .modal-wrap .modal-x');   // 휴대폰 위에 뜬 창(큰 그림 보기)이 먼저 닫힌다
      if (modal) modal.click(); else backRef.current();
      setTimeout(() => { if (!gone.current && !after.current && !closingPop.current) { try { history.pushState({ ...(history.state || {}), pn: 1 }, ''); popped.current = false; } catch { } } }, 260);
      return true;
    };
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape' && !document.querySelector('#modals .modal-wrap, .menu')) { e.preventDefault(); backRef.current(); } };
    backFirst.add(pop); addEventListener('keydown', key);
    return () => { backFirst.delete(pop); removeEventListener('keydown', key); };
  }, []);

  const notifs = useMemo(() => notifications(p, fresh), [p, v, fresh]), sns = useMemo(() => snsNotice(), [v]);   // eslint-disable-line react-hooks/exhaustive-deps
  const setCcS = useStable((o: boolean) => { setCc(o ? 'in' : 'out'); if (!o) later(() => setCc(''), 220); });
  // 조작 고리는 자료가 바뀔 때만 새로 만든다 (앱 · 조절 센터를 여닫는 것으로는 홈 · 위젯이 다시 그려지지 않게)
  const api: PhoneApi = useMemo(() => ({ home, fav, p, v, fresh, notifs, sns, open, back, home2, leave, toChat, dial, read, mute, setCc: setCcS, edit, setEdit }), [home, fav, p, v, fresh, notifs, sns, edit]);   // eslint-disable-line react-hooks/exhaustive-deps
  const live = stack.filter(l => !l.out), lockInk = wall.sharp || p.theme === 'night' || p.theme === 'mono' || p.wall === 'g:ink' ? 'light' : 'dark', homeInk = wall.soft || p.theme === 'night' || p.theme === 'mono' || p.wall === 'g:ink' ? 'light' : 'dark';
  return <PhoneCtx.Provider value={api}>
    <div className={'pn-veil' + (closing ? ' out' : '')} onClick={() => leave()} aria-hidden="true" />
    <div ref={dev} className={'pn-dev' + (closing ? ' out' : '')} data-theme={p.theme} role="dialog" aria-modal="true" aria-label={t('phone.title')}>
      <div className="pn-scr" ref={scr} data-ink={screen === 'lock' && !live.length ? lockInk : homeInk} data-over={live.length || cc === 'in' ? '' : undefined}>
        {homeUp ? <div className="pn-homewrap" data-ink={homeInk} inert={screen === 'lock' || covered || cc === 'in' ? true : undefined}><Home wall={wall} /></div> : null}
        {screen === 'lock' ? <div className="pn-lockwrap" data-ink={lockInk}><Lock wall={wall} out={unlocking} onUnlock={unlock} /></div> : null}
        {stack.map((l, i) => { const A = APPS[l.id]; return <div key={l.key} className={'pn-app' + (l.out ? ' out' : '')} style={{ '--ox': l.ox + 'px', '--oy': l.oy + 'px' } as CSSProperties} inert={l.out || i < stack.length - 1 ? true : undefined}>
          <div className="pn-appscroll"><A arg={l.arg} /></div><button type="button" className="pn-homebar" aria-label={t('phone.toHome')} onClick={home2}><i /></button></div>; })}
        <StatusBar onPull={() => setCcS(cc !== 'in')} />
        {banner ? <button key={banner.k} type="button" className="pn-banner" onClick={() => toChat(banner.n.chat)}><Glyph name="messages" size={16} /><span><b>{banner.n.title}</b><small>{p.previews ? banner.n.line.text || t('phone.msg.sticker') : t('phone.notif.newMsg')}</small></span></button> : null}
        {cc ? <><div className="pn-cc-veil" onClick={() => api.setCc(false)} /><Control out={cc === 'out'} onClose={() => api.setCc(false)} /></> : null}
        {!live.length && !cc ? (screen === 'home' ? <button type="button" className="pn-homebar" aria-label={t('phone.lockNow')} title={t('phone.lockNow')} onClick={() => { setScreen('lock'); setEdit(false); }}><i /></button>
          : <button type="button" className="pn-homebar" aria-label={t('phone.close')} title={t('phone.close')} onClick={() => leave()}><i /></button>) : null}
        <i className="pn-bright" style={{ opacity: 1 - p.bright }} aria-hidden="true" />
      </div>
      <button type="button" className="pn-close" aria-label={t('phone.close')} title={t('phone.close')} onClick={() => leave()}><Glyph name="x" size={18} /></button>
    </div>
  </PhoneCtx.Provider>;
}
