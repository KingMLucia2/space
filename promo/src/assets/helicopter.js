// 救援直升机：白色机身＋橙色救援涂装、驾驶舱玻璃、尾梁尾桨、四叶主旋翼（高速时虚化为圆盘）、滑橇。机头朝 +z，长约 12 米。
import * as THREE from 'three';
import { M } from '../materials.js';
import { decalBand } from '../textures.js';
import { smooth } from '../util.js';
import { cylinderBetween } from './drone.js';

export function createHelicopter() {
  const root = new THREE.Group(); root.name = 'heli';
  const body = new THREE.Group(); root.add(body);
  const paint = new THREE.MeshPhysicalMaterial({ color: 0xf1f2f3, roughness: 0.3, clearcoat: 1, clearcoatRoughness: 0.1 });
  const orange = new THREE.MeshPhysicalMaterial({ color: 0xff5a0a, roughness: 0.32, clearcoat: 1, clearcoatRoughness: 0.12 });
  const decal = new THREE.MeshPhysicalMaterial({ map: decalBand('救援 RESCUE  B-7120', { w: 2048, h: 160, repeat: 2, chevrons: false, font: 'bold 96px "Noto Sans SC","WenQuanYi Zen Hei",Arial,sans-serif' }), roughness: 0.32, clearcoat: 1 });
  // 机身：车削出的流线型剖面
  const prof = [[0, -3.2], [0.55, -3.0], [0.95, -2.4], [1.15, -1.2], [1.2, 0.3], [1.1, 1.6], [0.85, 2.6], [0.4, 3.25], [0, 3.4]].map(([r, y]) => new THREE.Vector2(r, y));
  const fus = new THREE.LatheGeometry(prof, 40); fus.rotateX(Math.PI / 2); fus.scale(1, 1.08, 1);
  body.add(new THREE.Mesh(fus, paint));
  const band = new THREE.Mesh(new THREE.CylinderGeometry(1.215, 1.215, 1.1, 40, 1, true), decal); band.rotation.x = Math.PI / 2; band.rotation.y = Math.PI / 2; band.scale.set(1, 1, 1.08); band.position.z = -0.6; body.add(band);
  const glass = new THREE.Mesh(new THREE.SphereGeometry(1.0, 32, 20, -Math.PI * 0.42, Math.PI * 0.84, Math.PI * 0.22, Math.PI * 0.5), M.glass);
  glass.scale.set(1.08, 0.95, 1.5); glass.position.set(0, 0.15, 1.75); body.add(glass);
  // 尾梁、垂尾、平尾
  body.add(cylinderBetween(new THREE.Vector3(0, 0.35, -2.8), new THREE.Vector3(0, 0.75, -8.6), 0.42, 0.17, paint, 20));
  const stripe = cylinderBetween(new THREE.Vector3(0, 0.45, -4.2), new THREE.Vector3(0, 0.55, -5.4), 0.37, 0.31, orange, 20); body.add(stripe);
  const fin = new THREE.Mesh(new THREE.BoxGeometry(0.12, 1.6, 0.9), orange); fin.position.set(0, 1.4, -8.5); fin.rotation.x = -0.35; body.add(fin);
  const stab = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.08, 0.55), paint); stab.position.set(0, 0.75, -7.6); body.add(stab);
  // 发动机整流罩、旋翼轴
  const cowl = new THREE.Mesh(new THREE.CapsuleGeometry(0.55, 1.6, 8, 20), paint); cowl.rotation.x = Math.PI / 2; cowl.position.set(0, 1.25, -0.9); body.add(cowl);
  const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.16, 0.6, 16), M.darkMetal); mast.position.set(0, 1.85, -0.5); body.add(mast);
  const rotor = new THREE.Group(); rotor.position.set(0, 2.15, -0.5); body.add(rotor);
  const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.3, 0.18, 20), M.darkMetal); rotor.add(hub);
  const bladeMat = new THREE.MeshStandardMaterial({ color: 0x2a2c30, roughness: 0.5, metalness: 0.3, transparent: true });
  for (let k = 0; k < 4; k++) { const b = new THREE.Mesh(new THREE.BoxGeometry(5.4, 0.05, 0.32), bladeMat); b.position.x = 2.85; const g = new THREE.Group(); g.rotation.y = k * Math.PI / 2; g.add(b); rotor.add(g); }
  const discMat = new THREE.MeshBasicMaterial({ color: 0x1c1e22, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide });
  const disc = new THREE.Mesh(new THREE.RingGeometry(0.4, 5.6, 64), discMat); disc.rotation.x = -Math.PI / 2; rotor.add(disc);
  const tail = new THREE.Group(); tail.position.set(0.18, 1.55, -8.7); body.add(tail);
  for (let k = 0; k < 2; k++) { const b = new THREE.Mesh(new THREE.BoxGeometry(0.03, 1.4, 0.16), bladeMat); const g = new THREE.Group(); g.rotation.x = k * Math.PI / 2; g.add(b); tail.add(g); }
  const tdiscMat = discMat.clone(); const tdisc = new THREE.Mesh(new THREE.CircleGeometry(0.72, 32), tdiscMat); tdisc.rotation.y = Math.PI / 2; tail.add(tdisc);
  // 滑橇
  for (const s of [-1, 1]) {
    const skid = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 4.2, 10), M.darkMetal); skid.rotation.x = Math.PI / 2; skid.position.set(s * 1.25, -1.45, 0.1); body.add(skid);
    body.add(cylinderBetween(new THREE.Vector3(s * 0.7, -0.9, 1.0), new THREE.Vector3(s * 1.25, -1.45, 1.1), 0.05, 0.05, M.darkMetal));
    body.add(cylinderBetween(new THREE.Vector3(s * 0.7, -0.9, -1.0), new THREE.Vector3(s * 1.25, -1.45, -0.9), 0.05, 0.05, M.darkMetal));
  }
  // 航行灯、防撞灯
  const beaconMat = new THREE.MeshStandardMaterial({ color: 0, emissive: 0xff2a10, emissiveIntensity: 0 });
  const beacon = new THREE.Mesh(new THREE.SphereGeometry(0.09, 10, 8), beaconMat); beacon.position.set(0, 1.0, -3.0); body.add(beacon);
  const searchMat = M.ledWhite.clone(); const search = new THREE.Mesh(new THREE.SphereGeometry(0.12, 12, 8), searchMat); search.position.set(0, -1.0, 2.2); body.add(search);
  root.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  disc.castShadow = false; tdisc.castShadow = false; glass.castShadow = false;
  return {
    root, body, rotor, tail,
    // angle：主旋翼转角，speed：0~1
    set(angle, speed, t = 0) {
      rotor.rotation.y = angle; tail.rotation.x = angle * 4.6;
      const blur = smooth((speed - 0.3) / 0.4);
      bladeMat.opacity = 1 - blur * 0.85; discMat.opacity = blur * 0.22; tdiscMat.opacity = blur * 0.25;
      beaconMat.emissiveIntensity = (t % 1.0) < 0.12 ? 25 : 0.2;
    },
  };
}
