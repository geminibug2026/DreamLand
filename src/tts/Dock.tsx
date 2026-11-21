// ── 읽는 글 띄우기: 대화의 메시지를 읽어 주는 동안, 입력창 위에 그 글을 띄우고 읽는 자리를 따라간다 ──
// 문장을 누르면 거기부터 다시 읽는다. ‹ › 앞뒤 문장 · 멈춤/이어 듣기 · 닫기(그만 읽기)
import { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Avatar, Icon } from '../kit';
import { S } from '../lib/core';
import { t } from '../i18n';
import { TTS } from './api';
import { cfg } from './config';
import { cleanForSpeech } from './text';
import { ReadAlong, useReading } from './ReadAlong';

/** 이 이름의 읽기만 띄운다 (대화 메시지 · 통화 기록 카드의 음성 메시지) */
const MINE = /^(msg|vm):/;
/** 읽기를 시작할 때 받은 글 (문장을 눌러 중간부터 읽어도 처음 글을 그대로 보여 준다) */
const shown = new Map<string, { text: string; charId?: string | null }>();

/** 대화 메시지를 읽는다: 읽던 것은 멈추고 새로 (queue 면 읽던 것 뒤에 이어서) */
export function readMessage(text: string, o: { key: string; charId?: string | null; queue?: boolean }) {
  shown.set(o.key, { text: cleanForSpeech(text, true), charId: o.charId });
  if (shown.size > 40) shown.delete(shown.keys().next().value!);
  if (!o.queue) TTS.stopAll();
  return TTS.speak(text, { charId: o.charId, key: o.key });
}

function place(el: HTMLElement) {
  const c = document.querySelector('.composer')?.getBoundingClientRect(), vw = document.documentElement.clientWidth;
  if (c && c.width > 0 && c.top > 80) {
    el.style.left = `${Math.max(8, c.left)}px`; el.style.width = `${Math.min(c.width, vw - 16)}px`;
    el.style.bottom = `${Math.max(8, window.innerHeight - c.top + 10)}px`;
  } else { el.style.left = '50%'; el.style.width = `min(560px, ${vw - 24}px)`; el.style.bottom = 'calc(16px + var(--safe-b, 0px))'; el.style.transform = 'translateX(-50%)'; }
}

function Dock() {
  const r = useReading(), el = useRef<HTMLDivElement>(null);
  const mine = !!r && MINE.test(r.key) && cfg().follow !== false;
  // 다 읽은 뒤에도 잠깐 남겨 두었다가 사라진다
  const [last, setLast] = useState<{ key: string; charId?: string | null } | null>(null);
  useEffect(() => { if (mine) setLast({ key: r!.key, charId: r!.charId }); else if (last) { const id = setTimeout(() => setLast(null), 1400); return () => clearTimeout(id); } }, [mine, r?.key]);   // eslint-disable-line react-hooks/exhaustive-deps
  const key = mine ? r!.key : last?.key || '';
  useEffect(() => {
    const d = el.current; if (!d || !key) return;
    place(d);
    const f = () => place(d); window.addEventListener('resize', f); window.visualViewport?.addEventListener('resize', f);
    return () => { window.removeEventListener('resize', f); window.visualViewport?.removeEventListener('resize', f); };
  }, [key]);
  if (!key || document.querySelector('.call-veil')) return null;
  const info = shown.get(key) || (r && r.key === key ? { text: cleanForSpeech(r.src, true), charId: r.charId } : null);
  if (!info) return null;
  const ch = info.charId ? S.get('chars', info.charId) : null, paused = !!(mine && r!.paused);
  const jump = (at: number) => { TTS.stopAll(); void TTS.speak(info.text.slice(at), { charId: info.charId, key, at }).catch(() => { }); return true; };
  return <div ref={el} className={`rd-dock${mine ? ' on' : ' off'}${paused ? ' paused' : ''}`} role="region" aria-label={t('tts.follow.title')}>
    <div className="rd-dock-head">
      {ch ? <Avatar o={ch} cls="xs" /> : <i className="rd-dock-dot" />}
      <b>{ch?.name || t('tts.follow.title')}</b>
      <small>{!mine ? t('tts.follow.done') : paused ? t('tts.follow.paused') : t('tts.follow.reading')}</small>
      <span className="rd-ctl">
        <button type="button" title={t('tts.follow.back')} aria-label={t('tts.follow.back')} disabled={!mine} onClick={() => TTS.step(-1)}><Icon name="skipBack" size={16} /></button>
        <button type="button" className="rd-main" title={paused ? t('tts.follow.resume') : t('tts.follow.pause')} aria-label={paused ? t('tts.follow.resume') : t('tts.follow.pause')} disabled={!mine} onClick={() => paused ? TTS.resume() : TTS.pause()}><Icon name={paused ? 'play' : 'pause'} size={16} /></button>
        <button type="button" title={t('tts.follow.next')} aria-label={t('tts.follow.next')} disabled={!mine || !r!.canNext} onClick={() => TTS.step(1)}><Icon name="skipFwd" size={16} /></button>
        <button type="button" title={t('tts.follow.close')} aria-label={t('tts.follow.close')} onClick={() => { TTS.stopAll(); setLast(null); }}><Icon name="x" size={16} /></button>
      </span>
    </div>
    <div className="rd-dock-body"><ReadAlong text={info.text} k={key} onJump={jump} /></div>
    <small className="rd-dock-tip">{t('tts.follow.tip')}</small>
  </div>;
}

let mounted = false;
export function mountDock() {
  if (mounted) return; mounted = true;
  const el = document.createElement('div'); el.id = 'rd-dock-root'; document.body.append(el);
  createRoot(el).render(<Dock />);
}
