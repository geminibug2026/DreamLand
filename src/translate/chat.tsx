// 번역: 대화 화면에 꽂는 것 — 메시지마다 번역 단추 · 번역 고치기 칸 · 보내기 옆 빠른 번역
import { useEffect, useRef } from 'react';
import { createRoot } from 'react-dom/client';
import { Btn } from '../kit';
import type { Msg } from '../addons/types';
import { errMsg } from '../addons/parts';
import { PathIcon } from '../addons/parts';
import { langLabel } from './lang';
import { artOf, busy, cfg, persist, translate, translateMsg } from './logic';
import { toast } from '../ui';
import { X } from '../lib/hooks';
import { chatApi } from '../chat/actions';
import { t } from '../i18n';

export const GLOBE = 'M12 3a9 9 0 1 0 0 18a9 9 0 0 0 0-18zM3 12h18M12 3c2.6 2.7 3.9 5.7 3.9 9s-1.3 6.3-3.9 9c-2.6-2.7-3.9-5.7-3.9-9s1.3-6.3 3.9-9z';
export const SPIRAL = 'M20 11a8 8 0 1 0-2.3 6.3M20 4v7h-7';   // 다시 번역: 새로 고침 모양
export const SHEET = 'M6 3h9l4 4v14H6zM14 3v5h5M9 12h7M9 16h7';

/** 남의 DOM 사이에 끼우는 자리. 단추가 옛 것처럼 형제로 보이게 display: contents */
const slot = () => { const el = document.createElement('span'); el.className = 'trx-slot'; el.style.display = 'contents'; return el; };

/** 번역문을 메시지 자리에서 바로 고친다. 비우고 저장하면 번역을 지운다 */
function EditBox({ value, onClose, onDone }: { value: string; onClose: () => void; onDone: (v: string) => void }) {
  const ta = useRef<HTMLTextAreaElement>(null), text = useRef(value);   // 마지막으로 적은 글 (상자가 먼저 내려가도 잃지 않게)
  const fit = () => { const el = ta.current; if (!el) return; el.style.height = 'auto'; el.style.height = Math.min(el.scrollHeight + 4, innerHeight * 0.6) + 'px'; };
  useEffect(() => { fit(); ta.current?.focus({ preventScroll: true }); }, []);
  return <>
    <div className="trx-edit-head"><PathIcon d={SHEET} size={15} /><b>{t('translate.edit.title')}</b><span>{t('translate.edit.hint')}</span></div>
    <textarea className="inp trx-edit-area" ref={ta} defaultValue={value} spellCheck={false} onInput={e => { text.current = e.currentTarget.value; fit(); }}
      onKeyDown={e => { if (e.key === 'Escape') { e.stopPropagation(); onClose(); } if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) onDone(text.current); }} />
    <div className="row end"><Btn label={t('common.cancel')} cls="ghost" onClick={onClose} /><Btn label={t('common.save')} cls="primary" ic="check" onClick={() => onDone(text.current)} /></div>
  </>;
}
function editTranslation(m: Msg) {
  const { chat, msgs } = chatApi.current(); const s = m?.swipes?.[m.sw];
  if (!chat || !s?.tr) return toast(t('translate.edit.none'));
  const art = artOf(m.id), body = art?.querySelector<HTMLElement>('.msg-body');
  if (!art || !body || art.querySelector('.trx-edit')) return;
  const box = document.createElement('div'); box.className = 'trx-edit';
  const root = createRoot(box);
  const close = () => { if (closed) return; closed = true; root.unmount(); box.remove(); body.style.display = ''; art.classList.remove('trx-editing'); };
  let closed = false;
  const done = async (v: string) => { if (closed) return; if (v.trim()) { s.tr = v; s.showTr = true; } else { delete s.tr; s.showTr = false; } close(); await persist(chat, msgs); };
  body.style.display = 'none'; body.after(box); art.classList.add('trx-editing');
  root.render(<EditBox value={s.tr} onClose={close} onDone={v => void done(v)} />);
}

// ── 보내기 옆 빠른 번역 ──
let quickBusy = false;
async function quickTranslate(b: HTMLButtonElement) {
  if (quickBusy) return;
  const ta = b.closest('.composer-box')?.querySelector('textarea'); if (!ta) return;
  const st = ta.selectionStart, en = ta.selectionEnd, part = en > st && en - st < ta.value.length;
  const src = part ? ta.value.slice(st, en) : ta.value;
  if (!src.trim()) return toast(t('chat.translate.empty'));
  quickBusy = true; b.classList.add('busy');
  try {
    const out = await (X.translate || translate)(src, cfg().inputLang || 'English', { chat: chatApi.current().chat });
    // React 가 쥔 입력창도 값이 바뀐 것을 알도록 원래 setter 로 넣는다
    const next = part ? ta.value.slice(0, st) + out + ta.value.slice(en) : out;
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set?.call(ta, next);
    ta.dispatchEvent(new Event('input', { bubbles: true })); ta.focus();
  } catch (e) { toast(t('chat.translate.fail', { err: errMsg(e) }), 'err'); }
  finally { quickBusy = false; b.classList.remove('busy'); }
}

// ── 메시지마다 단추 달기 ──
interface BtnDef { cls: string; d: string; title: string; mark: string; fn: (m: Msg) => void }
function MsgBtns({ id, list }: { id: string; list: BtnDef[] }) {
  return <>{list.map(b => <button key={b.cls} type="button" className={`ibtn trx-btn ${b.cls} ${b.mark}`.trim()} title={b.title} aria-label={b.title}
    onClick={() => { const cur = chatApi.current().msgs.find(x => x.id === id); if (cur) b.fn(cur); }}><PathIcon d={b.d} /></button>)}</>;
}
function decorate() {
  const c = cfg(), { msgs } = chatApi.current();
  for (const tools of document.querySelectorAll<HTMLElement>('article.msg[data-id] .msg-tools:not([data-trx])')) {
    tools.dataset.trx = '1';
    const art = tools.closest<HTMLElement>('article.msg'); if (!art || art.classList.contains('sys')) continue;
    const m = msgs.find(x => x.id === art.dataset.id), s = m?.swipes?.[m.sw]; if (!m || !s) continue;
    const wait = busy.has(m.id) ? 'busy' : '';
    const add: BtnDef[] = [];
    if (c.btnTranslate !== false) add.push({ cls: 'trx-go', d: GLOBE, title: s.tr ? (s.showTr ? t('chat.msgMenu.original') : t('chat.msgMenu.showTr')) : t('chat.msgMenu.translate'), mark: [wait, s.tr ? (s.showTr ? 'on' : 'has') : ''].filter(Boolean).join(' '), fn: x => void translateMsg(x) });
    if (c.btnRe !== false) add.push({ cls: 'trx-re', d: SPIRAL, title: t('chat.msgMenu.retranslate'), mark: wait, fn: x => void translateMsg(x, true) });
    if (c.btnEdit !== false) add.push({ cls: 'trx-ed', d: SHEET, title: t('chat.translate.edit'), mark: s.tr ? '' : 'idle', fn: editTranslation });
    if (!add.length) continue;
    const host = slot(), more = [...tools.children].find(x => (x as HTMLElement).title === t('chat.msg.more'));
    if (more) more.before(host); else tools.append(host);
    createRoot(host).render(<MsgBtns id={m.id} list={add} />);
    if (s.tr && s.showTr) art.classList.add('trx-shown');
  }
  const box = document.querySelector('.composer-box'), have = box?.querySelector('.trx-quick');
  if (box && c.btnQuick === false) have?.closest('.trx-slot')?.remove();
  else if (box && !have && !box.querySelector('.trx-slot')) {
    const host = slot();
    (box.querySelector('.send') || box.lastElementChild)?.before(host);
    createRoot(host).render(<button type="button" className="trx-quick" title={t('translate.quick.title', { lang: langLabel(c.inputLang || 'English') })} aria-label={t('translate.quick.aria')}
      onClick={e => void quickTranslate(e.currentTarget)}><PathIcon d={GLOBE} size={19} /></button>);
  }
}
/** 설정이 바뀌면 단추를 다시 단다 */
export function redecorate() {
  document.querySelectorAll('.trx-slot').forEach(b => b.remove());
  document.querySelectorAll<HTMLElement>('.msg-tools[data-trx]').forEach(t => delete t.dataset.trx);
  decorate();
}
let queued = false;
/** 대화 화면이 다시 그려질 때마다 단추를 단다 */
export function watchChat() {
  // 다음 그림 때 한 번. 그림이 멈춘 창(뒤에 숨은 탭)에서도 단추가 빠지지 않게 잠깐 뒤에도 한 번 본다
  const run = () => { if (!queued) return; queued = false; try { decorate(); } catch (e) { console.warn('[번역 단추]', e); } };
  new MutationObserver(() => { if (queued) return; queued = true; requestAnimationFrame(run); setTimeout(run, 100); }).observe(document.documentElement, { childList: true, subtree: true });
}
