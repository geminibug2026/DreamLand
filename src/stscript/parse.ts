// ── STscript 읽기: 글 → 명령 목록 ──
// 문법(실리태번 퀵 리플라이 스크립트와 같은 꼴):
//   /명령 이름=값 이름="띄어 쓴 값" 이름={: 닫힌 블록 :} 이름=["목록"] 이름 없는 값 | /다음 명령
//   - `|` 로 명령을 잇는다. 앞 명령의 결과는 {{pipe}} 이고, 이름 없는 값이 없으면 그대로 넘어간다
//   - {: … :} 는 닫힌 블록(나중에 돌리는 스크립트). /if · /while · /times 따위가 받는다
//   - \| \{ \} \\ 는 글자 그대로. /# 와 // 로 시작하는 명령은 주석
//   - 매크로({{…}})는 읽을 때가 아니라 돌릴 때 바꾼다
import { t } from '../i18n';

export interface Closure { kind: 'closure'; src: string; body: Cmd[]; args: string[]; /** {: … :}() — 그 자리에서 바로 돌린다 */ now?: boolean }
export type Part = string | Closure;
/** 이름 붙은 값 · 이름 없는 값은 글자와 닫힌 블록이 섞일 수 있다 (대개는 하나) */
export type Value = Part[];
/** noPipe: 앞에 || 를 써서 앞 결과를 받지 않는다 */
export interface Cmd { name: string; named: Record<string, Value>; unnamed: Value; raw: string; at: number; noPipe?: boolean }

export class ParseError extends Error {
  constructor(msg: string, public at: number) { super(msg); }
}

export function parse(src: string): Cmd[] {
  return new Parser(src).script(false);
}

class Parser {
  i = 0;
  constructor(public s: string) { }
  get c() { return this.s[this.i]; }
  peek(str: string) { return this.s.startsWith(str, this.i); }
  ws() { while (this.i < this.s.length && /\s/.test(this.c)) this.i++; }
  /** 스크립트 하나. inClosure 이면 `:}` 에서 멈춘다 */
  script(inClosure: boolean): Cmd[] {
    const out: Cmd[] = []; let noPipe = false;
    for (; ;) {
      this.ws();
      if (this.i >= this.s.length) { if (inClosure) throw new ParseError(t('st.err.noClosureEnd'), this.i); return out; }
      if (inClosure && this.peek(':}')) return out;
      if (this.c === '|') { this.i++; if (this.c === '|') { this.i++; noPipe = true; } continue; }   // || : 다음 명령은 앞 결과를 받지 않는다
      if (this.peek('/*')) {   // 덩이 주석: /* … *|
        const e = this.s.indexOf('*|', this.i + 2); this.i = e < 0 ? this.s.length : e + 2; continue;
      }
      if (this.c !== '/') {   // 명령이 아닌 글은 버린다 (실리태번과 같다)
        while (this.i < this.s.length && this.c !== '|' && !(inClosure && this.peek(':}'))) { if (this.c === '\\') this.i++; this.i++; }
        continue;
      }
      const cmd = this.command(inClosure);
      if (noPipe) { cmd.noPipe = true; noPipe = false; }
      out.push(cmd);
    }
  }
  command(inClosure: boolean): Cmd {
    const at = this.i; this.i++;   // '/'
    if (this.peek('#') || this.peek('/')) {   // 주석: 다음 | 까지
      while (this.i < this.s.length && this.c !== '|' && !(inClosure && this.peek(':}'))) { if (this.c === '\\') this.i++; this.i++; }
      return { name: '#', named: {}, unnamed: [], raw: this.s.slice(at, this.i), at };
    }
    const m = /^[^\s|]+/.exec(this.s.slice(this.i));
    if (!m) throw new ParseError(t('st.err.noName'), at);
    let name = m[0];
    if (inClosure && name.includes(':}')) name = name.slice(0, name.indexOf(':}'));
    this.i += name.length;
    const named: Record<string, Value> = {};
    // 이름 붙은 값: 이름=값 (이름 없는 값이 시작되면 그 뒤로는 모두 이름 없는 값)
    for (; ;) {
      const save = this.i; this.ws();
      const nm = /^(\w+)=/.exec(this.s.slice(this.i));
      if (!nm) { this.i = save; break; }
      this.i += nm[0].length;
      named[nm[1]] = this.argValue(inClosure);
    }
    this.ws();
    const unnamed = this.value(inClosure, false, named);
    // /:이름 은 이름을 그대로 (닫힌 블록 · 퀵 리플라이 이름은 대소문자를 가린다)
    return { name: name.startsWith(':') ? name : name.toLowerCase(), named, unnamed, raw: this.s.slice(at, this.i), at };
  }
  /** 이름 붙은 값 하나: "…" · {: … :} · [ … ] · 띄어쓰기 없는 글 */
  argValue(inClosure: boolean): Value {
    if (this.c === '"') return [this.quoted()];
    if (this.peek('{:')) return [this.closure()];
    if (this.c === '[') {   // 목록: 짝이 맞는 ] 까지 그대로
      const st = this.i; let depth = 0, q = false;
      for (; this.i < this.s.length; this.i++) {
        const ch: string = this.s[this.i];
        if (q) { if (ch === '\\') this.i++; else if (ch === '"') q = false; continue; }
        if (ch === '"') q = true; else if (ch === '[') depth++; else if (ch === ']' && --depth === 0) { this.i++; break; }
      }
      return [this.s.slice(st, this.i)];
    }
    let out = '';
    while (this.i < this.s.length && !/\s/.test(this.c) && this.c !== '|' && !(inClosure && this.peek(':}'))) {
      if (this.c === '\\' && this.i + 1 < this.s.length) { out += this.s[this.i + 1]; this.i += 2; continue; }
      if (this.peek('{{')) { const e = this.s.indexOf('}}', this.i); if (e > 0) { out += this.s.slice(this.i, e + 2); this.i = e + 2; continue; } }
      out += this.c; this.i++;
    }
    return [out];
  }
  quoted(): string {
    this.i++; let out = '';
    while (this.i < this.s.length && this.c !== '"') {
      if (this.c === '\\' && this.i + 1 < this.s.length) { const n = this.s[this.i + 1]; out += n === '"' || n === '\\' ? n : '\\' + n; this.i += 2; continue; }
      out += this.c; this.i++;
    }
    if (this.c !== '"') throw new ParseError(t('st.err.noQuoteEnd'), this.i);
    this.i++; return out;
  }
  closure(): Closure {
    const st = this.i; this.i += 2;
    // 맨 앞에 받을 값의 이름과 기본값을 둘 수 있다: {: a=1 b= /echo {{var::a}} :}
    const args: string[] = [];
    const head = /^\s*((?:\w+=(?:"[^"]*"|[^\s|/]*)\s+)+)(\|\s*)?(?=\/|:\})/.exec(this.s.slice(this.i));
    if (head) { for (const m of head[1].matchAll(/(\w+)=("[^"]*"|\S*)/g)) args.push(`${m[1]}=${m[2].startsWith('"') ? m[2].slice(1, -1) : m[2]}`); this.i += head[0].length; }
    const body = this.script(true);
    this.i += 2;   // ':}'
    const now = this.peek('()'); if (now) this.i += 2;
    return { kind: 'closure', src: this.s.slice(st, this.i), body, args, ...(now ? { now: true } : {}) };
  }
  /** 이름 없는 값: 다음 | 까지. 닫힌 블록이 섞일 수 있다. top 이면 맨 글(명령 아님) */
  value(inClosure: boolean, _top: boolean, named?: Record<string, Value>): Value {
    const parts: Part[] = []; let buf = '';
    while (this.i < this.s.length) {
      if (this.c === '|') break;
      if (inClosure && this.peek(':}')) break;
      if (this.c === '\\' && this.i + 1 < this.s.length) {
        const n = this.s[this.i + 1];
        if ('|{}\\:'.includes(n)) { buf += n; this.i += 2; continue; }
        buf += '\\'; this.i++; continue;
      }
      if (this.peek('{:')) {
        if (buf.trim()) parts.push(buf); buf = ''; parts.push(this.closure());
        // 닫힌 블록 뒤에 적은 이름=값 (예: /if … {: … :} else={: … :}) 도 이름 붙은 값으로 받는다
        for (; ;) { const nm = /^\s+(\w+)=/.exec(this.s.slice(this.i)); if (!nm || !named) break; this.i += nm[0].length; named[nm[1]] = this.argValue(inClosure); }
        continue;
      }
      if (this.peek('{{')) {   // 매크로 안의 | 는 끊지 않는다 ({{random::a|b}} 같은 것)
        let depth = 0, j = this.i;
        for (; j < this.s.length; j++) { if (this.s.startsWith('{{', j)) { depth++; j++; } else if (this.s.startsWith('}}', j)) { depth--; j++; if (!depth) break; } }
        buf += this.s.slice(this.i, j + 1); this.i = j + 1; continue;
      }
      buf += this.c; this.i++;
    }
    buf = buf.replace(/\s+$/, '');
    if (buf || !parts.length) { if (parts.length && !buf.trim()) { /* 닫힌 블록 뒤 공백 */ } else parts.push(buf); }
    // 값 전체가 "…" 하나면 따옴표를 벗긴다
    if (parts.length === 1 && typeof parts[0] === 'string') { const t = parts[0].trim(); if (/^"(?:[^"\\]|\\.)*"$/.test(t)) parts[0] = t.slice(1, -1).replace(/\\(["\\])/g, '$1'); }
    return parts.filter(p => p !== '');
  }
}
