// 게임 화면의 배경 그림과 음악: 함께 들어 있는 것 + 사용자가 올린 것.
// 올린 것은 이 기기의 저장소(assets, owner: 'game')에 두고, 그 장면 · 분위기에 올린 것이 있으면 그것만 쓴다
import { DB, readDataURL, shrinkImage, uid, now } from '../lib/core';
import type { Track } from './sfx';

/** 함께 들어 있는 배경 (game/bg/<이름>.jpg). 한 장면에 여러 장이면 장소마다 다른 것을 고른다 */
export const BUILTIN_BG: Record<string, string[]> = {
  forest: ['forest', 'forest-2'], meadow: ['meadow', 'meadow-2'], winter: ['winter'], desert: ['desert', 'desert-2'], street: ['street'], hall: ['hall', 'hall-2'], arena: ['arena'],
  mountain: ['mountain'], lake: ['lake'], room: ['room'], tavern: ['tavern'], city: ['city'], station: ['station'],
  road: ['road'], peak: ['peak'], sea: ['sea'], ruins: ['ruins'], castle: ['castle'], garden: ['garden'], night: ['night'], bridge: ['bridge'], harbor: ['harbor'],
};
export const TRACKS: Track[] = ['explore', 'town', 'battle', 'dark', 'rest'];
export interface Media { id: string; owner: 'game'; kind: 'gamebg' | 'gamebgm'; label: string; name: string; data: string; ts: number }

let mine: Media[] | null = null, loading: Promise<Media[]> | null = null;
export const myMedia = () => mine || [];
export function loadMedia(): Promise<Media[]> {
  if (mine) return Promise.resolve(mine);
  return loading ||= DB.byOwner('game').then(a => (mine = (a as unknown as Media[]).filter(x => x.kind === 'gamebg' || x.kind === 'gamebgm').sort((x, y) => x.ts - y.ts))).catch(() => (mine = []));
}
const hash = (s: string) => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };
/** 그 장면에 깔 그림의 주소. seed(장소 이름)가 같으면 늘 같은 그림 */
export function bgFor(scene: string, seed = ''): string {
  const own = myMedia().filter(m => m.kind === 'gamebg' && m.label === scene);
  if (own.length) return own[hash(seed) % own.length].data;
  const list = BUILTIN_BG[scene]; return list?.length ? `game/bg/${list[hash(seed) % list.length]}.jpg` : '';
}
/** 그 분위기에 틀 음악의 주소 */
export function trackFor(track: Track, seed = ''): string {
  const own = myMedia().filter(m => m.kind === 'gamebgm' && m.label === track);
  return own.length ? own[hash(seed) % own.length].data : `game/music/${track}.mp3`;
}
export const MAX_AUDIO = 20 * 1024 * 1024;
export async function addMedia(kind: Media['kind'], label: string, file: File): Promise<Media> {
  await loadMedia();
  let data = await readDataURL(file);
  if (kind === 'gamebg') data = await shrinkImage(data, 1920, 'image/jpeg', .84);
  const rec: Media = { id: uid(), owner: 'game', kind, label, name: file.name.replace(/\.[^.]+$/, '').slice(0, 60), data, ts: now() };
  await DB.put('assets', rec as never); mine!.push(rec); return rec;
}
export async function removeMedia(id: string) { await DB.del('assets', id); if (mine) mine = mine.filter(m => m.id !== id); }
