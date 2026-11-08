// 线稿城区：线框楼（近处画出楼层与开间线）、点云瓦砾堆、斜插楼板、道路标线、城外等高线地形、烟柱粒子、救援车辆。
import { box, xform, PAL } from '../prims.js';
import { poly, polyline, points, segments, ring, project, toCam, cam, line, custom, pxPerMeter } from '../core.js';
import { makeNoise2D, mulberry32, clamp, smooth, lerp } from '../util.js';

const TN = makeNoise2D(77);
export const CITY = {
  half: 230, block: 46, landing: [0, 0, 6.5], roadBlockX: 300, dock: [470, 0, -250],
  survivors: [[0.5, -3.0], [-26, 98], [46, 72], [-36, -84], [94, -38], [-108, -16], [70, -112], [-58, 34]],
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
  const B = [], piles = [], slabs = [], rebar = [], cars = [], trees = [], ghosts = [];
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
      if (forced || r < 0.3) { ghosts.push({ x, z, w, d, h, low: 0 }); pile(x, z, Math.max(w, d) * 0.85, Math.min(10, 3 + h * 0.18), 420 + h * 6, { slabs: 1.6, rebar: 2 }); if (rnd() < 0.6) { const wh = 5 + rnd() * 8; B.push({ x: x + (rnd() - 0.5) * w * 0.5, z: z + (rnd() - 0.5) * d * 0.5, w: w * (0.3 + rnd() * 0.3), d: 0.4, h: wh, ry: rnd() * 3, rx: (rnd() - 0.5) * 0.25, rz: (rnd() - 0.5) * 0.3, wall: true }); } }
      else if (r < 0.5) { const bh = (1 + Math.floor(rnd() * 2)) * 3.2; ghosts.push({ x, z, w, d, h, low: bh }); B.push({ x, z, w, d, h: bh, ry: (rnd() - 0.5) * 0.05 }); for (let k = 0; k < 3 + Math.floor(rnd() * 3); k++) slabs.push({ x: x + (rnd() - 0.5) * 2, y: bh + 0.5 + k * 0.9, z: z + (rnd() - 0.5) * 2, w: w * (0.75 + rnd() * 0.3), d: d * (0.75 + rnd() * 0.3), ry: (rnd() - 0.5) * 0.3, rx: (rnd() - 0.5) * 0.5, rz: (rnd() - 0.5) * 0.5 }); pile(x, z, Math.max(w, d) * 0.9, 3 + rnd() * 2, 220); }
      else { const lean = rnd() < 0.34 ? (rnd() < 0.5 ? -1 : 1) * (0.06 + rnd() * 0.12) : 0; const ax = rnd() < 0.5; const hh = h * (r < 0.6 ? 0.8 : 1);
        const b = { x, z, w, d, h: hh, ry: (rnd() - 0.5) * 0.06, rx: ax ? lean : 0, rz: ax ? 0 : lean, windows: true, broken: [] };
        if (r < 0.88) for (let k = 0; k < 3; k++) { const bw = w * (0.3 + rnd() * 0.4), bd = d * (0.3 + rnd() * 0.4), bh = 2 + rnd() * 6; b.broken.push({ ox: (rnd() - 0.5) * (w - bw), oz: (rnd() - 0.5) * (d - bd), w: bw, d: bd, h: bh, rx: (rnd() - 0.5) * 0.1, rz: (rnd() - 0.5) * 0.1 }); }
        B.push(b); if (r < 0.88) pile(x + (rnd() - 0.5) * w, z + d / 2 + 3, Math.max(w, d) * 0.45, 2.5, 60); }
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
      const a = rnd() * 6.28, rr = Math.sqrt(rnd()) * p.r * (1 + 0.2 * Math.sin(3 * a + p.cx) + 0.12 * Math.sin(5 * a + p.cz)); const x = p.cx + Math.cos(a) * rr * p.sx, z = p.cz + Math.sin(a) * rr * p.sz;
      if (keepOut(x, z, 0.8)) continue;
      const hm = p.h * 0.8 * Math.max(0, 1 - Math.min(1, rr / p.r) ** 2) ** 1.3 * (1 + TN(x * 0.4, z * 0.4) * 0.3);
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
  // 地裂缝：地面上的锯齿折线（避开中央广场）
  const cracks = [];
  for (let k = 0; k < 10; k++) {
    let x = (rnd() - 0.5) * 380, z = (rnd() - 0.5) * 380; if (Math.abs(x) < 30 && Math.abs(z) < 34) x += 70;
    let a = rnd() * 6.283; const n = 10 + Math.floor(rnd() * 12); const pts = [[x, 0.05, z]];
    for (let i = 0; i < n; i++) { a += (rnd() - 0.5) * 0.9; const L = 2.5 + rnd() * 4; x += Math.cos(a) * L; z += Math.sin(a) * L; pts.push([x, 0.05, z]); }
    cracks.push(pts);
  }
  // 瓦砾上的零星火点
  const fires = [];
  for (const p of piles) { if (Math.abs(p.cx) < 14 && Math.abs(p.cz) < 20) continue; if (rnd() < 0.3) fires.push([p.cx + (rnd() - 0.5) * p.r, p.h * 0.5, p.cz + (rnd() - 0.5) * p.r, 0.6 + rnd() * 1.2, rnd()]); }
  // 基站所在高地的地形网格
  const mesh = []; const MS = 10, SS = 5;
  for (let x = 330; x <= 640; x += MS) for (let z = -430; z < -80; z += SS) mesh.push(x, terrainHeight(x, z) + 0.05, z, x, terrainHeight(x, z + SS) + 0.05, z + SS);
  for (let z = -430; z <= -80; z += MS) for (let x = 330; x < 640; x += SS) mesh.push(x, terrainHeight(x, z) + 0.05, z, x + SS, terrainHeight(x + SS, z) + 0.05, z);
  // 地震前的完整楼体（倒塌动画用）与崩落碎块的取样点
  const R2 = mulberry32(55);
  for (const g of ghosts) { const n = Math.round(Math.min(260, 40 + g.w * g.d * g.h / 220)); const deb = new Float32Array(n * 4);
    for (let i = 0; i < n; i++) { const e = R2(); deb[i * 4] = (R2() - 0.5) * g.w; deb[i * 4 + 1] = g.low + R2() * (g.h - g.low); deb[i * 4 + 2] = (R2() - 0.5) * g.d; deb[i * 4 + 3] = e; if (e < 0.5) { if (R2() < 0.5) deb[i * 4] = Math.sign(deb[i * 4]) * g.w / 2; else deb[i * 4 + 2] = Math.sign(deb[i * 4 + 2]) * g.d / 2; } }
    g.deb = deb; }
  C = { B, piles, slabs, rebar, cars, trees, cloud, cracks, fires, ghosts, mesh: new Float32Array(mesh), contour: new Float32Array(contour), road: new Float32Array(road), grid: new Float32Array(grid), rebarF: new Float32Array(rebar.flat()) };
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
// opts: lite（省略细节）、ground（地面线条透明度）、pts（点云透明度）、xray {x,z,r,k}（探测时瓦砾变透明）
// opts.quake(x, z) → { c: 倒塌进度 0~1, tau: 距该处开始倒塌的秒数 }：开场地震用，没有时按已倒塌画
export function drawCity(t, opts = {}) {
  const c = buildCity(); const cp = cam.position; const lite = opts.lite; const ga = opts.ground ?? 1, pa = opts.pts ?? 1; const xr = opts.xray;
  const Q = opts.quake; const qc = Q ? (x, z) => Q(x, z).c : () => 1; const after = (x, z) => (Q ? smooth((qc(x, z) - 0.3) / 0.6) : 1);
  if (Q) drawQuake(c, Q, t);
  if (ga > 0.01) {
    segments(c.contour, { stroke: '#2f86b8', alpha: 0.7 * ga, width: 1, depthBias: 1e5 });
    segments(c.grid, { stroke: PAL.faint, alpha: 0.32 * ga, width: 1, depthBias: 9e4 });
    segments(c.road, { stroke: '#46a6dc', alpha: 0.85 * ga, width: 1.4, depthBias: 8e4, glow: 0.18 * ga });
    segments(c.mesh, { stroke: '#2a7fb0', alpha: 0.42 * ga, width: 1, depthBias: 9.6e4 });
    for (const pts of c.cracks) { const k = Q ? smooth(qc(pts[0][0], pts[0][2]) * 1.4) : 1; if (k > 0.01) polyline(pts, { stroke: '#ff8a3a', width: 1.6, alpha: 0.8 * ga, glow: 0.8 * ga, glowColor: '#ff6a1a', depthBias: 7.5e4, progress: k < 1 ? k : undefined }); }
  }
  for (const b of c.B) {
    const dist = Math.hypot(b.x - cp.x, b.z - cp.z, (b.h / 2) - cp.y);
    const lk = Q && (b.rx || b.rz) ? smooth(qc(b.x, b.z)) : 1; const f = xform([b.x, 0, b.z], b.ry || 0, (b.rx || 0) * lk, (b.rz || 0) * lk);
    if (Q && b.wall && qc(b.x, b.z) < 0.5) continue;
    box(f, [b.w, b.h, b.d], dist < 260 && !lite ? ST.bld : ST.bldFar, { base: true, skipBottom: true, windows: b.windows && dist < 260 && !lite ? { floor: 3.2, bay: 4 } : null });
    if (b.broken) for (const k of b.broken) box(xform([b.x + k.ox, b.h, b.z + k.oz], b.ry || 0, (b.rx || 0) * lk + (k.rx || 0), (b.rz || 0) * lk + (k.rz || 0)), [k.w, k.h, k.d], ST.bldFar, { base: true, skipBottom: true });
  }
  for (const s of c.slabs) { const dist = Math.hypot(s.x - cp.x, s.z - cp.z, s.y - cp.y); if (dist > (lite ? 160 : 420)) continue; if (Q && after(s.x, s.z) < 0.5) continue;
    let st = ST.slab; if (xr) { const q = xr.k * (1 - smooth((Math.hypot(s.x - xr.x, s.z - xr.z) - xr.r * 0.6) / (xr.r * 0.4))); if (q > 0.01) st = { ...ST.slab, fillAlpha: 1 - 0.85 * q, alpha: 0.75 * (1 - 0.5 * q) }; }
    box(xform([s.x, s.y, s.z], s.ry, s.rx, s.rz), [s.w, 0.25, s.d], st); }
  if (pa > 0.01) {
    for (const p of c.cloud) { const dist = Math.hypot(p.cx - cp.x, p.cz - cp.z, cp.y); const step = dist > 250 ? 3 : dist > 120 ? 2 : 1;
      let arr = p.arr; if (step > 1) { const n = Math.floor(arr.length / 3 / step); const a2 = new Float32Array(n * 3); for (let i = 0; i < n; i++) { a2[i * 3] = arr[i * step * 3]; a2[i * 3 + 1] = arr[i * step * 3 + 1]; a2[i * 3 + 2] = arr[i * step * 3 + 2]; } arr = a2; }
      const near = xr ? xr.k * (1 - smooth((Math.hypot(p.cx - xr.x, p.cz - xr.z) - p.r - xr.r * 0.5) / xr.r)) : 0;
      const ak = after(p.cx, p.cz); const dens = dist > 150 && arr.length > 6000 ? 0.55 : 1; if (ak > 0.01) points(arr, { color: '#86c4e6', alpha: 0.7 * pa * (1 - 0.6 * near) * ak * dens, size: 1.7, sizeByDepth: true, minSize: 1.1 }); }
    if (!Q || t > 6.5) segments(c.rebarF, { stroke: '#d9925a', alpha: 0.65 * pa * (Q ? smooth((t - 6.5) / 0.5) : 1), width: 1 });
  }
  if (!lite) for (const k of c.cars) { const dist = Math.hypot(k.x - cp.x, k.z - cp.z, cp.y); if (dist > 300) continue; const f = xform([k.x, 0, k.z], k.ry); box(f, [4.2, 0.75 * k.crush, 1.8], ST.car, { base: true, skipBottom: true }); box(xform([k.x, 0.75 * k.crush, k.z], k.ry), [2.2, 0.6 * k.crush, 1.6], ST.car, { base: true, skipBottom: true }); }
  for (const [x, y, z, s] of c.trees) { const dist = Math.hypot(x - cp.x, z - cp.z, y - cp.y); if (dist > 500) continue; polyline([[x, y, z], [x, y + 3 * s, z]], { stroke: '#3b8fbf', alpha: 0.6, width: 1 }); poly(ring([x, y + 4 * s, z], 2 * s, [0, 1, 0], 14), { fill: 'rgba(4,14,22,0.9)', stroke: '#3b8fbf', alpha: 0.7, width: 1 }); }
  if (pa > 0.01) drawSmoke(t, opts, pa, Q ? after : null);
}

// 地震：完整楼体下沉坍塌、碎块下落、底部扬尘
function drawQuake(c, Q, t) {
  const cp = cam.position;
  for (const g of c.ghosts) {
    const { c: k, tau } = Q(g.x, g.z); if (k >= 1 && tau > 3.2) continue;
    if (k < 0.97) { const hv = lerp(g.h, g.low, Math.pow(k, 1.6)); if (hv > 0.3) { const dist = Math.hypot(g.x - cp.x, g.z - cp.z, g.h / 2 - cp.y); box(xform([g.x, 0, g.z], 0, 0.04 * k * Math.sin(g.x), 0.05 * k * Math.cos(g.z)), [g.w, hv, g.d], { ...(dist < 260 ? ST.bld : ST.bldFar), alpha: 0.95 * (1 - smooth((k - 0.75) / 0.22)) }, { base: true, skipBottom: true, windows: dist < 200 ? { floor: 3.2, bay: 4 } : null }); } }
    if (tau > 0 && tau < 3.2) { // 碎块：上部先落，落地后淡出
      const D = g.deb, n = D.length / 4, arr = []; const sp = 1 + 0.35 * tau;
      for (let i = 0; i < n; i++) { const ly = D[i * 4 + 1], e = D[i * 4 + 3]; const t0 = (1 - (ly - g.low) / Math.max(1, g.h - g.low)) * 0.55 * k; const tt = Math.max(0, tau - t0);
        const yl = 0.3 + e * 2.5; const y = Math.max(yl, ly - 0.5 * 16 * tt * tt); if (tt > 0 && y <= yl && tt > 1.6 + e) continue;
        arr.push(g.x + D[i * 4] * sp, y, g.z + D[i * 4 + 2] * sp); }
      if (arr.length) points(new Float32Array(arr), { color: '#a9d6f0', alpha: 0.8, size: 2.2, sizeByDepth: true, minSize: 1.3, glow: 0.18 });
      const dn = 90, dust = new Float32Array(dn * 3); const rr = Math.max(g.w, g.d) * 0.55; // 扬尘环
      for (let i = 0; i < dn; i++) { const a = i / dn * 6.283 + g.x; const q = rr * (1 + 1.6 * tau) * (0.85 + 0.3 * Math.sin(i * 7.1)); dust[i * 3] = g.x + Math.cos(a) * q; dust[i * 3 + 1] = 0.4 + tau * (1.5 + Math.sin(i * 3.3)); dust[i * 3 + 2] = g.z + Math.sin(a) * q; }
      points(dust, { color: '#c3d3df', alpha: 0.45 * (1 - tau / 3.2), size: 2.6, sizeByDepth: true, minSize: 1.4 });
    }
  }
}

// 烟柱：上升并被风吹斜的粒子＋底部火光；瓦砾上零星闪烁的火点
const SMOKE = [[-84, -60, 1.1], [64, 112, 0.9], [136, -100, 1.3], [-150, 90, 0.8], [30, -130, 0.9], [-120, -150, 0.7], [160, 40, 0.8]];
function drawSmoke(t, opts, pa = 1, aft = null) {
  const R = mulberry32(9);
  for (const [sx, sz, s] of SMOKE) {
    const qa = aft ? aft(sx, sz) : 1; if (qa < 0.02) { R(); continue; } const pa0 = pa; pa = pa0 * qa;
    const n = 900, arr = new Float32Array(n * 3);
    for (let k = 0; k < n; k++) { const life = 16 + R() * 10, ph = R(); const age = ((t + ph * life) % life); const u = age / life;
      const sw = 2.5 + u * 26 * s; const ang = R() * 6.283, rr = Math.sqrt(R()) * sw;
      arr[k * 3] = sx + Math.cos(ang) * rr + age * 1.8 * s; arr[k * 3 + 1] = 1.5 + age * (2.6 + R() * 1.2) * s; arr[k * 3 + 2] = sz + Math.sin(ang) * rr + age * 0.5; }
    points(arr, { color: '#b8cad8', alpha: 0.5 * pa, size: 2.8, sizeByDepth: true, minSize: 1.6 });
    for (let k = 0; k < 9; k++) { const hh = ((t * 3.2 * s + k * 10) % 90); const r = (3 + hh * 0.32) * s; const fa = (1 - hh / 90) * smooth(hh / 8);
      poly(ring([sx + hh * 0.62, 1.5 + hh, sz + hh * 0.18], r, [0, 1, 0], 28), { stroke: '#b4c8d8', width: 1.6, alpha: 0.5 * fa * pa, glow: 0.25 * fa * pa, depthBias: 0 }); }
    const fl = 0.6 + 0.4 * Math.sin(t * 9 + sx); const fa = [];
    for (let k = 0; k < 24; k++) { const a = R() * 6.283, r = R() * 4 * s; fa.push(sx + Math.cos(a) * r, 0.5 + R() * 2.5 * (0.6 + 0.4 * Math.sin(t * 7 + k)), sz + Math.sin(a) * r); }
    points(new Float32Array(fa), { color: PAL.amber, alpha: 0.85 * fl * pa, size: 3, glow: 1.4 * fl * pa, glowColor: PAL.orange, sizeByDepth: true, minSize: 1.5 });
    pa = pa0;
  }
  for (const [x, y, z, s, ph] of buildCity().fires) { const fl = (0.55 + 0.45 * Math.sin(t * (6 + ph * 5) + ph * 20)) * (aft ? aft(x, z) : 1); if (fl < 0.02) continue;
    points(new Float32Array([x, y + 0.3, z, x + 0.8 * s, y + 0.1, z + 0.5 * s, x - 0.6 * s, y + 0.2, z - 0.4 * s]), { color: '#ffb347', alpha: 0.9 * fl * pa, size: 2.6, glow: 1.6 * fl * pa, glowColor: '#ff6a1a', sizeByDepth: true, minSize: 1.4 }); }
}

// 救援车辆：车厢、驾驶室与挡风玻璃、车轮、色带、消防车云梯、闪烁警灯排（地面映出红蓝光晕）、救护车红十字
const VEH = [[326, 2.2, -Math.PI / 2, 'fire'], [338, -2.6, -Math.PI / 2 + 0.08, 'fire'], [352, 2.0, -Math.PI / 2 - 0.05, 'amb']];
export function drawVehicles(t, on = 1) {
  VEH.forEach(([x, z, ry, kind], i) => {
    const y = terrainHeight(x, z); const fire = kind === 'fire'; const len = fire ? 8.6 : 6.4; const f = xform([x, y, z], ry);
    const col = fire ? '#ff6a4a' : PAL.white; const st = { fill: 'rgba(5,14,24,0.97)', stroke: col, width: 1.3, alpha: 0.95 };
    const bodyL = len * 0.68, cabL = len * 0.27, hb = fire ? 2.55 : 2.45;
    box((p) => f([p[0], p[1] + 0.55, p[2] - len / 2 + bodyL / 2]), [2.5, hb, bodyL], { ...st, innerAlpha: 0.35, innerColor: col }, { base: true, windows: fire ? { floor: 0.42, bay: bodyL / 3 } : null });
    const cf = (p) => f([p[0], p[1] + 0.55, p[2] + len / 2 - cabL / 2]);
    box(cf, [2.5, 2.1, cabL], st, { base: true });
    poly([[-1.1, 1.05, cabL / 2 + 0.01], [1.1, 1.05, cabL / 2 + 0.01], [1.1, 1.95, cabL / 2 + 0.01], [-1.1, 1.95, cabL / 2 + 0.01]].map(cf), { fill: 'rgba(60,140,200,0.35)', stroke: '#9fe0ff', width: 1.1, alpha: 0.9, depthBias: -0.01 });
    for (const sd of [-1, 1]) poly([[sd * 1.26, 1.1, -cabL * 0.3], [sd * 1.26, 1.1, cabL * 0.35], [sd * 1.26, 1.9, cabL * 0.35], [sd * 1.26, 1.9, -cabL * 0.3]].map(cf), { fill: 'rgba(60,140,200,0.3)', stroke: '#9fe0ff', width: 1, alpha: 0.85, depthBias: -0.01 });
    for (const za of (fire ? [-len * 0.36, -len * 0.21, len * 0.3] : [-len * 0.3, len * 0.3])) for (const sd of [-1, 1]) {
      poly(ring([sd * 1.27, 0.5, za], 0.5, [1, 0, 0], 18).map(f), { fill: '#05090e', stroke: PAL.white, width: 1.2, alpha: 0.9, depthBias: -0.02 });
      poly(ring([sd * 1.28, 0.5, za], 0.2, [1, 0, 0], 10).map(f), { stroke: '#8fb7d2', width: 1, alpha: 0.8, depthBias: -0.03 });
    }
    for (const sd of [-1, 1]) polyline([[sd * 1.26, 1.25, -len / 2 + 0.1], [sd * 1.26, 1.25, len / 2 - 0.1]].map(f), { stroke: fire ? '#ffffff' : '#ff4a3a', width: 2.4, alpha: 0.9, depthBias: -0.015 });
    if (fire) { const yl = 0.55 + hb + 0.28;
      for (const sx of [-0.45, 0.45]) { polyline([[sx, yl, -len / 2 + 0.3], [sx, yl, len / 2 - 0.4]].map(f), { stroke: '#d8e8f2', width: 1.5, alpha: 0.95 }); for (const zz of [-len / 2 + 0.8, len * 0.1]) line(f([sx, 0.55 + hb, zz]), f([sx, yl, zz]), { stroke: '#d8e8f2', width: 1, alpha: 0.8 }); }
      for (let zz = -len / 2 + 0.5; zz < len / 2 - 0.4; zz += 0.45) polyline([[-0.45, yl, zz], [0.45, yl, zz]].map(f), { stroke: '#d8e8f2', width: 1, alpha: 0.7 }); }
    else { const rz = -len / 2 - 0.01; polyline([[0, 0.65, rz], [0, 2.95, rz]].map(f), { stroke: PAL.white, width: 1, alpha: 0.8 }); polyline([[-0.32, 2.15, rz], [0.32, 2.15, rz]].map(f), { stroke: '#ff3b30', width: 4, alpha: 0.95, cap: 'butt' }); polyline([[0, 1.83, rz], [0, 2.47, rz]].map(f), { stroke: '#ff3b30', width: 4, alpha: 0.95, cap: 'butt' }); }
    const k = (t * 2.2 + i * 0.37) % 1; const red = on * (k < 0.25 ? 1 : 0.12), blue = on * (k > 0.5 && k < 0.75 ? 1 : 0.12);
    const ly = 0.55 + 2.1 + 0.1, lz = len / 2 - cabL / 2;
    box((p) => f([p[0], p[1] + ly, p[2] + lz]), [1.7, 0.16, 0.36], { fill: 'rgba(10,20,30,0.95)', stroke: '#cfe6f5', width: 1, alpha: 0.85 });
    points(new Float32Array([...f([0.35, ly + 0.1, lz]), ...f([0.65, ly + 0.1, lz])]), { color: '#ff3b30', alpha: red, size: 4, glow: 2.5 * red, glowColor: '#ff3b30', fade: false });
    points(new Float32Array([...f([-0.35, ly + 0.1, lz]), ...f([-0.65, ly + 0.1, lz])]), { color: '#3a7bff', alpha: blue, size: 4, glow: 2.5 * blue, glowColor: '#3a7bff', fade: false });
    points(new Float32Array([...f([1.05, 1.0, -len / 2 - 0.02]), ...f([-1.05, 1.0, -len / 2 - 0.02])]), { color: '#ff3b30', alpha: 0.9, size: 3, glow: 0.6, glowColor: '#ff3b30', fade: false });
    const gp = project(f([0, 0.1, lz])); if (gp) { const rp = pxPerMeter(gp.d) * 3.2; custom(gp.d, (L, G) => { for (const [c, a] of [['255,59,48', red], ['58,123,255', blue]]) { if (a < 0.2) continue; const g = G.createRadialGradient(gp.x / 2, gp.y / 2, 0, gp.x / 2, gp.y / 2, rp / 2); g.addColorStop(0, `rgba(${c},${0.25 * a})`); g.addColorStop(1, `rgba(${c},0)`); G.fillStyle = g; G.fillRect(gp.x / 2 - rp / 2, gp.y / 2 - rp / 2, rp, rp); } }); }
  });
}
