// 线稿绘制核心：自己做三维投影（近平面裁剪、按深度排序的“画家算法”），用 Canvas 2D 画填充与描边，
// 另有半分辨率发光层、界面层，最后叠暗角与颗粒。three.js 只当数学库用。
import * as THREE from 'three';
import { clamp } from './util.js';

export const W = 1920, H = 1080;
export const PAL = {
  bg0: '#02070e', bg1: '#0a2034', line: '#6fdcff', dim: '#3592c8', faint: '#1d4f73', white: '#eaf6ff',
  orange: '#ff7a2e', red: '#ff3b30', green: '#2ee6a0', fill: 'rgba(3,10,18,0.94)', blue: '#3aa8ff', amber: '#ffb347',
};
const mk = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };
export const out = mk(W, H); document.body.appendChild(out);
const o = out.getContext('2d');
const layerC = mk(W, H), L = layerC.getContext('2d');
const glowC = mk(W / 2, H / 2), G = glowC.getContext('2d');
const gb1 = mk(W / 2, H / 2), GB1 = gb1.getContext('2d'), gb2 = mk(W / 2, H / 2), GB2 = gb2.getContext('2d');
const hudC = mk(W, H); export const hud = hudC.getContext('2d');
const tmpC = mk(W, H), T = tmpC.getContext('2d');
const grainC = mk(256, 256); { const g = grainC.getContext('2d'), d = g.createImageData(256, 256); let s = 12345; const r = () => ((s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff); for (let i = 0; i < d.data.length; i += 4) { const v = r() * 255; d.data[i] = d.data[i + 1] = d.data[i + 2] = v; d.data[i + 3] = 255; } g.putImageData(d, 0, 0); }

// —— 相机 ——
export const cam = new THREE.PerspectiveCamera(40, W / H, 0.05, 9000);
let E = cam.matrixWorldInverse.elements, F = 1, NEAR = 0.05;
export const FOG = { start: 60, end: 900 };
function camDone(fov) {
  cam.fov = fov; cam.updateMatrixWorld(); cam.updateProjectionMatrix();
  E = cam.matrixWorldInverse.elements; F = (H / 2) / Math.tan(THREE.MathUtils.degToRad(fov / 2)); NEAR = cam.near;
}
// 位置＋注视点（注意：必须在任何绘制之前调用，投影是即时计算的）
export function setCam(pos, target, fov = 40, up = [0, 1, 0]) {
  cam.position.set(pos[0], pos[1], pos[2]); cam.up.set(up[0], up[1], up[2]); cam.lookAt(target[0], target[1], target[2]); camDone(fov);
}
// 位置＋航向/俯仰/横滚（航向 0 朝 -z，俯仰 -90° 为正下方且画面上方朝 -z），用于从平视连续转到俯视而不翻转
export function setCamYPR(pos, yaw, pitch, roll = 0, fov = 40) {
  cam.position.set(pos[0], pos[1], pos[2]); cam.quaternion.setFromEuler(new THREE.Euler(pitch, yaw, roll, 'YXZ')); camDone(fov);
}
// 屏幕空间的仿射变换（投影之后再缩放平移），用来把整幅画面画进指挥大屏的可见区域
let VS = 1, VX = 0, VY = 0, WS = 1;
export function setView(s = 1, x0 = 0, y0 = 0, ws = 1) { VS = s; VX = x0; VY = y0; WS = ws; }
export const toCam = (p) => [E[0] * p[0] + E[4] * p[1] + E[8] * p[2] + E[12], E[1] * p[0] + E[5] * p[1] + E[9] * p[2] + E[13], E[2] * p[0] + E[6] * p[1] + E[10] * p[2] + E[14]];
const scr = (c) => [VX + VS * (W / 2 + c[0] / -c[2] * F), VY + VS * (H / 2 - c[1] / -c[2] * F)];
export function project(p) { const c = toCam(p); if (c[2] > -NEAR) return null; const s = scr(c); return { x: s[0], y: s[1], d: -c[2] }; }
export const pxPerMeter = (d) => F * VS / d;

// 逐项“显现”：fn(世界坐标中心) → { p: 描边进度 0~1, g: 额外发光, a: 透明度 }，用于开场线条生长
let REVEAL = null;
export function setReveal(fn) { REVEAL = fn; }

// —— 显示列表 ——
let DL = [];
function clipPoly(cs, closed) {
  const res = []; const n = cs.length;
  const inside = (c) => c[2] <= -NEAR;
  const lim = closed ? n : n - 1;
  for (let i = 0; i < lim; i++) {
    const a = cs[i], b = cs[(i + 1) % n], ia = inside(a), ib = inside(b);
    if (ia) res.push(a);
    if (ia !== ib) { const t = (-NEAR - a[2]) / (b[2] - a[2]); res.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, -NEAR]); }
  }
  if (!closed && inside(cs[n - 1])) res.push(cs[n - 1]);
  return res;
}
function rv(pts) {
  if (!REVEAL) return null; let x = 0, y = 0, z = 0; for (const p of pts) { x += p[0]; y += p[1]; z += p[2]; } const n = pts.length;
  return REVEAL(x / n, y / n, z / n);
}
// style: { stroke, width, alpha, fill, fillAlpha, glow, glowColor, glowWidth, dash, progress, fade(=true), cap, join, depthBias, innerLines... }
export function poly(pts, style = {}, closed = true) {
  const cs = pts.map(toCam);
  const c = clipPoly(cs, closed); if (c.length < 2) return;
  let d = 0; for (const p of cs) d += -p[2]; d /= cs.length;
  const s = c.map(scr);
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity; for (const q of s) { if (q[0] < x0) x0 = q[0]; if (q[0] > x1) x1 = q[0]; if (q[1] < y0) y0 = q[1]; if (q[1] > y1) y1 = q[1]; }
  if (x1 < -50 || x0 > W + 50 || y1 < -50 || y0 > H + 50) return;
  const item = { d: d + (style.depthBias || 0), z: d, s, style, closed, r: rv(pts) };
  if (style.innerLines) item.inner = projSegs(style.innerLines);
  DL.push(item);
}
function projSegs(segs) { // segs: [[a,b],...] → 屏幕坐标扁平数组（逐段裁剪）
  const outA = [];
  for (const [a, b] of segs) {
    let ca = toCam(a), cb = toCam(b); const ia = ca[2] <= -NEAR, ib = cb[2] <= -NEAR; if (!ia && !ib) continue;
    if (!ia || !ib) { const t = (-NEAR - ca[2]) / (cb[2] - ca[2]); const m = [ca[0] + (cb[0] - ca[0]) * t, ca[1] + (cb[1] - ca[1]) * t, -NEAR]; if (!ia) ca = m; else cb = m; }
    const sa = scr(ca), sb = scr(cb); outA.push(sa[0], sa[1], sb[0], sb[1]);
  }
  return outA;
}
// 大量线段合成一项（地形等高线、道路标线等）：flat = [x1,y1,z1,x2,y2,z2,...]
export function segments(flat, style = {}) {
  const segs = []; let dsum = 0, n = 0;
  for (let i = 0; i < flat.length; i += 6) {
    let ca = toCam([flat[i], flat[i + 1], flat[i + 2]]), cb = toCam([flat[i + 3], flat[i + 4], flat[i + 5]]);
    const ia = ca[2] <= -NEAR, ib = cb[2] <= -NEAR; if (!ia && !ib) continue;
    if (!ia || !ib) { const t = (-NEAR - ca[2]) / (cb[2] - ca[2]); const m = [ca[0] + (cb[0] - ca[0]) * t, ca[1] + (cb[1] - ca[1]) * t, -NEAR]; if (!ia) ca = m; else cb = m; }
    const sa = scr(ca), sb = scr(cb);
    if ((sa[0] < 0 && sb[0] < 0) || (sa[0] > W && sb[0] > W) || (sa[1] < 0 && sb[1] < 0) || (sa[1] > H && sb[1] > H)) continue;
    const dd = (-ca[2] - cb[2]) / 2; segs.push(sa[0], sa[1], sb[0], sb[1], dd); dsum += dd; n++;
  }
  if (n) DL.push({ d: (style.depthBias ?? 0) + dsum / n, z: dsum / n, segs, style });
}
export function line(a, b, style = {}) { poly([a, b], style, false); }
export function polyline(pts, style = {}) { poly(pts, style, false); }
// 点云：pts 为扁平数组 [x,y,z,...]；按点做雾化
export function points(flat, style = {}) {
  const list = []; let dsum = 0, n = 0;
  for (let i = 0; i < flat.length; i += 3) {
    const c = toCam([flat[i], flat[i + 1], flat[i + 2]]); if (c[2] > -NEAR) continue;
    const s = scr(c); if (s[0] < -20 || s[0] > W + 20 || s[1] < -20 || s[1] > H + 20) continue;
    list.push(s[0], s[1], -c[2]); dsum += -c[2]; n++;
  }
  if (n) DL.push({ d: dsum / n + (style.depthBias || 0), z: dsum / n, pts: list, style });
}
// 三维圆：center，半径，法线（默认竖直向上），返回采样点
export function ring(center, r, normal = [0, 1, 0], seg = 48) {
  const n = new THREE.Vector3(...normal).normalize(); const u = new THREE.Vector3(1, 0, 0); if (Math.abs(n.x) > 0.9) u.set(0, 0, 1);
  const a = new THREE.Vector3().crossVectors(n, u).normalize(), b = new THREE.Vector3().crossVectors(n, a);
  const out = []; for (let k = 0; k < seg; k++) { const t = k / seg * Math.PI * 2; out.push([center[0] + (a.x * Math.cos(t) + b.x * Math.sin(t)) * r, center[1] + (a.y * Math.cos(t) + b.y * Math.sin(t)) * r, center[2] + (a.z * Math.cos(t) + b.z * Math.sin(t)) * r]); }
  return out;
}
// 屏幕空间凸包（用于圆柱、球等实体的剪影填充）
export function hullScreen(pts3) {
  const s = []; for (const p of pts3) { const c = toCam(p); if (c[2] > -NEAR) return null; s.push(scr(c)); }
  s.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cross = (o2, a, b) => (a[0] - o2[0]) * (b[1] - o2[1]) - (a[1] - o2[1]) * (b[0] - o2[0]);
  const lo = [], up = [];
  for (const p of s) { while (lo.length >= 2 && cross(lo[lo.length - 2], lo[lo.length - 1], p) <= 0) lo.pop(); lo.push(p); }
  for (let i = s.length - 1; i >= 0; i--) { const p = s[i]; while (up.length >= 2 && cross(up[up.length - 2], up[up.length - 1], p) <= 0) up.pop(); up.push(p); }
  up.pop(); lo.pop(); return lo.concat(up);
}
// 实体剪影：一组三维点的凸包，填充＋描边
export function solid(pts3, style = {}) {
  const h = hullScreen(pts3); if (!h || h.length < 3) return;
  let d = 0; for (const p of pts3) d += -toCam(p)[2]; d /= pts3.length;
  DL.push({ d: d + (style.depthBias || 0), z: d, s: h, style, closed: true, r: rv(pts3) });
}
// 管状线：按距离换算像素宽度（radius 为米），外描边＋内填色，模拟有体积的杆件；给 radius2 时画成两端粗细不同的锥管
export function tube(a, b, style = {}) {
  if (style.radius2 === undefined) { poly([a, b], { ...style, tube: true }, false); return; }
  let ca = toCam(a), cb = toCam(b); const ia = ca[2] <= -NEAR, ib = cb[2] <= -NEAR; if (!ia && !ib) return;
  if (!ia || !ib) { const t = (-NEAR - ca[2]) / (cb[2] - ca[2]); const m = [ca[0] + (cb[0] - ca[0]) * t, ca[1] + (cb[1] - ca[1]) * t, -NEAR]; if (!ia) ca = m; else cb = m; }
  const da = -ca[2], db = -cb[2];
  DL.push({ d: (da + db) / 2 + (style.depthBias || 0), z: (da + db) / 2, taper: [scr(ca), scr(cb), 2 * style.radius * F * VS / da, 2 * style.radius2 * F * VS / db], style });
}
// 直接在屏幕坐标加一项（用于特殊图形），fn(L, G) 里 L 为全分辨率层，G 为半分辨率发光层
export function custom(d, fn) { DL.push({ d, z: 0, fn }); }

function fogK(d) { return 1 - clamp((d - FOG.start) / (FOG.end - FOG.start)); }
function strokePath(ctx, s, closed, scale = 1) {
  ctx.beginPath(); ctx.moveTo(s[0][0] * scale, s[0][1] * scale);
  for (let i = 1; i < s.length; i++) ctx.lineTo(s[i][0] * scale, s[i][1] * scale);
  if (closed) ctx.closePath();
}
function pathLen(s, closed) { let l = 0; for (let i = 1; i < s.length; i++) l += Math.hypot(s[i][0] - s[i - 1][0], s[i][1] - s[i - 1][1]); if (closed) l += Math.hypot(s[0][0] - s[s.length - 1][0], s[0][1] - s[s.length - 1][1]); return l; }
function capsule(ctx, a, b, wa, wb, scale = 1) { // 两端半径不同的胶囊形
  const ax = a[0] * scale, ay = a[1] * scale, bx = b[0] * scale, by = b[1] * scale; const ra = wa / 2 * scale, rb = wb / 2 * scale;
  const dx = bx - ax, dy = by - ay, l = Math.hypot(dx, dy) || 1e-6; const nx = -dy / l, ny = dx / l; const ang = Math.atan2(ny, nx);
  ctx.beginPath(); ctx.moveTo(ax + nx * ra, ay + ny * ra); ctx.lineTo(bx + nx * rb, by + ny * rb);
  ctx.arc(bx, by, rb, ang, ang - Math.PI, true); ctx.lineTo(ax - nx * ra, ay - ny * ra); ctx.arc(ax, ay, ra, ang + Math.PI, ang, true); ctx.closePath();
}

export function flush() {
  DL.sort((a, b) => b.d - a.d);
  L.clearRect(0, 0, W, H); G.clearRect(0, 0, W / 2, H / 2);
  G.globalCompositeOperation = 'lighter';
  for (const it of DL) {
    if (it.fn) { L.save(); G.save(); it.fn(L, G); L.restore(); G.restore(); G.globalCompositeOperation = 'lighter'; continue; }
    const st = it.style; const k = st.fade === false ? 1 : fogK(it.z);
    const R = it.r; const ra = R ? (R.a ?? 1) : 1;
    const a = (st.alpha ?? 1) * k * ra;
    if (it.pts) { // 点云
      L.fillStyle = st.color || PAL.line; const sz = (st.size || 1.6) * WS; const p = it.pts;
      for (let i = 0; i < p.length; i += 3) { const ak = st.fade === false ? 1 : fogK(p[i + 2]); if (ak <= 0.01) continue; L.globalAlpha = (st.alpha ?? 1) * ak; const z = st.sizeByDepth ? clamp(sz * 40 / p[i + 2], 0.8, sz * 2.5) : sz; L.fillRect(p[i] - z / 2, p[i + 1] - z / 2, z, z); }
      L.globalAlpha = 1;
      if (st.glow) { G.fillStyle = st.glowColor || st.color; const gz = Math.max(2, sz); for (let i = 0; i < p.length; i += 3) { G.globalAlpha = Math.min(1, st.glow * (st.alpha ?? 1) * (st.fade === false ? 1 : fogK(p[i + 2]))); G.fillRect(p[i] / 2 - gz / 2, p[i + 1] / 2 - gz / 2, gz, gz); } G.globalAlpha = 1; }
      continue;
    }
    if (it.segs) {
      const p = it.segs; L.strokeStyle = st.stroke || PAL.dim; L.lineWidth = (st.width || 1) * WS; L.lineCap = 'round'; L.setLineDash([]);
      // 按雾化分 4 档批量描边
      for (let band = 0; band < 4; band++) {
        L.beginPath(); let any = false;
        for (let i = 0; i < p.length; i += 5) { const kk = st.fade === false ? 1 : fogK(p[i + 4]); const b = Math.min(3, Math.floor(kk * 4)); if (b !== band || kk <= 0.02) continue; L.moveTo(p[i], p[i + 1]); L.lineTo(p[i + 2], p[i + 3]); any = true; }
        if (any) { L.globalAlpha = (st.alpha ?? 1) * (band + 0.5) / 4; L.stroke(); }
      }
      L.globalAlpha = 1;
      if (st.glow) { G.beginPath(); for (let i = 0; i < p.length; i += 5) { if (st.fade !== false && fogK(p[i + 4]) < 0.3) continue; G.moveTo(p[i] / 2, p[i + 1] / 2); G.lineTo(p[i + 2] / 2, p[i + 3] / 2); } G.globalAlpha = st.glow; G.strokeStyle = st.glowColor || st.stroke; G.lineWidth = Math.max(0.5, WS); G.stroke(); G.globalAlpha = 1; }
      continue;
    }
    if (a <= 0.003 && !st.fill) continue;
    if (it.taper) {
      const [sa, sb, wa0, wb0] = it.taper; const e = (st.edge ?? 1.6) * WS; const wa = Math.max(st.minPx || 1.2, wa0), wb = Math.max(st.minPx || 1.2, wb0);
      L.globalAlpha = a; capsule(L, sa, sb, wa + e, wb + e); L.fillStyle = st.outer || PAL.white; L.fill();
      if (wa > e * 1.2 || wb > e * 1.2) { capsule(L, sa, sb, Math.max(0.5, wa - e * 0.6), Math.max(0.5, wb - e * 0.6)); L.fillStyle = st.inner || PAL.fill; L.fill(); }
      L.globalAlpha = 1;
      if (st.glow) { capsule(G, sa, sb, wa + 3, wb + 3, 0.5); G.globalAlpha = Math.min(1, st.glow * a); G.fillStyle = st.glowColor || st.outer || PAL.white; G.fill(); G.globalAlpha = 1; }
      continue;
    }
    const s = it.s;
    if (st.tube) {
      const wpx = Math.max(st.minPx || 1.4, 2 * (st.radius || 0.02) * F * VS / it.z); const e = (st.edge ?? 2.2) * WS;
      strokePath(L, s, false); L.lineCap = 'round'; L.globalAlpha = a; L.setLineDash([]);
      L.strokeStyle = st.outer || PAL.white; L.lineWidth = wpx + e; L.stroke();
      if (wpx > e * 0.5) { L.strokeStyle = st.inner || PAL.fill; L.lineWidth = Math.max(0.6, wpx - e * 0.2); L.stroke(); }
      L.globalAlpha = 1;
      if (st.glow) { strokePath(G, s, false, 0.5); G.globalAlpha = Math.min(1, st.glow * a); G.strokeStyle = st.glowColor || st.outer || PAL.white; G.lineWidth = (wpx + 3) * 0.5; G.stroke(); G.globalAlpha = 1; }
      continue;
    }
    if (st.fill && it.closed) { strokePath(L, s, true); L.globalAlpha = (st.fillAlpha ?? 1) * ra; L.fillStyle = st.fill; L.fill(); L.globalAlpha = 1; }
    const prog = R && R.p !== undefined ? Math.min(R.p, st.progress ?? 1) : st.progress;
    if (it.inner && it.inner.length && (prog === undefined || prog >= 1)) { const p = it.inner; L.beginPath(); for (let i = 0; i < p.length; i += 4) { L.moveTo(p[i], p[i + 1]); L.lineTo(p[i + 2], p[i + 3]); } L.globalAlpha = (st.innerAlpha ?? 0.3) * k * ra; L.strokeStyle = st.innerColor || st.stroke || PAL.dim; L.lineWidth = (st.innerWidth || 0.8) * WS; L.setLineDash([]); L.stroke(); L.globalAlpha = 1; }
    if (st.stroke && a > 0.003 && (prog === undefined || prog > 0)) {
      strokePath(L, s, it.closed);
      L.globalAlpha = a; L.strokeStyle = st.stroke; L.lineWidth = (st.width || 1.2) * WS; L.lineCap = st.cap || 'round'; L.lineJoin = st.join || 'round';
      let len = 0;
      if (prog !== undefined && prog < 1) { len = pathLen(s, it.closed); L.setLineDash([len * Math.max(0, prog), len + 1]); }
      else if (st.dash) L.setLineDash(st.dash.map((x) => x * WS)); else L.setLineDash([]);
      L.stroke(); L.setLineDash([]); L.globalAlpha = 1;
      const gl = (st.glow || 0) + (R && R.g ? R.g : 0);
      if (gl > 0) {
        strokePath(G, s, it.closed, 0.5); G.globalAlpha = Math.min(1, gl * a); G.strokeStyle = st.glowColor || st.stroke; G.lineWidth = Math.max(0.5, (st.glowWidth || (st.width || 1.2) * 2) * 0.5 * WS); G.lineCap = 'round';
        if (prog !== undefined && prog < 1) { G.setLineDash([len * 0.5 * Math.max(0, prog), len * 0.5 + 1]); }
        G.stroke(); G.setLineDash([]); G.globalAlpha = 1;
      }
    }
  }
  DL = [];
}

// —— 合成：背景、场景、发光、界面、暗角、颗粒、淡入淡出 ——
const POST0 = { vignette: 0.55, grain: 0.06, fade: 0, fadeColor: '#000', flash: 0, bg: true, glow: 1, bgTint: null, zoom: 0, zoomX: 0.5, zoomY: 0.5, hud: true };
export const POST = { ...POST0 };
function drawGlow(ctx, amt) {
  GB1.clearRect(0, 0, W / 2, H / 2); GB1.filter = 'blur(3px)'; GB1.drawImage(glowC, 0, 0); GB1.filter = 'none';
  GB2.clearRect(0, 0, W / 2, H / 2); GB2.filter = 'blur(12px)'; GB2.drawImage(glowC, 0, 0); GB2.filter = 'none';
  ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = amt; ctx.drawImage(gb1, 0, 0, W, H); ctx.globalAlpha = 0.8 * amt; ctx.drawImage(gb2, 0, 0, W, H);
  ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
}
export function composite(t, target = o, opts = {}) {
  const o2 = target; const P = { ...POST, ...opts };
  o2.globalCompositeOperation = 'source-over'; o2.globalAlpha = 1; o2.filter = 'none'; o2.setTransform(1, 0, 0, 1, 0, 0);
  if (P.bg) { const g = o2.createRadialGradient(W * 0.5, H * 0.42, 50, W * 0.5, H * 0.5, W * 0.75); g.addColorStop(0, P.bgTint || PAL.bg1); g.addColorStop(1, PAL.bg0); o2.fillStyle = g; o2.fillRect(0, 0, W, H); }
  else o2.clearRect(0, 0, W, H);
  o2.drawImage(layerC, 0, 0);
  if (P.glow > 0) drawGlow(o2, P.glow);
  if (P.zoom > 0) { // 径向变焦模糊（GTA 式切换）
    T.clearRect(0, 0, W, H); T.drawImage(target.canvas, 0, 0);
    const cx = P.zoomX * W, cy = P.zoomY * H; const n = 7;
    for (let i = 1; i <= n; i++) { const s = 1 + P.zoom * 0.12 * i / n; o2.globalAlpha = 0.5 / (i + 0.6); o2.drawImage(tmpC, cx - cx * s, cy - cy * s, W * s, H * s); }
    o2.globalAlpha = 1;
  }
  if (P.fade > 0) { o2.globalAlpha = P.fade; o2.fillStyle = P.fadeColor; o2.fillRect(0, 0, W, H); o2.globalAlpha = 1; }
  if (P.hud !== false) o2.drawImage(hudC, 0, 0);
  if (P.flash > 0) { o2.globalAlpha = P.flash; o2.fillStyle = '#fff'; o2.fillRect(0, 0, W, H); o2.globalAlpha = 1; }
  if (P.vignette > 0) { const g = o2.createRadialGradient(W / 2, H / 2, H * 0.35, W / 2, H / 2, H * 1.05); g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, `rgba(0,0,0,${P.vignette})`); o2.fillStyle = g; o2.fillRect(0, 0, W, H); }
  if (P.grain > 0) { o2.globalAlpha = P.grain; o2.globalCompositeOperation = 'overlay'; const ox = Math.floor((t * 977) % 256), oy = Math.floor((t * 613) % 256); o2.fillStyle = o2.createPattern(grainC, 'repeat'); o2.save(); o2.translate(-ox, -oy); o2.fillRect(ox, oy, W, H); o2.restore(); o2.globalCompositeOperation = 'source-over'; o2.globalAlpha = 1; }
}
// 离屏渲染一遍（例如大屏上的态势图）：draw() 里自行设相机、视口变换并绘制；结果（含发光）画进 target，透明背景
export function renderPass(draw, target) {
  const keepDL = DL; DL = [];
  draw();
  flush();
  const c = target; c.globalCompositeOperation = 'source-over'; c.globalAlpha = 1; c.setTransform(1, 0, 0, 1, 0, 0); c.clearRect(0, 0, W, H);
  c.drawImage(layerC, 0, 0); drawGlow(c, POST.glow);
  DL = keepDL; setView(1, 0, 0, 1); setReveal(null);
}
export const mkCanvas = mk;
export const outCtx = o;
export function resetFrame() {
  hud.setTransform(1, 0, 0, 1, 0, 0); hud.clearRect(0, 0, W, H); hud.globalAlpha = 1; hud.globalCompositeOperation = 'source-over';
  Object.assign(POST, POST0);
  FOG.start = 60; FOG.end = 900; DL = []; setView(1, 0, 0, 1); setReveal(null); cam.near = 0.05;
}
