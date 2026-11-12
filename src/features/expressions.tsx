// 표정: 감정에 따라 바뀌는 초상 (표정 세트 · 감정 판정 · 초상/아바타/스탠딩 표시) — 옛 js/f-expressions.js
import { useEffect, useState } from 'react';
import type { FeatureDef } from '../main';
import { Btn } from '../kit';
import type { ChatX, Msg } from '../addons/types';
import { errMsg } from '../addons/parts';
import { Check, Select, reactNode, useRedraw, type Opt } from '../addons/parts';
import { DEFAULT_LABELS, TAG_QUICK, canonLabel, extractTag, hidePartial } from '../expressions/pure';
import { MODES, Sprites, byKeyword, candidates, cfg, charIdOf, classify, currentOf, fullName, lastReply, live, nameOf, ownerOf, persist, save, setExpr, stripLater, tagInstruction, toggleStanding, typingIn, universe } from '../expressions/store';
import { schedule, sync, watchStage } from '../expressions/stage';
import { openPicker } from '../expressions/Picker';
import { ExprStudio } from '../expressions/Studio';
import { DB, on, S } from '../lib/core';
import { go } from '../lib/router';
import { toast } from '../ui';
import { X } from '../lib/hooks';
import { chatApi } from '../chat/actions';
import { t } from '../i18n';

function openStudioTab() { go('studio'); const t = [...document.querySelectorAll<HTMLElement>('#page .tabs .tab')].find(b => b.dataset.tab === '표정'); if (t && !t.classList.contains('on')) t.click(); }

/** 장면 패널: 지금 표정 (초상 영역이 없는 좁은 화면에서도 보고 바꿀 수 있게) */
function ExprPanel({ chat, msgs }: { chat: ChatX; msgs: Msg[] }) {
  const draw = useRedraw(), c = cfg();
  const chars = chat.charIds.map(id => S.get('chars', id)).filter(x => !!x);
  const [ready, setReady] = useState(() => chars.every(ch => Sprites.has(ch.id)));
  useEffect(() => {
    if (ready) return; let alive = true;
    Sprites.load(chars.map(ch => ch.id)).then(() => { if (alive) setReady(true); }).catch(() => { });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  if (!ready) return <p className="dim">{t('expressions.panel.loading')}</p>;
  const withSet = chars.filter(ch => Sprites.list(ch.id).length);
  if (!withSet.length) return <><p className="dim">{t('expressions.panel.empty')}</p><Btn label={t('expressions.panel.upload')} ic="upload" cls="ghost" onClick={openStudioTab} /></>;
  const mode = MODES().find(x => x[0] === c.mode);
  return <>
    {withSet.map(ch => {
      const st = currentOf(chat, msgs, ch.id), m = lastReply(msgs, chat, ch.id), have = Sprites.labels(ch.id);
      const opts: Opt[] = [['', t('expressions.fallbackName')], ...universe(ch.id).filter(l => have.includes(l) || l === st.label).map(l => [l, fullName(l)] as const)];
      return <div key={ch.id} className="exs-panel-row">
        <button type="button" className="exs-panel-pic" title={t('expressions.panel.pick')} onClick={() => m ? void openPicker(m, chat) : toast(t('expressions.noReply'))}>{st.sprite ? <img src={st.sprite.data} alt="" /> : <span>{ch.name.slice(0, 1)}</span>}</button>
        <div className="exs-panel-text"><b>{ch.name}</b>
          <Select title={t('expressions.panel.lastExpr')} disabled={!m} value={m ? (m.swipes[m.sw]?.expr || '') : ''} opts={opts} onChange={async v => { if (m) { await setExpr(chat, m, v); draw(); } }} /></div>
      </div>;
    })}
    <Check label={t('expressions.standing.on')} on={c.standing} onChange={v => { toggleStanding(v); draw(); }} />
    <small className="hint">{t('expressions.panel.modeLine', { mode: mode?.[1] || t('expressions.mode.off'), cost: mode?.[3] || t('expressions.mode.noCall') })}</small>
    <Btn label={t('expressions.panel.settings')} ic="sliders" cls="ghost" onClick={openStudioTab} />
  </>;
}

const emote = async (arg: string) => {
  const { chat, msgs } = chatApi.current(); if (!chat) return toast(t('expressions.noChat'), 'err');
  let text = String(arg || '').trim(), charId = '';
  // 그룹: "/emote 이름: 감정" 또는 "/emote 이름 감정"
  for (const ch of chat.charIds.map(id => S.get('chars', id)).filter(x => !!x)) if (text.toLowerCase().startsWith(ch.name.toLowerCase()) && /^[\s:：]/.test(text.slice(ch.name.length))) { charId = ch.id; text = text.slice(ch.name.length).replace(/^[\s:：]+/, ''); break; }
  const m = lastReply(msgs, chat, charId); if (!m) return toast(t('expressions.emote.noReply'), 'err');
  if (!text) return openPicker(m, chat);
  const cid = charIdOf(m, chat); await Sprites.load(cid);
  if (/^(reset|clear|none|지우기|초기화|없음)$/i.test(text)) { await setExpr(chat, m, ''); return toast(t('expressions.toast.cleared')); }
  const label = canonLabel(text, universe(cid));
  if (!label) return toast(t('expressions.emote.notFound', { text, names: (Sprites.labels(cid).length ? Sprites.labels(cid) : DEFAULT_LABELS).map(nameOf).join(', ') }).slice(0, 220), 'err');
  await setExpr(chat, m, label);
  toast(Sprites.of(cid, label).length ? t('expressions.toast.set', { name: nameOf(label) }) : t('expressions.toast.setNear', { name: nameOf(label) }));
};

function setup() {

  on('generate:start', () => live.clear());
  on('generate:end', () => { live.clear(); schedule(); });
  on('message:received', async data => {
    try {
      const { msg, chat } = data as { msg: Msg; chat: ChatX };
      const c = cfg(), sw = msg?.swipes?.[msg.sw]; if (!sw || msg.role !== 'assistant') return;
      const charId = charIdOf(msg, chat), seen = live.get(msg.id) || '';
      // 여기까지는 기다림 없이: 뒤이어 도는 기억 기록 · 번역이 태그 없는 글을 보도록 저장된 글에서 바로 뗀다
      const ex = extractTag(sw.text), later = ex.found && !!typingIn(msg.id);
      let label = ex.found ? canonLabel(ex.label, universe(charId)) : '';
      if (ex.found && !later) sw.text = ex.text;
      if (label) { sw.expr = label; delete sw.exprPick; }
      await Sprites.load(charId);
      const has = Sprites.list(charId).length > 0;
      if (!label && ex.found) label = canonLabel(ex.label, universe(charId));   // 그 캐릭터 그림에만 있는 이름
      if (!label && c.mode === 'tag' && has) label = seen || (c.tagFallback ? byKeyword(ex.text, charId) : '');
      if (!label && c.mode === 'key' && has) label = byKeyword(ex.text, charId);
      if (label) { sw.expr = label; delete sw.exprPick; }
      live.delete(msg.id);
      if (later) stripLater(chat, msg, sw).catch(e => console.warn('[표정]', e));
      if (label || (ex.found && !later)) await persist(chat, msg);
      sync();
      if (c.mode === 'call' && c.show && has && candidates(charId).length > 1) {
        const text = sw.text, here = () => chatApi.current().chat?.id === chat.id;
        const msgs = here() ? chatApi.current().msgs : await S.msgs(chat.id);
        if (here()) chatApi.setStatus(t('expressions.status.picking'));
        try {
          const got = await classify(chat, msgs, msg);
          if (got && msg.swipes[msg.sw] === sw && extractTag(sw.text).text === extractTag(text).text) { sw.expr = got; delete sw.exprPick; await persist(chat, msg); sync(); }
        } catch (e) { console.warn('[표정]', e); toast(t('expressions.detectFailed', { error: errMsg(e) }), 'err'); }
        finally { if (here()) chatApi.setStatus(''); }
      }
    } catch (e) { console.warn('[표정]', e); }
  });
  on('chat:open', async data => {
    const chat = data as ChatX;
    try {
      await Sprites.load(chat.charIds);
      const cur = chatApi.current();
      if (cur.chat?.id === chat.id) {   // 지난번에 떼지 못한 태그가 남아 있으면 정리
        let dirty = false;
        for (const m of cur.msgs) if (m.role === 'assistant') for (const sw of m.swipes || []) if (sw.text && TAG_QUICK.test(sw.text)) {
          const ex = extractTag(sw.text); if (!ex.found) continue;
          sw.text = ex.text; const l = canonLabel(ex.label, universe(charIdOf(m, chat))); if (l && !sw.expr) sw.expr = l; dirty = true;
        }
        if (dirty) await chatApi.save();
      }
    } catch (e) { console.warn('[표정]', e); }
    sync();
  });
  // 캐릭터를 지우면 그 표정 그림도 지운다
  on('chars', async () => {
    const c = cfg(); let changed = false;
    for (const id of Object.keys(c.chars)) if (!S.get('chars', id)) { try { for (const a of await DB.byOwner(ownerOf(id))) await DB.del('assets', a.id); } catch (e) { console.warn('[표정]', e); } Sprites.forget(id); delete c.chars[id]; changed = true; }
    if (changed) save();
  });

  // ── 프롬프트: 숨은 태그 지시 (추가 호출 없음) ──
  X.prompt = X.prompt.filter(p => p.owner !== 'expr');
  X.prompt.push({ owner: 'expr', fn: ({ char, type, ctx }) => {
    const c = cfg(); if (!c.show || c.mode !== 'tag' || type === 'impersonate' || !char?.id) return [];
    if (!Sprites.has(char.id)) { Sprites.load(char.id).catch(() => { }); return []; }
    const content = tagInstruction(char, ctx);
    return content ? [{ where: 'end', content, src: '표정 태그 지시' }] : [];
  } });
  // ── 화면: 태그는 언제나 가린다. 생성 중이면 읽은 감정을 바로 초상에 반영 ──
  X.filters = X.filters.filter(f => f.owner !== 'expr');
  // 옛 판과 같은 차례: 모듈의 표시 필터보다 먼저 태그를 걷어 낸다
  const exprAt = X.filters.findIndex(f => f.owner === 'modules');
  X.filters.splice(exprAt < 0 ? X.filters.length : exprAt, 0, { owner: 'expr', fn: (text, info) => {
    if (!text || text.indexOf('<') < 0) return text;
    const busy = chatApi.current().busy, ex = extractTag(text);
    if (ex.found && busy && info?.msg && info.role === 'assistant' && ex.label) {
      const l = canonLabel(ex.label, universe(charIdOf(info.msg, info.chat)));
      if (l && live.get(info.msg.id) !== l) { live.set(info.msg.id, l); schedule(); }
    }
    return busy ? hidePartial(ex.text) : ex.text;
  } });
  X.macros.set('expression', { owner: 'expr', fn: () => { const { chat, msgs } = chatApi.current(); return chat ? currentOf(chat, msgs, chat.charIds[0]).label : ''; } });

  // ── 메시지 ⋯ 메뉴 · 입력창 + 메뉴 · 명령어 ──
  X.actions = X.actions.filter(a => a.owner !== 'expr');
  X.actions.push({ owner: 'expr', id: 'expr-pick', get label() { return t('expressions.action.change'); }, icon: 'user', run: (msg, chat) => openPicker(msg, chat!) });
  X.composer = X.composer.filter(a => a.owner !== 'expr');
  X.composer.push({ owner: 'expr', id: 'expr-standing', icon: 'user', get label() { return cfg().standing ? t('expressions.standing.off') : t('expressions.standing.on'); }, run: () => toggleStanding() });
  X.commands.set('/emote', { owner: 'expr', get help() { return t('expressions.cmd.emote'); }, run: emote });
  X.commands.set('/표정', { owner: 'expr', get help() { return t('expressions.cmd.emoteAlias'); }, run: emote });
  X.commands.set('/standing', { owner: 'expr', get help() { return t('expressions.cmd.standing'); }, run: async () => { toggleStanding(); toast(cfg().standing ? t('expressions.standing.turnedOn') : t('expressions.standing.turnedOff')); } });

  X.panels = X.panels.filter(p => p.owner !== 'expr');
  X.panels.push({ owner: 'expr', id: 'expr', get title() { return t('expressions.panel.title'); }, icon: 'user', render: (chat, msgs) => reactNode('expr-panel', 'div.exs-panel', <ExprPanel chat={chat} msgs={msgs} />) });

  X.studio = X.studio.filter(t => t.owner !== 'expr');
  X.studio.push({ owner: 'expr', title: '표정', render: () => reactNode('expr-studio', 'div.exs', <ExprStudio />) });

  watchStage();
}

export const feature: FeatureDef = { name: 'expressions', setup };
