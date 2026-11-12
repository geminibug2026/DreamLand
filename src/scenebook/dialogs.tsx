// 삽화의 창들: 프롬프트 편집 · 공유, 사용법, 이미지 읽기, 지시 기록 + 대화 내보내기
import { useEffect, useRef, useState, type DragEvent, type ReactNode } from 'react';
import { Icon } from '../kit';
import { Area, Btn, Chk, Empty, Fld, Sel, openModal, type Box } from './parts';
import { guideSteps, guideTopics } from './guide';
import { importedConfig, readNaiImage, type NaiMeta } from './png';
import { compose } from './work';
import type { Msg, PlanRecord, Slot, Swipe } from './types';

import { toast } from '../ui';
import { chatApi } from '../chat/actions';
import * as IL from '../lib/illust';
import * as C from '../lib/core';
import { cur, errText, flat, guard, lastReply, shownTitle } from './util';
import { Illust } from './illust';
import { t } from '../i18n';

// ════════ 프롬프트 편집 · 공유 ════════
interface PromptDraft { style: string; negative: string; quality: boolean; analysisPrompt: string; planPrompt: string }
const Rules = ({ note, txt }: { note: string; txt: string }) => <details className="sb-fold"><summary>{t('scenebook.pr.rules')}</summary><p className="hint">{note}</p><pre className="regex-out sb-code">{txt}</pre></details>;
function PromptPane({ d, hold, lean }: { d: PromptDraft; hold: { at: number; redo: () => void }; lean: boolean }) {
  const [at, setAt] = useState(hold.at), [ver, setVer] = useState(0);
  hold.at = at; hold.redo = () => setVer(v => v + 1);
  const views: [string, () => ReactNode][] = [
    [t('scenebook.style'), () => <><Area obj={d} k="style" label={t('scenebook.pr.mainPrompt')} rows={5} ph="watercolor, soft lighting …" /><Area obj={d} k="negative" label={t('scenebook.uc')} rows={3} /><Chk label={t('scenebook.qualityAuto')} checked={d.quality} onChange={v => { d.quality = v; }} /><p className="hint">{t('scenebook.pr.styleHint')}</p></>],
    [t('scenebook.manual'), () => <><Area obj={d} k="analysisPrompt" label={t('scenebook.pr.analysisLabel')} rows={16} /><p className="hint">{t('scenebook.pr.analysisVars')}</p><Rules note={t('scenebook.pr.analysisRulesNote')} txt={Illust.analysisRules()} /></>],
    [t('scenebook.pr.injection'), () => <><p className="hint">{t('scenebook.pr.injectionHint')}</p><Area obj={d} k="planPrompt" label={t('scenebook.pr.planLabel')} rows={16} /><p className="hint">{t('scenebook.pr.planHint')}</p><Rules note={t('scenebook.pr.planRulesNote')} txt={lean ? t('scenebook.pr.leanNoRules') : Illust.outputRules()} /></>],
  ];
  return <>
    <div className="tabs sb-tabs">{views.map(([l], i) => <button key={i} type="button" className={'tab' + (i === at ? ' on' : '')} onClick={() => setAt(i)}>{l}</button>)}</div>
    <div className="col" key={`${at}-${ver}`}>{views[at][1]()}</div>
  </>;
}
export function promptEditor(startAt = 0, onApplied: () => void = () => { }) {
  const c = Illust.cfg(), { PLAN_PROMPT, LEAN_PROMPT, ANALYSIS_PROMPT } = IL, DEF_PLAN = c.leanPrompt ? LEAN_PROMPT : PLAN_PROMPT;
  const d: PromptDraft = { style: c.style || '', negative: c.negative || '', quality: !!c.quality, analysisPrompt: c.analysisPrompt || ANALYSIS_PROMPT, planPrompt: c.planPrompt || DEF_PLAN };
  const hold = { at: startAt, redo: () => { } };
  const read = () => {
    for (const [k, name] of [['analysisPrompt', t('scenebook.pr.analysisName')], ['planPrompt', t('scenebook.pr.planName')]] as ['analysisPrompt' | 'planPrompt', string][]) {
      if (d[k].length > 30000) throw new Error(t('scenebook.pr.tooLong', { name }));
      if (d[k] && !d[k].includes('{{data}}')) throw new Error(t('scenebook.pr.needData', { name }));
      const unknown = [...d[k].matchAll(/\{\{(\w+)\}\}/g)].map(x => x[1]).filter(x => !['maxScenes', 'playerRule', 'modelRule', 'direction', 'data'].includes(x)); if (unknown.length) throw new Error(t('scenebook.pr.unknownVar', { name, list: unknown.join(', ') }));
    }
    if (d.planPrompt && !d.planPrompt.includes('<!--scenebook')) throw new Error(t('scenebook.pr.needComment'));
    return { style: d.style.trim(), negative: d.negative.trim(), quality: !!d.quality, analysisPrompt: d.analysisPrompt === ANALYSIS_PROMPT ? '' : d.analysisPrompt, planPrompt: d.planPrompt === DEF_PLAN ? '' : d.planPrompt };
  };
  openModal({ title: t('scenebook.prompt'), wide: true, cls: 'col', actions: [
    { label: t('common.export'), ic: 'import', cls: 'ghost', onclick: () => { try { const v = read(); C.download('scenebook-prompts.json', JSON.stringify({ kind: 'scenebook-prompts', schema: 1, style: v.style, negative: v.negative, quality: v.quality, analysisPrompt: v.analysisPrompt, injectionPrompt: v.planPrompt }, null, 2)); } catch (e) { toast(errText(e), 'err'); } return false; } },
    { label: t('common.import'), ic: 'upload', cls: 'ghost', onclick: async () => { try { const [f] = await C.pickFiles({ accept: '.json,application/json' }); if (!f) return false; if (f.size > 100000) throw new Error(t('scenebook.pr.pickFile')); const v = JSON.parse(await f.text()) as Record<string, unknown> | null; if (v?.kind !== 'scenebook-prompts') throw new Error(t('scenebook.pr.notFile')); Object.assign(d, { style: String(v.style || ''), negative: String(v.negative || ''), quality: !!v.quality, analysisPrompt: String(v.analysisPrompt || '') || ANALYSIS_PROMPT, planPrompt: String(v.injectionPrompt || v.planPrompt || '') || DEF_PLAN }); hold.redo(); toast(t('scenebook.pr.loaded')); } catch (e) { toast(errText(e), 'err'); } return false; } },
    { label: t('scenebook.pr.default'), cls: 'ghost', onclick: () => { if (hold.at === 2) d.planPrompt = DEF_PLAN; else d.analysisPrompt = ANALYSIS_PROMPT; hold.redo(); toast(t('scenebook.pr.defaultLoaded')); return false; } },
    { label: t('common.apply'), cls: 'primary', onclick: () => { try { Illust.saveCfg(read()); onApplied(); toast(t('scenebook.pr.saved'), 'ok'); } catch (e) { toast(errText(e), 'err'); return false; } } }] },
    () => <PromptPane d={d} hold={hold} lean={!!c.leanPrompt} />);
}

// ════════ 사용법 ════════
function Guide() {
  const [i, setI] = useState(0), [q, setQ] = useState('');
  const GUIDE_STEPS = guideSteps(), k = q.trim().toLowerCase(), hits = guideTopics().filter(([t, d]) => !k || `${t} ${d}`.toLowerCase().includes(k));
  return <>
    <section className="sb-guide-step"><b>{`${i + 1}. ${GUIDE_STEPS[i][0]}`}</b><p>{GUIDE_STEPS[i][1]}</p></section>
    <div className="row"><Btn label={t('scenebook.prev')} cls="ghost" disabled={i === 0} onClick={() => setI(i - 1)} /><span className="hint">{`${i + 1} / ${GUIDE_STEPS.length}`}</span><Btn label={t('scenebook.next')} cls="ghost" disabled={i === GUIDE_STEPS.length - 1} onClick={() => setI(i + 1)} /></div>
    <input className="inp" type="search" placeholder={t('scenebook.guideSearch')} value={q} onChange={e => setQ(e.target.value)} />
    <div className="sb-guide-topics">{hits.map(([t, d]) => <details className="sb-fold" key={`${q}|${t}`} open={!!k}><summary>{t}</summary><p>{d}</p></details>)}{!hits.length ? <Empty>{t('scenebook.guideNone')}</Empty> : null}</div>
  </>;
}
export function guide() { openModal({ title: t('scenebook.guideTitle'), wide: true, cls: 'col' }, () => <Guide />); }

// ════════ 이미지 읽기 ════════
const IMPORT_LABELS = (): Record<string, string> => ({ width: t('scenebook.gen.width'), height: t('scenebook.gen.height'), steps: 'Steps', scale: 'Guidance (CFG)', sampler: t('scenebook.gen.sampler'), scheduler: t('scenebook.gen.scheduler'), cfgRescale: 'CFG rescale', transparent: t('scenebook.transparent') });
function ImageImport({ box, onApplied, hold }: { box: Box; onApplied: () => void; hold: { stop: () => void } }) {
  const [status, setStatus] = useState(''), [got, setGot] = useState<{ r: NaiMeta; url: string } | null>(null), [over, setOver] = useState(false);
  const serial = useRef(0), url = useRef(''), pick = useRef({ model: '', relax: false }), root = useRef<HTMLDivElement>(null);
  hold.stop = () => { serial.current++; if (url.current) URL.revokeObjectURL(url.current); };
  const read = async (file: File) => {
    const ticket = ++serial.current; setGot(null); setStatus(t('scenebook.img.reading')); if (url.current) URL.revokeObjectURL(url.current);
    try {
      const r = await readNaiImage(file); if (ticket !== serial.current) return;
      url.current = URL.createObjectURL(file); pick.current = { model: String(r.patch.model || ''), relax: false };
      setStatus(`${file.name || t('scenebook.img.pasted')} · ${r.storage}`); setGot({ r, url: url.current });
    } catch (e) { if (ticket === serial.current) setStatus(errText(e)); }
  };
  useEffect(() => {   // 창 안 어디에 붙여 넣어도 읽는다
    const el = root.current?.parentElement; if (!el) return;
    const paste = (e: ClipboardEvent) => { const f = [...(e.clipboardData?.files || [])][0]; if (f) { e.preventDefault(); void read(f); } };
    el.addEventListener('paste', paste); return () => el.removeEventListener('paste', paste);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const c = Illust.cfg(), r = got?.r, num = (v: unknown, d: number) => typeof v === 'number' ? v : d;
  const large = !!r && (num(r.patch.width, c.width) * num(r.patch.height, c.height) > 1048576 || num(r.patch.steps, c.steps) > 28);
  const drop = (e: DragEvent) => { e.preventDefault(); setOver(false); const f = e.dataTransfer?.files?.[0]; if (f) void read(f); };
  return <>
    <div ref={root} className={'dropzone small' + (over ? ' over' : '')} tabIndex={0} onClick={async () => { const [f] = await C.pickFiles({ accept: '.png,image/png' }); if (f) void read(f); }} onDragOver={e => { e.preventDefault(); setOver(true); }} onDragLeave={() => setOver(false)} onDrop={drop}><Icon name="image" size={24} /><b>{t('scenebook.img.pick')}</b><span>{t('scenebook.img.drop')}</span></div>
    <p className="hint" role="status">{status}</p>
    <div className="col" key={got?.url}>{r && got ? <>
      <div className="sb-import-head"><img src={got.url} alt={t('scenebook.img.alt')} /><div className="col"><Fld label={t('scenebook.img.model')}><Sel opts={[['', t('scenebook.img.pickModel')], ...Object.entries(IL.MODELS).map(([id, m]): [string, string] => [id, m.label])]} value={pick.current.model} onChange={v => { pick.current.model = v; }} /></Fld><small className="hint">{r.source}</small></div></div>
      <table className="sb-table"><caption>{t('scenebook.img.settings')}</caption>{Object.entries(IMPORT_LABELS()).filter(([k]) => k in r.patch).map(([k, l]) => <tr key={k}><th>{l}</th><td>{typeof r.patch[k] === 'boolean' ? (r.patch[k] ? t('common.on') : t('common.off')) : String(r.patch[k])}</td></tr>)}</table>
      <details className="sb-fold" open><summary>{t('scenebook.mainPrompt')}</summary><pre className="regex-out sb-code">{r.scene.prompt}</pre></details><details className="sb-fold"><summary>{t('scenebook.img.uc')}</summary><pre className="regex-out sb-code">{r.scene.negative || t('scenebook.img.empty')}</pre></details>
      {large && c.budgetGuard ? <Chk label={t('scenebook.img.relax')} checked={false} onChange={v => { pick.current.relax = v; }} hint={t('scenebook.img.relaxHint')} /> : null}
      {r.warnings.length ? <ul className="sb-warn">{r.warnings.map((w, i) => <li key={i}>{w}</li>)}</ul> : null}
      <p className="hint">{t('scenebook.img.hint')}</p></> : null}</div>
    <div className="row end wrap">{r ? <>
      <Btn label={t('scenebook.openAsScene')} ic="edit" onClick={guard(async () => { const cfg = importedConfig(Illust.genConfig(), r, { model: pick.current.model, relax: large && pick.current.relax, forScene: true }); await compose(lastReply(), { initial: [r.scene], config: cfg }); box.close(); })} />
      <Btn label={t('scenebook.img.apply')} ic="check" cls="primary" onClick={guard(() => { Illust.saveCfg(importedConfig(Illust.genConfig(), r, { model: pick.current.model, relax: large && pick.current.relax, forScene: false }), { reason: '이미지 읽기 전', force: true }); box.close(); onApplied(); toast(t('scenebook.img.applied'), 'ok'); })} /></> : null}</div>
  </>;
}
export function imageImport(onApplied: () => void = () => { }) {
  const hold = { stop: () => { } };
  openModal({ title: t('scenebook.readImage'), wide: true, cls: 'col', onClose: () => hold.stop() }, box => <ImageImport box={box} onApplied={onApplied} hold={hold} />);
}

// ════════ 지시 기록 · 대화 내보내기 ════════
const PLAN_LABELS: Record<string, string> = { queued: 'scenebook.planLog.queued', done: 'scenebook.planLog.done', ready: 'scenebook.planLog.ready', missing: 'scenebook.planLog.missing', failed: 'scenebook.planLog.failed' };   // 값은 번역 키
export function showPlans() {
  const { chat, msgs } = cur(); if (!chat || !msgs) return toast(t('scenebook.openChat'));
  const rows = msgs.map((m, i) => ({ m, i, sw: m.swipes?.[m.sw] as Swipe | undefined })).filter(r => r.sw?.illustPlan || r.sw?.illustDraft?.length).slice(-20).reverse();
  openModal({ title: t('scenebook.plans'), wide: true, cls: 'col' }, box => <>
    <p className="hint">{t('scenebook.planLog.hint')}</p>
    {!rows.length ? <Empty>{t('scenebook.planLog.empty')}</Empty> : rows.map(({ m, i, sw }) => { const p: PlanRecord = sw?.illustPlan || {};
      return <details className="sb-fold" key={m.id}><summary>{t('scenebook.planLog.row', { n: i + 1, status: t(PLAN_LABELS[p.status || ''] || 'scenebook.planLog.ready') })}</summary>{p.error ? <p className="err">{p.error}</p> : null}{p.warnings?.length ? <ul className="sb-warn">{p.warnings.map((w, n) => <li key={n}>{w}</li>)}</ul> : null}{p.repairs?.length ? <small className="hint">{t('scenebook.planLog.repairs', { list: p.repairs.join(' · ') })}</small> : null}
        {p.raw ? <pre className="regex-out sb-code">{p.raw}</pre> : null}<div className="row"><Btn label={t('scenebook.compose')} ic="edit" cls="ghost" onClick={guard(async () => { box.close(); await compose(m); })} /><Btn label={t('scenebook.planLog.goto')} cls="ghost" onClick={() => { box.close(); chatApi.scrollTo(m.id); }} /></div></details>; })}
  </>);
}
export function exportChat() {
  const { chat, msgs } = cur(); if (!chat || !msgs) return toast(t('scenebook.openChat'));
  const S = C.S, esc = C.esc, user = S.persona(chat)?.name || t('scenebook.exp.me'), name = chat.name || chat.charIds.map(id => S.get('chars', id)?.name).filter(Boolean).join(', ') || t('scenebook.exp.chat');
  const body = msgs.filter((m: Msg) => m.role !== 'system' && !m.hidden).map(m => { const sw: Swipe = m.swipes[m.sw] || {};
    const inline = Illust.cfg().placement === 'inline', fig = (it: Slot) => `<figure><img src="${Illust.data(it.id)}" alt="${esc(it.title || t('scenebook.illust'))}">${shownTitle(it.title) ? `<figcaption>${esc(it.title)}</figcaption>` : ''}</figure>`;
    const items = (sw.illust || []).filter(it => !it.hidden && Illust.data(it.id)), body0 = Illust.strip(sw.text || '').trim(), paras = inline ? body0.split(/\n\s*\n/) : [body0], slots: Slot[][] = paras.map(() => []), tail: Slot[] = [];
    for (const it of items) { const key = inline && it.anchor ? flat(it.anchor).slice(0, 40) : '', i = key ? paras.findIndex(p => flat(p).includes(key)) : -1; (i >= 0 ? slots[i] : tail).push(it); }   // 문단 뒤 삽화는 그 문단 뒤에
    return `<article><h2>${esc(m.role === 'user' ? user : m.name || '')}</h2>${paras.map((p, i) => `<div class="text">${esc(p)}</div>${slots[i].map(fig).join('')}`).join('')}${tail.map(fig).join('')}</article>`; }).join('\n');
  C.download(`${name.replace(/[\\/:*?"<>|]/g, '_')}.html`, `<!doctype html><html lang="ko"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(name)}</title><style>body{background:#fafaf8;color:#161616;font:16px/1.85 system-ui,sans-serif;margin:0}main{max-width:820px;padding:28px 22px;margin:auto}article{padding:22px 0;border-bottom:1px solid #1616162e}h1{font-size:24px}h2{font-size:14px;letter-spacing:.04em}.text{white-space:pre-wrap;overflow-wrap:anywhere;margin:0 0 1.1em}figure{max-width:560px;margin:22px auto;border:1px solid #161616}img{display:block;width:100%;height:auto}figcaption{font-size:13px;padding:6px 10px;border-top:1px solid #1616162e}</style><main><h1>${esc(name)}</h1>${body}</main></html>`, 'text/html;charset=utf-8');
}
