// 기능 화면 › 번역: 기본(연결 · 언어 · 지시문 프리셋 · 시험 번역) / 설정(요청 · 단추 · 번역 기록 지우기)
import { useRef, useState, type MouseEvent } from 'react';
import { Btn, Icon, IconBtn, useEvents } from '../kit';
import { B, errMsg } from '../addons/legacy';
import { Check, Field, PathIcon, Select, type Opt } from '../addons/parts';
import { DEFAULT_PROMPT, LANGS, VARS, findLang, langLabel } from './lang';
import { cfg, deleteRange, presetOf, save, translate, translatedCount, type LangKey, type TrCfg, type TrPreset } from './logic';
import { GLOBE, SHEET, SPIRAL, redecorate } from './chat';

let sub: 'basic' | 'options' = 'basic';
const MODE = { none: '자동 꺼짐', responses: '답변 자동', inputs: '입력 자동', both: '답변 · 입력 자동' };
type Mode = keyof typeof MODE;

function LangSelect({ c, k, fallback, draw }: { c: TrCfg; k: LangKey; fallback: string; draw: () => void }) {
  const cur = c[k] || fallback, known = findLang(cur);
  const opts: Opt[] = [...LANGS.map(l => [l[1], `${l[2]} · ${l[1]}`] as const), ...(known ? [] : [[cur, `${cur} (직접 적음)`] as const]), ['\u0001', '직접 적기…']];
  return <Select value={known ? known[1] : cur} opts={opts} onChange={async v => {
    if (v === '\u0001') { const t = await B.ui.promptBox('언어 이름', known ? '' : cur, { placeholder: '예: Old English, 경상도 사투리' }); if (t?.trim()) c[k] = t.trim(); save(); return draw(); }
    c[k] = v; save(); redecorate(); draw();
  }} />;
}

function Basic({ c, p, mode, draw }: { c: TrCfg; p: TrPreset; mode: Mode; draw: () => void }) {
  const S = B.S, toast = B.ui.toast, helpers = S.settings.helpers as Record<string, string>;
  const area = useRef<HTMLTextAreaElement>(null);
  const [test, setTest] = useState(''), [out, setOut] = useState({ cls: '', text: '' });
  const alive = useRef(true);
  const runTest = async (e: MouseEvent<HTMLButtonElement>) => {
    const b = e.currentTarget; if (!test.trim()) return toast('번역해 볼 글을 적어 주세요');
    b.disabled = true; setOut({ cls: 'wait', text: '번역하는 중…' });
    let next;
    try { next = { cls: 'done', text: await (B.X.translate || translate)(test, c.lang, { chat: B.chat.current().chat, context: [] }) }; }
    catch (err) { next = { cls: 'fail', text: '실패: ' + errMsg(err) }; }
    b.disabled = false; if (alive.current && b.isConnected) setOut(next);
  };
  const named = async (title: string, first: string) => {
    const name = (await B.ui.promptBox(title, first))?.trim(); if (!name || name === first) return '';
    if (c.presets.some(x => x.name === name)) { toast('같은 이름의 프리셋이 있어요', 'err'); return ''; }
    return name;
  };
  return <div className="card trx-card" ref={el => { alive.current = !!el; }}>
    <div className="form">
      <h3 className="form-sec">연결과 언어</h3>
      <Field label="번역에 쓸 연결" hint="번역만 값싸고 빠른 모델에 맡길 수 있어요."><div className="trx-row">
        <Select value={helpers.translate} opts={[['', '대화에 쓰는 연결'], ...S.conns.map(x => [x.id, `${x.name}${x.model ? ' · ' + x.model : ''}`] as const)]} onChange={v => { helpers.translate = v; save(); draw(); }} />
        <IconBtn ic="plug" title="API 연결 화면으로" onClick={() => B.ui.go('conns')} /></div></Field>
      <Field label="자동 번역" hint="내 글을 번역해서 보내면 화면에는 내가 쓴 글이, 모델에는 번역문이 갑니다.">
        <Select value={mode} opts={[['none', '하지 않음'], ['responses', '답변을 번역해서 보여 주기'], ['inputs', '내 글을 번역해서 보내기'], ['both', '둘 다']]} onChange={v => { c.auto = v === 'responses' || v === 'both'; c.autoInput = v === 'inputs' || v === 'both'; save(); draw(); }} /></Field>
      <Field label="답변을 옮길 언어" cls="half"><LangSelect c={c} k="lang" fallback="Korean" draw={draw} /></Field>
      <Field label="내 글을 옮길 언어" cls="half"><LangSelect c={c} k="inputLang" fallback="English" draw={draw} /></Field>
      <h3 className="form-sec">지시문 프리셋</h3>
      <div className="field"><div className="trx-row">
        <Select value={c.preset} opts={c.presets.map(x => [x.id, x.name] as const)} onChange={v => { c.preset = v; save(); draw(); }} />
        <IconBtn ic="plus" title="지금 프리셋을 복사해 새로 만들기" onClick={async () => {
          const name = await named('새 프리셋 이름', ''); if (!name) return;
          const id = 'p' + Date.now().toString(36); c.presets.push({ id, name, content: p.content, filter: p.filter }); c.preset = id; save(); draw();
        }} />
        <IconBtn ic="edit" title="이름 바꾸기" onClick={async () => {
          if (p.id === 'default') return toast('기본 프리셋은 이름을 바꿀 수 없어요');
          const name = await named('프리셋 이름', p.name); if (!name) return;
          p.name = name; save(); draw();
        }} />
        <IconBtn ic="trash" title="프리셋 삭제" onClick={async () => {
          if (p.id === 'default') return toast('기본 프리셋은 지울 수 없어요');
          if (!(await B.ui.confirmBox(`"${p.name}" 프리셋을 지울까요?`, '삭제', true))) return;
          c.presets = c.presets.filter(x => x !== p); c.preset = c.presets[0].id; save(); draw();
        }} /></div></div>
      <div className="field">
        <span className="field-label">지시문<button type="button" className="trx-restore" title="이 프리셋의 지시문을 기본 지시문으로 되돌립니다"
          onClick={async () => { if (await B.ui.confirmBox('지시문을 기본값으로 되돌릴까요?', '되돌리기')) { p.content = DEFAULT_PROMPT; p.filter = true; save(); draw(); } }}><Icon name="refresh" size={13} />기본값으로</button></span>
        <textarea className="inp trx-prompt" ref={area} value={p.content} rows={14} spellCheck={false} onChange={e => { p.content = e.target.value; save(); draw(); }} />
        <div className="trx-vars">{VARS.map(([v, d]) => <button key={v} type="button" className="trx-var" title={d + ' · 눌러서 넣기'} onClick={() => {
          const a = area.current; if (!a) return; const at = a.selectionStart ?? a.value.length; a.setRangeText(v, at, a.selectionEnd ?? at, 'end'); a.focus(); p.content = a.value; save(); draw();
        }}>{v}</button>)}</div></div>
      <h3 className="form-sec">시험 번역</h3>
      <div className="field"><textarea className="inp" rows={2} placeholder="시험 삼아 번역해 볼 글" value={test} onChange={e => setTest(e.target.value)} />
        <div className="trx-row"><span className="hint">{`지금 프리셋으로 ${langLabel(c.lang)}(으)로 옮겨 봅니다.`}</span><Btn label="번역해 보기" ic="play" onClick={e => void runTest(e)} /></div>
        <div className={`trx-test-out ${out.cls}`.trim()}>{out.text}</div></div>
    </div></div>;
}

function Options({ c, p, draw }: { c: TrCfg; p: TrPreset; draw: () => void }) {
  const clamp = B.core.clamp, { chat, msgs } = B.chat.current();
  const tok = useRef<HTMLInputElement>(null), ok = useRef<HTMLSpanElement>(null), from = useRef<HTMLInputElement>(null), to = useRef<HTMLInputElement>(null);
  const n = chat ? translatedCount(msgs) : 0;
  const show = (k: 'btnQuick' | 'btnTranslate' | 'btnRe' | 'btnEdit') => (v: boolean) => { c[k] = v; save(); redecorate(); draw(); };
  return <div className="card trx-card">
    <div className="form">
      <h3 className="form-sec">요청</h3>
      <div className="field half"><span className="field-label">최대 응답 토큰 (최대 200,000)</span><div className="trx-row"><input className="inp" type="number" min={1000} max={200000} step={1000} defaultValue={c.maxTokens ?? 20000} ref={tok} />
        <Btn label="적용" onClick={() => { const t = tok.current; if (!t) return; c.maxTokens = clamp(Math.round(+t.value) || 20000, 1000, 200000); t.value = String(c.maxTokens); save(); ok.current?.classList.add('show'); setTimeout(() => ok.current?.classList.remove('show'), 1800); }} /></div>
        <span className="trx-ok" ref={ok}><Icon name="check" size={14} />적용했어요</span></div>
      <Field label="참고할 앞 메시지 수" cls="half" hint="이름과 말투를 맞추려고 함께 보내는 앞 메시지 개수. 0 이면 보내지 않습니다.">
        <input className="inp" type="number" min={0} max={20} defaultValue={c.context ?? 3} onChange={e => { c.context = clamp(Math.round(+e.target.value) || 0, 0, 20); save(); }} /></Field>
      <Check label="코드 블록 걸러 내기: ``` 사이의 글만 번역문으로 씁니다 (권장)" on={p.filter !== false} onChange={v => { p.filter = v; save(); draw(); }} hint={`프리셋 "${p.name}" 에 따로 저장됩니다`} />
      <hr className="trx-hr" />
      <h3 className="form-sec">단추 보이기</h3>
      <Check label="보내기 단추 옆에 빠른 입력 번역 단추" on={c.btnQuick !== false} onChange={show('btnQuick')} />
      <Check label="메시지에 번역 단추 (지구본)" on={c.btnTranslate !== false} onChange={show('btnTranslate')} />
      <Check label="메시지에 다시 번역 단추" on={c.btnRe !== false} onChange={show('btnRe')} />
      <Check label="메시지에 번역 고치기 단추" on={c.btnEdit !== false} onChange={show('btnEdit')} />
      <div className="trx-legend"><span><PathIcon d={GLOBE} size={15} />번역 · 원문 ↔ 번역 전환</span><span><PathIcon d={SPIRAL} size={15} />다시 번역</span><span><PathIcon d={SHEET} size={15} />번역 고치기</span></div>
      <hr className="trx-hr" />
      <h3 className="form-sec">번역 기록 지우기</h3>
      <div className="field">
        <span className="field-label">{chat ? `지금 열린 대화 · 메시지 ${msgs.length}개 가운데 ${n}개에 번역이 있어요` : '열린 대화가 없어요. 대화를 연 뒤에 쓸 수 있습니다.'}</span>
        <div className="trx-row trx-range"><input className="inp" type="number" min={1} step={1} placeholder="시작 번호" ref={from} /><span className="trx-tilde">~</span><input className="inp" type="number" min={1} step={1} placeholder="끝 번호" ref={to} />
          <Btn label="삭제" cls="danger" ic="trash" onClick={async () => { if (await deleteRange(from.current?.value ?? '', to.current?.value ?? '', false)) draw(); }} /></div>
        <div className="trx-row"><Btn label="전체 삭제" cls="danger" onClick={async () => { if (await deleteRange(null, null, true)) draw(); }} /><span className="hint">번호는 메시지 머리에 보이는 번호(001, 002 …)입니다. 원문은 지워지지 않아요.</span></div></div>
    </div></div>;
}

/** div.trx 안을 그린다 */
export function TranslateStudio() {
  const draw = useEvents('conns');
  const c = cfg(), p = presetOf();
  const mode: Mode = c.auto && c.autoInput ? 'both' : c.auto ? 'responses' : c.autoInput ? 'inputs' : 'none';
  return <>
    <div className="trx-top">
      <div className="trx-seg">{([['basic', '기본'], ['options', '설정']] as const).map(([k, l]) => <button key={k} type="button" className={sub === k ? 'on' : undefined} onClick={() => { sub = k; draw(); }}>{l}</button>)}</div>
      <div className="trx-state"><span className="badge on">{langLabel(c.lang)}</span><span className="badge" title="자동 번역">{MODE[mode]}</span><span className="badge">{p.name}</span></div></div>
    {sub === 'basic' ? <Basic c={c} p={p} mode={mode} draw={draw} /> : <Options key={p.id} c={c} p={p} draw={draw} />}
    <p className="hint">명령어: /translate [메시지 번호] · /translate-text target=언어 글</p>
  </>;
}
