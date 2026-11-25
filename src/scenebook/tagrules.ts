// 대화 AI 에게 주는 "그림 프롬프트 쓰는 법". 지금 고른 모델의 규칙만 보낸다.
// V4.5 는 Danbooru 태그를 따르고 문장은 거의 읽지 않으며 토큰이 적다. V5 는 태그와 쉬운 영어 문장을 함께 읽는다
const TAGS = 'lowercase English tags separated by commas, spaces instead of underscores, one visible fact per tag';
const BANNED = 'names, story terms, mood words, quality, style or artist tags, and no negations: leave absent things out';
const COUNT = 'prompt begins with the subject count (1girl, 1boy, 2girls, no humans), then place, time, weather, light and key props';
export function writingRule(family: number, characters: number): string {
  if (family === 5) return `IMAGE PROMPT STYLE (NovelAI V5): this model follows Danbooru tags and plain English. Write concrete attributes as ${TAGS} (from side, cowboy shot, sitting, blush, white shirt, indoors, night, rain, backlighting), then add one or two short plain sentences for what tags cannot say: who is where, who does what to whom, how they are arranged. In a sentence refer to a person by a visible feature (the girl with silver hair), never by name. No ${BANNED}. ${COUNT}, then one sentence for the shared action. action begins with girl, boy or other, then pose, expression, gaze and contact; for an act between characters you may tag both sides: source#hug on the doer, target#hug on the receiver, mutual#hug when both do it. At most ${characters} featured characters; pos may be any value from 0 to 1 and must agree with the sentences.`;
  return `IMAGE PROMPT STYLE (NovelAI V4.5): this model follows Danbooru tags and reads little prose. Write prompt, action, outfit and appearance as ${TAGS}, using the established tag where one exists (from side, cowboy shot, looking at another, hand on another's shoulder, holding hands, sitting, arms crossed, blush, open mouth, white shirt, pleated skirt, indoors, bedroom, night, rain, backlighting). No sentences, ${BANNED}. ${COUNT}. action begins with girl, boy or other, then pose, expression, gaze and contact. For an act between characters, tag both sides: source#hug on the doer, target#hug on the receiver, mutual#hug when both do it. All prompts together fit about 500 tokens: keep only the tags that decide the picture. At most ${characters} featured characters; pos snaps to a 5 x 5 grid.`;
}
/** NovelAI 의 기본 "넣지 않을 것" 묶음 (V5 · V4.5 같은 글) */
const HEAVY = 'lowres, artistic error, film grain, scan artifacts, worst quality, bad quality, jpeg artifacts, very displeasing, chromatic aberration, dithering, halftone, screentone, multiple views, logo, too many watermarks, negative space, blank page';
export const UC_PRESETS: [id: string, text: string][] = [['basic', HEAVY], ['human', `${HEAVY}, @_@, mismatched pupils, glowing eyes, bad anatomy`]];
/** 이미 적어 둔 것에 묶음을 더한다 (같은 태그를 되풀이하지 않는다) */
export function mergeTags(preset: string, existing: string): string {
  const list = (v: unknown) => String(v ?? '').split(',').map(x => x.trim()).filter(Boolean), have = new Set(list(preset).map(x => x.toLowerCase()));
  return [...list(preset), ...list(existing).filter(x => !have.has(x.toLowerCase()))].join(', ');
}
/** 인물 프롬프트 앞머리의 girl · boy · other (숫자가 붙어 있으면 뗀다) */
const KIND = /^\s*1?(girl|boy|other)\s*(?:,\s*|$)/i;
export function leadingKind(value: unknown): [kind: string, rest: string] {
  const src = String(value ?? ''), m = src.match(KIND);
  return m ? [m[1].toLowerCase(), src.slice(m[0].length)] : ['', src];
}

// 장면에는 제목이 없다. 예전 판이 그림마다 넣던 "장면 1" 같은 자리표시는 숨기고, 누가 직접 적은 제목만 보인다
const PLACEHOLDER = /^(?:장면\s*\d*|scene\s*\d*|场景\s*\d*|새 장면|삽화|수동 생성|가져온 장면|imported scene|导入的场景|NovelAI generated image)$/i;
export function sceneLabel(scene?: { title?: unknown } | null): string { const title = String(scene?.title ?? '').trim(); return PLACEHOLDER.test(title) ? '' : title; }
/** 대기 중이거나 목록에 있는 그림을 서로 가려 볼 짧은 줄 */
export const sceneHint = (scene?: { title?: unknown; prompt?: unknown } | null): string => sceneLabel(scene) || String(scene?.prompt ?? '').replace(/\s+/g, ' ').trim().slice(0, 48);
/** 언어 모델에 장면을 넘길 때: 제목은 그림의 일부가 아니다 */
export const withoutTitle = <T extends { title?: unknown }>(scene: T): Omit<T, 'title'> => { const { title: _t, ...rest } = scene ?? {} as T; return rest; };
