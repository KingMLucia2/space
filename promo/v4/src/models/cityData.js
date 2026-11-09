// 城区布局数据（与第三版相同）：街区、楼体、倒塌楼（ghosts）、瓦砾堆、楼板、钢筋、汽车、树、裂缝、火点、地形高度。第四版用它搭白模。
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

export const SMOKE = [[-84, -60, 1.1], [64, 112, 0.9], [136, -100, 1.3], [-150, 90, 0.8], [30, -130, 0.9], [-120, -150, 0.7], [160, 40, 0.8]];
export const VEH = [[326, 2.2, -Math.PI / 2, 'fire'], [338, -2.6, -Math.PI / 2 + 0.08, 'fire'], [352, 2.0, -Math.PI / 2 - 0.05, 'amb']];
