// ── Dreamland 표정: 감정에 따라 바뀌는 초상 (표정 세트 · 감정 판정 · 초상/아바타/스탠딩 표시) ──
// 다른 파일은 고치지 않는다. 연결은 hooks.js 의 X 등록부, 이벤트, 대화 화면 DOM 으로만 한다.
import { S, DB, h, on, uid, now, download, pickFiles, readDataURL, shrinkImage, bytesToDataURL, dataURLToBytes, mimeOf, msgText } from './core.js';
import { icon, btn, iconBtn, toast, modal, confirmBox, promptBox, avatar, charPicker, go } from './ui.js';
import { X } from './hooks.js';
import { quickCall, macro, makeCtx, tokens } from './engine.js';
import { zip } from './assets.js';
import { chatApi } from './chat.js';

// ═══════════════════════════════════════════════════════════════════════
// <pure> 화면·저장과 무관한 로직. 이 구간은 import 없이 혼자 돌아가야 한다 (node 로 검증)
// ═══════════════════════════════════════════════════════════════════════

/** 기본 감정 28가지 (neutral 포함, 이름 그대로 호환) */
export const DEFAULT_LABELS = ['admiration', 'amusement', 'anger', 'annoyance', 'approval', 'caring', 'confusion', 'curiosity', 'desire', 'disappointment', 'disapproval', 'disgust', 'embarrassment', 'excitement', 'fear', 'gratitude', 'grief', 'joy', 'love', 'nervousness', 'optimism', 'pride', 'realization', 'relief', 'remorse', 'sadness', 'surprise', 'neutral'];
export const KO = { admiration: '감탄', amusement: '즐거움', anger: '분노', annoyance: '짜증', approval: '수긍', caring: '다정함', confusion: '혼란', curiosity: '호기심', desire: '갈망', disappointment: '실망', disapproval: '못마땅함', disgust: '혐오', embarrassment: '부끄러움', excitement: '신남', fear: '두려움', gratitude: '고마움', grief: '비통', joy: '기쁨', love: '사랑', nervousness: '긴장', optimism: '기대', pride: '뿌듯함', realization: '깨달음', relief: '안도', remorse: '미안함', sadness: '슬픔', surprise: '놀람', neutral: '평온' };
/** 파일 이름·모델 답에서 알아볼 다른 이름들 */
export const ALIASES = {
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
export const RELATED = {
  admiration: ['approval', 'love', 'joy', 'surprise'], amusement: ['joy', 'excitement'], anger: ['annoyance', 'disapproval', 'disgust'], annoyance: ['anger', 'disapproval', 'disgust'], approval: ['admiration', 'joy', 'optimism'],
  caring: ['love', 'gratitude', 'joy'], confusion: ['curiosity', 'surprise', 'nervousness'], curiosity: ['confusion', 'surprise', 'realization'], desire: ['love', 'excitement'], disappointment: ['sadness', 'disapproval', 'remorse'],
  disapproval: ['annoyance', 'disappointment', 'anger'], disgust: ['disapproval', 'annoyance', 'anger'], embarrassment: ['nervousness', 'love'], excitement: ['joy', 'amusement', 'optimism'], fear: ['nervousness', 'surprise'],
  gratitude: ['joy', 'caring', 'love', 'relief'], grief: ['sadness', 'remorse', 'disappointment'], joy: ['amusement', 'excitement', 'optimism', 'love'], love: ['caring', 'joy', 'desire', 'admiration'], nervousness: ['fear', 'embarrassment', 'confusion'],
  optimism: ['joy', 'excitement', 'approval'], pride: ['joy', 'approval', 'admiration'], realization: ['surprise', 'curiosity'], relief: ['joy', 'gratitude', 'optimism'], remorse: ['sadness', 'embarrassment', 'disappointment', 'grief'],
  sadness: ['grief', 'disappointment', 'remorse'], surprise: ['realization', 'confusion', 'excitement', 'fear'], neutral: [],
};

const IMG_EXT = /\.(png|webp|gif|jpe?g|avif|apng|bmp)$/i;
const reEsc = s => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
/** 감정 이름으로 쓸 수 있게 다듬기: 소문자, 공백은 _, 영문·숫자·한글·_·- 만 */
export const cleanLabel = s => String(s ?? '').trim().toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9가-힣ㄱ-ㅎ_-]/g, '').replace(/^[_-]+|[_-]+$/g, '').slice(0, 32);
/** 경로와 확장자를 뗀 파일 이름 (소문자) */
export const fileKey = name => String(name ?? '').split(/[\\/]/).pop().replace(IMG_EXT, '').trim().toLowerCase();

/** 이름 → 감정 찾기 표: 감정 이름과 그 별칭 */
function knownMap(labels) {
  const map = new Map();
  for (const l of labels) map.set(String(l).toLowerCase(), l);
  for (const l of labels) for (const a of (ALIASES[l] || '').split(' ')) if (a && !map.has(a)) map.set(a, l);
  return map;
}

/**
 * 파일 이름 → 감정.  { label, how: 'exact'|'prefix'|'token'|'none', guess }
 * 기본 규칙(joy.png, joy-1.png, joy.smile.png)에 더해 joy_1, joy2, joy (2), 이름_joy, 한글 별칭도 알아본다.
 */
export function matchLabel(fileName, labels) {
  const key = fileKey(fileName), map = knownMap(labels);
  if (map.has(key)) return { label: map.get(key), how: 'exact', guess: '' };
  // 기본 규칙: 첫 - 또는 . 앞까지가 감정 이름
  const st = (key.match(/^(.+?)(?:[-.].*)?$/)?.[1] ?? key).trim();
  if (map.has(st)) return { label: map.get(st), how: 'prefix', guess: '' };
  // 가장 긴 감정 이름으로 시작하고, 그 뒤가 구분자나 숫자인 경우 (half-smile-2, joy_1, joy2, joy (2))
  const starts = [...map.keys()].filter(k => key.startsWith(k) && /^[\s_\-.(\[\d]/.test(key.slice(k.length))).sort((a, b) => b.length - a.length)[0];
  if (starts) return { label: map.get(starts), how: 'prefix', guess: '' };
  // 조각으로 나눠 찾기: 맨 앞 → 맨 뒤 → 가운데 (seraphina_joy, char-angry-01)
  const toks = key.split(/[\s_\-.()\[\]{}+,]+/).map(t => t.replace(/\d+$/, '')).filter(Boolean);
  for (const t of [toks[0], toks[toks.length - 1], ...toks.slice(1, -1)]) if (t && map.has(t)) return { label: map.get(t), how: 'token', guess: '' };
  return { label: '', how: 'none', guess: cleanLabel(st.replace(/[\s_]*\(?\d+\)?$/, '')) };
}

const TAG_NAMES = ['emotion', 'expression', 'expr', '표정', '감정'];
const TAG_RE = /[ \t]*<\s*(?:emotion|expression|expr|표정|감정)\s*[:=：]\s*([^<>\n]{1,48}?)\s*\/?\s*>[ \t]*/gi;
const PAIR_RE = /[ \t]*<\s*(emotion|expression|expr|표정|감정)\s*>\s*([^<>\n]{1,48}?)\s*<\s*\/\s*\1\s*>[ \t]*/gi;
export const TAG_QUICK = /<\s*(?:emotion|expression|expr|표정|감정)\s*[:=：>]/i;
/** 답변에서 숨은 표정 태그를 떼어 낸다 → { text, label(적힌 그대로), found }.  여러 개면 마지막 것 */
export function extractTag(text) {
  const src = String(text ?? '');
  if (src.indexOf('<') < 0 || !TAG_QUICK.test(src)) return { text: src, label: '', found: false };
  let colon = '', pair = '';
  const out = src.replace(TAG_RE, (m, val) => { colon = val.trim(); return ''; }).replace(PAIR_RE, (m, name, val) => { pair = val.trim(); return ''; });
  if (out === src) return { text: src, label: '', found: false };
  return { text: out.replace(/[ \t\r\n]+$/, ''), label: colon || pair, found: true };   // 짝 태그(<emotion>joy</emotion>)는 콜론 태그가 없을 때만 읽는다
}
/** 생성 중: 아직 덜 적힌 태그 조각(<emo, <emotion:jo)을 화면에서 가린다 */
export function hidePartial(text) {
  const s = String(text ?? '');
  const pair = s.match(/[ \t]*<\s*(?:emotion|expression|expr|표정|감정)\s*>[^<>\n]{0,48}(?:<\/?[^<>\n]{0,20})?$/i);
  if (pair) return s.slice(0, pair.index).replace(/[ \t\r\n]+$/, '');
  const m = s.match(/[ \t]*<([^<>\n]{0,60})$/);
  if (!m) return s;
  const inner = m[1].trim().toLowerCase(), head = inner.match(/^[a-z가-힣]*/)[0], rest = inner.slice(head.length);
  const mine = rest ? TAG_NAMES.includes(head) && /^\s*[:=：]/.test(rest) : TAG_NAMES.some(n => n.startsWith(head));
  return mine ? s.slice(0, m.index).replace(/[ \t\r\n]+$/, '') : s;
}

/** 모델이 적은 말 → 감정 이름.  못 알아보면 '' */
export function canonLabel(raw, labels) {
  let s = String(raw ?? '').trim().toLowerCase();
  if (!s) return '';
  const j = s.match(/"(?:emotion|expression|label|표정|감정)"\s*:\s*"([^"]+)"/);
  if (j) s = j[1];
  s = s.replace(/^[`'"“”‘’\[(<{*\s]+|[`'"“”‘’\])>}*\s.!?。,:;]+$/g, '');
  if (!s) return '';
  const map = knownMap(labels);
  if (map.has(s)) return map.get(s);
  const norm = s.replace(/[\s-]+/g, '_');
  if (map.has(norm)) return map.get(norm);
  const squash = v => v.replace(/[\s_-]+/g, ''), flat = squash(s);   // half smile = half-smile = half_smile
  for (const [k, l] of map) if (squash(k) === flat) return l;
  // 문장 속에 든 이름: 가장 긴 것
  const hit = [...map.keys()].filter(k => k.length >= 2 && new RegExp('(^|[^a-z0-9가-힣])' + reEsc(k) + '([^a-z0-9가-힣]|$)').test(s)).sort((a, b) => b.length - a.length)[0];
  if (hit) return map.get(hit);
  // 어미가 붙은 한 낱말 (joyful, 기쁨이에요)
  if (!/\s/.test(s)) { const pre = [...map.keys()].filter(k => k.length >= (/[가-힣]/.test(k) ? 2 : 4) && s.startsWith(k)).sort((a, b) => b.length - a.length)[0]; if (pre) return map.get(pre); }
  return '';
}

// 키워드 사전: | 로 나눈 낱말. 앞의 ! 는 강한 단서(2배). 영문은 낱말 첫머리부터, 한글은 어디든 들어 있으면 맞는다
const LEX = {
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
const lexCache = new Map();
function lexRe(src) {
  if (lexCache.has(src)) return lexCache.get(src);
  const part = t => /^[a-z]/i.test(t) ? '\\b' + t : t;
  const strong = [], weak = [];
  for (const raw of String(src).split('|')) {
    const t = raw.trim(); if (!t) continue;
    const isStrong = t[0] === '!' && t.length > 1 && t[1] !== '\\';   // "!\?" 는 글자 그대로의 !? 이다
    (isStrong ? strong : weak).push(part(isStrong ? t.slice(1) : t));
  }
  const mk = list => { if (!list.length) return null; try { return new RegExp(list.join('|'), 'gi'); } catch { return null; } };
  const out = { strong: mk(strong), weak: mk(weak) };
  lexCache.set(src, out); return out;
}
/** 감정을 읽기 좋게 다듬은 글: 태그·코드·주소를 걷어 낸다 */
export const plainText = text => String(text ?? '').replace(/```[\s\S]*?```/g, ' ').replace(/\{\{[^{}]*\}\}/g, ' ').replace(/<[^<>]{0,200}>/g, ' ').replace(/https?:\/\/\S+/g, ' ').replace(/[ \t]+/g, ' ').trim();
/**
 * 키워드로 감정 추정 (호출 없음).  opts.labels: 고를 수 있는 감정(비우면 전부), opts.custom: [{ label, keys }]
 * → { label, scores }.  글 뒤쪽에 나온 단서를 조금 더 쳐 준다. 단서가 없으면 neutral
 */
export function keywordLabel(text, { labels = [], custom = [] } = {}) {
  const s = plainText(text).toLowerCase(), len = Math.max(1, s.length), raw = {};
  const scan = (label, src) => {
    const { strong, weak } = lexRe(src); let n = 0, sc = 0;
    for (const [re, w] of [[strong, 2], [weak, 1]]) { if (!re) continue; re.lastIndex = 0; for (const m of s.matchAll(re)) { if (++n > 8) break; sc += w * (1 + 0.6 * m.index / len); } }
    if (sc) raw[label] = (raw[label] || 0) + sc;
  };
  for (const [label, src] of Object.entries(LEX)) scan(label, src);
  for (const c of custom) if (c?.label && c.keys) scan(c.label, String(c.keys).split(/[,|\n]/).map(k => k.trim().toLowerCase()).filter(Boolean).map(k => '!' + reEsc(k)).join('|'));   // 직접 적은 키워드는 강한 단서
  const can = labels.length ? new Set(labels) : null, scores = {};
  for (const [label, sc] of Object.entries(raw)) {
    if (!can || can.has(label)) scores[label] = (scores[label] || 0) + sc;
    else { const near = (RELATED[label] || []).find(r => can.has(r)); if (near) scores[near] = (scores[near] || 0) + sc * 0.7; }
  }
  const best = Object.entries(scores).sort((a, b) => b[1] - a[1])[0];
  if (best && best[1] >= 1) return { label: best[0], scores };
  return { label: !can || can.has('neutral') ? 'neutral' : '', scores };
}

/** 문자열 → 고정된 수 (같은 메시지는 늘 같은 그림을 고르게) */
export function hashStr(s) { let x = 2166136261; for (let i = 0; i < String(s).length; i++) { x ^= String(s).charCodeAt(i); x = Math.imul(x, 16777619); } return x >>> 0; }

function zipName(bytes, utf8) {
  if (utf8) return new TextDecoder().decode(bytes);
  try { return new TextDecoder('utf-8', { fatal: true }).decode(bytes); } catch { }
  try { return new TextDecoder('euc-kr').decode(bytes); } catch { return new TextDecoder().decode(bytes); }   // 윈도우 탐색기로 묶은 한글 이름
}
async function inflateRaw(raw) {
  if (typeof DecompressionStream !== 'function') throw new Error('이 브라우저는 압축된 ZIP 을 풀 수 없어요');
  return new Uint8Array(await new Response(new Blob([raw]).stream().pipeThrough(new DecompressionStream('deflate-raw'))).arrayBuffer());
}
/**
 * ZIP 읽기 (외부 라이브러리 없이. 저장(0)과 deflate(8)만) → { entries: [{ name, size, read() → Uint8Array }], skipped: [이름] }
 * 폴더·숨김 파일·__MACOSX 는 건너뛰고, 암호가 걸렸거나 다른 압축 방식인 항목은 skipped 에 적는다.
 */
export function unzipEntries(buf) {
  const u = buf instanceof Uint8Array ? buf : new Uint8Array(buf), dv = new DataView(u.buffer, u.byteOffset, u.byteLength);
  let e = -1;
  for (let i = u.length - 22, stop = Math.max(0, u.length - 22 - 65535); i >= stop; i--) if (dv.getUint32(i, true) === 0x06054b50) { e = i; break; }
  if (e < 0) throw new Error('ZIP 파일이 아니에요');
  const count = dv.getUint16(e + 10, true); let p = dv.getUint32(e + 16, true);
  if (count === 0xffff || p === 0xffffffff) throw new Error('너무 큰 ZIP(ZIP64)은 풀 수 없어요. 나눠서 올려 주세요');
  const entries = [], skipped = [];
  for (let i = 0; i < count; i++) {
    if (p + 46 > u.length || dv.getUint32(p, true) !== 0x02014b50) break;
    const flag = dv.getUint16(p + 8, true), method = dv.getUint16(p + 10, true), csize = dv.getUint32(p + 20, true), size = dv.getUint32(p + 24, true);
    const n = dv.getUint16(p + 28, true), x = dv.getUint16(p + 30, true), c = dv.getUint16(p + 32, true), off = dv.getUint32(p + 42, true);
    const name = zipName(u.subarray(p + 46, p + 46 + n), flag & 0x800).replace(/\\/g, '/');
    p += 46 + n + x + c;
    if (!name || name.endsWith('/') || /(^|\/)__MACOSX\//.test(name) || name.split('/').pop().startsWith('.')) continue;
    if ((flag & 1) || (method !== 0 && method !== 8) || off + 30 > u.length || dv.getUint32(off, true) !== 0x04034b50) { skipped.push(name); continue; }
    const start = off + 30 + dv.getUint16(off + 26, true) + dv.getUint16(off + 28, true);
    if (start + csize > u.length) { skipped.push(name); continue; }
    const raw = u.subarray(start, start + csize);
    entries.push({ name, size, read: async () => method === 0 ? raw : inflateRaw(raw) });
  }
  return { entries, skipped };
}
// ═══════════════════════════════════════════════════════════════════════
// </pure>
// ═══════════════════════════════════════════════════════════════════════

// ════════ 설정 ════════
export const TAG_PROMPT = `[Expression tag]
After your reply is complete, add one hidden tag on its own final line that names {{char}}'s facial expression at the end of this reply: <emotion:label>
Choose exactly one label from this list and copy it as written: {{labels}}
Write the tag only once, after everything else. Never mention or explain it — it is removed before the reader sees the reply.`;
export const CALL_PROMPT = `You choose a portrait for a character in a roleplay chat. Read the latest reply and pick the one label that best matches {{char}}'s facial expression or mood at the end of that reply. Judge only {{char}}, not the other people in the scene. If nothing clearly fits, answer "neutral" when it is on the list, otherwise the closest label.
Labels: {{labels}}
Answer with the label only: one word, exactly as written in the list.`;
const MODES = [
  ['off', '직접 고르기', '자동으로 판정하지 않습니다. 메시지의 ⋯ 메뉴나 /emote 로 바꿉니다.', '호출 없음'],
  ['tag', '답변 속 숨은 태그', '답변을 쓰는 모델이 끝에 감정을 한 낱말로 적고, 화면에서는 떼어 냅니다.', '추가 호출 없음'],
  ['call', '답변 뒤에 따로 묻기', '답변이 올 때마다 보조 연결에 감정을 한 번 더 묻습니다. 가장 정확합니다.', '답변마다 추가 호출 1회'],
  ['key', '키워드로 추정', '답변에 든 낱말(웃었다, 눈물, 놀라 …)로 어림합니다. 틀릴 수 있어요.', '호출 없음'],
];
const DEF = { show: true, mode: 'off', tagPrompt: '', tagFallback: true, callPrompt: '', callContext: 1, callTokens: 300, onlyHave: true, dossier: true, avatars: true, avatarFit: 'contain', multi: true, fade: true,
  standing: false, side: 'right', size: 66, sizeOver: 40, overOpacity: 90, dim: true, fallback: 'neutral', maxPx: 1280 };
function cfg() {
  let c = S.settings.expressions;
  if (!c || typeof c !== 'object' || Array.isArray(c)) c = S.settings.expressions = {};
  for (const [k, v] of Object.entries(DEF)) if (c[k] === undefined) c[k] = v;
  if (!Array.isArray(c.custom)) c.custom = [];
  if (!c.chars || typeof c.chars !== 'object') c.chars = {};
  if (!c.ui || typeof c.ui !== 'object') c.ui = {};
  return c;
}
const save = () => S.set({ expressions: cfg() });
const charCfg = id => { const c = cfg(); return (c.chars[id] ||= { n: 0, fallback: '' }); };
const customOf = label => cfg().custom.find(x => x.label === label);
/** 화면에 적을 이름: 기쁨 */
const nameOf = label => KO[label] || customOf(label)?.name || label;
const fullName = label => nameOf(label) === label ? label : `${nameOf(label)} · ${label}`;

// ════════ 표정 그림 보관 (IndexedDB assets 스토어, kind: 'expr', owner: 'expr:캐릭터') ════════
const cache = new Map();   // 캐릭터 id → [{ id, owner, kind, label, name, data, ts }]
const ownerOf = id => 'expr:' + id;
const order = (a, b) => a.label.localeCompare(b.label) || (b.name === b.label) - (a.name === a.label) || a.name.localeCompare(b.name, undefined, { numeric: true });
const Sprites = {
  has: id => cache.has(id),
  list: id => cache.get(id) || [],
  of: (id, label) => (cache.get(id) || []).filter(a => a.label === label),
  labels: id => [...new Set((cache.get(id) || []).map(a => a.label))],
  async load(ids) {
    for (const id of [].concat(ids || [])) if (id && !cache.has(id)) { const list = (await DB.byOwner(ownerOf(id))).filter(a => a.kind === 'expr').sort(order); if (!cache.has(id)) cache.set(id, list); }
  },
  note(id) { const n = this.list(id).length, cc = charCfg(id); if (cc.n !== n) { cc.n = n; save(); } },
  async put(id, label, name, data) {
    await this.load(id);
    const old = this.list(id).find(a => a.label === label && a.name === name);
    const rec = { id: old?.id || uid(), owner: ownerOf(id), kind: 'expr', label, name, data, ts: now() };
    await DB.put('assets', rec);
    cache.set(id, [...this.list(id).filter(a => a.id !== rec.id), rec].sort(order));
    return rec;
  },
  async update(id, rec) { await DB.put('assets', rec); cache.set(id, this.list(id).map(a => a.id === rec.id ? rec : a).sort(order)); },
  async remove(id, rec) { await DB.del('assets', rec.id); cache.set(id, this.list(id).filter(a => a.id !== rec.id)); this.note(id); },
  async clear(id) { for (const a of await DB.byOwner(ownerOf(id))) await DB.del('assets', a.id); cache.set(id, []); this.note(id); },
};

/** 알고 있는 모든 감정: 기본 + 사용자 정의 + (그 캐릭터 그림에만 있는 이름) */
function universe(charId) {
  const out = [...DEFAULT_LABELS];
  for (const c of cfg().custom) if (c.label && !out.includes(c.label)) out.push(c.label);
  if (charId) for (const l of Sprites.labels(charId)) if (!out.includes(l)) out.push(l);
  return out;
}
/** 모델에게 고르게 할 감정 */
function candidates(charId) {
  const have = Sprites.labels(charId);
  if (!cfg().onlyHave) return universe(charId);
  return universe(charId).filter(l => have.includes(l));
}
const fallbackOf = charId => { const f = cfg().chars[charId]?.fallback; return f === '#none' ? '' : (f || (cfg().fallback === '#none' ? '' : cfg().fallback) || ''); };
/** 감정 → 보여 줄 그림: 그 감정 → 가까운 감정 → 기본 표정 */
function spritesFor(charId, label) {
  if (label) {
    const own = Sprites.of(charId, label); if (own.length) return own;
    for (const r of RELATED[label] || []) { const near = Sprites.of(charId, r); if (near.length) return near; }
  }
  const fb = fallbackOf(charId);
  return fb ? Sprites.of(charId, fb) : [];
}
function pickSprite(charId, label, seed, pickId) {
  const all = Sprites.list(charId); if (!all.length) return null;
  if (pickId) { const p = all.find(a => a.id === pickId); if (p) return p; }
  const list = spritesFor(charId, label); if (!list.length) return null;
  return cfg().multi && list.length > 1 ? list[hashStr(seed) % list.length] : list[0];
}

// ════════ 지금 표정 계산 ════════
const live = new Map();   // 메시지 id → 생성 중에 태그에서 읽은 감정
const charIdOf = (m, chat) => m.charId || chat?.charIds?.[0] || '';
const exprOf = m => live.get(m.id) || m.swipes?.[m.sw]?.expr || '';
/** 그 캐릭터의 지금 표정: 마지막 답변의 기록. 아직 없으면(생성 중 · 판정 전) 그 앞 답변의 표정을 잇는다 */
function currentOf(chat, msgs, charId) {
  let seen = 0;
  for (let i = msgs.length - 1; i >= 0 && seen < 2; i--) {
    const m = msgs[i]; if (m.role !== 'assistant' || charIdOf(m, chat) !== charId) continue;
    seen++; const label = exprOf(m);
    if (label) return { label, msg: m, sprite: pickSprite(charId, label, m.id + ':' + m.sw, live.has(m.id) ? '' : m.swipes[m.sw]?.exprPick) };
  }
  return { label: '', msg: null, sprite: pickSprite(charId, '', charId) };
}
const lastReply = (msgs, chat, charId) => { for (let i = msgs.length - 1; i >= 0; i--) if (msgs[i].role === 'assistant' && (!charId || charIdOf(msgs[i], chat) === charId)) return msgs[i]; return null; };

// ════════ 기록 ════════
async function persist(chat, msg) {
  const cur = chatApi.current();
  if (cur.chat?.id === chat.id && cur.msgs.includes(msg)) return chatApi.save();
  const list = await S.msgs(chat.id), m = list.find(x => x.id === msg.id); if (!m) return;
  m.swipes = msg.swipes; m.sw = msg.sw;
  await S.saveMsgs(chat, list);
}
async function setExpr(chat, msg, label, pickId = '') {
  const sw = msg.swipes?.[msg.sw]; if (!sw) return;
  if (label) sw.expr = label; else delete sw.expr;
  if (label && pickId) sw.exprPick = pickId; else delete sw.exprPick;
  live.delete(msg.id);
  await persist(chat, msg); sync();
}

// ════════ 감정 판정 ════════
const clip = (s, n) => s.length > n ? s.slice(0, Math.floor(n * 0.35)).trimEnd() + ' … ' + s.slice(-Math.ceil(n * 0.65)).trimStart() : s;
const byKeyword = (text, charId) => keywordLabel(text, { labels: cfg().onlyHave ? candidates(charId) : [], custom: cfg().custom }).label;
/** 따로 묻기: 보조 연결로 한 번 호출 */
async function classify(chat, msgs, msg, { signal } = {}) {
  const c = cfg(), charId = charIdOf(msg, chat), char = S.get('chars', charId);
  const labels = candidates(charId); if (!labels.length) return '';
  const conn = S.helperConn('expr', chat); if (!conn) throw new Error('연결된 API 가 없어요');
  const chars = chat.charIds.map(id => S.get('chars', id)).filter(Boolean), ctx = makeCtx({ chat, char: char || chars[0], chars, persona: S.persona(chat), msgs });
  if (msg.name && !char) ctx.char = msg.name;
  const sys = macro(String(c.callPrompt || '').trim() || CALL_PROMPT, { ...ctx, vars: {} }).replace(/\{\{labels\}\}/gi, labels.join(', '));
  const idx = msgs.indexOf(msg), n = Math.max(0, Math.min(6, Math.round(+c.callContext) || 0));
  const prev = idx > 0 && n ? msgs.slice(Math.max(0, idx - n), idx).filter(m => !m.hidden && m.role !== 'system').map(m => `${m.role === 'user' ? ctx.user : (m.name || ctx.char)}: ${clip(plainText(msgText(m)), 500)}`) : [];
  const user = (prev.length ? `[Earlier]\n${prev.join('\n\n')}\n\n` : '') + `[Latest reply by ${ctx.char}]\n${clip(plainText(extractTag(msgText(msg)).text), 1800)}`;
  const out = await quickCall(sys, user, { maxTokens: Math.max(16, Math.round(+c.callTokens) || 300), conn, signal });
  const hit = canonLabel(out, labels) || canonLabel(out, universe(charId));
  if (!hit) console.warn('[표정] 답에서 감정을 찾지 못했어요:', out);
  return hit;
}
const typingIn = id => document.querySelector(`article.msg[data-id="${id}"] .msg-body .typing`);
/** 대화 모드에서 답변을 한 줄씩 보여 주는 동안에는 저장된 글을 건드리지 않고, 끝난 뒤에 태그를 뗀다 */
async function stripLater(chat, msg, sw) {
  for (let i = 0; i < 240 && typingIn(msg.id); i++) await new Promise(r => setTimeout(r, 250));
  const ex = extractTag(sw.text); if (!ex.found) return;
  sw.text = ex.text; await persist(chat, msg);
}

on('generate:start', () => live.clear());
on('generate:end', () => { live.clear(); schedule(); });
on('message:received', async ({ msg, chat }) => {
  try {
    const c = cfg(), sw = msg?.swipes?.[msg.sw]; if (!sw || msg.role !== 'assistant') return;
    const charId = charIdOf(msg, chat), seen = live.get(msg.id) || '';
    // 여기까지는 기다림 없이: 뒤이어 도는 기억 기록 · 번역이 태그 없는 글을 보도록 저장된 글에서 바로 뗀다
    const ex = extractTag(sw.text), later = ex.found && !!typingIn(msg.id);
    let label = ex.found ? canonLabel(ex.label, universe(charId)) : '';
    if (ex.found && !later) sw.text = ex.text;
    if (label) { sw.expr = label; delete sw.exprPick; }
    await Sprites.load(charId);
    const has = Sprites.list(charId).length > 0;
    if (!label && ex.found) label = canonLabel(ex.label, universe(charId));   // 그 캐릭터 그림에만 있는 이름
    if (!label && c.mode === 'tag' && has) label = seen || (c.tagFallback ? byKeyword(ex.text, charId) : '');
    if (!label && c.mode === 'key' && has) label = byKeyword(ex.text, charId);
    if (label) { sw.expr = label; delete sw.exprPick; }
    live.delete(msg.id);
    if (later) stripLater(chat, msg, sw).catch(e => console.warn('[표정]', e));
    if (label || (ex.found && !later)) await persist(chat, msg);
    sync();
    if (c.mode === 'call' && c.show && has && candidates(charId).length > 1) {
      const text = sw.text, here = () => chatApi.current().chat?.id === chat.id;
      const msgs = here() ? chatApi.current().msgs : await S.msgs(chat.id);
      if (here()) chatApi.setStatus('표정 고르는 중…');
      try {
        const got = await classify(chat, msgs, msg);
        if (got && msg.swipes[msg.sw] === sw && extractTag(sw.text).text === extractTag(text).text) { sw.expr = got; delete sw.exprPick; await persist(chat, msg); sync(); }
      } catch (e) { console.warn('[표정]', e); toast('표정 판정 실패: ' + (e.message || e), 'err'); }
      finally { if (here()) chatApi.setStatus(''); }
    }
  } catch (e) { console.warn('[표정]', e); }
});
on('chat:open', async chat => {
  try {
    await Sprites.load(chat.charIds);
    const cur = chatApi.current();
    if (cur.chat?.id === chat.id) {   // 지난번에 떼지 못한 태그가 남아 있으면 정리
      let dirty = false;
      for (const m of cur.msgs) if (m.role === 'assistant') for (const sw of m.swipes || []) if (sw.text && TAG_QUICK.test(sw.text)) {
        const ex = extractTag(sw.text); if (!ex.found) continue;
        sw.text = ex.text; const l = canonLabel(ex.label, universe(charIdOf(m, chat))); if (l && !sw.expr) sw.expr = l; dirty = true;
      }
      if (dirty) await chatApi.save();
    }
  } catch (e) { console.warn('[표정]', e); }
  sync();
});
// 캐릭터를 지우면 그 표정 그림도 지운다
on('chars', async () => {
  const c = cfg(); let changed = false;
  for (const id of Object.keys(c.chars)) if (!S.get('chars', id)) { try { for (const a of await DB.byOwner(ownerOf(id))) await DB.del('assets', a.id); } catch (e) { console.warn('[표정]', e); } cache.delete(id); delete c.chars[id]; changed = true; }
  if (changed) save();
});

// ── 프롬프트: 숨은 태그 지시 (추가 호출 없음) ──
function tagInstruction(char, ctx) {
  const labels = candidates(char.id); if (labels.length < 2) return '';
  return macro(String(cfg().tagPrompt || '').trim() || TAG_PROMPT, { ...(ctx || { char: char.name }), char: char.name }).replace(/\{\{labels\}\}/gi, labels.join(', '));
}
X.prompt = X.prompt.filter(p => p.owner !== 'expr');
X.prompt.push({ owner: 'expr', fn: ({ char, type, ctx }) => {
  const c = cfg(); if (!c.show || c.mode !== 'tag' || type === 'impersonate' || !char?.id) return [];
  if (!Sprites.has(char.id)) { Sprites.load(char.id).catch(() => { }); return []; }
  const content = tagInstruction(char, ctx);
  return content ? [{ where: 'end', content, src: '표정 태그 지시' }] : [];
} });
// ── 화면: 태그는 언제나 가린다. 생성 중이면 읽은 감정을 바로 초상에 반영 ──
X.filters = X.filters.filter(f => f.owner !== 'expr');
X.filters.push({ owner: 'expr', fn: (text, info) => {
  if (!text || text.indexOf('<') < 0) return text;
  const busy = chatApi.current().busy, ex = extractTag(text);
  if (ex.found && busy && info?.msg && info.role === 'assistant' && ex.label) {
    const l = canonLabel(ex.label, universe(charIdOf(info.msg, info.chat)));
    if (l && live.get(info.msg.id) !== l) { live.set(info.msg.id, l); schedule(); }
  }
  return busy ? hidePartial(ex.text) : ex.text;
} });
X.macros.set('expression', { owner: 'expr', fn: () => { const { chat, msgs } = chatApi.current(); return chat ? currentOf(chat, msgs, chat.charIds[0]).label : ''; } });

// ════════ 대화 화면에 반영 ════════
const shown = new Map();   // 자리 → 마지막으로 보여 준 그림 id (화면이 다시 그려져도 부드럽게 잇기 위해)
const findSprite = id => { for (const list of cache.values()) { const a = list.find(x => x.id === id); if (a) return a; } return null; };
/** host 안에 표정 그림 한 장을 깐다. 바뀌면 겹쳐서 서서히 */
function setImg(host, sprite, slot, { fade = true, cross = false } = {}) {
  const imgs = [...host.querySelectorAll(':scope > img.exs-img')], cur = imgs.find(x => !x.classList.contains('out'));
  if (!sprite) { imgs.forEach(x => x.remove()); host.classList.remove('exs-has'); if (slot) shown.delete(slot); return; }
  if (cur?.dataset.sid === sprite.id) return;
  const mk = sp => { const img = h('img.exs-img', { src: sp.data, alt: '', dataset: { sid: sp.id } }); img.draggable = false; return img; };
  host.classList.add('exs-has');
  let old = cur;
  if (!old && fade && slot && shown.has(slot) && shown.get(slot) !== sprite.id) { const prev = findSprite(shown.get(slot)); if (prev) { old = mk(prev); host.append(old); } }
  if (slot) shown.set(slot, sprite.id);
  const img = mk(sprite);
  if (!old || !fade || S.settings.motion === false) { host.querySelectorAll(':scope > img.exs-img').forEach(x => x.remove()); host.append(img); return; }
  imgs.filter(x => x !== old).forEach(x => x.remove());
  img.classList.add('in'); host.append(img);
  if (cross) old.classList.add('out'); else old.classList.add('under');
  requestAnimationFrame(() => requestAnimationFrame(() => img.classList.remove('in')));
  setTimeout(() => old.remove(), 460);
}

function applyAvatars(layout, chat, msgs) {
  const c = cfg(), box = layout.querySelector('.msgs'); if (!box) return;
  const byId = new Map(msgs.map(m => [m.id, m]));
  for (const el of box.querySelectorAll(':scope > article.msg.ai')) {
    const av = el.querySelector(':scope > .avatar'); if (!av) continue;
    const m = byId.get(el.dataset.id), label = m && c.show && c.avatars ? exprOf(m) : '';
    const sp = label ? pickSprite(charIdOf(m, chat), label, m.id + ':' + m.sw, live.has(m.id) ? '' : m.swipes[m.sw]?.exprPick) : null;
    setImg(av, sp, '', { fade: false });
    if (sp) av.title = nameOf(label); else if (av.title) av.removeAttribute('title');
  }
}

function applyDossier(layout, chat, chars, state) {
  const c = cfg(), card = layout.querySelector(':scope > aside.dossier > .dream-card'); if (!card) return;
  const group = chars.length > 1;
  const hosts = group ? [...card.querySelectorAll('.cast-grid > .cast > .arch')] : [card.querySelector('.sheet-window .arch')];
  chars.forEach((ch, i) => { if (hosts[i]) setImg(hosts[i], c.show && c.dossier ? state.get(ch.id)?.sprite : null, 'dos:' + ch.id, { fade: c.fade }); });
  // 초상 아래 꼬리표: 지금 표정 · 스탠딩
  const any = c.show && chars.some(ch => Sprites.list(ch.id).length);
  let cap = card.querySelector(':scope > .exs-cap');
  if (!any) { cap?.remove(); return; }
  const st = group ? null : state.get(chars[0].id), sig = [group ? 'g' : st.label, c.standing, c.mode].join('|');
  if (cap?.dataset.sig === sig) return;
  const next = h('div.exs-cap', { dataset: { sig } },
    group ? h('span.exs-cap-label', '표정') : h('button.exs-cap-btn', { type: 'button', title: '이 답변의 표정 바꾸기', onclick: () => { const { chat: ch, msgs } = chatApi.current(); const m = ch && lastReply(msgs, ch, ch.charIds[0]); if (m) openPicker(m, ch); else toast('아직 답변이 없어요'); } }, h('i', '✦'), h('span', st.label ? nameOf(st.label) : '기본 표정'), icon('down', 12)),
    h(`button.exs-cap-btn.exs-cap-stand${c.standing ? '.on' : ''}`, { type: 'button', title: '화면 한쪽에 큰 초상을 세웁니다', onclick: () => toggleStanding() }, c.standing ? '스탠딩 끄기' : '스탠딩 보기'));
  if (cap) cap.replaceWith(next); else (card.querySelector(':scope > .sheet-window, :scope > .cast-grid') || card.firstChild)?.after(next);
}

let stageRo = null;
function measureStage(stage, layout) {
  const c = cfg(), main = layout.querySelector(':scope > .chat-main'); if (!main || !stage.isConnected) return;
  const L = layout.getBoundingClientRect(), M = main.getBoundingClientRect(), H = L.height * c.size / 100;
  let need = 28, ready = false;
  for (const img of stage.querySelectorAll('.exs-fig > img.exs-img:not(.out)')) { if (!img.naturalWidth) continue; ready = true; need += H * img.naturalWidth / img.naturalHeight; }
  if (!ready) return;
  const free = c.side === 'left' ? M.left - L.left : L.right - M.right, over = need > free;
  stage.classList.toggle('over', over); stage.classList.add('ready');
  stage.style.setProperty('--exs-b', (over ? layout.querySelector('.composer')?.offsetHeight || 0 : 0) + 'px');
}
function applyStanding(layout, chat, chars, state, speakerId) {
  const c = cfg(); let stage = layout.querySelector(':scope > .exs-stage');
  const muted = new Set(chat.muted || []);
  const figs = c.show && c.standing ? chars.filter(ch => chars.length === 1 || !muted.has(ch.id)).map(ch => ({ ch, sp: state.get(ch.id)?.sprite || (ch.avatar ? { id: 'av:' + ch.id, data: ch.avatar } : null) })).filter(f => f.sp) : [];
  if (!figs.length) { stage?.remove(); return; }
  if (!stage) {
    stage = h('div.exs-stage', h('div.exs-row'), h('button.exs-x', { type: 'button', title: '스탠딩 끄기', 'aria-label': '스탠딩 끄기', onclick: () => toggleStanding(false) }, icon('x', 14)));
    layout.append(stage);
    stageRo?.disconnect(); stageRo = new ResizeObserver(() => measureStage(stage, layout)); stageRo.observe(layout);
    const comp = layout.querySelector('.composer'); if (comp) stageRo.observe(comp);
  }
  stage.classList.toggle('left', c.side === 'left'); stage.classList.toggle('right', c.side !== 'left'); stage.classList.toggle('dimming', !!c.dim && figs.length > 1);
  stage.style.setProperty('--exs-h', c.size + '%'); stage.style.setProperty('--exs-ho', Math.min(c.size, c.sizeOver) + '%'); stage.style.setProperty('--exs-op', String(Math.max(0.2, Math.min(1, c.overOpacity / 100))));
  const row = stage.firstChild, want = new Set(figs.map(f => f.ch.id));
  for (const el of [...row.children]) if (!want.has(el.dataset.char)) el.remove();
  figs.forEach(({ ch, sp }, i) => {
    let fig = [...row.children].find(el => el.dataset.char === ch.id);
    if (!fig) { fig = h('div.exs-fig', { dataset: { char: ch.id } }); row.append(fig); }
    if (row.children[i] !== fig) row.insertBefore(fig, row.children[i]);
    fig.classList.toggle('on', figs.length === 1 || ch.id === speakerId);
    const before = fig.querySelector(':scope > img.exs-img:not(.out)')?.dataset.sid;
    setImg(fig, sp, '', { fade: c.fade, cross: true });
    if (before !== sp.id) { const img = fig.querySelector(':scope > img.exs-img:not(.out)'); if (img && !img.complete) img.addEventListener('load', () => measureStage(stage, layout), { once: true }); }
  });
  measureStage(stage, layout);
}
function toggleStanding(v) { const c = cfg(); c.standing = v === undefined ? !c.standing : !!v; save(); sync(); }

let raf = 0, syncing = false;
function schedule() { if (!raf) raf = requestAnimationFrame(() => { raf = 0; sync(); }); }
/** 대화 화면의 초상 · 아바타 · 스탠딩을 지금 표정에 맞춘다 */
function sync() {
  if (syncing) return; syncing = true;
  try {
    const layout = document.querySelector('#page > .chat-layout'); if (!layout) return;
    document.documentElement.dataset.exsAv = cfg().avatarFit === 'cover' ? 'cover' : 'contain';
    const { chat, msgs } = chatApi.current(); if (!chat || !layout.querySelector('.msgs')) return;
    if (chat.charIds.some(id => !Sprites.has(id))) { Sprites.load(chat.charIds).then(schedule).catch(e => console.warn('[표정]', e)); return; }
    const chars = chat.charIds.map(id => S.get('chars', id)).filter(Boolean);
    const state = new Map(chars.map(ch => [ch.id, currentOf(chat, msgs, ch.id)]));
    const last = lastReply(msgs, chat);
    applyAvatars(layout, chat, msgs);
    applyDossier(layout, chat, chars, state);
    applyStanding(layout, chat, chars, state, last ? charIdOf(last, chat) : chars[0]?.id);
  } catch (e) { console.warn('[표정]', e); } finally { syncing = false; }
}
// 대화 화면이 다시 그려지면(메시지 · 초상 영역 · 본문 틀) 표정을 다시 얹는다. 글자가 흘러나오는 동안의 본문 변화는 건너뛴다
const watcher = new MutationObserver(recs => {
  for (const r of recs) { const t = r.target, cl = t.classList; if (t.id === 'page' || (cl && (cl.contains('msgs') || cl.contains('dossier') || cl.contains('chat-main')))) return sync(); }
});
{ const page = document.getElementById('page'); if (page) watcher.observe(page, { childList: true, subtree: true }); }
on('settings', p => { if (p && 'expressions' in p) schedule(); });
// 초상 영역의 표정 그림을 누르면 그 그림을 크게 (카드 초상 대신)
document.addEventListener('click', e => {
  const img = e.target?.closest?.('.dossier .sheet-window .exs-img'); if (!img) return;
  e.stopPropagation(); e.preventDefault();
  modal({ title: '', wide: true, body: h('img.full-img', { src: img.src, alt: '' }) });
}, true);

// ════════ 표정 고르기 창 ════════
async function openPicker(msg, chat) {
  if (msg?.role !== 'assistant') return toast('캐릭터의 답변에서만 표정을 바꿀 수 있어요');
  const charId = charIdOf(msg, chat), char = S.get('chars', charId);
  await Sprites.load(charId);
  const sw = msg.swipes[msg.sw], body = h('div.exs-picker'); let box;
  const choose = async (label, pickId) => { await setExpr(chat, msg, label, pickId); box.close(); toast(label ? `표정: ${nameOf(label)}` : '표정 기록을 지웠어요'); };
  const draw = () => {
    const cur = sw.expr || '', list = Sprites.list(charId), have = Sprites.labels(charId), rest = universe(charId).filter(l => !have.includes(l));
    const showing = cur ? pickSprite(charId, cur, msg.id + ':' + msg.sw, sw.exprPick)?.id : '';   // 지금 이 답변에 보이는 바로 그 그림
    body.replaceChildren(
      h('p.exs-picker-now', h('span', '지금'), h('b', cur ? fullName(cur) : '기록 없음 (기본 표정)')),
      list.length ? h('div.exs-pick-grid', list.map(a => h(`button.exs-pick${showing === a.id ? '.on' : ''}`, { type: 'button', title: fullName(a.label), onclick: () => choose(a.label, Sprites.of(charId, a.label).length > 1 ? a.id : '') },
        h('span.exs-thumb', h('img', { src: a.data, alt: '', loading: 'lazy' })), h('span.exs-pick-cap', h('b', nameOf(a.label)), nameOf(a.label) !== a.label ? h('small', a.label) : null))))
        : h('p.dim', `${char?.name || '이 캐릭터'}에게는 아직 표정 그림이 없어요. 기능 › 표정에서 올려 주세요.`),
      rest.length ? h('details.exs-more', h('summary', `그림이 없는 감정 ${rest.length}가지`), h('p.hint', '고르면 기록은 남고, 가까운 감정이나 기본 표정의 그림이 보입니다.'), h('div.exs-chips', rest.map(l => h(`button.chip${cur === l ? '.on' : ''}`, { type: 'button', title: l, onclick: () => choose(l) }, nameOf(l))))) : null,
      h('div.exs-picker-tools',
        btn('키워드로 추정', { ic: 'search', title: '호출 없이 답변의 낱말로 어림합니다', onclick: () => { const l = byKeyword(sw.text, charId); if (l) choose(l); else toast('짚이는 감정이 없어요'); } }),
        btn('모델에게 묻기', { ic: 'sparkle', title: '보조 연결을 한 번 호출합니다', onclick: async e => {
          const b = e.currentTarget; b.disabled = true;
          try { const cur2 = chatApi.current(), msgs = cur2.chat?.id === chat.id ? cur2.msgs : await S.msgs(chat.id); const l = await classify(chat, msgs, msg); if (l) choose(l); else toast('모델의 답에서 감정을 찾지 못했어요', 'err'); }
          catch (err) { toast('표정 판정 실패: ' + (err.message || err), 'err'); } finally { b.disabled = false; }
        } }),
        cur ? btn('기록 지우기', { ic: 'trash', cls: 'ghost', onclick: () => choose('') }) : null),
      h('small.hint', '"모델에게 묻기"는 추가 호출 1회가 듭니다.'));
  };
  box = modal({ title: `${char?.name || msg.name || '캐릭터'}의 표정`, wide: true, body });
  draw();
}

// ── 메시지 ⋯ 메뉴 · 입력창 + 메뉴 · 명령어 ──
X.actions = X.actions.filter(a => a.owner !== 'expr');
X.actions.push({ owner: 'expr', id: 'expr-pick', label: '표정 바꾸기', icon: 'user', run: (msg, chat) => openPicker(msg, chat) });
X.composer = X.composer.filter(a => a.owner !== 'expr');
X.composer.push({ owner: 'expr', id: 'expr-standing', icon: 'user', get label() { return cfg().standing ? '스탠딩 끄기' : '스탠딩 보기'; }, run: () => toggleStanding() });
const emote = async arg => {
  const { chat, msgs } = chatApi.current(); if (!chat) return toast('열린 대화가 없어요', 'err');
  let text = String(arg || '').trim(), charId = '';
  // 그룹: "/emote 이름: 감정" 또는 "/emote 이름 감정"
  for (const ch of chat.charIds.map(id => S.get('chars', id)).filter(Boolean)) if (text.toLowerCase().startsWith(ch.name.toLowerCase()) && /^[\s:：]/.test(text.slice(ch.name.length))) { charId = ch.id; text = text.slice(ch.name.length).replace(/^[\s:：]+/, ''); break; }
  const m = lastReply(msgs, chat, charId); if (!m) return toast('표정을 바꿀 답변이 없어요', 'err');
  if (!text) return openPicker(m, chat);
  const cid = charIdOf(m, chat); await Sprites.load(cid);
  if (/^(reset|clear|none|지우기|초기화|없음)$/i.test(text)) { await setExpr(chat, m, ''); return toast('표정 기록을 지웠어요'); }
  const label = canonLabel(text, universe(cid));
  if (!label) return toast(`"${text}" 감정을 찾지 못했어요. 쓸 수 있는 이름: ${(Sprites.labels(cid).length ? Sprites.labels(cid) : DEFAULT_LABELS).map(nameOf).join(', ')}`.slice(0, 220), 'err');
  await setExpr(chat, m, label);
  toast(`표정: ${nameOf(label)}${Sprites.of(cid, label).length ? '' : ' (그림이 없어 가까운 표정으로 보여요)'}`);
};
X.commands.set('/emote', { owner: 'expr', help: '마지막 답변의 표정을 바꿉니다 · 예: /emote 기쁨, /emote anger (비우면 고르는 창)', run: emote });
X.commands.set('/표정', { owner: 'expr', help: '/emote 와 같습니다', run: emote });
X.commands.set('/standing', { owner: 'expr', help: '스탠딩 보기를 켜거나 끕니다', run: async () => { toggleStanding(); toast(cfg().standing ? '스탠딩 보기를 켰어요' : '스탠딩 보기를 껐어요'); } });

// ── 장면 패널: 지금 표정 (초상 영역이 없는 좁은 화면에서도 보고 바꿀 수 있게) ──
function openStudioTab() { go('studio'); const t = [...document.querySelectorAll('#page .tabs .tab')].find(b => b.textContent === '표정'); if (t && !t.classList.contains('on')) t.click(); }
X.panels = X.panels.filter(p => p.owner !== 'expr');
X.panels.push({ owner: 'expr', id: 'expr', title: '표정', icon: 'user', render: (chat, msgs) => {
  const c = cfg(), chars = chat.charIds.map(id => S.get('chars', id)).filter(Boolean), box = h('div.exs-panel');
  const draw = () => {
    const withSet = chars.filter(ch => Sprites.list(ch.id).length);
    if (!withSet.length) return box.replaceChildren(h('p.dim', '표정 그림을 올리면 감정에 따라 초상이 바뀝니다.'), btn('표정 그림 올리기', { ic: 'upload', cls: 'ghost', onclick: openStudioTab }));
    box.replaceChildren(
      ...withSet.map(ch => {
        const st = currentOf(chat, msgs, ch.id), m = lastReply(msgs, chat, ch.id), have = Sprites.labels(ch.id);
        const opts = [['', '기본 표정'], ...universe(ch.id).filter(l => have.includes(l) || l === st.label).map(l => [l, fullName(l)])];
        return h('div.exs-panel-row',
          h('button.exs-panel-pic', { type: 'button', title: '표정 고르기', onclick: () => m ? openPicker(m, chat) : toast('아직 답변이 없어요') }, st.sprite ? h('img', { src: st.sprite.data, alt: '' }) : h('span', ch.name.slice(0, 1))),
          h('div.exs-panel-text', h('b', ch.name),
            h('select.inp', { title: '마지막 답변의 표정', disabled: !m, onchange: async e => { if (m) { await setExpr(chat, m, e.target.value); draw(); } } }, opts.map(([v, l]) => h('option', { value: v, selected: v === (m ? (m.swipes[m.sw]?.expr || '') : '') }, l)))));
      }),
      h('label.check', h('input', { type: 'checkbox', checked: !!c.standing, onchange: e => toggleStanding(e.target.checked) }), h('i'), h('span', '스탠딩 보기')),
      h('small.hint', `감정 판정: ${MODES.find(x => x[0] === c.mode)?.[1] || '직접 고르기'} (${MODES.find(x => x[0] === c.mode)?.[3] || '호출 없음'})`),
      btn('표정 설정', { ic: 'sliders', cls: 'ghost', onclick: openStudioTab }));
  };
  if (chars.every(ch => Sprites.has(ch.id))) draw(); else { box.append(h('p.dim', '불러오는 중…')); Sprites.load(chars.map(ch => ch.id)).then(draw).catch(() => { }); }
  return box;
} });

// ════════ 올리기 ════════
const isImg = (name, type) => (type || '').startsWith('image/') || IMG_EXT.test(name || '');
/** 고른 파일(이미지 · ZIP · 폴더)을 한 줄로 펼친다 → [{ fileName, mime, load() → dataURL }] */
async function gather(files) {
  const out = [], notes = [];
  for (const f of files) {
    if (/\.zip$/i.test(f.name) || f.type === 'application/zip' || f.type === 'application/x-zip-compressed') {
      const { entries, skipped } = unzipEntries(await f.arrayBuffer());
      if (skipped.length) notes.push(`${f.name}: 풀 수 없는 항목 ${skipped.length}개는 건너뛰었어요`);
      for (const z of entries) if (IMG_EXT.test(z.name)) out.push({ fileName: z.name.split('/').pop(), mime: mimeOf(z.name), load: async () => bytesToDataURL(await z.read(), mimeOf(z.name)) });
    } else if (isImg(f.name, f.type)) out.push({ fileName: f.name, mime: f.type || mimeOf(f.name), load: () => readDataURL(f) });
  }
  return { items: out, notes };
}
const storeData = async (raw, mime) => /gif/i.test(mime) ? raw : (await shrinkImage(raw, Math.max(256, +cfg().maxPx || 1280))) || '';
/** 표정 그림 넣기. opts.label 을 주면 전부 그 감정으로, 아니면 파일 이름으로 맞추고 애매하면 확인 창을 띄운다 */
async function importFiles(charId, files, { label = '', onProgress = () => { } } = {}) {
  let got;
  try { got = await gather(files); } catch (e) { toast('파일을 읽지 못했어요: ' + (e.message || e), 'err'); return 0; }
  for (const n of got.notes) toast(n);
  const items = got.items;
  if (!items.length) { toast('넣을 이미지가 없어요 (PNG · WebP · GIF · JPEG · AVIF · ZIP)'); return 0; }
  await Sprites.load(charId);
  const labels = universe(charId);
  for (const it of items) {
    const m = label ? { label, how: 'exact', guess: '' } : matchLabel(it.fileName, labels);
    if (!m.label && labels.includes(m.guess)) { m.label = m.guess; m.how = 'token'; }
    Object.assign(it, { label: m.label, how: m.how, guess: m.guess, pick: m.label || (m.guess ? '+' + m.guess : '') });
  }
  if (!label && items.some(it => it.how === 'token' || it.how === 'none')) { if (!(await reviewImport(charId, items, labels))) return 0; }
  const c = cfg(); let n = 0, fail = 0, added = 0;
  const todo = items.filter(it => it.pick);
  for (const it of todo) {
    let lab = it.pick;
    if (lab[0] === '+') { lab = cleanLabel(lab.slice(1)); if (lab && !universe(charId).includes(lab)) { c.custom.push({ label: lab, name: '', keys: '' }); added++; } }
    try {
      if (!lab) throw new Error('이름 없음');
      const data = await storeData(it.data || await it.load(), it.mime); if (!data) throw new Error('그림을 읽지 못함');
      await Sprites.put(charId, lab, fileKey(it.fileName) || lab, data); n++;
    } catch (e) { console.warn('[표정 올리기]', it.fileName, e); fail++; }
    onProgress(n + fail, todo.length);
  }
  Sprites.note(charId); if (added) save();
  toast(n ? `표정 그림 ${n}장을 넣었어요${added ? ` · 새 감정 ${added}가지` : ''}${fail ? ` · ${fail}장 실패` : ''}` : '넣은 그림이 없어요', n ? 'ok' : (fail ? 'err' : ''));
  if (n) sync();
  return n;
}
/** 파일 이름으로 감정을 확신할 수 없을 때: 한 장씩 감정을 확인한다 */
async function reviewImport(charId, items, labels) {
  for (const it of items) { try { it.data = await it.load(); } catch { it.data = ''; } }
  const HOW = { exact: '', prefix: '', token: '이름 일부로 추정', none: '새 감정' };
  return new Promise(res => {
    let done = false; const sum = h('p.hint');
    const count = () => { const on = items.filter(it => it.pick), fresh = new Set(on.filter(it => it.pick[0] === '+').map(it => it.pick)); sum.textContent = `${items.length}장 중 ${on.length}장을 넣습니다${fresh.size ? ` · 새 감정 ${fresh.size}가지가 만들어져요` : ''}. 감정이 맞는지 확인해 주세요.`; };
    const row = it => {
      const opts = [['', '넣지 않기'], ...(it.guess && !labels.includes(it.guess) ? [['+' + it.guess, `새 감정으로: ${it.guess}`]] : []), ...labels.map(l => [l, fullName(l)])];
      return h(`div.exs-rev-row${it.how === 'none' || it.how === 'token' ? '.ask' : ''}`,
        h('span.exs-thumb', it.data ? h('img', { src: it.data, alt: '', loading: 'lazy' }) : h('i', '?')),
        h('div.exs-rev-text', h('b', { title: it.fileName }, it.fileName), HOW[it.how] ? h('small', HOW[it.how]) : null),
        h('select.inp', { onchange: e => { it.pick = e.target.value; count(); } }, opts.map(([v, l]) => h('option', { value: v, selected: v === it.pick }, l))));
    };
    const sorted = [...items].sort((a, b) => (b.how === 'none') - (a.how === 'none') || (b.how === 'token') - (a.how === 'token') || a.fileName.localeCompare(b.fileName, undefined, { numeric: true }));
    modal({ title: '표정 그림 확인', wide: true, onClose: () => { if (!done) res(false); }, body: h('div.exs-rev', sum, h('div.exs-rev-list', sorted.map(row))),
      actions: [{ label: '취소' }, { label: '넣기', cls: 'primary', ic: 'check', onclick: () => { done = true; res(true); } }] });
    count();
  });
}
const safeFile = s => String(s || 'sprites').replace(/[\\/:*?"<>|]+/g, '_').trim() || 'sprites';
const extOf = dataUrl => ({ 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'image/gif': 'gif', 'image/avif': 'avif' }[String(dataUrl).slice(5, String(dataUrl).indexOf(';'))] || 'png');
/** 스프라이트 폴더에 그대로 넣을 수 있는 이름(joy.png, joy-1.png)으로 ZIP 내보내기 */
function exportZip(char) {
  const list = Sprites.list(char.id); if (!list.length) return toast('내보낼 표정 그림이 없어요');
  const seen = new Set(), files = [], n = {};
  for (const a of list) {
    let base = a.name === a.label || a.name.startsWith(a.label + '-') || a.name.startsWith(a.label + '.') ? safeFile(a.name) : '';
    while (!base || seen.has(base)) { const i = n[a.label] = (n[a.label] ?? -1) + 1; base = i ? `${a.label}-${i}` : a.label; }
    seen.add(base); files.push({ name: `${base}.${extOf(a.data)}`, data: dataURLToBytes(a.data) });
  }
  download(`${safeFile(char.name)}_sprites.zip`, zip(files), 'application/zip');
  toast(`표정 그림 ${files.length}장을 ZIP 으로 내보냈어요`, 'ok');
}

// ════════ 기능 › 표정 ════════
const check = (label, on, onchange, hint) => h('label.check', h('input', { type: 'checkbox', checked: !!on, onchange: e => onchange(e.target.checked) }), h('i'), h('span', label), hint ? h('small', hint) : null);
const select = (value, opts, onchange, cls = '') => h(`select.inp${cls}`, { onchange: e => onchange(e.target.value) }, opts.map(([v, l]) => h('option', { value: v, selected: String(value ?? '') === String(v) }, l)));
const field = (label, ctl, hint, cls = '') => h(`label.field${cls}`, h('span.field-label', label), ctl, hint ? h('small.hint', hint) : null);
const range = (value, min, max, step, unit, onchange) => { const out = h('output', value + unit); return h('div.range', h('input', { type: 'range', min, max, step, value, oninput: e => { out.textContent = e.target.value + unit; onchange(+e.target.value); } }), out); };
const secHead = (title, desc, ...side) => h('div.exs-sec-head', h('div', h('h4', title), desc ? h('p', desc) : null), side.length ? h('div.exs-actions', side) : null);

/** 한 감정의 그림들: 더하기 · 옮기기 · 지우기 · (사용자 정의면) 이름과 키워드 */
function labelDialog(char, label, onChange) {
  const c = cfg(), body = h('div.exs-detail'); let box;
  const changed = () => { draw(); onChange(); sync(); };
  const add = async () => { if (await importFiles(char.id, await pickFiles({ accept: 'image/*,.zip', multiple: true }), { label })) changed(); };
  const draw = () => {
    const list = Sprites.of(char.id, label), custom = customOf(label), cc = charCfg(char.id), isFb = fallbackOf(char.id) === label;
    body.replaceChildren(
      h('div.exs-detail-top',
        h('p.hint', list.length > 1 ? `그림 ${list.length}장 — 이 감정이 나올 때마다 그 가운데 한 장이 보입니다.` : list.length ? '그림 1장. 더 올리면 그때그때 한 장씩 골라 보여 줍니다.' : '아직 그림이 없어요. 이 감정이 나오면 가까운 감정이나 기본 표정의 그림이 대신 보입니다.'),
        h('div.exs-actions', btn('그림 더하기', { ic: 'upload', onclick: add }),
          list.length ? btn(isFb ? '기본 표정으로 쓰는 중' : '기본 표정으로', { ic: 'star', cls: isFb ? 'ghost' : '', title: '판정된 감정이 없거나 맞는 그림이 없을 때 보여 줄 표정', onclick: () => { cc.fallback = label; save(); changed(); } }) : null)),
      list.length ? h('div.exs-detail-grid', list.map(a => h('figure.exs-fig-card',
        h('button.exs-thumb.big', { type: 'button', title: '크게 보기', onclick: () => modal({ title: a.name, wide: true, body: h('img.full-img', { src: a.data, alt: '' }) }) }, h('img', { src: a.data, alt: '', loading: 'lazy' })),
        h('figcaption', h('span', { title: a.name }, a.name),
          select(label, universe(char.id).map(l => [l, l === label ? '옮기기…' : fullName(l)]), async v => { if (v === label) return; await Sprites.update(char.id, { ...a, label: v }); toast(`${nameOf(v)}(으)로 옮겼어요`); changed(); }, '.exs-move'),
          iconBtn('trash', '이 그림 지우기', async () => { if (!(await confirmBox(`"${a.name}" 그림을 지울까요?`, '지우기', true))) return; await Sprites.remove(char.id, a); changed(); }, 'tiny'))))) : null,
      custom ? h('div.exs-custom',
        h('h4', '사용자 정의 감정'),
        field('화면에 보일 이름', h('input.inp', { value: custom.name || '', placeholder: label, oninput: e => { custom.name = e.target.value.trim(); save(); onChange(); } })),
        field('키워드 (쉼표로 구분)', h('input.inp', { value: custom.keys || '', placeholder: '예: 으쓱, 우쭐, smug', oninput: e => { custom.keys = e.target.value; save(); } }), '키워드로 추정할 때 답변에 이 낱말이 있으면 이 감정으로 봅니다.'),
        h('div.exs-actions', btn('이 감정 삭제', { ic: 'trash', cls: 'danger', onclick: async () => {
          if (!(await confirmBox(`"${label}" 감정을 목록에서 뺄까요? 캐릭터들에 올린 그림은 지워지지 않고, 그림이 있는 캐릭터에서는 계속 보입니다.`, '삭제', true))) return;
          c.custom = c.custom.filter(x => x.label !== label); save(); box.close(); onChange();
        } }))) : null);
  };
  box = modal({ title: `${char.name} · ${fullName(label)}`, wide: true, body });
  draw();
}

let sub = 'set', filter = 'all', query = '';
function render() {
  const root = h('div.exs');
  const pickChar = () => { const c = cfg(), { chat } = chatApi.current(); return S.get('chars', c.ui.char) || S.get('chars', chat?.charIds?.[0]) || [...S.chars].sort((a, b) => (c.chars[b.id]?.n || 0) - (c.chars[a.id]?.n || 0))[0] || null; };
  const draw = () => {
    const c = cfg(), char = pickChar();
    const list = char ? Sprites.list(char.id) : [], have = char ? Sprites.labels(char.id) : [];
    const mode = MODES.find(m => m[0] === c.mode) || MODES[0];
    const choose = () => charPicker({ title: '표정을 관리할 캐릭터', multi: false, selected: char ? [char.id] : [], note: x => c.chars[x.id]?.n ? `표정 ${c.chars[x.id].n}장` : '', onDone: async ([id]) => { c.ui.char = id; save(); await Sprites.load(id); draw(); } });
    const head = h('div.exs-head',
      char ? avatar(char, 'sm') : h('div.avatar.sm', '?'),
      h('div.exs-head-text', h('b', char ? char.name : '캐릭터 없음'), h('small', char ? (list.length ? `그림 ${list.length}장 · 감정 ${have.length}가지` : '아직 표정 그림이 없어요') : '캐릭터를 만들면 표정을 올릴 수 있어요', h('em.badge', `판정 · ${mode[1]}`))),
      S.chars.length > 1 ? btn('캐릭터 고르기', { ic: 'users', onclick: choose }) : null);

    // ── 세트 ──
    const setTab = () => {
      if (!char) return h('div.card.exs-card', h('p.dim.exs-empty', '먼저 캐릭터를 만들어 주세요.'));
      const bar = h('i'), prog = h('div.exs-prog', bar);
      const progress = (n, total) => { prog.classList.toggle('on', n < total); bar.style.width = Math.round(n / Math.max(1, total) * 100) + '%'; };
      const add = async (files, label = '') => { if (!files?.length) return; prog.classList.add('on'); bar.style.width = '4%'; try { await importFiles(char.id, files, { label, onProgress: progress }); } finally { prog.classList.remove('on'); } draw(); };
      const drop = h('div.dropzone.small.exs-drop', { onclick: async () => add(await pickFiles({ accept: 'image/*,.zip', multiple: true })) }, icon('upload', 22), h('b', '표정 그림을 끌어다 놓거나 눌러서 올리기'), h('span', '여러 장 · ZIP 한꺼번에. 파일 이름으로 감정을 맞춥니다 — joy.png, joy-1.png, anger_2.webp, 기쁨.png'));
      drop.addEventListener('dragover', e => { e.preventDefault(); drop.classList.add('over'); }); drop.addEventListener('dragleave', () => drop.classList.remove('over'));
      drop.addEventListener('drop', e => { e.preventDefault(); drop.classList.remove('over'); add([...e.dataTransfer.files]); });
      const cc = charCfg(char.id), all = universe(char.id), fb = fallbackOf(char.id);
      const hit = l => { const q = query.trim().toLowerCase(); return (!q || (l + ' ' + nameOf(l) + ' ' + (ALIASES[l] || '')).toLowerCase().includes(q)) && (filter === 'all' || (filter === 'have') === have.includes(l)); };
      const grid = h('div.exs-grid');
      const drawGrid = () => grid.replaceChildren(...all.filter(hit).map(l => {
        const imgs = Sprites.of(char.id, l), custom = !DEFAULT_LABELS.includes(l);
        const card = h(`button.exs-label${imgs.length ? '' : '.empty'}`, { type: 'button', title: imgs.length ? `${fullName(l)} · 그림 ${imgs.length}장` : `${fullName(l)} · 그림 없음`, onclick: () => labelDialog(char, l, draw) },
          h('span.exs-thumb', imgs.length ? h('img', { src: imgs[0].data, alt: '', loading: 'lazy' }) : h('i', '✦'), imgs.length > 1 ? h('span.exs-count', `${imgs.length}장`) : null, fb === l && imgs.length ? h('span.exs-fb', '기본') : null),
          h('span.exs-label-cap', h('b', nameOf(l)), h('small', custom ? (nameOf(l) === l ? '사용자 정의' : `${l} · 사용자 정의`) : l)));
        card.addEventListener('dragover', e => { e.preventDefault(); e.stopPropagation(); card.classList.add('over'); }); card.addEventListener('dragleave', () => card.classList.remove('over'));
        card.addEventListener('drop', e => { e.preventDefault(); e.stopPropagation(); card.classList.remove('over'); add([...e.dataTransfer.files], l); });
        return card;
      }),
        h('button.exs-label.add', { type: 'button', title: '감정 추가', onclick: async () => {
          const v = await promptBox('새 감정 이름 (영문 · 한글 · 숫자)', '', { placeholder: '예: smug, 졸림' }); if (v == null) return;
          const lab = cleanLabel(v); if (!lab) return toast('이름을 적어 주세요', 'err');
          if (universe(char.id).includes(lab)) return toast('이미 있는 감정이에요', 'err');
          const known = canonLabel(lab, DEFAULT_LABELS); if (known && !(await confirmBox(`"${lab}"은(는) 기본 감정 ${fullName(known)}의 다른 이름으로 알아봅니다. 그래도 따로 만들까요?`, '따로 만들기'))) return;
          c.custom.push({ label: lab, name: '', keys: '' }); save(); filter = 'all'; query = ''; draw(); labelDialog(char, lab, draw);
        } }, h('span.exs-thumb', icon('plus', 22)), h('span.exs-label-cap', h('b', '감정 추가'), h('small', '사용자 정의'))));
      drawGrid();
      const chips = [['all', `전체 ${all.length}`], ['have', `그림 있음 ${all.filter(l => have.includes(l)).length}`], ['none', `비어 있음 ${all.filter(l => !have.includes(l)).length}`]];
      return h('div.card.exs-card',
        h('div.exs-sec',
          secHead(`${char.name}의 표정 세트`, '감정마다 그림을 올립니다. 한 감정에 여러 장을 올리면 그때그때 한 장씩 보입니다.',
            btn('올리기', { ic: 'upload', onclick: async () => add(await pickFiles({ accept: 'image/*', multiple: true })) }),
            btn('폴더', { ic: 'folder', title: '실리태번 스프라이트 폴더(characters/이름)를 통째로 고릅니다. 휴대폰에서는 ZIP 을 써 주세요', onclick: async () => add(await pickFiles({ dir: true, multiple: true })) }),
            btn('ZIP', { ic: 'import', title: '스프라이트 묶음 ZIP 가져오기', onclick: async () => add(await pickFiles({ accept: '.zip,application/zip' })) }),
            list.length ? btn('내보내기', { ic: 'import', cls: 'ghost', title: '실리태번 스프라이트 폴더에 그대로 넣을 수 있는 ZIP', onclick: () => exportZip(char) }) : null,
            list.length ? btn('모두 지우기', { ic: 'trash', cls: 'ghost', onclick: async () => { if (!(await confirmBox(`${char.name}의 표정 그림 ${list.length}장을 모두 지울까요? 되돌릴 수 없어요.`, '지우기', true))) return; await Sprites.clear(char.id); toast('표정 그림을 모두 지웠어요', 'ok'); sync(); draw(); } }) : null),
          drop, prog),
        h('div.exs-sec',
          h('div.exs-toolbar',
            h('div.search-wrap', icon('search', 16), h('input.inp', { placeholder: '감정 찾기 (기쁨, joy, happy …)', value: query, oninput: e => { query = e.target.value; drawGrid(); } })),
            h('div.exs-seg', chips.map(([k, l]) => h(`button${filter === k ? '.on' : ''}`, { type: 'button', onclick: () => { filter = k; draw(); } }, l)))),
          grid,
          h('div.exs-fbrow', field('이 캐릭터의 기본 표정', select(cc.fallback || '', [['', `전체 설정 따름 (${c.fallback === '#none' ? '없음' : nameOf(c.fallback)})`], ['#none', '없음 — 카드 초상 그대로'], ...all.filter(l => have.includes(l)).map(l => [l, fullName(l)])], v => { cc.fallback = v; save(); sync(); draw(); }), '판정된 감정이 없거나, 그 감정과 가까운 감정의 그림이 모두 없을 때 보여 줍니다.', '.half'))));
    };

    // ── 판정 ──
    const detectTab = () => {
      const conns = [['', '대화에 쓰는 연결 (보조 연결 공통 설정을 따름)'], ...S.conns.map(x => [x.id, `${x.name}${x.model ? ' · ' + x.model : ''}`])];
      const sample = char && Sprites.has(char.id) ? tagInstruction(char, null) : '';
      const testIn = h('textarea.inp', { rows: 3, placeholder: '답변 한 토막을 붙여 넣고 어떤 감정으로 읽히는지 확인해 보세요.' }), testOut = h('div.exs-test-out');
      const showScore = r => { const top = Object.entries(r.scores).sort((a, b) => b[1] - a[1]).slice(0, 4); testOut.replaceChildren(h('b', r.label ? fullName(r.label) : '짚이는 감정 없음'), ...top.map(([l, s]) => h('span.chip.static', `${nameOf(l)} ${s.toFixed(1)}`))); };
      return h('div.exs-stack',
        h('div.card.exs-card',
          h('div.exs-sec',
            secHead('감정을 정하는 방법', '캐릭터의 답변마다 어떤 표정을 보여 줄지 정합니다. 정해진 감정은 메시지에 기록되어 다시 열어도 그대로 보입니다.'),
            h('div.exs-modes', MODES.map(([k, title, desc, cost]) => h(`button.exs-mode${c.mode === k ? '.on' : ''}`, { type: 'button', onclick: () => { c.mode = k; save(); draw(); } }, h('b', title), h('span', desc), h('em', cost)))),
            check('그림이 있는 감정 가운데서만 고르기', c.onlyHave, v => { c.onlyHave = v; save(); draw(); }, '끄면 모든 감정에서 고르고, 그림이 없으면 가까운 감정의 그림을 보여 줍니다'))),
        c.mode === 'tag' ? h('div.card.exs-card', h('div.exs-sec',
          secHead('숨은 태그 지시문', '답변 요청의 맨 끝에 이 지시가 붙습니다. 표정 그림이 두 가지 이상 있는 캐릭터가 말할 때만 넣습니다.', btn('기본값', { ic: 'refresh', cls: 'ghost', onclick: () => { c.tagPrompt = ''; save(); draw(); } })),
          h('textarea.inp.exs-prompt', { rows: 7, spellcheck: false, value: c.tagPrompt || '', placeholder: TAG_PROMPT, oninput: e => { c.tagPrompt = e.target.value; save(); } }),
          h('small.hint', '{{labels}} 자리에 고를 수 있는 감정 이름이, {{char}} 자리에 말하는 캐릭터 이름이 들어갑니다. 비워 두면 위에 흐리게 보이는 기본 지시문을 씁니다. 태그 모양 <emotion:이름> 은 바꾸지 마세요 — 이 모양이어야 떼어 내고 읽을 수 있습니다.'),
          sample ? h('small.hint', `지금 ${char.name}(으)로 채우면 약 ${tokens(sample).toLocaleString()} 토큰이 답변 요청마다 더 실립니다.`) : char ? h('small.hint', `${char.name}에게 표정 그림이 두 가지 이상 있어야 지시가 들어갑니다.`) : null,
          check('태그가 빠진 답변은 키워드로 추정하기', c.tagFallback, v => { c.tagFallback = v; save(); }))) : null,
        c.mode === 'call' ? h('div.card.exs-card', h('div.exs-sec',
          secHead('따로 묻기', '답변이 올 때마다 아래 지시문으로 한 번 더 호출합니다 (답변마다 추가 호출 1회). 표정 그림이 두 가지 이상 있는 캐릭터의 답변에만 묻습니다.', btn('기본값', { ic: 'refresh', cls: 'ghost', onclick: () => { c.callPrompt = ''; save(); draw(); } })),
          h('div.form',
            field('판정에 쓸 연결', select(S.settings.helpers?.expr || '', conns, v => { S.set({ helpers: { ...S.settings.helpers, expr: v } }); }), '값싼 모델을 따로 지정해 두면 비용을 아낄 수 있어요.', '.half'),
            field('함께 보낼 앞 메시지 수', h('input.inp', { type: 'number', min: 0, max: 6, value: c.callContext, oninput: e => { c.callContext = Math.max(0, Math.min(6, Math.round(+e.target.value) || 0)); save(); } }), null, '.third'),
            field('최대 응답 토큰', h('input.inp', { type: 'number', min: 16, max: 4000, step: 10, value: c.callTokens, oninput: e => { c.callTokens = Math.max(16, Math.round(+e.target.value) || 300); save(); } }), '생각 과정을 쓰는 모델이면 넉넉히.', '.third')),
          h('textarea.inp.exs-prompt', { rows: 6, spellcheck: false, value: c.callPrompt || '', placeholder: CALL_PROMPT, oninput: e => { c.callPrompt = e.target.value; save(); } }),
          h('small.hint', '{{labels}} 자리에 고를 수 있는 감정 이름이, {{char}} 자리에 캐릭터 이름이 들어갑니다. 비워 두면 기본 지시문을 씁니다. 모델은 감정 이름 하나만 답하면 됩니다.'))) : null,
        h('div.card.exs-card', h('div.exs-sec',
          secHead('시험해 보기', '키워드 추정은 호출이 없습니다. "모델에게 묻기"는 위의 따로 묻기 지시문으로 한 번 호출합니다.'),
          testIn,
          h('div.exs-actions',
            btn('키워드로 추정', { ic: 'search', onclick: () => showScore(keywordLabel(testIn.value, { labels: char && c.onlyHave ? candidates(char.id) : [], custom: c.custom })) }),
            btn('모델에게 묻기 (호출 1회)', { ic: 'sparkle', cls: 'ghost', onclick: async e => {
              if (!testIn.value.trim()) return toast('먼저 글을 적어 주세요');
              const labels = char && candidates(char.id).length > 1 ? candidates(char.id) : universe(char?.id), conn = S.helperConn('expr', chatApi.current().chat);
              if (!conn) return toast('연결된 API 가 없어요', 'err');
              const b = e.currentTarget; b.disabled = true; testOut.textContent = '묻는 중…';
              try {
                const sys = macro(String(c.callPrompt || '').trim() || CALL_PROMPT, { char: char?.name || 'the character', user: S.settings.userNameFallback, vars: {} }).replace(/\{\{labels\}\}/gi, labels.join(', '));
                const out = await quickCall(sys, `[Latest reply by ${char?.name || 'the character'}]\n${clip(plainText(testIn.value), 1800)}`, { maxTokens: Math.max(16, +c.callTokens || 300), conn });
                const l = canonLabel(out, labels) || canonLabel(out, universe(char?.id));
                testOut.replaceChildren(h('b', l ? fullName(l) : '답에서 감정을 찾지 못했어요'), h('span.chip.static', `모델의 답: ${String(out).slice(0, 60) || '(빈 답)'}`));
              } catch (err) { testOut.textContent = '실패: ' + (err.message || err); } finally { b.disabled = false; }
            } })),
          testOut)));
    };

    // ── 표시 ──
    const viewTab = () => {
      const all = universe(char?.id);
      return h('div.exs-stack',
        h('div.card.exs-card', h('div.exs-sec',
          secHead('대화 화면', '표정 그림은 자르거나 늘이지 않고 온전하게 보여 줍니다.'),
          h('div.exs-toggles',
            check('표정 보이기', c.show, v => { c.show = v; save(); draw(); }, '끄면 표정 그림을 어디에도 보이지 않고, 태그 지시와 추가 호출도 멈춥니다'),
            check('초상 영역에 지금 표정 보이기', c.dossier, v => { c.dossier = v; save(); }, '넓은 화면 왼쪽의 초상이 감정에 따라 바뀝니다'),
            check('메시지 아바타에 그 답변의 표정 보이기', c.avatars, v => { c.avatars = v; save(); }, '아바타가 보이는 화면(대화 모드 · 그룹 채팅)에서, 감정이 기록된 답변만'),
            check('표정이 바뀔 때 부드럽게 넘기기', c.fade, v => { c.fade = v; save(); }),
            check('한 감정에 그림이 여러 장이면 번갈아 보이기', c.multi, v => { c.multi = v; save(); }, '끄면 늘 첫 장만 씁니다. 같은 메시지는 다시 열어도 같은 그림입니다')),
          h('div.form',
            field('아바타에 넣는 방식', select(c.avatarFit, [['contain', '온전하게 (그림 전체가 보임)'], ['cover', '칸에 채우기 (위쪽 기준으로 넘치는 부분은 가려짐)']], v => { c.avatarFit = v; save(); }), null, '.half'),
            field('전체 기본 표정', select(c.fallback, [['#none', '없음 — 카드 초상 그대로'], ...all.map(l => [l, fullName(l)])], v => { c.fallback = v; save(); draw(); }), '캐릭터마다 따로 정할 수도 있습니다 (세트 탭).', '.half'),
            field('올릴 때 줄일 크기 (긴 변, px)', h('input.inp', { type: 'number', min: 256, max: 4096, step: 64, value: c.maxPx, oninput: e => { c.maxPx = Math.max(256, Math.min(4096, Math.round(+e.target.value) || 1280)); save(); } }), '이보다 큰 그림은 비율을 지켜 줄여서 보관합니다. GIF 는 그대로 둡니다.', '.half')))),
        h('div.card.exs-card', h('div.exs-sec',
          secHead('스탠딩 보기', '화면 한쪽에 큰 초상을 세웁니다. 그룹 채팅에서는 말하는 인물이 앞으로 나옵니다. 표정 그림이 없는 캐릭터는 카드 초상이 섭니다.'),
          h('div.exs-toggles',
            check('스탠딩 보기', c.standing, v => { c.standing = v; save(); }, '대화 화면의 초상 아래 꼬리표, 입력창의 + 메뉴, /standing 으로도 켜고 끕니다'),
            check('그룹에서 말하지 않는 인물은 한 걸음 물러나 있기', c.dim, v => { c.dim = v; save(); })),
          h('div.form',
            field('서는 쪽', select(c.side, [['right', '오른쪽'], ['left', '왼쪽 (넓은 화면에서는 초상 영역 위)']], v => { c.side = v; save(); }), null, '.half'),
            field('크기 — 옆 여백에 설 때', range(c.size, 30, 96, 2, '%', v => { c.size = v; save(); }), '화면 높이에 대한 비율', '.half'),
            field('크기 — 글 위에 겹칠 때', range(c.sizeOver, 20, 80, 2, '%', v => { c.sizeOver = v; save(); }), '옆에 설 자리가 없는 좁은 화면 · 휴대폰', '.half'),
            field('겹칠 때 진하기', range(c.overOpacity, 30, 100, 5, '%', v => { c.overOpacity = v; save(); }), '글을 가릴 때 얼마나 비쳐 보이게 할지', '.half')))),
        h('div.card.exs-card', h('div.exs-sec',
          secHead('쓰는 법'),
          h('ul.exs-help',
            h('li', '세트 탭에서 캐릭터를 고르고 표정 그림이나 ZIP 을 올립니다. 파일 이름이 감정이 됩니다.'),
            h('li', '판정 탭에서 감정을 정하는 방법을 고릅니다. 처음에는 꺼져 있고, 직접 고를 수도 있습니다.'),
            h('li', h('code', '/emote 기쁨'), ' — 마지막 답변의 표정을 바꿉니다. 그룹에서는 ', h('code', '/emote 이름: 감정'), '. 비워서 보내면 고르는 창이 열립니다.'),
            h('li', '메시지의 ⋯ 메뉴 › 표정 바꾸기로 어느 답변이든 고칠 수 있습니다. 답변을 넘겨 보면(스와이프) 답변마다 기록된 표정이 따라옵니다.'),
            h('li', h('code', '{{expression}}'), ' — 지금 표정의 감정 이름으로 바뀌는 빈칸입니다.')))));
    };

    const TABS = [['set', '세트', 'image', setTab], ['detect', '판정', 'sparkle', detectTab], ['view', '표시', 'eye', viewTab]];
    root.replaceChildren(head,
      h('div.exs-tabs', { role: 'tablist' }, TABS.map(([k, l, ic]) => h(`button${sub === k ? '.on' : ''}`, { type: 'button', role: 'tab', onclick: () => { sub = k; draw(); } }, icon(ic, 16), h('span', l)))),
      (TABS.find(t => t[0] === sub) || TABS[0])[3]());
  };
  draw();
  const first = pickChar();
  if (first && !Sprites.has(first.id)) Sprites.load(first.id).then(() => { Sprites.note(first.id); draw(); }).catch(e => console.warn('[표정]', e));
  return root;
}
X.studio = X.studio.filter(t => t.owner !== 'expr');
X.studio.push({ owner: 'expr', title: '표정', render });
schedule();   // 대화 화면이 이미 떠 있는 채로 불려 왔을 때
