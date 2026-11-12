// 표정 그림 올리기 · 확인 창 · ZIP 내보내기
import type { CharX } from '../addons/types';
import { errMsg } from '../addons/parts';
import { Select, openModal, useRedraw, type Opt } from '../addons/parts';
import { IMG_EXT, cleanLabel, fileKey, matchLabel, unzipEntries } from './pure';
import { Sprites, bus, cfg, fullName, save, universe } from './store';
import * as libAssets from '../lib/assets';
import { bytesToDataURL, dataURLToBytes, download, mimeOf, readDataURL, shrinkImage } from '../lib/core';
import { toast } from '../ui';

interface Item { fileName: string; mime: string; load(): Promise<string>; label: string; how: string; guess: string; pick: string; data?: string }
const isImg = (name: string, type: string) => (type || '').startsWith('image/') || IMG_EXT.test(name || '');
/** 고른 파일(이미지 · ZIP · 폴더)을 한 줄로 펼친다 → [{ fileName, mime, load() → dataURL }] */
async function gather(files: File[]) {
  const out: Item[] = [], notes: string[] = [];
  const blank = { label: '', how: 'none', guess: '', pick: '' };
  for (const f of files) {
    if (/\.zip$/i.test(f.name) || f.type === 'application/zip' || f.type === 'application/x-zip-compressed') {
      const { entries, skipped } = unzipEntries(await f.arrayBuffer());
      if (skipped.length) notes.push(`${f.name}: 풀 수 없는 항목 ${skipped.length}개는 건너뛰었어요`);
      for (const z of entries) if (IMG_EXT.test(z.name)) out.push({ ...blank, fileName: z.name.split('/').pop() || '', mime: mimeOf(z.name), load: async () => bytesToDataURL(await z.read(), mimeOf(z.name)) });
    } else if (isImg(f.name, f.type)) out.push({ ...blank, fileName: f.name, mime: f.type || mimeOf(f.name), load: () => readDataURL(f) });
  }
  return { items: out, notes };
}
const storeData = async (raw: string, mime: string) => /gif/i.test(mime) ? raw : (await shrinkImage(raw, Math.max(256, +cfg().maxPx || 1280))) || '';
/** 표정 그림 넣기. opts.label 을 주면 전부 그 감정으로, 아니면 파일 이름으로 맞추고 애매하면 확인 창을 띄운다 */
export async function importFiles(charId: string, files: File[], { label = '', onProgress = () => { } }: { label?: string; onProgress?: (n: number, total: number) => void } = {}): Promise<number> {
  let got;
  try { got = await gather(files); } catch (e) { toast('파일을 읽지 못했어요: ' + errMsg(e), 'err'); return 0; }
  for (const n of got.notes) toast(n);
  const items = got.items;
  if (!items.length) { toast('넣을 이미지가 없어요 (PNG · WebP · GIF · JPEG · AVIF · ZIP)'); return 0; }
  await Sprites.load(charId);
  const labels = universe(charId);
  for (const it of items) {
    const m: { label: string; how: string; guess: string } = label ? { label, how: 'exact', guess: '' } : matchLabel(it.fileName, labels);
    if (!m.label && labels.includes(m.guess)) { m.label = m.guess; m.how = 'token'; }
    Object.assign(it, { label: m.label, how: m.how, guess: m.guess, pick: m.label || (m.guess ? '+' + m.guess : '') });
  }
  if (!label && items.some(it => it.how === 'token' || it.how === 'none')) { if (!(await reviewImport(items, labels))) return 0; }
  const c = cfg(); let n = 0, fail = 0, added = 0;
  const todo = items.filter(it => it.pick);
  for (const it of todo) {
    let lab = it.pick;
    if (lab[0] === '+') { lab = cleanLabel(lab.slice(1)); if (lab && !universe(charId).includes(lab)) { c.custom.push({ label: lab, name: '', keys: '' }); added++; } }
    try {
      if (!lab) throw new Error('이름 없음');
      const data = await storeData(it.data || await it.load(), it.mime); if (!data) throw new Error('그림을 읽지 못함');
      await Sprites.put(charId, lab, fileKey(it.fileName) || lab, data); n++;
    } catch (e) { console.warn('[표정 올리기]', it.fileName, e); fail++; }
    onProgress(n + fail, todo.length);
  }
  Sprites.note(charId); if (added) save();
  toast(n ? `표정 그림 ${n}장을 넣었어요${added ? ` · 새 감정 ${added}가지` : ''}${fail ? ` · ${fail}장 실패` : ''}` : '넣은 그림이 없어요', n ? 'ok' : (fail ? 'err' : ''));
  if (n) bus.sync();
  return n;
}

const HOW: Record<string, string> = { exact: '', prefix: '', token: '이름 일부로 추정', none: '새 감정' };
function Review({ items, labels }: { items: Item[]; labels: string[] }) {
  const redraw = useRedraw();
  const on = items.filter(it => it.pick), fresh = new Set(on.filter(it => it.pick[0] === '+').map(it => it.pick));
  const sorted = [...items].sort((a, b) => +(b.how === 'none') - +(a.how === 'none') || +(b.how === 'token') - +(a.how === 'token') || a.fileName.localeCompare(b.fileName, undefined, { numeric: true }));
  return <>
    <p className="hint">{`${items.length}장 중 ${on.length}장을 넣습니다${fresh.size ? ` · 새 감정 ${fresh.size}가지가 만들어져요` : ''}. 감정이 맞는지 확인해 주세요.`}</p>
    <div className="exs-rev-list">{sorted.map((it, i) => {
      const opts: Opt[] = [['', '넣지 않기'], ...(it.guess && !labels.includes(it.guess) ? [['+' + it.guess, `새 감정으로: ${it.guess}`] as const] : []), ...labels.map(l => [l, fullName(l)] as const)];
      return <div key={i} className={'exs-rev-row' + (it.how === 'none' || it.how === 'token' ? ' ask' : '')}>
        <span className="exs-thumb">{it.data ? <img src={it.data} alt="" loading="lazy" /> : <i>?</i>}</span>
        <div className="exs-rev-text"><b title={it.fileName}>{it.fileName}</b>{HOW[it.how] ? <small>{HOW[it.how]}</small> : null}</div>
        <Select value={it.pick} opts={opts} onChange={v => { it.pick = v; redraw(); }} />
      </div>;
    })}</div>
  </>;
}
/** 파일 이름으로 감정을 확신할 수 없을 때: 한 장씩 감정을 확인한다 */
async function reviewImport(items: Item[], labels: string[]): Promise<boolean> {
  for (const it of items) { try { it.data = await it.load(); } catch { it.data = ''; } }
  return new Promise(res => {
    let done = false;
    openModal({ title: '표정 그림 확인', wide: true, spec: 'div.exs-rev', onClose: () => { if (!done) res(false); },
      actions: [{ label: '취소' }, { label: '넣기', cls: 'primary', ic: 'check', onclick: () => { done = true; res(true); } }] }, () => <Review items={items} labels={labels} />);
  });
}

const safeFile = (s: string) => String(s || 'sprites').replace(/[\\/:*?"<>|]+/g, '_').trim() || 'sprites';
const EXT: Record<string, string> = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'image/gif': 'gif', 'image/avif': 'avif' };
const extOf = (dataUrl: string) => EXT[String(dataUrl).slice(5, String(dataUrl).indexOf(';'))] || 'png';
/** 스프라이트 폴더에 그대로 넣을 수 있는 이름(joy.png, joy-1.png)으로 ZIP 내보내기 */
export function exportZip(char: CharX) {
  const list = Sprites.list(char.id); if (!list.length) return toast('내보낼 표정 그림이 없어요');
  const seen = new Set<string>(), files: { name: string; data: Uint8Array }[] = [], n: Record<string, number> = {};
  for (const a of list) {
    let base = a.name === a.label || a.name.startsWith(a.label + '-') || a.name.startsWith(a.label + '.') ? safeFile(a.name) : '';
    while (!base || seen.has(base)) { const i = n[a.label] = (n[a.label] ?? -1) + 1; base = i ? `${a.label}-${i}` : a.label; }
    seen.add(base); files.push({ name: `${base}.${extOf(a.data)}`, data: dataURLToBytes(a.data) });
  }
  const { zip } = libAssets;
  download(`${safeFile(char.name)}_sprites.zip`, zip(files), 'application/zip');
  toast(`표정 그림 ${files.length}장을 ZIP 으로 내보냈어요`, 'ok');
}
