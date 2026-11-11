// ── Dreamland 장기기억 설정 탭: 설정 찾기 · 설정 세트 · 모든 설정 묶음 · 프롬프트 · 말버릇 찾기 · 막간 분류.
//
//    f-memoria.js 가 vConfig 로 불러 쓴다 ──
import { EMBED_KINDS } from './embed.js';
import { S, h, on, debounce, download, pickFiles, msgText } from './core.js';
import { icon, btn, iconBtn, toast, modal, confirmBox, promptBox, route } from './ui.js';
import { tokens } from './engine.js';
import { Memory, PROMPTS, LANGS, NARRATOR, PUBLIC_ONLY, MEMORY_DEFAULTS, visibleProse } from './memory.js';
import { chatApi } from './chat.js';
import { saveBundle, deleteBundle, renameBundle, exportBundle, parseBundleFile, BUNDLE_EXCLUDED, findRepeatedPhrases, parsePhraseList } from './memoria-craft.js';
import { isPauseMessage } from './memoria-scene.js';

// ════════ 작은 도구 ════════
const IC = {
  layers: 'M12 3l9 5-9 5-9-5zM3 12.5l9 5 9-5M3 17l9 5 9-5', save: 'M5 3h11l3 3v15H5zM8 3v6h7V3M8 21v-7h8v7', repeat: 'M17 2l4 4-4 4M3 11V9a3 3 0 0 1 3-3h15M7 22l-4-4 4-4M21 13v2a3 3 0 0 1-3 3H3',
  shuffle: 'M16 3h5v5M4 20L21 3M21 16v5h-5M15 15l6 6M4 4l5 5', export: 'M12 15V3M8 7l4-4 4 4M5 13v7h14v-7', bell: 'M6 16v-5a6 6 0 0 1 12 0v5l2 2H4zM10 21h4',
};
const ico = (name, size = 16) => { if (!IC[name]) return icon(name, size); const s = icon('x', size); s.innerHTML = `<path d="${IC[name]}" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/>`; return s; };
const ib = (name, title, onclick, cls = '') => { const b = iconBtn('x', title, onclick, ('tiny ' + cls).trim()); b.replaceChildren(ico(name, 15)); return b; };
const tb = (label, name, title, onclick, cls = 'ghost') => { const b = btn(label, { cls, title, onclick }); b.prepend(ico(name, 15)); return b; };
const cur = () => chatApi.current();
const isCur = chat => cur().chat?.id === chat?.id;
const chatTitle = chat => chat?.name || (chat?.charIds || []).map(id => S.get('chars', id)?.name).filter(Boolean).join(', ') || '대화';
const persistMsgs = async (chat, msgs) => { if (isCur(chat)) { await chatApi.save(); chatApi.redraw(); } else await S.saveMsgs(chat, msgs); };
const sec = (title, desc, tools, ...body) => h('section.mm-sec', h('header.mm-sec-head', h('div', h('h3', title), desc && h('p', desc)), tools && h('div.mm-sec-tools', tools)), body);
const none = text => h('div.mm-empty', h('i.mm-star', '✦'), h('span', text));
const busyBtn = async (b, fn) => { if (b.disabled) return; b.disabled = true; b.classList.add('mm-busy'); try { return await fn(); } catch (e) { if (e.name !== 'AbortError') { console.error(e); toast(e.message || String(e), 'err'); } } finally { b.disabled = false; b.classList.remove('mm-busy'); } };
const gp = (o, p) => p.split('.').reduce((a, k) => a?.[k], o);
const sp = (o, p, v) => { const ks = p.split('.'), last = ks.pop(); ks.reduce((a, k) => a[k] ||= {}, o)[last] = v; };

// ════════ 설정 값 ════════
/** 설정에 아직 없는 키를 기본값으로 채운다 (칸이 빈 값을 보여 주지 않게) */
export function ensureCfg() {
  const m = S.settings.memory ||= {};
  for (const [k, v] of Object.entries(MEMORY_DEFAULTS)) {
    if (m[k] === undefined) m[k] = v && typeof v === 'object' ? JSON.parse(JSON.stringify(v)) : v;
    else if (v && typeof v === 'object' && !Array.isArray(v) && m[k] && typeof m[k] === 'object') for (const [k2, v2] of Object.entries(v)) if (m[k][k2] === undefined) m[k][k2] = v2;
  }
  return m;
}
const saveCfg = () => S.set({ memory: { ...S.settings.memory } });
const saveSoon = debounce(saveCfg, 250);
/** 설정 경로: 'x' 는 S.settings.memory.x, '@a.b' 는 S.settings.a.b */
const kp = k => k[0] === '@' ? k.slice(1) : 'memory.' + k;
const get = k => gp(S.settings, kp(k));
const put = k => v => sp(S.settings, kp(k), v);
/**
 * 세트에 담을 수 있는 키의 기본값 — BUNDLE_EXCLUDED 의 이름(customApi · embedApi · prompts · defaultPerspective) 가운데
 * 여기서 이름이 다른 것(embed · prompt · perspective)은 미리 빼고 넘긴다. 사서 연결은 S.settings.helpers 에 있어 처음부터 들지 않는다.
 */
const BUNDLE_SKIP = ['embed', 'prompt', 'perspective'];
export const bundleDefaults = () => Memory.bundleDefaults?.() || Object.fromEntries(Object.entries(MEMORY_DEFAULTS).filter(([k]) => !BUNDLE_SKIP.includes(k) && !BUNDLE_EXCLUDED.includes(k)));
/** 세트를 붙일 대상 — 이 대화의 (첫) 캐릭터 */
export function bundleOwner(chat) { const c = S.get('chars', chat?.charIds?.[0]); return c ? { key: `char:${c.id}`, label: `이 캐릭터 (${c.name || ''})` } : { key: '', label: '이 캐릭터' }; }
/** 장부의 모양을 바꾸는 설정 — 얼려 둔 고정 장부를 버리고 다음 답변에 바로 다시 짓게 한다 */
const reinject = chat => { try { Memory.reinjectNow?.(chat); } catch (e) { console.warn('[장기기억]', e); } };

// ════════ 칸 만들기 ════════
// 켜고 끄는 줄과 칸에는 .mm-opt, 그것들을 품는 묶음(서술 방식 · 접힌 구역 · 삼갈 표현)에는 .mm-optset — 설정 찾기가 이 표시로 걸러 낸다
function tog(k, label, hint, after) {
  return h('label.check.mm-opt', h('input', { type: 'checkbox', checked: !!get(k), onchange: e => { put(k)(e.target.checked); saveCfg(); after?.(e.target.checked); } }), h('i'), h('span.mm-opt-text', h('b', label), hint && h('small', hint)));
}
function num(k, label, title, min, max, step, { after, cls = 'third', int = true } = {}) {
  const inp = h('input.inp', { type: 'number', min, max, step, value: get(k) ?? '' });
  const on = () => { const v = Number(inp.value); if (inp.value === '' || !Number.isFinite(v)) return; put(k)(Math.max(min, Math.min(max, int ? Math.round(v) : v))); saveSoon(); after?.(); };
  inp.addEventListener('input', on); inp.addEventListener('change', on);
  return h(`label.field.${cls}.mm-opt`, { title }, h('span.field-label', label), inp);
}
function sel(k, label, title, opts, { after, cls = 'third', extra } = {}) {
  const now = String(get(k) ?? ''), s = h('select.inp', { onchange: e => { put(k)(e.target.value); saveCfg(); after?.(e.target.value); } }, opts.map(([v, l]) => h('option', { value: v, selected: now === String(v) }, l)));
  return h(`label.field.${cls}.mm-opt`, { title }, h('span.field-label', label), extra ? h('div.mm-field-inline', s, extra) : s);
}
function txt(k, label, title, ph, { after, cls = 'third', max = 300, check } = {}) {
  const inp = h('input.inp', { type: 'text', value: get(k) ?? '', placeholder: ph || '', autocomplete: 'off', spellcheck: false, onchange: () => { const v = String(inp.value || '').trim().slice(0, max); if (check && check(v) === false) return; put(k)(v); saveCfg(); after?.(v); } });
  return h(`label.field.${cls}.mm-opt`, { title }, h('span.field-label', label), inp);
}
const grid = (...kids) => h('div.form', kids);
const note = (...kids) => h('p.hint.mm-cfg-hint', kids);

// ════════ 설정 찾기 ════════
/** 검색어에 맞는 설정만 남긴다. 구역 머리말이 맞으면 그 구역은 통째로 보여 준다 */
function applySearch(root, raw) {
  if (!root) return;
  const q = String(raw || '').trim().toLowerCase(), items = [...root.querySelectorAll('.mm-opt, .mm-optset')], secs = [...root.querySelectorAll('.mm-sec')];
  root.classList.toggle('searching', !!q);
  for (const el of [...items, ...secs]) el.classList.remove('mm-hide');
  if (!q) return;
  for (const el of items) {
    if (el.matches('.mm-optset') && el.querySelector('.mm-opt')) continue;   // 묶음 안에 든 항목은 안쪽 항목이 스스로 판정한다
    const hay = `${el.textContent} ${[el, ...el.querySelectorAll('[title]')].map(x => x.getAttribute('title') || '').join(' ')}`.toLowerCase();
    if (!hay.includes(q)) el.classList.add('mm-hide');
  }
  for (const s of secs) {
    if ((s.querySelector('.mm-sec-head')?.textContent || '').toLowerCase().includes(q)) { s.querySelectorAll('.mm-hide').forEach(x => x.classList.remove('mm-hide')); continue; }
    if (![...s.querySelectorAll('.mm-opt')].some(x => !x.classList.contains('mm-hide'))) s.classList.add('mm-hide');
    else s.querySelectorAll('details').forEach(d => { d.open = true; });
  }
}
/** 입력칸은 한 번만 만들어 다시 그릴 때마다 옮겨 붙인다 — 다시 만들면 한글 조합이 끊긴다 */
function searchBox(st) {
  if (!st.cfgSearch) {
    const inp = st.cfgSearch = h('input', { type: 'search', placeholder: '설정 찾기 — 예: 숨김, 임베딩, 삼갈 표현', autocomplete: 'off', 'aria-label': '설정 찾기' });
    inp.addEventListener('input', () => applySearch(st.cfgRoot, inp.value));
    inp.addEventListener('keydown', e => { if (e.key === 'Escape' && inp.value) { e.stopPropagation(); inp.value = ''; applySearch(st.cfgRoot, ''); } });
  }
  return h('label.mm-search', ico('search', 15), st.cfgSearch);
}

// ════════ 설정 세트 — 봇 · 대화마다 다른 설정 ════════
function bundleBar(st) {
  const m = ensureCfg(), active = m.activeBundle || '', open = cur().chat || st.chat;   // 세트는 열려 있는 대화를 따라 갈아 끼워진다
  const where = !active ? '' : open?.memBundle === active ? (open.id === st.chat?.id ? '이 대화에 붙음' : `열려 있는 대화 「${chatTitle(open).slice(0, 24)}」에 붙음`) : `${bundleOwner(open).label}에 붙음`;
  return h(`div.mm-bundle-bar${active ? '.on' : ''}`, ico('layers', 16),
    h('span', active ? [h('b', active), h('small', `${where} · 지금 바꾸는 설정은 이 세트에 저장됩니다`)] : [h('b', '기본 설정'), h('small', '세트를 만들어 봇·대화마다 다른 설정을 쓸 수 있어요')]),
    btn('세트', { cls: 'ghost', title: '세트 관리', onclick: () => openBundleManager(st) }));
}
function openBundleManager(st) {
  const body = h('div.mm-dlg'), chat = st.chat;
  const refreshAll = async () => { try { await Memory.applyBundleForChat?.(cur().chat || chat); } catch (e) { console.error(e); toast(e.message || String(e), 'err'); } reinject(chat); st.draw(); draw(); };
  const askName = async (title, initial = '') => { const v = await promptBox(title, initial); return typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, 40) : ''; };
  const draw = () => {
    const m = ensureCfg(), names = Object.keys(m.bundles || {}).sort((a, b) => a.localeCompare(b)), own = bundleOwner(chat), useCount = n => Object.values(m.bundleByOwner || {}).filter(v => v === n).length;
    const pick = (label, now, off, onchange) => h('label.field.half', h('span.field-label', label), h('select.inp', { disabled: off, onchange }, [['', '없음'], ...names.map(n => [n, n])].map(([v, l]) => h('option', { value: v, selected: v === now }, l))));
    const row = n => h('div.mm-row', h('span.mm-row-text', h('b', n), n === m.activeBundle ? h('em.mm-tag.on', '지금 사용 중') : null, ' ', h('small', `캐릭터 ${useCount(n)}곳에 붙음`)),
      h('span.mm-actions',
        ib('save', '지금 설정으로 덮어쓰기', async () => { if (!(await confirmBox(`"${n}" 세트를 지금 설정으로 덮어쓸까요?`, '덮어쓰기'))) return; saveBundle(ensureCfg(), n, bundleDefaults()); saveCfg(); refreshAll(); }),
        ib('edit', '이름 바꾸기', async () => { const to = await askName('새 이름', n); if (!to || to === n) return; if (!renameBundle(ensureCfg(), n, to)) return toast('같은 이름의 세트가 이미 있습니다.', 'err');
          for (const c of S.chats) if (c.memBundle === n) { c.memBundle = to; await S.save('chats', c, true); }   // 대화에 붙인 것도 새 이름을 따라간다
          saveCfg(); refreshAll(); }),
        ib('export', '파일로 내보내기', () => { const text = exportBundle(ensureCfg(), n, bundleDefaults()); if (text) download(`memoria-bundle-${n.replace(/[^\p{L}\p{N}_-]+/gu, '_')}.json`, text, 'application/json'); }),
        ib('trash', '삭제', async () => { if (!(await confirmBox(`세트 "${n}"을(를) 삭제할까요?`, '삭제', true))) return; deleteBundle(ensureCfg(), n, bundleDefaults()); saveCfg(); refreshAll(); }, 'del')));
    body.replaceChildren(
      h('p.hint', '봇마다 다른 설정을 이름 붙여 저장하고, 대화나 캐릭터에 붙여 두면 그 대화를 열 때 알아서 바뀝니다. 먼저 보는 순서: ', h('b', '이 대화 → 이 캐릭터 → 기본 설정'), '.'),
      h('div.form',
        pick(chat ? `이 대화 (${chatTitle(chat).slice(0, 24)})` : '이 대화', String(chat?.memBundle || ''), !chat, async e => { const v = String(e.target.value || ''); if (v) chat.memBundle = v; else delete chat.memBundle; await S.save('chats', chat, true); refreshAll(); }),
        pick(own.label, m.bundleByOwner?.[own.key] || '', !own.key, e => { if (!own.key) return; const v = String(e.target.value || ''), x = ensureCfg(); x.bundleByOwner ||= {}; if (v) x.bundleByOwner[own.key] = v; else delete x.bundleByOwner[own.key]; saveCfg(); refreshAll(); })),
      h('div.mm-rows', names.length ? names.map(row) : none('아직 세트가 없습니다. 설정을 원하는 대로 바꾼 뒤 아래 버튼으로 저장하세요.')),
      h('div.row.wrap',
        tb('새 세트', 'plus', '지금 설정을 새 세트로 저장', async () => { const name = await askName('새 세트 이름 (예: 시뮬봇, 1인봇)'); if (!name) return; const x = ensureCfg();
          if (x.bundles?.[name] && !(await confirmBox(`"${name}" 세트가 이미 있습니다. 지금 설정으로 덮어쓸까요?`, '덮어쓰기'))) return;
          saveBundle(ensureCfg(), name, bundleDefaults()); saveCfg(); toast(`"${name}" 세트를 저장했습니다. 위에서 대화나 캐릭터에 붙이면 적용됩니다.`, 'ok'); refreshAll(); }, ''),
        tb('가져오기', 'import', '세트 파일 가져오기', async () => { const [file] = await pickFiles({ accept: '.json' }); if (!file) return; const parsed = parseBundleFile(await file.text(), bundleDefaults());
          if (!parsed) return toast('장기기억 설정 세트 파일이 아닙니다.', 'err');
          const x = ensureCfg(); x.bundles ||= {}; let name = parsed.name; for (let n = 2; x.bundles[name]; n++) name = `${parsed.name} (${n})`;
          x.bundles[name] = parsed.values; saveCfg(); toast(`"${name}" 세트를 가져왔습니다.`, 'ok'); refreshAll(); })),
      h('p.hint', '세트에 들어가지 않는 것: 장기기억 켜기/끄기, 사서에 쓸 연결·임베딩 설정, 프롬프트, 공통 기억·서술 방식. 세트가 적용된 대화에서 설정을 바꾸면 기본 설정이 아니라 그 세트가 바뀝니다.'));
  };
  draw();
  modal({ title: '설정 세트', wide: true, body, actions: [{ label: '닫기', cls: 'primary' }] });
}

// ════════ 묵은 말투 · 삼갈 표현 ════════
/** 최근 AI 답변 40개에서 여러 답변에 되풀이된 표현을 찾아, 고른 것을 삼갈 표현에 넣는다 */
function openRepeatFinder(st, onDone) {
  const msgs = st.msgs || [], replies = [];
  for (let i = msgs.length - 1; i >= 0 && replies.length < 40; i--) { const m = msgs[i]; if (!m || m.role !== 'assistant' || m.hidden) continue; const text = visibleProse(msgText(m) || ''); if (text.trim()) replies.push(text); }
  if (replies.length < 3) return toast('AI 답변이 3개 이상 쌓인 뒤에 찾을 수 있습니다.');
  const names = [S.persona(st.chat)?.name, ...(st.chat?.charIds || []).map(id => S.get('chars', id)?.name), ...(st.mem?.cast || []).flatMap(c => [c.name, ...(c.aka || [])])].filter(Boolean);
  const already = new Set(parsePhraseList(ensureCfg().bannedPhrases).map(p => p.toLowerCase()));
  const found = findRepeatedPhrases(replies, { names }).filter(f => !already.has(f.phrase.toLowerCase()));
  if (!found.length) return toast(`최근 답변 ${replies.length}개에서 되풀이된 표현을 찾지 못했습니다.`);
  const boxes = found.map(() => h('input', { type: 'checkbox' }));
  modal({ title: '말버릇 찾기', body: h('div.mm-dlg',
    h('p.hint', `최근 AI 답변 ${replies.length}개에서 여러 답변에 나온 표현입니다. 체크한 표현을 삼갈 표현에 넣습니다. `, h('b', '캐릭터 고유의 말투는 체크하지 마세요'), ' — 남긴 말과 회상에서도 빠집니다.'),
    h('div.mm-rows.mm-scrolly', found.map((f, i) => h('label.check.mm-row.mm-rep', boxes[i], h('i'), h('span.mm-row-text', f.phrase), h('small', `답변 ${f.count}개`))))),
  actions: [{ label: '닫기' }, { label: '삼갈 표현에 넣기', cls: 'primary', onclick: () => {
    const picked = found.filter((f, i) => boxes[i].checked).map(f => f.phrase); if (!picked.length) return;
    const m = ensureCfg(); m.bannedPhrases = [String(m.bannedPhrases || '').trim(), ...picked].filter(Boolean).join('\n').slice(0, 4000);
    saveCfg(); reinject(st.chat); onDone?.(m.bannedPhrases); toast(`${picked.length}개 표현을 삼갈 표현에 넣었습니다.`, 'ok');
  } }] });
}

// ════════ 막간 분류 ════════
/** 빠른 답장 · 명령어로 들어온 메시지를 막간/이야기로 직접 고른다 */
function openSideSorter(st) {
  const { chat, mem, msgs } = st; if (!chat || !mem) return toast('열린 대화가 없습니다.');
  const isSide = m => Memory.isSideMessage ? Memory.isSideMessage(m) : m.memSide === true, found = [];
  msgs.forEach((m, i) => {
    if (!m) return;
    const slash = m.role === 'system', tagged = typeof m.memSide === 'boolean', pause = m.role === 'user' && isPauseMessage(msgText(m));   // 명령어(/sys 등)로 들어온 서술 · 이미 고른 것 · "롤플을 멈춰라" 지시
    if (!slash && !tagged && !pause) return;
    found.push({ i, m, side: tagged ? m.memSide : (pause || isSide(m)), guess: !tagged });
  });
  if (!found.length) return toast('명령어로 들어온 메시지가 없습니다.');
  const jump = f => { if (isCur(chat) && route.page === 'chat') chatApi.scrollTo(f.m.id); else toast(`#${f.i + 1} 메시지는 지금 화면에 불러와져 있지 않아요.`); };
  const picks = found.map(f => h('select.inp.auto', [['story', '이야기'], ['side', '막간']].map(([v, l]) => h('option', { value: v, selected: (v === 'side') === !!f.side }, l))));
  modal({ title: '막간 분류', wide: true, body: h('div.mm-dlg',
    h('p.hint', '막간은 기억·회상·점검에서 빠집니다. 흐리게 보이는 줄은 아직 고르지 않은 추정입니다.'),
    h('div.mm-rows.mm-scrolly', found.map((f, i) => h(`div.mm-row${f.guess ? '.guess' : ''}`, h('button.mm-jump', { type: 'button', onclick: () => jump(f) }, `#${f.i + 1}`),
      h('span.mm-row-text', h('b', f.m.name || (f.m.role === 'user' ? '나' : '')), ' ', (visibleProse(msgText(f.m)) || msgText(f.m)).replace(/\s+/g, ' ').trim().slice(0, 90)), picks[i])))),
  actions: [{ label: '닫기' }, { label: '저장', cls: 'primary', onclick: async () => {
    let toSide = 0; const toStory = [];
    found.forEach((f, i) => {
      const m = f.m, side = picks[i].value === 'side', was = isSide(m);
      m.memSide = side;
      if (m.role === 'user' || side === was) return;
      if (side) { Memory.dropTurn(mem, m.id); toSide++; }   // 이미 기록된 막간은 그 턴의 기억째로 걷어 낸다
      else if (Memory.cfg().auto && m.role === 'assistant') toStory.push(m);
    });
    await persistMsgs(chat, msgs); Memory.reconcile(mem, msgs); await Memory.save(mem);
    for (const m of toStory) Promise.resolve(Memory.commit(chat, msgs, m)).catch(e => console.warn('[장기기억]', e));   // 기록 지연은 commit 이 스스로 따진다
    reinject(chat); st.draw();
    toast(`분류를 저장했습니다.${toSide ? ` 막간 ${toSide}개를 기억에서 뺐어요.` : ''}${toStory.length ? ` 이야기 ${toStory.length}개를 기록합니다.` : ''}`, 'ok');
  } }] });
}

// ════════ 기억 · 서술 방식 ════════
const SHARED = ['', PUBLIC_ONLY, NARRATOR];
const hasLocal = mem => !mem ? false : Memory.hasChatPerspective ? !!Memory.hasChatPerspective(mem) : typeof mem.perspective === 'string';
async function setPersp(st, value, local) {
  if (typeof value !== 'string' || (!local && !SHARED.includes(value))) throw new Error('기억·서술 방식의 선택을 확인해 주세요.');
  if (local && !(st.chat && st.mem)) throw new Error('대화를 먼저 열어 주세요.');
  if (Memory.setPerspectivePreference) await Memory.setPerspectivePreference(st.mem, value, local);
  else { if (!local) { ensureCfg().perspective = value; saveCfg(); } if (st.mem) { if (local) st.mem.perspective = value; else delete st.mem.perspective; await Memory.save(st.mem); } }
  if (st.chat) Memory.override(st.chat.id, null); st.draft = null;   // 고쳐 둔 장부 · 초안은 새 방식과 맞지 않는다
}
function perspBox(st) {
  const m = ensureCfg(), chat = st.chat, mem = st.mem, local = hasLocal(mem), pv = mem ? Memory.perspective(mem) : (m.perspective || ''), group = (chat?.charIds || []).length > 1, lead = S.get('chars', chat?.charIds?.[0])?.name || '';
  const opts = [['', group ? '자동 · 그룹은 공개 기억만' : `자동 · ${lead || '현재 캐릭터'}`], [PUBLIC_ONLY, '공개 기억만'], [NARRATOR, '소설·풀사칭 (모든 인물 참고)']];
  if (local) { const names = new Set(mem.cast.filter(c => !c.disabled).map(c => c.name)); if (lead && !group) names.add(lead); if (mem.perspective && !SHARED.includes(mem.perspective)) names.add(mem.perspective); for (const n of names) opts.push([n, n]); }
  const run = fn => fn().catch(e => toast(e.message || String(e), 'err')).finally(() => st.draw());
  let help = pv === NARRATOR ? 'AI가 내 캐릭터까지 함께 쓰며 소설처럼 이어가는 대화용입니다. 모든 인물의 기억·속마음을 참고하되, 각 인물이 모르는 비밀은 그 인물에게 넘기지 않습니다. 내 답변 없이 이어갈 때는 최신 AI 본문으로 기억을 찾고, 직접 답변하면 그 내용을 우선합니다.'
    : pv === PUBLIC_ONLY ? '공개된 기억만 꺼냅니다. AI가 내 캐릭터의 행동·감정을 대신 쓰지 않도록 하는 기존 지침을 유지합니다.'
      : pv ? `${pv} 기준으로 공개 기억과 그 인물이 아는 비공개 기억을 꺼냅니다. 비공개 기억은 속뜻과 분위기에만 참고하며, 내 캐릭터는 내가 조종하는 기존 방식을 유지합니다.`
        : group ? '기존 대화 방식입니다. 그룹에서는 공개 기억만 꺼내고, 내 캐릭터는 내가 조종하도록 합니다. AI가 여러 인물을 함께 쓰는 소설형 진행은 위에서 소설·풀사칭을 직접 선택하세요.'
          : `기존 대화 방식입니다. ${lead || '상대 캐릭터'} 기준으로 기억을 꺼내고, 내 캐릭터는 내가 조종하도록 합니다. AI가 내 역할까지 쓰는 소설형 진행은 위에서 소설·풀사칭을 직접 선택하세요.`;
  if (m.authorizePrivate === false && pv !== PUBLIC_ONLY) help += ' 현재 비공개 기억 허용이 꺼져 있어 공개 기억만 참고합니다.';
  const pick = h('select.inp', { 'aria-label': '기억·서술 방식', onchange: e => run(() => setPersp(st, String(e.target.value || ''), local)) }, opts.map(([v, l]) => h('option', { value: v, selected: v === pv }, l)));
  const loc = h('label.check.mm-opt', h('input', { type: 'checkbox', checked: local, disabled: !(chat && mem), onchange: e => { const on = e.target.checked; run(() => setPersp(st, on ? pv : (SHARED.includes(m.perspective) ? m.perspective : ''), on)); } }), h('i'),
    h('span.mm-opt-text', h('b', '이 대화만 따로 설정'), h('small', '다른 방식이나 특정 인물 시점을 이 대화에서만 사용할 때 켜세요.')));
  return h('div.mm-persp.mm-optset', h('label.field', h('span.field-label', local ? '이 대화의 기억·서술 방식' : '기본 기억·서술 방식'), pick), loc,
    h('small.hint', local ? '이 대화만 별도로 사용합니다. 체크를 끄면 다른 대화와 같은 기본 방식으로 돌아갑니다.' : '기본 방식으로 저장됩니다. 다른 봇·대화로 이동하거나 새로고침해도 유지되며, 따로 설정한 대화만 예외입니다.'),
    h('small.hint', help), h('small.hint', '원문·요약에 이미 나온 비밀까지 가리지는 않습니다. 장부를 직접 고정했다면 고정을 해제해야 새 방식이 적용됩니다.'));
}

// ════════ 프롬프트 ════════
const PROMPT_LABELS = { archivist: '사서', supervisor: '장면 연출', chunk: '요약', arc: '연대기' };
const pKey = k => k === 'archivist' ? 'prompt' : `prompts.${k}`;   // 빈 문자열 = 기본값
const pDef = k => Memory.promptDefault?.(k) ?? PROMPTS[k];
const pOutdated = () => Memory.promptOutdated ? Memory.promptOutdated() : Object.keys(ensureCfg().promptOutdated || {}).filter(k => get(pKey(k)) && get(pKey(k)) !== pDef(k));
function promptEdit(st, k, label, rows) {
  const def = pDef(k), mine = () => String(get(pKey(k)) || ''), ta = h('textarea.inp.mm-prompt', { rows, spellcheck: false, value: mine() || def }), tok = h('span.tokbadge'), mark = h('em.badge.on', '고침');
  const show = () => { mark.hidden = !mine(); tok.textContent = `≈${tokens(mine() || def).toLocaleString()} 토큰`; };
  const set = () => { const v = String(ta.value); put(pKey(k))(v === def || !v.trim() ? '' : v); saveCfg(); show(); };
  ta.addEventListener('change', set); ta.addEventListener('input', debounce(set, 400)); show();
  return h('details.mm-details.mm-optset', h('summary', label, mark), ta, h('div.row', btn('기본값', { ic: 'refresh', cls: 'ghost', onclick: () => {
    if (Memory.resetPrompt) Memory.resetPrompt(k); else { put(pKey(k))(''); const o = ensureCfg().promptOutdated; if (o) delete o[k]; saveCfg(); }
    toast('기본 프롬프트로 복원했습니다.', 'ok'); st.draw();
  } }), tok));
}

// ════════ 설정 탭 ════════
const shown = new Set();   // 설정 탭을 그린 적 있는 화면들 — 대화를 열어 세트가 바뀌면 다시 그린다
export function vConfig(st) {
  const m = ensureCfg(), chat = st.chat, mem = st.mem, re = () => reinject(chat), hadFocus = st.cfgSearch && document.activeElement === st.cfgSearch;
  const conns = [['', '대화에 쓰는 연결 사용'], ...S.conns.map(c => [c.id, `${c.name}${c.model ? ' · ' + c.model : ''}`])];
  const langs = [...Object.entries(LANGS), ...(LANGS[m.language] || !m.language ? [] : [[m.language, m.language]])];
  const prog = h('span.mm-progress'), outdated = pOutdated();
  const banned = h('textarea.inp', { rows: 3, value: m.bannedPhrases || '', placeholder: '한 줄에 하나, 또는 쉼표로 구분 — 예: 나지막이, 입꼬리가 미세하게', spellcheck: false, onchange: e => { ensureCfg().bannedPhrases = String(e.target.value || '').slice(0, 4000); saveCfg(); re(); } });
  const root = h('div.mm-view.mm-cfg',
    h('div.mm-cfg-tools', searchBox(st), bundleBar(st)),

    sec('기본', null, null, grid(
      tog('enabled', '장기기억 사용', '끄면 기록과 주입이 모두 중단됩니다.', () => st.head()),
      tog('auto', '자동 기록', 'AI 응답이 끝날 때마다 자동으로 턴을 기록합니다. 끄면 [지금 기록]으로 수동 기록.'),
      tog('supervisor', '장면 연출 (실험적)', '답변이 끝난 뒤 연출 LLM이 다음 장면의 목표·피해야 할 전개를 짧게 계획해 다음 답변에 함께 주입합니다 (추가 호출 1회). 응답 시작은 늦어지지 않습니다.'),
      tog('authorizePrivate', '캐릭터 비공개 기억 허용', '아래에서 선택한 범위의 속마음·비밀도 참고합니다. 끄면 소설·풀사칭을 포함한 모든 방식에서 공개 기억만 검색합니다.', () => st.draw()),
      perspBox(st),
      tog('associative', '연결 회상', '직접 찾은 기억의 드문 공통 단서로 관련 기억을 최대 2개 더 후보에 올립니다. 전체 회상 수와 토큰 예산은 유지하며, 비밀 경계는 넘지 않습니다. 추가 API 호출은 없습니다.'),
      tog('autoHide', '요약된 메시지 자동 숨김', ['"지금까지의 이야기" 요약이 커버한 옛 메시지를 대화에서 ', h('b', '숨김'), ' 처리해 컨텍스트 토큰을 절약합니다. 삭제가 아니라 숨김이며, 도구 탭의 "숨긴 메시지 모두 표시"로 되돌릴 수 있습니다. 최근 메시지는 아래 설정만큼 항상 남깁니다.'],
        async on => { if (!on) return; if (chat && mem) { const n = Memory.autoHide(chat, st.msgs); if (n) await persistMsgs(chat, st.msgs); } toast('요약이 커버한 옛 메시지를 숨겼습니다. 도구 탭에서 언제든 해제할 수 있습니다.'); }),
      tog('refProfile', '카드·페르소나 참고', '사서·요약이 캐릭터 카드와 페르소나 요지를 배경 자료로 참고합니다. 이름·설정 오해가 줄어듭니다.'),
      tog('refLore', '로어북 참고', '활성 로어북을 배경 자료로 참고합니다. 로어북이 크면 사서 호출 토큰이 늘어납니다.'),
      tog('audit', '회상 적중 학습', '실린 기억이 답변에 실제로 반영됐는지 보고 중요도를 아주 조금씩 올리거나 내립니다. 고정·수동 기억은 건드리지 않습니다.'),
      tog('trim', '기록이 끝난 옛 대화는 보내지 않기', '메시지를 숨기지 않고, 보낼 때만 아래 「보낼 최근 메시지 수」만큼 자릅니다.'),
      sel('language', '요약 언어', '요약·기억이 기록될 언어', langs),
      num('summaryContextCount', '이전 요약 참조 수', '새 요약을 만들 때 참조할 이전 요약 수 (0 = 안 함, -1 = 전체)', -1, 50, 1),
      num('preserveRecent', '최근 메시지 보존 수', '자동 숨김을 켰을 때 숨기지 않고 원문 그대로 남길 최근 메시지 수', 1, 500, 1),
      num('recordDelay', '기록 지연 (턴 수)', '응답 뒤로 이야기가 N턴 더 진행된 뒤에야 기록합니다 (0 = 바로)', 0, 20, 1),
      num('keepRecent', '보낼 최근 메시지 수', '「기록이 끝난 옛 대화는 보내지 않기」를 켰을 때 AI에게 보낼 최근 메시지 수', 2, 2000, 1)),
      note(h('b', '최근 메시지 보존 수'), '는 "자동 숨김"을 켰을 때만 쓰입니다. 요약은 이 값과 상관없이 요약 주기마다 만들어지고, 옛 메시지는 숨겨져 요약이 대신하며, 최근 N개 메시지는 원문 그대로 남습니다. 이때 ', h('b', '원문으로 남아 있는 구간만 다루는 요약은 주입하지 않아'), ' 같은 내용이 두 번 들어가지 않습니다.', h('br'),
        h('b', '기록 지연'), '이 0이면 응답이 오자마자 기록합니다. 1 이상이면 그 응답 뒤로 ', h('b', '이야기가 N턴 더 진행된 뒤에야'), ' 기록해서, 리롤·분석 QR·지운 메시지에 사서 호출을 쓰지 않습니다. 한 턴은 내 답장 또는 새 응답 중 많은 쪽으로 세므로, ', h('b', '인풋 없이 전개지시·풀사칭으로만 진행해도'), ' 정상 동작합니다. 새 대화의 ', h('b', '그리팅'), '은 이 값과 상관없이 이야기가 한 턴 진행된 뒤에 기록합니다.')),

    sec('추적 도감', '켜면 사서가 대화에서 자동으로 골라내 도감에 기록하고, 매 턴 주입에 포함합니다.', null, grid(
      tog('cast', '인물 도감', '새 인물의 프로필과 인물 간 관계를 자동 기록합니다. (세계 탭에서 관리)'),
      tog('lockEdited', '직접 고친 인물 프로필 자동 고정', '인물 카드를 직접 수정하면 자동으로 고정됩니다. 고정된 카드는 사서가 이름·나이·직업·외모·말투·특성을 바꾸지 못하고, 관계만 계속 갱신됩니다. (세계 탭에서 카드별로 직접 잠그거나 풀 수 있습니다)'),
      tog('milestones', '이벤트 연표', '고백·정체 폭로·죽음·되돌릴 수 없는 선택 등 결정적 전환점만 연표로 기록합니다. (이야기 탭에서 관리)'),
      tog('items', '아이템 도감', '의미 있는 선물·전개상 중요한 물건의 소유자와 상태를 추적합니다. (세계 탭에서 관리)'),
      tog('storyClock', '서사 시계', '"다음 날 아침", "3년 뒤" 같은 이야기 속 경과 시간을 추적합니다. 시간이 크게 흐르면 그 이전 기억은 자연스럽게 옛일로 물러나고, 회상에도 "~3mo ago"처럼 얼마나 옛일인지 표기됩니다.'))),

    sec('모델 (사서 API)', '기억 기록·요약을 담당하는 사서가 쓸 API입니다. 저렴하고 빠른 모델을 권장합니다.',
      btn('테스트', { ic: 'plug', cls: 'ghost', title: '연결 테스트', onclick: e => { const b = e.currentTarget; toast('연결을 테스트합니다…'); busyBtn(b, async () => {
        try { const r = await Memory.call(chat || { charIds: [] }, 'You are a connection test. Reply with exactly: OK', 'ping', 2048);   // 생각하는 모델은 대답 전에 사고 토큰을 쓰므로 넉넉히 준다
          if (String(r).trim()) toast(`연결 성공 — 응답: ${String(r).replace(/\s+/g, ' ').trim().slice(0, 60)}`, 'ok'); else toast('응답이 비어 있습니다. 모델 설정을 확인하세요.'); }
        catch (err) { toast(`연결 실패: ${err.cause?.message || err.message}`, 'err'); } }); } }),
      grid(
        sel('@helpers.memory', '사서에 쓸 연결', '기억 기록·요약 호출을 보낼 연결. 주소·키·모델은 연결 화면에서 관리합니다', conns),
        num('responseTokens', '사서 최대 토큰', '사서 응답의 최대 토큰. 요약·기록이 중간에 잘리지 않도록 넉넉하게 잡으세요 (기본 24000)', 256, 65536, 512),
        num('reasoningHeadroom', '사고 토큰 여유분', "추론 모델은 '생각'에 쓴 토큰도 출력 상한을 함께 먹습니다. 이 값만큼 여유를 얹어 응답이 잘리지 않게 합니다.", 0, 32768, 1000)),
      note('Gemini Thinking·GPT o 시리즈처럼 ', h('b', '생각하는 모델'), '을 사서로 쓰면, 사고에 쓴 토큰이 출력 상한을 함께 먹어 응답이 중간에 잘립니다(', h('code', 'finishReason: MAX_TOKENS'), '). 서고 정리·요약이 "모델 응답 오류"로 실패한다면 이 값을 12000~16000으로 올려 보세요. 상한일 뿐이라 실제로 쓴 만큼만 과금됩니다. 생각하지 않는 모델을 쓴다면 0으로 둬도 됩니다. (기본 8000)')),

    sec('의미 검색 임베딩 (선택)', '임베딩을 켜면 회상 정확도가 크게 올라갑니다. 동의어·의역도 잡아냅니다. 실패 시 자동으로 내장 검색으로 폴백합니다.', null, grid(
      sel('embed.mode', '임베딩 소스', null, [['off', '끄기 — 내장 검색만 사용'], ['api', '외부 임베딩 API']], { cls: m.embed.mode === 'api' ? 'half' : 'third', after: () => st.draw() }),
      m.embed.mode === 'api' && sel('embed.connId', '임베딩에 쓸 연결', '이 연결의 주소와 키를 빌려 씁니다 (임베딩 주소는 방식에 맞게 자동으로 붙입니다)', [['', '골라 주세요'], ...S.conns.map(c => [c.id, c.name])], { cls: 'half' }),
      m.embed.mode === 'api' && sel('embed.kind', '임베딩 방식', '연결이 어떤 임베딩 주소를 쓰는지. 자동이면 연결의 종류를 보고 고릅니다', Object.entries(EMBED_KINDS), { cls: 'half' }),
      m.embed.mode === 'api' && txt('embed.model', '모델', null, 'text-embedding-3-small', { cls: 'half' }),
      m.embed.mode === 'api' && (() => { const f = num('embed.floor', '유사도 바닥값', "이 코사인 값 아래는 '무관'으로 보고 버립니다. 임베딩 모델마다 점수 분포가 달라, 회상이 잘 안 되면 낮춰 보세요.", 0, 0.9, 0.05, { cls: 'half', int: false }); f.append(h('small.hint', 'OpenAI 계열은 0.35~0.5, bge·e5 계열처럼 점수가 낮게 깔리는 모델은 0.2~0.3이 적당합니다. 회상이 안 되면 낮추고, 엉뚱한 기억이 딸려오면 올리세요. (기본 0.35)')); return f; })()),
      m.embed.mode === 'api' && h('div.row.wrap',
        btn('테스트', { ic: 'plug', cls: 'ghost', title: '연결 테스트', onclick: e => busyBtn(e.currentTarget, async () => { const v = await Memory.embedCall(['connection test']); if (v?.[0]?.length) toast(`임베딩 연결 성공 (${v[0].length}차원)`, 'ok'); else toast('임베딩 응답이 비어 있습니다. 연결/모델을 확인하세요.', 'err'); }) }),
        btn('재계산', { ic: 'refresh', cls: 'ghost', title: '기존 기억 전체에 API 임베딩을 다시 계산합니다. 새 기억은 자동으로 계산됩니다.', onclick: e => busyBtn(e.currentTarget, async () => {
          if (!chat || !mem) return toast('열린 대화가 없습니다.'); if (!mem.memories.length) return toast('기억이 없습니다.');
          const n = await Memory.embedMemories(chat, mem, { all: true, onProgress: (d, t) => { prog.textContent = `${d}/${t}`; } }); await Memory.embedQuery(chat, st.msgs).catch(() => { });
          toast(`기억 ${n}개의 임베딩을 재계산했습니다.`, 'ok'); setTimeout(() => { prog.textContent = ''; }, 4000); }) }), prog)),

    sec('주입 · 검색', null, null, grid(
      num('tokenBudget', '주입 토큰 예산', '주입되는 장기기억이 차지할 수 있는 최대 토큰', 200, 24000, 100),
      sel('position', '주입 위치', '장기기억 장부를 프롬프트 어디에 넣을지', [...(m.position === 'split' || MEMORY_DEFAULTS.position === 'split' ? [['split', '나눠 싣기 (줄거리는 앞, 지금 장면은 대화 안)']] : []), ['chat', '대화 내 (깊이 적용)'], ['before', '메인 프롬프트 앞']]),
      num('depth', '주입 깊이', '대화 내 주입 깊이 (0 = 마지막 메시지 바로 앞). 대화 길이보다 큰 값이면 대화 기록의 맨 앞에 들어갑니다.', 0, 10000, 1),
      num('topK', '회상 개수', '한 턴에 회상할 기억 수', 1, 30, 1),
      num('chunkTurns', '요약 주기(턴)', '몇 턴마다 자동 요약할지', 3, 40, 1),
      num('maxMemories', '최대 기억 수', '초과 시 중요도 낮은 오래된 기억부터 정리 (고정/수동 제외)', 50, 2000, 50),
      num('consolidateEvery', '서고 정리 주기(턴)', 'N턴마다 사서가 서고를 훑어 중복 기억 병합·소음 제거·중요도 재조정을 합니다. 0 = 끔. 고정·수동 기억은 건드리지 않습니다. 이때 청크들도 같은 사건끼리 재그룹핑돼 아크로 병합됩니다.', 0, 200, 5),
      num('arcConsolidateEvery', '아크 정리 주기(턴)', 'N턴마다 이미 만들어진 아크들끼리만 재검토해서, 정말 같은 사건인데 타이밍상 우연히 갈라진 것만 다시 합칩니다. 0 = 끔. 청크 재그룹핑(서고 정리)과는 완전히 별개로, 훨씬 보수적으로 병합합니다.', 0, 500, 10)),
      h('details.mm-details.mm-optset', h('summary', '고급 — 회상 점수 · 떡밥 · 연대기'), grid(
        num('minScore', '불러올 최소 점수', '이 점수에 못 미치는 기억은 회상하지 않습니다', 0, 1, 0.01, { int: false }),
        num('minCosine', '최소 유사도', '내장 검색의 코사인 유사도 바닥값', 0, 1, 0.01, { int: false }),
        num('mmrLambda', '다양성 (MMR λ)', '1에 가까울수록 점수 순, 낮을수록 서로 다른 기억을 고릅니다', 0, 1, 0.01, { int: false }),
        num('maxPerKind', '종류당 회상 수', '한 종류의 기억이 회상을 독차지하지 않게 하는 상한', 1, 30, 1),
        num('maxPerTurn', '턴당 회상 수', '한 턴에서 나온 기억이 회상을 독차지하지 않게 하는 상한', 1, 30, 1),
        num('arcMergeAt', '청크 안전 상한', '서고 정리를 못 기다릴 만큼 청크가 이 개수 넘게 쌓이면 즉시 재그룹핑합니다', 3, 40, 1),
        num('threadSleepTurns', '떡밥 잠재우기(턴)', '이 턴 수 동안 진전 없는 떡밥은 잠재웁니다 (서고에는 남고, 다시 언급되면 깨어납니다. 0 = 끔)', 0, 1000, 1),
        num('eraKeep', '연대기 보관 수', "연대기를 이 개수까지만 따로 두고, 넘치면 가장 오래된 것부터 하나의 '옛 이야기'로 접습니다 (최소 3)", 3, 50, 1),
        typeof m.fossil === 'number' && num('fossil', '옛일로 물러나는 턴 수', '이 턴 수가 지난 기억은 회상에서 옛일로 물러납니다', 5, 1000, 1))),
      note(h('b', '주입 깊이'), '는 주입 위치가 "대화 내"일 때만 쓰입니다. 0이면 마지막 메시지 바로 앞, 숫자가 클수록 위쪽입니다. ', h('b', '대화 전체보다 앞'), '에 두고 싶으면 9999처럼 대화 길이보다 큰 값을 넣으세요 — 가장 오래된 메시지 위에 들어갑니다 (최대 10000). 캐릭터 카드·시스템 프롬프트보다도 앞에 두려면 주입 위치를 "메인 프롬프트 앞"으로 바꾸세요.')),

    sec('상태창 · 막간 · 점검', null, null, grid(
      sel('statusMode', '상태창 읽기', '답변에 붙는 상태창(시간·날짜·장소·날씨)을 모델을 부르지 않고 그대로 읽어 둡니다', [['auto', '자동으로 찾기'], ['custom', '직접 정한 모양'], ['off', '쓰지 않기']], { after: () => { re(); st.draw(); } }),
      m.statusMode === 'custom' && txt('statusPattern', '상태창 모양 (정규식)', '정규식. 괄호 ( )로 묶은 부분을 상태창 내용으로 읽습니다', '예: <<(.+?)>>', { after: re, check: v => { try { new RegExp(v); } catch { toast('정규식을 읽을 수 없습니다.', 'err'); return false; } } }),
      sel('qrMode', 'QR 메시지', '빠른 답장(QR)·명령어로 대화에 들어온 메시지를 기억에서 뺄지', [['side', '코멘트·막간만 빼기'], ['all', '전부 빼기'], ['keep', '빼지 않기']], { after: re, cls: 'half',
        extra: tb('분류', 'shuffle', '막간 분류 — 명령어로 들어온 메시지를 모아 막간/이야기로 직접 고릅니다', e => { e.preventDefault(); openSideSorter(st); }) }),
      tog('statusInject', '마지막 상태창 알려주기', '옛 답변이 숨겨지거나 막간이 끼어도 시간·날짜·장소가 이어집니다.', re),
      tog('replyCheck', '연속성 검사', '새 답변이 기록·최근 대화와 어긋나면 이름 옆에 ⚠를 붙입니다. 답변마다 사서 API를 한 번 더 씁니다.')),
      note('막간은 롤플을 멈추고 뽑은 퀴즈·인터뷰·운세 같은 QR 결과입니다. 지시문에 "롤플·시나리오를 멈춰라"는 문구가 있으면 자동으로 알아보고, 기록·회상·점검에서 뺍니다.')),

    sec('인물과 말투', '요약은 서술자 말투로 쓰이고 옛 원문은 숨겨집니다. 그래서 대화가 길어질수록 캐릭터의 말투가 흐려지고, 묵은 말투와 말버릇이 되살아납니다. 아래 설정이 그걸 막습니다.', null, grid(
      tog('styleGuard', '장부는 사실 확인용', '장부를 넣을 때 "장부에서는 사실만 확인하고, 문체는 지금 대화를 따르고, 옛 표현을 그대로 쓰지 말 것 · 인물의 성격과 말투는 바탕을 따르고 관계는 관계선의 단계를 지킬 것"을 함께 알려줍니다.', re),
      tog('recallQuotes', '회상에 옛 원문 대사 싣기', '끄면 회상에 요약만 싣고 옛 대사 인용은 넣지 않습니다. 옛 말투가 자꾸 돌아오면 꺼 보세요.', re),
      num('voiceSamples', '장면 인물 남긴 말 수', '지금 장면에 있는 인물마다, 그 인물이 실제로 했던 대사를 몇 줄씩 말투 견본으로 실을지 (0 = 싣지 않음). 원문에 그대로 있는 대사만 모읍니다.', 0, 4, 1, { after: re }),
      h('div.mm-block.mm-optset', h('b', '삼갈 표현 · 반복 표현'), banned,
        h('div.row.wrap', tb('말버릇', 'repeat', '말버릇 찾기', () => { if (!chat) return toast('열린 대화가 없습니다.'); openRepeatFinder(st, v => { banned.value = v; }); })),
        h('small.hint', '적어 둔 표현은 장기기억이 넣는 장부(기억·회상·요약·남긴 말)에서 빠집니다. 삼갈 표현이 든 옛 대사는 인용째로 뺍니다. ', h('b', '캐릭터가 꼭 쓰는 말은 넣지 마세요.'))),
      tog('banInChat', 'AI에게 보내는 최근 대화에서도 빼기', 'AI가 자기 최근 답변을 보고 같은 말을 또 쓰는 고리를 끊습니다. 저장된 대화는 그대로이고, 이어쓰기할 때 이어 쓰는 마지막 답변은 건드리지 않습니다.'),
      tog('banTell', 'AI에게 삼갈 표현 목록 알려주기', '"이 표현은 쓰지 마"라고 직접 알려줍니다. 모델에 따라 오히려 그 단어를 떠올리게 할 수 있어 기본은 꺼 둡니다.', re))),

    sec('답변 속도 · 캐시', '장기기억 때문에 답변이 늦어지지 않게 합니다. 답변 생성이 언제나 먼저입니다.', null, grid(
      num('recallWaitSec', '답변 전 최대 대기(초)', '답변을 생성하기 전, 회상을 위한 임베딩 응답을 최대 몇 초 기다릴지. 넘으면 내장 검색 결과만으로 바로 생성합니다. 0 = 제한 없음', 0, 60, 1, { cls: 'half' }),
      num('stableRefreshTurns', '고정 장부 새로 뜨는 주기(턴)', '고정 장부를 이 턴 수마다 새로 뜹니다. 0 = 달라진 줄이 넘치거나 항목이 지워졌을 때만', 0, 200, 1, { cls: 'half' }),
      tog('yieldToChat', '답변 먼저', '답변을 생성하는 동안에는 사서·요약 호출을 새로 시작하지 않고, 답변이 온 뒤에 이어서 합니다. API나 프록시가 요청을 한 번에 하나씩만 받을 때 답변이 줄 서서 기다리는 일을 막습니다.'),
      tog('watchUpdates', '다른 기능이 고친 메시지도 다시 기록', '답변을 다시 쓰거나 번역·그림을 끼워 넣는 기능이 메시지를 고쳤을 때, 본문이 실제로 바뀐 경우에만 그 턴을 다시 기록합니다. 화면만 다시 그린 경우에는 아무것도 하지 않습니다.'),
      tog('splitInjection', '고정 장부 (프롬프트 캐시 아끼기)', ['장부 가운데 잘 안 바뀌는 부분(캐논·인물·관계선·요약·서약)은 한 번 떠서 프롬프트 앞쪽에 그대로 두고, 매 턴 바뀌는 것(회상·지금 장면·상태·그 뒤 달라진 줄)만 최근 대화 옆에 따로 넣습니다. 프롬프트 앞부분이 매 턴 같아져 캐시를 지원하는 모델에서 비용과 지연이 줄어듭니다. 고정 장부를 새로 뜨는 턴에는 캐시가 한 번 새로 잡히므로, ', h('b', '주입 위치가 "메인 프롬프트 앞"이거나 자동 숨김을 함께 쓸 때'), ' 가장 이득이 큽니다.'], re))),

    sec('프롬프트', '각 역할의 시스템 프롬프트를 수정할 수 있습니다.', null,
      outdated.length ? h('p.mm-banner', ico('bell', 15), h('span', '새 기본 프롬프트가 나왔습니다: ', h('b', outdated.map(k => PROMPT_LABELS[k] || k).join(', ')), '. 직접 고친 프롬프트라 자동으로 바꾸지 않았어요. 새 기본값을 받으려면 해당 칸의 [기본값]을 누르세요 (지금 내용은 사라지니 필요하면 먼저 복사해 두세요).')) : null,
      promptEdit(st, 'archivist', '사서 (턴 → 구조화 기억)', 10), promptEdit(st, 'supervisor', '장면 연출', 8), promptEdit(st, 'chunk', '요약 (청크)', 5), promptEdit(st, 'arc', '연대기 병합', 5)));
  st.cfgRoot = root; shown.add(st); applySearch(root, st.cfgSearch?.value || '');
  if (hadFocus) setTimeout(() => st.cfgSearch.focus());
  return root;
}

// ════════ 이벤트 ════════
// 대화를 열면 그 대화(→ 캐릭터)에 붙인 세트로 설정을 갈아 끼운다. 갈아 끼우는 일 자체는 엔진(Memory.applyBundleForChat)이 맡는다
on('chat:open', async chat => {
  try { ensureCfg(); if (!(await Memory.applyBundleForChat?.(chat))) return; } catch (e) { return console.warn('[장기기억]', e); }
  for (const st of shown) { if (!st.host?.isConnected) { shown.delete(st); continue; } if (st.tab === 'config') st.draw(); }
});
