// 材质与几何小工具：白色亮面外壳、黑色机械件、碳纤维、金属、橙色点缀、镜头玻璃、发光灯珠；
// span() 把沿 Y 轴的单位高度几何体摆到两点之间（腿、杆件、缆绳都用它）。
import { THREE, COL, mkCanvas } from './engine.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

const std = (o) => new THREE.MeshStandardMaterial(o);
export const M = {
  white: new THREE.MeshPhysicalMaterial({ color: '#f2f0eb', roughness: 0.3, metalness: 0, clearcoat: 0.55, clearcoatRoughness: 0.22 }),
  whiteMatte: std({ color: '#ebe8e2', roughness: 0.9 }),
  shell2: std({ color: '#dcd9d3', roughness: 0.5 }),
  black: std({ color: '#1d1e22', roughness: 0.42, metalness: 0.25 }),
  carbon: std({ color: '#26272b', roughness: 0.32, metalness: 0.45 }),
  dark: std({ color: '#3d4148', roughness: 0.3, metalness: 0.85 }),
  chrome: std({ color: '#e3e6ea', roughness: 0.12, metalness: 1 }),
  orange: std({ color: COL.orange, roughness: 0.36 }),
  red: std({ color: COL.red, roughness: 0.4 }),
  rubber: std({ color: '#141414', roughness: 0.88 }),
  glass: new THREE.MeshPhysicalMaterial({ color: '#07080a', roughness: 0.04, clearcoat: 1, clearcoatRoughness: 0.02 }),
  ledW: new THREE.MeshBasicMaterial({ color: '#ffffff' }),
  ledO: new THREE.MeshBasicMaterial({ color: '#ff7a3c' }),
  ledC: new THREE.MeshBasicMaterial({ color: '#5fd4ff' }),
  ledG: new THREE.MeshBasicMaterial({ color: '#2ee68f' }),
  ledR: new THREE.MeshBasicMaterial({ color: '#ff3b30' }),
};
export const mesh = (geo, mat, shadow = true) => { const m = new THREE.Mesh(geo, mat); m.castShadow = shadow; m.receiveShadow = shadow; return m; };
export const rbox = (w, h, d, r = 0.01, seg = 3) => new RoundedBoxGeometry(w, h, d, seg, Math.min(r, w / 2 - 1e-4, h / 2 - 1e-4, d / 2 - 1e-4));
export const cyl = (rt, rb, h, seg = 24, open = false) => new THREE.CylinderGeometry(rt, rb, h, seg, 1, open);
export const lathe = (pts, seg = 48) => new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(r, y)), seg);
// 单位高度（y∈[-0.5,0.5]）的圆柱，摆在 a→b 之间
const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _d = new THREE.Vector3(), _q = new THREE.Quaternion(), _up = new THREE.Vector3(0, 1, 0);
export function span(m, a, b, sx = 1, sz = sx) {
  _a.set(a[0], a[1], a[2]); _b.set(b[0], b[1], b[2]); _d.subVectors(_b, _a); const L = _d.length();
  m.position.addVectors(_a, _b).multiplyScalar(0.5); if (L > 1e-6) { _q.setFromUnitVectors(_up, _d.multiplyScalar(1 / L)); m.quaternion.copy(_q); }
  m.scale.set(sx, Math.max(L, 1e-5), sz); return m;
}
export const UNIT_CYL = cyl(1, 1, 1, 20);
// 柔光精灵（灯珠光晕、火光）：径向渐变贴图
const glowC = mkCanvas(128, 128); { const g = glowC.getContext('2d'); const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.25, 'rgba(255,255,255,0.55)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, 128, 128); }
export const GLOW_TEX = new THREE.CanvasTexture(glowC); GLOW_TEX.colorSpace = THREE.SRGBColorSpace;
export function glowSprite(color, size = 0.1, opacity = 0.9, additive = true) {
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: GLOW_TEX, color, transparent: true, opacity, depthWrite: false, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending, fog: false }));
  s.scale.set(size, size, 1); s.renderOrder = 5; return s;
}
// 物体沿用第三版的位姿约定：位置＋航向（绕 y）、俯仰（绕 x）、横滚（绕 z），欧拉顺序 YXZ
export function setPose(obj, pos, heading = 0, pitch = 0, roll = 0, scale = 1) { obj.position.set(pos[0], pos[1], pos[2]); obj.rotation.set(pitch, heading, roll, 'YXZ'); obj.scale.setScalar(scale); }
export function shadows(obj, cast = true, recv = true) { obj.traverse((o) => { if (o.isMesh) { o.castShadow = cast; o.receiveShadow = recv; } }); return obj; }
