// 사진 API: 다른 화면(앱 안 휴대폰의 갤러리 등)이 쓰는 작고 오래가는 입구. 여기 있는 이름과 꼴은 바꾸지 않는다 (더하기만 한다)
//
//   const off = Photos.subscribe(redraw)            // 사진 · 그리는 상태 · 그림이 바뀌면 부른다 → 끊는 함수
//   const list = await Photos.list(chatId)          // 그 대화의 사진 (보낸 사진 + 앨범), 새것부터
//   Photos.feed()                                   // 밤의 게시판 글에 붙은 사진
//   Photos.thumb(item) · Photos.url(item)           // 목록용 작은 그림 · 크게 볼 그림 (아직 없으면 '' — subscribe 가 다시 알린다)
//   await Photos.generate(ids)                      // 그리기 (여러 장이면 먼저 장 수 · 비용을 묻는다). 대기열로 간다
//   await Photos.describe(chatId)                   // 앨범 채우기: 대화를 보고 사진 설명 몇 장을 쓴다 (모델 호출 1번 · 그림은 그리지 않는다)
//   Photos.open(item)                               // 크게 보기
import { on } from '../lib/core';
import { Illust } from '../lib/illust';
import { visible } from '../feed/logic';
import { F, draw as drawNote, imgOf } from '../feed/store';
import { chatApi } from '../chat/actions';
import { slotViewer } from '../scenebook/slot';
import { viewer } from '../scenebook/viewer';
import { toast } from '../ui';
import { t, tn } from '../i18n';
import type { PhotoItem } from './types';
import { feedPhoto } from './prompt';
import { canDraw, costOf } from './queue';
import { confirmDraw } from './confirm';
import { cfg, describe, drawChatPhoto, feedKey, listChat, photosOf, setCfg, slotOf, stateOf } from './store';

export type { PhotoItem, PhotoKind, PhotoSource, PhotoState } from './types';

/** 밤의 게시판 글의 사진 (그림 설명이 있는 글만) */
function feedList(): PhotoItem[] {
  return F.notes.filter(n => n.imagePrompt && visible(n)).map(n => {
    const p = feedPhoto(n.imagePrompt || ''), key = feedKey(n.id), image = n.image || '';
    return { id: key, source: 'feed' as const, noteId: n.id, kind: p.kind, by: n.by, shows: p.shows, alt: p.alt, ts: n.ts, image, ...stateOf(key, !!image) };
  }).sort((a, b) => b.ts - a.ts);
}
const isFeed = (item: PhotoItem) => item.source === 'feed';
const picOf = (item: PhotoItem, small: boolean) => !item.image ? '' : isFeed(item) ? imgOf(item.image) : small ? Illust.thumb(item.image) : Illust.url(item.image);

export const Photos = {
  /** 그 대화의 사진: 보낸 사진(지금 보이는 답장) + 앨범 사진, 새것부터 */
  list: (chatId: string): Promise<PhotoItem[]> => listChat(chatId),
  /** 밤의 게시판 글에 붙은 사진, 새것부터 */
  feed: (): PhotoItem[] => feedList(),
  /** 사진 · 그리는 상태 · 그림 읽기가 바뀌면 부른다 → 끊는 함수 */
  subscribe(fn: () => void): () => void { const offs = ['photos:changed', 'illust:jobs', 'feed:changed'].map(e => on(e, fn)); offs.push(Illust.onPic(fn)); return () => offs.forEach(f => f()); },
  /** 목록용 작은 그림 · 크게 볼 그림의 주소 (아직 없으면 '') */
  thumb: (item: PhotoItem): string => picOf(item, true),
  url: (item: PhotoItem): string => picOf(item, false),
  /** 그리기: ids 의 사진을 삽화 대기열에 넣는다 (그렸거나 그리는 중인 것은 건너뛴다). 둘 이상이면 먼저 장 수 · 비용을 묻는다 (confirm: false 면 묻지 않는다) */
  async generate(ids: string[], { confirm = true }: { confirm?: boolean } = {}): Promise<{ queued: number; skipped: number }> {
    if (!ids.length) return { queued: 0, skipped: 0 };
    if (!canDraw()) { toast(t('photos.err.noDraw'), 'err'); return { queued: 0, skipped: ids.length }; }
    if (confirm && ids.length > 1 && !(await confirmDraw(ids.length))) return { queued: 0, skipped: ids.length };
    // 대기열은 기다리는 것이 스물까지: 넘치는 것은 남겨 둔다 (다음에 다시)
    const room = Math.max(0, 20 - Illust.queue().filter(x => x.state === 'waiting').length);
    let queued = 0, skipped = 0;
    for (const id of ids) {
      if (queued >= room) { skipped++; continue; }
      if (id.startsWith('f|')) { const n = F.notes.find(x => x.id === id.slice(2)); if (n?.imagePrompt && !n.image) { void drawNote(n.id, ids.length > 1); queued++; } else skipped++; continue; }
      if (await drawChatPhoto(id, ids.length > 1)) queued++; else skipped++;
    }
    if (ids.length > 1) toast(tn('photos.queued', queued) + (skipped ? ' ' + tn('photos.skipped', skipped) : ''), queued ? 'ok' : undefined);
    return { queued, skipped };
  },
  /** 앨범 채우기: 지금까지의 대화를 보고 그럴듯한 사진 설명 n 장(기본은 설정)을 앨범에 쓴다 — 모델 호출 1번, 그림은 그리지 않는다 */
  describe: (chatId: string, n?: number) => describe(chatId, n),
  /** 크게 보기 (대화에 보낸 사진은 그 답장의 삽화 도구와 함께) */
  async open(item: PhotoItem) {
    const cur = chatApi.current();
    if (item.source === 'sent' && cur.chat?.id === item.chatId) {
      const m = cur.msgs.find(x => x.id === item.msgId), sw = m?.swipes[m.sw], p = photosOf(sw).find(x => item.id.endsWith('|' + x.id)), it = p && slotOf(sw, p);
      if (m && sw && it?.id) return slotViewer(m, sw, it);
    }
    const src = picOf(item, false) || (item.image && !isFeed(item) ? await Illust.dataOf(item.image) : '');
    if (src) viewer({ title: '', src, sub: item.alt });
  },
  /** n 장을 그릴 때의 비용 짐작: 요청 수 · NovelAI 면 Opus 무료 범위인지 · Precise 참조로 더 드는 Anlas */
  cost: (n: number) => costOf(n),
  /** 사진 설정 (talk: 'scene' | 'photo') */
  cfg, setCfg,
};
