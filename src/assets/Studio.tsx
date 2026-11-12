// 기능 화면 › 에셋: 프롬프트 · 에셋 · 렌더링 · 도구
import { Fragment, useEffect, useRef, useState, type CSSProperties, type ReactElement } from 'react';
import { Avatar, Btn, Icon } from '../kit';
import { B } from '../addons/legacy';
import { Check, PathIcon, Select, openModal, useRedraw } from '../addons/parts';
import { A, DEFAULT_PRESETS, MACROS, PATHS, SAMPLE, STYLES, cfg, charCfg, copy, exportPreset, exportSettings, exportZip, importPresets, importSettings, presetOf, renderPrompt, save } from './logic';
import { Manager, Sec } from './Manager';
import { SBtn, Tiny } from './windows';

let sub = 'prompt';
const asMax = (px: string) => ({ '--as-max': px }) as CSSProperties;
const Lines = () => <span className="ast-lines"><i /><i /><i /><i /></span>;

export function AssetsStudio() {
  // draw: 옛 draw() 처럼 탭 안을 새로 만든다 · soft: 값만 다시 읽어 그린다
  const [gen, setGen] = useState(0), draw = () => setGen(g => g + 1), soft = useRedraw();
  const area = useRef<HTMLTextAreaElement>(null);
  const S = B.S, As = A(), { toast, confirmBox, promptBox } = B.ui;
  const pickChar = () => { const c = cfg(), { chat } = B.chat.current(); return S.get('chars', c.ui.char) || S.get('chars', chat?.charIds?.[0]) || S.chars[0] || null; };
  useEffect(() => {
    let alive = true; const first = pickChar();
    As.load([...(first ? [As.ownerOfChar(first.id)] : []), ...S.personas.map(p => As.ownerOfPersona(p.id))]).then(() => { if (alive) draw(); }).catch(e => console.warn('[에셋]', e));
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const c = cfg(), char = pickChar(), p = presetOf();
  const owner = char ? As.ownerOfChar(char.id) : '', cc = char ? charCfg(char.id) : null;
  if (char && cc && cc.link && (cc.link === char.id || !S.get('chars', cc.link))) cc.link = '';
  const src = owner ? As.source(owner) : '', linked = !!owner && src !== owner, linkChar = linked ? S.get('chars', cc?.link) : undefined, ver = cc?.ver || '';
  const cur = B.chat.current().chat;
  const persona = S.get('personas', c.ui.persona) || (cur ? S.persona(cur) : undefined) || S.get('personas', S.settings.activePersona as string) || S.personas[0];
  const owners = char ? [owner, ...(persona ? [As.ownerOfPersona(persona.id)] : [])] : [];
  const copyPrompt = () => void copy(renderPrompt(owners, char?.id), '안내문을 복사했어요');

  const act = char ? As.active(owner) : [], all = char ? As.inVer(src, ver) : [];
  const status = <div className="ast-status">
    {char ? <Avatar o={char} cls="sm" /> : <div className="avatar sm">?</div>}
    <div className="ast-status-main">
      {S.chars.length ? <Select value={char?.id} opts={S.chars.map(x => [x.id, x.name] as const)} cls="ast-charsel" onChange={async v => { c.ui.char = v; save(); await As.load([As.ownerOfChar(v)]); draw(); }} /> : <b>캐릭터 없음</b>}
      <span className="ast-status-sum">{!char ? '캐릭터를 만들면 에셋을 올릴 수 있어요.' : <><b>{`에셋 ${all.length}개`}</b>{` · 켜짐 ${act.length}개 · 키워드 ${new Set(act.map(a => As.baseOf(a.name))).size}개`}{ver ? <em className="badge">{`버전 ${ver}`}</em> : ''}{linked ? <em className="badge on">{`${linkChar?.name} 에셋 빌림`}</em> : ''}</>}</span>
    </div>
    <div className="ast-actions"><Btn label="안내문 복사" ic="copy" title="지금 캐릭터로 빈칸을 채운 안내문을 복사합니다" onClick={copyPrompt} /></div>
  </div>;

  // ── 프롬프트 ──
  const promptTab = () => {
    const isDefault = /^d\d$/.test(p.id);
    return <div className="card ast-card">
      <div className="ast-sec">
        <Sec ic={<Icon name="note" size={16} />} title="이미지 출력 안내문" desc="AI 가 대화 흐름에 맞는 {{img::이름}} 태그를 고르도록 알려 줍니다.">
          {isDefault && <Btn label="기본값" ic="refresh" title="이 프리셋을 처음 내용으로 되돌립니다" onClick={async () => { if (await confirmBox(`"${p.name}" 을(를) 처음 내용으로 되돌릴까요?`, '되돌리기')) { p.prompt = DEFAULT_PRESETS[+p.id.slice(1)].prompt; save(); draw(); } }} />}
          <Btn label="키워드 교체" ic="sparkle" title="안내문 속 {{img_keywords}} 를 지금 이름 목록으로 바꿔 적습니다" onClick={() => {
            if (!/\{\{img_keywords(_autogen)?\}\}/i.test(p.prompt)) return toast('안내문에 {{img_keywords}} 가 없어요');
            const list = As.names(owners).join(', '); if (!list) return toast('이 캐릭터에는 켜진 에셋이 없어요');
            p.prompt = p.prompt.replace(/\{\{img_keywords(_autogen)?\}\}/gi, list); save(); draw(); toast('키워드 목록으로 바꿔 적었어요', 'ok');
          }} />
        </Sec>
        <div className="ast-inject">
          <Check label="대화할 때 이 안내문을 자동으로 넣기" on={c.inject} onChange={v => { c.inject = v; save(); soft(); }} hint="에셋이 하나도 없으면 넣지 않습니다. {{img_inprompt}} 를 직접 쓴다면 꺼 주세요." />
          <label className="field inline"><span className="field-label">답변당 최대 개수</span><input className="inp" type="number" min={1} max={6} defaultValue={c.max ?? 2} onChange={e => { c.max = Math.min(6, Math.max(1, Math.round(+e.target.value) || 1)); save(); }} /></label>
          <label className="field inline"><span className="field-label">넣는 깊이</span><input className="inp" type="number" min={0} max={20} defaultValue={c.depth ?? 2} title="마지막 메시지에서 몇 번째 앞에 넣을지" onChange={e => { c.depth = Math.min(20, Math.max(0, Math.round(+e.target.value) || 0)); save(); }} /></label>
        </div>
        <div className="ast-preset-row"><span className="field-label">프리셋</span><Select value={c.preset} opts={c.presets.map(x => [x.id, x.name] as const)} onChange={v => { c.preset = v; save(); draw(); }} /></div>
        <div className="ast-btngrid">
          <Btn label="새 프리셋" ic="plus" onClick={async () => {
            const name = (await promptBox('새 프리셋 이름', ''))?.trim(); if (!name) return;
            if (c.presets.some(x => x.name === name)) return toast('같은 이름의 프리셋이 있어요', 'err');
            const id = 'p' + Date.now().toString(36); c.presets.push({ id, name, prompt: p.prompt }); c.preset = id; save(); draw(); toast('지금 안내문을 복사해 새 프리셋을 만들었어요', 'ok');
          }} />
          <Btn label="이름 변경" ic="edit" onClick={async () => {
            const name = (await promptBox('프리셋 이름', p.name))?.trim(); if (!name || name === p.name) return;
            if (c.presets.some(x => x.name === name)) return toast('같은 이름의 프리셋이 있어요', 'err');
            p.name = name; save(); draw();
          }} />
          <Btn label="삭제" ic="trash" cls="danger" onClick={async () => {
            if (c.presets.length <= 1) return toast('마지막 프리셋은 지울 수 없어요');
            if (!(await confirmBox(`"${p.name}" 프리셋을 삭제할까요?`, '삭제', true))) return;
            c.presets = c.presets.filter(x => x !== p); c.preset = c.presets[0].id; save(); draw();
          }} />
          <Btn label="미리 보기" ic="eye" onClick={() => openModal({ title: `${char?.name || '캐릭터 없음'} · 채운 안내문`, wide: true, spec: 'pre.ast-preview' }, () => renderPrompt(owners, char?.id))} />
        </div>
        <textarea className="inp ast-prompt" ref={area} defaultValue={p.prompt} rows={16} spellCheck={false} onChange={e => { p.prompt = e.target.value; save(); }} />
        <div className="ast-macros">{MACROS.map(([m, d]) => <button key={m} type="button" className="ast-macro" title={d + ' · 눌러서 넣기'} onClick={() => { const ta = area.current; if (!ta) return; const at = ta.selectionStart ?? ta.value.length; ta.setRangeText(m, at, ta.selectionEnd ?? at, 'end'); ta.focus(); p.prompt = ta.value; save(); }}><code>{m}</code><span>{d}</span></button>)}</div>
        <div className="ast-btngrid two">
          <SBtn label="프리셋 내보내기" d={PATHS.down} onClick={exportPreset} />
          <Btn label="프리셋 불러오기" ic="import" onClick={() => void importPresets(draw)} />
        </div>
      </div>
    </div>;
  };

  // ── 에셋 ──
  const assetsTab = () => {
    if (!char || !cc) return <div className="card ast-card"><p className="dim ast-empty">먼저 캐릭터를 만들어 주세요.</p></div>;
    const others = S.chars.filter(x => x.id !== char.id);
    const vers = [...new Set([...cc.vers, ...(linked ? charCfg(cc.link).vers : []), ...(ver ? [ver] : [])])];
    const setVer = (v: string) => { cc.ver = v; save(); draw(); };
    const lockMsg = linked ? `「${linkChar?.name}」의 에셋을 빌려 쓰는 중이라 올리기 · 삭제 · 정돈이 잠겨 있어요. 링크를 풀거나 그 캐릭터에서 바꿔 주세요.` : '';
    return <div className="ast-stack">
      <div className="card ast-card ast-two">
        <div className="ast-sec">
          <Sec ic={<PathIcon d={PATHS.link} size={16} />} title="에셋 링크" desc="다른 캐릭터의 에셋을 빌려 씁니다. 같은 그림을 두 번 저장하지 않아 용량을 아낍니다." />
          <div className="ast-row">
            <Select value={cc.link || ''} opts={[['', '사용 안 함 (자기 에셋 사용)'], ...others.map(x => [x.id, x.name] as const)]} onChange={async v => { cc.link = v; save(); await As.load([owner]); draw(); }} />
            <Tiny title="링크 풀기" onClick={() => { if (!cc.link) return; cc.link = ''; save(); draw(); }}><Icon name="x" size={14} /></Tiny>
          </div>
          <small className="ast-info">{linked ? `「${linkChar?.name}」의 ${ver ? `"${ver}" 버전 ` : ''}에셋 ${As.inVer(src, ver).length}개를 빌려 쓰는 중` : '지금은 이 캐릭터의 에셋을 씁니다.'}</small>
        </div>
        <div className="ast-sec">
          <Sec ic={<PathIcon d={PATHS.layers} size={16} />} title="에셋 버전" desc="한 캐릭터의 에셋을 여러 벌로 나눠 관리합니다. (예: 평상복 / 교복 / 공통)" />
          <div className="ast-row">
            <Select value={ver} opts={[['', '기본'], ...vers.map(v => [v, v] as const)]} onChange={setVer} />
            <Tiny title="새 버전 추가" onClick={async () => {
              const name = (await promptBox('새 버전 이름', ''))?.trim(); if (!name) return;
              if (vers.includes(name)) return toast('같은 이름의 버전이 있어요', 'err');
              cc.vers.push(name); setVer(name);
            }}><Icon name="plus" size={14} /></Tiny>
            <Tiny title="지금 버전 이름 바꾸기" onClick={async () => {
              if (!ver) return toast('기본 버전은 이름을 바꿀 수 없어요'); if (linked) return toast(lockMsg);
              const name = (await promptBox('버전 이름', ver))?.trim(); if (!name || name === ver) return;
              if (vers.includes(name)) return toast('같은 이름의 버전이 있어요', 'err');
              for (const a of As.inVer(owner, ver)) await As.update({ ...a, ver: name });
              cc.vers = cc.vers.map(v => v === ver ? name : v); setVer(name);
            }}><Icon name="edit" size={14} /></Tiny>
            <Tiny title="지금 버전 삭제" cls="bad" onClick={async () => {
              if (!ver) return toast('기본 버전은 지울 수 없어요'); if (linked) return toast(lockMsg);
              const list = As.inVer(owner, ver);
              if (!(await confirmBox(`"${ver}" 버전을 삭제할까요? 이 버전에 든 에셋 ${list.length}개도 함께 지워집니다.`, '삭제', true))) return;
              for (const a of list) await As.remove(a);
              cc.vers = cc.vers.filter(v => v !== ver); setVer('');
            }}><Icon name="trash" size={14} /></Tiny>
          </div>
          <small className="ast-info">{ver ? `"${ver}" 버전을 쓰는 중 · 대화에는 이 버전의 에셋만 나옵니다.` : '기본 버전을 쓰는 중'}</small>
        </div>
      </div>
      <div className="card ast-card"><Manager owner={owner} ver={ver} src={src} locked={linked} lockMsg={lockMsg} title={`${char.name}의 에셋`} onChange={soft} /></div>
    </div>;
  };

  // ── 렌더링 ──
  const renderTab = () => {
    const sample = (char && As.active(owner)[0]?.data) || SAMPLE;
    return <div className="card ast-card">
      <div className="ast-sec">
        <Sec ic={<Icon name="sparkle" size={16} />} title="대화에 보이는 방식" desc={<span>답변 속 <code>{'{{img::이름}}'}</code> 태그가 그 자리에서 캐릭터의 그림으로 바뀝니다.</span>} />
        <div className="ast-toggles">
          <Check label="무작위 에셋" on={c.random} onChange={v => { c.random = v; save(); soft(); }} hint="같은 묶음(angry_1, angry_2 …)이 있으면 AI 에게는 angry 만 알려 주고, 보여 줄 때 묶음에서 하나를 고릅니다" />
          <Check label="그림 늦게 불러오기" on={c.lazy !== false} onChange={v => { c.lazy = v; save(); soft(); }} hint="그림이 많은 긴 대화에서 스크롤이 가벼워집니다" />
          <Check label="눌러서 크게 보기" on={c.zoom !== false} onChange={v => { c.zoom = v; save(); soft(); }} hint="대화 속 에셋 그림을 누르면 크게 열립니다" />
        </div>
        <div className="field"><span className="field-label">최대 크기</span>
          <div className="range"><input type="range" min={120} max={900} step={20} defaultValue={c.maxSize} onChange={e => { c.maxSize = +e.target.value; save(); soft(); }} /><output>{`${c.maxSize}px`}</output></div>
          <small className="hint">그림의 가장 긴 가로 길이. 플로팅 · 시네마틱은 이 값에 맞춰 비율로 줄어듭니다.</small></div>
      </div>
      <div className="ast-sec">
        <Sec ic={<Icon name="image" size={16} />} title="표시 스타일" desc="하나를 고르면 지금부터 보이는 모든 에셋 그림에 적용됩니다." />
        <div className="ast-styles">{STYLES.map(([id, name, desc]) => <button key={id} type="button" className={'ast-style' + (c.style === id ? ' on' : '')} onClick={() => { c.style = id; save(); draw(); }}>
          <span className={'ast-pv' + (id.startsWith('float') ? ' side' + (id === 'float-right' ? ' r' : '') : '')}><span className={`asset-frame as-${id}`} style={asMax('104px')}><img className="asset-img" alt="" src={sample} /></span>{id.startsWith('float') ? <Lines /> : null}</span>
          <b>{name}</b><small>{desc}</small></button>)}</div>
        <div className="ast-live-wrap"><span className="ast-live-tag">미리 보기</span>
          <div className="ast-live"><p><Lines /></p><p><span className={'asset-frame as-' + (/^[\w-]+$/.test(c.style || '') ? c.style : 'ink')} style={asMax((Math.round(+c.maxSize) || 400) + 'px')}><img className="asset-img" alt="" src={sample} /></span></p><p><Lines /></p></div></div>
      </div>
    </div>;
  };

  // ── 도구 ──
  const toolsTab = () => <div className="ast-stack">
    <div className="card ast-card">
      <div className="ast-sec">
        <Sec ic={<Icon name="user" size={16} />} title="페르소나 에셋" desc="캐릭터 에셋에서 못 찾은 이름은 페르소나 에셋에서 찾습니다. 모든 캐릭터에 두루 쓸 그림을 여기에 올려 주세요." />
        {persona ? <div className="ast-row"><Avatar o={persona} cls="xs" /><Select value={persona.id} opts={S.personas.map(x => [x.id, x.name] as const)} onChange={async v => { c.ui.persona = v; save(); await As.load([As.ownerOfPersona(v)]); draw(); }} /></div> : null}
      </div>
      {persona ? <Manager owner={As.ownerOfPersona(persona.id)} title={`${persona.name}의 에셋`} /> : <p className="dim ast-empty">페르소나가 없어요.</p>}
    </div>
    <div className="card ast-card">
      <div className="ast-sec">
        <Sec ic={<Icon name="folder" size={16} />} title="백업과 내보내기" desc="에셋 ZIP 과 이 기능의 설정을 내보내고 되돌립니다." />
        <div className="ast-btngrid">
          <SBtn label="에셋 ZIP 내보내기" d={PATHS.zip} title="고른 캐릭터의 모든 에셋(모든 버전)을 ZIP 으로 내려받습니다" onClick={() => char ? void exportZip(char) : toast('캐릭터가 없어요')} />
          <Btn label="안내문 복사" ic="copy" onClick={copyPrompt} />
          <SBtn label="설정 백업" d={PATHS.down} title="프리셋 · 캐릭터별 링크와 버전 · 표시 옵션을 JSON 으로 내보냅니다" onClick={exportSettings} />
          <Btn label="설정 복원" ic="import" onClick={() => void importSettings(draw)} />
        </div>
      </div>
    </div>
    <div className="card ast-card">
      <div className="ast-sec">
        <Sec ic={<Icon name="book" size={16} />} title="쓰는 법" desc="태그와 빈칸을 빠르게 확인합니다." />
        <details className="ast-details" open><summary>기본 사용법</summary><ol>
          <li>위에서 캐릭터를 고르고 에셋 탭에서 이미지나 ZIP 을 올립니다. 파일 이름이 키워드가 됩니다.</li>
          <li>프롬프트 탭에서 안내문 프리셋을 고릅니다. 자동으로 넣기를 켜 두면 따로 할 일이 없습니다.</li>
          <li>AI 가 <code>{'{{img::이름}}'}</code> 을 쓰면 그 자리에 그림이 보입니다. 렌더링 탭에서 스타일을 고를 수 있어요.</li></ol></details>
        <details className="ast-details"><summary>이름 규칙</summary><ul>
          <li><code>joy.png</code> → 키워드 joy</li>
          <li><code>joy_1.png</code>, <code>joy-2.png</code>, <code>joy.3.png</code> → joy 한 묶음 (번호 변형)</li>
          <li>태그에 확장자를 붙여도(<code>{'{{img::joy.png}}'}</code>) 같은 그림을 찾습니다.</li></ul></details>
        <details className="ast-details"><summary>빈칸(매크로)</summary><div className="ast-macros plain">{MACROS.map(([m, d]) => <div key={m} className="ast-macro"><code>{m}</code><span>{d}</span></div>)}</div></details>
        <details className="ast-details"><summary>명령어</summary><ul>
          <li><code>/assets-upload label=키워드 주소</code> — 주소의 이미지를 지금 대화의 캐릭터 에셋으로 올립니다.</li>
          <li><code>/assets-gallery</code> — 지금 대화 캐릭터의 갤러리를 엽니다.</li>
          <li><code>/refresh-img-keywords</code> — 에셋 보관함을 다시 읽습니다.</li></ul></details>
      </div>
    </div>
  </div>;

  const TABS: [string, string, string, () => ReactElement][] = [['prompt', '프롬프트', 'note', promptTab], ['assets', '에셋', 'folder', assetsTab], ['render', '렌더링', 'sparkle', renderTab], ['tools', '도구', 'gear', toolsTab]];
  return <>
    {status}
    <div className="ast-tabs" role="tablist">{TABS.map(([k, l, ic]) => <button key={k} type="button" role="tab" className={sub === k ? 'on' : undefined} onClick={() => { sub = k; draw(); }}><Icon name={ic} size={16} /><span>{l}</span></button>)}</div>
    <Fragment key={sub + ':' + gen}>{(TABS.find(t => t[0] === sub) || TABS[0])[3]()}</Fragment>
  </>;
}
