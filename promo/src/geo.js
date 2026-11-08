// 高面数几何体工具：圆角盒、倒角六棱柱、带圆角的车削体、带扭转和收窄的桨叶
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

export const rbox = (w, h, d, r = 0.01, seg = 3) => new RoundedBoxGeometry(w, h, d, seg, Math.min(r, w / 2 - 1e-4, h / 2 - 1e-4, d / 2 - 1e-4));

// 倒角六棱柱：尖角朝 ±x、平边朝 ±z，中心在原点，高度沿 y
export function bevelHex(R, h, bevel = 0.012) {
  const s = new THREE.Shape();
  for (let k = 0; k < 6; k++) { const a = k * Math.PI / 3; const x = R * Math.cos(a), y = R * Math.sin(a); k ? s.lineTo(x, y) : s.moveTo(x, y); }
  s.closePath();
  const g = new THREE.ExtrudeGeometry(s, { depth: Math.max(1e-3, h - 2 * bevel), bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 4, curveSegments: 1 });
  g.rotateX(-Math.PI / 2); g.translate(0, -h / 2 + bevel, 0); g.computeVertexNormals();
  return g;
}

// 车削体：profile 为 [[r, y], ...]，自动在拐角处加圆角
export function filletLathe(points, fillet = 0.01, seg = 72, arcSeg = 4) {
  const out = [];
  for (let i = 0; i < points.length; i++) {
    const p = new THREE.Vector2(...points[i]);
    if (i === 0 || i === points.length - 1 || fillet <= 0) { out.push(p); continue; }
    const a = new THREE.Vector2(...points[i - 1]), b = new THREE.Vector2(...points[i + 1]);
    const da = a.clone().sub(p), db = b.clone().sub(p); const la = da.length(), lb = db.length();
    const f = Math.min(fillet, la / 2, lb / 2); da.normalize(); db.normalize();
    const p0 = p.clone().addScaledVector(da, f), p1 = p.clone().addScaledVector(db, f);
    for (let k = 0; k <= arcSeg; k++) { const t = k / arcSeg; const q = p0.clone().multiplyScalar((1 - t) * (1 - t)).addScaledVector(p, 2 * t * (1 - t)).addScaledVector(p1, t * t); out.push(q); }
  }
  return new THREE.LatheGeometry(out, seg);
}

// 桨叶：沿 +x 展开，r0~r1 为根部到叶尖半径；弦长先增后减，扭转角从根部到叶尖线性减小
export function bladeGeo({ r0 = 0.03, r1 = 0.37, chordRoot = 0.04, chordMax = 0.062, chordTip = 0.022, thick = 0.008, twistRoot = 0.42, twistTip = 0.1, sections = 18, ring = 14 } = {}) {
  const pos = [], idx = [];
  for (let i = 0; i <= sections; i++) {
    const s = i / sections, x = r0 + (r1 - r0) * s;
    const c = s < 0.3 ? THREE.MathUtils.lerp(chordRoot, chordMax, s / 0.3) : THREE.MathUtils.lerp(chordMax, chordTip, Math.pow((s - 0.3) / 0.7, 1.3));
    const t = thick * (1 - 0.55 * s), tw = THREE.MathUtils.lerp(twistRoot, twistTip, s);
    const cs = Math.cos(tw), sn = Math.sin(tw);
    for (let k = 0; k < ring; k++) {
      const a = (k / ring) * Math.PI * 2;
      // 翼型：前缘圆、后缘尖
      const zc = Math.cos(a) * c / 2, yc = Math.sin(a) * t / 2 * (1 - 0.6 * Math.max(0, -Math.cos(a))) + t * 0.25 * (1 - Math.cos(a) ** 2);
      pos.push(x, yc * cs - zc * sn, yc * sn + zc * cs);
    }
  }
  for (let i = 0; i < sections; i++) for (let k = 0; k < ring; k++) {
    const a = i * ring + k, b = i * ring + (k + 1) % ring, c = a + ring, d = b + ring;
    idx.push(a, c, b, b, c, d);
  }
  const tip = pos.length / 3; pos.push(r1 + 0.004, 0, 0);
  for (let k = 0; k < ring; k++) idx.push(sections * ring + k, tip, sections * ring + (k + 1) % ring);
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals();
  return g;
}
