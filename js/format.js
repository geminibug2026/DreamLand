// ── Dreamland format: 마크다운 + RP 말풍선 렌더러 + HTML 정화 ──
import { esc, S } from './core.js';

const BAD_TAGS = new Set(['script', 'iframe', 'object', 'embed', 'link', 'meta', 'base', 'form', 'input', 'button', 'textarea', 'select', 'frame', 'frameset', 'applet', 'title', 'head', 'html', 'body', 'noscript', 'noembed', 'noframes', 'xmp', 'plaintext', 'template', 'math', 'portal']);

export function sanitize(html) {
  const doc = new DOMParser().parseFromString(`<body>${html}</body>`, 'text/html');
  const walk = node => {
    for (const el of [...node.children]) {
      const tag = el.tagName.toLowerCase();
      if (BAD_TAGS.has(tag)) { el.remove(); continue; }
      if (tag === 'style') { el.textContent = scopeCss(el.textContent); continue; }
      for (const a of [...el.attributes]) {
        const n = a.name.toLowerCase(), v = a.value.toLowerCase().replace(/[\u0000-\u0020\u00a0\u200b-\u200f\u2028\u2029\ufeff]+/g, '');   // 브라우저가 주소에서 무시하는 제어 문자까지 걷고 본다
        if (n.startsWith('on') || n === 'srcdoc' || n === 'formaction') el.removeAttribute(a.name);
        else if ((n === 'href' || n === 'src' || n === 'xlink:href' || n === 'action') && /^(javascript|vbscript|data:text\/html)/.test(v)) el.removeAttribute(a.name);
        else if (n === 'style' && /expression\(|javascript:|position:fixed|@import/.test(v)) el.removeAttribute(a.name);
      }
      if (tag === 'a') { el.setAttribute('target', '_blank'); el.setAttribute('rel', 'noopener noreferrer'); }
      if (S.settings.security?.blockRemoteImages && ['img', 'video', 'audio', 'source'].includes(tag) && /^(https?:)?\/\//i.test(el.getAttribute('src') || '')) { const a = doc.createElement('a'); a.href = el.getAttribute('src'); a.textContent = '[외부 이미지 — 눌러서 열기]'; a.target = '_blank'; a.rel = 'noopener noreferrer'; el.replaceWith(a); continue; }
      if (tag === 'img') el.setAttribute('referrerpolicy', 'no-referrer');
      walk(el);
    }
  };
  walk(doc.body);
  return doc.body.innerHTML;
}
// 메시지 안의 <style> 은 메시지 본문 범위로 한정
function scopeCss(css) {
  css = String(css || '').replace(/\/\*[\s\S]*?\*\//g, '').replace(/@import[^;{}]*(;|$)/gi, '').replace(/@charset[^;]*;/gi, '');
  // 규칙을 하나씩 읽어 선택자 앞에 범위를 붙인다. @media 같은 묶음은 안쪽까지, @keyframes · @font-face 는 그대로
  const scope = sel => sel.split(',').map(s => s.trim()).filter(Boolean).map(s => '.msg-body ' + s.replace(/^(html|body|:root)\b/i, '')).join(', ');
  let out = '', i = 0; const stack = [];   // 'group' 안쪽 규칙을 범위 지음 · 'raw' 그대로 둠 · 'rule' 선언 블록
  while (i < css.length) {
    const open = css.indexOf('{', i), close = css.indexOf('}', i);
    if (close >= 0 && (open < 0 || close < open)) { out += css.slice(i, close + 1); stack.pop(); i = close + 1; continue; }
    if (open < 0) { if (!stack.length) break; out += css.slice(i); break; }   // 닫히지 않은 꼬리는 버린다
    const pre = css.slice(i, open), head = pre.trim(), top = stack[stack.length - 1];
    if (top === 'raw' || top === 'rule') { out += pre + '{'; stack.push(top); }
    else if (head.startsWith('@')) { const kind = /^@(media|supports|container|layer)\b/i.test(head) ? 'group' : /^@(-webkit-)?keyframes\b|^@font-face\b/i.test(head) ? 'raw' : 'drop'; if (kind === 'drop') { let d = 1, j = open + 1; for (; j < css.length && d; j++) { if (css[j] === '{') d++; else if (css[j] === '}') d--; } i = j; continue; } out += pre + '{'; stack.push(kind); }
    else { const lead = pre.match(/^\s*/)[0]; out += lead + scope(head) + ' {'; stack.push('rule'); }
    i = open + 1;
  }
  return out + '}'.repeat(stack.length);
}

function inline(s) {
  const keep = [];
  const stash = html => { keep.push(html); return `\u0000${keep.length - 1}\u0000`; };
  s = s.replace(/`([^`\n]+)`/g, (_, c) => stash(`<code>${esc(c)}</code>`));
  // 원문 HTML 태그는 보존 (나중에 sanitize)
  s = s.replace(/<\/?[a-zA-Z][^<>]*>|<!--[\s\S]*?-->/g, m => stash(m));
  s = esc(s);
  s = s.replace(/!\[([^\]]*)\]\(([^)\s]+)\)/g, (_, a, u) => stash(`<img alt="${a}" src="${u}">`));
  s = s.replace(/\[([^\]]+)\]\((https?:[^)\s]+)\)/g, (_, t, u) => stash(`<a href="${u}">${t}</a>`));
  s = s.replace(/\*\*\*([^*\n]+)\*\*\*/g, '<b><i>$1</i></b>').replace(/\*\*([^*\n]+)\*\*/g, '<b>$1</b>')
    .replace(/(^|[^\w*])\*([^*\n]+)\*(?!\w)/g, '$1<i>$2</i>').replace(/(^|[^\w_])__([^_\n]+)__(?!\w)/g, '$1<u>$2</u>')
    .replace(/(^|[^\w_])_([^_\n]+)_(?!\w)/g, '$1<i>$2</i>').replace(/~~([^~\n]+)~~/g, '<s>$1</s>');
  return s.replace(/\u0000(\d+)\u0000/g, (_, i) => keep[+i]);
}

// 대사 "..." “...” 「...」 『...』  /  생각 '...' ‘...’
const SEG = /("[^"\n]{1,}?"|“[^”\n]+”|「[^」\n]+」|『[^』\n]+』|‘[^’\n]+’|(?<![\w가-힣])'[^'\n]{2,}?'(?![\w가-힣]))/g;
const SEG1 = new RegExp(SEG.source);

const isSay = t => /^["“「『]/.test(t[0]) && /["”」』]$/.test(t), isThink = t => /^['‘]/.test(t[0]) && /['’]$/.test(t);
/** style: bubbles(지문 + 대사 말풍선) · chat(메신저: 줄마다 말풍선) · novel(소설: 말풍선 없이 대사만 강조) · plain */
/** 소설처럼 쓴 줄인지: 아주 길거나, '~다.' 로 끝나는 문장이 이어진다 (메신저 글은 짧고 마침표가 드물다) */
const isProse = s => s.length >= 140 || (s.match(/[가-힣]다\.(?=\s|$|["”’'])/g) || []).length >= 2 || (s.length >= 60 && /[가-힣]다\.["”’']?$/.test(s));
let chatProse = true;   // 긴 줄을 지문으로 볼지 (내가 쓴 글에는 적용하지 않는다)
function paragraph(line, style) {
  if (style === 'plain' || /<[a-zA-Z/]/.test(line)) return `<p class="nar">${inline(line)}</p>`;
  if (style === 'chat') {   // 메신저: 그냥 쓴 줄 = 문자 · "…" = 소리 내어 한 말 · '…' = 속마음 · *…* 이나 소설처럼 쓴 줄 = 지문
    const t = line.trim(), one = (a, z) => t.length > 2 && !new RegExp(`[${a}${z}]`).test(t.slice(1, -1));
    if (/^\*[^*]+\*$/.test(t) || /^\([^)]*\)$/.test(t)) return `<p class="nar act">${inline(t.replace(/^\*|\*$/g, ''))}</p>`;
    if (isThink(t) && one("'‘", '’')) return `<div class="think"><span>${inline(t.slice(1, -1))}</span></div>`;
    if (isSay(t) && one('"“「『', '”」』')) return `<div class="say voice"><span>${inline(t)}</span></div>`;
    if (chatProse && SEG1.test(t) && isProse(t.replace(SEG, ' ').trim())) {   // 지문 사이에 대사가 낀 줄: 조각마다 나눈다
      return t.split(SEG).filter(p => p && p.trim()).map(p => { const x = p.trim(); return isSay(x) ? `<div class="say voice"><span>${inline(x)}</span></div>` : isThink(x) ? `<div class="think"><span>${inline(x.slice(1, -1))}</span></div>` : /[^\s.,!?…~\-—*]/.test(x) ? `<p class="nar">${inline(x)}</p>` : ''; }).join('');
    }
    if (chatProse && isProse(t)) return `<p class="nar">${inline(t)}</p>`;
    return `<div class="say"><span>${inline(t)}</span></div>`;
  }
  if (style === 'novel') {  // 소설: 흐름을 끊지 않고 대사와 속마음에 색만 입힌다
    if (!SEG1.test(line)) return `<p class="nar">${inline(line)}</p>`;
    return `<p class="nar">${line.split(SEG).filter(Boolean).map(p => isSay(p.trim()) ? `<span class="q">${inline(p)}</span>` : isThink(p.trim()) ? `<span class="t">${inline(p)}</span>` : inline(p)).join('')}</p>`;
  }
  if (!SEG1.test(line)) return `<p class="nar">${inline(line)}</p>`;
  const parts = line.split(SEG).filter(p => p && p.trim());
  let out = '';
  for (const p of parts) {
    const t = p.trim(), a = t[0];
    if (/^["“「『]/.test(a) && /["”」』]$/.test(t)) out += `<div class="say"><span>${inline(t.slice(1, -1))}</span></div>`;
    else if (/^['‘]/.test(a) && /['’]$/.test(t)) out += `<div class="think"><span>${inline(t.slice(1, -1))}</span></div>`;
    else if (/[^\s.,!?…~\-—*]/.test(t)) out += `<p class="nar">${inline(t)}</p>`;
  }
  return out;
}

export function render(text, { bubbles = true, style, prose = true } = {}) {
  style ||= bubbles ? 'bubbles' : 'plain'; chatProse = prose;
  if (!text) return '';
  const lines = String(text).replace(/\r\n?/g, '\n').split('\n');
  let html = '', i = 0;
  const HTML_BLOCK = /^\s*<(div|table|details|style|section|article|center|ul|ol|pre|blockquote|figure|svg|p|h[1-6]|span|font|img|br|hr)\b/i;
  while (i < lines.length) {
    const line = lines[i];
    if (/^\s*```/.test(line)) {
      const lang = line.trim().slice(3).trim(); const buf = []; i++;
      while (i < lines.length && !/^\s*```/.test(lines[i])) buf.push(lines[i++]);
      i++;
      html += `<pre><code${lang ? ` data-lang="${esc(lang)}"` : ''}>${esc(buf.join('\n'))}</code></pre>`; continue;
    }
    if (!line.trim()) { i++; continue; }
    if (HTML_BLOCK.test(line)) { // HTML 블록은 빈 줄까지 그대로
      const buf = [];
      while (i < lines.length && lines[i].trim()) buf.push(lines[i++]);
      html += buf.join('\n').replace(/(^|>)([^<]+)(?=<|$)/g, (m, a, t) => a + (t.trim() ? inline(t) : t)); continue;
    }
    let m;
    if ((m = line.match(/^(#{1,6})\s+(.*)$/))) { html += `<h${m[1].length}>${inline(m[2])}</h${m[1].length}>`; i++; continue; }
    if (/^\s*([-*_])\s*\1\s*\1[\s\-*_]*$/.test(line)) { html += '<hr>'; i++; continue; }
    if (/^\s*>\s?/.test(line)) {
      const buf = [];
      while (i < lines.length && /^\s*>\s?/.test(lines[i])) buf.push(lines[i++].replace(/^\s*>\s?/, ''));
      html += `<blockquote>${buf.map(l => inline(l)).join('<br>')}</blockquote>`; continue;
    }
    if (/^\s*([-*+]|\d+[.)])\s+/.test(line)) {
      const ordered = /^\s*\d/.test(line); const buf = [];
      while (i < lines.length && /^\s*([-*+]|\d+[.)])\s+/.test(lines[i])) buf.push(lines[i++].replace(/^\s*([-*+]|\d+[.)])\s+/, ''));
      html += `<${ordered ? 'ol' : 'ul'}>${buf.map(l => `<li>${inline(l)}</li>`).join('')}</${ordered ? 'ol' : 'ul'}>`; continue;
    }
    if (/^\s*\|.*\|\s*$/.test(line) && /^\s*\|[\s:|-]+\|\s*$/.test(lines[i + 1] || '')) {
      const row = l => l.trim().replace(/^\||\|$/g, '').split('|').map(c => inline(c.trim()));
      const head = row(line); i += 2; const body = [];
      while (i < lines.length && /^\s*\|.*\|\s*$/.test(lines[i])) body.push(row(lines[i++]));
      html += `<table><thead><tr>${head.map(c => `<th>${c}</th>`).join('')}</tr></thead><tbody>${body.map(r => `<tr>${r.map(c => `<td>${c}</td>`).join('')}</tr>`).join('')}</tbody></table>`; continue;
    }
    html += paragraph(line, style); i++;
  }
  return sanitize(html);
}
