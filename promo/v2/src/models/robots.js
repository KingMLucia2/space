// 线稿设备：六轴无人机（机身剪影、管状机臂、旋翼圆盘）、六足机器人（沿用第一版的逆运动学与三角步态）、基站
import * as THREE from 'three';
import { poly, polyline, points, ring, solid, tube, line, PAL } from '../core.js';
import { xform, compose, box, cylinder, dome } from '../prims.js';
import { clamp, lerp, smooth } from '../util.js';

export const DRONE = { armReach: 1.12, propR: 0.37, skidY: -0.62, latchY: -0.17 };
export const HEX = { bodyR: 0.24, mountR: 0.22, L0: 0.06, L1: 0.2, L2: 0.3, standH: 0.24, footR: 0.52, topY: 0.11 };
export const HANG_Y = DRONE.latchY - HEX.topY - 0.015;
const W1 = { fill: PAL.fill, stroke: PAL.white, width: 1.6, alpha: 1, fade: false };
const OR = { stroke: PAL.orange, width: 2.2, alpha: 1, fade: false };

// 旋翼角度：起转加速、到 wMax 匀速，可选减速
export function rotorSpin(t, { t0 = -100, wMax = 160, spinUp = 2.0, t1 = Infinity, spinDown = 2.0 } = {}) {
  if (t < t0) return { angle: 0, speed: 0 };
  const a = wMax / spinUp, tu = t - t0; let angle, w;
  if (tu < spinUp) { angle = 0.5 * a * tu * tu; w = a * tu; } else { angle = 0.5 * a * spinUp * spinUp + wMax * (tu - spinUp); w = wMax; }
  if (t > t1) { const td = Math.min(t - t1, spinDown); const d = wMax / spinDown; angle -= 0.5 * d * td * td; w = Math.max(0, wMax - d * td); }
  return { angle, speed: clamp(w / wMax) };
}

// s: { pos, heading, pitch, roll, rot:{angle,speed}, latch(0锁~1开), ring, strobe, t }
export function drawDrone(s) {
  const f = xform(s.pos, s.heading || 0, s.pitch || 0, s.roll || 0);
  const t = s.t || 0, sp = s.rot ? s.rot.speed : 0, ang = s.rot ? s.rot.angle : 0;
  // 机身
  cylinder(f, 0.31, 0.34, 0.16, { ...W1, depthBias: 0.02 }, 32, { stroke: PAL.white, width: 1.2, alpha: 0.7, fade: false });
  poly(ring([0, -0.03, 0], 0.346, [0, 1, 0], 40).map(f), { ...OR, width: 2.6, depthBias: 0.015 });
  dome((p) => f([p[0], p[1] + 0.08, p[2]]), 0.3, 0.36, { ...W1, depthBias: 0.01 }, 20);
  points(new Float32Array(f([0, 0.19, 0.08])), { color: PAL.blue, size: 3, glow: 1.5, fade: false });
  if (s.strobe) points(new Float32Array(f([0, 0.2, -0.1])), { color: '#fff', size: 4, alpha: (t % 1.2) < 0.08 ? 1 : 0.15, glow: (t % 1.2) < 0.08 ? 3 : 0, fade: false });
  // 机腹：灯环与锁扣
  poly(ring([0, -0.143, 0], 0.19, [0, 1, 0], 32).map(f), { stroke: PAL.blue, width: 2, alpha: 1, glow: s.ring ?? 1.2, fade: false, depthBias: 0.02 });
  const latch = s.latch || 0;
  for (let i = 0; i < 4; i++) { const a = i * Math.PI / 2 + Math.PI / 4; const p0 = [Math.sin(a) * 0.13, -0.14, Math.cos(a) * 0.13]; const p1 = [Math.sin(a) * (0.13 + 0.05 * latch), -0.22 + 0.03 * latch, Math.cos(a) * (0.13 + 0.05 * latch)]; tube(f(p0), f(p1), { radius: 0.012, outer: PAL.white, inner: '#7a8a99', fade: false }); }
  // 机臂、电机、旋翼
  for (let i = 0; i < 6; i++) {
    const a = i * Math.PI / 3 + Math.PI / 6, dx = Math.sin(a), dz = Math.cos(a);
    const m = [dx * DRONE.armReach, 0, dz * DRONE.armReach];
    tube(f([dx * 0.32, 0, dz * 0.32]), f(m), { radius: 0.03, outer: PAL.white, inner: '#0d1a26', fade: false });
    tube(f([dx * 0.9, 0, dz * 0.9]), f([dx * 0.98, 0, dz * 0.98]), { radius: 0.036, outer: PAL.orange, inner: PAL.orange, edge: 0.5, fade: false });
    cylinder((p) => f([m[0] + p[0], p[1] + 0.07, m[2] + p[2]]), 0.06, 0.07, 0.1, { ...W1, width: 1.3 }, 16);
    points(new Float32Array(f([m[0], -0.04, m[2]])), { color: (i === 0 || i === 5) ? '#fff' : PAL.blue, size: 3, glow: 1.4, fade: false });
    const hubP = [m[0], 0.15, m[2]];
    const blur = smooth((sp - 0.35) / 0.4);
    if (blur > 0.02) {
      poly(ring(hubP, DRONE.propR, [0, 1, 0], 40).map(f), { fill: 'rgba(160,220,255,0.05)', stroke: PAL.white, width: 1, alpha: 0.35 * blur, fade: false });
      poly(ring(hubP, DRONE.propR - 0.02, [0, 1, 0], 40).map(f), { stroke: PAL.orange, width: 1.6, alpha: 0.6 * blur, fade: false });
      const ba = ang * (i % 2 ? 1 : -1) + i; for (let q = 0; q < 2; q++) { const arc = []; for (let k = 0; k <= 8; k++) { const th = ba + q * Math.PI + k * 0.08; arc.push(f([hubP[0] + Math.cos(th) * DRONE.propR * 0.92, 0.15, hubP[2] + Math.sin(th) * DRONE.propR * 0.92])); } polyline(arc, { stroke: PAL.white, width: 1.5, alpha: 0.5 * blur, fade: false }); }
    }
    if (blur < 0.98) { const ba = ang * (i % 2 ? 1 : -1) + i * 0.7; const e1 = [hubP[0] + Math.cos(ba) * DRONE.propR, 0.15, hubP[2] + Math.sin(ba) * DRONE.propR], e2 = [hubP[0] - Math.cos(ba) * DRONE.propR, 0.15, hubP[2] - Math.sin(ba) * DRONE.propR];
      tube(f(e1), f(e2), { radius: 0.012, outer: PAL.white, inner: '#1a2633', alpha: 1 - blur, fade: false }); }
  }
  // 起落架
  for (const sd of [-1, 1]) {
    for (const zz of [0.17, -0.17]) tube(f([sd * 0.2, -0.12, zz]), f([sd * 0.64, -0.62, zz * 1.4]), { radius: 0.016, outer: PAL.white, inner: '#0d1a26', fade: false });
    tube(f([sd * 0.64, -0.62, -0.46]), f([sd * 0.64, -0.62, 0.46]), { radius: 0.02, outer: PAL.white, inner: '#0d1a26', fade: false });
    points(new Float32Array([...f([sd * 0.64, -0.62, 0.46]), ...f([sd * 0.64, -0.62, -0.46])]), { color: PAL.orange, size: 4, fade: false });
  }
  // 云台
  dome((p) => f([p[0], p[1] - 0.18, p[2] + 0.27]), 0.06, 1, { ...W1, width: 1.2 }, 12, false);
  return f;
}

// —— 六足机器人 ——
const PSI = [45, 90, 135, -45, -90, -135].map((d) => d * Math.PI / 180);
export const TRIPOD = [0, 1, 0, 1, 0, 1];
function legIK(lx, ly, lz) {
  const { L0, L1, L2 } = HEX; const gamma = Math.atan2(-lz, lx); const r = Math.hypot(lx, lz) - L0;
  let d = Math.hypot(r, ly); d = clamp(d, Math.abs(L1 - L2) + 1e-3, L1 + L2 - 1e-3);
  const knee = Math.acos(clamp((L1 * L1 + L2 * L2 - d * d) / (2 * L1 * L2), -1, 1));
  return [gamma, Math.atan2(ly, r) + Math.acos(clamp((L1 * L1 + d * d - L2 * L2) / (2 * L1 * d), -1, 1)), -(Math.PI - knee)];
}
function foldAngles(i) { const s = Math.sign(PSI[i]); const front = i % 3 === 0, rear = i % 3 === 2; return [front ? -s * 0.45 : rear ? s * 0.45 : 0, 0.05, -2.95]; }
export function nominalFoot(i, radius = HEX.footR) { const p = PSI[i]; return [Math.sin(p) * radius, 0, Math.cos(p) * radius]; }
export function footOnGround(pose, local, groundY = () => 0) { const c = Math.cos(pose.heading || 0), s = Math.sin(pose.heading || 0); const x = pose.x + local[0] * c + local[2] * s, z = pose.z - local[0] * s + local[2] * c; return [x, groundY(x, z), z]; }
export function gaitFeet(t, bodyAt, { freq = 1.3, lift = 0.07, radius = HEX.footR, groundY = () => 0 } = {}) {
  const feet = [];
  for (let i = 0; i < 6; i++) {
    const ph = TRIPOD[i] * 0.5, c = t * freq + ph, k = Math.floor(c), u = c - k; const local = nominalFoot(i, radius);
    const touch = (kk) => footOnGround(bodyAt((kk + 0.25 - ph) / freq), local, groundY);
    if (u < 0.5) { feet.push(touch(k)); continue; }
    const a = touch(k), b = touch(k + 1), s2 = smooth((u - 0.5) / 0.5), dist = Math.hypot(b[0] - a[0], b[2] - a[2]);
    feet.push([lerp(a[0], b[0], s2), lerp(a[1], b[1], s2) + Math.sin(Math.PI * s2) * lift * clamp(dist / 0.05), lerp(a[2], b[2], s2)]);
  }
  return feet;
}
export function standFeet(pose) { return [0, 1, 2, 3, 4, 5].map((i) => footOnGround(pose, nominalFoot(i))); }

// s: { f (外部变换，可选，挂在无人机下时用) 或 pose:{x,y,z,heading,pitch,roll}, feet(世界坐标), fold(0~1), scanner(0~1), glow }
export function drawHexapod(s) {
  const f = s.f || xform([s.pose.x, s.pose.y, s.pose.z], s.pose.heading || 0, s.pose.pitch || 0, s.pose.roll || 0);
  const inv = f.m.clone().invert();
  // 机身：倒角六棱柱剪影＋顶面轮廓＋橙色条
  const hex = (y, r) => { const a = []; for (let k = 0; k < 6; k++) { const th = k * Math.PI / 3; a.push([Math.cos(th) * r, y, Math.sin(th) * r]); } return a; };
  solid([...hex(-0.05, HEX.bodyR), ...hex(0.09, HEX.bodyR * 0.93)].map(f), { ...W1, depthBias: 0.01 });
  poly(hex(0.093, HEX.bodyR * 0.93).map(f), { stroke: PAL.white, width: 1.2, alpha: 0.7, fade: false, depthBias: 0.005 });
  for (const sd of [-1, 1]) polyline([[sd * 0.11, 0.095, -0.15], [sd * 0.11, 0.095, 0.15]].map(f), { ...OR, width: 2.4, depthBias: 0.004 });
  box((p) => f([p[0], p[1] + 0.1, p[2]]), [0.17, 0.018, 0.17], { fill: '#0b1824', stroke: PAL.white, width: 1, alpha: 0.8, fade: false });
  for (const sd of [-1, 1]) points(new Float32Array(f([sd * 0.205, 0.03, 0])), { color: PAL.blue, size: 3, glow: 1.2, fade: false });
  // 头部与雷达面板
  const hf = (p) => f([p[0], p[1] + 0.025, p[2] + 0.25]);
  box(hf, [0.17, 0.085, 0.12], { fill: PAL.fill, stroke: PAL.white, width: 1.5, fade: false });
  polyline([[-0.085, -0.03, 0.061], [0.085, -0.03, 0.061]].map(hf), { ...OR, width: 2 });
  for (const sd of [-1, 1]) poly(ring([sd * 0.04, 0.008, 0.062], 0.022, [0, 0, 1], 16).map(hf), { fill: '#02070c', stroke: PAL.white, width: 1.2, fade: false, depthBias: -0.01 });
  points(new Float32Array(hf([0, -0.016, 0.063])), { color: '#40e0ff', size: 3, glow: 1.5, fade: false });
  const dep = s.scanner || 0, pa = -dep * 1.25;
  const pf = (p) => hf([p[0], 0.044 + p[1] * Math.cos(pa) - (p[2]) * Math.sin(pa) * 0, -0.055 + (p[2] * Math.cos(pa) - p[1] * Math.sin(pa))]);
  const panel = [[-0.08, 0, 0], [0.08, 0, 0], [0.08, Math.sin(-pa) * 0.11, Math.cos(-pa) * 0.11], [-0.08, Math.sin(-pa) * 0.11, Math.cos(-pa) * 0.11]].map((p) => hf([p[0], 0.044 + p[1], -0.055 + p[2]]));
  poly(panel, { fill: 'rgba(10,40,70,0.9)', stroke: dep > 0.05 ? '#7fe0ff' : PAL.white, width: 1.4, glow: (s.glow || 0) * 1.2, glowColor: '#3aa8ff', fade: false, depthBias: -0.012 });
  if (dep > 0.05) { const m0 = hf([0.07, 0.04, -0.04]), m1 = hf([0.07, 0.04 + 0.2 * dep, -0.04]); line(m0, m1, { stroke: PAL.white, width: 1.2, fade: false }); points(new Float32Array(m1), { color: PAL.blue, size: 3, glow: 1.5, fade: false }); }
  // 腿
  const fold = s.fold || 0; const fk = smooth(fold);
  for (let i = 0; i < 6; i++) {
    const psi = PSI[i]; const mp = [Math.sin(psi) * HEX.mountR, 0, Math.cos(psi) * HEX.mountR];
    let ik = foldAngles(i);
    if (s.feet && fold < 1) {
      const v = new THREE.Vector3(...s.feet[i]).applyMatrix4(inv); v.x -= mp[0]; v.z -= mp[2];
      const th = -(psi - Math.PI / 2), c = Math.cos(th), sn = Math.sin(th);
      ik = legIK(v.x * c + v.z * sn, v.y, -v.x * sn + v.z * c);
    }
    const fa = foldAngles(i); const g = lerp(ik[0], fa[0], fk), al = lerp(ik[1], fa[1], fk), be = lerp(ik[2], fa[2], fk);
    const th = psi - Math.PI / 2 + g; const dir = [Math.cos(th), 0, -Math.sin(th)];
    const p1 = [mp[0] + dir[0] * HEX.L0, 0, mp[2] + dir[2] * HEX.L0];
    const knee = [p1[0] + dir[0] * HEX.L1 * Math.cos(al), HEX.L1 * Math.sin(al), p1[2] + dir[2] * HEX.L1 * Math.cos(al)];
    const foot = [knee[0] + dir[0] * HEX.L2 * Math.cos(al + be), knee[1] + HEX.L2 * Math.sin(al + be), knee[2] + dir[2] * HEX.L2 * Math.cos(al + be)];
    const LG = { outer: PAL.white, inner: '#132636', edge: 1.4, fade: false };
    tube(f(mp), f(p1), { ...LG, radius: 0.012, radius2: 0.011 });
    tube(f(p1), f(knee), { ...LG, radius: 0.0095, radius2: 0.0085 });
    const mid0 = [lerp(p1[0], knee[0], 0.28), lerp(p1[1], knee[1], 0.28), lerp(p1[2], knee[2], 0.28)], mid1 = [lerp(p1[0], knee[0], 0.78), lerp(p1[1], knee[1], 0.78), lerp(p1[2], knee[2], 0.78)];
    tube(f(mid0), f(mid1), { radius: 0.0105, radius2: 0.0095, outer: PAL.orange, inner: PAL.orange, edge: 0.4, fade: false });
    tube(f(knee), f(foot), { ...LG, radius: 0.008, radius2: 0.003 });
    const ax = [-dir[2], 0, dir[0]];
    for (const [jp, jr] of [[p1, 0.014], [knee, 0.013]]) poly(ring(jp, jr, ax, 14).map(f), { fill: '#0c1a26', stroke: PAL.white, width: 1.2, fade: false, depthBias: -0.004 });
  }
  return f;
}

// —— 基站 ——
export const DOCK = { w: 3.8, d: 3.8, h: 1.7, platLow: 0.75, platHigh: 1.72, ry: -0.9 };
export function dockTop(lift) { return DOCK.platLow + (DOCK.platHigh - DOCK.platLow) * smooth(lift) + 0.04; }
export function drawDock(pos, open, lift, t, lights = 1) {
  const f = xform(pos, DOCK.ry); const { w, d, h } = DOCK; const st = { fill: PAL.fill, stroke: PAL.white, width: 1.5, alpha: 0.95 };
  box(f, [w, h, d], { ...st }, { base: true, skipBottom: true, top: { fill: 'rgba(2,6,10,0.98)', stroke: PAL.white } });
  box((p) => f([p[0], p[1] - 0.15, p[2]]), [w + 2.2, 0.3, d + 2.2], { fill: 'rgba(6,16,26,0.95)', stroke: PAL.dim, width: 1, alpha: 0.8 }, { base: true });
  polyline([[-w / 2, 0.92, d / 2 + 0.01], [w / 2, 0.92, d / 2 + 0.01]].map(f), { stroke: PAL.orange, width: 2.4, alpha: 1 });
  polyline([[-w * 0.4, h - 0.08, d / 2 + 0.01], [w * 0.4, h - 0.08, d / 2 + 0.01]].map(f), { stroke: PAL.blue, width: 2, alpha: lights, glow: lights * (1.2 + 0.6 * Math.sin(t * 4)) });
  for (const sd of [-1, 1]) for (let k = 0; k < 5; k++) polyline([[sd * 0.9 - 0.25, 0.5 + k * 0.06, d / 2 + 0.01], [sd * 0.9 + 0.25, 0.5 + k * 0.06, d / 2 + 0.01]].map(f), { stroke: PAL.dim, width: 1, alpha: 0.8 });
  // 平台
  const py = DOCK.platLow + (DOCK.platHigh - DOCK.platLow) * smooth(lift);
  if (open > 0.02) { box((p) => f([p[0], p[1] + py, p[2]]), [w - 0.3, 0.08, d - 0.3], { fill: 'rgba(8,22,36,0.98)', stroke: PAL.line, width: 1.2 }, { base: false });
    poly(ring([0, py + 0.045, 0], 1.45, [0, 1, 0], 48).map(f), { stroke: PAL.amber, width: 1.6, alpha: 0.9 });
    for (const seg of [[[-0.35, -0.5], [-0.35, 0.5]], [[0.35, -0.5], [0.35, 0.5]], [[-0.35, 0], [0.35, 0]]]) polyline(seg.map(([x, z]) => f([x, py + 0.046, z])), { stroke: PAL.white, width: 2.2, alpha: 0.9 }); }
  // 两扇舱盖
  const a = smooth(open) * 2.6;
  for (const sd of [-1, 1]) {
    const hinge = [sd * w / 2, h, 0]; const ang = -sd * a;
    const lf = (p) => { const x = p[0] * Math.cos(ang) - p[1] * Math.sin(ang), y = p[0] * Math.sin(ang) + p[1] * Math.cos(ang); return f([hinge[0] + x, hinge[1] + y, p[2]]); };
    box((p) => lf([p[0] - sd * w / 4, p[1] + 0.06, p[2]]), [w / 2, 0.12, d + 0.04], { ...st, width: 1.3 });
    polyline([[-sd * 0.15, 0.125, -d / 2], [-sd * 0.15, 0.125, d / 2]].map(lf), { stroke: PAL.orange, width: 2, alpha: 0.9 });
  }
  // 气象杆与警示灯
  const mb = [w / 2 + 0.35, 0, -d / 2 + 0.3]; line(f(mb), f([mb[0], 2.6, mb[2]]), { stroke: PAL.white, width: 1.5 });
  const an = t * 3.1; for (let k = 0; k < 3; k++) { const th = an + k * 2.09; line(f([mb[0], 2.65, mb[2]]), f([mb[0] + Math.cos(th) * 0.22, 2.65, mb[2] + Math.sin(th) * 0.22]), { stroke: PAL.white, width: 1.2 }); }
  points(new Float32Array(f([-w / 2 + 0.05, h + 0.1, d / 2 - 0.3])), { color: PAL.blue, size: 5, alpha: lights, glow: lights * (Math.sin(t * 6) > 0.3 ? 3 : 0.5) });
  return f;
}
