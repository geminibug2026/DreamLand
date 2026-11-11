// ── Dreamland clock: 대화방마다 따로 가는 시계 ──
// 대화 모드가 꼭 현실 시각을 따를 필요는 없다. 방마다 셋 가운데 하나를 고른다.
//   real  : 현실 시각 그대로 (기본)
//   story : 이야기 속 시각 — 시작 시각을 정하고, 현실처럼 흐르게 / 메시지마다 조금씩 / 멈춰 두기. 캐릭터가 직접 시간을 넘기게 할 수도 있다
//   none  : 시각을 쓰지 않는다 (기록에 시각을 붙이지 않고, 지금 몇 시인지도 알려 주지 않는다)
// chat.clock = { mode, at(이야기 시각 ms), setAt(그 시각을 맞춘 현실 시각 ms), flow: 'real'|'step'|'hold', step(분), ai }
import { S, h, on, emit } from './core.js';
import { modal, toast } from './ui.js';
import { X } from './hooks.js';

const pad = n => String(n).padStart(2, '0');
const WEEK = ['일', '월', '화', '수', '목', '금', '토'];
const cfg = chat => chat?.clock && chat.clock.mode && chat.clock.mode !== 'real' ? chat.clock : null;
const local = t => { const d = new Date(t); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`; };
const short = t => { const d = new Date(t); return `${d.getMonth() + 1}/${d.getDate()}(${WEEK[d.getDay()]}) ${pad(d.getHours())}:${pad(d.getMinutes())}`; };
const save = async chat => { await S.save('chats', chat, true); emit('clock', chat); };

/** "2h" · "90m" · "1d" · "2시간 30분" · "3일" → 분 (모르면 0) */
export function parseSpan(text) {
  let min = 0, hit = false;
  String(text || '').replace(/([\d.]+)\s*(d|day|days|일|h|hr|hrs|hour|hours|시간|m|min|mins|minute|minutes|분)/gi, (_, n, u) => {
    hit = true; u = u.toLowerCase(); min += +n * (/^(d|day|days|일)$/.test(u) ? 1440 : /^(h|hr|hrs|hour|hours|시간)$/.test(u) ? 60 : 1); return '';
  });
  return hit ? Math.round(min) : 0;
}
/** "22:30" · "2024-03-02 22:30" · "3/2 22:30" → 이야기 시각 ms (base 기준, 모르면 null). 시각만 주면 지금보다 이른 시각은 다음 날로 본다 */
export function parseMoment(text, base = Date.now()) {
  const s = String(text || '').trim(); let m;
  if ((m = s.match(/^(\d{4})[-./](\d{1,2})[-./](\d{1,2})(?:[ T]+(\d{1,2}):(\d{2}))?/))) return new Date(+m[1], +m[2] - 1, +m[3], +(m[4] ?? new Date(base).getHours()), +(m[5] ?? new Date(base).getMinutes())).getTime();
  if ((m = s.match(/^(\d{1,2})\/(\d{1,2})(?:\s+(\d{1,2}):(\d{2}))?$/))) { const b = new Date(base); return new Date(b.getFullYear(), +m[1] - 1, +m[2], +(m[3] ?? b.getHours()), +(m[4] ?? b.getMinutes())).getTime(); }
  if ((m = s.match(/^(\d{1,2}):(\d{2})$/))) { const b = new Date(base), t = new Date(b.getFullYear(), b.getMonth(), b.getDate(), +m[1], +m[2]).getTime(); return t < base ? t + 86400000 : t; }
  return null;
}

export const Clock = {
  current: null,                                   // 지금 열려 있는 대화방 (일정 · 상태 계산이 기본으로 따르는 시계)
  mode: chat => cfg(chat)?.mode || 'real',
  /** 이 방의 지금 (ms) */
  ms(chat) { const c = cfg(chat); if (!c || c.mode !== 'story') return Date.now(); return c.flow === 'real' ? c.at + (Date.now() - (c.setAt || Date.now())) : c.at; },
  now(chat) { return new Date(this.ms(chat)); },
  /** 열려 있는 방의 지금. 일정표 · 상태 계산처럼 대화방을 넘겨받지 않는 곳에서 쓴다 */
  date() { return this.now(this.current); },
  /** 메시지가 놓인 시각 (ms). 이야기 시계에서는 메시지에 적어 둔 이야기 시각 */
  timeOf(chat, m) { const c = cfg(chat), t = m?.swipes?.[m.sw]?.ts || m?.ts || Date.now(); if (!c || c.mode !== 'story') return t; return m?.st ?? (c.flow === 'real' ? c.at + (t - (c.setAt || t)) : c.at); },
  /** 시계를 옮긴다: { set: '22:30' | '2024-03-02 22:30' } 또는 { advance: '2h' }. 옮겼으면 true */
  async move(chat, { set, advance } = {}) {
    const c = cfg(chat); if (!c || c.mode !== 'story') return false;
    const cur = this.ms(chat); let next = null;
    if (set) next = parseMoment(set, cur);
    if (next == null && advance) { const min = parseSpan(advance); if (min > 0) next = cur + min * 60000; }
    if (next == null || !isFinite(next)) return false;
    c.at = next; c.setAt = Date.now(); await save(chat); return true;
  },
  /** 프롬프트에 싣는 한 줄 (시각을 쓰지 않으면 빈 글) */
  line(chat) {
    const c = cfg(chat), d = this.now(chat), text = `${pad(d.getHours())}:${pad(d.getMinutes())}, ${d.toLocaleDateString('en-GB', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}`;
    if (c?.mode === 'none') return '';
    if (c?.mode !== 'story') return `The current time and date: ${text}.`;
    return `The current time and date inside this story: ${text}. This is story time, not the real-world clock — never refer to the real date.${c.flow === 'hold' ? ' Time stands still until someone moves it.' : ''}`;
  },
  /** 캐릭터에게 알려 줄 시계 명령 (허락했을 때만) */
  command(chat) { const c = cfg(chat); return c?.mode === 'story' && c.ai ? '[time: advance="2h"] or [time: set="YYYY-MM-DD HH:MM"] — when story time moves on (a time skip, falling asleep, the next morning). Use it sparingly.' : ''; },
};

// 메시지가 생길 때 이야기 시각을 적어 둔다. '메시지마다' 흐름이면 여기서 시계를 민다
async function mark({ msg, chat }) {
  const c = cfg(chat); if (!c || c.mode !== 'story' || !msg || msg.st != null) return;
  if (c.flow !== 'step') { msg.st = Clock.ms(chat); return; }
  c.at += Math.max(0, +c.step || 0) * 60000; c.setAt = Date.now(); msg.st = c.at;   // 메시지에 먼저 적고 나서 저장한다
  await S.save('chats', chat, true).catch(() => { }); emit('clock:tick', chat);
}
on('message:sent', mark); on('message:received', mark);
on('chat:open', chat => { Clock.current = chat || null; });

/** 상단 바에 붙는 짧은 표시 (현실 시각이면 빈 글) */
export const clockLabel = chat => { const c = cfg(chat); return !c ? '' : c.mode === 'none' ? '' : short(Clock.ms(chat)); };
export const clockHint = chat => { const c = cfg(chat); return !c ? '현실 시각' : c.mode === 'none' ? '시각 없음' : `이야기 ${short(Clock.ms(chat))}`; };

/** 이 방의 시각 고르기. 고치는 즉시 저장된다 */
export function clockDialog(chat, done = () => { }) {
  const body = h('div.clock-dlg'); let box;
  const set = async patch => { chat.clock = { mode: 'real', at: Date.now(), setAt: Date.now(), flow: 'real', step: 5, ai: false, ...(chat.clock || {}), ...patch }; await save(chat); draw(); };
  const draw = () => {
    const c = chat.clock || { mode: 'real' }, mode = c.mode || 'real';
    const card = (k, title, desc) => h(`button.clock-opt${mode === k ? '.on' : ''}`, { type: 'button', onclick: () => set(k === 'story' && mode !== 'story' ? { mode: k, at: Clock.ms(chat), setAt: Date.now() } : { mode: k }) }, h('i'), h('b', title), h('small', desc));
    body.replaceChildren(
      h('div.clock-opts',
        card('real', '현실 시각', '지금 실제 시각과 날짜를 그대로 씁니다.'),
        card('story', '이야기 속 시각', '이 방만의 날짜와 시각을 정합니다. 과거 · 미래 · 다른 시간대 무엇이든.'),
        card('none', '시각 없음', '메시지에 시각을 붙이지 않고, 지금이 몇 시인지도 알려 주지 않습니다.')),
      mode === 'story' ? h('div.clock-story',
        h('label.field', h('span.field-label', '지금 이 방의 시각'), h('input.inp', { type: 'datetime-local', value: local(Clock.ms(chat)), onchange: e => { const t = new Date(e.target.value).getTime(); if (isFinite(t)) set({ at: t, setAt: Date.now() }); } })),
        h('div.clock-jump', [['+1시간', 60], ['+6시간', 360], ['다음 날 아침', 0], ['+1주', 10080]].map(([l, min]) => h('button.chip', { type: 'button', onclick: () => { const cur = Clock.ms(chat); let t = cur + min * 60000; if (!min) { const d = new Date(cur); t = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1, 8, 0).getTime(); } set({ at: t, setAt: Date.now() }); } }, l))),
        h('label.field', h('span.field-label', '시간이 흐르는 방식'), h('select.inp', { onchange: e => set({ at: Clock.ms(chat), setAt: Date.now(), flow: e.target.value }) },
          [['real', '현실처럼 흐름 — 1분에 1분씩'], ['step', '메시지마다 조금씩'], ['hold', '멈춰 둠 — 직접 옮길 때만']].map(([k, l]) => h('option', { value: k, selected: (c.flow || 'real') === k }, l)))),
        c.flow === 'step' ? h('label.field', h('span.field-label', '메시지 하나에 몇 분'), h('input.inp', { type: 'number', min: 0, max: 1440, value: c.step ?? 5, onchange: e => set({ step: Math.max(0, +e.target.value || 0) }) })) : null,
        h('label.check', h('input', { type: 'checkbox', checked: !!c.ai, onchange: e => set({ ai: e.target.checked }) }), h('i'), h('span', '캐릭터가 시간을 넘길 수 있게 하기'), h('small', '잠들었다 깨거나 장면이 건너뛸 때 캐릭터가 스스로 시계를 옮깁니다. 추가 호출은 없습니다.')),
        h('small.hint', '입력창에서 /time 22:30 · /time +2시간 · /time 2024-03-02 08:00 으로도 옮길 수 있어요. 캐릭터의 일정과 상태도 이 시각을 따릅니다.')) : null);
  };
  draw();
  box = modal({ title: '이 방의 시각', body, actions: [{ label: '닫기', cls: 'primary' }], onClose: done });
  return box;
}

X.commands.set('/time', { owner: 'clock', args: '22:30 | +2시간', help: '이 방의 이야기 시각을 옮기거나 확인합니다', run: async (arg, api) => {
  const chat = api.current().chat; if (!chat) return;
  if (!arg) return toast(Clock.mode(chat) === 'story' ? `이 방의 시각: ${short(Clock.ms(chat))}` : Clock.mode(chat) === 'none' ? '이 방은 시각을 쓰지 않아요' : '이 방은 현실 시각을 따라요 (대화 메뉴 → 이 방의 시각)');
  const prev = chat.clock;
  if (Clock.mode(chat) !== 'story') { chat.clock = { flow: 'hold', step: 5, ai: false, ...(chat.clock || {}), mode: 'story', at: Date.now(), setAt: Date.now() }; }
  const ok = await Clock.move(chat, /^\s*\+/.test(arg) || (parseSpan(arg) && parseMoment(arg) == null) ? { advance: arg } : { set: arg });
  if (!ok) { if (prev === undefined) delete chat.clock; else chat.clock = prev; return toast('시각을 알아보지 못했어요. 예: /time 22:30 · /time +2시간 · /time 2024-03-02 08:00', 'err'); }
  toast(`이 방의 시각: ${short(Clock.ms(chat))}`, 'ok');
} });
