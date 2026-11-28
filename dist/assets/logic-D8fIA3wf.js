import{a as e,o as t}from"./parts-tPUfyH9a.js";import{i as n,s as r,u as i}from"./i18n-BHmxYANa.js";import{i as a}from"./illust-Ca3OhYtE.js";import{D as o,o as s,p as c}from"./core-DOuukZBa.js";import{h as l,p as u}from"./ui-BUHwHx0E.js";import{F as d}from"./engine-BSprvsX7.js";import{t as f}from"./hooks-DdvSA-rV.js";import{u as p}from"./actions-D3oNhkOj.js";var m=`ko|Korean|한국어
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
zu|Zulu|줄루어`.split(`
`).map(e=>e.split(`|`)),h=e=>{let t=String(e||``).trim().toLowerCase();return m.find(e=>e.some(e=>e.toLowerCase()===t))},g=e=>h(e)?.[1]||String(e||``).trim()||`Korean`,_=e=>{if(n()===`ko`)return e[2];if(n()===`en`)return e[1];try{let t=new Intl.DisplayNames([r()],{type:`language`}).of(e[0]===`iw`?`he`:e[0]===`jw`?`jv`:e[0]);if(t&&t!==e[0])return t}catch{}return e[1]},v=e=>{let t=h(e);return t?_(t):String(e||``).trim()},y=[`# Task: Translate Text

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

Important: Your response must follow this exact format with the translation enclosed in code blocks (\`\`\`).`,`Translate the text below into {{language}}. Reply with the translation only.
{{#if chat}}

Earlier in this story, for names, who talks to whom, and the speech levels already used (lines that were already translated are shown translated):
{{#each chat}}
{{this.name}}: {{this.mes}}
{{/each}}
{{/if}}

How to translate:
- Write it the way a skilled {{language}} novelist would have written it in the first place: natural sentences, not word for word.
- Keep the meaning, mood and every detail. Add nothing, leave nothing out, do not soften or censor anything.
- Keep the layout exactly: paragraphs, line breaks, *asterisks*, quotation marks, markdown, HTML tags, {{img::…}} tags. Do not translate code or HTML attributes.
- Keep every name and title the same as in the earlier lines.
- This text is {{name}}'s turn.
{{#if korean}}

한국어로 옮길 때:
- 지문(서술)은 '~했다' 체로 이어 쓴다. 말투는 대사에만 살린다.
- 존댓말 · 반말: 두 사람의 관계와 앞서 번역된 대사에서 쓰던 말씨를 그대로 이어 간다. 원문에 근거가 없으면 바꾸지 않는다. 처음 만난 사이 · 윗사람 · 격식 있는 자리는 존댓말, 가까운 사이는 반말이 기본이고 sir · ma'am · my lady 같은 말과 원문의 격식을 따른다.
- 판타지 · 사극 인물이라도 '~하오' '~하시오' 같은 낡은 말투는 쓰지 않는다. 격식은 '~합니다' '~하십시오', 부드러운 존대는 '~해요'.
- you 를 '당신' 으로, he · she 를 '그' '그녀' 로 기계적으로 옮기지 않는다. 이름 · 호칭(아가씨, 선배, 대표님 …)으로 부르거나, 한국어답게 빼도 되는 주어는 뺀다.
- darling · sweetheart · love · princess 같은 애칭은 맥락에 맞는 한국어로 옮기거나 이름으로 부른다. '달링' '허니' 같은 소리 옮김은 쓰지 않는다.
- 담백하고 세련되게. 원문보다 감정을 부풀리거나 꾸밈말을 덧붙이지 않고, 원문에 없는 로맨스 소설 상투구를 만들지 않는다.
- 번역투를 피한다: '~하는 것이었다', '~에 의해', '그것은', '~하고 있는 중이다', 겹치는 '~의'.
- 감탄사 · 의성어 · 의태어(Oh, Well, Hmm, *sigh*)는 한국어에서 실제로 쓰는 말로.
{{/if}}

Text:
{{prompt}}`],b=`Translate the text below into {{language}}. Reply with the translation only.
{{#if chat}}

Earlier in this story, for names, who talks to whom, and the speech levels already used (lines that were already translated are shown translated):
{{#each chat}}
{{this.name}}: {{this.mes}}
{{/each}}
{{/if}}

How to translate:
- Write it the way a skilled {{language}} novelist would have written it in the first place: natural sentences, not word for word.
- Keep the meaning, mood and every detail. Add nothing, leave nothing out, do not soften or censor anything.
- Keep the layout exactly: paragraphs, line breaks, *asterisks*, quotation marks, markdown, HTML tags, {{img::…}} tags. Do not translate code or HTML attributes.
- Keep every name and title the same as in the earlier lines.
- This text is {{name}}'s turn.
{{#if korean}}

한국어로 옮길 때:
- 지문(서술)은 '~했다' 체로 이어 쓴다. 말투는 대사에만 살린다.
- 존댓말 · 반말: 두 사람의 관계와 앞서 번역된 대사에서 쓰던 말씨를 그대로 이어 간다. 원문에 근거가 없으면 바꾸지 않는다. 처음 만난 사이 · 윗사람 · 격식 있는 자리는 존댓말, 가까운 사이는 반말이 기본이고 sir · ma'am · my lady 같은 말과 원문의 격식을 따른다.
- 판타지 · 사극 인물이라도 '~하오' '~하시오' 같은 낡은 말투는 쓰지 않는다. 격식은 '~합니다' '~하십시오', 부드러운 존대는 '~해요'.
- you 를 '당신' 으로, he · she 를 '그' '그녀' 로 기계적으로 옮기지 않는다. 이름 · 호칭(아가씨, 선배, 대표님 …)으로 부르거나, 한국어답게 빼도 되는 주어는 뺀다.
- darling · sweetheart · love · princess 같은 애칭은 맥락에 맞는 한국어로 옮기거나 이름으로 부른다. '달링' '허니' 같은 소리 옮김은 쓰지 않는다.
- 남초 커뮤니티 · 인터넷 은어 말투를 섞지 않는다 ('~노' '~누' '~이기야', '개웃기네' 같은 '개-', '지린다' '레전드' '실화냐' '쌉가능' '~각' '알빠노', '꼴린다' '암컷' '따먹다' 같은 말). 거칠거나 가벼운 인물도 실제 사람이 입으로 하는 자연스러운 말투로 옮기고, 욕은 원문만큼의 세기로 평범한 욕('젠장' '빌어먹을' '씨발')을 쓴다.
- 성적인 장면도 순화하거나 빼지 않되, 비하하는 말 · 야설이나 커뮤니티식 표현이 아니라 소설에서 쓰는 자연스러운 문장으로 옮긴다.
- 번역투를 피한다: '~하는 것이었다', '~에 의해', '그것은', '~하고 있는 중이다', 겹치는 '~의'.
- 감탄사 · 의성어 · 의태어(Oh, Well, Hmm, *sigh*)는 한국어에서 실제로 쓰는 말로.
{{/if}}

Text:
{{prompt}}`,x=`You are a professional translator. Follow the instructions in the user message exactly and output nothing else.`,S=()=>[[`{{language}}`,`language`],[`{{prompt}}`,`prompt`],[`{{name}}`,`name`],[`{{#each chat}}…{{/each}}`,`each`],[`{{#each (slice chat -3)}}…{{/each}}`,`slice`],[`{{context}}`,`context`],[`{{chat_1}}`,`chat1`],[`{{#if chat}}…{{else}}…{{/if}}`,`if`],[`{{user}} {{char}}`,`userChar`]].map(([e,t])=>[e,i(`translate.vars.`+t)]),C=e=>a.strip(e);function w(){let e=s.settings.translate;Array.isArray(e.presets)&&e.presets.length||(e.presets=[{id:`default`,name:`기본`,content:b,filter:!0}],e.prompt?.trim()&&e.presets.push({id:`custom`,name:`내 지시문`,filter:!1,content:`${e.prompt.trim()}\n\n{{#if chat}}<context>\n{{context}}\n</context>\n\n{{/if}}<text>\n{{prompt}}\n</text>`}),e.preset=e.presets[e.presets.length-1].id),e.presets.some(t=>t.id===e.preset)||(e.preset=e.presets[0].id);for(let t of e.presets)y.includes(t.content)&&(t.content=b);return e}var T=e=>{let t=w();return e&&t.presets.find(t=>t.id===e||t.name===e)||t.presets.find(e=>e.id===t.preset)||t.presets[0]},E=()=>s.set({translate:w(),helpers:s.settings.helpers});function D(e,t){let n=[],r=e=>(n.push(String(e??``)),`\u0000${n.length-1}\u0000`),i=t.chat||[],a={korean:/^korean$/i.test(t.language)?`1`:``,language:t.language,prompt:t.text,text:t.text,name:t.name,user:t.user,char:t.char,context:i.map(e=>`${e.name}: ${e.mes}`).join(`
`)},o=(e,t,n)=>{n=n.trim();let i=n.match(/^add\s+@index\s+(-?\d+)$/);if(i)return String(t+ +i[1]);if(n===`@index`)return String(t);let a=n.replace(/^this\.?/,``);return r(a?e[a]:e.mes)},s=e.replace(/\{\{#each\s+(?:\(\s*slice\s+chat\s+(-?\d+)\s*\)|chat)\s*\}\}([\s\S]*?)\{\{\/each\}\}/g,(e,t,n)=>(t?i.slice(+t):i).map((e,t)=>n.replace(/\{\{\s*(this(?:\.\w+)?|@index|add\s+@index\s+-?\d+)\s*\}\}/g,(n,r)=>o(e,t,r))).join(``).replace(/^\n/,``));return s=s.replace(/\{\{#if\s+(\w+)\s*\}\}([\s\S]*?)(?:\{\{else\}\}([\s\S]*?))?\{\{\/if\}\}/g,(e,t,n,r=``)=>(t===`chat`?i.length:a[t])?n:r),s=s.replace(/\{\{\s*(\w+)\s*\}\}/g,(e,t)=>{let n=t.match(/^chat_(\d+)$/);return n?r(i[i.length-+n[1]]?.mes):t in a?r(a[t]):e}),s.replace(/\u0000(\d+)\u0000/g,(e,t)=>n[+t])}var O=/^(?:[^`]*?)\n?```[\s\S]*?\n([\s\S]*?)```(?![^`]*```)/;async function k(e,t,{chat:n,context:r=[],signal:a,name:l,preset:u,conn:f}={}){let m=w(),h=T(u),_=p.current();n||=_.chat;let v=n?s.persona(n):s.get(`personas`,s.settings.activePersona);if(l==null){let t=n===_.chat?_.msgs.find(t=>C(o(t))===e):null;l=t?t.role===`user`?v?.name:t.name||s.get(`chars`,t.charId)?.name:v?.name}let y=D(h.content||`Translate the text below into {{language}}. Reply with the translation only.
{{#if chat}}

Earlier in this story, for names, who talks to whom, and the speech levels already used (lines that were already translated are shown translated):
{{#each chat}}
{{this.name}}: {{this.mes}}
{{/each}}
{{/if}}

How to translate:
- Write it the way a skilled {{language}} novelist would have written it in the first place: natural sentences, not word for word.
- Keep the meaning, mood and every detail. Add nothing, leave nothing out, do not soften or censor anything.
- Keep the layout exactly: paragraphs, line breaks, *asterisks*, quotation marks, markdown, HTML tags, {{img::…}} tags. Do not translate code or HTML attributes.
- Keep every name and title the same as in the earlier lines.
- This text is {{name}}'s turn.
{{#if korean}}

한국어로 옮길 때:
- 지문(서술)은 '~했다' 체로 이어 쓴다. 말투는 대사에만 살린다.
- 존댓말 · 반말: 두 사람의 관계와 앞서 번역된 대사에서 쓰던 말씨를 그대로 이어 간다. 원문에 근거가 없으면 바꾸지 않는다. 처음 만난 사이 · 윗사람 · 격식 있는 자리는 존댓말, 가까운 사이는 반말이 기본이고 sir · ma'am · my lady 같은 말과 원문의 격식을 따른다.
- 판타지 · 사극 인물이라도 '~하오' '~하시오' 같은 낡은 말투는 쓰지 않는다. 격식은 '~합니다' '~하십시오', 부드러운 존대는 '~해요'.
- you 를 '당신' 으로, he · she 를 '그' '그녀' 로 기계적으로 옮기지 않는다. 이름 · 호칭(아가씨, 선배, 대표님 …)으로 부르거나, 한국어답게 빼도 되는 주어는 뺀다.
- darling · sweetheart · love · princess 같은 애칭은 맥락에 맞는 한국어로 옮기거나 이름으로 부른다. '달링' '허니' 같은 소리 옮김은 쓰지 않는다.
- 남초 커뮤니티 · 인터넷 은어 말투를 섞지 않는다 ('~노' '~누' '~이기야', '개웃기네' 같은 '개-', '지린다' '레전드' '실화냐' '쌉가능' '~각' '알빠노', '꼴린다' '암컷' '따먹다' 같은 말). 거칠거나 가벼운 인물도 실제 사람이 입으로 하는 자연스러운 말투로 옮기고, 욕은 원문만큼의 세기로 평범한 욕('젠장' '빌어먹을' '씨발')을 쓴다.
- 성적인 장면도 순화하거나 빼지 않되, 비하하는 말 · 야설이나 커뮤니티식 표현이 아니라 소설에서 쓰는 자연스러운 문장으로 옮긴다.
- 번역투를 피한다: '~하는 것이었다', '~에 의해', '그것은', '~하고 있는 중이다', 겹치는 '~의'.
- 감탄사 · 의성어 · 의태어(Oh, Well, Hmm, *sigh*)는 한국어에서 실제로 쓰는 말로.
{{/if}}

Text:
{{prompt}}`,{language:g(t||m.lang),text:e,name:l||``,user:v?.name||``,char:s.get(`chars`,n?.charIds?.[0])?.name||``,chat:r.map(e=>({name:e.name,mes:String(e.text??e.mes??``).slice(0,4e3),text:String(e.text??e.mes??``).slice(0,4e3)}))}),b=await d(x,y,{maxTokens:c(+(m.maxTokens??0)||2e4,256,2e5),signal:a,conn:f||s.helperConn(`translate`,n),temp:.3,lowThink:!0});if(h.filter!==!1){let t=b.trim().match(/^```[^\n]*\n([\s\S]*?)\n?```$/);if(t&&!/^\s*```/.test(e))b=t[1];else if(!e.includes("```")){let e=b.match(O);e&&(b=e[1])}}if(b=b.trim(),!b)throw Error(i(`translate.err.empty`));return b}var A=new Set,j=e=>document.querySelector(`article.msg[data-id="${e}"]`),M=e=>j(e)?.querySelectorAll(`.trx-btn.trx-go, .trx-btn.trx-re`).forEach(t=>t.classList.toggle(`busy`,A.has(e))),N=(e,t,n)=>{let r=+(w().context??0)||0,i=t.indexOf(n),a=s.persona(e)?.name||``;return r&&i>0?t.slice(Math.max(0,i-r),i).filter(e=>!e.hidden).map(e=>{let t=e.swipes?.[e.sw];return{name:e.role===`user`?a:e.name||s.get(`chars`,e.charId)?.name||`Narrator`,text:t?.tr?.trim()?C(t.tr):C(o(e))}}):[]},P=async(e,t)=>{p.current().chat===e?(await p.save(),p.redraw()):await s.saveMsgs(e,t)};async function F(n,r=!1){let{chat:a,msgs:o,busy:c}=p.current(),l=n?.swipes?.[n.sw];if(!a||!n||!l)return;if(A.has(n.id))return u(i(`translate.msg.busy`));if(l.tr&&!r)return l.showTr=!l.showTr,P(a,o);if(c&&o[o.length-1]===n)return u(i(`translate.msg.wait`));let d=C(l.text||``).trim();if(!d)return u(i(`translate.msg.empty`));A.add(n.id),M(n.id);try{let e=n.role===`user`?s.persona(a)?.name:n.name||s.get(`chars`,n.charId)?.name,t=await(f.translate||k)(d,w().lang,{chat:a,context:N(a,o,n),name:e||``}),r=p.current(),c=r.chat?.id===a.id,m=!c||r.msgs.includes(n)?n:r.msgs.find(e=>e.id===n.id),h=m===n?l:m?.swipes?.[n.swipes.indexOf(l)],g=e=>!!e&&(C(e.text||``).trim()===d||(e.text||``).trim()===d);if(!h||!g(h)||!g(l))return A.delete(n.id),M(n.id),u(i(`translate.msg.changed`));if(!c&&!s.get(`chats`,a.id))return;h.tr=t,h.showTr=!0,A.delete(n.id),await P(c?r.chat:a,c?r.msgs:o)}catch(n){t(n)||u(i(`chat.translate.fail`,{err:e(n)}),`err`)}finally{A.delete(n.id),M(n.id)}}var I=e=>e.filter(e=>e.swipes?.some(e=>e.tr)).length;async function L(e,t,n){let{chat:r,msgs:a}=p.current();if(!r||!a.length)return u(i(`translate.clear.noMsgs`));let o=1,s=a.length;if(!n){if(o=parseInt(e??``,10),s=parseInt(t??``,10),isNaN(o)||isNaN(s))return u(i(`translate.clear.needRange`));o>s&&([o,s]=[s,o]),o=c(o,1,a.length),s=c(s,1,a.length)}let d=a.slice(o-1,s).filter(e=>e.swipes?.some(e=>e.tr));if(!d.length)return u(i(`translate.clear.noneInRange`));if(await l(n?i(`translate.clear.confirmAll`,{count:d.length}):i(`translate.clear.confirmRange`,{a:o,b:s,count:d.length}),i(`chat.illust.remove`),!0)){for(let e of d)for(let t of e.swipes)delete t.tr,t.showTr=!1;return await P(r,a),u(i(`translate.clear.done`,{count:d.length}),`ok`),!0}}function R(e){let t={},n=e||``,r=/^\s*(target|profile|preset)=("([^"]*)"|'([^']*)'|\S+)/i,i;for(;i=n.match(r);)t[i[1].toLowerCase()]=i[3]??i[4]??i[2],n=n.slice(i[0].length);return{named:t,text:n.trim()}}export{_,D as a,T as c,F as d,I as f,h as g,S as h,L as i,E as l,m,A as n,R as o,b as p,w as r,P as s,j as t,k as u,v};