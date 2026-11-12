// 표정: 대화 화면에 반영 (초상 · 아바타 · 스탠딩). 대화 화면이 그린 DOM 위에 그림을 얹는 층이라 DOM 을 직접 다룬다
import { L } from '../legacy';
import { B, type CharX, type ChatX, type Msg } from '../addons/legacy';
import { openPicker } from './Picker';
import { Sprites, bus, cfg, charIdOf, currentOf, exprOf, lastReply, live, nameOf, pickSprite, toggleStanding, type ExprState, type Sprite } from './store';

type Pic = Pick<Sprite, 'id' | 'data'>;
const el = <K extends keyof HTMLElementTagNameMap>(tag: K, cls = '', text = ''): HTMLElementTagNameMap[K] => { const e = document.createElement(tag); if (cls) e.className = cls; if (text) e.textContent = text; return e; };
function iconEl(name: string, size: number): SVGSVGElement {
  const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); s.setAttribute('viewBox', '0 0 24 24'); s.setAttribute('width', String(size)); s.setAttribute('height', String(size)); s.classList.add('ic');
  s.innerHTML = `<path d="${L.ui.I[name] || L.ui.I.sparkle}" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/>`; return s;
}

const shown = new Map<string, string>();   // 자리 → 마지막으로 보여 준 그림 id (화면이 다시 그려져도 부드럽게 잇기 위해)
/** host 안에 표정 그림 한 장을 깐다. 바뀌면 겹쳐서 서서히 */
function setImg(host: Element, sprite: Pic | null | undefined, slot: string, { fade = true, cross = false } = {}) {
  const imgs = [...host.querySelectorAll<HTMLImageElement>(':scope > img.exs-img')], cur = imgs.find(x => !x.classList.contains('out'));
  if (!sprite) { imgs.forEach(x => x.remove()); host.classList.remove('exs-has'); if (slot) shown.delete(slot); return; }
  if (cur?.dataset.sid === sprite.id) return;
  const mk = (sp: Pic) => { const img = el('img', 'exs-img'); img.src = sp.data; img.alt = ''; img.dataset.sid = sp.id; img.draggable = false; return img; };
  host.classList.add('exs-has');
  let old = cur;
  if (!old && fade && slot && shown.has(slot) && shown.get(slot) !== sprite.id) { const prev = Sprites.find(shown.get(slot)!); if (prev) { old = mk(prev); host.append(old); } }
  if (slot) shown.set(slot, sprite.id);
  const img = mk(sprite);
  if (!old || !fade || B.S.settings.motion === false) { host.querySelectorAll(':scope > img.exs-img').forEach(x => x.remove()); host.append(img); return; }
  imgs.filter(x => x !== old).forEach(x => x.remove());
  img.classList.add('in'); host.append(img);
  if (cross) old.classList.add('out'); else old.classList.add('under');
  requestAnimationFrame(() => requestAnimationFrame(() => img.classList.remove('in')));
  const gone = old; setTimeout(() => gone.remove(), 460);
}

function applyAvatars(layout: Element, chat: ChatX, msgs: Msg[]) {
  const c = cfg(), box = layout.querySelector('.msgs'); if (!box) return;
  const byId = new Map(msgs.map(m => [m.id, m]));
  for (const art of box.querySelectorAll<HTMLElement>(':scope > article.msg.ai')) {
    const av = art.querySelector<HTMLElement>(':scope > .avatar'); if (!av) continue;
    const m = byId.get(art.dataset.id || ''), label = m && c.show && c.avatars ? exprOf(m) : '';
    const sp = m && label ? pickSprite(charIdOf(m, chat), label, m.id + ':' + m.sw, live.has(m.id) ? '' : m.swipes[m.sw]?.exprPick) : null;
    setImg(av, sp, '', { fade: false });
    if (sp) av.title = nameOf(label); else if (av.title) av.removeAttribute('title');
  }
}

function applyDossier(layout: Element, chars: CharX[], state: Map<string, ExprState>) {
  const c = cfg(), card = layout.querySelector(':scope > aside.dossier > .dream-card'); if (!card) return;
  const group = chars.length > 1;
  const hosts = group ? [...card.querySelectorAll('.cast-grid > .cast > .arch')] : [card.querySelector('.sheet-window .arch')];
  chars.forEach((ch, i) => { const host = hosts[i]; if (host) setImg(host, c.show && c.dossier ? state.get(ch.id)?.sprite : null, 'dos:' + ch.id, { fade: c.fade }); });
  // 초상 아래 꼬리표: 지금 표정 · 스탠딩
  const any = c.show && chars.some(ch => Sprites.list(ch.id).length);
  const cap = card.querySelector<HTMLElement>(':scope > .exs-cap');
  if (!any) { cap?.remove(); return; }
  const st = group ? null : state.get(chars[0].id), sig = [st ? st.label : 'g', c.standing, c.mode].join('|');
  if (cap?.dataset.sig === sig) return;
  const next = el('div', 'exs-cap'); next.dataset.sig = sig;
  if (!st) next.append(el('span', 'exs-cap-label', '표정'));
  else {
    const b = el('button', 'exs-cap-btn'); b.type = 'button'; b.title = '이 답변의 표정 바꾸기';
    b.addEventListener('click', () => { const { chat: ch, msgs } = B.chat.current(); const m = ch && lastReply(msgs, ch, ch.charIds[0]); if (ch && m) void openPicker(m, ch); else B.ui.toast('아직 답변이 없어요'); });
    b.append(el('i', '', '✦'), el('span', '', st.label ? nameOf(st.label) : '기본 표정'), iconEl('down', 12)); next.append(b);
  }
  const sb = el('button', 'exs-cap-btn exs-cap-stand' + (c.standing ? ' on' : ''), c.standing ? '스탠딩 끄기' : '스탠딩 보기'); sb.type = 'button'; sb.title = '화면 한쪽에 큰 초상을 세웁니다';
  sb.addEventListener('click', () => toggleStanding()); next.append(sb);
  if (cap) cap.replaceWith(next); else (card.querySelector(':scope > .sheet-window, :scope > .cast-grid') || card.firstChild as ChildNode | null)?.after(next);
}

let stageRo: ResizeObserver | null = null;
function measureStage(stage: HTMLElement, layout: Element) {
  const c = cfg(), main = layout.querySelector(':scope > .chat-main'); if (!main || !stage.isConnected) return;
  const LR = layout.getBoundingClientRect(), M = main.getBoundingClientRect(), H = LR.height * c.size / 100;
  let need = 28, ready = false;
  for (const img of stage.querySelectorAll<HTMLImageElement>('.exs-fig > img.exs-img:not(.out)')) { if (!img.naturalWidth) continue; ready = true; need += H * img.naturalWidth / img.naturalHeight; }
  if (!ready) return;
  const free = c.side === 'left' ? M.left - LR.left : LR.right - M.right, over = need > free;
  stage.classList.toggle('over', over); stage.classList.add('ready');
  stage.style.setProperty('--exs-b', (over ? layout.querySelector<HTMLElement>('.composer')?.offsetHeight || 0 : 0) + 'px');
}
function applyStanding(layout: Element, chat: ChatX, chars: CharX[], state: Map<string, ExprState>, speakerId?: string) {
  const c = cfg(); let stage = layout.querySelector<HTMLElement>(':scope > .exs-stage');
  const muted = new Set(chat.muted || []);
  const figs = c.show && c.standing ? chars.filter(ch => chars.length === 1 || !muted.has(ch.id)).map(ch => ({ ch, sp: (state.get(ch.id)?.sprite || (ch.avatar ? { id: 'av:' + ch.id, data: ch.avatar } : null)) as Pic | null })).filter((f): f is { ch: CharX; sp: Pic } => !!f.sp) : [];
  if (!figs.length) { stage?.remove(); return; }
  if (!stage) {
    stage = el('div', 'exs-stage');
    const x = el('button', 'exs-x'); x.type = 'button'; x.title = '스탠딩 끄기'; x.setAttribute('aria-label', '스탠딩 끄기'); x.addEventListener('click', () => toggleStanding(false)); x.append(iconEl('x', 14));
    stage.append(el('div', 'exs-row'), x);
    layout.append(stage);
    const made = stage;
    stageRo?.disconnect(); stageRo = new ResizeObserver(() => measureStage(made, layout)); stageRo.observe(layout);
    const comp = layout.querySelector('.composer'); if (comp) stageRo.observe(comp);
  }
  const stg = stage;
  stg.classList.toggle('left', c.side === 'left'); stg.classList.toggle('right', c.side !== 'left'); stg.classList.toggle('dimming', !!c.dim && figs.length > 1);
  stg.style.setProperty('--exs-h', c.size + '%'); stg.style.setProperty('--exs-ho', Math.min(c.size, c.sizeOver) + '%'); stg.style.setProperty('--exs-op', String(Math.max(0.2, Math.min(1, c.overOpacity / 100))));
  const row = stg.firstChild as HTMLElement, want = new Set(figs.map(f => f.ch.id));
  for (const f of [...row.children] as HTMLElement[]) if (!want.has(f.dataset.char || '')) f.remove();
  figs.forEach(({ ch, sp }, i) => {
    let fig = ([...row.children] as HTMLElement[]).find(f => f.dataset.char === ch.id);
    if (!fig) { fig = el('div', 'exs-fig'); fig.dataset.char = ch.id; row.append(fig); }
    if (row.children[i] !== fig) row.insertBefore(fig, row.children[i]);
    fig.classList.toggle('on', figs.length === 1 || ch.id === speakerId);
    const before = fig.querySelector<HTMLImageElement>(':scope > img.exs-img:not(.out)')?.dataset.sid;
    setImg(fig, sp, '', { fade: c.fade, cross: true });
    if (before !== sp.id) { const img = fig.querySelector<HTMLImageElement>(':scope > img.exs-img:not(.out)'); if (img && !img.complete) img.addEventListener('load', () => measureStage(stg, layout), { once: true }); }
  });
  measureStage(stg, layout);
}

let raf = 0, syncing = false;
export function schedule() { if (!raf) raf = requestAnimationFrame(() => { raf = 0; sync(); }); }
/** 대화 화면의 초상 · 아바타 · 스탠딩을 지금 표정에 맞춘다 */
export function sync() {
  if (syncing) return; syncing = true;
  try {
    const layout = document.querySelector('#page .chat-layout'); if (!layout) return;
    document.documentElement.dataset.exsAv = cfg().avatarFit === 'cover' ? 'cover' : 'contain';
    const { chat, msgs } = B.chat.current(); if (!chat || !layout.querySelector('.msgs')) return;
    if (chat.charIds.some(id => !Sprites.has(id))) { Sprites.load(chat.charIds).then(schedule).catch(e => console.warn('[표정]', e)); return; }
    const chars = chat.charIds.map(id => B.S.get('chars', id)).filter(x => !!x);
    const state = new Map(chars.map(ch => [ch.id, currentOf(chat, msgs, ch.id)]));
    const last = lastReply(msgs, chat);
    applyAvatars(layout, chat, msgs);
    applyDossier(layout, chars, state);
    applyStanding(layout, chat, chars, state, last ? charIdOf(last, chat) : chars[0]?.id);
  } catch (e) { console.warn('[표정]', e); } finally { syncing = false; }
}

/** 대화 화면을 지켜보기 시작한다 (한 번만) */
export function watchStage() {
  bus.sync = sync; bus.schedule = schedule;
  // 대화 화면이 다시 그려지면(메시지 · 초상 영역 · 본문 틀) 표정을 다시 얹는다. 글자가 흘러나오는 동안의 본문 변화는 건너뛴다
  const watcher = new MutationObserver(recs => {
    for (const r of recs) { const t = r.target as Element, cl = t.classList; if (t.id === 'page' || t.parentElement?.id === 'page' || (cl && (cl.contains('msgs') || cl.contains('dossier') || cl.contains('chat-main')))) return sync(); }
  });
  const page = document.getElementById('page'); if (page) watcher.observe(page, { childList: true, subtree: true });
  B.core.on('settings', p => { if (p && typeof p === 'object' && 'expressions' in p) schedule(); });
  // 초상 영역의 표정 그림을 누르면 그 그림을 크게 (카드 초상 대신)
  document.addEventListener('click', e => {
    const img = (e.target as Element | null)?.closest?.<HTMLImageElement>('.dossier .sheet-window .exs-img'); if (!img) return;
    e.stopPropagation(); e.preventDefault();
    const full = el('img', 'full-img'); full.src = img.src; full.alt = '';
    B.ui.modal({ title: '', wide: true, body: full });
  }, true);
  schedule();   // 대화 화면이 이미 떠 있는 채로 불려 왔을 때
}
