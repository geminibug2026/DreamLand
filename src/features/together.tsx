// 함께한 날: 대화 모드의 프롬프트에 "처음 이야기한 지 N일째"를 알려 주고, 기념일에는 한 번 알린다. 매크로 {{daysTogether}} · {{firstMet}}
import type { FeatureDef } from '../main';
import type { Chat } from '../lib/types';
import { S, on } from '../lib/core';
import { X } from '../lib/hooks';
import { chatApi } from '../chat/actions';
import { toast } from '../ui';
import { t } from '../i18n';
import { daysTogether, firstMet, togetherOf } from '../lib/together';

const OWNER = 'together';
/** 기념일 이름 (화면용) */
export const markLabel = (m: { kind: string; count: number }) => m.kind === 'week' ? t('together.mark.week') : m.kind === 'month' ? t('together.mark.month') : m.kind === 'year' ? t('together.mark.year', { count: m.count }) : t('together.mark.days', { count: m.count });

function setup() {
  X.prompt = X.prompt.filter(p => p.owner !== OWNER);
  X.prompt.push({ owner: OWNER, fn: info => {
    const tg = togetherOf(info.chat as Chat); if (!tg) return [];
    const since = new Date(firstMet(tg.charId)).toDateString();
    const mark = tg.mark ? ` Today is a small anniversary: ${tg.mark.kind === 'year' ? `${tg.mark.count} year${tg.mark.count > 1 ? 's' : ''}` : tg.mark.kind === 'week' ? 'one week' : tg.mark.kind === 'month' ? 'one month' : `${tg.mark.count} days`} since you first talked. You may bring it up once, in {{char}}'s own way, if it fits the moment — do not force it.` : '';
    return [{ where: 'end', content: `You and {{user}} first talked on ${since}; today is day ${tg.days}.${mark}`, src: '함께한 날' }];
  } });
  X.macros.set('daysTogether', { owner: OWNER, fn: () => { const c = chatApi.current().chat; return c?.charIds[0] ? String(daysTogether(c.charIds[0])) : '0'; } });
  X.macros.set('firstMet', { owner: OWNER, fn: () => { const c = chatApi.current().chat, at = c?.charIds[0] ? firstMet(c.charIds[0]) : 0; return at ? new Date(at).toLocaleDateString() : ''; } });
  // 기념일인 날 그 방을 처음 열면 한 번 알린다
  on<Chat>('chat:open', chat => {
    const tg = togetherOf(chat); if (!tg?.mark) return;
    const key = new Date().toDateString(), c = chat as Chat & { annivSeen?: string }; if (c.annivSeen === key) return;
    c.annivSeen = key; void S.save('chats', chat, true);
    toast(t('together.toast', { name: S.get('chars', tg.charId)?.name || '', mark: markLabel(tg.mark) }), 'ok');
  });
}
export const feature: FeatureDef = { name: 'together', setup };
