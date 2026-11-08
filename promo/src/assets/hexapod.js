// 六足机器人：深灰机身＋橙色标识，头部生命探测模块（雷达面板可展开），六条三关节腿。
// 坐标：机身中心为原点，+z 为前方。腿用解析逆运动学求解，步态为三角步态，全部是时间的纯函数。
import * as THREE from 'three';
import { M } from '../materials.js';
import { clamp, lerp, smooth } from '../util.js';
import { panelNormal, labelTexture } from '../textures.js';

export const HEX = { bodyR: 0.24, mountR: 0.22, L0: 0.06, L1: 0.2, L2: 0.3, standH: 0.24, footR: 0.52, topY: 0.11 };
const PSI = [45, 90, 135, -45, -90, -135].map((d) => d * Math.PI / 180);
// 腿序：左前、左中、左后、右前、右中、右后。三角步态分两组：{左前、右中、左后} 与 {右前、左中、右后}
export const TRIPOD = [0, 1, 0, 1, 0, 1];

function legIK(lx, ly, lz) {
  const { L0, L1, L2 } = HEX;
  const gamma = Math.atan2(-lz, lx);
  const r = Math.hypot(lx, lz) - L0;
  let d = Math.hypot(r, ly);
  d = clamp(d, Math.abs(L1 - L2) + 1e-3, L1 + L2 - 1e-3);
  const knee = Math.acos(clamp((L1 * L1 + L2 * L2 - d * d) / (2 * L1 * L2), -1, 1));
  const beta = -(Math.PI - knee);
  const alpha = Math.atan2(ly, r) + Math.acos(clamp((L1 * L1 + d * d - L2 * L2) / (2 * L1 * d), -1, 1));
  return [gamma, alpha, beta];
}

// 收腿姿态（挂在无人机下）：腿水平折叠贴在机身四周
function foldAngles(i) {
  const s = Math.sign(PSI[i]);
  const front = i % 3 === 0, rear = i % 3 === 2;
  const gamma = front ? -s * 0.45 : rear ? s * 0.45 : 0;
  return [gamma, 0.05, -2.95];
}

export function createHexapod() {
  const root = new THREE.Group(); root.name = 'hexapod';
  const body = new THREE.Group(); root.add(body);
  const hexGeo = (r, h) => { const g = new THREE.CylinderGeometry(r, r, h, 6); g.rotateY(Math.PI / 6); return g; };
  const chassis = new THREE.Mesh(hexGeo(HEX.bodyR, 0.1), M.gunmetal); body.add(chassis);
  const coverMat = M.graphite.clone();
  coverMat.normalMap = panelNormal(512, [[0.5, 0, 0.5, 1], [0, 0.5, 1, 0.5], [0.2, 0.2, 0.8, 0.2], [0.2, 0.8, 0.8, 0.8]], [[0.1, 0.1], [0.9, 0.1], [0.1, 0.9], [0.9, 0.9], [0.5, 0.15], [0.5, 0.85]], 5);
  coverMat.normalScale.set(0.5, 0.5);
  const cover = new THREE.Mesh(hexGeo(HEX.bodyR * 0.93, 0.045), coverMat); cover.position.y = 0.07; body.add(cover);
  // 标识贴花
  const tag = new THREE.Mesh(new THREE.PlaneGeometry(0.12, 0.04), new THREE.MeshStandardMaterial({ map: labelTexture('HX-02', { w: 256, h: 84, font: 'bold 60px Arial,sans-serif', color: '#ff6a14' }), transparent: true, roughness: 0.4 }));
  tag.rotation.x = -Math.PI / 2; tag.position.set(0, 0.0935, -0.12); body.add(tag);
  for (const s of [-1, 1]) {
    const lab = new THREE.Mesh(new THREE.PlaneGeometry(0.1, 0.025), new THREE.MeshStandardMaterial({ map: labelTexture('生命探测', { w: 256, h: 64, font: 'bold 44px "Noto Sans SC","WenQuanYi Zen Hei",sans-serif', color: '#2a2d31' }), transparent: true, roughness: 0.5 }));
    lab.rotation.y = s * Math.PI / 2; lab.userData.side = s; lab.userData.isLabel = true; body.userData['lab' + s] = lab;
  }
  const stripeL = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.005, 0.3), M.orange); stripeL.position.set(0.11, 0.095, 0); body.add(stripeL);
  const stripeR = stripeL.clone(); stripeR.position.x = -0.11; body.add(stripeR);
  const plate = new THREE.Mesh(new THREE.BoxGeometry(0.17, 0.018, 0.17), M.darkMetal); plate.position.y = 0.1; body.add(plate);
  for (let i = 0; i < 4; i++) { const a = i * Math.PI / 2 + Math.PI / 4; const pin = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.03, 8), M.metal); pin.position.set(Math.sin(a) * 0.13 * 0.75, 0.115, Math.cos(a) * 0.13 * 0.75); body.add(pin); }
  const battery = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.06, 0.09), M.carbon); battery.position.set(0, 0.0, -0.25); body.add(battery);
  const ant = new THREE.Mesh(new THREE.CylinderGeometry(0.005, 0.007, 0.16, 6), M.carbon); ant.position.set(0.06, 0.15, -0.2); body.add(ant);
  const ledMat = M.ledBlue.clone();
  for (const s of [-1, 1]) { const strip = new THREE.Mesh(new THREE.BoxGeometry(0.006, 0.012, 0.18), ledMat); strip.position.set(s * 0.205, 0.03, 0); body.add(strip); }
  // 头部：生命探测模块
  const head = new THREE.Group(); head.position.set(0, 0.025, 0.25); body.add(head);
  const headBox = new THREE.Mesh(new THREE.BoxGeometry(0.17, 0.085, 0.12), M.white); head.add(headBox);
  for (const s of [-1, 1]) { const lab = body.userData['lab' + s]; lab.position.set(s * 0.0855, 0.012, 0); head.add(lab); }
  const headStripe = new THREE.Mesh(new THREE.BoxGeometry(0.172, 0.018, 0.122), M.orange); headStripe.position.y = -0.03; head.add(headStripe);
  const lensL = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.024, 0.02, 18), M.lens); lensL.rotation.x = Math.PI / 2; lensL.position.set(-0.04, 0.008, 0.062); head.add(lensL);
  const lensR = lensL.clone(); lensR.position.x = 0.04; head.add(lensR);
  const eyeMat = M.ledCyan.clone();
  const eye = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.008, 0.004), eyeMat); eye.position.set(0, -0.016, 0.062); head.add(eye);
  // 雷达面板：铰接在头顶后缘，0 折叠平放，1 竖起
  const panelPivot = new THREE.Group(); panelPivot.position.set(0, 0.044, -0.055); head.add(panelPivot);
  const panel = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.012, 0.11), M.offwhite); panel.position.z = 0.055; panelPivot.add(panel);
  const panelFaceMat = new THREE.MeshStandardMaterial({ color: 0x0b1a2a, emissive: 0x2b8cff, emissiveIntensity: 0.0, roughness: 0.3 });
  const panelFace = new THREE.Mesh(new THREE.PlaneGeometry(0.14, 0.09), panelFaceMat); panelFace.rotation.x = -Math.PI / 2; panelFace.position.set(0, 0.0065, 0.055); panelPivot.add(panelFace);
  const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.2, 8), M.metal); mast.position.set(0.07, 0.04, -0.04); head.add(mast);
  const mastTip = new THREE.Mesh(new THREE.SphereGeometry(0.012, 8, 8), M.ledBlue); mastTip.position.y = 0.1; mast.add(mastTip);

  const legs = [];
  for (let i = 0; i < 6; i++) {
    const psi = PSI[i];
    const mount = new THREE.Group(); mount.position.set(Math.sin(psi) * HEX.mountR, 0, Math.cos(psi) * HEX.mountR); mount.rotation.y = psi - Math.PI / 2; body.add(mount);
    const coxa = new THREE.Group(); mount.add(coxa);
    const servo0 = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.06, 0.05), M.carbon); coxa.add(servo0);
    const coxaLink = new THREE.Mesh(new THREE.BoxGeometry(HEX.L0, 0.03, 0.04), M.gunmetal); coxaLink.position.x = HEX.L0 / 2; coxa.add(coxaLink);
    const femur = new THREE.Group(); femur.position.x = HEX.L0; coxa.add(femur);
    const servo1 = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.055, 20), M.darkMetal); servo1.rotation.x = Math.PI / 2; femur.add(servo1);
    for (const sd of [-1, 1]) { const horn = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.006, 16), M.metal); horn.rotation.x = Math.PI / 2; horn.position.z = sd * 0.03; femur.add(horn); }
    const femLink = new THREE.Mesh(new THREE.BoxGeometry(HEX.L1, 0.04, 0.035), M.graphite); femLink.position.x = HEX.L1 / 2; femur.add(femLink);
    const femStripe = new THREE.Mesh(new THREE.BoxGeometry(HEX.L1 * 0.5, 0.042, 0.037), M.orange); femStripe.position.x = HEX.L1 * 0.55; femur.add(femStripe);
    const tibia = new THREE.Group(); tibia.position.x = HEX.L1; femur.add(tibia);
    const servo2 = new THREE.Mesh(new THREE.CylinderGeometry(0.026, 0.026, 0.05, 20), M.darkMetal); servo2.rotation.x = Math.PI / 2; tibia.add(servo2);
    for (const sd of [-1, 1]) { const horn = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.006, 16), M.metal); horn.rotation.x = Math.PI / 2; horn.position.z = sd * 0.027; tibia.add(horn); }
    const kneeLed = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.006, 0.004), ledMat); kneeLed.position.set(0.06, 0.012, 0.0185); tibia.add(kneeLed);
    const tibGeo = new THREE.CylinderGeometry(0.012, 0.022, HEX.L2, 10); tibGeo.rotateZ(-Math.PI / 2); tibGeo.translate(HEX.L2 / 2, 0, 0);
    const tibLink = new THREE.Mesh(tibGeo, M.gunmetal); tibia.add(tibLink);
    const foot = new THREE.Mesh(new THREE.SphereGeometry(0.02, 12, 10), M.rubber); foot.position.x = HEX.L2; tibia.add(foot);
    legs.push({ psi, mount, coxa, femur, tibia, fold: foldAngles(i) });
  }
  root.traverse((c) => { if (c.isMesh) { c.castShadow = true; c.receiveShadow = true; } });

  const tmpM = new THREE.Matrix4(), tmpInv = new THREE.Matrix4(), v = new THREE.Vector3();
  const api = {
    root, body, head, panelPivot, panelFaceMat, mast, ledMat, eyeMat, legs,
    // pose：{x,y,z,heading,pitch,roll}，y 为机身中心离地高度（世界坐标）
    // feet：6 个世界坐标落足点；fold：0 站立（IK）~1 收腿
    setPose(pose, feet, fold = 0) {
      root.position.set(pose.x, pose.y, pose.z);
      root.rotation.set(0, pose.heading || 0, 0);
      body.rotation.set(pose.pitch || 0, 0, pose.roll || 0);
      root.updateMatrixWorld(true);
      tmpInv.copy(body.matrixWorld).invert();
      for (let i = 0; i < 6; i++) {
        const L = legs[i];
        let ik = L.fold;
        if (feet && fold < 1) {
          v.copy(feet[i]).applyMatrix4(tmpInv); // 机身坐标
          v.sub(L.mount.position);
          const th = -(L.psi - Math.PI / 2), c = Math.cos(th), s = Math.sin(th);
          const lx = v.x * c + v.z * s, lz = -v.x * s + v.z * c;
          ik = legIK(lx, v.y, lz);
        }
        const k = smooth(fold);
        L.coxa.rotation.y = lerp(ik[0], L.fold[0], k);
        L.femur.rotation.z = lerp(ik[1], L.fold[1], k);
        L.tibia.rotation.z = lerp(ik[2], L.fold[2], k);
      }
    },
    setScanner(deploy, glow = 0) {
      panelPivot.rotation.x = -deploy * 1.25;
      mast.scale.y = 0.25 + 0.75 * deploy; mast.position.y = 0.04 + 0.1 * (mast.scale.y - 1) * 0.5;
      panelFaceMat.emissiveIntensity = glow * 2.5;
    },
    // 机身坐标中的标准落足点（世界坐标需再变换）
    nominalFoot(i, radius = HEX.footR) { const p = PSI[i]; return new THREE.Vector3(Math.sin(p) * radius, 0, Math.cos(p) * radius); },
  };
  api.setScanner(0, 0);
  return api;
}

// 按机身位姿把机身坐标的落足点放到地面上（世界坐标）
export function footOnGround(pose, local, groundY = () => 0) {
  const c = Math.cos(pose.heading || 0), s = Math.sin(pose.heading || 0);
  const x = pose.x + local.x * c + local.z * s, z = pose.z - local.x * s + local.z * c;
  return new THREE.Vector3(x, groundY(x, z), z);
}

// 三角步态：bodyAt(t) 返回 {x,z,heading}，以时间的纯函数给出 6 只脚的世界坐标
export function gaitFeet(hex, t, bodyAt, { freq = 1.3, lift = 0.07, radius = HEX.footR, groundY = () => 0 } = {}) {
  const feet = [];
  for (let i = 0; i < 6; i++) {
    const ph = TRIPOD[i] * 0.5;
    const c = t * freq + ph, k = Math.floor(c), u = c - k;
    const local = hex.nominalFoot(i, radius);
    const touch = (kk) => footOnGround(bodyAt((kk + 0.25 - ph) / freq), local, groundY);
    if (u < 0.5) { feet.push(touch(k)); continue; }
    const a = touch(k), b = touch(k + 1);
    const s = smooth((u - 0.5) / 0.5);
    const p = new THREE.Vector3().lerpVectors(a, b, s);
    const dist = a.distanceTo(b);
    p.y += Math.sin(Math.PI * s) * lift * clamp(dist / 0.05);
    feet.push(p);
  }
  return feet;
}
