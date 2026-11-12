// 확장 · 플러그인: 설치(파일 · 주소 · 코드) · 켜고 끄기 · 삭제 · 시작 틀 (불러오기와 API 는 옛 ext.js 가 맡는다)
import { useEffect, useRef } from 'react';
import { mod } from '../legacy';
import { Btn, Icon, IconBtn, useEvents } from '../kit';
import { promptBox, confirmBox, PageHead, core } from '../studio/bridge';

interface ExtItem { id: string; name: string; version?: string; author?: string; description?: string; source: 'folder' | 'installed' }
interface ExtMod {
  catalog: ExtItem[]; loaded: Map<string, { error: string }>; TEMPLATE: string;
  enabled(id: string): boolean; unload(id: string): void; readCatalog(): Promise<ExtItem[]>;
  setEnabled(item: ExtItem, on: boolean): Promise<void>; install(code: string, hint?: string): Promise<void>; installFromUrl(url: string): Promise<void>;
}

export const page = { name: 'exts', Component: Exts, needs: ['ext'] };

function Exts() {
  const redraw = useEvents('ext:changed');
  const E = mod<ExtMod>('ext'), C = core(), alive = useRef(true);
  const draw = () => { if (alive.current) redraw(); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { alive.current = true; void E.readCatalog().then(draw); return () => { alive.current = false; }; }, []);

  const remove = async (item: ExtItem) => {
    if (!(await confirmBox(`"${item.name}" 확장을 삭제할까요?`, '삭제', true))) return;
    E.unload(item.id); await C.DB.del('kv', 'ext:' + item.id); await C.DB.del('kv', 'extdata:' + item.id); await E.readCatalog(); draw();
  };
  return <section className="pagebox">
    <PageHead eyebrow="plugins" title="확장 · 플러그인" />
    <p className="hint">확장은 명령어·매크로·패널·메뉴·화면·테마를 드림랜드에 더합니다. 대화와 API 키를 포함한 모든 데이터에 접근할 수 있으니 믿을 수 있는 것만 켜 주세요.</p>
    <div className="card"><div className="row wrap"><h3 className="form-sec">설치된 확장</h3>
      <Btn label="파일로 설치" ic="import" onClick={async () => { const [f] = await C.pickFiles({ accept: '.js,.mjs' }); if (f) void E.install(await f.text(), f.name); }} />
      <Btn label="주소로 설치" ic="plug" cls="ghost" onClick={async () => { const u = await promptBox('확장 파일 주소 (.js)', '', { placeholder: 'https://github.com/…/blob/main/extension.js' }); if (u) void E.installFromUrl(u); }} />
      <Btn label="코드 붙여넣기" ic="code" cls="ghost" onClick={async () => { const c = await promptBox('확장 코드', '', { area: true }); if (c) void E.install(c); }} /></div>
      <div className="ext-list">{E.catalog.length ? E.catalog.map(item => {
        const rec = E.loaded.get(item.id);
        return <div className="ext-card" key={item.id}><div className="ext-ic"><Icon name="plug" size={20} /></div>
          <div className="ext-meta"><b>{item.name} {item.version && <span className="badge">{'v' + item.version}</span>}</b>
            <small>{[item.author && `만든이 ${item.author}`, item.source === 'folder' ? 'extensions 폴더' : '직접 설치'].filter(Boolean).join(' · ')}</small>
            {item.description && <small>{item.description}</small>}{rec?.error && <small className="err">{'불러오지 못했어요: ' + rec.error}</small>}</div>
          {item.source === 'installed' && <IconBtn ic="trash" title="삭제" onClick={() => void remove(item)} />}
          <label className="switch" title="사용"><input type="checkbox" checked={E.enabled(item.id)} onChange={async e => { const p = E.setEnabled(item, e.target.checked); draw(); await p; draw(); }} /><i /></label>
        </div>;
      }) : <p className="dim">아직 설치한 확장이 없어요.</p>}</div>
      <p className="hint">드림랜드 폴더의 extensions/이름/ 안에 manifest.json 과 index.js 를 넣어 두면 여기에 나타납니다.</p></div>
    <div className="card"><h3 className="form-sec">확장 만들기</h3>
      <p className="hint">ES 모듈 파일 하나면 됩니다. 아래 틀에서 시작해 보세요.</p>
      <details className="api-doc"><summary>시작 틀과 API</summary><pre>{E.TEMPLATE}</pre></details>
      <div className="row"><Btn label="틀 내려받기" ic="import" onClick={() => C.download('my-extension.js', E.TEMPLATE, 'text/javascript')} /></div></div>
  </section>;
}
