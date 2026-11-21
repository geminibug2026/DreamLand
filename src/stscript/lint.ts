// ── STscript 점검: 돌리지 않고 읽기만 해서 잘못을 줄 · 칸 자리와 함께 짚는다 ──
// 문법은 parse.ts 그대로 읽고(같은 파서), 명령 · 이름 붙은 값은 실제 명령 표(ref.ts 가 넘겨 준다)에 대 본다.
// 화면 · 저장소를 모른다 (node 로 그대로 시험할 수 있게). 말은 모델이 읽으므로 영어로 적는다
import { ParseError, parse, type Closure, type Cmd, type Value } from './parse';

/** 명령 하나의 정보. named 가 null 이면 그 명령이 무엇을 받는지 모른다 (확장 명령 등) — 이름 붙은 값을 따지지 않는다 */
export interface CmdInfo { name: string; names: string[]; usage: string; help: string; named: string[] | null; open?: boolean; source: 'stscript' | 'app' | 'extension' }
export interface LintEnv {
  cmd(name: string): CmdInfo | null;
  /** 모든 명령 이름 (비슷한 이름 찾기용) */
  names(): string[];
  /** /:이름 · /run 이름 이 가리킬 퀵 리플라이가 있는가 (모르면 생략) */
  qr?(name: string): boolean;
}
export interface Issue { level: 'error' | 'warn'; line: number; col: number; code: string; msg: string; cmd?: string }
export interface LintResult { ok: boolean; errors: number; warnings: number; issues: Issue[]; commands: string[] }

const RULES = ['eq', 'neq', 'lt', 'gt', 'lte', 'gte', 'in', 'nin', 'not'];
const PARSE_MSG: Record<string, string> = {
  noClosureEnd: 'A {: block is never closed with :}.',
  noName: 'A "/" is not followed by a command name.',
  noQuoteEnd: 'A quoted value ("…") is never closed.',
};

/** 원문 자리 → 줄 · 칸 (1 부터) */
export function lineCol(src: string, at: number): { line: number; col: number } {
  const head = src.slice(0, Math.max(0, Math.min(at, src.length))), nl = head.lastIndexOf('\n');
  return { line: (head.match(/\n/g) || []).length + 1, col: head.length - nl };
}
function lev(a: string, b: string): number {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)] as number[]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) {
    d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);   // 두 글자 자리 바꿈 (ehco → echo)
  }
  return d[a.length][b.length];
}
/** 비슷한 이름 몇 개 */
export function similar(name: string, all: string[], n = 3): string[] {
  const low = name.toLowerCase();
  return all.map(x => ({ x, d: x.startsWith(low) || low.startsWith(x) ? 0.5 : lev(low, x) })).filter(o => o.d <= Math.max(1, Math.min(3, Math.floor(low.length / 3)))).sort((p, q) => p.d - q.d || p.x.length - q.x.length).slice(0, n).map(o => o.x);
}

/** {: 와 :} 의 짝: 따옴표 · 이스케이프를 건너뛰며 센다. 남는 :} 와 닫히지 않은 {: 의 자리 */
function blocks(src: string): { stray: number[]; open: number[] } {
  const stack: number[] = [], stray: number[] = [];
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (ch === '\\') { i++; continue; }
    if (src.startsWith('{{', i)) { const e = src.indexOf('}}', i + 2); if (e > 0 && !src.slice(i, e).includes('{:')) { i = e + 1; continue; } }
    if (src.startsWith('{:', i)) { stack.push(i); i++; continue; }
    if (src.startsWith(':}', i)) { if (stack.length) stack.pop(); else stray.push(i); i++; continue; }
  }
  return { stray, open: stack };
}
const partsText = (v: Value) => v.filter((p): p is string => typeof p === 'string').join(' ');
const closuresOf = (v: Value) => v.filter((p): p is Closure => typeof p !== 'string');

export function lintScript(src: string, env: LintEnv): LintResult {
  const issues: Issue[] = [], names: string[] = [];
  const add = (level: Issue['level'], at: number, code: string, msg: string, cmd?: string) => { const p = lineCol(src, at); if (!issues.some(i => i.code === code && i.line === p.line && i.col === p.col)) issues.push({ level, ...p, code, msg, ...(cmd ? { cmd } : {}) }); };
  const done = (): LintResult => { issues.sort((a, b) => a.line - b.line || a.col - b.col); const errors = issues.filter(i => i.level === 'error').length; return { ok: !errors, errors, warnings: issues.length - errors, issues, commands: names }; };

  if (!src.trim()) { add('error', 0, 'empty', 'The script is empty.'); return done(); }
  if (!/^\s*\//.test(src)) add('warn', src.search(/\S/), 'notScript', 'The text does not start with "/", so a quick reply treats it as plain text to insert or send, not as a script. Start with a command if you want it to run.');
  const bal = blocks(src);
  for (const at of bal.stray) add('error', at, 'strayClose', 'This ":}" closes a block that was never opened with "{:".');
  for (const at of bal.open) add('error', at, 'unclosed', 'This "{:" block is never closed with ":}".');

  let cmds: Cmd[];
  try { cmds = parse(src); }
  catch (e) {
    if (e instanceof ParseError) { if (e.code !== 'noClosureEnd' || !bal.open.length) add('error', e.at, 'parse:' + (e.code || 'error'), PARSE_MSG[e.code] || e.message); }
    else add('error', 0, 'parse:error', e instanceof Error ? e.message : String(e));
    return done();
  }

  // /let · /var 로 만든 닫힌 블록 이름 (/:이름 으로 부를 수 있다)
  const closureVars = new Set<string>();
  const collect = (list: Cmd[]) => { for (const c of list) { if ((c.name === 'let' || c.name === 'var') && closuresOf(c.unnamed).length) { const k = c.named.key ? partsText(c.named.key) : (/^\s*(\S+)/.exec(partsText(c.unnamed)) || [])[1]; if (k) closureVars.add(k.trim()); } for (const v of [c.unnamed, ...Object.values(c.named)]) for (const cl of closuresOf(v)) collect(cl.body); } };
  collect(cmds);

  /** 명령 사이 · 블록 안에서 명령이 아닌 글(파서가 버리는 것) */
  const gaps = (from: number, to: number, list: Cmd[]) => {
    let pos = from;
    const look = (a: number, b: number) => {
      const raw = src.slice(a, b), txt = raw.replace(/\/\*[\s\S]*?(\*\||$)/g, m => ' '.repeat(m.length));
      const m = /[^\s|]/.exec(txt); if (!m) return;
      const at = a + m.index, word = txt.slice(m.index).trim().split(/\s+/)[0].slice(0, 30);
      if (src.startsWith(':}', at) && bal.stray.includes(at)) return;
      add('warn', at, 'ignored', `"${word}…" is not part of any command and will be ignored (text must follow a /command; a bare "|" inside text ends the command — write \\| for a literal bar).`);
    };
    for (const c of list) { if (c.at > pos) look(pos, c.at); pos = Math.max(pos, c.at + c.raw.length); }
    if (to > pos) look(pos, to);
  };

  const visit = (list: Cmd[]) => {
    for (const c of list) {
      const inner = [c.unnamed, ...Object.values(c.named)].flatMap(closuresOf);
      for (const cl of inner) {
        if (cl.at == null) continue;
        const bodyEnd = cl.at + cl.src.length - (cl.now ? 4 : 2);
        let start = cl.at + 2; if (cl.args.length) { const s = src.slice(start, bodyEnd).search(/\/|:\}/); start = s < 0 ? bodyEnd : start + s; }
        gaps(start, bodyEnd, cl.body);
        visit(cl.body);
      }
      check(c);
    }
  };

  const check = (c: Cmd) => {
    if (c.name === '#' || c.name === 'breakpoint') return;
    if (c.name.startsWith(':')) {
      const target = c.name.slice(1) || partsText(c.unnamed).trim();
      names.push('/:' + target);
      if (target && !closureVars.has(target) && env.qr && !env.qr(target)) add('warn', c.at, 'noTarget', `"/:${target}" calls a closure or quick reply named "${target}", but none was found. Define it with /let or create that quick reply.`, c.name);
      return;
    }
    names.push('/' + c.name);
    const info = env.cmd(c.name);
    if (!info) {
      const near = similar(c.name, env.names());
      add('warn', c.at, 'unknownCmd', `Unknown command "/${c.name}". It is not in Dreamland's command list, so running it fails.${near.length ? ` Did you mean ${near.map(n => '/' + n).join(', ')}?` : ' Look it up with st_commands.'}`, c.name);
      return;
    }
    const given = Object.keys(c.named);
    if (info.named && !info.open) for (const k of given) if (!info.named.includes(k)) {
      add('warn', c.at, 'unknownArg', `/${c.name} does not read "${k}=". ${info.named.length ? `It reads: ${info.named.map(n => n + '=').join(' ')}.` : 'It takes no named arguments.'}`, c.name);
    }
    // 이름=값 을 글 뒤에 적으면 글의 일부가 된다
    const text = partsText(c.unnamed);
    if (info.named?.length) for (const m of text.matchAll(/(?:^|\s)(\w+)=(?=\S)/g)) if (info.named.includes(m[1]) && !given.includes(m[1])) {
      add('warn', c.at, 'argAfterText', `"${m[1]}=" comes after the unnamed text, so /${c.name} reads it as text. Put named arguments right after the command name.`, c.name);
    }
    const val = (k: string) => c.named[k] ? partsText(c.named[k]).trim() : undefined;
    if (c.name === 'if' || c.name === 'while') {
      if (!['left', 'a', 'first', 'x'].some(k => c.named[k])) add('warn', c.at, 'noLeft', `/${c.name} needs left= (the value to test), usually with right= and rule=. Example: /${c.name} left=hp right=0 rule=lte {: … :}`, c.name);
      const r = val('rule'); if (r && !r.includes('{{') && !RULES.includes(r)) add('warn', c.at, 'badRule', `rule="${r}" is not a rule. Use one of: ${RULES.join(', ')}.`, c.name);
      if (!closuresOf(c.unnamed).length && !text.trim()) add('warn', c.at, 'noBody', `/${c.name} has nothing to run. Add a {: … :} block after the arguments.`, c.name);
    }
    if (/^(set|add|inc|dec|flush)(global|chat)?var$/.test(c.name) && !c.named.key && !text.trim()) add('warn', c.at, 'noKey', `/${c.name} needs a variable name: key=name.`, c.name);
    if (c.name === 'buttons') { const l = val('labels'); if (!l) add('warn', c.at, 'noLabels', '/buttons needs labels=["A","B"].', c.name); else if (!l.includes('{{') && l.startsWith('[')) { try { if (!Array.isArray(JSON.parse(l))) throw 0; } catch { add('warn', c.at, 'badLabels', 'labels= is not a valid JSON list of strings, e.g. labels=["Fight","Run"].', c.name); } } }
    if ((c.name === 'run' || c.name === 'call' || c.name === 'exec') && env.qr) { const t = text.trim().split(/\s+/)[0]; if (t && !closuresOf(c.unnamed).length && !t.includes('{{') && !closureVars.has(t) && !env.qr(t)) add('warn', c.at, 'noTarget', `/run ${t}: no closure or quick reply named "${t}" was found.`, c.name); }
    // 매크로 괄호
    for (const v of [c.unnamed, ...Object.values(c.named)]) { const s = partsText(v), o = (s.match(/\{\{/g) || []).length, z = (s.match(/\}\}/g) || []).length; if (o !== z) { add('warn', c.at, 'macro', `Unbalanced macro braces in /${c.name} (${o} "{{" vs ${z} "}}").`, c.name); break; } }
  };

  gaps(0, src.length, cmds);
  visit(cmds);
  return done();
}
