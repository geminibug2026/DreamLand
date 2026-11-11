// ── Dreamland main: 부팅 · 내비게이션 · 빠른 이동 ──
import { S, h, on, Vault, Secrets, debounce } from './core.js';
import { PROVIDERS } from './engine.js';
import { icon, go, toast, route, avatar, modal, moonIcon, menu } from './ui.js';
import { applyTheme, initFx } from './theme.js';
import { X } from './hooks.js';
import './chat.js';
import './editors.js';
import './importer.js';
import './themes.js';
import './studio.js';
import './savestate.js';
import { initExtensions } from './ext.js';

// 기능 모듈: 하나가 깨져도 나머지와 본체는 뜨도록 따로 불러온다. 새 기능 모듈은 이 목록에 이름만 더하면 된다
const FEATURES = ['diary', 'f-memoria', 'f-scenebook', 'f-translate', 'f-assets', 'f-expressions', 'f-vectors', 'f-modules', 'f-regex'];
const failed = [];
async function loadFeatures() { await Promise.all(FEATURES.map(m => import(`./${m}.js`).catch(e => { console.error('[기능 모듈]', m, e); failed.push(m); }))); }

// [화면, 이름, 아이콘, 휴대폰 아래 탭에 고정]
// [화면, 이름, 아이콘, 휴대폰 아래 탭에 고정, 상단 메뉴 영문 이름, 상단에 바로 보이기]
const NAV = [['home', '캐릭터', 'home', true, 'HOME', true], ['chat', '대화', 'chat', true, 'CHAT', true], ['lore', '로어북', 'book', false, 'LOREBOOK', true], ['presets', '프리셋', 'sliders', true, 'PRESET', true], ['personas', '페르소나', 'user', false, 'PERSONA', true],
  ['conns', 'API 연결', 'plug', false, 'CONNECT', true], ['studio', '기능', 'sparkle', false, 'FEATURES', true], ['modules', '모듈', 'panel', false, 'MODULES'], ['diary', '일기장', 'note', false, 'DIARY'], ['themes', '꾸미기', 'heart', false, 'DECOR'], ['format', '고급 포맷팅', 'sliders', false, 'FORMAT'], ['regex', '정규식', 'code', false, 'REGEX'], ['exts', '확장 · 플러그인', 'grip', false, 'PLUGINS'], ['import', '이식', 'folder', false, 'MIGRATE'], ['settings', '설정', 'gear', false, 'SETTINGS']];
const navItems = () => [...NAV, ...X.pages.map(p => [p.id, p.label || '확장 화면', p.icon || 'sparkle', false, (p.label || 'EXT').toUpperCase()])];

function buildRail() {
  const rail = document.getElementById('rail');
  const tab = ([page, label, ic, main, en, top]) => h(`button${main ? '.main' : ''}${top ? '.top' : ''}${route.page === page ? '.on' : ''}`, { dataset: { page }, title: label, onclick: () => go(page) }, icon(ic, 21), h('span.ko', label), h('span.en', en || label));
  const rest = navItems().filter(n => !n[5]);
  rail.replaceChildren(
    h('button.logo', { title: 'Dreamland', onclick: () => go('home') }, moonIcon(22), h('b', 'DREAMLAND')),
    h('div.rail-nav', navItems().map(tab), h('button.more', { title: '더보기', onclick: moreSheet }, icon('menu', 21), h('span.ko', '더보기'))),
    h('div.rail-foot',
      h('button', { title: '빠른 이동 (Ctrl+K)', onclick: palette }, icon('search', 19)),
      h('button', { title: '꾸미기', onclick: () => go('themes') }, icon('heart', 19)),
      h('button', { title: '더 많은 메뉴', onclick: e => menu(e.currentTarget, rest.map(([page, label, ic]) => ({ label, ic, onclick: () => go(page) }))) }, icon('menu', 19))));
}
/** 시작할 때 키 잠금 풀기 */
function unlockPrompt() {
  const inp = h('input.inp', { type: 'password', placeholder: '잠금 암호', autocomplete: 'current-password' }); const msg = h('small.hint', 'API 키가 암호로 잠겨 있어요. 풀기 전에는 모델을 호출할 수 없습니다.');
  let box; const tryIt = async () => { try { if (await Vault.unlock(inp.value)) { toast('잠금을 풀었어요', 'ok'); box.close(); } else { msg.textContent = '암호가 맞지 않아요.'; msg.classList.add('err'); } } catch (e) { msg.textContent = e.message; } return false; };
  inp.addEventListener('keydown', e => { if (e.key === 'Enter') tryIt(); });
  box = modal({ title: '키 잠금 풀기', body: h('div.col', inp, msg), actions: [{ label: '나중에' }, { label: '풀기', cls: 'primary', onclick: tryIt }] });
}
function moreSheet() {
  let m;
  m = modal({ title: '더보기', body: h('div.more-grid', navItems().filter(n => !n[3]).map(([page, label, ic]) => h('button', { onclick: () => { m.close(); go(page); } }, icon(ic, 24), label))) });
}

function palette() {
  if (document.querySelector('.palette-wrap')) return;
  const inp = h('input.inp', { placeholder: '어디로 갈까요? 캐릭터, 대화, 메뉴 이름…' });
  const list = h('div.palette-list');
  const close = () => wrap.remove();
  let items = [], sel = 0;
  const draw = () => {
    const q = inp.value.trim().toLowerCase();
    const all = [
      ...navItems().map(([page, label, ic]) => ({ label, hint: '메뉴', ic, run: () => go(page) })),
      ...S.chars.map(c => ({ label: c.name, hint: '캐릭터와 최근 대화', av: c, run: async () => { const last = S.chats.filter(x => x.charIds.includes(c.id)).sort((a, b) => b.updatedAt - a.updatedAt)[0]; if (last) go('chat', last.id); else (await import('./chat.js')).startChat([c.id]); } })),
      ...[...S.chats].sort((a, b) => b.updatedAt - a.updatedAt).slice(0, 200).map(c => ({ label: (c.name || c.preview || '대화').slice(0, 60), hint: c.charIds.map(i => S.get('chars', i)?.name).filter(Boolean).join(', '), ic: 'chat', run: () => go('chat', c.id) })),
    ];
    items = all.filter(i => !q || (i.label + ' ' + i.hint).toLowerCase().includes(q)).slice(0, 30); sel = Math.min(sel, Math.max(0, items.length - 1));
    list.replaceChildren(...items.map((it, i) => h(`button.palette-item${i === sel ? '.on' : ''}`, { onclick: () => { close(); it.run(); } }, it.av ? avatar(it.av, 'xs') : icon(it.ic, 16), h('b', it.label), h('small', it.hint))));
  };
  inp.addEventListener('input', () => { sel = 0; draw(); });
  inp.addEventListener('keydown', e => {
    if (e.key === 'ArrowDown') { sel = Math.min(items.length - 1, sel + 1); draw(); e.preventDefault(); }
    else if (e.key === 'ArrowUp') { sel = Math.max(0, sel - 1); draw(); e.preventDefault(); }
    else if (e.key === 'Enter' && items[sel]) { close(); items[sel].run(); }
    else if (e.key === 'Escape') close();
  });
  const wrap = h('div.palette-wrap', { onmousedown: e => { if (e.target === wrap) close(); } }, h('div.palette', inp, list));
  document.body.append(wrap); draw(); inp.focus();
}

addEventListener('keydown', e => { if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); palette(); } });
addEventListener('unhandledrejection', e => { console.error(e.reason); toast(String(e.reason?.message || e.reason).slice(0, 200), 'err'); });

(async () => {
  try {
    await S.load();
    // 프리셋의 옛 '요약 메모리' 칸은 이제 장기기억이 들어가는 자리다
    for (const p of S.presets || []) { let ch = false; for (const b of p.blocks || []) if (b.kind === 'summary' && (b.name === '요약 메모리' || b.content === '[Story so far]\n{{slot}}')) { b.name = '장기기억 자리'; if (b.content === '[Story so far]\n{{slot}}') b.content = '{{slot}}'; ch = true; } if (ch) await S.save('presets', p, true); }
    // RP 는 소설처럼 보이는 것이 기본: 예전 판의 기본값(말풍선)이 저장돼 남아 있으면 한 번만 되돌린다. 꾸미기에서 다시 켤 수 있다
    if (!S.settings.migr?.rpNovel) { S.set({ rpBubbles: false, migr: { ...(S.settings.migr || {}), rpNovel: 1 } }); }
    await loadFeatures();
    applyTheme(); initFx();
    on('settings', p => { if ('motion' in p || 'theme' in p) { applyTheme(); buildRail(); } });
    buildRail();
    on('ext:changed', buildRail);
    on('route', page => document.querySelectorAll('#rail [data-page]').forEach(b => b.classList.toggle('on', b.dataset.page === page)));
    const last = S.settings.lastPage;
    go(S.chars.length && last && !String(last).startsWith('ext-') ? last : 'home', last === 'chat' ? S.settings.lastChat : undefined);
    // 키 보호: 서버가 있으면 키를 서버 파일로 옮기고 브라우저에는 꼬리표만 남긴다
    const baseOf = c => PROVIDERS[c.provider]?.base || '';
    const sweep = debounce(async () => { try { const n = await Secrets.sweep(baseOf); if (n) { toast(`API 키 ${n}개를 드림랜드 서버 보관으로 옮겼어요. 이제 브라우저에는 키가 남지 않습니다.`, 'ok'); if (['conns', 'settings', 'studio'].includes(route.page)) go(route.page, route.arg); } } catch (e) { console.warn('키 보관', e); } }, 600);
    if (await Secrets.init()) { sweep(); on('conns:saved', sweep); on('settings', sweep); on('vault', sweep); }
    if (Vault.locked) unlockPrompt();
    await initExtensions();
    if (failed.length) toast(`기능 ${failed.length}개를 불러오지 못했어요 (${failed.join(', ')}). 나머지는 그대로 쓸 수 있습니다.`, 'err');
  } catch (e) {
    console.error(e);
    document.getElementById('page').append(h('div.empty.big', h('p', '시작하지 못했어요: ' + e.message)));
  }
})();

// 화면은 안쪽 칸만 스크롤한다. 문서 자체가 밀려 올라가면 제자리로 돌린다 (글을 쓰는 중에는 자판 때문에 밀린 것이니 둔다)
addEventListener('scroll', () => {
  if (!scrollY && !scrollX) return;
  const a = document.activeElement, typing = a && (a.tagName === 'TEXTAREA' || a.isContentEditable || (a.tagName === 'INPUT' && !['checkbox', 'radio', 'range', 'color', 'file', 'button'].includes(a.type)));
  if (!typing) scrollTo(0, 0);
}, { passive: true });
