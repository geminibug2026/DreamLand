// 초기 변수: 로어북에서 이름(메모)에 [InitVar] 가 든 항목들을 읽어 stat_data 를 만든다. 첫 인사의 <initvar> 블록은 그 인사로 시작하는 대화의 초기 변수를 바꾼다.
// MagVarUpdate (MIT License, Copyright (c) 2025 MagicalAstrogy & StageDog) 의 src/function/initvar/variable_init.ts 를 옮겨 왔다.
/* eslint-disable @typescript-eslint/no-explicit-any */
import { clone, correctlyMerge, get, has, isArray, isObject, isString, set } from './lo';
import { parseString } from './parse';
import { cleanUpMetadata, generateSchema } from './schema';
import type { MvuData } from './types';

export interface InitBook { name: string; entries: { name?: string; comment?: string; content?: string }[] }

export function createEmptyGameData(): MvuData {
  return { display_data: {}, initialized_lorebooks: {}, stat_data: {}, delta_data: {}, schema: { type: 'object', properties: {} } };
}

/** 로어북 항목 본문에서 초기 변수 글을 꺼낸다 (<initvar> 블록 · ``` 코드 블록이면 그 안) */
export function initEntryBody(content: string): string {
  let c = String(content ?? '');
  const xml = c.trim().match(/.*<initvar>.*\n([\s\S]*)\n.*<\/initvar>.*/m); if (xml) c = xml[1];
  const code = c.trim().match(/```.*\n([\s\S]*)\n```/m); if (code) c = code[1];
  return c;
}
export const isInitEntry = (e: { name?: string; comment?: string }) => String(e.comment ?? e.name ?? '').toLowerCase().includes('[initvar]');

/**
 * 아직 읽지 않은 로어북들의 [InitVar] 항목을 mvu_data 에 합친다 (이미 있는 칸이 앞선다).
 * @param onError 항목을 읽지 못했을 때 (그 로어북은 읽은 것으로 치고 넘어간다: 원래 틀과 같다)
 * @returns 무엇이든 새로 읽었는가
 */
export function loadInitVarData(mvu_data: MvuData, books: InitBook[], macros: (t: string) => string = t => t, onError?: (book: string, entry: string, err: Error) => void): boolean {
  let updated = false;
  if (!mvu_data.initialized_lorebooks || Array.isArray(mvu_data.initialized_lorebooks)) {
    const old = Array.isArray(mvu_data.initialized_lorebooks) ? mvu_data.initialized_lorebooks as string[] : [];
    mvu_data.initialized_lorebooks = Object.fromEntries(old.map(n => [n, []]));
  }
  for (const book of books) {
    if (has(mvu_data.initialized_lorebooks, [book.name])) continue;
    mvu_data.initialized_lorebooks[book.name] = [];
    try {
      const merged: Record<string, any> = {};
      for (const e of book.entries || []) {
        if (!isInitEntry(e)) continue;
        let parsed: any;
        try { parsed = parseString(macros(initEntryBody(String(e.content ?? '')))); }
        catch (err) { onError?.(book.name, String(e.comment ?? e.name ?? ''), err as Error); throw err; }
        if (parsed) correctlyMerge(merged, parsed);
      }
      mvu_data.stat_data = { ...merged, ...mvu_data.stat_data };
      updated = true;
    } catch (err) { console.error('[변수 갱신] 초기 변수', err); }
  }
  return updated;
}

/** 새로 읽은 초기 변수에서 구조 기록을 만들고 $meta · 표식을 걷어 낸다 (원래 틀의 initCheck 뒷부분) */
export function finishInit(variables: MvuData, updated: boolean) {
  if (!variables.schema) variables.schema = { extensible: false, properties: {}, type: 'object' };
  if (updated || !variables.schema || (isObject(variables.schema) && Object.keys(variables.schema).length === 0)) {
    const generated: any = generateSchema(clone(variables.stat_data), variables.schema);
    if (generated?.type === 'object') {
      const meta = (variables.stat_data as any).$meta;
      if (meta && has(meta, 'strictTemplate')) generated.strictTemplate = meta.strictTemplate;
      if (meta && has(meta, 'concatTemplateArray')) generated.concatTemplateArray = meta.concatTemplateArray;
      if (meta && has(meta, 'strictSet')) generated.strictSet = meta.strictSet;
      variables.schema = generated;
    }
    cleanUpMetadata(variables.stat_data);
  }
}

/** 첫 인사 글의 <initvar> 블록들 (여럿이면 차례로 합친다). 없으면 null */
export function greetingInitVar(text: string, macros: (t: string) => string = t => t): Record<string, any> | null {
  let applied = false; const out: Record<string, any> = {};
  for (const m of String(text || '').matchAll(/<(initvar)>(?:\s*```.*)?([\s\S]*?)(?:```\s*)?<\/\1>/gim)) {
    try { correctlyMerge(out, parseString(macros(m[2]))); applied = true; } catch (e) { console.error('[변수 갱신] 첫 인사의 <initvar>', e); }
  }
  return applied ? out : null;
}

/**
 * 초기 변수의 설명 글([값, "설명"] 의 둘째 칸 · description 칸)을 메시지 변수에 새로 옮긴다 (값은 그대로)
 * 원래 틀의 updateDescriptions (src/button.ts) 를 옮겼다
 */
export function updateDescriptions(_init_path: string, init_data: any, msg_data: any, target_data: any) {
  if (!isObject(init_data)) return;
  for (const [key, value] of Object.entries(init_data as Record<string, any>)) {
    const p = key;
    if (isArray(value)) {
      if (value.length === 2 && isString(value[1])) {
        const mv = get(msg_data, p);
        if (isArray(mv) && mv.length === 2) {
          set(target_data, `${p}[1]`, value[1]);
          if (isObject(value[0]) && !isArray(value[0])) {
            const tObj = get(target_data, `${key}[0]`);
            if (has(value[0], 'description') && isString((value[0] as any).description) && has(mv[0], 'description')) set(target_data, `${p}[0].description`, (value[0] as any).description);
            updateDescriptions(`${p}[0]`, value[0], mv[0], tObj);
          } else if (isArray(value[0])) updateDescriptions(`${p}[0]`, value[0], mv[0], target_data?.[0]);
        }
      } else if (isArray(get(msg_data, p))) {
        const arr = get(msg_data, p) as any[];
        value.forEach((item: any, i: number) => {
          if (i < arr.length && isObject(item)) {
            const ct = get(target_data, `${p}[${i}]`);
            if (has(item, 'description') && isString((item as any).description) && has(arr[i], 'description')) set(ct, 'description', (item as any).description);
            updateDescriptions(`${p}[${i}]`, value[i], arr[i], ct);
          }
        });
      }
    } else if (isObject(value)) {
      if (has(value, 'description') && isString((value as any).description) && has(msg_data, `${key}.description`)) set(target_data, `${key}.description`, (value as any).description);
      if (has(msg_data, key) && isObject(msg_data[key])) updateDescriptions(p, value, msg_data[key], target_data?.[key]);
    }
  }
}
