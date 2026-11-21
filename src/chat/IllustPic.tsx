// 삽화 한 장: 화면용 주소가 오면 그림, 오기 전에는 같은 크기의 빈 칸 (엑박이 뜨지 않게)
import type { MouseEvent, Ref } from 'react';
import { GONE, useIllustUrl } from '../lib/useIllust';

/** 삽화 한 장. 읽는 동안은 엑박 대신 같은 크기의 빈 칸을 둔다 */
export function IllustPic({ id, alt, onClick, imgRef, w = 832, h = 1216 }: { id: string; alt: string; onClick?: (e: MouseEvent<HTMLImageElement>) => void; imgRef?: Ref<HTMLImageElement>; w?: number; h?: number }) {
  const src = useIllustUrl(id);
  return src && src !== GONE ? <img ref={imgRef} src={src} alt={alt} decoding="async" onClick={onClick} /> : <span className={'ill-wait' + (src === GONE ? ' gone' : '')} style={{ aspectRatio: `${w} / ${h}` }} role="img" aria-label={alt} />;
}

