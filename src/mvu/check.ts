// 변수 갱신 틀 점검: 갱신 글(_.set(...) · <JSONPatch>)을 지금(또는 주어진) stat_data 에 대 보고, 명령마다 붙는지 · 안 붙는지 · 없는 경로인지 알려 준다.
// 엔진(engine.ts)을 그대로 쓴다 — 명령 하나씩 엔진에 넣어 보고 바뀐 것을 견준다. 말은 모델이 읽으므로 영어로 적는다
import { applyText, clone, emptyData, extractCommands, getAt, parseString, toPath, type Command, type MvuData, type Obj } from './engine';

export interface CmdReport { no: number; line?: number; command: string; type: Command['type']; path: string; result: 'applied' | 'no-op' | 'failed'; before?: unknown; after?: unknown; why?: string; reason?: string }
export interface MvuReport { commands: CmdReport[]; unrecognized: { line: number; text: string; why: string }[]; applied: number; failed: number; final: Obj; ignoredBlocks?: string }

const isObj = (v: unknown): v is Obj => !!v && typeof v === 'object' && !Array.isArray(v);
const isVwd = (v: unknown) => Array.isArray(v) && v.length === 2 && typeof v[1] === 'string';
/** 큰 값은 줄인 글로 */
const brief = (v: unknown): unknown => { const s = JSON.stringify(v); return s !== undefined && s.length > 160 ? s.slice(0, 160) + '…' : v; };
const short = (v: unknown) => { const s = JSON.stringify(v); return s === undefined ? 'undefined' : s.length > 160 ? s.slice(0, 160) + '…' : s; };
/** 명령 하나를 엔진이 읽는 글로 되돌린다 */
function serialize(c: Command): string {
  if (!c.values) return `_.${c.type}(${c.args.join(', ')});`;
  const ptr = (p: string[]) => '/' + p.map(x => x.replace(/~/g, '~0').replace(/\//g, '~1')).join('/');
  const [p, a, b] = c.values as [string[], unknown, unknown];
  const op = c.type === 'set' ? { op: 'replace', path: ptr(p), value: a } : c.type === 'add' ? { op: 'delta', path: ptr(p), value: a } : c.type === 'insert' ? { op: 'insert', path: ptr([...p, String(a)]), value: b } : { op: 'remove', path: ptr(p) };
  return `<JSONPatch>${JSON.stringify([op])}</JSONPatch>`;
}
const pathOf = (c: Command) => c.values ? (c.values[0] as string[]) : toPath(c.args[0] ?? '');
/** 가장 가까운 있는 경로 (모르는 경로일 때 도움말) */
function nearest(stat: Obj, path: string[]): string {
  let cur: unknown = stat, ok: string[] = [];
  for (const k of path) { if (cur && typeof cur === 'object' && Object.prototype.hasOwnProperty.call(cur, k)) { ok = [...ok, k]; cur = (cur as Obj)[k]; } else break; }
  const keys = cur && typeof cur === 'object' && !Array.isArray(cur) ? Object.keys(cur as Obj).slice(0, 12) : [];
  return `${ok.length ? `"${ok.join('.')}" exists` : 'Nothing on that path exists'}${keys.length ? `; keys there: ${keys.join(', ')}` : ''}`;
}

/** 갱신 글을 stat_data 에 대 본다. stat 은 바꾸지 않는다 */
export function checkUpdate(text: string, statIn: Obj): MvuReport {
  const data: MvuData = { ...emptyData(), stat_data: clone(statIn) || {} };
  const src = String(text || ''), cmds = extractCommands(src), out: CmdReport[] = [];
  // 명령이 몇째 줄에 있는지: 같은 동사로 시작하는 자리를 차례로 맞춘다
  const lines = src.split('\n'), spots: { line: number; verb: string }[] = [];
  lines.forEach((l, i) => { for (const c of extractCommands(l)) spots.push({ line: i + 1, verb: c.type }); });
  let spot = 0;
  cmds.forEach((c, i) => {
    const path = pathOf(c), before = clone(data.stat_data), had = path.length ? getAt(before, path) : before;
    const exists = !path.length || had !== undefined;
    const r: CmdReport = { no: i + 1, command: c.values ? serialize(c) : `_.${c.type}(${c.args.join(', ')})`, type: c.type, path: path.join('.'), result: 'no-op', ...(c.reason ? { reason: c.reason } : {}) };
    if (!c.values && spot < spots.length) r.line = spots[spot++].line;
    const changed = applyText(serialize(c), data);
    if (changed) {
      const now = path.length ? getAt(data.stat_data, path) : data.stat_data;
      r.result = 'applied'; r.before = exists ? brief(isVwd(had) ? (had as unknown[])[0] : had) : undefined; r.after = brief(isVwd(now) ? (now as unknown[])[0] : now);
    } else {
      r.result = 'failed';
      if (!exists && (c.type === 'set' || c.type === 'add' || c.type === 'delete')) r.why = `Path "${path.join('.')}" does not exist in stat_data, and _.${c.type} never creates paths. ${nearest(data.stat_data, path)}. Add it to the initial variables first, or fix the spelling.`;
      else if (c.type === 'add') r.why = `The value at "${path.join('.')}" is ${short(isVwd(had) ? (had as unknown[])[0] : had)}, which is not a number or date, or the amount is not a number.`;
      else if (c.type === 'set') r.why = `The new value equals the current one, or the value could not be read.`;
      else if (c.type === 'insert') r.why = `"${path.join('.')}" is not an array or object that can take this insert.`;
      else r.why = 'Nothing matched to remove.';
    }
    out.push(r);
  });
  // 명령처럼 생겼는데 엔진이 읽지 않은 줄
  const unrecognized: MvuReport['unrecognized'] = [];
  if (/_\.\w+\(/.test(src)) {
    lines.forEach((l, i) => {
      const m = /_\.(\w+)\(/.exec(l); if (!m) return;
      if (extractCommands(l).length) return;
      const verb = m[1];
      const why = !['set', 'insert', 'assign', 'remove', 'unset', 'delete', 'add'].includes(verb) ? `"_.${verb}" is not a command. Use _.set, _.add, _.insert (or _.assign), _.remove (or _.unset/_.delete).`
        : (l.split('(').length !== l.split(')').length) ? 'Parentheses are not balanced (the command must close on the same line in this check).'
          : !/\)\s*;/.test(l) && /\)\s*\S/.test(l.slice(l.indexOf(m[0]))) ? 'The closing ")" must be followed by ";" (then an optional //reason).'
            : `Too few arguments for _.${verb}: set/add need (path, value) or (path, old, new); remove needs (path).`;
      unrecognized.push({ line: i + 1, text: l.trim().slice(0, 140), why });
    });
  }
  const blocked = /<(think|thinking|reasoning|analysis|analyze)\b/i.test(src) ? 'Commands inside <think>/<analysis> blocks are ignored on purpose.' : undefined;
  return { commands: out, unrecognized, applied: out.filter(c => c.result === 'applied').length, failed: out.filter(c => c.result === 'failed').length, final: data.stat_data, ...(blocked ? { ignoredBlocks: blocked } : {}) };
}

/** 초기 변수 본문(JSON · YAML)을 읽어 본다 */
export function checkInit(text: string): { ok: boolean; error?: string; stat_data?: Obj; paths?: string[] } {
  try {
    const v = parseString(String(text || '').replace(/^\s*```[a-z0-9]*\s*\n/i, '').replace(/\n\s*```\s*$/, ''));
    if (!isObj(v)) return { ok: false, error: 'The initial variables must be one object at the top level ({ … } in JSON, or key: value lines in YAML).' };
    return { ok: true, stat_data: v, paths: leafPaths(v) };
  } catch (e) { return { ok: false, error: `Could not read it as JSON or YAML: ${e instanceof Error ? e.message : String(e)}` }; }
}
/** 잎 경로들: a.b · a.list[] · a.c (값, 설명) 칸은 하나로 */
export function leafPaths(v: unknown, base = '', out: string[] = [], max = 120): string[] {
  if (out.length >= max) return out;
  if (isVwd(v)) { out.push(`${base} = ${short((v as unknown[])[0])}  // ${(v as unknown[])[1]}`); return out; }
  if (isObj(v)) { const ks = Object.keys(v).filter(k => k !== '$meta'); if (!ks.length) out.push(`${base || '(root)'} = {}`); for (const k of ks) leafPaths(v[k], base ? `${base}.${k}` : k, out, max); return out; }
  if (Array.isArray(v)) { out.push(`${base} = array(${v.length})`); return out; }
  out.push(`${base} = ${short(v)}`); return out;
}
