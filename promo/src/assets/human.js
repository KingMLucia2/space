// 简化人物：头、躯干、四肢都用胶囊体；带跑步/站立的程序化姿态。用于救援队员和指挥中心人员（多为背影、剪影）。
import * as THREE from 'three';

export function createHuman({ suit = 0xff6a14, helmet = 0xf2f2f0, skin = 0xc69c7d, pants = null } = {}) {
  const root = new THREE.Group();
  const mSuit = new THREE.MeshStandardMaterial({ color: suit, roughness: 0.8 });
  const mPants = new THREE.MeshStandardMaterial({ color: pants ?? suit, roughness: 0.85 });
  const mHelm = new THREE.MeshPhysicalMaterial({ color: helmet, roughness: 0.35, clearcoat: 0.6 });
  const mSkin = new THREE.MeshStandardMaterial({ color: skin, roughness: 0.7 });
  const cap = (r, l, m) => new THREE.Mesh(new THREE.CapsuleGeometry(r, l, 8, 20), m);
  const hips = new THREE.Group(); hips.position.y = 0.95; root.add(hips);
  const torso = new THREE.Group(); hips.add(torso);
  const chest = cap(0.17, 0.4, mSuit); chest.position.y = 0.3; chest.scale.set(1.15, 1, 0.75); torso.add(chest);
  const head = new THREE.Group(); head.position.y = 0.72; torso.add(head);
  head.add(new THREE.Mesh(new THREE.SphereGeometry(0.11, 32, 20), mSkin));
  const helm = new THREE.Mesh(new THREE.SphereGeometry(0.125, 32, 16, 0, Math.PI * 2, 0, Math.PI * 0.55), mHelm); helm.position.y = 0.02; head.add(helm);
  const limb = (parent, x, y, r, l1, l2, m1, m2) => {
    const a = new THREE.Group(); a.position.set(x, y, 0); parent.add(a);
    const u = cap(r, l1, m1); u.position.y = -l1 / 2 - r; a.add(u);
    const b = new THREE.Group(); b.position.y = -l1 - r * 2; a.add(b);
    const lo = cap(r * 0.9, l2, m2); lo.position.y = -l2 / 2 - r; b.add(lo);
    return { a, b };
  };
  const armL = limb(torso, 0.24, 0.55, 0.055, 0.22, 0.22, mSuit, mSuit), armR = limb(torso, -0.24, 0.55, 0.055, 0.22, 0.22, mSuit, mSuit);
  const legL = limb(hips, 0.1, 0, 0.075, 0.33, 0.33, mPants, mPants), legR = limb(hips, -0.1, 0, 0.075, 0.33, 0.33, mPants, mPants);
  root.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  return {
    root,
    // run：0 站立 ~ 1 奔跑；phase：步态相位（弧度）
    pose(run, phase) {
      const s = Math.sin(phase), c = Math.cos(phase);
      legL.a.rotation.x = s * 0.8 * run; legR.a.rotation.x = -s * 0.8 * run;
      legL.b.rotation.x = Math.max(0, -c) * 1.2 * run + 0.05; legR.b.rotation.x = Math.max(0, c) * 1.2 * run + 0.05;
      armL.a.rotation.x = -s * 0.7 * run; armR.a.rotation.x = s * 0.7 * run;
      armL.b.rotation.x = -0.9 * run - 0.1; armR.b.rotation.x = -0.9 * run - 0.1;
      torso.rotation.x = 0.25 * run; hips.position.y = 0.95 + Math.abs(c) * 0.05 * run;
    },
  };
}
