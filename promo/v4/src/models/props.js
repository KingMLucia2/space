// 配角模型（PBR 白模风格）：基站、救援车辆、救援直升机、救援人员（人台）、担架、航空基地、瓦砾缝隙里的手机、被困者热成像、片尾载荷（履带/潜水/无人船）。
import { THREE, dyn, pool, mkCanvas, COL } from '../engine.js';
import { M, mesh, rbox, cyl, lathe, span, setPose, glowSprite } from '../mats.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { clamp, lerp, smooth, mulberry32 } from '../util.js';
import { terrainHeight } from './cityData.js';
import { airportDetail } from './detail.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
function merged(list) { return mergeGeometries(list.map(([g, p = [0, 0, 0], r = [0, 0, 0], s = [1, 1, 1]]) => { const c = g.index ? g.toNonIndexed() : g.clone(); c.applyMatrix4(new THREE.Matrix4().compose(V(...p), new THREE.Quaternion().setFromEuler(new THREE.Euler(...r, 'YXZ')), V(...s))); for (const k of Object.keys(c.attributes)) if (!['position', 'normal', 'uv'].includes(k)) c.deleteAttribute(k); return c; }), false); }
const GEO = {}; const geo = (k, f) => GEO[k] || (GEO[k] = f());
const tex = (c) => { const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t; };
const std = (o) => new THREE.MeshStandardMaterial(o);
const MW = std({ color: '#eeebe5', roughness: 0.75 }), MW2 = std({ color: '#e2ddd5', roughness: 0.85 });

// —— 基站：白色舱体、橙色腰线、两扇舱盖、升降平台（降落圈与 H 标）、气象杆、状态灯带 ——
export const DOCK = { w: 3.8, d: 3.8, h: 1.7, platLow: 0.75, platHigh: 1.72, ry: -0.9 };
export function dockTop(lift) { return DOCK.platLow + (DOCK.platHigh - DOCK.platLow) * smooth(lift) + 0.04; }
const padC = mkCanvas(512, 512); { const g = padC.getContext('2d'); g.fillStyle = '#2a2c30'; g.fillRect(0, 0, 512, 512); g.strokeStyle = '#ec4e26'; g.lineWidth = 16; g.beginPath(); g.arc(256, 256, 200, 0, 7); g.stroke(); g.lineWidth = 4; g.beginPath(); g.arc(256, 256, 176, 0, 7); g.stroke(); g.fillStyle = '#f2f0eb'; g.fillRect(190, 150, 34, 212); g.fillRect(288, 150, 34, 212); g.fillRect(190, 240, 132, 32); g.fillStyle = '#8a8d93'; g.font = 'bold 22px "DejaVu Sans Mono",monospace'; g.fillText('LH-6 BASE', 196, 420); }
const PAD_TEX = tex(padC);
export class BaseStation {
  constructor() {
    const g = this.g = new THREE.Group(); const { w, d, h } = DOCK;
    g.add(mesh(geo('dkSlab', () => rbox(w + 2.4, 0.3, d + 2.4, 0.06)), MW2)); g.children[0].position.y = -0.1;
    // 舱体是空心的：四面墙＋底板，顶部是舱口（原来是实心盒子，舱盖打开后仍有一层白色顶面，平台和结合体升降时会穿过它）
    const TW = 0.16, bay = w - 2 * TW;
    g.add(mesh(geo('dkBody2', () => merged([[rbox(w, h, TW, 0.04), [0, h / 2, d / 2 - TW / 2]], [rbox(w, h, TW, 0.04), [0, h / 2, -d / 2 + TW / 2]], [rbox(TW, h, d - 2 * TW + 0.04, 0.04), [w / 2 - TW / 2, h / 2, 0]], [rbox(TW, h, d - 2 * TW + 0.04, 0.04), [-w / 2 + TW / 2, h / 2, 0]],
      [rbox(w - 0.02, 0.14, d - 0.02, 0.03), [0, 0.07, 0]], ...[[1, 1], [1, -1], [-1, 1], [-1, -1]].map(([sx, sz]) => [rbox(TW, h + 0.004, TW, 0.07), [sx * (w / 2 - TW / 2), h / 2, sz * (d / 2 - TW / 2)]])])), MW));
    const linerM = std({ color: '#3a3e45', roughness: 0.7, metalness: 0.2 });
    g.add(mesh(geo('dkLiner', () => merged([[new THREE.BoxGeometry(bay, h - 0.16, 0.01), [0, h / 2 + 0.06, bay / 2 - 0.006]], [new THREE.BoxGeometry(bay, h - 0.16, 0.01), [0, h / 2 + 0.06, -bay / 2 + 0.006]], [new THREE.BoxGeometry(0.01, h - 0.16, bay), [bay / 2 - 0.006, h / 2 + 0.06, 0]], [new THREE.BoxGeometry(0.01, h - 0.16, bay), [-bay / 2 + 0.006, h / 2 + 0.06, 0]], [new THREE.BoxGeometry(bay, 0.01, bay), [0, 0.145, 0]],
      ...[-1, 1].flatMap((sd) => [[new THREE.BoxGeometry(0.06, h - 0.2, 0.012), [sd * 0.9, h / 2 + 0.06, bay / 2 - 0.014]], [new THREE.BoxGeometry(0.06, h - 0.2, 0.012), [sd * 0.9, h / 2 + 0.06, -bay / 2 + 0.014]]])])), linerM, false));
    g.add(mesh(geo('dkBay', () => merged([[cyl(0.26, 0.3, 0.5, 24), [0, 0.39, 0]]])), M.dark)); // 升降柱底座
    this.column = mesh(geo('dkCol', () => { const c = cyl(0.17, 0.17, 1, 20); c.translate(0, 0.5, 0); return c; }), M.chrome); this.column.position.y = 0.6; g.add(this.column);
    g.add(mesh(geo('dkBand', () => merged([[rbox(w + 0.02, 0.1, 0.03, 0.012), [0, 0.92, d / 2 + 0.008]], [rbox(w + 0.02, 0.1, 0.03, 0.012), [0, 0.92, -d / 2 - 0.008]], [rbox(0.03, 0.1, d + 0.02, 0.012), [w / 2 + 0.008, 0.92, 0]], [rbox(0.03, 0.1, d + 0.02, 0.012), [-w / 2 - 0.008, 0.92, 0]]])), M.orange));
    g.add(mesh(geo('dkVents', () => { const L = []; for (const sd of [-1, 1]) for (let k = 0; k < 5; k++) L.push([rbox(0.5, 0.04, 0.03, 0.01), [sd * 0.9, 0.45 + k * 0.08, d / 2 + 0.01]]); return merged(L); }), M.black));
    this.lightMat = new THREE.MeshBasicMaterial({ color: '#5fd4ff' }); const lb = mesh(geo('dkLight', () => rbox(w * 0.8, 0.05, 0.03, 0.01)), this.lightMat, false); lb.position.set(0, h - 0.12, d / 2 + 0.01); g.add(lb);
    // 平台
    const plat = this.plat = new THREE.Group(); g.add(plat);
    plat.add(mesh(geo('dkPlat', () => rbox(w - 0.35, 0.08, d - 0.35, 0.03)), M.black));
    const pad = new THREE.Mesh(geo('dkPad', () => new THREE.PlaneGeometry(w - 0.5, d - 0.5).rotateX(-Math.PI / 2)), std({ map: PAD_TEX, roughness: 0.6 })); pad.position.y = 0.045; pad.receiveShadow = true; plat.add(pad);
    // 舱盖（铰链在两侧上沿）
    this.lids = [-1, 1].map((sd) => { const piv = new THREE.Group(); piv.position.set(sd * w / 2, h, 0); g.add(piv); const lid = mesh(geo('dkLid', () => rbox(w / 2, 0.12, d + 0.04, 0.04)), MW); lid.position.set(-sd * w / 4, 0.06, 0); piv.add(lid);
      const st = mesh(geo('dkLidS', () => rbox(0.06, 0.13, d - 0.2, 0.02)), M.orange); st.position.set(-sd * 0.15, 0.065, 0); piv.add(st); return { piv, sd }; });
    // 气象杆与警示灯
    const mast = mesh(geo('dkMast', () => merged([[cyl(0.03, 0.04, 2.6, 10), [w / 2 - 0.3, 1.3, -d / 2 - 0.38]], [new THREE.SphereGeometry(0.06, 10, 8), [w / 2 - 0.3, 2.65, -d / 2 - 0.38]], [rbox(0.08, 0.06, 0.38, 0.02), [w / 2 - 0.3, 0.9, -d / 2 - 0.19]], [rbox(0.08, 0.06, 0.38, 0.02), [w / 2 - 0.3, 0.4, -d / 2 - 0.19]]])), M.chrome); g.add(mast); // 气象杆装在背面（舱盖翻开扫过的范围之外）
    this.cups = new THREE.Group(); this.cups.position.set(w / 2 - 0.3, 2.7, -d / 2 - 0.38); g.add(this.cups); for (let k = 0; k < 3; k++) { const a = k * 2.094; const arm = mesh(geo('dkCup', () => merged([[rbox(0.24, 0.015, 0.015, 0.004), [0.12, 0, 0]], [new THREE.SphereGeometry(0.035, 10, 8, 0, Math.PI * 2, 0, Math.PI / 2), [0.24, 0, 0], [Math.PI / 2, 0, 0]]])), M.white); arm.rotation.y = a; this.cups.add(arm); }
    // 细节：深色底座、侧面检修门、控制屏、背面两根鞭状天线、检修踏步、线缆护管
    g.add(mesh(geo('dkPlinth', () => rbox(w + 0.12, 0.14, d + 0.12, 0.03)), M.black)); g.children[g.children.length - 1].position.y = 0.07;
    g.add(mesh(geo('dkDoor', () => merged([[rbox(0.03, 1.15, 0.95, 0.01), [w / 2 + 0.012, 0.85, 0.4]], [rbox(0.04, 0.05, 0.22, 0.01), [w / 2 + 0.04, 0.85, 0.05]]])), M.shell2));
    g.add(mesh(geo('dkDoorL', () => merged([[rbox(0.02, 1.2, 0.02, 0.005), [w / 2 + 0.02, 0.85, 0.89]], [rbox(0.02, 1.2, 0.02, 0.005), [w / 2 + 0.02, 0.85, -0.09]], [rbox(0.02, 0.02, 1.0, 0.005), [w / 2 + 0.02, 1.45, 0.4]], [rbox(0.02, 0.02, 1.0, 0.005), [w / 2 + 0.02, 0.25, 0.4]]])), M.dark));
    const scr = mesh(geo('dkScr', () => rbox(0.46, 0.26, 0.02, 0.01)), new THREE.MeshBasicMaterial({ color: '#7fdcff' }), false); scr.position.set(w / 2 - 0.55, 0.62, d / 2 + 0.012); g.add(scr);
    g.add(mesh(geo('dkScrF', () => rbox(0.56, 0.36, 0.02, 0.01)), M.black)); g.children[g.children.length - 1].position.set(w / 2 - 0.55, 0.62, d / 2 + 0.004);
    g.add(mesh(geo('dkAnt', () => merged([[cyl(0.012, 0.02, 1.6, 8), [-w / 2 + 0.3, h + 0.3, -d / 2 - 0.12]], [cyl(0.012, 0.02, 1.2, 8), [-w / 2 + 0.55, h + 0.1, -d / 2 - 0.12]], [rbox(0.4, 0.1, 0.12, 0.02), [-w / 2 + 0.42, h - 0.45, -d / 2 - 0.08]]])), M.black)); // 鞭状天线装在背面上沿外侧
    g.add(mesh(geo('dkStep', () => merged([[rbox(0.5, 0.2, 0.9, 0.02), [w / 2 + 0.3, 0.1, -0.9]], [rbox(0.25, 0.2, 0.9, 0.02), [w / 2 + 0.17, 0.3, -0.9]]])), M.dark));
    g.add(mesh(geo('dkPipe', () => merged([[cyl(0.05, 0.05, 1.2, 10), [-0.6, 0.6, -d / 2 - 0.06]], [cyl(0.05, 0.05, 1.2, 10), [-0.42, 0.6, -d / 2 - 0.06]], [rbox(0.4, 0.06, 0.12, 0.02), [-0.51, 1.18, -d / 2 - 0.06]]])), M.dark));
    this.beacon = mesh(geo('dkBeacon', () => new THREE.SphereGeometry(0.06, 12, 8)), new THREE.MeshBasicMaterial({ color: '#5fd4ff' }), false); this.beacon.position.set(-w / 2 + 0.2, h - 0.12, d / 2 + 0.06); g.add(this.beacon); // 警示灯在正面上沿下方，不被舱盖压住
    this.beaconGlow = glowSprite('#5fd4ff', 0.6, 0.6, false); this.beaconGlow.position.copy(this.beacon.position); g.add(this.beaconGlow);
    dyn(g);
  }
  // pos 世界坐标；open 0~1 舱盖；lift 0~1 平台；lights 0~1
  update(pos, open, lift, t, lights = 1) {
    const g = this.g; g.visible = true; setPose(g, pos, DOCK.ry);
    this.plat.position.y = DOCK.platLow + (DOCK.platHigh - DOCK.platLow) * smooth(lift); this.plat.visible = true;
    const a = smooth(open) * 1.95; for (const L of this.lids) L.piv.rotation.z = -L.sd * a; this.column.scale.y = Math.max(0.05, this.plat.position.y - 0.04 - 0.6); // 两扇舱盖绕外侧上沿铰链向上、向外翻开（原来方向反了，会翻进舱体）
    this.cups.rotation.y = t * 3.1; this.lightMat.color.set(lights > 0.5 ? '#7fe0ff' : '#5c6e78');
    const bl = lights * (Math.sin(t * 6) > 0.3 ? 1 : 0.25); this.beaconGlow.material.opacity = 0.7 * bl; this.beacon.material.color.set(bl > 0.5 ? '#7fe0ff' : '#3a6f85');
    return g;
  }
  world(p) { this.g.updateMatrixWorld(); return V(...p).applyMatrix4(this.g.matrixWorld).toArray(); }
}
export const BASE = pool(() => new BaseStation());

// —— 救援车辆：消防车（红）、救护车（白＋红十字），警灯排红蓝交替 ——
const ambC = mkCanvas(128, 128); { const g = ambC.getContext('2d'); g.fillStyle = '#f4f2ee'; g.fillRect(0, 0, 128, 128); g.fillStyle = '#d93a2c'; g.fillRect(52, 24, 24, 80); g.fillRect(24, 52, 80, 24); }
const AMB_TEX = tex(ambC);
export class Vehicle {
  constructor(kind) {
    const g = this.g = new THREE.Group(); const fire = kind === 'fire'; const len = fire ? 8.6 : 6.4; const bodyL = len * 0.68, cabL = len * 0.27;
    const bodyMat = fire ? std({ color: '#c9372b', roughness: 0.45, metalness: 0.1 }) : std({ color: '#f2f0ec', roughness: 0.45 });
    const body = mesh(geo('vb' + kind, () => rbox(2.5, fire ? 2.55 : 2.45, bodyL, 0.12)), bodyMat); body.position.set(0, 0.55 + (fire ? 2.55 : 2.45) / 2, -len / 2 + bodyL / 2); g.add(body);
    const cab = mesh(geo('vc' + kind, () => rbox(2.5, 2.1, cabL, 0.18)), bodyMat); cab.position.set(0, 0.55 + 1.05, len / 2 - cabL / 2); g.add(cab);
    const glass = mesh(geo('vg', () => rbox(2.3, 0.85, 0.06, 0.04)), M.glass); glass.position.set(0, 2.05, len / 2 + 0.01); g.add(glass);
    for (const sd of [-1, 1]) { const sg = mesh(geo('vsg', () => rbox(0.06, 0.75, 0.8, 0.03)), M.glass); sg.position.set(sd * 1.26, 2.05, len / 2 - cabL / 2 + 0.1); g.add(sg); }
    const stripe = mesh(geo('vs' + kind, () => rbox(2.52, 0.14, len - 0.4, 0.04)), fire ? M.white : std({ color: '#d93a2c', roughness: 0.4 })); stripe.position.set(0, 1.3, 0); g.add(stripe);
    g.add(mesh(geo('vw' + len, () => { const L = []; for (const za of (fire ? [-len * 0.36, -len * 0.21, len * 0.3] : [-len * 0.3, len * 0.3])) for (const sd of [-1, 1]) L.push([cyl(0.5, 0.5, 0.36, 18), [sd * 1.15, 0.5, za], [0, 0, Math.PI / 2]]); return merged(L); }), M.rubber));
    if (fire) { const lad = mesh(geo('vlad', () => { const L = [[rbox(0.08, 0.08, len * 0.85, 0.02), [-0.45, 3.4, -0.3]], [rbox(0.08, 0.08, len * 0.85, 0.02), [0.45, 3.4, -0.3]]]; for (let z = -len * 0.4; z < len * 0.3; z += 0.45) L.push([rbox(0.9, 0.04, 0.04, 0.01), [0, 3.4, z]]); return merged(L); }), M.chrome); g.add(lad); }
    else { for (const sd of [-1, 1]) { const cr = new THREE.Mesh(geo('vcr', () => new THREE.PlaneGeometry(1.1, 1.1)), std({ map: AMB_TEX, roughness: 0.5 })); cr.position.set(sd * 1.262, 2.0, -0.8); cr.rotation.y = sd * Math.PI / 2; g.add(cr); } }
    const bar = mesh(geo('vbar', () => rbox(1.7, 0.16, 0.36, 0.05)), M.black); bar.position.set(0, 2.78, len / 2 - cabL / 2); g.add(bar);
    this.red = new THREE.MeshBasicMaterial({ color: '#ff3b30' }); this.blue = new THREE.MeshBasicMaterial({ color: '#3a7bff' });
    for (const [sx, m] of [[0.5, this.red], [-0.5, this.blue]]) { const l = mesh(geo('vl', () => rbox(0.5, 0.14, 0.3, 0.04)), m, false); l.position.set(sx, 2.86, len / 2 - cabL / 2); g.add(l); }
    this.gR = glowSprite('#ff3b30', 3.2, 0.7, false); this.gR.position.set(0.5, 2.9, len / 2 - cabL / 2); g.add(this.gR); this.gB = glowSprite('#3a7bff', 3.2, 0.7, false); this.gB.position.set(-0.5, 2.9, len / 2 - cabL / 2); g.add(this.gB);
    dyn(g);
  }
  update(pos, ry, t, i = 0) { const g = this.g; g.visible = true; setPose(g, pos, ry); const k = (t * 2.2 + i * 0.37) % 1; const r = k < 0.25, b = k > 0.5 && k < 0.75; this.red.color.set(r ? '#ff3b30' : '#5a1814'); this.blue.color.set(b ? '#4a8bff' : '#18264a'); this.gR.material.opacity = r ? 0.75 : 0; this.gB.material.opacity = b ? 0.75 : 0; return g; }
}
const FIRE_TRUCKS = pool(() => new Vehicle('fire')), AMBULANCES = pool(() => new Vehicle('amb'));
export const VEH_LIST = [[326, 2.2, -Math.PI / 2, 'fire'], [338, -2.6, -Math.PI / 2 + 0.08, 'fire'], [352, 2.0, -Math.PI / 2 - 0.05, 'amb']];
export function drawVehicles(t) { VEH_LIST.forEach(([x, z, ry, kind], i) => (kind === 'fire' ? FIRE_TRUCKS : AMBULANCES).get().update([x, terrainHeight(x, z), z], ry, t, i)); }

// —— 救援直升机：白色机身＋橙色色带、深色座舱玻璃、尾梁与橙色垂尾、滑橇、主旋翼（桨叶＋模糊桨盘）、尾桨、左侧滑门（暖光机舱）、右侧绞车吊臂与钢缆、探照灯 ——
const heliDisc = mkCanvas(128, 128); { const g = heliDisc.getContext('2d'); const gr = g.createRadialGradient(64, 64, 6, 64, 64, 64); gr.addColorStop(0, 'rgba(30,30,32,0)'); gr.addColorStop(0.2, 'rgba(30,30,32,0.12)'); gr.addColorStop(0.9, 'rgba(30,30,32,0.2)'); gr.addColorStop(1, 'rgba(30,30,32,0)'); g.fillStyle = gr; g.fillRect(0, 0, 128, 128); }
const HELI_DISC = tex(heliDisc);
// 机身放样：沿 z 的关键截面（半宽 w、顶高 t、底深 b、中心高 yc），截面为超椭圆；skip(θ, z) 为真时挖掉该面（舱门开口）。
// patch 用同一曲面的一部分（θ、z 范围＋外移量）做玻璃、色带、舱门板，保证贴合机身。
const HULL = [[2.95, 0.04, 0.05, 0.04, -0.1], [2.75, 0.36, 0.34, 0.42, -0.12], [2.45, 0.7, 0.62, 0.72, -0.08], [2.0, 0.98, 0.9, 0.9, -0.02], [1.4, 1.14, 1.06, 0.96, 0], [0.6, 1.23, 1.13, 0.98, 0], [-0.4, 1.25, 1.15, 0.98, 0], [-1.3, 1.2, 1.12, 0.92, 0], [-2.0, 1.0, 1.02, 0.6, 0.05], [-2.55, 0.66, 0.84, 0.18, 0.28], [-2.95, 0.36, 0.62, 0.16, 0.5]];
function hullAt(z) { const H = HULL; let i = 0; while (i < H.length - 2 && z < H[i + 1][0]) i++; const A = H[Math.max(0, i - 1)], B = H[i], Cc = H[i + 1], D = H[Math.min(H.length - 1, i + 2)]; const u = clamp((B[0] - z) / (B[0] - Cc[0]));
  const cr = (k) => { const p0 = A[k], p1 = B[k], p2 = Cc[k], p3 = D[k]; return 0.5 * ((2 * p1) + (-p0 + p2) * u + (2 * p0 - 5 * p1 + 4 * p2 - p3) * u * u + (-p0 + 3 * p1 - 3 * p2 + p3) * u * u * u); }; return { w: Math.max(0.01, cr(1)), t: Math.max(0.01, cr(2)), b: Math.max(0.01, cr(3)), yc: cr(4) }; }
const SE = 2.6, se = (v) => Math.sign(v) * Math.pow(Math.abs(v), 2 / SE);
function hullPt(th, z, off = 0) { const h = hullAt(z); const c = Math.cos(th), s2 = Math.sin(th); return [(h.w + off) * se(c), h.yc + (s2 >= 0 ? h.t + off : h.b + off) * se(s2), z]; }
function hullGeo(th0, th1, z0, z1, nth, nz, off = 0, skip = null) {
  const pos = [], idx = []; for (let j = 0; j <= nz; j++) { const z = lerp(z0, z1, j / nz); for (let i = 0; i <= nth; i++) pos.push(...hullPt(lerp(th0, th1, i / nth), z, off)); }
  for (let j = 0; j < nz; j++) for (let i = 0; i < nth; i++) { if (skip && skip(lerp(th0, th1, (i + 0.5) / nth), lerp(z0, z1, (j + 0.5) / nz))) continue; const a = j * (nth + 1) + i, b2 = a + 1, c = a + nth + 1, d = c + 1; idx.push(a, c, b2, b2, c, d); }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals(); return g; }
const DOOR_TH = [Math.PI - 0.62, Math.PI + 0.66], DOOR_Z = [-0.35, 1.05]; // 左门 θ 范围；右门与之镜像 [-0.66, 0.62]
const nth = (th) => ((th % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
const inDoor = (th0, z) => { if (z <= DOOR_Z[0] || z >= DOOR_Z[1]) return false; const th = nth(th0); return (th > DOOR_TH[0] && th < DOOR_TH[1]) || th < 0.62 || th > 2 * Math.PI - 0.66; };
const heliText = (() => { const c = mkCanvas(1024, 128), g = c.getContext('2d'); g.fillStyle = '#ec4e26'; g.font = '900 78px "Noto Sans SC",sans-serif'; g.textBaseline = 'middle'; g.fillText('应急救援', 8, 66); g.fillStyle = '#2b2d31'; g.font = '700 54px "DejaVu Sans Mono",monospace'; g.fillText('B-7690 · LH RESCUE', 360, 68); return tex(c); })();
export class Helicopter {
  constructor() {
    const g = this.g = new THREE.Group();
    const hw = std({ color: '#f3f1ed', roughness: 0.32, metalness: 0.05 }), dk = std({ color: '#3a3d43', roughness: 0.45, metalness: 0.3 });
    // 机身（左侧挖出舱门）与机鼻封口
    g.add(mesh(geo('hHull', () => hullGeo(-Math.PI / 2, 1.5 * Math.PI, 2.95, -2.95, 72, 46, 0, inDoor)), hw)); // 接缝放在机腹
    g.add(mesh(geo('hTailCap', () => { const c = new THREE.SphereGeometry(0.42, 20, 12, 0, Math.PI * 2, 0, Math.PI / 2); c.rotateX(-Math.PI / 2); c.scale(0.86, 1, 0.5); c.translate(0, 0.52, -2.95); return c; }), hw));
    // 座舱玻璃（整片深色面罩＋中间窗框）、下视窗、右侧舱窗、后舱窗
    g.add(mesh(geo('hGlass', () => mergeGeometries([hullGeo(0.22, Math.PI - 0.22, 2.8, 1.42, 30, 16, 0.012), hullGeo(Math.PI + 0.55, 2 * Math.PI - 0.55, 2.62, 2.12, 16, 6, 0.012), hullGeo(-0.22, 0.32, -0.72, -1.38, 8, 6, 0.012), hullGeo(Math.PI - 0.32, Math.PI + 0.22, -0.72, -1.38, 8, 6, 0.012)], false)), M.glass));
    g.add(mesh(geo('hFrame', () => mergeGeometries([hullGeo(Math.PI / 2 - 0.035, Math.PI / 2 + 0.035, 2.82, 1.4, 2, 16, 0.022), hullGeo(0.2, Math.PI - 0.2, 1.47, 1.4, 30, 1, 0.024), hullGeo(0.55, 0.62, 2.7, 1.42, 2, 12, 0.022), hullGeo(Math.PI - 0.62, Math.PI - 0.55, 2.7, 1.42, 2, 12, 0.022)], false)), hw));
    // 涂装：下侧橙色宽带（避开舱门）、窗下细线
    const stripeSkip = inDoor;
    g.add(mesh(geo('hStripe', () => mergeGeometries([hullGeo(-0.62, -0.26, 2.45, -2.25, 6, 30, 0.008, stripeSkip), hullGeo(Math.PI + 0.26, Math.PI + 0.62, 2.45, -2.25, 6, 30, 0.008, stripeSkip), hullGeo(0.04, 0.1, 1.38, -2.1, 2, 24, 0.008, stripeSkip), hullGeo(Math.PI - 0.1, Math.PI - 0.04, 1.38, -2.1, 2, 24, 0.008, stripeSkip)], false)), M.orange));
    // 机舱内饰（暖光）：内壁、深色地板、三张座椅、担架架
    const cab = new THREE.Mesh(geo('hCab', () => new THREE.BoxGeometry(1.9, 1.45, 2.5)), std({ color: '#f1e3c8', roughness: 0.8, emissive: '#ffcf8a', emissiveIntensity: 0.35, side: THREE.BackSide })); cab.position.set(0, 0.025, 0.05); g.add(cab);
    g.add(mesh(geo('hCabF', () => merged([[new THREE.BoxGeometry(1.88, 0.04, 2.48), [0, -0.68, 0.05]], [rbox(0.48, 0.45, 0.5, 0.06), [-0.55, -0.45, -0.95]], [rbox(0.48, 0.45, 0.5, 0.06), [0, -0.45, -0.95]], [rbox(0.48, 0.45, 0.5, 0.06), [0.55, -0.45, -0.95]], [rbox(0.48, 0.65, 0.1, 0.04), [-0.55, -0.05, -1.17]], [rbox(0.48, 0.65, 0.1, 0.04), [0, -0.05, -1.17]], [rbox(0.48, 0.65, 0.1, 0.04), [0.55, -0.05, -1.17]]])), dk, false));
    g.add(mesh(geo('hCabS', () => merged([[rbox(0.6, 0.08, 1.7, 0.03), [0.1, -0.6, 0.35]]])), M.orange, false));
    // 左侧滑门（门板＋门窗＋色带，沿导轨后移）、导轨
    this.doorLeaf = new THREE.Group(); g.add(this.doorLeaf);
    const Z0 = DOOR_Z[1] + 0.03, Z1 = DOOR_Z[0] - 0.03;
    this.doorLeaf.add(mesh(geo('hDoor', () => mergeGeometries([hullGeo(DOOR_TH[0] - 0.02, DOOR_TH[1] + 0.02, Z0, Z1, 10, 10, 0.03), hullGeo(-0.68, 0.64, Z0, Z1, 10, 10, 0.03)], false)), hw));
    this.doorLeaf.add(mesh(geo('hDoorW', () => mergeGeometries([hullGeo(DOOR_TH[0] + 0.12, Math.PI + 0.05, 0.85, 0.0, 6, 6, 0.042), hullGeo(-0.05, 0.5, 0.85, 0.0, 6, 6, 0.042)], false)), M.glass));
    this.doorLeaf.add(mesh(geo('hDoorS', () => mergeGeometries([hullGeo(Math.PI + 0.26, Math.PI + 0.62, Z0, Z1, 4, 6, 0.04), hullGeo(-0.62, -0.26, Z0, Z1, 4, 6, 0.04)], false)), M.orange));
    this.doorLeaf.add(mesh(geo('hDoorH', () => merged([[rbox(0.04, 0.06, 0.22, 0.015), [-1.31, 0.05, 0.85]], [rbox(0.04, 0.06, 0.22, 0.015), [1.31, 0.05, 0.85]]])), dk));
    g.add(mesh(geo('hRail', () => merged([[rbox(0.05, 0.05, 2.9, 0.02), [-1.17, 0.8, -0.4]], [rbox(0.05, 0.05, 2.9, 0.02), [-1.3, -0.62, -0.4]], [rbox(0.05, 0.05, 2.9, 0.02), [1.17, 0.8, -0.4]], [rbox(0.05, 0.05, 2.9, 0.02), [1.3, -0.62, -0.4]]])), dk));
    // 发动机整流罩、进气格栅、双排气管、桅杆整流罩
    g.add(mesh(geo('hCowl', () => merged([[rbox(1.25, 0.6, 2.75, 0.24), [0, 1.36, -0.75]], [cyl(0.34, 0.24, 0.32, 24), [0, 1.74, -0.6]]])), hw));
    g.add(mesh(geo('hIntake', () => { const L = []; for (const sd of [-1, 1]) { L.push([rbox(0.06, 0.34, 0.62, 0.03), [sd * 0.63, 1.38, 0.2]]); for (let k = 0; k < 5; k++) L.push([rbox(0.03, 0.02, 0.56, 0.005), [sd * 0.66, 1.26 + k * 0.06, 0.2]]); L.push([cyl(0.12, 0.14, 0.5, 16), [sd * 0.4, 1.46, -2.12], [Math.PI / 2 - 0.35, sd * 0.25, 0]]); } return merged(L); }), dk));
    // 主旋翼：桨毂、变距拉杆、四片桨叶（桨尖橙色）
    this.rotor = new THREE.Group(); this.rotor.position.set(0, 1.95, -0.6); g.add(this.rotor);
    this.rotor.add(mesh(geo('hHub', () => merged([[cyl(0.2, 0.26, 0.3, 20)], [new THREE.SphereGeometry(0.17, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2), [0, 0.15, 0]], [cyl(0.34, 0.34, 0.05, 24), [0, -0.12, 0]]])), dk));
    this.blades = new THREE.Group(); this.rotor.add(this.blades);
    for (let k = 0; k < 4; k++) { const b = new THREE.Group(); b.rotation.y = k * Math.PI / 2; this.blades.add(b);
      b.add(mesh(geo('hGrip', () => merged([[rbox(0.55, 0.12, 0.18, 0.04), [0.42, 0, 0]], [cyl(0.015, 0.015, 0.22, 6), [0.3, -0.12, 0.09]]])), dk));
      b.add(mesh(geo('hBlade', () => { const bb = rbox(5.05, 0.05, 0.34, 0.02); bb.translate(3.1, 0, 0); return bb; }), M.black)); b.add(mesh(geo('hTip', () => { const bb = rbox(0.42, 0.052, 0.34, 0.02); bb.translate(5.83, 0, 0); return bb; }), M.orange)); }
    this.disc = new THREE.Mesh(geo('hDisc', () => new THREE.CircleGeometry(6.1, 64).rotateX(-Math.PI / 2)), new THREE.MeshBasicMaterial({ map: HELI_DISC, transparent: true, depthWrite: false, side: THREE.DoubleSide })); this.disc.position.y = 0.05; this.rotor.add(this.disc);
    // 尾梁（渐细）、平尾与端板、涵道尾桨（导管＋风扇＋上方垂尾）、尾橇
    g.add(mesh(geo('hBoom', () => { const c = cyl(0.3, 0.17, 4.4, 24); c.rotateX(Math.PI / 2); c.translate(0, 0.62, -5.05); return c; }), hw));
    g.add(mesh(geo('hStab', () => merged([[rbox(2.5, 0.07, 0.62, 0.03), [0, 0.64, -6.1]]])), hw)); g.add(mesh(geo('hStabE', () => merged([[rbox(0.07, 0.6, 0.5, 0.03), [1.25, 0.74, -6.12]], [rbox(0.07, 0.6, 0.5, 0.03), [-1.25, 0.74, -6.12]]])), M.orange));
    g.add(mesh(geo('hFen', () => { const L = [[rbox(0.32, 1.25, 1.35, 0.1), [0, 0.98, -7.62]]]; return merged(L); }), hw));
    g.add(mesh(geo('hFenD', () => { const t = new THREE.TorusGeometry(0.44, 0.07, 10, 36); t.rotateY(Math.PI / 2); t.translate(0, 0.98, -7.6); return t; }), dk));
    g.add(mesh(geo('hFin', () => merged([[rbox(0.18, 1.0, 0.85, 0.06), [0, 1.98, -7.95], [-0.38, 0, 0]], [rbox(0.2, 0.1, 0.6, 0.03), [0, 0.32, -7.7]]])), M.orange));
    this.tail = new THREE.Mesh(geo('hTail', () => new THREE.CircleGeometry(0.42, 32).rotateY(Math.PI / 2)), new THREE.MeshBasicMaterial({ map: HELI_DISC, transparent: true, depthWrite: false, side: THREE.DoubleSide })); this.tail.position.set(0.17, 0.98, -7.6); g.add(this.tail);
    this.fan = mesh(geo('hFan', () => { const L = []; for (let k = 0; k < 9; k++) L.push([rbox(0.03, 0.36, 0.07, 0.01), [0, 0.18, 0], [k * 0.698, 0, 0]]); L.push([cyl(0.08, 0.08, 0.1, 12), [0, 0, 0], [0, 0, Math.PI / 2]]); return merged(L); }), dk); this.fan.position.set(0, 0.98, -7.6); g.add(this.fan);
    // 滑橇：拱形横管、滑管（前端上翘）、登机踏板
    g.add(mesh(geo('hSkid', () => { const L = []; for (const z of [1.05, -0.95]) { const tb = new THREE.TubeGeometry(new THREE.QuadraticBezierCurve3(new THREE.Vector3(-1.28, -1.47, z), new THREE.Vector3(0, -0.72, z), new THREE.Vector3(1.28, -1.47, z)), 20, 0.055, 8, false); L.push([tb]); }
      for (const sd of [-1, 1]) { L.push([cyl(0.06, 0.06, 3.5, 12), [sd * 1.28, -1.47, 0.1], [Math.PI / 2, 0, 0]]); L.push([cyl(0.06, 0.06, 0.5, 12), [sd * 1.28, -1.35, 2.03], [Math.PI / 2 - 0.55, 0, 0]]); } L.push([rbox(0.34, 0.04, 0.6, 0.02), [-1.36, -1.3, 0.35]]); return merged(L.map(([gg, p2, r2]) => [gg, p2, r2])); }), M.black));
    // 机鼻：空速管、剪线器、红外转塔、探照灯；防撞灯与航行灯、天线
    g.add(mesh(geo('hNose', () => merged([[cyl(0.012, 0.012, 0.5, 6), [0.28, 0.0, 2.95], [Math.PI / 2, 0, 0]], [cyl(0.012, 0.012, 0.5, 6), [-0.28, 0.0, 2.95], [Math.PI / 2, 0, 0]], [rbox(0.04, 0.32, 0.06, 0.01), [0, 1.08, 1.75], [0.5, 0, 0]], [rbox(0.04, 0.3, 0.06, 0.01), [0, -0.92, 2.45], [-0.5, 0, 0]],
      [rbox(0.03, 0.26, 0.22, 0.01), [0, 0.92, -4.1]], [cyl(0.008, 0.008, 0.5, 6), [0.4, -1.22, -0.6]]])), dk));
    g.add(mesh(geo('hFlir', () => merged([[new THREE.SphereGeometry(0.17, 18, 12), [-0.36, -1.02, 2.3]], [cyl(0.05, 0.05, 0.2, 8), [-0.36, -0.86, 2.3]]])), dk)); g.add(mesh(geo('hFlirL', () => merged([[cyl(0.07, 0.07, 0.02, 14), [-0.36, -1.04, 2.46], [Math.PI / 2, 0, 0]]])), M.glass));
    for (const [p2, c] of [[[0, 1.7, -1.95], '#ff3b30'], [[0, -1.0, -1.0], '#ff3b30'], [[-1.29, 0.74, -6.12], '#ff3b30'], [[1.29, 0.74, -6.12], '#2ee68f']]) { const l = mesh(geo('hLed', () => new THREE.SphereGeometry(0.045, 10, 8)), new THREE.MeshBasicMaterial({ color: c }), false); l.position.set(...p2); g.add(l); }
    // 尾梁两侧文字
    for (const sd of [-1, 1]) { const pl = new THREE.Mesh(geo('hTxt', () => new THREE.PlaneGeometry(2.2, 0.275)), new THREE.MeshStandardMaterial({ map: heliText, transparent: true, roughness: 0.5, polygonOffset: true, polygonOffsetFactor: -2 })); pl.position.set(sd * 0.272, 0.62, -4.3); pl.rotation.y = sd * Math.PI / 2; pl.rotation.z = 0; if (sd < 0) pl.scale.x = 1; g.add(pl); }
    // 绞车：舱顶支架、吊臂、卷筒（吊点位置与旧模型一致）
    this.hoist = mesh(geo('hHoist', () => merged([[rbox(0.72, 0.12, 0.14, 0.04), [1.42, 1.0, 0.4]], [cyl(0.09, 0.09, 0.22, 14), [1.78, 0.96, 0.4]], [rbox(0.12, 0.5, 0.14, 0.03), [1.06, 0.98, 0.4]], [rbox(0.34, 0.12, 0.3, 0.05), [0.94, 0.84, 0.4]]])), M.white); g.add(this.hoist);
    this.cable = mesh(geo('hCable', () => cyl(0.012, 0.012, 1, 6)), M.dark); g.add(this.cable);
    this.light = mesh(geo('hLamp', () => merged([[cyl(0.14, 0.17, 0.2, 16)], [cyl(0.15, 0.15, 0.02, 16), [0, -0.11, 0]]])), dk); this.light.position.set(0.5, -1.05, 1.75); g.add(this.light);
    this.cone = new THREE.Mesh(geo('hCone', () => { const c = new THREE.ConeGeometry(4.5, 16, 24, 1, true); c.translate(0, -8, 0); return c; }), new THREE.MeshBasicMaterial({ color: '#fff2d6', transparent: true, opacity: 0.12, depthWrite: false, side: THREE.DoubleSide })); this.cone.position.set(0.5, -1.1, 1.75); this.cone.rotation.x = -0.5; g.add(this.cone);
    dyn(g);
  }
  // s: { pos, heading, pitch, roll, rotor(角度), speed(0~1), door(0 关~1 开), cable(米，可选), search(探照灯) }
  update(s) {
    const g = this.g; g.visible = true; setPose(g, s.pos, s.heading || 0, s.pitch || 0, s.roll || 0); const sp = s.speed ?? 1;
    this.rotor.rotation.y = s.rotor || 0; const bl = smooth((sp - 0.3) / 0.4); this.blades.visible = bl < 0.95; this.disc.visible = bl > 0.05; this.disc.material.opacity = bl; this.tail.material.opacity = bl; this.fan.rotation.x = (s.rotor || 0) * 3; this.fan.visible = bl < 0.9;
    this.doorLeaf.position.z = -1.42 * smooth(s.door || 0);
    this.hoist.visible = s.cable !== undefined; this.cable.visible = s.cable !== undefined && s.cable > 0.05; if (this.cable.visible) { let end = [1.78, 0.9 - s.cable, 0.4]; if (s.cableTo) { g.updateMatrixWorld(); end = V(...s.cableTo).applyMatrix4(g.matrixWorld.clone().invert()).toArray(); } span(this.cable, [1.78, 0.9, 0.4], end, 1); } // cableTo：吊索末端接到世界坐标里的吊环
    this.cone.visible = !!s.search; return g;
  }
  world(p) { this.g.updateMatrixWorld(); return V(...p).applyMatrix4(this.g.matrixWorld).toArray(); }
  // 舱门平面（世界坐标，法线朝外）：登机人员越过它的部分被裁掉
  doorPlane() { this.g.updateMatrixWorld(); const n = V(-1, 0, 0).transformDirection(this.g.matrixWorld), p2 = V(-1.16, 0, 0).applyMatrix4(this.g.matrixWorld); return new THREE.Plane().setFromNormalAndCoplanarPoint(n, p2); }
}
export const HELI = pool(() => new Helicopter());

// —— 救援人员（人台）：白色头盔、橙色背心、深色衣裤；跑动步态沿用第三版 ——
export class Human {
  constructor() {
    const g = this.g = new THREE.Group(); const skin = std({ color: '#e9e5de', roughness: 0.7 }), cloth = std({ color: '#3b3f46', roughness: 0.8 }), vest = std({ color: COL.orange, roughness: 0.5 });
    this.torso = mesh(geo('huT', () => new THREE.CapsuleGeometry(0.17, 0.32, 4, 12)), vest); g.add(this.torso);
    this.head = mesh(geo('huH', () => new THREE.SphereGeometry(0.11, 16, 12)), skin); g.add(this.head);
    const helmM = M.white.clone(); this.helm = mesh(geo('huHm', () => new THREE.SphereGeometry(0.125, 16, 10, 0, Math.PI * 2, 0, Math.PI * 0.55)), helmM); g.add(this.helm); this.mats = [skin, cloth, vest, helmM]; this.clip = null;
    this.parts = []; for (let k = 0; k < 8; k++) { const m = mesh(geo('huL' + (k < 4 ? 'a' : 'b'), () => new THREE.CapsuleGeometry(k < 4 ? 0.06 : 0.05, 1, 3, 8)), k < 4 ? cloth : cloth); g.add(m); this.parts.push(m); }
    dyn(g);
  }
  // s: { pos, heading, phase, run, armsUp, sit, typing, alpha, clip(THREE.Plane，可选：只画平面正面一侧) }
  update(s) {
    const g = this.g; g.visible = (s.alpha ?? 1) > 0.05; setPose(g, s.pos, s.heading || 0); const cp = s.clip || null; if (cp !== this.clip) { for (const m of this.mats) m.clippingPlanes = cp ? [cp] : null; this.clip = cp; } const ph = s.phase || 0, run = s.run ?? 0;
    const sw = Math.sin(ph) * (0.35 + 0.35 * run), lean = run * 0.18, bob = Math.abs(Math.cos(ph)) * 0.04 * run;
    this.torso.position.set(0, 1.2 + bob, lean * 0.25); this.torso.rotation.x = lean * 0.6; this.head.position.set(0, 1.66 + bob, lean * 0.6); this.helm.position.set(0, 1.69 + bob, lean * 0.6);
    const lim = (m, a, b) => { const A = V(...a), B = V(...b); const L = A.distanceTo(B); m.position.copy(A).add(B).multiplyScalar(0.5); m.quaternion.setFromUnitVectors(V(0, 1, 0), B.sub(A).normalize()); m.scale.set(1, Math.max(0.1, L - 0.1), 1); };
    if (s.sit) { // 坐姿：坐高 0.48，双手放在桌面上（typing 时手指轻敲）
      const dy = -0.47; this.torso.position.set(0, 1.2 + dy, 0.03); this.torso.rotation.x = 0.08; this.head.position.set(0, 1.66 + dy, 0.06); this.helm.position.set(0, 1.69 + dy, 0.06); this.helm.visible = false;
      let k2 = 0; for (const sd of [-1, 1]) { const knee = [sd * 0.11, 0.52, 0.44], foot = [sd * 0.12, 0.07, 0.5]; lim(this.parts[k2++], [sd * 0.1, 0.5, 0.02], knee); lim(this.parts[k2++], knee, foot);
        const tap = s.typing ? 0.015 * Math.sin(ph * 3 + sd) : 0; const elb = [sd * 0.24, 0.8, 0.22], hand = [sd * 0.17, 0.79 + tap, 0.48]; lim(this.parts[4 + (sd > 0 ? 2 : 0)], [sd * 0.2, 0.95, 0.03], elb); lim(this.parts[5 + (sd > 0 ? 2 : 0)], elb, hand); }
      return g; }
    this.helm.visible = !s.noHelm;
    let k = 0; for (const sd of [-1, 1]) {
      const a = sd * sw; const knee = [sd * 0.1, 0.5 + bob, Math.sin(a) * 0.25 + 0.05 * run], foot = [sd * 0.1, 0.08, Math.sin(a) * 0.48 - (a < 0 ? 0.1 * run : 0)];
      lim(this.parts[k++], [sd * 0.1, 0.95 + bob, 0], knee); lim(this.parts[k++], knee, foot);
      const b = -sd * sw * 0.9; const elb = [sd * 0.25, 1.15 + bob, Math.sin(b) * 0.2 + lean * 0.3], hand = [sd * 0.27, 0.9 + bob, Math.sin(b) * 0.38 + 0.12 * run]; if (s.armsUp) { elb[1] = 1.55; elb[2] = 0.2; hand[1] = 1.4; hand[2] = 0.45; }
      lim(this.parts[4 + (sd > 0 ? 2 : 0)], [sd * 0.2, 1.42 + bob, lean * 0.45], elb); lim(this.parts[5 + (sd > 0 ? 2 : 0)], elb, hand);
    }
    return g;
  }
}
export const HUMANS = pool(() => new Human());
export function drawHuman(s) { return HUMANS.get().update(s); }

// —— 担架：橙色吊篮＋躺着的伤员（金色保温毯）＋四根吊带 ——
export class Stretcher {
  constructor() {
    const g = this.g = new THREE.Group(); const basket = std({ color: COL.orange, roughness: 0.45 });
    g.add(mesh(geo('stB', () => merged([[rbox(0.62, 0.06, 2.0, 0.03), [0, 0.03, 0]], [rbox(0.04, 0.22, 2.0, 0.02), [0.31, 0.13, 0]], [rbox(0.04, 0.22, 2.0, 0.02), [-0.31, 0.13, 0]], [rbox(0.62, 0.22, 0.04, 0.02), [0, 0.13, 1.0]], [rbox(0.62, 0.22, 0.04, 0.02), [0, 0.13, -1.0]]])), basket));
    g.add(mesh(geo('stRib', () => { const L = []; for (let z = -0.8; z <= 0.8; z += 0.4) L.push([rbox(0.66, 0.03, 0.03, 0.01), [0, 0.24, z]]); return merged(L); }), M.black));
    const body = mesh(geo('stP', () => new THREE.CapsuleGeometry(0.17, 1.15, 4, 12)), std({ color: '#e5e1da', roughness: 0.7 })); body.rotation.x = Math.PI / 2; body.position.set(0, 0.2, -0.12); g.add(body);
    const head = mesh(geo('stH', () => new THREE.SphereGeometry(0.11, 14, 10)), std({ color: '#e9e5de', roughness: 0.7 })); head.position.set(0, 0.24, 0.72); g.add(head);
    const blanket = mesh(geo('stK', () => rbox(0.52, 0.06, 1.15, 0.03)), std({ color: '#d6a43a', roughness: 0.35, metalness: 0.6 })); blanket.position.set(0, 0.32, -0.2); g.add(blanket);
    this.lines = [0, 1, 2, 3].map(() => { const m = mesh(geo('stL', () => cyl(0.008, 0.008, 1, 6)), M.dark); g.add(m); return m; });
    dyn(g);
  }
  update(pos, heading, roll = 0, pitch = 0) { const g = this.g; g.visible = true; setPose(g, pos, heading, pitch, roll); const ring = [0, 1.0, 0]; [[0.3, 0.25, 0.95], [-0.3, 0.25, 0.95], [0.3, 0.25, -0.95], [-0.3, 0.25, -0.95]].forEach((c, i) => span(this.lines[i], c, ring)); this.g.updateMatrixWorld(); return V(...ring).applyMatrix4(g.matrixWorld).toArray(); }
}
export const STRETCHER = pool(() => new Stretcher());

// —— 航空基地：停机坪（圆圈＋H）、拱顶机库（亮灯大门、门楣标牌）、塔台、跑道、风向袋 ——
const signC = mkCanvas(1024, 64); { const g = signC.getContext('2d'); g.fillStyle = '#1d1e22'; g.fillRect(0, 0, 1024, 64); g.fillStyle = '#f2f0eb'; g.font = 'bold 40px "Noto Sans SC",sans-serif'; g.textAlign = 'center'; g.fillText('应急救援航空基地', 512, 46); g.fillStyle = '#ec4e26'; g.fillRect(0, 58, 1024, 6); }
const apC = mkCanvas(2048, 2048); { const g = apC.getContext('2d'); const S = 2048 / 240, R = mulberry32(606); g.fillStyle = '#dcd7ce'; g.fillRect(0, 0, 2048, 2048);
  for (let y = 0; y < 2048; y += 5 * S) for (let x = 0; x < 2048; x += 5 * S) { const v = (R() - 0.5) * 9; g.fillStyle = `rgb(${220 + v},${215 + v},${206 + v})`; g.fillRect(x + 1, y + 1, 5 * S - 2, 5 * S - 2); } // 混凝土分块
  g.strokeStyle = 'rgba(160,152,140,0.55)'; g.lineWidth = 1.2; for (let k = 0; k <= 48; k++) { g.beginPath(); g.moveTo(k * 5 * S, 0); g.lineTo(k * 5 * S, 2048); g.moveTo(0, k * 5 * S); g.lineTo(2048, k * 5 * S); g.stroke(); }
  for (let k = 0; k < 40; k++) { const x = (R() * 120 + 60) * S, y = (R() * 70 + 60) * S, r = (0.6 + R() * 2.2) * S; const gr = g.createRadialGradient(x, y, 0, x, y, r); gr.addColorStop(0, 'rgba(120,112,100,0.28)'); gr.addColorStop(1, 'rgba(120,112,100,0)'); g.fillStyle = gr; g.fillRect(x - r, y - r, 2 * r, 2 * r); } // 油渍
  g.fillStyle = '#c9c3b9'; g.fillRect(0, 1520, 2048, 220); g.strokeStyle = '#ffffff'; g.lineWidth = 5; g.setLineDash([80, 80]); g.beginPath(); g.moveTo(0, 1630); g.lineTo(2048, 1630); g.stroke(); g.setLineDash([]); }
export class Airport {
  constructor() {
    const g = this.g = new THREE.Group();
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(240, 240).rotateX(-Math.PI / 2), std({ map: tex(apC), roughness: 0.95 })); ground.receiveShadow = true; g.add(ground);
    const hx = 14, hz = -34, hw = 46, hd = 30, hh = 11;
    const hb = mesh(geo('apHang', () => merged([[rbox(hw, hh, hd, 0.3), [hx, hh / 2, hz]]])), MW); g.add(hb);
    g.add(mesh(geo('apRoof', () => { const c = new THREE.CylinderGeometry(5, 5, hd, 32, 1, false, -Math.PI / 2, Math.PI); c.rotateX(Math.PI / 2); c.scale(hw / 10, 1, 1); c.translate(hx, hh, hz); return c; }), MW2));
    const door = mesh(geo('apDoor', () => rbox(32, 8.5, 0.2, 0.05)), std({ color: '#f6e7cf', roughness: 0.6, emissive: '#ffcf8a', emissiveIntensity: 0.25 })); door.position.set(hx, 4.25, hz + hd / 2 + 0.05); g.add(door);
    g.add(mesh(geo('apDoorL', () => { const L = []; for (let k = 1; k < 8; k++) L.push([rbox(0.1, 8.5, 0.1, 0.02), [hx - 16 + k * 4, 4.25, hz + hd / 2 + 0.2]]); return merged(L); }), M.dark));
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(24, 1.5), new THREE.MeshBasicMaterial({ map: tex(signC) })); sign.position.set(hx, 9.6, hz + hd / 2 + 0.16); g.add(sign);
    const tx = -34, tz = -40; g.add(mesh(geo('apTower', () => merged([[cyl(1.8, 2.4, 18, 20), [tx, 9, tz]], [cyl(3.8, 3.4, 0.5, 8), [tx, 18.25, tz]], [cyl(3.9, 3.9, 0.4, 8), [tx, 21.7, tz]]])), MW));
    g.add(mesh(geo('apTowerG', () => cyl(3.6, 3.6, 3.0, 8, true)), M.glass)); g.children[g.children.length - 1].position.set(tx, 20, tz);
    const sock = mesh(geo('apSock', () => merged([[cyl(0.06, 0.06, 6, 8), [30, 3, 18]]])), M.chrome); g.add(sock); this.sock = mesh(geo('apSockC', () => { const c = new THREE.ConeGeometry(0.5, 2.2, 12, 1, true); c.rotateZ(Math.PI / 2); c.translate(31.1, 5.8, 18); return c; }), std({ color: COL.orange, roughness: 0.5, side: THREE.DoubleSide })); g.add(this.sock);
    // 起降坪：几何体圆环与 H（贴图放大会糊）
    const padM = std({ color: COL.orange, roughness: 0.5, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }), padW = std({ color: '#f7f5f1', roughness: 0.6, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
    for (const [r0, r1, m] of [[10.6, 11.0, padM], [9.75, 9.9, padM]]) { const ring = new THREE.Mesh(new THREE.RingGeometry(r0, r1, 120).rotateX(-Math.PI / 2), m); ring.position.y = 0.012; ring.receiveShadow = true; g.add(ring); }
    const hm = new THREE.Mesh(merged([[new THREE.BoxGeometry(0.9, 0.01, 5.2), [-1.6, 0.012, 0]], [new THREE.BoxGeometry(0.9, 0.01, 5.2), [1.6, 0.012, 0]], [new THREE.BoxGeometry(2.4, 0.01, 0.8), [0, 0.012, 0]]]), padW); hm.receiveShadow = true; g.add(hm);
    g.add(airportDetail()); // 停机坪标线、加油车、电源车、牵引车、灯杆、锥桶、救护车、办公楼、围栏
    this.lights = []; for (let k = 0; k < 12; k++) { const a = k / 12 * Math.PI * 2; const l = mesh(geo('apL', () => new THREE.SphereGeometry(0.16, 8, 6)), new THREE.MeshBasicMaterial({ color: '#5fd4ff' }), false); l.position.set(Math.cos(a) * 11.6, 0.15, Math.sin(a) * 11.6); g.add(l); this.lights.push(l); }
    dyn(g);
  }
  update(t) { this.g.visible = true; this.lights.forEach((l, k) => l.material.color.set(((t * 1.5 + k / 12) % 1) < 0.5 ? '#7fe0ff' : '#3a6f85')); return this.g; }
}
export const AIRPORT = pool(() => new Airport());

// —— 瓦砾缝隙特写（单独布景，原点在手机处） ——
const phoneC = mkCanvas(256, 512); const phoneT = tex(phoneC);
function drawPhone(t) { const g = phoneC.getContext('2d'); const gr = g.createLinearGradient(0, 0, 0, 512); gr.addColorStop(0, '#26567a'); gr.addColorStop(1, '#0b1d2c'); g.fillStyle = gr; g.fillRect(0, 0, 256, 512);
  g.fillStyle = 'rgba(255,255,255,0.14)'; g.beginPath(); g.arc(128, 170, 60 + 22 * ((t * 1.2) % 1), 0, 7); g.fill(); g.fillStyle = '#d9e6f0'; g.beginPath(); g.arc(128, 170, 52, 0, 7); g.fill();
  g.fillStyle = '#9fb3c4'; g.beginPath(); g.arc(128, 155, 20, 0, 7); g.fill(); g.beginPath(); g.arc(128, 215, 34, Math.PI, 0); g.fill();
  g.fillStyle = '#ffffff'; g.textAlign = 'center'; g.font = 'bold 54px "Noto Sans SC",sans-serif'; g.fillText('妈妈', 128, 300); g.font = '26px "Noto Sans SC",sans-serif'; g.fillStyle = 'rgba(255,255,255,0.8)'; g.fillText('来电…', 128, 345);
  g.fillStyle = '#ff4a3a'; g.beginPath(); g.arc(70, 440, 30, 0, 7); g.fill(); g.fillStyle = '#33d17a'; g.beginPath(); g.arc(186, 440, 30, 0, 7); g.fill(); phoneT.needsUpdate = true; }
export class Crevice {
  constructor() {
    const g = this.g = new THREE.Group(); const R = mulberry32(5); const rock = std({ color: '#d9d4cb', roughness: 0.95 }), rock2 = std({ color: '#c9c3b9', roughness: 0.95 });
    const L1 = [], L2 = []; for (let i = 0; i < 170; i++) { const s = 0.02 + Math.pow(R(), 2) * 0.16; const x = (R() - 0.5) * 1.8, z = (R() - 0.5) * 1.6; if (Math.abs(x) < 0.14 && Math.abs(z) < 0.2) continue; (R() < 0.5 ? L1 : L2).push([new THREE.IcosahedronGeometry(1, 0), [x, s * 0.3, z], [R() * 6, R() * 6, R() * 6], [s, s * (0.5 + R() * 0.5), s * 0.9]]); }
    g.add(mesh(merged(L1), rock)); g.add(mesh(merged(L2), rock2));
    for (const [p, r, sz] of [[[-0.62, 0.55, 0.1], [0.05, 0.1, 1.05], [2.6, 0.22, 1.8]], [[0.66, 0.6, -0.05], [-0.04, -0.12, -1.0], [2.4, 0.22, 1.9]], [[0.1, 1.25, -0.7], [0.5, 0.3, 0.12], [1.6, 0.18, 1.2]]]) { const m = mesh(geo('crS' + p[0], () => rbox(...sz, 0.02)), MW2); m.position.set(...p); m.rotation.set(r[0], r[1], r[2], 'YXZ'); g.add(m); }
    const rb = mesh(geo('crRb', () => cyl(0.012, 0.012, 1.4, 6)), std({ color: '#8a5a3c', roughness: 0.6 })); span(rb, [-0.85, 0.12, -0.55], [0.3, 0.9, 0.05]); g.add(rb);
    const ground = new THREE.Mesh(new THREE.CircleGeometry(3, 32).rotateX(-Math.PI / 2), std({ color: '#cfc9bf', roughness: 1 })); ground.receiveShadow = true; g.add(ground);
    // 手机
    this.phone = new THREE.Group(); this.phone.position.set(0.02, 0.012, 0.02); this.phone.rotation.y = 0.5; g.add(this.phone);
    this.phone.add(mesh(geo('crPh', () => rbox(0.075, 0.009, 0.155, 0.006)), M.black));
    const scr = new THREE.Mesh(new THREE.PlaneGeometry(0.068, 0.145).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: phoneT })); scr.position.y = 0.0048; this.phone.add(scr);
    this.glow = glowSprite('#7ec8ff', 0.5, 0.35, false); this.glow.position.set(0.02, 0.08, 0.02); g.add(this.glow);
    // 光束里的灰尘
    this.dust = new THREE.Points(new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(new Float32Array(300 * 3), 3)), new THREE.PointsMaterial({ color: '#c9b79a', size: 0.012, transparent: true, opacity: 0.7, depthWrite: false })); g.add(this.dust); this.D = []; for (let i = 0; i < 300; i++) this.D.push([R(), R(), R(), R()]);
    this.beam = new THREE.Mesh(new THREE.ConeGeometry(0.5, 2.4, 24, 1, true), new THREE.MeshBasicMaterial({ color: '#fff3dc', transparent: true, opacity: 0.1, depthWrite: false, side: THREE.DoubleSide })); this.beam.position.set(-0.3, 1.1, 0.35); this.beam.rotation.set(0.3, 0, -0.25); g.add(this.beam);
    dyn(g);
  }
  update(pos, t) { const g = this.g; g.visible = true; g.position.set(...pos); drawPhone(t); const buzz = (t % 1.6) < 0.9 ? Math.sin(t * 90) * 0.0015 : 0; this.phone.position.x = 0.02 + buzz; this.glow.material.opacity = 0.3 + 0.1 * Math.sin(t * 6);
    const P = this.dust.geometry.attributes.position; this.D.forEach(([a, b, c, e], i) => { const life = 5 + e * 3; const u = ((t / life + a) % 1); P.setXYZ(i, -0.6 + 0.65 * b + (c - 0.5) * 0.3, 2.0 - 2.0 * u, 0.7 - 0.75 * b + (e - 0.5) * 0.3); }); P.needsUpdate = true; return g; }
}
export const CREVICE = pool(() => new Crevice());

// —— 被困者热成像（侧卧人形点云，红橙色、随呼吸脉动） ——
let VCLOUD = null;
function victimCloud() { if (VCLOUD) return VCLOUD; const R = mulberry32(31); const a = [];
  const caps = [[[0.62, 0.12, 0], [0.62, 0.12, 0], 0.11], [[0.45, 0.1, 0], [0.05, 0.1, 0.02], 0.16], [[0.05, 0.1, 0.02], [-0.42, 0.08, 0.12], 0.08], [[-0.42, 0.08, 0.12], [-0.8, 0.06, 0.05], 0.065], [[0.05, 0.08, -0.02], [-0.38, 0.07, -0.1], 0.08], [[-0.38, 0.07, -0.1], [-0.78, 0.05, -0.2], 0.065], [[0.42, 0.14, 0.12], [0.2, 0.16, 0.32], 0.05], [[0.2, 0.16, 0.32], [0.42, 0.14, 0.46], 0.045]];
  for (const [p, q, r] of caps) { const n = Math.round(380 * r / 0.1); for (let i = 0; i < n; i++) { const u = R(); const c = [lerp(p[0], q[0], u), lerp(p[1], q[1], u), lerp(p[2], q[2], u)]; const th = R() * 6.28, ph = Math.acos(2 * R() - 1); const rr = r * (0.75 + R() * 0.25); a.push(c[0] + Math.sin(ph) * Math.cos(th) * rr, c[1] + Math.cos(ph) * rr * 0.8, c[2] + Math.sin(ph) * Math.sin(th) * rr); } }
  return (VCLOUD = new Float32Array(a)); }
export class Victim {
  constructor() { const g = this.g = new THREE.Group(); const geom = new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(victimCloud(), 3));
    this.mat = new THREE.PointsMaterial({ color: '#ff4a2e', size: 0.028, transparent: true, opacity: 0.95, depthTest: false, depthWrite: false }); const p = new THREE.Points(geom, this.mat); p.renderOrder = 20; g.add(p);
    this.halo = glowSprite('#ff5a30', 1.6, 0.5, false); this.halo.material.depthTest = false; this.halo.renderOrder = 19; this.halo.position.set(0.62, 0.12, 0); g.add(this.halo); dyn(g); }
  update(pos, yaw, k, t) { const g = this.g; g.visible = k > 0.01; setPose(g, pos, yaw); const pul = 0.75 + 0.25 * Math.sin(t * 6.5); this.mat.opacity = 0.95 * k; this.halo.material.opacity = 0.5 * k * pul; return g; }
}
export const VICTIM_M = pool(() => new Victim());

// —— 片尾载荷：履带机器人、潜水机器人、无人船（顶部都有统一对接盘） ——
function dockPlateGeo() { return merged([[cyl(0.1, 0.105, 0.016, 40)], [cyl(0.058, 0.06, 0.02, 32), [0, 0.004, 0]]]); }
export class Payload {
  constructor(kind) {
    const g = this.g = new THREE.Group(); this.kind = kind; const hw = M.white;
    if (kind === 'track') { g.add(mesh(geo('pTb', () => rbox(0.5, 0.18, 0.62, 0.04)), hw)); g.children[0].position.y = 0.2;
      g.add(mesh(geo('pTt', () => merged([[rbox(0.12, 0.2, 0.8, 0.09), [0.31, 0.12, 0]], [rbox(0.12, 0.2, 0.8, 0.09), [-0.31, 0.12, 0]]])), M.rubber));
      g.add(mesh(geo('pTw', () => { const L = []; for (const sd of [-1, 1]) for (const z of [-0.3, -0.1, 0.1, 0.3]) L.push([cyl(0.07, 0.07, 0.13, 16), [sd * 0.31, 0.12, z], [0, 0, Math.PI / 2]]); return merged(L); }), M.dark));
      g.add(mesh(geo('pTs', () => merged([[rbox(0.52, 0.04, 0.2, 0.01), [0, 0.3, 0.2]]])), M.orange)); this.plateY = 0.3; }
    else if (kind === 'rov') { g.add(mesh(geo('pRb', () => rbox(0.6, 0.32, 0.8, 0.08)), std({ color: '#f2c230', roughness: 0.4 }))); g.children[0].position.y = 0.26;
      g.add(mesh(geo('pRf', () => merged([[rbox(0.62, 0.06, 0.82, 0.03), [0, 0.42, 0]]])), M.black));
      g.add(mesh(geo('pRt', () => { const L = []; for (const [x, z] of [[0.34, 0.3], [-0.34, 0.3], [0.34, -0.3], [-0.34, -0.3]]) L.push([cyl(0.07, 0.07, 0.12, 16), [x, 0.26, z], [Math.PI / 2, 0, 0]]); return merged(L); }), M.dark));
      g.add(mesh(geo('pRl', () => merged([[new THREE.SphereGeometry(0.07, 16, 12), [0, 0.26, 0.4]]])), M.glass)); this.plateY = 0.45; }
    else { g.add(mesh(geo('pUh', () => { const l = lathe([[0, 0], [0.22, 0.02], [0.3, 0.1], [0.3, 0.22], [0, 0.22]], 32); l.scale(1, 1, 2.6); return l; }), hw));
      g.add(mesh(geo('pUs', () => merged([[rbox(0.62, 0.04, 1.4, 0.02), [0, 0.12, 0]]])), M.orange)); g.add(mesh(geo('pUc', () => merged([[rbox(0.36, 0.16, 0.5, 0.05), [0, 0.3, -0.1]]])), M.white)); this.plateY = 0.38; }
    this.plate = mesh(geo('pPlate', dockPlateGeo), M.chrome); this.plate.position.y = this.plateY; g.add(this.plate);
    this.ring = mesh(geo('pRing', () => { const t = new THREE.TorusGeometry(0.08, 0.005, 8, 40); t.rotateX(Math.PI / 2); return t; }), M.orange); this.ring.position.y = this.plateY + 0.012; g.add(this.ring);
    dyn(g);
  }
  update(pos, yaw, t) { const g = this.g; g.visible = true; setPose(g, pos, yaw); if (this.kind === 'usv') g.position.y += 0.02 * Math.sin(t * 2); this.g.updateMatrixWorld(); return V(0, this.plateY, 0).applyMatrix4(g.matrixWorld).toArray(); }
}
export const PAYLOADS = { track: pool(() => new Payload('track')), rov: pool(() => new Payload('rov')), usv: pool(() => new Payload('usv')) };
