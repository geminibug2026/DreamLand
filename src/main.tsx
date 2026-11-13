// ── Dreamland (React) 시작 ──
import { termLog } from './lib/engine';
import type { ComponentType } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { flushSync } from 'react-dom';
import { DB, emit, on } from './lib/core';
import { registerPage } from './lib/router';
import { start } from './lib/boot';
import { installMirror, type MirrorDb } from './datafolder/mirror';
import { setMirror } from './datafolder/instance';
import { toast } from './ui';
import { Rail, openPalette } from './Shell';
import { t } from './i18n';

/** 화면 파일(src/pages/*.tsx)은 이것을 page 라는 이름으로 내보낸다. 파일을 두기만 하면 등록된다 */
export interface PageDef { name: string; Component: ComponentType<{ arg?: unknown }> }
const defs = Object.values(import.meta.glob<{ page?: PageDef }>('./pages/*.tsx', { eager: true })).map(m => m.page).filter((p): p is PageDef => !!p);
const names = new Set(defs.map(p => p.name));

/** 화면이 아닌 기능(대화 패널 · 창 · 명령 등)은 src/features/*.tsx 에서 feature 라는 이름으로 내보낸다. setup 은 첫 화면을 그리기 전에 파일 이름 차례로 한 번 불린다 */
export interface FeatureDef { name: string; setup: () => void | Promise<void> }
const feats = Object.values(import.meta.glob<{ feature?: FeatureDef }>('./features/*.tsx', { eager: true })).map(m => m.feature).filter((f): f is FeatureDef => !!f);

// 화면은 바꿀 때마다 새로 올리고, 떠날 때 내린다
let cur: Root | null = null;
const drop = () => { cur?.unmount(); cur = null; };
on('route', page => { if (!names.has(String(page))) drop(); });

const railRoot = createRoot(document.getElementById('rail')!);
let railUp = false;

await start({
  // 자료 폴더 거울: 브라우저 저장소에 쓰는 모든 것을 서버의 data/store 에도 보낸다. 불러온 직후, 무엇이든 저장하기 전에 한 번 (파일로 열었으면 감싸지 않는다)
  loaded: () => { if (/^https?:$/.test(location.protocol)) setMirror(installMirror(DB as unknown as MirrorDb, { toast: (m, k) => toast(m, k) })); },
  rail: () => { if (!railUp) { railUp = true; flushSync(() => railRoot.render(<Rail />)); } else emit('rail'); },
  palette: openPalette,
  pages: async () => {
    for (const f of feats) try { await f.setup(); } catch (e) { console.error('[기능]', f.name, e); toast(t('shell.featureFail', { name: f.name }), 'err'); }
    for (const { name, Component } of defs) registerPage(name, (root, arg) => {
      drop();
      const box = document.createElement('div'); box.style.display = 'contents'; root.append(box);
      cur = createRoot(box); flushSync(() => cur!.render(<Component arg={arg} />));
    });
  },
});
// 서버 터미널에 이 브라우저가 붙었다고 한 줄 남긴다 (새 버전이 열렸는지 확인용)
termLog('info', `● app opened · ${/Mobi|Android/i.test(navigator.userAgent) ? 'mobile' : 'desktop'} · ${location.host}`);
