// ── STscript 기본 명령 ── (실리태번과 같은 이름 · 같은 뜻. 대화와 닿는 일은 Host 가 맡는다)
import { t } from '../i18n';
import { Abort, COMMANDS, callClosure, callNamed, def, isBound, isSignal, signal, str, type Args, type Bound, type Ctx, type Val } from './run';

// ════════ 값 다루기 ════════
const MAX_LOOPS = 100;
const isTrue = (s: string) => ['on', 'true'].includes(s.trim().toLowerCase());
const isFalse = (s: string) => ['off', 'false'].includes(s.trim().toLowerCase());
const S = (a: Args, k: string, d = '') => a.named[k] === undefined ? d : str(a.named[k]);
const has = (a: Args, k: string) => a.named[k] !== undefined;
const num = (v: unknown) => { const s = String(v ?? '').trim(); return s.length ? Number(s) : NaN; };
const fmt = (n: number) => Number.isFinite(n) ? String(n) : 'NaN';

/** 이름이면 그 변수 값 (범위 → 대화 → 전역), 아니면 글자 그대로 */
function resolve(name: string, c: Ctx): string {
  const v = c.scope.get(name); if (v !== undefined) return str(v);
  const l = c.host.getVar(name); if (l !== undefined) return l;
  const g = c.host.getGlobal(name); if (g !== undefined) return g;
  return name;
}
/** /if · /while 의 값: 숫자 → 범위 변수 → 대화 변수 → 전역 변수 → 글자 */
function operand(v: Val | undefined, c: Ctx): string | number | undefined {
  if (v === undefined) return undefined;
  const s = str(v); if (s === '') return '';
  const n = s.trim().length ? Number(s) : NaN; if (!isNaN(n)) return n;
  // 변수 값이 수이면 수로 비교한다 (실리태번은 글자로 두어 lt · gt 가 오류가 난다 — 드림랜드는 받아 준다)
  const asNum = (x: string) => { const k = x.trim().length ? Number(x) : NaN; return isNaN(k) ? x : k; };
  if (c.scope.has(s)) return asNum(str(c.scope.get(s)));
  const l = c.host.getVar(s); if (l !== undefined) return asNum(l);
  const g = c.host.getGlobal(s); if (g !== undefined) return asNum(g);
  return s;
}
export function evalBool(rule: string | undefined, a: string | number | undefined, b: string | number | undefined): boolean {
  if (a === undefined) throw new Error(t('st.err.noLeft'));
  if (b === undefined) {
    if (rule === undefined || rule === 'not') { const yes = rule !== 'not'; if (isTrue(String(a))) return yes; if (isFalse(String(a))) return !yes; return a ? yes : !yes; }
    throw new Error(t('st.err.truthyRule', { rule }));
  }
  rule ??= 'eq';
  if (typeof a === 'number' && typeof b === 'number') {
    switch (rule) { case 'gt': return a > b; case 'gte': return a >= b; case 'lt': return a < b; case 'lte': return a <= b; case 'eq': return a === b; case 'neq': return a !== b; case 'in': case 'nin': break; default: throw new Error(t('st.err.badRule', { rule })); }
  }
  const A = (typeof a === 'string' ? a : JSON.stringify(a)).toLowerCase(), B = (typeof b === 'string' ? b : JSON.stringify(b)).toLowerCase();
  switch (rule) { case 'in': return A.includes(B); case 'nin': return !A.includes(B); case 'eq': return A === B; case 'neq': return A !== B; default: throw new Error(t('st.err.textRule', { rule })); }
}
const cond = (a: Args, c: Ctx) => {
  const pick = (...ks: string[]) => { for (const k of ks) if (a.named[k] !== undefined) return a.named[k]; return undefined; };
  return evalBool(a.named.rule === undefined ? undefined : str(a.named.rule), operand(pick('a', 'left', 'first', 'x'), c), operand(pick('b', 'right', 'second', 'y'), c));
};
/** 돌릴 것: 닫힌 블록이거나, 명령 글 */
const bodyOf = (a: Args): Bound | string | null => { const b = a.parts.find(isBound); if (b) return b as Bound; const t = a.parts.map(str).join(' ').trim(); return t ? t : null; };
async function runBody(body: Bound | string, c: Ctx, extra: Record<string, string> = {}): Promise<string> {
  if (isBound(body)) return callClosure(body, c, extra);
  const { runScript } = await import('./run');
  let src = body; if (src.startsWith('"') && src.endsWith('"')) src = src.slice(1, -1);
  for (const [k, v] of Object.entries(extra)) src = src.split(`{{${k}}}`).join(v);
  return runScript(src, c.host, { scope: c.scope, pipe: c.pipe });
}
/** 목록 값: JSON 배열이면 그것, 아니면 띄어쓰기로 나눈다 */
function listOf(v: Val, c: Ctx, resolveNames = true): string[] {
  const s = str(v).trim(); if (!s) return [];
  if (s.startsWith('[')) { try { const j: unknown = JSON.parse(s); if (Array.isArray(j)) return j.map(x => typeof x === 'string' && resolveNames ? resolve(x, c) : String(x)); } catch { /* 글자로 */ } }
  return s.split(/\s+/).map(x => resolveNames ? resolve(x, c) : x);
}
const parseJson = (s: string): unknown => { try { return JSON.parse(s); } catch { return undefined; } };
/** index= 가 있으면 목록 · 객체의 한 칸 */
function getIndexed(raw: string | undefined, index: string): string {
  if (raw === undefined) return '';
  if (index === '') return raw;
  const j = parseJson(raw); if (j === null || typeof j !== 'object') return '';
  const v = (j as Record<string, unknown>)[Array.isArray(j) ? Number(index) : index];
  return v === undefined ? '' : typeof v === 'string' ? v : JSON.stringify(v);
}
function setIndexed(raw: string | undefined, index: string, value: string): string {
  if (index === '') return value;
  let j = parseJson(raw ?? '');
  const isNum = /^\d+$/.test(index);
  if (j === null || typeof j !== 'object') j = isNum ? [] : {};
  const val = parseJson(value) ?? value;
  if (Array.isArray(j) && isNum) j[Number(index)] = val; else (j as Record<string, unknown>)[index] = val;
  return JSON.stringify(j);
}
function addValue(cur: string | undefined, v: string): string {
  const j = parseJson(cur ?? '');
  if (Array.isArray(j)) { j.push(parseJson(v) ?? v); return JSON.stringify(j); }
  const a = num(cur), b = num(v);
  if (!isNaN(a) && !isNaN(b)) return fmt(a + b);
  return (cur ?? '') + v;
}

// ════════ 변수 ════════
type Store = 'local' | 'global';
const io = (c: Ctx, s: Store) => s === 'local'
  ? { get: (k: string) => c.host.getVar(k), set: (k: string, v: string) => c.host.setVar(k, v), del: (k: string) => c.host.delVar(k) }
  : { get: (k: string) => c.host.getGlobal(k), set: (k: string, v: string) => c.host.setGlobal(k, v), del: (k: string) => c.host.delGlobal(k) };
/** key= 가 없으면 이름 없는 값의 첫 낱말이 이름 */
const keyAndValue = (a: Args): [string, string] => {
  if (has(a, 'key')) return [S(a, 'key'), str(a.unnamed)];
  const s = str(a.unnamed), m = /^(\S+)\s*([\s\S]*)$/.exec(s.trim());
  return m ? [m[1], m[2]] : ['', ''];
};
for (const [p, store] of [['', 'local'], ['global', 'global']] as [string, Store][]) {
  def(p ? `set${p}var` : ['setvar', 'setchatvar'], { help: '변수에 값을 넣는다', args: 'key=이름 [index=] 값', run: async (a, c) => { const k = S(a, 'key') || keyAndValue(a)[0]; const v = has(a, 'key') ? str(a.unnamed) : keyAndValue(a)[1]; const s = io(c, store); const next = setIndexed(s.get(k), S(a, 'index'), v); await s.set(k, next); return v; } });
  def(p ? `get${p}var` : ['getvar', 'getchatvar'], { help: '변수 값', args: 'key=이름 [index=]', run: (a, c) => getIndexed(io(c, store).get(S(a, 'key') || str(a.unnamed).trim()), S(a, 'index')) });
  def(p ? `add${p}var` : ['addvar', 'addchatvar'], { help: '변수에 더하기 (숫자면 더하고, 목록이면 넣고, 글자면 잇는다)', run: async (a, c) => { const [k, v] = keyAndValue(a); const s = io(c, store); const next = addValue(s.get(k), v); await s.set(k, next); return next; } });
  def(p ? `inc${p}var` : ['incvar', 'incchatvar'], { help: '1 더하기', run: async (a, c) => { const k = S(a, 'key') || str(a.unnamed).trim(), s = io(c, store); const n = fmt((num(s.get(k)) || 0) + 1); await s.set(k, n); return n; } });
  def(p ? `dec${p}var` : ['decvar', 'decchatvar'], { help: '1 빼기', run: async (a, c) => { const k = S(a, 'key') || str(a.unnamed).trim(), s = io(c, store); const n = fmt((num(s.get(k)) || 0) - 1); await s.set(k, n); return n; } });
  def(p ? `flush${p}var` : ['flushvar', 'flushchatvar'], { help: '변수 지우기', run: async (a, c) => { const k = S(a, 'key') || str(a.unnamed).trim(); if (k) await io(c, store).del(k); return ''; } });
}
def('let', { help: '이 스크립트(닫힌 블록) 안에서만 쓰는 변수를 만든다', args: 'key=이름 값 | 이름 값', run: (a, c) => {
  if (has(a, 'key')) { const v: Val = isBound(a.unnamed) ? a.unnamed : str(a.unnamed); c.scope.let(S(a, 'key'), v); return isBound(v) ? '' : v; }
  const b = a.parts.find(isBound); const s = a.parts.map(p => isBound(p) ? '' : str(p)).join('').trim();
  const m = /^(\S+)\s*([\s\S]*)$/.exec(s); if (!m) return '';
  const v: Val = b ? b : m[2]; c.scope.let(m[1], v); return isBound(v) ? '' : v;
} });
def('var', { help: '범위 변수 읽기 · 바꾸기', args: 'key=이름 [값] | 이름 [값]', run: (a, c) => {
  const b = a.parts.find(isBound);
  if (has(a, 'key')) { const k = S(a, 'key'); if (a.given && (b || str(a.unnamed) !== '')) { const v: Val = b || str(a.unnamed); c.scope.set(k, v); return isBound(v) ? '' : v; } return getIndexed(str(c.scope.get(k) ?? ''), S(a, 'index')); }
  const s = a.parts.map(p => isBound(p) ? '' : str(p)).join('').trim(), m = /^(\S+)\s*([\s\S]*)$/.exec(s); if (!m) return '';
  if (b || m[2]) { const v: Val = b || m[2]; c.scope.set(m[1], v); return isBound(v) ? '' : v; }
  const v = c.scope.get(m[1]); return isBound(v) ? v : getIndexed(v === undefined ? undefined : str(v), S(a, 'index'));
} });
def('listvar', { alias: ['listchatvar'], help: '변수 목록', run: (_a, c) => JSON.stringify(c.scope.flat()) });

// ════════ 흐름 ════════
def('if', { help: '조건이 맞으면 돌린다', args: 'left= right= rule=(eq neq lt gt lte gte in nin not) else={: :} {: :}', noPipe: true, run: async (a, c) => {
  const yes = cond(a, c), body = bodyOf(a);
  if (yes && body) return runBody(body, c);
  if (!yes && a.named.else !== undefined) { const e = a.named.else; if (isBound(e)) return callClosure(e, c); if (str(e)) return runBody(str(e), c); }
  return '';
} });
def('while', { help: '조건이 맞는 동안 되풀이 (guard=off 가 아니면 100 번까지)', noPipe: true, run: async (a, c) => {
  const body = bodyOf(a), limit = isFalse(S(a, 'guard')) ? Number.MAX_SAFE_INTEGER : MAX_LOOPS; let out = '';
  for (let i = 0; i < limit; i++) {
    if (!cond(a, c) || !body) break;
    try { out = await runBody(body, c); } catch (e) { if (isSignal(e, 'break')) { out = e.value; break; } throw e; }
  }
  return out;
} });
def('times', { help: 'n 번 되풀이 ({{timesIndex}} 는 0 부터)', args: 'n {: :}', noPipe: true, run: async (a, c) => {
  const texts = a.parts.filter(p => !isBound(p)).map(str).join(' ').trim().split(/\s+/);
  const n = num(resolve(texts[0] || '0', c)), b = a.parts.find(isBound) as Bound | undefined, rest = texts.slice(1).join(' ');
  const body: Bound | string | null = b || rest || null; if (!body) return '';
  const limit = Math.min(n, isFalse(S(a, 'guard')) ? Number.MAX_SAFE_INTEGER : MAX_LOOPS); let out = '';
  for (let i = 0; i < limit; i++) {
    try { out = await runBody(body, c, { timesIndex: String(i) }); } catch (e) { if (isSignal(e, 'break')) { out = e.value; break; } throw e; }
  }
  return out;
} });
def('break', { help: '되풀이에서 빠져나온다', run: a => { throw signal('break', a.given ? str(a.unnamed) : ''); } });
def('return', { help: '스크립트(닫힌 블록 · 퀵 리플라이)를 끝내고 값을 돌려준다', run: a => { throw signal('return', str(a.unnamed)); } });
def('abort', { help: '스크립트를 멈춘다', args: '[quiet=false] 까닭', run: (a, c) => { const why = str(a.unnamed); if (!isTrue(S(a, 'quiet', 'true')) && why) c.host.echo(why, 'warning'); throw new Abort(true); } });
def('pass', { help: '값을 그대로 넘긴다', run: a => a.unnamed });
def('delay', { alias: ['wait', 'sleep'], help: '밀리초만큼 기다린다', run: async a => { const ms = Math.max(0, num(str(a.unnamed)) || 0); await new Promise(r => setTimeout(r, ms)); return ''; } });
def('run', { alias: ['call', 'exec'], help: '닫힌 블록 · 퀵 리플라이를 부른다', args: '이름 | 세트.이름 | {: :} [이름=값 …]', run: async (a, c) => {
  const args: Record<string, string> = {}; for (const [k, v] of Object.entries(a.named)) args[k] = str(v);
  let target: Val = a.unnamed;
  // /run 이름 a=1 b=2 꼴도 받는다 (이름 뒤에 적은 값)
  if (!isBound(target)) { const m = /^(\S+)((?:\s+\w+=\S*)+)\s*$/.exec(str(target).trim()); if (m) { target = m[1]; for (const x of m[2].trim().split(/\s+/)) { const i = x.indexOf('='); args[x.slice(0, i)] = x.slice(i + 1); } } }
  try {
    if (isBound(target)) return await callClosure(target, c, args);
    return await callNamed(str(target).trim(), null, c, args);
  } catch (e) { if (isSignal(e, 'return')) return e.value; throw e; }
} });

// ════════ 수 ════════
const math = (name: string | string[], f: (xs: number[]) => number, help: string) => def(name, { help, run: (a, c) => { const xs = listOf(a.unnamed, c).map(num); return fmt(f(xs)); } });
math('add', xs => xs.reduce((s, x) => s + x, 0), '더하기');
math('mul', xs => xs.reduce((s, x) => s * x, 1), '곱하기');
math('max', xs => Math.max(...xs), '가장 큰 수');
math('min', xs => Math.min(...xs), '가장 작은 수');
math('sub', xs => xs.slice(1).reduce((s, x) => s - x, xs[0] ?? 0), '빼기');
math('div', xs => xs[0] / xs[1], '나누기');
math('mod', xs => xs[0] % xs[1], '나머지');
math('pow', xs => xs[0] ** xs[1], '거듭제곱');
for (const [n, f] of [['sin', Math.sin], ['cos', Math.cos], ['log', Math.log], ['abs', Math.abs], ['sqrt', Math.sqrt], ['round', Math.round]] as [string, (x: number) => number][]) def(n, { help: n, run: (a, c) => fmt(f(num(resolve(str(a.unnamed).trim(), c)))) });
def('rand', { help: '무작위 수 (from= to= round=round|ceil|floor)', run: a => {
  const lo = has(a, 'from') ? num(S(a, 'from')) : 0, hi = has(a, 'to') ? num(S(a, 'to')) : (str(a.unnamed).trim() ? num(str(a.unnamed)) : 1);
  const x = lo + Math.random() * (hi - lo), r = S(a, 'round');
  return fmt(r === 'round' ? Math.round(x) : r === 'ceil' ? Math.ceil(x) : r === 'floor' ? Math.floor(x) : x);
} });

// ════════ 글자 ════════
def('len', { help: '길이 (목록이면 개수)', run: a => { const s = str(a.unnamed), j = parseJson(s); return fmt(Array.isArray(j) ? j.length : j && typeof j === 'object' ? Object.keys(j).length : s.length); } });
def('upper', { alias: ['uppercase', 'to-upper'], help: '대문자로', run: a => str(a.unnamed).toUpperCase() });
def('lower', { alias: ['lowercase', 'to-lower'], help: '소문자로', run: a => str(a.unnamed).toLowerCase() });
def('trimstart', { help: '앞 공백 없애기', run: a => str(a.unnamed).trimStart() });
def('trimend', { help: '뒤 공백 없애기', run: a => str(a.unnamed).trimEnd() });
def('substr', { alias: ['substring'], help: '일부 (start= end=)', run: a => { const s = str(a.unnamed); return s.slice(has(a, 'start') ? num(S(a, 'start')) : 0, has(a, 'end') ? num(S(a, 'end')) : undefined); } });
const toRegex = (p: string) => { const m = /^\/([\s\S]+)\/([dgimsuy]*)$/.exec(p); return m ? new RegExp(m[1], m[2]) : new RegExp(p); };
def('replace', { alias: ['re'], help: '바꾸기 (mode=literal|regex pattern= replacer=)', run: a => {
  const s = str(a.unnamed), p = S(a, 'pattern'), r = S(a, 'replacer');
  return S(a, 'mode', 'literal') === 'regex' ? s.replace(toRegex(p), r) : s.split(p).join(r);
} });
def('test', { help: '정규식에 맞는지 (true/false)', run: a => String(toRegex(S(a, 'pattern')).test(str(a.unnamed))) });
def('match', { help: '정규식에 맞는 부분 (g 면 목록)', run: a => {
  const re = toRegex(S(a, 'pattern')), s = str(a.unnamed);
  if (re.global) return JSON.stringify([...s.matchAll(re)].map(m => [...m]));
  const m = s.match(re); return m ? JSON.stringify([...m]) : '';
} });
def('sort', { help: '목록 정렬', run: a => { const j = parseJson(str(a.unnamed)); if (!Array.isArray(j)) return str(a.unnamed); return JSON.stringify([...j].sort((x, y) => typeof x === 'number' && typeof y === 'number' ? x - y : String(x).localeCompare(String(y)))); } });
def('fuzzy', { help: '목록에서 가장 가까운 것 (list=[…])', run: (a, c) => {
  const list = listOf(a.named.list ?? '[]', c, false), q = str(a.unnamed).toLowerCase().trim();
  return list.find(x => x.toLowerCase() === q) || list.find(x => q.includes(x.toLowerCase()) || x.toLowerCase().includes(q)) || '';
} });

// ════════ 화면 · 대화 (Host 가 맡는다) ════════
type HostFn = (...xs: unknown[]) => unknown;
const need = (c: Ctx, name: string): HostFn => { const f = c.host[name]; if (typeof f !== 'function') throw new Error(t('st.err.notHere', { name })); return f.bind(c.host) as HostFn; };
const call = async (c: Ctx, name: string, ...xs: unknown[]) => { const r = await need(c, name)(...xs); return r == null ? '' : String(r); };
def('echo', { help: '알림으로 보여 준다', args: '[severity=info|warning|error|success] 글', run: (a, c) => { const s = str(a.unnamed); c.host.echo(s, S(a, 'severity', 'info')); return s; } });
def('popup', { help: '창으로 보여 준다', run: (a, c) => call(c, 'popup', str(a.unnamed)) });
def('input', { help: '사용자에게 글을 받는다', args: '[default=] 물음', run: (a, c) => call(c, 'input', str(a.unnamed), S(a, 'default')) });
def('buttons', { help: '단추 가운데 하나를 고르게 한다', args: 'labels=["a","b"] 물음', run: (a, c) => call(c, 'buttons', str(a.unnamed), listOf(a.named.labels ?? '[]', c, false)) });
def('setinput', { help: '입력창 글을 바꾼다', run: (a, c) => call(c, 'setInput', str(a.unnamed)) });
def('send', { help: '내 메시지로 보낸다 (답을 받지는 않는다)', run: (a, c) => call(c, 'send', str(a.unnamed)) });
def('sendas', { help: '캐릭터 메시지로 넣는다', args: 'name= 글', run: (a, c) => call(c, 'sendAs', S(a, 'name'), str(a.unnamed)) });
def(['sys', 'narrate', 'nar'], { help: '해설 메시지', run: (a, c) => call(c, 'sys', str(a.unnamed)) });
def('comment', { help: '모델에게 보내지 않는 메모 메시지', run: (a, c) => call(c, 'comment', str(a.unnamed)) });
def('trigger', { help: '답을 받는다', noPipe: true, run: (_a, c) => call(c, 'trigger') });
def('gen', { help: '대화에 남기지 않고 모델에게 묻는다 (지금 대화를 함께 보낸다)', run: (a, c) => call(c, 'gen', str(a.unnamed), { raw: false, lock: S(a, 'lock') }) });
def('genraw', { help: '대화 없이 이 글만 모델에게 묻는다', run: (a, c) => call(c, 'gen', str(a.unnamed), { raw: true, system: S(a, 'system') }) });
def(['continue', 'cont'], { help: '마지막 답을 이어 쓴다', noPipe: true, run: (_a, c) => call(c, 'generate', 'continue') });
def(['regenerate', 'regen'], { help: '마지막 답을 다시 받는다', noPipe: true, run: (_a, c) => call(c, 'generate', 'regen') });
def(['impersonate', 'imp'], { help: '내 차례를 대신 써 준다', noPipe: true, run: (_a, c) => call(c, 'generate', 'impersonate') });
def('stop', { alias: ['generate-stop'], help: '생성을 멈춘다', noPipe: true, run: (_a, c) => call(c, 'stopGen') });
def('messages', { alias: ['message'], help: '메시지 글 (범위: 0-3, -1 = 마지막)', args: '[names=on|off] 범위', run: (a, c) => call(c, 'messages', str(a.unnamed).trim(), !isFalse(S(a, 'names', 'on'))) });
def('hide', { help: '메시지 숨기기 (범위)', run: (a, c) => call(c, 'hide', str(a.unnamed).trim(), true) });
def('unhide', { help: '메시지 숨김 풀기 (범위)', run: (a, c) => call(c, 'hide', str(a.unnamed).trim(), false) });

// ════════ 퀵 리플라이 ════════
def('qr', { help: '켜진 세트의 n 번째 단추 (0 부터)', run: async (a, c) => call(c, 'qrIndex', num(str(a.unnamed))) });
for (const [n, state] of [['qr-set-on', true], ['qr-set-off', false], ['qr-set', null]] as [string, boolean | null][]) def(n, { help: '퀵 리플라이 세트 켜기 · 끄기', args: '[visible=] 세트 이름', run: (a, c) => call(c, 'qrToggle', str(a.unnamed).trim(), state, 'global') });
for (const [n, state] of [['qr-chat-set-on', true], ['qr-chat-set-off', false], ['qr-chat-set', null]] as [string, boolean | null][]) def(n, { help: '이 대화에서 세트 켜기 · 끄기', run: (a, c) => call(c, 'qrToggle', str(a.unnamed).trim(), state, 'chat') });

export const commandNames = () => [...new Set(COMMANDS.keys())].sort();
