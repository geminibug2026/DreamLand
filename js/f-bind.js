// ── Dreamland bind: 한 권으로 묶기. 대화 한 편을 인쇄용 HTML 한 파일로 ──
// 바깥 그림·스크립트를 하나도 부르지 않는다 (사진은 dataURL 로 함께 담는다). 화면·저장소를 건드리지 않는 순수 함수.
// 하나뿐인 예외: 캐릭터의 일기장 글씨체를 쓰기로 했을 때의 글꼴 link (없어도 기본 글꼴로 읽힌다).
import { moonPath, fillToPhase, pad, koDate, keyDate, WEEK, MONTHS_EN, seatOf } from './f-keepsake.js';

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const safeColor = c => /^#[0-9a-f]{3,8}$/i.test(String(c || '').trim()) ? String(c).trim() : '#2340d6';
const safeSrc = u => /^data:image\/[a-z0-9.+-]+;base64,[a-z0-9+/=\s]+$/i.test(String(u || '')) ? String(u) : '';
const md = k => { const d = keyDate(k); return `${pad(d.getMonth() + 1)}.${pad(d.getDate())}`; };

/** 메시지 글 → 단락 HTML. 태그는 걷어 내고, **굵게** *기울임* "대사" 만 살린다 */
export function fmtText(raw) {
  let s = String(raw ?? '').replace(/\r/g, '');
  s = s.replace(/<(style|script)\b[\s\S]*?<\/\1>/gi, '').replace(/<br\s*\/?>/gi, '\n').replace(/<\/?[a-zA-Z][^<>\n]*>/g, '').replace(/!\[[^\]]*\]\([^)]*\)/g, '').replace(/```[a-z]*\n?/gi, '');
  s = esc(s.trim()); if (!s) return '';
  s = s.replace(/^#{1,6}\s+(.+)$/gm, '<b>$1</b>').replace(/\*\*([^*\n]+)\*\*/g, '<b>$1</b>').replace(/(^|[^*])\*([^*\n]+)\*(?!\*)/g, '$1<i>$2</i>')
    .replace(/(&quot;[^\n]*?&quot;|“[^”\n]*”)/g, '<span class="q">$1</span>');
  return s.split(/\n{2,}/).map(p => `<p>${p.trim().replace(/\n/g, '<br>')}</p>`).join('');
}

const moon = (fill, size, cls = '') => `<svg class="moon ${cls}" viewBox="0 0 24 24" width="${size}" height="${size}" aria-hidden="true"><circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" stroke-width=".5"/><circle cx="12" cy="12" r="10" fill="url(#ht)" opacity=".5"/>${fill > 0.004 ? `<path d="${fill >= 0.996 ? 'M12 2A10 10 0 0 1 12 22A10 10 0 0 1 12 2Z' : moonPath(fillToPhase(fill))}" fill="currentColor"/>` : ''}</svg>`;
const star = (size = 12) => `<svg class="star" viewBox="0 0 24 24" width="${size}" height="${size}" aria-hidden="true"><path d="M12 1.5l2.1 8.4 8.4 2.1-8.4 2.1-2.1 8.4-2.1-8.4-8.4-2.1 8.4-2.1z" fill="currentColor"/></svg>`;
const photo = (p, cls = '') => { const src = safeSrc(p?.src); return src ? `<figure class="polaroid ${cls}"><img src="${src}" alt="">${p.title ? `<figcaption>${esc(p.title)}</figcaption>` : ''}</figure>` : ''; };

const CSS = `
:root{--ink:#14161b;--paper:#fff;--dim:#6b6f7a;--faint:#a9adb8;--line:rgba(20,22,27,.18);--accent:ACCENT;--sans:"Pretendard Variable",Pretendard,"Apple SD Gothic Neo","Malgun Gothic","Noto Sans KR","Segoe UI",system-ui,sans-serif;--display:"Outfit","Pretendard Variable",Pretendard,"Apple SD Gothic Neo","Malgun Gothic","Segoe UI",system-ui,sans-serif;
--grid:linear-gradient(var(--line) 1px,transparent 1px) 0 0/100% 7mm,linear-gradient(90deg,var(--line) 1px,transparent 1px) 0 0/7mm 100%;
--handles:linear-gradient(var(--ink),var(--ink)) 0 0/2mm 2mm no-repeat,linear-gradient(var(--ink),var(--ink)) 100% 0/2mm 2mm no-repeat,linear-gradient(var(--ink),var(--ink)) 0 100%/2mm 2mm no-repeat,linear-gradient(var(--ink),var(--ink)) 100% 100%/2mm 2mm no-repeat}
*{box-sizing:border-box}html{-webkit-print-color-adjust:exact;print-color-adjust:exact}
body{margin:0;background:#e9eaee;color:var(--ink);font:400 10.5pt/1.85 var(--sans);word-break:keep-all;overflow-wrap:anywhere}
h1,h2,h3,p,figure{margin:0}a{color:inherit;text-decoration:none}
.bar{position:sticky;top:0;z-index:5;display:flex;gap:10px;align-items:center;justify-content:space-between;padding:10px 16px;background:var(--ink);color:#fff;font-size:9.5pt}
.bar button{font:600 9.5pt var(--sans);color:var(--ink);background:#fff;border:0;padding:7px 14px;cursor:pointer}
.book{width:min(100%,PAGEW);margin:18px auto 60px;background:var(--paper);box-shadow:0 10px 40px rgba(0,0,0,.18)}
.leaf{padding:16mm 14mm 18mm;position:relative}
.leaf+.leaf{border-top:1px dashed var(--faint)}
.tag{font:600 7pt var(--display);letter-spacing:.24em;text-transform:uppercase}
.rule{display:flex;align-items:center;gap:0;height:2mm;margin:4mm 0}.rule::before,.rule::after{content:"";width:1.4mm;height:1.4mm;background:var(--ink);border-radius:50%;flex:none}.rule i{flex:1;height:.25mm;background:var(--ink)}
.moon{color:var(--ink);flex:none}.star{color:var(--accent);flex:none}
/* 표지 */
.cover{min-height:COVERH;display:flex;flex-direction:column;background:var(--grid);background-color:var(--paper)}
.cover::before{content:"";position:absolute;inset:8mm;border:.25mm solid var(--ink);background:var(--handles);background-origin:border-box;pointer-events:none;margin:-1mm}
.cover-top{display:flex;justify-content:space-between;align-items:flex-start;padding:4mm 4mm 0}
.cover-moon{position:relative;display:flex;justify-content:flex-end}.cover-moon .star{position:absolute;left:-7mm;top:3mm}.cover-moon .star+.star{left:auto;right:-3mm;top:auto;bottom:-2mm}
.cover-mid{flex:1;display:flex;flex-direction:column;justify-content:center;gap:5mm;padding:6mm 4mm}
.cover h1{font:800 27pt/1.18 var(--display);letter-spacing:-.02em;background:var(--paper);display:inline;box-decoration-break:clone;-webkit-box-decoration-break:clone;padding:0 1.5mm}
.cover .sub{font-size:11pt;color:var(--dim);background:var(--paper);align-self:flex-start;padding:0 1.5mm}
.cover .who{display:flex;align-items:center;gap:3mm;font:700 11pt var(--display);background:var(--paper);align-self:flex-start;padding:1mm 2mm;border:.25mm solid var(--ink)}
.cover .who i{font-style:normal;color:var(--accent)}
.cover-photo{align-self:flex-end;margin:0 6mm 2mm 0}
.cover-foot{display:flex;justify-content:space-between;align-items:flex-end;gap:6mm;padding:0 4mm 4mm;font:500 8pt var(--display);letter-spacing:.12em}
.cover-foot b{display:block;font:800 15pt/1 var(--display);letter-spacing:0}
.halftone{height:9mm;background:radial-gradient(var(--ink) 34%,transparent 36%) 0 0/2.2mm 2.2mm;-webkit-mask-image:linear-gradient(90deg,#000,transparent);mask-image:linear-gradient(90deg,#000,transparent);margin:0 4mm 3mm;opacity:.8}
/* 사진 */
.polaroid{display:inline-block;background:#fff;padding:2.2mm 2.2mm 7mm;border:.2mm solid var(--line);box-shadow:0 1.2mm 3mm rgba(0,0,0,.16);transform:rotate(-2deg);position:relative;max-width:62%;break-inside:avoid;margin:5mm auto 6mm}
.polaroid:nth-of-type(even){transform:rotate(1.6deg)}
.polaroid::before{content:"";position:absolute;top:-2.6mm;left:50%;width:20mm;height:5.5mm;margin-left:-10mm;background:var(--accent);opacity:.42;transform:rotate(-3deg)}
.polaroid img{display:block;width:100%;max-height:92mm;object-fit:cover}
.polaroid figcaption{position:absolute;left:2.4mm;right:2.4mm;bottom:1.2mm;font-size:7.5pt;color:var(--dim);text-align:center;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.photos{display:flex;flex-wrap:wrap;justify-content:center;gap:2mm 6mm}.photos .polaroid{max-width:44%;margin:4mm 0}
.avatar-ph{width:38mm}.avatar-ph img{max-height:none;object-fit:contain}
/* 차례 */
.toc h2,.sec-h{font:800 15pt var(--display);letter-spacing:-.01em;margin-top:1mm}
.toc ol{list-style:none;margin:5mm 0 0;padding:0}.toc li{display:flex;align-items:baseline;gap:2.5mm;padding:1.6mm 0;border-bottom:.2mm dotted var(--faint);break-inside:avoid}
.toc li>i{font:600 7.5pt var(--display);letter-spacing:.1em;font-style:normal;color:var(--dim);width:8mm;flex:none}.toc li b{font-weight:600;flex:1;min-width:0}.toc li small{font-size:7.5pt;color:var(--dim);text-align:right;flex:none;max-width:48%}
.toc li.app b{font-weight:500}
/* 장 */
.chapter>header{margin-bottom:7mm;break-after:avoid}
.chapter>header h2{font:800 18pt/1.25 var(--display);letter-spacing:-.02em;margin-top:1.5mm}
.chapter>header .sub{font-size:8.5pt;color:var(--dim)}
.msg{margin:0 0 5mm}.msg .who{display:flex;align-items:baseline;gap:2mm;font:700 7.5pt var(--display);letter-spacing:.08em;margin-bottom:.6mm;break-after:avoid}
.msg .who time{font-weight:400;color:var(--faint);letter-spacing:.04em}
.msg p{margin:0 0 2.2mm;orphans:2;widows:2}.msg p:last-child{margin-bottom:0}.msg .q{font-weight:600}.msg i{color:var(--dim)}
.msg.user{padding-left:14mm}.msg.user .who{justify-content:flex-end}.msg.user .who b::after{content:" ·"}.msg.user .txt{color:#2a2d36}
.msg.chat .txt{display:inline-block;max-width:84%;padding:2mm 3.4mm;border:.25mm solid var(--ink);border-radius:4.5mm;border-top-left-radius:1mm;line-height:1.6}
.msg.chat.user{padding-left:0;text-align:right}.msg.chat.user .txt{background:var(--ink);color:#fff;border-radius:4.5mm;border-top-right-radius:1mm;text-align:left}.msg.chat p{margin-bottom:1mm}
.msg.sys{font-size:9pt;color:var(--dim);text-align:center;padding:0 10mm}
.curtain{display:flex;align-items:center;gap:3mm;margin:8mm 0 7mm;break-inside:avoid;break-after:avoid}
.curtain::before,.curtain::after{content:"";flex:1;height:.25mm;background:var(--ink)}
.curtain div{text-align:center;max-width:70%}.curtain small{display:block;font:600 6.5pt var(--display);letter-spacing:.24em}.curtain b{font:700 10.5pt var(--display)}.curtain span{display:block;font-size:8pt;color:var(--dim)}
.curtain.close{break-after:auto}
/* 일기 · 꿈 · 편지 */
.page{position:relative;margin:9mm 0;padding:7mm 8mm 7mm 14mm;border:.25mm solid var(--ink);break-inside:avoid-page;background:var(--paper)}
.page::before{content:"";position:absolute;inset:-1mm;background:var(--handles);pointer-events:none}
.page::after{content:"";position:absolute;top:0;bottom:0;left:9mm;width:.2mm;background:var(--line)}
.page .head{display:flex;justify-content:space-between;align-items:baseline;gap:4mm}
.page .day{display:flex;align-items:flex-end;gap:3mm}.page .day b{font:800 22pt/.85 var(--display);letter-spacing:-.04em}.page .day span{font:600 7.5pt/1.35 var(--display);letter-spacing:.06em}.page .day small{display:block;font-weight:400;color:var(--dim)}
.page h3{font:800 12.5pt/1.3 var(--display);margin:3.5mm 0 1mm}
.chips{display:flex;flex-wrap:wrap;gap:1.5mm;font-size:8pt;margin-bottom:2mm}.chips span{border:.25mm solid var(--ink);border-radius:99px;padding:0 2.4mm}.chips em{font-style:normal;background:linear-gradient(transparent 58%,color-mix(in srgb,var(--accent) 30%,transparent) 58%);padding:0 1mm}
.ruled{line-height:8mm;background:repeating-linear-gradient(transparent 0 calc(8mm - .2mm),var(--line) calc(8mm - .2mm) 8mm)}.ruled p{margin:0 0 8mm}.ruled p:last-child{margin:0}
.sign{text-align:right;font:700 10pt var(--display);margin-top:3mm;transform:rotate(-1.5deg)}
.exch{margin-top:5mm;padding-top:3mm;border-top:.25mm dashed var(--ink);display:grid;gap:2.5mm}
.exch .note{color:var(--accent);font-weight:500}.exch .note small,.exch .ans small{display:block;font:600 6.5pt var(--display);letter-spacing:.2em;color:var(--dim)}
.exch .ans{justify-self:end;max-width:78%;transform:rotate(-1.2deg);border:.25mm solid var(--ink);padding:1.5mm 3mm;font-size:9.5pt;background:var(--paper)}
.dream{background:var(--ink);color:#f3f4f8;border-color:var(--ink)}.dream::after{display:none}.dream{padding-left:8mm;background-image:radial-gradient(rgba(255,255,255,.5) .25mm,transparent .3mm),radial-gradient(rgba(255,255,255,.3) .2mm,transparent .25mm);background-size:19mm 23mm,13mm 17mm;background-position:3mm 5mm,9mm 12mm}
.dream .moon{color:#f3f4f8}.dream .day small,.dream .phase{color:#b9bdcb}.dream .phase{display:flex;align-items:center;gap:1.5mm;font-size:8pt}
.stamp{display:inline-block;border:.4mm solid currentColor;padding:.4mm 2.4mm;font:700 7.5pt var(--display);letter-spacing:.16em;transform:rotate(-4deg);opacity:.85}
.dream .txt p{margin:0 0 3mm}.dream .txt{margin-top:3mm}
.letter{padding:9mm 10mm;background:var(--grid);background-color:var(--paper)}.letter::after{display:none}
.letter .inner{background:var(--paper);padding:5mm 6mm;border:.2mm solid var(--line)}.letter h3{margin-top:0}.letter .ps{margin-top:3mm;font-size:9.5pt;color:var(--dim)}
/* 기념품 */
.keep{margin:9mm 0;break-inside:avoid;display:flex;flex-direction:column;align-items:center;gap:1mm}
.ticket{display:flex;width:100%;max-width:118mm;border:.3mm solid var(--ink);background:var(--paper);position:relative}
.ticket .main{flex:1;min-width:0;padding:3.5mm 5mm 4mm;display:flex;flex-direction:column;gap:.6mm}
.ticket .main small{font:600 6.5pt var(--display);letter-spacing:.24em}.ticket .main b{font:800 13pt/1.25 var(--display)}.ticket .main span{font-size:8pt;color:var(--dim)}.ticket .main p{font-size:9pt;line-height:1.55;margin-top:1.5mm}
.ticket .stub{flex:none;width:27mm;border-left:.3mm dashed var(--ink);padding:3.5mm 2mm;display:flex;flex-direction:column;align-items:center;justify-content:space-between;text-align:center;background:radial-gradient(var(--ink) 30%,transparent 33%) 0 0/1.8mm 1.8mm;position:relative}
.ticket .stub>*{background:var(--paper);padding:0 1.2mm}.ticket .stub small{font:600 6pt var(--display);letter-spacing:.2em}.ticket .stub b{font:800 14pt/1.1 var(--display)}.ticket .stub span{font:600 7.5pt var(--display);letter-spacing:.1em}
.ticket::before,.ticket::after{content:"";position:absolute;right:calc(27mm - 1.6mm);width:3.2mm;height:3.2mm;border-radius:50%;background:var(--paper);border:.3mm solid var(--ink)}
.ticket::before{top:-1.75mm;clip-path:inset(50% 0 0 0)}.ticket::after{bottom:-1.75mm;clip-path:inset(0 0 50% 0)}
.keep .memo{font-size:9pt;color:var(--dim);max-width:110mm;text-align:center}
/* 부록 */
.months{display:grid;grid-template-columns:repeat(COLS,1fr);gap:7mm 6mm;margin-top:6mm}
.mon{break-inside:avoid}.mon header{display:flex;align-items:center;gap:2.5mm;padding-bottom:1.5mm;border-bottom:.3mm solid var(--ink);margin-bottom:1.5mm}
.mon header b{font:800 15pt/1 var(--display)}.mon header span{font:600 6.5pt/1.3 var(--display);letter-spacing:.14em;flex:1}.mon header small{display:block;font-weight:400;color:var(--dim);letter-spacing:.04em}
.mon table{width:100%;border-collapse:collapse;table-layout:fixed;font:500 7pt var(--display)}.mon th{font-weight:600;color:var(--dim);padding:.6mm 0}
.mon td{height:7.4mm;text-align:center;vertical-align:top;position:relative;color:var(--faint);padding-top:.3mm}.mon td.on{color:var(--ink);font-weight:700}
.mon td.on::after{content:"";position:absolute;left:50%;bottom:.9mm;width:var(--d,1.4mm);height:var(--d,1.4mm);margin-left:calc(var(--d,1.4mm)/-2);border-radius:50%;background:var(--ink)}
.mon td.mark::before{content:"";position:absolute;right:.8mm;top:.9mm;width:1.3mm;height:1.3mm;background:var(--accent);transform:rotate(45deg)}
.plist{width:100%;border-collapse:collapse;margin-top:5mm;font-size:9pt}.plist td{padding:1.6mm 1.5mm;border-bottom:.2mm dotted var(--faint);vertical-align:baseline}
.plist td:first-child{font:700 8pt var(--display);letter-spacing:.06em;white-space:nowrap;width:24mm}.plist td:last-child{width:14mm;text-align:right;font-size:8pt;color:var(--dim);white-space:nowrap}
.plist tr.missed td:nth-child(2){text-decoration:line-through;text-decoration-thickness:.2mm;color:var(--dim)}.plist tr.kept td:last-child{color:var(--ink);font-weight:700}
.colophon{text-align:center;font-size:8pt;color:var(--dim);display:flex;flex-direction:column;align-items:center;gap:2mm;padding-top:22mm;padding-bottom:22mm}
.colophon b{font:800 10pt var(--display);letter-spacing:.3em;color:var(--ink)}
/* 캐릭터의 손글씨 (고른 글꼴이 있을 때만) */
.hand .ruled,.hand .sign,.hand .exch .ans,.hand .dream .txt,.hand .letter .txt,.hand .letter .ps{font-family:var(--hand),var(--sans);font-size:calc(11.5pt*var(--hk,1))}
.hand .ruled,.hand .sign,.hand .exch .ans,.hand .letter .txt,.hand .letter .ps{color:var(--hand-ink,var(--ink))}
.hand .ruled{line-height:calc(8mm*var(--hl,1));background:repeating-linear-gradient(transparent 0 calc(8mm*var(--hl,1) - .2mm),var(--line) calc(8mm*var(--hl,1) - .2mm) calc(8mm*var(--hl,1)))}.hand .ruled p{margin-bottom:calc(8mm*var(--hl,1))}.hand .ruled p:last-child{margin-bottom:0}
.hand .dream .txt,.hand .letter .txt{line-height:1.6}
@page{size:PAGESIZE;margin:15mm 14mm 17mm;@bottom-center{content:counter(page);font:500 7.5pt sans-serif;color:#888}}
@page :first{margin:0;@bottom-center{content:none}}
@media print{
body{background:none}.bar{display:none}.book{width:auto;margin:0;box-shadow:none}
.leaf{padding:0;border:0!important;break-before:page}.leaf.cover{break-before:auto;height:100vh;min-height:0;padding:16mm 14mm}
.leaf.flow{break-before:auto;margin-top:12mm}
}
@media screen and (max-width:640px){.leaf{padding:9mm 6mm 11mm}.cover{min-height:150vw}.cover h1{font-size:21pt}.msg.user{padding-left:6mm}.months{grid-template-columns:repeat(2,1fr)}.polaroid{max-width:78%}.page{padding:5mm 5mm 5mm 10mm}.page::after{left:6mm}}
`;

const diaryPage = (e, sign) => {
  const d = new Date(e.ts);
  return `<section class="page diary"><div class="head"><div class="day"><b>${pad(d.getDate())}</b><span>${d.getFullYear()}년 ${d.getMonth() + 1}월<small>${WEEK[d.getDay()]}요일</small></span></div><span class="tag">Diary</span></div>
<h3>${esc(e.title || '제목 없는 밤')}</h3>${e.storyDate || e.weather || e.mood ? `<div class="chips">${e.storyDate ? `<em>${esc(e.storyDate)}</em>` : ''}${e.weather ? `<span>${esc(e.weather)}</span>` : ''}${e.mood ? `<span>${esc(e.mood)}</span>` : ''}</div>` : ''}
<div class="ruled">${fmtText(e.text)}</div><div class="sign">— ${esc(e.sign || sign)}</div>
${e.note ? `<div class="exch"><div class="note"><small>${esc(e.noteBy || '')}</small>${fmtText(e.note)}</div>${e.answer ? `<div class="ans"><small>${esc(e.sign || sign)}</small>${fmtText(e.answer)}</div>` : ''}</div>` : ''}</section>`;
};
const dreamPage = e => {
  const d = new Date(e.ts);
  return `<section class="page dream"><div class="head"><div class="day"><b>${pad(d.getDate())}</b><span>${d.getFullYear()}년 ${d.getMonth() + 1}월<small>${esc(e.phaseName || '')}${e.phaseName ? ' 뜬 밤' : ''}</small></span></div><span class="stamp">꿈 · 정사가 아님</span></div>
<h3>${esc(e.title || '이름 없는 꿈')}</h3><div class="txt">${fmtText(e.text)}</div></section>`;
};
const keepPage = k => `<section class="keep"><div class="ticket"><div class="main"><small>SCENE No. ${pad(k.no || 1)}</small><b>${esc(k.title || '이름 없는 장면')}</b>${k.place || k.time ? `<span>${esc([k.place, k.time].filter(Boolean).join(' · '))}</span>` : ''}${k.summary ? `<p>${esc(k.summary)}</p>` : ''}</div>
<div class="stub"><small>ADMIT ONE</small><b>${md(k.day)}</b><span>${esc(seatOf(k.id))}</span></div></div>${photo(k.photo ? { src: k.photo, title: k.title } : null)}${k.memo ? `<p class="memo">${esc(k.memo)}</p>` : ''}</section>`;
const letterPage = (l, sign) => `<section class="page letter"><div class="inner"><div class="head"><span class="tag">${esc(l.label || '')}</span>${moon(1, 22)}</div><h3>${esc(l.title || '이달의 편지')}</h3><div class="txt">${fmtText(l.text)}</div>${l.ps ? `<p class="ps">추신. ${esc(l.ps)}</p>` : ''}<div class="sign">— ${esc(l.sign || sign)}</div></div></section>`;
const extra = (x, sign) => x.t === 'diary' ? diaryPage(x, sign) : x.t === 'dream' ? dreamPage(x) : x.t === 'keepsake' ? keepPage(x) : x.t === 'letter' ? letterPage(x, sign) : '';

const block = b => {
  if (b.t === 'curtain') return `<div class="curtain ${b.kind === 'open' ? 'open' : 'close'}"><div><small>${b.kind === 'open' ? 'SCENE' : 'SCENE END'}</small><b>${esc(b.kind === 'open' ? (b.title || '이름 없는 장면') : (b.summary || '다시 메시지로'))}</b>${b.kind === 'open' && (b.place || b.time) ? `<span>${esc([b.place, b.time].filter(Boolean).join(' · '))}</span>` : ''}</div></div>`;
  if (b.t === 'sys') { const t = fmtText(b.text); return t ? `<div class="msg sys">${t}</div>` : ''; }
  const body = fmtText(b.text), pics = (b.photos || []).map(p => photo(p)).filter(Boolean);
  if (!body && !pics.length) return '';
  return `<div class="msg ${b.role === 'user' ? 'user' : 'ai'}${b.style === 'chat' ? ' chat' : ''}"><div class="who"><b>${esc(b.name)}</b>${b.time ? `<time>${esc(b.time)}</time>` : ''}</div>${body ? `<div class="txt">${body}</div>` : ''}${pics.length ? `<div class="photos">${pics.join('')}</div>` : ''}</div>`;
};

const monthCard = m => `<div class="mon"><header>${moon(m.fill, 26)}<b>${+m.mk.slice(5)}</b><span>${MONTHS_EN[+m.mk.slice(5) - 1]} ${m.mk.slice(0, 4)}<small>${m.active}일 / 보름 ${m.target}일</small></span>${m.full ? star(11) : ''}</header>
<table><tr>${WEEK.map(w => `<th>${w}</th>`).join('')}</tr>${m.weeks.map(w => `<tr>${w.map(c => !c.inMonth ? '<td></td>' : `<td class="${c.n ? 'on' : ''}${c.mark ? ' mark' : ''}"${c.n ? ` style="--d:${c.n >= 40 ? 2.6 : c.n >= 12 ? 2 : 1.4}mm"` : ''}>${c.d}</td>`).join('')}</tr>`).join('')}</table></div>`;

/** 책 한 권의 HTML 을 만든다. data 의 모양은 f-almanac.js 의 gatherBook 참고 */
export function buildBook(data) {
  const B = { title: '', sub: '', charName: '', userName: '', chapters: [], loose: [], letters: [], months: [], promises: [], stats: {}, page: 'A5', ...data };
  const A4 = B.page === 'A4', sign = B.charName;
  const css = CSS.replace('ACCENT', safeColor(B.accent)).replace('PAGESIZE', A4 ? 'A4' : 'A5').replace('PAGEW', A4 ? '210mm' : '168mm').replace('COVERH', A4 ? '277mm' : '222mm').replace('COLS', A4 ? '3' : '2');
  const hand = B.hand && /^[A-Za-z][A-Za-z ]{1,40}$/.test(B.hand.family || '') ? B.hand : null, num = (v, d) => { const n = +v; return isFinite(n) && n > 0.3 && n < 3 ? n : d; };
  const handLink = hand ? `<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=${hand.family.replace(/ /g, '+')}${/^:wght@[0-9;]+$/.test(hand.q || '') ? hand.q : ''}&display=swap">` : '';
  const handVars = hand ? ` class="hand" style="--hand:'${hand.family}';--hk:${num(hand.scale, 1)};--hl:${(num(hand.lh, 1) * Math.max(1, num(hand.scale, 1) * 0.85)).toFixed(3)};--hand-ink:${safeColor(hand.color)}"` : '';
  const chapters = B.chapters.filter(c => (c.blocks || []).length || (c.extras || []).length);
  const cover = safeSrc(B.cover), avatar = safeSrc(B.avatar), st = B.stats || {};
  const range = st.from && st.to ? (st.from === st.to ? koDate(st.from, { week: false }) : `${koDate(st.from, { week: false })} – ${koDate(st.to, { week: false, year: st.from.slice(0, 4) !== st.to.slice(0, 4) })}`) : '';
  const out = [];
  out.push(`<section class="leaf cover"><div class="cover-top"><span class="tag">Dreamland · ${esc(B.madeKey ? B.madeKey.replace(/-/g, '.') : '')}</span><div class="cover-moon">${star(13)}${moon(B.moonFill ?? 0.18, 92)}${star(8)}</div></div>
<div class="cover-mid"><div><h1>${esc(B.title || B.charName)}</h1></div>${B.sub ? `<p class="sub">${esc(B.sub)}</p>` : ''}<div class="who">${esc(B.charName)} <i>✦</i> ${esc(B.userName)}</div></div>
${cover ? photo({ src: cover }, 'cover-photo') : avatar ? photo({ src: avatar }, 'cover-photo avatar-ph') : ''}<div class="halftone"></div>
<div class="cover-foot"><div>${esc(range)}</div><div style="text-align:right"><b>${st.days || 0}</b>DAYS · ${st.msgs || 0} LINES</div></div></section>`);
  const appx = [B.loose.length && ['loose', '끼워 둔 것들'], B.letters.length && ['letters', '편지'], B.months.length && ['months', '달이 차오른 달력'], B.promises.length && ['promises', '약속 수첩']].filter(Boolean);
  if (chapters.length + appx.length > 1) out.push(`<section class="leaf toc"><span class="tag">Contents</span><h2>차례</h2><div class="rule"><i></i></div><ol>${chapters.map((c, i) => `<li><i>${pad(i + 1)}</i><b><a href="#c${i + 1}">${esc(c.title || `${i + 1}장`)}</a></b><small>${esc(c.sub || '')}</small></li>`).join('')}${appx.map(([id, t]) => `<li class="app"><i>✦</i><b><a href="#${id}">${t}</a></b><small></small></li>`).join('')}</ol></section>`);
  chapters.forEach((c, i) => out.push(`<section class="leaf chapter" id="c${i + 1}"><header><span class="tag">Chapter ${pad(i + 1)}</span><h2>${esc(c.title || `${i + 1}장`)}</h2>${c.sub ? `<p class="sub">${esc(c.sub)}</p>` : ''}<div class="rule"><i></i></div></header>
${(c.blocks || []).map(block).join('\n')}${(c.extras || []).map(x => extra(x, sign)).join('\n')}</section>`));
  if (B.loose.length) out.push(`<section class="leaf" id="loose"><span class="tag">Keepsakes</span><h2 class="sec-h">끼워 둔 것들</h2><div class="rule"><i></i></div>${B.loose.map(x => extra(x, sign)).join('\n')}</section>`);
  if (B.letters.length) out.push(`<section class="leaf" id="letters"><span class="tag">Letters</span><h2 class="sec-h">편지</h2><div class="rule"><i></i></div>${B.letters.map(l => letterPage(l, sign)).join('\n')}</section>`);
  if (B.months.length) out.push(`<section class="leaf" id="months"><span class="tag">Almanac</span><h2 class="sec-h">달이 차오른 달력</h2><div class="rule"><i></i></div><div class="months">${B.months.map(monthCard).join('')}</div></section>`);
  if (B.promises.length) out.push(`<section class="leaf${B.months.length ? ' flow' : ''}" id="promises"><span class="tag">Promises</span><h2 class="sec-h">약속 수첩</h2><div class="rule"><i></i></div><table class="plist">${B.promises.map(p => `<tr class="${esc(p.state)}"><td>${esc(p.date.replace(/-/g, '.'))}${p.time ? ' ' + esc(p.time) : ''}</td><td>${esc(p.what)}</td><td>${p.state === 'kept' ? '지킴 ●' : p.state === 'missed' ? '지나감 ✕' : '약속 ○'}</td></tr>`).join('')}</table></section>`);
  out.push(`<section class="leaf flow colophon">${moon(1, 20)}<b>DREAMLAND</b><span>${esc(B.charName)}와(과) ${esc(B.userName)}의 이야기 · ${esc(B.madeKey ? koDate(B.madeKey, { week: false }) : '')}에 묶음</span></section>`);
  return `<!DOCTYPE html>
<html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${esc(B.title || B.charName)}</title>${handLink}<style>${css}</style></head>
<body${handVars}><svg width="0" height="0" style="position:absolute" aria-hidden="true"><defs><pattern id="ht" width="1.6" height="1.6" patternUnits="userSpaceOnUse"><circle cx=".8" cy=".8" r=".34" fill="currentColor"/></pattern></defs></svg>
<div class="bar"><span>${esc(B.title || B.charName)} — 인쇄 창에서 "PDF로 저장"을 고르면 책 한 권이 됩니다 (${A4 ? 'A4' : 'A5'}, 배경 그래픽 켜기).</span><button type="button" onclick="window.print()">인쇄 · PDF로 저장</button></div>
<main class="book">
${out.join('\n')}
</main></body></html>`;
}
