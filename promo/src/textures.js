// 程序化贴图：混凝土、楼面、沥青、泥土、天空、灰尘、停机坪标线等，全部用 canvas 现场生成。
import * as THREE from 'three';
import { makeNoise2D, mulberry32, clamp } from './util.js';

function canvas(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
function tex(c, { repeat = true, srgb = true } = {}) {
  const t = new THREE.CanvasTexture(c);
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  t.needsUpdate = true;
  return t;
}
// 由灰度高度图生成法线贴图
export function normalFromHeight(heights, w, h, strength = 2) {
  const c = canvas(w, h), ctx = c.getContext('2d'), img = ctx.createImageData(w, h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const hl = heights[y * w + ((x - 1 + w) % w)], hr = heights[y * w + ((x + 1) % w)];
    const hu = heights[((y - 1 + h) % h) * w + x], hd = heights[((y + 1) % h) * w + x];
    let nx = (hl - hr) * strength, ny = (hd - hu) * strength, nz = 1;
    const l = Math.hypot(nx, ny, nz); nx /= l; ny /= l; nz /= l;
    const i = (y * w + x) * 4;
    img.data[i] = (nx * 0.5 + 0.5) * 255; img.data[i + 1] = (ny * 0.5 + 0.5) * 255; img.data[i + 2] = (nz * 0.5 + 0.5) * 255; img.data[i + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  return tex(c, { srgb: false });
}

// 混凝土 / 碎石表面：返回 { map, normalMap }
export function concrete(seed = 1, size = 512, base = [128, 124, 118], dirt = 0.5, cracks = 10, crackAlpha = 0.55) {
  const noise = makeNoise2D(seed), rnd = mulberry32(seed + 7);
  const c = canvas(size, size), ctx = c.getContext('2d'), img = ctx.createImageData(size, size);
  const heights = new Float32Array(size * size);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const u = x / size, v = y / size;
    const n1 = noise.fbm(u * 6, v * 6, 5) ; const n2 = noise.fbm(u * 40 + 9, v * 40 + 3, 3);
    const stain = clamp(noise.fbm(u * 2.5 + 30, v * 2.5 + 10, 4) * 1.8 + 0.1);
    let k = 1 + n1 * 0.22 + n2 * 0.12 - stain * 0.25 * dirt;
    if (rnd() < 0.004) k *= 0.6; // 小坑
    const i = (y * size + x) * 4;
    img.data[i] = clamp(base[0] * k, 0, 255); img.data[i + 1] = clamp(base[1] * k * 0.995, 0, 255); img.data[i + 2] = clamp(base[2] * k * 0.98, 0, 255); img.data[i + 3] = 255;
    heights[y * size + x] = n1 * 0.6 + n2 * 0.4;
  }
  ctx.putImageData(img, 0, 0);
  // 裂缝
  ctx.strokeStyle = `rgba(40,38,35,${crackAlpha})`; ctx.lineWidth = 1.2;
  for (let k = 0; k < cracks; k++) {
    let x = rnd() * size, y = rnd() * size; ctx.beginPath(); ctx.moveTo(x, y);
    for (let s = 0; s < 14; s++) { x += (rnd() - 0.5) * 30; y += (rnd() - 0.3) * 22; ctx.lineTo(x, y); }
    ctx.stroke();
  }
  return { map: tex(c), normalMap: normalFromHeight(heights, size, size, 3) };
}

// 楼房立面：8 开间 × 8 层的窗户，随机破损、熏黑、污渍
export function facade(seed = 1, wallColor = [150, 146, 138]) {
  const W = 1024, H = 1024, bays = 8, floors = 8;
  const noise = makeNoise2D(seed), rnd = mulberry32(seed * 13 + 5);
  const c = canvas(W, H), ctx = c.getContext('2d');
  const img = ctx.createImageData(W, H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const u = x / W, v = y / H;
    const n = noise.fbm(u * 8, v * 8, 4) * 0.12 + noise.fbm(u * 50, v * 50, 2) * 0.06;
    const streak = Math.max(0, noise.fbm(u * 30, v * 1.5 + 5, 3)) * 0.25; // 竖向雨渍
    const k = 1 + n - streak;
    const i = (y * W + x) * 4;
    img.data[i] = wallColor[0] * k; img.data[i + 1] = wallColor[1] * k; img.data[i + 2] = wallColor[2] * k; img.data[i + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  const bw = W / bays, fh = H / floors;
  for (let f = 0; f < floors; f++) {
    // 楼板线
    ctx.fillStyle = 'rgba(70,68,64,0.35)'; ctx.fillRect(0, f * fh + fh - 6, W, 6);
    for (let b = 0; b < bays; b++) {
      const x = b * bw + bw * 0.18, y = f * fh + fh * 0.22, w = bw * 0.64, h = fh * 0.5;
      const r = rnd();
      ctx.fillStyle = 'rgb(58,60,62)'; ctx.fillRect(x - 4, y - 4, w + 8, h + 8); // 窗框
      if (r < 0.18) { // 破窗：黑洞
        ctx.fillStyle = 'rgb(14,13,12)'; ctx.fillRect(x, y, w, h);
      } else {
        const g = ctx.createLinearGradient(x, y, x + w, y + h);
        const tone = 60 + rnd() * 40;
        g.addColorStop(0, `rgb(${tone * 0.8},${tone * 0.9},${tone})`); g.addColorStop(1, `rgb(${tone * 0.5},${tone * 0.55},${tone * 0.62})`);
        ctx.fillStyle = g; ctx.fillRect(x, y, w, h);
        ctx.fillStyle = 'rgba(40,42,44,0.9)'; ctx.fillRect(x + w / 2 - 2, y, 4, h); // 中梃
        if (r < 0.35) { // 碎裂玻璃
          ctx.strokeStyle = 'rgba(200,205,210,0.35)'; ctx.lineWidth = 1;
          const cx = x + rnd() * w, cy = y + rnd() * h;
          for (let k = 0; k < 7; k++) { ctx.beginPath(); ctx.moveTo(cx, cy); const a = rnd() * 6.28; ctx.lineTo(cx + Math.cos(a) * w * 0.6, cy + Math.sin(a) * h * 0.6); ctx.stroke(); }
        }
      }
      if (rnd() < 0.12) { // 熏黑
        const g = ctx.createRadialGradient(x + w / 2, y, 5, x + w / 2, y - fh * 0.3, fh * 0.9);
        g.addColorStop(0, 'rgba(20,18,16,0.6)'); g.addColorStop(1, 'rgba(20,18,16,0)');
        ctx.fillStyle = g; ctx.fillRect(x - bw * 0.3, y - fh, w + bw * 0.6, fh * 1.4);
      }
    }
  }
  // 大裂缝
  ctx.strokeStyle = 'rgba(30,28,26,0.7)'; ctx.lineWidth = 2.5;
  for (let k = 0; k < 4; k++) {
    let x = rnd() * W, y = rnd() * H; ctx.beginPath(); ctx.moveTo(x, y);
    for (let s = 0; s < 20; s++) { x += (rnd() - 0.5) * 50; y += 20 + rnd() * 30; ctx.lineTo(x, y); }
    ctx.stroke();
  }
  return tex(c);
}

export function asphalt(seed = 3, size = 512) {
  return concrete(seed, size, [64, 64, 66], 0.3);
}
export function dirt(seed = 5, size = 512) {
  return concrete(seed, size, [112, 100, 86], 0.8);
}

// 阴天天空球（等距柱状投影）
export function overcastSky(seed = 9, top = [150, 158, 168], horizon = [186, 188, 186]) {
  const W = 2048, H = 1024, noise = makeNoise2D(seed);
  const c = canvas(W, H), ctx = c.getContext('2d'), img = ctx.createImageData(W, H);
  for (let y = 0; y < H; y++) {
    const v = y / H; // 0 顶 1 底
    const elev = 1 - v * 2; // 1 天顶，0 地平线，-1 天底
    const g = clamp(1 - Math.abs(elev));
    for (let x = 0; x < W; x++) {
      const a = (x / W) * Math.PI * 2;
      const cl = noise.fbm(Math.cos(a) * 3 + 10, Math.sin(a) * 3 + v * 9, 5);
      const cl2 = noise.fbm(Math.cos(a) * 9 + 3, Math.sin(a) * 9 + v * 25, 3);
      const cloud = clamp(0.5 + cl * 0.9 + cl2 * 0.25);
      const i = (y * W + x) * 4;
      for (let k = 0; k < 3; k++) {
        const base = top[k] + (horizon[k] - top[k]) * Math.pow(g, 2.2);
        img.data[i + k] = clamp(base * (0.86 + cloud * 0.22) - (elev < 0 ? 30 : 0), 0, 255);
      }
      img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  const t = tex(c, { repeat: false });
  t.mapping = THREE.EquirectangularReflectionMapping;
  return t;
}

export function softSprite(size = 128, inner = 'rgba(255,255,255,1)') {
  const c = canvas(size, size), ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, inner); g.addColorStop(0.4, 'rgba(255,255,255,0.45)'); g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, size, size);
  return tex(c, { repeat: false });
}

// 烟尘团（不规则噪声）
export function smokeSprite(seed = 4, size = 256) {
  const noise = makeNoise2D(seed);
  const c = canvas(size, size), ctx = c.getContext('2d'), img = ctx.createImageData(size, size);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const dx = x / size - 0.5, dy = y / size - 0.5, d = Math.hypot(dx, dy) * 2;
    const n = noise.fbm(x / size * 4, y / size * 4, 5) * 0.5 + 0.5;
    const a = clamp((1 - d) * 1.4) * clamp(n * 1.6 - 0.25);
    const i = (y * size + x) * 4;
    img.data[i] = img.data[i + 1] = img.data[i + 2] = 255; img.data[i + 3] = a * 255;
  }
  ctx.putImageData(img, 0, 0);
  return tex(c, { repeat: false });
}

// 停机坪：混凝土 + 黄圈 + H
export function helipad() {
  const S = 1024, c = canvas(S, S), ctx = c.getContext('2d');
  const base = concrete(21, 512, [140, 138, 132], 0.4);
  ctx.drawImage(base.map.image, 0, 0, S, S);
  ctx.strokeStyle = 'rgba(232,190,40,0.95)'; ctx.lineWidth = 26; ctx.beginPath(); ctx.arc(S / 2, S / 2, S * 0.4, 0, Math.PI * 2); ctx.stroke();
  ctx.fillStyle = 'rgba(245,245,240,0.95)';
  ctx.fillRect(S * 0.36, S * 0.3, S * 0.07, S * 0.4); ctx.fillRect(S * 0.57, S * 0.3, S * 0.07, S * 0.4); ctx.fillRect(S * 0.36, S * 0.465, S * 0.28, S * 0.07);
  return tex(c, { repeat: false });
}

// 文字贴图（用于标识、屏幕 UI）
export function labelTexture(text, { w = 512, h = 128, font = 'bold 72px "Noto Sans SC","WenQuanYi Zen Hei",sans-serif', color = '#fff', bg = null } = {}) {
  const c = canvas(w, h), ctx = c.getContext('2d');
  if (bg) { ctx.fillStyle = bg; ctx.fillRect(0, 0, w, h); }
  ctx.fillStyle = color; ctx.font = font; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(text, w / 2, h / 2);
  return tex(c, { repeat: false });
}

// 碳纤维斜纹
export function carbonWeave(size = 256, cells = 16) {
  const c = canvas(size, size), ctx = c.getContext('2d'), s = size / cells;
  ctx.fillStyle = '#121416'; ctx.fillRect(0, 0, size, size);
  for (let i = 0; i < cells; i++) for (let j = 0; j < cells; j++) {
    const horiz = ((i + Math.floor(j / 2)) % 2) === 0;
    const g = horiz ? ctx.createLinearGradient(i * s, 0, i * s + s, 0) : ctx.createLinearGradient(0, j * s, 0, j * s + s);
    g.addColorStop(0, '#16181b'); g.addColorStop(0.5, '#33373d'); g.addColorStop(1, '#16181b');
    ctx.fillStyle = g; ctx.fillRect(i * s + 0.5, j * s + 0.5, s - 1, s - 1);
  }
  return tex(c);
}

// 面板缝与螺丝的法线贴图：lines = [[x0,y0,x1,y1]...]（0~1），screws = [[x,y]...]
export function panelNormal(size = 512, lines = [], screws = [], strength = 4) {
  const c = canvas(size, size), ctx = c.getContext('2d');
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, size, size);
  ctx.strokeStyle = '#000'; ctx.lineWidth = size / 220;
  for (const [x0, y0, x1, y1] of lines) { ctx.beginPath(); ctx.moveTo(x0 * size, y0 * size); ctx.lineTo(x1 * size, y1 * size); ctx.stroke(); }
  for (const [x, y] of screws) { const g = ctx.createRadialGradient(x * size, y * size, 0, x * size, y * size, size / 90); g.addColorStop(0, '#888'); g.addColorStop(0.6, '#333'); g.addColorStop(1, '#fff'); ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x * size, y * size, size / 90, 0, 6.29); ctx.fill(); }
  const d = ctx.getImageData(0, 0, size, size).data, hts = new Float32Array(size * size);
  for (let i = 0; i < size * size; i++) hts[i] = d[i * 4] / 255;
  return normalFromHeight(hts, size, size, strength);
}

// 机身贴花：橙色底＋白字，可绕圆柱一周
export function decalBand(text, { w = 2048, h = 128, bg = '#f06a14', fg = '#ffffff', font = 'bold 76px "Noto Sans SC","WenQuanYi Zen Hei",Arial,sans-serif', repeat = 3, chevrons = true } = {}) {
  const c = canvas(w, h), ctx = c.getContext('2d');
  ctx.fillStyle = bg; ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = fg; ctx.font = font; ctx.textBaseline = 'middle'; ctx.textAlign = 'center';
  for (let k = 0; k < repeat; k++) {
    const cx = (k + 0.5) * w / repeat; ctx.fillText(text, cx, h / 2 + 4);
    if (chevrons) { ctx.fillStyle = 'rgba(20,20,22,0.85)'; for (let q = 0; q < 4; q++) { const x = cx + w / repeat * 0.33 + q * 26; ctx.beginPath(); ctx.moveTo(x, 18); ctx.lineTo(x + 14, h / 2); ctx.lineTo(x, h - 18); ctx.lineTo(x + 10, h - 18); ctx.lineTo(x + 24, h / 2); ctx.lineTo(x + 10, 18); ctx.fill(); } ctx.fillStyle = fg; }
  }
  return tex(c, { repeat: false });
}
