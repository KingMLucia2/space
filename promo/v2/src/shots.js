// 第二版镜头表：26 个镜头共 120 秒。所有动画都用全片绝对时间 T（= 镜头起点 + t）计算，
// 同一地点的相邻镜头共用连续的相机路径（关键帧样条、参数化升降），换地点时才用转场。
import { W, H, PAL, setCam, setCamYPR, setReveal, POST, FOG, hud, project, custom, poly, polyline, points, ring, cam } from './core.js';
import { drawCity, drawVehicles, CITY, groundGrid } from './models/city.js';
import { drawDrone, drawHexapod, drawDock, rotorSpin, standFeet, gaitFeet, HEX, HANG_Y, DOCK, dockTop } from './models/robots.js';
import { drawHeli, drawHuman, drawVictim, drawCrevice, victimBox } from './models/extra.js';
import { drawAirport } from './models/airport.js';
import { SCREEN, FILL_D, GOD, GOD_FOG, setGodCam, dots, LAST, screenView, camForScreen, drawCommand, drawScreenContent, drawDevice, DEVICES, drawGod, hoverDrone } from './models/room.js';
import { reconHUD, detectHUD, titleCard, brackets, FONT, MONO, mixHex } from './hud.js';
import { compose } from './prims.js';
import { scanRings, downwash, routeLine, survivorBeacon, scanFan } from './fx.js';
import { clamp, lerp, range, smooth, smoother, easeIn, easeOut, shake, mulberry32 } from './util.js';

const DURS = [['s01', 5], ['s02', 4], ['s03', 4], ['s04', 4], ['s05', 4], ['s06', 5], ['s07', 4], ['s08', 4], ['s09', 4], ['s10', 4], ['s11', 5], ['s12', 4], ['s13', 3], ['s14', 6], ['s15', 5], ['s16', 3], ['s17', 4], ['s18', 4], ['s19', 4], ['s20', 4], ['s21', 5], ['s22', 4], ['s23', 5], ['s24', 8], ['s25', 5], ['s26', 9]];
export const T0 = {}; { let a = 0; for (const [id, d] of DURS) { T0[id] = a; a += d; } }

// —— 向量与相机工具 ——
const vl = (a, b, k) => [lerp(a[0], b[0], k), lerp(a[1], b[1], k), lerp(a[2], b[2], k)];
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const sc = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
const lerpLog = (a, b, k) => Math.exp(lerp(Math.log(a), Math.log(b), k));
function yp(pos, tgt) { const d = [tgt[0] - pos[0], tgt[1] - pos[1], tgt[2] - pos[2]]; const l = Math.hypot(d[0], d[1], d[2]); return [Math.atan2(-d[0], -d[2]), Math.asin(d[1] / l)]; }
// 相机关键帧样条（三次 Hermite）：key = { T, p, look 或 a:[yaw,pitch], f, m? }，m 为指定切线（每秒变化量）
function mkKeys(keys) {
  let py = null;
  return keys.map((k) => { const a = k.a || yp(k.p, k.look); let yaw = a[0]; if (py !== null) yaw = py + wrap(yaw - py); py = yaw; return { T: k.T, v: [...k.p, yaw, a[1], k.f], m: k.m }; });
}
function spline(K, T) {
  if (T <= K[0].T) return K[0].v.slice(); if (T >= K[K.length - 1].T) return K[K.length - 1].v.slice();
  let i = 0; while (T > K[i + 1].T) i++;
  const a = K[i], b = K[i + 1], dt = b.T - a.T, s = (T - a.T) / dt;
  const tan = (j) => { const k = K[j]; if (k.m) return k.m; if (j === 0 || j === K.length - 1) return k.v.map(() => 0); return k.v.map((_, c) => (K[j + 1].v[c] - K[j - 1].v[c]) / (K[j + 1].T - K[j - 1].T)); };
  const ma = tan(i), mb = tan(i + 1); const s2 = s * s, s3 = s2 * s;
  const h00 = 2 * s3 - 3 * s2 + 1, h10 = s3 - 2 * s2 + s, h01 = -2 * s3 + 3 * s2, h11 = s3 - s2;
  return a.v.map((_, c) => h00 * a.v[c] + h10 * dt * ma[c] + h01 * b.v[c] + h11 * dt * mb[c]);
}
const camV = (v) => setCamYPR([v[0], v[1], v[2]], v[3], v[4], 0, v[5]);
function fogFor(h) { const k = smooth(range(Math.log(Math.max(h, 0.1)), Math.log(2), Math.log(300))); FOG.start = lerp(8, GOD_FOG.start, k); FOG.end = lerp(90, GOD_FOG.end, k); }

// —— 设备与动作 ——
function combined(P, heading, pitch, roll, rot, T, ringK = 1.2) {
  const f = drawDrone({ pos: P, heading, pitch, roll, rot, t: T, strobe: true, ring: ringK });
  drawHexapod({ f: compose(f, [0, HANG_Y, 0]), fold: 1 });
  return f;
}
const LAND = CITY.landing;
function walkBody(T) { // 六足机器人行走路线（s11 起步，s12 减速停下）
  const tau = T - T0.s11;
  if (tau <= 0) return { x: LAND[0], z: LAND[2], heading: Math.PI };
  if (tau <= 5) return { x: 0.06 * tau, z: 6.5 - 0.85 * tau, heading: Math.PI };
  const u = Math.min(tau - 5, 1.2); return { x: 0.3 + 0.06 * u - 0.025 * u * u, z: 2.25 - (0.85 * u - 0.354 * u * u), heading: Math.PI };
}
const REST = walkBody(1e6);
const VICTIM = [CITY.survivors[0][0], 0.05, CITY.survivors[0][1]];
const ROUTE = [[0, 0.03, 6.5], [0.05, 0.03, 5.2], [0.18, 0.03, 3.6], [0.3, 0.03, 2.25], [REST.x, 0.03, REST.z]];
const restPose = (o = {}) => ({ x: REST.x, y: o.y ?? HEX.standH, z: REST.z, heading: Math.PI, pitch: o.pitch || 0 });
const restFeet = () => standFeet({ x: REST.x, z: REST.z, heading: Math.PI });
// 基站
const DF = [Math.sin(DOCK.ry), 0, Math.cos(DOCK.ry)], DS = [Math.cos(DOCK.ry), 0, -Math.sin(DOCK.ry)];
const dockAt = (f, s, up) => add(add(add(CITY.dock, sc(DF, f)), sc(DS, s)), [0, up, 0]);
const liftT = (T) => smooth(range(T, 16.0, 18.5)), openT = (T) => smooth(range(T, 14.0, 16.6)), lightT = (T) => smooth(range(T, 13.4, 13.9));
// 片尾绿
const GREEN_END = '#14aa68';
const UI_DETECT = { title: '灾区生命探测态势', sub: '空地协同 · 实时回传', count: '侦测完成：8 人' };
const V1 = { s: 1, x0: 0, y0: 0 };

// —— s11~s14：行走 → 停下扫描 → 越过机器人推向被困者 → 升起成上帝视角（一镜到底） ——
// s11 相机在机器人右后方跟拍；s12 围绕机器人转到正后方并抬高；s13 用样条越过机器人推向被困者
const S11_OFF = [1.5, 0.32, 0.5], S12_OFF = [0.08, 0.95, 1.9];
function searchCam(T) {
  const b = walkBody(T);
  if (T < T0.s12) return { p: [b.x + S11_OFF[0], S11_OFF[1], b.z + S11_OFF[2]], look: [b.x, 0.14, b.z - 0.2], f: 40 };
  const u = smoother(range(T, T0.s12, T0.s13));
  const th0 = Math.atan2(S11_OFF[2], S11_OFF[0]), th1 = Math.atan2(S12_OFF[2], S12_OFF[0]), r0 = Math.hypot(S11_OFF[0], S11_OFF[2]), r1 = Math.hypot(S12_OFF[0], S12_OFF[2]);
  const th = lerp(th0, th1, u), r = lerp(r0, r1, u);
  return { p: [b.x + Math.cos(th) * r, lerp(S11_OFF[1], S12_OFF[1], u), b.z + Math.sin(th) * r], look: [b.x, lerp(0.14, 0.2, u), b.z + lerp(-0.2, -0.5, u)], f: 40 };
}
const S13_START = searchCam(T0.s13);
const K_SEARCH = mkKeys([
  { T: T0.s13, p: S13_START.p, look: S13_START.look, f: 40 },
  { T: T0.s13 + 2.2, p: [0.5, 1.55, -0.95], look: [0.5, 0.0, -3.0], f: 40 },
  { T: T0.s14, p: [0.5, 1.6, -1.2], look: [0.5, 0.0, -3.0], f: 40 },
]);
const S14 = (() => { const v = K_SEARCH[K_SEARCH.length - 1].v; return { p: v.slice(0, 3), yaw: v[3], pitch: v[4], fov: v[5] }; })();
function godRise(t) {
  const u = clamp(t / 6); const h = lerpLog(S14.p[1], GOD.pos[1], u * u);
  const pk = smooth(range(t, 0, 3.6)); const pitch = lerp(S14.pitch, -Math.PI / 2, pk); const yaw = lerp(S14.yaw, 0, pk);
  const G = vl([VICTIM[0], 0, VICTIM[2]], [GOD.pos[0], 0, GOD.pos[2]], smooth(range(t, 0.5, 5.6)));
  const off = h * Math.cos(pitch) / Math.max(1e-6, -Math.sin(pitch));
  return { p: [G[0] + Math.sin(yaw) * off, h, G[2] + Math.cos(yaw) * off], yaw, pitch, fov: lerp(S14.fov, GOD.fov, smooth(range(t, 0, 4))) };
}
const DOT_T = [0, 5.02, 5.14, 5.26, 5.38, 5.5, 5.62, 5.74]; // s14 内各点出现时刻
// —— s15/s16：大厅 ——
function room15(t) {
  const lnd = Math.log(FILL_D) + 0.6 * (1 - Math.exp(-t / 0.33)) + 0.25 * smooth(t / 5); const k = smooth(range(t, 0, 4.5));
  return [0.5 * k, SCREEN.y - 0.4 * k, SCREEN.z + Math.exp(lnd)];
}
const R15E = room15(5);
function room16(t) { const k = smoother(range(t, 0, 1.6)); return [lerp(R15E[0], 0, k), lerp(R15E[1], SCREEN.y, k), SCREEN.z + lerpLog(R15E[2] - SCREEN.z, FILL_D, k)]; }
const god16 = (t) => lerp(GOD.pos[1], 365, smooth(range(t, 1.8, 3.0)));
// —— s17：分三段下降，落到六足机器人身边（GTA 式切换） ——
const CAM18 = { p: [2.55, 0.85, 2.55], look: [REST.x, 0.7, REST.z], f: 38 };
const C18 = (() => { const d = [CAM18.look[0] - CAM18.p[0], CAM18.look[1] - CAM18.p[1], CAM18.look[2] - CAM18.p[2]]; const r = Math.hypot(...d); return { r, yaw: Math.atan2(-d[0], -d[2]), phi: Math.asin(-d[1] / r) }; })();
function gtaCam(t) {
  let h = 365; h = lerpLog(h, 140, smoother(range(t, 0.1, 0.55))); h = lerpLog(h, 48, smoother(range(t, 0.85, 1.3))); h = lerpLog(h, 6.7, smoother(range(t, 1.6, 2.3)));
  const gk = smoother(range(t, 0.05, 0.6)); const tk = smoother(range(t, 2.1, 3.5));
  const tgt = vl([lerp(GOD.pos[0], REST.x, gk), 0, lerp(GOD.pos[2], REST.z, gk)], CAM18.look, tk);
  const r = lerpLog(h, C18.r, tk), th = lerp(0, C18.yaw, smooth(tk)), phi = lerp(Math.PI / 2, C18.phi, tk);
  const p = [tgt[0] + r * Math.sin(th) * Math.cos(phi), tgt[1] + r * Math.sin(phi), tgt[2] + r * Math.cos(th) * Math.cos(phi)];
  const blur = Math.max(...[[0.1, 0.55], [0.85, 1.3], [1.6, 2.3]].map(([a, b]) => Math.sin(Math.PI * range(t, a, b))));
  return { p, yaw: th, pitch: -phi, fov: lerp(GOD.fov, CAM18.f, tk), blur, h };
}
const HOVER = [REST.x, 2.8, REST.z];
// —— s24/s25：推向最后一个红点 ——
const CP24 = [-0.6, 2.4, SCREEN.z + 16.0], SFIN = 130;
const GREEN_ORDER = [6, 4, 3, 2, 1, 5, 0]; const greenAt = (i) => { const k = GREEN_ORDER.indexOf(i); return k < 0 ? 1e9 : 0.8 + k * 0.85; };
function zoom24(tau) {
  const v0 = screenView(CP24); const D7 = dots()[LAST]; const X0 = v0.x0 + v0.s * D7[0], Y0 = v0.y0 + v0.s * D7[1];
  const u = clamp(tau / 12.2); const s = Math.exp(Math.log(v0.s) + (Math.log(SFIN) - Math.log(v0.s)) * u * u * u); const k = smooth(clamp(tau / 9));
  return camForScreen(D7[0], D7[1], s, lerp(X0, W / 2, k), lerp(Y0, H / 2, k));
}

// 被困者点在当前相机下的屏幕位置
const dotProj = (i) => { const [x, z] = CITY.survivors[i]; const p = project([x, 0, z]); return p ? [p.x, p.y] : null; };
// 云团（空中镜头）
const CLOUDS = (() => { const R = mulberry32(88); const a = []; for (let c = 0; c < 14; c++) { const cx = 560 + R() * 200, cy = 80 + R() * 40, cz = 20 + R() * 220; for (let i = 0; i < 160; i++) { const g = () => (R() + R() + R() - 1.5); a.push(cx + g() * 14, cy + g() * 3, cz + g() * 10); } } return new Float32Array(a); })();

const SH = {
  // ———————— 一、灾区与出发 ————————
  s01: { update(t) { // 航拍大远景：线条从城中心向外“生长”，扫描环扫过废墟
    const T = T0.s01 + t; const k = smoother(t / 5);
    setCam(vl([236, 98, 176], [206, 86, 150], k), vl([-30, 0, -40], [-22, 4, -34], k), 40);
    const R = lerp(-30, 560, smooth(range(t, 0.2, 4.4)));
    setReveal((x, y, z) => { const u = (R - Math.hypot(x, z + 6)) / 50; return { p: clamp(u), g: u > -0.2 ? 1.8 * Math.exp(-u * u * 3) : 0, a: clamp(u * 4 + 0.15) }; });
    drawCity(T, { ground: smooth(range(t, 0.0, 2.2)), pts: smooth(range(t, 0.8, 3.2)) });
    setReveal(null);
    if (R > 1 && R < 540) poly(ring([0, 0.4, -6], R, [0, 1, 0], 180), { stroke: '#9fe8ff', width: 2.2, alpha: 0.8 * (1 - smooth(range(t, 3.4, 4.4))), glow: 1.5, fade: false, depthBias: 1e4 });
    POST.fade = 1 - smooth(t / 1.3);
  } },
  s02: { transIn: { type: 'dissolve', dur: 0.8 }, update(t) { // 被截断的公路：救援车队被塌方堵住，警灯闪烁
    const T = T0.s02 + t; const sh = shake(t, 0.015, 1, 4);
    setCam([368 - t * 0.5 + sh.x, 6.0 + sh.y, 15.5], [306, 1.5, -1], 36); FOG.start = 40; FOG.end = 520;
    drawCity(T); drawVehicles(T, 1);
    drawHuman({ pos: [318.5, 0, 3.6], heading: -1.75, phase: 0, run: 0, vest: PAL.orange, helmet: '#fff' });
    drawHuman({ pos: [316.8, 0, -1.8], heading: -1.4, phase: T * 7, run: 0.25, vest: PAL.orange, helmet: '#fff', armsUp: true });
    drawHuman({ pos: [322, 0, 0.8], heading: -1.6, phase: 1, run: 0, vest: PAL.orange, helmet: '#fff' });
  } },
  s03: { transIn: { type: 'dissolve', dur: 0.6 }, update(t) { // 瓦砾缝隙里亮着的手机：“妈妈 来电”
    const T = T0.s03 + t; const k = smoother(t / 4); const sh = shake(t, 0.004, 1.5, 7);
    cam.near = 0.004; setCam(add(vl([0.4, 0.32, 0.52], [0.15, 0.15, 0.2], k), [sh.x, sh.y, sh.z]), [0.02, 0.01, 0.02], 38);
    FOG.start = 1.0; FOG.end = 6;
    drawCrevice(T);
    POST.bgTint = '#0a1824'; POST.vignette = 0.8;
  } },
  s04: { transIn: { type: 'wipe', dur: 0.8 }, update(t) { // 远眺高地：基站亮灯、开舱
    const T = T0.s04 + t; const D = CITY.dock; const sh = shake(t, 0.01, 0.8, 9);
    setCam([300 + sh.x, 24 + sh.y, -70], [D[0], D[1] + 1.4, D[2]], 4.2); FOG.start = 150; FOG.end = 1500;
    const lift = liftT(T); const df = drawDock(D, openT(T), lift, T, lightT(T));
    const top = df([0, dockTop(lift) + 0.62, 0]);
    combined(top, DOCK.ry, 0, 0, { angle: 0, speed: 0 }, T, 1.2 * lightT(T));
    drawCity(T);
  } },
  s05: { update(t) { // 平台升起，旋翼启动，结合体起飞
    const T = T0.s05 + t; const lift = liftT(T); const rise = easeIn(range(t, 2.2, 4.0)) * 9;
    setCam(dockAt(7.2, -3.0, 0.6), dockAt(0, 0, 1.9 + rise * 0.6), 44); FOG.start = 30; FOG.end = 700;
    const df = drawDock(CITY.dock, openT(T), lift, T, 1);
    const top = df([0, dockTop(lift) + 0.62, 0]);
    combined([top[0], top[1] + rise, top[2]], DOCK.ry + rise * 0.02, rise * 0.01, 0, rotorSpin(T, { t0: T0.s05 + 0.3, spinUp: 1.8 }), T);
    downwash([top[0], top[1] - 0.62, top[2]], T, range(t, 1.5, 2.4) * (1 - range(rise, 3, 8)), 0.6);
    drawCity(T);
  } },
  s06: { transIn: { type: 'dissolve', dur: 0.4 }, update(t) { // 低空飞越塌方路段与救援车队，飞入烟尘
    const T = T0.s06 + t; const P = [378 - t * 13, 26 - t * 0.6, -7 + t * 0.6]; const sh = shake(t, 0.06, 1.1, 3);
    setCam(add(P, [9.5 + sh.x, 4.0 + sh.y, 8.5]), add(P, [-18, -14, -4]), 48); FOG.start = 50; FOG.end = 700;
    combined(P, -Math.PI / 2, 0.2, 0.03 * Math.sin(t), rotorSpin(T, { t0: T0.s05 + 0.3, spinUp: 1.8 }), T);
    drawCity(T); drawVehicles(T, 1);
    POST.fadeColor = '#162533'; POST.fade = smooth(range(t, 4.1, 5.0)) * 0.94;
  } },
  // ———————— 二、抵达与搜寻 ————————
  s07: { update(t) { // 结合体从烟尘中飞出，降落在广场
    const T = T0.s07 + t; const a = smoother(range(t, 0, 2.7)), b = smoother(range(t, 2.6, 4.0));
    const P = vl([22, 13, -6], [LAND[0], 2.4, LAND[2]], a); P[1] = lerp(P[1], 0.62, b);
    const sh = shake(t, 0.03, 1.2, 5);
    setCam([-5.5 + sh.x, 0.9 + sh.y, 12.5], vl([14, 8.5, -2], [0, 1.2, 6.5], smoother(range(t, 0, 3.0))), 42); FOG.start = 12; FOG.end = 220;
    const hd0 = Math.atan2(-22, 12.5);
    combined(P, lerp(hd0, -Math.PI, smooth(range(t, 1.2, 3.6))), (1 - a) * 0.22 - b * 0.05, 0, rotorSpin(T, { t0: 0 }), T);
    downwash([P[0], 0, P[2]], T, range(4.5 - P[1], 0, 3));
    groundGrid([LAND[0], 0, LAND[2]], 40, 1, 0.45);
    drawCity(T);
    POST.fadeColor = '#162533'; POST.fade = (1 - smooth(t / 1.1)) * 0.94;
  } },
  s08: { update(t) { // 落地：六足机器人展开六腿站起，锁扣松开
    const T = T0.s08 + t; const P = [LAND[0], 0.62, LAND[2]];
    setCam([1.0, 0.15, 5.15], [0, 0.27, 6.5], 44); FOG.start = 8; FOG.end = 90;
    const rs = rotorSpin(T, { t0: 0, t1: T0.s08 + 0.2, spinDown: 3 }); const rot = { angle: rs.angle, speed: Math.max(0.35, rs.speed) };
    const unfold = smooth(range(t, 0.2, 1.7)), latch = smooth(range(t, 1.7, 2.3));
    const body = { x: LAND[0], z: LAND[2], heading: Math.PI }; const feet = standFeet(body);
    const df = drawDrone({ pos: P, heading: Math.PI, rot, t: T, strobe: true, latch: t < 2.3 ? latch : 1, ring: 1.2 + latch * 3 * (1 - range(t, 2.3, 2.8)) });
    if (t < 2.3) drawHexapod({ f: compose(df, [0, HANG_Y, 0]), feet, fold: 1 - unfold, glow: unfold });
    else drawHexapod({ pose: { x: body.x, y: lerp(0.62 + HANG_Y, HEX.standH, smooth(range(t, 2.4, 3.6))), z: body.z, heading: Math.PI }, feet, glow: 1 });
    downwash([P[0], 0, P[2]], T, 0.35);
    groundGrid([LAND[0], 0, LAND[2]], 30, 1, 0.55);
    drawCity(T);
  } },
  s09: { update(t) { // 无人机升空侦察，六足机器人抬头目送
    const T = T0.s09 + t; const rise = easeIn(range(t, 0.3, 4.0)) * 12;
    setCam([1.5, 0.2, 9.4], vl([0, 0.4, 6.3], [0, 0.62 + rise * 0.8, 6.5], smooth(range(t, 0.2, 3))), 54); FOG.start = 10; FOG.end = 160;
    drawDrone({ pos: [LAND[0], 0.62 + rise, LAND[2]], heading: Math.PI, rot: rotorSpin(T, { t0: T0.s09 - 1.6, spinUp: 1.5 }), t: T, strobe: true, latch: 1 - range(t, 0.5, 1.5) });
    const lk = smooth(range(t, 0.6, 2.5)); const body = { x: LAND[0], z: LAND[2], heading: Math.PI };
    drawHexapod({ pose: { x: body.x, y: HEX.standH, z: body.z, heading: Math.PI, pitch: -0.22 * lk }, feet: standFeet(body), glow: 1 });
    downwash([LAND[0], 0, LAND[2]], T, 1 - range(rise, 1, 6));
    groundGrid([LAND[0], 0, LAND[2]], 40, 1, 0.5);
    drawCity(T);
  } },
  s10: { transIn: { type: 'scan', dur: 0.5 }, update(t) { // 无人机视角：测绘扫描带扫过废墟，标出可疑区域并给六足机器人规划路线
    const T = T0.s10 + t; const P = vl([-3, 22, 12], [3, 24, -2], t / 4);
    setCam(P, [P[0] + 0.5, 0, P[2] - 4], 55, [0, 0, -1]); FOG.start = 30; FOG.end = 420;
    const zs = lerp(26, -22, range(t, 0.2, 3.4));
    setReveal((x, y, z) => ({ g: 1.6 * Math.exp(-(((z - zs) / 3.5) ** 2)) }));
    drawCity(T);
    setReveal(null);
    custom(-1, (L, G) => { const a = project([P[0] - 30, 0, zs]), b = project([P[0] + 30, 0, zs]); if (!a || !b) return; L.strokeStyle = '#9fe8ff'; L.lineWidth = 2; L.globalAlpha = 0.8 * (1 - range(t, 3.2, 3.5)); L.beginPath(); L.moveTo(a.x, a.y); L.lineTo(b.x, b.y); L.stroke(); G.strokeStyle = '#57cfff'; G.lineWidth = 6; G.globalAlpha = 0.6 * (1 - range(t, 3.2, 3.5)); G.beginPath(); G.moveTo(a.x / 2, a.y / 2); G.lineTo(b.x / 2, b.y / 2); G.stroke(); });
    const body = { x: LAND[0], z: LAND[2], heading: Math.PI };
    drawHexapod({ pose: { x: body.x, y: HEX.standH, z: body.z, heading: Math.PI }, feet: standFeet(body), glow: 1 });
    const zk = smooth(range(t, 1.6, 2.2)); // 可疑区域
    if (zk > 0) poly(ring([VICTIM[0], 0.1, VICTIM[2]], 2.6 * (1.6 - 0.6 * zk), [0, 1, 0], 48), { stroke: PAL.amber, width: 2.2, alpha: zk, glow: zk, glowColor: PAL.amber, dash: [10, 8], fade: false, depthBias: -1 });
    routeLine(ROUTE, T, smooth(range(t, 2.2, 3.4)));
    reconHUD(hud, t, { heading: 330 + t * 6, alt: P[1], spd: 5.4, k: range(t, 0, 0.9) });
    // 目标标签
    const hp = project([body.x, 0.2, body.z]), vp = project([VICTIM[0], 0, VICTIM[2]]);
    hud.save(); hud.font = `24px ${FONT}`; hud.textBaseline = 'middle';
    if (hp) { hud.globalAlpha = smooth(range(t, 0.8, 1.2)); brackets(hud, hp.x - 34, hp.y - 34, 68, 68, 14, '#7fe3ff', 2.5); hud.fillStyle = '#cfefff'; hud.fillText('六足机器人 · 在线', hp.x + 46, hp.y); }
    if (vp && zk > 0) { hud.globalAlpha = zk; hud.fillStyle = PAL.amber; hud.fillText('疑似生命信号 · 区域 A', vp.x + 70, vp.y - 40); hud.font = `20px ${MONO}`; hud.fillText('规划路径 9.2 m', vp.x + 70, vp.y - 8); }
    hud.restore();
    POST.bgTint = '#07202c';
  } },
  s11: { transIn: { type: 'scan', dur: 0.5 }, update(t) { // 六足机器人沿规划路线在碎石间前行（贴地跟拍）
    const T = T0.s11 + t; const b = walkBody(T); const feet = gaitFeet(T, walkBody, { freq: 2.0, lift: 0.07 });
    const sh = shake(t, 0.008, 2, 11); const sk = 1 - smooth(range(t, 3.8, 5)); const c = searchCam(T);
    setCam(add(c.p, [sh.x * sk, sh.y * sk, 0]), c.look, c.f); FOG.start = 8; FOG.end = 90;
    drawHexapod({ pose: { x: b.x, y: HEX.standH + 0.008 * Math.sin(T * 4 * Math.PI * 2), z: b.z, heading: Math.PI, roll: 0.02 * Math.sin(T * 2 * Math.PI * 2) }, feet, glow: 1 });
    routeLine(ROUTE, T, 1, 0.8);
    groundGrid([b.x, 0, b.z], 30, 1, 0.5);
    drawCity(T);
  } },
  s12: { update(t) { // 停下，展开生命探测模块，蓝色扫描波纹扩散
    const T = T0.s12 + t; const b = walkBody(T); const feet = gaitFeet(T, walkBody, { freq: 2.0, lift: 0.07 });
    const c = searchCam(T); setCam(c.p, c.look, c.f); FOG.start = 8; FOG.end = 90;
    const dep = smooth(range(t, 1.0, 2.2));
    const hf = drawHexapod({ pose: { x: b.x, y: HEX.standH, z: b.z, heading: Math.PI }, feet, scanner: dep, glow: 1 });
    scanRings([REST.x, 0.03, REST.z - 0.5], T, { radius: 3.6, alpha: smooth(range(t, 1.8, 2.6)) });
    scanFan(hf([0, 0.1, 0.32]), [0.03, -0.25, -1], 4.8, 0.45, T, smooth(range(t, 2.0, 2.8)));
    routeLine(ROUTE, T, 1, 0.8 * (1 - smooth(range(t, 1.0, 2.0))));
    groundGrid([REST.x, 0, REST.z], 30, 1, 0.5);
    drawCity(T);
  } },
  s13: { update(t) { // 越过机器人推向瓦砾：废墟变透明，显出被困者热源、生命体征
    const T = T0.s13 + t; const v = spline(K_SEARCH, T); camV(v); FOG.start = 8; FOG.end = 90;
    const hf = drawHexapod({ pose: restPose(), feet: restFeet(), scanner: 1, glow: 1 });
    scanRings([REST.x, 0.03, REST.z - 0.5], T, { radius: 3.6 });
    scanFan(hf([0, 0.1, 0.32]), [0.03, -0.25, -1], 4.8, 0.45, T, 1);
    const xk = smooth(range(t, 0.1, 1.0)), found = smooth(range(t, 0.6, 1.4));
    drawCity(T, { xray: { x: VICTIM[0], z: VICTIM[2], r: 6, k: xk } });
    drawVictim(VICTIM, 0.3, xk, T);
    groundGrid([REST.x, 0, REST.z], 30, 1, 0.5);
    const vb = victimBox(VICTIM, 0.3);
    if (vb) detectHUD(hud, T, { box: vb, found, k: range(t, 0, 0.8) });
    POST.bgTint = '#0b2030';
  } },
  s14: { update(t) { // 镜头升起转为上帝视角并不断抬高：各处红点陆续亮起，最后成为大屏上的态势图
    const T = T0.s14 + t; const c = godRise(t);
    setCamYPR(c.p, c.yaw, c.pitch, 0, c.fov); fogFor(c.p[1]);
    const hf = drawHexapod({ pose: restPose(), feet: restFeet(), scanner: 1, glow: 1 });
    scanRings([REST.x, 0.03, REST.z - 0.5], T, { radius: 3.6, alpha: 1 - smooth(range(t, 1.5, 3)) });
    scanFan(hf([0, 0.1, 0.32]), [0.03, -0.25, -1], 4.8, 0.45, T, 1 - smooth(range(t, 0.3, 1.6)));
    groundGrid([REST.x, 0, REST.z], 30, 1, 0.5 * (1 - smooth(range(t, 0.5, 2.5))));
    hoverDrone(T);
    POST.bgTint = mixHex('#0b2030', PAL.bg1, smooth(range(t, 0, 2.5)));
    drawCity(T, { xray: { x: VICTIM[0], z: VICTIM[2], r: 6, k: 1 - smooth(range(t, 0.8, 2.8)) } });
    drawVictim(VICTIM, 0.3, 1 - smooth(range(t, 1.5, 3.5)), T);
    const uiA = smooth(range(t, 4.9, 5.9)), bk = 1 - smooth(range(t, 4.9, 5.8));
    const ds = (i) => (i === 0 ? 1 : clamp((t - DOT_T[i]) / 0.25));
    CITY.survivors.forEach(([x, z], i) => { if (ds(i) > 0) survivorBeacon(x, z, T, i, ds(i) * bk * (i === 0 ? smooth(range(t, 3.6, 4.6)) : 1), 26, 6); });
    const vb = victimBox(VICTIM, 0.3);
    if (vb && t < 1.2) detectHUD(hud, T, { box: vb, found: 1, k: 1, alpha: 1 - smooth(range(t, 0.2, 1.1)) });
    drawScreenContent(hud, V1, T, { ...UI_DETECT, alpha: uiA }, ds, { dotPos: dotProj, devices: uiA, devP: { hex: project(DEVICES.hex), drone: project(DEVICES.drone) }, scan: uiA, dotsA: smooth(range(t, 0.6, 1.6)) });
  } },
  // ———————— 三、指挥屏幕与结合返航 ————————
  s15: { update(t) { // 指挥大厅：从大屏后拉，8 个红点就是刚才的侦测结果
    const T = T0.s15 + t;
    drawCommand(room15(t), T, UI_DETECT, () => 1, { devices: 1, glare: smooth(range(t, 0.3, 1.5)) });
  } },
  s16: { update(t) { // 推回大屏，界面淡去，态势图变回真实的上帝视角，选中六足机器人
    const T = T0.s16 + t;
    if (t < 1.6) { drawCommand(room16(t), T, UI_DETECT, () => 1, { devices: 1, hexSel: smooth(range(t, 0.8, 1.6)), glare: 1 - smooth(range(t, 0.4, 1.3)) }); return; }
    const h = god16(t); setGodCam(h);
    drawGod(T); fogFor(h);
    const uiA = 1 - smooth(range(t, 1.7, 2.5));
    drawScreenContent(hud, V1, T, { ...UI_DETECT, alpha: uiA }, () => 1, { dotPos: dotProj, devices: 0, scan: uiA });
    const hp = project(DEVICES.hex), dp = project(DEVICES.drone);
    if (hp) drawDevice(hud, hp.x, hp.y, 'hex', T, 1, 1);
    if (dp) drawDevice(hud, dp.x, dp.y, 'drone', T, uiA);
  } },
  s17: { update(t) { // GTA 切换角色式：分三段急速下降，落到六足机器人身边；无人机飞回悬停
    const T = T0.s17 + t; const c = gtaCam(t);
    setCamYPR(c.p, c.yaw, c.pitch, 0, c.fov); fogFor(Math.max(c.h * (1 - smooth(range(t, 2.1, 3.5))), 1.5));
    const dk = smoother(range(t, 1.2, 3.8)); const from = DEVICES.drone; const hd0 = Math.atan2(HOVER[0] - from[0], HOVER[2] - from[2]);
    drawDrone({ pos: vl(from, HOVER, dk), heading: lerp(hd0, Math.PI + 2 * Math.PI * Math.round((hd0 - Math.PI) / (2 * Math.PI)), smooth(range(t, 2.6, 3.8))), pitch: 0.15 * (1 - smooth(range(t, 3, 3.8))), rot: rotorSpin(T, { t0: 0 }), t: T, strobe: true });
    drawHexapod({ pose: restPose(), feet: restFeet(), scanner: 1 - smooth(range(t, 2.8, 3.8)), glow: 1 });
    downwash([REST.x, 0, REST.z], T, smooth(range(t, 3.0, 3.8)) * 0.7);
    if (c.h < 30) groundGrid([REST.x, 0, REST.z], 30, 1, 0.5 * smooth(range(t, 1.8, 2.6)));
    drawCity(T);
    const da = 1 - smooth(range(t, 0.1, 0.6));
    drawScreenContent(hud, V1, T, null, () => 1, { dotPos: dotProj, dotsA: da, scan: 0 });
    const hp = project(DEVICES.hex); if (hp) drawDevice(hud, hp.x, hp.y, 'hex', T, 1 - smooth(range(t, 0.9, 1.6)), 1);
    POST.zoom = c.blur * 0.9;
  } },
  s18: { update(t) { // 无人机落到六足机器人上方，锁扣扣合，收腿
    const T = T0.s18 + t; setCam(CAM18.p, CAM18.look, CAM18.f); FOG.start = 8; FOG.end = 90;
    const feet = restFeet(); const tall = 0.40, dockY = tall - HANG_Y;
    const P = [REST.x, lerp(HOVER[1], dockY, smoother(range(t, 0, 2.0))) + smooth(range(t, 3.3, 4.0)) * 0.35, REST.z];
    const latch = 1 - smooth(range(t, 1.9, 2.3));
    const df = drawDrone({ pos: P, heading: Math.PI, rot: rotorSpin(T, { t0: 0 }), t: T, strobe: true, latch, ring: 1.2 + 3 * Math.sin(Math.PI * range(t, 2.0, 2.6)) });
    if (t < 2.0) drawHexapod({ pose: restPose({ y: lerp(HEX.standH, tall, smooth(range(t, 0.5, 1.8))) }), feet, glow: 1 });
    else drawHexapod({ f: compose(df, [0, HANG_Y, 0]), feet, fold: smooth(range(t, 2.4, 3.5)), glow: 1 });
    downwash([REST.x, 0, REST.z], T, 0.7);
    groundGrid([REST.x, 0, REST.z], 30, 1, 0.5);
    drawCity(T);
  } },
  s19: { update(t) { // 结合体升空，离开废墟
    const T = T0.s19 + t; const up = easeIn(range(t, 0, 2.2)) * 6, away = easeIn(range(t, 1.6, 4.0));
    const y0 = 0.40 - HANG_Y + 0.35; const P = [REST.x + away * 26, y0 + up + away * 22, REST.z - away * 10];
    setCam([-1.9, 0.35, 4.6], vl([REST.x, 1.2, REST.z], P, 0.85), 50); FOG.start = 10; FOG.end = 200;
    combined(P, Math.PI + away * 1.6, away * 0.25, -away * 0.15, rotorSpin(T, { t0: 0 }), T);
    downwash([REST.x, 0, REST.z], T, 1 - range(up, 1, 5));
    groundGrid([REST.x, 0, REST.z], 40, 1, 0.5);
    drawCity(T);
  } },
  // ———————— 四、救援出发与返回基站 ————————
  s20: { transIn: { type: 'wipe', dur: 0.8 }, update(t) { // 机场：救援队员奔向直升机，直升机起飞
    const T = T0.s20 + t; const lift = easeIn(range(t, 1.9, 4.0)), fwd = easeIn(range(t, 3.0, 4.0));
    setCam([-17, 1.7, 14], [0, 3 + lift * 3, 0], 40); FOG.start = 40; FOG.end = 420;
    drawAirport(T);
    drawHeli({ pos: [fwd * 6, 1.5 + lift * 7, 0], heading: Math.PI / 2, pitch: 0.1 * fwd, rotor: T * 30, speed: 1, t: T, search: true });
    for (let i = 0; i < 4; i++) { const k = clamp((t - i * 0.15) / 1.6); if (k >= 1) continue; drawHuman({ pos: [lerp(-11 - i * 1.4, -1.0, k), 0, lerp(7 + i * 0.8, 1.4, k)], heading: Math.atan2(10, -5.6), phase: T * 9 + i, run: 1, vest: PAL.orange, helmet: '#fff' }); }
  } },
  s21: { update(t) { // 空中：直升机与结合体擦肩而过，交汇处放慢
    const T = T0.s21 + t;
    const tauAt = (tt) => { let a = 0; const n = Math.round(tt * 96); for (let i = 0; i < n; i++) a += (1 - 0.65 * Math.exp(-((((i + 0.5) / 96 - 2.5) / 0.75) ** 2))) / 96; return a; };
    const tau = tauAt(t), tc = tauAt(2.5);
    setCam([690, 100, 121], [651, 98.5, 120], 30); FOG.start = 100; FOG.end = 1300;
    drawCity(T);
    points(CLOUDS, { color: '#b8d8ee', alpha: 0.35, size: 2, sizeByDepth: true });
    drawHeli({ pos: [640, 96, 120 + (tau - tc) * 16], heading: 0, pitch: 0.12, rotor: tau * 30, speed: 1, t: tau, search: true });
    combined([662, 101.2, 120 - (tau - tc) * 9.5], Math.PI, 0.18, 0, rotorSpin(tau + 100, { t0: 0 }), tau);
  } },
  s22: { transIn: { type: 'wipe', dur: 0.8 }, update(t) { // 结合体降落在基站平台上，平台开始下降
    const T = T0.s22 + t; const k = smoother(range(t, 0, 2.8)); const lift = 1 - smooth(range(t, 3.0, 4.0)) * 0.4;
    setCam(dockAt(6.5, 3.2, 2.2), dockAt(0, 0, 1.6 + (1 - k) * 2), 40); FOG.start = 30; FOG.end = 700;
    const df = drawDock(CITY.dock, 1, lift, T, 1); const top = df([0, dockTop(lift) + 0.62, 0]);
    const P = vl(add(top, [-4, 7, 3]), top, k);
    combined(P, DOCK.ry + (1 - k) * 0.5, (1 - k) * 0.15, 0, rotorSpin(T, { t0: 0, t1: T0.s22 + 2.9, spinDown: 1.5 }), T);
    downwash([top[0], top[1] - 0.62, top[2]], T, range(5 - (P[1] - top[1]), 0, 3) * (1 - range(t, 2.9, 3.4)), 0.6);
    drawCity(T);
  } },
  s23: { update(t) { // 舱盖合拢，充电指示灯亮起
    const T = T0.s23 + t; const k = smoother(t / 5); const lift = 0.6 * (1 - smooth(range(t, 0, 1.8)));
    setCam(dockAt(lerp(6.0, 4.8, k), lerp(-2.6, -1.8, k), 1.3), dockAt(0, 0, 1.1), 40); FOG.start = 30; FOG.end = 700;
    const df = drawDock(CITY.dock, 1 - smooth(range(t, 1.4, 4.0)), lift, T, 1); const top = df([0, dockTop(lift) + 0.62, 0]);
    combined(top, DOCK.ry, 0, 0, { angle: 0, speed: 0 }, T, 1.2);
    const ch = smooth(range(t, 3.4, 4.0)); // 充电指示：五格电量依次点亮
    for (let q = 0; q < 5; q++) { const on = ch * (((T * 1.4) % 1) * 5 > q || q < 2 ? 1 : 0.2); const a = df([-0.5 + q * 0.25, 1.3, DOCK.d / 2 + 0.012]), b = df([-0.32 + q * 0.25, 1.3, DOCK.d / 2 + 0.012]); polyline([a, b], { stroke: PAL.green, width: 6, alpha: 0.25 + 0.75 * on, glow: on * 1.2, glowColor: PAL.green, cap: 'butt', fade: false }); }
    drawCity(T);
    POST.fade = smooth(range(t, 4.4, 5.0)) * 0.35;
  } },
  // ———————— 五、红点变绿与片尾 ————————
  s24: { transIn: { type: 'dissolve', dur: 0.8 }, update(t) { // 红点逐个变绿，镜头始终正对最后一个红点缓缓推近
    const T = T0.s24 + t;
    const ds = (i) => (i === LAST ? 1 : 1 + clamp((t - greenAt(i)) / 0.35));
    const saved = CITY.survivors.filter((_, i) => i !== LAST && t > greenAt(i) + 0.2).length;
    drawCommand(zoom24(t), T, { title: '灾区生命探测态势', sub: '救援进行中', count: `已救出：${saved}/8` }, ds, { devices: 0, robots: false });
  } },
  s25: { update(t) { // 推到最后一个红点铺满画面，变绿，成为纯绿
    const T = T0.s25 + t; const turn = smooth(range(t, 3.5, 3.95));
    cam.near = 0.005;
    drawCommand(zoom24(8 + t), T, { title: '灾区生命探测态势', sub: '救援进行中', count: turn > 0.5 ? '已救出：8/8' : '已救出：7/8' }, (i) => (i === LAST ? 1 + turn : 2), { devices: 0, robots: false, glare: 1 - smooth(range(t, 2, 3.5)) });
    POST.flash = 0.16 * Math.sin(Math.PI * range(t, 3.5, 3.85));
    POST.fadeColor = GREEN_END; POST.fade = smooth(range(t, 4.25, 5.0));
    POST.vignette = lerp(0.55, 0.35, smooth(range(t, 3.6, 5.0))); POST.grain = lerp(0.06, 0.03, smooth(range(t, 3.6, 5.0)));
  } },
  s26: { update(t) { // 绿底片尾：项目名称、口号
    POST.bg = false; POST.glow = 0; POST.fadeColor = GREEN_END; POST.fade = 1; POST.vignette = 0.35; POST.grain = 0.03;
    titleCard(hud, t, {});
    const out = smooth(range(t, 8.0, 9.0)); if (out > 0) { hud.save(); hud.globalAlpha = out; hud.fillStyle = '#000'; hud.fillRect(0, 0, W, H); hud.restore(); }
  } },
};

export const SHOTS = DURS.map(([id, dur]) => ({ id, dur, ...SH[id] }));
