// 通用接口载荷（片尾模块化演示用）：履带机器人、潜水机器人、无人船；以及所有载荷顶部统一的对接盘。
// 每个函数返回 { f: 局部→世界变换, plate: 对接盘中心的世界坐标 }，无人机对接时机身中心在对接盘上方 0.185 米处。
import { poly, polyline, points, ring, solid, tube, line, PAL } from '../core.js';
import { xform, compose, box, cylinder, dome } from '../prims.js';
import { clamp, lerp, smooth } from '../util.js';

const W1 = { fill: PAL.fill, stroke: PAL.white, width: 1.5, alpha: 1, fade: false };
export const DOCK_GAP = 0.185;

// 通用对接盘：六边形底板＋锁扣环＋四个卡槽；glow 时环发光（对接指示）
export function dockPlate(f, y, glow = 0) {
  const hex = []; for (let k = 0; k < 6; k++) { const a = k * Math.PI / 3 + Math.PI / 6; hex.push([Math.cos(a) * 0.2, y, Math.sin(a) * 0.2]); }
  box((p) => f([p[0], p[1] + y - 0.012, p[2]]), [0.3, 0.024, 0.3], { fill: '#0b1a27', stroke: PAL.white, width: 1.2, alpha: 1, fade: false });
  poly(hex.map(f), { fill: '#0d2233', stroke: PAL.white, width: 1.3, alpha: 1, fade: false, depthBias: -0.002 });
  poly(ring([0, y + 0.004, 0], 0.13, [0, 1, 0], 32).map(f), { stroke: PAL.blue, width: 2, alpha: 1, glow: 0.6 + 2.2 * glow, glowColor: '#57cfff', fade: false, depthBias: -0.003 });
  for (let k = 0; k < 4; k++) { const a = k * Math.PI / 2 + Math.PI / 4; line(f([Math.sin(a) * 0.1, y + 0.005, Math.cos(a) * 0.1]), f([Math.sin(a) * 0.16, y + 0.005, Math.cos(a) * 0.16]), { stroke: PAL.orange, width: 2, alpha: 1, fade: false, depthBias: -0.004 }); }
  return f([0, y, 0]);
}

// 履带机器人：车体＋两侧履带（跑道形外轮廓、负重轮、履带板纹）＋前部传感器桅杆
export function drawTracked(s) {
  const f = xform(s.pos, s.heading || 0); const ph = s.phase || 0; const L = 0.82, R = 0.13, TW = 0.12, H0 = R;
  for (const sd of [-1, 1]) {
    const x = sd * 0.31; const out = [];
    for (let k = 0; k <= 12; k++) { const a = -Math.PI / 2 + k / 12 * Math.PI; out.push([x, H0 + Math.sin(a) * R, L / 2 - R + Math.cos(a) * R]); }
    for (let k = 0; k <= 12; k++) { const a = Math.PI / 2 + k / 12 * Math.PI; out.push([x, H0 + Math.sin(a) * R, -L / 2 + R + Math.cos(a) * R]); }
    const outer = out.map((p) => [p[0] + sd * TW / 2, p[1], p[2]]), inner = out.map((p) => [p[0] - sd * TW / 2, p[1], p[2]]);
    solid([...outer, ...inner].map(f), { ...W1, depthBias: 0.02 });
    poly(outer.map(f), { stroke: PAL.white, width: 1.4, alpha: 1, fade: false, depthBias: 0.01 });
    for (let k = 0; k < 14; k++) { const u = ((k / 14 + ph) % 1); const zz = -L / 2 + R + u * (L - 2 * R); line(f([x + sd * TW / 2, 0.008, zz]), f([x + sd * TW / 2, 0.035, zz]), { stroke: '#8fb7d2', width: 1.2, alpha: 0.9, fade: false, depthBias: 0.005 }); line(f([x + sd * TW / 2, 2 * R - 0.008, zz]), f([x + sd * TW / 2, 2 * R - 0.035, zz]), { stroke: '#8fb7d2', width: 1.2, alpha: 0.9, fade: false, depthBias: 0.005 }); }
    for (const zz of [-L / 2 + R, -0.12, 0.12, L / 2 - R]) { poly(ring([x + sd * (TW / 2 + 0.002), H0, zz], zz === -L / 2 + R || zz === L / 2 - R ? 0.1 : 0.07, [1, 0, 0], 16).map(f), { stroke: PAL.orange, width: 1.3, alpha: 1, fade: false, depthBias: 0.004 }); }
  }
  box((p) => f([p[0], p[1] + 0.13, p[2]]), [0.5, 0.2, 0.72], { ...W1 }, { base: true });
  polyline([[-0.25, 0.25, 0.361], [0.25, 0.25, 0.361]].map(f), { stroke: PAL.orange, width: 2.4, alpha: 1, fade: false });
  const mf = (p) => f([p[0], p[1] + 0.33, p[2] + 0.26]);
  line(mf([0, 0, 0]), mf([0, 0.14, 0]), { stroke: PAL.white, width: 2, fade: false });
  box((p) => mf([p[0], p[1] + 0.17, p[2]]), [0.14, 0.07, 0.08], { ...W1, width: 1.2 }, {});
  points(new Float32Array(mf([0, 0.17, 0.045])), { color: '#40e0ff', size: 4, glow: 1.6, fade: false });
  const plate = dockPlate(f, 0.345, s.glow || 0);
  return { f, plate };
}

// 潜水机器人（ROV）：开放式框架、顶部橙色浮力块、四个推进器、前部摄像头球罩与探照灯，底部气泡
export function drawROV(s) {
  const f = xform(s.pos, s.heading || 0); const t = s.t || 0; const w = 0.62, h = 0.36, d = 0.78;
  const fr = { stroke: PAL.white, width: 1.5, alpha: 1, fade: false };
  const c = [[-w / 2, 0.05, -d / 2], [w / 2, 0.05, -d / 2], [w / 2, 0.05, d / 2], [-w / 2, 0.05, d / 2]];
  const top = c.map((p) => [p[0], p[1] + h, p[2]]);
  poly(c.map(f), fr); poly(top.map(f), fr); for (let k = 0; k < 4; k++) line(f(c[k]), f(top[k]), fr);
  for (const sd of [-1, 1]) line(f([sd * w / 2, 0.0, -d / 2 - 0.05]), f([sd * w / 2, 0.0, d / 2 + 0.05]), { stroke: PAL.white, width: 2.2, alpha: 1, fade: false });
  box((p) => f([p[0], p[1] + 0.05 + h, p[2]]), [w + 0.04, 0.12, d + 0.02], { fill: 'rgba(60,24,6,0.95)', stroke: PAL.orange, width: 1.6, alpha: 1, fade: false }, { base: true });
  for (const [x, z, a] of [[-w / 2, -d / 2, 0.6], [w / 2, -d / 2, -0.6], [-w / 2, d / 2, 2.5], [w / 2, d / 2, -2.5]]) {
    const tf = compose(f, [x, 0.22, z], a); cylinder((p) => tf([p[0], p[2], p[1]]), 0.075, 0.075, 0.16, { ...W1, width: 1.2 }, 16);
    poly(ring([0, 0, 0.08], 0.075, [0, 0, 1], 16).map(tf), { stroke: PAL.blue, width: 1.2, alpha: 0.9, fade: false });
  }
  dome((p) => f([p[0], p[2] + 0.2, p[1] + d / 2 + 0.02]), 0.11, 1, { fill: 'rgba(20,60,90,0.9)', stroke: '#9fe0ff', width: 1.3, fade: false }, 14, true);
  for (const sd of [-1, 1]) points(new Float32Array(f([sd * 0.2, 0.33, d / 2 + 0.03])), { color: '#fff7e0', size: 4, glow: 2, glowColor: '#ffd9a8', fade: false });
  const bub = []; for (let i = 0; i < 40; i++) { const u = ((t * 0.5 + i * 0.137) % 1); bub.push(Math.sin(i * 2.3) * 0.25 + Math.sin(t + i) * 0.03, 0.1 + u * 1.2, Math.cos(i * 1.7) * 0.3); }
  points(new Float32Array(bub.map((v, i) => (i % 3 === 0 ? s.pos[0] + v : i % 3 === 1 ? s.pos[1] + v : s.pos[2] + v))), { color: '#bfe9ff', size: 2.2, alpha: 0.5, fade: false });
  const plate = dockPlate(f, 0.05 + h + 0.12, s.glow || 0);
  return { f, plate };
}

// 无人船：双体船身（放样外轮廓）、甲板、雷达桅杆，船底一圈水纹
export function drawUSV(s) {
  const f = xform(s.pos, s.heading || 0); const t = s.t || 0; const L = 1.3;
  for (const sd of [-1, 1]) {
    const x = sd * 0.34; const sec = [];
    for (let k = 0; k <= 10; k++) { const u = k / 10; const z = -L / 2 + u * L; const wdt = 0.09 * Math.sin(Math.PI * Math.min(1, u * 1.15)) + 0.01; sec.push([[x - wdt, 0.04, z], [x + wdt, 0.04, z], [x + wdt * 0.8, 0.18, z], [x - wdt * 0.8, 0.18, z]]); }
    solid(sec.flat().map(f), { ...W1, depthBias: 0.02 });
    polyline(sec.map((q) => f(q[2])), { stroke: PAL.white, width: 1.2, alpha: 0.8, fade: false, depthBias: 0.01 });
    polyline([[x, 0.1, -L / 2 + 0.1], [x, 0.1, L / 2 - 0.1]].map(f), { stroke: PAL.orange, width: 2.2, alpha: 1, fade: false, depthBias: 0.008 });
  }
  box((p) => f([p[0], p[1] + 0.2, p[2] - 0.05]), [0.86, 0.05, 0.9], { ...W1 }, { base: true });
  box((p) => f([p[0], p[1] + 0.25, p[2] + 0.42]), [0.36, 0.14, 0.24], { ...W1, width: 1.2 }, { base: true });
  line(f([0, 0.39, 0.42]), f([0, 0.66, 0.42]), { stroke: PAL.white, width: 2, fade: false });
  const ra = t * 2.2; line(f([Math.cos(ra) * 0.12, 0.66, 0.42 + Math.sin(ra) * 0.12]), f([-Math.cos(ra) * 0.12, 0.66, 0.42 - Math.sin(ra) * 0.12]), { stroke: PAL.white, width: 2.4, fade: false });
  points(new Float32Array(f([0, 0.7, 0.42])), { color: '#ff3b30', size: 4, alpha: (t % 1) < 0.5 ? 1 : 0.2, glow: (t % 1) < 0.5 ? 2 : 0, glowColor: '#ff3b30', fade: false });
  for (let k = 0; k < 3; k++) { const ph = ((t * 0.5 + k / 3) % 1); poly(ring([0, 0.01, 0], 0.8 + ph * 0.9, [0, 1, 0], 64).map(f), { stroke: '#57cfff', width: 1.4, alpha: 0.6 * (1 - ph), fade: false }); }
  const plate = dockPlate(f, 0.225, s.glow || 0);
  return { f, plate };
}
