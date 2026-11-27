// 확장 · 플러그인: 설치(파일 · 주소 · 코드) · 켜고 끄기 · 삭제 · 시작 틀 (불러오기와 API 는 옛 ext.js 가 맡는다)
import { Fragment, useEffect, useRef, type ReactNode } from 'react';
import { Btn, Icon, useEvents } from '../kit';
import * as libExt from '../lib/ext';
import * as core from '../lib/core';
import { PageHead, confirmBox, promptBox } from '../studio/parts';
import { t } from '../i18n';
import * as TH from '../lib/thscripts';
import type { Char } from '../lib/types';
import { menu, toast } from '../ui';
import { MvuSettings } from '../mvu/Ui';

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
    <div className="card">
      <div className="xr-head"><h3 className="form-sec">{t('exts.installed')}</h3>
        <Btn label={t('exts.installMenu')} ic="plus" cls="xr-hbtn" onClick={e => menu(e.currentTarget, [
          { label: t('exts.installFile'), ic: 'import', onclick: async () => { const [f] = await C.pickFiles({ accept: '.js,.mjs' }); if (f) void E.install(await f.text(), f.name); } },
          { label: t('exts.installUrl'), ic: 'plug', onclick: async () => { const u = await promptBox(t('exts.urlPrompt'), '', { placeholder: 'https://github.com/…/blob/main/extension.js' }); if (u) void E.installFromUrl(u); } },
          { label: t('exts.paste'), ic: 'code', onclick: async () => { const c = await promptBox(t('exts.codePrompt'), '', { area: true }); if (c) void E.install(c); } },
        ])} /></div>
      <div className="xr-list">{E.catalog.length ? E.catalog.map(item => {
        const rec = E.loaded.get(item.id), on = E.enabled(item.id);
        return <Row key={item.id} icon="plug" title={item.name} on={on} toggleTitle={t('exts.use')}
          onToggle={async v => { const p = E.setEnabled(item, v); draw(); await p; draw(); }}
          meta={[item.version && 'v' + item.version, item.author && t('exts.author', { author: item.author }), item.source === 'folder' ? t('exts.fromFolder') : t('exts.manual')]}
          desc={item.description} err={rec?.error ? t('exts.loadError', { error: rec.error }) : ''}
          actions={item.source === 'installed' ? <button type="button" className="xr-act danger" onClick={() => void remove(item)}><Icon name="trash" size={15} />{t('common.delete')}</button> : null} />;
      }) : <p className="xr-empty">{t('exts.empty')}</p>}</div>
      <p className="hint">{t('exts.folderHint')}</p></div>
    <ThScripts />
    <MvuSettings />
    <div className="card"><h3 className="form-sec">{t('exts.make.title')}</h3>
      <p className="hint">{t('exts.make.hint')}</p>
      <details className="api-doc"><summary>{t('exts.make.template')}</summary><pre>{E.TEMPLATE}</pre></details>
      <div className="row"><Btn label={t('exts.make.download')} ic="import" onClick={() => C.download('my-extension.js', E.TEMPLATE, 'text/javascript')} /></div></div>
  </section>;
}

/** 실리태번 스크립트: 가져오기 · 켜기(처음엔 권한 확인) · 지우기 */
function ThScripts() {
  const redraw = useEvents('thscripts:changed');
  const withScripts = (core.S.chars as Char[]).map(ch => ({ ch, list: TH.charScripts(ch) })).filter(x => x.list.length);
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
  return <div className="card">
    <div className="xr-head"><h3 className="form-sec">{t('ths.title')}</h3><Btn label={t('ths.importShort')} title={t('ths.import')} ic="import" cls="xr-hbtn" onClick={() => void pick()} /></div>
    <p className="hint">{t('ths.intro')}</p>
    <div className="xr-list">{TH.scripts.length ? TH.scripts.map(sc => <Row key={sc.id} icon="code" title={sc.name} on={sc.enabled} onToggle={v => void toggle(sc, v)}
      meta={[sc.enabled ? <Status on>{t('ths.running')}</Status> : null]} desc={sc.info}
      actions={<button type="button" className="xr-act danger" onClick={async () => { if (await confirmBox(t('ths.deleteConfirm', { name: sc.name }), t('common.delete'), true)) await TH.removeScript(sc.id); }}><Icon name="trash" size={15} />{t('common.delete')}</button>} />)
      : <p className="xr-empty">{t('ths.empty')}</p>}</div>
    {withScripts.length ? <><h4 className="form-sec">{t('ths.charTitle')}</h4><p className="hint">{t('ths.charGuide')}</p>
      <div className="xr-groups">{withScripts.map(({ ch, list }) => {
        const a = TH.charAllowed(ch.id);
        const allowIt = async () => (await confirmBox(t('ths.charAsk', { name: ch.name, n: list.length, names: list.map(s => s.name).join(', ') }), t('ths.trustOk'), true)) && (await TH.setCharAllowed(ch.id, true), true);
        return <div className="xr-group" key={ch.id}>
          <Row icon="user" avatar={core.S.avatarNow(ch)} title={ch.name} on={!!a} toggleTitle={t('ths.charToggle')}
            onToggle={async v => { if (v) await allowIt(); else await TH.setCharAllowed(ch.id, false); }}
            meta={[<Status key="s" on={!!a} warn={a === undefined}>{a === undefined ? t('ths.charUnset') : a ? t('ths.charAllowed') : t('ths.charDenied')}</Status>, t('ths.charCount', { n: list.length })]} />
          <div className="xr-subs">{list.map(sc => <Row key={sc.id} sub icon="code" title={sc.name} on={sc.enabled}
            onToggle={async v => { if (v && !a && !(await allowIt())) return; await TH.setCharScript(sc.id, v); }}
            meta={[a && sc.enabled ? <Status on>{t('ths.running')}</Status> : null]} desc={sc.info} />)}</div>
        </div>; })}</div></> : null}</div>;
}

/** 상태 한 마디 (점 + 글): 켜짐은 강조색, 아직 안 정함은 주의색 */
function Status({ on, warn, children }: { on?: boolean; warn?: boolean; children: ReactNode }) {
  return <span className={'xr-st' + (on ? ' on' : warn ? ' warn' : '')}>{children}</span>;
}
/** 목록 한 줄: 첫 줄은 아이콘 · 이름 · 덧말 · 스위치, 그 아래 설명은 줄 전체 너비로, 맨 아래에 할 일 (모든 목록이 같은 꼴) */
function Row({ icon, avatar, title, meta = [], desc, err, on, onToggle, toggleTitle, actions, sub }: {
  icon: string; avatar?: string; title: string; meta?: ReactNode[]; desc?: string; err?: string; on: boolean; onToggle: (v: boolean) => void; toggleTitle?: string; actions?: ReactNode; sub?: boolean;
}) {
  const bits = meta.filter(Boolean);
  return <div className={'xr' + (sub ? ' sub' : '')}>
    <div className="xr-top">
      {avatar ? <img className="xr-av" src={avatar} alt="" /> : <span className="xr-ic" aria-hidden="true"><Icon name={icon} size={sub ? 15 : 17} /></span>}
      <div className="xr-tt"><b title={title}>{title}</b>{bits.length ? <small>{bits.map((b, i) => <Fragment key={i}>{i ? <i className="xr-dot" aria-hidden="true">·</i> : null}{b}</Fragment>)}</small> : null}</div>
      <label className="switch" title={toggleTitle}><input type="checkbox" checked={on} aria-label={toggleTitle || title} onChange={e => onToggle(e.target.checked)} /><i /></label>
    </div>
    {desc ? <p className="xr-desc">{desc}</p> : null}
    {err ? <p className="xr-desc err">{err}</p> : null}
    {actions ? <div className="xr-acts">{actions}</div> : null}
  </div>;
}
