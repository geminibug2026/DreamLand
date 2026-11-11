// ── Dreamland slash: 입력창에 / 를 치면 뜨는 명령어 목록 ──
import { h } from './core.js';

/**
 * input: 입력창(textarea), host: 목록을 붙일 곳(입력창을 감싼 상자), list(): [{ cmd, args, help, alias }] 를 돌려주는 함수.
 * 반드시 보내기 단축키보다 먼저 붙여야 한다 — 목록이 열려 있을 때의 Enter · Tab 은 명령어를 채워 넣는 데 쓴다.
 */
export function slashPopup(input, host, list) {
  const pop = h('div.slash-pop', { hidden: true, role: 'listbox' });
  let items = [], sel = 0, open = false;
  const token = () => { const v = input.value, caret = input.selectionStart ?? v.length; if (!v.startsWith('/')) return null; const sp = v.search(/\s/); return { word: (sp < 0 ? v : v.slice(0, sp)).toLowerCase(), typing: sp < 0 || caret <= sp, rest: sp < 0 ? '' : v.slice(sp + 1) }; };
  const close = () => { open = false; pop.hidden = true; };
  const fill = it => { input.value = it.cmd + ' '; input.dispatchEvent(new Event('input', { bubbles: true })); input.focus(); input.setSelectionRange(input.value.length, input.value.length); };
  const row = (it, i) => h(`button.slash-row${i === sel ? '.on' : ''}`, { type: 'button', role: 'option', onmousedown: e => { e.preventDefault(); fill(it); } },
    h('code', it.cmd), it.args ? h('i', it.args) : null, h('span', it.help || ''), it.alias?.length ? h('small', it.alias.join(' ')) : null);
  function draw() {
    const t = token(); if (!t) return close();
    const all = list();
    if (t.typing) {
      const q = t.word, hit = it => it.cmd.startsWith(q) || (it.alias || []).some(a => a.startsWith(q));
      items = [...all.filter(hit), ...all.filter(it => !hit(it) && q.length > 1 && (it.cmd.includes(q.slice(1)) || (it.help || '').includes(q.slice(1))))];
    } else items = all.filter(it => it.cmd === t.word || (it.alias || []).includes(t.word)).slice(0, 1);   // 명령어를 다 쳤으면 그 명령어의 쓰는 법만 남긴다
    if (!items.length) return close();
    if (!pop.isConnected) host.append(pop);
    sel = Math.min(sel, items.length - 1); open = true; pop.hidden = false;
    pop.classList.toggle('one', !t.typing);
    pop.replaceChildren(...items.map(row));
    pop.querySelector('.on')?.scrollIntoView({ block: 'nearest' });
  }
  input.addEventListener('input', () => { sel = 0; draw(); });
  input.addEventListener('click', draw);
  input.addEventListener('blur', () => setTimeout(close, 120));
  input.addEventListener('keydown', e => {
    if (!open || e.isComposing) return;
    const t = token(); if (!t) return close();
    if (e.key === 'Escape') { e.preventDefault(); e.stopImmediatePropagation(); return close(); }
    if (!t.typing) return;
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); e.stopImmediatePropagation(); sel = (sel + (e.key === 'ArrowDown' ? 1 : items.length - 1)) % items.length; return draw(); }
    const it = items[sel]; if (!it) return;
    if (e.key === 'Tab' || (e.key === 'Enter' && !e.shiftKey && t.word !== it.cmd && !(it.alias || []).includes(t.word))) { e.preventDefault(); e.stopImmediatePropagation(); fill(it); }
  });
  return { close, draw };
}
