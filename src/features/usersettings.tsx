// 사용자 설정의 동작: Enter 전송 방식 · 답변 알림음 · 넘기기 몸짓 · 메시지 표시 · 입력 되살리기 · 서식 단축키 · 알림 위치
// 화면(src/pages/Settings.tsx)은 S.settings.ux 와 S.settings.enterSend 만 고치고, 실제 동작은 전부 여기서 알림(event)과 문서 이벤트로 붙인다
import { L } from '../legacy';

export interface Ux {
  sound: boolean; soundVolume: number; soundUnfocused: boolean;
  swipes: boolean; gestures: boolean; confirmDelete: boolean; autoLoadChat: boolean; restoreInput: boolean;
  clickEdit: boolean; mdKeys: boolean; logPrompts: boolean; toastPos: string;
  showIds: boolean; showAvatars: boolean; metaTime: boolean; metaModel: boolean; metaTimer: boolean; metaTokens: boolean;
}
/** js/core.js 의 defaultSettings().ux 와 같은 값 (옛 저장본에 없는 키를 채운다) */
export const UX_DEFAULT: Ux = {
  sound: false, soundVolume: 60, soundUnfocused: false,
  swipes: true, gestures: false, confirmDelete: true, autoLoadChat: true, restoreInput: true,
  clickEdit: false, mdKeys: false, logPrompts: false, toastPos: 'bottom',
  showIds: true, showAvatars: true, metaTime: true, metaModel: true, metaTimer: true, metaTokens: true,
};
type Bag = Record<string, unknown>;
const settings = () => L.core.S.settings as Bag;
/** 지금의 사용자 설정 (없는 키는 기본값) */
export const ux = (): Ux => ({ ...UX_DEFAULT, ...((settings().ux as Partial<Ux> | undefined) || {}) });

/** 좁은 터치 기기인가 (화면 키보드를 쓰는 휴대폰 · 태블릿) */
export const isTouchDevice = () => matchMedia('(pointer: coarse)').matches && !matchMedia('(any-pointer: fine)').matches;
/** Enter 만 눌러 보낼 것인가. enterSend: true(항상) · false(끔) · 'auto'(휴대폰에서는 줄바꿈) */
export function enterSends(): boolean {
  const v = settings().enterSend;
  return v === 'auto' ? !isTouchDevice() : !!v;
}

// ── 알림음: 파일 없이 그 자리에서 만든다 (두 음이 이어지는 짧은 종소리) ──
let ac: AudioContext | null = null;
function audio(): AudioContext | null {
  try { ac ||= new AudioContext(); if (ac.state === 'suspended') void ac.resume(); return ac; } catch { return null; }
}
/** 알림음을 낸다. 소리를 낼 수 있었으면 true */
export function playChime(volume = ux().soundVolume): boolean {
  const a = audio(); if (!a) return false;
  const vol = Math.max(0, Math.min(100, +volume || 0)) / 100; if (!vol) return false;
  const t0 = a.currentTime + 0.02;
  [[880, 0], [1318.5, 0.13]].forEach(([freq, at]) => {
    const o = a.createOscillator(), g = a.createGain();
    o.type = 'sine'; o.frequency.value = freq;
    g.gain.setValueAtTime(0.0001, t0 + at);
    g.gain.exponentialRampToValueAtTime(0.35 * vol, t0 + at + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + at + 0.55);
    o.connect(g).connect(a.destination); o.start(t0 + at); o.stop(t0 + at + 0.6);
  });
  return true;
}

// ── 겉모습: body 의 클래스와 속성으로만 바꾼다 ──
const CSS = `
body.ux-no-ids .msg-no { display: none; }
body.ux-no-avatars .msgs .msg > .avatar { display: none !important; }
body.ux-no-swipes .msg-tools .swipe { display: none; }
body.ux-click-edit .msgs .msg-body { cursor: text; }
body[data-toast^="top"] #toasts { top: calc(18px + env(safe-area-inset-top, 0px)); bottom: auto; }
body[data-toast$="left"] #toasts { left: 18px; transform: none; align-items: flex-start; }
body[data-toast$="right"] #toasts { left: auto; right: 18px; transform: none; align-items: flex-end; }
`;
export function applyUx() {
  const u = ux(), b = document.body.classList;
  b.toggle('ux-no-ids', !u.showIds); b.toggle('ux-no-avatars', !u.showAvatars); b.toggle('ux-no-swipes', !u.swipes); b.toggle('ux-click-edit', u.clickEdit);
  if (u.toastPos && u.toastPos !== 'bottom') document.body.dataset.toast = u.toastPos; else delete document.body.dataset.toast;
}

// ── 쓰던 글 되살리기 ──
const DRAFT = 'dreamland:draft';
let openChat = '';
const readDraft = (): { id: string; text: string } | null => { try { return JSON.parse(localStorage.getItem(DRAFT) || 'null'); } catch { return null; } };
const dropDraft = () => { try { localStorage.removeItem(DRAFT); } catch { /* 저장소를 못 쓰는 환경 */ } };
function restoreDraft(id: string, tries = 20) {
  const d = readDraft(); if (!d || d.id !== id || !d.text || !ux().restoreInput) return;
  const el = document.querySelector<HTMLTextAreaElement>('.composer-input');
  if (!el) { if (tries > 0) setTimeout(() => restoreDraft(id, tries - 1), 80); return; }
  if (el.value) return;
  el.value = d.text; el.dispatchEvent(new Event('input', { bubbles: true }));
}

// ── 서식 단축키: Ctrl+B 굵게 · Ctrl+I 기울임 · Ctrl+U 밑줄 ──
const MARKS: Record<string, string> = { b: '**', i: '*', u: '__' };
function wrap(el: HTMLTextAreaElement, mark: string) {
  const a = el.selectionStart, z = el.selectionEnd, v = el.value, n = mark.length;
  if (v.slice(a - n, a) === mark && v.slice(z, z + n) === mark) {   // 이미 감싸여 있으면 벗긴다
    el.value = v.slice(0, a - n) + v.slice(a, z) + v.slice(z + n); el.setSelectionRange(a - n, z - n);
  } else { el.value = v.slice(0, a) + mark + v.slice(a, z) + mark + v.slice(z); el.setSelectionRange(a + n, z + n); }
  el.dispatchEvent(new Event('input', { bubbles: true }));
}

// ── 넘기기 몸짓: 마지막 답변을 옆으로 밀면 이전 · 다음 답변 ──
let touch: { x: number; y: number; t: number; msg: HTMLElement } | null = null;
function lastAi(target: EventTarget | null): HTMLElement | null {
  const el = target instanceof Element ? target.closest<HTMLElement>('.msgs .msg.ai') : null; if (!el) return null;
  const all = el.parentElement?.querySelectorAll(':scope > .msg'); return all && all[all.length - 1] === el ? el : null;
}

export const feature = {
  name: 'usersettings',
  setup() {
    const { core } = L, S = core.S;
    const st = settings();
    st.ux = ux();   // 없는 키를 채워 화면의 폼이 바로 고칠 수 있게 한다
    document.head.append(Object.assign(document.createElement('style'), { id: 'ux-style', textContent: CSS }));
    applyUx();
    core.on('settings', applyUx);

    // 시작할 때 마지막 대화를 열지 않기: 첫 화면을 고르기 전에 불리므로 여기서 홈으로 돌려 둔다
    if (!ux().autoLoadChat && S.settings.lastPage === 'chat') S.settings.lastPage = 'home';

    // 소리는 사용자가 한 번 누른 뒤에야 낼 수 있다 — 첫 입력 때 미리 깨워 둔다
    const wake = () => { if (ux().sound) audio(); };
    addEventListener('pointerdown', wake, { capture: true, passive: true }); addEventListener('keydown', wake, { capture: true, passive: true });
    core.on('message:received', () => {
      const u = ux(); if (!u.sound) return;
      if (u.soundUnfocused && !document.hidden && document.hasFocus()) return;
      playChime(u.soundVolume);
    });

    core.on('prompt:ready', d => { if (ux().logPrompts) console.log('[프롬프트]', (d as { messages?: unknown } | undefined)?.messages); });

    // 쓰던 글
    core.on('chat:open', c => { openChat = String((c as { id?: string } | undefined)?.id || ''); if (openChat) restoreDraft(openChat); });
    core.on('message:sent', dropDraft);
    document.addEventListener('input', e => {
      const t = e.target; if (!(t instanceof HTMLTextAreaElement) || !t.classList.contains('composer-input') || !openChat) return;
      if (!ux().restoreInput || !t.value) return dropDraft();
      try { localStorage.setItem(DRAFT, JSON.stringify({ id: openChat, text: t.value })); } catch { /* 가득 참 */ }
    }, true);

    // 넘기기를 껐으면 방향키로도 넘기지 않는다 (대화 화면의 단축키보다 먼저 받는다)
    addEventListener('keydown', e => {
      if ((e.key === 'ArrowLeft' || e.key === 'ArrowRight') && document.activeElement === document.body && !ux().swipes && L.ui.route.page === 'chat') e.stopImmediatePropagation();
      const t = e.target, mark = MARKS[e.key.toLowerCase()];
      if (mark && (e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey && ux().mdKeys && t instanceof HTMLTextAreaElement && t.matches('.composer-input, .edit-area')) { e.preventDefault(); wrap(t, mark); }
    }, true);

    document.addEventListener('touchstart', e => {
      touch = null; const u = ux(); if (!u.gestures || !u.swipes || e.touches.length !== 1) return;
      const msg = lastAi(e.target); if (!msg || (e.target as Element).closest('button, a, input, textarea, select, pre, table, .edit-box, .msg-tools')) return;
      touch = { x: e.touches[0].clientX, y: e.touches[0].clientY, t: Date.now(), msg };
    }, { passive: true });
    document.addEventListener('touchend', e => {
      const s = touch; touch = null; if (!s || !s.msg.isConnected || String(getSelection())) return;
      const p = e.changedTouches[0], dx = p.clientX - s.x, dy = p.clientY - s.y;
      if (Math.abs(dx) < 70 || Math.abs(dy) > 45 || Date.now() - s.t > 700) return;
      const btns = s.msg.querySelectorAll<HTMLButtonElement>('.msg-tools .swipe button');
      (dx < 0 ? btns[btns.length - 1] : btns[0])?.click();   // 왼쪽으로 밀면 다음, 오른쪽으로 밀면 이전
    }, { passive: true });

    // 본문을 눌러 바로 고치기
    document.addEventListener('click', e => {
      if (!ux().clickEdit || String(getSelection())) return;
      const t = e.target instanceof Element ? e.target : null; if (!t || t.closest('a, button, summary, img, input, textarea, details')) return;
      t.closest('.msgs .msg-body')?.closest('.msg')?.querySelector<HTMLButtonElement>('.msg-tools button[title="수정"]')?.click();
    });
  },
};
