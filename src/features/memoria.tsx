// 장기기억이 대화 화면 등에 꽂는 것들: 기능 탭 · 프롬프트 · 장면 패널 · 메시지 메뉴 · 연속성 배지 · 명령어 · 매크로 · 이벤트
// 옛 f-memoria.js 는 js/boot.js 의 FEATURES 에서 빠졌다 (등록은 여기 한 곳). 엔진은 그대로 옛 js/memory.js
import { useRef, useState } from 'react';
import { Btn, mountInto } from '../kit';
import { t, tn } from '../i18n';
import { confirmBox, openModal, promptBox, toast } from '../ui';
import type { CmdApi, PromptPiece } from '../memoria/types';
import type { ChatM, Mem, MemCheck, CheckIssue, Msg } from '../memoria/types';
import { TABS, activityText, alive, mount, openArchive, setActivity, setFocus } from '../memoria/ui/Archive';
import { installConfigEvents } from '../memoria/ui/Config';
import { Ib, Ico, KindBadge, Meter, None, SceneLine, Sec, cur, ensureCfg, isCur, msgsOf, saveCfg, turnTag } from '../memoria/ui/parts';
import { secName } from '../memoria/ui/Overview';
import { backfill, recordNow } from '../memoria/ui/Tools';
import { Memory, Auditor } from '../lib/memory';
import { X } from '../lib/hooks';
import { chatApi } from '../chat/actions';
import * as memMod from '../lib/memory';
import * as core from '../lib/core';

const OWNER = 'memoria';

// ════════ 장면 패널 ════════
function Panel({ chat, msgs }: { chat: ChatM; msgs: Msg[] }) {
  const M = Memory, cfg = M.cfg(), mem = M.get(chat.id), { fmtDays } = memMod, activity = activityText();
  if (!cfg.enabled) return <><p className="dim">{t('memoria.feat.panel.off')}</p><div className="row wrap"><Btn label={t('memoria.feat.panel.enable')} ic="check" cls="primary" onClick={() => { ensureCfg().enabled = true; saveCfg(); chatApi.redraw(); toast(t('memoria.feat.panel.enabled'), 'ok'); }} /><Btn label={t('memoria.feat.archive')} ic="book" cls="ghost" onClick={() => openArchive(chat)} /></div></>;
  if (!mem) return null;
  const failed = mem.turns.filter(t => t.failed).length, pending = M.pending(mem, msgs).length, last = M.last(chat.id), once = M.overridden(chat.id), busy = M.busy();
  const tile = (n: number | string, l: string, tab: string) => <button onClick={() => openArchive(chat, tab)}><b>{String(n)}</b><span>{l}</span></button>;
  const add = async () => { const v = await promptBox(t('memoria.feat.panel.addPrompt'), '', { area: true, placeholder: t('memoria.feat.panel.addPh') }); if (v?.trim()) { await M.add(chat.id, { summary: v.trim().slice(0, 400), importance: 0.8 }); toast(t('memoria.feat.panel.added'), 'ok'); chatApi.redraw(); } };
  return <>
    <div className="mm-status small"><i className={`mm-lamp${busy ? ' busy' : ''}`} /><div><b>{t('memoria.feat.panel.status')} <em>{activity || (busy ? t('memoria.feat.panel.recording') : cfg.auto ? t('memoria.feat.panel.idle') : t('memoria.feat.panel.manual'))}</em></b><span>{last ? t('memoria.feat.panel.lastInject', { tokens: last.tokens.toLocaleString() }) + (last.fixed ? '' : tn('memoria.feat.panel.lastPicked', last.picked.length)) : t('memoria.feat.panel.noInject')}</span></div></div>
    <div className="mm-stats small">{tile(mem.turns.length, t('memoria.parts.stat.turns'), 'summaries')}{tile(mem.memories.length, t('memoria.parts.stat.memories'), 'memories')}{tile(mem.cast.length, t('memoria.parts.stat.cast'), 'world')}{tile(mem.pledges.filter(p => p.status === 'active').length, t('memoria.parts.stat.pledges'), 'world')}{tile(mem.chunks.length + mem.arcs.length, t('memoria.parts.stat.summaries'), 'summaries')}{tile(mem.clockDays >= 1 / 24 ? fmtDays(mem.clockDays) : '–', t('memoria.parts.stat.clock'), 'summaries')}</div>
    <SceneLine m={mem} />
    {last && !last.fixed ? <div className="mm-budget"><span className="mm-tok">{t('memoria.feat.panel.budget', { n: cfg.tokenBudget.toLocaleString() })}</span><Meter v={last.tokens} max={cfg.tokenBudget} cls="big" /></div> : null}
    {failed ? <button className="mm-alert" onClick={() => void backfill(chat)}><Ico name="refresh" size={14} />{tn('memoria.feat.panel.failed', failed)}</button> : null}
    {!failed && pending > 1 ? <button className="mm-alert soft" onClick={() => void backfill(chat)}><Ico name="feather" size={14} />{tn('memoria.feat.panel.pending', pending)}</button> : null}
    {mem.packetPin?.text ? <button className="mm-alert soft" onClick={() => openArchive(chat, 'overview')}><Ico name="pin" size={14} />{t('memoria.feat.panel.pinned')}</button> : null}{once ? <button className="mm-alert soft" onClick={() => openArchive(chat, 'overview')}><Ico name="edit" size={14} />{t('memoria.feat.panel.once')}</button> : null}
    {cfg.supervisor && mem.direction?.plan?.scene_goal ? <p className="mm-goal"><b>{t('memoria.feat.panel.direction')}</b>{String(mem.direction.plan.scene_goal)}</p> : null}
    <div className="row wrap"><Btn label={t('memoria.feat.archive')} ic="book" title={t('memoria.feat.panel.archiveTitle')} onClick={() => openArchive(chat)} /><Btn label={t('memoria.archive.record.label')} ic="feather" cls="ghost" title={t('memoria.feat.panel.recordTitle')} onClick={() => void recordNow(chat)} />
      <Btn label={t('common.add')} ic="plus" cls="ghost" title={t('memoria.memories.addBtnTitle')} onClick={() => void add()} /><Btn label={t('memoria.overview.ask.btn')} ic="search" cls="ghost" title={t('memoria.overview.ask.title')} onClick={() => askBox(chat)} /></div>
  </>;
}

// ════════ 서고에 질문 (창) ════════
function Ask({ chat, question }: { chat: ChatM; question: string }) {
  const q = useRef<HTMLInputElement>(null), [out, setOut] = useState<string | null>(null), started = useRef(false);
  const run = async () => { const v = q.current?.value.trim() || ''; if (!v) return toast(t('memoria.feat.ask.empty')); setOut(t('memoria.feat.ask.searching')); try { setOut(await Memory.ask(chat, v)); } catch (e) { setOut(t('memoria.feat.ask.fail', { error: (e as Error).message })); } };
  if (question && !started.current) { started.current = true; queueMicrotask(() => void run()); }
  return <div className="col mm"><p className="hint">{t('memoria.feat.ask.hint')}</p>
    <div className="row"><input ref={q} className="inp" defaultValue={question} placeholder={t('memoria.feat.ask.ph')} onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); void run(); } }} /><Btn label={t('memoria.overview.ask.btn')} ic="search" cls="primary" onClick={() => void run()} /></div>
    <div className="mm-answer" hidden={out == null}>{out || ''}</div></div>;
}
const askBox = (chat: ChatM, question = '') => { openModal({ title: t('memoria.overview.ask.title'), wide: true, body: <Ask chat={chat} question={question} />, actions: [{ label: t('common.close') }] }); };

// ════════ 메시지 표시: 연속성 검사 ⚠ (이름 옆 배지 → 누르면 어긋난 곳) ════════
/** 메시지에 붙은 점검 결과 — 그 글에 대한 것일 때만. 글이 바뀌었는지는 엔진이 가린다 */
const checkOf = (msg?: Msg | null): MemCheck | null => { const M = Memory; return M.checkOf ? M.checkOf(msg as Msg) : msg?.memCheck || null; };
function decorateCheck(el: Element, msg?: Msg) {
  const head = el.querySelector('.msg-head'); if (!head) return;
  const c = msg && msg.role === 'assistant' ? checkOf(msg) : null, old = head.querySelector('.mm-check-badge');
  if (!c || (!c.issues?.length && !c.filtered?.length)) { old?.remove(); return; }
  const quiet = !c.issues?.length, text = quiet ? 'ⓘ' : `⚠ ${c.issues!.length}`;
  if (old?.textContent === text) return;
  old?.remove();
  const badge = document.createElement('button'); badge.type = 'button'; badge.className = `mm-check-badge${quiet ? ' quiet' : ''}`; badge.title = quiet ? t('memoria.feat.check.showFiltered') : t('memoria.feat.check.title'); badge.textContent = text;
  badge.addEventListener('click', e => { e.stopPropagation(); showCheckIssues(msg!); });
  const name = head.querySelector('b'); if (name) name.after(badge); else head.append(badge);
}
function decorateAllChecks() {
  const { chat, msgs } = cur(), els = document.querySelectorAll<HTMLElement>('article.msg[data-id]'); if (!chat || !els.length) return;
  const any = msgs.some(m => m.memCheck || m.memChecks), byId = any ? new Map(msgs.map(m => [m.id, m])) : null;
  for (const el of els) { if (byId) decorateCheck(el, byId.get(el.dataset.id || '')); else el.querySelector('.mm-check-badge')?.remove(); }
}
let decoWait = false;
const queueDecorate = () => { if (decoWait) return; decoWait = true; requestAnimationFrame(() => { decoWait = false; try { decorateAllChecks(); } catch (e) { console.warn('[장기기억] 점검 표시', e); } }); };
function Issue({ i }: { i: CheckIssue }) {
  const tone = /^\s*\[말투\]/.test(i.problem || ''), problem = String(i.problem || '').replace(/^\s*\[말투\]\s*/, '');
  return <article className="mm-diff mm-issue"><b>{`“${i.quote || ''}”`}</b><div>{tone ? <em className="mm-tag dash" title={t('memoria.feat.check.toneTitle')}>{t('memoria.feat.check.tone')}</em> : null}{tone ? ' ' : ''}{problem}</div>
    {i.evidence ? <div className="mm-evid">{i.source ? t('memoria.feat.check.evidenceSrc', { source: i.source, text: i.evidence }) : t('memoria.feat.check.evidence', { text: i.evidence })}</div> : null}{i.why ? <div className="mm-evid">{i.why}</div> : null}</article>;
}
function showCheckIssues(msg: Msg) {
  const c = checkOf(msg); if (!c) return;
  openModal({ title: t('memoria.feat.check.title'), wide: true,
    body: <div className="mm mm-review">{(c.issues || []).length ? <div className="mm-review-list">{c.issues!.map((i, n) => <Issue key={n} i={i} />)}</div> : <p className="hint">{t('memoria.feat.check.none')}</p>}
      {(c.filtered || []).length ? <details className="mm-details"><summary>{tn('memoria.feat.check.filtered', c.filtered!.length)}</summary><p className="hint">{t('memoria.feat.check.filteredHint')}</p><div className="mm-review-list">{c.filtered!.map((i, n) => <Issue key={n} i={i} />)}</div></details> : null}</div>,
    actions: [{ label: t('common.close') },
      // 고치기: 메시지 편집을 연다 — 고친 글을 저장하면 엔진이 그 글을 다시 점검한다 (호출 1회)
      { label: t('memoria.feat.check.fix'), ic: 'edit', onclick: () => { const el = document.querySelector(`article.msg[data-id="${CSS.escape(msg.id)}"]`), btn = el?.querySelector<HTMLButtonElement>(`button[aria-label="${CSS.escape(t('chat.msg.edit'))}"]`); if (!btn) return void toast(t('memoria.feat.check.fixMissing')); el!.scrollIntoView({ block: 'center' }); btn.click(); toast(t('memoria.feat.check.fixHint')); } },
      { label: t('memoria.feat.check.clear'), cls: 'danger', onclick: async () => { if (Memory.setCheck && c.h) Memory.setCheck(msg, c.h, null); else delete msg.memCheck; if (cur().msgs.includes(msg)) await chatApi.save(); decorateAllChecks(); } }] });
}

// ════════ 명령어용 기억 검색 창 ════════
function SearchList({ mem, arg }: { mem: Mem; arg: string }) {
  const r = Memory.recallEx(cur().chat!, mem, [], { query: arg, topK: 10 }), all = [...r.pinned, ...r.triggered, ...r.selected].slice(0, 10);
  return <div className="mm mm-list">{all.map(m => { const s = r.trace.get(m.id)?.score; return <article key={m.id} className="mm-card"><header><KindBadge k={m.kind} /><span className="mm-turn">{turnTag(mem, m)}</span><span className="tokbadge">{s != null ? t('memoria.feat.search.score', { score: s.toFixed(2) }) : t('memoria.feat.search.pinned')}</span></header><p className="mm-sum">{m.summary}</p>{m.quote ? <blockquote>{`"${m.quote}"`}</blockquote> : null}</article>; })}{!all.length ? <None text={t('memoria.feat.search.none')} /> : null}</div>;
}

/** 이 메시지에서 나온 기록 (메시지 메뉴 「이 메시지의 기억」) — 그 답변의 턴 기록과 기억들. 묶음 기록이면 그 메시지를 함께 덮은 기록 */
function MsgMemories({ mem, turnMsgId }: { mem: Mem; turnMsgId: string }) {
  const at = mem.turns.findIndex(x => x.msgId === turnMsgId), turn = mem.turns[at], rows = mem.memories.filter(m => m.msgId === turnMsgId);
  return <div className="mm mm-list">{turn?.digest ? <p className="mm-sum"><b>{`t${at + 1}${turn.star ? ' ★' : ''}`}</b>{' — '}{turn.digest}</p> : null}
    {rows.map(m => <article key={m.id} className="mm-card"><header><KindBadge k={m.kind} /><span className="mm-turn">{turnTag(mem, m)}</span>{m.retired ? <span className="tokbadge">{t('memoria.memories.only.retired')}</span> : null}</header><p className="mm-sum">{m.summary}</p>{m.quote ? <blockquote>{`"${m.quote}"`}</blockquote> : null}</article>)}{!rows.length ? <None text={t('memoria.feat.act.memsNone')} /> : null}</div>;
}

/** 이 답에 실린 기억 — 답이 도착할 때 엔진이 적어 둔 것을 보여 준다. 고정(핀)하면 다음 답부터 늘 실린다 */
function ShownMemories({ mem, msg }: { mem: Mem; msg: Msg }) {
  const M = Memory, [, bump] = useState(0), e = M.shownFor?.(mem, msg);
  if (!e) return <div className="mm mm-list"><None text={t('memoria.feat.shown.none')} /></div>;
  const inc = e.rows.filter(r => r.inc), miss = e.rows.filter(r => !r.inc), total = e.sections.reduce((n, s) => n + s.tokens, 0) || 1;
  const pin = async (id: string) => { const m = mem.memories.find(x => x.id === id); if (!m) return; m.pinned = !m.pinned; await M.save(mem); bump(n => n + 1); toast(m.pinned ? t('memoria.feat.shown.pinned') : t('memoria.feat.shown.unpinned'), 'ok'); };
  const row = (r: typeof e.rows[number]) => {
    const m = mem.memories.find(x => x.id === r.id);
    return <div key={r.id} className={`mm-recall${r.inc ? '' : ' off'}`}><em className={`mm-flag${r.inc ? ' on' : ''}`}>{r.inc ? t('memoria.overview.included') : t('memoria.overview.excluded')}</em>
      <div className="mm-recall-main"><div><KindBadge k={r.kind} />{' '}{m?.summary || r.summary}</div>
        <small>{[m ? turnTag(mem, m) : t('memoria.feat.shown.gone'), r.why || t('memoria.overview.related'), r.out ? `→ ${r.out}` : ''].filter(Boolean).join(' · ')}</small></div>
      {m ? <Ib name="pin" cls={m.pinned ? 'on' : ''} title={m.pinned ? t('memoria.memories.unpin') : t('memoria.feat.shown.pinTitle')} onClick={() => void pin(r.id)} /> : null}</div>;
  };
  return <div className="mm mm-list mm-shown">
    <p className="hint">{t('memoria.feat.shown.head', { tokens: e.tokens.toLocaleString(), inc: inc.length, miss: miss.length })}</p>
    {e.intent || e.short || e.centered ? <div className="mm-chips">{e.intent ? <span className="mm-chip">{t('memoria.feat.shown.intent.' + e.intent)}</span> : null}{e.short ? <span className="mm-chip">{t('memoria.feat.shown.short')}</span> : null}{e.centered ? <span className="mm-chip">{t('memoria.feat.shown.centered')}</span> : null}</div> : null}
    {e.sections.length ? <div className="mm-chips">{e.sections.map((s, i) => <span key={i} className="mm-chip"><i className={`mm-dot s${i % 6}`} />{`${secName(s.name)} ${Math.round(s.tokens / total * 100)}%`}</span>)}</div> : null}
    <Sec title={t('memoria.feat.shown.inc')}>{inc.length ? inc.map(row) : <None text={t('memoria.feat.shown.incNone')} />}</Sec>
    {miss.length ? <Sec title={t('memoria.feat.shown.miss')} desc={t('memoria.feat.shown.missDesc')}>{miss.map(row)}</Sec> : null}
  </div>;
}

// ════════ 대화를 연 뒤 · 답변을 받은 뒤 틈날 때 미리 읽어 두기 ════════
/**
 * 서로 부르는 말은 최근 80메시지의 대사마다 말한 사람을 찾아야 해서 무겁다 (대사가 많은 긴 답변일수록). 엔진이 메시지마다 결과를 기억해 두지만,
 * 안 읽어 둔 메시지는 다음 답변 요청 때 한꺼번에 읽느라 그 요청이 늦게 떠났다 — 방을 연 뒤의 첫 요청이 특히 그랬다.
 * 쉬는 틈에 메시지 하나씩 미리 읽어 둔다 (읽기만 한다 — 서고는 바뀌지 않는다). 장기기억이 꺼져 있거나 답변을 받는 중이면 하지 않는다
 */
let warmJob = 0;
function warmAddress(chat?: ChatM | null, wait = 1500) {
  const job = ++warmJob, M = Memory; if (!chat || !M.cfg().enabled) return;
  const later = (fn: (d?: IdleDeadline) => void) => { if (typeof window.requestIdleCallback === 'function') window.requestIdleCallback(fn, { timeout: 2000 }); else setTimeout(fn, 120); };
  let at = -1;
  const step = (d?: IdleDeadline) => {
    try {
      do {
        const c = M.cfg(), now = cur(); if (job !== warmJob || !c.enabled || c.addressTerms === false || !isCur(chat) || now.busy) return;
        const mem = M.get(chat.id), msgs = now.msgs; if (!mem || !msgs.length) return;
        if (at < 0 && String(M.scene(mem).present || '').split(/[,，、]/).filter(x => x.trim()).length < 2) return;   // 장면에 둘 이상 있을 때만 장부에 실린다
        if (at < 0 || at > msgs.length) at = msgs.length;
        if (at <= Math.max(0, msgs.length - 80)) return;
        at--; M.addressRows(chat, mem, msgs.slice(at, at + 1));   // 끝에서부터 하나씩 — 이미 읽은 메시지는 엔진이 건너뛴다
      } while (d && !d.didTimeout && d.timeRemaining() > 6);
      later(step);
    } catch (e) { console.warn('[장기기억] 부르는 말 미리 읽기', e); }
  };
  setTimeout(() => later(step), wait);
}

function setup() {
  if (!document.querySelector('link[data-memoria]')) { const l = document.createElement('link'); l.rel = 'stylesheet'; l.href = new URL('css/f-memoria.css', document.baseURI).href; l.dataset.memoria = '1'; document.head.append(l); }
  const x = X, { on } = core, M = Memory, { fmtDays } = memMod;
  // 옛 모듈이 먼저 꽂아 둔 것이 있으면 걷어 내고 꽂는다
  for (const [k, v] of x.commands) if (v.owner === OWNER) x.commands.delete(k);
  for (const [k, v] of x.macros) if (v.owner === OWNER) x.macros.delete(k);
  x.studio = x.studio.filter(p => p.owner !== OWNER); x.before = x.before.filter(p => p.owner !== OWNER);
  x.prompt = x.prompt.filter(p => p.owner !== 'memory' && p.owner !== OWNER); x.panels = x.panels.filter(p => p.owner !== 'memory' && p.owner !== OWNER); x.actions = x.actions.filter(a => a.owner !== OWNER);

  // ── 기능 탭 · 프롬프트 ──
  let studioOff: (() => void) | null = null;
  x.studio.push({ owner: OWNER, get title() { return t('studio.tab.memoria'); }, render: () => { studioOff?.(); const host = document.createElement('div'); host.className = 'card mm-card-host'; studioOff = mount(host, { chatId: cur().chat?.id }).off; return host; } });
  x.before.push({ owner: OWNER, fn: ({ chat, msgs, type }) => M.prepare(chat, msgs, { type }) });   // 임베딩 회상은 프롬프트를 짓기 전에 미리 다녀온다
  x.prompt.push({ owner: OWNER, fn: ({ chat, history, msgs, type, commit }) => {
    const mem0 = M.cfg().enabled ? M.get(chat.id) : null;
    if (mem0 && msgs && commit !== false) {   // 지우거나 고친 답변 · 다시 생성하는 답변에서 나온 기록은 싣기 전에 걷어 낸다
      let changed = M.reconcile(mem0, msgs); const tail = msgs[msgs.length - 1];
      if ((type === 'regen' || type === 'swipe') && tail?.role === 'assistant' && mem0.turns.some(t => t.msgId === tail.id)) { M.dropTurn(mem0, tail.id); changed = true; }
      if (changed) M.save(mem0).catch(e => console.warn('[장기기억]', e));
    }
    // 장부는 "마지막 메시지 바로 앞"(깊이 1)에 들어가는데, 내 입력이 끝에 있으면 [마지막 답변] [장부] [내 입력] 이 되어
    // 몇 답변 늦은 장부의 장면 · 상태가 가장 무게가 실리는 자리에서 "지금"으로 읽힌다. 끝의 입력들과 마지막 답변 위로 올려 [장부] [마지막 답변] [내 입력] 이 되게 한다
    const lift = (pieces: PromptPiece[]) => { let k = 0; for (let i = history.length - 1; i >= 0 && history[i].role === 'user'; i--) k++; if (!k || k >= history.length) return pieces; return pieces.map(p => p.where === 'depth' && (p.depth ?? 1) <= k ? { ...p, depth: k + 1 } : p); };
    const opts = { msgs, type, preview: commit === false };   // 프롬프트 미리보기는 회상 학습 · 직전 주입 기록 · 고정 장부에 넣지 않는다
    if (M.injection) return lift(M.injection(chat, history, opts) as PromptPiece[]);   // 어디에 실을지(한 덩어리 · 나눠 싣기 · 고정 장부)는 엔진이 정한다
    const p = M.packet(chat, history, opts); if (!p) return [];
    const pos = M.cfg().position || 'split', depth = M.cfg().depth ?? 1;
    if (p.fixed || pos !== 'split') return lift([(pos === 'chat' ? { where: 'depth', depth, order: 60, content: p.text, src: '장기기억' } : { where: 'before', content: p.text, src: '장기기억' }) as PromptPiece]);
    const pieces: (PromptPiece | null)[] = [p.stable ? { where: 'before', content: p.stable, src: '장기기억 (줄거리)' } : null, p.live ? { where: 'depth', depth, order: 60, content: p.live, src: '장기기억 (지금)' } : null];
    return lift(pieces.filter((v): v is PromptPiece => !!v));
  } });

  // ── 장면 패널 · 메시지 메뉴 ──
  let panelOff: (() => void) | null = null;
  x.panels.push({ owner: OWNER, get title() { return t('studio.tab.memoria'); }, icon: 'book', render: (chat, msgs) => { panelOff?.(); const on = M.cfg().enabled, mem = on && M.get(chat.id); if (on && !mem) { const p = document.createElement('p'); p.className = 'dim'; p.textContent = t('memoria.feat.panel.loading'); return p; }
    const host = document.createElement('div'); host.className = on ? 'col mm-panel' : 'col'; panelOff = mountInto(host, <Panel chat={chat} msgs={msgs || []} />); return host; } });
  x.actions.push({ owner: OWNER, id: 'memoria-record', get label() { return t('memoria.feat.act.record'); }, icon: 'feather', run: async (msg, chat) => {
    if (msg.role !== 'assistant') return toast(t('memoria.feat.act.onlyAssistant'));
    ensureCfg(); chatApi.setStatus(t('memoria.feat.act.organizing'));
    try { const mem = await M.commit(chat!, cur().msgs, msg, { force: true }); const tt = mem.turns.find(y => y.msgId === msg.id); toast(tt?.failed ? t('memoria.feat.act.recordFailMsg', { error: tt.error || '' }) : t('memoria.feat.act.recorded'), tt?.failed ? 'err' : 'ok'); } catch (e) { toast(t('memoria.feat.act.recordFail', { error: (e as Error).message }), 'err'); } finally { chatApi.setStatus(''); chatApi.redraw(); }
  } });
  /** 메시지 하나를 막간/이야기로 직접 고른다 (설정의 「막간 분류」와 같은 처리 — 메뉴 문구는 고정이라 누를 때마다 뒤집는다) */
  x.actions.push({ owner: OWNER, id: 'memoria-side', get label() { return t('memoria.feat.act.side'); }, icon: 'moon', run: async (msg, chat) => {
    const cfg = ensureCfg(), msgs = cur().msgs, no = msgs.indexOf(msg) + 1;
    if ((cfg.qrMode || 'side') === 'keep') return toast(t('memoria.feat.act.qrKeep'));
    const was = M.isSideMessage(msg), side = !was, mem = await M.load(chat!.id);
    msg.memSide = side;
    if (msg.role === 'assistant' && side && mem.turns.some(t => t.msgId === msg.id)) M.dropTurn(mem, msg.id);   // 이미 기록된 막간은 그 턴의 기억째로 걷어 낸다
    delete msg.memCheck;   // 막간은 점검하지 않는다 — 옛 경고도 지운다
    await chatApi.save(); M.reconcile(mem, msgs); await M.save(mem); chatApi.redraw();
    if (side) M.logActivity?.('side', t('memoria.engine.log.side', { n: no }));
    toast(side ? t('memoria.feat.act.sideOn', { n: no }) : msg.role === 'assistant' && cfg.enabled && cfg.auto ? t('memoria.feat.act.sideOffRerecord', { n: no }) : t('memoria.feat.act.sideOff', { n: no }), 'ok');
    if (!side && msg.role === 'assistant' && cfg.enabled && cfg.auto) Promise.resolve(M.commit(chat!, msgs, msg)).catch(e => console.warn('[장기기억]', e));   // 기록 지연은 commit 이 스스로 따진다
  } });

  /** 중요 장면 표시 — 기록할 때 그 턴의 무게를 올려 요약이 빠뜨리지 않게 하고, 거기서 나온 기억을 정리에서 지킨다 (모델 호출 없음. 누를 때마다 뒤집는다) */
  x.actions.push({ owner: OWNER, id: 'memoria-star', get label() { return t('memoria.feat.act.star'); }, icon: 'star', run: async (msg, chat) => {
    if (msg.role !== 'assistant') return toast(t('memoria.feat.act.onlyAssistant'));
    const on = !msg.memStar, no = cur().msgs.indexOf(msg) + 1, mem = await M.load(chat!.id);
    if (on) msg.memStar = true; else delete msg.memStar;
    await chatApi.save(); const n = M.starTurn ? M.starTurn(mem, msg.id, on) : 0; if (n || M.turnOfMsg?.(mem, msg.id)) await M.save(mem);
    toast(!on ? t('memoria.feat.act.starOff', { n: no }) : M.turnOfMsg?.(mem, msg.id) ? t('memoria.feat.act.starOn', { n: no }) : t('memoria.feat.act.starOnLater', { n: no }), 'ok');
  } });
  x.actions.push({ owner: OWNER, id: 'memoria-of', get label() { return t('memoria.feat.act.mems'); }, icon: 'book', run: async (msg, chat) => {
    const mem = await M.load(chat!.id), turn = M.turnOfMsg?.(mem, msg.id), no = cur().msgs.indexOf(msg) + 1;
    if (!turn) return toast(t('memoria.feat.act.memsNoTurn', { n: no }));
    openModal({ title: t('memoria.feat.act.memsTitle', { n: no }), wide: true, body: <MsgMemories mem={mem} turnMsgId={turn.msgId} />, actions: [{ label: t('common.close') }, { label: t('memoria.feat.archive'), ic: 'book', onclick: () => openArchive(chat!, 'memories') }] });
  } });

  /** 이 답(지금 보이는 스와이프)을 만들 때 실린 기억과 아깝게 빠진 기억 — 왜 실렸는지 보고, 그 자리에서 고정할 수 있다 (모델 호출 없음) */
  x.actions.push({ owner: OWNER, id: 'memoria-shown', get label() { return t('memoria.feat.shown.act'); }, icon: 'eye', run: async (msg, chat) => {
    if (msg.role !== 'assistant') return toast(t('memoria.feat.act.onlyAssistant'));
    const mem = await M.load(chat!.id), no = cur().msgs.indexOf(msg) + 1;
    openModal({ title: t('memoria.feat.shown.title', { n: no }), wide: true, body: <ShownMemories mem={mem} msg={msg} />, actions: [{ label: t('common.close') }, { label: t('memoria.feat.archive'), ic: 'book', onclick: () => openArchive(chat!, 'overview') }] });
  } });

  // ── 입력 칸에 글을 쓰는 중인지 엔진에 알린다 (요약 · 서고 정리가 곧 올 답변과 겹치지 않게 미룬다) ──
  document.addEventListener('input', e => { const el = e.target; if (el instanceof HTMLTextAreaElement && el.classList.contains('composer-input')) M.noteTyping?.(!!el.value.trim()); }, true);

  // ── 연속성 배지: 대화 화면은 메시지를 통째로 다시 그린다 — 메시지 요소가 새로 붙을 때마다 배지를 다시 단다 ──
  new MutationObserver(list => { for (const r of list) for (const n of r.addedNodes) if (n instanceof Element && (n.classList.contains('msg') || n.querySelector('article.msg'))) return queueDecorate(); }).observe(document.body, { childList: true, subtree: true });

  // ── 명령어 · 매크로 ──
  const need = (api: CmdApi) => { const c = api.current().chat; if (!c) throw new Error(t('memoria.feat.cmd.needChat')); return c; };
  const flip = (key: 'enabled' | 'auto', arg: string, label: string) => { const m = ensureCfg(), v = String(arg || '').trim().toLowerCase(); m[key] = v === 'on' ? true : v === 'off' ? false : !m[key]; saveCfg(); toast(`${label}: ${m[key] ? 'ON' : 'OFF'}`); for (const st of alive()) st.draw(); chatApi.redraw(); };
  const cmd = (name: string, helpKey: string, run: (arg: string, api: CmdApi) => unknown) => x.commands.set(name, { owner: OWNER, get help() { return t(helpKey); }, run });
  cmd('/memoria', 'memoria.feat.cmd.memoria', arg => flip('enabled', arg, t('studio.tab.memoria')));
  cmd('/memoria-autorecord', 'memoria.feat.cmd.autorecord', arg => flip('auto', arg, t('memoria.feat.cmd.autoLabel')));
  cmd('/memoria-remember', 'memoria.feat.cmd.remember', async (arg, api) => { const chat = need(api), text = String(arg || '').replace(/\s+/g, ' ').trim().slice(0, 300); if (!text) throw new Error(t('memoria.feat.cmd.empty')); await M.add(chat.id, { summary: text, importance: 0.8 }); toast(t('memoria.feat.cmd.remembered', { text }), 'ok'); chatApi.redraw(); });
  cmd('/memoria-search', 'memoria.feat.cmd.search', async (arg, api) => { const chat = need(api), mem = await M.load(chat!.id); openModal({ title: t('memoria.feat.cmd.searchTitle', { query: arg || '' }), wide: true, body: <SearchList mem={mem} arg={String(arg || '')} />, actions: [{ label: t('common.close') }] }); });
  cmd('/memoria-ask', 'memoria.feat.cmd.ask', (arg, api) => askBox(need(api), String(arg || '').trim()));
  cmd('/memoria-index', 'memoria.feat.cmd.index', (_arg, api) => backfill(need(api)));
  cmd('/memoria-clock', 'memoria.feat.cmd.clock', async (_arg, api) => { const chat = need(api), mem = await M.load(chat.id), fmt = (d: number) => d >= 1 ? fmtDays(d) : t('memoria.feat.cmd.lessDay'); api.setStatus(t('memoria.feat.cmd.clockBusy')); try { const r = await M.recalClock(chat, mem); toast(r ? t('memoria.feat.cmd.clockDone', { after: fmt(r.after), before: fmt(r.before) }) : t('memoria.feat.cmd.clockNone'), r ? 'ok' : ''); } finally { api.setStatus(''); } });
  cmd('/memoria-reconcile', 'memoria.feat.cmd.reconcile', async (_arg, api) => { const chat = need(api), mem = await M.load(chat.id), n = mem.turns.length, ch = M.reconcile(mem, api.current().msgs); if (ch) await M.save(mem); toast(ch ? t('memoria.feat.cmd.reconciled', { before: n, after: mem.turns.length }) : t('memoria.feat.cmd.inSync'), ch ? 'ok' : ''); chatApi.redraw(); });
  // #N 뒤의 기록만 걷어 내고 그 앞 모습으로 되돌린다 — 메시지는 그대로라 걷어 낸 구간은 자동 기록 · 색인이 새로 기록한다
  cmd('/memoria-cut', 'memoria.feat.cmd.cut', async (arg, api) => {
    const chat = need(api), msgs = api.current().msgs, n = Number(String(arg || '').trim().replace(/^#/, ''));
    if (!Number.isInteger(n) || n < 0 || !String(arg || '').trim()) throw new Error(t('memoria.feat.cmd.cutArg'));
    if (M.busy()) throw new Error(t('memoria.tools.reset.busy'));
    const mem = await M.load(chat.id), order = new Map(msgs.map((m, i) => [m.id, i])), count = mem.turns.filter(y => (order.get(y.msgId) ?? -1) >= n).length;
    if (!count) return toast(t('memoria.feat.cmd.cutNone', { n }));
    if (!(await confirmBox(t('memoria.feat.cmd.cutAsk', { n, count }), t('memoria.feat.cmd.cutOk'), true))) return;
    await M.checkpoint(mem, t('memoria.feat.cmd.cutLabel', { n })).catch(() => null);
    const gone = M.cutAfter ? M.cutAfter(mem, msgs, n) : 0; await M.save(mem);
    if (M.restoreHidden?.(chat, mem, msgs)) await chatApi.save();
    M.reinjectNow?.(chat); toast(t('memoria.feat.cmd.cutDone', { n, count: gone }), 'ok'); for (const st of alive()) st.draw(); chatApi.redraw();
  });
  cmd('/memoria-open', 'memoria.feat.cmd.open', (arg, api) => openArchive(need(api), TABS.some(t => t[0] === String(arg).trim()) ? String(arg).trim() : undefined));
  x.macros.set('memoria_story', { owner: OWNER, fn: () => { const m = M.get(cur().chat?.id as string); return m ? [...m.arcs.filter(a => a.carried), ...[...m.arcs.filter(a => !a.carried), ...m.chunks].sort((a, b) => a.from - b.from)].map(s => s.text).join('\n') : ''; } });
  x.macros.set('memoria_count', { owner: OWNER, fn: () => String(M.get(cur().chat?.id as string)?.memories.length || 0) });

  // ── 이벤트 ──
  on('message:received', async (a?: { msg: Msg; chat: ChatM }) => {
    if (!a) return; const { msg, chat } = a;
    try {
      const msgs0 = await Promise.resolve(msgsOf(chat)).catch(() => null);   // 답변의 자리를 알아야 회상 이력(쉬어가기)을 적는다 — 못 읽어도 아래 채점은 한다
      await M.received(chat, msg, msgs0);   // 1회용 수정본 폐기 · 직전 주입 기억의 반영 여부 채점
      const cfg = M.cfg(); if (!cfg.enabled) return;
      const msgs = msgs0 || await msgsOf(chat), side = !!M.tagSideMessage?.(chat, msgs, msg) || M.isSideMessage(msg);   // 새 답변이 막간인지 가려 표시한다 — 막간은 기록도 점검도 하지 않는다
      // 연속성 검사 — 그리팅 · 명령어로 들어온 메시지는 보지 않는다. 엔진이 기록과 같은 줄에 세워 보조 모델을 동시에 두 번 부르지 않는다
      if (cfg.replyCheck && M.checkReply && msg?.role === 'assistant' && !side && !msg.greeting && !msg.viaCommand) {
        const checking = t('memoria.feat.ev.checking'); setActivity(checking);
        Promise.resolve(M.checkReply(chat, msgs, msg)).catch(e => { console.warn('[장기기억] 연속성 검사', e); M.logActivity?.('error', t('memoria.feat.ev.checkFail', { why: (e as Error)?.message || e })); })
          .finally(() => { if (activityText() === checking) setActivity(''); if (isCur(chat)) queueDecorate(); });
      }
      // 답 N개마다 한 번 검사 (답변마다 검사와는 함께 돌지 않는다) — N개가 찼을 때만 엔진이 호출 1회를 줄에 세운다
      else if (Auditor.mode() === 'batch' && msg?.role === 'assistant' && !side && !msg.greeting && !msg.viaCommand) Promise.resolve(Auditor.onReply(chat, msgs, msg)).catch(e => console.warn('[장기기억] 어긋난 곳 검사', e)).finally(() => { if (isCur(chat)) queueDecorate(); });
      // 이 답변의 기록을 장부에 적어 둔다 — 방을 나가 있어 답변 뒤 처리가 돌지 않아도, 창을 닫아도 나중에 이어서 적는다
      if (cfg.auto && msg?.role === 'assistant' && !side) Auditor.owe(chat, msg);
      // 자동 기록을 꺼 두었어도 연출 · 숨김 · 질의 임베딩은 답변 뒤에 챙긴다 (켜져 있으면 기록이 끝난 뒤 함께 처리된다)
      if (!cfg.auto && !side && (cfg.supervisor || cfg.autoHide || cfg.embed?.mode === 'api')) { const prep = t('memoria.feat.ev.preparing'); setActivity(prep); try { await M.post(chat, msgs); } finally { if (activityText() === prep) setActivity(''); } }
    } catch (e) { console.warn('[장기기억]', e); M.logActivity?.('error', t('memoria.engine.log.eventError', { why: (e as Error)?.message || e })); }
  });
  on('message:received', (a?: { chat?: ChatM }) => warmAddress(a?.chat, 800));   // 새 답변의 부르는 말도 다음 요청 전에 읽어 둔다
  on('memory:msgs', (chat?: ChatM) => { if (isCur(chat)) chatApi.redraw(); });
  on('memory:hidden-first', (d?: { chat: ChatM; n: number }) => { if (d && isCur(d.chat)) toast(t('memoria.feat.hiddenFirst', { n: d.n })); });
  on('memory:unhid', (d?: { chat: ChatM; n: number }) => { if (d && isCur(d.chat)) toast(t('memoria.feat.unhid', { n: d.n })); });
  on('memory:check', () => queueDecorate());   // 엔진이 점검 결과를 메시지에 붙였을 때
  // 뒤에서 도는 기억 작업(기록 · 검사 · 채점 · 수정)을 머리 · 패널의 「상태:」 줄에 띄운다
  let jobText = ''; on('memory:job', (j?: { text?: string } | null) => { const text = j?.text || ''; if (text || activityText() === jobText) setActivity(text); jobText = text; });
  on('chat:open', (chat?: ChatM | null) => { setFocus(chat?.id); ensureCfg(); setTimeout(queueDecorate, 600); warmAddress(chat); });
  installConfigEvents();   // 대화를 열면 그 대화의 설정 세트로 갈아 끼운다 (옛 memoria-settings.js 의 chat:open)
}

export const feature = { name: 'memoria', setup, };
