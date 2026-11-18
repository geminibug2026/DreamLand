// 날씨 · 계절 · 시간대: 배경 그림 위에 얹는 한 장의 캔버스와 색 보정.
// 눈에 띄려는 효과가 아니라 "그 자리에 있는 느낌"을 내는 것이 목표다 — 원근 세 겹, 속도에 따른 번짐, 초점 밖의 흐림, 느린 흐름
import { useEffect, useRef } from 'react';
import { weatherOf, type Sheet } from './state';

export type Sky = 'clear' | 'overcast' | 'rain' | 'storm' | 'snow' | 'fog' | 'wind';
export type Season = '' | 'spring' | 'summer' | 'autumn' | 'winter';
export type Tod = 'dawn' | 'day' | 'dusk' | 'night';
export interface Air { sky: Sky; power: number; season: Season; tod: Tod; indoor: boolean }
const INDOOR = ['room', 'tavern', 'hall', 'station'];
/** 시트의 날씨 · 시간 글에서 지금의 공기를 읽는다 */
export function airOf(s: Sheet, scene: string): Air {
  const w = weatherOf(s).toLowerCase(), t = s.time.toLowerCase(), all = `${w} ${t} ${s.place.toLowerCase()}`;
  const heavy = /heavy|pour|downpour|torrential|violent|blizzard|폭우|장대|세찬|거센|눈보라|폭설|暴|大雨|大雪/.test(w), light = /light|drizzle|sprinkle|flurr|가랑|이슬|보슬|약한|살짝|小雨|小雪|毛毛/.test(w);
  const sky: Sky = /thunder|storm|lightning|tempest|뇌우|천둥|번개|폭풍|雷|风暴/.test(w) ? 'storm' : /rain|drizzle|shower|downpour|비\b|비가|빗|소나기|장마|雨/.test(w) ? 'rain' : /snow|blizzard|sleet|flurr|눈\b|눈이|눈보라|폭설|진눈|雪/.test(w) ? 'snow'
    : /fog|mist|haze|smog|안개|연무|雾|霾/.test(w) ? 'fog' : /wind|gale|breez|gust|바람|강풍|돌풍|风/.test(w) ? 'wind' : /cloud|overcast|gloom|grey|gray|흐림|흐린|구름|阴|多云/.test(w) ? 'overcast' : 'clear';
  const season: Season = /spring|봄|春/.test(all) ? 'spring' : /summer|여름|夏/.test(all) ? 'summer' : /autumn|fall\b|가을|秋/.test(all) ? 'autumn' : /winter|겨울|冬/.test(all) ? 'winter' : sky === 'snow' ? 'winter' : '';
  const tod: Tod = /dawn|sunrise|daybreak|새벽|동틀|여명|해뜰|黎明|清晨|日出/.test(t) ? 'dawn' : /dusk|sunset|twilight|evening|황혼|해질|노을|저녁|땅거미|黄昏|傍晚|日落/.test(t) ? 'dusk' : /night|midnight|밤|자정|심야|한밤|夜|午夜/.test(t) ? 'night' : 'day';
  return { sky, power: heavy ? 1 : light ? .35 : .65, season, tod, indoor: INDOOR.includes(scene) };
}

// ── 그리기에 쓰는 것들 ──
const rnd = (a: number, b: number) => a + Math.random() * (b - a);
/** 부드러운 구름결 무늬 (안개용). 한 번 만들어 두고 늘려서 쓴다 */
function fogTexture(size = 256): HTMLCanvasElement {
  const c = document.createElement('canvas'); c.width = c.height = size; const g = c.getContext('2d')!, img = g.createImageData(size, size);
  const grid = (n: number) => Array.from({ length: n * n }, () => Math.random());
  const octs = [4, 8, 16, 32].map(n => ({ n, v: grid(n) })), smooth = (x: number) => x * x * (3 - 2 * x);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    let sum = 0, amp = .5;
    for (const { n, v } of octs) { const fx = x / size * n, fy = y / size * n, x0 = Math.floor(fx), y0 = Math.floor(fy), tx = smooth(fx - x0), ty = smooth(fy - y0), at = (i: number, j: number) => v[((j % n + n) % n) * n + ((i % n + n) % n)];
      sum += amp * ((at(x0, y0) * (1 - tx) + at(x0 + 1, y0) * tx) * (1 - ty) + (at(x0, y0 + 1) * (1 - tx) + at(x0 + 1, y0 + 1) * tx) * ty); amp *= .5; }
    const a = Math.max(0, sum - .42) * 2.4, i = (y * size + x) * 4; img.data[i] = img.data[i + 1] = img.data[i + 2] = 235; img.data[i + 3] = Math.min(255, a * 255);
  }
  g.putImageData(img, 0, 0); return c;
}
/** 초점 밖의 눈송이 · 반딧불: 가운데가 밝고 가장자리가 사라지는 둥근 빛 */
function glow(r: number, color: string): HTMLCanvasElement {
  const c = document.createElement('canvas'); c.width = c.height = r * 2; const g = c.getContext('2d')!, gr = g.createRadialGradient(r, r, 0, r, r, r);
  gr.addColorStop(0, color); gr.addColorStop(.35, color.replace(/[\d.]+\)$/, '.5)')); gr.addColorStop(1, color.replace(/[\d.]+\)$/, '0)')); g.fillStyle = gr; g.fillRect(0, 0, r * 2, r * 2); return c;
}
interface P { x: number; y: number; z: number; vx: number; vy: number; len: number; a: number; r: number; ph: number; spin: number; hue: number }
interface Splash { x: number; y: number; age: number }

export function Weather({ air, onFlash }: { air: Air; onFlash?: () => void }) {
  const ref = useRef<HTMLCanvasElement>(null), flash = useRef(0), cb = useRef(onFlash); cb.current = onFlash;
  const still = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  useEffect(() => {
    const cv = ref.current; if (!cv || still || air.indoor) return;
    const g = cv.getContext('2d')!; let W = 0, H = 0, raf = 0, last = performance.now(), alive = true, gust = 0, nextBolt = rnd(4, 11), tm = 0;
    const dpr = Math.min(1.5, devicePixelRatio || 1);   // 비 · 눈 · 안개는 흐릿한 것이라 이보다 촘촘해도 차이가 없다 (그릴 넓이만 는다)
    const fit = () => { W = cv.clientWidth; H = cv.clientHeight; cv.width = W * dpr; cv.height = H * dpr; g.setTransform(dpr, 0, 0, dpr, 0, 0); };
    fit(); const ro = new ResizeObserver(fit); ro.observe(cv);
    const wet = air.sky === 'rain' || air.sky === 'storm', snowy = air.sky === 'snow', foggy = air.sky === 'fog' || (wet && air.power > .8) || (snowy && air.power > .8);
    const wind = (air.sky === 'storm' ? 320 : air.sky === 'wind' ? 150 : wet ? 110 : snowy ? 36 : 22) * (air.sky === 'wind' ? 1 : .5 + air.power * .7);
    const area = () => Math.max(.5, W * H / 400000);
    const mk = (kind: 'rain' | 'snow' | 'leaf' | 'petal' | 'fly'): P => {
      const z = Math.random();   // 0 = 멀다, 1 = 가깝다
      if (kind === 'rain') { const sp = 620 + z * 900; return { x: rnd(-W * .3, W * 1.1), y: rnd(-H, 0), z, vx: -wind * (.6 + z * .8), vy: sp, len: 10 + z * 34, a: .14 + z * .3, r: .6 + z * 1, ph: 0, spin: 0, hue: 0 }; }
      if (kind === 'snow') return { x: rnd(-W * .1, W * 1.1), y: rnd(-H, 0), z, vx: -wind * (.4 + z), vy: 26 + z * 62 + air.power * 40, len: 0, a: .35 + z * .5, r: 1 + z * z * 7, ph: rnd(0, 6.28), spin: rnd(.4, 1.3), hue: 0 };
      if (kind === 'fly') return { x: rnd(0, W), y: rnd(H * .35, H * .9), z, vx: rnd(-8, 8), vy: rnd(-5, 5), len: 0, a: 0, r: 5 + z * 9, ph: rnd(0, 6.28), spin: rnd(.5, 1.4), hue: 0 };
      return { x: rnd(W, W * 1.3), y: rnd(-H * .2, H * .8), z, vx: -(60 + z * 120 + wind * .5), vy: 24 + z * 40, len: 0, a: .6 + z * .35, r: (kind === 'leaf' ? 5 : 3) + z * (kind === 'leaf' ? 8 : 4), ph: rnd(0, 6.28), spin: rnd(1.2, 3.4), hue: Math.random() };
    };
    const rain: P[] = wet ? Array.from({ length: Math.round(area() * (60 + air.power * 190)) }, () => { const p = mk('rain'); p.y = rnd(-H, H); return p; }) : [];
    const snow: P[] = snowy ? Array.from({ length: Math.round(area() * (50 + air.power * 130)) }, () => { const p = mk('snow'); p.y = rnd(-H, H); return p; }) : [];
    const drift: P[] = !wet && !snowy && (air.season === 'autumn' || (air.sky === 'wind' && air.season !== 'spring')) ? Array.from({ length: Math.round(area() * (air.sky === 'wind' ? 12 : 6)) }, () => { const p = mk('leaf'); p.x = rnd(0, W * 1.3); return p; }) : [];
    const petals: P[] = !wet && !snowy && air.season === 'spring' ? Array.from({ length: Math.round(area() * 9) }, () => { const p = mk('petal'); p.x = rnd(0, W * 1.3); return p; }) : [];
    const flies: P[] = air.sky === 'clear' && air.tod === 'night' && (air.season === 'summer' || air.season === '') ? Array.from({ length: Math.round(area() * 7) }, () => mk('fly')) : [];
    const fog = foggy ? fogTexture() : null, soft = snowy ? glow(16, 'rgba(255,255,255,1)') : null, spark = flies.length ? glow(16, 'rgba(214,255,140,1)') : null;
    const splashes: Splash[] = [];
    const LEAF = ['#b5541f', '#c98a2b', '#8f3b1b', '#a9772a'];
    // 그릴 것이 없는 맑은 날에는 화면을 돌리지 않는다
    const idle = !fog && !rain.length && !snow.length && !drift.length && !petals.length && !flies.length && air.sky !== 'storm';
    const frame = (now: number) => {
      if (!alive) return; const dt = Math.min(.05, (now - last) / 1000); last = now; tm += dt;
      g.clearRect(0, 0, W, H);
      gust = Math.sin(tm * .31) * .5 + Math.sin(tm * .83 + 1.7) * .3 + Math.sin(tm * 2.1) * .12;   // 바람은 한결같지 않다
      if (fog) {   // 안개: 서로 다른 빠르기로 흐르는 세 겹 + 아래쪽에 고인 것
        const base = air.sky === 'fog' ? .5 + air.power * .35 : .22;
        for (let i = 0; i < 3; i++) { const s = (1.6 + i * .9) * Math.max(W, H), off = ((tm * (6 + i * 5) + i * 311) % s + s) % s; g.globalAlpha = base * (.5 - i * .1); for (let k = -1; k < 2; k++) g.drawImage(fog, k * s - off, H * (.18 + i * .12), s, s * .62); }
        g.globalAlpha = 1; const gr = g.createLinearGradient(0, H * .45, 0, H); gr.addColorStop(0, 'rgba(225,230,235,0)'); gr.addColorStop(1, `rgba(225,230,235,${base * .45})`); g.fillStyle = gr; g.fillRect(0, H * .45, W, H * .55);
      }
      if (rain.length) {
        // 멀고 가까운 정도로 넷으로 묶어, 묶음마다 한 번에 긋는다. 빗줄기는 옅은 꼬리 + 짙은 머리 두 토막으로 (줄기마다 그러데이션을 만들지 않는다)
        g.lineCap = 'round';
        for (const p of rain) {
          const vx = p.vx * (1 + gust * .5); p.x += vx * dt; p.y += p.vy * dt; p.hue = vx;
          if (p.y > H * (.72 + p.z * .28)) { if (p.z > .55 && splashes.length < 60 && Math.random() < .5) splashes.push({ x: p.x, y: H * (.74 + p.z * .26), age: 0 }); Object.assign(p, mk('rain')); }
        }
        for (let b = 0; b < 4; b++) {
          const z = (b + .5) / 4, a = .14 + z * .3;
          for (let part = 0; part < 2; part++) {
            g.strokeStyle = `rgba(205,220,238,${part ? a : a * .38})`; g.lineWidth = .6 + z; g.beginPath();
            for (const p of rain) {
              if (Math.min(3, Math.floor(p.z * 4)) !== b || p.y < -40) continue;
              const k = p.len / p.vy, x2 = p.x - p.hue * k, y2 = p.y - p.len, mx = (x2 + p.x) / 2, my = (y2 + p.y) / 2;
              if (part) { g.moveTo(mx, my); g.lineTo(p.x, p.y); } else { g.moveTo(x2, y2); g.lineTo(mx, my); }
            }
            g.stroke();
          }
        }
        for (let i = splashes.length - 1; i >= 0; i--) { const s = splashes[i]; s.age += dt; if (s.age > .28) { splashes.splice(i, 1); continue; } const k = s.age / .28; g.strokeStyle = `rgba(215,228,242,${.3 * (1 - k)})`; g.lineWidth = .8; g.beginPath(); g.ellipse(s.x, s.y, 2 + k * 7, .6 + k * 2, 0, 0, 6.283); g.stroke(); }
      }
      for (const p of snow) {
        p.ph += p.spin * dt; p.x += (p.vx * (1 + gust * .8) + Math.sin(p.ph) * (10 + p.z * 16)) * dt; p.y += p.vy * dt;
        if (p.y > H + 12 || p.x < -40) { Object.assign(p, mk('snow')); continue; }
        if (p.r > 3.4 && soft) { g.globalAlpha = p.a * .5; g.drawImage(soft, p.x - p.r * 1.6, p.y - p.r * 1.6, p.r * 3.2, p.r * 3.2); }   // 가까운 것은 초점 밖
        else { g.globalAlpha = p.a; g.fillStyle = '#fff'; g.beginPath(); g.arc(p.x, p.y, p.r * .62, 0, 6.283); g.fill(); }
      }
      g.globalAlpha = 1;
      for (const [list, leaf] of [[drift, true], [petals, false]] as [P[], boolean][]) for (const p of list) {
        p.ph += p.spin * dt; p.x += p.vx * (1 + gust * .9) * dt; p.y += (p.vy + Math.sin(p.ph * .7) * 34) * dt;
        if (p.x < -30 || p.y > H + 30) { Object.assign(p, mk(leaf ? 'leaf' : 'petal')); continue; }
        g.save(); g.translate(p.x, p.y); g.rotate(p.ph); g.scale(Math.cos(p.ph * 1.3), 1); g.globalAlpha = p.a * (.55 + p.z * .45);
        g.fillStyle = leaf ? LEAF[Math.floor(p.hue * LEAF.length)] : `hsl(${342 + p.hue * 14} 78% ${86 + p.hue * 8}%)`;
        g.beginPath(); g.moveTo(0, -p.r); g.bezierCurveTo(p.r * .8, -p.r * .5, p.r * .7, p.r * .6, 0, p.r); g.bezierCurveTo(-p.r * .7, p.r * .6, -p.r * .8, -p.r * .5, 0, -p.r); g.fill();
        if (leaf) { g.strokeStyle = 'rgba(40,20,8,.35)'; g.lineWidth = .6; g.beginPath(); g.moveTo(0, -p.r); g.lineTo(0, p.r); g.stroke(); }
        g.restore();
      }
      if (spark) for (const p of flies) {
        p.ph += p.spin * dt; p.vx += rnd(-14, 14) * dt; p.vy += rnd(-10, 10) * dt; p.vx *= .99; p.vy *= .99; p.x += p.vx * dt; p.y += p.vy * dt;
        if (p.x < -20 || p.x > W + 20 || p.y < H * .25 || p.y > H) Object.assign(p, mk('fly'));
        const a = Math.max(0, Math.sin(p.ph)) ** 3; if (a < .02) continue; g.globalAlpha = a * (.5 + p.z * .5); g.drawImage(spark, p.x - p.r, p.y - p.r, p.r * 2, p.r * 2);
      }
      g.globalAlpha = 1;
      if (air.sky === 'storm') {   // 번개: 두세 번 깜빡이고 잦아든다
        nextBolt -= dt; if (nextBolt <= 0) { nextBolt = rnd(7, 19); flash.current = 1; cb.current?.(); }
        if (flash.current > 0) { const f = flash.current, flick = f > .6 ? (Math.sin(f * 60) > 0 ? 1 : .35) : 1; g.fillStyle = `rgba(226,234,255,${Math.min(.5, f * .5 * flick)})`; g.fillRect(0, 0, W, H); flash.current = Math.max(0, f - dt * 1.9); }
      }
      raf = requestAnimationFrame(frame);
    };
    if (idle) { g.clearRect(0, 0, W, H); return () => { alive = false; ro.disconnect(); }; }
    const vis = () => { cancelAnimationFrame(raf); if (!document.hidden) { last = performance.now(); raf = requestAnimationFrame(frame); } };
    document.addEventListener('visibilitychange', vis); raf = requestAnimationFrame(frame);
    return () => { alive = false; cancelAnimationFrame(raf); ro.disconnect(); document.removeEventListener('visibilitychange', vis); };
  }, [air.sky, air.power, air.season, air.tod, air.indoor, still]);
  return <>
    <div className={`gs-grade is-${air.tod} is-${air.sky}${air.indoor ? ' is-indoor' : ''}`} />
    <canvas ref={ref} className="gs-air" aria-hidden="true" />
  </>;
}
