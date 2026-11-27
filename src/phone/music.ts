// 휴대폰의 음악: 내 음악 = 게임 화면에 올린 배경 음악(src/game/media 의 gamebgm — 그 입구로 읽기만) + 휴대폰에서 넣은 곡(assets, owner 'phone', kind 'music').
// 휴대폰에서 넣은 곡은 게임 쪽 목록에 섞지 않는다 (게임 목록의 곡 이름은 게임 프롬프트에 실리므로 — 휴대폰은 모델에게 가는 글을 바꾸지 않는다).
// 틀기: <audio> 하나를 처음 누를 때 만들고, 사용자가 누르기 전에는 절대 틀지 않는다. 휴대폰을 닫아도 진짜 전화기처럼 계속 들리지만,
// 그동안 도는 것은 소리를 내는 <audio> 하나뿐 (타이머 · rAF 없음). 진행 막대는 보이는 동안만 audio 의 timeupdate 로.
// 트는 동안만: 전화를 걸거나(call:dial) 캐릭터가 걸어 오면(talk:call), 읽어 주기가 읽기 시작하면 멈춘다
import { useEffect, useState, useSyncExternalStore } from 'react';
import { DB, on, readDataURL, uid } from '../lib/core';
import { dataToBlob } from '../lib/blobUrl';
import { TTS } from '../tts/api';
/** 게임 화면의 음악 입구 — 음악 앱을 열거나 틀 때 처음 받는다 (휴대폰을 여는 것만으로는 게임 코드를 받지 않게) */
const media = () => import('../game/media');
import { prefs, setPrefs } from './prefs';

export interface Song { id: string; name: string; from: 'phone' | 'game'; ts: number }
interface PhoneSong { id: string; owner: 'phone'; kind: 'music'; name: string; data: string; ts: number }
const OWNER = 'phone';

let list: Song[] | null = null, loading: Promise<Song[]> | null = null;
let audio: HTMLAudioElement | null = null, url = '', cur: Song | null = null, playing = false, ver = 0, offs: (() => void)[] = [];
const subs = new Set<() => void>();
const bump = () => { ver++; subs.forEach(f => f()); };

/** 내 음악 목록 (처음 부를 때 읽는다). 휴대폰에서 넣은 곡은 이름 · 때만 들고 소리 글자는 틀 때 읽는다 */
export function songs(): Promise<Song[]> {
  if (list) return Promise.resolve(list);
  return loading ||= Promise.all([
    media().then(async g => { await g.loadMedia(); return g.myMedia().filter(m => m.kind === 'gamebgm').map((m): Song => ({ id: m.id, name: m.name || m.label, from: 'game', ts: m.ts })); }).catch(() => [] as Song[]),
    DB.byOwner(OWNER).then(a => (a as unknown as PhoneSong[]).filter(x => x.kind === 'music').map((m): Song => ({ id: m.id, name: m.name, from: 'phone', ts: m.ts }))).catch(() => [] as Song[]),
  ]).then(([g, p]) => { list = [...p, ...g].sort((a, b) => b.ts - a.ts); loading = null; bump(); return list; });
}
export const songsNow = () => list;

/** 곡의 소리 주소 (blob). 앞 곡의 주소는 돌려준다 */
async function srcOf(s: Song): Promise<string> {
  const data = s.from === 'game' ? (await media()).myMedia().find(m => m.id === s.id)?.data || '' : String(((await DB.get('assets', s.id)) as unknown as PhoneSong | undefined)?.data || '');
  const b = data ? dataToBlob(data) : null; if (!b) return '';
  if (url) URL.revokeObjectURL(url);
  url = URL.createObjectURL(b); return url;
}
function element(): HTMLAudioElement {
  if (audio) return audio;
  audio = new Audio(); audio.preload = 'auto';
  audio.addEventListener('play', () => { playing = true; watch(true); bump(); });
  audio.addEventListener('pause', () => { playing = false; watch(false); bump(); });
  audio.addEventListener('ended', () => { void step(1, true); });
  return audio;
}
/** 트는 동안만 듣는다: 전화 · 읽어 주기가 시작되면 멈춤 */
function watch(onAir: boolean) {
  offs.forEach(f => f()); offs = [];
  if (!onAir) return;
  offs.push(on('call:dial', pause), on('talk:call', pause));
  offs.push(TTS.watch(() => { const r = TTS.reading(); if (r && !r.paused) pause(); }));
}

/** 튼다: id 를 주면 그 곡을 처음부터, 없으면 멈춘 곡을 이어서 (곡이 없으면 첫 곡) */
export async function play(id?: string) {
  const all = await songs(); const s = (id && all.find(x => x.id === id)) || cur || all[0]; if (!s) return false;   // 그 곡이 그새 빠졌으면 멈춘 곡 · 첫 곡
  const a = element();
  if (s !== cur || !a.src) { const u = await srcOf(s); if (!u) return false; cur = s; a.src = u; bump(); }
  try { await a.play(); } catch { return false; }
  if (prefs().lastSong?.id !== s.id) setPrefs({ lastSong: { id: s.id, name: s.name } });
  return true;
}
export function pause() { audio?.pause(); }
/** 재생 위치를 옮긴다 (0~1) */
export function seek(r: number) { if (audio && isFinite(audio.duration)) audio.currentTime = Math.max(0, Math.min(1, r)) * audio.duration; }
export const toggle = () => playing ? pause() : void play();
/** 앞(-1) · 다음(+1) 곡. auto: 곡이 끝나서 넘어갈 때 (마지막 곡이면 멈춘다) */
export async function step(d: number, auto = false) {
  const all = await songs(); if (!all.length) return;
  const i = cur ? all.findIndex(x => x.id === cur!.id) : -1;
  if (d < 0 && audio && audio.currentTime > 3) { audio.currentTime = 0; return; }   // 앞으로: 3초가 지났으면 이 곡 처음으로
  const j = i + d; if (auto && (j < 0 || j >= all.length)) { if (audio) audio.currentTime = 0; bump(); return; }   // 마지막 곡이 끝나면 그 곡 처음에서 멈춘 채로
  await play(all[(j + all.length) % all.length].id);
}

/** 곡 넣기: 고른 소리 파일들을 이 기기에 둔다 (곡마다 20MB 까지). 넣은 수 · 너무 커서 뺀 수 */
export async function addSongs(files: File[]): Promise<{ added: number; big: number }> {
  await songs(); const { MAX_AUDIO } = await media(); let added = 0, big = 0;
  for (const f of files) {
    if (f.size > MAX_AUDIO) { big++; continue; }
    const rec: PhoneSong = { id: uid(), owner: OWNER, kind: 'music', name: f.name.replace(/\.[^.]+$/, '').slice(0, 60) || 'track', data: await readDataURL(f), ts: Date.now() };
    await DB.put('assets', rec as never); list!.unshift({ id: rec.id, name: rec.name, from: 'phone', ts: rec.ts }); added++;
  }
  if (added) { list = [...list!]; bump(); }
  return { added, big };
}
/** 휴대폰에서 넣은 곡을 뺀다 (게임 화면의 곡은 게임 화면에서) */
export async function removeSong(id: string) {
  const s = list?.find(x => x.id === id); if (!s || s.from !== 'phone') return;
  if (cur?.id === id) { pause(); cur = null; if (url) { URL.revokeObjectURL(url); url = ''; } audio?.removeAttribute('src'); }
  await DB.del('assets', id); list = list!.filter(x => x.id !== id); bump();
  if (prefs().lastSong?.id === id) setPrefs({ lastSong: null });
}

export interface MusicState { cur: Song | null; playing: boolean; loaded: boolean; count: number }
let snap: MusicState = { cur: null, playing: false, loaded: false, count: 0 }, snapVer = -1;
const get = () => { if (snapVer !== ver) { snapVer = ver; snap = { cur, playing, loaded: !!list, count: list?.length || 0 }; } return snap; };
const sub = (f: () => void) => { subs.add(f); return () => { subs.delete(f); }; };
/** 지금 곡 · 트는 중인지 (바뀔 때만 다시 그린다) */
export const useMusic = (): MusicState => useSyncExternalStore(sub, get);
/** 진행 (0~1) · 지난 초 · 길이. 이 고리를 쓰는 판이 보이는 동안만 audio 의 timeupdate 를 듣는다 */
export function useProgress(): { at: number; dur: number } {
  const m = useMusic(), [p, setP] = useState(() => ({ at: audio?.currentTime || 0, dur: isFinite(audio?.duration || NaN) ? audio!.duration : 0 }));
  useEffect(() => {
    const a = audio; if (!a) return;
    const f = () => setP({ at: a.currentTime || 0, dur: isFinite(a.duration) ? a.duration : 0 });
    f(); a.addEventListener('timeupdate', f); a.addEventListener('loadedmetadata', f); a.addEventListener('emptied', f);
    return () => { a.removeEventListener('timeupdate', f); a.removeEventListener('loadedmetadata', f); a.removeEventListener('emptied', f); };
  }, [m.cur, m.playing]);
  return p;
}
/** 0:00 꼴 */
export const mmss = (s: number) => { const n = Math.max(0, Math.floor(s || 0)); return `${Math.floor(n / 60)}:${String(n % 60).padStart(2, '0')}`; };
/** 이 기기에 넣은 곡이 있는지만 가볍게 (소리 글자를 읽지 않는다) — 위젯의 빈 화면 판단 */
export async function anySongs(): Promise<boolean> {
  if (list) return list.length > 0;
  try { return (await DB.owners()).some(([, o]) => o === OWNER || o === 'game'); } catch { return false; }
}
