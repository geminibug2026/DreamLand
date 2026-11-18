// 웹 검색: 답장 전에 찾아보고 결과를 프롬프트 끝에 넣는다. "이번 답만 검색"(입력창 + 메뉴) · "AI 가 필요할 때 알아서"(설정) · /websearch 명령
import type { FeatureDef } from '../main';
import type { Chat, Msg } from '../lib/types';
import { msgText, on } from '../lib/core';
import { X } from '../lib/hooks';
import { quickCall } from '../lib/engine';
import { chatApi } from '../chat/actions';
import { toast } from '../ui';
import { t } from '../i18n';
import { def, str } from '../stscript/run';
import { hitsText, queryFrom, searchCfg, webSearch, type Hit } from '../lib/websearch';

const OWNER = 'websearch';
/** "이번 답만 검색"을 켜 둔 방 */
const armed = new Set<string>();
/** 이번 답변에 넣을 결과 (답변 전 준비가 채우고, 프롬프트를 조립할 때 읽는다) */
let found: { chatId: string; query: string; hits: Hit[] } | null = null;

const lastUser = (msgs: Msg[]) => { for (let i = msgs.length - 1; i >= 0; i--) if (msgs[i].role === 'user') return msgs[i]; return null; };
const isAbort = (e: unknown) => e instanceof Error && e.name === 'AbortError';

const ASK = `You decide whether a web search would help answer the latest message in a chat.
Search only when the message needs facts you cannot know for sure: news, weather, prices, schedules, recent releases, real people, places or products, or anything the user asks to look up.
Do not search for small talk, feelings, fiction, or roleplay that needs no real-world facts.
Reply with exactly NONE, or with one short search query (under 12 words, in the language that will find the best results). No other text.`;

/** AI 에게 찾아볼지 묻는다. 찾을 게 없으면 '' */
async function decide(msgs: Msg[]): Promise<string> {
  const tail = msgs.filter(m => m.role === 'user' || m.role === 'assistant').slice(-4).map(m => `${m.role === 'user' ? 'User' : 'Character'}: ${msgText(m).slice(0, 600)}`).join('\n');
  const out = (await quickCall(ASK, `${tail}\n\nToday is ${new Date().toDateString()}.`, { maxTokens: 300, lowThink: true })).trim().split('\n').pop()!.trim().replace(/^["'`]+|["'`]+$/g, '');
  return !out || /^none\b/i.test(out) || out.length > 200 ? '' : out;
}

async function prepare({ chat, msgs, type }: { chat: Chat; msgs: Msg[]; type: string }) {
  found = null;
  if (type === 'impersonate') return;
  const manual = armed.has(chat.id), auto = searchCfg().mode === 'auto';
  if (!manual && !auto) return;
  const u = lastUser(msgs); if (!u) return;
  armed.delete(chat.id);
  try {
    const query = manual ? queryFrom(msgText(u)) : await decide(msgs);
    if (!query) return;
    const hits = await webSearch(query);
    if (!hits.length) { if (manual) toast(t('websearch.none', { query })); return; }
    found = { chatId: chat.id, query, hits };
    toast(t('websearch.found', { query, count: hits.length }));
  } catch (e) {
    if (isAbort(e)) return;
    console.warn('[웹 검색]', e);
    // 알아서 찾는 중에 실패한 것은 조용히 넘어가고, 직접 켠 것은 알린다
    if (manual) toast(t('websearch.failed', { error: (e instanceof Error ? e.message : String(e)).slice(0, 120) }), 'err');
  }
}

function setup() {
  X.before = X.before.filter(b => b.owner !== OWNER);
  X.before.push({ owner: OWNER, fn: prepare });
  X.prompt = X.prompt.filter(p => p.owner !== OWNER);
  X.prompt.push({ owner: OWNER, fn: info => {
    if (!found || found.chatId !== info.chat.id) return [];
    return [{ where: 'end', src: '웹 검색', content: `[Web search results for "${found.query}" — looked up just now, ${new Date().toDateString()}]\n${hitsText(found.hits)}\n[Use these facts where they help, in {{char}}'s own voice. Do not paste the list or the links unless {{user}} asks for sources. If the results do not answer the question, say you could not find it rather than guessing.]` }];
  } });
  // 답변이 끝나면 치운다 (다른 요청의 프롬프트에 남지 않게)
  on('generate:end', () => { found = null; });
  X.composer = X.composer.filter(c => c.owner !== OWNER);
  X.composer.push({ owner: OWNER, id: 'websearch-once', icon: 'search', get label() { const c = chatNow(); return c && armed.has(c) ? t('websearch.once.off') : t('websearch.once.on'); },
    run: () => { const c = chatNow(); if (!c) return; if (armed.has(c)) { armed.delete(c); toast(t('websearch.once.cancelled')); } else { armed.add(c); toast(t('websearch.once.armed')); } } });
  def('websearch', { help: '', run: async a => { const q = str(a.unnamed).trim(); if (!q) return ''; return hitsText(await webSearch(q)); } });
}
const chatNow = () => chatApi.current().chat?.id;
export const feature: FeatureDef = { name: 'websearch', setup };
