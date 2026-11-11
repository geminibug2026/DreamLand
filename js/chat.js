// ── Dreamland chat: 채팅 화면과 생성 흐름 ──
import { S, DB, h, esc, uid, now, on, emit, newChat, newMsg, msgText, fmtTime, download, debounce, pickFiles, readDataURL, shrinkImage, clamp } from './core.js';
import { buildPrompt, streamChat, applyRegex, macro, makeCtx, tokens, roll, quickCall, activeBooks, prefillOk, splitThink, parseTalk, postFormat } from './engine.js';
import { render } from './format.js';
import { icon, btn, iconBtn, avatar, toast, modal, menu, confirmBox, promptBox, go, route, registerPage, form, charPicker } from './ui.js';
import { chatToStJsonl } from './cards.js';
import { X, runFilters } from './hooks.js';
import { Assets } from './assets.js';
import { Memory } from './memory.js';
import { Illust, translateText } from './illust.js';
import { die3d } from './dice3d.js';
import { loreLinker } from './f-lore.js';
import { slashPopup } from './slash.js';
import { clockLabel, clockHint, clockDialog, Clock } from './clock.js';
import { Live, newLater, inQuietHours, mo, cdHours, quietLeft } from './live.js';
import { Schedule, scheduleOf, STATUS, planAuto, pickMotive, wakeIn, replyDelay, motiveLabel, cooldownLeft, MOTIVE_ORDER } from './f-schedule.js';

const cur = { chat: null, msgs: [], busy: false, abort: null, lastPrompt: null, shown: 60, drawer: false, status: '', attach: [] };
let ui = {};
const charsOf = chat => chat.charIds.map(id => S.get('chars', id)).filter(Boolean);
const titleOf = chat => charsOf(chat).map(c => c.name).join(', ') || '삭제된 캐릭터';
const save = () => S.saveMsgs(cur.chat, cur.msgs);

export const modeOf = chat => chat?.mode === 'talk' ? 'talk' : 'rp';
/** 새 대화: 어떤 모드로 시작할지 고르기 */
export function startMenu(anchor, charIds) {
  menu(anchor, [{ label: 'RP 모드', ic: 'book', hint: '소설처럼', onclick: () => startChat(charIds, { mode: 'rp' }) }, { label: '대화 모드', ic: 'chat', hint: '메신저처럼', onclick: () => startChat(charIds, { mode: 'talk' }) }]);
}
export async function startChat(charIds, { open = true, mode } = {}) {
  const chars = charIds.map(id => S.get('chars', id)).filter(Boolean);
  if (!chars.length) return null;
  const chat = newChat({ charIds: chars.map(c => c.id), mode: mode || S.settings.defaultMode || 'rp' });
  const msgs = [];
  const persona = S.persona(chat);
  const first = chars[0];
  const greets = [first.firstMes, ...(first.altGreetings || [])].filter(g => g && g.trim());
  if (greets.length) {
    const ctx = makeCtx({ chat, char: first, chars, persona, msgs: [] });
    const m = newMsg('assistant', '', { charId: first.id, name: first.name, swipes: greets.map(g => ({ text: macro(g, ctx), ts: now() })), greeting: true });
    msgs.push(m);
  }
  await S.saveMsgs(chat, msgs);
  if (open) go('chat', chat.id);
  return chat;
}

// ════════ 페이지 ════════
registerPage('chat', async (root, arg) => {
  const id = arg || S.settings.lastChat;
  const chat = S.get('chats', id) || [...S.chats].sort((a, b) => b.updatedAt - a.updatedAt)[0];
  ui = {};
  const side = h('aside.chat-side');
  const dossier = h('aside.dossier');
  const main = h('div.chat-main');
  const drawer = h('aside.drawer');
  root.append(h('section.chat-layout', { class: cur.drawer ? 'with-drawer' : '' }, side, dossier, main, drawer));
  ui.layout = root.firstChild; ui.side = side; ui.main = main; ui.drawer = drawer; ui.dossier = dossier;
  if (!arg && S.chats.length > 1) ui.layout.classList.add('show-side'); // 휴대폰: 탭으로 들어오면 대화 목록부터
  drawSide();
  if (!chat) {
    main.append(h('div.empty.big', icon('moon', 46), h('p', '아직 대화가 없어요. 캐릭터를 골라 첫 장면을 열어 보세요.'), btn('캐릭터 보러 가기', { ic: 'home', cls: 'primary', onclick: () => go('home') })));
    return;
  }
  const list = cur.gen?.chat === chat ? cur.gen.msgs : await S.msgs(chat.id);
  cur.chat = chat; cur.msgs = list; cur.shown = 60; cur.lastPrompt = null; cur.openedAt = now(); cur.chimeRun = 0;
  if (!S.get('personas', chat.personaId)) {   // 정해 둔 페르소나가 없으면 이 방에서 마지막으로 쓴 이름, 그것도 없으면 지금 기본 페르소나로
    const last = [...list].reverse().find(m => m.role === 'user' && m.name), p = (last && S.personas.find(x => x.name === last.name)) || S.persona(chat);
    if (p) { chat.personaId = p.id; await S.save('chats', chat, true); }
  }
  await Promise.all([Assets.load(assetOwners()), Memory.load(chat.id), Illust.load(chat.id)]).catch(e => console.warn(e));
  route.arg = chat.id; S.set({ lastChat: chat.id });
  drawMain(); drawSide(); if (cur.drawer) drawDrawer();
  emit('chat:open', chat); const awayFor = now() - (chat.seenAt || chat.updatedAt || now()); if (chat.unread) { chat.unread = 0; S.save('chats', chat, true); drawSide(); }
  if (!(await catchUp(chat, awayFor))) armAuto();
});

// 대화방 목록: 캐릭터(또는 그룹)별로 묶고, 방마다 분량·기간·분기 관계를 보여 준다
const groupKey = c => [...c.charIds].sort().join('+') || '-';
const roomNo = c => S.chats.filter(x => groupKey(x) === groupKey(c)).sort((x, y) => x.createdAt - y.createdAt).indexOf(c) + 1;
const roomName = c => { const t = titleOf(c), n = String(c.name || '').trim(); const cut = n.toLowerCase().startsWith(t.toLowerCase()) ? n.slice(t.length).replace(/^[\s\-–—·:@]+/, '') : n; return cut || `대화 ${roomNo(c)}`; };
const daysOf = c => Math.max(1, Math.round(((c.updatedAt || c.createdAt) - c.createdAt) / 86400000) + 1);
const ago = t => { const d = (now() - t) / 60000; return d < 1 ? '방금' : d < 60 ? `${Math.floor(d)}분 전` : d < 1440 ? `${Math.floor(d / 60)}시간 전` : d < 43200 ? `${Math.floor(d / 1440)}일 전` : new Date(t).toLocaleDateString('ko-KR', { year: '2-digit', month: 'numeric', day: 'numeric' }); };
function drawSide() {
  const q = h('input.inp.search', { placeholder: '캐릭터 · 대화방 · 내용 찾기', oninput: () => list() });
  const listEl = h('div.chat-list');
  const fold = cur.fold ||= new Set(), more = cur.more ||= new Map(), PAGE = 6;
  const room = (c, max, depth = 0, flat = false) => {
    const parent = c.parent && S.get('chats', c.parent.id), n = c.count || 0;
    return h(`button.room${c.id === cur.chat?.id ? '.on' : ''}${depth ? '.sub' : ''}`, { style: depth ? { marginLeft: Math.min(depth, 3) * 14 + 'px' } : {}, onclick: () => { ui.layout?.classList.remove('show-side'); go('chat', c.id); }, oncontextmenu: e => { e.preventDefault(); chatMenu(e.currentTarget, c); } },
      h('div.room-top', depth ? icon('branch', 13) : null, h(`i.room-mode.${modeOf(c)}`, modeOf(c) === 'talk' ? '대화' : 'RP'), h('b', flat ? `${titleOf(c)} · ${roomName(c)}` : roomName(c)), c.pinned ? h('i.room-pin', '✦') : null, c.unread ? h('i.room-unread', String(c.unread)) : null, c.scene?.on ? h('i.room-scene', '장면 중') : null, h('time', ago(c.updatedAt))),
      h('small.room-prev', c.preview || '아직 아무 말도 없어요'),
      h('div.room-meta', h('span.room-bar', { title: `메시지 ${n}개` }, h('i', { style: { width: Math.max(n ? 6 : 0, Math.round(n / Math.max(30, max) * 100)) + '%' } })), h('span', `${n}개`), h('span', `${daysOf(c)}일`), (c.diary || []).length ? h('span', `일기 ${c.diary.length}`) : null, c.parent ? h('span', { title: parent ? `${roomName(parent)}에서 갈라진 방` : '' }, `${c.parent.at}번째에서 분기`) : null));
  };
  const list = () => {
    const term = q.value.trim().toLowerCase(), flat = S.settings.sideView === 'recent';
    const hit = c => !term || (titleOf(c) + ' ' + roomName(c) + ' ' + c.preview).toLowerCase().includes(term);
    const all = S.chats.filter(hit); const els = [];
    if (flat) { const max = Math.max(1, ...all.map(c => c.count || 0)); const sorted = [...all].sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0) || b.updatedAt - a.updatedAt), lim = more.get('*') || 40; els.push(...sorted.slice(0, lim).map(c => room(c, max, 0, true))); if (sorted.length > lim) els.push(h('button.room-more', { onclick: () => { more.set('*', lim + 40); list(); } }, `대화방 ${sorted.length - lim}개 더 보기`)); }
    else {
      const groups = new Map(); for (const c of all) { const k = groupKey(c); if (!groups.has(k)) groups.set(k, []); groups.get(k).push(c); }
      const sorted = [...groups.entries()].sort((a, b) => Math.max(...b[1].map(c => c.updatedAt)) - Math.max(...a[1].map(c => c.updatedAt)));
      for (const [k, rooms] of sorted) {
        const chars = charsOf(rooms[0]), total = rooms.reduce((n, c) => n + (c.count || 0), 0), max = Math.max(1, ...rooms.map(c => c.count || 0));
        const here = rooms.some(c => c.id === cur.chat?.id), open = term ? true : fold.has(k) ? false : fold.has('+' + k) ? true : (here || sorted.length === 1);
        // 분기한 방은 원래 방 바로 아래에 들여 쓴다
        const ids = new Set(rooms.map(c => c.id)), kids = c => rooms.filter(x => x.parent?.id === c.id).sort((a, b) => a.createdAt - b.createdAt);
        const roots = rooms.filter(c => !c.parent || !ids.has(c.parent.id)).sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0) || b.updatedAt - a.updatedAt);
        const walk = (c, d) => [room(c, max, d), ...kids(c).flatMap(x => walk(x, d + 1))];
        // 방이 많으면 처음 몇 개만 — 지금 열려 있는 방이 든 갈래는 항상 보이게
        const lim = term ? Infinity : (more.get(k) || PAGE), holds = c => c.id === cur.chat?.id || kids(c).some(holds);
        const shown = roots.filter((c, i) => i < lim || holds(c)), rest = roots.length - shown.length;
        els.push(h(`section.cgroup${open ? '.open' : ''}${here ? '.here' : ''}`,
          h('div.cgroup-head',
            h('button.cgroup-main', { onclick: () => { if (open) { fold.delete('+' + k); fold.add(k); } else { fold.delete(k); fold.add('+' + k); } list(); } },
              h('div.av-stack', chars.slice(0, 2).map(ch => avatar(ch, 'sm')), chars.length > 2 ? h('i.av-more', `+${chars.length - 2}`) : null),
              h('div.cgroup-text', h('b', titleOf(rooms[0])), h('small', `대화방 ${rooms.length} · 메시지 ${total.toLocaleString()} · ${ago(Math.max(...rooms.map(c => c.updatedAt)))}`)),
              icon(open ? 'down' : 'right', 15)),
            iconBtn('plus', '이 캐릭터와 새 대화방', e => startMenu(e.currentTarget, rooms[0].charIds))),
          open ? h('div.cgroup-rooms', shown.flatMap(c => walk(c, 0)), rest > 0 ? h('button.room-more', { onclick: () => { more.set(k, lim + PAGE * 2); list(); } }, `이 캐릭터의 대화방 ${rest}개 더 보기`) : (lim > PAGE && roots.length > PAGE && !term ? h('button.room-more', { onclick: () => { more.delete(k); list(); } }, '접기') : null)) : null));
      }
    }
    listEl.replaceChildren(...els);
    if (!els.length) listEl.append(h('p.dim.pad', term ? '검색 결과가 없어요.' : '대화가 여기에 쌓여요.'));
  };
  const view = h('div.side-view', [['chars', '캐릭터별'], ['recent', '최근순']].map(([k, l]) => h(`button${(S.settings.sideView || 'chars') === k ? '.on' : ''}`, { onclick: () => { S.set({ sideView: k }); drawSide(); } }, l)),
    h('span', `대화방 ${S.chats.length}`));
  ui.side.replaceChildren(h('header.side-head', q, iconBtn('users', '그룹 채팅 만들기', groupDialog), iconBtn('x', '닫기', () => ui.layout?.classList.remove('show-side'))), view, listEl);
  list();
}

function chatMenu(anchor, c, top = null) {
  const talk = modeOf(c) === 'talk', N = top?.narrow ? top : null;
  menu(anchor, [
    ...(N ? [
      { label: talk ? 'RP 모드로 바꾸기' : '대화 모드로 바꾸기', ic: talk ? 'feather' : 'chat', hint: talk ? '소설처럼' : '메신저처럼', onclick: () => N.setMode(talk ? 'rp' : 'talk') },
      talk ? { label: '캐릭터 상태 · 일정', ic: 'moon', onclick: () => N.pres(anchor) } : null,
      talk ? { label: '내 상태', ic: 'user', hint: Live.userStatus().label, onclick: () => N.me(anchor) } : null,
      { label: '꿈 일기장', ic: 'book', onclick: () => emit('diary:open', c) },
      { label: '이 대화에서 찾기', ic: 'search', onclick: N.find },
      { label: '같은 캐릭터와 새 대화', ic: 'plus', onclick: () => startMenu(anchor, c.charIds) },
      { label: '프롬프트 살펴보기', ic: 'code', onclick: inspector },
      '-'] : []),
    talk ? { label: '이 방의 시각', ic: 'moon', hint: clockHint(c), onclick: () => clockDialog(c, () => { if (c.id === cur.chat?.id) drawMain(); }) } : null,
    { label: '대화 모드 설정', ic: 'sliders', hint: '선톡 · 장면 · 상태창', onclick: () => Live.settings(modeOf(c) === 'talk' ? 'auto' : 'tracker', c) },
    { label: c.pinned ? '고정 풀기' : '맨 위에 고정', ic: 'star', onclick: async () => { c.pinned = !c.pinned; await S.save('chats', c, true); drawSide(); } },
    c.parent && S.get('chats', c.parent.id) ? { label: '원래 대화방으로', ic: 'branch', onclick: () => go('chat', c.parent.id) } : null,
    { label: '이름 바꾸기', ic: 'edit', onclick: async () => { const v = await promptBox('대화 이름', c.name); if (v !== null) { c.name = v; await S.save('chats', c, true); drawSide(); if (c.id === cur.chat?.id) drawTop(); } } },
    { label: 'JSONL 로 내보내기', ic: 'import', hint: '실리태번 호환', onclick: async () => { const ms = await S.msgs(c.id); download(`${titleOf(c)}-${c.id}.jsonl`, chatToStJsonl(c, ms, S.persona(c).name, charsOf(c)[0]?.name || 'Character'), 'application/jsonl'); } },
    { label: '텍스트로 내보내기', ic: 'note', onclick: async () => { const ms = await S.msgs(c.id); download(`${titleOf(c)}.txt`, ms.filter(m => !m.hidden).map(m => `${m.role === 'user' ? S.persona(c).name : m.role === 'system' ? '나레이션' : (m.name || titleOf(c))}: ${msgText(m)}`).join('\n\n'), 'text/plain'); } },
    '-',
    { label: '대화 삭제', ic: 'trash', danger: true, onclick: async () => { if (!(await confirmBox(`"${titleOf(c)}" 대화를 삭제할까요?`, '삭제', true))) return; if (cur.gen?.chat === c) cur.abort?.abort(); await Assets.removeOwner('chat:' + c.id); await S.remove('chats', c.id); if (c.id === cur.chat?.id) { cur.chat = null; S.set({ lastChat: '' }); go('chat'); } else drawSide(); } },
  ]);
}

function groupDialog() {
  if (S.chars.length < 2) return toast('그룹 채팅은 캐릭터가 둘 이상 있어야 해요');
  charPicker({ title: '그룹 채팅에 함께할 캐릭터', onDone: ids => { if (ids.length < 2) return toast('두 명 이상 골라 주세요'); startMenu(ui.side || document.body, ids); } });
}

// ════════ 메인 영역 ════════
function drawMain() {
  ui.top = h('header.chat-top'); ui.hud = h('div.hud-slot'); ui.scroll = h('div.chat-scroll'); ui.msgs = h('div.msgs'); ui.composer = h('footer.composer');
  ui.msgs.addEventListener('click', e => {   // 누른 메시지 하나만 고른다 (좁은 화면 · 터치에서 도구를 여는 방법)
    if (e.target.closest('button, a, input, textarea, select, summary, label, img, figure, .msg-tools') || String(getSelection())) return;
    const el = e.target.closest('.msg'), was = el?.classList.contains('picked');
    ui.msgs.querySelectorAll('.msg.picked').forEach(x => x.classList.remove('picked'));
    if (el && !was) el.classList.add('picked');
  });
  ui.scroll.append(ui.msgs);
  ui.main.replaceChildren(ui.top, ui.hud, ui.scroll, ui.composer);
  ui.main.style.setProperty('--chat-bg', cur.chat.bg ? `url("${cur.chat.bg}")` : 'none');
  ui.main.classList.toggle('has-bg', !!cur.chat.bg);
  ui.main.classList.toggle('is-group', cur.chat.charIds.length > 1);
  ui.main.classList.toggle('mode-talk', modeOf(cur.chat) === 'talk'); ui.main.classList.toggle('mode-rp', modeOf(cur.chat) === 'rp');
  ui.main.classList.toggle('in-scene', modeOf(cur.chat) === 'talk' && !!cur.chat.scene?.on);
  drawTop(); drawHud(); drawMsgs(); drawComposer(); drawDossier();
  requestAnimationFrame(() => { ui.scroll.scrollTop = ui.scroll.scrollHeight; });
}

function drawTop() {
  const c = cur.chat, chars = charsOf(c);
  const conn = S.connFor(c);
  ui.status = h('span.status');
  ui.gauge = h('button.gauge', { title: '프롬프트 살펴보기', onclick: inspector });
  const talk = modeOf(c) === 'talk', p0 = talk && chars[0] ? presenceOf(c, chars[0]) : null;
  const setMode = async k => { if (modeOf(c) === k) return; if (cur.busy) return toast('답변이 끝난 뒤에 바꿀 수 있어요'); c.mode = k; await S.save('chats', c, true); drawMain(); armAuto(); if (k === 'rp' && c.scene?.on) toast('열어 둔 장면은 대화 모드로 돌아오면 이어져요'); };
  const branchBtn = c.parent ? h('button.top-branch', { title: '원래 대화방으로', onclick: () => S.get('chats', c.parent.id) ? go('chat', c.parent.id) : toast('원래 대화방이 지워졌어요') }, icon('branch', 12)) : null;
  ui.top.replaceChildren(
    h('button.ibtn', { title: '대화 목록', onclick: () => ui.layout.classList.toggle('show-side') }, icon('menu')),
    h('div.av-stack', chars.slice(0, 3).map(ch => avatar(ch, 'sm'))),
    h('div.top-title', { title: `${roomName(c)} · 메시지 ${cur.msgs.length}개 · ${conn ? `${conn.name}${conn.model ? ' · ' + conn.model : ''}` : '연결 없음'}` }, h('b', titleOf(c)),
      p0 ? h('div.top-sub', branchBtn,   // 대화 모드: 이름 아래 한 줄에 상태 · 시각 · 방 이름
        h('button.top-pres', { type: 'button', title: '캐릭터 상태 · 일정', onclick: e => menu(e.currentTarget, presItems(c, chars)) }, chars.slice(0, 3).map(ch => h(`i.presence.${presenceOf(c, ch).status}`)), h('span', [chars.length > 1 ? `${chars.length}명` : (p0.activity || STATUS[p0.status]), clockLabel(c)].filter(Boolean).join(' · '))),
        h('span.top-room', `${roomName(c)} · ${cur.msgs.length}개`))
        : h('small.top-meta', branchBtn, talk && clockLabel(c) ? h('span.top-clock', clockLabel(c)) : null, roomName(c), ` · ${cur.msgs.length}개 · `, conn ? `${conn.name}${conn.model ? ' · ' + conn.model : ''}` : '연결 없음')),
    ui.status, ui.gauge,
    talk ? meBtn() : null,
    h('div.mode-switch.top-wide', { title: '보는 방식과 답변 방식을 바꿉니다' }, [['rp', 'RP'], ['talk', '대화']].map(([k, l]) => h(`button${modeOf(c) === k ? '.on' : ''}`, { onclick: () => setMode(k) }, l))),
    iconBtn('book', '꿈 일기장', () => emit('diary:open', c), 'top-wide'),
    iconBtn('search', '이 대화에서 찾기', findInChat, 'top-wide'),
    iconBtn('plus', '같은 캐릭터와 새 대화', e => startMenu(e.currentTarget, c.charIds), 'top-wide'),
    iconBtn('more', '대화 메뉴', e => chatMenu(e.currentTarget, c, {   // 좁은 화면에서는 위에서 뺀 단추들이 이 메뉴 안으로 들어온다
      narrow: matchMedia('(max-width: 820px)').matches, setMode, find: findInChat, me: a => menu(a, meItems()), pres: a => menu(a, presItems(c, chars)) })),
    iconBtn('panel', '장면 패널', () => { cur.drawer = !cur.drawer; ui.layout.classList.toggle('with-drawer', cur.drawer); if (cur.drawer) drawDrawer(); }));
  setStatus(cur.status); drawGauge();
}
Live.onChange = () => { if (!cur.chat || !ui.hud || route.page !== 'chat') return; drawTop(); drawHud(); if (cur.drawer) drawDrawer(); armAuto(); };
Live.onUser = () => { if (!cur.chat || !ui.top || route.page !== 'chat') return; drawTop(); armAuto(); };
const presItems = (c, chars) => [
    ...chars.map(ch => { const p = presenceOf(c, ch); return { label: `${ch.name} · ${STATUS[p.status]}`, hint: p.activity || (scheduleOf(ch) ? '' : '일정 없음'), ic: 'moon', onclick: () => Schedule.edit(ch) }; }),
    '-', { label: '먼저 오는 연락 · 상태 설정', ic: 'sliders', onclick: () => Live.settings('auto', c) }];
const meItems = () => [
    ...Object.entries(Live.userStatuses).map(([k, l]) => ({ label: l, ic: mo('userStatus') === k ? 'check' : 'user', hint: k === 'dnd' ? '먼저 오는 연락 없음' : k === 'hidden' ? '오프라인처럼 보임' : k === 'idle' ? '' : `${mo('userIdleMin') || 0}분 뒤 자동 자리 비움`, onclick: () => Live.setUserStatus(k) })),
    '-', { label: '하는 일 적기', ic: 'edit', hint: String(mo('userActivity') || ''), onclick: async () => { const v = await promptBox('지금 하는 일 (캐릭터에게 보여요)', String(mo('userActivity') || ''), { placeholder: '예: 회의 중' }); if (v !== null) { S.settings.modes.userActivity = v.trim(); S.set({}); } } }];
/** 내 상태 */
function meBtn() {
  const u = Live.userStatus();
  return h(`button.me-btn.top-wide.is-${u.status}`, { type: 'button', title: `내 상태: ${u.label}${u.auto ? ' (입력이 없어 자동으로)' : ''}`, onclick: e => menu(e.currentTarget, meItems()) },
    h('i'), h('span', '나'));
}
const saveState = debounce(() => { if (cur.chat) S.saveMsgs(cur.chat, cur.msgs); }, 300);
const hudOpts = () => { const c = cur.chat; return { msgs: cur.msgs, chars: charsOf(c), saved: saveState, redraw: () => { drawHud(); drawDossier(); if (cur.drawer) drawDrawer(); },
  onJump: m => { const i = cur.msgs.indexOf(m); if (i < 0) return; cur.shown = Math.max(cur.shown, cur.msgs.length - i + 4); drawMsgs(); setTimeout(() => chatApi.scrollTo(m.id), 60); },
  onFold: async () => { c.hudFold = !c.hudFold; await S.save('chats', c, true); drawHud(); } }; };
function drawHud() {
  if (!ui.hud || !cur.chat) return;
  const el = Live.hud(cur.chat, hudOpts());
  ui.hud.replaceChildren(...(el ? [el] : []));
}
/** 메시지가 지워지거나 스와이프가 바뀌면 상태창을 그 시점으로 되감는다 */
function rewindState() { if (cur.chat && Live.rewind(cur.chat, cur.msgs)) { drawHud(); drawDossier(); if (cur.drawer) drawDrawer(); } }
function drawDossier() {
  if (!ui.dossier || !cur.chat) return;
  const c = cur.chat, chars = charsOf(c), ch = chars[0]; if (!ch) return ui.dossier.replaceChildren();
  if (chars.length > 1) return ui.dossier.replaceChildren(h('div.dream-card', h('div.cast-grid', chars.map(x => h(`button.cast${(c.muted || []).includes(x.id) ? '.muted' : ''}`, { title: `${x.name}의 차례로`, onclick: () => generate('normal', { speaker: x }) }, h('div.arch', { style: x.avatar ? { backgroundImage: `url("${x.avatar}")` } : {} }, !x.avatar && h('span', x.name.slice(0, 1))), h('b', x.name)))), h('div.dream-rows', h('div', h('span', '등장인물'), h('b', `${chars.length}명`)), h('div', h('span', '대화'), h('b', `${cur.msgs.filter(m => m.role === 'assistant').length}턴`)))));
  const mem = Memory.get(c.id), tr = Object.entries(c.tracker || {});
  const scene = (mem?.status || []).filter(s => s.entity === 'scene').slice(0, 3).map(s => [s.slot, s.value]);
  const rows = [...tr.slice(0, 4), ...(tr.length ? [] : scene), ['대화', `${cur.msgs.filter(m => m.role === 'assistant').length}턴`], ...(S.settings.memory.enabled ? [['기억', `${mem?.memories.length || 0}개`]] : [])];
  ui.dossier.replaceChildren(
    h('div.dream-card',
      h('div.sheet-window', h('i.orbit'), h('button.arch.lg', { title: '초상 크게 보기', style: ch.avatar ? { backgroundImage: `url("${ch.avatar}")` } : {}, onclick: () => ch.avatar && modal({ title: ch.name, wide: true, body: h('img.full-img', { src: ch.avatar }) }) }, !ch.avatar && h('span', ch.name.slice(0, 1)))),
      h('b.dream-card-name', titleOf(c)), ch.tags.length ? h('small', ch.tags.slice(0, 3).map(t => '#' + t).join(' ')) : null,
      h('div.dream-rows', rows.map(([k, v]) => h('div', h('span', k), h('b', v))))));
}
function setStatus(t) { cur.status = t; if (ui.status) { ui.status.textContent = t; ui.status.classList.toggle('on', !!t); } }
function drawGauge() {
  if (!ui.gauge) return;
  const short = v => v >= 10000 ? (v / 1000).toFixed(v >= 100000 ? 0 : 1).replace(/\.0$/, '') + 'k' : v.toLocaleString();
  const max = S.presetFor(cur.chat).params.contextSize || 128000, n = cur.lastPrompt?.total;
  ui.gauge.replaceChildren(h('i', { style: { width: clamp((n || 0) / max * 100, 0, 100) + '%' } }), h('span', n != null ? `≈${short(n)} / ${short(max)}` : '프롬프트'));
  ui.gauge.title = n != null ? `프롬프트 살펴보기 · ≈${n.toLocaleString()} / ${max.toLocaleString()} 토큰` : '프롬프트 살펴보기';
}

function drawMsgs() {
  const from = Math.max(0, cur.msgs.length - cur.shown);
  const els = []; let day = '';
  cur.msgs.slice(from).forEach((m, i) => {
    const d = new Date(Clock.timeOf(cur.chat, m) || 0).toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'short' });
    if (d !== day && m.ts && Clock.mode(cur.chat) !== 'none') { day = d; els.push(h('div.daysep', h('span', d))); }
    els.push(msgEl(m, from + i));
  });
  ui.msgs.replaceChildren(...[from > 0 ? btn(`이전 메시지 ${from}개 더 보기`, { cls: 'ghost more-btn', onclick: () => { const hgt = ui.scroll.scrollHeight; cur.shown += 80; drawMsgs(); ui.scroll.scrollTop = ui.scroll.scrollHeight - hgt; } }) : null, ...els].filter(Boolean));
}

const bodyHtml = (m) => {
  const s = m.swipes[m.sw] || { text: '' };
  const depth = cur.msgs.length - 1 - cur.msgs.indexOf(m);
  const raw = s.showTr && s.tr ? s.tr : s.text;
  const text = runFilters(applyRegex(raw, { who: m.role === 'user' ? 'user' : 'ai', target: 'display', depth, charId: m.charId }), { role: m.role, msg: m, chat: cur.chat });
  const style = m.role === 'system' ? 'plain' : modeOf(cur.chat) === 'talk' && !m.scene ? 'chat' : S.settings.rpBubbles ? 'bubbles' : 'novel';
  return render(Assets.expand(Illust.strip(text), assetOwners(), `${m.id}:${m.sw}`), { style });
};

function msgEl(m, idx) {
  const isLast = idx === cur.msgs.length - 1;
  const s = m.swipes[m.sw] || { text: '' };
  const who = m.role === 'user' ? S.persona(cur.chat) : m.role === 'assistant' ? (S.get('chars', m.charId) || { name: m.name }) : null;
  const el = h(`article.msg.${m.role === 'user' ? 'user' : m.role === 'assistant' ? 'ai' : 'sys'}${m.hidden ? '.hidden-msg' : ''}`, { dataset: { id: m.id } });
  const grouped = (cur.chat?.charIds.length || 0) > 1;
  const castNo = grouped && m.role === 'assistant' ? cur.chat.charIds.indexOf(m.charId) + 1 : 0;
  if (grouped && m.role !== 'system') { el.classList.add('grouped'); const prev = cur.msgs[idx - 1]; if (prev && prev.role === m.role && (prev.charId || '') === (m.charId || '') && !prev.dice && new Date(prev.ts).toDateString() === new Date(m.ts).toDateString()) el.classList.add('cont'); }
  const body = h('div.msg-body', { html: bodyHtml(m) });
  if (m.scene) el.classList.add('in-scene');
  if (m.role === 'system' && m.curtain) { const k = m.curtain; el.classList.add('curtain-msg', k.kind); el.append(h('div.curtain', h('i', k.kind === 'open' ? '☾' : '✦'), h('div', h('small', k.kind === 'open' ? '장면이 열려요' : '장면이 닫혔어요'), h('b', k.kind === 'open' ? (k.title || '이름 없는 장면') : (k.summary || '다시 메시지로 돌아왔어요')), k.kind === 'open' && (k.place || k.time) ? h('span', [k.place, k.time].filter(Boolean).join(' · ')) : null), h('div.msg-tools', iconBtn('trash', '삭제', () => delMsg(m))))); return el; }
  if (m.role === 'system' && m.dice) { el.append(diceCard(m), h('div.msg-tools', iconBtn('trash', '삭제', () => delMsg(m)))); el.classList.add('dice-msg'); return el; }
  if (m.role === 'system') { el.append(h('div.sys-line', body, h('div.msg-tools', iconBtn('edit', '수정', () => editMsg(m, el)), iconBtn('trash', '삭제', () => delMsg(m))))); return el; }
  const tools = h('div.msg-tools');
  const canSwipe = m.role === 'assistant' && (m.swipes.length > 1 || isLast);
  if (canSwipe) tools.append(h('div.swipe', iconBtn('left', '이전 답변', () => swipe(m, -1)), h('span', `${m.sw + 1} / ${m.swipes.length}`), iconBtn('right', isLast && m.sw === m.swipes.length - 1 ? '새 답변 생성' : '다음 답변', () => swipe(m, 1))));
  if (m.role === 'assistant' && isLast) tools.append(iconBtn('refresh', '다시 생성', () => generate('regen')), iconBtn('play', '이어 쓰기', () => generate('continue')));
  tools.append(iconBtn('edit', '수정', () => editMsg(m, el)), iconBtn('copy', '복사', () => { navigator.clipboard.writeText(s.text); toast('복사했어요'); }),
    iconBtn('more', '더 보기', e => menu(e.currentTarget, [
      { label: '여기서 분기', ic: 'branch', hint: '새 대화로', onclick: () => branch(idx) },
      { label: s.showTr ? '원문 보기' : (s.tr ? '번역 보기' : '번역'), ic: 'lang', onclick: () => translate(m) },
      s.tr && { label: '다시 번역', ic: 'refresh', onclick: () => translate(m, { again: true }) },
      s.tr && { label: '번역 고치기', ic: 'edit', onclick: () => editTranslation(m) },
      { label: '삽화 그리기', ic: 'image', onclick: () => illustDialog(m) },
      { label: '소리 내어 읽기', ic: 'volume', onclick: () => speak(s.text) },
      ...X.actions.map(a => ({ label: a.label, ic: a.icon || 'sparkle', onclick: () => a.run(m, cur.chat) })),
      { label: m.hidden ? '프롬프트에 다시 포함' : '프롬프트에서 숨기기', ic: m.hidden ? 'eye' : 'eyeoff', onclick: async () => { m.hidden = !m.hidden; await save(); redraw(m); } },
      '-',
      { label: '이 메시지 삭제', ic: 'trash', danger: true, onclick: () => delMsg(m) },
      { label: '여기부터 아래 모두 삭제', ic: 'trash', danger: true, onclick: async () => { if (await confirmBox('이 메시지와 그 아래를 모두 삭제할까요?', '삭제', true)) { cur.msgs.splice(idx); const sc = syncScene(cur.chat, cur.msgs); rewindState(); await save(); emit('message:deleted', { chat: cur.chat, msgs: cur.msgs }); if (sc) drawMain(); else drawMsgs(); drawSide(); } } },
    ])));
  const meta = S.settings.showMeta ? [msgClock(m, s), s.model, s.ms ? (s.ms / 1000).toFixed(1) + '초' : '', s.text ? `≈${tokens(s.text)}토큰` : ''].filter(Boolean).join(' · ') : msgClock(m, s);
  el.append(avatar(who, S.settings.avatarShape === 'tall' ? 'tall' : ''),
    h('div.msg-main',
      h('header.msg-head', castNo ? h('span.cast-no', String(castNo).padStart(2, '0')) : null, h('b', who?.name || m.name || ''), h('span.msg-no', String(idx + 1).padStart(3, '0')), h('time', meta), m.why && mo('showWhy') !== false && motiveLabel(m.why) ? h('em.why', { title: '캐릭터가 먼저 보낸 연락이에요' }, motiveLabel(m.why)) : null, m.hidden && h('em.badge', '숨김')),
      m.images?.length ? h('div.msg-images', m.images.map(u => h('img', { src: u, alt: '첨부 이미지', onclick: () => modal({ title: '', wide: true, body: h('img.full-img', { src: u }) }) }))) : null,
      s.reasoning ? h('details.reason', { open: !!S.settings.format?.reasoning?.autoExpand }, h('summary', icon('sparkle', 14), '생각 과정'), h('div', s.reasoning)) : null,
      body, m.reactions?.length ? h('div.reacts', m.reactions.map(r => h('span', { title: r.by || '' }, r.emoji))) : null, illustEls(m, s), tools));
  return el;
}
function redraw(m) {
  const old = ui.msgs?.querySelector(`[data-id="${m.id}"]`); const idx = cur.msgs.indexOf(m);
  if (old && idx >= 0) { const el = msgEl(m, idx); if (old.classList.contains('picked')) el.classList.add('picked'); old.replaceWith(el); } else drawMsgs();
}
const nearBottom = () => ui.scroll.scrollHeight - ui.scroll.scrollTop - ui.scroll.clientHeight < 160;
const toBottom = () => { ui.scroll.scrollTop = ui.scroll.scrollHeight; };

// ── 메시지 동작 ──
function editMsg(m, el) {
  const s = m.swipes[m.sw]; const body = el.querySelector('.msg-body');
  const ta = h('textarea.inp.edit-area', { value: s.text, spellcheck: false });
  const fit = () => { ta.style.height = 'auto'; ta.style.height = Math.min(ta.scrollHeight + 4, innerHeight * 0.6) + 'px'; };
  const done = async ok => { const changed = ok && s.text !== ta.value; if (ok) { s.text = ta.value; delete s.tr; s.showTr = false; await save(); } redraw(m); if (changed) emit('message:edited', { chat: cur.chat, msg: m, msgs: cur.msgs }); };
  ta.addEventListener('input', fit);
  ta.addEventListener('keydown', e => { if (e.key === 'Escape') done(false); if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) done(true); });
  body.replaceWith(h('div.edit-box', ta, h('div.row.end', btn('취소', { cls: 'ghost', onclick: () => done(false) }), btn('저장', { cls: 'primary', ic: 'check', onclick: () => done(true) }))));
  fit(); ta.focus();
}
async function delMsg(m) { if (cur.msgs.indexOf(m) < 0 || !(await confirmBox('이 메시지를 삭제할까요?', '삭제', true))) return; const i = cur.msgs.indexOf(m); if (i < 0) return; cur.msgs.splice(i, 1); const sc = syncScene(cur.chat, cur.msgs); rewindState(); await save(); emit('message:deleted', { chat: cur.chat, msgs: cur.msgs }); if (sc) drawMain(); else drawMsgs(); drawSide(); }
/** 장면 상태를 남아 있는 메시지에 맞춘다 (막을 올린 표시가 지워졌으면 장면도 닫힌 것). 바뀌었으면 true */
function syncScene(chat, list) {
  const k = [...list].reverse().find(m => m.curtain)?.curtain, on = k?.kind === 'open'; if (!!chat.scene?.on === on) return false;
  chat.scene = on ? { on: true, title: k.title || '만남', place: k.place || '', at: list.length } : { ...(chat.scene || {}), on: false }; return true;
}
async function swipe(m, dir) {
  if (cur.busy) return;
  const n = m.sw + dir;
  if (n < 0) return;
  if (n >= m.swipes.length) { if (cur.msgs[cur.msgs.length - 1] === m) generate('regen'); return; }
  m.sw = n; rewindState(); await save(); redraw(m); emit('message:swiped', { chat: cur.chat, msg: m, msgs: cur.msgs });
}
async function branch(idx) {
  const c = cur.chat, copy = o => { try { return structuredClone(o); } catch { return JSON.parse(JSON.stringify(o)); } };
  try {
    const n = S.chats.filter(x => x.parent?.id === c.id).length + 1;
    const chat = newChat({ ...copy(c), id: uid(), name: `${roomName(c)} · 분기 ${n}`, createdAt: now(), src: '', pinned: false, parent: { id: c.id, at: idx + 1 }, diary: copy((c.diary || []).filter(d => (d.to || 0) <= idx + 1)), diaryAt: Math.min(c.diaryAt || 0, idx + 1) });
    const list = copy(cur.msgs.slice(0, idx + 1));
    Live.rewind(chat, list); syncScene(chat, list); delete chat.owed; chat.later = [];
    // 삽화는 대화방마다 따로 보관하므로 새 방 몫으로 복사한다
    const pics = new Map((await DB.byOwner('chat:' + c.id)).filter(a => a.kind === 'illust').map(a => [a.id, a]));
    const moved = new Map(), dup = async id => { if (!pics.has(id)) return id; if (!moved.has(id)) { const nid = uid(); await DB.put('assets', { ...pics.get(id), id: nid, owner: 'chat:' + chat.id }); moved.set(id, nid); } return moved.get(id); };
    for (const m of list) for (const sw of m.swipes || []) for (const it of sw.illust || []) { for (const v of it.versions || []) if (v.id) v.id = await dup(v.id); if (it.id) it.id = await dup(it.id); }
    // 장기기억도 이어받는다 (분기점 뒤의 기록은 다음 생성 때 걸러진다)
    const mem = await DB.get('mem', c.id).catch(() => null); if (mem) await DB.put('mem', { ...copy(mem), id: chat.id });
    await S.saveMsgs(chat, list);
    toast(`"${chat.name}" 방을 만들어 옮겨 왔어요`, 'ok'); go('chat', chat.id);
  } catch (e) { console.error(e); toast('분기하지 못했어요: ' + e.message, 'err'); }
}
// 후처리(번역 · 삽화) 결과를 그 메시지가 속한 방에 저장한다. 기다리는 사이 방을 옮겼거나 다시 열었어도 같은 메시지를 찾아 옮겨 적는다
async function saveIn(chat, list, m, carry) {
  if (cur.chat?.id === chat.id) { let live = m; if (!cur.msgs.includes(m)) { live = cur.msgs.find(x => x.id === m.id); if (!live) return; carry(live); } await save(); redraw(live); }
  else if (S.get('chats', chat.id) && list.includes(m)) await S.saveMsgs(chat, list);
}
async function translate(m, { again = false, chat = cur.chat, msgs: list = cur.msgs } = {}) {
  const s = m.swipes[m.sw];
  if (s.tr && !again) { s.showTr = !s.showTr; await save(); return redraw(m); }
  setStatus('번역 중…');
  try {
    const idx = list.indexOf(m), user = S.persona(chat).name, n = S.settings.translate.context || 0;
    const context = n ? list.slice(Math.max(0, idx - n), idx).filter(x => !x.hidden).map(x => ({ name: x.role === 'user' ? user : (x.name || 'Narrator'), text: msgText(x) })) : [];
    const src = s.text;
    s.tr = await (X.translate || translateText)(Illust.strip(s.text), S.settings.translate.lang, { chat, context }); s.showTr = true;
    await saveIn(chat, list, m, live => { const t = live.swipes?.[m.swipes.indexOf(s)]; if (t && t.text === src) { t.tr = s.tr; t.showTr = true; } });
  } catch (e) { toast('번역 실패: ' + e.message, 'err'); } finally { setStatus(''); }
}
async function editTranslation(m) {
  const s = m.swipes[m.sw]; const v = await promptBox('번역 고치기', s.tr || '', { area: true });
  if (v === null) return; if (v.trim()) { s.tr = v; s.showTr = true; } else { delete s.tr; s.showTr = false; }
  await save(); redraw(m);
}
async function translateInput() {
  const text = ui.input?.value.trim(); if (!text) return toast('번역할 내용을 먼저 적어 주세요');
  setStatus('번역 중…');
  try { ui.input.value = await (X.translate || translateText)(text, S.settings.translate.inputLang || 'English', { chat: cur.chat }); ui.input.dispatchEvent(new Event('input')); } catch (e) { toast('번역 실패: ' + e.message, 'err'); } finally { setStatus(''); }
}
// ── 삽화 ──
const assetOwners = () => cur.chat ? [...cur.chat.charIds.map(Assets.ownerOfChar), Assets.ownerOfPersona(S.persona(cur.chat).id)] : [];
function illustEls(m, s) {
  if (!s.illust?.length) return null;
  return h('div.illusts', s.illust.map((it, i) => h('figure.illust',
    h('img', { src: Illust.data(it.id), alt: '삽화', loading: 'lazy', onclick: () => modal({ title: '', wide: true, body: h('div.col', h('img.full-img', { src: Illust.data(it.id) }), it.title && h('b', it.title), h('p.hint', [it.camera, it.prompt, ...(it.characters || []).map(x => typeof x === 'string' ? x : `${x.name || ''}: ${[x.outfit, x.action].filter(Boolean).join(', ')}`)].filter(Boolean).join(' · '))) }) }),
    h('figcaption', iconBtn('refresh', '다시 그리기', () => drawScene(m, { title: it.title, camera: it.camera, prompt: it.prompt, negative: it.negative, characters: it.characters }), 'tiny'), iconBtn('edit', '프롬프트 고쳐서 그리기', () => illustDialog(m, it.prompt), 'tiny'), iconBtn('trash', '삽화 지우기', async () => { if (!(await confirmBox('이 삽화를 지울까요?', '지우기', true))) return; s.illust.splice(s.illust.indexOf(it), 1); await Illust.remove(it.id); await save(); redraw(m); }, 'tiny')))));
}
function drawScene(m, scene, at) {
  setStatus('삽화 그리는 중…');
  const g = cur.gen?.msgs.includes(m) ? cur.gen : null, chat = at?.chat || g?.chat || cur.chat, list = at?.msgs || g?.msgs || cur.msgs;
  Illust.enqueue(chat, m, scene, async err => { setStatus(''); if (err) return toast('삽화 실패: ' + err.message, 'err'); await saveIn(chat, list, m, live => m.swipes.forEach((sw, i) => { const t = live.swipes?.[i]; if (t && t.text === sw.text) for (const k of ['illust', 'illustPlan', 'illustDraft']) if (sw[k]) t[k] = sw[k]; })); });
}
function illustDialog(m, preset = '') {
  const ta = h('textarea.inp', { rows: 5, value: preset, placeholder: '그릴 장면을 적어 주세요. 비워 두고 "장면에서 뽑기"를 누르면 이 메시지에서 자동으로 만들어요.' });
  let box;
  box = modal({ title: '삽화 그리기', body: h('div.col', ta, h('p.hint', '인물의 외형은 캐릭터 편집 › 에셋 탭에 적어 둔 내용이 자동으로 붙습니다.')), actions: [
    { label: '장면에서 뽑기', ic: 'sparkle', onclick: async () => { try { ta.value = '생각 중…'; const sc = await Illust.analyze(cur.chat, cur.msgs, m); ta.value = sc[0]?.prompt || ''; ta._scene = sc[0]; } catch (e) { ta.value = ''; toast(e.message, 'err'); } return false; } },
    { label: '그리기', cls: 'primary', ic: 'image', onclick: () => { const p = ta.value.trim(); if (!p) { toast('프롬프트가 비어 있어요'); return false; } drawScene(m, { ...(ta._scene || {}), prompt: p }); } }] });
}
function speak(text) {
  if (!('speechSynthesis' in window)) return toast('이 브라우저는 읽어 주기를 지원하지 않아요', 'err');
  speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text.replace(/[*_`#>]/g, '')); u.lang = /[가-힣]/.test(text) ? 'ko-KR' : 'en-US';
  speechSynthesis.speak(u);
}

// ════════ 입력창 ════════
function drawComposer() {
  const chars = charsOf(cur.chat);
  const input = h('textarea.composer-input', { placeholder: modeOf(cur.chat) === 'talk' ? '메시지 보내기…' : '이야기를 이어 가세요… (비워 두고 보내면 AI 가 이어 씁니다)', rows: 1, spellcheck: false });
  ui.input = input;
  const fit = () => { input.style.height = 'auto'; input.style.height = Math.min(input.scrollHeight, 220) + 'px'; };
  input.addEventListener('input', fit);
  slashPopup(input, ui.composer, commandList);   // 보내기 단축키보다 먼저 붙인다
  input.addEventListener('keydown', e => {
    if (e.key === 'Enter' && !e.isComposing && ((S.settings.enterSend && !e.shiftKey) || e.ctrlKey || e.metaKey)) { e.preventDefault(); send(); }
  });
  ui.sendBtn = h('button.send', { title: '보내기', onclick: () => cur.busy ? cur.abort?.abort() : send() }, icon('send', 20));
  const plus = iconBtn('plus', '더 많은 동작', e => menu(e.currentTarget, [
    { label: '대신 써 주기', ic: 'feather', hint: '내 차례를 AI 가', onclick: () => generate('impersonate') },
    { label: '이어 쓰기', ic: 'play', onclick: () => generate('continue') },
    { label: '나레이션 넣기', ic: 'note', onclick: async () => { const t = await promptBox('나레이션', '', { area: true }); if (t) command('/sys ' + t); } },
    { label: '주사위 굴리기', ic: 'dice', onclick: async () => { const t = await promptBox('주사위 식', '1d20'); if (t) command('/roll ' + t); } },
    { label: '입력한 글 번역하기', ic: 'lang', hint: S.settings.translate.inputLang, onclick: translateInput },
    ...X.composer.map(a => ({ label: a.label, ic: a.icon || 'sparkle', onclick: () => a.run(input) })),
    '-',
    { label: '명령어 도움말', ic: 'code', onclick: () => command('/help') },
  ]));
  const quick = h('div.quick', S.settings.quick.map(q => h('button.chip', { onclick: () => { if (q.text.startsWith('/')) command(q.text); else { input.value = (input.value ? input.value + ' ' : '') + q.text; fit(); input.focus(); } } }, q.label)));
  if (modeOf(cur.chat) === 'talk') quick.append(cur.chat.scene?.on ? h('button.chip.scene-chip.on', { title: '장면을 끝내고 메시지로 돌아갑니다', onclick: () => closeScene() }, '장면 닫기') : h('button.chip.scene-chip', { title: '지금부터 만나서 벌어지는 일을 장면으로 씁니다', onclick: async () => { const t = await promptBox('어떤 장면을 열까요?', '', { placeholder: '예: 역 앞에서 만남' }); if (t !== null) openScene({ title: t.trim() }); } }, '장면 열기'));
  const muted = new Set(cur.chat.muted || []);
  const speakers = chars.length > 1 ? h('div.speakers', h('span.speakers-label', '누가 말할까요'), chars.map((c, i) => h(`button.speaker${muted.has(c.id) ? '.muted' : ''}${[...cur.msgs].reverse().find(m => m.role === 'assistant')?.charId === c.id ? '.last' : ''}`, { title: muted.has(c.id) ? `${c.name} — 쉬는 중 (눌러서 말하게 하기)` : `${c.name}의 차례로`, onclick: () => generate('normal', { speaker: c }) }, avatar(c, 'sm'), h('small', String(i + 1).padStart(2, '0')), h('span', c.name)))) : null;
  ui.attach = h('div.attach');
  const addImages = async files => { for (const f of files) { if (!f.type.startsWith('image/')) continue; cur.attach.push(await shrinkImage(await readDataURL(f), 1568, 'image/jpeg', 0.88)); } drawAttach(); };
  const drawAttach = () => ui.attach.replaceChildren(...cur.attach.map((u, i) => h('div.attach-item', h('img', { src: u }), iconBtn('x', '빼기', () => { cur.attach.splice(i, 1); drawAttach(); }, 'tiny'))));
  input.addEventListener('paste', e => { const fs = [...(e.clipboardData?.files || [])].filter(f => f.type.startsWith('image/')); if (fs.length) { e.preventDefault(); addImages(fs); } });
  const clip = iconBtn('image', '이미지 첨부 (붙여넣기도 됩니다)', async () => addImages(await pickFiles({ accept: 'image/*', multiple: true })));
  ui.composer.replaceChildren(...[speakers, quick, ui.attach, h('div.composer-box', plus, clip, input, ui.sendBtn)].filter(Boolean));
  drawAttach();
  setBusy(cur.busy);
}
function setBusy(b) {
  cur.busy = b;
  if (!ui.sendBtn) return;
  ui.sendBtn.replaceChildren(icon(b ? 'stop' : 'send', 20)); ui.sendBtn.classList.toggle('busy', b); ui.sendBtn.title = b ? '멈추기' : '보내기';
}

async function send() {
  if (cur.busy) return;
  const raw = ui.input.value.trim();
  if (raw.startsWith('/')) { ui.input.value = ''; ui.input.style.height = 'auto'; return command(raw); }
  if (raw || cur.attach.length) {
    const chat = cur.chat, chars = charsOf(chat), persona = S.persona(chat);
    const ctx = makeCtx({ chat, char: chars[0], chars, persona, msgs: cur.msgs, input: raw });
    let text = applyRegex(macro(raw, ctx), { who: 'user', target: 'store', ctx }), mine = '';
    if (S.settings.translate.autoInput && text.trim()) { setStatus('번역 중…'); try { mine = text; text = await (X.translate || translateText)(text, S.settings.translate.inputLang || 'English', { chat }); } catch (e) { mine = ''; toast('입력 번역 실패: ' + e.message, 'err'); } finally { setStatus(''); } }
    const m = newMsg('user', text, { name: persona.name, ...(modeOf(chat) === 'talk' && chat.scene?.on ? { scene: true } : {}) });
    chat.seenAt = now();
    if (mine) { m.swipes[0].tr = mine; m.swipes[0].showTr = true; }   // 화면에는 내가 쓴 말을, 모델에는 번역문을
    if (cur.attach.length) { m.images = cur.attach; cur.attach = []; ui.attach?.replaceChildren(); }
    cur.msgs.push(m); ui.msgs.append(msgEl(m, cur.msgs.length - 1)); emit('message:sent', { msg: m, chat });
    if (chat.auto) chat.auto.streak = 0;
    cur.chimeRun = 0; clearTimeout(chimeTimer); Live.touch();
    const prev = ui.msgs.querySelector(`[data-id="${cur.msgs[cur.msgs.length - 2]?.id}"]`); if (prev) redraw(cur.msgs[cur.msgs.length - 2]);
    ui.input.value = ''; ui.input.style.height = 'auto'; toBottom();
    await save();
  }
  generate('normal');
}

const HELP = [['/roll 2d6+1', '주사위를 굴려 결과를 장면에 남깁니다'], ['/sys 문장', '나레이션(시스템) 메시지를 넣습니다'], ['/continue', '마지막 답변을 이어 씁니다'], ['/regen', '마지막 답변을 다시 생성합니다'], ['/imp', '내 차례를 AI 가 대신 씁니다'],
  ['/note 문장', '작가 노트를 설정합니다 (비우면 삭제)'], ['/setvar 이름 값', '대화 변수를 설정합니다 · {{getvar::이름}}'], ['/getvar 이름', '대화 변수 값을 확인합니다'], ['/bg 주소', '대화 배경 이미지를 바꿉니다 (비우면 제거)']];
/** 메시지 옆에 적는 시각: 이야기 시계를 쓰는 방은 이야기 시각, 시각을 쓰지 않는 방은 비움 */
const msgClock = (m, s) => { const k = Clock.mode(cur.chat); return k === 'none' ? '' : k === 'story' ? fmtTime(Clock.timeOf(cur.chat, m)) : fmtTime(s.ts || m.ts); };
on('clock', c => { if (c === cur.chat && ui.top && route.page === 'chat') { drawTop(); drawMsgs(); if (cur.drawer) drawDrawer(); armAuto(); } });
on('clock:tick', c => { if (c === cur.chat && ui.top && route.page === 'chat') drawTop(); });
const ALIAS = { '/roll': ['/r', '/dice'], '/sys': ['/narrate'], '/continue': ['/cont'], '/imp': ['/impersonate'], '/help': ['/?'] };
/** 입력창의 명령어 목록: 기본 명령어 + 기능 · 확장이 등록한 명령어 */
function commandList() {
  const base = [...HELP, ['/help', '명령어를 모두 봅니다']].map(([c, d]) => { const [cmd, ...a] = c.split(' '); return { cmd, args: a.join(' '), help: d, alias: ALIAS[cmd] }; });
  const seen = new Set(base.flatMap(b => [b.cmd, ...(b.alias || [])]));
  const ext = [...X.commands].filter(([k]) => !seen.has(k)).map(([k, v]) => ({ cmd: k, args: v.args || '', help: v.help || '확장 명령어' })).sort((x, y) => x.cmd.localeCompare(y.cmd));
  return [...base, ...ext];
}
async function command(line) {
  const [cmd, ...rest] = line.trim().split(/\s+/); const arg = line.trim().slice(cmd.length).trim();
  const sys = async text => { const m = newMsg('system', text); cur.msgs.push(m); ui.msgs.append(msgEl(m, cur.msgs.length - 1)); toBottom(); await save(); };
  switch (cmd.toLowerCase()) {
    case '/roll': case '/r': case '/dice': {
      const r = roll(arg || '1d20'); if (!r) return toast('주사위 식을 확인해 주세요 (예: 2d6+1)', 'err');
      const who = S.persona(cur.chat).name, sides = +r.expr.split('d')[1].replace(/[+-].*/, '');
      const m = newMsg('system', `${who}의 주사위 ${r.expr} → ${r.rolls.join(', ')}${r.mod ? ` (${r.mod > 0 ? '+' : ''}${r.mod})` : ''} = ${r.total}`, { dice: { expr: r.expr, rolls: r.rolls, mod: r.mod, total: r.total, sides }, diceBy: who });
      cur.msgs.push(m); ui.msgs.append(msgEl(m, cur.msgs.length - 1)); toBottom(); return save();
    }
    case '/sys': case '/narrate': return arg ? sys(arg) : null;
    case '/continue': case '/cont': return generate('continue');
    case '/regen': return generate('regen');
    case '/imp': case '/impersonate': return generate('impersonate');
    case '/note': cur.chat.note = { ...(cur.chat.note || { depth: 4, role: 'system' }), text: arg }; await S.save('chats', cur.chat, true); toast(arg ? '작가 노트를 설정했어요' : '작가 노트를 비웠어요'); if (cur.drawer) drawDrawer(); return;
    case '/setvar': (cur.chat.vars ||= {})[rest[0]] = rest.slice(1).join(' '); await S.save('chats', cur.chat, true); toast(`${rest[0]} = ${rest.slice(1).join(' ')}`); if (cur.drawer) drawDrawer(); return;
    case '/getvar': return toast(`${rest[0]} = ${cur.chat.vars?.[rest[0]] ?? '(없음)'}`);
    case '/bg': cur.chat.bg = arg; await S.save('chats', cur.chat, true); return drawMain();
    case '/help': case '/?': return modal({ title: '명령어', body: h('div.help', [...HELP, ...[...X.commands].map(([k, v]) => [k, v.help || '확장 명령어'])].map(([c, d]) => h('div.help-row', h('code', c), h('span', d)))) });
    default: { const ext = X.commands.get(cmd.toLowerCase()); if (!ext) { if (ui.input && !ui.input.value) { ui.input.value = line; ui.input.dispatchEvent(new Event('input')); } return toast(`알 수 없는 명령어: ${cmd}`, 'err'); } try { return await ext.run(arg, chatApi); } catch (e) { console.error(e); return toast(`${cmd}: ${e.message}`, 'err'); } }
  }
}

// ════════ 주사위 ════════
function diceCard(m) {
  const d = m.dice, fresh = now() - m.ts < 10000 && S.settings.motion !== false, many = d.rolls.length >= 6;
  const total = h('strong', fresh ? '…' : String(d.total)); let left = d.rolls.length;
  const settle = () => { if (--left > 0 || !fresh) return; total.textContent = d.total; total.classList.add('pop'); card.classList.add('done'); };
  const dice = d.rolls.map((v, i) => die3d(d.sides, v, { animate: fresh, delay: i * 130, size: many ? 76 : 132, tone: d.sides === 20 && v === 20 ? 'crit' : d.sides === 20 && v === 1 ? 'fumble' : '', onSettle: settle }));
  const best = d.sides === 20 && d.rolls.length === 1 ? (d.rolls[0] === 20 ? '대성공' : d.rolls[0] === 1 ? '대실패' : '') : '';
  const card = h(`div.dice-card${many ? '.many' : ''}${fresh ? '' : '.done'}`, h('div.dice-head', icon('dice', 15), h('span', `${m.diceBy || ''} · ${d.expr}`), best ? h('em', best) : null), h('div.dice-row', dice),
    h('div.dice-foot', h('span', `${d.rolls.join(' + ')}${d.mod ? ` ${d.mod > 0 ? '+' : '−'} ${Math.abs(d.mod)}` : ''} =`), total));
  return card;
}

// ════════ 대화 모드: 상태 · 명령 · 먼저 말 걸기 ════════
/** 지금 이 캐릭터의 상태 (임시로 바꾼 상태 → 주간 일정 → 온라인) */
const presenceOf = (chat, ch = charsOf(chat)[0]) => Live.presence(chat, ch);
const awakeChars = chat => { const cs = charsOf(chat), aw = cs.filter(c => !(chat.muted || []).includes(c.id)); return aw.length ? aw : cs; };
const nameCalled = (text, name) => { const t = String(text || '').toLowerCase(), n = String(name || '').trim().toLowerCase(), first = n.split(/\s+/)[0]; return !!n && (t.includes(n) || (first.length >= 2 && t.includes(first))); };
const weighted = (list, w) => { const total = list.reduce((n, c) => n + w(c), 0); let r = Math.random() * total; for (const c of list) { r -= w(c); if (r <= 0) return c; } return list[0]; };
async function runTalkCommands(chat, msgs, target, cmds) {
  for (const c of cmds) {
    if (c.name === 'react' && c.args.emoji) { const u = [...msgs].reverse().find(m => m.role === 'user'); if (u) { (u.reactions ||= []).push({ emoji: c.args.emoji, by: target.name }); if (cur.chat === chat) redraw(u); } }
    else if (c.name === 'status') { const st = STATUS[c.args.state || c.args.status] ? (c.args.state || c.args.status) : 'online'; const dur = String(c.args.duration || '').match(/([\d.]+)\s*(m|h)/i); Live.setPresence(chat, S.get('chars', target.charId), { status: st, activity: c.args.activity || '', durMs: dur ? +dur[1] * (dur[2].toLowerCase() === 'h' ? 3600000 : 60000) : 0 }); }
    else if (c.name === 'time') { if (chat.clock?.ai) await Clock.move(chat, { set: c.args.set, advance: c.args.advance }); }
    else if (c.name === 'memory' && c.args.summary && S.settings.memory.enabled) await Memory.add(chat.id, { summary: c.args.summary, kind: 'fact', importance: 0.7, entities: [target.name] }).catch(() => { });
    else if (c.name === 'selfie') { const ch = S.get('chars', target.charId); drawScene(target, { title: '셀카', camera: 'selfie, upper body, looking at viewer', prompt: c.args.context || 'casual selfie', characters: [{ name: ch?.name || target.name, action: 'taking a selfie, ' + (c.args.context || 'smiling') }] }); }
  }
}
/** 말풍선을 한 줄씩 차례로 보여 준다 (저장은 이미 끝난 상태) */
async function revealLines(target) {
  const lines = msgText(target).split('\n').filter(l => l.trim()); if (lines.length < 2) return;
  const full = target.swipes[target.sw].text;
  for (let i = 1; i <= lines.length; i++) {
    const el = ui.msgs?.querySelector(`[data-id="${target.id}"] .msg-body`); if (!el || cur.busy || target.swipes[target.sw].text !== full) break;
    target.swipes[target.sw].text = lines.slice(0, i).join('\n'); el.innerHTML = bodyHtml(target) + (i < lines.length ? '<span class="typing"><i></i><i></i><i></i></span>' : ''); target.swipes[target.sw].text = full;
    if (nearBottom()) toBottom();
    if (i < lines.length) await new Promise(r => setTimeout(r, Math.min(1800, 500 + lines[i].length * 28)));
  }
}

// ── 먼저 오는 연락: 답하지 못한 말 → 약속 → 조용할 때, 한 흐름으로 ──
let autoTimer = 0, chimeTimer = 0;
const capOf = ch => { const M = S.settings.modes; return +M.autoDaily > 0 ? +M.autoDaily : ch.talk >= 0.8 ? 8 : ch.talk >= 0.6 ? 6 : ch.talk >= 0.4 ? 5 : ch.talk >= 0.2 ? 3 : 2; };
function autoState(chat) { const a = chat.auto ||= { day: '', count: 0, streak: 0 }, today = new Date().toDateString(); if (a.day !== today) { a.day = today; a.count = 0; a.chime = 0; } return a; }
/** 오프라인이 풀릴 때까지 남은 시간 (밀리초) */
function wakeMsOf(chat, ch) {
  const p = presenceOf(chat, ch); if (p.status !== 'offline') return 0;
  if (p.from === 'override') return p.until ? Math.max(1000, p.until - now()) : Infinity;
  const s = scheduleOf(ch); return s ? wakeIn(s) * 60000 : Infinity;
}
/** 선톡을 맡을 캐릭터: 가장 여유 있는 상태인 캐릭터 가운데서 (roll 이면 수다 정도에 따라 뽑는다) */
function autoChar(chat, roll = false) {
  const cs = awakeChars(chat), rank = { online: 0, idle: 1, dnd: 2, offline: 3 }; if (!cs.length) return null;
  const best = Math.min(...cs.map(c => rank[presenceOf(chat, c).status])), pool = cs.filter(c => rank[presenceOf(chat, c).status] === best);
  return roll ? weighted(pool, c => c.talk || 0.5) : pool[0];
}
/** 지금 말을 건다면 그 이유 */
function motiveFor(chat, ch, msgs) {
  const real = msgs.filter(m => m.role !== 'system'), last = real[real.length - 1], lastUser = [...real].reverse().find(m => m.role === 'user');
  const seen = !document.hidden && (chat.seenAt || 0) >= (last?.ts || 0);
  return pickMotive({ sched: scheduleOf(ch), now: Clock.now(chat), lastUserAt: lastUser?.ts || 0, lastRole: last?.role || '', seen, readReact: S.settings.modes.readReact !== false, owed: !!chat.owed,
    cd: chat.auto?.cd?.[ch.id] || {}, hours: cdHours(), longHours: mo('longHours'), use: mo('motives') !== false });
}
function markMotive(chat, ch, kind) { const a = autoState(chat); ((a.cd ||= {})[ch.id] ||= {})[kind] = now(); a.last = { kind, at: now(), charId: ch.id }; }
/** 다음 연락이 언제인지, 무엇이 막고 있는지 (설정 창의 현황판과 타이머가 같은 계산을 쓴다) */
function autoPlan(chat, msgs = cur.msgs) {
  const M = S.settings.modes, a = autoState(chat), t = now(); if (!awakeChars(chat).length) return null;
  const real = msgs.filter(m => m.role !== 'system'), last = real[real.length - 1];
  const owed = chat.owed && mo('offlineWake') !== false && last?.role === 'user' ? chat.owed : null;
  const ch = (owed && S.get('chars', owed.charId)) || autoChar(chat), p = presenceOf(chat, ch);
  const due = (chat.later || []).filter(l => l.at > t - 86400000 * 3).sort((x, y) => x.at - y.at)[0];
  const tail = msgs[msgs.length - 1], cap = capOf(ch);
  const plan = planAuto({ nowTs: t, on: !!M.auto, talk: modeOf(chat) === 'talk', scene: !!chat.scene?.on, hasUser: real.some(m => m.role === 'user'), conn: !!(S.get('conns', M.autoConn) || S.connFor(chat)),
    status: p.status, wakeMs: wakeMsOf(chat, ch), count: a.count, cap, streak: a.streak, maxStreak: M.autoStreak || 3, minutes: M.autoMinutes || 10, backoff: M.autoBackoff || 2,
    base: Math.max(tail?.swipes?.[tail.sw]?.ts || tail?.ts || 0, a.lastAt || 0, cur.chat === chat ? cur.openedAt || 0 : 0), quietMs: quietLeft(M.quietFrom, M.quietTo) * 60000,
    userStatus: Live.userStatus().status, hidden: document.hidden && !M.autoHidden, laterAt: due?.at || 0, laterOn: M.later !== false, owedAt: owed?.at || 0 });
  const motive = motiveFor(chat, ch, msgs), cd = a.cd?.[ch.id] || {}, hours = cdHours();
  return { plan, ch, due, owed, motive, count: a.count, cap, streak: a.streak, last: a.last || null, who: ch.name, status: `${STATUS[p.status]}${p.activity ? ' · ' + p.activity : ''}`,
    cdLeft: Object.fromEntries(MOTIVE_ORDER.map(k => [k, cooldownLeft(k, cd, hours, t)])) };
}
Live.planOf = chat => (cur.chat === chat && modeOf(chat) === 'talk' ? autoPlan(chat) : null);
/** 설정 창의 "지금 한 통 받기" — 한도에 넣지 않고, 이유는 지금 고를 수 있는 것으로 */
Live.poke = async chat => {
  if (cur.chat !== chat || cur.busy || modeOf(chat) !== 'talk' || !(S.get('conns', S.settings.modes.autoConn) || S.connFor(chat))) return false;
  const ch = autoChar(chat, true); if (!ch) return false;
  const mv = motiveFor(chat, ch, cur.msgs); markMotive(chat, ch, mv.kind); autoState(chat).lastAt = now(); await S.save('chats', chat, true);
  generate('normal', { proactive: true, speaker: ch, live: mv }); return true;
};
function armAuto() {
  clearTimeout(autoTimer); const chat = cur.chat;
  if (!chat || modeOf(chat) !== 'talk' || route.page !== 'chat') return;
  const P = autoPlan(chat); if (!P || !P.plan.at) return;
  autoTimer = setTimeout(() => fireAuto(chat), Math.min(Math.max(1500, P.plan.at - now()), 2 ** 31 - 1));
}
async function fireAuto(chat) {
  const later = ms => { clearTimeout(autoTimer); autoTimer = setTimeout(armAuto, ms); };
  if (cur.chat !== chat || route.page !== 'chat') return;
  if (cur.busy || ui.input?.value.trim()) return later(60000);                                  // 쓰고 있는 중이면 끼어들지 않는다
  const M = S.settings.modes, P = autoPlan(chat); if (!P || !P.plan.at) return;
  if (P.plan.at - now() > 2000) return armAuto();                                               // 그사이 사정이 바뀌었다 (오프라인 · 조용한 시간대 …)
  if (document.hidden && !M.autoHidden) return later(5 * 60000);                                // 안 보고 있으면 미룬다 (호출 없음)
  const a = autoState(chat);
  if (P.plan.kind === 'owed') {                                                                 // 오프라인이라 답하지 못한 말에 이제 답한다
    const mv = { ...P.motive, kind: 'back' }; delete chat.owed; markMotive(chat, P.ch, 'back'); await S.save('chats', chat, true);
    return generate('normal', { proactive: true, speaker: P.ch, live: mv });
  }
  if (P.plan.kind === 'later') {                                                                // 약속한 연락
    chat.later = chat.later.filter(l => l !== P.due); a.last = { kind: 'later', at: now(), charId: P.ch.id }; await S.save('chats', chat, true);
    return generate('normal', { proactive: true, speaker: P.ch, live: { kind: 'later', about: P.due.about } });
  }
  const ch = autoChar(chat, true), mv = motiveFor(chat, ch, cur.msgs);
  a.count++; a.streak++; a.lastAt = now(); markMotive(chat, ch, mv.kind); await S.save('chats', chat, true);
  generate('normal', { proactive: true, speaker: ch, live: mv });
}

/** 자리를 비운 사이: 기한이 지난 약속, 또는 오래 비웠을 때 그 사이에 온 것처럼 한 통 */
async function catchUp(chat, awayFor) {
  const M = S.settings.modes; if (modeOf(chat) !== 'talk' || cur.busy || chat.scene?.on || !S.connFor(chat) || Live.userStatus().status === 'dnd') return false;
  const a = autoState(chat), ch = autoChar(chat, true); if (!ch) return false;
  const due = M.later !== false ? (chat.later || []).filter(l => l.at <= now()).sort((x, y) => x.at - y.at)[0] : null;
  if (due) { chat.later = chat.later.filter(l => l !== due); a.last = { kind: 'later', at: now(), charId: ch.id }; await S.save('chats', chat, true); await generate('normal', { proactive: true, speaker: ch, live: { kind: 'later', about: due.about }, stamp: Math.max(due.at, now() - 86400000 * 3) }); return true; }
  const last = cur.msgs[cur.msgs.length - 1];
  if (inQuietHours() || chat.owed) return false;                                                // 답하지 못한 말이 있으면 그쪽(복귀)이 먼저다
  if (!M.auto || M.away === false || !last || awayFor < (M.awayHours || 3) * 3600000 || a.count >= capOf(ch) || (a.awayAt || 0) > (last.ts || 0) || presenceOf(chat, ch).status === 'offline') return false;
  a.awayAt = now(); a.count++; a.lastAt = now(); a.last = { kind: 'away', at: now(), charId: ch.id }; await S.save('chats', chat, true);
  const base = Math.max(last.ts || 0, now() - awayFor), stamp = Math.round(base + (now() - base) * (0.35 + Math.random() * 0.5));
  await generate('normal', { proactive: true, speaker: ch, live: { kind: 'away', hours: Math.max(1, Math.round(awayFor / 3600000)) }, stamp });
  return true;
}
document.addEventListener('visibilitychange', () => { if (!document.hidden && cur.chat) { armAuto(); cur.chat.seenAt = now(); if (cur.chat.unread) { cur.chat.unread = 0; S.save('chats', cur.chat, true); if (ui.side) drawSide(); } } });
// 일정의 칸이 바뀌면 상태 점도 따라 바뀐다
let presenceSig = '';
setInterval(() => { if (route.page !== 'chat' || !cur.chat || !ui.top || modeOf(cur.chat) !== 'talk') return; const sig = charsOf(cur.chat).map(ch => { const p = presenceOf(cur.chat, ch); return p.status + p.activity; }).join('|'); if (sig !== presenceSig) { const first = !presenceSig; presenceSig = sig; if (!first) { drawTop(); if (cur.drawer) drawDrawer(); armAuto(); } } }, 30000);

/** 그룹: 한 캐릭터가 말한 뒤 다른 캐릭터가 끼어든다 (기본 꺼짐 · 한 번에 답변 1회) */
function maybeChime(chat, msgs) {
  if (modeOf(chat) !== 'talk' || chat.scene?.on || !mo('chime') || cur.chat !== chat || charsOf(chat).length < 2) return;
  const a = autoState(chat), tail = msgs[msgs.length - 1]; if (tail?.role !== 'assistant') return;
  if ((cur.chimeRun || 0) >= (+mo('chimeMax') || 2) || (a.chime || 0) >= (+mo('chimeDaily') || 20)) return;
  const text = msgText(tail), pool = awakeChars(chat).filter(c => c.id !== tail.charId && presenceOf(chat, c).status !== 'offline'); if (!pool.length) return;
  const mood = c => ({ online: 1, idle: 0.7, dnd: 0.3 }[presenceOf(chat, c).status] || 1);
  let who = pool.find(c => nameCalled(text, c.name));
  if (!who) { if (Math.random() * 100 >= (+mo('chimeChance') || 0)) return; who = weighted(pool, c => (c.talk || 0.5) * mood(c)); }
  cur.chimeRun = (cur.chimeRun || 0) + 1; a.chime = (a.chime || 0) + 1; S.save('chats', chat, true);
  clearTimeout(chimeTimer);
  chimeTimer = setTimeout(() => { if (cur.chat === chat && !cur.busy && !ui.input?.value.trim() && route.page === 'chat') generate('normal', { speaker: who, chime: true, live: { kind: 'chime', from: tail.name || '' } }); }, Math.min(9000, 1600 + text.split('\n').filter(l => l.trim()).length * 900 + Math.random() * 1500));
}

// ════════ 장면: 메시지에서 만남으로 ════════
async function openScene(info = {}, auto = false) {
  const chat = cur.chat; if (!chat || chat.scene?.on) return;
  const title = (info.title || '').trim() || '만남';
  chat.scene = { on: true, title, place: info.place || '', at: cur.msgs.length }; chat.scenes = (chat.scenes || 0) + 1;
  cur.msgs.push(newMsg('system', `Scene begins: ${title}${info.place ? ' — ' + info.place : ''}${info.time ? ' (' + info.time + ')' : ''}`, { curtain: { kind: 'open', title, place: info.place || '', time: info.time || '' } }));
  await save(); drawMain();
  if (auto && S.settings.modes.sceneStart !== false) generate('normal');
}
async function closeScene(summary = '', auto = false) {
  const chat = cur.chat; if (!chat?.scene?.on) return;
  if (!auto && !summary) { const v = await promptBox('이 장면을 한 줄로 남길까요? (비워도 됩니다)', '', { placeholder: '예: 역 앞에서 만나 우산을 같이 썼다' }); if (v === null) return; summary = v.trim(); }
  chat.scene = { ...chat.scene, on: false };
  cur.msgs.push(newMsg('system', `Scene ends${summary ? ': ' + summary : ''}. Back to texting.`, { curtain: { kind: 'close', summary } }));
  await save(); emit('scene:close', { chat }); drawMain(); armAuto();
}

// ════════ 생성 ════════
function pickSpeaker(chars) {
  const awake = chars.filter(c => !(cur.chat.muted || []).includes(c.id)); if (awake.length) chars = awake;
  if (chars.length === 1) return chars[0];
  const lastAi = [...cur.msgs].reverse().find(m => m.role === 'assistant');
  const lastText = msgText(cur.msgs[cur.msgs.length - 1] || { swipes: [{ text: '' }], sw: 0 });
  if (cur.chat.groupOrder === 'list') { const i = chars.findIndex(c => c.id === lastAi?.charId); return chars[(i + 1) % chars.length]; }
  const lastSpeaker = cur.msgs[cur.msgs.length - 1]?.charId;
  const named = chars.filter(c => c.id !== lastSpeaker && lastText.includes(c.name));
  if (named.length) return named[0];
  const pool = chars.filter(c => c.id !== lastAi?.charId); const list = pool.length ? pool : chars;
  const total = list.reduce((n, c) => n + (c.talk || 0.5), 0); let r = Math.random() * total;
  for (const c of list) { r -= (c.talk || 0.5); if (r <= 0) return c; }
  return list[0];
}

export async function generate(type = 'normal', opt = {}) {
  if (cur.busy || cur.prep || !cur.chat) return;
  const chat = cur.chat, msgs = cur.msgs, chars = charsOf(chat);
  if (!chars.length) return toast('이 대화의 캐릭터가 삭제되었어요', 'err');
  const conn = (opt.proactive && S.get('conns', S.settings.modes.autoConn)) || S.connFor(chat);
  if (!conn) { if (opt.proactive) return; toast('먼저 API 연결을 추가해 주세요', 'err'); return go('conns'); }
  const last = msgs[msgs.length - 1];
  if ((type === 'regen' || type === 'continue') && last?.role !== 'assistant') type = 'normal';
  let speaker = opt.speaker || (type === 'normal' || type === 'impersonate' ? pickSpeaker(chars) : (S.get('chars', last.charId) || chars[0]));
  const preset = S.presetFor(chat), persona = S.persona(chat);
  const inScene = modeOf(chat) === 'talk' && !!chat.scene?.on, talkNow = modeOf(chat) === 'talk' && !inScene;
  if (!opt.chime) { cur.chimeRun = opt.proactive ? 0 : cur.chimeRun || 0; clearTimeout(chimeTimer); }
  // 오프라인인 캐릭터는 답하지 않는다. 그룹이면 깨어 있는 다른 캐릭터가 받고, 아무도 없으면 깨어난 뒤에 답한다
  if (talkNow && mo('presenceDelay') && type === 'normal' && !opt.proactive && !opt.chime && presenceOf(chat, speaker).status === 'offline') {
    const up = opt.speaker ? [] : awakeChars(chat).filter(c => presenceOf(chat, c).status !== 'offline');
    if (up.length) speaker = pickSpeaker(up);
    else {
      const p = presenceOf(chat, speaker), wake = wakeMsOf(chat, speaker), owe = mo('offlineWake') !== false && last?.role === 'user';
      if (owe) { chat.owed ||= { at: now(), charId: speaker.id }; await S.save('chats', chat, true); }
      toast(`${speaker.name}은(는) 지금 오프라인이에요${p.activity ? ` (${p.activity})` : ''}. ${owe && isFinite(wake) ? `${Live.clock(now() + wake)} 쯤 답장이 올 거예요.` : '답장이 오지 않아요.'}`);
      drawTop(); armAuto(); return;
    }
  }
  const pres = talkNow ? presenceOf(chat, speaker) : null, trackOn = !!S.settings.tracker.enabled;
  // 상태창: 다시 생성할 때는 그 답변이 나오기 전의 상태로 되감고 시작한다
  if (trackOn && type !== 'impersonate') { Live.arm(chat); if (type === 'regen' && Live.rewind(chat, msgs, msgs.length - 1)) drawHud(); }
  if (X.before.length) {   // 답변 전 준비: 그동안 다른 생성이 끼어들지 못하게 하고, 방이 바뀌었으면 그만둔다
    cur.prep = true; setStatus('기억 찾는 중…');
    try { for (const b of X.before) { try { await b.fn({ chat, msgs, type, chars, persona }); } catch (e) { console.warn('[생성 전 준비]', b.owner, e); } } } finally { cur.prep = false; setStatus(''); }
    if (cur.chat !== chat || cur.msgs !== msgs || cur.busy) return;
  }
  let built;
  chat.loreState ||= {}; chat.vars ||= {};
  const pchat = inScene ? Object.assign(Object.create(chat), { mode: 'rp', sceneLive: true }) : chat, keepPresence = chat.presence;
  Live.pending = opt.live || null;
  if (pres) chat.presence = { status: pres.status, activity: pres.activity };   // 엔진이 읽는 자리에 지금의 실제 상태(일정 포함)를 잠깐 올려 둔다
  try { built = buildPrompt({ chat: pchat, char: speaker, chars, persona, preset, msgs, type, commit: true, proactive: !!opt.proactive }); } catch (e) { console.error(e); return toast('프롬프트 조립 실패: ' + e.message, 'err'); }
  finally { Live.pending = null; if (pres) { if (keepPresence === undefined) delete chat.presence; else chat.presence = keepPresence; } }
  emit('prompt:ready', { messages: built.messages, chat, type, speaker });
  cur.lastPrompt = built; drawGauge();

  let target = null, sw = null, base = '';
  const stick = nearBottom();
  if (type === 'normal') { target = newMsg('assistant', '', { charId: speaker.id, name: speaker.name, ...(inScene ? { scene: true } : {}) }); msgs.push(target); const prev = msgs[msgs.length - 2]; if (prev) redraw(prev); ui.msgs.append(msgEl(target, msgs.length - 1)); }
  else if (type === 'regen') { target = last; target.swipes.push({ text: '', ts: now() }); target.sw = target.swipes.length - 1; redraw(target); }
  else if (type === 'continue') { target = last; base = target.swipes[target.sw].text; }
  if (target) { sw = target.swipes[target.sw]; delete sw.tr; sw.showTr = false; }
  const tail = built.messages[built.messages.length - 1];
  if (target && type !== 'continue' && tail?.prefill && prefillOk(conn)) base = tail.content;
  if (stick) toBottom();

  let acc = '', raf = 0, apiThink = false;
  const paint = () => {
    raf = 0;
    const el = target && ui.msgs?.querySelector(`[data-id="${target.id}"]`); if (!el) return;
    const keep = nearBottom();
    const bodyEl = el.querySelector('.msg-body'); if (!bodyEl) return;   // 고치는 중인 메시지는 건드리지 않는다
    bodyEl.innerHTML = (built.talk && S.settings.modes.stagger !== false && type !== 'continue' ? '' : bodyHtml(target)) || '<span class="typing"><i></i><i></i><i></i></span>';
    if (sw.reasoning) { let d = el.querySelector('.reason'); if (!d) { d = h('details.reason', h('summary', icon('sparkle', 14), '생각 과정'), h('div')); el.querySelector('.msg-body').before(d); } d.lastChild.textContent = sw.reasoning; }
    if (keep && S.settings.autoScroll) toBottom();
  };
  const schedule = () => { if (!raf) raf = requestAnimationFrame(paint); };
  cur.abort = new AbortController(); setBusy(true); cur.gen = { chat, msgs }; try { paint(); } catch (e) { console.warn(e); } emit('generate:start', { chat, type });
  if (built.talk && pres && mo('presenceDelay') && type === 'normal' && !opt.proactive && !opt.chime) {
    // 상태에 따라 답장이 늦게 온다. 내가 이름을 불렀으면 서둘러 본다
    const lastUser = [...msgs].reverse().find(m => m.role === 'user'), named = !!lastUser && nameCalled(msgText(lastUser), speaker.name);
    const wait = replyDelay(pres.status, { online: mo('delayOnline'), idle: mo('delayIdle'), dnd: mo('delayDnd') }, { named, namedPct: mo('delayNamed') });
    if (wait) await new Promise(r => { const t = setTimeout(r, wait); cur.abort.signal.addEventListener('abort', () => { clearTimeout(t); r(); }, { once: true }); });
  }
  const t0 = now(); const impersonateBase = ui.input?.value || '';
  try {
    const talk = modeOf(chat) === 'talk' && !inScene && type !== 'impersonate';   // 대화 모드는 짧게 주고받는다
    const res = await streamChat(conn, { ...preset.params, ...(talk ? { maxTokens: Math.min(preset.params.maxTokens || 4096, (opt.proactive && +S.settings.modes.autoTokens) || S.settings.modes.talkTokens || 400) } : {}), stop: [...(preset.params.stop || []), ...(S.settings.format?.stopStrings || [])], names: { char: speaker.name, user: persona.name, others: chars.filter(c => c.id !== speaker.id).map(c => c.name) } }, built.messages, {
      signal: cur.abort.signal,
      onText: d => { acc += d; if (target) { const sp = splitThink(base + acc); sw.text = sp.text; if (sp.think && !apiThink) sw.reasoning = sp.think; schedule(); } else if (ui.input) { ui.input.value = impersonateBase + acc; ui.input.dispatchEvent(new Event('input')); } },
      onThink: d => { if (target) { apiThink = true; sw.reasoning = (sw.reasoning || '') + d; schedule(); } },
    });
    if (target && !res.text.trim() && !sw.reasoning) toast('빈 응답이 돌아왔어요. 프리셋이나 모델 설정을 확인해 보세요.', 'err');
  } catch (e) {
    if (e.name !== 'AbortError') { console.error(e); toast(e.message || String(e), 'err'); }
  } finally {
    if (raf) cancelAnimationFrame(raf);
    setBusy(false); cur.abort = null;
    const alive = S.get('chats', chat.id) === chat;   // 답변이 나오는 동안 지워진 방은 되살리지 않는다
    if (!alive) { if (cur.gen?.msgs === msgs) cur.gen = null; }
    else if (target) {
      const plan = Illust.extract(splitThink(base + acc).text);
      const lv = Live.extract(plan.text); plan.text = lv.text;
      const talked = built.talk ? parseTalk(plan.text) : null;
      const final = postFormat(applyRegex(talked ? talked.text : plan.text, { who: 'ai', target: 'store', charId: target.charId, ctx: built.ctx }));
      if (final && plan.scenes.length && S.settings.illust.auto) for (const sc of plan.scenes) drawScene(target, sc);
      if (!final && !sw.reasoning) {
        if (type === 'normal') { const i = msgs.indexOf(target); if (i >= 0) msgs.splice(i, 1); }
        else if (type === 'regen') { target.swipes.pop(); target.sw = Math.max(0, target.swipes.length - 1); if (cur.chat === chat) rewindState(); else Live.rewind(chat, msgs); }
        drawMsgs();
      } else {
        sw.text = final || sw.text; sw.model = conn.model; sw.ms = now() - t0; if (type !== 'continue') sw.ts = now(); if (opt.stamp && type === 'normal') { sw.ts = target.ts = opt.stamp; }
        if (cur.chat === chat) redraw(target);
      }
      if (talked?.cmds.length && final) { await runTalkCommands(chat, msgs, target, talked.cmds); if (cur.chat === chat) drawTop(); }
      if (final) {
        if (trackOn) { if (lv.patch) Live.apply(chat, lv.patch, { names: chars.map(c => c.name), mx: t => macro(t, built.ctx) }); Live.stamp(chat, target); if (cur.chat === chat) drawHud(); }   // 바뀐 항목만 합치고, 이 답변에 그 시점의 상태를 찍어 둔다
        if (opt.live?.kind) { target.why = opt.live.kind; if (cur.chat === chat) redraw(target); }   // 왜 온 연락인지 이름 옆에 작게
        if (chat.owed && !opt.chime) delete chat.owed;
        for (const o of lv.later) if (S.settings.modes.later !== false && (chat.later ||= []).length < (S.settings.modes.laterMax || 3)) chat.later.push(newLater(o));
        if (document.hidden || cur.chat !== chat) { chat.unread = (chat.unread || 0) + 1; Live.ping(speaker.name, final); } else chat.seenAt = now();
      }
      if (final) emit('message:received', { msg: target, chat });   // 저장 전에 알린다 (이야기 시각 등 메시지에 적히는 것이 함께 저장되게)
      await S.saveMsgs(chat, msgs);
      if (cur.gen?.msgs === msgs) cur.gen = null;
      if (final && cur.chat === chat) {
        if (lv.sceneEnd && chat.scene?.on) await closeScene(lv.sceneEnd.summary || '', true);
        else if (lv.scene && modeOf(chat) === 'talk' && !chat.scene?.on && S.settings.modes.scenes !== false) setTimeout(() => { if (cur.chat === chat && !cur.busy) openScene(lv.scene, true); }, talked ? 1400 : 0);
      }
      if (talked && final && cur.chat === chat && S.settings.modes.stagger !== false && type !== 'continue') revealLines(target);
      if (cur.chat === chat) { drawSide(); drawDossier(); if (cur.drawer) drawDrawer(); if (final) afterReply(chat, msgs); }
    } else if (ui.input) { ui.input.value = (impersonateBase + acc).trim(); ui.input.dispatchEvent(new Event('input')); ui.input.focus(); }
    if (cur.gen?.msgs === msgs) cur.gen = null;
    emit('generate:end', { chat, type });
  }
}

async function afterReply(chat, msgs) {
  const st = S.settings; armAuto();
  const tail = msgs[msgs.length - 1];
  if (st.illust.auto && tail?.role === 'assistant' && !tail.swipes[tail.sw].illust?.length && (st.illust.mode === 'call') && msgs.filter(m => m.role === 'assistant').length % Math.max(1, st.illust.every || 1) === 0) Illust.analyze(chat, msgs, tail, null, { manual: false }).then(sc => sc.slice(0, st.illust.maxScenes || 1).forEach(x => drawScene(tail, x, { chat, msgs }))).catch(e => toast('삽화 계획 실패: ' + e.message, 'err'));
  if (st.memory.enabled && st.memory.auto && tail?.role === 'assistant') { setStatus('기억 정리 중…'); try { await Memory.commit(chat, msgs, tail); if (cur.drawer && cur.chat === chat) drawDrawer(); } catch (e) { toast('기억 기록 실패: ' + e.message, 'err'); } finally { setStatus(''); } }
  if (st.translate.auto && tail?.role === 'assistant' && !tail.swipes[tail.sw].tr) await translate(tail, { chat, msgs });
  if (st.tracker.enabled && st.tracker.mode !== 'inline') await track(chat, msgs);
  maybeChime(chat, msgs);
}

/** 예전 자동 요약 글을 장기기억의 기억 한 장으로 옮긴다 */
async function moveOldSummary(chat) {
  const text = String(chat.summary || '').trim(); if (!text) return;
  await Memory.add(chat.id, { summary: text, kind: 'event', importance: 0.8, entities: charsOf(chat).map(c => c.name) });
  chat.summary = ''; chat.summaryAt = 0; await S.save('chats', chat, true); toast('옛 요약을 장기기억으로 옮겼어요', 'ok'); if (cur.drawer && cur.chat === chat) drawDrawer();
}

async function track(chat, msgs) {
  const chars = charsOf(chat), persona = S.persona(chat);
  const ctx = makeCtx({ chat, char: chars[0], chars, persona, msgs }), mx = t => macro(t, ctx);
  const call = Live.trackCall(chat, chars, mx); if (!call.any) return;
  setStatus('상태 갱신 중…');
  try {
    const recent = msgs.filter(m => !m.hidden).slice(-6).map(m => `${m.role === 'user' ? ctx.user : (m.name || 'Narrator')}: ${msgText(m)}`).join('\n\n');
    const out = await quickCall(call.system, `[Previous state]\n${JSON.stringify(call.prev)}\n\n[Latest messages]\n${recent}`, { maxTokens: 900, conn: S.connFor(chat) });
    const patch = Live.readCall(out), tail = [...msgs].reverse().find(m => m.role === 'assistant');
    if (!patch) return console.warn('tracker: 답을 읽지 못했어요', out);
    Live.arm(chat); Live.apply(chat, patch, { names: chars.map(c => c.name), mx });   // 바뀐 항목만 돌아온다 — 나머지는 그대로
    if (tail) Live.stamp(chat, tail);
    await S.saveMsgs(chat, msgs); if (cur.chat === chat) { drawHud(); drawDossier(); if (cur.drawer) drawDrawer(); }
  } catch (e) { console.warn('tracker', e); } finally { setStatus(''); }
}

// ════════ 장면 패널 ════════
function drawDrawer() {
  if (!cur.chat || !ui.drawer) return;
  const c = cur.chat, chars = charsOf(c);
  const saveChat = debounce(() => S.save('chats', c, true), 300);
  const sec = (title, ic, open, ...kids) => h('details.dsec', { open }, h('summary', icon(ic, 16), title), h('div.dsec-body', kids));
  const sel = (label, value, opts, onchange) => h('label.field', h('span.field-label', label), h('select.inp', { onchange: e => onchange(e.target.value) }, opts.map(([v, l]) => h('option', { value: v, selected: v === value }, l))));

  const scene = sec('연결과 화자', 'plug', true,
    sel('API 연결', S.settings.activeConn, S.conns.length ? S.conns.map(x => [x.id, `${x.name}${x.model ? ' · ' + x.model : ''}`]) : [['', '연결 없음']], v => { S.set({ activeConn: v }); drawTop(); }),
    sel('프리셋', S.settings.activePreset, S.presets.map(x => [x.id, x.name]), v => { S.set({ activePreset: v }); drawGauge(); }),
    sel('이 대화의 페르소나', S.persona(c)?.id || '', S.personas.map(x => [x.id, x.name]), v => { c.personaId = v; saveChat(); drawMsgs(); }));

  const group = sec('등장인물', 'users', chars.length > 1,
    h('div.members', chars.map(ch => h(`div.member${(c.muted || []).includes(ch.id) ? '.muted' : ''}`, avatar(ch, 'xs'), h('span', ch.name), chars.length > 1 && iconBtn((c.muted || []).includes(ch.id) ? 'eyeoff' : 'eye', '잠시 쉬게 하기 / 다시 부르기', () => { const mu = new Set(c.muted || []); mu.has(ch.id) ? mu.delete(ch.id) : mu.add(ch.id); c.muted = [...mu]; saveChat(); drawDrawer(); }), chars.length > 1 && iconBtn('x', '대화에서 빼기', async () => { c.charIds = c.charIds.filter(i => i !== ch.id); await S.save('chats', c, true); drawMain(); drawDrawer(); drawSide(); })))),
    h('div.row', btn('캐릭터 초대', { ic: 'plus', cls: 'ghost', onclick: e => menu(e.currentTarget, S.chars.filter(x => !c.charIds.includes(x.id)).map(x => ({ label: x.name, onclick: async () => { c.charIds.push(x.id); await S.save('chats', c, true); drawMain(); drawDrawer(); drawSide(); } }))) })),
    chars.length > 1 && sel('발화 순서', c.groupOrder, [['natural', '자연스럽게 (이름이 불리면 응답)'], ['list', '목록 순서대로']], v => { c.groupOrder = v; saveChat(); }));

  // 상태: 캐릭터마다 지금 상태(일정 또는 직접 고른 것)와 일정 편집
  const presRow = ch => {
    const p = presenceOf(c, ch), over = p.from === 'override', has = !!scheduleOf(ch);
    return h('div.pres-row',
      h('div.pres-who', h(`i.presence.${p.status}`), h('b', ch.name), h('small', [STATUS[p.status], p.activity, over ? (p.until ? `${Live.clock(p.until)} 까지` : '직접 정함') : has ? '일정대로' : ''].filter(Boolean).join(' · '))),
      h('div.pres-set',
        h('select.inp', { title: '상태를 직접 정하기', onchange: e => { const v = e.target.value; if (v) Live.setPresence(c, ch, { status: v, activity: over ? p.activity : '', hold: true }); else Live.clearPresence(c, ch); saveChat(); drawTop(); drawDrawer(); armAuto(); } },
          [['', has ? '일정대로' : '온라인 (기본)'], ...Object.entries(STATUS)].map(([v, l]) => h('option', { value: v, selected: over ? v === p.status : v === '' }, l))),
        iconBtn('moon', `${ch.name}의 주간 일정`, () => Schedule.edit(ch))),
      over ? h('input.inp', { value: p.activity || '', placeholder: '무엇을 하는 중인지 (예: 수업 중)', oninput: e => { const o = c.presenceBy?.[ch.id] || c.presence; if (o) o.activity = e.target.value; saveChat(); } }) : null);
  };
  const presence = modeOf(c) === 'talk' ? sec('상태', 'heart', false, chars.map(presRow), h('small.hint', '일정이 있으면 지금 시각의 칸이 상태가 됩니다. 캐릭터가 답장에서 스스로 바꾸면 그 칸이 끝날 때까지만 앞섭니다.'), btn('먼저 오는 연락 · 일정 · 상태 설정', { ic: 'sliders', cls: 'ghost', onclick: () => Live.settings('auto', c) })) : null;
  const note = sec('작가 노트', 'note', !!c.note?.text,
    h('textarea.inp', { rows: 4, value: c.note?.text || '', placeholder: '지금 장면에만 적용할 지시나 분위기를 적어 두세요.', oninput: e => { c.note = { depth: 4, role: 'system', ...(c.note || {}), text: e.target.value }; saveChat(); } }),
    h('label.field.inline', h('span.field-label', '삽입 깊이'), h('input.inp', { type: 'number', min: 0, value: c.note?.depth ?? 4, oninput: e => { c.note = { text: '', role: 'system', ...(c.note || {}), depth: +e.target.value || 0 }; saveChat(); } })));

  const mem = c.summary ? sec('옛 요약', 'sparkle', false,
    h('textarea.inp', { rows: 5, value: c.summary, oninput: e => { c.summary = e.target.value; saveChat(); } }),
    h('small.hint', '예전 자동 요약 방식으로 남아 있던 글이에요. 이제 줄거리는 장기기억이 맡습니다. 장기기억으로 옮기거나 지우면 이 칸은 사라져요.'),
    h('div.row', btn('장기기억으로 옮기기', { ic: 'sparkle', cls: 'ghost', onclick: () => moveOldSummary(c) }), btn('지우기', { cls: 'ghost', onclick: () => { c.summary = ''; c.summaryAt = 0; saveChat(); drawDrawer(); } }))) : null;

  const trk = Object.entries(c.tracker || {}).filter(([k]) => !c.trackHide?.['w:' + k]), people = Object.keys(c.cast || {});
  const tracker = sec('상태 트래커', 'heart', S.settings.tracker.enabled,
    S.settings.tracker.enabled
      ? [trk.length ? h('div.tracker.read', trk.map(([k, v]) => h('div.trk', h('span', k, c.trackLock?.['w:' + k] ? icon('lock', 11) : null), h('b', v || '—')))) : h('p.dim', '다음 답변부터 자동으로 채워져요.'),
      people.length ? h('small.hint', `인물 카드 ${people.length}장 · ${people.join(', ')}`) : null,
      h('div.row.wrap', btn('고치기 · 잠금 · 숨김', { ic: 'edit', cls: 'ghost', onclick: () => Live.editState(c, hudOpts()) }), btn('지금 갱신', { ic: 'refresh', cls: 'ghost', title: '모델 호출 1회', onclick: () => track(c, cur.msgs) }), btn('설정 · 지시문', { ic: 'sliders', cls: 'ghost', onclick: () => Live.settings('tracker', c) }))]
      : [h('p.dim', '꺼져 있어요. 켜면 시간·장소·기분 같은 상태가 대화 위에 뜹니다.'), btn('상태창 켜기 · 설정', { ic: 'sliders', cls: 'ghost', onclick: () => Live.settings('tracker', c) })]);

  const globals = new Set(S.settings.activeLore), charBooks = new Set(chars.flatMap(x => x.loreIds || []));
  const hits = cur.lastPrompt?.lore || [];
  const lore = sec('로어북', 'book', false,
    loreLinker(c, saveChat, { fixed: () => S.lore.filter(b => globals.has(b.id) || charBooks.has(b.id)).map(b => [b, globals.has(b.id) ? '전역' : '캐릭터']) }),
    hits.length ? h('div.hits', h('small.hint', `마지막 생성에서 발동한 항목 ${hits.length}개`), hits.map(e => h('span.chip.static', e.name || e.keys?.[0] || e.book))) : null);

  const varsTa = h('textarea.inp', { rows: 3, placeholder: '호감도=50', value: Object.entries(c.vars || {}).map(([k, v]) => `${k}=${v}`).join('\n'), oninput: e => { c.vars = Object.fromEntries(e.target.value.split('\n').map(l => l.split('=')).filter(p => p[0].trim()).map(p => [p[0].trim(), p.slice(1).join('=')])); saveChat(); } });
  const vars = sec('변수', 'code', false, varsTa, h('small.hint', '한 줄에 하나씩 "이름=값" 으로 적습니다 (쉼표로 나누지 않아요). 값 안에는 쉼표나 = 가 들어가도 됩니다. 프롬프트에서는 {{getvar::이름}} 으로 불러오고, 대화 중에는 /setvar 이름 값 으로 바꿉니다.'));

  const bg = sec('배경', 'image', false, h('div.row', btn('이미지 선택', { ic: 'upload', cls: 'ghost', onclick: async () => { const [f] = await pickFiles({ accept: 'image/*' }); if (!f) return; c.bg = await shrinkImage(await readDataURL(f), 1920, 'image/jpeg', 0.85); await S.save('chats', c, true); drawMain(); } }), c.bg && btn('지우기', { cls: 'ghost', onclick: async () => { c.bg = ''; await S.save('chats', c, true); drawMain(); } })));

  const extPanels = X.panels.map(p => { try { return sec(p.title, p.icon || 'sparkle', !!p.open, p.render(c, cur.msgs)); } catch (e) { console.warn('[확장 패널]', p.owner, e); return null; } }).filter(Boolean);
  ui.drawer.replaceChildren(h('header.drawer-head', h('b', '장면 패널'), iconBtn('x', '닫기', () => { cur.drawer = false; ui.layout.classList.remove('with-drawer'); })), h('div.drawer-body', scene, presence, group, note, mem, tracker, lore, vars, bg, ...extPanels, btn('프롬프트 살펴보기', { ic: 'search', cls: 'ghost wide', onclick: inspector })));
}

function inspector() {
  const chat = cur.chat; if (!chat) return;
  const chars = charsOf(chat);
  let built;
  const talkNow = modeOf(chat) === 'talk' && !chat.scene?.on, keep = chat.presence, pres = talkNow ? presenceOf(chat, chars[0]) : null;
  if (pres) chat.presence = { status: pres.status, activity: pres.activity };
  const inScene = modeOf(chat) === 'talk' && !!chat.scene?.on, pchat = inScene ? Object.assign(Object.create(chat), { mode: 'rp', sceneLive: true }) : chat;
  try { built = buildPrompt({ chat: pchat, char: chars[0], chars, persona: S.persona(chat), preset: S.presetFor(chat), msgs: cur.msgs, type: 'normal' }); } catch (e) { return toast(e.message, 'err'); }
  finally { if (pres) { if (keep === undefined) delete chat.presence; else chat.presence = keep; } }
  cur.lastPrompt = built; drawGauge();
  const max = S.presetFor(chat).params.contextSize || 128000;
  modal({
    title: '전송될 프롬프트', wide: true,
    body: h('div.inspect',
      h('div.inspect-sum', h('b', `≈${built.total.toLocaleString()} 토큰`), h('span', ` / ${max.toLocaleString()} · 메시지 ${built.messages.length}개 · 로어북 ${built.lore.length}개 발동`), built.dropped ? h('em.badge', `오래된 기록 ${built.dropped}개 제외`) : null),
      (() => {   // 채팅 기록은 이어진 것끼리 한 묶음으로 접어 둔다 (길어져도 한눈에 보이게)
        const row = (m, label) => h('details.inspect-row', h('summary', h(`span.role.${m.role}`, m.role), h('span.src', label || m.src), h('small', `≈${tokens(m.content).toLocaleString()}`)), h('pre', m.content));
        const out = []; let run = [];
        const flush = () => { if (!run.length) return; const list = run; run = []; if (list.length === 1) return out.push(row(list[0], '채팅 기록'));
          const first = built.messages.filter(m => m.src === 'history').indexOf(list[0]);
          out.push(h('details.inspect-row.inspect-group', h('summary', h('span.role.history', 'HISTORY'), h('span.src', `채팅 기록 ${list.length}개`), h('small', `≈${list.reduce((n, m) => n + tokens(m.content), 0).toLocaleString()}`)), h('div.inspect-list', list.map((m, i) => row(m, `#${first + i + 1} · ${m.content.replace(/\s+/g, ' ').slice(0, 60)}`))))); };
        for (const m of built.messages) { if (m.src === 'history') run.push(m); else { flush(); out.push(row(m)); } }
        flush(); return out;
      })()),
  });
}

function findInChat() {
  const inp = h('input.inp', { placeholder: '찾을 말' }); const list = h('div.find-list');
  let m;
  const run = () => {
    const q = inp.value.trim().toLowerCase(); if (!q) return list.replaceChildren();
    const hits = cur.msgs.map((x, i) => ({ x, i, t: msgText(x) })).filter(o => o.t.toLowerCase().includes(q)).slice(-80).reverse();
    list.replaceChildren(...(hits.length ? hits.map(o => { const at = o.t.toLowerCase().indexOf(q); return h('button.find-item', { onclick: () => { m.close(); cur.shown = Math.max(cur.shown, cur.msgs.length - o.i + 4); drawMsgs(); setTimeout(() => chatApi.scrollTo(o.x.id), 60); } }, h('b', `${String(o.i + 1).padStart(3, '0')} · ${o.x.role === 'user' ? S.persona(cur.chat).name : (o.x.name || '나레이션')}`), h('span', (at > 30 ? '…' : '') + o.t.slice(Math.max(0, at - 30), at + 90).replace(/\s+/g, ' '))); }) : [h('p.dim', '찾는 말이 없어요.')]));
  };
  inp.addEventListener('input', run);
  m = modal({ title: '이 대화에서 찾기', body: h('div.col', inp, list) });
}

/** 확장 기능에 열어 주는 채팅 조작 */
export const chatApi = {
  /** 접혀 있는 앞부분까지 펼쳐 그 메시지로 간다 */
  reveal(id) { const i = cur.msgs.findIndex(m => m.id === id); if (i < 0) return false; const need = cur.msgs.length - i + 4; if (need > cur.shown) { cur.shown = need; drawMsgs(); } const el = ui.msgs?.querySelector(`[data-id="${id}"]`); if (!el) return false; el.scrollIntoView({ block: 'center' }); el.classList.add('flash'); setTimeout(() => el.classList.remove('flash'), 1600); return true; },
  roomName: c => roomName(c), groupTitle: c => titleOf(c),
  current: () => ({ chat: cur.chat, msgs: cur.msgs, busy: cur.busy }),
  generate: (type = 'normal') => generate(type),
  send: text => { if (ui.input) { ui.input.value = text; return send(); } },
  insert: text => { if (ui.input) { ui.input.value += text; ui.input.dispatchEvent(new Event('input')); ui.input.focus(); } },
  addSystemMessage: text => command('/sys ' + text),
  save: () => cur.chat && save(),
  redraw: () => { if (cur.chat && ui.msgs) { drawMsgs(); if (cur.drawer) drawDrawer(); } },
  setStatus: t => setStatus(t),
  scrollTo: id => ui.msgs?.querySelector(`[data-id="${id}"]`)?.scrollIntoView({ block: 'center', behavior: 'smooth' }),
  openDrawer: () => { cur.drawer = true; ui.layout?.classList.add('with-drawer'); drawDrawer(); },
};

// 방향키로 마지막 답변 넘기기 · Esc 로 생성 중단
document.addEventListener('keydown', e => {
  if (route.page !== 'chat' || !cur.chat) return;
  if (e.key === 'Escape' && cur.busy && !document.querySelector('.modal-wrap')) cur.abort?.abort();
  if ((e.key === 'ArrowLeft' || e.key === 'ArrowRight') && document.activeElement === document.body) {
    const last = cur.msgs[cur.msgs.length - 1];
    if (last?.role === 'assistant') swipe(last, e.key === 'ArrowLeft' ? -1 : 1);
  }
});
on('settings', p => { if (route.page === 'chat' && cur.chat && ('bubbles' in p || 'showMeta' in p || 'avatarShape' in p)) drawMsgs(); });
