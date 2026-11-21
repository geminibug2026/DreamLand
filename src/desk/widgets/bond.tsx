// 오늘의 인연: 날짜를 씨앗으로 하루 한 명. 한동안 못 만난 사람일수록 뽑히기 쉽다
import { Btn } from '../../kit';
import { S } from '../../lib/core';
import type { Char } from '../../lib/types';
import { dayKey } from '../../lib/f-keepsake';
import { daysTogether } from '../../lib/together';
import { go } from '../../lib/router';
import { startMenu } from '../../chat/start';
import { charSheet } from '../../editors';
import { t } from '../../i18n';
import { ArchEmpty } from '../art';
import { DAY, hash, lastUse, seeded } from '../data';
import { None, Port } from '../parts';

/** 오늘의 한 명과, 마지막으로 만난 지 며칠인지 (만난 적 없으면 -1) */
export function pickBond(now = Date.now()): { c: Char; gap: number } | null {
  const chars = S.chars; if (!chars.length) return null;
  const used = lastUse(), rnd = seeded(hash(dayKey(now)) + 3), gapOf = (c: Char) => used.has(c.id) ? Math.max(0, Math.floor((now - used.get(c.id)!) / DAY)) : -1;
  // 무게: 어제 만난 사람 1, 하루 멀어질 때마다 +1 (60일에서 멈춤). 만난 적 없는 사람은 보름쯤 못 본 사람만큼
  const w = chars.map(c => { const g = gapOf(c); return 1 + (g < 0 ? 15 : Math.min(g, 60)); }), sum = w.reduce((a, b) => a + b, 0);
  rnd(); let x = rnd() * sum, i = 0; while (i < chars.length - 1 && (x -= w[i]) > 0) i++;
  return { c: chars[i], gap: gapOf(chars[i]) };
}

export function Bond() {
  const b = pickBond(); if (!b) return <None art={<ArchEmpty />} text={t('desk.bond.none')} />;
  const { c, gap } = b, last = S.chats.filter(x => !x.temp && x.charIds.includes(c.id)).sort((a, z) => z.updatedAt - a.updatedAt)[0], days = daysTogether(c.id);
  const line = gap < 0 ? t('desk.bond.never') : gap === 0 ? t('desk.bond.today') : gap < 3 ? t('desk.bond.recent', { n: gap }) : t('desk.bond.long', { n: gap });
  return <div className="dk-bond">
    <button className="dk-bond-p fx-tap" onClick={() => charSheet(c)} aria-label={t('desk.bond.sheet', { name: c.name })}><Port c={c} cls="arch" /></button>
    <div className="dk-bond-t"><span className="fx-lbl kr">{line}</span><h4>{c.name}</h4>
      {c.tags.length ? <p className="dk-tags">{c.tags.slice(0, 3).map(x => '#' + x).join('  ')}</p> : null}
      {days ? <div className="fx-kv"><span>{t('desk.bond.together')}</span><i /><b>{t('together.badge', { days })}</b></div> : null}
      <div className="dk-acts">{last ? <Btn label={t('home.continue')} ic="play" cls="dk-btn on" onClick={() => go('chat', last.id)} /> : null}<Btn label={t('home.newChat')} ic="chat" cls="dk-btn" onClick={e => startMenu(e.currentTarget, [c.id])} /></div>
    </div>
  </div>;
}
