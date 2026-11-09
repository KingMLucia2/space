// 第三版镜头表（粒子点阵风格）：28 个镜头共 120 秒。所有动画都用全片绝对时间 T（= 镜头起点 + t）计算，
// 同一地点的相邻镜头共用连续的相机路径（关键帧样条、参数化升降），换地点时用粒子转场或叠化。
import { W, H, PAL, setCam, setCamYPR, setReveal, setDisp, setView, renderPass, mkCanvas, POST, FOG, hud, project, custom, poly, polyline, points, ring, cam, line } from './core.js';
import { drawCity, drawVehicles, CITY, groundGrid } from './models/city.js';
import { drawDrone, drawHexapod, drawDock, rotorSpin, standFeet, gaitFeet, nominalFoot, HEX, HANG_Y, DOCK, dockTop } from './models/robots.js';
import { drawHeli, drawHuman, drawVictim, drawCrevice, victimBox, drawStretcher } from './models/extra.js';
import { drawAirport } from './models/airport.js';
import { drawTracked, drawROV, drawUSV, dockPlate, DOCK_GAP } from './models/payloads.js';
import { SCREEN, FILL_D, GOD, GOD_FOG, setGodCam, dots, LAST, screenView, camForScreen, drawCommand, drawScreenContent, drawDevice, DEVICES, drawGod, hoverDrone } from './models/room.js';
import { detectHUD, titleCard, brackets, drawDot, FONT, MONO, mixHex } from './hud.js';
import { compose, xform } from './prims.js';
import { scanRings, downwash, routeLine, survivorBeacon, scanFan } from './fx.js';
import { clamp, lerp, range, smooth, smoother, easeIn, easeOut, shake, mulberry32 } from './util.js';

const DURS = [['s01', 7], ['s02', 4], ['s03', 3.5], ['s04', 3], ['s05', 4], ['s06', 3], ['s07', 4], ['s08', 3], ['s09', 3.5], ['s10', 2.5], ['s11', 4], ['s12', 4], ['s13', 3.5], ['s14', 3],
  ['s15', 6], ['s16', 5], ['s17', 3], ['s18', 4], ['s19', 3.5], ['s20', 3], ['s21', 4], ['s22', 5], ['s23', 6.4], ['s24', 3.5], ['s25', 4], ['s26', 8], ['s27', 5], ['s28', 8], ['s29', 26], ['s30', 6]]; // s30：片尾封面镜头
export const T0 = {}; { let a = 0; for (const [id, d] of DURS) { T0[id] = a; a += d; } }

// —— 向量与相机工具 ——
const vl = (a, b, k) => [lerp(a[0], b[0], k), lerp(a[1], b[1], k), lerp(a[2], b[2], k)];
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const sc = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
const lerpLog = (a, b, k) => Math.exp(lerp(Math.log(a), Math.log(b), k));
const hash3 = (x, y, z) => { const s = Math.sin(x * 12.9898 + y * 78.233 + z * 37.719) * 43758.5453; return s - Math.floor(s); };
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
const WALK0 = T0.s12 - 1.0; // 六足机器人在激光扫描镜头末尾起步
function walkBody(T) { // 行走路线：先匀速前行 5 秒，再 1.2 秒减速停在被困者前方
  const tau = T - WALK0;
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
const lightT = (T) => smooth(range(T, T0.s04 + 0.3, T0.s04 + 0.7)), openT = (T) => smooth(range(T, T0.s04 + 0.7, T0.s04 + 2.9)), liftT = (T) => smooth(range(T, T0.s06, T0.s06 + 1.4));
// 片尾绿
const GREEN_END = '#14aa68';
const UI_DETECT = { title: '灾区生命探测态势', sub: '空地协同 · 实时回传', count: '侦测完成：8 人' };
const V1 = { s: 1, x0: 0, y0: 0 };

// —— s12~s15：行走 → 停下扫描 → 越过机器人推向被困者 → 升起成上帝视角（一镜到底） ——
const S12_OFF = [1.5, 0.32, 0.5], S13_OFF = [0.08, 0.95, 1.9];
function searchCam(T) {
  const b = walkBody(T);
  if (T < T0.s13) return { p: [b.x + S12_OFF[0], S12_OFF[1], b.z + S12_OFF[2]], look: [b.x, 0.14, b.z - 0.2], f: 40 };
  const u = smoother(range(T, T0.s13, T0.s14));
  const th0 = Math.atan2(S12_OFF[2], S12_OFF[0]), th1 = Math.atan2(S13_OFF[2], S13_OFF[0]), r0 = Math.hypot(S12_OFF[0], S12_OFF[2]), r1 = Math.hypot(S13_OFF[0], S13_OFF[2]);
  const th = lerp(th0, th1, u), r = lerp(r0, r1, u);
  return { p: [b.x + Math.cos(th) * r, lerp(S12_OFF[1], S13_OFF[1], u), b.z + Math.sin(th) * r], look: [b.x, lerp(0.14, 0.2, u), b.z + lerp(-0.2, -0.5, u)], f: 40 };
}
const S14_START = searchCam(T0.s14);
const K_SEARCH = mkKeys([
  { T: T0.s14, p: S14_START.p, look: S14_START.look, f: 40 },
  { T: T0.s14 + 2.2, p: [0.5, 1.55, -0.95], look: [0.5, 0.0, -3.0], f: 40 },
  { T: T0.s15, p: [0.5, 1.6, -1.2], look: [0.5, 0.0, -3.0], f: 40 },
]);
const S15 = (() => { const v = K_SEARCH[K_SEARCH.length - 1].v; return { p: v.slice(0, 3), yaw: v[3], pitch: v[4], fov: v[5] }; })();
function godRise(t) {
  const u = clamp(t / 6); const h = lerpLog(S15.p[1], GOD.pos[1], u * u);
  const pk = smooth(range(t, 0, 3.6)); const pitch = lerp(S15.pitch, -Math.PI / 2, pk); const yaw = lerp(S15.yaw, 0, pk);
  const G = vl([VICTIM[0], 0, VICTIM[2]], [GOD.pos[0], 0, GOD.pos[2]], smooth(range(t, 0.5, 5.6)));
  const off = h * Math.cos(pitch) / Math.max(1e-6, -Math.sin(pitch));
  return { p: [G[0] + Math.sin(yaw) * off, h, G[2] + Math.cos(yaw) * off], yaw, pitch, fov: lerp(S15.fov, GOD.fov, smooth(range(t, 0, 4))) };
}
const DOT_T = [0, 5.02, 5.14, 5.26, 5.38, 5.5, 5.62, 5.74]; // s15 内各点出现时刻
// —— s16/s17：大厅 ——
function room16(t) {
  const lnd = Math.log(FILL_D) + 0.6 * (1 - Math.exp(-t / 0.33)) + 0.25 * smooth(t / 5); const k = smooth(range(t, 0, 4.5));
  return [0.5 * k, SCREEN.y - 0.4 * k, SCREEN.z + Math.exp(lnd)];
}
const R16E = room16(5);
function room17(t) { const k = smoother(range(t, 0, 1.6)); return [lerp(R16E[0], 0, k), lerp(R16E[1], SCREEN.y, k), SCREEN.z + lerpLog(R16E[2] - SCREEN.z, FILL_D, k)]; }
const god17 = (t) => lerp(GOD.pos[1], 365, smooth(range(t, 1.8, 3.0)));
// —— s18：分三段下降，落到六足机器人身边（GTA 式切换） ——
const CAM19 = { p: [2.55, 0.85, 2.55], look: [REST.x, 0.7, REST.z], f: 38 };
const C19 = (() => { const d = [CAM19.look[0] - CAM19.p[0], CAM19.look[1] - CAM19.p[1], CAM19.look[2] - CAM19.p[2]]; const r = Math.hypot(...d); return { r, yaw: Math.atan2(-d[0], -d[2]), phi: Math.asin(-d[1] / r) }; })();
function gtaCam(t) {
  let h = 365; h = lerpLog(h, 140, smoother(range(t, 0.1, 0.55))); h = lerpLog(h, 48, smoother(range(t, 0.85, 1.3))); h = lerpLog(h, 6.7, smoother(range(t, 1.6, 2.3)));
  const gk = smoother(range(t, 0.05, 0.6)); const tk = smoother(range(t, 2.1, 3.5));
  const tgt = vl([lerp(GOD.pos[0], REST.x, gk), 0, lerp(GOD.pos[2], REST.z, gk)], CAM19.look, tk);
  const r = lerpLog(h, C19.r, tk), th = lerp(0, C19.yaw, smooth(tk)), phi = lerp(Math.PI / 2, C19.phi, tk);
  const p = [tgt[0] + r * Math.sin(th) * Math.cos(phi), tgt[1] + r * Math.sin(phi), tgt[2] + r * Math.cos(th) * Math.cos(phi)];
  const blur = Math.max(...[[0.1, 0.55], [0.85, 1.3], [1.6, 2.3]].map(([a, b]) => Math.sin(Math.PI * range(t, a, b))));
  return { p, yaw: th, pitch: -phi, fov: lerp(GOD.fov, CAM19.f, tk), blur, h };
}
const HOVER = [REST.x, 2.8, REST.z];
// —— s26/s27：推向最后一个红点 ——
const CP26 = [-0.6, 2.4, SCREEN.z + 16.0], SFIN = 130;
const GREEN_ORDER = [6, 4, 3, 2, 1, 5]; // 0 号被困者已在绞车救援镜头里救出
const greenAt = (i) => (i === 0 ? -10 : (GREEN_ORDER.indexOf(i) < 0 ? 1e9 : 0.9 + GREEN_ORDER.indexOf(i) * 1.0));
function zoom26(tau) {
  const v0 = screenView(CP26); const D7 = dots()[LAST]; const X0 = v0.x0 + v0.s * D7[0], Y0 = v0.y0 + v0.s * D7[1];
  const u = clamp(tau / 12.2); const s = Math.exp(Math.log(v0.s) + (Math.log(SFIN) - Math.log(v0.s)) * u * u * u); const k = smooth(clamp(tau / 9));
  return camForScreen(D7[0], D7[1], s, lerp(X0, W / 2, k), lerp(Y0, H / 2, k));
}
// 被困者点在当前相机下的屏幕位置
const dotProj = (i) => { const [x, z] = CITY.survivors[i]; const p = project([x, 0, z]); return p ? [p.x, p.y] : null; };
// 空中镜头的云团
const CLOUDS = (() => { const R = mulberry32(88); const a = []; for (let c = 0; c < 18; c++) { const cx = 120 + R() * 520, cy = 80 + R() * 40, cz = -60 + R() * 160; for (let i = 0; i < 160; i++) { const g = () => (R() + R() + R() - 1.5); a.push(cx + g() * 16, cy + g() * 3, cz + g() * 12); } } return new Float32Array(a); })();
// 空气中漂浮的粒子：相机周围一个会循环平移的盒子，粒子固定在世界坐标里
const AMB = (() => { const R = mulberry32(31); const a = new Float32Array(900 * 3); for (let i = 0; i < a.length; i++) a[i] = R(); return a; })();
function ambient(T, size = 30, alpha = 0.5, color = '#9fdcff') {
  const cp = cam.position, B = [size, size * 0.5, size]; const out = new Float32Array(AMB.length);
  for (let i = 0; i < AMB.length; i += 3) for (let k = 0; k < 3; k++) { const c = [cp.x, cp.y, cp.z][k]; const drift = k === 1 ? T * 0.15 * size / 30 : T * 0.05 * size / 30; const v = AMB[i + k] * B[k] + drift; out[i + k] = c + (((v - c) % B[k]) + B[k] * 1.5) % B[k] - B[k] / 2; }
  points(out, { color, alpha, size: 1.6, sizeByDepth: true, minSize: 1.0, depthBias: -0.5 });
}
// 粒子流：沿二次贝塞尔弧从 a 流向 b
function stream(a, b, lift, T, n = 46, alpha = 1, color = '#9ff0ff', speed = 0.55) {
  if (alpha <= 0.01) return; const m = [(a[0] + b[0]) / 2, Math.max(a[1], b[1]) + lift, (a[2] + b[2]) / 2]; const arr = [];
  for (let k = 0; k < n; k++) { const u = ((k / n + T * speed) % 1); const q = (1 - u) * (1 - u), r = 2 * u * (1 - u), s = u * u; arr.push(q * a[0] + r * m[0] + s * b[0], q * a[1] + r * m[1] + s * b[1], q * a[2] + r * m[2] + s * b[2]); }
  points(new Float32Array(arr), { color, alpha, size: 3, glow: 1.6 * alpha, glowColor: '#57cfff', fade: false, depthBias: -3 });
}
// 标注：锚点＋折线引线＋文字
function label(h, p, text, dx, dy, a) {
  if (!p || a <= 0.01) return; h.save(); h.globalAlpha = a; h.strokeStyle = '#9fe8ff'; h.fillStyle = '#9fe8ff'; h.lineWidth = 1.6;
  const ex = p.x + dx, ey = p.y + dy, tx = ex + (dx > 0 ? 70 : -70);
  h.beginPath(); h.arc(p.x, p.y, 4, 0, 7); h.fill(); h.beginPath(); h.moveTo(p.x, p.y); h.lineTo(ex, ey); h.lineTo(tx, ey); h.stroke();
  h.font = `500 26px ${FONT}`; h.textBaseline = 'bottom'; h.textAlign = dx > 0 ? 'left' : 'right'; h.fillStyle = '#eaf6ff'; h.fillText(text, tx + (dx > 0 ? -60 : 60), ey - 6);
  h.restore();
}


// —— 片尾字幕：左侧滚动字幕，右侧全息面板演示“通用接口”：不同轴数的无人机两两对接不同载荷；背景是动态灾区 ——
let CREDITS = null; // 名单从本地文件读取（不提交）
async function loadCredits() {
  try { const r = await fetch('/v2/credits.local.json'); if (r.ok) CREDITS = await r.json(); } catch (e) { /* 没有本地名单时用占位 */ }
  if (!CREDITS) CREDITS = { lines: [['导演', '—'], ['编剧', '—'], ['美术设计', '—'], ['程序开发', '—'], ['配乐', '—']], closing: '上天入地，不放弃每一个生命' };
  const txt = CREDITS.lines.flat().join('') + (CREDITS.closing || '') + '制作人员通用对接接口模块化载荷四轴六轴八轴无人机履带机器人潜水机器人无人船六足接口锁定';
  await Promise.all(['400', '500', '700'].map((w) => document.fonts.load(`${w} 40px "Noto Sans SC"`, txt))).catch(() => null);
}
const CR_BG = mkCanvas(W, H).getContext('2d'), CR_FG = mkCanvas(W, H).getContext('2d');
const PAIRS = [[6, 'hex'], [4, 'track'], [8, 'usv'], [6, 'rov'], [4, 'hex'], [8, 'track']];
const PNAME = { 4: '四轴无人机', 6: '六轴无人机', 8: '八轴无人机' }, QNAME = { hex: '六足机器人', track: '履带机器人', rov: '潜水机器人', usv: '无人船' };
const PANEL_L = [70, 150, 690, 780], PANEL_R = [1010, 150, 840, 780];
function drawPayload(kind, pos, yaw, T, glow) {
  if (kind === 'track') return drawTracked({ pos, heading: yaw, phase: T * 0.3, glow });
  if (kind === 'rov') return drawROV({ pos, heading: yaw, t: T, glow });
  if (kind === 'usv') return drawUSV({ pos, heading: yaw, t: T, glow });
  const pose = { x: pos[0], y: pos[1] + HEX.standH, z: pos[2], heading: yaw }; const ft = standFeet(pose).map((q) => [q[0], pos[1], q[2]]);
  const f = drawHexapod({ pose, feet: ft, glow: 1 }); return { f, plate: dockPlate(f, 0.112, glow) };
}
// 模块化对接演示（在 CR_FG 里渲染，再贴进右侧面板）：每对 4 秒——显形、下降对准、锁定、整体升起、消散
function modularDemo(T, tt) {
  const n = Math.min(PAIRS.length - 1, Math.max(0, Math.floor(tt / 4))); const u = tt - n * 4; const [arms, kind] = PAIRS[n];
  const a = 0.9 + T * 0.12; setCam([4.3 * Math.sin(a), 1.9, 4.3 * Math.cos(a)], [0, 0.82, 0], 34); FOG.start = 5; FOG.end = 16;
  setView(0.62, PANEL_R[0] + PANEL_R[2] / 2 - 0.62 * W / 2, PANEL_R[1] + PANEL_R[3] / 2 - 0.62 * H / 2 + 20, 0.8);
  for (const r of [0.5, 0.9, 1.3, 1.7]) poly(ring([0, 0, 0], r, [0, 1, 0], 96), { stroke: '#57cfff', width: 1.4, alpha: r === 1.7 ? 0.95 : 0.5, glow: r === 1.7 ? 1 : 0.3, depthBias: 1e3 });
  for (let q = 0; q < 24; q++) { const th = q / 24 * 6.283; polyline([[Math.cos(th) * 0.5, 0, Math.sin(th) * 0.5], [Math.cos(th) * 1.7, 0, Math.sin(th) * 1.7]], { stroke: '#2f86b8', width: 1, alpha: 0.4, depthBias: 1e3 }); }
  const vis = smooth(range(u, 0, 0.6)) * (1 - smooth(range(u, 3.35, 3.95))); if (vis <= 0.01) return { n, u, lock: 0 };
  setReveal(() => ({ a: vis, g: 2.2 * (1 - vis) }));
  const yaw = 0.3 + T * 0.35; const lift = smooth(range(u, 2.05, 3.0)) * 0.5; const desc = smoother(range(u, 0.55, 1.8)); const lock = smooth(range(u, 1.8, 2.0));
  const glow = smooth(range(u, 0.7, 1.2)) * (1 - 0.6 * lock) + Math.exp(-(((u - 1.9) / 0.12) ** 2)) * 2;
  const pl = drawPayload(kind, [0, lift, 0], yaw, T, glow);
  const dy = pl.plate[1] + DOCK_GAP; const P = [pl.plate[0], dy + (1 - desc) * 1.25, pl.plate[2]];
  drawDrone({ pos: P, heading: yaw, rot: rotorSpin(T, { t0: 0 }), t: T, strobe: true, arms, gear: 1 - smooth(range(u, 0.6, 1.3)), latch: 1 - lock, ring: 1.2 + 2.5 * glow });
  if (desc < 1) polyline([[P[0], P[1] - 0.2, P[2]], pl.plate], { stroke: '#9fe8ff', width: 1.6, alpha: 0.8 * smooth(range(u, 0.7, 1.0)), glow: 0.8, dash: [6, 6], fade: false });
  const fl = Math.exp(-(((u - 1.9) / 0.1) ** 2)); if (fl > 0.02) poly(ring(pl.plate, 0.2 + (u - 1.8) * 2.2, [0, 1, 0], 48), { stroke: '#ffffff', width: 2.4, alpha: fl, glow: 2 * fl, fade: false });
  setReveal(null);
  const sw = []; if (vis < 1) for (let i = 0; i < 160; i++) { const h = hash3(i, n, 3), r = 0.3 + 1.6 * h * (1 - vis), th = i * 2.4 + T; sw.push(Math.cos(th) * r, 0.2 + hash3(i, 2, n) * 1.6, Math.sin(th) * r); }
  if (sw.length) points(new Float32Array(sw), { color: '#9ff0ff', alpha: 0.8 * (1 - vis), size: 2.2, glow: 1, fade: false });
  return { n, u, lock, vis };
}
const CREDITS_SHOT = { prepare: loadCredits, update(t) { // 片尾：绿色片名碎成粒子散开，露出灾区；左侧滚动字幕，右侧模块化对接演示
  const T = T0.s29 + t;
  // 背景：环绕灾区缓慢航拍，所有被困者位置亮起绿色标记（已全部救出）
  renderPass(() => { const a = 0.4 + t * 0.022; setCam([260 * Math.sin(a), 150 - t * 1.2, 260 * Math.cos(a)], [0, 0, -10], 40); FOG.start = 80; FOG.end = 1000; drawCity(T);
    CITY.survivors.forEach(([x, z], i) => { poly(ring([x, 0.5, z], 5 + 3 * ((T * 0.6 + i * 0.3) % 1), [0, 1, 0], 32), { stroke: PAL.green, width: 2, alpha: 0.9 * (1 - ((T * 0.6 + i * 0.3) % 1)), glow: 1.2, fade: false, dots: false }); polyline([[x, 0.5, z], [x, 20, z]], { stroke: PAL.green, width: 2, alpha: 0.8, glow: 1.2, fade: false, dots: false }); }); }, CR_BG);
  const demo = { n: 0, u: 0, lock: 0 }; const tt = t - 2.0;
  if (tt > -0.5) renderPass(() => Object.assign(demo, modularDemo(T, Math.max(0, tt))), CR_FG); else CR_FG.clearRect(0, 0, W, H);
  setCam([0, 1, 5], [0, 1, 0], 40);
  const g = smooth(range(t, 0.15, 1.9)); // 绿底散开进度
  const pin = smooth(range(t, 1.2, 2.1)); // 面板出现
  custom(1e6, (L) => { L.filter = 'blur(2.5px) brightness(0.5) saturate(0.85)'; L.drawImage(CR_BG.canvas, 0, 0); L.filter = 'none';
    if (g < 1) { const cs = 40; for (let y = 0; y < H; y += cs) for (let x = 0; x < W; x += cs) { const h = hash3(x, y, 7); const d0 = 0.15 + 1.0 * h + 0.45 * Math.hypot(x - W / 2, y - H / 2) / 1100; const q = clamp((t - d0) / 0.6); if (q >= 1) continue;
      const z = cs * (1 - q * q) + 1; L.globalAlpha = 1 - q * 0.6; L.fillStyle = q > 0 ? '#2ee6a0' : GREEN_END; L.fillRect(x + cs / 2 - z / 2 + (h - 0.5) * 80 * q, y + cs / 2 - z / 2 - 140 * q * q * (0.5 + h), z, z); } L.globalAlpha = 1; }
    for (const [x, y, w, h] of [PANEL_L, PANEL_R]) { L.globalAlpha = pin; L.fillStyle = 'rgba(2,10,18,0.74)'; L.beginPath(); L.roundRect(x, y, w, h, 16); L.fill(); L.globalAlpha = 1; }
    L.save(); L.beginPath(); L.roundRect(PANEL_R[0], PANEL_R[1], PANEL_R[2], PANEL_R[3], 16); L.clip(); L.globalAlpha = pin; L.drawImage(CR_FG.canvas, 0, 0); L.restore(); });
  // 面板边框、标题、字幕（界面层）
  const h = hud; h.save();
  for (const [x, y, w, ht] of [PANEL_L, PANEL_R]) { h.globalAlpha = pin; h.strokeStyle = 'rgba(110,210,255,0.55)'; h.lineWidth = 1.5; h.beginPath(); h.roundRect(x, y, w, ht, 16); h.stroke(); brackets(h, x - 8, y - 8, w + 16, ht + 16, 34, 'rgba(160,230,255,0.9)', 3); }
  h.globalAlpha = pin; h.font = `500 26px ${FONT}`; h.fillStyle = '#9fe8ff'; h.textAlign = 'left'; h.textBaseline = 'middle'; h.fillText('通用对接接口 · 模块化载荷', PANEL_R[0] + 32, PANEL_R[1] + 40);
  const [arms, kind] = PAIRS[demo.n]; const la = smooth(range(demo.u, 0.4, 0.9)) * (1 - smooth(range(demo.u, 3.4, 3.9))) * pin;
  h.globalAlpha = la; h.font = `bold 34px ${FONT}`; h.fillStyle = '#eaf6ff'; h.textAlign = 'center'; h.fillText(`${PNAME[arms]}  ×  ${QNAME[kind]}`, PANEL_R[0] + PANEL_R[2] / 2, PANEL_R[1] + PANEL_R[3] - 70);
  h.globalAlpha = la * demo.lock; h.font = `24px ${FONT}`; h.fillStyle = PAL.green; h.fillText('● 接口锁定', PANEL_R[0] + PANEL_R[2] / 2, PANEL_R[1] + PANEL_R[3] - 30);
  // 片名从画面中央移到左侧面板顶部
  const m = smooth(range(t, 0.5, 1.9)); const tx = lerp(W / 2, PANEL_L[0] + 40, m), ty = lerp(H / 2 - 120, PANEL_L[1] + 70, m);
  h.globalAlpha = 1; h.shadowColor = 'rgba(0,50,25,0.35)'; h.shadowBlur = 24 * (1 - m); h.fillStyle = '#ffffff'; h.textAlign = m > 0.5 ? 'left' : 'center'; h.textBaseline = 'middle';
  h.font = `bold ${lerp(150, 64, m)}px ${FONT}`; h.fillText('六合', m > 0.5 ? tx : W / 2 + (tx - W / 2), ty);
  h.font = `500 ${lerp(46, 26, m)}px ${FONT}`; h.fillText('空地协同生命搜救系统', m > 0.5 ? tx : W / 2 + (tx - W / 2), lerp(H / 2 - 10, PANEL_L[1] + 125, m));
  h.shadowBlur = 0; h.globalAlpha = 1 - smooth(range(t, 0.2, 0.8)); h.textAlign = 'center'; h.font = `500 54px ${FONT}`; h.fillText('上天入地，不放弃每一个生命', W / 2, H / 2 + 120);
  h.globalAlpha = 1 - smooth(range(t, 0.2, 0.8)); h.fillStyle = 'rgba(255,255,255,0.8)'; h.fillRect(W / 2 - 160, H / 2 + 52, 320, 3);
  // 滚动字幕
  h.globalAlpha = pin; h.fillStyle = 'rgba(110,210,255,0.5)'; h.fillRect(PANEL_L[0] + 40, PANEL_L[1] + 160, PANEL_L[2] - 80, 2);
  h.font = `500 26px ${FONT}`; h.fillStyle = '#9fe8ff'; h.textAlign = 'left'; h.fillText('制作人员', PANEL_L[0] + 40, PANEL_L[1] + 200);
  const top = PANEL_L[1] + 230, bot = PANEL_L[1] + PANEL_L[3] - 20; const lines = CREDITS ? CREDITS.lines : []; const lh = 70;
  const offEnd = (top + bot) / 2 - (lines.length * lh + 70); const off = lerp(bot + 10, offEnd, smooth(clamp((t - 2.3) / 19.5)) * 0.15 + clamp((t - 2.3) / 19.5) * 0.85);
  h.save(); h.beginPath(); h.rect(PANEL_L[0], top, PANEL_L[2], bot - top); h.clip();
  lines.forEach(([role, name], i) => { const y = off + i * lh; if (y < top - 40 || y > bot + 40) return; const fe = clamp((y - top) / 60) * clamp((bot - y) / 60);
    h.globalAlpha = pin * fe; h.font = `400 28px ${FONT}`; h.fillStyle = '#8fd8ff'; h.textAlign = 'left'; h.fillText(role, PANEL_L[0] + 60, y);
    h.font = `500 34px ${FONT}`; h.fillStyle = '#ffffff'; h.textAlign = 'right'; h.fillText(name, PANEL_L[0] + PANEL_L[2] - 60, y); });
  const yc = off + lines.length * lh + 70; const fe = clamp((yc - top) / 60) * clamp((bot - yc) / 60);
  if (CREDITS && CREDITS.closing) { h.globalAlpha = pin * fe; h.font = `500 32px ${FONT}`; h.fillStyle = PAL.green; h.textAlign = 'center'; h.fillText(CREDITS.closing, PANEL_L[0] + PANEL_L[2] / 2, yc); }
  h.restore(); h.restore();
  POST.vignette = lerp(0.35, 0.5, pin); POST.grain = 0.04;
  const out = smooth(range(t, 24.8, 26)); if (out > 0) { hud.save(); hud.globalAlpha = out; hud.fillStyle = '#000'; hud.fillRect(0, 0, W, H); hud.restore(); }
} };

// —— 封面（不进成片时间线）：低机位，六足机器人站在废墟前，无人机悬停在上方、对接光束相连；背景是虚化的灾区和被困者红点；左侧片名 ——
const COVER_TXT = '六合空地协同生命搜救系统上天入地，不放弃每一个生命六轴无人机六足机器人';
export const COVER_VIEW = { yaw: 0.62, pitch: 0.1, fov: 38, ch: 0.42, hx: 0.85, hz: 3.3, dz: 2.0, hover: 1.3, fog: [25, 520], face: [-0.75, 0.66], dyaw: 0.2, beacons: false, beacon: 45, bh: 12, warm: 0.35, embers: 28, marks: [[1010, 640, 2, 1.1], [1735, 598, 4, 0.18]] };
const COV_BG = mkCanvas(W, H).getContext('2d');
function coverLabel(h, p, zh, en, dx, dy, a = 1) { // 中英双语标注：锚点＋折线引线＋文字
  if (!p || a <= 0.01) return; h.save(); h.globalAlpha = a; h.strokeStyle = 'rgba(159,232,255,0.85)'; h.fillStyle = '#9fe8ff'; h.lineWidth = 1.5;
  const ex = p.x + dx, ey = p.y + dy, tx = ex + (dx > 0 ? 165 : -165);
  h.beginPath(); h.arc(p.x, p.y, 4, 0, 7); h.fill(); h.beginPath(); h.arc(p.x, p.y, 9, 0, 7); h.globalAlpha = 0.5 * a; h.stroke(); h.globalAlpha = a;
  h.beginPath(); h.moveTo(p.x, p.y); h.lineTo(ex, ey); h.lineTo(tx, ey); h.stroke();
  h.textAlign = dx > 0 ? 'right' : 'left'; const x = tx; // 文字对齐引线外端，避开斜线
  h.textBaseline = 'bottom'; h.font = `500 27px ${FONT}`; h.fillStyle = '#eaf6ff'; h.fillText(zh, x, ey - 8);
  h.textBaseline = 'top'; h.font = `500 14px ${MONO}`; h.letterSpacing = '3px'; h.fillStyle = '#7fd6ff'; h.fillText(en, x, ey + 8); h.letterSpacing = '0px';
  h.restore();
}
const COVER_PREP = () => Promise.all(['300', '400', '500', '700', '900'].map((w) => document.fonts.load(`${w} 40px "Noto Sans SC"`, COVER_TXT))).catch(() => null);
// film=true 时是片尾封面镜头 s30：从黑场淡入，镜头极缓地推近，片名与标注依次淡入，最后一秒淡黑（时间点与第四版 s30 一致，配乐共用）
function coverDraw(t, film) {
  const T = 140 + t; // 烟柱、火光取充分发展后的状态
  const V = COVER_VIEW, yaw = V.yaw, pitch = V.pitch;
  const right = [Math.cos(yaw), 0, -Math.sin(yaw)], fh = [-Math.sin(yaw), 0, -Math.cos(yaw)]; // 相机的右方、水平前方
  const camDir = (cx, cz) => Math.atan2(right[0] * cx - fh[0] * cz, right[2] * cx - fh[2] * cz); // 相机坐标里的水平方向（cz>0 朝向镜头）→ 世界航向
  // 六足机器人在相机右前方 hz 米处；无人机在同一条视线上再远 dz 米、悬停在它上方，画面上对接光束竖直
  const HX = [REST.x, 0, REST.z]; const C = [HX[0] - right[0] * V.hx - fh[0] * V.hz, V.ch, HX[2] - right[2] * V.hx - fh[2] * V.hz];
  const kD = (V.hz + V.dz) / V.hz; const D = [C[0] + (HX[0] - C[0]) * kD, HEX.standH - HANG_Y + V.hover, C[2] + (HX[2] - C[2]) * kD];
  const push = film ? 0.22 * smoother(clamp(t / 6)) : 0, Cv = [C[0] + fh[0] * push, C[1], C[2] + fh[2] * push]; // 片尾镜头里机位极缓地向前推
  const view = () => { setCamYPR(Cv, yaw, pitch, 0, V.fov); FOG.start = V.fog[0]; FOG.end = V.fog[1]; };
  // 背景（灾区，可选远处的红色生命信标）单独渲染后轻微虚化，形成景深，让前景设备更突出
  renderPass(() => { view(); drawCity(T); if (V.beacons) CITY.survivors.forEach(([x, z], i) => { if (Math.hypot(x - C[0], z - C[2]) > V.beacon) survivorBeacon(x, z, T, i, 1, V.bh, 6); }); }, COV_BG);
  view();
  custom(2e6, (L) => { const g = L.createRadialGradient(1380, 690, 20, 1380, 690, 900); g.addColorStop(0, `rgba(255,120,50,${V.warm})`); g.addColorStop(0.5, `rgba(255,90,40,${V.warm * 0.35})`); g.addColorStop(1, 'rgba(255,90,40,0)'); L.save(); L.translate(0, 690); L.scale(1, 0.26); L.translate(0, -690); L.fillStyle = g; L.fillRect(0, 0, W, H * 3); L.restore(); });
  custom(1e6, (L) => { L.filter = 'blur(1.3px) brightness(0.82)'; L.drawImage(COV_BG.canvas, 0, 0); L.filter = 'none'; });
  // 六足机器人站在废墟前，探测面板展开；无人机悬停在正上方，对接光束相连
  const hh = camDir(V.face[0], V.face[1]);
  const pose = { x: HX[0], y: HEX.standH, z: HX[2], heading: hh };
  const hf = drawHexapod({ pose, feet: standFeet(pose), scanner: 1, glow: 1 });
  const df = drawDrone({ pos: D, heading: hh + V.dyaw, pitch: 0.03, roll: -0.03, rot: rotorSpin(T, { t0: 0 }), t: 120.03, strobe: true, ring: 2.4, latch: 1 });
  const plate = hf([0, 0.12, 0]), belly = df([0, -0.2, 0]);
  polyline([belly, plate], { stroke: '#9fe8ff', width: 1.8, alpha: 0.9, glow: 1.2, dash: [7, 7], fade: false });
  { const pb = project(belly), pl = project(hf([-0.26, 0.12, 0])), pr = project(hf([0.26, 0.12, 0])), pc = project(plate); // 对接引导光锥（屏幕空间，叠加发光）
    if (pb && pl && pr && pc) custom((pb.d + pc.d) / 2, (L) => { const xs = [pl.x, pr.x], x0 = Math.min(...xs), x1 = Math.max(...xs); const g = L.createLinearGradient(0, pb.y, 0, pc.y); g.addColorStop(0, 'rgba(120,220,255,0.02)'); g.addColorStop(1, 'rgba(120,220,255,0.16)');
      L.globalCompositeOperation = 'lighter'; L.fillStyle = g; L.beginPath(); L.moveTo(pb.x - 6, pb.y); L.lineTo(pb.x + 6, pb.y); L.lineTo(x1, pc.y); L.ellipse(pc.x, pc.y, (x1 - x0) / 2, (x1 - x0) * 0.12, 0, 0, Math.PI); L.lineTo(x0, pc.y); L.closePath(); L.fill(); }); }
  stream(belly, plate, 0, T, 16, 0.9, '#c8f6ff', 0.8);
  scanRings([plate[0], plate[1] + 0.01, plate[2]], T, { radius: 0.5, alpha: 0.9, n: 2 });
  downwash([HX[0], 0, HX[2]], T, 0.6, 1.0);
  groundGrid([HX[0], 0, HX[2]], 12, 0.5, 0.35);
  if (V.embers) { const up = [Math.sin(yaw) * Math.sin(pitch), Math.cos(pitch), Math.cos(yaw) * Math.sin(pitch)], e = []; // 飘在空中的火星
    for (let i = 0; i < V.embers; i++) { const cz = 2.5 + 12 * hash3(i, 1, 5), cx = (0.05 + 0.6 * hash3(i, 2, 5)) * cz * 0.75, cy = (hash3(i, 3, 5) - 0.35) * cz * 0.55; for (let k = 0; k < 3; k++) e.push(C[k] + right[k] * cx + fh[k] * cz + up[k] * cy); }
    points(new Float32Array(e), { color: '#ffc38a', alpha: 0.8, size: 2.6, glow: 2.2, glowColor: '#ff6a1a', fade: false, sizeByDepth: true, minSize: 1.4 }); }
  POST.vignette = 0; POST.grain = 0.04;
  // 暗角与左侧压暗（画在界面层底下，文字不受影响）
  const h = hud; h.save();
  const vg = h.createRadialGradient(W * 0.64, H * 0.5, H * 0.3, W * 0.55, H * 0.5, H * 1.05); vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,0,0.62)'); h.fillStyle = vg; h.fillRect(0, 0, W, H);
  const g = h.createLinearGradient(0, 0, 1100, 0); g.addColorStop(0, 'rgba(1,6,12,0.75)'); g.addColorStop(0.55, 'rgba(1,6,12,0.35)'); g.addColorStop(1, 'rgba(1,6,12,0)'); h.fillStyle = g; h.fillRect(0, 0, 1100, H);
  const ta = film ? smooth(range(t, 0.6, 1.6)) : 1, la = film ? smooth(range(t, 1.6, 2.3)) : 1; h.globalAlpha = ta;
  brackets(h, 48, 48, W - 96, H - 96, 46, 'rgba(140,220,255,0.45)', 2);
  for (const [x, y, i, tp] of V.marks || []) { h.save(); h.globalAlpha = ta; h.strokeStyle = 'rgba(255,90,70,0.6)'; h.lineWidth = 1.5; h.setLineDash([3, 4]); h.beginPath(); h.moveTo(x, y + 16); h.lineTo(x, y + 56); h.stroke(); h.restore(); drawDot(h, x, y, 1, tp, i - 1, ta, 11); } // 废墟里的被困者红点（与片中指挥大屏一致）
  // 片名
  const x0 = 140; h.textAlign = 'left'; h.textBaseline = 'alphabetic';
  h.font = `500 19px ${MONO}`; h.letterSpacing = '4px'; h.fillStyle = '#7fd6ff'; h.fillText('AIR-GROUND SEARCH & RESCUE SYSTEM', x0, 322); h.letterSpacing = '0px';
  h.shadowColor = 'rgba(87,207,255,0.5)'; h.shadowBlur = 36; h.fillStyle = '#ffffff';
  h.font = `900 236px ${FONT}`; h.fillText('六合', x0 - 14, 548);
  h.shadowBlur = 16; h.font = `500 56px ${FONT}`; h.fillText('空地协同生命搜救系统', x0, 640);
  h.shadowBlur = 0; h.fillStyle = PAL.orange; h.fillRect(x0, 680, 120, 5);
  h.font = `300 44px ${FONT}`; h.fillStyle = 'rgba(234,246,255,0.95)'; h.fillText('上天入地，不放弃每一个生命', x0, 756);
  // 设备标注
  if (V.labels !== false) { coverLabel(h, project(df([-0.75, 0.05, 0.75])), '六轴无人机', 'HEXACOPTER', -80, -64, la); coverLabel(h, project(hf([0.2, 0.0, -0.18])), '六足机器人', 'HEXAPOD ROBOT', 150, 64, la); }
  h.globalAlpha = 1;
  if (film) { const bk = Math.max(1 - smooth(range(t, 0, 1.0)), smooth(range(t, 5.0, 6.0))); if (bk > 0) { h.globalAlpha = bk; h.fillStyle = '#000'; h.fillRect(0, 0, W, H); h.globalAlpha = 1; } } // 黑场淡入淡出（画在界面层最上面，片名一起变黑）
  h.restore();
}
const COVER_SHOT = { extra: true, prepare: COVER_PREP, update(t) { coverDraw(t, false); } };
const SH = {
  // ———————— 一、灾区与出发 ————————
  s01: { update(t) { // 粒子从四面八方汇聚成城市 → 地震波从震中扩散 → 楼体坍塌、扬尘、起火
    const T = T0.s01 + t; const k = smoother(t / 7); const TQ = 3.5, V = 150, Qx = -40, Qz = -60;
    const qk = smooth(range(t, TQ - 0.1, TQ + 0.15)) * (1 - smooth(range(t, TQ + 1.2, TQ + 3.2))); const sh = shake(t, 1.3 * qk, 3.2, 2);
    setCam(add(vl([270, 175, 250], [196, 78, 150], k), [sh.x, sh.y, sh.z]), vl([-25, 0, -35], [-18, 4, -28], k), 40); FOG.start = 80; FOG.end = 1000;
    const quake = (x, z) => { const ta = TQ + Math.hypot(x - Qx, z - Qz) / V + hash3(x, 0, z) * 0.25; const tau = t - ta; return { c: clamp(tau / 1.3), tau }; };
    const delayAt = (x, z) => 0.2 + 1.9 * clamp(Math.hypot(x, z + 20) / 330);
    setDisp((x, y, z) => {
      const h = hash3(x, y, z); const u = clamp((t - delayAt(x, z) - 0.45 * h) / 1.1); if (u <= 0) return [0, 0, 0, 0];
      const m = Math.pow(1 - u, 3) * (50 + 90 * h); const a = hash3(z, x, y) * 6.283; let dy = m * (hash3(y, z, x) - 0.3) * 1.2;
      if (t > TQ && y < 1.5) { const r = Math.hypot(x - Qx, z - Qz), R = (t - TQ) * V; dy += 3.2 * Math.exp(-(((r - R) / 16) ** 2)) * (1 - clamp((t - TQ) / 3)); }
      return [m * Math.cos(a), dy, m * Math.sin(a), 1];
    });
    setReveal((x, y, z) => ({ f: smooth(clamp((t - delayAt(x, z) - 0.9) / 0.8)) }));
    drawCity(T, { quake, ground: smooth(range(t, 0.4, 2.6)) });
    setReveal(null);
    if (t > TQ) { const R = (t - TQ) * V; const a = 1 - smooth(range(t, TQ + 1.6, TQ + 2.8)); for (const [dr, w] of [[0, 1], [-14, 0.5]]) if (R + dr > 1) poly(ring([Qx, 0.5, Qz], R + dr, [0, 1, 0], 220), { stroke: '#bff2ff', width: 2.2, alpha: 0.85 * a * w, glow: 1.6 * a * w, fade: false, depthBias: 5e3 }); }
    POST.fade = 1 - smooth(t / 0.8); POST.flash = 0.18 * Math.exp(-(((t - TQ) / 0.12) ** 2));
  } },
  s02: { transIn: { type: 'particles', dur: 0.8 }, update(t) { // 被截断的公路：救援车队被塌方堵住，警灯闪烁
    const T = T0.s02 + t; const sh = shake(t, 0.015, 1, 4);
    setCam([368 - t * 0.5 + sh.x, 6.0 + sh.y, 15.5], [306, 1.5, -1], 36); FOG.start = 40; FOG.end = 380;
    drawCity(T); drawVehicles(T, 1); ambient(T, 40, 0.35, '#c3d3df');
    drawHuman({ pos: [318.5, 0, 3.6], heading: -1.75, phase: 0, run: 0, vest: PAL.orange, helmet: '#fff' });
    drawHuman({ pos: [316.8, 0, -1.8], heading: -1.4, phase: T * 7, run: 0.25, vest: PAL.orange, helmet: '#fff', armsUp: true });
    drawHuman({ pos: [322, 0, 0.8], heading: -1.6, phase: 1, run: 0, vest: PAL.orange, helmet: '#fff' });
  } },
  s03: { transIn: { type: 'dissolve', dur: 0.6 }, update(t) { // 瓦砾缝隙里亮着的手机：“妈妈 来电”
    const T = T0.s03 + t; const k = smoother(t / 3.5); const sh = shake(t, 0.004, 1.5, 7);
    cam.near = 0.004; setCam(add(vl([0.4, 0.32, 0.52], [0.15, 0.15, 0.2], k), [sh.x, sh.y, sh.z]), [0.02, 0.01, 0.02], 38); FOG.start = 1.0; FOG.end = 6;
    drawCrevice(T); ambient(T, 1.6, 0.35, '#ffd9a8');
    POST.bgTint = '#0a1824'; POST.vignette = 0.8;
  } },
  s04: { transIn: { type: 'particles', dur: 0.7 }, update(t) { // 远眺高地：基站亮灯、开舱
    const T = T0.s04 + t; const D = CITY.dock; const sh = shake(t, 0.01, 0.8, 9);
    setCam([300 + sh.x, 24 + sh.y, -70], [D[0], D[1] + 1.4, D[2]], 4.2); FOG.start = 150; FOG.end = 1500;
    const lift = 0; const df = drawDock(D, openT(T), lift, T, lightT(T));
    combined(df([0, dockTop(lift) + 0.62, 0]), DOCK.ry, 0, 0, { angle: 0, speed: 0 }, T, 1.2 * lightT(T));
    drawCity(T);
  } },
  s05: { transIn: { type: 'particles', dur: 0.6 }, update(t) { // 全息展示：结合体拆开成爆炸图，再“合为一体”
    const T = T0.s05 + t; const a = 0.75 - t * 0.09;
    setCam([4.7 * Math.sin(a), 1.95 + 0.12 * t, 4.7 * Math.cos(a)], [0, 0.82, 0], 36); FOG.start = 5; FOG.end = 16;
    const ex = smooth(range(t, 0.35, 1.5)) * (1 - easeIn(range(t, 2.55, 3.25)));
    for (const r of [0.5, 0.9, 1.3, 1.7]) poly(ring([0, 0, 0], r, [0, 1, 0], 96), { stroke: '#57cfff', width: 1.4, alpha: r === 1.7 ? 0.95 : 0.55, glow: r === 1.7 ? 1 : 0.3, depthBias: 1e3 });
    for (let q = 0; q < 24; q++) { const th = q / 24 * 6.283; polyline([[Math.cos(th) * 0.5, 0, Math.sin(th) * 0.5], [Math.cos(th) * 1.7, 0, Math.sin(th) * 1.7]], { stroke: '#2f86b8', width: 1, alpha: 0.45, depthBias: 1e3 }); }
    const col = []; for (let i = 0; i < 600; i++) { const th = hash3(i, 1, 2) * 6.283, rr = 1.55 + 0.15 * hash3(i, 3, 4); const y = ((hash3(i, 5, 6) * 3 + t * 0.4) % 3); col.push(Math.cos(th) * rr, y, Math.sin(th) * rr); }
    points(new Float32Array(col), { color: '#7fe3ff', alpha: 0.45, size: 2, glow: 0.4 });
    const yaw = 0.4 + t * 0.5, hover = 1.25 + 0.03 * Math.sin(t * 2);
    const df = drawDrone({ pos: [0, hover, 0], heading: yaw, rot: { angle: T * 3, speed: 0.1 }, t: T, strobe: true, explode: ex, ring: 1.5 });
    const hfr = compose(df, [0, HANG_Y - 0.42 * ex, 0]);
    const feet = [0, 1, 2, 3, 4, 5].map((i) => { const nf = nominalFoot(i); return hfr([nf[0], -HEX.standH, nf[2]]); });
    drawHexapod({ f: hfr, feet, fold: 1 - 0.85 * ex, scanner: ex, glow: 1, explode: ex });
    const snap = Math.exp(-(((t - 3.28) / 0.1) ** 2));
    if (snap > 0.01) { poly(ring([0, hover - 0.3, 0], 0.4 + Math.max(0, t - 3.1) * 3, [0, 1, 0], 64), { stroke: '#ffffff', width: 2.5, alpha: snap, glow: 2 * snap, fade: false }); POST.flash = 0.22 * snap; }
    const la = smooth((ex - 0.55) / 0.3);
    label(hud, project(df([0, 0.27 + 0.16 * ex, 0])), '六轴无人机', -150, -120, la);
    label(hud, project(df([Math.sin(Math.PI / 2) * (1.12 + 0.3 * ex), 0.15 + 0.35 * ex, 0])), '六组旋翼', 120, -90, la);
    label(hud, project(df([0, -0.2 - 0.12 * ex, 0.13])), '对接锁扣', 190, 30, la);
    label(hud, project(hfr([0, 0.02, 0])), '六足机器人', -190, 90, la);
    label(hud, project(hfr([0, 0.08 + 0.04 * ex, 0.25 + 0.16 * ex])), '生命探测雷达', 170, 110, la);
    POST.bgTint = '#0a2236';
  } },
  s06: { transIn: { type: 'dissolve', dur: 0.4 }, update(t) { // 平台升起，旋翼启动，结合体起飞
    const T = T0.s06 + t; const lift = liftT(T); const rise = easeIn(range(t, 1.4, 3.0)) * 7;
    setCam(dockAt(7.2, -3.0, 0.6), dockAt(0, 0, 1.9 + rise * 0.6), 44); FOG.start = 30; FOG.end = 700;
    const df = drawDock(CITY.dock, 1, lift, T, 1);
    const top = df([0, dockTop(lift) + 0.62, 0]);
    combined([top[0], top[1] + rise, top[2]], DOCK.ry + rise * 0.02, rise * 0.01, 0, rotorSpin(T, { t0: T0.s06 + 0.15, spinUp: 1.2 }), T);
    downwash([top[0], top[1] - 0.62, top[2]], T, range(t, 0.9, 1.5) * (1 - range(rise, 3, 7)), 0.6);
    drawCity(T); ambient(T, 20, 0.3);
  } },
  s07: { transIn: { type: 'dissolve', dur: 0.4 }, update(t) { // 低空飞越塌方路段与救援车队，飞入烟尘
    const T = T0.s07 + t; const P = [378 - t * 14, 26 - t * 0.6, -7 + t * 0.6]; const sh = shake(t, 0.06, 1.1, 3);
    setCam(add(P, [9.5 + sh.x, 4.0 + sh.y, 8.5]), add(P, [-18, -14, -4]), 48); FOG.start = 50; FOG.end = 700;
    combined(P, -Math.PI / 2, 0.2, 0.03 * Math.sin(t), rotorSpin(T, { t0: T0.s06 + 0.15, spinUp: 1.2 }), T);
    drawCity(T); drawVehicles(T, 1); ambient(T, 60, 0.3);
    POST.fadeColor = '#162533'; POST.fade = smooth(range(t, 3.2, 4.0)) * 0.94;
  } },
  // ———————— 二、抵达与搜寻 ————————
  s08: { update(t) { // 结合体从烟尘中飞出，降落在广场
    const T = T0.s08 + t; const a = smoother(range(t, 0, 2.0)), b = smoother(range(t, 1.9, 3.0));
    const P = vl([22, 13, -6], [LAND[0], 2.4, LAND[2]], a); P[1] = lerp(P[1], 0.62, b);
    const sh = shake(t, 0.03, 1.2, 5);
    setCam([-5.5 + sh.x, 0.9 + sh.y, 12.5], vl([14, 8.5, -2], [0, 1.2, 6.5], smoother(range(t, 0, 2.3))), 42); FOG.start = 12; FOG.end = 220;
    combined(P, lerp(Math.atan2(-22, 12.5), -Math.PI, smooth(range(t, 0.9, 2.7))), (1 - a) * 0.22 - b * 0.05, 0, rotorSpin(T, { t0: 0 }), T);
    downwash([P[0], 0, P[2]], T, range(4.5 - P[1], 0, 3));
    groundGrid([LAND[0], 0, LAND[2]], 40, 1, 0.45); drawCity(T); ambient(T, 25, 0.35, '#c3d3df');
    POST.fadeColor = '#162533'; POST.fade = (1 - smooth(t / 0.8)) * 0.94;
  } },
  s09: { update(t) { // 落地：六足机器人展开六腿站起，锁扣松开
    const T = T0.s09 + t; const P = [LAND[0], 0.62, LAND[2]];
    setCam([1.0, 0.15, 5.15], [0, 0.27, 6.5], 44); FOG.start = 8; FOG.end = 90;
    const rs = rotorSpin(T, { t0: 0, t1: T0.s09 + 0.15, spinDown: 2.5 }); const rot = { angle: rs.angle, speed: Math.max(0.35, rs.speed) };
    const unfold = smooth(range(t, 0.15, 1.35)), latch = smooth(range(t, 1.35, 1.85));
    const body = { x: LAND[0], z: LAND[2], heading: Math.PI }; const feet = standFeet(body);
    const df = drawDrone({ pos: P, heading: Math.PI, rot, t: T, strobe: true, latch: t < 1.85 ? latch : 1, ring: 1.2 + latch * 3 * (1 - range(t, 1.85, 2.3)) });
    if (t < 1.85) drawHexapod({ f: compose(df, [0, HANG_Y, 0]), feet, fold: 1 - unfold, glow: unfold });
    else drawHexapod({ pose: { x: body.x, y: lerp(0.62 + HANG_Y, HEX.standH, smooth(range(t, 1.95, 3.0))), z: body.z, heading: Math.PI }, feet, glow: 1 });
    downwash([P[0], 0, P[2]], T, 0.35); groundGrid([LAND[0], 0, LAND[2]], 30, 1, 0.55); drawCity(T); ambient(T, 6, 0.3, '#c3d3df');
  } },
  s10: { update(t) { // 无人机升空侦察，六足机器人抬头目送
    const T = T0.s10 + t; const rise = easeIn(range(t, 0.15, 2.5)) * 10;
    setCam([1.5, 0.2, 9.4], vl([0, 0.4, 6.3], [0, 0.62 + rise * 0.8, 6.5], smooth(range(t, 0.1, 2.0))), 54); FOG.start = 10; FOG.end = 160;
    drawDrone({ pos: [LAND[0], 0.62 + rise, LAND[2]], heading: Math.PI, rot: rotorSpin(T, { t0: T0.s10 - 1.5, spinUp: 1.5 }), t: T, strobe: true, latch: 1 - range(t, 0.3, 1.0) });
    const lk = smooth(range(t, 0.3, 1.6)); const body = { x: LAND[0], z: LAND[2], heading: Math.PI };
    drawHexapod({ pose: { x: body.x, y: HEX.standH, z: body.z, heading: Math.PI, pitch: -0.22 * lk }, feet: standFeet(body), glow: 1 });
    downwash([LAND[0], 0, LAND[2]], T, 1 - range(rise, 1, 6)); groundGrid([LAND[0], 0, LAND[2]], 40, 1, 0.5); drawCity(T); ambient(T, 10, 0.3, '#c3d3df');
  } },
  s11: { update(t) { // 激光雷达扫描：扇形激光扫过废墟，点云在身后成形；标出可疑区域、规划路线
    const T = T0.s11 + t; const u = t / 4; const D = [lerp(-1.5, 1.0, u), lerp(17, 19, u), lerp(13, 1, u)];
    setCam([D[0] + 8, D[1] + 5.5, D[2] + 13], [D[0] - 0.5, 6, D[2] - 9], 46); FOG.start = 25; FOG.end = 260;
    drawDrone({ pos: D, heading: Math.PI, pitch: 0.08, rot: rotorSpin(T, { t0: 0 }), t: T, strobe: true });
    const sw = (t * 0.9) % 1; const zs = D[2] - 2 - 14 * sw, xs = D[0]; const G = [D[0], D[1] - 0.25, D[2] - 0.3];
    const fanA = 0.9 * (1 - smooth(range(t, 3.4, 3.9)));
    poly([G, [xs - 15, 0.1, zs], [xs + 15, 0.1, zs]], { fill: 'rgba(80,200,255,0.07)', stroke: '#7fe3ff', width: 1.2, alpha: 0.5 * fanA, fillAlpha: fanA, fade: false, depthBias: -2, dots: false });
    polyline([[xs - 15, 0.12, zs], [xs + 15, 0.12, zs]], { stroke: '#dffaff', width: 2.2, alpha: fanA, glow: 1.8 * fanA, fade: false, depthBias: -2, dots: false });
    setReveal((x, y, z) => ({ g: 1.4 * fanA * Math.exp(-(((z - zs) / 3) ** 2)) }));
    drawCity(T, { pts: 0.25 }); setReveal(null);
    // 扫过的区域：点云变亮变密（固定世界坐标，无人机身后）
    const front = D[2] - 16; const bright = [];
    for (const p of [[0.5, -9.5, 9.5]]) { const R2 = mulberry32(5); for (let i = 0; i < 5200; i++) { const a = R2() * 6.283, rr = Math.sqrt(R2()) * p[2] * (1 + 0.2 * Math.sin(3 * a + p[0]) + 0.12 * Math.sin(5 * a + p[1])); const x = p[0] + Math.cos(a) * rr, z = p[1] + Math.sin(a) * rr; if (z < front) continue; const hm = 4.2 * 0.8 * Math.max(0, 1 - Math.min(1, rr / p[2]) ** 2) ** 1.3; bright.push(x, hm * (0.7 + 0.5 * R2()), z); } }
    points(new Float32Array(bright), { color: '#bdf3ff', alpha: 0.85, size: 1.8, sizeByDepth: true, minSize: 1.2, glow: 0.5 });
    const b = walkBody(T); const feet = gaitFeet(T, walkBody, { freq: 2.0, lift: 0.07 });
    drawHexapod({ pose: { x: b.x, y: HEX.standH, z: b.z, heading: Math.PI }, feet, glow: 1 });
    const zk = smooth(range(t, 2.0, 2.5));
    if (zk > 0) poly(ring([VICTIM[0], 0.1, VICTIM[2]], 2.6 * (1.6 - 0.6 * zk), [0, 1, 0], 48), { stroke: PAL.amber, width: 2.2, alpha: zk, glow: zk, glowColor: PAL.amber, dash: [10, 8], fade: false, depthBias: -1 });
    routeLine(ROUTE, T, smooth(range(t, 2.4, 3.6)));
    const vp = project([VICTIM[0], 0, VICTIM[2]]), hp = project([b.x, 0.2, b.z]);
    hud.save(); hud.font = `24px ${FONT}`; hud.textBaseline = 'middle';
    if (vp && zk > 0) { hud.globalAlpha = zk; hud.fillStyle = PAL.amber; hud.fillText('疑似生命信号 · 区域 A', vp.x + 60, vp.y - 34); }
    if (hp) { hud.globalAlpha = smooth(range(t, 2.6, 3.0)); hud.fillStyle = '#cfefff'; hud.fillText('规划路径 9.2 m', hp.x + 50, hp.y + 4); }
    hud.restore();
  } },
  s12: { update(t) { // 六足机器人沿规划路线在碎石间前行（贴地跟拍）
    const T = T0.s12 + t; const b = walkBody(T); const feet = gaitFeet(T, walkBody, { freq: 2.0, lift: 0.07 });
    const sh = shake(t, 0.008, 2, 11); const sk = 1 - smooth(range(t, 2.8, 4)); const c = searchCam(T);
    setCam(add(c.p, [sh.x * sk, sh.y * sk, 0]), c.look, c.f); FOG.start = 8; FOG.end = 90;
    drawHexapod({ pose: { x: b.x, y: HEX.standH + 0.008 * Math.sin(T * 4 * Math.PI * 2), z: b.z, heading: Math.PI, roll: 0.02 * Math.sin(T * 2 * Math.PI * 2) }, feet, glow: 1 });
    routeLine(ROUTE, T, 1, 0.8); groundGrid([b.x, 0, b.z], 30, 1, 0.5); drawCity(T); ambient(T, 5, 0.35, '#c3d3df');
  } },
  s13: { update(t) { // 停下，展开生命探测模块，蓝色扫描波纹扩散
    const T = T0.s13 + t; const b = walkBody(T); const feet = gaitFeet(T, walkBody, { freq: 2.0, lift: 0.07 });
    const c = searchCam(T); setCam(c.p, c.look, c.f); FOG.start = 8; FOG.end = 90;
    const dep = smooth(range(t, 0.9, 2.0));
    const hf = drawHexapod({ pose: { x: b.x, y: HEX.standH, z: b.z, heading: Math.PI }, feet, scanner: dep, glow: 1 });
    scanRings([REST.x, 0.03, REST.z - 0.5], T, { radius: 3.6, alpha: smooth(range(t, 1.5, 2.3)) });
    scanFan(hf([0, 0.1, 0.32]), [0.03, -0.25, -1], 4.8, 0.45, T, smooth(range(t, 1.7, 2.5)));
    routeLine(ROUTE, T, 1, 0.8 * (1 - smooth(range(t, 0.8, 1.8))));
    groundGrid([REST.x, 0, REST.z], 30, 1, 0.5); drawCity(T); ambient(T, 5, 0.35, '#c3d3df');
  } },
  s14: { update(t) { // 越过机器人推向瓦砾：废墟变透明，显出被困者热源、生命体征
    const T = T0.s14 + t; const v = spline(K_SEARCH, T); camV(v); FOG.start = 8; FOG.end = 90;
    const hf = drawHexapod({ pose: restPose(), feet: restFeet(), scanner: 1, glow: 1 });
    scanRings([REST.x, 0.03, REST.z - 0.5], T, { radius: 3.6 });
    scanFan(hf([0, 0.1, 0.32]), [0.03, -0.25, -1], 4.8, 0.45, T, 1);
    const xk = smooth(range(t, 0.1, 1.0)), found = smooth(range(t, 0.6, 1.4));
    drawCity(T, { xray: { x: VICTIM[0], z: VICTIM[2], r: 6, k: xk } });
    drawVictim(VICTIM, 0.3, xk, T); groundGrid([REST.x, 0, REST.z], 30, 1, 0.5); ambient(T, 5, 0.3, '#c3d3df');
    const vb = victimBox(VICTIM, 0.3); if (vb) detectHUD(hud, T, { box: vb, found, k: range(t, 0, 0.8) });
    POST.bgTint = '#0b2030';
  } },
  s15: { update(t) { // 镜头升起转为上帝视角并不断抬高：信号经无人机中继传回基站，各处红点陆续亮起，最后成为大屏上的态势图
    const T = T0.s15 + t; const c = godRise(t);
    setCamYPR(c.p, c.yaw, c.pitch, 0, c.fov); fogFor(c.p[1]);
    const hf = drawHexapod({ pose: restPose(), feet: restFeet(), scanner: 1, glow: 1 });
    scanRings([REST.x, 0.03, REST.z - 0.5], T, { radius: 3.6, alpha: 1 - smooth(range(t, 1.5, 3)) });
    scanFan(hf([0, 0.1, 0.32]), [0.03, -0.25, -1], 4.8, 0.45, T, 1 - smooth(range(t, 0.3, 1.6)));
    groundGrid([REST.x, 0, REST.z], 30, 1, 0.5 * (1 - smooth(range(t, 0.5, 2.5))));
    hoverDrone(T);
    POST.bgTint = mixHex('#0b2030', PAL.bg1, smooth(range(t, 0, 2.5)));
    drawCity(T, { xray: { x: VICTIM[0], z: VICTIM[2], r: 6, k: 1 - smooth(range(t, 0.8, 2.8)) } });
    drawVictim(VICTIM, 0.3, 1 - smooth(range(t, 1.5, 3.5)), T);
    const sa = smooth(range(t, 0.6, 1.4)) * (1 - smooth(range(t, 4.2, 4.9))); const dp = DEVICES.drone;
    stream([REST.x, 0.4, REST.z], dp, 6, T, 46, sa); stream(dp, [CITY.dock[0], CITY.dock[1] + 2, CITY.dock[2]], 60, T, 90, sa, '#9ff0ff', 0.35);
    const uiA = smooth(range(t, 4.9, 5.9)), bk = 1 - smooth(range(t, 4.9, 5.8));
    const ds = (i) => (i === 0 ? 1 : clamp((t - DOT_T[i]) / 0.25));
    CITY.survivors.forEach(([x, z], i) => { if (ds(i) > 0) survivorBeacon(x, z, T, i, ds(i) * bk * (i === 0 ? smooth(range(t, 3.6, 4.6)) : 1), 26, 6); });
    const vb = victimBox(VICTIM, 0.3);
    if (vb && t < 1.2) detectHUD(hud, T, { box: vb, found: 1, k: 1, alpha: 1 - smooth(range(t, 0.2, 1.1)) });
    drawScreenContent(hud, V1, T, { ...UI_DETECT, alpha: uiA }, ds, { dotPos: dotProj, devices: uiA, devP: { hex: project(DEVICES.hex), drone: project(DEVICES.drone) }, scan: uiA, dotsA: smooth(range(t, 0.6, 1.6)) });
  } },
  // ———————— 三、指挥屏幕与结合返航 ————————
  s16: { update(t) { // 指挥大厅：从大屏后拉，8 个红点就是刚才的侦测结果
    drawCommand(room16(t), T0.s16 + t, UI_DETECT, () => 1, { devices: 1, glare: smooth(range(t, 0.3, 1.5)) });
  } },
  s17: { update(t) { // 推回大屏，界面淡去，态势图变回真实的上帝视角，选中六足机器人
    const T = T0.s17 + t;
    if (t < 1.6) { drawCommand(room17(t), T, UI_DETECT, () => 1, { devices: 1, hexSel: smooth(range(t, 0.8, 1.6)), glare: 1 - smooth(range(t, 0.4, 1.3)) }); return; }
    const h = god17(t); setGodCam(h); drawGod(T); fogFor(h);
    const uiA = 1 - smooth(range(t, 1.7, 2.5));
    drawScreenContent(hud, V1, T, { ...UI_DETECT, alpha: uiA }, () => 1, { dotPos: dotProj, devices: 0, scan: uiA });
    const hp = project(DEVICES.hex), dp = project(DEVICES.drone);
    if (hp) drawDevice(hud, hp.x, hp.y, 'hex', T, 1, 1);
    if (dp) drawDevice(hud, dp.x, dp.y, 'drone', T, uiA);
  } },
  s18: { update(t) { // GTA 切换角色式：分三段急速下降，落到六足机器人身边；无人机飞回悬停
    const T = T0.s18 + t; const c = gtaCam(t);
    setCamYPR(c.p, c.yaw, c.pitch, 0, c.fov); fogFor(Math.max(c.h * (1 - smooth(range(t, 2.1, 3.5))), 1.5));
    const dk = smoother(range(t, 1.2, 3.8)); const from = DEVICES.drone; const hd0 = Math.atan2(HOVER[0] - from[0], HOVER[2] - from[2]);
    drawDrone({ pos: vl(from, HOVER, dk), heading: lerp(hd0, Math.PI + 2 * Math.PI * Math.round((hd0 - Math.PI) / (2 * Math.PI)), smooth(range(t, 2.6, 3.8))), pitch: 0.15 * (1 - smooth(range(t, 3, 3.8))), rot: rotorSpin(T, { t0: 0 }), t: T, strobe: true });
    drawHexapod({ pose: restPose(), feet: restFeet(), scanner: 1 - smooth(range(t, 2.8, 3.8)), glow: 1 });
    downwash([REST.x, 0, REST.z], T, smooth(range(t, 3.0, 3.8)) * 0.7);
    if (c.h < 30) groundGrid([REST.x, 0, REST.z], 30, 1, 0.5 * smooth(range(t, 1.8, 2.6)));
    drawCity(T);
    drawScreenContent(hud, V1, T, null, () => 1, { dotPos: dotProj, dotsA: 1 - smooth(range(t, 0.1, 0.6)), scan: 0 });
    const hp = project(DEVICES.hex); if (hp) drawDevice(hud, hp.x, hp.y, 'hex', T, 1 - smooth(range(t, 0.9, 1.6)), 1);
    POST.zoom = c.blur * 0.9;
  } },
  s19: { update(t) { // 无人机落到六足机器人上方，锁扣扣合，收腿
    const T = T0.s19 + t; setCam(CAM19.p, CAM19.look, CAM19.f); FOG.start = 8; FOG.end = 90;
    const feet = restFeet(); const tall = 0.40, dockY = tall - HANG_Y;
    const P = [REST.x, lerp(HOVER[1], dockY, smoother(range(t, 0, 1.7))) + smooth(range(t, 2.9, 3.5)) * 0.3, REST.z];
    const latch = 1 - smooth(range(t, 1.6, 2.0));
    const df = drawDrone({ pos: P, heading: Math.PI, rot: rotorSpin(T, { t0: 0 }), t: T, strobe: true, latch, ring: 1.2 + 3 * Math.sin(Math.PI * range(t, 1.7, 2.3)) });
    if (t < 1.7) drawHexapod({ pose: restPose({ y: lerp(HEX.standH, tall, smooth(range(t, 0.4, 1.5))) }), feet, glow: 1 });
    else drawHexapod({ f: compose(df, [0, HANG_Y, 0]), feet, fold: smooth(range(t, 2.05, 3.0)), glow: 1 });
    downwash([REST.x, 0, REST.z], T, 0.7); groundGrid([REST.x, 0, REST.z], 30, 1, 0.5); drawCity(T); ambient(T, 6, 0.3, '#c3d3df');
  } },
  s20: { update(t) { // 结合体升空，离开废墟
    const T = T0.s20 + t; const up = easeIn(range(t, 0, 1.6)) * 5, away = easeIn(range(t, 1.1, 3.0));
    const y0 = 0.40 - HANG_Y + 0.3; const P = [REST.x + away * 22, y0 + up + away * 18, REST.z - away * 8];
    setCam([-1.9, 0.35, 4.6], vl([REST.x, 1.2, REST.z], P, 0.85), 50); FOG.start = 10; FOG.end = 200;
    combined(P, Math.PI + away * 1.6, away * 0.25, -away * 0.15, rotorSpin(T, { t0: 0 }), T);
    downwash([REST.x, 0, REST.z], T, 1 - range(up, 1, 4)); groundGrid([REST.x, 0, REST.z], 40, 1, 0.5); drawCity(T); ambient(T, 8, 0.3, '#c3d3df');
  } },
  // ———————— 四、救援出发、擦肩、救援、返回基站 ————————
  s21: { transIn: { type: 'particles', dur: 0.8 }, update(t) { // 机场：救援队员跑到舱门口登机，舱门关闭，直升机起飞
    const T = T0.s21 + t; const lift = easeIn(range(t, 2.6, 4.0)), fwd = easeIn(range(t, 3.3, 4.0));
    setCam([-17, 1.7, 14], [0, 3 + lift * 3, 0], 40); FOG.start = 40; FOG.end = 420;
    drawAirport(T);
    const door = 1 - smooth(range(t, 2.15, 2.5));
    drawHeli({ pos: [fwd * 6, 1.5 + lift * 7, 0], heading: Math.PI / 2, pitch: 0.1 * fwd, rotor: T * 30, speed: 1, t: T, search: true, door });
    const DOOR = [0.35, 0, 1.25], APP = [0.35, 0, 2.4];
    for (let i = 0; i < 3; i++) {
      const t0 = 0.1 + i * 0.3, run = clamp((t - t0) / 1.3), board = clamp((t - t0 - 1.3) / 0.35);
      if (t < t0 || board >= 1) continue;
      const start = [-11 - i * 1.2, 0, 7 + i * 0.7];
      let pos, alpha = 1, head = Math.atan2(APP[0] - start[0], APP[2] - start[2]);
      if (run < 1) pos = vl(start, APP, run);
      else { pos = [DOOR[0], 0.72 * smooth(board), lerp(APP[2], DOOR[2] - 0.5, board)]; head = Math.PI; alpha = 1 - smooth((board - 0.35) / 0.4); }
      drawHuman({ pos, heading: head, phase: T * 9 + i, run: run < 1 ? 1 : 0.3, vest: PAL.orange, helmet: '#fff', alpha });
    }
    ambient(T, 30, 0.25);
  } },
  s22: { update(t) { // 空中擦肩：跟拍直升机飞向远处起火的灾区，完成任务的结合体迎面飞过、返回基站（交汇处放慢）
    const T = T0.s22 + t;
    const tauAt = (tt) => { let a = 0; const n = Math.round(tt * 96); for (let i = 0; i < n; i++) a += (1 - 0.62 * Math.exp(-((((i + 0.5) / 96 - 2.3) / 0.7) ** 2))) / 96; return a; };
    const tau = tauAt(t), tc = tauAt(2.3);
    const Hp = [560 - 16 * tau, 90, 30];
    setCam(add(Hp, [24, 6, 10]), add(Hp, [-40, -10, -3]), 36); FOG.start = 100; FOG.end = 1300;
    drawCity(T); points(CLOUDS, { color: '#b8d8ee', alpha: 0.35, size: 2, sizeByDepth: true });
    drawHeli({ pos: Hp, heading: -Math.PI / 2, pitch: 0.12, rotor: tau * 30, speed: 1, t: tau, search: true });
    const xc = 560 - 16 * tc; combined([xc + 12 * (tau - tc), 93, 35], Math.PI / 2, 0.18, 0, rotorSpin(tau + 100, { t0: 0 }), tau);
    ambient(T, 60, 0.25);
  } },
  s23: { transIn: { type: 'particles', dur: 0.7 }, update(t) { // 绞车救援：直升机悬停，被救人员躺在担架上，由绞车吊上直升机；担架离地时红色标记变绿
    const T = T0.s23 + t; const hd = 0.3; const go = easeIn(range(t, 5.4, 6.4));
    const HP = [VICTIM[0] - 1.79 - Math.sin(hd) * go * 7, 21 + 0.15 * Math.sin(T * 1.1) + go * 1.5, VICTIM[2] + 0.136 - Math.cos(hd) * go * 7];
    const ground = 1.45, G = [VICTIM[0], ground, VICTIM[2]];
    const tip = xform(HP, hd, 0.1 * go)([1.75, 1.0, 0.4]);
    const lift = smoother(range(t, 1.6, 5.3)); const sway = 0.06 * lift * Math.sin(T * 1.7);
    const ringY = lerp(ground + 0.95, tip[1] - 1.3, lift); const sp = [lerp(G[0], tip[0], lift) + sway, ringY - 0.95, lerp(G[2], tip[2], lift)];
    // 镜头跟着担架一起升起：起初略高于担架、看清躺着的人，上升途中直升机从画面上方进入
    const camP = [G[0] + lerp(3.3, 4.6, lift), ground + 1.55 + (sp[1] - ground) * 0.92, G[2] + lerp(2.9, 4.1, lift)];
    setCam(camP, [sp[0], sp[1] + 0.35 + 1.4 * smooth(range(t, 3.4, 5.6)), sp[2]], 55); FOG.start = 15; FOG.end = 160;
    drawCity(T); ambient(T, 12, 0.35, '#c3d3df');
    drawHeli({ pos: HP, heading: hd, pitch: 0.1 * go, rotor: T * 30, speed: 1, t: T, search: true, cable: 0 });
    const ringP = drawStretcher(sp, 2.42 + 0.35 * lift * Math.sin(T * 0.9), T, { roll: 0.04 * lift * Math.sin(T * 2.3) });
    polyline([tip, ringP], { stroke: '#e8f4ff', width: 1.6, alpha: 0.95, fade: false, dots: false });
    // 救援队员：在担架另一侧扶着，担架离地后挥手示意
    drawHuman({ pos: [G[0] + 1.2 * 0.66 - 0.6 * 0.75, ground, G[2] - 1.2 * 0.75 - 0.6 * 0.66], heading: 2.6, phase: 0, run: 0, vest: PAL.orange, helmet: '#fff', armsUp: (t > 1.2 && t < 1.6) || t > 2.2 });
    const lc = []; for (let i = 0; i < 260; i++) { const u = hash3(i, 7, 1), a = hash3(i, 2, 9) * 6.283, r = u * 3.2 * Math.sqrt(hash3(i, 4, 4)); lc.push(HP[0] + 0.3 + Math.cos(a) * r, HP[1] - 1 - u * (HP[1] - 2), HP[2] + Math.sin(a) * r); }
    points(new Float32Array(lc), { color: '#fff3d6', alpha: 0.3 * (1 - go), size: 2, sizeByDepth: true, glow: 0.4, glowColor: '#ffd9a8', fade: false });
    downwash([G[0], ground - 0.9, G[2]], T, 0.9 * (1 - go), 2.2);
    const gk = smooth(range(t, 1.85, 2.15)); const col = gk < 0.5 ? PAL.red : PAL.green; const ph = (T * 0.9) % 1; const gy = ground + 0.05;
    poly(ring([G[0], gy, G[2]], 0.6 + ph * 2.2, [0, 1, 0], 48), { stroke: col, width: 2.2, alpha: 1 - ph, glow: 1.4 * (1 - ph), glowColor: col, fade: false, dots: false });
    if (gk > 0 && gk < 1) poly(ring([G[0], gy, G[2]], 0.5 + gk * 5, [0, 1, 0], 64), { stroke: '#dffff0', width: 2.5, alpha: 1 - gk, glow: 2 * (1 - gk), fade: false, dots: false });
  } },
  s24: { transIn: { type: 'particles', dur: 0.7 }, update(t) { // 结合体降落在基站平台上，平台开始下降
    const T = T0.s24 + t; const k = smoother(range(t, 0, 2.4)); const lift = 1 - smooth(range(t, 2.6, 3.5)) * 0.4;
    setCam(dockAt(6.5, 3.2, 2.2), dockAt(0, 0, 1.6 + (1 - k) * 2), 40); FOG.start = 30; FOG.end = 700;
    const df = drawDock(CITY.dock, 1, lift, T, 1); const top = df([0, dockTop(lift) + 0.62, 0]);
    const P = vl(add(top, [-4, 7, 3]), top, k);
    combined(P, DOCK.ry + (1 - k) * 0.5, (1 - k) * 0.15, 0, rotorSpin(T, { t0: 0, t1: T0.s24 + 2.5, spinDown: 1.4 }), T);
    downwash([top[0], top[1] - 0.62, top[2]], T, range(5 - (P[1] - top[1]), 0, 3) * (1 - range(t, 2.5, 3.0)), 0.6);
    drawCity(T); ambient(T, 20, 0.3);
  } },
  s25: { update(t) { // 舱盖合拢，充电指示灯亮起
    const T = T0.s25 + t; const k = smoother(t / 4); const lift = 0.6 * (1 - smooth(range(t, 0, 1.4)));
    setCam(dockAt(lerp(6.0, 4.8, k), lerp(-2.6, -1.8, k), 1.3), dockAt(0, 0, 1.1), 40); FOG.start = 30; FOG.end = 700;
    const df = drawDock(CITY.dock, 1 - smooth(range(t, 1.0, 3.2)), lift, T, 1); const top = df([0, dockTop(lift) + 0.62, 0]);
    combined(top, DOCK.ry, 0, 0, { angle: 0, speed: 0 }, T, 1.2);
    const ch = smooth(range(t, 2.6, 3.2));
    for (let q = 0; q < 5; q++) { const on = ch * (((T * 1.4) % 1) * 5 > q || q < 2 ? 1 : 0.2); const a = df([-0.5 + q * 0.25, 1.3, DOCK.d / 2 + 0.012]), b = df([-0.32 + q * 0.25, 1.3, DOCK.d / 2 + 0.012]); polyline([a, b], { stroke: PAL.green, width: 6, alpha: 0.25 + 0.75 * on, glow: on * 1.2, glowColor: PAL.green, cap: 'butt', fade: false, dots: false }); }
    drawCity(T); ambient(T, 12, 0.3);
    POST.fade = smooth(range(t, 3.4, 4.0)) * 0.35;
  } },
  // ———————— 五、红点变绿与片尾 ————————
  s26: { transIn: { type: 'dissolve', dur: 0.8 }, update(t) { // 红点逐个变绿，镜头始终正对最后一个红点缓缓推近
    const T = T0.s26 + t;
    const ds = (i) => (i === LAST ? 1 : 1 + clamp((t - greenAt(i)) / 0.35));
    const saved = CITY.survivors.filter((_, i) => i !== LAST && t > greenAt(i) + 0.2).length;
    drawCommand(zoom26(t), T, { title: '灾区生命探测态势', sub: '救援进行中', count: `已救出：${saved}/8` }, ds, { devices: 0, robots: false });
  } },
  s27: { update(t) { // 推到最后一个红点铺满画面，变绿，成为纯绿
    const T = T0.s27 + t; const turn = smooth(range(t, 3.5, 3.95));
    cam.near = 0.005;
    drawCommand(zoom26(8 + t), T, { title: '灾区生命探测态势', sub: '救援进行中', count: turn > 0.5 ? '已救出：8/8' : '已救出：7/8' }, (i) => (i === LAST ? 1 + turn : 2), { devices: 0, robots: false, glare: 1 - smooth(range(t, 2, 3.5)) });
    POST.flash = 0.16 * Math.sin(Math.PI * range(t, 3.5, 3.85));
    POST.fadeColor = GREEN_END; POST.fade = smooth(range(t, 4.25, 5.0));
    POST.vignette = lerp(0.55, 0.35, smooth(range(t, 3.6, 5.0))); POST.grain = lerp(0.06, 0.03, smooth(range(t, 3.6, 5.0)));
  } },
  s28: { update(t) { // 绿底片尾：项目名称、口号
    POST.bg = false; POST.glow = 0; POST.fadeColor = GREEN_END; POST.fade = 1; POST.vignette = 0.35; POST.grain = 0.03;
    titleCard(hud, t, {});
  } },
  s29: CREDITS_SHOT,
  s30: { prepare: COVER_PREP, update(t) { coverDraw(t, true); } }, // 片尾封面
};

export const SHOTS = [...DURS.map(([id, dur]) => ({ id, dur, ...SH[id] })), { id: 'cover', dur: 1, ...COVER_SHOT }]; // cover 是封面静帧，不进成片
