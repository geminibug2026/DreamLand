// 장기기억이 대화 화면 등에 꽂는 것들: 기능 탭 · 프롬프트 · 장면 패널 · 메시지 메뉴 · 연속성 배지 · 명령어 · 매크로 · 이벤트
// 옛 f-memoria.js 는 js/boot.js 의 FEATURES 에서 빠졌다 (등록은 여기 한 곳). 엔진은 그대로 옛 js/memory.js
import { useRef, useState } from 'react';
import { Btn, mountInto } from '../kit';
import { t, tn } from '../i18n';
import { openModal, promptBox, toast } from '../ui';
import type { CmdApi, PromptPiece } from '../memoria/types';
import type { ChatM, Mem, MemCheck, CheckIssue, Msg } from '../memoria/types';
import { TABS, activityText, alive, mount, openArchive, setActivity, setFocus } from '../memoria/ui/Archive';
import { installConfigEvents } from '../memoria/ui/Config';
import { Ico, KindBadge, Meter, None, SceneLine, cur, ensureCfg, isCur, msgsOf, saveCfg, turnTag } from '../memoria/ui/parts';
import { backfill, recordNow } from '../memoria/ui/Tools';
import { Memory } from '../lib/memory';
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
  const any = msgs.some(m => m.memCheck), byId = any ? new Map(msgs.map(m => [m.id, m])) : null;
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
    actions: [{ label: t('common.close') }, { label: t('memoria.feat.check.clear'), cls: 'danger', onclick: async () => { delete msg.memCheck; if (cur().msgs.includes(msg)) await chatApi.save(); decorateAllChecks(); } }] });
}

// ════════ 명령어용 기억 검색 창 ════════
function SearchList({ mem, arg }: { mem: Mem; arg: string }) {
  const r = Memory.recallEx(cur().chat!, mem, [], { query: arg, topK: 10 }), all = [...r.pinned, ...r.triggered, ...r.selected].slice(0, 10);
  return <div className="mm mm-list">{all.map(m => { const s = r.trace.get(m.id)?.score; return <article key={m.id} className="mm-card"><header><KindBadge k={m.kind} /><span className="mm-turn">{turnTag(mem, m)}</span><span className="tokbadge">{s != null ? t('memoria.feat.search.score', { score: s.toFixed(2) }) : t('memoria.feat.search.pinned')}</span></header><p className="mm-sum">{m.summary}</p>{m.quote ? <blockquote>{`"${m.quote}"`}</blockquote> : null}</article>; })}{!all.length ? <None text={t('memoria.feat.search.none')} /> : null}</div>;
}

function setup() {
  if (!document.querySelector('link[data-memoria]')) { const l = document.createElement('link'); l.rel = 'stylesheet'; l.href = new URL('/css/f-memoria.css', location.origin).href; l.dataset.memoria = '1'; document.head.append(l); }
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
    const opts = { msgs, type, preview: commit === false };   // 프롬프트 미리보기는 회상 학습 · 직전 주입 기록 · 고정 장부에 넣지 않는다
    if (M.injection) return M.injection(chat, history, opts);   // 어디에 실을지(한 덩어리 · 나눠 싣기 · 고정 장부)는 엔진이 정한다
    const p = M.packet(chat, history, opts); if (!p) return [];
    const pos = M.cfg().position || 'split', depth = M.cfg().depth ?? 1;
    if (p.fixed || pos !== 'split') return [(pos === 'chat' ? { where: 'depth', depth, order: 60, content: p.text, src: '장기기억' } : { where: 'before', content: p.text, src: '장기기억' }) as PromptPiece];
    const pieces: (PromptPiece | null)[] = [p.stable ? { where: 'before', content: p.stable, src: '장기기억 (줄거리)' } : null, p.live ? { where: 'depth', depth, order: 60, content: p.live, src: '장기기억 (지금)' } : null];
    return pieces.filter((v): v is PromptPiece => !!v);
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
  cmd('/memoria-open', 'memoria.feat.cmd.open', (arg, api) => openArchive(need(api), TABS.some(t => t[0] === String(arg).trim()) ? String(arg).trim() : undefined));
  x.macros.set('memoria_story', { owner: OWNER, fn: () => { const m = M.get(cur().chat?.id as string); return m ? [...m.arcs.filter(a => a.carried), ...[...m.arcs.filter(a => !a.carried), ...m.chunks].sort((a, b) => a.from - b.from)].map(s => s.text).join('\n') : ''; } });
  x.macros.set('memoria_count', { owner: OWNER, fn: () => String(M.get(cur().chat?.id as string)?.memories.length || 0) });

  // ── 이벤트 ──
  on('message:received', async (a?: { msg: Msg; chat: ChatM }) => {
    if (!a) return; const { msg, chat } = a;
    try {
      await M.received(chat, msg);   // 1회용 수정본 폐기 · 직전 주입 기억의 반영 여부 채점
      const cfg = M.cfg(); if (!cfg.enabled) return;
      const msgs = await msgsOf(chat), side = !!M.tagSideMessage?.(chat, msgs, msg) || M.isSideMessage(msg);   // 새 답변이 막간인지 가려 표시한다 — 막간은 기록도 점검도 하지 않는다
      // 연속성 검사 — 그리팅 · 명령어로 들어온 메시지는 보지 않는다. 엔진이 기록과 같은 줄에 세워 보조 모델을 동시에 두 번 부르지 않는다
      if (cfg.replyCheck && M.checkReply && msg?.role === 'assistant' && !side && !msg.greeting && !msg.viaCommand) {
        const checking = t('memoria.feat.ev.checking'); setActivity(checking);
        Promise.resolve(M.checkReply(chat, msgs, msg)).catch(e => { console.warn('[장기기억] 연속성 검사', e); M.logActivity?.('error', t('memoria.feat.ev.checkFail', { why: (e as Error)?.message || e })); })
          .finally(() => { if (activityText() === checking) setActivity(''); if (isCur(chat)) queueDecorate(); });
      }
      // 자동 기록을 꺼 두었어도 연출 · 숨김 · 질의 임베딩은 답변 뒤에 챙긴다 (켜져 있으면 기록이 끝난 뒤 함께 처리된다)
      if (!cfg.auto && !side && (cfg.supervisor || cfg.autoHide || cfg.embed?.mode === 'api')) { const prep = t('memoria.feat.ev.preparing'); setActivity(prep); try { await M.post(chat, msgs); } finally { if (activityText() === prep) setActivity(''); } }
    } catch (e) { console.warn('[장기기억]', e); M.logActivity?.('error', t('memoria.engine.log.eventError', { why: (e as Error)?.message || e })); }
  });
  on('memory:msgs', (chat?: ChatM) => { if (isCur(chat)) chatApi.redraw(); });
  on('memory:check', () => queueDecorate());   // 엔진이 점검 결과를 메시지에 붙였을 때
  on('chat:open', (chat?: ChatM | null) => { setFocus(chat?.id); ensureCfg(); setTimeout(queueDecorate, 600); });
  installConfigEvents();   // 대화를 열면 그 대화의 설정 세트로 갈아 끼운다 (옛 memoria-settings.js 의 chat:open)
}

export const feature = { name: 'memoria', setup, };
