// ── Dreamland ui: 아이콘 · 토스트 · 모달 · 메뉴 · 폼 · 페이지 라우터 ──
import { h, esc, S, on, emit, pickFiles, readDataURL, shrinkImage, debounce } from './core.js';

const I = {
  home: 'M3 11l9-8 9 8v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z', chat: 'M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z',
  book: 'M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2zM4 21V5M8 8h7', sliders: 'M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12M16 4v4M10 10v4M18 16v4',
  user: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 21a8 8 0 0 1 16 0', code: 'M8 6l-6 6 6 6M16 6l6 6-6 6M14 4l-4 16', plug: 'M9 2v6M15 2v6M6 8h12v4a6 6 0 0 1-12 0zM12 18v4',
  import: 'M12 3v12M7 10l5 5 5-5M4 21h16', upload: 'M12 15V3M7 8l5-5 5 5M4 21h16', gear: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M4.9 19.1L7 17M17 7l2.1-2.1',
  plus: 'M12 5v14M5 12h14', x: 'M6 6l12 12M18 6L6 18', send: 'M4 12l16-8-6 16-3-7z', stop: 'M7 7h10v10H7z', edit: 'M4 20h4L19 9l-4-4L4 16zM14 6l4 4',
  trash: 'M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13', copy: 'M9 9h11v11H9zM5 15V4h11', refresh: 'M20 11a8 8 0 1 0-2.3 6.3M20 4v7h-7', left: 'M15 5l-7 7 7 7', right: 'M9 5l7 7-7 7',
  link: 'M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1', merge: 'M6 3v6c0 4 6 4 6 9v3M18 3v6c0 4-6 4-6 9M9 18l3 3 3-3', mark: 'M6 3h12v18l-6-4-6 4z',
  branch: 'M6 3v12M6 15a3 3 0 1 0 0 6 3 3 0 0 0 0-6zM18 3a3 3 0 1 0 0 6 3 3 0 0 0 0-6zM18 9c0 5-12 3-12 9', eye: 'M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12zM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z',
  eyeoff: 'M3 3l18 18M10.6 5.2A9.7 9.7 0 0 1 12 5c6 0 10 7 10 7a17 17 0 0 1-3.2 4M6.5 6.6C3.7 8.4 2 12 2 12s4 7 10 7c1.6 0 3-.4 4.3-1M9.9 9.9a3 3 0 0 0 4.2 4.2',
  more: 'M5 12h.01M12 12h.01M19 12h.01', lock: 'M6 11h12v9H6zM9 11V8a3 3 0 0 1 6 0v3', star: 'M12 3l2.7 5.6 6.1.8-4.5 4.3 1.1 6.1L12 17l-5.4 2.8 1.1-6.1L3.2 9.4l6.1-.8z', moon: 'M20 14.5A8 8 0 0 1 9.5 4 8 8 0 1 0 20 14.5z',
  search: 'M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14zM21 21l-5-5', dice: 'M5 3h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2zM8 8h.01M16 16h.01M12 12h.01M16 8h.01M8 16h.01',
  panel: 'M3 4h18v16H3zM15 4v16', play: 'M7 4l13 8-13 8z', users: 'M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM2 21a7 7 0 0 1 14 0M17 3.5a4 4 0 0 1 0 7.5M22 21a7 7 0 0 0-4-6.3',
  lang: 'M4 5h8M8 3v2M5 9c1 3 4 5 7 6M11 5c-1 4-3 7-7 9M13 21l4-9 4 9M14.5 18h5', volume: 'M4 9v6h4l5 4V5L8 9zM16 9a4 4 0 0 1 0 6', feather: 'M20 4c-7 0-12 5-13 12l-3 4M7 16h6c4-2 6-6 7-12',
  check: 'M5 12l5 5 9-11', menu: 'M4 6h16M4 12h16M4 18h16', sparkle: 'M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8zM19 16l.8 2.2L22 19l-2.2.8L19 22l-.8-2.2L16 19l2.2-.8z',
  grip: 'M9 6h.01M15 6h.01M9 12h.01M15 12h.01M9 18h.01M15 18h.01', up: 'M6 15l6-6 6 6', down: 'M6 9l6 6 6-6', folder: 'M3 6a1 1 0 0 1 1-1h5l2 3h9a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1z',
  image: 'M4 4h16v16H4zM4 16l5-5 4 4 3-3 4 4M9 9h.01', note: 'M5 3h10l4 4v14H5zM14 3v5h5M8 13h8M8 17h5', heart: 'M12 20s-7-4.5-9-9a5 5 0 0 1 9-3 5 5 0 0 1 9 3c-2 4.5-9 9-9 9z',
};
export const icon = (name, size = 18) => { const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); s.setAttribute('viewBox', '0 0 24 24'); s.setAttribute('width', size); s.setAttribute('height', size); s.classList.add('ic'); s.innerHTML = `<path d="${I[name] || I.sparkle}" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/>`; return s; };
export const btn = (label, { ic, cls = '', onclick, title, type } = {}) => h(`button.btn${cls ? '.' + cls.split(' ').join('.') : ''}`, { onclick, title: title || (label ? null : ''), type: type || 'button' }, ic && icon(ic), label && h('span', label));
export const iconBtn = (ic, title, onclick, cls = '') => h(`button.ibtn${cls ? '.' + cls.split(' ').join('.') : ''}`, { title, 'aria-label': title, onclick, type: 'button' }, icon(ic));

// ── 오늘의 달 (실제 위상) ──
export function moonPhase(date = new Date()) {
  const p = (((date - Date.UTC(2000, 0, 6, 18, 14)) / 864e5 / 29.530588853) % 1 + 1) % 1;
  const name = ['삭', '초승달', '상현달', '차오르는 달', '보름달', '기우는 달', '하현달', '그믐달'][Math.round(p * 8) % 8];
  return { p, name };
}
export function moonIcon(size = 22, date) {
  const { p, name } = moonPhase(date); const waxing = p < 0.5; const rx = (10 * Math.abs(Math.cos(2 * Math.PI * p))).toFixed(2);
  const gibbous = p > 0.25 && p < 0.75;
  const lit = `M12 2 A10 10 0 0 ${waxing ? 1 : 0} 12 22 A${rx} 10 0 0 ${waxing ? (gibbous ? 1 : 0) : (gibbous ? 0 : 1)} 12 2Z`;
  const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); s.setAttribute('viewBox', '0 0 24 24'); s.setAttribute('width', size); s.setAttribute('height', size); s.classList.add('ic', 'moon');
  s.innerHTML = `<title>${name}</title><circle cx="12" cy="12" r="10" fill="currentColor" opacity=".22"/><path d="${lit}" fill="currentColor"/>`;
  return s;
}
/** 화면 머리말: 작은 영문 꼬리표 + 제목 + 오른쪽 도구 */
export const pageHead = (eyebrow, title, ...side) => h('header.phead', h('div.phead-text', h('span.eyebrow', eyebrow), h('h1', title)), h('div.phead-side', side));

// ── 아바타 ──
const hue = s => { let n = 0; for (const c of String(s)) n = (n * 31 + c.charCodeAt(0)) % 360; return n; };
export function avatar(o, cls = '') {
  const el = h(`div.avatar${cls ? '.' + cls : ''}`);
  if (o?.avatar) el.style.backgroundImage = `url("${o.avatar}")`;
  else { el.textContent = (o?.name || '?').trim().slice(0, 1); el.style.background = `linear-gradient(135deg, hsl(${hue(o?.name)} 70% 72%), hsl(${(hue(o?.name) + 60) % 360} 70% 62%))`; }
  return el;
}

// ── 토스트 ──
export function toast(msg, kind = '') {
  const t = h(`div.toast${kind ? '.' + kind : ''}`, msg);
  document.getElementById('toasts').append(t);
  setTimeout(() => { t.classList.add('out'); setTimeout(() => t.remove(), 400); }, kind === 'err' ? 6000 : 2600);
}

// ── 모달 ──
export function modal({ title, body, actions = [], wide = false, onClose } = {}) {
  const close = () => { wrap.classList.add('out'); setTimeout(() => wrap.remove(), 180); onClose?.(); document.removeEventListener('keydown', key); };
  const key = e => { if (e.key === 'Escape' && wrap === document.getElementById('modals').lastElementChild) close(); };
  const wrap = h('div.modal-wrap', { onmousedown: e => { if (e.target === wrap) close(); } },
    h(`div.modal${wide ? '.wide' : ''}`, { role: 'dialog', 'aria-modal': 'true' },
      h('header.modal-head', h('h2', title || ''), iconBtn('x', '닫기', close)),
      h('div.modal-body', body),
      actions.length ? h('footer.modal-foot', actions.map(a => btn(a.label, { ic: a.ic, cls: a.cls || '', onclick: async () => { if ((await a.onclick?.()) !== false) close(); } }))) : null));
  document.getElementById('modals').append(wrap);
  document.addEventListener('keydown', key);
  setTimeout(() => wrap.querySelector('input,textarea,select')?.focus(), 60);
  return { close, el: wrap };
}
export const confirmBox = (msg, okLabel = '확인', danger = false) => new Promise(res => {
  let done = false;
  modal({ title: msg, body: h('div'), onClose: () => { if (!done) res(false); }, actions: [{ label: '취소' }, { label: okLabel, cls: danger ? 'danger' : 'primary', onclick: () => { done = true; res(true); } }] });
});
export const promptBox = (title, value = '', { area = false, placeholder = '' } = {}) => new Promise(res => {
  let done = false;
  const inp = h(area ? 'textarea.inp' : 'input.inp', { value, placeholder, rows: 6 });
  const m = modal({ title, body: inp, onClose: () => { if (!done) res(null); }, actions: [{ label: '취소' }, { label: '확인', cls: 'primary', onclick: () => { done = true; res(inp.value); } }] });
  if (!area) inp.addEventListener('keydown', e => { if (e.key === 'Enter') { done = true; res(inp.value); m.close(); } });
});

// ── 캐릭터 고르기: 많아져도 찾을 수 있게 검색 + 목록 ──
export function charPicker({ title = '캐릭터 고르기', selected = [], multi = true, note = () => '', onDone }) {
  const picked = new Set(selected); let q = '';
  const list = h('div.picker-list'), count = h('small.hint');
  const draw = () => {
    const t = q.trim().toLowerCase();
    const rows = S.chars.filter(c => !t || (c.name + ' ' + (c.tags || []).join(' ')).toLowerCase().includes(t)).sort((a, b) => picked.has(b.id) - picked.has(a.id) || a.name.localeCompare(b.name, 'ko'));
    count.textContent = multi ? `${picked.size}명 선택 · 전체 ${S.chars.length}명` : `전체 ${S.chars.length}명`;
    list.replaceChildren(...rows.slice(0, 200).map(c => h(`button.picker-row${picked.has(c.id) ? '.on' : ''}`, { onclick: () => { if (!multi) { box.close(); return onDone([c.id]); } picked.has(c.id) ? picked.delete(c.id) : picked.add(c.id); draw(); } },
      avatar(c, 'sm'), h('div.picker-text', h('b', c.name), h('small', [note(c), (c.tags || []).slice(0, 3).map(x => '#' + x).join(' ')].filter(Boolean).join(' · ') || ' ')), multi && h('i.picker-check', icon('check', 14)))),
      !rows.length && h('p.dim', '찾는 캐릭터가 없어요.'), rows.length > 200 && h('p.dim', '검색어를 더 넣어 좁혀 주세요.'));
  };
  const search = h('input.inp.search', { placeholder: '이름이나 태그로 찾기', oninput: e => { q = e.target.value; draw(); } });
  const box = modal({ title, body: h('div.col', search, count, list), actions: multi ? [{ label: '취소' }, { label: '확인', cls: 'primary', onclick: () => onDone([...picked]) }] : [] });
  draw(); return box;
}

// ── 팝업 메뉴 ──
export function menu(anchor, items) {
  document.querySelector('.menu')?.remove();
  const el = h('div.menu', items.filter(Boolean).map(it => it === '-' ? h('hr') : h(`button.menu-item${it.danger ? '.danger' : ''}`, { onclick: () => { el.remove(); it.onclick(); } }, it.ic && icon(it.ic, 16), h('span', it.label), it.hint && h('small', it.hint))));
  document.body.append(el);
  const r = anchor.getBoundingClientRect(), w = el.offsetWidth, hh = el.offsetHeight;
  el.style.left = Math.max(8, Math.min(innerWidth - w - 8, r.left)) + 'px';
  el.style.top = (r.bottom + hh + 8 > innerHeight ? Math.max(8, r.top - hh - 6) : r.bottom + 6) + 'px';
  const off = e => { if (!el.contains(e.target)) { el.remove(); document.removeEventListener('mousedown', off, true); } };
  setTimeout(() => document.addEventListener('mousedown', off, true));
}

// ── 폼 ──
const getPath = (o, p) => p.split('.').reduce((a, k) => a?.[k], o);
const setPath = (o, p, v) => { const ks = p.split('.'); const last = ks.pop(); ks.reduce((a, k) => a[k] ||= {}, o)[last] = v; };
/** defs: [{k, label, type: text|area|num|check|select|tags|image|range|lines, hint, opts, ...}] */
/** 설명 보기 단추: 누르면 그 항목의 설명(.tip-text)이 펼쳐진다 */
export const tipBtn = () => h('button.tip', { type: 'button', title: '설명 보기', 'aria-label': '설명 보기', onclick: e => { e.preventDefault(); e.stopPropagation(); e.currentTarget.closest('.check, .field')?.classList.toggle('tip-open'); } }, '?');
// 폼 밖에서 직접 만든 체크 항목의 긴 설명도 같은 단추 뒤로 접는다 (짧은 꼬리표는 그대로 둔다)
const tipify = el => { for (const s of el.querySelectorAll?.('label.check > small:not(.tip-text)') || []) { if (s.closest('.checks, .lore-picklist') || s.textContent.trim().length < 16 || s.parentElement.querySelector(':scope > .tip')) continue; s.classList.add('tip-text'); s.before(tipBtn()); } };
new MutationObserver(list => { for (const m of list) for (const n of m.addedNodes) if (n.nodeType === 1) tipify(n.parentElement || n); }).observe(document.documentElement, { childList: true, subtree: true });

export function form(obj, defs, onChange = () => { }) {
  const fire = debounce(() => onChange(obj), 250);
  const row = d => {
    if (d.section) return h('h3.form-sec', d.section);
    if (d.el) return d.el;
    const v = getPath(obj, d.k);
    const set = val => { setPath(obj, d.k, val); d.live ? onChange(obj) : fire(); };
    let ctl;
    switch (d.type) {
      case 'area': ctl = h('textarea.inp', { value: v ?? '', rows: d.rows || 4, placeholder: d.ph || '', spellcheck: false, oninput: e => set(e.target.value) }); break;
      case 'num': ctl = h('input.inp', { type: 'number', value: v ?? '', min: d.min, max: d.max, step: d.step ?? 'any', placeholder: d.ph || '', oninput: e => set(e.target.value === '' ? (d.nullable ? null : 0) : +e.target.value) }); break;
      case 'check': return h('label.check', h('input', { type: 'checkbox', checked: !!v, onchange: e => set(e.target.checked) }), h('i'), h('span', d.label), d.hint && tipBtn(), d.hint && h('small.tip-text', d.hint));
      case 'select': ctl = h('select.inp', { onchange: e => set(e.target.value) }, d.opts.map(o => { const [val, lab] = Array.isArray(o) ? o : [o, o]; return h('option', { value: val, selected: String(v ?? '') === String(val) }, lab); })); break;
      case 'tags': ctl = h('input.inp', { value: (v || []).join(', '), placeholder: d.ph || '쉼표로 구분', oninput: e => set(e.target.value.split(',').map(s => s.trim()).filter(Boolean)) }); break;
      case 'lines': ctl = h('textarea.inp', { value: (v || []).join('\n'), rows: d.rows || 3, placeholder: d.ph || '한 줄에 하나씩', oninput: e => set(e.target.value.split('\n').map(s => s.trim()).filter(Boolean)) }); break;
      case 'range': { const out = h('output', String(v ?? d.min)); ctl = h('div.range', h('input', { type: 'range', min: d.min, max: d.max, step: d.step || 1, value: v ?? d.min, oninput: e => { out.textContent = e.target.value; set(+e.target.value); } }), out); break; }
      case 'color': { const pick = h('input', { type: 'color', value: /^#[0-9a-f]{6}$/i.test(v || '') ? v : '#888888' }); const txt = h('input.inp', { value: v ?? '', placeholder: '#rrggbb', spellcheck: false }); pick.addEventListener('input', () => { txt.value = pick.value; set(pick.value); }); txt.addEventListener('input', () => { if (/^#[0-9a-f]{6}$/i.test(txt.value)) pick.value = txt.value; set(txt.value.trim()); }); ctl = h('div.color-field', pick, txt); break; }
      case 'image': {
        const prev = h('div.img-pick', { style: v ? { backgroundImage: `url("${v}")` } : {} }, v ? null : icon('image', 26));
        const pick = async () => { const [f] = await pickFiles({ accept: 'image/*' }); if (!f) return; const url = await shrinkImage(await readDataURL(f), d.max || 720); prev.style.backgroundImage = `url("${url}")`; prev.textContent = ''; set(url); };
        ctl = h('div.img-row', prev, h('div.col', btn('이미지 선택', { ic: 'upload', onclick: pick }), btn('지우기', { cls: 'ghost', onclick: () => { prev.style.backgroundImage = ''; set(''); } })));
        break;
      }
      default: ctl = h('input.inp', { type: d.type === 'password' ? 'password' : 'text', value: v ?? '', placeholder: d.ph || '', autocomplete: 'off', spellcheck: false, oninput: e => set(e.target.value) });
    }
    return h(`label.field${d.half ? '.half' : ''}${d.third ? '.third' : ''}`, h('span.field-label', d.label, d.hint && tipBtn(), d.count && h('em.tok', { dataset: { for: d.k } })), ctl, d.hint && h('small.hint.tip-text', d.hint));
  };
  return h('div.form', defs.filter(Boolean).map(row));
}

// ── 페이지 라우터 ──
const pages = {};
export const route = { page: '', arg: null };
export const registerPage = (name, render) => { pages[name] = render; };
export function go(page, arg, fromHistory) {
  if (!pages[page]) page = 'home';
  if (!fromHistory) try {   // 뒤로 가기가 앱 밖으로 나가지 않고 앞 화면으로 돌아가게 기록해 둔다 (같은 화면을 다시 그릴 때는 쌓지 않는다)
    const st = history.state, next = { dl: 1, page, arg: arg ?? null };
    if (st?.dl !== 1) history.replaceState(next, ''); else if (st.page !== page || st.arg !== next.arg) history.pushState(next, '');
  } catch { }
  route.page = page; route.arg = arg;
  const root = document.getElementById('page');
  root.className = 'page-' + page; root.replaceChildren();
  document.querySelectorAll('#rail [data-page]').forEach(b => b.classList.toggle('on', b.dataset.page === page));
  pages[page](root, arg);
  S.set({ lastPage: page });
  emit('route', page);
}
export const refresh = () => go(route.page, route.arg);

/** 목록 + 편집기 2단 페이지 */
export function libraryPage(root, { title, eyebrow, coll, ic, create, label, sub, thumb, trail, note, editor, actions = [], empty }) {
  let current = route.arg || S[coll][0]?.id;
  const listEl = h('div.lib-list'), edEl = h('div.lib-editor'), noteEl = note ? h('div.lib-note') : null;
  const drawList = () => {
    noteEl?.replaceChildren(note());
    const row = (o, item) => trail ? h(`div.lib-row${o.id === current ? '.on' : ''}`, item, trail(o, drawList)) : item;   // 목록에서 바로 누르는 스위치 자리
    listEl.replaceChildren(...S[coll].map(o => row(o, h(`button.lib-item${o.id === current ? '.on' : ''}${thumb ? '.has-thumb' : ''}`, { onclick: () => { current = o.id; route.arg = o.id; wrap.classList.add('show-editor'); draw(); } },
      thumb && thumb(o), h('div.lib-text', h('b', label(o)), sub && h('small', sub(o)))))));
  };
  const draw = () => {
    drawList();
    const o = S.get(coll, current);
    edEl.replaceChildren(btn('목록으로', { ic: 'left', cls: 'ghost lib-back', onclick: () => wrap.classList.remove('show-editor') }), o ? editor(o, { redraw: drawList, save: () => S.save(coll, o, true), reselect: id => { current = id; draw(); } }) : h('div.empty', icon(ic, 34), h('p', empty || '왼쪽에서 항목을 고르거나 새로 만들어 보세요.')));
  };
  const wrap = h('section.lib',
    h('aside.lib-side', h('header.lib-head', h('div.phead-text', h('span.eyebrow', `${eyebrow || coll} · ${String(S[coll].length).padStart(2, '0')}`), h('h1', title)), h('div.row', actions.map(a => iconBtn(a.ic, a.title, () => a.onclick(draw))), iconBtn('plus', '새로 만들기', async () => { const o = create(); await S.save(coll, o, true); current = o.id; route.arg = o.id; wrap.classList.add('show-editor'); draw(); }, 'accent'))), noteEl, listEl),
    edEl);
  if (route.arg) wrap.classList.add('show-editor');
  root.append(wrap);
  draw();
  return draw;
}

export const tokBadge = n => h('span.tokbadge', `≈${n.toLocaleString()} 토큰`);

addEventListener('popstate', e => {
  const st = e.state; if (st?.dl !== 1) return;
  for (const m of document.querySelectorAll('.modal-wrap')) { const x = m.querySelector('button[title="닫기"]'); if (x) x.click(); else m.remove(); }
  go(st.page, st.arg ?? undefined, true);
});

/** 손잡이를 잡고 끌어서 목록 순서 바꾸기. 손잡이(handle)를 누른 채 위아래로 끌면 onMove(원래 자리, 새 자리) 를 부른다 */
export function dragSort(listEl, onMove, handle = '.grip') {
  listEl.addEventListener('pointerdown', e => {
    const hd = e.target.closest(handle); if (!hd || !listEl.contains(hd) || e.button > 0) return;
    const rows = [...listEl.children], row = rows.find(r => r.contains(hd)), from = rows.indexOf(row); if (from < 0 || rows.length < 2) return;
    e.preventDefault();
    const box = rows.map(r => r.getBoundingClientRect()), me = box[from], step = me.height + (box[1].top - box[0].bottom);
    let scroller = listEl.parentElement; while (scroller && !/(auto|scroll)/.test(getComputedStyle(scroller).overflowY)) scroller = scroller.parentElement;
    const scroll0 = scroller ? scroller.scrollTop : 0, startY = e.clientY; let lastY = startY, to = from, raf = 0;
    const place = () => {
      const dy = lastY - startY + ((scroller ? scroller.scrollTop : 0) - scroll0), mid = me.top + me.height / 2 + dy; let n = from;
      row.style.transform = `translateY(${dy}px)`;
      rows.forEach((r, i) => { if (i === from) return; const c = box[i].top + box[i].height / 2, down = i > from && mid > c, up = i < from && mid < c; n += down ? 1 : up ? -1 : 0; r.style.transform = down ? `translateY(${-step}px)` : up ? `translateY(${step}px)` : ''; });
      to = n;
    };
    const tick = () => {   // 가장자리 가까이 끌면 목록이 따라 움직인다
      raf = 0; if (!scroller) return; const b = scroller.getBoundingClientRect(), edge = 56;
      const v = lastY < b.top + edge ? -Math.ceil((b.top + edge - lastY) / 5) : lastY > b.bottom - edge ? Math.ceil((lastY - (b.bottom - edge)) / 5) : 0;
      if (!v) return; const was = scroller.scrollTop; scroller.scrollTop += Math.max(-18, Math.min(18, v)); if (scroller.scrollTop !== was) { place(); raf = requestAnimationFrame(tick); }
    };
    const move = ev => { lastY = ev.clientY; place(); if (!raf) raf = requestAnimationFrame(tick); };
    const end = ev => {
      hd.removeEventListener('pointermove', move); hd.removeEventListener('pointerup', end); hd.removeEventListener('pointercancel', end); cancelAnimationFrame(raf);
      listEl.classList.remove('sorting'); rows.forEach(r => { r.style.transform = ''; r.classList.remove('dragging'); });
      if (ev.type === 'pointerup' && to !== from) onMove(from, to);
    };
    try { hd.setPointerCapture(e.pointerId); } catch { }
    listEl.classList.add('sorting'); row.classList.add('dragging');
    hd.addEventListener('pointermove', move); hd.addEventListener('pointerup', end); hd.addEventListener('pointercancel', end);
  });
}
