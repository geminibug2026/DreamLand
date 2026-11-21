// 변수 갱신 틀 점검: 갱신 글(_.set(...) · <JSONPatch>)을 지금(또는 주어진) stat_data 에 대 보고, 명령마다 붙는지 · 안 붙는지 · 왜 안 되는지 알려 준다.
// 엔진(update.ts)을 그대로 쓴다 — 명령 하나씩 엔진에 넣어 보고, 엔진이 낸 오류 글을 그대로 옮긴다. 말은 모델이 읽으므로 영어로 적는다
import { clone, get, isPlainObject } from './lo';
import { parseString } from './parse';
import { extractCommands, updateVariables } from './update';
import { createEmptyGameData, finishInit } from './initvar';
import type { Command, MvuData } from './types';

type Obj = Record<string, unknown>;
export interface CmdReport { no: number; line?: number; command: string; type: Command['type']; path: string; result: 'applied' | 'no-op' | 'failed'; before?: unknown; after?: unknown; why?: string; reason?: string }
export interface MvuReport { commands: CmdReport[]; unrecognized: { line: number; text: string; why: string }[]; applied: number; failed: number; final: Obj; ignoredBlocks?: string }

const isVwd = (v: unknown) => Array.isArray(v) && v.length === 2 && typeof v[1] === 'string';
const brief = (v: unknown): unknown => { const s = JSON.stringify(v); return s !== undefined && s.length > 160 ? s.slice(0, 160) + '…' : v; };
const VERBS = ['set', 'insert', 'assign', 'remove', 'unset', 'delete', 'add'];

/** 갱신 글을 stat_data 에 대 본다 (schema 가 있으면 그것도). stat 은 바꾸지 않는다 */
export async function checkUpdate(text: string, statIn: Obj, schemaIn?: unknown): Promise<MvuReport> {
  const data: MvuData = { ...createEmptyGameData(), stat_data: clone(statIn) || {} };
  if (schemaIn && typeof schemaIn === 'object') data.schema = clone(schemaIn); else finishInit(data, true);
  const src = String(text || ''), cmds = extractCommands(src), out: CmdReport[] = [];
  let from = 0;
  for (let i = 0; i < cmds.length; i++) {
    const c = cmds[i], patch = c.reason === 'json_patch';
    const at = patch ? -1 : src.indexOf(c.full_match, from); if (at >= 0) from = at + c.full_match.length;
    const one = patch ? `<JSONPatch>[${c.full_match}]</JSONPatch>` : c.full_match;
    const path = String(c.args[0] ?? '').replace(/^[\\"'` ]*(.*?)[\\"'` ]*$/, '$1');
    const before = clone(data.stat_data), had = path ? get(before, path) : before;
    const errs: string[] = [];
    const changed = await updateVariables(one, data, errs);
    const now = path ? get(data.stat_data, path) : data.stat_data;
    const r: CmdReport = { no: i + 1, command: patch ? one : c.full_match.replace(/\s*\/\/.*$/, ''), type: c.type, path, result: errs.length ? 'failed' : changed ? 'applied' : 'no-op', ...(c.reason && !patch ? { reason: c.reason } : {}) };
    if (at >= 0) r.line = src.slice(0, at).split('\n').length;
    if (changed) { r.before = had === undefined ? undefined : brief(isVwd(had) ? (had as unknown[])[0] : had); r.after = brief(isVwd(now) ? (now as unknown[])[0] : now); }
    if (errs.length) r.why = errs.map(e => e.split('\n').slice(1).join(' ').trim() || e).join(' | ');
    else if (!changed) r.why = c.type === 'move' ? 'move is only carried out when the card registers a zod schema (MVU zod); the built-in engine ignores it.' : 'The command ran but the value did not change (same value as before).';
    out.push(r);
  }
  // 명령처럼 생겼는데 엔진이 읽지 않은 줄
  const unrecognized: MvuReport['unrecognized'] = [], lines = src.split('\n');
  if (/_\.\w+\(/.test(src)) {
    lines.forEach((l, i) => {
      const m = /_\.(\w+)\(/.exec(l); if (!m) return;
      if (extractCommands(l).length) return;
      const verb = m[1];
      const why = !VERBS.includes(verb) ? `"_.${verb}" is not a command. Use _.set, _.add, _.insert (or _.assign), _.remove (or _.unset/_.delete).`
        : (l.split('(').length !== l.split(')').length) ? 'Parentheses are not balanced (the command must close on the same line in this check).'
          : !/\)\s*;/.test(l) ? 'The closing ")" must be followed directly by ";" (then an optional //reason).'
            : verb === 'add' ? '_.add needs exactly two arguments: (path, amount).'
              : `Too few arguments for _.${verb}: set needs (path, value) or (path, old, new); insert needs (path, value) or (path, key, value); remove needs (path).`;
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
    if (!isPlainObject(v)) return { ok: false, error: 'The initial variables must be one object at the top level ({ … } in JSON, or key: value lines in YAML).' };
    const d: MvuData = { ...createEmptyGameData(), stat_data: v }; finishInit(d, true);
    return { ok: true, stat_data: d.stat_data, paths: leafPaths(d.stat_data) };
  } catch (e) { return { ok: false, error: `Could not read it as JSON or YAML: ${e instanceof Error ? e.message.split('\n').slice(0, 6).join(' ') : String(e)}` }; }
}
/** 잎 경로들: a.b · a.list[] · a.c (값, 설명) 칸은 하나로 */
export function leafPaths(v: unknown, base = '', out: string[] = [], max = 120): string[] {
  const short = (x: unknown) => { const s = JSON.stringify(x); return s === undefined ? 'undefined' : s.length > 160 ? s.slice(0, 160) + '…' : s; };
  if (out.length >= max) return out;
  if (isVwd(v)) { out.push(`${base} = ${short((v as unknown[])[0])}  // ${(v as unknown[])[1]}`); return out; }
  if (isPlainObject(v)) { const ks = Object.keys(v).filter(k => k !== '$meta'); if (!ks.length) out.push(`${base || '(root)'} = {}`); for (const k of ks) leafPaths(v[k], base ? `${base}.${k}` : k, out, max); return out; }
  if (Array.isArray(v)) { out.push(`${base} = array(${v.length})`); return out; }
  out.push(`${base} = ${short(v)}`); return out;
}
