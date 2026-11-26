// 막후: 대화 뒤에서 일하는 조수들 (객석 · 교정자 · 성장 기록 · 설정 사서 · 이야기 저울 · 몰입 소품 · 맞춤 조수). 본체는 src/crew/ — 여기서는 꽂기만 한다
import { createRoot } from 'react-dom/client';
import type { FeatureDef } from '../main';
import type { Chat, Msg } from '../lib/types';
import { S, on } from '../lib/core';
import { X } from '../lib/hooks';
import { onFrame } from '../lib/frame';
import { chatApi } from '../chat/actions';
import { reactNode, useCss } from '../addons/parts';
import { t } from '../i18n';
import type { CrewChat, CrewSwipe } from '../crew/types';
import { OWNER, after, cfg, defs, dropChat, latestOf, nameOf, pieces, prepare, st } from '../crew/logic';
import { PROP_KINDS } from '../crew/builtin';
import { renderProps } from '../crew/props';
import { CrewStudio } from '../crew/ui';
import { CrewPanel } from '../crew/Panel';
import { SeatsHost } from '../crew/Seats';
import { openFix } from '../crew/Review';
import '../crew/Art';

/** 방금 받은 답장 (message:received 가 알려 주고, generate:end 에서 답장 뒤의 일을 시작한다) */
let got: { msg: Msg; chat: Chat } | null = null;

/** 소품 카드의 작은 이름표 (화면 말) */
const propLabels = () => ({ ...Object.fromEntries(PROP_KINDS.map(k => [k, t('crew.prop.' + k)])), total: t('crew.prop.total'), newsEd: t('crew.prop.newsEd') });

// ── 메시지 아래의 작은 표시: 교정자가 고친 곳 · 나만 보는 메모. 대화 화면은 메시지를 통째로 다시 그리므로, 붙을 때마다 다시 단다 ──
let queued = false;
function decorate() {
  queued = false;
  const { msgs } = chatApi.current(); if (!msgs.length) return;
  const asides = defs().filter(d => d.out === 'aside');
  let byId: Map<string, (typeof msgs)[number]> | null = null;   // 메시지가 수천 개여도 칸마다 처음부터 찾지 않게 (꾸밀 칸이 있을 때만 만든다)
  for (const el of document.querySelectorAll<HTMLElement>('article.msg.ai[data-id]')) {
    const m = (byId ||= new Map(msgs.map(x => [x.id, x]))).get(el.dataset.id || ''), s = m?.swipes[m.sw] as CrewSwipe | undefined, key = m ? `${m.sw}:${s?.crewOrig ? 1 : 0}:${asides.map(d => String(s?.crew?.[d.id] ?? '').length).join(',')}` : '';
    const old = el.querySelector<HTMLElement>(':scope > .cr-under, :scope .cr-under');
    if (old?.dataset.k === key) continue;
    old?.remove(); if (!m || !s) continue;
    const notes = asides.map(d => [d, s.crew?.[d.id]] as const).filter(x => typeof x[1] === 'string' && x[1]);
    if (!s.crewOrig && !notes.length) continue;
    const box = document.createElement('div'); box.className = 'cr-under'; box.dataset.k = key;
    if (s.crewOrig) {
      const b = document.createElement('button'); b.type = 'button'; b.className = 'cr-fix';
      b.innerHTML = '<svg viewBox="0 0 24 24" width="13" height="13" class="fx-art" aria-hidden="true"><path d="M4 20l4-1L19 8l-3-3L5 16zM14 7l3 3"/></svg>';
      b.append(t('crew.proof.mark', { n: s.crewFix?.length || 1 })); b.onclick = () => openFix(m);
      box.append(b);
    }
    for (const [d, v] of notes) { const p = document.createElement('p'); p.className = 'cr-aside'; const l = document.createElement('span'); l.className = 'fx-lbl kr'; l.textContent = nameOf(d); p.append(l, String(v)); box.append(p); }
    (el.querySelector('.msg-body')?.parentElement || el).insertBefore(box, el.querySelector('.msg-body')?.nextSibling || null);
  }
}
const queue = () => { if (queued) return; queued = true; onFrame(decorate); };

function setup() {
  useCss('crew.css');
  X.before = X.before.filter(b => b.owner !== OWNER); X.before.push({ owner: OWNER, fn: o => prepare(o) });
  X.prompt = X.prompt.filter(p => p.owner !== OWNER); X.prompt.push({ owner: OWNER, fn: pieces });
  // 소품 꼬리표는 켜고 끄는 것과 상관없이 그린다 (예전 답장에 남은 꼬리표가 글자로 드러나지 않게)
  X.filters = X.filters.filter(f => f.owner !== OWNER); X.filters.push({ owner: OWNER, fn: (text, info) => info?.role === 'user' ? text : renderProps(text, propLabels()) });
  X.panels = X.panels.filter(p => p.owner !== OWNER);
  X.panels.push({ owner: OWNER, id: 'crew', icon: 'crew', get title() { const n = (chatApi.current().chat as CrewChat | null)?.crew?.pending?.length; return t('crew.title') + (n ? ` · ${n}` : ''); }, render: (chat, msgs) => reactNode('crew-panel', 'div.col', <CrewPanel chat={chat as CrewChat} msgs={msgs || []} />) });
  X.studio = X.studio.filter(s => s.owner !== OWNER);
  X.studio.push({ owner: OWNER, get title() { return t('crew.title'); }, render: () => reactNode('crew-studio', 'div.cr-studio', <CrewStudio />) });
  // {{crew::조수 id}} — 그 조수의 가장 최근 결과
  X.macros.set('crew', { owner: OWNER, fn: (args: unknown) => { const { chat, msgs } = chatApi.current(), id = String(Array.isArray(args) ? args[0] ?? '' : args ?? '').trim(), d = defs().find(x => x.id === id || x.name === id); return chat && d ? latestOf(chat as CrewChat, d, msgs) : ''; } });

  on<{ msg: Msg; chat: Chat }>('message:received', e => { got = e; });
  on<{ chat: Chat; type: string }>('generate:end', e => {
    const g = got; got = null;
    if (!g || g.chat !== e.chat || !cfg().on) return;
    const s = st(g.chat as CrewChat); if (s.push) { delete s.push; void S.save('chats', g.chat, true); }   // 밀어 주기는 한 번 쓰면 꺼진다
    void after(g.chat as CrewChat, g.msg, e.type).catch(err => console.warn('[막후]', err));
  });
  on<string>('chat:deleted', id => dropChat(id));

  // 객석 창: 문서에 한 번 올려 두고, 보일지는 창이 스스로 정한다
  const host = document.createElement('div'); host.id = 'cr-host'; document.body.append(host); createRoot(host).render(<SeatsHost />);
  new MutationObserver(list => { for (const r of list) for (const n of r.addedNodes) if (n instanceof Element && (n.classList.contains('msg') || n.querySelector('article.msg'))) return queue(); }).observe(document.body, { childList: true, subtree: true });
  on('crew:changed', queue);
}
export const feature: FeatureDef = { name: 'crew', setup };
