// 基站：参考箱式无人机机库的造型，放大到能装下结合体。双开舱盖向两侧翻开，内部升降平台，气象杆、天线、状态灯带。
import * as THREE from 'three';
import { M } from '../materials.js';
import { concrete, labelTexture, panelNormal } from '../textures.js';
import { rbox } from '../geo.js';
import { smooth, clamp } from '../util.js';

export const DOCK = { w: 3.8, d: 3.8, h: 1.7, platLow: 0.75, platHigh: 1.72 };

export function createDock() {
  const root = new THREE.Group(); root.name = 'dock';
  const { w, d, h } = DOCK;
  const shellN = panelNormal(512, [[0, 0.25, 1, 0.25], [0, 0.75, 1, 0.75], [0.33, 0, 0.33, 1], [0.66, 0, 0.66, 1]], [[0.05, 0.05], [0.95, 0.05], [0.05, 0.95], [0.95, 0.95], [0.33, 0.5], [0.66, 0.5]], 6);
  shellN.wrapS = shellN.wrapT = THREE.RepeatWrapping;
  const shell = new THREE.MeshPhysicalMaterial({ color: 0xbfc3c7, roughness: 0.42, metalness: 0.08, clearcoat: 0.5, clearcoatRoughness: 0.3, normalMap: shellN, normalScale: new THREE.Vector2(0.7, 0.7) });
  const dark = new THREE.MeshStandardMaterial({ color: 0x26292d, roughness: 0.7, metalness: 0.2 });
  const t = 0.08;
  const wall = (sx, sy, sz, x, y, z, m = shell, r = 0.025) => { const b = new THREE.Mesh(r > 0 ? rbox(sx, sy, sz, r) : new THREE.BoxGeometry(sx, sy, sz), m); b.position.set(x, y, z); root.add(b); return b; };
  // 四面墙（中空）
  wall(w, h, t, 0, h / 2, d / 2 - t / 2); wall(w, h, t, 0, h / 2, -d / 2 + t / 2);
  wall(t, h, d, w / 2 - t / 2, h / 2, 0); wall(t, h, d, -w / 2 + t / 2, h / 2, 0);
  wall(w + 0.06, 0.12, d + 0.06, 0, 0.06, 0, dark); // 底座裙边
  wall(w - 0.2, 0.05, d - 0.2, 0, 0.3, 0, dark);     // 内腔底
  // 通风格栅和标识
  for (const s of [-1, 1]) for (let k = 0; k < 5; k++) wall(0.5, 0.025, 0.012, s * 0.9, 0.5 + k * 0.06, d / 2 + 0.005, dark, 0.004);
  const label = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 0.28), new THREE.MeshBasicMaterial({ map: labelTexture('空地协同基站', { w: 512, h: 128, font: 'bold 64px "Noto Sans SC","WenQuanYi Zen Hei",sans-serif', color: '#3a3f45' }), transparent: true }));
  label.position.set(0, 1.12, d / 2 + 0.006); root.add(label);
  const stripeMat = M.orange;
  wall(w + 0.02, 0.06, 0.02, 0, 0.92, d / 2 + 0.01, stripeMat); wall(w + 0.02, 0.06, 0.02, 0, 0.92, -d / 2 - 0.01, stripeMat);
  // 状态灯带
  const lightMat = M.ledBlue.clone(); lightMat.emissiveIntensity = 0;
  for (const s of [-1, 1]) { const strip = wall(w * 0.8, 0.025, 0.02, 0, h - 0.08, s * (d / 2 + 0.012), lightMat); }
  // 升降平台
  const plat = new THREE.Group(); root.add(plat);
  const deck = new THREE.Mesh(rbox(w - 0.3, 0.08, d - 0.3, 0.02), new THREE.MeshStandardMaterial({ color: 0x3a3e44, roughness: 0.6, metalness: 0.3 })); plat.add(deck);
  const hTex = labelTexture('H', { w: 256, h: 256, font: 'bold 200px Arial,sans-serif', color: '#e8e8e2' });
  const hMark = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 1.4), new THREE.MeshStandardMaterial({ map: hTex, transparent: true, roughness: 0.6 })); hMark.rotation.x = -Math.PI / 2; hMark.position.y = 0.041; plat.add(hMark);
  const ringTex = (() => { const c = document.createElement('canvas'); c.width = c.height = 512; const x = c.getContext('2d'); x.strokeStyle = '#e8b830'; x.lineWidth = 18; x.beginPath(); x.arc(256, 256, 220, 0, Math.PI * 2); x.stroke(); const tt = new THREE.CanvasTexture(c); tt.colorSpace = THREE.SRGBColorSpace; return tt; })();
  const ring = new THREE.Mesh(new THREE.PlaneGeometry(3.1, 3.1), new THREE.MeshStandardMaterial({ map: ringTex, transparent: true, roughness: 0.6 })); ring.rotation.x = -Math.PI / 2; ring.position.y = 0.042; plat.add(ring);
  const platLights = [];
  for (const [x, z] of [[-1.6, -1.6], [1.6, -1.6], [-1.6, 1.6], [1.6, 1.6]]) { const l = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.02, 0.12), lightMat); l.position.set(x, 0.05, z); plat.add(l); platLights.push(l); }
  // 两扇舱盖：铰链在左右上缘
  const lids = [];
  for (const s of [-1, 1]) {
    const pivot = new THREE.Group(); pivot.position.set(s * w / 2, h, 0); root.add(pivot);
    const lid = new THREE.Mesh(rbox(w / 2, 0.12, d + 0.04, 0.035), shell); lid.position.set(-s * w / 4, 0.06, 0); pivot.add(lid);
    const ridge = new THREE.Mesh(rbox(w / 2 - 0.2, 0.05, 0.3, 0.02), shell); ridge.position.set(-s * w / 4, 0.14, 0); pivot.add(ridge);
    const lstripe = new THREE.Mesh(rbox(0.06, 0.125, d + 0.05, 0.02), stripeMat); lstripe.position.set(-s * 0.15, 0.06, 0); pivot.add(lstripe);
    lids.push({ pivot, s });
  }
  // 气象杆：风速计、天线、警示灯
  const mast = new THREE.Group(); mast.position.set(w / 2 + 0.35, 0, -d / 2 + 0.3); root.add(mast);
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.05, 2.6, 24), M.metal); pole.position.y = 1.3; mast.add(pole);
  const anemo = new THREE.Group(); anemo.position.y = 2.65; mast.add(anemo);
  for (let k = 0; k < 3; k++) { const a = k * Math.PI * 2 / 3; const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.22, 6), M.metal); arm.rotation.z = Math.PI / 2; arm.rotation.y = a; arm.position.set(Math.cos(a) * 0.11, 0, -Math.sin(a) * 0.11); anemo.add(arm); const cup = new THREE.Mesh(new THREE.SphereGeometry(0.04, 10, 8, 0, Math.PI), M.offwhite); cup.position.set(Math.cos(a) * 0.22, 0, -Math.sin(a) * 0.22); cup.rotation.y = a; anemo.add(cup); }
  const antenna = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.9, 8), M.offwhite); antenna.position.set(0.12, 2.3, 0); mast.add(antenna);
  const beaconMat = M.ledBlue.clone(); beaconMat.emissiveIntensity = 0;
  const beacon = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.12, 16), beaconMat); beacon.position.set(-w - 0.4, h + 0.1, d - 0.3); mast.add(beacon);
  // 混凝土基座
  const c = concrete(41, 256, [128, 125, 118], 0.25, 2, 0.25); c.map.repeat.set(2, 2); c.normalMap.repeat.set(2, 2);
  const pad = new THREE.Mesh(rbox(w + 2.2, 0.3, d + 2.2, 0.05), new THREE.MeshStandardMaterial({ map: c.map, normalMap: c.normalMap, roughness: 0.9 })); pad.position.y = -0.14; root.add(pad);
  root.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  label.castShadow = false; hMark.castShadow = false; ring.castShadow = false;

  const api = {
    root, plat, lids, lightMat, beaconMat, anemo,
    // open: 0 关闭 ~ 1 全开；lift: 0 低位 ~ 1 升到顶面
    set(open, lift, t = 0, lights = 1) {
      const a = smooth(open) * 2.6;
      for (const L of lids) L.pivot.rotation.z = -L.s * a;
      plat.position.y = DOCK.platLow + (DOCK.platHigh - DOCK.platLow) * smooth(lift);
      lightMat.emissiveIntensity = lights * (3 + 2 * Math.sin(t * 4));
      beaconMat.emissiveIntensity = lights * (Math.sin(t * 6) > 0.3 ? 9 : 1);
      anemo.rotation.y = t * 3.1;
    },
    topY() { return plat.position.y + 0.04; },
  };
  api.set(0, 0, 0, 0);
  return api;
}
