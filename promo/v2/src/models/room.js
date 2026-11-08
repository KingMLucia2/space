// 指挥大厅（线稿）与大屏。大屏上的态势图就是上帝视角下的线稿城区本身：
// 镜头在大厅里始终正对屏幕（只平移不转向），屏幕在画面里是轴对齐矩形，于是可以把“上帝视角”整幅画面
// 经过一个缩放平移直接画进屏幕区域——从上帝视角到大屏、从大屏回到上帝视角都能做到逐像素无缝。
import * as THREE from 'three';
import { W, H, PAL, poly, polyline, points, segments, ring, custom, project, setCamYPR, setView, renderPass, mkCanvas, FOG, toCam } from '../core.js';
import { box, xform } from '../prims.js';
import { drawCity, CITY } from './city.js';
import { drawOperator } from './extra.js';
import { drawDrone, drawHexapod, rotorSpin, standFeet, HEX } from './robots.js';
import { screenUI, drawDot } from '../hud.js';
import { clamp, smooth, lerp } from '../util.js';

export const SCREEN = { w: 8.0, h: 4.5, y: 2.75, z: -6 };
export const ROOM_FOV = 35;
const FR = (H / 2) / Math.tan(THREE.MathUtils.degToRad(ROOM_FOV / 2));
export const FILL_D = SCREEN.w * FR / W; // 屏幕恰好铺满画面时相机到屏幕的距离
// 上帝视角相机（与大屏态势图同一取景）
export const GOD = { pos: [0, 380, -6], fov: 40 };
export function setGodCam(h = GOD.pos[1], x = GOD.pos[0], z = GOD.pos[2]) { setCamYPR([x, h, z], 0, -Math.PI / 2, 0, GOD.fov); }
export const GOD_FOG = { start: 250, end: 2000 };
// 被困者在大屏像素坐标中的位置
let DOTS = null;
export function dots() {
  if (DOTS) return DOTS; setGodCam(); DOTS = CITY.survivors.map(([x, z]) => { const p = project([x, 0, z]); return [p.x, p.y]; }); return DOTS;
}
export const LAST = 7; // 最后一个红点

// 正对屏幕的相机：给定相机位置，算出屏幕像素 → 画面像素的缩放与平移
export function screenView(cp) {
  const d = cp[2] - SCREEN.z; const s = SCREEN.w * FR / (d * W);
  const x0 = W / 2 - (SCREEN.w / 2 + cp[0]) * FR / d; const y0 = H / 2 - (SCREEN.y - cp[1] + SCREEN.h / 2) * FR / d;
  return { s, x0, y0, d };
}
// 让屏幕上某个像素点 (sx,sy) 出现在画面 (X,Y) 处、缩放为 s 时的相机位置
export function camForScreen(sx, sy, s, X = W / 2, Y = H / 2) {
  const d = SCREEN.w * FR / (s * W); const px = (sx / W - 0.5) * SCREEN.w, py = SCREEN.y - (sy / H - 0.5) * SCREEN.h;
  return [px - (X - W / 2) * d / FR, py + (Y - H / 2) * d / FR, SCREEN.z + d];
}

// 上帝视角的城区（态势图）：直接画在主画面，或经 view 变换画进屏幕
// 空中待命的无人机、停在被困者前方扫描的六足机器人（上帝视角下很小，但与后续镜头保持一致）
export function hoverDrone(T) { const p = DEVICES.drone; return drawDrone({ pos: [p[0], p[1] + 0.3 * Math.sin(T * 1.3), p[2]], heading: 2.12, rot: rotorSpin(T, { t0: 0 }), t: T, strobe: true }); }
export function restHex(scanner = 1) { const h = DEVICES.hex; const pose = { x: h[0], y: HEX.standH, z: h[2], heading: Math.PI }; return drawHexapod({ pose, feet: standFeet(pose), scanner, glow: 1 }); }
export function drawGod(T, devices = true) { FOG.start = GOD_FOG.start; FOG.end = GOD_FOG.end; drawCity(T); if (devices) { hoverDrone(T); restHex(); } }
export function screenBG(c, v) { // 与合成背景相同的径向渐变，按屏幕变换缩放
  const g = c.createRadialGradient(v.x0 + v.s * W * 0.5, v.y0 + v.s * H * 0.42, 50 * v.s, v.x0 + v.s * W * 0.5, v.y0 + v.s * H * 0.5, W * 0.75 * v.s);
  g.addColorStop(0, PAL.bg1); g.addColorStop(1, PAL.bg0); c.fillStyle = g; c.fillRect(v.x0, v.y0, W * v.s, H * v.s);
}
// 设备在地图上的位置（六足机器人停在被困者前方，无人机在空中待命）
export const DEVICES = { hex: [0.336, 0.24, 1.74], drone: [-30, 25, 20] };
let DEVP = null;
function devPos() { if (DEVP) return DEVP; setGodCam(); DEVP = { hex: project(DEVICES.hex), drone: project(DEVICES.drone) }; return DEVP; }
// 屏幕内容：dotState(i) → 0~2；ui：screenUI 参数（含 alpha）；o.dotPos(i) 可覆盖点的位置（上帝视角升起途中用）
export function drawScreenContent(c, v, T, ui, dotState, o = {}) {
  const scan = o.scan ?? 1, dotsA = o.dotsA ?? 1, dev = o.devices ?? 0;
  c.save(); c.setTransform(v.s, 0, 0, v.s, v.x0, v.y0);
  const rk = 1 - smooth((v.s - 2.5) / 3), lk = 1 - smooth((v.s - 1.8) / 1.5);
  const D = dots(); D.forEach((xy, i) => { const p = o.dotPos ? o.dotPos(i) : xy; if (p) drawDot(c, p[0], p[1], dotState(i), T, i, dotsA, 11, rk, lk); });
  if (dev > 0) { const P = o.devP || devPos(); drawDevice(c, P.hex.x, P.hex.y, 'hex', T, dev * (o.hexA ?? 1), o.hexSel || 0); drawDevice(c, P.drone.x, P.drone.y, 'drone', T, dev); }
  if (ui && (ui.alpha ?? 1) > 0) screenUI(c, { ...ui, t: T });
  c.restore();
  // 扫描线：屏幕像素越大越明显，太小时淡出以免摩尔纹
  const sa = 0.07 * scan * smooth((v.s - 0.55) / 0.35) * (1 - smooth((v.s - 3) / 3));
  if (sa > 0.002) { c.save(); c.globalAlpha = sa; c.fillStyle = '#000'; const step = 4 * v.s; let y = v.y0 + Math.floor(-v.y0 / step) * step; for (; y < H; y += step) if (y > -step) c.fillRect(0, y, W, Math.max(1, step * 0.45)); c.restore(); }
}
// 地图上的设备图标：六足机器人（六边形）、无人机（旋翼十字）；sel 选中脉冲
export function drawDevice(c, x, y, kind, t, a = 1, sel = 0) {
  if (a <= 0.01) return; c.save(); c.globalAlpha = a; c.strokeStyle = '#7fe3ff'; c.fillStyle = 'rgba(4,20,34,0.85)'; c.lineWidth = 2.5;
  if (kind === 'hex') { c.beginPath(); for (let k = 0; k < 6; k++) { const th = k * Math.PI / 3; c.lineTo(x + Math.cos(th) * 13, y + Math.sin(th) * 13); } c.closePath(); c.fill(); c.stroke(); c.fillStyle = '#7fe3ff'; c.beginPath(); c.arc(x, y, 4, 0, 7); c.fill(); }
  else { c.beginPath(); c.arc(x, y, 6, 0, 7); c.fill(); c.stroke(); for (let k = 0; k < 6; k++) { const th = k * Math.PI / 3 + 0.5; const ex = x + Math.cos(th) * 16, ey = y + Math.sin(th) * 16; c.beginPath(); c.moveTo(x + Math.cos(th) * 6, y + Math.sin(th) * 6); c.lineTo(ex, ey); c.stroke(); c.beginPath(); c.arc(ex, ey, 5, 0, 7); c.stroke(); } }
  if (sel > 0) { const ph = (t * 1.2) % 1; c.globalAlpha = a * sel * (1 - ph); c.lineWidth = 3; c.beginPath(); c.arc(x, y, 18 + ph * 40, 0, 7); c.stroke(); c.globalAlpha = a * sel; brackets4(c, x, y, 30); }
  c.globalAlpha = a; c.font = '22px "Noto Sans SC",sans-serif'; c.fillStyle = '#cfefff'; c.textAlign = 'left'; c.textBaseline = 'middle'; c.fillText(kind === 'hex' ? '六足机器人' : '无人机', x + 24, y + 1);
  c.restore();
}
function brackets4(c, x, y, r) { const L = r * 0.45; c.beginPath(); for (const [sx, sy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) { c.moveTo(x + sx * r, y + sy * (r - L)); c.lineTo(x + sx * r, y + sy * r); c.lineTo(x + sx * (r - L), y + sy * r); } c.stroke(); }

const passC = mkCanvas(W, H), PC = passC.getContext('2d');
// 大厅镜头一帧：cp 相机位置（正对屏幕），T 全片时间，ui/dotState 同上，room 0~1 大厅亮度
export function drawCommand(cp, T, ui, dotState, o = {}) {
  const room = o.room ?? 1, glare = o.glare ?? 1; const v = screenView(cp);
  // 第一遍：屏幕内容
  renderPass(() => { setGodCam(); setView(v.s, v.x0, v.y0, clamp(Math.sqrt(v.s), 0.3, 2.2)); drawGod(T, o.robots ?? true); }, PC);
  PC.save(); screenBG2(PC, v); PC.restore(); drawScreenContent(PC, v, T, ui, dotState, o);
  // 第二遍：大厅
  setCamYPR(cp, 0, 0, 0, ROOM_FOV); FOG.start = 6; FOG.end = 40;
  const X0 = v.x0, Y0 = v.y0, X1 = v.x0 + v.s * W, Y1 = v.y0 + v.s * H;
  custom(v.d, (L) => { L.beginPath(); L.rect(X0, Y0, X1 - X0, Y1 - Y0); L.clip(); L.drawImage(passC, 0, 0);
    if (glare > 0) { const g = L.createLinearGradient(X0, Y0, X1, Y1); g.addColorStop(0, 'rgba(160,220,255,0)'); g.addColorStop(0.42, 'rgba(160,220,255,0)'); g.addColorStop(0.5, `rgba(160,220,255,${0.05 * glare})`); g.addColorStop(0.58, 'rgba(160,220,255,0)'); L.fillStyle = g; L.fillRect(X0, Y0, X1 - X0, Y1 - Y0); } });
  if (room > 0) drawRoom(T, v, room);
  return v;
}
// 背景渐变要画在内容下面：先把内容挪到临时层
const bgC = mkCanvas(W, H), BG = bgC.getContext('2d');
function screenBG2(c, v) { BG.clearRect(0, 0, W, H); BG.drawImage(passC, 0, 0); c.clearRect(0, 0, W, H); screenBG(c, v); c.drawImage(bgC, 0, 0); }

// —— 大厅几何 ——
let ROOM = null;
function buildRoom() {
  if (ROOM) return ROOM; const fl = [];
  for (let x = -8; x <= 8; x += 1) fl.push(x, 0, -6.3, x, 0, 12);
  for (let z = -6; z <= 12; z += 1) fl.push(-8, 0, z, 8, 0, z);
  const wall = [];
  for (let x = -8; x <= 8; x += 2) wall.push(x, 0, -6.3, x, 6.5, -6.3);
  for (const y of [1.2, 5.6]) wall.push(-8, y, -6.3, 8, y, -6.3);
  for (const s of [-8, 8]) { for (let z = -6; z <= 12; z += 2) wall.push(s, 0, z, s, 6.5, z); wall.push(s, 1.2, -6.3, s, 1.2, 12, s, 5.6, -6.3, s, 5.6, 12); }
  for (let x = -8; x <= 8; x += 2) wall.push(x, 6.5, -6.3, x, 6.5, 12);
  ROOM = { fl: new Float32Array(fl), wall: new Float32Array(wall) }; return ROOM;
}
export function drawRoom(t, v, k = 1) {
  const R = buildRoom();
  segments(R.fl, { stroke: '#1f5f8a', alpha: 0.55 * k, width: 1, depthBias: 50 });
  segments(R.wall, { stroke: '#1d5a82', alpha: 0.5 * k, width: 1, depthBias: 45 });
  // 天花灯带
  for (const x of [-4, 0, 4]) polyline([[x, 6.45, -5.5], [x, 6.45, 11]], { stroke: '#7fd4ff', width: 2, alpha: 0.7 * k, glow: 0.8 * k });
  // 大屏边框（四条，留出屏幕本身）
  const { w, h, y, z } = SCREEN; const bz = z + 0.02, b = 0.16;
  const bez = { fill: 'rgba(4,10,16,0.98)', stroke: '#8ccff5', width: 1.3, alpha: 0.95 * k };
  for (const [cx, cy, bw, bh] of [[0, y + h / 2 + b / 2, w + 2 * b, b], [0, y - h / 2 - b / 2, w + 2 * b, b], [-w / 2 - b / 2, y, b, h], [w / 2 + b / 2, y, b, h]]) box(xform([cx, cy, bz]), [bw, bh, 0.1], bez);
  polyline([[-w / 2 - b, y - h / 2 - b - 0.02, bz + 0.05], [w / 2 + b, y - h / 2 - b - 0.02, bz + 0.05]], { stroke: PAL.blue, width: 2, alpha: 0.8 * k, glow: 0.8 * k });
  // 两侧小屏：曲线与柱状图
  for (const sd of [-1, 1]) {
    const cx = sd * 6.3, cy = 3.3, sw = 2.4, sh = 1.5, zz = z + 0.05;
    poly([[cx - sw / 2, cy - sh / 2, zz], [cx + sw / 2, cy - sh / 2, zz], [cx + sw / 2, cy + sh / 2, zz], [cx - sw / 2, cy + sh / 2, zz]], { fill: 'rgba(6,22,38,0.98)', stroke: '#8ccff5', width: 1.3, alpha: k });
    if (sd < 0) { const pts = []; for (let i = 0; i <= 40; i++) { const u = i / 40; pts.push([cx - sw * 0.42 + u * sw * 0.84, cy - 0.3 + 0.35 * Math.sin(u * 9 + t * 1.5) * Math.exp(-u) + 0.25 * u, zz + 0.01]); } polyline(pts, { stroke: PAL.green, width: 1.8, alpha: 0.9 * k, glow: 0.5 * k }); }
    else for (let i = 0; i < 8; i++) { const bh2 = 0.2 + 0.8 * Math.abs(Math.sin(i * 1.7 + t * 0.6)) * 0.9; const x = cx - sw * 0.4 + i * sw * 0.8 / 7; polyline([[x, cy - sh * 0.38, zz + 0.01], [x, cy - sh * 0.38 + bh2, zz + 0.01]], { stroke: PAL.blue, width: 6, alpha: 0.8 * k, cap: 'butt' }); }
    polyline([[cx - sw / 2 + 0.1, cy + sh / 2 - 0.15, zz + 0.01], [cx - sw / 2 + 0.9, cy + sh / 2 - 0.15, zz + 0.01]], { stroke: '#cfeeff', width: 3, alpha: 0.7 * k });
  }
  // 两排操作台、显示器、指挥员
  const desk = { fill: 'rgba(3,9,15,0.98)', stroke: '#6fbfe8', width: 1.3, alpha: 0.95 * k };
  for (const row of [0, 1]) {
    const zr = -1.4 + row * 3.2, yr = row * 0.35;
    if (row) box(xform([0, 0, zr + 0.4]), [14, 0.35, 3.0], { ...desk, stroke: '#3f86b5' }, { base: true, skipBottom: true });
    box(xform([0, 0.76 + yr, zr]), [12, 0.06, 1.0], desk);
    box(xform([0, yr, zr + 0.45]), [12, 0.75, 0.06], desk, { base: true, skipBottom: true });
    for (let q = -4; q <= 4; q++) {
      const mf = xform([q * 1.3, 1.08 + yr, zr - 0.2], 0, -0.15);
      box(mf, [0.78, 0.47, 0.04], { fill: 'rgba(3,9,15,0.98)', stroke: '#5aaedc', width: 1.1, alpha: 0.9 * k });
      const sc = [[-0.36, -0.21, 0.025], [0.36, -0.21, 0.025], [0.36, 0.21, 0.025], [-0.36, 0.21, 0.025]].map(mf);
      poly(sc, { fill: 'rgba(8,30,52,0.98)', stroke: '#7fd0ff', width: 1, alpha: 0.9 * k, depthBias: -0.001 });
      for (let r = 0; r < 4; r++) { const ww = 0.15 + 0.4 * Math.abs(Math.sin(q * 3.1 + r * 1.7 + Math.floor(t * 2 + q) * 0.9)); polyline([[-0.3, 0.13 - r * 0.08, 0.026], [-0.3 + ww, 0.13 - r * 0.08, 0.026]].map(mf), { stroke: r === 0 ? PAL.amber : '#5ab8ff', width: 2, alpha: 0.75 * k, depthBias: -0.002 }); }
    }
  }
  drawOperator([-1.6, 0, -0.55], 0, t, 0); drawOperator([1.15, 0, -0.65], 0, t, 1); drawOperator([3.5, 0.35, 2.6], 0, t, 2); drawOperator([-3.9, 0.35, 2.5], 0, t, 3);
}
