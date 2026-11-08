// 灾区场景：地震后的城区（站立/倾斜/部分坍塌/完全坍塌的楼房、瓦砾、钢筋、压扁的汽车）、城外丘陵、
// 东侧被塌方截断的公路和救援车辆、山顶基站、烟柱和浮尘。几何体按材质合并以减少绘制调用。
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { M, triplanar, srgb, grime } from '../materials.js';
import { concrete, facade, overcastSky, softSprite, smokeSprite } from '../textures.js';
import { makeNoise2D, mulberry32, clamp, smooth, lerp } from '../util.js';
import { createParticles } from '../fx/particles.js';
import { createDock } from './dock.js';
import { createVehicle } from './vehicles.js';
import { SUN_DIR, createSkyDome } from '../fx/atmosphere.js';

const TN = makeNoise2D(77);
const DEBUG = new URLSearchParams(location.search);
export const CITY = {
  half: 230, block: 46,
  landing: new THREE.Vector3(0, 0, 6.5),
  dock: new THREE.Vector3(470, 0, -250),
  roadBlockX: 300,
  // 8 名被困者（世界坐标 x, z）；第 1 个是六足机器人现场发现的那位，第 8 个是片尾镜头推进的最后一个红点
  survivors: [[0.6, -1.2], [-26, 98], [46, 72], [-36, -84], [94, -38], [-108, -16], [70, -112], [-58, 34]],
};

export function terrainHeight(x, z) {
  const out = Math.hypot(Math.max(0, Math.abs(x) - CITY.half), Math.max(0, Math.abs(z) - CITY.half));
  let h = (TN.fbm(x * 0.0035, z * 0.0035, 4) * 0.5 + 0.45) * 30 * smooth(out / 140);
  h += 38 * Math.exp(-((x - CITY.dock.x) ** 2 + (z - CITY.dock.z) ** 2) / (2 * 80 * 80));
  if (x > 150) h = lerp(h, 0, 1 - smooth((Math.abs(z) - 9) / 35)); // 东侧公路走廊压平
  return Math.max(0, h);
}
CITY.dock.y = terrainHeight(CITY.dock.x, CITY.dock.z);

// 带楼面贴图的盒子：按尺寸缩放 UV，每块贴图 = 8 开间(32m) × 8 层(25.6m)
function facadeBox(w, h, d, rnd) {
  const g = new THREE.BoxGeometry(w, h, d);
  const uv = g.attributes.uv, ou = rnd() * 8, ov = rnd() * 0.2;
  const faceDims = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]];
  for (let f = 0; f < 6; f++) for (let k = 0; k < 4; k++) {
    const i = f * 4 + k; const [fw, fh] = faceDims[f];
    uv.setXY(i, uv.getX(i) * fw / 32 + ou, uv.getY(i) * fh / 25.6 + ov);
  }
  return g;
}

export async function buildCity(engine) {
  const rnd = mulberry32(2024);
  const scene = new THREE.Scene();
  // 黄昏：低角度暖色夕阳从西南方穿过烟尘，天光偏冷
  const dome = createSkyDome(); scene.add(dome);
  // 环境反射只给设备和直升机用（省掉楼房瓦砾上的大量开销），见 world.js 的 applyEnv
  { const envScene = new THREE.Scene(); envScene.add(createSkyDome()); const pm = new THREE.PMREMGenerator(engine.renderer); engine.envMap = engine.envMap || pm.fromScene(envScene, 0, 1, 5000).texture; }
  scene.background = new THREE.Color(0x30343a);
  scene.fog = new THREE.FogExp2(0x7a828e, 0.0026);
  const hemi = new THREE.HemisphereLight(0x9aaccc, 0x4a3a2c, 1.15); scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xffc08a, 3.1); sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048); sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.06; scene.add(sun); scene.add(sun.target);

  // ---------- 贴图与材质 ----------
  const facades = [[150, 146, 138], [168, 158, 140], [138, 146, 152], [160, 120, 104]].map((c, i) => grime(new THREE.MeshStandardMaterial({ map: facade(11 + i, c), roughness: 0.88, metalness: 0.02 })));
  const roofMat = new THREE.MeshStandardMaterial({ color: 0x77736c, roughness: 0.95 });
  const conc = concrete(5, 512, [150, 146, 138], 0.6);
  const slabMat = triplanar(new THREE.MeshStandardMaterial({ map: conc.map, roughness: 0.92 }), 0.35);
  const rubbleTex = concrete(8, 512, [235, 232, 226], 0.7, 3, 0.25);
  const rockMat = triplanar(new THREE.MeshStandardMaterial({ map: rubbleTex.map, roughness: 0.96, flatShading: true }), 0.9);
  const moundTex = concrete(17, 512, [112, 106, 96], 0.9, 2, 0.2);
  const moundMat = triplanar(new THREE.MeshStandardMaterial({ map: moundTex.map, roughness: 1, flatShading: true }), 0.25);
  const plazaTex = concrete(23, 512, [118, 114, 106], 0.9, 6, 0.4);
  const asph = concrete(3, 512, [70, 70, 72], 0.3); asph.map.repeat.set(1, 1);
  const groundTex = concrete(31, 512, [124, 116, 104], 0.35, 0);
  groundTex.map.repeat.set(160, 160); groundTex.normalMap.repeat.set(160, 160);

  // ---------- 地形 ----------
  const TS = 2600, TR = 260;
  const tg = new THREE.PlaneGeometry(TS, TS, TR, TR); tg.rotateX(-Math.PI / 2); tg.translate(300, 0, 0);
  const tp = tg.attributes.position, tcol = new Float32Array(tp.count * 3);
  for (let i = 0; i < tp.count; i++) {
    const x = tp.getX(i), z = tp.getZ(i), h = terrainHeight(x, z); tp.setY(i, h);
    const out = smooth((Math.hypot(Math.max(0, Math.abs(x) - CITY.half), Math.max(0, Math.abs(z) - CITY.half))) / 60);
    const n = TN.fbm(x * 0.02, z * 0.02, 3) * 0.5 + 0.5;
    const city = [0.62, 0.59, 0.55], field = [0.5 + n * 0.12, 0.5 + n * 0.08, 0.36];
    for (let k = 0; k < 3; k++) tcol[i * 3 + k] = lerp(city[k], field[k], out) * (0.85 + n * 0.25);
  }
  tg.setAttribute('color', new THREE.BufferAttribute(tcol, 3)); tg.computeVertexNormals();
  const terrain = new THREE.Mesh(tg, new THREE.MeshStandardMaterial({ map: groundTex.map, normalMap: groundTex.normalMap, vertexColors: true, roughness: 1 }));
  terrain.receiveShadow = true; scene.add(terrain);

  // ---------- 静态几何收集（按材质合并） ----------
  const bins = new Map(); const TILE = 92;
  const tileOf = (x, z) => `${Math.floor(x / TILE)},${Math.floor(z / TILE)}`;
  const put = (mat, geo, m4) => {
    if (m4) geo.applyMatrix4(m4);
    geo.computeBoundingBox(); const c = new THREE.Vector3(); geo.boundingBox.getCenter(c);
    const key = tileOf(c.x, c.z);
    if (!bins.has(mat)) bins.set(mat, new Map()); const m = bins.get(mat); if (!m.has(key)) m.set(key, []); m.get(key).push(geo);
  };
  const mtx = (x, y, z, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1) => new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)), new THREE.Vector3(sx, sy, sz));

  // 瓦砾实例
  const rocks = { big: [], small: [], slab: [], rebar: [], brick: [] };
  const rockColor = () => { const r = rnd(); if (r < 0.08) return [0.38, 0.31, 0.28]; if (r < 0.24) return [0.5, 0.46, 0.4]; const g = 0.36 + rnd() * 0.2; return [g, g * 0.97, g * 0.92]; };
  const moundH = (rr, radius, height) => height * Math.pow(Math.max(0, 1 - (rr / radius) ** 2), 1.3);
  function mound(cx, cz, radius, height, sx = 1, sz = 1) {
    const seg = 28, rings = 9, g = new THREE.CircleGeometry(1, seg, 0, Math.PI * 2);
    const geo = new THREE.BufferGeometry(); const pos = [], idx = [];
    for (let r = 0; r <= rings; r++) for (let k = 0; k < seg; k++) {
      const rr = r / rings, a = k / seg * Math.PI * 2;
      const x = Math.cos(a) * rr * radius * sx, z = Math.sin(a) * rr * radius * sz;
      const nn = TN.fbm((cx + x) * 0.15, (cz + z) * 0.15, 3);
      pos.push(cx + x, moundH(rr * radius, radius, height) * (1 + nn * 0.35) - 0.05 - (r === rings ? 0.1 : 0), cz + z);
    }
    for (let r = 0; r < rings; r++) for (let k = 0; k < seg; k++) { const a = r * seg + k, b = r * seg + (k + 1) % seg, c = a + seg, d = b + seg; idx.push(a, c, b, b, c, d); }
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.setIndex(idx); geo.computeVertexNormals();
    const ng = geo.toNonIndexed(); ng.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(ng.attributes.position.count * 2), 2)); ng.computeVertexNormals();
    put(moundMat, ng);
  }
  // 禁入区：六足机器人行走路线和近景机位附近不放碎块和楼板
  const keepOut = [[-1.8, 3.2, -0.6, 9.5]];
  const blocked = (x, z, m = 0) => keepOut.some(([x0, x1, z0, z1]) => x > x0 - m && x < x1 + m && z > z0 - m && z < z1 + m);
  function pile(cx, cz, radius, height, n, opts = {}) {
    if (height > 0.8) mound(cx, cz, radius * 1.05, height * 0.8, opts.sx || 1, opts.sz || 1);
    if (Math.hypot(cx, cz) > 40 && !opts.keepAll) n = Math.round(n * 0.45);
    for (let i = 0; i < n; i++) {
      const a = rnd() * Math.PI * 2, rr = Math.sqrt(rnd()) * radius;
      const x = cx + Math.cos(a) * rr * (opts.sx || 1), z = cz + Math.sin(a) * rr * (opts.sz || 1);
      const y = moundH(rr, radius, height * 0.8) * (0.85 + rnd() * 0.3) + (opts.base || 0);
      const edge = rr / radius;
      if (blocked(x, z, 1.5)) continue;
      const big = rnd() < 0.3 * (1 - edge * edge);
      const s = big ? 0.5 + rnd() * 1.3 : (0.08 + rnd() * 0.38) * (1 - 0.5 * edge);
      const ao = 0.62 + 0.38 * Math.min(1, (y + 0.3) / (height * 0.8 + 0.3));
      const c = rockColor().map((v) => v * ao);
      (big ? rocks.big : rocks.small).push({ p: [x, y, z], r: [rnd() * 6, rnd() * 6, rnd() * 6], s: [s * (0.7 + rnd() * 0.8), s * (0.4 + rnd() * 0.6), s * (0.7 + rnd() * 0.8)], c });
      if (rnd() < 0.05 * (opts.slabs ?? 1) && !blocked(x, z, 3.5)) rocks.slab.push({ p: [x, y + 0.2, z], r: [(rnd() - 0.5) * 1.2, rnd() * 6, (rnd() - 0.5) * 1.2], s: [1.5 + rnd() * 4, 0.22 + rnd() * 0.1, 1.2 + rnd() * 3] });
      if (rnd() < 0.05 * (opts.rebar ?? 1) && !blocked(x, z, 2.5)) rocks.rebar.push({ p: [x, y + 0.3, z], r: [(rnd() - 0.5) * 2.4, rnd() * 6, (rnd() - 0.5) * 2.4], s: [1, 0.8 + rnd() * 2.5, 1] });
      if (rnd() < 0.08 * (opts.bricks ?? 1)) rocks.brick.push({ p: [x + rnd(), y, z + rnd()], r: [rnd() * 6, rnd() * 6, rnd() * 6], s: [0.24, 0.07, 0.12] });
    }
  }

  // 站立楼房（可带残破顶部、倾斜）
  function standing(x, z, w, d, h, opts = {}) {
    const mat = facades[Math.floor(rnd() * facades.length)];
    const tilt = opts.lean ? (rnd() < 0.5 ? -1 : 1) * (0.05 + rnd() * 0.09) : 0;
    const ry = (rnd() - 0.5) * 0.06;
    const rx = opts.leanAxis === 'x' ? tilt : 0, rz = opts.leanAxis === 'x' ? 0 : tilt;
    const base = mtx(x, h / 2, z, rx, ry, rz);
    put(mat, facadeBox(w, h, d, rnd), base);
    const top = h / 2;
    const local = (lx, ly, lz) => new THREE.Vector3(lx, ly, lz).applyMatrix4(base);
    if (opts.broken) { // 残破顶部：几块高低不一的残体＋外露楼板
      for (let k = 0; k < 3; k++) {
        const bw = w * (0.3 + rnd() * 0.4), bd = d * (0.3 + rnd() * 0.4), bh = 2 + rnd() * 6;
        const lx = (rnd() - 0.5) * (w - bw), lz = (rnd() - 0.5) * (d - bd);
        const p = local(lx, top + bh / 2, lz);
        put(mat, facadeBox(bw, bh, bd, rnd), mtx(p.x, p.y, p.z, rx + (rnd() - 0.5) * 0.1, ry, rz + (rnd() - 0.5) * 0.1));
      }
      pile(x + (rnd() - 0.5) * w, z + d / 2 + 3, Math.max(w, d) * 0.45, 2.5, 60);
    } else if (!opts.noRoof) {
      const rp = local(0, top + 0.25, 0);
      put(roofMat, new THREE.BoxGeometry(w * 0.95, 0.5, d * 0.95), mtx(rp.x, rp.y, rp.z, rx, ry, rz));
      for (let k = 0; k < 3; k++) { const p = local((rnd() - 0.5) * w * 0.7, top + 0.9, (rnd() - 0.5) * d * 0.7); put(roofMat, new THREE.BoxGeometry(1.5 + rnd() * 2, 1.2, 1.2 + rnd() * 1.5), mtx(p.x, p.y, p.z, rx, ry, rz)); }
    }
  }
  // 部分坍塌：残存底层 + 叠落楼板 + 瓦砾
  function partial(x, z, w, d, h) {
    const mat = facades[Math.floor(rnd() * facades.length)];
    const floors = 1 + Math.floor(rnd() * 2), bh = floors * 3.2;
    put(mat, facadeBox(w, bh, d, rnd), mtx(x, bh / 2, z, 0, (rnd() - 0.5) * 0.05, 0));
    const n = 3 + Math.floor(rnd() * 4);
    for (let k = 0; k < n; k++) rocks.slab.push({ p: [x + (rnd() - 0.5) * 2, bh + 0.5 + k * 0.9, z + (rnd() - 0.5) * 2], r: [(rnd() - 0.5) * 0.5, (rnd() - 0.5) * 0.3, (rnd() - 0.5) * 0.5], s: [w * (0.75 + rnd() * 0.3), 0.3, d * (0.75 + rnd() * 0.3)] });
    // 残墙
    for (let k = 0; k < 2; k++) { const wh = 4 + rnd() * 6; put(mat, facadeBox(w * (0.25 + rnd() * 0.3), wh, 0.35, rnd), mtx(x + (rnd() - 0.5) * w * 0.6, bh + wh / 2, z + (k ? 1 : -1) * d * 0.45, (rnd() - 0.5) * 0.2, 0, (rnd() - 0.5) * 0.3)); }
    pile(x, z, Math.max(w, d) * 0.9, 3 + rnd() * 2, 220, { base: 0 });
  }
  // 完全坍塌：瓦砾山 + 斜插楼板 + 钢筋 + 一两片残墙
  function collapsed(x, z, w, d, h) {
    const mat = facades[Math.floor(rnd() * facades.length)];
    const ph = Math.min(10, 3 + h * 0.18);
    pile(x, z, Math.max(w, d) * 0.85, ph, 420 + Math.floor(h * 6), { slabs: 2.2, rebar: 2.5 });
    for (let k = 0; k < 6; k++) { const a = rnd() * 6.28, r = rnd() * Math.max(w, d) * 0.4; rocks.slab.push({ p: [x + Math.cos(a) * r, ph * (0.3 + rnd() * 0.6), z + Math.sin(a) * r], r: [(rnd() - 0.5) * 1.4, rnd() * 6, (rnd() - 0.5) * 1.4], s: [3 + rnd() * 5, 0.3, 2 + rnd() * 4] }); }
    if (rnd() < 0.7) { const wh = 5 + rnd() * 9; put(mat, facadeBox(w * (0.3 + rnd() * 0.3), wh, 0.4, rnd), mtx(x + (rnd() - 0.5) * w * 0.5, wh / 2, z + (rnd() - 0.5) * d * 0.5, (rnd() - 0.5) * 0.25, rnd() * 3, (rnd() - 0.5) * 0.35)); }
  }

  // ---------- 城区布局 ----------
  const B = CITY.block, roadW = 12, lot = B - roadW;
  const near = (x, z, r) => CITY.survivors.some(([sx, sz]) => Math.hypot(sx - x, sz - z) < r);
  for (let i = -4; i <= 4; i++) for (let j = -4; j <= 4; j++) {
    const cx = i * B, cz = j * B;
    if (i === 0 && j === 0) continue; // 中心广场（降落点）
    const dist = Math.hypot(cx, cz) / 200;
    const split = rnd() < 0.55;
    const lots = split ? [[-1, -1], [1, -1], [-1, 1], [1, 1]].map(([a, b]) => [cx + a * lot / 4, cz + b * lot / 4, lot / 2 - 2, lot / 2 - 2]) : [[cx, cz, lot - 2, lot - 2]];
    for (const [x, z, w0, d0] of lots) {
      const w = w0 * (0.75 + rnd() * 0.25), d = d0 * (0.75 + rnd() * 0.25);
      const h = 9 + rnd() * (dist > 0.7 ? 28 : 40);
      const forced = near(x, z, split ? 9 : 16);
      const r = rnd() - (1 - dist) * 0.4;
      if (forced || r < 0.2) collapsed(x, z, w, d, h);
      else if (r < 0.42) partial(x, z, w, d, h);
      else standing(x, z, w, d, h * (r < 0.6 ? 0.8 : 1), { broken: r < 0.78, lean: rnd() < 0.22, leanAxis: rnd() < 0.5 ? 'x' : 'z' });
    }
  }
  // 降落点北侧：贴近广场的一处坍塌（第 1 位被困者就在这片瓦砾下）
  pile(0.5, -9.5, 9.5, 4.2, 1000, { slabs: 2, rebar: 2.5, bricks: 2 });
  for (let k = 0; k < 5; k++) rocks.slab.push({ p: [(rnd() - 0.5) * 9, 1.2 + rnd() * 2.2, -6 - rnd() * 7], r: [(rnd() - 0.5) * 1.2, rnd() * 6, (rnd() - 0.5) * 1.2], s: [2.5 + rnd() * 3, 0.28, 2 + rnd() * 2] });
  // 广场上的零星碎块（避开六足机器人的行走路线）
  for (let i = 0; i < 800; i++) { const a = rnd() * 6.28, r = 2 + rnd() * 15; const x = Math.cos(a) * r, z = 6 + Math.sin(a) * r; if (Math.abs(x) < 1.1 && z > -0.5 && z < 8) continue; const s = 0.04 + rnd() * 0.2; rocks.small.push({ p: [x, s * 0.25, z], r: [rnd() * 6, rnd() * 6, rnd() * 6], s: [s, s * 0.6, s], c: rockColor().map((v) => v * 0.9) }); }

  // 中心广场铺装（降落点）
  { plazaTex.map.repeat.set(5, 5); const pg = new THREE.PlaneGeometry(34, 34); pg.rotateX(-Math.PI / 2); pg.translate(0, 0.02, 0);
    const plaza = new THREE.Mesh(pg, new THREE.MeshStandardMaterial({ map: plazaTex.map, normalMap: plazaTex.normalMap, roughness: 0.9 })); plaza.receiveShadow = true; scene.add(plaza); }
  // ---------- 道路 ----------
  const roadMat = new THREE.MeshStandardMaterial({ map: asph.map, normalMap: asph.normalMap, roughness: 0.93 });
  const roadGeos = [];
  for (let k = -4; k <= 3; k++) {
    const c = k * B + B / 2;
    const gx = new THREE.PlaneGeometry(9 * B, roadW); gx.rotateX(-Math.PI / 2); gx.translate(0, 0.03, c); roadGeos.push(gx);
    const gz = new THREE.PlaneGeometry(roadW, 9 * B); gz.rotateX(-Math.PI / 2); gz.translate(c, 0.035, 0); roadGeos.push(gz);
  }
  const east = new THREE.PlaneGeometry(900, 11, 450, 1); east.rotateX(-Math.PI / 2); east.translate(207 + 450, 0, 0);
  const ep = east.attributes.position; for (let i = 0; i < ep.count; i++) ep.setY(i, terrainHeight(ep.getX(i), ep.getZ(i)) + 0.05);
  roadGeos.push(east);
  const roads = new THREE.Mesh(mergeGeometries(roadGeos), roadMat);
  // 平面 UV 按世界坐标重写，保证沥青纹理密度一致
  { const p = roads.geometry.attributes.position, uv = roads.geometry.attributes.uv; for (let i = 0; i < p.count; i++) uv.setXY(i, p.getX(i) / 12, p.getZ(i) / 12); }
  roads.receiveShadow = true; scene.add(roads);
  // 东侧公路标线
  const lineMat = new THREE.MeshStandardMaterial({ color: 0xd8d4c8, roughness: 0.8 });
  for (let x = 215; x < 1100; x += 9) { if (Math.abs(x - CITY.roadBlockX) < 22) continue; put(lineMat, new THREE.PlaneGeometry(4, 0.18).rotateX(-Math.PI / 2), mtx(x, terrainHeight(x, 0) + 0.07, 0)); }

  // ---------- 东侧公路：塌方和救援车辆 ----------
  const bx = CITY.roadBlockX;
  pile(bx, 0, 16, 7, 1300, { sx: 0.8, sz: 1.5, slabs: 1, rebar: 0.3, keepAll: true });
  for (let k = 0; k < 8; k++) rocks.slab.push({ p: [bx + (rnd() - 0.5) * 18, 0.4 + rnd() * 0.8, (rnd() - 0.5) * 10], r: [(rnd() - 0.5) * 0.7, rnd() * 6, (rnd() - 0.5) * 0.7], s: [2 + rnd() * 2, 0.25, 1.5 + rnd() * 1.5] }); // 掀起的路面
  standing(bx - 6, 24, 16, 12, 10, { broken: true });
  collapsed(bx + 4, -26, 18, 14, 14);
  // 电线杆（部分倾倒）
  const poleGeo = new THREE.CylinderGeometry(0.14, 0.18, 9, 8);
  for (let x = 220; x < 900; x += 32) {
    const lean = Math.abs(x - bx) < 40 ? 0.6 + rnd() * 0.5 : (rnd() - 0.5) * 0.08;
    const y = terrainHeight(x, -7.5);
    put(M.gunmetal, poleGeo.clone(), mtx(x, y + 4.5 * Math.cos(lean), -7.5 - 4.5 * Math.sin(lean), -lean, 0, 0));
  }
  // 树
  const trunkMat = new THREE.MeshStandardMaterial({ color: 0x4b3f33, roughness: 1 }), leafMat = new THREE.MeshStandardMaterial({ color: 0x5d6447, roughness: 1, flatShading: true });
  for (let k = 0; k < 120; k++) {
    const x = 215 + rnd() * 800, side = rnd() < 0.5 ? -1 : 1, z = side * (10 + rnd() * 30);
    if (Math.abs(x - bx) < 30) continue;
    const y = terrainHeight(x, z), s = 0.7 + rnd() * 0.8;
    put(trunkMat, new THREE.CylinderGeometry(0.15 * s, 0.25 * s, 3 * s, 6), mtx(x, y + 1.5 * s, z));
    const ico = new THREE.IcosahedronGeometry(2.2 * s, 1); put(leafMat, ico, mtx(x, y + 4 * s, z, 0, rnd() * 3, 0, 1, 0.85 + rnd() * 0.3, 1));
  }

  const carBody = mergeGeometries([new THREE.BoxGeometry(4.2, 0.75, 1.8).translate(0, 0.65, 0), new THREE.BoxGeometry(2.2, 0.6, 1.6).translate(-0.2, 1.3, 0)]);
  const carWheel = new THREE.CylinderGeometry(0.34, 0.34, 0.24, 12).rotateX(Math.PI / 2);
  // ---------- 救援车辆（被塌方挡住，警灯闪烁） ----------
  const sirens = [];
  const vehicle = (x, z, ry, kind) => {
    const v = createVehicle(kind, carWheel); v.group.position.set(x, terrainHeight(x, z), z); v.group.rotation.y = ry; scene.add(v.group);
    sirens.push({ red: v.red, blue: v.blue, ph: sirens.length * 0.37 }); return v.group;
  };
  // 车头朝西（-x），停在塌方东侧
  vehicle(326, 2.2, -Math.PI / 2, 'fire'); vehicle(338, -2.6, -Math.PI / 2 + 0.08, 'fire'); vehicle(352, 2.0, -Math.PI / 2 - 0.05, 'ambulance');
  // ---------- 汽车（压扁/蒙尘） ----------
  const cars = [], carColors = [[0.75, 0.75, 0.73], [0.55, 0.56, 0.58], [0.45, 0.12, 0.1], [0.16, 0.22, 0.35], [0.12, 0.12, 0.13], [0.62, 0.58, 0.5]];
  for (let k = 0; k < 70; k++) {
    const along = (rnd() - 0.5) * 9 * B, lane = (Math.floor(rnd() * 8) - 4) * B + B / 2 + (rnd() < 0.5 ? -3 : 3);
    const xz = rnd() < 0.5 ? [along, lane] : [lane, along];
    if (Math.hypot(xz[0], xz[1] - 9) < 22) continue;
    const crush = rnd() < 0.35 ? 0.45 + rnd() * 0.3 : 1;
    cars.push({ x: xz[0], z: xz[1], ry: (xz[0] === along ? 0 : Math.PI / 2) + (rnd() - 0.5) * 0.6, crush, tilt: (rnd() - 0.5) * (crush < 1 ? 0.25 : 0.04), c: carColors[Math.floor(rnd() * carColors.length)] });
  }
  // 降落点附近一辆被砸的车
  cars.push({ x: -9, z: 2, ry: 0.4, crush: 0.55, tilt: 0.12, c: [0.75, 0.75, 0.73] });
  const carMat = new THREE.MeshStandardMaterial({ roughness: 0.55, metalness: 0.35 });
  const carIM = new THREE.InstancedMesh(carBody, carMat, cars.length), wheelIM = new THREE.InstancedMesh(carWheel, M.rubber, cars.length * 4);
  cars.forEach((c, k) => {
    const m = mtx(c.x, 0, c.z, c.tilt, c.ry, c.tilt * 0.5, 1, c.crush, 1); carIM.setMatrixAt(k, m);
    const dust = 0.7; carIM.setColorAt(k, srgb(lerp(0.6, c.c[0], dust), lerp(0.57, c.c[1], dust), lerp(0.52, c.c[2], dust)));
    [[1.3, 0.85], [1.3, -0.85], [-1.3, 0.85], [-1.3, -0.85]].forEach(([wx, wz], q) => wheelIM.setMatrixAt(k * 4 + q, m.clone().multiply(mtx(wx, 0.34, wz))));
  });
  for (const im of [carIM, wheelIM]) { im.castShadow = im.receiveShadow = true; scene.add(im); }

  // ---------- 合并静态几何 ----------
  for (const [mat, tiles] of bins) for (const [, geos] of tiles) {
    const mesh = new THREE.Mesh(mergeGeometries(geos.map((g) => (g.index ? g.toNonIndexed() : g))), mat);
    mesh.castShadow = mat !== moundMat && mat !== lineMat; mesh.receiveShadow = true; scene.add(mesh);
  }

  // ---------- 瓦砾实例化 ----------
  // 混凝土碎块：细分立方体＋按位置确定的位移，棱角分明
  const rockGeo = (segs, seed) => {
    const g = new THREE.BoxGeometry(1, 1, 1, segs, segs, segs).toNonIndexed(); const p = g.attributes.position;
    const f = (x, y, z) => 0.16 * Math.sin(5.1 * x + seed) * Math.sin(4.3 * y + seed * 2.1) * Math.sin(3.7 * z + seed * 0.7) + 0.08 * Math.sin(11 * x + 13 * z + seed);
    for (let i = 0; i < p.count; i++) { const x = p.getX(i), y = p.getY(i), z = p.getZ(i); const l = Math.hypot(x, y, z) || 1; const d = f(x, y, z) - 0.1 * Math.max(0, Math.abs(x) + Math.abs(y) + Math.abs(z) - 1.2); p.setXYZ(i, x + x / l * d, y + y / l * d, z + z / l * d); }
    g.computeVertexNormals(); return g;
  };
  const inst = (geo, mat, list, colored, cast = true, geoNear = null) => {
    const groups = new Map();
    for (const o of list) { const near = geoNear && Math.hypot(o.p[0], o.p[2] - 2) < 30; const key = tileOf(o.p[0], o.p[2]) + (near ? 'n' : ''); if (!groups.has(key)) groups.set(key, []); groups.get(key).push(o); }
    for (const [key, items] of groups) {
      const im = new THREE.InstancedMesh(key.endsWith('n') ? geoNear : geo, mat, items.length);
      items.forEach((o, k) => { im.setMatrixAt(k, mtx(o.p[0], o.p[1], o.p[2], o.r[0], o.r[1], o.r[2], o.s[0], o.s[1], o.s[2])); if (colored) im.setColorAt(k, srgb(...(o.c || [0.6, 0.58, 0.55]))); });
      im.computeBoundingSphere(); im.castShadow = cast; im.receiveShadow = true; scene.add(im);
    }
  };
  inst(rockGeo(1, 3), rockMat, rocks.big, true, true, rockGeo(3, 3));
  inst(rockGeo(1, 4), rockMat, rocks.small, true, false, rockGeo(2, 4));
  inst(new THREE.BoxGeometry(1, 1, 1), slabMat, rocks.slab, false, true);
  inst(new THREE.CylinderGeometry(0.016, 0.016, 1, 5).translate(0, 0.5, 0), M.rebar, rocks.rebar, false, false);
  inst(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ color: 0x5c4339, roughness: 0.95 }), rocks.brick, false, false);

  // ---------- 基站 ----------
  const dock = createDock(); dock.root.position.copy(CITY.dock); dock.root.rotation.y = -0.9; scene.add(dock.root);
  { // 山顶的碎石和枯草丛
    const stones = [], tufts = [];
    for (let i = 0; i < 900; i++) {
      const a = rnd() * 6.28, r = 3.6 + Math.pow(rnd(), 0.7) * 40, x = CITY.dock.x + Math.cos(a) * r, z = CITY.dock.z + Math.sin(a) * r, y = terrainHeight(x, z);
      if (rnd() < 0.6) { const s2 = 0.06 + rnd() * 0.3; stones.push({ p: [x, y + s2 * 0.2, z], r: [rnd() * 6, rnd() * 6, rnd() * 6], s: [s2, s2 * 0.6, s2 * 0.9], c: [0.36, 0.35, 0.33].map((v) => v * (0.75 + rnd() * 0.3)) }); }
      else tufts.push({ p: [x, y, z], r: [0, rnd() * 6, 0], s: [0.5 + rnd() * 0.6, 0.35 + rnd() * 0.5, 0.5 + rnd() * 0.6], c: [0.5, 0.45, 0.3].map((v) => v * (0.75 + rnd() * 0.4)) });
    }
    const tuftGeo = mergeGeometries([0, 1, 2].map((k) => new THREE.PlaneGeometry(0.6, 0.6).translate(0, 0.3, 0).rotateY(k * Math.PI / 3)));
    const tuftMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1, side: THREE.DoubleSide, alphaTest: 0.5, map: (() => { const c = document.createElement('canvas'); c.width = c.height = 128; const x = c.getContext('2d'); x.strokeStyle = '#d8cfa6'; for (let k = 0; k < 40; k++) { x.lineWidth = 1 + Math.random() * 2; x.beginPath(); const bx = 64 + (Math.random() - 0.5) * 50; x.moveTo(bx, 128); x.quadraticCurveTo(bx + (Math.random() - 0.5) * 30, 70, bx + (Math.random() - 0.5) * 60, Math.random() * 40); x.stroke(); } const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t; })() });
    const put2 = (geo, mat, list, cast) => { const im = new THREE.InstancedMesh(geo, mat, list.length); list.forEach((o, k) => { im.setMatrixAt(k, mtx(o.p[0], o.p[1], o.p[2], o.r[0], o.r[1], o.r[2], o.s[0], o.s[1], o.s[2])); im.setColorAt(k, srgb(...o.c)); }); im.castShadow = cast; im.receiveShadow = true; scene.add(im); };
    put2(rockGeo(1, 9), rockMat, stones, true);
  }

  // ---------- 烟柱与浮尘 ----------
  const smokeTex = smokeSprite(4), dustTex = softSprite(64);
  const fx = [];
  for (const [sx, sz, s] of [[-84, -60, 1], [64, 112, 0.8], [136, -100, 1.2], [-150, 90, 0.7]]) {
    const plume = createParticles({ count: 50, seed: sx * 7 + sz, map: smokeTex, color: 0x3d3935, opacity: 0.7, size: [8 * s, 14 * s], life: [22, 30], grow: 2.4,
      spawn: (r) => [sx + (r() - 0.5) * 6, 2 + r() * 3, sz + (r() - 0.5) * 6], vel: (r) => [1.6 + r() * 0.8, 2.6 + r() * 1.2, 0.4 + (r() - 0.5) * 0.6] });
    scene.add(plume); fx.push(plume);
  }
  const motes = createParticles({ count: 700, seed: 5, map: dustTex, color: 0xffd2a0, opacity: 0.5, size: [0.03, 0.07], life: [8, 14], grow: 0.2, additive: true,
    spawn: (r) => [(r() - 0.5) * 40, r() * 8, 9 + (r() - 0.5) * 40], vel: (r) => [0.25 + r() * 0.2, (r() - 0.4) * 0.12, (r() - 0.5) * 0.15] });
  scene.add(motes); fx.push(motes);
  // 旋翼下洗扬尘（降落、起飞时打开）
  const downwash = createParticles({ count: 260, seed: 13, map: smokeTex, color: 0x6e665c, opacity: 0, size: [0.6, 1.3], life: [1.4, 2.4], grow: 2.2,
    spawn: (r) => { const a = r() * 6.28, rr = r() * 1.2; return [Math.cos(a) * rr, 0.15, Math.sin(a) * rr]; },
    vel: (r) => { const a = r() * 6.28, v = 2 + r() * 3; return [Math.cos(a) * v, 0.3 + r() * 0.6, Math.sin(a) * v]; } });
  scene.add(downwash); fx.push(downwash);

  const api = {
    scene, sun, hemi, dock, downwash, motes, fx, terrain, dome, sirens,
    setSirens(t, on = 1) { for (const sr of sirens) { const k = (t * 2.2 + sr.ph) % 1; sr.red.emissiveIntensity = on * (k < 0.25 ? 30 : 0.5); sr.blue.emissiveIntensity = on * (k > 0.5 && k < 0.75 ? 30 : 0.5); } },
    groundY: terrainHeight,
    // 阴影范围跟随镜头关注点
    shadowFocus(x, y, z, size = 60) {
      sun.target.position.set(x, y, z); sun.position.set(x + SUN_DIR.x * 500, y + SUN_DIR.y * 500, z + SUN_DIR.z * 500);
      Object.assign(sun.shadow.camera, { left: -size, right: size, top: size, bottom: -size, near: 50, far: 1200 }); sun.shadow.camera.updateProjectionMatrix();
    },
    update(t, cam, H) {
      fx.forEach((p) => { p.userData.update(t, scene, cam, H); if (DEBUG.has('nofx')) p.visible = false; });
      dome.userData.follow(cam, t); if (DEBUG.has('nosky')) dome.visible = false;
    },
  };
  api.shadowFocus(0, 0, 0, 60);
  return api;
}
