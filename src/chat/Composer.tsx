// 입력창: 글상자 · / 명령 목록 · 빠른 버튼 · 화자 고르기 · 이미지 첨부 · 보내기/멈추기
import { useEffect, useLayoutEffect, useReducer, useRef, type MouseEvent } from 'react';
import { Avatar, Icon, IconBtn } from '../kit';
import { menu, promptBox } from '../ui';
import { bump, cur, ui, useCh } from './store';
import { charsOf, closeScene, command, commandList, generate, modeOf, openScene, running, send, stopAll, translateInput } from './actions';
import type { CmdItem } from './types';
import { enterSends } from '../features/usersettings';
import { S, pickFiles, readDataURL, shrinkImage } from '../lib/core';
import { X } from '../lib/hooks';
import { t } from '../i18n';
import { QrBar } from '../stscript/QrBar';

/**
 * 입력창에 / 를 치면 뜨는 명령어 목록. attach 는 반드시 보내기 단축키보다 먼저 붙여야 한다 —
 * 목록이 열려 있을 때의 Enter · Tab 은 명령어를 채워 넣는 데 쓴다.
 */
function useSlash(list: () => CmdItem[]) {
  const [, redraw] = useReducer((x: number) => x + 1, 0);
  const c = useRef({ items: [] as CmdItem[], sel: 0, open: false, one: false, used: false, input: null as HTMLTextAreaElement | null }).current;
  const pop = useRef<HTMLDivElement>(null);
  const token = () => { const inp = c.input; if (!inp) return null; const v = inp.value, caret = inp.selectionStart ?? v.length; if (!v.startsWith('/')) return null; const sp = v.search(/\s/); return { word: (sp < 0 ? v : v.slice(0, sp)).toLowerCase(), typing: sp < 0 || caret <= sp }; };
  const close = () => { if (!c.open) return; c.open = false; redraw(); };
  const fill = (it: CmdItem) => { const inp = c.input; if (!inp) return; inp.value = it.cmd + ' '; inp.dispatchEvent(new Event('input', { bubbles: true })); inp.focus(); inp.setSelectionRange(inp.value.length, inp.value.length); };
  const draw = () => {
    const t = token(); if (!t) return close();
    const all = list();
    if (t.typing) {
      const q = t.word, hit = (it: CmdItem) => it.cmd.startsWith(q) || (it.alias || []).some(a => a.startsWith(q));
      c.items = [...all.filter(hit), ...all.filter(it => !hit(it) && q.length > 1 && (it.cmd.includes(q.slice(1)) || (it.help || '').includes(q.slice(1))))];
    } else c.items = all.filter(it => it.cmd === t.word || (it.alias || []).includes(t.word)).slice(0, 1);   // 명령어를 다 쳤으면 그 명령어의 쓰는 법만 남긴다
    if (!c.items.length) return close();
    c.sel = Math.min(c.sel, c.items.length - 1); c.open = true; c.used = true; c.one = !t.typing; redraw();
  };
  useLayoutEffect(() => { if (c.open) pop.current?.querySelector('.on')?.scrollIntoView({ block: 'nearest' }); });
  const attach = (inp: HTMLTextAreaElement) => {
    c.input = inp;
    const onInput = () => { c.sel = 0; draw(); }, onBlur = () => { setTimeout(close, 120); };
    const onKey = (e: KeyboardEvent) => {
      if (!c.open || e.isComposing) return;
      const t = token(); if (!t) return close();
      if (e.key === 'Escape') { e.preventDefault(); e.stopImmediatePropagation(); return close(); }
      if (!t.typing) return;
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); e.stopImmediatePropagation(); c.sel = (c.sel + (e.key === 'ArrowDown' ? 1 : c.items.length - 1)) % c.items.length; return draw(); }
      const it = c.items[c.sel]; if (!it) return;
      if (e.key === 'Tab' || (e.key === 'Enter' && !e.shiftKey && t.word !== it.cmd && !(it.alias || []).includes(t.word))) { e.preventDefault(); e.stopImmediatePropagation(); fill(it); }
    };
    inp.addEventListener('input', onInput); inp.addEventListener('click', draw); inp.addEventListener('blur', onBlur); inp.addEventListener('keydown', onKey);
    return () => { inp.removeEventListener('input', onInput); inp.removeEventListener('click', draw); inp.removeEventListener('blur', onBlur); inp.removeEventListener('keydown', onKey); };
  };
  const node = c.used ? <div className={'slash-pop' + (c.one ? ' one' : '')} hidden={!c.open} role="listbox" ref={pop}>{c.items.map((it, i) =>
    <button key={it.cmd} type="button" role="option" className={'slash-row' + (i === c.sel ? ' on' : '')} onMouseDown={e => { e.preventDefault(); fill(it); }}>
      <code>{it.cmd}</code>{it.args ? <i>{it.args}</i> : null}<span>{it.help || ''}</span>{it.alias?.length ? <small>{it.alias.join(' ')}</small> : null}</button>)}</div> : null;
  return { node, attach };
}

function SendBtn() {
  useCh('busy');
  const b = running();   // 답변 · 답변 전 준비 · QR 이 도는 동안은 멈추기 단추
  return <button className={'send' + (b ? ' busy' : '')} title={b ? t('chat.composer.stop') : t('chat.composer.send')} onClick={() => { if (running()) stopAll(); else void send(); }}><Icon name={b ? 'stop' : 'send'} size={20} /></button>;
}
function Attach() {
  useCh('attach');
  return <div className="attach">{cur.attach.map((u, i) => <div className="attach-item" key={i}><img src={u} /><IconBtn ic="x" title={t('chat.composer.removeImage')} cls="tiny" onClick={() => { cur.attach.splice(i, 1); bump('attach'); }} /></div>)}</div>;
}
async function addImages(files: File[]) {
  for (const f of files) { if (!f.type.startsWith('image/')) continue; cur.attach.push(await shrinkImage(await readDataURL(f), 1568, 'image/jpeg', 0.88)); }
  bump('attach');
}

export function Composer() {
  useCh('composer');
  const chat = cur.chat!, chars = charsOf(chat), talk = modeOf(chat) === 'talk';
  const input = useRef<HTMLTextAreaElement>(null);
  const slash = useSlash(commandList);
  const fit = () => { const el = input.current; if (!el) return; el.style.height = 'auto'; el.style.height = Math.min(el.scrollHeight, 220) + 'px'; };
  // 확장이 입력창에 직접 글을 넣고 input 알림을 보내므로(위로 퍼지지 않는 알림) 요소에 바로 붙여 듣는다
  useEffect(() => {
    const el = input.current; if (!el) return;
    ui.input = el;
    el.addEventListener('input', fit);
    const offSlash = slash.attach(el);   // 보내기 단축키보다 먼저 붙인다
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Enter' && !e.isComposing && ((enterSends() && !e.shiftKey) || e.ctrlKey || e.metaKey)) { e.preventDefault(); if (!running()) void send(); } };
    const onPaste = (e: ClipboardEvent) => { const fs = [...(e.clipboardData?.files || [])].filter(f => f.type.startsWith('image/')); if (fs.length) { e.preventDefault(); void addImages(fs); } };
    el.addEventListener('keydown', onKey); el.addEventListener('paste', onPaste);
    return () => { el.removeEventListener('input', fit); offSlash(); el.removeEventListener('keydown', onKey); el.removeEventListener('paste', onPaste); if (ui.input === el) ui.input = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const plus = (e: MouseEvent<HTMLButtonElement>) => menu(e.currentTarget, [
    { label: t('chat.composer.impersonate'), ic: 'feather', hint: t('chat.composer.impersonateHint'), onclick: () => void generate('impersonate') },
    { label: t('chat.composer.continue'), ic: 'play', onclick: () => void generate('continue') },
    { label: t('chat.composer.narrate'), ic: 'note', onclick: async () => { const v = await promptBox(t('chat.composer.narrateTitle'), '', { area: true }); if (v) void command('/sys ' + v); } },
    { label: t('chat.composer.roll'), ic: 'dice', onclick: async () => { const v = await promptBox(t('chat.composer.rollTitle'), '1d20'); if (v) void command('/roll ' + v); } },
    { label: t('chat.composer.translateInput'), ic: 'lang', hint: S.settings.translate.inputLang, onclick: () => void translateInput() },
    ...X.composer.map(a => ({ label: a.label, ic: a.icon || 'sparkle', onclick: () => { if (input.current) void a.run(input.current); } })),
    '-',
    { label: t('chat.composer.cmdHelp'), ic: 'code', onclick: () => void command('/help') },
  ]);
  const muted = new Set(chat.muted || []), lastAi = [...cur.msgs].reverse().find(m => m.role === 'assistant')?.charId;
  return <footer className="composer">
    {chars.length > 1 ? <div className="speakers"><span className="speakers-label">{t('chat.composer.whoSpeaks')}</span>{chars.map((c, i) =>
      <button key={c.id} className={['speaker', muted.has(c.id) && 'muted', lastAi === c.id && 'last'].filter(Boolean).join(' ')} title={muted.has(c.id) ? t('chat.composer.speakerMuted', { name: c.name }) : t('chat.composer.speakerTurn', { name: c.name })} onClick={() => void generate('normal', { speaker: c })}>
        <Avatar o={c} cls="sm" /><small>{String(i + 1).padStart(2, '0')}</small><span>{c.name}</span></button>)}</div> : null}
    <div className="quick"><QrBar chat={chat} />
      {talk ? (chat.scene?.on
        ? <button className="chip scene-chip on" title={t('chat.composer.closeSceneHint')} onClick={() => void closeScene()}>{t('chat.composer.closeScene')}</button>
        : <button className="chip scene-chip" title={t('chat.composer.openSceneHint')} onClick={async () => { const v = await promptBox(t('chat.composer.openScenePrompt'), '', { placeholder: t('chat.composer.openScenePlaceholder') }); if (v !== null) void openScene({ title: v.trim() }); }}>{t('chat.composer.openScene')}</button>) : null}</div>
    <Attach />
    <div className="composer-box">
      <IconBtn ic="plus" title={t('chat.composer.more')} onClick={plus} />
      <IconBtn ic="image" title={t('chat.composer.attach')} onClick={async () => addImages(await pickFiles({ accept: 'image/*', multiple: true }))} />
      <textarea className="composer-input" ref={input} rows={1} spellCheck={false} placeholder={talk ? t('chat.composer.placeholderTalk') : t('chat.composer.placeholderRp')} />
      <SendBtn />
    </div>
    {slash.node}
  </footer>;
}
