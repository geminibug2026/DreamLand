// 갱신 명령의 값에 적힌 셈(10 + 2 · sqrt(16) · Math.floor(3.9) · math.pow(2, 3))을 푼다.
// 원래 틀은 mathjs 로 푸는데, 여기서는 숫자 셈만 하는 작은 계산기로 같은 결과를 낸다 (변수 대입 · 단위 · 행렬은 없다).
// 셈이 아니면 throw 한다 — 부르는 쪽이 그 값을 글로 본다.

const FNS: Record<string, (...a: number[]) => number> = {
  abs: Math.abs, acos: Math.acos, acosh: Math.acosh, asin: Math.asin, asinh: Math.asinh, atan: Math.atan, atan2: Math.atan2, atanh: Math.atanh,
  ceil: Math.ceil, cos: Math.cos, cosh: Math.cosh, cube: x => x * x * x, exp: Math.exp, expm1: Math.expm1, floor: Math.floor, fix: Math.trunc, trunc: Math.trunc,
  hypot: Math.hypot, log10: Math.log10, log1p: Math.log1p, log2: Math.log2, cbrt: Math.cbrt, fround: Math.fround, clz32: Math.clz32, imul: Math.imul,
  log: (x, b) => b === undefined ? Math.log(x) : Math.log(x) / Math.log(b),
  max: (...a) => Math.max(...a), min: (...a) => Math.min(...a), mod: (a, b) => b === 0 ? a : a - b * Math.floor(a / b),
  nthRoot: (a, n = 2) => a < 0 && n % 2 === 1 ? -Math.pow(-a, 1 / n) : Math.pow(a, 1 / n), pow: Math.pow,
  round: (x, n) => { if (n === undefined) return Math.round(x); const f = Math.pow(10, n); return Math.round(x * f) / f; },
  sign: Math.sign, sin: Math.sin, sinh: Math.sinh, sqrt: Math.sqrt, square: x => x * x, tan: Math.tan, tanh: Math.tanh, random: Math.random,
  sum: (...a) => a.reduce((s, x) => s + x, 0), prod: (...a) => a.reduce((s, x) => s * x, 1), mean: (...a) => a.reduce((s, x) => s + x, 0) / a.length,
  median: (...a) => { const s = [...a].sort((x, y) => x - y), m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; },
  variance: (...a) => { const m = a.reduce((s, x) => s + x, 0) / a.length; return a.reduce((s, x) => s + (x - m) ** 2, 0) / (a.length - 1); },
  std: (...a) => { const m = a.reduce((s, x) => s + x, 0) / a.length; return Math.sqrt(a.reduce((s, x) => s + (x - m) ** 2, 0) / (a.length - 1)); },
  gcd: (...a) => a.reduce((x, y) => { x = Math.abs(x); y = Math.abs(y); while (y) [x, y] = [y, x % y]; return x; }),
  lcm: (...a) => a.reduce((x, y) => { let g = Math.abs(x), h = Math.abs(y); while (h) [g, h] = [h, g % h]; return g ? Math.abs(x * y) / g : 0; }),
  number: x => Number(x),
};
const CONST: Record<string, number> = { pi: Math.PI, PI: Math.PI, e: Math.E, E: Math.E, tau: 2 * Math.PI, phi: (1 + Math.sqrt(5)) / 2, Infinity, NaN, LN2: Math.LN2, LN10: Math.LN10, LOG2E: Math.LOG2E, LOG10E: Math.LOG10E, SQRT2: Math.SQRT2, SQRT1_2: Math.SQRT1_2 };
const NS_CONST: Record<string, Record<string, number>> = {
  Math: { PI: Math.PI, E: Math.E, LN2: Math.LN2, LN10: Math.LN10, LOG2E: Math.LOG2E, LOG10E: Math.LOG10E, SQRT2: Math.SQRT2, SQRT1_2: Math.SQRT1_2 },
  math: { pi: Math.PI, e: Math.E, tau: 2 * Math.PI, phi: (1 + Math.sqrt(5)) / 2 },
};

type Tok = { t: 'num'; v: number } | { t: 'id'; v: string } | { t: 'op'; v: string };
function lex(s: string): Tok[] {
  const out: Tok[] = []; let i = 0;
  while (i < s.length) {
    const c = s[i];
    if (/\s/.test(c)) { i++; continue; }
    const m = /^(?:0[xX][0-9a-fA-F]+|0[bB][01]+|0[oO][0-7]+|(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?)/.exec(s.slice(i));
    if (m) { out.push({ t: 'num', v: Number(m[0]) }); i += m[0].length; continue; }
    const id = /^[A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)?/.exec(s.slice(i));
    if (id) { out.push({ t: 'id', v: id[0] }); i += id[0].length; continue; }
    const op = /^(?:\*\*|[-+*/%^(),!\[\]])/.exec(s.slice(i));
    if (op) { out.push({ t: 'op', v: op[0] === '**' ? '^' : op[0] }); i += op[0].length; continue; }
    throw new Error('not math');
  }
  return out;
}

/** 숫자 셈을 푼다. 셈이 아니면(모르는 이름 · 글자 · 문법) 던진다 */
export function evalMath(src: string): number {
  const tk = lex(src); let p = 0;
  if (!tk.length) throw new Error('empty');
  const peek = () => tk[p], isOp = (v: string) => tk[p]?.t === 'op' && tk[p].v === v;
  const eat = (v: string) => { if (!isOp(v)) throw new Error('expected ' + v); p++; };
  const startsValue = (x?: Tok) => !!x && (x.t === 'num' || x.t === 'id' || (x.t === 'op' && x.v === '('));
  // 인자: 셈 하나, 또는 [a, b, c] 목록 (sum · mean · std 같은 모음 셈은 목록을 펼쳐 받는다)
  const arg = (out: number[]) => {
    if (isOp('[')) { p++; if (!isOp(']')) { out.push(add()); while (isOp(',')) { p++; out.push(add()); } } eat(']'); return; }
    out.push(add());
  };
  const call = (name: string): number => {
    eat('('); const args: number[] = [];
    if (!isOp(')')) { arg(args); while (isOp(',')) { p++; arg(args); } }
    eat(')');
    const [ns, fn] = name.includes('.') ? name.split('.') : ['', name];
    if (ns && ns !== 'Math' && ns !== 'math') throw new Error('unknown ' + name);
    const f = ns === 'Math' ? (Object.prototype.hasOwnProperty.call(Math, fn) && typeof (Math as unknown as Record<string, unknown>)[fn] === 'function' ? (Math as unknown as Record<string, (...a: number[]) => number>)[fn] : undefined) : FNS[fn];
    if (!f) throw new Error('unknown ' + name);
    return f(...args);
  };
  const atom = (): number => {
    const x = peek(); if (!x) throw new Error('end');
    if (x.t === 'num') { p++; return x.v; }
    if (x.t === 'id') {
      p++;
      if (isOp('(')) return call(x.v);
      if (x.v.includes('.')) { const [ns, k] = x.v.split('.'); const v = NS_CONST[ns]?.[k]; if (v === undefined) throw new Error('unknown ' + x.v); return v; }
      if (Object.prototype.hasOwnProperty.call(CONST, x.v)) return CONST[x.v];
      throw new Error('unknown ' + x.v);
    }
    if (x.v === '(') { p++; const v = add(); eat(')'); return v; }
    throw new Error('unexpected ' + x.v);
  };
  const post = (): number => {
    let v = atom();
    for (;;) {
      if (isOp('!')) { p++; if (v < 0 || v % 1) throw new Error('factorial'); let f = 1; for (let i = 2; i <= v; i++) f *= i; v = f; continue; }
      if (isOp('%') && !startsValue(tk[p + 1])) { p++; v = v / 100; continue; }   // 50% → 0.5
      break;
    }
    return v;
  };
  const unary = (): number => { if (isOp('-')) { p++; return -unary(); } if (isOp('+')) { p++; return +unary(); } return pow(); };
  const pow = (): number => { const b = post(); if (isOp('^')) { p++; return Math.pow(b, unary()); } return b; };
  const mul = (): number => {
    let v = unary();
    for (;;) {
      if (isOp('*')) { p++; v *= unary(); }
      else if (isOp('/')) { p++; v /= unary(); }
      else if (isOp('%')) { p++; const d = unary(); v = d === 0 ? v : v - d * Math.floor(v / d); }
      else if (startsValue(peek()) && (tk[p - 1]?.t === 'num' || (tk[p - 1]?.t === 'op' && tk[p - 1].v === ')'))) v *= unary();   // 2(3) · 2pi
      else return v;
    }
  };
  const add = (): number => { let v = mul(); for (;;) { if (isOp('+')) { p++; v += mul(); } else if (isOp('-')) { p++; v -= mul(); } else return v; } };
  const v = add();
  if (p < tk.length) throw new Error('trailing');
  if (typeof v !== 'number') throw new Error('not a number');
  return v;
}
