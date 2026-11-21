// 답장 속 숨은 꼬리표([notes: …] [cut: "…"] [whisper: 이름 | …] [to: 방 | …] …)를 떼어 내고 가리는 순수 함수
export const TAGS = ['notes', 'cut', 'whisper', 'to', 'stage', 'about', 'leave', 'enter'] as const;
export type TagName = typeof TAGS[number];
export interface Tag { name: TagName; arg: string }
const NAMES = TAGS.join('|');
const WHOLE = new RegExp(`\\[(${NAMES})\\s*:\\s*([^\\]]*)\\]`, 'gi');
/** 쓰다 만 꼬리표: 글이 아직 오는 중이라 닫는 괄호가 없다 */
const OPEN = new RegExp(`\\[(?:${NAMES})\\s*:[^\\]]*$`, 'i');
/** 꼬리표를 떼어 낸 자리의 빈 줄과 줄 끝 공백을 정리한다 */
const tidy = (s: string) => s.replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').replace(/^\n+|\s+$/g, '');
/** 꼬리표를 모두 떼어 낸다. only 를 주면 그 이름만 (나머지는 글에 남는다) */
export function takeTags(text: string, only?: readonly string[]): { text: string; tags: Tag[] } {
  const tags: Tag[] = [];
  if (!text || text.indexOf('[') < 0) return { text, tags };
  const out = text.replace(WHOLE, (m, n: string, arg: string) => {
    const name = n.toLowerCase() as TagName; if (only && !only.includes(name)) return m;
    tags.push({ name, arg: arg.trim() }); return '';
  });
  return { text: tags.length ? tidy(out) : text, tags };
}
/** 화면에 보일 때 가린다 (오는 중의 쓰다 만 꼬리표도) */
export function hideTags(text: string): string {
  if (!text || text.indexOf('[') < 0) return text;
  const out = text.replace(WHOLE, '').replace(OPEN, '');
  return out === text ? text : tidy(out);
}
/** "이름 | 글" 꼴의 인자를 둘로. 막대가 없으면 첫 쌍점 · 줄표도 받아 준다 */
export function splitArg(arg: string): [string, string] {
  const m = /^\s*"?([^|"]{1,60}?)"?\s*\|\s*([\s\S]+)$/.exec(arg) || /^\s*"?([^:—"]{1,40}?)"?\s*[:—]\s*([\s\S]+)$/.exec(arg);
  return m ? [m[1].trim(), unquote(m[2])] : ['', unquote(arg)];
}
export const unquote = (s: string) => s.trim().replace(/^["“”'‘’「『]+|["“”'‘’」』]+$/g, '').trim();
