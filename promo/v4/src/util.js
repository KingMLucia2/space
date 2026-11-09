// 通用数学工具：缓动、区间、随机数、噪声、镜头抖动。所有动画都写成时间的纯函数，便于逐帧确定性渲染。
export const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
export const lerp = (a, b, t) => a + (b - a) * t;
export const range = (t, a, b) => clamp((t - a) / (b - a));
export const smooth = (t) => { t = clamp(t); return t * t * (3 - 2 * t); };
export const smoother = (t) => { t = clamp(t); return t * t * t * (t * (t * 6 - 15) + 10); };
export const easeOut = (t) => 1 - Math.pow(1 - clamp(t), 3);
export const easeIn = (t) => Math.pow(clamp(t), 3);
export const easeOutQuint = (t) => 1 - Math.pow(1 - clamp(t), 5);
export const easeInQuad = (t) => clamp(t) * clamp(t);

export function mulberry32(seed) {
  return function () {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// 二维梯度噪声（Perlin 风格），返回约 [-1, 1]
export function makeNoise2D(seed = 1) {
  const rnd = mulberry32(seed);
  const p = new Uint8Array(512);
  const perm = [...Array(256).keys()];
  for (let i = 255; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [perm[i], perm[j]] = [perm[j], perm[i]]; }
  for (let i = 0; i < 512; i++) p[i] = perm[i & 255];
  const grad = (h, x, y) => { const a = (h & 7) * Math.PI / 4; return Math.cos(a) * x + Math.sin(a) * y; };
  const fade = (t) => t * t * t * (t * (t * 6 - 15) + 10);
  const noise = (x, y) => {
    const X = Math.floor(x) & 255, Y = Math.floor(y) & 255;
    x -= Math.floor(x); y -= Math.floor(y);
    const u = fade(x), v = fade(y);
    const aa = p[p[X] + Y], ab = p[p[X] + Y + 1], ba = p[p[X + 1] + Y], bb = p[p[X + 1] + Y + 1];
    return lerp(lerp(grad(aa, x, y), grad(ba, x - 1, y), u), lerp(grad(ab, x, y - 1), grad(bb, x - 1, y - 1), u), v) * 1.4;
  };
  noise.fbm = (x, y, oct = 4, lac = 2, gain = 0.5) => {
    let s = 0, a = 1, f = 1, n = 0;
    for (let i = 0; i < oct; i++) { s += a * noise(x * f, y * f); n += a; a *= gain; f *= lac; }
    return s / n;
  };
  return noise;
}

// 平滑的一维噪声（多正弦叠加），用于镜头抖动、灯光闪烁
export function wobble(t, seed = 0) {
  return (Math.sin(t * 1.7 + seed * 3.1) * 0.5 + Math.sin(t * 2.9 + seed * 1.3) * 0.3 + Math.sin(t * 5.3 + seed * 7.7) * 0.2);
}
export function shake(t, amp = 1, speed = 1, seed = 0) {
  const s = t * speed;
  return { x: wobble(s, seed) * amp, y: wobble(s, seed + 11) * amp, z: wobble(s, seed + 23) * amp };
}

// Catmull-Rom 路径插值（数组点 [x,y,z]），u ∈ [0,1]
export function pathPoint(points, u) {
  const n = points.length - 1;
  const f = clamp(u) * n;
  const i = Math.min(n - 1, Math.floor(f));
  const t = f - i;
  const p0 = points[Math.max(0, i - 1)], p1 = points[i], p2 = points[i + 1], p3 = points[Math.min(n, i + 2)];
  const cr = (a, b, c, d) => 0.5 * ((2 * b) + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t * t + (-a + 3 * b - 3 * c + d) * t * t * t);
  return [cr(p0[0], p1[0], p2[0], p3[0]), cr(p0[1], p1[1], p2[1], p3[1]), cr(p0[2], p1[2], p2[2], p3[2])];
}
