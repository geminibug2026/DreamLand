import{f as e,i as t,l as n,o as r}from"./i18n-b-kfrEW5.js";import{J as i,Q as a,St as o,X as s,Y as c,d as l,mt as u}from"./engine-CHAbj7S-.js";import{l as d,ot as f}from"./actions-7mKonk0X.js";import{T as p,p as m,s as h}from"./router-BQHu17lI.js";var g=e(),_=o(),v=u();function y({d:e,size:t=18}){return(0,v.jsx)(`svg`,{viewBox:`0 0 24 24`,width:t,height:t,className:`ic`,children:(0,v.jsx)(`path`,{d:e,fill:`none`,stroke:`currentColor`,strokeWidth:1.7,strokeLinecap:`round`,strokeLinejoin:`round`})})}function b({label:e,on:t,onChange:n,hint:r,cls:i=``}){return(0,v.jsxs)(`label`,{className:`check ${i}`.trim(),children:[(0,v.jsx)(`input`,{type:`checkbox`,checked:!!t,onChange:e=>n(e.target.checked)}),(0,v.jsx)(`i`,{}),(0,v.jsx)(`span`,{children:e}),r?(0,v.jsx)(`small`,{children:r}):null]})}function x({value:e,opts:t,onChange:n,cls:r=``,title:i,disabled:a}){let o=String(e??``),s=t.some(e=>e[0]===o);return(0,v.jsx)(`select`,{className:`inp ${r}`.trim(),title:i,disabled:a,value:s?o:t[0]?.[0]??``,onChange:e=>n(e.target.value),children:t.map(([e,t])=>(0,v.jsx)(`option`,{value:e,children:t},e))})}function S({label:e,hint:t,cls:n=``,children:r}){return(0,v.jsxs)(`label`,{className:`field ${n}`.trim(),children:[(0,v.jsx)(`span`,{className:`field-label`,children:e}),r,t?(0,v.jsx)(`small`,{className:`hint`,children:t}):null]})}var C=()=>(0,g.useReducer)(e=>e+1,0)[1],w=new Map,T=e=>{let[t,...n]=e.split(`.`),r=document.createElement(t||`div`);return n.length&&(r.className=n.join(` `)),r};function E(e,t,n){let r=w.get(e);r&&setTimeout(r,0);let i=T(t),a=(0,_.createRoot)(i);return a.render(n),w.set(e,()=>a.unmount()),i}function D(e,t){let[n,...r]=(e.spec||`div`).split(`.`),i=n||`div`,a=null;return a=s({title:e.title,wide:e.wide,actions:e.actions,onClose:e.onClose,body:(0,v.jsx)(i,{className:r.join(` `)||void 0,children:t(()=>a?.close())})}),a}function O(e){if(document.querySelector(`link[rel="stylesheet"][href$="css/${e}"]`))return;let t=document.createElement(`link`);t.rel=`stylesheet`,t.href=`/css/${e}`,document.head.append(t)}var k=e=>e instanceof Error?e.message:String(e),A=e=>e instanceof Error&&e.name===`AbortError`,j=`ko|Korean|한국어
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
`).map(e=>e.split(`|`)),M=e=>{let t=String(e||``).trim().toLowerCase();return j.find(e=>e.some(e=>e.toLowerCase()===t))},N=e=>M(e)?.[1]||String(e||``).trim()||`Korean`,P=e=>{if(t()===`ko`)return e[2];if(t()===`en`)return e[1];try{let t=new Intl.DisplayNames([r()],{type:`language`}).of(e[0]===`iw`?`he`:e[0]===`jw`?`jv`:e[0]);if(t&&t!==e[0])return t}catch{}return e[1]},F=e=>{let t=M(e);return t?P(t):String(e||``).trim()},I=`# Task: Translate Text

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

Important: Your response must follow this exact format with the translation enclosed in code blocks (\`\`\`).`,L=`You are a professional translator. Follow the instructions in the user message exactly and output nothing else.`,R=()=>[[`{{language}}`,`language`],[`{{prompt}}`,`prompt`],[`{{name}}`,`name`],[`{{#each chat}}…{{/each}}`,`each`],[`{{#each (slice chat -3)}}…{{/each}}`,`slice`],[`{{context}}`,`context`],[`{{chat_1}}`,`chat1`],[`{{#if chat}}…{{else}}…{{/if}}`,`if`],[`{{user}} {{char}}`,`userChar`]].map(([e,t])=>[e,n(`translate.vars.`+t)]),z=e=>f.strip(e);function B(){let e=h.settings.translate;return Array.isArray(e.presets)&&e.presets.length||(e.presets=[{id:`default`,name:`기본`,content:I,filter:!0}],e.prompt?.trim()&&e.presets.push({id:`custom`,name:`내 지시문`,filter:!1,content:`${e.prompt.trim()}\n\n{{#if chat}}<context>\n{{context}}\n</context>\n\n{{/if}}<text>\n{{prompt}}\n</text>`}),e.preset=e.presets[e.presets.length-1].id),e.presets.some(t=>t.id===e.preset)||(e.preset=e.presets[0].id),e}var V=e=>{let t=B();return e&&t.presets.find(t=>t.id===e||t.name===e)||t.presets.find(e=>e.id===t.preset)||t.presets[0]},H=()=>h.set({translate:B(),helpers:h.settings.helpers});function U(e,t){let n=[],r=e=>(n.push(String(e??``)),`\u0000${n.length-1}\u0000`),i=t.chat||[],a={language:t.language,prompt:t.text,text:t.text,name:t.name,user:t.user,char:t.char,context:i.map(e=>`${e.name}: ${e.mes}`).join(`
`)},o=(e,t,n)=>{n=n.trim();let i=n.match(/^add\s+@index\s+(-?\d+)$/);if(i)return String(t+ +i[1]);if(n===`@index`)return String(t);let a=n.replace(/^this\.?/,``);return r(a?e[a]:e.mes)},s=e.replace(/\{\{#each\s+(?:\(\s*slice\s+chat\s+(-?\d+)\s*\)|chat)\s*\}\}([\s\S]*?)\{\{\/each\}\}/g,(e,t,n)=>(t?i.slice(+t):i).map((e,t)=>n.replace(/\{\{\s*(this(?:\.\w+)?|@index|add\s+@index\s+-?\d+)\s*\}\}/g,(n,r)=>o(e,t,r))).join(``).replace(/^\n/,``));return s=s.replace(/\{\{#if\s+(\w+)\s*\}\}([\s\S]*?)(?:\{\{else\}\}([\s\S]*?))?\{\{\/if\}\}/g,(e,t,n,r=``)=>(t===`chat`?i.length:a[t])?n:r),s=s.replace(/\{\{\s*(\w+)\s*\}\}/g,(e,t)=>{let n=t.match(/^chat_(\d+)$/);return n?r(i[i.length-+n[1]]?.mes):t in a?r(a[t]):e}),s.replace(/\u0000(\d+)\u0000/g,(e,t)=>n[+t])}var W=/^(?:[^`]*?)\n?```[\s\S]*?\n([\s\S]*?)```(?![^`]*```)/;async function G(e,t,{chat:r,context:i=[],signal:a,name:o,preset:s,conn:c}={}){let u=B(),f=V(s),g=d.current();r||=g.chat;let _=r?h.persona(r):h.get(`personas`,h.settings.activePersona);if(o==null){let t=r===g.chat?g.msgs.find(t=>z(p(t))===e):null;o=t?t.role===`user`?_?.name:t.name||h.get(`chars`,t.charId)?.name:_?.name}let v=U(f.content||`# Task: Translate Text

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

Important: Your response must follow this exact format with the translation enclosed in code blocks (\`\`\`).`,{language:N(t||u.lang),text:e,name:o||``,user:_?.name||``,char:h.get(`chars`,r?.charIds?.[0])?.name||``,chat:i.map(e=>({name:e.name,mes:String(e.text??e.mes??``).slice(0,4e3),text:String(e.text??e.mes??``).slice(0,4e3)}))}),y=await l(L,v,{maxTokens:m(+(u.maxTokens??0)||2e4,256,2e5),signal:a,conn:c||h.helperConn(`translate`,r)});if(f.filter!==!1){let e=y.match(W);e&&(y=e[1])}if(y=y.trim(),!y)throw Error(n(`translate.err.empty`));return y}var K=new Set,q=e=>document.querySelector(`article.msg[data-id="${e}"]`),J=e=>q(e)?.querySelectorAll(`.trx-btn.trx-go, .trx-btn.trx-re`).forEach(t=>t.classList.toggle(`busy`,K.has(e))),Y=(e,t,n)=>{let r=+(B().context??0)||0,i=t.indexOf(n),a=h.persona(e)?.name||``;return r&&i>0?t.slice(Math.max(0,i-r),i).filter(e=>!e.hidden).map(e=>({name:e.role===`user`?a:e.name||h.get(`chars`,e.charId)?.name||`Narrator`,text:z(p(e))})):[]},X=async(e,t)=>{d.current().chat===e?(await d.save(),d.redraw()):await h.saveMsgs(e,t)};async function Z(e,t=!1){let{chat:r,msgs:o,busy:s}=d.current(),c=e?.swipes?.[e.sw];if(!r||!e||!c)return;if(K.has(e.id))return i(n(`translate.msg.busy`));if(c.tr&&!t)return c.showTr=!c.showTr,X(r,o);if(s&&o[o.length-1]===e)return i(n(`translate.msg.wait`));let l=z(c.text||``).trim();if(!l)return i(n(`translate.msg.empty`));K.add(e.id),J(e.id);try{let t=e.role===`user`?h.persona(r)?.name:e.name||h.get(`chars`,e.charId)?.name,s=await(a.translate||G)(l,B().lang,{chat:r,context:Y(r,o,e),name:t||``}),u=d.current(),f=u.chat?.id===r.id,p=!f||u.msgs.includes(e)?e:u.msgs.find(t=>t.id===e.id),m=p===e?c:p?.swipes?.[e.swipes.indexOf(c)],g=e=>!!e&&(z(e.text||``).trim()===l||(e.text||``).trim()===l);if(!m||!g(m)||!g(c))return K.delete(e.id),J(e.id),i(n(`translate.msg.changed`));if(!f&&!h.get(`chats`,r.id))return;m.tr=s,m.showTr=!0,K.delete(e.id),await X(f?u.chat:r,f?u.msgs:o)}catch(e){A(e)||i(n(`chat.translate.fail`,{err:k(e)}),`err`)}finally{K.delete(e.id),J(e.id)}}var Q=e=>e.filter(e=>e.swipes?.some(e=>e.tr)).length;async function $(e,t,r){let{chat:a,msgs:o}=d.current();if(!a||!o.length)return i(n(`translate.clear.noMsgs`));let s=1,l=o.length;if(!r){if(s=parseInt(e??``,10),l=parseInt(t??``,10),isNaN(s)||isNaN(l))return i(n(`translate.clear.needRange`));s>l&&([s,l]=[l,s]),s=m(s,1,o.length),l=m(l,1,o.length)}let u=o.slice(s-1,l).filter(e=>e.swipes?.some(e=>e.tr));if(!u.length)return i(n(`translate.clear.noneInRange`));if(await c(r?n(`translate.clear.confirmAll`,{count:u.length}):n(`translate.clear.confirmRange`,{a:s,b:l,count:u.length}),n(`chat.illust.remove`),!0)){for(let e of u)for(let t of e.swipes)delete t.tr,t.showTr=!1;return await X(a,o),i(n(`translate.clear.done`,{count:u.length}),`ok`),!0}}function ee(e){let t={},n=e||``,r=/^\s*(target|profile|preset)=("([^"]*)"|'([^']*)'|\S+)/i,i;for(;i=n.match(r);)t[i[1].toLowerCase()]=i[3]??i[4]??i[2],n=n.slice(i[0].length);return{named:t,text:n.trim()}}export{k as C,O as D,E,C as O,x as S,D as T,P as _,U as a,S as b,V as c,Z as d,Q as f,M as g,R as h,$ as i,H as l,j as m,K as n,ee as o,I as p,B as r,X as s,q as t,G as u,F as v,A as w,y as x,b as y};