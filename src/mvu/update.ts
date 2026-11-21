// 변수 갱신: 답변 속 _.set(…) · _.add(…) · _.insert(…) · _.remove(…) 와 <JSONPatch> 를 읽어 stat_data 를 고친다.
// MagVarUpdate (MIT License, Copyright (c) 2025 MagicalAstrogy & StageDog) 의 src/function/update_variables.ts 를 옮겨 왔다.
// 실리태번에 매인 부분(이벤트 · 매크로 · 알림)은 host 로 받는다. 카드 스크립트가 듣는 이벤트도 원래와 같은 차례 · 같은 인자로 부른다.
/* eslint-disable @typescript-eslint/no-explicit-any */
import { clone, get, has, isArray, isDate, isEqual, isObject, isPlainObject, merge, set, toPath, unset } from './lo';
import { loadMath, needsMath, parseCommandValue, parseString, trimQuotesAndBackslashes } from './parse';
import { cleanStructuredUpdate, findUpdateMarkupBlocks, scanUpdateMarkup } from './markup';
import { cleanUpMetadata, generateSchema, getSchemaForPath, reconcileAndApplySchema } from './schema';
import { isArraySchema, isObjectSchema, variable_events, type Command, type CommandNames, type Emit, type MvuData, type TemplateType } from './types';

export { parseCommandValue, trimQuotesAndBackslashes };
export type { Command };

/** 갱신에 필요한 바깥 일: 이벤트 알리기 · 매크로 풀기 · 오류 알림 · 말 옮기기 */
export interface Host {
  emit: Emit;
  macros: (text: string) => string;
  /** 오류 알림 (errors 배열을 넘기지 않았을 때만 부른다) */
  warn?: (title: string, detail: string) => void;
  tr?: (key: string, p?: Record<string, unknown>) => string;
}
const EN: Record<string, string> = {
  unknownCommand: 'unknown command',
  errorTitle: '[MVU] Variable update error; rerolling may help: {command}',
  setPathMissing: "Path '{path}' does not exist in stat_data; the set command was skipped. {reason}",
  assignPrimitive: "Cannot assign into path '{path}' because it holds a primitive value ({type}). The operation was skipped. {reason}",
  mergeNonExtensibleObject: "SCHEMA VIOLATION: Cannot merge data into the non-extensible object at path '{path}'. {reason}",
  assignUnknownKey: "SCHEMA VIOLATION: Cannot assign the new key '{key}' into the non-extensible object at path '{path}'. {reason}",
  assignNonExtensibleArray: "SCHEMA VIOLATION: Cannot assign elements into the non-extensible array at path '{path}'. {reason}",
  assignMissingParent: "Cannot assign into the non-existent path '{path}' without an extensible parent. {reason}",
  mergeArrayIntoObject: "Cannot merge an array into the object at '{path}'.",
  mergeNonObjectIntoObject: "Cannot merge a non-object value into the object at '{path}'.",
  templateResolutionFailed: "Failed to resolve template metadata at '{path}': {cause}",
  assignInvalidArguments: "Invalid arguments for _.assign at path '{path}'.",
  removePathUndefined: "Path '{path}' is undefined in the _.remove command.",
  deleteTargetUndetermined: "Could not determine the deletion target for the command at path '{path}'. {reason}",
  removePathMissing: "Cannot remove from the non-existent path '{path}'. {reason}",
  removeNonExtensibleArray: "SCHEMA VIOLATION: Cannot remove an element from the non-extensible array at path '{path}'. {reason}",
  removeRequiredKey: "SCHEMA VIOLATION: Cannot remove the required key '{key}' from path '{path}'. {reason}",
  removeNonCollection: "Cannot remove from path '{path}' because it is not an array or object. The command was skipped. {reason}",
  removeExecutionFailed: "Failed to execute remove at path '{path}'.",
  addPathMissing: "Path '{path}' does not exist in stat_data; the add command was skipped. {reason}",
  dateDeltaNotNumber: "Delta '{delta}' for the date operation is not a number; the add command was skipped. {reason}",
  deltaNotNumber: "Delta '{delta}' is not a number; the add command was skipped. {reason}",
  addUnsupportedValue: "The value at path '{path}' is not a date or number; the add command was skipped. {reason}",
  addInvalidArguments: "Invalid number of arguments for _.add at path '{path}'. {reason}",
};
export const MESSAGES = EN;
const fill = (s: string, p: Record<string, unknown> = {}) => s.replace(/\{(\w+)\}/g, (m, k: string) => k in p ? String(p[k]) : m);
const trOf = (host: Host) => (key: string, p?: Record<string, unknown>) => host.tr ? host.tr(key, p) : fill(EN[key] ?? key, p);
/** 아무 일도 하지 않는 바깥 (점검 · 시험용) */
export const quietHost: Host = { emit: async () => { }, macros: t => t };

/**
 * 템플릿을 값에 입힌다 (값의 속성이 템플릿보다 앞선다)
 * @param strict_array_cast 켜면 원시값 → [원시값] 으로 바꾸지 않는다
 * @param array_merge_concat 배열 합치기가 이어 붙이기(기본)인지 덮어쓰기인지
 */
export function applyTemplate(value: any, template: TemplateType | undefined, strict_array_cast = false, array_merge_concat = true): any {
  if (!template) return value;
  const value_is_object = isObject(value) && !Array.isArray(value) && !isDate(value);
  const value_is_array = Array.isArray(value);
  const template_is_array = Array.isArray(template);
  if (value_is_object && !template_is_array) return merge({}, template, value);
  if (value_is_array && template_is_array) return array_merge_concat ? [...value, ...(template as any[])] : merge([], template, value);
  if (((value_is_object || value_is_array) && template_is_array !== value_is_array) || (!value_is_object && !value_is_array && isObject(template) && !Array.isArray(template))) {
    console.error(`Template type mismatch: template is ${template_is_array ? 'array' : 'object'}, but value is ${value_is_array ? 'array' : 'object'}. Skipping template merge.`);
    return value;
  }
  if (!value_is_object && !value_is_array && template_is_array) {
    if (strict_array_cast) return value;
    return array_merge_concat ? [value, ...(template as any[])] : merge([], template, [value]);
  }
  return value;
}

function pathSegmentsToLodashPath(segments: string[]): string {
  return segments.map(s => `["${s.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"]`).join('');
}
function jsonPatchPathToCommandPath(path: string | undefined): string {
  if (!path) return '';
  const p = path.startsWith('/') ? path.substring(1) : path;
  return pathSegmentsToLodashPath(p.split('/').map(s => s.replace(/~1/g, '/').replace(/~0/g, '~')));
}
export function isJsonPatch(patch: any): patch is any[] {
  if (!Array.isArray(patch)) return false;
  if (patch.length === 0) return true;
  return patch.every(op => isPlainObject(op) && typeof op.op === 'string' && (typeof op.path === 'string' || (op.op === 'move' && typeof op.to === 'string')));
}
function extractJsonPatch(patch: any[]): Command[] {
  const out: Command[] = [];
  for (const op of patch) {
    const path = jsonPatchPathToCommandPath(op.path ?? op.to);
    switch (op.op) {
      case 'replace': out.push({ type: 'set', full_match: JSON.stringify(op), args: [path, JSON.stringify(op.value)], reason: 'json_patch' }); break;
      case 'delta': out.push({ type: 'add', full_match: JSON.stringify(op), args: [path, JSON.stringify(op.value)], reason: 'json_patch' }); break;
      case 'insert': case 'add': {
        const parts = toPath(path), last = parts[parts.length - 1];
        // "-" 는 배열 끝에 붙이라는 뜻: 실행할 때 대상이 무엇인지 보고 푼다
        const keyArg = /^\d+$/.test(last) ? last : JSON.stringify(last);
        out.push({ type: 'insert', full_match: JSON.stringify(op), args: [pathSegmentsToLodashPath(parts.slice(0, -1)), keyArg, JSON.stringify(op.value)], reason: 'json_patch' });
        break;
      }
      case 'remove': out.push({ type: 'delete', full_match: JSON.stringify(op), args: [path], reason: 'json_patch' }); break;
      case 'move': out.push({ type: 'move', full_match: JSON.stringify(op), args: [jsonPatchPathToCommandPath(op.from), path], reason: 'json_patch' }); break;
    }
  }
  return out;
}

/** 짝이 맞는 닫는 괄호 자리 (따옴표 안의 괄호는 세지 않는다). 없으면 -1 */
function findMatchingCloseParen(str: string, start: number): number {
  let depth = 1, inQuote = false, q = '';
  for (let i = start; i < str.length; i++) {
    const c = str[i], prev = i > 0 ? str[i - 1] : '';
    if ((c === '"' || c === "'" || c === '`') && prev !== '\\') { if (!inQuote) { inQuote = true; q = c; } else if (c === q) inQuote = false; }
    if (!inQuote) { if (c === '(') depth++; else if (c === ')') { depth--; if (depth === 0) return i; } }
  }
  return -1;
}
/** 인자 글을 맨 바깥 쉼표에서 나눈다 (괄호 · 대괄호 · 중괄호 · 따옴표 안은 그대로) */
export function parseParameters(s: string): string[] {
  const out: string[] = []; let cur = '', inQuote = false, q = '', br = 0, cb = 0, pr = 0;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if ((c === '"' || c === "'" || c === '`') && (i === 0 || s[i - 1] !== '\\')) { if (!inQuote) { inQuote = true; q = c; } else if (c === q) inQuote = false; }
    if (!inQuote) { if (c === '(') pr++; if (c === ')') pr--; if (c === '[') br++; if (c === ']') br--; if (c === '{') cb++; if (c === '}') cb--; }
    if (c === ',' && !inQuote && pr === 0 && br === 0 && cb === 0) { out.push(cur.trim()); cur = ''; continue; }
    cur += c;
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}

/** 글에서 JSONPatch 와 _.set 꼴 명령을 원문 차례대로 꺼낸다 (생각 블록 · 패치 안의 글은 명령으로 보지 않는다) */
export function extractCommands(inputText: string): Command[] {
  const results: (Command & { $index: number })[] = [];
  for (const block of findUpdateMarkupBlocks(inputText, 'patch')) {
    if (!block.closed || block.discarded) continue;
    try {
      const patch = parseString(cleanStructuredUpdate(inputText.slice(block.contentStart, block.contentEnd)));
      if (isJsonPatch(patch)) for (const c of extractJsonPatch(patch)) results.push({ $index: block.start, ...c });
    } catch { /* 읽지 못한 패치는 건너뛴다 */ }
  }
  const chars = scanUpdateMarkup(inputText).visible.split('');
  for (const block of findUpdateMarkupBlocks(inputText, 'patch')) chars.fill(' ', block.start, block.end);
  const legacy = chars.join('');
  let i = 0;
  while (i < inputText.length) {
    const m = legacy.substring(i).match(/_\.(set|insert|assign|remove|unset|delete|add)\(/);
    if (!m || m.index === undefined) break;
    const type = m[1] as CommandNames, start = i + m.index, open = start + m[0].length;
    const close = findMatchingCloseParen(inputText, open);
    if (close === -1) { i = open; continue; }
    let end = close + 1;
    if (end >= inputText.length || inputText[end] !== ';') { i = close + 1; continue; }
    end++;
    let reason = '';
    const cm = inputText.substring(end).match(/^\s*\/\/(.*)/);
    if (cm) { reason = cm[1].trim(); end += cm[0].length; }
    const full_match = inputText.substring(start, end), params = parseParameters(inputText.substring(open, close));
    const ok = ((type === 'set' || type === 'assign' || type === 'insert') && params.length >= 2) || ((type === 'remove' || type === 'unset' || type === 'delete') && params.length >= 1) || (type === 'add' && params.length === 2);
    if (ok) results.push({ $index: start, type, full_match, args: params, reason });
    i = end;
  }
  return results.map((c, n) => ({ c, n })).sort((a, b) => a.c.$index - b.c.$index || a.n - b.n).map(({ c }) => { const { $index: _i, ...rest } = c; void _i; return rest; });
}

/** 경로 손질: [] 안의 숫자/글자 구분 · 따옴표로 감싼 칸 이름 풀기 */
export function pathFix(path: string): string {
  if (!path) return path;
  const fixedBrackets = path.replace(/\[([^\]]*)\]/g, (_m, raw: string) => {
    let inner = raw.trim(); if (!inner) return '[]';
    let quoted = false; const f = inner[0], l = inner[inner.length - 1];
    if (inner.length >= 2 && (f === '"' || f === "'") && f === l) { quoted = true; inner = inner.slice(1, -1); }
    if (/^\d+$/.test(inner)) return quoted ? `["${inner.replace(/"/g, '\\"')}"]` : `[${inner}]`;
    return /\s/.test(inner) ? `["${inner.replace(/"/g, '\\"')}"]` : `[${inner}]`;
  });
  return fixedBrackets.replace(/(^|\.)(["'])([^"']*)\2(?=\.|\[|$)/g, (_m, prefix: string, _q: string, name: string) => {
    if (!/\s/.test(name) && !/[.[\]]/.test(name)) return prefix + name;
    const esc = name.replace(/"/g, '\\"');
    return prefix === '.' ? `["${esc}"]` : `${prefix}["${esc}"]`;
  });
}

/**
 * 옛 방식의 값 하나 바꾸기 (display_data · delta_data 도 함께 적는다)
 * @deprecated 원래 틀에서도 옛 기능이다
 */
export async function updateVariable(stat_data: Record<string, any>, path: string, new_value: any, reason = '', is_recursive = false, host: Host = quietHost): Promise<boolean> {
  const display = stat_data.$internal?.display_data, delta = stat_data.$internal?.delta_data;
  if (!has(stat_data, path)) return false;
  const cur = get(stat_data, path), why = reason ? `(${reason})` : '';
  let oldValue: any;
  if (Array.isArray(cur) && cur.length === 2) { oldValue = clone(cur[0]); cur[0] = new_value; set(stat_data, path, cur); }
  else { oldValue = clone(cur); set(stat_data, path, new_value); }
  const shown = `${trimQuotesAndBackslashes(JSON.stringify(oldValue))}->${trimQuotesAndBackslashes(JSON.stringify(new_value))} ${why}`;
  if (display) set(display, path, shown);
  if (delta) set(delta, path, shown);
  if (is_recursive) await host.emit(variable_events.SINGLE_VARIABLE_UPDATED, stat_data, path, oldValue, new_value);
  return true;
}

function pathFixPass(commands: Command[]) {
  for (const c of commands) { if (c.reason === 'json_patch') continue; c.args[0] = pathFix(trimQuotesAndBackslashes(c.args[0])); }
}
const blank = (s: string) => s == null || s.trim().length === 0;
const isVwdData = (v: unknown): v is [any, string] => Array.isArray(v) && v.length === 2 && typeof v[1] === 'string';

/**
 * 글의 명령을 variables 에 그 자리에서 적용한다.
 * @param errors 넘기면 오류를 여기에 모으고 알림은 띄우지 않는다
 * @returns stat_data 가 바뀌었는가 (모든 명령이 성공했다는 뜻은 아니다)
 */
export async function updateVariables(current_message_content: string, variables: MvuData, errors?: string[], host: Host = quietHost): Promise<boolean> {
  const say = trOf(host);
  const before: MvuData = clone(variables);
  const out_status: MvuData = clone(variables);
  const delta_status: Partial<MvuData> = { stat_data: {} };
  const content = host.macros(current_message_content);
  const commands = extractCommands(content);
  set(variables.stat_data, '$internal', { display_data: out_status.stat_data, delta_data: delta_status.stat_data || {} });
  await host.emit(variable_events.VARIABLE_UPDATE_STARTED, variables);

  let error_info: { command: string; content: string } | undefined, current: Command | undefined;
  const outError = (text: string) => {
    const command = current?.full_match ?? say('unknownCommand'), title = say('errorTitle', { command });
    console.warn(`${title}\n${text}`);
    errors?.push(`${title}\n${text}`);
    error_info = { command, content: text };
  };
  const schema = variables.schema;
  const strict_template = schema?.strictTemplate ?? false, concat_template_array = schema?.concatTemplateArray ?? true, strict_set = schema?.strictSet ?? false;
  for (const c of commands) { if (c.type === 'remove' || c.type === 'unset') c.type = 'delete'; else if (c.type === 'assign') c.type = 'insert'; }

  await host.emit(variable_events.COMMAND_PARSED, variables, commands, current_message_content);
  // 스키마(zod) 카드의 처리는 다른 COMMAND_PARSED 듣는 이들 뒤에 온다
  await host.emit(variable_events.COMMAND_PARSED + '_for_zod', variables, commands, current_message_content, errors === undefined ? undefined : (e: string) => errors.push(e));
  await host.emit(variable_events.COMMAND_PARSED + '_ended_for_zod', variables, commands, current_message_content);
  pathFixPass(commands);
  // 셈이 필요한 값(따옴표 없는 식 · 낱말)이 있을 때만 셈 모듈을 불러 둔다 (값 읽기는 동기라 미리)
  if (commands.some(c => c.args.slice(1).some(needsMath))) await loadMath();

  for (const command of commands) {
    const path = command.args[0], reason_str = command.reason ? `(${command.reason})` : '';
    let display_str = '';
    current = command;
    switch (command.type) {
      case 'set': {
        if (path !== '' && !has(variables.stat_data, path)) { outError(say('setPathMissing', { path, reason: reason_str })); continue; }
        let oldValue = path === '' ? clone(variables.stat_data) : get(variables.stat_data, path);
        let newValue = parseCommandValue(command.args[command.args.length - 1]);
        if (newValue instanceof Date) newValue = newValue.toISOString();
        let isPathVWD = false;
        if (!strict_set && Array.isArray(oldValue) && oldValue.length === 2 && typeof oldValue[1] === 'string' && !Array.isArray(oldValue[0])) {
          // [값, 설명]: 첫 칸만 바꾼다. 숫자였으면 숫자로 (null 은 그대로 둔다)
          const copy = clone(oldValue[0]);
          oldValue[0] = typeof oldValue[0] === 'number' && newValue !== null ? Number(newValue) : newValue;
          oldValue = copy; isPathVWD = true;
        } else if (typeof oldValue === 'number' && newValue !== null && typeof newValue === 'string') set(variables.stat_data, path, Number(newValue));
        else if (path) set(variables.stat_data, path, newValue);
        else variables.stat_data = newValue;
        let finalNew: any = path === '' ? variables.stat_data : get(variables.stat_data, path);
        if (isPathVWD) finalNew = finalNew[0];
        if (!strict_set && isVwdData(oldValue) && Array.isArray(finalNew)) display_str = `${trimQuotesAndBackslashes(JSON.stringify(oldValue[0]))}->${trimQuotesAndBackslashes(JSON.stringify(finalNew[0]))} ${reason_str}`;
        else display_str = `${trimQuotesAndBackslashes(JSON.stringify(oldValue))}->${trimQuotesAndBackslashes(JSON.stringify(finalNew))} ${reason_str}`;
        await host.emit(variable_events.SINGLE_VARIABLE_UPDATED, variables.stat_data, path, oldValue, finalNew);
        break;
      }
      case 'insert': case 'assign': {
        const targetPath = path;
        const existing = targetPath === '' ? variables.stat_data : get(variables.stat_data, targetPath);
        const targetSchema = getSchemaForPath(schema, targetPath);
        if (existing !== null && !Array.isArray(existing) && !isObject(existing)) { outError(say('assignPrimitive', { path: targetPath, type: typeof existing, reason: reason_str })); continue; }
        if (targetSchema) {
          if (targetSchema.type === 'object' && targetSchema.extensible === false) {
            if (command.args.length === 2) { outError(say('mergeNonExtensibleObject', { path: targetPath, reason: reason_str })); continue; }
            if (command.args.length >= 3) { const k = String(parseCommandValue(command.args[1])); if (!has(targetSchema.properties, k)) { outError(say('assignUnknownKey', { key: k, path: targetPath, reason: reason_str })); continue; } }
          } else if (targetSchema.type === 'array' && (targetSchema.extensible === false || targetSchema.extensible === undefined)) { outError(say('assignNonExtensibleArray', { path: targetPath, reason: reason_str })); continue; }
        } else if (targetPath !== '' && !get(variables.stat_data, pathSegmentsToLodashPath(toPath(targetPath).slice(0, -1)))) { outError(say('assignMissingParent', { path: targetPath, reason: reason_str })); continue; }
        const oldValue = clone(existing);
        let ok = false;
        if (command.args.length === 2) {
          let v = parseCommandValue(command.args[1]);
          if (v instanceof Date) v = v.toISOString(); else if (Array.isArray(v)) v = v.map(x => x instanceof Date ? x.toISOString() : x);
          let col = targetPath === '' ? variables.stat_data : get(variables.stat_data, path);
          if (!Array.isArray(col) && !isObject(col)) { col = Array.isArray(v) ? [] : {}; set(variables.stat_data, path, col); }
          if (Array.isArray(col)) {
            const template = targetSchema && isArraySchema(targetSchema) ? targetSchema.template : undefined;
            v = applyTemplate(v, template, strict_template, concat_template_array);
            col.push(v); display_str = `ASSIGNED ${JSON.stringify(v)} into array '${path}' ${reason_str}`; ok = true;
          } else if (isObject(col)) {
            if (isObject(v) && !Array.isArray(v)) { merge(col, v); display_str = `MERGED object ${JSON.stringify(v)} into object '${path}' ${reason_str}`; ok = true; }
            else { outError(say(Array.isArray(v) ? 'mergeArrayIntoObject' : 'mergeNonObjectIntoObject', { path })); continue; }
          }
        } else if (command.args.length >= 3) {
          let v = parseCommandValue(command.args[2]);
          const keyOrIndex = parseCommandValue(command.args[1]);
          if (v instanceof Date) v = v.toISOString(); else if (Array.isArray(v)) v = v.map(x => x instanceof Date ? x.toISOString() : x);
          let col = targetPath === '' ? variables.stat_data : get(variables.stat_data, path);
          const template = targetSchema && (isArraySchema(targetSchema) || isObjectSchema(targetSchema)) ? targetSchema.template : undefined;
          if (Array.isArray(col) && (typeof keyOrIndex === 'number' || keyOrIndex === '-')) {
            const at = keyOrIndex === '-' ? col.length : keyOrIndex, label = keyOrIndex === '-' || keyOrIndex === -1 ? 'tail' : keyOrIndex;
            v = applyTemplate(v, template, strict_template, concat_template_array);
            col.splice(at, 0, v); display_str = `ASSIGNED ${JSON.stringify(v)} into '${path}' at index ${label} ${reason_str}`; ok = true;
          } else if (isObject(col)) {
            v = applyTemplate(v, template, strict_template, concat_template_array);
            (col as Record<string, unknown>)[String(keyOrIndex)] = v;
            display_str = `ASSIGNED key '${keyOrIndex}' with value ${JSON.stringify(v)} into object '${path}' ${reason_str}`; ok = true;
          } else {
            col = {}; set(variables.stat_data, path, col);
            v = applyTemplate(v, template, strict_template, concat_template_array);
            (col as Record<string, unknown>)[String(keyOrIndex)] = v;
            display_str = `CREATED object at '${path}' and ASSIGNED key '${keyOrIndex}' ${reason_str}`; ok = true;
          }
        }
        if (ok) {
          const nv = blank(path) ? variables.stat_data : get(variables.stat_data, path);
          await host.emit(variable_events.SINGLE_VARIABLE_UPDATED, variables.stat_data, path, oldValue, nv);
          try {
            // 새로 붙은 값에 든 $meta 를 바로 구조 기록에 반영한다
            const fresh = generateSchema(clone(nv), targetSchema!);
            merge(targetSchema, fresh);
            cleanUpMetadata(nv);
          } catch (e) { outError(say('templateResolutionFailed', { path, cause: e instanceof Error ? e.message : String(e) })); }
        } else { outError(say('assignInvalidArguments', { path })); continue; }
        break;
      }
      case 'unset': case 'delete': case 'remove': {
        const parts = toPath(path), last = parts[parts.length - 1];
        if (command.args.length === 1 && /^\d+$/.test(last)) {
          const containerPath = pathSegmentsToLodashPath(parts.slice(0, -1)), container = get(variables.stat_data, containerPath), at = parseInt(last, 10);
          if (Array.isArray(container) && at < container.length) {
            const orig = clone(container); container.splice(at, 1);
            display_str = `REMOVED item from '${containerPath}' at index ${at} ${reason_str}`;
            await host.emit(variable_events.SINGLE_VARIABLE_UPDATED, variables.stat_data, containerPath, orig, container);
            continue;
          }
        }
        if (!has(variables.stat_data, path)) { outError(say('removePathUndefined', { path })); continue; }
        let containerPath = path, keyOrIndex: string | number | undefined;
        if (command.args.length > 1) { keyOrIndex = parseCommandValue(command.args[1]); if (typeof keyOrIndex === 'string') keyOrIndex = trimQuotesAndBackslashes(keyOrIndex); }
        else { const ps = toPath(path), lp = ps.pop(); if (lp) { keyOrIndex = /^\d+$/.test(lp) ? Number(lp) : lp; containerPath = pathSegmentsToLodashPath(ps); } }
        if (keyOrIndex === undefined) { outError(say('deleteTargetUndetermined', { path, reason: reason_str })); continue; }
        if (containerPath !== '' && !has(variables.stat_data, containerPath)) { outError(say('removePathMissing', { path: containerPath, reason: reason_str })); continue; }
        const cs = getSchemaForPath(schema, containerPath);
        if (cs) {
          if (cs.type === 'array') { if (cs.extensible !== true) { outError(say('removeNonExtensibleArray', { path: containerPath, reason: reason_str })); continue; } }
          else if (cs.type === 'object') { const ks = String(keyOrIndex); if (has(cs.properties, ks) && cs.properties[ks].required === true) { outError(say('removeRequiredKey', { key: ks, path: containerPath, reason: reason_str })); continue; } }
        }
        const target = command.args.length > 1 ? parseCommandValue(command.args[1]) : undefined;
        let removed = false;
        if (target === undefined) {
          const ov = get(variables.stat_data, path); unset(variables.stat_data, path);
          display_str = `REMOVED path '${path}' ${reason_str}`; removed = true;
          await host.emit(variable_events.SINGLE_VARIABLE_UPDATED, variables.stat_data, path, ov, undefined);
        } else {
          const col = get(variables.stat_data, path);
          if (!Array.isArray(col) && !isObject(col)) { outError(say('removeNonCollection', { path, reason: reason_str })); continue; }
          if (Array.isArray(col)) {
            const orig = clone(col), at = typeof target === 'number' ? target : col.findIndex(x => isEqual(x, target));
            if (at >= 0 && at < col.length) { col.splice(at, 1); removed = true; display_str = `REMOVED item from '${path}' ${reason_str}`; await host.emit(variable_events.SINGLE_VARIABLE_UPDATED, variables.stat_data, path, orig, col); }
          } else if (isObject(col)) {
            if (typeof target === 'number') { const ks = Object.keys(col); if (target >= 0 && target < ks.length) { unset(col, [ks[target]]); removed = true; display_str = `REMOVED ${target + 1}th entry ('${ks[target]}') from object '${path}' ${reason_str}`; } }
            else { const k = String(target); if (has(col, k)) { delete (col as Record<string, unknown>)[k]; removed = true; display_str = `REMOVED key '${k}' from object '${path}' ${reason_str}`; } }
          }
        }
        if (!removed) { outError(say('removeExecutionFailed', { path })); continue; }
        break;
      }
      case 'add': {
        if (!has(variables.stat_data, path)) { outError(say('addPathMissing', { path, reason: reason_str })); continue; }
        const initial = clone(get(variables.stat_data, path)), oldValue = get(variables.stat_data, path);
        let base = oldValue;
        const isVWD = isVwdData(oldValue) && typeof oldValue[0] !== 'object';
        if (isVWD) base = oldValue[0];
        let date: Date | null = null;
        if (base instanceof Date) date = base;
        else if (typeof base === 'string') { const d = new Date(base); if (!isNaN(d.getTime()) && isNaN(Number(base))) date = d; }
        if (command.args.length === 2) {
          const delta = parseCommandValue(command.args[1]);
          if (date) {
            if (typeof delta !== 'number') { outError(say('dateDeltaNotNumber', { delta: command.args[1], reason: reason_str })); continue; }
            const iso = new Date(date.getTime() + delta).toISOString();
            if (isVWD) { oldValue[0] = iso; set(variables.stat_data, path, oldValue); } else set(variables.stat_data, path, iso);
            const fin = get(variables.stat_data, path);
            display_str = isVWD ? `${JSON.stringify(initial[0])}->${JSON.stringify(fin[0])} ${reason_str}` : `${JSON.stringify(initial)}->${JSON.stringify(fin)} ${reason_str}`;
            await host.emit(variable_events.SINGLE_VARIABLE_UPDATED, variables.stat_data, path, initial, fin);
          } else if (typeof base === 'number') {
            if (typeof delta !== 'number') { outError(say('deltaNotNumber', { delta: command.args[1], reason: reason_str })); continue; }
            const nv = parseFloat((base + delta).toPrecision(12));
            if (isVWD) { oldValue[0] = nv; set(variables.stat_data, path, oldValue); } else set(variables.stat_data, path, nv);
            const fin = get(variables.stat_data, path);
            display_str = isVWD ? `${JSON.stringify(initial[0])}->${JSON.stringify(fin[0])} ${reason_str}` : `${JSON.stringify(initial)}->${JSON.stringify(fin)} ${reason_str}`;
            await host.emit(variable_events.SINGLE_VARIABLE_UPDATED, variables.stat_data, path, initial, fin);
          } else { outError(say('addUnsupportedValue', { path, reason: reason_str })); continue; }
        } else { outError(say('addInvalidArguments', { path, reason: reason_str })); continue; }
        break;
      }
    }
    if (display_str) { set(out_status.stat_data, path, display_str); set(delta_status.stat_data!, path, display_str); }
  }
  variables.display_data = out_status.stat_data;
  variables.delta_data = delta_status.stat_data!;
  await host.emit(variable_events.VARIABLE_UPDATE_ENDED, variables, before);
  unset(variables.stat_data, '$internal');
  const modified = !isEqual(variables.stat_data, before.stat_data);
  if (modified) reconcileAndApplySchema(variables);
  await host.emit(variable_events.VARIABLE_UPDATE_ENDED + '_for_zod', variables, before);
  if (errors === undefined && error_info) host.warn?.(say('errorTitle', { command: error_info.command }), error_info.content);
  return modified;
}

/** 원래 틀의 parseMessage: 사본에 적용해 돌려준다 */
export async function parseMessage(message: string, old: MvuData, host: Host = quietHost): Promise<MvuData> {
  const r = clone(old); await updateVariables(message, r, undefined, host); return r;
}
export { isArray };
