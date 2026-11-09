// 场景细节（第四版细化：用户反馈“场景有些空”）。建城时一次生成，几何体按 60 米分块、按材质合并（视锥外的块自动跳过）。
// · 城区：街区抬高的人行道、路灯、行道树、红绿灯、斑马线与车道虚线、汽车（车身/车窗/车顶/车轮）、街面碎屑、
//         楼顶设备（女儿墙、楼梯间、空调外机、水箱、天线）、楼层线脚与阳台栏板、竖向线条；
// · 中央广场：石材铺装贴图（降落点有地面纹样）、路沿、灯柱、长椅、花箱、垃圾桶、护柱、公交站亭、倒伏的树和灯杆、碎块与纸片；
// · 城外：公路护栏、电线杆与电线、路牌、山林与岩石、塌方处的警戒锥桶与封路牌；基站营地；航空基地地面设施（见 buildOutskirts）。
import { THREE, mkCanvas } from '../engine.js';
import { CITY, terrainHeight } from './cityData.js';
import { mulberry32, clamp, lerp, makeNoise2D } from '../util.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const lin = (hex) => { const c = new THREE.Color(hex); return [c.r, c.g, c.b]; };
const prep = (g) => { const c = g.index ? g.toNonIndexed() : g; c.deleteAttribute('uv'); return c; };
export const G = { box: prep(new THREE.BoxGeometry(1, 1, 1)), cyl6: prep(new THREE.CylinderGeometry(1, 1, 1, 6)), cyl8: prep(new THREE.CylinderGeometry(1, 1, 1, 8)), cyl12: prep(new THREE.CylinderGeometry(1, 1, 1, 12)),
  cone7: prep(new THREE.ConeGeometry(1, 1, 7)), ico: prep(new THREE.IcosahedronGeometry(1, 0)), tet: prep(new THREE.TetrahedronGeometry(1, 0)), plane: prep(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2)) };
const _Q = new THREE.Quaternion(), _E = new THREE.Euler(), _P = new THREE.Vector3(), _S = new THREE.Vector3();
export function mat4(pos, rot = [0, 0, 0], scl = [1, 1, 1]) { _E.set(rot[0], rot[1], rot[2], 'YXZ'); _Q.setFromEuler(_E); return new THREE.Matrix4().compose(_P.set(pos[0], pos[1], pos[2]), _Q, _S.set(scl[0], scl[1], scl[2])); }
// 一个零件：单位几何体 → 缩放/旋转/平移 → （可选）再乘物体矩阵；顶点色写入颜色
export function part(g, pos, rot, scl, col) { const c = g.clone(); c.applyMatrix4(mat4(pos, rot || [0, 0, 0], scl)); const n = c.attributes.position.count, a = new Float32Array(n * 3); for (let i = 0; i < n; i++) { a[i * 3] = col[0]; a[i * 3 + 1] = col[1]; a[i * 3 + 2] = col[2]; } c.setAttribute('color', new THREE.BufferAttribute(a, 3)); return c; }
// 把一组 [材质键, 几何体] 按物体矩阵摆到世界里并送进分块
function place(out, list, M0, x, z, cast = true) { for (const [k, g] of list) { g.applyMatrix4(M0); out(k, x, z, g, cast); } }

const C_ = {
  slab: lin('#e9e5de'), curb: lin('#f0ede7'), pole: lin('#8c8e92'), poleD: lin('#5f6268'), head: lin('#45484e'), sig: lin('#2c2f34'), paint: lin('#f8f6f2'), paintY: lin('#efc46b'),
  trunk: lin('#9a8f80'), trees: ['#d2dac6', '#cad3bf', '#d9dfcf', '#c3cdb7', '#dde2d4'].map(lin), conif: ['#c2ccb8', '#b9c4af', '#cbd3c2'].map(lin),
  roofC: lin('#e3dfd7'), ac: lin('#cfcdc8'), tank: lin('#c7c4bd'), band: lin('#dedad2'), rail: lin('#d3d0c9'), wheel: lin('#2a2b2e'), rim: lin('#a9abaf'),
  cars: ['#f3f2ef', '#d0d2d5', '#9ea2a9', '#b4543f', '#55708e', '#34373d', '#e8e2d4'].map(lin), bench: lin('#b9b2a6'), planter: lin('#d6d1c8'), shrub: lin('#c9d3bf'), bin: lin('#6f7277'),
  orange: lin('#ec4e26'), white: lin('#f4f2ee'), rock: lin('#cfc9be'), guard: lin('#c4c7cb'), wood: lin('#a99c8a'), tent: lin('#f3f1ec'), solar: lin('#2c3542'), cont: lin('#e9e7e2'), cont2: lin('#d9d6cf'),
};
const pick = (R, arr) => arr[Math.floor(R() * arr.length)];

// —— 零件库（局部坐标，原点在落地点） ——
function lamp(h = 7.4) { return [['metal', part(G.box, [0, 0.22, 0], 0, [0.34, 0.44, 0.34], C_.poleD)], ['metal', part(G.cyl8, [0, h / 2, 0], 0, [0.075, h, 0.075], C_.pole)],
  ['metal', part(G.box, [0, h - 0.06, 0.78], [0.1, 0, 0], [0.07, 0.07, 1.56], C_.pole)], ['metal', part(G.box, [0, h - 0.14, 1.55], 0, [0.3, 0.1, 0.62], C_.head)]]; }
function lampPlaza(h = 5.2) { return [['metal', part(G.cyl8, [0, 0.35, 0], 0, [0.16, 0.7, 0.16], C_.poleD)], ['metal', part(G.cyl8, [0, h / 2, 0], 0, [0.06, h, 0.06], C_.pole)],
  ['metal', part(G.box, [0, h - 0.1, 0], 0, [1.5, 0.06, 0.06], C_.pole)], ['metal', part(G.cyl8, [0.72, h - 0.28, 0], 0, [0.17, 0.36, 0.17], C_.head)], ['metal', part(G.cyl8, [-0.72, h - 0.28, 0], 0, [0.17, 0.36, 0.17], C_.head)]]; }
function tree(R, s = 1) { const col = pick(R, C_.trees); const h = (3.0 + R() * 1.3) * s; return [['matte', part(G.cyl6, [0, h * 0.42, 0], 0, [0.12 * s, h * 0.84, 0.12 * s], C_.trunk)],
  ['matte', part(G.ico, [0, h, 0], [R() * 3, R() * 3, 0], [1.75 * s, 1.45 * s, 1.75 * s], col)], ['matte', part(G.ico, [0.62 * s, h + 0.6 * s, 0.3 * s], [R() * 3, R() * 3, 0], [1.1 * s, 0.95 * s, 1.1 * s], col)],
  ['matte', part(G.ico, [-0.55 * s, h + 0.35 * s, -0.45 * s], [R() * 3, R() * 3, 0], [1.0 * s, 0.85 * s, 1.0 * s], col)]]; }
function conifer(R, s = 1) { const col = pick(R, C_.conif); const L = [['matte', part(G.cyl6, [0, 0.9 * s, 0], 0, [0.16 * s, 1.8 * s, 0.16 * s], C_.trunk)]];
  for (let k = 0; k < 3; k++) L.push(['matte', part(G.cone7, [0, (1.9 + k * 1.55) * s, 0], [0, R() * 3, 0], [(1.9 - k * 0.45) * s, 2.6 * s, (1.9 - k * 0.45) * s], col)]); return L; }
function signal() { return [['metal', part(G.cyl8, [0, 2.9, 0], 0, [0.09, 5.8, 0.09], C_.poleD)], ['metal', part(G.box, [2.0, 5.62, 0], 0, [4.0, 0.1, 0.1], C_.poleD)],
  ['metal', part(G.box, [3.75, 5.12, 0], 0, [0.32, 0.95, 0.3], C_.sig)], ['metal', part(G.box, [0.0, 3.1, 0.22], 0, [0.28, 0.75, 0.24], C_.sig)]]; }
export function car(R, crush = 1, col = null) { col = col || pick(R, C_.cars); const L = 4.3, W = 1.8, H = crush;
  const out = [['gloss', part(G.box, [0, 0.3 + 0.3 * H, 0], 0, [W, 0.6 * H, L], col)], ['glass', part(G.box, [0, 0.3 + 0.6 * H + 0.17 * H, -0.12], 0, [W * 0.9, 0.34 * H, L * 0.5], C_.sig)],
    ['gloss', part(G.box, [0, 0.3 + 0.6 * H + 0.38 * H, -0.18], 0, [W * 0.88, 0.08 * H, L * 0.44], col)], ['metal', part(G.box, [0, 0.33, L / 2], 0, [W * 0.96, 0.16, 0.08], C_.rim)], ['metal', part(G.box, [0, 0.33, -L / 2], 0, [W * 0.96, 0.16, 0.08], C_.rim)]];
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) out.push(['matte', part(G.cyl8, [sx * (W / 2 - 0.1), 0.32, sz * 1.32], [0, 0, Math.PI / 2], [0.32, 0.24, 0.32], C_.wheel)]); return out; }
function bench() { return [['matte', part(G.box, [0, 0.45, 0], 0, [1.8, 0.07, 0.48], C_.wood)], ['matte', part(G.box, [0, 0.78, -0.24], [-0.15, 0, 0], [1.8, 0.4, 0.05], C_.wood)],
  ['metal', part(G.box, [0.75, 0.22, 0], 0, [0.07, 0.45, 0.46], C_.poleD)], ['metal', part(G.box, [-0.75, 0.22, 0], 0, [0.07, 0.45, 0.46], C_.poleD)]]; }
function planter(R) { return [['matte', part(G.box, [0, 0.28, 0], 0, [1.8, 0.56, 1.8], C_.planter)], ['matte', part(G.ico, [0, 0.95, 0], [R() * 3, R() * 3, 0], [0.85, 0.65, 0.85], C_.shrub)], ['matte', part(G.ico, [0.35, 1.25, 0.2], [R() * 3, 0, 0], [0.5, 0.45, 0.5], C_.shrub)]]; }
function bin() { return [['metal', part(G.cyl12, [0, 0.45, 0], 0, [0.28, 0.9, 0.28], C_.bin)], ['metal', part(G.cyl12, [0, 0.93, 0], 0, [0.31, 0.06, 0.31], C_.poleD)]]; }
function bollard() { return [['metal', part(G.cyl8, [0, 0.42, 0], 0, [0.11, 0.84, 0.11], C_.pole)], ['matte', part(G.cyl8, [0, 0.7, 0], 0, [0.115, 0.08, 0.115], C_.white)]]; }
function shelter() { return [['metal', part(G.box, [-1.7, 1.25, -0.6], 0, [0.08, 2.5, 0.08], C_.poleD)], ['metal', part(G.box, [1.7, 1.25, -0.6], 0, [0.08, 2.5, 0.08], C_.poleD)], ['metal', part(G.box, [-1.7, 1.25, 0.6], 0, [0.08, 2.5, 0.08], C_.poleD)], ['metal', part(G.box, [1.7, 1.25, 0.6], 0, [0.08, 2.5, 0.08], C_.poleD)],
  ['gloss', part(G.box, [0, 2.55, 0], 0, [3.8, 0.12, 1.7], C_.white)], ['glass', part(G.box, [0, 1.35, -0.62], 0, [3.4, 1.9, 0.04], C_.sig)], ['matte', part(G.box, [0, 0.48, -0.35], 0, [2.8, 0.06, 0.4], C_.wood)], ['gloss', part(G.box, [1.72, 1.4, 0], 0, [0.1, 1.6, 1.0], C_.orange)]]; }
function rock(R, s) { return [['matte', part(G.ico, [0, s * 0.35, 0], [R() * 6, R() * 6, R() * 6], [s * (0.8 + R() * 0.5), s * (0.5 + R() * 0.3), s * (0.8 + R() * 0.5)], C_.rock.map((v) => v * (0.92 + R() * 0.1)))]]; }
function cone() { return [['gloss', part(G.cone7, [0, 0.36, 0], 0, [0.2, 0.72, 0.2], C_.orange)], ['matte', part(G.cyl8, [0, 0.4, 0], 0, [0.13, 0.12, 0.13], C_.white)], ['matte', part(G.box, [0, 0.02, 0], 0, [0.46, 0.04, 0.46], C_.sig)]]; }

// —— 中央广场铺装贴图（34×34 米，约 60 像素/米） ——
function plazaTexture() {
  const N = 2048, c = mkCanvas(N, N), g = c.getContext('2d'); const S = N / 34, X = (x) => (x + 17) * S; const R = mulberry32(31337); const Nz = makeNoise2D(5);
  g.fillStyle = '#ece8e1'; g.fillRect(0, 0, N, N);
  const T = 1.2 * S; for (let y = 0; y < N; y += T) for (let x = 0; x < N; x += T) { const v = (R() - 0.5) * 10; g.fillStyle = `rgb(${236 + v},${232 + v},${225 + v})`; g.fillRect(x + 1, y + 1, T - 2, T - 2); }
  g.strokeStyle = '#d4cfc6'; g.lineWidth = 2; for (let k = 0; k <= 34 / 1.2; k++) { g.beginPath(); g.moveTo(k * T, 0); g.lineTo(k * T, N); g.moveTo(0, k * T); g.lineTo(N, k * T); g.stroke(); }
  // 外圈深色石材带
  g.fillStyle = '#ddd8cf'; for (const [x, y, w, h] of [[0, 0, N, 2.4 * S], [0, N - 2.4 * S, N, 2.4 * S], [0, 0, 2.4 * S, N], [N - 2.4 * S, 0, 2.4 * S, N]]) g.fillRect(x, y, w, h);
  g.strokeStyle = '#cbc5bb'; g.lineWidth = 1.5; for (let k = 0; k <= 34 / 0.6; k++) { const p = k * 0.6 * S; for (const [a, b] of [[0, 2.4 * S], [N - 2.4 * S, N]]) { g.beginPath(); g.moveTo(p, a); g.lineTo(p, b); g.moveTo(a, p); g.lineTo(b, p); g.stroke(); } }
  // 降落点地面纹样：同心圆与八角星（低对比）
  const cx = X(0), cy = X(6.5); g.strokeStyle = '#d6d0c6'; for (const [r, w] of [[4.6, 0.35], [3.9, 0.08], [2.2, 0.12]]) { g.lineWidth = w * S; g.beginPath(); g.arc(cx, cy, r * S, 0, 7); g.stroke(); }
  g.fillStyle = 'rgba(214,208,198,0.85)'; g.beginPath(); for (let k = 0; k < 16; k++) { const a = k * Math.PI / 8, r = (k % 2 ? 0.9 : 3.6) * S; g.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r); } g.closePath(); g.fill();
  // 北侧瓦砾堆周围的灰尘（越靠近越浓）与零星污渍
  const img = g.getImageData(0, 0, N, N), d = img.data;
  for (let y = 0; y < N; y += 1) for (let x = 0; x < N; x += 1) { const wx = x / S - 17, wz = y / S - 17; const dp = Math.hypot((wx - 0.5) / 1.1, wz + 9.5); const dust = clamp(1 - (dp - 6) / 10) * (0.55 + 0.45 * Nz.fbm(wx * 0.25, wz * 0.25, 3)) + 0.12 * clamp(Nz.fbm(wx * 0.12 + 9, wz * 0.12, 3) - 0.1);
    if (dust <= 0.01) continue; const i = (y * N + x) * 4, k = clamp(dust) * 0.42; d[i] = d[i] * (1 - k) + 168 * k; d[i + 1] = d[i + 1] * (1 - k) + 160 * k; d[i + 2] = d[i + 2] * (1 - k) + 149 * k; }
  g.putImageData(img, 0, 0);
  // 裂缝
  g.strokeStyle = 'rgba(110,102,92,0.75)'; for (let k = 0; k < 7; k++) { let x = X(-15 + R() * 30), y = X(-15 + R() * 30), a = R() * 6.28; if (Math.abs(x - cx) < 6 * S && Math.abs(y - cy) < 8 * S) continue; g.lineWidth = 2 + R() * 2; g.beginPath(); g.moveTo(x, y); for (let i = 0; i < 14; i++) { a += (R() - 0.5) * 1.1; x += Math.cos(a) * S * (0.4 + R() * 0.7); y += Math.sin(a) * S * (0.4 + R() * 0.7); g.lineTo(x, y); } g.stroke(); }
  // 细碎石屑
  for (let k = 0; k < 9000; k++) { const wx = -17 + R() * 34, wz = -17 + R() * 34; const near = clamp(1 - (Math.hypot(wx - 0.5, wz + 9.5) - 7) / 12); if (R() > 0.25 + near * 0.75) continue; const s = (0.5 + R() * 2.5) * (1 + near); const v = 130 + R() * 70; g.fillStyle = `rgba(${v},${v - 6},${v - 12},${0.6 + R() * 0.4})`; g.fillRect(X(wx), X(wz), s, s); }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; return t;
}

// —— 城区细节 ——
// out(材质键, x, z, 几何体, 投影)；root 用来挂不进分块的网格（广场铺装）
export function buildCityDetail(C, out, root, mats) {
  const R = mulberry32(8080); const BL = CITY.block;
  const inPile = (x, z, pad = 0) => C.piles.some((p) => Math.hypot((x - p.cx) / p.sx, (z - p.cz) / p.sz) < p.r * 0.92 + pad);
  const clearZone = (x, z) => x > -5 && x < 7 && z > -1.5 && z < 13; // 降落点、六足机器人路线和近景机位附近不放东西
  // 街区抬高 15 厘米（人行道与地块），中央广场除外
  for (let i = -4; i <= 4; i++) for (let j = -4; j <= 4; j++) { if (!i && !j) continue; const cx = i * BL, cz = j * BL; out('matte', cx, cz, part(G.box, [cx, 0.085, cz], 0, [34, 0.15, 34], C_.slab), true);
    for (const [px, pz, sx, sz] of [[0, 16.85, 34, 0.3], [0, -16.85, 34, 0.3], [16.85, 0, 0.3, 33.4], [-16.85, 0, 0.3, 33.4]]) out('matte', cx, cz, part(G.box, [cx + px, 0.1, cz + pz], 0, [sx, 0.18, sz], C_.curb), false);
    // 每条边：路灯（臂伸向马路）与行道树交替
    for (let s = 0; s < 4; s++) { const ang = s * Math.PI / 2; const nx = Math.sin(ang), nz = Math.cos(ang); // 外法线
      for (const u of [-15.2, -9.5, -3.8, 1.9, 7.6, 13.3]) { const k = Math.round((u + 15.2) / 5.7); const x = cx + nx * 15.9 + nz * u, z = cz + nz * 15.9 - nx * u; if (inPile(x, z, 1.5)) { if (k % 2 === 0 && R() < 0.4) { const f = lamp(); place(out, f, mat4([x, 0.16, z], [0, ang + (R() - 0.5) * 2, 1.45]), x, z); } continue; }
        if (k % 2 === 0) { const tilt = R() < 0.18 ? (R() - 0.5) * 0.7 : (R() - 0.5) * 0.04; place(out, lamp(), mat4([x, 0.16, z], [tilt, ang, (R() - 0.5) * 0.05]), x, z); }
        else if (R() < 0.85) place(out, tree(R, 0.85 + R() * 0.3), mat4([x, 0.16, z], [0, R() * 6, 0]), x, z); } } }
  // 红绿灯：每个路口两根（对角），斑马线四条，车道中线虚线
  for (let k = -4; k <= 3; k++) for (let l = -4; l <= 3; l++) { const ix = k * BL + BL / 2, iz = l * BL + BL / 2;
    for (const [sx, sz, ry] of [[1, 1, Math.PI / 2], [-1, -1, -Math.PI / 2]]) { const x = ix + sx * 7.3, z = iz + sz * 7.3; if (inPile(x, z, 1)) continue; place(out, signal(), mat4([x, 0.16, z], [0, ry, R() < 0.15 ? 0.2 : 0]), x, z); } // 臂伸到路口上方
    for (const [ax, az] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) for (let q = -5; q <= 5; q++) { const along = 8.4, x = ix + ax * along + (az ? q * 1.0 : 0), z = iz + az * along + (ax ? q * 1.0 : 0); out('decal', x, z, part(G.plane, [x, 0.022, z], 0, ax ? [3.0, 1, 0.5] : [0.5, 1, 3.0], C_.paint), false); } }
  const RC = [-161, -115, -69, -23, 23, 69, 115, 161]; // 道路中线
  for (const c of RC) for (let u = -200; u < 200; u += 9) for (const [x, z, w, d] of [[u, c, 3.6, 0.16], [c, u, 0.16, 3.6]]) { const near = Math.min(...RC.map((q) => Math.abs((w > 1 ? x : z) - q))); if (near < 10) continue; out('decal', x, z, part(G.plane, [x, 0.021, z], 0, [w, 1, d], C_.paint), false); }
  // 汽车（替换原来的两块方盒）：少数翻倒或侧翻
  for (const k of C.cars) { const flip = R(); const rot = flip < 0.05 ? [0, k.ry, Math.PI] : flip < 0.1 ? [0, k.ry, Math.PI / 2] : [(R() - 0.5) * 0.04, k.ry, (R() - 0.5) * 0.04]; const y = flip < 0.05 ? 0.3 + 1.02 * k.crush : flip < 0.1 ? 0.9 : 0;
    place(out, car(R, k.crush), mat4([k.x, y, k.z], rot), k.x, k.z, true); }
  // 街面碎屑：瓦砾堆外沿撒到路面和人行道上
  for (const p of C.piles) { if (p.dense) continue; const n = Math.round(p.r * 22); for (let q = 0; q < n; q++) { const a = R() * 6.283, rr = p.r * (0.95 + Math.pow(R(), 1.6) * 0.75); const x = p.cx + Math.cos(a) * rr * p.sx, z = p.cz + Math.sin(a) * rr * p.sz; if (clearZone(x, z) || Math.abs(x) > 215 || Math.abs(z) > 215) continue;
    const s = 0.12 + Math.pow(R(), 2) * 0.5; const sh = 0.74 + R() * 0.18; out('rubble', x, z, part(R() < 0.4 ? G.box : R() < 0.5 ? G.ico : G.tet, [x, s * 0.25 + 0.16, z], [R() * 6, R() * 6, R() * 6], [s * (0.7 + R() * 0.8), s * (0.4 + R() * 0.4), s * (0.7 + R() * 0.8)], [sh, sh * 0.99, sh * 0.97]), false); } }
  // 楼体细节：女儿墙、楼梯间、空调外机、水箱、天线；部分楼加楼层线脚＋阳台栏板或竖向线条
  for (const b of C.B) { if (b.wall) continue; const lean = mat4([b.x, 0, b.z], [b.rx || 0, b.ry || 0, b.rz || 0]); const L = []; const hw = b.w / 2, hd = b.d / 2, top = b.h;
    if (b.windows && (!b.broken || !b.broken.length)) {
      L.push(['matte', part(G.box, [0, top + 0.45, hd - 0.12], 0, [b.w, 0.9, 0.24], C_.roofC)], ['matte', part(G.box, [0, top + 0.45, -hd + 0.12], 0, [b.w, 0.9, 0.24], C_.roofC)], ['matte', part(G.box, [hw - 0.12, top + 0.45, 0], 0, [0.24, 0.9, b.d], C_.roofC)], ['matte', part(G.box, [-hw + 0.12, top + 0.45, 0], 0, [0.24, 0.9, b.d], C_.roofC)]);
      const rx = () => (R() - 0.5) * (b.w - 4), rz = () => (R() - 0.5) * (b.d - 4);
      if (R() < 0.75) L.push(['matte', part(G.box, [rx(), top + 1.4, rz()], 0, [3.2, 2.8, 3.8], C_.roofC)]);
      for (let q = 0, n = 2 + Math.floor(R() * 4); q < n; q++) L.push(['matte', part(G.box, [rx(), top + 0.38, rz()], [0, Math.round(R()) * Math.PI / 2, 0], [1.2, 0.76, 0.85], C_.ac)]);
      if (R() < 0.4) { const x = rx(), z = rz(); L.push(['matte', part(G.box, [x, top + 0.3, z], 0, [1.7, 0.6, 1.7], C_.ac)], ['matte', part(G.cyl12, [x, top + 1.5, z], 0, [0.85, 1.8, 0.85], C_.tank)]); }
      if (R() < 0.3) { const x = rx(), z = rz(); L.push(['metal', part(G.cyl6, [x, top + 2.2, z], 0, [0.05, 4.4, 0.05], C_.pole)], ['metal', part(G.box, [x, top + 3.8, z], 0, [1.2, 0.05, 0.05], C_.pole)]); }
      const style = R(); if (top > 12 && style < 0.42) { const all = style < 0.2; for (let y = 3.2; y < top - 1.5; y += 3.2) { for (const sd of [-1, 1]) { L.push(['matte', part(G.box, [0, y - 0.05, sd * (hd + 0.32)], 0, [b.w + 0.5, 0.16, 0.64], C_.band)], ['matte', part(G.box, [0, y + 0.5, sd * (hd + 0.62)], 0, [b.w + 0.5, 0.9, 0.05], C_.rail)]);
          if (all) L.push(['matte', part(G.box, [sd * (hw + 0.2), y - 0.05, 0], 0, [0.4, 0.16, b.d], C_.band)]); } } }
      else if (top > 12 && style < 0.62) { for (let u = -hw + 1.8; u < hw - 0.5; u += 3.6) for (const sd of [-1, 1]) L.push(['matte', part(G.box, [u, top / 2, sd * (hd + 0.2)], 0, [0.28, top, 0.4], C_.band)]); }
    }
    if (L.length) place(out, L, lean, b.x, b.z, true); }
  // —— 中央广场 ——
  const pz = new THREE.Mesh(new THREE.PlaneGeometry(34, 34).rotateX(-Math.PI / 2), mats.plaza(plazaTexture())); pz.position.y = 0.013; pz.receiveShadow = true; root.add(pz);
  for (const [px, pz2, sx, sz] of [[0, 17.0, 34.6, 0.32], [0, -17.0, 34.6, 0.32], [17.0, 0, 0.32, 34.0], [-17.0, 0, 0.32, 34.0]]) out('matte', px, pz2, part(G.box, [px, 0.08, pz2], 0, [sx, 0.15, sz], C_.curb), true);
  const P = (list, x, z, ry = 0, rx = 0, rz = 0, y = 0.013) => place(out, list, mat4([x, y, z], [rx, ry, rz]), x, z);
  for (const [x, z] of [[-15.4, 15.4], [15.4, 15.4], [-15.4, -15.4], [15.4, -15.4], [-15.4, 4], [15.4, 4], [-8, 15.6], [8.5, 15.6]]) { if (inPile(x, z, 1)) continue; P(lampPlaza(), x, z, R() * 0.4); }
  P(lampPlaza(), -15.2, -2.5, 0.3, 0, 1.48, 0.1); // 倒在地上的灯杆
  for (const [x, z, ry] of [[-9.5, 13.6, 0], [9.6, 13.6, 0], [-13.8, 7.5, Math.PI / 2], [13.9, 8.2, -Math.PI / 2], [-13.6, -5.5, Math.PI / 2]]) P(bench(), x, z, ry);
  P(bench(), 12.2, -3.6, 1.1, 0, Math.PI / 2 + 0.15, 0.25); // 翻倒的长椅
  for (const [x, z] of [[-11.5, 10.2], [11.5, 10.2], [-11.5, 15.0], [11.6, 15.0], [-15.0, -10], [14.8, -11.5]]) { if (inPile(x, z, 1.2)) continue; P(planter(R), x, z, R() * 0.3, (R() - 0.5) * (R() < 0.3 ? 0.25 : 0), 0); }
  for (const [x, z] of [[-6.8, 15.8], [6.9, 15.8], [15.8, -1.6], [-15.9, 10.6]]) P(bin(), x, z);
  for (let x = -14.4; x <= 14.5; x += 1.6) { if (Math.abs(x) < 2.6) continue; P(bollard(), x, 16.45); }
  P(shelter(), 15.6, 12.2, Math.PI / 2); // 开口朝东侧马路
  P(tree(R, 1.25), -11.8, 2.6, 0.4, 0, 1.52, 0.9); // 倒伏的大树（树冠横在广场上）
  for (const [x, z] of [[-15.2, 12.5], [15.2, -7.5], [-9.5, -15.6], [9.8, -15.6]]) { if (inPile(x, z, 1.5)) continue; P(tree(R, 1.1), x, z, R() * 6); }
  // 广场上的碎块（越靠近北侧瓦砾堆越密）与纸片
  for (let q = 0; q < 1300; q++) { const x = -16.5 + R() * 33, z = -16.5 + R() * 33; const near = clamp(1 - (Math.hypot((x - 0.5) / 1.1, z + 9.5) - 8) / 12); if (R() > 0.12 + near * 0.88) continue; const big = R() < 0.08 * near; let s = big ? 0.4 + R() * 0.8 : 0.05 + Math.pow(R(), 2.2) * 0.3; if (clearZone(x, z)) s = Math.min(s, 0.07);
    const sh = 0.76 + R() * 0.17; out('rubble', x, z, part(R() < 0.45 ? G.box : R() < 0.5 ? G.ico : G.tet, [x, s * 0.25 + 0.013, z], [R() * 6, R() * 6, R() * 6], [s * (0.7 + R() * 0.8), s * (0.35 + R() * 0.4), s * (0.7 + R() * 0.8)], [sh, sh * 0.99, sh * 0.97]), big); }
  for (let q = 0; q < 180; q++) { const x = -16 + R() * 32, z = -16 + R() * 32; if (clearZone(x, z) && R() < 0.7) continue; out('decal', x, z, part(G.plane, [x, 0.03 + R() * 0.004, z], [(R() - 0.5) * 0.2, R() * 6, (R() - 0.5) * 0.2], [0.21, 1, 0.3], C_.white), false); }
}


// —— 基站营地（基站局部坐标：x 沿基站侧向，z 沿基站正面；机位都在正面 6~9 米处，营地设施放在背面和两侧） ——
function buildCamp(out, root, mats) {
  const R = mulberry32(4242); const D = CITY.dock, ry = -0.9; const M0 = mat4(D, [0, ry, 0]); const L = [];
  const add = (k, g) => L.push([k, g]); const B = (k, p, sz, col, rot) => add(k, part(G.box, p, rot, sz, col)); const Cy = (k, p, r, h, col, rot, g = G.cyl12) => add(k, part(g, p, rot, [r, h, r], col));
  // 混凝土平台（厚 1.6 米，盖住山顶的起伏）与地面标线
  B('matte', [0, -0.78, -2], [32, 1.6, 28], lin('#e4e0d9')); B('matte', [0, 0.02, 12.2], [32.4, 0.08, 0.4], lin('#d8d3ca'));
  for (const [x0, z0, x1, z1] of [[-15, -15.6, 15, -15.6], [-15, 11.6, -3.5, 11.6], [3.5, 11.6, 15, 11.6], [-15.6, -15, -15.6, 11], [15.6, -15, 15.6, 11]]) { const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2; B('decal', [cx, 0.012, cz], [Math.max(0.12, Math.abs(x1 - x0)), 0.01, Math.max(0.12, Math.abs(z1 - z0))], C_.orange); }
  for (const x of [-1.1, 1.1]) B('decal', [x, 0.012, 7.8], [0.1, 0.01, 7.6], C_.orange); // 大门到基站的人行通道
  for (let k = 0; k < 7; k++) B('decal', [-9.2 + k * 0.55, 0.012, -6.8], [0.22, 0.01, 2.6], C_.orange, [0, 0.6, 0]); // 发电机前的斜纹警示区
  // 两个集装箱（白色、竖向波纹、橙色腰线、端门）
  for (const [x, z, a] of [[-7.5, -11.5, 0], [6.8, -11.8, 0.04]]) { const cm = mat4([x, 0, z], [0, a, 0]); const P = [];
    P.push(['matte', part(G.box, [0, 1.3, 0], 0, [6.06, 2.6, 2.44], C_.cont)]); for (let u = -2.8; u <= 2.81; u += 0.4) for (const sd of [-1, 1]) P.push(['matte', part(G.box, [u, 1.3, sd * 1.23], 0, [0.12, 2.4, 0.04], C_.cont2)]);
    P.push(['gloss', part(G.box, [0, 1.75, 0], 0, [6.1, 0.22, 2.48], C_.orange)], ['metal', part(G.box, [3.04, 1.3, 0], 0, [0.05, 2.4, 2.3], lin('#cfccc5'))]); for (const sd of [-0.5, 0.5]) P.push(['metal', part(G.box, [3.08, 1.3, sd], 0, [0.05, 2.2, 0.06], C_.poleD)]);
    for (const [k, g] of P) { g.applyMatrix4(cm); add(k, g); } }
  // 通信塔：三角桁架、顶部两面抛物面天线和三块板状天线、橙白相间的顶段
  { const tx = 10.5, tz = -6, H = 15, legs = [0, 1, 2].map((i) => [Math.cos(i * 2.094) * 0.8, Math.sin(i * 2.094) * 0.8]);
    for (const [lx, lz] of legs) add('metal', part(G.cyl6, [tx + lx, H / 2, tz + lz], 0, [0.06, H, 0.06], C_.pole));
    for (let y = 1; y < H; y += 1.5) for (let i = 0; i < 3; i++) { const a = legs[i], b = legs[(i + 1) % 3]; const mx = (a[0] + b[0]) / 2, mz = (a[1] + b[1]) / 2, ang = Math.atan2(b[0] - a[0], b[1] - a[1]); add('metal', part(G.box, [tx + mx, y, tz + mz], [0, ang, 0], [0.04, 0.04, 1.39], C_.pole)); add('metal', part(G.box, [tx + mx, y + 0.75, tz + mz], [0.82, ang, 0], [0.03, 0.03, 2.05], C_.pole)); }
    for (let y = H - 3; y < H; y += 1) add('gloss', part(G.cyl6, [tx, y + 0.5, tz], 0, [0.95, 0.98, 0.95], (y - H) % 2 ? C_.orange : C_.white));
    for (const [a, y] of [[0.7, H - 4.5], [2.6, H - 6.2]]) { const dx = Math.cos(a) * 1.1, dz = Math.sin(a) * 1.1; add('gloss', part(G.cyl12, [tx + dx, y, tz + dz], [0, -a + Math.PI / 2, Math.PI / 2], [0.75, 0.28, 0.75], C_.white)); add('metal', part(G.box, [tx + dx * 0.6, y, tz + dz * 0.6], [0, -a, 0], [0.5, 0.08, 0.08], C_.poleD)); }
    for (let i = 0; i < 3; i++) { const a = i * 2.094 + 0.5; add('gloss', part(G.box, [tx + Math.cos(a) * 1.15, H + 0.9, tz + Math.sin(a) * 1.15], [0, -a, 0], [0.12, 1.6, 0.36], C_.white)); }
    add('metal', part(G.cyl6, [tx, H + 2.4, tz], 0, [0.04, 2.0, 0.04], C_.pole)); }
  // 太阳能板阵列（两排，每排五块，深色玻璃＋白边框，倾斜 25°）
  for (let row = 0; row < 2; row++) for (let k = 0; k < 5; k++) { const px = -13.2 + row * 2.6, pz = -6.5 + k * 1.85; const pm = mat4([px, 1.05, pz], [0, Math.PI / 2, 0]);
    for (const [kk, g] of [['glass', part(G.box, [0, 0, 0], [-0.44, 0, 0], [1.7, 0.05, 1.05], C_.solar)], ['matte', part(G.box, [0, -0.01, 0], [-0.44, 0, 0], [1.78, 0.04, 1.13], C_.white)], ['metal', part(G.box, [0, -0.55, 0.32], 0, [0.06, 0.9, 0.06], C_.pole)], ['metal', part(G.box, [0, -0.75, -0.32], 0, [0.06, 0.5, 0.06], C_.pole)]]) { g.applyMatrix4(pm); add(kk, g); } }
  // 发电机、横卧油罐、电池柜
  B('matte', [-8.2, 0.75, -3.6], [2.4, 1.5, 1.3], lin('#d3d0ca')); for (let k = 0; k < 6; k++) B('metal', [-8.2 + (k - 2.5) * 0.32, 1.0, -2.94], [0.16, 0.7, 0.02], C_.poleD); B('gloss', [-8.2, 1.52, -3.6], [2.42, 0.06, 1.32], C_.orange);
  add('gloss', part(G.cyl12, [-12.2, 0.95, -1.2], [0, 0, Math.PI / 2], [0.62, 2.4, 0.62], lin('#e8e5df'))); for (const x of [-13, -11.4]) B('metal', [x, 0.35, -1.2], [0.15, 0.7, 1.0], C_.poleD);
  for (let k = 0; k < 3; k++) { B('matte', [-4.6 + k * 0.9, 0.9, -8.6], [0.8, 1.8, 0.7], lin('#dedbd5')); B('glass', [-4.6 + k * 0.9, 1.4, -8.24], [0.5, 0.1, 0.02], C_.solar); }
  for (const [x0, z0, x1, z1] of [[-8.2, -2.9, -2.2, -0.6], [-4.6, -8.2, -1.6, -1.6]]) { const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2, len = Math.hypot(x1 - x0, z1 - z0), a = Math.atan2(x1 - x0, z1 - z0); add('matte', part(G.box, [cx, 0.06, cz], [0, a, 0], [0.32, 0.12, len], lin('#bdb8ae'))); } // 线槽
  // 指挥帐篷（白色、拱形顶、橙色腰带）
  { const tx = -1.5, tz = -10.8, w = 5.2, dd = 3.6; B('matte', [tx, 1.0, tz], [w, 2.0, dd], C_.tent); add('matte', part(G.cyl12, [tx, 2.0, tz], [0, 0, Math.PI / 2], [dd / 2, w, dd / 2 * 0.62], C_.tent)); B('gloss', [tx, 1.6, tz], [w + 0.02, 0.18, dd + 0.02], C_.orange);
    B('glass', [tx, 1.1, tz + dd / 2 + 0.01], [1.3, 1.9, 0.02], lin('#4a4e55')); for (const x of [-2.2, 2.2]) B('metal', [tx + x, 0.04, tz + dd / 2 + 0.8], [0.04, 0.04, 1.6], C_.poleD); }
  // 照明灯塔
  for (const [x, z] of [[-14.2, -14.2], [14.2, -14.6], [-14.6, 9.6]]) { Cy('metal', [x, 3.4, z], 0.07, 6.8, C_.pole, 0, G.cyl8); B('metal', [x, 6.8, z], [1.3, 0.08, 0.1], C_.poleD); for (const u of [-0.45, 0.15]) for (const v of [0, 0.42]) B('gloss', [x + u + 0.15, 7.05 + v, z + 0.05], [0.36, 0.34, 0.14], lin('#f1efe9')); }
  // 围栏（立柱＋三道钢丝，前方留大门）
  const fence = (x0, z0, x1, z1) => { const len = Math.hypot(x1 - x0, z1 - z0), n = Math.max(1, Math.round(len / 2.5)), a = Math.atan2(x1 - x0, z1 - z0);
    for (let i = 0; i <= n; i++) { const u = i / n; B('metal', [lerp(x0, x1, u), 0.9, lerp(z0, z1, u)], [0.07, 1.8, 0.07], C_.pole); } for (const y of [0.45, 1.05, 1.65]) add('metal', part(G.box, [(x0 + x1) / 2, y, (z0 + z1) / 2], [0, a, 0], [0.025, 0.025, len], C_.pole)); };
  fence(-15.8, -15.8, 15.8, -15.8); fence(-15.8, -15.8, -15.8, 11.8); fence(15.8, -15.8, 15.8, 11.8); fence(-15.8, 11.8, -3.6, 11.8); fence(3.6, 11.8, 15.8, 11.8);
  B('gloss', [-3.6, 1.0, 11.8], [0.16, 2.0, 0.16], C_.orange); B('gloss', [3.6, 1.0, 11.8], [0.16, 2.0, 0.16], C_.orange);
  // 指挥车（白色厢式车，车顶天线杆与小天线锅）
  { const vm = mat4([12.0, 0, 5.5], [0, 0.12, 0]); const P = [['gloss', part(G.box, [0, 1.35, -0.6], 0, [2.2, 2.2, 4.4], C_.white)], ['gloss', part(G.box, [0, 1.05, 2.35], 0, [2.2, 1.6, 1.5], C_.white)], ['glass', part(G.box, [0, 1.45, 2.95], [-0.2, 0, 0], [2.0, 0.7, 0.4], C_.sig)], ['gloss', part(G.box, [0, 1.1, -0.6], 0, [2.22, 0.2, 4.42], C_.orange)],
    ['metal', part(G.cyl6, [0.5, 3.6, -1.6], 0, [0.05, 2.6, 0.05], C_.pole)], ['gloss', part(G.cyl12, [0.5, 4.9, -1.6], [0.6, 0, 0], [0.45, 0.12, 0.45], C_.white)], ['matte', part(G.box, [-0.4, 2.55, -1.2], 0, [0.9, 0.2, 1.4], lin('#d6d2cb'))]];
    for (const sx of [-1, 1]) for (const z of [-1.9, 2.1]) P.push(['matte', part(G.cyl8, [sx * 1.0, 0.4, z], [0, 0, Math.PI / 2], [0.4, 0.28, 0.4], C_.wheel)]); for (const [k, g] of P) { g.applyMatrix4(vm); add(k, g); } }
  // 木箱、托盘、油桶、风向袋
  for (const [x, z, sz] of [[-11.8, -8.8, 1.0], [-10.6, -9.1, 0.8], [-11.2, -8.9, 0.6], [3.4, -8.6, 1.1], [4.5, -8.4, 0.7]]) B('matte', [x, sz / 2, z], [sz, sz, sz], C_.wood, [0, R() * 0.5, 0]);
  for (let k = 0; k < 5; k++) { const x = -13.6 + (k % 3) * 0.66, z = 4.2 + Math.floor(k / 3) * 0.66; add('gloss', part(G.cyl12, [x, 0.45, z], 0, [0.29, 0.9, 0.29], k % 2 ? C_.orange : lin('#9fa3a9'))); }
  Cy('metal', [-12.5, 3.0, 9.0], 0.05, 6.0, C_.pole, 0, G.cyl8); add('gloss', part(G.cone7, [-11.4, 5.8, 9.0], [0, 0, Math.PI / 2], [0.42, 2.0, 0.42], C_.orange));
  place(out, L, M0, D[0], D[2], true);
}


// —— 航空基地地面设施（加在机场组里，局部坐标；机位在 (-17, 1.7, 14) 看向东北） ——
export function airportDetail() {
  const R = mulberry32(777); const L = []; const add = (k, g) => L.push([k, g]); const B = (k, p, sz, col, rot) => add(k, part(G.box, p, rot, sz, col));
  const pm = (list, pos, ry) => { const m = mat4(pos, [0, ry, 0]); for (const [k, g] of list) { g.applyMatrix4(m); add(k, g); } };
  // 地面标线：滑行中线（橙）、停机位白框、等待线
  for (let z = -16; z > -30; z -= 2.4) B('decal', [0, 0.012, z], [0.3, 0.01, 1.4], C_.orange);
  for (let x = 14; x < 60; x += 2.4) B('decal', [x, 0.012, 0], [1.4, 0.01, 0.3], C_.orange);
  for (const [cx, cz] of [[34, -12], [-22, -12]]) for (const [x, z, w, d] of [[0, -7, 14, 0.25], [0, 7, 14, 0.25], [-7, 0, 0.25, 14], [7, 0, 0.25, 14]]) B('decal', [cx + x, 0.012, cz + z], [w, 0.01, d], C_.paint);
  for (const dz of [0, 0.7]) B('decal', [0, 0.012, -14 - dz], [8, 0.01, 0.22], C_.orange);
  // 加油车（白色罐体＋橙色腰线）
  pm([['gloss', part(G.box, [0, 1.3, 2.6], 0, [2.4, 2.2, 1.9], C_.white)], ['glass', part(G.box, [0, 1.75, 3.56], 0, [2.1, 0.8, 0.04], C_.sig)], ['gloss', part(G.cyl12, [0, 1.75, -1.0], [Math.PI / 2, 0, 0], [1.2, 5.0, 1.0], lin('#f1efea'))], ['gloss', part(G.cyl12, [0, 1.75, -1.0], [Math.PI / 2, 0, 0], [1.22, 0.3, 1.02], C_.orange)],
    ['metal', part(G.box, [0, 0.55, 0], 0, [2.2, 0.3, 7.6], C_.poleD)], ...[-2.4, 0.9, 2.6].flatMap((z) => [-1, 1].map((sx) => ['matte', part(G.cyl8, [sx * 1.05, 0.5, z], [0, 0, Math.PI / 2], [0.5, 0.36, 0.5], C_.wheel)]))], [27, 0, -6], 0.5);
  // 地面电源车、牵引车、行李平板车
  pm([['gloss', part(G.box, [0, 0.75, 0], 0, [1.4, 1.1, 2.2], lin('#e8e6e1'))], ['gloss', part(G.box, [0, 1.32, 0], 0, [1.42, 0.06, 2.22], C_.orange)], ['metal', part(G.box, [0, 0.82, 1.11], 0, [1.0, 0.6, 0.02], C_.poleD)], ...[-0.7, 0.7].flatMap((z) => [-1, 1].map((sx) => ['matte', part(G.cyl8, [sx * 0.62, 0.25, z], [0, 0, Math.PI / 2], [0.25, 0.18, 0.25], C_.wheel)]))], [9, 0, -10.5], 0.3);
  pm([['gloss', part(G.box, [0, 0.55, 0], 0, [1.5, 0.7, 2.6], C_.orange)], ['glass', part(G.box, [0, 1.15, -0.3], 0, [1.3, 0.55, 1.0], C_.sig)], ...[-0.8, 0.8].flatMap((z) => [-1, 1].map((sx) => ['matte', part(G.cyl8, [sx * 0.72, 0.3, z], [0, 0, Math.PI / 2], [0.3, 0.22, 0.3], C_.wheel)]))], [-9, 0, -18], 1.2);
  // 灯杆、锥桶、救护车、办公楼、候机棚、围栏
  for (const [x, z] of [[-14, -20], [24, -22], [44, 8], [-30, 6]]) { add('metal', part(G.cyl8, [x, 6, z], 0, [0.12, 12, 0.12], C_.pole)); B('metal', [x, 12, z], [2.4, 0.12, 0.2], C_.poleD); for (const u of [-0.8, 0, 0.8]) B('gloss', [x + u, 11.75, z], [0.6, 0.35, 0.4], lin('#f2f0ea')); }
  for (const [x, z] of [[4.5, 7.8], [-4.5, 7.8], [8.2, 3.2], [-8.2, 3.2], [8.2, -3.2], [-8.2, -3.2]]) { const cn = cone(); pm(cn, [x, 0, z], R()); }
  pm([['gloss', part(G.box, [0, 1.45, -0.7], 0, [2.3, 2.3, 4.2], C_.white)], ['gloss', part(G.box, [0, 1.05, 2.1], 0, [2.3, 1.5, 1.4], C_.white)], ['glass', part(G.box, [0, 1.45, 2.81], [-0.15, 0, 0], [2.1, 0.6, 0.04], C_.sig)], ['gloss', part(G.box, [0, 1.15, 0], 0, [2.32, 0.24, 6.6], lin('#d93a2c'))], ['metal', part(G.box, [0, 2.65, 1.7], 0, [1.4, 0.14, 0.3], C_.sig)],
    ...[-1.8, 2.0].flatMap((z) => [-1, 1].map((sx) => ['matte', part(G.cyl8, [sx * 1.05, 0.42, z], [0, 0, Math.PI / 2], [0.42, 0.3, 0.42], C_.wheel)]))], [-24, 0, -12], 0.15);
  { const ox = -20, oz = -48, w = 22, d = 12, h = 7.2; B('matte', [ox, h / 2, oz], [w, h, d], lin('#e6e2db')); for (let y = 1.2; y < h - 0.5; y += 3.2) B('glass', [ox, y + 0.9, oz + d / 2 + 0.01], [w - 2, 1.4, 0.04], lin('#3c434c')); B('gloss', [ox, h + 0.2, oz], [w + 0.4, 0.4, d + 0.4], lin('#dad6ce')); B('gloss', [ox, 3.0, oz + d / 2 + 0.03], [w + 0.02, 0.2, 0.06], C_.orange); }
  for (let x = -60; x <= 60; x += 3) { add('metal', part(G.box, [x, 1.0, 46], 0, [0.08, 2.0, 0.08], C_.pole)); } for (const y of [0.6, 1.2, 1.8]) B('metal', [0, y, 46], [120, 0.03, 0.03], C_.pole);
  const mats = { matte: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.86 }), gloss: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.34 }), metal: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.42, metalness: 0.5 }),
    glass: new THREE.MeshStandardMaterial({ color: '#2b3139', roughness: 0.12, metalness: 0.4 }), decal: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }) };
  const by = {}; for (const [k, g] of L) (by[k] = by[k] || []).push(g); const grp = new THREE.Group();
  for (const [k, list] of Object.entries(by)) { const m = new THREE.Mesh(mergeGeometries(list, false), mats[k]); m.castShadow = k !== 'decal'; m.receiveShadow = true; grp.add(m); } return grp;
}

// —— 城外：公路、山林、塌方警戒、基站营地、航空基地 ——
export function buildOutskirts(C, out, root, mats) {
  const R = mulberry32(9191); const bx = CITY.roadBlockX;
  // 公路护栏（两侧，塌方处断开、扭曲）
  for (const sd of [-1, 1]) for (let x = 209; x < 1000; x += 4) { const z = sd * 6.6; const dmg = Math.abs(x - bx) < 26; if (dmg && Math.abs(x - bx) < 15) continue; const y = 0;
    const L = [['metal', part(G.box, [0, 0.42, 0], 0, [0.1, 0.84, 0.12], C_.guard)], ['metal', part(G.box, [2, 0.62, 0], 0, [4.02, 0.3, 0.05], C_.guard)]];
    place(out, L, mat4([x, y, z], [dmg ? (R() - 0.5) * 0.5 : 0, dmg ? (R() - 0.5) * 0.4 : 0, dmg ? (R() - 0.5) * 0.3 : 0]), x, z, x < 420); }
  // 路边反光柱与路牌
  for (let x = 214; x < 1000; x += 20) for (const sd of [-1, 1]) { const z = sd * 7.6; if (Math.abs(x - bx) < 20) continue; place(out, [['matte', part(G.box, [0, 0.5, 0], 0, [0.12, 1.0, 0.12], C_.white)], ['gloss', part(G.box, [0, 0.85, sd * -0.065], 0, [0.1, 0.12, 0.02], C_.orange)]], mat4([x, 0, z]), x, z, false); }
  for (const [x, sd] of [[372, 1], [520, -1], [236, 1]]) { const z = sd * 9; place(out, [['metal', part(G.cyl8, [-1.1, 1.6, 0], 0, [0.06, 3.2, 0.06], C_.pole)], ['metal', part(G.cyl8, [1.1, 1.6, 0], 0, [0.06, 3.2, 0.06], C_.pole)], ['gloss', part(G.box, [0, 2.6, 0], 0, [2.8, 1.4, 0.06], lin('#3f5b78'))], ['matte', part(G.box, [0, 2.6, 0.035], 0, [2.6, 1.2, 0.01], lin('#4b6a8b'))]], mat4([x, 0, z], [0, Math.PI / 2, 0]), x, z); }
  // 电线杆与电线（塌方处一根被推倒，电线垂到地上）
  const poles = []; for (let x = 216; x < 1010; x += 46) { const z = -12.5, ko = Math.abs(x - (bx + 6)) < 23; const tilt = ko ? 0.95 : (R() - 0.5) * 0.03; const M0 = mat4([x, 0, z], [0, 0, tilt]);
    place(out, [['matte', part(G.cyl8, [0, 5.5, 0], 0, [0.14, 11, 0.14], lin('#b9b2a5'))], ['matte', part(G.box, [0, 10.4, 0], 0, [0.14, 0.14, 2.6], lin('#a9a294'))], ['matte', part(G.cyl6, [0, 10.6, -1.1], 0, [0.06, 0.3, 0.06], C_.white)], ['matte', part(G.cyl6, [0, 10.6, 0], 0, [0.06, 0.3, 0.06], C_.white)], ['matte', part(G.cyl6, [0, 10.6, 1.1], 0, [0.06, 0.3, 0.06], C_.white)]], M0, x, z, true);
    poles.push({ M0, x, z }); }
  const wires = []; for (let i = 0; i + 1 < poles.length; i++) for (const off of [-1.1, 0, 1.1]) { const a = new THREE.Vector3(0, 10.75, off).applyMatrix4(poles[i].M0), b = new THREE.Vector3(0, 10.75, off).applyMatrix4(poles[i + 1].M0); const sag = 1.2;
    for (let k = 0; k < 12; k++) { const u0 = k / 12, u1 = (k + 1) / 12; const p = (u) => [lerp(a.x, b.x, u), Math.max(0.05, lerp(a.y, b.y, u) - sag * 4 * u * (1 - u)), lerp(a.z, b.z, u)]; wires.push(...p(u0), ...p(u1)); } }
  const wg = new THREE.BufferGeometry(); wg.setAttribute('position', new THREE.Float32BufferAttribute(wires, 3)); const wl = new THREE.LineSegments(wg, new THREE.LineBasicMaterial({ color: '#7a7c80' })); root.add(wl);
  // 山林：针叶为主、夹杂阔叶，沿公路两侧山坡与城外地形成片分布
  const Nz = makeNoise2D(41); const dock = CITY.dock;
  // s02 机位 (372, 7, 19.5) 看向 (318, 1.5, 0)：视线楔形内和机位附近不种树
  const view02 = (x, z) => { const ax = 318 - 372, az = 0 - 19.5, L2 = ax * ax + az * az; const u = ((x - 372) * ax + (z - 19.5) * az) / L2; const d = Math.abs((x - 372) * az - (z - 19.5) * ax) / Math.sqrt(L2); return u > -0.45 && u < 1.25 && d < Math.max(11, 4 + 18 * u); };
  const forest = (x, z, th) => { if (Math.abs(x) < 236 && Math.abs(z) < 236) return false; if (x > 200 && Math.abs(z) < 11) return false; if (Math.abs(x - bx) < 34 && Math.abs(z) < 40) return false; if (view02(x, z)) return false; if (Math.hypot(x - dock[0], z - dock[2]) < 36) return false; return Nz.fbm(x * 0.012, z * 0.012, 3) > th; };
  let nT = 0; for (let q = 0; q < 12000 && nT < 2300; q++) { const near = q < 5000; const x = near ? 210 + R() * 780 : -520 + R() * 1500, z = near ? (R() < 0.5 ? -1 : 1) * (11 + Math.pow(R(), 1.4) * 90) : -560 + R() * 1120; if (!forest(x, z, near ? -0.3 : -0.05)) continue;
    const y = terrainHeight(x, z); const s = 0.8 + R() * 0.7; place(out, R() < 0.65 ? conifer(R, s) : tree(R, s * 1.1), mat4([x, y - 0.1, z], [0, R() * 6, 0]), x, z, near && x < 700); nT++; }
  // 岩石：塌方体上的大块石头、路边与山坡上的散石
  for (let q = 0; q < 26; q++) { const a = R() * 6.28, r = Math.sqrt(R()) * 15; const x = bx + Math.cos(a) * r * 0.8, z = Math.sin(a) * r * 1.5; const hm = 7 * 0.8 * Math.max(0, 1 - (r / 16) ** 2) ** 1.3; place(out, rock(R, 1.2 + R() * 2.4), mat4([x, hm * 0.8, z]), x, z, true); }
  for (let q = 0; q < 260; q++) { const x = 210 + R() * 780, z = (R() < 0.5 ? -1 : 1) * (8 + R() * 60); if (Math.abs(x - bx) < 20 && Math.abs(z) < 30) continue; place(out, rock(R, 0.3 + Math.pow(R(), 2) * 1.6), mat4([x, terrainHeight(x, z) - 0.05, z]), x, z, false); }
  // 塌方处：倒伏的树、裂开的路面碎块、警戒锥桶与封路牌
  place(out, conifer(R, 1.3), mat4([bx + 12, 0.25, 3.5], [0, 0.4, 1.5]), bx + 12, 3.5);
  for (let q = 0; q < 120; q++) { const x = bx + 9 + R() * 11, z = (R() - 0.5) * 11; const s = 0.15 + Math.pow(R(), 2) * 0.6; out('matte', x, z, part(R() < 0.5 ? G.box : G.tet, [x, s * 0.2 + 0.08, z], [R() * 0.4, R() * 6, R() * 0.4], [s * 1.6, s * 0.35, s * 1.2], lin('#bdb7ac').map((v) => v * (0.9 + R() * 0.15))), false); }
  for (let q = 0; q < 7; q++) { const x = bx + 15.6 + (q % 2) * 0.6, z = -4.8 + q * 1.6; place(out, cone(), mat4([x, 0.08, z], [0, R(), 0]), x, z); }
  for (const z of [-2.6, 2.6]) { const x = bx + 17.6; const L = [['metal', part(G.box, [-1.1, 0.5, 0], 0, [0.08, 1.0, 0.5], C_.poleD)], ['metal', part(G.box, [1.1, 0.5, 0], 0, [0.08, 1.0, 0.5], C_.poleD)]]; for (let k = 0; k < 6; k++) L.push(['gloss', part(G.box, [-1.25 + k * 0.5 + 0.25, 0.85, 0], 0, [0.5, 0.26, 0.05], k % 2 ? C_.white : C_.orange)]); place(out, L, mat4([x, 0.08, z], [0, Math.PI / 2, 0]), x, z); }
  const sc = mkCanvas(512, 256), sg = sc.getContext('2d'); sg.fillStyle = '#f6f4f0'; sg.fillRect(0, 0, 512, 256); sg.strokeStyle = '#d93a2c'; sg.lineWidth = 18; sg.strokeRect(9, 9, 494, 238); sg.fillStyle = '#1d1e21'; sg.font = '900 84px "Noto Sans SC",sans-serif'; sg.textAlign = 'center'; sg.fillText('前方塌方', 256, 112); sg.font = '700 64px "Noto Sans SC",sans-serif'; sg.fillStyle = '#d93a2c'; sg.fillText('道路封闭', 256, 200);
  const st = new THREE.CanvasTexture(sc); st.colorSpace = THREE.SRGBColorSpace; const sign = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 1.1), mats.sign(st)); sign.position.set(bx + 19.2, 1.75, -4.2); sign.rotation.y = Math.PI / 2; sign.castShadow = true; root.add(sign);
  place(out, [['metal', part(G.box, [0, 0.62, -0.9], 0, [0.07, 1.24, 0.07], C_.poleD)], ['metal', part(G.box, [0, 0.62, 0.9], 0, [0.07, 1.24, 0.07], C_.poleD)], ['matte', part(G.box, [-0.03, 1.75, 0], 0, [0.04, 1.16, 2.26], C_.sig)]], mat4([bx + 19.2, 0.08, -4.2]), bx + 19.2, -4.2);
  buildCamp(out, root, mats);
}
