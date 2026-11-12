// 정규식 스크립트 편집 + 시험 창 (고치는 대로 진단과 결과가 나온다)
import { Fragment, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Btn, Icon, IconBtn } from '../kit';
import type { ModalX, Regex } from '../studio/parts';
import { E, Lint, MODES, RX, WHO, chatLabel, clip, ctxOf, exportOne, lastChat, redrawChat, scName, type Match, type Sc } from './lib';
import { DiffText, HitsText, Issues, PlainText } from './parts';
import { pickMessage, pickTarget } from './pick';
import { Switch, arr, confirmBox, copyText, debounce, openModal, toast } from '../studio/parts';

const samples = new Map<string, string>();   // 스크립트 id → 마지막 시험 입력 (이번 실행 동안)
type View = 'diff' | 'hits' | 'result' | 'each';
type Out = { kind: 'wait' } | { kind: 'empty' } | { kind: 'stop'; msg: string } | { kind: 'none'; why: string[]; note: string }
  | { kind: 'ok'; text: string; result: string; matches: Match[]; found: number; removed: number; added: number; note: string };
const HANG = '이 입력에서는 계산이 끝나지 않아 멈췄어요 (1.5초 넘음). 되풀이가 겹친 패턴 — (a+)+ · (.*)* · (a|ab)* 같은 꼴 — 이 맞지 않는 글을 만나면 경우의 수가 폭발합니다. 안쪽을 [^…]+ 처럼 좁히거나, 바깥 되풀이를 없애세요. 이대로 켜 두면 대화 화면이 멈출 수 있습니다.';
const cap = (g: string | undefined) => g === undefined ? <span className="dim">맞지 않음 (빈칸)</span> : <code>{g || '∅'}</code>;

interface Ctl { sc: Sc; dead: boolean; seq: number }
function Body({ r, ctl, m, tab0 }: { r: Regex; ctl: Ctl; m: ModalX; tab0: 'form' | 'test' }) {
  const [tab, setTab] = useState(tab0), [tools] = useState(() => { const d = document.createElement('div'); d.className = 'rx-head-tools'; return d; });
  const root = useRef<HTMLDivElement>(null), head = useRef<Element | null>(null);
  // 창 머리의 닫기 단추 앞에 내보내기 · 삭제 단추를 끼운다
  useLayoutEffect(() => { const h = root.current?.closest('.modal-wrap')?.querySelector('.modal-head'); if (!h) return; head.current = h; h.insertBefore(tools, h.querySelector('.ibtn[title="닫기"]')); }, [tools]);
  const [, bump] = useState(0), [sample, setSample] = useState(samples.get(r.id) || ''), [out, setOut] = useState<Out>({ kind: 'wait' }), [view, setView] = useState<View>('diff');
  const alive = useRef(true), sampleRef = useRef(sample); sampleRef.current = sample;
  const persist = async () => { if (!ctl.dead) await RX().Scope.save(ctl.sc, r); };
  const save = useMemo(() => debounce(() => { void persist(); }, 350), []);   // eslint-disable-line react-hooks/exhaustive-deps
  const run = async () => {
    const my = ++ctl.seq, text = sampleRef.current; samples.set(r.id, text);
    const set = (o: Out) => { if (alive.current && my === ctl.seq) setOut(o); };
    const lint = Lint.lintScript(r);
    if (!text) return set({ kind: 'empty' });
    if (!lint.ok) return set({ kind: 'stop', msg: '찾기 문장에 오류가 있어 돌릴 수 없어요. 위의 진단을 먼저 확인하세요.' });
    const chat = lastChat(), ctx = ctxOf(chat), src = E.regexFind(r, ctx), re = E.compileRegex(src);
    if (!re) { const why = Lint.lintScript({ ...r, find: src }).issues.find(x => x.level === 'error')?.msg || ''; return set({ kind: 'stop', msg: `매크로를 넣은 뒤의 패턴 ${clip(src, 80)} 을(를) 정규식으로 읽지 못했어요. ${why} "기호를 글자로 바꿔 넣기" 를 써 보세요.` }); }
    const pr = await RX().probe(re.source, re.flags, text); if (my !== ctl.seq) return;
    if (!pr.ok) return set({ kind: 'stop', msg: HANG });
    const tr: { matches?: Match[] } = {}, result = E.runRegexScript({ ...r, enabled: true }, text, ctx, tr), T = Lint.tally(tr.matches);
    const note = /\{\{/.test(r.find + r.replace + arr(r.trim).join('')) ? (chat ? `매크로는 "${chatLabel(chat)}" 기준으로 채웠어요.` : '열린 대화가 없어 매크로는 채우지 않았어요.') : '';
    if (!T.found) return set({ kind: 'none', why: Lint.whyNoMatch(lint, text), note });
    set({ kind: 'ok', text, result, matches: tr.matches || [], ...T, note });
  };
  const test = useMemo(() => debounce(() => { void run(); }, 220), []);   // eslint-disable-line react-hooks/exhaustive-deps
  const touched = () => { save(); bump(n => n + 1); test(); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { alive.current = true; test(); return () => { alive.current = false; }; }, []);
  useEffect(() => { const h2 = head.current?.querySelector('h2'); if (h2) h2.textContent = r.name || '이름 없는 정규식'; });

  const lint = Lint.lintScript(r);
  const note = (t: string) => t ? <small className="hint">{t}</small> : null;
  let result: ReactNode = null;
  if (out.kind === 'empty') result = <p className="dim">시험할 글을 넣으면 찾은 곳 · 괄호로 잡은 부분 · 바뀐 결과를 단계별로 보여 줍니다.</p>;
  else if (out.kind === 'stop') result = <p className="rx-stop">{out.msg}</p>;
  else if (out.kind === 'none') result = <><p className="rx-none">이 입력에서는 찾은 곳이 없어요.</p><ul className="rx-why">{out.why.map((t, i) => <li key={i}>{t}</li>)}</ul>{note(out.note)}</>;
  else if (out.kind === 'ok') {
    const chips: [View, string][] = [['diff', '바뀐 곳'], ['hits', '찾은 곳'], ['result', '결과'], ['each', `하나씩 (${out.found})`]];
    result = <>
      <p className="rx-sum"><b>{`${out.found}곳 찾음`}</b>{` · ${out.removed.toLocaleString()}자를 ${out.added.toLocaleString()}자로 · 전체 ${out.text.length.toLocaleString()}자 → ${out.result.length.toLocaleString()}자`}{out.result === out.text ? ' · 글은 그대로' : ''}</p>
      <div className="rx-chips">{chips.map(([v, label]) => <button key={v} type="button" className={'chip' + (v === view ? ' on' : '')} data-v={v} onClick={() => setView(v)}>{label}</button>)}</div>
      <div className="rx-view">
        {view === 'diff' ? <DiffText text={out.text} matches={out.matches} /> : view === 'hits' ? <HitsText text={out.text} matches={out.matches} />
          : view === 'result' ? <><PlainText text={out.result} /><div className="row end"><Btn label="결과 복사" ic="copy" cls="ghost" onClick={() => copyText(out.result)} /></div></>
            : <>{out.matches.slice(0, 60).map((x, i) => <div className="rx-match" key={i}>
              <div className="rx-match-head"><b>{`${i + 1}번째`}</b><small>{`${x.index + 1}번째 글자부터 ${x.match.length}자`}</small></div>
              <dl><dt>찾은 글</dt><dd><code>{x.match || '∅ (빈 자리)'}</code></dd>
                {x.groups.map((g, k) => <Fragment key={'g' + k}><dt>{`$${k + 1}`}</dt><dd>{cap(g)}</dd></Fragment>)}
                {Object.entries(x.named || {}).map(([k, g]) => <Fragment key={'n' + k}><dt>{`$<${k}>`}</dt><dd>{cap(g)}</dd></Fragment>)}
                {x.raw !== x.cut ? <><dt>다듬기 전</dt><dd><code>{x.raw || '∅'}</code></dd><dt>다듬은 뒤</dt><dd><code>{x.cut || '∅'}</code></dd></> : null}
                {x.cut !== x.out ? <><dt>매크로 채움</dt><dd><code>{x.out || '∅'}</code></dd></> : null}
                <dt>바뀐 글</dt><dd><code className="rx-res">{x.out || '∅ (지움)'}</code></dd></dl>
            </div>)}{out.matches.length > 60 && <p className="dim">{`앞의 60곳만 보여 줍니다 (모두 ${out.matches.length}곳).`}</p>}</>}
      </div>{note(out.note)}</>;
  }

  const field = (label: string, ctl_: ReactNode, hint?: string, cls = '') => <label className={('field ' + cls).trim()}><span className="field-label">{label}</span>{ctl_}{hint && <small className="hint">{hint}</small>}</label>;
  const txt = (key: 'name' | 'find' | 'replace', rows: number, placeholder: string) => rows
    ? <textarea className="inp rx-mono" defaultValue={r[key] ?? ''} spellCheck={false} autoComplete="off" rows={rows} placeholder={placeholder} onChange={e => { r[key] = e.target.value; touched(); }} />
    : <input className="inp" defaultValue={r[key] ?? ''} spellCheck={false} autoComplete="off" placeholder={placeholder} onChange={e => { r[key] = e.target.value; touched(); }} />;
  const num = (key: 'minDepth' | 'maxDepth', label: string, min: number) => field(label, <input className="inp" type="number" min={min} max={9999} defaultValue={r[key] ?? ''} placeholder="제한 없음" onChange={e => { r[key] = e.target.value === '' ? null : +e.target.value; touched(); }} />, undefined, 'half');
  const move = async (anchor: Element) => { const to = await pickTarget(anchor, ctl.sc); if (!to) return; await persist(); await RX().moveScripts([{ r, sc: ctl.sc }], to); ctl.sc = to; bump(n => n + 1); toast(`${scName(to)}(으)로 옮겼어요`, 'ok'); };
  const del = async () => { if (!(await confirmBox(`"${r.name}" 정규식을 삭제할까요?`, '삭제', true))) return; ctl.dead = true; await RX().Scope.remove(ctl.sc, r); m.close(); };
  const sc = ctl.sc;

  return <div className="rx-ed" data-tab={tab} ref={root}>
    {createPortal(<><IconBtn ic="import" title="실리태번 형식(JSON)으로 내보내기" onClick={() => exportOne(r)} /><IconBtn ic="trash" title="삭제" onClick={() => void del()} /></>, tools)}
    <div className="rx-seg"><button type="button" data-t="form" onClick={() => setTab('form')}>설정</button><button type="button" data-t="test" onClick={() => setTab('test')}>시험</button></div>
    <div className="rx-ed-form">
      <div className="rx-ed-top"><label className="rx-on"><Switch span checked={!!r.enabled} title="이 스크립트 사용" onChange={v => { r.enabled = v; touched(); }} /><span>사용</span></label>
        <div className="rx-scope-line"><span className="rx-scope-tag"><Icon name={sc.kind === 'global' ? 'moon' : sc.kind === 'preset' ? 'sliders' : 'user'} size={14} />{scName(sc)}</span><Btn label="옮기기" cls="ghost" ic="right" onClick={e => void move(e.currentTarget)} /></div></div>
      <div className="form">
        {field('이름', txt('name', 0, '알아보기 쉬운 이름'))}
        {field('찾기', txt('find', 2, '/찾을 패턴/g'), '/패턴/플래그 꼴로 적습니다. 슬래시 없이 적으면 맞는 곳을 모두 바꿉니다.')}
        <div className="field"><div className="rx-flags">{lint.ok ? lint.flagNotes.map((t, i) => <em className="badge" key={i}>{t}</em>) : null}{lint.ok && lint.groups ? <em className="badge">{`괄호 그룹 ${lint.groups}개`}</em> : null}</div>
          <div className="rx-diag">{lint.issues.length ? <Issues issues={lint.issues} /> : <p className="rx-fine"><Icon name="check" size={14} />문제를 찾지 못했어요.</p>}</div></div>
        {field('바꾸기', txt('replace', 4, '비워 두면 찾은 글을 지웁니다'), '$1 $2 … 괄호로 잡은 부분 · {{match}} 찾은 글 전체 · $<이름> 이름 붙인 그룹 · HTML 과 매크로를 쓸 수 있어요.')}
        {field('다듬기 문자열', <textarea className="inp rx-mono" rows={2} spellCheck={false} defaultValue={arr(r.trim).join('\n')} placeholder="한 줄에 하나씩" onChange={e => { r.trim = e.target.value.split('\n').filter(x => x.length); touched(); }} />, '$1 · {{match}} 로 가져온 부분에서 지울 글자입니다.')}
        <div className="field"><span className="field-label">대상</span><div className="rx-pills">{WHO.map(([k, label]) => <label className="check pill" key={k}><input type="checkbox" defaultChecked={!!r[k]} onChange={e => { r[k] = e.target.checked; touched(); }} /><i /><span>{label}</span></label>)}</div></div>
        {field('적용 방식', <select className="inp" defaultValue={String(r.mode ?? MODES[0][0])} onChange={e => { r.mode = e.target.value; touched(); }}>{MODES.map(x => <option key={x[0]} value={x[0]}>{x[1]}</option>)}</select>, '원문을 바꿔 저장하면 보내거나 받은 글 자체가 바뀌어 되돌릴 수 없어요. 나머지는 원문을 그대로 둡니다.', 'half')}
        {field('찾기의 매크로', <select className="inp" defaultValue={String(r.subst ?? 0)} onChange={e => { r.subst = +e.target.value; touched(); }}><option value="0">바꾸지 않음</option><option value="1">값을 넣기</option><option value="2">기호를 글자로 바꿔 넣기</option></select>, '찾기 안의 {{char}} {{user}} 같은 매크로를 이름으로 바꿔 찾을지 정합니다.', 'half')}
        {num('minDepth', '최소 깊이', -1)}{num('maxDepth', '최대 깊이', 0)}
        <small className="hint rx-wide">깊이 0 은 마지막 메시지, 1 은 그 앞 메시지입니다. 화면 표시와 전송에서만 봅니다. 최소 깊이를 비우거나 -1 로 두면 이어 쓰는 메시지에도 적용돼요.</small>
        <label className="check"><input type="checkbox" defaultChecked={r.runOnEdit === true} onChange={e => { r.runOnEdit = e.target.checked; touched(); }} /><i /><span>메시지를 고칠 때도 적용</span><small>원문을 바꿔 저장하는 방식에서만 쓰입니다.</small></label>
      </div>
    </div>
    <div className="rx-ed-test">
      <div className="rx-test-head"><span className="field-label">시험 입력</span><Btn label="대화에서 가져오기" cls="ghost" ic="chat" onClick={async () => { const got = await pickMessage(); if (got) { sampleRef.current = got.text; setSample(got.text); test(); } }} /></div>
      <textarea className="inp rx-mono" rows={6} spellCheck={false} placeholder="여기에 시험할 글을 넣으세요. 고치는 대로 아래에 결과가 나옵니다." value={sample} onChange={e => { sampleRef.current = e.target.value; setSample(e.target.value); test(); }} />
      <div className="rx-out">{result}</div>
    </div>
  </div>;
}

/** 스크립트 편집 창을 연다. 닫히면 저장하고 onClose(마지막 범위) 를 부른다 */
export function openEditor(r: Regex, sc: Sc, { tab = 'form', onClose }: { tab?: 'form' | 'test'; onClose?: (sc: Sc) => void } = {}) {
  if (r.subst === undefined) r.subst = String(r.find || '').includes('{{') ? 1 : 0;   // 옛 스크립트: 엔진이 보던 대로 값을 채워 보여 준다
  if (r.runOnEdit === undefined) r.runOnEdit = false;
  const ctl: Ctl = { sc, dead: false, seq: 0 };
  return openModal({ title: r.name || '이름 없는 정규식', wide: true, cls: 'rx-sheet',
    onClose: () => { ctl.seq++; void (async () => { if (!ctl.dead) await RX().Scope.save(ctl.sc, r); redrawChat(); onClose?.(ctl.sc); })(); } },
  m => <Body r={r} ctl={ctl} m={m} tab0={tab} />);
}
