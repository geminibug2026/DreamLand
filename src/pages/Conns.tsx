// API 연결: 제공자 · 주소 · 키(넣은 뒤에는 다시 보여 주지 않는다) · 모델 · 고급 설정 · 연결 테스트
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { L } from '../legacy';
import { Btn, Icon, IconBtn } from '../kit';
import { Form, LibraryPage, confirmBox, toast } from '../ui';
import { NEEDS, adv, core, engine, errMsg, store, type Conn, type Provider } from '../editors/bridge';
import { editorApi, useBump, useDebounced, type EditorApi } from '../editors/parts';

export const page = { name: 'conns', Component: ConnsPage, needs: NEEDS };

const GROUPS = ['주요', '클라우드', '모음 서비스', '내 컴퓨터', '기타'];
/** 화면에 내보일 꼬리: 저장된 키는 끝 네 글자만 */
const keyTail = (c: Conn) => core().Secrets.is(c.apiKey) ? core().Secrets.tail(c.id, 'apiKey') : (String(c.apiKey || '').length > 8 ? String(c.apiKey).slice(-4) : '');
const whereTag = (held: boolean) => held ? '서버 보관' : core().Vault.on ? '암호화' : '브라우저';

/** API 키 칸: 한 번 넣은 키는 다시 보여 주지 않는다. 바꾸려면 새로 넣고, 지우려면 지우기 */
function KeyField({ c, def, api }: { c: Conn; def: Provider; api: EditorApi }) {
  const { Secrets, Vault } = core(), inp = useRef<HTMLInputElement>(null);
  const saved = !!c.apiKey, held = Secrets.is(c.apiKey);
  const commit = async () => {
    const v = inp.current?.value.trim(); if (!v) return;
    try {
      if (Secrets.on) { const hosts = Secrets.hostsFor(c, def.base || ''); if (!hosts.length) return toast('주소를 먼저 넣어 주세요. 키는 그 주소로만 보내도록 묶어 둡니다.', 'err'); c.apiKey = await Secrets.put(c.id, 'apiKey', v, hosts, c.name); }
      else c.apiKey = v;
      await api.save(); toast('키를 저장했어요', 'ok'); api.refresh();
    } catch (e) { toast(errMsg(e), 'err'); }
  };
  const fn = useRef(commit); useLayoutEffect(() => { fn.current = commit; });
  // 칸을 떠나거나 Enter 를 누를 때 저장한다 (글자마다가 아니라)
  useEffect(() => { const el = inp.current, on = () => void fn.current(); el?.addEventListener('change', on); return () => el?.removeEventListener('change', on); }, []);
  const where = held ? `드림랜드 서버에만 보관됩니다 (${(Secrets.items[c.id]?.apiKey?.hosts || []).join(', ') || '주소 미정'} 로만 전송)` : Secrets.ok ? '이 브라우저에 저장돼 있습니다. 잠시 뒤 서버 보관으로 옮겨집니다.' : Vault.on ? '이 브라우저에 암호화되어 저장됩니다.' : '이 브라우저 안에만 저장됩니다. 드림랜드 서버(start.bat)로 열면 서버 보관을 쓸 수 있어요.';
  return <div className="field key-field"><span className="field-label">{def.kind === 'vertex' ? 'API 키 (익스프레스 키 · 서비스 계정을 쓰면 비워 두세요)' : def.keyless ? 'API 키 (없으면 비워 두세요)' : 'API 키'}</span>
    {saved ? <div className="key-state"><Icon name="lock" size={15} /><b>저장됨</b><code>{'••••••••' + (keyTail(c) || '')}</code><span className="key-where">{whereTag(held)}</span>
      <Btn label="지우기" cls="ghost" onClick={async () => { if (!(await confirmBox('이 연결의 API 키를 지울까요?', '지우기', true))) return; if (held) await Secrets.del(c.id, 'apiKey'); c.apiKey = ''; await api.save(); api.refresh(); }} /></div> : null}
    <input className="inp" ref={inp} type="password" autoComplete="off" spellCheck={false} placeholder={saved ? '새 키를 넣으면 지금 키를 바꿉니다' : 'API 키 붙여넣기'} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); void commit(); } }} />
    <small className="hint">{'넣은 키는 다시 보여 주지 않고, 백업 파일에도 들어가지 않습니다. ' + where}</small>
  </div>;
}

/** 서비스 계정 키: 이메일만 보여 주고 본문은 다시 보여 주지 않는다 */
function SaField({ c, api }: { c: Conn; api: EditorApi }) {
  const { Secrets, pickFiles } = core(), ta = useRef<HTMLTextAreaElement>(null);
  const saved = !!c.serviceAccount, held = Secrets.is(c.serviceAccount);
  const email = held ? c.saEmail : (() => { try { return (JSON.parse(c.serviceAccount || '') as { client_email?: string }).client_email; } catch { return saved ? '키 형식 오류' : ''; } })();
  const take = async (text: string) => {
    try {
      const j = engine().parseServiceAccount(text); c.project = j.project_id || c.project || ''; c.saEmail = j.client_email || ''; c.saProject = j.project_id || '';
      c.serviceAccount = Secrets.on ? await Secrets.put(c.id, 'serviceAccount', JSON.stringify(j), ['googleapis.com'], c.saEmail) : JSON.stringify(j);
      await api.save(); toast(`${j.client_email} 키를 저장했어요`, 'ok'); api.refresh();
    } catch (e) { toast(errMsg(e), 'err'); }
  };
  const fn = useRef(take); useLayoutEffect(() => { fn.current = take; });
  useEffect(() => { const el = ta.current, on = () => { if (el?.value.trim()) void fn.current(el.value); }; el?.addEventListener('change', on); return () => el?.removeEventListener('change', on); }, []);
  return <div className="col key-field">
    {saved ? <div className="key-state"><Icon name="lock" size={15} /><b>저장됨</b><code>{email || '서비스 계정'}</code><span className="key-where">{whereTag(held)}</span>
      <Btn label="키 지우기" cls="ghost" onClick={async () => { if (!(await confirmBox('서비스 계정 키를 지울까요?', '지우기', true))) return; if (held) await Secrets.del(c.id, 'serviceAccount'); c.serviceAccount = ''; c.saEmail = ''; c.saProject = ''; await api.save(); api.refresh(); }} /></div> : null}
    <div className="row wrap"><Btn label={saved ? '다른 키 파일로 바꾸기' : '키 파일 가져오기'} ic="import" onClick={async () => { const [f] = await pickFiles({ accept: '.json,application/json' }); if (f) void take(await f.text()); }} /></div>
    <label className="field"><span className="field-label">서비스 계정 키 (JSON 붙여넣기)</span><textarea className="inp" ref={ta} rows={3} spellCheck={false} autoComplete="off" placeholder={saved ? '새 키(JSON)를 붙여넣으면 지금 키를 바꿉니다' : '{ "type": "service_account", "project_id": "…", "private_key": "…", "client_email": "…" }'} /></label>
    <small className="hint">개인 키가 든 본문은 저장한 뒤 다시 보여 주지 않습니다. 화면을 찍어 공유해도 키가 드러나지 않아요.</small>
  </div>;
}

function ConnEditor({ c, api }: { c: Conn; api: EditorApi }) {
  const S = store(), { Secrets, uid } = core(), { PROVIDERS, listModels, streamChat } = engine(), { TEXT_PROVIDER_KINDS, tplList, instructName } = adv();
  const redraw = useBump(), alive = useRef(true);
  const def = PROVIDERS[c.provider] || PROVIDERS.custom;
  const [models, setModels] = useState<string[] | null>(null), [chips, setChips] = useState(def.models), [model, setModel] = useState(c.model || '');
  const [test, setTest] = useState({ text: '', cls: '' });
  const sv = useDebounced(() => { void api.save(); api.redraw(); }, 300);
  const load = async (quiet: boolean) => {
    try {
      const list = await listModels(c); if (!list.length) throw new Error('목록이 비어 있어요');
      if (!alive.current) return;
      setModels(list); setChips([...new Set([...list, ...def.models])]); if (!quiet) toast(`모델 ${list.length}개를 불러왔어요`, 'ok');
    } catch (e) { if (!quiet) toast(errMsg(e), 'err'); }
  };
  useLayoutEffect(() => {
    if (!S.settings.activeConn) { S.set({ activeConn: c.id }); redraw(); }
    if (c.provider === 'vertexai' && !c.region) c.region = 'global';
    if (c.instruct && c.instruct !== 'plain' && c.instruct !== 'custom') c.instruct = instructName(c.instruct);   // 예전 값(chatml 등)을 템플릿 이름으로
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    alive.current = true;
    if (def.kind !== 'mock' && (c.apiKey || c.serviceAccount || def.keyless) && (c.baseUrl || def.base || def.kind === 'vertex')) void load(true);   // 키가 있으면 항상 실제 목록을 받아 온다
    return () => { alive.current = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const active = c.id === S.settings.activeConn, textKind = TEXT_PROVIDER_KINDS.includes(def.kind);
  const names = (kind: string) => tplList(kind).map(t => [t.name, t.name] as const);
  const run = async () => {
    setTest({ text: '보내는 중…', cls: '' });
    try { const r = await streamChat(c, { stream: false, maxTokens: 64 }, [{ role: 'user', content: 'Say "hello" in one word.' }]); if (alive.current) setTest({ text: '응답: ' + (r.text.trim() || '(빈 응답)'), cls: ' ok' }); }
    catch (e) { if (alive.current) setTest({ text: errMsg(e), cls: ' err' }); }
  };
  return <div className="editor">
    <header className="editor-head"><h2>{c.name}</h2><div className="row">
      {active ? <em className="badge on">사용 중</em> : <Btn label="이 연결 사용" ic="check" cls="primary" onClick={() => { S.set({ activeConn: c.id }); api.refresh(); }} />}
      <IconBtn ic="copy" title="복제" onClick={async () => {
        await S.save('conns', { ...structuredClone(c), id: uid(), name: c.name + ' (사본)', apiKey: Secrets.is(c.apiKey) ? '' : c.apiKey, serviceAccount: Secrets.is(c.serviceAccount) ? '' : c.serviceAccount }, true);
        if (Secrets.is(c.apiKey) || Secrets.is(c.serviceAccount)) toast('서버에 보관한 키는 사본에 따라가지 않아요. 사본에 키를 다시 넣어 주세요.');
        api.refresh();
      }} />
      <IconBtn ic="trash" title="삭제" onClick={async () => { if (await confirmBox(`"${c.name}" 연결을 삭제할까요?`, '삭제', true)) { await S.remove('conns', c.id); if (active) S.set({ activeConn: S.conns[0]?.id || '' }); api.refresh(); } }} />
    </div></header>
    <div className="form">
      <label className="field half"><span className="field-label">이름</span><input className="inp" defaultValue={c.name} onChange={e => { c.name = e.target.value; sv(); }} /></label>
      <label className="field half"><span className="field-label">제공자</span><select className="inp" defaultValue={c.provider} onChange={async e => {
        c.provider = e.target.value; c.baseUrl = ''; c.model = PROVIDERS[c.provider].kind === 'mock' ? 'echo' : '';
        if (!c.name || c.name === '새 연결' || Object.values(PROVIDERS).some(p => p.name === c.name)) c.name = PROVIDERS[c.provider].name;
        await api.save(); api.refresh();
      }}>{GROUPS.map(g => <optgroup label={g} key={g}>{Object.entries(PROVIDERS).filter(([, p]) => p.group === g).map(([k, p]) => <option value={k} key={k}>{p.name}</option>)}</optgroup>)}</select></label>
    </div>
    {def.note && <p className="hint">{def.note}</p>}
    {def.kind !== 'mock' && <Form obj={c} defs={[{ k: 'baseUrl', label: '주소', ph: def.base || def.ph || 'https://…/v1', hint: def.base ? '비워 두면 기본 주소를 씁니다. 리버스 프록시 주소를 넣어도 됩니다.' : '이 제공자는 주소를 직접 넣어야 합니다.' }]} onChange={sv} />}
    <KeyField c={c} def={def} api={api} />
    {def.kind === 'vertex' && <div className="card sa-box"><h3 className="form-sec">서비스 계정으로 연결</h3>
      <p className="hint">Google Cloud 에서 받은 서비스 계정 키(.json)를 붙여넣거나 파일로 가져오면, 프로젝트 ID 는 자동으로 채워집니다. Gemini 와 Claude(claude-… 모델 ID) 모두 이 방식으로 쓸 수 있어요.</p>
      <SaField c={c} api={api} />
      <Form obj={c} defs={[{ k: 'region', label: '리전', type: 'select', opts: ['global', 'us-central1', 'us-east5', 'us-east4', 'us-west1', 'europe-west1', 'europe-west4', 'asia-northeast1', 'asia-northeast3', 'asia-southeast1'], half: true }, { k: 'project', label: '프로젝트 ID', half: true, ph: '키에서 자동으로 읽습니다' }]} onChange={sv} /></div>}
    <div className="field"><span className="field-label">모델</span>
      <div className="row"><input className="inp" list={'models-' + c.id} value={model} placeholder={def.kind === 'azure' ? '배포 이름' : '모델 ID'} autoComplete="off" spellCheck={false} onChange={e => { setModel(e.target.value); c.model = e.target.value.trim(); sv(); }} />
        <datalist id={'models-' + c.id}>{(models || def.models).map(m => <option value={m} key={m} />)}</datalist>
        <Btn label="목록 불러오기" ic="refresh" cls="ghost" onClick={() => void load(false)} /></div>
      <div className="model-chips">{chips.slice(0, 24).map(m => <button key={m} className={'chip' + (c.model === m ? ' on' : '')} onClick={() => { c.model = m; setModel(m); sv(); }}>{m}</button>)}</div></div>
    {def.kind !== 'mock' && <details className="adv"><summary><Icon name="sliders" size={15} />고급 설정</summary><Form obj={c} defs={[
      { k: 'proxy', label: '드림랜드 서버를 거쳐 연결', type: 'check', hint: '브라우저에서 직접 연결이 막힐 때(CORS) 켜세요.' },
      def.kind === 'anthropic' && { k: 'cache', label: '프롬프트 캐싱 사용', type: 'check', hint: '같은 앞부분을 반복해 보낼 때 비용을 줄입니다.' },
      (def.kind === 'openai' || def.kind === 'azure') && { k: 'postProcess', label: '메시지 정리 방식', type: 'select', opts: [['none', '없음'], ['merge', '연속된 역할 합치기'], ['semi', '준엄격 (역할 번갈아)'], ['strict', '엄격 (user 먼저 · 역할 번갈아)'], ['single', '단일 user 메시지']], hint: '역할 순서에 까다로운 모델에서 오류가 날 때 바꿔 보세요.' },
      textKind && { k: 'instruct', label: '인스트럭트 템플릿', type: 'select', half: true, opts: [['', '고급 포맷팅 설정을 따름'], ['plain', '인스트럭트 끄기 (이름: 대사)'], ['custom', '고급 포맷팅에서 편집 중인 템플릿 (항상 켬)'], ...names('instruct')], hint: '모델이 학습한 형식에 맞춰 고르세요. 이 연결에서만 따로 씁니다.' },
      textKind && { k: 'context', label: '컨텍스트 템플릿', type: 'select', half: true, opts: [['', '고급 포맷팅 설정을 따름'], ...names('context')], hint: '스토리 스트링과 구분자.' },
      { k: 'extraBody', label: '요청 본문에 덧붙일 값 (JSON)', type: 'area', rows: 3, ph: '{ "provider": { "order": ["…"] } }', hint: '제공자 전용 옵션을 그대로 넘길 때 씁니다.' },
      { k: 'extraHeaders', label: '추가 헤더 (JSON)', type: 'area', rows: 2, ph: '{ "X-Custom": "값" }' }]} onChange={sv} /></details>}
    <div className="row"><Btn label="연결 테스트" ic="play" onClick={() => void run()} /><div className={'test-out' + test.cls}>{test.text}</div></div>
  </div>;
}

function ConnsPage({ arg }: { arg?: unknown }) {
  const S = store(), { PROVIDERS } = engine();
  return <LibraryPage<Conn> arg={arg} title="API 연결" eyebrow="connect" coll="conns" ic="plug" create={() => core().newConn()} label={c => c.name}
    sub={c => `${PROVIDERS[c.provider]?.name || c.provider}${c.model ? ' · ' + c.model : ''}${c.id === S.settings.activeConn ? ' · 사용 중' : ''}`}
    empty="모델에 연결하려면 오른쪽 위의 + 를 눌러 연결을 추가하세요."
    actions={[{ ic: 'folder', title: '연결 프로필 (연결 · 프리셋 · 포맷팅 템플릿 묶음)', onclick: () => L.ui.go('quick', 'profiles') }]}
    editor={(c, api) => <ConnEditor c={c} api={editorApi(api, c.id)} />} />;
}
