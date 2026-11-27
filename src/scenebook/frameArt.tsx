// 삽화 액자의 장식 그림 — 메시지 속 삽화(decorate)와 작업실이 함께 쓴다. 작업실 코드를 받지 않아도 그리도록 따로 둔다
import type { FrameLayout } from './frames';

export const FrameArt = ({ lay }: { lay: FrameLayout }) => <>
  {lay.ornament ? <svg xmlns="http://www.w3.org/2000/svg" viewBox={lay.ornament.viewBox} className="sb-ornament" aria-hidden="true" focusable="false" dangerouslySetInnerHTML={{ __html: lay.ornament.inner }} /> : null}
  {lay.art ? <img className="sb-frame-art" src={lay.art} alt="" draggable={false} /> : null}</>;
