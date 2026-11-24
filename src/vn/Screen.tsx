// 비주얼 노벨 화면: 배경 위에 캐릭터를 세우고, 대사를 한 문단씩 넘겨 가며 읽는다. 끝까지 읽으면 그 자리에서 답을 쓴다
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import type { Chat, Msg } from '../lib/types';
import type { ChatX } from '../addons/types';
import { Art, Icon } from '../kit';
import { S } from '../lib/core';
import { t } from '../i18n';
import { cur } from '../chat/store';
import { chatApi, generate, running, shownText, stopAll } from '../chat/actions';
import { Sprites, charIdOf, currentOf } from '../expressions/store';

interface Page { key: string; msgId: string; who: 'c' | 'u' | 'n'; charId: string; name: string; text: string; last: boolean }
/** 지난 대화는 이만큼만 되돌아볼 수 있다 */
const LOOKBACK = 40;

/** 글자만 남긴다: 코드 · HTML 화면 · 그림은 이 화면에서 보여 주지 않는다 */
export const plainOf = (text: string) => String(text || '')
  .replace(/```[\s\S]*?(```|$)/g, '\n').replace(/<(style|script)[\s\S]*?(<\/\1>|$)/gi, '\n').replace(/!\[[^\]]*\]\([^)]*\)/g, '')
  .replace(/<br\s*\/?>/gi, '\n').replace(/<\/(p|div|li|h\d)>/gi, '\n').replace(/<[^<>\n]{1,200}>/g, '').replace(/^#{1,6}\s+/gm, '').replace(/[ \t]+\n/g, '\n').trim();
/** 한 문단씩 */
export const pagesOf = (text: string) => plainOf(text).split(/\n+/).map(s => s.trim()).filter(Boolean);

/** 대사("…")와 지문(*…*)만 가볍게 꾸민다 */
const marks = (text: string, k: string): ReactNode[] => text.split(/(\*\*[^*\n]+\*\*|\*[^*\n]+\*)/).filter(Boolean).map((p, i) =>
  /^\*\*/.test(p) ? <b key={k + i}>{p.slice(2, -2)}</b> : /^\*/.test(p) ? <em key={k + i}>{p.slice(1, -1)}</em> : p);
export function fmt(text: string): ReactNode[] {
  return text.split(/("[^"\n]+"|“[^”\n]+”|「[^」\n]+」)/).filter(Boolean).map((p, i) =>
    /^["“「]/.test(p) ? <span key={i} className="vn-q">{marks(p, `q${i}-`)}</span> : marks(p, `t${i}-`)).flat();
}

function build(chat: Chat, msgs: Msg[]): Page[] {
  const out: Page[] = [], me = S.persona(chat).name || t('vn.me');
  const list = msgs.filter(m => !m.hidden && !(m as { call?: unknown }).call).slice(-LOOKBACK);
  for (const m of list) {
    const who = m.role === 'user' ? 'u' : m.role === 'assistant' ? 'c' : 'n';
    const charId = who === 'c' ? charIdOf(m, chat as ChatX) : '';
    const name = who === 'u' ? me : who === 'c' ? S.get('chars', charId)?.name || m.name || '' : '';
    const parts = pagesOf(shownText(m));
    parts.forEach((text, i) => out.push({ key: `${m.id}:${m.sw}:${i}`, msgId: m.id, who, charId, name, text, last: i === parts.length - 1 }));
  }
  return out;
}

function Screen({ chatId, onClose }: { chatId: string; onClose: () => void }) {
  const [, bump] = useState(0), [pos, setPos] = useState(-1), [bare, setBare] = useState(false), [draft, setDraft] = useState('');
  const seen = useRef(''), box = useRef<HTMLDivElement>(null), input = useRef<HTMLTextAreaElement>(null);
  const chat = cur.chat?.id === chatId ? cur.chat : null, msgs = chat ? cur.msgs : [], busy = running();
  // 대화는 바깥에서 바뀐다 (답변이 흘러오는 중에도) — 조금씩 다시 본다
  useEffect(() => {
    let sig = '', n = 0;
    const tm = window.setInterval(() => {
      if (cur.chat?.id !== chatId) return closeVn();
      const ms = cur.msgs, l = ms[ms.length - 1], now = `${ms.length}|${l?.id}|${l?.sw}|${(l?.swipes[l.sw]?.text || '').length}|${running() ? 1 : 0}`;
      if (now !== sig || ++n >= 12) { sig = now; n = 0; bump(x => x + 1); }   // 달라졌을 때만 다시 그린다 (그 밖의 변화는 2초마다)
    }, 160);
    return () => clearInterval(tm);
  }, [chatId, onClose]);
  useEffect(() => { if (chat) void Sprites.load(chat.charIds).then(() => bump(n => n + 1)).catch(() => { }); }, [chat]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const pages = useMemo(() => chat ? build(chat, msgs) : [], [chat, msgs, msgs.length, msgs[msgs.length - 1]?.sw, shownTail(msgs)]);

  // 새 답변이 오면 그 첫 문단으로 간다. 처음 열 때는 마지막 답변의 첫 문단부터
  const lastMsg = [...msgs].reverse().find(m => !m.hidden && m.role !== 'user' && pages.some(p => p.msgId === m.id));
  const mark = lastMsg ? `${lastMsg.id}:${lastMsg.sw}` : '';
  useEffect(() => {
    if (mark === seen.current) return; seen.current = mark;
    const i = lastMsg ? pages.findIndex(p => p.msgId === lastMsg.id) : pages.length - 1;
    setPos(i < 0 ? pages.length - 1 : i);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mark]);
  const at = Math.min(Math.max(pos, 0), Math.max(pages.length - 1, 0)), page = pages[at], atEnd = at >= pages.length - 1;
  const waiting = busy && atEnd;   // 다음 문단이 아직 오는 중
  const canWrite = atEnd && !busy;
  useEffect(() => { box.current?.scrollTo(0, 0); }, [page?.key]);
  useEffect(() => { if (canWrite && !bare && matchMedia('(pointer: fine)').matches) input.current?.focus(); }, [canWrite, bare]);

  // 빠르게 여러 번 눌러도 한 번에 한 문단씩 가도록, 그리는 때의 값이 아니라 지금 값을 보고 옮긴다
  const total = useRef(0); total.current = pages.length;
  const step = (d: number) => setPos(p => Math.min(Math.max(Math.min(Math.max(p, 0), Math.max(total.current - 1, 0)) + d, 0), Math.max(total.current - 1, 0)));
  const next = () => { if (bare) return setBare(false); step(1); };
  const back = () => step(-1);
  const send = () => { const v = draft.trim(); if (!v || busy) return; setDraft(''); void chatApi.send(v); };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (document.querySelector('.modal-wrap, .menu, .palette-wrap, .call-veil')) return;
      const typing = (e.target as HTMLElement | null)?.matches?.('textarea, input, [contenteditable]');
      if (typing) return;
      if ((e.key === ' ' || e.key === 'Enter') && (e.target as HTMLElement | null)?.closest?.('button')) return;   // 단추 위에서는 그 단추가 눌린다
      if (e.key === ' ' || e.key === 'Enter' || e.key === 'ArrowRight') { e.preventDefault(); next(); }
      else if (e.key === 'ArrowLeft') { e.preventDefault(); back(); }
    };
    window.addEventListener('keydown', onKey); return () => window.removeEventListener('keydown', onKey);
  });
  if (!chat) return null;

  // 서 있는 사람: 지금 문단의 화자. 내 말 · 해설일 때는 바로 앞에 말한 캐릭터가 그대로 서 있다
  let standId = ''; for (let i = at; i >= 0 && !standId; i--) if (pages[i]?.who === 'c') standId = pages[i].charId;
  standId ||= chat.charIds[0] || '';
  const stand = S.get('chars', standId), sprite = standId && Sprites.has(standId) ? currentOf(chat as ChatX, msgs, standId).sprite : null;
  const bg = chat.bg || '', art = sprite?.data || '';
  const lastAi = msgs[msgs.length - 1]?.role === 'assistant';
  const pad = (n: number) => String(n).padStart(2, '0');
  return <div className={`vn${bare ? ' is-bare' : ''}${page?.who === 'u' ? ' is-me' : ''}`} onClick={() => { if (bare) setBare(false); }}>
    <div className="vn-bg" style={bg ? { backgroundImage: `url("${bg}")` } : undefined} data-kind={bg ? 'bg' : 'none'} />
    <div className="vn-bar">
      <div className="vn-title"><span className="eyebrow">visual novel</span><b>{chatApi.roomName(chat)}</b></div>
      <button type="button" title={t('vn.back')} disabled={at <= 0} onClick={e => { e.currentTarget.blur(); back(); }}><Icon name="left" size={16} /></button>
      {busy ? <button type="button" title={t('vn.stop')} onClick={() => stopAll()}><Icon name="stop" size={16} /></button>
        : lastAi ? <button type="button" title={t('vn.regen')} onClick={() => void generate('regen')}><Icon name="refresh" size={16} /></button> : null}
      <button type="button" title={t('vn.hide')} onClick={e => { e.stopPropagation(); setBare(true); }}><Icon name="eyeoff" size={16} /></button>
      <button type="button" title={t('vn.close')} onClick={onClose}><Icon name="x" size={16} /></button>
    </div>
    <div className="vn-stage" onClick={e => { if (!bare) { e.stopPropagation(); next(); } }}>
      {art ? <img className="vn-sprite" src={art} alt="" /> : stand?.avatar ? <Art o={stand} className="vn-frame" /> : null}
    </div>
    <div className="vn-box" onClick={e => { if (!(e.target as HTMLElement).closest('button, textarea, .vn-write')) next(); }}>
      {page?.name ? <b className="vn-name">{page.name}</b> : null}
      <div className="vn-scroll" ref={box}>
        <p className="vn-text">{page ? fmt(page.text) : busy ? '' : <span className="vn-dim">{t('vn.empty')}</span>}{waiting ? <span className="typing"><i /><i /><i /></span> : null}</p>
      </div>
      <div className="vn-foot"><span className="eyebrow vn-count">{pages.length ? `${pad(at + 1)} / ${pad(pages.length)}` : ''}</span>{!canWrite && !waiting ? <span className="eyebrow vn-next">next</span> : null}</div>
      {canWrite ? <div className="vn-write"><div className="composer-box">
        <textarea ref={input} rows={1} value={draft} placeholder={t('vn.placeholder')} onChange={e => { setDraft(e.target.value); e.target.style.height = 'auto'; e.target.style.height = Math.min(e.target.scrollHeight, 140) + 'px'; }}
          onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); send(); } }} />
        <button type="button" className="send" title={t('vn.send')} disabled={!draft.trim()} onClick={send}><Icon name="send" size={18} /></button>
      </div></div> : null}
    </div>
  </div>;
}
/** 마지막 메시지의 글이 바뀌었는지 알아보는 값 (흘러오는 답변) */
const shownTail = (msgs: Msg[]) => { const m = msgs[msgs.length - 1]; return m ? (m.swipes[m.sw]?.text || '').length + ':' + (m.swipes[m.sw]?.tr || '').length + ':' + (m.swipes[m.sw]?.showTr ? 1 : 0) : ''; };

let root: Root | null = null, host: HTMLElement | null = null, openId = '';
export const vnOpenFor = () => openId;
export function closeVn() { root?.unmount(); host?.remove(); root = null; host = null; openId = ''; document.documentElement.classList.remove('vn-on'); }
export function openVn(chatId: string, onClose: () => void) {
  if (openId === chatId) return; closeVn();
  host = document.createElement('div'); host.id = 'vn-root'; document.body.append(host);
  root = createRoot(host); openId = chatId; document.documentElement.classList.add('vn-on');
  root.render(<Screen chatId={chatId} onClose={onClose} />);
}
