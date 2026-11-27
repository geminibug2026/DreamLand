// 음악: 내 음악(게임 화면에 올린 곡 + 휴대폰에 넣은 곡)을 틀고 멈추고 넘긴다. 위에는 지금 곡(진행 막대 · 앞 · 재생 · 다음), 밑에는 곡 목록.
// 「음악 추가」로 소리 파일을 이 기기에 넣는다 (곡마다 20MB 까지). 휴대폰에 넣은 곡만 여기서 뺄 수 있다
import { useEffect, useState, type MouseEvent } from 'react';
import { pickFiles } from '../../lib/core';
import { confirmBox, menu, toast } from '../../ui';
import { t, tn } from '../../i18n';
import { Emb, Fill, Glyph } from '../art';
import { AppHead, Empty, IBtn } from '../ui';
import { addSongs, mmss, play, removeSong, seek, songs, songsNow, step, toggle, useMusic, useProgress, type Song } from '../music';

const PAGE = 80;

/** 지금 곡: 이름 · 진행 막대(눌러서 옮기기) · 앞 · 재생 · 다음 */
function Player({ first }: { first: Song }) {
  const m = useMusic(), pr = useProgress(), s = m.cur || first, r = pr.dur ? Math.min(1, pr.at / pr.dur) : 0;
  const at = (e: MouseEvent<HTMLDivElement>) => { const b = e.currentTarget.getBoundingClientRect(); seek((e.clientX - b.left) / b.width); };
  return <section className="pn-card pn-mplayer" aria-label={t('phone.music.now')}>
    <span className="pn-wl">{m.cur ? (m.playing ? t('phone.music.playing') : t('phone.music.paused')) : t('phone.music.tapToPlay')}</span>
    <b className="pn-wv">{s.name}</b>
    <div className="pn-mbar" role="slider" tabIndex={m.cur ? 0 : -1} aria-label={t('phone.music.seek')} aria-valuemin={0} aria-valuemax={Math.round(pr.dur)} aria-valuenow={Math.round(pr.at)} onClick={m.cur ? at : undefined}
      onKeyDown={e => { if (e.key === 'ArrowRight') seek(r + .05); else if (e.key === 'ArrowLeft') seek(r - .05); }}><i style={{ transform: `scaleX(${r})` }} /></div>
    <div className="pn-mtime"><span>{mmss(pr.at)}</span><span>{mmss(pr.dur)}</span></div>
    <div className="pn-mdo">
      <button type="button" aria-label={t('phone.music.prev')} title={t('phone.music.prev')} onClick={() => void step(-1)}><Fill name="prev" size={22} /></button>
      <button type="button" className="pn-mbtn big" aria-label={m.playing ? t('phone.music.pause') : t('phone.music.play')} title={m.playing ? t('phone.music.pause') : t('phone.music.play')} onClick={() => m.cur ? toggle() : void play(first.id)}><Fill name={m.playing ? 'pause' : 'play'} size={26} /></button>
      <button type="button" aria-label={t('phone.music.next')} title={t('phone.music.next')} onClick={() => void step(1)}><Fill name="next" size={22} /></button>
    </div>
  </section>;
}

export function Music() {
  const m = useMusic(), [list, setList] = useState<Song[] | null>(songsNow()), [busy, setBusy] = useState(false), [shown, setShown] = useState(PAGE);
  useEffect(() => { let live = true; void songs().then(l => { if (live) setList(l); }); return () => { live = false; }; }, [m.count]);
  const add = async () => {
    const files = await pickFiles({ accept: 'audio/*', multiple: true }); if (!files.length) return; setBusy(true);
    try { const r = await addSongs(files); setList(songsNow()); if (r.added) toast(tn('phone.music.added', r.added), 'ok'); if (r.big) toast(tn('phone.music.tooBig', r.big), 'err'); }
    catch (e) { toast(String((e as Error)?.message || e), 'err'); } finally { setBusy(false); }
  };
  const more = (s: Song, el: Element) => menu(el, [{ label: t('phone.music.remove'), ic: 'trash', onclick: async () => { if (await confirmBox(t('phone.music.removeAsk', { name: s.name }), t('phone.music.remove'), true)) { await removeSong(s.id); setList(songsNow()); } } }]);
  return <div className="pn-appbody">
    <AppHead title={t('phone.app.music')} big right={list?.length ? <IBtn ic="plus" label={t('phone.music.add')} onClick={() => void add()} /> : null} />
    {!list ? <p className="pn-wait">{t('phone.loading')}</p>
      : !list.length ? <Empty art={<Emb kind="window" className="pn-empty-art" />} title={t('phone.music.empty')} text={t('phone.music.emptyHint')}><button type="button" className="pn-btn" disabled={busy} onClick={() => void add()}><Fill name="music" size={17} />{t('phone.music.add')}</button></Empty>
        : <>
          <Player first={list[0]} />
          <ul className="pn-list pn-songs">{list.slice(0, shown).map(s => { const on = m.cur?.id === s.id; return <li key={s.id} className={on ? 'on' : undefined}>
            <button type="button" className="pn-row" aria-current={on || undefined} onClick={() => on ? toggle() : void play(s.id)}>
              <i className="pn-song-ic" aria-hidden="true">{on && m.playing ? <span className="pn-eq"><i /><i /><i /></span> : <Fill name="music" size={18} />}</i>
              <span><b>{s.name}</b><small>{s.from === 'game' ? t('phone.music.fromGame') : t('phone.music.fromPhone')}</small></span></button>
            {s.from === 'phone' ? <button type="button" className="pn-ib" aria-label={t('phone.music.more', { name: s.name })} title={t('phone.music.more', { name: s.name })} onClick={e => more(s, e.currentTarget)}><Glyph name="more" size={18} /></button> : null}
          </li>; })}</ul>
          {list.length > shown ? <button type="button" className="pn-btn ghost wide" onClick={() => setShown(n => n + PAGE)}>{tn('phone.more', list.length - shown)}</button> : null}
        </>}
  </div>;
}
