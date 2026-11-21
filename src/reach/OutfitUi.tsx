// 차림의 화면: 장면 패널의 한 칸(지금 입은 차림 · 입히기 · 저장)과 옷장 창(차림 목록 · 다시 뜨기 · 다른 대화에 반영 · 모드별 기본)
import { useMemo, useState } from 'react';
import { S } from '../lib/core';
import { Icon } from '../kit';
import { confirmBox, menu, openModal, promptBox, toast } from '../ui';
import { go, route } from '../lib/router';
import { describe } from '../flow/logic';
import { t } from '../i18n';
import type { RChat } from './route';
import { MODES, PARTS, addOutfit, capture, dupOutfit, modeFit, outfits, partsOf, removeOutfit, retake, setModeFit, syncWearers, undress, wear, wearers, wornBy, type Outfit, type Part } from './outfit';

const seedOf = (s: string) => { let h = 2166136261; for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619); return h >>> 0; };
const rng = (seed: number) => () => { seed = (seed + 0x6D2B79F5) | 0; let x = Math.imul(seed ^ (seed >>> 15), 1 | seed); x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x; return ((x ^ (x >>> 14)) >>> 0) / 4294967296; };
/** 옷걸이에 걸린 옷 한 벌. 이름에서 씨앗을 얻어 품 · 길이 · 깃 · 단의 무늬가 달라진다 */
export function Hanger({ seed, size = 56, worn = false }: { seed: string; size?: number; worn?: boolean }) {
  const a = useMemo(() => {
    const r = rng(seedOf(seed || 'fit')), w = 15 + r() * 6, len = 34 + r() * 12, flare = 2 + r() * 7, collar = 4 + r() * 5, kind = Math.floor(r() * 3), bands = 1 + Math.floor(r() * 3);
    return { w, len, flare, collar, kind, bands };
  }, [seed]);
  const cx = 32, top = 17, { w, len, flare, collar, kind, bands } = a, bot = top + len;
  const body = `M${cx - w} ${top + 4}L${cx - w - flare} ${bot}H${cx + w + flare}L${cx + w} ${top + 4}`;
  return <svg className="fx-art rc-hanger" viewBox="0 0 64 72" width={size} height={size * 72 / 64} aria-hidden="true">
    <path className={worn ? 'a' : undefined} d={`M32 9a3 3 0 1 1 2.6 3c-1.6.2-2.6 1-2.6 2.6v1.4`} />
    <path d={`M${cx - w - 2} ${top + 5}L32 ${top}L${cx + w + 2} ${top + 5}`} />
    <path className="t" d={body} />
    {kind === 0 ? <path className="t" d={`M${cx - collar} ${top + 1.4}L32 ${top + collar + 6}L${cx + collar} ${top + 1.4}`} /> : kind === 1 ? <path className="t" d={`M${cx - collar} ${top + 1.4}Q32 ${top + collar + 4} ${cx + collar} ${top + 1.4}`} /> : <path className="t" d={`M${cx - collar} ${top + 1.4}L${cx + 2} ${bot}M${cx + collar} ${top + 1.4}L32 ${top + collar + 5}`} />}
    {Array.from({ length: bands }, (_, i) => { const y = bot - 3 - i * 3.2, k = (y - top - 4) / (len - 4); return <path key={i} className={i ? 'h' : 'd'} d={`M${(cx - w - flare * k).toFixed(1)} ${y.toFixed(1)}H${(cx + w + flare * k).toFixed(1)}`} />; })}
    <path className="h" d={`M${cx - w - flare - 5} ${bot + 4}H${cx + w + flare + 5}`} />
  </svg>;
}

const partLabel = (k: Part) => t('reach.fit.part.' + k);
function Parts({ o }: { o: Outfit }) {
  const has = new Set(partsOf(o));
  return <div className="rc-parts" aria-label={t('reach.fit.partsOf')}>{PARTS.map(k => <span key={k} className={'rc-part' + (has.has(k) ? ' on' : '')} title={has.has(k) ? t('reach.fit.partIn') : t('reach.fit.partOut')}><i className="fx-dot" />{partLabel(k)}</span>)}</div>;
}
/** 열려 있는 대화를 새로 그린다 (연결 · 페르소나 · 배경이 바뀌었으니 통째로) */
const reopen = (chat: RChat) => { if (route.page === 'chat') go('chat', chat.id); };
const said = (name: string, miss: string[]) => toast(miss.length ? t('reach.fit.wornMiss', { name, miss: [...new Set(miss)].join(', ') }) : t('reach.fit.worn', { name }), miss.length ? 'err' : 'ok');

/** 이름과 담을 칸을 묻고, 지금 대화의 차림을 저장한다 */
export function askCapture(chat: RChat, after?: (o: Outfit) => void) {
  const pick = new Set<Part>(PARTS); let name = '';
  const Body = () => {
    const [, tick] = useState(0);
    return <div className="rc-cap">
      <label className="field"><span className="field-label">{t('reach.fit.name')}</span><input className="inp" autoFocus defaultValue="" placeholder={t('reach.fit.namePh')} onChange={e => { name = e.target.value; }} /></label>
      <span className="field-label">{t('reach.fit.include')}</span>
      <div className="rc-cap-parts fx-rows">{PARTS.map(k => <label key={k} className="rc-cap-part"><input type="checkbox" checked={pick.has(k)} onChange={e => { if (e.target.checked) pick.add(k); else pick.delete(k); tick(n => n + 1); }} /><b>{partLabel(k)}</b><small>{t('reach.fit.partHint.' + k)}</small></label>)}</div>
    </div>;
  };
  openModal({ title: t('reach.fit.saveTitle'), body: <Body />, actions: [{ label: t('common.cancel') }, { label: t('reach.fit.saveOk'), cls: 'primary', onclick: async () => {
    if (!pick.size) { toast(t('reach.fit.needPart'), 'err'); return false; }
    const o = addOutfit(capture(chat, name.trim() || t('reach.fit.defaultName', { n: outfits().length + 1 }), [...pick]));
    chat.profileId = o.id; await S.save('chats', chat, true); toast(t('reach.fit.saved', { name: o.name }), 'ok'); after?.(o); return true;
  } }] });
}

/** 장면 패널의 "차림" 칸 */
export function FitPanel({ chat }: { chat: RChat }) {
  const [, tick] = useState(0), draw = () => tick(n => n + 1), worn = wornBy(chat) as Outfit | null, list = outfits();
  const put = async (o: Outfit) => { said(o.name, await wear(chat, o)); reopen(chat); draw(); };
  return <div className="rc-fit">
    {worn ? <div className="rc-fit-now fx-ticket"><Hanger seed={worn.name} size={40} worn /><div><span className="fx-lbl">wearing</span><b className="fx-serif">{worn.name}</b><Parts o={worn} /></div></div>
      : <div className="rc-fit-none"><Hanger seed="none" size={34} /><p>{list.length ? t('reach.fit.noneWorn') : t('reach.fit.noneYet')}</p></div>}
    <div className="row wrap">
      {list.length ? <button type="button" className="btn ghost" onClick={e => menu(e.currentTarget, list.map(o => ({ label: o.name, ic: o.id === worn?.id ? 'check' : undefined, hint: partsOf(o).map(partLabel).slice(0, 3).join(' · '), onclick: () => void put(o) })))}><Icon name="check" size={14} />{t('reach.fit.putOn')}</button> : null}
      <button type="button" className="btn ghost" onClick={() => askCapture(chat, draw)}><Icon name="plus" size={14} />{t('reach.fit.saveNow')}</button>
      {worn ? <button type="button" className="btn ghost" onClick={async () => { await undress(chat); draw(); }}>{t('reach.fit.takeOff')}</button> : null}
      <button type="button" className="btn ghost" onClick={() => openWardrobe(chat)}><Icon name="sliders" size={14} />{t('reach.fit.wardrobe')}</button>
    </div>
  </div>;
}

/** 옷장: 차림 전부와 모드별 기본 */
export function openWardrobe(chat?: RChat | null) {
  const m = openModal({ title: t('reach.fit.wardrobe'), wide: true, body: <Wardrobe chat={chat || null} close={() => m.close()} /> });
  m.el?.classList.add('rc-modal');
}
function Wardrobe({ chat, close }: { chat: RChat | null; close: () => void }) {
  const [, tick] = useState(0), draw = () => tick(n => n + 1), list = outfits(), worn = chat ? wornBy(chat) : null;
  const sync = async (o: Outfit, ask: boolean) => {
    const n = wearers(o, chat?.id).length; if (!n) return;
    if (ask && !(await confirmBox(t('reach.fit.syncAsk', { name: o.name, n }), t('reach.fit.syncOk')))) return;
    toast(t('reach.fit.synced', { n: await syncWearers(o, chat?.id) }), 'ok');
  };
  return <div className="rc-ward">
    <p className="rc-ward-lead">{t('reach.fit.lead')}</p>
    {chat ? <div className="row"><button type="button" className="btn primary" onClick={() => askCapture(chat, draw)}><Icon name="plus" size={14} />{t('reach.fit.saveNow')}</button></div> : null}
    {list.length ? <div className="rc-ward-grid">{list.map((o, i) => {
      const n = wearers(o).length, on = worn?.id === o.id;
      return <article key={o.id} className={'rc-out fx-frame fx-in' + (on ? ' strong' : '')} style={{ ['--d' as string]: i * 40 + 'ms' }}>
        <header><Hanger seed={o.name} worn={on} /><div className="rc-out-t"><span className="fx-lbl">{`No. ${String(i + 1).padStart(2, '0')}`}{on ? ' · wearing' : ''}</span><b className="fx-serif">{o.name}</b><small>{describe(o)}</small></div>
          <button type="button" className="ibtn tiny" title={t('reach.fit.more')} aria-label={t('reach.fit.more')} onClick={e => menu(e.currentTarget, [
            { label: t('reach.fit.rename'), ic: 'edit', onclick: async () => { const v = await promptBox(t('reach.fit.name'), o.name); if (v?.trim()) { o.name = v.trim(); S.set({ profiles: outfits() }); draw(); } } },
            { label: t('reach.fit.dup'), ic: 'copy', onclick: () => { dupOutfit(o); draw(); } },
            { label: t('reach.fit.editConn'), ic: 'plug', onclick: () => { close(); go('flow', 'profiles'); } },
            '-', { label: t('common.delete'), ic: 'trash', danger: true, onclick: async () => { if (await confirmBox(t('reach.fit.delAsk', { name: o.name, n }), t('common.delete'), true)) { removeOutfit(o); draw(); } } }])}><Icon name="more" size={15} /></button></header>
        <Parts o={o} />
        <div className="fx-kv rc-out-n"><span>{t('reach.fit.wearers')}</span><i /><b>{String(n).padStart(2, '0')}</b></div>
        <footer>
          {chat ? <button type="button" className="btn ghost" disabled={on} onClick={async () => { said(o.name, await wear(chat, o)); close(); reopen(chat); }}>{on ? t('reach.fit.wearing') : t('reach.fit.putOnThis')}</button> : null}
          {chat ? <button type="button" className="btn ghost" title={t('reach.fit.retakeHint')} onClick={async () => { if (!(await confirmBox(t('reach.fit.retakeAsk', { name: o.name }), t('reach.fit.retake')))) return; retake(o, chat); toast(t('reach.fit.retaken', { name: o.name }), 'ok'); draw(); await sync(o, true); }}>{t('reach.fit.retake')}</button> : null}
          {wearers(o, chat?.id).length ? <button type="button" className="btn ghost" onClick={() => void sync(o, true)}>{t('reach.fit.syncN', { n: wearers(o, chat?.id).length })}</button> : null}
        </footer>
      </article>;
    })}</div> : <div className="fx-empty"><Hanger seed="empty" /><p>{t('reach.fit.empty')}</p></div>}
    <section className="rc-ward-modes"><h4 className="fx-head"><span className="fx-lbl kr ink">{t('reach.fit.modeTitle')}</span><span className="fx-lbl">by mode</span></h4>
      <p className="hint">{t('reach.fit.modeHint')}</p>
      <div className="rc-modes">{MODES.map(k => <label key={k} className="fx-kv"><span>{t('reach.fit.mode.' + k)}</span><i />
        <select className="inp" value={modeFit(k)?.id || ''} onChange={e => { setModeFit(k, e.target.value); draw(); }}><option value="">{t('reach.fit.modeNone')}</option>{list.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}</select></label>)}</div>
    </section>
  </div>;
}
