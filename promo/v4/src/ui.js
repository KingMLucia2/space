// 第四版界面层：任务仿真仪表盘（二维画布，1920×1080）。参考“拆解仿真器”：暖白卡片、等宽大写小标签、橙色强调、绿色状态标签。
// drawUI(h, s)：s = { T 全片时间, boot 0~1 开机进度, alpha, mode, view, status, sub, telemetry..., cursor, labels[] }
import { COL } from './engine.js';
import { clamp, lerp, smooth, smoother } from './util.js';

export const FONT = '"Noto Sans SC",sans-serif', MONO = '"DejaVu Sans Mono","Noto Sans Mono",monospace';
export const STAGES = [
  { k: '灾情', en: 'DISASTER', t0: 0, t1: 14.5, word: '灾情研判', sub: 'M7.2 · 城区 42 栋倒塌' },
  { k: '出发', en: 'LAUNCH', t0: 14.5, t1: 28.5, word: '结合出发', sub: 'COMBINED · 0% APART' },
  { k: '分离', en: 'SEPARATE', t0: 28.5, t1: 37.5, word: '空地分离', sub: 'DETACH · LATCH OPEN' },
  { k: '侦察', en: 'RECON', t0: 37.5, t1: 41.5, word: '空中侦察', sub: 'LIDAR · 2.4 M PTS/S' },
  { k: '搜寻', en: 'SEARCH', t0: 41.5, t1: 52, word: '地面搜寻', sub: 'RADAR + IR · 6.0 M' },
  { k: '回传', en: 'RELAY', t0: 52, t1: 66, word: '信号回传', sub: 'MESH RELAY · 8 SIGNALS' },
  { k: '结合', en: 'REJOIN', t0: 66, t1: 76.5, word: '重新结合', sub: 'DOCK · LATCH LOCKED' },
  { k: '救援', en: 'RESCUE', t0: 76.5, t1: 91.9, word: '协同救援', sub: 'HOIST · STRETCHER' },
  { k: '返航', en: 'RETURN', t0: 91.9, t1: 99.4, word: '返航充电', sub: 'BASE · CHARGING' },
  { k: '完成', en: 'COMPLETE', t0: 99.4, t1: 112.4, word: '全部救出', sub: '8 / 8 SAVED' },
];
export const stageAt = (T) => { let i = 0; while (i < STAGES.length - 1 && T >= STAGES[i + 1].t0) i++; return i; };
export const UI_TEXT = '六合空地协同生命搜救系统上天入地，不放弃每一个生命六轴无人机六足机器人' + STAGES.map((s) => s.k + s.word + s.sub).join('') +
  '电量旋翼转速六足负载飞行生命信号子系统任务日志剩余黄金救援时间小时激光雷达探测对接锁扣中继链路基站状态指挥中心栋倒塌城区已救出待救援最新埋深心率呼吸次分置信度巡航高度速度航向锁定打开连接充电扫描待命行走收起悬停出发返航完成沙盘棚拍视图模型拆解全部发现被困者号定位坐标米秒仿真程序化机身腿旋翼台个第版科技公司宣传片片尾字幕导演制作人员通用接口载荷履带潜水机器人无人船四轴八轴，、·：（）—/+%°0123456789';

// —— 绘制小工具 ——
const sp = (h, s) => { h.letterSpacing = s; };
function mono(h, txt, x, y, size = 12, color = COL.ink2, spacing = 3, align = 'left', weight = 500) { h.font = `${weight} ${size}px ${MONO}`; sp(h, `${spacing}px`); h.fillStyle = color; h.textAlign = align; h.fillText(txt, x, y); sp(h, '0px'); }
function txt(h, s, x, y, size = 16, color = COL.ink, weight = 500, align = 'left') { h.font = `${weight} ${size}px ${FONT}`; h.fillStyle = color; h.textAlign = align; h.fillText(s, x, y); }
function card(h, x, y, w, ht, title, idx, a = 1) {
  h.save(); h.globalAlpha *= a; h.shadowColor = 'rgba(60,45,30,0.08)'; h.shadowBlur = 18; h.shadowOffsetY = 4; h.fillStyle = 'rgba(251,250,247,0.94)'; h.beginPath(); h.roundRect(x, y, w, ht, 8); h.fill(); h.shadowColor = 'transparent';
  h.strokeStyle = 'rgba(29,30,33,0.10)'; h.lineWidth = 1; h.stroke();
  h.fillStyle = COL.orange; h.fillRect(x + 18, y + 18, 3, 15); mono(h, title, x + 30, y + 31, 14, COL.ink, 4, 'left', 700); if (idx) mono(h, idx, x + w - 18, y + 31, 12, COL.ink2, 2, 'right'); h.restore();
}
function segBar(h, x, y, w, ht, n, k, cols) { const g = 3, sw = (w - g * (n - 1)) / n; for (let i = 0; i < n; i++) { h.fillStyle = i < Math.round(k * n) ? (cols ? cols(i) : COL.orange) : 'rgba(29,30,33,0.10)'; h.fillRect(x + i * (sw + g), y, sw, ht); } }
function tag(h, s, x, y, col, filled = true) { h.font = `700 11px ${MONO}`; sp(h, '1.5px'); const w = h.measureText(s).width + 14; h.fillStyle = filled ? col : 'rgba(0,0,0,0)'; h.strokeStyle = col; h.lineWidth = 1; h.beginPath(); h.roundRect(x - w, y - 13, w, 18, 3); if (filled) h.fill(); else h.stroke(); h.fillStyle = filled ? '#fff' : col; h.textAlign = 'right'; h.fillText(s, x - 7, y + 0.5); sp(h, '0px'); }
function fmtT(sec) { sec = Math.max(0, Math.floor(sec)); return `${String(Math.floor(sec / 3600)).padStart(2, '0')}:${String(Math.floor(sec / 60) % 60).padStart(2, '0')}:${String(sec % 60).padStart(2, '0')}`; }
export function cursorArrow(h, x, y, click = 0, a = 1) {
  if (a <= 0) return; h.save(); h.globalAlpha *= a;
  if (click > 0) { h.strokeStyle = COL.orange; h.lineWidth = 2; h.globalAlpha *= 1 - click; h.beginPath(); h.arc(x, y, 8 + click * 26, 0, 7); h.stroke(); h.globalAlpha = a; }
  h.translate(x, y); h.scale(1.15, 1.15); h.beginPath(); h.moveTo(0, 0); h.lineTo(0, 19); h.lineTo(4.6, 14.6); h.lineTo(8, 22); h.lineTo(10.6, 20.8); h.lineTo(7.3, 13.6); h.lineTo(13.5, 13.4); h.closePath();
  h.fillStyle = '#111'; h.strokeStyle = '#fff'; h.lineWidth = 1.6; h.lineJoin = 'round'; h.fill(); h.stroke(); h.restore();
}
// 标注：锚点（三维投影点）→ 折线 → 文字块（白色圆角卡片：粗体标题＋小字说明）
export function callout(h, p, title, sub, dx, dy, a = 1, accent = COL.orange) {
  if (!p || a <= 0.01) return; h.save(); h.globalAlpha *= a;
  const ex = p.x + dx, ey = p.y + dy; h.strokeStyle = accent; h.lineWidth = 1.4; h.beginPath(); h.moveTo(p.x, p.y); h.lineTo(ex, ey); h.lineTo(ex + (dx > 0 ? 24 : -24), ey); h.stroke();
  h.fillStyle = accent; h.beginPath(); h.arc(p.x, p.y, 3.5, 0, 7); h.fill(); h.strokeStyle = accent; h.globalAlpha *= 0.5; h.beginPath(); h.arc(p.x, p.y, 8, 0, 7); h.stroke(); h.globalAlpha = a;
  h.font = `700 17px ${FONT}`; const w1 = h.measureText(title).width; h.font = `500 12px ${MONO}`; sp(h, '1px'); const w2 = sub ? h.measureText(sub).width : 0; sp(h, '0px'); const bw = Math.max(w1, w2) + 26, bh = sub ? 52 : 34;
  const bx = dx > 0 ? ex + 24 : ex - 24 - bw, by = ey - bh / 2;
  h.shadowColor = 'rgba(60,45,30,0.10)'; h.shadowBlur = 12; h.shadowOffsetY = 3; h.fillStyle = 'rgba(253,252,250,0.96)'; h.beginPath(); h.roundRect(bx, by, bw, bh, 6); h.fill(); h.shadowColor = 'transparent';
  h.fillStyle = accent; h.fillRect(bx, by + 8, 3, bh - 16);
  txt(h, title, bx + 13, by + 23, 17, COL.ink, 700); if (sub) mono(h, sub, bx + 13, by + 41, 12, COL.ink2, 1);
  h.restore();
}

// —— 完整仪表盘（指挥中心大屏上用：左右两列大卡片、子系统、任务日志） ——
function drawFull(h, s, a0) {
  const T = s.T; if (a0 <= 0) return; const boot = s.boot ?? 1; const st = stageAt(T), S = STAGES[st];
  const on = (i, n = 8) => smoother(clamp(boot * (n + 2) - i)); // 开机：各元素依次出现
  h.save(); h.globalAlpha = a0; h.textBaseline = 'alphabetic';
  { const g = h.createLinearGradient(0, 0, 0, 190); g.addColorStop(0, 'rgba(242,239,234,0.92)'); g.addColorStop(0.62, 'rgba(242,239,234,0.75)'); g.addColorStop(1, 'rgba(242,239,234,0)'); h.globalAlpha = a0 * on(0); h.fillStyle = g; h.fillRect(0, 0, 1920, 190); h.globalAlpha = a0; }
  // 顶栏：标识块、标题
  { const k = on(0); h.save(); h.globalAlpha *= k; h.translate(0, -30 * (1 - k));
    h.fillStyle = COL.orange; h.fillRect(0, 0, 196, 108); h.strokeStyle = '#fff'; h.lineWidth = 3; h.lineJoin = 'round';
    h.beginPath(); for (let i = 0; i < 6; i++) { const ang = i * Math.PI / 3 + Math.PI / 6; h.lineTo(52 + Math.cos(ang) * 20, 54 + Math.sin(ang) * 20); } h.closePath(); h.stroke();
    for (let i = 0; i < 6; i++) { const ang = i * Math.PI / 3 + Math.PI / 6; h.beginPath(); h.arc(52 + Math.cos(ang) * 29, 54 + Math.sin(ang) * 29, 5, 0, 7); h.stroke(); } h.fillStyle = '#fff'; h.beginPath(); h.arc(52, 54, 5, 0, 7); h.fill();
    mono(h, 'LH-6', 92, 64, 26, '#fff', 5, 'left', 700);
    mono(h, 'AIR-GROUND SEARCH & RESCUE · 空地协同', 222, 34, 13, COL.ink2, 4); txt(h, '六合 LH-6', 220, 80, 46, COL.ink, 900); h.font = `900 46px ${FONT}`; const tw = h.measureText('六合 LH-6').width; txt(h, '/', 250 + tw, 80, 46, COL.orange, 500);
    mono(h, 'HEXAPOD × HEXACOPTER / MISSION SIMULATOR', 222, 102, 13, COL.ink2, 4); h.restore(); }
  // 顶栏中部：黄金 72 小时倒计时
  { const k = on(1); h.save(); h.globalAlpha *= k; const remain = 72 * 3600 - 340 - T * 60; mono(h, 'RESCUE WINDOW · 黄金 72 小时', 820, 34, 12, COL.ink2, 3); mono(h, fmtT(remain), 1246, 34, 13, COL.orange, 2, 'right', 700);
    segBar(h, 820, 46, 426, 14, 36, remain / (72 * 3600), (i) => (i < 3 ? COL.orange : COL.ink)); mono(h, 'T+0H', 820, 78, 11, COL.ink2, 2); mono(h, '24H', 962, 78, 11, COL.ink2, 2); mono(h, '48H', 1104, 78, 11, COL.ink2, 2); mono(h, '72H', 1246, 78, 11, COL.ink2, 2, 'right'); h.restore(); }
  // 顶栏右侧：编号、运行时间、状态、操作方
  { const k = on(2); h.save(); h.globalAlpha *= k; const F = [['SIM ID', 'LH6-0917'], ['RUNTIME', fmtT(T)], ['STATUS', S.k], ['OPERATOR', '指挥中心 · 01']]; F.forEach(([l, v], i) => { const x = 1300 + i * 150; if (i) { h.fillStyle = 'rgba(29,30,33,0.12)'; h.fillRect(x - 18, 22, 1, 58); } mono(h, l, x, 34, 12, COL.ink2, 3); if (i === 2) { h.fillStyle = COL.green; h.beginPath(); h.arc(x + 5, 58, 4.5, 0, 7); h.fill(); txt(h, v, x + 16, 65, 19, COL.ink, 700); } else if (i === 3) txt(h, v, x, 65, 17, COL.ink, 600); else mono(h, v, x, 63, 16, COL.ink, 1, 'left', 700); }); h.restore(); }
  // 阶段标签页
  { const k = on(3); h.save(); h.globalAlpha *= k; const n = STAGES.length, pw = 104, gap = 10, x0 = 960 - (n * pw + (n - 1) * gap) / 2, y = 128;
    STAGES.forEach((S2, i) => { const x = x0 + i * (pw + gap); const done = i < st, cur = i === st; h.beginPath(); h.roundRect(x, y, pw, 34, 17);
      if (cur) { h.fillStyle = COL.orange; h.fill(); } else { h.fillStyle = 'rgba(251,250,247,0.9)'; h.fill(); h.strokeStyle = done ? 'rgba(31,169,104,0.6)' : 'rgba(29,30,33,0.14)'; h.lineWidth = 1; h.stroke(); }
      const c = cur ? '#fff' : done ? COL.green : COL.ink2; h.strokeStyle = c; h.lineWidth = 1.5; h.beginPath(); h.arc(x + 20, y + 17, 7, 0, 7); h.stroke();
      if (done) { h.beginPath(); h.moveTo(x + 16.5, y + 17); h.lineTo(x + 19.5, y + 20); h.lineTo(x + 24, y + 14); h.stroke(); } else { h.fillStyle = c; h.beginPath(); h.moveTo(x + 18, y + 13.5); h.lineTo(x + 23.5, y + 17); h.lineTo(x + 18, y + 20.5); h.closePath(); h.fill(); }
      txt(h, S2.k, x + 36, y + 23, 16, cur ? '#fff' : done ? COL.ink : COL.ink2, cur ? 700 : 500); mono(h, String(i + 1).padStart(2, '0'), x + pw - 12, y + 22, 10, cur ? 'rgba(255,255,255,0.8)' : 'rgba(29,30,33,0.35)', 1, 'right'); });
    s.tabPos = (i) => [x0 + i * (pw + gap) + pw / 2, y + 17]; h.restore(); }
  const tel = s.tel || {};
  // 左列：电量、旋翼、六足
  { const k = on(4); const x = 30, w = 346; h.save(); h.globalAlpha *= k; h.translate(-40 * (1 - k), 0);
    card(h, x, 190, w, 196, 'POWER · 电量', '01'); const bat = tel.battery ?? 92; txt(h, `${Math.round(bat)}`, x + 20, 262, 48, COL.ink, 800); h.font = `800 48px ${FONT}`; mono(h, '%', x + 26 + h.measureText(`${Math.round(bat)}`).width, 262, 16, COL.ink2, 0);
    segBar(h, x + 150, 236, 176, 24, 10, bat / 100, (i) => (i < 2 ? COL.orange : COL.green)); mono(h, 'BATTERY · 双电池并联', x + 20, 288, 11, COL.ink2, 2);
    h.fillStyle = 'rgba(29,30,33,0.08)'; h.fillRect(x + 20, 304, w - 40, 1); [['DRAW', `${(tel.draw ?? 2.4).toFixed(1)} kW`], ['CELL', `${(tel.cell ?? 3.92).toFixed(2)} V`], ['TEMP', `${Math.round(tel.temp ?? 36)} °C`]].forEach(([l, v], i) => { mono(h, l, x + 20 + i * 108, 330, 11, COL.ink2, 2); mono(h, v, x + 20 + i * 108, 358, 15, COL.ink, 0, 'left', 700); });
    card(h, x, 402, w, 210, 'ROTORS · 旋翼', '02'); const rpm = tel.rpm ?? 0; txt(h, `${(rpm / 1000).toFixed(1)}`, x + 20, 474, 48, COL.ink, 800); h.font = `800 48px ${FONT}`; mono(h, 'K RPM', x + 28 + h.measureText(`${(rpm / 1000).toFixed(1)}`).width, 474, 14, COL.ink2, 1); mono(h, `${tel.thrust ?? 0}%`, x + w - 20, 474, 22, COL.ink, 0, 'right', 700); mono(h, 'THRUST', x + w - 20, 494, 10, COL.ink2, 2, 'right');
    h.strokeStyle = COL.orange; h.lineWidth = 2; h.beginPath(); for (let i = 0; i <= 260; i += 2) { const u = i / 260; const amp = clamp(rpm / 6000) * 22 * (0.6 + 0.4 * Math.sin(u * 3 + T)); const yy = 548 + Math.sin(u * 40 + T * 9) * amp; i ? h.lineTo(x + 20 + u * (w - 70), yy) : h.moveTo(x + 20, yy); } h.stroke();
    h.fillStyle = COL.orange; h.beginPath(); h.arc(x + w - 50, 548 + Math.sin(40 + T * 9) * clamp(rpm / 6000) * 22, 4, 0, 7); h.fill(); h.setLineDash([3, 3]); h.strokeStyle = 'rgba(29,30,33,0.3)'; h.lineWidth = 1; h.beginPath(); h.moveTo(x + w - 50, 516); h.lineTo(x + w - 50, 582); h.stroke(); h.setLineDash([]);
    mono(h, 'M1–M6 · 160 RAD/S', x + 20, 596, 11, COL.ink2, 2); mono(h, 'NOW', x + w - 50, 596, 10, COL.ink2, 1, 'center');
    card(h, x, 628, w, 238, 'LEG SERVOS · 六足', '03'); const legs = tel.legs || [0, 0, 0, 0, 0, 0]; const lst = tel.legState || 'FOLDED'; tag(h, lst, x + w - 18, 684, lst === 'FOLDED' ? COL.ink2 : COL.green, true); mono(h, 'LOAD PER LEG · KNEE TORQUE', x + 20, 684, 11, COL.ink2, 2);
    ['L1', 'L2', 'L3', 'R1', 'R2', 'R3'].forEach((l, i) => { const y = 712 + i * 25; mono(h, l, x + 20, y + 5, 12, COL.ink, 1, 'left', 700); h.fillStyle = 'rgba(29,30,33,0.08)'; h.fillRect(x + 56, y - 2, 210, 6); h.fillStyle = i === (tel.hotLeg ?? 1) ? COL.orange : COL.ink; h.fillRect(x + 56, y - 2, 210 * clamp(legs[i]), 6); mono(h, `${Math.round(legs[i] * 100)}%`, x + w - 20, y + 5, 12, COL.ink, 0, 'right', 600); });
    h.restore(); }
  // 右列：飞行、生命信号、子系统
  { const k = on(5); const x = 1544, w = 346; h.save(); h.globalAlpha *= k; h.translate(40 * (1 - k), 0);
    card(h, x, 190, w, 196, 'FLIGHT · 飞行', '04'); const cx = x + 74, cy = 300, R = 50; h.fillStyle = 'rgba(29,30,33,0.05)'; h.beginPath(); h.arc(cx, cy, R, 0, 7); h.fill(); h.strokeStyle = 'rgba(29,30,33,0.2)'; h.lineWidth = 1; h.stroke();
    h.save(); h.beginPath(); h.arc(cx, cy, R, 0, 7); h.clip(); h.translate(cx, cy); h.rotate(-(tel.roll ?? 0) * Math.PI / 180); h.fillStyle = 'rgba(29,30,33,0.10)'; h.fillRect(-R, (tel.pitch ?? 0) * 1.5, 2 * R, R); h.strokeStyle = COL.orange; h.lineWidth = 2; h.beginPath(); h.moveTo(-R, (tel.pitch ?? 0) * 1.5); h.lineTo(R, (tel.pitch ?? 0) * 1.5); h.stroke(); h.restore();
    h.strokeStyle = COL.ink; h.lineWidth = 2; h.beginPath(); h.moveTo(cx - 18, cy); h.lineTo(cx - 6, cy); h.lineTo(cx, cy + 5); h.lineTo(cx + 6, cy); h.lineTo(cx + 18, cy); h.stroke();
    [['ALT AGL', `${(tel.alt ?? 0).toFixed(1)} M`], ['V/S', `${(tel.vs ?? 0) >= 0 ? '+' : ''}${(tel.vs ?? 0).toFixed(1)} M/S`], ['PITCH', `${(tel.pitch ?? 0).toFixed(2)}°`], ['ROLL', `${(tel.roll ?? 0).toFixed(2)}°`]].forEach(([l, v], i) => { mono(h, l, x + 150, 248 + i * 30, 11, COL.ink2, 2); mono(h, v, x + w - 20, 248 + i * 30, 14, COL.ink, 0, 'right', 700); });
    h.fillStyle = 'rgba(29,30,33,0.08)'; h.fillRect(x + 20, 362, w - 40, 1); mono(h, 'SPEED', x + 20, 380 - 2, 11, COL.ink2, 2); mono(h, `${(tel.speed ?? 0).toFixed(1)} M/S`, x + 100, 378, 13, COL.ink, 0, 'left', 700); mono(h, 'HDG', x + 200, 378, 11, COL.ink2, 2); mono(h, `${String(Math.round(tel.hdg ?? 330)).padStart(3, '0')}°`, x + w - 20, 378, 13, COL.ink, 0, 'right', 700);
    card(h, x, 402, w, 210, 'LIFE SIGNALS · 生命信号', '05'); const found = tel.found ?? 0, saved = tel.saved ?? 0; txt(h, `${found}`, x + 20, 476, 52, found ? COL.red : COL.ink, 800); h.font = `800 52px ${FONT}`; mono(h, '/ 8 FOUND', x + 28 + h.measureText(`${found}`).width, 476, 15, COL.ink2, 2); mono(h, `${saved}`, x + w - 20, 470, 26, COL.green, 0, 'right', 700); mono(h, 'SAVED', x + w - 20, 490, 10, COL.ink2, 2, 'right');
    for (let i = 0; i < 8; i++) { const xx = x + 20 + i * 39, yy = 512; const isS = i < saved, isF = i < found; h.fillStyle = isS ? COL.green : isF ? COL.red : 'rgba(29,30,33,0.08)'; h.beginPath(); h.roundRect(xx, yy, 32, 32, 6); h.fill(); mono(h, String(i + 1).padStart(2, '0'), xx + 16, yy + 21, 11, isS || isF ? '#fff' : COL.ink2, 0, 'center', 700); }
    mono(h, tel.lifeNote || '待命 · 等待探测', x + 20, 586, 12, COL.ink2, 1); if (found) { h.fillStyle = COL.red; h.beginPath(); h.arc(x + w - 26, 582, 4 + Math.sin(T * 8) * 1.2, 0, 7); h.fill(); }
    card(h, x, 628, w, 238, 'SUBSYSTEMS · 子系统', '06'); const subs = tel.subs || [];
    subs.forEach(([n, name, d, state, col], i) => { const y = 680 + i * 37; mono(h, n, x + 20, y, 11, COL.ink2, 1); txt(h, name, x + 50, y + 1, 15, i === tel.subHot ? COL.orange : COL.ink, 700); mono(h, d, x + 50, y + 18, 10, COL.ink2, 1); tag(h, state, x + w - 18, y + 4, col || COL.green, true); });
    h.restore(); }
  // 底部任务日志
  { const k = on(6); const x = 400, y = 900, w = 1120, ht = 128; h.save(); h.globalAlpha *= k; h.translate(0, 30 * (1 - k));
    card(h, x, y, w, ht, 'MISSION LOG · 任务日志', '07'); h.fillStyle = COL.orange; h.beginPath(); h.arc(x + 54, y + 82, 24, 0, 7); h.fill(); h.fillStyle = '#fff'; h.fillRect(x + 46, y + 72, 5, 20); h.fillRect(x + 57, y + 72, 5, 20);
    const lx0 = x + 100, lx1 = x + w - 30, prog = clamp(T / 112.4); h.fillStyle = 'rgba(29,30,33,0.12)'; h.fillRect(lx0, y + 81, lx1 - lx0, 2); h.fillStyle = COL.orange; h.fillRect(lx0, y + 81, (lx1 - lx0) * prog, 2.5);
    STAGES.forEach((S2) => { const xx = lx0 + (lx1 - lx0) * S2.t0 / 112.4; h.fillStyle = 'rgba(29,30,33,0.35)'; h.fillRect(xx, y + 74, 1.5, 16); });
    h.fillStyle = '#fff'; h.strokeStyle = COL.orange; h.lineWidth = 2.5; h.beginPath(); h.arc(lx0 + (lx1 - lx0) * prog, y + 82, 8, 0, 7); h.fill(); h.stroke();
    mono(h, 'TAKE-OFF · 出发', lx0, y + 60, 11, COL.ink2, 2); mono(h, 'COMPLETE · 完成', lx1, y + 60, 11, COL.ink2, 2, 'right'); mono(h, `OPERATOR · ${S.word}`, (lx0 + lx1) / 2, y + 60, 12, COL.orange, 3, 'center', 700);
    mono(h, `${fmtT(T).slice(3)} / 01:52`, lx0, y + 112, 12, COL.ink2, 2); mono(h, `${STAGES.length} STAGES · ${st + 1}/${STAGES.length}`, lx1, y + 112, 12, COL.ink2, 2, 'right'); h.restore(); }
  // 视口装饰：角标、虚线括号、十字网格、阶段大字
  { const k = on(7); h.save(); h.globalAlpha *= k * 0.9; mono(h, `MODEL LH-6 · REV A`, 410, 202, 12, COL.ink2, 3); mono(h, `VIEW · ${s.view || '沙盘 TABLE'}`, 1510, 202, 12, COL.ink2, 3, 'right');
    h.strokeStyle = 'rgba(236,78,38,0.55)'; h.setLineDash([4, 5]); h.lineWidth = 1; h.beginPath(); h.moveTo(410, 214); h.lineTo(410, 290); h.moveTo(410, 214); h.lineTo(480, 214); h.moveTo(1510, 860); h.lineTo(1510, 784); h.moveTo(1510, 860); h.lineTo(1440, 860); h.stroke(); h.setLineDash([]);
    const w2 = s.word || S.word, sub = s.sub || S.sub; const ws = smooth(clamp((T - S.t0) / 0.35)); h.save(); h.beginPath(); h.rect(400, 760, 700, 130); h.clip(); h.translate(0, 26 * (1 - ws));
    mono(h, `MISSION STAGE ${String(st + 1).padStart(2, '0')}`, 412, 800, 12, COL.ink2, 3); txt(h, w2, 408, 852, 54, COL.orange, 900); mono(h, sub, 412, 878, 12, COL.ink2, 3); h.restore(); h.restore(); }
  // 页脚
  { const k = on(8); h.save(); h.globalAlpha *= k * 0.85; mono(h, 'MISSION SIMULATOR · PROCEDURAL MODEL · 6 LEGS · 6 ROTORS · 1 BASE', 30, 1062, 11, COL.ink2, 3); mono(h, '六合 · 空地协同生命搜救  //////', 1890, 1062, 11, COL.ink2, 3, 'right'); h.restore(); }
  h.restore();
}

// 阶段标签位置（光标点击用）：紧凑布局在顶栏中部，完整布局在顶栏下方
export function tabCenter(i, full = 0) { return full > 0.5 ? [395 + i * 114 + 52, 145] : [513 + i * 90 + 42, 37]; }
// 小卡片：半透明暖白底、细描边、橙色短竖条＋等宽标题
function chip(h, x, y, w, ht, title, idx) {
  h.save(); h.shadowColor = 'rgba(60,45,30,0.06)'; h.shadowBlur = 10; h.shadowOffsetY = 2; h.fillStyle = 'rgba(251,250,247,0.74)'; h.beginPath(); h.roundRect(x, y, w, ht, 7); h.fill(); h.shadowColor = 'transparent';
  h.strokeStyle = 'rgba(29,30,33,0.09)'; h.lineWidth = 1; h.stroke(); h.fillStyle = COL.orange; h.fillRect(x + 12, y + 12, 2.5, 11); mono(h, title, x + 21, y + 22, 10.5, COL.ink, 3, 'left', 700); if (idx) mono(h, idx, x + w - 12, y + 22, 10, COL.ink2, 1, 'right'); h.restore();
}
// —— 紧凑仪表盘（普通镜头）：顶栏收窄、四角小卡片、底部细进度条，画面中部完全留给三维画面 ——
function drawCompact(h, s, a0) {
  // 用户反馈：顶部状态栏和底部进度条挡视野、鼠标点击不要——只保留四角小卡片和左下阶段标题
  const T = s.T; if (a0 <= 0) return; const boot = s.boot ?? 1; const st = stageAt(T), S = STAGES[st]; const tel = s.tel || {};
  const on = (i, n = 3) => smoother(clamp(boot * (n + 2) - i));
  h.save(); h.globalAlpha = a0; h.textBaseline = 'alphabetic';
  { const g2 = h.createRadialGradient(0, 1080, 40, 0, 1080, 620); g2.addColorStop(0, 'rgba(242,239,234,0.62)'); g2.addColorStop(1, 'rgba(242,239,234,0)'); h.globalAlpha = a0 * on(0); h.fillStyle = g2; h.fillRect(0, 760, 760, 320); h.globalAlpha = a0; }
  // 左上：电量、旋翼、六足
  { const k = on(1); const x = 22, w = 230, y0 = 22; h.save(); h.globalAlpha *= k; h.translate(-24 * (1 - k), 0);
    chip(h, x, y0, w, 70, 'POWER · 电量', '01'); const bat = tel.battery ?? 92; txt(h, `${Math.round(bat)}`, x + 14, y0 + 56, 28, COL.ink, 800); h.font = `800 28px ${FONT}`; mono(h, '%', x + 18 + h.measureText(`${Math.round(bat)}`).width, y0 + 56, 12, COL.ink2, 0); segBar(h, x + 96, y0 + 42, 120, 12, 10, bat / 100, (i) => (i < 2 ? COL.orange : COL.green));
    const y1 = y0 + 78; chip(h, x, y1, w, 70, 'ROTORS · 旋翼', '02'); const rpm = tel.rpm ?? 0; txt(h, `${(rpm / 1000).toFixed(1)}`, x + 14, y1 + 56, 28, COL.ink, 800); h.font = `800 28px ${FONT}`; mono(h, 'K RPM', x + 20 + h.measureText(`${(rpm / 1000).toFixed(1)}`).width, y1 + 56, 11, COL.ink2, 1);
    h.strokeStyle = COL.orange; h.lineWidth = 1.6; h.beginPath(); for (let i = 0; i <= 90; i += 2) { const u = i / 90; const amp = clamp(rpm / 6000) * 9; const yy = y1 + 44 + Math.sin(u * 22 + T * 9) * amp; i ? h.lineTo(x + 126 + u * 90, yy) : h.moveTo(x + 126, yy); } h.stroke();
    const y2 = y1 + 78; chip(h, x, y2, w, 70, 'LEGS · 六足', '03'); const legs = tel.legs || [0, 0, 0, 0, 0, 0]; const lst = tel.legState || 'FOLDED'; tag(h, lst, x + w - 12, y2 + 27, lst === 'FOLDED' ? COL.ink2 : COL.green, true);
    legs.forEach((v, i) => { const xx = x + 14 + i * 35; h.fillStyle = 'rgba(29,30,33,0.08)'; h.fillRect(xx, y2 + 42, 28, 14); h.fillStyle = i === (tel.hotLeg ?? 1) ? COL.orange : COL.ink; h.fillRect(xx, y2 + 42 + 14 * (1 - clamp(v)), 28, 14 * clamp(v)); mono(h, ['L1', 'L2', 'L3', 'R1', 'R2', 'R3'][i], xx + 14, y2 + 65, 8.5, COL.ink2, 0, 'center', 600); });
    h.restore(); }
  // 右上：飞行、生命信号
  { const k = on(2); const x = 1668, w = 230, y0 = 22; h.save(); h.globalAlpha *= k; h.translate(24 * (1 - k), 0);
    chip(h, x, y0, w, 70, 'FLIGHT · 飞行', '04'); mono(h, 'ALT', x + 14, y0 + 36, 9.5, COL.ink2, 2); mono(h, `${(tel.alt ?? 0).toFixed(1)} M`, x + 14, y0 + 58, 16, COL.ink, 0, 'left', 700); mono(h, 'SPEED', x + 120, y0 + 36, 9.5, COL.ink2, 2); mono(h, `${(tel.speed ?? 0).toFixed(1)} M/S`, x + 120, y0 + 58, 16, COL.ink, 0, 'left', 700);
    const y1 = y0 + 78; chip(h, x, y1, w, 96, 'LIFE SIGNALS · 生命信号', '05'); const found = tel.found ?? 0, saved = tel.saved ?? 0; txt(h, `${found}`, x + 14, y1 + 54, 30, found ? COL.red : COL.ink, 800); h.font = `800 30px ${FONT}`; mono(h, '/ 8', x + 20 + h.measureText(`${found}`).width, y1 + 54, 12, COL.ink2, 1); mono(h, `${saved}`, x + w - 14, y1 + 52, 18, COL.green, 0, 'right', 700); mono(h, 'SAVED', x + w - 40, y1 + 52, 9, COL.ink2, 1, 'right');
    for (let i = 0; i < 8; i++) { const xx = x + 14 + i * 25.5, yy = y1 + 66; const isS = i < saved, isF = i < found; h.fillStyle = isS ? COL.green : isF ? COL.red : 'rgba(29,30,33,0.08)'; h.beginPath(); h.roundRect(xx, yy, 21, 18, 4); h.fill(); mono(h, String(i + 1), xx + 10.5, yy + 13, 9, isS || isF ? '#fff' : COL.ink2, 0, 'center', 700); }
    h.restore(); }
  // 左下：阶段标题
  { const k = on(0); h.save(); h.globalAlpha *= k; const w2 = s.word || S.word, sub = s.sub || S.sub; const ws = smooth(clamp((T - S.t0) / 0.35));
    h.beginPath(); h.rect(0, 960, 900, 120); h.clip(); h.translate(0, 22 * (1 - ws)); mono(h, `MISSION STAGE ${String(st + 1).padStart(2, '0')}`, 34, 990, 10.5, COL.ink2, 3); txt(h, w2, 30, 1034, 42, COL.orange, 900); mono(h, sub, 34, 1056, 10.5, COL.ink2, 2.5); h.restore(); }
  h.restore();
}
// —— 界面入口：s.full 0 = 紧凑（普通镜头），1 = 完整（指挥中心大屏），中间值交叉淡化 ——
export function drawUI(h, s) {
  const a0 = s.alpha ?? 1; if (a0 <= 0) return; const f = clamp(s.full ?? 0);
  if (f < 1) drawCompact(h, s, a0 * (1 - f)); if (f > 0) drawFull(h, s, a0 * f);
  if (s.cursor) cursorArrow(h, s.cursor.x, s.cursor.y, s.cursor.click || 0, (s.cursor.a ?? 1) * smooth(s.boot ?? 1) * a0);
}
