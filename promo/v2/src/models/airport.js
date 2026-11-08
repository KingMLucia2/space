// 应急救援航空基地（单独布景）：停机坪、机库（拱顶）、塔台、跑道、风向袋、救援车
import { poly, polyline, points, segments, ring, custom, project, PAL } from '../core.js';
import { box, xform, cylinder } from '../prims.js';

let AP = null;
function build() {
  if (AP) return AP; const g = [];
  for (let x = -120; x <= 120; x += 6) g.push(x, 0, -120, x, 0, 120);
  for (let z = -120; z <= 120; z += 6) g.push(-120, 0, z, 120, 0, z);
  const rw = []; // 跑道（远处，沿 x 方向）
  for (const z of [-58, -82]) rw.push(-300, 0.02, z, 300, 0.02, z);
  for (let x = -300; x < 300; x += 18) rw.push(x, 0.02, -70, x + 9, 0.02, -70);
  for (let k = 0; k < 8; k++) { const z = -79 + k * 2.6; rw.push(-260, 0.02, z, -244, 0.02, z); }
  AP = { grid: new Float32Array(g), rw: new Float32Array(rw) }; return AP;
}
const ST = { fill: 'rgba(3,10,18,0.96)', stroke: PAL.line, width: 1.3, alpha: 0.95 };
export function drawAirport(t, beacon = 1) {
  const A = build();
  segments(A.grid, { stroke: '#1d5f8c', alpha: 0.5, width: 1, depthBias: 1e5 });
  segments(A.rw, { stroke: '#57b8e8', alpha: 0.85, width: 1.4, depthBias: 9e4 });
  // 停机坪：圆圈＋H
  poly(ring([0, 0.03, 0], 11, [0, 1, 0], 72), { stroke: PAL.amber, width: 2.2, alpha: 0.95, depthBias: 8e4 });
  poly(ring([0, 0.03, 0], 9.6, [0, 1, 0], 72), { stroke: PAL.amber, width: 1.2, alpha: 0.6, depthBias: 8e4 });
  for (const seg of [[[-2.5, -3.5], [-2.5, 3.5]], [[2.5, -3.5], [2.5, 3.5]], [[-2.5, 0], [2.5, 0]]]) polyline(seg.map(([x, z]) => [z, 0.04, x]), { stroke: PAL.white, width: 3, alpha: 0.95, depthBias: 7e4 });
  for (let k = 0; k < 12; k++) { const a = k / 12 * 6.283; const on = ((t * 1.5 + k / 12) % 1) < 0.5; points(new Float32Array([Math.cos(a) * 11.6, 0.15, Math.sin(a) * 11.6]), { color: on ? '#7fe3ff' : '#2a6d99', size: 4, glow: on ? 1.5 : 0, depthBias: 0 }); }
  // 机库：箱体＋拱顶（一串拱形肋）
  const hx = 14, hz = -34, hw = 46, hd = 30, hh = 11;
  box(xform([hx, 0, hz]), [hw, hh, hd], ST, { base: true, skipBottom: true, windows: { floor: 11, bay: 5.75 } });
  const arcs = [];
  for (let k = 0; k <= 8; k++) { const z = hz - hd / 2 + k * hd / 8; const pts = []; for (let i = 0; i <= 16; i++) { const a = Math.PI * i / 16; pts.push([hx - hw / 2 * Math.cos(a), hh + Math.sin(a) * 5, z]); } arcs.push(pts); }
  for (const pts of arcs) polyline(pts, { stroke: PAL.line, width: 1.2, alpha: 0.75 });
  for (let i = 0; i <= 16; i += 2) { const a = Math.PI * i / 16; polyline([[hx - hw / 2 * Math.cos(a), hh + Math.sin(a) * 5, hz - hd / 2], [hx - hw / 2 * Math.cos(a), hh + Math.sin(a) * 5, hz + hd / 2]], { stroke: PAL.line, width: 1, alpha: 0.4 }); }
  // 机库大门（亮着内灯）
  poly([[hx - 16, 0.05, hz + hd / 2 + 0.05], [hx + 16, 0.05, hz + hd / 2 + 0.05], [hx + 16, 8.5, hz + hd / 2 + 0.05], [hx - 16, 8.5, hz + hd / 2 + 0.05]], { fill: 'rgba(30,80,120,0.55)', stroke: '#9fe0ff', width: 1.6, alpha: 1, glow: 0.6 });
  for (let k = 1; k < 8; k++) polyline([[hx - 16 + k * 4, 0.05, hz + hd / 2 + 0.06], [hx - 16 + k * 4, 8.5, hz + hd / 2 + 0.06]], { stroke: '#6fbfe8', width: 1, alpha: 0.5 });
  // 机库门楣文字
  const c = [[hx - 12, 10.1, hz + hd / 2 + 0.1], [hx + 12, 10.1, hz + hd / 2 + 0.1], [hx - 12, 9.0, hz + hd / 2 + 0.1]].map(project);
  if (c.every(Boolean)) custom((c[0].d + c[1].d) / 2 - 0.5, (L, G) => {
    const [a, b, d] = c; L.setTransform((b.x - a.x) / 1200, (b.y - a.y) / 1200, (d.x - a.x) / 60, (d.y - a.y) / 60, a.x, a.y);
    L.font = 'bold 58px "Noto Sans SC",sans-serif'; L.textAlign = 'center'; L.textBaseline = 'middle'; L.fillStyle = '#cfeeff'; L.fillText('应急救援航空基地', 600, 30);
  });
  // 塔台
  const tx = -34, tz = -40; cylinder((p) => [p[0] + tx, p[1] + 9, p[2] + tz], 1.8, 2.4, 18, ST, 20, { stroke: PAL.line, width: 1, alpha: 0.6 });
  const cab = []; for (let k = 0; k < 8; k++) { const a = k / 8 * 6.283 + 0.39; cab.push([tx + Math.cos(a) * 3.6, 18, tz + Math.sin(a) * 3.6]); }
  const cabTop = cab.map((p) => [p[0], 21.5, p[2]]);
  poly(cab, ST); poly(cabTop, { ...ST, fill: 'rgba(3,10,18,0.98)' });
  for (let k = 0; k < 8; k++) poly([cab[k], cab[(k + 1) % 8], cabTop[(k + 1) % 8], cabTop[k]], { fill: 'rgba(40,110,160,0.35)', stroke: '#9fe0ff', width: 1.1, alpha: 0.85 });
  polyline([[tx, 21.5, tz], [tx, 25, tz]], { stroke: PAL.white, width: 1.4 });
  points(new Float32Array([tx, 25.2, tz]), { color: '#ff3b30', size: 5, alpha: (t % 1.2) < 0.5 ? 1 : 0.2, glow: (t % 1.2) < 0.5 ? 2 : 0, glowColor: '#ff3b30' });
  // 风向袋
  const wx = 22, wz = 14; polyline([[wx, 0, wz], [wx, 6, wz]], { stroke: PAL.white, width: 1.3 });
  const sw = Math.sin(t * 2.2) * 0.15; const sock = []; for (let k = 0; k <= 4; k++) sock.push([wx - k * 0.7, 6 - k * 0.12 + Math.sin(t * 5 + k) * 0.05, wz + k * sw]);
  polyline(sock, { stroke: PAL.orange, width: 4, alpha: 0.95 });
  // 救援车
  const vf = xform([-16, 0, -12], 0.4); const vs = { fill: 'rgba(5,14,24,0.96)', stroke: PAL.white, width: 1.3, alpha: 0.9 };
  box((p) => vf([p[0], p[1], p[2] - 0.8]), [2.4, 2.6, 4.4], vs, { base: true, skipBottom: true });
  box((p) => vf([p[0], p[1] + 0.6, p[2] + 2.3]), [2.4, 2.0, 1.8], vs, { base: true, skipBottom: true });
  polyline([[1.21, 1.3, -3.0], [1.21, 1.3, 1.4]].map(vf), { stroke: PAL.orange, width: 3 });
  const k2 = (t * 2.2) % 1; points(new Float32Array(vf([0.5, 2.7, 1.3])), { color: '#ff3b30', size: 5, alpha: k2 < 0.25 ? 1 : 0.15, glow: k2 < 0.25 ? 2.5 : 0, glowColor: '#ff3b30', fade: false });
  points(new Float32Array(vf([-0.5, 2.7, 1.3])), { color: '#3a7bff', size: 5, alpha: k2 > 0.5 && k2 < 0.75 ? 1 : 0.15, glow: k2 > 0.5 && k2 < 0.75 ? 2.5 : 0, glowColor: '#3a7bff', fade: false });
}
