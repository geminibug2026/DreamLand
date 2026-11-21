// 글 → 값: 초기 변수 · 패치 본문(YAML · JSON · JSON5 · 망가진 JSON)과 갱신 명령의 값 하나.
// MagVarUpdate(MIT, © 2025 MagicalAstrogy & StageDog)의 parseString · parseCommandValue 규칙을 따른다.
import YAML from 'yaml';
import JSON5 from 'json5';
import { jsonrepair } from 'jsonrepair';
import { isObject } from './lo';

/** 앞뒤 따옴표 · 역슬래시 · 공백 떼기 (여러 줄 글은 그대로: 원래 규칙이 그렇다) */
export function trimQuotesAndBackslashes(str: string): string {
  if (typeof str !== 'string') return str;
  return str.replace(/^[\\"'` ]*(.*?)[\\"'` ]*$/, '$1');
}

const errText = (e: unknown) => e instanceof Error ? (e.stack || e.message) : String(e);
/** YAML 을 먼저(JSON 처럼 생긴 글은 JSON5 먼저) · 그다음 JSON5 · 고친 JSON · YAML 순으로 읽는다. 다 안 되면 던진다 */
export function parseString(content: string): any {
  const jsonFirst = /^[[{]/s.test(content.trimStart());
  let yamlErr: unknown;
  if (!jsonFirst) { try { return YAML.parseDocument(content, { merge: true }).toJS(); } catch (e) { yamlErr = e; } }
  let json5Err: unknown, jsonErr: unknown;
  try { return JSON5.parse(content); } catch (e) { json5Err = e; }
  try { return JSON.parse(jsonrepair(content)); } catch (e) { jsonErr = e; }
  if (jsonFirst) { try { return YAML.parseDocument(content, { merge: true }).toJS(); } catch (e) { yamlErr = e; } }
  throw new Error(YAML.stringify({ 'Not valid YAML/JSON/JSON5': { content, yaml: errText(yamlErr), json5: errText(json5Err), json: errText(jsonErr) } }, { blockQuote: 'literal' }));
}

/** YAML 한 값 읽기 (실리태번의 YAML.parse 와 같다: 틀리면 던진다) */
export const yamlParse = (s: string): unknown => YAML.parse(s);
export const yamlStringify = (v: unknown): string => YAML.stringify(v, { blockQuote: 'literal' });
export const yamlStringifyQuoted = (v: unknown): string => YAML.stringify(v, { blockQuote: 'literal', defaultKeyType: 'PLAIN', defaultStringType: 'QUOTE_DOUBLE' });

// ── 셈 (mathjs): 따로 떼어 둔 mathEval.ts 를 셈이 필요할 때만 불러온다 (대화방을 열 때 0.9MB 를 풀지 않게) ──
let mathMod: typeof import('./mathEval') | null = null;
/** 셈 모듈을 불러 둔다 (한 번만) */
export async function loadMath(): Promise<void> { mathMod ??= await import('./mathEval'); }
/** 이 값이 셈 단계까지 가는가 — parseCommandValue 의 앞 단계(참 · 거짓 · JSON · 느슨한 JSON · 작은따옴표 YAML)로 끝나지 않는 값 */
export function needsMath(valStr: unknown): boolean {
    if (typeof valStr !== 'string') return false;
    const trimmed = valStr.trim();
    if (trimmed === 'true' || trimmed === 'false' || trimmed === 'null' || trimmed === 'undefined') return false;
    try { JSON.parse(trimmed); return false; } catch { /* 다음 */ }
    if ((trimmed.startsWith('{') && trimmed.endsWith('}')) || (trimmed.startsWith('[') && trimmed.endsWith(']'))) { try { const r = JSON5.parse(trimmed); if (isObject(r) || Array.isArray(r)) return false; } catch { /* 다음 */ } }
    if (trimmed.startsWith("'") && trimmed.endsWith("'")) { try { YAML.parse(trimmed); return false; } catch { /* 다음 */ } }
    return true;
}

/**
 * 依次尝试将命令值解析为 JSON、宽松数据字面量或数学表达式，失败后保留字符串。
 * 宽松对象使用 JSON5，单引号文本沿用 YAML；纯数学表达式复用受限实例，其他表达式单独隔离。
 */
export function parseCommandValue(valStr: unknown): any {
    if (typeof valStr !== 'string') return valStr;
    const trimmed = (valStr as string).trim();

    // 检查布尔值/null/undefined
    if (trimmed === 'true') return true;
    if (trimmed === 'false') return false;
    if (trimmed === 'null') return null;
    if (trimmed === 'undefined') return undefined;

    try {
        // 如果字符串能被 JSON.parse 解析，说明它是一个标准格式，直接返回解析结果
        return JSON.parse(trimmed);
    } catch (e) {
        // Accept relaxed data literals without evaluating model-controlled JavaScript.
        if (
            (trimmed.startsWith('{') && trimmed.endsWith('}')) ||
            (trimmed.startsWith('[') && trimmed.endsWith(']'))
        ) {
            try {
                const result = JSON5.parse(trimmed);
                if (isObject(result) || Array.isArray(result)) {
                    return result;
                }
            } catch (err) {
                // 如果解析失败，说明它可能是一个未加引号的字符串或数学表达式，继续往下走
            }
        }
    }

    // 单引号文本提前走原有 YAML 路径，保留反斜杠和双单引号的语义，不初始化数学库。
    if (trimmed.startsWith("'") && trimmed.endsWith("'")) {
        try {
            return YAML.parse(trimmed);
        } catch {
            // 仍可能是含字符串操作数的数学表达式，继续尝试求值。
        }
    }

    // 如果代码走到这里，说明 trimmed 是一个未加引号的字符串，例如：
    // 'hello_world', '10 + 2', 'sqrt(16)'

    // 셈 모듈이 아직 없으면 지금 부를 수 없다(동기 함수) — 갱신 전에 updateVariables 가 needsMath 로 보고 미리 불러 둔다
    if (mathMod) { const r = mathMod.evalMath(trimmed); if (r) return r.v; }

    // 实验性功能，暂不启用
    // 尝试将字符串解析为日期对象，用于传入_.add直接以毫秒数更新时间，如 `_.add('当前时间', 10 * 60 * 1000);`
    // 此检查用于识别日期字符串（例如 "2024-01-01T12:00:00Z"）
    // `isNaN(Number(trimmed))`确保纯数字字符串（如 "12345"）不会被错误地解析为日期
    /*
    if (isNaN(Number(trimmed))) {
        const potentialDate = new Date(trimQuotesAndBackslashes(trimmed));
        if (!isNaN(potentialDate.getTime())) {
            return potentialDate;
        }
    }
    */

    try {
        // 尝试 YAML.parse
        return YAML.parse(trimmed);
    } catch (e) {
        /* empty */
    }

    // 最终，返回这个去除了首尾引号的字符串
    return trimQuotesAndBackslashes(valStr as string);
}

