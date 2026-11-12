// ── Dreamland (React) 시작 ──
import type { ComponentType } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { flushSync } from 'react-dom';
import { loadLegacy, preload } from './legacy';
import { Rail, openPalette } from './Shell';

/** 화면 파일(src/pages/*.tsx)은 이것을 page 라는 이름으로 내보낸다. 파일을 두기만 하면 등록된다 */
export interface PageDef { name: string; Component: ComponentType<{ arg?: unknown }>; needs?: string[] }
const defs = Object.values(import.meta.glob<{ page?: PageDef }>('./pages/*.tsx', { eager: true })).map(m => m.page).filter((p): p is PageDef => !!p);
const names = new Set(defs.map(p => p.name));

/** 화면이 아닌 기능(대화 패널 · 창 · 명령 등)은 src/features/*.tsx 에서 feature 라는 이름으로 내보낸다. setup 은 옛 기능 모듈이 다 뜬 뒤, 첫 화면을 그리기 전에 불린다 */
export interface FeatureDef { name: string; setup: () => void | Promise<void>; needs?: string[] }
const feats = Object.values(import.meta.glob<{ feature?: FeatureDef }>('./features/*.tsx', { eager: true })).map(m => m.feature).filter((f): f is FeatureDef => !!f);

const L = await loadLegacy();

// 옮긴 화면은 옛 화면 자리에 대신 등록한다 (화면을 바꿀 때마다 새로 올리고, 떠날 때 내린다)
let cur: Root | null = null;
const drop = () => { cur?.unmount(); cur = null; };
L.core.on('route', page => { if (!names.has(String(page))) drop(); });

const railRoot = createRoot(document.getElementById('rail')!);
let railUp = false;

await L.boot.start({
  rail: () => { if (!railUp) { railUp = true; flushSync(() => railRoot.render(<Rail />)); } else L.core.emit('rail'); },
  palette: openPalette,
  pages: async () => {
    await preload([...new Set([...defs, ...feats].flatMap(p => p.needs || []))]);
    for (const f of feats) try { await f.setup(); } catch (e) { console.error('[기능]', f.name, e); L.ui.toast(`기능 ${f.name} 을(를) 불러오지 못했어요`, 'err'); }
    for (const { name, Component } of defs) L.ui.registerPage(name, (root, arg) => {
      drop();
      const box = document.createElement('div'); box.style.display = 'contents'; root.append(box);
      cur = createRoot(box); flushSync(() => cur!.render(<Component arg={arg} />));
    });
  },
});
