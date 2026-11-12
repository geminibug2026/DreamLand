// 번역: 언어 표 · 기본 지시문 · 지시문 빈칸 안내 (옛 js/f-translate.js 에서 글자 그대로)
// ════════ 언어 ════════  코드 | 모델에게 쓰는 이름 | 화면에 보이는 이름
export const LANGS = `ko|Korean|한국어
en|English|영어
ja|Japanese|일본어
zh-CN|Chinese (Simplified)|중국어 (간체)
zh-TW|Chinese (Traditional)|중국어 (번체)
es|Spanish|스페인어
fr|French|프랑스어
de|German|독일어
ru|Russian|러시아어
pt-BR|Portuguese (Brazil)|포르투갈어 (브라질)
pt-PT|Portuguese (Portugal)|포르투갈어 (포르투갈)
it|Italian|이탈리아어
vi|Vietnamese|베트남어
th|Thai|태국어
id|Indonesian|인도네시아어
af|Afrikaans|아프리칸스어
sq|Albanian|알바니아어
am|Amharic|암하라어
ar|Arabic|아랍어
hy|Armenian|아르메니아어
az|Azerbaijani|아제르바이잔어
eu|Basque|바스크어
be|Belarusian|벨라루스어
bn|Bengali|벵골어
bs|Bosnian|보스니아어
bg|Bulgarian|불가리아어
ca|Catalan|카탈루냐어
ceb|Cebuano|세부아노어
co|Corsican|코르시카어
hr|Croatian|크로아티아어
cs|Czech|체코어
da|Danish|덴마크어
nl|Dutch|네덜란드어
eo|Esperanto|에스페란토
et|Estonian|에스토니아어
fi|Finnish|핀란드어
fy|Frisian|프리지아어
gl|Galician|갈리시아어
ka|Georgian|조지아어
el|Greek|그리스어
gu|Gujarati|구자라트어
ht|Haitian Creole|아이티 크리올어
ha|Hausa|하우사어
haw|Hawaiian|하와이어
iw|Hebrew|히브리어
hi|Hindi|힌디어
hmn|Hmong|몽어
hu|Hungarian|헝가리어
is|Icelandic|아이슬란드어
ig|Igbo|이그보어
ga|Irish|아일랜드어
jw|Javanese|자바어
kn|Kannada|칸나다어
kk|Kazakh|카자흐어
km|Khmer|크메르어
ku|Kurdish|쿠르드어
ky|Kyrgyz|키르기스어
lo|Lao|라오어
la|Latin|라틴어
lv|Latvian|라트비아어
lt|Lithuanian|리투아니아어
lb|Luxembourgish|룩셈부르크어
mk|Macedonian|마케도니아어
mg|Malagasy|말라가시어
ms|Malay|말레이어
ml|Malayalam|말라얄람어
mt|Maltese|몰타어
mi|Maori|마오리어
mr|Marathi|마라티어
mn|Mongolian|몽골어
my|Myanmar (Burmese)|미얀마어
ne|Nepali|네팔어
no|Norwegian|노르웨이어
ny|Nyanja (Chichewa)|니안자어
ps|Pashto|파슈토어
fa|Persian|페르시아어
pl|Polish|폴란드어
pa|Punjabi|펀자브어
ro|Romanian|루마니아어
sm|Samoan|사모아어
gd|Scots Gaelic|스코틀랜드 게일어
sr|Serbian|세르비아어
st|Sesotho|소토어
sn|Shona|쇼나어
sd|Sindhi|신디어
si|Sinhala (Sinhalese)|싱할라어
sk|Slovak|슬로바키아어
sl|Slovenian|슬로베니아어
so|Somali|소말리어
su|Sundanese|순다어
sw|Swahili|스와힐리어
sv|Swedish|스웨덴어
tl|Tagalog (Filipino)|타갈로그어
tg|Tajik|타지크어
ta|Tamil|타밀어
te|Telugu|텔루구어
tr|Turkish|튀르키예어
uk|Ukrainian|우크라이나어
ur|Urdu|우르두어
uz|Uzbek|우즈베크어
cy|Welsh|웨일스어
xh|Xhosa|코사어
yi|Yiddish|이디시어
yo|Yoruba|요루바어
zu|Zulu|줄루어`.split('\n').map(l => l.split('|'));
export const findLang = (v: unknown) => { const k = String(v || '').trim().toLowerCase(); return LANGS.find(l => l.some(x => x.toLowerCase() === k)); };
/** 코드·한국어 이름·영어 이름 무엇이든 → 모델에게 쓸 영어 이름 (목록에 없으면 적힌 그대로) */
export const langName = (v: unknown) => findLang(v)?.[1] || String(v || '').trim() || 'Korean';
export const langLabel = (v: unknown) => findLang(v)?.[2] || String(v || '').trim();

// ════════ 지시문 ════════
export const DEFAULT_PROMPT = `# Task: Translate Text

You are an expert multilingual translator. Your task is to translate the user's text into {{language}} accurately, preserving the original markdown formatting.

## Context: Previous Messages
{{#each chat}}
**Message {{add @index 1}}:**
> {{this.name}}: {{this.mes}}

{{/each}}

## Perspective
{{name}}

## Text to Translate
\`\`\`
{{prompt}}
\`\`\`

## Instructions
1.  Translate the "Text to Translate" into **{{language}}**.
2.  Preserve all markdown formatting (headings, lists, bold, etc.), quotation marks, line breaks, HTML tags and {{img::...}} tags exactly as they are.
3.  Keep names consistent with the previous messages. Translate meaning and tone, not word by word.
4.  Your response **must** only contain the translated text, enclosed in a single markdown code block.

Important: Your response must follow this exact format with the translation enclosed in code blocks (\`\`\`).`;
export const SYSTEM = 'You are a professional translator. Follow the instructions in the user message exactly and output nothing else.';
export const VARS: [string, string][] = [['{{language}}', '옮길 언어'], ['{{prompt}}', '번역할 글'], ['{{name}}', '그 글을 쓴 사람'], ['{{#each chat}}…{{/each}}', '앞 메시지 반복 · 안에서 {{this.name}} {{this.mes}} {{add @index 1}}'], ['{{#each (slice chat -3)}}…{{/each}}', '앞 메시지 중 마지막 3개만'], ['{{context}}', '앞 메시지를 "이름: 내용" 줄로'], ['{{chat_1}}', '바로 앞 메시지 (chat_2, chat_3 …)'], ['{{#if chat}}…{{else}}…{{/if}}', '앞 메시지가 있을 때만'], ['{{user}} {{char}}', '내 이름 · 캐릭터 이름']];
