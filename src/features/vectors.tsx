// 벡터 검색: 답변 전 준비(X.before) · 프롬프트 조각 · 로어북 깨우기 · 기능 화면 › 벡터 검색 (옛 js/f-vectors.js). 기본은 꺼짐
import type { FeatureDef } from '../main';
import { errMsg, isAbort } from '../addons/parts';
import { reactNode } from '../addons/parts';
import { VEC_TEMPLATE, cfg, dropAll, dropChat, hitOf, loreWoken, prepare } from '../vectors/logic';
import { VectorsPane } from '../vectors/Pane';
import { on } from '../lib/core';
import { toast } from '../ui';
import { X } from '../lib/hooks';

function setup() {
  X.before = X.before.filter(p => p.owner !== 'vectors');
  X.before.push({ owner: 'vectors', fn: async a => { try { await prepare(a); } catch (e) { if (!isAbort(e)) { console.warn('[벡터 검색]', e); toast('벡터 검색을 건너뛰었어요: ' + errMsg(e).slice(0, 120), 'err'); } } } });
  X.loreVec = loreWoken;
  X.prompt = X.prompt.filter(p => p.owner !== 'vectors');
  X.prompt.push({ owner: 'vectors', fn: ({ chat }) => {
    const c = cfg(), hit = c.enabled && c.chat ? hitOf(chat.id) : null; if (!hit) return [];
    const content = (String(c.template || '').trim() || VEC_TEMPLATE).replace(/\{\{text\}\}/g, hit.text);
    return [c.position === 'before' ? { where: 'before', content, src: '벡터 검색 (지난 대화)' } : { where: 'depth', depth: Math.max(0, +c.depth || 0), order: 55, content, src: '벡터 검색 (지난 대화)' }];
  } });

  X.studio = X.studio.filter(t => t.owner !== 'vectors');
  X.studio.push({ owner: 'vectors', title: '벡터 검색', render: () => reactNode('vectors-studio', 'div.card.vec-card', <VectorsPane />) });

  on('chat:deleted', id => { void dropChat(String(id), false); });
  on('data:imported', dropAll);
}

export const feature: FeatureDef = { name: 'vectors', setup };
