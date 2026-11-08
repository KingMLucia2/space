// 第二版镜头表（样片测试）
import { setCam, POST, FOG, hud, W, H, project, custom, PAL } from './core.js';
import { drawCity, drawVehicles, CITY, groundGrid } from './models/city.js';
import { drawDrone, drawHexapod, drawDock, rotorSpin, standFeet, HEX, HANG_Y, DOCK } from './models/robots.js';
import { compose } from './prims.js';
import { scanRings } from './fx.js';

const V = (x, y, z) => [x, y, z];
export const SHOTS = [
  { id: 'v2a', dur: 2, update(t) {
    const dir = [-0.8, 0, 0.6], hd = Math.atan2(dir[0], dir[2]);
    const P = [95 + dir[0] * t * 9, 52, -70 + dir[2] * t * 9];
    const side = [dir[2], 0, -dir[0]];
    setCam([P[0] - dir[0] * 6.5 + side[0] * 2.6, P[1] + 2.2, P[2] - dir[2] * 6.5 + side[2] * 2.6], [P[0] + dir[0] * 30, P[1] - 14, P[2] + dir[2] * 30], 46);
    const f = drawDrone({ pos: P, heading: hd, pitch: 0.16, roll: 0.03, rot: rotorSpin(t + 10, { t0: 0 }), t, strobe: true });
    drawHexapod({ f: compose(f, [0, HANG_Y, 0]), fold: 1 });
    drawCity(t + 30);
  } },
  { id: 'v2b', dur: 2, update(t) {
    setCam([1.7, 0.5, 2.9], [0.15, 0.28, 1.45], 40);
    const pose = { x: 0.3, y: HEX.standH, z: 1.7, heading: Math.PI + 0.1 };
    drawHexapod({ pose, feet: standFeet(pose), scanner: 1, glow: 1 });
    scanRings([0.3, 0.03, 1.3], t + 0.6, { radius: 3.2 });
    groundGrid([0.3, 0, 1.7], 40, 1);
    FOG.start = 8; FOG.end = 90;
    drawCity(t + 30);
  } },
  { id: 'v2c', dur: 2, update(t) {
    const D = CITY.dock;
    setCam([D[0] - 3.7, D[1] + 2.4, D[2] + 7.4], [D[0], D[1] + 1.3, D[2]], 40);
    const df = drawDock(D, 0.75, 0.6, t, 1);
    const top = df([0, 0.75 + (1.72 - 0.75) * 0.648 + 0.04 + 0.64, 0]);
    const f = drawDrone({ pos: top, heading: DOCK.ry, rot: rotorSpin(t, { t0: -1, spinUp: 3 }), t, strobe: true });
    drawHexapod({ f: compose(f, [0, HANG_Y, 0]), fold: 1 });
    FOG.start = 30; FOG.end = 700;
    drawCity(t + 30);
  } },
  { id: 'v2d', dur: 2, update(t) {
    setCam([0, 300, 0.01], [0, 0, 0], 40, [0, 0, -1]);
    FOG.start = 250; FOG.end = 2000;
    drawCity(t + 30, { lite: true });
    // 被困者红点（演示态势图）
    for (const [x, z] of CITY.survivors) { const p = project([x, 0, z]); if (!p) continue; custom(0, (L, G) => { L.fillStyle = PAL.red; L.beginPath(); L.arc(p.x, p.y, 7, 0, 7); L.fill(); L.strokeStyle = PAL.red; L.globalAlpha = 0.6; L.lineWidth = 2; L.beginPath(); L.arc(p.x, p.y, 16 + 8 * ((t * 0.8) % 1), 0, 7); L.stroke(); L.globalAlpha = 1; G.fillStyle = PAL.red; G.beginPath(); G.arc(p.x / 2, p.y / 2, 7, 0, 7); G.fill(); }); }
  } },
];
