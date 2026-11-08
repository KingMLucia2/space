// 线稿附加模型：救援直升机、人物（救援队员 / 指挥员）、瓦砾下的被困者热成像点云、瓦砾缝隙与手机
import { poly, polyline, points, ring, solid, tube, line, custom, project, PAL } from '../core.js';
import { xform, compose, box, cylinder, dome } from '../prims.js';
import { clamp, lerp, smooth, mulberry32 } from '../util.js';

const W1 = { fill: PAL.fill, stroke: PAL.white, width: 1.5, alpha: 1 };

// —— 救援直升机：机头朝 +z，长约 12 米 ——
// 机身用一串横截面（椭圆环）放样：剪影用凸包填充，再画纵向轮廓线与截面环，带一点“结构图”味道
const FUS = [[-3.2, 0, 0.25], [-3.0, 0.55, 0.3], [-2.4, 0.95, 0.35], [-1.2, 1.15, 0.38], [0.3, 1.2, 0.4], [1.6, 1.1, 0.35], [2.6, 0.85, 0.25], [3.25, 0.4, 0.05], [3.4, 0.05, 0]]; // [z, 半径, 中心上移]
export function drawHeli(s) {
  const f = xform(s.pos, s.heading || 0, s.pitch || 0, s.roll || 0); const t = s.t || 0; const st = { ...W1, fade: s.fade ?? true };
  const sec = FUS.map(([z, r, cy]) => ring([0, cy * 0.4, z], r, [0, 0, 1], 20).map((p) => [p[0], p[1] * 1.08 + 0.0, p[2]]));
  // 机舱剪影（凸）
  solid(sec.flat().map(f), { ...st, depthBias: 0.05 });
  // 截面环与纵向轮廓（只画朝向相机的一半由凸包剪影保证；这里淡淡画出）
  for (let i = 1; i < sec.length - 1; i += 2) poly(sec[i].map(f), { stroke: PAL.white, width: 1, alpha: 0.28, fade: st.fade, depthBias: 0.04 });
  for (const k of [0, 5, 10, 15]) polyline(sec.map((r) => f(r[k])), { stroke: PAL.white, width: 1.1, alpha: 0.45, fade: st.fade, depthBias: 0.03 });
  // 驾驶舱玻璃：机头上半部的弧面分格
  const glass = []; for (let k = 0; k <= 8; k++) { const a = -0.5 + k / 8 * Math.PI * 0.55 + Math.PI * 0.22; glass.push(f([Math.cos(a) * 1.02, 0.25 + Math.sin(a) * 0.95, 2.35 - Math.abs(k - 4) * 0.08])); }
  polyline(glass, { stroke: '#8fdcff', width: 1.6, alpha: 0.9, glow: 0.6, fade: st.fade, depthBias: 0.02 });
  for (const sd of [-1, 1]) { poly([[sd * 1.12, 0.6, 1.25], [sd * 1.0, 0.65, 2.3], [sd * 0.75, 0.05, 2.75], [sd * 1.1, -0.05, 1.3]].map(f), { fill: 'rgba(40,110,160,0.35)', stroke: '#8fdcff', width: 1.3, alpha: 0.85, fade: st.fade, depthBias: 0.01 });
    // 舷窗与滑门
    poly([[sd * 1.19, 0.6, 0.85], [sd * 1.2, 0.6, -0.15], [sd * 1.2, 0.05, -0.15], [sd * 1.19, 0.05, 0.85]].map(f), { stroke: '#8fdcff', width: 1.2, alpha: 0.8, fade: st.fade, depthBias: 0.01 });
    polyline([[sd * 1.21, 0.75, 1.0], [sd * 1.21, -0.75, 1.0]].map(f), { stroke: PAL.white, width: 1, alpha: 0.6, fade: st.fade, depthBias: 0.01 });
    // 橙色救援色带
    polyline([[sd * 1.215, -0.25, 1.7], [sd * 1.215, -0.25, -2.0]].map(f), { stroke: PAL.orange, width: 3, alpha: 1, fade: st.fade, depthBias: 0.008 });
    // 滑橇
    tube(f([sd * 1.25, -1.45, -2.0]), f([sd * 1.25, -1.45, 2.1]), { radius: 0.06, outer: PAL.white, inner: '#0d1a26', fade: st.fade });
    tube(f([sd * 1.25, -1.45, 2.1]), f([sd * 1.22, -1.3, 2.4]), { radius: 0.06, outer: PAL.white, inner: '#0d1a26', fade: st.fade });
    for (const z of [1.0, -1.0]) tube(f([sd * 0.7, -0.9, z]), f([sd * 1.25, -1.45, z + 0.1]), { radius: 0.05, outer: PAL.white, inner: '#0d1a26', fade: st.fade });
  }
  // 左侧滑门开口（door 0~1）：门后是亮着暖光的机舱
  if (s.door > 0.01) { const z1 = 0.95, z0 = 0.95 - 1.25 * s.door; const op = [[-1.222, -0.72, z0], [-1.222, -0.72, z1], [-1.222, 0.62, z1], [-1.222, 0.62, z0]].map(f);
    poly(op, { fill: 'rgba(40,24,8,0.96)', stroke: '#ffd29a', width: 1.6, alpha: 1, glow: 0.8, glowColor: '#ffb347', fade: st.fade, depthBias: -0.06 });
    const lp2 = f([-1.0, 0.1, (z0 + z1) / 2]); points(new Float32Array(lp2), { color: '#ffd9a8', size: 3, alpha: 0.9, glow: 2.2, glowColor: '#ffb347', fade: false, depthBias: -0.07 }); }
  // 救援绞车：右侧吊臂，cable 为下放的钢缆长度（米）
  if (s.cable !== undefined) { const a0 = f([1.1, 1.0, 0.4]), a1 = f([1.75, 1.0, 0.4]); line(a0, a1, { stroke: PAL.white, width: 2.5, alpha: 1, fade: st.fade });
    polyline([a1, [a1[0], a1[1] - s.cable, a1[2]]], { stroke: '#e8f4ff', width: 1.4, alpha: 0.95, fade: st.fade, dots: false }); }
  // 发动机整流罩
  box((p) => f([p[0], p[1] + 1.25, p[2] - 0.9]), [1.1, 0.6, 2.4], { ...st, width: 1.3 }, {});
  // 尾梁（锥管）＋橙色段＋垂尾＋平尾
  tube(f([0, 0.4, -2.8]), f([0, 0.75, -8.6]), { radius: 0.42, radius2: 0.17, outer: PAL.white, inner: '#07121c', edge: 1.6, fade: st.fade });
  tube(f([0, 0.47, -4.2]), f([0, 0.55, -5.2]), { radius: 0.38, radius2: 0.33, outer: PAL.orange, inner: '#3a1a08', edge: 1.4, fade: st.fade, depthBias: -0.05 });
  poly([[0, 0.7, -8.0], [0, 2.2, -9.0], [0, 2.2, -9.45], [0, 0.6, -8.9]].map(f), { fill: 'rgba(60,24,6,0.95)', stroke: PAL.orange, width: 1.5, alpha: 1, fade: st.fade });
  poly([[-1.1, 0.75, -7.3], [1.1, 0.75, -7.3], [1.1, 0.75, -7.85], [-1.1, 0.75, -7.85]].map(f), { ...st, width: 1.2 });
  // 主旋翼
  const ang = s.rotor || 0, sp = s.speed ?? 1; const hub = [0, 2.15, -0.5];
  cylinder((p) => f([p[0], p[1] + 1.85, p[2] - 0.5]), 0.12, 0.16, 0.6, { ...st, width: 1.2 }, 12);
  const blur = smooth((sp - 0.3) / 0.4);
  if (blur > 0.02) { poly(ring(hub, 5.6, [0, 1, 0], 64).map(f), { fill: 'rgba(150,210,255,0.035)', stroke: PAL.white, width: 1, alpha: 0.32 * blur, fade: st.fade });
    for (let q = 0; q < 4; q++) { const arc = []; for (let k = 0; k <= 10; k++) { const th = ang + q * Math.PI / 2 + k * 0.035; arc.push(f([hub[0] + Math.cos(th) * 5.4, hub[1], hub[2] + Math.sin(th) * 5.4])); } polyline(arc, { stroke: PAL.white, width: 1.6, alpha: 0.5 * blur, fade: st.fade }); } }
  for (let q = 0; q < 4; q++) { const th = ang + q * Math.PI / 2; tube(f(hub), f([hub[0] + Math.cos(th) * 5.6, hub[1], hub[2] + Math.sin(th) * 5.6]), { radius: 0.16, radius2: 0.12, outer: PAL.white, inner: '#1a2633', edge: 1.2, alpha: 1 - blur * 0.85, fade: st.fade }); }
  // 尾桨
  const th0 = ang * 4.6; const tc = [0.25, 1.55, -8.75];
  if (blur > 0.02) poly(ring(tc, 0.72, [1, 0, 0], 28).map(f), { stroke: PAL.white, width: 1, alpha: 0.4 * blur, fade: st.fade });
  for (let q = 0; q < 2; q++) { const th = th0 + q * Math.PI / 2; line(f([tc[0], tc[1] + Math.cos(th) * 0.72, tc[2] + Math.sin(th) * 0.72]), f([tc[0], tc[1] - Math.cos(th) * 0.72, tc[2] - Math.sin(th) * 0.72]), { stroke: PAL.white, width: 1.5, alpha: 1 - blur * 0.8, fade: st.fade }); }
  // 防撞灯、探照灯
  const bk = (t % 1.0) < 0.12;
  points(new Float32Array(f([0, 1.0, -3.0])), { color: '#ff3b30', size: 5, alpha: bk ? 1 : 0.25, glow: bk ? 3 : 0, glowColor: '#ff3b30', fade: false });
  if (s.search) points(new Float32Array(f([0, -1.0, 2.2])), { color: '#fff', size: 5, glow: 2, fade: false });
  return f;
}

// —— 人物：简化线稿人形（头、躯干、四肢），pose: walk 相位，run 0~1 ——
export function drawHuman(s) {
  const f = xform(s.pos, s.heading || 0); const ph = s.phase || 0, run = s.run ?? 0; const st = { stroke: s.color || PAL.white, width: s.width || 1.5, alpha: s.alpha ?? 1, fade: s.fade ?? true };
  const sw = Math.sin(ph) * (0.35 + 0.35 * run), lean = run * 0.18; const bob = Math.abs(Math.cos(ph)) * 0.04 * run;
  const hip = [0, 0.95 + bob, 0], neck = [0, 1.48 + bob, lean * 0.5], head = [0, 1.66 + bob, lean * 0.6];
  const fill = { fill: s.fill || 'rgba(4,12,20,0.96)', ...st };
  // 躯干（梯形）
  poly([[-0.2, 1.45 + bob, lean * 0.45], [0.2, 1.45 + bob, lean * 0.45], [0.15, 0.95 + bob, 0], [-0.15, 0.95 + bob, 0]].map(f), { ...fill, depthBias: 0.02 });
  if (s.vest) polyline([[-0.19, 1.2 + bob, lean * 0.3 + 0.13], [0.19, 1.2 + bob, lean * 0.3 + 0.13]].map(f), { stroke: s.vest, width: 3, alpha: st.alpha, fade: st.fade, depthBias: 0.01 });
  poly(ring(head, 0.11, [1, 0, 0], 16).map(f), { ...fill, depthBias: 0.01 });
  if (s.helmet) poly(ring([head[0], head[1] + 0.03, head[2]], 0.12, [1, 0, 0], 16).slice(0, 9).map(f), { stroke: s.helmet, width: 2.2, alpha: st.alpha, fade: st.fade, depthBias: 0.005 });
  // 腿
  for (const sd of [-1, 1]) {
    const a = sd * sw; const knee = [sd * 0.1, 0.5 + bob, Math.sin(a) * 0.25 + 0.05 * run], foot = [sd * 0.1, 0.05, Math.sin(a) * 0.48 - (a < 0 ? 0.1 * run : 0)];
    tube(f([sd * 0.1, 0.95 + bob, 0]), f(knee), { radius: 0.07, outer: st.stroke, inner: '#08131e', edge: 1.3, alpha: st.alpha, fade: st.fade });
    tube(f(knee), f(foot), { radius: 0.06, outer: st.stroke, inner: '#08131e', edge: 1.3, alpha: st.alpha, fade: st.fade });
    const b = -sd * sw * 0.9; const elb = [sd * 0.25, 1.15 + bob, Math.sin(b) * 0.2 + lean * 0.3], hand = [sd * 0.27, 0.9 + bob, Math.sin(b) * 0.38 + 0.12 * run];
    if (s.armsUp) { elb[1] = 1.55; elb[2] = 0.2; hand[1] = 1.4; hand[2] = 0.45; }
    tube(f([sd * 0.2, 1.42 + bob, lean * 0.45]), f(elb), { radius: 0.05, outer: st.stroke, inner: '#08131e', edge: 1.2, alpha: st.alpha, fade: st.fade });
    tube(f(elb), f(hand), { radius: 0.045, outer: st.stroke, inner: '#08131e', edge: 1.2, alpha: st.alpha, fade: st.fade });
  }
  return f;
}

// 坐姿人物背影（指挥员）
export function drawOperator(pos, heading, t, k = 0) {
  const f = xform(pos, heading); const st = { fill: 'rgba(3,9,15,0.97)', stroke: '#7fbfe6', width: 1.4, alpha: 0.9 };
  const nod = Math.sin(t * 0.7 + k * 2) * 0.03;
  // 椅背
  poly([[-0.26, 0.5, 0.3], [0.26, 0.5, 0.3], [0.24, 1.15, 0.36], [-0.24, 1.15, 0.36]].map(f), { ...st, stroke: '#3f7aa3', depthBias: -0.1 });
  // 躯干与头
  poly([[-0.24, 0.55, 0.12], [0.24, 0.55, 0.12], [0.22, 1.2, 0.05], [-0.22, 1.2, 0.05]].map(f), { ...st, depthBias: -0.05 });
  poly(ring([0, 1.38, nod], 0.12, [0, 0, 1], 18).map(f), { ...st, depthBias: -0.06 });
  poly(ring([0, 1.38, nod], 0.13, [0, 0, 1], 18).slice(2, 9).map(f), { stroke: '#57cfff', width: 2, alpha: 0.6 }, false); // 耳机
}

// —— 被困者：瓦砾下侧卧的人形热源点云 ——
let VICTIM = null;
export function victimCloud() {
  if (VICTIM) return VICTIM; const R = mulberry32(31); const a = [];
  // 局部坐标：身体沿 x 轴侧卧，头在 +x；y 向上
  const caps = [[[0.62, 0.12, 0], [0.62, 0.12, 0], 0.11], [[0.45, 0.1, 0], [0.05, 0.1, 0.02], 0.16], [[0.05, 0.1, 0.02], [-0.42, 0.08, 0.12], 0.08], [[-0.42, 0.08, 0.12], [-0.8, 0.06, 0.05], 0.065], [[0.05, 0.08, -0.02], [-0.38, 0.07, -0.1], 0.08], [[-0.38, 0.07, -0.1], [-0.78, 0.05, -0.2], 0.065], [[0.42, 0.14, 0.12], [0.2, 0.16, 0.32], 0.05], [[0.2, 0.16, 0.32], [0.42, 0.14, 0.46], 0.045]];
  for (const [p, q, r] of caps) { const n = Math.round(380 * r / 0.1); for (let i = 0; i < n; i++) { const u = R(); const c = [lerp(p[0], q[0], u), lerp(p[1], q[1], u), lerp(p[2], q[2], u)]; const th = R() * 6.28, ph = Math.acos(2 * R() - 1); const rr = r * (0.75 + R() * 0.25); a.push(c[0] + Math.sin(ph) * Math.cos(th) * rr, c[1] + Math.cos(ph) * rr * 0.8, c[2] + Math.sin(ph) * Math.sin(th) * rr); } }
  VICTIM = new Float32Array(a); return VICTIM;
}
// 画被困者：pos 世界坐标，yaw 朝向，k 显现程度，t 时间（呼吸脉动）
export function drawVictim(pos, yaw, k, t) {
  if (k <= 0.01) return; const f = xform(pos, yaw); const src = victimCloud(); const pul = 0.75 + 0.25 * Math.sin(t * 6.5);
  const n = src.length / 3; const core = [], warm = [];
  for (let i = 0; i < n; i++) { const w = f([src[i * 3], src[i * 3 + 1], src[i * 3 + 2]]); (i % 3 === 0 ? warm : core).push(...w); }
  points(new Float32Array(warm), { color: '#ffb347', alpha: 0.75 * k, size: 2.2, glow: 1.2 * k * pul, glowColor: '#ff7a2e', fade: false, depthBias: -5 });
  points(new Float32Array(core), { color: '#ff4a2e', alpha: 0.9 * k, size: 2, glow: 1.4 * k * pul, glowColor: '#ff3b30', fade: false, depthBias: -5 });
  const hc = project(f([0.62, 0.12, 0])); if (hc) custom(-1e3, (L, G) => { G.globalAlpha = 0.5 * k * pul; G.fillStyle = '#ff5a30'; G.beginPath(); G.arc(hc.x / 2, hc.y / 2, 30, 0, 7); G.fill(); });
}

// 被困者在画面上的外接框（像素）
export function victimBox(pos, yaw, pad = 30) {
  const f = xform(pos, yaw); let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
  for (const q of [[0.75, 0.12, 0], [0.62, 0.25, 0], [-0.88, 0.06, 0.06], [-0.85, 0.05, -0.22], [0.2, 0.2, 0.5], [0.45, 0.2, 0.5], [0.05, 0.28, 0], [0.05, -0.04, 0]]) { const p = project(f(q)); if (!p) return null; x0 = Math.min(x0, p.x); y0 = Math.min(y0, p.y); x1 = Math.max(x1, p.x); y1 = Math.max(y1, p.y); }
  return [x0 - pad, y0 - pad, x1 - x0 + 2 * pad, y1 - y0 + 2 * pad];
}

// —— 瓦砾缝隙特写（单独布景，单位米，原点在手机处） ——
let CREV = null;
export function crevice() {
  if (CREV) return CREV; const R = mulberry32(5); const rocks = [], dust = [];
  for (let i = 0; i < 160; i++) { const s = 0.02 + Math.pow(R(), 2) * 0.16; const x = (R() - 0.5) * 1.8, z = (R() - 0.5) * 1.6; if (Math.abs(x) < 0.14 && Math.abs(z) < 0.2) continue; rocks.push({ x, z, s, ry: R() * 6, rx: (R() - 0.5) * 0.6, rz: (R() - 0.5) * 0.6, h: 0.6 + R() * 0.5 }); }
  const grit = []; for (let i = 0; i < 2600; i++) { const x = (R() - 0.5) * 1.8, z = (R() - 0.5) * 1.6; if (Math.abs(x) < 0.06 && Math.abs(z) < 0.1) continue; grit.push(x, R() * 0.02, z); }
  for (let i = 0; i < 300; i++) dust.push([R(), R(), R(), R()]);
  CREV = { rocks, grit: new Float32Array(grit), dust }; return CREV;
}
const SLABS = [[[-0.62, 0.55, 0.1], [0.05, 0.1, 1.05], [2.6, 0.22, 1.8]], [[0.66, 0.6, -0.05], [-0.04, -0.12, -1.0], [2.4, 0.22, 1.9]], [[0.1, 1.25, -0.7], [0.5, 0.3, 0.12], [1.6, 0.18, 1.2]]];
export function drawCrevice(t, ring1 = 1) {
  const C = crevice(); const sty = { fill: 'rgba(5,12,20,0.97)', stroke: '#8fd0f2', width: 1.7, alpha: 1, fade: true, innerAlpha: 0.4, innerColor: '#6fb6dc', glow: 0.3 };
  for (const [p, r, sz] of SLABS) box(xform(p, r[1], r[0], r[2]), sz, sty, { windows: { floor: 0.11, bay: 0.4 } });
  for (const k of C.rocks) box(xform([k.x, k.s * 0.3, k.z], k.ry, k.rx, k.rz), [k.s, k.s * k.h, k.s * 0.9], { fill: 'rgba(6,14,22,0.97)', stroke: '#6fb6dc', width: 1.2, alpha: 0.9 });
  points(C.grit, { color: '#6aa9cf', alpha: 0.55, size: 1.4 });
  line([-0.85, 0.12, -0.55], [0.3, 0.9, 0.05], { stroke: '#d9925a', width: 1.6, alpha: 0.8 });
  // 光束里飘落的灰尘
  const d = []; for (const [a, b, c, e] of C.dust) { const life = 5 + e * 3; const u = ((t / life + a) % 1); d.push(-0.6 + 0.65 * b + (c - 0.5) * 0.3, 2.0 - 2.0 * u, 0.7 - 0.75 * b + (e - 0.5) * 0.3); }
  points(new Float32Array(d), { color: '#ffd9a8', alpha: 0.55, size: 2, glow: 0.4, glowColor: '#ffb347' });
  // 手机
  const pf = xform([0.02, 0.012, 0.02], 0.5); const buzz = (t % 1.6) < 0.9 ? Math.sin(t * 90) * 0.0015 : 0;
  const ph = (p) => pf([p[0] + buzz, p[1], p[2]]);
  box(ph, [0.075, 0.009, 0.155], { fill: '#05080c', stroke: PAL.white, width: 1.6, alpha: 1, fade: false });
  const sc = [[-0.034, 0.0048, -0.0725], [0.034, 0.0048, -0.0725], [0.034, 0.0048, 0.0725], [-0.034, 0.0048, 0.0725]].map(ph);
  poly(sc, { fill: '#123049', stroke: '#9fe0ff', width: 1.2, alpha: 1, glow: 0.8, glowColor: '#5ab8ff', fade: false, depthBias: -0.001 });
  // 屏幕内容：用投影后的四角做仿射贴图
  const P = sc.map((p) => project(p)); if (P.every(Boolean)) custom(-1, (L, G) => {
    const [a, b, , d2] = P; const ux = (b.x - a.x) / 256, uy = (b.y - a.y) / 256, vx = (d2.x - a.x) / 512, vy = (d2.y - a.y) / 512;
    L.setTransform(ux, uy, vx, vy, a.x, a.y);
    const g = L.createLinearGradient(0, 0, 0, 512); g.addColorStop(0, '#1d4a6a'); g.addColorStop(1, '#0a1a2a'); L.fillStyle = g; L.fillRect(0, 0, 256, 512);
    L.fillStyle = 'rgba(255,255,255,0.14)'; L.beginPath(); L.arc(128, 170, 60 + 22 * ((t * 1.2) % 1), 0, 7); L.fill();
    L.fillStyle = '#d9e6f0'; L.beginPath(); L.arc(128, 170, 52, 0, 7); L.fill();
    L.fillStyle = '#9fb3c4'; L.beginPath(); L.arc(128, 155, 20, 0, 7); L.fill(); L.beginPath(); L.arc(128, 215, 34, Math.PI, 0); L.fill();
    L.fillStyle = '#ffffff'; L.textAlign = 'center'; L.font = 'bold 54px "Noto Sans SC",sans-serif'; L.fillText('妈妈', 128, 300);
    L.font = '26px "Noto Sans SC",sans-serif'; L.fillStyle = 'rgba(255,255,255,0.8)'; L.fillText('来电…', 128, 345);
    L.fillStyle = '#ff4a3a'; L.beginPath(); L.arc(70, 440, 30, 0, 7); L.fill(); L.fillStyle = '#33d17a'; L.beginPath(); L.arc(186, 440, 30, 0, 7); L.fill();
    L.setTransform(1, 0, 0, 1, 0, 0);
    const cx = (a.x + b.x + d2.x) / 3, cy = (a.y + b.y + d2.y) / 3; G.globalAlpha = 0.35 * ring1; const gr = G.createRadialGradient(cx / 2, cy / 2, 2, cx / 2, cy / 2, 75); gr.addColorStop(0, 'rgba(110,190,255,0.9)'); gr.addColorStop(1, 'rgba(110,190,255,0)'); G.fillStyle = gr; G.fillRect(cx / 2 - 75, cy / 2 - 75, 150, 150);
  });
}
