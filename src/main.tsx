// ── Dreamland (React) 시작 ──
import { termLog } from './lib/engine';
import type { ComponentType } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { flushSync } from 'react-dom';
import { DB, emit, on } from './lib/core';
import { registerPage, route } from './lib/router';
import { X } from './lib/hooks';
import { start } from './lib/boot';
import { installMirror, type MirrorDb } from './datafolder/mirror';
import { setMirror } from './datafolder/instance';
import { toast } from './ui';
import { Rail, openPalette } from './Shell';
import { t, initLang } from './i18n';

/** 화면 파일(src/pages/*.tsx)은 이것을 page 라는 이름으로 내보낸다. 파일을 두기만 하면 등록된다 */
export interface PageDef { name: string; Component: ComponentType<{ arg?: unknown }> }
// 자주 여는 홈 · 대화는 처음부터 싣고, 나머지 화면은 처음 열 때 불러온다 (켤 때 읽고 푸는 코드를 줄인다).
// 화면 이름은 파일 이름에서 (QuickReplies → qr). 불러온 화면이 다른 이름을 내보내면 그 이름으로도 등록한다
const eager = Object.values(import.meta.glob<{ page?: PageDef }>(['./pages/Home.tsx', './pages/Chat.tsx'], { eager: true })).map(m => m.page).filter((p): p is PageDef => !!p);
const lazyPages = import.meta.glob<{ page?: PageDef }>(['./pages/*.tsx', '!./pages/Home.tsx', '!./pages/Chat.tsx', '!./pages/cfRelay.tsx']);
const pageName = (file: string) => { const b = file.replace(/^.*\/|\.tsx$/g, ''); return b === 'QuickReplies' ? 'qr' : b.toLowerCase(); };
const names = new Set([...eager.map(p => p.name), ...Object.keys(lazyPages).map(pageName)]);

/** 화면이 아닌 기능(대화 패널 · 창 · 명령 등)은 src/features/*.tsx 에서 feature 라는 이름으로 내보낸다. setup 은 첫 화면을 그리기 전에 파일 이름 차례로 한 번 불린다 */
export interface FeatureDef { name: string; setup: () => void | Promise<void> }
const feats = Object.values(import.meta.glob<{ feature?: FeatureDef }>('./features/*.tsx', { eager: true })).map(m => m.feature).filter((f): f is FeatureDef => !!f);

// 화면은 바꿀 때마다 새로 올리고, 떠날 때 내린다
let cur: Root | null = null, opening = 0;
const drop = () => { cur?.unmount(); cur = null; };
function mount(root: HTMLElement, arg: unknown, Component: ComponentType<{ arg?: unknown }>) {
  drop(); opening++;
  const box = document.createElement('div'); box.style.display = 'contents'; root.append(box);
  cur = createRoot(box); flushSync(() => cur!.render(<Component arg={arg} />));
}
on('route', page => { if (!names.has(String(page))) drop(); });

// 새 판으로 바뀐 뒤 열려 있던 창: 처음 여는 화면 · 기능의 코드 파일이 서버에서 사라져 받지 못한다 → 답을 받는 중이 아니면 새 판으로 다시 연다 (1분에 한 번까지)
addEventListener('vite:preloadError', ev => {
  ev.preventDefault();
  const last = Number(sessionStorage.getItem('dl-reload-new') || 0); if (Date.now() - last < 60000) { toast(t('shell.pageLoadFail'), 'err'); return; }
  const go = () => { sessionStorage.setItem('dl-reload-new', String(Date.now())); location.reload(); };
  toast(t('shell.newVersion'));
  const wait = () => { if (document.querySelector('.msg.streaming')) setTimeout(wait, 1000); else setTimeout(go, 800); }; wait();
});

const railRoot = createRoot(document.getElementById('rail')!);
let railUp = false;

await initLang();

await start({
  // 자료 폴더 거울: 브라우저 저장소에 쓰는 모든 것을 서버의 data/store 에도 보낸다. 불러온 직후, 무엇이든 저장하기 전에 한 번 (파일로 열었으면 감싸지 않는다)
  loaded: () => { if (/^https?:$/.test(location.protocol)) setMirror(installMirror(DB as unknown as MirrorDb, { toast: (m, k) => toast(m, k) })); },
  rail: () => { if (!railUp) { railUp = true; flushSync(() => railRoot.render(<Rail />)); } else emit('rail'); },
  palette: openPalette,
  pages: async () => {
    for (const f of feats) try { await f.setup(); } catch (e) { console.error('[기능]', f.name, e); toast(t('shell.featureFail', { name: f.name }), 'err'); }
    for (const { name, Component } of eager) registerPage(name, (root, arg) => mount(root, arg, Component));
    for (const [file, load] of Object.entries(lazyPages)) {
      const name = pageName(file); let got: ComponentType<{ arg?: unknown }> | null = null;
      registerPage(name, (root, arg) => {
        if (got) return mount(root, arg, got);
        drop(); const ticket = ++opening;
        const wait = document.createElement('p'); wait.className = 'page-wait dim'; root.append(wait);
        setTimeout(() => { if (wait.isConnected) wait.textContent = t('shell.pageLoading'); }, 300);   // 금방 뜨면 아무것도 보이지 않게
        load().then(m => {
          if (!m.page) throw new Error('no page in ' + file);
          got = m.page.Component; if (m.page.name !== name) registerPage(m.page.name, (r, a) => mount(r, a, got!));
          if (ticket === opening && route.page === name && root.isConnected) { root.replaceChildren(); mount(root, route.arg, got); }   // 그사이 다른 화면으로 갔으면 그리지 않는다
        }).catch(e => { console.error('[화면]', name, e); if (ticket === opening) toast(t('shell.pageLoadFail'), 'err'); });
      });
    }
    // 켠 뒤 한가할 때 화면 코드를 미리 받아 둔다 (처음 열 때 기다리지 않게) — 하나씩, 화면이 바쁘지 않을 때만
    // 화면 코드 뒤에는 기능 화면 탭들의 코드도 (처음 여는 탭이 빈 채로 기다리지 않게)
    const rest: (() => Promise<unknown>)[] = [...Object.values(lazyPages), ...X.studio.filter(x => x.preload).map(x => () => x.preload!())], idle = (f: () => void) => { const w = window as unknown as { requestIdleCallback?: (f: () => void, o?: { timeout: number }) => number }; if (w.requestIdleCallback) w.requestIdleCallback(f, { timeout: 4000 }); else setTimeout(f, 200); };
    const warm = () => { const next = rest.shift(); if (next) idle(() => { next().catch(() => { }).finally(warm); }); };
    setTimeout(warm, 4000);
  },
});
// 서버 터미널에 이 브라우저가 붙었다고 한 줄 남긴다 (새 버전이 열렸는지 확인용)
termLog('info', `● app opened · ${/Mobi|Android/i.test(navigator.userAgent) ? 'mobile' : 'desktop'} · ${location.host}`);
