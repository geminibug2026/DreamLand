// ── Dreamland f-lore: 로어북 편집기 (항목이 수백 개여도 찾고 · 접고 · 한꺼번에 고칠 수 있게) ──
import { S, h, uid, debounce, download, newEntry } from './core.js';
import { tokens, scanLore } from './engine.js';
import { icon, btn, iconBtn, toast, modal, menu, confirmBox, form, refresh } from './ui.js';
import { loreToWorld } from './cards.js';

if (!document.querySelector('link[data-quick-css]')) document.head.append(h('link', { rel: 'stylesheet', href: 'css/quick.css', dataset: { quickCss: '1' } }));

export const LORE_POS = [['before', '캐릭터 설명 앞'], ['after', '캐릭터 설명 뒤'], ['em_top', '대화 예시 앞'], ['em_bottom', '대화 예시 뒤'], ['an_top', '작가 노트 위'], ['an_bottom', '작가 노트 아래'], ['depth', '대화 깊이에 삽입'], ['outlet', '아울렛 ({{outlet::이름}})']];
const POS_SHORT = { before: '설명 앞', after: '설명 뒤', em_top: '예시 앞', em_bottom: '예시 뒤', an_top: '노트 위', an_bottom: '노트 아래', depth: '깊이', outlet: '아울렛' };
const TRIGGERS = [['normal', '일반 답변'], ['continue', '이어 쓰기'], ['impersonate', '대신 써 주기'], ['regenerate', '다시 생성'], ['swipe', '답변 넘기기'], ['quiet', '조용한 생성 (/gen)']];
const TRI = [['', '로어북 설정을 따름'], ['true', '켬'], ['false', '끔']];
const tri = v => v === true || v === 'true' ? true : v === false || v === 'false' ? false : null;
const MATCH = [['matchPersona', '페르소나 설명'], ['matchCharDesc', '캐릭터 설명'], ['matchCharPersonality', '캐릭터 성격'], ['matchScenario', '시나리오'], ['matchCharNote', '캐릭터 노트'], ['matchCreatorNotes', '제작자 노트']];
const PAGE = 40;
const titleOf = e => e.name || (e.keys || []).slice(0, 3).join(', ') || '(이름 없는 항목)';
const copy = o => { try { return structuredClone(o); } catch { return JSON.parse(JSON.stringify(o)); } };

/** 값이 빠진 예전 항목을 편집할 수 있게 채운다 (저장된 뜻은 바꾸지 않는다) */
function ready(e) {
  e.charFilter ||= { names: [], tags: [], exclude: false }; e.charFilter.names ||= []; e.charFilter.tags ||= [];
  e.triggers ||= []; e.keys ||= []; e.keys2 ||= [];
  if (e.groupWeight == null) e.groupWeight = 100;
  if (e.groupOverride == null) e.groupOverride = true;   // 예전 항목: 같은 묶음에서는 우선순위가 가장 높은 하나
  return e;
}

/** 로어북 전체 설정 (모든 로어북에 함께 적용) */
export function loreSettingsDialog() {
  const G = S.settings.lore ||= {};
  modal({ title: '로어북 전체 설정', body: h('div.col',
    form(G, [
      { k: 'includeNames', label: '살필 때 말한 사람 이름을 앞에 붙이기', type: 'check', hint: '"이름: 대사" 꼴로 살핍니다. 캐릭터 이름을 키워드로 쓰면 그 캐릭터가 말할 때마다 발동해요.' },
      { k: 'groupScoring', label: '묶음 안에서 키워드가 더 많이 걸린 항목을 먼저', type: 'check', hint: '항목마다 따로 정하지 않았을 때의 기본값입니다.' },
      { k: 'minActivations', label: '최소 발동 수', type: 'num', min: 0, half: true, hint: '이 수를 채울 때까지 더 옛 메시지로 거슬러 올라가며 살핍니다. 0 이면 쓰지 않아요.' },
      { k: 'minDepthMax', label: '거슬러 올라갈 최대 메시지 수', type: 'num', min: 0, half: true, hint: '0 이면 대화 처음까지.' },
      { k: 'maxRecursion', label: '연쇄 발동 단계 한도', type: 'num', min: 0, half: true, hint: '0 은 제한 없음, 1 은 연쇄 없음, 2 는 한 번만 더.' },
    ], () => S.set({ lore: G })),
    h('p.hint', '살필 메시지 수 · 토큰 예산 · 연쇄 발동 · 대소문자 · 단어 단위는 로어북마다 따로 정합니다. 모두 추가 호출 없이 프롬프트를 만들 때 계산돼요.')),
  actions: [{ label: '닫기', cls: 'primary' }] });
}

/** 발동 시험: 적은 글에 어떤 항목이 걸리는지 */
function testDialog(b) {
  const ta = h('textarea.inp', { rows: 5, placeholder: '여기에 대화 한 토막을 적으면, 이 로어북에서 어떤 항목이 발동하는지 보여 줍니다.' });
  const out = h('div.lore-test');
  const kind = h('select.inp.auto', TRIGGERS.map(([v, l]) => h('option', { value: v }, l)));
  const run = () => {
    const text = ta.value; if (!text.trim()) return out.replaceChildren(h('p.dim', '글을 적어 주세요.'));
    const chat = S.get('chats', S.settings.lastChat), ch = S.get('chars', chat?.charIds?.[0]) || null, persona = chat ? S.persona(chat) : null;
    const type = { regenerate: 'regen' }[kind.value] || kind.value;
    const hits = scanLore([b], [{ content: text }], { user: persona?.name || '', char: ch?.name || '', vars: {} }, { count: 9999, type, char: ch, persona });
    const total = hits.reduce((n, e) => n + e.tok, 0);
    out.replaceChildren(h('small.hint', hits.length ? `${hits.length}개 발동 · ≈${total} 토큰${ch ? ` · 캐릭터 조건은 "${ch.name}" 기준` : ''} · 확률과 묶음 추첨은 누를 때마다 달라질 수 있어요` : '발동한 항목이 없어요. (지연 · 쿨다운은 시험에서 빼고 봅니다)'),
      ...hits.map(e => h('div.lore-test-row', h('b', titleOf(e)), h('span', POS_SHORT[e.position] || ''), h('span.tokbadge', `≈${e.tok}`))));
  };
  modal({ title: `발동 시험 · ${b.name}`, wide: true, body: h('div.col', ta, h('div.row.wrap', h('span.field-label', '생성 종류'), kind, btn('시험하기', { ic: 'play', cls: 'primary', onclick: run })), out) });
}

export function loreEditor(b, { redraw, save }) {
  b.entries ||= [];
  const sv = debounce(save, 300);
  const st = { q: '', filter: 'all', sort: 'list', shown: PAGE, pick: false };
  const open = new Set(), picked = new Set();
  const list = h('div.entries'), info = h('span.lore-count'), bulk = h('div.lore-bulk');
  const hay = e => [e.name, ...(e.keys || []), ...(e.keys2 || []), e.group, e.outlet, e.automationId, e.content].join('\n').toLowerCase();
  const FILTERS = { all: () => true, on: e => e.enabled !== false, off: e => e.enabled === false, constant: e => !!e.constant, keyed: e => !e.constant, grouped: e => !!e.group, timed: e => !!(e.sticky || e.cooldown || e.delay), filtered: e => !!(e.charFilter?.names?.length || e.charFilter?.tags?.length || e.triggers?.length) };
  const SORTS = { list: null, order: (a, c) => (c.order ?? 100) - (a.order ?? 100), name: (a, c) => titleOf(a).localeCompare(titleOf(c), 'ko'), tok: (a, c) => tokens(c.content) - tokens(a.content) };
  const view = () => {
    const t = st.q.trim().toLowerCase(); let rows = b.entries.filter(e => FILTERS[st.filter](e) && (!t || hay(e).includes(t)));
    if (SORTS[st.sort]) rows = [...rows].sort(SORTS[st.sort]);
    return rows;
  };
  const touch = () => { sv(); redraw(); };

  const triggerChips = e => h('div.field', h('span.field-label', '이 생성 종류에서만 발동'), h('div.lore-chips', TRIGGERS.map(([v, l]) => h(`button.chip${e.triggers.includes(v) ? '.on' : ''}`, { type: 'button', onclick: ev => { e.triggers = e.triggers.includes(v) ? e.triggers.filter(x => x !== v) : [...e.triggers, v]; ev.currentTarget.classList.toggle('on'); sv(); } }, l))), h('small.hint', '아무것도 고르지 않으면 언제나 발동할 수 있어요.'));
  const matchChecks = e => h('div.field', h('span.field-label', '메시지 말고 여기서도 키워드 찾기'), h('div.lore-chips', MATCH.map(([k, l]) => h(`button.chip${e[k] ? '.on' : ''}`, { type: 'button', onclick: ev => { e[k] = !e[k]; ev.currentTarget.classList.toggle('on'); sv(); } }, l))));
  const sec = (title, on, ...kids) => h('details.lore-sec', { open: on }, h('summary', title), h('div.lore-sec-body', kids));

  const bodyOf = (e, card) => {
    ready(e);
    const fix = () => { e.logic = +e.logic || 0; e.caseSensitive = tri(e.caseSensitive); e.wholeWord = tri(e.wholeWord); e.useGroupScoring = tri(e.useGroupScoring); sv(); };
    const main = form(e, [
      { k: 'name', label: '제목', half: true }, { k: 'position', label: '삽입 위치', type: 'select', opts: LORE_POS, half: true },
      e.position === 'depth' && { k: 'depth', label: '깊이 (끝에서 몇 번째 메시지 앞)', type: 'num', min: 0, half: true }, e.position === 'depth' && { k: 'role', label: '역할', type: 'select', opts: ['system', 'user', 'assistant'], half: true },
      e.position === 'outlet' && { k: 'outlet', label: '아울렛 이름', ph: '프리셋에서 {{outlet::이름}} 으로 불러옵니다' },
      { k: 'keys', label: '키워드', type: 'tags', ph: '쉼표로 구분 · /정규식/i 가능', half: true }, { k: 'keys2', label: '보조 키워드', type: 'tags', half: true },
      { k: 'logic', label: '보조 키워드 조건 (보조 키워드가 있을 때)', type: 'select', opts: [[0, '하나라도 포함'], [3, '모두 포함'], [2, '하나도 없음'], [1, '전부는 아님']] },
      { k: 'content', label: '내용', type: 'area', rows: 7 },
      { k: 'order', label: '우선순위 (클수록 먼저 · 뒤쪽에 놓임)', type: 'num', third: true }, { k: 'probability', label: '발동 확률 %', type: 'num', min: 0, max: 100, third: true }, { k: 'scanDepth', label: '이 항목만 살필 메시지 수', type: 'num', nullable: true, third: true, ph: '로어북 설정을 따름' },
      { k: 'constant', label: '상시 발동 (키워드 없이 항상)', type: 'check' },
      { k: 'vectorized', label: '벡터로 발동 (키워드가 없어도 뜻이 비슷하면) — 기능 › 벡터 검색을 켰을 때', type: 'check' },
    ], () => { fix(); if (e.position !== shownPos) drawEntries(); else { card.querySelector('.entry-head')?.replaceWith(headOf(e, card)); drawInfo(); } });   // 위치가 바뀌면 그 위치에 딸린 칸을 다시 그린다
    const shownPos = e.position;
    const cond = sec('발동 조건', !!(e.useRegex || e.caseSensitive != null || e.wholeWord != null || e.triggers.length || e.charFilter.names.length || e.charFilter.tags.length || MATCH.some(([k]) => e[k])),
      form(e, [{ k: 'caseSensitive', label: '대소문자 구분', type: 'select', opts: TRI, half: true }, { k: 'wholeWord', label: '단어 단위로만 (영문)', type: 'select', opts: TRI, half: true }, { k: 'useRegex', label: '키워드를 모두 정규식으로 읽기', type: 'check' }], fix),
      triggerChips(e), matchChecks(e),
      form(e, [{ k: 'charFilter.names', label: '캐릭터 조건 — 이름', type: 'tags', half: true, ph: '쉼표로 구분 · 비우면 모든 캐릭터' }, { k: 'charFilter.tags', label: '캐릭터 조건 — 태그', type: 'tags', half: true, ph: '쉼표로 구분' }, { k: 'charFilter.exclude', label: '위 캐릭터 · 태그일 때는 발동하지 않기 (반대로)', type: 'check' }], fix));
    const grp = sec('묶음 · 예산', !!(e.group || e.ignoreBudget),
      form(e, [{ k: 'group', label: '묶음 이름', half: true, ph: '같은 묶음에서는 하나만 발동 · 쉼표로 여러 묶음' }, { k: 'groupWeight', label: '추첨 가중치', type: 'num', min: 0, half: true },
        { k: 'groupOverride', label: '추첨하지 않고 우선순위가 가장 높은 항목으로 정하기', type: 'check' }, { k: 'useGroupScoring', label: '키워드가 더 많이 걸린 항목 먼저', type: 'select', opts: [['', '전체 설정을 따름'], ['true', '켬'], ['false', '끔']], half: true },
        { k: 'ignoreBudget', label: '토큰 예산이 모자라도 넣기', type: 'check' }], fix));
    const time = sec('시간 효과 · 연쇄', !!(e.sticky || e.cooldown || e.delay || e.noRecurse || e.excludeRecursion || +e.delayUntilRecursion || e.automationId),
      form(e, [{ k: 'sticky', label: '유지 (메시지 수)', type: 'num', nullable: true, third: true, ph: '없음' }, { k: 'cooldown', label: '쿨다운 (메시지 수)', type: 'num', nullable: true, third: true, ph: '없음' }, { k: 'delay', label: '지연 (대화가 이만큼 쌓인 뒤)', type: 'num', nullable: true, third: true, ph: '없음' },
        { k: 'noRecurse', label: '이 내용으로 다른 항목을 깨우지 않기', type: 'check' }, { k: 'excludeRecursion', label: '다른 항목의 내용으로는 깨어나지 않기', type: 'check' },
        { k: 'delayUntilRecursion', label: '연쇄 단계에서만 깨어나기 (단계 번호)', type: 'num', min: 0, half: true, hint: '0 은 끔. 1 이상이면 메시지로는 깨어나지 않고, 다른 항목이 불려 나온 뒤 그 단계에서만 살핍니다.' },
        { k: 'automationId', label: '자동 실행 이름', half: true, ph: '없음', hint: '이 항목이 발동하면 같은 이름을 가진 빠른 버튼이 실행됩니다.' }], fix));
    return h('div.entry-body', main, cond, grp, time);
  };

  const headOf = (e, card) => h('div.entry-head', { onclick: ev => { if (ev.target.closest('button,label,input')) return; open.has(e.id) ? open.delete(e.id) : open.add(e.id); drawEntries(); } },
    st.pick ? h('label.check.lore-pick', h('input', { type: 'checkbox', checked: picked.has(e.id), onchange: ev => { ev.target.checked ? picked.add(e.id) : picked.delete(e.id); drawBulk(); } }), h('i')) : null,
    h('label.switch', h('input', { type: 'checkbox', checked: e.enabled !== false, onchange: ev => { e.enabled = ev.target.checked; card.classList.toggle('off', !e.enabled); touch(); drawInfo(); } }), h('i')),
    h('div.lore-title', h('b', titleOf(e)), h('small', e.constant ? '상시 발동' : ((e.keys || []).slice(0, 5).join(', ') || '키워드 없음'))),
    h('div.lore-tags', e.constant ? h('em.badge', '상시') : null, e.group ? h('em.badge', e.group) : null, (e.probability ?? 100) < 100 ? h('em.badge', `${e.probability}%`) : null, (e.sticky || e.cooldown || e.delay) ? h('em.badge', '시간') : null, h('em.badge', POS_SHORT[e.position] || '설명 앞')),
    h('span.tokbadge', `≈${tokens(e.content)}`),
    iconBtn('more', '항목 메뉴', ev => menu(ev.currentTarget, [
      { label: '복제', ic: 'copy', onclick: () => { const c = { ...copy(e), id: uid(), name: (e.name || titleOf(e)) + ' (사본)' }; b.entries.splice(b.entries.indexOf(e) + 1, 0, c); open.add(c.id); touch(); drawEntries(); } },
      { label: '맨 위로', ic: 'up', onclick: () => { b.entries.splice(b.entries.indexOf(e), 1); b.entries.unshift(e); touch(); drawEntries(); } },
      S.lore.length > 1 && { label: '다른 로어북으로 옮기기', ic: 'book', onclick: ev2 => moveTo([e]) },
      '-',
      { label: '항목 삭제', ic: 'trash', danger: true, onclick: () => { b.entries.splice(b.entries.indexOf(e), 1); picked.delete(e.id); touch(); drawEntries(); } },
    ]), 'tiny'));

  const moveTo = async rows => {
    const others = S.lore.filter(x => x.id !== b.id); let box;
    box = modal({ title: `항목 ${rows.length}개를 옮길 로어북`, body: h('div.col', others.map(o => h('button.picker-row', { onclick: async () => { o.entries.push(...rows); b.entries = b.entries.filter(x => !rows.includes(x)); rows.forEach(r => picked.delete(r.id)); await S.save('lore', o, true); await save(); box.close(); toast(`"${o.name}"(으)로 옮겼어요`, 'ok'); redraw(); drawEntries(); } }, icon('book', 18), h('div.picker-text', h('b', o.name), h('small', `항목 ${o.entries.length}개`))))) });
  };

  function drawInfo() {
    const rows = view(), on = b.entries.filter(e => e.enabled !== false);
    info.textContent = `항목 ${b.entries.length}개 · 켜짐 ${on.length}개 · ≈${on.reduce((n, e) => n + tokens(e.content), 0).toLocaleString()} 토큰` + (rows.length !== b.entries.length ? ` · 조건에 맞는 항목 ${rows.length}개` : '');
  }
  function drawBulk() {
    const rows = view(), target = st.pick ? rows.filter(e => picked.has(e.id)) : rows, label = st.pick ? `고른 ${target.length}개` : (rows.length === b.entries.length ? '전체' : `보이는 ${rows.length}개`);
    const set = v => { target.forEach(e => { e.enabled = v; }); touch(); drawEntries(); };
    bulk.replaceChildren(
      h(`button.chip${st.pick ? '.on' : ''}`, { title: '항목을 골라서 한꺼번에 고칩니다', onclick: () => { st.pick = !st.pick; picked.clear(); drawEntries(); } }, '골라서 고치기'),
      st.pick ? h('button.chip', { onclick: () => { const all = rows.every(e => picked.has(e.id)); rows.forEach(e => all ? picked.delete(e.id) : picked.add(e.id)); drawEntries(); } }, '보이는 항목 모두 고르기') : null,
      h('span.lore-bulk-label', label),
      h('button.chip', { disabled: !target.length, onclick: () => set(true) }, '켜기'), h('button.chip', { disabled: !target.length, onclick: () => set(false) }, '끄기'),
      st.pick && S.lore.length > 1 ? h('button.chip', { disabled: !target.length, onclick: () => target.length && moveTo(target) }, '옮기기') : null,
      st.pick ? h('button.chip.danger', { disabled: !target.length, onclick: async () => { if (!target.length || !(await confirmBox(`항목 ${target.length}개를 삭제할까요?`, '삭제', true))) return; b.entries = b.entries.filter(e => !target.includes(e)); picked.clear(); touch(); drawEntries(); } }, '삭제') : null,
      h('i.lore-gap'),
      h('button.chip', { onclick: () => { const vis = rows.slice(0, st.shown); const all = vis.length && vis.every(e => open.has(e.id)); vis.forEach(e => all ? open.delete(e.id) : open.add(e.id)); drawEntries(); } }, rows.slice(0, st.shown).length && rows.slice(0, st.shown).every(e => open.has(e.id)) ? '모두 접기' : '모두 펼치기'));
  }
  function drawEntries() {
    const rows = view(), vis = rows.slice(0, st.shown);
    list.replaceChildren(...vis.map(e => {
      const card = h(`div.entry${open.has(e.id) ? '.open' : ''}${e.enabled !== false ? '' : '.off'}`);
      card.append(headOf(e, card)); if (open.has(e.id)) card.append(bodyOf(e, card));
      return card;
    }),
    rows.length > vis.length ? h('button.room-more.lore-more', { onclick: () => { st.shown += PAGE * 2; drawEntries(); } }, `항목 ${rows.length - vis.length}개 더 보기`) : null,
    !rows.length ? h('p.dim.pad', b.entries.length ? '조건에 맞는 항목이 없어요.' : '아직 항목이 없어요. "항목 추가"로 첫 설정을 적어 보세요.') : null);
    drawInfo(); drawBulk();
  }
  const search = h('input.inp.search', { placeholder: '제목 · 키워드 · 내용 · 묶음에서 찾기', oninput: debounce(ev => { st.q = ev.target.value; st.shown = PAGE; drawEntries(); }, 180) });
  const sel = (opts, key) => h('select.inp', { onchange: ev => { st[key] = ev.target.value; st.shown = PAGE; drawEntries(); } }, opts.map(([v, l]) => h('option', { value: v }, l)));
  const bar = h('div.lore-bar', search,
    sel([['all', '모든 항목'], ['on', '켜진 항목'], ['off', '꺼진 항목'], ['constant', '상시 발동'], ['keyed', '키워드 발동'], ['grouped', '묶음이 있는 항목'], ['timed', '시간 효과가 있는 항목'], ['filtered', '조건이 걸린 항목']], 'filter'),
    sel([['list', '목록 순서'], ['order', '우선순위 높은 순'], ['name', '이름순'], ['tok', '토큰 많은 순']], 'sort'));
  drawEntries();

  const links = loreLinks(b), powerText = h('small');
  const drawPower = () => { const on = S.settings.activeLore.includes(b.id); powerText.textContent = on ? '모든 대화에서 쓰이는 중' : links.length ? `꺼짐 · 묶어 둔 곳(${links.join(' · ')})에서만 쓰여요` : '꺼짐 · 어느 대화에서도 쓰이지 않아요'; };
  drawPower();
  return h('div.editor.lore-editor',
    h('header.editor-head', h('h2', b.name), h('div.row',
      btn('항목 추가', { ic: 'plus', cls: 'primary', onclick: () => { const e = newEntry(); b.entries.unshift(e); open.add(e.id); st.q = ''; search.value = ''; st.filter = 'all'; bar.querySelectorAll('select')[0].value = 'all'; save(); drawEntries(); redraw(); } }),
      iconBtn('play', '발동 시험', () => testDialog(b)),
      iconBtn('sliders', '로어북 전체 설정', loreSettingsDialog),
      iconBtn('import', '실리태번 형식으로 내보내기', () => download(`${b.name}.json`, JSON.stringify(loreToWorld(b), null, 2))),
      iconBtn('trash', '로어북 삭제', async () => { if (await confirmBox(`"${b.name}" 로어북을 삭제할까요?`, '삭제', true)) { await S.remove('lore', b.id); S.set({ activeLore: S.settings.activeLore.filter(i => i !== b.id) }); refresh(); } }))),
    h('div.lore-power', loreSwitch(b, () => { drawPower(); redraw(); }), h('div', h('b', '이 로어북 켜기'), powerText)),
    form(b, [{ k: 'name', label: '이름', half: true }, { k: 'description', label: '설명', half: true }, { k: 'scanDepth', label: '최근 몇 개 메시지를 살필지', type: 'num', min: 0, half: true }, { k: 'tokenBudget', label: '토큰 예산', type: 'num', half: true },
      { k: 'recursive', label: '연쇄 발동 — 불려 나온 내용에 든 키워드로 다른 항목도 깨우기', type: 'check' }, { k: 'caseSensitive', label: '대소문자 구분 (항목에서 따로 정하지 않았을 때)', type: 'check' }, { k: 'wholeWord', label: '단어 단위로만 (항목에서 따로 정하지 않았을 때)', type: 'check' }], () => { sv(); }),
    h('p.hint', '캐릭터 편집 화면에서는 캐릭터에, 페르소나 화면에서는 페르소나에, 대화의 장면 패널에서는 그 대화방에만 묶을 수 있습니다.'),
    h('div.lore-tools', bar, h('div.lore-status', info), bulk),
    list);
}

/** 이 로어북이 따로 묶인 곳 (꺼 두어도 여기서는 쓰인다) */
export const loreLinks = b => { const n = list => list.filter(x => (x.loreIds || []).includes(b.id)).length, c = n(S.chars), p = n(S.personas), r = n(S.chats); return [c && `캐릭터 ${c}`, p && `페르소나 ${p}`, r && `대화방 ${r}`].filter(Boolean); };
/** 로어북 켜고 끄기: 켜면 모든 대화에서 쓰인다. 목록과 편집기의 스위치가 서로 맞춰진다 */
export function loreSwitch(b, after) {
  const input = h('input', { type: 'checkbox', checked: S.settings.activeLore.includes(b.id), dataset: { loreSw: b.id }, onchange: e => {
    const on = e.target.checked; S.set({ activeLore: on ? [...new Set([...S.settings.activeLore, b.id])] : S.settings.activeLore.filter(i => i !== b.id) });
    for (const x of document.querySelectorAll('input[data-lore-sw]')) if (x.dataset.loreSw === b.id) x.checked = on;
    after?.(on);
  } });
  return h('label.switch.lore-sw', { title: '모든 대화에서 켜기 / 끄기', onclick: e => e.stopPropagation() }, input, h('i'));
}

/** 로어북 고르기 (페르소나 · 그 밖의 묶을 곳). holder.loreIds 를 고친다 */
export function lorePicker(holder, save, hint = '') {
  return h('div.card.lore-link', h('h3.form-sec', '로어북'), hint && h('p.hint', hint), loreLinker(holder, save));
}

/** 연결한 로어북만 꼬리표로 보여 주고, 더 고를 때는 찾기 창을 연다 (로어북이 아주 많아도 화면이 길어지지 않게).
 *  fixed(): 여기서 끊을 수 없는 것들 [[로어북, '전역' | '캐릭터'], …] */
export function loreLinker(holder, save, { fixed = () => [] } = {}) {
  holder.loreIds ||= [];
  const box = h('div.lore-linked');
  const mine = () => { const fx = new Set(fixed().map(([b]) => b.id)); return holder.loreIds.filter(id => S.get('lore', id) && !fx.has(id)); };
  const toggle = id => { holder.loreIds = holder.loreIds.includes(id) ? holder.loreIds.filter(i => i !== id) : [...holder.loreIds, id]; save(); };
  const draw = () => {
    const fx = fixed(), ids = mine();
    box.replaceChildren(
      fx.length || ids.length ? h('div.lore-chips', fx.map(([b, tag]) => h('span.chip.lore-chip.fixed', { title: `${tag} 로어북이라 여기서는 끊을 수 없어요` }, h('span', b.name), h('small', tag))),
        ids.map(id => h('span.chip.on.lore-chip', h('span', S.get('lore', id).name), h('button', { type: 'button', title: '연결 끊기', 'aria-label': '연결 끊기', onclick: () => { toggle(id); draw(); } }, '×')))) : h('small.hint', '연결한 로어북이 없어요.'),
      btn(ids.length ? '로어북 고르기' : '로어북 연결', { ic: 'plus', cls: 'ghost', onclick: open }));
  };
  const open = () => {
    if (!S.lore.length) return toast('로어북이 아직 없어요. 로어북 화면에서 먼저 만들어 주세요.');
    const fx = new Map(fixed().map(([b, tag]) => [b.id, tag])), on = new Set(holder.loreIds);
    const all = [...S.lore].sort((a, b) => (on.has(b.id) || fx.has(b.id)) - (on.has(a.id) || fx.has(a.id)));   // 열 때 한 번만: 연결된 것 먼저
    const list = h('div.lore-picklist'), count = h('small.hint'); let q = '';
    const drawList = () => {
      const hit = all.filter(b => !q || `${b.name} ${b.description || ''}`.toLowerCase().includes(q));
      count.textContent = `${S.lore.length}개 중 ${mine().length}개 연결됨${q ? ` · 찾은 것 ${hit.length}개` : ''}`;
      list.replaceChildren(...(hit.length ? hit.map(b => h('label.check.lore-pickrow', h('input', { type: 'checkbox', checked: fx.has(b.id) || holder.loreIds.includes(b.id), disabled: fx.has(b.id), onchange: () => { toggle(b.id); count.textContent = `${S.lore.length}개 중 ${mine().length}개 연결됨${q ? ` · 찾은 것 ${hit.length}개` : ''}`; } }), h('i'),
        h('span', b.name), h('small', fx.get(b.id) || `항목 ${b.entries.length}개`))) : [h('p.dim', '찾는 로어북이 없어요.')]));
    };
    drawList();
    modal({ title: '로어북 고르기', body: h('div.col', h('input.inp', { placeholder: '이름 · 설명으로 찾기', oninput: e => { q = e.target.value.trim().toLowerCase(); drawList(); } }), count, list), onClose: draw, actions: [{ label: '닫기', cls: 'primary' }] });
  };
  draw(); return box;
}
