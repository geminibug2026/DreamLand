// ── STscript 식: /= · /ife · /elseif · /whilee · /filter · /find · /sorte · /groupby · /swipes-del 이 받는 글 ──
// LALib(실리태번 확장)의 식 문법을 그대로 읽는다. 값 · 연산 · 대입의 뜻은 그쪽 설명서와 같게 맞췄다:
//   값      true false · '글' · 1.5 · -3 · [JSON 목록] · /정규식/깃발 · {매크로} (중괄호 하나) · 변수 이름 (x · x.0 · x.-1 · x.length · x*.name)
//   변수    범위 변수 → 대화 변수 → 전역 변수 순으로 찾고, 없으면 빈 글자. 글자가 JSON 이면 그 값으로 읽는다
//   연산    ! · ++x x++ --x x-- · ** * / // - + % · == === != !== < <= > >= <=> in · not in · starts with · ends with · is (string number boolean list dictionary closure) · and xor or
//   대입    맨 앞에만: x = … · x += … · -= *= /= //= %= **= (x.0 = … 처럼 목록 · 사전의 한 칸도)
// 셈의 차례는 LALib 와 같다: ** → * → / → // → - → + → % (같은 것끼리는 왼쪽부터). 비교 하나, 그다음 and → xor → or
// 화면 · 저장소를 모른다: 변수는 ExprEnv 가 읽고 쓴다 (시험에서 그대로 돌린다)

export interface ExprEnv {
  /** 이름 → 값 (없으면 undefined). 범위 변수는 글자 또는 닫힌 블록 */
  get(name: string): unknown;
  /** 값 넣기. step: ++ · -- (명령에 넘긴 이름 붙은 값부터 찾는다), assign: 대입 */
  set(name: string, value: string, kind: 'assign' | 'step'): void;
  /** {이름} → {{이름}} 을 바꾼 글자 */
  macro(text: string): string;
  isClosure(v: unknown): boolean;
}
export class ExprError extends Error { }
type Th = () => unknown;

const VAR = /^[a-z_][a-z_0-9]*(?:\*?\.(?:-?\d+|[a-z_][a-z_0-9]*))*/i;
const NUM = /^-?(?:\d+(?:\.\d+)?|\.\d+)/;
const CMP = /^(===|==|!==|!=|<=>|<=|<|>=|>|in(?=\s)|not\s+in(?=\s)|starts\s+with(?=\s)|ends\s+with(?=\s))/i;
const TYPE = /^is\s+(string|number|boolean|list|dictionary|closure)\b/i;
const MATH = /^(\*\*|\*|\/\/|\/|\+|-|%)/;
const LOGIC = /^(and|xor|or)(?=[\s(!])/i;
const ASSIGN = /^([a-z_][a-z_0-9]*(?:\.(?:-?\d+|[a-z_][a-z_0-9]*))*)\s*(\+|-|\*\*|\*|\/\/|\/|%)?=(?!=)/i;
/** LALib 의 셈 차례 */
const MATH_ORDER = ['**', '*', '/', '//', '-', '+', '%'];

// JS 의 연산 그대로 (글자 + 수 = 이어 붙이기 같은 것까지 같게). 타입 검사는 넘긴다
type N = number;
const OPS: Record<string, (a: unknown, b: unknown) => unknown> = {
  '+': (a, b) => (a as N) + (b as N), '-': (a, b) => (a as N) - (b as N), '*': (a, b) => (a as N) * (b as N), '/': (a, b) => (a as N) / (b as N),
  '//': (a, b) => ~~((a as N) / (b as N)), '%': (a, b) => (a as N) % (b as N), '**': (a, b) => (a as N) ** (b as N),
};
const asRegex = (s: string): RegExp | null => { const m = /^\/([\s\S]+)\/([dgimsuvy]*)$/.exec(s); if (!m) return null; try { return new RegExp(m[1], m[2]); } catch { return null; } };
/** 변수 · 매크로에서 읽은 글자 → 값: JSON → /정규식/ → 글자 그대로 */
export function readValue(v: unknown): unknown {
  if (typeof v !== 'string') return v;
  try { return JSON.parse(v); } catch { /* 글자 */ }
  return asRegex(v) ?? v;
}
const keyOf = (o: unknown, k: string): unknown => o == null ? undefined : (Object(o) as Record<string, unknown>)[k];
const at = (list: unknown[], k: string) => list.at(parseInt(k, 10));
/** 변수 이름 (점 · 별점 경로 포함) → 글자 (없으면 '') 또는 닫힌 블록 */
export function resolveVar(name: string, env: ExprEnv): unknown {
  const parts = name.split(/(\*?\.)/), base = parts[0];
  const v = env.get(base);
  if (v === undefined) return '';
  if (parts.length === 1) return v;
  let p: unknown; try { p = JSON.parse(String(v)); } catch { p = undefined; }
  for (let i = 1; i + 1 < parts.length && p !== undefined; i += 2) {
    const op = parts[i], k = parts[i + 1], numeric = !Number.isNaN(parseInt(k, 10));
    if (Array.isArray(p)) p = op === '*.' ? p.map(it => Array.isArray(it) && numeric ? at(it, k) ?? '' : keyOf(it, k) ?? '') : numeric ? at(p, k) : keyOf(p, k);
    else p = keyOf(p, k);
  }
  if (typeof p === 'string') return p;
  if (p === undefined || p === null) return '';
  return JSON.stringify(p);
}
const typeIs = (v: unknown, type: string, env: ExprEnv): boolean => {
  switch (type) {
    case 'list': return Array.isArray(v);
    case 'dictionary': return v != null && typeof v === 'object' && !Array.isArray(v) && !(v instanceof RegExp) && !env.isClosure(v);
    case 'closure': return env.isClosure(v);
    default: return typeof v === type;
  }
};
const includes = (hay: unknown, x: unknown): boolean => {
  if (typeof hay === 'string') return hay.includes(String(x));
  if (Array.isArray(hay)) return hay.includes(x);
  if (hay && typeof hay === 'object') return String(x) in hay;
  throw new ExprError(`"in" needs a list or text on the right, got ${JSON.stringify(hay)}`);
};
function compare(op: string, a: unknown, b: unknown): unknown {
  const o = op.replace(/\s+/g, ' ').toLowerCase();
  if (a instanceof RegExp) {
    if (o === '==' || o === '===') return a.test(String(b));
    if (o === '!=' || o === '!==') return !a.test(String(b));
    if (o === 'in' || o === 'not in') { const hit = Array.isArray(b) ? b.some(x => a.test(String(x))) : a.test(String(b)); return o === 'in' ? hit : !hit; }
    throw new ExprError(`"${op}" cannot compare a regular expression`);
  }
  if (b instanceof RegExp) {
    if (o === '==' || o === '===') return b.test(String(a));
    if (o === '!=' || o === '!==') return !b.test(String(a));
    throw new ExprError(`"${op}" cannot compare with a regular expression`);
  }
  const A = a as N, B = b as N;
  switch (o) {
    // eslint 없이: 느슨한 같음(==)은 일부러 쓴다 (1 == '1' 이 참)
    case '==': return a == b;
    case '===': return a === b;
    case '!=': return a != b;
    case '!==': return a !== b;
    case '<': return A < B;
    case '<=': return A <= B;
    case '>': return A > B;
    case '>=': return A >= B;
    case 'in': return includes(b, a);
    case 'not in': return !includes(b, a);
    case 'starts with': return String(a).startsWith(String(b));
    case 'ends with': return String(a).endsWith(String(b));
    case '<=>': {
      const num = (x: unknown) => typeof x === 'string' && x.length && !Number.isNaN(Number(x)) ? Number(x) : x;
      const x = num(a), y = num(b);
      if (typeof x === 'string' && typeof y === 'string') return Math.sign(x.toLowerCase().localeCompare(y.toLowerCase()));
      return (x as N) > (y as N) ? 1 : (x as N) < (y as N) ? -1 : 0;
    }
  }
  throw new ExprError(`Unknown comparison "${op}"`);
}
/** 대입 · ++ 의 결과를 변수에 넣을 글자로 */
const asStored = (v: unknown) => typeof v === 'string' ? v : v !== null && typeof v === 'object' && !(v instanceof RegExp) ? JSON.stringify(v) : String(v);

class Parser {
  i = 0;
  constructor(readonly s: string, readonly env: ExprEnv) { }
  get rest() { return this.s.slice(this.i); }
  ws() { while (this.i < this.s.length && /\s/.test(this.s[this.i])) this.i++; }
  end() { this.ws(); return this.i >= this.s.length; }
  fail(msg: string): never { throw new ExprError(`${msg}: ${this.s.slice(0, this.i)} ⟶ ${this.s.slice(this.i)}`); }
  take(re: RegExp): RegExpExecArray | null { const m = re.exec(this.rest); if (m) this.i += m[0].length; return m; }

  top(): Th {
    this.ws();
    const as = ASSIGN.exec(this.rest);
    let out: Th;
    if (as) { this.i += as[0].length; out = this.assign(as[1], as[2] || '', this.or()); }
    else out = this.or();
    if (!this.end()) this.fail('Unexpected text');
    return out;
  }
  assign(name: string, op: string, rhs: Th): Th {
    const target = this.varThunk(name);
    return () => {
      const v = rhs(); let cur = target();
      if (op === '') cur = v;
      else if (op === '+' && Array.isArray(cur)) cur.push(v);
      else cur = OPS[op](cur, v);
      const out = asStored(cur);
      this.env.set(name, out, 'assign');
      return out;
    };
  }
  logic(level: number): Th {
    const word = ['or', 'xor', 'and'][level];
    let left = level < 2 ? this.logic(level + 1) : this.cmp();
    for (; ;) {
      this.ws(); const m = LOGIC.exec(this.rest);
      if (!m || m[1].toLowerCase() !== word) return left;
      this.i += m[0].length;
      const a = left, b = level < 2 ? this.logic(level + 1) : this.cmp();
      left = word === 'and' ? () => a() && b() : word === 'or' ? () => a() || b() : () => { const x = !!a(), y = !!b(); return x !== y; };
    }
  }
  or(): Th { return this.logic(0); }
  cmp(): Th {
    const a = this.math(); this.ws();
    const ty = this.take(TYPE);
    if (ty) { const type = ty[1].toLowerCase(); return () => typeIs(a(), type, this.env); }
    const m = this.take(CMP);
    if (!m) return a;
    const b = this.math();
    return () => compare(m[1], a(), b());
  }
  math(): Th {
    const vals: Th[] = [this.unary()], ops: string[] = [];
    for (; ;) {
      const save = this.i; this.ws();
      // 비교 · 논리 · 대입 글자가 아니면 셈
      if (CMP.test(this.rest) || LOGIC.test(this.rest)) { this.i = save; break; }
      const m = this.take(MATH);
      if (!m) { this.i = save; break; }
      ops.push(m[1]); vals.push(this.unary());
    }
    for (const o of MATH_ORDER) for (let k = 0; k < ops.length; k++) if (ops[k] === o) {
      const a = vals[k], b = vals[k + 1], f = OPS[o];
      vals.splice(k, 2, () => f(a(), b())); ops.splice(k, 1); k--;
    }
    return vals[0];
  }
  unary(): Th {
    this.ws();
    if (this.s.startsWith('!', this.i) && !this.s.startsWith('!=', this.i)) { this.i++; const v = this.unary(); return () => !v(); }
    const pre = this.take(/^(\+\+|--)/);
    if (pre) { this.ws(); const m = this.take(VAR); if (!m) this.fail(`"${pre[1]}" needs a variable`); return this.step(m[0], pre[1], true); }
    return this.primary();
  }
  step(name: string, op: string, prefix: boolean): Th {
    const v = this.varThunk(name);
    return () => { const before = v(), out = String(OPS['+'](before, op === '++' ? 1 : -1)); this.env.set(name, out, 'step'); return prefix ? out : before; };
  }
  varThunk(name: string): Th { return () => readValue(resolveVar(name, this.env)); }
  primary(): Th {
    this.ws();
    const ch = this.s[this.i];
    if (ch === undefined) this.fail('Unexpected end');
    if (ch === '(') {
      this.i++; const inner = this.top2(); this.ws();
      if (this.s[this.i] !== ')') this.fail('Missing ")"');
      this.i++; return inner;
    }
    const b = this.take(/^(true|false)(?![\w.])/);
    if (b) { const v = b[1] === 'true'; return () => v; }
    const n = this.take(NUM);
    if (n) { const v = Number(n[0]); return () => v; }
    const name = this.take(VAR);
    if (name) {
      const post = this.take(/^(\+\+|--)/);
      return post ? this.step(name[0], post[1], false) : this.varThunk(name[0]);
    }
    if (ch === "'") return this.string();
    if (ch === '[') return this.list();
    if (ch === '/') return this.regex();
    if (ch === '{') return this.macro();
    return this.fail('Unexpected character');
  }
  /** 괄호 안: 대입 없이 식 하나 */
  top2(): Th { return this.or(); }
  string(): Th {
    this.i++; let out = '';
    while (this.i < this.s.length && this.s[this.i] !== "'") {
      if (this.s[this.i] === '\\' && (this.s[this.i + 1] === "'" || this.s[this.i + 1] === '\\')) { out += this.s[this.i + 1]; this.i += 2; continue; }
      out += this.s[this.i++];
    }
    if (this.s[this.i] !== "'") this.fail('Unclosed string');
    this.i++; return () => out;
  }
  list(): Th {
    const st = this.i; let depth = 0, q = false;
    for (; this.i < this.s.length; this.i++) {
      const c = this.s[this.i];
      if (q) { if (c === '\\') this.i++; else if (c === '"') q = false; continue; }
      if (c === '"') q = true; else if (c === '[') depth++; else if (c === ']' && --depth === 0) { this.i++; break; }
    }
    if (depth) this.fail('Unclosed list');
    let v: unknown; try { v = JSON.parse(this.s.slice(st, this.i)); } catch (e) { this.fail(`Bad list (${(e as Error).message})`); }
    return () => structuredClone(v);
  }
  regex(): Th {
    this.i++; let pat = '', cls = false;
    for (; this.i < this.s.length; this.i++) {
      const c = this.s[this.i];
      if (c === '\\') { pat += c + (this.s[this.i + 1] ?? ''); this.i++; continue; }
      if (cls) { if (c === ']') cls = false; } else if (c === '[') cls = true; else if (c === '/') break;
      pat += c;
    }
    if (this.s[this.i] !== '/') this.fail('Unclosed regular expression');
    this.i++;
    const flags = this.take(/^[dgimsuvy]*/)![0];
    try { new RegExp(pat, flags); } catch (e) { this.fail((e as Error).message); }
    return () => new RegExp(pat, flags);
  }
  macro(): Th {
    const e = this.s.indexOf('}', this.i);
    if (e < 0) this.fail('Unclosed macro');
    const body = this.s.slice(this.i + 1, e); this.i = e + 1;
    return () => readValue(this.env.macro(`{{${body}}}`));
  }
}

/** 식을 읽어 두고, 부를 때마다 값을 낸다 (/whilee 처럼 되풀이할 때 한 번만 읽는다) */
export function compile(src: string, env: ExprEnv): Th {
  if (!src.trim()) throw new ExprError('The expression is empty');
  return new Parser(src, env).top();
}
export const evaluate = (src: string, env: ExprEnv) => compile(src, env)();
