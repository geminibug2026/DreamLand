// 이식 센터: 다른 앱의 설치 폴더에서 옮겨 오기 + 파일로 가져오기
import { useEffect, useRef, useState } from 'react';
import { Btn, Icon } from '../kit';
import { PageHead, toast } from '../ui';
import type { Source } from '../editors/types';
import { errMsg } from '../editors/refresh';
import { S } from '../lib/core';
import * as core from '../lib/core';
import * as cards from '../lib/cards';

export const page = { name: 'import', Component: ImportPage };

type Kind = 'st' | 'marinara';
type Inv = Record<string, unknown>;
const len = (v: unknown) => Array.isArray(v) ? v.length : Number(v) || 0;
const part = (key: string, name: string, from = key): [string, string, (i: Inv) => number] => [key, name, i => len(i[from])];
const KIND = {
  st: { name: 'SillyTavern', hint: '설치 폴더 또는 data/default-user 폴더', scan: 'scanST', run: 'importST',
    parts: [part('chars', '캐릭터'), part('chats', '대화'), part('lore', '로어북', 'worlds'), part('presets', '프리셋'), part('personas', '페르소나'), part('regex', '정규식'), part('quick', '빠른 답장')] },
  marinara: { name: 'Marinara Engine', hint: '설치 폴더 또는 packages/server/data 폴더', scan: 'scanME', run: 'importME',
    parts: [part('chars', '캐릭터'), part('chats', '대화'), part('lore', '로어북'), part('presets', '프리셋'), part('personas', '페르소나'), part('regex', '정규식')] },
} as const;
interface Item { key: number; src: Source; label: string; sub: string }
type Say = (text: string, cls?: string) => void;

/** 찾아낸 설치 하나: 무엇이 얼마나 있는지 살펴보고, 고른 것만 옮겨 온다 */
function SourceCard({ kind, it, say }: { kind: Kind; it: Item; say: Say }) {
  const K = KIND[kind], alive = useRef(true), want = useRef<Record<string, boolean>>({});
  const [inv, setInv] = useState<Inv | null>(null), [err, setErr] = useState(''), [busy, setBusy] = useState(false), [prog, setProg] = useState('');
  useEffect(() => {
    alive.current = true;
    cards[K.scan](it.src).then(i => { if (!alive.current) return; const v = i as unknown as Inv; for (const [key, , count] of K.parts) want.current[key] = count(v) > 0; setInv(v); }, e => { if (alive.current) setErr('읽지 못했어요: ' + errMsg(e)); });
    return () => { alive.current = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const go = async () => {
    setBusy(true);
    try {
      const T = await cards[K.run](it.src, want.current, t => { if (alive.current) setProg(t); });
      say(`${K.name} → ${cards.summarize(T)}${T.skipped ? ` · 이미 있거나 비어 있어 건너뜀 ${T.skipped}` : ''}`, 'ok');
      for (const e of T.errors.slice(0, 20)) say(e, 'err');
      toast('이식을 마쳤어요', 'ok');
    } catch (e) { say(errMsg(e), 'err'); toast(errMsg(e), 'err'); }
    if (alive.current) { setBusy(false); setProg(''); }
  };
  return <div className="src"><div className="src-head"><Icon name="folder" size={18} /><div><b>{it.label}</b><small>{it.sub}</small></div></div>
    <div className="src-body">{err ? <p className="err">{err}</p> : !inv ? <p className="dim">살펴보는 중…</p> : <>
      <div className="pills">{K.parts.map(([key, name, count]) => { const n = count(inv); return <label key={key} className={'check pill' + (n ? '' : ' dis')}><input type="checkbox" defaultChecked={n > 0} disabled={!n} onChange={e => { want.current[key] = e.target.checked; }} /><i /><span>{name}</span><em>{String(n)}</em></label>; })}</div>
      <div className="row"><button type="button" className="btn primary" disabled={busy} onClick={() => void go()}><Icon name="sparkle" /><span>드림랜드로 옮겨 오기</span></button><div className={'progress' + (busy ? ' on' : '')}><i /><span>{prog}</span></div></div>
    </>}</div></div>;
}

const DROP_HINT = '캐릭터 카드 PNG · JSON, 대화 JSONL, 로어북, 프리셋, 정규식, 마리나라 내보내기, 드림랜드 백업';

function ImportPage() {
  const alive = useRef(true), seq = useRef(0);
  const [hasBridge, setHas] = useState<boolean | null>(null);
  const [found, setFound] = useState<Record<Kind, Item[]>>({ st: [], marinara: [] }), [none, setNone] = useState<Record<Kind, boolean>>({ st: false, marinara: false });
  const [log, setLog] = useState<{ k: number; text: string; cls: string }[]>([]), [dropText, setDropText] = useState(DROP_HINT), [over, setOver] = useState(false);
  const paths = useRef<Record<Kind, HTMLInputElement | null>>({ st: null, marinara: null });
  const say: Say = (text, cls = '') => setLog(l => [{ k: ++seq.current, text, cls }, ...l]);
  const add = (kind: Kind, src: Source, label: string, sub: string) => setFound(f => ({ ...f, [kind]: [...f[kind], { key: ++seq.current, src, label, sub }] }));
  useEffect(() => {
    alive.current = true;
    void (async () => {
      const ok = await cards.bridge.ok(); if (!alive.current) return;   // 탐색하는 사이 다른 화면으로 이동했다면 그리지 않는다
      setHas(ok); if (!ok) return;
      const list = await cards.bridge.detect(); if (!alive.current) return;
      for (const kind of ['st', 'marinara'] as const) {
        const mine = list.filter(f => f.kind === kind);
        if (!mine.length) setNone(n => ({ ...n, [kind]: true }));
        for (const f of mine) add(kind, cards.bridgeSource(f.root), kind === 'st' ? `사용자 · ${f.label}` : f.label, f.root);
      }
    })();
    return () => { alive.current = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  if (hasBridge === null) return null;

  const slot = (kind: Kind) => kind === 'st' ? 'st' : 'me';
  const find = async (kind: Kind) => {
    const p = (paths.current[kind]?.value || '').trim().replace(/^"|"$/g, ''); if (!p) return;
    const hit = (await cards.bridge.resolve(p)).filter(r => r.kind === kind);
    if (!hit.length) return toast(`그 위치에서 ${KIND[kind].name} 데이터를 찾지 못했어요`, 'err');
    S.set({ bridge: { ...S.settings.bridge, [slot(kind)]: p } });
    for (const r of hit) add(kind, cards.bridgeSource(r.root), r.label, r.root);
  };
  const pickDir = async (kind: Kind) => {
    const files = await core.pickFiles({ dir: true }); if (!files.length) return;
    const src = cards.filesSource(files);
    if (!src || src.kind !== kind) return toast(`고른 폴더에서 ${KIND[kind].name} 데이터를 찾지 못했어요`, 'err');
    add(kind, src, '선택한 폴더', src.label || '');
  };
  const handle = async (files: File[]) => {
    if (!files.length) return;
    const T = await cards.importFiles(files, t => { if (alive.current) setDropText(t); });
    say(`파일 ${files.length}개 → ${cards.summarize(T)}`, T.errors.length ? '' : 'ok'); T.errors.forEach(e => say(e, 'err'));
    if (alive.current) setDropText('종류는 자동으로 알아냅니다.');
    toast(cards.summarize(T), T.errors.length && !T.chars && !T.chats ? 'err' : 'ok');
  };
  const section = (kind: Kind) => <div className="card import-card">
    <h3 className="form-sec">{KIND[kind].name}</h3>
    {hasBridge ? <div className="src-list">{none[kind] && <p className="dim">자동으로 찾은 설치가 없어요. 아래에 폴더 경로를 넣어 주세요.</p>}{found[kind].map(it => <SourceCard key={it.key} kind={kind} it={it} say={say} />)}</div>
      : <p className="dim">로컬 서버 없이 열려 있어 자동 탐색은 쓸 수 없어요. 폴더를 직접 골라 주세요.</p>}
    <div className="row manual"><input className="inp" ref={el => { paths.current[kind] = el; }} placeholder={KIND[kind].hint} defaultValue={S.settings.bridge[slot(kind)] || ''} spellCheck={false} onKeyDown={e => { if (e.key === 'Enter') void find(kind); }} />
      <Btn label="찾기" ic="search" onClick={() => void find(kind)} /><Btn label="폴더 고르기" ic="folder" cls="ghost" onClick={() => void pickDir(kind)} /></div>
  </div>;
  return <section className="pagebox">
    <PageHead eyebrow="migrate" title="이식 센터" />
    <p className="hint">원본은 읽기만 하고 고치지 않습니다. API 키 같은 비밀 값은 가져오지 않아요. 같은 항목을 다시 옮기면 중복되지 않고 갱신됩니다.</p>
    {section('st')}{section('marinara')}
    <div className="card import-card"><h3 className="form-sec">파일로 가져오기</h3>
      <div className={'dropzone' + (over ? ' over' : '')} onClick={async () => handle(await core.pickFiles({ multiple: true, accept: '.png,.json,.jsonl,.webp' }))}
        onDragOver={e => { e.preventDefault(); setOver(true); }} onDragLeave={() => setOver(false)} onDrop={e => { e.preventDefault(); setOver(false); void handle([...e.dataTransfer.files]); }}>
        <Icon name="import" size={30} /><b>파일을 끌어다 놓거나 눌러서 고르기</b><span>{dropText}</span></div></div>
    <div className="import-log">{log.map(l => <div key={l.k} className={'log-line' + (l.cls ? ' ' + l.cls : '')}>{l.text}</div>)}</div>
  </section>;
}
