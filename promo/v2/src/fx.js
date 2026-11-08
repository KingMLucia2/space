// 线稿特效：扫描波纹、扫描扇面
import { poly, ring, PAL } from './core.js';
export function scanRings(center, t, { radius = 3.4, alpha = 1, color = '#57cfff', n = 3, speed = 0.55 } = {}) {
  for (let i = 0; i < n; i++) {
    const ph = ((t * speed + i / n) % 1 + 1) % 1; const r = 0.15 + ph * radius;
    poly(ring(center, r, [0, 1, 0], 64), { stroke: color, width: 2, alpha: alpha * (1 - ph) * 0.9, glow: alpha * (1 - ph) * 1.6, glowColor: color, fade: false, depthBias: 0.5 });
  }
}
export { PAL };
