// ── Dreamland format: 마크다운 + RP 말풍선 렌더러 + HTML 정화 ──
import { esc, S } from './core';
import { t as tr, getLang } from '../i18n';
import { Server } from './server';

const BAD_TAGS = new Set(['script', 'iframe', 'object', 'embed', 'link', 'meta', 'base', 'form', 'input', 'button', 'textarea', 'select', 'frame', 'frameset', 'applet', 'title', 'head', 'html', 'body', 'noscript', 'noembed', 'noframes', 'xmp', 'plaintext', 'template', 'math', 'portal']);
const blockRemote = () => !!(S.settings as { security?: { blockRemoteImages?: boolean } }).security?.blockRemoteImages;

export function sanitize(html: string): string {
  const doc = new DOMParser().parseFromString(`<body>${html}</body>`, 'text/html');
  const walk = (node: Element) => {
    for (const el of [...node.children]) {
      const tag = el.tagName.toLowerCase();
      if (BAD_TAGS.has(tag)) { el.remove(); continue; }
      if (tag === 'style') { el.textContent = scopeCss(el.textContent); continue; }
      for (const a of [...el.attributes]) {
        // eslint-disable-next-line no-control-regex
        const n = a.name.toLowerCase(), v = a.value.toLowerCase().replace(/[\u0000-\u0020\u00a0\u200b-\u200f\u2028\u2029\ufeff]+/g, '');   // 브라우저가 주소에서 무시하는 제어 문자까지 걷고 본다
        if (n.startsWith('on') || n === 'srcdoc' || n === 'formaction') el.removeAttribute(a.name);
        else if ((n === 'href' || n === 'src' || n === 'xlink:href' || n === 'action') && /^(javascript|vbscript|data:text\/html)/.test(v)) el.removeAttribute(a.name);
        else if (n === 'style' && /expression\(|javascript:|position:fixed|@import/.test(v)) el.removeAttribute(a.name);
      }
      if (tag === 'a') { el.setAttribute('target', '_blank'); el.setAttribute('rel', 'noopener noreferrer'); }
      if (blockRemote() && ['img', 'video', 'audio', 'source'].includes(tag) && /^(https?:)?\/\//i.test(el.getAttribute('src') || '')) { const a = doc.createElement('a'); a.href = el.getAttribute('src') as string; a.textContent = tr('format.remoteImage'); a.target = '_blank'; a.rel = 'noopener noreferrer'; el.replaceWith(a); continue; }
      if (tag === 'img') el.setAttribute('referrerpolicy', 'no-referrer');
      walk(el);
    }
  };
  walk(doc.body);
  return doc.body.innerHTML;
}
// 메시지 안의 <style> 은 메시지 본문 범위로 한정
function scopeCss(cssIn: string | null): string {
  const css = String(cssIn || '').replace(/\/\*[\s\S]*?\*\//g, '').replace(/@import[^;{}]*(;|$)/gi, '').replace(/@charset[^;]*;/gi, '');
  // 규칙을 하나씩 읽어 선택자 앞에 범위를 붙인다. @media 같은 묶음은 안쪽까지, @keyframes · @font-face 는 그대로
  const scope = (sel: string) => sel.split(',').map(s => s.trim()).filter(Boolean).map(s => '.msg-body ' + s.replace(/^(html|body|:root)\b/i, '')).join(', ');
  let out = '', i = 0; const stack: string[] = [];   // 'group' 안쪽 규칙을 범위 지음 · 'raw' 그대로 둠 · 'rule' 선언 블록
  while (i < css.length) {
    const open = css.indexOf('{', i), close = css.indexOf('}', i);
    if (close >= 0 && (open < 0 || close < open)) { out += css.slice(i, close + 1); stack.pop(); i = close + 1; continue; }
    if (open < 0) { if (!stack.length) break; out += css.slice(i); break; }   // 닫히지 않은 꼬리는 버린다
    const pre = css.slice(i, open), head = pre.trim(), top = stack[stack.length - 1];
    if (top === 'raw' || top === 'rule') { out += pre + '{'; stack.push(top); }
    else if (head.startsWith('@')) { const kind = /^@(media|supports|container|layer)\b/i.test(head) ? 'group' : /^@(-webkit-)?keyframes\b|^@font-face\b/i.test(head) ? 'raw' : 'drop'; if (kind === 'drop') { let d = 1, j = open + 1; for (; j < css.length && d; j++) { if (css[j] === '{') d++; else if (css[j] === '}') d--; } i = j; continue; } out += pre + '{'; stack.push(kind); }
    else { const lead = (pre.match(/^\s*/) as RegExpMatchArray)[0]; out += lead + scope(head) + ' {'; stack.push('rule'); }
    i = open + 1;
  }
  return out + '}'.repeat(stack.length);
}

function inline(sIn: string): string {
  const keep: string[] = [];
  const stash = (html: string) => { keep.push(html); return `\u0000${keep.length - 1}\u0000`; };
  let s = sIn.replace(/`([^`\n]+)`/g, (_, c: string) => stash(`<code>${esc(c)}</code>`));
  // 원문 HTML 태그는 보존 (나중에 sanitize)
  s = s.replace(/<\/?[a-zA-Z][^<>]*>|<!--[\s\S]*?-->/g, m => stash(m));
  s = esc(s);
  s = s.replace(/!\[([^\]]*)\]\(([^)\s]+)\)/g, (_, a: string, u: string) => stash(`<img alt="${a}" src="${u}">`));
  s = s.replace(/\[([^\]]+)\]\((https?:[^)\s]+)\)/g, (_, t: string, u: string) => stash(`<a href="${u}">${t}</a>`));
  s = s.replace(/\*\*\*([^*\n]+)\*\*\*/g, '<b><i>$1</i></b>').replace(/\*\*([^*\n]+)\*\*/g, '<b>$1</b>')
    .replace(/(^|[^\w*])\*([^*\n]+)\*(?!\w)/g, '$1<i>$2</i>').replace(/(^|[^\w_])__([^_\n]+)__(?!\w)/g, '$1<u>$2</u>')
    .replace(/(^|[^\w_])_([^_\n]+)_(?!\w)/g, '$1<i>$2</i>').replace(/~~([^~\n]+)~~/g, '<s>$1</s>');
  // eslint-disable-next-line no-control-regex
  return s.replace(/\u0000(\d+)\u0000/g, (_, i: string) => keep[+i]);
}

// 대사 "..." “...” 「...」 『...』  /  생각 '...' ‘...’
const SEG = /("[^"\n]{1,}?"|“[^”\n]+”|「[^」\n]+」|『[^』\n]+』|‘[^’\n]+’|(?<![\w가-힣])'[^'\n]{2,}?'(?![\w가-힣]))/g;
const SEG1 = new RegExp(SEG.source);

const isSay = (t: string) => /^["“「『]/.test(t[0]) && /["”」』]$/.test(t), isThink = (t: string) => /^['‘]/.test(t[0]) && /['’]$/.test(t);
/** style: bubbles(지문 + 대사 말풍선) · chat(메신저: 줄마다 말풍선) · novel(소설: 말풍선 없이 대사만 강조) · plain */
/** 소설처럼 쓴 줄인지: 아주 길거나, '~다.' 로 끝나는 문장이 이어진다 (메신저 글은 짧고 마침표가 드물다) */
/** '~았다. ~었다. ~였다.' 처럼 지난 일을 적는 끝맺음인지 (받침 ㅆ + 다.) — 짧아도 지문이다. "알았다." 같은 한마디 문자는 길이로 가른다 */
const pastEnd = (s: string) => { const m = /([가-힣])다\.["”’']?$/.exec(s); return !!m && s.length >= 12 && (m[1].charCodeAt(0) - 0xac00) % 28 === 20; };
const isProse = (s: string) => s.length >= 140 || (s.match(/[가-힣]다\.(?=\s|$|["”’'])/g) || []).length >= 2 || (s.length >= 60 && /[가-힣]다\.["”’']?$/.test(s)) || pastEnd(s);
let chatProse = true;   // 긴 줄을 지문으로 볼지 (내가 쓴 글에는 적용하지 않는다)
function paragraph(line: string, style: string): string {
  if (style === 'plain' || /<[a-zA-Z/]/.test(line)) return `<p class="nar">${inline(line)}</p>`;
  if (style === 'chat') {   // 메신저: 그냥 쓴 줄 = 문자 · "…" = 소리 내어 한 말 · '…' = 속마음 · *…* 이나 소설처럼 쓴 줄 = 지문
    const t = line.trim(), one = (a: string, z: string) => t.length > 2 && !new RegExp(`[${a}${z}]`).test(t.slice(1, -1));
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

// ── 코드블럭 HTML → 격리된 iframe ──
// sandbox 에 allow-same-origin 을 주지 않으므로 안의 스크립트는 앱 저장소 · 쿠키 · 키에 닿지 못한다
const noFrames = () => !!(S.settings as { security?: { noFrames?: boolean } }).security?.noFrames;
function isPage(lang: string, code: string) {
  if (noFrames()) return false;
  // 실리태번 JS-Slash-Runner(酒馆助手)와 같은 기준: 언어 표시와 상관없이 'html>' · '<head>' · '<body' 가 든 코드 블럭은 화면으로 그린다
  if (['html>', '<head>', '<body'].some(tag => code.includes(tag))) return true;
  // 드림랜드가 예전부터 그리던 것 (html 표시이거나 표시 없는 블럭의 <script> · <!doctype> · 스타일 붙은 HTML) — 이미 쓰던 카드가 깨지지 않게 둔다
  if (lang && !/^(html?|xml)$/i.test(lang)) return false;
  return /<(!doctype|html|body|head|script)\b/i.test(code) || (/<style[\s>]/i.test(code) && /<(div|section|main|table)\b/i.test(code));
}
const frameSrc = new Map<string, string>(), frameH = new Map<string, number>();   // 화면 글 · 마지막으로 잰 높이
/** 화면(iframe)의 시작 자료와 도우미 호출을 채팅 쪽이 채운다 (src/chat/frameBridge) */
export const frameHooks: { init?: (f: HTMLIFrameElement) => unknown; call?: (f: HTMLIFrameElement, fn: string, args: unknown[]) => unknown; /** 듣기 시작 · 부름 결과 · 준비됨 알림 (src/chat/frameEvents) */ msg?: (f: HTMLIFrameElement, d: Record<string, unknown>) => void; /** 화면에 넣기 전에 글을 고친다 (알려진 외부 모듈 주소를 앱에 든 것으로) */ src?: (code: string) => string } = {};
/** 화면 글 (화면 id 로). 도우미가 화면이 쓰는 함수를 미리 살필 때 쓴다 */
export const frameSource = (id: string) => frameSrc.get(id) || '';
/** 열려 있는 모든 화면에 알린다 */
export function framePost(data: unknown) { for (const f of document.querySelectorAll<HTMLIFrameElement>('iframe.dl-frame-el')) f.contentWindow?.postMessage(data, '*'); }
const hashOf = (s: string) => { let h = 5381; for (let i = 0; i < s.length; i++) h = ((h * 33) ^ s.charCodeAt(i)) >>> 0; return h.toString(36) + s.length.toString(36); };
function framePlaceholder(code: string) {
  const id = hashOf(code); frameSrc.set(id, code); watchFrames();
  return `<div class="dl-frame" data-frame="${id}"></div>`;
}
// 화면 틀이 까는 라이브러리(jQuery · lodash · 도우미 …)의 글: 앱이 한 번만 받아 들고 있다가 틀마다 건넨다.
// 틀은 출처가 없는(sandbox) 문서라 브라우저 캐시를 함께 쓰지 못한다 — 직접 받게 하면 상태창마다 같은 파일 대여섯 개를 새로 받는다
const libMemo = new Map<string, Promise<string | null>>();
const vendorUrl = (f: string) => new URL((/\/frame(\?|$)/.test(Server.frameUrl) ? 'vendor/' : '') + f, new URL(Server.frameUrl, location.href)).href;
async function libTexts(need: unknown): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  const list = (Array.isArray(need) ? need : []).map(String).filter(f => /^[\w.-]+(\/[\w.-]+)*\.(js|css)$/.test(f) && !f.includes('..')).slice(0, 20);
  await Promise.all(list.map(async f => {
    // CSS 는 안에 다른 파일 주소(url(…))가 없을 때만 건넨다 (글꼴 · 그림을 가리키는 상대 주소는 틀 안에서 어긋난다)
    let p = libMemo.get(f); if (!p) { p = fetch(vendorUrl(f)).then(r => r.ok ? r.text() : null).then(t => t != null && f.endsWith('.css') && /url\(/i.test(t) ? null : t).catch(() => null); libMemo.set(f, p); }
    const t = await p; if (t != null) out[f] = t;   // 못 받은 것 · 건네지 않는 것은 틀이 직접 받는다
  }));
  return out;
}
/** 시작 자료를 객체 그대로 두지 못하는 브라우저인가 (화면이 알려 오면 켠다) */
let inlineInit = false;
let watching = false;
/** 화면(iframe)과 앱 사이 연결을 켠다 (메시지 밖에서 만든 화면도 쓴다) */
export function bridgeFrames() { watchFrames(); }
function watchFrames() {
  if (watching || typeof document === 'undefined') return; watching = true;
  window.addEventListener('message', e => {
    const d = e.data as { dlFrame?: unknown; dlFrameReady?: unknown; h?: number; dlCall?: number; fn?: string; args?: unknown[]; dlListen?: unknown; dlInvoked?: unknown; dlReady?: unknown; dlNeed?: unknown; dlInlineInit?: unknown } | null;
    if (!d || (d.dlFrame == null && d.dlFrameReady == null && d.dlCall == null && d.dlListen == null && d.dlInvoked == null && d.dlReady == null && d.dlNeed == null && d.dlInlineInit == null)) return;
    for (const f of document.querySelectorAll<HTMLIFrameElement>('iframe.dl-frame-el')) {
      const w = f.contentWindow; if (!w || w !== e.source) continue;
      if (d.dlListen != null || d.dlInvoked != null || d.dlReady != null) { frameHooks.msg?.(f, d as Record<string, unknown>); return; }
      if (d.dlNeed != null) { void libTexts(d.dlNeed).then(dlLibs => w.postMessage({ dlLibs }, '*')); return; }
      if (d.dlInlineInit != null) { inlineInit = true; f.src = f.src; return; }   // 이 브라우저는 시작 자료를 글로 적어야 한다: 알려 온 화면을 다시 띄운다 (글로 적은 화면은 다시 알리지 않는다)
      if (d.dlFrameReady != null) {
        frameHooks.msg?.(f, { dlReset: 1 });   // 새 문서가 떴다: 앞 문서가 듣던 이벤트는 잊는다
        const raw = frameSrc.get(f.dataset.frame || ''); if (raw == null) return;
        const src = frameHooks.src ? frameHooks.src(raw) : raw;
        void Promise.resolve(frameHooks.init?.(f)).catch(() => ({})).then(init => w.postMessage({ dlHtml: src, init: { ...(init as object || {}), libs: 1, ...(inlineInit ? { inline: 1 } : {}) } }, '*'));
      } else if (d.dlCall != null) {
        const id = d.dlCall;
        void Promise.resolve().then(() => { if (!frameHooks.call) throw new Error('not available'); return frameHooks.call(f, String(d.fn), Array.isArray(d.args) ? d.args : []); })
          .then(val => w.postMessage({ dlRet: id, ok: true, val: val === undefined ? null : val }, '*'), err => w.postMessage({ dlRet: id, ok: false, err: String((err as Error)?.message || err) }, '*'));
      } else { const h = Math.min(Math.max(40, Number(d.h) || 0), 6000); f.style.height = h + 'px'; if (f.dataset.frame) frameH.set(f.dataset.frame, h); }
      return;
    }
  });
  // 화면은 보이는 곳 근처에 올 때 만든다 — 상태창이 수십 개인 방을 열 때 한꺼번에 수십 개의 문서(jQuery · Tailwind 포함)를 띄우면 그동안 화면이 멈춘다.
  // 마지막 몇 개 메시지의 화면은 바로 만든다 (이벤트를 듣는 상태창이 늦게 뜨지 않게). 한 번 잰 높이는 기억해 두어 나중에 만들 때 자리가 튀지 않게 한다
  const mount = (el: HTMLElement) => {
    if (el.dataset.on) return; el.dataset.on = '1'; delete el.dataset.wait; io?.unobserve(el);
    const id = el.dataset.frame || '', f = document.createElement('iframe');
    f.className = 'dl-frame-el'; f.dataset.frame = id;
    f.setAttribute('sandbox', 'allow-scripts allow-popups allow-forms allow-modals'); f.setAttribute('referrerpolicy', 'no-referrer');
    const h = frameH.get(id); if (h) f.style.height = h + 'px';
    f.src = Server.frameUrl;
    el.style.minHeight = ''; el.append(f);
    if (el.closest('.msgs > article.msg')) { live.add(el); far?.observe(el); prune(); }
  };
  const io = typeof IntersectionObserver === 'undefined' ? null : new IntersectionObserver(es => { for (const e of es) if (e.isIntersecting) mount(e.target as HTMLElement); }, { rootMargin: '900px 0px' });
  // 화면에서 멀리 벗어난 메시지 속 화면은 내려놓는다 (잰 높이로 자리는 지킨다). 다시 가까이 오면 새로 띄운다 — 상태창이 수백 개인 방에서 iframe 이 끝없이 쌓여 느려지고 메모리가 모자라지 않게
  const LIVE_MAX = 12, live = new Set<HTMLElement>(), away = new Set<HTMLElement>();
  const far = typeof IntersectionObserver === 'undefined' ? null : new IntersectionObserver(es => { for (const e of es) { const el = e.target as HTMLElement; if (e.isIntersecting) away.delete(el); else if (el.dataset.on) away.add(el); } prune(); }, { rootMargin: '2500px 0px' });
  const unmount = (el: HTMLElement) => {
    live.delete(el); away.delete(el); far?.unobserve(el);
    const f = el.querySelector<HTMLIFrameElement>(':scope > iframe.dl-frame-el'); if (!f) return;
    el.style.minHeight = (frameH.get(el.dataset.frame || '') || f.offsetHeight || 160) + 'px';
    f.remove(); delete el.dataset.on; el.dataset.wait = '1'; io?.observe(el);
  };
  const prune = () => {
    for (const el of live) if (!el.isConnected) { live.delete(el); away.delete(el); far?.unobserve(el); }
    if (live.size <= LIVE_MAX || !away.size) return;
    const arts = document.querySelectorAll<HTMLElement>('.msgs > article.msg'), recent = new Set([...arts].slice(-3));
    for (const el of [...away]) { if (live.size <= LIVE_MAX) break; const art = el.closest<HTMLElement>('.msgs > article.msg'); if (art && recent.has(art)) continue; unmount(el); }
  };
  const hydrate = () => {
    queued = false;
    let recent: Set<Element> | null = null;
    for (const el of document.querySelectorAll<HTMLElement>('.dl-frame:not([data-on]):not([data-wait])')) {
      if (frameSrc.get(el.dataset.frame || '') == null) continue;
      const art = el.closest<HTMLElement>('.msgs > article.msg');
      if (art?.classList.contains('streaming')) continue;   // 답변이 흘러나오는 동안은 띄우지 않는다 (매 화면 새로 그려져 iframe 이 계속 다시 뜬다). 다 받으면 다시 그릴 때 띄운다
      recent ||= new Set([...document.querySelectorAll('.msgs > article.msg')].slice(-3));
      if (!io || !art || recent.has(art)) { mount(el); continue; }
      el.dataset.wait = '1'; el.style.minHeight = (frameH.get(el.dataset.frame || '') || 160) + 'px'; io.observe(el);
    }
  };
  // 새 화면 자리가 생겼을 때만 살핀다 (글자가 바뀔 때마다 문서 전체를 뒤지지 않게)
  let queued = false;
  const has = (n: Node) => n.nodeType === 1 && ((n as Element).classList.contains('dl-frame') || !!(n as Element).querySelector('.dl-frame'));
  new MutationObserver(recs => { if (queued) return; for (const r of recs) for (const n of r.addedNodes) if (has(n)) { queued = true; queueMicrotask(hydrate); return; } }).observe(document.body, { childList: true, subtree: true });
  setTimeout(hydrate, 0);
}

export interface RenderOpts { bubbles?: boolean; style?: string; prose?: boolean }
export function render(text: unknown, { bubbles = true, style, prose = true }: RenderOpts = {}): string {
  style ||= bubbles ? 'bubbles' : 'plain'; chatProse = prose;
  if (!text) return '';
  const lines = String(text).replace(/\r\n?/g, '\n').split('\n');
  let html = '', i = 0;
  const HTML_BLOCK = /^\s*<(div|table|details|style|section|article|center|ul|ol|pre|blockquote|figure|svg|p|h[1-6]|span|font|img|br|hr)\b/i;
  while (i < lines.length) {
    const line = lines[i];
    const fence = line.match(/^\s*(```+|~~~+)/);   // 실리태번(showdown)처럼 ``` 와 ~~~ 둘 다 코드 블럭
    if (fence) {
      const mark = fence[1], lang = line.trim().slice(mark.length).trim(), close = new RegExp('^\\s*' + (mark[0] === '`' ? '`' : '~') + '{' + mark.length + ',}\\s*$'); const buf: string[] = []; i++;
      while (i < lines.length && !close.test(lines[i])) buf.push(lines[i++]);
      i++;
      const code = buf.join('\n');
      // 실리태번 JS 러너처럼: 코드블럭 안의 HTML 문서는 격리된 화면(iframe)으로 그린다
      if (isPage(lang, code)) { html += framePlaceholder(code); continue; }
      html += `<pre><code${lang ? ` data-lang="${esc(lang)}"` : ''}>${esc(code)}</code></pre>`; continue;
    }
    if (!line.trim()) { i++; continue; }
    if (HTML_BLOCK.test(line)) { // HTML 블록은 빈 줄까지 그대로
      const buf: string[] = [];
      while (i < lines.length && lines[i].trim()) buf.push(lines[i++]);
      html += buf.join('\n').replace(/(^|>)([^<]+)(?=<|$)/g, (_m, a: string, t: string) => a + (t.trim() ? inline(t) : t)); continue;
    }
    let m: RegExpMatchArray | null;
    if ((m = line.match(/^(#{1,6})\s+(.*)$/))) { html += `<h${m[1].length}>${inline(m[2])}</h${m[1].length}>`; i++; continue; }
    if (/^\s*([-*_])\s*\1\s*\1[\s\-*_]*$/.test(line)) { html += '<hr>'; i++; continue; }
    if (/^\s*>\s?/.test(line)) {
      const buf: string[] = [];
      while (i < lines.length && /^\s*>\s?/.test(lines[i])) buf.push(lines[i++].replace(/^\s*>\s?/, ''));
      html += `<blockquote>${buf.map(l => inline(l)).join('<br>')}</blockquote>`; continue;
    }
    if (/^\s*([-*+]|\d+[.)])\s+/.test(line)) {
      const ordered = /^\s*\d/.test(line); const buf: string[] = [];
      while (i < lines.length && /^\s*([-*+]|\d+[.)])\s+/.test(lines[i])) buf.push(lines[i++].replace(/^\s*([-*+]|\d+[.)])\s+/, ''));
      html += `<${ordered ? 'ol' : 'ul'}>${buf.map(l => `<li>${inline(l)}</li>`).join('')}</${ordered ? 'ol' : 'ul'}>`; continue;
    }
    if (/^\s*\|.*\|\s*$/.test(line) && /^\s*\|[\s:|-]+\|\s*$/.test(lines[i + 1] || '')) {
      const row = (l: string) => l.trim().replace(/^\||\|$/g, '').split('|').map(c => inline(c.trim()));
      const head = row(line); i += 2; const body: string[][] = [];
      while (i < lines.length && /^\s*\|.*\|\s*$/.test(lines[i])) body.push(row(lines[i++]));
      html += `<table><thead><tr>${head.map(c => `<th>${c}</th>`).join('')}</tr></thead><tbody>${body.map(r => `<tr>${r.map(c => `<td>${c}</td>`).join('')}</tr>`).join('')}</tbody></table>`; continue;
    }
    html += paragraph(line, style); i++;
  }
  return sanitize(html);
}

// 다 쓴 글의 화면 꼴을 기억해 둔다: 같은 글 · 같은 모양이면 마크다운 풀이와 정화를 다시 하지 않는다
// (모드를 오가거나 목록을 새로 그릴 때마다 그려 둔 메시지 100개를 처음부터 꾸미지 않게). 받는 중인 글은 매번 달라지니 넣지 않는다
const kept = new Map<string, string>(); let keptSize = 0;
const KEEP_MAX = 600, KEEP_CHARS = 3_000_000;
export function renderKept(text: unknown, opts: RenderOpts = {}): string {
  if (!text) return '';
  const src = String(text);
  if (src.length > 60_000) return render(src, opts);   // 그림을 통째로 품은 아주 큰 글은 기억하지 않는다 (자리만 차지한다)
  const key = `${opts.style || (opts.bubbles === false ? 'plain' : 'bubbles')}|${opts.prose === false ? 0 : 1}${blockRemote() ? 1 : 0}${noFrames() ? 1 : 0}|${getLang()}|${src}`;
  const hit = kept.get(key);
  if (hit !== undefined) { kept.delete(key); kept.set(key, hit); return hit; }   // 방금 쓴 것을 맨 뒤로 (오래 안 쓴 것부터 버린다)
  const html = render(src, opts);
  kept.set(key, html); keptSize += key.length + html.length;
  for (const [k, v] of kept) { if (kept.size <= KEEP_MAX && keptSize <= KEEP_CHARS) break; kept.delete(k); keptSize -= k.length + v.length; }
  return html;
}
