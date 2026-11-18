// 앱 아이콘(초승달)을 PNG 로 그린다. 의존성 없음.  사용: node scripts/make-icon.mjs
//   css/apple-touch-icon.png      180  (홈 화면에 추가했을 때)
//   ios-app/resources/icon.png   1024  (아이폰 앱 아이콘 — 투명 없이)
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BG = [0xfb, 0xf5, 0xf2], MOON = [0xd9, 0x8a, 0x9e];

const crcTable = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
const crc = buf => { let c = 0xffffffff; for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
const chunk = (type, data) => { const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const body = Buffer.concat([Buffer.from(type), data]); const sum = Buffer.alloc(4); sum.writeUInt32BE(crc(body)); return Buffer.concat([len, body, sum]); };

function draw(size) {
  // 파비콘과 같은 초승달: 큰 원에서 오른쪽 위로 비킨 원을 뺀다
  const cx = size * 0.47, cy = size * 0.53, r = size * 0.27;
  const ox = size * 0.60, oy = size * 0.42, or = size * 0.235;
  const N = 4, raw = Buffer.alloc(size * (size * 3 + 1));
  for (let y = 0; y < size; y++) {
    const row = y * (size * 3 + 1); raw[row] = 0;
    for (let x = 0; x < size; x++) {
      let hit = 0;
      for (let sy = 0; sy < N; sy++) for (let sx = 0; sx < N; sx++) {
        const px = x + (sx + 0.5) / N, py = y + (sy + 0.5) / N;
        if ((px - cx) ** 2 + (py - cy) ** 2 <= r * r && (px - ox) ** 2 + (py - oy) ** 2 > or * or) hit++;
      }
      const a = hit / (N * N);
      for (let c = 0; c < 3; c++) raw[row + 1 + x * 3 + c] = Math.round(BG[c] + (MOON[c] - BG[c]) * a);
    }
  }
  const head = Buffer.alloc(13); head.writeUInt32BE(size, 0); head.writeUInt32BE(size, 4); head[8] = 8; head[9] = 2;
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', head), chunk('IDAT', zlib.deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}

const write = (rel, size) => { const f = path.join(root, rel); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, draw(size)); console.log(rel, size); };
write('css/apple-touch-icon.png', 180);
write('ios-app/resources/icon.png', 1024);
