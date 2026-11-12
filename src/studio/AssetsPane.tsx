// 에셋 창: 캐릭터 · 페르소나 편집기의 "삽화용 외형 + 에셋" (옛 js/studio.js 의 assetsPane)
import { useEffect, useReducer, useRef, useState, type DragEvent } from 'react';
import { pickFiles } from '../lib/core';
import { Assets, type AssetRec as Asset } from '../lib/assets';
import { Form, confirmBox, openModal, promptBox, toast, type FormDefs } from '../ui';
import { Icon, IconBtn } from '../kit';

interface Holder { visual?: { appearance?: string; outfit?: string; negative?: string }; [k: string]: unknown }

const DEFS: FormDefs = [
  { k: 'visual.appearance', label: '삽화용 외형', type: 'area', rows: 3, ph: 'long silver hair, amber eyes, black coat …', hint: '삽화를 그릴 때 이 인물이 나오면 자동으로 붙습니다.' },
  { k: 'visual.outfit', label: '기본 의상', ph: 'white blouse, navy pleated skirt …', hint: '장면에서 옷이 바뀌면 그 장면의 옷이 우선합니다.' },
  { k: 'visual.negative', label: '삽화에서 피할 것', ph: '비워 두어도 됩니다' },
];

export function AssetsPane({ owner, holder, save }: { owner: string; holder: Holder; save: () => void }) {
  holder.visual ||= { appearance: '', negative: '' };
  const [, draw] = useReducer((n: number) => n + 1, 0), [over, setOver] = useState(false), alive = useRef(true);
  useEffect(() => { alive.current = true; void Assets.load([owner]).then(() => { if (alive.current) draw(); }); return () => { alive.current = false; }; }, [owner]);
  const list: Asset[] = Assets.list(owner);
  const add = async (files: File[]) => { const n = await Assets.addFiles(owner, files); toast(n ? `에셋 ${n}개를 넣었어요` : '넣을 이미지가 없어요', n ? 'ok' : ''); if (alive.current) draw(); };
  const drop = (e: DragEvent) => { e.preventDefault(); setOver(false); void add([...e.dataTransfer.files]); };
  const rename = async (a: Asset) => { const v = await promptBox('에셋 이름', a.name); if (v?.trim()) { a.name = v.trim().toLowerCase().replace(/\s+/g, '_'); await Assets.update(a); draw(); } };
  const flip = async (a: Asset) => { a.disabled = !a.disabled; await Assets.update(a); draw(); };
  const del = async (a: Asset) => { if (!(await confirmBox(`"${a.name}" 에셋을 삭제할까요?`, '삭제', true))) return; await Assets.remove(a); draw(); };
  return <div className="col">
    <Form obj={holder} defs={DEFS} onChange={() => save()} />
    <h3 className="form-sec">에셋</h3>
    <p className="hint">{'대화에 {{img::이름}} 이 나오면 그 자리에 그림이 보입니다. 쓸 수 있는 이름은 모델에게 자동으로 알려 줍니다.'}</p>
    <div className={'dropzone small' + (over ? ' over' : '')} onClick={async () => add(await pickFiles({ accept: 'image/*,.zip', multiple: true }))}
      onDragOver={e => { e.preventDefault(); setOver(true); }} onDragLeave={() => setOver(false)} onDrop={drop}>
      <Icon name="image" size={24} /><b>이미지 · ZIP 올리기</b><span>파일 이름이 곧 키워드입니다 (joy_1, joy_2 처럼 번호를 붙이면 한 묶음).</span>
    </div>
    <div className="asset-grid">
      {list.map(a => <div key={a.id} className={'asset' + (a.disabled ? ' off' : '')}>
        <img src={a.data} loading="lazy" onClick={() => openModal({ title: a.name, wide: true, body: <img className="full-img" src={a.data} /> })} />
        <div className="asset-name">
          <span title="눌러서 태그 복사" onClick={() => { void navigator.clipboard.writeText(`{{img::${a.name}}}`); toast('태그를 복사했어요'); }}>{a.name}</span>
          <IconBtn ic="edit" title="이름 바꾸기" cls="tiny" onClick={() => { void rename(a); }} />
          <IconBtn ic={a.disabled ? 'eyeoff' : 'eye'} title="쓰지 않기 / 다시 쓰기" cls="tiny" onClick={() => { void flip(a); }} />
          <IconBtn ic="trash" title="삭제" cls="tiny" onClick={() => { void del(a); }} />
        </div>
      </div>)}
      {!list.length && <p className="dim">아직 에셋이 없어요. 이미지나 ZIP 을 올려 주세요.</p>}
    </div>
  </div>;
}

