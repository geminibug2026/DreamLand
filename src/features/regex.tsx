// 정규식: 실려 온 정규식 허용 묻기 · 명령어(/regex-toggle · /regex-set) · 스타일 (옛 js/f-regex.js 의 화면 밖 부분)
import type { FeatureDef } from '../main';
import { openModal, toast } from '../ui';
import { S, arr, on } from '../lib/core';
import { X } from '../lib/hooks';
import { regexScripts } from '../lib/engine';
import { go, route } from '../lib/router';
import { G, Scope, applySet, everything, regexScopeHooks, scOwner, setAllow, sets, type Entry, type Sc } from '../lib/regex-scope';
import { scopedRegex } from '../lib/cards';
import { chatApi } from '../chat/actions';
import type { Chat } from '../lib/types';

type AllowMap = Record<string, Record<string, boolean | 'ask'> | undefined>;
const redrawChat = () => { try { if (route.page === 'chat' && !chatApi.current().busy) chatApi.redraw(); } catch { /* 대화 화면이 아직 없으면 그대로 둔다 */ } };

/** 캐릭터 · 프리셋에 실려 온 정규식: 처음 쓸 때 한 번 묻는다 */
function askEmbedded(chat?: Chat | null) {
  if (!chat || route.page !== 'chat' || document.querySelector('.rx-ask')) return;
  const a = (S.settings.regexAllow || {}) as AllowMap;
  const cid = arr(chat.charIds).find(id => a.chars?.[id] === 'ask' && scopedRegex(id).length), p = S.presetFor(chat);
  const sc: Sc | null = cid ? { kind: 'char', id: cid } : (p && a.presets?.[p.id] === 'ask' && arr(p.regex).length ? { kind: 'preset', id: p.id } : null);
  if (!sc) return;
  const n = Scope.list(sc).length, what = sc.kind === 'char' ? '캐릭터' : '프리셋'; let answered = false;
  const m = openModal({ title: `${scOwner(sc)} ${what}에 정규식 ${n}개가 함께 들어 있어요`,
    body: <div className="col"><p>{`사용하면 이 ${what}${sc.kind === 'char' ? '와의 대화' : '을 쓰는 대화'}에서 글을 바꾸거나 꾸밉니다. 믿을 수 있는 곳에서 받은 것만 켜세요.`}</p><small className="hint">{`나중에 메뉴 › 정규식 › ${what} 탭에서 바꿀 수 있어요.`}</small></div>,
    onClose: () => { if (!answered) setAllow(sc, false); setTimeout(() => askEmbedded(chatApi.current().chat), 250); },
    actions: [{ label: '쓰지 않기', onclick: () => { answered = true; setAllow(sc, false); } }, { label: '내용 보기', onclick: () => { answered = true; setAllow(sc, false); go('regex', `${sc.kind}:${sc.id}`); } }, { label: '사용', cls: 'primary', onclick: () => { answered = true; setAllow(sc, true); redrawChat(); } }] });
  m.el.classList.add('rx-ask');
}

const inScope = (): Entry[] => { const chat = chatApi.current().chat; return regexScripts({ chat: chat || null }).map(it => ({ r: it.r, sc: it.kind === 'global' ? G : { kind: it.kind, id: it.owner } })); };

let wired = false;
function setup() {
  regexScopeHooks.redrawChat = redrawChat;
  if (!document.querySelector('link[href$="css/regex.css"]')) { const link = document.createElement('link'); link.rel = 'stylesheet'; link.href = 'css/regex.css'; document.head.append(link); }
  if (!wired) { wired = true; on('chat:open', chat => { setTimeout(() => askEmbedded(chat as Chat | null), 400); }); }

  X.commands.set('/regex-toggle', { owner: 'regex', args: '이름 [on|off]', help: '정규식 스크립트를 켜거나 끕니다 — /regex-toggle 상태창 off', run: async arg => {
    const m = String(arg || '').trim().match(/^([\s\S]*?)(?:\s+(on|off|켜기|끄기))?$/i), name = (m?.[1] || '').trim().toLowerCase(), word = (m?.[2] || '').toLowerCase();
    if (!name) return toast('정규식 이름을 적어 주세요', 'err');
    const hit = inScope().find(e => String(e.r.name).toLowerCase() === name) || everything().find(e => String(e.r.name).toLowerCase() === name);
    if (!hit) return toast(`"${name}" 정규식을 찾지 못했어요`, 'err');
    hit.r.enabled = word ? (word === 'on' || word === '켜기') : !hit.r.enabled;
    await Scope.save(hit.sc, hit.r); redrawChat();
    toast(`"${hit.r.name}" 정규식을 ${hit.r.enabled ? '켰어요' : '껐어요'}`, 'ok');
  } });
  X.commands.set('/regex-set', { owner: 'regex', args: '묶음 이름', help: '저장해 둔 정규식 켜짐 묶음을 적용합니다', run: async arg => {
    const name = String(arg || '').trim().toLowerCase(), set = sets().find(s => s.name.toLowerCase() === name || s.id === name);
    if (!set) return toast(name ? `"${name}" 묶음을 찾지 못했어요` : `묶음 이름을 적어 주세요${sets().length ? ' — ' + sets().map(s => s.name).join(', ') : ''}`, 'err');
    await applySet(set); toast(`"${set.name}" 묶음을 적용했어요`, 'ok');
  } });
}

export const feature: FeatureDef = { name: 'regex', setup };
