// ── Dreamland f-presetvars: 프리셋 변수의 화면 아닌 부분 (옛 js/f-presetvars.js 의 setPv) ──
import { S } from './core';
import { pvDefs, pvCoerce } from './cond';
import { t } from '../i18n';

interface PvDef { name: string; [k: string]: unknown }
interface PvChat { pvars?: Record<string, Record<string, unknown>>; [k: string]: unknown }
interface PvStore { presetFor(chat: unknown): { id: string; [k: string]: unknown }; save(coll: 'chats', obj: unknown, silent?: boolean): unknown }
const St = S as unknown as PvStore;
const defsOf = pvDefs as unknown as (p: unknown) => PvDef[];
const coerce = pvCoerce as unknown as (d: PvDef, raw: unknown) => string | number | boolean;

/** 대화방의 값을 바꾼다 (명령에서도 쓴다). 고쳐진 값을 돌려준다 */
export function setPv(chat: PvChat, name: string, value: unknown) {
  const preset = St.presetFor(chat), d = defsOf(preset).find(x => x.name === name);
  if (!d) throw new Error(t('presets.vars.notFound', { name }));
  const v = coerce(d, value); ((chat.pvars ||= {})[preset.id] ||= {})[name] = v;
  St.save('chats', chat, true); return v;
}
