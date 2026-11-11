// ── Dreamland studio: 내장 기능 (번역 · 삽화 · 에셋) 설정과 프롬프트 연결 ──
import { S, h, on, pickFiles } from './core.js';
import { icon, btn, iconBtn, toast, modal, promptBox, form, registerPage, refresh, pageHead } from './ui.js';
import { X } from './hooks.js';
import { macro } from './engine.js';
import { Assets, ASSET_PROMPT } from './assets.js';
import { Memory } from './memory.js';
import { Illust, NAI_MODELS, PLAN_PROMPT, TRANSLATE_PROMPT } from './illust.js';
import './chat.js';   // 대화 화면이 먼저 준비되게

// ════════ 프롬프트에 싣기 ════════
X.covered = chat => Memory.get(chat.id)?.turns.length || 0;
export const TALK_PROMPT = `[Conversation mode] This is a real-time messenger chat between {{char}} and {{user}}, not a novel. Reply the way {{char}} would text: one to three short messages, each on its own line, casual and fully in character. No narration, no scene description, no quotation marks around speech. A brief action may appear occasionally as *a few words in asterisks* on its own line.`;
X.prompt.push(
  { owner: 'mode', fn: ({ chat, ctx }) => chat.mode === 'talk' ? [{ where: 'end', content: macro(S.settings.modes.talkPrompt || TALK_PROMPT, ctx), src: '대화 모드 지시' }] : [] },
  { owner: 'assets', fn: ({ chat, persona }) => {
    const st = S.settings.assets; if (!st.inject) return [];
    const kw = Assets.keywords([...chat.charIds.map(Assets.ownerOfChar), Assets.ownerOfPersona(persona?.id)]); if (!kw) return [];
    return [{ where: 'depth', depth: 2, order: 40, content: (st.prompt || ASSET_PROMPT).replace('{{max}}', st.max || 2).replace('{{keywords}}', kw), src: '에셋 목록' }];
  } },
  { owner: 'illust', fn: ({ chat, msgs, type }) => (type === 'normal' || type === 'regen') && Illust.wantsPlan(chat, msgs, type) ? [{ where: 'end', content: Illust.instruction(chat), src: '삽화 계획 지시' }] : [] },
);

// ════════ 에셋 창 (캐릭터 · 페르소나 편집기에서 씀) ════════
export function assetsPane(owner, holder, saveHolder) {
  const grid = h('div.asset-grid'); holder.visual ||= { appearance: '', negative: '' };
  const draw = () => grid.replaceChildren(...Assets.list(owner).map(a => h(`div.asset${a.disabled ? '.off' : ''}`,
    h('img', { src: a.data, loading: 'lazy', onclick: () => modal({ title: a.name, wide: true, body: h('img.full-img', { src: a.data }) }) }),
    h('div.asset-name', h('span', { title: '눌러서 태그 복사', onclick: () => { navigator.clipboard.writeText(`{{img::${a.name}}}`); toast('태그를 복사했어요'); } }, a.name),
      iconBtn('edit', '이름 바꾸기', async () => { const v = await promptBox('에셋 이름', a.name); if (v?.trim()) { a.name = v.trim().toLowerCase().replace(/\s+/g, '_'); await Assets.update(a); draw(); } }, 'tiny'),
      iconBtn(a.disabled ? 'eyeoff' : 'eye', '쓰지 않기 / 다시 쓰기', async () => { a.disabled = !a.disabled; await Assets.update(a); draw(); }, 'tiny'),
      iconBtn('trash', '삭제', async () => { await Assets.remove(a); draw(); }, 'tiny')))),
    !Assets.list(owner).length && h('p.dim', '아직 에셋이 없어요. 이미지나 ZIP 을 올려 주세요.'));
  const add = async files => { const n = await Assets.addFiles(owner, files); toast(n ? `에셋 ${n}개를 넣었어요` : '넣을 이미지가 없어요', n ? 'ok' : ''); draw(); };
  const drop = h('div.dropzone.small', { onclick: async () => add(await pickFiles({ accept: 'image/*,.zip', multiple: true })) }, icon('image', 24), h('b', '이미지 · ZIP 올리기'), h('span', '파일 이름이 곧 키워드입니다 (joy_1, joy_2 처럼 번호를 붙이면 한 묶음).'));
  drop.addEventListener('dragover', e => { e.preventDefault(); drop.classList.add('over'); }); drop.addEventListener('dragleave', () => drop.classList.remove('over'));
  drop.addEventListener('drop', e => { e.preventDefault(); drop.classList.remove('over'); add([...e.dataTransfer.files]); });
  Assets.load([owner]).then(draw);
  return h('div.col',
    form(holder, [{ k: 'visual.appearance', label: '삽화용 외형', type: 'area', rows: 3, ph: 'long silver hair, amber eyes, black coat …', hint: '삽화를 그릴 때 이 인물이 나오면 자동으로 붙습니다.' }, { k: 'visual.outfit', label: '기본 의상', ph: 'white blouse, navy pleated skirt …', hint: '장면에서 옷이 바뀌면 그 장면의 옷이 우선합니다.' }, { k: 'visual.negative', label: '삽화에서 피할 것', ph: '비워 두어도 됩니다' }], saveHolder),
    h('h3.form-sec', '에셋'), h('p.hint', '대화에 {{img::이름}} 이 나오면 그 자리에 그림이 보입니다. 쓸 수 있는 이름은 모델에게 자동으로 알려 줍니다.'), drop, grid);
}

// ════════ 기능 화면 ════════
let tab = '번역';
registerPage('studio', root => {
  const st = S.settings, sv = () => S.set({});
  const conns = [['', '대화에 쓰는 연결'], ...S.conns.map(c => [c.id, `${c.name}${c.model ? ' · ' + c.model : ''}`])];
  const il = st.illust;
  const views = {
    '번역': () => h('div.card', form(st, [{ section: '번역' },
      { k: 'translate.auto', label: '답변이 오면 자동으로 번역해서 보여 주기', type: 'check' }, { k: 'translate.lang', label: '답변을 옮길 언어', half: true },
      { k: 'translate.autoInput', label: '내가 쓴 글을 번역해서 보내기 (화면에는 내가 쓴 글이 보입니다)', type: 'check' }, { k: 'translate.inputLang', label: '내 글을 옮길 언어', half: true },
      { k: 'translate.context', label: '참고할 앞 메시지 수', type: 'num', min: 0, max: 10, half: true }, { k: 'translate.maxTokens', label: '최대 응답 토큰', type: 'num', half: true },
      { k: 'helpers.translate', label: '번역에 쓸 연결', type: 'select', opts: conns },
      { k: 'translate.prompt', label: '번역 지시문', type: 'area', rows: 6, ph: TRANSLATE_PROMPT, hint: '{{language}} 자리에 대상 언어가 들어갑니다. 비워 두면 기본 지시문을 씁니다.' }], sv),
      h('p.hint', '메시지의 ⋯ 메뉴에서 번역 · 다시 번역 · 번역 고치기를, 입력창의 + 메뉴에서 입력한 글 번역하기를 쓸 수 있어요.')),
    '삽화': () => h('div.card', form(st, [{ section: '삽화' },
      { k: 'illust.auto', label: '답변에 삽화를 자동으로 넣기', type: 'check' },
      { k: 'illust.mode', label: '장면을 정하는 방법', type: 'select', opts: [['plan', '답변을 쓰는 모델이 함께 계획 (추가 호출 없음)'], ['call', '답변 뒤에 따로 물어보기 (추가 호출 1회)']], half: true }, { k: 'illust.every', label: '몇 번째 답변마다', type: 'num', min: 1, third: true }, { k: 'illust.maxScenes', label: '답변당 최대 장수', type: 'num', min: 1, max: 4, third: true },
      { k: 'illust.backend', label: '그림 엔진', type: 'select', opts: [['nai', 'NovelAI'], ['openai', 'OpenAI 호환 이미지 API'], ['gemini', 'Gemini 이미지 모델'], ['a1111', 'Stable Diffusion WebUI']], half: true, live: true },
      il.backend === 'nai' && { k: 'illust.naiKey', label: 'NovelAI 키 (Persistent API Token)', type: 'password', half: true },
      il.backend === 'nai' && { k: 'illust.model', label: '모델', type: 'select', opts: NAI_MODELS, half: true },
      il.backend === 'nai' && { k: 'illust.sampler', label: '샘플러', type: 'select', opts: ['k_euler_ancestral', 'k_euler', 'k_dpmpp_2m', 'k_dpmpp_2m_sde', 'k_dpmpp_sde', 'k_dpmpp_2s_ancestral'], half: true },
      (il.backend === 'openai' || il.backend === 'gemini') && { k: 'illust.connId', label: '쓸 연결 (키와 주소를 빌려 씁니다)', type: 'select', opts: [['', '골라 주세요'], ...S.conns.map(c => [c.id, c.name])], half: true },
      (il.backend === 'openai' || il.backend === 'gemini') && { k: 'illust.imgModel', label: '이미지 모델', ph: il.backend === 'gemini' ? 'gemini-3.1-flash-image' : 'gpt-image-1', half: true },
      il.backend === 'a1111' && { k: 'illust.a1111', label: 'WebUI 주소 (--api 로 실행)', half: true },
      { k: 'illust.width', label: '너비', type: 'num', step: 64, third: true }, { k: 'illust.height', label: '높이', type: 'num', step: 64, third: true },
      (il.backend === 'nai' || il.backend === 'a1111') && { k: 'illust.steps', label: '스텝', type: 'num', third: true },
      (il.backend === 'nai' || il.backend === 'a1111') && { k: 'illust.scale', label: '프롬프트 강도', type: 'num', step: 0.5, third: true },
      { k: 'illust.style', label: '화풍 (모든 그림 앞에 붙습니다)', ph: 'watercolor, soft lighting …' }, { k: 'illust.direction', label: '연출 방향 (계획을 세우는 모델에게 전하는 말)', ph: '인물 표정이 잘 보이는 구도 위주로 …' }, { k: 'illust.world', label: '세계 · 배경 메모', ph: '근미래 서울, 비가 잦은 도시 …' },
      { k: 'illust.playerMode', label: '내 캐릭터 그리기', type: 'select', opts: [['auto', '답변에 등장할 때만'], ['always', '함께 있으면 항상'], ['never', '그리지 않기']], half: true }, { k: 'illust.contextMessages', label: '장면을 뽑을 때 참고할 앞 메시지 수', type: 'num', half: true }, { k: 'illust.negative', label: '피할 것' },
      { k: 'illust.quality', label: '품질 태그 자동으로 붙이기', type: 'check' },
      { k: 'helpers.illust', label: '장면을 뽑을 때 쓸 연결', type: 'select', opts: conns },
      { k: 'illust.planPrompt', label: '삽화 계획 지시문', type: 'area', rows: 5, ph: PLAN_PROMPT.slice(0, 500) + ' …', hint: '비워 두면 씬북의 기본 지시문을 씁니다. {{maxScenes}} {{modelRule}} {{playerRule}} {{direction}} {{data}} 가 채워집니다.' }], o => { sv(); }),
      h('div.row', btn('기본 지시문 보기', { cls: 'ghost', ic: 'note', onclick: () => modal({ title: '삽화 계획 지시문 (기본)', wide: true, body: h('pre.regex-out', PLAN_PROMPT) }) })),
      h('div.row', btn('엔진 바꾼 뒤 화면 새로 고침', { cls: 'ghost', ic: 'refresh', onclick: refresh })),
      h('p.hint', '메시지의 ⋯ 메뉴 › 삽화 그리기로 원하는 답변에 직접 넣을 수도 있습니다. 인물 외형은 캐릭터 편집 › 에셋 탭에 적어 주세요. NovelAI 는 드림랜드 서버로 열었을 때만 동작합니다.')),
    '에셋': () => h('div.card', form(st, [{ section: '캐릭터 에셋' },
      { k: 'assets.inject', label: '쓸 수 있는 에셋 이름을 모델에게 자동으로 알려 주기', type: 'check' }, { k: 'assets.max', label: '답변당 최대 개수', type: 'num', min: 1, max: 6, half: true },
      { k: 'assets.random', label: '번호가 붙은 묶음(joy_1, joy_2 …)은 그때그때 하나를 골라 보여 주기', type: 'check' },
      { k: 'assets.prompt', label: '에셋 안내문', type: 'area', rows: 5, ph: ASSET_PROMPT, hint: '{{keywords}} 와 {{max}} 가 채워집니다.' }], sv),
      h('p.hint', '에셋은 캐릭터 편집 › 에셋 탭에서 올립니다. 페르소나에도 올릴 수 있어요.')),
    '보조 연결': () => h('div.card', form(st, [{ section: '보조 작업에 쓸 연결' },
      { k: 'helpers.all', label: '번역 · 기억 · 삽화 계획 · 요약 · 트래커 공통', type: 'select', opts: conns, hint: '아래에서 따로 지정한 작업은 그 연결을 먼저 씁니다.' },
      { k: 'helpers.translate', label: '번역', type: 'select', opts: conns, third: true }, { k: 'helpers.memory', label: '장기기억', type: 'select', opts: conns, third: true }, { k: 'helpers.illust', label: '삽화 계획', type: 'select', opts: conns, third: true }], sv)),
  };
  for (const t of X.studio) views[t.title] = () => t.render();   // 기능 모듈이 등록한 탭이 같은 이름의 기본 탭을 대신한다
  if (!views[tab]) tab = Object.keys(views)[0];
  root.append(h('section.pagebox', pageHead('features', '기능'),
    h('div.tabs', Object.keys(views).map(t => h(`button.tab${t === tab ? '.on' : ''}`, { onclick: () => { tab = t; refresh(); } }, t))), views[tab]()));
});
