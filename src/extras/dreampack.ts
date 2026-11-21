// 기본 딱지 묶음 「달빛 쪽지」: 드림랜드 고유의 선 그림 16장. 그림 파일 없이 코드로 SVG 를 만든다 (종이 쪽지 + 잉크 기호 + 한마디)
import { t, getLang } from '../i18n';
import { rng } from './cfg';

export interface DreamDef { id: string; name: string; keys: string; art: string }
// 색은 "종이" 물건의 고정 색 (fine.css 의 .fx-sheet 와 같다). <img> 안의 SVG 는 테마 변수를 읽지 못한다
const INK = '#2a251d', PAPER = '#f6f0e3', GOLD = '#a8842f';
const p = (d: string, k = '') => `<path d="${d}" ${k === 't' ? 'stroke-width=".8" opacity=".6"' : k === 'd' ? 'stroke-width=".8" opacity=".55" stroke-dasharray="1.5 3.5"' : k === 'a' ? `stroke="${GOLD}"` : k === 'af' ? `fill="${GOLD}" stroke="none"` : ''}/>`;
const star4 = (x: number, y: number, r: number) => { const q = r * 0.28; return `M${x} ${y - r}L${x + q} ${y - q}L${x + r} ${y}L${x + q} ${y + q}L${x} ${y + r}L${x - q} ${y + q}L${x - r} ${y}L${x - q} ${y - q}z`; };
const star5 = (x: number, y: number, r: number) => Array.from({ length: 10 }, (_, i) => { const a = -Math.PI / 2 + i * Math.PI / 5, k = i % 2 ? r * 0.42 : r; return `${i ? 'L' : 'M'}${(x + Math.cos(a) * k).toFixed(1)} ${(y + Math.sin(a) * k).toFixed(1)}`; }).join('') + 'z';
const rays = (x: number, y: number, r1: number, r2: number, n: number, from = 0, to = Math.PI * 2) => Array.from({ length: n }, (_, i) => { const a = from + (to - from) * (n === 1 ? 0 : i / (to - from >= Math.PI * 2 - 0.01 ? n : n - 1)); return `M${(x + Math.cos(a) * r1).toFixed(1)} ${(y + Math.sin(a) * r1).toFixed(1)}L${(x + Math.cos(a) * r2).toFixed(1)} ${(y + Math.sin(a) * r2).toFixed(1)}`; }).join('');

/** 모델에게 알려 주는 이름(영어 고정) · 뜻 낱말(감정 라벨 + 한국어 표현, 자동 고르기에 쓴다) · 그림 */
export const DREAM: DreamDef[] = [
  { id: 'moon', name: 'goodnight', keys: 'caring, good night, sleep, sweet dreams, 잘 자, 졸려', art: p('M68 26a23 23 0 1 0 14 36a18 18 0 0 1-14-36z') + p(star4(84, 34, 5), 'a') + p(star4(40, 30, 3), 't') + p(star4(90, 54, 2.4), 't') },
  { id: 'star', name: 'yay', keys: 'joy, excitement, pride, happy, great, 좋아, 신나, 최고', art: p(star5(60, 50, 19)) + p(rays(60, 50, 25, 30, 10), 'a') + p(star5(60, 50, 8), 't') },
  { id: 'teacup', name: 'tea-break', keys: 'relief, rest, calm, break, 쉬자, 쉬어, 차 한잔', art: p('M40 46h36v7a18 18 0 0 1-36 0zM76 49h4a6 6 0 0 1 0 12h-6M36 76h44') + p('M50 40c-4-4 4-7 0-12M60 40c-4-4 4-7 0-12M70 40c-4-4 4-7 0-12', 't') + p('M44 54h28', 'd') },
  { id: 'letter', name: 'miss-you', keys: 'love, desire, longing, miss you, 보고 싶어, 그리워', art: p('M36 34h48v34H36zM36 34l24 19 24-19') + p('M36 68l17-15M84 68L67 53', 't') + p('M60 63.5s-4-2.6-4-5.4a2.3 2.3 0 0 1 4-1.3a2.3 2.3 0 0 1 4 1.3c0 2.8-4 5.4-4 5.4z', 'af') + p('M26 44h6M24 52h8M28 60h4', 'd') },
  { id: 'heart', name: 'thanks', keys: 'gratitude, love, admiration, thank you, 고마워, 고맙, 감사', art: p('M60 72s-23-13-23-29a12 12 0 0 1 23-5a12 12 0 0 1 23 5c0 16-23 29-23 29z') + p('M60 64s-15-9-15-20a7 7 0 0 1 9-6', 't') + p(star4(88, 30, 4), 'a') },
  { id: 'cloud', name: 'sigh', keys: 'sadness, disappointment, grief, tired, 하아, 우울, 힘들, 속상', art: p('M42 58a10 10 0 0 1 2-20a14 14 0 0 1 27-2a11 11 0 0 1 5 22z') + p('M46 64l-3 8M56 64l-3 8M66 64l-3 8M76 64l-3 8', 'd') + p('M50 44a7 7 0 0 1 9-5', 't') },
  { id: 'sun', name: 'good-morning', keys: 'optimism, morning, hello, wake up, 좋은 아침, 일어났', art: p('M30 64h60M42 64a18 18 0 0 1 36 0') + p(rays(60, 64, 23, 29, 7, Math.PI, Math.PI * 2), 'a') + p('M36 70h48M44 76h32', 't') },
  { id: 'key', name: 'secret', keys: 'nervousness, secret, promise, 비밀, 쉿, 약속', art: p('M56 50a10 10 0 1 1-20 0a10 10 0 0 1 20 0zM56 50h30M78 50v8M86 50v6') + p('M50 50a4 4 0 1 1-8 0a4 4 0 0 1 8 0z', 't') + p(star4(72, 34, 3.4), 'a') + p('M30 68h56', 'd') },
  { id: 'bell', name: 'hey', keys: 'annoyance, attention, answer me, 저기, 대답, 어디야, 뭐 해', art: p('M44 62c0-6 4-8 4-18a12 12 0 0 1 24 0c0 10 4 12 4 18zM56 66a4 4 0 0 0 8 0M60 32v-4') + p('M33 38a18 18 0 0 0 0 16M87 38a18 18 0 0 1 0 16', 'a') + p('M27 34a26 26 0 0 0 0 24M93 34a26 26 0 0 1 0 24', 't') },
  { id: 'umbrella', name: 'sorry', keys: 'remorse, embarrassment, sorry, apology, 미안, 죄송, 잘못', art: p('M34 52a26 26 0 0 1 52 0zM60 52v18a5 5 0 0 1-10 0M60 26v-3') + p('M34 52a6.5 6.5 0 0 1 13 0a6.5 6.5 0 0 1 13 0a6.5 6.5 0 0 1 13 0a6.5 6.5 0 0 1 13 0', 't') + p('M30 28l-3 7M90 28l-3 7M96 44l-3 7M24 46l-3 7', 'd') },
  { id: 'candle', name: 'hmm', keys: 'curiosity, realization, thinking, wonder, 음, 글쎄, 생각', art: p('M52 48h16v26H52zM44 74h32M60 48v-4') + p('M60 44c-5-5 0-9 0-15c4 5 5 10 0 15z', 'a') + p('M74 34a14 14 0 1 1-28 0a14 14 0 0 1 28 0z', 'd') + p('M56 54v14', 't') },
  { id: 'book', name: 'later', keys: 'see you later, bye, busy, 이따 봐, 나중에, 바빠', art: p('M60 42c-8-5-18-5-26-2v30c8-3 18-3 26 2c8-5 18-5 26-2V40c-8-3-18-3-26 2zM60 42v30') + p('M40 48c5-1 10-1 14 1M40 55c5-1 10-1 14 1M40 62c5-1 10-1 14 1', 't') + p('M72 38v15l3-3 3 3V39', 'a') },
  { id: 'comet', name: 'wow', keys: 'surprise, admiration, amazing, 우와, 대박, 진짜, 헐', art: p(star5(76, 36, 10)) + p('M67 43L36 68M71 49L48 70M62 38L38 56', 't') + p('M30 74l4-3M42 76l3-2', 'a') + p(star4(40, 32, 3), 't') },
  { id: 'stamp', name: 'okay', keys: 'approval, ok, agreed, got it, 알겠어, 응, 그래, 좋아요', art: p('M80 50a20 20 0 1 1-40 0a20 20 0 0 1 40 0z') + p('M76 50a16 16 0 1 1-32 0a16 16 0 0 1 32 0z', 'd') + p('M51 50l7 7 12-14', 'a') },
  { id: 'question', name: 'what', keys: 'confusion, what, huh, 뭐라고, 응?, 무슨, 뭐야', art: p('M52 42a9 9 0 1 1 13 8c-3 2-5 4-5 9') + `<circle cx="60" cy="67" r="1.8" fill="${INK}" stroke="none"/>` + `<ellipse cx="60" cy="50" rx="27" ry="11" transform="rotate(-18 60 50)" stroke-width=".8" opacity=".55" stroke-dasharray="1.5 3.5"/>` + p(star4(85, 38, 3), 'a') },
  { id: 'hourglass', name: 'wait', keys: 'wait, patience, hold on, 기다려, 잠깐, 잠시만', art: p('M46 30h28M46 72h28M48 30c0 12 10 14 12 21c2-7 12-9 12-21M48 72c0-12 10-14 12-21c2 7 12 9 12 21') + p('M54 68c2-4 4-5 6-5s4 1 6 5z', 'af') + p('M60 53v8', 'a') + p('M54 36h12', 't') },
];

const cache = new Map<string, string>();
/** 딱지 한 장의 그림 주소 (data URL). 한마디는 화면 언어를 따른다 */
export function dreamSvg(d: DreamDef): string {
  const lang = getLang(), key = d.id + ':' + lang, hit = cache.get(key); if (hit) return hit;
  const word = t('extras.stk.d.' + d.id), r = rng('dream:' + d.id), tilt = (r() * 6 - 3).toFixed(1);
  // 손으로 그은 듯한 밑줄: 조금 흔들리는 한 줄
  const w = Math.min(64, 16 + word.length * (lang === 'en' ? 5 : 10)), x0 = 60 - w / 2;
  const under = `M${x0.toFixed(1)} 106c${(w / 3).toFixed(1)} ${(r() * 3 - 1.5).toFixed(1)} ${(w * 2 / 3).toFixed(1)} ${(r() * 3 - 1.5).toFixed(1)} ${w.toFixed(1)} ${(r() * 2 - 1).toFixed(1)}`;
  const esc = (s: string) => s.replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c] as string));
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120" width="240" height="240">`
    + `<rect x="1.5" y="1.5" width="117" height="117" rx="4" fill="${PAPER}" stroke="${INK}" stroke-opacity=".5" stroke-width="1"/>`
    + `<rect x="5.5" y="5.5" width="109" height="109" rx="2" fill="none" stroke="${INK}" stroke-opacity=".22" stroke-width=".6"/>`
    + `<g fill="none" stroke="${INK}" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" transform="translate(0 -3)">${d.art}</g>`
    + `<text x="60" y="100" text-anchor="middle" transform="rotate(${tilt} 60 96)" font-family="'Nanum Pen Script','Gaegu','Bradley Hand','Segoe Print','Noto Serif KR',cursive,serif" font-size="${lang === 'en' ? 15 : 14.5}" font-style="italic" fill="${INK}">${esc(word)}</text>`
    + `<path d="${under}" fill="none" stroke="${GOLD}" stroke-width="1" stroke-linecap="round" transform="rotate(${tilt} 60 96)"/></svg>`;
  const url = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
  cache.set(key, url); return url;
}
