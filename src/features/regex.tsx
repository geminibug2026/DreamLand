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
import { t, tn } from '../i18n';

type AllowMap = Record<string, Record<string, boolean | 'ask'> | undefined>;
const redrawChat = () => { try { if (route.page === 'chat' && !chatApi.current().busy) chatApi.redraw(); } catch { /* 대화 화면이 아직 없으면 그대로 둔다 */ } };

/** 캐릭터 · 프리셋에 실려 온 정규식: 처음 쓸 때 한 번 묻는다 */
function askEmbedded(chat?: Chat | null) {
  if (!chat || route.page !== 'chat' || document.querySelector('.rx-ask')) return;
  const a = (S.settings.regexAllow || {}) as AllowMap;
  const cid = arr(chat.charIds).find(id => a.chars?.[id] === 'ask' && scopedRegex(id).length), p = S.presetFor(chat);
  const sc: Sc | null = cid ? { kind: 'char', id: cid } : (p && a.presets?.[p.id] === 'ask' && arr(p.regex).length ? { kind: 'preset', id: p.id } : null);
  if (!sc) return;
  const n = Scope.list(sc).length, ch = sc.kind === 'char'; let answered = false;
  const m = openModal({ title: tn(ch ? 'regex.ask.titleChar' : 'regex.ask.titlePreset', n, { name: scOwner(sc) }),
    body: <div className="col"><p>{t(ch ? 'regex.ask.bodyChar' : 'regex.ask.bodyPreset')}</p><small className="hint">{t(ch ? 'regex.ask.laterChar' : 'regex.ask.laterPreset')}</small></div>,
    onClose: () => { if (!answered) setAllow(sc, false); setTimeout(() => askEmbedded(chatApi.current().chat), 250); },
    actions: [{ label: t('regex.ask.no'), onclick: () => { answered = true; setAllow(sc, false); } }, { label: t('regex.ask.view'), onclick: () => { answered = true; setAllow(sc, false); go('regex', `${sc.kind}:${sc.id}`); } }, { label: t('regex.ask.yes'), cls: 'primary', onclick: () => { answered = true; setAllow(sc, true); redrawChat(); } }] });
  m.el.classList.add('rx-ask');
}

const inScope = (): Entry[] => { const chat = chatApi.current().chat; return regexScripts({ chat: chat || null }).map(it => ({ r: it.r, sc: it.kind === 'global' ? G : { kind: it.kind, id: it.owner } })); };

let wired = false;
function setup() {
  regexScopeHooks.redrawChat = redrawChat;
  if (!document.querySelector('link[href$="css/regex.css"]')) { const link = document.createElement('link'); link.rel = 'stylesheet'; link.href = 'css/regex.css'; document.head.append(link); }
  if (!wired) { wired = true; on('chat:open', chat => { setTimeout(() => askEmbedded(chat as Chat | null), 400); }); }

  X.commands.set('/regex-toggle', { owner: 'regex', get args() { return t('regex.cmd.toggleArgs'); }, get help() { return t('regex.cmd.toggleHelp'); }, run: async arg => {
    const m = String(arg || '').trim().match(/^([\s\S]*?)(?:\s+(on|off|켜기|끄기))?$/i), name = (m?.[1] || '').trim().toLowerCase(), word = (m?.[2] || '').toLowerCase();
    if (!name) return toast(t('regex.cmd.needName'), 'err');
    const hit = inScope().find(e => String(e.r.name).toLowerCase() === name) || everything().find(e => String(e.r.name).toLowerCase() === name);
    if (!hit) return toast(t('regex.cmd.notFound', { name }), 'err');
    hit.r.enabled = word ? (word === 'on' || word === '켜기') : !hit.r.enabled;
    await Scope.save(hit.sc, hit.r); redrawChat();
    toast(t(hit.r.enabled ? 'regex.cmd.turnedOn' : 'regex.cmd.turnedOff', { name: hit.r.name }), 'ok');
  } });
  X.commands.set('/regex-set', { owner: 'regex', get args() { return t('regex.sets.name'); }, get help() { return t('regex.cmd.setHelp'); }, run: async arg => {
    const name = String(arg || '').trim().toLowerCase(), set = sets().find(s => s.name.toLowerCase() === name || s.id === name);
    if (!set) return toast(name ? t('regex.cmd.setNotFound', { name }) : sets().length ? t('regex.cmd.setNeedNameList', { list: sets().map(s => s.name).join(', ') }) : t('regex.cmd.setNeedName'), 'err');
    await applySet(set); toast(t('regex.cmd.setApplied', { name: set.name }), 'ok');
  } });
}

export const feature: FeatureDef = { name: 'regex', setup };
