// 장기기억 설정 탭: 설정 찾기 · 설정 세트 · 모든 설정 묶음 · 프롬프트 (부품과 창은 ConfigParts.tsx)
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Btn } from '../../kit';
import type { ChatM, Mem } from '../types';
import { BundleBar, Grid, Ico, M, Note, Num, SX, SearchBox, Sel, Tb, Tog, Txt, applySearch, bundleDefaults, bundleOwner, get, openRepeatFinder, openSideSorter, put, reinject, searchInput, useNative } from './ConfigParts';
import { Sec, busyBtn, ensureCfg, persistMsgs, saveCfg, useBump, type St } from './parts';
import { S } from '../../lib/core';
import { toast } from '../../ui';
import { tokens } from '../../lib/engine';
import { t, fmtNum } from '../../i18n';
import * as memMod from '../../lib/memory';
import * as core from '../../lib/core';
import * as libEmbed from '../../lib/embed';

export { bundleDefaults, bundleOwner };

// ════════ 기억 · 서술 방식 ════════
const shared = () => ['', memMod.PUBLIC_ONLY, memMod.NARRATOR];
const hasLocal = (mem: Mem | null) => !mem ? false : M().hasChatPerspective ? !!M().hasChatPerspective!(mem) : typeof mem.perspective === 'string';
async function setPersp(st: St, value: string, local: boolean) {
  if (typeof value !== 'string' || (!local && !shared().includes(value))) throw new Error(t('memoria.config.persp.errPick'));
  if (local && !(st.chat && st.mem)) throw new Error(t('memoria.config.persp.errNoChat'));
  const Mm = M();
  if (Mm.setPerspectivePreference) await Mm.setPerspectivePreference(st.mem, value, local);
  else { if (!local) { ensureCfg().perspective = value; saveCfg(); } if (st.mem) { if (local) st.mem.perspective = value; else delete st.mem.perspective; await Mm.save(st.mem); } }
  if (st.chat) Mm.override(st.chat.id, null); st.draft = null;   // 고쳐 둔 장부 · 초안은 새 방식과 맞지 않는다
}
function PerspBox({ st }: { st: St }) {
  const { PUBLIC_ONLY, NARRATOR } = memMod, SHARED = shared();
  const m = ensureCfg(), chat = st.chat, mem = st.mem, local = hasLocal(mem), pv = mem ? M().perspective(mem) : (m.perspective || ''), group = (chat?.charIds || []).length > 1, lead = S.get('chars', chat?.charIds?.[0])?.name || '';
  const opts: [string, string][] = [['', group ? t('memoria.config.persp.optAutoGroup') : t('memoria.config.persp.optAuto', { name: lead || t('memoria.config.persp.curChar') })], [PUBLIC_ONLY, t('memoria.config.persp.optPublic')], [NARRATOR, t('memoria.config.persp.optNarrator')]];
  if (local && mem) { const names = new Set(mem.cast.filter(c => !c.disabled).map(c => c.name)); if (lead && !group) names.add(lead); if (mem.perspective && !SHARED.includes(mem.perspective)) names.add(mem.perspective); for (const n of names) opts.push([n, n]); }
  const run = (fn: () => Promise<void>) => void fn().catch((e: Error) => toast(e.message || String(e), 'err')).finally(() => st.draw());
  let help = pv === NARRATOR ? t('memoria.config.persp.helpNarrator')
    : pv === PUBLIC_ONLY ? t('memoria.config.persp.helpPublic')
      : pv ? t('memoria.config.persp.helpPerson', { name: pv })
        : group ? t('memoria.config.persp.helpGroup')
          : t('memoria.config.persp.helpAuto', { name: lead || t('memoria.config.persp.otherChar') });
  if (m.authorizePrivate === false && pv !== PUBLIC_ONLY) help += t('memoria.config.persp.helpPrivateOff');
  return <div className="mm-persp mm-optset">
    <label className="field"><span className="field-label">{local ? t('memoria.config.persp.labelLocal') : t('memoria.config.persp.labelDefault')}</span>
      <select className="inp" aria-label={t('memoria.config.persp.aria')} defaultValue={pv} onChange={e => { const v = String(e.target.value || ''); run(() => setPersp(st, v, local)); }}>{opts.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></label>
    <label className="check mm-opt"><input type="checkbox" defaultChecked={local} disabled={!(chat && mem)} onChange={e => { const on = e.target.checked; run(() => setPersp(st, on ? pv : (SHARED.includes(m.perspective) ? m.perspective : ''), on)); }} /><i />
      <span className="mm-opt-text"><b>{t('memoria.config.persp.localTog')}</b><small>{t('memoria.config.persp.localTogHint')}</small></span></label>
    <small className="hint">{local ? t('memoria.config.persp.hintLocal') : t('memoria.config.persp.hintDefault')}</small>
    <small className="hint">{help}</small><small className="hint">{t('memoria.config.persp.hintSecrets')}</small></div>;
}

// ════════ 프롬프트 ════════
const PROMPT_LABELS: Record<string, string> = { archivist: 'memoria.config.prompt.name.archivist', supervisor: 'memoria.config.prompt.name.supervisor', chunk: 'memoria.config.prompt.name.chunk', arc: 'memoria.config.prompt.name.arc' };
const pKey = (k: string) => k === 'archivist' ? 'prompt' : `prompts.${k}`;   // 빈 문자열 = 기본값
const pDef = (k: string) => M().promptDefault?.(k) ?? memMod.PROMPTS[k];
const pOutdated = () => M().promptOutdated ? M().promptOutdated!() : Object.keys(ensureCfg().promptOutdated || {}).filter(k => get(pKey(k)) && get(pKey(k)) !== pDef(k));
function PromptEdit({ st, k, label, rows }: { st: St; k: string; label: string; rows: number }) {
  const bump = useBump(), def = pDef(k), mine = String(get(pKey(k)) || '');
  const set = (ta: HTMLTextAreaElement) => { const v = String(ta.value); put(pKey(k), v === def || !v.trim() ? '' : v); saveCfg(); bump(); };
  const [slow] = useState(() => core.debounce(set, 400));
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    const ta = ref.current; if (!ta) return;
    ta.value = mine || def;   // 글을 자식으로 넣지 않는다 (설정 찾기가 프롬프트 본문까지 훑지 않게)
    const ch = () => set(ta), inp = () => slow(ta);
    ta.addEventListener('change', ch); ta.addEventListener('input', inp);
    return () => { ta.removeEventListener('change', ch); ta.removeEventListener('input', inp); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return <details className="mm-details mm-optset"><summary>{label}<em className="badge on" hidden={!mine}>{t('memoria.config.prompt.edited')}</em></summary><textarea className="inp mm-prompt" rows={rows} ref={ref} />
    <div className="row"><Btn label={t('memoria.config.prompt.default')} ic="refresh" cls="ghost" onClick={() => {
      const Mm = M();
      if (Mm.resetPrompt) Mm.resetPrompt(k); else { put(pKey(k), ''); const o = ensureCfg().promptOutdated; if (o) delete o[k]; saveCfg(); }
      toast(t('memoria.config.prompt.restored'), 'ok'); st.draw();
    }} /><span className="tokbadge">{t('memoria.config.prompt.tokens', { n: fmtNum(tokens(mine || def)) })}</span></div></details>;
}

// ════════ 설정 탭 ════════
const shown = new Set<St>();   // 설정 탭을 그린 적 있는 화면들 — 대화를 열어 세트가 바뀌면 다시 그린다
let wired = false;
/** 대화를 열면 그 대화(→ 캐릭터)에 붙인 세트로 설정을 갈아 끼운다. 갈아 끼우는 일 자체는 엔진(Memory.applyBundleForChat)이 맡는다. 시작할 때 한 번 부른다 */
export function installConfigEvents() {
  if (wired) return; wired = true;
  core.on('chat:open', async (chat?: ChatM | null) => {
    try { ensureCfg(); if (!(await M().applyBundleForChat?.(chat))) return; } catch (e) { return console.warn('[장기기억]', e); }
    for (const st of shown) { if (!st.host?.isConnected) { shown.delete(st); continue; } if (st.tab === 'config') st.draw(); }
  });
}

export function Config({ st }: { st: St }) {
  const [hadFocus] = useState(() => !!st.cfgSearch && document.activeElement === st.cfgSearch);
  const root = useRef<HTMLDivElement>(null), prog = useRef<HTMLSpanElement>(null);
  useLayoutEffect(() => { installConfigEvents(); st.cfgRoot = root.current; shown.add(st); applySearch(root.current, searchInput(st)?.value || ''); });
  useEffect(() => { if (hadFocus) setTimeout(() => searchInput(st)?.focus()); }, [hadFocus, st]);
  const banned = useNative<HTMLTextAreaElement>(['change'], ta => { ensureCfg().bannedPhrases = String(ta.value || '').slice(0, 4000); saveCfg(); re(); });
  useLayoutEffect(() => { if (banned.current) banned.current.value = ensureCfg().bannedPhrases || ''; }, [banned]);

  const { LANGS, MEMORY_DEFAULTS } = memMod, Mm = M();
  const m = ensureCfg(), chat = st.chat, mem = st.mem, re = () => reinject(chat), api = m.embed.mode === 'api';
  const conns: [string, string][] = [['', t('memoria.config.model.connChat')], ...SX().conns.map(c => [c.id, `${c.name}${c.model ? ' · ' + c.model : ''}`] as [string, string])];
  const langs: [string, string][] = [...Object.entries(LANGS), ...(LANGS[m.language] || !m.language ? [] : [[m.language, m.language] as [string, string]])];
  const outdated = pOutdated();
  const EMBED_KINDS = libEmbed.EMBED_KINDS;

  return <div className="mm-view mm-cfg" ref={root}>
    <div className="mm-cfg-tools"><SearchBox st={st} /><BundleBar st={st} /></div>

    <Sec title={t('memoria.config.basic.title')}><Grid>
      <Tog k="enabled" label={t('memoria.config.basic.enabled.label')} hint={t('memoria.config.basic.enabled.hint')} after={() => st.head()} />
      <Tog k="auto" label={t('memoria.config.basic.auto.label')} hint={t('memoria.config.basic.auto.hint')} />
      <Tog k="supervisor" label={t('memoria.config.basic.supervisor.label')} hint={t('memoria.config.basic.supervisor.hint')} />
      <Tog k="authorizePrivate" label={t('memoria.config.basic.authorizePrivate.label')} hint={t('memoria.config.basic.authorizePrivate.hint')} after={() => st.draw()} />
      <PerspBox st={st} />
      <Tog k="associative" label={t('memoria.config.basic.associative.label')} hint={t('memoria.config.basic.associative.hint')} />
      <Tog k="autoHide" label={t('memoria.config.basic.autoHide.label')} hint={<>{t('memoria.config.basic.autoHide.hintBefore')}<b>{t('memoria.config.basic.autoHide.hintBold')}</b>{t('memoria.config.basic.autoHide.hintAfter')}</>}
        after={async on => { if (!on) return; if (chat && mem) { const n = Mm.autoHide(chat, st.msgs); if (n) await persistMsgs(chat, st.msgs); } toast(t('memoria.config.basic.autoHide.done')); }} />
      <Tog k="refProfile" label={t('memoria.config.basic.refProfile.label')} hint={t('memoria.config.basic.refProfile.hint')} />
      <Tog k="refLore" label={t('memoria.config.basic.refLore.label')} hint={t('memoria.config.basic.refLore.hint')} />
      <Tog k="audit" label={t('memoria.config.basic.audit.label')} hint={t('memoria.config.basic.audit.hint')} />
      <Tog k="trim" label={t('memoria.config.basic.trim.label')} hint={t('memoria.config.basic.trim.hint')} />
      <Sel k="language" label={t('memoria.config.basic.language.label')} title={t('memoria.config.basic.language.title')} opts={langs} />
      <Num k="summaryContextCount" label={t('memoria.config.basic.summaryContextCount.label')} title={t('memoria.config.basic.summaryContextCount.title')} min={-1} max={50} step={1} />
      <Num k="preserveRecent" label={t('memoria.config.basic.preserveRecent.label')} title={t('memoria.config.basic.preserveRecent.title')} min={1} max={500} step={1} />
      <Num k="recordDelay" label={t('memoria.config.basic.recordDelay.label')} title={t('memoria.config.basic.recordDelay.title')} min={0} max={20} step={1} />
      <Num k="keepRecent" label={t('memoria.config.basic.keepRecent.label')} title={t('memoria.config.basic.keepRecent.title')} min={2} max={2000} step={1} /></Grid>
      <Note><b>{t('memoria.config.basic.note.b1')}</b>{t('memoria.config.basic.note.t1')}<b>{t('memoria.config.basic.note.b2')}</b>{t('memoria.config.basic.note.t2')}<br />
        <b>{t('memoria.config.basic.note.b3')}</b>{t('memoria.config.basic.note.t3')}<b>{t('memoria.config.basic.note.b4')}</b>{t('memoria.config.basic.note.t4')}<b>{t('memoria.config.basic.note.b5')}</b>{t('memoria.config.basic.note.t5')}<b>{t('memoria.config.basic.note.b6')}</b>{t('memoria.config.basic.note.t6')}</Note>
    </Sec>

    <Sec title={t('memoria.config.track.title')} desc={t('memoria.config.track.desc')}><Grid>
      <Tog k="cast" label={t('memoria.config.track.cast.label')} hint={t('memoria.config.track.cast.hint')} />
      <Tog k="lockEdited" label={t('memoria.config.track.lockEdited.label')} hint={t('memoria.config.track.lockEdited.hint')} />
      <Tog k="milestones" label={t('memoria.config.track.milestones.label')} hint={t('memoria.config.track.milestones.hint')} />
      <Tog k="items" label={t('memoria.config.track.items.label')} hint={t('memoria.config.track.items.hint')} />
      <Tog k="storyClock" label={t('memoria.config.track.storyClock.label')} hint={t('memoria.config.track.storyClock.hint')} /></Grid>
    </Sec>

    <Sec title={t('memoria.config.model.title')} desc={t('memoria.config.model.desc')}
      tools={<Btn label={t('memoria.config.test')} ic="plug" cls="ghost" title={t('memoria.config.testTitle')} onClick={e => {
        const b = e.currentTarget; toast(t('memoria.config.model.testing')); void busyBtn(b, async () => {
          try {
            const r = await Mm.call(chat || { charIds: [] }, 'You are a connection test. Reply with exactly: OK', 'ping', 2048);   // 생각하는 모델은 대답 전에 사고 토큰을 쓰므로 넉넉히 준다
            if (String(r).trim()) toast(t('memoria.config.model.testOk', { reply: String(r).replace(/\s+/g, ' ').trim().slice(0, 60) }), 'ok'); else toast(t('memoria.config.model.testEmpty'));
          } catch (err) { const x = err as Error & { cause?: { message?: string } }; toast(t('memoria.config.model.testFail', { error: x.cause?.message || x.message }), 'err'); }
        });
      }} />}>
      <Grid>
        <Sel k="@helpers.memory" label={t('memoria.config.model.conn.label')} title={t('memoria.config.model.conn.title')} opts={conns} />
        <Num k="responseTokens" label={t('memoria.config.model.responseTokens.label')} title={t('memoria.config.model.responseTokens.title')} min={256} max={65536} step={512} />
        <Num k="reasoningHeadroom" label={t('memoria.config.model.reasoningHeadroom.label')} title={t('memoria.config.model.reasoningHeadroom.title')} min={0} max={32768} step={1000} /></Grid>
      <Note>{t('memoria.config.model.note.t1')}<b>{t('memoria.config.model.note.b1')}</b>{t('memoria.config.model.note.t2')}<code>finishReason: MAX_TOKENS</code>{t('memoria.config.model.note.t3')}</Note>
    </Sec>

    <Sec title={t('memoria.config.embed.title')} desc={t('memoria.config.embed.desc')}><Grid>
      <Sel k="embed.mode" label={t('memoria.config.embed.mode.label')} opts={[['off', t('memoria.config.embed.mode.off')], ['api', t('memoria.config.embed.mode.api')]]} cls={api ? 'half' : 'third'} after={() => st.draw()} />
      {api ? <Sel k="embed.connId" label={t('memoria.config.embed.conn.label')} title={t('memoria.config.embed.conn.title')} opts={[['', t('memoria.config.embed.conn.pick')], ...SX().conns.map(c => [c.id, c.name] as [string, string])]} cls="half" /> : null}
      {api ? <Sel k="embed.kind" label={t('memoria.config.embed.kind.label')} title={t('memoria.config.embed.kind.title')} opts={Object.entries(EMBED_KINDS)} cls="half" /> : null}
      {api ? <Txt k="embed.model" label={t('memoria.config.embed.model')} ph="text-embedding-3-small" cls="half" /> : null}
      {api ? <Num k="embed.floor" label={t('memoria.config.embed.floor.label')} title={t('memoria.config.embed.floor.title')} min={0} max={0.9} step={0.05} cls="half" int={false}>
        <small className="hint">{t('memoria.config.embed.floor.hint')}</small></Num> : null}</Grid>
      {api ? <div className="row wrap">
        <Btn label={t('memoria.config.test')} ic="plug" cls="ghost" title={t('memoria.config.testTitle')} onClick={e => void busyBtn(e.currentTarget, async () => { const v = await Mm.embedCall(['connection test']); if (v?.[0]?.length) toast(t('memoria.config.embed.testOk', { dim: v[0].length }), 'ok'); else toast(t('memoria.config.embed.testEmpty'), 'err'); })} />
        <Btn label={t('memoria.config.embed.recalc.label')} ic="refresh" cls="ghost" title={t('memoria.config.embed.recalc.title')} onClick={e => void busyBtn(e.currentTarget, async () => {
          if (!chat || !mem) return toast(t('memoria.config.noChat')); if (!mem.memories.length) return toast(t('memoria.config.embed.recalc.noMem'));
          const n = await Mm.embedMemories(chat, mem, { all: true, onProgress: (d, tot) => { if (prog.current) prog.current.textContent = `${d}/${tot}`; } }); await Mm.embedQuery(chat, st.msgs).catch(() => { });
          toast(t('memoria.config.embed.recalc.done', { count: n }), 'ok'); setTimeout(() => { if (prog.current) prog.current.textContent = ''; }, 4000);
        })} /><span className="mm-progress" ref={prog} /></div> : null}
    </Sec>

    <Sec title={t('memoria.config.inject.title')}><Grid>
      <Num k="tokenBudget" label={t('memoria.config.inject.tokenBudget.label')} title={t('memoria.config.inject.tokenBudget.title')} min={200} max={24000} step={100} />
      <Sel k="position" label={t('memoria.config.inject.position.label')} title={t('memoria.config.inject.position.title')} opts={[...(m.position === 'split' || MEMORY_DEFAULTS.position === 'split' ? [['split', t('memoria.config.inject.position.split')] as [string, string]] : []), ['chat', t('memoria.config.inject.position.chat')], ['before', t('memoria.config.inject.position.before')]]} />
      <Num k="depth" label={t('memoria.config.inject.depth.label')} title={t('memoria.config.inject.depth.title')} min={0} max={10000} step={1} />
      <Num k="topK" label={t('memoria.config.inject.topK.label')} title={t('memoria.config.inject.topK.title')} min={1} max={30} step={1} />
      <Num k="chunkTurns" label={t('memoria.config.inject.chunkTurns.label')} title={t('memoria.config.inject.chunkTurns.title')} min={3} max={40} step={1} />
      <Num k="maxMemories" label={t('memoria.config.inject.maxMemories.label')} title={t('memoria.config.inject.maxMemories.title')} min={50} max={2000} step={50} />
      <Num k="consolidateEvery" label={t('memoria.config.inject.consolidateEvery.label')} title={t('memoria.config.inject.consolidateEvery.title')} min={0} max={200} step={5} />
      <Num k="arcConsolidateEvery" label={t('memoria.config.inject.arcConsolidateEvery.label')} title={t('memoria.config.inject.arcConsolidateEvery.title')} min={0} max={500} step={10} /></Grid>
      <details className="mm-details mm-optset"><summary>{t('memoria.config.inject.advanced')}</summary><Grid>
        <Num k="minScore" label={t('memoria.config.inject.minScore.label')} title={t('memoria.config.inject.minScore.title')} min={0} max={1} step={0.01} int={false} />
        <Num k="minCosine" label={t('memoria.config.inject.minCosine.label')} title={t('memoria.config.inject.minCosine.title')} min={0} max={1} step={0.01} int={false} />
        <Num k="mmrLambda" label={t('memoria.config.inject.mmrLambda.label')} title={t('memoria.config.inject.mmrLambda.title')} min={0} max={1} step={0.01} int={false} />
        <Num k="maxPerKind" label={t('memoria.config.inject.maxPerKind.label')} title={t('memoria.config.inject.maxPerKind.title')} min={1} max={30} step={1} />
        <Num k="maxPerTurn" label={t('memoria.config.inject.maxPerTurn.label')} title={t('memoria.config.inject.maxPerTurn.title')} min={1} max={30} step={1} />
        <Num k="arcMergeAt" label={t('memoria.config.inject.arcMergeAt.label')} title={t('memoria.config.inject.arcMergeAt.title')} min={3} max={40} step={1} />
        <Num k="threadSleepTurns" label={t('memoria.config.inject.threadSleepTurns.label')} title={t('memoria.config.inject.threadSleepTurns.title')} min={0} max={1000} step={1} />
        <Num k="eraKeep" label={t('memoria.config.inject.eraKeep.label')} title={t('memoria.config.inject.eraKeep.title')} min={3} max={50} step={1} />
        {typeof (m.fossil as unknown) === 'number' ? <Num k="fossil" label={t('memoria.config.inject.fossil.label')} title={t('memoria.config.inject.fossil.title')} min={5} max={1000} step={1} /> : null}</Grid></details>
      <Note><b>{t('memoria.config.inject.note.b1')}</b>{t('memoria.config.inject.note.t1')}<b>{t('memoria.config.inject.note.b2')}</b>{t('memoria.config.inject.note.t2')}</Note>
    </Sec>

    <Sec title={t('memoria.config.status.title')}><Grid>
      <Sel k="statusMode" label={t('memoria.config.status.statusMode.label')} title={t('memoria.config.status.statusMode.title')} opts={[['auto', t('memoria.config.status.statusMode.auto')], ['custom', t('memoria.config.status.statusMode.custom')], ['off', t('memoria.config.status.statusMode.off')]]} after={() => { re(); st.draw(); }} />
      {m.statusMode === 'custom' ? <Txt k="statusPattern" label={t('memoria.config.status.statusPattern.label')} title={t('memoria.config.status.statusPattern.title')} ph={t('memoria.config.status.statusPattern.ph')} after={re} check={v => { try { new RegExp(v); } catch { toast(t('memoria.config.status.statusPattern.bad'), 'err'); return false; } }} /> : null}
      <Sel k="qrMode" label={t('memoria.config.status.qrMode.label')} title={t('memoria.config.status.qrMode.title')} opts={[['side', t('memoria.config.status.qrMode.side')], ['all', t('memoria.config.status.qrMode.all')], ['keep', t('memoria.config.status.qrMode.keep')]]} after={re} cls="half"
        extra={<Tb label={t('memoria.config.status.sorter.label')} name="shuffle" title={t('memoria.config.status.sorter.title')} onClick={e => { e.preventDefault(); openSideSorter(st); }} />} />
      <Tog k="statusInject" label={t('memoria.config.status.statusInject.label')} hint={t('memoria.config.status.statusInject.hint')} after={re} />
      <Tog k="replyCheck" label={t('memoria.config.status.replyCheck.label')} hint={t('memoria.config.status.replyCheck.hint')} /></Grid>
      <Note>{t('memoria.config.status.note')}</Note>
    </Sec>

    <Sec title={t('memoria.config.voice.title')} desc={t('memoria.config.voice.desc')}><Grid>
      <Tog k="styleGuard" label={t('memoria.config.voice.styleGuard.label')} hint={t('memoria.config.voice.styleGuard.hint')} after={re} />
      <Tog k="recallQuotes" label={t('memoria.config.voice.recallQuotes.label')} hint={t('memoria.config.voice.recallQuotes.hint')} after={re} />
      <Num k="voiceSamples" label={t('memoria.config.voice.voiceSamples.label')} title={t('memoria.config.voice.voiceSamples.title')} min={0} max={4} step={1} after={re} />
      <div className="mm-block mm-optset"><b>{t('memoria.config.voice.banned.title')}</b>
        <textarea className="inp" rows={3} placeholder={t('memoria.config.voice.banned.ph')} ref={banned} />
        <div className="row wrap"><Tb label={t('memoria.config.voice.repeat.label')} name="repeat" title={t('memoria.config.voice.repeat.title')} onClick={() => { if (!chat) return toast(t('memoria.config.noChat')); openRepeatFinder(st, v => { if (banned.current) banned.current.value = v; }); }} /></div>
        <small className="hint">{t('memoria.config.voice.banned.hint')}<b>{t('memoria.config.voice.banned.hintBold')}</b></small></div>
      <Tog k="banInChat" label={t('memoria.config.voice.banInChat.label')} hint={t('memoria.config.voice.banInChat.hint')} />
      <Tog k="banTell" label={t('memoria.config.voice.banTell.label')} hint={t('memoria.config.voice.banTell.hint')} after={re} /></Grid>
    </Sec>

    <Sec title={t('memoria.config.speed.title')} desc={t('memoria.config.speed.desc')}><Grid>
      <Num k="recallWaitSec" label={t('memoria.config.speed.recallWaitSec.label')} title={t('memoria.config.speed.recallWaitSec.title')} min={0} max={60} step={1} cls="half" />
      <Num k="stableRefreshTurns" label={t('memoria.config.speed.stableRefreshTurns.label')} title={t('memoria.config.speed.stableRefreshTurns.title')} min={0} max={200} step={1} cls="half" />
      <Tog k="yieldToChat" label={t('memoria.config.speed.yieldToChat.label')} hint={t('memoria.config.speed.yieldToChat.hint')} />
      <Tog k="watchUpdates" label={t('memoria.config.speed.watchUpdates.label')} hint={t('memoria.config.speed.watchUpdates.hint')} />
      <Tog k="splitInjection" label={t('memoria.config.speed.splitInjection.label')} hint={<>{t('memoria.config.speed.splitInjection.hintBefore')}<b>{t('memoria.config.speed.splitInjection.hintBold')}</b>{t('memoria.config.speed.splitInjection.hintAfter')}</>} after={re} /></Grid>
    </Sec>

    <Sec title={t('memoria.config.prompt.title')} desc={t('memoria.config.prompt.desc')}>
      {outdated.length ? <p className="mm-banner"><Ico name="bell" size={15} /><span>{t('memoria.config.prompt.outdatedBefore')}<b>{outdated.map(k => PROMPT_LABELS[k] ? t(PROMPT_LABELS[k]) : k).join(', ')}</b>{t('memoria.config.prompt.outdatedAfter')}</span></p> : null}
      <PromptEdit st={st} k="archivist" label={t('memoria.config.prompt.edit.archivist')} rows={10} /><PromptEdit st={st} k="supervisor" label={t('memoria.config.prompt.edit.supervisor')} rows={8} /><PromptEdit st={st} k="chunk" label={t('memoria.config.prompt.edit.chunk')} rows={5} /><PromptEdit st={st} k="arc" label={t('memoria.config.prompt.edit.arc')} rows={5} />
    </Sec>
  </div>;
}
