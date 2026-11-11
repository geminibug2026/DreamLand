// ── Dreamland 정규식 화면 ── 범위 셋(전역 · 프리셋 · 캐릭터) · 일괄 조작 · 가져오기/내보내기 · 시험 창 · 파이프라인 디버거
// 실행 규칙은 js/engine.js (applyRegex 와 그 이웃), 진단 문구는 js/regex-lint.js, 실리태번 형식 변환은 js/cards.js 가 맡는다.
import { S, h, uid, on, download, pickFiles, debounce, newRegex, arr, msgText } from './core.js';
import { compileRegex, regexAllowed, regexScripts, regexSkip, regexFind, regexEnv, regexStep, runRegexScript } from './engine.js';
import { icon, btn, iconBtn, toast, modal, menu, confirmBox, promptBox, registerPage, go, route, pageHead, avatar, dragSort } from './ui.js';
import { X } from './hooks.js';
import { chatApi } from './chat.js';
import { regexToSt, regexFromJson, scopedRegex, presetToSt, stPresetWithRegex } from './cards.js';
import { lintScript, whyNoMatch, SKIP_TEXT, skipDetail, diffParts, hitParts, tally } from './regex-lint.js';

if (typeof document !== 'undefined' && !document.querySelector('link[href="css/regex.css"]')) document.head.append(h('link', { rel: 'stylesheet', href: 'css/regex.css' }));

// ════════ 범위 ════════
// sc = { kind: 'global' } | { kind: 'preset', id } | { kind: 'char', id }
const G = { kind: 'global' };
const isGlobal = r => !r.scope || r.scope === 'global';
const byOrder = list => list.map((r, i) => [r, i]).sort((a, b) => (+a[0].order || 0) - (+b[0].order || 0) || a[1] - b[1]).map(x => x[0]);
const scKey = sc => (sc.kind === 'global' ? 'global' : `${sc.kind}:${sc.id}`);
const scShort = sc => ({ global: '전역', preset: '프리셋', char: '캐릭터' }[sc.kind]);
const scOwner = sc => (sc.kind === 'preset' ? S.get('presets', sc.id)?.name || '없어진 프리셋' : sc.kind === 'char' ? S.get('chars', sc.id)?.name || '없어진 캐릭터' : '');
const scName = sc => (sc.kind === 'global' ? '전역' : `${scShort(sc)} · ${scOwner(sc)}`);
const Scope = {
  list(sc) { return sc.kind === 'global' ? byOrder(S.regex.filter(isGlobal)) : sc.kind === 'char' ? scopedRegex(sc.id) : arr(S.get('presets', sc.id)?.regex).filter(r => r && typeof r === 'object'); },
  async save(sc, r) { if (sc.kind === 'preset') { const p = S.get('presets', sc.id); if (p) await S.save('presets', p, true); } else await S.save('regex', r, true); },
  /** 목록을 이 순서로 굳힌다 */
  async reorder(sc, list) {
    if (sc.kind === 'preset') { const p = S.get('presets', sc.id); if (!p) return; list.forEach((r, i) => { r.order = i; }); p.regex = list; await S.save('presets', p, true); return; }
    for (let i = 0; i < list.length; i++) if (list[i].order !== i) { list[i].order = i; await S.save('regex', list[i], true); }
  },
  async add(sc, r) {
    const list = this.list(sc);
    r.scope = sc.kind === 'global' ? 'global' : sc.kind === 'char' ? sc.id : 'preset';
    r.order = list.reduce((m, x) => Math.max(m, +x.order || 0), -1) + 1;
    if (sc.kind === 'preset') {
      const p = S.get('presets', sc.id); if (!p) throw new Error('프리셋을 찾지 못했어요');
      if (list.some(x => x.id === r.id)) r.id = uid();
      p.regex = [...list, r]; await S.save('presets', p, true);
    } else { const hit = S.get('regex', r.id); if (hit && hit !== r) r.id = uid(); await S.save('regex', r, true); }
    return r;
  },
  async remove(sc, r) {
    if (sc.kind === 'preset') { const p = S.get('presets', sc.id); if (!p) return; p.regex = arr(p.regex).filter(x => x !== r); await S.save('presets', p, true); }
    else await S.remove('regex', r.id);
  },
};
/** 모든 범위의 스크립트 [{ r, sc }] — 전역, 프리셋들, 캐릭터들 순 */
function everything() {
  const out = Scope.list(G).map(r => ({ r, sc: G }));
  for (const p of S.presets) { const sc = { kind: 'preset', id: p.id }; for (const r of Scope.list(sc)) out.push({ r, sc }); }
  for (const id of [...new Set(S.regex.filter(r => !isGlobal(r)).map(r => r.scope))]) { const sc = { kind: 'char', id }; for (const r of Scope.list(sc)) out.push({ r, sc }); }
  return out;
}
const allowState = sc => S.settings.regexAllow?.[sc.kind === 'char' ? 'chars' : 'presets']?.[sc.id];
const isAllowed = sc => sc.kind === 'global' || regexAllowed(sc.kind === 'char' ? 'chars' : 'presets', sc.id);
function setAllow(sc, v) {
  if (sc.kind === 'global') return;
  const a = S.settings.regexAllow || {}, k = sc.kind === 'char' ? 'chars' : 'presets';
  S.set({ regexAllow: { ...a, [k]: { ...(a[k] || {}), [sc.id]: v } } });
}
/** 스크립트를 다른 범위로 옮긴다. 옮겨 간 범위는 바로 쓸 수 있게 허용해 둔다 (직접 옮긴 것이니 다시 묻지 않는다) */
async function moveScripts(items, to) {
  let n = 0;
  for (const { r, sc } of items) {
    if (scKey(sc) === scKey(to)) continue;
    await Scope.remove(sc, r);
    await Scope.add(to, r); n++;
  }
  if (n && !isAllowed(to)) setAllow(to, true);
  return n;
}
const redrawChat = () => { try { if (route.page === 'chat' && !chatApi.current().busy) chatApi.redraw(); } catch { } };

// ════════ 표시용 짧은 글 ════════
const WHO = [['onUser', '내 입력', '입력', 'user'], ['onAI', 'AI 응답', '응답', 'ai'], ['onSlash', '명령어로 넣은 글', '명령', 'slash'], ['onLore', '로어북 내용', '로어', 'lore'], ['onReason', '생각 과정', '생각', 'reason']];
const MODES = [['display', '화면에 보일 때만', '화면'], ['prompt', 'AI 에게 보낼 때만', '전송'], ['both', '화면 + 전송 (원문은 그대로)', '화면+전송'], ['store', '원문을 바꿔 저장', '원문']];
const whoShort = r => WHO.filter(w => r[w[0]]).map(w => w[2]).join('·') || '대상 없음';
const modeShort = r => MODES.find(m => m[0] === r.mode)?.[2] || '화면';
const clip = (s, n = 70) => { s = String(s ?? '').replace(/\s+/g, ' '); return s.length > n ? s.slice(0, n) + '…' : s; };
const safeName = s => String(s || 'regex').replace(/[\s.<>:"/\\|?*\x00-\x1F\x7F]/g, '_').toLowerCase();
const lintCache = new Map();
function lintOf(r) {
  const key = JSON.stringify([r.find, r.replace, r.trim, r.onUser, r.onAI, r.onSlash, r.onLore, r.onReason, r.mode, r.subst, r.minDepth, r.maxDepth, r.runOnEdit]);
  let v = lintCache.get(key);
  if (!v) { if (lintCache.size > 3000) lintCache.clear(); v = lintScript(r); lintCache.set(key, v); }
  return v;
}
const worst = r => { const is = lintOf(r).issues; return is.some(x => x.level === 'error') ? 'error' : is.some(x => x.level === 'warn') ? 'warn' : ''; };
const switchEl = (checked, onchange, title, tag = 'label') => h(`${tag}.switch`, { title, onclick: e => e.stopPropagation() }, h('input', { type: 'checkbox', checked: !!checked, 'aria-label': title, onchange: e => onchange(e.target.checked) }), h('i'));

// ════════ 멈춤 방지: 정규식을 따로 떨어진 작업자에서 먼저 돌려 본다 ════════
const PROBE = 'onmessage = e => { const d = e.data; try { const re = new RegExp(d.source, d.flags); let n = 0; d.text.replace(re, () => { n++; return ""; }); postMessage({ id: d.id, ok: true, n }); } catch (err) { postMessage({ id: d.id, ok: true, n: 0 }); } };';
let worker = null, probeSeq = 0, probeQueue = Promise.resolve();
function probeOnce(source, flags, text, ms) {
  return new Promise(res => {
    if (typeof Worker === 'undefined') return res({ ok: true, unguarded: true });
    try { worker ||= new Worker(URL.createObjectURL(new Blob([PROBE], { type: 'text/javascript' }))); } catch { return res({ ok: true, unguarded: true }); }
    const id = ++probeSeq, w = worker;
    const done = v => { clearTimeout(timer); w.removeEventListener('message', onMsg); w.removeEventListener('error', onErr); res(v); };
    const onMsg = e => { if (e.data?.id === id) done({ ok: true }); };
    const onErr = () => { worker = null; done({ ok: true, unguarded: true }); };
    const timer = setTimeout(() => { try { w.terminate(); } catch { } if (worker === w) worker = null; done({ ok: false, hang: true }); }, ms);
    w.addEventListener('message', onMsg); w.addEventListener('error', onErr);
    w.postMessage({ id, source, flags, text });
  });
}
/** 이 정규식이 이 글에서 제때 끝나는가. 끝나지 않으면 { ok: false, hang: true } — 화면이 얼지 않게 본 실행 전에 확인한다 */
const probe = (source, flags, text, ms = 1500) => (probeQueue = probeQueue.then(() => probeOnce(source, flags, text, ms)));

// ════════ 글 조각 그리기 ════════
const MAX_SHOW = 40000;
function diffEl(text, matches) {
  const el = h('pre.rx-text'); let used = 0;
  for (const p of diffParts(text, matches)) {
    if (used > MAX_SHOW) { el.append(h('span.rx-more', ` … 뒤 ${(text.length - used).toLocaleString()}자는 줄였어요`)); break; }
    if (p.t !== undefined) { el.append(p.t); used += p.t.length; continue; }
    if (p.del) el.append(h('del', p.del));
    if (p.ins) el.append(h('ins', p.ins));
    if (!p.del && !p.ins) el.append(h('ins.rx-nil', '∅'));
    used += p.del.length + p.ins.length;
  }
  return el;
}
function hitsEl(text, matches) {
  const el = h('pre.rx-text'); let used = 0;
  for (const p of hitParts(text, matches)) {
    if (used > MAX_SHOW) { el.append(h('span.rx-more', ` … 뒤 ${(text.length - used).toLocaleString()}자는 줄였어요`)); break; }
    el.append(p.hit ? h('mark', { title: `${p.i + 1}번째로 찾은 곳` }, p.t || '∅') : p.t); used += p.t.length;
  }
  return el;
}
const plainEl = text => h('pre.rx-text', text.length > MAX_SHOW ? text.slice(0, MAX_SHOW) + ` … 뒤 ${(text.length - MAX_SHOW).toLocaleString()}자는 줄였어요` : text);
const issuesEl = issues => h('ul.rx-issues', issues.map(x => h(`li.${x.level}`, h('i', { 'aria-hidden': 'true' }, x.level === 'error' ? '오류' : x.level === 'warn' ? '주의' : '참고'), h('span', x.msg))));
function sheet(opts) { const m = modal({ wide: true, ...opts }); m.el.classList.add('rx-sheet'); return m; }
/** 매크로 문맥: 지금 열려 있는 대화(없으면 가장 최근 대화) 기준 */
function ctxOf(chat) { try { return chat ? regexEnv({ chat }).ctx : null; } catch { return null; } }
const lastChat = () => chatApi.current().chat || [...S.chats].sort((a, b) => b.updatedAt - a.updatedAt)[0] || null;
const chatLabel = c => { try { return `${chatApi.groupTitle(c)} · ${chatApi.roomName(c)}`; } catch { return c.name || '대화'; } };

// ════════ 고르는 창 ════════
function pickOne({ title, items, empty = '고를 것이 없어요.', ph = '이름으로 찾기' }) {
  return new Promise(res => {
    let q = '', done = false, box;
    const list = h('div.picker-list');
    const draw = () => {
      const t = q.trim().toLowerCase(), rows = items.filter(it => !t || (it.title + ' ' + (it.sub || '')).toLowerCase().includes(t));
      list.replaceChildren(...rows.slice(0, 200).map(it => h('button.picker-row', { type: 'button', onclick: () => { done = true; box.close(); res(it.id); } },
        it.av ? avatar(it.av, 'sm') : h('span.rx-pick-ic', icon(it.ic || 'note', 16)), h('div.picker-text', h('b', it.title), h('small', it.sub || ' ')))),
      !rows.length && h('p.dim.pad', items.length ? '찾는 것이 없어요.' : empty), rows.length > 200 && h('p.dim.pad', '검색어를 넣어 좁혀 주세요.'));
    };
    box = modal({ title, body: h('div.col', items.length > 8 ? h('input.inp.search', { placeholder: ph, oninput: e => { q = e.target.value; draw(); } }) : null, list), onClose: () => { if (!done) res(null); } });
    draw();
  });
}
const pickPreset = (title = '프리셋 고르기') => pickOne({ title, items: S.presets.map(p => ({ id: p.id, ic: 'sliders', title: p.name, sub: `정규식 ${arr(p.regex).length}개${p.id === S.settings.activePreset ? ' · 사용 중' : ''}` })) });
const pickChar = (title = '캐릭터 고르기') => pickOne({ title, ph: '이름으로 찾기', empty: '아직 캐릭터가 없어요.', items: S.chars.map(c => ({ c, n: scopedRegex(c.id).length })).sort((a, b) => (b.n > 0) - (a.n > 0) || a.c.name.localeCompare(b.c.name, 'ko')).map(({ c, n }) => ({ id: c.id, av: c, title: c.name, sub: `정규식 ${n}개` })) });
/** 옮길 곳을 고른다 → sc (고르지 않으면 돌아오지 않는다) */
function pickTarget(anchor, except) {
  return new Promise(res => menu(anchor, [
    (!except || except.kind !== 'global') && { label: '전역으로', ic: 'moon', onclick: () => res(G) },
    { label: '프리셋으로…', ic: 'sliders', onclick: async () => { const id = await pickPreset('어느 프리셋으로 옮길까요?'); res(id ? { kind: 'preset', id } : null); } },
    { label: '캐릭터로…', ic: 'user', onclick: async () => { const id = await pickChar('어느 캐릭터로 옮길까요?'); res(id ? { kind: 'char', id } : null); } },
  ]));
}

// ════════ 가져오기 · 내보내기 ════════
const exportOne = r => download(`regex-${safeName(r.name)}.json`, JSON.stringify(regexToSt(r), null, 4));
const exportMany = list => download(`regex-${new Date().toISOString().replace(/[:.]/g, '-')}.json`, JSON.stringify(list.map(regexToSt), null, 4));
async function importFlow(defaultSc, after) {
  const files = await pickFiles({ accept: '.json,application/json', multiple: true }); if (!files.length) return;
  const found = [], bad = [];
  for (const f of files) { try { const got = regexFromJson(JSON.parse(await f.text())); if (got.length) found.push(...got); else bad.push(f.name); } catch { bad.push(f.name); } }
  if (!found.length) return toast(`정규식을 찾지 못했어요${bad.length ? ` (${bad.slice(0, 3).join(', ')})` : ''}. 실리태번 정규식 JSON(낱개 · 묶음)이나 정규식이 실린 프리셋 · 캐릭터 카드 JSON 을 골라 주세요.`, 'err');
  let to = defaultSc || G, box;
  const where = h('div.rx-target'), names = h('div.rx-import-list', found.slice(0, 60).map(r => h('div', h('b', r.name), h('code', clip(r.find, 60)))), found.length > 60 && h('p.dim', `… 그리고 ${found.length - 60}개 더`));
  const draw = () => where.replaceChildren(
    h(`button.chip${to.kind === 'global' ? '.on' : ''}`, { type: 'button', onclick: () => { to = G; draw(); } }, '전역'),
    h(`button.chip${to.kind === 'preset' ? '.on' : ''}`, { type: 'button', onclick: async () => { const id = await pickPreset('어느 프리셋에 넣을까요?'); if (id) { to = { kind: 'preset', id }; draw(); } } }, to.kind === 'preset' ? `프리셋 · ${scOwner(to)}` : '프리셋…'),
    h(`button.chip${to.kind === 'char' ? '.on' : ''}`, { type: 'button', onclick: async () => { const id = await pickChar('어느 캐릭터에 넣을까요?'); if (id) { to = { kind: 'char', id }; draw(); } } }, to.kind === 'char' ? `캐릭터 · ${scOwner(to)}` : '캐릭터…'));
  draw();
  box = modal({ title: `정규식 ${found.length}개를 어디에 넣을까요?`, body: h('div.col.rx-import', where, bad.length ? h('small.hint.err', `읽지 못한 파일: ${bad.join(', ')}`) : null, names),
    actions: [{ label: '취소' }, { label: '가져오기', cls: 'primary', onclick: async () => { for (const r of found) await Scope.add(to, r); if (!isAllowed(to)) setAllow(to, true); toast(`${scName(to)}에 정규식 ${found.length}개를 넣었어요`, 'ok'); after?.(to); } }] });
  return box;
}

// ════════ 켜짐 묶음 (어떤 스크립트를 켤지 저장해 두고 한 번에 바꾸기) ════════
const sets = () => arr(S.settings.regexSets);
const snapshot = () => { const all = everything(); return { on: all.filter(e => e.r.enabled).map(e => e.r.id), known: all.map(e => e.r.id) }; };
async function applySet(set) {
  const on = new Set(set.on), known = new Set(set.known), presets = new Set(); let n = 0;
  for (const { r, sc } of everything()) {
    if (!known.has(r.id)) continue;
    const want = on.has(r.id); if (!!r.enabled === want) continue;
    r.enabled = want; n++;
    if (sc.kind === 'preset') presets.add(sc.id); else await S.save('regex', r, true);
  }
  for (const id of presets) { const p = S.get('presets', id); if (p) await S.save('presets', p, true); }
  S.set({ regexSet: set.id }); redrawChat();
  return n;
}
function setsDialog(after) {
  const list = h('div.rx-sets');
  const put = next => { S.set({ regexSets: next }); draw(); };
  const draw = () => list.replaceChildren(...sets().map(s => h(`div.rx-set${S.settings.regexSet === s.id ? '.on' : ''}`,
    h('div.rx-set-text', h('b', s.name), h('small', `켜짐 ${s.on.length}개 · 기억한 스크립트 ${s.known.length}개`)),
    btn('적용', { cls: 'primary', onclick: async () => { const n = await applySet(s); toast(n ? `"${s.name}" 을 적용했어요 · ${n}개 바뀜` : `이미 "${s.name}" 과 같은 상태예요`, 'ok'); draw(); after?.(); } }),
    iconBtn('more', '더 보기', e => menu(e.currentTarget, [
      { label: '지금 상태로 덮어쓰기', ic: 'refresh', onclick: () => put(sets().map(x => (x.id === s.id ? { ...x, ...snapshot() } : x))) },
      { label: '이름 바꾸기', ic: 'edit', onclick: async () => { const name = (await promptBox('묶음 이름', s.name))?.trim(); if (name) put(sets().map(x => (x.id === s.id ? { ...x, name } : x))); } },
      { label: '삭제', ic: 'trash', danger: true, onclick: () => put(sets().filter(x => x.id !== s.id)) },
    ])))),
  !sets().length && h('p.dim', '아직 저장한 묶음이 없어요. 지금 켜고 꺼 둔 상태를 이름 붙여 저장하면, 나중에 한 번에 되돌릴 수 있습니다.'));
  draw();
  modal({ title: '켜짐 묶음', body: h('div.col', list, btn('지금 상태를 새 묶음으로 저장', { ic: 'plus', onclick: async () => { const name = (await promptBox('묶음 이름', ''))?.trim(); if (!name) return; put([...sets(), { id: uid(), name, ...snapshot() }]); } }),
    h('small.hint', '묶음은 저장할 때 있던 스크립트의 켜짐 · 꺼짐만 바꿉니다. 그 뒤에 만든 스크립트는 건드리지 않아요.')) });
}

// ════════ 스크립트 편집 + 시험 창 ════════
const samples = new Map();   // 스크립트 id → 마지막 시험 입력 (이번 실행 동안)
function openEditor(r, sc, { tab = 'form', onClose } = {}) {
  let seq = 0, viewMode = 'diff', dead = false;
  if (r.subst === undefined) r.subst = String(r.find || '').includes('{{') ? 1 : 0;   // 옛 스크립트: 엔진이 보던 대로 값을 채워 보여 준다
  if (r.runOnEdit === undefined) r.runOnEdit = false;
  const persist = async () => { if (!dead) await Scope.save(sc, r); };
  const save = debounce(persist, 350);
  const diag = h('div.rx-diag'), out = h('div.rx-out'), flags = h('div.rx-flags');
  const sample = h('textarea.inp.rx-mono', { rows: 6, spellcheck: false, placeholder: '여기에 시험할 글을 넣으세요. 고치는 대로 아래에 결과가 나옵니다.', value: samples.get(r.id) || '' });
  const touched = () => { save(); head.textContent = r.name || '이름 없는 정규식'; lintNow(); test(); };
  const lintNow = () => {
    const L = lintScript(r);
    flags.replaceChildren(...(L.ok ? L.flagNotes.map(t => h('em.badge', t)) : []), L.ok && L.groups ? h('em.badge', `괄호 그룹 ${L.groups}개`) : null);
    diag.replaceChildren(L.issues.length ? issuesEl(L.issues) : h('p.rx-fine', icon('check', 14), '문제를 찾지 못했어요.'));
    return L;
  };
  const test = debounce(async () => {
    const my = ++seq, text = sample.value; samples.set(r.id, text);
    const L = lintScript(r);
    if (!text) return out.replaceChildren(h('p.dim', '시험할 글을 넣으면 찾은 곳 · 괄호로 잡은 부분 · 바뀐 결과를 단계별로 보여 줍니다.'));
    if (!L.ok) return out.replaceChildren(h('p.rx-stop', '찾기 문장에 오류가 있어 돌릴 수 없어요. 위의 진단을 먼저 확인하세요.'));
    const chat = lastChat(), ctx = ctxOf(chat), src = regexFind(r, ctx), re = compileRegex(src);
    if (!re) { const why = lintScript({ ...r, find: src }).issues.find(x => x.level === 'error')?.msg || ''; return out.replaceChildren(h('p.rx-stop', `매크로를 넣은 뒤의 패턴 ${clip(src, 80)} 을(를) 정규식으로 읽지 못했어요. ${why} "기호를 글자로 바꿔 넣기" 를 써 보세요.`)); }
    const pr = await probe(re.source, re.flags, text); if (my !== seq) return;
    if (!pr.ok) return out.replaceChildren(h('p.rx-stop', '이 입력에서는 계산이 끝나지 않아 멈췄어요 (1.5초 넘음). 되풀이가 겹친 패턴 — (a+)+ · (.*)* · (a|ab)* 같은 꼴 — 이 맞지 않는 글을 만나면 경우의 수가 폭발합니다. 안쪽을 [^…]+ 처럼 좁히거나, 바깥 되풀이를 없애세요. 이대로 켜 두면 대화 화면이 멈출 수 있습니다.'));
    const tr = {}, result = runRegexScript({ ...r, enabled: true }, text, ctx, tr), T = tally(tr.matches);
    const macroNote = /\{\{/.test(r.find + r.replace + arr(r.trim).join('')) ? h('small.hint', chat ? `매크로는 "${chatLabel(chat)}" 기준으로 채웠어요.` : '열린 대화가 없어 매크로는 채우지 않았어요.') : null;
    if (!T.found) return out.replaceChildren(h('p.rx-none', '이 입력에서는 찾은 곳이 없어요.'), h('ul.rx-why', whyNoMatch(L, text).map(t => h('li', t))), macroNote);
    const chips = [['diff', '바뀐 곳'], ['hits', '찾은 곳'], ['result', '결과'], ['each', `하나씩 (${T.found})`]];
    const body = h('div.rx-view');
    const drawView = () => {
      bar.querySelectorAll('.chip').forEach(c => c.classList.toggle('on', c.dataset.v === viewMode));
      if (viewMode === 'diff') body.replaceChildren(diffEl(text, tr.matches));
      else if (viewMode === 'hits') body.replaceChildren(hitsEl(text, tr.matches));
      else if (viewMode === 'result') body.replaceChildren(plainEl(result), h('div.row.end', btn('결과 복사', { ic: 'copy', cls: 'ghost', onclick: () => navigator.clipboard?.writeText(result).then(() => toast('복사했어요', 'ok'), () => toast('복사하지 못했어요', 'err')) })));
      else body.replaceChildren(...tr.matches.slice(0, 60).map((m, i) => h('div.rx-match',
        h('div.rx-match-head', h('b', `${i + 1}번째`), h('small', `${m.index + 1}번째 글자부터 ${m.match.length}자`)),
        h('dl',
          h('dt', '찾은 글'), h('dd', h('code', m.match || '∅ (빈 자리)')),
          ...m.groups.flatMap((g, k) => [h('dt', `$${k + 1}`), h('dd', g === undefined ? h('span.dim', '맞지 않음 (빈칸)') : h('code', g || '∅'))]),
          ...Object.entries(m.named || {}).flatMap(([k, g]) => [h('dt', `$<${k}>`), h('dd', g === undefined ? h('span.dim', '맞지 않음 (빈칸)') : h('code', g || '∅'))]),
          ...(m.raw !== m.cut ? [h('dt', '다듬기 전'), h('dd', h('code', m.raw || '∅')), h('dt', '다듬은 뒤'), h('dd', h('code', m.cut || '∅'))] : []),
          ...(m.cut !== m.out ? [h('dt', '매크로 채움'), h('dd', h('code', m.out || '∅'))] : []),
          h('dt', '바뀐 글'), h('dd', h('code.rx-res', m.out || '∅ (지움)'))))),
      tr.matches.length > 60 && h('p.dim', `앞의 60곳만 보여 줍니다 (모두 ${tr.matches.length}곳).`));
    };
    const bar = h('div.rx-chips', chips.map(([v, label]) => h('button.chip', { type: 'button', dataset: { v }, onclick: () => { viewMode = v; drawView(); } }, label)));
    out.replaceChildren(h('p.rx-sum', h('b', `${T.found}곳 찾음`), ` · ${T.removed.toLocaleString()}자를 ${T.added.toLocaleString()}자로 · 전체 ${text.length.toLocaleString()}자 → ${result.length.toLocaleString()}자`, result === text ? ' · 글은 그대로' : ''), bar, body, macroNote);
    drawView();
  }, 220);
  sample.addEventListener('input', test);

  const text = (key, props) => h(props.rows ? 'textarea.inp' : 'input.inp', { value: r[key] ?? '', spellcheck: false, autocomplete: 'off', oninput: e => { r[key] = e.target.value; touched(); }, ...props });
  const field = (label, ctl, hint, cls = '') => h(`label.field${cls}`, h('span.field-label', label), ctl, hint && h('small.hint', hint));
  const numField = (key, label, min) => field(label, h('input.inp', { type: 'number', min, max: 9999, value: r[key] ?? '', placeholder: '제한 없음', oninput: e => { r[key] = e.target.value === '' ? null : +e.target.value; touched(); } }), null, '.half');
  const sel = (key, opts, num) => h('select.inp', { onchange: e => { r[key] = num ? +e.target.value : e.target.value; touched(); } }, opts.map(([v, label]) => h('option', { value: v, selected: String(r[key] ?? opts[0][0]) === String(v) }, label)));
  const scopeLine = h('div.rx-scope-line');
  const drawScope = () => scopeLine.replaceChildren(
    h('span.rx-scope-tag', icon(sc.kind === 'global' ? 'moon' : sc.kind === 'preset' ? 'sliders' : 'user', 14), scName(sc)),
    btn('옮기기', { cls: 'ghost', ic: 'right', onclick: async e => { const to = await pickTarget(e.currentTarget, sc); if (!to) return; await persist(); await moveScripts([{ r, sc }], to); sc = to; drawScope(); toast(`${scName(to)}(으)로 옮겼어요`, 'ok'); } }));
  drawScope();
  const form = h('div.rx-ed-form',
    h('div.rx-ed-top', h('label.rx-on', switchEl(r.enabled, v => { r.enabled = v; touched(); }, '이 스크립트 사용', 'span'), h('span', '사용')), scopeLine),
    h('div.form',
      field('이름', text('name', { placeholder: '알아보기 쉬운 이름' })),
      field('찾기', text('find', { rows: 2, class: 'rx-mono', placeholder: '/찾을 패턴/g' }), '/패턴/플래그 꼴로 적습니다. 슬래시 없이 적으면 맞는 곳을 모두 바꿉니다.'),
      h('div.field', flags, diag),
      field('바꾸기', text('replace', { rows: 4, class: 'rx-mono', placeholder: '비워 두면 찾은 글을 지웁니다' }), '$1 $2 … 괄호로 잡은 부분 · {{match}} 찾은 글 전체 · $<이름> 이름 붙인 그룹 · HTML 과 매크로를 쓸 수 있어요.'),
      field('다듬기 문자열', h('textarea.inp.rx-mono', { rows: 2, spellcheck: false, value: arr(r.trim).join('\n'), placeholder: '한 줄에 하나씩', oninput: e => { r.trim = e.target.value.split('\n').filter(x => x.length); touched(); } }), '$1 · {{match}} 로 가져온 부분에서 지울 글자입니다.'),
      h('div.field', h('span.field-label', '대상'), h('div.rx-pills', WHO.map(([k, label]) => h('label.check.pill', h('input', { type: 'checkbox', checked: !!r[k], onchange: e => { r[k] = e.target.checked; touched(); } }), h('i'), h('span', label))))),
      field('적용 방식', sel('mode', MODES.map(m => [m[0], m[1]])), '원문을 바꿔 저장하면 보내거나 받은 글 자체가 바뀌어 되돌릴 수 없어요. 나머지는 원문을 그대로 둡니다.', '.half'),
      field('찾기의 매크로', sel('subst', [[0, '바꾸지 않음'], [1, '값을 넣기'], [2, '기호를 글자로 바꿔 넣기']], true), '찾기 안의 {{char}} {{user}} 같은 매크로를 이름으로 바꿔 찾을지 정합니다.', '.half'),
      numField('minDepth', '최소 깊이', -1), numField('maxDepth', '최대 깊이', 0),
      h('small.hint.rx-wide', '깊이 0 은 마지막 메시지, 1 은 그 앞 메시지입니다. 화면 표시와 전송에서만 봅니다. 최소 깊이를 비우거나 -1 로 두면 이어 쓰는 메시지에도 적용돼요.'),
      h('label.check', h('input', { type: 'checkbox', checked: r.runOnEdit === true, onchange: e => { r.runOnEdit = e.target.checked; touched(); } }), h('i'), h('span', '메시지를 고칠 때도 적용'), h('small', '원문을 바꿔 저장하는 방식에서만 쓰입니다.'))));
  const pane = h('div.rx-ed-test',
    h('div.rx-test-head', h('span.field-label', '시험 입력'), btn('대화에서 가져오기', { cls: 'ghost', ic: 'chat', onclick: async () => { const got = await pickMessage(); if (got) { sample.value = got.text; test(); } } })),
    sample, out);
  const body = h('div.rx-ed', { dataset: { tab } },
    h('div.rx-seg', h('button', { type: 'button', dataset: { t: 'form' }, onclick: () => { body.dataset.tab = 'form'; } }, '설정'), h('button', { type: 'button', dataset: { t: 'test' }, onclick: () => { body.dataset.tab = 'test'; } }, '시험')),
    form, pane);
  const m = sheet({ title: r.name || '이름 없는 정규식', body, onClose: async () => { seq++; await persist(); redrawChat(); onClose?.(sc); } });
  const head = m.el.querySelector('.modal-head h2');
  m.el.querySelector('.modal-head').append(h('div.rx-head-tools', iconBtn('import', '실리태번 형식(JSON)으로 내보내기', () => exportOne(r)),
    iconBtn('trash', '삭제', async () => { if (!(await confirmBox(`"${r.name}" 정규식을 삭제할까요?`, '삭제', true))) return; dead = true; await Scope.remove(sc, r); m.close(); })), m.el.querySelector('.modal-head .ibtn[title="닫기"]'));
  lintNow(); test();
  return m;
}

/** 대화에서 메시지 하나 고르기 → { text, m, chat, index, msgs } */
async function pickMessage(chatIn) {
  const chat = chatIn || lastChat(); if (!chat) { toast('아직 대화가 없어요', 'err'); return null; }
  const cur = chatApi.current(), msgs = cur.chat?.id === chat.id ? cur.msgs : await S.msgs(chat.id);
  if (!msgs.length) { toast('이 대화에는 메시지가 없어요', 'err'); return null; }
  const items = msgs.map((m, i) => ({ id: String(i), ic: m.role === 'user' ? 'user' : m.role === 'system' ? 'note' : 'chat', title: `#${i + 1} ${m.role === 'user' ? '나' : m.role === 'system' ? '시스템' : m.name || '캐릭터'}`, sub: clip(msgText(m), 90) })).reverse().slice(0, 300);
  const id = await pickOne({ title: chatLabel(chat), items, ph: '내용으로 찾기', empty: '메시지가 없어요.' });
  if (id == null) return null;
  const index = +id, m = msgs[index];
  return { text: msgText(m), m, chat, index, msgs };
}

// ════════ 파이프라인 디버거 ════════
const TARGETS = [['display', '화면 표시'], ['prompt', '프롬프트 전송'], ['store', '저장할 때']];
function openDebugger(init = {}) {
  const st = { chatId: init.chatId ?? lastChat()?.id ?? '', text: init.text || '', who: 'ai', depth: 0, charId: '', presetId: '', target: 'display', edit: false, all: false, msg: null, msgs: [], auto: null };
  let seq = 0, traces = {};
  const out = h('div.rx-dbg-out'), msgLine = h('div.rx-dbg-msg');
  const area = h('textarea.inp.rx-mono', { rows: 5, spellcheck: false, placeholder: '확인할 글을 붙여 넣거나, 위에서 대화의 메시지를 고르세요.', value: st.text, oninput: e => { st.text = e.target.value; run(); } });
  const chatOf = () => S.get('chats', st.chatId) || null;
  const chatSel = h('select.inp', { onchange: e => { st.chatId = e.target.value; st.msg = null; st.auto = null; drawCtl(); run(); } },
    h('option', { value: '' }, '대화 없이 (전역 + 고른 프리셋)'), [...S.chats].sort((a, b) => b.updatedAt - a.updatedAt).slice(0, 150).map(c => h('option', { value: c.id, selected: c.id === st.chatId }, clip(chatLabel(c), 50))));
  const whoSel = h('select.inp', { onchange: e => { st.who = e.target.value; run(); } }, WHO.map(w => h('option', { value: w[3] }, w[1])));
  const depthInp = h('input.inp', { type: 'number', min: -1, max: 9999, value: 0, oninput: e => { st.depth = e.target.value === '' ? undefined : +e.target.value; st.auto = null; run(); } });
  const presetSel = h('select.inp', { onchange: e => { st.presetId = e.target.value; run(); } });
  const charSel = h('select.inp', { onchange: e => { st.charId = e.target.value; run(); } });
  const editChk = h('label.check.pill', h('input', { type: 'checkbox', onchange: e => { st.edit = e.target.checked; run(); } }), h('i'), h('span', '메시지를 고쳐 저장하는 경우'));
  const depthsOf = () => { if (!st.msg) return null; const i = st.msgs.indexOf(st.msg), vis = st.msgs.filter(m => !m.hidden), j = vis.indexOf(st.msg); return { display: st.msgs.length - 1 - i, prompt: j < 0 ? undefined : vis.length - 1 - j }; };
  const drawCtl = () => {
    const chat = chatOf(), chars = arr(chat?.charIds).map(id => S.get('chars', id)).filter(Boolean), auto = chat ? S.presetFor(chat) : S.preset();
    presetSel.replaceChildren(h('option', { value: '' }, `${chat ? '이 대화의 프리셋' : '사용 중인 프리셋'} · ${auto?.name || ''}`), ...S.presets.filter(p => p !== auto).map(p => h('option', { value: p.id, selected: p.id === st.presetId }, p.name)));
    charSel.replaceChildren(h('option', { value: '' }, chars.length > 1 ? '내 글 · 화자 없음' : chars[0]?.name || '캐릭터 없음'), ...(chars.length > 1 ? chars.map(c => h('option', { value: c.id, selected: c.id === st.charId }, c.name)) : []));
    charField.hidden = chars.length < 2; whoSel.value = st.who; depthInp.value = st.depth ?? '';
    msgLine.replaceChildren(btn(st.msg ? '다른 메시지 고르기' : '대화에서 메시지 고르기', { ic: 'chat', onclick: pick }), st.msg ? h('small.hint', `#${st.msgs.indexOf(st.msg) + 1} 메시지를 보고 있어요. 대상과 깊이는 메시지에 맞춰 두었습니다.`) : h('small.hint', chat ? '메시지를 고르면 대상 · 깊이 · 화자가 저절로 맞춰집니다.' : '대화를 고르면 그 방의 캐릭터 · 프리셋 범위까지 함께 봅니다.'));
  };
  const pick = async () => {
    const chat = chatOf() || lastChat(); const got = await pickMessage(chat); if (!got) return;
    st.chatId = got.chat.id; chatSel.value = st.chatId; st.msg = got.m; st.msgs = got.msgs; st.text = got.text; area.value = got.text;
    st.who = got.m.role === 'user' ? 'user' : got.m.role === 'system' ? 'slash' : 'ai'; st.charId = got.chat.charIds.length > 1 ? got.m.charId || '' : '';
    st.auto = depthsOf(); st.depth = st.auto?.[st.target === 'prompt' ? 'prompt' : 'display'];
    drawCtl(); run();
  };
  const charField = h('label.field.half', h('span.field-label', '화자'), charSel), depthField = h('label.field.half', h('span.field-label', '깊이 (0 = 마지막 메시지)'), depthInp);
  const envFor = target => {
    const chat = chatOf(), depth = target === 'store' ? undefined : st.auto ? st.auto[target] : st.depth;
    return regexEnv({ who: st.who, target, depth, charId: st.charId || (chat?.charIds?.length === 1 ? chat.charIds[0] : undefined), chat, preset: st.presetId ? S.get('presets', st.presetId) : undefined, edit: target === 'store' && st.edit });
  };
  /** 한 단계씩: 건너뛸지 판정 → 멈추지 않는지 확인 → 실행. engine.js 의 traceRegex 와 같은 판정 · 같은 실행 */
  async function trace(target, my) {
    const env = envFor(target), steps = []; let text = st.text;
    for (const it of regexScripts({ chat: env.chat, charId: env.charId, preset: env.preset, all: true })) {
      if (!(it.skip || regexSkip(it.r, env))) {
        const re = compileRegex(regexFind(it.r, env.ctx));
        if (re && text && !(await probe(re.source, re.flags, text)).ok) { steps.push({ id: it.r.id, name: it.r.name, kind: it.kind, owner: it.owner, r: it.r, skip: 'hang' }); continue; }
        if (my !== seq) return null;
      }
      const s = regexStep(it, text, env); steps.push(s); if (!s.skip) text = s.after;
    }
    return { out: text, steps, env };
  }
  const run = debounce(async () => {
    const my = ++seq;
    if (!st.text) { traces = {}; return draw(); }
    const next = {};
    for (const [t] of TARGETS) { const tr = await trace(t, my); if (!tr || my !== seq) return; next[t] = tr; }
    traces = next; draw();
  }, 200);
  const scOf = s => (s.kind === 'global' ? G : { kind: s.kind, id: s.owner });
  const stepEl = (s, n, env) => {
    const hits = s.matches?.length || 0, changed = !s.skip && s.after !== s.before;
    const kind = s.skip ? 'skip' : changed ? 'hit' : 'miss';
    const status = s.skip ? SKIP_TEXT[s.skip] || s.skip : changed ? `${hits}곳 바꿈` : hits ? `${hits}곳 찾았지만 글은 그대로` : '맞는 곳 없음';
    const el = h(`details.rx-step.${kind}`, h('summary', h('span.rx-step-n', n ? String(n).padStart(2, '0') : '–'), h('em.badge', scShort(scOf(s))), h('b', s.name || '이름 없음'), h('span.rx-step-st', status), icon('down', 14)));
    el.addEventListener('toggle', () => {
      if (!el.open || el.dataset.drawn) return; el.dataset.drawn = '1';
      const openBtn = btn('스크립트 열기', { cls: 'ghost', ic: 'edit', onclick: () => openEditor(s.r, scOf(s), { onClose: () => run() }) });
      if (s.skip) return el.append(h('div.rx-step-body', h('p', skipDetail(s.skip, s.r, env)), s.kind !== 'global' && h('small.hint', scName(scOf(s))), h('div.row', openBtn)));
      const T = tally(s.matches);
      el.append(h('div.rx-step-body', h('code.rx-src', s.source),
        hits ? diffEl(s.before, s.matches) : h('ul.rx-why', whyNoMatch(lintOf(s.r), s.before).map(t => h('li', t))),
        h('div.row.wrap', hits ? h('small.hint', `${T.removed.toLocaleString()}자를 ${T.added.toLocaleString()}자로 · ${s.before.length.toLocaleString()}자 → ${s.after.length.toLocaleString()}자`) : null, openBtn)));
    });
    return el;
  };
  const draw = () => {
    const tabs = h('div.rx-chips', TARGETS.map(([t, label]) => { const tr = traces[t], n = tr ? tr.steps.filter(s => !s.skip && s.after !== s.before).length : 0; return h(`button.chip${st.target === t ? '.on' : ''}`, { type: 'button', onclick: () => { st.target = t; if (st.auto) { st.depth = st.auto[t === 'prompt' ? 'prompt' : 'display']; depthInp.value = st.depth ?? ''; } draw(); } }, label, tr ? h('small', n ? `${n}개가 바꿈` : '그대로') : null); }));
    const tr = traces[st.target];
    editChk.hidden = st.target !== 'store'; depthField.hidden = st.target === 'store';
    if (!tr) return out.replaceChildren(tabs, h('p.dim', '글을 넣으면 어떤 스크립트가 어떤 순서로 적용되는지 단계별로 보여 줍니다.'));
    const inScope = tr.steps.filter(s => !String(s.skip).startsWith('scope:')), outScope = tr.steps.filter(s => String(s.skip).startsWith('scope:'));
    const ran = inScope.filter(s => !s.skip), changed = ran.filter(s => s.after !== s.before);
    let n = 0;
    const rows = inScope.filter(s => st.all || !s.skip).map(s => stepEl(s, s.skip ? 0 : ++n, tr.env));
    const toggle = h('div.rx-chips', h(`button.chip${st.all ? '' : '.on'}`, { type: 'button', onclick: () => { st.all = false; draw(); } }, `적용된 것 ${ran.length}`), h(`button.chip${st.all ? '.on' : ''}`, { type: 'button', onclick: () => { st.all = true; draw(); } }, `건너뛴 것도 ${inScope.length}`));
    out.replaceChildren(tabs,
      h('p.rx-sum', h('b', `범위 안 스크립트 ${inScope.length}개 가운데 ${ran.length}개 실행`), ` · ${changed.length}개가 글을 바꿈 · ${st.text.length.toLocaleString()}자 → ${tr.out.length.toLocaleString()}자`, tr.env.target !== 'store' && tr.env.depth !== undefined ? ` · 깊이 ${tr.env.depth}` : ''),
      toggle,
      h('div.rx-steps', rows, !rows.length && h('p.dim', st.all ? '이 범위에는 스크립트가 없어요.' : '이 단계에서 실행된 스크립트가 없어요. "건너뛴 것도" 를 누르면 까닭을 볼 수 있습니다.')),
      st.all && outScope.length ? h('details.rx-outscope', h('summary', `범위가 아닌 스크립트 ${outScope.length}개 (다른 캐릭터 · 다른 프리셋)`), h('div.rx-steps', outScope.slice(0, 300).map(s => stepEl(s, 0, tr.env)))) : null,
      h('div.rx-final', h('div.rx-test-head', h('span.field-label', `마지막 결과 · ${TARGETS.find(t => t[0] === st.target)[1]}`), btn('복사', { ic: 'copy', cls: 'ghost', onclick: () => navigator.clipboard?.writeText(tr.out).then(() => toast('복사했어요', 'ok'), () => toast('복사하지 못했어요', 'err')) })), plainEl(tr.out), tr.out === st.text ? h('small.hint', '처음 글과 같아요.') : null));
  };
  const body = h('div.rx-dbg',
    h('div.rx-dbg-ctl',
      h('div.form',
        h('label.field', h('span.field-label', '대화방'), chatSel),
        msgLine,
        h('label.field', h('span.field-label', '확인할 글'), area),
        h('label.field.half', h('span.field-label', '이 글은'), whoSel), depthField,
        charField, h('label.field.half', h('span.field-label', '프리셋'), presetSel),
        editChk)),
    out);
  sheet({ title: '정규식 디버거', body, onClose: () => { seq++; } });
  drawCtl(); draw(); if (st.text) run();
}

// ════════ 목록 화면 ════════
const view = { tab: 'global', presetId: '', charId: '', q: '', filter: 'all', pick: false, picked: new Set(), shown: 120 };
const FILTERS = [['all', '전체', () => true], ['on', '켜짐', e => e.r.enabled], ['off', '꺼짐', e => !e.r.enabled], ['bad', '문제 있음', e => !!worst(e.r)]];
function findScript(id) { return everything().find(e => e.r.id === id) || null; }

registerPage('regex', (root, arg) => {
  let openAfter = null;
  if (typeof arg === 'string' && arg) {
    if (arg.startsWith('preset:')) { view.tab = 'preset'; view.presetId = arg.slice(7); }
    else if (arg.startsWith('char:')) { view.tab = 'char'; view.charId = arg.slice(5); }
    else { const hit = findScript(arg); if (hit) { view.tab = hit.sc.kind; if (hit.sc.kind === 'preset') view.presetId = hit.sc.id; if (hit.sc.kind === 'char') view.charId = hit.sc.id; openAfter = hit; } }
    route.arg = null;
  }
  if (!S.get('presets', view.presetId)) view.presetId = (chatApi.current().chat ? S.presetFor(chatApi.current().chat) : S.preset())?.id || '';
  if (!S.get('chars', view.charId)) view.charId = chatApi.current().chat?.charIds?.[0] || S.regex.find(r => !isGlobal(r) && S.get('chars', r.scope))?.scope || S.chars[0]?.id || '';
  view.pick = false; view.picked.clear(); view.shown = 120;

  const tabsEl = h('div.tabs.rx-tabs'), scopeEl = h('div.rx-scope'), listEl = h('div.rx-list'), infoEl = h('div.rx-info'), moreEl = h('div.rx-morebox'), bulkEl = h('div.rx-bulk'), filterEl = h('div.rx-chips');
  const curScope = () => (view.tab === 'global' ? G : view.tab === 'preset' ? (view.presetId ? { kind: 'preset', id: view.presetId } : null) : view.tab === 'char' ? (view.charId ? { kind: 'char', id: view.charId } : null) : null);
  const entries = () => { if (view.tab === 'all') return everything(); const sc = curScope(); return sc ? Scope.list(sc).map(r => ({ r, sc })) : []; };
  const keyOf = e => `${scKey(e.sc)}|${e.r.id}`;
  const shownEntries = () => { const t = view.q.trim().toLowerCase(), f = FILTERS.find(x => x[0] === view.filter)[2]; return entries().filter(e => f(e) && (!t || `${e.r.name}\n${e.r.find}\n${e.r.replace}`.toLowerCase().includes(t))); };
  const canSort = () => view.tab !== 'all' && !view.q.trim() && view.filter === 'all' && !view.pick;
  const pickedEntries = () => entries().filter(e => view.picked.has(keyOf(e)));
  const after = () => { drawAll(); redrawChat(); };
  const showScope = to => { view.tab = to.kind; if (to.kind === 'preset') view.presetId = to.id; if (to.kind === 'char') view.charId = to.id; view.picked.clear(); after(); };

  const newScript = async () => {
    const sc = curScope() || G;
    if (view.tab === 'preset' && !curScope()) return toast('먼저 프리셋을 골라 주세요', 'err');
    if (view.tab === 'char' && !curScope()) return toast('먼저 캐릭터를 골라 주세요', 'err');
    const r = await Scope.add(sc, newRegex());
    if (!isAllowed(sc)) setAllow(sc, true);
    drawAll(); openEditor(r, sc, { onClose: after });
  };
  const move = async (sc, from, to) => { const list = Scope.list(sc); if (to < 0 || to >= list.length || to === from) return; const [x] = list.splice(from, 1); list.splice(to, 0, x); await Scope.reorder(sc, list); drawList(); redrawChat(); };
  const rowMenu = (anchor, e, i, n) => menu(anchor, [
    { label: '편집', ic: 'edit', onclick: () => openEditor(e.r, e.sc, { onClose: after }) },
    { label: '시험해 보기', ic: 'play', onclick: () => openEditor(e.r, e.sc, { tab: 'test', onClose: after }) },
    canSort() && i > 0 && { label: '위로', ic: 'up', onclick: () => move(e.sc, i, i - 1) },
    canSort() && i < n - 1 && { label: '아래로', ic: 'down', onclick: () => move(e.sc, i, i + 1) },
    canSort() && i > 0 && { label: '맨 위로', ic: 'up', onclick: () => move(e.sc, i, 0) },
    canSort() && i < n - 1 && { label: '맨 아래로', ic: 'down', onclick: () => move(e.sc, i, n - 1) },
    '-',
    { label: '복제', ic: 'copy', onclick: async () => { const { src, mod, ...rest } = structuredClone(e.r); const c = await Scope.add(e.sc, { ...rest, id: uid(), name: `${e.r.name} (사본)` }); const list = Scope.list(e.sc), at = list.indexOf(e.r); if (at >= 0) { list.splice(list.indexOf(c), 1); list.splice(at + 1, 0, c); await Scope.reorder(e.sc, list); } after(); } },
    { label: '다른 범위로 옮기기', ic: 'right', onclick: async () => { const to = await pickTarget(anchor, e.sc); if (!to) return; await moveScripts([e], to); toast(`${scName(to)}(으)로 옮겼어요`, 'ok'); after(); } },
    { label: '내보내기 (실리태번 JSON)', ic: 'import', onclick: () => exportOne(e.r) },
    '-',
    { label: '삭제', ic: 'trash', danger: true, onclick: async () => { if (!(await confirmBox(`"${e.r.name}" 정규식을 삭제할까요?`, '삭제', true))) return; await Scope.remove(e.sc, e.r); after(); } },
  ]);
  const rowEl = (e, i, n) => {
    const { r, sc } = e, bad = worst(r), key = keyOf(e), sortable = canSort();
    const el = h(`div.rx-row${r.enabled ? '' : '.off'}${view.picked.has(key) ? '.picked' : ''}`, { dataset: { key } },
      view.pick
        ? h('label.check.rx-pick', { onclick: ev => ev.stopPropagation() }, h('input', { type: 'checkbox', checked: view.picked.has(key), 'aria-label': `${r.name} 고르기`, onchange: ev => { ev.target.checked ? view.picked.add(key) : view.picked.delete(key); el.classList.toggle('picked', ev.target.checked); drawBulk(); } }), h('i'))
        : sortable ? h('button.grip', { type: 'button', title: '잡고 끌어서 순서 바꾸기 (방향키 ↑ ↓ 로도)', 'aria-label': '순서 바꾸기', onclick: ev => ev.stopPropagation(), onkeydown: ev => { if (ev.key === 'ArrowUp' || ev.key === 'ArrowDown') { ev.preventDefault(); move(sc, i, i + (ev.key === 'ArrowUp' ? -1 : 1)).then(() => listEl.children[i + (ev.key === 'ArrowUp' ? -1 : 1)]?.querySelector('.grip')?.focus()); } } }, icon('grip', 16))
          : h('span.rx-no', String(i + 1).padStart(2, '0')),
      switchEl(r.enabled, async v => { r.enabled = v; el.classList.toggle('off', !v); await Scope.save(sc, r); drawInfo(); redrawChat(); }, `${r.name} 켜기 · 끄기`),
      h('div.rx-row-text',
        h('b', r.name || '이름 없음'),
        h('small', view.tab === 'all' && h('span.rx-where', scName(sc)), h('code', clip(r.find, 80) || '찾기 없음'))),
      h('span.rx-row-meta', bad ? h(`em.badge.rx-flag.${bad}`, bad === 'error' ? '오류' : '주의') : null, h('span.rx-tag', whoShort(r)), h('span.rx-tag', modeShort(r))),
      iconBtn('more', '더 보기', ev => { ev.stopPropagation(); rowMenu(ev.currentTarget, e, i, n); }));
    el.addEventListener('click', ev => {
      if (ev.target.closest('button, label, input')) return;
      if (view.pick) { const on = !view.picked.has(key); on ? view.picked.add(key) : view.picked.delete(key); el.classList.toggle('picked', on); const box = el.querySelector('.rx-pick input'); if (box) box.checked = on; return drawBulk(); }
      openEditor(r, sc, { onClose: after });
    });
    return el;
  };
  const drawList = () => {
    const all = entries(), rows = shownEntries();
    listEl.classList.toggle('picking', view.pick);
    listEl.replaceChildren(...rows.slice(0, view.shown).map((e, i) => rowEl(e, i, rows.length)));
    moreEl.replaceChildren(rows.length > view.shown ? btn(`${Math.min(120, rows.length - view.shown)}개 더 보기 (남은 ${rows.length - view.shown}개)`, { cls: 'ghost', onclick: () => { view.shown += 120; drawList(); } }) : '');
    const sc = curScope();
    drawInfo();
    if (!rows.length) listEl.append(h('div.empty.rx-empty', icon('code', 30),
      h('p', all.length ? '찾는 정규식이 없어요.' : view.tab === 'char' && !sc ? '캐릭터를 먼저 만들어 주세요.' : view.tab === 'global' ? '응답을 다듬거나 꾸미는 찾아 바꾸기 규칙을 만들 수 있어요.' : view.tab === 'preset' ? '이 프리셋에는 아직 정규식이 없어요. 여기에 만든 정규식은 프리셋과 함께 다닙니다.' : view.tab === 'char' ? '이 캐릭터에는 아직 정규식이 없어요. 여기에 만든 정규식은 캐릭터 카드와 함께 다닙니다.' : '아직 정규식이 없어요.'),
      !all.length && sc ? h('div.row.wrap', btn('새 정규식', { ic: 'plus', cls: 'primary', onclick: newScript }), btn('가져오기', { ic: 'import', onclick: () => importFlow(curScope() || G, showScope) })) : null));
    drawBulk();
  };
  const drawInfo = () => {
    const all = entries(), rows = shownEntries(), narrowed = rows.length !== all.length;
    infoEl.replaceChildren(
      all.length ? h('span', narrowed ? `찾은 것 ${rows.length}개 · 전체 ${all.length}개` : `${all.length}개 · 켜짐 ${all.filter(e => e.r.enabled).length}개`) : '',
      all.length && view.tab !== 'all' ? h('span.dim', canSort() ? '위에서부터 차례로 적용됩니다' : view.pick ? '' : '순서를 바꾸려면 검색과 거르기를 지우세요') : '',
      view.tab === 'all' && all.length ? h('span.dim', '적용 순서: 전역 → 프리셋 → 캐릭터') : '');
  };
  const drawCounts = () => {
    const n = { global: Scope.list(G).length, preset: view.presetId ? Scope.list({ kind: 'preset', id: view.presetId }).length : 0, char: view.charId ? Scope.list({ kind: 'char', id: view.charId }).length : 0 };
    tabsEl.replaceChildren(...[['global', '전역', n.global], ['preset', '프리셋', n.preset], ['char', '캐릭터', n.char], ['all', '전체', null]].map(([t, label, c]) =>
      h(`button.tab${view.tab === t ? '.on' : ''}`, { type: 'button', onclick: () => { view.tab = t; view.shown = 120; view.picked.clear(); drawAll(); } }, label, c !== null ? h('small', String(c)) : null)));
    filterEl.replaceChildren(...FILTERS.map(([f, label]) => h(`button.chip${view.filter === f ? '.on' : ''}`, { type: 'button', onclick: () => { view.filter = f; view.shown = 120; drawCounts(); drawList(); } }, label)));
  };
  const allowRow = (sc, what) => {
    const state = allowState(sc), n = Scope.list(sc).length;
    return h('label.rx-allow', switchEl(isAllowed(sc), v => { setAllow(sc, v); drawScope(); redrawChat(); }, `${what}의 정규식 사용`, 'span'), h('span', `${what}의 정규식 사용`),
      state === 'ask' && n ? h('em.badge', '가져온 뒤 아직 허용하지 않음') : null);
  };
  const drawScope = () => {
    if (view.tab === 'preset') {
      const sc = curScope(), p = sc && S.get('presets', sc.id);
      return scopeEl.replaceChildren(
        h('div.rx-scope-row',
          h('select.inp.rx-owner', { 'aria-label': '프리셋 고르기', onchange: e => { view.presetId = e.target.value; view.picked.clear(); drawAll(); } }, S.presets.map(x => h('option', { value: x.id, selected: x.id === view.presetId }, `${x.name}${x.id === S.settings.activePreset ? ' · 사용 중' : ''} (${arr(x.regex).length})`))),
          sc && allowRow(sc, '이 프리셋'),
          p && iconBtn('more', '프리셋 내보내기', e => menu(e.currentTarget, [
            { label: '실리태번 프리셋으로 내보내기 (정규식 포함)', ic: 'import', onclick: () => download(`${safeName(p.name)}.json`, JSON.stringify(presetToSt(p), null, 4)) },
            { label: '가진 실리태번 프리셋 파일에 이 정규식 싣기', ic: 'merge', onclick: async () => { const [f] = await pickFiles({ accept: '.json' }); if (!f) return; try { const j = JSON.parse(await f.text()); if (!j || typeof j !== 'object' || Array.isArray(j)) throw new Error('프리셋 파일이 아니에요'); download(f.name, JSON.stringify(stPresetWithRegex(j, Scope.list(sc)), null, 4)); toast('정규식을 실은 프리셋 파일을 내려받았어요', 'ok'); } catch (err) { toast(err.message, 'err'); } } },
            { label: '프리셋 화면에서 열기', ic: 'sliders', onclick: () => go('presets', p.id) },
          ]))),
        h('small.hint', '이 프리셋을 쓰는 대화에서만 적용되고, 프리셋을 내보내거나 복제하면 함께 따라갑니다. 전역 다음, 캐릭터 앞 순서로 돕니다.'));
    }
    if (view.tab === 'char') {
      const sc = curScope(), c = sc && S.get('chars', sc.id);
      return scopeEl.replaceChildren(
        h('div.rx-scope-row',
          h('button.rx-owner.rx-charbtn', { type: 'button', title: '캐릭터 고르기', onclick: async () => { const id = await pickChar('어느 캐릭터의 정규식을 볼까요?'); if (id) { view.charId = id; view.picked.clear(); drawAll(); } } }, c ? avatar(c, 'xs') : icon('user', 18), h('b', c?.name || '캐릭터 고르기'), icon('down', 14)),
          sc && allowRow(sc, '이 캐릭터')),
        h('small.hint', '이 캐릭터와의 대화에서만 적용되고, 캐릭터 카드를 내보내면 함께 따라갑니다. 그룹 대화에서는 이 캐릭터가 쓴 메시지에만 적용돼요. 순서는 맨 마지막입니다.'));
    }
    scopeEl.replaceChildren(h('small.hint', view.tab === 'global' ? '모든 대화에 적용됩니다. 가장 먼저 돕니다.' : '모든 범위의 정규식을 한꺼번에 찾아볼 수 있어요. 순서는 범위 탭에서 바꿉니다.'));
  };
  const bulk = (label, ic, fn, cls = '') => btn(label, { ic, cls, onclick: async e => { const items = pickedEntries(); if (!items.length) return toast('먼저 정규식을 골라 주세요'); await fn(items, e.currentTarget); } });
  const setOn = async (items, v) => { const presets = new Set(); for (const { r, sc } of items) { if (!!r.enabled === v) continue; r.enabled = v; if (sc.kind === 'preset') presets.add(sc.id); else await S.save('regex', r, true); } for (const id of presets) { const p = S.get('presets', id); if (p) await S.save('presets', p, true); } after(); };
  const drawBulk = () => {
    bulkEl.hidden = !view.pick; if (!view.pick) return;
    const rows = shownEntries(), allOn = rows.length > 0 && rows.every(e => view.picked.has(keyOf(e)));
    bulkEl.replaceChildren(
      h('b.rx-bulk-n', `${view.picked.size}개 고름`),
      btn(allOn ? '모두 풀기' : '보이는 것 모두', { cls: 'ghost', onclick: () => { for (const e of rows) allOn ? view.picked.delete(keyOf(e)) : view.picked.add(keyOf(e)); drawList(); } }),
      h('span.rx-bulk-acts',
        bulk('켜기', 'check', items => setOn(items, true)), bulk('끄기', 'x', items => setOn(items, false)),
        bulk('옮기기', 'right', async (items, anchor) => { const to = await pickTarget(anchor); if (!to) return; const n = await moveScripts(items, to); view.picked.clear(); toast(n ? `${scName(to)}(으)로 ${n}개를 옮겼어요` : '이미 그 범위에 있어요', 'ok'); after(); }),
        bulk('내보내기', 'import', items => exportMany(items.map(e => e.r))),
        bulk('삭제', 'trash', async items => { if (!(await confirmBox(`고른 정규식 ${items.length}개를 삭제할까요?`, '삭제', true))) return; for (const e of items) await Scope.remove(e.sc, e.r); view.picked.clear(); after(); }, 'danger')),
      btn('끝내기', { cls: 'ghost', onclick: () => { view.pick = false; view.picked.clear(); pickBtn.classList.remove('on'); drawList(); } }));
  };
  const pickBtn = h('button.chip.rx-pickbtn', { type: 'button', onclick: () => { view.pick = !view.pick; if (!view.pick) view.picked.clear(); pickBtn.classList.toggle('on', view.pick); drawList(); } }, '여러 개 고르기');
  const search = h('input.inp.search', { placeholder: '이름 · 찾기 · 바꾸기 내용으로 찾기', value: view.q, oninput: debounce(e => { view.q = e.target.value; view.shown = 120; drawList(); }, 150) });
  const drawAll = () => { drawCounts(); drawScope(); drawList(); };
  dragSort(listEl, (from, to) => { const sc = curScope(); if (sc && canSort()) move(sc, from, to); });

  root.append(h('section.rx',
    pageHead('regex', '정규식',
      btn('디버거', { ic: 'eye', title: '메시지 하나가 어떤 정규식을 거치는지 단계별로 보기', onclick: () => openDebugger() }),
      btn('켜짐 묶음', { ic: 'mark', title: '켜고 꺼 둔 상태를 저장해 두고 한 번에 바꾸기', onclick: () => setsDialog(after) }),
      btn('가져오기', { ic: 'import', title: '실리태번 정규식 JSON (낱개 · 묶음), 정규식이 실린 프리셋 · 캐릭터 카드 JSON', onclick: () => importFlow(curScope() || G, showScope) }),
      btn('새 정규식', { ic: 'plus', cls: 'primary', onclick: newScript })),
    tabsEl, scopeEl,
    h('div.rx-tools', h('div.search-wrap', icon('search', 16), search), filterEl, pickBtn),
    infoEl, listEl, moreEl, bulkEl));
  drawAll();
  if (openAfter) openEditor(openAfter.r, openAfter.sc, { onClose: after });
});

// ════════ 캐릭터 · 프리셋에 실려 온 정규식: 처음 쓸 때 한 번 묻는다 ════════
function askEmbedded(chat) {
  if (!chat || route.page !== 'chat' || document.querySelector('.rx-ask')) return;
  const a = S.settings.regexAllow || {};
  const cid = arr(chat.charIds).find(id => a.chars?.[id] === 'ask' && scopedRegex(id).length), p = S.presetFor(chat);
  const sc = cid ? { kind: 'char', id: cid } : (p && a.presets?.[p.id] === 'ask' && arr(p.regex).length ? { kind: 'preset', id: p.id } : null);
  if (!sc) return;
  const n = Scope.list(sc).length, what = sc.kind === 'char' ? '캐릭터' : '프리셋'; let answered = false;
  const m = modal({ title: `${scOwner(sc)} ${what}에 정규식 ${n}개가 함께 들어 있어요`,
    body: h('div.col', h('p', `사용하면 이 ${what}${sc.kind === 'char' ? '와의 대화' : '을 쓰는 대화'}에서 글을 바꾸거나 꾸밉니다. 믿을 수 있는 곳에서 받은 것만 켜세요.`), h('small.hint', `나중에 메뉴 › 정규식 › ${what} 탭에서 바꿀 수 있어요.`)),
    onClose: () => { if (!answered) setAllow(sc, false); setTimeout(() => askEmbedded(chatApi.current().chat), 250); },
    actions: [{ label: '쓰지 않기', onclick: () => { answered = true; setAllow(sc, false); } }, { label: '내용 보기', onclick: () => { answered = true; setAllow(sc, false); go('regex', `${sc.kind}:${sc.id}`); } }, { label: '사용', cls: 'primary', onclick: () => { answered = true; setAllow(sc, true); redrawChat(); } }] });
  m.el.classList.add('rx-ask');
}
on('chat:open', chat => setTimeout(() => askEmbedded(chat), 400));

// ════════ 명령어 ════════
const inScope = () => { const chat = chatApi.current().chat; return regexScripts({ chat: chat || null }).map(it => ({ r: it.r, sc: it.kind === 'global' ? G : { kind: it.kind, id: it.owner } })); };
X.commands.set('/regex-toggle', { owner: 'regex', args: '이름 [on|off]', help: '정규식 스크립트를 켜거나 끕니다 — /regex-toggle 상태창 off', run: async arg => {
  const m = String(arg || '').trim().match(/^([\s\S]*?)(?:\s+(on|off|켜기|끄기))?$/i), name = (m?.[1] || '').trim().toLowerCase(), word = (m?.[2] || '').toLowerCase();
  if (!name) return toast('정규식 이름을 적어 주세요', 'err');
  const hit = inScope().find(e => String(e.r.name).toLowerCase() === name) || everything().find(e => String(e.r.name).toLowerCase() === name);
  if (!hit) return toast(`"${name}" 정규식을 찾지 못했어요`, 'err');
  hit.r.enabled = word ? (word === 'on' || word === '켜기') : !hit.r.enabled;
  await Scope.save(hit.sc, hit.r); redrawChat();
  toast(`"${hit.r.name}" 정규식을 ${hit.r.enabled ? '켰어요' : '껐어요'}`, 'ok');
} });
X.commands.set('/regex-set', { owner: 'regex', args: '묶음 이름', help: '저장해 둔 정규식 켜짐 묶음을 적용합니다', run: async arg => {
  const name = String(arg || '').trim().toLowerCase(), set = sets().find(s => s.name.toLowerCase() === name || s.id === name);
  if (!set) return toast(name ? `"${name}" 묶음을 찾지 못했어요` : `묶음 이름을 적어 주세요${sets().length ? ' — ' + sets().map(s => s.name).join(', ') : ''}`, 'err');
  await applySet(set); toast(`"${set.name}" 묶음을 적용했어요`, 'ok');
} });

export const RegexUI = { openEditor, openDebugger, findScript, Scope, everything, moveScripts, applySet, probe };
