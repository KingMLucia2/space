// 线稿特效：扫描波纹、下洗气流、规划路线、被困者标记、探测扇面
import { poly, polyline, points, ring, custom, project, PAL } from './core.js';
import { clamp, smooth, mulberry32 } from './util.js';

export function scanRings(center, t, { radius = 3.4, alpha = 1, color = '#57cfff', n = 3, speed = 0.55 } = {}) {
  if (alpha <= 0.01) return;
  for (let i = 0; i < n; i++) {
    const ph = ((t * speed + i / n) % 1 + 1) % 1; const r = 0.15 + ph * radius;
    poly(ring(center, r, [0, 1, 0], 72), { stroke: color, width: 2, alpha: alpha * (1 - ph) * 0.9, glow: alpha * (1 - ph) * 1.6, glowColor: color, fade: false, depthBias: 0.5 });
  }
}
// 旋翼下洗：地面上向外扩散的尘环＋飞散的尘点
const DW = (() => { const R = mulberry32(17); const a = []; for (let i = 0; i < 260; i++) a.push([R() * 6.283, R(), R(), R()]); return a; })();
export function downwash(center, t, k, scale = 1) {
  if (k <= 0.01) return;
  for (let i = 0; i < 3; i++) { const ph = ((t * 1.6 + i / 3) % 1); poly(ring([center[0], center[1] + 0.02, center[2]], (0.5 + ph * 2.6) * scale, [0, 1, 0], 48), { stroke: '#9ccbe8', width: 1.5, alpha: k * (1 - ph) * 0.6, fade: false, depthBias: 0.3 }); }
  const p = []; for (const [a, r0, sp, h] of DW) { const u = ((t * (0.6 + sp) + r0) % 1); const r = (0.4 + u * 3.2) * scale; p.push(center[0] + Math.cos(a) * r, center[1] + 0.03 + h * 0.35 * u * scale, center[2] + Math.sin(a) * r); }
  points(new Float32Array(p), { color: '#b9d6ea', alpha: 0.55 * k, size: 1.8, sizeByDepth: true, fade: false });
}
// 地面规划路线：发光虚线，虚线向前流动；pts 为地面点列，k 显现进度（0~1 沿路径生长）
export function routeLine(pts, t, k = 1, alpha = 1) {
  if (k <= 0.01 || alpha <= 0.01) return;
  polyline(pts, { stroke: '#7fe3ff', width: 2.2, alpha: 0.9 * alpha, glow: 1.0 * alpha, progress: k, dash: [10, 12], fade: false, depthBias: 0.2 });
  const n = pts.length - 1; const u = Math.min(k, 1) * n; const i = Math.min(n - 1, Math.floor(u)), f = u - i; const a = pts[i], b = pts[i + 1];
  const head = [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f];
  if (k < 1) points(new Float32Array(head), { color: '#fff', size: 5, glow: 2.5 * alpha, glowColor: '#7fe3ff', fade: false });
}
// 被困者三维标记：竖直光柱＋地面脉冲环
export function survivorBeacon(x, z, t, i, a = 1, h = 26, ringR = 6) {
  if (a <= 0.01) return;
  polyline([[x, 0.2, z], [x, h, z]], { stroke: PAL.red, width: 2.2, alpha: 0.9 * a, glow: 1.6 * a, glowColor: PAL.red, fade: false, depthBias: -2 });
  const ph = ((t * 0.8 + i * 0.37) % 1);
  poly(ring([x, 0.3, z], ringR * (0.3 + ph), [0, 1, 0], 40), { stroke: PAL.red, width: 2, alpha: a * (1 - ph), glow: a * (1 - ph) * 1.2, glowColor: PAL.red, fade: false, depthBias: -2 });
}
// 探测扇面：从 o 出发朝 dir，展开角 spread，长度 len
export function scanFan(o, dir, len, spread, t, a = 1) {
  if (a <= 0.01) return;
  const [dx, dy, dz] = dir; const side = [dz, 0, -dx]; const sl = Math.hypot(side[0], side[2]) || 1; side[0] /= sl; side[2] /= sl;
  const tip = (s) => [o[0] + (dx + side[0] * s) * len, o[1] + dy * len, o[2] + (dz + side[2] * s) * len];
  const L = tip(-spread), R = tip(spread);
  poly([o, L, R], { fill: 'rgba(80,180,255,0.07)', stroke: '#57cfff', width: 1, alpha: 0.35 * a, fillAlpha: a, fade: false, depthBias: 0.4 });
  const ph = (t * 0.9) % 1; const m = (s) => [o[0] + (dx + side[0] * s) * len * ph, o[1] + dy * len * ph, o[2] + (dz + side[2] * s) * len * ph];
  polyline([m(-spread), m(spread)], { stroke: '#9fe8ff', width: 2, alpha: 0.8 * a * (1 - ph), glow: 1.2 * a * (1 - ph), fade: false, depthBias: 0.3 });
}
export { PAL };
