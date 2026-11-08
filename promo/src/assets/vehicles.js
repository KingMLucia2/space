// 救援车辆：消防车（红色车身、云梯、卷帘门、警灯）与救护车（白色厢体、橙蓝色带、“急救 120”）。车头朝 +z。
import * as THREE from 'three';
import { M } from '../materials.js';
import { labelTexture } from '../textures.js';
import { rbox } from '../geo.js';

function shutterTex(base = '#a8201a') {
  const c = document.createElement('canvas'); c.width = 256; c.height = 256; const x = c.getContext('2d');
  x.fillStyle = base; x.fillRect(0, 0, 256, 256);
  for (let k = 0; k < 4; k++) { x.fillStyle = '#b9bcc0'; x.fillRect(8 + k * 62, 30, 52, 196); x.fillStyle = 'rgba(60,60,64,0.5)'; for (let j = 0; j < 24; j++) x.fillRect(8 + k * 62, 30 + j * 8.2, 52, 1.5); }
  x.fillStyle = '#e8e0c8'; x.fillRect(0, 232, 256, 10);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

export function createVehicle(kind = 'fire', wheelGeo) {
  const g = new THREE.Group();
  const isFire = kind === 'fire';
  const paint = new THREE.MeshPhysicalMaterial({ color: isFire ? 0xb3241c : 0xeeeeea, roughness: 0.38, clearcoat: 0.8, clearcoatRoughness: 0.2 });
  const len = isFire ? 8.6 : 6.4, w = 2.5;
  const add = (geo, mat, x, y, z) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); g.add(m); return m; };
  // 厢体（侧面贴卷帘门或文字）
  const bodyLen = len * 0.68;
  const side = isFire ? new THREE.MeshPhysicalMaterial({ map: shutterTex(), roughness: 0.45, clearcoat: 0.5 })
    : new THREE.MeshPhysicalMaterial({ map: labelTexture('急救  120', { w: 1024, h: 256, font: 'bold 120px "Noto Sans SC","WenQuanYi Zen Hei",sans-serif', color: '#ff5a0a', bg: '#eeeeea' }), roughness: 0.4, clearcoat: 0.6 });
  const box = rbox(w, 2.5, bodyLen, 0.08, 4);
  add(box, [side, side, paint, paint, paint, paint], 0, 1.95, -len * 0.14);
  // 驾驶室：车窗、风挡
  const cab = add(rbox(w, 2.15, len * 0.27, 0.12, 4), paint, 0, 1.75, len * 0.355);
  add(new THREE.BoxGeometry(w - 0.12, 0.95, 0.04), M.glass, 0, 2.25, len * 0.49 + 0.01);
  for (const s of [-1, 1]) add(new THREE.BoxGeometry(0.04, 0.8, len * 0.17), M.glass, s * (w / 2 + 0.01), 2.25, len * 0.37);
  add(rbox(w + 0.04, 0.32, 0.12, 0.04), M.darkMetal, 0, 0.75, len * 0.5); // 保险杠
  for (const s of [-1, 1]) add(new THREE.BoxGeometry(0.28, 0.18, 0.04), M.ledWhite, s * 0.9, 1.1, len * 0.5 + 0.02); // 大灯
  // 反光条
  const stripe = new THREE.MeshStandardMaterial({ color: isFire ? 0xf2ead2 : 0x1d5bd8, roughness: 0.4, emissive: isFire ? 0x332a10 : 0x000000 });
  add(new THREE.BoxGeometry(w + 0.03, 0.18, len * 0.96), stripe, 0, 1.05, 0);
  if (!isFire) add(new THREE.BoxGeometry(w + 0.035, 0.12, len * 0.96), M.orange, 0, 1.28, 0);
  // 车轮与轮拱
  for (const [wx, wz] of [[1.1, len * 0.33], [-1.1, len * 0.33], [1.1, -len * 0.28], [-1.1, -len * 0.28]].concat(isFire ? [[1.1, -len * 0.4], [-1.1, -len * 0.4]] : [])) {
    const wh = new THREE.Mesh(wheelGeo, M.rubber); wh.scale.set(1.6, 1.6, 1.5); wh.position.set(wx, 0.55, wz); wh.rotation.y = Math.PI / 2; g.add(wh);
    const hub = add(new THREE.CylinderGeometry(0.22, 0.22, 0.05, 28), M.metal, wx + Math.sign(wx) * 0.2, 0.55, wz); hub.rotation.z = Math.PI / 2;
  }
  // 消防车顶上的云梯
  if (isFire) {
    for (const s of [-1, 1]) add(new THREE.BoxGeometry(0.08, 0.1, bodyLen * 0.95), M.metal, s * 0.42, 3.3, -len * 0.12);
    for (let k = 0; k < 14; k++) add(new THREE.BoxGeometry(0.84, 0.04, 0.05), M.metal, 0, 3.3, -len * 0.12 - bodyLen * 0.45 + k * bodyLen * 0.065);
  } else {
    for (const s of [-1, 1]) add(new THREE.BoxGeometry(0.9, 1.1, 0.04), M.glass, s * 0.55, 2.4, -len * 0.14 - bodyLen / 2 - 0.01); // 后门窗
  }
  // 警灯
  const bar = new THREE.Group(); bar.position.set(0, 2.92, len * 0.36); g.add(bar);
  const red = new THREE.MeshStandardMaterial({ color: 0, emissive: 0xff2010, emissiveIntensity: 0 }), blue = new THREE.MeshStandardMaterial({ color: 0, emissive: 0x2050ff, emissiveIntensity: 0 });
  add(rbox(1.9, 0.08, 0.34, 0.03), M.darkMetal, 0, 2.86, len * 0.36);
  const lr = new THREE.Mesh(rbox(0.8, 0.18, 0.3, 0.06), red); lr.position.x = 0.5; bar.add(lr);
  const lb = new THREE.Mesh(rbox(0.8, 0.18, 0.3, 0.06), blue); lb.position.x = -0.5; bar.add(lb);
  g.traverse((o) => { if (o.isMesh) { o.castShadow = o.receiveShadow = true; } });
  return { group: g, red, blue };
}
