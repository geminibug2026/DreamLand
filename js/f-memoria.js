// ── Dreamland 장기기억 화면: 서고(개요 · 기억 · 세계 · 이야기 · 설정 · 도구).
//    엔진은 memory.js, 기억 · 세계 · 이야기 탭은 memoria-views.js, 설정 탭은 memoria-settings.js.
//    여기는 서고 조립 · 개요 · 도구 · 서고 목록 · 장면 패널 · 메시지 표시(연속성 검사 ⚠ · 막간) · 명령어 · 매크로를 맡는다 ──
import { S, DB, h, on, uid, download, pickFiles, debounce, msgText, fmtTime } from './core.js';
import { icon, btn, iconBtn, toast, modal, confirmBox, promptBox, form, avatar, route, go } from './ui.js';
import { X } from './hooks.js';
import { tokens } from './engine.js';
import { Memory, KINDS, LOCKS, VIS, SHELF_LABELS, fmtDays, visibleProse } from './memory.js';
import { chatApi } from './chat.js';
import { vMemories as vMem2, vWorld as vWorld2, vStory } from './memoria-views.js';
import { vConfig, ensureCfg } from './memoria-settings.js';

document.head.append(h('link', { rel: 'stylesheet', href: new URL('../css/f-memoria.css', import.meta.url).href }));

// ════════ 작은 도구 ════════
const IC = {
  lock: 'M6 11h12v9H6zM8 11V8a4 4 0 0 1 8 0v3', unlock: 'M6 11h12v9H6zM8 11V8a4 4 0 0 1 7.5-2', pin: 'M9 4h6l-1 6 3 3H7l3-3zM12 13v7',
  globe: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM3 12h18M12 3c3 3 3 15 0 18M12 3c-3 3-3 15 0 18', clock: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 7v5l3 2',
  place: 'M12 21s7-6 7-11a7 7 0 0 0-14 0c0 5 7 11 7 11zM12 12a2 2 0 1 0 0-4 2 2 0 0 0 0 4z', cal: 'M4 6h16v14H4zM4 10h16M8 3v4M16 3v4',
  link: 'M10 14a4 4 0 0 0 6 0l3-3a4 4 0 0 0-6-6l-1 1M14 10a4 4 0 0 0-6 0l-3 3a4 4 0 0 0 6 6l1-1', merge: 'M6 4v16M6 12c6 0 6-6 12-6M15 3l3 3-3 3', mark: 'M7 3h10v18l-5-4-5 4z',
  glass: 'M7 3h10M7 21h10M8 3c0 5 8 5 8 9s-8 4-8 9M16 3c0 5-8 5-8 9s8 4 8 9', mask: 'M3 8c3-2 6-2 9 0 3-2 6-2 9 0 0 6-3 9-6 9-1.5 0-2-1-3-1s-1.5 1-3 1c-3 0-6-3-6-9z', bell: 'M6 16v-5a6 6 0 0 1 12 0v5l2 2H4zM10 21h4',
  warn: 'M12 3l10 18H2zM12 10v5M12 18v.5', shuffle: 'M3 7h4l10 10h4M3 17h4l3-3M14 10l3-3h4M18 4l3 3-3 3M18 14l3 3-3 3', layers: 'M12 3l9 5-9 5-9-5zM3 13l9 5 9-5M3 17l9 5 9-5', snow: 'M12 2v20M3.5 7l17 10M20.5 7l-17 10M9 4l3 3 3-3M9 20l3-3 3 3',
};
const ico = (name, size = 16) => { if (!IC[name]) return icon(name, size); const s = icon('x', size); s.innerHTML = `<path d="${IC[name]}" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/>`; return s; };
const ib = (name, title, onclick, cls = '') => { const b = iconBtn('x', title, onclick, ('tiny ' + cls).trim()); b.replaceChildren(ico(name, 15)); return b; };
const safe = v => String(v ?? '').replace(/[^\w-]/g, '') || 'x';
const pct = v => `${Math.round((v || 0) * 100)}%`;
const cur = () => chatApi.current();
const isCur = chat => cur().chat?.id === chat?.id;
/** 볼 대화방 고르기: 캐릭터별로 묶고, 방마다 분량·날짜를 붙여 구분한다. 지금 열어 둔 방이 기본 */
function roomPick(chats, st) {
  const hereId = cur()?.chat?.id || S.settings.lastChat, day = t => new Date(t || 0).toLocaleDateString('ko-KR', { month: 'numeric', day: 'numeric' });
  const groups = new Map(); for (const c of chats) { const g = chatApi.groupTitle(c); if (!groups.has(g)) groups.set(g, []); groups.get(g).push(c); }
  const label = c => `${c.id === hereId ? '● 지금 대화방 · ' : ''}${chatApi.roomName(c).slice(0, 28)} · ${c.count || 0}개 · ${day(c.updatedAt)}${c.parent ? ' · 분기' : ''}`;
  const sel = h('select.inp.auto.mm-pick', { title: '어느 대화방의 서고를 볼지 고릅니다', onchange: e => st.load(e.target.value) }, [...groups.entries()].map(([g, list]) => h('optgroup', { label: `${g} (${list.length})` }, list.map(c => h('option', { value: c.id, selected: c.id === st.chat?.id }, label(c))))));
  const away = hereId && st.chat?.id !== hereId && S.get('chats', hereId);
  return h('div.mm-pickbox', h('small', st.chat?.id === hereId ? '지금 대화방' : '다른 대화방'), sel, away ? h('button.btn.ghost.mm-here', { title: '지금 열어 둔 대화방의 서고로', onclick: () => st.load(hereId) }, '지금 방으로') : null);
}
const chatTitle = chat => chat?.name || (chat?.charIds || []).map(id => S.get('chars', id)?.name).filter(Boolean).join(', ') || '대화';
const msgsOf = async chat => isCur(chat) ? cur().msgs : await S.msgs(chat.id);
const persistMsgs = async (chat, msgs) => { if (isCur(chat)) { await chatApi.save(); chatApi.redraw(); } else await S.saveMsgs(chat, msgs); };
const histOf = msgs => { const c = Memory.cfg(), vis = msgs.filter(m => !m.hidden); return (c.trim ? vis.slice(-(c.keepRecent || 20)) : vis.slice(-30)).map(m => ({ role: m.role, content: msgText(m) })); };
/** 설정에 아직 없는 키를 기본값으로 채운다 (memoria-settings.js 의 것을 그대로 쓴다) */
const ensure = ensureCfg;
const saveCfg = () => S.set({ memory: { ...S.settings.memory } });
const sec = (title, desc, tools, ...body) => h('section.mm-sec', h('header.mm-sec-head', h('div', h('h3', title), desc && h('p', desc)), tools && h('div.mm-sec-tools', tools)), body);
const none = text => h('div.mm-empty', h('i.mm-star', '✦'), h('span', text));
const chip = (text, cls = '') => h(`span.mm-chip${cls ? '.' + cls : ''}`, text);
const kindBadge = k => h(`em.mm-kind.k-${safe(k)}`, KINDS[k] || String(k || ''));
const meter = (v, max, cls = '') => h(`div.mm-meter${cls ? '.' + cls : ''}`, { title: `${Math.round(v)} / ${Math.round(max)}` }, h('i', { style: { width: Math.min(100, max ? v / max * 100 : 0) + '%' } }));
const turnTag = (mem, x) => x.manual || x.turn == null ? '수동' : `t${x.turn + 1}`;
const copyText = t => navigator.clipboard?.writeText(t).then(() => toast('복사했어요'), () => toast('복사하지 못했어요', 'err'));
const busyBtn = async (b, fn) => { if (b.disabled) return; b.disabled = true; b.classList.add('mm-busy'); try { return await fn(); } catch (e) { if (e.name !== 'AbortError') { console.error(e); toast(e.message || String(e), 'err'); } } finally { b.disabled = false; b.classList.remove('mm-busy'); } };
/** 폼으로 고쳐서 돌려받는 대화상자 (취소하면 null) */
function editBox(title, obj, defs, { wide = false, okLabel = '저장' } = {}) {
  return new Promise(res => { let done = false; const draft = JSON.parse(JSON.stringify(obj, (k, v) => k === 'av' ? undefined : v));
    modal({ title, wide, body: form(draft, defs), onClose: () => { if (!done) res(null); }, actions: [{ label: '취소' }, { label: okLabel, cls: 'primary', onclick: () => { done = true; res(draft); } }] }); });
}
/** 무엇이 달라지는지 항목으로 알려 주고 확인받는다 */
const confirmList = (title, lines, okLabel = '확인', danger = false) => new Promise(res => { let ok = false; modal({ title, body: h('ul.mm-points', lines.map(l => h('li', l))), onClose: () => res(ok), actions: [{ label: '취소' }, { label: okLabel, cls: danger ? 'danger' : 'primary', onclick: () => { ok = true; } }] }); });
function progressBox(title) {
  const ac = new AbortController(), text = h('p', '준비 중…'), bar = h('i'); let stopped = false, fin = false;
  const box = modal({ title, body: h('div.col', text, h('div.mm-meter.big', bar)), onClose: () => { if (!fin) { stopped = true; ac.abort(); } }, actions: [{ label: '멈추기' }] });
  return { signal: ac.signal, stopped: () => stopped, set(done, total, label = '') { text.textContent = `${label} ${done} / ${total}`.trim(); bar.style.width = (total ? done / total * 100 : 0) + '%'; }, say(t) { text.textContent = t; }, close() { fin = true; box.close(); } };
}
/** 바뀔 내용을 먼저 보여 주고 확인받는다 */
const SHELF_KO = { ...SHELF_LABELS, canon: '캐논', pledges: '서약' };
function review(changes, title, note = '확인한 변경만 적용합니다. 적용 직전의 서고는 복구 지점에 보관합니다.') {
  return new Promise(res => { let ok = false; const n = t => changes.filter(c => c.type === t).length, L = { added: '추가', changed: '변경', removed: '삭제' };
    modal({ title, wide: true, onClose: () => res(ok), actions: [{ label: '취소' }, { label: '변경 적용', cls: 'primary', onclick: () => { ok = true; } }],
      body: h('div.mm-review', h('p.hint', note), h('div.mm-chips', chip(`추가 ${n('added')}`, 'add'), chip(`변경 ${n('changed')}`, 'chg'), chip(`삭제 ${n('removed')}`, 'del')),
        h('div.mm-review-list', changes.map(c => h(`article.mm-diff.${c.type}`, h('header', h('b', SHELF_KO[c.shelf] || c.shelf), h('em.badge', L[c.type])), c.before && h('div.mm-before', c.before), c.after && h('div.mm-after', c.after), c.type === 'changed' && c.impBefore !== c.impAfter && h('small', `중요도 ${pct(c.impBefore)} → ${pct(c.impAfter)}`))),
          !changes.length && h('p.dim', '목록 내용의 차이가 없습니다. 서고의 설정과 기록 시점은 교체될 수 있습니다.'))) }); });
}

// ════════ 작업 ════════
/** 「기록」 — 마지막 답변 턴을 지금 바로 기록한다 */
async function recordNow(chat) {
  ensure(); const msgs = await msgsOf(chat), last = [...msgs].reverse().find(m => m.role === 'assistant' && !m.hidden && !m.greeting);
  if (!last) return toast('기록할 답변이 없습니다.');
  toast('마지막 턴을 기록합니다…'); if (isCur(chat)) chatApi.setStatus('기억 정리 중…');
  try { const mem = await Memory.commit(chat, msgs, last, { force: true }); const t = mem.turns.find(x => x.msgId === last.id); toast(t?.failed ? '기록하지 못했습니다: ' + (t.error || '') : '마지막 턴을 기록했습니다.', t?.failed ? 'err' : 'ok'); }
  catch (e) { toast('기록 실패: ' + e.message, 'err'); } finally { if (isCur(chat)) { chatApi.setStatus(''); chatApi.redraw(); } }
}
/** 「색인」 — 아직 기록되지 않은 턴과 기록에 실패한 턴을 순서대로 기록한다. 끝나면(10턴 이상) 서사 시계를 한 번 재계산한다 */
async function backfill(chat, { from = 0, to = Infinity, includeHidden = false } = {}) {
  if (!ensure().enabled) return toast('장기기억이 꺼져 있습니다.');
  const msgs = await msgsOf(chat), mem = await Memory.load(chat.id); Memory.reconcile(mem, msgs);
  const todo = Memory.pending(mem, msgs, { includeHidden, from, to });
  if (!todo.length) { const skipped = includeHidden ? 0 : Memory.pending(mem, msgs, { includeHidden: true, from, to }).length; return toast(skipped ? `색인할 새 메시지가 없습니다. 숨겨진 메시지 ${skipped}개를 건너뛰었습니다 — 「숨겨진 메시지도 포함」을 켜거나, 도구 탭의 「숨김 해제」 뒤에 다시 시도하세요.` : '색인할 새 메시지가 없습니다.'); }
  if (!(await confirmBox(`아직 기록되지 않았거나 기록에 실패한 답변 ${todo.length}개를 순서대로 색인할까요? 답변마다 사서를 한 번씩 부릅니다.`, '색인'))) return;
  const pb = progressBox('과거 대화 색인'); let n = 0, failed = 0;
  try {
    for (const m of todo) { if (pb.stopped()) break; pb.set(n + 1, todo.length, '색인 중…'); await Memory.commit(chat, msgs, m, { signal: pb.signal, force: true }); n++; if (mem.turns.find(t => t.msgId === m.id)?.failed) failed++; }
    toast(`${n}개 턴 색인 ${pb.stopped() ? '중단' : '완료'}${failed ? ` (실패 ${failed}개 — 다시 실행하면 재시도합니다)` : ''}`, failed ? '' : 'ok');
    // 일괄 색인은 턴을 하나씩 떼어 보므로 경과 시간 어림이 쌓여 어긋난다 — 어느 정도 쌓였으면 전체를 이어 읽어 시계를 바로잡는다
    if (!pb.stopped() && n >= 10 && Memory.cfg().storyClock !== false) { pb.say('색인이 끝나 서사 시계를 재계산합니다…'); await Memory.recalClock(chat, mem, { signal: pb.signal }).catch(() => { }); }
  } catch (e) { if (e.name !== 'AbortError') toast('색인 실패: ' + e.message, 'err'); }
  pb.close(); if (isCur(chat)) chatApi.redraw();
}
async function showSource(st, m) {
  const i = st.msgs.findIndex(x => x.id === m.msgId), msg = st.msgs[i], user = msg && [...st.msgs.slice(0, i)].reverse().find(x => x.role === 'user');
  let box;
  box = modal({ title: '기억의 출처', wide: true, body: h('div.col', h('p.mm-src-sum', m.summary),
    msg ? [user && h('div.mm-src', h('b', `#${st.msgs.indexOf(user) + 1} · ${user.name || '나'}`), h('pre', visibleProse(msgText(user)) || msgText(user))), h('div.mm-src', h('b', `#${i + 1} · ${msg.name || '답변'}`), h('pre', visibleProse(msgText(msg)) || msgText(msg)))]
      : h('p.dim', m.manual || (m.tags || []).includes('carried') ? '수동 또는 인계된 기억입니다. 이 대화에서 원문을 확인할 수 없습니다.' : '원문이 편집·삭제되었거나 기록과 일치하지 않습니다. 도구의 「대화와 기록 맞추기」를 실행해 주세요.')),
    actions: [msg && isCur(st.chat) && { label: '대화에서 보기', ic: 'chat', onclick: () => { st.close?.(); if (route.page !== 'chat') go('chat', st.chat.id); setTimeout(() => chatApi.scrollTo(msg.id), 300); } }, { label: '닫기', cls: 'primary' }].filter(Boolean) });
}
const MEM_DEFS = owners => [
  { k: 'summary', label: '기억', type: 'area', rows: 3 }, { k: 'kind', label: '종류', type: 'select', opts: Object.entries(KINDS), third: true }, { k: 'visibility', label: '누가 아는가', type: 'select', opts: Object.entries(VIS), third: true }, { k: 'owner', label: '아는 이 (개인 · 비밀일 때)', third: true, ph: owners.join(', ') },
  { k: 'importance', label: '중요도', type: 'range', min: 0, max: 1, step: 0.05 }, { k: 'quote', label: '인용 (본문 그대로 한 줄)' },
  { k: 'entities', label: '등장인물', type: 'tags', half: true }, { k: 'hints', label: '떠올릴 단서', type: 'tags', half: true }, { k: 'tags', label: '태그', type: 'tags', half: true }, { k: 'trigger', label: '트리거 (정규식 — 입력이 맞으면 반드시 불러옵니다)', half: true, ph: '반지|ring' },
  { k: 'pinned', label: '고정 (토큰 예산 안에서 우선 주입됩니다)', type: 'check' }, { k: 'disabled', label: '쓰지 않기', type: 'check' }];
async function editMemory(st, m) {
  const owners = [...new Set([...st.mem.cast.map(c => c.name), ...st.mem.memories.map(x => x.owner).filter(Boolean)])];
  const d = await editBox(m ? '기억 고치기' : '기억 추가', m || { kind: 'fact', summary: '', quote: '', importance: 0.8, entities: [], tags: ['manual'], hints: [], visibility: 'public', owner: '', trigger: '', pinned: false, disabled: false }, MEM_DEFS(owners), { wide: true });
  if (!d || !d.summary?.trim()) return;
  if (m) { if (d.summary.trim() !== m.summary) d.manual = true; Object.assign(m, d); delete m.av; await Memory.save(st.mem); } else await Memory.add(st.chat.id, d);   // 직접 다듬은 기억은 되감기 · 상한 정리 · 서가 정리에서 보호한다
  st.draw();
}
const castToDraft = c => ({ ...c, aka: c.aka || [], traits: c.traits || [], rel: (c.relationships || []).map(r => `${r.target} = ${r.relation}`) });
async function editCast(st, c) {
  const d = await editBox(c ? '인물 고치기' : '인물 추가', castToDraft(c || { name: '', role: '', age: '', occupation: '', appearance: '', voice: '' }), [
    { k: 'name', label: '이름', half: true }, { k: 'aka', label: '별칭', type: 'tags', half: true }, { k: 'role', label: '역할', third: true }, { k: 'age', label: '나이', third: true }, { k: 'occupation', label: '직업', third: true },
    { k: 'appearance', label: '외형', type: 'area', rows: 2 }, { k: 'voice', label: '말투 (존대 · 말버릇 · 호칭 같은 패턴)', type: 'area', rows: 2 }, { k: 'traits', label: '성격', type: 'tags' },
    { k: 'rel', label: '관계 (한 줄에 하나, 대상 = 관계)', type: 'lines', ph: '아리아 = 소꿉친구' }, { k: 'provisional', label: '아직 이름이 밝혀지지 않은 인물', type: 'check' }], { wide: true });
  if (!d || !d.name?.trim()) return;
  const { rel, ...rest } = d; rest.relationships = (rel || []).map(l => { const [t, ...r] = l.split('='); return { target: t.trim(), relation: r.join('=').trim() }; }).filter(r => r.target && r.relation);
  const wasLocked = c?.locked;
  if (c) { Object.assign(c, rest, { manual: true }); if (Memory.cfg().lockEdited !== false) c.locked = true; } else st.mem.cast.push({ id: uid(), ...rest, manual: true, first: st.mem.turns.length, updated: st.mem.turns.length });
  const folded = Memory.foldAliases(st.mem);   // 별칭을 손봤다면 그 이름으로 갈라져 있던 상태 · 기억도 바로 이 카드로 접는다
  await Memory.save(st.mem); st.draw();
  if (folded.states || folded.memories) toast(`별칭으로 갈라져 있던 기록을 합쳤습니다 — 상태 ${folded.states}건 · 기억 ${folded.memories}건`, 'ok');
  else if (c && c.locked && !wasLocked) toast(`「${c.name}」 프로필을 고정했습니다. 자물쇠 아이콘으로 해제할 수 있습니다.`);
}
const nkey = v => String(v || '').toLowerCase().replace(/[\s._\-'"`]+/g, '');
async function mergeCast(st, keep) {
  const mem = st.mem, others = mem.cast.filter(c => c !== keep);
  const known = new Set(mem.cast.flatMap(c => [c.name, ...(c.aka || [])]).map(nkey)), stray = [...new Set([...mem.status.map(s => s.entity), ...mem.memories.flatMap(m => m.entities || [])])].filter(n => n && nkey(n) !== 'scene' && !known.has(nkey(n))).slice(0, 40);   // 카드는 없는데 상태 보드 · 기억에만 떠도는 표기 (예: 카드는 「깡」 하나인데 상태만 kkang 으로 갈라짐)
  if (!others.length && !stray.length) return toast('병합할 다른 인물 카드나 갈라진 이름이 없습니다.');
  const d = await editBox(`「${keep.name}」 카드로 병합`, { from: others[0] ? 'c:' + others[0].id : 'n:' + stray[0], typed: '' }, [
    { k: 'from', label: '이 카드로 접을 대상', type: 'select', opts: [...others.map(c => ['c:' + c.id, `카드 — ${c.name}`]), ...stray.map(n => ['n:' + n, `갈라진 이름 — ${n}`])] },
    { k: 'typed', label: '또는 이름을 직접 적기 (적으면 위 선택 대신 이 이름을 씁니다)', ph: '예: kkang', hint: '같은 인물이 두 카드로 나뉜 경우 카드를 합칩니다. 카드는 하나인데 상태 보드가 다른 표기로 갈라진 경우(예: kkang) 별칭으로 묶고 상태·기억을 이 카드로 접습니다.' }], { okLabel: '병합' });
  if (!d) return;
  const typed = String(d.typed || '').trim().slice(0, 60), name = typed || (d.from.startsWith('n:') ? d.from.slice(2) : '');
  const src = typed ? others.find(c => nkey(c.name) === nkey(typed) || (c.aka || []).some(a => nkey(a) === nkey(typed))) : mem.cast.find(c => 'c:' + c.id === d.from);
  if (src) { Memory.mergeCast(mem, keep, src); await Memory.save(mem); st.draw(); return toast(`「${src.name}」 카드를 「${keep.name}」(으)로 병합했습니다.`, 'ok'); }
  if (!name) return;
  if (!mem.status.some(s => nkey(s.entity) === nkey(name)) && !mem.memories.some(m => (m.entities || []).some(e => nkey(e) === nkey(name)))) return toast(`「${name}」 — 인물 카드에도, 상태 보드나 기억에도 없는 이름입니다.`, 'err');
  keep.aka = [...new Set([...(keep.aka || []), name])].filter(a => a && nkey(a) !== nkey(keep.name)).slice(0, 8);
  const folded = Memory.foldAliases(mem); await Memory.save(mem); st.draw();
  toast(`「${name}」 → 「${keep.name}」 별칭으로 묶었습니다 (상태 ${folded.states}건 · 기억 ${folded.memories}건 합침)`, 'ok');
}
async function withCheckpoint(st, label, fn) { await Memory.checkpoint(st.mem, label).catch(() => { }); await fn(); await Memory.save(st.mem); st.draw(); }
const del = (st, arr, x, what) => ib('trash', '삭제', async () => { if (!(await confirmBox(`${what}을(를) 삭제할까요?`, '삭제', true))) return; const i = st.mem[arr].indexOf(x); if (i >= 0) st.mem[arr].splice(i, 1); await Memory.save(st.mem); st.draw(); }, 'del');
/** 사서가 제안한 정정 한 건을 사람이 읽는 글로 */
const PLEDGE_ST = { active: '유효', resolved: '해결됨', dormant: '잠듦' };
const opText = o => ({ canon: () => `캐논: ${o.scopeName ? `${o.scopeName}의 ` : ''}${o.key} → "${o.value}"`, status: () => `상태: ${o.entity}.${o.slot} → "${o.value}"${o.claim === 'belief' ? ` (${o.owner || '누군가'}의 믿음)` : ''}`,
  clock: () => `서사 시계: t${o.fromTurn}–t${o.toTurn} 구간을 총 ${fmtDays(+o.totalDays || 0)}(으)로 재조정`, addMemory: () => `기억 추가 (${KINDS[o.kind] || o.kind || KINDS.fact}) → "${o.summary}"`, editMemory: () => `기억 수정 (${o.id}) → "${o.summary}"`, deleteMemory: () => `기억 삭제 (${o.id})`,
  editSummary: () => `요약 수정 (${o.id})`, deleteSummary: () => `요약 삭제 (${o.id})`, addPledge: () => `서약 추가 (${LOCKS[o.kind] || o.kind || LOCKS.keep_unresolved}) → "${o.summary}"`, editPledge: () => `서약 수정 (${o.id})${o.status ? ` → ${PLEDGE_ST[o.status] || o.status}` : ''}${o.summary ? ` "${o.summary}"` : ''}`, deletePledge: () => `서약 삭제 (${o.id})`,
  character: () => `인물 카드: ${o.name} — ${Object.keys(o.patch || {}).join(', ')} 갱신`, bond: () => `관계선: ${o.from} → ${o.to} = "${o.stage}"` }[o.op]?.() || JSON.stringify(o));

// ════════ 개요: 주입 미리보기 · 회상 경로 · 장면 연출 · 서고에 질문 · 사서에게 정정 요청 ════════
const SEC_KO = { Canon: '캐논', Cast: '인물', Bonds: '관계선', 'Notable Items': '물건', 'Turning Points': '전환점', 'Story So Far': '요약', Pledges: '서약', 'Recent Turns': '최근 턴', 'Recalled Moments': '회상', 'Hidden Knowledge': '비공개', 'Source Excerpts': '자료실', 'Scene Now': '현재 장면', 'Status Board': '상태', Direction: '연출' };
function vOverview(st) {
  const cfg = Memory.cfg(), { chat, mem, msgs } = st, hist = histOf(msgs);
  const p = Memory.packet(chat, hist, { preview: true, msgs, force: true }), auto = Memory.packet(chat, hist, { preview: true, fresh: true, msgs, force: true });
  const once = Memory.overridden(chat.id), pin = mem.packetPin?.text, lastReal = Memory.last(chat.id), budget = cfg.tokenBudget;
  const ta = h('textarea.inp.mm-preview', { rows: 12, spellcheck: false, value: st.draft ?? p?.text ?? '', placeholder: '(주입할 내용이 없습니다 — 기억이 쌓이면 자동 생성됩니다)' });
  const tok = h('span.mm-tok'), bar = h('i'), mark = st.draft != null ? '초안 · ' : once ? '수정본 대기 중 — 다음 응답 1회에 주입됩니다 · ' : pin ? '고정됨 · ' : '';
  const upd = () => { const t = tokens(ta.value); tok.textContent = ta.value.trim() ? `${mark}≈ ${t.toLocaleString()} 토큰 / 예산 ${budget.toLocaleString()}` : ''; bar.style.width = Math.min(100, t / budget * 100) + '%'; bar.parentNode?.classList.toggle('over', t > budget); };
  const gauge = h('div.mm-meter.big', bar); ta.addEventListener('input', upd); upd();
  const live = p && !p.fixed && st.draft == null;
  const trim = !live ? '' : p.trim === 0 ? '전체 수록' : p.trim <= 4 ? `일부 축소 (${p.trim}단)` : `⚠ 예산 부족으로 크게 축소 (${p.trim}단) — 예산을 늘리면 회상·요약이 더 실립니다`;
  // 고정 장부: 잘 안 바뀌는 부분은 프롬프트 앞쪽에, 매 턴 바뀌는 부분은 최근 대화 옆에 따로 실린다
  const sp = !live ? null : p.diag?.split || (p.stable && p.live ? { stableTokens: tokens(p.stable), nowTokens: tokens(p.live) } : null);
  const split = sp && h('small', `${cfg.splitInjection ? '고정 장부' : '나눠 싣기'} — 앞쪽(캐논·인물·관계선·요약·서약) ≈ ${(sp.stableTokens || 0).toLocaleString()} 토큰${sp.refreshed ? ' · 다음 답변 때 새로 뜹니다 (그 턴은 캐시가 한 번 새로 잡혀요)' : sp.frozenAtTurn != null ? ` · t${sp.frozenAtTurn} 시점에 뜬 것 그대로` : ''} · 최근 대화 옆(회상·지금 장면·상태${sp.delta ? ` · 그 뒤 달라진 줄 ${sp.delta}` : ''}) ≈ ${(sp.nowTokens || 0).toLocaleString()} 토큰`);
  const unpin = async () => { await Memory.pin(chat.id, null); toast('고정을 해제했습니다. 다시 매 턴 서고에서 장부를 만듭니다.', 'ok'); st.draw(); };
  const banner = st.draft != null ? h('div.mm-banner', ico('sparkle'), h('span', h('b', '사서가 새로 쓴 초안'), '입니다 — 아직 주입되지 않았어요. 고칠 곳이 있으면 고친 뒤 연필(다음 응답 1회) 또는 핀(해제할 때까지 계속)으로 적용하세요. '), h('button.mm-link', { onclick: () => { st.draft = null; st.draw(); } }, '초안 버리기'))
    : once ? h('div.mm-banner', ico('edit'), h('span', h('b', '수정본 대기 중'), ' — 다음 응답 1회에 주입되고 사라집니다. '), h('button.mm-link', { onclick: () => { Memory.override(chat.id, null); st.draw(); } }, '취소'))
      : pin ? h('div.mm-banner', ico('pin'), h('span', h('b', '고정한 장부'), `를 주입하고 있습니다 (t${mem.packetPin.turn || 0} 시점). 그 뒤로 쌓인 기억·상태·요약은 주입에 반영되지 않아요 — 기록은 계속 쌓입니다. `), h('button.mm-link', { onclick: unpin }, '고정 해제')) : null;
  const tools = [
    ib('sparkle', '사서가 기억·세계·요약을 보고 장부를 새로 씁니다 (초안 — 적용 전 확인)', e => busyBtn(e.currentTarget, async () => { toast('사서가 기억·세계·요약을 보고 장부를 새로 쓰는 중…');
      try { st.draft = await Memory.rewritePacket(chat, hist); } catch (err) { if (err.name === 'AbortError') throw err; console.error('[장기기억] 장부 새로 쓰기 실패:', err); return toast(`장부를 새로 쓰지 못했습니다. ${err.message || ''}`, 'err'); }
      st.draw(); const t = tokens(st.draft); toast(`초안을 미리보기에 넣었습니다 (≈ ${t.toLocaleString()} 토큰).${t > budget ? ` 주입 예산(${budget.toLocaleString()})보다 커서 적용하면 예산을 넘습니다.` : ''} 확인 후 연필 또는 핀으로 적용하세요.`, 'ok'); })),
    ib('pin', pin ? '고정 해제 — 자동 장부로 돌아갑니다' : '지금 미리보기 내용을 이 대화에 계속 고정합니다', async () => { if (pin && st.draft == null) return unpin();
      const text = ta.value.trim(); if (!text) return toast('고정할 내용이 비어 있습니다.');
      if (!(await confirmList('지금 미리보기 내용을 이 대화에 계속 고정합니다. 고정할까요?', ['해제할 때까지 매 턴 이 내용이 그대로 주입됩니다.', '그동안 새로 쌓이는 기억·상태·요약은 주입에 반영되지 않습니다 (기록은 계속 쌓입니다).', '핀을 다시 누르면 해제되고 자동 장부로 돌아갑니다.'], '고정'))) return;
      await Memory.pin(chat.id, text); Memory.override(chat.id, null); st.draft = null; toast('장부를 고정했습니다.', 'ok'); st.draw(); }, pin ? 'on' : ''),
    ib('edit', '수정한 내용을 다음 응답 1회에 주입', () => { const text = ta.value.trim(); if (!text) return toast('주입할 내용이 비어 있습니다.'); Memory.override(chat.id, text); st.draft = null; toast('수정본이 다음 응답 1회에 주입됩니다. (계속 쓰려면 핀으로 고정)', 'ok'); st.draw(); }),
    ib('copy', '주입 내용 전체 복사', () => ta.value.trim() ? navigator.clipboard?.writeText(ta.value).then(() => toast('주입 내용을 복사했습니다.', 'ok'), () => { ta.select(); document.execCommand('copy'); toast('주입 내용을 복사했습니다.', 'ok'); }) : toast('복사할 주입 내용이 없습니다.'))];
  // 장부 구성 비중
  const d = auto?.diag, total = d ? d.sections.reduce((n, s) => n + s.tokens, 0) || 1 : 1;
  const shares = d && h('div.mm-shares', { 'aria-label': '장부 구성 비중 (토큰 수 기준)' }, h('div.mm-sharebar', d.sections.map((s, i) => h(`i.s${i % 6}`, { style: { width: s.tokens / total * 100 + '%' }, title: `${SEC_KO[s.name] || s.name} ${s.tokens.toLocaleString()} 토큰` }))),
    h('div.mm-chips', d.sections.map((s, i) => h('span.mm-chip', h(`i.mm-dot.s${i % 6}`), `${SEC_KO[s.name] || s.name} ${Math.round(s.tokens / total * 100)}%`, h('small', `${s.tokens.toLocaleString()}`)))));
  // 회상 경로
  const bars = r => r.parts && h('div.mm-score', { title: `유사도 ${r.parts.cos.toFixed(2)} · 어휘 ${r.parts.lex.toFixed(2)} · 중요도 ${r.parts.imp.toFixed(2)} · 최근성 ${r.parts.rec.toFixed(2)} · 가산 ${r.parts.bonus.toFixed(2)}` },
    h('div.mm-scorebar', h('i.p-cos', { style: { width: 62 * r.parts.cos + '%' } }), h('i.p-lex', { style: { width: 18 * Math.min(1, r.parts.lex) + '%' } }), h('i.p-imp', { style: { width: 12 * r.parts.imp + '%' } }), h('i.p-rec', { style: { width: 8 * r.parts.rec + '%' } }), h('i.p-bonus', { style: { width: 100 * r.parts.bonus + '%' } })), h('b', (r.score || 0).toFixed(2)));
  const rows = d?.rows || [], diag = !d ? h('p.hint', p?.text ? '직접 수정하거나 고정한 장부입니다. 자동 회상 경로는 적용되지 않습니다.' : '주입을 갱신하면 회상 경로가 표시됩니다.') : h('div.col',
    d.fallback && h('p.mm-warn', '예산이 최소 장부보다 작습니다. 담을 수 있는 서약만 보냈으며 일부 제약도 빠질 수 있습니다. 주입 예산을 늘려 주세요.'),
    d.narrator && h('p.hint', '소설·풀사칭 · 여러 인물의 기억을 서술자가 참고합니다. 각 인물이 모르는 비밀까지 공유하지 않도록 지시합니다.'),
    h('p.hint', `실제 주입 ${rows.filter(r => r.included).length}개 · 중복/예산 제외 ${rows.filter(r => !r.included).length}개 · 시점 밖 비공개 ${d.hidden}개`), shares,
    rows.length ? h('div.mm-legend', h('span', h('i.p-cos'), '유사도'), h('span', h('i.p-lex'), '어휘'), h('span', h('i.p-imp'), '중요도'), h('span', h('i.p-rec'), '최근성'), h('span', h('i.p-bonus'), '인물 · 단서 가산')) : null,
    rows.map(r => { const m = mem.memories.find(x => x.id === r.id), via = r.via && mem.memories.find(x => x.id === r.via);
      return h(`div.mm-recall${r.included ? '' : '.off'}`, h(`em.mm-flag${r.included ? '.on' : ''}`, r.included ? '주입' : '제외'),
        h('div.mm-recall-main', h('div', kindBadge(r.kind), ' ', r.summary), h('small', `${m ? turnTag(mem, m) : ''} · ${r.reason || '관련 기억'}${r.excluded ? ` → ${r.excluded}` : ''}`), via && h('small', `연결된 기억: ${via.summary}`), bars(r)),
        m && ib('book', '출처', () => showSource(st, m))); }));
  // 장면 연출 (설정에서 켰을 때)
  const dir = mem.direction, plan = dir?.plan, lastAi = [...msgs].reverse().find(m => m.role === 'assistant' && !m.hidden);
  const direction = cfg.supervisor ? sec('장면 연출', '답변이 끝날 때마다 연출이 다음 장면의 목표·피해야 할 전개를 짧게 계획해 둡니다. 프롬프트를 조립하는 순간에는 기다릴 수 없어서, 방금 끝난 장면을 보고 세운 계획이 다음 답변에 함께 주입됩니다 (다시 생성할 때는 주입되지 않습니다).',
    btn('다시 세우기', { ic: 'refresh', cls: 'ghost', title: '지금 장면을 보고 연출 계획을 다시 세웁니다', onclick: e => busyBtn(e.currentTarget, async () => { await Memory.direct(chat, msgs); st.draw(); }) }),
    plan ? h('div.mm-plan', dir.afterId !== lastAi?.id && h('p.hint', '이 계획은 이전 장면 기준이라 다음 답변에는 주입되지 않습니다.'),
      (plan.remember || []).length ? h('div', h('b', '기억할 것'), h('ul', plan.remember.map(x => h('li', String(x))))) : null, plan.scene_goal && h('div', h('b', '목표'), h('p', String(plan.scene_goal))),
      (plan.ideas || []).length ? h('div', h('b', '제안'), h('ul', plan.ideas.map(x => h('li', String(x))))) : null, (plan.avoid || []).length ? h('div', h('b', '피할 것'), h('ul', plan.avoid.map(x => h('li', String(x))))) : null,
      plan.tension && h('div', h('b', '긴장'), h(`em.mm-tension.t-${safe(plan.tension)}`, { low: '낮음', medium: '보통', high: '높음' }[plan.tension] || String(plan.tension)))) : none('아직 세운 계획이 없습니다.')) : null;
  // 서고에 질문
  const q = h('input.inp', { placeholder: '이 이야기에 대해 물어보기…', value: st.question || '', oninput: e => { st.question = e.target.value; } }), ans = h('div.mm-answer', st.answer || '');
  const ask = b => busyBtn(b, async () => { const text = q.value.trim(); if (!text) return toast('질문을 입력하세요.'); ans.hidden = false; ans.textContent = '서고를 뒤지는 중…'; try { st.answer = await Memory.ask(chat, text); } catch (e) { if (e.name === 'AbortError') throw e; st.answer = `답변 실패: ${e.message}`; } ans.textContent = st.answer; });
  const askBtn = btn('질문', { ic: 'search', cls: 'primary', onclick: e => ask(e.currentTarget) }); q.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); ask(askBtn); } }); ans.hidden = !st.answer;
  // 사서에게 정정 요청 (편집 대화)
  const apply = async l => {
    const draft = Memory.snapshot(mem); Memory.applyOps(draft, l.ops); const ch = Memory.diff(mem, draft);
    if (!(await review(ch, '사서의 정정 제안'))) return;
    await withCheckpoint(st, '사서 정정 전', async () => { const skipped = [], n = Memory.applyOps(mem, l.ops, skipped); l.applied = true; l.done = n; l.skipped = skipped;
      if (n) toast(`서고에 ${n}건 반영했습니다.`, 'ok'); if (skipped.length) toast(`${skipped.length}건은 반영하지 못했습니다.`, 'err'); });
  };
  const log = h('div.mm-log', st.log.map(l => h(`div.mm-say.${l.role}`, h('small.mm-who', l.role === 'user' ? '나' : '사서'), h('span', l.text), l.ops?.length ? h('div.mm-ops', h('ul', l.ops.map(o => h('li', opText(o)))),
    !l.applied && !l.cancelled && h('div.row.wrap', btn('적용', { ic: 'check', cls: 'primary', title: '바뀔 내용을 먼저 비교해 보고 서고에 반영합니다', onclick: () => apply(l) }), btn('취소', { cls: 'ghost', onclick: () => { l.cancelled = true; st.draw(); } })),
    l.applied && h('em.badge.on', `✔ ${l.done ?? 0}건 반영됨`), l.cancelled && h('em.badge', '취소함'), (l.skipped || []).map(x => h('small.err', '⚠ ' + x))) : null)));
  const eq = h('input.inp', { placeholder: '고치고 싶은 걸 말해보세요…' });
  const send = b => busyBtn(b, async () => { const text = eq.value.trim(); if (!text) return toast('요청을 입력하세요.'); if (st.sending) return; st.sending = true; st.log.push({ role: 'user', text }); const wait = { role: 'ai', text: '서고를 확인하는 중…' }; st.log.push(wait); eq.value = ''; st.draw();
    try { const r = await Memory.propose(chat, text, st.log.slice(0, -2)); Object.assign(wait, { text: r.reply || (r.ops?.length ? '이렇게 고칠게요.' : '고칠 곳을 찾지 못했습니다.'), ops: r.ops || [] }); } catch (e) { wait.text = `처리 실패 — ${e.message}`; } finally { st.sending = false; } st.draw(); });
  const sendBtn = btn('보내기', { ic: 'send', onclick: e => send(e.currentTarget) }); eq.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); send(sendBtn); } });
  queueMicrotask(() => { log.scrollTop = log.scrollHeight; });
  return h('div.mm-view', stats(st),
    sec('주입 미리보기', '다음 응답 생성 시 프롬프트에 들어갈 장기기억입니다. 직접 고친 뒤 연필을 누르면 다음 응답 1회에, 핀을 누르면 해제할 때까지 계속 주입됩니다. 반짝이는 사서가 기억·세계·요약을 보고 장부를 새로 써서 초안으로 보여줍니다.', tools, banner, h('div.mm-budget', tok, gauge, trim && h('small', trim), split), ta,
      lastReal && h('small.hint', `직전 응답에는 ≈ ${lastReal.tokens.toLocaleString()} 토큰이 주입됐습니다${lastReal.fixed ? (lastReal.fixed === 'pin' ? ' (고정한 장부)' : ' (수정본)') : ` · 회상 ${lastReal.picked.length}개`}.`),
      h('details.mm-details', { open: st.openDiag, ontoggle: e => { st.openDiag = e.target.open; } }, h('summary', '회상 경로 · 무엇이 주입됐나요?'), diag)),
    direction,
    sec('서고에 질문', h('span', '저장된 기억만 근거로 답합니다. "우리 처음 만난 게 언제였지?" 같은 걸 물어보세요. (', h('code', '/memoria-ask'), '로도 가능)'), null, h('div.row', q, askBtn), ans,
      h('details.mm-details', { open: st.openEdit || st.log.length > 0, ontoggle: e => { st.openEdit = e.target.open; } }, h('summary', '사서에게 정정 요청 — 날짜·기록·요약·인물 설정을 대화로 고치기'),
        h('p.hint', '읽기 전용 질문이 아니라 ', h('b', '실제 기록을 고치는'), ' 대화입니다. 예: "지금 11월인데 3월로 바꿔줘", "그 요약 틀렸어, ○○가 아니라 △△였어", "서사 시계 2주가 아니라 3주야", "인물 설정 추가해줘". 사서가 바꿀 내용을 먼저 보여주면, 확인 버튼을 눌러야 실제로 반영됩니다.'),
        st.log.length ? log : null, h('div.row', eq, sendBtn),
        h('div.row', btn('초기화', { cls: 'ghost', ic: 'trash', title: '대화 초기화', onclick: () => { st.log = []; st.draw(); toast('편집 대화를 초기화했습니다.'); } })))),
    h('p.mm-note', h('b', '작동 방식'), ' — 답변이 끝날 때마다 그 턴을 자동으로 기록해 구조화된 기억으로 보관하고, 매 턴 현재 대화와 관련 있는 기억만 골라 토큰 예산 안에서 주입합니다.', h('br'),
      h('b', '스와이프·편집·삭제·재생성'), ' — 해당 턴(또는 지워진 마지막 턴)의 파생 기억은 자동으로 무효화되고, 새 답변이 오면 다시 기록됩니다.'));
}
/** 숫자 띠 + 지금 장면 (개요 맨 위) */
function stats(st) {
  const m = st.mem, sc = Memory.scene(m), failed = m.turns.filter(t => t.failed).length;
  const tile = (n, l, cls = '') => h(`div${cls ? '.' + cls : ''}`, h('b', String(n)), h('span', l));
  return h('div.mm-top', h('div.mm-stats', tile(m.turns.length, '턴'), tile(m.memories.length, '기억'), tile(m.cast.length, '인물'), tile(m.pledges.filter(p => p.status === 'active').length, '서약'), tile(m.chunks.length + m.arcs.length, '요약'), tile(m.clockDays >= 1 / 24 ? fmtDays(m.clockDays) : '–', '서사 시계'), failed ? tile(failed, '기록 실패', 'bad') : null),
    sceneLine(m, sc));
}
/** 지금 장면 한 줄 — 장소 · 날짜 · 시간 · 자리에 있는 사람들 · 분위기 */
const sceneLine = (m, sc = Memory.scene(m)) => sc.any ? h('div.mm-scene', sc.location && h('span', { title: '장소' }, ico('place'), sc.location), sc.date && h('span', { title: '날짜' }, ico('cal'), sc.date), sc.time && h('span', { title: '시간' }, ico('clock'), sc.time),
  sc.present && h('span', { title: '지금 장면에 있는 사람들' }, ico('users'), sc.present), sc.mood && h('span', { title: '장면의 분위기' }, ico('moon'), sc.mood)) : null;

// ════════ 기억 · 세계 · 이야기 탭(memoria-views.js)과 함께 쓰는 것 ════════
const VIS_IC = { public: 'globe', private: 'lock', secret: 'mask' };
const recordText = t => h('div.mm-record', String(t || '').split('\n').filter(l => l.trim()).map(l => { const m = l.match(/^\s*(PLOT|SHIFTS|OPEN)\s*[:：]\s*(.*)$/i); if (m) return h('p.mm-rec-h', h(`em.r-${m[1].toLowerCase()}`, m[1].toUpperCase()), m[2]); return /^\s*[-•·]\s+/.test(l) ? h('p.mm-rec-b', l.replace(/^\s*[-•·]\s+/, '')) : h('p', l); }));

// ════════ 설정 ════════
// 설정 탭(설정 찾기 · 설정 세트 · 모든 설정 묶음 · 프롬프트 · 말버릇 찾기 · 막간 분류)은 memoria-settings.js 에 있다

// ════════ 도구: 사서 일지 · 색인 · 맞추기 · 서사 시계 · 서고 정리 · 복구 지점 · 인계 · 스토리 바이블 · 백업 ════════
const ACT_IC = { check: 'check', side: 'shuffle', recall: 'search', record: 'feather', summary: 'book', defer: 'glass', ledger: 'snow', update: 'edit', bundle: 'layers', error: 'warn' };
/** 사서 일지 — 저절로 일어난 일(회상 · 기록 · 요약 · 미룸 · 오류). 최신이 위, 60줄까지 */
function activityRows() {
  const rows = Memory.activity?.() || Memory.activityLog?.list?.() || [], clock = at => new Date(at).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  return rows.length ? rows.slice(0, 60).map(r => h(`div.mm-row.mm-act.a-${safe(r.kind)}`, ico(ACT_IC[r.kind] || 'note', 14), h('span.mm-row-text', r.text, r.count > 1 ? h('small', ` ×${r.count}`) : null), h('small.mm-act-at', clock(r.at))))
    : [none('아직 기록이 없습니다. 회상·기록·요약처럼 저절로 일어난 일이 여기에 남습니다.')];
}
function vTools(st) {
  const { chat, mem, msgs } = st, cfg = Memory.cfg(), cpList = h('div.mm-rows'), act = st.actList = h('div.mm-rows.mm-actlist', activityRows());
  const from = h('input.inp', { type: 'number', min: 1, step: 1, placeholder: '시작 #' }), to = h('input.inp', { type: 'number', min: 1, step: 1, placeholder: '끝 #' }), hid = h('input', { type: 'checkbox' });
  const pending = Memory.pending(mem, msgs).length, prog = h('span.mm-progress'), cprog = h('span.mm-progress'), hiddenN = msgs.filter(m => m.hidden).length;
  const file = name => `${name}-${chatTitle(chat).replace(/[\\/:*?"<>|]/g, '_').slice(0, 40)}`;
  const drawCps = async () => { const pts = await Memory.checkpoints(chat.id); cpList.replaceChildren(...pts.map(p => h('div.mm-row', h('div.mm-row-text', h('b', p.label), h('small', ` ${new Date(p.at).toLocaleString('ko-KR')} · t${p.turn} · ${Math.ceil(p.bytes / 1024)} KB`)), btn('검토·복구', { cls: 'ghost', ic: 'refresh', onclick: async () => {
    if (Memory.busy()) return toast('기록이 끝난 뒤 복구해 주세요.', 'err');
    const data = await Memory.checkpointData(chat.id, p.id), turns = mem.turns.length; if (!data) return;
    if (!(await review(Memory.diff(mem, data), `${p.label} 복구`, '서고를 이 시점으로 되돌립니다. 이후 기록도 교체됩니다. 대화 원문은 변경하지 않으며, 현재 대화와 맞지 않는 기록은 동기화 과정에서 제외됩니다.'))) return;
    if (Memory.busy() || (Memory.get(chat.id) || mem) !== mem || mem.turns.length !== turns) return toast('검토 중 대화나 기록이 바뀌었습니다. 다시 검토해 주세요.', 'err');
    await Memory.checkpoint(mem, '복구 실행 전'); st.mem = await Memory.replace(chat.id, data); Memory.reconcile(st.mem, msgs); await Memory.save(st.mem); Memory.override(chat.id, null); st.draft = null; toast('서고를 복구했습니다. 복구 직전의 상태도 복구 지점에 남겼습니다.', 'ok'); st.draw(); } }))),
    !pts.length && h('p.hint', '아직 복구 지점이 없습니다. 정리·정정·복원 전 자동으로 만들어집니다.')); };
  drawCps();
  const readFile = async (choose = false) => { const [f] = await pickFiles({ accept: '.json,application/json' }); if (!f) return null; try { let data = JSON.parse(await f.text());
    if (data?.type === 'dreamland-memoria-library' && Array.isArray(data.items)) { let it = data.items.length === 1 ? data.items[0] : choose ? null : data.items.find(x => x.chatId === chat.id);
      if (!it && choose && data.items.length) { const d = await editBox('인계할 대화 고르기', { i: '0' }, [{ k: 'i', label: '이 묶음 백업에 든 대화', type: 'select', opts: data.items.map((x, i) => [String(i), x.chatName || x.chatId || `대화 ${i + 1}`]) }], { okLabel: '고르기' }); if (!d) return null; it = data.items[+d.i]; }
      if (!it) throw new Error(`여러 대화를 묶은 백업 파일인데 이 대화의 기록이 들어 있지 않습니다 (${data.items.length}개 대화: ${data.items.slice(0, 4).map(x => x.chatName || x.chatId).join(', ')}${data.items.length > 4 ? ' …' : ''})`); data = it; }   // 서고 목록에서 한 번에 받은 묶음 백업
    return Memory.readExport(data); } catch (e) { console.error('[장기기억] 가져오기 실패:', e); toast('가져오기 실패: ' + e.message, 'err'); return null; } };
  return h('div.mm-view',
    sec('사서 일지', '회상에 몇 초 걸렸는지, 무엇을 기록·요약했는지, 무엇을 미뤘는지, 오류가 났는지. 저절로 일어난 일은 알림 대신 여기에 남습니다. 답변이 늦다 싶으면 여기부터 보세요.',
      btn('비우기', { ic: 'trash', cls: 'ghost', onclick: () => { Memory.clearActivity ? Memory.clearActivity() : Memory.activityLog?.clear?.(); act.replaceChildren(...activityRows()); } }), act),
    sec('과거 대화 색인', '아직 기록되지 않은 턴과 기록에 실패한 턴을 순서대로 기록합니다. 범위를 비우면 전체를 색인합니다.', null,
      h('label.check.mm-inline', { title: '다른 기능이나 직접 숨겨 둔 메시지도 색인 대상에 포함합니다.' }, hid, h('i'), h('span', '숨겨진 메시지도 포함')),
      h('div.row.wrap', h('div.mm-range', from, h('span', '~'), to), btn('색인', { ic: 'play', cls: 'primary', title: '색인 시작', onclick: async () => { await backfill(chat, { from: +from.value || 0, to: +to.value || Infinity, includeHidden: hid.checked }); st.reload(); } }), h('span.mm-progress', pending ? `색인할 답변 ${pending}개` : '색인할 새 메시지가 없습니다'))),
    sec('대화와 기록 맞추기', h('span', '저장된 턴 기록을 현재 대화 메시지와 다시 대조합니다. 메시지를 지우거나 고친 뒤 기록이 꼬였을 때 쓰세요. ', h('b', '이미 지워진 기록은 복구하지 않습니다'), ' — 복구가 필요하면 위 색인으로 해당 구간을 다시 기록하세요.'), null,
      h('div.row', btn('맞추기', { ic: 'link', cls: 'ghost', title: '대화 메시지와 턴 기록을 다시 맞춥니다 (/memoria-reconcile)', onclick: async () => { const n = mem.turns.length, ch = Memory.reconcile(mem, msgs); if (ch) await Memory.save(mem); toast(ch ? `대화와 기록을 맞췄습니다. (기록 턴 ${n} → ${mem.turns.length})` : '이미 대화와 기록이 일치합니다.', ch ? 'ok' : ''); st.draw(); } }))),
    sec('서사 시계 재계산', `기록된 턴 다이제스트를 처음부터 이어 읽으며 이야기 속 경과 시간을 다시 추정합니다. 일괄 색인 뒤 날짜가 꼬였을 때 재색인 없이 바로잡을 수 있습니다. (일괄 색인이 끝나면 자동으로 한 번 실행됩니다) 지금 총 경과 ${(mem.clockDays || 0) >= 1 ? fmtDays(mem.clockDays) : '1일 미만'}.`, null,
      h('div.row', btn('재계산', { ic: 'refresh', cls: 'ghost', title: '지금 재계산', onclick: e => busyBtn(e.currentTarget, async () => { const fmt = d => d >= 1 ? fmtDays(d) : '1일 미만';
        if (Memory.busy()) prog.textContent = '턴 기록이 끝나길 기다리는 중…';
        const r = await Memory.recalClock(chat, mem, { onProgress: (d, t) => { prog.textContent = `재계산 중… ${d}/${t}턴`; } }); if (!r) { prog.textContent = ''; return toast('재계산할 턴 기록이 없습니다.'); }
        toast(`서사 시계 재계산 완료 — 이야기 총 경과 ${fmt(r.after)} (${fmt(r.before)} → ${fmt(r.after)}${r.failed ? ` · 배치 ${r.failed}개 실패` : ''})`, 'ok'); st.draw(); }) }), prog)),
    sec('서고 정리', '중복 병합·소음 제거·중요도 변경을 먼저 비교하고 적용합니다. 고정·수동 기억과 서로 다른 비밀 등급·소유자는 병합하지 않습니다. 자동 정리는 검토 없이 실행되며, 변경 전 복구 지점을 남깁니다.', null,
      h('div.row.wrap', btn('검토', { ic: 'sparkle', cls: 'ghost', title: '정리안을 만들어 비교한 뒤 적용합니다', onclick: e => busyBtn(e.currentTarget, async () => {
        if (Memory.busy()) return toast('진행 중인 작업이 끝난 뒤 정리해 주세요.');
        cprog.textContent = '정리안을 만드는 중…';
        try { const draft = Memory.snapshot(mem), turns0 = mem.turns.length; await Memory.consolidate(chat, draft); const ch = Memory.diff(mem, draft), c = t => ch.filter(x => x.type === t).length;
          if (!ch.length) return toast('정리할 것이 없습니다. (정리할 만큼 기억이 쌓이지 않았거나 — 최소 12개 — 사서가 고칠 곳을 찾지 못했습니다)');
          if (!(await review(ch, '서고 정리안'))) return toast('변경을 적용하지 않았습니다.');
          if (Memory.busy() || (Memory.get(chat.id) || mem) !== mem || mem.turns.length !== turns0) return toast('검토하는 동안 서고가 바뀌었습니다. 다시 검토해 주세요.', 'err');
          await Memory.checkpoint(mem, '서고 정리 전'); draft.consolidatedAt = draft.turns.length; st.mem = await Memory.replace(chat.id, draft); toast(`서고 정리 완료 — 병합·정리 ${c('removed')} · 변경 ${c('changed')}`, 'ok'); st.draw(); }
        catch (err) { if (err.name === 'AbortError') throw err; console.error('[장기기억] 서고 정리 실패:', err); toast(`서고 정리에 실패했습니다. ${err.message || ''}`, 'err'); } finally { cprog.textContent = ''; } }) }),
        btn('다시 묶기', { ic: 'merge', cls: 'ghost', title: '요약 묶음을 같은 사건끼리 다시 묶어 연대기로 병합합니다 (자동 서고 정리 때 하는 일)', onclick: e => busyBtn(e.currentTarget, async () => { await Memory.checkpoint(mem, '연대기 병합 전'); const n = await Memory.regroup(chat, mem); await Memory.save(mem); toast(n == null ? '묶을 만한 요약이 없습니다.' : `${n}개 그룹을 연대기로 병합했습니다.`, n ? 'ok' : ''); st.draw(); }) }), cprog)),
    sec('서고 복구 지점', '기억 정리·사서 정정·요약 전체 다시 만들기·파일 복원·인계·초기화 직전의 기록을 보관합니다. 최근 3개, 합계 6MB까지 유지하며 대화 원문은 변경하지 않습니다. 오래 보관할 기록은 JSON으로 내보내세요.',
      btn('보관', { ic: 'mark', cls: 'ghost', title: '지금 상태 보관', onclick: async () => { if (Memory.busy()) return toast('기록이 끝난 뒤 저장해 주세요.', 'err'); const p = await Memory.checkpoint(mem, '직접 저장한 서고'); toast(p ? '복구 지점을 저장했습니다.' : '서고가 복구 지점 한도를 넘습니다. 아래 백업·복원에서 JSON으로 내보내 보관해 주세요.', p ? 'ok' : 'err'); drawCps(); } }), cpList),
    sec('다른 대화에서 이어가기 (인계)', '다른 대화에서 내보낸 파일을 불러와 요약·고정 기억·인물·관계선·캐논·서약을 이어받습니다. A→B→C처럼 계속 누적할 수 있습니다. 실리태번 Memoria 에서 내보낸 파일도 받습니다.', null,
      h('div.row', btn('인계', { ic: 'users', cls: 'ghost', title: '인계 파일 가져오기', onclick: async () => { if (Memory.busy()) return toast('기록이 끝난 뒤 같은 대화에서 다시 가져와 주세요.', 'err'); const r = await readFile(true); if (!r) return; const draft = Memory.snapshot(mem); Memory.carry(draft, r.store, r.label);
        if (!(await review(Memory.diff(mem, draft), `「${r.label}」에서 인계`))) return; await Memory.checkpoint(mem, '다른 대화 인계 전'); const n = Memory.carry(mem, r.store, r.label); await Memory.save(mem);
        toast(`인계 완료 — 요약 ${n.summaries} · 기억 ${n.memories} · 인물 ${n.cast} · 캐논 ${n.canon} · 서약 ${n.pledges}${n.bonds ? ` · 관계선 ${n.bonds}` : ''}`, 'ok'); st.draw(); } }))),
    sec('스토리 바이블', '인물·관계선·캐논·서약·타임라인·요약을 한 편의 마크다운 문서로 정리해 내려받습니다. 캐릭터 카드 공유나 설정 정리에 쓰기 좋습니다.', null,
      h('div.row', btn('내보내기', { ic: 'book', cls: 'ghost', title: '스토리 바이블 내보내기', onclick: () => { download(`${file('story-bible')}.md`, bible(chat, mem), 'text/markdown'); toast('스토리 바이블을 내보냈습니다.', 'ok'); } }))),
    sec('백업 · 복원', '이 대화의 기억 전체를 JSON으로 내보내거나 복원합니다. 내보낸 파일은 인계에도 쓸 수 있습니다.', null,
      h('div.row.wrap', btn('내보내기', { ic: 'import', cls: 'ghost', onclick: () => { download(`${file('memoria')}.json`, JSON.stringify(Memory.exportData(chat, mem), null, 2)); toast('기억을 내보냈습니다.', 'ok'); } }),
        btn('가져오기', { ic: 'upload', cls: 'ghost', onclick: async () => { const r = await readFile(); if (!r) return; if (r.foreign) return toast('실리태번 Memoria 파일은 위의 「인계」로 가져와 주세요.', 'err');
          const data = Memory.normalize(r.store, chat.id), turns = mem.turns.length; if (!(await review(Memory.diff(mem, data), '파일로 서고 복원', '현재 서고 전체를 파일의 기록으로 교체합니다. 현재 대화와 맞지 않는 턴 기록은 제외됩니다.'))) return;
          if (Memory.busy() || (Memory.get(chat.id) || mem) !== mem || mem.turns.length !== turns) return toast('대화나 서고가 바뀌었거나 기록 중입니다. 작업이 끝난 뒤 다시 가져와 주세요.', 'err');
          await Memory.checkpoint(mem, '파일 복원 전'); st.mem = await Memory.replace(chat.id, data); Memory.reconcile(st.mem, msgs); await Memory.save(st.mem); Memory.override(chat.id, null); st.draft = null; toast('기억을 복원했습니다.', 'ok'); st.draw(); } }),
        btn(`숨김 해제${hiddenN ? ` (${hiddenN})` : ''}`, { ic: 'eye', cls: 'ghost', title: '숨긴 메시지 모두 표시', onclick: async () => { if (!hiddenN) return toast('숨긴 메시지가 없습니다.'); if (!(await confirmBox(`숨겨 둔 메시지 ${hiddenN}개를 모두 다시 표시할까요?`, '표시'))) return; for (const m of msgs) { m.hidden = false; delete m.memHidden; } await persistMsgs(chat, msgs); toast('숨긴 메시지를 모두 표시했습니다.', 'ok'); st.draw(); } }),
        cfg.autoHide && btn('자동 숨김', { ic: 'eyeoff', cls: 'ghost', title: '요약이 커버한 옛 메시지를 지금 숨깁니다 (설정의 「요약된 메시지 자동 숨김」)', onclick: async () => { const n = Memory.autoHide(chat, msgs); if (n) await persistMsgs(chat, msgs); toast(n ? `요약이 커버한 옛 메시지 ${n}개를 숨겼습니다.` : '숨길 메시지가 없습니다.'); st.draw(); } }),
        btn('초기화', { ic: 'trash', cls: 'danger', title: '이 대화 기억 초기화', onclick: async () => { if (Memory.busy()) return toast('진행 중인 기록이 끝난 뒤 초기화해 주세요.', 'err');
          if (!(await confirmList('이 대화의 모든 기억을 비웁니다. 계속할까요?', ['기억·인물·관계선·캐논·상태·서약·요약을 모두 비웁니다.', '장기기억이 숨겨 둔 메시지는 모두 표시로 되돌립니다 (재색인 가능하도록).', '초기화 직전의 서고는 복구 지점에 보관합니다.'], '전부 비우기', true))) return;
          await Memory.checkpoint(mem, '서고 초기화 전'); st.mem = await Memory.reset(chat.id); st.draft = null; st.log = []; let shown = 0; for (const x of msgs) if (x.memHidden) { x.hidden = false; delete x.memHidden; shown++; } if (shown) await persistMsgs(chat, msgs);
          toast('이 대화의 기억을 초기화했습니다. 도구 탭에서 복구하거나 다시 색인할 수 있습니다.', 'ok'); st.draw(); } }))),
    h('p.mm-note', h('b', '명령어'), ' — ', COMMANDS.map(([c, d]) => [h('code', c), ' ' + d]).flatMap((x, i) => i ? [' · ', ...x] : x), h('br'), h('b', '매크로'), ' — ', h('code', '{{memoria_story}}'), ' 지금까지의 이야기 · ', h('code', '{{memoria_count}}'), ' 기억 수', h('br'),
      h('b', '기억이 비어 보일 때'), ' — 자동 숨김 여부와 위의 「숨김 해제」를 확인하세요. 이미 지워진 기록은 색인으로 해당 구간을 다시 기록해야 합니다.'));
}
/** 스토리 바이블 — 지금까지의 서고 전체를 사람이 읽는 마크다운 문서로. 모델을 부르지 않는다 */
function bible(chat, m) {
  const md = [`# 스토리 바이블 — ${chatTitle(chat)}`, `> 장기기억 서고가 정리한 이 이야기의 기록입니다. (${new Date().toLocaleString('ko-KR')} · ${m.turns.length}턴 · 기억 ${m.memories.length}개)`], sc = Memory.scene(m);
  if (sc.any) md.push(`\n**현재 장면** — ${[sc.location, sc.date, sc.time].filter(Boolean).join(' · ')}`);
  const total = m.turns.reduce((a, t) => a + (t.days || 0), 0); if (total >= 1) md.push(`\n**서사 시계** — 이야기 시작 후 약 ${fmtDays(total)} 경과`);
  const cast = m.cast.filter(c => !c.disabled);
  if (cast.length) { md.push('\n## 등장인물'); for (const c of cast) { const hd = [c.role, c.age, c.occupation].filter(Boolean).join(' · ');
    md.push(`\n### ${c.name}${c.provisional ? ' (미확인 — 아직 이름이 밝혀지지 않음)' : ''}${hd ? ` (${hd})` : ''}`); if (c.aka?.length) md.push(`- 별칭: ${c.aka.join(', ')}`); if (c.appearance) md.push(`- 외모: ${c.appearance}`); if (c.core) md.push(`- 바탕: ${c.core}`); if (c.voice) md.push(`- 말투: ${c.voice}`); if (c.traits?.length) md.push(`- 특성: ${c.traits.join(', ')}`);
    for (const g of c.growth || []) md.push(`- 달라진 점: ${g.text}`); for (const l of c.lines || []) md.push(`- 대사: "${l.text}"`); for (const r of c.relationships || []) md.push(`- 관계 → ${r.target}: ${r.relation}`); } }
  const now = b => Memory.bondNow ? Memory.bondNow(b) : b.log?.[b.log.length - 1] || null, bonds = (m.bonds || []).filter(b => !b.disabled && now(b));
  if (bonds.length) { md.push('\n## 관계선'); for (const b of bonds) { const n = now(b), path = []; for (const e of b.log) if (path[path.length - 1] !== e.stage) path.push(e.stage);
    md.push(`\n### ${b.from} → ${b.to}: ${n.stage}`); if (n.basis) md.push(`- 근거: ${n.basis}`); if (n.calls) md.push(`- 부르는 말: ${n.calls}`); if (n.unsaid) md.push(`- 말하지 못한 것: ${n.unsaid}`); if (path.length > 1) md.push(`- 지나온 길: ${path.join(' → ')}`); } }
  if (m.canon.length) { md.push('\n## 캐논 (세계 설정)'); for (const r of m.canon) md.push(`- **${r.key}** = ${r.value} _(${r.scope}${r.scopeName ? `:${r.scopeName}` : ''})_`); }
  const act = m.pledges.filter(p => p.status === 'active'); if (act.length) { md.push('\n## 서약 (지켜지는 중)'); for (const l of act) md.push(`- [${LOCKS[l.kind] || l.kind}] ${l.summary}`); }
  if (m.status.length) { md.push('\n## 상태 보드'); for (const s of m.status) md.push(`- ${s.entity} · ${s.slot} = ${s.value}${s.claim === 'belief' ? ' (믿음)' : ''}`); }
  if (m.milestones.length) { md.push('\n## 주요 사건 연표'); for (const e of [...m.milestones].sort((a, b) => (a.turn || 0) - (b.turn || 0))) md.push(`- **t${e.turn != null ? e.turn + 1 : '?'} · ${e.title}**${e.summary ? ` — ${e.summary}` : ''}${(e.participants || []).length ? ` _(${e.participants.join(', ')})_` : ''}`); }
  const items = m.items.filter(i => !i.disabled); if (items.length) { md.push('\n## 주요 아이템'); for (const it of items) md.push(`- **${it.name}**${it.holder ? ` (소유: ${it.holder})` : ''}${it.meaning ? ` — ${it.meaning}` : ''}${it.status ? ` [${it.status}]` : ''}`); }
  const sums = [...m.arcs.filter(a => a.carried), ...[...m.arcs.filter(a => !a.carried), ...m.chunks].sort((a, b) => a.from - b.from)];
  if (sums.length) { md.push('\n## 지금까지의 이야기'); for (const s of sums) { md.push(`\n**${s.carried ? `이전 대화 (${s.carriedFrom || '인계'})` : `t${s.from + 1}–t${s.to + 1}`}**`); md.push(s.text); } }
  const dg = m.turns.map((t, i) => t.digest && `- **t${i + 1}** — ${t.digest}`).filter(Boolean); if (dg.length) md.push('\n## 타임라인 (턴별 기록)', ...dg);
  const pins = m.memories.filter(x => x.pinned && !x.disabled); if (pins.length) { md.push('\n## 고정된 기억'); for (const x of pins) md.push(`- (${KINDS[x.kind] || x.kind}${x.turn != null && !x.manual ? `, t${x.turn + 1}` : ''}) ${x.summary}`); }
  return md.join('\n');
}

// ════════ 서고 목록 (전체 서고): 모든 대화의 기록을 캐릭터별로 찾고 · 한 번에 백업 ════════
// 서고가 한 저장소(IndexedDB mem)에 있어 바로 읽는다
const LIB_OWNERS = 8, LIB_CHATS = 10;   // 한 번에 보여 줄 캐릭터 수 · 캐릭터마다 대화 수 — 나머지는 「더 보기」
function vLibrary(st) {
  const box = h('div.mm-view', none('서고를 살피는 중…'));
  (async () => {
    const mems = new Map((await DB.all('mem')).map(m => [m.id, m])), N = v => Number(v || 0).toLocaleString('ko-KR');
    const has = x => !!(['turns', 'memories', 'chunks', 'arcs', 'cast', 'bonds', 'canon', 'status', 'pledges', 'milestones', 'items', 'dossier'].some(k => x.m[k]?.length) || x.m.packetPin?.text);
    const keyOf = c => (c.charIds || []).length > 1 ? 'g:' + c.charIds.join('+') : c.charIds?.[0] || '?';
    const every = S.chats.map(chat => ({ chat, m: mems.get(chat.id) || { id: chat.id }, key: keyOf(chat), name: chatApi.groupTitle(chat) || '삭제된 캐릭터' })), all = every.filter(has);
    const sel = st.libSel ||= new Set(), open = st.libOpen ||= new Map(), fold = st.libFold ||= new Set(), more = st.libMore ||= new Map(); let q = st.libQ || '', sort = st.libSort || 'recent', filter = st.libFilter || 'recorded', busy = false;
    const cnt = m => ({ turns: m.turns?.length || 0, mem: m.memories?.length || 0, sum: (m.chunks?.length || 0) + (m.arcs?.length || 0), cast: m.cast?.length || 0 });
    const tot = all.reduce((a, x) => { const c = cnt(x.m); a.mem += c.mem; a.sum += c.sum; return a; }, { mem: 0, sum: 0 }), owners = new Set(all.map(x => x.key)).size;
    const pass = x => filter === 'all' ? true : filter === 'empty' ? !has(x) : filter === 'summaries' ? cnt(x.m).sum > 0 : has(x);
    const day = t => t ? new Date(t).toLocaleString('ko-KR', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '';
    const detail = x => { const m = x.m, cps = open.get(m.id), fail = (m.turns || []).filter(t => t.failed).length;
      return h('div.mm-libmore', [`턴 기록 ${N(m.turns?.length)}${fail ? ` (실패 ${fail})` : ''}`, `인물 ${N(m.cast?.length)}`, `관계선 ${N(m.bonds?.length)}`, `캐논 ${N(m.canon?.length)}`, `상태 ${N(m.status?.length)}`, `서약 ${N((m.pledges || []).filter(p => p.status === 'active').length)}`, `전환점 ${N(m.milestones?.length)}`, `아이템 ${N(m.items?.length)}`, `자료실 ${N(m.dossier?.length)}`, `복구 지점 ${cps == null ? '…' : cps}`, m.packetPin?.text && '장부 고정 중', x.chat.updatedAt && `최근 대화 ${day(x.chat.updatedAt)}`].filter(Boolean).map(t => h('span', t))); };
    const listEl = h('div.mm-lib'), bar = h('div.mm-libbar'), note = h('p.mm-progress', { role: 'status', 'aria-live': 'polite' }), say = t => { note.textContent = t; note.hidden = !t; }; say('');
    const safeName = t => String(t).replace(/[\\/:*?"<>|]/g, '_').slice(0, 40);
    /** 백업할 때 최신 기록을 다시 읽는다 (목록을 연 뒤에 쌓인 기록도 담기게) */
    const backup = async rows => { rows = rows.filter(has); if (!rows.length) return toast('백업할 기록이 있는 대화를 선택해 주세요.'); if (busy) return; busy = true; say('최신 기록을 읽어 백업 파일을 준비합니다…');
      try { const items = []; for (const x of rows) items.push(Memory.exportData(x.chat, Memory.get(x.chat.id) || await DB.get('mem', x.chat.id) || x.m));
        if (rows.length === 1) { download(`memoria-${safeName(chatTitle(rows[0].chat))}.json`, JSON.stringify(items[0], null, 2)); say('JSON 다운로드를 요청했습니다. 기기의 다운로드 목록에서 파일을 확인해 주세요.'); }
        else { download(`memoria-library-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify({ type: 'dreamland-memoria-library', version: 1, exportedAt: new Date().toISOString(), items }, null, 2)); say(`${N(rows.length)}개 대화의 묶음 백업 다운로드를 요청했습니다. 기기의 다운로드 목록에서 파일을 확인해 주세요.`); } }
      catch (e) { console.error('[장기기억] 서고 백업:', e); say('백업하지 못했습니다: ' + e.message); } finally { busy = false; } };
    const draw = () => {
      const words = q.normalize('NFKC').toLowerCase().split(/\s+/).filter(Boolean);
      const rows = every.filter(pass).filter(x => { const t = `${x.name} ${chatTitle(x.chat)} ${chatApi.roomName(x.chat)}`.normalize('NFKC').toLowerCase(); return words.every(w => t.includes(w)); });
      const groups = new Map(); for (const x of rows) { if (!groups.has(x.key)) groups.set(x.key, []); groups.get(x.key).push(x); }
      const order = (a, b) => (sort === 'mem' ? cnt(b.m).mem - cnt(a.m).mem : sort === 'sum' ? cnt(b.m).sum - cnt(a.m).sum : 0) || (b.chat.updatedAt || 0) - (a.chat.updatedAt || 0);
      const gs = [...groups].map(([key, xs]) => ({ key, name: xs[0].name, group: xs[0].chat.charIds.length > 1, char: S.get('chars', xs[0].chat.charIds[0]), xs: xs.sort(order), mem: xs.reduce((n, x) => n + cnt(x.m).mem, 0), sum: xs.reduce((n, x) => n + cnt(x.m).sum, 0), at: Math.max(...xs.map(x => x.chat.updatedAt || 0)) }))
        .sort((a, b) => (sort === 'mem' ? b.mem - a.mem : sort === 'sum' ? b.sum - a.sum : sort === 'name' ? 0 : b.at - a.at) || String(a.name).localeCompare(String(b.name), 'ko', { numeric: true }));
      const pick = rows.filter(has), shown = st.libOwners || LIB_OWNERS;
      const bBackup = btn(sel.size ? `${N(sel.size)}개 백업` : '선택 백업', { ic: 'import', cls: 'primary', onclick: () => backup(all.filter(x => sel.has(x.m.id))) }), bClear = btn('해제', { cls: 'ghost', onclick: () => { sel.clear(); draw(); } }); bBackup.disabled = bClear.disabled = !sel.size;
      const bPick = btn('검색 결과 선택', { cls: 'ghost', title: '현재 검색·표시 조건에 맞는 대화를 모두 선택합니다.', onclick: () => { pick.forEach(x => sel.add(x.m.id)); draw(); } }); bPick.disabled = !pick.length;
      bar.replaceChildren(h('b', sel.size ? `총 ${N(sel.size)}개 선택` : '선택 없음', h('small', ` · 캐릭터·그룹 ${N(gs.length)}개 · 대화 ${N(rows.length)}개`)), bPick, bClear, bBackup);
      const chatRow = (x, mx) => { const c = cnt(x.m), ok = has(x);
        return h(`div.mm-libchat${sel.has(x.m.id) ? '.on' : ''}${st.chat?.id === x.m.id ? '.cur' : ''}${ok ? '' : '.blank'}`, h('label.check.mm-inline', h('input', { type: 'checkbox', disabled: !ok, checked: sel.has(x.m.id), 'aria-label': `${x.name} · ${chatApi.roomName(x.chat)} 선택`, onchange: e => { e.target.checked ? sel.add(x.m.id) : sel.delete(x.m.id); draw(); } }), h('i')),
          h('div.mm-libmain', h('button.mm-libopen', { title: '이 대화의 서고 열기', onclick: () => { st.tab = 'overview'; st.load(x.m.id); } }, h('b', chatApi.roomName(x.chat)), h('small', ok ? `요약 ${N(c.sum)} · 기억 ${N(c.mem)} · ${N(c.turns)}턴${cur().chat?.id === x.m.id ? ' · 현재 대화' : ''}${x.m.clockDays >= 1 ? ` · 이야기 속 ${fmtDays(x.m.clockDays)}` : ''} · ${fmtTime(x.chat.updatedAt)}` : `빈 서고 · ${fmtTime(x.chat.updatedAt)}`), ok && meter(c.mem, mx)), open.has(x.m.id) && detail(x)),
          ok && ib(open.has(x.m.id) ? 'up' : 'down', '자세히', async () => { if (open.has(x.m.id)) { open.delete(x.m.id); return draw(); } open.set(x.m.id, null); draw(); open.set(x.m.id, (await Memory.checkpoints(x.m.id).catch(() => [])).length); draw(); }), ok && ib('import', '이 대화 JSON 백업', () => backup([x]))); };
      listEl.replaceChildren(...gs.slice(0, shown).map(g => { const ok = g.xs.filter(has), n = ok.filter(x => sel.has(x.m.id)).length, folded = fold.has(g.key), lim = more.get(g.key) || LIB_CHATS, mx = Math.max(1, ...g.xs.map(y => cnt(y.m).mem));
        const ck = h('input', { type: 'checkbox', disabled: !ok.length, checked: ok.length > 0 && n === ok.length, 'aria-label': `${g.name}의 검색된 대화 모두 선택`, onchange: e => { ok.forEach(x => e.target.checked ? sel.add(x.m.id) : sel.delete(x.m.id)); draw(); } }); ck.indeterminate = n > 0 && n < ok.length;
        return h(`section.mm-owner${n ? '.on' : ''}`, h('header', h('label.check.mm-inline', ck, h('i')), avatar(g.char || { name: g.name }, 'xs'),
          h('button.mm-ownername', { title: folded ? '대화 목록 펼치기' : '대화 목록 접기', 'aria-expanded': String(!folded), onclick: () => { folded ? fold.delete(g.key) : fold.add(g.key); draw(); } }, h('b', g.name), h('small', `대화 ${N(g.xs.length)} · 요약 ${N(g.sum)} · 기억 ${N(g.mem)}${g.group ? ' · 그룹 대화' : ''}`)), ico(folded ? 'down' : 'up', 14),
          btn(`전체 백업 · ${N(ok.length)}개`, { cls: 'ghost', ic: 'import', title: `이 ${g.group ? '그룹' : '캐릭터'}의 기록 있는 대화를 모두 백업합니다`, onclick: () => backup(every.filter(x => x.key === g.key)) })),
          folded ? null : [g.xs.slice(0, lim).map(x => chatRow(x, mx)), g.xs.length > lim ? h('button.btn.ghost.mm-more', { onclick: () => { more.set(g.key, lim + LIB_CHATS); draw(); } }, `대화 더 보기 (${N(g.xs.length - lim)})`) : null]); }),
        gs.length > shown ? h('button.btn.ghost.mm-more', { onclick: () => { st.libOwners = shown + LIB_OWNERS; draw(); } }, `캐릭터 더 보기 (${N(gs.length - shown)})`) : null,
        !gs.length && h('div.mm-empty', h('i.mm-star', '✦'), h('b', every.length ? '표시할 대화가 없어요' : '아직 대화가 없어요'), every.length ? h('span', '검색어나 표시 조건을 바꿔 보세요. 빈 서고는 기본 목록에서 제외됩니다.') : null));
    };
    const opt = (list, v) => list.map(([k, l]) => h('option', { value: k, selected: v === k }, l));
    box.replaceChildren(h('div.mm-top', h('div.mm-stats', ...[[owners, '캐릭터·그룹'], [all.length, '기록 대화'], [tot.sum, '요약'], [tot.mem, '기억']].map(([n, l]) => h('div', h('b', N(n)), h('span', l))))),
      sec('전체 서고', '캐릭터별로 찾고, 대화별로 보관하세요. 기록을 읽기만 합니다 · AI 호출·요금 없음', null,
        h('div.mm-toolbar', h('input.inp', { type: 'search', placeholder: '캐릭터 이름 또는 대화 이름', 'aria-label': '캐릭터·대화 찾기', autocomplete: 'off', value: q, oninput: e => { q = st.libQ = e.target.value; st.libOwners = LIB_OWNERS; draw(); } }),
          h('select.inp.auto', { title: '표시할 기록', onchange: e => { filter = st.libFilter = e.target.value; st.libOwners = LIB_OWNERS; draw(); } }, opt([['recorded', '기록 있음'], ['summaries', '요약 있음'], ['empty', '빈 서고'], ['all', '모든 대화']], filter)),
          h('select.inp.auto', { title: '정렬', onchange: e => { sort = st.libSort = e.target.value; draw(); } }, opt([['recent', '최근 대화순'], ['name', '이름순'], ['sum', '요약 많은 순'], ['mem', '기억 많은 순']], sort))), bar, note, listEl,
        h('details.mm-details', h('summary', '백업과 복원 안내'), h('p.hint', '대화 하나는 JSON 파일 하나로, 여러 대화는 묶음 JSON 파일 하나로 받습니다. 복원할 대화를 열고 ', h('b', '도구 → 백업·복원 → 가져오기'), '에서 그 파일을 고르면 그 대화의 기록을 찾아 복원합니다 (다른 대화로 옮기려면 「인계」).'),
          h('p.hint', '백업할 때 최신 기록을 다시 읽습니다. 기억·요약·도감을 보관하며, 대화 원문과 캐릭터 카드, API 설정은 포함하지 않습니다. 복구 지점은 서고와 따로 보관되어 백업에 들어가지 않습니다.'))));
    draw();
  })().catch(e => { console.error(e); box.replaceChildren(none('서고를 읽지 못했어요: ' + e.message)); });
  return box;
}

// ════════ 서고 화면 조립 (기능 탭과 서고 창이 함께 쓴다) ════════
const TABS = [['overview', '개요', 'panel'], ['memories', '기억', 'sparkle'], ['world', '세계', 'globe'], ['summaries', '이야기', 'note'], ['config', '설정', 'sliders'], ['tools', '도구', 'gear'], ['library', '서고 목록', 'folder']];
/** 기억 · 세계 · 이야기 탭(memoria-views.js)에 넘기는 도우미 묶음 */
const UI = { ico, ib, safe, pct, sec, none, chip, kindBadge, meter, turnTag, copyText, busyBtn, editBox, confirmList, progressBox, review, showSource, editMemory, editCast, mergeCast, withCheckpoint, del, sceneLine, stats, recordText, VIS_IC };
const VIEWS = { overview: vOverview, memories: st => vMem2(st, UI), world: st => vWorld2(st, UI), summaries: st => vStory(st, UI), config: vConfig, tools: vTools, library: vLibrary };
const mounted = new Set();
let lastTab = 'overview', focus = '', activity = '';
function mount(host, { chatId, tab, close } = {}) {
  ensure();
  const st = { chat: null, mem: null, msgs: [], tab: tab || lastTab, q: '', kind: '', vis: '', owner: '', sort: 'new', only: '', log: [], draft: null, answer: '', question: '', story: null, close, host };
  const head = h('div.mm-head'), tabs = h('div.tabs.mm-tabs', { role: 'tablist', 'aria-label': '장기기억 서고' }), body = st.body = h('div.mm-body');
  st.head = () => {
    const cfg = Memory.cfg(), m = st.mem, failed = m?.turns.filter(t => t.failed).length || 0, state = !cfg.enabled ? '꺼짐' : !st.chat ? '대화 없음' : activity || (Memory.busy() ? '기록 중…' : '대기 중');
    const chats = [...S.chats].sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0)).slice(0, 80); if (st.chat && !chats.includes(st.chat)) chats.unshift(st.chat);
    head.replaceChildren(h('div.mm-status', h(`i.mm-lamp${!cfg.enabled ? '.off' : Memory.busy() ? '.busy' : ''}`), h('div', h('b', '상태: ', h('em', state)),
      h('span', m ? `${m.turns.length}턴 · 기억 ${m.memories.length} · 인물 ${m.cast.length} · 캐논 ${m.canon.length} · 상태 ${m.status.length} · 서약 ${m.pledges.filter(p => p.status === 'active').length} · 요약 ${m.chunks.length + m.arcs.length}` : '대화를 열면 이 대화의 기억이 표시됩니다.', failed ? h('em.mm-fail', ` · ⚠ 기록 실패 ${failed} (도구→색인으로 재시도)`) : null))),
      h('div.mm-head-tools', chats.length ? roomPick(chats, st) : null,
        st.chat && btn('기록', { ic: 'feather', title: '마지막 답변 턴을 지금 바로 기억으로 기록합니다.', onclick: async () => { await recordNow(st.chat); st.reload(); } }),
        st.chat && btn('갱신', { ic: 'refresh', cls: 'ghost', title: '현재 맥락 기준으로 주입 내용을 다시 생성합니다.', onclick: () => { st.draft = null; Memory.override(st.chat.id, null); Memory.reinjectNow?.(st.chat); st.tab = 'overview'; st.draw();   // 갱신은 수정본 · 초안 폐기를 겸한다
          toast(st.mem?.packetPin?.text ? '장부가 고정돼 있어 고정한 내용을 그대로 주입합니다. (핀으로 해제)' : '주입 내용을 다시 생성했습니다.', st.mem?.packetPin?.text ? '' : 'ok'); } })));
  };
  st.draw = () => {
    lastTab = st.tab; st.head();
    tabs.replaceChildren(...TABS.map(([id, label, ic]) => h(`button.tab${st.tab === id ? '.on' : ''}`, { type: 'button', role: 'tab', 'aria-selected': String(st.tab === id), onclick: () => { st.tab = id; st.draw(); } }, ico(ic, 15), h('span', label))));
    let view;
    try { view = (st.chat && st.mem) || st.tab === 'config' || st.tab === 'library' ? VIEWS[st.tab](st) : h('div.mm-view', none('대화를 열면 이 대화의 기억이 표시됩니다. 「서고 목록」에서 기록이 있는 대화를 찾을 수 있어요.')); }
    catch (e) { console.error(e); view = h('div.mm-view', none('화면을 그리지 못했어요: ' + e.message)); }
    if (view !== body.firstChild) body.replaceChildren(view);   // 같은 화면을 돌려받았으면 그대로 둔다 — 검색 중 한글 조합이 끊기지 않게
  };
  st.load = async id => {
    const chat = S.get('chats', id) || cur().chat || S.get('chats', S.settings.lastChat) || [...S.chats].sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))[0] || null;
    if (chat?.id !== st.chat?.id) { st.log = []; st.draft = null; st.answer = ''; st.question = ''; st.story = null; }   // 편집 대화 · 초안 · 이야기 탭의 보기 상태는 그 대화의 것
    st.chat = chat; focus = chat?.id || '';
    if (chat) { st.mem = await Memory.load(chat.id); st.msgs = await msgsOf(chat); } else { st.mem = null; st.msgs = []; }
    st.draw();
  };
  st.reload = () => st.load(st.chat?.id);
  host.classList.add('mm'); host.replaceChildren(head, tabs, body);
  mounted.add(st); st.load(chatId || focus);
  return st;
}
const alive = () => [...mounted].filter(st => st.host.isConnected || (mounted.delete(st), false));
const refreshHeads = () => { for (const st of alive()) { if (st.chat) st.mem = Memory.get(st.chat.id) || st.mem; st.head(); } };
on('memory', debounce(refreshHeads, 150)); on('memory:busy', refreshHeads);
// 장부의 모양을 바꾸는 설정을 고쳤을 때(엔진의 reinjectNow) — 미리보기를 고치는 중이 아니면 개요를 다시 그린다
on('memory:packet', id => { for (const st of alive()) if (st.tab === 'overview' && st.chat && (!id || st.chat.id === id) && !document.activeElement?.classList?.contains('mm-preview')) st.draw(); });
on('memory:activity', debounce(() => { for (const st of alive()) if (st.tab === 'tools' && st.actList?.isConnected) st.actList.replaceChildren(...activityRows()); }, 120));   // 사서 일지는 열려 있을 때만 다시 그린다
/** 서고 창 (화면 전체를 덮는다) */
export function openArchive(chat, tab) {
  document.querySelector('.mm-wrap')?.remove();
  const host = h('div'), close = () => { wrap.classList.add('out'); setTimeout(() => wrap.remove(), 180); document.removeEventListener('keydown', key); if (cur().chat) chatApi.redraw(); };
  const key = e => { if (e.key === 'Escape' && wrap === document.getElementById('modals').lastElementChild && !/^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName || '')) close(); };
  const wrap = h('div.mm-wrap', { onmousedown: e => { if (e.target === wrap) close(); } }, h('div.mm-frame', { role: 'dialog', 'aria-modal': 'true', 'aria-label': '장기기억 서고' },
    h('header.mm-bar', h('div.phead-text', h('span.eyebrow', 'memoria'), h('h2', '장기기억 서고')), iconBtn('x', '닫기', close)), h('div.mm-scroll', host)));
  document.getElementById('modals').append(wrap); document.addEventListener('keydown', key);
  mount(host, { chatId: chat?.id, tab: tab || 'overview', close });
}

// ════════ 등록: 기능 탭 · 프롬프트 · 장면 패널 · 메시지 메뉴 ════════
X.studio.push({ owner: 'memoria', title: '장기기억', render: () => { const host = h('div.card.mm-card-host'); mount(host, { chatId: cur().chat?.id }); return host; } });

X.before = X.before.filter(p => p.owner !== 'memoria');
X.before.push({ owner: 'memoria', fn: ({ chat, msgs, type }) => Memory.prepare(chat, msgs, { type }) });   // 임베딩 회상은 프롬프트를 짓기 전에 미리 다녀온다
X.prompt = X.prompt.filter(p => p.owner !== 'memory');
X.prompt.push({ owner: 'memoria', fn: ({ chat, history, msgs, type, commit }) => {
  const mem0 = Memory.cfg().enabled ? Memory.get(chat.id) : null;
  if (mem0 && msgs && commit !== false) {   // 지우거나 고친 답변 · 다시 생성하는 답변에서 나온 기록은 싣기 전에 걷어 낸다
    let changed = Memory.reconcile(mem0, msgs); const tail = msgs[msgs.length - 1];
    if ((type === 'regen' || type === 'swipe') && tail?.role === 'assistant' && mem0.turns.some(t => t.msgId === tail.id)) { Memory.dropTurn(mem0, tail.id); changed = true; }
    if (changed) Memory.save(mem0).catch(e => console.warn('[장기기억]', e));
  }
  const opts = { msgs, type, preview: commit === false };   // 프롬프트 미리보기는 회상 학습 · 직전 주입 기록 · 고정 장부에 넣지 않는다
  if (Memory.injection) return Memory.injection(chat, history, opts);   // 어디에 실을지(한 덩어리 · 나눠 싣기 · 고정 장부)는 엔진이 정한다
  const p = Memory.packet(chat, history, opts); if (!p) return [];
  const pos = Memory.cfg().position || 'split', depth = Memory.cfg().depth ?? 1;
  if (p.fixed || pos !== 'split') return [pos === 'chat' ? { where: 'depth', depth, order: 60, content: p.text, src: '장기기억' } : { where: 'before', content: p.text, src: '장기기억' }];
  return [p.stable && { where: 'before', content: p.stable, src: '장기기억 (줄거리)' }, p.live && { where: 'depth', depth, order: 60, content: p.live, src: '장기기억 (지금)' }].filter(Boolean);
} });

X.panels = X.panels.filter(p => p.owner !== 'memory');
X.panels.push({ owner: 'memoria', title: '장기기억', icon: 'book', render: (chat, msgs) => {
  const cfg = Memory.cfg(), mem = Memory.get(chat.id);
  if (!cfg.enabled) return h('div.col', h('p.dim', '켜 두면 대화를 기록해 두고 필요한 기억을 골라 불러옵니다.'), h('div.row.wrap', btn('장기기억 켜기', { ic: 'check', cls: 'primary', onclick: () => { ensure().enabled = true; saveCfg(); chatApi.redraw(); toast('장기기억을 켰습니다.', 'ok'); } }), btn('서고', { ic: 'book', cls: 'ghost', onclick: () => openArchive(chat) })));
  if (!mem) return h('p.dim', '기억을 불러오는 중…');
  const failed = mem.turns.filter(t => t.failed).length, pending = Memory.pending(mem, msgs).length, last = Memory.last(chat.id), sc = Memory.scene(mem), once = Memory.overridden(chat.id);
  const tile = (n, l, tab) => h('button', { onclick: () => openArchive(chat, tab) }, h('b', String(n)), h('span', l));
  return h('div.col.mm-panel',
    h('div.mm-status.small', h(`i.mm-lamp${Memory.busy() ? '.busy' : ''}`), h('div', h('b', '상태: ', h('em', activity || (Memory.busy() ? '기록 중…' : cfg.auto ? '대기 중' : '수동 기록'))), h('span', last ? `직전 주입 ≈ ${last.tokens.toLocaleString()} 토큰${last.fixed ? '' : ` · 회상 ${last.picked.length}개`}` : '다음 답변부터 기억을 주입합니다'))),
    h('div.mm-stats.small', tile(mem.turns.length, '턴', 'summaries'), tile(mem.memories.length, '기억', 'memories'), tile(mem.cast.length, '인물', 'world'), tile(mem.pledges.filter(p => p.status === 'active').length, '서약', 'world'), tile(mem.chunks.length + mem.arcs.length, '요약', 'summaries'), tile(mem.clockDays >= 1 / 24 ? fmtDays(mem.clockDays) : '–', '서사 시계', 'summaries')),
    sceneLine(mem, sc),
    last && !last.fixed ? h('div.mm-budget', h('span.mm-tok', `예산 ${cfg.tokenBudget.toLocaleString()}`), meter(last.tokens, cfg.tokenBudget, 'big')) : null,
    failed ? h('button.mm-alert', { onclick: () => backfill(chat) }, ico('refresh', 14), `⚠ 기록 실패 ${failed}턴 — 눌러서 색인으로 재시도`) : null,
    !failed && pending > 1 ? h('button.mm-alert.soft', { onclick: () => backfill(chat) }, ico('feather', 14), `아직 기록되지 않은 답변 ${pending}개 — 눌러서 색인`) : null,
    mem.packetPin?.text ? h('button.mm-alert.soft', { onclick: () => openArchive(chat, 'overview') }, ico('pin', 14), '고정한 장부를 주입하는 중') : null, once ? h('button.mm-alert.soft', { onclick: () => openArchive(chat, 'overview') }, ico('edit', 14), '수정본 대기 중 — 다음 응답 1회에 주입됩니다') : null,
    cfg.supervisor && mem.direction?.plan?.scene_goal ? h('p.mm-goal', h('b', '연출'), String(mem.direction.plan.scene_goal)) : null,
    h('div.row.wrap', btn('서고', { ic: 'book', title: '장기기억 서고 열기', onclick: () => openArchive(chat) }), btn('기록', { ic: 'feather', cls: 'ghost', title: '마지막 답변 턴을 지금 바로 기억으로 기록합니다.', onclick: () => recordNow(chat) }),
      btn('추가', { ic: 'plus', cls: 'ghost', title: '기억 추가', onclick: async () => { const v = await promptBox('추가할 기억 내용 (수동 기억은 자동 정리에서 제외됩니다)', '', { area: true, placeholder: '예: 아리아는 고양이 알레르기가 있다' }); if (v?.trim()) { await Memory.add(chat.id, { summary: v.trim().slice(0, 400), importance: 0.8 }); toast('기억을 추가했습니다.', 'ok'); chatApi.redraw(); } } }),
      btn('질문', { ic: 'search', cls: 'ghost', title: '서고에 질문', onclick: () => askBox(chat) })));
} });
function askBox(chat, question = '') {
  const q = h('input.inp', { value: question, placeholder: '이 이야기에 대해 물어보기…' }), out = h('div.mm-answer'); out.hidden = true;
  const run = async () => { if (!q.value.trim()) return toast('질문을 입력하세요.'); out.hidden = false; out.textContent = '서고를 뒤지는 중…'; try { out.textContent = await Memory.ask(chat, q.value.trim()); } catch (e) { out.textContent = `답변 실패: ${e.message}`; } };
  q.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); run(); } });
  modal({ title: '서고에 질문', wide: true, body: h('div.col.mm', h('p.hint', '저장된 기억만 근거로 답합니다.'), h('div.row', q, btn('질문', { ic: 'search', cls: 'primary', onclick: run })), out), actions: [{ label: '닫기' }] });
  if (question) run();
}
X.actions = X.actions.filter(a => a.owner !== 'memoria');
X.actions.push({ owner: 'memoria', id: 'memoria-record', label: '기억으로 기록', icon: 'feather', run: async (msg, chat) => {
  if (msg.role !== 'assistant') return toast('답변만 기록할 수 있습니다.');
  ensure(); chatApi.setStatus('기억 정리 중…');
  try { const mem = await Memory.commit(chat, cur().msgs, msg, { force: true }); const t = mem.turns.find(x => x.msgId === msg.id); toast(t?.failed ? '기록하지 못했습니다: ' + (t.error || '') : '이 답변을 기록했습니다.', t?.failed ? 'err' : 'ok'); } catch (e) { toast('기록 실패: ' + e.message, 'err'); } finally { chatApi.setStatus(''); chatApi.redraw(); }
} });
/** 메시지 하나를 막간/이야기로 직접 고른다 (설정의 「막간 분류」와 같은 처리 — 메뉴 문구는 고정이라 누를 때마다 뒤집는다) */
X.actions.push({ owner: 'memoria', id: 'memoria-side', label: '막간 ↔ 이야기', icon: 'moon', run: async (msg, chat) => {
  const cfg = ensure(), msgs = cur().msgs, no = msgs.indexOf(msg) + 1;
  if ((cfg.qrMode || 'side') === 'keep') return toast('설정의 「QR 메시지」가 「빼지 않기」라 막간을 가리지 않습니다. 「코멘트·막간만 빼기」로 바꾼 뒤 다시 골라 주세요.');
  const was = Memory.isSideMessage(msg), side = !was, mem = await Memory.load(chat.id);
  msg.memSide = side;
  if (msg.role === 'assistant' && side && mem.turns.some(t => t.msgId === msg.id)) Memory.dropTurn(mem, msg.id);   // 이미 기록된 막간은 그 턴의 기억째로 걷어 낸다
  delete msg.memCheck;   // 막간은 점검하지 않는다 — 옛 경고도 지운다
  await chatApi.save(); Memory.reconcile(mem, msgs); await Memory.save(mem); chatApi.redraw();
  if (side) Memory.logActivity?.('side', `#${no}은 롤플을 멈추고 만든 막간이라 기억에 넣지 않아요`);
  toast(side ? `#${no} 메시지를 막간으로 표시했습니다 — 기억·회상·점검에서 빠집니다.` : `#${no} 메시지를 이야기로 되돌렸습니다${msg.role === 'assistant' && cfg.enabled && cfg.auto ? ' — 다시 기록합니다.' : '.'}`, 'ok');
  if (!side && msg.role === 'assistant' && cfg.enabled && cfg.auto) Promise.resolve(Memory.commit(chat, msgs, msg)).catch(e => console.warn('[장기기억]', e));   // 기록 지연은 commit 이 스스로 따진다
} });

// ════════ 메시지 표시: 연속성 검사 ⚠ (이름 옆 배지 → 누르면 어긋난 곳) ════════
/** 메시지에 붙은 점검 결과 — 그 글에 대한 것일 때만 (스와이프 · 수정으로 글이 바뀌면 옛 경고는 무효). 글이 바뀌었는지는 엔진이 가린다 */
const checkOf = msg => Memory.checkOf ? Memory.checkOf(msg) : msg?.memCheck || null;
function decorateCheck(el, msg) {
  const head = el?.querySelector('.msg-head'); if (!head) return;
  const c = msg && msg.role === 'assistant' ? checkOf(msg) : null, old = head.querySelector('.mm-check-badge');
  if (!c || (!c.issues?.length && !c.filtered?.length)) { old?.remove(); return; }
  const quiet = !c.issues?.length, text = quiet ? 'ⓘ' : `⚠ ${c.issues.length}`;
  if (old?.textContent === text) return;
  old?.remove();
  const badge = h(`button.mm-check-badge${quiet ? '.quiet' : ''}`, { type: 'button', title: quiet ? '걸러진 경고 보기' : '기록과 다른 부분', onclick: e => { e.stopPropagation(); showCheckIssues(msg); } }, text), name = head.querySelector('b');
  name ? name.after(badge) : head.append(badge);
}
function decorateAllChecks() {
  const { chat, msgs } = cur(), els = document.querySelectorAll('article.msg[data-id]'); if (!chat || !els.length) return;
  const any = msgs.some(m => m.memCheck), byId = any ? new Map(msgs.map(m => [m.id, m])) : null;
  for (const el of els) { if (any) decorateCheck(el, byId.get(el.dataset.id)); else el.querySelector('.mm-check-badge')?.remove(); }
}
let decoWait = false;
const queueDecorate = () => { if (decoWait) return; decoWait = true; requestAnimationFrame(() => { decoWait = false; try { decorateAllChecks(); } catch (e) { console.warn('[장기기억] 점검 표시', e); } }); };
// 대화 화면은 메시지를 통째로 다시 그린다 — 메시지 요소가 새로 붙을 때마다 배지를 다시 단다
if (document.body) new MutationObserver(list => { for (const r of list) for (const n of r.addedNodes) if (n.nodeType === 1 && (n.classList.contains('msg') || n.querySelector?.('article.msg'))) return queueDecorate(); }).observe(document.body, { childList: true, subtree: true });
function showCheckIssues(msg) {
  const c = checkOf(msg); if (!c) return;
  const row = i => { const tone = /^\s*\[말투\]/.test(i.problem || ''), problem = String(i.problem || '').replace(/^\s*\[말투\]\s*/, '');
    return h('article.mm-diff.mm-issue', h('b', `“${i.quote || ''}”`), h('div', tone && h('em.mm-tag.dash', { title: '기록된 바탕·말투와 어긋난 말씨나 행동' }, '말투'), tone ? ' ' : '', problem),
      i.evidence && h('div.mm-evid', `근거${i.source ? ` (${i.source})` : ''}: “${i.evidence}”`), i.why && h('div.mm-evid', i.why)); };
  modal({ title: '기록과 다른 부분', wide: true, body: h('div.mm.mm-review', (c.issues || []).length ? h('div.mm-review-list', c.issues.map(row)) : h('p.hint', '남은 경고가 없습니다.'),
    (c.filtered || []).length ? h('details.mm-details', h('summary', `걸러진 경고 ${c.filtered.length}개`), h('p.hint', '사서가 짚었지만 근거가 된 문장을 기록·최근 대화에서 확인하지 못해 걸러 낸 경고입니다.'), h('div.mm-review-list', c.filtered.map(row))) : null),
    actions: [{ label: '닫기' }, { label: '경고 지우기', cls: 'danger', onclick: async () => { delete msg.memCheck; if (cur().msgs.includes(msg)) await chatApi.save(); decorateAllChecks(); } }] });
}

// ════════ 명령어 · 매크로 ════════
const COMMANDS = [['/memoria', '켜기/끄기'], ['/memoria-autorecord', '자동 기록 켜기/끄기'], ['/memoria-remember 내용', '수동 기억'], ['/memoria-search 검색어', '기억 검색'], ['/memoria-ask 질문', '서고에 질문'], ['/memoria-index', '전체 색인'], ['/memoria-clock', '서사 시계 재계산'], ['/memoria-reconcile', '대화와 기록 맞추기'], ['/memoria-open', '서고 열기']];
const need = api => { const c = api.current().chat; if (!c) throw new Error('먼저 대화를 열어 주세요.'); return c; };
const flip = (key, arg, label) => { const m = ensure(), v = String(arg || '').trim().toLowerCase(); m[key] = v === 'on' ? true : v === 'off' ? false : !m[key]; saveCfg(); toast(`${label}: ${m[key] ? 'ON' : 'OFF'}`); for (const st of alive()) st.draw(); chatApi.redraw(); };
const cmd = (name, help, run) => X.commands.set(name, { owner: 'memoria', help, run });
cmd('/memoria', '장기기억 켜기/끄기 (on/off 생략 시 토글)', arg => flip('enabled', arg, '장기기억'));
cmd('/memoria-autorecord', '자동 기록(매 턴 사서 호출) 켜기/끄기 (on/off 생략 시 토글). 장기기억 자체는 계속 켜져 있고 새로 기록만 멈춥니다.', arg => flip('auto', arg, '자동 기록'));
cmd('/memoria-remember', '수동으로 기억을 추가합니다. 예: /memoria-remember 아리아는 고양이 알레르기가 있다', async (arg, api) => { const chat = need(api), text = String(arg || '').replace(/\s+/g, ' ').trim().slice(0, 300); if (!text) throw new Error('내용이 비어 있습니다.'); await Memory.add(chat.id, { summary: text, importance: 0.8 }); toast(`기억 추가됨: ${text}`, 'ok'); chatApi.redraw(); });
cmd('/memoria-search', '기억을 검색해 결과를 보여 줍니다.', async (arg, api) => { const chat = need(api), mem = await Memory.load(chat.id), r = Memory.recallEx(chat, mem, [], { query: String(arg || ''), topK: 10 }), all = [...r.pinned, ...r.triggered, ...r.selected].slice(0, 10);
  modal({ title: `기억 검색: ${arg || ''}`, wide: true, body: h('div.mm.mm-list', all.map(m => h('article.mm-card', h('header', kindBadge(m.kind), h('span.mm-turn', turnTag(mem, m)), h('span.tokbadge', r.trace.get(m.id)?.score != null ? `점수 ${r.trace.get(m.id).score.toFixed(2)}` : '고정')), h('p.mm-sum', m.summary), m.quote && h('blockquote', `"${m.quote}"`))), !all.length && none('관련 기억이 없습니다.')), actions: [{ label: '닫기' }] }); });
cmd('/memoria-ask', '저장된 기억만 근거로 스토리에 대한 질문에 답합니다. 예: /memoria-ask 우리가 처음 만난 곳이 어디였지?', (arg, api) => askBox(need(api), String(arg || '').trim()));
cmd('/memoria-index', '현재 대화의 아직 기록되지 않은 턴을 전부 색인합니다.', (arg, api) => backfill(need(api)));
cmd('/memoria-clock', '기록된 다이제스트를 처음부터 다시 읽어 서사 시계(이야기 속 날짜)를 재계산합니다.', async (arg, api) => { const chat = need(api), mem = await Memory.load(chat.id), fmt = d => d >= 1 ? fmtDays(d) : '1일 미만'; api.setStatus('서사 시계를 재계산하는 중…'); try { const r = await Memory.recalClock(chat, mem); toast(r ? `서사 시계 재계산 완료 — 이야기 총 경과 ${fmt(r.after)} (${fmt(r.before)} → ${fmt(r.after)})` : '재계산할 턴 기록이 없습니다.', r ? 'ok' : ''); } finally { api.setStatus(''); } });
cmd('/memoria-reconcile', '저장된 턴 기록을 현재 대화 메시지와 다시 맞춥니다 (이미 지워진 기록은 복구하지 않음)', async (arg, api) => { const chat = need(api), mem = await Memory.load(chat.id), n = mem.turns.length, ch = Memory.reconcile(mem, api.current().msgs); if (ch) await Memory.save(mem); toast(ch ? `대화와 기록을 맞췄습니다. (기록 턴 ${n} → ${mem.turns.length})` : '이미 대화와 기록이 일치합니다.', ch ? 'ok' : ''); chatApi.redraw(); });
cmd('/memoria-open', '장기기억 서고를 엽니다 (탭 이름을 붙일 수 있습니다: overview · memories · world · summaries · config · tools · library)', (arg, api) => openArchive(need(api), TABS.some(t => t[0] === String(arg).trim()) ? String(arg).trim() : undefined));
X.macros.set('memoria_story', { owner: 'memoria', fn: () => { const m = Memory.get(cur().chat?.id); return m ? [...m.arcs.filter(a => a.carried), ...[...m.arcs.filter(a => !a.carried), ...m.chunks].sort((a, b) => a.from - b.from)].map(s => s.text).join('\n') : ''; } });
X.macros.set('memoria_count', { owner: 'memoria', fn: () => String(Memory.get(cur().chat?.id)?.memories.length || 0) });

// ════════ 이벤트 ════════
const setActivity = text => { activity = text; refreshHeads(); };
on('message:received', async ({ msg, chat }) => {
  try {
    await Memory.received(chat, msg);   // 1회용 수정본 폐기 · 직전 주입 기억의 반영 여부 채점
    const cfg = Memory.cfg(); if (!cfg.enabled) return;
    const msgs = await msgsOf(chat), side = !!Memory.tagSideMessage?.(chat, msgs, msg) || Memory.isSideMessage(msg);   // 새 답변이 막간인지 가려 표시한다 — 막간은 기록도 점검도 하지 않는다
    // 연속성 검사 — 그리팅 · 명령어로 들어온 메시지는 보지 않는다. 엔진이 기록과 같은 줄에 세워 보조 모델을 동시에 두 번 부르지 않는다
    if (cfg.replyCheck && Memory.checkReply && msg?.role === 'assistant' && !side && !msg.greeting && !msg.viaCommand) {
      setActivity('연속성 검사 중…');
      Promise.resolve(Memory.checkReply(chat, msgs, msg)).catch(e => { console.warn('[장기기억] 연속성 검사', e); Memory.logActivity?.('error', `연속성 검사 실패: ${e?.message || e}`); })
        .finally(() => { if (activity === '연속성 검사 중…') setActivity(''); if (isCur(chat)) queueDecorate(); });
    }
    // 자동 기록을 꺼 두었어도 연출 · 숨김 · 질의 임베딩은 답변 뒤에 챙긴다 (켜져 있으면 기록이 끝난 뒤 함께 처리된다)
    if (!cfg.auto && !side && (cfg.supervisor || cfg.autoHide || cfg.embed?.mode === 'api')) { setActivity('다음 장면 준비 중…'); try { await Memory.post(chat, msgs); } finally { if (activity === '다음 장면 준비 중…') setActivity(''); } }
  } catch (e) { console.warn('[장기기억]', e); Memory.logActivity?.('error', `이벤트 처리 중 오류: ${e?.message || e}`); }
});
on('memory:msgs', chat => { if (isCur(chat)) chatApi.redraw(); });
on('memory:check', () => queueDecorate());   // 엔진이 점검 결과를 메시지에 붙였을 때
on('chat:open', chat => { focus = chat?.id || focus; ensure(); setTimeout(queueDecorate, 600); });
