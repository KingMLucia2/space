// 线稿城区：线框楼（近处画出楼层与开间线）、点云瓦砾堆、斜插楼板、道路标线、城外等高线地形、烟柱粒子、救援车辆。
import { box, xform, PAL } from '../prims.js';
import { poly, polyline, points, segments, ring, project, toCam, cam } from '../core.js';
import { makeNoise2D, mulberry32, clamp, smooth, lerp } from '../util.js';

const TN = makeNoise2D(77);
export const CITY = {
  half: 230, block: 46, landing: [0, 0, 6.5], roadBlockX: 300, dock: [470, 0, -250],
  survivors: [[0.6, -1.2], [-26, 98], [46, 72], [-36, -84], [94, -38], [-108, -16], [70, -112], [-58, 34]],
};
export function terrainHeight(x, z) {
  const out = Math.hypot(Math.max(0, Math.abs(x) - CITY.half), Math.max(0, Math.abs(z) - CITY.half));
  let h = (TN.fbm(x * 0.0035, z * 0.0035, 4) * 0.5 + 0.45) * 30 * smooth(out / 140);
  h += 38 * Math.exp(-((x - CITY.dock[0]) ** 2 + (z - CITY.dock[2]) ** 2) / (2 * 80 * 80));
  if (x > 150) h = lerp(h, 0, 1 - smooth((Math.abs(z) - 9) / 35));
  return Math.max(0, h);
}
CITY.dock[1] = terrainHeight(CITY.dock[0], CITY.dock[2]);

let C = null;
export function buildCity() {
  if (C) return C;
  const rnd = mulberry32(2024);
  const B = [], piles = [], slabs = [], rebar = [], cars = [], trees = [];
  const near = (x, z, r) => CITY.survivors.some(([sx, sz]) => Math.hypot(sx - x, sz - z) < r);
  const keepOut = (x, z, m) => x > -1.8 - m && x < 3.2 + m && z > -0.6 - m && z < 9.5 + m;
  function pile(cx, cz, r, h, n, o = {}) {
    piles.push({ cx, cz, r, h, n, sx: o.sx || 1, sz: o.sz || 1, dense: !!o.dense });
    const ns = Math.round(n * 0.02 * (o.slabs ?? 1));
    for (let k = 0; k < ns; k++) { const a = rnd() * 6.28, rr = Math.sqrt(rnd()) * r * 0.85; const x = cx + Math.cos(a) * rr * (o.sx || 1), z = cz + Math.sin(a) * rr * (o.sz || 1); if (keepOut(x, z, 2.5)) continue;
      const y = h * 0.8 * Math.max(0, 1 - (rr / r) ** 2) ** 1.3; slabs.push({ x, y: y + 0.3, z, w: 1.5 + rnd() * 3.5, d: 1.2 + rnd() * 2.5, ry: rnd() * 6, rx: (rnd() - 0.5) * 1.1, rz: (rnd() - 0.5) * 1.1 }); }
    const nr = Math.round(n * 0.015 * (o.rebar ?? 1));
    for (let k = 0; k < nr; k++) { const a = rnd() * 6.28, rr = Math.sqrt(rnd()) * r * 0.8; const x = cx + Math.cos(a) * rr, z = cz + Math.sin(a) * rr; if (keepOut(x, z, 1.5)) continue; const y = h * 0.8 * Math.max(0, 1 - (rr / r) ** 2) ** 1.3; const L = 0.8 + rnd() * 2.2, ry = rnd() * 6, el = 0.3 + rnd() * 1.1; rebar.push([x, y, z, x + Math.cos(ry) * Math.cos(el) * L, y + Math.sin(el) * L, z + Math.sin(ry) * Math.cos(el) * L]); }
  }
  const BL = CITY.block, lot = BL - 12;
  for (let i = -4; i <= 4; i++) for (let j = -4; j <= 4; j++) {
    const cx = i * BL, cz = j * BL; if (i === 0 && j === 0) continue;
    const dist = Math.hypot(cx, cz) / 200; const split = rnd() < 0.55;
    const lots = split ? [[-1, -1], [1, -1], [-1, 1], [1, 1]].map(([a, b]) => [cx + a * lot / 4, cz + b * lot / 4, lot / 2 - 2, lot / 2 - 2]) : [[cx, cz, lot - 2, lot - 2]];
    for (const [x, z, w0, d0] of lots) {
      const w = w0 * (0.75 + rnd() * 0.25), d = d0 * (0.75 + rnd() * 0.25), h = 9 + rnd() * (dist > 0.7 ? 28 : 40);
      const forced = near(x, z, split ? 9 : 16), r = rnd() - (1 - dist) * 0.4;
      if (forced || r < 0.2) { pile(x, z, Math.max(w, d) * 0.85, Math.min(10, 3 + h * 0.18), 420 + h * 6, { slabs: 1.6, rebar: 2 }); if (rnd() < 0.6) { const wh = 5 + rnd() * 8; B.push({ x: x + (rnd() - 0.5) * w * 0.5, z: z + (rnd() - 0.5) * d * 0.5, w: w * (0.3 + rnd() * 0.3), d: 0.4, h: wh, ry: rnd() * 3, rx: (rnd() - 0.5) * 0.25, rz: (rnd() - 0.5) * 0.3, wall: true }); } }
      else if (r < 0.42) { const bh = (1 + Math.floor(rnd() * 2)) * 3.2; B.push({ x, z, w, d, h: bh, ry: (rnd() - 0.5) * 0.05 }); for (let k = 0; k < 3 + Math.floor(rnd() * 3); k++) slabs.push({ x: x + (rnd() - 0.5) * 2, y: bh + 0.5 + k * 0.9, z: z + (rnd() - 0.5) * 2, w: w * (0.75 + rnd() * 0.3), d: d * (0.75 + rnd() * 0.3), ry: (rnd() - 0.5) * 0.3, rx: (rnd() - 0.5) * 0.5, rz: (rnd() - 0.5) * 0.5 }); pile(x, z, Math.max(w, d) * 0.9, 3 + rnd() * 2, 220); }
      else { const lean = rnd() < 0.22 ? (rnd() < 0.5 ? -1 : 1) * (0.05 + rnd() * 0.09) : 0; const ax = rnd() < 0.5; const hh = h * (r < 0.6 ? 0.8 : 1);
        const b = { x, z, w, d, h: hh, ry: (rnd() - 0.5) * 0.06, rx: ax ? lean : 0, rz: ax ? 0 : lean, windows: true, broken: [] };
        if (r < 0.78) for (let k = 0; k < 3; k++) { const bw = w * (0.3 + rnd() * 0.4), bd = d * (0.3 + rnd() * 0.4), bh = 2 + rnd() * 6; b.broken.push({ ox: (rnd() - 0.5) * (w - bw), oz: (rnd() - 0.5) * (d - bd), w: bw, d: bd, h: bh, rx: (rnd() - 0.5) * 0.1, rz: (rnd() - 0.5) * 0.1 }); }
        B.push(b); if (r < 0.78) pile(x + (rnd() - 0.5) * w, z + d / 2 + 3, Math.max(w, d) * 0.45, 2.5, 60); }
    }
  }
  pile(0.5, -9.5, 9.5, 4.2, 1000, { slabs: 2, rebar: 2.5, dense: true });
  for (let k = 0; k < 5; k++) slabs.push({ x: (rnd() - 0.5) * 9, y: 1.2 + rnd() * 2.2, z: -6 - rnd() * 7, w: 2.5 + rnd() * 3, d: 2 + rnd() * 2, ry: rnd() * 6, rx: (rnd() - 0.5) * 1.2, rz: (rnd() - 0.5) * 1.2 });
  const bx = CITY.roadBlockX; pile(bx, 0, 16, 7, 1300, { sx: 0.8, sz: 1.5 });
  B.push({ x: bx - 6, z: 24, w: 16, d: 12, h: 10, ry: 0, windows: true, broken: [{ ox: 2, oz: 0, w: 6, d: 6, h: 3 }] }); pile(bx + 4, -26, 15, 5, 500);
  // 汽车
  for (let k = 0; k < 70; k++) { const along = (rnd() - 0.5) * 9 * BL, lane = (Math.floor(rnd() * 8) - 4) * BL + BL / 2 + (rnd() < 0.5 ? -3 : 3); const xz = rnd() < 0.5 ? [along, lane] : [lane, along]; if (Math.hypot(xz[0], xz[1] - 9) < 22) continue; cars.push({ x: xz[0], z: xz[1], ry: (xz[0] === along ? 0 : Math.PI / 2) + (rnd() - 0.5) * 0.6, crush: rnd() < 0.35 ? 0.5 : 1 }); }
  cars.push({ x: -9, z: 2, ry: 0.4, crush: 0.55 });
  for (let k = 0; k < 120; k++) { const x = 215 + rnd() * 800, side = rnd() < 0.5 ? -1 : 1, z = side * (10 + rnd() * 30); if (Math.abs(x - bx) < 30) continue; trees.push([x, terrainHeight(x, z), z, 0.7 + rnd() * 0.8]); }
  // 瓦砾点云（按堆生成，近景堆更密）
  const cloud = [];
  for (const p of piles) {
    const n = p.dense ? 9000 : Math.round(p.n * 0.9);
    const tmp = [];
    for (let k = 0; k < n; k++) {
      const a = rnd() * 6.28, rr = Math.sqrt(rnd()) * p.r; const x = p.cx + Math.cos(a) * rr * p.sx, z = p.cz + Math.sin(a) * rr * p.sz;
      if (keepOut(x, z, 0.8)) continue;
      const hm = p.h * 0.8 * Math.max(0, 1 - (rr / p.r) ** 2) ** 1.3 * (1 + TN(x * 0.4, z * 0.4) * 0.3);
      tmp.push(x, Math.max(0, hm + (rnd() - 0.3) * 0.5), z);
    }
    cloud.push({ cx: p.cx, cz: p.cz, r: p.r, h: p.h, arr: new Float32Array(tmp) });
  }
  // 地形等高线（城外）：在 4 米网格上做 marching squares，每 4 米一条
  const contour = [];
  const S = 6, x0 = -900, x1 = 1500, z0 = -1100, z1 = 1100;
  const nx = Math.floor((x1 - x0) / S), nz = Math.floor((z1 - z0) / S); const hg = new Float32Array((nx + 1) * (nz + 1));
  for (let j = 0; j <= nz; j++) for (let i = 0; i <= nx; i++) hg[j * (nx + 1) + i] = terrainHeight(x0 + i * S, z0 + j * S);
  for (let lev = 4; lev < 80; lev += 4) for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
    const h00 = hg[j * (nx + 1) + i], h10 = hg[j * (nx + 1) + i + 1], h01 = hg[(j + 1) * (nx + 1) + i], h11 = hg[(j + 1) * (nx + 1) + i + 1];
    const code = (h00 > lev) | ((h10 > lev) << 1) | ((h11 > lev) << 2) | ((h01 > lev) << 3); if (code === 0 || code === 15) continue;
    const X = x0 + i * S, Z = z0 + j * S, e = [];
    const ip = (ha, hb) => (lev - ha) / (hb - ha);
    if ((code & 1) !== ((code >> 1) & 1)) e.push([X + ip(h00, h10) * S, Z]);
    if (((code >> 1) & 1) !== ((code >> 2) & 1)) e.push([X + S, Z + ip(h10, h11) * S]);
    if (((code >> 2) & 1) !== ((code >> 3) & 1)) e.push([X + ip(h01, h11) * S, Z + S]);
    if (((code >> 3) & 1) !== (code & 1)) e.push([X, Z + ip(h00, h01) * S]);
    for (let q = 0; q + 1 < e.length; q += 2) contour.push(e[q][0], lev, e[q][1], e[q + 1][0], lev, e[q + 1][1]);
  }
  // 道路标线与路沿
  const road = [];
  for (let k = -4; k <= 3; k++) { const c = k * BL + BL / 2; for (const s of [-6, 6]) { road.push(-207, 0.02, c + s, 207, 0.02, c + s); road.push(c + s, 0.02, -207, c + s, 0.02, 207); }
    for (let u = -207; u < 207; u += 8) { road.push(u, 0.02, c, u + 3.5, 0.02, c); road.push(c, 0.02, u, c, 0.02, u + 3.5); } }
  for (let x = 207; x < 1100; x += 6) { const y = terrainHeight(x, 0) + 0.05, y2 = terrainHeight(x + 6, 0) + 0.05; road.push(x, y, -5.5, x + 6, y2, -5.5, x, y, 5.5, x + 6, y2, 5.5); if (Math.abs(x - bx) > 22 && (x / 6) % 2 < 1) road.push(x, y, 0, x + 3.5, y2, 0); }
  // 街区地面网格
  const grid = []; for (let u = -220; u <= 220; u += 10) { grid.push(u, 0, -220, u, 0, 220, -220, 0, u, 220, 0, u); }
  C = { B, piles, slabs, rebar, cars, trees, cloud, contour: new Float32Array(contour), road: new Float32Array(road), grid: new Float32Array(grid), rebarF: new Float32Array(rebar.flat()) };
  return C;
}

const ST = {
  bld: { fill: PAL.fill, stroke: PAL.line, width: 1.4, alpha: 0.95, innerAlpha: 0.26, innerColor: PAL.line, glow: 0.35 },
  bldFar: { fill: PAL.fill, stroke: PAL.line, width: 1.2, alpha: 0.85, glow: 0.25 },
  slab: { fill: 'rgba(6,18,30,0.95)', stroke: '#79c3ea', width: 1, alpha: 0.75 },
  car: { fill: 'rgba(5,14,24,0.95)', stroke: '#4aa3d4', width: 1, alpha: 0.7 },
};
// 主绘制：opts.focus 焦点用于细节分级，opts.time 用于粒子动画，opts.lite 用于俯瞰（省略细节）
// 局部地面网格（近景时给出地面参照），以 center 为中心，size 米见方，step 米一格
export function groundGrid(center, size = 30, step = 1, alpha = 0.6) {
  const a = []; const [cx, cz] = [Math.round(center[0] / step) * step, Math.round(center[2] / step) * step];
  for (let u = -size / 2; u <= size / 2; u += step) { a.push(cx + u, 0.005, cz - size / 2, cx + u, 0.005, cz + size / 2, cx - size / 2, 0.005, cz + u, cx + size / 2, 0.005, cz + u); }
  segments(new Float32Array(a), { stroke: '#2b6d99', alpha, width: 1, depthBias: 7e4 });
}
export function drawCity(t, opts = {}) {
  const c = buildCity(); const cp = cam.position; const lite = opts.lite;
  segments(c.contour, { stroke: '#2f86b8', alpha: 0.7, width: 1, depthBias: 1e5 });
  segments(c.grid, { stroke: PAL.faint, alpha: 0.45, width: 1, depthBias: 9e4 });
  segments(c.road, { stroke: '#46a6dc', alpha: 0.85, width: 1.4, depthBias: 8e4, glow: 0.25 });
  for (const b of c.B) {
    const dist = Math.hypot(b.x - cp.x, b.z - cp.z, (b.h / 2) - cp.y);
    const f = xform([b.x, 0, b.z], b.ry || 0, b.rx || 0, b.rz || 0);
    box(f, [b.w, b.h, b.d], dist < 260 && !lite ? ST.bld : ST.bldFar, { base: true, skipBottom: true, windows: b.windows && dist < 260 && !lite ? { floor: 3.2, bay: 4 } : null });
    if (b.broken) for (const k of b.broken) box(xform([b.x + k.ox, b.h, b.z + k.oz], b.ry || 0, (b.rx || 0) + (k.rx || 0), (b.rz || 0) + (k.rz || 0)), [k.w, k.h, k.d], ST.bldFar, { base: true, skipBottom: true });
  }
  for (const s of c.slabs) { const dist = Math.hypot(s.x - cp.x, s.z - cp.z, s.y - cp.y); if (dist > (lite ? 160 : 420)) continue; box(xform([s.x, s.y, s.z], s.ry, s.rx, s.rz), [s.w, 0.25, s.d], ST.slab); }
  for (const p of c.cloud) { const dist = Math.hypot(p.cx - cp.x, p.cz - cp.z, cp.y); const step = dist > 250 ? 3 : dist > 120 ? 2 : 1;
    let arr = p.arr; if (step > 1) { const n = Math.floor(arr.length / 3 / step); const a2 = new Float32Array(n * 3); for (let i = 0; i < n; i++) { a2[i * 3] = arr[i * step * 3]; a2[i * 3 + 1] = arr[i * step * 3 + 1]; a2[i * 3 + 2] = arr[i * step * 3 + 2]; } arr = a2; }
    points(arr, { color: '#86c4e6', alpha: 0.7, size: 1.7, sizeByDepth: true }); }
  segments(c.rebarF, { stroke: '#d9925a', alpha: 0.65, width: 1 });
  if (!lite) for (const k of c.cars) { const dist = Math.hypot(k.x - cp.x, k.z - cp.z, cp.y); if (dist > 300) continue; const f = xform([k.x, 0, k.z], k.ry); box(f, [4.2, 0.75 * k.crush, 1.8], ST.car, { base: true, skipBottom: true }); box(xform([k.x, 0.75 * k.crush, k.z], k.ry), [2.2, 0.6 * k.crush, 1.6], ST.car, { base: true, skipBottom: true }); }
  for (const [x, y, z, s] of c.trees) { const dist = Math.hypot(x - cp.x, z - cp.z, y - cp.y); if (dist > 500) continue; polyline([[x, y, z], [x, y + 3 * s, z]], { stroke: '#3b8fbf', alpha: 0.6, width: 1 }); poly(ring([x, y + 4 * s, z], 2 * s, [0, 1, 0], 14), { fill: 'rgba(4,14,22,0.9)', stroke: '#3b8fbf', alpha: 0.7, width: 1 }); }
  drawSmoke(t, opts);
}

// 烟柱：上升的粒子＋底部火光
const SMOKE = [[-84, -60, 1], [64, 112, 0.8], [136, -100, 1.2], [-150, 90, 0.7]];
function drawSmoke(t, opts) {
  const R = mulberry32(9);
  for (const [sx, sz, s] of SMOKE) {
    const n = 260, arr = new Float32Array(n * 3);
    for (let k = 0; k < n; k++) { const life = 18 + R() * 10, ph = R(); const age = ((t + ph * life) % life); const u = age / life;
      const sw = 2 + u * 22 * s; arr[k * 3] = sx + (R() - 0.5) * sw + age * 1.6; arr[k * 3 + 1] = 2 + age * (2.4 + R()) * s; arr[k * 3 + 2] = sz + (R() - 0.5) * sw + age * 0.4; }
    points(arr, { color: '#8fa6bb', alpha: 0.35, size: 2.2, sizeByDepth: true });
    const fl = 0.6 + 0.4 * Math.sin(t * 9 + sx);
    points(new Float32Array([sx, 1.2, sz, sx + 2, 0.8, sz + 1.5, sx - 1.5, 1, sz - 1]), { color: PAL.amber, alpha: 0.9 * fl, size: 3, glow: 1.2 * fl, glowColor: PAL.orange });
  }
}

// 救援车辆：线框车身＋闪烁警灯
const VEH = [[326, 2.2, -Math.PI / 2, 'fire'], [338, -2.6, -Math.PI / 2 + 0.08, 'fire'], [352, 2.0, -Math.PI / 2 - 0.05, 'amb']];
export function drawVehicles(t, on = 1) {
  VEH.forEach(([x, z, ry, kind], i) => {
    const y = terrainHeight(x, z); const len = kind === 'fire' ? 8.6 : 6.4; const f = xform([x, y, z], ry);
    const st = { fill: 'rgba(5,14,24,0.96)', stroke: kind === 'fire' ? '#ff6a4a' : PAL.white, width: 1.3, alpha: 0.9 };
    box((p) => f([p[0], p[1], p[2] - len * 0.14]), [2.5, 2.5, len * 0.68], st, { base: true, skipBottom: true });
    box((p) => f([p[0], p[1] + 0.65, p[2] + len * 0.355]), [2.5, 2.15, len * 0.27], st, { base: true, skipBottom: true });
    const k = (t * 2.2 + i * 0.37) % 1; const red = on * (k < 0.25 ? 1 : 0.15), blue = on * (k > 0.5 && k < 0.75 ? 1 : 0.15);
    points(new Float32Array([...f([0.5, 2.95, len * 0.36]), ...f([0.3, 2.95, len * 0.36])]), { color: '#ff3b30', alpha: red, size: 4, glow: 2.5 * red, glowColor: '#ff3b30', fade: false });
    points(new Float32Array([...f([-0.5, 2.95, len * 0.36]), ...f([-0.3, 2.95, len * 0.36])]), { color: '#3a7bff', alpha: blue, size: 4, glow: 2.5 * blue, glowColor: '#3a7bff', fade: false });
  });
}
