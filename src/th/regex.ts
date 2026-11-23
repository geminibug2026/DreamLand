// 정규식: Tavern Helper 의 tavern_regex 함수. 실리태번 정규식 꼴 ↔ 드림랜드는 가져오기 · 내보내기의 변환(regexToSt · stRegexToRegex)을 쓴다
import { S, emit } from '../lib/core';
import { applyRegex, regexAllowed } from '../lib/engine';
import { regexToSt, scopedRegex, stRegexToRegex, type StRegex } from '../lib/cards';
import type { Regex } from '../lib/types';
import { type Ctx, type Obj, chat, curChar, fail, findChar, isObj, presetOf, redraw, remember, str } from './util';

/** 드림랜드 정규식 → Tavern Helper 꼴 */
export function toTh(r: Regex, scope?: 'global' | 'character'): Obj {
  const st = regexToSt(r);
  return {
    id: r.id, script_name: r.name, enabled: !!r.enabled, ...(scope ? { scope } : {}), find_regex: st.findRegex, trim_strings: [...st.trimStrings], replace_string: st.replaceString,
    source: { user_input: !!r.onUser, ai_output: !!r.onAI, slash_command: !!r.onSlash, world_info: !!r.onLore, reasoning: !!r.onReason },
    destination: { display: st.markdownOnly, prompt: st.promptOnly }, run_on_edit: !!st.runOnEdit, min_depth: st.minDepth ?? null, max_depth: st.maxDepth ?? null,
  };
}
/** Tavern Helper 꼴 → 드림랜드 정규식 (같은 id 의 옛것이 있으면 차례 · 매크로 넣기 방식 같은 드림랜드 칸을 지킨다) */
function fromTh(x: Obj, scope: string, old?: Regex): Regex {
  const src = isObj(x.source) ? x.source : {}, dst = isObj(x.destination) ? x.destination : {};
  const st: StRegex = {
    id: str(x.id), scriptName: str(x.script_name ?? old?.name ?? ''), findRegex: str(x.find_regex ?? ''), replaceString: str(x.replace_string ?? ''), trimStrings: Array.isArray(x.trim_strings) ? x.trim_strings : [],
    placement: [src.user_input && 1, src.ai_output && 2, src.slash_command && 3, src.world_info && 5, src.reasoning && 6].filter(Boolean), disabled: x.enabled === false,
    markdownOnly: !!dst.display, promptOnly: !!dst.prompt, runOnEdit: !!x.run_on_edit, minDepth: x.min_depth ?? null, maxDepth: x.max_depth ?? null, substituteRegex: old?.subst ?? 0,
  };
  const r = stRegexToRegex(st, scope);
  if (old) { r.id = old.id; r.order = old.order; if (old.createdAt) r.createdAt = old.createdAt; }
  else if (str(x.id)) r.id = str(x.id);
  return r;
}
type Opt = { type?: string; name?: unknown };
const optOf = (o: unknown): Opt => (isObj(o) ? o : { type: 'global' }) as Opt;
const ordered = (list: Regex[]) => list.map((r, i) => [r, i] as const).sort((a, b) => (+(a[0].order as number) || 0) - (+(b[0].order as number) || 0) || a[1] - b[1]).map(x => x[0]);
function listOf(o: Opt): Obj[] {
  if (o.type === 'character') { const ch = findChar(o.name ?? 'current'); if (!ch) return fail('noChar', { name: str(o.name ?? 'current') }); return scopedRegex(ch.id).map(r => toTh(r as Regex, 'character')); }
  if (o.type === 'preset') { const p = presetOf(o.name ?? 'in_use'); if (!p) return fail('noPreset', { name: str(o.name) }); return (p.regex || []).map(r => toTh(r)); }
  return ordered(S.regex.filter(r => !r.scope || r.scope === 'global')).map(r => toTh(r, 'global'));
}
async function replace(list: unknown, o: Opt) {
  const arr = (Array.isArray(list) ? list : []).filter(isObj);
  if (o.type === 'preset') {
    const p = presetOf(o.name ?? 'in_use'); if (!p) return fail('noPreset', { name: str(o.name) });
    const old = new Map((p.regex || []).map(r => [r.id, r])), before = structuredClone(p);
    p.regex = arr.map((x, i) => ({ ...fromTh(x, 'preset', old.get(str(x.id))), order: i }));
    await remember('presets', p.id, p.name, before as unknown as Obj); await S.save('presets', p); redraw(); return;
  }
  const ch = o.type === 'character' ? findChar(o.name ?? 'current') : null;
  if (o.type === 'character' && !ch) return fail('noChar', { name: str(o.name ?? 'current') });
  const scope = ch ? ch.id : 'global', mine = (r: Regex) => ch ? r.scope === ch.id : (!r.scope || r.scope === 'global');
  const have = S.regex.filter(mine), byId = new Map(have.map(r => [r.id, r])), keep = new Set<string>();
  for (const [i, x] of arr.entries()) {
    const old = byId.get(str(x.id)), r = { ...fromTh(x, scope, old), order: i };
    if (!old && S.get('regex', r.id)) r.id = r.id + '-' + i;   // 다른 범위에 같은 id 가 있으면 새 것으로
    keep.add(r.id);
    if (!old || JSON.stringify({ ...old, updatedAt: 0 }) !== JSON.stringify({ ...r, updatedAt: 0 })) await S.save('regex', r, true);
  }
  for (const r of have) if (!keep.has(r.id)) { await remember('regex', r.id, r.name, structuredClone(r) as unknown as Obj, true); await S.remove('regex', r.id); }
  emit('regex', null);   // 한 번만 알려 편집 화면을 다시 그리게 한다
  redraw();
}
const WHO: Record<string, string> = { user_input: 'user', ai_output: 'ai', slash_command: 'slash', world_info: 'lore', reasoning: 'reason' };

type F = (c: Ctx, ...a: unknown[]) => unknown;
export const regex: Record<string, F> = {
  getTavernRegexes: (_c, o) => listOf(optOf(o)),
  replaceTavernRegexes: (_c, list, o) => replace(list, optOf(o)),
  isCharacterTavernRegexesEnabled: () => { const ch = curChar(); return !!ch && regexAllowed('chars', ch.id); },
  formatAsTavernRegexedString: (_c, text, source, dest, o) => {
    const op = isObj(o) ? o : {}, ch = op.character_name ? findChar(op.character_name) : curChar();
    return applyRegex(str(text), { who: WHO[str(source)] || 'ai', target: str(dest) === 'prompt' ? 'prompt' : 'display', depth: typeof op.depth === 'number' ? op.depth : undefined, charId: ch?.id, chat: chat() });
  },
};
