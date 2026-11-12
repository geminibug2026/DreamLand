// 삽화의 창들: 프롬프트 편집 · 공유, 사용법, 이미지 읽기, 지시 기록 + 대화 내보내기
import { useEffect, useRef, useState, type DragEvent, type ReactNode } from 'react';
import { Icon } from '../kit';
import { C, IL, Illust, U, chatApi, cur, errText, flat, guard, lastReply, shownTitle } from './bridge';
import { Area, Btn, Chk, Empty, Fld, Sel, openModal, type Box } from './parts';
import { GUIDE_STEPS, GUIDE_TOPICS } from './guide';
import { importedConfig, readNaiImage, type NaiMeta } from './png';
import { compose } from './work';
import type { Msg, PlanRecord, Slot, Swipe } from './types';

// ════════ 프롬프트 편집 · 공유 ════════
interface PromptDraft { style: string; negative: string; quality: boolean; analysisPrompt: string; planPrompt: string }
const Rules = ({ note, txt }: { note: string; txt: string }) => <details className="sb-fold"><summary>출력 규칙</summary><p className="hint">{note}</p><pre className="regex-out sb-code">{txt}</pre></details>;
function PromptPane({ d, hold, lean }: { d: PromptDraft; hold: { at: number; redo: () => void }; lean: boolean }) {
  const [at, setAt] = useState(hold.at), [ver, setVer] = useState(0);
  hold.at = at; hold.redo = () => setVer(v => v + 1);
  const views: [string, () => ReactNode][] = [
    ['화풍', () => <><Area obj={d} k="style" label="메인 프롬프트 (모든 그림 앞에 붙습니다)" rows={5} ph="watercolor, soft lighting …" /><Area obj={d} k="negative" label="피할 것 (UC)" rows={3} /><Chk label="품질 태그 자동으로 붙이기" checked={d.quality} onChange={v => { d.quality = v; }} /><p className="hint">모든 장면의 공통값입니다. 장면 · 인물별 프롬프트는 장면 편집에서 고칩니다.</p></>],
    ['수동 분석', () => <><Area obj={d} k="analysisPrompt" label="장면 분석 지시문" rows={16} /><p className="hint">{'{{data}} 대화 · 인물 · {{maxScenes}} 장면 수 · {{modelRule}} 모델별 작성법 · {{playerRule}} 내 캐릭터 · {{direction}} 연출 방향. JSON 응답 형식은 그대로 지켜 주세요.'}</p><Rules note="분석 결과의 JSON 형식 오류를 줄이려고 보낼 때 덧붙이는 규칙입니다. 저장한 지시문은 바꾸지 않아요." txt={Illust().analysisRules()} /></>],
    ['주입', () => <><p className="hint">{'답변을 쓰는 모델에게 프리셋 뒤에 덧붙여 보내는 지시문입니다. 전체를 <image_generation> 태그로 감싸 보냅니다.'}</p><Area obj={d} k="planPrompt" label="삽화 계획 지시문" rows={16} /><p className="hint">{'바깥 태그는 자동으로 붙으니 <!--scenebook 출력 형식과 {{data}} 변수만 지켜 주세요. 장면 제목은 더 이상 요구하지 않습니다. 예전에 저장한 JSON 형식 지시문도 그대로 동작하며, 기본 지시문 버튼으로 짧은 줄 단위 형식으로 바꿀 수 있어요.'}</p><Rules note="주입이 켜진 답변에는 장면을 최소 한 장 요구하고 빈 계획을 받지 않습니다. 저장한 지시문은 그대로 두고, 예전 지시문의 생략 허용 문구보다 이 출력 규칙을 우선하도록 전합니다. 삽화를 끄려면 자동 처리를 끄세요." txt={lean ? '간결한 삽화 지시문을 켠 상태에서는 추가 출력 규칙을 덧붙이지 않습니다.' : Illust().outputRules()} /></>],
  ];
  return <>
    <div className="tabs sb-tabs">{views.map(([l], i) => <button key={i} type="button" className={'tab' + (i === at ? ' on' : '')} onClick={() => setAt(i)}>{l}</button>)}</div>
    <div className="col" key={`${at}-${ver}`}>{views[at][1]()}</div>
  </>;
}
export function promptEditor(startAt = 0, onApplied: () => void = () => { }) {
  const c = Illust().cfg(), { PLAN_PROMPT, LEAN_PROMPT, ANALYSIS_PROMPT } = IL(), DEF_PLAN = c.leanPrompt ? LEAN_PROMPT : PLAN_PROMPT;
  const d: PromptDraft = { style: c.style || '', negative: c.negative || '', quality: !!c.quality, analysisPrompt: c.analysisPrompt || ANALYSIS_PROMPT, planPrompt: c.planPrompt || DEF_PLAN };
  const hold = { at: startAt, redo: () => { } };
  const read = () => {
    for (const [k, name] of [['analysisPrompt', '분석 지시문'], ['planPrompt', '주입 지시문']] as ['analysisPrompt' | 'planPrompt', string][]) {
      if (d[k].length > 30000) throw new Error(`${name}이 너무 길어요 (최대 30,000자).`);
      if (d[k] && !d[k].includes('{{data}}')) throw new Error(`${name}에는 {{data}} 가 필요해요. 이 자리에 대화 · 인물 정보가 들어갑니다.`);
      const unknown = [...d[k].matchAll(/\{\{(\w+)\}\}/g)].map(x => x[1]).filter(x => !['maxScenes', 'playerRule', 'modelRule', 'direction', 'data'].includes(x)); if (unknown.length) throw new Error(`${name}에 알 수 없는 변수가 있어요: ${unknown.join(', ')}`);
    }
    if (d.planPrompt && !d.planPrompt.includes('<!--scenebook')) throw new Error('주입 지시문에는 <!--scenebook 출력 형식이 필요해요.');
    return { style: d.style.trim(), negative: d.negative.trim(), quality: !!d.quality, analysisPrompt: d.analysisPrompt === ANALYSIS_PROMPT ? '' : d.analysisPrompt, planPrompt: d.planPrompt === DEF_PLAN ? '' : d.planPrompt };
  };
  openModal({ title: '프롬프트', wide: true, cls: 'col', actions: [
    { label: '내보내기', ic: 'import', cls: 'ghost', onclick: () => { try { const v = read(); C().download('scenebook-prompts.json', JSON.stringify({ kind: 'scenebook-prompts', schema: 1, style: v.style, negative: v.negative, quality: v.quality, analysisPrompt: v.analysisPrompt, injectionPrompt: v.planPrompt }, null, 2)); } catch (e) { U().toast(errText(e), 'err'); } return false; } },
    { label: '가져오기', ic: 'upload', cls: 'ghost', onclick: async () => { try { const [f] = await C().pickFiles({ accept: '.json,application/json' }); if (!f) return false; if (f.size > 100000) throw new Error('100KB 이하 프롬프트 파일을 골라 주세요.'); const v = JSON.parse(await f.text()) as Record<string, unknown> | null; if (v?.kind !== 'scenebook-prompts') throw new Error('프롬프트 파일이 아니에요.'); Object.assign(d, { style: String(v.style || ''), negative: String(v.negative || ''), quality: !!v.quality, analysisPrompt: String(v.analysisPrompt || '') || ANALYSIS_PROMPT, planPrompt: String(v.injectionPrompt || v.planPrompt || '') || DEF_PLAN }); hold.redo(); U().toast('프롬프트를 불러왔어요. 내용을 확인한 뒤 적용해 주세요.'); } catch (e) { U().toast(errText(e), 'err'); } return false; } },
    { label: '기본 지시문', cls: 'ghost', onclick: () => { if (hold.at === 2) d.planPrompt = DEF_PLAN; else d.analysisPrompt = ANALYSIS_PROMPT; hold.redo(); U().toast('기본 지시문을 불러왔어요. 적용하기 전에는 저장되지 않습니다.'); return false; } },
    { label: '적용', cls: 'primary', onclick: () => { try { Illust().saveCfg(read()); onApplied(); U().toast('프롬프트를 저장했어요', 'ok'); } catch (e) { U().toast(errText(e), 'err'); return false; } } }] },
    () => <PromptPane d={d} hold={hold} lean={!!c.leanPrompt} />);
}

// ════════ 사용법 ════════
function Guide() {
  const [i, setI] = useState(0), [q, setQ] = useState('');
  const k = q.trim().toLowerCase(), hits = GUIDE_TOPICS.filter(([t, d]) => !k || `${t} ${d}`.toLowerCase().includes(k));
  return <>
    <section className="sb-guide-step"><b>{`${i + 1}. ${GUIDE_STEPS[i][0]}`}</b><p>{GUIDE_STEPS[i][1]}</p></section>
    <div className="row"><Btn label="이전" cls="ghost" disabled={i === 0} onClick={() => setI(i - 1)} /><span className="hint">{`${i + 1} / ${GUIDE_STEPS.length}`}</span><Btn label="다음" cls="ghost" disabled={i === GUIDE_STEPS.length - 1} onClick={() => setI(i + 1)} /></div>
    <input className="inp" type="search" placeholder="기능 찾기 · 예: 시드, 배치, 참조" value={q} onChange={e => setQ(e.target.value)} />
    <div className="sb-guide-topics">{hits.map(([t, d]) => <details className="sb-fold" key={`${q}|${t}`} open={!!k}><summary>{t}</summary><p>{d}</p></details>)}{!hits.length ? <Empty>일치하는 설명이 없어요.</Empty> : null}</div>
  </>;
}
export function guide() { openModal({ title: '삽화 사용법', wide: true, cls: 'col' }, () => <Guide />); }

// ════════ 이미지 읽기 ════════
const IMPORT_LABELS: Record<string, string> = { width: '가로', height: '세로', steps: 'Steps', scale: 'Guidance (CFG)', sampler: '샘플러', scheduler: '스케줄러', cfgRescale: 'CFG rescale', transparent: '투명 배경' };
function ImageImport({ box, onApplied, hold }: { box: Box; onApplied: () => void; hold: { stop: () => void } }) {
  const [status, setStatus] = useState(''), [got, setGot] = useState<{ r: NaiMeta; url: string } | null>(null), [over, setOver] = useState(false);
  const serial = useRef(0), url = useRef(''), pick = useRef({ model: '', relax: false }), root = useRef<HTMLDivElement>(null);
  hold.stop = () => { serial.current++; if (url.current) URL.revokeObjectURL(url.current); };
  const read = async (file: File) => {
    const ticket = ++serial.current; setGot(null); setStatus('이미지 정보를 읽는 중…'); if (url.current) URL.revokeObjectURL(url.current);
    try {
      const r = await readNaiImage(file); if (ticket !== serial.current) return;
      url.current = URL.createObjectURL(file); pick.current = { model: String(r.patch.model || ''), relax: false };
      setStatus(`${file.name || '붙여 넣은 이미지'} · ${r.storage}`); setGot({ r, url: url.current });
    } catch (e) { if (ticket === serial.current) setStatus(errText(e)); }
  };
  useEffect(() => {   // 창 안 어디에 붙여 넣어도 읽는다
    const el = root.current?.parentElement; if (!el) return;
    const paste = (e: ClipboardEvent) => { const f = [...(e.clipboardData?.files || [])][0]; if (f) { e.preventDefault(); void read(f); } };
    el.addEventListener('paste', paste); return () => el.removeEventListener('paste', paste);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const c = Illust().cfg(), r = got?.r, num = (v: unknown, d: number) => typeof v === 'number' ? v : d;
  const large = !!r && (num(r.patch.width, c.width) * num(r.patch.height, c.height) > 1048576 || num(r.patch.steps, c.steps) > 28);
  const drop = (e: DragEvent) => { e.preventDefault(); setOver(false); const f = e.dataTransfer?.files?.[0]; if (f) void read(f); };
  return <>
    <div ref={root} className={'dropzone small' + (over ? ' over' : '')} tabIndex={0} onClick={async () => { const [f] = await C().pickFiles({ accept: '.png,image/png' }); if (f) void read(f); }} onDragOver={e => { e.preventDefault(); setOver(true); }} onDragLeave={() => setOver(false)} onDrop={drop}><Icon name="image" size={24} /><b>NovelAI 원본 PNG 고르기</b><span>여기에 놓거나 붙여 넣어도 됩니다 · 최대 32MB</span></div>
    <p className="hint" role="status">{status}</p>
    <div className="col" key={got?.url}>{r && got ? <>
      <div className="sb-import-head"><img src={got.url} alt="가져올 이미지" /><div className="col"><Fld label="적용할 모델"><Sel opts={[['', '모델 선택'], ...Object.entries(IL().MODELS).map(([id, m]): [string, string] => [id, m.label])]} value={pick.current.model} onChange={v => { pick.current.model = v; }} /></Fld><small className="hint">{r.source}</small></div></div>
      <table className="sb-table"><caption>가져올 생성 설정</caption>{Object.entries(IMPORT_LABELS).filter(([k]) => k in r.patch).map(([k, l]) => <tr key={k}><th>{l}</th><td>{typeof r.patch[k] === 'boolean' ? (r.patch[k] ? '켜짐' : '꺼짐') : String(r.patch[k])}</td></tr>)}</table>
      <details className="sb-fold" open><summary>메인 프롬프트</summary><pre className="regex-out sb-code">{r.scene.prompt}</pre></details><details className="sb-fold"><summary>UC 프롬프트</summary><pre className="regex-out sb-code">{r.scene.negative || '비어 있음'}</pre></details>
      {large && c.budgetGuard ? <Chk label="비용 보호 해제" checked={false} onChange={v => { pick.current.relax = v; }} hint="큰 해상도 · 28 Steps 초과 설정을 적용할 때만 직접 골라 주세요." /> : null}
      {r.warnings.length ? <ul className="sb-warn">{r.warnings.map((w, i) => <li key={i}>{w}</li>)}</ul> : null}
      <p className="hint">메인 · UC 프롬프트와 위 생성 설정을 가져옵니다. 캐릭터 프롬프트 · 좌표 · 시드는 가져오지 않고, 품질 태그는 겹치지 않도록 끕니다.</p></> : null}</div>
    <div className="row end wrap">{r ? <>
      <Btn label="장면으로 열기" ic="edit" onClick={guard(async () => { const cfg = importedConfig(Illust().genConfig(), r, { model: pick.current.model, relax: large && pick.current.relax, forScene: true }); await compose(lastReply(), { initial: [r.scene], config: cfg }); box.close(); })} />
      <Btn label="설정에 적용" ic="check" cls="primary" onClick={guard(() => { Illust().saveCfg(importedConfig(Illust().genConfig(), r, { model: pick.current.model, relax: large && pick.current.relax, forScene: false }), { reason: '이미지 읽기 전', force: true }); box.close(); onApplied(); U().toast('메인 · UC 프롬프트와 생성 설정을 적용했어요', 'ok'); })} /></> : null}</div>
  </>;
}
export function imageImport(onApplied: () => void = () => { }) {
  const hold = { stop: () => { } };
  openModal({ title: '이미지 읽기', wide: true, cls: 'col', onClose: () => hold.stop() }, box => <ImageImport box={box} onApplied={onApplied} hold={hold} />);
}

// ════════ 지시 기록 · 대화 내보내기 ════════
const PLAN_LABELS: Record<string, string> = { queued: '생성 요청됨', done: '그림 완성', ready: '초안 저장됨', missing: '지시 없음', failed: '처리 실패' };
export function showPlans() {
  const { chat, msgs } = cur(); if (!chat || !msgs) return U().toast('대화를 먼저 열어 주세요');
  const rows = msgs.map((m, i) => ({ m, i, sw: m.swipes?.[m.sw] as Swipe | undefined })).filter(r => r.sw?.illustPlan || r.sw?.illustDraft?.length).slice(-20).reverse();
  openModal({ title: '지시 기록', wide: true, cls: 'col' }, box => <>
    <p className="hint">이 대화 · 최근 답변 20개</p>
    {!rows.length ? <Empty>저장된 지시가 없어요. 다음 답변부터 처리 결과가 남습니다.</Empty> : rows.map(({ m, i, sw }) => { const p: PlanRecord = sw?.illustPlan || {};
      return <details className="sb-fold" key={m.id}><summary>{`답변 ${i + 1} · ${PLAN_LABELS[p.status || ''] || '초안 저장됨'}`}</summary>{p.error ? <p className="err">{p.error}</p> : null}{p.warnings?.length ? <ul className="sb-warn">{p.warnings.map((w, n) => <li key={n}>{w}</li>)}</ul> : null}{p.repairs?.length ? <small className="hint">{`형식 복구: ${p.repairs.join(' · ')}`}</small> : null}
        {p.raw ? <pre className="regex-out sb-code">{p.raw}</pre> : null}<div className="row"><Btn label="장면 편집" ic="edit" cls="ghost" onClick={guard(async () => { box.close(); await compose(m); })} /><Btn label="답변으로 가기" cls="ghost" onClick={() => { box.close(); chatApi().scrollTo(m.id); }} /></div></details>; })}
  </>);
}
export function exportChat() {
  const { chat, msgs } = cur(); if (!chat || !msgs) return U().toast('대화를 먼저 열어 주세요');
  const S = C().S, esc = C().esc, user = S.persona(chat)?.name || '나', name = chat.name || chat.charIds.map(id => S.get('chars', id)?.name).filter(Boolean).join(', ') || '삽화 대화';
  const body = msgs.filter((m: Msg) => m.role !== 'system' && !m.hidden).map(m => { const sw: Swipe = m.swipes[m.sw] || {};
    const inline = Illust().cfg().placement === 'inline', fig = (it: Slot) => `<figure><img src="${Illust().data(it.id)}" alt="${esc(it.title || '삽화')}">${shownTitle(it.title) ? `<figcaption>${esc(it.title)}</figcaption>` : ''}</figure>`;
    const items = (sw.illust || []).filter(it => !it.hidden && Illust().data(it.id)), body0 = Illust().strip(sw.text || '').trim(), paras = inline ? body0.split(/\n\s*\n/) : [body0], slots: Slot[][] = paras.map(() => []), tail: Slot[] = [];
    for (const it of items) { const key = inline && it.anchor ? flat(it.anchor).slice(0, 40) : '', i = key ? paras.findIndex(p => flat(p).includes(key)) : -1; (i >= 0 ? slots[i] : tail).push(it); }   // 문단 뒤 삽화는 그 문단 뒤에
    return `<article><h2>${esc(m.role === 'user' ? user : m.name || '')}</h2>${paras.map((p, i) => `<div class="text">${esc(p)}</div>${slots[i].map(fig).join('')}`).join('')}${tail.map(fig).join('')}</article>`; }).join('\n');
  C().download(`${name.replace(/[\\/:*?"<>|]/g, '_')}.html`, `<!doctype html><html lang="ko"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(name)}</title><style>body{background:#fafaf8;color:#161616;font:16px/1.85 system-ui,sans-serif;margin:0}main{max-width:820px;padding:28px 22px;margin:auto}article{padding:22px 0;border-bottom:1px solid #1616162e}h1{font-size:24px}h2{font-size:14px;letter-spacing:.04em}.text{white-space:pre-wrap;overflow-wrap:anywhere;margin:0 0 1.1em}figure{max-width:560px;margin:22px auto;border:1px solid #161616}img{display:block;width:100%;height:auto}figcaption{font-size:13px;padding:6px 10px;border-top:1px solid #1616162e}</style><main><h1>${esc(name)}</h1>${body}</main></html>`, 'text/html;charset=utf-8');
}
