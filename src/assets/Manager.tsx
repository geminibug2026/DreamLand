// 에셋 관리판 (캐릭터 · 페르소나 공용)
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Btn, Icon } from '../kit';
import { usePaged, confirmBox, promptBox, toast } from '../ui';
import type { AssetRec } from '../addons/types';
import { Check, PathIcon, useRedraw } from '../addons/parts';
import { A, PATHS, cfg, copy, safeDecode, save, upload, uploadFromUrl } from './logic';
import { SBtn, Tiny, lightbox, openGallery, smartRename } from './windows';
import { pickFiles } from '../lib/core';

export function Sec({ ic, title, desc, children }: { ic?: ReactNode; title: string; desc?: ReactNode; children?: ReactNode }) {
  return <div className="ast-sec-head"><div><h4>{ic}{title}</h4>{desc ? <p>{desc}</p> : null}</div>{children ? <div className="ast-actions">{children}</div> : null}</div>;
}

interface Props { owner: string; ver?: string; src?: string; locked?: boolean; lockMsg?: string; title?: string; onChange?: () => void }
export function Manager({ owner, ver = '', src = owner, locked = false, lockMsg = '', title = '에셋', onChange = () => { } }: Props) {
  const c = cfg(), As = A();
  const redraw = useRedraw(), picked = useRef(new Set<string>()).current, [q, setQ] = useState('');
  const prog = useRef<HTMLDivElement>(null), bar = useRef<HTMLElement>(null);
  useEffect(() => { let alive = true; void As.load([owner, src]).then(() => { if (alive) redraw(); }); return () => { alive = false; }; /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

  const guard = () => { if (locked) toast(lockMsg || '지금은 바꿀 수 없어요'); return locked; };
  const changed = () => { redraw(); onChange(); };
  const progress = (n: number, total: number) => { prog.current?.classList.toggle('on', n < total); if (bar.current) bar.current.style.width = Math.round(n / total * 100) + '%'; };
  const add = async (files: File[]) => { if (guard() || !files.length) return; prog.current?.classList.add('on'); if (bar.current) bar.current.style.width = '4%'; try { await upload(owner, ver, files, progress); } finally { prog.current?.classList.remove('on'); } changed(); };
  const rename = async (a: AssetRec) => {
    if (guard()) return;
    const v = await promptBox('에셋 이름', a.name); if (v == null) return;
    const name = As.cleanName(v); if (!name || name === a.name) return;
    if (As.inVer(src, ver).some(x => x.name === name)) return toast('같은 이름의 에셋이 이미 있어요', 'err');
    await As.update({ ...a, name }); changed();
  };
  const bulk = async (label: string, fn: (a: AssetRec) => Promise<void>, danger = false) => {
    if (guard()) return;
    const hit = As.inVer(src, ver).filter(a => picked.has(a.id)); if (!hit.length) return toast('먼저 에셋을 골라 주세요');
    if (danger && !(await confirmBox(`고른 에셋 ${hit.length}개를 삭제할까요? 되돌릴 수 없어요.`, '삭제', true))) return;
    for (const a of hit) await fn(a);
    if (danger) picked.clear(); toast(`${hit.length}개 ${label}`, 'ok'); changed();
  };

  const all = As.inVer(src, ver), shown = all.filter(a => !q || a.name.includes(q));
  for (const id of [...picked]) if (!all.some(a => a.id === id)) picked.delete(id);
  const groups = new Map<string, AssetRec[]>(); for (const a of shown) { const b = As.baseOf(a.name); (groups.get(b) || groups.set(b, []).get(b)!).push(a); }
  const pg = usePaged([...groups], { id: 'assetGroups', perPage: 24, sizes: [12, 24, 48, 96], resetKey: `${src}|${ver}|${q}` });

  const fileRow = (a: AssetRec) => <div key={a.id} className={'ast-file' + (a.disabled ? ' off' : '')}>
    <span className="ast-fname" title={a.name}>{a.name}</span>
    <Tiny title="{{img::이름}} 태그 복사" onClick={() => void copy(`{{img::${a.name}}}`, `{{img::${a.name}}} 복사했어요`)}><PathIcon d={PATHS.tag} size={14} /></Tiny>
    <Tiny title="이름 바꾸기" onClick={() => void rename(a)}><Icon name="edit" size={14} /></Tiny>
    <Tiny title={a.disabled ? '다시 쓰기' : '쓰지 않기'} onClick={async () => { if (guard()) return; await As.update({ ...a, disabled: !a.disabled }); changed(); }}><Icon name={a.disabled ? 'eyeoff' : 'eye'} size={14} /></Tiny>
    <Tiny title="삭제" cls="bad" onClick={async () => { if (guard()) return; if (!(await confirmBox(`"${a.name}" 에셋을 삭제할까요?`, '삭제', true))) return; await As.remove(a); picked.delete(a.id); changed(); }}><Icon name="trash" size={14} /></Tiny>
  </div>;
  const groupCard = (base: string, files: AssetRec[]) => {
    const on = files.filter(a => !a.disabled), first = on[0] || files[0];
    return <div key={base} className={'ast-group' + (on.length ? '' : ' off')}>
      <button type="button" className="ast-thumb" title="크게 보기" onClick={() => lightbox(files, files.indexOf(first))}><img src={first.data} alt={first.name} loading="lazy" /><span className="ast-count">{`${on.length}/${files.length}`}</span></button>
      <label className="check ast-ghead"><input type="checkbox" checked={files.every(a => picked.has(a.id))} onChange={e => { files.forEach(a => e.target.checked ? picked.add(a.id) : picked.delete(a.id)); redraw(); }} /><i /><span title={base}>{base}</span></label>
      <div className="ast-files">{files.map(fileRow)}</div>
    </div>;
  };

  return <div className="ast-sec">
    <Sec title={title} desc={<span>파일 이름이 AI 가 쓸 키워드가 됩니다. 예: <code>joy.png</code>, <code>street-night.webp</code></span>}>
      <SBtn label="ZIP" d={PATHS.zip} onClick={async () => { if (!guard()) void add(await pickFiles({ accept: '.zip' })); }} />
      <Btn label="올리기" ic="upload" onClick={async () => { if (!guard()) void add(await pickFiles({ accept: 'image/png,image/webp,image/gif,image/jpeg', multiple: true })); }} />
      <SBtn label="주소에서" d={PATHS.link} onClick={async () => {
        if (guard()) return;
        const url = await promptBox('이미지 주소', '', { placeholder: 'https://…/joy.png' }); if (!url?.trim()) return;
        const label = await promptBox('키워드 (비우면 파일 이름)', As.keyOf(safeDecode(url.split(/[?#]/)[0].split('/').pop() || '')));
        if (label == null) return; if (await uploadFromUrl(owner, ver, url, As.cleanName(label))) changed();
      }} />
      <SBtn label="갤러리" d={PATHS.grid} onClick={() => openGallery(src, ver, `${title} 갤러리`, { locked, onChange: changed })} />
      <SBtn label="정돈" d={PATHS.broom} title="이름을 한꺼번에 다듬습니다" onClick={() => { if (!guard()) smartRename(src, ver, changed); }} />
    </Sec>
    <div className="ast-upopts">
      <Check label="WebP 자동 변환" on={c.webp} onChange={v => { c.webp = v; save(); redraw(); }} hint="PNG · JPEG 를 WebP 로 바꿔 용량을 줄입니다 (GIF 제외)" />
      <Check label="덮어쓰기 확인" on={c.confirmOverwrite} onChange={v => { c.confirmOverwrite = v; save(); redraw(); }} hint="같은 이름을 올릴 때 먼저 물어봅니다" />
    </div>
    {locked ? <div className="ast-lock"><PathIcon d={PATHS.link} size={16} />{lockMsg}</div>
      : <div className="dropzone small ast-drop" onClick={async () => { if (!guard()) void add(await pickFiles({ accept: 'image/png,image/webp,image/gif,image/jpeg,.zip', multiple: true })); }}
        onDragOver={e => { e.preventDefault(); e.currentTarget.classList.add('over'); }} onDragLeave={e => e.currentTarget.classList.remove('over')}
        onDrop={e => { e.preventDefault(); e.currentTarget.classList.remove('over'); void add([...e.dataTransfer.files]); }}>
        <Icon name="upload" size={22} /><b>여기에 끌어다 놓거나 눌러서 올리기</b><span>이미지 여러 장 · ZIP. 파일 이름이 곧 키워드입니다 (joy_1, joy_2 처럼 번호를 붙이면 한 묶음).</span></div>}
    <div className="ast-prog" ref={prog}><i ref={bar} /></div>
    <div className="ast-toolbar">
      <div className="search-wrap"><Icon name="search" size={16} /><input className="inp" placeholder="키워드 또는 이름 찾기…" onChange={e => setQ(e.target.value.trim().toLowerCase())} /></div>
      <div className="ast-toolbar-actions">
        <label className="check ast-all"><input type="checkbox" checked={shown.length > 0 && shown.every(a => picked.has(a.id))} onChange={e => { shown.forEach(a => e.target.checked ? picked.add(a.id) : picked.delete(a.id)); redraw(); }} /><i /><span>전체 선택</span></label>
        <span className="ast-selinfo">{picked.size ? `${picked.size}개 고름` : `에셋 ${shown.length}개 · 키워드 ${groups.size}개`}</span>
        <Tiny title="고른 에셋 쓰기" onClick={() => void bulk('켰어요', a => As.update({ ...a, disabled: false }))}><Icon name="eye" size={14} /></Tiny>
        <Tiny title="고른 에셋 쓰지 않기" onClick={() => void bulk('껐어요', a => As.update({ ...a, disabled: true }))}><Icon name="eyeoff" size={14} /></Tiny>
        <Btn label="선택 삭제" cls="danger" ic="trash" onClick={() => void bulk('삭제했어요', a => As.remove(a), true)} />
      </div>
    </div>
    <div className="ast-grid" ref={pg.listRef}>
      {groups.size ? pg.rows.map(([b, fs]) => groupCard(b, fs)) : <p className="dim ast-empty">{q ? '찾는 에셋이 없어요.' : locked ? '빌려 온 보관함에 에셋이 없어요.' : '아직 에셋이 없어요. 이미지나 ZIP 을 올려 주세요.'}</p>}
    </div>
    {pg.pager}
  </div>;
}
