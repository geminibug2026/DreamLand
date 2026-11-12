// ── Dreamland importer: 이식 센터의 화면 아닌 부분 — 설치 종류 · 폴더 찾기 · 서버 브리지 · 옮겨 오기 (옛 js/importer.js 에서) ──
// 화면은 src/pages/Import.tsx. 거기서 부르던 cards 의 bridge · bridgeSource · filesSource · scanST/importST · scanME/importME · importFiles · summarize 는 ./cards 에 있다.
import { S } from './core';
import { bridge, bridgeSource, filesSource, scanST, importST, scanME, importME, importFiles, summarize, type Source, type Found, type Want, type Progress, type Tally, type StInventory, type MeInventory } from './cards';

export type ImportKind = 'st' | 'marinara';
type Part<I> = [string, string, (i: I) => number];
export interface KindInfo<I> { name: string; hint: string; scan(src: Source): Promise<I>; run(src: Source, want: Want, progress?: Progress): Promise<Tally>; parts: Part<I>[] }

const ST: KindInfo<StInventory> = { name: 'SillyTavern', hint: '설치 폴더 또는 data/default-user 폴더', scan: scanST, run: importST,
  parts: [['chars', '캐릭터', i => i.chars.length], ['chats', '대화', i => i.chats.length], ['lore', '로어북', i => i.worlds.length], ['presets', '프리셋', i => i.presets.length], ['personas', '페르소나', i => i.personas], ['regex', '정규식', i => i.regex], ['quick', '빠른 답장', i => i.quick.length]] };
const ME: KindInfo<MeInventory> = { name: 'Marinara Engine', hint: '설치 폴더 또는 packages/server/data 폴더', scan: scanME, run: importME,
  parts: [['chars', '캐릭터', i => i.chars], ['chats', '대화', i => i.chats], ['lore', '로어북', i => i.lore], ['presets', '프리셋', i => i.presets], ['personas', '페르소나', i => i.personas], ['regex', '정규식', i => i.regex]] };
export const KIND = { st: ST, marinara: ME };

interface BStore { settings: { bridge: { st?: string; me?: string; [k: string]: unknown } }; set(patch: object): void }
const St = S as unknown as BStore;
/** 설정(bridge)에 경로를 적어 두는 칸 이름 */
export const slotOf = (kind: ImportKind) => kind === 'st' ? 'st' : 'me';
/** 지난번에 적은 경로 */
export const lastPath = (kind: ImportKind) => St.settings.bridge[slotOf(kind)] || '';

export interface FoundSource { src: Source; label: string; sub: string }
/** 로컬 서버가 있는지 */
export const hasBridge = () => bridge.ok();
/** 자동으로 찾은 설치. 종류별로 나눠 돌려준다 (사용자 폴더는 "사용자 · 이름") */
export async function detectInstalls(): Promise<Record<ImportKind, FoundSource[]>> {
  const found = await bridge.detect();
  const out = { st: [] as FoundSource[], marinara: [] as FoundSource[] };
  for (const kind of ['st', 'marinara'] as const) for (const f of found.filter(x => x.kind === kind)) out[kind].push({ src: bridgeSource(f.root), label: kind === 'st' ? `사용자 · ${f.label}` : f.label, sub: f.root });
  return out;
}
/** 적은 경로에서 찾기. 찾으면 경로를 설정에 적어 두고 소스들을, 못 찾으면 null 을 돌려준다 */
export async function findAt(kind: ImportKind, raw: string): Promise<FoundSource[] | null> {
  const p = raw.trim().replace(/^"|"$/g, ''); if (!p) return [];
  const found: Found[] = (await bridge.resolve(p)).filter(r => r.kind === kind);
  if (!found.length) return null;
  St.set({ bridge: { ...St.settings.bridge, [slotOf(kind)]: p } });
  return found.map(r => ({ src: bridgeSource(r.root), label: r.label, sub: r.root }));
}
/** 고른 폴더(webkitdirectory). 그 종류의 데이터가 없으면 null */
export function fromFolder(kind: ImportKind, files: File[]): FoundSource | null {
  const src = filesSource(files);
  if (!src || src.kind !== kind) return null;
  return { src, label: '선택한 폴더', sub: src.label || '' };
}
/** 옮겨 온 결과 한 줄 (이식 센터 기록) */
export const runLine = (kind: ImportKind, T: Tally) => `${KIND[kind].name} → ${summarize(T)}${T.skipped ? ` · 이미 있거나 비어 있어 건너뜀 ${T.skipped}` : ''}`;
/** 파일로 가져온 결과 한 줄 */
export const filesLine = (n: number, T: Tally) => `파일 ${n}개 → ${summarize(T)}`;
export { importFiles, summarize };
