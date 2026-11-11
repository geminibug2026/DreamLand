// ── Dreamland f-presetvars: 프리셋 변수 — 프리셋에 정의하고, 대화방마다 값을 고른다 ──
// 블록 안에서는 {{var::이름}} 과 {{#if 이름}}…{{else}}…{{/if}} 로 쓴다. 계산은 js/cond.js · js/engine.js(macro).
import { S, h, uid, debounce } from './core.js';
import { icon, btn, iconBtn, toast, menu, modal, form, go } from './ui.js';
import { X } from './hooks.js';
import { PV_TYPES, pvName, pvDefs, pvDefault, pvCoerce, usedVars } from './cond.js';

if (!document.querySelector('link[data-quick-css]')) document.head.append(h('link', { rel: 'stylesheet', href: 'css/quick.css', dataset: { quickCss: '1' } }));

const newVar = (type = 'select', n = 1) => ({ id: uid(), name: `변수${n}`, label: '', hint: '', type, default: type === 'toggle' ? false : type === 'slider' ? 3 : type === 'select' ? '보통' : '',
  options: [{ label: '보통', value: '' }, { label: '다르게', value: '' }], min: 1, max: 5, step: 1, onText: '', offText: '' });

const COND_HELP = [
  ['{{#if 이름}} … {{/if}}', '토글이 켜져 있거나 값이 비어 있지 않을 때만 넣습니다'], ['{{#if 이름 == "선택지"}}', '고른 선택지(이름 또는 그 글)로 가릅니다 · != 도 됩니다'],
  ['{{#if 길이 >= 3 && !수위}}', '숫자 비교 > < >= <= · 그리고 && · 또는 || · 아님 ! · 괄호'], ['{{else if …}} · {{else}}', '위에서부터 처음 맞는 갈래 하나만 남습니다'],
  ['{{#if 이름 contains "글"}}', '글이 들어 있는지 · not contains 는 반대'], ['char == "이름" · mode == talk', '쓸 수 있는 낱말: char user group persona scenario description personality model input mode(rp · talk) type(normal · continue · regen · impersonate)'],
  ['{{#if 호감도 > 50}}', '대화 변수(장면 패널의 변수) · 전역 변수도 이름 그대로 견줄 수 있습니다'], ['{{#unless 이름}} … {{/unless}}', '반대로: 꺼져 있거나 비어 있을 때'],
  ['블록의 "조건" 칸', '블록 하나를 통째로 넣고 뺄 때는 블록을 펼쳐 조건 칸에 식만 적습니다 (중괄호 없이)'],
];
/** 변수 하나의 입력 칸. get() 으로 지금 값을 읽고 set(v) 로 알린다 */
function control(d, get, set) {
  const v = pvCoerce(d, get());
  if (d.type === 'toggle') { const lab = h('span', v ? '켬' : '끔'); return h('label.pv-toggle', h('span.switch', h('input', { type: 'checkbox', checked: v, onchange: e => { lab.textContent = e.target.checked ? '켬' : '끔'; set(e.target.checked); } }), h('i')), lab); }
  if (d.type === 'slider') { const out = h('output', String(v)); return h('div.range', h('input', { type: 'range', min: d.min ?? 0, max: d.max ?? 100, step: d.step || 1, value: v, oninput: e => { out.textContent = e.target.value; set(+e.target.value); } }), out); }
  if (d.type === 'select') {
    const opts = d.options || [];
    if (opts.length <= 5 && opts.reduce((n, o) => n + o.label.length, 0) <= 26) { const box = h('div.pv-seg'); const draw = cur => box.replaceChildren(...opts.map(o => h(`button${o.label === cur ? '.on' : ''}`, { type: 'button', onclick: () => { draw(o.label); set(o.label); } }, o.label))); draw(v); return box; }
    return h('select.inp', { onchange: e => set(e.target.value) }, opts.map(o => h('option', { value: o.label, selected: o.label === v }, o.label)));
  }
  return h('input.inp', { value: v, placeholder: d.hint || '', spellcheck: false, oninput: e => set(e.target.value) });
}
const row = (d, ctl, extra) => h('div.pv-row', h('div.pv-label', h('b', d.label || d.name), h('code', `{{var::${d.name}}}`), extra), ctl, d.hint && d.type !== 'text' ? h('small.hint', d.hint) : null);

/** 대화방의 값을 바꾼다 (명령에서도 쓴다). 고쳐진 값을 돌려준다 */
export function setPv(chat, name, value) {
  const preset = S.presetFor(chat), d = pvDefs(preset).find(x => x.name === name);
  if (!d) throw new Error(`"${name}" 이라는 프리셋 변수가 없어요`);
  const v = pvCoerce(d, value); ((chat.pvars ||= {})[preset.id] ||= {})[name] = v;
  S.save('chats', chat, true); return v;
}

/** 대화방별 값 고르기 (장면 패널) */
function chatPanel(chat) {
  const box = h('div.col.pv-panel');
  const draw = () => {
    const preset = S.presetFor(chat), defs = pvDefs(preset);
    if (!defs.length) return box.replaceChildren(h('p.dim', '지금 프리셋에는 변수가 없어요. 프리셋에 변수를 만들면 대화방마다 문체 · 길이 · 수위 같은 것을 여기서 바로 바꿀 수 있습니다.'), btn('프리셋에서 변수 만들기', { ic: 'sliders', cls: 'ghost', onclick: () => go('presets', preset.id) }));
    const mine = ((chat.pvars ||= {})[preset.id] ||= {});
    const saveChat = debounce(() => S.save('chats', chat, true), 250);
    const changed = () => defs.filter(d => mine[d.name] !== undefined && String(pvCoerce(d, mine[d.name])) !== String(pvDefault(d))).length;
    const note = h('small.hint');
    const mark = () => { const n = changed(); note.textContent = `${preset.name} · 이 대화방에만 적용${n ? ` · 기본값과 다른 값 ${n}개` : ''}`; };
    box.replaceChildren(note,
      ...defs.map(d => row(d, control(d, () => mine[d.name], v => { mine[d.name] = v; saveChat(); mark(); }))),
      h('div.row.wrap', btn('기본값으로', { cls: 'ghost', ic: 'refresh', onclick: () => { delete chat.pvars[preset.id]; S.save('chats', chat, true); draw(); } }), btn('변수 고치기', { cls: 'ghost', ic: 'edit', onclick: () => go('presets', preset.id) })),
      chat.mode === 'talk' ? h('small.hint', '대화 모드는 프리셋 블록 대신 대화 모드 지시문을 씁니다. 그 지시문 안에 적은 {{var::이름}} 에만 적용돼요.') : null);
    mark();
  };
  draw(); return box;
}
X.panels = X.panels.filter(p => p.owner !== 'presetvars');
X.panels.push({ owner: 'presetvars', id: 'presetvars', title: '프리셋 변수', icon: 'sliders', render: chat => chatPanel(chat) });

/** 프리셋 화면의 변수 정의 편집기 */
export function presetVarsEditor(p, sv) {
  p.vars = Array.isArray(p.vars) ? p.vars : [];
  const box = h('div.pv-editor'), open = new Set();
  const used = () => { const s = new Set(); for (const b of p.blocks || []) { for (const n of usedVars(b.content)) s.add(n); } for (const k of ['prefill', 'continueNudge', 'impersonatePrompt', 'groupNudge']) for (const n of usedVars(p.params?.[k])) s.add(n); return s; };
  const uniq = (name, self) => { let n = name || '변수', i = 2; while (p.vars.some(v => v !== self && v.name === n)) n = `${name}${i++}`; return n; };
  const draw = () => {
    const names = new Set(p.vars.map(v => v.name)), missing = [...used()].filter(n => !names.has(n));
    box.replaceChildren(
      h('p.hint', '프리셋을 쓰는 사람이 고르는 값입니다. 블록 안에 ', h('code', '{{var::이름}}'), ' 을 적으면 고른 값이 들어가고, ', h('code', '{{#if 이름}}…{{else}}…{{/if}}'), ' 로 글을 통째로 넣거나 뺄 수 있어요. 값은 대화 화면의 장면 패널에서 대화방마다 따로 고릅니다. 추가 호출은 없습니다.'),
      missing.length ? h('div.pv-missing', h('span', '블록에서 쓰이지만 아직 없는 변수'), missing.map(n => h('button.chip', { type: 'button', title: '이 이름으로 변수 만들기', onclick: () => { const v = newVar('text', p.vars.length + 1); v.name = pvName(n) || v.name; p.vars.push(v); open.add(v.id); sv(); draw(); } }, n, ' +'))) : null,
      ...p.vars.map((v, i) => card(v, i)),
      h('div.row.wrap', btn('변수 추가', { ic: 'plus', cls: 'ghost', onclick: e => menu(e.currentTarget, Object.entries(PV_TYPES).map(([t, l]) => ({ label: l, hint: { select: '여러 개 중 하나', slider: '숫자 범위', toggle: '켬 / 끔', text: '직접 적는 한 줄' }[t], onclick: () => { const v = newVar(t, p.vars.length + 1); v.name = uniq(v.name); p.vars.push(v); open.add(v.id); sv(); draw(); } }))) }),
        btn('조건식 쓰는 법', { ic: 'note', cls: 'ghost', onclick: () => modal({ title: '조건식 쓰는 법', body: h('div.help', COND_HELP.map(([c, d]) => h('div.help-row', h('code', c), h('span', d)))) }) })));
  };
  const card = (v, i) => {
    const isOpen = open.has(v.id);
    const el = h(`div.block.pv-card${isOpen ? '.open' : ''}`,
      h('div.block-head', { onclick: e => { if (e.target.closest('button')) return; isOpen ? open.delete(v.id) : open.add(v.id); draw(); } },
        h('div.col.move', iconBtn('up', '위로', () => { if (i > 0) { [p.vars[i - 1], p.vars[i]] = [p.vars[i], p.vars[i - 1]]; sv(); draw(); } }, 'tiny'), iconBtn('down', '아래로', () => { if (i < p.vars.length - 1) { [p.vars[i + 1], p.vars[i]] = [p.vars[i], p.vars[i + 1]]; sv(); draw(); } }, 'tiny')),
        icon('sliders', 15), h('b', v.label || v.name), h('code.pv-code', `{{var::${v.name}}}`), h('em.badge', PV_TYPES[v.type] || '짧은 글'),
        h('span.tokbadge', v.type === 'select' ? `${(v.options || []).length}개 중 ${pvDefault(v) || '—'}` : v.type === 'toggle' ? (pvDefault(v) ? '기본 켬' : '기본 끔') : `기본 ${pvDefault(v) === '' ? '비어 있음' : pvDefault(v)}`),
        iconBtn('trash', '변수 삭제', () => { p.vars.splice(i, 1); sv(); draw(); }, 'tiny')));
    if (!isOpen) return el;
    const body = h('div.block-body');
    const head = form(v, [{ k: 'name', label: '이름 (블록에서 부를 때)', half: true, hint: '글자 · 숫자 · 밑줄만. 띄어쓰기는 밑줄로 바뀝니다.' }, { k: 'label', label: '화면에 보일 이름', half: true, ph: '예: 답변 길이' },
      { k: 'type', label: '종류', type: 'select', opts: Object.entries(PV_TYPES), half: true }, { k: 'hint', label: '도움말', half: true, ph: '고를 때 아래에 작게 보입니다' }],
    () => { const n = uniq(pvName(v.name) || '변수', v); const typeChanged = v.type !== shownType; v.name = n; if (typeChanged) { v.default = v.type === 'toggle' ? false : v.type === 'slider' ? (Number(v.min) || 0) : v.type === 'select' ? (v.options?.[0]?.label || '') : ''; } sv(); if (typeChanged) draw(); else el.querySelector('.block-head b').textContent = v.label || v.name, el.querySelector('.pv-code').textContent = `{{var::${v.name}}}`; });
    const shownType = v.type;
    body.append(head);
    if (v.type === 'select') {
      v.options = Array.isArray(v.options) && v.options.length ? v.options : [{ label: '보통', value: '' }];
      const list = h('div.pv-opts');
      const drawOpts = () => list.replaceChildren(
        h('div.pv-opt.pv-opt-head', h('span', '기본'), h('span', '선택지 이름'), h('span', '프롬프트에 들어갈 글 (비우면 아무것도 넣지 않음)'), h('span')),
        ...v.options.map((o, k) => h('div.pv-opt',
          h('label.pv-radio', { title: '기본값으로' }, h('input', { type: 'radio', name: 'pvd-' + v.id, checked: pvDefault(v) === o.label, onchange: () => { v.default = o.label; sv(); } }), h('i')),
          h('input.inp', { value: o.label, placeholder: '이름', oninput: e => { const was = o.label; o.label = e.target.value; if (v.default === was) v.default = o.label; sv(); } }),
          h('textarea.inp', { value: o.value ?? '', rows: 2, placeholder: '{{var::' + v.name + '}} 자리에 들어갈 글', spellcheck: false, oninput: e => { o.value = e.target.value; sv(); } }),
          iconBtn('x', '선택지 지우기', () => { if (v.options.length < 2) return toast('선택지는 하나 이상 있어야 해요'); v.options.splice(k, 1); if (!v.options.some(x => x.label === v.default)) v.default = v.options[0].label; sv(); drawOpts(); }, 'tiny'))),
        btn('선택지 추가', { ic: 'plus', cls: 'ghost', onclick: () => { v.options.push({ label: `선택지 ${v.options.length + 1}`, value: '' }); sv(); drawOpts(); } }));
      drawOpts(); body.append(list, h('small.hint', `조건에서는 선택지 이름으로 견줍니다: {{#if ${v.name} == "${v.options[0].label}"}} … {{/if}}`));
    } else if (v.type === 'slider') {
      const prev = h('div.pv-prev');
      const drawPrev = () => prev.replaceChildren(row(v, control(v, () => v.default, x => { v.default = x; sv(); }), h('em.badge', '기본값')));
      body.append(form(v, [{ k: 'min', label: '가장 작은 값', type: 'num', third: true }, { k: 'max', label: '가장 큰 값', type: 'num', third: true }, { k: 'step', label: '한 칸', type: 'num', third: true }], () => { if (Number(v.max) < Number(v.min)) v.max = v.min; v.default = pvCoerce(v, v.default); sv(); drawPrev(); }), prev,
        h('small.hint', `숫자 그대로 들어갑니다. 조건 예: {{#if ${v.name} >= ${v.max ?? 5}}} … {{/if}}`));
      drawPrev();
    } else if (v.type === 'toggle') {
      body.append(form(v, [{ k: 'default', label: '처음에는 켜 두기', type: 'check' }, { k: 'onText', label: '켰을 때 들어갈 글', type: 'area', rows: 2, ph: '비우면 true', half: true }, { k: 'offText', label: '껐을 때 들어갈 글', type: 'area', rows: 2, ph: '비우면 아무것도 넣지 않음', half: true }], () => { sv(); el.querySelector('.tokbadge').textContent = v.default ? '기본 켬' : '기본 끔'; }),
        h('small.hint', `글을 통째로 넣고 빼려면: {{#if ${v.name}}} 켰을 때만 들어갈 글 {{else}} 껐을 때 {{/if}}`));
    } else {
      body.append(form(v, [{ k: 'default', label: '기본값', ph: '비워 둘 수 있어요' }], () => { sv(); }), h('small.hint', `비어 있는지 볼 때: {{#if ${v.name}}} … {{var::${v.name}}} … {{/if}}`));
    }
    el.append(body);
    return el;
  };
  draw();
  return box;
}
