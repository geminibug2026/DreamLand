// ── STscript 를 드림랜드 대화에 잇는다 ── 퀵 리플라이 단추 · /명령 입력 · 자동 실행이 모두 여기를 거친다
import { S, emit, msgText, newMsg } from '../lib/core';
import { X } from '../lib/hooks';
import * as E from '../lib/engine';
import { qrActive, qrFind, qrSave, qrStore, type QrItem } from '../lib/qr-data';
import { openModal, promptBox, toast } from '../ui';
import { t } from '../i18n';
import { chatApi, command } from '../chat/actions';
import type { Chat, Msg } from '../lib/types';
import { runScript, Abort, type Host } from './run';
import './commands';
import './ext';

/** 드림랜드 기본 명령 가운데 스크립트에서 그대로 부를 수 있는 것 (나머지는 STscript 명령이 맡는다) */
const NATIVE = new Set(['roll', 'r', 'dice', 'note', 'bg', 'help', '?']);
let stopAll = 0;
/** 돌고 있는 스크립트를 모두 멈춘다 (생성 멈춤 단추 · Esc) */
export const stopScripts = () => { stopAll = Date.now(); };

const cur = () => chatApi.current();
const chars = (chat: Chat) => chat.charIds.map(id => S.get('chars', id)).filter(Boolean) as NonNullable<ReturnType<typeof S.get<'chars'>>>[];
/** "0-3" · "-1" · "2" → 메시지 번호들 */
function range(spec: string, n: number): number[] {
  const s = spec.trim(); if (!s) return n ? [n - 1] : [];
  const m = /^(-?\d+)\s*-\s*(-?\d+)$/.exec(s);
  const fix = (x: number) => x < 0 ? n + x : x;
  if (m) { const a = fix(+m[1]), b = fix(+m[2]); const out: number[] = []; for (let i = Math.max(0, a); i <= Math.min(n - 1, b); i++) out.push(i); return out; }
  const i = fix(+s); return Number.isInteger(i) && i >= 0 && i < n ? [i] : [];
}
const choose = (text: string, labels: string[]) => new Promise<string>(res => {
  let done = false;
  const m = openModal({ title: text || t('qr.run.choose'), onClose: () => { if (!done) res(''); },
    body: <div className="row wrap">{labels.map(l => <button key={l} type="button" className="btn ghost" onClick={() => { done = true; res(l); m.close(); }}>{l}</button>)}</div> });
});

export function appHost(started = Date.now()): Host {
  const chatNow = () => cur().chat;
  const saveChat = async () => { const c = chatNow(); if (c) await S.save('chats', c, true); };
  return {
    macro(text, scope, pipe) {
      const { chat, msgs } = cur();
      if (!chat) return E.macro(text, { scope, pipe, vars: {}, user: S.persona(null as unknown as Chat)?.name, input: chatApi.getInput?.() });
      const cs = chars(chat);
      const ctx = E.makeCtx({ chat, char: cs[0], chars: cs, persona: S.persona(chat), msgs, input: chatApi.getInput?.() || '' });
      return E.macro(text, { ...ctx, scope, pipe, vars: (chat.vars ||= {}) });
    },
    getVar: k => { const v = chatNow()?.vars?.[k]; return v === undefined ? undefined : String(v); },
    setVar: async (k, v) => { const c = chatNow(); if (!c) throw new Error(t('qr.run.noChat')); (c.vars ||= {})[k] = v; await saveChat(); },
    delVar: async k => { const c = chatNow(); if (c?.vars) { delete c.vars[k]; await saveChat(); } },
    getGlobal: k => { const v = S.settings.globalVars?.[k]; return v === undefined ? undefined : String(v); },
    setGlobal: (k, v) => { (S.settings.globalVars ||= {})[k] = v; S.saveSettings(); },
    delGlobal: k => { delete S.settings.globalVars?.[k]; S.saveSettings(); },
    async fallback(name, arg) {
      const ext = X.commands.get('/' + name);
      if (ext) { const r = await ext.run(arg, chatApi); return typeof r === 'string' ? r : ''; }
      if (NATIVE.has(name)) { await command(`/${name} ${arg}`.trim()); return ''; }
      return null;
    },
    findQr: key => { const f = qrFind(key, cur().chat); return f ? { text: f.item.text, label: f.item.label } : null; },
    echo: (text, sev) => { if (text) toast(text, sev === 'error' ? 'err' : sev === 'success' ? 'ok' : ''); },
    stopped: () => stopAll > started,
    popup: (text: string) => new Promise<string>(res => { openModal({ title: '', body: <div className="pre-wrap">{text}</div>, onClose: () => res(''), actions: [{ label: t('common.ok') }] }); }),
    input: async (q: string, dflt: string) => { const r = await promptBox(q || t('qr.run.input'), dflt, { area: q.length > 60 }); if (r === null) throw new Abort(true); return r; },
    buttons: (text: string, labels: string[]) => choose(text, labels),
    setInput: (text: string) => { chatApi.setInput?.(text); return ''; },
    send: async (text: string) => { const c = chatNow(); if (!c) throw new Error(t('qr.run.noChat')); await chatApi.push?.(newMsg('user', text, { name: S.persona(c).name })); return ''; },
    sendAs: async (name: string, text: string) => { const c = chatNow(); if (!c) throw new Error(t('qr.run.noChat')); const cs = chars(c), ch = cs.find(x => x.name === name) || cs[0]; const m = newMsg('assistant', text, { name: name || ch?.name || '' }); m.charId = ch?.id || ''; await chatApi.push?.(m); return ''; },
    sys: async (text: string) => { if (!chatNow()) throw new Error(t('qr.run.noChat')); await chatApi.push?.(newMsg('system', text)); return ''; },
    comment: async (text: string) => { if (!chatNow()) throw new Error(t('qr.run.noChat')); await chatApi.push?.(newMsg('system', text, { hidden: true })); return ''; },
    trigger: async () => { await chatApi.generate('normal'); return ''; },
    generate: async (type: string) => { await chatApi.generate(type); return ''; },
    stopGen: () => { chatApi.stop?.(); return ''; },
    async gen(prompt: string, o: { raw?: boolean; system?: string }) {
      const { chat, msgs } = cur();
      if (o.raw || !chat) return E.quickCall(o.system || '', prompt, { conn: chat ? S.connFor(chat) : S.conn() });
      const conn = S.connFor(chat); if (!conn) throw new Error(t('chat.gen.noConn'));
      const cs = chars(chat), preset = S.presetFor(chat);
      const built = E.buildPrompt({ chat, char: cs[0], chars: cs, persona: S.persona(chat), preset, msgs: [...msgs, newMsg('system', prompt)], type: 'quiet' });
      const r = await E.streamChat(conn, { ...preset.params, stream: false, prefill: '' }, built.messages);
      return E.splitThink(r.text).text.trim();
    },
    messages: (spec: string, names: boolean) => { const { msgs } = cur(); return range(spec, msgs.length).map(i => msgs[i]).map((m: Msg) => names ? `${m.name || m.role}: ${msgText(m)}` : msgText(m)).join('\n\n'); },
    hide: async (spec: string, on: boolean) => { const { msgs } = cur(); for (const i of range(spec, msgs.length)) msgs[i].hidden = on; await chatApi.save(); chatApi.redraw(); return ''; },
    qrIndex: async (n: number) => { const items = qrActive(cur().chat).flatMap(s => s.items.filter(i => !i.hidden)); const it = items[n]; if (!it) throw new Error(t('qr.run.noIndex', { n })); return runItem(it); },
    qrToggle: (name: string, state: boolean | null, scope: 'global' | 'chat') => {
      const set = qrStore().sets.find(s => s.name === name); if (!set) throw new Error(t('qr.run.noSet', { name }));
      if (scope === 'global') { set.on = state ?? !set.on; qrSave(); return ''; }
      const c = chatNow(); if (!c) throw new Error(t('qr.run.noChat'));
      const off = new Set((c.qrOff as string[] | undefined) || []); const turnOn = state ?? off.has(set.id); if (turnOn) off.delete(set.id); else off.add(set.id);
      c.qrOff = [...off]; void saveChat(); emit('qr:changed'); return '';
    },
  };
}

/** 스크립트를 돌린다. 오류는 알림으로 보여 주고 빈 글자를 돌려준다 */
export async function runQrScript(text: string, opt: { pipe?: string; args?: Record<string, string>; onError?: () => void } = {}): Promise<string> {
  try { return await runScript(text, appHost(), opt); }
  catch (e) { const msg = e instanceof Error ? e.message : String(e); console.warn('[STscript]', e); toast(t('qr.run.error', { msg }), 'err'); opt.onError?.(); return ''; }
}
/** 퀵 리플라이 단추 하나를 누른 것처럼 */
export async function runItem(it: QrItem): Promise<string> {
  if (it.kind === 'script' || /^\s*\//.test(it.text)) return runQrScript(it.text);
  const text = appHost().macro(it.text, {}, '');
  if (it.kind === 'insert') { chatApi.insert(text); return ''; }
  await chatApi.send(text); return '';
}
