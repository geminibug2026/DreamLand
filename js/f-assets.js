// ── Dreamland 캐릭터 에셋: 안내문 프리셋 · 에셋 관리(링크 · 버전 · 갤러리 · 정돈) · 표시 스타일 · 도구 ──
import { S, h, download, pickFiles, readDataURL, bytesToDataURL, dataURLToBytes, mimeOf } from './core.js';
import { icon, btn, iconBtn, toast, modal, confirmBox, promptBox, avatar } from './ui.js';
import { X } from './hooks.js';
import { Assets, unzip, zip, ASSET_PROMPT } from './assets.js';
import { chatApi } from './chat.js';
const safeDecode = s => { try { return decodeURIComponent(s); } catch { return s; } };

document.head.append(h('link', { rel: 'stylesheet', href: 'css/f-assets.css' }));

// ════════ 안내문 프리셋 ════════
const DEFAULT_IMAGE_PROMPT = `### Prompt Instruction for Image Tag Insertion

When writing your reply, insert up to {{max}} internal image tag(s), placed between paragraphs (i.e., after a full paragraph has ended). Follow these guidelines precisely:

1. Tag Format:
   Always use the format \`{{img::keyword}}\` on its own line — this is a custom tag format used specifically for internal assets.
   - Write the keyword exactly as it appears in the list, without any file extension.
   - Do NOT use standard HTML tags like \`<img src="...">\` or markdown images — those are reserved for external images.
   - Example (correct): \`{{img::steampunk_city}}\`
   - Incorrect: \`<img src="steampunk_city.jpg">\`

2. Placement Limitation:
   - Insert no more than {{max}} image tag(s) per response.
   - Insert only if the image enhances the reader's understanding, mood, or emotional tone of the paragraph.
   - Each tag must be placed after a full paragraph ends, not mid-sentence.

3. Context Matching:
   Evaluate the content of each paragraph.
   If a keyword from the list clearly matches the subject, tone, or setting, insert the corresponding image tag after that paragraph.
   - If no keyword fits the context, skip insertion.

4. Avoiding Repetition:
   - Do not repeat the same keyword multiple times across recent responses.
   - Rotate and diversify your choices whenever possible.

5. Keyword List:
The available keywords are: \`{{img_keywords}}\`
(Grouped view: \`{{img_keywords_grouped}}\` — \`name_[1, 2]\` means the variants \`name_1\` and \`name_2\`.)
- Use only the exact keywords from the list.
- Do not guess, invent, or modify keywords.
`;
const DEFAULT_PRESETS = [
  { name: '기본 프리셋', prompt: DEFAULT_IMAGE_PROMPT },
  { name: '1:1 감정/표정형', prompt: `### Character Asset Direction

Use internal image tags to emphasize the character's emotional state in a 1:1 chat.

- Insert at most 1 image tag per response.
- Place it on its own line after a complete paragraph, never inside a sentence.
- Prefer expressions, gestures, outfits, or close-up mood images.
- Use only exact keywords from this list: {{img_keywords}}
- Format: {{img::keyword}}
- If no image clearly fits, do not insert a tag.` },
  { name: '시뮬레이션/장소·아이템형', prompt: `### Simulation Asset Direction

Use internal image tags as scene, location, item, UI, or event illustrations for simulation-style play.

- Insert up to {{max}} image tags per response when they clarify the scene or state change.
- Place each tag on its own line after a full paragraph.
- Prioritize locations, important items, maps, status screens, CGs, and major event images.
- Use only exact keywords from this list: {{img_keywords}}
- Format: {{img::keyword}}
- If no image is relevant, skip image insertion.` },
];
const MACROS = [['{{img_keywords}}', '쓸 수 있는 이름 목록 (묶음 모드면 번호를 뗀 이름)'], ['{{img_keywords_grouped}}', '묶어서 적은 목록 · angry_[1, 2, 3], happy'], ['{{img_count}}', '켜져 있는 에셋 수'], ['{{max}}', '답변당 최대 개수'], ['{{img_rand::머리말}}', '그 말로 시작하는 에셋 이름 하나를 무작위로'], ['{{img_resolve::이름}}', '실제로 쓰일 에셋 이름 (없으면 빈칸)'], ['{{charkey}}', '에셋을 가져오는 캐릭터 이름 (링크 · 버전 반영)'], ['{{img_inprompt}}', '이 안내문 전체 · 프리셋이나 캐릭터 설명에 직접 넣을 때']];
const STYLES = [['plain', '그대로', '꾸밈 없이'], ['ink', '가는 선', '여백과 선 한 줄'], ['print', '인화 사진', '흰 인화지 테두리'], ['polaroid', '폴라로이드', '아래 여백 · 살짝 기울임'], ['tape', '마스킹테이프', '테이프로 붙인 사진'], ['corner', '사진 모서리', '앨범에 끼운 모습'], ['stamp', '우표', '톱니 가장자리'], ['film', '필름', '구멍 뚫린 필름 띠'], ['shadow', '떠 있는', '부드러운 그림자'], ['float-left', '글 왼쪽', '글이 감싸고 흐름'], ['float-right', '글 오른쪽', '글이 감싸고 흐름']];
const DEFAULTS = { depth: 2, style: 'ink', maxSize: 400, lazy: true, zoom: true, webp: false, confirmOverwrite: true };

function cfg() {
  const c = S.settings.assets;
  if (!Array.isArray(c.presets) || !c.presets.length) {
    c.presets = DEFAULT_PRESETS.map((p, i) => ({ id: 'd' + i, ...p }));
    if (c.prompt?.trim()) { c.presets.push({ id: 'custom', name: '내 안내문', prompt: c.prompt }); c.preset = 'custom'; }
  }
  if (!c.presets.some(p => p.id === c.preset)) c.preset = c.presets[0].id;
  if (!c.chars || typeof c.chars !== 'object') c.chars = {};
  if (!c.ui || typeof c.ui !== 'object') c.ui = {};
  for (const [k, d] of Object.entries(DEFAULTS)) if (c[k] === undefined) c[k] = d;
  return c;
}
const save = () => S.set({ assets: cfg() });
const presetOf = () => { const c = cfg(); return c.presets.find(p => p.id === c.preset) || c.presets[0]; };
const charCfg = id => { const c = cfg(), cc = (c.chars[id] ||= { link: '', ver: '', vers: [] }); if (!Array.isArray(cc.vers)) cc.vers = []; return cc; };
const ownersOf = (chat, persona) => chat ? [...chat.charIds.map(Assets.ownerOfChar), Assets.ownerOfPersona((persona || S.persona(chat))?.id)] : [];
const charKey = id => { if (!id) return ''; const o = Assets.ownerOfChar(id), src = S.get('chars', Assets.source(o).slice(5)), v = Assets.verOf(o); return (src?.name || '') + (v ? '/' + v : ''); };
const randOf = (owners, prefix) => { const k = String(prefix || '').trim().toLowerCase(); if (!k) return ''; const hit = owners.flatMap(o => Assets.active(o)).filter(a => a.name.startsWith(k)); return hit.length ? hit[Math.floor(Math.random() * hit.length)].name : ''; };

/** 안내문의 빈칸 채우기 */
function renderPrompt(owners, charId, text = presetOf().prompt) {
  const c = cfg();
  const v = { img_keywords: () => Assets.names(owners).join(', '), img_keywords_autogen: () => Assets.names(owners).join(', '), img_keywords_grouped: () => Assets.grouped(owners) || Assets.names(owners).join(', '), keywords: () => Assets.keywords(owners), img_count: () => String(Assets.count(owners)), max: () => String(c.max || 2), charkey: () => charKey(charId) };
  return String(text || ASSET_PROMPT).replace(/\{\{(img_keywords_autogen|img_keywords_grouped|img_keywords|img_count|keywords|max|charkey)\}\}/gi, (m, k) => v[k.toLowerCase()]())
    .replace(/\{\{img_rand::([^{}]+)\}\}/gi, (m, p) => randOf(owners, p)).replace(/\{\{img_resolve::([^{}]+)\}\}/gi, (m, n) => Assets.resolve(owners, n)?.name || '');
}

// ── 프롬프트에 싣기 (studio.js 의 기본 조각을 대신한다) ──
X.prompt = X.prompt.filter(p => p.owner !== 'assets');
X.prompt.push({ owner: 'assets', fn: ({ chat, persona }) => {
  const c = cfg(); if (!c.inject) return [];
  const owners = ownersOf(chat, persona); if (!Assets.count(owners)) return [];
  return [{ where: 'depth', depth: Math.max(0, +c.depth || 0), order: 40, content: renderPrompt(owners, chat.charIds[0]), src: `에셋 안내문 (${presetOf().name})` }];
} });

// ── 매크로 ──
const here = () => { const { chat } = chatApi.current(); return { owners: ownersOf(chat), charId: chat?.charIds?.[0] || '' }; };
const macro = (name, fn) => X.macros.set(name, { owner: 'assets', fn });
macro('img_keywords', () => Assets.names(here().owners).join(', '));
macro('img_keywords_autogen', () => Assets.names(here().owners).join(', '));
macro('img_keywords_grouped', () => { const o = here().owners; return Assets.grouped(o) || Assets.names(o).join(', '); });
macro('img_count', () => String(Assets.count(here().owners)));
macro('img_rand', args => randOf(here().owners, args[0]));
macro('img_resolve', args => Assets.resolve(here().owners, args[0] || '')?.name || '');
macro('img_inprompt', () => { const { owners, charId } = here(); return Assets.count(owners) ? renderPrompt(owners, charId) : ''; });
macro('charkey', () => charKey(here().charId));

// ════════ 아이콘 · 작은 도우미 ════════
const svg = (d, size = 18) => { const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); s.setAttribute('viewBox', '0 0 24 24'); s.setAttribute('width', size); s.setAttribute('height', size); s.classList.add('ic'); s.innerHTML = `<path d="${d}" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/>`; return s; };
const I = {
  tag: 'M3 12V4h8l10 10-8 8zM7.5 8.5h.01', link: 'M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1',
  layers: 'M12 3l9 5-9 5-9-5zM3 12.5l9 5 9-5M3 17l9 5 9-5', grid: 'M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z', broom: 'M19 3l-7 7M9.5 9.5l5 5M8 11l5 5-3 5H4l-1-6z',
  down: 'M12 4v11M7 11l5 5 5-5M5 20h14', zip: 'M6 3h9l4 4v14H6zM14 3v5h5M10 11h2M10 14h2M10 17h2', checks: 'M2 13l4 4 8-9M12 16l1 1 8-9',
};
const sbtn = (label, d, onclick, cls = '', title = '') => h(`button.btn${cls ? '.' + cls.split(' ').join('.') : ''}`, { type: 'button', onclick, title: title || null }, svg(d), label && h('span', label));
const tiny = (node, title, onclick, cls = '') => h(`button.ibtn.tiny${cls ? '.' + cls : ''}`, { type: 'button', title, 'aria-label': title, onclick }, node);
const check = (label, on, onchange, hint) => h('label.check', h('input', { type: 'checkbox', checked: !!on, onchange: e => onchange(e.target.checked) }), h('i'), h('span', label), hint && h('small', hint));
const select = (value, opts, onchange, cls = '') => h(`select.inp${cls}`, { onchange: e => onchange(e.target.value) }, opts.map(([v, l]) => h('option', { value: v, selected: String(value ?? '') === String(v) }, l)));
const sec = (ic, title, desc, ...side) => h('div.ast-sec-head', h('div', h('h4', ic, title), desc && h('p', desc)), side.length ? h('div.ast-actions', side) : null);
async function copy(text, msg) {
  try { await navigator.clipboard.writeText(text); }
  catch { const t = h('textarea', { value: text, style: { position: 'fixed', opacity: 0 } }); document.body.append(t); t.select(); try { document.execCommand('copy'); } catch { } t.remove(); }
  toast(msg);
}
const extOf = dataUrl => ({ 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'image/gif': 'gif', 'image/avif': 'avif' }[String(dataUrl).slice(5, String(dataUrl).indexOf(';'))] || 'png');
const safeFile = s => String(s || 'assets').replace(/[\\/:*?"<>|]+/g, '_').trim() || 'assets';
const SAMPLE = 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="320" height="400" viewBox="0 0 160 200"><rect width="160" height="200" fill="#e9e9ee"/><circle cx="104" cy="62" r="30" fill="#1f2a5c"/><circle cx="116" cy="54" r="26" fill="#e9e9ee"/><path d="M0 200V150l42-44 34 32 28-22 56 52v32z" fill="#c9cbd6"/><path d="M36 40l3 9 9 3-9 3-3 9-3-9-9-3 9-3z" fill="#1f2a5c"/></svg>');

// ════════ 올리기 ════════
/** 고른 파일(이미지 · ZIP)을 한 줄로 펼친다 */
async function gather(files) {
  const out = [];
  for (const f of files) {
    if (/\.zip$/i.test(f.name)) { for (const z of await unzip(await f.arrayBuffer())) if (Assets.IMG.test(z.name) && !/(^|\/)(__MACOSX\/|\._)/.test(z.name)) out.push({ fileName: z.name.split('/').pop(), mime: mimeOf(z.name), load: async () => bytesToDataURL(z.data, mimeOf(z.name)) }); }
    else if (f.type?.startsWith('image/') || Assets.IMG.test(f.name)) out.push({ fileName: f.name, mime: f.type || mimeOf(f.name), load: () => readDataURL(f) });
  }
  return out;
}
/** PNG · JPEG 를 WebP 로 (더 커지면 원본을 쓴다. GIF 는 건드리지 않는다) */
function toWebp(dataUrl, mime) {
  if (!cfg().webp || !/image\/(png|jpe?g)/.test(mime)) return Promise.resolve(dataUrl);
  return new Promise(res => {
    const img = new Image();
    img.onload = () => { try { const cv = document.createElement('canvas'); cv.width = img.naturalWidth; cv.height = img.naturalHeight; cv.getContext('2d').drawImage(img, 0, 0); const out = cv.toDataURL('image/webp', 0.9); res(out.startsWith('data:image/webp') && out.length < dataUrl.length ? out : dataUrl); } catch { res(dataUrl); } };
    img.onerror = () => res(dataUrl); img.src = dataUrl;
  });
}
async function upload(owner, ver, files, onProgress = () => { }) {
  let items;
  try { items = await gather(files); } catch (e) { toast('파일을 읽지 못했어요: ' + e.message, 'err'); return 0; }
  if (!items.length) { toast('넣을 이미지가 없어요 (PNG · JPEG · WebP · GIF · ZIP)'); return 0; }
  await Assets.load([owner]);
  if (cfg().confirmOverwrite) {
    const have = new Set(Assets.inVer(owner, ver).map(a => a.name)), dup = [...new Set(items.map(i => Assets.cleanName(i.fileName)).filter(n => have.has(n)))];
    if (dup.length && !(await confirmBox(`이미 있는 이름 ${dup.length}개를 덮어씁니다: ${dup.slice(0, 5).join(', ')}${dup.length > 5 ? ` 외 ${dup.length - 5}개` : ''}`, '덮어쓰기', true))) return 0;
  }
  let n = 0, fail = 0;
  for (const it of items) {
    try { const data = await toWebp(await it.load(), it.mime); if (!data) throw new Error('빈 파일'); await Assets.add(owner, it.fileName, data, { ver }); n++; }
    catch (e) { console.warn('[에셋 올리기]', it.fileName, e); fail++; }
    onProgress(n + fail, items.length);
  }
  toast(`에셋 ${n}개를 넣었어요${fail ? ` · ${fail}개 실패` : ''}`, n ? 'ok' : 'err');
  return n;
}
async function uploadFromUrl(owner, ver, url, label) {
  url = String(url || '').trim();
  if (!/^https?:\/\//i.test(url)) { toast('http(s) 로 시작하는 이미지 주소를 적어 주세요', 'err'); return 0; }
  let blob;
  try { const r = await fetch(url); if (!r.ok) throw new Error('HTTP ' + r.status); blob = await r.blob(); }
  catch (e) { toast('이미지를 받아 오지 못했어요 (그 사이트가 다른 곳에서의 요청을 막았을 수 있어요): ' + e.message, 'err'); return 0; }
  const fromUrl = safeDecode(url.split(/[?#]/)[0].split('/').pop() || '');
  const mime = blob.type?.startsWith('image/') ? blob.type : Assets.IMG.test(fromUrl) ? mimeOf(fromUrl) : '';
  if (!mime) { toast('이미지 파일이 아니에요', 'err'); return 0; }
  const name = (label || Assets.keyOf(fromUrl) || 'image') + '.' + (mime.split('/')[1] || 'png').replace('jpeg', 'jpg');
  return upload(owner, ver, [new File([blob], name, { type: mime })]);
}

// ════════ 크게 보기 ════════
function lightbox(items, index = 0, { tag = true } = {}) {
  if (!items.length) return;
  let i = Math.max(0, index);
  const img = h('img'), cap = h('figcaption');
  const show = () => { const a = items[i]; img.src = a.data; img.alt = a.name; cap.replaceChildren(h('b', a.name), h('span', `${i + 1} / ${items.length}`), ...(tag ? [tiny(svg(I.tag, 14), '{{img::이름}} 태그 복사', e => { e.stopPropagation(); copy(`{{img::${a.name}}}`, '태그를 복사했어요'); })] : [])); };
  const step = d => { i = (i + d + items.length) % items.length; show(); };
  const close = () => { wrap.remove(); document.removeEventListener('keydown', key, true); };
  const key = e => {
    if (e.key === 'Escape') close(); else if (e.key === 'ArrowLeft') step(-1); else if (e.key === 'ArrowRight') step(1); else return;
    e.preventDefault(); e.stopPropagation();
  };
  const many = items.length > 1;
  const wrap = h('div.ast-lb', { onclick: e => { if (e.target === wrap || e.target.tagName === 'FIGURE') close(); } },
    iconBtn('x', '닫기 (Esc)', close, 'ast-lb-x'),
    many && iconBtn('left', '이전 (←)', () => step(-1), 'ast-lb-nav prev'),
    h('figure', img, cap),
    many && iconBtn('right', '다음 (→)', () => step(1), 'ast-lb-nav next'));
  let x0 = null;
  wrap.addEventListener('touchstart', e => { x0 = e.touches[0].clientX; }, { passive: true });
  wrap.addEventListener('touchend', e => { if (x0 == null || !many) return; const dx = e.changedTouches[0].clientX - x0; x0 = null; if (Math.abs(dx) > 50) step(dx < 0 ? 1 : -1); });
  document.addEventListener('keydown', key, true);
  (document.getElementById('modals') || document.body).append(wrap); show();
}
// 대화 속 에셋 그림을 누르면 크게
document.addEventListener('click', e => {
  const img = e.target.closest?.('.msg-body .asset-img'); if (!img || cfg().zoom === false) return;
  const all = [...img.closest('.msg-body').querySelectorAll('.asset-img')];
  lightbox(all.map(x => ({ name: x.alt || '', data: x.src })), all.indexOf(img), { tag: false });
});

// ════════ 갤러리 ════════
function openGallery(owner, ver, title, { locked = false, onChange = () => { } } = {}) {
  const c = cfg(); let q = '', size = c.ui.grid || 'medium', selecting = false; const picked = new Set();
  const grid = h('div.ast-gal'), count = h('b', '0');
  const delBtn = h('button.btn.danger.ast-gal-del', { type: 'button', title: '선택 삭제', onclick: async () => {
    const hit = Assets.inVer(owner, ver).filter(a => picked.has(a.id)); if (!hit.length) return toast('삭제할 에셋을 먼저 골라 주세요');
    if (!(await confirmBox(`고른 에셋 ${hit.length}개를 삭제할까요? 되돌릴 수 없어요.`, '삭제', true))) return;
    for (const a of hit) await Assets.remove(a);
    picked.clear(); toast(`에셋 ${hit.length}개를 삭제했어요`, 'ok'); draw(); onChange();
  } }, icon('trash'), count);
  const selBtn = h('button.ibtn.ast-gal-sel', { type: 'button', title: '선택 모드', onclick: () => { if (locked) return toast('에셋 링크를 쓰는 동안에는 삭제할 수 없어요'); selecting = !selecting; picked.clear(); draw(); } }, svg(I.checks));
  const draw = () => {
    const shown = Assets.inVer(owner, ver).filter(a => !q || a.name.includes(q));
    grid.className = 'ast-gal ' + size + (selecting ? ' selecting' : '');
    selBtn.classList.toggle('on', selecting); delBtn.style.display = selecting ? '' : 'none'; count.textContent = String(picked.size);
    grid.replaceChildren(...(shown.length ? shown.map((a, i) => h(`button.ast-gal-item${picked.has(a.id) ? '.picked' : ''}${a.disabled ? '.off' : ''}`, { type: 'button', title: a.name, onclick: () => { if (selecting) { picked.has(a.id) ? picked.delete(a.id) : picked.add(a.id); draw(); } else lightbox(shown, i); } },
      h('span.ast-gal-img', h('img', { src: a.data, alt: a.name, loading: 'lazy' })), h('span.ast-gal-cap', a.name), h('i.ast-gal-mark'))) : [h('p.dim.ast-empty', q ? '찾는 에셋이 없어요.' : '에셋이 없어요.')]));
  };
  modal({ title, wide: true, body: h('div.ast-galbox',
    h('div.ast-gal-filter',
      h('div.search-wrap', icon('search', 16), h('input.inp', { placeholder: '이름으로 찾기…', oninput: e => { q = e.target.value.trim().toLowerCase(); draw(); } })),
      select(size, [['small', 'S'], ['medium', 'M'], ['large', 'L']], v => { size = v; c.ui.grid = v; save(); draw(); }, '.auto'),
      selBtn, delBtn),
    grid) });
  draw();
}

// ════════ 이름 정돈 ════════
const TIDY = [['space', '공백 → 언더바(_)', '이름 속 공백을 언더바로', true], ['special', '특수문자 제거', '영문 · 숫자 · 한글 · 언더바 · 하이픈만 남김', true], ['clean', '언더바 정리', '겹친 언더바와 앞뒤 언더바 제거', true], ['lower', '소문자로', '영문을 모두 소문자로', true], ['dot', '점(.) → 언더바(_)', 'name.1 → name_1 로 통일', true], ['bare', '이름숫자 → 이름_숫자', 'angry1 → angry_1 (한 묶음으로 인식됩니다)', false]];
function tidyName(name, o) {
  let b = name;
  if (o.space) b = b.replace(/\s+/g, '_');
  if (o.dot) b = b.replace(/\./g, '_');
  if (o.special) b = b.replace(o.dot ? /[^\w가-힣_-]/g : /[^\w가-힣_.-]/g, '');
  if (o.clean) b = b.replace(/_+/g, '_').replace(/^_|_$/g, '');
  if (o.lower) b = b.toLowerCase();
  if (o.bare) b = b.replace(/([a-zA-Z가-힣])(\d+)$/, '$1_$2');
  return b;
}
function smartRename(owner, ver, onDone) {
  const list = Assets.inVer(owner, ver);
  if (!list.length) return toast('정돈할 에셋이 없어요');
  const o = Object.fromEntries(TIDY.map(([k, , , d]) => [k, d])), preview = h('div.ast-tidy-list'), sum = h('b');
  const plan = () => {
    const taken = new Set(list.map(a => a.name)), out = [];
    for (const a of list) { const n = tidyName(a.name, o); if (!n || n === a.name) continue; const clash = taken.has(n); if (!clash) { taken.delete(a.name); taken.add(n); } out.push({ a, n, clash }); }
    return out;
  };
  const draw = () => {
    const p = plan(), ok = p.filter(x => !x.clash).length;
    sum.textContent = p.length ? `${ok}개 바뀜${p.length - ok ? ` · ${p.length - ok}개는 같은 이름이 있어 건너뜀` : ''}` : '바뀔 이름이 없어요';
    preview.replaceChildren(...p.slice(0, 40).map(x => h(`div.ast-tidy-row${x.clash ? '.clash' : ''}`, h('span', x.a.name), h('i', '→'), h('span', x.n))), ...(p.length > 40 ? [h('div.ast-tidy-row.more', `… 외 ${p.length - 40}개`)] : []));
  };
  modal({ title: '이름 정돈', body: h('div.ast-tidy',
    h('p.hint', '고른 규칙으로 이 버전의 에셋 이름을 한꺼번에 다듬습니다.'),
    TIDY.map(([k, label, hint]) => h(`label.check.ast-tidy-opt${k === 'dot' || k === 'bare' ? '.key' : ''}`, h('input', { type: 'checkbox', checked: o[k], onchange: e => { o[k] = e.target.checked; draw(); } }), h('i'), h('span', h('strong', label), h('small', hint)))),
    h('div.ast-tidy-sum', sum), preview),
  actions: [{ label: '취소' }, { label: '적용', cls: 'primary', onclick: async () => {
    const p = plan().filter(x => !x.clash); let n = 0;
    for (const x of p) { try { await Assets.update({ ...x.a, name: x.n }); n++; } catch (e) { console.warn('[이름 정돈]', e); } }
    toast(n ? `정돈 완료: ${n}개 변환` : '바뀐 이름이 없어요', n ? 'ok' : ''); onDone();
  } }] });
  draw();
}

// ════════ 에셋 관리판 (캐릭터 · 페르소나 공용) ════════
function manager(owner, { ver = '', src = owner, locked = false, lockMsg = '', title = '에셋', onChange = () => { } } = {}) {
  const c = cfg(); let q = ''; const picked = new Set();
  const grid = h('div.ast-grid'), selAll = h('input', { type: 'checkbox' }), selInfo = h('span.ast-selinfo'), bar = h('i'), prog = h('div.ast-prog', bar);
  const guard = () => { if (locked) toast(lockMsg || '지금은 바꿀 수 없어요'); return locked; };
  const changed = () => { drawGrid(); onChange(); };
  const progress = (n, total) => { prog.classList.toggle('on', n < total); bar.style.width = Math.round(n / total * 100) + '%'; };
  const add = async files => { if (guard() || !files.length) return; prog.classList.add('on'); bar.style.width = '4%'; try { await upload(owner, ver, files, progress); } finally { prog.classList.remove('on'); } changed(); };
  const rename = async a => {
    if (guard()) return;
    const v = await promptBox('에셋 이름', a.name); if (v == null) return;
    const name = Assets.cleanName(v); if (!name || name === a.name) return;
    if (Assets.inVer(src, ver).some(x => x.name === name)) return toast('같은 이름의 에셋이 이미 있어요', 'err');
    await Assets.update({ ...a, name }); changed();
  };
  const fileRow = a => h(`div.ast-file${a.disabled ? '.off' : ''}`,
    h('span.ast-fname', { title: a.name }, a.name),
    tiny(svg(I.tag, 14), '{{img::이름}} 태그 복사', () => copy(`{{img::${a.name}}}`, `{{img::${a.name}}} 복사했어요`)),
    tiny(icon('edit', 14), '이름 바꾸기', () => rename(a)),
    tiny(icon(a.disabled ? 'eyeoff' : 'eye', 14), a.disabled ? '다시 쓰기' : '쓰지 않기', async () => { if (guard()) return; await Assets.update({ ...a, disabled: !a.disabled }); changed(); }),
    tiny(icon('trash', 14), '삭제', async () => { if (guard()) return; if (!(await confirmBox(`"${a.name}" 에셋을 삭제할까요?`, '삭제', true))) return; await Assets.remove(a); picked.delete(a.id); changed(); }, 'bad'));
  const groupCard = (base, files) => {
    const on = files.filter(a => !a.disabled), first = on[0] || files[0];
    return h(`div.ast-group${on.length ? '' : '.off'}`,
      h('button.ast-thumb', { type: 'button', title: '크게 보기', onclick: () => lightbox(files, files.indexOf(first)) }, h('img', { src: first.data, alt: first.name, loading: 'lazy' }), h('span.ast-count', `${on.length}/${files.length}`)),
      h('label.check.ast-ghead', h('input', { type: 'checkbox', checked: files.every(a => picked.has(a.id)), onchange: e => { files.forEach(a => e.target.checked ? picked.add(a.id) : picked.delete(a.id)); drawGrid(); } }), h('i'), h('span', { title: base }, base)),
      h('div.ast-files', files.map(fileRow)));
  };
  const drawGrid = () => {
    const all = Assets.inVer(src, ver), shown = all.filter(a => !q || a.name.includes(q));
    for (const id of [...picked]) if (!all.some(a => a.id === id)) picked.delete(id);
    const groups = new Map(); for (const a of shown) { const b = Assets.baseOf(a.name); (groups.get(b) || groups.set(b, []).get(b)).push(a); }
    selAll.checked = shown.length > 0 && shown.every(a => picked.has(a.id));
    selInfo.textContent = picked.size ? `${picked.size}개 고름` : `에셋 ${shown.length}개 · 키워드 ${groups.size}개`;
    grid.replaceChildren(...(groups.size ? [...groups].map(([b, fs]) => groupCard(b, fs)) : [h('p.dim.ast-empty', q ? '찾는 에셋이 없어요.' : locked ? '빌려 온 보관함에 에셋이 없어요.' : '아직 에셋이 없어요. 이미지나 ZIP 을 올려 주세요.')]));
  };
  selAll.addEventListener('change', () => { const shown = Assets.inVer(src, ver).filter(a => !q || a.name.includes(q)); shown.forEach(a => selAll.checked ? picked.add(a.id) : picked.delete(a.id)); drawGrid(); });
  const bulk = async (label, fn, danger) => {
    if (guard()) return;
    const hit = Assets.inVer(src, ver).filter(a => picked.has(a.id)); if (!hit.length) return toast('먼저 에셋을 골라 주세요');
    if (danger && !(await confirmBox(`고른 에셋 ${hit.length}개를 삭제할까요? 되돌릴 수 없어요.`, '삭제', true))) return;
    for (const a of hit) await fn(a);
    if (danger) picked.clear(); toast(`${hit.length}개 ${label}`, 'ok'); changed();
  };
  const drop = h('div.dropzone.small.ast-drop', { onclick: async () => { if (!guard()) add(await pickFiles({ accept: 'image/png,image/webp,image/gif,image/jpeg,.zip', multiple: true })); } }, icon('upload', 22), h('b', '여기에 끌어다 놓거나 눌러서 올리기'), h('span', '이미지 여러 장 · ZIP. 파일 이름이 곧 키워드입니다 (joy_1, joy_2 처럼 번호를 붙이면 한 묶음).'));
  drop.addEventListener('dragover', e => { e.preventDefault(); drop.classList.add('over'); });
  drop.addEventListener('dragleave', () => drop.classList.remove('over'));
  drop.addEventListener('drop', e => { e.preventDefault(); drop.classList.remove('over'); add([...e.dataTransfer.files]); });
  Assets.load([owner, src]).then(drawGrid);
  return h('div.ast-sec',
    sec(null, title, h('span', '파일 이름이 AI 가 쓸 키워드가 됩니다. 예: ', h('code', 'joy.png'), ', ', h('code', 'street-night.webp')),
      sbtn('ZIP', I.zip, async () => { if (!guard()) add(await pickFiles({ accept: '.zip' })); }),
      btn('올리기', { ic: 'upload', onclick: async () => { if (!guard()) add(await pickFiles({ accept: 'image/png,image/webp,image/gif,image/jpeg', multiple: true })); } }),
      sbtn('주소에서', I.link, async () => {
        if (guard()) return;
        const url = await promptBox('이미지 주소', '', { placeholder: 'https://…/joy.png' }); if (!url?.trim()) return;
        const label = await promptBox('키워드 (비우면 파일 이름)', Assets.keyOf(safeDecode(url.split(/[?#]/)[0].split('/').pop() || '')));
        if (label == null) return; if (await uploadFromUrl(owner, ver, url, Assets.cleanName(label))) changed();
      }),
      sbtn('갤러리', I.grid, () => openGallery(src, ver, `${title} 갤러리`, { locked, onChange: changed })),
      sbtn('정돈', I.broom, () => { if (!guard()) smartRename(src, ver, changed); }, '', '이름을 한꺼번에 다듬습니다')),
    h('div.ast-upopts',
      check('WebP 자동 변환', c.webp, v => { c.webp = v; save(); }, 'PNG · JPEG 를 WebP 로 바꿔 용량을 줄입니다 (GIF 제외)'),
      check('덮어쓰기 확인', c.confirmOverwrite, v => { c.confirmOverwrite = v; save(); }, '같은 이름을 올릴 때 먼저 물어봅니다')),
    locked ? h('div.ast-lock', svg(I.link, 16), lockMsg) : drop, prog,
    h('div.ast-toolbar',
      h('div.search-wrap', icon('search', 16), h('input.inp', { placeholder: '키워드 또는 이름 찾기…', oninput: e => { q = e.target.value.trim().toLowerCase(); drawGrid(); } })),
      h('div.ast-toolbar-actions',
        h('label.check.ast-all', selAll, h('i'), h('span', '전체 선택')), selInfo,
        tiny(icon('eye', 14), '고른 에셋 쓰기', () => bulk('켰어요', a => Assets.update({ ...a, disabled: false }))),
        tiny(icon('eyeoff', 14), '고른 에셋 쓰지 않기', () => bulk('껐어요', a => Assets.update({ ...a, disabled: true }))),
        btn('선택 삭제', { cls: 'danger', ic: 'trash', onclick: () => bulk('삭제했어요', a => Assets.remove(a), true) }))),
    grid);
}

// ════════ 내보내기 · 백업 ════════
async function exportZip(char) {
  const owner = Assets.ownerOfChar(char.id); await Assets.load([owner]);
  const list = Assets.list(owner); if (!list.length) return toast('내보낼 에셋이 없어요');
  const seen = new Set(), files = [];
  for (const a of list) { let name = `${a.ver ? safeFile(a.ver) + '/' : ''}${safeFile(a.name)}.${extOf(a.data)}`; while (seen.has(name)) name = name.replace(/(\.\w+)$/, '_$1'); seen.add(name); files.push({ name, data: dataURLToBytes(a.data) }); }
  download(`${safeFile(char.name)}_assets.zip`, zip(files), 'application/zip');
  toast(`에셋 ${files.length}개를 ZIP 으로 내보냈어요`, 'ok');
}
function exportSettings() {
  download(`dreamland-assets-settings_${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify({ type: 'dreamland-assets-settings', version: 1, exportedAt: new Date().toISOString(), settings: cfg() }, null, 2));
  toast('설정을 내보냈어요', 'ok');
}
async function importSettings(done) {
  const [f] = await pickFiles({ accept: '.json' }); if (!f) return;
  let data; try { data = JSON.parse(await f.text()); } catch { return toast('JSON 파일을 읽지 못했어요', 'err'); }
  const s = data?.type === 'dreamland-assets-settings' ? data.settings : null;
  if (!s || typeof s !== 'object' || !Array.isArray(s.presets)) return toast('드림랜드 에셋 설정 백업 파일이 아니에요', 'err');
  if (!(await confirmBox('지금 설정(프리셋 · 캐릭터별 링크와 버전 · 표시 옵션)을 백업 내용으로 바꿀까요?', '복원'))) return;
  S.set({ assets: { ...S.settings.assets, ...s } }); cfg();
  toast('설정을 복원했어요', 'ok'); done();
}
function exportPreset() {
  const p = presetOf();
  download(`asset-preset_${safeFile(p.name)}.json`, JSON.stringify([{ name: p.name, prompt: p.prompt }], null, 2));
  toast(`"${p.name}" 프리셋을 내보냈어요`, 'ok');
}
async function importPresets(done) {
  const [f] = await pickFiles({ accept: '.json' }); if (!f) return;
  let data; try { data = JSON.parse(await f.text()); } catch { return toast('JSON 파일을 읽지 못했어요', 'err'); }
  const list = (Array.isArray(data) ? data : Array.isArray(data?.presets) ? data.presets : [data]).filter(p => p && typeof p.name === 'string' && typeof p.prompt === 'string' && p.prompt.trim());
  if (!list.length) return toast('불러올 프리셋이 없어요', 'err');
  const c = cfg(); let added = 0, updated = 0;
  for (const p of list) {
    const old = c.presets.find(x => x.name === p.name);
    if (old) { if (await confirmBox(`"${p.name}" 프리셋이 이미 있어요. 덮어쓸까요?`, '덮어쓰기')) { old.prompt = p.prompt; updated++; } }
    else { const id = 'p' + Date.now().toString(36) + added; c.presets.push({ id, name: p.name, prompt: p.prompt }); c.preset = id; added++; }
  }
  save(); toast(`프리셋 ${added}개 추가${updated ? ` · ${updated}개 덮어씀` : ''}`, 'ok'); done();
}

// ════════ 기능 화면 › 에셋 ════════
let sub = 'prompt';
function render() {
  const root = h('div.ast');
  const pickChar = () => { const c = cfg(), { chat } = chatApi.current(); return S.get('chars', c.ui.char) || S.get('chars', chat?.charIds?.[0]) || S.chars[0] || null; };
  const draw = () => {
    const c = cfg(), char = pickChar(), p = presetOf();
    const owner = char ? Assets.ownerOfChar(char.id) : '', cc = char ? charCfg(char.id) : null;
    if (cc && cc.link && (cc.link === char.id || !S.get('chars', cc.link))) cc.link = '';
    const src = owner ? Assets.source(owner) : '', linked = !!owner && src !== owner, linkChar = linked ? S.get('chars', cc.link) : null, ver = cc?.ver || '';
    const persona = S.get('personas', c.ui.persona) || (chatApi.current().chat ? S.persona(chatApi.current().chat) : null) || S.get('personas', S.settings.activePersona) || S.personas[0];
    const owners = char ? [owner, ...(persona ? [Assets.ownerOfPersona(persona.id)] : [])] : [];
    const summary = h('span.ast-status-sum');
    const updStatus = () => {
      if (!char) { summary.textContent = '캐릭터를 만들면 에셋을 올릴 수 있어요.'; return; }
      const act = Assets.active(owner), all = Assets.inVer(src, ver);
      summary.replaceChildren(h('b', `에셋 ${all.length}개`), ` · 켜짐 ${act.length}개 · 키워드 ${new Set(act.map(a => Assets.baseOf(a.name))).size}개`, ver ? h('em.badge', `버전 ${ver}`) : '', linked ? h('em.badge.on', `${linkChar.name} 에셋 빌림`) : '');
    };
    const copyPrompt = () => copy(renderPrompt(owners, char?.id), '안내문을 복사했어요');
    const status = h('div.ast-status',
      char ? avatar(char, 'sm') : h('div.avatar.sm', '?'),
      h('div.ast-status-main',
        S.chars.length ? select(char?.id, S.chars.map(x => [x.id, x.name]), async v => { c.ui.char = v; save(); await Assets.load([Assets.ownerOfChar(v)]); draw(); }, '.ast-charsel') : h('b', '캐릭터 없음'),
        summary),
      h('div.ast-actions', btn('안내문 복사', { ic: 'copy', onclick: copyPrompt, title: '지금 캐릭터로 빈칸을 채운 안내문을 복사합니다' })));

    // ── 프롬프트 ──
    const promptTab = () => {
      const area = h('textarea.inp.ast-prompt', { value: p.prompt, rows: 16, spellcheck: false, oninput: e => { p.prompt = e.target.value; save(); } });
      const isDefault = /^d\d$/.test(p.id);
      return h('div.card.ast-card',
        h('div.ast-sec',
          sec(icon('note', 16), '이미지 출력 안내문', 'AI 가 대화 흐름에 맞는 {{img::이름}} 태그를 고르도록 알려 줍니다.',
            isDefault && btn('기본값', { ic: 'refresh', title: '이 프리셋을 처음 내용으로 되돌립니다', onclick: async () => { if (await confirmBox(`"${p.name}" 을(를) 처음 내용으로 되돌릴까요?`, '되돌리기')) { p.prompt = DEFAULT_PRESETS[+p.id.slice(1)].prompt; save(); draw(); } } }),
            btn('키워드 교체', { ic: 'sparkle', title: '안내문 속 {{img_keywords}} 를 지금 이름 목록으로 바꿔 적습니다', onclick: () => {
              if (!/\{\{img_keywords(_autogen)?\}\}/i.test(p.prompt)) return toast('안내문에 {{img_keywords}} 가 없어요');
              const list = Assets.names(owners).join(', '); if (!list) return toast('이 캐릭터에는 켜진 에셋이 없어요');
              p.prompt = p.prompt.replace(/\{\{img_keywords(_autogen)?\}\}/gi, list); save(); draw(); toast('키워드 목록으로 바꿔 적었어요', 'ok');
            } })),
          h('div.ast-inject',
            check('대화할 때 이 안내문을 자동으로 넣기', c.inject, v => { c.inject = v; save(); }, '에셋이 하나도 없으면 넣지 않습니다. {{img_inprompt}} 를 직접 쓴다면 꺼 주세요.'),
            h('label.field.inline', h('span.field-label', '답변당 최대 개수'), h('input.inp', { type: 'number', min: 1, max: 6, value: c.max ?? 2, oninput: e => { c.max = Math.min(6, Math.max(1, Math.round(+e.target.value) || 1)); save(); } })),
            h('label.field.inline', h('span.field-label', '넣는 깊이'), h('input.inp', { type: 'number', min: 0, max: 20, value: c.depth ?? 2, title: '마지막 메시지에서 몇 번째 앞에 넣을지', oninput: e => { c.depth = Math.min(20, Math.max(0, Math.round(+e.target.value) || 0)); save(); } }))),
          h('div.ast-preset-row', h('span.field-label', '프리셋'), select(c.preset, c.presets.map(x => [x.id, x.name]), v => { c.preset = v; save(); draw(); })),
          h('div.ast-btngrid',
            btn('새 프리셋', { ic: 'plus', onclick: async () => {
              const name = (await promptBox('새 프리셋 이름', ''))?.trim(); if (!name) return;
              if (c.presets.some(x => x.name === name)) return toast('같은 이름의 프리셋이 있어요', 'err');
              const id = 'p' + Date.now().toString(36); c.presets.push({ id, name, prompt: p.prompt }); c.preset = id; save(); draw(); toast('지금 안내문을 복사해 새 프리셋을 만들었어요', 'ok');
            } }),
            btn('이름 변경', { ic: 'edit', onclick: async () => {
              const name = (await promptBox('프리셋 이름', p.name))?.trim(); if (!name || name === p.name) return;
              if (c.presets.some(x => x.name === name)) return toast('같은 이름의 프리셋이 있어요', 'err');
              p.name = name; save(); draw();
            } }),
            btn('삭제', { ic: 'trash', cls: 'danger', onclick: async () => {
              if (c.presets.length <= 1) return toast('마지막 프리셋은 지울 수 없어요');
              if (!(await confirmBox(`"${p.name}" 프리셋을 삭제할까요?`, '삭제', true))) return;
              c.presets = c.presets.filter(x => x !== p); c.preset = c.presets[0].id; save(); draw();
            } }),
            btn('미리 보기', { ic: 'eye', onclick: () => modal({ title: `${char?.name || '캐릭터 없음'} · 채운 안내문`, wide: true, body: h('pre.ast-preview', renderPrompt(owners, char?.id)) }) })),
          area,
          h('div.ast-macros', MACROS.map(([m, d]) => h('button.ast-macro', { type: 'button', title: d + ' · 눌러서 넣기', onclick: () => { const at = area.selectionStart ?? area.value.length; area.setRangeText(m, at, area.selectionEnd ?? at, 'end'); area.focus(); p.prompt = area.value; save(); } }, h('code', m), h('span', d)))),
          h('div.ast-btngrid.two',
            sbtn('프리셋 내보내기', I.down, exportPreset),
            btn('프리셋 불러오기', { ic: 'import', onclick: () => importPresets(draw) }))));
    };

    // ── 에셋 ──
    const assetsTab = () => {
      if (!char) return h('div.card.ast-card', h('p.dim.ast-empty', '먼저 캐릭터를 만들어 주세요.'));
      const others = S.chars.filter(x => x.id !== char.id);
      const vers = [...new Set([...cc.vers, ...(linked ? charCfg(cc.link).vers : []), ...(ver ? [ver] : [])])];
      const setVer = v => { cc.ver = v; save(); draw(); };
      const lockMsg = linked ? `「${linkChar.name}」의 에셋을 빌려 쓰는 중이라 올리기 · 삭제 · 정돈이 잠겨 있어요. 링크를 풀거나 그 캐릭터에서 바꿔 주세요.` : '';
      return h('div.ast-stack',
        h('div.card.ast-card.ast-two',
          h('div.ast-sec',
            sec(svg(I.link, 16), '에셋 링크', '다른 캐릭터의 에셋을 빌려 씁니다. 같은 그림을 두 번 저장하지 않아 용량을 아낍니다.'),
            h('div.ast-row',
              select(cc.link || '', [['', '사용 안 함 (자기 에셋 사용)'], ...others.map(x => [x.id, x.name])], async v => { cc.link = v; save(); await Assets.load([owner]); draw(); }),
              tiny(icon('x', 14), '링크 풀기', () => { if (!cc.link) return; cc.link = ''; save(); draw(); })),
            h('small.ast-info', linked ? `「${linkChar.name}」의 ${ver ? `"${ver}" 버전 ` : ''}에셋 ${Assets.inVer(src, ver).length}개를 빌려 쓰는 중` : '지금은 이 캐릭터의 에셋을 씁니다.')),
          h('div.ast-sec',
            sec(svg(I.layers, 16), '에셋 버전', '한 캐릭터의 에셋을 여러 벌로 나눠 관리합니다. (예: 평상복 / 교복 / 공통)'),
            h('div.ast-row',
              select(ver, [['', '기본'], ...vers.map(v => [v, v])], setVer),
              tiny(icon('plus', 14), '새 버전 추가', async () => {
                const name = (await promptBox('새 버전 이름', ''))?.trim(); if (!name) return;
                if (vers.includes(name)) return toast('같은 이름의 버전이 있어요', 'err');
                cc.vers.push(name); setVer(name);
              }),
              tiny(icon('edit', 14), '지금 버전 이름 바꾸기', async () => {
                if (!ver) return toast('기본 버전은 이름을 바꿀 수 없어요'); if (linked) return toast(lockMsg);
                const name = (await promptBox('버전 이름', ver))?.trim(); if (!name || name === ver) return;
                if (vers.includes(name)) return toast('같은 이름의 버전이 있어요', 'err');
                for (const a of Assets.inVer(owner, ver)) await Assets.update({ ...a, ver: name });
                cc.vers = cc.vers.map(v => v === ver ? name : v); setVer(name);
              }),
              tiny(icon('trash', 14), '지금 버전 삭제', async () => {
                if (!ver) return toast('기본 버전은 지울 수 없어요'); if (linked) return toast(lockMsg);
                const list = Assets.inVer(owner, ver);
                if (!(await confirmBox(`"${ver}" 버전을 삭제할까요? 이 버전에 든 에셋 ${list.length}개도 함께 지워집니다.`, '삭제', true))) return;
                for (const a of list) await Assets.remove(a);
                cc.vers = cc.vers.filter(v => v !== ver); setVer('');
              }, 'bad')),
            h('small.ast-info', ver ? `"${ver}" 버전을 쓰는 중 · 대화에는 이 버전의 에셋만 나옵니다.` : '기본 버전을 쓰는 중'))),
        h('div.card.ast-card', manager(owner, { ver, src, locked: linked, lockMsg, title: `${char.name}의 에셋`, onChange: updStatus })));
    };

    // ── 렌더링 ──
    const renderTab = () => {
      const sample = (char && Assets.active(owner)[0]?.data) || SAMPLE;
      const fake = () => h('span.ast-lines', h('i'), h('i'), h('i'), h('i'));
      const live = h('div.ast-live');
      const drawLive = () => live.replaceChildren(h('p', fake()), h('p', h('span.asset-frame', { class: 'as-' + (/^[\w-]+$/.test(c.style || '') ? c.style : 'ink'), style: { '--as-max': (Math.round(+c.maxSize) || 400) + 'px' } }, h('img.asset-img', { alt: '', src: sample }))), h('p', fake()));
      const sizeOut = h('output', `${c.maxSize}px`);
      const cards = h('div.ast-styles', STYLES.map(([id, name, desc]) => h(`button.ast-style${c.style === id ? '.on' : ''}`, { type: 'button', onclick: () => { c.style = id; save(); draw(); } },
        h(`span.ast-pv${id.startsWith('float') ? '.side' + (id === 'float-right' ? '.r' : '') : ''}`, h('span', { class: `asset-frame as-${id}`, style: '--as-max:104px' }, h('img.asset-img', { alt: '', src: sample })), id.startsWith('float') ? h('span.ast-lines', h('i'), h('i'), h('i'), h('i')) : null),
        h('b', name), h('small', desc))));
      drawLive();
      return h('div.card.ast-card',
        h('div.ast-sec',
          sec(icon('sparkle', 16), '대화에 보이는 방식', h('span', '답변 속 ', h('code', '{{img::이름}}'), ' 태그가 그 자리에서 캐릭터의 그림으로 바뀝니다.')),
          h('div.ast-toggles',
            check('무작위 에셋', c.random, v => { c.random = v; save(); }, '같은 묶음(angry_1, angry_2 …)이 있으면 AI 에게는 angry 만 알려 주고, 보여 줄 때 묶음에서 하나를 고릅니다'),
            check('그림 늦게 불러오기', c.lazy !== false, v => { c.lazy = v; save(); }, '그림이 많은 긴 대화에서 스크롤이 가벼워집니다'),
            check('눌러서 크게 보기', c.zoom !== false, v => { c.zoom = v; save(); }, '대화 속 에셋 그림을 누르면 크게 열립니다')),
          h('div.field', h('span.field-label', '최대 크기'), h('div.range', h('input', { type: 'range', min: 120, max: 900, step: 20, value: c.maxSize, oninput: e => { c.maxSize = +e.target.value; sizeOut.textContent = c.maxSize + 'px'; save(); drawLive(); } }), sizeOut), h('small.hint', '그림의 가장 긴 가로 길이. 플로팅 · 시네마틱은 이 값에 맞춰 비율로 줄어듭니다.'))),
        h('div.ast-sec',
          sec(icon('image', 16), '표시 스타일', '하나를 고르면 지금부터 보이는 모든 에셋 그림에 적용됩니다.'),
          cards,
          h('div.ast-live-wrap', h('span.ast-live-tag', '미리 보기'), live)));
    };

    // ── 도구 ──
    const toolsTab = () => h('div.ast-stack',
      h('div.card.ast-card',
        h('div.ast-sec',
          sec(icon('user', 16), '페르소나 에셋', '캐릭터 에셋에서 못 찾은 이름은 페르소나 에셋에서 찾습니다. 모든 캐릭터에 두루 쓸 그림을 여기에 올려 주세요.'),
          persona ? h('div.ast-row', avatar(persona, 'xs'), select(persona.id, S.personas.map(x => [x.id, x.name]), async v => { c.ui.persona = v; save(); await Assets.load([Assets.ownerOfPersona(v)]); draw(); })) : null),
        persona ? manager(Assets.ownerOfPersona(persona.id), { title: `${persona.name}의 에셋` }) : h('p.dim.ast-empty', '페르소나가 없어요.')),
      h('div.card.ast-card',
        h('div.ast-sec',
          sec(icon('folder', 16), '백업과 내보내기', '에셋 ZIP 과 이 기능의 설정을 내보내고 되돌립니다.'),
          h('div.ast-btngrid',
            sbtn('에셋 ZIP 내보내기', I.zip, () => char ? exportZip(char) : toast('캐릭터가 없어요'), '', '고른 캐릭터의 모든 에셋(모든 버전)을 ZIP 으로 내려받습니다'),
            btn('안내문 복사', { ic: 'copy', onclick: copyPrompt }),
            sbtn('설정 백업', I.down, exportSettings, '', '프리셋 · 캐릭터별 링크와 버전 · 표시 옵션을 JSON 으로 내보냅니다'),
            btn('설정 복원', { ic: 'import', onclick: () => importSettings(draw) })))),
      h('div.card.ast-card',
        h('div.ast-sec',
          sec(icon('book', 16), '쓰는 법', '태그와 빈칸을 빠르게 확인합니다.'),
          h('details.ast-details', { open: true }, h('summary', '기본 사용법'), h('ol',
            h('li', '위에서 캐릭터를 고르고 에셋 탭에서 이미지나 ZIP 을 올립니다. 파일 이름이 키워드가 됩니다.'),
            h('li', '프롬프트 탭에서 안내문 프리셋을 고릅니다. 자동으로 넣기를 켜 두면 따로 할 일이 없습니다.'),
            h('li', 'AI 가 ', h('code', '{{img::이름}}'), ' 을 쓰면 그 자리에 그림이 보입니다. 렌더링 탭에서 스타일을 고를 수 있어요.'))),
          h('details.ast-details', h('summary', '이름 규칙'), h('ul',
            h('li', h('code', 'joy.png'), ' → 키워드 joy'),
            h('li', h('code', 'joy_1.png'), ', ', h('code', 'joy-2.png'), ', ', h('code', 'joy.3.png'), ' → joy 한 묶음 (번호 변형)'),
            h('li', '태그에 확장자를 붙여도(', h('code', '{{img::joy.png}}'), ') 같은 그림을 찾습니다.'))),
          h('details.ast-details', h('summary', '빈칸(매크로)'), h('div.ast-macros.plain', MACROS.map(([m, d]) => h('div.ast-macro', h('code', m), h('span', d))))),
          h('details.ast-details', h('summary', '명령어'), h('ul',
            h('li', h('code', '/assets-upload label=키워드 주소'), ' — 주소의 이미지를 지금 대화의 캐릭터 에셋으로 올립니다.'),
            h('li', h('code', '/assets-gallery'), ' — 지금 대화 캐릭터의 갤러리를 엽니다.'),
            h('li', h('code', '/refresh-img-keywords'), ' — 에셋 보관함을 다시 읽습니다.'))))));

    const TABS = [['prompt', '프롬프트', 'note', promptTab], ['assets', '에셋', 'folder', assetsTab], ['render', '렌더링', 'sparkle', renderTab], ['tools', '도구', 'gear', toolsTab]];
    root.replaceChildren(status,
      h('div.ast-tabs', { role: 'tablist' }, TABS.map(([k, l, ic]) => h(`button${sub === k ? '.on' : ''}`, { type: 'button', role: 'tab', onclick: () => { sub = k; draw(); } }, icon(ic, 16), h('span', l)))),
      (TABS.find(t => t[0] === sub) || TABS[0])[3]());
    updStatus();
  };
  draw();
  const first = pickChar();
  Assets.load([...(first ? [Assets.ownerOfChar(first.id)] : []), ...S.personas.map(p => Assets.ownerOfPersona(p.id))]).then(draw).catch(e => console.warn('[에셋]', e));
  return root;
}
X.studio = X.studio.filter(t => t.owner !== 'assets');
X.studio.push({ owner: 'assets', title: '에셋', render });

// ════════ 명령어 ════════
const currentChar = () => { const { chat } = chatApi.current(); return S.get('chars', chat?.charIds?.[0]) || null; };
X.commands.set('/assets-upload', { owner: 'assets', help: '주소의 이미지를 지금 캐릭터의 에셋으로 올립니다 · 예: /assets-upload label=joy https://…/joy.png',
  run: async arg => {
    const m = String(arg || '').match(/^\s*(?:label=("([^"]*)"|'([^']*)'|\S+)\s+)?(\S+)\s*$/i);
    if (!m) return toast('이렇게 적어 주세요: /assets-upload label=키워드 주소', 'err');
    const char = currentChar(); if (!char) return toast('열린 대화의 캐릭터가 없어요', 'err');
    const owner = Assets.ownerOfChar(char.id);
    if (Assets.source(owner) !== owner) return toast('에셋 링크를 쓰는 캐릭터에는 올릴 수 없어요', 'err');
    chatApi.setStatus('에셋 올리는 중…');
    try { if (await uploadFromUrl(owner, Assets.verOf(owner), m[4], Assets.cleanName(m[2] ?? m[3] ?? m[1] ?? ''))) chatApi.redraw(); } finally { chatApi.setStatus(''); }
  } });
X.commands.set('/assets-gallery', { owner: 'assets', help: '지금 캐릭터의 에셋 갤러리를 엽니다',
  run: async () => {
    const char = currentChar(); if (!char) return toast('열린 대화의 캐릭터가 없어요', 'err');
    const owner = Assets.ownerOfChar(char.id); await Assets.load([owner]);
    const src = Assets.source(owner); openGallery(src, Assets.verOf(owner), `${char.name}의 에셋 갤러리`, { locked: src !== owner, onChange: () => chatApi.redraw() });
  } });
X.commands.set('/refresh-img-keywords', { owner: 'assets', help: '에셋 보관함을 다시 읽어 키워드를 새로 고칩니다',
  run: async () => { const { chat } = chatApi.current(); if (!chat) return toast('열린 대화가 없어요', 'err'); const owners = ownersOf(chat); await Assets.reload(owners); chatApi.redraw(); toast(`키워드를 새로 고쳤어요: ${Assets.names(owners).join(', ') || '(없음)'}`.slice(0, 200), 'ok'); } });
