// 六轴无人机（PBR，重载型）。参考 DJI M600 / S900、Tarot X6 等重载六旋翼：
// · 机身：深色八边形底盘＋白色车削上壳＋印字橙色腰带（LH-6 · 六合）、前部状态灯带、白色顶罩与深色传感窗、后部双 GPS 天线柱；
// · 机臂：根部折叠铰链块与锁紧环（镀铬销）、粗碳纤维管、电调舱（带散热片）、臂灯（前白后橙）；
// · 动力：电机座（前两臂橙色，便于辨认机头）、带散热鳍片的定子罩、带风扇辐条的转子钟、镀铬桨夹与折叠桨毂、双叶桨（高速时换成运动模糊桨盘＋橙色桨尖圈）；
// · 机腹：对接模块（导向锥环、4 个锁扣、灯环）、双轴云台相机；可收放起落架（铰接关节、斜撑、横梁、滑橇与橡胶垫）。
// explode 0~1 为拆解展开程度。尺寸沿用第三版：机臂半径 1.12 m，桨径 0.37 m。
import { THREE, mkCanvas, dyn, pool } from '../engine.js';
import { M, mesh, rbox, cyl, lathe, span, setPose, glowSprite } from '../mats.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { clamp, lerp, smooth } from '../util.js';

export const DRONE = { armReach: 1.12, propR: 0.37, skidY: -0.62, latchY: -0.17 };
export function rotorSpin(t, { t0 = -100, wMax = 160, spinUp = 2.0, t1 = Infinity, spinDown = 2.0 } = {}) {
  if (t < t0) return { angle: 0, speed: 0 };
  const a = wMax / spinUp, tu = t - t0; let angle, w;
  if (tu < spinUp) { angle = 0.5 * a * tu * tu; w = a * tu; } else { angle = 0.5 * a * spinUp * spinUp + wMax * (tu - spinUp); w = wMax; }
  if (t > t1) { const td = Math.min(t - t1, spinDown); const d = wMax / spinDown; angle -= 0.5 * d * td * td; w = Math.max(0, wMax - d * td); }
  return { angle, speed: clamp(w / wMax) };
}
const V = (x, y, z) => new THREE.Vector3(x, y, z);
function merged(list) { return mergeGeometries(list.map(([g, p = [0, 0, 0], r = [0, 0, 0], s = [1, 1, 1]]) => { const c = g.index ? g.toNonIndexed() : g.clone(); c.applyMatrix4(new THREE.Matrix4().compose(V(...p), new THREE.Quaternion().setFromEuler(new THREE.Euler(...r, 'YXZ')), V(...s))); for (const k of Object.keys(c.attributes)) if (!['position', 'normal', 'uv'].includes(k)) c.deleteAttribute(k); return c; }), false); }
// 运动模糊桨盘
const discC = mkCanvas(256, 256); {
  const g = discC.getContext('2d'); const img = g.createImageData(256, 256);
  for (let y = 0; y < 256; y++) for (let x = 0; x < 256; x++) { const dx = x - 128, dy = y - 128; const r = Math.hypot(dx, dy) / 128; const a = Math.atan2(dy, dx);
    let al = r < 0.12 || r > 1 ? 0 : 0.1 + 0.2 * Math.exp(-(((r - 0.88) / 0.1) ** 2)) + 0.04 * Math.sin(a * 2) * (r > 0.3 ? 1 : 0); al *= smooth((r - 0.12) / 0.08) * (1 - smooth((r - 0.975) / 0.025));
    const i = (y * 256 + x) * 4; img.data[i] = img.data[i + 1] = img.data[i + 2] = 34; img.data[i + 3] = Math.max(0, Math.min(255, al * 255)); }
  g.putImageData(img, 0, 0);
}
const DISC_TEX = new THREE.CanvasTexture(discC); DISC_TEX.colorSpace = THREE.SRGBColorSpace;
// 腰带印字
const bandC = mkCanvas(1024, 48); { const g = bandC.getContext('2d'); g.fillStyle = '#ec4e26'; g.fillRect(0, 0, 1024, 48); g.fillStyle = '#fff6f0'; g.font = 'bold 26px "DejaVu Sans Mono",monospace'; g.textBaseline = 'middle';
  for (const x0 of [0, 512]) { g.fillText('LH-6', x0 + 24, 25); g.font = '500 22px "Noto Sans SC",sans-serif'; g.fillText('六合', x0 + 110, 25); g.font = '15px "DejaVu Sans Mono",monospace'; g.fillText('AIR-GROUND SAR · HEXA', x0 + 190, 25); g.font = 'bold 26px "DejaVu Sans Mono",monospace'; for (let k = 0; k < 6; k++) g.fillRect(x0 + 420 + k * 12, 14, 4, 20); } }
const BAND_TEX = new THREE.CanvasTexture(bandC); BAND_TEX.colorSpace = THREE.SRGBColorSpace; BAND_TEX.wrapS = THREE.RepeatWrapping;
function bladeGeo(R) {
  const s = new THREE.Shape(); const c0 = 0.026, c1 = 0.055, c2 = 0.018; s.moveTo(0.03, -c0 / 2); s.lineTo(R * 0.3, -c1 * 0.45); s.quadraticCurveTo(R * 0.85, -c2, R, 0); s.quadraticCurveTo(R * 0.8, c2 * 0.9, R * 0.3, c1 * 0.55); s.lineTo(0.03, c0 / 2); s.closePath();
  const g = new THREE.ExtrudeGeometry(s, { depth: 0.006, bevelEnabled: true, bevelThickness: 0.0015, bevelSize: 0.0015, bevelSegments: 1, curveSegments: 10 }); g.rotateX(-Math.PI / 2); g.translate(0, 0.003, 0); return g;
}
const GEO = {}; const geo = (k, f) => GEO[k] || (GEO[k] = f());

export class Hexacopter {
  constructor(arms = 6) {
    this.arms = arms; const NA = arms; this.REACH = { 4: 1.02, 6: DRONE.armReach, 8: 1.24 }[NA]; this.PR = { 4: 0.47, 6: DRONE.propR, 8: 0.31 }[NA]; const R = this.REACH;
    const g = this.g = new THREE.Group();
    // —— 机身 ——
    const body = this.body = new THREE.Group(); g.add(body);
    body.add(mesh(geo('chassis', () => { const c = cyl(0.3, 0.27, 0.05, 8); c.rotateY(Math.PI / 8); c.translate(0, -0.085, 0); return c; }), M.black));
    body.add(mesh(geo('shell', () => lathe([[0, -0.06], [0.3, -0.06], [0.33, -0.045], [0.345, -0.02], [0.342, 0.04], [0.328, 0.07], [0.3, 0.085], [0, 0.085]], 72)), M.white));
    const band = mesh(geo('band', () => cyl(0.348, 0.348, 0.03, 96, true)), new THREE.MeshStandardMaterial({ map: BAND_TEX, roughness: 0.4 })); band.position.y = -0.028; body.add(band);
    body.add(mesh(geo('seam', () => { const t = new THREE.TorusGeometry(0.316, 0.004, 6, 72); t.rotateX(Math.PI / 2); t.translate(0, 0.078, 0); return t; }), M.black));
    body.add(mesh(geo('screws', () => { const L = []; for (let k = 0; k < 16; k++) { const a = k / 16 * Math.PI * 2; L.push([cyl(0.006, 0.006, 0.006, 8), [Math.sin(a) * 0.336, 0.05, Math.cos(a) * 0.336], [Math.PI / 2, a, 0]]); } return merged(L); }), M.chrome));
    const lbar = mesh(geo('lbar', () => { const t = new THREE.TorusGeometry(0.343, 0.006, 6, 24, 0.7); t.rotateX(Math.PI / 2); t.rotateY(Math.PI / 2 - 0.35); t.translate(0, 0.005, 0); return t; }), M.ledW, false); body.add(lbar);
    // 顶罩、传感窗、GPS 天线柱、频闪灯
    const dome = this.dome = new THREE.Group(); g.add(dome);
    const dm = mesh(geo('dome', () => new THREE.SphereGeometry(0.29, 56, 18, 0, Math.PI * 2, 0, Math.PI / 2)), M.white); dm.scale.y = 0.42; dm.position.y = 0.085; dome.add(dm);
    const vis = mesh(geo('visor', () => new THREE.SphereGeometry(0.292, 40, 10, -0.6, 1.2, 1.0, 0.42)), M.glass); vis.scale.y = 0.42; vis.position.y = 0.085; vis.rotation.y = Math.PI; dome.add(vis);
    dome.add(mesh(geo('gpsPosts', () => merged([[cyl(0.009, 0.011, 0.16, 12), [0.1, 0.24, -0.13]], [cyl(0.009, 0.011, 0.16, 12), [-0.1, 0.24, -0.13]]])), M.white));
    dome.add(mesh(geo('gpsPucks', () => merged([[cyl(0.045, 0.048, 0.022, 32), [0.1, 0.33, -0.13]], [cyl(0.045, 0.048, 0.022, 32), [-0.1, 0.33, -0.13]]])), M.white));
    dome.add(mesh(geo('gpsTops', () => merged([[cyl(0.036, 0.036, 0.006, 32), [0.1, 0.343, -0.13]], [cyl(0.036, 0.036, 0.006, 32), [-0.1, 0.343, -0.13]]])), M.black));
    const led = mesh(geo('ledS', () => new THREE.SphereGeometry(0.012, 12, 8)), M.ledC, false); led.position.set(0, 0.205, 0.07); dome.add(led);
    this.strobe = mesh(geo('ledS', null), M.ledW, false); this.strobe.position.set(0, 0.21, -0.02); dome.add(this.strobe);
    this.strobeGlow = glowSprite('#ffffff', 0.2, 0.9); this.strobeGlow.position.copy(this.strobe.position); dome.add(this.strobeGlow);
    // 内部（拆解时可见）：电池包、主控板、散热风扇
    const inner = this.inner = new THREE.Group(); g.add(inner);
    inner.add(mesh(geo('bat', () => merged([[rbox(0.12, 0.07, 0.2, 0.012), [-0.07, 0, 0]], [rbox(0.12, 0.07, 0.2, 0.012), [0.07, 0, 0]]])), M.black));
    inner.add(mesh(geo('bstripe', () => merged([[rbox(0.122, 0.012, 0.03, 0.004), [-0.07, 0.01, 0.08]], [rbox(0.122, 0.012, 0.03, 0.004), [0.07, 0.01, 0.08]]])), M.orange));
    const pcb = mesh(geo('pcb', () => rbox(0.22, 0.008, 0.22, 0.004)), M.dark); pcb.position.y = 0.06; inner.add(pcb);
    inner.add(mesh(geo('chips', () => { const L = []; for (const [x, z, w] of [[0.04, 0.03, 0.05], [-0.05, -0.04, 0.035], [0.06, -0.06, 0.03], [-0.04, 0.06, 0.04]]) L.push([rbox(w, 0.008, w, 0.002), [x, 0.068, z]]); return merged(L); }), M.black));
    inner.visible = false;
    // —— 机腹：对接模块与云台 ——
    const belly = this.belly = new THREE.Group(); g.add(belly);
    const ringMat = new THREE.MeshBasicMaterial({ color: '#5fd4ff' }); this.ringMat = ringMat;
    belly.add(mesh(geo('cone', () => lathe([[0.2, -0.11], [0.22, -0.12], [0.2, -0.15], [0.12, -0.16], [0.11, -0.12]], 64)), M.dark));
    const ring = mesh(geo('ring', () => new THREE.TorusGeometry(0.205, 0.007, 10, 80)), ringMat, false); ring.rotation.x = Math.PI / 2; ring.position.y = -0.128; belly.add(ring);
    this.ringGlow = glowSprite('#5fd4ff', 0.55, 0.0); this.ringGlow.position.y = -0.14; belly.add(this.ringGlow);
    this.hooks = []; for (let i = 0; i < 4; i++) { const h = new THREE.Group(); h.add(mesh(geo('hookA', () => rbox(0.034, 0.1, 0.036, 0.008)), M.chrome)); const tip = mesh(geo('hookT', () => rbox(0.034, 0.02, 0.05, 0.006)), M.chrome); tip.position.set(0, -0.045, -0.015); h.add(tip); const hinge = mesh(geo('hookH', () => { const c = cyl(0.012, 0.012, 0.05, 12); c.rotateZ(Math.PI / 2); return c; }), M.dark); hinge.position.y = 0.045; h.add(hinge); belly.add(h); this.hooks.push(h); }
    const yoke = mesh(geo('yoke', () => merged([[rbox(0.012, 0.07, 0.03, 0.004), [0.055, -0.15, 0.24]], [rbox(0.012, 0.07, 0.03, 0.004), [-0.055, -0.15, 0.24]], [rbox(0.122, 0.012, 0.03, 0.004), [0, -0.115, 0.24]]])), M.dark); belly.add(yoke);
    const gim = mesh(geo('gim', () => new THREE.SphereGeometry(0.047, 28, 18)), M.black); gim.position.set(0, -0.165, 0.24); belly.add(gim);
    const lens = mesh(geo('glens', () => { const c = cyl(0.024, 0.024, 0.02, 24); c.rotateX(Math.PI / 2); return c; }), M.glass); lens.position.set(0, -0.165, 0.284); belly.add(lens);
    // —— 机臂与动力 ——
    this.armG = [];
    for (let i = 0; i < NA; i++) {
      const a = i * 2 * Math.PI / NA + Math.PI / NA; const front = i === 0 || i === NA - 1; const ag = new THREE.Group(); ag.rotation.y = a; g.add(ag);
      const arm = new THREE.Group(); ag.add(arm); // 拆解时整体外移
      arm.add(mesh(geo('hinge', () => merged([[rbox(0.1, 0.08, 0.1, 0.012), [0, 0, 0.34]]])), M.dark));
      arm.add(mesh(geo('pin', () => merged([[cyl(0.009, 0.009, 0.1, 10), [0, 0, 0.36]]])), M.chrome));
      arm.add(mesh(geo('lock', () => { const c = cyl(0.044, 0.044, 0.05, 28); c.rotateX(Math.PI / 2); c.translate(0, 0, 0.42); return c; }), M.black));
      arm.add(mesh(geo('lockR', () => { const t = new THREE.TorusGeometry(0.044, 0.005, 8, 32); t.translate(0, 0, 0.405); return t; }), M.orange));
      arm.add(mesh(geo('tube' + R, () => { const c = cyl(0.03, 0.034, R - 0.45, 24); c.rotateX(Math.PI / 2); c.translate(0, 0, 0.45 + (R - 0.45) / 2); return c; }), M.carbon));
      arm.add(mesh(geo('esc', () => merged([[rbox(0.06, 0.04, 0.14, 0.008), [0, -0.05, 0.56]]])), M.black));
      arm.add(mesh(geo('escFins', () => { const L = []; for (let k = 0; k < 6; k++) L.push([rbox(0.004, 0.012, 0.12, 0.001), [-0.025 + k * 0.01, -0.075, 0.56]]); return merged(L); }), M.dark));
      arm.add(mesh(geo('armLed' + front, () => merged([[rbox(0.012, 0.008, 0.16, 0.003), [0, 0.032, R * 0.7]]])), front ? M.ledW : M.ledO, false));
      const mot = new THREE.Group(); mot.position.z = R; arm.add(mot);
      mot.add(mesh(geo('mbase', () => merged([[cyl(0.06, 0.052, 0.07, 32), [0, -0.035, 0]], [rbox(0.12, 0.03, 0.09, 0.01), [0, 0.0, -0.04]]])), front ? M.orange : M.white));
      mot.add(mesh(geo('can', () => cyl(0.068, 0.072, 0.075, 40)), M.dark)); mot.children[1].position.y = 0.045;
      mot.add(mesh(geo('fins', () => { const L = []; for (let k = 0; k < 28; k++) { const b = k / 28 * Math.PI * 2; L.push([rbox(0.004, 0.06, 0.012, 0.001), [Math.cos(b) * 0.074, 0.045, Math.sin(b) * 0.074], [0, -b, 0]]); } return merged(L); }), M.dark));
      mot.add(mesh(geo('bell', () => cyl(0.075, 0.075, 0.032, 40)), M.black)); mot.children[3].position.y = 0.098;
      mot.add(mesh(geo('spokes', () => { const L = []; for (let k = 0; k < 8; k++) { const b = k / 8 * Math.PI * 2; L.push([rbox(0.06, 0.006, 0.01, 0.002), [Math.cos(b) * 0.035, 0.116, Math.sin(b) * 0.035], [0, -b, 0]]); } return merged(L); }), M.dark));
      mot.add(mesh(geo('mled', () => new THREE.SphereGeometry(0.014, 12, 8)), front ? M.ledW : M.ledO, false)); mot.children[5].position.set(0, -0.065, 0.02);
      // 桨：桨夹＋折叠桨毂＋两片桨叶＋模糊桨盘＋桨尖圈
      const prop = new THREE.Group(); prop.position.y = 0.13; mot.add(prop);
      prop.add(mesh(geo('padapt', () => merged([[cyl(0.024, 0.03, 0.03, 20)], [cyl(0.012, 0.012, 0.03, 12), [0, 0.025, 0]]])), M.chrome));
      prop.add(mesh(geo('phub', () => merged([[rbox(0.12, 0.016, 0.03, 0.006), [0, 0.006, 0]]])), M.black));
      prop.add(mesh(geo('ppins', () => merged([[cyl(0.006, 0.006, 0.03, 8), [0.045, 0.006, 0]], [cyl(0.006, 0.006, 0.03, 8), [-0.045, 0.006, 0]]])), M.chrome));
      const bm = new THREE.MeshStandardMaterial({ color: '#202125', roughness: 0.32, metalness: 0.2, transparent: true });
      const blades = new THREE.Group(); prop.add(blades); for (const sgn of [0, Math.PI]) { const b = mesh(geo('blade' + this.PR, () => bladeGeo(this.PR)), bm); b.rotation.set(0.17, sgn, 0); blades.add(b); }
      const disc = mesh(geo('disc' + this.PR, () => { const c = new THREE.CircleGeometry(this.PR, 72); c.rotateX(-Math.PI / 2); return c; }), new THREE.MeshBasicMaterial({ map: DISC_TEX, transparent: true, depthWrite: false, side: THREE.DoubleSide }), false); disc.position.y = 0.008; prop.add(disc);
      const tip = mesh(geo('tip' + this.PR, () => { const t2 = new THREE.TorusGeometry(this.PR - 0.012, 0.003, 6, 120); t2.rotateX(Math.PI / 2); return t2; }), new THREE.MeshBasicMaterial({ color: '#ec4e26', transparent: true, depthWrite: false }), false); tip.position.y = 0.008; prop.add(tip);
      this.armG.push({ ag, arm, mot, prop, blades, bm, disc, tip, a });
    }
    // —— 起落架 ——
    const gear = this.gear = new THREE.Group(); g.add(gear); this.gearParts = [];
    for (const sd of [-1, 1]) {
      const knuckle = mesh(geo('knuckle', () => { const c = cyl(0.03, 0.03, 0.07, 20); c.rotateX(Math.PI / 2); return c; }), M.dark); gear.add(knuckle);
      const struts = [0.17, -0.17].map(() => { const m = mesh(geo('strut', () => cyl(0.02, 0.022, 1, 16)), M.white); gear.add(m); return m; });
      const brace = mesh(geo('brace', () => cyl(0.011, 0.011, 1, 10)), M.dark); gear.add(brace);
      const skid = mesh(geo('skid', () => cyl(0.021, 0.021, 1, 16)), M.black); gear.add(skid);
      const caps = [0, 1].map(() => { const c = mesh(geo('cap', () => new THREE.SphereGeometry(0.025, 14, 10)), M.orange); gear.add(c); return c; });
      const pads = [0, 1].map(() => { const p = mesh(geo('pad', () => rbox(0.05, 0.016, 0.08, 0.006)), M.rubber); gear.add(p); return p; });
      this.gearParts.push({ sd, knuckle, struts, brace, skid, caps, pads });
    }
    dyn(g);
  }
  // s: { pos, heading, pitch, roll, rot:{angle,speed}, latch(0 锁~1 开), gear(1 放下~0 收起，默认收起), explode, ring(灯环亮度), t, strobe, scale }
  update(s) {
    const g = this.g; g.visible = true; setPose(g, s.pos, s.heading || 0, s.pitch || 0, s.roll || 0, s.scale || 1);
    const e = s.explode || 0, t = s.t || 0; const sp = s.rot ? s.rot.speed : 0, ang = s.rot ? s.rot.angle : 0;
    this.dome.position.y = 0.2 * e; this.inner.visible = e > 0.02; this.inner.position.y = 0.0 + 0.36 * e;
    this.belly.position.y = -0.16 * e;
    const latch = s.latch || 0; this.hooks.forEach((h, i) => { const a = i * Math.PI / 2 + Math.PI / 4; const r = 0.14 + 0.045 * latch; h.position.set(Math.sin(a) * r, -0.17 + 0.025 * latch, Math.cos(a) * r); h.rotation.set(-0.5 * latch, a, 0, 'YXZ'); });
    const rk = s.ring ?? 1.2; this.ringMat.color.set(rk > 0.3 ? '#7fe0ff' : '#3a6f85'); this.ringGlow.material.opacity = clamp(rk * 0.35);
    const blur = smooth((sp - 0.3) / 0.4);
    this.armG.forEach((A, i) => {
      A.arm.position.z = 0.34 * e; A.mot.position.y = 0.24 * e; A.prop.position.y = 0.13 + 0.36 * e;
      A.prop.rotation.y = ang * (i % 2 ? 1 : -1) + i * 0.7;
      A.bm.opacity = 1 - 0.88 * blur; A.blades.visible = A.bm.opacity > 0.02; A.disc.visible = blur > 0.02; A.disc.material.opacity = blur; A.disc.rotation.y = -ang * 0.013 * (i % 2 ? 1 : -1);
      A.tip.visible = blur > 0.02; A.tip.material.opacity = 0.7 * blur;
    });
    const gy = -0.36 * e, gr = 1 - (s.gear ?? 0); /* 默认收起：挂着六足机器人时放下的起落架会穿过它收起的腿 */ const sy = lerp(-0.62, -0.17, gr), sx = lerp(0.62, 0.86, gr);
    for (const P of this.gearParts) { const sd = P.sd; const top = [sd * 0.22, -0.11 + gy, 0];
      P.knuckle.position.set(...top);
      P.struts.forEach((m, k) => { const zz = k ? -0.17 : 0.17; span(m, [top[0], top[1], zz * 0.6], [sd * sx, sy + gy, zz * 1.4]); });
      span(P.brace, [sd * lerp(0.22, sx, 0.55), lerp(top[1], sy + gy, 0.55), -0.17 * 1.0], [sd * lerp(0.22, sx, 0.55), lerp(top[1], sy + gy, 0.55), 0.17 * 1.0]);
      span(P.skid, [sd * sx, sy + gy, -0.47], [sd * sx, sy + gy, 0.47]); P.caps[0].position.set(sd * sx, sy + gy, 0.48); P.caps[1].position.set(sd * sx, sy + gy, -0.48);
      P.pads[0].position.set(sd * sx, sy + gy - 0.025, 0.34); P.pads[1].position.set(sd * sx, sy + gy - 0.025, -0.34); P.pads.forEach((p) => { p.visible = gr < 0.5; }); }
    const on = s.strobe !== false && (t % 1.2) < 0.08; this.strobe.material = on ? M.ledW : M.black; this.strobeGlow.visible = on;
    return g;
  }
  world(p) { this.g.updateMatrixWorld(); return new THREE.Vector3(p[0], p[1], p[2]).applyMatrix4(this.g.matrixWorld).toArray(); }
}
export const DRONES = { 6: pool(() => new Hexacopter(6)), 4: pool(() => new Hexacopter(4)), 8: pool(() => new Hexacopter(8)) };
export function drawDrone(s) { const d = DRONES[s.arms || 6].get(); d.update(s); return d; }
