// ── Dreamland editors: 홈(캐릭터) · 로어북 · 프리셋 · 페르소나 · 정규식 · API · 설정 ──
import { Vault, S, DB, h, uid, now, on, emit, download, pickFiles, debounce, fmtTime, newChar, newPersona, newLore, newEntry, newRegex, newConn, defaultPreset, defaultSettings, MARKERS, msgText, Secrets } from './core.js';
import { TALK_DEFAULT, tokens, PROVIDERS, listModels, streamChat, applyRegex, compileRegex, CONTINUE_NUDGE, IMPERSONATE_NUDGE, GROUP_NUDGE, parseServiceAccount } from './engine.js';
import { icon, btn, iconBtn, avatar, toast, modal, menu, confirmBox, promptBox, form, registerPage, go, refresh, libraryPage, route, pageHead, moonIcon, moonPhase, charPicker, dragSort, blankArt, inkName } from './ui.js';
import { tint } from './tone.js';
import { importFiles, summarize, charToCard, exportCharPng, worldToLore, loreToWorld, stPresetToPreset, stRegexToRegex, regexToSt } from './cards.js';
import { startChat, startMenu } from './chat.js';
import { applyTheme } from './theme.js';
import { Assets } from './assets.js';
import { assetsPane, TALK_PROMPT } from './studio.js';
import { X } from './hooks.js';
import { loreEditor, lorePicker, loreSettingsDialog, loreLinks, loreSwitch, loreLinker } from './f-lore.js';
import { presetVarsEditor } from './f-presetvars.js';
import { AF, KINDS, TEXT_PROVIDER_KINDS, tplList, tplCurrent, tplSave, tplDelete, tplApply, tplDirty, tplIsBuiltin, tplImport, masterExport, resolve, instructName } from './advanced.js';

const charTokens = c => tokens([c.description, c.personality, c.scenario, c.mesExample, c.systemPrompt, c.postHistory].join('\n'));
export async function importDialog(accept = '.png,.json,.jsonl,.webp') {
  const files = await pickFiles({ accept, multiple: true }); if (!files.length) return;
  const T = await importFiles(files);
  toast(summarize(T), T.errors.length ? 'err' : 'ok');
  if (T.errors.length) modal({ title: '가져오지 못한 파일', body: h('ul.errs', T.errors.map(e => h('li', e))) });
  refresh();
}

// ════════ 홈 ════════
let homeState = { q: '', sort: 'recent', tag: '', fav: false, pick: 0, folder: '' };   // folder: '' 전체 · '-' 폴더 없음 · 폴더 id

// ── 캐릭터 폴더: 폴더 목록은 설정에, 어느 폴더인지는 캐릭터의 folder 에 둔다 ──
const folders = () => (S.settings.folders ||= []);
const folderOf = c => folders().some(f => f.id === c.folder) ? c.folder : '';
const saveFolders = () => S.set({ folders: folders() });
async function newFolder(name) {
  const v = name ?? await promptBox('폴더 이름', '', { placeholder: '예: 판타지, 현대물, 친구가 준 카드' }); if (!v?.trim()) return null;
  const fo = { id: uid(), name: v.trim().slice(0, 40) }; folders().push(fo); await saveFolders(); return fo;
}
async function moveToFolder(ids, folderId) {
  for (const id of ids) { const c = S.get('chars', id); if (c && (c.folder || '') !== folderId) { c.folder = folderId; await S.save('chars', c, true); } }
}
/** 캐릭터 한 명을 담을 폴더 고르기 */
function folderMenu(anchor, c, after = () => { }) {
  const cur = folderOf(c);
  menu(anchor, [
    ...folders().map(fo => ({ label: fo.name, ic: cur === fo.id ? 'check' : 'folder', onclick: async () => { await moveToFolder([c.id], fo.id); after(); } })),
    cur ? { label: '폴더에서 꺼내기', ic: 'x', onclick: async () => { await moveToFolder([c.id], ''); after(); } } : null,
    folders().length ? '-' : null,
    { label: '새 폴더에 담기', ic: 'plus', onclick: async () => { const fo = await newFolder(); if (fo) { await moveToFolder([c.id], fo.id); after(); } } }]);
}
const firstLine = c => (c.creatorNotes || c.personality || c.scenario || c.description || '').replace(/<[^>]+>/g, ' ').replace(/[#*_>`]/g, '').split(/\n/).map(s => s.trim()).find(Boolean)?.slice(0, 80) || '';
const artStyle = c => c?.avatar ? { backgroundImage: `url("${c.avatar}")` } : {};
const phaseDate = i => new Date(Date.UTC(2000, 0, 6, 18, 14) + (i / 8 + 0.002) * 29.530588853 * 864e5);
registerPage('home', root => {
  const lastUse = new Map(); for (const c of S.chats) for (const id of c.charIds) lastUse.set(id, Math.max(lastUse.get(id) || 0, c.updatedAt));
  const ranked = [...S.chars].sort((a, b) => (lastUse.get(b.id) || b.createdAt) - (lastUse.get(a.id) || a.createdAt));
  const picks = ranked.slice(0, 5), now = new Date(), moon = moonPhase(now), cur = Math.round(moon.p * 8) % 8;

  // 오늘 밤: 달의 위상 + 최근에 만난 캐릭터를 아치 창으로
  const stage = h('div.dream');
  const drawStage = () => {
    const c = picks[homeState.pick % Math.max(1, picks.length)];
    tint(stage, c);
    const sky = h('div.dream-sky', h('div.moon-row', Array.from({ length: 8 }, (_, i) => h(`span${i === cur ? '.on' : ''}`, moonIcon(i === cur ? 22 : 15, phaseDate(i))))), h('small', `${now.toLocaleDateString('ko-KR', { month: 'long', day: 'numeric', weekday: 'long' })} · ${moon.name}`));
    if (!c) return stage.replaceChildren(h('div.dream-text', sky, h('h2.dream-name', '첫 꿈을 불러와요'), h('div.dream-actions', btn('이식 센터', { ic: 'folder', cls: 'primary', onclick: () => go('import') }), btn('카드 가져오기', { ic: 'import', onclick: () => importDialog() }), btn('API 연결', { ic: 'plug', onclick: () => go('conns') }))), h('div.dream-window', h('i.crescent'), h('i.halftone'), h('i.star.s1', '✦')));
    const last = S.chats.filter(x => x.charIds.includes(c.id)).sort((a, b) => b.updatedAt - a.updatedAt)[0];
    stage.replaceChildren(
      h('div.dream-text', sky,
        h('h2.dream-name', inkName(c.name)), firstLine(c) && h('p.dream-line', firstLine(c)),
        c.tags.length ? h('div.dream-tags', c.tags.slice(0, 4).map(t => h('span', '#' + t))) : null,
        h('div.dream-actions', last && btn('이어서', { ic: 'play', cls: 'primary', onclick: () => go('chat', last.id) }), btn('새 대화', { ic: 'chat', onclick: e => startMenu(e.currentTarget, [c.id]) }), btn('프로필', { ic: 'user', cls: 'ghost', onclick: () => charSheet(c) }))),
      h('div.dream-window', h('i.bigmoon', moonIcon(190, now)), h('i.halftone'), h('i.ellipse'), h('i.star.s1', '✦'), h('i.star.s2', '✧'), h('i.rule'),
        h('button.print.main', { style: artStyle(c), title: c.name, onclick: () => charSheet(c) }, blankArt(c)),
        c.avatar ? h('i.print.detail', { style: artStyle(c) }) : null,
        picks.length > 1 ? h('div.dots', picks.map((p, i) => h(`button${i === homeState.pick % picks.length ? '.on' : ''}`, { title: p.name, onclick: () => { homeState.pick = i; drawStage(); } }))) : null));
  };
  drawStage();

  const grid = h('div.arch-grid'), count = h('span.count', ''), shelf = h('div.folder-row');
  // 카드 크기: 크게(기본) → 보통 → 작게. 휴대폰에서는 한 줄에 2 · 3 · 4장
  const SIZES = [['', '크게'], ['cols-3', '보통'], ['cols-4', '작게']];
  const sizeBtn = h('button.btn.ghost.size-btn', { onclick: () => { S.set({ homeCols: ((S.settings.homeCols || 0) + 1) % SIZES.length }); applySize(); } });
  const applySize = () => { const i = Math.min(SIZES.length - 1, S.settings.homeCols || 0); grid.className = 'arch-grid' + (SIZES[i][0] ? ' ' + SIZES[i][0] : ''); sizeBtn.title = `카드 크기: ${SIZES[i][1]} (누르면 바뀝니다)`; sizeBtn.replaceChildren(icon('grip', 15), h('span', SIZES[i][1])); };
  applySize();
  if (homeState.folder && homeState.folder !== '-' && !folders().some(f => f.id === homeState.folder)) homeState.folder = '';
  const inFolder = c => !homeState.folder || (homeState.folder === '-' ? !folderOf(c) : folderOf(c) === homeState.folder);
  // 폴더 탭: 누르면 그 폴더만, 카드를 끌어다 놓으면 담긴다
  const drawShelf = () => {
    const fs = folders(); if (!fs.length) return shelf.replaceChildren(h('button.folder-tab.add', { title: '캐릭터를 묶어 둘 폴더를 만듭니다', onclick: async () => { const fo = await newFolder(); if (fo) { homeState.folder = fo.id; refresh(); } } }, icon('plus', 14), '폴더 만들기'));
    const n = id => S.chars.filter(c => (id === '-' ? !folderOf(c) : folderOf(c) === id)).length;
    const drop = id => ({ ondragover: e => { e.preventDefault(); e.currentTarget.classList.add('over'); }, ondragleave: e => e.currentTarget.classList.remove('over'),
      ondrop: async e => { e.preventDefault(); e.currentTarget.classList.remove('over'); const cid = e.dataTransfer.getData('text/dreamland-char'); if (cid) { await moveToFolder([cid], id === '-' ? '' : id); refresh(); } } });
    const tab = (id, name, extra = {}) => h(`button.folder-tab${homeState.folder === id ? '.on' : ''}`, { onclick: () => { homeState.folder = id; refresh(); }, ...extra }, h('span', name), h('em', String(id ? n(id) : S.chars.length)));
    shelf.replaceChildren(tab('', '전체'), ...fs.map(fo => tab(fo.id, fo.name, drop(fo.id))), tab('-', '폴더 없음', drop('-')),
      h('button.folder-tab.add', { title: '새 폴더', onclick: async () => { const fo = await newFolder(); if (fo) { homeState.folder = fo.id; refresh(); } } }, icon('plus', 14)));
  };
  const folderBar = () => {
    const fo = folders().find(f => f.id === homeState.folder); if (!fo) return null;
    return h('div.folder-bar', icon('folder', 16), h('b', fo.name),
      btn('캐릭터 담기', { ic: 'plus', cls: 'ghost', onclick: () => charPicker({ title: `"${fo.name}"에 담을 캐릭터`, selected: S.chars.filter(c => folderOf(c) === fo.id).map(c => c.id), note: c => { const o = folders().find(f => f.id === folderOf(c)); return o && o.id !== fo.id ? o.name : ''; },
        onDone: async ids => { const keep = new Set(ids); await moveToFolder(S.chars.filter(c => folderOf(c) === fo.id && !keep.has(c.id)).map(c => c.id), ''); await moveToFolder(ids, fo.id); refresh(); } }) }),
      iconBtn('more', '폴더 이름 · 삭제', e => menu(e.currentTarget, [
        { label: '이름 바꾸기', ic: 'edit', onclick: async () => { const v = await promptBox('폴더 이름', fo.name); if (v?.trim()) { fo.name = v.trim().slice(0, 40); await saveFolders(); refresh(); } } },
        { label: '왼쪽으로', ic: 'play', onclick: async () => { const a = folders(), i = a.indexOf(fo); if (i > 0) { [a[i - 1], a[i]] = [a[i], a[i - 1]]; await saveFolders(); refresh(); } } },
        { label: '오른쪽으로', ic: 'play', onclick: async () => { const a = folders(), i = a.indexOf(fo); if (i < a.length - 1) { [a[i + 1], a[i]] = [a[i], a[i + 1]]; await saveFolders(); refresh(); } } },
        '-',
        { label: '폴더 삭제', ic: 'trash', danger: true, hint: '캐릭터는 남아요', onclick: async () => { if (!(await confirmBox(`"${fo.name}" 폴더를 삭제할까요? 안에 있던 캐릭터는 지워지지 않고 폴더 없음으로 돌아갑니다.`, '삭제', true))) return; await moveToFolder(S.chars.filter(c => c.folder === fo.id).map(c => c.id), ''); S.settings.folders = folders().filter(f => f !== fo); await saveFolders(); homeState.folder = ''; refresh(); } }])));
  };
  const draw = () => {
    const q = homeState.q.toLowerCase();
    let list = S.chars.filter(c => inFolder(c) && (!q || (c.name + ' ' + c.tags.join(' ') + ' ' + c.creator).toLowerCase().includes(q)) && (!homeState.tag || c.tags.includes(homeState.tag)) && (!homeState.fav || c.fav));
    list.sort((a, b) => homeState.sort === 'name' ? a.name.localeCompare(b.name, 'ko') : homeState.sort === 'new' ? b.createdAt - a.createdAt : (lastUse.get(b.id) || b.createdAt) - (lastUse.get(a.id) || a.createdAt));
    count.textContent = list.length + '명';
    const tagOf = c => { const fo = !homeState.folder && folders().find(f => f.id === folderOf(c)); return fo ? h('i.in-folder', icon('folder', 11), fo.name) : null; };
    grid.replaceChildren(...list.map(c => tint(h('button.arch-card', { draggable: folders().length > 0, ondragstart: e => { e.dataTransfer.setData('text/dreamland-char', c.id); e.dataTransfer.effectAllowed = 'move'; }, onclick: () => charSheet(c),
      oncontextmenu: e => { e.preventDefault(); folderMenu(e.currentTarget, c, refresh); } },
      h('div.arch', { style: artStyle(c) }, blankArt(c), c.fav && h('i.fav', icon('star', 12)), tagOf(c)),
      h('b', c.name), h('small', firstLine(c) || c.tags.slice(0, 3).map(t => '#' + t).join(' ') || ' ')), c)),
      !list.length && homeState.folder && homeState.folder !== '-' ? h('p.dim.folder-empty', '이 폴더는 아직 비어 있어요. 위의 "캐릭터 담기"로 한 번에 넣거나, 전체 목록에서 카드를 폴더 탭으로 끌어다 놓으세요.') : null,
      h('button.arch-card.add', { onclick: async () => { const c = await S.save('chars', newChar({ folder: homeState.folder && homeState.folder !== '-' ? homeState.folder : '' }), true); charEditor(c); } }, h('div.arch', icon('plus', 26)), h('b', '새 캐릭터'), h('small', '직접 만들기')));
  };
  const tags = [...new Set(S.chars.flatMap(c => c.tags))].slice(0, 12);
  const sortBtn = (k, l) => h(`button.chip${homeState.sort === k && !homeState.fav ? '.on' : ''}`, { onclick: () => { homeState.sort = k; homeState.fav = false; refresh(); } }, l);
  const recent = [...S.chats].sort((a, b) => b.updatedAt - a.updatedAt).slice(0, 8);
  const secHead = (title, ...side) => h('header.sec-head', moonIcon(16, now), h('h2', title), h('i'), side);
  root.append(h('section.home',
    stage,
    recent.length ? h('div', secHead('이어서'), h('div.threads', recent.map(c => { const chars = c.charIds.map(id => S.get('chars', id)).filter(Boolean); return tint(h('button.thread', { onclick: () => go('chat', c.id) }, h('div.arch.sm', { style: artStyle(chars[0]) }, chars[0] ? blankArt(chars[0], true) : h('span', '?')), h('div.thread-text', h('b', chars.map(x => x.name).join(', ') || '삭제된 캐릭터'), h('small', c.preview || '새 대화'), h('time', fmtTime(c.updatedAt)))), chars[0]); }))) : null,
    h('div', secHead('캐릭터', count, sizeBtn, btn('가져오기', { ic: 'import', cls: 'ghost', onclick: () => importDialog() })),
      h('div.filter-row', sortBtn('recent', '최근'), sortBtn('new', '신규'), sortBtn('name', '이름'), h(`button.chip${homeState.fav ? '.on' : ''}`, { onclick: () => { homeState.fav = !homeState.fav; refresh(); } }, '즐겨찾기'),
        ...tags.map(t => h(`button.chip${homeState.tag === t ? '.on' : ''}`, { onclick: () => { homeState.tag = homeState.tag === t ? '' : t; refresh(); } }, '#' + t)),
        h('div.search-wrap', icon('search', 15), h('input.inp.search', { placeholder: '캐릭터 검색', value: homeState.q, oninput: e => { homeState.q = e.target.value; draw(); } }))),
      shelf, folderBar(), grid)));
  drawShelf(); draw();
});

export function charSheet(c) {
  const chats = S.chats.filter(x => x.charIds.includes(c.id)).sort((a, b) => b.updatedAt - a.updatedAt);
  let m, tab = '대화';
  const pane = h('div.sheet-pane');
  const drawPane = () => pane.replaceChildren(
    h('div.sheet-title', h('h3', inkName(c.name)), h('button.ibtn.star', { class: c.fav ? 'on' : '', title: '즐겨찾기', onclick: async e => { const el = e.currentTarget; c.fav = !c.fav; el.classList.toggle('on', c.fav); await S.save('chars', c, true); } }, icon('star'))),
    h('p.dim', [c.creator && `by ${c.creator}`, c.version && `v${c.version}`, `대화 ${chats.length}개`, `≈${charTokens(c).toLocaleString()} 토큰`].filter(Boolean).join(' · ')),
    c.tags.length ? h('div.tag-row', c.tags.map(t => h('span.chip.static', '#' + t))) : null,
    h('div.row.wrap', btn('RP 시작', { ic: 'book', cls: 'primary', onclick: () => { m.close(); startChat([c.id], { mode: 'rp' }); } }), btn('대화 시작', { ic: 'chat', onclick: () => { m.close(); startChat([c.id], { mode: 'talk' }); } }), chats[0] && btn('이어서', { ic: 'play', onclick: () => { m.close(); go('chat', chats[0].id); } }), btn('편집', { ic: 'edit', onclick: () => { m.close(); charEditor(c); } }),
      iconBtn('more', '내보내기 · 복제 · 삭제', e => menu(e.currentTarget, [
        { label: 'PNG 카드로 내보내기', ic: 'image', onclick: async () => download(`${c.name}.png`, new Blob([await exportCharPng(c)], { type: 'image/png' })) },
        { label: 'JSON 으로 내보내기', ic: 'import', hint: 'V2', onclick: () => download(`${c.name}.json`, JSON.stringify(charToCard(c), null, 2)) },
        { label: 'JSON 으로 내보내기', ic: 'import', hint: 'V3', onclick: () => download(`${c.name}.v3.json`, JSON.stringify(charToCard(c, true), null, 2)) },
        { label: '폴더에 담기', ic: 'folder', hint: folders().find(f => f.id === folderOf(c))?.name || '', onclick: () => folderMenu(pane.querySelector('.sheet-title') || document.body, c, () => { drawPane(); refresh(); }) },
        { label: '복제', ic: 'copy', onclick: async () => { await S.save('chars', { ...structuredClone(c), id: uid(), name: c.name + ' (사본)', src: '', createdAt: now() }, true); m.close(); refresh(); } },
        '-',
        { label: '캐릭터 삭제', ic: 'trash', danger: true, onclick: async () => { if (!(await confirmBox(`${c.name} 을(를) 삭제할까요? 대화 ${chats.length}개는 남겨 둡니다.`, '삭제', true))) return; await Assets.removeOwner(Assets.ownerOfChar(c.id)).catch(() => { }); if (S.settings.assets?.chars) delete S.settings.assets.chars[c.id]; for (const r of S.regex) if (r.scope === c.id) { r.scope = 'global'; r.enabled = false; await S.save('regex', r, true); } await S.remove('chars', c.id); m.close(); refresh(); } },
      ]))),
    h('div.tabs', ['대화', '소개'].map(t => h(`button.tab${t === tab ? '.on' : ''}`, { onclick: () => { tab = t; drawPane(); } }, t))),
    tab === '대화'
      ? (chats.length ? h('div.sheet-chats', chats.slice(0, 8).map(x => h('button.mini-chat', { onclick: () => { m.close(); go('chat', x.id); } }, h('span', x.name || x.preview || '새 대화'), h('time', fmtTime(x.updatedAt))))) : h('p.dim', '아직 대화가 없어요.'))
      : h('div.sheet-notes', c.creatorNotes || c.description || '설명이 아직 없어요.'));
  drawPane();
  m = modal({ title: '', wide: true, body: tint(h('div.sheet', h('div.sheet-window', h('i.orbit'), h('div.arch.lg', { style: artStyle(c) }, blankArt(c))), pane), c) });
}

export function charEditor(c) {
  c.bind ||= { connId: '', presetId: '', personaId: '' }; c.depthPrompt ||= { prompt: '', depth: 4, role: 'system' }; c.ext ||= {}; c.more ||= {}; c.altGreetings ||= []; c.loreIds ||= [];
  const pane = h('div.tab-pane');
  const counts = () => pane.querySelectorAll('em.tok[data-for]').forEach(el => { const v = el.dataset.for.split('.').reduce((a, k) => a?.[k], c); el.textContent = v ? `≈${tokens(String(v)).toLocaleString()} 토큰` : ''; });
  const saveNow = debounce(async () => { await S.save('chars', c, true); tok.textContent = `≈${charTokens(c).toLocaleString()} 토큰`; counts(); }, 300);
  const tok = h('span.tokbadge', `≈${charTokens(c).toLocaleString()} 토큰`);
  const greets = h('div.greets');
  const swap = (i, j) => { [c.altGreetings[i], c.altGreetings[j]] = [c.altGreetings[j], c.altGreetings[i]]; saveNow(); drawGreets(); };
  const drawGreets = () => greets.replaceChildren(
    h('label.field', h('span.field-label', '첫 인사'), h('textarea.inp', { rows: 7, value: c.firstMes, spellcheck: false, oninput: e => { c.firstMes = e.target.value; saveNow(); } })),
    h('p.hint', '다른 인사를 넣어 두면 새 대화의 첫 메시지를 좌우로 넘겨 고를 수 있어요.'),
    ...c.altGreetings.map((g, i) => h('label.field', h('span.field-label', `다른 인사 ${i + 1}`, h('em.tok', g ? `≈${tokens(g).toLocaleString()} 토큰` : ''),
      iconBtn('up', '위로', () => { if (i > 0) swap(i, i - 1); }, 'tiny'), iconBtn('down', '아래로', () => { if (i < c.altGreetings.length - 1) swap(i, i + 1); }, 'tiny'), iconBtn('trash', '삭제', async () => { if ((c.altGreetings[i] || '').trim() && !(await confirmBox('이 첫 메시지를 삭제할까요?', '삭제', true))) return; c.altGreetings.splice(i, 1); saveNow(); drawGreets(); }, 'tiny')),
      h('textarea.inp', { rows: 5, value: g, spellcheck: false, oninput: e => { c.altGreetings[i] = e.target.value; saveNow(); } }))),
    btn('다른 인사 추가', { ic: 'plus', cls: 'ghost', onclick: () => { c.altGreetings.push(''); drawGreets(); } }));
  drawGreets();
  // 카드에 실려 온 나머지 필드: 고쳐 쓸 수 있게 JSON 으로 보여 준다
  const jsonField = (key, label, hint) => {
    const note = h('small.hint', hint);
    return h('label.field', h('span.field-label', label), h('textarea.inp.af-json', { rows: 4, spellcheck: false, value: Object.keys(c[key] || {}).length ? JSON.stringify(c[key], null, 2) : '', placeholder: '{ }', oninput: e => {
      const v = e.target.value.trim();
      try { const j = v ? JSON.parse(v) : {}; if (!j || typeof j !== 'object' || Array.isArray(j)) throw 0; c[key] = j; note.textContent = hint; note.classList.remove('bad'); saveNow(); } catch { note.textContent = 'JSON 객체 형식이 아니라서 아직 저장하지 않았어요.'; note.classList.add('bad'); }
    } }), note);
  };
  const talkLabel = h('div.af-talk', h('span', '수줍음'), h('span', '보통'), h('span', '수다쟁이'));
  const tabs = {
    '기본': form(c, [{ k: 'name', label: '이름' }, { k: 'avatar', label: '초상', type: 'image', max: 900 }, { k: 'tags', label: '태그', type: 'tags' }], saveNow),
    '설정': form(c, [{ k: 'description', label: '설명', type: 'area', rows: 12, count: true }, { k: 'personality', label: '성격 요약', type: 'area', rows: 3, count: true, ph: '(성격을 짧게 요약)' }, { k: 'scenario', label: '시나리오', type: 'area', rows: 4, count: true, ph: '(대화가 벌어지는 상황과 맥락)' }], saveNow),
    '인사말': greets,
    '에셋': assetsPane(Assets.ownerOfChar(c.id), c, saveNow),
    '고급 정의': form(c, [
      { section: '프롬프트 덮어쓰기' },
      { el: h('p.hint', '채팅 완성형에서는 프리셋의 메인 프롬프트 · 후속 지시 블록을, 텍스트 완성형에서는 고급 포맷팅의 시스템 프롬프트를 이 캐릭터에 한해 바꿉니다. {{original}} 을 넣으면 그 자리에 원래 프롬프트가 들어갑니다.') },
      { k: 'systemPrompt', label: '메인 프롬프트', type: 'area', rows: 3, count: true, ph: '여기에 적은 내용이 이 캐릭터의 메인 프롬프트를 대신합니다. (V2 스펙: system_prompt)' },
      { k: 'postHistory', label: '후속 지시', type: 'area', rows: 3, count: true, ph: '여기에 적은 내용이 이 캐릭터의 후속 지시를 대신합니다. (V2 스펙: post_history_instructions)' },
      { section: '제작자 정보 (프롬프트에 들어가지 않음)' },
      { k: 'creator', label: '제작자', half: true, ph: '(만든 사람 이름 · 연락처)' }, { k: 'version', label: '캐릭터 버전', half: true, ph: '(버전을 관리하고 싶다면)' },
      { k: 'creatorNotes', label: '제작자 노트', type: 'area', rows: 4, ph: '(캐릭터 소개, 쓰는 요령, 시험해 본 모델 등. 캐릭터 프로필에 보입니다.)' },
      { section: '캐릭터 노트' },
      { k: 'depthPrompt.prompt', label: '캐릭터 노트', type: 'area', rows: 3, count: true, ph: '(대화 중간의 지정한 깊이와 역할로 계속 삽입되는 글)' }, { k: 'depthPrompt.depth', label: '@ 깊이', type: 'num', min: 0, half: true }, { k: 'depthPrompt.role', label: '역할', type: 'select', opts: [['system', '시스템'], ['user', '사용자'], ['assistant', '어시스턴트']], half: true },
      { section: '수다스러움' },
      { k: 'talk', label: '그룹 채팅에서 얼마나 자주 말하는지', type: 'range', min: 0, max: 1, step: 0.05 }, { el: talkLabel },
      { section: '대화 예시' },
      { k: 'mesExample', label: '말투와 문체를 잡는 데 중요합니다', type: 'area', rows: 6, count: true, ph: '(대화 예시. 예시마다 새 줄에 <START> 로 시작합니다.)\n<START>\n{{user}}: …\n{{char}}: …' },
      { section: '로어북' },
      { el: h('div.field', h('span.field-label', '연결된 로어북'), loreLinker(c, saveNow), h('small.hint', '맨 처음 연결한 로어북은 카드를 내보낼 때 카드 안에 함께 담깁니다.')) },
      { section: '이 캐릭터 전용 설정' },
      { k: 'bind.connId', label: 'API 연결', type: 'select', opts: [['', '기본 연결을 따름'], ...S.conns.map(x => [x.id, x.name])], third: true }, { k: 'bind.presetId', label: '프리셋', type: 'select', opts: [['', '기본 프리셋을 따름'], ...S.presets.map(x => [x.id, x.name])], third: true }, { k: 'bind.personaId', label: '페르소나', type: 'select', opts: [['', '기본 페르소나를 따름'], ...S.personas.map(x => [x.id, x.name])], third: true },
      { section: '카드의 나머지 필드' },
      { el: jsonField('ext', '확장 필드 (extensions)', '다른 프런트엔드나 확장이 카드에 넣어 둔 값입니다. 내보낼 때 그대로 실립니다.') },
      { el: jsonField('more', 'V3 필드', 'nickname · source · group_only_greetings · creator_notes_multilingual 같은 V3 스펙 필드입니다. 내보낼 때 그대로 실립니다.') }], saveNow),
  };
  const show = t => { pane.replaceChildren(tabs[t]); counts(); };
  const bar = h('div.tabs', Object.keys(tabs).map((t, i) => h(`button.tab${i === 0 ? '.on' : ''}`, { onclick: e => { bar.querySelectorAll('.tab').forEach(b => b.classList.remove('on')); e.currentTarget.classList.add('on'); show(t); } }, t)), tok);
  show('기본');
  modal({ title: '캐릭터 편집', wide: true, body: h('div', bar, pane), onClose: () => { S.save('chars', c, true).then(refresh); }, actions: [{ label: '완료', cls: 'primary' }] });
}

// ════════ 로어북 ════════
registerPage('lore', root => libraryPage(root, {
  title: '로어북', eyebrow: 'lorebook', coll: 'lore', ic: 'book', create: () => newLore(), label: b => b.name, sub: b => [`항목 ${b.entries.length}개`, ...loreLinks(b)].join(' · '),
  note: () => { const n = S.lore.filter(b => S.settings.activeLore.includes(b.id)).length; return h('small', n ? `켠 로어북 ${n}개가 모든 대화에서 쓰여요` : '스위치를 켠 로어북은 모든 대화에서 쓰여요'); },
  trail: (b, redraw) => loreSwitch(b, redraw),
  empty: '세계관과 설정을 키워드로 불러오는 로어북을 만들어 보세요.',
  actions: [{ ic: 'sliders', title: '로어북 전체 설정', onclick: () => loreSettingsDialog() }, { ic: 'import', title: '로어북 가져오기 (JSON · 실리태번 월드 인포)', onclick: () => importDialog('.json') }],
  editor: (b, api) => loreEditor(b, api),   // 편집기는 js/f-lore.js
}));

// ════════ 프리셋 ════════
registerPage('presets', root => libraryPage(root, {
  title: '프리셋', eyebrow: 'preset', coll: 'presets', ic: 'sliders', create: () => { const p = defaultPreset(); p.name = '새 프리셋'; return p; }, label: p => p.name, sub: p => `${p.blocks.filter(b => b.enabled).length}개 블록${p.id === S.settings.activePreset ? ' · 사용 중' : ''}`,
  actions: [{ ic: 'import', title: '프리셋 가져오기 (실리태번 · 마리나라 · 드림랜드)', onclick: async draw => { const [f] = await pickFiles({ accept: '.json' }); if (!f) return; try { const j = JSON.parse(await f.text()); if (j.blocks && j.params) { await S.save('presets', { ...j, id: uid() }, true); toast('프리셋을 가져왔어요', 'ok'); } else { const T = await importFiles([f]); toast(summarize(T), T.errors.length ? 'err' : 'ok'); } } catch (e) { toast(e.message, 'err'); } refresh(); } }],
  editor: (p, { redraw, save }) => {
    const sv = debounce(save, 300);
    const list = h('div.blocks'); const open = new Set();
    const moveBlock = (from, to, focus) => { if (to < 0 || to >= p.blocks.length || to === from) return; const [x] = p.blocks.splice(from, 1); p.blocks.splice(to, 0, x); sv(); drawBlocks(); if (focus) list.children[to]?.querySelector('.grip')?.focus(); };
    dragSort(list, (from, to) => moveBlock(from, to));
    const drawBlocks = () => list.replaceChildren(...p.blocks.map((b, i) => {
      const marker = b.kind !== 'text';
      const row = h(`div.block${b.enabled ? '' : '.off'}${open.has(b.id) ? '.open' : ''}${marker ? '.marker' : ''}`,
        h('div.block-head', { onclick: ev => { if (ev.target.closest('button,label,select')) return; if (b.kind === 'chatHistory') return; open.has(b.id) ? open.delete(b.id) : open.add(b.id); drawBlocks(); } },
          h('button.grip', { type: 'button', title: '잡고 끌어서 순서 바꾸기 (방향키 ↑ ↓ 로도)', 'aria-label': '순서 바꾸기', onkeydown: ev => { if (ev.key === 'ArrowUp' || ev.key === 'ArrowDown') { ev.preventDefault(); moveBlock(i, i + (ev.key === 'ArrowUp' ? -1 : 1), true); } } }, icon('grip', 16)),
          h('label.switch', h('input', { type: 'checkbox', checked: b.enabled, onchange: ev => { b.enabled = ev.target.checked; sv(); row.classList.toggle('off', !b.enabled); redraw(); } }), h('i')),
          icon(marker ? 'sparkle' : 'note', 15), h('b', b.name || MARKERS[b.kind] || '프롬프트'),
          b.depth != null && b.depth !== '' ? h('em.badge', `깊이 ${b.depth}`) : null, b.when ? h('em.badge', { title: b.when }, '조건') : null,
          b.kind !== 'chatHistory' && h('span.tokbadge', b.content ? `≈${tokens(b.content)}` : (marker ? '자동' : '비어 있음')),
          !marker && iconBtn('trash', '블록 삭제', async () => { if (!(await confirmBox('이 블록을 삭제할까요?', '삭제', true))) return; p.blocks.splice(p.blocks.indexOf(b), 1); sv(); drawBlocks(); redraw(); }, 'tiny')));
      if (open.has(b.id)) row.append(h('div.block-body', form(b, [
        !marker && { k: 'name', label: '이름', half: true }, { k: 'role', label: '역할', type: 'select', opts: ['system', 'user', 'assistant'], half: true },
        { k: 'content', label: marker && b.kind !== 'main' && b.kind !== 'jailbreak' ? '감싸는 틀' : '내용', type: 'area', rows: marker && b.kind !== 'main' && b.kind !== 'jailbreak' ? 3 : 9, hint: marker && b.kind !== 'main' && b.kind !== 'jailbreak' ? '{{slot}} 자리에 실제 내용이 들어갑니다. 비워 두면 내용만 넣어요.' : '{{char}} {{user}} {{random::a::b}} {{getvar::이름}} 같은 매크로를 쓸 수 있어요.' },
        { k: 'depth', label: '대화 중간에 삽입 (깊이)', type: 'num', nullable: true, ph: '비우면 목록 순서대로', half: true },
        b.kind !== 'chatHistory' && { k: 'when', label: '조건 (맞을 때만 이 블록을 넣음)', ph: '비우면 항상 · 예: 수위 && 문체 == "격하게"', half: true, hint: '프리셋 변수 · 대화 변수 · char · mode 같은 낱말로 식을 적습니다. 중괄호는 쓰지 않아요.' },
      ], sv)));
      return row;
    }));
    drawBlocks();
    const active = p.id === S.settings.activePreset;
    return h('div.editor',
      h('header.editor-head', h('h2', p.name), h('div.row',
        active ? h('em.badge.on', '사용 중') : btn('이 프리셋 사용', { ic: 'check', cls: 'primary', onclick: () => { S.set({ activePreset: p.id }); refresh(); } }),
        iconBtn('copy', '복제', async () => { await S.save('presets', { ...structuredClone(p), id: uid(), name: p.name + ' (사본)', src: '' }, true); refresh(); }),
        iconBtn('code', `이 프리셋의 정규식 (${(p.regex || []).length})`, () => go('regex', 'preset:' + p.id)),
        iconBtn('import', '내보내기', () => download(`${p.name}.dreamland-preset.json`, JSON.stringify(p, null, 2))),
        iconBtn('trash', '삭제', async () => { if (S.presets.length < 2) return toast('마지막 프리셋은 지울 수 없어요'); if (await confirmBox(`"${p.name}" 프리셋을 삭제할까요?`, '삭제', true)) { await S.remove('presets', p.id); if (active) S.set({ activePreset: S.presets[0].id }); refresh(); } }))),
      form(p, [{ k: 'name', label: '이름' },
        { section: '생성 설정' },
        { k: 'params.temperature', label: '온도', type: 'num', nullable: true, step: 0.05, third: true, ph: '보내지 않음' }, { k: 'params.topP', label: 'Top P', type: 'num', nullable: true, step: 0.01, third: true, ph: '보내지 않음' }, { k: 'params.topK', label: 'Top K', type: 'num', nullable: true, third: true, ph: '보내지 않음' },
        { k: 'params.maxTokens', label: '최대 응답 토큰', type: 'num', third: true }, { k: 'params.contextSize', label: '컨텍스트 크기', type: 'num', third: true }, { k: 'params.effort', label: '추론 강도', type: 'select', opts: [['', '기본값'], 'low', 'medium', 'high', 'xhigh', 'max'], third: true },
        { k: 'params.freqPen', label: '빈도 페널티', type: 'num', nullable: true, step: 0.05, third: true, ph: '보내지 않음' }, { k: 'params.presPen', label: '존재 페널티', type: 'num', nullable: true, step: 0.05, third: true, ph: '보내지 않음' }, { k: 'params.stop', label: '중단 문자열', type: 'tags', third: true },
        { k: 'params.minP', label: 'Min P', type: 'num', nullable: true, step: 0.01, third: true, ph: '보내지 않음' }, { k: 'params.topA', label: 'Top A', type: 'num', nullable: true, step: 0.01, third: true, ph: '보내지 않음' }, { k: 'params.repPen', label: '반복 페널티', type: 'num', nullable: true, step: 0.01, third: true, ph: '보내지 않음' },
        { k: 'params.seed', label: '시드', type: 'num', nullable: true, third: true, ph: '무작위' },
        { k: 'params.prefill', label: '응답 시작 문구 (프리필)', type: 'area', rows: 2, hint: '지원하지 않는 모델(최신 Claude 등)에서는 자동으로 빠집니다.' },
        { k: 'params.stream', label: '스트리밍', type: 'check' }, { k: 'params.squash', label: '연속된 시스템 메시지 합치기', type: 'check' }, { k: 'params.cardOverrides', label: '캐릭터 카드의 프롬프트 덮어쓰기 허용', type: 'check' }, { k: 'params.namesInGroup', label: '그룹 채팅에서 이름 붙이기', type: 'check' },
        { section: '보조 지시문' },
        { k: 'params.continueNudge', label: '이어 쓰기 지시', type: 'area', rows: 2, ph: CONTINUE_NUDGE }, { k: 'params.impersonatePrompt', label: '대신 써 주기 지시', type: 'area', rows: 2, ph: IMPERSONATE_NUDGE }, { k: 'params.groupNudge', label: '그룹 채팅 화자 지시', type: 'area', rows: 2, ph: GROUP_NUDGE },
      ], () => { sv(); }),
      h('h3.form-sec', '프리셋 변수'), presetVarsEditor(p, sv),
      h('h3.form-sec', '프롬프트 구성'),
      h('p.hint', '위에서 아래 순서로 조립됩니다. 반짝이 아이콘은 캐릭터·로어북·기록이 자동으로 채워지는 자리예요.'),
      list,
      btn('프롬프트 블록 추가', { ic: 'plus', cls: 'ghost', onclick: () => { const b = { id: uid(), kind: 'text', name: '새 프롬프트', role: 'system', content: '', enabled: true, depth: null }; const at = p.blocks.findIndex(x => x.kind === 'chatHistory'); p.blocks.splice(at < 0 ? p.blocks.length : at, 0, b); open.add(b.id); save(); drawBlocks(); } }));
  },
}));

// ════════ 페르소나 ════════
registerPage('personas', root => libraryPage(root, {
  title: '페르소나', eyebrow: 'persona', coll: 'personas', thumb: p => avatar(p, 'sm'), ic: 'user', create: () => newPersona({ name: '새 페르소나' }), label: p => p.name, sub: p => p.id === S.settings.activePersona ? '기본 페르소나' : (p.description.slice(0, 40) || ' '),
  editor: (p, { redraw, save }) => h('div.editor',
    h('header.editor-head', h('h2', p.name), h('div.row',
      p.id === S.settings.activePersona ? h('em.badge.on', '기본') : btn('기본으로', { ic: 'check', cls: 'primary', onclick: () => { S.set({ activePersona: p.id }); refresh(); } }),
      iconBtn('trash', '삭제', async () => { if (S.personas.length < 2) return toast('마지막 페르소나는 지울 수 없어요'); if (await confirmBox(`"${p.name}" 페르소나를 삭제할까요?`, '삭제', true)) { await Assets.removeOwner(Assets.ownerOfPersona(p.id)).catch(() => { }); await S.remove('personas', p.id); if (S.settings.activePersona === p.id) S.set({ activePersona: S.personas[0].id }); refresh(); } }))),
    form(p, [{ k: 'name', label: '이름', hint: '{{user}} 로 쓰입니다.' }, { k: 'avatar', label: '초상', type: 'image' }, { k: 'description', label: '설명', type: 'area', rows: 10, hint: `≈${tokens(p.description)} 토큰` }], debounce(() => { save(); redraw(); }, 400)),
    personaLinks(p),
    lorePicker(p, debounce(save, 300), '이 페르소나로 말하는 대화에서 함께 쓰는 로어북입니다.'),
    assetsPane(Assets.ownerOfPersona(p.id), p, debounce(save, 300))),
}));

/** 페르소나 연결: 대화 > 캐릭터 > 기본 순으로 적용된다 */
/** 대화방 이름: 가져온 이름 앞의 캐릭터 이름은 떼고, 이름이 없으면 날짜로 */
const roomLabel = c => { const t = c.charIds.map(i => S.get('chars', i)?.name).filter(Boolean).join(', '), n = String(c.name || '').trim(); const cut = t && n.toLowerCase().startsWith(t.toLowerCase()) ? n.slice(t.length).replace(/^[\s\-–—·:@]+/, '') : n; return cut || new Date(c.createdAt || 0).toLocaleDateString('ko-KR', { year: '2-digit', month: 'numeric', day: 'numeric' }) + ' 대화'; };
/** 대화방 여러 개 고르기: 캐릭터별로 묶고, 찾고, 묶음째 고른다. 방이 아주 많아도 쓸 수 있게 묶음은 접혀 있다 */
function chatPicker({ title = '대화방 고르기', selected = [], note = () => '', onDone }) {
  const picked = new Set(selected), open = new Set(); let q = '';
  const list = h('div.picker-list.cpick'), count = h('small.hint');
  const keyOf = c => [...c.charIds].sort().join('+') || '-', titleOf = c => c.charIds.map(i => S.get('chars', i)?.name).filter(Boolean).join(', ') || '삭제된 캐릭터';
  const day = t => new Date(t || 0).toLocaleDateString('ko-KR', { month: 'numeric', day: 'numeric' });
  const draw = () => {
    const t = q.trim().toLowerCase(), groups = new Map();
    for (const c of S.chats) { if (t && !(titleOf(c) + ' ' + roomLabel(c) + ' ' + (c.preview || '')).toLowerCase().includes(t)) continue; const k = keyOf(c); if (!groups.has(k)) groups.set(k, []); groups.get(k).push(c); }
    const sorted = [...groups.entries()].sort((a, b) => b[1].some(c => picked.has(c.id)) - a[1].some(c => picked.has(c.id)) || Math.max(...b[1].map(c => c.updatedAt || 0)) - Math.max(...a[1].map(c => c.updatedAt || 0)));
    count.textContent = `${picked.size}개 선택 · 전체 ${S.chats.length}개`;
    list.replaceChildren(...sorted.slice(0, 120).flatMap(([k, rooms]) => {
      const n = rooms.filter(c => picked.has(c.id)).length, all = n === rooms.length, show = !!t || open.has(k) || sorted.length <= 3, chars = rooms[0].charIds.map(i => S.get('chars', i)).filter(Boolean);
      rooms.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
      return [h(`div.cpick-group${show ? '.open' : ''}`,
        h('button.cpick-head', { onclick: () => { open.has(k) ? open.delete(k) : open.add(k); draw(); } }, chars[0] ? avatar(chars[0], 'sm') : null, h('div.picker-text', h('b', titleOf(rooms[0])), h('small', `대화방 ${rooms.length}개${n ? ` · ${n}개 선택` : ''}`)), icon(show ? 'down' : 'right', 15)),
        h('button.cpick-all', { title: all ? '이 캐릭터의 대화방 모두 빼기' : '이 캐릭터의 대화방 모두 고르기', onclick: () => { for (const c of rooms) all ? picked.delete(c.id) : picked.add(c.id); draw(); } }, all ? '모두 빼기' : '모두')),
        ...(show ? rooms.slice(0, 80).map(c => h(`button.picker-row.cpick-room${picked.has(c.id) ? '.on' : ''}`, { onclick: () => { picked.has(c.id) ? picked.delete(c.id) : picked.add(c.id); draw(); } },
          h('div.picker-text', h('b', roomLabel(c)), h('small', [note(c), `${c.count || 0}개`, day(c.updatedAt), c.mode === 'talk' ? '대화 모드' : 'RP', (c.preview || '').slice(0, 40)].filter(Boolean).join(' · '))), h('i.picker-check', icon('check', 14)))) : [])];
    }), !sorted.length && h('p.dim', '찾는 대화방이 없어요.'), sorted.length > 120 && h('p.dim', '검색어를 더 넣어 좁혀 주세요.'));
  };
  const search = h('input.inp.search', { placeholder: '캐릭터 · 대화방 이름 · 내용으로 찾기', oninput: e => { q = e.target.value; draw(); } });
  const box = modal({ title, body: h('div.col', search, count, list), actions: [{ label: '취소' }, { label: '확인', cls: 'primary', onclick: () => onDone([...picked]) }] });
  draw(); return box;
}
function personaLinks(p) {
  const box = h('div.card.links');
  const draw = () => {
    const chars = S.chars, chats = S.chats.filter(c => c.personaId === p.id).sort((a, b) => b.updatedAt - a.updatedAt);
    const cur = S.get('chats', S.settings.lastChat);
    const nameOf = c => c.charIds.map(i => S.get('chars', i)?.name).filter(Boolean).join(', ') || '삭제된 캐릭터';
    box.replaceChildren(
      h('h3.form-sec', '연결'), h('p.hint', '어떤 대화에서 이 페르소나로 말할지 정합니다. 대화에 연결한 것이 가장 먼저, 그다음 캐릭터에 연결한 것, 마지막이 기본 페르소나입니다.'),
      h('div.link-row', h('span.field-label', '기본'), p.id === S.settings.activePersona ? h('em.badge.on', '기본 페르소나') : btn('기본으로 쓰기', { ic: 'check', cls: 'ghost', onclick: () => { S.set({ activePersona: p.id }); refresh(); } })),
      h('div.link-row', h('span.field-label', '캐릭터'), h('div.link-chips',
        chars.filter(c => c.bind?.personaId === p.id).map(c => h('button.chip.with-av.on', { title: '눌러서 연결 풀기', onclick: async () => { c.bind = { ...(c.bind || {}), personaId: '' }; await S.save('chars', c, true); draw(); } }, avatar(c, 'xs'), c.name, ' ✕')),
        btn('캐릭터 고르기', { ic: 'search', cls: 'ghost', onclick: () => charPicker({ title: `${p.name}(으)로 말할 캐릭터`, selected: chars.filter(c => c.bind?.personaId === p.id).map(c => c.id), note: c => { const o = c.bind?.personaId && c.bind.personaId !== p.id ? S.get('personas', c.bind.personaId)?.name : ''; return o ? `지금은 "${o}"` : ''; },
          onDone: async ids => { for (const c of S.chars) { const want = ids.includes(c.id), has = c.bind?.personaId === p.id; if (want !== has) { c.bind = { connId: '', presetId: '', ...(c.bind || {}), personaId: want ? p.id : '' }; await S.save('chars', c, true); } } draw(); } }) }))),
      h('div.link-row', h('span.field-label', '대화'), h('div.link-chips',
        chats.slice(0, 8).map(c => h('button.chip.on', { title: '눌러서 연결 풀기', onclick: async () => { c.personaId = ''; await S.save('chats', c, true); draw(); } }, nameOf(c), ' · ', roomLabel(c).slice(0, 18), ' ✕')),
        chats.length > 8 ? h('small.hint', `외 ${chats.length - 8}개`) : null,
        btn(chats.length ? `대화방 고르기 (${chats.length})` : '대화방 고르기', { ic: 'search', cls: 'ghost', onclick: () => chatPicker({ title: `${p.name}(으)로 말할 대화방`, selected: chats.map(c => c.id), note: c => { const o = c.personaId && c.personaId !== p.id ? S.get('personas', c.personaId)?.name : ''; return o ? `지금은 "${o}"` : ''; },
          onDone: async ids => { for (const c of S.chats) { const want = ids.includes(c.id), has = c.personaId === p.id; if (want !== has) { c.personaId = want ? p.id : ''; await S.save('chats', c, true); } } draw(); } }) }),
        cur && cur.personaId !== p.id ? btn(`지금 대화(${nameOf(cur)})에 연결`, { ic: 'plus', cls: 'ghost', onclick: async () => { cur.personaId = p.id; await S.save('chats', cur, true); draw(); } }) : null)));
  };
  draw(); return box;
}

// ════════ 정규식 ════════
registerPage('regex', root => libraryPage(root, {
  title: '정규식', eyebrow: 'regex', coll: 'regex', ic: 'code', create: () => newRegex(), label: r => r.name, sub: r => `${r.enabled ? '' : '꺼짐 · '}${{ store: '원문 변경', display: '화면만', prompt: '전송만', both: '화면+전송' }[r.mode] || r.mode}${r.scope !== 'global' ? ' · ' + (S.get('chars', r.scope)?.name || '캐릭터') : ''}`,
  empty: '응답을 다듬거나 꾸미는 찾아 바꾸기 규칙을 만들 수 있어요.',
  actions: [{ ic: 'import', title: '정규식 가져오기 (실리태번 JSON)', onclick: () => importDialog('.json') }],
  editor: (r, { redraw, save }) => {
    const sample = h('textarea.inp', { rows: 4, placeholder: '여기에 예시 문장을 넣어 결과를 미리 확인해 보세요.' });
    const out = h('pre.regex-out');
    const test = () => {
      if (!sample.value) { out.textContent = ''; return; }
      const re = compileRegex(r.find);
      if (!re) { out.textContent = '정규식을 해석할 수 없어요.'; return; }
      const saved = S.regex; S.regex = [{ ...r, enabled: true, scope: 'global', onAI: true, mode: 'display', minDepth: null, maxDepth: null }];
      try { out.textContent = applyRegex(sample.value, { who: 'ai', target: 'display' }); } finally { S.regex = saved; }
    };
    sample.addEventListener('input', test);
    return h('div.editor',
      h('header.editor-head', h('h2', r.name), h('div.row', iconBtn('import', '실리태번 형식으로 내보내기', () => download(`${r.name}.json`, JSON.stringify(regexToSt(r), null, 2))), iconBtn('trash', '삭제', async () => { if (!(await confirmBox(`"${r.name}" 정규식을 삭제할까요?`, '삭제', true))) return; await S.remove('regex', r.id); refresh(); }))),
      form(r, [{ k: 'name', label: '이름', half: true }, { k: 'scope', label: '적용 범위', type: 'select', opts: [['global', '모든 캐릭터'], ...S.chars.map(c => [c.id, c.name])], half: true },
        { k: 'find', label: '찾기', ph: '/패턴/플래그  또는  패턴', hint: '슬래시 형식이 아니면 전체(g) 검색으로 처리합니다.' }, { k: 'replace', label: '바꾸기', type: 'area', rows: 4, hint: '$1, $2 … 캡처 그룹 · {{match}} 전체 일치 · HTML 사용 가능' },
        { k: 'mode', label: '적용 방식', type: 'select', opts: [['display', '화면에 보일 때만'], ['prompt', 'AI 에게 보낼 때만'], ['both', '화면 + 전송 (원문은 유지)'], ['store', '원문 자체를 바꿔 저장']], half: true }, { k: 'trim', label: '캡처에서 지울 문자열', type: 'lines', rows: 2, half: true },
        { k: 'minDepth', label: '최소 깊이', type: 'num', nullable: true, half: true, ph: '제한 없음' }, { k: 'maxDepth', label: '최대 깊이', type: 'num', nullable: true, half: true, ph: '제한 없음' },
        { k: 'enabled', label: '사용', type: 'check' }, { k: 'onAI', label: 'AI 응답에 적용', type: 'check' }, { k: 'onUser', label: '내 입력에 적용', type: 'check' }], debounce(() => { save(); redraw(); test(); }, 300)),
      h('div.field', h('span.field-label', '미리 보기'), sample, out));
  },
}));

// ════════ API 연결 ════════
const GROUPS = ['주요', '클라우드', '모음 서비스', '내 컴퓨터', '기타'];
/** 화면에 내보일 꼬리: 저장된 키는 끝 네 글자만 */
const keyTail = (c, f) => Secrets.is(c[f]) ? Secrets.tail(c.id, f) : (String(c[f] || '').length > 8 ? String(c[f]).slice(-4) : '');
/** API 키 칸: 한 번 넣은 키는 다시 보여 주지 않는다. 바꾸려면 새로 넣고, 지우려면 지우기 */
function keyField(c, def, save) {
  const saved = !!c.apiKey, held = Secrets.is(c.apiKey);
  const inp = h('input.inp', { type: 'password', autocomplete: 'off', spellcheck: false, placeholder: saved ? '새 키를 넣으면 지금 키를 바꿉니다' : 'API 키 붙여넣기' });
  const commit = async () => {
    const v = inp.value.trim(); if (!v) return;
    try {
      if (Secrets.on) { const hosts = Secrets.hostsFor(c, def.base || ''); if (!hosts.length) return toast('주소를 먼저 넣어 주세요. 키는 그 주소로만 보내도록 묶어 둡니다.', 'err'); c.apiKey = await Secrets.put(c.id, 'apiKey', v, hosts, c.name); }
      else c.apiKey = v;
      await save(); toast('키를 저장했어요', 'ok'); refresh();
    } catch (e) { toast(e.message, 'err'); }
  };
  inp.addEventListener('change', commit); inp.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); commit(); } });
  const where = held ? `드림랜드 서버에만 보관됩니다 (${(Secrets.items[c.id]?.apiKey?.hosts || []).join(', ') || '주소 미정'} 로만 전송)` : Secrets.ok ? '이 브라우저에 저장돼 있습니다. 잠시 뒤 서버 보관으로 옮겨집니다.' : Vault.on ? '이 브라우저에 암호화되어 저장됩니다.' : '이 브라우저 안에만 저장됩니다. 드림랜드 서버(start.bat)로 열면 서버 보관을 쓸 수 있어요.';
  return h('div.field.key-field', h('span.field-label', def.kind === 'vertex' ? 'API 키 (익스프레스 키 · 서비스 계정을 쓰면 비워 두세요)' : def.keyless ? 'API 키 (없으면 비워 두세요)' : 'API 키'),
    saved ? h('div.key-state', icon('lock', 15), h('b', '저장됨'), h('code', '••••••••' + (keyTail(c, 'apiKey') || '')), h('span.key-where', held ? '서버 보관' : Vault.on ? '암호화' : '브라우저'),
      btn('지우기', { cls: 'ghost', onclick: async () => { if (!(await confirmBox('이 연결의 API 키를 지울까요?', '지우기', true))) return; if (held) await Secrets.del(c.id, 'apiKey'); c.apiKey = ''; await save(); refresh(); } })) : null,
    inp, h('small.hint', '넣은 키는 다시 보여 주지 않고, 백업 파일에도 들어가지 않습니다. ' + where));
}
/** 서비스 계정 키: 이메일만 보여 주고 본문은 다시 보여 주지 않는다 */
function saField(c, save) {
  const saved = !!c.serviceAccount, held = Secrets.is(c.serviceAccount);
  const email = held ? c.saEmail : (() => { try { return JSON.parse(c.serviceAccount).client_email; } catch { return saved ? '키 형식 오류' : ''; } })();
  const take = async text => {
    try {
      const j = parseServiceAccount(text); c.project = j.project_id || c.project || ''; c.saEmail = j.client_email || ''; c.saProject = j.project_id || '';
      c.serviceAccount = Secrets.on ? await Secrets.put(c.id, 'serviceAccount', JSON.stringify(j), ['googleapis.com'], c.saEmail) : JSON.stringify(j);
      await save(); toast(`${j.client_email} 키를 저장했어요`, 'ok'); refresh();
    } catch (e) { toast(e.message, 'err'); }
  };
  const ta = h('textarea.inp', { rows: 3, spellcheck: false, autocomplete: 'off', placeholder: saved ? '새 키(JSON)를 붙여넣으면 지금 키를 바꿉니다' : '{ "type": "service_account", "project_id": "…", "private_key": "…", "client_email": "…" }' });
  ta.addEventListener('change', () => { if (ta.value.trim()) take(ta.value); });
  return h('div.col.key-field',
    saved ? h('div.key-state', icon('lock', 15), h('b', '저장됨'), h('code', email || '서비스 계정'), h('span.key-where', held ? '서버 보관' : Vault.on ? '암호화' : '브라우저'),
      btn('키 지우기', { cls: 'ghost', onclick: async () => { if (!(await confirmBox('서비스 계정 키를 지울까요?', '지우기', true))) return; if (held) await Secrets.del(c.id, 'serviceAccount'); c.serviceAccount = ''; c.saEmail = ''; c.saProject = ''; await save(); refresh(); } })) : null,
    h('div.row.wrap', btn(saved ? '다른 키 파일로 바꾸기' : '키 파일 가져오기', { ic: 'import', onclick: async () => { const [f] = await pickFiles({ accept: '.json,application/json' }); if (f) take(await f.text()); } })),
    h('label.field', h('span.field-label', '서비스 계정 키 (JSON 붙여넣기)'), ta),
    h('small.hint', '개인 키가 든 본문은 저장한 뒤 다시 보여 주지 않습니다. 화면을 찍어 공유해도 키가 드러나지 않아요.'));
}
registerPage('conns', root => libraryPage(root, {
  title: 'API 연결', eyebrow: 'connect', coll: 'conns', ic: 'plug', create: () => newConn(), label: c => c.name, sub: c => `${PROVIDERS[c.provider]?.name || c.provider}${c.model ? ' · ' + c.model : ''}${c.id === S.settings.activeConn ? ' · 사용 중' : ''}`,
  empty: '모델에 연결하려면 오른쪽 위의 + 를 눌러 연결을 추가하세요.',
  actions: [{ ic: 'folder', title: '연결 프로필 (연결 · 프리셋 · 포맷팅 템플릿 묶음)', onclick: () => go('quick', 'profiles') }],
  editor: (c, { redraw, save }) => {
    if (!S.settings.activeConn) S.set({ activeConn: c.id });
    if (c.provider === 'vertexai' && !c.region) c.region = 'global';
    const def = PROVIDERS[c.provider] || PROVIDERS.custom;
    if (c.instruct && c.instruct !== 'plain' && c.instruct !== 'custom') c.instruct = instructName(c.instruct);   // 예전 값(chatml 등)을 템플릿 이름으로
    const sv = debounce(() => { save(); redraw(); }, 300);
    const dl = h('datalist', { id: 'models-' + c.id }, def.models.map(m => h('option', { value: m })));
    const chips = h('div.model-chips');
    const drawChips = list => chips.replaceChildren(...list.slice(0, 24).map(m => h(`button.chip${c.model === m ? '.on' : ''}`, { onclick: () => { c.model = m; modelInp.value = m; sv(); drawChips(list); } }, m)));
    const modelInp = h('input.inp', { value: c.model, placeholder: def.kind === 'azure' ? '배포 이름' : '모델 ID', autocomplete: 'off', spellcheck: false, oninput: e => { c.model = e.target.value.trim(); sv(); } });
    modelInp.setAttribute('list', dl.id);
    const load = async quiet => { try { const list = await listModels(c); if (!list.length) throw new Error('목록이 비어 있어요'); dl.replaceChildren(...list.map(m => h('option', { value: m }))); drawChips([...new Set([...list, ...def.models])]); if (!quiet) toast(`모델 ${list.length}개를 불러왔어요`, 'ok'); } catch (e) { if (!quiet) toast(e.message, 'err'); } };
    drawChips(def.models);
    if (def.kind !== 'mock' && (c.apiKey || c.serviceAccount || def.keyless) && (c.baseUrl || def.base || def.kind === 'vertex')) load(true);   // 키가 있으면 항상 실제 목록을 받아 온다
    const provider = h('select.inp', { onchange: async e => { c.provider = e.target.value; c.baseUrl = ''; c.model = PROVIDERS[c.provider].kind === 'mock' ? 'echo' : ''; if (!c.name || c.name === '새 연결' || Object.values(PROVIDERS).some(p => p.name === c.name)) c.name = PROVIDERS[c.provider].name; await save(); refresh(); } },
      GROUPS.map(g => h('optgroup', { label: g }, Object.entries(PROVIDERS).filter(([, p]) => p.group === g).map(([k, p]) => h('option', { value: k, selected: c.provider === k }, p.name)))));
    const result = h('div.test-out');
    const active = c.id === S.settings.activeConn;
    return h('div.editor',
      h('header.editor-head', h('h2', c.name), h('div.row',
        active ? h('em.badge.on', '사용 중') : btn('이 연결 사용', { ic: 'check', cls: 'primary', onclick: () => { S.set({ activeConn: c.id }); refresh(); } }),
        iconBtn('copy', '복제', async () => { await S.save('conns', { ...structuredClone(c), id: uid(), name: c.name + ' (사본)', apiKey: Secrets.is(c.apiKey) ? '' : c.apiKey, serviceAccount: Secrets.is(c.serviceAccount) ? '' : c.serviceAccount }, true); if (Secrets.is(c.apiKey) || Secrets.is(c.serviceAccount)) toast('서버에 보관한 키는 사본에 따라가지 않아요. 사본에 키를 다시 넣어 주세요.'); refresh(); }),
        iconBtn('trash', '삭제', async () => { if (await confirmBox(`"${c.name}" 연결을 삭제할까요?`, '삭제', true)) { await S.remove('conns', c.id); if (active) S.set({ activeConn: S.conns[0]?.id || '' }); refresh(); } }))),
      h('div.form', h('label.field.half', h('span.field-label', '이름'), h('input.inp', { value: c.name, oninput: e => { c.name = e.target.value; sv(); } })), h('label.field.half', h('span.field-label', '제공자'), provider)),
      def.note && h('p.hint', def.note),
      def.kind !== 'mock' && form(c, [
        { k: 'baseUrl', label: '주소', ph: def.base || def.ph || 'https://…/v1', hint: def.base ? '비워 두면 기본 주소를 씁니다. 리버스 프록시 주소를 넣어도 됩니다.' : '이 제공자는 주소를 직접 넣어야 합니다.' }], sv),
      keyField(c, def, save),
      def.kind === 'vertex' && h('div.card.sa-box', h('h3.form-sec', '서비스 계정으로 연결'),
        h('p.hint', 'Google Cloud 에서 받은 서비스 계정 키(.json)를 붙여넣거나 파일로 가져오면, 프로젝트 ID 는 자동으로 채워집니다. Gemini 와 Claude(claude-… 모델 ID) 모두 이 방식으로 쓸 수 있어요.'),
        saField(c, save),
        form(c, [
          { k: 'region', label: '리전', type: 'select', opts: ['global', 'us-central1', 'us-east5', 'us-east4', 'us-west1', 'europe-west1', 'europe-west4', 'asia-northeast1', 'asia-northeast3', 'asia-southeast1'], half: true }, { k: 'project', label: '프로젝트 ID', half: true, ph: '키에서 자동으로 읽습니다' }], sv)),
      h('div.field', h('span.field-label', '모델'), h('div.row', modelInp, dl, btn('목록 불러오기', { ic: 'refresh', cls: 'ghost', onclick: () => load(false) })), chips),
      def.kind !== 'mock' && h('details.adv', h('summary', icon('sliders', 15), '고급 설정'), form(c, [
        { k: 'proxy', label: '드림랜드 서버를 거쳐 연결', type: 'check', hint: '브라우저에서 직접 연결이 막힐 때(CORS) 켜세요.' },
        def.kind === 'anthropic' && { k: 'cache', label: '프롬프트 캐싱 사용', type: 'check', hint: '같은 앞부분을 반복해 보낼 때 비용을 줄입니다.' },
        (def.kind === 'openai' || def.kind === 'azure') && { k: 'postProcess', label: '메시지 정리 방식', type: 'select', opts: [['none', '없음'], ['merge', '연속된 역할 합치기'], ['semi', '준엄격 (역할 번갈아)'], ['strict', '엄격 (user 먼저 · 역할 번갈아)'], ['single', '단일 user 메시지']], hint: '역할 순서에 까다로운 모델에서 오류가 날 때 바꿔 보세요.' },
        TEXT_PROVIDER_KINDS.includes(def.kind) && { k: 'instruct', label: '인스트럭트 템플릿', type: 'select', half: true, opts: [['', '고급 포맷팅 설정을 따름'], ['plain', '인스트럭트 끄기 (이름: 대사)'], ['custom', '고급 포맷팅에서 편집 중인 템플릿 (항상 켬)'], ...tplList('instruct').map(t => [t.name, t.name])], hint: '모델이 학습한 형식에 맞춰 고르세요. 이 연결에서만 따로 씁니다.' },
        TEXT_PROVIDER_KINDS.includes(def.kind) && { k: 'context', label: '컨텍스트 템플릿', type: 'select', half: true, opts: [['', '고급 포맷팅 설정을 따름'], ...tplList('context').map(t => [t.name, t.name])], hint: '스토리 스트링과 구분자.' },
        { k: 'extraBody', label: '요청 본문에 덧붙일 값 (JSON)', type: 'area', rows: 3, ph: '{ "provider": { "order": ["…"] } }', hint: '제공자 전용 옵션을 그대로 넘길 때 씁니다.' },
        { k: 'extraHeaders', label: '추가 헤더 (JSON)', type: 'area', rows: 2, ph: '{ "X-Custom": "값" }' }], sv)),
      h('div.row', btn('연결 테스트', { ic: 'play', onclick: async () => { result.textContent = '보내는 중…'; result.className = 'test-out'; try { const r = await streamChat(c, { stream: false, maxTokens: 64 }, [{ role: 'user', content: 'Say "hello" in one word.' }]); result.textContent = '응답: ' + (r.text.trim() || '(빈 응답)'); result.classList.add('ok'); } catch (e) { result.textContent = e.message; result.classList.add('err'); } } }), result));
  },
}));

// ════════ 설정 ════════
registerPage('settings', root => {
  const st = S.settings;
  const apply = () => { S.set({}); applyTheme(); };
  root.append(h('section.pagebox',
    pageHead('settings', '설정'),
    h('div.card', form(st, [{ section: '대화 화면' }, { k: 'showMeta', label: '메시지에 모델·시간·토큰 표시', type: 'check' }, { k: 'defaultMode', label: '새 대화의 기본 모드', type: 'select', opts: [['rp', 'RP 모드 (소설처럼)'], ['talk', '대화 모드 (메신저처럼)']], half: true }, { k: 'modes.talkTokens', label: '대화 모드 최대 응답 토큰', type: 'num', half: true },
      { k: 'modes.talkPrompt', label: '대화 모드 지시문', type: 'area', rows: 4, ph: TALK_DEFAULT, hint: '비워 두면 기본 지시문을 씁니다. 대화 모드는 프리셋의 프롬프트 블록 대신 이 지시문과 캐릭터 카드, 시각이 찍힌 기록으로 조립됩니다.' },
      { k: 'modes.stagger', label: '대화 모드: 말풍선을 한 줄씩 차례로 보여 주기', type: 'check' }, { k: 'modes.commands', label: '대화 모드: 캐릭터가 반응 · 상태 변경 · 셀카 · 기억 명령을 쓸 수 있게 하기', type: 'check' },
      { k: 'modes.presenceDelay', label: '대화 모드: 상태에 따라 답장을 늦추기 (자리 비움·방해 금지는 늦게, 오프라인은 답장 없음)', type: 'check' },
      { k: 'modes.scenes', label: '대화 모드: 만나거나 일이 벌어지면 장면으로 넘어가기 (캐릭터가 스스로 열 수 있음)', type: 'check' }, { k: 'modes.sceneStart', label: '대화 모드: 장면이 열리면 캐릭터가 바로 첫 장면을 쓰기', type: 'check' },
      { k: 'modes.later', label: '대화 모드: "이따 연락할게" 같은 약속을 기억했다가 그 시간에 먼저 연락하기', type: 'check' }, { k: 'modes.away', label: '대화 모드: 오래 자리를 비우면 그 사이에 온 연락 남겨 두기', type: 'check' }, { k: 'modes.notify', label: '대화 모드: 화면을 안 보고 있을 때 온 연락을 알림으로 받기', type: 'check' },
      { k: 'modes.auto', label: '대화 모드: 내가 조용하면 캐릭터가 먼저 말 걸기', type: 'check' }, { k: 'modes.autoMinutes', label: '몇 분 조용하면 (연달아 걸 때마다 두 배)', type: 'num', min: 1, half: true },
      { k: 'enterSend', label: 'Enter 로 보내기 (Shift+Enter 줄바꿈)', type: 'check' }, { k: 'autoScroll', label: '답변을 따라 자동 스크롤', type: 'check' }], apply),
      h('p.hint', '색·글꼴·말풍선 같은 겉모습은 ', h('a', { href: '#', onclick: e => { e.preventDefault(); go('themes'); } }, '꾸미기'), ' 화면에서 바꿉니다.')),
    h('div.card', h('h3.form-sec', '고급 포맷팅'), h('p.hint', '컨텍스트 템플릿(스토리 스트링) · 인스트럭트 템플릿 · 시스템 프롬프트 · 추론 서식 · 중단 문자열 · 응답 시작 문구는 한 화면에 모여 있습니다.'),
      h('div.row.wrap', btn('고급 포맷팅 열기', { ic: 'sliders', cls: 'primary', onclick: () => go('format') }), h('small.hint', `컨텍스트 ${AF().context.name || '직접 설정'} · 인스트럭트 ${AF().instruct.enabled ? AF().instruct.name || '직접 설정' : '꺼짐'} · 추론 ${AF().reasoning.name || '직접 설정'}`))),
    h('div.card', form(st, [{ section: '상태 트래커' }, { k: 'tracker.enabled', label: '상태창 켜기 — 대화 위에 지금 상태를 띄웁니다', type: 'check' }, { k: 'tracker.mode', label: '상태를 갱신하는 방법', type: 'select', opts: [['call', '답변 뒤에 따로 묻기 (추가 호출 1회, 안정적)'], ['inline', '답변에 함께 적게 하기 (추가 호출 없음)']] }, { k: 'tracker.hud', label: '대화 화면 위에 상태창 보이기', type: 'check' }, { k: 'tracker.inject', label: '추적한 상태를 프롬프트에 넣기', type: 'check' }, { k: 'tracker.fields', label: '추적 항목', type: 'area', rows: 5, hint: '한 줄에 하나씩 "이름: 설명" 으로 적습니다. "호감도 (0-100): 설명" 처럼 범위를 적으면 막대로 보입니다.' }], apply)),
    h('div.card', form(st, [{ section: '입력 도우미' }, { k: 'translate.auto', label: '답변이 오면 자동으로 번역해서 보여 주기 (추가 호출 1회)', type: 'check' }, { k: 'translate.lang', label: '번역 대상 언어', half: true }, { k: 'userNameFallback', label: '페르소나가 없을 때 이름', half: true }], apply),
      h('div.row.wrap', btn('빠른 버튼 세트 · 자동 진행 · 명령어', { ic: 'play', cls: 'ghost', onclick: () => go('quick') }), h('small.hint', '입력창 위의 버튼은 세트로 묶어 캐릭터 · 대화방마다 다르게 둘 수 있습니다.'))),
    h('div.card', h('h3.form-sec', '보안'),
      h('p.hint', Vault.on ? (Vault.locked ? 'API 키가 잠겨 있습니다. 잠금을 풀어야 모델을 호출할 수 있어요.' : 'API 키 · 서비스 계정 키 · NovelAI 키가 암호화되어 저장되고 있습니다.') : '암호를 걸면 API 키 · 서비스 계정 키 · NovelAI 키를 암호화해서 저장합니다. 앱을 열 때마다 암호를 한 번 입력합니다. 암호를 잊으면 키를 다시 넣어야 해요.'),
      h('div.row.wrap',
        !Vault.on && btn('키 잠금 켜기', { ic: 'check', cls: 'primary', onclick: async () => { const a = await promptBox('새 잠금 암호 (8자 이상 권장)'); if (!a) return; const b = await promptBox('암호를 한 번 더 입력'); if (a !== b) return toast('두 암호가 달라요', 'err'); try { await Vault.enable(a); toast('키를 암호화했어요', 'ok'); refresh(); } catch (e) { toast(e.message, 'err'); } } }),
        Vault.locked && btn('잠금 풀기', { ic: 'check', cls: 'primary', onclick: async () => { const p = await promptBox('잠금 암호'); if (p == null) return; if (await Vault.unlock(p).catch(() => false)) { toast('잠금을 풀었어요', 'ok'); refresh(); } else toast('암호가 맞지 않아요', 'err'); } }),
        Vault.on && !Vault.locked && btn('키 잠금 끄기', { cls: 'ghost', onclick: async () => { if (!(await confirmBox('키 잠금을 끄면 키가 다시 평문으로 저장됩니다. 끌까요?', '끄기', true))) return; await Vault.disable(); refresh(); } })),
      h('div.key-state.wide', icon('lock', 15), h('b', Secrets.ok ? (Secrets.on ? '키를 드림랜드 서버에 보관하는 중' : '서버 보관 꺼짐') : '서버 보관을 쓸 수 없음'), h('span.key-where', Secrets.ok ? `보관된 키 ${Object.values(Secrets.items).reduce((n, f) => n + Object.keys(f).length, 0)}개` : '드림랜드 서버(start.bat)로 열어야 합니다')),
      h('p.hint', 'API 키를 서버의 파일(data/secrets.json)에만 두고 브라우저에는 남기지 않습니다. 저장한 키는 화면에 다시 나오지 않고, 요청을 보낼 때 서버가 끼워 넣으며, 키를 넣을 때의 주소로만 보냅니다. 확장이나 가져온 카드가 키를 읽어 갈 수 없습니다.'),
      Secrets.ok ? h('div.row.wrap', Secrets.on
        ? btn('서버 보관 끄고 키를 브라우저로 되돌리기', { cls: 'ghost', onclick: async () => { if (!(await confirmBox('키를 서버에서 꺼내 이 브라우저에 다시 저장합니다. 서버를 실행한 PC 에서만 할 수 있어요. 계속할까요?', '되돌리기', true))) return; try { await Secrets.restore(); st.security = { ...st.security, serverKeys: false }; S.set({}); toast('키를 브라우저로 되돌렸어요'); refresh(); } catch (e) { toast(e.message, 'err'); } } })
        : btn('서버 보관 켜기', { ic: 'check', cls: 'primary', onclick: () => { st.security = { ...st.security, serverKeys: true }; S.set({}); toast('잠시 뒤 키가 서버 보관으로 옮겨집니다', 'ok'); setTimeout(refresh, 1500); } })) : null,
      form(st, [{ k: 'security.blockRemoteImages', label: '메시지 속 외부 이미지를 자동으로 불러오지 않기 (추적 방지)', type: 'check' }], apply),
      h('p.hint', '메시지와 카드에 든 HTML 은 스크립트·이벤트 속성·폼을 걸러 낸 뒤 보여 줍니다. 확장은 모든 데이터에 접근할 수 있으니 믿을 수 있는 것만 켜세요. 다른 기기에서 접속(start-lan.bat)할 때는 실행 창에 표시되는 접속 키가 필요합니다.')),
    h('div.card', h('h3.form-sec', '데이터'), h('p.hint', '모든 데이터는 이 브라우저의 저장소에 보관됩니다. 가끔 백업 파일을 받아 두세요.'),
      h('div.row.wrap',
        btn('백업 내보내기', { ic: 'import', onclick: async () => download(`dreamland-backup-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(await S.exportAll())) }),
        btn('백업에서 복원', { ic: 'upload', onclick: async () => { const [f] = await pickFiles({ accept: '.json' }); if (!f) return; try { await S.importAll(JSON.parse(await f.text()), false); toast('복원했어요. 화면을 새로 엽니다.', 'ok'); setTimeout(() => location.reload(), 700); } catch (e) { toast(e.message, 'err'); } } }),
        btn('모든 데이터 지우기', { ic: 'trash', cls: 'danger', onclick: async () => { if (!(await confirmBox('캐릭터·대화·설정을 모두 지울까요? 되돌릴 수 없습니다.', '모두 지우기', true))) return; for (const c of S.conns) await Secrets.del(c.id).catch(() => { }); for (const s of ['chars', 'chats', 'msgs', 'personas', 'lore', 'presets', 'conns', 'regex', 'kv', 'assets', 'mem']) await DB.clear(s); location.reload(); } })))));
});

// ════════ 고급 포맷팅 ════════
// Advanced Formatting 과 같은 구성: 컨텍스트 템플릿 · 인스트럭트 템플릿 · 시스템 프롬프트 · 추론 · 그 밖의 설정
let afTab = 'context';
/** 템플릿 고르기 · 저장 · 이름 바꾸기 · 가져오기 · 내보내기 · 되돌리기 · 삭제 */
function tplBar(kind, redraw) {
  const cur = AF()[kind], list = tplList(kind), known = list.some(t => t.name === cur.name), mine = list.filter(t => !t.builtin), stock = list.filter(t => t.builtin);
  const opt = t => h('option', { value: t.name, selected: t.name === cur.name }, t.name + (t.edited ? ' (고침)' : ''));
  const sel = h('select.inp', { title: `지금 쓰는 ${KINDS[kind]}`, onchange: e => { tplApply(kind, e.target.value); redraw(); } },
    !known && h('option', { value: '', selected: true }, cur.name ? `${cur.name} (보관함에 없음)` : '(저장하지 않은 설정)'),
    mine.length ? h('optgroup', { label: '내 템플릿' }, mine.map(opt)) : null, h('optgroup', { label: '기본 제공' }, stock.map(opt)));
  const badge = h('em.badge.af-dirty', '저장 안 됨');
  const mark = () => { badge.hidden = !tplDirty(kind); };
  const saveAs = async () => { const name = (await promptBox('새 템플릿 이름', cur.name ? cur.name + ' (사본)' : ''))?.trim(); if (!name) return; tplSave(kind, { ...tplCurrent(kind), name }); cur.name = name; S.set({}); toast(`"${name}" 으로 저장했어요`, 'ok'); redraw(); };
  mark();
  return { mark, el: h('div.af-bar', sel, badge, h('div.af-tools',
    iconBtn('check', '지금 내용을 이 템플릿에 저장', () => { if (!cur.name) return saveAs(); tplSave(kind, tplCurrent(kind)); toast(`"${cur.name}" 템플릿을 저장했어요`, 'ok'); redraw(); }),
    iconBtn('edit', '이름 바꾸기', async () => { const old = cur.name, name = (await promptBox('템플릿 이름', old))?.trim(); if (!name || name === old) return; tplSave(kind, { ...tplCurrent(kind), name }); if (old && !tplIsBuiltin(kind, old)) tplDelete(kind, old); cur.name = name; S.set({}); redraw(); }),
    iconBtn('copy', '다른 이름으로 저장', saveAs),
    iconBtn('upload', '템플릿 가져오기 (실리태번 JSON)', async () => { const files = await pickFiles({ accept: '.json', multiple: true }); let n = 0; for (const f of files) { try { const got = tplImport(JSON.parse(await f.text()), f.name); n += got.length; const hit = got.find(g => g.kind === kind); if (hit) tplApply(kind, hit.name); } catch (e) { toast(`${f.name}: ${e.message}`, 'err'); } } if (n) { toast(`템플릿 ${n}개를 가져왔어요`, 'ok'); redraw(); } }),
    iconBtn('import', '템플릿 내보내기 (실리태번 JSON)', () => download(`${cur.name || KINDS[kind]}.json`, JSON.stringify(tplCurrent(kind), null, 4))),
    iconBtn('refresh', '저장된 값으로 되돌리기', async () => { if (!known) return toast('보관함에 없는 설정이에요'); const stockOnly = tplIsBuiltin(kind, cur.name) && list.find(t => t.name === cur.name)?.edited; if (stockOnly && await confirmBox(`"${cur.name}" 을(를) 기본값으로 되돌릴까요? 고쳐서 저장한 내용은 사라집니다.`, '기본값으로')) tplDelete(kind, cur.name); tplApply(kind, cur.name); redraw(); }),
    iconBtn('trash', '템플릿 삭제', async () => { if (!known || tplIsBuiltin(kind, cur.name)) return toast('기본 제공 템플릿은 지울 수 없어요. 고친 내용은 되돌리기로 지웁니다.'); if (!(await confirmBox(`"${cur.name}" 템플릿을 삭제할까요?`, '삭제', true))) return; tplDelete(kind, cur.name); tplApply(kind, tplList(kind)[0].name); redraw(); }))) };
}
const NAMES_OPTS = [['none', '붙이지 않기'], ['force', '그룹 채팅에서만'], ['always', '항상']];
const ROLE_OPTS = [[0, '시스템'], [1, '사용자'], [2, '어시스턴트']];
registerPage('format', root => {
  const F = AF(), conn = S.conn(), def = conn && PROVIDERS[conn.provider], textConn = !!def && TEXT_PROVIDER_KINDS.includes(def.kind);
  const redraw = () => refresh();
  const TABS = [['context', '컨텍스트 템플릿'], ['instruct', '인스트럭트 템플릿'], ['sysprompt', '시스템 프롬프트'], ['reasoning', '추론'], ['misc', '그 밖의 설정']];
  const seq = (k, label, hint, o = {}) => ({ k, label, type: 'area', rows: 2, half: true, hint, ...o });
  const status = h('p.hint.af-status');
  const drawStatus = () => {
    if (!conn) return status.replaceChildren('연결이 아직 없어요. 텍스트 완성형 연결(KoboldCpp · llama.cpp · 텍스트 완성 등)을 추가하면 아래 템플릿으로 프롬프트를 조립합니다.');
    if (!textConn) return status.replaceChildren(h('b', conn.name), ' 은(는) 채팅 완성형 연결이라 흐리게 표시된 항목은 쓰이지 않습니다. 프롬프트는 프리셋의 블록으로 조립돼요.');
    if (F.storyMode === false) return status.replaceChildren(h('b', conn.name), ' · 스토리 스트링 조립이 꺼져 있어 프리셋 블록을 인스트럭트 형식으로 이어 붙입니다.');
    const r = resolve(conn);
    status.replaceChildren(h('b', conn.name), ` · 인스트럭트 `, h('em.badge' + (r.instruct ? '.on' : ''), r.instruct ? r.instruct.name || '저장하지 않은 설정' : '꺼짐'), ' 컨텍스트 ', h('em.badge.on', r.context.name || '저장하지 않은 설정'), r.why ? ` — ${r.why}` : '');
  };
  drawStatus();
  const pane = h('div.af-pane');
  const card = (cls, ...kids) => h(`div.card.af-card${cls}${!textConn && conn && cls.includes('af-tc') ? '.af-dim' : ''}`, kids);
  const draw = () => {
    let bar; const ch = () => { S.set({}); bar?.mark(); drawStatus(); };
    if (afTab === 'context') {
      bar = tplBar('context', redraw);
      pane.replaceChildren(
        card('.af-tc', bar.el, form(F.context, [
          { k: 'story_string', label: '스토리 스트링', type: 'area', rows: 9, hint: '{{#if 이름}}…{{/if}} 로 내용이 있을 때만 넣습니다. 쓸 수 있는 이름: system · description · personality · scenario · persona · wiBefore(loreBefore) · wiAfter(loreAfter) · anchorBefore · anchorAfter · mesExamples · mesExamplesRaw · char · user. {{trim}} 은 앞뒤 줄바꿈을 지웁니다.' },
          { k: 'story_string_position', label: '위치', type: 'select', opts: [[0, '기본 (컨텍스트 맨 위)'], [1, '대화 중간 @ 깊이']], third: true }, { k: 'story_string_depth', label: '깊이', type: 'num', min: 0, third: true }, { k: 'story_string_role', label: '역할', type: 'select', opts: ROLE_OPTS, third: true },
          { k: 'example_separator', label: '예시 구분자', half: true, hint: '대화 예시 블록마다 앞에 들어갑니다.' }, { k: 'chat_start', label: '대화 시작 표시', half: true, hint: '예시와 실제 대화 사이에 들어갑니다.' },
          { k: 'use_stop_strings', label: '구분자를 중단 문자열로 쓰기', type: 'check', hint: '대화 시작 표시와 예시 구분자' }, { k: 'names_as_stop_strings', label: '이름을 중단 문자열로 쓰기', type: 'check', hint: '모델이 내 대사를 대신 쓰지 않게' }], ch)),
        card('', form(F, [{ section: '컨텍스트 서식' },
          { k: 'alwaysForceName2', label: '프롬프트 끝에 항상 캐릭터 이름 붙이기', type: 'check', hint: '인스트럭트를 끈 텍스트 완성형에서' }, { k: 'singleLine', label: '요청마다 한 줄만 생성', type: 'check' }, { k: 'collapseNewlines', label: '연속된 줄바꿈 합치기', type: 'check', hint: '텍스트 완성형은 보내는 프롬프트에도 적용' },
          { k: 'trimSpaces', label: '앞뒤 공백 다듬기', type: 'check' }, { k: 'trimSentences', label: '끊긴 문장 잘라 내기', type: 'check' }, { k: 'fixMarkdown', label: '닫히지 않은 * 와 따옴표 자동으로 닫기', type: 'check' },
          { k: 'storyMode', label: '텍스트 완성형 연결은 스토리 스트링으로 조립', type: 'check', hint: '끄면 프리셋 블록을 그대로 이어 붙입니다' }], ch)),
        card('', form(F, [{ section: '채팅 완성형에서 쓰는 표시' }, { k: 'ccExampleSep', label: '예시 대화 머리말', half: true, ph: '[Example dialogue]', hint: '캐릭터 카드의 <START> 자리에 들어갑니다.' }, { k: 'ccChatStart', label: '새 대화 표시', half: true, ph: '[Start a new chat]', hint: '기록의 맨 앞에 한 번 들어갑니다. 비우면 넣지 않아요.' }], ch)));
    } else if (afTab === 'instruct') {
      bar = tplBar('instruct', redraw);
      pane.replaceChildren(
        card('.af-tc', form(F.instruct, [{ k: 'enabled', label: '인스트럭트 모드 사용', type: 'check', live: true, hint: '끄면 "이름: 대사" 형식으로 보냅니다' }, { k: 'bind_to_context', label: '컨텍스트 템플릿과 묶기', type: 'check', hint: '인스트럭트 템플릿을 고르면 같은 이름의 컨텍스트 템플릿도 함께 고릅니다' }], ch),
          bar.el, form(F.instruct, [
            { k: 'activation_regex', label: '활성화 정규식', ph: '예: /llama(-)?[3|3.1]/i', hint: '연결의 모델 이름이 이 정규식에 맞으면 이 템플릿을 자동으로 씁니다 (인스트럭트 모드가 켜져 있을 때).' },
            { k: 'wrap', label: '시퀀스를 줄바꿈으로 감싸기', type: 'check' }, { k: 'macro', label: '시퀀스 안의 매크로 바꾸기', type: 'check' }, { k: 'sequences_as_stop_strings', label: '시퀀스를 중단 문자열로 쓰기', type: 'check' }, { k: 'skip_examples', label: '대화 예시는 시퀀스로 감싸지 않기', type: 'check' },
            { k: 'names_behavior', label: '이름 붙이기', type: 'select', opts: NAMES_OPTS, half: true }], ch)),
        card('.af-tc.af-seq', form(F.instruct, [
          { section: '스토리 스트링 시퀀스' }, seq('story_string_prefix', '스토리 스트링 접두', '스토리 스트링 앞에 (기본 위치일 때만)'), seq('story_string_suffix', '스토리 스트링 접미', '스토리 스트링 뒤에'),
          { section: '사용자 메시지 시퀀스' }, seq('input_sequence', '사용자 메시지 접두', '사용자 메시지 앞 · 대필할 때의 마지막 줄'), seq('input_suffix', '사용자 메시지 접미'),
          { section: '어시스턴트 메시지 시퀀스' }, seq('output_sequence', '어시스턴트 메시지 접두', '어시스턴트 메시지 앞 · 답변을 받을 마지막 줄'), seq('output_suffix', '어시스턴트 메시지 접미'),
          { section: '시스템 메시지 시퀀스' }, seq('system_sequence', '시스템 메시지 접두', '작가 노트 · 로어북처럼 대화 중간에 끼우는 시스템 메시지 앞'), seq('system_suffix', '시스템 메시지 접미'),
          { k: 'system_same_as_user', label: '시스템 메시지를 사용자 메시지와 같은 시퀀스로', type: 'check' },
          { section: '기타 시퀀스' }, seq('first_output_sequence', '첫 어시스턴트 접두', '대화의 첫 메시지가 어시스턴트일 때'), seq('last_output_sequence', '마지막 어시스턴트 접두', '답변을 받을 마지막 줄. 비우면 어시스턴트 메시지 접두'),
          seq('first_input_sequence', '첫 사용자 접두', '대화의 첫 메시지가 사용자일 때'), seq('last_input_sequence', '마지막 사용자 접두', '마지막 사용자 메시지 앞 · 대필할 때의 마지막 줄'),
          seq('last_system_sequence', '시스템 지시 접두', '번역 · 요약 같은 보조 호출의 마지막 줄'), seq('stop_sequence', '중단 시퀀스', '이 문자열이 나오면 그 뒤는 잘라 냅니다'),
          seq('user_alignment_message', '사용자 채움 메시지', '대화가 사용자 메시지로 시작하지 않으면 맨 앞에 끼웁니다', { half: false })], ch)));
    } else if (afTab === 'sysprompt') {
      bar = tplBar('sysprompt', redraw);
      pane.replaceChildren(card('.af-tc', form(F.sysprompt, [{ k: 'enabled', label: '시스템 프롬프트 사용', type: 'check', hint: '스토리 스트링의 {{system}} 자리에 들어갑니다' }], ch), bar.el,
        form(F.sysprompt, [{ k: 'content', label: '프롬프트 내용', type: 'area', rows: 9, hint: '캐릭터 카드에 메인 프롬프트 덮어쓰기가 있으면 그것이 먼저입니다 ({{original}} 은 이 내용으로 바뀜).' }, { k: 'post_history', label: '후속 지시', type: 'area', rows: 4, hint: '대화 기록 맨 끝에 사용자 메시지로 들어갑니다.' }], ch),
        h('p.hint', '채팅 완성형 연결은 프리셋의 메인 프롬프트 · 후속 지시 블록을 씁니다.')));
    } else if (afTab === 'reasoning') {
      bar = tplBar('reasoning', redraw);
      pane.replaceChildren(
        card('', form(F.reasoning, [{ k: 'autoParse', label: '자동 분리', type: 'check', hint: '답변 앞의 접두 … 접미 사이를 생각 과정으로 떼어 냅니다. 접두와 접미가 모두 있어야 해요' }, { k: 'autoExpand', label: '자동으로 펼치기', type: 'check' }, { k: 'addToPrompts', label: '프롬프트에 다시 넣기', type: 'check', hint: '지난 답변의 생각 과정을 아래 서식으로 감싸 함께 보냅니다' }, { k: 'maxAdditions', label: '다시 넣을 최대 개수', type: 'num', min: 0, third: true, hint: '마지막 메시지부터 셉니다.' }], ch)),
        card('', h('h3.form-sec', '추론 서식'), bar.el, form(F.reasoning, [{ k: 'prefix', label: '접두', type: 'area', rows: 2, third: true, hint: '생각 과정 앞' }, { k: 'suffix', label: '접미', type: 'area', rows: 2, third: true, hint: '생각 과정 뒤' }, { k: 'separator', label: '구분', type: 'area', rows: 2, third: true, hint: '생각 과정과 답변 사이' }], ch)));
    } else {
      const stops = h('textarea.inp', { rows: 3, spellcheck: false, placeholder: '한 줄에 하나씩, 또는 ["Ford", "BMW"] 같은 JSON 배열', value: (F.stopStrings || []).join('\n'), oninput: e => { const v = e.target.value.trim(); let list = null; if (v.startsWith('[')) { try { const j = JSON.parse(v); if (Array.isArray(j)) list = j.filter(x => typeof x === 'string' && x); } catch { } } F.stopStrings = list || v.split('\n').map(x => x.trim()).filter(Boolean); ch(); } });
      const model = conn?.model || '', bound = !!F.modelMap?.[model];
      pane.replaceChildren(
        card('', h('h3.form-sec', '사용자 정의 중단 문자열'), h('label.field', stops, h('small.hint', '모든 프리셋과 연결에 함께 적용됩니다. 줄바꿈은 \\n 으로 적습니다.')), form(F, [{ k: 'stopMacro', label: '중단 문자열 안의 매크로 바꾸기', type: 'check', hint: '{{user}} · {{char}}' }], ch)),
        card('', form(F, [{ section: '토큰' }, { k: 'tokenPadding', label: '토큰 여유분', type: 'num', half: true, hint: '토큰 수를 어림하므로 컨텍스트에서 이만큼 남겨 둡니다.' }], ch)),
        card('', form(F, [{ section: '응답 시작 문구' }, { k: 'startReplyWith', label: '답변을 이 글로 시작하게 하기', type: 'area', rows: 2, hint: '프리셋에 프리필이 있으면 그것이 먼저입니다. 프리필을 받지 않는 모델(최신 Claude 등)에서는 자동으로 빠집니다.' }, { k: 'showBias', label: '응답 시작 문구를 답변에 보이기', type: 'check' }], ch)),
        card('', form(F, [{ section: '마크다운으로 해석하지 않을 문자열' }, { k: 'mdEscape', label: '쉼표로 구분 (사이에 공백 없이)', ph: '***,---', hint: '한 줄이 통째로 이 문자열이면 구분선이나 강조로 바꾸지 않고 글자 그대로 보여 줍니다.' }], ch)),
        card('.af-tc', h('h3.form-sec', '모델에 템플릿 묶기'), h('p.hint', model ? `지금 모델: ${model}` : '모델이 선택된 연결이 없어요.'),
          model && h('label.check', h('input', { type: 'checkbox', checked: bound, onchange: e => { F.modelMap ||= {}; if (e.target.checked) F.modelMap[model] = { instruct: F.instruct.enabled ? F.instruct.name : '', context: F.context.name }; else delete F.modelMap[model]; ch(); draw(); } }), h('i'), h('span', '이 모델을 쓸 때는 지금 고른 인스트럭트 · 컨텍스트 템플릿을 자동으로 쓰기'), bound && h('small', `${F.modelMap[model].instruct || '인스트럭트 꺼짐'} · ${F.modelMap[model].context || '컨텍스트 그대로'}`)),
          Object.keys(F.modelMap || {}).length ? h('div.af-map', Object.entries(F.modelMap).map(([m, v]) => h('button.chip.on', { title: '눌러서 풀기', onclick: () => { delete F.modelMap[m]; ch(); draw(); } }, `${m} → ${v.instruct || '꺼짐'} / ${v.context || '그대로'} ✕`))) : null));
    }
  };
  draw();
  root.append(h('section.pagebox.af',
    pageHead('advanced formatting', '고급 포맷팅',
      btn('전체 가져오기', { ic: 'upload', cls: 'ghost', title: '고급 포맷팅 전체 내보내기 파일 · 낱개 템플릿 파일 · settings.json', onclick: async () => { const files = await pickFiles({ accept: '.json', multiple: true }); let n = 0; for (const f of files) { try { n += tplImport(JSON.parse(await f.text()), f.name).length; } catch (e) { toast(`${f.name}: ${e.message}`, 'err'); } } if (n) { toast(`${n}개 항목을 가져왔어요`, 'ok'); redraw(); } } }),
      btn('전체 내보내기', { ic: 'import', cls: 'ghost', title: '지금 고른 템플릿 넷과 응답 시작 문구를 한 파일로', onclick: () => download('dreamland-advanced-formatting.json', JSON.stringify(masterExport(), null, 4)) })),
    status,
    h('div.tabs', TABS.map(([k, l]) => h(`button.tab${afTab === k ? '.on' : ''}`, { onclick: () => { afTab = k; refresh(); } }, l))),
    pane));
});

