// /event-emit: 메시지 속 HTML 화면(과 앱 쪽 듣는 곳)에 이름 붙은 이벤트를 보낸다
import { X } from '../lib/hooks';
import { framePost } from '../lib/format';
import { emit } from '../lib/core';
import { t } from '../i18n';

/** event="이름" data=값 data=값 … 을 읽는다 (따옴표 안의 공백 · 이스케이프 허용) */
function parseArgs(arg: string) {
  const out: { event: string; data: string[] } = { event: '', data: [] };
  const re = /(\w+)=("((?:[^"\\]|\\.)*)"|'((?:[^'\\]|\\.)*)'|(\S+))/g;
  let m: RegExpExecArray | null, rest = String(arg || '');
  while ((m = re.exec(arg))) {
    const v = (m[3] ?? m[4] ?? m[5] ?? '').replace(/\\(["'\\])/g, '$1');
    if (m[1] === 'event') out.event = v; else if (m[1] === 'data') out.data.push(v);
    rest = rest.replace(m[0], '');
  }
  if (!out.event) out.event = rest.trim();
  return out;
}

function setup() {
  X.commands.set('/event-emit', { owner: 'events', get help() { return t('events.cmd.emit'); },
    run: async (arg: string) => {
      const { event, data } = parseArgs(arg);
      if (!event) return '';
      framePost({ dlEvent: event, args: data });
      emit('script:event', { event, args: data });
      return '';
    } });
}

export const feature = { name: 'events', setup };
