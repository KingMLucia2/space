// 灾区白模沙盘（three.js）：布局数据沿用第三版（cityData.js），构建一次、按 60 米分块合并几何体（视锥外的块自动跳过）。
// · 地面：城区道路贴图（沥青、路沿、虚线），城外是带等高线的白色地形；通往塌方路段的公路沿地形铺设；
// · 楼体：白色哑光、按世界坐标画出淡灰窗格；倾斜楼、残墙、楼顶残块；
// · 瓦砾：每堆一个不规则土丘＋碎块，散落楼板、钢筋（锈色）；汽车、树、地面裂缝；
// · 动态：地震前的完整楼体（开场倒塌用）、火光（橙色核心＋光晕）、烟柱（深灰柔光粒子）、被困者标记（红色光柱与脉冲环，救出后变绿）。
import { THREE, scene, mkCanvas, COL, dyn } from '../engine.js';
import { M, mesh, rbox } from '../mats.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { CITY, terrainHeight, buildCity, SMOKE, VEH } from './cityData.js';
import { buildCityDetail, buildOutskirts } from './detail.js';
import { mulberry32, clamp, lerp, smooth, makeNoise2D } from '../util.js';
export { CITY, terrainHeight, SMOKE };

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const TILE = 60;
// 开场动画（顶点着色器）：uGrowT 楼体按离中心距离依次长出；uQT 地震后瓦砾按离震中距离依次隆起（未到时整块隐藏）
export const ANIM = { uGrowT: { value: 999 }, uQT: { value: 999 }, uQc: { value: new THREE.Vector2(-40, -60) } };
const GROW_V = `float dly = 0.2 + 1.9 * clamp(length(vec2(transformed.x, transformed.z + 20.0)) / 330.0, 0.0, 1.0); transformed.y *= smoothstep(dly, dly + 0.9, uGrowT);`;
const QUAKE_V = `float dq = length(transformed.xz - uQc) / 150.0; float qk = smoothstep(0.35, 1.0, clamp((uQT - dq) / 1.3, 0.0, 1.0)); transformed.y = mix(0.0, transformed.y, qk); if (qk < 0.01) transformed = vec3(0.0, -2000.0, 0.0);`;
function animated(m, code) { const prev = m.onBeforeCompile; m.onBeforeCompile = (sh) => { if (prev) prev(sh); Object.assign(sh.uniforms, ANIM); sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nuniform float uGrowT; uniform float uQT; uniform vec2 uQc;').replace('#include <begin_vertex>', '#include <begin_vertex>\n' + code); }; return m; }
// 白模材质：楼体带窗格（世界坐标），其余为哑光白/浅灰
function windowMat(base, grow = true) {
  const m = new THREE.MeshStandardMaterial({ color: base, roughness: 0.88 });
  m.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vWP; varying vec3 vWN;').replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvWP = (modelMatrix * vec4(transformed, 1.0)).xyz; vWN = normalize(mat3(modelMatrix) * objectNormal);');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vWP; varying vec3 vWN;').replace('#include <color_fragment>', `#include <color_fragment>
      if (abs(vWN.y) < 0.5 && vWP.y > 0.6) { float u = abs(vWN.x) > abs(vWN.z) ? vWP.z : vWP.x; float fy = fract(vWP.y / 3.2), fu = fract(u / 4.0);
        float w = step(0.3, fy) * step(fy, 0.78) * step(0.22, fu) * step(fu, 0.78); diffuseColor.rgb *= 1.0 - 0.17 * w; }`);
  };
  return grow ? animated(m, GROW_V) : m;
}
// 透视（探测时瓦砾变透明）：在 xPos 周围半径 xR 内按 4×4 抖动丢弃像素，余下部分带一点青色
export const XR = { xPos: { value: new THREE.Vector3() }, xR: { value: 6 }, xK: { value: 0 }, xF: { value: 0.62 } };
function xrayable(m) { const prev = m.onBeforeCompile; m.onBeforeCompile = (sh) => { if (prev) prev(sh); Object.assign(sh.uniforms, XR);
  sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vXW;').replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvXW = (modelMatrix * vec4(transformed, 1.0)).xyz;');
  sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>
    varying vec3 vXW; uniform vec3 xPos; uniform float xR; uniform float xK; uniform float xF;
    float bayer4(vec2 p){ int x = int(mod(p.x, 4.0)), y = int(mod(p.y, 4.0)); int i = x + y * 4; float m[16]; m[0]=0.;m[1]=8.;m[2]=2.;m[3]=10.;m[4]=12.;m[5]=4.;m[6]=14.;m[7]=6.;m[8]=3.;m[9]=11.;m[10]=1.;m[11]=9.;m[12]=15.;m[13]=7.;m[14]=13.;m[15]=5.; for (int k = 0; k < 16; k++) if (k == i) return (m[k] + 0.5) / 16.0; return 0.5; }`).replace('#include <color_fragment>', `#include <color_fragment>
    float xin = xK * (1.0 - smoothstep(xR * 0.55, xR, length(vXW.xz - xPos.xz))); if (bayer4(gl_FragCoord.xy) < xin * xF) discard; diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.55, 0.82, 0.96), xin * 0.6 * step(xF, 0.99));`); }; m.customProgramCacheKey = () => 'xray' + (m.name || ''); return m; }
export function setXray(x, z, r, k, f = 0.62) { XR.xPos.value.set(x, 0, z); XR.xR.value = r; XR.xK.value = k; XR.xF.value = f; }
const MAT = { bld: windowMat('#e8e4dd'), wall: new THREE.MeshStandardMaterial({ color: '#ddd8d0', roughness: 0.9 }), rubble: animated(xrayable(new THREE.MeshStandardMaterial({ color: '#d6d0c6', roughness: 0.95, vertexColors: true, name: 'rubble' })), QUAKE_V),
  mound: animated(new THREE.MeshStandardMaterial({ color: '#d6d0c6', roughness: 0.95, vertexColors: true }), QUAKE_V),
  slab: animated(xrayable(new THREE.MeshStandardMaterial({ color: '#d9d4cc', roughness: 0.9, name: 'slab' })), QUAKE_V), rebar: animated(xrayable(new THREE.MeshStandardMaterial({ color: '#8a5a3c', roughness: 0.7, metalness: 0.3, name: 'rebar' })), QUAKE_V), car: new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.6, vertexColors: true }),
  tree: new THREE.MeshStandardMaterial({ color: '#dfe3d6', roughness: 0.9 }), crack: animated(new THREE.MeshBasicMaterial({ color: '#7d7469' }), QUAKE_V) };
function bake(g, pos, rot = [0, 0, 0], scl = [1, 1, 1], color) { const c = g.index ? g.toNonIndexed() : g.clone(); c.applyMatrix4(new THREE.Matrix4().compose(V(...pos), new THREE.Quaternion().setFromEuler(new THREE.Euler(rot[0], rot[1], rot[2], 'YXZ')), V(...scl))); for (const k of Object.keys(c.attributes)) if (!['position', 'normal'].includes(k)) c.deleteAttribute(k); if (color) { const n = c.attributes.position.count, a = new Float32Array(n * 3); for (let i = 0; i < n; i++) a.set(color, i * 3); c.setAttribute('color', new THREE.BufferAttribute(a, 3)); } return c; }
// 按块收集几何体，最后每块每种材质合并成一个网格
class Tiles { constructor() { this.m = new Map(); } add(mat, x, z, g) { const k = `${Math.floor(x / TILE)},${Math.floor(z / TILE)}`; let t = this.m.get(k); if (!t) this.m.set(k, (t = new Map())); let L = t.get(mat); if (!L) t.set(mat, (L = [])); L.push(g); }
  build(group, shadow = true) { for (const t of this.m.values()) for (const [mat, L] of t) { const g = mergeGeometries(L, false); g.computeBoundingSphere(); const m = new THREE.Mesh(g, mat); m.castShadow = shadow; m.receiveShadow = true; group.add(m); } } }

let C = null, ROOT = null;
const BOX = new THREE.BoxGeometry(1, 1, 1), ROCK = new THREE.IcosahedronGeometry(1, 0), TET = new THREE.TetrahedronGeometry(1, 0);
export function buildCityMeshes() {
  if (ROOT) return ROOT; C = buildCity(); ROOT = new THREE.Group(); ROOT.name = 'city'; dyn(ROOT);
  const T = new Tiles(), T2 = new Tiles(); const R = mulberry32(404); const N = makeNoise2D(9); // T：投影的大件；T2：只接收阴影的碎件
  // 楼体
  for (const b of C.B) {
    const pos = [b.x, b.h / 2, b.z]; const lean = new THREE.Matrix4().compose(V(b.x, 0, b.z), new THREE.Quaternion().setFromEuler(new THREE.Euler(b.rx || 0, b.ry || 0, b.rz || 0, 'YXZ')), V(1, 1, 1));
    const g = BOX.clone().toNonIndexed(); g.deleteAttribute('uv'); g.applyMatrix4(new THREE.Matrix4().makeScale(b.w, b.h, b.d)); g.applyMatrix4(new THREE.Matrix4().makeTranslation(0, b.h / 2, 0)); g.applyMatrix4(lean); T.add(b.wall ? MAT.wall : MAT.bld, b.x, b.z, g); void pos;
    if (b.broken) for (const k of b.broken) { const gk = BOX.clone().toNonIndexed(); gk.deleteAttribute('uv'); gk.applyMatrix4(new THREE.Matrix4().makeScale(k.w, k.h, k.d)); gk.applyMatrix4(new THREE.Matrix4().makeTranslation(0, k.h / 2, 0)); gk.applyMatrix4(new THREE.Matrix4().compose(V(k.ox, b.h, k.oz), new THREE.Quaternion().setFromEuler(new THREE.Euler(k.rx || 0, 0, k.rz || 0, 'YXZ')), V(1, 1, 1))); gk.applyMatrix4(lean); T.add(MAT.bld, b.x, b.z, gk); }
  }
  // 瓦砾堆：不规则土丘＋碎块（灰度略有变化）
  for (const p of C.piles) {
    const mound = new THREE.SphereGeometry(1, 14, 7, 0, Math.PI * 2, 0, Math.PI / 2).toNonIndexed(); mound.deleteAttribute('uv'); const pa = mound.attributes.position;
    for (let i = 0; i < pa.count; i++) { const x = pa.getX(i), y = pa.getY(i), z = pa.getZ(i); const n = 1 + 0.22 * N(x * 2 + p.cx, z * 2 + p.cz); pa.setXYZ(i, x * p.r * p.sx * n, Math.pow(Math.max(0, y), 2.6) * p.h * 0.8 * (1 + 0.12 * N(x * 3 + p.cz, z * 3 + p.cx)), z * p.r * p.sz * n); }
    mound.computeVertexNormals(); const shade = 0.93 + R() * 0.05; const col = new Float32Array(pa.count * 3).fill(shade); mound.setAttribute('color', new THREE.BufferAttribute(col, 3)); mound.translate(p.cx, 0, p.cz); T2.add(MAT.mound, p.cx, p.cz, mound);
  }
  for (const c of C.cloud) { const a = c.arr; const step = a.length / 3 > 2000 ? 5 : 4; for (let i = 0; i < a.length / 3; i += step) { const s = 0.18 + Math.pow(R(), 2.2) * 0.9; const shade = 0.78 + R() * 0.17; T2.add(MAT.rubble, a[i * 3], a[i * 3 + 2], bake(R() < 0.3 ? ROCK : TET, [a[i * 3], a[i * 3 + 1] + s * 0.3, a[i * 3 + 2]], [R() * 6, R() * 6, R() * 6], [s * (0.8 + R() * 0.6), s * (0.5 + R() * 0.4), s * (0.8 + R() * 0.6)], [shade, shade * 0.99, shade * 0.97])); } }
  for (const s of C.slabs) T2.add(MAT.slab, s.x, s.z, bake(BOX, [s.x, s.y, s.z], [s.rx, s.ry, s.rz], [s.w, 0.25, s.d]));
  for (const r of C.rebar) { const a = V(r[0], r[1], r[2]), b = V(r[3], r[4], r[5]); const L = a.distanceTo(b); const q = new THREE.Quaternion().setFromUnitVectors(V(0, 1, 0), b.clone().sub(a).normalize()); const g = BOX.clone().toNonIndexed(); g.deleteAttribute('uv'); g.applyMatrix4(new THREE.Matrix4().compose(a.clone().add(b).multiplyScalar(0.5), q, V(0.05, L, 0.05))); T2.add(MAT.rebar, r[0], r[2], g); }
  for (const pts of C.cracks) for (let i = 0; i + 1 < pts.length; i++) { const a = pts[i], b = pts[i + 1]; const L = Math.hypot(b[0] - a[0], b[2] - a[2]); const ang = Math.atan2(b[0] - a[0], b[2] - a[2]); T2.add(MAT.crack, a[0], a[2], bake(BOX, [(a[0] + b[0]) / 2, 0.03, (a[2] + b[2]) / 2], [0, ang, 0], [0.35 + 0.25 * Math.sin(i), 0.02, L])); }
  // 场景细节（人行道、路灯、行道树、红绿灯、斑马线、汽车、街面碎屑、楼顶设备、广场街具；城外公路、山林、塌方警戒）
  const DM = { matte: animated(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.86 }), GROW_V), gloss: animated(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.34 }), GROW_V),
    metal: animated(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.42, metalness: 0.5 }), GROW_V), glass: animated(new THREE.MeshStandardMaterial({ color: '#2b3139', roughness: 0.12, metalness: 0.4 }), GROW_V),
    decal: animated(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }), GROW_V), rubble: MAT.rubble };
  const DO = { matte: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.86 }), gloss: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.34 }), metal: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.42, metalness: 0.5 }),
    glass: DM.glass, decal: DM.decal, rubble: MAT.rubble };
  const dmats = { plaza: (map) => new THREE.MeshStandardMaterial({ map, roughness: 0.9, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 }), sign: (map) => new THREE.MeshStandardMaterial({ map, roughness: 0.6 }) };
  buildCityDetail(C, (k, x, z, g, cast) => (cast ? T : T2).add(DM[k], x, z, g), ROOT, dmats);
  buildOutskirts(C, (k, x, z, g, cast) => (cast ? T : T2).add(DO[k], x, z, g), ROOT, dmats);
  T.build(ROOT); T2.build(ROOT, false);
  // 地面：城区道路贴图
  const gc = mkCanvas(2048, 2048), g = gc.getContext('2d'); const S = 2048 / 460, X = (x) => (x + 230) * S;
  g.fillStyle = '#e3ded6'; g.fillRect(0, 0, 2048, 2048);
  for (let k = -4; k <= 3; k++) { const c = k * CITY.block + CITY.block / 2; g.fillStyle = '#cfc9bf'; g.fillRect(0, X(c - 6), 2048, 12 * S); g.fillRect(X(c - 6), 0, 12 * S, 2048); }
  g.fillStyle = '#f1eee8'; g.fillRect(X(-17), X(-17), 34 * S, 34 * S); // 中央广场
  g.strokeStyle = 'rgba(255,255,255,0.9)'; g.lineWidth = 1.5; g.setLineDash([3.5 * S, 4.5 * S]);
  for (let k = -4; k <= 3; k++) { const c = X(k * CITY.block + CITY.block / 2); g.beginPath(); g.moveTo(0, c); g.lineTo(2048, c); g.moveTo(c, 0); g.lineTo(c, 2048); g.stroke(); }
  g.setLineDash([]); g.strokeStyle = 'rgba(120,112,100,0.25)'; g.lineWidth = 1; for (let k = -5; k <= 4; k++) { const c = X(k * CITY.block + CITY.block / 2); for (const sd of [-6.3, 6.3]) { g.beginPath(); g.moveTo(0, c + sd * S); g.lineTo(2048, c + sd * S); g.moveTo(c + sd * S, 0); g.lineTo(c + sd * S, 2048); g.stroke(); } }
  const gt = new THREE.CanvasTexture(gc); gt.colorSpace = THREE.SRGBColorSpace; gt.anisotropy = 4;
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(460, 460).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ map: gt, roughness: 0.95 })); ground.position.y = 0.01; ground.receiveShadow = true; ROOT.add(ground);
  // 城外地形：白色，按高度画等高线
  const tg = new THREE.PlaneGeometry(2400, 2200, 200, 184).rotateX(-Math.PI / 2); tg.translate(300, 0, 0); const tp = tg.attributes.position;
  for (let i = 0; i < tp.count; i++) tp.setY(i, terrainHeight(tp.getX(i), tp.getZ(i)) - (Math.abs(tp.getX(i)) < 231 && Math.abs(tp.getZ(i)) < 231 ? 0.05 : 0)); tg.computeVertexNormals();
  const tm = new THREE.MeshStandardMaterial({ color: '#ece8e1', roughness: 0.95 });
  tm.onBeforeCompile = (sh) => { sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vWP2;').replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvWP2 = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vWP2;').replace('#include <color_fragment>', '#include <color_fragment>\nfloat hh = vWP2.y / 4.0; float fw = fwidth(hh); float ln = 1.0 - smoothstep(0.0, fw * 1.2, abs(fract(hh + 0.5) - 0.5)); diffuseColor.rgb *= 1.0 - 0.22 * ln * step(0.3, vWP2.y); float pn = sin(vWP2.x * 0.031 + sin(vWP2.z * 0.023) * 2.0) * sin(vWP2.z * 0.027 + sin(vWP2.x * 0.019) * 2.0) + 0.5 * sin(vWP2.x * 0.11 + vWP2.z * 0.07) * sin(vWP2.z * 0.13 - vWP2.x * 0.05); diffuseColor.rgb *= 0.975 + 0.03 * pn;'); };
  const terr = new THREE.Mesh(tg, tm); terr.receiveShadow = true; ROOT.add(terr);
  // 通往塌方路段的公路（沿地形）
  const rp = [], rn = []; for (let x = 207; x < 1100; x += 6) { const y0 = terrainHeight(x, 0) + 0.08, y1 = terrainHeight(x + 6, 0) + 0.08; rp.push(x, y0, -5.5, x + 6, y1, -5.5, x + 6, y1, 5.5, x, y0, -5.5, x + 6, y1, 5.5, x, y0, 5.5); for (let k = 0; k < 6; k++) rn.push(0, 1, 0); }
  const rg = new THREE.BufferGeometry(); rg.setAttribute('position', new THREE.Float32BufferAttribute(rp, 3)); rg.setAttribute('normal', new THREE.Float32BufferAttribute(rn, 3)); const road = new THREE.Mesh(rg, new THREE.MeshStandardMaterial({ color: '#d4cfc6', roughness: 0.95 })); road.receiveShadow = true; ROOT.add(road);
  const dash = []; for (let x = 209; x < 1100; x += 8) { if (Math.abs(x - CITY.roadBlockX) < 22) continue; dash.push(bake(BOX, [x + 1.7, terrainHeight(x + 1.7, 0) + 0.1, 0], [0, 0, 0], [3.4, 0.02, 0.18])); }
  ROOT.add(new THREE.Mesh(mergeGeometries(dash), new THREE.MeshBasicMaterial({ color: '#ffffff' })));
  buildDynamic(); return ROOT;
}
// 地表高度（瓦砾土丘表面，没有土丘处为地面）：救援镜头里让担架和队员落在土丘上
const _rc = new THREE.Raycaster(); let MOUNDS = null;
export function surfaceY(x, z) { buildCityMeshes(); if (!MOUNDS) { ROOT.updateMatrixWorld(true); MOUNDS = []; ROOT.traverse((o) => { if (o.isMesh && o.material === MAT.mound) MOUNDS.push(o); }); }
  _rc.set(V(x, 100, z), V(0, -1, 0)); const h = _rc.intersectObjects(MOUNDS, false); return h.length ? h[0].point.y : 0.01; }
export function showCity(on = true) { buildCityMeshes(); ROOT.visible = on; }

// —— 动态部分 ——
let GH = null, FIRE = null, SMK = null, MARK = null, DEB = null;
const softC = mkCanvas(64, 64); { const g = softC.getContext('2d'); const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.5, 'rgba(255,255,255,0.45)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, 64, 64); }
const SOFT = new THREE.CanvasTexture(softC);
function buildDynamic() {
  // 地震前的完整楼体（每栋一个网格，只在开场用）
  const ghostMat = windowMat('#e8e4dd', false); GH = C.ghosts.map((g) => { const m = new THREE.Mesh(BOX, ghostMat); m.castShadow = m.receiveShadow = true; m.visible = false; ROOT.add(m); return { g, m }; });
  // 火光：橙色核心（不受光照）＋柔光
  FIRE = C.fires.map(([x, y, z, s, ph]) => { const grp = new THREE.Group(); grp.position.set(x, y, z); const core = new THREE.Mesh(new THREE.ConeGeometry(0.45 * s, 1.4 * s, 7), new THREE.MeshBasicMaterial({ color: '#ff7a2a' })); core.position.y = 0.6 * s; grp.add(core);
    const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: SOFT, color: '#ff8a3a', transparent: true, opacity: 0.55, depthWrite: false })); halo.scale.set(5 * s, 5 * s, 1); halo.position.y = 0.8 * s; grp.add(halo); ROOT.add(grp); return { grp, core, halo, s, ph }; });
  // 烟柱：深灰柔光粒子
  const n = SMOKE.length * 260; const pos = new Float32Array(n * 3), sz = new Float32Array(n), al = new Float32Array(n);
  const sg = new THREE.BufferGeometry(); sg.setAttribute('position', new THREE.BufferAttribute(pos, 3)); sg.setAttribute('size', new THREE.BufferAttribute(sz, 1)); sg.setAttribute('alpha', new THREE.BufferAttribute(al, 1));
  const smat = new THREE.ShaderMaterial({ uniforms: { map: { value: SOFT }, scale: { value: 540 }, fogColor: { value: new THREE.Color(COL.bg) }, fogNear: { value: 60 }, fogFar: { value: 900 } }, transparent: true, depthWrite: false,
    vertexShader: 'attribute float size; attribute float alpha; uniform float scale; varying float vA; varying float vD; void main(){ vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_Position = projectionMatrix * mv; gl_PointSize = min(900.0, size * scale / -mv.z); vA = alpha; vD = -mv.z; }',
    fragmentShader: 'uniform sampler2D map; uniform vec3 fogColor; uniform float fogNear; uniform float fogFar; varying float vA; varying float vD; void main(){ vec4 t = texture2D(map, gl_PointCoord); float f = smoothstep(fogNear, fogFar, vD); vec3 c = mix(vec3(0.42, 0.41, 0.40), fogColor, f * 0.85); gl_FragColor = vec4(c, t.a * vA * (1.0 - f * 0.6)); }' });
  SMK = new THREE.Points(sg, smat); SMK.frustumCulled = false; ROOT.add(SMK);
  // 掉落碎块与扬尘（开场）
  const dn = 6000; const dg = new THREE.BufferGeometry(); dg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(dn * 3), 3)); dg.setAttribute('size', new THREE.BufferAttribute(new Float32Array(dn), 1)); dg.setAttribute('alpha', new THREE.BufferAttribute(new Float32Array(dn), 1));
  DEB = new THREE.Points(dg, smat.clone()); DEB.material.uniforms.map.value = SOFT; DEB.frustumCulled = false; DEB.visible = false; ROOT.add(DEB);
  // 被困者标记：光柱＋脉冲环＋球
  MARK = CITY.survivors.map(([x, z]) => { const grp = new THREE.Group(); grp.position.set(x, 0, z); const mat = new THREE.MeshBasicMaterial({ color: COL.red, transparent: true }); const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.25, 1, 10, 1, true), mat); grp.add(beam);
    const ball = new THREE.Mesh(new THREE.SphereGeometry(1, 20, 14), mat); grp.add(ball); const ring = new THREE.Mesh(new THREE.RingGeometry(0.9, 1, 48).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: COL.red, transparent: true, depthWrite: false, side: THREE.DoubleSide })); grp.add(ring);
    const ring2 = ring.clone(); ring2.material = ring.material.clone(); grp.add(ring2); grp.visible = false; ROOT.add(grp); return { grp, mat, beam, ball, ring, ring2 }; });
}
// 每帧：t 全片时间；o.quake(x,z) → {c,tau}（开场用），o.fire/smoke 透明度，o.marks(i) → 0 无 / 0~1 出现 / 1~2 变绿，o.markH 光柱高度
export function updateCity(t, o = {}) {
  buildCityMeshes(); ROOT.visible = true; const Q = o.quake; ANIM.uGrowT.value = o.growT ?? 999; ANIM.uQT.value = o.quakeT ?? 999;
  const gT = o.growT ?? 999; for (const { g, m } of GH) { if (!Q) { m.visible = false; continue; } const { c } = Q(g.x, g.z); if (c >= 0.97) { m.visible = false; continue; } const dly = 0.2 + 1.9 * clamp(Math.hypot(g.x, g.z + 20) / 330); const gk = smooth((gT - dly) / 0.9); const hv = lerp(g.h, g.low, Math.pow(c, 1.6)) * gk; m.visible = hv > 0.3; m.scale.set(g.w, hv, g.d); m.position.set(g.x, hv / 2, g.z); m.rotation.set(0.05 * c * Math.sin(g.x), 0, 0.06 * c * Math.cos(g.z)); }
  const fa = o.fire ?? 1; for (const F of FIRE) { const k = (Q ? smooth((Q(F.grp.position.x, F.grp.position.z).c - 0.4) / 0.5) : 1) * fa; F.grp.visible = k > 0.02; if (!F.grp.visible) continue; const fl = 0.75 + 0.25 * Math.sin(t * (7 + F.ph * 5) + F.ph * 20); F.core.scale.set(k, k * fl, k); F.halo.material.opacity = 0.5 * k * fl; }
  // 烟柱粒子
  const sa = o.smoke ?? 1; SMK.visible = sa > 0.01; if (SMK.visible) { const P = SMK.geometry.attributes.position, Sz = SMK.geometry.attributes.size, A = SMK.geometry.attributes.alpha; const R = mulberry32(9); let i = 0;
    for (const [sx, sz2, s] of SMOKE) { const k0 = Q ? smooth((Q(sx, sz2).c - 0.3) / 0.6) : 1; for (let k = 0; k < 260; k++, i++) { const life = 16 + R() * 10, ph = R(); const age = (t + ph * life) % life; const u = age / life; const ang = R() * 6.283, rr = Math.sqrt(R()) * (2 + u * 22 * s);
      P.setXYZ(i, sx + Math.cos(ang) * rr + age * 1.6 * s, 2 + age * (2.6 + R() * 1.2) * s, sz2 + Math.sin(ang) * rr + age * 0.5); Sz.setX(i, (5 + u * 26) * s); A.setX(i, 0.22 * sa * k0 * smooth(u / 0.08) * (1 - u)); } }
    P.needsUpdate = Sz.needsUpdate = A.needsUpdate = true; }
  // 被困者标记
  for (let i = 0; i < MARK.length; i++) { const Mk = MARK[i]; const st = o.marks ? o.marks(i) : 0; Mk.grp.visible = st > 0.001; if (!Mk.grp.visible) continue;
    const ap = clamp(st), gr = clamp(st - 1); const col = gr > 0.5 ? COL.green : COL.red; Mk.mat.color.set(col); Mk.ring.material.color.set(col); Mk.ring2.material.color.set(col);
    const H = o.markH ?? 26, sc = o.markS ?? 1; Mk.beam.scale.set(sc, H * smooth(ap), sc); Mk.beam.position.y = H * smooth(ap) / 2; Mk.mat.opacity = 0.85 * ap; Mk.ball.scale.setScalar(1.6 * sc * (0.6 + 0.4 * smooth(ap))); Mk.ball.position.y = H * smooth(ap);
    const ph = (t * 0.8 + i * 0.37) % 1, ph2 = (ph + 0.5) % 1; Mk.ring.scale.setScalar((2 + 9 * ph) * sc); Mk.ring.material.opacity = (1 - ph) * ap; Mk.ring.position.y = 0.3; Mk.ring2.scale.setScalar((2 + 9 * ph2) * sc); Mk.ring2.material.opacity = (1 - ph2) * ap; Mk.ring2.position.y = 0.3; }
  // 开场碎块与扬尘
  DEB.visible = !!o.debris; if (o.debris) o.debris(DEB.geometry);
  SMK.material.uniforms.fogNear.value = DEB.material.uniforms.fogNear.value = o.fogNear ?? 60; SMK.material.uniforms.fogFar.value = DEB.material.uniforms.fogFar.value = o.fogFar ?? 900;
}
export function cityData() { buildCityMeshes(); return C; }
export function ghostList() { buildCityMeshes(); return C.ghosts; }
export function hideCity() { if (ROOT) ROOT.visible = false; }
