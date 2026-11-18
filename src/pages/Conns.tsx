// API 연결: 제공자 · 주소 · 키(넣은 뒤에는 다시 보여 주지 않는다) · 모델 · 고급 설정 · 연결 테스트
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Btn, Icon, IconBtn } from '../kit';
import { Form, LibraryPage, confirmBox, toast } from '../ui';
import type { Conn, Provider } from '../editors/types';
import { editorApi, useBump, useDebounced, type EditorApi } from '../editors/parts';
import { go } from '../lib/router';
import { errMsg } from '../editors/refresh';
import { S } from '../lib/core';
import * as engine from '../lib/engine';
import * as core from '../lib/core';
import * as adv from '../lib/advanced';
import { t, tn } from '../i18n';
import { TtsConnBody } from '../tts/ui';

export const page = { name: 'conns', Component: ConnsPage };

/** 제공자 묶음 (PROVIDERS 의 group 값 — 한국어 id 그대로, 그릴 때만 번역) */
const GROUPS = ['주요', '클라우드', '모음 서비스', '내 컴퓨터', '기타', '음성'];
const GROUP_KEYS: Record<string, string> = { '주요': 'conns.group.main', '클라우드': 'conns.group.cloud', '모음 서비스': 'conns.group.aggregator', '내 컴퓨터': 'conns.group.local', '기타': 'conns.group.other', '음성': 'conns.group.voice' };
const groupLabel = (g: string) => GROUP_KEYS[g] ? t(GROUP_KEYS[g]) : g;
/** 화면에 내보일 꼬리: 저장된 키는 끝 네 글자만 */
const keyTail = (c: Conn) => core.Secrets.is(c.apiKey) ? core.Secrets.tail(c.id, 'apiKey') : (String(c.apiKey || '').length > 8 ? String(c.apiKey).slice(-4) : '');
const whereTag = (held: boolean) => held ? t('conns.where.server') : core.Vault.on ? t('conns.where.encrypted') : t('conns.where.browser');

/** API 키 칸: 한 번 넣은 키는 다시 보여 주지 않는다. 바꾸려면 새로 넣고, 지우려면 지우기 */
function KeyField({ c, def, api }: { c: Conn; def: Provider; api: EditorApi }) {
  const { Secrets, Vault } = core, inp = useRef<HTMLInputElement>(null);
  const saved = !!c.apiKey, held = Secrets.is(c.apiKey);
  const commit = async () => {
    const v = inp.current?.value.trim(); if (!v) return;
    try {
      if (Secrets.on) { const hosts = Secrets.hostsFor(c, def.base || ''); if (!hosts.length) return toast(t('conns.key.needUrl'), 'err'); c.apiKey = await Secrets.put(c.id, 'apiKey', v, hosts, c.name); }
      else c.apiKey = v;
      await api.save(); toast(t('conns.key.saved'), 'ok'); api.refresh();
    } catch (e) { toast(errMsg(e), 'err'); }
  };
  const fn = useRef(commit); useLayoutEffect(() => { fn.current = commit; });
  // 칸을 떠나거나 Enter 를 누를 때 저장한다 (글자마다가 아니라)
  useEffect(() => { const el = inp.current, on = () => void fn.current(); el?.addEventListener('change', on); return () => el?.removeEventListener('change', on); }, []);
  const where = held ? t('conns.key.whereServer', { hosts: (Secrets.items[c.id]?.apiKey?.hosts || []).join(', ') || t('conns.key.noHost') }) : Secrets.ok ? t('conns.key.whereMoving') : Vault.on ? t('conns.key.whereEncrypted') : t('conns.key.whereBrowser');
  return <div className="field key-field"><span className="field-label">{def.kind === 'vertex' ? t('conns.key.labelVertex') : def.keyless ? t('conns.key.labelOptional') : t('conns.key.label')}</span>
    {saved ? <div className="key-state"><Icon name="lock" size={15} /><b>{t('conns.key.savedBadge')}</b><code>{'••••••••' + (keyTail(c) || '')}</code><span className="key-where">{whereTag(held)}</span>
      <Btn label={t('conns.key.clear')} cls="ghost" onClick={async () => { if (!(await confirmBox(t('conns.key.clearConfirm'), t('conns.key.clear'), true))) return; if (held) await Secrets.del(c.id, 'apiKey'); c.apiKey = ''; await api.save(); api.refresh(); }} /></div> : null}
    <input className="inp" ref={inp} type="password" autoComplete="off" spellCheck={false} placeholder={saved ? t('conns.key.replacePh') : t('conns.key.pastePh')} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); void commit(); } }} />
    <small className="hint">{t('conns.key.hint', { where })}</small>
  </div>;
}

/** 서비스 계정 키: 이메일만 보여 주고 본문은 다시 보여 주지 않는다 */
function SaField({ c, api }: { c: Conn; api: EditorApi }) {
  const { Secrets, pickFiles } = core, ta = useRef<HTMLTextAreaElement>(null);
  const saved = !!c.serviceAccount, held = Secrets.is(c.serviceAccount);
  const email = held ? c.saEmail : (() => { try { return (JSON.parse(c.serviceAccount || '') as { client_email?: string }).client_email; } catch { return saved ? t('conns.sa.badFormat') : ''; } })();
  const take = async (text: string) => {
    try {
      const j = engine.parseServiceAccount(text); c.project = j.project_id || c.project || ''; c.saEmail = j.client_email || ''; c.saProject = j.project_id || '';
      c.serviceAccount = Secrets.on ? await Secrets.put(c.id, 'serviceAccount', JSON.stringify(j), ['googleapis.com'], c.saEmail) : JSON.stringify(j);
      await api.save(); toast(t('conns.sa.saved', { email: j.client_email }), 'ok'); api.refresh();
    } catch (e) { toast(errMsg(e), 'err'); }
  };
  const fn = useRef(take); useLayoutEffect(() => { fn.current = take; });
  useEffect(() => { const el = ta.current, on = () => { if (el?.value.trim()) void fn.current(el.value); }; el?.addEventListener('change', on); return () => el?.removeEventListener('change', on); }, []);
  return <div className="col key-field">
    {saved ? <div className="key-state"><Icon name="lock" size={15} /><b>{t('conns.key.savedBadge')}</b><code>{email || t('conns.sa.account')}</code><span className="key-where">{whereTag(held)}</span>
      <Btn label={t('conns.sa.clear')} cls="ghost" onClick={async () => { if (!(await confirmBox(t('conns.sa.clearConfirm'), t('conns.key.clear'), true))) return; if (held) await Secrets.del(c.id, 'serviceAccount'); c.serviceAccount = ''; c.saEmail = ''; c.saProject = ''; await api.save(); api.refresh(); }} /></div> : null}
    <div className="row wrap"><Btn label={saved ? t('conns.sa.replaceFile') : t('conns.sa.importFile')} ic="import" onClick={async () => { const [f] = await pickFiles({ accept: '.json,application/json' }); if (f) void take(await f.text()); }} /></div>
    <label className="field"><span className="field-label">{t('conns.sa.label')}</span><textarea className="inp" ref={ta} rows={3} spellCheck={false} autoComplete="off" placeholder={saved ? t('conns.sa.replacePh') : '{ "type": "service_account", "project_id": "…", "private_key": "…", "client_email": "…" }'} /></label>
    <small className="hint">{t('conns.sa.hint')}</small>
  </div>;
}

function ConnEditor({ c, api }: { c: Conn; api: EditorApi }) {
  const { Secrets, uid } = core, { PROVIDERS, listModels, streamChat } = engine, { TEXT_PROVIDER_KINDS, tplList, instructName } = adv;
  const redraw = useBump(), alive = useRef(true);
  const def = PROVIDERS[c.provider] || PROVIDERS.custom;
  const [models, setModels] = useState<string[] | null>(null), [chips, setChips] = useState(def.models), [model, setModel] = useState(c.model || '');
  const [test, setTest] = useState({ text: '', cls: '' });
  const sv = useDebounced(() => { void api.save(); api.redraw(); }, 300);
  const load = async (quiet: boolean) => {
    try {
      const list = await listModels(c); if (!list.length) throw new Error(t('conns.models.empty'));
      if (!alive.current) return;
      setModels(list); setChips([...new Set([...list, ...def.models])]); if (!quiet) toast(tn('conns.models.loaded', list.length), 'ok');
    } catch (e) { if (!quiet) toast(errMsg(e), 'err'); }
  };
  useLayoutEffect(() => {
    if (!S.settings.activeConn && def.kind !== 'tts') { S.set({ activeConn: c.id }); redraw(); }
    if (c.provider === 'vertexai' && !c.region) c.region = 'global';
    if (c.instruct && c.instruct !== 'plain' && c.instruct !== 'custom') c.instruct = instructName(c.instruct);   // 예전 값(chatml 등)을 템플릿 이름으로
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    alive.current = true;
    if (def.kind !== 'mock' && def.kind !== 'tts' && (c.apiKey || c.serviceAccount || def.keyless) && (c.baseUrl || def.base || def.kind === 'vertex')) void load(true);   // 키가 있으면 항상 실제 목록을 받아 온다
    return () => { alive.current = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const active = c.id === S.settings.activeConn, textKind = TEXT_PROVIDER_KINDS.includes(def.kind);
  const names = (kind: string) => tplList(kind).map(x => [x.name as string, x.name as string] as const);
  const run = async () => {
    setTest({ text: t('conns.test.sending'), cls: '' });
    try { const r = await streamChat(c, { stream: false, maxTokens: 64 }, [{ role: 'user', content: 'Say "hello" in one word.' }]); if (alive.current) setTest({ text: t('conns.test.reply', { text: r.text.trim() || t('conns.test.emptyReply') }), cls: ' ok' }); }
    catch (e) { if (alive.current) setTest({ text: errMsg(e), cls: ' err' }); }
  };
  return <div className="editor">
    <header className="editor-head"><h2>{c.name}</h2><div className="row">
      {def.kind === 'tts' ? <em className="badge">{t('conns.group.voice')}</em> : active ? <em className="badge on">{t('conns.inUse')}</em> : <Btn label={t('conns.use')} ic="check" cls="primary" onClick={() => { S.set({ activeConn: c.id }); api.refresh(); }} />}
      <IconBtn ic="copy" title={t('common.duplicate')} onClick={async () => {
        await S.save('conns', { ...structuredClone(c), id: uid(), name: c.name + t('conns.copySuffix'), apiKey: Secrets.is(c.apiKey) ? '' : c.apiKey, serviceAccount: Secrets.is(c.serviceAccount) ? '' : c.serviceAccount }, true);
        if (Secrets.is(c.apiKey) || Secrets.is(c.serviceAccount)) toast(t('conns.copyNoKey'));
        api.refresh();
      }} />
      <IconBtn ic="trash" title={t('common.delete')} onClick={async () => { if (await confirmBox(t('conns.deleteConfirm', { name: c.name }), t('common.delete'), true)) { await S.remove('conns', c.id); if (active) S.set({ activeConn: core.chatConns()[0]?.id || '' }); api.refresh(); } }} />
    </div></header>
    <div className="form">
      <label className="field half"><span className="field-label">{t('common.name')}</span><input className="inp" defaultValue={c.name} onChange={e => { c.name = e.target.value; sv(); }} /></label>
      <label className="field half"><span className="field-label">{t('conns.provider')}</span><select className="inp" defaultValue={c.provider} onChange={async e => {
        c.provider = e.target.value; c.baseUrl = ''; c.model = PROVIDERS[c.provider].kind === 'mock' ? 'echo' : '';
        if (!c.name || c.name === '새 연결' || c.name === t('core.newConn') || Object.values(PROVIDERS).some(p => p.name === c.name)) c.name = PROVIDERS[c.provider].name;
        await api.save(); api.refresh();
      }}>{GROUPS.map(g => <optgroup label={groupLabel(g)} key={g}>{Object.entries(PROVIDERS).filter(([, p]) => p.group === g).map(([k, p]) => <option value={k} key={k}>{p.name}</option>)}</optgroup>)}</select></label>
    </div>
    {def.kind === 'tts' ? <TtsConnBody c={c} api={api} keyField={<KeyField c={c} def={def} api={api} />} /> : <>
    {def.note && <p className="hint">{def.note}</p>}
    {def.kind !== 'mock' && <Form obj={c} defs={[{ k: 'baseUrl', label: t('conns.url'), ph: def.base || def.ph || 'https://…/v1', hint: def.base ? t('conns.urlHint') : t('conns.urlRequired') }]} onChange={sv} />}
    <KeyField c={c} def={def} api={api} />
    {def.kind === 'vertex' && <div className="card sa-box"><h3 className="form-sec">{t('conns.sa.section')}</h3>
      <p className="hint">{t('conns.sa.sectionHint')}</p>
      <SaField c={c} api={api} />
      <Form obj={c} defs={[{ k: 'region', label: t('conns.region'), type: 'select', opts: ['global', 'us-central1', 'us-east5', 'us-east4', 'us-west1', 'europe-west1', 'europe-west4', 'asia-northeast1', 'asia-northeast3', 'asia-southeast1'], half: true }, { k: 'project', label: t('conns.project'), half: true, ph: t('conns.projectPh') }]} onChange={sv} /></div>}
    <div className="field"><span className="field-label">{t('conns.model')}</span>
      <div className="row"><input className="inp" list={'models-' + c.id} value={model} placeholder={def.kind === 'azure' ? t('conns.deployName') : t('conns.modelId')} autoComplete="off" spellCheck={false} onChange={e => { setModel(e.target.value); c.model = e.target.value.trim(); sv(); }} />
        <datalist id={'models-' + c.id}>{(models || def.models).map(m => <option value={m} key={m} />)}</datalist>
        <Btn label={t('conns.models.load')} ic="refresh" cls="ghost" onClick={() => void load(false)} /></div>
      <div className="model-chips">{chips.slice(0, 24).map(m => <button key={m} className={'chip' + (c.model === m ? ' on' : '')} onClick={() => { c.model = m; setModel(m); sv(); }}>{m}</button>)}</div></div>
    {def.kind !== 'mock' && <details className="adv"><summary><Icon name="sliders" size={15} />{t('conns.adv.section')}</summary><Form obj={c} defs={[
      { k: 'proxy', label: t('conns.adv.proxy'), type: 'check', hint: t('conns.adv.proxyHint') },
      def.kind === 'anthropic' && { k: 'cache', label: t('conns.adv.cache'), type: 'check', hint: t('conns.adv.cacheHint') },
      (def.kind === 'openai' || def.kind === 'azure') && { k: 'postProcess', label: t('conns.adv.postProcess'), type: 'select', opts: [['none', t('common.none')], ['merge', t('conns.adv.ppMerge')], ['semi', t('conns.adv.ppSemi')], ['strict', t('conns.adv.ppStrict')], ['single', t('conns.adv.ppSingle')]], hint: t('conns.adv.postProcessHint') },
      textKind && { k: 'instruct', label: t('conns.adv.instruct'), type: 'select', half: true, opts: [['', t('conns.adv.followFormat')], ['plain', t('conns.adv.instructPlain')], ['custom', t('conns.adv.instructCustom')], ...names('instruct')], hint: t('conns.adv.instructHint') },
      textKind && { k: 'context', label: t('conns.adv.context'), type: 'select', half: true, opts: [['', t('conns.adv.followFormat')], ...names('context')], hint: t('conns.adv.contextHint') },
      { k: 'extraBody', label: t('conns.adv.extraBody'), type: 'area', rows: 3, ph: '{ "provider": { "order": ["…"] } }', hint: t('conns.adv.extraBodyHint') },
      { k: 'extraHeaders', label: t('conns.adv.extraHeaders'), type: 'area', rows: 2, ph: t('conns.adv.extraHeadersPh') }]} onChange={sv} /></details>}
    <div className="row"><Btn label={t('conns.test.run')} ic="play" onClick={() => void run()} /><div className={'test-out' + test.cls}>{test.text}</div></div>
    </>}
  </div>;
}

function ConnsPage({ arg }: { arg?: unknown }) {
  const { PROVIDERS } = engine;
  return <LibraryPage<Conn> arg={arg} title={t('conns.title')} eyebrow="connect" coll="conns" ic="plug" create={() => core.newConn()} label={c => c.name}
    sub={c => `${PROVIDERS[c.provider]?.name || c.provider}${c.model ? ' · ' + c.model : ''}${c.id === S.settings.activeConn ? ' · ' + t('conns.inUse') : ''}`}
    empty={t('conns.empty')}
    actions={[{ ic: 'folder', title: t('conns.profiles'), onclick: () => go('quick', 'profiles') }]}
    editor={(c, api) => <ConnEditor c={c} api={editorApi(api, 'conns')} />} />;
}
