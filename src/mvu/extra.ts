// 추가 호출(따로 한 번 더 물어보기)로 받은 답에서 변수 갱신 블록을 골라내고, 빠진 갱신을 고쳐 달라고 할 때 쓰는 도우미.
// MagVarUpdate (MIT License, Copyright (c) 2025 MagicalAstrogy & StageDog) 의 invoke_extra_model.ts · function_call.ts · incremental_repair.ts 일부를 옮겨 왔다.
/* eslint-disable @typescript-eslint/no-explicit-any */
import { get, isEqual, isPlainObject } from './lo';
import { closeUpdateMarkup, cleanStructuredUpdate, findUpdateMarkupBlocks, isJsonSafe, parseStructuredUpdate, scanUpdateMarkup } from './markup';
import { extractCommands, isJsonPatch } from './update';
import { parseString } from './parse';

function stripOuterTagBlock(input: string, tag: string): string {
  const m = input.match(new RegExp(`^\\s*<${tag}>\\s*([\\s\\S]*?)\\s*</${tag}>\\s*$`, 'i')); return m?.[1]?.trim() ?? input.trim();
}
function stripLeadingTagBlock(input: string, tag: string): string {
  const m = input.match(new RegExp(`^\\s*<${tag}>\\s*[\\s\\S]*?\\s*</${tag}>\\s*`, 'i')); return m ? input.slice(m[0].length).trim() : input.trim();
}
function normalizeJsonPatchPayload(input: unknown): string | null {
  if (isJsonPatch(input)) return isJsonSafe(input) ? JSON.stringify(input, null, 2) : null;
  if (typeof input !== 'string') return null;
  let s = cleanStructuredUpdate(input);
  s = stripOuterTagBlock(s, 'UpdateVariable'); s = stripLeadingTagBlock(s, 'Analysis'); s = stripLeadingTagBlock(s, 'Analyze'); s = stripOuterTagBlock(s, 'json_?patch');
  const parsed = parseStructuredUpdate(s);
  return isJsonPatch(parsed) && isJsonSafe(parsed) ? JSON.stringify(parsed, null, 2) : null;
}
const formatJsonPatchUpdate = (analysis: unknown, patch: string) => ['<UpdateVariable>', '<Analyze>', typeof analysis === 'string' ? analysis : '', '</Analyze>', '<JSONPatch>', patch, '</JSONPatch>', '</UpdateVariable>'].join('\n');

/** {"analysis": …, "json_patch": [...]} 꼴(또는 패치 배열 그대로)의 답을 갱신 블록으로 */
export function extractFromFormattedOutput(content: string): string | null {
  if (!content) return null;
  try {
    const parsed = parseStructuredUpdate(content);
    const src = isJsonPatch(parsed) ? parsed : (get(parsed, 'json_patch') ?? get(parsed, 'jsonPatch') ?? get(parsed, 'patch') ?? get(parsed, 'delta'));
    const patch = normalizeJsonPatchPayload(src); if (!patch) throw new Error('invalid JSONPatch');
    return formatJsonPatchUpdate(isJsonPatch(parsed) ? '' : (get(parsed, 'analysis') ?? get(parsed, 'analyze') ?? ''), patch);
  } catch (e) { console.warn('[변수 갱신] 추가 호출 답을 읽지 못함', e); return null; }
}

/**
 * 추가 호출 답에서 갱신 블록을 꺼내 검사한다. 블록을 찾았는데 틀렸으면 던지고, 아무것도 못 찾으면 null.
 * 마지막으로 닫힌 <UpdateVariable> → 그 안(없으면 답 전체)의 <JSONPatch> → 옛 _.set 명령 → 맨 JSON/YAML 패치 순으로 본다.
 */
export function parseAndValidateExtraModelResult(result: string): string | null {
  const updates = findUpdateMarkupBlocks(result, 'update');
  const update = updates.filter(b => b.closed).at(-1) ?? updates.at(-1);
  let body = update ? result.slice(update.contentStart, update.contentEnd) : result, hasBody = !!update;
  let patches = findUpdateMarkupBlocks(body, 'patch');
  if (!patches.some(b => b.closed) && update) { patches = findUpdateMarkupBlocks(result, 'patch'); if (patches.some(b => b.closed)) { body = result; hasBody = false; } }
  if (patches.length) {
    if (patches.some(b => !b.closed)) throw new Error('JSONPatch tag is not closed');
    for (const b of patches) { const v = parseStructuredUpdate(body.slice(b.contentStart, b.contentEnd)); if (!isJsonPatch(v) || !isJsonSafe(v)) throw new Error('JSONPatch content is invalid or has non-finite values'); }
    let text = '', cursor = 0;
    for (const b of patches) {
      if (hasBody) text += body.slice(cursor, b.start); else if (text) text += '\n';
      text += `<JSONPatch>${body.slice(b.contentStart, b.contentEnd)}</JSONPatch>`; cursor = b.end;
    }
    if (hasBody) text += body.slice(cursor);
    return `<UpdateVariable>${text}</UpdateVariable>`;
  }
  const scanned = scanUpdateMarkup(body);
  if (/_\.(?:set|insert|assign|remove|unset|delete|add)\s*\([\s\S]*?\)\s*;/.test(scanned.structural)) return `<UpdateVariable>${scanned.visible}</UpdateVariable>`;
  let structured: unknown;
  try { structured = parseStructuredUpdate(scanned.visible); } catch { /* 못 읽음 */ }
  if (structured !== undefined && isJsonSafe(structured)) { const f = extractFromFormattedOutput(scanned.visible); if (f) return f; }
  return null;
}

// ── 빠진 갱신 고치기 (증분 교정) ──
export interface StateChange { path: string; before: unknown; after: unknown }
const enc = (s: string) => s.replace(/~/g, '~0').replace(/\//g, '~1');
/** 앞뒤 상태를 견줘 바뀐 잎을 모은다 (배열은 통째로 한 항목) */
export function collectStateChanges(before: unknown, after: unknown, limit = 120): StateChange[] {
  const out: StateChange[] = [];
  const visit = (a: unknown, b: unknown, path: string) => {
    if (out.length >= limit || isEqual(a, b)) return;
    if (isPlainObject(a) && isPlainObject(b)) { for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) { visit(a[k], b[k], `${path}/${enc(k)}`); if (out.length >= limit) break; } return; }
    out.push({ path: path || '/', before: a, after: b });
  };
  visit(before, after, ''); return out;
}
const brief = (v: unknown, limit = 1000) => { let s: string; try { s = JSON.stringify(v) ?? String(v); } catch { s = String(v); } return s.length > limit ? s.slice(0, limit - 12) + '…[cut]' : s; };
export function formatStateChanges(changes: StateChange[]): string {
  if (!changes.length) return '(no changes have been applied for this message yet)';
  let out = '', n = 0;
  for (const c of changes) { const line = `${c.path.length > 256 ? c.path.slice(0, 256) + '…' : c.path}: ${brief(c.before)} -> ${brief(c.after)}\n`; if (out.length + line.length > 11900) break; out += line; n++; }
  if (n < changes.length) out += `(${changes.length - n} more not shown)\n`;
  return out + '(This list may be cut short; the full variables and rules still decide. Never delete data just because it is not listed.)';
}
/** 블록을 마지막 갱신 블록 끝(없으면 글 끝)에 덧붙인다 */
export function appendRepairBlock(message: string, block: string): string {
  let content = block.trim(); if (!content) return message;
  const wrappers = findUpdateMarkupBlocks(content, 'update'), outer = wrappers.length === 1 ? wrappers[0] : undefined;
  if (outer?.closed && outer.start === 0 && outer.end === content.length) content = content.slice(outer.contentStart, outer.contentEnd).trim();
  if (!content) return message;
  const target = findUpdateMarkupBlocks(message, 'update').filter(b => b.closed).sort((a, b) => a.end - b.end).at(-1);
  if (target && extractCommands(message.slice(target.end)).length === 0) {
    const body = message.slice(target.contentStart, target.contentEnd);
    return message.slice(0, target.contentEnd) + closeUpdateMarkup(body) + '\n' + content + '\n' + message.slice(target.contentEnd);
  }
  return `${message}${closeUpdateMarkup(message)}\n${content}`;
}

// ── 추가 호출의 답 꼴: 도구 호출 · 정해진 JSON (MagVarUpdate 의 src/function/function_call.ts 에서 옮김) ──
export const MVU_TOOL_NAME = 'mvu_VariableUpdate_dreamland';
const mvu_update_schema = Object.freeze({
    $schema: 'http://json-schema.org/draft-04/schema#',
    type: 'object',
    additionalProperties: false,
    properties: {
        analysis: {
            type: 'string',
            minLength: 1,
            description:
                'Write in ENGLISH. A compact reasoning summary that includes: (1) calculate time passed; (2) decide whether dramatic updates are allowed (special case or sufficiently long time); (3) list every variable name BEFORE actual variable analysis, without revealing their contents; (4) for each variable, judge whether it satisfies its change conditions and output only Y/N without reasons; (5) only evaluate stories inside <past_observe> block.',
        },
        delta: {
            type: 'string',
            minLength: 0,
            description: 'variable update block',
        },
    },
    required: ['delta'],
});

const json_primitive_value_schemas = [
    { type: 'string' },
    { type: 'number' },
    { type: 'integer' },
    { type: 'boolean' },
    { type: 'null' },
];

const json_array_item_schema = {
    anyOf: [...json_primitive_value_schemas, { type: 'object' }, { type: 'array' }],
};

const json_value_schema = {
    anyOf: [
        ...json_primitive_value_schemas,
        { type: 'object' },
        {
            type: 'array',
            items: json_array_item_schema,
        },
    ],
};

const json_patch_operation_schema = {
    anyOf: [
        {
            type: 'object',
            additionalProperties: false,
            properties: {
                op: { type: 'string', enum: ['replace'] },
                path: { type: 'string' },
                value: json_value_schema,
            },
            required: ['op', 'path', 'value'],
        },
        {
            type: 'object',
            additionalProperties: false,
            properties: {
                op: { type: 'string', enum: ['delta'] },
                path: { type: 'string' },
                value: { type: 'number' },
            },
            required: ['op', 'path', 'value'],
        },
        {
            type: 'object',
            additionalProperties: false,
            properties: {
                op: { type: 'string', enum: ['insert', 'add'] },
                path: { type: 'string' },
                value: json_value_schema,
            },
            required: ['op', 'path', 'value'],
        },
        {
            type: 'object',
            additionalProperties: false,
            properties: {
                op: { type: 'string', enum: ['remove'] },
                path: { type: 'string' },
            },
            required: ['op', 'path'],
        },
        {
            type: 'object',
            additionalProperties: false,
            properties: {
                op: { type: 'string', enum: ['move'] },
                from: { type: 'string' },
                path: { type: 'string' },
            },
            required: ['op', 'from', 'path'],
        },
        {
            type: 'object',
            additionalProperties: false,
            properties: {
                op: { type: 'string', enum: ['move'] },
                from: { type: 'string' },
                to: { type: 'string' },
            },
            required: ['op', 'from', 'to'],
        },
    ],
};

export const MVU_JSON_PATCH_RESPONSE_SCHEMA = Object.freeze({
    name: 'mvu_json_patch',
    description: 'MVU JsonPatch dialect response. Return analysis plus json_patch operations only.',
    strict: false,
    value: {
        type: 'object',
        additionalProperties: false,
        properties: {
            analysis: {
                type: 'string',
                description:
                    'Write in ENGLISH. Compactly summarize the variable update decision without revealing variable contents.',
            },
            json_patch: {
                type: 'array',
                description:
                    'MVU JsonPatch dialect operations. Use replace, delta, insert/add, remove, or move with JSON Pointer paths.',
                items: json_patch_operation_schema,
            },
        },
        required: ['analysis', 'json_patch'],
    },
});

export const MVU_TOOL = { name: MVU_TOOL_NAME, description: 'use this tool to UpdateVariable.', parameters: mvu_update_schema as unknown as Record<string, unknown> };

/** 도구 호출의 인자(JSON 글)를 갱신 블록으로. 못 읽으면 null */
export function extractFromToolArgs(content: string | undefined): string | null {
  if (!content) return null;
  try {
    const json = parseString(content);
    if (typeof json?.delta === 'string' && json.delta.trim().length > 0) {
      let result = `<UpdateVariable>\n<Analyze>\n${json.analysis}\n</Analyze>\n`;
      const patchy = /json_?patch/i.test(json.delta);
      try {
        const patch = normalizeJsonPatchPayload(json.delta);
        if (!patch) throw new Error('invalid JSONPatch');
        result += `<JSONPatch>\n${patch}\n</JSONPatch>\n`;
      } catch {
        if (patchy) return null;
        if (/_\.(?:set|insert|assign|remove|unset|delete|add)\s*\([\s\S]*?\)\s*;/.test(json.delta)) result += `${json.delta}\n`;
        else return null;
      }
      return result + '</UpdateVariable>';
    }
  } catch (e) { console.warn('[변수 갱신] 도구 호출 답을 읽지 못함', e); }
  return null;
}
