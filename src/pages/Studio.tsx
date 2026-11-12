// 기능: 번역 · 삽화 · 에셋 · 보조 연결 설정 + 기능 모듈이 꽂은 탭
import { useMemo, useState, type ReactNode } from 'react';
import { Btn } from '../kit';
import type { FormDefs, Opt } from '../studio/parts';
import * as libIllust from '../lib/illust';
import * as libHooks from '../lib/hooks';
import * as libAssets from '../lib/assets';
import { S } from '../lib/core';
import { Host, LForm, PageHead, textModal } from '../studio/parts';

interface StudioSettings { illust: { backend: string } }

// 화면을 떠났다 돌아와도 남는 탭
let tab = '번역';
const TAB_ORDER = ['번역', '삽화', '에셋', '보조 연결', '일정', '표정', '벡터 검색', '장기기억'];

export const page = { name: 'studio', Component: Studio };

/** 기능 모듈이 등록한 탭: 옛 코드가 만든 DOM 을 그대로 끼운다 */
function ExtTab({ render }: { render: () => Node }) {
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const node = useMemo(() => render(), []);
  return <Host node={node} />;
}

function Studio() {
  const [, setTab] = useState(tab), [epoch, setEpoch] = useState(0);
  const st = S.settings as unknown as StudioSettings, sv = () => S.set({});
  const { NAI_MODELS, PLAN_PROMPT, TRANSLATE_PROMPT } = libIllust, { ASSET_PROMPT } = libAssets;
  const conns: Opt[] = [['', '대화에 쓰는 연결'], ...S.conns.map(c => [c.id, `${c.name}${c.model ? ' · ' + c.model : ''}`] as const)];
  const il = st.illust, nai = il.backend === 'nai', api = il.backend === 'openai' || il.backend === 'gemini', sd = il.backend === 'a1111';
  const card = (defs: FormDefs, ...rest: ReactNode[]) => <div className="card"><LForm obj={st} defs={defs} onChange={sv} />{rest}</div>;

  const views: Record<string, () => ReactNode> = {
    '번역': () => card([{ section: '번역' },
      { k: 'translate.auto', label: '답변이 오면 자동으로 번역해서 보여 주기', type: 'check' }, { k: 'translate.lang', label: '답변을 옮길 언어', half: true },
      { k: 'translate.autoInput', label: '내가 쓴 글을 번역해서 보내기 (화면에는 내가 쓴 글이 보입니다)', type: 'check' }, { k: 'translate.inputLang', label: '내 글을 옮길 언어', half: true },
      { k: 'translate.context', label: '참고할 앞 메시지 수', type: 'num', min: 0, max: 10, half: true }, { k: 'translate.maxTokens', label: '최대 응답 토큰', type: 'num', half: true },
      { k: 'helpers.translate', label: '번역에 쓸 연결', type: 'select', opts: conns },
      { k: 'translate.prompt', label: '번역 지시문', type: 'area', rows: 6, ph: TRANSLATE_PROMPT, hint: '{{language}} 자리에 대상 언어가 들어갑니다. 비워 두면 기본 지시문을 씁니다.' }],
      <p className="hint" key="h">메시지의 ⋯ 메뉴에서 번역 · 다시 번역 · 번역 고치기를, 입력창의 + 메뉴에서 입력한 글 번역하기를 쓸 수 있어요.</p>),
    '삽화': () => card([{ section: '삽화' },
      { k: 'illust.auto', label: '답변에 삽화를 자동으로 넣기', type: 'check' },
      { k: 'illust.mode', label: '장면을 정하는 방법', type: 'select', opts: [['plan', '답변을 쓰는 모델이 함께 계획 (추가 호출 없음)'], ['call', '답변 뒤에 따로 물어보기 (추가 호출 1회)']], half: true }, { k: 'illust.every', label: '몇 번째 답변마다', type: 'num', min: 1, third: true }, { k: 'illust.maxScenes', label: '답변당 최대 장수', type: 'num', min: 1, max: 4, third: true },
      { k: 'illust.backend', label: '그림 엔진', type: 'select', opts: [['nai', 'NovelAI'], ['openai', 'OpenAI 호환 이미지 API'], ['gemini', 'Gemini 이미지 모델'], ['a1111', 'Stable Diffusion WebUI']], half: true, live: true },
      nai && { k: 'illust.naiKey', label: 'NovelAI 키 (Persistent API Token)', type: 'password', half: true },
      nai && { k: 'illust.model', label: '모델', type: 'select', opts: NAI_MODELS, half: true },
      nai && { k: 'illust.sampler', label: '샘플러', type: 'select', opts: ['k_euler_ancestral', 'k_euler', 'k_dpmpp_2m', 'k_dpmpp_2m_sde', 'k_dpmpp_sde', 'k_dpmpp_2s_ancestral'], half: true },
      api && { k: 'illust.connId', label: '쓸 연결 (키와 주소를 빌려 씁니다)', type: 'select', opts: [['', '골라 주세요'], ...S.conns.map(c => [c.id, c.name] as const)], half: true },
      api && { k: 'illust.imgModel', label: '이미지 모델', ph: il.backend === 'gemini' ? 'gemini-3.1-flash-image' : 'gpt-image-1', half: true },
      sd && { k: 'illust.a1111', label: 'WebUI 주소 (--api 로 실행)', half: true },
      { k: 'illust.width', label: '너비', type: 'num', step: 64, third: true }, { k: 'illust.height', label: '높이', type: 'num', step: 64, third: true },
      (nai || sd) && { k: 'illust.steps', label: '스텝', type: 'num', third: true },
      (nai || sd) && { k: 'illust.scale', label: '프롬프트 강도', type: 'num', step: 0.5, third: true },
      { k: 'illust.style', label: '화풍 (모든 그림 앞에 붙습니다)', ph: 'watercolor, soft lighting …' }, { k: 'illust.direction', label: '연출 방향 (계획을 세우는 모델에게 전하는 말)', ph: '인물 표정이 잘 보이는 구도 위주로 …' }, { k: 'illust.world', label: '세계 · 배경 메모', ph: '근미래 서울, 비가 잦은 도시 …' },
      { k: 'illust.playerMode', label: '내 캐릭터 그리기', type: 'select', opts: [['auto', '답변에 등장할 때만'], ['always', '함께 있으면 항상'], ['never', '그리지 않기']], half: true }, { k: 'illust.contextMessages', label: '장면을 뽑을 때 참고할 앞 메시지 수', type: 'num', half: true }, { k: 'illust.negative', label: '피할 것' },
      { k: 'illust.quality', label: '품질 태그 자동으로 붙이기', type: 'check' },
      { k: 'helpers.illust', label: '장면을 뽑을 때 쓸 연결', type: 'select', opts: conns },
      { k: 'illust.planPrompt', label: '삽화 계획 지시문', type: 'area', rows: 5, ph: PLAN_PROMPT.slice(0, 500) + ' …', hint: '비워 두면 씬북의 기본 지시문을 씁니다. {{maxScenes}} {{modelRule}} {{playerRule}} {{direction}} {{data}} 가 채워집니다.' }],
      <div className="row" key="a"><Btn label="기본 지시문 보기" cls="ghost" ic="note" onClick={() => textModal('삽화 계획 지시문 (기본)', 'regex-out', PLAN_PROMPT)} /></div>,
      <div className="row" key="b"><Btn label="엔진 바꾼 뒤 화면 새로 고침" cls="ghost" ic="refresh" onClick={() => setEpoch(n => n + 1)} /></div>,
      <p className="hint" key="h">메시지의 ⋯ 메뉴 › 삽화 그리기로 원하는 답변에 직접 넣을 수도 있습니다. 인물 외형은 캐릭터 편집 › 에셋 탭에 적어 주세요. NovelAI 는 드림랜드 서버로 열었을 때만 동작합니다.</p>),
    '에셋': () => card([{ section: '캐릭터 에셋' },
      { k: 'assets.inject', label: '쓸 수 있는 에셋 이름을 모델에게 자동으로 알려 주기', type: 'check' }, { k: 'assets.max', label: '답변당 최대 개수', type: 'num', min: 1, max: 6, half: true },
      { k: 'assets.random', label: '번호가 붙은 묶음(joy_1, joy_2 …)은 그때그때 하나를 골라 보여 주기', type: 'check' },
      { k: 'assets.prompt', label: '에셋 안내문', type: 'area', rows: 5, ph: ASSET_PROMPT, hint: '{{keywords}} 와 {{max}} 가 채워집니다.' }],
      <p className="hint" key="h">에셋은 캐릭터 편집 › 에셋 탭에서 올립니다. 페르소나에도 올릴 수 있어요.</p>),
    '보조 연결': () => card([{ section: '보조 작업에 쓸 연결' },
      { k: 'helpers.all', label: '번역 · 기억 · 삽화 계획 · 요약 · 트래커 공통', type: 'select', opts: conns, hint: '아래에서 따로 지정한 작업은 그 연결을 먼저 씁니다.' },
      { k: 'helpers.translate', label: '번역', type: 'select', opts: conns, third: true }, { k: 'helpers.memory', label: '장기기억', type: 'select', opts: conns, third: true }, { k: 'helpers.illust', label: '삽화 계획', type: 'select', opts: conns, third: true }]),
  };
  // 기능 모듈이 등록한 탭이 같은 이름의 기본 탭을 대신한다
  for (const t of libHooks.X.studio) views[t.title] = () => <ExtTab render={() => t.render()} />;
  // 탭 순서는 옛 판과 같게 (기능이 등록되는 순서가 달라져도). 여기에 없는 탭은 등록된 순서대로 뒤에 온다
  const rank = (t: string) => { const i = TAB_ORDER.indexOf(t); return i < 0 ? TAB_ORDER.length : i; };
  const names = Object.keys(views).map((t, i) => [t, i] as const).sort((a, b) => rank(a[0]) - rank(b[0]) || a[1] - b[1]).map(x => x[0]);
  if (!views[tab]) tab = names[0];

  return <section className="pagebox"><PageHead eyebrow="features" title="기능" />
    <div className="tabs">{names.map(t => <button key={t} className={'tab' + (t === tab ? ' on' : '')} onClick={() => { tab = t; setTab(t); setEpoch(n => n + 1); }}>{t}</button>)}</div>
    <span style={{ display: 'contents' }} key={tab + ':' + epoch}>{views[tab]()}</span>
  </section>;
}
