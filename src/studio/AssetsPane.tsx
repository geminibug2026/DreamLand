// 에셋 창: 캐릭터 · 페르소나 편집기의 "삽화용 외형 + 에셋" (옛 js/studio.js 의 assetsPane)
import { useEffect, useMemo, useReducer, useRef, useState, type DragEvent } from 'react';
import { pickFiles } from '../lib/core';
import { Assets, type AssetRec as Asset } from '../lib/assets';
import { Form, confirmBox, openModal, promptBox, toast, type FormDefs } from '../ui';
import { Icon, IconBtn } from '../kit';
import { t, useLang } from '../i18n';

interface Holder { visual?: { appearance?: string; outfit?: string; negative?: string }; [k: string]: unknown }

const DEFS = (): FormDefs => [
  { k: 'visual.appearance', label: t('assets.pane.appearance'), type: 'area', rows: 3, ph: 'long silver hair, amber eyes, black coat …', hint: t('assets.pane.appearanceHint') },
  { k: 'visual.outfit', label: t('assets.pane.outfit'), ph: 'white blouse, navy pleated skirt …', hint: t('assets.pane.outfitHint') },
  { k: 'visual.negative', label: t('assets.pane.negative'), ph: t('assets.pane.negativePh') },
];

export function AssetsPane({ owner, holder, save }: { owner: string; holder: Holder; save: () => void }) {
  holder.visual ||= { appearance: '', negative: '' };
  const lang = useLang(), defs = useMemo(DEFS, [lang]);
  const [, draw] = useReducer((n: number) => n + 1, 0), [over, setOver] = useState(false), alive = useRef(true);
  useEffect(() => { alive.current = true; void Assets.load([owner]).then(() => { if (alive.current) draw(); }); return () => { alive.current = false; }; }, [owner]);
  const list: Asset[] = Assets.list(owner);
  const add = async (files: File[]) => { const n = await Assets.addFiles(owner, files); toast(n ? t('assets.up.done', { count: n }) : t('assets.pane.noImages'), n ? 'ok' : ''); if (alive.current) draw(); };
  const drop = (e: DragEvent) => { e.preventDefault(); setOver(false); void add([...e.dataTransfer.files]); };
  const rename = async (a: Asset) => { const v = await promptBox(t('assets.nameAsk'), a.name); if (v?.trim()) { a.name = v.trim().toLowerCase().replace(/\s+/g, '_'); await Assets.update(a); draw(); } };
  const flip = async (a: Asset) => { a.disabled = !a.disabled; await Assets.update(a); draw(); };
  const del = async (a: Asset) => { if (!(await confirmBox(t('assets.deleteAsk', { name: a.name }), t('common.delete'), true))) return; await Assets.remove(a); draw(); };
  return <div className="col">
    <Form obj={holder} defs={defs} onChange={() => save()} />
    <h3 className="form-sec">{t('assets.title')}</h3>
    <p className="hint">{t('assets.pane.hint')}</p>
    <div className={'dropzone small' + (over ? ' over' : '')} onClick={async () => add(await pickFiles({ accept: 'image/*,.zip', multiple: true }))}
      onDragOver={e => { e.preventDefault(); setOver(true); }} onDragLeave={() => setOver(false)} onDrop={drop}>
      <Icon name="image" size={24} /><b>{t('assets.pane.upload')}</b><span>{t('assets.pane.uploadHint')}</span>
    </div>
    <div className="asset-grid">
      {list.map(a => <div key={a.id} className={'asset' + (a.disabled ? ' off' : '')}>
        <img src={a.data} loading="lazy" onClick={() => openModal({ title: a.name, wide: true, body: <img className="full-img" src={a.data} /> })} />
        <div className="asset-name">
          <span title={t('assets.pane.clickCopy')} onClick={() => { void navigator.clipboard.writeText(`{{img::${a.name}}}`); toast(t('assets.tagCopied')); }}>{a.name}</span>
          <IconBtn ic="edit" title={t('common.rename')} cls="tiny" onClick={() => { void rename(a); }} />
          <IconBtn ic={a.disabled ? 'eyeoff' : 'eye'} title={t('assets.pane.toggle')} cls="tiny" onClick={() => { void flip(a); }} />
          <IconBtn ic="trash" title={t('common.delete')} cls="tiny" onClick={() => { void del(a); }} />
        </div>
      </div>)}
      {!list.length && <p className="dim">{t('assets.empty')}</p>}
    </div>
  </div>;
}

