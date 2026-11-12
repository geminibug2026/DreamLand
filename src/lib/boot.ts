// ── Dreamland boot: 시작 절차 · 내비게이션 목록 · 빠른 이동 단축키 ── (옛 js/boot.js 의 화면 밖 부분)
// start(shell) 로 시작한다. 옆 내비 · 빠른 이동 · 화면 등록은 React 판(src/Shell.tsx · src/main.tsx)이 shell 로 건넨다
// 기능은 src/features/*.tsx 가 shell.pages 안에서 등록한다
import { S, h, on, Vault, Secrets, debounce } from './core';
import { PROVIDERS } from './engine';
import { go, route } from './router';
import { applyTheme, initFx } from './theme';
import { X } from './hooks';
import { initExtensions } from './ext';
import { modal } from '../ui/dom';
import { toast } from '../ui';
import type { NavItem } from './types';
import { onLang, t, tn } from '../i18n';

// [화면, 이름 키, 아이콘, 휴대폰 아래 탭에 고정, 상단 메뉴 영문 이름, 상단에 바로 보이기] — 이름은 navItems() 가 그릴 때 t(키)
export const NAV: NavItem[] = [['home', 'nav.home', 'home', true, 'HOME', true], ['chat', 'nav.chat', 'chat', true, 'CHAT', true], ['lore', 'nav.lore', 'book', false, 'LOREBOOK', true], ['presets', 'nav.presets', 'sliders', true, 'PRESET', true], ['personas', 'nav.personas', 'user', false, 'PERSONA', true],
  ['conns', 'nav.conns', 'plug', false, 'CONNECT', true], ['studio', 'nav.studio', 'sparkle', false, 'FEATURES', true], ['modules', 'nav.modules', 'panel', false, 'MODULES'], ['diary', 'nav.diary', 'note', false, 'DIARY'], ['themes', 'nav.themes', 'heart', false, 'DECOR'], ['format', 'nav.format', 'sliders', false, 'FORMAT'], ['regex', 'nav.regex', 'code', false, 'REGEX'], ['exts', 'nav.exts', 'grip', false, 'PLUGINS'], ['import', 'nav.import', 'folder', false, 'MIGRATE'], ['settings', 'nav.settings', 'gear', false, 'SETTINGS']];
/** 그릴 목록: 기본 화면은 지금 언어로, 확장이 더한 화면(X.pages)의 이름은 그대로 */
export const navItems = (): NavItem[] => [...NAV.map((n): NavItem => { const c = [...n] as NavItem; c[1] = t(n[1]); return c; }), ...X.pages.map((p): NavItem => [p.id, p.label || t('nav.extPage'), p.icon || 'sparkle', false, (p.label || 'EXT').toUpperCase()])];

export interface Shell { loaded?: () => void; rail?: () => void; palette?: () => void; pages?: () => void | Promise<void> }
let shell: Shell = {};
const buildRail = () => shell.rail?.();
const palette = () => shell.palette?.();

/** 시작할 때 키 잠금 풀기 */
function unlockPrompt() {
  const inp = h<HTMLInputElement>('input.inp', { type: 'password', placeholder: t('boot.unlock.pass'), autocomplete: 'current-password' }); const msg = h('small.hint', t('boot.unlock.hint'));
  let box: { close(): void } | undefined; const tryIt = async () => { try { if (await Vault.unlock(inp.value)) { toast(t('boot.unlock.done'), 'ok'); box?.close(); } else { msg.textContent = t('boot.unlock.wrong'); msg.classList.add('err'); } } catch (e) { msg.textContent = (e as Error).message; } return false; };
  inp.addEventListener('keydown', e => { if (e.key === 'Enter') tryIt(); });
  box = modal({ title: t('boot.unlock.title'), body: h('div.col', inp, msg), actions: [{ label: t('common.later') }, { label: t('boot.unlock.ok'), cls: 'primary', onclick: tryIt }] });
}

addEventListener('keydown', e => { if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); palette(); } });
addEventListener('unhandledrejection', e => { console.error(e.reason); toast(String(e.reason?.message || e.reason).slice(0, 200), 'err'); });

export async function start(opts: Shell = {}) {
  shell = opts;
  try {
    await S.load();
    shell.loaded?.();
    // 프리셋의 옛 '요약 메모리' 칸은 이제 장기기억이 들어가는 자리다
    for (const p of S.presets || []) { let ch = false; for (const b of p.blocks || []) if (b.kind === 'summary' && (b.name === '요약 메모리' || b.content === '[Story so far]\n{{slot}}')) { b.name = '장기기억 자리'; if (b.content === '[Story so far]\n{{slot}}') b.content = '{{slot}}'; ch = true; } if (ch) await S.save('presets', p, true); }
    // RP 는 소설처럼 보이는 것이 기본: 예전 판의 기본값(말풍선)이 저장돼 남아 있으면 한 번만 되돌린다. 꾸미기에서 다시 켤 수 있다
    if (!S.settings.migr?.rpNovel) { S.set({ rpBubbles: false, migr: { ...(S.settings.migr || {}), rpNovel: 1 } }); }
    applyTheme(); initFx();
    on<Record<string, unknown>>('settings', p => { if ('motion' in p || 'theme' in p) { applyTheme(); buildRail(); } });
    buildRail();
    on('ext:changed', buildRail);
    onLang(() => { buildRail(); go(route.page, route.arg, true); });   // 언어를 바꾸면 틀과 지금 화면을 새 글자로 다시 그린다
    on('route', page => document.querySelectorAll<HTMLElement>('#rail [data-page]').forEach(b => b.classList.toggle('on', b.dataset.page === page)));
    await shell.pages?.();
    const last = S.settings.lastPage;
    go(S.chars.length && last && !String(last).startsWith('ext-') ? last : 'home', last === 'chat' ? S.settings.lastChat : undefined);
    // 키 보호: 서버가 있으면 키를 서버 파일로 옮기고 브라우저에는 꼬리표만 남긴다
    const baseOf = (c: { provider: string }) => (PROVIDERS as Record<string, { base?: string } | undefined>)[c.provider]?.base || '';
    const sweep = debounce(async () => { try { const n = await Secrets.sweep(baseOf); if (n) { toast(tn('boot.sweep', n), 'ok'); if (['conns', 'settings', 'studio'].includes(route.page)) go(route.page, route.arg); } } catch (e) { console.warn('키 보관', e); } }, 600);
    if (await Secrets.init()) { sweep(); on('conns:saved', sweep); on('settings', sweep); on('vault', sweep); }
    if (Vault.locked) unlockPrompt();
    await initExtensions();
  } catch (e) {
    console.error(e);
    (document.getElementById('page') as HTMLElement).append(h('div.empty.big', h('p', t('boot.startFail', { error: (e as Error).message }))));
  }
}

// 화면은 안쪽 칸만 스크롤한다. 문서 자체가 밀려 올라가면 제자리로 돌린다 (글을 쓰는 중에는 자판 때문에 밀린 것이니 둔다)
addEventListener('scroll', () => {
  if (!scrollY && !scrollX) return;
  const a = document.activeElement as HTMLElement | null, typing = a && (a.tagName === 'TEXTAREA' || a.isContentEditable || (a.tagName === 'INPUT' && !['checkbox', 'radio', 'range', 'color', 'file', 'button'].includes((a as HTMLInputElement).type)));
  if (!typing) scrollTo(0, 0);
}, { passive: true });
