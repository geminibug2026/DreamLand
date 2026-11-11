// ── Dreamland 장기기억 화면 (기억 · 세계 · 이야기) — 기억 탭 · 세계 탭 · 이야기 탭.
//    f-memoria.js 가 도우미 묶음(ui)을 넘겨 부른다. 그림(HTML · SVG 문자열)은 memoria-story.js, 표 · 연표 자료는 memoria-scene.js 가 만든다.
//    이 화면들은 모델을 부르지 않는다 (「지금 요약」 · 「다시 만들기」 버튼만 사서를 부른다) ──
import { h, uid, now, download, pickFiles } from './core.js';
import { icon, btn, toast, confirmBox, promptBox, modal, route, go } from './ui.js';
import { Memory, KINDS, LOCKS, VIS, SCOPES, DOSSIER_MAX, fmtDays, chunkDossier } from './memory.js';
import { chatApi } from './chat.js';
import { buildTimelineRows, filterTimelineRows, layoutTimelineGraph, timelineMarkdown, timelineCsv } from './memoria-scene.js';
import { heroHtml, pulseSvg, flowHtml, railHtml, tableHtml, bondMapSvg, bondCardsHtml, statusListHtml } from './memoria-story.js';
import { THREAD_KINDS } from './memoria-craft.js';

// ════════ 작은 도구 ════════
const GL = { anchor: 'M12 8a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5zM12 8v13M8 12h8M4 13a8 8 0 0 0 16 0', sprout: 'M12 21v-9M12 12c0-4-3-6-7-6 0 4 3 6 7 6zM12 15c0-3 2.5-5 6.5-5 0 3-2.5 5-6.5 5z', quote: 'M5 17c2-1 3-3 3-5H5V7h5v5c0 3-2 5-4 6zM14 17c2-1 3-3 3-5h-3V7h5v5c0 3-2 5-4 6z' };
const gi = (name, size = 14) => { const s = icon('x', size); s.innerHTML = `<path d="${GL[name]}" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/>`; return s; };
const cut = (s, n = 400) => String(s ?? '').replace(/\s+/g, ' ').trim().slice(0, n);
const cutLines = (s, n = 2000) => String(s ?? '').replace(/\r/g, '').split('\n').map(l => l.replace(/[ \t]+/g, ' ').trimEnd()).join('\n').replace(/\n{3,}/g, '\n\n').trim().slice(0, n);
const LOCK_KO = { ...LOCKS, foreshadow: LOCKS.foreshadow || '복선' };
const LINES_MAX = 6, GROWTH_MAX = 5, MANUAL_MAX = 2000;   // 인물 칸의 상한
const HAND = 0;   // 직접 적은 달라진 점 · 남긴 말의 턴
const bondNow = b => b?.log?.[b.log.length - 1] || null;
const bondViewRows = mem => (mem.bonds || []).filter(b => !b.disabled && bondNow(b)).map(b => ({ id: b.id, from: b.from, to: b.to, stage: bondNow(b).stage, log: b.log }));
/** 이야기 속 시간 — 끊는 자리 (시간 · 일 · 주 · 개월 · 년) */
const koDuration = d => d < 1 ? `${Math.max(1, Math.round(d * 24))}시간` : d < 14 ? `${Math.round(d)}일` : d < 60 ? `${Math.round(d / 7)}주` : d < 365 * 2 ? `${Math.round(d / 30)}개월` : `${Math.round(d / 365)}년`;
const sceneSlot = (mem, slot) => { for (let i = mem.status.length - 1; i >= 0; i--) { const s = mem.status[i]; if (String(s.entity || '').toLowerCase() === 'scene' && String(s.slot || '').toLowerCase() === slot) return s.value; } return ''; };
/** 메시지 id → 화면에 보이는 번호(#1부터) */
const noMap = st => new Map(st.msgs.map((m, i) => [m.id, i + 1]));
/** 서고를 memoria-scene.js 가 기대하는 모양으로 (턴 번호는 화면에 보이는 t1부터, 메시지는 #번호) */
function storeOf(st, no = noMap(st)) {
  const mem = st.mem, n = id => no.get(id) ?? -1;
  return {
    turns: mem.turns.map((t, i) => ({ turnIndex: i + 1, mesId: n(t.msgId), when: t.when || '', where: t.where || '', importance: t.weight, summary: t.digest || '', failed: !!t.failed })),
    memories: mem.memories.map(m => ({ id: m.id, kind: m.kind, disabled: m.disabled, importance: m.importance, tags: m.tags || [], turnIndex: (m.turn ?? -1) + 1, mesId: n(m.msgId), entities: m.entities || [], summary: m.summary, visibility: m.visibility })),
    milestones: mem.milestones.map(e => ({ id: e.id, turnIndex: (e.turn ?? -1) + 1, participants: e.participants || [], title: e.title, summary: e.summary, grade: e.grade })),
  };
}
const storyState = st => st.story ||= { tab: 'flow', by: 'people', query: '', minStars: 0, sort: 'order', desc: false, open: '', bond: '', focus: '', busy: null, prog: '' };
/** 그 번호의 메시지로 간다 (열려 있는 대화일 때) */
function jumpTo(st, n) {
  const msg = st.msgs[n - 1];
  if (!msg || chatApi.current().chat?.id !== st.chat?.id) return toast(`#${n} 메시지는 지금 화면에 불러와져 있지 않아요.`);
  st.close?.(); if (route.page !== 'chat') go('chat', st.chat.id);
  setTimeout(() => { chatApi.scrollTo(msg.id); const el = document.querySelector(`article.msg[data-id="${msg.id}"]`); if (el) { el.classList.add('mm-flash'); setTimeout(() => el.classList.remove('mm-flash'), 1600); } }, 300);
}
const onJump = st => e => { const j = e.target.closest?.('.mm-st-jump'); if (j) { e.preventDefault(); e.stopPropagation(); jumpTo(st, +j.dataset.mes); } };

// ════════ 기억 ════════
const memDefs = owners => [
  { k: 'summary', label: '기억', type: 'area', rows: 3 }, { k: 'kind', label: '종류', type: 'select', opts: Object.entries(KINDS), third: true }, { k: 'visibility', label: '누가 아는가', type: 'select', opts: Object.entries(VIS), third: true }, { k: 'owner', label: '소유자 (개인 · 비밀일 때)', third: true, ph: owners.join(', ') },
  { k: 'knowers', label: '아는 사람 (개인 · 비밀일 때 — 소유자 말고도 이 일을 아는 인물)', type: 'tags', hint: '비밀은 누가 아는지까지 적어야 지켜집니다. 소유자만 적으면 함께 아는 인물까지 모르는 척하게 됩니다. 공개 기억에서는 비워집니다.' },
  { k: 'importance', label: '중요도', type: 'range', min: 0, max: 1, step: 0.05 }, { k: 'quote', label: '발췌 (본문 그대로 한 줄)' },
  { k: 'entities', label: '개체 (등장인물)', type: 'tags', half: true }, { k: 'hints', label: '떠올릴 단서', type: 'tags', half: true }, { k: 'tags', label: '태그', type: 'tags', half: true }, { k: 'trigger', label: '트리거 (정규식 — 입력이 맞으면 반드시 불러옵니다)', half: true, ph: '반지|ring' },
  { k: 'pinned', label: '고정 (예산 안에서 우선 주입)', type: 'check' }, { k: 'disabled', label: '비활성화', type: 'check' }];
async function editMem(st, ui, m) {
  const mem = st.mem, owners = [...new Set([...mem.cast.map(c => c.name), ...mem.memories.map(x => x.owner).filter(Boolean)])];
  const d = await ui.editBox(m ? '기억 내용 수정' : '기억 추가 (수동 기억은 자동 정리에서 제외됩니다)', m ? { knowers: [], ...m } : { kind: 'fact', summary: '', quote: '', importance: 0.8, entities: [], tags: ['manual'], hints: [], visibility: 'public', owner: '', knowers: [], trigger: '', pinned: false, disabled: false }, memDefs(owners), { wide: true });
  if (!d || !d.summary?.trim()) return;
  d.summary = cut(d.summary, MANUAL_MAX);
  // 아는 사람은 비공개 기억에만 남긴다 — 이름은 인물 카드의 표기로 맞춘다
  d.knowers = (d.visibility || 'public') === 'public' ? [] : [...new Set((d.knowers || []).map(e => Memory.canonName(mem, cut(e, 60))).filter(Boolean))].slice(0, 6);
  if (m) { if (d.summary !== m.summary) { d.manual = true; delete m.av; } Object.assign(m, d); delete m.av; await Memory.save(mem); }   // 직접 다듬은 기억은 스와이프 롤백 · 상한 정리 · 서고 정리에서 보호한다
  else { await Memory.add(st.chat.id, d); toast('기억을 추가했습니다.', 'ok'); }
  st.draw();
}
export function vMemories(st, ui) {
  const mem = st.mem, no = noMap(st), owners = [...new Set(mem.memories.map(m => m.owner).filter(Boolean))];
  const sorts = { new: (a, b) => (b.turn ?? 0) - (a.turn ?? 0) || (b.ts || 0) - (a.ts || 0), imp: (a, b) => (b.importance || 0) - (a.importance || 0), echo: (a, b) => (b.echoes || 0) - (a.echoes || 0) || (b.shown || 0) - (a.shown || 0) };
  const save = async () => { await Memory.save(mem); drawList(); };
  const card = m => { const n = no.get(m.msgId) ?? -1, others = (m.knowers || []).filter(k => k && k !== m.owner), hidden = (m.visibility || 'public') !== 'public';
    return h(`article.mm-card${m.disabled ? '.off' : ''}${m.pinned ? '.pinned' : ''}`,
      h('header', ui.kindBadge(m.kind), n >= 0 ? h('button.mm-st-jump', { type: 'button', title: '채팅 메시지 번호 — 누르면 그 메시지로', dataset: { mes: n } }, `#${n}`) : h('span.mm-turn', { title: '이 대화에 원문이 없는 기억' }, ui.turnTag(mem, m)),
        h('span.mm-vis', { title: `${VIS[m.visibility] || VIS.public}${m.owner ? ` (소유: ${m.owner})` : ''}${others.length ? ` · 아는 사람: ${others.join(', ')}` : ''}` }, ui.ico(ui.VIS_IC[m.visibility] || 'globe', 13), hidden && (m.owner || VIS[m.visibility])),
        h('span.mm-imp', { title: '중요도' }, ui.meter(m.importance || 0, 1), ui.pct(m.importance)), m.shown ? h('span.mm-echo', { title: '프롬프트에 실린 횟수 · 답변에 반영된 횟수' }, `실림 ${m.shown} · 반영 ${m.echoes || 0}`) : null,
        h('span.mm-actions', ui.ib('book', '대화 원문 확인', () => ui.showSource(st, m)), ui.ib('pin', m.pinned ? '고정 해제' : '예산 안에서 우선 주입(고정)', () => { m.pinned = !m.pinned; save(); }, m.pinned ? 'on' : ''),
          ui.ib(m.disabled ? 'eyeoff' : 'eye', m.disabled ? '활성화' : '비활성화', () => { m.disabled = !m.disabled; save(); }), ui.ib('edit', '편집', () => editMem(st, ui, m)), ui.del(st, 'memories', m, '이 기억'))),
      h('p.mm-sum', m.summary), m.quote && h('blockquote', `"${m.quote}"`),
      (m.entities || []).length || (m.tags || []).length || (m.hints || []).length || m.trigger || (hidden && others.length) ? h('div.mm-chips', hidden && others.length ? h('span.mm-chip.know', { title: '소유자 말고도 이 일을 아는 인물' }, ui.ico(ui.VIS_IC[m.visibility] || 'lock', 11), `아는 사람 · ${others.join(', ')}`) : null,
        (m.entities || []).map(e => ui.chip('@' + e, 'ent')), (m.tags || []).map(t => ui.chip('#' + t)), (m.hints || []).map(t => ui.chip('?' + t, 'hint')), m.trigger && ui.chip('⚑ ' + m.trigger, 'trig')) : null); };
  const count = h('small.hint'), listEl = h('div.mm-list.mm-st-results');
  // 검색칸에 글을 치는 동안에는 목록만 갈아 끼운다 — 검색칸까지 새로 그리면 한글 조합이 끊긴다
  function drawList() {
    const q = String(st.q || '').toLowerCase();
    const items = mem.memories.filter(m => (!st.kind || m.kind === st.kind) && (!st.vis || m.visibility === st.vis) && (!st.owner || m.owner === st.owner || (m.knowers || []).includes(st.owner)) && (st.only !== 'pin' || m.pinned) && (st.only !== 'off' || m.disabled) && (st.only !== 'manual' || m.manual) && (st.only !== 'ep' || (m.tags || []).includes('episode_raw')) && (st.only !== 'noep' || !(m.tags || []).includes('episode_raw'))
      && (!q || `${m.summary} ${m.quote || ''} ${(m.entities || []).join(' ')} ${(m.tags || []).join(' ')} ${(m.hints || []).join(' ')} ${(m.knowers || []).join(' ')}`.toLowerCase().includes(q))).sort(sorts[st.sort] || sorts.new);
    count.textContent = `${mem.memories.length}개 중 ${items.length}개${items.length > 200 ? ' (앞의 200개만 보여 줍니다)' : ''}`;
    listEl.replaceChildren(...items.slice(0, 200).map(card), ...(items.length ? [] : [ui.none(mem.memories.length ? '표시할 기억이 없습니다.' : '아직 기록된 기억이 없습니다. 답변이 오면 사서가 자동으로 기록합니다.')]));
  }
  const sel = (key, opts, title, full) => h('select.inp.auto', { title, onchange: e => { st[key] = e.target.value; full ? st.draw() : drawList(); } }, opts.map(([v, l]) => h('option', { value: v, selected: (st[key] || '') === v }, l)));
  const search = h('input.inp', { type: 'search', placeholder: '요약·발췌·개체·태그 검색…', value: st.q || '', oninput: e => { st.q = e.target.value; drawList(); } });
  const kinds = Object.keys(KINDS).map(k => [k, mem.memories.filter(m => m.kind === k).length]).filter(x => x[1]);
  const people = [...new Set([...owners, ...mem.memories.flatMap(m => m.knowers || [])])];
  drawList();
  return h('div.mm-view', { onclick: onJump(st) }, ui.sec('기억 브라우저', '고정(핀)한 기억은 토큰 예산 안에서 우선 주입됩니다. 책 아이콘으로 대화 원문을 확인할 수 있습니다.', btn('추가', { ic: 'plus', title: '기억 추가', onclick: () => editMem(st, ui) }),
    h('div.mm-toolbar', search, sel('kind', [['', '전체'], ...Object.entries(KINDS)], '종류', true), sel('vis', [['', '모든 공개 범위'], ...Object.entries(VIS)], '공개 범위'), people.length ? sel('owner', [['', '아는 사람 전체'], ...people.map(o => [o, o])], '소유자이거나 아는 사람') : null,
      sel('sort', [['new', '최신순'], ['imp', '중요도순'], ['echo', '자주 쓰인 순']], '정렬'), sel('only', [['', '전체'], ['pin', '고정한 것'], ['manual', '수동 기억'], ['off', '비활성화한 것'], ['noep', '사서가 고른 기억만'], ['ep', '턴 원문 증거만']], '걸러 보기')),
    kinds.length ? h('div.mm-kindbar', kinds.map(([k, n]) => h(`button.mm-kindchip.k-${ui.safe(k)}${st.kind === k ? '.on' : ''}`, { type: 'button', onclick: () => { st.kind = st.kind === k ? '' : k; st.draw(); } }, KINDS[k], h('small', String(n))))) : null,
    count, listEl));
}

// ════════ 세계: 인물 도감 · 관계선 · 아이템 도감 · 서약 · 캐논 · 상태 보드 · 자료실 ════════
/** 인물 편집 — 칸과 상한.
 *  달라진 점 · 남긴 말은 문구가 그대로면 원래 적힌 턴을 지키고, 새로 적은 것은 직접 적음으로 둔다 — 직접 적은 남긴 말은 고정이라 밀려나지 않는다. */
async function editCard(st, ui, c) {
  const mem = st.mem, T = mem.turns.length, src = c || { name: '', role: '', age: '', occupation: '', appearance: '', voice: '', core: '' };
  const draft = { name: src.name || '', aka: [...(src.aka || [])], role: src.role || '', age: src.age || '', occupation: src.occupation || '', appearance: src.appearance || '', voice: src.voice || '', core: src.core || '', traits: [...(src.traits || [])],
    rel: (src.relationships || []).map(r => `${r.target} = ${r.relation}`), growthTexts: (src.growth || []).map(g => g.text), lineTexts: (src.lines || []).map(l => l.text), provisional: !!src.provisional };
  const d = await ui.editBox(c ? `${c.name} — 인물 정보 수정` : '인물 추가', draft, [
    { k: 'name', label: '이름', half: true }, { k: 'aka', label: '별칭', type: 'tags', half: true }, { k: 'role', label: '역할', third: true }, { k: 'age', label: '나이', third: true }, { k: 'occupation', label: '직업', third: true },
    { k: 'appearance', label: '외모', type: 'area', rows: 2 }, { k: 'voice', label: '말투', type: 'area', rows: 2 },
    { k: 'core', label: '바탕', type: 'area', rows: 3, hint: '한 번 적히면 사서가 다시 쓰지 못하는 기준입니다. 여기서만 고칠 수 있어요. 비우면 사서가 다시 적을 수 있습니다.' }, { k: 'traits', label: '특성', type: 'tags' },
    { k: 'rel', label: '관계 (한 줄에 하나, 이름 = 관계)', type: 'lines', ph: '아리아 = 소꿉친구' },
    { k: 'growthTexts', label: `달라진 점 (한 줄에 하나 · ${GROWTH_MAX}개까지)`, type: 'lines', ph: '이야기 속에서 생긴 변화 — 바탕 위에 천천히 얹힙니다' },
    { k: 'lineTexts', label: `남긴 말 (한 줄에 하나 · ${LINES_MAX}개까지)`, type: 'lines', ph: '실제로 한 대사 — 장면에 있을 때 말투 견본으로 실립니다', hint: '직접 적은 말은 고정이라 새 대사에 밀려나지 않습니다. 줄을 지우면 그 말이 빠집니다.' },
    { k: 'provisional', label: '아직 이름이 밝혀지지 않은 인물 (미확인)', type: 'check' }], { wide: true });
  if (!d || !cut(d.name, 60)) return;
  const prof = { name: cut(d.name, 60), aka: (d.aka || []).map(a => cut(a, 60)).filter(Boolean).slice(0, 6), role: cut(d.role, 200) || null, age: cut(d.age, 200) || null, occupation: cut(d.occupation, 200) || null, appearance: cut(d.appearance, 200) || null, voice: cut(d.voice, 200) || null, core: cut(d.core, 500) || null,
    traits: (d.traits || []).map(t => cut(t, 40)).filter(Boolean).slice(0, 10), relationships: (d.rel || []).map(l => { const [t, ...r] = l.split('='); return { target: cut(t, 60), relation: cut(r.join('='), 80) }; }).filter(r => r.target && r.relation).slice(0, 10), provisional: !!d.provisional };
  const oldG = new Map((c?.growth || []).map(g => [g.text, g])), oldL = new Map((c?.lines || []).map(l => [l.text, l]));
  const growth = (d.growthTexts || []).map(t => cut(t, 200)).filter(Boolean).map(t => oldG.get(t) || { text: t, turn: HAND }).slice(-GROWTH_MAX);
  const lines = (d.lineTexts || []).map(t => cut(t, 160)).filter(Boolean).map(t => oldL.get(t) || { text: t, turn: HAND, pinned: true }).slice(-LINES_MAX);
  const wasLocked = c?.locked;
  if (c) { Object.assign(c, prof, { growth, lines, manual: true }); if (!c.core) c.coreTurn = null; if (Memory.cfg().lockEdited !== false) c.locked = true; }   // 직접 고친 프로필은 기본적으로 잠근다 — 애써 고쳐 놔도 사서가 되돌려 놓는 일을 막는다
  else { mem.cast.push({ id: uid(), ...prof, growth, lines, coreTurn: null, manual: true, first: T, updated: T }); toast('인물을 추가했습니다.', 'ok'); }
  const folded = Memory.foldAliases(mem);   // 별칭을 손봤다면 그 이름으로 갈라져 있던 상태 · 기억도 바로 이 카드로 접는다
  await Memory.save(mem); st.draw();
  if (folded.states || folded.memories) toast(`별칭으로 갈라져 있던 기록을 합쳤습니다 — 상태 ${folded.states}건 · 기억 ${folded.memories}건`, 'ok');
  if (c && c.locked && !wasLocked) toast(`"${c.name}" 프로필을 고정했습니다. 자물쇠 아이콘으로 해제할 수 있습니다.`);
}
/** 관계선 추가 · 지금 단계 고치기 — 방향(누가 → 누구에게)은 줄의 정체라 고칠 때는 바꾸지 않는다 */
async function editBond(st, ui, b) {
  const mem = st.mem, cur = b ? bondNow(b) : null, names = mem.cast.map(c => c.name).join(', ');
  const d = await ui.editBox(b ? `${b.from} → ${b.to} — 지금 단계 고치기 (이전 단계는 지나온 길로 남습니다)` : '관계선 추가 — 한 사람이 다른 한 사람을 지금 어떻게 대하는지 (방향이 있어요)',
    { from: b?.from || '', to: b?.to || '', stage: cur?.stage || '', basis: cur?.basis || '', calls: cur?.calls || '', unsaid: cur?.unsaid || '' }, [
      !b && { k: 'from', label: '누가', half: true, ph: names }, !b && { k: 'to', label: '누구에게', half: true, ph: names },
      { k: 'stage', label: '지금 단계' }, { k: 'basis', label: '근거 (그렇게 보게 된 장면)' }, { k: 'calls', label: '부르는 말', half: true }, { k: 'unsaid', label: '말하지 못한 것', half: true }], { wide: true });
  if (!d) return;
  const f = { from: b ? b.from : cut(d.from, 60), to: b ? b.to : cut(d.to, 60), stage: cut(d.stage, 120), basis: cut(d.basis, 200), calls: cut(d.calls, 100), unsaid: cut(d.unsaid, 160) };
  if (!f.from || !f.to || !f.stage) return toast('누가 · 누구에게 · 지금 단계는 꼭 적어 주세요.', 'err');
  try {
    if (!Array.isArray(mem.bonds)) mem.bonds = [];
    const row = Memory.upsertBond(mem, f, mem.turns.length, { manual: true });
    if (!row) return toast('같은 인물끼리는 관계선을 만들 수 없습니다.', 'err');
    row.disabled = false; await Memory.save(mem); st.draw();
  } catch (e) { console.error(e); toast(e.message || String(e), 'err'); }
}
export function vWorld(st, ui) {
  const mem = st.mem, cfg = Memory.cfg(), T = mem.turns.length, bonds = mem.bonds || [];
  const tog = (x, key, onT, offT, onI = 'eye', offI = 'eyeoff', after) => ui.ib(x[key] ? offI : onI, x[key] ? offT : onT, async () => { x[key] = !x[key]; await Memory.save(mem); st.draw(); after?.(x); }, x[key] && key === 'locked' ? 'on' : '');
  const pline = (ic, title, ...body) => h('p.mm-pline', { title }, ic, h('span', body));
  const row = (cls, text, ...tools) => h(`div.mm-row${cls ? '.' + cls : ''}`, h('div.mm-row-text', text), tools);

  // ── 인물 도감
  const cast = [...mem.cast].sort((a, b) => (b.updated || 0) - (a.updated || 0));
  const dropLine = async (c, l) => { if (!(await confirmBox(`남긴 말 “${cut(l.text, 40)}”을(를) 지울까요?`, '지우기', true))) return; c.lines = c.lines.filter(x => x !== l); await Memory.save(mem); st.draw(); };
  const castSec = ui.sec('인물 도감', ['대화에 등장한 인물의 프로필입니다. ', h('b', '바탕'), '(', gi('anchor', 12), ')은 한 번 적히면 사서가 다시 쓰지 못하는 기준이고, 이야기 속에서 생긴 변화(', gi('sprout', 12), ')와 실제로 한 대사(', gi('quote', 12), ')는 따로 쌓입니다. 연필로 모두 직접 고칠 수 있습니다.'], btn('추가', { ic: 'plus', title: '인물 추가', onclick: () => editCard(st, ui) }),
    h('div.mm-cast', cast.map(c => h(`article.mm-person${c.disabled ? '.off' : ''}${c.locked ? '.locked' : ''}`,
      h('header', h('i.mm-initial', (c.name || '?').trim().slice(0, 1)), h('div.mm-person-name', h('b', c.name), h('small', [c.role, c.age, c.occupation].filter(Boolean).join(' · '))),
        c.provisional && h('em.mm-tag.dash', { title: '아직 이름이 밝혀지지 않은 인물 — 정체가 드러나면 자동 병합됩니다' }, '미확인'), c.locked && h('em.mm-tag', { title: '프로필 고정 — 사서가 이 카드의 이름·나이·외모·말투·특성을 바꾸지 못합니다 (관계만 계속 갱신)' }, '고정')),
      (c.aka || []).length ? h('p.mm-meta', '별칭: ' + c.aka.join(', ')) : null, c.appearance && h('p', c.appearance),
      c.core && pline(gi('anchor', 13), '바탕 — 한 번 적히면 사서가 다시 쓰지 못합니다. 연필로만 고칠 수 있어요', c.core),
      c.voice && h('p.mm-voice', { title: '말투' }, ui.ico('chat', 13), c.voice),
      (c.growth || []).length ? pline(gi('sprout', 13), '달라진 점 — 이야기 속에서 생긴 변화. 바탕 위에 천천히 얹힙니다', c.growth.map(g => g.text).join(' · ')) : null,
      (c.lines || []).length ? h('div.mm-pline.mm-said', { title: '남긴 말 — 실제로 한 대사. 장면에 있을 때 말투 견본으로 실립니다' }, gi('quote', 13), h('span', c.lines.map(l => h(`q${l.pinned ? '.pin' : ''}`, { title: l.pinned ? '직접 적은 말 — 고정이라 밀려나지 않습니다' : l.msgId != null && l.turn != null ? `t${l.turn + 1}` : '' }, l.text, h('button', { type: 'button', title: '이 말 지우기', 'aria-label': '이 말 지우기', onclick: () => dropLine(c, l) }, '×'))))) : null,
      (c.traits || []).length ? h('div.mm-chips', c.traits.map(t => ui.chip(t))) : null, (c.relationships || []).length ? h('div.mm-chips', c.relationships.map(r => h('span.mm-chip.rel', ui.ico('link', 12), `${r.target}: ${r.relation}`))) : null,
      h('footer', tog(c, 'locked', '프로필 고정 — 사서가 이 카드의 프로필을 바꾸지 못하게 잠급니다 (관계는 계속 갱신)', '프로필 고정 해제 — 사서가 다시 갱신합니다', 'unlock', 'lock', x => toast(x.locked ? `"${x.name}" 프로필을 고정했습니다. 사서가 더는 바꾸지 않습니다. (관계는 계속 갱신)` : `"${x.name}" 프로필 고정을 해제했습니다.`)),
        tog(c, 'disabled', '주입·기록에서 제외 (사서가 이 인물을 다시 등록하지 않음)', '주입에 포함'), ui.ib('merge', '다른 카드를 이 카드로 병합', () => ui.mergeCast(st, c)), ui.ib('edit', '편집', () => editCard(st, ui, c)), ui.del(st, 'cast', c, `인물 "${c.name}"`)))),
      !cast.length && ui.none(cfg.cast === false ? '설정 탭에서 "인물 도감"을 켜면 인물이 자동으로 기록됩니다.' : '아직 기록된 인물이 없습니다. 대화 중 새 인물이 등장하면 자동으로 기록됩니다.')));

  // ── 관계선
  const svg = bondMapSvg(bondViewRows(mem));
  const toStory = e => { const g = e.target.closest?.('.mm-bond-edge'); if (!g) return; const v = storyState(st); v.tab = 'bonds'; v.bond = g.dataset.id; st.tab = 'summaries'; st.draw(); };   // 작은 관계도에서 화살표를 누르면 이야기 탭의 관계 보기로
  const bondSec = ui.sec('관계선', '한 사람이 다른 한 사람을 지금 어떻게 대하는지 — 단계, 근거가 된 장면, 부르는 말, 아직 말하지 못한 것. 관계가 실제로 움직인 장면에서만 기록되고, 지나온 단계가 함께 남아 AI가 감정선을 건너뛰거나 되돌리지 않게 합니다.', btn('추가', { ic: 'plus', title: '관계선 추가', onclick: () => editBond(st, ui) }),
    svg ? h('div.mm-bond-mapwrap', { html: svg, onclick: toStory, onkeydown: e => { if (e.key === 'Enter' || e.key === ' ') toStory(e); } }) : null,
    h('div.mm-bond-rows', [...bonds].sort((a, b) => (bondNow(b)?.turn || 0) - (bondNow(a)?.turn || 0)).map(b => { const cur = bondNow(b) || {}, path = []; for (const e of b.log || []) if (path[path.length - 1] !== e.stage) path.push(e.stage);
      return h(`article.mm-bond-row${b.disabled ? '.off' : ''}`,
        h('header', h('b', b.from, h('span.mm-bond-arrow', '→'), b.to), h('em.mm-bond-stage', cur.stage || ''), h('span.mm-actions', tog(b, 'disabled', '주입·기록에서 제외 (사서가 이 줄을 다시 쓰지 않음)', '주입에 포함'), ui.ib('edit', '지금 단계 고치기', () => editBond(st, ui, b)), ui.del(st, 'bonds', b, `관계선 "${b.from} → ${b.to}"`))),
        cur.basis && pline(ui.ico('search', 13), '근거가 된 장면', cur.basis), cur.calls && pline(ui.ico('chat', 13), '부르는 말', '부르는 말: ', cur.calls), cur.unsaid && pline(ui.ico('more', 13), '말하지 못한 것', '말하지 못한 것: ', cur.unsaid),
        path.length > 1 ? h('div.mm-chips.mm-bond-path', { title: '지나온 길' }, path.flatMap((p, i) => [i ? h('span.mm-bond-arrow', '→') : null, h(`span.mm-chip${i === path.length - 1 ? '.ent' : ''}`, p)])) : null); }),
      !bonds.length && ui.none('아직 기록된 관계선이 없습니다. 관계가 실제로 움직이는 장면이 나오면 자동으로 기록됩니다.')));

  // ── 아이템 도감
  const addItem = async () => { const d = await ui.editBox('아이템 추가 — 이름만 필수, 나머지는 비워도 됩니다.', { name: '', meaning: '', holder: '', status: '' }, [{ k: 'name', label: '이름', half: true }, { k: 'holder', label: '소유자', half: true }, { k: 'meaning', label: '의미' }, { k: 'status', label: '상태' }]);
    if (!d) return; const name = cut(d.name, 60); if (!name) return toast('이름이 비어 있습니다.', 'err');
    const old = mem.items.find(x => String(x.name).toLowerCase() === name.toLowerCase()), rec = { name, meaning: cut(d.meaning, 160), holder: cut(d.holder, 160), status: cut(d.status, 160), manual: true };   // 수기 항목은 스와이프 롤백에서 보호
    if (old) Object.assign(old, rec, { updated: T }); else mem.items.push({ id: uid(), ...rec, turn: T });
    await Memory.save(mem); st.draw(); toast(`아이템 "${cut(name, 40)}"을(를) 추가했습니다.`, 'ok'); };
  const itemSec = ui.sec('아이템 도감', '스토리에 의미 있는 물건들. 소유자와 상태가 자동으로 갱신됩니다.', btn('추가', { ic: 'plus', cls: 'ghost', title: '아이템 추가', onclick: addItem }),
    h('div.mm-rows', [...mem.items].sort((a, b) => (b.updated ?? b.turn ?? 0) - (a.updated ?? a.turn ?? 0)).map(it => row(it.disabled ? 'off' : '', [h('b', it.name), it.holder && h('small', ` (${it.holder})`), it.meaning && ` — ${it.meaning}`, it.status && h('small', ` [${it.status}]`)], tog(it, 'disabled', '주입에서 제외', '주입에 포함'), ui.del(st, 'items', it, '이 아이템'))),
      !mem.items.length && ui.none(cfg.items ? '아직 기록된 아이템이 없습니다. 스토리에 중요한 물건이 등장하면 자동 기록됩니다.' : '설정 탭에서 "아이템 도감"을 켜면 중요한 물건이 자동 기록됩니다.')));

  // ── 서약
  const pledgeDefs = [{ k: 'kind', label: '종류', type: 'select', opts: [['loose_end', '열린 떡밥 — 언젠가 회수해야 할 실마리'], ['keep_unresolved', '미해결 유지 — 이야기가 성급히 매듭짓지 말 것'], ['keep_secret', '비밀 유지 — 새어 나가면 안 되는 사실'], ['knowledge_gap', '정보 격차 — 특정 인물이 아직 몰라야 하는 것'], ['consent', '동의 경계 — 넘지 말아야 할 선'], ['world_limit', '세계 제약 — 세계관의 불변 규칙'], ['foreshadow', '복선 — 심어 두고 회수를 기다리는 것']] },
    { k: 'summary', label: '내용', type: 'area', rows: 3, ph: '예: 은우는 도윤이 편지를 읽었다는 사실을 아직 모른다' }, { k: 'priority', label: '우선순위', type: 'select', opts: [[1, 'P1 — 절대 어기면 안 됨'], [2, 'P2 — 중요'], [3, 'P3 — 참고']] }];
  const editPledge = async p => { const d = await ui.editBox(p ? '서약 수정' : '서약 추가', p ? { kind: p.kind, summary: p.summary, priority: p.priority || 2 } : { kind: 'loose_end', summary: '', priority: 2 }, pledgeDefs); if (!d) return;
    const summary = cut(d.summary, 200); if (!summary) return toast('내용이 비어 있습니다.', 'err'); const rec = { kind: d.kind, summary, priority: +d.priority || 2 };
    if (p) Object.assign(p, rec, { manual: true }); else mem.pledges.push({ id: 'p' + (mem.pledges.reduce((a, x) => Math.max(a, +String(x.id).replace(/\D/g, '') || 0), 0) + 1), ...rec, status: 'active', owner: null, manual: true, turn: T, createdTurn: T });   // 수기 서약은 스와이프 롤백에서 보호
    await Memory.save(mem); st.draw(); if (!p) toast('서약을 추가했습니다.', 'ok'); };
  const flip = async p => { p.status = p.status === 'active' ? 'resolved' : 'active';
    if (p.status === 'active') { p.turn = T; p.resolvedTurn = null; p.resolvedBy = null; p.resolution = null; p.sleptTurn = null; }   // 깨운 떡밥은 방금 다뤄진 것으로 친다 — 곧바로 다시 잠들지 않게
    p.suggestResolved = false; p.suggestTurn = null; p.suggestBy = null;   // 직접 결정했으니 사서 의견은 정리
    await Memory.save(mem); st.draw(); };
  const rank = p => p.status === 'resolved' ? 2 : p.status === 'dormant' ? 1 : 0;
  const pledgeSec = ui.sec('서약', '비밀·미해결 떡밥·건너뛰면 안 되는 전개 등, 이야기가 지켜야 할 약속. 토큰이 부족해도 가장 마지막까지 유지됩니다.', btn('추가', { ic: 'plus', cls: 'ghost', title: '서약 추가', onclick: () => editPledge() }),
    h('div.mm-rows', [...mem.pledges].sort((a, b) => rank(a) - rank(b) || (a.priority || 2) - (b.priority || 2)).map(p => row(p.status === 'resolved' ? 'done' : p.status === 'dormant' ? 'mm-dormant' : '', [h(`em.mm-lock.l-${ui.safe(p.kind)}`, LOCK_KO[p.kind] || p.kind),
      p.status === 'dormant' && h('em.mm-tag.dash', { title: '오래 진전이 없어 주입에서 뺐습니다. 다시 언급되면 깨어납니다' }, '휴면'), ' ', h('span.mm-pledge-text', p.summary), h('small', ` (P${p.priority || 2}${p.turn != null ? ` · t${p.turn + 1}` : ''}${p.manual ? ' · 수기' : ''})`),
      p.resolution && p.status === 'resolved' && h('small.mm-resolution', { title: '해소 경위' }, ` — ${p.resolution}`),
      p.suggestResolved && p.status === 'active' && h('em.mm-suggest', { title: '사서가 이야기 속에서 해소됐다고 판단한 수기 서약입니다. 동의하면 체크로 확정하세요.' }, ui.ico('bell', 12), '해소된 듯 — 체크로 확정')],
      ui.ib(p.status === 'active' ? 'check' : 'refresh', p.status === 'active' ? '해결됨으로 표시' : p.status === 'dormant' ? '깨우기 — 다시 활성화' : '다시 활성화', () => flip(p)), ui.ib('edit', '편집', () => editPledge(p)), ui.del(st, 'pledges', p, '이 서약'))),
      !mem.pledges.length && ui.none('기록된 서약이 없습니다.')));

  // ── 캐논 (세계 설정)
  const canonDefs = [{ k: 'key', label: '키 (snake_case)', half: true }, { k: 'scope', label: '범위', type: 'select', opts: SCOPES, half: true }, { k: 'value', label: '내용', type: 'area', rows: 2 }];
  const editCanon = async c => { const d = await ui.editBox(c ? '캐논 수정' : '캐논 추가', c || { scope: 'world', key: '', value: '' }, canonDefs); if (!d?.key?.trim() || !d.value?.trim()) return; d.key = d.key.trim().toLowerCase().replace(/[\s-]+/g, '_'); if (c) Object.assign(c, d, { manual: true }); else mem.canon.push({ id: uid(), ...d, prev: null, manual: true, turn: T }); await Memory.save(mem); st.draw(); };
  const canonSec = ui.sec('캐논 (세계 설정)', '세계관의 지속적 사실. 같은 키가 다시 기록되면 덮어씁니다.', btn('추가', { ic: 'plus', cls: 'ghost', title: '캐논 추가', onclick: () => editCanon() }),
    h('div.mm-rows', mem.canon.map(c => row('', [h('b', c.key), ' = ', c.value, h('small', ` (${c.scope}${c.scopeName ? ':' + c.scopeName : ''}${c.turn != null ? ` · t${c.turn + 1}` : ''})`)], ui.ib('edit', '편집', () => editCanon(c)), ui.del(st, 'canon', c, '이 캐논'))), !mem.canon.length && ui.none('기록된 캐논이 없습니다.')));

  // ── 상태 보드
  const stDefs = [{ k: 'entity', label: '누구 · 무엇 (장면은 scene)', half: true }, { k: 'slot', label: '슬롯', half: true, ph: 'location · outfit · condition · mood · activity …' }, { k: 'value', label: '값', type: 'area', rows: 2 }, { k: 'claim', label: '객관인가 믿음인가', type: 'select', opts: [['objective', '객관'], ['belief', '믿음 (누군가의 생각)']], half: true }, { k: 'owner', label: '믿는 이', half: true }];
  const editStatus = async s => { const d = await ui.editBox(s ? '상태 수정' : '상태 추가', s || { entity: '', slot: '', value: '', claim: 'objective', owner: '' }, stDefs); if (!d?.entity?.trim() || !d.slot?.trim()) return; d.slot = d.slot.trim().toLowerCase().replace(/[\s-]+/g, '_'); if (s) { if (s.value !== d.value) d.prev = s.value; Object.assign(s, d, { manual: true, turn: T }); } else mem.status.push({ id: uid(), ...d, prev: null, manual: true, turn: T }); await Memory.save(mem); st.draw(); };
  const groups = new Map(); for (const s of mem.status) { const k = s.entity; if (!groups.has(k)) groups.set(k, []); groups.get(k).push(s); }
  const isScene = n => String(n).toLowerCase() === 'scene';
  const statusSec = ui.sec('상태 보드', '인물·사물·장면의 현재 값(위치, 복장, 부상, 목표…). 슬롯별 최신 값만 유지됩니다.', btn('추가', { ic: 'plus', cls: 'ghost', title: '상태 추가', onclick: () => editStatus() }), ui.sceneLine(mem),
    h('div.mm-board', [...groups].sort((a, b) => (isScene(a[0]) ? -1 : 0) - (isScene(b[0]) ? -1 : 0)).map(([name, rows]) => h('div.mm-entity', h('h4', isScene(name) ? '장면' : name),
      rows.map(s => h(`div.mm-slot${s.claim === 'belief' ? '.belief' : ''}`, { title: `${s.claim === 'belief' ? `믿음${s.owner ? ':' + s.owner : ''}` : '객관'}${s.turn != null ? ` · t${s.turn + 1}` : ''}` }, h('span.mm-slot-k', s.slot), h('span.mm-slot-v', s.value, s.prev != null && h('s', { title: '이전 값' }, String(s.prev)), s.claim === 'belief' && h('em.mm-tag.dash', `믿음${s.owner ? ':' + s.owner : ''}`)), h('span.mm-actions', ui.ib('edit', '편집', () => editStatus(s)), ui.del(st, 'status', s, '이 상태'))))))),
    !mem.status.length && ui.none('기록된 개체 상태가 없습니다.'));

  // ── 자료실
  const chars = Memory.dossierChars(mem), over = n => chars + n > DOSSIER_MAX && (toast(`자료실 용량 초과 — 전체 ${DOSSIER_MAX.toLocaleString()}자까지 담을 수 있습니다.`, 'err'), true);
  const putDoc = async (title, text) => { const chunks = chunkDossier(text); if (!chunks.length) return toast('내용이 비어 있습니다.', 'err'); mem.dossier.push({ id: uid(), title: cut(title, 80), chunks, addedAt: now(), disabled: false }); await Memory.save(mem); st.draw(); toast(`"${cut(title, 40)}" — ${chunks.length}개 대목으로 등록했습니다.`, 'ok'); };
  const addDoc = async () => { const d = await ui.editBox('문서 추가', { title: '', text: '' }, [{ k: 'title', label: '문서 이름', ph: '예: 원작 1권 요약, 세계관 설정집' }, { k: 'text', label: '문서 내용', type: 'area', rows: 14, hint: '문단 단위로 나뉘어 저장되고, 매 턴 관련 대목만 주입됩니다.' }], { wide: true, okLabel: '추가' }); if (!d?.title?.trim() || !d.text?.trim() || over(d.text.length)) return; await putDoc(d.title, d.text); };
  const addFile = async () => { const [f] = await pickFiles({ accept: '.txt,.md,text/plain' }); if (!f) return; const text = await f.text(); if (over(text.length)) return; await putDoc(f.name.replace(/\.[^.]+$/, ''), text); };
  const dossierSec = ui.sec('자료실', '원작 소설·설정 문서를 붙여넣어 두면, 매 턴 지금 장면과 관련된 대목만 골라 배경 참고로 주입합니다. 채팅에서 확정된 사실이 항상 우선하며, 토큰 예산이 부족하면 가장 먼저 줄어듭니다.', [btn('추가', { ic: 'plus', cls: 'ghost', title: '문서 추가', onclick: addDoc }), btn('파일', { ic: 'upload', cls: 'ghost', title: '글 파일에서 문서 추가', onclick: addFile })],
    h('div.mm-rows', mem.dossier.map(d => row(d.disabled ? 'off' : '', [h('b', d.title), h('small', ` (${d.chunks.length}개 대목 · ${d.chunks.reduce((n, c) => n + c.length, 0).toLocaleString()}자)`)], ui.ib('note', '대목 보기', () => modal({ title: d.title, wide: true, body: h('div.mm-review-list', d.chunks.map((c, i) => h('article.mm-diff', h('header', h('b', `대목 ${i + 1}`)), h('div.mm-after', c)))) })), tog(d, 'disabled', '주입에서 제외', '주입에 포함'), ui.del(st, 'dossier', d, '이 문서'))),
      !mem.dossier.length && ui.none('등록된 문서가 없습니다. "추가"로 원작·설정 자료를 붙여넣으면 관련 대목만 골라 배경 참고로 주입됩니다.')), chars ? h('div.mm-budget', h('span.mm-tok', `${chars.toLocaleString()} / ${DOSSIER_MAX.toLocaleString()}자`), ui.meter(chars, DOSSIER_MAX, 'big')) : null);
  return h('div.mm-view', castSec, bondSec, itemSec, pledgeSec, canonSec, statusSec, dossierSec);
}

// ════════ 이야기: 지금 · 맥박 · 흐름 / 연표 / 관계 / 표 — 모두 탭 안에서, 세로로 읽는다 ════════
export function vStory(st, ui) {
  const v = storyState(st), mem = st.mem, chat = st.chat, cfg = Memory.cfg(), T = mem.turns.length;
  // 검색칸에 글을 쓰는 중에 화면을 통째로 다시 그리게 되면 결과만 바꾸고 같은 화면을 돌려준다 (검색칸을 새로 그리면 한글 조합이 끊긴다)
  if (v.root?.isConnected && v.root.dataset.chat === chat.id && v.redraw && v.root.querySelector('.mm-st-query') === document.activeElement) { v.redraw(true); return v.root; }
  const no = noMap(st), barNo = x => x?.msgId != null ? (no.get(x.msgId) ?? -1) : Number.isInteger(x?.mesId) ? x.mesId + 1 : -1;
  const jumpBtn = n => h('button.mm-st-jump', { type: 'button', dataset: { mes: n } }, `#${n}`);

  // ── 지금
  const sc = Memory.scene(mem), bar = Memory.latestStatus?.(st.msgs) || null, days = mem.turns.reduce((a, t) => a + (t.days || 0), 0);
  const openThreads = mem.pledges.filter(p => p.status === 'active' && THREAD_KINDS.includes(p.kind)).length;
  const hero = h('div', { html: heroHtml({ place: bar?.place || sc.location || '', when: bar?.when || [sc.date, sc.time].filter(Boolean).join(' '), present: String(sc.present ?? sceneSlot(mem, 'present') ?? '').split(/[,，、]/).map(x => x.trim()).filter(Boolean),
    tiles: [{ value: T, label: '턴' }, { value: days >= 1 / 24 ? koDuration(days) : '—', label: '이야기 속' }, { value: mem.chunks.length + mem.arcs.length, label: '요약' }, { value: openThreads, label: '열린 떡밥' }] }) });

  // ── 맥박: 막대를 누르면 그 턴의 기록을 보여준다
  const spans = [...mem.arcs.filter(s => !s.carried).map(s => ({ fromTurn: s.from + 1, toTurn: s.to + 1, level: 'arc' })), ...mem.chunks.map(s => ({ fromTurn: s.from + 1, toTurn: s.to + 1, level: 'chunk' }))];
  const note = h('div.mm-st-pulse-note');
  const pulse = T > 1 ? h('div.mm-st-pulse-wrap', { title: '턴마다의 무게 — 높을수록 이야기가 크게 움직인 턴', html: pulseSvg(storeOf(st, no).turns, { spans, marks: mem.milestones.map(m => (m.turn ?? -1) + 1) }),
    onclick: e => { const g = e.target.closest?.('.mm-st-pulse-bar'); if (!g) return; const i = +g.dataset.turn - 1, t = mem.turns[i]; if (!t) return; pulse.querySelector('.is-picked')?.classList.remove('is-picked'); g.classList.add('is-picked'); const n = no.get(t.msgId) ?? -1;
      note.replaceChildren(n >= 0 ? jumpBtn(n) : h('b', `t${i + 1}`), ' ', [t.when, t.where].filter(Boolean).join(' · '), h('span', t.failed && !t.digest ? `기록 실패${t.error ? ' — ' + t.error : ''}` : t.digest || '(기록 없음)')); } }) : null;

  // ── 보기 고르기 · 지금 요약 · 전체 다시 만들기
  const tabsEl = h('div.mm-st-views', { role: 'tablist' }, [['flow', '흐름'], ['line', '연표'], ['bonds', '관계'], ['table', '표']].map(([id, label]) => h(`button${v.tab === id ? '.on' : ''}`, { type: 'button', role: 'tab', dataset: { view: id }, onclick: () => { v.tab = id; for (const b of tabsEl.children) b.classList.toggle('on', b.dataset.view === id); drawView(); } }, label)));
  const prog = v.progEl = h('span.mm-progress', v.prog || ''), say = t => { v.prog = t; if (v.progEl) v.progEl.textContent = t; };
  const left = T - (mem.chunked || 0);
  const sumBtn = h('button.btn.ghost.mm-st-tool', { type: 'button', title: `지금 요약 — 주기를 못 채운 자투리 턴까지 요약합니다 (아직 요약되지 않은 턴 ${left}개)`, 'aria-label': '지금 요약', onclick: e => ui.busyBtn(e.currentTarget, async () => {
    if (left <= 0) return toast('요약할 새 턴이 없습니다.'); toast('요약을 생성합니다…');
    const made = await Memory.summarize(chat, mem, { flush: true }); await Memory.save(mem); st.draw();
    toast(made ? `요약 ${made}개를 만들었습니다.` : '새로 요약할 턴 기록이 없습니다. (기록이 비어 있는 구간은 건너뜁니다)', made ? 'ok' : ''); }) }, icon('sparkle', 16));
  const reLab = h('span', v.busy ? '중단' : '');
  const reBtn = h('button.btn.ghost.mm-st-tool', { type: 'button', title: '전체 다시 만들기 — 요약·연대기를 턴 기록에서 처음부터 다시 만듭니다. 중단·실패하면 원래 요약을 그대로 둡니다.', 'aria-label': '전체 다시 만들기', onclick: async () => {
    if (v.busy) { v.busy.stop = true; return say('중단하는 중… (진행 중인 요약 하나가 끝나면 원래대로 되돌립니다)'); }
    if (!mem.turns.some(t => t.digest)) return toast('턴 기록이 없어 요약을 만들 수 없습니다. 도구 탭에서 먼저 색인하세요.', 'err');
    const calls = Math.ceil(T / Math.max(3, +cfg.chunkTurns || 8));
    if (!(await ui.confirmList(`이 채팅의 요약·연대기를 모두 지우고, 턴 기록(${T}턴)에서 처음부터 다시 만듭니다. 계속할까요?`, [`사서 호출 약 ${calls}번 (+ 연대기 정리 몇 번)`, '도중에 중단하거나 실패하면 원래 요약으로 되돌립니다', '다른 채팅에서 인계받은 연대기는 그대로 둡니다'], '다시 만들기'))) return;
    const job = v.busy = { stop: false }; reLab.textContent = '중단'; say('준비 중…');
    try { const made = await Memory.rebuildSummaries(chat, mem, { stop: () => job.stop, onProgress: (d, t) => say(`요약 ${d} / ${t}`) });
      if (made == null) toast('중단했습니다. 원래 요약으로 되돌렸습니다.'); else toast(`요약을 다시 만들었습니다 — 청크 ${made}개, 연대기 ${mem.arcs.filter(a => !a.carried).length}개`, 'ok'); }
    catch (e) { console.error(e); if (e.name !== 'AbortError') toast(`요약 다시 만들기에 실패해 원래 요약으로 되돌렸습니다. ${e.message || ''}`, 'err'); }
    finally { v.busy = null; say(''); st.draw(); } } }, icon('refresh', 16), reLab);

  // ── 고른 보기. resultsOnly: 도구 줄(검색칸)은 그대로 두고 결과만 다시 그린다
  const viewEl = h('div.mm-st-view');
  const editSum = async s => { const t = await promptBox('요약 수정', s.text, { area: true }); if (!t || !t.trim()) return; s.text = cutLines(t, 4000); delete s.av; delete s.avec; await Memory.save(mem); st.draw(); };   // 본문이 바뀌었으니 임베딩은 다음 회상 때 다시 계산
  const delSum = async s => { if (!(await confirmBox('이 요약을(를) 삭제할까요?', '삭제', true))) return; mem.chunks = mem.chunks.filter(x => x.id !== s.id); mem.arcs = mem.arcs.filter(x => x.id !== s.id); await Memory.save(mem); st.draw(); };
  const regen = (s, b) => ui.busyBtn(b, async () => {
    if (!mem.turns.slice(s.from, s.to + 1).some(t => t.digest)) return toast('이 구간의 턴 기록이 남아 있지 않아 다시 생성할 수 없습니다.', 'err');
    let t = ''; try { t = await Memory.chunkText(chat, mem, s.from, s.to, undefined, true); } catch (e) { console.error(e); }
    if (!t) return toast('요약 재생성에 실패했습니다. (모델 응답 오류)', 'err');
    s.text = t; delete s.av; delete s.avec; await Memory.save(mem); st.draw(); toast('요약을 다시 생성했습니다.', 'ok'); });
  const copyMd = async rows => { try { await navigator.clipboard.writeText(timelineMarkdown(rows)); toast('마크다운 표를 복사했습니다.', 'ok'); } catch { toast('복사하지 못했습니다.', 'err'); } };
  const shownRows = () => filterTimelineRows(buildTimelineRows(storeOf(st, no)), v);
  const tools = () => h('div.mm-st-tools',
    h('input.inp.mm-st-query', { type: 'search', placeholder: '인물 · 장소 · 내용', value: v.query, oninput: e => { v.query = e.target.value; drawView(true); } }),
    h('select.inp.auto.mm-st-min', { title: '중요도', onchange: e => { v.minStars = +e.target.value || 0; drawView(true); } }, [0, 3, 4, 5].map(n => h('option', { value: n, selected: v.minStars === n }, n ? `★${n}+` : '전체'))),
    v.tab === 'line' ? h('span.mm-st-seg', [['people', '인물'], ['place', '장소']].map(([by, label]) => h(`button${v.by === by ? '.on' : ''}`, { type: 'button', onclick: () => { v.by = by; drawView(); } }, label)))
      : [h('button.btn.ghost.mm-st-export', { type: 'button', title: '마크다운 표 복사', onclick: () => copyMd(shownRows()) }, 'MD'), h('button.btn.ghost.mm-st-export', { type: 'button', title: 'CSV 저장', onclick: () => download('memoria-timeline.csv', timelineCsv(shownRows()), 'text/csv') }, 'CSV')]);
  function drawView(resultsOnly = false) {
    const rows = v.tab === 'line' || v.tab === 'table' ? buildTimelineRows(storeOf(st, no)) : [];
    let kids = [], results = '';
    if (v.tab === 'flow') {
      const all = [...mem.arcs.map(s => ({ ...s, level: 'arc' })), ...mem.chunks.map(s => ({ ...s, level: 'chunk' }))].sort((a, b) => (a.carried ? -1 : 0) - (b.carried ? -1 : 0) || a.from - b.from);
      const marksIn = s => (s.carried ? [] : mem.milestones.filter(m => m.turn >= s.from && m.turn <= s.to));
      kids = all.length ? [h('div', { html: flowHtml(all.map((s, i) => ({ id: s.id, level: s.level, fromTurn: s.from + 1, toTurn: s.to + 1, text: s.text, carried: s.carried, carriedFrom: s.carriedFrom, marks: marksIn(s), open: i >= all.length - 2 }))) })] : [ui.none('아직 요약이 없습니다. 턴이 쌓이면 자동으로 만들어집니다.')];
    } else if (v.tab === 'line') {
      const shown = new Set(filterTimelineRows(rows, v).map(r => r.id)), dim = new Set(rows.filter(r => !shown.has(r.id)).map(r => r.id));
      results = railHtml(layoutTimelineGraph(rows, { by: v.by, maxLanes: 4 }), { dim, open: v.open });
      kids = rows.length ? [tools(), h('div.mm-st-results', { html: results })] : [ui.none('아직 그릴 사건이 없습니다. 턴이 기록되면 채워집니다.')];
    } else if (v.tab === 'bonds') {
      const bs = bondViewRows(mem), svg = bondMapSvg(bs, { picked: v.bond, focus: v.focus });
      kids = bs.length ? [svg ? h('div.mm-bond-mapwrap', { html: svg }) : null, h('div', { html: bondCardsHtml(bs, { picked: v.bond, focus: v.focus }) })] : [ui.none('관계선이 아직 없습니다. 관계가 움직이는 장면이 나오면 그려집니다.')];
    } else {
      const history = (Memory.statusHistory?.(st.msgs) || []).map(x => ({ mesId: barNo(x), when: x.when, place: x.place, weather: x.weather }));
      results = `${tableHtml(filterTimelineRows(rows, v), v)}${history.length ? `<details class="mm-details"><summary>상태창 기록 ${history.length}</summary>${statusListHtml(history)}</details>` : ''}`;
      kids = [tools(), h('div.mm-st-results', { html: results })];
    }
    // 검색어를 치는 중에는 결과만 갈아 끼운다. 입력칸까지 새로 그리면 한글 조합이 끊겨 "윤해준"이 "ㅇㅠㄴㅎㅐ…"로 풀린다
    const box = resultsOnly && viewEl.dataset.view === v.tab ? viewEl.querySelector('.mm-st-results') : null;
    if (box) { box.innerHTML = results; return; }
    viewEl.dataset.view = v.tab; viewEl.replaceChildren(...kids.filter(Boolean));
    // 흐름 카드 머리의 버튼 — 눌러도 카드가 접히지 않게
    if (v.tab === 'flow') viewEl.querySelectorAll('.mm-st-card').forEach(card => { const s = mem.chunks.find(x => x.id === card.dataset.id) || mem.arcs.find(x => x.id === card.dataset.id), slot = card.querySelector('[data-slot="acts"]'); if (!s || !slot) return; slot.addEventListener('click', e => e.preventDefault());
      slot.append(...[!s.carried && card.dataset.level === 'chunk' && ui.ib('refresh', '다시 만들기', e => regen(s, e.currentTarget)), ui.ib('edit', '편집', () => editSum(s)), ui.ib('trash', '삭제', () => delSum(s), 'del')].filter(Boolean)); });
  }
  viewEl.addEventListener('click', e => {
    const t = e.target; if (!t.closest || t.closest('.mm-st-jump')) return;
    const stop = t.closest('.mm-st-stop'); if (stop) { const id = stop.dataset.id; v.open = v.open === id ? '' : id; viewEl.querySelector('.mm-st-stop.is-open')?.classList.remove('is-open'); if (v.open) stop.classList.add('is-open'); return; }
    const th = t.closest('th.is-sortable'); if (th) { const k = th.dataset.sort; v.desc = v.sort === k ? !v.desc : false; v.sort = k; return drawView(true); }
    const td = t.closest('td.mm-st-text'); if (td) return void td.classList.toggle('is-open');
    const edge = t.closest('.mm-bond-edge'); if (edge) { v.bond = edge.dataset.id; drawView(); return void viewEl.querySelector('.mm-bond-card.is-picked')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); }
    const who = t.closest('.mm-bond-person'); if (who) { const n = who.dataset.name; v.focus = v.focus === n ? '' : n; drawView(); }
  });
  viewEl.addEventListener('keydown', e => { if (e.key !== 'Enter' && e.key !== ' ') return; const el = e.target.closest?.('.mm-st-stop, .mm-bond-edge, .mm-bond-person'); if (el && el === e.target) { e.preventDefault(); el.dispatchEvent(new MouseEvent('click', { bubbles: true })); } });

  // ── 전환점
  const miles = [...mem.milestones].sort((a, b) => (a.turn || 0) - (b.turn || 0));
  const editMile = async e => { const d = await ui.editBox(e ? '사건 수정' : '사건 추가', e || { title: '', summary: '', participants: [], grade: 'major' }, [{ k: 'title', label: '제목', half: true }, { k: 'grade', label: '무게', type: 'select', opts: [['major', '전환점'], ['minor', '사건']], half: true }, { k: 'summary', label: '한 줄 요약' }, { k: 'participants', label: '함께한 인물', type: 'tags' }]); if (!d?.title?.trim()) return; if (e) Object.assign(e, d); else mem.milestones.push({ id: uid(), ...d, manual: true, turn: T }); await Memory.save(mem); st.draw(); };
  const mileSec = ui.sec('전환점', '', btn('추가', { ic: 'plus', cls: 'ghost', title: '사건 추가', onclick: () => editMile() }),
    h('div.mm-miles', miles.map(e => h(`div.mm-mile.${e.grade === 'minor' ? 'minor' : 'major'}`, h('span.mm-node'), h('div', h(`em.mm-tag${e.grade === 'minor' ? '' : '.on'}`, e.grade === 'minor' ? '사건' : '전환점'), ' ', h('b', e.title), e.summary && h('p', e.summary), h('small', [e.turn != null && `t${e.turn + 1}`, ...(e.participants || [])].filter(Boolean).join(' · '))), h('span.mm-actions', ui.ib('edit', '편집', () => editMile(e)), ui.del(st, 'milestones', e, '이 사건')))),
      !miles.length && ui.none(cfg.milestones ? '아직 기록된 사건이 없습니다. 이야기의 전환점이 생기면 자동 기록됩니다.' : '설정 탭에서 "이벤트 연표"를 켜면 결정적 전환점이 자동 기록됩니다.')));

  // ── 턴별 기록
  const turns = mem.turns.map((t, i) => ({ t, i })).reverse().slice(0, 120);
  const editTurn = async (t, i) => { const d = await ui.editBox(`t${i + 1} — 턴 기록 수정 (이후 요약 생성에 반영됩니다)`, { digest: t.digest || '', days: +(t.days || 0).toFixed(3) }, [{ k: 'digest', label: '턴 기록', type: 'area', rows: 4 }, { k: 'days', label: '이 턴에서 흐른 이야기 속 시간 (일)', type: 'num', step: 0.25, min: 0 }]); if (!d) return; t.digest = cut(d.digest, MANUAL_MAX); t.days = Math.max(0, +d.days || 0); if (t.digest) { t.failed = false; t.error = ''; } mem.clockDays = mem.turns.reduce((a, x) => a + (x.days || 0), 0); await Memory.save(mem); st.draw(); };
  const digestSec = h('section.mm-sec', h('details.mm-details', { open: !!v.digests, ontoggle: e => { v.digests = e.target.open; } }, h('summary', '턴별 기록'), h('p.hint', '요약은 이 기록을 엮어 만듭니다. 여기서 고치면 다음 요약부터 반영됩니다.'),
    h('div.mm-turns', turns.map(({ t, i }) => { const n = no.get(t.msgId) ?? -1;
      return h(`div.mm-tline${t.failed ? '.bad' : ''}${i < (mem.chunked || 0) ? '.folded' : ''}`, h('span.mm-node'), h('b', `t${i + 1}`), h('div.mm-tline-main', t.failed ? h('span.err', `⚠ 실패${t.error ? ' — ' + t.error : ''}`) : t.digest || h('span.dim', '(기록 없음)'), h('small', n >= 0 && jumpBtn(n), [[t.when, t.where].filter(Boolean).join(' · '), t.days > 0 && `+${fmtDays(t.days)}`, t.weight != null && `무게 ${ui.pct(t.weight)}`].filter(Boolean).join(' · '))),
        h('span.mm-actions', t.failed && ui.ib('refresh', '다시 기록', e => ui.busyBtn(e.currentTarget, async () => { const m = st.msgs.find(x => x.id === t.msgId); if (m) await Memory.commit(chat, st.msgs, m, { force: true }); st.draw(); })), ui.ib('edit', '편집', () => editTurn(t, i)))); }),
      !turns.length && ui.none('아직 턴 기록이 없습니다.')), T > 120 ? h('small.hint', `최근 120턴만 보여 줍니다 (전체 ${T}턴)`) : null));

  const root = v.root = h('div.mm-view', { dataset: { chat: chat.id }, onclick: onJump(st) }, h('section.mm-sec.mm-st', hero, pulse, note, h('div.mm-st-bar', tabsEl, sumBtn, reBtn), prog, viewEl), mileSec, digestSec);
  v.redraw = drawView; drawView();
  return root;
}
