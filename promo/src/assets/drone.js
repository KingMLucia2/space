// 六轴无人机：白色机身＋橙色警示条，碳纤维机臂，6 个旋翼，起落架，机腹对接锁扣和蓝色灯环。
// 坐标：机身中心为原点，+z 为机头方向，单位米。
import * as THREE from 'three';
import { M } from '../materials.js';
import { clamp, smooth } from '../util.js';
import { decalBand, panelNormal } from '../textures.js';
import { rbox, bevelHex, filletLathe, bladeGeo } from '../geo.js';

export function cylinderBetween(a, b, r1, r2, mat, seg = 18) {
  const dir = new THREE.Vector3().subVectors(b, a); const len = dir.length();
  const m = new THREE.Mesh(new THREE.CylinderGeometry(r2, r1, len, seg), mat);
  m.position.copy(a).addScaledVector(dir, 0.5);
  m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
  return m;
}

export const DRONE = { armReach: 1.12, propR: 0.37, skidY: -0.62, latchY: -0.17 };

export function createDrone() {
  const root = new THREE.Group(); root.name = 'drone';
  const body = new THREE.Group(); root.add(body);
  const cast = (o) => { o.traverse((c) => { if (c.isMesh) { c.castShadow = true; c.receiveShadow = true; } }); return o; };

  const hub = new THREE.Mesh(filletLathe([[0, -0.08], [0.33, -0.08], [0.345, -0.05], [0.336, 0.058], [0.31, 0.08], [0, 0.08]], 0.014, 96), M.white); body.add(hub);
  // 顶罩：放射状面板缝和一圈螺丝
  const seams = []; for (let k = 0; k < 6; k++) seams.push([k / 6, 0.0, k / 6, 1.0]);
  seams.push([0, 0.55, 1, 0.55]);
  const screws = []; for (let k = 0; k < 12; k++) screws.push([(k + 0.5) / 12, 0.8]);
  const domeMat = M.white.clone(); domeMat.normalMap = panelNormal(512, seams, screws, 5); domeMat.normalScale.set(0.6, 0.6);
  const dome = new THREE.Mesh(new THREE.SphereGeometry(0.3, 96, 32, 0, Math.PI * 2, 0, Math.PI / 2), domeMat);
  dome.scale.y = 0.36; dome.position.y = 0.08; body.add(dome);
  const bandMat = new THREE.MeshPhysicalMaterial({ map: decalBand('RESCUE · HX-01', { repeat: 3 }), roughness: 0.35, clearcoat: 0.8, clearcoatRoughness: 0.15 });
  const band = new THREE.Mesh(new THREE.CylinderGeometry(0.347, 0.347, 0.055, 96, 1, true), bandMat); band.position.y = -0.03; body.add(band);
  const strobeMat = M.ledWhite.clone();
  const strobe = new THREE.Mesh(new THREE.SphereGeometry(0.018, 16, 12), strobeMat); strobe.position.set(0, 0.2, -0.1); body.add(strobe);
  const mastA = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.008, 0.16, 6), M.carbon); mastA.position.set(-0.1, 0.22, -0.16); mastA.rotation.z = 0.25; body.add(mastA);
  // 顶部 GPS 天线和指示灯
  for (const s of [-1, 1]) { const g = new THREE.Mesh(filletLathe([[0, 0], [0.05, 0], [0.046, 0.03], [0, 0.03]], 0.006, 40), M.offwhite); g.position.set(s * 0.12, 0.145, -0.06); body.add(g); }
  const topLed = new THREE.Mesh(new THREE.SphereGeometry(0.02, 16, 12), M.ledBlue); topLed.position.set(0, 0.19, 0.08); body.add(topLed);
  // 机腹
  const belly = new THREE.Mesh(bevelHex(0.24, 0.06, 0.01), M.gunmetal); belly.position.y = -0.11; body.add(belly);
  const ringMat = M.ledBlue.clone();
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.19, 0.009, 10, 96), ringMat); ring.rotation.x = Math.PI / 2; ring.position.y = -0.143; body.add(ring);
  const hooks = [];
  for (let i = 0; i < 4; i++) {
    const a = i * Math.PI / 2 + Math.PI / 4;
    const pivot = new THREE.Group(); pivot.position.set(Math.sin(a) * 0.13, -0.14, Math.cos(a) * 0.13); pivot.rotation.y = a;
    const arm = new THREE.Mesh(rbox(0.035, 0.08, 0.03, 0.006), M.darkMetal); arm.position.y = -0.04; pivot.add(arm);
    const tip = new THREE.Mesh(rbox(0.035, 0.022, 0.05, 0.006), M.darkMetal); tip.position.set(0, -0.075, -0.02); pivot.add(tip);
    body.add(pivot); hooks.push(pivot);
  }
  // 云台相机（机头前下方）
  const gimbal = new THREE.Group(); gimbal.position.set(0, -0.12, 0.27); body.add(gimbal);
  const yoke = new THREE.Mesh(rbox(0.1, 0.05, 0.05, 0.01), M.gunmetal); gimbal.add(yoke);
  const camBall = new THREE.Mesh(new THREE.SphereGeometry(0.06, 40, 28), M.graphite); camBall.position.y = -0.06; gimbal.add(camBall);
  const lens = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.03, 0.03, 32), M.lens); lens.rotation.x = Math.PI / 2; lens.position.set(0, -0.06, 0.055); gimbal.add(lens);

  const props = [];
  for (let i = 0; i < 6; i++) {
    const a = i * Math.PI / 3 + Math.PI / 6;
    const pivot = new THREE.Group(); pivot.rotation.y = a - Math.PI / 2; body.add(pivot);
    const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.034, 0.8, 28), M.carbon); arm.rotation.z = Math.PI / 2; arm.position.x = 0.71; pivot.add(arm);
    const joint = new THREE.Mesh(rbox(0.1, 0.07, 0.08, 0.014), M.gunmetal); joint.position.x = 0.36; pivot.add(joint);
    const stripe = new THREE.Mesh(new THREE.CylinderGeometry(0.037, 0.037, 0.08, 28), M.orange); stripe.rotation.z = Math.PI / 2; stripe.position.x = 0.94; pivot.add(stripe);
    const mount = new THREE.Mesh(rbox(0.13, 0.05, 0.1, 0.01), M.carbon); mount.position.set(DRONE.armReach, 0, 0); pivot.add(mount);
    const motor = new THREE.Mesh(filletLathe([[0, 0], [0.072, 0], [0.072, 0.03], [0.066, 0.036], [0.066, 0.09], [0.056, 0.1], [0, 0.1]], 0.004, 48), M.darkMetal); motor.position.set(DRONE.armReach, 0.02, 0); pivot.add(motor);
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.058, 0.02, 48), M.metal); cap.position.set(DRONE.armReach, 0.13, 0); pivot.add(cap);
    const led = new THREE.Mesh(new THREE.SphereGeometry(0.02, 16, 12), (i === 0 || i === 5) ? M.ledWhite : M.ledBlue); led.position.set(DRONE.armReach, -0.04, 0); pivot.add(led);
    const prop = new THREE.Group(); prop.position.set(DRONE.armReach, 0.15, 0); pivot.add(prop);
    const bladeMat = M.carbon.clone(); bladeMat.transparent = true;
    const bg = bladeGeo({ r0: 0.02, r1: DRONE.propR - 0.004 }), tipG = bladeGeo({ r0: DRONE.propR - 0.05, r1: DRONE.propR - 0.003, chordRoot: 0.027, chordMax: 0.026, chordTip: 0.022, thick: 0.0058, twistRoot: 0.14, twistTip: 0.1, sections: 4 });
    for (const s of [0, Math.PI]) {
      const blade = new THREE.Mesh(bg, bladeMat); blade.rotation.y = s; prop.add(blade);
      const tip = new THREE.Mesh(tipG, M.orange); tip.rotation.y = s; tip.scale.set(1, 1.08, 1.08); prop.add(tip); tip.userData.tip = true;
    }
    const hubc = new THREE.Mesh(filletLathe([[0, -0.015], [0.03, -0.015], [0.028, 0.012], [0.012, 0.022], [0, 0.024]], 0.004, 32), M.metal); prop.add(hubc);
    const discMat = new THREE.MeshBasicMaterial({ color: 0x15171a, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide });
    const disc = new THREE.Mesh(new THREE.RingGeometry(0.04, DRONE.propR, 96), discMat); disc.rotation.x = -Math.PI / 2; disc.renderOrder = 2; prop.add(disc);
    const tipRingMat = new THREE.MeshBasicMaterial({ color: 0xf06a14, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide });
    const tipRing = new THREE.Mesh(new THREE.RingGeometry(DRONE.propR - 0.035, DRONE.propR - 0.005, 96), tipRingMat); tipRing.rotation.x = -Math.PI / 2; tipRing.renderOrder = 3; prop.add(tipRing);
    props.push({ prop, bladeMat, discMat, tipRingMat, dir: i % 2 ? 1 : -1 });
  }
  // 起落架：左右两条滑橇
  const gear = new THREE.Group(); body.add(gear);
  const sx = 0.64, sy = DRONE.skidY, sz = 0.46;
  for (const s of [-1, 1]) {
    gear.add(cylinderBetween(new THREE.Vector3(s * 0.2, -0.12, 0.17), new THREE.Vector3(s * sx, sy, 0.24), 0.018, 0.02, M.carbon));
    gear.add(cylinderBetween(new THREE.Vector3(s * 0.2, -0.12, -0.17), new THREE.Vector3(s * sx, sy, -0.24), 0.018, 0.02, M.carbon));
    const skid = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, sz * 2, 24), M.carbon); skid.rotation.x = Math.PI / 2; skid.position.set(s * sx, sy, 0); gear.add(skid);
    for (const e of [-1, 1]) { const cap = new THREE.Mesh(new THREE.SphereGeometry(0.024, 20, 14), M.orange); cap.position.set(s * sx, sy, e * sz); gear.add(cap); }
  }
  cast(root);
  for (const p of props) { p.prop.children.forEach((c) => { if (c.material === p.discMat || c.material === p.tipRingMat) c.castShadow = false; }); }

  const api = {
    root, body, props, hooks, ringMat, gimbal, strobeMat,
    setStrobe(t) { strobeMat.emissiveIntensity = (t % 1.2) < 0.06 ? 40 : 0.3; },
    // angle：旋翼累计转角；speed：0 静止 ~ 1 全速（决定叶片虚化成圆盘的程度）
    setRotors(angle, speed) {
      const blur = smooth((speed - 0.35) / 0.4);
      for (const p of props) {
        p.prop.rotation.y = angle * p.dir + p.dir * 0.7;
        p.bladeMat.opacity = 1 - blur * 0.92;
        p.prop.children.forEach((c) => { if (c.userData.tip) c.visible = blur < 0.6; });
        p.discMat.opacity = blur * 0.2;
        p.tipRingMat.opacity = blur * 0.28;
      }
    },
    // 锁扣：0 锁紧，1 打开
    setLatch(open) { hooks.forEach((h) => { h.rotation.x = -open * 0.9; }); },
    setRing(intensity) { ringMat.emissiveIntensity = intensity; },
  };
  api.setRotors(0, 0); api.setLatch(0);
  return api;
}

// 旋翼转角：从 t0 开始以 accel 加速，最高转速 wMax（rad/s），返回 {angle, speed}
export function rotorSpin(t, { t0 = -100, wMax = 160, spinUp = 2.0, t1 = Infinity, spinDown = 2.0 } = {}) {
  if (t < t0) return { angle: 0, speed: 0 };
  const a = wMax / spinUp; const tu = t - t0;
  let angle, w;
  if (tu < spinUp) { angle = 0.5 * a * tu * tu; w = a * tu; } else { angle = 0.5 * a * spinUp * spinUp + wMax * (tu - spinUp); w = wMax; }
  if (t > t1) { const td = Math.min(t - t1, spinDown); const d = wMax / spinDown; angle -= 0.5 * d * td * td; w = Math.max(0, wMax - d * td); }
  return { angle, speed: clamp(w / wMax) };
}
