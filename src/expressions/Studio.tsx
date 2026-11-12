// 기능 › 표정: 세트 · 판정 · 표시
import { useEffect, useRef, useState, type DragEvent, type ReactNode } from 'react';
import { Avatar, Btn, Icon, IconBtn } from '../kit';
import type { CharX } from '../addons/types';
import { errMsg } from '../addons/parts';
import { Check, Field, Select, openModal, useRedraw, type Opt } from '../addons/parts';
import { ALIASES, DEFAULT_LABELS, canonLabel, cleanLabel, keywordLabel, plainText } from './pure';
import { CALL_PROMPT, MODES, Sprites, TAG_PROMPT, bus, candidates, cfg, charCfg, clip, customOf, fallbackOf, fullName, nameOf, save, tagInstruction, universe } from './store';
import { exportZip, importFiles } from './upload';
import { S, pickFiles } from '../lib/core';
import { modal } from '../ui/dom';
import { charPicker, confirmBox, promptBox, toast } from '../ui';
import { macro, quickCall, tokens } from '../lib/engine';
import { chatApi } from '../chat/actions';

function Range({ value, min, max, step, unit, onChange }: { value: number; min: number; max: number; step: number; unit: string; onChange: (v: number) => void }) {
  return <div className="range"><input type="range" min={min} max={max} step={step} value={value} onChange={e => onChange(+e.target.value)} /><output>{value + unit}</output></div>;
}
const SecHead = ({ title, desc, children }: { title: string; desc?: string; children?: ReactNode }) => {
  const side = Array.isArray(children) ? children.some(Boolean) : !!children;
  return <div className="exs-sec-head"><div><h4>{title}</h4>{desc ? <p>{desc}</p> : null}</div>{side ? <div className="exs-actions">{children}</div> : null}</div>;
};
const bigImage = (title: string, src: string) => { const img = document.createElement('img'); img.className = 'full-img'; img.src = src; img.alt = ''; modal({ title, wide: true, body: img }); };

/** 한 감정의 그림들: 더하기 · 옮기기 · 지우기 · (사용자 정의면) 이름과 키워드 */
function labelDialog(char: CharX, label: string, onChange: () => void) {
  openModal({ title: `${char.name} · ${fullName(label)}`, wide: true, spec: 'div.exs-detail' }, close => <LabelDetail char={char} label={label} onChange={onChange} close={close} />);
}
function LabelDetail({ char, label, onChange, close }: { char: CharX; label: string; onChange: () => void; close: () => void }) {
  const redraw = useRedraw(), c = cfg();
  const changed = () => { redraw(); onChange(); bus.sync(); };
  const add = async () => { if (await importFiles(char.id, await pickFiles({ accept: 'image/*,.zip', multiple: true }), { label })) changed(); };
  const list = Sprites.of(char.id, label), custom = customOf(label), cc = charCfg(char.id), isFb = fallbackOf(char.id) === label;
  return <>
    <div className="exs-detail-top">
      <p className="hint">{list.length > 1 ? `그림 ${list.length}장 — 이 감정이 나올 때마다 그 가운데 한 장이 보입니다.` : list.length ? '그림 1장. 더 올리면 그때그때 한 장씩 골라 보여 줍니다.' : '아직 그림이 없어요. 이 감정이 나오면 가까운 감정이나 기본 표정의 그림이 대신 보입니다.'}</p>
      <div className="exs-actions"><Btn label="그림 더하기" ic="upload" onClick={() => void add()} />
        {list.length ? <Btn label={isFb ? '기본 표정으로 쓰는 중' : '기본 표정으로'} ic="star" cls={isFb ? 'ghost' : ''} title="판정된 감정이 없거나 맞는 그림이 없을 때 보여 줄 표정" onClick={() => { cc.fallback = label; save(); changed(); }} /> : null}</div>
    </div>
    {list.length ? <div className="exs-detail-grid">{list.map(a => <figure key={a.id} className="exs-fig-card">
      <button type="button" className="exs-thumb big" title="크게 보기" onClick={() => bigImage(a.name, a.data)}><img src={a.data} alt="" loading="lazy" /></button>
      <figcaption><span title={a.name}>{a.name}</span>
        <Select cls="exs-move" value={label} opts={universe(char.id).map(l => [l, l === label ? '옮기기…' : fullName(l)] as const)} onChange={async v => { if (v === label) return; await Sprites.update(char.id, { ...a, label: v }); toast(`${nameOf(v)}(으)로 옮겼어요`); changed(); }} />
        <IconBtn ic="trash" title="이 그림 지우기" cls="tiny" onClick={async () => { if (!(await confirmBox(`"${a.name}" 그림을 지울까요?`, '지우기', true))) return; await Sprites.remove(char.id, a); changed(); }} /></figcaption>
    </figure>)}</div> : null}
    {custom ? <div className="exs-custom">
      <h4>사용자 정의 감정</h4>
      <Field label="화면에 보일 이름"><input className="inp" defaultValue={custom.name || ''} placeholder={label} onChange={e => { custom.name = e.target.value.trim(); save(); onChange(); }} /></Field>
      <Field label="키워드 (쉼표로 구분)" hint="키워드로 추정할 때 답변에 이 낱말이 있으면 이 감정으로 봅니다."><input className="inp" defaultValue={custom.keys || ''} placeholder="예: 으쓱, 우쭐, smug" onChange={e => { custom.keys = e.target.value; save(); }} /></Field>
      <div className="exs-actions"><Btn label="이 감정 삭제" ic="trash" cls="danger" onClick={async () => {
        if (!(await confirmBox(`"${label}" 감정을 목록에서 뺄까요? 캐릭터들에 올린 그림은 지워지지 않고, 그림이 있는 캐릭터에서는 계속 보입니다.`, '삭제', true))) return;
        c.custom = c.custom.filter(x => x.label !== label); save(); close(); onChange();
      }} /></div>
    </div> : null}
  </>;
}

// 화면을 떠났다 돌아와도 남는 보기 상태
const view = { sub: 'set', filter: 'all', query: '' };
const pickChar = (): CharX | null => { const c = cfg(), { chat } = chatApi.current(); return S.get('chars', c.ui.char) || S.get('chars', chat?.charIds?.[0]) || [...S.chars].sort((a, b) => (c.chars[b.id]?.n || 0) - (c.chars[a.id]?.n || 0))[0] || null; };
const dragOver = (e: DragEvent<HTMLElement>, stop = false) => { e.preventDefault(); if (stop) e.stopPropagation(); e.currentTarget.classList.add('over'); };
const dragLeave = (e: DragEvent<HTMLElement>) => e.currentTarget.classList.remove('over');

// ── 세트 ──
function SetTab({ char, draw }: { char: CharX | null; draw: () => void }) {
  const prog = useRef<HTMLDivElement>(null), bar = useRef<HTMLElement>(null);
  if (!char) return <div className="card exs-card"><p className="dim exs-empty">먼저 캐릭터를 만들어 주세요.</p></div>;
  const c = cfg(), pick = pickFiles, list = Sprites.list(char.id), have = Sprites.labels(char.id);
  const progress = (n: number, total: number) => { prog.current?.classList.toggle('on', n < total); if (bar.current) bar.current.style.width = Math.round(n / Math.max(1, total) * 100) + '%'; };
  const add = async (files: File[], label = '') => { if (!files?.length) return; prog.current?.classList.add('on'); if (bar.current) bar.current.style.width = '4%'; try { await importFiles(char.id, files, { label, onProgress: progress }); } finally { prog.current?.classList.remove('on'); } draw(); };
  const cc = charCfg(char.id), all = universe(char.id), fb = fallbackOf(char.id);
  const hit = (l: string) => { const q = view.query.trim().toLowerCase(); return (!q || (l + ' ' + nameOf(l) + ' ' + (ALIASES[l] || '')).toLowerCase().includes(q)) && (view.filter === 'all' || (view.filter === 'have') === have.includes(l)); };
  const addLabel = async () => {
    const v = await promptBox('새 감정 이름 (영문 · 한글 · 숫자)', '', { placeholder: '예: smug, 졸림' }); if (v == null) return;
    const lab = cleanLabel(v); if (!lab) return toast('이름을 적어 주세요', 'err');
    if (universe(char.id).includes(lab)) return toast('이미 있는 감정이에요', 'err');
    const known = canonLabel(lab, DEFAULT_LABELS); if (known && !(await confirmBox(`"${lab}"은(는) 기본 감정 ${fullName(known)}의 다른 이름으로 알아봅니다. 그래도 따로 만들까요?`, '따로 만들기'))) return;
    c.custom.push({ label: lab, name: '', keys: '' }); save(); view.filter = 'all'; view.query = ''; draw(); labelDialog(char, lab, draw);
  };
  const chips = [['all', `전체 ${all.length}`], ['have', `그림 있음 ${all.filter(l => have.includes(l)).length}`], ['none', `비어 있음 ${all.filter(l => !have.includes(l)).length}`]];
  const fbOpts: Opt[] = [['', `전체 설정 따름 (${c.fallback === '#none' ? '없음' : nameOf(c.fallback)})`], ['#none', '없음 — 카드 초상 그대로'], ...all.filter(l => have.includes(l)).map(l => [l, fullName(l)] as const)];
  return <div className="card exs-card">
    <div className="exs-sec">
      <SecHead title={`${char.name}의 표정 세트`} desc="감정마다 그림을 올립니다. 한 감정에 여러 장을 올리면 그때그때 한 장씩 보입니다.">
        <Btn label="올리기" ic="upload" onClick={async () => add(await pick({ accept: 'image/*', multiple: true }))} />
        <Btn label="폴더" ic="folder" title="실리태번 스프라이트 폴더(characters/이름)를 통째로 고릅니다. 휴대폰에서는 ZIP 을 써 주세요" onClick={async () => add(await pick({ dir: true, multiple: true }))} />
        <Btn label="ZIP" ic="import" title="스프라이트 묶음 ZIP 가져오기" onClick={async () => add(await pick({ accept: '.zip,application/zip' }))} />
        {list.length ? <Btn label="내보내기" ic="import" cls="ghost" title="실리태번 스프라이트 폴더에 그대로 넣을 수 있는 ZIP" onClick={() => exportZip(char)} /> : null}
        {list.length ? <Btn label="모두 지우기" ic="trash" cls="ghost" onClick={async () => { if (!(await confirmBox(`${char.name}의 표정 그림 ${list.length}장을 모두 지울까요? 되돌릴 수 없어요.`, '지우기', true))) return; await Sprites.clear(char.id); toast('표정 그림을 모두 지웠어요', 'ok'); bus.sync(); draw(); }} /> : null}
      </SecHead>
      <div className="dropzone small exs-drop" onClick={async () => add(await pick({ accept: 'image/*,.zip', multiple: true }))} onDragOver={e => dragOver(e)} onDragLeave={dragLeave}
        onDrop={e => { e.preventDefault(); e.currentTarget.classList.remove('over'); void add([...e.dataTransfer.files]); }}>
        <Icon name="upload" size={22} /><b>표정 그림을 끌어다 놓거나 눌러서 올리기</b><span>여러 장 · ZIP 한꺼번에. 파일 이름으로 감정을 맞춥니다 — joy.png, joy-1.png, anger_2.webp, 기쁨.png</span></div>
      <div className="exs-prog" ref={prog}><i ref={bar} /></div>
    </div>
    <div className="exs-sec">
      <div className="exs-toolbar">
        <div className="search-wrap"><Icon name="search" size={16} /><input className="inp" placeholder="감정 찾기 (기쁨, joy, happy …)" value={view.query} onChange={e => { view.query = e.target.value; draw(); }} /></div>
        <div className="exs-seg">{chips.map(([k, l]) => <button key={k} type="button" className={view.filter === k ? 'on' : undefined} onClick={() => { view.filter = k; draw(); }}>{l}</button>)}</div>
      </div>
      <div className="exs-grid">
        {all.filter(hit).map(l => {
          const imgs = Sprites.of(char.id, l), custom = !DEFAULT_LABELS.includes(l);
          return <button key={l} type="button" className={'exs-label' + (imgs.length ? '' : ' empty')} title={imgs.length ? `${fullName(l)} · 그림 ${imgs.length}장` : `${fullName(l)} · 그림 없음`} onClick={() => labelDialog(char, l, draw)}
            onDragOver={e => dragOver(e, true)} onDragLeave={dragLeave} onDrop={e => { e.preventDefault(); e.stopPropagation(); e.currentTarget.classList.remove('over'); void add([...e.dataTransfer.files], l); }}>
            <span className="exs-thumb">{imgs.length ? <img src={imgs[0].data} alt="" loading="lazy" /> : <i>✦</i>}{imgs.length > 1 ? <span className="exs-count">{`${imgs.length}장`}</span> : null}{fb === l && imgs.length ? <span className="exs-fb">기본</span> : null}</span>
            <span className="exs-label-cap"><b>{nameOf(l)}</b><small>{custom ? (nameOf(l) === l ? '사용자 정의' : `${l} · 사용자 정의`) : l}</small></span>
          </button>;
        })}
        <button type="button" className="exs-label add" title="감정 추가" onClick={() => void addLabel()}><span className="exs-thumb"><Icon name="plus" size={22} /></span><span className="exs-label-cap"><b>감정 추가</b><small>사용자 정의</small></span></button>
      </div>
      <div className="exs-fbrow"><Field cls="half" label="이 캐릭터의 기본 표정" hint="판정된 감정이 없거나, 그 감정과 가까운 감정의 그림이 모두 없을 때 보여 줍니다.">
        <Select value={cc.fallback || ''} opts={fbOpts} onChange={v => { cc.fallback = v; save(); bus.sync(); draw(); }} /></Field></div>
    </div>
  </div>;
}

// ── 판정 ──
function DetectTab({ char, draw }: { char: CharX | null; draw: () => void }) {
  const c = cfg(), alive = useRef(true);
  const testIn = useRef<HTMLTextAreaElement>(null), [out, setOut] = useState<ReactNode>(null);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  const show = (n: ReactNode) => { if (alive.current) setOut(n); };
  const conns: Opt[] = [['', '대화에 쓰는 연결 (보조 연결 공통 설정을 따름)'], ...S.conns.map(x => [x.id, `${x.name}${x.model ? ' · ' + x.model : ''}`] as const)];
  const sample = char && Sprites.has(char.id) ? tagInstruction(char, null) : '';
  const showScore = (r: { label: string; scores: Record<string, number> }) => { const top = Object.entries(r.scores).sort((a, b) => b[1] - a[1]).slice(0, 4); show(<><b>{r.label ? fullName(r.label) : '짚이는 감정 없음'}</b>{top.map(([l, s]) => <span key={l} className="chip static">{`${nameOf(l)} ${s.toFixed(1)}`}</span>)}</>); };
  const helpers = (S.settings.helpers || {}) as Record<string, string>;
  return <div className="exs-stack">
    <div className="card exs-card">
      <div className="exs-sec">
        <SecHead title="감정을 정하는 방법" desc="캐릭터의 답변마다 어떤 표정을 보여 줄지 정합니다. 정해진 감정은 메시지에 기록되어 다시 열어도 그대로 보입니다." />
        <div className="exs-modes">{MODES.map(([k, title, desc, cost]) => <button key={k} type="button" className={'exs-mode' + (c.mode === k ? ' on' : '')} onClick={() => { c.mode = k; save(); draw(); }}><b>{title}</b><span>{desc}</span><em>{cost}</em></button>)}</div>
        <Check label="그림이 있는 감정 가운데서만 고르기" on={c.onlyHave} onChange={v => { c.onlyHave = v; save(); draw(); }} hint="끄면 모든 감정에서 고르고, 그림이 없으면 가까운 감정의 그림을 보여 줍니다" />
      </div>
    </div>
    {c.mode === 'tag' ? <div className="card exs-card"><div className="exs-sec">
      <SecHead title="숨은 태그 지시문" desc="답변 요청의 맨 끝에 이 지시가 붙습니다. 표정 그림이 두 가지 이상 있는 캐릭터가 말할 때만 넣습니다."><Btn label="기본값" ic="refresh" cls="ghost" onClick={() => { c.tagPrompt = ''; save(); draw(); }} /></SecHead>
      <textarea className="inp exs-prompt" rows={7} spellCheck={false} value={c.tagPrompt || ''} placeholder={TAG_PROMPT} onChange={e => { c.tagPrompt = e.target.value; save(); draw(); }} />
      <small className="hint">{'{{labels}} 자리에 고를 수 있는 감정 이름이, {{char}} 자리에 말하는 캐릭터 이름이 들어갑니다. 비워 두면 위에 흐리게 보이는 기본 지시문을 씁니다. 태그 모양 <emotion:이름> 은 바꾸지 마세요 — 이 모양이어야 떼어 내고 읽을 수 있습니다.'}</small>
      {sample ? <small className="hint">{`지금 ${char!.name}(으)로 채우면 약 ${tokens(sample).toLocaleString()} 토큰이 답변 요청마다 더 실립니다.`}</small> : char ? <small className="hint">{`${char.name}에게 표정 그림이 두 가지 이상 있어야 지시가 들어갑니다.`}</small> : null}
      <Check label="태그가 빠진 답변은 키워드로 추정하기" on={c.tagFallback} onChange={v => { c.tagFallback = v; save(); draw(); }} />
    </div></div> : null}
    {c.mode === 'call' ? <div className="card exs-card"><div className="exs-sec">
      <SecHead title="따로 묻기" desc="답변이 올 때마다 아래 지시문으로 한 번 더 호출합니다 (답변마다 추가 호출 1회). 표정 그림이 두 가지 이상 있는 캐릭터의 답변에만 묻습니다."><Btn label="기본값" ic="refresh" cls="ghost" onClick={() => { c.callPrompt = ''; save(); draw(); }} /></SecHead>
      <div className="form">
        <Field cls="half" label="판정에 쓸 연결" hint="값싼 모델을 따로 지정해 두면 비용을 아낄 수 있어요."><Select value={helpers.expr || ''} opts={conns} onChange={v => { S.set({ helpers: { ...helpers, expr: v } }); draw(); }} /></Field>
        <Field cls="third" label="함께 보낼 앞 메시지 수"><input className="inp" type="number" min={0} max={6} defaultValue={c.callContext} onChange={e => { c.callContext = Math.max(0, Math.min(6, Math.round(+e.target.value) || 0)); save(); }} /></Field>
        <Field cls="third" label="최대 응답 토큰" hint="생각 과정을 쓰는 모델이면 넉넉히."><input className="inp" type="number" min={16} max={4000} step={10} defaultValue={c.callTokens} onChange={e => { c.callTokens = Math.max(16, Math.round(+e.target.value) || 300); save(); }} /></Field>
      </div>
      <textarea className="inp exs-prompt" rows={6} spellCheck={false} value={c.callPrompt || ''} placeholder={CALL_PROMPT} onChange={e => { c.callPrompt = e.target.value; save(); draw(); }} />
      <small className="hint">{'{{labels}} 자리에 고를 수 있는 감정 이름이, {{char}} 자리에 캐릭터 이름이 들어갑니다. 비워 두면 기본 지시문을 씁니다. 모델은 감정 이름 하나만 답하면 됩니다.'}</small>
    </div></div> : null}
    <div className="card exs-card"><div className="exs-sec">
      <SecHead title="시험해 보기" desc={'키워드 추정은 호출이 없습니다. "모델에게 묻기"는 위의 따로 묻기 지시문으로 한 번 호출합니다.'} />
      <textarea className="inp" rows={3} ref={testIn} placeholder="답변 한 토막을 붙여 넣고 어떤 감정으로 읽히는지 확인해 보세요." />
      <div className="exs-actions">
        <Btn label="키워드로 추정" ic="search" onClick={() => showScore(keywordLabel(testIn.current?.value, { labels: char && c.onlyHave ? candidates(char.id) : [], custom: c.custom }))} />
        <Btn label="모델에게 묻기 (호출 1회)" ic="sparkle" cls="ghost" onClick={async e => {
          const text = testIn.current?.value || '';
          if (!text.trim()) return toast('먼저 글을 적어 주세요');
          const labels = char && candidates(char.id).length > 1 ? candidates(char.id) : universe(char?.id), conn = S.helperConn('expr', chatApi.current().chat);
          if (!conn) return toast('연결된 API 가 없어요', 'err');
          const b = e.currentTarget; b.disabled = true; show('묻는 중…');
          try {
            const sys = macro(String(c.callPrompt || '').trim() || CALL_PROMPT, { char: char?.name || 'the character', user: S.settings.userNameFallback as string | undefined, vars: {} }).replace(/\{\{labels\}\}/gi, labels.join(', '));
            const res = await quickCall(sys, `[Latest reply by ${char?.name || 'the character'}]\n${clip(plainText(text), 1800)}`, { maxTokens: Math.max(16, +c.callTokens || 300), conn });
            const l = canonLabel(res, labels) || canonLabel(res, universe(char?.id));
            show(<><b>{l ? fullName(l) : '답에서 감정을 찾지 못했어요'}</b><span className="chip static">{`모델의 답: ${String(res).slice(0, 60) || '(빈 답)'}`}</span></>);
          } catch (err) { show('실패: ' + errMsg(err)); } finally { b.disabled = false; }
        }} />
      </div>
      <div className="exs-test-out">{out}</div>
    </div></div>
  </div>;
}

// ── 표시 ──
function ViewTab({ char, draw }: { char: CharX | null; draw: () => void }) {
  const c = cfg(), all = universe(char?.id);
  const tog = <K extends 'show' | 'dossier' | 'avatars' | 'fade' | 'multi' | 'standing' | 'dim'>(k: K) => (v: boolean) => { c[k] = v; save(); draw(); };
  return <div className="exs-stack">
    <div className="card exs-card"><div className="exs-sec">
      <SecHead title="대화 화면" desc="표정 그림은 자르거나 늘이지 않고 온전하게 보여 줍니다." />
      <div className="exs-toggles">
        <Check label="표정 보이기" on={c.show} onChange={tog('show')} hint="끄면 표정 그림을 어디에도 보이지 않고, 태그 지시와 추가 호출도 멈춥니다" />
        <Check label="초상 영역에 지금 표정 보이기" on={c.dossier} onChange={tog('dossier')} hint="넓은 화면 왼쪽의 초상이 감정에 따라 바뀝니다" />
        <Check label="메시지 아바타에 그 답변의 표정 보이기" on={c.avatars} onChange={tog('avatars')} hint="아바타가 보이는 화면(대화 모드 · 그룹 채팅)에서, 감정이 기록된 답변만" />
        <Check label="표정이 바뀔 때 부드럽게 넘기기" on={c.fade} onChange={tog('fade')} />
        <Check label="한 감정에 그림이 여러 장이면 번갈아 보이기" on={c.multi} onChange={tog('multi')} hint="끄면 늘 첫 장만 씁니다. 같은 메시지는 다시 열어도 같은 그림입니다" />
      </div>
      <div className="form">
        <Field cls="half" label="아바타에 넣는 방식"><Select value={c.avatarFit} opts={[['contain', '온전하게 (그림 전체가 보임)'], ['cover', '칸에 채우기 (위쪽 기준으로 넘치는 부분은 가려짐)']]} onChange={v => { c.avatarFit = v; save(); draw(); }} /></Field>
        <Field cls="half" label="전체 기본 표정" hint="캐릭터마다 따로 정할 수도 있습니다 (세트 탭)."><Select value={c.fallback} opts={[['#none', '없음 — 카드 초상 그대로'], ...all.map(l => [l, fullName(l)] as const)]} onChange={v => { c.fallback = v; save(); draw(); }} /></Field>
        <Field cls="half" label="올릴 때 줄일 크기 (긴 변, px)" hint="이보다 큰 그림은 비율을 지켜 줄여서 보관합니다. GIF 는 그대로 둡니다."><input className="inp" type="number" min={256} max={4096} step={64} defaultValue={c.maxPx} onChange={e => { c.maxPx = Math.max(256, Math.min(4096, Math.round(+e.target.value) || 1280)); save(); }} /></Field>
      </div>
    </div></div>
    <div className="card exs-card"><div className="exs-sec">
      <SecHead title="스탠딩 보기" desc="화면 한쪽에 큰 초상을 세웁니다. 그룹 채팅에서는 말하는 인물이 앞으로 나옵니다. 표정 그림이 없는 캐릭터는 카드 초상이 섭니다." />
      <div className="exs-toggles">
        <Check label="스탠딩 보기" on={c.standing} onChange={tog('standing')} hint="대화 화면의 초상 아래 꼬리표, 입력창의 + 메뉴, /standing 으로도 켜고 끕니다" />
        <Check label="그룹에서 말하지 않는 인물은 한 걸음 물러나 있기" on={c.dim} onChange={tog('dim')} />
      </div>
      <div className="form">
        <Field cls="half" label="서는 쪽"><Select value={c.side} opts={[['right', '오른쪽'], ['left', '왼쪽 (넓은 화면에서는 초상 영역 위)']]} onChange={v => { c.side = v; save(); draw(); }} /></Field>
        <Field cls="half" label="크기 — 옆 여백에 설 때" hint="화면 높이에 대한 비율"><Range value={c.size} min={30} max={96} step={2} unit="%" onChange={v => { c.size = v; save(); draw(); }} /></Field>
        <Field cls="half" label="크기 — 글 위에 겹칠 때" hint="옆에 설 자리가 없는 좁은 화면 · 휴대폰"><Range value={c.sizeOver} min={20} max={80} step={2} unit="%" onChange={v => { c.sizeOver = v; save(); draw(); }} /></Field>
        <Field cls="half" label="겹칠 때 진하기" hint="글을 가릴 때 얼마나 비쳐 보이게 할지"><Range value={c.overOpacity} min={30} max={100} step={5} unit="%" onChange={v => { c.overOpacity = v; save(); draw(); }} /></Field>
      </div>
    </div></div>
    <div className="card exs-card"><div className="exs-sec">
      <SecHead title="쓰는 법" />
      <ul className="exs-help">
        <li>세트 탭에서 캐릭터를 고르고 표정 그림이나 ZIP 을 올립니다. 파일 이름이 감정이 됩니다.</li>
        <li>판정 탭에서 감정을 정하는 방법을 고릅니다. 처음에는 꺼져 있고, 직접 고를 수도 있습니다.</li>
        <li><code>/emote 기쁨</code> — 마지막 답변의 표정을 바꿉니다. 그룹에서는 <code>/emote 이름: 감정</code>. 비워서 보내면 고르는 창이 열립니다.</li>
        <li>메시지의 ⋯ 메뉴 › 표정 바꾸기로 어느 답변이든 고칠 수 있습니다. 답변을 넘겨 보면(스와이프) 답변마다 기록된 표정이 따라옵니다.</li>
        <li><code>{'{{expression}}'}</code> — 지금 표정의 감정 이름으로 바뀌는 빈칸입니다.</li>
      </ul>
    </div></div>
  </div>;
}

const TABS = [['set', '세트', 'image'], ['detect', '판정', 'sparkle'], ['view', '표시', 'eye']] as const;
export function ExprStudio() {
  const draw = useRedraw();
  useEffect(() => {
    let alive = true; const first = pickChar();
    if (first && !Sprites.has(first.id)) Sprites.load(first.id).then(() => { Sprites.note(first.id); if (alive) draw(); }).catch(e => console.warn('[표정]', e));
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const c = cfg(), char = pickChar();
  const list = char ? Sprites.list(char.id) : [], have = char ? Sprites.labels(char.id) : [];
  const mode = MODES.find(m => m[0] === c.mode) || MODES[0];
  const choose = () => charPicker({ title: '표정을 관리할 캐릭터', multi: false, selected: char ? [char.id] : [], note: x => c.chars[x.id]?.n ? `표정 ${c.chars[x.id].n}장` : '', onDone: async ([id]) => { c.ui.char = id; save(); await Sprites.load(id); draw(); } });
  const sub = TABS.some(t => t[0] === view.sub) ? view.sub : 'set';
  return <>
    <div className="exs-head">
      {char ? <Avatar o={char} cls="sm" /> : <div className="avatar sm">?</div>}
      <div className="exs-head-text"><b>{char ? char.name : '캐릭터 없음'}</b><small>{char ? (list.length ? `그림 ${list.length}장 · 감정 ${have.length}가지` : '아직 표정 그림이 없어요') : '캐릭터를 만들면 표정을 올릴 수 있어요'}<em className="badge">{`판정 · ${mode[1]}`}</em></small></div>
      {S.chars.length > 1 ? <Btn label="캐릭터 고르기" ic="users" onClick={choose} /> : null}
    </div>
    <div className="exs-tabs" role="tablist">{TABS.map(([k, l, ic]) => <button key={k} type="button" role="tab" className={sub === k ? 'on' : undefined} onClick={() => { view.sub = k; draw(); }}><Icon name={ic} size={16} /><span>{l}</span></button>)}</div>
    {sub === 'set' ? <SetTab key={char?.id || ''} char={char} draw={draw} /> : sub === 'detect' ? <DetectTab key={c.mode} char={char} draw={draw} /> : <ViewTab char={char} draw={draw} />}
  </>;
}
