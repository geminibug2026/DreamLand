// 정규식 파이프라인 디버거: 글 하나가 어떤 스크립트를 어떤 순서로 거치는지 단계별로 보여 준다
import { useEffect, useMemo, useRef, useState } from 'react';
import { Btn, Icon } from '../kit';
import type { Char } from '../types';
import type { Msg } from '../studio/parts';
import { E, G, Lint, RX, TARGETS, WHO, chatLabel, clip, lastChat, lintOf, scName, scShort, type Env, type Sc, type Step, type Target, type Who } from './lib';
import { openEditor } from './Editor';
import { DiffText, PlainText } from './parts';
import { pickMessage } from './pick';
import { S } from '../lib/core';
import { arr, copyText, debounce, openModal } from '../studio/parts';

interface Tr { out: string; steps: Step[]; env: Env }
interface St { chatId: string; text: string; who: Who; depth?: number; charId: string; presetId: string; target: Target; edit: boolean; all: boolean; msg: Msg | null; msgs: Msg[]; auto: { display: number; prompt?: number } | null }
const scOf = (s: Step): Sc => (s.kind === 'global' ? G : { kind: s.kind, id: s.owner });

/** 한 단계. 펼칠 때 처음 한 번 속을 그린다 */
function StepRow({ s, n, env, rerun }: { s: Step; n: number; env: Env; rerun: () => void }) {
  const [drawn, setDrawn] = useState(false);
  const hits = s.matches?.length || 0, changed = !s.skip && s.after !== s.before, kind = s.skip ? 'skip' : changed ? 'hit' : 'miss';
  const status = s.skip ? Lint.SKIP_TEXT[s.skip] || s.skip : changed ? `${hits}곳 바꿈` : hits ? `${hits}곳 찾았지만 글은 그대로` : '맞는 곳 없음';
  const openBtn = <Btn label="스크립트 열기" cls="ghost" ic="edit" onClick={() => openEditor(s.r, scOf(s), { onClose: rerun })} />;
  let body = null;
  if (drawn && s.skip) body = <div className="rx-step-body"><p>{Lint.skipDetail(s.skip, s.r, env)}</p>{s.kind !== 'global' && <small className="hint">{scName(scOf(s))}</small>}<div className="row">{openBtn}</div></div>;
  else if (drawn) {
    const T = Lint.tally(s.matches), before = s.before || '', after = s.after || '';
    body = <div className="rx-step-body"><code className="rx-src">{s.source}</code>
      {hits ? <DiffText text={before} matches={s.matches} /> : <ul className="rx-why">{Lint.whyNoMatch(lintOf(s.r), before).map((t, i) => <li key={i}>{t}</li>)}</ul>}
      <div className="row wrap">{hits ? <small className="hint">{`${T.removed.toLocaleString()}자를 ${T.added.toLocaleString()}자로 · ${before.length.toLocaleString()}자 → ${after.length.toLocaleString()}자`}</small> : null}{openBtn}</div></div>;
  }
  return <details className={`rx-step ${kind}`} onToggle={e => { if (e.currentTarget.open) setDrawn(true); }}>
    <summary><span className="rx-step-n">{n ? String(n).padStart(2, '0') : '–'}</span><em className="badge">{scShort(scOf(s))}</em><b>{s.name || '이름 없음'}</b><span className="rx-step-st">{status}</span><Icon name="down" size={14} /></summary>{body}
  </details>;
}

function Body({ init }: { init: { chatId?: string; text?: string } }) {
  const [st] = useState<St>(() => ({ chatId: init.chatId ?? lastChat()?.id ?? '', text: init.text || '', who: 'ai', depth: 0, charId: '', presetId: '', target: 'display', edit: false, all: false, msg: null, msgs: [], auto: null }));
  const [traces, setTraces] = useState<Partial<Record<Target, Tr>>>({}), [gen, setGen] = useState(0), draw = () => setGen(n => n + 1);
  const seq = useRef(0), alive = useRef(true);
  const chatOf = () => S.get('chats', st.chatId) || null;
  const envFor = (target: Target) => {
    const chat = chatOf(), depth = target === 'store' ? undefined : st.auto ? st.auto[target] : st.depth;
    return E.regexEnv({ who: st.who, target, depth, charId: st.charId || (chat?.charIds?.length === 1 ? chat.charIds[0] : undefined), chat, preset: st.presetId ? S.get('presets', st.presetId) : undefined, edit: target === 'store' && st.edit });
  };
  /** 한 단계씩: 건너뛸지 판정 → 멈추지 않는지 확인 → 실행. engine.js 의 traceRegex 와 같은 판정 · 같은 실행 */
  const trace = async (target: Target, my: number): Promise<Tr | null> => {
    const env = envFor(target), steps: Step[] = []; let text = st.text;
    for (const it of E.regexScripts({ chat: env.chat, charId: env.charId, preset: env.preset, all: true })) {
      if (!(it.skip || E.regexSkip(it.r, env))) {
        const re = E.compileRegex(E.regexFind(it.r, env.ctx));
        if (re && text && !(await RX().probe(re.source, re.flags, text)).ok) { steps.push({ id: it.r.id, name: it.r.name, kind: it.kind, owner: it.owner, r: it.r, skip: 'hang' }); continue; }
        if (my !== seq.current) return null;
      }
      const s = E.regexStep(it, text, env); steps.push(s); if (!s.skip) text = s.after ?? text;
    }
    return { out: text, steps, env };
  };
  const run = useMemo(() => debounce(() => { void (async () => {
    const my = ++seq.current;
    if (!st.text) { if (alive.current) { setTraces({}); draw(); } return; }
    const next: Partial<Record<Target, Tr>> = {};
    for (const [t] of TARGETS) { const tr = await trace(t, my); if (!tr || my !== seq.current) return; next[t] = tr; }
    if (alive.current) { setTraces(next); draw(); }
  })(); }, 200), []);   // eslint-disable-line react-hooks/exhaustive-deps
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { alive.current = true; if (st.text) run(); return () => { alive.current = false; seq.current++; }; }, []);
  const ctl = () => { draw(); run(); };

  const depthsOf = () => { if (!st.msg) return null; const i = st.msgs.indexOf(st.msg), vis = st.msgs.filter(m => !m.hidden), j = vis.indexOf(st.msg); return { display: st.msgs.length - 1 - i, prompt: j < 0 ? undefined : vis.length - 1 - j }; };
  const pick = async () => {
    const got = await pickMessage(chatOf() || lastChat()); if (!got) return;
    st.chatId = got.chat.id; st.msg = got.m; st.msgs = got.msgs; st.text = got.text;
    st.who = got.m.role === 'user' ? 'user' : got.m.role === 'system' ? 'slash' : 'ai'; st.charId = got.chat.charIds.length > 1 ? got.m.charId || '' : '';
    st.auto = depthsOf(); st.depth = st.auto?.[st.target === 'prompt' ? 'prompt' : 'display'];
    ctl();
  };

  const chat = chatOf(), chars = arr(chat?.charIds).map(id => S.get('chars', id)).filter((c): c is Char => !!c), auto = chat ? S.presetFor(chat) : S.preset();
  const tr = traces[st.target];
  const tabs = <div className="rx-chips">{TARGETS.map(([t, label]) => { const x = traces[t], n = x ? x.steps.filter(s => !s.skip && s.after !== s.before).length : 0; return <button key={t} type="button" className={'chip' + (st.target === t ? ' on' : '')} onClick={() => { st.target = t; if (st.auto) st.depth = st.auto[t === 'prompt' ? 'prompt' : 'display']; draw(); }}>{label}{x ? <small>{n ? `${n}개가 바꿈` : '그대로'}</small> : null}</button>; })}</div>;
  let out = <>{tabs}<p className="dim">글을 넣으면 어떤 스크립트가 어떤 순서로 적용되는지 단계별로 보여 줍니다.</p></>;
  if (tr) {
    const inScope = tr.steps.filter(s => !String(s.skip).startsWith('scope:')), outScope = tr.steps.filter(s => String(s.skip).startsWith('scope:'));
    const ran = inScope.filter(s => !s.skip), changed = ran.filter(s => s.after !== s.before);
    let n = 0;
    const rows = inScope.filter(s => st.all || !s.skip).map((s, i) => <StepRow key={`${gen}:${i}`} s={s} n={s.skip ? 0 : ++n} env={tr.env} rerun={run} />);
    out = <>{tabs}
      <p className="rx-sum"><b>{`범위 안 스크립트 ${inScope.length}개 가운데 ${ran.length}개 실행`}</b>{` · ${changed.length}개가 글을 바꿈 · ${st.text.length.toLocaleString()}자 → ${tr.out.length.toLocaleString()}자`}{tr.env.target !== 'store' && tr.env.depth !== undefined ? ` · 깊이 ${tr.env.depth}` : ''}</p>
      <div className="rx-chips"><button type="button" className={'chip' + (st.all ? '' : ' on')} onClick={() => { st.all = false; draw(); }}>{`적용된 것 ${ran.length}`}</button><button type="button" className={'chip' + (st.all ? ' on' : '')} onClick={() => { st.all = true; draw(); }}>{`건너뛴 것도 ${inScope.length}`}</button></div>
      <div className="rx-steps">{rows}{!rows.length && <p className="dim">{st.all ? '이 범위에는 스크립트가 없어요.' : '이 단계에서 실행된 스크립트가 없어요. "건너뛴 것도" 를 누르면 까닭을 볼 수 있습니다.'}</p>}</div>
      {st.all && outScope.length ? <details className="rx-outscope" key={'o' + gen}><summary>{`범위가 아닌 스크립트 ${outScope.length}개 (다른 캐릭터 · 다른 프리셋)`}</summary><div className="rx-steps">{outScope.slice(0, 300).map((s, i) => <StepRow key={i} s={s} n={0} env={tr.env} rerun={run} />)}</div></details> : null}
      <div className="rx-final"><div className="rx-test-head"><span className="field-label">{`마지막 결과 · ${TARGETS.find(t => t[0] === st.target)?.[1]}`}</span><Btn label="복사" ic="copy" cls="ghost" onClick={() => copyText(tr.out)} /></div><PlainText text={tr.out} />{tr.out === st.text ? <small className="hint">처음 글과 같아요.</small> : null}</div>
    </>;
  }
  const store = st.target === 'store';
  return <div className="rx-dbg">
    <div className="rx-dbg-ctl"><div className="form">
      <label className="field"><span className="field-label">대화방</span><select className="inp" value={st.chatId} onChange={e => { st.chatId = e.target.value; st.msg = null; st.auto = null; ctl(); }}>
        <option value="">대화 없이 (전역 + 고른 프리셋)</option>{[...S.chats].sort((a, b) => b.updatedAt - a.updatedAt).slice(0, 150).map(c => <option key={c.id} value={c.id}>{clip(chatLabel(c), 50)}</option>)}</select></label>
      <div className="rx-dbg-msg"><Btn label={st.msg ? '다른 메시지 고르기' : '대화에서 메시지 고르기'} ic="chat" onClick={() => void pick()} />
        <small className="hint">{st.msg ? `#${st.msgs.indexOf(st.msg) + 1} 메시지를 보고 있어요. 대상과 깊이는 메시지에 맞춰 두었습니다.` : chat ? '메시지를 고르면 대상 · 깊이 · 화자가 저절로 맞춰집니다.' : '대화를 고르면 그 방의 캐릭터 · 프리셋 범위까지 함께 봅니다.'}</small></div>
      <label className="field"><span className="field-label">확인할 글</span><textarea className="inp rx-mono" rows={5} spellCheck={false} placeholder="확인할 글을 붙여 넣거나, 위에서 대화의 메시지를 고르세요." value={st.text} onChange={e => { st.text = e.target.value; ctl(); }} /></label>
      <label className="field half"><span className="field-label">이 글은</span><select className="inp" value={st.who} onChange={e => { st.who = e.target.value as Who; ctl(); }}>{WHO.map(w => <option key={w[3]} value={w[3]}>{w[1]}</option>)}</select></label>
      <label className="field half" hidden={store}><span className="field-label">깊이 (0 = 마지막 메시지)</span><input className="inp" type="number" min={-1} max={9999} value={st.depth ?? ''} onChange={e => { st.depth = e.target.value === '' ? undefined : +e.target.value; st.auto = null; ctl(); }} /></label>
      <label className="field half" hidden={chars.length < 2}><span className="field-label">화자</span><select className="inp" value={st.charId} onChange={e => { st.charId = e.target.value; ctl(); }}>
        <option value="">{chars.length > 1 ? '내 글 · 화자 없음' : chars[0]?.name || '캐릭터 없음'}</option>{chars.length > 1 ? chars.map(c => <option key={c.id} value={c.id}>{c.name}</option>) : null}</select></label>
      <label className="field half"><span className="field-label">프리셋</span><select className="inp" value={st.presetId} onChange={e => { st.presetId = e.target.value; ctl(); }}>
        <option value="">{`${chat ? '이 대화의 프리셋' : '사용 중인 프리셋'} · ${auto?.name || ''}`}</option>{S.presets.filter(p => p !== auto).map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
      <label className="check pill" hidden={!store}><input type="checkbox" checked={st.edit} onChange={e => { st.edit = e.target.checked; ctl(); }} /><i /><span>메시지를 고쳐 저장하는 경우</span></label>
    </div></div>
    <div className="rx-dbg-out">{out}</div>
  </div>;
}

/** 디버거 창을 연다 */
export function openDebugger(init: { chatId?: string; text?: string } = {}) {
  openModal({ title: '정규식 디버거', wide: true, cls: 'rx-sheet' }, () => <Body init={init} />);
}
