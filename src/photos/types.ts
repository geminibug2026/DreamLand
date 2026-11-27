// 사진: 대화 모드에서 주고받은 사진 · 앨범 · 게시판 글의 사진을 한 꼴로 본다
// 보낸 사진은 그 답장의 그 스와이프에(sw.photos), 그린 그림은 삽화 자리(sw.illust 의 photo 표시가 붙은 자리)에 든다.
// 앨범 사진(앨범 채우기가 쓴 설명)은 대화방에(chat.photoAlbum), 게시판 사진은 게시판 글(note.imagePrompt · note.image)에 그대로 있다.

/** selfie: 앞 카메라를 팔 길이에 · mirror: 거울에 비친 모습 (휴대폰이 보인다) · shot: 뒤 카메라로 보여 주고 싶은 것 (찍은 사람은 없거나 손만) */
export type PhotoKind = 'selfie' | 'mirror' | 'shot';
export const KINDS: PhotoKind[] = ['selfie', 'mirror', 'shot'];

/** 답장에 실려 보낸 사진 한 장 (그 스와이프의 sw.photos) */
export interface SentPhoto {
  id: string; kind: PhotoKind;
  /** 그림 엔진에 보낼 영어 설명 (프레임에 든 것 · 장소 · 빛) */ shows: string;
  /** 대화 언어로 쓴 짧은 설명 (그리기 전 카드 · 대체 글) */ alt?: string;
  /** 셀카 · 거울 셀카에 함께 찍힌 사람 (모델이 쓴 이름 그대로, 쉼표로) */ with?: string;
  /** 평소와 다른 옷 (영어 태그) */ outfit?: string;
  /** 그 앞에 있는 글 줄 수 (0 = 맨 앞) · 바로 앞 줄 — 보낸 자리 */ at: number; after?: string;
  /** 찍은 사람 (캐릭터 id) */ by?: string;
  /** 그린 그림이 든 삽화 자리 (sw.illust 의 slotId) */ slot?: string;
  ts: number;
}
/** 앨범에만 있는 사진: 앨범 채우기가 대화를 보고 쓴 설명 (대화에 보낸 적은 없다) — chat.photoAlbum */
export interface AlbumPhoto { id: string; kind: PhotoKind; shows: string; alt?: string; outfit?: string; with?: string; by?: string; /** 그린 그림 (에셋 id) */ image?: string; ts: number }

export type PhotoSource = 'sent' | 'album' | 'feed';
/** text: 글로만 있다 · queued: 그릴 차례를 기다린다 · drawing: 그리는 중 · done: 그림이 있다 · failed: 그리다 실패했다 */
export type PhotoState = 'text' | 'queued' | 'drawing' | 'done' | 'failed';
/** 밖에서 보는 사진 한 장 (src/photos/api.ts). id 는 늘 같은 사진을 가리킨다 */
export interface PhotoItem {
  id: string; source: PhotoSource;
  chatId?: string; msgId?: string; noteId?: string;
  kind: PhotoKind; /** 찍은 사람: 캐릭터 id (게시판의 내 글은 'me') */ by: string;
  shows: string; /** 사람이 읽는 짧은 설명 (없으면 shows) */ alt: string;
  ts: number; /** 그린 그림 (에셋 id, 없으면 '') */ image: string; state: PhotoState; error?: string;
  /** 그림 크기 (자리를 미리 잡는다) */ w?: number; h?: number;
}

/** 설정 (S.settings.photos) */
export interface PhotoCfg {
  /** 대화 모드의 삽화: scene = 장면처럼 (예전 그대로) · photo = 사진 주고받기 */ talk: 'scene' | 'photo';
  /** 앨범 채우기 한 번에 쓰는 장 수 */ albumN: number;
}
export const PHOTO_DEFAULTS: PhotoCfg = { talk: 'scene', albumN: 4 };
