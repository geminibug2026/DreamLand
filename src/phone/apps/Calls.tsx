// 전화: 최근 통화(통화 기능이 남긴 기록) · 즐겨찾는 사람 · 음성 메시지. 거는 것은 통화 기능에 맡긴다 ('call:dial')
import { useEffect, useMemo, useState } from 'react';
import { S } from '../../lib/core';
import { STATUS } from '../../lib/f-schedule';
import { t } from '../../i18n';
import { Emb, Glyph } from '../art';
import { AppHead, Empty, Face, IBtn, Seg, agoText, usePhone, listTime } from '../ui';
import { chatWith, nameOf, presenceOf, recents, talkChats, voicemails, type Voicemail } from '../data';
import { tts } from '../playing';

type Tab = 'recent' | 'fav' | 'vm';
const dur = (ms: number) => { const s = Math.round(ms / 1000); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };

function Voicemails() {
  const P = usePhone(), [list, setList] = useState<Voicemail[] | null>(null), [playing, setPlaying] = useState('');
  useEffect(() => { let live = true; void voicemails().then(v => { if (live) setList(v); }); return () => { live = false; }; }, [P.v]);
  if (!list) return <p className="pn-wait">{t('phone.loading')}</p>;
  if (!list.length) return <Empty art={<Emb kind="window" className="pn-empty-art" />} title={t('phone.call.noVm')} text={t('phone.call.noVmHint')} />;
  return <ul className="pn-vmlist">{list.map(v => { const ch = S.get('chars', v.charId); return <li key={v.key} className="pn-vm">
    <div className="pn-vm-head"><Face o={ch} size={36} /><span><b>{ch?.name || nameOf(v.chat)}</b><small>{agoText(v.at)}</small></span>
      <IBtn ic="phone" label={t('phone.call.back')} onClick={() => P.dial(v.chat)} /></div>
    <p>{v.text}</p>
    {v.audio ? <audio controls preload="none" src={v.audio} /> : tts.enabled() ? <button type="button" className="pn-btn ghost" onClick={() => { setPlaying(v.key); void tts.speak(v.text, v.charId, 'phone-vm:' + v.key).finally(() => setPlaying(p => p === v.key ? '' : p)); }}><Glyph name={playing === v.key ? 'sound' : 'play'} size={16} />{t('phone.call.listen')}</button> : null}
  </li>; })}</ul>;
}

export function Calls() {
  const P = usePhone(), [tab, setTab] = useState<Tab>('recent');
  const rows = useMemo(() => recents(), [P.v]);   // eslint-disable-line react-hooks/exhaustive-deps
  const favs = useMemo(() => { const seen = new Set<string>(), out = []; for (const c of talkChats()) for (const id of c.charIds) { const ch = S.get('chars', id); if (ch && !seen.has(id)) { seen.add(id); out.push(ch); } } return out.slice(0, 24); }, [P.v]);   // eslint-disable-line react-hooks/exhaustive-deps
  return <div className="pn-appbody">
    <AppHead title={t('phone.app.calls')} big />
    <Seg label={t('phone.app.calls')} value={tab} onChange={setTab} opts={[['recent', t('phone.call.recent')], ['fav', t('phone.call.fav')], ['vm', t('phone.call.vm')]] as const} />
    {tab === 'recent' ? (!rows.length ? <Empty art={<Emb kind="window" className="pn-empty-art" />} title={t('phone.call.none')} text={t('phone.call.noneHint')} />
      : <ul className="pn-list">{rows.map(r => { const ch = S.get('chars', r.charId), missed = r.dir === 'in' && r.result === 'missed', res = t('phone.call.res.' + r.result), sub = [r.dir === 'in' ? t('phone.call.in') : t('phone.call.out'), r.dur ? dur(r.dur) : res].join(' · ');
        return <li key={r.key} className="pn-callrow"><button type="button" className={'pn-row' + (missed ? ' missed' : '')} onClick={() => P.dial(r.chat)} aria-label={t('phone.call.dialTo', { name: ch?.name || nameOf(r.chat) })}>
          <Face o={ch} size={40} /><span><b>{ch?.name || nameOf(r.chat)}</b><small><Glyph name={r.dir === 'in' ? 'callIn' : 'callOut'} size={13} />{sub}</small></span><time>{listTime(r.at)}</time></button>
          <IBtn ic="contacts" label={t('phone.call.info')} onClick={() => P.open('contacts', r.charId)} /></li>; })}</ul>)
      : tab === 'fav' ? (!favs.length ? <Empty art={<Emb kind="window" className="pn-empty-art" />} title={t('phone.call.noFav')} text={t('phone.msg.noneHint')} />
        : <ul className="pn-favgrid">{favs.map(ch => { const pr = presenceOf(ch), c = chatWith(ch.id); return <li key={ch.id}><button type="button" onClick={() => c && P.dial(c)} disabled={!c} aria-label={t('phone.call.dialTo', { name: ch.name })}>
          <Face o={ch} size={62} status={pr.status} /><b>{ch.name}</b><small>{pr.activity || STATUS[pr.status] || pr.status}</small></button></li>; })}</ul>)
        : <Voicemails />}
  </div>;
}
