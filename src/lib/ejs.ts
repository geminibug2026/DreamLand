// 프롬프트 템플릿 <% … %>: 로어북 · 프리셋 글 안의 조건문과 값 넣기를 처리한다.
//   <% if (getGlobalVar('X') === 'Y') { %> … <% } else { %> … <% } %>     <% const n = Math.floor(Math.random() * 20) + 1; %>     <%- n %>  <%= n %>
// 카드에 든 글은 믿을 수 없으므로 자바스크립트를 실제로 실행하지 않는다. 아래의 작은 해석기가 아는 식만 계산하고,
// 모르는 문장이 하나라도 있으면 템플릿 표시만 걷어 내고 글은 그대로 둔다.

export interface EjsEnv { getvar(name: string): unknown; getGlobalVar(name: string): unknown; setvar?(name: string, v: unknown): void; setGlobalVar?(name: string, v: unknown): void }
type Tok = { t: 'num' | 'str' | 'id' | 'op'; v: string };

function lex(src: string): Tok[] {
  const out: Tok[] = []; let i = 0;
  while (i < src.length) {
    const ch = src[i];
    if (/\s/.test(ch)) { i++; continue; }
    if (src.startsWith('//', i)) { while (i < src.length && src[i] !== '\n') i++; continue; }
    if (src.startsWith('/*', i)) { const e = src.indexOf('*/', i + 2); i = e < 0 ? src.length : e + 2; continue; }
    if (ch === '"' || ch === "'" || ch === '`') { let s = ''; i++; while (i < src.length && src[i] !== ch) { if (src[i] === '\\' && i + 1 < src.length) { const n = src[++i]; s += n === 'n' ? '\n' : n === 't' ? '\t' : n; } else { if (ch === '`' && src[i] === '$' && src[i + 1] === '{') throw new Error('template literal'); s += src[i]; } i++; } if (src[i] !== ch) throw new Error('unterminated string'); i++; out.push({ t: 'str', v: s }); continue; }
    const num = /^\d+(\.\d+)?/.exec(src.slice(i)); if (num) { out.push({ t: 'num', v: num[0] }); i += num[0].length; continue; }
    const id = /^[A-Za-z_$¡-￿][\w$¡-￿]*/.exec(src.slice(i)); if (id) { out.push({ t: 'id', v: id[0] }); i += id[0].length; continue; }
    const op = /^(===|!==|==|!=|<=|>=|&&|\|\||\?\?|[-+*/%<>!()=,.;?:{}[\]])/.exec(src.slice(i)); if (op) { out.push({ t: 'op', v: op[0] }); i += op[0].length; continue; }
    throw new Error('unexpected ' + ch);
  }
  return out;
}

const METHODS: Record<string, (self: unknown, a: unknown[]) => unknown> = {
  trim: s => String(s ?? '').trim(), toLowerCase: s => String(s ?? '').toLowerCase(), toUpperCase: s => String(s ?? '').toUpperCase(),
  includes: (s, a) => Array.isArray(s) ? s.includes(a[0]) : String(s ?? '').includes(String(a[0] ?? '')), startsWith: (s, a) => String(s ?? '').startsWith(String(a[0] ?? '')), endsWith: (s, a) => String(s ?? '').endsWith(String(a[0] ?? '')),
  split: (s, a) => String(s ?? '').split(String(a[0] ?? '')), join: (s, a) => Array.isArray(s) ? s.join(String(a[0] ?? ',')) : String(s ?? ''), toString: (s: unknown) => String(s ?? ''), toFixed: (s, a) => Number(s).toFixed(Number(a[0]) || 0),
};
const MATH: Record<string, (...a: number[]) => number> = { floor: Math.floor, ceil: Math.ceil, round: Math.round, random: Math.random, min: Math.min, max: Math.max, abs: Math.abs };

class Calc {
  i = 0; toks: Tok[]; scope: Record<string, unknown>; env: EjsEnv;
  constructor(toks: Tok[], scope: Record<string, unknown>, env: EjsEnv) { this.toks = toks; this.scope = scope; this.env = env; }
  peek(v?: string) { const t = this.toks[this.i]; return v === undefined ? t : (t && t.t === 'op' && t.v === v ? t : undefined); }
  eat(v: string) { if (!this.peek(v)) throw new Error('expected ' + v); this.i++; }
  done() { return this.i >= this.toks.length; }
  expr(): unknown { return this.ternary(); }
  ternary(): unknown { const c = this.or(); if (this.peek('?')) { this.i++; const a = this.ternary(); this.eat(':'); const b = this.ternary(); return c ? a : b; } return c; }
  or(): unknown { let v = this.and(); for (;;) { if (this.peek('||')) { this.i++; const r = this.and(); v = v || r; } else if (this.peek('??')) { this.i++; const r = this.and(); v = v ?? r; } else return v; } }
  and(): unknown { let v = this.cmp(); while (this.peek('&&')) { this.i++; const r = this.cmp(); v = v && r; } return v; }
  cmp(): unknown {
    let v = this.add();
    for (;;) {
      const t = this.toks[this.i]; if (!t || t.t !== 'op' || !['===', '!==', '==', '!=', '<', '>', '<=', '>='].includes(t.v)) return v;
      this.i++; const r = this.add(), a = v as never, b = r as never;
      // eslint-disable-next-line eqeqeq
      v = t.v === '===' ? v === r : t.v === '!==' ? v !== r : t.v === '==' ? a == b : t.v === '!=' ? a != b : t.v === '<' ? a < b : t.v === '>' ? a > b : t.v === '<=' ? a <= b : a >= b;
    }
  }
  add(): unknown { let v = this.mul(); for (;;) { if (this.peek('+')) { this.i++; const r = this.mul(); v = typeof v === 'number' && typeof r === 'number' ? v + r : String(v ?? '') + String(r ?? ''); } else if (this.peek('-')) { this.i++; v = Number(v) - Number(this.mul()); } else return v; } }
  mul(): unknown { let v = this.unary(); for (;;) { if (this.peek('*')) { this.i++; v = Number(v) * Number(this.unary()); } else if (this.peek('/')) { this.i++; v = Number(v) / Number(this.unary()); } else if (this.peek('%')) { this.i++; v = Number(v) % Number(this.unary()); } else return v; } }
  unary(): unknown { if (this.peek('!')) { this.i++; return !this.unary(); } if (this.peek('-')) { this.i++; return -Number(this.unary()); } if (this.peek('+')) { this.i++; return Number(this.unary()); } return this.post(); }
  args(): unknown[] { const a: unknown[] = []; this.eat('('); while (!this.peek(')')) { a.push(this.expr()); if (this.peek(',')) this.i++; } this.eat(')'); return a; }
  post(): unknown {
    let v = this.prim();
    for (;;) {
      if (this.peek('.')) {
        this.i++; const name = this.toks[this.i++]; if (!name || name.t !== 'id') throw new Error('member');
        if (this.peek('(')) { const fn = METHODS[name.v]; if (!fn) throw new Error('method ' + name.v); v = fn(v, this.args()); }
        else if (name.v === 'length') v = Array.isArray(v) ? v.length : String(v ?? '').length;
        else throw new Error('property ' + name.v);
      } else if (this.peek('[')) { this.i++; const k = this.expr(); this.eat(']'); v = Array.isArray(v) ? v[Number(k)] : typeof v === 'string' ? v[Number(k)] : v && typeof v === 'object' && Object.prototype.hasOwnProperty.call(v, String(k)) ? (v as Record<string, unknown>)[String(k)] : undefined; }
      else return v;
    }
  }
  prim(): unknown {
    const t = this.toks[this.i++]; if (!t) throw new Error('end');
    if (t.t === 'num') return Number(t.v);
    if (t.t === 'str') return t.v;
    if (t.t === 'op' && t.v === '(') { const v = this.expr(); this.eat(')'); return v; }
    if (t.t === 'op' && t.v === '[') { const a: unknown[] = []; while (!this.peek(']')) { a.push(this.expr()); if (this.peek(',')) this.i++; } this.eat(']'); return a; }
    if (t.t !== 'id') throw new Error('unexpected ' + t.v);
    if (t.v === 'true') return true; if (t.v === 'false') return false; if (t.v === 'null') return null; if (t.v === 'undefined') return undefined;
    if (t.v === 'Math') { this.eat('.'); const n = this.toks[this.i++]; const fn = n && MATH[n.v]; if (!fn) throw new Error('Math.' + n?.v); return fn(...this.args().map(Number)); }
    if (this.peek('(')) {
      const a = this.args(), name = t.v.toLowerCase();
      if (name === 'getvar' || name === 'getlocalvar' || name === 'getchatvar' || name === 'getmessagevar') return this.env.getvar(String(a[0] ?? ''));
      if (name === 'getglobalvar') return this.env.getGlobalVar(String(a[0] ?? ''));
      if (name === 'setvar' || name === 'setlocalvar') { this.env.setvar?.(String(a[0] ?? ''), a[1]); return ''; }
      if (name === 'setglobalvar') { this.env.setGlobalVar?.(String(a[0] ?? ''), a[1]); return ''; }
      if (t.v === 'Number') return Number(a[0]); if (t.v === 'String') return String(a[0] ?? ''); if (t.v === 'parseInt') return parseInt(String(a[0]), Number(a[1]) || 10); if (t.v === 'parseFloat') return parseFloat(String(a[0])); if (t.v === 'Boolean') return !!a[0];
      throw new Error('function ' + t.v);
    }
    if (Object.prototype.hasOwnProperty.call(this.scope, t.v)) return this.scope[t.v];
    throw new Error('unknown ' + t.v);
  }
}

type Part = { text: string } | { code: string; out: boolean };
/** 글을 템플릿 조각으로 나눈다. -%> 는 뒤따르는 줄바꿈 하나를, <%_ 는 앞의 공백을 지운다 */
function split(text: string): Part[] {
  const parts: Part[] = []; const re = /<%([_=#-]?)([\s\S]*?)([-_]?)%>/g; let last = 0, m: RegExpExecArray | null, eatNl = false;
  const push = (t: string) => { if (eatNl) t = t.replace(/^[ \t]*\r?\n/, ''); eatNl = false; if (t) parts.push({ text: t }); };
  while ((m = re.exec(text))) {
    let before = text.slice(last, m.index); if (m[1] === '_') before = before.replace(/[ \t]+$/, '');
    push(before); last = re.lastIndex; eatNl = m[3] === '-' || m[3] === '_';
    if (m[1] === '#') continue;
    parts.push({ code: m[2], out: m[1] === '=' || m[1] === '-' });
  }
  push(text.slice(last));
  return parts;
}

/** 템플릿을 처리한 글. <% 가 없으면 그대로 돌려준다 */
export function ejs(text: string, env: EjsEnv): string {
  if (!text || text.indexOf('<%') < 0) return text;
  const parts = split(text);
  try {
    const scope: Record<string, unknown> = {};
    // 조건 묶음: 각 층은 { on: 지금 이 가지를 내보내는가, done: 이미 참인 가지가 있었는가, parent: 바깥이 켜져 있는가 }
    const stack: { on: boolean; done: boolean; parent: boolean }[] = []; let out = '';
    const live = () => stack.every(s => s.on);
    for (const p of parts) {
      if ('text' in p) { if (live()) out += p.text; continue; }
      const toks = lex(p.code);
      if (p.out) { if (live()) { const c = new Calc(toks, scope, env), v = c.expr(); if (!c.done()) throw new Error('trailing'); out += v == null ? '' : String(v); } continue; }
      let i = 0; const is = (k: number, v: string) => toks[k]?.v === v;
      while (i < toks.length) {
        if (is(i, ';')) { i++; continue; }
        if (is(i, '}')) {
          i++; const top = stack[stack.length - 1]; if (!top) throw new Error('unbalanced }');
          if (is(i, 'else')) {
            i++;
            if (is(i, 'if')) { i++; const end = closeParen(toks, i); const c = new Calc(toks.slice(i + 1, end), scope, env), v = top.parent && !top.done ? !!c.expr() : false; top.on = v; if (v) top.done = true; i = end + 1; }
            else { top.on = top.parent && !top.done; top.done = true; }
            if (!is(i, '{')) throw new Error('expected {'); i++;
          } else stack.pop();
          continue;
        }
        if (is(i, 'if')) {
          i++; const end = closeParen(toks, i), parent = live(); const v = parent ? !!new Calc(toks.slice(i + 1, end), scope, env).expr() : false;
          i = end + 1; if (!is(i, '{')) throw new Error('expected {'); i++;
          stack.push({ on: v, done: v, parent }); continue;
        }
        if (is(i, 'const') || is(i, 'let') || is(i, 'var')) {
          const name = toks[i + 1]; if (!name || name.t !== 'id' || !is(i + 2, '=')) throw new Error('declaration');
          let end = i + 3, depth = 0; for (; end < toks.length; end++) { const v = toks[end].v, t = toks[end].t; if (t === 'op' && (v === '(' || v === '[')) depth++; else if (t === 'op' && (v === ')' || v === ']')) depth--; else if (t === 'op' && v === ';' && depth === 0) break; }
          if (live()) { const c = new Calc(toks.slice(i + 3, end), scope, env); scope[name.v] = c.expr(); if (!c.done()) throw new Error('trailing'); }
          i = end + 1; continue;
        }
        // 값만 계산하고 버리는 문장 (setvar(...) 같은 것)
        let end = i, depth = 0; for (; end < toks.length; end++) { const v = toks[end].v, t = toks[end].t; if (t === 'op' && (v === '(' || v === '[')) depth++; else if (t === 'op' && (v === ')' || v === ']')) depth--; else if (t === 'op' && v === ';' && depth === 0) break; }
        if (live()) { const c = new Calc(toks.slice(i, end), scope, env); c.expr(); if (!c.done()) throw new Error('statement'); }
        i = end + 1;
      }
    }
    return out;
  } catch (e) {
    console.warn('[템플릿] 처리하지 못한 문장이 있어 표시만 걷어 냅니다:', (e as Error)?.message);
    return parts.map(p => 'text' in p ? p.text : '').join('');
  }
}
/** toks[at] 이 '(' 일 때 짝이 되는 ')' 의 자리 */
function closeParen(toks: Tok[], at: number): number {
  if (toks[at]?.v !== '(') throw new Error('expected (');
  let depth = 0; for (let k = at; k < toks.length; k++) { if (toks[k].t === 'op' && toks[k].v === '(') depth++; else if (toks[k].t === 'op' && toks[k].v === ')') { depth--; if (!depth) return k; } }
  throw new Error('unclosed (');
}
