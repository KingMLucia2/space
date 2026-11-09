// 第四版镜头表：沿用第三版 29 个镜头的时间轴与旁白（146.4 秒），片尾字幕后接封面镜头 s30。
// 所有动画都是全片绝对时间 T 的函数；同一地点相邻镜头共用连续的相机路径；界面层（任务仿真仪表盘）随任务阶段变化。
import { THREE, scene, W, H, COL, setCam, setCamYPR, setShadow, CS, setLook, FOG, TILT, project, cam, mkCanvas, dyn, pool, renderGL, glCanvas, hideDyn } from './engine.js';
import { HALLS, HALL, hallPt } from './models/hall.js';
import { M, mesh, glowSprite, span } from './mats.js';
import { drawDrone, rotorSpin, DRONE } from './models/hexacopter.js';
import { drawHexapod, standFeet, gaitFeet, HEX } from './models/hexapod.js';
import { updateCity, CITY, terrainHeight, cityData, setXray, surfaceY } from './models/city.js';
import { BASE, DOCK, dockTop, drawVehicles, HELI, drawHuman, STRETCHER, AIRPORT, CREVICE, VICTIM_M, PAYLOADS } from './models/props.js';
import { drawUI, callout, cursorArrow, STAGES, stageAt, FONT, MONO, tabCenter } from './ui.js';
import { clamp, lerp, range, smooth, smoother, easeIn, easeOut, shake, mulberry32 } from './util.js';

const DURS = [['s01', 7], ['s02', 4], ['s03', 3.5], ['s04', 3], ['s05', 4], ['s06', 3], ['s07', 4], ['s08', 3], ['s09', 3.5], ['s10', 2.5], ['s11', 4], ['s12', 4], ['s13', 3.5], ['s14', 3],
  ['s15', 6], ['s16', 5], ['s17', 3], ['s18', 4], ['s19', 3.5], ['s20', 3], ['s21', 4], ['s22', 5], ['s23', 6.4], ['s24', 3.5], ['s25', 4], ['s26', 8], ['s27', 5], ['s28', 8], ['s29', 26], ['s30', 6]];
export const T0 = {}; { let a = 0; for (const [id, d] of DURS) { T0[id] = a; a += d; } }

// —— 向量与相机工具 ——
const vl = (a, b, k) => [lerp(a[0], b[0], k), lerp(a[1], b[1], k), lerp(a[2], b[2], k)];
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const sc = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
const lerpLog = (a, b, k) => Math.exp(lerp(Math.log(a), Math.log(b), k));
const hash3 = (x, y, z) => { const s = Math.sin(x * 12.9898 + y * 78.233 + z * 37.719) * 43758.5453; return s - Math.floor(s); };
function yp(pos, tgt) { const d = [tgt[0] - pos[0], tgt[1] - pos[1], tgt[2] - pos[2]]; const l = Math.hypot(d[0], d[1], d[2]); return [Math.atan2(-d[0], -d[2]), Math.asin(d[1] / l)]; }
function mkKeys(keys) { let py = null; return keys.map((k) => { const a = k.a || yp(k.p, k.look); let yaw = a[0]; if (py !== null) yaw = py + wrap(yaw - py); py = yaw; return { T: k.T, v: [...k.p, yaw, a[1], k.f], m: k.m }; }); }
function spline(K, T) {
  if (T <= K[0].T) return K[0].v.slice(); if (T >= K[K.length - 1].T) return K[K.length - 1].v.slice();
  let i = 0; while (T > K[i + 1].T) i++; const a = K[i], b = K[i + 1], dt = b.T - a.T, s = (T - a.T) / dt;
  const tan = (j) => { const k = K[j]; if (k.m) return k.m; if (j === 0 || j === K.length - 1) return k.v.map(() => 0); return k.v.map((_, c) => (K[j + 1].v[c] - K[j - 1].v[c]) / (K[j + 1].T - K[j - 1].T)); };
  const ma = tan(i), mb = tan(i + 1); const s2 = s * s, s3 = s2 * s; const h00 = 2 * s3 - 3 * s2 + 1, h10 = s3 - 2 * s2 + s, h01 = -2 * s3 + 3 * s2, h11 = s3 - s2;
  return a.v.map((_, c) => h00 * a.v[c] + h10 * dt * ma[c] + h01 * b.v[c] + h11 * dt * mb[c]);
}
const camV = (v) => setCamYPR([v[0], v[1], v[2]], v[3], v[4], 0, v[5]);
function fog(near, far) { FOG.near = near; FOG.far = far; }
function fogFor(h) { const k = smooth(range(Math.log(Math.max(h, 0.1)), Math.log(2), Math.log(300))); fog(lerp(30, 600, k), lerp(260, 2600, k)); }

// —— 设备与场景常量 ——
const HANG_Y = DRONE.latchY - HEX.topY - 0.015;
const COMB_REST = 0.393; // 结合体落在平台上时无人机中心离台面的高度（起落架收起，由六足机器人收起的腿着地）
const LAND = CITY.landing;
const WALK0 = T0.s12 - 1.0;
function walkBody(T) { const tau = T - WALK0; if (tau <= 0) return { x: LAND[0], z: LAND[2], heading: Math.PI }; if (tau <= 5) return { x: 0.06 * tau, z: 6.5 - 0.85 * tau, heading: Math.PI }; const u = Math.min(tau - 5, 1.2); return { x: 0.3 + 0.06 * u - 0.025 * u * u, z: 2.25 - (0.85 * u - 0.354 * u * u), heading: Math.PI }; }
const REST = walkBody(1e6);
const VICTIM = [CITY.survivors[0][0], 0.05, CITY.survivors[0][1]];
const ROUTE = [[0, 0.06, 6.5], [0.05, 0.06, 5.2], [0.18, 0.06, 3.6], [0.3, 0.06, 2.25], [REST.x, 0.06, REST.z]];
const restPose = (o = {}) => ({ x: REST.x, y: o.y ?? HEX.standH, z: REST.z, heading: Math.PI, pitch: o.pitch || 0 });
const restFeet = () => standFeet({ x: REST.x, z: REST.z, heading: Math.PI });
const DF = [Math.sin(DOCK.ry), 0, Math.cos(DOCK.ry)], DS = [Math.cos(DOCK.ry), 0, -Math.sin(DOCK.ry)];
const dockAt = (f, s, up) => add(add(add(CITY.dock, sc(DF, f)), sc(DS, s)), [0, up, 0]);
const lightT = (T) => smooth(range(T, T0.s04 + 0.3, T0.s04 + 0.7)), openT = (T) => smooth(range(T, T0.s04 + 0.7, T0.s04 + 2.9)), liftT = (T) => smooth(range(T, T0.s06, T0.s06 + 1.4));
const DEVICES = { hex: [REST.x, 0.24, REST.z], drone: [-30, 25, 20] };
const HOVER = [REST.x, 2.8, REST.z];
const GOD = { pos: [0, 505, -7], fov: 40 }; // 拉高到 505 米：8 个被困者红点全部落在大屏完整界面的空白区内，不被卡片挡住
const LAST = 7, GREEN_ORDER = [6, 4, 3, 2, 1, 5];
const DOT_T = [0, 5.02, 5.14, 5.26, 5.38, 5.5, 5.62, 5.74];
const GREEN = '#1fa968';
function combined(P, heading, pitch, roll, rot, T, ringK = 1.2, o = {}) { const d = drawDrone({ pos: P, heading, pitch, roll, rot, t: T, ring: ringK, ...o }); drawHexapod({ parent: d.g, local: [0, HANG_Y, 0], fold: 1 }); return d; }
function base(T, open, lift, lights = 1) { return BASE.get().update(CITY.dock, open, lift, T, lights) && BASE.items[BASE.used - 1]; }

// —— 三维特效（对象池） ——
const FXP = { ring: pool(() => { const m = new THREE.Mesh(new THREE.RingGeometry(0.97, 1, 96).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, side: THREE.DoubleSide, fog: false })); m.renderOrder = 3; return dyn(m); }),
  line: pool(() => { const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(600 * 3), 3)); const l = new THREE.Line(g, new THREE.LineDashedMaterial({ transparent: true, depthWrite: false, dashSize: 1, gapSize: 0, fog: false })); l.frustumCulled = false; l.renderOrder = 4; return dyn(l); }),
  tri: pool(() => { const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(9), 3)); const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, side: THREE.DoubleSide, fog: false })); m.frustumCulled = false; m.renderOrder = 2; return dyn(m); }),
  pts: pool(() => { const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(2000 * 3), 3)); const p = new THREE.Points(g, new THREE.PointsMaterial({ size: 3, sizeAttenuation: false, transparent: true, depthWrite: false, fog: false })); p.frustumCulled = false; p.renderOrder = 6; return dyn(p); }) };
function fxRing(c, r, color, opacity, width = 0.03) { if (opacity <= 0.005 || r <= 0) return; const m = FXP.ring.get(); m.visible = true; m.position.set(c[0], c[1], c[2]); m.scale.set(r, 1, r); m.material.color.set(color); m.material.opacity = opacity; const inner = clamp(1 - width / r, 0.5, 0.995); if (m.userData.inner !== inner) { m.geometry.dispose(); m.geometry = new THREE.RingGeometry(inner, 1, 96).rotateX(-Math.PI / 2); m.userData.inner = inner; } }
function fxLine(pts, color, opacity = 1, dash = null, progress = 1) { if (opacity <= 0.005 || pts.length < 2) return; const l = FXP.line.get(); l.visible = true; const P = l.geometry.attributes.position; let total = 0; const segs = []; for (let i = 1; i < pts.length; i++) { const d = Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1], pts[i][2] - pts[i - 1][2]); segs.push(d); total += d; }
  let n = 0, acc = 0; const lim = total * clamp(progress); P.setXYZ(n++, ...pts[0]); for (let i = 1; i < pts.length && n < 600; i++) { if (acc + segs[i - 1] <= lim) { P.setXYZ(n++, ...pts[i]); acc += segs[i - 1]; } else { const u = (lim - acc) / segs[i - 1]; P.setXYZ(n++, ...vl(pts[i - 1], pts[i], u)); break; } }
  l.geometry.setDrawRange(0, n); P.needsUpdate = true; l.computeLineDistances(); l.material.color.set(color); l.material.opacity = opacity; l.material.dashSize = dash ? dash[0] : 1e6; l.material.gapSize = dash ? dash[1] : 0; }
function fxTri(a, b, c, color, opacity) { if (opacity <= 0.005) return; const m = FXP.tri.get(); m.visible = true; const P = m.geometry.attributes.position; P.setXYZ(0, ...a); P.setXYZ(1, ...b); P.setXYZ(2, ...c); P.needsUpdate = true; m.geometry.computeBoundingSphere(); m.material.color.set(color); m.material.opacity = opacity; }
function fxPoints(arr, color, size, opacity) { if (opacity <= 0.005 || !arr.length) return; const p = FXP.pts.get(); p.visible = true; const P = p.geometry.attributes.position; const n = Math.min(2000, arr.length / 3); for (let i = 0; i < n; i++) P.setXYZ(i, arr[i * 3], arr[i * 3 + 1], arr[i * 3 + 2]); p.geometry.setDrawRange(0, n); P.needsUpdate = true; p.material.color.set(color); p.material.size = size; p.material.opacity = opacity; }

// —— 地震冲击波：叠在楼群之上的地面光环（不做深度测试，不会被楼挡住）＋向外扩散、高出楼顶的半透明波墙 ——
const SHOCK_RING_TEX = (() => { const c = mkCanvas(256, 4), g = c.getContext('2d'); const gr = g.createLinearGradient(0, 0, 256, 0); gr.addColorStop(0, 'rgba(255,90,50,0)'); gr.addColorStop(0.55, 'rgba(255,95,55,0.22)'); gr.addColorStop(0.9, 'rgba(240,55,30,1)'); gr.addColorStop(0.97, 'rgba(255,170,120,1)'); gr.addColorStop(1, 'rgba(255,90,50,0)'); g.fillStyle = gr; g.fillRect(0, 0, 256, 4); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t; })();
const SHOCK_WALL_TEX = (() => { const c = mkCanvas(4, 256), g = c.getContext('2d'); const gr = g.createLinearGradient(0, 0, 0, 256); gr.addColorStop(0, 'rgba(255,90,50,0)'); gr.addColorStop(0.6, 'rgba(255,85,45,0.16)'); gr.addColorStop(1, 'rgba(235,60,30,0.5)'); g.fillStyle = gr; g.fillRect(0, 0, 4, 256); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t; })();
const SHOCK = pool(() => { const N = 160, g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(new Float32Array((N + 1) * 2 * 3), 3)); const uv = new Float32Array((N + 1) * 2 * 2); for (let k = 0; k <= N; k++) { uv[k * 4] = 0; uv[k * 4 + 1] = 0.5; uv[k * 4 + 2] = 1; uv[k * 4 + 3] = 0.5; } g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  const idx = []; for (let k = 0; k < N; k++) { const a = k * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); } g.setIndex(idx);
  const ring = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ map: SHOCK_RING_TEX, transparent: true, depthTest: false, depthWrite: false, side: THREE.DoubleSide, fog: false, toneMapped: false })); ring.frustumCulled = false; ring.renderOrder = 30;
  const wall = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 1, 160, 1, true), new THREE.MeshBasicMaterial({ map: SHOCK_WALL_TEX, transparent: true, depthWrite: false, side: THREE.DoubleSide, fog: false, toneMapped: false })); wall.renderOrder = 29;
  const grp = new THREE.Group(); grp.add(ring, wall); grp.userData = { ring, wall, N }; return dyn(grp); });
const QFLASH = pool(() => { const f = glowSprite('#ff4a24', 1, 1, false); f.material.depthTest = false; f.renderOrder = 31; return dyn(f); });
function shockwave(cx, cz, R, a, width = 9, wallH = 62) { if (a <= 0.01 || R <= 1) return; const grp = SHOCK.get(); grp.visible = true; const { ring, wall, N } = grp.userData; const P = ring.geometry.attributes.position; const r0 = Math.max(0, R - width);
  for (let k = 0; k <= N; k++) { const th = k / N * Math.PI * 2, c = Math.cos(th), s2 = Math.sin(th); P.setXYZ(k * 2, cx + c * r0, 1.0, cz + s2 * r0); P.setXYZ(k * 2 + 1, cx + c * R, 1.0, cz + s2 * R); } P.needsUpdate = true; ring.material.opacity = a;
  wall.position.set(cx, wallH / 2, cz); wall.scale.set(R, wallH, R); wall.material.opacity = a * 0.9; }
// 热成像扫描窗：被困者埋在约 1.5 米深的瓦砾堆下，窗口贴在被困者所在高度、不做深度测试（像镜头一样压在瓦砾之上），深色底＋网格刻度＋青色边框＋扫掠扇区；
// 窗口周围的表层碎块按视线与瓦砾表面的交点做透视抖动，让窗口边缘像是穿透瓦砾
const SCAN_TEX = (() => { const c = mkCanvas(512, 512), g = c.getContext('2d'); const gr = g.createRadialGradient(256, 256, 0, 256, 256, 256); gr.addColorStop(0, '#1f3443'); gr.addColorStop(1, '#0c171f'); g.fillStyle = gr; g.beginPath(); g.arc(256, 256, 256, 0, 7); g.fill();
  g.save(); g.beginPath(); g.arc(256, 256, 248, 0, 7); g.clip(); g.strokeStyle = 'rgba(95,212,255,0.14)'; g.lineWidth = 1.5; for (let x = 0; x <= 512; x += 32) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, 512); g.moveTo(0, x); g.lineTo(512, x); g.stroke(); } g.restore();
  g.strokeStyle = 'rgba(95,212,255,0.38)'; g.lineWidth = 2; g.setLineDash([10, 8]); for (const r of [86, 170]) { g.beginPath(); g.arc(256, 256, r, 0, 7); g.stroke(); } g.setLineDash([]);
  g.strokeStyle = 'rgba(95,212,255,0.8)'; for (let i = 0; i < 72; i++) { const a = i / 72 * Math.PI * 2, L = i % 6 === 0 ? 24 : 11; g.lineWidth = i % 6 === 0 ? 3 : 2; g.beginPath(); g.moveTo(256 + Math.cos(a) * 250, 256 + Math.sin(a) * 250); g.lineTo(256 + Math.cos(a) * (250 - L), 256 + Math.sin(a) * (250 - L)); g.stroke(); }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; return t; })();
const SWEEP_TEX = (() => { const c = mkCanvas(512, 512), g = c.getContext('2d'); const cg = g.createConicGradient(0, 256, 256); cg.addColorStop(0, 'rgba(120,220,255,0.34)'); cg.addColorStop(0.1, 'rgba(120,220,255,0.07)'); cg.addColorStop(0.2, 'rgba(120,220,255,0)'); cg.addColorStop(1, 'rgba(120,220,255,0)'); g.fillStyle = cg; g.beginPath(); g.arc(256, 256, 246, 0, 7); g.fill(); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t; })();
const SCANWIN = pool(() => { const g = new THREE.Group(); const circ = new THREE.CircleGeometry(1, 72).rotateX(-Math.PI / 2);
  const disc = new THREE.Mesh(circ, new THREE.MeshBasicMaterial({ map: SCAN_TEX, transparent: true, depthWrite: false, depthTest: false, fog: false })); disc.renderOrder = 16; g.add(disc);
  const sweep = new THREE.Mesh(circ, new THREE.MeshBasicMaterial({ map: SWEEP_TEX, transparent: true, depthWrite: false, depthTest: false, fog: false, blending: THREE.AdditiveBlending })); sweep.position.y = 0.004; sweep.renderOrder = 17; g.add(sweep);
  const rim = new THREE.Mesh(new THREE.RingGeometry(0.982, 1.0, 120).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: '#5fd4ff', transparent: true, depthWrite: false, depthTest: false, fog: false })); rim.position.y = 0.006; rim.renderOrder = 18; g.add(rim); g.userData = { disc, rim, sweep }; return dyn(g); });
function scanWindow(c, k, T, r0 = 1.05) { if (k <= 0.01) return 0; const g = SCANWIN.get(); g.visible = true; g.position.set(c[0], 0.035, c[2]); const r = r0 * (0.55 + 0.45 * smooth(k)); g.scale.set(r, 1, r); const u = g.userData; u.disc.material.opacity = 0.92 * k; u.rim.material.opacity = k; u.sweep.material.opacity = k; u.sweep.rotation.y = -T * 2.6; return r; }
function lensCenter(c, y = 1.4) { const p = cam.position; const k = clamp((p.y - y) / Math.max(1e-3, p.y - c[1])); return [p.x + (c[0] - p.x) * k, y, p.z + (c[2] - p.z) * k]; }

// —— 有粗细的光束（细圆柱，按两点摆放）、带透明渐变的扇面：扫描线、雷达锥、路径线用（1 像素的线在成片里看不清） ——
const SCAN = '#0f9df0'; // 扫描类特效统一用的亮青蓝
const BEAM = pool(() => { const m = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 1, 8, 1, true), new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, toneMapped: false, fog: false })); m.renderOrder = 8; m.frustumCulled = false; return dyn(m); });
function beam(a, b, r, color, opacity = 1, onTop = false) { if (opacity <= 0.01) return; const m = BEAM.get(); m.visible = true; span(m, a, b, r, r); m.material.color.set(color); m.material.opacity = opacity; m.material.depthTest = !onTop; m.renderOrder = onTop ? 26 : 8; }
function dashBeam(pts, r, color, opacity, dash, gap, progress = 1, onTop = false) { let acc = 0, total = 0; const L = []; for (let i = 1; i < pts.length; i++) { const d = Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1], pts[i][2] - pts[i - 1][2]); L.push(d); total += d; } const lim = total * clamp(progress);
  for (let i = 1; i < pts.length; i++) { const a = pts[i - 1], b = pts[i], d = L[i - 1]; for (let u = 0; u < d; u += dash + gap) { const s0 = acc + u; if (s0 > lim) return; const e = Math.min(d, u + dash, lim - acc); if (e <= u) continue; beam(vl(a, b, u / d), vl(a, b, e / d), r, color, opacity, onTop); } acc += d; } }
const FAN = pool(() => { const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(9), 3)); g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(12), 4)); const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false, side: THREE.DoubleSide, toneMapped: false, fog: false })); m.frustumCulled = false; m.renderOrder = 7; return dyn(m); });
function fan(apex, b0, b1, color, aApex, aBase) { if (aBase <= 0.005) return; const m = FAN.get(); m.visible = true; const P = m.geometry.attributes.position, Cc = m.geometry.attributes.color; P.setXYZ(0, ...apex); P.setXYZ(1, ...b0); P.setXYZ(2, ...b1); const c = new THREE.Color(color); Cc.setXYZW(0, c.r, c.g, c.b, aApex); Cc.setXYZW(1, c.r, c.g, c.b, aBase); Cc.setXYZW(2, c.r, c.g, c.b, aBase); P.needsUpdate = Cc.needsUpdate = true; m.geometry.computeBoundingSphere(); }
// 生命探测雷达锥：雷达面板 → 前方地面的扇形波束（渐变扇面＋两条边线＋地面弧线），波纹沿波束向前推进
function radarCone(o, dir, T, a, len = 4.8, half = 0.42) { if (a <= 0.01) return; const base = (ang, r) => [o[0] + Math.sin(dir + ang) * r, 0.08, o[2] + Math.cos(dir + ang) * r];
  const n = 6; for (let i = 0; i < n; i++) fan(o, base(-half + 2 * half * i / n, len), base(-half + 2 * half * (i + 1) / n, len), SCAN, 0.04 * a, 0.3 * a);
  beam(o, base(-half, len), 0.018, SCAN, 0.9 * a); beam(o, base(half, len), 0.018, SCAN, 0.9 * a);
  const arc = (r, op) => { const P = []; for (let i = 0; i <= 18; i++) P.push(base(-half + 2 * half * i / 18, r)); for (let i = 1; i < P.length; i++) beam(P[i - 1], P[i], 0.025, SCAN, op); }; arc(len, 0.9 * a);
  for (let k = 0; k < 3; k++) { const ph = ((T * 0.9 + k / 3) % 1); arc(0.4 + ph * (len - 0.4), a * (1 - ph) * 0.85); } }
// 疑似生命信号标识：贴在瓦砾表面的醒目橙红圆环（不被遮挡）、竖直信标线与菱形标、外扩脉冲
function suspectMarker(c, y, T, a) { if (a <= 0.01) return; const top = [c[0], y + 3.2, c[2]]; beam([c[0], y, c[2]], top, 0.05, COL.red, a, true);
  const P = []; for (let i = 0; i <= 48; i++) { const th = i / 48 * Math.PI * 2; P.push([c[0] + Math.cos(th) * 1.4, y + 0.1, c[2] + Math.sin(th) * 1.4]); } for (let i = 1; i < P.length; i++) beam(P[i - 1], P[i], 0.07, COL.red, a, true);
  for (let k = 0; k < 2; k++) { const ph = (T * 0.8 + k / 2) % 1; const Q = []; for (let i = 0; i <= 48; i++) { const th = i / 48 * Math.PI * 2, r = 1.4 + ph * 2.6; Q.push([c[0] + Math.cos(th) * r, y + 0.1, c[2] + Math.sin(th) * r]); } for (let i = 1; i < Q.length; i++) beam(Q[i - 1], Q[i], 0.04, COL.red, a * (1 - ph) * 0.8, true); }
  const d = 0.32; const D = [[0, d * 1.4, 0], [d, 0, 0], [0, -d * 1.4, 0], [-d, 0, 0]].map((v) => add(top, v)); for (let i = 0; i < 4; i++) beam(D[i], D[(i + 1) % 4], 0.045, COL.red, a, true); }
function circlePts(c, r, n = 64) { const a = []; for (let k = 0; k <= n; k++) { const t = k / n * Math.PI * 2; a.push([c[0] + Math.cos(t) * r, c[1], c[2] + Math.sin(t) * r]); } return a; }
function scanRings(c, T, radius = 3.4, alpha = 1, color = SCAN) { for (let i = 0; i < 3; i++) { const ph = ((T * 0.55 + i / 3) % 1 + 1) % 1; fxRing(c, 0.15 + ph * radius, color, alpha * (1 - ph) * 0.95, 0.1); } }
function downwash(c, T, k, s = 1) { if (k <= 0.01) return; for (let i = 0; i < 3; i++) { const ph = (T * 1.6 + i / 3) % 1; fxRing([c[0], c[1] + 0.03, c[2]], (0.5 + ph * 2.6) * s, '#8a8378', k * (1 - ph) * 0.5, 0.05 * s); }
  const p = []; const R = mulberry32(17); for (let i = 0; i < 260; i++) { const a = R() * 6.283, r0 = R(), sp = R(), h = R(); const u = ((T * (0.6 + sp) + r0) % 1); const r = (0.4 + u * 3.2) * s; p.push(c[0] + Math.cos(a) * r, c[1] + 0.04 + h * 0.35 * u * s, c[2] + Math.sin(a) * r); } fxPoints(p, '#9d968b', 2.2, 0.6 * k); }
function routeLine(pts, T, k = 1, alpha = 1) { dashBeam(pts, 0.035, COL.orange, 0.95 * alpha, 0.24, 0.16, k); }
function stream(a, b, lift, T, n = 46, alpha = 1, color = COL.orange, speed = 0.55) { if (alpha <= 0.01) return; const m = [(a[0] + b[0]) / 2, Math.max(a[1], b[1]) + lift, (a[2] + b[2]) / 2]; const arr = [], line = [];
  for (let k = 0; k <= 40; k++) { const u = k / 40; const q = (1 - u) * (1 - u), r = 2 * u * (1 - u), s = u * u; line.push([q * a[0] + r * m[0] + s * b[0], q * a[1] + r * m[1] + s * b[1], q * a[2] + r * m[2] + s * b[2]]); }
  for (let k = 0; k < n; k++) { const u = ((k / n + T * speed) % 1); const q = (1 - u) * (1 - u), r = 2 * u * (1 - u), s = u * u; arr.push(q * a[0] + r * m[0] + s * b[0], q * a[1] + r * m[1] + s * b[1], q * a[2] + r * m[2] + s * b[2]); }
  fxLine(line, color, 0.55 * alpha); fxPoints(arr, color, 5, alpha); }

// —— 界面状态：按全片时间给出遥测数据 ——
const SUBS = (st, T) => {
  const lidar = st >= 3 && st !== 9 ? 'TRACKING' : 'STANDBY', radar = st === 4 ? 'SCANNING' : st >= 5 && st < 9 ? 'LOCKED' : 'STANDBY', latch = (st >= 2 && st < 6) ? 'OPEN' : 'LOCKED', link = st >= 1 ? 'LINKED' : 'STANDBY', baseS = st >= 8 ? 'CHARGING' : st >= 1 ? 'STANDBY' : 'READY';
  const c = (s2) => (s2 === 'STANDBY' || s2 === 'READY' ? '#8a8d93' : s2 === 'OPEN' ? COL.orange : COL.green);
  return [['01', '激光雷达', 'LIDAR · 16 线', lidar, c(lidar)], ['02', '生命探测雷达', 'UWB RADAR · IR', radar, c(radar)], ['03', '对接锁扣', '4 × HOOK · GUIDE CONE', latch, c(latch)], ['04', '中继链路', 'MESH · 5.8 GHZ', link, c(link)], ['05', '基站', '充电 · 通讯 · 防护', baseS, c(baseS)]];
};
function telemetry(T) {
  const st = stageAt(T); const fly = T > T0.s06 + 0.4 && T < T0.s25; const spin = rotorSpin(T, { t0: T0.s06 + 0.15, spinUp: 1.2, t1: T0.s24 + 2.5, spinDown: 1.4 }).speed;
  const rpm = 4800 * spin * (0.94 + 0.06 * Math.sin(T * 3)); const bat = T < T0.s25 ? lerp(96, 61, clamp((T - T0.s06) / (T0.s25 - T0.s06))) : lerp(61, 100, smooth(range(T, T0.s25 + 2.6, T0.s26 + 6)));
  const walking = T > WALK0 && T < T0.s13 + 1.2, standing = (T > T0.s09 + 1.9 && T < T0.s19 + 2.0);
  const legs = [0, 1, 2, 3, 4, 5].map((i) => (standing ? (walking ? 0.45 + 0.3 * Math.max(0, Math.sin(T * 2.0 * Math.PI * 2 + (i % 2) * Math.PI)) : 0.48 + 0.12 * Math.sin(i * 1.7 + T * 0.5)) : 0));
  const alt = T < T0.s06 ? 0 : T < T0.s08 ? lerp(0, 35, smooth(range(T, T0.s06, T0.s07))) : T < T0.s10 ? lerp(35, 0.6, smooth(range(T, T0.s08, T0.s08 + 3))) : T < T0.s18 ? lerp(0.6, 25, smooth(range(T, T0.s10, T0.s11))) : T < T0.s20 ? lerp(25, 2.8, smooth(range(T, T0.s18, T0.s19))) : T < T0.s24 ? lerp(2.8, 40, smooth(range(T, T0.s20, T0.s21))) : lerp(40, 0, smooth(range(T, T0.s24, T0.s24 + 2.6)));
  const found = T < T0.s14 + 0.6 ? 0 : T < T0.s15 + 5.0 ? 1 : Math.min(8, 1 + DOT_T.filter((d, i) => i > 0 && T - T0.s15 > d).length);
  const saved = T < T0.s23 + 2.0 ? 0 : T < T0.s26 ? 1 : Math.min(8, 1 + GREEN_ORDER.filter((i, k) => T - T0.s26 > 0.9 + k * 1.0 + 0.2).length + (T > T0.s27 + 3.6 ? 1 : 0));
  const note = st === 0 ? '待命 · 等待出发指令' : found === 0 ? (st >= 3 ? '扫描中 · 可疑区域 A' : '待命 · 等待探测') : saved === 0 ? (found === 1 ? '01 · 埋深 1.5 m · 心率 92' : `${found} 处坐标已回传指挥中心`) : saved < 8 ? `已救出 ${saved} 人 · 救援进行中` : '全部救出 · 任务完成';
  return { battery: bat, draw: 0.3 + 2.1 * spin, cell: 3.7 + 0.25 * bat / 100, temp: 31 + 9 * spin, rpm, thrust: Math.round(46 * spin), legs, legState: walking ? 'WALKING' : standing ? (st === 4 ? 'SCANNING' : 'HOLDING') : 'FOLDED', hotLeg: 1,
    alt, vs: fly ? 0.4 * Math.sin(T * 0.7) : 0, pitch: fly ? -2 * Math.sin(T * 0.3) : 0, roll: fly ? 0.6 * Math.sin(T * 0.45) : 0, speed: fly ? (st === 1 || st === 7 ? 18 : 2.4) : 0, hdg: 330 + 20 * Math.sin(T * 0.05),
    found, saved, lifeNote: note, subs: SUBS(st, T), subHot: st === 2 || st === 6 ? 2 : st === 3 ? 0 : st === 4 ? 1 : st === 5 ? 3 : st === 8 ? 4 : -1 };
}
// 光标：每次阶段切换前移到下一个标签上点击
function cursorAt(T) {
  for (let i = 1; i < STAGES.length; i++) { const tc = STAGES[i].t0; if (T > tc - 1.1 && T < tc + 1.0) { const [tx, ty] = tabCenter(i);  const from = [tx + 260, ty + 380]; const u = smoother(range(T, tc - 1.1, tc - 0.15)); const away = smooth(range(T, tc + 0.25, tc + 1.0));
    return { x: lerp(from[0], tx, u) + 40 * away, y: lerp(from[1], ty, u) + 70 * away, click: T > tc - 0.1 ? clamp((T - tc + 0.1) / 0.45) : 0, a: smooth(range(T, tc - 1.1, tc - 0.8)) * (1 - smooth(range(T, tc + 0.6, tc + 1.0))) }; } }
  return null;
}
let HUD = null;
function ui(T, o = {}) { if (!HUD) return; drawUI(HUD, { T, tel: telemetry(T), cursor: null, ...o }); } // 不再显示鼠标点击
const label = (p, title, sub, dx, dy, a = 1, col) => callout(HUD, p, title, sub, dx, dy, a, col);

// —— 片尾名单 ——
let CREDITS = null;
async function loadCredits() {
  try { const r = await fetch('/v2/credits.local.json'); if (r.ok) CREDITS = await r.json(); } catch (e) { /* 没有本地名单时用占位 */ }
  if (!CREDITS) CREDITS = { lines: [['导演', '—'], ['编剧', '—'], ['美术设计', '—'], ['程序开发', '—'], ['配乐', '—']], closing: '上天入地，不放弃每一个生命' };
  const txt = CREDITS.lines.flat().join('') + (CREDITS.closing || '');
  await Promise.all(['400', '500', '700', '900'].map((w) => document.fonts.load(`${w} 40px "Noto Sans SC"`, txt))).catch(() => null);
}

// —— 开场地震 ——
const TQ = 3.5, QV = 150, QX = -40, QZ = -60;
function quakeFn(t) { return (x, z) => { const ta = TQ + Math.hypot(x - QX, z - QZ) / QV + hash3(x, 0, z) * 0.25; const tau = t - ta; return { c: clamp(tau / 1.3), tau }; }; }
function debrisFill(t, Q) { return (geom) => { const C = cityData(); const P = geom.attributes.position, S = geom.attributes.size, A = geom.attributes.alpha; let n = 0;
  for (const g of C.ghosts) { const { c: k, tau } = Q(g.x, g.z); if (tau <= 0 || tau > 3.2) continue; const D = g.deb, m = D.length / 4; const sp2 = 1 + 0.35 * tau;
    for (let i = 0; i < m && n < 5800; i++) { const ly = D[i * 4 + 1], e = D[i * 4 + 3]; const t0 = (1 - (ly - g.low) / Math.max(1, g.h - g.low)) * 0.55 * k; const tt = Math.max(0, tau - t0); const yl = 0.3 + e * 2.5; const y = Math.max(yl, ly - 0.5 * 16 * tt * tt); if (tt > 0 && y <= yl && tt > 1.6 + e) continue;
      P.setXYZ(n, g.x + D[i * 4] * sp2, y, g.z + D[i * 4 + 2] * sp2); S.setX(n, 1.2); A.setX(n, 0.85); n++; }
    for (let i = 0; i < 40 && n < 6000; i++) { const a = i / 40 * 6.283 + g.x; const q = Math.max(g.w, g.d) * 0.55 * (1 + 1.6 * tau) * (0.85 + 0.3 * Math.sin(i * 7.1)); P.setXYZ(n, g.x + Math.cos(a) * q, 0.4 + tau * (1.5 + Math.sin(i * 3.3)), g.z + Math.sin(a) * q); S.setX(n, 7 + tau * 4); A.setX(n, 0.3 * (1 - tau / 3.2)); n++; } }
  geom.setDrawRange(0, n); P.needsUpdate = S.needsUpdate = A.needsUpdate = true; }; }

// —— 镜头 ——
const SH = {
  // ———— 一、灾情 ————
  s01: { update(t) { // 仪表盘开机；城市模型从沙盘上依次长出 → 震中地震波扩散 → 楼体坍塌、扬尘、起火
    const T = T0.s01 + t; const k = smoother(t / 7); const qk = smooth(range(t, TQ - 0.1, TQ + 0.15)) * (1 - smooth(range(t, TQ + 1.2, TQ + 3.2))); const sh = shake(t, 1.0 * qk, 3.2, 2);
    setLook('table'); setCam(add(vl([270, 175, 250], [196, 78, 150], k), [sh.x, sh.y, sh.z]), vl([-25, 0, -35], [-18, 4, -28], k), 38); setShadow([-10, 0, -20], 430); fog(260, 1300); TILT.r = 0.45; TILT.k = 0.9;
    const Q = quakeFn(t); updateCity(T, { quake: Q, growT: t, quakeT: t - TQ, fire: 1, smoke: smooth(range(t, TQ + 0.5, TQ + 2.5)), debris: t > TQ ? debrisFill(t, Q) : null, fogNear: 260, fogFar: 1300 });
    if (t > TQ) { const R = (t - TQ) * QV; const a = 1 - smooth(range(t, TQ + 1.8, TQ + 3.0)); shockwave(QX, QZ, R, a); shockwave(QX, QZ, R * 0.62, a * 0.55, 6, 34); const fk = 1 - smooth(range(t, TQ, TQ + 0.9)); if (fk > 0.01) { const f = QFLASH.get(); f.visible = true; f.position.set(QX, 14, QZ); const sz = 50 + 220 * (t - TQ); f.scale.set(sz, sz, 1); f.material.opacity = 0.8 * fk; } } // 主波＋紧随的次波＋震中闪光
    ui(T, { boot: smooth(range(t, 0.15, 2.8)), view: '沙盘 TABLE', word: t < TQ ? '城区沙盘' : '强震 M7.2', sub: t < TQ ? 'SAND TABLE · 1 : 500' : 'EPICENTER · 42 BUILDINGS DOWN' });
    if (t > TQ + 0.6) label(project([QX, 1, QZ]), '震中', 'EPICENTER · M7.2 · 10 KM', -150, -90, smooth(range(t, TQ + 0.6, TQ + 1.2)) * (1 - smooth(range(t, 6.4, 7))));
  } },
  s02: { transIn: { type: 'dissolve', dur: 0.8 }, update(t) { // 被截断的公路：救援车队被塌方堵住，警灯闪烁
    const T = T0.s02 + t; const sh = shake(t, 0.015, 1, 4); setLook('table'); setCam([372 - t * 0.5 + sh.x, 7.0 + sh.y, 19.5], [318, 1.5, 0], 36); setShadow([330, 0, 0], 70); fog(80, 600); TILT.r = 0.42; TILT.k = 0.7;
    updateCity(T, { fogNear: 80, fogFar: 600 }); drawVehicles(T);
    drawHuman({ pos: [318.5, 0, 3.6], heading: -1.75, phase: 0, run: 0 }); drawHuman({ pos: [316.8, 0, -1.8], heading: -1.4, phase: T * 7, run: 0.25, armsUp: true }); drawHuman({ pos: [322, 0, 0.8], heading: -1.6, phase: 1, run: 0 });
    ui(T, { word: '道路中断', sub: 'ROAD BLOCKED · 120 M LANDSLIDE' }); label(project([300, 6, 0]), '塌方阻断', 'LANDSLIDE · 救援车辆无法通行', -120, -110, smooth(range(t, 0.6, 1.2)));
  } },
  s03: { transIn: { type: 'dissolve', dur: 0.6 }, update(t) { // 瓦砾缝隙里亮着的手机：“妈妈 来电”
    const T = T0.s03 + t; const k = smoother(t / 3.5); const sh = shake(t, 0.004, 1.5, 7); const O = [0, -500, 0];
    setLook('table'); cam.near = 0.004; setCam(add(add(O, vl([0.4, 0.32, 0.52], [0.15, 0.15, 0.2], k)), [sh.x, sh.y, sh.z]), add(O, [0.02, 0.01, 0.02]), 38); setShadow(add(O, [0, 0, 0]), 3); fog(2, 9); TILT.r = 0.5; TILT.k = 1.6;
    CREVICE.get().update(O, T); ui(T, { view: '特写 MACRO', word: '废墟之下', sub: 'UNDER THE RUBBLE · SIGNAL WEAK' });
  } },
  // ———— 二、出发 ————
  s04: { transIn: { type: 'wipe', dur: 0.6 }, update(t) { // 远眺高地：基站亮灯、开舱
    const T = T0.s04 + t; const D = CITY.dock; const sh = shake(t, 0.01, 0.8, 9); setLook('table'); cam.near = 40; setCam([300 + sh.x, D[1] + 8 + sh.y, -70], [D[0], D[1] + 1.2, D[2]], 2.9); /* 机位略高于山顶平台，看得到平台上的营地；长焦远景把近裁剪面推远，深度精度够用，营地不闪烁 */ setShadow(D, 14); fog(600, 4000); TILT.on = false;
    updateCity(T, { fogNear: 600, fogFar: 4000 }); const b = BASE.get(); b.update(D, openT(T), 0, T, lightT(T)); const top = b.world([0, dockTop(0) + COMB_REST, 0]);
    combined(top, DOCK.ry, 0, 0, { angle: 0, speed: 0 }, T, 1.2 * lightT(T));
    ui(T, { word: '基站开舱', sub: 'BASE · HATCH OPEN' }); label(project(add(D, [0, 2.6, 0])), '基站', 'BASE · 通讯 · 充电 · 防护', 140, -90, smooth(range(t, 0.5, 1.1)));
  } },
  s05: { transIn: { type: 'tiles', dur: 0.7 }, update(t) { // 棚拍：结合体拆解成爆炸图并标注，再“合为一体”
    const T = T0.s05 + t; const ex = smoother(range(t, 0.25, 1.5)) * (1 - smoother(range(t, 2.9, 3.5))); const a = 0.5 + t * 0.12; const DY = 0.95;
    setLook('studio'); setCam([5.4 * Math.sin(a), 1.75 + ex * 0.35, 5.4 * Math.cos(a)], [0, 0.5, 0], 36); CS.size = 6; CS.opacity = 0.5; fog(30, 80);
    const d = drawDrone({ pos: [0, DY, 0], heading: 0.3, rot: rotorSpin(T, { t0: 200 }), t: T, explode: ex, gear: ex, latch: ex }); // 组装状态收起落架
    const hp = drawHexapod({ parent: d.g, local: [0, HANG_Y - 0.62 * ex, 0], fold: 1 - ex * 0.65, explode: ex, scanner: ex });
    // 轨道线
    for (const [r, y, op] of [[1.9, 0.0, 0.5], [2.35, 0.02, 0.3]]) fxLine(circlePts([0, y, 0], r * (0.9 + 0.1 * ex), 96), '#9b958b', op);
    fxLine(circlePts([0, DY, 0], 1.55 + 0.25 * ex, 96), COL.orange, 0.35 * ex, [0.08, 0.08]);
    const snap = Math.exp(-(((t - 3.35) / 0.08) ** 2)); if (snap > 0.02) fxRing([0, 0.8, 0], 0.6 + (t - 3.2) * 3, COL.orange, snap, 0.05);
    const la = smooth(range(t, 1.2, 1.6)) * (1 - smooth(range(t, 2.8, 3.0)));
    label(project(d.world([0, 0.45, 0])), '六轴无人机', 'HEXACOPTER · 12 KG 载荷', -230, -60, la); label(project(d.world([0.95, 0.5, 0.6])), '电机与折叠桨', '6 × 6010 · 21 IN', 200, -90, la);
    label(project(d.world([0, -0.32, 0])), '通用对接锁扣', 'UNIVERSAL DOCK · 4 HOOKS', 230, 10, la); label(project(hp.world([0, 0.02, 0.4])), '生命探测雷达', 'UWB + IR · 6.0 M', -260, 40, la);
    label(project(hp.world([0.5, -0.05, 0.3])), '六足机器人', 'HEXAPOD · 18 × 20 KG 舵机', 210, 80, la);
    ui(T, { view: '棚拍 STUDIO', word: ex > 0.5 ? '拆解展示' : '合为一体', sub: ex > 0.5 ? 'TEARDOWN · 100% APART' : 'COMBINED · 0% APART' });
  } },
  s06: { transIn: { type: 'wipe', dur: 0.5 }, update(t) { // 平台升起，旋翼启动，结合体起飞
    const T = T0.s06 + t; const lift = liftT(T); const rise = easeIn(range(t, 1.4, 3.0)) * 7; setLook('table'); setCam(dockAt(7.2, -3.0, 0.6), dockAt(0, 0, 1.9 + rise * 0.6), 44); setShadow(CITY.dock, 16); fog(300, 2500); TILT.on = false;
    const b = BASE.get(); b.update(CITY.dock, 1, lift, T, 1); const top = b.world([0, dockTop(lift) + COMB_REST, 0]);
    combined([top[0], top[1] + rise, top[2]], DOCK.ry + rise * 0.02, rise * 0.01, 0, rotorSpin(T, { t0: T0.s06 + 0.15, spinUp: 1.2 }), T);
    downwash([top[0], top[1] - COMB_REST, top[2]], T, range(t, 0.9, 1.5) * (1 - range(rise, 3, 7)), 0.6); updateCity(T, { fogNear: 300, fogFar: 2500 });
    ui(T, { word: '结合出发', sub: 'TAKE-OFF · ROTORS 100%' });
  } },
  s07: { transIn: { type: 'dissolve', dur: 0.4 }, update(t) { // 低空飞越塌方路段与救援车队
    const T = T0.s07 + t; const P = [378 - t * 14, 26 - t * 0.6, -7 + t * 0.6]; const sh = shake(t, 0.06, 1.1, 3); setLook('table'); setCam(add(P, [9.5 + sh.x, 4.0 + sh.y, 8.5]), add(P, [-18, -14, -4]), 48); setShadow(add(P, [-10, -20, 0]), 90); fog(120, 900); TILT.r = 0.5; TILT.k = 0.6;
    combined(P, -Math.PI / 2, 0.2, 0.03 * Math.sin(t), rotorSpin(T, { t0: T0.s06 + 0.15, spinUp: 1.2 }), T); updateCity(T, { fogNear: 120, fogFar: 900 }); drawVehicles(T);
    ui(T, { word: '飞越阻断', sub: 'CRUISE · 18 M/S · ALT 26 M' });
  } },
  // ———— 三、抵达与搜寻 ————
  s08: { transIn: { type: 'dissolve', dur: 0.5 }, update(t) { // 结合体降落在广场
    const T = T0.s08 + t; const a = smoother(range(t, 0, 2.0)), b = smoother(range(t, 1.9, 3.0)); const P = vl([22, 13, -6], [LAND[0], 2.4, LAND[2]], a); P[1] = lerp(P[1], 0.62, b); const sh = shake(t, 0.03, 1.2, 5);
    setLook('table'); setCam([-5.5 + sh.x, 0.9 + sh.y, 12.5], vl([14, 8.5, -2], [0, 1.2, 6.5], smoother(range(t, 0, 2.3))), 42); setShadow([LAND[0], 0, LAND[2]], 30); fog(40, 420); TILT.r = 0.42; TILT.k = 0.5;
    combined(P, lerp(Math.atan2(-22, 12.5), -Math.PI, smooth(range(t, 0.9, 2.7))), (1 - a) * 0.22 - b * 0.05, 0, rotorSpin(T, { t0: 0 }), T); downwash([P[0], 0, P[2]], T, range(4.5 - P[1], 0, 3)); updateCity(T, { fogNear: 40, fogFar: 420 });
    ui(T, { word: '抵达灾区', sub: 'LANDING · CENTRAL PLAZA' });
  } },
  s09: { update(t) { // 落地：六足机器人展开六腿站起，锁扣松开
    const T = T0.s09 + t; const P = [LAND[0], 0.62, LAND[2]]; setLook('table'); setCam([2.35, 0.48, 4.55], [0, 0.42, 6.5], 42); setShadow([LAND[0], 0, LAND[2]], 5); fog(20, 160); TILT.on = false;
    const rot = rotorSpin(T, { t0: 0 }); // 无人机悬停（不落地），六足机器人伸腿着地后再松开锁扣
    const unfold = smooth(range(t, 0.15, 1.35)), latch = smooth(range(t, 1.35, 1.85)); const body = { x: LAND[0], z: LAND[2], heading: Math.PI }; const feet = standFeet(body);
    const d = drawDrone({ pos: P, heading: Math.PI, rot, t: T, latch: t < 1.85 ? latch : 1, ring: 1.2 + latch * 3 * (1 - range(t, 1.85, 2.3)) });
    if (t < 1.85) drawHexapod({ parent: d.g, local: [0, HANG_Y, 0], feet, fold: 1 - unfold }); else drawHexapod({ pose: { x: body.x, y: lerp(0.62 + HANG_Y, HEX.standH, smooth(range(t, 1.95, 3.0))), z: body.z, heading: Math.PI }, feet });
    downwash([P[0], 0, P[2]], T, 0.8); updateCity(T, { fogNear: 20, fogFar: 160 });
    ui(T, { word: '空地分离', sub: `DETACH · LATCH ${t > 1.6 ? 'OPEN' : 'LOCKED'}` }); label(project(d.world([0, -0.18, 0])), '锁扣松开', 'LATCH RELEASE · 0.4 S', 160, -120, smooth(range(t, 1.4, 1.8)) * (1 - smooth(range(t, 3.0, 3.4))));
  } },
  s10: { update(t) { // 无人机升空侦察，六足机器人抬头目送
    const T = T0.s10 + t; const rise = easeIn(range(t, 0.15, 2.5)) * 10; setLook('table'); setCam([1.6, 0.25, 9.6], vl([0, 0.4, 6.3], [0, 0.62 + rise * 0.8, 6.5], smooth(range(t, 0.1, 2.0))), 54); setShadow([LAND[0], 0, LAND[2]], 8); fog(20, 220); TILT.on = false;
    drawDrone({ pos: [LAND[0], 0.62 + rise, LAND[2]], heading: Math.PI, rot: rotorSpin(T, { t0: 0 }), t: T, latch: 1 - range(t, 0.3, 1.0) });
    const lk = smooth(range(t, 0.3, 1.6)); const body = { x: LAND[0], z: LAND[2], heading: Math.PI }; drawHexapod({ pose: { x: body.x, y: HEX.standH, z: body.z, heading: Math.PI, pitch: -0.22 * lk }, feet: standFeet(body) });
    downwash([LAND[0], 0, LAND[2]], T, 1 - range(rise, 1, 6)); updateCity(T, { fogNear: 20, fogFar: 220 });
    ui(T, { word: '空中侦察', sub: 'DRONE UP · ALT 25 M' });
  } },
  s11: { update(t) { // 激光雷达扫描：扇形激光扫过废墟；标出可疑区域、规划路线
    const T = T0.s11 + t; const u = t / 4; const D = [lerp(-1.5, 1.0, u), lerp(17, 19, u), lerp(13, 1, u)]; setLook('table'); setCam([D[0] + 8, D[1] + 5.5, D[2] + 13], [D[0] - 0.5, 6, D[2] - 9], 46); setShadow([0, 0, 0], 50); fog(60, 500); TILT.r = 0.45; TILT.k = 0.5;
    drawDrone({ pos: D, heading: Math.PI, pitch: 0.08, rot: rotorSpin(T, { t0: 0 }), t: T });
    const sw = (t * 0.9) % 1; const zs = D[2] - 2 - 14 * sw, xs = D[0]; const G = [D[0], D[1] - 0.25, D[2] - 0.3]; const fanA = 0.9 * (1 - smooth(range(t, 3.4, 3.9)));
    // 激光扫描面：从机腹扫描头扇形打到地面，扫描线贴着瓦砾表面起伏（始终可见），扫描面带透明渐变，两条边线
    const hmAt = (x, z) => { const rr = Math.hypot(x - 0.5, z + 9.5); return Math.max(0.15, 4.2 * 0.8 * Math.pow(Math.max(0, 1 - Math.min(1, rr / 9.5) ** 2), 1.3)); };
    const SL = []; for (let i = 0; i <= 40; i++) { const x = xs - 15 + 30 * i / 40; SL.push([x, hmAt(x, zs) + 0.12, zs]); }
    for (let i = 0; i < 40; i++) { fan(G, SL[i], SL[i + 1], SCAN, 0.02 * fanA, 0.32 * fanA); beam(SL[i], SL[i + 1], 0.07, SCAN, fanA, true); }
    beam(G, SL[0], 0.03, SCAN, 0.8 * fanA); beam(G, SL[40], 0.03, SCAN, 0.8 * fanA);
    // 扫过区域的点云（扫描结果）
    const front = D[2] - 16; const bright = []; const R2 = mulberry32(5); for (let i = 0; i < 1900; i++) { const a = R2() * 6.283, rr = Math.sqrt(R2()) * 9.5 * (1 + 0.2 * Math.sin(3 * a + 0.5)); const x = 0.5 + Math.cos(a) * rr, z = -9.5 + Math.sin(a) * rr; if (z < front || z < zs) continue; const hm = 4.2 * 0.8 * Math.max(0, 1 - Math.min(1, rr / 9.5) ** 2) ** 1.3; bright.push(x, hm * (0.75 + 0.45 * R2()) + 0.15, z); }
    fxPoints(bright, SCAN, 3.4, 0.95);
    updateCity(T, { fogNear: 60, fogFar: 500 }); const b = walkBody(T); const feet = gaitFeet(T, walkBody, { freq: 2.0, lift: 0.07 }); drawHexapod({ pose: { x: b.x, y: HEX.standH, z: b.z, heading: Math.PI }, feet });
    const zk = smooth(range(t, 2.0, 2.5)); suspectMarker(VICTIM, 1.35, T, zk);
    routeLine(ROUTE, T, smooth(range(t, 2.4, 3.6)));
    ui(T, { word: '空中侦察', sub: 'LIDAR · 2.4 M PTS/S' }); label(project([VICTIM[0], 1.35 + 3.6, VICTIM[2]]), '疑似生命信号', 'ZONE A · 置信度 64%', 150, -60, zk, COL.red); label(project([b.x, 0.2, b.z]), '规划路径', 'PATH · 9.2 M · 坡度 18°', -170, 70, smooth(range(t, 2.6, 3.0)));
  } },
  s12: { update(t) { // 六足机器人沿规划路线在碎石间前行（贴地跟拍）
    const T = T0.s12 + t; const b = walkBody(T); const feet = gaitFeet(T, walkBody, { freq: 2.0, lift: 0.07 }); const sh = shake(t, 0.008, 2, 11); const sk = 1 - smooth(range(t, 2.8, 4)); const c = searchCam(T);
    setLook('table'); setCam(add(c.p, [sh.x * sk, sh.y * sk, 0]), c.look, c.f); setShadow([b.x, 0, b.z], 6); fog(20, 160); TILT.r = 0.42; TILT.k = 0.45;
    drawHexapod({ pose: { x: b.x, y: HEX.standH + 0.008 * Math.sin(T * 4 * Math.PI * 2), z: b.z, heading: Math.PI, roll: 0.02 * Math.sin(T * 2 * Math.PI * 2) }, feet }); routeLine(ROUTE, T, 1, 0.8); updateCity(T, { fogNear: 20, fogFar: 160 });
    ui(T, { word: '地面搜寻', sub: 'GAIT · TRIPOD · 0.85 M/S' });
  } },
  s13: { update(t) { // 停下，展开生命探测雷达，扫描波纹扩散
    const T = T0.s13 + t; const b = walkBody(T); const feet = gaitFeet(T, walkBody, { freq: 2.0, lift: 0.07 }); const c = searchCam(T); setLook('table'); setCam(c.p, c.look, c.f); setShadow([b.x, 0, b.z], 6); fog(20, 160); TILT.r = 0.42; TILT.k = 0.4;
    const dep = smooth(range(t, 0.9, 2.0)); const hp = drawHexapod({ pose: { x: b.x, y: HEX.standH, z: b.z, heading: Math.PI }, feet, scanner: dep });
    scanRings([REST.x, 0.05, REST.z - 0.5], T, 3.6, smooth(range(t, 1.5, 2.3))); routeLine(ROUTE, T, 1, 0.8 * (1 - smooth(range(t, 0.8, 1.8)))); updateCity(T, { fogNear: 20, fogFar: 160 });
    const fa = smooth(range(t, 1.7, 2.5)); if (fa > 0) radarCone(hp.world([0, 0.16, 0.3]), Math.PI, T, fa);
    ui(T, { word: '生命探测', sub: 'UWB RADAR · IR · 6.0 M' }); label(project(hp.world([0, 0.2, 0.25])), '生命探测雷达展开', 'UWB + IR · 穿透 1.5 M', 170, -110, smooth(range(t, 1.4, 1.9)));
  } },
  s14: { update(t) { // 推向瓦砾：废墟透视，显出被困者热源与生命体征
    const T = T0.s14 + t; const v = spline(K_SEARCH, T); setLook('table'); camV(v); setShadow([REST.x, 0, REST.z], 8); fog(20, 160); TILT.r = 0.4; TILT.k = 0.35;
    const hp = drawHexapod({ pose: restPose(), feet: restFeet(), scanner: 1 }); scanRings([REST.x, 0.05, REST.z - 0.5], T, 3.6);
    const xk = smooth(range(t, 0.15, 1.1)), found = smooth(range(t, 0.7, 1.4)); const wr = scanWindow(VICTIM, xk, T), lc = lensCenter(VICTIM); setXray(lc[0], lc[2], Math.max(0.01, wr * 1.3), xk, 0.8); updateCity(T, { fogNear: 20, fogFar: 160 });
    VICTIM_M.get().update(VICTIM, 0.3, xk, T); radarCone(hp.world([0, 0.16, 0.3]), Math.PI, T, 1 - smooth(range(t, 0.15, 0.8))); // 镜头掠过机器人时雷达锥淡出，由热成像窗口接上
    ui(T, { word: '发现生命', sub: 'LIFE SIGNS · 置信度 97%' }); label(project([VICTIM[0] + 0.6, 0.3, VICTIM[2]]), '发现生命体征', '埋深 1.5 M · 呼吸 16 · 心率 92', 170, -110, found, COL.red);
  } },
  s15: { update(t) { // 镜头升起成上帝视角：信号经无人机中继传回基站，各处红点陆续亮起
    const T = T0.s15 + t; const c = godRise(t); setLook('table'); setCamYPR(c.p, c.yaw, c.pitch, 0, c.fov); fogFor(c.p[1]); setShadow([lerp(VICTIM[0], 0, smooth(range(t, 0.5, 5.6))), 0, lerp(VICTIM[2], -6, smooth(range(t, 0.5, 5.6)))], lerpLog(10, 700, smooth(range(t, 0, 5)))); TILT.r = 0.5; TILT.k = 0.4 * (1 - smooth(range(t, 2, 4)));
    drawHexapod({ pose: restPose(), feet: restFeet(), scanner: 1 }); scanRings([REST.x, 0.05, REST.z - 0.5], T, 3.6, 1 - smooth(range(t, 1.5, 3)));
    const dp = DEVICES.drone; drawDrone({ pos: [dp[0], dp[1] + 0.3 * Math.sin(T * 1.3), dp[2]], heading: 2.12, rot: rotorSpin(T, { t0: 0 }), t: T, scale: lerp(1, 6, smooth(range(t, 1.5, 5.5))) });
    const wk = 1 - smooth(range(t, 0.8, 2.8)); const wr = scanWindow(VICTIM, wk, T), lc = lensCenter(VICTIM); setXray(lc[0], lc[2], Math.max(0.01, wr * 1.3), wk, 0.8); VICTIM_M.get().update(VICTIM, 0.3, 1 - smooth(range(t, 1.5, 3.5)), T);
    const ds = (i) => (i === 0 ? smooth(range(t, 2.8, 3.6)) : clamp((t - DOT_T[i]) / 0.25)); /* 一号光柱等镜头升高后再立起（近处的光柱会糊满画面） */ updateCity(T, { marks: ds, markH: clamp(c.p[1] * 0.25, 2, 30), markS: clamp(c.p[1] / 150, 0.25, 3.2), fogNear: FOG.near, fogFar: FOG.far }); // 光柱高度和粗细随相机高度变化，始终在镜头下方
    const sa = smooth(range(t, 0.6, 1.4)) * (1 - smooth(range(t, 4.2, 4.9))); stream([REST.x, 0.4, REST.z], dp, 6, T, 46, sa); stream(dp, [CITY.dock[0], CITY.dock[1] + 2, CITY.dock[2]], 60, T, 90, sa, '#1f9fd8', 0.35);
    ui(T, { word: '信号回传', sub: 'MESH RELAY · HEXAPOD → DRONE → BASE' });
  } },
  s16: { update(t) { // 指挥中心：从大屏后拉，整套监控界面显示在大屏上，8 个红点就是刚才的侦测结果
    const T = T0.s16 + t; const u = clamp(t / 5), L = Math.log((END16[2] - HALL.SZ) / HALL.FILL_D); const cp = [END16[0] * smooth(u), lerp(FILLP[1], END16[1], smooth(u)), HALL.SZ + HALL.FILL_D * Math.exp(0.6 * (1 - Math.exp(-t / 0.33)) + (L - 0.6) * smooth(u))]; // 第三版的后拉曲线：起步速度接住 s15 升空的速度，再慢慢停稳
    const early = t < 0.8; hallFrame(T, cp, () => godScreen(T), { view: early ? undefined : '地图 MAP', word: early ? '信号回传' : '侦测完成', sub: early ? 'MESH RELAY · HEXAPOD → DRONE → BASE' : '8 SIGNALS · ALL COORDINATES SENT', full: smooth(range(t, 0.7, 1.9)) }, (c) => mapLabels(T, () => 1, smooth(range(t, 0.9, 1.7)), c));
    hallLabel(smooth(range(t, 1.6, 2.4)));
  } },
  s17: { update(t) { // 推回大屏：监控界面收回紧凑版，回到真实的上帝视角，选中六足机器人，下降到它上方
    const T = T0.s17 + t; const ui17 = { view: '地图 MAP', word: '结合返航', sub: 'SELECT · HEXAPOD 01' };
    if (t < 1.6) { hallFrame(T, hallLerp(END16, FILLP, (t / 1.6) ** 2), () => godScreen(T), { ...ui17, full: 1 - smooth(range(t, 0.35, 1.3)) }, (c) => { mapLabels(T, () => 1, 1 - smooth(range(t, 0.2, 0.8)), c); selRing(c, T, smooth(range(t, 0.6, 1.2))); }); hallLabel(1 - smooth(range(t, 0, 0.6))); return; }
    const k = smoother(range(t, 1.6, 3.0)), tau = clamp((t - 1.6) / 1.4), p0 = Math.log(GOD.pos[1]), p1 = Math.log(120), m0 = -Math.log((END16[2] - HALL.SZ) / HALL.FILL_D) * 1.25 * 1.4; const h = Math.exp((2 * tau ** 3 - 3 * tau ** 2 + 1) * p0 + (tau ** 3 - 2 * tau ** 2 + tau) * m0 + (-2 * tau ** 3 + 3 * tau ** 2) * p1), /* 带着推进大屏的速度继续下降，没有停顿 */ x = lerp(GOD.pos[0], REST.x, smooth(range(t, 1.6, 2.9))), z = lerp(GOD.pos[2], REST.z, smooth(range(t, 1.6, 2.9)));
    setLook('table'); TILT.r = 0.42; TILT.k = 0.4 * k; setCamYPR([x, h, z], 0, -Math.PI / 2, 0, GOD.fov); setShadow([x, 0, z], lerpLog(700, 260, k)); fogFor(h);
    drawHexapod({ pose: restPose(), feet: restFeet(), scanner: 1 }); const dp = DEVICES.drone; drawDrone({ pos: [dp[0], dp[1] + 0.3 * Math.sin(T * 1.3), dp[2]], heading: 2.12, rot: rotorSpin(T, { t0: 0 }), t: T, scale: lerp(6, 1, k) });
    updateCity(T, { marks: () => 1, markH: 30, markS: lerp(3.2, 1.2, k), fogNear: FOG.near, fogFar: FOG.far }); ui(T, ui17); selRing(HUD, T, 1);
  } },
  s18: { update(t) { // 急速下降回到现场；无人机飞回悬停
    const T = T0.s18 + t; const c = gtaCam(t); setLook('table'); setCamYPR(c.p, c.yaw, c.pitch, 0, c.fov); fogFor(Math.max(c.h * (1 - smooth(range(t, 2.1, 3.5))), 1.5)); setShadow([REST.x, 0, REST.z], lerpLog(260, 8, smooth(range(t, 0, 3)))); TILT.r = 0.42; TILT.k = 0.4;
    const dk = smoother(range(t, 1.2, 3.8)); const from = DEVICES.drone; const hd0 = Math.atan2(HOVER[0] - from[0], HOVER[2] - from[2]);
    drawDrone({ pos: vl(from, HOVER, dk), heading: lerp(hd0, Math.PI + 2 * Math.PI * Math.round((hd0 - Math.PI) / (2 * Math.PI)), smooth(range(t, 2.6, 3.8))), pitch: 0.15 * (1 - smooth(range(t, 3, 3.8))), rot: rotorSpin(T, { t0: 0 }), t: T });
    drawHexapod({ pose: restPose(), feet: restFeet(), scanner: 1 - smooth(range(t, 2.8, 3.8)) }); downwash([REST.x, 0, REST.z], T, smooth(range(t, 3.0, 3.8)) * 0.7); updateCity(T, { marks: (i) => (i === 0 ? 1 - smooth(range(t, 0.4, 1.4)) : 1 - smooth(range(t, 0.1, 0.8))), markH: 30, markS: 1.2, fogNear: FOG.near, fogFar: FOG.far });
    ui(T, { word: '重新结合', sub: 'RENDEZVOUS · DRONE RETURN' });
  } },
  s19: { update(t) { // 无人机落到六足机器人上方，锁扣扣合，收腿
    const T = T0.s19 + t; setLook('table'); setCam(CAM19.p, CAM19.look, CAM19.f); setShadow([REST.x, 0, REST.z], 6); fog(20, 160); TILT.on = false;
    const feet = restFeet(); const tall = 0.40, dockY = tall - HANG_Y; const P = [REST.x, lerp(HOVER[1], dockY, smoother(range(t, 0, 1.7))) + smooth(range(t, 2.9, 3.5)) * 0.3, REST.z]; const latch = 1 - smooth(range(t, 1.6, 2.0));
    const d = drawDrone({ pos: P, heading: Math.PI, rot: rotorSpin(T, { t0: 0 }), t: T, latch, ring: 1.2 + 3 * Math.sin(Math.PI * range(t, 1.7, 2.3)) });
    if (t < 1.7) drawHexapod({ pose: restPose({ y: lerp(HEX.standH, tall, smooth(range(t, 0.4, 1.5))) }), feet }); else drawHexapod({ parent: d.g, local: [0, HANG_Y, 0], feet, fold: smooth(range(t, 2.05, 3.0)) });
    downwash([REST.x, 0, REST.z], T, 0.7); updateCity(T, { fogNear: 20, fogFar: 160 });
    ui(T, { word: '对接锁定', sub: `DOCK · LATCH ${t > 1.9 ? 'LOCKED' : 'ALIGNING'}` }); label(project(d.world([0, -0.18, 0])), t > 1.9 ? '锁扣扣合' : '对接引导', t > 1.9 ? 'LATCH LOCKED · 4/4' : 'GUIDE CONE · ±2 CM', 170, -100, smooth(range(t, 0.5, 1.0)) * (1 - smooth(range(t, 3.0, 3.4))));
  } },
  s20: { update(t) { // 结合体升空，离开废墟
    const T = T0.s20 + t; const up = easeIn(range(t, 0, 1.6)) * 5, away = easeIn(range(t, 1.1, 3.0)); const y0 = 0.40 - HANG_Y + 0.3; const P = [REST.x + away * 22, y0 + up + away * 18, REST.z - away * 8];
    setLook('table'); setCam([-2.7, 0.55, 5.7], vl([REST.x, 1.2, REST.z], P, 0.85), 48); setShadow([REST.x, 0, REST.z], 14); fog(30, 300); TILT.r = 0.4; TILT.k = 0.35;
    combined(P, Math.PI + away * 1.6, away * 0.25, -away * 0.15, rotorSpin(T, { t0: 0 }), T); downwash([REST.x, 0, REST.z], T, 1 - range(up, 1, 4)); updateCity(T, { fogNear: 30, fogFar: 300 });
    ui(T, { word: '结合返航', sub: 'COMBINED · RTB' });
  } },
  // ———— 四、救援 ————
  s21: { transIn: { type: 'wipe', dur: 0.6 }, update(t) { // 航空基地：救援队员跑到舱门口登机，舱门关闭，直升机起飞
    const T = T0.s21 + t; const lift = easeIn(range(t, 3.05, 4.0)), fwd = easeIn(range(t, 3.55, 4.0)); const O = [0, 0, 3000];
    setLook('table'); setCam(add(O, [-17, 1.7, 14]), add(O, [0, 3 + lift * 3, 0]), 40); setShadow(add(O, [0, 0, -6]), 60); fog(80, 700); TILT.r = 0.42; TILT.k = 0.45;
    AIRPORT.get().update(T).position.set(...O); const door = 1 - smooth(range(t, 2.8, 3.15));
    const hl = HELI.get(); hl.update({ pos: add(O, [fwd * 6, 1.5 + lift * 7, 0]), heading: Math.PI / 2, pitch: 0.1 * fwd, rotor: T * 30, speed: 1, door, search: true }); const plane = hl.doorPlane();
    // 三名队员间隔跑到舱门口，踏上滑橇跨进门洞（越过门框平面的部分被裁掉，看起来是进了机舱），全部登机后关门起飞
    for (let i = 0; i < 3; i++) { const t0 = 0.1 + i * 0.32, dur = 1.55, run = clamp((t - t0) / dur), board = clamp((t - t0 - dur) / 0.55); if (t < t0 || board >= 1) continue;
      const app = [0.35 + (i - 1) * 0.4, 0, 2.25], start = [-7.5 - i * 1.0, 0, 6.2 + i * 0.6]; let pos, head = Math.atan2(app[0] - start[0], app[2] - start[2]);
      if (run < 1) pos = vl(start, app, run); else { pos = [app[0], 0.78 * smooth(Math.min(1, board * 1.7)), lerp(app[2], 0.25, board)]; head = Math.PI; }
      drawHuman({ pos: add(O, pos), heading: head, phase: T * 9 + i, run: run < 1 ? 1 : 0.35, clip: plane }); }
    ui(T, { word: '协同救援', sub: 'HELI · 3 RESCUERS BOARDING' });
  } },
  s22: { update(t) { // 空中擦肩：跟拍直升机飞向灾区，完成任务的结合体迎面飞过、返回基站（交汇处放慢）
    const T = T0.s22 + t; const tau = t, tc = 2.3; // 匀速擦肩（去掉慢动作）
    const Hp = [560 - 16 * tau, 90, 30]; setLook('table'); setCam(add(Hp, [24, 6, 10]), add(Hp, [-40, -10, -3]), 36); setShadow([250, 0, 0], 600); fog(300, 2400); TILT.r = 0.55; TILT.k = 0.5;
    updateCity(T, { fogNear: 300, fogFar: 2400 }); HELI.get().update({ pos: Hp, heading: -Math.PI / 2, pitch: 0.12, rotor: tau * 30, speed: 1, search: true });
    const xc = 560 - 16 * tc; combined([xc + 12 * (tau - tc), 93, 35], Math.PI / 2, 0.18, 0, rotorSpin(tau + 100, { t0: 0 }), tau);
    ui(T, { word: '空中擦肩', sub: 'HELI → ZONE A · LH-6 → BASE' });
  } },
  s23: { transIn: { type: 'wipe', dur: 0.6 }, update(t) { // 绞车救援：伤员躺在担架上被直升机吊上去；担架离地时红点变绿
    const T = T0.s23 + t; const hd = 0.3; const go = easeIn(range(t, 5.4, 6.4)); const HP = [VICTIM[0] - 1.79 - Math.sin(hd) * go * 7, 21 + 0.15 * Math.sin(T * 1.1) + go * 1.5, VICTIM[2] + 0.136 - Math.cos(hd) * go * 7];
    const S = s23Ground(), ground = S.g, G = [VICTIM[0], ground, VICTIM[2]]; const hl = HELI.get(); const lift = smoother(range(t, 1.6, 5.3));
    const tipW = () => hl.world([1.78, 0.9, 0.4]); hl.update({ pos: HP, heading: hd, pitch: 0.1 * go, rotor: T * 30, speed: 1, door: 1, search: true, cable: 0.01 }); const tip = tipW();
    const sway = 0.05 * Math.sin(T * 2.3) * lift; const sp = [lerp(G[0], tip[0], lift) + sway, lerp(S.y0, tip[1] - 1.1, lift), lerp(G[2], tip[2], lift)];
    const camP = [G[0] + lerp(3.1, 4.6, lift), ground + 2.9 + (sp[1] - ground) * 0.85, G[2] + lerp(2.6, 4.1, lift)]; setLook('table'); setCam(camP, [sp[0], sp[1] + 0.35 + 1.4 * smooth(range(t, 3.4, 5.6)), sp[2]], 55); setShadow(G, 30); fog(30, 300); TILT.r = 0.45; TILT.k = 0.35;
    const lv = clamp((sp[1] - S.y0) / S.clear); const ring = STRETCHER.get().update(sp, lerp(S.yaw, hd + Math.PI, smooth(range(t, 1.9, 4.6))) + 0.06 * Math.sin(T * 1.7) * lift, S.roll * (1 - lv) + 0.04 * Math.sin(T * 2.3) * lift, S.pitch * (1 - lv)); /* 落地时顺着坡面躺平，吊离地面后再放平；吊升中转到与机身平行，停在舱门外 */ drawHuman({ pos: [G[0] - 0.95, S.r, G[2] + 0.7], heading: 1.6, phase: 0, run: 0, armsUp: t < 1.8 }); // 队员站在担架左侧（不挡吊索），先举手示意起吊
    hl.update({ pos: HP, heading: hd, pitch: 0.1 * go, rotor: T * 30, speed: 1, door: 1, search: true, cable: 1, cableTo: ring }); // 吊索从绞车直接连到担架吊环（担架贴坡倾斜时吊环位置也跟着变）
    setXray(VICTIM[0], VICTIM[2], 4.2, 1, 1.0); updateCity(T, { fogNear: 30, fogFar: 300 });
    for (let i = 0; i < 3; i++) { const ph = (T * 1.6 + i / 3) % 1; drapeRing(G[0], G[2], (0.5 + ph * 2.6) * 2.2, '#8a8378', (1 - ph) * 0.45, 0.11); } // 旋翼下洗气流的尘土环（贴着土丘表面）
    for (let i = 0; i < 2; i++) { const ph = (T * 0.7 + i * 0.5) % 1; drapeRing(G[0], G[2], 0.7 + ph * 2.4, t > 1.85 ? GREEN : COL.red, (1 - ph) * 0.85 * (1 - smooth(range(t, 4.5, 5.5))), 0.06); } // 地面脉冲环：担架离地时由红变绿
    ui(T, { word: '担架吊运', sub: 'HOIST · 25 M · STRETCHER' }); label(project([sp[0], sp[1] + 0.4, sp[2]]), t > 2.2 ? '01 已救出' : '伤员固定', t > 2.2 ? 'RESCUED · 送往医院' : 'STRETCHER · 4 STRAPS', 170, -60, smooth(range(t, 0.8, 1.3)) * (1 - smooth(range(t, 5.4, 6.0))), t > 2.2 ? GREEN : COL.orange);
  } },
  s24: { transIn: { type: 'wipe', dur: 0.6 }, update(t) { // 结合体降落在基站平台上，平台开始下降
    const T = T0.s24 + t; const k = smoother(range(t, 0, 2.4)); const lift = 1 - smooth(range(t, 2.6, 3.5)) * 0.4; setLook('table'); setCam(dockAt(8.5, 4.2, 3.0), dockAt(-0.6, 0.4, 2.0 + (1 - k) * 3.2), 42); setShadow(CITY.dock, 16); fog(300, 2500); TILT.on = false;
    const b = BASE.get(); b.update(CITY.dock, 1, lift, T, 1); const top = b.world([0, dockTop(lift) + COMB_REST, 0]); const P = vl(add(top, [-4, 7, 3]), top, k);
    combined(P, DOCK.ry + (1 - k) * 0.5, (1 - k) * 0.15, 0, rotorSpin(T, { t0: 0, t1: T0.s24 + 2.5, spinDown: 1.4 }), T); downwash([top[0], top[1] - COMB_REST, top[2]], T, range(5 - (P[1] - top[1]), 0, 3) * (1 - range(t, 2.5, 3.0)), 0.6); updateCity(T, { fogNear: 300, fogFar: 2500 });
    ui(T, { word: '返回基站', sub: 'LANDING · PAD LOCK' });
  } },
  s25: { update(t) { // 舱盖合拢，充电
    const T = T0.s25 + t; const k = smoother(t / 4); const lift = 0.6 * (1 - smooth(range(t, 0, 1.4))); setLook('table'); setCam(dockAt(lerp(7.4, 6.0, k), lerp(-3.2, -2.3, k), 1.8), dockAt(0, 0, 1.3), 40); setShadow(CITY.dock, 14); fog(300, 2500); TILT.on = false;
    const b = BASE.get(); b.update(CITY.dock, 1 - smooth(range(t, 1.0, 3.2)), lift, T, 1); const top = b.world([0, dockTop(lift) + COMB_REST, 0]); combined(top, DOCK.ry, 0, 0, { angle: 0, speed: 0 }, T, 1.2); updateCity(T, { fogNear: 300, fogFar: 2500 });
    ui(T, { word: '返航充电', sub: `CHARGING · ${Math.round(telemetry(T).battery)}%` }); label(project(dockAt(0, 0, 1.9)), '无线充电', `CHARGING · ${Math.round(telemetry(T).battery)}% · 防护舱关闭`, 160, -90, smooth(range(t, 2.4, 2.9)), GREEN);
  } },
  // ———— 五、全部救出与片尾 ————
  s26: { transIn: { type: 'dissolve', dur: 0.8 }, update(t) { // 指挥中心（参照第三版）：大屏上红点逐个变绿，镜头始终正对大屏，最后一个红点慢慢移到画面中心并缓缓推近
    const T = T0.s26 + t; const ds = (i) => (i === LAST ? 1 : 1 + clamp((t - greenAt(i)) / 0.35));
    zoomShot(T, t, ds, { view: '地图 MAP', word: '救援进行中', sub: `SAVED ${telemetry(T).saved} / 8`, full: 1 }, smooth(range(t, 0.9, 1.7)) * (1 - smooth(range(t, 5.4, 6.2))));
  } },
  s27: { update(t, { POST }) { // 推到最后一个红点铺满画面，变绿，成为纯绿
    const T = T0.s27 + t; const turn = smooth(range(t, 3.5, 3.95)); const ds = (i) => (i === LAST ? 1 + turn : 2);
    zoomShot(T, 8 + t, ds, { view: '地图 MAP', word: turn > 0.5 ? '全部救出' : '最后一人', sub: turn > 0.5 ? '8 / 8 SAVED' : 'SAVED 7 / 8', full: 1 }, 0);
    POST.flash = 0.18 * Math.sin(Math.PI * range(t, 3.5, 3.85));
    if (HUD) { const f = smooth(range(t, 4.25, 5.0)); if (f > 0) { HUD.save(); HUD.globalAlpha = f; HUD.fillStyle = GREEN; HUD.fillRect(0, 0, W, H); HUD.restore(); } }
  } },
  s28: { update(t, { POST }) { // 绿底片名
    POST.gl = false; POST.vignette = 0.12; titleCard(HUD, t);
  } },
  s29: { transIn: { type: 'tiles', dur: 1.2 }, prepare: loadCredits, update(t, { POST }) { credits(t, POST); } },
  s30: { transIn: { type: 'dissolve', dur: 1.0 }, update(t, { POST }) { cover(t, POST, true); } },
};
// —— 地图视图：正上方俯视，h 高度 ——
function mapView(T, h, x, z) { setLook('table'); TILT.on = false; setCamYPR([x, h, z], 0, -Math.PI / 2, 0, GOD.fov); setShadow([x, 0, z], Math.min(900, h * 1.6)); fog(Math.max(400, h * 1.5), Math.max(2600, h * 6)); }
function mapLabels(T, ds, a, c = HUD) { if (!c || a <= 0.01) return; CITY.survivors.forEach(([x, z], i) => { const s = ds(i); if (s <= 0) return; const p = project([x, 30, z]); if (!p) return; const g = s >= 1.5; c.save(); c.globalAlpha = a * clamp(s);
  c.fillStyle = g ? GREEN : COL.red; c.beginPath(); c.roundRect(p.x + 18, p.y - 30, 50, 22, 4); c.fill(); c.font = `700 13px ${MONO}`; c.fillStyle = '#fff'; c.textAlign = 'center'; c.fillText(String(i + 1).padStart(2, '0'), p.x + 43, p.y - 14); c.restore(); }); }
// 救援现场的土丘表面高度：在被困者周围 14×14 米、0.25 米网格上射线求交一次，之后双线性插值（担架贴坡、队员站位、地面波纹环都按它走）
let SITE = null;
function siteY(x, z) { if (!SITE) { const n = 57, st = 0.25, x0 = VICTIM[0] - 7, z0 = VICTIM[2] - 7, h = new Float32Array(n * n); for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) h[j * n + i] = surfaceY(x0 + i * st, z0 + j * st); SITE = { n, st, x0, z0, h }; }
  const { n, st, x0, z0, h } = SITE; const fx = clamp((x - x0) / st, 0, n - 1.001), fz = clamp((z - z0) / st, 0, n - 1.001); const i = Math.floor(fx), j = Math.floor(fz), u = fx - i, v = fz - j;
  return lerp(lerp(h[j * n + i], h[j * n + i + 1], u), lerp(h[(j + 1) * n + i], h[(j + 1) * n + i + 1], u), v); }
let S23G = null; const s23Ground = () => S23G || (S23G = (() => { const yaw = 2.42, F = [Math.sin(yaw), Math.cos(yaw)], R = [Math.cos(yaw), -Math.sin(yaw)]; const at = (f, r) => siteY(VICTIM[0] + F[0] * f + R[0] * r, VICTIM[2] + F[1] * f + R[1] * r);
  const hH = at(0.95, 0), hF = at(-0.95, 0), hL = at(0, -0.3), hR = at(0, 0.3), hC = at(0, 0); // 担架头、脚、两侧、中心处的坡面高度
  return { g: hC, yaw, y0: Math.max((hH + hF) / 2, hC) + 0.05, pitch: -Math.atan2(hH - hF, 1.9), roll: Math.atan2(hR - hL, 0.6), clear: Math.abs(hH - hF) / 2 + 0.25, r: siteY(VICTIM[0] - 0.95, VICTIM[2] + 0.7) }; })());
// 贴地圆环：沿土丘表面起伏（平面圆环在斜坡上会悬空或埋进去）
const DRAPE = pool(() => { const N = 96, g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(new Float32Array((N + 1) * 2 * 3), 3)); const idx = []; for (let k = 0; k < N; k++) { const a = k * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); } g.setIndex(idx);
  const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, side: THREE.DoubleSide, fog: false })); m.frustumCulled = false; m.renderOrder = 3; m.userData.N = N; return dyn(m); });
function drapeRing(cx, cz, r, color, opacity, width = 0.05) { if (opacity <= 0.005 || r <= 0) return; const m = DRAPE.get(); m.visible = true; const P = m.geometry.attributes.position, N = m.userData.N; const r0 = Math.max(0, r - width);
  for (let k = 0; k <= N; k++) { const a = k / N * Math.PI * 2, c = Math.cos(a), s2 = Math.sin(a); for (const [q, rr] of [[0, r0], [1, r]]) { const x = cx + c * rr, z = cz + s2 * rr; P.setXYZ(k * 2 + q, x, siteY(x, z) + 0.05, z); } }
  P.needsUpdate = true; m.material.color.set(color); m.material.opacity = opacity; }
const greenAt = (i) => (i === 0 ? -10 : (GREEN_ORDER.indexOf(i) < 0 ? 1e9 : 0.9 + GREEN_ORDER.indexOf(i) * 1.0));

// —— 指挥中心：大屏画面 = 上帝视角（三维）＋监控界面；每帧先单独渲染一遍画到 SCR 画布贴到大屏上，再清场渲染大厅 ——
// 镜头在大厅里看向主屏中心；位于 FILLP（正对、距离 FILL_D）时主屏恰好铺满画面，与直接渲染的上帝视角逐像素一致，进出无缝。
const SCR = mkCanvas(W, H), SCX = SCR.getContext('2d'); const SCR_TEX = new THREE.CanvasTexture(SCR); SCR_TEX.colorSpace = THREE.SRGBColorSpace; SCR_TEX.anisotropy = 8;
const SCC = [0, HALL.SY, HALL.SZ], FILLP = [0, HALL.SY, HALL.SZ + HALL.FILL_D], END16 = [1.4, 2.25, HALL.SZ + 19.5];
// 两点之间推拉：距离按对数插值（离屏越近越慢），横向与高度平滑过渡
const hallLerp = (A, B, k) => { const dA = A[2] - HALL.SZ, dB = B[2] - HALL.SZ; return [lerp(A[0], B[0], k), lerp(A[1], B[1], k), HALL.SZ + lerpLog(dA, dB, k)]; };
// 大屏上的上帝视角（与 s15 结尾、s17/s27 推回后的直接画面同一取景与光照）
function godScreen(T, o = {}) { setLook('table'); TILT.on = false; setCamYPR(GOD.pos, 0, -Math.PI / 2, 0, GOD.fov); setShadow([GOD.pos[0], 0, GOD.pos[2]], 700); fog(600, 2600);
  if (o.devices !== false) { drawHexapod({ pose: restPose(), feet: restFeet(), scanner: 1 }); const dp = DEVICES.drone; drawDrone({ pos: [dp[0], dp[1] + 0.3 * Math.sin(T * 1.3), dp[2]], heading: 2.12, rot: rotorSpin(T, { t0: 0 }), t: T, scale: 6 }); }
  updateCity(T, { marks: o.marks || (() => 1), markH: 30, markS: 3.2, fogNear: 600, fogFar: 2600 }); }
function hallFrame(T, cp, god, uiO, extra, o = {}) {
  god(); renderGL(); SCX.setTransform(1, 0, 0, 1, 0, 0); SCX.globalAlpha = 1; SCX.drawImage(glCanvas, 0, 0); if (extra) extra(SCX);
  drawUI(SCX, { T, tel: telemetry(T), cursor: null, ...uiO }); SCR_TEX.needsUpdate = true;
  hideDyn(); cam.near = 0.05; cam.clearViewOffset(); setLook('studio'); TILT.on = false; fog(60, 400); CS.on = true; CS.size = 30; CS.center = [HALL.O[0], HALL.O[2] + 1.5]; CS.y = 0.03; CS.height = 3; CS.opacity = 0.4;
  const hl = HALLS.get(); hl.setScreen(SCR_TEX); hl.update(T, SCR, o); if (o.straight) setCamYPR(hallPt(cp), 0, 0, 0, HALL.FOV); else setCam(hallPt(cp), hallPt(o.look || SCC), HALL.FOV);
}
const hallLabel = (a) => label(project(hallPt([-HALL.SW / 2, HALL.SY + HALL.SH / 2, HALL.SZ])), '指挥中心 · 实时态势', 'COMMAND CENTER · LIVE', -60, -70, a);
function selRing(c, T, a) { if (a <= 0.01) return; const hp = project(DEVICES.hex); if (!hp) return; c.save(); c.globalAlpha = a; c.strokeStyle = COL.orange; c.lineWidth = 2; c.beginPath(); c.arc(hp.x, hp.y, 26 + 6 * Math.sin(T * 5), 0, 7); c.stroke(); c.restore(); callout(c, hp, '六足机器人 · 选中', 'HEXAPOD 01 · REJOIN', 160, -90, a); }

// —— s26/s27：参照第三版——镜头始终正对大屏（只平移、不转向），最后一个红点从屏上原位置慢慢移到画面中心，同时按 u³ 不断放大，直到铺满画面变绿 ——
// 大屏像素 → 画面像素是一个缩放＋平移（s, x0, y0）；大屏铺满画面后改为直接渲染上帝视角的同一块区域（相机视锥偏移），画面保持清晰
const FRH = (H / 2) / Math.tan(THREE.MathUtils.degToRad(HALL.FOV / 2));
function screenView(cp) { const d = cp[2] - HALL.SZ; return { s: HALL.SW * FRH / (d * W), x0: W / 2 - (HALL.SW / 2 + cp[0]) * FRH / d, y0: H / 2 - (HALL.SY - cp[1] + HALL.SH / 2) * FRH / d, d }; }
function camForScreen(sx, sy, s, X, Y) { const d = HALL.SW * FRH / (s * W); const px = (sx / W - 0.5) * HALL.SW, py = HALL.SY - (sy / H - 0.5) * HALL.SH; return [px - (X - W / 2) * d / FRH, py + (Y - H / 2) * d / FRH, HALL.SZ + d]; }
let LASTP = null; const lastPx = () => LASTP || (LASTP = (() => { const L = CITY.survivors[LAST]; setCamYPR(GOD.pos, 0, -Math.PI / 2, 0, GOD.fov); const p = project([L[0], 30, L[1]]); return [p.x, p.y]; })()); // 最后一个红点（光柱顶端的球）在大屏上的像素位置
const CP26 = [-0.6, 2.4, HALL.SZ + 16], SFIN = 130;
function zoom26(tau) { const v0 = screenView(CP26), D = lastPx(); const X0 = v0.x0 + v0.s * D[0], Y0 = v0.y0 + v0.s * D[1]; const u = clamp(tau / 12.2); const s2 = Math.exp(Math.log(v0.s) + (Math.log(SFIN) - Math.log(v0.s)) * u * u * u); const k = smooth(clamp(tau / 9));
  const cp = camForScreen(D[0], D[1], s2, lerp(X0, W / 2, k), lerp(Y0, H / 2, k)); return { cp, ...screenView(cp) }; }
const covered = (z) => z.x0 <= 0 && z.y0 <= 0 && z.x0 + W * z.s >= W && z.y0 + H * z.s >= H; // 大屏已经盖满整个画面
const UIC = mkCanvas(W, H), UICX = UIC.getContext('2d');
function zoomShot(T, tau, ds, uiO, hallA) {
  const z = zoom26(tau); const labA = 1 - smooth((z.s - 0.9) / 0.6);
  if (!covered(z)) { hallFrame(T, z.cp, () => godScreen(T, { marks: ds, devices: false }), uiO, (c) => mapLabels(T, ds, labA, c), { straight: true }); hallLabel(hallA); return z; }
  setLook('table'); TILT.on = false; setCamYPR(GOD.pos, 0, -Math.PI / 2, 0, GOD.fov);
  UICX.setTransform(1, 0, 0, 1, 0, 0); UICX.clearRect(0, 0, W, H); mapLabels(T, ds, labA, UICX); drawUI(UICX, { T, tel: telemetry(T), cursor: null, ...uiO }); // 界面层先按大屏像素画好
  cam.setViewOffset(W, H, -z.x0 / z.s, -z.y0 / z.s, W / z.s, H / z.s);
  const cx = (-z.x0 + W / 2) / z.s, cy = (-z.y0 + H / 2) / z.s, hh = GOD.pos[1] * Math.tan(THREE.MathUtils.degToRad(GOD.fov / 2)); const wx = GOD.pos[0] + (cx / W - 0.5) * 2 * hh * W / H, wz = GOD.pos[2] + (cy / H - 0.5) * 2 * hh;
  setShadow([wx, 0, wz], clamp(2.6 * hh * W / H / z.s, 30, 700)); fog(600, 2600); updateCity(T, { marks: ds, markH: 30, markS: 3.2, fogNear: 600, fogFar: 2600 });
  if (HUD) { const a = 1 - smooth((z.s - 1.5) / 1.6); if (a > 0.01) { HUD.save(); HUD.globalAlpha = a; HUD.drawImage(UIC, z.x0, z.y0, W * z.s, H * z.s); HUD.restore(); } }
  return z;
}
// —— s12~s15 相机（与第三版相同） ——
const S12_OFF = [2.25, 0.5, 0.8], S13_OFF = [0.12, 1.3, 2.7];
function searchCam(T) { const b = walkBody(T); if (T < T0.s13) return { p: [b.x + S12_OFF[0], S12_OFF[1], b.z + S12_OFF[2]], look: [b.x, 0.14, b.z - 0.2], f: 40 };
  const u = smoother(range(T, T0.s13, T0.s14)); const th0 = Math.atan2(S12_OFF[2], S12_OFF[0]), th1 = Math.atan2(S13_OFF[2], S13_OFF[0]), r0 = Math.hypot(S12_OFF[0], S12_OFF[2]), r1 = Math.hypot(S13_OFF[0], S13_OFF[2]);
  const th = lerp(th0, th1, u), r = lerp(r0, r1, u); return { p: [b.x + Math.cos(th) * r, lerp(S12_OFF[1], S13_OFF[1], u), b.z + Math.sin(th) * r], look: [b.x, lerp(0.14, 0.2, u), b.z + lerp(-0.2, -0.5, u)], f: 40 }; }
const S14_START = searchCam(T0.s14);
const K_SEARCH = mkKeys([{ T: T0.s14, p: S14_START.p, look: S14_START.look, f: 40 }, { T: T0.s14 + 1.8, p: [0.62, 2.15, 0.35], look: [0.52, 0.05, -2.8], f: 40 }, { T: T0.s15, p: [0.6, 2.35, -0.2], look: [0.5, 0.05, -3.0], f: 40 }]);
const S15 = (() => { const v = K_SEARCH[K_SEARCH.length - 1].v; return { p: v.slice(0, 3), yaw: v[3], pitch: v[4], fov: v[5] }; })();
function godRise(t) { const u = clamp(t / 6); const h = lerpLog(S15.p[1], GOD.pos[1], u * u); const pk = smooth(range(t, 0, 3.6)); const pitch = lerp(S15.pitch, -Math.PI / 2, pk); const yaw = lerp(S15.yaw, 0, pk);
  const gu = smooth(range(t, 0.5, 5.6)); const G = add(vl([VICTIM[0], 0, VICTIM[2]], [GOD.pos[0], 0, GOD.pos[2]], gu), sc([REST.x - VICTIM[0], 0, REST.z - VICTIM[2]], 0.75 * Math.sin(Math.PI * gu))); // 升起途中视线中心先偏向六足机器人，免得正下方只有空白的土丘
  const off = (h - VICTIM[1]) * Math.cos(pitch) / Math.max(1e-6, -Math.sin(pitch));
  return { p: [G[0] + Math.sin(yaw) * off, h, G[2] + Math.cos(yaw) * off], yaw, pitch, fov: lerp(S15.fov, GOD.fov, smooth(range(t, 0, 4))) }; }
const CAM19 = { p: [3.35, 1.1, 3.35], look: [REST.x, 0.65, REST.z], f: 38 };
const C19 = (() => { const d = [CAM19.look[0] - CAM19.p[0], CAM19.look[1] - CAM19.p[1], CAM19.look[2] - CAM19.p[2]]; const r = Math.hypot(...d); return { r, yaw: Math.atan2(-d[0], -d[2]), phi: Math.asin(-d[1] / r) }; })();
function gtaCam(t) { let h = 120; h = lerpLog(h, 48, smoother(range(t, 0.2, 0.9))); h = lerpLog(h, 6.7, smoother(range(t, 1.2, 2.3)));
  const gk = smoother(range(t, 0.05, 0.6)); const tk = smoother(range(t, 2.1, 3.5)); const tgt = vl([lerp(REST.x, REST.x, gk), 0, lerp(REST.z, REST.z, gk)], CAM19.look, tk);
  const r = lerpLog(h, C19.r, tk), th = lerp(0, C19.yaw, smooth(tk)), phi = lerp(Math.PI / 2, C19.phi, tk); const p = [tgt[0] + r * Math.sin(th) * Math.cos(phi), tgt[1] + r * Math.sin(phi), tgt[2] + r * Math.cos(th) * Math.cos(phi)];
  return { p, yaw: th, pitch: -phi, fov: lerp(GOD.fov, CAM19.f, tk), h }; }

// —— 片名（绿底） ——
function titleCard(h, t) {
  h.save(); h.fillStyle = GREEN; h.fillRect(0, 0, W, H); const a1 = smooth((t - 0.4) / 0.9), a2 = smooth((t - 1.7) / 0.9);
  h.textAlign = 'center'; h.textBaseline = 'alphabetic'; h.globalAlpha = a1 * 0.85; h.font = `500 16px ${MONO}`; h.letterSpacing = '8px'; h.fillStyle = 'rgba(255,255,255,0.85)'; h.fillText('LH-6 · AIR-GROUND SEARCH & RESCUE SYSTEM', W / 2, H / 2 - 230); h.letterSpacing = '0px';
  h.globalAlpha = a1; h.fillStyle = '#fff'; h.font = `900 170px ${FONT}`; h.fillText('六合', W / 2, H / 2 - 40 + (1 - a1) * 20); h.font = `500 50px ${FONT}`; h.fillText('空地协同生命搜救系统', W / 2, H / 2 + 50 + (1 - a1) * 14);
  h.globalAlpha = a2; h.fillRect(W / 2 - 160 * a2, H / 2 + 92, 320 * a2, 3); h.font = `400 50px ${FONT}`; h.fillText('上天入地，不放弃每一个生命', W / 2, H / 2 + 178);
  h.restore();
}
// —— 片尾：左侧滚动名单，右侧棚拍演示通用接口（不同轴数无人机两两对接不同载荷） ——
const PAIRS = [[6, 'hex'], [4, 'track'], [8, 'usv'], [6, 'rov'], [4, 'hex'], [8, 'track']];
const PNAME = { 4: '四轴无人机', 6: '六轴无人机', 8: '八轴无人机' }, QNAME = { hex: '六足机器人', track: '履带机器人', rov: '潜水机器人', usv: '无人船' };
function credits(t, POST) {
  const T = T0.s29 + t; const tt = Math.max(0, t - 1.2); const n = Math.min(PAIRS.length - 1, Math.floor(tt / 4)); const u = tt - n * 4; const [arms, kind] = PAIRS[n];
  setLook('studio'); const a = 0.9 + T * 0.12; setCam([5.8 * Math.sin(a), 2.0, 5.8 * Math.cos(a)], [0, 0.95, 0], 34); cam.setViewOffset(W, H, -470, -10, W, H); CS.size = 5; CS.center = [0, 0]; fog(30, 80);
  const vis = smooth(range(u, 0, 0.6)) * (1 - smooth(range(u, 3.35, 3.95))); const yaw = 0.3 + T * 0.35; const lift = smooth(range(u, 2.05, 3.0)) * 0.5; const desc = smoother(range(u, 0.55, 1.8)); const lock = smooth(range(u, 1.8, 2.0));
  if (vis > 0.01) { let plate;
    if (kind === 'hex') { const pose = { x: 0, y: lift + HEX.standH, z: 0, heading: yaw }; const hp = drawHexapod({ pose, feet: standFeet(pose).map((q) => [q[0], lift, q[2]]) }); plate = hp.world([0, HEX.topY, 0]); }
    else plate = PAYLOADS[kind].get().update([0, lift, 0], yaw, T);
    const P = [plate[0], plate[1] + 0.185 + (1 - desc) * 1.25, plate[2]]; drawDrone({ pos: P, heading: yaw, rot: rotorSpin(T, { t0: 0 }), t: T, arms, gear: 1 - smooth(range(u, 0.6, 1.3)), latch: 1 - lock, ring: 1.2 + 2.5 * lock });
    if (desc < 1) fxLine([[P[0], P[1] - 0.2, P[2]], plate], COL.orange, 0.8 * smooth(range(u, 0.7, 1.0)), [0.04, 0.04]);
    const fl = Math.exp(-(((u - 1.9) / 0.1) ** 2)); if (fl > 0.02) fxRing(plate, 0.2 + (u - 1.8) * 2.2, COL.orange, fl, 0.03); }
  for (const r of [0.9, 1.4]) fxLine(circlePts([0, 0.005, 0], r, 96), '#9b958b', 0.45);
  POST.vignette = 0.08;
  const h = HUD; h.save(); const pin = smooth(range(t, 0.6, 1.5));
  // 左侧名单卡片
  const X = 120, Y = 150, Wd = 640, Hd = 780; h.globalAlpha = pin; h.shadowColor = 'rgba(60,45,30,0.08)'; h.shadowBlur = 20; h.fillStyle = 'rgba(251,250,247,0.95)'; h.beginPath(); h.roundRect(X, Y, Wd, Hd, 10); h.fill(); h.shadowColor = 'transparent'; h.strokeStyle = 'rgba(29,30,33,0.1)'; h.stroke();
  h.fillStyle = COL.orange; h.fillRect(X, Y, 8, 90); h.textAlign = 'left'; h.font = `900 64px ${FONT}`; h.fillStyle = COL.ink; h.fillText('六合', X + 44, Y + 84); h.font = `500 24px ${FONT}`; h.fillStyle = COL.ink2; h.fillText('空地协同生命搜救系统', X + 190, Y + 80);
  h.font = `500 13px ${MONO}`; h.letterSpacing = '4px'; h.fillStyle = COL.ink2; h.fillText('CREDITS · 制作人员', X + 44, Y + 140); h.letterSpacing = '0px'; h.fillStyle = 'rgba(29,30,33,0.1)'; h.fillRect(X + 44, Y + 156, Wd - 88, 1);
  const top = Y + 190, bot = Y + Hd - 30; const lines = CREDITS ? CREDITS.lines : []; const lh = 70; const offEnd = (top + bot) / 2 - (lines.length * lh + 70); const off = lerp(bot + 10, offEnd, smooth(clamp((t - 2.3) / 19.5)) * 0.15 + clamp((t - 2.3) / 19.5) * 0.85);
  h.save(); h.beginPath(); h.rect(X, top - 30, Wd, bot - top + 30); h.clip();
  lines.forEach(([role, name], i) => { const y = off + i * lh; if (y < top - 40 || y > bot + 40) return; const fe = clamp((y - top + 20) / 60) * clamp((bot - y) / 60); h.globalAlpha = pin * fe; h.font = `400 26px ${FONT}`; h.fillStyle = COL.ink2; h.textAlign = 'left'; h.fillText(role, X + 60, y); h.font = `700 32px ${FONT}`; h.fillStyle = COL.ink; h.textAlign = 'right'; h.fillText(name, X + Wd - 60, y); });
  const yc = off + lines.length * lh + 70; const fe = clamp((yc - top) / 60) * clamp((bot - yc) / 60); if (CREDITS && CREDITS.closing) { h.globalAlpha = pin * fe; h.font = `700 32px ${FONT}`; h.fillStyle = COL.orange; h.textAlign = 'center'; h.fillText(CREDITS.closing, X + Wd / 2, yc); }
  h.restore();
  // 右侧标题与当前组合
  h.globalAlpha = pin; h.textAlign = 'left'; h.font = `500 13px ${MONO}`; h.letterSpacing = '4px'; h.fillStyle = COL.ink2; h.fillText('UNIVERSAL DOCK · 通用对接接口', 1040, 190); h.letterSpacing = '0px'; h.font = `900 44px ${FONT}`; h.fillStyle = COL.ink; h.fillText('一套接口，多种载荷', 1040, 246);
  const la = smooth(range(u, 0.4, 0.9)) * (1 - smooth(range(u, 3.4, 3.9))) * pin; h.globalAlpha = la; h.font = `700 34px ${FONT}`; h.fillStyle = COL.ink; h.textAlign = 'center'; h.fillText(`${PNAME[arms]}  ×  ${QNAME[kind]}`, 1440, 920);
  h.globalAlpha = la * lock; h.font = `500 22px ${FONT}`; h.fillStyle = GREEN; h.fillText('● 接口锁定', 1440, 960);
  h.restore();
  const outF = smooth(range(t, 24.8, 26)); if (outF > 0) { h.save(); h.globalAlpha = outF; h.fillStyle = '#f2efea'; h.fillRect(0, 0, W, H); h.restore(); }
}
// —— 封面：六足机器人立在棚拍台上，无人机悬停其上方以对接光束相连；左侧片名、口号，右侧设备标注 ——
function cover(t, POST, film) {
  const T = 140 + t; setLook('studio'); const HX = [0.15, 0, 0.1]; setCam([2.75, 0.8, 3.7], [-0.62, 0.72, 0.1], 34); CS.size = 6; CS.center = [0, 0]; CS.opacity = 0.6; fog(30, 80);
  const pose = { x: HX[0], y: HEX.standH, z: HX[2], heading: 0.95 }; const hp = drawHexapod({ pose, feet: standFeet(pose), scanner: 1 });
  const d = drawDrone({ pos: [HX[0] - 0.3, 1.42, HX[2] - 0.5], heading: 1.15, rot: rotorSpin(T, { t0: 0 }), t: 120.03, latch: 1, ring: 2.0 });
  const belly = d.world([0, -0.2, 0]), plate = hp.world([0, 0.12, 0]); fxLine([belly, plate], '#2fa8e0', 0.9, [0.035, 0.035]); stream(belly, plate, 0, T, 14, 0.9, '#2fa8e0', 0.8);
  for (let i = 0; i < 2; i++) { const ph = (T * 0.6 + i / 2) % 1; fxRing([plate[0], plate[1] + 0.01, plate[2]], 0.12 + ph * 0.5, '#2fa8e0', 0.8 * (1 - ph), 0.01); }
  for (const [r, op] of [[1.1, 0.45], [1.6, 0.25]]) fxLine(circlePts([HX[0], 0.005, HX[2]], r, 96), '#9b958b', op);
  POST.vignette = 0.1;
  const h = HUD, x0 = 140; const a = film ? smooth(range(t, 0.6, 1.6)) : 1; h.save(); h.globalAlpha = a; h.textAlign = 'left'; h.textBaseline = 'alphabetic';
  h.fillStyle = COL.orange; h.fillRect(0, 0, 196, 108); h.strokeStyle = '#fff'; h.lineWidth = 3; h.lineJoin = 'round'; h.beginPath(); for (let i = 0; i < 6; i++) { const an = i * Math.PI / 3 + Math.PI / 6; h.lineTo(52 + Math.cos(an) * 20, 54 + Math.sin(an) * 20); } h.closePath(); h.stroke();
  for (let i = 0; i < 6; i++) { const an = i * Math.PI / 3 + Math.PI / 6; h.beginPath(); h.arc(52 + Math.cos(an) * 29, 54 + Math.sin(an) * 29, 5, 0, 7); h.stroke(); } h.fillStyle = '#fff'; h.beginPath(); h.arc(52, 54, 5, 0, 7); h.fill(); h.font = `700 26px ${MONO}`; h.letterSpacing = '5px'; h.fillText('LH-6', 92, 64); h.letterSpacing = '0px';
  h.font = `500 18px ${MONO}`; h.letterSpacing = '5px'; h.fillStyle = COL.ink2; h.fillText('AIR-GROUND SEARCH & RESCUE SYSTEM', x0, 330); h.letterSpacing = '0px';
  h.fillStyle = COL.ink; h.font = `900 210px ${FONT}`; h.fillText('六合', x0 - 12, 540); h.font = `500 54px ${FONT}`; h.fillText('空地协同生命搜救系统', x0, 630); h.fillStyle = COL.orange; h.fillRect(x0, 668, 120, 6);
  h.font = `400 42px ${FONT}`; h.fillStyle = COL.ink; h.fillText('上天入地，不放弃每一个生命', x0, 744);
  h.font = `500 14px ${MONO}`; h.letterSpacing = '4px'; h.fillStyle = COL.ink2; h.fillText('HEXAPOD × HEXACOPTER · BASE STATION · UNIVERSAL DOCK', x0, 1010); h.textAlign = 'right'; h.fillText('六合 · 宣传片  //////', 1890, 1010); h.letterSpacing = '0px';
  h.restore();
  const la = film ? smooth(range(t, 1.6, 2.3)) : 1; label(project(d.world([0.85, 0.12, -0.5])), '六轴无人机', 'HEXACOPTER · 重载六旋翼', 120, -70, la); label(project(hp.world([0.45, 0.0, -0.2])), '六足机器人', 'HEXAPOD · 板材桁架腿', 150, 70, la);
  if (film) { const f = smooth(range(t, 5.0, 6.0)); if (f > 0) { HUD.save(); HUD.globalAlpha = f; HUD.fillStyle = '#000'; HUD.fillRect(0, 0, W, H); HUD.restore(); } }
}

export const SHOTS = [...DURS.map(([id, dur]) => ({ id, dur, ...SH[id], update: ((u) => (t, ctx) => { HUD = ctx.hud; setXray(0, 0, 1, 0); u(t, ctx); })(SH[id].update) })),
  { id: 'cover', dur: 1, extra: true, update(t, ctx) { HUD = ctx.hud; setXray(0, 0, 1, 0); cover(3, ctx.POST, false); } }];
