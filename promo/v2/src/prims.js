// 常用线稿图元：盒子（背面剔除＋可选窗格线）、圆柱/球剪影、坐标变换
import * as THREE from 'three';
import { poly, solid, ring, toCam, PAL } from './core.js';

// 由位置＋欧拉角（航向 y、俯仰 x、横滚 z）构造变换，返回把局部坐标映射到世界坐标的函数
export function xform(pos, heading = 0, pitch = 0, roll = 0, scale = 1) {
  const m = new THREE.Matrix4().compose(new THREE.Vector3(...pos), new THREE.Quaternion().setFromEuler(new THREE.Euler(pitch, heading, roll, 'YXZ')), new THREE.Vector3(scale, scale, scale));
  const e = m.elements;
  const f = (p) => [e[0] * p[0] + e[4] * p[1] + e[8] * p[2] + e[12], e[1] * p[0] + e[5] * p[1] + e[9] * p[2] + e[13], e[2] * p[0] + e[6] * p[1] + e[10] * p[2] + e[14]];
  f.m = m; return f;
}
export function compose(f, pos, heading = 0, pitch = 0, roll = 0) { // 在 f 的局部空间里再套一层变换
  const g = xform(pos, heading, pitch, roll); const m = new THREE.Matrix4().multiplyMatrices(f.m, g.m); const e = m.elements;
  const h = (p) => [e[0] * p[0] + e[4] * p[1] + e[8] * p[2] + e[12], e[1] * p[0] + e[5] * p[1] + e[9] * p[2] + e[13], e[2] * p[0] + e[6] * p[1] + e[10] * p[2] + e[14]];
  h.m = m; return h;
}

const FACES = [[0, 1, 2, 3], [5, 4, 7, 6], [4, 0, 3, 7], [1, 5, 6, 2], [3, 2, 6, 7], [4, 5, 1, 0]]; // -z, +z, -x, +x, +y, -y
// 盒子：f 为局部→世界变换；size [w,h,d]，以局部原点为中心（或 base=true 时底面在 y=0）
export function box(f, size, style = {}, opts = {}) {
  const [w, h, d] = size; const y0 = opts.base ? 0 : -h / 2;
  const c = [[-w / 2, y0, -d / 2], [w / 2, y0, -d / 2], [w / 2, y0 + h, -d / 2], [-w / 2, y0 + h, -d / 2], [-w / 2, y0, d / 2], [w / 2, y0, d / 2], [w / 2, y0 + h, d / 2], [-w / 2, y0 + h, d / 2]].map(f);
  const cc = c.map(toCam);
  FACES.forEach((fi, k) => {
    if (opts.skipBottom && k === 5) return;
    // 背面剔除：相机空间里面的法线朝向
    const a = cc[fi[0]], b = cc[fi[1]], q = cc[fi[2]];
    const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2], vx = q[0] - a[0], vy = q[1] - a[1], vz = q[2] - a[2];
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    if (nx * a[0] + ny * a[1] + nz * a[2] <= 0) return; // 面的顶点顺序朝内，这里取反判断朝向相机
    const st = { ...style };
    if (opts.windows && k < 4) st.innerLines = windowLines(c, fi, opts.windows, w, h, d, k);
    if (opts.top && k === 4) Object.assign(st, opts.top);
    poly(fi.map((i) => c[i]), st);
  });
}
function windowLines(c, fi, win, w, h, d, k) {
  const [p0, p1, p2, p3] = fi.map((i) => c[i]); // p0-p1 底边，p3-p2 顶边
  const width = k < 2 ? w : d, floors = Math.max(1, Math.floor(h / win.floor)), bays = Math.max(1, Math.floor(width / win.bay));
  const L = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
  const segs = [];
  for (let i = 1; i < floors; i++) { const t = i / floors; segs.push([L(p0, p3, t), L(p1, p2, t)]); }
  for (let j = 1; j < bays; j++) { const t = j / bays; segs.push([L(p0, p1, t), L(p3, p2, t)]); }
  return segs;
}
// 圆柱剪影（凸包填充＋描边）＋顶面椭圆
export function cylinder(f, r1, r2, h, style = {}, seg = 24, topStyle = null) {
  const pts = [...ring([0, -h / 2, 0], r2, [0, 1, 0], seg), ...ring([0, h / 2, 0], r1, [0, 1, 0], seg)].map(f);
  solid(pts, style);
  if (topStyle) poly(ring([0, h / 2, 0], r1, [0, 1, 0], seg).map(f), { ...topStyle, depthBias: (style.depthBias || 0) - 0.001 });
}
// 半球/球剪影
export function dome(f, r, sy = 1, style = {}, seg = 20, half = true) {
  const pts = [];
  for (let i = 0; i <= 6; i++) { const phi = (half ? i / 6 * Math.PI / 2 : i / 6 * Math.PI - Math.PI / 2); for (let k = 0; k < seg; k++) { const th = k / seg * Math.PI * 2; pts.push(f([Math.cos(th) * Math.cos(phi) * r, Math.sin(phi) * r * sy, Math.sin(th) * Math.cos(phi) * r])); } }
  solid(pts, style);
}
export { PAL };
