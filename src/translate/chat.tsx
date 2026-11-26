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
import { esc } from '../lib/core';
import { chatApi } from '../chat/actions';
import { onFrame } from '../lib/frame';
import { t } from '../i18n';

export const GLOBE = 'M12 3a9 9 0 1 0 0 18a9 9 0 0 0 0-18zM3 12h18M12 3c2.6 2.7 3.9 5.7 3.9 9s-1.3 6.3-3.9 9c-2.6-2.7-3.9-5.7-3.9-9s1.3-6.3 3.9-9z';
export const SPIRAL = 'M4 8h13M14 4.5l3.5 3.5L14 11.5M20 16H7M10 12.5 6.5 16l3.5 3.5';   // 다시 번역: 오가는 두 화살표 (답변 다시 생성의 둥근 화살표와 헷갈리지 않게)
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
// 단추는 React 뿌리 없이 그대로 만들어 끼운다 (메시지마다 뿌리를 하나씩 세우면 목록을 새로 그릴 때마다 수백 개가 생겨 화면이 멈춘다). 누름은 문서에서 한 번에 받는다
interface BtnDef { act: 'go' | 're' | 'ed'; d: string; title: string; mark: string }
const ACTS: Record<BtnDef['act'], (m: Msg) => void> = { go: m => void translateMsg(m), re: m => void translateMsg(m, true), ed: m => editTranslation(m) };
const btnHtml = (b: BtnDef) => `<button type="button" class="${`ibtn trx-btn trx-${b.act} ${b.mark}`.trim()}" title="${esc(b.title)}" aria-label="${esc(b.title)}" data-trx-act="${b.act}"><svg viewBox="0 0 24 24" width="18" height="18" class="ic"><path d="${b.d}" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg></button>`;
// 같은 꼴의 단추 묶음은 한 번만 만들어 두고 베껴 쓴다 (칸마다 HTML 을 새로 읽으면 메시지 수백 개에서 느리다)
const btnTpl = new Map<string, HTMLTemplateElement>();
function btnsOf(list: BtnDef[]): Node {
  const key = list.map(b => `${b.act}|${b.mark}|${b.title}`).join('\n'); let tp = btnTpl.get(key);
  if (!tp) { tp = document.createElement('template'); tp.innerHTML = list.map(btnHtml).join(''); if (btnTpl.size > 60) btnTpl.clear(); btnTpl.set(key, tp); }
  return tp.content.cloneNode(true);
}
let wired = false;
function wire() {
  if (wired) return; wired = true;
  document.addEventListener('click', e => {
    const b = e.target instanceof Element ? e.target.closest<HTMLElement>('.trx-btn[data-trx-act]') : null; if (!b) return;
    const id = b.closest<HTMLElement>('article.msg')?.dataset.id, m = id ? chatApi.current().msgs.find(x => x.id === id) : undefined;
    if (m) ACTS[b.dataset.trxAct as BtnDef['act']]?.(m);
  }, true);
}
/** 꾸밀 단추 칸. within 이 있으면 그 노드들 안에서만 찾는다 */
function toolsIn(within?: Iterable<Element>): HTMLElement[] {
  if (!within) return [...document.querySelectorAll<HTMLElement>('article.msg[data-id] .msg-tools:not([data-trx])')];
  const out = new Set<HTMLElement>();
  for (const n of within) { if (!n.isConnected) continue;
    if (n.matches('.msg-tools:not([data-trx])')) { if (n.closest('article.msg[data-id]')) out.add(n as HTMLElement); }
    else for (const x of n.querySelectorAll<HTMLElement>('.msg-tools:not([data-trx])')) if (x.closest('article.msg[data-id]')) out.add(x); }
  return [...out];
}
function decorate(within?: Iterable<Element>) {
  wire();
  const c = cfg(), { msgs } = chatApi.current(), moreTitle = t('chat.msg.more');
  let byId: Map<string, (typeof msgs)[number]> | null = null;   // 메시지가 수천 개여도 칸마다 처음부터 찾지 않게 (꾸밀 칸이 있을 때만 만든다)
  for (const tools of toolsIn(within)) {
    tools.dataset.trx = '1';
    const art = tools.closest<HTMLElement>('article.msg'); if (!art || art.classList.contains('sys')) continue;
    const m = (byId ||= new Map(msgs.map(x => [x.id, x]))).get(art.dataset.id || ''), s = m?.swipes?.[m.sw]; if (!m || !s) continue;
    const wait = busy.has(m.id) ? 'busy' : '';
    const add: BtnDef[] = [];
    if (c.btnTranslate !== false) add.push({ act: 'go', d: GLOBE, title: s.tr ? (s.showTr ? t('chat.msgMenu.original') : t('chat.msgMenu.showTr')) : t('chat.msgMenu.translate'), mark: [wait, s.tr ? (s.showTr ? 'on' : 'has') : ''].filter(Boolean).join(' ') });
    if (c.btnRe !== false) add.push({ act: 're', d: SPIRAL, title: t('chat.msgMenu.retranslate'), mark: wait });
    if (c.btnEdit !== false) add.push({ act: 'ed', d: SHEET, title: t('chat.translate.edit'), mark: s.tr ? '' : 'idle' });
    if (!add.length) continue;
    const host = slot(), more = [...tools.children].find(x => (x as HTMLElement).title === moreTitle);
    host.append(btnsOf(add));
    if (more) more.before(host); else tools.append(host);
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
  // 새로 생긴 노드를 모아 두었다가 다음 그림 때 그 안에서만 꾸민다. 그림이 멈춘 창(뒤에 숨은 탭)에서도 단추가 빠지지 않게 잠깐 뒤에도 한 번 본다
  let fresh = new Set<Element>();
  const run = () => { if (!queued) return; queued = false; const got = fresh; fresh = new Set(); try { decorate(got); } catch (e) { console.warn('[번역 단추]', e); } };
  // 단추 칸(.msg-tools) · 입력창 틀이 새로 생겼을 때만 (답변이 흘러나오며 본문 글이 바뀔 때마다 문서 전체를 뒤지지 않게)
  const has = (n: Node): n is Element => n.nodeType === 1 && ((n as Element).matches('article.msg, .msg-tools, .composer-box, .send') || !!(n as Element).querySelector('.msg-tools, .composer-box'));
  new MutationObserver(recs => {
    let hit = false;
    for (const r of recs) for (const n of r.addedNodes) if (has(n)) { fresh.add(n); hit = true; }
    if (hit && !queued) { queued = true; onFrame(run); setTimeout(run, 100); }
  }).observe(document.documentElement, { childList: true, subtree: true });
}
