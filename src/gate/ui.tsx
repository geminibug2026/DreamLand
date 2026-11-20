// 물음의 화면: "이번 턴의 물음" 진단 창 · 물음 시험 · 설정 칸 · 서랍 패널 · 매크로 사전
import { useMemo, useRef, useState, type ReactNode } from 'react';
import { Btn, useEvents } from '../kit';
import { Form, openModal, toast } from '../ui';
import { S, chatConns } from '../lib/core';
import type { Chat } from '../lib/types';
import { chatApi } from '../chat/actions';
import { t } from '../i18n';
import { GATE_PROMPT, cfg, lastTurn, offSeen, resetGate, saveCfg, testAsk } from './logic';
import { modsKey } from './pure';
import { GROUPS, MACRO_DOCS, extraMacros } from './macros';
import type { AskRow, AskTurn } from './types';

// ── 작은 그림 ──
/** 답의 모양: 예 = 찬 달 · 아니오 = 빈 고리 · 유지 = 반달 · 쉬는 중/주기 = 점 하나 · 답 없음 = 점선 고리 */
function Phase({ row }: { row: AskRow }) {
  const k = row.tag === 'held' ? 'held' : row.tag === 'cool' || row.tag === 'every' ? 'wait' : row.tag === 'yes' || row.tag === 'no' ? (row.v ? 'yes' : 'no') : 'none';
  return <svg className="fx-art gt-phase" viewBox="0 0 20 20" width="20" height="20" aria-hidden="true">
    <circle cx="10" cy="10" r="7.5" className={k === 'none' ? 'd' : ''} />
    {k === 'yes' ? <circle cx="10" cy="10" r="5" className="f" /> : k === 'held' ? <path d="M10 5a5 5 0 0 1 0 10z" className="f" /> : k === 'wait' ? <circle cx="10" cy="10" r="1.4" className="f" /> : row.v ? <circle cx="10" cy="10" r="5" className="t" /> : null}
  </svg>;
}
/** 머리 그림: 이번 턴의 물음을 고리 위의 별로 놓는다 (참 = 찬 별). 눈금은 물음 상한 */
function Dial({ rows, max }: { rows: AskRow[]; max: number }) {
  const n = Math.max(max, rows.length, 1), at = (i: number, r: number) => { const a = (i / n) * Math.PI * 2 - Math.PI / 2; return [40 + Math.cos(a) * r, 40 + Math.sin(a) * r]; };
  return <svg className="fx-art gt-dial" viewBox="0 0 80 80" width="80" height="80" aria-hidden="true">
    <circle cx="40" cy="40" r="30" className="t fx-draw" pathLength={1} /><circle cx="40" cy="40" r="20" className="h" />
    {Array.from({ length: n }, (_, i) => { const [x1, y1] = at(i, 33), [x2, y2] = at(i, i % 4 ? 35 : 37); return <path key={'t' + i} className="h" d={`M${x1.toFixed(1)} ${y1.toFixed(1)}L${x2.toFixed(1)} ${y2.toFixed(1)}`} />; })}
    {rows.map((r, i) => { const [x, y] = at(i, 30); return r.v ? <circle key={i} cx={x} cy={y} r="2.6" className="f" /> : <circle key={i} cx={x} cy={y} r="2.4" className="p" />; })}
    <path className="t" d="M40 34v12M34 40h12" /><circle cx="40" cy="40" r="1.3" className="af" />
  </svg>;
}
const pad = (n: number) => String(n).padStart(2, '0');

/** 어디서 왔는지: 'preset:이름' → "프리셋 · 이름" */
function fromLabel(from: string): string {
  const i = from.indexOf(':'), kind = i < 0 ? '' : from.slice(0, i), name = i < 0 ? '' : from.slice(i + 1);
  const head = kind === 'preset' ? t('gate.from.preset') : kind === 'char' ? t('gate.from.char') : kind === 'persona' ? t('gate.from.persona') : kind === 'note' ? t('gate.from.note') : kind === 'lore' ? t('gate.from.lore') : kind === 'entry' ? t('gate.from.entry') : t('gate.from.other');
  return name ? `${head} · ${name}` : head;
}
/** 결과 딱지들 */
function tags(r: AskRow, turn: AskTurn | null): ReactNode {
  const out: ReactNode[] = [], pill = (k: string, text: string, on = false) => out.push(<span key={k} className={'fx-pill' + (on ? ' on' : '')}>{text}</span>);
  if (r.kind === 'pick' && r.tag !== 'over' && r.tag !== 'off' && r.tag !== 'none' && r.tag !== 'unasked') pill('v', r.pick || t('gate.tag.nopick'), !!r.pick);
  else if (r.tag === 'yes' || r.tag === 'no') pill('v', r.v ? t('gate.tag.yes') : t('gate.tag.no'), r.v);
  else if (r.tag === 'held') { pill('v', t('gate.tag.yes'), true); pill('h', r.left == null ? t('gate.tag.heldUntil') : t('gate.tag.held', { n: r.left })); }
  else if (r.tag === 'cool') { pill('v', t('gate.tag.no')); pill('c', t('gate.tag.cool', { n: r.left ?? 0 })); }
  else if (r.tag === 'every') { pill('v', r.v ? t('gate.tag.yes') : t('gate.tag.no'), r.v); pill('e', t('gate.tag.every', { n: r.left ?? 0 })); }
  else if (r.tag === 'none') { pill('v', r.kind === 'pick' ? t('gate.tag.nopick') : t('gate.tag.no')); pill('n', turn?.err === 'timeout' ? t('gate.tag.timeout') : t('gate.tag.none')); }
  else if (r.tag === 'over') { pill('v', t('gate.tag.no')); pill('o', t('gate.tag.over')); }
  else if (r.tag === 'off') pill('o', t('gate.tag.off'));
  else { pill('v', t('gate.tag.no')); pill('u', t('gate.tag.unasked')); }
  if (r.cached) pill('k', t('gate.tag.cached'));
  return out;
}

/** 물음 시험: 문장 하나를 지금 대화에 바로 묻는다 */
function Tester({ chat }: { chat: Chat }) {
  const inp = useRef<HTMLInputElement>(null), [busy, setBusy] = useState(false), [res, setRes] = useState<{ v: boolean | null; ms: number; err?: string; q: string } | null>(null);
  const run = async () => {
    const q = inp.current?.value.trim() || ''; if (!q || busy) return;
    const now = chatApi.current(); if (now.chat?.id !== chat.id) return;
    setBusy(true); try { setRes({ ...(await testAsk(chat, now.msgs, q)), q }); } finally { setBusy(false); }
  };
  return <div className="gt-test">
    <div className="fx-head"><span className="fx-lbl kr">{t('gate.test.title')}</span></div>
    <div className="gt-test-row"><input className="inp" ref={inp} placeholder={t('gate.test.ph')} aria-label={t('gate.test.title')} onKeyDown={e => { if (e.key === 'Enter') void run(); }} />
      <Btn label={busy ? t('gate.test.busy') : t('gate.test.run')} ic="play" onClick={() => void run()} /></div>
    {res ? <div className="gt-test-out fx-in" role="status"><span className={'fx-pill' + (res.v ? ' on' : '')}>{res.v === null ? (res.err === 'timeout' ? t('gate.tag.timeout') : t('gate.tag.none')) : res.v ? t('gate.tag.yes') : t('gate.tag.no')}</span><span className="gt-q">{res.q}</span><span className="fx-num gt-ms">{(res.ms / 1000).toFixed(1)}s</span>{res.v === null && res.err && res.err !== 'timeout' && res.err !== 'unreadable' ? <small className="hint">{res.err}</small> : null}</div>
      : <small className="hint">{t('gate.test.hint')}</small>}
  </div>;
}

function Diag({ chat }: { chat: Chat }) {
  const redraw = useEvents('settings', 'generate:end'), c = cfg();
  const turn = lastTurn(chat), off = offSeen.get(chat.id) || [], rows = c.on ? (turn?.rows || []) : off;
  const yes = rows.filter(r => r.v).length;
  return <div className="gt-diag">
    <header className="gt-top">
      <Dial rows={rows} max={c.max} />
      <div className="gt-top-text">
        <span className="fx-lbl">ask · turn {pad(turn?.T ?? 0)}</span>
        <h3 className="fx-title">{t('gate.diag.title')}</h3>
        <div className="gt-facts">
          <span className="fx-kv"><span>{t('gate.diag.count')}</span><i /><b>{pad(rows.length)} / {pad(c.max)}</b></span>
          <span className="fx-kv"><span>{t('gate.diag.yes')}</span><i /><b>{pad(yes)}</b></span>
          <span className="fx-kv"><span>{t('gate.diag.calls')}</span><i /><b>{c.on && turn ? `${turn.calls} · ${(turn.ms / 1000).toFixed(1)}s` : '0'}</b></span>
        </div>
      </div>
    </header>
    {!c.on ? <div className="gt-note" role="status"><span className="fx-dot" /><p>{t('gate.diag.offNote')}</p><Btn label={t('gate.diag.turnOn')} cls="primary" onClick={() => { c.on = true; saveCfg(); redraw(); }} /></div> : null}
    {c.on && turn?.err ? <div className="gt-note" role="status"><span className="fx-dot" /><p>{turn.err === 'timeout' ? t('gate.diag.timeout', { sec: c.timeout }) : turn.err === 'unreadable' ? t('gate.diag.unreadable') : t('gate.diag.failed', { err: turn.err })}</p></div> : null}
    {rows.length ? <div className="gt-rows fx-rows" role="list">{rows.map((r, i) => <div className="gt-row fx-in" role="listitem" key={r.key + i} style={{ '--d': Math.min(i, 12) * 0.03 + 's' } as React.CSSProperties}>
      <span className="fx-num gt-no">{pad(i + 1)}</span><Phase row={r} />
      <div className="gt-what"><p>{r.stmt}{r.kind === 'pick' && r.options ? <em>{r.options.join(' · ')}</em> : null}</p>
        <small><span>{fromLabel(r.from)}</span>{modsKey(r.mods) ? <code>{[r.mods.sticky && `sticky:${r.mods.sticky}`, r.mods.cooldown && `cooldown:${r.mods.cooldown}`, r.mods.every && `every:${r.mods.every}`, r.mods.until && `until:"${r.mods.until}"`].filter(Boolean).join(' ')}</code> : null}</small></div>
      <div className="gt-tags">{tags(r, turn)}</div>
    </div>)}</div>
      : <div className="fx-empty"><svg className="fx-art" viewBox="0 0 56 56" aria-hidden="true"><circle cx="28" cy="28" r="19" className="d" /><circle cx="28" cy="28" r="11" className="t" /><path d="M28 5v6M28 45v6M5 28h6M45 28h6" className="h" /><circle cx="28" cy="28" r="1.6" className="f" /></svg>
        <p>{c.on ? t('gate.diag.empty') : t('gate.diag.emptyOff')}</p><code className="gt-code">{'{{#if ask:"…"}} … {{/if}}'}</code></div>}
    {c.on ? <Tester chat={chat} /> : null}
    <footer className="gt-foot"><small className="hint">{t('gate.diag.hint')}</small>
      <div className="row wrap"><Btn label={t('gate.dict.open')} ic="book" cls="ghost" onClick={() => macroDict()} />{turn ? <Btn label={t('gate.diag.reset')} ic="refresh" cls="ghost" onClick={async () => { await resetGate(chat); toast(t('gate.diag.resetDone'), 'ok'); redraw(); }} /> : null}</div></footer>
  </div>;
}
/** "이번 턴의 물음" 창 */
export function askDiag(chat = chatApi.current().chat) {
  if (!chat) return toast(t('gate.noChat'));
  openModal({ title: t('gate.title'), wide: true, body: <Diag chat={chat} /> });
}

// ════════ 설정 (기능 화면의 탭) ════════
export function GatePane() {
  cfg();   // 기본값을 채워 둔다 (아래 폼이 settings.gate 를 직접 고친다)
  const redraw = useEvents('settings'), st = S.settings;
  const conns: [string, string][] = [['', t('gate.cfg.connChat')], ...chatConns().map((x): [string, string] => [x.id, `${x.name}${x.model ? ' · ' + x.model : ''}`])];
  return <div className="gt-pane">
    <Form obj={st} defs={[{ section: t('gate.title') },
      { k: 'gate.on', label: t('gate.cfg.on'), type: 'check', hint: t('gate.cfg.onHint'), live: true },
      { k: 'helpers.gate', label: t('gate.cfg.conn'), type: 'select', opts: conns, hint: t('gate.cfg.connHint') },
      { k: 'gate.depth', label: t('gate.cfg.depth'), type: 'num', min: 1, max: 40, third: true }, { k: 'gate.max', label: t('gate.cfg.max'), type: 'num', min: 1, max: 64, third: true }, { k: 'gate.timeout', label: t('gate.cfg.timeout'), type: 'num', min: 1, max: 120, third: true },
      { k: 'gate.prompt', label: t('gate.cfg.prompt'), type: 'area', rows: 6, ph: GATE_PROMPT, hint: t('gate.cfg.promptHint') }]} onChange={() => { S.set({}); redraw(); }} />
    <div className="gt-how">
      <div className="fx-head"><span className="fx-lbl kr">{t('gate.how.title')}</span></div>
      <pre className="gt-code">{'{{#if ask:"{{char}} and {{user}} are arguing" sticky:3}}\nKeep replies short and sharp.\n{{else}}\nTake your time with the scene.\n{{/if}}\n\nPlace: {{ask_pick:"Where is the scene now?"::tavern::forest::castle}}'}</pre>
      <div className="gt-mods fx-rows">{(['sticky', 'cooldown', 'every', 'until'] as const).map(k => <div className="fx-kv" key={k}><code>{k === 'until' ? 'until:"…"' : k + ':N'}</code><i /><span>{t('gate.how.' + k)}</span></div>)}</div>
      <p className="hint">{t('gate.how.note')}</p>
      <div className="row wrap"><Btn label={t('gate.diag.title')} ic="search" cls="ghost" onClick={() => askDiag()} /><Btn label={t('gate.dict.open')} ic="book" cls="ghost" onClick={() => macroDict()} /></div>
    </div>
  </div>;
}

/** 서랍 패널: 켜짐 여부와 마지막 턴 한 줄, 창 여는 단추 */
export function GatePanel({ chat }: { chat: Chat }) {
  const redraw = useEvents('settings', 'generate:end'), c = cfg(), turn = lastTurn(chat), rows = c.on ? (turn?.rows || []) : [];
  return <div className="gt-panel">
    <label className="check"><input type="checkbox" checked={c.on} onChange={e => { c.on = e.target.checked; saveCfg(); redraw(); }} /><i /><span>{t('gate.cfg.on')}</span></label>
    <div className="gt-mini" aria-label={t('gate.diag.title')}>{rows.length ? <><span className="fx-pips round">{rows.slice(0, 16).map((r, i) => <i key={i} className={r.v ? 'on' : ''} />)}</span><span className="fx-num">{pad(rows.filter(r => r.v).length)} / {pad(rows.length)}</span></> : <small className="hint">{c.on ? t('gate.panel.none') : t('gate.panel.off')}</small>}</div>
    <div className="row wrap"><Btn label={t('gate.diag.title')} ic="search" cls="ghost" onClick={() => askDiag(chat)} /><Btn label={t('gate.panel.settings')} ic="sliders" cls="ghost" onClick={() => openModal({ title: t('gate.title'), wide: true, body: <GatePane /> })} /></div>
    <small className="hint">{t('gate.panel.hint')}</small>
  </div>;
}

// ════════ 매크로 사전 ════════
function Dict() {
  const [q, setQ] = useState(''), [hit, setHit] = useState('');
  const extra = useMemo(extraMacros, []);
  const copy = (text: string) => { void navigator.clipboard?.writeText(text).then(() => { setHit(text); setTimeout(() => setHit(h => h === text ? '' : h), 1200); }, () => toast(t('gate.dict.copyFail'), 'err')); };
  const low = q.trim().toLowerCase(), match = (...s: string[]) => !low || s.some(x => x.toLowerCase().includes(low));
  const groups = GROUPS.map(g => ({ g, list: MACRO_DOCS.filter(m => m.group === g && match(m.sig, m.ex || '', t('gate.m.' + m.id), t('gate.dict.g.' + g))) })).filter(x => x.list.length);
  const more = extra.filter(m => match(m.name, m.owner));
  const total = groups.reduce((n, x) => n + x.list.length, 0) + more.length;
  return <div className="gt-dict">
    <div className="gt-dict-bar"><input className="inp search" autoFocus placeholder={t('gate.dict.search')} aria-label={t('gate.dict.search')} value={q} onChange={e => setQ(e.target.value)} /><span className="fx-num gt-dict-n">{pad(total)}</span></div>
    <small className="hint">{t('gate.dict.hint')}</small>
    {groups.map(({ g, list }) => <section key={g} className="gt-dict-sec">
      <div className="fx-head"><span className="fx-lbl kr ink">{t('gate.dict.g.' + g)}</span><span className="fx-num gt-dict-c">{pad(list.length)}</span></div>
      <div className="fx-rows">{list.map(m => <div className="gt-m" key={m.id}>
        <button type="button" className="gt-sig fx-tap" title={t('gate.dict.copy')} onClick={() => copy(m.sig.split('  ·  ')[0])}><code>{m.sig}</code>{hit === m.sig.split('  ·  ')[0] ? <em>{t('gate.dict.copied')}</em> : null}</button>
        <p>{t('gate.m.' + m.id)}</p>
        {m.ex ? <button type="button" className="gt-ex fx-tap" title={t('gate.dict.copy')} onClick={() => copy(m.ex!)}><span className="fx-lbl">ex</span><code>{m.ex}</code>{hit === m.ex ? <em>{t('gate.dict.copied')}</em> : null}</button> : null}
      </div>)}</div></section>)}
    {more.length ? <section className="gt-dict-sec">
      <div className="fx-head"><span className="fx-lbl kr ink">{t('gate.dict.g.more')}</span><span className="fx-num gt-dict-c">{pad(more.length)}</span></div>
      <div className="gt-more">{more.map(m => <button type="button" key={m.name} className="fx-pill fx-tap" title={m.owner ? t('gate.dict.owner', { owner: m.owner }) : t('gate.dict.copy')} onClick={() => copy(`{{${m.name}}}`)}><code>{`{{${m.name}}}`}</code>{hit === `{{${m.name}}}` ? <em>{t('gate.dict.copied')}</em> : null}</button>)}</div></section> : null}
    {!total ? <div className="fx-empty"><svg className="fx-art" viewBox="0 0 56 56" aria-hidden="true"><path d="M14 12h22a6 6 0 0 1 6 6v26H20a6 6 0 0 1-6-6z" className="t" /><path d="M20 22h16M20 28h16M20 34h9" className="h" /><path d="M41 41l8 8" /><circle cx="36" cy="36" r="7" className="p" /><circle cx="36" cy="36" r="7" /></svg><p>{t('gate.dict.none')}</p></div> : null}
  </div>;
}
export function macroDict() { openModal({ title: t('gate.dict.title'), wide: true, body: <Dict /> }); }
