// ── Dreamland 삽화 (씬북): 스튜디오 · 장면 편집기 · 인물 배치 · 참조 · 갤러리 · 작업 · 메시지 아래 삽화 도구 ──
// 엔진은 illust.js. 이 파일은 화면과 등록(X.studio / X.actions / X.panels / X.commands / X.composer)을 맡는다.
import { S, DB, h, on, uid, now, esc, debounce, download, pickFiles, msgText } from './core.js';
import { icon, btn, iconBtn, toast, modal, menu, confirmBox, form, go } from './ui.js';
import { X } from './hooks.js';
import { Illust, MODELS, SAMPLERS, SCHEDULERS, BACKENDS, RENDER_KEYS, REF_OWNER, PLAN_PROMPT, LEAN_PROMPT, ANALYSIS_PROMPT, snapPoint } from './illust.js';
import { CAMERA_TAGS, ORIENTATIONS, LOOKS, hasCameraTag, toggleCameraTag, sizeFor } from './scenebook-framing.js';
import { INKS } from './scenebook-ornaments.js';
import { Frames, applyFrame, frameChoices, validFrame } from './scenebook-frames.js';
import { chatApi } from './chat.js';

if (!document.querySelector('link[data-sb]')) document.head.append(h('link', { rel: 'stylesheet', href: 'css/f-scenebook.css', dataset: { sb: '1' } }));

// ════════ 작은 부품 ════════
const cur = () => chatApi.current();
const clone = v => v == null ? v : structuredClone(v);
const pickKeys = (o, keys) => Object.fromEntries(keys.filter(k => o?.[k] !== undefined).map(k => [k, clone(o[k])]));
const fld = (label, ctl, hint, cls = '') => h(`label.field${cls}`, h('span.field-label', label), ctl, hint && h('small.hint', hint));
const sel = (opts, value, onchange) => h('select.inp', { onchange: e => onchange(e.target.value) }, opts.map(o => { const [v, l] = Array.isArray(o) ? o : [o, o]; return h('option', { value: v, selected: String(value ?? '') === String(v) }, l); }));
const chk = (label, checked, onchange, hint) => h('label.check', h('input', { type: 'checkbox', checked: !!checked, onchange: e => onchange(e.target.checked) }), h('i'), h('span', label), hint && h('small', hint));
const area = (obj, key, label, rows = 3, ph = '', onInput = () => { }, hint) => fld(label, h('textarea.inp', { rows, value: obj[key] ?? '', placeholder: ph, spellcheck: false, oninput: e => { obj[key] = e.target.value; onInput(); } }), hint);
const text = (obj, key, label, ph = '', onInput = () => { }, cls = '') => fld(label, h('input.inp', { value: obj[key] ?? '', placeholder: ph, spellcheck: false, autocomplete: 'off', oninput: e => { obj[key] = e.target.value; onInput(); } }), null, cls);
const openGroups = new Set(['이미지']);
const group = (title, ...kids) => h('details.sb-group', { open: openGroups.has(title), ontoggle: e => e.target.open ? openGroups.add(title) : openGroups.delete(title) }, h('summary', title), h('div.sb-group-body', kids));
const empty = t => h('p.sb-empty', t);
/** replaceChildren 과 같지만 null · false 를 글자로 찍지 않는다 */
const put = (el, ...kids) => el?.replaceChildren(...kids.flat(Infinity).filter(k => k != null && k !== false));
const guard = fn => async (...a) => { try { return await fn(...a); } catch (e) { console.error(e); toast(e.message || String(e), 'err'); } };
const modelLabel = c => c?.backend && c.backend !== 'nai' ? BACKENDS[c.backend] : (MODELS[c?.model]?.label || c?.model || '');
const configLine = c => c ? [modelLabel(c), `${c.width} × ${c.height}`, c.backend === 'nai' || c.backend === 'a1111' ? `${c.steps} Steps` : ''].filter(Boolean).join(' · ') : '';
const flat = s => String(s ?? '').normalize('NFC').replace(/[\s*_~`"'“”‘’「」『』]/g, '');
const lastReply = () => { const { msgs } = cur(); return msgs ? [...msgs].reverse().find(m => m.role === 'assistant' && msgText(m).trim()) : null; };
const mustBeOpen = msg => { if (!cur().msgs?.includes(msg)) throw new Error('대상 답변이 있는 대화가 열려 있지 않아요. 대화를 다시 열어 주세요.'); };
async function saveImage(src, name) { const blob = await (await fetch(src)).blob(); download(`${name}.${(blob.type.split('/')[1] || 'png').replace('jpeg', 'jpg')}`, blob); }
const blankScene = (n = 1) => ({ title: `장면 ${n}`, prompt: '', camera: '', negative: '', anchor: '', finalPrompt: false, characters: [] });
/** 지시문이 제목을 쓰지 않게 된 뒤로 붙는 기본 이름(장면 1 …)은 화면에 따로 적지 않는다 */
const shownTitle = t => /^(?:장면 \d+|새 장면)$/.test(t || '') ? '' : (t || '');
/** 나란히 놓고 하나만 고르는 선택 (화면 비율 등) */
function seg(label, choices, value, onChange = () => { }) {
  const el = h('div.sb-seg', { role: 'radiogroup', 'aria-label': label });
  const set = next => { value = next; for (const b of el.children) { const on = b.dataset.value === next; b.setAttribute('aria-checked', String(on)); b.classList.toggle('on', on); b.tabIndex = on ? 0 : -1; } };
  for (const [id, caption] of choices) { const b = h('button', { type: 'button', role: 'radio', onclick: () => { if (value === id) return; set(id); onChange(id); } }, caption); b.dataset.value = id; el.append(b); }
  el.addEventListener('keydown', e => { if (!['ArrowLeft', 'ArrowRight'].includes(e.key)) return; e.preventDefault(); const items = [...el.children], next = items[(items.findIndex(b => b.dataset.value === value) + (e.key === 'ArrowRight' ? 1 : -1) + items.length) % items.length]; next.focus(); next.click(); });
  set(value); return { el, set, read: () => value };
}

// ════════ 그리기 요청 ════════
const doneFor = (msg, title) => async err => {
  if (err) { flowNote = `삽화 실패 · ${err.message}`; return toast('삽화 실패: ' + err.message, 'err'); }
  flowNote = `삽화 완성 · ${title || '삽화'}`;
  if (cur().msgs?.includes(msg)) { await chatApi.save(); chatApi.redraw(); toast(`삽화 완성 · ${title || '삽화'}`, 'ok'); }
  else toast('그림을 완성했어요. 대상 대화가 바뀌어 갤러리에 보관했습니다.');
};
/** 장면들을 대기열에 넣는다. slot 을 주면 첫 장면은 그 자리의 새 버전이 된다 */
function draw(msg, scenes, config, slot = null, exact = false, quiet = false) {   // exact: 기록된 설정 그대로 (다시 그리기). 아니면 그림체 · 장면별 화면 비율을 적용한다
  const { chat } = cur(); mustBeOpen(msg);
  Illust.validate(Illust.genConfig(config));
  scenes.forEach((sc, i) => Illust.enqueue(chat, msg, sc, doneFor(msg, sc.title), { manual: true, config, slot: i === 0 ? slot : null, exact }));
  if (scenes.length && !quiet) toast('생성 대기열에 추가했어요');
  schedule();
}
function regen(msg, it, seed) { const v = Illust.slot(it).versions[it.sel]; draw(msg, [v.scene], { ...(v.config || {}), seed }, it.slotId, true); }
/** 초안만 있고 그림이 없는 답변들 */
const pendingDrafts = () => (cur().msgs || []).filter(m => { const sw = m.role === 'assistant' && m.swipes?.[m.sw]; return !!sw && sw.illustDraft?.length > 0 && !sw.illust?.length; });
/** 그 초안들을 한꺼번에 대기열에 넣는다 → { count: 넣은 장면 수, left: 한도 때문에 남긴 답변 수 } */
async function generateDrafts() {
  const c = Illust.cfg(), waiting = Illust.queue().filter(x => x.state === 'waiting').length, room = 20 - waiting; let count = 0, left = 0;
  for (const m of pendingDrafts()) {
    const sw = m.swipes[m.sw], scenes = sw.illustDraft;
    if (count + scenes.length > room) { left++; continue; }
    draw(m, scenes, sw.illustDraftConfig, null, false, true); count += scenes.length; sw.illustDraft = []; delete sw.illustDraftConfig;
  }
  if (count) await chatApi.save(); schedule(); return { count, left };
}
/** 답변에서 장면을 뽑아 초안으로 저장 */
async function analyzeInto(msg) {
  const { chat, msgs } = cur(); mustBeOpen(msg);
  if (msg.role !== 'assistant') throw new Error('캐릭터의 답변에서 써 주세요.');
  chatApi.setStatus('장면 분석 중…');
  try {
    const scenes = (await Illust.analyze(chat, msgs, msg, null, { manual: true })).map(sc => Illust.compileScene(chat, sc)), sw = msg.swipes[msg.sw];
    sw.illustDraft = scenes; sw.illustDraftConfig = Illust.genConfig(); await chatApi.save(); schedule();
    return scenes;
  } finally { chatApi.setStatus(''); }
}
/** 초안이 있으면 그대로, 없으면 장면을 뽑아서 바로 그린다 */
async function quickDraw(msg) {
  mustBeOpen(msg); const sw = msg.swipes[msg.sw];
  const scenes = sw.illustDraft?.length ? sw.illustDraft : await analyzeInto(msg), config = sw.illustDraftConfig;
  draw(msg, scenes, config); sw.illustDraft = []; delete sw.illustDraftConfig; await chatApi.save(); schedule();
}
/** 장면 편집기 열기. manual=false 면 먼저 분석한다 */
async function compose(msg = lastReply(), { manual = true, initial = null, slot = null, config = null, preview = '' } = {}) {
  const { chat } = cur(); if (!chat || !msg) throw new Error('삽화를 넣을 답변이 있는 대화를 먼저 열어 주세요.');
  if (msg.role !== 'assistant') throw new Error('캐릭터의 답변에서 써 주세요.');
  mustBeOpen(msg); const sw = msg.swipes[msg.sw];
  let scenes = initial || (sw.illustDraft?.length ? sw.illustDraft : null), cfg = config || (!initial && sw.illustDraftConfig) || null;
  if (!scenes && !manual) scenes = await analyzeInto(msg);
  if (!scenes) { const plan = sw.illustPlan?.raw ? Illust.readPlan(sw.illustPlan.raw) : null; scenes = plan?.scenes.length ? plan.scenes.slice(0, 6) : [blankScene()]; }
  if (!preview) { const it = (slot && sw.illust?.find(x => x.slotId === slot)) || sw.illust?.find(x => !x.hidden && x.id); preview = it ? Illust.data(it.id) : ''; }   // 배치판 배경: 고치는 그림, 없으면 이 답변의 첫 그림
  if (cfg?.references?.length) { const have = new Set((await DB.byOwner(REF_OWNER)).map(r => r.id)), kept = cfg.references.filter(r => have.has(r.id)); if (kept.length !== cfg.references.length) { cfg = { ...cfg, references: kept }; toast('지워진 참조를 빼고 장면을 열었어요. 그리기 전에 설정을 확인해 주세요.'); } }
  composer({ chat, msg, scenes: scenes.map(sc => Illust.compileScene(chat, sc)), config: Illust.genConfig(cfg), slot, preview });
}

// ════════ 메시지 아래 삽화 꾸미기 ════════
let timer = 0;
function schedule() { if (timer) return; timer = setTimeout(() => { timer = 0; try { decorate(); } catch (e) { console.warn('[삽화]', e); } }, cur().busy ? 400 : 30); }
function decorate() {
  const { chat, msgs } = cur(); if (!chat || !msgs) return;
  const c = Illust.cfg(), jobs = Illust.queue();
  for (const art of document.querySelectorAll('.msgs article.msg[data-id]')) {
    const m = msgs.find(x => x.id === art.dataset.id), sw = m?.swipes?.[m.sw], main = art.querySelector('.msg-main');
    if (!m || !sw || !main || m.role !== 'assistant') continue;
    const box = art.querySelector('.illusts:not([data-sb])');
    if (box) { box.dataset.sb = '1'; [...box.querySelectorAll('figure.illust')].forEach((fig, i) => { const it = sw.illust?.[i]; if (it) decorateFigure(fig, art, m, sw, it, c); }); }
    for (const fig of art.querySelectorAll('figure.illust[data-sb]')) fig.classList.toggle('sb-busy', jobs.some(j => j.slot === fig.dataset.sb && j.sw === sw && (j.state === 'waiting' || j.state === 'running')));
    extras(art, main, m, sw, jobs);
  }
}
function decorateFigure(fig, art, m, sw, it, c) {
  Illust.slot(it); fig.dataset.sb = it.slotId;
  if (it.hidden) { fig.classList.add('sb-off'); return; }
  const w = c.compact ? Math.min(360, c.displayWidth || 400) : (c.displayWidth || 400);
  fig.style.maxWidth = `min(100%, ${w}px)`; fig.classList.toggle('sb-compact', !!c.compact);
  const img = fig.querySelector('img'), cap = fig.querySelector('figcaption'), wrap = h('div.sb-frame'), pic = h('div.sb-pic');
  const title = h('span.sb-fig-title', shownTitle(it.title)), count = h('span.sb-ver-count', `${it.sel + 1}/${it.versions.length}`);
  // 액자: 그림 비율에 맞춰 그리므로 버전을 넘기면 다시 씌운다
  const reframe = () => { if (!img) return; const v = it.versions[it.sel] || {}; wrap.querySelectorAll('.sb-ornament, .sb-frame-art').forEach(x => x.remove()); wrap.removeAttribute('style'); pic.removeAttribute('style'); applyFrame(fig, wrap, pic, v.config?.width || img.naturalWidth || 832, v.config?.height || img.naturalHeight || 1216, c); };
  const step = d => { Illust.select(it, it.sel + d); if (img) { img.src = Illust.data(it.id); img.alt = it.title || '삽화'; } title.textContent = shownTitle(it.title); count.textContent = `${it.sel + 1}/${it.versions.length}`; reframe(); chatApi.save(); };
  if (img) { img.alt = it.title || '삽화'; img.before(wrap); pic.append(img); wrap.append(pic); reframe(); fig.addEventListener('click', e => { if (e.target !== img) return; e.stopPropagation(); e.preventDefault(); slotViewer(m, sw, it); }, true); }
  const nav = it.versions.length > 1 ? h('div.sb-ver', { role: 'group', 'aria-label': '삽화 버전 전환' }, h('button', { type: 'button', title: '이전 그림', 'aria-label': '이전 그림', onclick: () => step(-1) }, icon('left', 13)), count, h('button', { type: 'button', title: '다음 그림', 'aria-label': '다음 그림', onclick: () => step(1) }, icon('right', 13))) : null;
  put(cap, title, nav, iconBtn('more', '더 보기', e => menu(e.currentTarget, slotMenu(m, sw, it)), 'tiny'));
  (img ? wrap : fig).append(h('div.sb-fig-actions', { 'aria-label': '삽화 도구' }, iconBtn('edit', '장면을 고쳐서 재생성', guard(() => quickEdit(m, it)), 'tiny'), iconBtn('refresh', '새 시드로 재생성', guard(() => regen(m, it, -1)), 'tiny')));
  if (c.placement === 'inline' && it.anchor) {   // 문단 뒤에 끼워 넣기 (못 찾으면 답변 아래 그대로)
    const key = flat(it.anchor).slice(0, 40), body = art.querySelector('.msg-body');
    const at = key && body && [...body.children].find(el => !el.matches('figure, details, pre, table') && flat(el.textContent).includes(key));
    if (at) { let tail = at; while (tail.nextElementSibling?.matches('figure.illust')) tail = tail.nextElementSibling; tail.after(fig); fig.classList.add('sb-inline'); }
  }
}
const editSlot = (m, it) => { const v = Illust.slot(it).versions[it.sel]; return compose(m, { initial: [v.scene], slot: it.slotId, config: { ...(v.config || {}), seed: v.seed ?? -1 }, preview: Illust.data(v.id) }); };
async function deleteSlot(m, sw, it) {
  if (!(await confirmBox('이 삽화를 대화에서 지울까요? 이 자리의 이전 버전도 함께 빠지고, 그림은 갤러리에 남습니다.', '지우기', true))) return false;
  const i = sw.illust?.indexOf(it); if (i >= 0) sw.illust.splice(i, 1);
  Illust.cancelWaiting(j => j.slot === it.slotId);
  await chatApi.save(); chatApi.redraw(); toast('대화에서 삽화를 지웠어요. 그림은 갤러리에 남아 있습니다.'); return true;
}
function slotMenu(m, sw, it) {
  const v = it.versions[it.sel] || {};
  return [
    { label: '장면 편집 (인물 · 배치)', ic: 'sliders', onclick: guard(() => editSlot(m, it)) },
    v.seed != null && { label: '같은 시드로 생성', ic: 'refresh', onclick: guard(() => regen(m, it, v.seed)) },
    it.versions.length > 1 && { label: '버전 비교', ic: 'panel', onclick: () => compare(it) },
    { label: '생성 기록', ic: 'note', onclick: () => inspect(v) },
    { label: 'AI 검수', ic: 'search', onclick: guard(() => review(v, true)) }, v.review && { label: '지난 검수 보기', ic: 'eye', onclick: () => showReview(v.review) },
    v.seed != null && { label: '기본 시드로 저장', ic: 'dice', hint: String(v.seed), onclick: () => { Illust.saveCfg({ seed: v.seed }); toast(`Seed ${v.seed} 을 기본값으로 저장했어요`); } },
    { label: '그림 저장', ic: 'import', onclick: guard(() => saveImage(Illust.data(it.id), it.title || 'illust')) },
    { label: '숨기기', ic: 'eyeoff', onclick: async () => { it.hidden = true; await chatApi.save(); chatApi.redraw(); } },
    '-',
    { label: '삽화 지우기', ic: 'trash', danger: true, onclick: guard(() => deleteSlot(m, sw, it)) },
  ];
}
function slotViewer(m, sw, it) {
  const v = it.versions[it.sel] || {};
  viewer({ title: it.title || '삽화', src: Illust.data(it.id), sub: [configLine(v.config), v.seed != null ? `Seed ${v.seed}` : ''].filter(Boolean).join(' · '),
    actions: [{ label: '수정', ic: 'edit', run: () => quickEdit(m, it) }, { label: '재생성', ic: 'refresh', run: () => regen(m, it, -1) }],
    more: slotMenu(m, sw, it).filter(x => x && x !== '-' && x.label !== '그림 저장') });   // 삭제는 더 보기 안에 둔다
}
/** 장면 수정: 그림을 가르는 몇 가지만 고쳐서 같은 자리에 다시 생성한다. 이전 그림은 버전으로 남는다 */
function quickEdit(m, it) {
  const { chat } = cur(), sw = m.swipes[m.sw], v = Illust.slot(it).versions[it.sel]; if (!v) throw new Error('고칠 그림이 없어요.');
  let draft = clone(v.scene || {}), size = '', cast = [], box;
  const check = () => { mustBeOpen(m); if (!sw.illust?.includes(it)) throw new Error('대상 답변이 바뀌었어요. 그림을 다시 열어 주세요.'); };
  const status = h('p.hint', { role: 'status' }), ask = h('textarea.inp', { rows: 2, placeholder: '예: 둘이 껴안은 모습이 옆에서 보이게, 배경은 노을 진 옥상' });
  const chips = h('div.sb-chips', { role: 'group', 'aria-label': '구도 바로 고르기' }), people = h('div.col.sb-quick-people');
  const sync = () => { for (const chip of chips.children) { const on = hasCameraTag(camera.value, chip.dataset.tag); chip.setAttribute('aria-pressed', String(on)); chip.classList.toggle('on', on); } };
  const camera = h('input.inp', { placeholder: '예: from side, upper body', spellcheck: false, autocomplete: 'off', oninput: sync }), prompt = h('textarea.inp', { rows: 4, spellcheck: false });
  for (const [tag, label, group] of CAMERA_TAGS) { const chip = h('button.chip', { type: 'button', title: tag, onclick: () => { camera.value = toggleCameraTag(camera.value, tag); sync(); } }, label); chip.dataset.tag = tag; chip.dataset.group = group; chips.append(chip); }
  const fill = () => { camera.value = draft.camera ?? ''; prompt.value = draft.prompt ?? ''; cast = (draft.characters ?? []).map((c, i) => { const ta = h('textarea.inp', { rows: 3, value: c.prompt ?? '', spellcheck: false }); return { ta, el: fld(c.name || `인물 ${i + 1}`, ta) }; }); put(people, cast.map(x => x.el)); sync(); };
  const read = () => ({ ...draft, camera: camera.value.trim(), prompt: prompt.value.trim(), finalPrompt: false, characters: (draft.characters ?? []).map((c, i) => ({ ...c, prompt: cast[i].ta.value })) });
  const rewrite = btn('AI 로 고쳐 쓰기', { ic: 'sparkle', onclick: guard(async () => {
    const request = ask.value.trim(); if (!request) throw new Error('원하는 장면을 먼저 적어 주세요.');
    status.textContent = 'AI 가 장면을 고쳐 쓰는 중…'; rewrite.disabled = true;
    try { check(); draft = { ...(await Illust.analyze(chat, cur().msgs, m, null, { existing: [read()], direction: request, scope: 'all', manual: true }))[0] }; fill(); status.textContent = '고쳐 썼어요. 내용을 확인하고 재생성을 눌러 주세요.'; }
    catch (e) { status.textContent = '고쳐 쓰지 못했어요. 아래 내용을 직접 고칠 수 있습니다.'; throw e; } finally { rewrite.disabled = false; }
  }) });
  const shape = seg('화면 비율', [['', '그대로'], ...ORIENTATIONS.slice(1)], size, val => { size = val; });
  fill();
  box = modal({ title: '장면 수정', body: h('div.col.sb-quick',
    h('p.hint', '바꿀 부분만 고친 뒤 다시 생성합니다. 이전 그림은 버전으로 남습니다.'),
    h('section.sb-quick-assist', fld('원하는 장면', ask), h('div.row', status, h('span.sb-grow'), rewrite)),
    chips, fld('구도', camera), h('div.sb-shape', h('span.field-label', '화면 비율'), shape.el), fld('장면', prompt), people),
    actions: [
      { label: '자세히 편집', ic: 'sliders', cls: 'ghost', onclick: () => { try { check(); const scene = read(); compose(m, { initial: [scene], slot: it.slotId, config: { ...(v.config || {}), seed: v.seed ?? -1 }, preview: Illust.data(v.id) }).catch(e => toast(e.message, 'err')); } catch (e) { toast(e.message, 'err'); return false; } } },
      { label: '재생성', ic: 'refresh', cls: 'primary', onclick: () => { try { check(); const base = v.config || Illust.genConfig(); draw(m, [read()], { ...base, seed: -1, ...(size ? sizeFor(base, size) : {}) }, it.slotId, true); } catch (e) { toast(e.message, 'err'); return false; } } }] });
}
/** 답변 아래 덧붙이는 것: 그리는 중 · 실패 · 준비된 초안 · 숨긴 삽화 · 지시 없음 */
function extras(art, main, m, sw, jobs) {
  const mine = jobs.filter(j => j.msg === m && j.sw === sw), pending = mine.filter(j => !j.slot && (j.state === 'waiting' || j.state === 'running')), failed = mine.filter(j => (j.state === 'failed' || j.state === 'uncertain') && !j.seen);
  const drafts = sw.illustDraft || [], hidden = (sw.illust || []).filter(it => it.hidden).length, plan = sw.illustPlan, note = plan && (plan.status === 'missing' || plan.status === 'failed') && !plan.seen && !drafts.length && !sw.illust?.length;
  const sig = JSON.stringify([pending.map(j => j.id + j.state), failed.map(j => j.id), drafts.length, drafts.map(d => shownTitle(d.title)), hidden, !!note]);
  const old = main.querySelector(':scope > .sb-extras');
  if (old?.dataset.sig === sig) return;
  old?.remove();
  if (!pending.length && !failed.length && !drafts.length && !hidden && !note) return;
  const cfg = Illust.cfg(), ratio = j => `${j.config.width} / ${j.config.height}`;
  const node = h('div.sb-extras', { dataset: { sig } },
    pending.length ? h('div.sb-pendings', pending.map(j => h(`div.sb-pending.${j.state}`, { style: { aspectRatio: ratio(j), maxWidth: `min(100%, ${Math.min(cfg.displayWidth || 400, 260)}px)` } }, icon('image', 22), h('b', j.state === 'running' ? '그리는 중' : '차례를 기다리는 중'), h('span', j.label)))) : null,
    failed.map(j => h('div.sb-note.bad', icon('x', 15), h('span', `${j.label} · ${j.error}`), btn('다시 요청', { cls: 'ghost', onclick: guard(() => { j.seen = true; draw(m, [j.scene], j.config, j.slot, true); }) }), iconBtn('x', '닫기', () => { j.seen = true; schedule(); }, 'tiny'))),
    drafts.length ? h('div.sb-note.draft', icon('sparkle', 15), h('span', h('b', `장면 ${drafts.length}개 준비됨`), ' ', drafts.map(d => shownTitle(d.title)).filter(Boolean).join(' · ')),
      btn('그리기', { ic: 'image', cls: 'primary', onclick: guard(() => quickDraw(m)) }), btn('장면 편집', { ic: 'edit', cls: 'ghost', onclick: guard(() => compose(m)) }),
      iconBtn('trash', '초안 버리기', async () => { sw.illustDraft = []; delete sw.illustDraftConfig; await chatApi.save(); schedule(); }, 'tiny')) : null,
    note ? h('div.sb-note', icon('image', 15), h('span', plan.error || '삽화 지시를 읽지 못했어요.'), btn('장면 분석', { ic: 'sparkle', cls: 'ghost', onclick: guard(() => compose(m, { manual: false })) }), btn('지시 기록', { cls: 'ghost', onclick: showPlans }), iconBtn('x', '닫기', async () => { plan.seen = true; await chatApi.save(); schedule(); }, 'tiny')) : null,
    hidden ? h('button.chip.sb-hidden-chip', { type: 'button', onclick: async () => { for (const it of sw.illust) it.hidden = false; await chatApi.save(); chatApi.redraw(); } }, `숨긴 삽화 ${hidden}개 다시 보기`) : null);
  (main.querySelector(':scope > .msg-tools') || main.lastChild)?.before(node);
}

// ════════ 크게 보기 · 생성 기록 · 버전 비교 ════════
function viewer({ title, src, sub = '', actions = [], more = [] }) {
  let box; const run = a => async () => { box.close(); try { await (a.run || a.onclick)(); } catch (e) { toast(e.message, 'err'); } };
  box = modal({ title: title || '삽화', wide: true, body: h('div.sb-viewer', h('div.sb-viewer-frame', h('img', { src, alt: title || '삽화' })), sub && h('p.hint', sub),
    h('div.sb-viewer-foot', actions.map(a => btn(a.label, { ic: a.ic, cls: 'ghost', onclick: run(a) })), btn('저장', { ic: 'import', cls: 'ghost', onclick: guard(() => saveImage(src, title || 'illust')) }),
      more.length ? iconBtn('more', '더 보기', e => menu(e.currentTarget, more.map(a => ({ ...a, onclick: run(a) })))) : null)) });
  return box;
}
function inspect(v) {
  const data = { scene: v.scene, config: v.config, seed: v.seed, review: v.review };
  modal({ title: '생성 기록', wide: true, body: h('div.col', h('p.hint', [v.seed != null ? `Seed ${v.seed}` : '', configLine(v.config), v.ts ? new Date(v.ts).toLocaleString('ko-KR') : ''].filter(Boolean).join(' · ')), h('pre.regex-out.sb-code', JSON.stringify(data, null, 2))),
    actions: [{ label: '내려받기', ic: 'import', onclick: () => { download('scenebook-image-record.json', JSON.stringify(data, null, 2)); return false; } }, { label: '닫기', cls: 'primary' }] });
}
function compare(it) {
  const vs = it.versions, opts = vs.map((v, i) => [i, `${i + 1}${v.seed != null ? ` · Seed ${v.seed}` : ''}`]);
  const pane = (label, start) => { const img = h('img'), info = h('p.hint'); const show = i => { const v = vs[i]; img.src = Illust.data(v.id); img.alt = v.scene?.title || ''; info.textContent = configLine(v.config); }; show(start); return h('section', fld(label, sel(opts, start, i => show(+i))), img, info); };
  modal({ title: '버전 비교', wide: true, body: h('div.sb-compare', pane('이전 결과', it.sel === 0 ? 1 : it.sel - 1), pane('현재 결과', it.sel)) });
}

/** AI 검수: 의견만 보여 주고 그림은 바꾸지 않는다. v 는 버전 또는 보관함 기록 { id, scene } */
async function review(v, save = false) {
  toast('그림을 검수하는 중이에요…');
  const r = await Illust.review(v.id, v.scene, cur().chat); v.review = r;
  if (save && cur().chat) await chatApi.save();
  showReview(r);
}
function showReview(r) {
  modal({ title: '이미지 검수', body: h('div.col.sb-review', h('p.hint', 'AI 검수는 참고 의견입니다. 그림과 기존 버전을 자동으로 바꾸지 않아요.'), h('p', r.summary || '요약이 없어요.'),
    r.issues?.length ? h('ul.sb-warn', r.issues.map(x => h('li', x))) : h('p.hint', '눈에 띄는 문제를 찾지 못했어요.'), r.created ? h('small.hint', new Date(r.created).toLocaleString('ko-KR')) : null) });
}
// ════════ 인물 배치판 ════════
function positionBoard({ model, width, height, entries, bg, onSelect = () => { }, onMove = () => { } }) {
  const free = MODELS[model]?.family !== 4.5;
  const board = h(`div.sb-board${free ? '' : '.grid5'}`, { 'aria-label': '인물 배치 화면', style: { aspectRatio: `${width} / ${height}`, maxWidth: Math.round(Math.min(520, 320 * width / height)) + 'px' } });
  const readout = h('output.sb-readout'); let selected = 0, nodes = [], drag = null;
  const update = () => {
    const list = entries();
    nodes.forEach((n, i) => { const e = list[i]; if (!e) return; const p = snapPoint(e.x, e.y, model); n.style.left = p.x * 100 + '%'; n.style.top = p.y * 100 + '%'; n.classList.toggle('on', selected === i); n.setAttribute('aria-label', `${e.name || `인물 ${i + 1}`} 위치 ${p.x}, ${p.y}`); });
    const e = list[selected]; readout.textContent = e ? `${e.name || `인물 ${selected + 1}`} · 가로 ${Number(e.x).toFixed(2)} / 세로 ${Number(e.y).toFixed(2)}` : '인물을 추가하면 배치할 수 있어요.';
  };
  const commit = (x, y) => { const e = entries()[selected]; if (!e) return; const p = snapPoint(x, y, model); e.set(p.x, p.y); onMove(); update(); };
  const fromPointer = e => { const r = board.getBoundingClientRect(); if (r.width && r.height) commit((e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height); };
  const refresh = () => {
    const list = entries(); selected = Math.max(0, Math.min(selected, list.length - 1)); nodes = [];
    put(board, bg ? h('img.sb-board-bg', { src: bg, alt: '', draggable: false }) : null);
    list.forEach((e, i) => {
      const mk = h('button.sb-marker', { type: 'button', title: e.name || `인물 ${i + 1}` }, String(i + 1));
      const pick = () => { if (selected !== i) { selected = i; onSelect(i); update(); } };
      mk.addEventListener('focus', pick); mk.addEventListener('click', pick);
      mk.addEventListener('pointerdown', ev => { if (ev.button !== 0) return; ev.preventDefault(); pick(); drag = ev.pointerId; mk.setPointerCapture(ev.pointerId); mk.focus(); });
      mk.addEventListener('pointermove', ev => { if (drag === ev.pointerId) fromPointer(ev); });
      const end = ev => { if (drag === ev.pointerId) { drag = null; if (mk.hasPointerCapture(ev.pointerId)) mk.releasePointerCapture(ev.pointerId); } };
      mk.addEventListener('pointerup', end); mk.addEventListener('pointercancel', end); mk.addEventListener('lostpointercapture', () => { drag = null; });
      mk.addEventListener('keydown', ev => { const d = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[ev.key]; if (!d) return; ev.preventDefault(); selected = i; const cur0 = entries()[i], p = snapPoint(cur0.x, cur0.y, model), st = free ? (ev.shiftKey ? 0.1 : 0.01) : 0.2; commit(p.x + d[0] * st, p.y + d[1] * st); });
      board.append(mk); nodes.push(mk);
    });
    update();
  };
  board.addEventListener('pointerdown', e => { if (e.target === board && e.button === 0) { e.preventDefault(); fromPointer(e); } });
  const tool = (label, apply, only) => h('button.chip', { type: 'button', onclick: () => { const list = entries(); list.forEach((e, i) => { if (only && i !== selected) return; const p = snapPoint(...apply(e, i, list.length), model); e.set(p.x, p.y); }); onMove(); update(); } }, label);
  refresh();
  return { el: h('section.sb-placement', h('p.hint', `드래그 · 클릭 · 방향키로 옮깁니다. ${free ? '자유 좌표 (Shift + 방향키는 크게)' : 'V4.5 · 5 × 5 격자'}`), board, readout,
    h('div.row.wrap.sb-board-tools', tool('균등 배치', (e, i, n) => [(i + 1) / (n + 1), 0.5]), tool('좌우 뒤집기', e => [1 - Number(e.x), Number(e.y)]), tool('중앙', () => [0.5, 0.5], true))), refresh, update, select(i) { selected = i; update(); } };
}

// ════════ 이번 작업의 생성 설정 ════════
function genFields(d) {
  const nai = d.backend === 'nai', v5 = MODELS[d.model]?.family === 5, sd = d.backend === 'a1111';
  return [
    nai && { k: 'model', label: '모델', type: 'select', opts: Object.entries(MODELS).map(([id, m]) => [id, m.label]), half: true, live: true },
    { k: 'width', label: '가로', type: 'num', min: 64, max: 4096, step: 64, third: true }, { k: 'height', label: '세로', type: 'num', min: 64, max: 4096, step: 64, third: true },
    (nai || sd) && { k: 'steps', label: 'Steps', type: 'num', min: 1, max: 150, step: 1, third: true }, (nai || sd) && { k: 'scale', label: 'Guidance', type: 'num', min: 0, max: 30, step: 0.1, third: true },
    (nai || sd) && { k: 'seed', label: 'Seed', type: 'num', min: -1, max: 4294967295, step: 1, third: true, hint: '-1: 매번 새 값' },
    nai && { k: 'sampler', label: '샘플러', type: 'select', opts: SAMPLERS, half: true }, nai && !v5 && { k: 'scheduler', label: '스케줄러', type: 'select', opts: SCHEDULERS, half: true },
    sd && { k: 'sdSampler', label: '샘플러', half: true, ph: 'Euler a' },
    nai && { k: 'cfgRescale', label: 'CFG rescale', type: 'num', min: 0, max: 1, step: 0.05, third: true },
    nai && v5 && { k: 'transparent', label: '투명 배경 (V5 전용)', type: 'check' },
    nai && { k: 'budgetGuard', label: '비용 보호', type: 'check', hint: '1,048,576픽셀 · 28 Steps 를 넘는 요청을 막습니다. 무료 생성을 보장하지는 않아요.' },
  ];
}
function fixModel(d) { if (d.backend !== 'nai') return; if (MODELS[d.model]?.family === 5) d.scheduler = 'karras'; else d.transparent = false; }
function genEditor(config, onApply) {
  const d = clone(config), body = h('div.col'); let last = d.model;
  const drawForm = () => put(body, h('p.hint', '이번 작업에만 적용합니다. 기본 설정은 바꾸지 않아요.'), form(d, genFields(d), () => { fixModel(d); if (d.model !== last) { last = d.model; drawForm(); } }));
  drawForm();
  modal({ title: '생성 설정', body, actions: [{ label: '무작위 시드', cls: 'ghost', onclick: () => { d.seed = -1; drawForm(); return false; } }, { label: '적용', cls: 'primary', onclick: () => { try { fixModel(d); onApply(Illust.validate(d)); } catch (e) { toast(e.message, 'err'); return false; } } }] });
}

// ════════ 장면 편집기 ════════
function composer({ chat, msg, scenes, config, slot = null, preview = '' }) {
  const sw = msg.swipes[msg.sw], blocks = Illust.blocks(msgText(msg)), inline = Illust.cfg().placement === 'inline', LIMIT = 6;
  let drafts = clone(scenes), cfg = clone(config), at = 0, person = 0, tab = 'scene', dirty = false, box;
  const undo = [], scene = () => drafts[at], touch = () => { dirty = true; };
  const castMax = () => cfg.backend === 'nai' ? (MODELS[cfg.model]?.characters || 6) : 4;
  const boardModel = () => cfg.backend !== 'nai' || MODELS[cfg.model]?.family === 5 ? 'nai-diffusion-5-full' : cfg.model;
  const chips = h('div.sb-scenes'), status = h('span.sb-state'), tabs = h('div.tabs.sb-tabs'), content = h('div.sb-ed-content');
  const undoBtn = btn('되돌리기', { ic: 'left', cls: 'ghost', onclick: () => { const u = undo.pop(); if (!u) return; ({ drafts, cfg, at, person } = u); dirty = true; render(); } });
  const snap = () => { undo.push(clone({ drafts, cfg, at, person })); if (undo.length > 20) undo.shift(); dirty = true; undoBtn.disabled = false; };
  const move = d => { const to = at + d; if (to < 0 || to >= drafts.length) return; snap(); [drafts[at], drafts[to]] = [drafts[to], drafts[at]]; at = to; render(); };
  const backBtn = iconBtn('left', '장면 앞으로', () => move(-1)), nextBtn = iconBtn('right', '장면 뒤로', () => move(1));
  const addBtn = btn('장면 추가', { ic: 'plus', cls: 'ghost', onclick: () => { if (drafts.length >= LIMIT) return toast(`장면은 최대 ${LIMIT}개예요`); snap(); drafts.push(blankScene(drafts.length + 1)); at = drafts.length - 1; person = 0; render(); } });
  const delBtn = iconBtn('trash', '장면 삭제', async () => { const s = scene(); if (!s || !(await confirmBox(`장면 ${at + 1}을 지울까요? 되돌리기로 살릴 수 있어요.`, '지우기', true))) return; snap(); drafts.splice(at, 1); at = Math.max(0, at - 1); person = 0; render(); });
  const genBtn = btn('그리기', { ic: 'image', cls: 'primary', onclick: guard(async () => { draw(msg, drafts, cfg, slot); if (!slot) { sw.illustDraft = []; delete sw.illustDraftConfig; } dirty = false; await chatApi.save(); box.close(); }) });
  const saveDraft = async quiet => { mustBeOpen(msg); sw.illustDraft = clone(drafts); sw.illustDraftConfig = clone(cfg); dirty = false; await chatApi.save(); schedule(); toast(quiet ? '편집하던 장면을 초안으로 저장했어요' : '초안을 저장했어요'); };
  const drawChips = () => put(chips, ...drafts.map((s, i) => h(`button.chip${i === at ? '.on' : ''}`, { type: 'button', onclick: () => { at = i; person = 0; render(); } }, `장면 ${i + 1} / ${drafts.length}`)));
  const drawStatus = () => { status.textContent = configLine(cfg); };

  function render() {
    at = Math.max(0, Math.min(at, drafts.length - 1)); drawChips();
    backBtn.hidden = nextBtn.hidden = drafts.length < 2;
    backBtn.disabled = at === 0 || !drafts.length; nextBtn.disabled = at >= drafts.length - 1; delBtn.disabled = !scene(); undoBtn.disabled = !undo.length; genBtn.disabled = !drafts.length;
    renderContent();
  }
  function renderContent() {
    put(tabs, ...[['scene', '장면'], ['cast', '인물 · 배치'], ['final', '프롬프트']].map(([k, l]) => h(`button.tab${k === tab ? '.on' : ''}`, { type: 'button', onclick: () => { tab = k; renderContent(); } }, l)));
    drawStatus();
    put(content, !scene() ? empty('장면을 추가하거나 파일을 가져와 주세요.') : tab === 'scene' ? sceneTab() : tab === 'cast' ? castTab() : finalTab());
  }
  function anchorPicker() {
    const s = scene(), label = h('b'), quote = h('blockquote.sb-excerpt');
    const show = () => { const b = s.anchor && blocks.find(x => flat(x.content).includes(flat(s.anchor).slice(0, 40))); label.textContent = b ? `삽입 위치 · ${b.index}번 문단 뒤` : '삽입 위치 · 답변 아래'; quote.textContent = b ? b.content : ''; quote.hidden = !b; };
    const choose = () => {
      let m, page = 0; const SIZE = 20, list = h('div.sb-para-list', { 'aria-label': '본문 문단' }), count = h('small.hint', { role: 'status' }), pager = h('div.sb-pager'), q = h('input.inp', { type: 'search', placeholder: '단어나 문장으로 찾기', oninput: () => { page = 0; fill(); } });
      const here = () => s.anchor ? blocks.find(x => flat(x.content).includes(flat(s.anchor).slice(0, 40)))?.index : 0;
      const pickAt = b => { snap(); s.anchor = b ? b.content.slice(0, 200) : ''; show(); m.close(); };
      const fill = () => {
        const k = flat(q.value).toLowerCase(), hits = blocks.filter(b => !k || flat(b.content).toLowerCase().includes(k)), pages = Math.max(1, Math.ceil(hits.length / SIZE)), now0 = here(); page = Math.max(0, Math.min(page, pages - 1));
        count.textContent = `전체 ${blocks.length}문단 · ${hits.length}개 일치`;
        put(list, page === 0 && !k ? h(`button.sb-para${now0 ? '' : '.on'}`, { type: 'button', onclick: () => pickAt(null) }, h('b', `답변 아래${now0 ? '' : ' · 현재 위치'}`), h('span', '문단을 고르지 않고 답변 끝에 붙입니다.')) : null,
          ...hits.slice(page * SIZE, (page + 1) * SIZE).map(b => h(`button.sb-para${b.index === now0 ? '.on' : ''}`, { type: 'button', 'aria-pressed': String(b.index === now0), onclick: () => pickAt(b) }, h('b', `${b.index}번 문단${b.index === now0 ? ' · 현재 위치' : ''}`), h('span', b.content))), !hits.length && empty('일치하는 문단이 없어요.'));
        const back = btn('이전', { cls: 'ghost', onclick: () => { page--; fill(); } }), fwd = btn('다음', { cls: 'ghost', onclick: () => { page++; fill(); } }); back.disabled = page === 0; fwd.disabled = page >= pages - 1;
        put(pager, back, h('span.hint', `${page + 1} / ${pages}`), fwd); pager.hidden = pages < 2; list.scrollTop = 0;
      };
      fill(); m = modal({ title: '삽입 위치', wide: true, body: h('div.col', q, count, list, pager) });
    };
    show(); return h('section.sb-anchor', h('div.row', label, btn('변경', { cls: 'ghost', onclick: choose })), quote);
  }
  function sceneTab() {
    const s = scene(), dir = h('textarea.inp', { rows: 2, placeholder: '예: 인물은 그대로 두고 카메라만 멀리' }); let scope = 'all';
    const reanalyze = btn('다시 분석', { ic: 'sparkle', onclick: async e => {
      const b = e.currentTarget, before = JSON.stringify(drafts); b.disabled = true; status.textContent = '장면 분석 중…';
      try {
        mustBeOpen(msg);
        const out = await Illust.analyze(chat, cur().msgs, msg, null, { existing: clone(drafts), direction: dir.value, scope, manual: true });
        if (JSON.stringify(drafts) !== before) throw new Error('분석하는 동안 고친 내용이 있어 결과로 덮어쓰지 않았어요.');
        snap(); drafts = out; render(); toast('분석 완료 · 바뀐 내용을 확인해 주세요', 'ok');
      } catch (err) { drawStatus(); toast('분석 실패 · 기존 내용을 그대로 두었어요. ' + err.message, 'err'); } finally { b.disabled = false; }
    } });
    return h('div.col.sb-ed-pane',
      inline ? anchorPicker() : null,
      h('div.sb-shape', h('span.field-label', '화면 비율'), seg('화면 비율', ORIENTATIONS, s.size ?? '', val => { snap(); if (val) s.size = val; else delete s.size; }).el),
      area(s, 'prompt', '장면 프롬프트', 5, '배경, 조명, 장면의 시각적 상황을 적어 주세요.', touch),
      s.finalPrompt ? chk('최종 프롬프트 직접 사용', true, v => { s.finalPrompt = v; touch(); }, '이 장면에는 공통 화풍 · 구도 · 품질 태그를 덧붙이지 않습니다.') : null,
      h('div.sb-two', area(s, 'camera', '구도', 3, 'medium shot, from the side …', touch), area(s, 'negative', '장면에서 피할 것', 3, '', touch)),
      h('details.sb-fold', h('summary', '공통 프롬프트 · 이번 작업'), h('div.col', area(cfg, 'style', '화풍', 3, '', touch), area(cfg, 'negative', '공통으로 피할 것', 2, '', touch), chk('품질 태그 붙이기', cfg.quality, v => { cfg.quality = v; touch(); }))),
      h('details.sb-fold', h('summary', 'AI 에게 고쳐 달라고 하기'), h('div.col', fld('고칠 방향', dir), fld('고칠 범위', sel([['all', '전체'], ['camera', '구도'], ['background', '배경'], ['characters', '인물']], scope, v => { scope = v; })), h('div.row', reanalyze, h('small.hint', '추가 호출이 한 번 일어납니다.')))));
  }
  function castTab() {
    const cast = (scene().characters ||= []); person = Math.max(0, Math.min(person, cast.length - 1));
    const names = h('div.sb-cast-list'), fields = h('div.sb-cast-fields.col'); let fx = null, fy = null;
    const coords = chk('좌표 적용', cfg.useCoords !== false, v => { cfg.useCoords = v; touch(); }), order = chk('인물 순서 적용', cfg.useOrder !== false, v => { cfg.useOrder = v; touch(); });
    const moved = () => { cfg.useCoords = true; coords.querySelector('input').checked = true; touch(); };
    const board = positionBoard({ model: boardModel(), width: cfg.width, height: cfg.height, bg: preview, onMove: moved, onSelect: i => { person = i; showPerson(); },
      entries: () => cast.map((c, i) => ({ name: c.name, x: c.x ?? 0.5, y: c.y ?? 0.5, set: (x, y) => { c.x = x; c.y = y; if (i === person && fx) { fx.value = x; fy.value = y; } } })) });
    const drawNames = () => put(names, ...cast.map((c, i) => h(`button.chip${i === person ? '.on' : ''}`, { type: 'button', title: c.name || `인물 ${i + 1}`, onclick: () => { person = i; board.select(i); showPerson(); } }, `${i + 1}. ${c.name || `인물 ${i + 1}`}`)));
    function showPerson() {
      drawNames(); const c = cast[person];
      const swap = d => { const to = person + d; if (to < 0 || to >= cast.length) return; snap(); [cast[person], cast[to]] = [cast[to], cast[person]]; person = to; render(); };
      const up = iconBtn('up', '인물 앞으로', () => swap(-1)), down = iconBtn('down', '인물 뒤로', () => swap(1));
      const del = iconBtn('trash', '인물 삭제', async () => { if (!c || !(await confirmBox(`“${c.name || '선택한 인물'}”을 이 장면에서 뺄까요? 되돌리기로 살릴 수 있어요.`, '빼기', true))) return; snap(); cast.splice(person, 1); person = Math.max(0, person - 1); render(); });
      up.disabled = person === 0 || !c; down.disabled = person >= cast.length - 1; del.disabled = !c;
      const lib = Illust.library(chat).filter(p => !cast.some(x => x.name === p.name));
      const add = (base) => { if (cast.length >= castMax()) return toast(`이 모델은 인물 ${castMax()}명까지예요`); snap(); cast.push(base || { name: `인물 ${cast.length + 1}`, prompt: '', negative: '', x: 0.5, y: 0.5 }); person = cast.length - 1; render(); };
      const head = h('div.row.sb-cast-actions', btn('인물 추가', { ic: 'plus', cls: 'ghost', onclick: e => lib.length ? menu(e.currentTarget, [{ label: '빈 인물', ic: 'plus', onclick: () => add() }, '-', ...lib.map(p => ({ label: p.name, ic: 'user', hint: p.player ? '내 캐릭터' : '', onclick: () => add(Illust.compileCharacter({ name: p.name, id: p.id }, Illust.library(chat), 'always')) }))]) : add() }), h('span.sb-grow'), up, down, del);
      if (!c) { fx = fy = null; return put(fields, head, empty('인물을 추가하면 프롬프트와 위치를 고칠 수 있어요.')); }
      const num = k => h('input.inp', { type: 'number', min: 0, max: 1, step: 0.01, value: c[k] ?? 0.5, oninput: e => { c[k] = Math.min(1, Math.max(0, +e.target.value || 0)); moved(); board.update(); } });
      fx = num('x'); fy = num('y');
      put(fields, head, text(c, 'name', '이름', '', () => { touch(); drawNames(); board.refresh(); board.select(person); }), area(c, 'prompt', '인물 프롬프트', 5, '외형, 지금 입은 옷, 동작과 표정', touch), area(c, 'negative', '이 인물에서 피할 것', 2, '', touch), h('div.sb-two', fld('가로 위치', fx), fld('세로 위치', fy)));
    }
    showPerson(); board.select(person);
    return h('div.sb-cast', h('div.sb-cast-visual', board.el, h('div.col', coords, order)), h('div.sb-cast-editor', names, fields));
  }
  function finalTab() {
    const s = scene(); let p;
    try { p = Illust.compose(chat, s, cfg); } catch (e) { return h('p.err', e.message); }
    const pos = h('textarea.inp', { rows: 7, value: p.base, spellcheck: false }), neg = h('textarea.inp', { rows: 4, value: p.negative, spellcheck: false });
    const lock = () => { Object.assign(s, { prompt: pos.value, negative: neg.value, camera: '', finalPrompt: true }); touch(); };
    pos.addEventListener('input', lock); neg.addEventListener('input', lock);
    return h('div.col.sb-ed-pane', h('p.hint', '실제로 보낼 프롬프트입니다. 여기서 직접 고치면 이 장면은 적은 내용을 그대로 씁니다. 인물별 프롬프트는 따로 보냅니다.'),
      fld('최종 장면 프롬프트', pos), fld('최종 제외 요소', neg),
      p.looks.length ? h('div.col', h('span.field-label', `인물 ${p.looks.length}명 · 인물 · 배치에서 고칩니다`), p.looks.map((l, i) => { const pt = snapPoint(l.x, l.y, boardModel()); return h('div.sb-caption', h('b', `${i + 1}. ${l.name || '인물'}`), h('span', l.caption), h('small', `${p.coords ? `위치 ${pt.x}, ${pt.y}` : '좌표 미적용'}${l.negative ? ` · 제외: ${l.negative}` : ''}`)); })) : h('small.hint', '등장 인물이 없는 장면입니다.'));
  }
  const fileMenu = e => menu(e.currentTarget, [
    { label: '장면 내보내기', ic: 'import', onclick: () => download('scenebook-scenes.json', JSON.stringify({ kind: 'scenebook-scenes', schema: 1, config: pickKeys(cfg, RENDER_KEYS.filter(k => !['references', 'connId', 'a1111'].includes(k))), scenes: drafts.map(({ anchor, ...s }) => s) }, null, 2)) },
    { label: '장면 가져오기', ic: 'upload', onclick: guard(async () => {
      const [f] = await pickFiles({ accept: '.json,application/json' }); if (!f) return; if (f.size > 300000) throw new Error('300KB 이하 장면 파일을 골라 주세요.');
      const v = JSON.parse(await f.text()); if (v?.kind !== 'scenebook-scenes' || !Array.isArray(v.scenes) || !v.scenes.length) throw new Error('장면 파일이 아니에요.');
      const next = Illust.validate({ ...cfg, ...pickKeys(v.config || {}, RENDER_KEYS.filter(k => !['references', 'connId', 'a1111', 'budgetGuard', 'backend'].includes(k))) });
      snap(); drafts = v.scenes.slice(0, LIMIT).map(s => Illust.compileScene(chat, { ...s, anchor: '' })); cfg = next; at = person = 0; render(); toast('장면을 불러왔어요', 'ok');
    }) },
    { label: '사용법', ic: 'note', onclick: guide },
  ]);
  const body = h('div.sb-ed',
    h('div.sb-ed-bar', h('div.row.wrap', chips, h('span.sb-grow'), backBtn, nextBtn, addBtn, delBtn)),
    h('div.row.sb-ed-status', status, h('span.sb-grow'), btn('생성 설정', { ic: 'sliders', cls: 'ghost', onclick: () => genEditor(cfg, next => { if (next.backend === 'nai' && drafts.some(s => s.characters.length > MODELS[next.model].characters)) throw new Error(`이 모델은 인물 ${MODELS[next.model].characters}명까지예요.`); snap(); if (next.width !== cfg.width || next.height !== cfg.height) for (const s of drafts) delete s.size; cfg = next; render(); }) })),
    tabs, content,
    h('div.sb-ed-foot', undoBtn, iconBtn('more', '내보내기 · 가져오기 · 사용법', fileMenu), h('span.sb-grow'), btn('초안 저장', { ic: 'check', onclick: guard(() => saveDraft(false)) }), genBtn));
  let asking = false;
  const askClose = () => {   // 저장하지 않은 변경이 있으면 닫기 전에 물어본다
    if (!dirty) return box.close(); if (asking) return; asking = true;
    modal({ title: '편집 내용', body: h('p', '저장하지 않은 변경 사항이 있어요.'), onClose: () => { asking = false; }, actions: [
      { label: '계속 편집', cls: 'ghost' },
      { label: '저장 없이 닫기', cls: 'ghost', onclick: () => { dirty = false; box.close(); } },
      { label: '저장 후 닫기', cls: 'primary', onclick: async () => { try { await saveDraft(true); box.close(); } catch (e) { toast(e.message, 'err'); return false; } } }] });
  };
  const onEsc = e => { if (e.key === 'Escape' && box.el === document.getElementById('modals')?.lastElementChild) { e.stopImmediatePropagation(); e.preventDefault(); askClose(); } };
  box = modal({ title: slot ? '장면 편집 · 다시 그리기' : '장면 편집', wide: true, body, onClose: () => { document.removeEventListener('keydown', onEsc, true); if (dirty && !slot) saveDraft(true).catch(e => toast(e.message, 'err')); } });
  document.addEventListener('keydown', onEsc, true);
  box.el.addEventListener('mousedown', e => { if (e.target === box.el) e.stopImmediatePropagation(); }, true);   // 바깥을 잘못 눌러도 편집하던 내용이 사라지지 않게
  box.el.querySelector('.modal-head .ibtn')?.replaceWith(iconBtn('x', '닫기', askClose));
  box.el.querySelector('.modal')?.classList.add('sb-editor');
  render();
}

// ════════ 프롬프트 편집 · 공유 ════════
function promptEditor(startAt = 0, onApplied = () => { }) {
  const c = Illust.cfg(), DEF_PLAN = c.leanPrompt ? LEAN_PROMPT : PLAN_PROMPT, d = { style: c.style || '', negative: c.negative || '', quality: !!c.quality, analysisPrompt: c.analysisPrompt || ANALYSIS_PROMPT, planPrompt: c.planPrompt || DEF_PLAN };
  const pane = h('div.col'), tabs = h('div.tabs.sb-tabs'); let at = startAt;
  const rules = (note, txt) => h('details.sb-fold', h('summary', '출력 규칙'), h('p.hint', note), h('pre.regex-out.sb-code', txt));
  const views = [
    ['화풍', () => [area(d, 'style', '메인 프롬프트 (모든 그림 앞에 붙습니다)', 5, 'watercolor, soft lighting …'), area(d, 'negative', '피할 것 (UC)', 3), chk('품질 태그 자동으로 붙이기', d.quality, v => { d.quality = v; }), h('p.hint', '모든 장면의 공통값입니다. 장면 · 인물별 프롬프트는 장면 편집에서 고칩니다.')]],
    ['수동 분석', () => [area(d, 'analysisPrompt', '장면 분석 지시문', 16), h('p.hint', '{{data}} 대화 · 인물 · {{maxScenes}} 장면 수 · {{modelRule}} 모델별 작성법 · {{playerRule}} 내 캐릭터 · {{direction}} 연출 방향. JSON 응답 형식은 그대로 지켜 주세요.'), rules('분석 결과의 JSON 형식 오류를 줄이려고 보낼 때 덧붙이는 규칙입니다. 저장한 지시문은 바꾸지 않아요.', Illust.analysisRules())]],
    ['주입', () => [h('p.hint', '답변을 쓰는 모델에게 프리셋 뒤에 덧붙여 보내는 지시문입니다. 전체를 <image_generation> 태그로 감싸 보냅니다.'), area(d, 'planPrompt', '삽화 계획 지시문', 16), h('p.hint', '바깥 태그는 자동으로 붙으니 <!--scenebook 출력 형식과 {{data}} 변수만 지켜 주세요. 장면 제목은 더 이상 요구하지 않습니다. 예전에 저장한 JSON 형식 지시문도 그대로 동작하며, 기본 지시문 버튼으로 짧은 줄 단위 형식으로 바꿀 수 있어요.'), rules('주입이 켜진 답변에는 장면을 최소 한 장 요구하고 빈 계획을 받지 않습니다. 저장한 지시문은 그대로 두고, 예전 지시문의 생략 허용 문구보다 이 출력 규칙을 우선하도록 전합니다. 삽화를 끄려면 자동 처리를 끄세요.', c.leanPrompt ? '간결한 삽화 지시문을 켠 상태에서는 추가 출력 규칙을 덧붙이지 않습니다.' : Illust.outputRules())]],
  ];
  const drawPane = () => { put(tabs, ...views.map(([l], i) => h(`button.tab${i === at ? '.on' : ''}`, { type: 'button', onclick: () => { at = i; drawPane(); } }, l))); put(pane, ...views[at][1]()); };
  const read = () => {
    for (const [k, name] of [['analysisPrompt', '분석 지시문'], ['planPrompt', '주입 지시문']]) {
      if (d[k].length > 30000) throw new Error(`${name}이 너무 길어요 (최대 30,000자).`);
      if (d[k] && !d[k].includes('{{data}}')) throw new Error(`${name}에는 {{data}} 가 필요해요. 이 자리에 대화 · 인물 정보가 들어갑니다.`);
      const unknown = [...d[k].matchAll(/\{\{(\w+)\}\}/g)].map(x => x[1]).filter(x => !['maxScenes', 'playerRule', 'modelRule', 'direction', 'data'].includes(x)); if (unknown.length) throw new Error(`${name}에 알 수 없는 변수가 있어요: ${unknown.join(', ')}`);
    }
    if (d.planPrompt && !d.planPrompt.includes('<!--scenebook')) throw new Error('주입 지시문에는 <!--scenebook 출력 형식이 필요해요.');
    return { style: d.style.trim(), negative: d.negative.trim(), quality: !!d.quality, analysisPrompt: d.analysisPrompt === ANALYSIS_PROMPT ? '' : d.analysisPrompt, planPrompt: d.planPrompt === DEF_PLAN ? '' : d.planPrompt };
  };
  drawPane();
  modal({ title: '프롬프트', wide: true, body: h('div.col', tabs, pane), actions: [
    { label: '내보내기', ic: 'import', cls: 'ghost', onclick: () => { try { const v = read(); download('scenebook-prompts.json', JSON.stringify({ kind: 'scenebook-prompts', schema: 1, style: v.style, negative: v.negative, quality: v.quality, analysisPrompt: v.analysisPrompt, injectionPrompt: v.planPrompt }, null, 2)); } catch (e) { toast(e.message, 'err'); } return false; } },
    { label: '가져오기', ic: 'upload', cls: 'ghost', onclick: async () => { try { const [f] = await pickFiles({ accept: '.json,application/json' }); if (!f) return false; if (f.size > 100000) throw new Error('100KB 이하 프롬프트 파일을 골라 주세요.'); const v = JSON.parse(await f.text()); if (v?.kind !== 'scenebook-prompts') throw new Error('프롬프트 파일이 아니에요.'); Object.assign(d, { style: String(v.style || ''), negative: String(v.negative || ''), quality: !!v.quality, analysisPrompt: String(v.analysisPrompt || '') || ANALYSIS_PROMPT, planPrompt: String(v.injectionPrompt || v.planPrompt || '') || DEF_PLAN }); drawPane(); toast('프롬프트를 불러왔어요. 내용을 확인한 뒤 적용해 주세요.'); } catch (e) { toast(e.message, 'err'); } return false; } },
    { label: '기본 지시문', cls: 'ghost', onclick: () => { if (at === 2) d.planPrompt = DEF_PLAN; else d.analysisPrompt = ANALYSIS_PROMPT; drawPane(); toast('기본 지시문을 불러왔어요. 적용하기 전에는 저장되지 않습니다.'); return false; } },
    { label: '적용', cls: 'primary', onclick: () => { try { Illust.saveCfg(read()); onApplied(); toast('프롬프트를 저장했어요', 'ok'); } catch (e) { toast(e.message, 'err'); return false; } } }] });
}

// ════════ 사용법 ════════
const GUIDE_STEPS = [
  ['그림 엔진 고르기', '기능 › 삽화 › 생성에서 그림 엔진을 고릅니다. NovelAI 는 키(Persistent API Token)를 넣고 위의 확인 버튼으로 계정 상태를 볼 수 있어요. NovelAI 와 프록시를 켠 연결은 드림랜드 서버(start.bat)로 열었을 때만 동작합니다.'],
  ['인물 등록', '인물 탭에서 저장 범위를 고른 뒤 이름 · 고정 외형 · 기본 복장을 적어 주세요. 전체는 모든 대화의 기본값, 현재 캐릭터는 그 캐릭터의 모든 대화, 현재 대화는 이 대화에만 적용됩니다. 캐릭터 · 페르소나 편집기의 에셋 탭에 적어 둔 외형도 자동으로 합쳐집니다. 외형 프로필은 변신 · 다른 차림 같은 또 다른 모습과 그 조건을 적는 곳입니다.'],
  ['자동으로 그리기', '맨 위의 자동 처리를 자동 생성으로 두면 답변을 쓰는 모델이 답변 끝에 삽화 계획을 함께 적고, 그 계획대로 바로 그려서 답변 아래에 붙입니다. 먼저 살펴보고 싶으면 초안만으로 두세요. 장면만 저장되고 답변 아래에서 그리기 · 장면 편집을 고를 수 있습니다.'],
  ['프롬프트와 배치', '장면 편집에서 장면 프롬프트 · 구도 · 제외 요소를 고치고, 인물 · 배치에서 인물별 프롬프트를 다듬습니다. 번호 점을 끌거나 좌표를 적어 위치를 정합니다. 위 · 아래 버튼은 인물 순서를 바꿉니다.'],
  ['그리기와 다시 고치기', '프롬프트 탭에서 실제로 보낼 내용을 확인하고 그리기를 누릅니다. 그림 위의 연필 버튼은 장면 수정, 화살표 버튼은 새 시드로 재생성입니다. 고친 결과는 새 버전으로 쌓이고 그림 오른쪽 아래의 ‹ › 로 넘겨 봅니다. 그림을 누르면 크게 보고 수정 · 재생성 · 저장할 수 있어요.'],
];
const GUIDE_TOPICS = [
  ['삽화 지시 형식 · 토큰 절약', '기본 지시문은 AI 가 장면마다 제목을 쓰지 않고, JSON 대신 한 줄에 한 항목씩 적는 짧은 형식으로 답하게 합니다. 괄호 · 따옴표 오류가 생기지 않고 답변 토큰도 줄어듭니다. 예전에 저장한 JSON 형식 지시문은 그대로 동작하며, 프롬프트 › 주입 › 기본 지시문으로 새 형식으로 바꿀 수 있습니다. 생성 › 프롬프트 › 간결한 삽화 지시문을 켜면 매 답변에 보내는 지시문이 약 1/5 길이의 짧은 버전으로 바뀝니다. 삽화 지시가 자주 빠지면 끄세요.'],
  ['구도 · 화면 비율', '기본 지시문은 주요 행동과 인물의 얼굴 · 접촉 지점이 실제로 보이는 방향을 먼저 고르게 합니다. 껴안거나 마주 보는 장면은 옆에서, 함께 누워 있는 장면은 위에서, 멀어지는 뒷모습은 뒤에서 잡는 식입니다. 생성 › 이미지의 장면에 맞춰 세로 · 가로 전환을 켜 두면 AI 가 장면마다 세로 · 가로 · 정사각을 고르고, 장면 편집에서 직접 바꿀 수도 있습니다. 예전에 저장한 주입 지시문에는 적용되지 않으므로 프롬프트 › 주입 › 기본 지시문을 눌러 새 지시문으로 바꾸세요.'],
  ['장면 수정 · 재생성', '삽화 위의 연필 버튼이나 크게 보기의 수정을 누르면 장면 수정 창이 열립니다. 원하는 장면을 말로 적고 AI 로 고쳐 쓰기를 누르거나, 구도 버튼 · 화면 비율 · 장면 · 인물 내용을 직접 고친 뒤 재생성을 누르세요. 새 그림은 같은 자리에 버전으로 추가됩니다. AI 로 고쳐 쓰기는 분석 연결로 요청을 한 번 보냅니다. 자세히 편집은 인물 배치까지 다루는 장면 편집을 엽니다.'],
  ['삽화 액자', '생성 › 대화 표시 › 삽화 액자에서 고릅니다. 별 장식 · 이중선 · 덩굴 코너 · 잎 가지 · 아르누보 같은 선 장식 액자는 삽화 비율에 맞춰 그려지며 장식 액자 색에서 흰색 · 검정 · 금색 · 남색 · 와인 · 분홍을 고를 수 있습니다. 액자 그림 추가로 가운데가 투명한 PNG · WebP 액자를 넣으면 창 위치와 모양을 자동으로 찾아 삽화에 씌웁니다. 세로용과 가로용을 따로 넣었다면 가로 그림에는 항목에서 가로용을 지정하세요. 화면 표시만 바꾸며 그림 원본은 그대로입니다.'],
  ['그림체 · 초안 일괄 생성', '생성 › 이미지 › 그림체에서 반실사 · 수채화 · 흑백 만화 · 도트 등을 고르면 해당 태그를 메인 프롬프트 앞에 붙여 생성합니다. 이미 만든 그림을 재생성할 때는 그 그림에 기록된 그림체를 유지합니다. 작업 탭의 초안 N개 생성은 초안만 저장돼 있고 그림이 없는 답변을 한꺼번에 대기열에 넣습니다.'],
  ['답변별 삽화 메뉴', '각 답변의 ⋯ 메뉴에 있는 장면 편집을 누르면 그 답변의 장면 편집이 열립니다. 예전 답변에도 삽화를 만들 수 있습니다. 답변을 고쳐도 그 답변의 삽화 · 장면 초안 · 지시 기록은 그대로 남습니다.'],
  ['자동 처리', '끄기는 계획 지시와 자동 생성을 모두 멈춥니다. 초안만은 장면을 저장만 하고, 자동 생성은 그림까지 그려 붙입니다. 답변 간격이 2면 한 번 걸러 처리합니다.'],
  ['계획 방식', '답변과 함께 계획은 추가 호출 없이 답변 끝의 숨은 주석(<!--scenebook … -->)으로 계획을 받습니다. 주석은 화면과 이후 대화에서 떼어 냅니다. 답변 뒤에 따로 분석은 답변이 끝난 뒤 보조 연결로 한 번 더 물어봅니다.'],
  ['삽화 지시가 없을 때', '모델이 계획을 빠뜨리면 답변 아래에 알림이 뜹니다. 장면 분석을 눌러 따로 뽑거나, 작업 › 지시 기록에서 받은 내용을 확인하세요. JSON 이 조금 틀리거나 잘려도 쉼표 · 괄호 · 배열 모양은 스스로 바로잡습니다.'],
  ['분석 방식', '빠르게는 장면을 바로 뽑습니다. 정밀하게는 인물의 복장이 언제 바뀌었는지 먼저 확인하므로 호출이 한 번 더 일어납니다.'],
  ['비용 보호', 'NovelAI 에서 1,048,576픽셀 · 28 Steps 를 넘는 요청을 막습니다. 구독 상태나 잔액을 판단하지는 않으니 무료 생성을 보장하지는 않아요.'],
  ['실패와 재시도', '실패하거나 결과를 확인하지 못한 유료 요청은 자동으로 다시 보내지 않습니다. 키 · 잔액 · 권한 · 요청 한도 오류가 나면 대기열을 일시정지합니다. 요청 한도(429) 뒤에는 60초를 기다립니다.'],
  ['시드', '-1 은 매번 새 값입니다. 그림의 더 보기에서 같은 시드로 다시 그리거나 기본 시드로 저장할 수 있어요. 시드가 같아도 모델 · 설정이 다르면 다른 그림이 나옵니다.'],
  ['인물 · 배치', '번호는 인물 프롬프트 순서입니다. V5 는 자유 좌표, V4.5 는 5 × 5 격자의 중심에 맞춥니다. 방향키로도 옮길 수 있고 Shift 를 누르면 크게 움직입니다. 균등 배치 · 좌우 뒤집기 · 중앙으로 빠르게 정리합니다. 좌표는 구도 지시일 뿐 정확한 위치를 보장하지는 않습니다.'],
  ['인물 설정 범위', '적용 순서는 현재 대화 → 현재 캐릭터 → 전체입니다. 인물 목록 · 외형 프로필 · 세계관 · 연출 · 내 캐릭터 설정을 한 묶음으로 저장하며 목록을 합치지는 않습니다. 여럿이 나오는 대화에서는 전체와 현재 대화 범위를 씁니다.'],
  ['참조: Vibe / Precise', 'NovelAI V4.5 에서 이미지의 분위기나 인물 특징을 새 그림에 반영합니다. Vibe 는 분위기 · 그림체, Precise 는 인물 · 스타일 용도이며 강도 · 충실도 · 정보량을 조절합니다. Vibe 는 처음 쓸 때 인코딩 요청이 한 번 일어납니다. V5 에서는 쓸 수 없어요.'],
  ['이미지 읽기', 'NovelAI 원본 PNG 에서 메인 · UC 프롬프트와 모델 · 해상도 · Steps · CFG · 샘플러를 읽습니다. 설정에 적용은 공통 화풍으로 저장하고, 장면으로 열기는 설정을 바꾸지 않고 이번 장면으로 불러옵니다. 캐릭터 프롬프트 · 좌표 · 시드는 가져오지 않으며, 스크린샷이나 변환본은 읽을 수 없습니다.'],
  ['삽입 위치', '기본은 답변 아래입니다. 생성 › 대화 표시에서 문단 뒤로 바꾸면 장면 편집에서 문단을 고를 수 있고, 위치를 찾지 못하면 답변 아래에 둡니다.'],
  ['삽화 지우기 · 숨기기', '그림의 더 보기에서 숨기거나 지울 수 있습니다. 지우면 그 자리의 버전이 모두 대화에서 빠지지만 그림은 갤러리에 남아 다시 넣을 수 있어요. 갤러리에서 지우면 완전히 사라집니다.'],
  ['작업 · 갤러리', '일시정지 · 재개는 다음 요청부터 적용됩니다. 이미 보낸 요청은 취소되지 않아요. 갤러리는 모든 대화의 삽화를 제목 · 프롬프트로 찾고, 눌러서 지금 대화에 넣거나 장면으로 다시 엽니다.'],
  ['프리셋 · 백업', '생성 설정을 이름 붙여 저장해 두고 바꿔 쓸 수 있습니다. 바뀌기 전 설정은 10개까지 자동으로 보관되어 이전 설정에서 되돌립니다. 내보낸 파일에는 키가 들어가지 않고, 가져온 뒤에는 자동 처리가 꺼집니다.'],
  ['성인 장면 프롬프트', '원문이 성인의 명시적인 성행위를 직접 묘사할 때만, 공통 장면 프롬프트에 인물 수 · 등급 · 정확한 행위나 체위를 넣고 인물 프롬프트에는 각자의 역할 · 자세 · 표정 · 복장 상태를 넣어 서로 맞추도록 지시합니다. 원문에 없는 행위를 더하지 않으며 성인으로 명확하지 않은 인물에게는 적용하지 않습니다. 전문은 프롬프트 › 출력 규칙에서 볼 수 있어요.'],
  ['삽화 지시 누락 방지', '답변 본문과 삽화 지시를 모두 최종 답변에 쓰도록 지시문 앞뒤에서 요구합니다. 이전 지시가 대화 기록에서 숨겨졌어도 새 답변에는 새 지시가 필요하고, 생각 과정에서만 쓰면 안 된다고 알립니다. 계획을 요청한 답변마다 최소 한 장을 요구하며 빈 계획은 받지 않습니다. 새 동작이 없으면 확인된 주변 풍경을 쓰도록 지시합니다. 삽화가 필요 없으면 자동 처리를 끄세요.'],
  ['지시문이 들어가는 자리', '삽화 계획 지시는 프리셋을 모두 조립한 뒤 맨 끝에 <image_generation> 태그로 감싸 덧붙입니다. 답변 간격에 해당하지 않는 답변에는 보내지 않습니다. 맨 위의 프롬프트 버튼에서 내용을 보고 고칠 수 있어요.'],
  ['설정 저장 · 복구', '입력한 설정은 바로 저장됩니다. 확인 필요 · 저장 안 됨이 보이면 표시된 값을 고쳐 주세요. 생성 › 프리셋 · 백업의 이전 설정에서 바뀌기 전 값을 최대 10개까지 되돌릴 수 있습니다.'],
  ['진행 · 실패 알림', '그리는 동안 답변 아래에 점선 틀이 자리를 잡고, 다시 그리는 그림에는 표시가 붙습니다. 완성되면 알림이 뜨고, 실패하면 답변 아래와 작업 탭 · 갤러리의 미완료에 이유가 남습니다. 실패한 유료 요청은 자동으로 다시 보내지 않아요.'],
  ['프롬프트 공유', '생성 › 프롬프트 › 편집 · 공유에서 공통 화풍 · 제외 요소, 수동 분석 지시문, 주입 지시문을 고치고 JSON 파일로 주고받습니다. 대화 내용과 키는 파일에 들어가지 않습니다. 장면 편집의 내보내기는 지금 장면들의 프롬프트 · 인물 · 생성 옵션을 저장합니다.'],
  ['인물 범위 복사 · 해제', '저장 범위를 바꾸면 그 범위의 내용이 열립니다. 편집 중인 인물을 다른 범위에서도 쓰려면 복사 버튼을 누르세요. 이미 설정이 있으면 덮어쓰기 전에 물어봅니다. 캐릭터 설정 사용 · 전체 설정 사용은 이 범위의 설정을 해제하고 윗 범위를 따릅니다.'],
  ['참조 이미지 삭제', '참조 탭의 휴지통을 누르면 등록한 이미지를 지우고 적용 목록과 프리셋에서도 뺍니다. 그 참조를 쓰는 대기 작업은 취소되고 이미 그린 삽화는 그대로입니다. 지워진 참조가 남은 예전 장면은 다시 열 때 알려 주고 빼 둡니다.'],
  ['수정 · 초안', '다시 분석은 고칠 방향을 모델에게 전합니다. 구도 · 배경 · 인물로 범위를 좁힐 수 있어요. 초안 저장으로 나중에 이어서 편집하고, 닫을 때 저장하지 않은 변경이 있으면 물어봅니다. 되돌리기는 장면 · 인물 목록을 바꾸기 전 상태로 돌아갑니다.'],
  ['AI 검수', '그림의 더 보기 › AI 검수는 이미지를 볼 수 있는 연결(수동 분석에 쓰는 연결)로 결과를 평가해 인물 · 복장 · 위치 · 구도에서 눈에 띄는 문제를 알려 줍니다. 참고 의견일 뿐 그림과 버전을 바꾸지 않습니다. 결과는 생성 기록에도 남습니다.'],
  ['대화 내보내기', '갤러리의 더 보기 › 지금 대화 내보내기는 보이는 삽화와 대화를 하나의 HTML 파일로 저장합니다. 삽입 위치가 문단 뒤면 그림도 그 문단 뒤에 들어갑니다.'],
  ['모델', '그림을 그릴 NovelAI 모델입니다. V5 는 자유 좌표, V4.5 는 5 × 5 인물 배치와 이미지 참조를 지원합니다.'],
  ['가로 · 세로', '출력 이미지의 픽셀 크기입니다. NovelAI 는 64의 배수를 씁니다. 대화에 보이는 크기는 최대 너비에서 따로 정합니다.'],
  ['Steps', '노이즈를 다듬는 반복 횟수입니다. 높을수록 시간과 비용이 늘 수 있고, 항상 더 좋은 결과가 되지는 않습니다.'],
  ['Guidance', '프롬프트를 따르는 강도입니다. 너무 높으면 색과 윤곽이 과해질 수 있어요.'],
  ['샘플러 · 스케줄러', '이미지를 다듬는 계산 방법과 노이즈를 줄여 가는 방식입니다. 바꾸면 같은 시드라도 결과가 달라집니다. V5 는 Karras 를 씁니다.'],
  ['CFG rescale', 'Guidance 로 과해진 밝기 · 대비를 누그러뜨리는 보정입니다. 0이면 적용하지 않습니다.'],
  ['품질 태그', '화풍 · 장면 뒤에 모델별 품질 태그를 붙입니다. 이미지에서 장면을 가져올 때는 겹치지 않도록 끕니다.'],
  ['좌표 · 인물 순서 적용', '좌표 적용은 인물의 화면 위치를, 인물 순서 적용은 인물 프롬프트의 순서를 요청에 싣습니다. 순서는 인물 · 배치의 위 · 아래 버튼으로 바꿉니다.'],
  ['분석에 쓸 연결', '따로 고르지 않으면 지금 대화의 연결로 분석합니다. 그림 엔진의 키와는 별개입니다.'],
  ['최대 장면', '한 답변에서 뽑거나 그릴 장면 수의 상한입니다. 보통은 한 장이고, 뚜렷이 다른 순간이 있을 때만 늘어납니다.'],
  ['참고할 앞 메시지 수', '고른 답변 앞에서 읽을 메시지 수입니다. 늘리면 분석에 보내는 양도 늘어납니다. 뒤의 메시지는 읽지 않습니다.'],
  ['화풍 · 제외 요소', '화풍은 모든 그림 앞에 붙는 공통 프롬프트이고, 제외 요소는 그리지 않았으면 하는 것입니다. 공통 · 장면별 · 인물별 제외 요소를 따로 적용하며, 장면 편집에서 이번 작업의 값만 바꿀 수도 있습니다.'],
  ['투명 배경', 'V5 에서 알파 채널을 가진 이미지를 요청합니다.'],
  ['최대 너비 · 작게 표시', '대화에 보이는 삽화의 크기입니다. 보관된 그림의 해상도는 바꾸지 않습니다.'],
  ['내 캐릭터 그리기', '그리지 않기는 내 캐릭터를 화면 밖(1인칭)에 두도록 지시합니다. 답변에 등장할 때만은 본문에서 보이는 경우에만, 함께 있으면 항상은 그 순간에 있으면 그립니다.'],
];
function guide() {
  let i = 0; const step = h('section.sb-guide-step'), count = h('span.hint'), list = h('div.sb-guide-topics');
  const back = btn('이전', { cls: 'ghost', onclick: () => { i--; draw0(); } }), next = btn('다음', { cls: 'ghost', onclick: () => { i++; draw0(); } });
  const draw0 = () => { put(step, h('b', `${i + 1}. ${GUIDE_STEPS[i][0]}`), h('p', GUIDE_STEPS[i][1])); count.textContent = `${i + 1} / ${GUIDE_STEPS.length}`; back.disabled = i === 0; next.disabled = i === GUIDE_STEPS.length - 1; };
  const filter = q => { const k = q.trim().toLowerCase(), hits = GUIDE_TOPICS.filter(([t, d]) => !k || `${t} ${d}`.toLowerCase().includes(k)); put(list, ...hits.map(([t, d]) => h('details.sb-fold', { open: !!k }, h('summary', t), h('p', d))), !hits.length && empty('일치하는 설명이 없어요.')); };
  draw0(); filter('');
  modal({ title: '삽화 사용법', wide: true, body: h('div.col', step, h('div.row', back, count, next), h('input.inp', { type: 'search', placeholder: '기능 찾기 · 예: 시드, 배치, 참조', oninput: e => filter(e.target.value) }), list) });
}

// ════════ NovelAI PNG 에서 설정 읽기 ════════
const MAX_FILE = 32 * 1024 * 1024, MAX_TEXT = 8 * 1024 * 1024, MAX_PIXELS = 16 * 1024 * 1024;
const utf8 = new TextDecoder('utf-8', { fatal: true }), latin = new TextDecoder('iso-8859-1');
const decodeText = b => { try { return utf8.decode(b); } catch { return latin.decode(b); } };
async function inflate(bytes, format) {
  if (bytes.length > MAX_TEXT) throw new Error('메타데이터가 너무 커요.');
  const out = new Uint8Array(await new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream(format))).arrayBuffer());
  if (out.length > MAX_TEXT) throw new Error('압축을 푼 메타데이터가 너무 커요.'); return out;
}
async function pngText(bytes) {
  if (bytes.length < 33 || bytes.length > MAX_FILE || [137, 80, 78, 71, 13, 10, 26, 10].some((b, i) => bytes[i] !== b)) throw new Error('NovelAI 에서 내려받은 원본 PNG 를 골라 주세요.');
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength), fields = {}; let p = 8, width = 0, height = 0, ended = false;
  const zero = (data, start) => { const z = data.indexOf(0, start); if (z < 0) throw new Error('PNG 텍스트 정보가 손상되었어요.'); return z; };
  while (p + 12 <= bytes.length) {
    const length = view.getUint32(p), kind = latin.decode(bytes.subarray(p + 4, p + 8));
    if (p + 12 + length > bytes.length) throw new Error('PNG 파일이 중간에 잘렸어요.');
    const data = bytes.subarray(p + 8, p + 8 + length);
    if (kind === 'IHDR') { width = view.getUint32(p + 8); height = view.getUint32(p + 12); if (!width || !height || width * height > MAX_PIXELS) throw new Error('이미지는 최대 1,600만 픽셀까지 읽을 수 있어요.'); }
    if (kind === 'tEXt' || kind === 'iTXt' || kind === 'zTXt') {
      const sep = zero(data, 0), key = latin.decode(data.subarray(0, sep)); let txt = '';
      if (kind === 'tEXt') txt = decodeText(data.subarray(sep + 1));
      if (kind === 'zTXt') txt = decodeText(await inflate(data.subarray(sep + 2), 'deflate'));
      if (kind === 'iTXt') { const compressed = data[sep + 1], lang = zero(data, sep + 3), tr = zero(data, lang + 1), raw = data.subarray(tr + 1); txt = utf8.decode(compressed ? await inflate(raw, 'deflate') : raw); }
      if (['Comment', 'Description', 'Source', 'Software', 'Title'].includes(key)) fields[key] = txt;
    }
    p += length + 12; if (kind === 'IEND') { ended = true; break; }
  }
  if (!ended) throw new Error('PNG 파일이 완전하지 않아요.'); return { fields, width, height };
}
/** 알파 채널 맨 아랫비트에 숨겨 둔 생성 정보 */
async function stealthMeta({ data, width, height }) {
  const pixels = width * height, magic = 'stealth_pngcomp'; if (pixels > MAX_PIXELS || pixels < (magic.length + 4) * 8) return null;
  let cursor = 0;
  const byte = () => { let v = 0; for (let b = 0; b < 8; b++) { if (cursor >= pixels) throw new Error('숨은 메타데이터가 중간에 잘렸어요.'); const x = Math.floor(cursor / height), y = cursor % height; v = (v << 1) | (data[(y * width + x) * 4 + 3] & 1); cursor++; } return v; };
  let found = ''; for (let i = 0; i < magic.length; i++) found += String.fromCharCode(byte());
  if (found !== magic && found !== 'stealth_pnginfo') return null;
  const bits = byte() * 16777216 + byte() * 65536 + byte() * 256 + byte();
  if (!bits || bits % 8 || bits > pixels - cursor || bits / 8 > MAX_TEXT) throw new Error('숨은 메타데이터 길이가 올바르지 않아요.');
  const packed = Uint8Array.from({ length: bits / 8 }, byte), parsed = JSON.parse(utf8.decode(found === magic ? await inflate(packed, 'gzip') : packed));
  return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : null;
}
function metaModel(source, explicit) {
  if (MODELS[explicit]) return explicit; if (typeof source !== 'string') return null; if (MODELS[source]) return source;
  const v5 = /NovelAI Diffusion V5\b/i.test(source), v45 = /NovelAI Diffusion V4\.5\b|DiffusionModelMetaName\.NAIv4next/i.test(source);
  if (v5 && (/\bFull\b/i.test(source) || /\b(?:657484A5|0ADF9AB7)\b/i.test(source))) return 'nai-diffusion-5-full';
  if (v5 && /\bCurated\b/i.test(source)) return 'nai-diffusion-5-curated';
  if (v45 && (/\bFull\b/i.test(source) || /\b(?:4BDE2A90|1229B44F|B9F340FD|F3D95188)\b/i.test(source))) return 'nai-diffusion-4-5-full';
  if ((v45 && /\bCurated\b/i.test(source)) || ((v45 || /NovelAI Diffusion V4\b/.test(source)) && /\b(?:C02D4F98|5AB81C7C|B5A2A797)\b/i.test(source))) return 'nai-diffusion-4-5-curated';
  return null;
}
function normalizeMeta(fields, dim = {}) {
  let p = fields.Comment ?? {}; if (typeof p === 'string') { try { p = JSON.parse(p); } catch { throw new Error('이미지의 생성 설정 JSON 이 손상되었어요.'); } }
  if (!p || typeof p !== 'object' || Array.isArray(p)) throw new Error('이미지의 생성 설정을 읽을 수 없어요.');
  const prompt = p.v4_prompt?.caption?.base_caption ?? p.prompt ?? fields.Description;
  if (typeof prompt !== 'string' || !prompt.trim() || prompt.length > 12000) throw new Error('NovelAI 생성 프롬프트를 찾을 수 없어요.');
  const patch = {}, warnings = [], skipped = [], model = metaModel(fields.Source, p.model);
  if (model) patch.model = model; else warnings.push('모델을 확정할 수 없어요. 적용할 모델을 직접 골라 주세요.');
  for (const [from, to, min, max, int] of [['width', 'width', 64, 2048, true], ['height', 'height', 64, 2048, true], ['steps', 'steps', 1, 50, true], ['scale', 'scale', 0, 10, false], ['cfg_rescale', 'cfgRescale', 0, 1, false]]) {
    const v = p[from] ?? (from === 'width' || from === 'height' ? dim[from] : undefined); if (v === undefined) continue;
    if (typeof v !== 'number' || !Number.isFinite(v) || v < min || v > max || (int && !Number.isInteger(v))) throw new Error(`${from}: 지원 범위를 벗어난 이미지 설정이에요.`); patch[to] = v;
  }
  if (p.sampler !== undefined) { if (SAMPLERS.includes(p.sampler)) patch.sampler = p.sampler; else warnings.push(`지원하지 않는 샘플러: ${String(p.sampler).slice(0, 100)}. 지금 샘플러를 그대로 씁니다.`); }
  if (p.noise_schedule !== undefined) { if (SCHEDULERS.includes(p.noise_schedule)) patch.scheduler = p.noise_schedule; else warnings.push('지원하지 않는 스케줄러는 적용하지 않아요.'); }
  if (typeof p.straight_alpha === 'boolean') patch.transparent = p.straight_alpha;
  for (const [k, l] of Object.entries({ sm: 'SMEA', sm_dyn: 'SMEA DYN', dynamic_thresholding: '동적 Guidance', legacy: 'Legacy', legacy_v3_extend: 'Legacy prompt', deliberate_euler_ancestral_bug: '구형 Euler 동작' })) if (p[k]) skipped.push(l);
  if (p.uncond_scale !== undefined && p.uncond_scale !== 1) skipped.push('Undesired Content strength');
  if (p.strength || p.noise || p.image || /img2img|inpaint|infilling/i.test(p.request_type ?? '')) skipped.push('Img2Img / Inpaint 원본');
  if (['reference_image_multiple', 'director_reference_images'].some(k => Array.isArray(p[k]) && p[k].length)) skipped.push('Vibe / Precise 참조');
  if (skipped.length) warnings.push(`가져오지 않는 항목: ${skipped.join(', ')}. 원본과 결과가 달라질 수 있어요.`);
  return { patch, warnings, source: String(fields.Source ?? p.model ?? '모델 정보 없음').slice(0, 300), scene: { ...blankScene(), title: typeof fields.Title === 'string' && fields.Title ? fields.Title.slice(0, 150) : '가져온 장면', prompt, negative: p.v4_negative_prompt?.caption?.base_caption ?? p.uc ?? p.negative_prompt ?? '' } };
}
async function readNaiImage(file) {
  if (!file || file.size > MAX_FILE) throw new Error('32MB 이하 원본 PNG 를 골라 주세요.');
  const png = await pngText(new Uint8Array(await file.arrayBuffer())); let firstError;
  if (png.fields.Comment || png.fields.Description) { try { return { ...normalizeMeta(png.fields, png), storage: 'PNG 텍스트' }; } catch (e) { firstError = e; } }
  const bmp = await createImageBitmap(file);
  try {
    const cv = document.createElement('canvas'); cv.width = bmp.width; cv.height = bmp.height;
    const ctx = cv.getContext('2d', { willReadFrequently: true }); ctx.drawImage(bmp, 0, 0);
    const hidden = await stealthMeta(ctx.getImageData(0, 0, bmp.width, bmp.height)); cv.width = cv.height = 1;
    if (hidden) return { ...normalizeMeta(hidden, png), storage: '알파 채널' };
  } finally { bmp.close(); }
  throw firstError || new Error('생성 정보가 없어요. 스크린샷이나 변환본 말고 NovelAI 에서 내려받은 원본 PNG 를 써 주세요.');
}
function importedConfig(base, result, { model, relax, forScene }) {
  if (!MODELS[model]) throw new Error('적용할 이미지 모델을 골라 주세요.');
  const patch = pickKeys(result.patch, ['width', 'height', 'steps', 'scale', 'sampler', 'scheduler', 'cfgRescale', 'transparent']), v5 = MODELS[model].family === 5;
  const next = { ...base, ...patch, backend: 'nai', model, budgetGuard: relax ? false : base.budgetGuard };
  if (v5) next.scheduler = 'karras'; else if (patch.transparent === undefined || !v5) next.transparent = false;
  if (forScene) Object.assign(next, { style: '', negative: '', quality: false, references: [] });   // 펼쳐진 프롬프트에는 품질 태그가 이미 들어 있다
  else { Object.assign(next, { style: result.scene.prompt, negative: result.scene.negative, quality: false }); if (!MODELS[model].references && base.references?.length) throw new Error('지금 켜 둔 참조를 해제한 뒤 V5 설정을 가져와 주세요.'); }
  return Illust.validate(next);
}
function imageImport(onApplied = () => { }) {
  const status = h('p.hint', { role: 'status' }), preview = h('div.col'), foot = h('div.row.end.wrap'); let serial = 0, url = '', box;
  const read = async file => {
    const ticket = ++serial; preview.replaceChildren(); foot.replaceChildren(); status.textContent = '이미지 정보를 읽는 중…'; if (url) URL.revokeObjectURL(url);
    try {
      const r = await readNaiImage(file); if (ticket !== serial) return;
      status.textContent = `${file.name || '붙여 넣은 이미지'} · ${r.storage}`; url = URL.createObjectURL(file);
      let model = r.patch.model || '', relax = false; const c = Illust.cfg();
      const labels = { width: '가로', height: '세로', steps: 'Steps', scale: 'Guidance (CFG)', sampler: '샘플러', scheduler: '스케줄러', cfgRescale: 'CFG rescale', transparent: '투명 배경' };
      const large = (r.patch.width ?? c.width) * (r.patch.height ?? c.height) > 1048576 || (r.patch.steps ?? c.steps) > 28;
      put(preview, 
        h('div.sb-import-head', h('img', { src: url, alt: '가져올 이미지' }), h('div.col', fld('적용할 모델', sel([['', '모델 선택'], ...Object.entries(MODELS).map(([id, m]) => [id, m.label])], model, v => { model = v; })), h('small.hint', r.source))),
        h('table.sb-table', h('caption', '가져올 생성 설정'), Object.entries(labels).filter(([k]) => k in r.patch).map(([k, l]) => h('tr', h('th', l), h('td', typeof r.patch[k] === 'boolean' ? (r.patch[k] ? '켜짐' : '꺼짐') : String(r.patch[k]))))),
        h('details.sb-fold', { open: true }, h('summary', '메인 프롬프트'), h('pre.regex-out.sb-code', r.scene.prompt)), h('details.sb-fold', h('summary', 'UC 프롬프트'), h('pre.regex-out.sb-code', r.scene.negative || '비어 있음')),
        large && c.budgetGuard ? chk('비용 보호 해제', false, v => { relax = v; }, '큰 해상도 · 28 Steps 초과 설정을 적용할 때만 직접 골라 주세요.') : null,
        r.warnings.length ? h('ul.sb-warn', r.warnings.map(w => h('li', w))) : null,
        h('p.hint', '메인 · UC 프롬프트와 위 생성 설정을 가져옵니다. 캐릭터 프롬프트 · 좌표 · 시드는 가져오지 않고, 품질 태그는 겹치지 않도록 끕니다.'));
      put(foot, 
        btn('장면으로 열기', { ic: 'edit', onclick: guard(async () => { const cfg = importedConfig(Illust.genConfig(), r, { model, relax: large && relax, forScene: true }); await compose(lastReply(), { initial: [r.scene], config: cfg }); box.close(); }) }),
        btn('설정에 적용', { ic: 'check', cls: 'primary', onclick: guard(() => { Illust.saveCfg(importedConfig(Illust.genConfig(), r, { model, relax: large && relax, forScene: false }), { reason: '이미지 읽기 전', force: true }); box.close(); onApplied(); toast('메인 · UC 프롬프트와 생성 설정을 적용했어요', 'ok'); }) }));
    } catch (e) { if (ticket === serial) status.textContent = e.message; }
  };
  const drop = h('div.dropzone.small', { tabIndex: 0, onclick: async () => { const [f] = await pickFiles({ accept: '.png,image/png' }); if (f) read(f); } }, icon('image', 24), h('b', 'NovelAI 원본 PNG 고르기'), h('span', '여기에 놓거나 붙여 넣어도 됩니다 · 최대 32MB'));
  drop.addEventListener('dragover', e => { e.preventDefault(); drop.classList.add('over'); }); drop.addEventListener('dragleave', () => drop.classList.remove('over'));
  drop.addEventListener('drop', e => { e.preventDefault(); drop.classList.remove('over'); if (e.dataTransfer?.files?.[0]) read(e.dataTransfer.files[0]); });
  const body = h('div.col', drop, status, preview, foot);
  body.addEventListener('paste', e => { const f = [...(e.clipboardData?.files || [])][0]; if (f) { e.preventDefault(); read(f); } });
  box = modal({ title: '이미지 읽기', wide: true, body, onClose: () => { serial++; if (url) URL.revokeObjectURL(url); } });
}

// ════════ 지시 기록 · 대화 내보내기 ════════
function showPlans() {
  const { chat, msgs } = cur(); if (!chat) return toast('대화를 먼저 열어 주세요');
  const labels = { queued: '생성 요청됨', done: '그림 완성', ready: '초안 저장됨', missing: '지시 없음', failed: '처리 실패' }; let box;
  const rows = msgs.map((m, i) => ({ m, i, sw: m.swipes?.[m.sw] })).filter(r => r.sw?.illustPlan || r.sw?.illustDraft?.length).slice(-20).reverse();
  box = modal({ title: '지시 기록', wide: true, body: h('div.col', h('p.hint', '이 대화 · 최근 답변 20개'), !rows.length ? empty('저장된 지시가 없어요. 다음 답변부터 처리 결과가 남습니다.') : rows.map(({ m, i, sw }) => { const p = sw.illustPlan || {};
    return h('details.sb-fold', h('summary', `답변 ${i + 1} · ${labels[p.status] || '초안 저장됨'}`), p.error && h('p.err', p.error), p.warnings?.length ? h('ul.sb-warn', p.warnings.map(w => h('li', w))) : null, p.repairs?.length ? h('small.hint', `형식 복구: ${p.repairs.join(' · ')}`) : null,
      p.raw && h('pre.regex-out.sb-code', p.raw), h('div.row', btn('장면 편집', { ic: 'edit', cls: 'ghost', onclick: guard(async () => { box.close(); await compose(m); }) }), btn('답변으로 가기', { cls: 'ghost', onclick: () => { box.close(); chatApi.scrollTo(m.id); } }))); })) });
}
function exportChat() {
  const { chat, msgs } = cur(); if (!chat) return toast('대화를 먼저 열어 주세요');
  const user = S.persona(chat)?.name || '나', name = chat.name || chat.charIds.map(id => S.get('chars', id)?.name).filter(Boolean).join(', ') || '삽화 대화';
  const body = msgs.filter(m => m.role !== 'system' && !m.hidden).map(m => { const sw = m.swipes[m.sw] || {};
    const inline = Illust.cfg().placement === 'inline', fig = it => `<figure><img src="${Illust.data(it.id)}" alt="${esc(it.title || '삽화')}">${shownTitle(it.title) ? `<figcaption>${esc(it.title)}</figcaption>` : ''}</figure>`;
    const items = (sw.illust || []).filter(it => !it.hidden && Illust.data(it.id)), body0 = Illust.strip(sw.text || '').trim(), paras = inline ? body0.split(/\n\s*\n/) : [body0], slots = paras.map(() => []), tail = [];
    for (const it of items) { const key = inline && it.anchor ? flat(it.anchor).slice(0, 40) : '', i = key ? paras.findIndex(p => flat(p).includes(key)) : -1; (i >= 0 ? slots[i] : tail).push(it); }   // 문단 뒤 삽화는 그 문단 뒤에
    return `<article><h2>${esc(m.role === 'user' ? user : m.name || '')}</h2>${paras.map((p, i) => `<div class="text">${esc(p)}</div>${slots[i].map(fig).join('')}`).join('')}${tail.map(fig).join('')}</article>`; }).join('\n');
  download(`${name.replace(/[\\/:*?"<>|]/g, '_')}.html`, `<!doctype html><html lang="ko"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(name)}</title><style>body{background:#fafaf8;color:#161616;font:16px/1.85 system-ui,sans-serif;margin:0}main{max-width:820px;padding:28px 22px;margin:auto}article{padding:22px 0;border-bottom:1px solid #1616162e}h1{font-size:24px}h2{font-size:14px;letter-spacing:.04em}.text{white-space:pre-wrap;overflow-wrap:anywhere;margin:0 0 1.1em}figure{max-width:560px;margin:22px auto;border:1px solid #161616}img{display:block;width:100%;height:auto}figcaption{font-size:13px;padding:6px 10px;border-top:1px solid #1616162e}</style><main><h1>${esc(name)}</h1>${body}</main></html>`, 'text/html;charset=utf-8');
}

// ════════ 스튜디오 ════════
let studioTab = 'gen', castScope = null;
const GEN_KEYS = [...RENDER_KEYS, 'naiKey', 'maxScenes', 'every', 'sessionLimit', 'contextMessages', 'analysisMode', 'placement', 'displayWidth', 'compact', 'autoSize', 'look', 'leanPrompt', 'frame', 'frameWide', 'frameInk'];
const TIERS = ['Paper', 'Tablet', 'Scroll', 'Opus'];
const queueText = () => { const w = Illust.queue().filter(x => x.state === 'waiting').length; return Illust.queueRunning() && Illust.queue().some(x => x.state === 'running') ? `삽화 그리는 중${w ? ` · 대기 ${w}` : ''}` : Illust.queuePaused() ? `생성 일시정지${w ? ` · 대기 ${w}` : ''}` : w ? `대기 ${w}` : ''; };
let flowNote = '';   // 마지막 처리 결과 (스튜디오 · 장면 패널의 상태 줄)
const statusText = () => queueText() || flowNote || '설정은 자동으로 저장됩니다.';

function connHelp() {
  modal({ title: '연결 안내', body: h('div.col', h('p', 'NovelAI 로 그리려면 드림랜드 서버와 NovelAI 키가 필요합니다.'), h('ol.sb-help-steps',
    h('li', '드림랜드 폴더의 start.bat 을 실행하고, 거기서 알려 주는 주소로 드림랜드를 엽니다. NovelAI 는 브라우저에서 바로 부를 수 없어 이 서버를 거칩니다.'),
    h('li', 'NovelAI 사이트의 계정 설정에서 Persistent API Token 을 만들어 생성 탭의 NovelAI 키에 넣습니다. 키는 이 기기에만 저장됩니다.'),
    h('li', '위의 확인을 눌러 구독 상태와 남은 Anlas 가 보이면 준비가 끝난 것입니다.')),
    h('p.hint', '다른 그림 엔진(OpenAI 호환 · Gemini · Stable Diffusion WebUI)은 생성 탭의 그림 엔진에서 고릅니다.')) });
}
function connBar() {
  const c = Illust.cfg(), label = h('span.sb-conn-label'), bar = h('div.sb-conn', label);
  const set = (t, state = '') => { label.textContent = t; bar.dataset.state = state; };
  if (c.backend === 'nai') {
    set(c.naiKey ? 'NovelAI · 키 저장됨' : 'NovelAI · 키를 넣어 주세요', c.naiKey ? 'ready' : 'warn');
    bar.append(btn('확인', { ic: 'refresh', cls: 'ghost', onclick: async () => { set('연결 확인 중…'); try { const a = await Illust.account(); set(`NovelAI · 구독 ${a.active ? '활성' : '비활성'}${a.tier != null ? ` · ${TIERS[a.tier] || a.tier}` : ''}${a.anlas != null ? ` · Anlas ${a.anlas.toLocaleString()}` : ''}`, a.active ? 'ready' : 'warn'); } catch (e) { set(e.message, 'warn'); } } }));
  } else if (c.backend === 'a1111') set(`Stable Diffusion WebUI · ${c.a1111 || 'http://127.0.0.1:7860'}`, 'ready');
  else { const conn = S.get('conns', c.connId); set(conn ? `${BACKENDS[c.backend]} · ${conn.name}${c.imgModel ? ' · ' + c.imgModel : ''}` : `${BACKENDS[c.backend]} · 쓸 연결을 골라 주세요`, conn ? 'ready' : 'warn'); }
  if (c.backend === 'nai') bar.append(btn('연결 안내', { ic: 'plug', cls: 'ghost', onclick: connHelp }));
  bar.append(btn('사용법', { ic: 'note', cls: 'ghost', onclick: guide }));
  return bar;
}
function workflow(redraw) {
  const c = Illust.cfg(), status = h('p.hint.sb-wf-status', { role: 'status' }, statusText());
  const help = c.automatic === 'off' ? '꺼짐 · 삽화 계획 지시와 자동 처리를 모두 멈춥니다. 메시지의 ⋯ 메뉴로 직접 그릴 수 있어요.'
    : `${c.mode === 'plan' ? '답변을 쓰는 모델이 답변 끝에 계획을 함께 적습니다 (추가 호출 없음)' : '답변이 끝난 뒤 보조 연결로 장면을 따로 뽑습니다 (추가 호출 1회)'} → ${c.automatic === 'review' ? '초안만 저장' : '바로 그려서 붙임'} · ${c.every > 1 ? `답변 ${c.every}개마다` : '답변마다'}`;
  return h('section.sb-workflow',
    h('div.sb-wf-row', fld('자동 처리', sel([['off', '끄기'], ['review', '초안만'], ['generate', '자동 생성']], c.automatic, v => { Illust.saveCfg({ automatic: v }); redraw(); })),
      fld('장면을 정하는 방법', sel([['plan', '답변과 함께 계획 (프롬프트 주입)'], ['call', '답변 뒤에 따로 분석']], c.mode, v => { Illust.saveCfg({ mode: v }); redraw(); })),
      btn('프롬프트', { ic: 'edit', cls: 'ghost', title: '삽화 계획 지시문 보기 · 고치기', onclick: () => promptEditor(2) })),
    h('p.hint', help), status);
}

function genPage(reopen) {
  const c = Illust.cfg(), d = clone(Object.fromEntries(GEN_KEYS.map(k => [k, c[k]]))), nai = d.backend === 'nai', api = d.backend === 'openai' || d.backend === 'gemini';
  const state = h('span.sb-state', { role: 'status' }); let shape = d.backend + d.model, base = clone(d), saved = false;
  if (!validFrame(d.frame)) d.frame = 'soft'; if (d.frameWide && !validFrame(d.frameWide)) d.frameWide = '';
  const verify = () => {
    try {
      Illust.validate(Illust.genConfig(d));
      for (const [k, a, b, n] of [['maxScenes', 1, 6, '최대 장면'], ['every', 1, 20, '답변 간격'], ['contextMessages', 0, 30, '이전 메시지'], ['displayWidth', 240, 1200, '최대 너비']]) if (!Number.isInteger(d[k]) || d[k] < a || d[k] > b) throw new Error(`${n}: ${a}~${b} 정수를 입력해 주세요.`);
      state.textContent = saved ? '저장됨' : '변경하면 자동으로 저장됩니다'; state.classList.remove('bad');
    } catch (e) { state.textContent = '확인 필요 · ' + e.message; state.classList.add('bad'); }
  };
  const save = () => {   // 이 화면에서 바꾼 항목만 저장한다 (다른 곳에서 바꾼 값을 덮어쓰지 않게)
    fixModel(d); saved = true; const patch = Object.fromEntries(GEN_KEYS.filter(k => JSON.stringify(d[k]) !== JSON.stringify(base[k])).map(k => [k, d[k]])); base = clone(d);
    if (Object.keys(patch).length) Illust.saveCfg(patch); verify(); if (d.backend + d.model !== shape) { shape = d.backend + d.model; reopen(); } };
  const f = defs => form(d, defs, save), conns = [['', '골라 주세요'], ...S.conns.map(x => [x.id, x.name])];
  const sizes = h('div.row.wrap.sb-sizes', [['세로', 832, 1216], ['정사각', 1024, 1024], ['가로', 1216, 832]].map(([l, w, hh]) => h(`button.chip${d.width === w && d.height === hh ? '.on' : ''}`, { type: 'button', onclick: () => { d.width = w; d.height = hh; save(); reopen(); } }, `${l} ${w}×${hh}`)));
  const helper = form(S.settings, [{ k: 'helpers.illust', label: '분석에 쓸 연결', type: 'select', opts: [['', '대화에 쓰는 연결'], ...S.conns.map(x => [x.id, `${x.name}${x.model ? ' · ' + x.model : ''}`])], hint: '따로 고르지 않으면 지금 대화에 쓰는 연결로 분석합니다.' }], () => S.set({}));
  // 삽화 액자: 고르는 칸마다 대화에서 쓰는 것과 같은 코드로 액자를 그려 보여 준다
  const frames = h('div.sb-frames', { role: 'radiogroup', 'aria-label': '삽화 액자' }, frameChoices().map(item => {
    const pic = h('span.sb-pic', h('span.sb-frame-sample')), wrap = h('span.sb-frame', pic), sample = h('span.illust.sb-frame-fig', wrap);
    applyFrame(sample, wrap, pic, 4, 5, { frame: item.id, frameInk: d.frameInk });
    return h(`button.sb-frame-choice${item.id === d.frame ? '.on' : ''}`, { type: 'button', role: 'radio', 'aria-checked': String(item.id === d.frame), title: item.label, onclick: () => { d.frame = item.id; save(); reopen(); } }, sample, h('span.sb-frame-name', item.label));
  }));
  const customFrames = Frames.list();
  const addFrame = guard(async () => { const [file] = await pickFiles({ accept: 'image/png,image/webp' }); if (!file) return; const rec = await Frames.add(file); Illust.saveCfg({ frame: `image:${rec.id}` }); toast('액자 그림을 추가했어요', 'ok'); reopen(); });
  const frameMenu = e => menu(e.currentTarget, customFrames.map(fr => ({ label: `“${fr.name}” 삭제`, ic: 'trash', onclick: guard(async () => {
    if (!(await confirmBox(`“${fr.name}” 액자 그림을 지울까요?`, '지우기', true))) return;
    const now0 = Illust.cfg(), id = `image:${fr.id}`; await Frames.remove(fr.id); Illust.saveCfg({ frame: now0.frame === id ? 'soft' : now0.frame, frameWide: now0.frameWide === id ? '' : now0.frameWide }); reopen(); }) })));
  const presetName = h('input.inp', { placeholder: '프리셋 이름' });
  const presets = (c.presets || []).map(p => h('div.sb-preset', h('b', p.name), h('small', configLine(p.config)), btn('적용', { cls: 'ghost', onclick: () => { Illust.saveCfg(pickKeys(p.config, RENDER_KEYS), { reason: `프리셋 “${p.name}” 적용 전`, force: true }); toast(`“${p.name}” 프리셋을 적용했어요`, 'ok'); reopen(); } }),
    iconBtn('trash', '프리셋 삭제', async () => { if (!(await confirmBox(`“${p.name}” 프리셋을 지울까요?`, '지우기', true))) return; Illust.saveCfg({ presets: Illust.cfg().presets.filter(x => x.name !== p.name) }); reopen(); }, 'tiny')));
  const history = () => { let box; const list = Illust.cfg().history || [];
    box = modal({ title: '이전 설정', body: h('div.col', !list.length ? empty('보관된 이전 설정이 없어요. 다음 변경부터 자동으로 보관합니다.') : list.map(e => h('div.sb-preset', h('b', `${new Date(e.time).toLocaleString('ko-KR')} · ${e.reason}`), h('small', configLine(e.settings)), btn('되돌리기', { cls: 'ghost', onclick: () => { const { history: _h, ...rest } = e.settings; Illust.saveCfg(rest, { reason: '되돌리기 전', force: true }); box.close(); reopen(); toast('이전 설정으로 되돌렸어요', 'ok'); } })))) }); };
  const exportAll = () => { const { naiKey, history: _h, ...rest } = Illust.cfg(); download('scenebook-settings.json', JSON.stringify({ kind: 'dreamland-illust', schema: 1, settings: rest }, null, 2)); };
  const importAll = guard(async () => {
    const [file] = await pickFiles({ accept: '.json,application/json' }); if (!file) return; if (file.size > 1000000) throw new Error('1MB 이하 설정 파일을 골라 주세요.');
    const v = JSON.parse(await file.text()); if (v?.schema !== 1 || !v.settings || typeof v.settings !== 'object') throw new Error('삽화 설정 파일이 아니에요.');
    const s = { ...v.settings }; if (s.injectionPrompt !== undefined && s.planPrompt === undefined) s.planPrompt = s.injectionPrompt;   // 예전 형식의 설정 파일도 받는다
    if (!v.kind) { delete s.references; delete s.characterVisuals; s.presets = (s.presets || []).map(p => ({ name: p.name, config: { ...pickKeys(p.config || {}, RENDER_KEYS), references: [] } })); if (s.promptInjection !== undefined) s.mode = 'plan'; }
    const known = Object.keys(Illust.cfg()).filter(k => !['naiKey', 'history', 'auto'].includes(k));
    Illust.saveCfg({ ...pickKeys(s, known), automatic: 'off' }, { reason: '가져오기 전', force: true }); reopen(); toast('설정을 가져왔어요. 자동 처리는 꺼 두었습니다.', 'ok');
  });
  verify();
  return h('div.sb-gen',
    group('이미지', f([
      { k: 'backend', label: '그림 엔진', type: 'select', opts: Object.entries(BACKENDS), half: true, live: true },
      nai && { k: 'model', label: '모델', type: 'select', opts: Object.entries(MODELS).map(([id, m]) => [id, m.label]), half: true, live: true },
      nai && { k: 'naiKey', label: 'NovelAI 키 (Persistent API Token)', type: 'password', hint: '이 기기에만 저장되고 백업 파일에는 들어가지 않습니다.' },
      api && { k: 'connId', label: '쓸 연결 (키와 주소를 빌려 씁니다)', type: 'select', opts: conns, half: true }, api && { k: 'imgModel', label: '이미지 모델', ph: d.backend === 'gemini' ? 'gemini-3.1-flash-image' : 'gpt-image-1', half: true },
      d.backend === 'a1111' && { k: 'a1111', label: 'WebUI 주소 (--api 로 실행)', half: true },
      { k: 'width', label: '가로', type: 'num', min: 64, max: 4096, step: 64, half: true }, { k: 'height', label: '세로', type: 'num', min: 64, max: 4096, step: 64, half: true }, { el: sizes },
      { k: 'autoSize', label: '장면에 맞춰 세로 · 가로 전환', type: 'check', hint: '누운 장면은 가로, 서 있는 장면은 세로처럼 AI 가 장면마다 화면 비율을 고릅니다. 픽셀 수는 위 설정과 비슷하게 유지합니다.' },
      (nai || d.backend === 'a1111') && { k: 'steps', label: 'Steps', type: 'num', min: 1, max: 150, step: 1, half: true }, (nai || d.backend === 'a1111') && { k: 'scale', label: 'Guidance', type: 'num', min: 0, max: 30, step: 0.1, half: true },
      { k: 'look', label: '그림체', type: 'select', opts: LOOKS.map(([id, label]) => [id, label]), hint: '선택 사항입니다. 고르면 그 그림체의 태그를 메인 프롬프트 앞에 붙입니다.' }])),
    group('프롬프트', f([{ k: 'style', label: '메인 프롬프트 (화풍 · 모든 그림 앞에 붙습니다)', type: 'area', rows: 3, ph: 'watercolor, soft lighting …' }, { k: 'negative', label: '피할 것 (UC)', type: 'area', rows: 2 }, { k: 'quality', label: '품질 태그 자동으로 붙이기', type: 'check' },
      { k: 'leanPrompt', label: '간결한 삽화 지시문', type: 'check', hint: '답변을 쓰는 모델에게 매번 보내는 삽화 지시문을 짧은 버전으로 바꿔 입력 토큰을 줄입니다. 삽화 지시가 자주 빠지면 끄세요.' }]),
      h('div.row', btn('편집 · 공유', { ic: 'edit', cls: 'ghost', onclick: () => promptEditor(0, reopen) }), h('small.hint', '분석 · 주입 지시문도 여기서 고치고 파일로 주고받습니다.'))),
    group('수동 분석', helper, f([{ k: 'analysisMode', label: '분석 방식', type: 'select', opts: [['quick', '빠르게'], ['precise', '정밀하게 (복장 변화 추적 · 호출 1회 추가)']], half: true }, { k: 'contextMessages', label: '참고할 앞 메시지 수', type: 'num', min: 0, max: 30, step: 1, half: true }]),
      h('div.row', btn('마지막 답변 분석', { ic: 'sparkle', onclick: guard(() => compose(lastReply(), { manual: false })) }), h('small.hint', '삽화 지시가 없는 답변을 따로 분석해 장면 편집기를 엽니다.'))),
    group('자동 생성 한도', f([{ k: 'maxScenes', label: '답변당 최대 장면', type: 'num', min: 1, max: 6, step: 1, third: true }, { k: 'every', label: '답변 간격', type: 'num', min: 1, max: 20, step: 1, third: true }]),
      h('small.hint', `이번 접속에서 보낸 그림 요청 ${Illust.usage()}회`)),
    group('고급 설정', f([
      nai && { k: 'sampler', label: '샘플러', type: 'select', opts: SAMPLERS, half: true }, nai && { k: 'scheduler', label: MODELS[d.model]?.family === 5 ? '스케줄러 (V5 는 Karras 고정)' : '스케줄러', type: 'select', opts: MODELS[d.model]?.family === 5 ? ['karras'] : SCHEDULERS, half: true },
      d.backend === 'a1111' && { k: 'sdSampler', label: '샘플러', ph: 'Euler a', half: true },
      (nai || d.backend === 'a1111') && { k: 'seed', label: 'Seed', type: 'num', min: -1, max: 4294967295, step: 1, half: true, hint: '-1: 매번 새 값' }, nai && { k: 'cfgRescale', label: 'CFG rescale', type: 'num', min: 0, max: 1, step: 0.05, half: true },
      { k: 'useCoords', label: '인물 좌표 적용', type: 'check' }, { k: 'useOrder', label: '인물 순서 적용', type: 'check' },
      nai && MODELS[d.model]?.family === 5 && { k: 'transparent', label: '투명 배경 (V5 전용)', type: 'check' },
      nai && { k: 'budgetGuard', label: '비용 보호', type: 'check', hint: '1메가픽셀 · 28 Steps 제한. 무료 생성을 보장하지는 않아요.' }])),
    group('대화 표시', f([{ k: 'placement', label: '삽입 위치', type: 'select', opts: [['end', '답변 아래'], ['inline', '문단 뒤 (못 찾으면 답변 아래)']], half: true }, { k: 'displayWidth', label: '최대 너비 (px)', type: 'num', min: 240, max: 1200, step: 10, half: true }, { k: 'compact', label: '작게 표시', type: 'check' }]),
      h('span.field-label', '삽화 액자'), frames,
      form(d, [{ k: 'frameInk', label: '장식 액자 색', type: 'select', opts: INKS.map(([ink, label]) => [ink, label]), half: true, live: true }], () => { save(); reopen(); }),
      customFrames.length ? fld('가로 그림에는', sel([['', '같은 액자'], ...frameChoices().map(x => [x.id, x.label])], d.frameWide, val => { d.frameWide = val; save(); })) : null,
      h('div.row.wrap', btn('액자 그림 추가', { ic: 'plus', cls: 'ghost', onclick: addFrame }), customFrames.length ? btn('액자 그림 관리', { ic: 'more', cls: 'ghost', onclick: frameMenu }) : null),
      h('small.hint', '가운데가 투명한 PNG · WebP 액자 그림을 추가하면 삽화에 씌웁니다. 세로용 · 가로용을 따로 넣을 수 있어요. 화면 표시만 바꾸며 그림 원본은 그대로입니다.')),
    h('div.sb-savebar', state),
    group('프리셋 · 백업', h('div.row', presetName, btn('프리셋 저장', { ic: 'plus', onclick: guard(() => { const name = presetName.value.trim(); if (!name) throw new Error('프리셋 이름을 적어 주세요.'); const list = Illust.cfg().presets || []; if (list.some(p => p.name === name)) throw new Error('같은 이름의 프리셋이 있어요.'); if (list.length >= 30) throw new Error('프리셋은 최대 30개예요.'); Illust.saveCfg({ presets: [...list, { name, config: pickKeys(Illust.cfg(), RENDER_KEYS) }] }); reopen(); }) })),
      presets.length ? h('div.col', presets) : h('small.hint', '지금 생성 설정(모델 · 크기 · 화풍 · 참조 …)을 이름 붙여 저장해 두고 바꿔 쓸 수 있어요.'),
      h('div.row.wrap', btn('이전 설정', { cls: 'ghost', onclick: history }), btn('내보내기', { ic: 'import', cls: 'ghost', onclick: exportAll }), btn('가져오기', { ic: 'upload', cls: 'ghost', onclick: importAll }))));
}

function castPage(reopen) {
  const chat = cur().chat, key = Illust.visualKey(chat), names = { account: '전체', character: '현재 캐릭터', chat: '현재 대화' };
  const choices = [['account', '전체 (모든 대화의 기본값)'], ...(key ? [['character', `현재 캐릭터 · ${S.get('chars', key)?.name || ''}`]] : []), ...(chat ? [['chat', '현재 대화']] : [])];
  if (!choices.some(([w]) => w === castScope)) castScope = Illust.visualScope(chat);
  const scope = castScope, v = clone(Illust.visual(chat, scope)), state = h('span.sb-state', '자동 저장'), list = h('div.col.sb-chars'), history = []; let drafts = v.library || [];
  const value = () => ({ world: v.world || '', direction: v.direction || '', playerMode: v.playerMode || 'auto', library: clone(drafts) });
  const commit = async () => {
    try {
      if (drafts.length > 100) throw new Error('인물은 최대 100명이에요.');
      if (drafts.some(x => !x.name?.trim())) throw new Error('인물 이름을 적어 주세요.');
      if (new Set(drafts.map(x => x.name.trim())).size !== drafts.length) throw new Error('인물 이름이 겹쳐요.');
      if (drafts.some(x => (x.profiles || []).some(p => !p.name?.trim()))) throw new Error('외형 프로필 이름을 적어 주세요.');
      await Illust.saveVisual(chat, scope, value()); state.textContent = '자동 저장'; state.classList.remove('bad'); refreshScope();
    } catch (e) { state.textContent = '저장 안 됨 · ' + e.message; state.classList.add('bad'); }
  };
  const later = debounce(commit, 400);
  const remember = () => { history.push(clone(drafts)); if (history.length > 20) history.shift(); undo.disabled = false; };
  const undo = btn('되돌리기', { ic: 'left', cls: 'ghost', onclick: () => { if (!history.length) return; drafts = history.pop(); render(); commit(); } });
  const render = () => {
    undo.disabled = !history.length;
    put(list, ...drafts.map((item, i) => {
      item.profiles ||= [];
      const title = h('span', item.name || '새 인물'), badge = h('em.badge', { hidden: !item.player }, '내 캐릭터');
      const profiles = h('details.sb-fold', h('summary', `다른 외형 프로필 · ${item.profiles.length}개`), item.profiles.map((p, pi) => h('div.sb-profile', text(p, 'name', '프로필 이름', '예: 드레스 차림', later), area(p, 'condition', '이 외형을 쓰는 조건', 2, '예: 무도회 장면에서', later), area(p, 'appearance', '이 외형의 고정 특징 (비우면 기본 외형)', 2, '', later), area(p, 'outfit', '이 외형의 기본 복장', 2, '', later),
        h('div.row.end', btn('외형 삭제', { ic: 'trash', cls: 'ghost', onclick: async () => { if (!(await confirmBox(`“${p.name || '이 외형'}”을 지울까요?`, '지우기', true))) return; remember(); item.profiles.splice(pi, 1); render(); commit(); } })))),
        btn('외형 추가', { ic: 'plus', cls: 'ghost', onclick: () => { if (item.profiles.length >= 10) return toast('외형 프로필은 최대 10개예요'); remember(); item.profiles.push({ id: uid(), name: '새 외형', condition: '', appearance: '', outfit: '' }); render(); commit(); } }));
      const swap = d => { remember(); [drafts[i + d], drafts[i]] = [drafts[i], drafts[i + d]]; render(); commit(); };
      const up = iconBtn('up', '위로', () => swap(-1), 'tiny'), down = iconBtn('down', '아래로', () => swap(1), 'tiny'); up.disabled = i === 0; down.disabled = i === drafts.length - 1;
      return h('details.sb-char', { open: drafts.length === 1 || !item.name }, h('summary', h('span.sb-char-no', String(i + 1).padStart(2, '0')), title, badge, h('small', [item.appearance, item.outfit].filter(Boolean).join(' · ').slice(0, 80))),
        h('div.col', text(item, 'name', '이름', '이야기에 나오는 이름 그대로', () => { title.textContent = item.name || '새 인물'; later(); }), area(item, 'appearance', '고정 외형', 3, 'long silver hair, amber eyes, slender build …', later, '그림에 이 인물이 나오면 그대로 붙습니다.'), area(item, 'outfit', '기본 복장', 2, 'white blouse, navy pleated skirt …', later, '장면에서 옷이 바뀌면 그 장면의 옷이 우선합니다.'), area(item, 'negative', '이 인물에서 피할 것', 2, '', later),
          chk('내 캐릭터 (플레이어)', item.player, val => { item.player = val; badge.hidden = !val; commit(); }), profiles,
          h('div.row.end', up, down, btn('인물 삭제', { ic: 'trash', cls: 'ghost', onclick: async () => { if (!(await confirmBox(`“${item.name || '이 인물'}”을 인물 목록에서 지울까요? 이 탭을 떠나기 전에는 되돌리기로 살릴 수 있어요.`, '지우기', true))) return; remember(); drafts.splice(i, 1); render(); commit(); } }))));
    }), !drafts.length && empty('등록한 인물이 없어요. 캐릭터 · 페르소나 편집기의 에셋 탭에 적어 둔 외형은 등록하지 않아도 자동으로 쓰입니다.'));
  };
  const add = base => { remember(); drafts.push({ id: uid(), name: '', appearance: '', outfit: '', negative: '', player: false, profiles: [], ...base }); render(); if (base?.name) commit(); };
  const fromCards = e => { const cards = chat ? [...chat.charIds.map(id => S.get('chars', id)), S.persona(chat)].filter(Boolean) : [...S.chars]; if (!cards.length) return toast('가져올 캐릭터가 없어요');
    menu(e.currentTarget, cards.slice(0, 40).map(p => ({ label: p.name, ic: 'user', onclick: () => { if (drafts.some(x => x.name === p.name)) return toast('이미 같은 이름의 인물이 있어요'); add({ id: p.id, name: p.name, appearance: p.visual?.appearance || '', outfit: p.visual?.outfit || '', negative: p.visual?.negative || '', player: !!chat && p === S.persona(chat) }); if (!p.visual?.appearance) toast('이 캐릭터에는 적어 둔 외형이 없어요. 고정 외형을 영어 태그나 문장으로 적어 주세요.'); } }))); };
  const copyMenu = e => menu(e.currentTarget, choices.filter(([w]) => w !== scope).map(([w]) => ({ label: `${names[w]}(으)로 복사`, ic: 'copy', onclick: guard(async () => {
    if (w !== 'account' && Illust.hasVisual(chat, w) && !(await confirmBox(`${names[w]}의 기존 인물 · 세계관 설정을 지금 편집 내용으로 바꿀까요?`, '복사'))) return;
    if (w === 'account' && !(await confirmBox('전체 기본값의 인물 · 세계관 설정을 지금 편집 내용으로 바꿀까요?', '복사'))) return;
    await Illust.saveVisual(chat, w, value()); castScope = w; reopen(); toast(`${names[w]}(으)로 복사했어요`, 'ok'); }) })));
  const scopeHelp = h('p.hint'), reset = btn(scope === 'chat' && Illust.hasVisual(chat, 'character') ? '캐릭터 설정 사용' : '전체 설정 사용', { cls: 'ghost', onclick: guard(async () => { if (!(await confirmBox('이 범위에 저장한 인물 · 세계관 설정을 해제하고 윗 범위의 설정을 쓸까요?', '해제'))) return; await Illust.resetVisual(chat, scope); reopen(); }) });
  const refreshScope = () => { reset.disabled = !Illust.hasVisual(chat, scope);
    scopeHelp.textContent = `${scope === 'character' ? '같은 캐릭터의 모든 대화에 저장합니다.' : scope === 'chat' ? '이 대화에만 저장합니다.' : '모든 캐릭터 · 대화의 기본값입니다.'} 적용 순서: 대화 → 캐릭터 → 전체. 지금 적용 중: ${names[Illust.visualScope(chat)]}.${chat && !key ? ' 캐릭터 범위는 1:1 대화에서 설정합니다.' : ''}${!chat ? ' 대화를 열면 캐릭터 · 대화 범위도 고를 수 있어요.' : ''}`; };
  render(); refreshScope();
  return h('div.sb-cast-page',
    h('div.sb-wf-row', fld('저장 범위', sel(choices, scope, w => { castScope = w; reopen(); })), h('div.row.wrap', btn('인물 추가', { ic: 'plus', onclick: () => add() }), btn('캐릭터에서 가져오기', { ic: 'users', cls: 'ghost', onclick: fromCards }), undo, choices.length > 1 ? iconBtn('copy', '다른 범위로 복사', copyMenu) : null, iconBtn('refresh', '다시 불러오기', reopen))),
    scopeHelp,
    group('세계관 · 연출', area(v, 'world', '세계 · 배경 메모', 3, '근미래 서울, 비가 잦은 도시 …', later, '시대 · 건축 · 문화권의 기본값입니다. 본문에 적힌 사실이 우선합니다.'), area(v, 'direction', '연출 방향 (계획을 세우는 모델에게 전하는 말)', 2, '인물 표정이 잘 보이는 구도 위주로 …', later),
      fld('내 캐릭터 그리기', sel([['auto', '답변에 등장할 때만'], ['always', '함께 있으면 항상'], ['never', '그리지 않기 (화면 밖 · 1인칭)']], v.playerMode === 'pov' ? 'never' : v.playerMode === 'visible' ? 'always' : v.playerMode, val => { v.playerMode = val; commit(); }))),
    list, h('div.sb-savebar', state, scope !== 'account' ? reset : null));
}

async function prepareReference(file) {
  if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type) || file.size > 10 * 1024 * 1024) throw new Error('10MB 이하 PNG · JPEG · WebP 이미지를 골라 주세요.');
  const bmp = await createImageBitmap(file);
  try {
    const ratio = bmp.width / bmp.height, [width, height] = ratio > 1.2 ? [1536, 1024] : ratio < 0.83 ? [1024, 1536] : [1472, 1472];
    const cv = document.createElement('canvas'); cv.width = width; cv.height = height;
    const ctx = cv.getContext('2d'); ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, width, height);
    const k = Math.min(width / bmp.width, height / bmp.height); ctx.drawImage(bmp, (width - bmp.width * k) / 2, (height - bmp.height * k) / 2, bmp.width * k, bmp.height * k);
    return { data: cv.toDataURL('image/png'), width, height };
  } finally { bmp.close(); }
}
async function refsPage(reopen) {
  const refs = (await DB.byOwner(REF_OWNER)).filter(r => r.kind === 'illust-ref').sort((a, b) => a.ts - b.ts), c = Illust.cfg(), state = h('span.sb-state', '자동 저장');
  const chosen = new Map((c.references || []).map(r => [r.id, { ...r }])), rows = new Map(refs.map(r => [r.id, { id: r.id, enabled: chosen.has(r.id), kind: 'vibe', mode: 'character', strength: 0.6, fidelity: 1, information: 1, ...(chosen.get(r.id) || {}) }]));
  const commit = () => { const references = [...rows.values()].filter(r => r.enabled).map(({ enabled, ...r }) => r); Illust.saveCfg({ references });
    try { Illust.validate(Illust.genConfig()); state.textContent = '자동 저장'; state.classList.remove('bad'); } catch (e) { state.textContent = '확인 필요 · ' + e.message; state.classList.add('bad'); } };
  const upload = guard(async () => { const [f] = await pickFiles({ accept: 'image/png,image/jpeg,image/webp' }); if (!f) return; const img = await prepareReference(f); await DB.put('assets', { id: uid(), owner: REF_OWNER, kind: 'illust-ref', name: f.name.replace(/\.[a-z0-9]+$/i, '').slice(0, 100), ...img, ts: now() }); toast('참조 이미지를 등록했어요', 'ok'); reopen(); });
  const remove = r => guard(async () => {
    if (!(await confirmBox(`“${r.name}” 참조를 지울까요? 적용 목록과 프리셋에서도 빠집니다. 이미 그린 삽화는 그대로예요.`, '지우기', true))) return;
    await DB.del('assets', r.id); Illust.cancelWaiting(j => j.config.references?.some(x => x.id === r.id));
    const now0 = Illust.cfg(); Illust.saveCfg({ references: now0.references.filter(x => x.id !== r.id), presets: now0.presets.map(p => ({ ...p, config: { ...p.config, references: (p.config.references || []).filter(x => x.id !== r.id) } })) });
    toast('참조 이미지를 지웠어요'); reopen(); });
  const slider = (row, k, label) => { const out = h('output', Number(row[k]).toFixed(2)); return fld(label, h('div.range', h('input', { type: 'range', min: 0, max: 1, step: 0.05, value: row[k], oninput: e => { row[k] = +e.target.value; out.textContent = row[k].toFixed(2); later(); } }), out), null, '.third'); };
  const later = debounce(commit, 300);
  const off = c.backend !== 'nai' || !MODELS[c.model]?.references;
  return h('div.sb-refs',
    h('p.hint', 'NovelAI V4.5 에서 쓰는 이미지 참조입니다. Vibe 는 분위기 · 그림체, Precise 는 인물 · 스타일을 새 그림에 반영합니다. V5 는 아직 지원하지 않아요.'),
    off ? h('div.sb-note', icon('image', 15), h('span', c.backend !== 'nai' ? '지금 그림 엔진에서는 참조를 쓰지 않습니다.' : '지금 고른 모델(V5)에서는 참조를 적용할 수 없어요. 생성 탭에서 V4.5 를 고르면 쓸 수 있습니다.')) : null,
    h('div.row.wrap', btn('이미지 추가', { ic: 'plus', onclick: upload }), refs.length ? btn('모두 해제', { cls: 'ghost', onclick: () => { Illust.saveCfg({ references: [] }); reopen(); } }) : null, h('span.sb-grow'), state),
    !refs.length ? empty('등록한 참조 이미지가 없어요.') : h('div.sb-ref-grid', refs.map(r => { const row = rows.get(r.id);
      const card = h(`div.sb-ref${row.enabled ? '.on' : ''}`, h('div.sb-ref-img', h('img', { src: r.data, alt: r.name, loading: 'lazy' })),
        h('div.col', h('div.row', h('b.sb-grow', r.name), iconBtn('trash', '참조 삭제', remove(r), 'tiny')), chk('이 참조 적용', row.enabled, val => { row.enabled = val; card.classList.toggle('on', val); commit(); }),
          h('div.form', fld('용도', sel([['vibe', 'Vibe · 그림체 / 분위기'], ['precise', 'Precise · 인물 / 스타일']], row.kind, val => { row.kind = val; commit(); }), null, '.half'), fld('Precise 모드', sel([['character', '인물'], ['style', '스타일'], ['character&style', '인물과 스타일']], row.mode, val => { row.mode = val; commit(); }), null, '.half'),
            slider(row, 'strength', '강도'), slider(row, 'fidelity', 'Precise 충실도'), slider(row, 'information', 'Vibe 정보량'))));
      return card; })));
}

/** 그림을 완전히 지운다 (대화 속 버전에서도 뺀다) */
async function purgeAsset(rec) {
  await Illust.remove(rec.id);
  const chatId = String(rec.owner || '').replace(/^chat:/, ''), live = cur().chat?.id === chatId, chat = S.get('chats', chatId), list = live ? cur().msgs : chat ? await S.msgs(chatId) : []; let hit = false;
  for (const m of list) for (const sw of m.swipes || []) {
    if (!sw.illust?.some(it => it.id === rec.id || it.versions?.some(v => v.id === rec.id))) continue; hit = true;
    sw.illust = sw.illust.filter(it => { Illust.slot(it); it.versions = it.versions.filter(v => v.id !== rec.id); if (!it.versions.length) return false; Illust.select(it, Math.min(it.sel, it.versions.length - 1)); return true; });
  }
  if (hit) { if (live) { await chatApi.save(); chatApi.redraw(); } else if (chat) await S.saveMsgs(chat, list); }
}
async function galleryPage(reopen) {
  const all = (await DB.all('assets')).filter(a => a.kind === 'illust' && a.data).sort((a, b) => (b.ts || 0) - (a.ts || 0)), chat = cur().chat, SIZE = 24;
  const chatName = a => { const c = S.get('chats', String(a.owner).replace(/^chat:/, '')); return c ? (c.name || c.charIds.map(id => S.get('chars', id)?.name).filter(Boolean).join(', ') || '대화') : '지워진 대화'; };
  const used = new Set((cur().msgs || []).flatMap(m => (m.swipes || []).flatMap(sw => (sw.illust || []).flatMap(it => [it.id, ...(it.versions || []).map(v => v.id)]))));
  let query = '', scope = 'all', page = 0;
  const grid = h('div.sb-gallery'), count = h('p.hint', { role: 'status' }), pageNo = h('span.hint');
  const prev = iconBtn('left', '이전 쪽', () => { page--; render(); }), next = iconBtn('right', '다음 쪽', () => { page++; render(); }), pager = h('div.sb-pager', prev, pageNo, next);
  const target = () => { const m = lastReply(); if (!m) throw new Error('그림을 넣을 답변이 있는 대화를 먼저 열어 주세요.'); return m; };
  const JOB_OFF = { failed: '실패', uncertain: '확인 필요', running: '그리는 중', waiting: '대기' };
  const openJob = j => modal({ title: j.label || '삽화', body: h('div.col', h('p', j.error || '결과가 아직 확정되지 않았어요.'), h('small.hint', [configLine(j.config), new Date(j.ts).toLocaleString('ko-KR')].filter(Boolean).join(' · '))), actions: [
    { label: '생성 기록', ic: 'note', cls: 'ghost', onclick: () => { inspect({ scene: j.scene, config: j.config, ts: j.ts }); return false; } },
    (j.state === 'failed' || j.state === 'uncertain') && cur().msgs?.includes(j.msg) && { label: '다시 요청', cls: 'primary', onclick: () => { try { j.seen = true; draw(j.msg, [j.scene], j.config, j.slot, true); reopen(); } catch (e) { toast(e.message, 'err'); return false; } } }].filter(Boolean) });
  const open = a => viewer({ title: a.title || '삽화', src: a.data, sub: [chatName(a), a.ts ? new Date(a.ts).toLocaleString('ko-KR') : '', configLine(a.config), a.seed != null ? `Seed ${a.seed}` : ''].filter(Boolean).join(' · '),
    actions: [
      { label: '지금 대화에 넣기', ic: 'plus', run: async () => { const m = target(); let rec = a; if (a.owner !== 'chat:' + cur().chat.id) { rec = { ...a, id: uid(), owner: 'chat:' + cur().chat.id, ts: now() }; await DB.put('assets', rec); } Illust.insert(m.swipes[m.sw], rec); await chatApi.save(); chatApi.redraw(); toast('마지막 답변 아래에 넣었어요', 'ok'); } },
      { label: '장면으로 열기', ic: 'sliders', run: () => compose(target(), { initial: [a.scene || { ...blankScene(), title: a.title || '', prompt: a.prompt || '' }], config: a.config ? { ...a.config, seed: -1 } : null }) },
      { label: '지우기', ic: 'trash', run: async () => { if (!(await confirmBox('이 그림을 완전히 지울까요? 대화에 붙어 있다면 거기서도 사라지고, 되돌릴 수 없어요.', '지우기', true))) return; await purgeAsset(a); toast('그림을 지웠어요'); reopen(); } }],
    more: [{ label: 'AI 검수', ic: 'search', onclick: guard(() => review(a)) }, a.review && { label: '지난 검수 보기', ic: 'eye', onclick: () => showReview(a.review) }, { label: '생성 기록', ic: 'note', onclick: () => inspect(a) }, S.get('chats', String(a.owner).replace(/^chat:/, '')) && { label: '이 대화로 가기', ic: 'chat', onclick: () => go('chat', String(a.owner).replace(/^chat:/, '')) }].filter(Boolean) });
  function render() {
    const q = query.trim().toLowerCase();
    const mine = a => !!chat && a.owner === 'chat:' + chat.id, off = scope === 'failed';
    const hits = off ? [...Illust.queue()].reverse().filter(j => JOB_OFF[j.state] && (!q || [j.label, j.scene?.prompt, ...(j.scene?.characters || []).map(x => x.name)].join(' ').toLowerCase().includes(q)))
      : all.filter(a => (scope !== 'chat' || mine(a)) && (scope !== 'loose' || (mine(a) && !used.has(a.id))) && (!q || [a.title, a.prompt, a.scene?.camera, ...(a.scene?.characters || []).map(x => x.name), chatName(a)].join(' ').toLowerCase().includes(q)));
    const pages = Math.max(1, Math.ceil(hits.length / SIZE)); page = Math.max(0, Math.min(page, pages - 1));
    count.textContent = `${hits.length}개 · ${off ? '이번 접속에서 끝내지 못한 작업' : scope === 'chat' ? '지금 대화' : scope === 'loose' ? '지금 대화에서 빠진 그림' : '모든 대화'}`;
    put(grid, ...hits.slice(page * SIZE, (page + 1) * SIZE).map(a => off
      ? h('button.sb-shot', { type: 'button', title: a.label || '삽화', 'aria-label': `${a.label || '삽화'} · 작업 확인`, onclick: () => openJob(a) }, h(`i.sb-shot-off.${a.state}`, JOB_OFF[a.state]), h('span', a.label || '삽화'), h('small', a.error || configLine(a.config)))
      : h('button.sb-shot', { type: 'button', title: a.title || '삽화', 'aria-label': `${a.title || '삽화'} · 그림 보기`, onclick: () => open(a) }, h('img', { src: a.data, alt: '', loading: 'lazy', decoding: 'async' }), a.review ? h('em.sb-shot-mark', { title: '검수 의견 있음' }, '검수') : null, h('span', a.title || '삽화'), h('small', chatName(a)))),
      !hits.length && empty(off ? (q ? '찾는 작업이 없어요.' : '끝내지 못한 작업이 없어요.') : q ? '찾는 그림이 없어요.' : '아직 그린 삽화가 없어요.'));
    prev.disabled = page === 0; next.disabled = page >= pages - 1; pageNo.textContent = `${page + 1} / ${pages}`; pager.hidden = pages < 2;
  }
  render();
  return h('div.sb-gallery-page',
    h('div.sb-gallery-bar', h('input.inp', { type: 'search', placeholder: '제목 · 프롬프트 · 인물 · 대화 이름으로 찾기', 'aria-label': '갤러리 검색', oninput: e => { query = e.target.value; page = 0; render(); } }),
      sel([['all', '모든 삽화'], ...(chat ? [['chat', '지금 대화'], ['loose', '대화에서 빠진 그림']] : []), ['failed', '미완료']], scope, val => { scope = val; page = 0; render(); }),
      iconBtn('more', '더 보기', e => menu(e.currentTarget, [{ label: '새로 고침', ic: 'refresh', onclick: reopen }, { label: '지금 대화 내보내기 (HTML)', ic: 'import', onclick: exportChat }]))),
    count, grid, pager);
}

function queuePage(reopen) {
  const items = [...Illust.queue()].reverse(), labels = { waiting: '대기', running: '그리는 중', done: '완성', failed: '실패', uncertain: '확인 필요', cancelled: '취소' }, wait = Math.ceil(Illust.cooldown() / 1000);
  const stats = [['이번 접속 요청', `${Illust.usage()}`], ['대기', items.filter(x => x.state === 'waiting').length], ['완성', items.filter(x => x.state === 'done').length], ['실패', items.filter(x => x.state === 'failed' || x.state === 'uncertain').length]];
  const drafts = pendingDrafts().length;
  return h('div.sb-queue',
    h('div.mem-stats', stats.map(([l, n]) => h('div', h('b', String(n)), h('span', l)))),
    h('div.row.wrap', drafts ? btn(`초안 ${drafts}개 생성`, { ic: 'image', cls: 'primary', onclick: guard(async () => {
      if (!(await confirmBox(`그림이 없는 답변 ${drafts}개의 초안을 모두 생성 대기열에 넣을까요?`, '생성'))) return;
      const r = await generateDrafts(); toast(`${r.count}개 장면을 대기열에 넣었어요${r.left ? ` · 한도 때문에 답변 ${r.left}개의 초안은 남겨 두었습니다` : ''}`, r.count ? 'ok' : undefined); reopen(); }) }) : null,
      btn(Illust.queuePaused() ? '재개' : '일시정지', { ic: Illust.queuePaused() ? 'play' : 'stop', cls: Illust.queuePaused() ? 'primary' : '', onclick: () => Illust.toggleQueue() }), btn('대기 취소', { cls: 'ghost', onclick: () => { const n = Illust.cancelWaiting(); toast(n ? `대기 중이던 ${n}개를 취소했어요` : '대기 중인 작업이 없어요'); } }),
      btn('지시 기록', { ic: 'note', cls: 'ghost', onclick: showPlans }),
      Illust.cfg().backend === 'nai' ? btn('계정 사용량', { ic: 'user', cls: 'ghost', onclick: guard(async () => { const a = await Illust.account(); modal({ title: '계정 사용량', body: h('div.col', h('p', `구독 ${a.active ? '활성' : '비활성'} · 등급 ${a.tier != null ? (TIERS[a.tier] || a.tier) : '확인 불가'}`), h('p', `남은 Anlas ${a.anlas != null ? a.anlas.toLocaleString() : '확인 불가'}`)) }); }) }) : null,
      iconBtn('refresh', '새로 고침', reopen)),
    h('p.hint', `${Illust.queuePaused() ? '일시정지 중입니다. 재개하면 다음 요청부터 이어집니다. ' : ''}${wait ? `NovelAI 요청 제한으로 ${wait}초 기다리는 중입니다. ` : ''}이미 보낸 요청은 취소되지 않고, 실패한 유료 요청은 자동으로 다시 보내지 않습니다.`),
    !items.length ? empty('진행 중인 작업이 없어요.') : h('div.col', items.map(j => h(`div.sb-job.${j.state}`, h('span.sb-job-state', labels[j.state] || j.state), h('div.col', h('b', j.label || '삽화'), h('small', [configLine(j.config), j.automatic ? '자동' : '직접', j.slot ? '다시 그리기' : '', new Date(j.ts).toLocaleTimeString('ko-KR')].filter(Boolean).join(' · ')), j.error && h('small.err', j.error)),
      j.state === 'waiting' ? iconBtn('x', '이 작업 취소', () => { Illust.cancelWaiting(x => x === j); }, 'tiny') : null,
      (j.state === 'failed' || j.state === 'uncertain' || j.state === 'cancelled') && cur().msgs?.includes(j.msg) ? btn('다시 요청', { cls: 'ghost', onclick: guard(() => { j.seen = true; draw(j.msg, [j.scene], j.config, j.slot, true); }) }) : null,
      j.state === 'done' && cur().msgs?.includes(j.msg) ? btn('보기', { cls: 'ghost', onclick: () => { go('chat', j.chat.id); setTimeout(() => chatApi.scrollTo(j.msg.id), 400); } }) : null))));
}

const PAGES = { gen: genPage, cast: castPage, refs: refsPage, gallery: galleryPage, queue: queuePage };
const TABS = [['gen', '생성', 'sliders'], ['cast', '인물', 'user'], ['refs', '참조', 'image'], ['gallery', '갤러리', 'folder'], ['queue', '작업', 'menu']];
function studio() {
  const head = h('div.sb-head'), nav = h('div.tabs.sb-tabs', { role: 'tablist', 'aria-label': '삽화 설정' }), page = h('div.sb-page'), root = h('div.card.sb-studio', head, nav, page); let ticket = 0, seen = false;
  const open = async id => {
    studioTab = id; const t = ++ticket;
    put(nav, ...TABS.map(([k, l, ic]) => h(`button.tab${k === id ? '.on' : ''}`, { type: 'button', role: 'tab', onclick: () => open(k) }, icon(ic, 15), l, k === 'queue' && Illust.queue().some(x => x.state === 'waiting' || x.state === 'running') ? h('em.badge.on', String(Illust.queue().filter(x => x.state === 'waiting' || x.state === 'running').length)) : null)));
    let node; try { node = await PAGES[id](() => open(id)); } catch (e) { console.error(e); node = h('p.err', e.message); }
    if (t === ticket) put(page, node);
  };
  const drawHead = () => put(head, connBar(), workflow(drawHead),
    h('div.row.wrap.sb-quick', btn('장면 편집', { ic: 'edit', onclick: guard(() => compose()) }), btn('이미지 읽기', { ic: 'image', onclick: () => imageImport(() => { drawHead(); open('gen'); }) }), btn('지시 기록', { ic: 'note', cls: 'ghost', onclick: showPlans })));
  const offJobs = on('illust:jobs', () => { if (root.isConnected) seen = true; else { if (seen) offJobs(); return; } const st = head.querySelector('.sb-wf-status'); if (st) st.textContent = statusText(); if (studioTab === 'queue') open('queue'); });
  const offSet = on('settings', p => { if (root.isConnected) seen = true; else { if (seen) offSet(); return; } if (p?.illust && !head.contains(document.activeElement)) drawHead(); });
  drawHead(); open(PAGES[studioTab] ? studioTab : 'gen');
  return root;
}
function openStudio(tab) { if (tab && PAGES[tab]) studioTab = tab; const node = studio(); node.classList.remove('card'); modal({ title: '삽화', wide: true, body: node }).el.querySelector('.modal')?.classList.add('sb-editor'); }

// ════════ 등록 ════════
X.studio.push({ owner: 'scenebook', title: '삽화', render: studio });
X.actions.push(
  { owner: 'scenebook', id: 'sb-draw', label: '삽화 자동 그리기', icon: 'image', run: guard(async m => { if (m.role !== 'assistant') throw new Error('캐릭터의 답변에서 써 주세요.'); await quickDraw(m); }) },
  { owner: 'scenebook', id: 'sb-analyze', label: '장면 분석', icon: 'sparkle', run: guard(m => compose(m, { manual: false })) },
  { owner: 'scenebook', id: 'sb-compose', label: '장면 편집', icon: 'sliders', run: guard(m => compose(m)) });
X.composer.push({ owner: 'scenebook', id: 'sb-studio', label: '삽화 스튜디오', icon: 'image', run: () => openStudio() });
for (const name of ['/scenebook', '/삽화']) X.commands.set(name, { owner: 'scenebook', help: '삽화 스튜디오를 엽니다. (/삽화 갤러리 · 작업 · 인물 · 참조 · 생성)', run: arg => openStudio({ 갤러리: 'gallery', 작업: 'queue', 인물: 'cast', 참조: 'refs', 생성: 'gen', gallery: 'gallery', queue: 'queue' }[String(arg || '').trim()]) });

let panelBox = null;
function drawPanel() {
  if (!panelBox?.isConnected && !panelBox?.dataset.fresh) return; delete panelBox.dataset.fresh;
  const c = Illust.cfg(), q = Illust.queue(), { msgs } = cur(), n = (msgs || []).reduce((a, m) => a + (m.swipes?.[m.sw]?.illust?.filter(it => !it.hidden).length || 0), 0);
  const mode = { off: '꺼짐', review: '초안만', generate: '자동 생성' }[c.automatic];
  put(panelBox, 
    h('div.mem-stats', [['이 대화의 삽화', n], ['대기', q.filter(x => x.state === 'waiting').length], ['이번 접속', `${Illust.usage()}`], ['자동 처리', mode]].map(([l, v]) => h('div', h('b', String(v)), h('span', l)))),
    queueText() || flowNote ? h('small.hint', queueText() || flowNote) : null,
    h('div.row.wrap', btn('스튜디오', { ic: 'image', cls: 'ghost', onclick: () => openStudio() }), btn('장면 편집', { ic: 'edit', cls: 'ghost', onclick: guard(() => compose()) }), btn('갤러리', { ic: 'folder', cls: 'ghost', onclick: () => openStudio('gallery') }),
      q.some(x => x.state === 'waiting' || x.state === 'running') || Illust.queuePaused() ? btn(Illust.queuePaused() ? '재개' : '일시정지', { ic: Illust.queuePaused() ? 'play' : 'stop', cls: 'ghost', onclick: () => Illust.toggleQueue() }) : null));
}
X.panels.push({ owner: 'scenebook', id: 'scenebook', title: '삽화', icon: 'image', render: () => { panelBox = h('div.col.sb-panel', { dataset: { fresh: '1' } }); drawPanel(); return panelBox; } });

// ════════ 이벤트 ════════
on('illust:jobs', () => { schedule(); if (panelBox?.isConnected) drawPanel(); });
on('illust:draft', schedule);
on('chat:open', () => { Illust.cfg(); schedule(); });
Frames.load().then(() => { const f = Illust.cfg(); if ([f.frame, f.frameWide].some(x => String(x || '').startsWith('image:')) && cur().chat && document.querySelector('.illusts[data-sb]')) chatApi.redraw(); });   // 가져온 액자 그림은 읽은 뒤에 씌운다
let lookSig = '';
on('settings', p => {   // 표시 설정이 바뀌면 열려 있는 대화의 삽화를 다시 그린다
  if (!p?.illust) return; const c = Illust.cfg(), sig = [c.placement, c.displayWidth, c.compact, c.frame, c.frameWide, c.frameInk, Frames.list().length].join('|'), changed = lookSig && sig !== lookSig; lookSig = sig;
  if (changed && cur().chat && document.querySelector('.illusts[data-sb]')) chatApi.redraw();
});
on('message:received', ({ msg }) => {
  const plan = Illust.takePlan(), c = Illust.cfg(), sw = msg?.swipes?.[msg.sw];
  if (plan && sw && (plan.found || (plan.asked && c.auto))) {
    const queued = Illust.queue().some(j => j.sw === sw && j.state !== 'cancelled');
    sw.illustPlan = !plan.found ? { status: 'missing', error: 'AI 답변에 삽화 지시가 없어 그림을 만들지 않았어요.', ts: now() }
      : plan.error ? { status: 'failed', raw: plan.raw, error: plan.error, ts: now() }
        : { status: queued ? 'queued' : sw.illustDraft?.length ? 'ready' : 'failed', raw: plan.raw, repairs: plan.repairs, warnings: plan.warnings, ts: now() };
    if (sw.illustPlan.status === 'missing' || plan.error) toast(sw.illustPlan.error + ' 답변 아래에서 장면 분석을 누르거나 지시 기록을 확인해 주세요.');
    else if (sw.illustPlan.status === 'ready') toast(`장면 ${sw.illustDraft.length}개를 초안으로 저장했어요 · 답변 아래에서 확인`);
    flowNote = sw.illustPlan.error || { queued: '삽화 지시를 읽어 그리기를 요청했어요', ready: `장면 ${sw.illustDraft?.length || 0}개 준비됨 · 답변 아래에서 확인` }[sw.illustPlan.status] || flowNote;
    chatApi.save();
  }
  schedule();
});
new MutationObserver(schedule).observe(document.getElementById('page') || document.body, { childList: true, subtree: true });
