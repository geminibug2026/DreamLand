// 장기기억 설정 탭: 설정 찾기 · 설정 세트 · 모든 설정 묶음 · 프롬프트 (부품과 창은 ConfigParts.tsx)
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Btn } from '../../kit';
import { mod } from '../../legacy';
import { S, core, memMod, toast, tokens } from '../bridge';
import type { ChatM, Mem } from '../types';
import { BundleBar, Grid, Ico, M, Note, Num, SX, SearchBox, Sel, Tb, Tog, Txt, applySearch, bundleDefaults, bundleOwner, get, openRepeatFinder, openSideSorter, put, reinject, searchInput, useNative } from './ConfigParts';
import { Sec, busyBtn, ensureCfg, persistMsgs, saveCfg, useBump, type St } from './parts';

export { bundleDefaults, bundleOwner };

// ════════ 기억 · 서술 방식 ════════
const shared = () => ['', memMod().PUBLIC_ONLY, memMod().NARRATOR];
const hasLocal = (mem: Mem | null) => !mem ? false : M().hasChatPerspective ? !!M().hasChatPerspective!(mem) : typeof mem.perspective === 'string';
async function setPersp(st: St, value: string, local: boolean) {
  if (typeof value !== 'string' || (!local && !shared().includes(value))) throw new Error('기억·서술 방식의 선택을 확인해 주세요.');
  if (local && !(st.chat && st.mem)) throw new Error('대화를 먼저 열어 주세요.');
  const Mm = M();
  if (Mm.setPerspectivePreference) await Mm.setPerspectivePreference(st.mem, value, local);
  else { if (!local) { ensureCfg().perspective = value; saveCfg(); } if (st.mem) { if (local) st.mem.perspective = value; else delete st.mem.perspective; await Mm.save(st.mem); } }
  if (st.chat) Mm.override(st.chat.id, null); st.draft = null;   // 고쳐 둔 장부 · 초안은 새 방식과 맞지 않는다
}
function PerspBox({ st }: { st: St }) {
  const { PUBLIC_ONLY, NARRATOR } = memMod(), SHARED = shared();
  const m = ensureCfg(), chat = st.chat, mem = st.mem, local = hasLocal(mem), pv = mem ? M().perspective(mem) : (m.perspective || ''), group = (chat?.charIds || []).length > 1, lead = S().get('chars', chat?.charIds?.[0])?.name || '';
  const opts: [string, string][] = [['', group ? '자동 · 그룹은 공개 기억만' : `자동 · ${lead || '현재 캐릭터'}`], [PUBLIC_ONLY, '공개 기억만'], [NARRATOR, '소설·풀사칭 (모든 인물 참고)']];
  if (local && mem) { const names = new Set(mem.cast.filter(c => !c.disabled).map(c => c.name)); if (lead && !group) names.add(lead); if (mem.perspective && !SHARED.includes(mem.perspective)) names.add(mem.perspective); for (const n of names) opts.push([n, n]); }
  const run = (fn: () => Promise<void>) => void fn().catch((e: Error) => toast(e.message || String(e), 'err')).finally(() => st.draw());
  let help = pv === NARRATOR ? 'AI가 내 캐릭터까지 함께 쓰며 소설처럼 이어가는 대화용입니다. 모든 인물의 기억·속마음을 참고하되, 각 인물이 모르는 비밀은 그 인물에게 넘기지 않습니다. 내 답변 없이 이어갈 때는 최신 AI 본문으로 기억을 찾고, 직접 답변하면 그 내용을 우선합니다.'
    : pv === PUBLIC_ONLY ? '공개된 기억만 꺼냅니다. AI가 내 캐릭터의 행동·감정을 대신 쓰지 않도록 하는 기존 지침을 유지합니다.'
      : pv ? `${pv} 기준으로 공개 기억과 그 인물이 아는 비공개 기억을 꺼냅니다. 비공개 기억은 속뜻과 분위기에만 참고하며, 내 캐릭터는 내가 조종하는 기존 방식을 유지합니다.`
        : group ? '기존 대화 방식입니다. 그룹에서는 공개 기억만 꺼내고, 내 캐릭터는 내가 조종하도록 합니다. AI가 여러 인물을 함께 쓰는 소설형 진행은 위에서 소설·풀사칭을 직접 선택하세요.'
          : `기존 대화 방식입니다. ${lead || '상대 캐릭터'} 기준으로 기억을 꺼내고, 내 캐릭터는 내가 조종하도록 합니다. AI가 내 역할까지 쓰는 소설형 진행은 위에서 소설·풀사칭을 직접 선택하세요.`;
  if (m.authorizePrivate === false && pv !== PUBLIC_ONLY) help += ' 현재 비공개 기억 허용이 꺼져 있어 공개 기억만 참고합니다.';
  return <div className="mm-persp mm-optset">
    <label className="field"><span className="field-label">{local ? '이 대화의 기억·서술 방식' : '기본 기억·서술 방식'}</span>
      <select className="inp" aria-label="기억·서술 방식" defaultValue={pv} onChange={e => { const v = String(e.target.value || ''); run(() => setPersp(st, v, local)); }}>{opts.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></label>
    <label className="check mm-opt"><input type="checkbox" defaultChecked={local} disabled={!(chat && mem)} onChange={e => { const on = e.target.checked; run(() => setPersp(st, on ? pv : (SHARED.includes(m.perspective) ? m.perspective : ''), on)); }} /><i />
      <span className="mm-opt-text"><b>이 대화만 따로 설정</b><small>다른 방식이나 특정 인물 시점을 이 대화에서만 사용할 때 켜세요.</small></span></label>
    <small className="hint">{local ? '이 대화만 별도로 사용합니다. 체크를 끄면 다른 대화와 같은 기본 방식으로 돌아갑니다.' : '기본 방식으로 저장됩니다. 다른 봇·대화로 이동하거나 새로고침해도 유지되며, 따로 설정한 대화만 예외입니다.'}</small>
    <small className="hint">{help}</small><small className="hint">원문·요약에 이미 나온 비밀까지 가리지는 않습니다. 장부를 직접 고정했다면 고정을 해제해야 새 방식이 적용됩니다.</small></div>;
}

// ════════ 프롬프트 ════════
const PROMPT_LABELS: Record<string, string> = { archivist: '사서', supervisor: '장면 연출', chunk: '요약', arc: '연대기' };
const pKey = (k: string) => k === 'archivist' ? 'prompt' : `prompts.${k}`;   // 빈 문자열 = 기본값
const pDef = (k: string) => M().promptDefault?.(k) ?? memMod().PROMPTS[k];
const pOutdated = () => M().promptOutdated ? M().promptOutdated!() : Object.keys(ensureCfg().promptOutdated || {}).filter(k => get(pKey(k)) && get(pKey(k)) !== pDef(k));
function PromptEdit({ st, k, label, rows }: { st: St; k: string; label: string; rows: number }) {
  const bump = useBump(), def = pDef(k), mine = String(get(pKey(k)) || '');
  const set = (ta: HTMLTextAreaElement) => { const v = String(ta.value); put(pKey(k), v === def || !v.trim() ? '' : v); saveCfg(); bump(); };
  const [slow] = useState(() => core().debounce(set, 400));
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    const ta = ref.current; if (!ta) return;
    ta.value = mine || def;   // 글을 자식으로 넣지 않는다 (설정 찾기가 프롬프트 본문까지 훑지 않게)
    const ch = () => set(ta), inp = () => slow(ta);
    ta.addEventListener('change', ch); ta.addEventListener('input', inp);
    return () => { ta.removeEventListener('change', ch); ta.removeEventListener('input', inp); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return <details className="mm-details mm-optset"><summary>{label}<em className="badge on" hidden={!mine}>고침</em></summary><textarea className="inp mm-prompt" rows={rows} ref={ref} />
    <div className="row"><Btn label="기본값" ic="refresh" cls="ghost" onClick={() => {
      const Mm = M();
      if (Mm.resetPrompt) Mm.resetPrompt(k); else { put(pKey(k), ''); const o = ensureCfg().promptOutdated; if (o) delete o[k]; saveCfg(); }
      toast('기본 프롬프트로 복원했습니다.', 'ok'); st.draw();
    }} /><span className="tokbadge">{`≈${tokens(mine || def).toLocaleString()} 토큰`}</span></div></details>;
}

// ════════ 설정 탭 ════════
const shown = new Set<St>();   // 설정 탭을 그린 적 있는 화면들 — 대화를 열어 세트가 바뀌면 다시 그린다
let wired = false;
/** 대화를 열면 그 대화(→ 캐릭터)에 붙인 세트로 설정을 갈아 끼운다. 갈아 끼우는 일 자체는 엔진(Memory.applyBundleForChat)이 맡는다. 시작할 때 한 번 부른다 */
export function installConfigEvents() {
  if (wired) return; wired = true;
  core().on('chat:open', async (chat?: ChatM | null) => {
    try { ensureCfg(); if (!(await M().applyBundleForChat?.(chat))) return; } catch (e) { return console.warn('[장기기억]', e); }
    for (const st of shown) { if (!st.host?.isConnected) { shown.delete(st); continue; } if (st.tab === 'config') st.draw(); }
  });
}

export function Config({ st }: { st: St }) {
  const [hadFocus] = useState(() => !!st.cfgSearch && document.activeElement === st.cfgSearch);
  const root = useRef<HTMLDivElement>(null), prog = useRef<HTMLSpanElement>(null);
  useLayoutEffect(() => { installConfigEvents(); st.cfgRoot = root.current; shown.add(st); applySearch(root.current, searchInput(st)?.value || ''); });
  useEffect(() => { if (hadFocus) setTimeout(() => searchInput(st)?.focus()); }, [hadFocus, st]);
  const banned = useNative<HTMLTextAreaElement>(['change'], ta => { ensureCfg().bannedPhrases = String(ta.value || '').slice(0, 4000); saveCfg(); re(); });
  useLayoutEffect(() => { if (banned.current) banned.current.value = ensureCfg().bannedPhrases || ''; }, [banned]);

  const { LANGS, MEMORY_DEFAULTS } = memMod(), Mm = M();
  const m = ensureCfg(), chat = st.chat, mem = st.mem, re = () => reinject(chat), api = m.embed.mode === 'api';
  const conns: [string, string][] = [['', '대화에 쓰는 연결 사용'], ...SX().conns.map(c => [c.id, `${c.name}${c.model ? ' · ' + c.model : ''}`] as [string, string])];
  const langs: [string, string][] = [...Object.entries(LANGS), ...(LANGS[m.language] || !m.language ? [] : [[m.language, m.language] as [string, string]])];
  const outdated = pOutdated();
  const EMBED_KINDS = mod<{ EMBED_KINDS: Record<string, string> }>('embed').EMBED_KINDS;

  return <div className="mm-view mm-cfg" ref={root}>
    <div className="mm-cfg-tools"><SearchBox st={st} /><BundleBar st={st} /></div>

    <Sec title="기본"><Grid>
      <Tog k="enabled" label="장기기억 사용" hint="끄면 기록과 주입이 모두 중단됩니다." after={() => st.head()} />
      <Tog k="auto" label="자동 기록" hint="AI 응답이 끝날 때마다 자동으로 턴을 기록합니다. 끄면 [지금 기록]으로 수동 기록." />
      <Tog k="supervisor" label="장면 연출 (실험적)" hint="답변이 끝난 뒤 연출 LLM이 다음 장면의 목표·피해야 할 전개를 짧게 계획해 다음 답변에 함께 주입합니다 (추가 호출 1회). 응답 시작은 늦어지지 않습니다." />
      <Tog k="authorizePrivate" label="캐릭터 비공개 기억 허용" hint="아래에서 선택한 범위의 속마음·비밀도 참고합니다. 끄면 소설·풀사칭을 포함한 모든 방식에서 공개 기억만 검색합니다." after={() => st.draw()} />
      <PerspBox st={st} />
      <Tog k="associative" label="연결 회상" hint="직접 찾은 기억의 드문 공통 단서로 관련 기억을 최대 2개 더 후보에 올립니다. 전체 회상 수와 토큰 예산은 유지하며, 비밀 경계는 넘지 않습니다. 추가 API 호출은 없습니다." />
      <Tog k="autoHide" label="요약된 메시지 자동 숨김" hint={<>{'"지금까지의 이야기" 요약이 커버한 옛 메시지를 대화에서 '}<b>숨김</b>{' 처리해 컨텍스트 토큰을 절약합니다. 삭제가 아니라 숨김이며, 도구 탭의 "숨긴 메시지 모두 표시"로 되돌릴 수 있습니다. 최근 메시지는 아래 설정만큼 항상 남깁니다.'}</>}
        after={async on => { if (!on) return; if (chat && mem) { const n = Mm.autoHide(chat, st.msgs); if (n) await persistMsgs(chat, st.msgs); } toast('요약이 커버한 옛 메시지를 숨겼습니다. 도구 탭에서 언제든 해제할 수 있습니다.'); }} />
      <Tog k="refProfile" label="카드·페르소나 참고" hint="사서·요약이 캐릭터 카드와 페르소나 요지를 배경 자료로 참고합니다. 이름·설정 오해가 줄어듭니다." />
      <Tog k="refLore" label="로어북 참고" hint="활성 로어북을 배경 자료로 참고합니다. 로어북이 크면 사서 호출 토큰이 늘어납니다." />
      <Tog k="audit" label="회상 적중 학습" hint="실린 기억이 답변에 실제로 반영됐는지 보고 중요도를 아주 조금씩 올리거나 내립니다. 고정·수동 기억은 건드리지 않습니다." />
      <Tog k="trim" label="기록이 끝난 옛 대화는 보내지 않기" hint="메시지를 숨기지 않고, 보낼 때만 아래 「보낼 최근 메시지 수」만큼 자릅니다." />
      <Sel k="language" label="요약 언어" title="요약·기억이 기록될 언어" opts={langs} />
      <Num k="summaryContextCount" label="이전 요약 참조 수" title="새 요약을 만들 때 참조할 이전 요약 수 (0 = 안 함, -1 = 전체)" min={-1} max={50} step={1} />
      <Num k="preserveRecent" label="최근 메시지 보존 수" title="자동 숨김을 켰을 때 숨기지 않고 원문 그대로 남길 최근 메시지 수" min={1} max={500} step={1} />
      <Num k="recordDelay" label="기록 지연 (턴 수)" title="응답 뒤로 이야기가 N턴 더 진행된 뒤에야 기록합니다 (0 = 바로)" min={0} max={20} step={1} />
      <Num k="keepRecent" label="보낼 최근 메시지 수" title="「기록이 끝난 옛 대화는 보내지 않기」를 켰을 때 AI에게 보낼 최근 메시지 수" min={2} max={2000} step={1} /></Grid>
      <Note><b>최근 메시지 보존 수</b>{'는 "자동 숨김"을 켰을 때만 쓰입니다. 요약은 이 값과 상관없이 요약 주기마다 만들어지고, 옛 메시지는 숨겨져 요약이 대신하며, 최근 N개 메시지는 원문 그대로 남습니다. 이때 '}<b>원문으로 남아 있는 구간만 다루는 요약은 주입하지 않아</b>{' 같은 내용이 두 번 들어가지 않습니다.'}<br />
        <b>기록 지연</b>{'이 0이면 응답이 오자마자 기록합니다. 1 이상이면 그 응답 뒤로 '}<b>이야기가 N턴 더 진행된 뒤에야</b>{' 기록해서, 리롤·분석 QR·지운 메시지에 사서 호출을 쓰지 않습니다. 한 턴은 내 답장 또는 새 응답 중 많은 쪽으로 세므로, '}<b>인풋 없이 전개지시·풀사칭으로만 진행해도</b>{' 정상 동작합니다. 새 대화의 '}<b>그리팅</b>{'은 이 값과 상관없이 이야기가 한 턴 진행된 뒤에 기록합니다.'}</Note>
    </Sec>

    <Sec title="추적 도감" desc="켜면 사서가 대화에서 자동으로 골라내 도감에 기록하고, 매 턴 주입에 포함합니다."><Grid>
      <Tog k="cast" label="인물 도감" hint="새 인물의 프로필과 인물 간 관계를 자동 기록합니다. (세계 탭에서 관리)" />
      <Tog k="lockEdited" label="직접 고친 인물 프로필 자동 고정" hint="인물 카드를 직접 수정하면 자동으로 고정됩니다. 고정된 카드는 사서가 이름·나이·직업·외모·말투·특성을 바꾸지 못하고, 관계만 계속 갱신됩니다. (세계 탭에서 카드별로 직접 잠그거나 풀 수 있습니다)" />
      <Tog k="milestones" label="이벤트 연표" hint="고백·정체 폭로·죽음·되돌릴 수 없는 선택 등 결정적 전환점만 연표로 기록합니다. (이야기 탭에서 관리)" />
      <Tog k="items" label="아이템 도감" hint="의미 있는 선물·전개상 중요한 물건의 소유자와 상태를 추적합니다. (세계 탭에서 관리)" />
      <Tog k="storyClock" label="서사 시계" hint={'"다음 날 아침", "3년 뒤" 같은 이야기 속 경과 시간을 추적합니다. 시간이 크게 흐르면 그 이전 기억은 자연스럽게 옛일로 물러나고, 회상에도 "~3mo ago"처럼 얼마나 옛일인지 표기됩니다.'} /></Grid>
    </Sec>

    <Sec title="모델 (사서 API)" desc="기억 기록·요약을 담당하는 사서가 쓸 API입니다. 저렴하고 빠른 모델을 권장합니다."
      tools={<Btn label="테스트" ic="plug" cls="ghost" title="연결 테스트" onClick={e => {
        const b = e.currentTarget; toast('연결을 테스트합니다…'); void busyBtn(b, async () => {
          try {
            const r = await Mm.call(chat || { charIds: [] }, 'You are a connection test. Reply with exactly: OK', 'ping', 2048);   // 생각하는 모델은 대답 전에 사고 토큰을 쓰므로 넉넉히 준다
            if (String(r).trim()) toast(`연결 성공 — 응답: ${String(r).replace(/\s+/g, ' ').trim().slice(0, 60)}`, 'ok'); else toast('응답이 비어 있습니다. 모델 설정을 확인하세요.');
          } catch (err) { const x = err as Error & { cause?: { message?: string } }; toast(`연결 실패: ${x.cause?.message || x.message}`, 'err'); }
        });
      }} />}>
      <Grid>
        <Sel k="@helpers.memory" label="사서에 쓸 연결" title="기억 기록·요약 호출을 보낼 연결. 주소·키·모델은 연결 화면에서 관리합니다" opts={conns} />
        <Num k="responseTokens" label="사서 최대 토큰" title="사서 응답의 최대 토큰. 요약·기록이 중간에 잘리지 않도록 넉넉하게 잡으세요 (기본 24000)" min={256} max={65536} step={512} />
        <Num k="reasoningHeadroom" label="사고 토큰 여유분" title="추론 모델은 '생각'에 쓴 토큰도 출력 상한을 함께 먹습니다. 이 값만큼 여유를 얹어 응답이 잘리지 않게 합니다." min={0} max={32768} step={1000} /></Grid>
      <Note>{'Gemini Thinking·GPT o 시리즈처럼 '}<b>생각하는 모델</b>{'을 사서로 쓰면, 사고에 쓴 토큰이 출력 상한을 함께 먹어 응답이 중간에 잘립니다('}<code>finishReason: MAX_TOKENS</code>{'). 서고 정리·요약이 "모델 응답 오류"로 실패한다면 이 값을 12000~16000으로 올려 보세요. 상한일 뿐이라 실제로 쓴 만큼만 과금됩니다. 생각하지 않는 모델을 쓴다면 0으로 둬도 됩니다. (기본 8000)'}</Note>
    </Sec>

    <Sec title="의미 검색 임베딩 (선택)" desc="임베딩을 켜면 회상 정확도가 크게 올라갑니다. 동의어·의역도 잡아냅니다. 실패 시 자동으로 내장 검색으로 폴백합니다."><Grid>
      <Sel k="embed.mode" label="임베딩 소스" opts={[['off', '끄기 — 내장 검색만 사용'], ['api', '외부 임베딩 API']]} cls={api ? 'half' : 'third'} after={() => st.draw()} />
      {api ? <Sel k="embed.connId" label="임베딩에 쓸 연결" title="이 연결의 주소와 키를 빌려 씁니다 (임베딩 주소는 방식에 맞게 자동으로 붙입니다)" opts={[['', '골라 주세요'], ...SX().conns.map(c => [c.id, c.name] as [string, string])]} cls="half" /> : null}
      {api ? <Sel k="embed.kind" label="임베딩 방식" title="연결이 어떤 임베딩 주소를 쓰는지. 자동이면 연결의 종류를 보고 고릅니다" opts={Object.entries(EMBED_KINDS)} cls="half" /> : null}
      {api ? <Txt k="embed.model" label="모델" ph="text-embedding-3-small" cls="half" /> : null}
      {api ? <Num k="embed.floor" label="유사도 바닥값" title="이 코사인 값 아래는 '무관'으로 보고 버립니다. 임베딩 모델마다 점수 분포가 달라, 회상이 잘 안 되면 낮춰 보세요." min={0} max={0.9} step={0.05} cls="half" int={false}>
        <small className="hint">OpenAI 계열은 0.35~0.5, bge·e5 계열처럼 점수가 낮게 깔리는 모델은 0.2~0.3이 적당합니다. 회상이 안 되면 낮추고, 엉뚱한 기억이 딸려오면 올리세요. (기본 0.35)</small></Num> : null}</Grid>
      {api ? <div className="row wrap">
        <Btn label="테스트" ic="plug" cls="ghost" title="연결 테스트" onClick={e => void busyBtn(e.currentTarget, async () => { const v = await Mm.embedCall(['connection test']); if (v?.[0]?.length) toast(`임베딩 연결 성공 (${v[0].length}차원)`, 'ok'); else toast('임베딩 응답이 비어 있습니다. 연결/모델을 확인하세요.', 'err'); })} />
        <Btn label="재계산" ic="refresh" cls="ghost" title="기존 기억 전체에 API 임베딩을 다시 계산합니다. 새 기억은 자동으로 계산됩니다." onClick={e => void busyBtn(e.currentTarget, async () => {
          if (!chat || !mem) return toast('열린 대화가 없습니다.'); if (!mem.memories.length) return toast('기억이 없습니다.');
          const n = await Mm.embedMemories(chat, mem, { all: true, onProgress: (d, t) => { if (prog.current) prog.current.textContent = `${d}/${t}`; } }); await Mm.embedQuery(chat, st.msgs).catch(() => { });
          toast(`기억 ${n}개의 임베딩을 재계산했습니다.`, 'ok'); setTimeout(() => { if (prog.current) prog.current.textContent = ''; }, 4000);
        })} /><span className="mm-progress" ref={prog} /></div> : null}
    </Sec>

    <Sec title="주입 · 검색"><Grid>
      <Num k="tokenBudget" label="주입 토큰 예산" title="주입되는 장기기억이 차지할 수 있는 최대 토큰" min={200} max={24000} step={100} />
      <Sel k="position" label="주입 위치" title="장기기억 장부를 프롬프트 어디에 넣을지" opts={[...(m.position === 'split' || MEMORY_DEFAULTS.position === 'split' ? [['split', '나눠 싣기 (줄거리는 앞, 지금 장면은 대화 안)'] as [string, string]] : []), ['chat', '대화 내 (깊이 적용)'], ['before', '메인 프롬프트 앞']]} />
      <Num k="depth" label="주입 깊이" title="대화 내 주입 깊이 (0 = 마지막 메시지 바로 앞). 대화 길이보다 큰 값이면 대화 기록의 맨 앞에 들어갑니다." min={0} max={10000} step={1} />
      <Num k="topK" label="회상 개수" title="한 턴에 회상할 기억 수" min={1} max={30} step={1} />
      <Num k="chunkTurns" label="요약 주기(턴)" title="몇 턴마다 자동 요약할지" min={3} max={40} step={1} />
      <Num k="maxMemories" label="최대 기억 수" title="초과 시 중요도 낮은 오래된 기억부터 정리 (고정/수동 제외)" min={50} max={2000} step={50} />
      <Num k="consolidateEvery" label="서고 정리 주기(턴)" title="N턴마다 사서가 서고를 훑어 중복 기억 병합·소음 제거·중요도 재조정을 합니다. 0 = 끔. 고정·수동 기억은 건드리지 않습니다. 이때 청크들도 같은 사건끼리 재그룹핑돼 아크로 병합됩니다." min={0} max={200} step={5} />
      <Num k="arcConsolidateEvery" label="아크 정리 주기(턴)" title="N턴마다 이미 만들어진 아크들끼리만 재검토해서, 정말 같은 사건인데 타이밍상 우연히 갈라진 것만 다시 합칩니다. 0 = 끔. 청크 재그룹핑(서고 정리)과는 완전히 별개로, 훨씬 보수적으로 병합합니다." min={0} max={500} step={10} /></Grid>
      <details className="mm-details mm-optset"><summary>고급 — 회상 점수 · 떡밥 · 연대기</summary><Grid>
        <Num k="minScore" label="불러올 최소 점수" title="이 점수에 못 미치는 기억은 회상하지 않습니다" min={0} max={1} step={0.01} int={false} />
        <Num k="minCosine" label="최소 유사도" title="내장 검색의 코사인 유사도 바닥값" min={0} max={1} step={0.01} int={false} />
        <Num k="mmrLambda" label="다양성 (MMR λ)" title="1에 가까울수록 점수 순, 낮을수록 서로 다른 기억을 고릅니다" min={0} max={1} step={0.01} int={false} />
        <Num k="maxPerKind" label="종류당 회상 수" title="한 종류의 기억이 회상을 독차지하지 않게 하는 상한" min={1} max={30} step={1} />
        <Num k="maxPerTurn" label="턴당 회상 수" title="한 턴에서 나온 기억이 회상을 독차지하지 않게 하는 상한" min={1} max={30} step={1} />
        <Num k="arcMergeAt" label="청크 안전 상한" title="서고 정리를 못 기다릴 만큼 청크가 이 개수 넘게 쌓이면 즉시 재그룹핑합니다" min={3} max={40} step={1} />
        <Num k="threadSleepTurns" label="떡밥 잠재우기(턴)" title="이 턴 수 동안 진전 없는 떡밥은 잠재웁니다 (서고에는 남고, 다시 언급되면 깨어납니다. 0 = 끔)" min={0} max={1000} step={1} />
        <Num k="eraKeep" label="연대기 보관 수" title="연대기를 이 개수까지만 따로 두고, 넘치면 가장 오래된 것부터 하나의 '옛 이야기'로 접습니다 (최소 3)" min={3} max={50} step={1} />
        {typeof (m.fossil as unknown) === 'number' ? <Num k="fossil" label="옛일로 물러나는 턴 수" title="이 턴 수가 지난 기억은 회상에서 옛일로 물러납니다" min={5} max={1000} step={1} /> : null}</Grid></details>
      <Note><b>주입 깊이</b>{'는 주입 위치가 "대화 내"일 때만 쓰입니다. 0이면 마지막 메시지 바로 앞, 숫자가 클수록 위쪽입니다. '}<b>대화 전체보다 앞</b>{'에 두고 싶으면 9999처럼 대화 길이보다 큰 값을 넣으세요 — 가장 오래된 메시지 위에 들어갑니다 (최대 10000). 캐릭터 카드·시스템 프롬프트보다도 앞에 두려면 주입 위치를 "메인 프롬프트 앞"으로 바꾸세요.'}</Note>
    </Sec>

    <Sec title="상태창 · 막간 · 점검"><Grid>
      <Sel k="statusMode" label="상태창 읽기" title="답변에 붙는 상태창(시간·날짜·장소·날씨)을 모델을 부르지 않고 그대로 읽어 둡니다" opts={[['auto', '자동으로 찾기'], ['custom', '직접 정한 모양'], ['off', '쓰지 않기']]} after={() => { re(); st.draw(); }} />
      {m.statusMode === 'custom' ? <Txt k="statusPattern" label="상태창 모양 (정규식)" title="정규식. 괄호 ( )로 묶은 부분을 상태창 내용으로 읽습니다" ph="예: <<(.+?)>>" after={re} check={v => { try { new RegExp(v); } catch { toast('정규식을 읽을 수 없습니다.', 'err'); return false; } }} /> : null}
      <Sel k="qrMode" label="QR 메시지" title="빠른 답장(QR)·명령어로 대화에 들어온 메시지를 기억에서 뺄지" opts={[['side', '코멘트·막간만 빼기'], ['all', '전부 빼기'], ['keep', '빼지 않기']]} after={re} cls="half"
        extra={<Tb label="분류" name="shuffle" title="막간 분류 — 명령어로 들어온 메시지를 모아 막간/이야기로 직접 고릅니다" onClick={e => { e.preventDefault(); openSideSorter(st); }} />} />
      <Tog k="statusInject" label="마지막 상태창 알려주기" hint="옛 답변이 숨겨지거나 막간이 끼어도 시간·날짜·장소가 이어집니다." after={re} />
      <Tog k="replyCheck" label="연속성 검사" hint="새 답변이 기록·최근 대화와 어긋나면 이름 옆에 ⚠를 붙입니다. 답변마다 사서 API를 한 번 더 씁니다." /></Grid>
      <Note>막간은 롤플을 멈추고 뽑은 퀴즈·인터뷰·운세 같은 QR 결과입니다. 지시문에 "롤플·시나리오를 멈춰라"는 문구가 있으면 자동으로 알아보고, 기록·회상·점검에서 뺍니다.</Note>
    </Sec>

    <Sec title="인물과 말투" desc="요약은 서술자 말투로 쓰이고 옛 원문은 숨겨집니다. 그래서 대화가 길어질수록 캐릭터의 말투가 흐려지고, 묵은 말투와 말버릇이 되살아납니다. 아래 설정이 그걸 막습니다."><Grid>
      <Tog k="styleGuard" label="장부는 사실 확인용" hint={'장부를 넣을 때 "장부에서는 사실만 확인하고, 문체는 지금 대화를 따르고, 옛 표현을 그대로 쓰지 말 것 · 인물의 성격과 말투는 바탕을 따르고 관계는 관계선의 단계를 지킬 것"을 함께 알려줍니다.'} after={re} />
      <Tog k="recallQuotes" label="회상에 옛 원문 대사 싣기" hint="끄면 회상에 요약만 싣고 옛 대사 인용은 넣지 않습니다. 옛 말투가 자꾸 돌아오면 꺼 보세요." after={re} />
      <Num k="voiceSamples" label="장면 인물 남긴 말 수" title="지금 장면에 있는 인물마다, 그 인물이 실제로 했던 대사를 몇 줄씩 말투 견본으로 실을지 (0 = 싣지 않음). 원문에 그대로 있는 대사만 모읍니다." min={0} max={4} step={1} after={re} />
      <div className="mm-block mm-optset"><b>삼갈 표현 · 반복 표현</b>
        <textarea className="inp" rows={3} placeholder="한 줄에 하나, 또는 쉼표로 구분 — 예: 나지막이, 입꼬리가 미세하게" ref={banned} />
        <div className="row wrap"><Tb label="말버릇" name="repeat" title="말버릇 찾기" onClick={() => { if (!chat) return toast('열린 대화가 없습니다.'); openRepeatFinder(st, v => { if (banned.current) banned.current.value = v; }); }} /></div>
        <small className="hint">{'적어 둔 표현은 장기기억이 넣는 장부(기억·회상·요약·남긴 말)에서 빠집니다. 삼갈 표현이 든 옛 대사는 인용째로 뺍니다. '}<b>캐릭터가 꼭 쓰는 말은 넣지 마세요.</b></small></div>
      <Tog k="banInChat" label="AI에게 보내는 최근 대화에서도 빼기" hint="AI가 자기 최근 답변을 보고 같은 말을 또 쓰는 고리를 끊습니다. 저장된 대화는 그대로이고, 이어쓰기할 때 이어 쓰는 마지막 답변은 건드리지 않습니다." />
      <Tog k="banTell" label="AI에게 삼갈 표현 목록 알려주기" hint={'"이 표현은 쓰지 마"라고 직접 알려줍니다. 모델에 따라 오히려 그 단어를 떠올리게 할 수 있어 기본은 꺼 둡니다.'} after={re} /></Grid>
    </Sec>

    <Sec title="답변 속도 · 캐시" desc="장기기억 때문에 답변이 늦어지지 않게 합니다. 답변 생성이 언제나 먼저입니다."><Grid>
      <Num k="recallWaitSec" label="답변 전 최대 대기(초)" title="답변을 생성하기 전, 회상을 위한 임베딩 응답을 최대 몇 초 기다릴지. 넘으면 내장 검색 결과만으로 바로 생성합니다. 0 = 제한 없음" min={0} max={60} step={1} cls="half" />
      <Num k="stableRefreshTurns" label="고정 장부 새로 뜨는 주기(턴)" title="고정 장부를 이 턴 수마다 새로 뜹니다. 0 = 달라진 줄이 넘치거나 항목이 지워졌을 때만" min={0} max={200} step={1} cls="half" />
      <Tog k="yieldToChat" label="답변 먼저" hint="답변을 생성하는 동안에는 사서·요약 호출을 새로 시작하지 않고, 답변이 온 뒤에 이어서 합니다. API나 프록시가 요청을 한 번에 하나씩만 받을 때 답변이 줄 서서 기다리는 일을 막습니다." />
      <Tog k="watchUpdates" label="다른 기능이 고친 메시지도 다시 기록" hint="답변을 다시 쓰거나 번역·그림을 끼워 넣는 기능이 메시지를 고쳤을 때, 본문이 실제로 바뀐 경우에만 그 턴을 다시 기록합니다. 화면만 다시 그린 경우에는 아무것도 하지 않습니다." />
      <Tog k="splitInjection" label="고정 장부 (프롬프트 캐시 아끼기)" hint={<>{'장부 가운데 잘 안 바뀌는 부분(캐논·인물·관계선·요약·서약)은 한 번 떠서 프롬프트 앞쪽에 그대로 두고, 매 턴 바뀌는 것(회상·지금 장면·상태·그 뒤 달라진 줄)만 최근 대화 옆에 따로 넣습니다. 프롬프트 앞부분이 매 턴 같아져 캐시를 지원하는 모델에서 비용과 지연이 줄어듭니다. 고정 장부를 새로 뜨는 턴에는 캐시가 한 번 새로 잡히므로, '}<b>주입 위치가 "메인 프롬프트 앞"이거나 자동 숨김을 함께 쓸 때</b>{' 가장 이득이 큽니다.'}</>} after={re} /></Grid>
    </Sec>

    <Sec title="프롬프트" desc="각 역할의 시스템 프롬프트를 수정할 수 있습니다.">
      {outdated.length ? <p className="mm-banner"><Ico name="bell" size={15} /><span>{'새 기본 프롬프트가 나왔습니다: '}<b>{outdated.map(k => PROMPT_LABELS[k] || k).join(', ')}</b>{'. 직접 고친 프롬프트라 자동으로 바꾸지 않았어요. 새 기본값을 받으려면 해당 칸의 [기본값]을 누르세요 (지금 내용은 사라지니 필요하면 먼저 복사해 두세요).'}</span></p> : null}
      <PromptEdit st={st} k="archivist" label="사서 (턴 → 구조화 기억)" rows={10} /><PromptEdit st={st} k="supervisor" label="장면 연출" rows={8} /><PromptEdit st={st} k="chunk" label="요약 (청크)" rows={5} /><PromptEdit st={st} k="arc" label="연대기 병합" rows={5} />
    </Sec>
  </div>;
}
