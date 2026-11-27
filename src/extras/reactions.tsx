// 내 반응: 캐릭터의 메시지에 작은 반응을 남긴다 (최근 쓴 것 · 직접 적기 · 딱지). 다음 턴 프롬프트에 한 줄로 전해진다 — 모델을 따로 부르지 않는다
import { createRoot } from 'react-dom/client';
import { useState } from 'react';
import { Icon } from '../kit';
import { now } from '../lib/core';
import type { Chat, Msg } from '../lib/types';
import { chatApi } from '../chat/actions';
import { bump } from '../chat/store';
import { t } from '../i18n';
import { cfg, saveCfg } from './cfg';
import { Stickers } from './stickers';
import { openStickerPicker } from './StickerPicker';

export interface Reaction { emoji: string; by?: string; me?: boolean; ts?: number; stk?: string; /** 캐릭터가 단 반응: 단 답과 그 버전 */ from?: string; sw?: number }
// 처음 보이는 것: 글자 기호만 (그림 문자는 사용자가 직접 적어 넣는다)
const STARTERS = ['♥', '✦', '☾', '!', '?', 'ㅋㅋ'];
const list = (m: Msg) => (m.reactions ||= []) as Reaction[];
const recents = () => [...new Set([...cfg().react.recent, ...STARTERS])].slice(0, 7);

/** 반응을 달거나(같은 것이 있으면) 뗀다 */
export async function toggleReaction(m: Msg, emoji: string, stk = '') {
  const v = emoji.trim().slice(0, 12); if (!v && !stk) return;
  const rs = list(m), i = rs.findIndex(r => r.me && (stk ? r.stk === stk : r.emoji === v && !r.stk));
  if (i >= 0) rs.splice(i, 1);
  else { rs.push({ emoji: stk ? '' : v, me: true, ts: now(), ...(stk ? { stk } : {}) }); if (!stk) { const c = cfg().react; c.recent = [v, ...c.recent.filter(x => x !== v)].slice(0, 7); saveCfg(); } }
  if (!rs.length) delete m.reactions;
  await chatApi.save(); bump('m:' + m.id);
}

/** 메시지 아래의 반응 줄 (Messages.tsx 가 그린다). 내가 단 것은 눌러서 뗀다 */
/** 보이는 반응: 내가 단 것은 다, 캐릭터가 단 것은 그 답이 지금 보이는 버전일 때만 (지운 답의 반응은 숨김).
 *  예전 기록(답 표시 없음)은 같은 캐릭터의 같은 반응을 하나로 — 넘길 때마다 쌓였던 것 */
function shown(rs: Reaction[]): Reaction[] {
  const msgs = chatApi.current().msgs as Msg[], seen = new Set<string>();
  return rs.filter(r => {
    if (r.me) return true;
    if (r.from) { const a = msgs.find(x => x.id === r.from); return !!a && (r.sw == null || a.sw === r.sw); }
    const k = (r.by || '') + '\u0000' + r.emoji; if (seen.has(k)) return false; seen.add(k); return true;
  });
}
export function Reacts({ m }: { m: Msg }) {
  const rs = shown((m.reactions || []) as Reaction[]); if (!rs.length) return null;
  return <div className="reacts xt-reacts">{rs.map((r, i) => {
    const s = r.stk ? Stickers.byId(r.stk) : null, body = s ? <img src={s.data} alt={s.name} /> : (r.emoji || (r.stk ? '·' : ''));
    return r.me ? <button key={i} type="button" className="xt-react mine" title={t('extras.react.remove')} onClick={() => void toggleReaction(m, r.emoji, r.stk)}>{body}</button> : <span key={i} title={r.by || ''}>{body}</span>;
  })}</div>;
}

function Bar({ m, close, anchor }: { m: Msg; close: () => void; anchor: Element }) {
  const [v, setV] = useState(''), mine = new Set(((m.reactions || []) as Reaction[]).filter(r => r.me && !r.stk).map(r => r.emoji));
  const put = (e: string) => { close(); void toggleReaction(m, e); };
  return <>
    {recents().map(e => <button key={e} type="button" className={'xt-rb fx-tap' + (mine.has(e) ? ' on' : '')} aria-pressed={mine.has(e)} onClick={() => put(e)}>{e}</button>)}
    <i className="xt-rb-sep" />
    <form onSubmit={e => { e.preventDefault(); if (v.trim()) put(v); }}><input className="xt-rb-inp" value={v} maxLength={12} placeholder={t('extras.react.typePh')} aria-label={t('extras.react.type')} onChange={e => setV(e.target.value)} /></form>
    <button type="button" className="xt-rb fx-tap" title={t('extras.react.sticker')} aria-label={t('extras.react.sticker')} onClick={() => { close(); openStickerPicker(anchor, s => void toggleReaction(m, '', s.id)); }}><Icon name="sticker" size={15} /></button>
  </>;
}
let closeBar: (() => void) | null = null;
/** 반응 막대를 anchor 곁에 띄운다 */
export function openReactBar(anchor: Element, m: Msg) {
  closeBar?.();
  const host = document.createElement('div'); host.className = 'xt-rbar fx-in'; host.setAttribute('role', 'dialog'); host.setAttribute('aria-label', t('extras.react.title'));
  const root = createRoot(host), r = anchor.getBoundingClientRect();
  host.style.top = Math.max(8, r.top - 46) + 'px'; host.style.left = Math.max(8, Math.min(innerWidth - 348, r.left - 12)) + 'px';
  const close = () => { if (closeBar !== close) return; closeBar = null; document.removeEventListener('pointerdown', away, true); document.removeEventListener('keydown', key, true); removeEventListener('scroll', close, true); root.unmount(); host.remove(); };
  const away = (e: Event) => { if (!host.contains(e.target as Node)) close(); };
  const key = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); close(); } };
  document.addEventListener('pointerdown', away, true); document.addEventListener('keydown', key, true); addEventListener('scroll', close, true);
  document.body.append(host); closeBar = close;
  root.render(<Bar m={m} close={close} anchor={anchor} />);
}

// ── 프롬프트 ──
const snip = (s: string) => { const x = s.replace(/\[sticker\s*:[^\]\n]*\]/gi, '').replace(/\s+/g, ' ').trim(); return x.length > 60 ? x.slice(0, 57) + '…' : x; };
/** 마지막 답장 뒤에 내가 남긴 반응을 한 줄씩 (그 답장 다음 턴에만 전해진다 — 다시 생성해도 같은 줄이 나온다) */
export function reactionLines(chat: Chat, msgs: Msg[], type: string): string {
  const c = cfg().react, talk = chat.mode === 'talk' && !(chat as { sceneLive?: boolean }).sceneLive;
  if (!(talk ? c.talk : c.rp) || type === 'impersonate') return '';
  let src = msgs.filter(m => !m.hidden); if (type === 'regen' || type === 'swipe') src = src.slice(0, -1);
  const lastAi = [...src].reverse().find(m => m.role === 'assistant'); if (!lastAi) return '';
  const since = lastAi.ts || 0, out: string[] = [];
  for (const m of src.slice(-30)) {
    if (m.role !== 'assistant') continue;
    for (const r of (m.reactions || []) as Reaction[]) {
      if (!r.me || (r.ts || 0) < since) continue;
      const s = r.stk ? Stickers.byId(r.stk) : null, what = s ? `with a "${s.name}" sticker${s.keys ? ` (${s.keys.split(',').slice(0, 2).join(',').trim()})` : ''}` : r.emoji; if (!what) continue;
      const text = snip(m.swipes[m.sw]?.text || '');
      out.push(`{{user}} reacted ${what} to ${m === lastAi ? 'your last message' : 'your earlier message'}${text ? ` ("${text}")` : ''}.`);
    }
  }
  return out.length ? `[${out.slice(-4).join(' ')} A reaction is a small wordless reply; take it in naturally and do not quote this note.]` : '';
}
