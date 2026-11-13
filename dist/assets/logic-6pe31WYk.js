import{a as e,o as t}from"./parts-PaF_F6Dp.js";import{i as n,l as r,o as i}from"./i18n-DXcQo_Tj.js";import{ft as a,l as o}from"./actions-D045ly1A.js";import{E as s,m as c,s as l}from"./router-BN44qDmh.js";import{$ as u,Q as d,nt as f,p}from"./engine-BDwcUwWx.js";var m=`ko|Korean|한국어
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
`).map(e=>e.split(`|`)),h=e=>{let t=String(e||``).trim().toLowerCase();return m.find(e=>e.some(e=>e.toLowerCase()===t))},g=e=>h(e)?.[1]||String(e||``).trim()||`Korean`,_=e=>{if(n()===`ko`)return e[2];if(n()===`en`)return e[1];try{let t=new Intl.DisplayNames([i()],{type:`language`}).of(e[0]===`iw`?`he`:e[0]===`jw`?`jv`:e[0]);if(t&&t!==e[0])return t}catch{}return e[1]},v=e=>{let t=h(e);return t?_(t):String(e||``).trim()},y=`# Task: Translate Text

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

Important: Your response must follow this exact format with the translation enclosed in code blocks (\`\`\`).`,b=`You are a professional translator. Follow the instructions in the user message exactly and output nothing else.`,x=()=>[[`{{language}}`,`language`],[`{{prompt}}`,`prompt`],[`{{name}}`,`name`],[`{{#each chat}}…{{/each}}`,`each`],[`{{#each (slice chat -3)}}…{{/each}}`,`slice`],[`{{context}}`,`context`],[`{{chat_1}}`,`chat1`],[`{{#if chat}}…{{else}}…{{/if}}`,`if`],[`{{user}} {{char}}`,`userChar`]].map(([e,t])=>[e,r(`translate.vars.`+t)]),S=e=>a.strip(e);function C(){let e=l.settings.translate;return Array.isArray(e.presets)&&e.presets.length||(e.presets=[{id:`default`,name:`기본`,content:y,filter:!0}],e.prompt?.trim()&&e.presets.push({id:`custom`,name:`내 지시문`,filter:!1,content:`${e.prompt.trim()}\n\n{{#if chat}}<context>\n{{context}}\n</context>\n\n{{/if}}<text>\n{{prompt}}\n</text>`}),e.preset=e.presets[e.presets.length-1].id),e.presets.some(t=>t.id===e.preset)||(e.preset=e.presets[0].id),e}var w=e=>{let t=C();return e&&t.presets.find(t=>t.id===e||t.name===e)||t.presets.find(e=>e.id===t.preset)||t.presets[0]},T=()=>l.set({translate:C(),helpers:l.settings.helpers});function E(e,t){let n=[],r=e=>(n.push(String(e??``)),`\u0000${n.length-1}\u0000`),i=t.chat||[],a={language:t.language,prompt:t.text,text:t.text,name:t.name,user:t.user,char:t.char,context:i.map(e=>`${e.name}: ${e.mes}`).join(`
`)},o=(e,t,n)=>{n=n.trim();let i=n.match(/^add\s+@index\s+(-?\d+)$/);if(i)return String(t+ +i[1]);if(n===`@index`)return String(t);let a=n.replace(/^this\.?/,``);return r(a?e[a]:e.mes)},s=e.replace(/\{\{#each\s+(?:\(\s*slice\s+chat\s+(-?\d+)\s*\)|chat)\s*\}\}([\s\S]*?)\{\{\/each\}\}/g,(e,t,n)=>(t?i.slice(+t):i).map((e,t)=>n.replace(/\{\{\s*(this(?:\.\w+)?|@index|add\s+@index\s+-?\d+)\s*\}\}/g,(n,r)=>o(e,t,r))).join(``).replace(/^\n/,``));return s=s.replace(/\{\{#if\s+(\w+)\s*\}\}([\s\S]*?)(?:\{\{else\}\}([\s\S]*?))?\{\{\/if\}\}/g,(e,t,n,r=``)=>(t===`chat`?i.length:a[t])?n:r),s=s.replace(/\{\{\s*(\w+)\s*\}\}/g,(e,t)=>{let n=t.match(/^chat_(\d+)$/);return n?r(i[i.length-+n[1]]?.mes):t in a?r(a[t]):e}),s.replace(/\u0000(\d+)\u0000/g,(e,t)=>n[+t])}var D=/^(?:[^`]*?)\n?```[\s\S]*?\n([\s\S]*?)```(?![^`]*```)/;async function O(e,t,{chat:n,context:i=[],signal:a,name:u,preset:d,conn:f}={}){let m=C(),h=w(d),_=o.current();n||=_.chat;let v=n?l.persona(n):l.get(`personas`,l.settings.activePersona);if(u==null){let t=n===_.chat?_.msgs.find(t=>S(s(t))===e):null;u=t?t.role===`user`?v?.name:t.name||l.get(`chars`,t.charId)?.name:v?.name}let y=E(h.content||`# Task: Translate Text

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

Important: Your response must follow this exact format with the translation enclosed in code blocks (\`\`\`).`,{language:g(t||m.lang),text:e,name:u||``,user:v?.name||``,char:l.get(`chars`,n?.charIds?.[0])?.name||``,chat:i.map(e=>({name:e.name,mes:String(e.text??e.mes??``).slice(0,4e3),text:String(e.text??e.mes??``).slice(0,4e3)}))}),x=await p(b,y,{maxTokens:c(+(m.maxTokens??0)||2e4,256,2e5),signal:a,conn:f||l.helperConn(`translate`,n)});if(h.filter!==!1){let e=x.match(D);e&&(x=e[1])}if(x=x.trim(),!x)throw Error(r(`translate.err.empty`));return x}var k=new Set,A=e=>document.querySelector(`article.msg[data-id="${e}"]`),j=e=>A(e)?.querySelectorAll(`.trx-btn.trx-go, .trx-btn.trx-re`).forEach(t=>t.classList.toggle(`busy`,k.has(e))),M=(e,t,n)=>{let r=+(C().context??0)||0,i=t.indexOf(n),a=l.persona(e)?.name||``;return r&&i>0?t.slice(Math.max(0,i-r),i).filter(e=>!e.hidden).map(e=>({name:e.role===`user`?a:e.name||l.get(`chars`,e.charId)?.name||`Narrator`,text:S(s(e))})):[]},N=async(e,t)=>{o.current().chat===e?(await o.save(),o.redraw()):await l.saveMsgs(e,t)};async function P(n,i=!1){let{chat:a,msgs:s,busy:c}=o.current(),u=n?.swipes?.[n.sw];if(!a||!n||!u)return;if(k.has(n.id))return d(r(`translate.msg.busy`));if(u.tr&&!i)return u.showTr=!u.showTr,N(a,s);if(c&&s[s.length-1]===n)return d(r(`translate.msg.wait`));let p=S(u.text||``).trim();if(!p)return d(r(`translate.msg.empty`));k.add(n.id),j(n.id);try{let e=n.role===`user`?l.persona(a)?.name:n.name||l.get(`chars`,n.charId)?.name,t=await(f.translate||O)(p,C().lang,{chat:a,context:M(a,s,n),name:e||``}),i=o.current(),c=i.chat?.id===a.id,m=!c||i.msgs.includes(n)?n:i.msgs.find(e=>e.id===n.id),h=m===n?u:m?.swipes?.[n.swipes.indexOf(u)],g=e=>!!e&&(S(e.text||``).trim()===p||(e.text||``).trim()===p);if(!h||!g(h)||!g(u))return k.delete(n.id),j(n.id),d(r(`translate.msg.changed`));if(!c&&!l.get(`chats`,a.id))return;h.tr=t,h.showTr=!0,k.delete(n.id),await N(c?i.chat:a,c?i.msgs:s)}catch(n){t(n)||d(r(`chat.translate.fail`,{err:e(n)}),`err`)}finally{k.delete(n.id),j(n.id)}}var F=e=>e.filter(e=>e.swipes?.some(e=>e.tr)).length;async function I(e,t,n){let{chat:i,msgs:a}=o.current();if(!i||!a.length)return d(r(`translate.clear.noMsgs`));let s=1,l=a.length;if(!n){if(s=parseInt(e??``,10),l=parseInt(t??``,10),isNaN(s)||isNaN(l))return d(r(`translate.clear.needRange`));s>l&&([s,l]=[l,s]),s=c(s,1,a.length),l=c(l,1,a.length)}let f=a.slice(s-1,l).filter(e=>e.swipes?.some(e=>e.tr));if(!f.length)return d(r(`translate.clear.noneInRange`));if(await u(n?r(`translate.clear.confirmAll`,{count:f.length}):r(`translate.clear.confirmRange`,{a:s,b:l,count:f.length}),r(`chat.illust.remove`),!0)){for(let e of f)for(let t of e.swipes)delete t.tr,t.showTr=!1;return await N(i,a),d(r(`translate.clear.done`,{count:f.length}),`ok`),!0}}function L(e){let t={},n=e||``,r=/^\s*(target|profile|preset)=("([^"]*)"|'([^']*)'|\S+)/i,i;for(;i=n.match(r);)t[i[1].toLowerCase()]=i[3]??i[4]??i[2],n=n.slice(i[0].length);return{named:t,text:n.trim()}}export{_,E as a,w as c,P as d,F as f,h as g,x as h,I as i,T as l,m,k as n,L as o,y as p,C as r,N as s,A as t,O as u,v};