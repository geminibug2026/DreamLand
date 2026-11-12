// 꾸미기: 테마 고르기 · 내 테마 편집 · 가져오기/내보내기 · 글자와 배치 · 사용자 CSS
import { useState } from 'react';
import { mod } from '../legacy';
import { Avatar, Btn, IconBtn } from '../kit';
import { toast, confirmBox, LForm, PageHead, S, core, textModal, type Opt } from '../studio/bridge';

interface Theme { id: string; name: string; builtin?: boolean; ext?: string; c: Record<string, string>; sourceCss?: string; bgImage?: string; [k: string]: unknown }
interface ThemeMod {
  allThemes(): Theme[]; currentTheme(): Theme; newCustomTheme(base: Theme): Theme; applyTheme(): void;
  importThemeText(text: string, fileName?: string): Theme | null;
  COLOR_FIELDS: [string, string][]; FONTS: Record<string, { name: string }>;
}
interface FormatMod { render(text: string, o?: { bubbles?: boolean }): string }
interface LookSettings { customThemes?: Theme[]; bubbles?: boolean }

const NAMES = `/* 색 변수 */\n--bg --bg2 --surface --text --dim --accent --accent2\n--say-bg --say-text --user-bg --user-text --nar --think --r\n\n/* 대화 */\n.msg.ai  .msg.user  .msg.sys      메시지 한 덩어리\n.msg-body                         본문\n.msg-body .nar                    지문\n.say > span                       대사 말풍선\n.think > span                     속마음 풍선\n.avatar  .msg-head  .composer-box 초상 · 이름줄 · 입력창\n\n/* 화면 */\n#rail  .chat-side  .chat-top  .drawer  .card  .btn  .inp`;

export const page = { name: 'themes', Component: Themes, needs: ['theme', 'format'] };

/** 내 테마 다듬기: 옛 폼 안에 끼우는 배경 이미지 칸까지 한 벌 */
function Editor({ t, live, use, redraw }: { t: Theme; live: () => void; use: (id: string) => void; redraw: () => void }) {
  const T = mod<ThemeMod>('theme'), C = core();
  const pick = async () => { const [f] = await C.pickFiles({ accept: 'image/*' }); if (!f) return; t.bgImage = await C.shrinkImage(await C.readDataURL(f), 2200, 'image/jpeg', 0.86); live(); };
  // 폼 사이에 들어가는 배경 이미지 칸
  const bg = <div className="field half"><span className="field-label">배경 이미지</span><div className="row"><Btn label="고르기" ic="image" onClick={() => void pick()} /><Btn label="지우기" cls="ghost" onClick={() => { t.bgImage = ''; live(); }} /></div></div>;
  const del = async () => {
    if (!(await confirmBox(`"${t.name}" 테마를 삭제할까요?`, '삭제', true))) return;
    S().set({ customThemes: ((S().settings as LookSettings).customThemes || []).filter(x => x.id !== t.id), theme: 'rosemilk' }); T.applyTheme(); redraw();
  };
  return <div className="card"><div className="row"><h3 className="form-sec">내 테마 다듬기</h3>
    <IconBtn ic="copy" title="복제" onClick={() => { const c = T.newCustomTheme(t); saveCustom(c); use(c.id); }} />
    <IconBtn ic="trash" title="이 테마 삭제" onClick={() => void del()} /></div>
    <LForm obj={t} defs={[{ k: 'name', label: '이름', half: true }, { k: 'tone', label: '바탕', type: 'select', opts: [['light', '밝은 바탕'], ['dark', '어두운 바탕']], half: true, live: true }]} onChange={live} />
    <h3 className="form-sec">색</h3>
    <div className="color-grid">{T.COLOR_FIELDS.map(([k, label]) => <LForm key={k} obj={t.c} defs={[{ k, label, type: 'color', live: true }]} onChange={live} />)}</div>
    <h3 className="form-sec">모양과 배경</h3>
    <LForm obj={t} defs={[{ k: 'radius', label: '모서리 둥글기', type: 'range', min: 0, max: 30, half: true, live: true }, { k: 'glass', label: '패널 투명도 (유리 효과)', type: 'range', min: 0, max: 0.9, step: 0.05, half: true, live: true },
      { k: 'fx', label: '배경 효과', type: 'select', opts: [['none', '없음'], ['petals', '흩날리는 꽃잎'], ['stars', '별빛']], half: true, live: true },
      { k: 'pattern', label: '종이 무늬', type: 'select', opts: [['stars', '잔별'], ['dots', '점 모눈'], ['grid', '모눈'], ['lines', '줄 노트'], ['none', '무늬 없음']], half: true, live: true },
      { el: bg },
      { k: 'bgDim', label: '배경 이미지 가리기 (높을수록 글이 잘 보여요)', type: 'range', min: 0, max: 0.95, step: 0.05, half: true, live: true }, { k: 'bgBlur', label: '배경 이미지 흐림', type: 'range', min: 0, max: 30, half: true, live: true },
      { k: 'css', label: '이 테마 전용 CSS', type: 'area', rows: 4, ph: '.say > span { border-radius: 8px; }' }]} onChange={live} />
    {t.sourceCss ? <p className="hint">다른 프로그램의 테마에서는 색만 옮겨 옵니다. 원본 CSS 는 그 프로그램의 화면 구조에 맞춰져 있어 그대로는 적용되지 않아요. <a href="#" onClick={e => { e.preventDefault(); textModal('원본 CSS', 'regex-out', t.sourceCss || ''); }}>원본 CSS 보기</a></p> : null}
  </div>;
}

function saveCustom(t: Theme) {
  const list = [...((S().settings as LookSettings).customThemes || [])], i = list.findIndex(x => x.id === t.id);
  if (i >= 0) list[i] = t; else list.push(t);
  S().set({ customThemes: list });
}

function Themes() {
  const [epoch, setEpoch] = useState(0), redraw = () => setEpoch(n => n + 1);
  const T = mod<ThemeMod>('theme'), { render } = mod<FormatMod>('format'), C = core();
  const st = S().settings as LookSettings, cur = T.currentTheme(), editable = !cur.builtin && !cur.ext;
  const use = (id: string) => { S().set({ theme: id }); T.applyTheme(); redraw(); };
  const look = () => { S().set({}); T.applyTheme(); };

  const importTheme = async () => {
    const files = await C.pickFiles({ accept: '.json,.css,.txt', multiple: true }); let n = 0, lastId = '';
    for (const f of files) { const t = T.importThemeText(await f.text(), f.name); if (t) { saveCustom(t); lastId = t.id; n++; } }
    if (!files.length) return;
    if (!n) return toast('테마로 읽을 수 없는 파일이에요', 'err');
    toast(`테마 ${n}개를 가져왔어요`, 'ok'); use(lastId);
  };
  const who = S().chars[0] || { name: '세라' }, me = S().persona();
  const fonts: Opt[] = Object.entries(T.FONTS).map(([k, f]) => [k, f.name] as const);

  return <section className="pagebox"><PageHead eyebrow="decorate" title="꾸미기" />
    <div className="card"><div className="row wrap"><h3 className="form-sec">테마</h3>
      <Btn label="테마 가져오기" ic="import" title="드림랜드 · 실리태번 테마 JSON · 마리나라 테마 CSS" onClick={() => void importTheme()} />
      <Btn label="내보내기" ic="upload" cls="ghost" onClick={() => C.download(`${cur.name}.dreamland-theme.json`, JSON.stringify({ app: 'dreamland-theme', version: 1, theme: { ...cur, builtin: false, ext: undefined } }, null, 2))} /></div>
      <div className="theme-grid">{T.allThemes().map(t => <button key={t.id} className={'theme-card' + (t.id === cur.id ? ' on' : '')} title={t.name} onClick={() => use(t.id)}>
        <div className="tc-preview" style={{ background: `linear-gradient(180deg, ${t.c.bg}, ${t.c.bg2 || t.c.bg})` }}><i style={{ background: t.c.sayBg || t.c.surface, boxShadow: '0 1px 4px rgba(0,0,0,.12)' }} /><i style={{ background: t.c.userBg || t.c.accent }} /></div>
        <div className="tc-name" style={{ background: t.c.surface, color: t.c.text }}><span>{t.name}</span><small style={{ color: t.c.dim }}>{t.ext ? '확장' : t.builtin ? '' : '내 테마'}</small></div>
      </button>)}</div></div>
    <div className="preview-chat">
      <article className="msg ai"><Avatar o={who} /><div className="msg-main"><header className="msg-head"><b>{who.name}</b></header><div className="msg-body" dangerouslySetInnerHTML={{ __html: render('창밖으로 저녁빛이 천천히 번져 갔다. 그녀는 찻잔을 내려놓고 이쪽을 바라보았다.\n\n"오늘은 어디까지 이야기했더라?"\n\n\'또 처음부터 들려 달라고 하면 어쩌지.\'', { bubbles: st.bubbles }) }} /></div></article>
      <article className="msg user"><Avatar o={me} /><div className="msg-main"><header className="msg-head"><b>{me.name}</b></header><div className="msg-body" dangerouslySetInnerHTML={{ __html: render('"숲에서 길을 잃은 데까지요." *나는 웃으며 의자를 당겨 앉았다.*', { bubbles: st.bubbles }) }} /></div></article>
    </div>
    {!editable
      ? <div className="card"><h3 className="form-sec">내 테마 만들기</h3><p className="hint">{`"${cur.name}" 은(는) 기본 테마라 직접 고칠 수 없어요. 복사본을 만들어 색·모양·배경을 마음대로 바꿔 보세요.`}</p>
        <div className="row wrap"><Btn label="이 테마를 바탕으로 만들기" ic="edit" cls="primary" onClick={() => { const t = T.newCustomTheme(cur); saveCustom(t); use(t.id); }} /></div></div>
      : <Editor key={cur.id + ':' + epoch} t={cur} live={() => { saveCustom(cur); T.applyTheme(); }} use={use} redraw={redraw} />}
    <div className="card" key={'look' + epoch}><LForm obj={st} defs={[{ section: '글자와 배치' },
      { k: 'font', label: '글꼴', type: 'select', opts: fonts, half: true, live: true }, { k: 'fontCustom', label: '직접 입력 (기기에 설치된 글꼴 이름)', ph: '비워 두면 위에서 고른 글꼴', half: true },
      { k: 'fontSize', label: '대화 글자 크기', type: 'range', min: 13, max: 22, half: true, live: true }, { k: 'lineHeight', label: '줄 간격', type: 'range', min: 1.4, max: 2.3, step: 0.05, half: true, live: true },
      { k: 'chatWidth', label: '대화 폭', type: 'range', min: 520, max: 1280, step: 20, half: true, live: true }, { k: 'avatarShape', label: '초상 모양', type: 'select', opts: [['round', '둥글게'], ['tall', '세로로 길게']], half: true, live: true },
      { k: 'rpBubbles', label: 'RP 모드에서도 대사를 말풍선으로 보여 주기 (끄면 소설처럼 글만)', type: 'check' }, { k: 'motion', label: '움직임과 배경 효과', type: 'check' }]} onChange={look} /></div>
    <div className="card" key={'css' + epoch}><LForm obj={st} defs={[{ section: '사용자 CSS' }, { k: 'customCss', label: '모든 테마에 함께 적용됩니다', type: 'area', rows: 6, ph: '.msg-body { letter-spacing: -0.01em; }' }]} onChange={look} />
      <details className="api-doc"><summary>자주 쓰는 이름</summary><pre>{NAMES}</pre></details></div>
  </section>;
}
