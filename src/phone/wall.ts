// 배경화면: 그러데이션 · 캐릭터 그림 · 삽화 · 올린 사진. 그림 배경은 흐린 사본을 한 번만 만든다 (아주 작게 줄였다 키운 캔버스 그림 —
// 화면 전체에 backdrop-filter 를 걸지 않고 반투명 판 아래 깔아 젖빛 유리처럼 보이게). 만든 주소는 이 화면이 내려갈 때 돌려준다
import { useEffect, useMemo, useState } from 'react';
import { S } from '../lib/core';
import { useArt } from '../kit';
import { Illust } from '../lib/illust';
import { dataToBlob } from '../lib/blobUrl';
import { loadWallPhoto, type Prefs, type ThemeId } from './prefs';

/** 고를 수 있는 그러데이션 (이름은 화면에 보이지 않는 열쇠) */
export const GRADS: Record<string, string> = {
  paper: 'linear-gradient(180deg,#efeff2,#e4e5ea)',
  mist: 'linear-gradient(165deg,#dfe6ef 0%,#c3cedd 46%,#9fb0c6 100%)',
  dusk: 'linear-gradient(170deg,#f3e3dc 0%,#d9c7d6 48%,#a9a6c4 100%)',
  sea: 'linear-gradient(175deg,#e3eef3 0%,#a9c7d6 55%,#6f8fae 100%)',
  sage: 'linear-gradient(170deg,#eef0e6 0%,#cfd8c6 52%,#9fb0a0 100%)',
  ink: 'linear-gradient(175deg,#2b2f38 0%,#1a1d24 60%,#111318 100%)',
};
/** 테마 기본 배경 */
export const THEME_WALL: Record<ThemeId, string> = {
  soft: 'linear-gradient(180deg,#ececef,#e6e6ea)',
  frost: 'radial-gradient(120% 70% at 20% 0%,#f4f6f9 0%,rgba(244,246,249,0) 60%),linear-gradient(165deg,#dfe4ec 0%,#b9c3d3 45%,#7f8fab 100%)',
  mono: 'linear-gradient(180deg,#3a3a3c 0%,#6b6b6e 55%,#9a9a9c 100%)',
  night: 'radial-gradient(90% 60% at 80% 0%,#2a3346 0%,rgba(42,51,70,0) 70%),linear-gradient(180deg,#14161b,#0d0e12)',
};
export interface Wall { /** 잠금 화면에 거는 그림 주소 */ sharp: string; /** 홈 화면에 거는 흐린 사본 */ soft: string; /** 그림이 없을 때(또는 그 밑에) 까는 색 */ css: string }

/** 흐린 사본: 24×52 로 줄였다가 96×208 로 다시 키운 그림 (두 번 늘려 계단 없이 부드럽게) */
async function blurOf(src: string): Promise<string> {
  const im = new Image(); im.src = src; await im.decode();
  const w = im.naturalWidth, h = im.naturalHeight, ar = 52 / 24, k = Math.min(w / 24, h / 52), sw = 24 * k, sh = sw * ar;   // 휴대폰 화면 비율로 가운데를 자른다
  const a = document.createElement('canvas'); a.width = 24; a.height = 52; const g = a.getContext('2d'); if (!g) return '';
  g.drawImage(im, (w - sw) / 2, Math.max(0, (h - sh) / 2), sw, Math.min(h, sh), 0, 0, 24, 52);
  const b = document.createElement('canvas'); b.width = 96; b.height = 208; const g2 = b.getContext('2d'); if (!g2) return '';
  g2.imageSmoothingEnabled = true; g2.imageSmoothingQuality = 'high'; g2.drawImage(a, 0, 0, 96, 208);
  const blob = await new Promise<Blob | null>(r => b.toBlob(r, 'image/png')); return blob ? URL.createObjectURL(blob) : '';
}
const own = (data: string) => { const b = data ? dataToBlob(data) : null; return b ? URL.createObjectURL(b) : ''; };

export function useWall(p: Prefs): Wall {
  const kind = p.wall.split(':')[0], arg = p.wall.slice(kind.length + 1);
  const ch = kind === 'char' ? S.get('chars', arg) : undefined, art = useArt(ch?.avatar);
  const [img, setImg] = useState<{ key: string; url: string }>({ key: '', url: '' }), [soft, setSoft] = useState<{ src: string; url: string }>({ src: '', url: '' });
  // 삽화 · 올린 사진: 원본 글자를 한 번 읽어 짧은 blob 주소로 (이 화면이 내려가면 돌려준다)
  useEffect(() => {
    if (kind !== 'il' && kind !== 'photo') return; let live = true, mine = '';
    void (kind === 'il' ? Illust.dataOf(arg) : loadWallPhoto()).then(d => { mine = own(d); if (live) setImg({ key: p.wall, url: mine }); else if (mine) URL.revokeObjectURL(mine); });
    return () => { live = false; if (mine) URL.revokeObjectURL(mine); };
  }, [p.wall, kind, arg]);
  const sharp = kind === 'char' ? art : (kind === 'il' || kind === 'photo') && img.key === p.wall ? img.url : '';
  useEffect(() => {
    if (!sharp) return; let live = true, mine = '';
    void blurOf(sharp).then(u => { mine = u; if (live) setSoft({ src: sharp, url: u }); else if (u) URL.revokeObjectURL(u); }).catch(() => { });
    return () => { live = false; if (mine) URL.revokeObjectURL(mine); };
  }, [sharp]);
  const css = kind === 'g' && GRADS[arg] ? GRADS[arg] : THEME_WALL[p.theme];
  const softUrl = sharp && soft.src === sharp ? soft.url : '';
  return useMemo(() => ({ sharp, soft: softUrl, css }), [sharp, softUrl, css]);
}
