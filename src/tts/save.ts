// ── 메시지 ⋯ › 소리 파일로 저장 (처음 쓸 때 받는 조각) ──
import type { Chat, Msg } from '../lib/types';
import { S } from '../lib/core';
import { t } from '../i18n';
import { toast } from '../ui';
import { confirmBox } from '../ui/Modal';
import { readHooks, scriptOf } from './Dock';
import { mixdown } from './export';
import { cfg } from './config';

let busy = false;
export async function saveMsgAudio(m: Msg, chat: Chat | null) {
  if (busy) return;
  const takes = scriptOf(m, chat, readHooks.shown?.(m) ?? (m.swipes[m.sw]?.text || ''));
  const c = cfg(), usesConn = [c.voice, ...Object.values(c.chars), c.narrator].some(v => v?.provider && v.provider !== 'browser');
  if (!usesConn) return toast(t('tts.save.browserOnly'), 'err');
  if (!(await confirmBox(t('tts.save.confirm'), t('tts.save.go')))) return;
  busy = true; toast(t('tts.save.making'));
  try {
    const r = await mixdown(takes, { charId: m.charId });
    const who = S.get('chars', m.charId)?.name || m.name || 'voice', d = new Date(m.ts || Date.now());
    const name = `${who}-${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}-${String(d.getHours()).padStart(2, '0')}${String(d.getMinutes()).padStart(2, '0')}.wav`.replace(/[\\/:*?"<>|]+/g, '_');
    const a = document.createElement('a'), url = URL.createObjectURL(r.blob); a.href = url; a.download = name; document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 20000);
    toast(r.skipped ? t('tts.save.doneSkipped', { n: r.skipped }) : t('tts.save.done', { sec: Math.round(r.seconds) }), 'ok');
  } catch (e) { toast(t('tts.save.fail', { err: (e as Error)?.message || String(e) }), 'err'); }
  finally { busy = false; }
}
