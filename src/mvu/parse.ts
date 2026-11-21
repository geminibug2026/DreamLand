// 글 → 값: 초기 변수 · 패치 본문(YAML · JSON · JSON5 · 망가진 JSON)과 갱신 명령의 값 하나.
// MagVarUpdate(MIT, © 2025 MagicalAstrogy & StageDog)의 parseString · parseCommandValue 규칙을 따른다.
import YAML from 'yaml';
import JSON5 from 'json5';
import { jsonrepair } from 'jsonrepair';
import { isObject } from './lo';
import { evalMath } from './math';

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

/**
 * 명령의 값 하나를 읽는다: true/false/null/undefined → JSON → 느슨한 {…}/[…] (JSON5) → '작은따옴표 글'(YAML) → 셈 → YAML → 앞뒤 따옴표를 뗀 글
 */
export function parseCommandValue(valStr: unknown): any {
  if (typeof valStr !== 'string') return valStr;
  const t = valStr.trim();
  if (t === 'true') return true;
  if (t === 'false') return false;
  if (t === 'null') return null;
  if (t === 'undefined') return undefined;
  try { return JSON.parse(t); } catch {
    if ((t.startsWith('{') && t.endsWith('}')) || (t.startsWith('[') && t.endsWith(']'))) {
      try { const r = JSON5.parse(t); if (isObject(r)) return r; } catch { /* 셈이나 글일 수 있다 */ }
    }
  }
  if (t.startsWith("'") && t.endsWith("'")) { try { return YAML.parse(t); } catch { /* 셈일 수 있다 */ } }
  try {
    const r = evalMath(t);
    if (r !== undefined) return parseFloat(r.toPrecision(12));
  } catch { /* 셈이 아니다 */ }
  try { return YAML.parse(t); } catch { /* 그냥 글 */ }
  return trimQuotesAndBackslashes(valStr);
}
