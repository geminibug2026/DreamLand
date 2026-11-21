// 실리태번용으로 내보내기 창: 무엇을 함께 담을지 고르고, 실리태번에서 안 되는 것을 미리 보고, ZIP 하나로 받는다 (만드는 일은 src/lib/stx.ts)
import { useMemo, useState } from 'react';
import origin from 'virtual:st-origin';
import { Btn, Icon } from '../kit';
import { openModal, toast, type ModalHandle } from '../ui';
import { useCss } from '../addons/parts';
import { S, download } from '../lib/core';
import { zip } from '../lib/assets';
import { X } from '../lib/hooks';
import { qrStore, type QrSet } from '../lib/qr-data';
import * as cards from '../lib/cards';
import { load as loadScripts, scripts as libScripts, type ThScript } from '../lib/thscripts';
import { ST_EXT, buildPack, compatCheck, flatScripts, needsOf, safeName, stCard, type CompatEnv, type Note, type PackInput } from '../lib/stx';
import { allNames } from '../stscript/ref';
import type { Char, Regex } from '../lib/types';
import { t } from '../i18n';

/** 명령 · 매크로를 가르는 표: 실리태번 본체 · LALib 명령은 빌드 때 소스에서, 드림랜드가 아는 명령 · 매크로는 지금 등록된 것에서 */
const compatEnv = (): CompatEnv => ({ core: origin.core, lalib: origin.lalib, known: allNames(), macros: [...X.macros.keys()] });
const GROUPS: Note['group'][] = ['cmd', 'macro', 'feature', 'script', 'pack'];
const toggle = (set: Set<string>, id: string, on: boolean) => { const n = new Set(set); if (on) n.add(id); else n.delete(id); return n; };

function Dialog({ ch, lib, close }: { ch: Char; lib: ThScript[]; close: () => void }) {
  const c = ch as unknown as cards.DChar, env = useMemo(compatEnv, []);
  const books = (ch.loreIds || []).map(id => S.get('lore', id)).filter(Boolean) as unknown as cards.LoreBook[];
  const regex = cards.scopedRegex(ch.id), sets = qrStore().sets, globals = S.regex.filter((r: Regex) => r.scope === 'global');
  const mine = (s: QrSet) => s.scope === 'char' && (s.charIds || []).includes(ch.id);
  const [libPick, setLib] = useState<Set<string>>(new Set()), [qrPick, setQr] = useState<Set<string>>(() => new Set(sets.filter(mine).map(s => s.id)));
  const [withPreset, setWithPreset] = useState(false), [presetId, setPresetId] = useState(S.settings.activePreset || S.presets[0]?.id || '');
  const [rxPick, setRx] = useState<Set<string>>(new Set()), [mvuKit, setMvuKit] = useState(true);
  const on = (S.settings as unknown as { thScriptOn?: Record<string, boolean> }).thScriptOn || {};
  const input: PackInput = {
    char: c, books, regex: regex as cards.DRegex[], scripts: lib.filter(s => libPick.has(s.id)), scriptOn: id => on['char:' + ch.id + ':' + id],
    qrSets: sets.filter(s => qrPick.has(s.id)), charQr: sets.filter(mine).map(s => s.id),
    preset: withPreset ? (S.get('presets', presetId) as unknown as cards.DPreset) || null : null, globalRegex: globals.filter(r => rxPick.has(r.id)) as cards.DRegex[],
    mvuKit, game: S.chats.some(x => x.charIds.includes(ch.id) && !!(x as { game?: unknown }).game), chats: S.chats.filter(x => x.charIds.includes(ch.id)).length,
  };
  const notes = compatCheck(input, env), needs = needsOf(input, env), card = stCard(input);
  const cardScripts = flatScripts(card.scripts).length, entries = card.book?.entries.length || 0;
  const mvu = notes.some(n => /mvu/i.test(n.text) && n.group === 'script') || needs.includes('mvu');
  const pack = async (pngOnly = false) => {
    try {
      const P = buildPack(input, env, await cards.avatarPng(c)), name = safeName(ch.name, 'character');
      if (pngOnly) download(P.files[0].name, new Blob([P.files[0].data as BlobPart], { type: 'image/png' }), 'image/png');
      else download(`${name} - SillyTavern.zip`, zip(P.files), 'application/zip');
      toast(t('stx.done', { name: ch.name, n: pngOnly ? 1 : P.files.length }), 'ok'); close();
    } catch (e) { console.error(e); toast(e instanceof Error ? e.message : String(e), 'err'); }
  };
  const box = (checked: boolean, set: (v: boolean) => void, label: string, hint?: string, key?: string) => <label className="check" key={key}><input type="checkbox" checked={checked} onChange={e => set(e.target.checked)} /><i /><span>{label}{hint ? <small className="badge">{hint}</small> : null}</span></label>;
  return <div className="stx">
    <p className="hint">{t('stx.intro')}</p>
    <section className="stx-sec">
      <h4 className="form-sec">{t('stx.sec.card')}</h4>
      <ul className="stx-facts">
        <li>{books.length ? t('stx.cardBooks', { n: books.length, entries }) : t('stx.cardNoBook')}{books.length > 1 ? <small className="dim"> · {books.map(b => b.name).join(', ')}</small> : null}</li>
        <li>{t('stx.cardRegex', { n: card.regex.length })}</li>
        <li>{t('stx.cardScripts', { n: cardScripts })}</li>
      </ul>
    </section>
    <section className="stx-sec">
      <h4 className="form-sec">{t('stx.sec.scripts')}</h4>
      {lib.length ? <div className="stx-list">{lib.map(s => box(libPick.has(s.id), v => setLib(p => toggle(p, s.id, v)), s.name, undefined, s.id))}</div> : <p className="dim">{t('stx.scriptsNone')}</p>}
    </section>
    <section className="stx-sec">
      <h4 className="form-sec">{t('stx.sec.qr')}</h4>
      {sets.length ? <div className="stx-list">{sets.map(s => box(qrPick.has(s.id), v => setQr(p => toggle(p, s.id, v)), s.name, mine(s) ? t('stx.qrChar') : String(s.items.length), s.id))}</div> : <p className="dim">{t('stx.qrNone')}</p>}
    </section>
    <section className="stx-sec">
      <h4 className="form-sec">{t('stx.sec.more')}</h4>
      <div className="stx-list">
        {S.presets.length ? <div className="stx-row">{box(withPreset, setWithPreset, t('stx.preset'))}{withPreset ? <select className="inp" value={presetId} onChange={e => setPresetId(e.target.value)} aria-label={t('stx.preset')}>{S.presets.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select> : null}</div> : null}
        {globals.length ? <details className="stx-more"><summary>{t('stx.gregex')}{rxPick.size ? <small className="badge on">{rxPick.size}</small> : null}</summary>
          <div className="stx-list">{globals.map(r => box(rxPick.has(r.id), v => setRx(p => toggle(p, r.id, v)), r.name, undefined, r.id))}</div></details> : null}
        {mvu ? <>{box(mvuKit, setMvuKit, t('stx.mvuKit'))}<small className="hint">{t('stx.mvuKitHint')}</small></> : null}
      </div>
    </section>
    <section className="stx-sec stx-check" aria-live="polite">
      <h4 className="form-sec">{t('stx.sec.check')}</h4>
      <div className="stx-needs"><b>{t('stx.needs')}</b>{needs.length ? <ul>{needs.map(n => <li key={n}><span>{ST_EXT[n].name}</span><small>{t('stx.rd.why.' + n)}</small></li>)}</ul> : <p className="dim">{t('stx.needNone')}</p>}</div>
      {!notes.some(n => n.level === 'warn') ? <p className="stx-ok"><Icon name="check" size={15} />{t('stx.checkOk')}</p> : null}
      {GROUPS.map(g => { const list = notes.filter(n => n.group === g); if (!list.length) return null;
        return <div className="stx-grp" key={g}><h5>{t('stx.grp.' + g)}</h5><ul>{list.map((n, i) => <li key={i} className={'stx-note ' + n.level}><i className="stx-mk" aria-hidden="true">{n.level === 'warn' ? '!' : 'i'}</i><div><span>{n.text}</span>{n.where?.length ? <small>{n.where.join(' · ')}</small> : null}</div></li>)}</ul></div>; })}
    </section>
    <div className="row end wrap stx-go"><Btn label={t('stx.pngOnly')} ic="image" cls="ghost" onClick={() => void pack(true)} /><Btn label={t('stx.go')} ic="import" cls="primary" onClick={() => void pack()} /></div>
  </div>;
}

/** 실리태번용으로 내보내기 창을 연다 */
export async function stExport(ch: Char) {
  useCss('stx.css');
  await loadScripts().catch(() => { });
  const m: ModalHandle = openModal({ title: t('stx.title'), wide: true, body: <Dialog ch={ch} lib={[...libScripts]} close={() => m.close()} /> });
}
