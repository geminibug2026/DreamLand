// ── Dreamland boot: 시작 절차 · 내비게이션 목록 · 빠른 이동 단축키 ── (옛 js/boot.js 의 화면 밖 부분)
// start(shell) 로 시작한다. 옆 내비 · 빠른 이동 · 화면 등록은 React 판(src/Shell.tsx · src/main.tsx)이 shell 로 건넨다
// 옛 판의 DOM 내비(buildRail) · 더보기 · 빠른 이동 창은 이미 src/Shell.tsx 에 있어 옮기지 않았다
// 기능 모듈 동적 로딩(FEATURES · loadFeatures)은 없앴다 — f-regex 는 src/features/regex.tsx, f-modules 는 보고 참고
import { S, h, on, Vault, Secrets, debounce } from './core';
import { PROVIDERS } from './engine';
import { go, route } from './router';
import { applyTheme, initFx } from './theme';
import { X } from './hooks';
import { initExtensions, modal } from './ext';
import { toast } from '../ui';
import type { NavItem } from './types';

// [화면, 이름, 아이콘, 휴대폰 아래 탭에 고정, 상단 메뉴 영문 이름, 상단에 바로 보이기]
export const NAV: NavItem[] = [['home', '캐릭터', 'home', true, 'HOME', true], ['chat', '대화', 'chat', true, 'CHAT', true], ['lore', '로어북', 'book', false, 'LOREBOOK', true], ['presets', '프리셋', 'sliders', true, 'PRESET', true], ['personas', '페르소나', 'user', false, 'PERSONA', true],
  ['conns', 'API 연결', 'plug', false, 'CONNECT', true], ['studio', '기능', 'sparkle', false, 'FEATURES', true], ['modules', '모듈', 'panel', false, 'MODULES'], ['diary', '일기장', 'note', false, 'DIARY'], ['themes', '꾸미기', 'heart', false, 'DECOR'], ['format', '고급 포맷팅', 'sliders', false, 'FORMAT'], ['regex', '정규식', 'code', false, 'REGEX'], ['exts', '확장 · 플러그인', 'grip', false, 'PLUGINS'], ['import', '이식', 'folder', false, 'MIGRATE'], ['settings', '설정', 'gear', false, 'SETTINGS']];
export const navItems = (): NavItem[] => [...NAV, ...X.pages.map((p): NavItem => [p.id, p.label || '확장 화면', p.icon || 'sparkle', false, (p.label || 'EXT').toUpperCase()])];

export interface Shell { rail?: () => void; palette?: () => void; pages?: () => void | Promise<void> }
let shell: Shell = {};
const buildRail = () => shell.rail?.();
const palette = () => shell.palette?.();

/** 시작할 때 키 잠금 풀기 */
function unlockPrompt() {
  const inp = h<HTMLInputElement>('input.inp', { type: 'password', placeholder: '잠금 암호', autocomplete: 'current-password' }); const msg = h('small.hint', 'API 키가 암호로 잠겨 있어요. 풀기 전에는 모델을 호출할 수 없습니다.');
  let box: { close(): void } | undefined; const tryIt = async () => { try { if (await Vault.unlock(inp.value)) { toast('잠금을 풀었어요', 'ok'); box?.close(); } else { msg.textContent = '암호가 맞지 않아요.'; msg.classList.add('err'); } } catch (e) { msg.textContent = (e as Error).message; } return false; };
  inp.addEventListener('keydown', e => { if (e.key === 'Enter') tryIt(); });
  box = modal({ title: '키 잠금 풀기', body: h('div.col', inp, msg), actions: [{ label: '나중에' }, { label: '풀기', cls: 'primary', onclick: tryIt }] });
}

addEventListener('keydown', e => { if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); palette(); } });
addEventListener('unhandledrejection', e => { console.error(e.reason); toast(String(e.reason?.message || e.reason).slice(0, 200), 'err'); });

export async function start(opts: Shell = {}) {
  shell = opts;
  try {
    await S.load();
    // 프리셋의 옛 '요약 메모리' 칸은 이제 장기기억이 들어가는 자리다
    for (const p of S.presets || []) { let ch = false; for (const b of p.blocks || []) if (b.kind === 'summary' && (b.name === '요약 메모리' || b.content === '[Story so far]\n{{slot}}')) { b.name = '장기기억 자리'; if (b.content === '[Story so far]\n{{slot}}') b.content = '{{slot}}'; ch = true; } if (ch) await S.save('presets', p, true); }
    // RP 는 소설처럼 보이는 것이 기본: 예전 판의 기본값(말풍선)이 저장돼 남아 있으면 한 번만 되돌린다. 꾸미기에서 다시 켤 수 있다
    if (!S.settings.migr?.rpNovel) { S.set({ rpBubbles: false, migr: { ...(S.settings.migr || {}), rpNovel: 1 } }); }
    applyTheme(); initFx();
    on<Record<string, unknown>>('settings', p => { if ('motion' in p || 'theme' in p) { applyTheme(); buildRail(); } });
    buildRail();
    on('ext:changed', buildRail);
    on('route', page => document.querySelectorAll<HTMLElement>('#rail [data-page]').forEach(b => b.classList.toggle('on', b.dataset.page === page)));
    await shell.pages?.();
    const last = S.settings.lastPage;
    go(S.chars.length && last && !String(last).startsWith('ext-') ? last : 'home', last === 'chat' ? S.settings.lastChat : undefined);
    // 키 보호: 서버가 있으면 키를 서버 파일로 옮기고 브라우저에는 꼬리표만 남긴다
    const baseOf = (c: { provider: string }) => (PROVIDERS as Record<string, { base?: string } | undefined>)[c.provider]?.base || '';
    const sweep = debounce(async () => { try { const n = await Secrets.sweep(baseOf); if (n) { toast(`API 키 ${n}개를 드림랜드 서버 보관으로 옮겼어요. 이제 브라우저에는 키가 남지 않습니다.`, 'ok'); if (['conns', 'settings', 'studio'].includes(route.page)) go(route.page, route.arg); } } catch (e) { console.warn('키 보관', e); } }, 600);
    if (await Secrets.init()) { sweep(); on('conns:saved', sweep); on('settings', sweep); on('vault', sweep); }
    if (Vault.locked) unlockPrompt();
    await initExtensions();
  } catch (e) {
    console.error(e);
    (document.getElementById('page') as HTMLElement).append(h('div.empty.big', h('p', '시작하지 못했어요: ' + (e as Error).message)));
  }
}

// 화면은 안쪽 칸만 스크롤한다. 문서 자체가 밀려 올라가면 제자리로 돌린다 (글을 쓰는 중에는 자판 때문에 밀린 것이니 둔다)
addEventListener('scroll', () => {
  if (!scrollY && !scrollX) return;
  const a = document.activeElement as HTMLElement | null, typing = a && (a.tagName === 'TEXTAREA' || a.isContentEditable || (a.tagName === 'INPUT' && !['checkbox', 'radio', 'range', 'color', 'file', 'button'].includes((a as HTMLInputElement).type)));
  if (!typing) scrollTo(0, 0);
}, { passive: true });
