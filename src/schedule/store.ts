// 일정 저장(char.ext.dreamSchedule — 카드로 내보내도 따라간다)과 AI 로 일정 짜기
import { mod } from '../legacy';
import { B, type CharX } from '../addons/legacy';
import { DAYS, DAY_EN, fmtMin, hasBlocks, normWeek, parseSchedule, type Block, type Sched } from './logic';

export const SCHEDULE_PROMPT = `You plan the ordinary week of a fictional character, so that texting them feels like texting someone who has a life of their own.

<character name="{{char}}">
{{description}}
</character>
{{guide}}
Write {{char}}'s routine for {{scope}}. Rules:
- Each day is a list of blocks that together cover 00:00 to 24:00 with no gaps and no overlaps. Use 24-hour "HH:MM-HH:MM" times. A block that runs past midnight is split at 00:00 into two blocks.
- 5 to 10 blocks per day. Weekdays and days off should differ the way they would for this person.
- "status" is how reachable they are by text: "online" (free, phone in hand), "idle" (half-available: meals, commuting, getting ready), "dnd" (busy: work, class, practice — replies come slowly), "offline" (asleep or truly unreachable).
- "activity" is a short phrase in the language of the character sheet (Korean if unsure), the way {{char}} would put it.
- Stay faithful to the sheet: their job or school, habits, world and era. This is a normal week, so do not invent dramatic events.

Reply with ONLY one JSON object — no markdown, no comments, no ellipsis:
{"days":{"Monday":[{"time":"00:00-07:00","status":"offline","activity":"…"},{"time":"07:00-08:00","status":"idle","activity":"…"}],"Tuesday":[]}}
{{shape}}`;

/** 옛 일정 모듈: 대화 화면(chat.js · live.js)이 이것의 Schedule 을 부른다 */
export interface OldSchedule {
  Schedule: {
    onChange: ((ch: CharX) => void) | null;
    edit(ch: CharX, o?: { onClose?: () => void }): unknown;
    row(ch: CharX, onDone?: () => void): Node;
  };
}
export const old = () => mod<OldSchedule>('f-schedule').Schedule;

interface Modes { sched?: boolean; schedPrompt?: string }
const modes = () => (B.S.settings.modes || {}) as Modes;
/** 캐릭터에 저장된 일정 (없으면 null). 꺼 둔 일정은 raw 로만 보인다 */
export const rawSchedule = (ch?: CharX | null) => (ch?.ext?.dreamSchedule as Sched | undefined) || null;
export const scheduleOf = (ch?: CharX | null) => { const s = rawSchedule(ch); return s && s.on !== false && modes().sched !== false && hasBlocks(s) ? s : null; };
let saveChar: ((ch: CharX) => void) | null = null;
export function putSchedule(ch: CharX, patch: Partial<Sched>): Sched {
  saveChar ||= B.core.debounce((c: CharX) => { void B.S.save('chars', c, true); }, 350);
  const next: Sched = { on: true, days: Array.from({ length: 7 }, () => []), guide: '', ...(rawSchedule(ch) || {}), ...patch, at: B.core.now() };
  (ch.ext ||= {}).dreamSchedule = next;
  saveChar(ch); old().onChange?.(ch);
  return next;
}

/** LLM 으로 일주일(또는 하루) 일정을 짠다 — 호출 1회 */
export async function generate(ch: CharX, { guide = '', only = -1, signal }: { guide?: string; only?: number; signal?: AbortSignal } = {}): Promise<Block[][]> {
  const S = B.S, helpers = S.settings.helpers as { all?: string } | undefined;
  const conn = S.get('conns', helpers?.all) || S.get('conns', ch.bind?.connId) || S.conn();
  if (!conn) throw new Error('먼저 API 연결을 추가해 주세요.');
  const cur = rawSchedule(ch), sheet = [ch.description, ch.personality && `Personality: ${ch.personality}`, ch.scenario && `Situation: ${ch.scenario}`].filter(Boolean).join('\n').replace(/\{\{char\}\}/gi, ch.name).replace(/\{\{user\}\}/gi, (S.settings.userNameFallback as string) || 'the user').slice(0, 6000);
  const others = only >= 0 && cur && hasBlocks(cur) ? DAY_EN.map((d, i) => i === only ? '' : `${d}: ${(cur.days[i] || []).map(b => `${fmtMin(b.from)}-${fmtMin(b.to)} ${b.activity} (${b.status})`).join('; ') || 'unscheduled'}`).filter(Boolean).join('\n') : '';
  const sys = (String(modes().schedPrompt || '').trim() || SCHEDULE_PROMPT)
    .replace(/\{\{char\}\}/g, ch.name).replace('{{description}}', sheet || '(no description)')
    .replace('{{guide}}', guide.trim() ? `\nWhat the user wants from this routine (follow it even if it bends the usual pattern):\n${guide.trim()}\n` : '')
    .replace('{{scope}}', only >= 0 ? `${DAY_EN[only]} only` : 'all seven days, Monday to Sunday')
    .replace('{{shape}}', only >= 0 ? `Return only the "${DAY_EN[only]}" key.${others ? ` The other days, for consistency (do not rewrite them):\n${others}` : ''}` : 'Include all seven keys, Monday to Sunday, each fully filled in.');
  const out = await B.engine.quickCall(sys, only >= 0 ? `Write ${DAY_EN[only]} now.` : 'Write the week now.', { maxTokens: only >= 0 ? 1500 : 5000, conn, signal });
  const got = parseSchedule(out);
  if (only >= 0) { if (!got.days[only].length) throw new Error(`${DAYS[only]}요일 일정이 비어 돌아왔어요.`); const days = normWeek(cur?.days); days[only] = got.days[only]; return days; }
  if (got.days.filter(d => d.length).length < 7) throw new Error(`일곱 요일 중 ${got.days.filter(d => d.length).length}일만 돌아왔어요. 다시 시도해 주세요.`);
  return got.days;
}
