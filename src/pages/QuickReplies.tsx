// 퀵 리플라이: 세트 · 단추 · 자동 실행 · 실리태번 세트 가져오기 · 내보내기 · STscript 시험 창
import { useRef, useState } from 'react';
import { Btn, IconBtn, useEvents } from '../kit';
import { PageHead, charPicker, confirmBox, promptBox, toast } from '../ui';
import * as core from '../lib/core';
import { S } from '../lib/core';
import { QR_AUTO, QR_KINDS, QR_SCOPES, newQrItem, newQrSet, qrAddSet, qrSave, qrStore, setToStQr, stQrToSet, type QrAuto, type QrItem, type QrSet } from '../lib/qr-data';
import { runItem, runQrScript } from '../stscript/host';
import { t, tn } from '../i18n';

export const page = { name: 'qr', Component: QuickReplies };

let saveTimer = 0;
/** 글을 칠 때마다 저장하지 않고 잠깐 모았다가 */
const saveSoon = () => { clearTimeout(saveTimer); saveTimer = window.setTimeout(qrSave, 400); };
const AUTO_KEYS: (keyof QrAuto)[] = ['open', 'newChat', 'user', 'ai', 'gen', 'start'];

function QuickReplies() {
  const redraw = useEvents('qr:changed');
  const q = qrStore();
  const bring = async () => {
    const files = await core.pickFiles({ accept: '.json', multiple: true }); let n = 0;
    for (const f of files) { try { n += qrAddSet(stQrToSet(JSON.parse(await f.text()), f.name.replace(/\.json$/i, ''))); } catch (e) { toast(`${f.name}: ${e instanceof Error ? e.message : String(e)}`, 'err'); } }
    if (files.length) toast(tn('qr.page.imported', n), n ? 'ok' : '');
  };
  return <section className="pagebox qr-page">
    <PageHead eyebrow="quick reply" title={t('qr.page.title')} />
    <p className="hint">{t('qr.page.intro')}</p>
    <div className="row wrap">
      <Btn label={t('qr.page.newSet')} ic="plus" cls="primary" onClick={() => { q.sets.push(newQrSet()); qrSave(); }} />
      <Btn label={t('qr.page.import')} ic="upload" cls="ghost" onClick={() => void bring()} />
      <label className="check"><input type="checkbox" checked={q.bar !== false} onChange={e => { q.bar = e.target.checked; qrSave(); }} /><i /><span>{t('qr.page.showBar')}</span></label>
    </div>
    {q.sets.length ? q.sets.map((s, i) => <SetCard key={s.id} set={s} index={i} redraw={redraw} />) : <p className="dim">{t('qr.page.empty')}</p>}
    <Console />
  </section>;
}

function SetCard({ set, index, redraw }: { set: QrSet; index: number; redraw: () => void }) {
  const q = qrStore(), [open, setOpen] = useState(set.items.length <= 6);
  const move = (to: number) => { if (to < 0 || to >= q.sets.length) return; q.sets.splice(index, 1); q.sets.splice(to, 0, set); qrSave(); };
  const scopeNote = set.scope === 'char' ? (set.charIds || []).map(id => S.get('chars', id)?.name).filter(Boolean).join(', ') || t('qr.page.noChar') : set.scope === 'chat' ? tn('qr.page.chatCount', (set.chatIds || []).length) : '';
  return <div className={'card qr-card' + (set.on === false ? ' off' : '')}>
    <div className="row wrap qr-head">
      <label className="check" title={t('qr.page.setOn')}><input type="checkbox" checked={set.on !== false} onChange={e => { set.on = e.target.checked; qrSave(); }} /><i /></label>
      <input className="inp qr-name" value={set.name} aria-label={t('common.name')} onChange={e => { set.name = e.target.value; redraw(); saveSoon(); }} />
      <select className="inp qr-scope" value={set.scope} aria-label={t('qr.page.scope')} onChange={e => {
        set.scope = e.target.value as QrSet['scope'];
        if (set.scope === 'char') charPicker({ title: t('qr.page.pickChars'), selected: set.charIds || [], onDone: ids => { set.charIds = ids; qrSave(); } });
        qrSave();
      }}>{Object.entries(QR_SCOPES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
      {scopeNote ? <small className="hint">{scopeNote}</small> : null}
      <span className="grow" />
      <IconBtn ic="up" title={t('qr.page.moveUp')} onClick={() => move(index - 1)} />
      <IconBtn ic="down" title={t('qr.page.moveDown')} onClick={() => move(index + 1)} />
      <IconBtn ic="import" title={t('qr.page.export')} onClick={() => core.download(`${set.name}.json`, JSON.stringify(setToStQr(set), null, 4))} />
      <IconBtn ic="trash" title={t('common.delete')} onClick={async () => { if (await confirmBox(t('qr.page.deleteSet', { name: set.name }), t('common.delete'), true)) { q.sets = q.sets.filter(x => x !== set); qrSave(); } }} />
    </div>
    {set.scope === 'chat' ? <p className="hint">{t('qr.page.chatScopeHint')}</p> : null}
    <div className="row wrap qr-opts">
      <label className="check" title={t('qr.page.nosendHint')}><input type="checkbox" checked={!!set.nosend} onChange={e => { set.nosend = e.target.checked; for (const it of set.items) if (it.kind !== 'script') it.kind = set.nosend ? 'insert' : 'send'; qrSave(); }} /><i /><span>{t('qr.page.nosend')}</span></label>
      <label className="check" title={t('qr.page.injectHint')}><input type="checkbox" checked={!!set.inject} onChange={e => { set.inject = e.target.checked; qrSave(); }} /><i /><span>{t('qr.page.inject')}</span></label>
      <label className="check" title={t('qr.page.beforeHint')}><input type="checkbox" checked={!!set.before} disabled={!set.inject} onChange={e => { set.before = e.target.checked; qrSave(); }} /><i /><span>{t('qr.page.before')}</span></label>
    </div>
    <button type="button" className="linkish qr-fold" onClick={() => setOpen(!open)}>{open ? t('qr.page.fold') : tn('qr.page.unfold', set.items.length)}</button>
    {open ? <>
      {set.items.map((it, i) => <ItemRow key={it.id} set={set} it={it} index={i} redraw={redraw} />)}
      <Btn label={t('qr.page.newItem')} ic="plus" cls="ghost" onClick={() => { set.items.push(newQrItem()); qrSave(); }} />
    </> : null}
  </div>;
}

function ItemRow({ set, it, index, redraw }: { set: QrSet; it: QrItem; index: number; redraw: () => void }) {
  const [more, setMore] = useState(false);
  const autos = AUTO_KEYS.filter(k => it.auto?.[k]);
  const move = (to: number) => { if (to < 0 || to >= set.items.length) return; set.items.splice(index, 1); set.items.splice(to, 0, it); qrSave(); };
  const edit = (patch: Partial<QrItem>) => { Object.assign(it, patch); redraw(); saveSoon(); };
  return <div className={'qr-item' + (it.hidden ? ' hidden-item' : '')}>
    <div className="row wrap">
      <input className="inp qr-label" value={it.label} aria-label={t('qr.page.label')} placeholder={t('qr.page.label')} onChange={e => edit({ label: e.target.value })} />
      <select className="inp qr-kind" value={it.kind} aria-label={t('qr.page.kind')} onChange={e => edit({ kind: e.target.value as QrItem['kind'] })}>{Object.entries(QR_KINDS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
      {autos.length ? <small className="badge">{t('qr.page.autoBadge', { n: autos.length })}</small> : null}
      <span className="grow" />
      <IconBtn ic="play" title={t('qr.page.try')} onClick={() => void runItem(it)} />
      <IconBtn ic="sliders" title={t('qr.page.more')} onClick={() => setMore(!more)} />
      <IconBtn ic="up" title={t('qr.page.moveUp')} onClick={() => move(index - 1)} />
      <IconBtn ic="down" title={t('qr.page.moveDown')} onClick={() => move(index + 1)} />
      <IconBtn ic="trash" title={t('common.delete')} onClick={() => { set.items = set.items.filter(x => x !== it); qrSave(); }} />
    </div>
    <textarea className="inp qr-text code" rows={Math.min(12, Math.max(2, it.text.split('\n').length))} spellCheck={false} value={it.text} aria-label={t('qr.page.text')}
      placeholder={t('qr.page.textPh')} onChange={e => edit({ text: e.target.value, ...(it.kind !== 'script' && /^\s*\//.test(e.target.value) ? { kind: 'script' as const } : {}) })} />
    {more ? <div className="qr-more-box">
      <input className="inp" value={it.title} placeholder={t('qr.page.titlePh')} aria-label={t('qr.page.titlePh')} onChange={e => edit({ title: e.target.value })} />
      <label className="check"><input type="checkbox" checked={!!it.hidden} onChange={e => edit({ hidden: e.target.checked })} /><i /><span>{t('qr.page.hidden')}</span></label>
      <p className="hint">{t('qr.page.autoHint')}</p>
      <div className="row wrap">{AUTO_KEYS.map(k => <label key={k} className="check"><input type="checkbox" checked={!!it.auto?.[k]} onChange={e => edit({ auto: { ...(it.auto || {}), [k]: e.target.checked } })} /><i /><span>{QR_AUTO[k]}</span></label>)}</div>
      <CtxEditor set={set} it={it} edit={edit} />
    </div> : null}
  </div>;
}

/** 오른쪽 클릭 메뉴: 이 버튼에 이어 둘 세트들 (이어 실행이면 이 버튼 글 | 고른 버튼 글 을 함께 돌린다) */
function CtxEditor({ set, it, edit }: { set: QrSet; it: QrItem; edit: (p: Partial<QrItem>) => void }) {
  const list = it.contextList || [], names = qrStore().sets.map(s => s.name);
  const put = (next: NonNullable<QrItem['contextList']>) => edit({ contextList: next });
  return <div className="qr-ctx">
    <p className="hint">{t('qr.page.ctxHint')}</p>
    {list.map((cl, i) => <div className="row" key={i}>
      <select className="inp" value={cl.set} aria-label={t('qr.page.ctxSet')} onChange={e => put(list.map((x, j) => j === i ? { ...x, set: e.target.value } : x))}>
        {!names.includes(cl.set) ? <option value={cl.set}>{t('qr.page.ctxMissing', { name: cl.set })}</option> : null}
        {names.map(n => <option key={n} value={n}>{n === set.name ? t('qr.page.ctxOwn', { name: n }) : n}</option>)}
      </select>
      <label className="check" title={t('qr.page.chainedHint')}><input type="checkbox" checked={!!cl.isChained} onChange={e => put(list.map((x, j) => j === i ? { ...x, isChained: e.target.checked } : x))} /><i /><span>{t('qr.page.chained')}</span></label>
      <IconBtn ic="trash" title={t('common.delete')} onClick={() => put(list.filter((_x, j) => j !== i))} />
    </div>)}
    <Btn label={t('qr.page.ctxAdd')} ic="plus" cls="ghost" onClick={() => put([...list, { set: names.find(n => n !== set.name) || set.name, isChained: false }])} />
  </div>;
}

/** 스크립트를 바로 돌려 보는 창 (결과 = 마지막 {{pipe}}) */
function Console() {
  const [src, setSrc] = useState('/pass hello | /upper'), [out, setOut] = useState(''), [busy, setBusy] = useState(false);
  const area = useRef<HTMLTextAreaElement>(null);
  const run = async (debug = false) => { setBusy(true); try { setOut(await runQrScript(src, { debug })); } finally { setBusy(false); } };
  return <div className="card qr-console">
    <h3 className="form-sec">{t('qr.page.console')}</h3>
    <p className="hint">{t('qr.page.consoleHint')}</p>
    <textarea ref={area} className="inp code" rows={4} spellCheck={false} value={src} onChange={e => setSrc(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); void run(); } }} aria-label={t('qr.page.console')} />
    <div className="row wrap"><Btn label={busy ? t('qr.page.running') : t('qr.page.run')} ic="play" cls="primary" onClick={() => void run()} /><Btn label={t('qr.page.debug')} ic="code" cls="ghost" onClick={() => void run(true)} /><Btn label={t('qr.page.saveAsItem')} ic="plus" cls="ghost" onClick={async () => {
      const q = qrStore(); let set = q.sets[0]; if (!set) { set = newQrSet(); q.sets.push(set); }
      const label = (await promptBox(t('qr.page.label'), ''))?.trim(); if (!label) return;
      set.items.push(newQrItem({ label, text: src, kind: /^\s*\//.test(src) ? 'script' : 'send' })); qrSave(); toast(t('qr.page.savedTo', { name: set.name }), 'ok');
    }} /></div>
    <pre className="qr-out">{out || ' '}</pre>
  </div>;
}
