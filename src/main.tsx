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
    await preload([...new Set(defs.flatMap(p => p.needs || []))]);
    for (const { name, Component } of defs) L.ui.registerPage(name, (root, arg) => {
      drop();
      const box = document.createElement('div'); box.style.display = 'contents'; root.append(box);
      cur = createRoot(box); flushSync(() => cur!.render(<Component arg={arg} />));
    });
  },
});
