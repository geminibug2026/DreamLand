// 고급 포맷팅: 컨텍스트 템플릿 · 인스트럭트 템플릿 · 시스템 프롬프트 · 추론 · 그 밖의 설정 (프롬프트 조립은 옛 advanced.js 가 맡는다)
import { Fragment, useState, type ReactNode } from 'react';
import { mod } from '../legacy';
import { Btn, IconBtn } from '../kit';
import { LForm, PageHead, S, confirmBox, core, errMsg, promptBox, toast, type Conn, type FormDef, type FormDefs, type Obj, type Opt } from '../studio/bridge';

type Kind = 'context' | 'instruct' | 'sysprompt' | 'reasoning';
interface Tpl { name: string; builtin?: boolean; edited?: boolean; [k: string]: unknown }
interface Named extends Obj { name: string }
interface FormatState {
  context: Named; instruct: Named & { enabled?: boolean }; sysprompt: Named; reasoning: Named;
  storyMode?: boolean; stopStrings?: string[]; modelMap?: Record<string, { instruct: string; context: string }>;
}
interface Resolved { instruct: { name?: string } | null; context: { name?: string }; why?: string }
interface AdvMod {
  AF(): FormatState; KINDS: Record<Kind, string>; TEXT_PROVIDER_KINDS: string[];
  tplList(kind: Kind): Tpl[]; tplCurrent(kind: Kind): Tpl; tplSave(kind: Kind, t: Tpl): void; tplDelete(kind: Kind, name: string): void; tplApply(kind: Kind, name: string): void;
  tplDirty(kind: Kind): boolean; tplIsBuiltin(kind: Kind, name: string): boolean; tplImport(json: unknown, fileName?: string): { kind: Kind; name: string }[];
  masterExport(): unknown; resolve(conn: Conn): Resolved;
}
interface EngineMod { PROVIDERS: Record<string, { kind: string }> }

// 화면을 떠났다 돌아와도 남는 탭
let afTab = 'context';
const TABS = [['context', '컨텍스트 템플릿'], ['instruct', '인스트럭트 템플릿'], ['sysprompt', '시스템 프롬프트'], ['reasoning', '추론'], ['misc', '그 밖의 설정']] as const;
const NAMES_OPTS: Opt[] = [['none', '붙이지 않기'], ['force', '그룹 채팅에서만'], ['always', '항상']];
const ROLE_OPTS: Opt[] = [[0, '시스템'], [1, '사용자'], [2, '어시스턴트']];
const seq = (k: string, label: string, hint?: string, o: Partial<FormDef> = {}): FormDef => ({ k, label, type: 'area', rows: 2, half: true, hint, ...o });

export const page = { name: 'format', Component: Format, needs: ['advanced', 'engine'] };

/** 템플릿 고르기 · 저장 · 이름 바꾸기 · 가져오기 · 내보내기 · 되돌리기 · 삭제 */
function TplBar({ kind, redraw }: { kind: Kind; redraw: () => void }) {
  const A = mod<AdvMod>('advanced'), C = core();
  const cur = A.AF()[kind], list = A.tplList(kind), known = list.some(t => t.name === cur.name), mine = list.filter(t => !t.builtin), stock = list.filter(t => t.builtin);
  const opt = (t: Tpl) => <option key={t.name} value={t.name}>{t.name + (t.edited ? ' (고침)' : '')}</option>;
  const saveAs = async () => { const name = (await promptBox('새 템플릿 이름', cur.name ? cur.name + ' (사본)' : ''))?.trim(); if (!name) return; A.tplSave(kind, { ...A.tplCurrent(kind), name }); cur.name = name; S().set({}); toast(`"${name}" 으로 저장했어요`, 'ok'); redraw(); };
  const rename = async () => { const old = cur.name, name = (await promptBox('템플릿 이름', old))?.trim(); if (!name || name === old) return; A.tplSave(kind, { ...A.tplCurrent(kind), name }); if (old && !A.tplIsBuiltin(kind, old)) A.tplDelete(kind, old); cur.name = name; S().set({}); redraw(); };
  const bring = async () => {
    const files = await C.pickFiles({ accept: '.json', multiple: true }); let n = 0;
    for (const f of files) { try { const got = A.tplImport(JSON.parse(await f.text()), f.name); n += got.length; const hit = got.find(g => g.kind === kind); if (hit) A.tplApply(kind, hit.name); } catch (e) { toast(`${f.name}: ${errMsg(e)}`, 'err'); } }
    if (n) { toast(`템플릿 ${n}개를 가져왔어요`, 'ok'); redraw(); }
  };
  const revert = async () => {
    if (!known) return toast('보관함에 없는 설정이에요');
    const stockOnly = A.tplIsBuiltin(kind, cur.name) && list.find(t => t.name === cur.name)?.edited;
    if (stockOnly && await confirmBox(`"${cur.name}" 을(를) 기본값으로 되돌릴까요? 고쳐서 저장한 내용은 사라집니다.`, '기본값으로')) A.tplDelete(kind, cur.name);
    A.tplApply(kind, cur.name); redraw();
  };
  const del = async () => {
    if (!known || A.tplIsBuiltin(kind, cur.name)) return toast('기본 제공 템플릿은 지울 수 없어요. 고친 내용은 되돌리기로 지웁니다.');
    if (!(await confirmBox(`"${cur.name}" 템플릿을 삭제할까요?`, '삭제', true))) return;
    A.tplDelete(kind, cur.name); A.tplApply(kind, A.tplList(kind)[0].name); redraw();
  };
  return <div className="af-bar">
    <select className="inp" title={`지금 쓰는 ${A.KINDS[kind]}`} value={known ? cur.name : ''} onChange={e => { A.tplApply(kind, e.target.value); redraw(); }}>
      {!known && <option value="">{cur.name ? `${cur.name} (보관함에 없음)` : '(저장하지 않은 설정)'}</option>}
      {mine.length ? <optgroup label="내 템플릿">{mine.map(opt)}</optgroup> : null}<optgroup label="기본 제공">{stock.map(opt)}</optgroup>
    </select>
    <em className="badge af-dirty" hidden={!A.tplDirty(kind)}>저장 안 됨</em>
    <div className="af-tools">
      <IconBtn ic="check" title="지금 내용을 이 템플릿에 저장" onClick={() => { if (!cur.name) return void saveAs(); A.tplSave(kind, A.tplCurrent(kind)); toast(`"${cur.name}" 템플릿을 저장했어요`, 'ok'); redraw(); }} />
      <IconBtn ic="edit" title="이름 바꾸기" onClick={() => void rename()} />
      <IconBtn ic="copy" title="다른 이름으로 저장" onClick={() => void saveAs()} />
      <IconBtn ic="upload" title="템플릿 가져오기 (실리태번 JSON)" onClick={() => void bring()} />
      <IconBtn ic="import" title="템플릿 내보내기 (실리태번 JSON)" onClick={() => C.download(`${cur.name || A.KINDS[kind]}.json`, JSON.stringify(A.tplCurrent(kind), null, 4))} />
      <IconBtn ic="refresh" title="저장된 값으로 되돌리기" onClick={() => void revert()} />
      <IconBtn ic="trash" title="템플릿 삭제" onClick={() => void del()} />
    </div>
  </div>;
}

function Format() {
  const [, setTick] = useState(0), [epoch, setEpoch] = useState(0);
  const A = mod<AdvMod>('advanced'), C = core();
  const F = A.AF(), conn = S().conn(), def = conn && mod<EngineMod>('engine').PROVIDERS[conn.provider], textConn = !!def && A.TEXT_PROVIDER_KINDS.includes(def.kind);
  const redraw = () => setEpoch(n => n + 1);                       // 폼까지 새로 만든다 (옛 refresh)
  const ch = () => { S().set({}); setTick(n => n + 1); };           // 저장하고 상태 줄 · 저장 안 됨 표시만 다시
  const form = (obj: object, defs: FormDefs) => <LForm obj={obj} defs={defs} onChange={ch} />;
  const card = (cls: string, ...kids: ReactNode[]) => <div className={`card af-card ${cls}${!textConn && conn && cls.includes('af-tc') ? ' af-dim' : ''}`.replace(/\s+/g, ' ').trim()}>{kids.map((k, i) => <Fragment key={i}>{k}</Fragment>)}</div>;
  const bar = (kind: Kind) => <TplBar kind={kind} redraw={redraw} />;

  let status: ReactNode;
  if (!conn) status = '연결이 아직 없어요. 텍스트 완성형 연결(KoboldCpp · llama.cpp · 텍스트 완성 등)을 추가하면 아래 템플릿으로 프롬프트를 조립합니다.';
  else if (!textConn) status = <><b>{conn.name}</b> 은(는) 채팅 완성형 연결이라 흐리게 표시된 항목은 쓰이지 않습니다. 프롬프트는 프리셋의 블록으로 조립돼요.</>;
  else if (F.storyMode === false) status = <><b>{conn.name}</b> · 스토리 스트링 조립이 꺼져 있어 프리셋 블록을 인스트럭트 형식으로 이어 붙입니다.</>;
  else { const r = A.resolve(conn); status = <><b>{conn.name}</b>{' · 인스트럭트 '}<em className={'badge' + (r.instruct ? ' on' : '')}>{r.instruct ? r.instruct.name || '저장하지 않은 설정' : '꺼짐'}</em>{' 컨텍스트 '}<em className="badge on">{r.context.name || '저장하지 않은 설정'}</em>{r.why ? ` — ${r.why}` : ''}</>; }

  let pane: ReactNode;
  if (afTab === 'context') pane = <>
    {card('af-tc', bar('context'), form(F.context, [
      { k: 'story_string', label: '스토리 스트링', type: 'area', rows: 9, hint: '{{#if 이름}}…{{/if}} 로 내용이 있을 때만 넣습니다. 쓸 수 있는 이름: system · description · personality · scenario · persona · wiBefore(loreBefore) · wiAfter(loreAfter) · anchorBefore · anchorAfter · mesExamples · mesExamplesRaw · char · user. {{trim}} 은 앞뒤 줄바꿈을 지웁니다.' },
      { k: 'story_string_position', label: '위치', type: 'select', opts: [[0, '기본 (컨텍스트 맨 위)'], [1, '대화 중간 @ 깊이']], third: true }, { k: 'story_string_depth', label: '깊이', type: 'num', min: 0, third: true }, { k: 'story_string_role', label: '역할', type: 'select', opts: ROLE_OPTS, third: true },
      { k: 'example_separator', label: '예시 구분자', half: true, hint: '대화 예시 블록마다 앞에 들어갑니다.' }, { k: 'chat_start', label: '대화 시작 표시', half: true, hint: '예시와 실제 대화 사이에 들어갑니다.' },
      { k: 'use_stop_strings', label: '구분자를 중단 문자열로 쓰기', type: 'check', hint: '대화 시작 표시와 예시 구분자' }, { k: 'names_as_stop_strings', label: '이름을 중단 문자열로 쓰기', type: 'check', hint: '모델이 내 대사를 대신 쓰지 않게' }]))}
    {card('', form(F, [{ section: '컨텍스트 서식' },
      { k: 'alwaysForceName2', label: '프롬프트 끝에 항상 캐릭터 이름 붙이기', type: 'check', hint: '인스트럭트를 끈 텍스트 완성형에서' }, { k: 'singleLine', label: '요청마다 한 줄만 생성', type: 'check' }, { k: 'collapseNewlines', label: '연속된 줄바꿈 합치기', type: 'check', hint: '텍스트 완성형은 보내는 프롬프트에도 적용' },
      { k: 'trimSpaces', label: '앞뒤 공백 다듬기', type: 'check' }, { k: 'trimSentences', label: '끊긴 문장 잘라 내기', type: 'check' }, { k: 'fixMarkdown', label: '닫히지 않은 * 와 따옴표 자동으로 닫기', type: 'check' },
      { k: 'storyMode', label: '텍스트 완성형 연결은 스토리 스트링으로 조립', type: 'check', hint: '끄면 프리셋 블록을 그대로 이어 붙입니다' }]))}
    {card('', form(F, [{ section: '채팅 완성형에서 쓰는 표시' }, { k: 'ccExampleSep', label: '예시 대화 머리말', half: true, ph: '[Example dialogue]', hint: '캐릭터 카드의 <START> 자리에 들어갑니다.' }, { k: 'ccChatStart', label: '새 대화 표시', half: true, ph: '[Start a new chat]', hint: '기록의 맨 앞에 한 번 들어갑니다. 비우면 넣지 않아요.' }]))}
  </>;
  else if (afTab === 'instruct') pane = <>
    {card('af-tc', form(F.instruct, [{ k: 'enabled', label: '인스트럭트 모드 사용', type: 'check', live: true, hint: '끄면 "이름: 대사" 형식으로 보냅니다' }, { k: 'bind_to_context', label: '컨텍스트 템플릿과 묶기', type: 'check', hint: '인스트럭트 템플릿을 고르면 같은 이름의 컨텍스트 템플릿도 함께 고릅니다' }]),
      bar('instruct'), form(F.instruct, [
        { k: 'activation_regex', label: '활성화 정규식', ph: '예: /llama(-)?[3|3.1]/i', hint: '연결의 모델 이름이 이 정규식에 맞으면 이 템플릿을 자동으로 씁니다 (인스트럭트 모드가 켜져 있을 때).' },
        { k: 'wrap', label: '시퀀스를 줄바꿈으로 감싸기', type: 'check' }, { k: 'macro', label: '시퀀스 안의 매크로 바꾸기', type: 'check' }, { k: 'sequences_as_stop_strings', label: '시퀀스를 중단 문자열로 쓰기', type: 'check' }, { k: 'skip_examples', label: '대화 예시는 시퀀스로 감싸지 않기', type: 'check' },
        { k: 'names_behavior', label: '이름 붙이기', type: 'select', opts: NAMES_OPTS, half: true }]))}
    {card('af-tc af-seq', form(F.instruct, [
      { section: '스토리 스트링 시퀀스' }, seq('story_string_prefix', '스토리 스트링 접두', '스토리 스트링 앞에 (기본 위치일 때만)'), seq('story_string_suffix', '스토리 스트링 접미', '스토리 스트링 뒤에'),
      { section: '사용자 메시지 시퀀스' }, seq('input_sequence', '사용자 메시지 접두', '사용자 메시지 앞 · 대필할 때의 마지막 줄'), seq('input_suffix', '사용자 메시지 접미'),
      { section: '어시스턴트 메시지 시퀀스' }, seq('output_sequence', '어시스턴트 메시지 접두', '어시스턴트 메시지 앞 · 답변을 받을 마지막 줄'), seq('output_suffix', '어시스턴트 메시지 접미'),
      { section: '시스템 메시지 시퀀스' }, seq('system_sequence', '시스템 메시지 접두', '작가 노트 · 로어북처럼 대화 중간에 끼우는 시스템 메시지 앞'), seq('system_suffix', '시스템 메시지 접미'),
      { k: 'system_same_as_user', label: '시스템 메시지를 사용자 메시지와 같은 시퀀스로', type: 'check' },
      { section: '기타 시퀀스' }, seq('first_output_sequence', '첫 어시스턴트 접두', '대화의 첫 메시지가 어시스턴트일 때'), seq('last_output_sequence', '마지막 어시스턴트 접두', '답변을 받을 마지막 줄. 비우면 어시스턴트 메시지 접두'),
      seq('first_input_sequence', '첫 사용자 접두', '대화의 첫 메시지가 사용자일 때'), seq('last_input_sequence', '마지막 사용자 접두', '마지막 사용자 메시지 앞 · 대필할 때의 마지막 줄'),
      seq('last_system_sequence', '시스템 지시 접두', '번역 · 요약 같은 보조 호출의 마지막 줄'), seq('stop_sequence', '중단 시퀀스', '이 문자열이 나오면 그 뒤는 잘라 냅니다'),
      seq('user_alignment_message', '사용자 채움 메시지', '대화가 사용자 메시지로 시작하지 않으면 맨 앞에 끼웁니다', { half: false })]))}
  </>;
  else if (afTab === 'sysprompt') pane = card('af-tc', form(F.sysprompt, [{ k: 'enabled', label: '시스템 프롬프트 사용', type: 'check', hint: '스토리 스트링의 {{system}} 자리에 들어갑니다' }]), bar('sysprompt'),
    form(F.sysprompt, [{ k: 'content', label: '프롬프트 내용', type: 'area', rows: 9, hint: '캐릭터 카드에 메인 프롬프트 덮어쓰기가 있으면 그것이 먼저입니다 ({{original}} 은 이 내용으로 바뀜).' }, { k: 'post_history', label: '후속 지시', type: 'area', rows: 4, hint: '대화 기록 맨 끝에 사용자 메시지로 들어갑니다.' }]),
    <p className="hint">채팅 완성형 연결은 프리셋의 메인 프롬프트 · 후속 지시 블록을 씁니다.</p>);
  else if (afTab === 'reasoning') pane = <>
    {card('', form(F.reasoning, [{ k: 'autoParse', label: '자동 분리', type: 'check', hint: '답변 앞의 접두 … 접미 사이를 생각 과정으로 떼어 냅니다. 접두와 접미가 모두 있어야 해요' }, { k: 'autoExpand', label: '자동으로 펼치기', type: 'check' }, { k: 'addToPrompts', label: '프롬프트에 다시 넣기', type: 'check', hint: '지난 답변의 생각 과정을 아래 서식으로 감싸 함께 보냅니다' }, { k: 'maxAdditions', label: '다시 넣을 최대 개수', type: 'num', min: 0, third: true, hint: '마지막 메시지부터 셉니다.' }]))}
    {card('', <h3 className="form-sec">추론 서식</h3>, bar('reasoning'), form(F.reasoning, [{ k: 'prefix', label: '접두', type: 'area', rows: 2, third: true, hint: '생각 과정 앞' }, { k: 'suffix', label: '접미', type: 'area', rows: 2, third: true, hint: '생각 과정 뒤' }, { k: 'separator', label: '구분', type: 'area', rows: 2, third: true, hint: '생각 과정과 답변 사이' }]))}
  </>;
  else {
    const model = conn?.model || '', map = F.modelMap || {}, bound = !!map[model];
    const stops = (v: string) => { v = v.trim(); let list: string[] | null = null; if (v.startsWith('[')) { try { const j: unknown = JSON.parse(v); if (Array.isArray(j)) list = j.filter((x): x is string => typeof x === 'string' && !!x); } catch { /* JSON 이 아니면 줄 단위로 읽는다 */ } } F.stopStrings = list || v.split('\n').map(x => x.trim()).filter(Boolean); ch(); };
    const bind = (on: boolean) => { F.modelMap ||= {}; if (on) F.modelMap[model] = { instruct: F.instruct.enabled ? F.instruct.name : '', context: F.context.name }; else delete F.modelMap[model]; ch(); };
    pane = <>
      {card('', <h3 className="form-sec">사용자 정의 중단 문자열</h3>, <label className="field"><textarea className="inp" rows={3} spellCheck={false} placeholder={'한 줄에 하나씩, 또는 ["Ford", "BMW"] 같은 JSON 배열'} defaultValue={(F.stopStrings || []).join('\n')} onChange={e => stops(e.target.value)} /><small className="hint">모든 프리셋과 연결에 함께 적용됩니다. 줄바꿈은 \n 으로 적습니다.</small></label>, form(F, [{ k: 'stopMacro', label: '중단 문자열 안의 매크로 바꾸기', type: 'check', hint: '{{user}} · {{char}}' }]))}
      {card('', form(F, [{ section: '토큰' }, { k: 'tokenPadding', label: '토큰 여유분', type: 'num', half: true, hint: '토큰 수를 어림하므로 컨텍스트에서 이만큼 남겨 둡니다.' }]))}
      {card('', form(F, [{ section: '응답 시작 문구' }, { k: 'startReplyWith', label: '답변을 이 글로 시작하게 하기', type: 'area', rows: 2, hint: '프리셋에 프리필이 있으면 그것이 먼저입니다. 프리필을 받지 않는 모델(최신 Claude 등)에서는 자동으로 빠집니다.' }, { k: 'showBias', label: '응답 시작 문구를 답변에 보이기', type: 'check' }]))}
      {card('', form(F, [{ section: '마크다운으로 해석하지 않을 문자열' }, { k: 'mdEscape', label: '쉼표로 구분 (사이에 공백 없이)', ph: '***,---', hint: '한 줄이 통째로 이 문자열이면 구분선이나 강조로 바꾸지 않고 글자 그대로 보여 줍니다.' }]))}
      {card('af-tc', <h3 className="form-sec">모델에 템플릿 묶기</h3>, <p className="hint">{model ? `지금 모델: ${model}` : '모델이 선택된 연결이 없어요.'}</p>,
        model ? <label className="check" key={bound ? `on:${map[model].instruct}:${map[model].context}` : 'off'}><input type="checkbox" checked={bound} onChange={e => bind(e.target.checked)} /><i /><span>이 모델을 쓸 때는 지금 고른 인스트럭트 · 컨텍스트 템플릿을 자동으로 쓰기</span>{bound && <small>{`${map[model].instruct || '인스트럭트 꺼짐'} · ${map[model].context || '컨텍스트 그대로'}`}</small>}</label> : null,
        Object.keys(map).length ? <div className="af-map">{Object.entries(map).map(([m, v]) => <button key={m} className="chip on" title="눌러서 풀기" onClick={() => { delete map[m]; ch(); }}>{`${m} → ${v.instruct || '꺼짐'} / ${v.context || '그대로'} ✕`}</button>)}</div> : null)}
    </>;
  }

  const bringAll = async () => {
    const files = await C.pickFiles({ accept: '.json', multiple: true }); let n = 0;
    for (const f of files) { try { n += A.tplImport(JSON.parse(await f.text()), f.name).length; } catch (e) { toast(`${f.name}: ${errMsg(e)}`, 'err'); } }
    if (n) { toast(`${n}개 항목을 가져왔어요`, 'ok'); redraw(); }
  };
  return <section className="pagebox af">
    <PageHead eyebrow="advanced formatting" title="고급 포맷팅">
      <Btn label="전체 가져오기" ic="upload" cls="ghost" title="고급 포맷팅 전체 내보내기 파일 · 낱개 템플릿 파일 · settings.json" onClick={() => void bringAll()} />
      <Btn label="전체 내보내기" ic="import" cls="ghost" title="지금 고른 템플릿 넷과 응답 시작 문구를 한 파일로" onClick={() => C.download('dreamland-advanced-formatting.json', JSON.stringify(A.masterExport(), null, 4))} />
    </PageHead>
    <p className="hint af-status">{status}</p>
    <div className="tabs">{TABS.map(([k, l]) => <button key={k} className={'tab' + (afTab === k ? ' on' : '')} onClick={() => { afTab = k; redraw(); }}>{l}</button>)}</div>
    <div className="af-pane" key={afTab + ':' + epoch}>{pane}</div>
  </section>;
}
