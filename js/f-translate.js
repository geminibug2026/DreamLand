// ── Dreamland 번역: 프리셋 지시문 · 메시지 번역 단추 · 빠른 입력 번역 · 번역 기록 정리 ──
import { S, h, clamp, msgText } from './core.js';
import { icon, btn, iconBtn, toast, modal, confirmBox, promptBox, go } from './ui.js';
import { X } from './hooks.js';
import { quickCall } from './engine.js';
import { Illust } from './illust.js';
import { chatApi } from './chat.js';

document.head.append(h('link', { rel: 'stylesheet', href: 'css/f-translate.css' }));

// ════════ 언어 ════════  코드 | 모델에게 쓰는 이름 | 화면에 보이는 이름
const LANGS = `ko|Korean|한국어
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
const findLang = v => { const k = String(v || '').trim().toLowerCase(); return LANGS.find(l => l.some(x => x.toLowerCase() === k)); };
/** 코드·한국어 이름·영어 이름 무엇이든 → 모델에게 쓸 영어 이름 (목록에 없으면 적힌 그대로) */
const langName = v => findLang(v)?.[1] || String(v || '').trim() || 'Korean';
const langLabel = v => findLang(v)?.[2] || String(v || '').trim();

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
const SYSTEM = 'You are a professional translator. Follow the instructions in the user message exactly and output nothing else.';
const VARS = [['{{language}}', '옮길 언어'], ['{{prompt}}', '번역할 글'], ['{{name}}', '그 글을 쓴 사람'], ['{{#each chat}}…{{/each}}', '앞 메시지 반복 · 안에서 {{this.name}} {{this.mes}} {{add @index 1}}'], ['{{#each (slice chat -3)}}…{{/each}}', '앞 메시지 중 마지막 3개만'], ['{{context}}', '앞 메시지를 "이름: 내용" 줄로'], ['{{chat_1}}', '바로 앞 메시지 (chat_2, chat_3 …)'], ['{{#if chat}}…{{else}}…{{/if}}', '앞 메시지가 있을 때만'], ['{{user}} {{char}}', '내 이름 · 캐릭터 이름']];

/** 설정을 꺼내면서 프리셋 자리를 마련한다 (예전의 지시문 한 칸은 프리셋으로 옮긴다) */
function cfg() {
  const c = S.settings.translate;
  if (!Array.isArray(c.presets) || !c.presets.length) {
    c.presets = [{ id: 'default', name: '기본', content: DEFAULT_PROMPT, filter: true }];
    if (c.prompt?.trim()) c.presets.push({ id: 'custom', name: '내 지시문', filter: false, content: `${c.prompt.trim()}\n\n{{#if chat}}<context>\n{{context}}\n</context>\n\n{{/if}}<text>\n{{prompt}}\n</text>` });
    c.preset = c.presets[c.presets.length - 1].id;
  }
  if (!c.presets.some(p => p.id === c.preset)) c.preset = c.presets[0].id;
  return c;
}
const presetOf = key => { const c = cfg(); return (key && c.presets.find(p => p.id === key || p.name === key)) || c.presets.find(p => p.id === c.preset) || c.presets[0]; };
const save = () => S.set({ translate: cfg(), helpers: S.settings.helpers });

/** 지시문 틀 채우기. 채워 넣은 글은 다시 훑지 않는다 */
export function fill(tpl, v) {
  const keep = []; const stash = s => { keep.push(String(s ?? '')); return `\u0000${keep.length - 1}\u0000`; };
  const chat = v.chat || [];
  const simple = { language: v.language, prompt: v.text, text: v.text, name: v.name, user: v.user, char: v.char, context: chat.map(c => `${c.name}: ${c.mes}`).join('\n') };
  const itemVal = (it, i, key) => {
    key = key.trim(); const add = key.match(/^add\s+@index\s+(-?\d+)$/);
    if (add) return String(i + +add[1]); if (key === '@index') return String(i);
    const k = key.replace(/^this\.?/, ''); return stash(k ? it[k] : it.mes);
  };
  let out = tpl.replace(/\{\{#each\s+(?:\(\s*slice\s+chat\s+(-?\d+)\s*\)|chat)\s*\}\}([\s\S]*?)\{\{\/each\}\}/g, (_, n, body) =>
    (n ? chat.slice(+n) : chat).map((it, i) => body.replace(/\{\{\s*(this(?:\.\w+)?|@index|add\s+@index\s+-?\d+)\s*\}\}/g, (m, k) => itemVal(it, i, k))).join('').replace(/^\n/, ''));
  out = out.replace(/\{\{#if\s+(\w+)\s*\}\}([\s\S]*?)(?:\{\{else\}\}([\s\S]*?))?\{\{\/if\}\}/g, (_, k, yes, no = '') => (k === 'chat' ? chat.length : simple[k]) ? yes : no);
  out = out.replace(/\{\{\s*(\w+)\s*\}\}/g, (m, k) => { const n = k.match(/^chat_(\d+)$/); return n ? stash(chat[chat.length - +n[1]]?.mes) : k in simple ? stash(simple[k]) : m; });
  return out.replace(/\u0000(\d+)\u0000/g, (_, i) => keep[i]);
}
const FENCE = /^(?:[^`]*?)\n?```[\s\S]*?\n([\s\S]*?)```(?![^`]*```)/;

/** 번역 한 번. chat.js 의 번역(⋯ 메뉴 · 자동 번역 · 입력 번역)도 이 함수를 거친다 */
X.translate = async (text, language, { chat, context = [], signal, name, preset, conn } = {}) => {
  const c = cfg(), p = presetOf(preset), cur = chatApi.current();
  chat ||= cur.chat;
  const persona = chat ? S.persona(chat) : S.get('personas', S.settings.activePersona);
  if (name == null) { const m = chat === cur.chat ? cur.msgs.find(x => Illust.strip(msgText(x)) === text) : null; name = m ? (m.role === 'user' ? persona?.name : m.name || S.get('chars', m.charId)?.name) : persona?.name; }
  const prompt = fill(p.content || DEFAULT_PROMPT, {
    language: langName(language || c.lang), text, name: name || '', user: persona?.name || '', char: S.get('chars', chat?.charIds?.[0])?.name || '',
    chat: context.map(x => ({ name: x.name, mes: String(x.text ?? x.mes ?? '').slice(0, 4000), text: String(x.text ?? x.mes ?? '').slice(0, 4000) })),
  });
  let out = await quickCall(SYSTEM, prompt, { maxTokens: clamp(+c.maxTokens || 20000, 256, 200000), signal, conn: conn || S.helperConn('translate', chat) });
  if (p.filter !== false) { const m = out.match(FENCE); if (m) out = m[1]; }
  out = out.trim();
  if (!out) throw new Error('번역 결과가 비어 있어요');
  return out;
};

// ════════ 아이콘 ════════
const svg = (d, size = 18) => { const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); s.setAttribute('viewBox', '0 0 24 24'); s.setAttribute('width', size); s.setAttribute('height', size); s.classList.add('ic'); s.innerHTML = `<path d="${d}" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/>`; return s; };
const GLOBE = 'M12 3a9 9 0 1 0 0 18a9 9 0 0 0 0-18zM3 12h18M12 3c2.6 2.7 3.9 5.7 3.9 9s-1.3 6.3-3.9 9c-2.6-2.7-3.9-5.7-3.9-9s1.3-6.3 3.9-9z';
const SPIRAL = 'M20 11a8 8 0 1 0-2.3 6.3M20 4v7h-7';   // 다시 번역: 새로 고침 모양
const SHEET = 'M6 3h9l4 4v14H6zM14 3v5h5M9 12h7M9 16h7';

// ════════ 메시지 번역 ════════
const busy = new Set();   // 번역 중인 메시지 id
const artOf = id => document.querySelector(`article.msg[data-id="${id}"]`);
const markBusy = id => artOf(id)?.querySelectorAll('.trx-btn.trx-go, .trx-btn.trx-re').forEach(b => b.classList.toggle('busy', busy.has(id)));
const contextOf = (chat, msgs, m) => {
  const n = +cfg().context || 0, idx = msgs.indexOf(m), user = S.persona(chat)?.name || '';
  return n && idx > 0 ? msgs.slice(Math.max(0, idx - n), idx).filter(x => !x.hidden).map(x => ({ name: x.role === 'user' ? user : (x.name || S.get('chars', x.charId)?.name || 'Narrator'), text: Illust.strip(msgText(x)) })) : [];
};
const persist = async (chat, msgs) => { if (chatApi.current().chat === chat) { await chatApi.save(); chatApi.redraw(); } else await S.saveMsgs(chat, msgs); };

/** 지구본: 번역이 없으면 번역, 있으면 원문 ↔ 번역 전환 (번역문은 지우지 않고 간직한다). again 이면 새로 번역 */
async function translateMsg(m, again = false) {
  const { chat, msgs, busy: generating } = chatApi.current(); const s = m?.swipes?.[m.sw];
  if (!chat || !s) return;
  if (busy.has(m.id)) return toast('이 메시지는 이미 번역하고 있어요');
  if (s.tr && !again) { s.showTr = !s.showTr; return persist(chat, msgs); }
  if (generating && msgs[msgs.length - 1] === m) return toast('답변이 다 써진 뒤에 번역할 수 있어요');
  const src = Illust.strip(s.text || '').trim();
  if (!src) return toast('번역할 내용이 없어요');
  busy.add(m.id); markBusy(m.id);
  try {
    const who = m.role === 'user' ? S.persona(chat)?.name : (m.name || S.get('chars', m.charId)?.name);
    const tr = await X.translate(src, cfg().lang, { chat, context: contextOf(chat, msgs, m), name: who || '' });
    if (Illust.strip(s.text || '').trim() !== String(src).trim() && (s.text || '').trim() !== String(src).trim()) { busy.delete(m.id); markBusy(m.id); return toast('번역하는 동안 원문이 바뀌어 번역을 버렸어요'); }
    s.tr = tr; s.showTr = true;
    busy.delete(m.id); await persist(chat, msgs);
  } catch (e) { if (e?.name !== 'AbortError') toast('번역 실패: ' + (e?.message || e), 'err'); }
  finally { busy.delete(m.id); markBusy(m.id); }
}

/** 번역문을 메시지 자리에서 바로 고친다. 비우고 저장하면 번역을 지운다 */
function editTranslation(m) {
  const { chat, msgs } = chatApi.current(); const s = m?.swipes?.[m.sw];
  if (!s?.tr) return toast('고칠 번역문이 없어요. 먼저 번역해 주세요.');
  const art = artOf(m.id), body = art?.querySelector('.msg-body');
  if (!body || art.querySelector('.trx-edit')) return;
  const ta = h('textarea.inp.trx-edit-area', { value: s.tr, spellcheck: false });
  const fit = () => { ta.style.height = 'auto'; ta.style.height = Math.min(ta.scrollHeight + 4, innerHeight * 0.6) + 'px'; };
  const close = () => { box.remove(); body.style.display = ''; art.classList.remove('trx-editing'); };
  const done = async () => { const v = ta.value; if (v.trim()) { s.tr = v; s.showTr = true; } else { delete s.tr; s.showTr = false; } close(); await persist(chat, msgs); };
  const box = h('div.trx-edit',
    h('div.trx-edit-head', svg(SHEET, 15), h('b', '번역 고치기'), h('span', '원문은 그대로 두고 번역문만 바꿉니다. 비우고 저장하면 번역을 지웁니다.')),
    ta,
    h('div.row.end', btn('취소', { cls: 'ghost', onclick: close }), btn('저장', { cls: 'primary', ic: 'check', onclick: done })));
  ta.addEventListener('input', fit);
  ta.addEventListener('keydown', e => { if (e.key === 'Escape') { e.stopPropagation(); close(); } if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) done(); });
  body.style.display = 'none'; body.after(box); art.classList.add('trx-editing'); fit(); ta.focus();
}

// ── 메시지마다 단추 달기 ──
function decorate() {
  const c = cfg(), { msgs } = chatApi.current();
  for (const tools of document.querySelectorAll('article.msg[data-id] .msg-tools:not([data-trx])')) {
    tools.dataset.trx = '1';
    const art = tools.closest('article.msg'); if (art.classList.contains('sys')) continue;
    const m = msgs.find(x => x.id === art.dataset.id), s = m?.swipes?.[m.sw]; if (!s) continue;
    const mk = (cls, d, title, fn) => { const b = h(`button.ibtn.trx-btn.${cls}`, { type: 'button', title, 'aria-label': title, onclick: () => { const cur = chatApi.current().msgs.find(x => x.id === art.dataset.id); if (cur) fn(cur); } }, svg(d)); if (busy.has(m.id) && cls !== 'trx-ed') b.classList.add('busy'); return b; };
    const add = [];
    if (c.btnTranslate !== false) { const b = mk('trx-go', GLOBE, s.tr ? (s.showTr ? '원문 보기' : '번역 보기') : '번역', x => translateMsg(x)); if (s.tr) b.classList.add(s.showTr ? 'on' : 'has'); add.push(b); }
    if (c.btnRe !== false) add.push(mk('trx-re', SPIRAL, '다시 번역', x => translateMsg(x, true)));
    if (c.btnEdit !== false) { const b = mk('trx-ed', SHEET, '번역 고치기', editTranslation); if (!s.tr) b.classList.add('idle'); add.push(b); }
    if (!add.length) continue;
    const more = [...tools.children].find(x => x.title === '더 보기');
    more ? more.before(...add) : tools.append(...add);
    if (s.tr && s.showTr) art.classList.add('trx-shown');
  }
  const box = document.querySelector('.composer-box'), have = box?.querySelector('.trx-quick');
  if (box && c.btnQuick === false) have?.remove();
  else if (box && !have) {
    const b = h('button.trx-quick', { type: 'button', title: `입력한 글을 ${langLabel(c.inputLang || 'English')}(으)로 번역 · 일부만 고르면 그 부분만`, 'aria-label': '입력한 글 번역', onclick: () => quickTranslate(b) }, svg(GLOBE, 19));
    (box.querySelector('.send') || box.lastElementChild)?.before(b);
  }
}
/** 설정이 바뀌면 단추를 다시 단다 */
function redecorate() {
  document.querySelectorAll('.trx-btn, .trx-quick').forEach(b => b.remove());
  document.querySelectorAll('.msg-tools[data-trx]').forEach(t => delete t.dataset.trx);
  decorate();
}
let queued = false;
new MutationObserver(() => { if (queued) return; queued = true; requestAnimationFrame(() => { queued = false; try { decorate(); } catch (e) { console.warn('[번역 단추]', e); } }); }).observe(document.documentElement, { childList: true, subtree: true });

// ── 보내기 옆 빠른 번역 ──
let quickBusy = false;
async function quickTranslate(b) {
  if (quickBusy) return;
  const ta = b.closest('.composer-box')?.querySelector('textarea'); if (!ta) return;
  const st = ta.selectionStart, en = ta.selectionEnd, part = en > st && en - st < ta.value.length;
  const src = part ? ta.value.slice(st, en) : ta.value;
  if (!src.trim()) return toast('번역할 내용을 먼저 적어 주세요');
  quickBusy = true; b.classList.add('busy');
  try {
    const out = await X.translate(src, cfg().inputLang || 'English', { chat: chatApi.current().chat });
    ta.value = part ? ta.value.slice(0, st) + out + ta.value.slice(en) : out;
    ta.dispatchEvent(new Event('input', { bubbles: true })); ta.focus();
  } catch (e) { toast('번역 실패: ' + (e?.message || e), 'err'); }
  finally { quickBusy = false; b.classList.remove('busy'); }
}

// ════════ 번역 기록 지우기 ════════
const translatedCount = msgs => msgs.filter(m => m.swipes?.some(s => s.tr)).length;
async function deleteRange(from, to, all) {
  const { chat, msgs } = chatApi.current();
  if (!chat || !msgs.length) return toast('열린 대화에 메시지가 없어요');
  let a = 1, b = msgs.length;
  if (!all) {
    a = parseInt(from, 10); b = parseInt(to, 10);
    if (isNaN(a) || isNaN(b)) return toast('시작과 끝 번호를 모두 적어 주세요');
    if (a > b) [a, b] = [b, a];
    a = clamp(a, 1, msgs.length); b = clamp(b, 1, msgs.length);
  }
  const hit = msgs.slice(a - 1, b).filter(m => m.swipes?.some(s => s.tr));
  if (!hit.length) return toast('그 범위에는 번역이 없어요');
  if (!(await confirmBox(all ? `이 대화의 번역 ${hit.length}개를 모두 지울까요?` : `${a}번 ~ ${b}번 메시지의 번역 ${hit.length}개를 지울까요?`, '지우기', true))) return;
  for (const m of hit) for (const s of m.swipes) { delete s.tr; s.showTr = false; }
  await persist(chat, msgs);
  toast(`번역 ${hit.length}개를 지웠어요`, 'ok');
  return true;
}

// ════════ 명령어 ════════
function parseArgs(arg) {
  const named = {}; let rest = arg || ''; const re = /^\s*(target|profile|preset)=("([^"]*)"|'([^']*)'|\S+)/i; let m;
  while ((m = rest.match(re))) { named[m[1].toLowerCase()] = m[3] ?? m[4] ?? m[2]; rest = rest.slice(m[0].length); }
  return { named, text: rest.trim() };
}
const cmdTranslate = {
  owner: 'translate', help: '메시지를 번역합니다 (번호를 비우면 마지막 메시지) · 예: /translate 12',
  run: async arg => {
    const { msgs } = chatApi.current(); const n = parseInt(arg, 10);
    if (arg.trim() && isNaN(n)) return toast('메시지 번호를 숫자로 적어 주세요', 'err');
    const m = !arg.trim() || n === -1 ? msgs[msgs.length - 1] : msgs[n - 1];
    if (!m || m.role === 'system') return toast('그 번호의 메시지를 찾지 못했어요', 'err');
    await translateMsg(m, true);
  },
};
const cmdText = {
  owner: 'translate', help: '적은 글을 번역합니다 · 예: /translate-text target=ja 안녕하세요 (preset=이름, profile=연결 이름도 됩니다)',
  run: async arg => {
    const { named, text } = parseArgs(arg);
    if (!text) return toast('번역할 글을 적어 주세요', 'err');
    const conn = named.profile ? S.conns.find(c => c.id === named.profile || c.name === named.profile) : null;
    if (named.profile && !conn) return toast(`"${named.profile}" 연결을 찾지 못했어요`, 'err');
    if (named.preset && !cfg().presets.some(p => p.id === named.preset || p.name === named.preset)) return toast(`"${named.preset}" 프리셋을 찾지 못했어요`, 'err');
    chatApi.setStatus('번역 중…');
    try {
      const out = await X.translate(text, named.target || cfg().lang, { chat: chatApi.current().chat, preset: named.preset, conn });
      modal({ title: `${langLabel(named.target || cfg().lang)} 번역`, body: h('div.trx-result', h('div.trx-result-src', text), h('div.trx-result-out', out)),
        actions: [{ label: '입력창에 넣기', onclick: () => chatApi.insert(out) }, { label: '복사', cls: 'primary', ic: 'copy', onclick: () => { navigator.clipboard.writeText(out); toast('복사했어요'); } }] });
    } finally { chatApi.setStatus(''); }
  },
};
X.commands.set('/translate', cmdTranslate); X.commands.set('/magic-translate', { ...cmdTranslate, help: '/translate 와 같습니다' });
X.commands.set('/translate-text', cmdText); X.commands.set('/magic-translate-text', { ...cmdText, help: '/translate-text 와 같습니다' });

// ════════ 기능 화면 › 번역 ════════
let sub = 'basic';
function render() {
  const root = h('div.trx');
  const draw = () => {
    const c = cfg();
    const { chat, msgs } = chatApi.current();
    const mode = c.auto && c.autoInput ? 'both' : c.auto ? 'responses' : c.autoInput ? 'inputs' : 'none';
    const p = presetOf();
    const set = fn => { fn(); save(); };
    const field = (label, ctl, hint, cls = '') => h(`label.field${cls}`, h('span.field-label', label), ctl, hint && h('small.hint', hint));
    const select = (value, opts, onchange) => h('select.inp', { onchange: e => onchange(e.target.value) }, opts.map(([v, l]) => h('option', { value: v, selected: String(value ?? '') === String(v) }, l)));
    const langSelect = (key, fallback) => {
      const cur = c[key] || fallback, known = findLang(cur);
      const opts = [...LANGS.map(l => [l[1], `${l[2]} · ${l[1]}`]), ...(known ? [] : [[cur, `${cur} (직접 적음)`]]), ['\u0001', '직접 적기…']];
      return select(known ? known[1] : cur, opts, async v => {
        if (v === '\u0001') { const t = await promptBox('언어 이름', known ? '' : cur, { placeholder: '예: Old English, 경상도 사투리' }); if (t?.trim()) c[key] = t.trim(); save(); return draw(); }
        set(() => { c[key] = v; }); redecorate();
      });
    };
    const check = (label, on, onchange, hint) => h('label.check', h('input', { type: 'checkbox', checked: !!on, onchange: e => onchange(e.target.checked) }), h('i'), h('span', label), hint && h('small', hint));

    // ── 기본 ──
    const basic = () => {
      const area = h('textarea.inp.trx-prompt', { value: p.content, rows: 14, spellcheck: false, oninput: e => { p.content = e.target.value; save(); } });
      const testIn = h('textarea.inp', { rows: 2, placeholder: '시험 삼아 번역해 볼 글' }), testOut = h('div.trx-test-out');
      const runTest = async e => {
        const b = e.currentTarget; if (!testIn.value.trim()) return toast('번역해 볼 글을 적어 주세요');
        b.disabled = true; testOut.className = 'trx-test-out wait'; testOut.textContent = '번역하는 중…';
        try { testOut.textContent = await X.translate(testIn.value, c.lang, { chat, context: [] }); testOut.className = 'trx-test-out done'; }
        catch (err) { testOut.textContent = '실패: ' + (err?.message || err); testOut.className = 'trx-test-out fail'; }
        finally { b.disabled = false; }
      };
      return h('div.card.trx-card',
        h('div.form',
          h('h3.form-sec', '연결과 언어'),
          field('번역에 쓸 연결', h('div.trx-row', select(S.settings.helpers.translate, [['', '대화에 쓰는 연결'], ...S.conns.map(x => [x.id, `${x.name}${x.model ? ' · ' + x.model : ''}`])], v => set(() => { S.settings.helpers.translate = v; })), iconBtn('plug', 'API 연결 화면으로', () => go('conns'))), '번역만 값싸고 빠른 모델에 맡길 수 있어요.'),
          field('자동 번역', select(mode, [['none', '하지 않음'], ['responses', '답변을 번역해서 보여 주기'], ['inputs', '내 글을 번역해서 보내기'], ['both', '둘 다']], v => set(() => { c.auto = v === 'responses' || v === 'both'; c.autoInput = v === 'inputs' || v === 'both'; })), '내 글을 번역해서 보내면 화면에는 내가 쓴 글이, 모델에는 번역문이 갑니다.'),
          field('답변을 옮길 언어', langSelect('lang', 'Korean'), null, '.half'),
          field('내 글을 옮길 언어', langSelect('inputLang', 'English'), null, '.half'),
          h('h3.form-sec', '지시문 프리셋'),
          h('div.field', h('div.trx-row',
            select(c.preset, c.presets.map(x => [x.id, x.name]), v => { c.preset = v; save(); draw(); }),
            iconBtn('plus', '지금 프리셋을 복사해 새로 만들기', async () => {
              const name = (await promptBox('새 프리셋 이름', ''))?.trim(); if (!name) return;
              if (c.presets.some(x => x.name === name)) return toast('같은 이름의 프리셋이 있어요', 'err');
              const id = 'p' + Date.now().toString(36); c.presets.push({ id, name, content: p.content, filter: p.filter }); c.preset = id; save(); draw();
            }),
            iconBtn('edit', '이름 바꾸기', async () => {
              if (p.id === 'default') return toast('기본 프리셋은 이름을 바꿀 수 없어요');
              const name = (await promptBox('프리셋 이름', p.name))?.trim(); if (!name || name === p.name) return;
              if (c.presets.some(x => x.name === name)) return toast('같은 이름의 프리셋이 있어요', 'err');
              p.name = name; save(); draw();
            }),
            iconBtn('trash', '프리셋 삭제', async () => {
              if (p.id === 'default') return toast('기본 프리셋은 지울 수 없어요');
              if (!(await confirmBox(`"${p.name}" 프리셋을 지울까요?`, '삭제', true))) return;
              c.presets = c.presets.filter(x => x !== p); c.preset = c.presets[0].id; save(); draw();
            }))),
          h('div.field',
            h('span.field-label', '지시문', h('button.trx-restore', { type: 'button', title: '이 프리셋의 지시문을 기본 지시문으로 되돌립니다', onclick: async () => { if (await confirmBox('지시문을 기본값으로 되돌릴까요?', '되돌리기')) { p.content = DEFAULT_PROMPT; p.filter = true; save(); draw(); } } }, icon('refresh', 13), '기본값으로')),
            area,
            h('div.trx-vars', VARS.map(([v, d]) => h('button.trx-var', { type: 'button', title: d + ' · 눌러서 넣기', onclick: () => { const at = area.selectionStart ?? area.value.length; area.setRangeText(v, at, area.selectionEnd ?? at, 'end'); area.focus(); p.content = area.value; save(); } }, v)))),
          h('h3.form-sec', '시험 번역'),
          h('div.field', testIn, h('div.trx-row', h('span.hint', `지금 프리셋으로 ${langLabel(c.lang)}(으)로 옮겨 봅니다.`), btn('번역해 보기', { ic: 'play', onclick: runTest })), testOut)));
    };

    // ── 설정 ──
    const options = () => {
      const tok = h('input.inp', { type: 'number', min: 1000, max: 200000, step: 1000, value: c.maxTokens ?? 20000 }), ok = h('span.trx-ok', icon('check', 14), '적용했어요');
      const from = h('input.inp', { type: 'number', min: 1, step: 1, placeholder: '시작 번호' }), to = h('input.inp', { type: 'number', min: 1, step: 1, placeholder: '끝 번호' });
      const n = chat ? translatedCount(msgs) : 0;
      return h('div.card.trx-card',
        h('div.form',
          h('h3.form-sec', '요청'),
          h('div.field.half', h('span.field-label', '최대 응답 토큰 (최대 200,000)'), h('div.trx-row', tok, btn('적용', { onclick: () => { c.maxTokens = clamp(Math.round(+tok.value) || 20000, 1000, 200000); tok.value = c.maxTokens; save(); ok.classList.add('show'); setTimeout(() => ok.classList.remove('show'), 1800); } })), ok),
          field('참고할 앞 메시지 수', h('input.inp', { type: 'number', min: 0, max: 20, value: c.context ?? 3, oninput: e => set(() => { c.context = clamp(Math.round(+e.target.value) || 0, 0, 20); }) }), '이름과 말투를 맞추려고 함께 보내는 앞 메시지 개수. 0 이면 보내지 않습니다.', '.half'),
          check('코드 블록 걸러 내기: ``` 사이의 글만 번역문으로 씁니다 (권장)', p.filter !== false, v => set(() => { p.filter = v; }), `프리셋 "${p.name}" 에 따로 저장됩니다`),
          h('hr.trx-hr'),
          h('h3.form-sec', '단추 보이기'),
          check('보내기 단추 옆에 빠른 입력 번역 단추', c.btnQuick !== false, v => { set(() => { c.btnQuick = v; }); redecorate(); }),
          check('메시지에 번역 단추 (지구본)', c.btnTranslate !== false, v => { set(() => { c.btnTranslate = v; }); redecorate(); }),
          check('메시지에 다시 번역 단추', c.btnRe !== false, v => { set(() => { c.btnRe = v; }); redecorate(); }),
          check('메시지에 번역 고치기 단추', c.btnEdit !== false, v => { set(() => { c.btnEdit = v; }); redecorate(); }),
          h('div.trx-legend', h('span', svg(GLOBE, 15), '번역 · 원문 ↔ 번역 전환'), h('span', svg(SPIRAL, 15), '다시 번역'), h('span', svg(SHEET, 15), '번역 고치기')),
          h('hr.trx-hr'),
          h('h3.form-sec', '번역 기록 지우기'),
          h('div.field',
            h('span.field-label', chat ? `지금 열린 대화 · 메시지 ${msgs.length}개 가운데 ${n}개에 번역이 있어요` : '열린 대화가 없어요. 대화를 연 뒤에 쓸 수 있습니다.'),
            h('div.trx-row.trx-range', from, h('span.trx-tilde', '~'), to, btn('삭제', { cls: 'danger', ic: 'trash', onclick: async () => { if (await deleteRange(from.value, to.value, false)) draw(); } })),
            h('div.trx-row', btn('전체 삭제', { cls: 'danger', onclick: async () => { if (await deleteRange(null, null, true)) draw(); } }), h('span.hint', '번호는 메시지 머리에 보이는 번호(001, 002 …)입니다. 원문은 지워지지 않아요.')))));
    };

    root.replaceChildren(
      h('div.trx-top',
        h('div.trx-seg', [['basic', '기본'], ['options', '설정']].map(([k, l]) => h(`button${sub === k ? '.on' : ''}`, { type: 'button', onclick: () => { sub = k; draw(); } }, l))),
        h('div.trx-state', h('span.badge.on', langLabel(c.lang)), h('span.badge', { title: '자동 번역' }, { none: '자동 꺼짐', responses: '답변 자동', inputs: '입력 자동', both: '답변 · 입력 자동' }[mode]), h('span.badge', p.name))),
      sub === 'basic' ? basic() : options(),
      h('p.hint', '명령어: /translate [메시지 번호] · /translate-text target=언어 글'));
  };
  draw();
  return root;
}
X.studio = X.studio.filter(t => t.owner !== 'translate');
X.studio.push({ owner: 'translate', title: '번역', render });
