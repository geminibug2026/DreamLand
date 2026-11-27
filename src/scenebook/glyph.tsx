// 작은 그림 기호: 그림 형식(칸 나눔 모양) · 얇은 선 화살표 (작게 그려도 가볍게 보이게 직접 그린다)
const R = (x: number, y: number, w: number, h: number, fill = false, key?: string | number) => <rect key={key} x={x} y={y} width={w} height={h} rx={0.6} fill={fill ? 'currentColor' : 'none'} />;
/** 그림 형식 모양: 삽화 한 장 · 웹툰 컷(여러 장) · 흑백 만화 · 컬러 만화 · 세로 웹툰 */
export function FormatGlyph({ id }: { id: string }) {
  const body = id === 'cuts' ? [R(4, 2, 14, 8, false, 1), R(6, 12, 14, 8, false, 2), R(8, 22, 14, 6, false, 3)]
    : id === 'manga' ? [R(4, 2, 18, 11, true, 1), R(4, 15, 8, 13, false, 2), R(14, 15, 8, 13, true, 3)]
      : id === 'comic' ? [R(4, 2, 8, 12, false, 1), R(14, 2, 8, 12, false, 2), R(4, 16, 18, 12, false, 3)]
        : id === 'webtoon' ? [R(7, 2, 12, 6, false, 1), R(7, 10, 12, 10, false, 2), R(7, 22, 12, 6, false, 3)]
          : [R(4, 3, 18, 24, false, 1), <path key="m" d="M6 24l5-7 4 5 2-3 4 5" fill="none" />];
  return <svg className={'sb-glyph sb-glyph-' + id} viewBox="0 0 26 30" width={26} height={30} aria-hidden="true" fill="none" stroke="currentColor" strokeWidth={1.3} strokeLinejoin="round" strokeLinecap="round">{body}</svg>;
}
/** 얇은 선 화살표 (버전 넘기기). 누르는 자리는 단추가 넓게 잡는다 */
export function Chevron({ side }: { side: 'left' | 'right' }) {
  return <svg className="sb-chevron" viewBox="0 0 16 16" width={13} height={13} aria-hidden="true"><path d={side === 'left' ? 'M10 3.5 5.5 8l4.5 4.5' : 'M6 3.5 10.5 8 6 12.5'} fill="none" stroke="currentColor" strokeWidth={1.4} strokeLinecap="round" strokeLinejoin="round" /></svg>;
}
