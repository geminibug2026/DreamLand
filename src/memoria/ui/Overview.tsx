// 장기기억 — 개요 탭 (옛 f-memoria.js 의 vOverview): 주입 미리보기 · 회상 경로 · 장면 연출 · 서고에 질문 · 사서에게 정정 요청
import { useLayoutEffect, useRef, useState, type KeyboardEvent, type ReactNode, type RefObject } from 'react';
import { Btn, Icon } from '../../kit';
import type { EditorOp, LogLine, RecallRow } from '../types';
import { Ib, Ico, KindBadge, None, Sec, Stats, busyBtn, confirmList, histOf, review, safe, showSource, turnTag, withCheckpoint, type StOpen } from './parts';
import { Memory } from '../../lib/memory';
import { toast } from '../../ui';
import { tokens } from '../../lib/engine';
import * as memMod from '../../lib/memory';

const SEC_KO: Record<string, string> = { Canon: '캐논', Cast: '인물', Bonds: '관계선', 'Notable Items': '물건', 'Turning Points': '전환점', 'Story So Far': '요약', Pledges: '서약', 'Recent Turns': '최근 턴', 'Recalled Moments': '회상', 'Hidden Knowledge': '비공개', 'Source Excerpts': '자료실', 'Scene Now': '현재 장면', 'Status Board': '상태', Direction: '연출' };
const PLEDGE_ST: Record<string, string> = { active: '유효', resolved: '해결됨', dormant: '잠듦' };
/** 사서가 제안한 정정 한 건을 사람이 읽는 글로 */
export function opText(o: EditorOp): string {
  const { KINDS, LOCKS, fmtDays } = memMod, k = String(o.kind || '');
  const f: Record<string, () => string> = {
    canon: () => `캐논: ${o.scopeName ? `${o.scopeName}의 ` : ''}${o.key} → "${o.value}"`, status: () => `상태: ${o.entity}.${o.slot} → "${o.value}"${o.claim === 'belief' ? ` (${o.owner || '누군가'}의 믿음)` : ''}`,
    clock: () => `서사 시계: t${o.fromTurn}–t${o.toTurn} 구간을 총 ${fmtDays(+(o.totalDays || 0) || 0)}(으)로 재조정`, addMemory: () => `기억 추가 (${KINDS[k] || o.kind || KINDS.fact}) → "${o.summary}"`, editMemory: () => `기억 수정 (${o.id}) → "${o.summary}"`, deleteMemory: () => `기억 삭제 (${o.id})`,
    editSummary: () => `요약 수정 (${o.id})`, deleteSummary: () => `요약 삭제 (${o.id})`, addPledge: () => `서약 추가 (${LOCKS[k] || o.kind || LOCKS.keep_unresolved}) → "${o.summary}"`, editPledge: () => `서약 수정 (${o.id})${o.status ? ` → ${PLEDGE_ST[o.status] || o.status}` : ''}${o.summary ? ` "${o.summary}"` : ''}`, deletePledge: () => `서약 삭제 (${o.id})`,
    character: () => `인물 카드: ${o.name} — ${Object.keys(o.patch || {}).join(', ')} 갱신`, bond: () => `관계선: ${o.from} → ${o.to} = "${o.stage}"`,
  };
  return f[o.op]?.() || JSON.stringify(o);
}
const enter = (fn: () => void) => (e: KeyboardEvent<HTMLInputElement>) => { if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); fn(); } };

export function Overview({ st }: { st: StOpen }) {
  const M = Memory, cfg = M.cfg(), { chat, mem, msgs } = st, hist = histOf(msgs);
  const p = M.packet(chat, hist, { preview: true, msgs, force: true }), auto = M.packet(chat, hist, { preview: true, fresh: true, msgs, force: true });
  const once = M.overridden(chat.id), pin = mem.packetPin?.text, lastReal = M.last(chat.id), budget = cfg.tokenBudget;
  // 미리보기 글 — 다시 그려도 치던 글 · 커서가 남는다. 초안 · 장부가 바뀌었을 때만 새 값으로
  const init = st.draft ?? p?.text ?? '';
  const [text, setText] = useState(init), [seen, setSeen] = useState(init);
  if (seen !== init) { setSeen(init); setText(init); }
  const taRef = useRef<HTMLTextAreaElement>(null), qRef = useRef<HTMLInputElement>(null), eqRef = useRef<HTMLInputElement>(null), askRef = useRef<HTMLButtonElement>(null), sendRef = useRef<HTMLButtonElement>(null), logRef = useRef<HTMLDivElement>(null);
  const [ans, setAns] = useState<string>(st.answer || '');
  useLayoutEffect(() => { const l = logRef.current; if (l) l.scrollTop = l.scrollHeight; });
  const t = tokens(text), mark = st.draft != null ? '초안 · ' : once ? '수정본 대기 중 — 다음 응답 1회에 주입됩니다 · ' : pin ? '고정됨 · ' : '';
  const live = p && !p.fixed && st.draft == null;
  const trim = !live ? '' : p.trim === 0 ? '전체 수록' : p.trim <= 4 ? `일부 축소 (${p.trim}단)` : `⚠ 예산 부족으로 크게 축소 (${p.trim}단) — 예산을 늘리면 회상·요약이 더 실립니다`;
  // 고정 장부: 잘 안 바뀌는 부분은 프롬프트 앞쪽에, 매 턴 바뀌는 부분은 최근 대화 옆에 따로 실린다
  const sp = !live ? null : p.diag?.split || (p.stable && p.live ? { stableTokens: tokens(p.stable), nowTokens: tokens(p.live), refreshed: undefined, frozenAtTurn: undefined, delta: undefined } : null);
  const split = sp && <small>{`${cfg.splitInjection ? '고정 장부' : '나눠 싣기'} — 앞쪽(캐논·인물·관계선·요약·서약) ≈ ${(sp.stableTokens || 0).toLocaleString()} 토큰${sp.refreshed ? ' · 다음 답변 때 새로 뜹니다 (그 턴은 캐시가 한 번 새로 잡혀요)' : sp.frozenAtTurn != null ? ` · t${sp.frozenAtTurn} 시점에 뜬 것 그대로` : ''} · 최근 대화 옆(회상·지금 장면·상태${sp.delta ? ` · 그 뒤 달라진 줄 ${sp.delta}` : ''}) ≈ ${(sp.nowTokens || 0).toLocaleString()} 토큰`}</small>;
  const unpin = async () => { await M.pin(chat.id, null); toast('고정을 해제했습니다. 다시 매 턴 서고에서 장부를 만듭니다.', 'ok'); st.draw(); };
  const banner = st.draft != null ? <div className="mm-banner"><Ico name="sparkle" /><span><b>사서가 새로 쓴 초안</b>입니다 — 아직 주입되지 않았어요. 고칠 곳이 있으면 고친 뒤 연필(다음 응답 1회) 또는 핀(해제할 때까지 계속)으로 적용하세요. </span><button className="mm-link" onClick={() => { st.draft = null; st.draw(); }}>초안 버리기</button></div>
    : once ? <div className="mm-banner"><Ico name="edit" /><span><b>수정본 대기 중</b> — 다음 응답 1회에 주입되고 사라집니다. </span><button className="mm-link" onClick={() => { M.override(chat.id, null); st.draw(); }}>취소</button></div>
      : pin ? <div className="mm-banner"><Ico name="pin" /><span><b>고정한 장부</b>{`를 주입하고 있습니다 (t${mem.packetPin?.turn || 0} 시점). 그 뒤로 쌓인 기억·상태·요약은 주입에 반영되지 않아요 — 기록은 계속 쌓입니다. `}</span><button className="mm-link" onClick={() => void unpin()}>고정 해제</button></div> : null;
  const tools = <>
    <Ib name="sparkle" title="사서가 기억·세계·요약을 보고 장부를 새로 씁니다 (초안 — 적용 전 확인)" onClick={e => busyBtn(e.currentTarget, async () => {
      toast('사서가 기억·세계·요약을 보고 장부를 새로 쓰는 중…');
      try { st.draft = await M.rewritePacket(chat, hist); } catch (e) { const err = e as Error; if (err.name === 'AbortError') throw err; console.error('[장기기억] 장부 새로 쓰기 실패:', err); return toast(`장부를 새로 쓰지 못했습니다. ${err.message || ''}`, 'err'); }
      st.draw(); const n = tokens(st.draft); toast(`초안을 미리보기에 넣었습니다 (≈ ${n.toLocaleString()} 토큰).${n > budget ? ` 주입 예산(${budget.toLocaleString()})보다 커서 적용하면 예산을 넘습니다.` : ''} 확인 후 연필 또는 핀으로 적용하세요.`, 'ok');
    })} />
    <Ib name="pin" title={pin ? '고정 해제 — 자동 장부로 돌아갑니다' : '지금 미리보기 내용을 이 대화에 계속 고정합니다'} cls={pin ? 'on' : ''} onClick={async () => {
      if (pin && st.draft == null) return unpin();
      const v = text.trim(); if (!v) return toast('고정할 내용이 비어 있습니다.');
      if (!(await confirmList('지금 미리보기 내용을 이 대화에 계속 고정합니다. 고정할까요?', ['해제할 때까지 매 턴 이 내용이 그대로 주입됩니다.', '그동안 새로 쌓이는 기억·상태·요약은 주입에 반영되지 않습니다 (기록은 계속 쌓입니다).', '핀을 다시 누르면 해제되고 자동 장부로 돌아갑니다.'], '고정'))) return;
      await M.pin(chat.id, v); M.override(chat.id, null); st.draft = null; toast('장부를 고정했습니다.', 'ok'); st.draw();
    }} />
    <Ib name="edit" title="수정한 내용을 다음 응답 1회에 주입" onClick={() => { const v = text.trim(); if (!v) return toast('주입할 내용이 비어 있습니다.'); M.override(chat.id, v); st.draft = null; toast('수정본이 다음 응답 1회에 주입됩니다. (계속 쓰려면 핀으로 고정)', 'ok'); st.draw(); }} />
    <Ib name="copy" title="주입 내용 전체 복사" onClick={() => text.trim() ? navigator.clipboard?.writeText(text).then(() => toast('주입 내용을 복사했습니다.', 'ok'), () => { taRef.current?.select(); document.execCommand('copy'); toast('주입 내용을 복사했습니다.', 'ok'); }) : toast('복사할 주입 내용이 없습니다.')} />
  </>;
  // 장부 구성 비중
  const d = auto?.diag, total = d ? d.sections.reduce((n, s) => n + s.tokens, 0) || 1 : 1;
  const shares = d && <div className="mm-shares" aria-label="장부 구성 비중 (토큰 수 기준)"><div className="mm-sharebar">{d.sections.map((s, i) => <i key={i} className={`s${i % 6}`} style={{ width: s.tokens / total * 100 + '%' }} title={`${SEC_KO[s.name] || s.name} ${s.tokens.toLocaleString()} 토큰`} />)}</div>
    <div className="mm-chips">{d.sections.map((s, i) => <span key={i} className="mm-chip"><i className={`mm-dot s${i % 6}`} />{`${SEC_KO[s.name] || s.name} ${Math.round(s.tokens / total * 100)}%`}<small>{`${s.tokens.toLocaleString()}`}</small></span>)}</div></div>;
  // 회상 경로
  const bars = (r: RecallRow) => r.parts && <div className="mm-score" title={`유사도 ${r.parts.cos.toFixed(2)} · 어휘 ${r.parts.lex.toFixed(2)} · 중요도 ${r.parts.imp.toFixed(2)} · 최근성 ${r.parts.rec.toFixed(2)} · 가산 ${r.parts.bonus.toFixed(2)}`}>
    <div className="mm-scorebar"><i className="p-cos" style={{ width: 62 * r.parts.cos + '%' }} /><i className="p-lex" style={{ width: 18 * Math.min(1, r.parts.lex) + '%' }} /><i className="p-imp" style={{ width: 12 * r.parts.imp + '%' }} /><i className="p-rec" style={{ width: 8 * r.parts.rec + '%' }} /><i className="p-bonus" style={{ width: 100 * r.parts.bonus + '%' }} /></div><b>{(r.score || 0).toFixed(2)}</b></div>;
  const rows = d?.rows || [];
  const diag = !d ? <p className="hint">{p?.text ? '직접 수정하거나 고정한 장부입니다. 자동 회상 경로는 적용되지 않습니다.' : '주입을 갱신하면 회상 경로가 표시됩니다.'}</p> : <div className="col">
    {d.fallback ? <p className="mm-warn">예산이 최소 장부보다 작습니다. 담을 수 있는 서약만 보냈으며 일부 제약도 빠질 수 있습니다. 주입 예산을 늘려 주세요.</p> : null}
    {d.narrator ? <p className="hint">소설·풀사칭 · 여러 인물의 기억을 서술자가 참고합니다. 각 인물이 모르는 비밀까지 공유하지 않도록 지시합니다.</p> : null}
    <p className="hint">{`실제 주입 ${rows.filter(r => r.included).length}개 · 중복/예산 제외 ${rows.filter(r => !r.included).length}개 · 시점 밖 비공개 ${d.hidden}개`}</p>{shares}
    {rows.length ? <div className="mm-legend"><span><i className="p-cos" />유사도</span><span><i className="p-lex" />어휘</span><span><i className="p-imp" />중요도</span><span><i className="p-rec" />최근성</span><span><i className="p-bonus" />인물 · 단서 가산</span></div> : null}
    {rows.map((r, i) => {
      const m = mem.memories.find(x => x.id === r.id), via = r.via ? mem.memories.find(x => x.id === r.via) : undefined;
      return <div key={i} className={`mm-recall${r.included ? '' : ' off'}`}><em className={`mm-flag${r.included ? ' on' : ''}`}>{r.included ? '주입' : '제외'}</em>
        <div className="mm-recall-main"><div><KindBadge k={r.kind} />{' '}{r.summary}</div><small>{`${m ? turnTag(mem, m) : ''} · ${r.reason || '관련 기억'}${r.excluded ? ` → ${r.excluded}` : ''}`}</small>{via ? <small>{`연결된 기억: ${via.summary}`}</small> : null}{bars(r)}</div>
        {m ? <Ib name="book" title="출처" onClick={() => showSource(st, m)} /> : null}</div>;
    })}</div>;
  // 장면 연출 (설정에서 켰을 때)
  const dir = mem.direction, plan = dir?.plan, lastAi = [...msgs].reverse().find(m => m.role === 'assistant' && !m.hidden);
  const list = (xs: unknown[]) => <ul>{xs.map((x, i) => <li key={i}>{String(x)}</li>)}</ul>;
  const tension = plan?.tension ? String(plan.tension) : '';
  const direction = cfg.supervisor ? <Sec title="장면 연출" desc="답변이 끝날 때마다 연출이 다음 장면의 목표·피해야 할 전개를 짧게 계획해 둡니다. 프롬프트를 조립하는 순간에는 기다릴 수 없어서, 방금 끝난 장면을 보고 세운 계획이 다음 답변에 함께 주입됩니다 (다시 생성할 때는 주입되지 않습니다)."
    tools={<Btn label="다시 세우기" ic="refresh" cls="ghost" title="지금 장면을 보고 연출 계획을 다시 세웁니다" onClick={e => void busyBtn(e.currentTarget, async () => { await M.direct(chat, msgs); st.draw(); })} />}>
    {plan ? <div className="mm-plan">{dir?.afterId !== lastAi?.id ? <p className="hint">이 계획은 이전 장면 기준이라 다음 답변에는 주입되지 않습니다.</p> : null}
      {(plan.remember || []).length ? <div><b>기억할 것</b>{list(plan.remember || [])}</div> : null}{plan.scene_goal ? <div><b>목표</b><p>{String(plan.scene_goal)}</p></div> : null}
      {(plan.ideas || []).length ? <div><b>제안</b>{list(plan.ideas || [])}</div> : null}{(plan.avoid || []).length ? <div><b>피할 것</b>{list(plan.avoid || [])}</div> : null}
      {tension ? <div><b>긴장</b><em className={`mm-tension t-${safe(tension)}`}>{({ low: '낮음', medium: '보통', high: '높음' } as Record<string, string>)[tension] || tension}</em></div> : null}</div> : <None text="아직 세운 계획이 없습니다." />}
  </Sec> : null;
  // 서고에 질문
  const ask = (b: HTMLButtonElement | null) => b && busyBtn(b, async () => {
    const q = (qRef.current?.value || '').trim(); if (!q) return toast('질문을 입력하세요.');
    setAns('서고를 뒤지는 중…');
    try { st.answer = await M.ask(chat, q); } catch (e) { const err = e as Error; if (err.name === 'AbortError') throw err; st.answer = `답변 실패: ${err.message}`; }
    setAns(st.answer);
  });
  // 사서에게 정정 요청 (편집 대화)
  const apply = async (l: LogLine) => {
    const draft = M.snapshot(mem); M.applyOps(draft, l.ops || []); const ch = M.diff(mem, draft);
    if (!(await review(ch, '사서의 정정 제안'))) return;
    await withCheckpoint(st, '사서 정정 전', async () => {
      const skipped: string[] = [], n = M.applyOps(mem, l.ops || [], skipped); l.applied = true; l.done = n; l.skipped = skipped;
      if (n) toast(`서고에 ${n}건 반영했습니다.`, 'ok'); if (skipped.length) toast(`${skipped.length}건은 반영하지 못했습니다.`, 'err');
    });
  };
  const log = <div className="mm-log" ref={logRef}>{st.log.map((l, i) => <div key={i} className={`mm-say ${l.role}`}><small className="mm-who">{l.role === 'user' ? '나' : '사서'}</small><span>{l.text}</span>
    {l.ops?.length ? <div className="mm-ops"><ul>{l.ops.map((o, j) => <li key={j}>{opText(o)}</li>)}</ul>
      {!l.applied && !l.cancelled ? <div className="row wrap"><Btn label="적용" ic="check" cls="primary" title="바뀔 내용을 먼저 비교해 보고 서고에 반영합니다" onClick={() => void apply(l)} /><Btn label="취소" cls="ghost" onClick={() => { l.cancelled = true; st.draw(); }} /></div> : null}
      {l.applied ? <em className="badge on">{`✔ ${l.done ?? 0}건 반영됨`}</em> : null}{l.cancelled ? <em className="badge">취소함</em> : null}{(l.skipped || []).map((x, j) => <small key={j} className="err">{'⚠ ' + x}</small>)}</div> : null}</div>)}</div>;
  const send = (b: HTMLButtonElement | null) => b && busyBtn(b, async () => {
    const eq = eqRef.current, v = (eq?.value || '').trim(); if (!v) return toast('요청을 입력하세요.'); if (st.sending) return;
    st.sending = true; st.log.push({ role: 'user', text: v }); const wait: LogLine = { role: 'ai', text: '서고를 확인하는 중…' }; st.log.push(wait); if (eq) eq.value = ''; st.draw();
    try { const r = await M.propose(chat, v, st.log.slice(0, -2)); Object.assign(wait, { text: r.reply || (r.ops?.length ? '이렇게 고칠게요.' : '고칠 곳을 찾지 못했습니다.'), ops: r.ops || [] }); } catch (e) { wait.text = `처리 실패 — ${(e as Error).message}`; } finally { st.sending = false; }
    st.draw();
  });
  const btnEl = (label: string, ic: string, cls: string, ref: RefObject<HTMLButtonElement | null>, fn: () => void): ReactNode => <button type="button" ref={ref} className={`btn ${cls}`.trim()} onClick={fn}><Icon name={ic} /><span>{label}</span></button>;
  return <div className="mm-view"><Stats st={st} />
    <Sec title="주입 미리보기" desc="다음 응답 생성 시 프롬프트에 들어갈 장기기억입니다. 직접 고친 뒤 연필을 누르면 다음 응답 1회에, 핀을 누르면 해제할 때까지 계속 주입됩니다. 반짝이는 사서가 기억·세계·요약을 보고 장부를 새로 써서 초안으로 보여줍니다." tools={tools}>
      {banner}<div className="mm-budget"><span className="mm-tok">{text.trim() ? `${mark}≈ ${t.toLocaleString()} 토큰 / 예산 ${budget.toLocaleString()}` : ''}</span><div className={`mm-meter big${t > budget ? ' over' : ''}`}><i style={{ width: Math.min(100, t / budget * 100) + '%' }} /></div>{trim ? <small>{trim}</small> : null}{split}</div>
      <textarea ref={taRef} className="inp mm-preview" rows={12} spellCheck={false} value={text} placeholder="(주입할 내용이 없습니다 — 기억이 쌓이면 자동 생성됩니다)" onChange={e => setText(e.target.value)} />
      {lastReal ? <small className="hint">{`직전 응답에는 ≈ ${lastReal.tokens.toLocaleString()} 토큰이 주입됐습니다${lastReal.fixed ? (lastReal.fixed === 'pin' ? ' (고정한 장부)' : ' (수정본)') : ` · 회상 ${lastReal.picked.length}개`}.`}</small> : null}
      <details className="mm-details" open={!!st.openDiag} onToggle={e => { st.openDiag = e.currentTarget.open; }}><summary>회상 경로 · 무엇이 주입됐나요?</summary>{diag}</details>
    </Sec>
    {direction}
    <Sec title="서고에 질문" desc={<span>저장된 기억만 근거로 답합니다. "우리 처음 만난 게 언제였지?" 같은 걸 물어보세요. (<code>/memoria-ask</code>로도 가능)</span>}>
      <div className="row"><input ref={qRef} className="inp" placeholder="이 이야기에 대해 물어보기…" defaultValue={st.question || ''} onChange={e => { st.question = e.target.value; }} onKeyDown={enter(() => void ask(askRef.current))} />{btnEl('질문', 'search', 'primary', askRef, () => void ask(askRef.current))}</div>
      <div className="mm-answer" hidden={!ans}>{ans}</div>
      <details className="mm-details" open={!!st.openEdit || st.log.length > 0} onToggle={e => { st.openEdit = e.currentTarget.open; }}><summary>사서에게 정정 요청 — 날짜·기록·요약·인물 설정을 대화로 고치기</summary>
        <p className="hint">읽기 전용 질문이 아니라 <b>실제 기록을 고치는</b> 대화입니다. 예: "지금 11월인데 3월로 바꿔줘", "그 요약 틀렸어, ○○가 아니라 △△였어", "서사 시계 2주가 아니라 3주야", "인물 설정 추가해줘". 사서가 바꿀 내용을 먼저 보여주면, 확인 버튼을 눌러야 실제로 반영됩니다.</p>
        {st.log.length ? log : null}<div className="row"><input ref={eqRef} className="inp" placeholder="고치고 싶은 걸 말해보세요…" onKeyDown={enter(() => void send(sendRef.current))} />{btnEl('보내기', 'send', '', sendRef, () => void send(sendRef.current))}</div>
        <div className="row"><Btn label="초기화" cls="ghost" ic="trash" title="대화 초기화" onClick={() => { st.log = []; st.draw(); toast('편집 대화를 초기화했습니다.'); }} /></div>
      </details>
    </Sec>
    <p className="mm-note"><b>작동 방식</b> — 답변이 끝날 때마다 그 턴을 자동으로 기록해 구조화된 기억으로 보관하고, 매 턴 현재 대화와 관련 있는 기억만 골라 토큰 예산 안에서 주입합니다.<br />
      <b>스와이프·편집·삭제·재생성</b> — 해당 턴(또는 지워진 마지막 턴)의 파생 기억은 자동으로 무효화되고, 새 답변이 오면 다시 기록됩니다.</p>
  </div>;
}
