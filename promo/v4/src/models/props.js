// 配角模型（PBR 白模风格）：基站、救援车辆、救援直升机、救援人员（人台）、担架、航空基地、瓦砾缝隙里的手机、被困者热成像、片尾载荷（履带/潜水/无人船）。
import { THREE, dyn, pool, mkCanvas, COL } from '../engine.js';
import { M, mesh, rbox, cyl, lathe, span, setPose, glowSprite } from '../mats.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { clamp, lerp, smooth, mulberry32 } from '../util.js';
import { terrainHeight } from './cityData.js';

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
    const body = mesh(geo('dkBody', () => rbox(w, h, d, 0.12)), MW); body.position.y = h / 2; g.add(body);
    g.add(mesh(geo('dkBand', () => merged([[rbox(w + 0.02, 0.1, d + 0.02, 0.04), [0, 0.92, 0]]])), M.orange));
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
    const mast = mesh(geo('dkMast', () => merged([[cyl(0.03, 0.04, 2.6, 10), [w / 2 + 0.35, 1.3, -d / 2 + 0.3]], [new THREE.SphereGeometry(0.06, 10, 8), [w / 2 + 0.35, 2.65, -d / 2 + 0.3]]])), M.chrome); g.add(mast);
    this.cups = new THREE.Group(); this.cups.position.set(w / 2 + 0.35, 2.7, -d / 2 + 0.3); g.add(this.cups); for (let k = 0; k < 3; k++) { const a = k * 2.094; const arm = mesh(geo('dkCup', () => merged([[rbox(0.24, 0.015, 0.015, 0.004), [0.12, 0, 0]], [new THREE.SphereGeometry(0.035, 10, 8, 0, Math.PI * 2, 0, Math.PI / 2), [0.24, 0, 0], [Math.PI / 2, 0, 0]]])), M.white); arm.rotation.y = a; this.cups.add(arm); }
    this.beacon = mesh(geo('dkBeacon', () => new THREE.SphereGeometry(0.06, 12, 8)), new THREE.MeshBasicMaterial({ color: '#5fd4ff' }), false); this.beacon.position.set(-w / 2 + 0.1, h + 0.08, d / 2 - 0.3); g.add(this.beacon);
    this.beaconGlow = glowSprite('#5fd4ff', 0.6, 0.6, false); this.beaconGlow.position.copy(this.beacon.position); g.add(this.beaconGlow);
    dyn(g);
  }
  // pos 世界坐标；open 0~1 舱盖；lift 0~1 平台；lights 0~1
  update(pos, open, lift, t, lights = 1) {
    const g = this.g; g.visible = true; setPose(g, pos, DOCK.ry);
    this.plat.position.y = DOCK.platLow + (DOCK.platHigh - DOCK.platLow) * smooth(lift); this.plat.visible = open > 0.02 || lift > 0.02;
    const a = smooth(open) * 2.6; for (const L of this.lids) L.piv.rotation.z = -L.sd * a * -1;
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
export class Helicopter {
  constructor() {
    const g = this.g = new THREE.Group();
    const hw = std({ color: '#f3f1ed', roughness: 0.35, metalness: 0.05 });
    const fus = mesh(geo('hFus', () => { const l = lathe([[0, -2.7], [0.55, -2.55], [0.95, -2.0], [1.2, -1.0], [1.25, 0.2], [1.2, 1.3], [1.0, 2.1], [0.62, 2.65], [0, 2.85]], 40); l.rotateX(Math.PI / 2); l.scale(1, 1.08, 1); return l; }), hw); g.add(fus);
    g.add(mesh(geo('hBand', () => merged([[rbox(2.52, 0.18, 3.6, 0.08), [0, -0.25, 0]]])), M.orange));
    g.add(mesh(geo('hGlass', () => { const s2 = new THREE.SphereGeometry(1.12, 32, 16, -0.95, 1.9, 0.55, 0.95); s2.rotateX(-0.25); s2.translate(0, 0.25, 1.6); return s2; }), M.glass));
    g.add(mesh(geo('hWins', () => merged([[rbox(0.05, 0.5, 0.9, 0.06), [1.21, 0.35, 0.3]], [rbox(0.05, 0.5, 0.9, 0.06), [-1.21, 0.35, -0.6]]])), M.glass));
    g.add(mesh(geo('hEng', () => merged([[rbox(1.1, 0.6, 2.4, 0.2), [0, 1.25, -0.9]]])), hw));
    g.add(mesh(geo('hBoom', () => { const c = cyl(0.22, 0.42, 5.2, 20); c.rotateX(Math.PI / 2); c.translate(0, 0.55, -5.1); return c; }), hw));
    g.add(mesh(geo('hFin', () => merged([[rbox(0.12, 1.5, 0.9, 0.06), [0, 1.2, -7.5], [-0.35, 0, 0]], [rbox(1.8, 0.08, 0.55, 0.04), [0, 0.6, -6.9]]])), M.orange));
    g.add(mesh(geo('hSkid', () => { const L = []; for (const sd of [-1, 1]) { L.push([cyl(0.06, 0.06, 4.1, 12), [sd * 1.25, -1.45, 0.05], [Math.PI / 2, 0, 0]]); for (const z of [1.0, -1.0]) L.push([cyl(0.05, 0.05, 0.8, 10), [sd * 0.98, -1.18, z], [0, 0, sd * 0.78]]); } return merged(L); }), M.black));
    this.rotor = new THREE.Group(); this.rotor.position.set(0, 1.75, -0.6); g.add(this.rotor); this.rotor.add(mesh(geo('hHub', () => cyl(0.2, 0.25, 0.3, 16)), M.dark));
    this.blades = new THREE.Group(); this.rotor.add(this.blades); for (let k = 0; k < 4; k++) { const b = mesh(geo('hBlade', () => { const bb = rbox(5.4, 0.04, 0.32, 0.02); bb.translate(2.8, 0, 0); return bb; }), M.black); b.rotation.y = k * Math.PI / 2; this.blades.add(b); }
    this.disc = new THREE.Mesh(geo('hDisc', () => new THREE.CircleGeometry(8.2, 64).rotateX(-Math.PI / 2)), new THREE.MeshBasicMaterial({ map: HELI_DISC, transparent: true, depthWrite: false, side: THREE.DoubleSide })); this.disc.position.y = 0.05; this.rotor.add(this.disc);
    this.tail = new THREE.Mesh(geo('hTail', () => new THREE.CircleGeometry(0.75, 32).rotateY(Math.PI / 2)), new THREE.MeshBasicMaterial({ map: HELI_DISC, transparent: true, depthWrite: false, side: THREE.DoubleSide })); this.tail.position.set(0.18, 1.25, -7.6); g.add(this.tail);
    // 左侧滑门开口（暖光）
    this.doorMat = new THREE.MeshBasicMaterial({ color: '#ffcf8a' }); this.doorOpen = mesh(geo('hDoorO', () => new THREE.PlaneGeometry(1, 1.34).rotateY(-Math.PI / 2)), this.doorMat, false); this.doorOpen.position.set(-1.222, -0.05, 0.3); g.add(this.doorOpen);
    this.doorGlow = glowSprite('#ffb347', 2.2, 0.5, false); g.add(this.doorGlow);
    // 绞车吊臂、钢缆、吊钩
    this.hoist = mesh(geo('hHoist', () => merged([[rbox(0.7, 0.1, 0.1, 0.03), [1.42, 1.0, 0.4]], [cyl(0.08, 0.08, 0.2, 12), [1.78, 0.96, 0.4]]])), M.white); g.add(this.hoist);
    this.cable = mesh(geo('hCable', () => cyl(0.012, 0.012, 1, 6)), M.dark); g.add(this.cable);
    // 探照灯
    this.light = mesh(geo('hLamp', () => cyl(0.12, 0.16, 0.18, 14)), M.dark); this.light.position.set(0.5, -0.95, 1.8); g.add(this.light);
    this.cone = new THREE.Mesh(geo('hCone', () => { const c = new THREE.ConeGeometry(4.5, 16, 24, 1, true); c.translate(0, -8, 0); return c; }), new THREE.MeshBasicMaterial({ color: '#fff2d6', transparent: true, opacity: 0.12, depthWrite: false, side: THREE.DoubleSide })); this.cone.position.set(0.5, -1.0, 1.8); this.cone.rotation.x = -0.5; g.add(this.cone);
    dyn(g);
  }
  // s: { pos, heading, pitch, roll, rotor(角度), speed(0~1), door(0~1), cable(米，可选), search(探照灯) }
  update(s) {
    const g = this.g; g.visible = true; setPose(g, s.pos, s.heading || 0, s.pitch || 0, s.roll || 0); const sp = s.speed ?? 1;
    this.rotor.rotation.y = s.rotor || 0; const bl = smooth((sp - 0.3) / 0.4); this.blades.visible = bl < 0.95; this.disc.visible = bl > 0.05; this.disc.material.opacity = bl; this.tail.material.opacity = bl;
    const d = s.door || 0; this.doorOpen.visible = d > 0.02; this.doorOpen.scale.set(1, 1, 1); this.doorOpen.position.z = 0.95 - 0.62 * d; this.doorOpen.scale.z = d; this.doorGlow.visible = d > 0.02; this.doorGlow.position.set(-1.5, 0, 0.95 - 0.62 * d); this.doorGlow.material.opacity = 0.45 * d;
    this.hoist.visible = s.cable !== undefined; this.cable.visible = s.cable !== undefined && s.cable > 0.05; if (this.cable.visible) span(this.cable, [1.78, 0.9, 0.4], [1.78, 0.9 - s.cable, 0.4], 1);
    this.cone.visible = !!s.search; return g;
  }
  world(p) { this.g.updateMatrixWorld(); return V(...p).applyMatrix4(this.g.matrixWorld).toArray(); }
}
export const HELI = pool(() => new Helicopter());

// —— 救援人员（人台）：白色头盔、橙色背心、深色衣裤；跑动步态沿用第三版 ——
export class Human {
  constructor() {
    const g = this.g = new THREE.Group(); const skin = std({ color: '#e9e5de', roughness: 0.7 }), cloth = std({ color: '#3b3f46', roughness: 0.8 }), vest = std({ color: COL.orange, roughness: 0.5 });
    this.torso = mesh(geo('huT', () => new THREE.CapsuleGeometry(0.17, 0.32, 4, 12)), vest); g.add(this.torso);
    this.head = mesh(geo('huH', () => new THREE.SphereGeometry(0.11, 16, 12)), skin); g.add(this.head);
    this.helm = mesh(geo('huHm', () => new THREE.SphereGeometry(0.125, 16, 10, 0, Math.PI * 2, 0, Math.PI * 0.55)), M.white); g.add(this.helm);
    this.parts = []; for (let k = 0; k < 8; k++) { const m = mesh(geo('huL' + (k < 4 ? 'a' : 'b'), () => new THREE.CapsuleGeometry(k < 4 ? 0.06 : 0.05, 1, 3, 8)), k < 4 ? cloth : cloth); g.add(m); this.parts.push(m); }
    dyn(g);
  }
  // s: { pos, heading, phase, run, armsUp, alpha }
  update(s) {
    const g = this.g; g.visible = (s.alpha ?? 1) > 0.05; setPose(g, s.pos, s.heading || 0); const ph = s.phase || 0, run = s.run ?? 0;
    const sw = Math.sin(ph) * (0.35 + 0.35 * run), lean = run * 0.18, bob = Math.abs(Math.cos(ph)) * 0.04 * run;
    this.torso.position.set(0, 1.2 + bob, lean * 0.25); this.torso.rotation.x = lean * 0.6; this.head.position.set(0, 1.66 + bob, lean * 0.6); this.helm.position.set(0, 1.69 + bob, lean * 0.6);
    const lim = (m, a, b) => { const A = V(...a), B = V(...b); const L = A.distanceTo(B); m.position.copy(A).add(B).multiplyScalar(0.5); m.quaternion.setFromUnitVectors(V(0, 1, 0), B.sub(A).normalize()); m.scale.set(1, Math.max(0.1, L - 0.1), 1); };
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
  update(pos, heading, roll = 0) { const g = this.g; g.visible = true; setPose(g, pos, heading, 0, roll); const ring = [0, 1.0, 0]; [[0.3, 0.25, 0.95], [-0.3, 0.25, 0.95], [0.3, 0.25, -0.95], [-0.3, 0.25, -0.95]].forEach((c, i) => span(this.lines[i], c, ring)); this.g.updateMatrixWorld(); return V(...ring).applyMatrix4(g.matrixWorld).toArray(); }
}
export const STRETCHER = pool(() => new Stretcher());

// —— 航空基地：停机坪（圆圈＋H）、拱顶机库（亮灯大门、门楣标牌）、塔台、跑道、风向袋 ——
const signC = mkCanvas(1024, 64); { const g = signC.getContext('2d'); g.fillStyle = '#1d1e22'; g.fillRect(0, 0, 1024, 64); g.fillStyle = '#f2f0eb'; g.font = 'bold 40px "Noto Sans SC",sans-serif'; g.textAlign = 'center'; g.fillText('应急救援航空基地', 512, 46); g.fillStyle = '#ec4e26'; g.fillRect(0, 58, 1024, 6); }
const apC = mkCanvas(1024, 1024); { const g = apC.getContext('2d'); g.fillStyle = '#dcd7ce'; g.fillRect(0, 0, 1024, 1024); g.strokeStyle = '#ec4e26'; g.lineWidth = 10; g.beginPath(); g.arc(512, 512, 47, 0, 7); g.stroke(); g.lineWidth = 3; g.beginPath(); g.arc(512, 512, 41, 0, 7); g.stroke(); g.fillStyle = '#ffffff'; g.fillRect(500, 492, 8, 40); g.fillRect(516, 492, 8, 40); g.fillRect(500, 508, 24, 7);
  g.fillStyle = '#c9c3b9'; g.fillRect(0, 760, 1024, 110); g.strokeStyle = '#ffffff'; g.lineWidth = 3; g.setLineDash([40, 40]); g.beginPath(); g.moveTo(0, 815); g.lineTo(1024, 815); g.stroke(); }
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
