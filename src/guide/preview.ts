// 화면 미리 그려 보기: 메시지에 보일 글(정규식을 거친 뒤)을 보이지 않는 곳에 휴대폰 · PC 너비로 실제와 같이 그려 재 본다.
// 화면(iframe)은 안에 잴 스크립트를 넣어 오류 · 넘침 · 높이 · 작은 글씨 · 작은 단추 · 보이는 글을 받고, 인라인 HTML 은 앱 문서에서 바로 잰다.
// 앱의 자료는 건드리지 않는다 (그려 본 틀은 다 재면 치운다)
import { render } from '../lib/format';

export interface FrameProbe { errors: string[]; width: number; scrollWidth: number; height: number; wide: string[]; tinyText: number; buttons: number; smallButtons: number; text: string; bad: string[] }
export interface InlineProbe { height: number; wide: string[]; tinyText: number; text: string; bad: string[] }
export interface WidthReport { width: number; screens: FrameProbe[]; screensMissing: number; inline: InlineProbe | null }

// 틀 안에서 가장 먼저 도는 잴 스크립트: 오류를 모으고, 그린 뒤 1.6초에 재서 부모에게 보낸다
const PROBE = `(function(){var E=[],seen={};function add(m){m=String(m).slice(0,240);if(!seen[m]&&E.length<8){seen[m]=1;E.push(m)}}
window.addEventListener('error',function(e){add((e.message||'error')+(e.lineno?' (line '+e.lineno+')':''))});
window.addEventListener('unhandledrejection',function(e){add('promise: '+(e.reason&&e.reason.message||e.reason))});
var oe=console.error;console.error=function(){add([].map.call(arguments,function(x){return x&&x.message||String(x)}).join(' '));return oe.apply(console,arguments)};
setTimeout(function(){var d=document.documentElement,W=d.clientWidth,wide=[],tiny=0,btn=0,small=0;
[].forEach.call(document.querySelectorAll('body *'),function(el){var r=el.getBoundingClientRect();if(!r.width&&!r.height)return;var cs=getComputedStyle(el);if(cs.visibility==='hidden'||cs.display==='none')return;
if(r.right>W+1&&wide.length<5)wide.push((el.tagName.toLowerCase()+(el.id?'#'+el.id:'')+(typeof el.className==='string'&&el.className?'.'+el.className.trim().split(/\\s+/).slice(0,2).join('.'):'')+' reaches '+Math.round(r.right)+'px'));
var own=[].some.call(el.childNodes,function(n){return n.nodeType===3&&n.textContent.trim()});if(own&&parseFloat(cs.fontSize)<11)tiny++;
if(/^(BUTTON|A|SUMMARY)$/.test(el.tagName)||el.getAttribute('role')==='button'||el.onclick||(el.tagName==='INPUT'&&/button|submit|checkbox|radio/.test(el.type))){btn++;if(r.height<32||r.width<32)small++}});
var t=(document.body&&document.body.innerText||'').replace(/\\s+/g,' ').trim(),bad=(t.match(/\\b(undefined|NaN|null|\\[object Object\\])\\b/g)||[]).slice(0,5);
parent.postMessage({dlProbe:1,errors:E,width:W,scrollWidth:Math.max(d.scrollWidth,document.body?document.body.scrollWidth:0),height:Math.max(d.scrollHeight,document.body?document.body.scrollHeight:0),wide:wide,tinyText:tiny,buttons:btn,smallButtons:small,text:t.slice(0,500),bad:bad},'*')},1600)})();`;
const PROBE_TAG = `<script>${PROBE}</script>`;

/** 글 속 화면 덩이마다 잴 스크립트를 끼운다 (<head> 나 <body> 바로 뒤, 없으면 맨 앞) */
export function withProbe(text: string): { text: string; screens: number } {
  let n = 0;
  const out = text.replace(/(^|\n)([ \t]*)(```+|~~~+)([^\n]*)\n([\s\S]*?)\n[ \t]*\3[ \t]*(?=\n|$)/g, (m, a: string, ind: string, fence: string, lang: string, code: string) => {
    const page = ['html>', '<head>', '<body'].some(t => code.includes(t)) || ((!lang.trim() || /^(html?|xml)$/i.test(lang.trim())) && (/<(!doctype|html|body|head|script)\b/i.test(code) || (/<style[\s>]/i.test(code) && /<(div|section|main|table)\b/i.test(code))));
    if (!page) return m;
    n++;
    const at = /<head[^>]*>/i.exec(code) || /<body[^>]*>/i.exec(code);
    const probed = at ? code.slice(0, at.index + at[0].length) + PROBE_TAG + code.slice(at.index + at[0].length) : PROBE_TAG + code;
    return `${a}${ind}${fence}${lang}\n${probed}\n${ind}${fence}`;
  });
  return { text: out, screens: n };
}

/** 메시지에 보일 글을 너비마다 그려 잰다 */
export async function previewText(text: string, widths = [360, 800], timeout = 7000): Promise<WidthReport[]> {
  const { text: probed, screens } = withProbe(text);
  const html = render(probed, { style: 'novel', prose: true });
  const out: WidthReport[] = [];
  for (const w of widths) {
    const box = document.createElement('div');
    box.setAttribute('aria-hidden', 'true');
    box.style.cssText = `position:fixed;left:0;top:0;width:${w}px;max-height:100vh;overflow:hidden;opacity:.001;pointer-events:none;z-index:-1;contain:layout`;   // 화면 안에 두어야 틀의 움직임(requestAnimationFrame)이 멈추지 않는다 — 거의 투명하고 뒤에 깔려 보이지 않는다
    box.innerHTML = `<div class="msg-body">${html}</div>`;
    const got: FrameProbe[] = [];
    const onMsg = (e: MessageEvent) => {
      const d = e.data as (FrameProbe & { dlProbe?: number }) | null; if (!d?.dlProbe) return;
      if (![...box.querySelectorAll('iframe')].some(f => f.contentWindow === e.source)) return;
      got.push({ errors: d.errors || [], width: d.width, scrollWidth: d.scrollWidth, height: d.height, wide: d.wide || [], tinyText: d.tinyText, buttons: d.buttons, smallButtons: d.smallButtons, text: d.text, bad: d.bad || [] });
    };
    addEventListener('message', onMsg);
    document.body.append(box);
    // 인라인 부분: 앱 문서에서 바로 잰다 (화면 틀은 빼고)
    await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
    const body = box.firstElementChild as HTMLElement, br = body.getBoundingClientRect();
    const wide: string[] = []; let tiny = 0;
    for (const el of body.querySelectorAll<HTMLElement>('*')) {
      if (el.closest('.dl-frame')) continue;
      const r = el.getBoundingClientRect(); if (!r.width && !r.height) continue;
      if (r.right > br.right + 1 && wide.length < 5) wide.push(`${el.tagName.toLowerCase()}${el.className && typeof el.className === 'string' ? '.' + el.className.trim().split(/\s+/).slice(0, 2).join('.') : ''} reaches ${Math.round(r.right - br.left)}px`);
      if ([...el.childNodes].some(n => n.nodeType === 3 && n.textContent!.trim()) && parseFloat(getComputedStyle(el).fontSize) < 11) tiny++;
    }
    const clone = body.cloneNode(true) as HTMLElement; clone.querySelectorAll('.dl-frame').forEach(x => x.remove());
    const itext = (clone.textContent || '').replace(/\s+/g, ' ').trim();
    const inline: InlineProbe | null = itext || body.querySelector(':scope > :not(.dl-frame)') ? { height: Math.round(br.height), wide, tinyText: tiny, text: itext.slice(0, 400), bad: (itext.match(/\b(undefined|NaN|null|\[object Object\])\b/g) || []).slice(0, 5) } : null;
    // 화면: 다 잴 때까지 (또는 시간이 다 될 때까지) 기다린다
    const t0 = Date.now();
    while (got.length < screens && Date.now() - t0 < timeout) await new Promise(r => setTimeout(r, 120));
    removeEventListener('message', onMsg); box.remove();
    out.push({ width: w, screens: got, screensMissing: Math.max(0, screens - got.length), inline });
  }
  return out;
}
