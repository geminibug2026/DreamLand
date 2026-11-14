// 확장 · 플러그인: 설치(파일 · 주소 · 코드) · 켜고 끄기 · 삭제 · 시작 틀 (불러오기와 API 는 옛 ext.js 가 맡는다)
import { useEffect, useRef } from 'react';
import { Btn, Icon, IconBtn, useEvents } from '../kit';
import * as libExt from '../lib/ext';
import * as core from '../lib/core';
import { PageHead, confirmBox, promptBox } from '../studio/parts';
import { t } from '../i18n';
import * as TH from '../lib/thscripts';
import { toast } from '../ui';

interface ExtItem { id: string; name: string; version?: string; author?: string; description?: string; source: 'folder' | 'installed' }

export const page = { name: 'exts', Component: Exts };

function Exts() {
  const redraw = useEvents('ext:changed');
  const E = libExt, C = core, alive = useRef(true);
  const draw = () => { if (alive.current) redraw(); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { alive.current = true; void E.readCatalog().then(draw); return () => { alive.current = false; }; }, []);

  const remove = async (item: ExtItem) => {
    if (!(await confirmBox(t('exts.deleteConfirm', { name: item.name }), t('common.delete'), true))) return;
    E.unload(item.id); await C.DB.del('kv', 'ext:' + item.id); await C.DB.del('kv', 'extdata:' + item.id); await E.readCatalog(); draw();
  };
  return <section className="pagebox">
    <PageHead eyebrow="plugins" title={t('exts.title')} />
    <p className="hint">{t('exts.intro')}</p>
    <div className="card"><div className="row wrap"><h3 className="form-sec">{t('exts.installed')}</h3>
      <Btn label={t('exts.installFile')} ic="import" onClick={async () => { const [f] = await C.pickFiles({ accept: '.js,.mjs' }); if (f) void E.install(await f.text(), f.name); }} />
      <Btn label={t('exts.installUrl')} ic="plug" cls="ghost" onClick={async () => { const u = await promptBox(t('exts.urlPrompt'), '', { placeholder: 'https://github.com/…/blob/main/extension.js' }); if (u) void E.installFromUrl(u); }} />
      <Btn label={t('exts.paste')} ic="code" cls="ghost" onClick={async () => { const c = await promptBox(t('exts.codePrompt'), '', { area: true }); if (c) void E.install(c); }} /></div>
      <div className="ext-list">{E.catalog.length ? E.catalog.map(item => {
        const rec = E.loaded.get(item.id);
        return <div className="ext-card" key={item.id}><div className="ext-ic"><Icon name="plug" size={20} /></div>
          <div className="ext-meta"><b>{item.name} {item.version && <span className="badge">{'v' + item.version}</span>}</b>
            <small>{[item.author && t('exts.author', { author: item.author }), item.source === 'folder' ? t('exts.fromFolder') : t('exts.manual')].filter(Boolean).join(' · ')}</small>
            {item.description && <small>{item.description}</small>}{rec?.error && <small className="err">{t('exts.loadError', { error: rec.error })}</small>}</div>
          {item.source === 'installed' && <IconBtn ic="trash" title={t('common.delete')} onClick={() => void remove(item)} />}
          <label className="switch" title={t('exts.use')}><input type="checkbox" checked={E.enabled(item.id)} onChange={async e => { const p = E.setEnabled(item, e.target.checked); draw(); await p; draw(); }} /><i /></label>
        </div>;
      }) : <p className="dim">{t('exts.empty')}</p>}</div>
      <p className="hint">{t('exts.folderHint')}</p></div>
    <ThScripts />
    <div className="card"><h3 className="form-sec">{t('exts.make.title')}</h3>
      <p className="hint">{t('exts.make.hint')}</p>
      <details className="api-doc"><summary>{t('exts.make.template')}</summary><pre>{E.TEMPLATE}</pre></details>
      <div className="row"><Btn label={t('exts.make.download')} ic="import" onClick={() => C.download('my-extension.js', E.TEMPLATE, 'text/javascript')} /></div></div>
  </section>;
}

/** 실리태번 스크립트: 가져오기 · 켜기(처음엔 권한 확인) · 지우기 */
function ThScripts() {
  const redraw = useEvents('thscripts:changed');
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { void TH.load().then(redraw); }, []);
  const pick = async () => {
    const files = await core.pickFiles({ accept: '.json', multiple: true });
    let n = 0;
    for (const f of files) { try { const list = TH.parseScripts(JSON.parse(await f.text())); if (list.length) { await TH.addScripts(list); n += list.length; } } catch { /* 아래에서 알린다 */ } }
    toast(n ? t('ths.added', { n }) : t('ths.bad'), n ? 'ok' : 'err');
  };
  const toggle = async (sc: TH.ThScript, on: boolean) => {
    if (on && !sc.trusted && !(await confirmBox(t('ths.trust', { name: sc.name }), t('ths.trustOk'), true))) return;
    await TH.setEnabled(sc.id, on, on);
  };
  return <div className="card"><div className="row wrap"><h3 className="form-sec">{t('ths.title')}</h3>
      <Btn label={t('ths.import')} ic="import" onClick={() => void pick()} /></div>
    <p className="hint">{t('ths.intro')}</p>
    <div className="ext-list">{TH.scripts.length ? TH.scripts.map(sc => <div className="ext-card" key={sc.id}><div className="ext-ic"><Icon name="code" size={20} /></div>
      <div className="ext-meta"><b>{sc.name} {sc.enabled ? <span className="badge">{t('ths.running')}</span> : null}</b>{sc.info ? <small>{sc.info}</small> : null}</div>
      <IconBtn ic="trash" title={t('common.delete')} onClick={async () => { if (await confirmBox(t('ths.deleteConfirm', { name: sc.name }), t('common.delete'), true)) await TH.removeScript(sc.id); }} />
      <label className="switch"><input type="checkbox" checked={sc.enabled} onChange={e => void toggle(sc, e.target.checked)} /><i /></label>
    </div>) : <p className="dim">{t('ths.empty')}</p>}</div></div>;
}
