// ── STscript 를 드림랜드 대화에 잇는다 ── 퀵 리플라이 단추 · /명령 입력 · 자동 실행이 모두 여기를 거친다
import { S, emit, msgText, newMsg } from '../lib/core';
import { X } from '../lib/hooks';
import * as E from '../lib/engine';
import { qrActive, qrFind, qrSave, qrStore, type QrItem, type QrSet } from '../lib/qr-data';
import { openModal, promptBox, toast } from '../ui';
import { t } from '../i18n';
import { chatApi, command } from '../chat/actions';
import type { Chat, Msg } from '../lib/types';
import { runScript, Abort, type DebugAction, type DebugInfo, type Host } from './run';
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
    // 디버거: 멈춘 명령 · {{pipe}} · 변수를 보여 주고 계속 · 한 단계 · 멈추기를 받는다 (창을 닫으면 멈추기)
    debug: (i: DebugInfo) => new Promise<DebugAction>(res => {
      let act: DebugAction = 'stop';
      const vars = Object.entries(i.vars);
      openModal({
        title: i.breakpoint ? t('qr.debug.breakpoint') : t('qr.debug.step'), wide: true, onClose: () => res(act),
        body: <div className="qr-debug">
          <small className="hint">{t('qr.debug.depth', { n: i.depth })}</small>
          <pre className="qr-out">{i.command}</pre>
          <h4 className="form-sec">{'{{pipe}}'}</h4><pre className="qr-out">{i.pipe || ' '}</pre>
          <h4 className="form-sec">{t('qr.debug.vars')}</h4>
          {vars.length ? <table className="qr-vars"><tbody>{vars.map(([k, v]) => <tr key={k}><th>{k}</th><td>{v.length > 300 ? v.slice(0, 300) + '…' : v}</td></tr>)}</tbody></table> : <p className="dim">{t('qr.debug.noVars')}</p>}
        </div>,
        actions: [{ label: t('qr.debug.stop'), onclick: () => { act = 'stop'; } }, { label: t('qr.debug.continue'), onclick: () => { act = 'continue'; } }, { label: t('qr.debug.stepBtn'), cls: 'primary', onclick: () => { act = 'step'; } }],
      });
    }),
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
export async function runQrScript(text: string, opt: { pipe?: string; args?: Record<string, string>; onError?: () => void; debug?: boolean } = {}): Promise<string> {
  try { return await runScript(text, appHost(), opt); }
  catch (e) { const msg = e instanceof Error ? e.message : String(e); console.warn('[STscript]', e); toast(t('qr.run.error', { msg }), 'err'); opt.onError?.(); return ''; }
}
/** 퀵 리플라이 단추 하나를 누른 것처럼 */
/**
 * 실리태번 퀵 리플라이 실행 규칙 그대로:
 *  - 손으로 눌렀고 세트의 "입력한 글과 합치기"가 켜져 있으면 입력창 글과 합친다 ("입력한 글 앞에"면 버튼 글이 앞)
 *  - / 로 시작하고 "보내지 않기"가 아니면 스크립트로 돈다
 *  - 아니면 매크로를 바꿔 입력창에 넣고, "보내지 않기"가 아니면 보낸다
 * o.message: 오른쪽 클릭 메뉴처럼 바뀐 글로 돌릴 때. o.auto: 자동 실행 · /run 으로 부를 때 (입력창 글을 쓰지 않는다)
 */
export async function runItem(it: QrItem, o: { set?: QrSet; message?: string; auto?: boolean } = {}): Promise<string> {
  const set = o.set || qrStore().sets.find(s => s.items.includes(it));
  const msg = o.message ?? it.text, typed = chatApi.getInput?.() || '';
  const merge = !o.auto && !!set?.inject && typed.length > 0;
  const text = merge ? (set?.before ? `${msg} ${typed}` : `${typed} ${msg}`) : msg;
  const nosend = !!set?.nosend || it.kind === 'insert';
  if (/^\s*\//.test(text) && !nosend) { if (merge) chatApi.setInput?.(''); return runQrScript(text); }
  const final = appHost().macro(text, {}, '');
  if (nosend) { chatApi.setInput?.(final); return ''; }
  await chatApi.send(final); return '';
}
/** 오른쪽 클릭 메뉴: 버튼에 이어 둔 세트들의 버튼 (실리태번과 같다 — 이어 실행이면 "부모 글 | 고른 글", %%parent%% 는 부모 이름) */
export interface QrMenuNode { label: string; title: string; header?: boolean; depth: number; run?: () => Promise<string> }
export function qrContextMenu(it: QrItem, set: QrSet): QrMenuNode[] {
  const out: QrMenuNode[] = [];
  const walk = (qr: QrItem, own: QrSet, chained: string | null, hier: QrSet[], labels: string[], depth: number) => {
    const message = (chained && qr.text ? `${chained} | ` : '') + qr.text;
    for (const cl of qr.contextList || []) {
      const sub = qrStore().sets.find(s => s.name === cl.set); if (!sub || hier.includes(sub)) continue;
      const nextHier = [...hier, sub], nextLabels = [...labels, qr.label];
      out.push({ label: sub.name, title: '', header: true, depth });
      const ownSet = sub.items.includes(qr);
      for (const s of sub.items.filter(x => ownSet ? x.hidden && !!x.stIcon : !x.hidden)) {
        const subMsg = (cl.isChained && message && s.text ? `${message} | ` : '') + s.text;
        const final = subMsg.replace(/%%parent(-\d+)?%%/g, (_m, i: string | undefined) => nextLabels.slice(parseInt(i ?? '-1'))[0] ?? '');
        out.push({ label: s.label, title: s.title || s.text.slice(0, 200), depth, run: () => runItem(s, { set: sub, message: final }) });
        walk(s, sub, cl.isChained ? message : null, nextHier, nextLabels, depth + 1);
      }
    }
    void own;
  };
  walk(it, set, null, [set], [], 0);
  return out;
}
