// ════════ 만화 페이지 · 웹툰 컷 ════════
// 그림 한 장을 여러 칸으로 나눠 그린다 (흑백 만화 · 컬러 만화 · 세로 웹툰). 웹툰 컷은 답변 하나를 세로 웹툰 몇 장으로 그린다.
// 칸 나눔은 정해 둔 격자 가운데 하나를 AI 가 고르고, 인물 위치는 AI 가 그 칸 안에서만 정한다. 페이지 위의 자리로는 여기서 바꾼다 —
// 모델이 페이지 좌표를 계산하지 않아도 되니 인물이 제 칸에 그려진다. 칸을 읽는 그림은 NovelAI V5 에서만 그린다
import { cameraIssue } from './framing';

export type PageFormat = 'single' | 'cuts' | 'manga' | 'comic' | 'webtoon';
/** 그림 형식: 삽화(한 장씩) · 웹툰 컷 · 흑백 만화 · 컬러 만화 · 세로 웹툰 (이름 · 설명은 scenebook.page.fmt.* · scenebook.page.fmtHelp.*) */
export const PAGE_FORMATS: PageFormat[] = ['single', 'cuts', 'manga', 'comic', 'webtoon'];
/** 한 페이지의 칸 수 (0 = 자동, 2~4 칸) */
export const PANEL_COUNTS = [0, 2, 3, 4];
/** 답변 하나에 그릴 최대 장 수 (삽화 · 웹툰 컷 · 만화 페이지 모두 이 안에서 AI 가 고른다) */
export const SCENE_COUNTS = [1, 2, 3, 4, 5, 6];
/** 웹툰 컷 놓는 자리: 문단마다(그 장면을 그린 문단 바로 뒤) · 답변 아래 이어서 */
export const CUT_LAYOUTS = ['story', 'stack'];
export const STRIP_HEIGHTS = ['short', 'medium', 'tall'];

export interface PagePerson { name?: string; prompt?: string; negative?: string; x?: number; y?: number; id?: string }
export interface PagePanel { text: string; height?: string; characters: PagePerson[] }
/** 장면에 붙는 페이지: 격자 · (손으로 적은) 칸 배치 문장 · 칸들. local: 인물 좌표가 칸 안의 좌표 */
export interface Page { grid?: string; layout?: string; local?: boolean; panels: PagePanel[] }
interface Cfg { backend?: unknown; model?: unknown; pageFormat?: unknown; panelCount?: unknown; speechBubbles?: unknown; cutLayout?: unknown; maxScenes?: unknown; placement?: unknown; [k: string]: unknown }

const KINDS = ['manga', 'comic', 'webtoon'];
const WORDS = ['', 'one', 'two', 'three', 'four', 'five', 'six'], ORDER = ['First', 'Second', 'Third', 'Fourth', 'Fifth', 'Sixth'];
/** 칸이 든 그림은 NovelAI V5 만 문장을 읽고 그린다 */
export const pagesAllowed = (c: Cfg | null | undefined) => (c?.backend ?? 'nai') === 'nai' && String(c?.model ?? '').startsWith('nai-diffusion-5');
/** 지금 그릴 페이지 꼴 (웹툰 컷도 세로 웹툰으로 그린다). 페이지를 못 그리면 single */
export const pageFormat = (c: Cfg | null | undefined): 'single' | 'manga' | 'comic' | 'webtoon' => !pagesAllowed(c) ? 'single' : c?.pageFormat === 'cuts' ? 'webtoon' : KINDS.includes(String(c?.pageFormat)) ? c!.pageFormat as 'manga' : 'single';
const fixedPanels = (c: Cfg) => Number(c.panelCount) >= 2 ? Math.min(4, Number(c.panelCount)) : 0;
/** 웹툰 컷: 답변 하나를 세로 웹툰 몇 장으로 */
export const cutMode = (c: Cfg | null | undefined) => c?.pageFormat === 'cuts' && pagesAllowed(c);
export const sceneLimit = (c: Cfg | null | undefined) => Math.max(1, Math.min(6, Number(c?.maxScenes) || 1));
/** 그림 위치: 웹툰 컷이면 컷 놓는 자리를 따르고, 아니면 저장한 그림 위치 */
export const placementOf = (c: Cfg | null | undefined): string => cutMode(c) ? (c?.cutLayout === 'stack' ? 'end' : 'auto') : String(c?.placement || 'end');

// ── 격자: 칸 자리(페이지에 대한 비율, 칸 사이 흰 틈 포함)와 프롬프트에 쓰는 칸 이름 ──
export interface Cell { x0: number; y0: number; x1: number; y1: number; name: string }
const cell = (x0: number, y0: number, x1: number, y1: number, name: string): Cell => ({ x0, y0, x1, y1, name });
/** [id, 프롬프트 설명, 칸들, 가로 페이지인지] (이름은 scenebook.page.grid.<id>) */
export type Grid = [id: string, desc: string, cells: Cell[], wide?: boolean];
export const PAGE_GRIDS: Record<number, Grid[]> = {
  2: [
    ['2-stack', 'two full-width panels, one above the other', [cell(0, 0, 1, .46, 'top, full width'), cell(0, .5, 1, 1, 'bottom, full width')]],
    ['2-split', 'two tall panels side by side, read left to right', [cell(0, 0, .49, 1, 'tall left'), cell(.51, 0, 1, 1, 'tall right')], true],
  ],
  3: [
    ['3-top', 'a wide panel across the top, two panels side by side below', [cell(0, 0, 1, .47, 'wide top'), cell(0, .51, .49, 1, 'lower left'), cell(.51, .51, 1, 1, 'lower right')]],
    ['3-bottom', 'two panels side by side on top, a wide panel across the bottom', [cell(0, 0, .49, .45, 'upper left'), cell(.51, 0, 1, .45, 'upper right'), cell(0, .49, 1, 1, 'wide bottom')]],
    ['3-rows', 'three full-width panels stacked, the middle one tallest', [cell(0, 0, 1, .28, 'top strip'), cell(0, .32, 1, .7, 'tall middle'), cell(0, .74, 1, 1, 'bottom strip')]],
    ['3-left', 'a tall panel on the left, two panels stacked on the right', [cell(0, 0, .55, 1, 'tall left'), cell(.57, 0, 1, .49, 'upper right'), cell(.57, .51, 1, 1, 'lower right')]],
  ],
  4: [
    ['4-grid', 'four equal panels in a two by two grid', [cell(0, 0, .49, .49, 'upper left'), cell(.51, 0, 1, .49, 'upper right'), cell(0, .51, .49, 1, 'lower left'), cell(.51, .51, 1, 1, 'lower right')]],
    ['4-ends', 'a wide panel across the top, two side by side in the middle, a wide panel across the bottom', [cell(0, 0, 1, .3, 'wide top'), cell(0, .34, .49, .66, 'middle left'), cell(.51, .34, 1, .66, 'middle right'), cell(0, .7, 1, 1, 'wide bottom')]],
    ['4-rows', 'four full-width strips stacked', [cell(0, 0, 1, .23, 'first strip'), cell(0, .257, 1, .487, 'second strip'), cell(0, .513, 1, .743, 'third strip'), cell(0, .77, 1, 1, 'bottom strip')]],
  ],
};
const STRIP: Record<string, number> = { short: 1, medium: 1.6, tall: 2.5 }, GAP = .4;
export const gridFor = (page?: Page | null): Grid | null => { const grids = PAGE_GRIDS[page?.panels?.length ?? 0] ?? []; return grids.find(g => g[0] === page?.grid) ?? grids[0] ?? null; };
/** 칸마다 페이지 위의 자리. 격자 없이 짠 옛 페이지(인물이 페이지 좌표)는 null */
export function pageCells(page: Page | null | undefined, format: string): Cell[] | null {
  const n = page?.panels?.length; if (!n || !page.local) return null;
  if (format === 'webtoon') {
    const units = page.panels.map(p => STRIP[p.height ?? ''] ?? STRIP.medium), total = units.reduce((a, b) => a + b, 0) + GAP * (n - 1); let y = 0;
    return units.map((u, i) => { const c = cell(0, y / total, 1, (y + u) / total, page.panels[i].height === 'tall' ? 'tall full-width strip' : page.panels[i].height === 'short' ? 'short full-width strip' : 'full-width strip'); y += u + GAP; return c; });
  }
  return gridFor(page)?.[2] ?? Array.from({ length: n }, (_, i) => cell(0, i / n + (i ? .01 : 0), 1, (i + 1) / n - (i < n - 1 ? .01 : 0), `strip ${i + 1}`));
}
const toPage = (c: PagePerson, box: Cell) => ({ x: +Math.min(.98, Math.max(.02, box.x0 + (c.x ?? .5) * (box.x1 - box.x0))).toFixed(3), y: +Math.min(.98, Math.max(.02, box.y0 + (c.y ?? .5) * (box.y1 - box.y0))).toFixed(3) });

// ── 대화 AI 에게 주는 페이지 규칙 ── (짧게: 칸마다 카메라는 한 장짜리와 같은 공간 순서로, 이웃 칸은 거리 · 각도를 바꾸고, 사람은 같은 쪽에)
/** format: text(줄 단위) · json · analysis(따로 장면 쓰기) · lean(간결한 지시문) */
export function pageRules(c: Cfg, format: 'text' | 'json' | 'analysis' | 'lean' = 'text'): string {
  const kind = pageFormat(c); if (kind === 'single') return '';
  const cuts = cutMode(c), webtoon = kind === 'webtoon', fixed = fixedPanels(c), count = fixed ? `exactly ${fixed}` : '2 to 4', max = sceneLimit(c);
  const label = { manga: 'black-and-white manga page', comic: 'full-color comic page', webtoon: 'vertical webtoon strip' }[kind];
  const grids = (fixed ? [fixed] : [2, 3, 4]).flatMap(n => PAGE_GRIDS[n].map(g => `${g[0]} (${g[1]})`)).join('; ');
  const lines = [
    cuts ? `EPISODE MODE: draw this reply as 1 to ${max} vertical webtoon strips read top to bottom; each scene is one strip of ${count} panels. Give a strip only to a stretch with something new to see (arrival, decisive action, strong reaction, turn); skip talk, thought and repetition. A quiet reply gets one strip; never pad. Strips and panels follow story order and never draw an instant twice. This replaces any other scene-count advice.`
      : `PAGE MODE: every scene is one ${label} of ${count} panels telling this moment as a short sequence (approach, contact, reaction; or cause, action, result). Plan the beats, then the panels.`,
    webtoon ? 'Panels stack in one column. Give each a height: short (pause, glance, small reaction), medium, tall (decisive beat, full-body action, wide view of the place). Vary the heights.'
      : `Pick the grid whose biggest panel holds the decisive beat: ${grids}.`,
    `Camera per panel, in the same order as for a single image: who must be seen, where they are and their posture, a physically possible viewpoint that blocks no one, then shot size. Neighbouring panels change shot distance or angle (repeat only on purpose). Each person keeps the same side of the frame, outfit, light and place stay continuous${cuts ? ' across strips' : ''}, and heads, hands and the key detail stay inside the border.`,
    'Panel text stands alone (never "again" or "same pose"): viewpoint and shot, who is visible and where, exact action and expression, the background seen, one key detail. Refer to people by a visible feature, never by name. Under a panel list only the people visible in it; their action starts with girl, boy or other, then how much of them the shot shows (face close-up, upper body, cowboy shot, full body); pos is x, y inside that panel.',
    c.speechBubbles ? 'A speaker may get one short line from the reply, in its original language, as "speech bubble, text: <line>" in that person\'s action. No other text.' : 'No speech bubbles, captions, sound effects or other text.',
    format === 'text' || format === 'lean'
      ? `Page layout: prompt (what every panel shares: place, time, light, weather)${webtoon ? '' : ', grid'}, then for each panel in reading order a panel line${webtoon ? ', a height line' : ''} and the char, action, pos lines of the people in it. No camera or size line.\nscene\nprompt: shared place, time, light\n${webtoon ? '' : 'grid: grid id\n'}panel: viewpoint, shot, who is where, action, background, key detail\n${webtoon ? 'height: tall\n' : ''}char: exact character name\naction: girl, upper body, pose, expression, gaze\npos: 0.4, 0.5`
      : `Each scene adds${webtoon ? '' : ' "grid" and'} "panels": [{"text":"viewpoint, shot, who is where, action, background, key detail",${webtoon ? '"height":"short|medium|tall",' : ''}"characters":[{"name":"exact library name","action":"girl, upper body, pose, expression, gaze","x":0.5,"y":0.5}]}] in reading order. "prompt" holds what every panel shares; leave "camera" and the scene-level "characters" empty.`,
  ];
  return lines.join('\n');
}

/**
 * 계획이 적은 페이지 → { grid, layout, local, panels }. 새로 짠 페이지는 인물이 칸 안에 놓인다(local)
 * compile 은 인물 한 명을 [저장된 외형, 옷, 동작] 으로 조립한다. fix: 칸 카메라가 자세와 어긋나면(누운 사람을 아래에서 등) 고친다 (모델이 쓴 계획만)
 */
export function readPage(raw: { panels?: unknown; grid?: unknown; layout?: unknown } | null | undefined, compile: (c: Record<string, unknown>) => PagePerson | null, fix = false): Page | null {
  const list = Array.isArray(raw?.panels) ? raw.panels : [];
  const panels = list.map(p => typeof p === 'string' ? { text: p, characters: [] } : p as Record<string, unknown>)
    .filter(p => p && typeof p.text === 'string' && (p.text as string).trim()).slice(0, 6)
    .map(p => {
      const people = (Array.isArray(p.characters) ? p.characters : []).map(x => typeof x === 'string' ? { name: x } : x as Record<string, unknown>).filter(x => x && typeof x === 'object')
        .map(x => ({ ...x, ...(x.x != null ? { x: Number(x.x) } : {}), ...(x.y != null ? { y: Number(x.y) } : {}) })).map(compile).filter((x): x is PagePerson => !!x);
      let text = String(p.text).trim().slice(0, 1500);
      if (fix) { const k = cameraIssue({ characters: people }, text); if (k.fix) text = k.fix; }
      const h = String(p.height ?? '').toLowerCase();
      return { text, ...(STRIP[h] ? { height: h } : {}), characters: people };
    });
  if (!panels.length) return null;
  const grid = typeof raw?.grid === 'string' ? raw.grid.trim().toLowerCase() : '';
  // 격자가 칸 배치를 정한다. 계획이 따로 적은 배치 문장은 격자와 어긋날 수 있어 버린다 (장면 편집에서 손으로 적은 것은 쓴다)
  return { layout: '', ...(grid ? { grid } : {}), local: true, panels };
}

const header = (format: string, n: number) => {
  const w = WORDS[n] ?? 'several';
  if (format === 'manga') return `a ${w}-panel black and white manga page, monochrome, greyscale, inked linework, high contrast, solid black shadows, clean panel borders with thin white gutters`;
  if (format === 'webtoon') return `a vertical webtoon strip of ${w} panels stacked from top to bottom, full color, clean digital coloring, soft shading, wide white gutters between panels`;
  return `a ${w}-panel full color comic page, clean lineart, cel shading, clean panel borders with thin white gutters`;
};
// 페이지와 싸우는 UC 태그: 무거운 UC 의 multiple views · screentone · halftone 같은 것
const CONFLICTS = { all: ['multiple views', 'split screen', 'comic', '4koma', 'panel', 'panels', 'manga'], manga: ['monochrome', 'greyscale', 'grayscale', 'screentone', 'halftone', 'limited palette'] };
function pageNegative(format: string, negative: string, bubbles: boolean) {
  const drop = new Set([...CONFLICTS.all, ...(format === 'manga' ? CONFLICTS.manga : [])]);
  const kept = String(negative ?? '').split(',').map(x => x.trim()).filter(x => x && !drop.has(x.toLowerCase()));
  const extra = ['panel numbers', 'page number', 'watermark', ...(bubbles ? [] : ['speech bubble', 'text', 'sound effects']), ...(format === 'manga' ? [] : ['monochrome', 'greyscale'])];
  return [...new Set([...kept, ...extra])].join(', ');
}
const layoutSentence = (page: Page, format: string, cells: Cell[] | null) => {
  if (page.layout?.trim()) return page.layout.trim();
  if (!cells) return '';
  if (format === 'webtoon') { const tall = page.panels.map((p, i) => p.height === 'tall' ? ORDER[i].toLowerCase() : '').filter(Boolean); return `panels of different heights${tall.length ? `, the ${tall.join(' and ')} panel tallest` : ''}`; }
  return gridFor(page)?.[1] ?? '';
};
/** 세로 웹툰은 긴 캔버스. 페이지는 격자가 가로 · 세로를 정하고 그 밖에는 고른 크기 그대로 */
export function pageSize(format: string, page: Page, c: { width: number; height: number }): { width?: number; height?: number } {
  if (format === 'webtoon') return page.panels.length >= 3 ? { width: 704, height: 1472 } : { width: 768, height: 1344 };
  if (!page.local) return {};
  const wide = !!gridFor(page)?.[3], landscape = c.width > c.height;
  // 웹툰에서 남은 길쭉한 캔버스는 보통 페이지로
  if (Math.max(c.width, c.height) / Math.min(c.width, c.height) > 1.6) return wide ? { width: 1216, height: 832 } : { width: 832, height: 1216 };
  return wide !== landscape && c.width !== c.height ? { width: c.height, height: c.width } : {};
}
/** 그 페이지에서 가장 큰 칸 (페이지를 못 그리는 모델로 바꿨을 때 한 장으로 그린다) */
const keyPanel = (page: Page, format: string) => { const cells = pageCells(page, format); if (!cells) return 0; let best = 0, area = 0; cells.forEach((c, i) => { const a = (c.x1 - c.x0) * (c.y1 - c.y0); if (a > area) { area = a; best = i; } }); return best; };

export interface PageScene { prompt?: string; negative?: string; camera?: string; characters?: PagePerson[]; finalPrompt?: boolean; page?: Page; pageFormat?: string; bubbles?: boolean; [k: string]: unknown }
/**
 * NovelAI 에 보낼 장면과 설정: 페이지 전체를 한 프롬프트로 다 적어 보내고(finalPrompt), 인물은 나오는 칸마다 한 번씩 그 칸 안에 놓는다
 * o.limit: 이 모델이 한 그림에 받는 인물 수 · o.quality: 붙일 품질 태그 ('' 이면 안 붙인다)
 * 페이지를 못 그리는 모델이면 가장 큰 칸을 한 장짜리 장면으로 돌려준다
 */
export function compilePage<S extends PageScene>(scene: S, c: Cfg & { width: number; height: number; style?: string; negative?: string }, o: { limit: number; quality: string }): { scene: S; config: Record<string, unknown> } {
  const page = scene.page; if (!page?.panels?.length) return { scene, config: {} };
  const format = pageFormat({ ...c, pageFormat: scene.pageFormat ?? c.pageFormat });
  if (format === 'single') {
    const k = page.panels[keyPanel(page, String(scene.pageFormat))];
    return { scene: { ...scene, page: undefined, prompt: [scene.prompt, k.text].filter(Boolean).join(', '), characters: k.characters.length ? k.characters : scene.characters ?? [] }, config: {} };
  }
  const bubbles = !!(scene.bubbles ?? c.speechBubbles), n = page.panels.length, cells = pageCells(page, format);
  const occurrences = page.panels.flatMap((p, i) => p.characters.map(x => cells ? { ...x, ...toPage(x, cells[i]) } : { ...x }));
  // 한 그림이 받는 인물 수를 넘으면 사람마다 하나씩만, 위치는 문장으로
  const perPanel = occurrences.length > 0 && occurrences.length <= o.limit;
  const characters = perPanel ? occurrences : [...new Map([...(scene.characters ?? []), ...occurrences].map(x => [x.name || x.prompt, x])).values()].slice(0, o.limit);
  const panels = page.panels.map((p, i) => `${ORDER[i]} panel${cells ? `, ${cells[i].name}` : ''}: ${p.text.replace(/[.,\s]+$/, '')}`).join('. ');
  const quality = o.quality ? o.quality.replace(/,?\s*no text/, bubbles ? '' : ', no text').replace(/^,\s*/, '') : '';
  const prompt = [header(format, n), c.style, scene.prompt, layoutSentence(page, format, cells), panels, quality].map(x => String(x ?? '').trim()).filter(Boolean).join(', ');
  return {
    scene: { ...scene, camera: '', prompt, negative: pageNegative(format, [c.negative, scene.negative].filter(Boolean).join(', '), bubbles), finalPrompt: true, characters },
    config: { useCoords: perPanel, ...pageSize(format, page, c) },
  };
}
