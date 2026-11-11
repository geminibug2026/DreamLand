// ── Dreamland themes: 꾸미기 화면 (테마 고르기 · 내 테마 편집 · 가져오기/내보내기) ──
import { S, h, download, pickFiles, readDataURL, shrinkImage } from './core.js';
import { icon, btn, iconBtn, toast, modal, confirmBox, form, registerPage, refresh, avatar, pageHead } from './ui.js';
import { allThemes, currentTheme, newCustomTheme, applyTheme, importThemeText, COLOR_FIELDS, FONTS } from './theme.js';
import { render } from './format.js';

const saveCustom = t => { const list = [...(S.settings.customThemes || [])]; const i = list.findIndex(x => x.id === t.id); if (i >= 0) list[i] = t; else list.push(t); S.set({ customThemes: list }); };
const use = id => { S.set({ theme: id }); applyTheme(); refresh(); };

registerPage('themes', root => {
  const st = S.settings, cur = currentTheme(), editable = !cur.builtin && !cur.ext;

  const cards = h('div.theme-grid', allThemes().map(t => h(`button.theme-card${t.id === cur.id ? '.on' : ''}`, { onclick: () => use(t.id), title: t.name },
    h('div.tc-preview', { style: { background: `linear-gradient(180deg, ${t.c.bg}, ${t.c.bg2 || t.c.bg})` } }, h('i', { style: { background: t.c.sayBg || t.c.surface, boxShadow: '0 1px 4px rgba(0,0,0,.12)' } }), h('i', { style: { background: t.c.userBg || t.c.accent } })),
    h('div.tc-name', { style: { background: t.c.surface, color: t.c.text } }, h('span', t.name), h('small', { style: { color: t.c.dim } }, t.ext ? '확장' : t.builtin ? '' : '내 테마')))));

  const importTheme = async () => {
    const files = await pickFiles({ accept: '.json,.css,.txt', multiple: true }); let n = 0, lastId = '';
    for (const f of files) { const t = importThemeText(await f.text(), f.name); if (t) { saveCustom(t); lastId = t.id; n++; } }
    if (!files.length) return;
    if (!n) return toast('테마로 읽을 수 없는 파일이에요', 'err');
    toast(`테마 ${n}개를 가져왔어요`, 'ok'); use(lastId);
  };

  let editor;
  if (!editable) {
    editor = h('div.card', h('h3.form-sec', '내 테마 만들기'), h('p.hint', `"${cur.name}" 은(는) 기본 테마라 직접 고칠 수 없어요. 복사본을 만들어 색·모양·배경을 마음대로 바꿔 보세요.`),
      h('div.row.wrap', btn('이 테마를 바탕으로 만들기', { ic: 'edit', cls: 'primary', onclick: () => { const t = newCustomTheme(cur); saveCustom(t); use(t.id); } })));
  } else {
    const t = cur; const live = () => { saveCustom(t); applyTheme(); };
    editor = h('div.card', h('div.row', h('h3.form-sec', '내 테마 다듬기'),
      iconBtn('copy', '복제', () => { const c = newCustomTheme(t); saveCustom(c); use(c.id); }),
      iconBtn('trash', '이 테마 삭제', async () => { if (!(await confirmBox(`"${t.name}" 테마를 삭제할까요?`, '삭제', true))) return; S.set({ customThemes: st.customThemes.filter(x => x.id !== t.id), theme: 'rosemilk' }); applyTheme(); refresh(); })),
      form(t, [{ k: 'name', label: '이름', half: true }, { k: 'tone', label: '바탕', type: 'select', opts: [['light', '밝은 바탕'], ['dark', '어두운 바탕']], half: true, live: true }], live),
      h('h3.form-sec', '색'),
      h('div.color-grid', COLOR_FIELDS.map(([k, label]) => form(t.c, [{ k, label, type: 'color', live: true }], live))),
      h('h3.form-sec', '모양과 배경'),
      form(t, [{ k: 'radius', label: '모서리 둥글기', type: 'range', min: 0, max: 30, half: true, live: true }, { k: 'glass', label: '패널 투명도 (유리 효과)', type: 'range', min: 0, max: 0.9, step: 0.05, half: true, live: true },
        { k: 'fx', label: '배경 효과', type: 'select', opts: [['none', '없음'], ['petals', '흩날리는 꽃잎'], ['stars', '별빛']], half: true, live: true },
        { k: 'pattern', label: '종이 무늬', type: 'select', opts: [['stars', '잔별'], ['dots', '점 모눈'], ['grid', '모눈'], ['lines', '줄 노트'], ['none', '무늬 없음']], half: true, live: true },
        { el: h('div.field.half', h('span.field-label', '배경 이미지'), h('div.row', btn('고르기', { ic: 'image', onclick: async () => { const [f] = await pickFiles({ accept: 'image/*' }); if (!f) return; t.bgImage = await shrinkImage(await readDataURL(f), 2200, 'image/jpeg', 0.86); live(); } }), btn('지우기', { cls: 'ghost', onclick: () => { t.bgImage = ''; live(); } }))) },
        { k: 'bgDim', label: '배경 이미지 가리기 (높을수록 글이 잘 보여요)', type: 'range', min: 0, max: 0.95, step: 0.05, half: true, live: true }, { k: 'bgBlur', label: '배경 이미지 흐림', type: 'range', min: 0, max: 30, half: true, live: true },
        { k: 'css', label: '이 테마 전용 CSS', type: 'area', rows: 4, ph: '.say > span { border-radius: 8px; }' }], live),
      t.sourceCss ? h('p.hint', '다른 프로그램의 테마에서는 색만 옮겨 옵니다. 원본 CSS 는 그 프로그램의 화면 구조에 맞춰져 있어 그대로는 적용되지 않아요. ', h('a', { href: '#', onclick: e => { e.preventDefault(); modal({ title: '원본 CSS', wide: true, body: h('pre.regex-out', t.sourceCss) }); } }, '원본 CSS 보기')) : null);
  }

  const who = S.chars[0] || { name: '세라' }, me = S.persona();
  const sample = h('div.preview-chat',
    h('article.msg.ai', avatar(who), h('div.msg-main', h('header.msg-head', h('b', who.name)), h('div.msg-body', { html: render('창밖으로 저녁빛이 천천히 번져 갔다. 그녀는 찻잔을 내려놓고 이쪽을 바라보았다.\n\n"오늘은 어디까지 이야기했더라?"\n\n\'또 처음부터 들려 달라고 하면 어쩌지.\'', { bubbles: st.bubbles }) }))),
    h('article.msg.user', avatar(me), h('div.msg-main', h('header.msg-head', h('b', me.name)), h('div.msg-body', { html: render('"숲에서 길을 잃은 데까지요." *나는 웃으며 의자를 당겨 앉았다.*', { bubbles: st.bubbles }) }))));

  const look = () => { S.set({}); applyTheme(); };
  root.append(h('section.pagebox',
    pageHead('decorate', '꾸미기'),
    h('div.card', h('div.row.wrap', h('h3.form-sec', '테마'), btn('테마 가져오기', { ic: 'import', onclick: importTheme, title: '드림랜드 · 실리태번 테마 JSON · 마리나라 테마 CSS' }), btn('내보내기', { ic: 'upload', cls: 'ghost', onclick: () => download(`${cur.name}.dreamland-theme.json`, JSON.stringify({ app: 'dreamland-theme', version: 1, theme: { ...cur, builtin: false, ext: undefined } }, null, 2)) })), cards),
    sample, editor,
    h('div.card', form(st, [{ section: '글자와 배치' },
      { k: 'font', label: '글꼴', type: 'select', opts: Object.entries(FONTS).map(([k, f]) => [k, f.name]), half: true, live: true }, { k: 'fontCustom', label: '직접 입력 (기기에 설치된 글꼴 이름)', ph: '비워 두면 위에서 고른 글꼴', half: true },
      { k: 'fontSize', label: '대화 글자 크기', type: 'range', min: 13, max: 22, half: true, live: true }, { k: 'lineHeight', label: '줄 간격', type: 'range', min: 1.4, max: 2.3, step: 0.05, half: true, live: true },
      { k: 'chatWidth', label: '대화 폭', type: 'range', min: 520, max: 1280, step: 20, half: true, live: true }, { k: 'avatarShape', label: '초상 모양', type: 'select', opts: [['round', '둥글게'], ['tall', '세로로 길게']], half: true, live: true },
      { k: 'rpBubbles', label: 'RP 모드에서도 대사를 말풍선으로 보여 주기 (끄면 소설처럼 글만)', type: 'check' }, { k: 'motion', label: '움직임과 배경 효과', type: 'check' }], look)),
    h('div.card', form(st, [{ section: '사용자 CSS' }, { k: 'customCss', label: '모든 테마에 함께 적용됩니다', type: 'area', rows: 6, ph: '.msg-body { letter-spacing: -0.01em; }' }], look),
      h('details.api-doc', h('summary', '자주 쓰는 이름'), h('pre', `/* 색 변수 */\n--bg --bg2 --surface --text --dim --accent --accent2\n--say-bg --say-text --user-bg --user-text --nar --think --r\n\n/* 대화 */\n.msg.ai  .msg.user  .msg.sys      메시지 한 덩어리\n.msg-body                         본문\n.msg-body .nar                    지문\n.say > span                       대사 말풍선\n.think > span                     속마음 풍선\n.avatar  .msg-head  .composer-box 초상 · 이름줄 · 입력창\n\n/* 화면 */\n#rail  .chat-side  .chat-top  .drawer  .card  .btn  .inp`)))));
});
