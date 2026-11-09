// 六足机器人（PBR，重载救援型）。参考 LAURON VI 的关节驱动器（大圆筒、端面螺栓圈）与 Mantis 的拱形箱式腿梁＋液压缸、带弹簧的大足垫：
// · 机身：倒角六棱柱白壳、六面深色装甲板与散热格栅、腿部快拆法兰、顶部深色面板与对接盘（含锁扣座）、尾部提手与天线、腹部护板；
// · 头部：双目相机（白色镜筒＋深色镜片）、激光雷达圆筒、可翻起的生命探测雷达面板；
// · 腿（粗壮）：髋部偏航驱动器→髋部俯仰驱动器（大圆筒）→ 白色箱式拱梁（双侧板＋减重孔＋黑色芯板）＋液压缸与镀铬活塞杆 → 膝关节驱动器 → 粗锥形小腿（白色护套＋黑色下段）→ 减震弹簧 → 橡胶大足垫。
// 运动学（逆运动学、收腿、三角步态）与第三版相同。
import { THREE, dyn, pool, mkCanvas, scene } from '../engine.js';
import { M, mesh, rbox, cyl, setPose, glowSprite } from '../mats.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { clamp, lerp, smooth } from '../util.js';

export const HEX = { bodyR: 0.24, mountR: 0.22, L0: 0.06, L1: 0.24, L2: 0.34, standH: 0.24, footR: 0.52, topY: 0.11 };
const PSI = [45, 90, 135, -45, -90, -135].map((d) => d * Math.PI / 180);
export const TRIPOD = [0, 1, 0, 1, 0, 1];
function legIK(lx, ly, lz) {
  const { L0, L1, L2 } = HEX; const gamma = Math.atan2(-lz, lx); const r = Math.hypot(lx, lz) - L0;
  let d = Math.hypot(r, ly); d = clamp(d, Math.abs(L1 - L2) + 1e-3, L1 + L2 - 1e-3);
  const knee = Math.acos(clamp((L1 * L1 + L2 * L2 - d * d) / (2 * L1 * L2), -1, 1));
  return [gamma, Math.atan2(ly, r) + Math.acos(clamp((L1 * L1 + d * d - L2 * L2) / (2 * L1 * d), -1, 1)), -(Math.PI - knee)];
}
function foldAngles(i) { const s = Math.sign(PSI[i]); const front = i % 3 === 0, rear = i % 3 === 2; return [front ? -s * 0.45 : rear ? s * 0.45 : 0, 0.05, -2.95]; }
export function nominalFoot(i, radius = HEX.footR) { const p = PSI[i]; return [Math.sin(p) * radius, 0, Math.cos(p) * radius]; }
export function footOnGround(pose, local, groundY = () => 0) { const c = Math.cos(pose.heading || 0), s = Math.sin(pose.heading || 0); const x = pose.x + local[0] * c + local[2] * s, z = pose.z - local[0] * s + local[2] * c; return [x, groundY(x, z), z]; }
export function gaitFeet(t, bodyAt, { freq = 1.3, lift = 0.07, radius = HEX.footR, groundY = () => 0 } = {}) {
  const feet = [];
  for (let i = 0; i < 6; i++) {
    const ph = TRIPOD[i] * 0.5, c = t * freq + ph, k = Math.floor(c), u = c - k; const local = nominalFoot(i, radius);
    const touch = (kk) => footOnGround(bodyAt((kk + 0.25 - ph) / freq), local, groundY);
    if (u < 0.5) { feet.push(touch(k)); continue; }
    const a = touch(k), b = touch(k + 1), s2 = smooth((u - 0.5) / 0.5), dist = Math.hypot(b[0] - a[0], b[2] - a[2]);
    feet.push([lerp(a[0], b[0], s2), lerp(a[1], b[1], s2) + Math.sin(Math.PI * s2) * lift * clamp(dist / 0.05), lerp(a[2], b[2], s2)]);
  }
  return feet;
}
export function standFeet(pose) { return [0, 1, 2, 3, 4, 5].map((i) => footOnGround(pose, nominalFoot(i))); }

const GEO = {}; const geo = (k, f) => GEO[k] || (GEO[k] = f());
const V = (x, y, z) => new THREE.Vector3(x, y, z);
// 把若干（几何体, 位置, 旋转）合并成一个几何体，减少绘制调用
function merged(list) { return mergeGeometries(list.map(([g, p = [0, 0, 0], r = [0, 0, 0], s = [1, 1, 1]]) => { const c = g.index ? g.toNonIndexed() : g.clone(); c.applyMatrix4(new THREE.Matrix4().compose(V(...p), new THREE.Quaternion().setFromEuler(new THREE.Euler(...r, 'YXZ')), V(...s))); for (const k of Object.keys(c.attributes)) if (!['position', 'normal', 'uv'].includes(k)) c.deleteAttribute(k); return c; }), false); }
// 螺栓圈：在 xz 平面上、半径 r、n 个
function boltRing(r, n, br = 0.006, h = 0.006, y = 0) { const b = cyl(br, br, h, 10); const L = []; for (let k = 0; k < n; k++) { const a = k / n * Math.PI * 2; L.push([b, [Math.cos(a) * r, y, Math.sin(a) * r]]); } return merged(L); }
// 关节驱动器：沿 y 轴的圆筒（外壳＋两端法兰＋螺栓圈＋中心盖），r 半径、w 宽度
function actuatorGeo(r, w) { return { shell: cyl(r, r, w * 0.72, 40), flange: merged([[cyl(r * 0.86, r * 0.86, w * 0.16, 40), [0, w * 0.43, 0]], [cyl(r * 0.86, r * 0.86, w * 0.16, 40), [0, -w * 0.43, 0]]]), bolts: merged([[boltRing(r * 0.68, 10, r * 0.07, 0.006), [0, w * 0.515, 0]], [boltRing(r * 0.68, 10, r * 0.07, 0.006), [0, -w * 0.515, 0]]]), cap: merged([[cyl(r * 0.36, r * 0.36, w * 1.06, 24)]]), ring: (() => { const t = new THREE.TorusGeometry(r * 1.0, r * 0.07, 8, 40); t.rotateX(Math.PI / 2); return t; })() }; }
function Actuator(r, w, shellMat = M.white) { const G = geo('act' + r + w, () => actuatorGeo(r, w)); const g = new THREE.Group(); g.add(mesh(G.shell, shellMat)); g.add(mesh(G.flange, M.dark)); g.add(mesh(G.bolts, M.chrome)); g.add(mesh(G.cap, M.orange)); const rg = mesh(G.ring, M.black); g.add(rg); return g; }
// 拱形箱式腿梁：沿 +x 长 L，宽（侧板间距）bw，高 bh；双侧白板带减重孔，黑色芯板
function beamGeo(L, bh, bw) {
  const s = new THREE.Shape(); const r = bh * 0.5, arch = bh * 0.32;
  s.moveTo(0, -r); s.quadraticCurveTo(L * 0.5, -r + arch * 0.4, L, -r * 0.8); s.absarc(L, 0, r * 0.8, -Math.PI / 2, Math.PI / 2, false); s.quadraticCurveTo(L * 0.5, r + arch, 0, r); s.absarc(0, 0, r, Math.PI / 2, Math.PI * 1.5, false);
  for (const u of [0.32, 0.55, 0.76]) { const h = new THREE.Path(); h.absarc(L * u, arch * 0.25, bh * (0.2 - u * 0.05), 0, Math.PI * 2, true); s.holes.push(h); }
  const plate = new THREE.ExtrudeGeometry(s, { depth: 0.012, bevelEnabled: true, bevelThickness: 0.003, bevelSize: 0.003, bevelSegments: 2, curveSegments: 16 });
  const left = plate.clone(); left.translate(0, 0, bw / 2 - 0.006); const right = plate.clone(); right.translate(0, 0, -bw / 2 - 0.006);
  const core = rbox(L * 0.92, bh * 0.62, bw * 0.75, 0.01); core.translate(L * 0.48, arch * 0.25, 0);
  return { plates: merged([[left], [right]]), core };
}
// 舵机：黑色机壳＋橙色标签带（印“20KG”）＋两端安装耳＋侧面铝制输出盘（带螺钉）。几何沿 x 为长度方向、输出轴沿 z
const servoLabelC = mkCanvas(128, 32); { const g = servoLabelC.getContext('2d'); g.fillStyle = '#ec4e26'; g.fillRect(0, 0, 128, 32); g.fillStyle = '#fff'; g.font = 'bold 22px "DejaVu Sans Mono",monospace'; g.fillText('20', 8, 24); g.font = 'bold 11px "DejaVu Sans Mono",monospace'; g.fillText('KG·CM', 40, 14); g.fillText('LH-SV', 40, 27); }
const SERVO_LABEL = new THREE.CanvasTexture(servoLabelC); SERVO_LABEL.colorSpace = THREE.SRGBColorSpace;
const MAT_PLATE = new THREE.MeshStandardMaterial({ color: '#1b1c20', roughness: 0.36, metalness: 0.6 });
const MAT_LABEL = new THREE.MeshStandardMaterial({ map: SERVO_LABEL, roughness: 0.45 });
const MAT_ALU = new THREE.MeshStandardMaterial({ color: '#c9ccd1', roughness: 0.28, metalness: 0.9 });
function servoGeo() { return {
  body: rbox(0.078, 0.05, 0.044, 0.006), label: rbox(0.03, 0.052, 0.046, 0.004),
  ears: merged([[rbox(0.008, 0.05, 0.06, 0.002), [0.043, 0, 0]], [rbox(0.008, 0.05, 0.06, 0.002), [-0.043, 0, 0]]]),
  horn: merged([[cyl(0.022, 0.022, 0.006, 28), [0.02, 0, 0.026], [Math.PI / 2, 0, 0]], [cyl(0.009, 0.009, 0.01, 16), [0.02, 0, 0.029], [Math.PI / 2, 0, 0]]]),
  screws: merged([0, 1, 2, 3].map((k) => [cyl(0.003, 0.003, 0.004, 8), [0.02 + Math.cos(k * Math.PI / 2 + 0.78) * 0.015, Math.sin(k * Math.PI / 2 + 0.78) * 0.015, 0.03], [Math.PI / 2, 0, 0]])) }; }
function Servo() { const G = geo('servo', servoGeo); const g = new THREE.Group(); g.add(mesh(G.body, M.black)); const lb = mesh(G.label, MAT_LABEL); lb.position.x = -0.012; g.add(lb); g.add(mesh(G.ears, M.black)); g.add(mesh(G.horn, MAT_ALU)); g.add(mesh(G.screws, M.chrome)); return g; }
// 板件：二维轮廓（u 横向，v 沿杆件）挤出成薄板，两块平行板之间距离 gap
function plateGeo(outline, holes, th = 0.005) { const s = new THREE.Shape(outline.map(([u, v]) => new THREE.Vector2(u, v))); for (const h of holes) s.holes.push(new THREE.Path(h.map(([u, v]) => new THREE.Vector2(u, v)))); return new THREE.ExtrudeGeometry(s, { depth: th, bevelEnabled: true, bevelThickness: 0.0012, bevelSize: 0.0012, bevelSegments: 1, curveSegments: 6 }); }
function pairGeo(outline, holes, gap, th = 0.005) { const p = plateGeo(outline, holes, th); const a = p.clone(); a.translate(0, 0, gap / 2); const b = p.clone(); b.translate(0, 0, -gap / 2 - th); return merged([[a], [b]]); }
// 大腿：两块平行板（u 沿腿长 0→L1，v 为高度），中间梯形镂空
function femurGeo() { const L = HEX.L1, h = 0.03; return pairGeo([[-0.02, -h], [L + 0.02, -h * 0.85], [L + 0.035, 0], [L + 0.02, h * 0.85], [-0.02, h], [-0.04, 0]], [[[0.05, -0.016], [L - 0.05, -0.012], [L - 0.07, 0.012], [0.07, 0.016]]], 0.062); }
// 小腿：宽大的锥形桁架（u 横向，v 沿小腿向下 0→-L2），三角形镂空，末端收窄成足尖
function tibiaGeo() { const L = HEX.L2; const out = [[-0.05, 0.035], [0.05, 0.035], [0.064, -0.02], [0.03, -L * 0.62], [0.016, -L + 0.03], [0, -L + 0.012], [-0.016, -L + 0.03], [-0.03, -L * 0.62], [-0.064, -0.02]];
  const holes = [[[-0.036, -0.045], [0.036, -0.045], [0, -0.115]], [[-0.02, -0.14], [0.02, -0.14], [0, -0.2]], [[-0.035, -0.06], [-0.04, -0.13], [-0.016, -0.13]].map(([u, v]) => [u * 0.9, v]), [[0.035, -0.06], [0.016, -0.13], [0.04, -0.13]].map(([u, v]) => [u * 0.9, v]), [[-0.012, -0.22], [0.012, -0.22], [0, -0.26]]];
  return pairGeo(out, holes, 0.05); }
// 雷达面板贴图
const panelC = mkCanvas(128, 96); { const g = panelC.getContext('2d'); g.fillStyle = '#0b1f33'; g.fillRect(0, 0, 128, 96); g.strokeStyle = 'rgba(95,212,255,0.55)'; g.lineWidth = 1; for (let x = 8; x < 128; x += 12) { g.beginPath(); g.moveTo(x, 6); g.lineTo(x, 90); g.stroke(); } for (let y = 8; y < 96; y += 12) { g.beginPath(); g.moveTo(6, y); g.lineTo(122, y); g.stroke(); } g.fillStyle = 'rgba(255,122,60,0.9)'; g.fillRect(6, 40, 116, 4); }
const PANEL_TEX = new THREE.CanvasTexture(panelC); PANEL_TEX.colorSpace = THREE.SRGBColorSpace;
// 侧面标识贴图
const decalC = mkCanvas(256, 64); { const g = decalC.getContext('2d'); g.fillStyle = '#1d1e22'; g.fillRect(0, 0, 256, 64); g.fillStyle = '#ec4e26'; g.fillRect(0, 0, 10, 64); g.fillStyle = '#f2f0eb'; g.font = 'bold 30px "DejaVu Sans Mono",monospace'; g.fillText('LH-6 G', 22, 42); g.fillStyle = '#8a8d93'; g.font = '13px "DejaVu Sans Mono",monospace'; g.fillText('HEXAPOD · 01', 150, 40); }
const DECAL_TEX = new THREE.CanvasTexture(decalC); DECAL_TEX.colorSpace = THREE.SRGBColorSpace;

const _a = new THREE.Vector3(), _b = new THREE.Vector3(), UP = V(0, 1, 0);
function orient(m, a, b) { _a.set(...a); _b.set(...b); m.position.addVectors(_a, _b).multiplyScalar(0.5); _b.sub(_a); const L = _b.length(); if (L > 1e-6) m.quaternion.setFromUnitVectors(UP, _b.multiplyScalar(1 / L)); return L; }
function axisQ(m, ax) { _a.set(...ax).normalize(); m.quaternion.setFromUnitVectors(UP, _a); }
// 把沿 +x 的部件放到 a→b 方向，并让局部 +y 朝向 upHint 在垂直于 a→b 的分量
function frameAlong(m, a, b, upHint) { const x = V(b[0] - a[0], b[1] - a[1], b[2] - a[2]).normalize(); const y = V(...upHint).addScaledVector(x, -x.dot(V(...upHint))).normalize(); const z = V().crossVectors(x, y); m.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, y, z)); m.position.set(...a); }

export class Hexapod {
  constructor() {
    const g = this.g = new THREE.Group(); const R = HEX.bodyR;
    const hexShape = (r) => { const s = new THREE.Shape(); for (let k = 0; k < 6; k++) { const a = k * Math.PI / 3; const x = Math.cos(a) * r, y = Math.sin(a) * r; k ? s.lineTo(x, y) : s.moveTo(x, y); } s.closePath(); return s; };
    // —— 机身 ——
    g.add(mesh(geo('body', () => { const e = new THREE.ExtrudeGeometry(hexShape(R - 0.014), { depth: 0.112, bevelEnabled: true, bevelThickness: 0.014, bevelSize: 0.014, bevelSegments: 4 }); e.rotateX(-Math.PI / 2); e.translate(0, -0.036, 0); return e; }), M.white));
    // 六面装甲板（深色，带散热格栅）与腿部法兰
    g.add(mesh(geo('armor', () => { const L = []; const apo = (R) * Math.cos(Math.PI / 6); for (let k = 0; k < 6; k++) { const a = k * Math.PI / 3 + Math.PI / 6; const p = [Math.cos(a) * (apo + 0.012), 0.02, -Math.sin(a) * (apo + 0.012)]; L.push([rbox(0.012, 0.07, 0.17, 0.004), p, [0, a, 0]]); for (let v = 0; v < 5; v++) L.push([rbox(0.016, 0.006, 0.12, 0.002), [p[0] + Math.cos(a) * 0.004, 0.0 + v * 0.011, p[2] - Math.sin(a) * 0.004], [0, a, 0]]); } return merged(L); }), M.black));
    g.add(mesh(geo('flanges', () => { const L = []; for (const psi of PSI) { const p = [Math.sin(psi) * (HEX.mountR - 0.005), 0.0, Math.cos(psi) * (HEX.mountR - 0.005)]; L.push([cyl(0.062, 0.062, 0.02, 32), [p[0], 0.052, p[2]]]); } return merged(L); }), M.dark));
    g.add(mesh(geo('fbolts', () => { const L = []; for (const psi of PSI) { const p = [Math.sin(psi) * (HEX.mountR - 0.005), 0.0, Math.cos(psi) * (HEX.mountR - 0.005)]; for (let k = 0; k < 4; k++) { const a = k * Math.PI / 2 + Math.PI / 4; L.push([cyl(0.006, 0.006, 0.008, 10), [p[0] + Math.cos(a) * 0.045, 0.064, p[2] + Math.sin(a) * 0.045]]); } } return merged(L); }), M.chrome));
    for (const sd of [-1, 1]) { const dm = mesh(geo('decal', () => new THREE.PlaneGeometry(0.14, 0.035)), new THREE.MeshStandardMaterial({ map: DECAL_TEX, roughness: 0.5 })); const a = sd > 0 ? 0 : Math.PI; const apo = R * Math.cos(Math.PI / 6); dm.position.set(sd * (apo + 0.0195), 0.03, 0); dm.rotation.y = sd * Math.PI / 2; g.add(dm); void a; }
    // 腹部护板
    g.add(mesh(geo('belly', () => { const e = new THREE.ExtrudeGeometry(hexShape(R * 0.82), { depth: 0.02, bevelEnabled: true, bevelThickness: 0.006, bevelSize: 0.006, bevelSegments: 2 }); e.rotateX(-Math.PI / 2); e.translate(0, -0.075, 0); return e; }), M.black));
    // 顶部：深色面板、橙色饰条、对接盘与 4 个锁扣座、散热孔
    const top = this.top = new THREE.Group(); g.add(top);
    top.add(mesh(geo('top', () => { const e = new THREE.ExtrudeGeometry(hexShape(0.2), { depth: 0.008, bevelEnabled: true, bevelThickness: 0.003, bevelSize: 0.004, bevelSegments: 2 }); e.rotateX(-Math.PI / 2); e.translate(0, 0.088, 0); return e; }), M.black));
    top.add(mesh(geo('stripes', () => merged([[rbox(0.018, 0.006, 0.24, 0.002), [0.13, 0.1, 0]], [rbox(0.018, 0.006, 0.24, 0.002), [-0.13, 0.1, 0]]])), M.orange));
    top.add(mesh(geo('vents', () => { const L = []; for (const sd of [-1, 1]) for (let k = 0; k < 4; k++) L.push([rbox(0.06, 0.004, 0.008, 0.002), [sd * 0.155 - 0.03 * sd, 0.1, -0.13 + k * 0.016]]); return merged(L); }), M.dark));
    const dock = this.dockP = new THREE.Group(); g.add(dock);
    dock.add(mesh(geo('dock', () => cyl(0.1, 0.105, 0.016, 48)), M.chrome)); dock.children[0].position.y = 0.104;
    const dc = mesh(geo('dockc', () => cyl(0.058, 0.06, 0.02, 40)), M.black); dc.position.y = 0.107; dock.add(dc);
    const dr = mesh(geo('dockr', () => new THREE.TorusGeometry(0.08, 0.005, 8, 48)), M.orange); dr.rotation.x = Math.PI / 2; dr.position.y = 0.113; dock.add(dr);
    dock.add(mesh(geo('dockseats', () => { const L = []; for (let k = 0; k < 4; k++) { const a = k * Math.PI / 2 + Math.PI / 4; L.push([rbox(0.028, 0.02, 0.02, 0.004), [Math.sin(a) * 0.13, 0.104, Math.cos(a) * 0.13], [0, a, 0]]); } return merged(L); }), M.dark));
    // 尾部提手与天线
    const handle = mesh(geo('handle', () => { const c = new THREE.CatmullRomCurve3([V(-0.07, 0.09, -0.19), V(-0.06, 0.14, -0.2), V(0.06, 0.14, -0.2), V(0.07, 0.09, -0.19)]); return new THREE.TubeGeometry(c, 24, 0.008, 8); }), M.chrome); g.add(handle);
    const ant = mesh(geo('ant', () => merged([[cyl(0.005, 0.006, 0.16, 8), [0.12, 0.17, -0.12]], [new THREE.SphereGeometry(0.01, 10, 8), [0.12, 0.255, -0.12]]])), M.black); g.add(ant);
    for (const sd of [-1, 1]) { const led = mesh(geo('sled', () => rbox(0.006, 0.014, 0.06, 0.003)), M.ledC, false); led.position.set(sd * 0.2165, 0.065, 0); g.add(led); }
    // —— 头部 ——
    const head = this.head = new THREE.Group(); head.position.set(0, 0.025, 0.25); g.add(head);
    head.add(mesh(geo('head', () => rbox(0.19, 0.095, 0.12, 0.018)), M.white));
    head.add(mesh(geo('neck', () => rbox(0.12, 0.06, 0.06, 0.01)), M.black)); head.children[1].position.z = -0.07;
    const face = mesh(geo('face', () => rbox(0.17, 0.068, 0.014, 0.008)), M.black); face.position.z = 0.058; head.add(face);
    for (const sd of [-1, 1]) {
      const barrel = mesh(geo('barrel', () => { const c = cyl(0.03, 0.032, 0.05, 32); c.rotateX(Math.PI / 2); return c; }), M.white); barrel.position.set(sd * 0.05, 0.008, 0.07); head.add(barrel);
      const ln = mesh(geo('lens', () => { const c = cyl(0.022, 0.022, 0.012, 32); c.rotateX(Math.PI / 2); return c; }), M.glass); ln.position.set(sd * 0.05, 0.008, 0.096); head.add(ln);
      const lr = mesh(geo('lensr', () => new THREE.TorusGeometry(0.025, 0.004, 8, 32)), M.orange); lr.position.set(sd * 0.05, 0.008, 0.097); head.add(lr);
    }
    const hl = mesh(geo('hled', () => new THREE.SphereGeometry(0.006, 10, 8)), M.ledC, false); hl.position.set(0, -0.022, 0.067); head.add(hl);
    const hs = mesh(geo('hstripe', () => rbox(0.15, 0.006, 0.006, 0.002)), M.orange); hs.position.set(0, -0.038, 0.064); head.add(hs);
    // 激光雷达圆筒
    const lidar = new THREE.Group(); lidar.position.set(0, 0.06, -0.015); head.add(lidar);
    lidar.add(mesh(geo('lidarB', () => cyl(0.032, 0.034, 0.018, 32)), M.black));
    const lw = mesh(geo('lidarW', () => cyl(0.031, 0.031, 0.02, 32)), M.glass); lw.position.y = 0.018; lidar.add(lw);
    const lt = mesh(geo('lidarT', () => cyl(0.032, 0.031, 0.012, 32)), M.white); lt.position.y = 0.034; lidar.add(lt);
    // 雷达面板（绕头部后上沿翻起）
    const piv = this.piv = new THREE.Group(); piv.position.set(0, 0.048, -0.058); head.add(piv);
    const pn = mesh(geo('panel', () => { const b = rbox(0.17, 0.008, 0.11, 0.003); b.translate(0, 0, 0.055); return b; }), new THREE.MeshStandardMaterial({ color: '#ffffff', map: PANEL_TEX, emissive: '#ffffff', emissiveMap: PANEL_TEX, emissiveIntensity: 0.0, roughness: 0.4 })); piv.add(pn); this.panelMat = pn.material;
    const pf = mesh(geo('panelF', () => { const b = rbox(0.176, 0.006, 0.116, 0.003); b.translate(0, -0.004, 0.055); return b; }), M.black); piv.add(pf);
    const mast = this.mast = mesh(geo('mast', () => cyl(0.004, 0.004, 1, 8)), M.chrome); head.add(mast);
    this.mastLed = mesh(geo('hled', null), M.ledC, false); head.add(this.mastLed); this.mastGlow = glowSprite('#5fd4ff', 0.08, 0.9); head.add(this.mastGlow);
    // —— 腿（板件桁架＋舵机，参考用户给的六足机器人图片） ——
    this.legs = [];
    for (let i = 0; i < 6; i++) {
      const L = { coxa: Servo(), femS: Servo(), kneeS: Servo(),
        coxaBr: mesh(geo('coxaBr', () => pairGeo([[-0.03, -0.035], [0.075, -0.03], [0.09, 0], [0.075, 0.03], [-0.03, 0.035]], [[[0.0, -0.012], [0.05, -0.01], [0.05, 0.01], [0.0, 0.012]]], 0.056, 0.004)), MAT_PLATE),
        femur: mesh(geo('femur', femurGeo), MAT_PLATE), tibia: mesh(geo('tibia', tibiaGeo), MAT_PLATE),
        tbolts: mesh(geo('tbolts', () => merged([[0.0, -0.03], [0, -0.13], [0, -0.21]].map(([u, v]) => [cyl(0.006, 0.006, 0.07, 10), [u, v, 0], [Math.PI / 2, 0, 0]]))), M.chrome),
        tbrace: mesh(geo('tbrace', () => merged([[rbox(0.05, 0.012, 0.05, 0.003), [0, -0.29, 0]], [rbox(0.09, 0.012, 0.05, 0.003), [0, -0.005, 0]]])), M.black),
        tip: mesh(geo('tip', () => { const c = cyl(0.016, 0.024, 0.05, 20); c.translate(0, 0.025, 0); return c; }), M.rubber),
        tipR: mesh(geo('tipR', () => { const t = new THREE.TorusGeometry(0.02, 0.004, 8, 24); t.rotateX(Math.PI / 2); return t; }), M.orange),
        cable: null };
      for (const k in L) if (L[k]) g.add(L[k]); this.legs.push(L);
    }
    this.cableMat = M.black;
    dyn(g);
  }
  // s: { pose:{x,y,z,heading,pitch,roll} 或 parent(Object3D)+local, feet(世界坐标), fold(0~1), scanner(0~1), explode }
  update(s) {
    const g = this.g; g.visible = true;
    if (s.parent) { if (g.parent !== s.parent) s.parent.add(g); g.position.set(...(s.local || [0, 0, 0])); g.rotation.set(0, 0, 0); g.scale.setScalar(1); }
    else { if (g.parent !== scene) scene.add(g); setPose(g, [s.pose.x, s.pose.y, s.pose.z], s.pose.heading || 0, s.pose.pitch || 0, s.pose.roll || 0); }
    g.updateMatrixWorld(true); const inv = g.matrixWorld.clone().invert(); const e = s.explode || 0;
    this.head.position.set(0, 0.025 + 0.05 * e, 0.25 + 0.2 * e); this.top.position.y = 0.12 * e; this.dockP.position.y = 0.22 * e;
    const dep = s.scanner || 0; this.piv.rotation.x = -dep * 1.25; this.panelMat.emissiveIntensity = 0.15 + 0.55 * dep;
    this.mast.visible = this.mastLed.visible = this.mastGlow.visible = dep > 0.05; if (dep > 0.05) { this.mast.position.set(0.075, 0.048 + 0.1 * dep, -0.045); this.mast.scale.set(1, 0.2 * dep, 1); this.mastLed.position.set(0.075, 0.048 + 0.2 * dep, -0.045); this.mastGlow.position.copy(this.mastLed.position); }
    const fold = s.fold || 0, fk = smooth(fold);
    for (let i = 0; i < 6; i++) {
      const psi = PSI[i]; const mp = [Math.sin(psi) * HEX.mountR, 0, Math.cos(psi) * HEX.mountR]; let ik = foldAngles(i);
      if (s.feet && fold < 1) { const v = new THREE.Vector3(...s.feet[i]).applyMatrix4(inv); v.x -= mp[0]; v.z -= mp[2]; const th = -(psi - Math.PI / 2), c = Math.cos(th), sn = Math.sin(th); ik = legIK(v.x * c + v.z * sn, v.y, -v.x * sn + v.z * c); }
      const fa = foldAngles(i); const gm = lerp(ik[0], fa[0], fk), al = lerp(ik[1], fa[1], fk), be = lerp(ik[2], fa[2], fk);
      const th = psi - Math.PI / 2 + gm; const dir = [Math.cos(th), 0, -Math.sin(th)];
      const p1 = [mp[0] + dir[0] * HEX.L0, 0, mp[2] + dir[2] * HEX.L0];
      const knee = [p1[0] + dir[0] * HEX.L1 * Math.cos(al), HEX.L1 * Math.sin(al), p1[2] + dir[2] * HEX.L1 * Math.cos(al)];
      const foot = [knee[0] + dir[0] * HEX.L2 * Math.cos(al + be), knee[1] + HEX.L2 * Math.sin(al + be), knee[2] + dir[2] * HEX.L2 * Math.cos(al + be)];
      const mp2 = [...mp];
      if (e > 0) { const ox = Math.sin(psi) * 0.2 * e, oz = Math.cos(psi) * 0.2 * e; for (const q of [mp2, p1, knee, foot]) { q[0] += ox; q[2] += oz; } }
      const L = this.legs[i]; const ax = [-dir[2], 0, dir[0]];
      // 局部坐标系：x 沿杆件，y 在腿平面内（向上），z 沿关节轴
      const basis = (o, a, b, up = [0, 1, 0]) => { const x = V(b[0] - a[0], b[1] - a[1], b[2] - a[2]).normalize(); const z = V(...ax).normalize(); const y = V().crossVectors(z, x).normalize(); o.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, y, z)); o.position.set(...a); void up; };
      // 髋部偏航舵机：竖立在机身边缘（输出轴竖直）
      L.coxa.position.set(mp2[0] + dir[0] * 0.012, 0.055, mp2[2] + dir[2] * 0.012);
      { const x = V(...dir), z = V(0, 1, 0), y = V().crossVectors(z, x); L.coxa.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, y, z)); }
      // 髋→大腿舵机的 U 形支架
      basis(L.coxaBr, [mp2[0], 0.0, mp2[2]], [p1[0], 0.0, p1[2]]);
      // 大腿舵机在 p1（输出轴沿关节轴），膝舵机在膝部
      basis(L.femS, p1, knee); L.femS.position.set(...p1);
      basis(L.femur, p1, knee);
      const kd = V(foot[0] - knee[0], foot[1] - knee[1], foot[2] - knee[2]).normalize();
      basis(L.kneeS, knee, [knee[0] + kd.x, knee[1] + kd.y, knee[2] + kd.z]);
      // 小腿桁架：v 轴（几何 -y）沿 膝→足 方向
      { const vdir = kd.clone(), z = V(...ax).normalize(), u = V().crossVectors(vdir.clone().negate(), z).normalize(); const y = vdir.clone().negate(); const m = new THREE.Matrix4().makeBasis(u, y, z);
        for (const o of [L.tibia, L.tbolts, L.tbrace]) { o.quaternion.setFromRotationMatrix(m); o.position.set(...knee); } }
      L.tip.position.set(foot[0], foot[1], foot[2]); L.tip.quaternion.setFromUnitVectors(V(0, 1, 0), kd.clone().negate()); L.tipR.position.set(foot[0] - kd.x * 0.035, foot[1] - kd.y * 0.035, foot[2] - kd.z * 0.035); L.tipR.quaternion.copy(L.tip.quaternion);
      const n = V(0, 1, 0); const at = (u, k) => [p1[0] + (knee[0] - p1[0]) * u + n.x * k, p1[1] + (knee[1] - p1[1]) * u + n.y * k, p1[2] + (knee[2] - p1[2]) * u + n.z * k];
      // 线缆：机身法兰 → 膝关节，随腿运动重建
      if (L.cable) { g.remove(L.cable); L.cable.geometry.dispose(); }
      const top0 = [mp2[0] * 0.92, 0.07, mp2[2] * 0.92], mid = at(0.5, -0.06), kk = [knee[0] - n.x * 0.02, knee[1] - n.y * 0.02 - 0.01, knee[2] - n.z * 0.02];
      L.cable = new THREE.Mesh(new THREE.TubeGeometry(new THREE.QuadraticBezierCurve3(V(...top0), V(mid[0], mid[1] + 0.02, mid[2]), V(...kk)), 14, 0.0055, 6), this.cableMat); L.cable.castShadow = true; g.add(L.cable);
    }
    return g;
  }
  world(p) { this.g.updateMatrixWorld(true); return new THREE.Vector3(...p).applyMatrix4(this.g.matrixWorld).toArray(); }
}
export const HEXAPODS = pool(() => new Hexapod());
export function drawHexapod(s) { const h = HEXAPODS.get(); h.update(s); return h; }
