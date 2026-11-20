// 「깨어난 설정」 창: 마지막 스캔에서 깨어난 항목과 빠진 항목 · 그 까닭 · 책마다 쓴 예산, 그리고 글을 붙여 넣어 보는 키워드 시험
import { useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { Btn } from '../kit';
import { openModal, toast } from '../ui';
import { S } from '../lib/core';
import * as engine from '../lib/engine';
import type { Char, Chat, Lore, LoreEntry } from '../lib/types';
import type { LoreDiag, LoreHit } from '../lib/engine';
import { chatApi } from '../chat/actions';
import { dryBuild } from '../gate/logic';
import { t } from '../i18n';

interface Scan { hits: LoreHit[]; diag: LoreDiag; real: boolean; books: Lore[] }
const charsOf = (chat: Chat) => (chat.charIds || []).map(id => S.get('chars', id) as Char | undefined).filter((x): x is Char => !!x);
const booksOf = (chat: Chat) => engine.activeBooks(chat, charsOf(chat), S.persona(chat));
/** 마지막 실제 답변 때의 스캔. 이 방의 것이 없으면(또는 fresh 면) 지금 보낸다고 치고 살펴본다 */
function gather(chat: Chat, fresh = false): Scan | null {
  const books = booksOf(chat), real = engine.loreDiag(true);
  if (!fresh && real && real.chatId === chat.id) return { hits: engine.loreFired(), diag: real, real: true, books };
  const now = chatApi.current(), built = dryBuild(chat, now.chat?.id === chat.id ? now.msgs : []), d = engine.loreDiag(false);
  return built && d ? { hits: built.lore, diag: d, real: false, books } : null;
}
const pad = (n: number) => String(n).padStart(2, '0');
const nameOf = (e: { name?: string; keys?: string[] }) => e.name || (e.keys || []).slice(0, 3).join(', ') || t('lore.untitled');

/** 무엇에 걸려 깨어났는지 */
function via(v = ''): string {
  if (v.startsWith('key:')) return t('awake.via.key', { key: v.slice(4) });
  if (v.startsWith('chain:')) return t('awake.via.chain', { key: v.slice(6) });
  return v === 'constant' ? t('awake.via.constant') : v === 'sticky' ? t('awake.via.sticky') : v === 'vector' ? t('awake.via.vector') : v === 'ask' ? t('awake.via.ask') : t('awake.via.unknown');
}
const WHY = ['budget', 'chance', 'cooldown', 'group', 'ask', 'filter', 'delay'];
const why = (v: string) => WHY.includes(v) ? t('awake.why.' + v) : v;

/** 머리 그림: 펼친 책에서 깨어난 항목 수만큼 별이 떠오른다 (자리는 차례에서 정해진다) */
function BookArt({ n }: { n: number }) {
  const stars = Array.from({ length: Math.min(n, 9) }, (_, i) => { const a = (i * 137.5) % 360, r = 6 + (i * 53) % 17; return [40 + Math.cos(a * Math.PI / 180) * r * 1.5, 26 - (i * 29) % 21, 1 + (i % 3) * 0.5]; });
  return <svg className="fx-art gt-book" viewBox="0 0 80 80" width="80" height="80" aria-hidden="true">
    <path className="fx-draw" pathLength={1} d="M40 50C33 45 22 44 12 46v20c10-2 21-1 28 4 7-5 18-6 28-4V46c-10-2-21-1-28 4z" /><path className="t" d="M40 50v20" />
    <path className="h" d="M17 52c6-1 12 0 18 3M17 57c6-1 12 0 18 3M45 55c6-3 12-4 18-3M45 60c6-3 12-4 18-3" />
    {stars.map(([x, y, r], i) => <circle key={i} cx={x.toFixed(1)} cy={y.toFixed(1)} r={r} className={i % 4 === 0 ? 'af' : 'f'} />)}
    {!n ? <path className="d" d="M40 44V14" /> : <path className="d" d="M40 46V38" />}
  </svg>;
}

function Rows({ scan }: { scan: Scan }) {
  const { hits, diag, books } = scan;
  const where = new Map<string, { e: LoreEntry; b: Lore }>(); for (const b of books) for (const e of b.entries || []) where.set(e.id, { e, b });
  const awake = new Set(hits.map(h => h.id)), skipped = Object.entries(diag.skip).filter(([id]) => !awake.has(id) && where.has(id)).map(([id, r]) => ({ ...where.get(id)!, r }));
  const total = books.reduce((n, b) => n + (b.entries || []).filter(e => e.enabled !== false && (e.content || '').trim()).length, 0), asleep = Math.max(0, total - hits.length - skipped.length);
  const tok = hits.reduce((n, h) => n + h.tok, 0);
  const row = (key: string, i: number, off: boolean, title: string, book: string, pills: ReactNode, n: number) => <div className={'gt-lrow fx-in' + (off ? ' off' : '')} role="listitem" key={key} style={{ '--d': Math.min(i, 14) * 0.025 + 's' } as CSSProperties}>
    <span className="gt-mark" aria-hidden="true">{off ? <svg className="fx-art" viewBox="0 0 12 12" width="12" height="12"><circle cx="6" cy="6" r="4.2" className="t" /></svg> : <svg className="fx-art" viewBox="0 0 12 12" width="12" height="12"><circle cx="6" cy="6" r="4.2" className="f" /></svg>}</span>
    <div className="gt-what"><p>{title}</p><small><span>{book}</span></small></div>
    <div className="gt-tags">{pills}</div><span className="fx-num gt-tok">{n ? '≈' + n.toLocaleString() : '—'}</span></div>;
  return <>
    <div className="gt-books">{books.map(b => { const used = diag.used[b.id] || 0, max = +(b.tokenBudget || 2048) || 2048, cnt = hits.filter(h => h.bookId === b.id).length;
      return <div className="gt-bk" key={b.id}><div className="fx-kv"><span>{b.name}</span><i /><b>{used.toLocaleString()} / {max.toLocaleString()}</b></div>
        <div className={'fx-meter' + (used / max > 0.9 ? ' acc' : '')} style={{ '--p': Math.min(1, used / max) } as CSSProperties} role="meter" aria-valuemin={0} aria-valuemax={max} aria-valuenow={used} aria-label={t('awake.budgetOf', { name: b.name })} />
        <small className="fx-lbl kr">{t('awake.bookLine', { awake: cnt, total: (b.entries || []).filter(e => e.enabled !== false).length })}</small></div>; })}</div>
    <div className="fx-head gt-sec"><span className="fx-lbl kr ink">{t('awake.sec.awake')}</span><span className="fx-num">{pad(hits.length)} · ≈{tok.toLocaleString()}</span></div>
    {hits.length ? <div className="fx-rows" role="list">{hits.map((h, i) => row(h.id, i, false, nameOf(h), h.book || '', <span className="fx-pill">{via(diag.hit[h.id])}</span>, h.tok))}</div> : <p className="gt-none">{t('awake.noneAwake')}</p>}
    {skipped.length ? <><div className="fx-head gt-sec"><span className="fx-lbl kr ink">{t('awake.sec.skipped')}</span><span className="fx-num">{pad(skipped.length)}</span></div>
      <div className="fx-rows dash" role="list">{skipped.map((s, i) => row(s.e.id, i, true, nameOf(s.e), s.b.name, <span className="fx-pill">{why(s.r)}</span>, engine.tokens(s.e.content)))}</div></> : null}
    <p className="hint gt-asleep">{t('awake.asleep', { n: asleep })}</p>
  </>;
}

function Awake({ chat }: { chat: Chat }) {
  const [tab, setTab] = useState<'last' | 'test'>('last'), [scan, setScan] = useState(() => gather(chat)), [test, setTest] = useState<Scan | null>(null);
  const ta = useRef<HTMLTextAreaElement>(null);
  const run = () => {
    const text = ta.current?.value || ''; if (!text.trim()) return setTest(null);
    const chars = charsOf(chat), persona = S.persona(chat), now = chatApi.current(), books = booksOf(chat), diag: LoreDiag = { hit: {}, skip: {}, used: {} };
    const ctx = engine.makeCtx({ chat, char: chars[0], chars, persona, msgs: now.chat?.id === chat.id ? now.msgs : [] }), keep = JSON.stringify(chat.vars || {});
    try { const hits = engine.scanLore(books, [{ content: text }], ctx, { count: 99999, char: chars[0], persona, diag }); setTest({ hits, diag, real: false, books }); }
    catch (e) { toast(e instanceof Error ? e.message : String(e), 'err'); }
    finally { chat.vars = JSON.parse(keep) as Record<string, string>; }
  };
  const books = scan?.books || booksOf(chat);
  return <div className="gt-awake">
    <header className="gt-top"><BookArt n={(tab === 'test' ? test : scan)?.hits.length || 0} />
      <div className="gt-top-text"><span className="fx-lbl">lore · {tab === 'test' ? 'test' : scan?.real ? 'last reply' : 'preview'}</span><h3 className="fx-title">{t('awake.title')}</h3>
        <p className="gt-sub">{tab === 'test' ? t('awake.sub.test') : !scan ? t('awake.sub.none') : scan.real ? t('awake.sub.real', { time: new Date(scan.diag.at || Date.now()).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) }) : t('awake.sub.preview')}</p></div></header>
    <div className="tabs gt-tabs" role="tablist">{([['last', t('awake.tab.last')], ['test', t('awake.tab.test')]] as const).map(([k, l]) => <button key={k} role="tab" aria-selected={tab === k} className={'tab' + (tab === k ? ' on' : '')} onClick={() => setTab(k)}>{l}</button>)}</div>
    {!books.length ? <div className="fx-empty"><svg className="fx-art" viewBox="0 0 56 56" aria-hidden="true"><path d="M28 36c-5-4-12-4-19-3v14c7-1 14-1 19 3 5-4 12-4 19-3V33c-7-1-14-1-19 3z" /><path d="M28 36v14" className="t" /><path d="M28 28V10" className="d" /></svg><p>{t('awake.noBooks')}</p></div>
      : tab === 'last' ? <>{scan ? <Rows scan={scan} /> : <p className="gt-none">{t('awake.sub.none')}</p>}
        <footer className="gt-foot"><small className="hint">{t('awake.hint')}</small><div className="row wrap"><Btn label={t('awake.again')} ic="refresh" cls="ghost" onClick={() => setScan(gather(chat, true))} /></div></footer></>
      : <><textarea className="inp" rows={4} ref={ta} placeholder={t('awake.test.ph')} aria-label={t('awake.tab.test')} />
        <div className="row wrap"><Btn label={t('awake.test.run')} ic="play" cls="primary" onClick={run} /><small className="hint">{t('awake.test.hint')}</small></div>
        {test ? <Rows scan={test} /> : null}</>}
  </div>;
}
/** 「깨어난 설정」 창을 연다 */
export function loreAwake(chat = chatApi.current().chat) {
  if (!chat) return toast(t('gate.noChat'));
  openModal({ title: t('awake.title'), wide: true, body: <Awake chat={chat} /> });
}
