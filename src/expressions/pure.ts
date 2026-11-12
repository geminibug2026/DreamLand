// 표정: 화면 · 저장과 무관한 로직 (옛 f-expressions.js 의 <pure> 구간 그대로)

/** 기본 감정 28가지 (neutral 포함, 이름 그대로 호환) */
export const DEFAULT_LABELS = ['admiration', 'amusement', 'anger', 'annoyance', 'approval', 'caring', 'confusion', 'curiosity', 'desire', 'disappointment', 'disapproval', 'disgust', 'embarrassment', 'excitement', 'fear', 'gratitude', 'grief', 'joy', 'love', 'nervousness', 'optimism', 'pride', 'realization', 'relief', 'remorse', 'sadness', 'surprise', 'neutral'];
export const KO: Record<string, string> = { admiration: '감탄', amusement: '즐거움', anger: '분노', annoyance: '짜증', approval: '수긍', caring: '다정함', confusion: '혼란', curiosity: '호기심', desire: '갈망', disappointment: '실망', disapproval: '못마땅함', disgust: '혐오', embarrassment: '부끄러움', excitement: '신남', fear: '두려움', gratitude: '고마움', grief: '비통', joy: '기쁨', love: '사랑', nervousness: '긴장', optimism: '기대', pride: '뿌듯함', realization: '깨달음', relief: '안도', remorse: '미안함', sadness: '슬픔', surprise: '놀람', neutral: '평온' };
/** 파일 이름·모델 답에서 알아볼 다른 이름들 */
export const ALIASES: Record<string, string> = {
  admiration: 'admire admiring impressed awe 감탄 존경 동경', amusement: 'amused laugh laughing laughter lol 즐거움 웃김 폭소 깔깔', anger: 'angry mad rage furious 화남 화 분노 화난 화냄 빡침',
  annoyance: 'annoyed irritated irritation 짜증 귀찮음 언짢음', approval: 'approve approving nod agree 수긍 인정 동의 끄덕', caring: 'care kind gentle worry worried 다정 다정함 상냥 걱정 배려',
  confusion: 'confused puzzled 혼란 어리둥절 갸웃 당혹', curiosity: 'curious interested 호기심 궁금 궁금함 흥미', desire: 'lust longing 갈망 욕망 유혹', disappointment: 'disappointed 실망 낙담',
  disapproval: 'disapprove disapproving 못마땅 못마땅함 불만 반대', disgust: 'disgusted 혐오 역겨움 경멸', embarrassment: 'embarrassed shy blush blushing flustered 부끄러움 수줍음 당황 홍조 민망',
  excitement: 'excited thrilled 신남 흥분 들뜸 설렘', fear: 'scared afraid terrified fright 공포 두려움 무서움 겁', gratitude: 'grateful thankful thanks 감사 고마움', grief: 'grieving despair 비통 절망 오열',
  joy: 'happy happiness smile smiling glad cheerful 기쁨 행복 웃음 미소 웃는 방긋', love: 'loving heart 사랑 애정 하트', nervousness: 'nervous anxious anxiety uneasy 긴장 불안 초조',
  optimism: 'optimistic hope hopeful 기대 희망 낙관', pride: 'proud smug 뿌듯 뿌듯함 자랑 의기양양 우쭐', realization: 'realize realise realized aha 깨달음 아하', relief: 'relieved 안도 안심',
  remorse: 'sorry guilty guilt regret 미안 미안함 후회 죄책감', sadness: 'sad cry crying tears unhappy 슬픔 슬픈 우는 눈물 울음 우울', surprise: 'surprised shock shocked startled 놀람 놀란 깜짝 충격',
  neutral: 'normal default idle base calm plain 기본 평상시 평온 무표정 보통 차분',
};
/** 그 감정의 그림이 없을 때 대신 쓸 가까운 감정 (앞에 있을수록 가깝다) */
export const RELATED: Record<string, string[]> = {
  admiration: ['approval', 'love', 'joy', 'surprise'], amusement: ['joy', 'excitement'], anger: ['annoyance', 'disapproval', 'disgust'], annoyance: ['anger', 'disapproval', 'disgust'], approval: ['admiration', 'joy', 'optimism'],
  caring: ['love', 'gratitude', 'joy'], confusion: ['curiosity', 'surprise', 'nervousness'], curiosity: ['confusion', 'surprise', 'realization'], desire: ['love', 'excitement'], disappointment: ['sadness', 'disapproval', 'remorse'],
  disapproval: ['annoyance', 'disappointment', 'anger'], disgust: ['disapproval', 'annoyance', 'anger'], embarrassment: ['nervousness', 'love'], excitement: ['joy', 'amusement', 'optimism'], fear: ['nervousness', 'surprise'],
  gratitude: ['joy', 'caring', 'love', 'relief'], grief: ['sadness', 'remorse', 'disappointment'], joy: ['amusement', 'excitement', 'optimism', 'love'], love: ['caring', 'joy', 'desire', 'admiration'], nervousness: ['fear', 'embarrassment', 'confusion'],
  optimism: ['joy', 'excitement', 'approval'], pride: ['joy', 'approval', 'admiration'], realization: ['surprise', 'curiosity'], relief: ['joy', 'gratitude', 'optimism'], remorse: ['sadness', 'embarrassment', 'disappointment', 'grief'],
  sadness: ['grief', 'disappointment', 'remorse'], surprise: ['realization', 'confusion', 'excitement', 'fear'], neutral: [],
};

export const IMG_EXT = /\.(png|webp|gif|jpe?g|avif|apng|bmp)$/i;
export const reEsc = (s: string) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
/** 감정 이름으로 쓸 수 있게 다듬기: 소문자, 공백은 _, 영문·숫자·한글·_·- 만 */
export const cleanLabel = (s: unknown) => String(s ?? '').trim().toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9가-힣ㄱ-ㅎ_-]/g, '').replace(/^[_-]+|[_-]+$/g, '').slice(0, 32);
/** 경로와 확장자를 뗀 파일 이름 (소문자) */
export const fileKey = (name: unknown) => (String(name ?? '').split(/[\\/]/).pop() ?? '').replace(IMG_EXT, '').trim().toLowerCase();

/** 이름 → 감정 찾기 표: 감정 이름과 그 별칭 */
function knownMap(labels: string[]) {
  const map = new Map<string, string>();
  for (const l of labels) map.set(String(l).toLowerCase(), l);
  for (const l of labels) for (const a of (ALIASES[l] || '').split(' ')) if (a && !map.has(a)) map.set(a, l);
  return map;
}

export interface LabelMatch { label: string; how: 'exact' | 'prefix' | 'token' | 'none'; guess: string }
/**
 * 파일 이름 → 감정.  { label, how: 'exact'|'prefix'|'token'|'none', guess }
 * 기본 규칙(joy.png, joy-1.png, joy.smile.png)에 더해 joy_1, joy2, joy (2), 이름_joy, 한글 별칭도 알아본다.
 */
export function matchLabel(fileName: string, labels: string[]): LabelMatch {
  const key = fileKey(fileName), map = knownMap(labels);
  if (map.has(key)) return { label: map.get(key)!, how: 'exact', guess: '' };
  // 기본 규칙: 첫 - 또는 . 앞까지가 감정 이름
  const st = (key.match(/^(.+?)(?:[-.].*)?$/)?.[1] ?? key).trim();
  if (map.has(st)) return { label: map.get(st)!, how: 'prefix', guess: '' };
  // 가장 긴 감정 이름으로 시작하고, 그 뒤가 구분자나 숫자인 경우 (half-smile-2, joy_1, joy2, joy (2))
  const starts = [...map.keys()].filter(k => key.startsWith(k) && /^[\s_\-.(\[\d]/.test(key.slice(k.length))).sort((a, b) => b.length - a.length)[0];
  if (starts) return { label: map.get(starts)!, how: 'prefix', guess: '' };
  // 조각으로 나눠 찾기: 맨 앞 → 맨 뒤 → 가운데 (seraphina_joy, char-angry-01)
  const toks = key.split(/[\s_\-.()\[\]{}+,]+/).map(t => t.replace(/\d+$/, '')).filter(Boolean);
  for (const t of [toks[0], toks[toks.length - 1], ...toks.slice(1, -1)]) if (t && map.has(t)) return { label: map.get(t)!, how: 'token', guess: '' };
  return { label: '', how: 'none', guess: cleanLabel(st.replace(/[\s_]*\(?\d+\)?$/, '')) };
}

const TAG_NAMES = ['emotion', 'expression', 'expr', '표정', '감정'];
const TAG_RE = /[ \t]*<\s*(?:emotion|expression|expr|표정|감정)\s*[:=：]\s*([^<>\n]{1,48}?)\s*\/?\s*>[ \t]*/gi;
const PAIR_RE = /[ \t]*<\s*(emotion|expression|expr|표정|감정)\s*>\s*([^<>\n]{1,48}?)\s*<\s*\/\s*\1\s*>[ \t]*/gi;
export const TAG_QUICK = /<\s*(?:emotion|expression|expr|표정|감정)\s*[:=：>]/i;
/** 답변에서 숨은 표정 태그를 떼어 낸다 → { text, label(적힌 그대로), found }.  여러 개면 마지막 것 */
export function extractTag(text: unknown): { text: string; label: string; found: boolean } {
  const src = String(text ?? '');
  if (src.indexOf('<') < 0 || !TAG_QUICK.test(src)) return { text: src, label: '', found: false };
  let colon = '', pair = '';
  const out = src.replace(TAG_RE, (_m, val: string) => { colon = val.trim(); return ''; }).replace(PAIR_RE, (_m, _name: string, val: string) => { pair = val.trim(); return ''; });
  if (out === src) return { text: src, label: '', found: false };
  return { text: out.replace(/[ \t\r\n]+$/, ''), label: colon || pair, found: true };   // 짝 태그(<emotion>joy</emotion>)는 콜론 태그가 없을 때만 읽는다
}
/** 생성 중: 아직 덜 적힌 태그 조각(<emo, <emotion:jo)을 화면에서 가린다 */
export function hidePartial(text: unknown): string {
  const s = String(text ?? '');
  const pair = s.match(/[ \t]*<\s*(?:emotion|expression|expr|표정|감정)\s*>[^<>\n]{0,48}(?:<\/?[^<>\n]{0,20})?$/i);
  if (pair) return s.slice(0, pair.index).replace(/[ \t\r\n]+$/, '');
  const m = s.match(/[ \t]*<([^<>\n]{0,60})$/);
  if (!m) return s;
  const inner = m[1].trim().toLowerCase(), head = inner.match(/^[a-z가-힣]*/)![0], rest = inner.slice(head.length);
  const mine = rest ? TAG_NAMES.includes(head) && /^\s*[:=：]/.test(rest) : TAG_NAMES.some(n => n.startsWith(head));
  return mine ? s.slice(0, m.index).replace(/[ \t\r\n]+$/, '') : s;
}

/** 모델이 적은 말 → 감정 이름.  못 알아보면 '' */
export function canonLabel(raw: unknown, labels: string[]): string {
  let s = String(raw ?? '').trim().toLowerCase();
  if (!s) return '';
  const j = s.match(/"(?:emotion|expression|label|표정|감정)"\s*:\s*"([^"]+)"/);
  if (j) s = j[1];
  s = s.replace(/^[`'"“”‘’\[(<{*\s]+|[`'"“”‘’\])>}*\s.!?。,:;]+$/g, '');
  if (!s) return '';
  const map = knownMap(labels);
  if (map.has(s)) return map.get(s)!;
  const norm = s.replace(/[\s-]+/g, '_');
  if (map.has(norm)) return map.get(norm)!;
  const squash = (v: string) => v.replace(/[\s_-]+/g, ''), flat = squash(s);   // half smile = half-smile = half_smile
  for (const [k, l] of map) if (squash(k) === flat) return l;
  // 문장 속에 든 이름: 가장 긴 것
  const hit = [...map.keys()].filter(k => k.length >= 2 && new RegExp('(^|[^a-z0-9가-힣])' + reEsc(k) + '([^a-z0-9가-힣]|$)').test(s)).sort((a, b) => b.length - a.length)[0];
  if (hit) return map.get(hit)!;
  // 어미가 붙은 한 낱말 (joyful, 기쁨이에요)
  if (!/\s/.test(s)) { const pre = [...map.keys()].filter(k => k.length >= (/[가-힣]/.test(k) ? 2 : 4) && s.startsWith(k)).sort((a, b) => b.length - a.length)[0]; if (pre) return map.get(pre)!; }
  return '';
}

// 키워드 사전: | 로 나눈 낱말. 앞의 ! 는 강한 단서(2배). 영문은 낱말 첫머리부터, 한글은 어디든 들어 있으면 맞는다
const LEX: Record<string, string> = {
  anger: '!분노|!격분|!화를 내|!화가 나|!화가 치|!화났|!화난|!버럭|!소리쳤|!소리를 질|!노려보|!노려봤|!이를 갈|!이를 악|주먹을 쥐|주먹을 꽉|!닥쳐|!으르렁|!호통|쏘아붙|언성|살기|!furious|!enraged|!rage|!snarl|!glare|!yell|angry|anger|growl|seeth|fuming',
  annoyance: '!짜증|귀찮|성가시|혀를 찼|혀를 차|투덜|툴툴|미간을 찌푸|미간을 좁|인상을 쓰|인상을 찌푸|눈을 굴|쯧|한숨을 푹|못 말려|!annoy|!irritat|groan|tsk|scowl|frown|grumbl|exasperat|rolls her eyes|rolls his eyes|rolled her eyes|rolled his eyes',
  sadness: '!슬프|!슬픔|!슬퍼|!눈물|!울먹|울었|울고|!흐느|훌쩍|서럽|서러|우울|쓸쓸|외로|처량|고개를 떨|눈시울|목이 메|시무룩|풀이 죽|ㅠㅠ|ㅜㅜ|!sad|!tear|!cry|!cries|!sob|!weep|sorrow|lonely|melanchol|depress|miserable',
  grief: '!오열|!통곡|!절망|!비통|무너져 내|가슴이 찢|!grief|!griev|!mourn|!despair|!wail|devastat|heartbroken|anguish',
  joy: '!기쁘|!기뻐|!기쁨|!행복|활짝|환하게|환한|!미소|웃으며|웃었다|웃는다|웃어 보|웃음|방긋|싱긋|빙긋|생긋|헤헤|히히|즐거|ㅎㅎ|!happy|!happi|!joy|!smil|grin|beam|cheerful|delight|glad',
  amusement: '!웃음을 터|!폭소|!깔깔|!킥킥|!낄낄|!키득|!큭큭|푸흡|푸하하|하하|ㅋㅋ|재밌|재미있|장난스|놀리듯|농담|!laugh|!chuckl|!giggl|!snicker|amus|teasing|playful|haha|snort',
  excitement: '!신이 나|!신나|!들뜬|!들떠|!흥분|두근두근|설레|폴짝|방방|눈을 반짝|눈이 반짝|와아|우와|대박|야호|!excit|!thrill|eager|bounc|squeal|yay|can\'t wait',
  love: '!사랑|좋아해|좋아한|!애정|애틋|입을 맞|입맞|!키스|껴안|끌어안|품에 안|포옹|자기야|♥|❤|!love|!adore|!kiss|embrac|cuddl|affection|darling|beloved|sweetheart',
  desire: '!갈망|!욕망|원해|원한다|탐하|!유혹|뜨거운 숨|달아오|숨이 거칠|갈구|!desire|!lust|!crav|yearn|seduc|hungrily|longing',
  caring: '!걱정|괜찮아\\?|괜찮니|괜찮아요\\?|!다정|!상냥|부드럽게|쓰다듬|토닥|보살피|챙겨|돌봐|위로|달래|따뜻하게|!gentl|!tender|!comfort|sooth|caring|worried about|reassur|strok',
  gratitude: '!고마워|!고맙|!감사|덕분|!thank|!grateful|!gratitude|appreciat',
  admiration: '!감탄|!대단해|!대단하|멋지|멋있|훌륭|!존경|굉장|근사|!admir|!impress|amazing|wonderful|magnificent|brilliant|in awe',
  approval: '!끄덕|잘했|맞아|동의|인정|찬성|옳|!nod|!approv|agree|well done|good job|exactly|indeed',
  disapproval: '!못마땅|탐탁|!고개를 저|!고개를 가로저|안 돼|안돼|그만둬|!꾸짖|나무라|타박|못써|!disapprov|shakes her head|shakes his head|shook her head|shook his head|!scold|reprimand|refus',
  disgust: '!역겹|!역겨|!혐오|구역질|토할|더럽|더러워|징그|끔찍|메스꺼|!경멸|!disgust|!revolt|!repuls|gross|nause|sicken|vile|contempt',
  embarrassment: '!부끄|!수줍|!얼굴이 빨개|!얼굴을 붉|!얼굴이 붉|얼굴이 달아|귀가 빨개|귀까지 빨|!홍조|볼이 붉|뺨이 붉|볼을 붉|뺨을 붉|!민망|!창피|!쑥스|당황|우물쭈물|시선을 피|눈을 피|!blush|!embarrass|!fluster|shy|sheepish|bashful|stammer',
  nervousness: '!긴장|!초조|!불안|!안절부절|떨리는|떨렸|식은땀|마른침|침을 삼|머뭇|망설|조마조마|더듬|!nervous|!anxious|uneasy|fidget|tense|hesitat|gulp|stutter',
  fear: '!두려|!두렵|!무서|!무섭|!겁에 질|!겁을 먹|!공포|소름|오싹|벌벌|덜덜|비명|뒷걸음|창백|얼어붙|!fear|!afraid|!scared|!terrif|!horror|panic|dread|scream|shudder|frighten',
  surprise: '!놀라|!놀랐|!놀란|!깜짝|눈을 크게|눈이 커|휘둥그레|휘둥그래|헉|뭐라고|세상에|설마|!화들짝|흠칫|움찔|입을 벌|\\?!|!\\?|!surpris|!startl|!shock|!gasp|astonish|stun|wide-eyed|eyes widen',
  confusion: '!혼란|!어리둥절|!갸웃|!갸우뚱|영문을|이해가 안|이해할 수 없|무슨 소리|무슨 말|뭐지|멍하니|얼떨떨|!당혹|!confus|!puzzl|!perplex|!bewilder|baffl|tilts her head|tilts his head|huh\\?',
  curiosity: '!궁금|!호기심|!흥미|관심이|유심히|빤히|들여다|살펴|물끄러미|뭘까|눈을 빛내|!curious|!curiosity|!intrigu|wonder|peer|inspect|examin',
  disappointment: '!실망|!낙담|아쉽|아쉬|!허탈|맥이 빠|김이 빠|어깨가 처|어깨를 늘어|기대했는데|!disappoint|let down|dismay|deflat|crestfallen|dishearten',
  optimism: '!희망|기대|잘 될|잘될|괜찮을 거|할 수 있|해낼|!다짐|!결심|힘내|파이팅|화이팅|!hope|!optimis|confident|determin|look forward|will be fine',
  pride: '!자랑스|!뿌듯|!의기양양|!으쓱|!우쭐|당당|가슴을 펴|턱을 치켜|자신만만|득의|콧대|!proud|!pride|!smug|triumphant|boast|smirk',
  realization: '!깨달|!알아차|알아챘|그제야|그제서야|아하|그렇구나|그랬구나|그런 거였|이제야 알|눈치챘|!realiz|!realis|dawned on|it hit|epiphany|i see',
  relief: '!안도|!안심|!다행|한시름|가슴을 쓸어|긴장이 풀|마음이 놓|휴우|!relief|!relieved|phew|thank goodness|exhale',
  remorse: '!미안|!죄송|!사과|잘못했|!후회|!죄책감|용서|면목|뉘우|고개를 숙|!sorry|!apolog|!regret|!remorse|!guilt|forgive|ashamed',
};
interface LexRe { strong: RegExp | null; weak: RegExp | null }
const lexCache = new Map<string, LexRe>();
function lexRe(src: string): LexRe {
  const hit = lexCache.get(src); if (hit) return hit;
  const part = (t: string) => /^[a-z]/i.test(t) ? '\\b' + t : t;
  const strong: string[] = [], weak: string[] = [];
  for (const raw of String(src).split('|')) {
    const t = raw.trim(); if (!t) continue;
    const isStrong = t[0] === '!' && t.length > 1 && t[1] !== '\\';   // "!\?" 는 글자 그대로의 !? 이다
    (isStrong ? strong : weak).push(part(isStrong ? t.slice(1) : t));
  }
  const mk = (list: string[]) => { if (!list.length) return null; try { return new RegExp(list.join('|'), 'gi'); } catch { return null; } };
  const out = { strong: mk(strong), weak: mk(weak) };
  lexCache.set(src, out); return out;
}
/** 감정을 읽기 좋게 다듬은 글: 태그·코드·주소를 걷어 낸다 */
export const plainText = (text: unknown) => String(text ?? '').replace(/```[\s\S]*?```/g, ' ').replace(/\{\{[^{}]*\}\}/g, ' ').replace(/<[^<>]{0,200}>/g, ' ').replace(/https?:\/\/\S+/g, ' ').replace(/[ \t]+/g, ' ').trim();
export interface CustomLabel { label: string; name?: string; keys?: string }
/**
 * 키워드로 감정 추정 (호출 없음).  opts.labels: 고를 수 있는 감정(비우면 전부), opts.custom: [{ label, keys }]
 * → { label, scores }.  글 뒤쪽에 나온 단서를 조금 더 쳐 준다. 단서가 없으면 neutral
 */
export function keywordLabel(text: unknown, { labels = [], custom = [] }: { labels?: string[]; custom?: CustomLabel[] } = {}): { label: string; scores: Record<string, number> } {
  const s = plainText(text).toLowerCase(), len = Math.max(1, s.length), raw: Record<string, number> = {};
  const scan = (label: string, src: string) => {
    const { strong, weak } = lexRe(src); let n = 0, sc = 0;
    for (const [re, w] of [[strong, 2], [weak, 1]] as const) { if (!re) continue; re.lastIndex = 0; for (const m of s.matchAll(re)) { if (++n > 8) break; sc += w * (1 + 0.6 * m.index / len); } }
    if (sc) raw[label] = (raw[label] || 0) + sc;
  };
  for (const [label, src] of Object.entries(LEX)) scan(label, src);
  for (const c of custom) if (c?.label && c.keys) scan(c.label, String(c.keys).split(/[,|\n]/).map(k => k.trim().toLowerCase()).filter(Boolean).map(k => '!' + reEsc(k)).join('|'));   // 직접 적은 키워드는 강한 단서
  const can = labels.length ? new Set(labels) : null, scores: Record<string, number> = {};
  for (const [label, sc] of Object.entries(raw)) {
    if (!can || can.has(label)) scores[label] = (scores[label] || 0) + sc;
    else { const near = (RELATED[label] || []).find(r => can.has(r)); if (near) scores[near] = (scores[near] || 0) + sc * 0.7; }
  }
  const best = Object.entries(scores).sort((a, b) => b[1] - a[1])[0];
  if (best && best[1] >= 1) return { label: best[0], scores };
  return { label: !can || can.has('neutral') ? 'neutral' : '', scores };
}

/** 문자열 → 고정된 수 (같은 메시지는 늘 같은 그림을 고르게) */
export function hashStr(s: unknown): number { let x = 2166136261; for (let i = 0; i < String(s).length; i++) { x ^= String(s).charCodeAt(i); x = Math.imul(x, 16777619); } return x >>> 0; }

function zipName(bytes: Uint8Array, utf8: number): string {
  if (utf8) return new TextDecoder().decode(bytes);
  try { return new TextDecoder('utf-8', { fatal: true }).decode(bytes); } catch { /* 다음 */ }
  try { return new TextDecoder('euc-kr').decode(bytes); } catch { return new TextDecoder().decode(bytes); }   // 윈도우 탐색기로 묶은 한글 이름
}
async function inflateRaw(raw: Uint8Array): Promise<Uint8Array> {
  if (typeof DecompressionStream !== 'function') throw new Error('이 브라우저는 압축된 ZIP 을 풀 수 없어요');
  return new Uint8Array(await new Response(new Blob([raw as BlobPart]).stream().pipeThrough(new DecompressionStream('deflate-raw'))).arrayBuffer());
}
export interface ZipEntry { name: string; size: number; read(): Promise<Uint8Array> }
/**
 * ZIP 읽기 (외부 라이브러리 없이. 저장(0)과 deflate(8)만) → { entries: [{ name, size, read() → Uint8Array }], skipped: [이름] }
 * 폴더·숨김 파일·__MACOSX 는 건너뛰고, 암호가 걸렸거나 다른 압축 방식인 항목은 skipped 에 적는다.
 */
export function unzipEntries(buf: ArrayBuffer | Uint8Array): { entries: ZipEntry[]; skipped: string[] } {
  const u = buf instanceof Uint8Array ? buf : new Uint8Array(buf), dv = new DataView(u.buffer, u.byteOffset, u.byteLength);
  let e = -1;
  for (let i = u.length - 22, stop = Math.max(0, u.length - 22 - 65535); i >= stop; i--) if (dv.getUint32(i, true) === 0x06054b50) { e = i; break; }
  if (e < 0) throw new Error('ZIP 파일이 아니에요');
  const count = dv.getUint16(e + 10, true); let p = dv.getUint32(e + 16, true);
  if (count === 0xffff || p === 0xffffffff) throw new Error('너무 큰 ZIP(ZIP64)은 풀 수 없어요. 나눠서 올려 주세요');
  const entries: ZipEntry[] = [], skipped: string[] = [];
  for (let i = 0; i < count; i++) {
    if (p + 46 > u.length || dv.getUint32(p, true) !== 0x02014b50) break;
    const flag = dv.getUint16(p + 8, true), method = dv.getUint16(p + 10, true), csize = dv.getUint32(p + 20, true), size = dv.getUint32(p + 24, true);
    const n = dv.getUint16(p + 28, true), x = dv.getUint16(p + 30, true), c = dv.getUint16(p + 32, true), off = dv.getUint32(p + 42, true);
    const name = zipName(u.subarray(p + 46, p + 46 + n), flag & 0x800).replace(/\\/g, '/');
    p += 46 + n + x + c;
    if (!name || name.endsWith('/') || /(^|\/)__MACOSX\//.test(name) || (name.split('/').pop() ?? '').startsWith('.')) continue;
    if ((flag & 1) || (method !== 0 && method !== 8) || off + 30 > u.length || dv.getUint32(off, true) !== 0x04034b50) { skipped.push(name); continue; }
    const start = off + 30 + dv.getUint16(off + 26, true) + dv.getUint16(off + 28, true);
    if (start + csize > u.length) { skipped.push(name); continue; }
    const raw = u.subarray(start, start + csize);
    entries.push({ name, size, read: async () => method === 0 ? raw : inflateRaw(raw) });
  }
  return { entries, skipped };
}
