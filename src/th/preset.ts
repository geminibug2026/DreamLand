// 프리셋: Tavern Helper 의 preset 함수. 드림랜드 프리셋 ↔ 실리태번 채팅 완성형 프리셋 꼴은 가져오기 · 내보내기의 변환(presetToSt · stPresetToPreset)을 쓰고,
// 그 위에 Tavern Helper 의 변환(toPreset · fromPreset)을 그대로 옮겨 왔다. 드림랜드에만 있는 것(조건 · 프리셋 변수 · 장기기억 자리)은 지킨다
import { S, defaultPreset } from '../lib/core';
import { presetToSt, stKeepsBlock, stPresetToPreset, type DPreset } from '../lib/cards';
import type { Preset, PresetBlock } from '../lib/types';
import { t } from '../i18n';
import { toTh as regexToTh } from './regex';
import { type Ctx, type Obj, chat, fail, isObj, mayDelete, presetOf, redraw, remember, str, undoToast } from './util';

const SYSTEM = ['main', 'nsfw', 'jailbreak', 'enhanceDefinitions'];
const HOLDER = ['worldInfoBefore', 'personaDescription', 'charDescription', 'charPersonality', 'scenario', 'worldInfoAfter', 'dialogueExamples', 'chatHistory'];
const isSys = (p: Obj) => SYSTEM.includes(str(p.id)), isHolder = (p: Obj) => HOLDER.includes(str(p.id)), isNormal = (p: Obj) => !isSys(p) && !isHolder(p);
const NAMES: Record<number, string> = { [-1]: 'none', 0: 'default', 2: 'content', 1: 'completion' };
const NAMES_N: Record<string, number> = { none: -1, default: 0, content: 2, completion: 1 };

function toPrompt(p: Obj, order: Obj[]): Obj {
  const normal = p.system_prompt === false && !p.marker, sys = p.system_prompt === true && !p.marker, holder = p.marker === true;
  const out: Obj = { id: p.identifier ?? crypto.randomUUID(), name: p.name ?? 'unnamed', enabled: (order.find(o => o.identifier === p.identifier)?.enabled as boolean | undefined) ?? p.enabled ?? true };
  if (normal || holder) out.position = Number(p.injection_position) === 1 ? { type: 'in_chat', depth: p.injection_depth ?? 4, order: p.injection_order ?? 100 } : { type: 'relative' };
  out.role = p.role ?? 'system';
  if (normal || sys) out.content = p.content ?? '';
  if (p.extra) out.extra = p.extra;
  return out;
}
function fromPrompt(p: Obj): Obj {
  const out: Obj = { identifier: p.id, name: p.name, enabled: p.enabled };
  const pos = isObj(p.position) ? p.position : {};
  if ((isNormal(p) || isHolder(p)) && !['dialogueExamples', 'chatHistory'].includes(str(p.id))) Object.assign(out, { injection_position: (pos.type ?? 'relative') === 'relative' ? 0 : 1, injection_depth: pos.depth ?? 4, injection_order: pos.order ?? 100 });
  out.role = p.role ?? 'system';
  if (isNormal(p) || isSys(p)) out.content = p.content ?? '';
  out.system_prompt = isSys(p) || isHolder(p); out.marker = isHolder(p);
  if (p.extra) out.extra = p.extra;
  out.forbid_overrides = false;
  return out;
}
/** 실리태번 프리셋 JSON → Tavern Helper 꼴 */
function toPreset(j: Obj): Obj {
  const orders = (Array.isArray(j.prompt_order) ? j.prompt_order : []) as Obj[], order = ((orders.find(o => o.character_id === 100001) || orders[orders.length - 1])?.order || []) as Obj[];
  const all = ((Array.isArray(j.prompts) ? j.prompts : []) as Obj[]).map(p => toPrompt(p, order)), ids = order.map(o => str(o.identifier));
  const used = ids.map(id => all.find(p => p.id === id)).filter((x): x is Obj => !!x), unused = all.filter(p => !ids.includes(str(p.id)));
  const ext = isObj(j.extensions) ? structuredClone(j.extensions) : {}; delete ext.dreamland;
  ext.regex_scripts = []; ext.tavern_helper = isObj(ext.tavern_helper) ? ext.tavern_helper : { scripts: [], variables: {} };
  return {
    settings: {
      max_context: Number(j.openai_max_context), max_completion_tokens: Number(j.openai_max_tokens), reply_count: Number(j.n ?? 1), should_stream: !!j.stream_openai,
      temperature: Number(j.temperature), frequency_penalty: Number(j.frequency_penalty), presence_penalty: Number(j.presence_penalty), top_p: Number(j.top_p), repetition_penalty: Number(j.repetition_penalty),
      min_p: Number(j.min_p), top_k: Number(j.top_k), top_a: Number(j.top_a), seed: Number(j.seed), squash_system_messages: !!j.squash_system_messages, reasoning_effort: str(j.reasoning_effort || 'auto'),
      request_thoughts: !!j.show_thoughts, request_images: !!j.request_images, enable_function_calling: !!j.function_calling, enable_web_search: !!j.enable_web_search,
      allow_sending_images: j.image_inlining ? str(j.inline_image_quality || 'auto') : 'disabled', allow_sending_videos: !!j.video_inlining, character_name_prefix: NAMES[Number(j.names_behavior ?? -1)] || 'none', wrap_user_messages_in_quotes: !!j.wrap_in_quotes,
    },
    prompts: used, prompts_unused: unused, extensions: ext,
  };
}
/** Tavern Helper 꼴 → 실리태번 프리셋 JSON 의 바뀐 칸들 (그 밖의 칸은 원래 JSON 을 따른다) */
function fromPreset(x: Obj): Obj {
  const ids = new Set<string>(), fix = (list: unknown) => ((Array.isArray(list) ? list : []) as Obj[]).filter(isObj).map(p => {
    let id = str(p.id || crypto.randomUUID());
    if (ids.has(id)) { if (!isNormal(p)) fail('dupPrompt', { id }); id = crypto.randomUUID(); }
    ids.add(id); return { ...p, id };
  });
  const used = fix(x.prompts).map(fromPrompt), unused = fix(x.prompts_unused).map(fromPrompt), s = isObj(x.settings) ? x.settings : {};
  const out: Obj = { prompts: [...used, ...unused], prompt_order: [{ character_id: 100001, order: used.map(p => ({ identifier: p.identifier, enabled: p.enabled ?? true })) }] };
  const map: [string, string][] = [['max_context', 'openai_max_context'], ['max_completion_tokens', 'openai_max_tokens'], ['reply_count', 'n'], ['should_stream', 'stream_openai'], ['temperature', 'temperature'], ['frequency_penalty', 'frequency_penalty'], ['presence_penalty', 'presence_penalty'], ['top_p', 'top_p'], ['repetition_penalty', 'repetition_penalty'], ['min_p', 'min_p'], ['top_k', 'top_k'], ['top_a', 'top_a'], ['seed', 'seed'], ['squash_system_messages', 'squash_system_messages'], ['reasoning_effort', 'reasoning_effort'], ['request_thoughts', 'show_thoughts'], ['request_images', 'request_images'], ['enable_function_calling', 'function_calling'], ['enable_web_search', 'enable_web_search'], ['allow_sending_videos', 'video_inlining'], ['wrap_user_messages_in_quotes', 'wrap_in_quotes']];
  for (const [a, b] of map) if (s[a] !== undefined) out[b] = s[a];
  if (s.allow_sending_images !== undefined) { out.image_inlining = s.allow_sending_images !== 'disabled'; out.inline_image_quality = s.allow_sending_images === 'disabled' ? 'auto' : s.allow_sending_images; }
  if (s.character_name_prefix !== undefined) out.names_behavior = NAMES_N[str(s.character_name_prefix)] ?? -1;
  if (isObj(x.extensions)) out.extensions = x.extensions;
  return out;
}

/** 드림랜드 프리셋 → Tavern Helper 꼴 (정규식은 드림랜드가 따로 갖고 있으므로 그 자리에 넣어 준다) */
export function presetToTh(p: Preset): Obj {
  const o = toPreset(presetToSt(p as unknown as DPreset) as Obj);
  (o.extensions as Obj).regex_scripts = (p.regex || []).map(r => regexToTh(r));
  return o;
}
/** Tavern Helper 꼴을 드림랜드 프리셋 p 에 적는다 (id · 이름 · 프리셋 변수 · 조건 · 장기기억 자리처럼 드림랜드에만 있는 것은 지킨다) */
function applyTh(p: Preset, x: Obj): Preset {
  const base = presetToSt(p as unknown as DPreset) as Obj, patch = fromPreset(x);
  const ext = isObj(patch.extensions) ? { ...patch.extensions } : null;
  if (ext) {   // 정규식은 Tavern Helper 꼴(source 가 있는 것)이면 실리태번 꼴로
    const rs = Array.isArray(ext.regex_scripts) ? ext.regex_scripts as Obj[] : null;
    if (rs) ext.regex_scripts = rs.map(r => isObj(r.source) ? { id: r.id, scriptName: r.script_name, findRegex: r.find_regex, replaceString: r.replace_string, trimStrings: r.trim_strings || [], placement: [(r.source as Obj).user_input && 1, (r.source as Obj).ai_output && 2, (r.source as Obj).slash_command && 3, (r.source as Obj).world_info && 5, (r.source as Obj).reasoning && 6].filter(Boolean), disabled: r.enabled === false, markdownOnly: !!(r.destination as Obj)?.display, promptOnly: !!(r.destination as Obj)?.prompt, runOnEdit: !!r.run_on_edit, minDepth: r.min_depth ?? null, maxDepth: r.max_depth ?? null } : r);
    ext.dreamland = (base.extensions as Obj | undefined)?.dreamland;
  }
  const merged = { ...base, ...patch, ...(ext ? { extensions: ext } : {}) };
  const made = stPresetToPreset(merged as never, p.name).preset as unknown as Preset;
  // 블록의 드림랜드 칸(조건 · 감싸는 태그 · id)을 같은 자리의 옛 블록에서 가져온다
  const old = p.blocks || [], key = (b: PresetBlock) => b.kind === 'text' ? 'text:' + str(b.stId || b.id) : b.kind;
  const byKey = new Map(old.map(b => [key(b), b]));
  const hadSum = old.some(b => b.kind === 'summary');
  made.blocks = made.blocks.filter(b => b.kind !== 'summary' || hadSum).map(b => { const o = byKey.get(key(b)); if (!o) return b; /* 장기기억 자리처럼 드림랜드에만 있는 블록은 그대로 */ if (!stKeepsBlock(b.kind)) return o; const keep: Obj = {}; for (const k of ['id', 'when', 'wrapTag']) if (o[k] !== undefined) keep[k] = o[k]; return { ...b, ...keep }; });
  const oldRegex = new Map((p.regex || []).map(r => [r.id, r]));
  made.regex = (made.regex || []).map(r => { const o = oldRegex.get(r.id); return o ? { ...r, subst: o.subst, createdAt: o.createdAt } : r; });
  return { ...made, id: p.id, name: p.name, createdAt: p.createdAt, ...(p.vars ? { vars: p.vars } : {}), ...(p.noSetup ? { noSetup: p.noSetup } : {}) } as Preset;
}
async function save(p: Preset, before: Preset | null) {
  const i = S.presets.findIndex(x => x.id === p.id);
  if (i >= 0) S.presets[i] = p;
  await S.save('presets', p); redraw();
  await remember('presets', p.id, p.name, before as unknown as Obj | null, !before);
}
const need = (name: unknown): Preset => presetOf(name) || fail('noPreset', { name: str(name) });
/** lodash 의 merge 와 같다 (배열은 자리마다 합친다) */
export function deepMerge(a: unknown, b: unknown): unknown {
  if (b === undefined) return a;
  if (Array.isArray(a) && Array.isArray(b)) { const out = [...a]; b.forEach((v, i) => { out[i] = deepMerge(a[i], v); }); return out; }
  if (isObj(a) && isObj(b)) { const out: Obj = { ...a }; for (const [k, v] of Object.entries(b)) out[k] = deepMerge(a[k], v); return out; }
  return structuredClone(b);
}

type F = (c: Ctx, ...a: unknown[]) => unknown;
export const preset: Record<string, F> = {
  getPresetNames: () => ['in_use', ...S.presets.map(p => p.name)],
  getLoadedPresetName: () => S.presetFor(chat()).name,
  loadPreset: (_c, name) => { const p = S.presets.find(x => x.name === str(name)) || S.get('presets', str(name)); if (!p) return false; S.set({ activePreset: p.id }); redraw(); return true; },
  getPreset: (_c, name) => presetToTh(need(name ?? 'in_use')),
  createPreset: async (_c, name, x) => {
    const n = str(name).trim(); if (!n || n === 'in_use') return fail('noName');
    if (S.presets.some(p => p.name === n)) return false;
    const p = defaultPreset(); p.name = n;
    await save(isObj(x) ? applyTh(p, x) : p, null); return true;
  },
  createOrReplacePreset: async (c, name, x, opt) => {
    if (presetOf(name)) { await preset.replacePreset(c, name, x, opt); return false; }
    return preset.createPreset(c, name, x);
  },
  replacePreset: async (_c, name, x) => { const p = need(name); if (!isObj(x)) return fail('badPreset'); const before = structuredClone(p); await save(applyTh(p, x), before); },
  setPreset: async (c, name, x) => { const p = need(name), next = deepMerge(presetToTh(p), isObj(x) ? x : {}) as Obj; await preset.replacePreset(c, name, next); return presetToTh(need(name)); },
  deletePreset: async (c, name) => {
    const p = S.presets.find(x => x.name === str(name)); if (!p) return false;
    if (S.presets.length < 2) return fail('lastPreset');
    if (!(await mayDelete(c, t('th.what.preset'), p.name))) return false;
    const before = structuredClone(p);
    await S.remove('presets', p.id);
    if (S.settings.activePreset === p.id) S.set({ activePreset: S.presets[0].id });
    const undo = await remember('presets', p.id, p.name, before as unknown as Obj, true);
    if (c.script) undoToast(t('th.undo.deleted', { what: t('th.what.preset'), name: p.name }), undo);
    return true;
  },
  renamePreset: async (_c, name, to) => {
    const p = S.presets.find(x => x.name === str(name)), n = str(to).trim(); if (!p) return false;
    if (!n || n === 'in_use' || S.presets.some(x => x !== p && x.name === n)) return false;
    const before = structuredClone(p); p.name = n; await save(p, before); return true;
  },
};
