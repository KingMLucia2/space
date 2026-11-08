// 二维界面层：无人机侦察界面、生命探测界面、指挥大屏界面、片尾字幕。坐标都以 1920×1080 为准。
import { PAL } from './core.js';
import { clamp, smooth } from './util.js';
export const FONT = '"Noto Sans SC",sans-serif';
export const UI_TEXT = '°·×—“”…′″→∈█░●、。一三上下不与且世两个中串临为主之乐二于云五交亮人从代以仰件任仿会传似但位低住体何作例依侦侧便保信俯倒值做停像元充先光免入全八公六共关具内再写冲准减几凸出函分切划列刚判到制刷刻前剔剧剪力加务动势匀包化区十升半协单占卡卧即厅压原厢去参及双反发取变叠口另只可台右号各合吊同名后向含启吸吹员周味呼命和器噪囊四回团困围固图圆圈在地场坍坐块坪垂型垫埋城域基堆堵塌塔塞填墟声壳处备外多大天太央头奇奔套好如妈始姿子字学完定实室家容宽密察对寻导射小尔尘就尺尾局层屏展履崩工左己已市布帝带帧常幂幅幕干平并广序库应底废度廓延开弃式引弦弧当形影往征径待很循心必态急性息恰悬意感慢成或截所扁扇手才打扣扩扫扬批把投抖折护抬抵拆拉拍拟拢拱持挂指按挡挥挪换排探接推描提插援搜摄摩撞操擦收放效救散数整文斜断新方旋无旧时明星映是显晕景暖暗曲更最有朝期末本术机杆束条来松板构果架某染柱标样核格桅框档桨梁梯棱椅椭楣楼槽模横橇橙次欧正步殊段每气水汇汽沉没沿法泡波注洗流测浮消液淡深渐渲源滑滚满漂演潜激火灯灰灾炸点烁烟热焦照爆片版物特状独率环现玻球璃瓦生用由甲电画界留略疑登的盒盖盘目直相省真眺着瞰矩石码砾确碎示离秒积称移程稳稿空窗竖站端符第等签简算管箱米粒粗糊系素红约级纯纵纹线组细终经结绕绘给绝绞统继续维绿缆缓编缘缝缩网罗罩置美翻翼者而耳聚肋肢肩背胶能脉腹腿臂自致航舱舵舷船色节花荷落蒙蓝虚行街表袋被裁裂要覆见规视角警计认让记设证该语读调象贝负贴走起越足跑距跟跨路跳身躯车转轮轴载辆辑辨边达过迎运近返这进远连送逆选透逐途通速造遍道避邻部都配采里重量钢铺锁锚锥键锯镜长门闪闭间队防阵附陆降除随隙零雷雾震露面顶项顺须颗题颜额风飘飞驱驶驾髋高默齐齿（）＋，：；0123456789';
export const MONO = '"DejaVu Sans Mono","Noto Sans Mono",monospace';

export function brackets(h, x, y, w, ht, L, color, lw = 3) {
  h.strokeStyle = color; h.lineWidth = lw; h.lineCap = 'square';
  for (const [cx, cy, sx, sy] of [[x, y, 1, 1], [x + w, y, -1, 1], [x, y + ht, 1, -1], [x + w, y + ht, -1, -1]]) { h.beginPath(); h.moveTo(cx, cy + sy * L); h.lineTo(cx, cy); h.lineTo(cx + sx * L, cy); h.stroke(); }
}
// 开机式出现：k 0~1，先出边框再出文字
const on = (k, a, b) => smooth(clamp((k - a) / (b - a)));

export function reconHUD(h, t, { heading = 330, alt = 35, spd = 5.4, k = 1, alpha = 1, W = 1920, H = 1080 } = {}) {
  h.save(); const ga = (x) => { h.globalAlpha = x * alpha; };
  const c = 'rgba(200,240,255,0.92)', top = 60, bot = H - 60;
  ga(on(k, 0, 0.4)); brackets(h, 60, top, W - 120, bot - top, 70, c, 3);
  // 准星
  ga(on(k, 0.2, 0.6)); h.strokeStyle = c; h.lineWidth = 2; const cx = W / 2, cy = H / 2;
  for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { h.beginPath(); h.moveTo(cx + dx * 14, cy + dy * 14); h.lineTo(cx + dx * 44, cy + dy * 44); h.stroke(); }
  h.beginPath(); h.arc(cx, cy, 3, 0, 7); h.fillStyle = c; h.fill();
  // 罗盘带
  ga(on(k, 0.3, 0.7)); h.font = `22px ${MONO}`; h.textAlign = 'center'; h.fillStyle = c;
  for (let q = -12; q <= 12; q++) { const deg = Math.round(heading / 5) * 5 + q * 5; const x = cx + (deg - heading) * 14; if (x < 560 || x > W - 560) continue; h.fillRect(x, top + 8, 2, deg % 15 === 0 ? 18 : 9); if (deg % 15 === 0) h.fillText(String(((deg % 360) + 360) % 360).padStart(3, '0'), x, top + 50); }
  h.beginPath(); h.moveTo(cx, top + 30); h.lineTo(cx - 8, top + 44); h.lineTo(cx + 8, top + 44); h.fill();
  // 高度、速度刻度尺
  ga(on(k, 0.4, 0.8)); h.lineWidth = 2; h.strokeStyle = c;
  for (const [x0, val, lab, dir] of [[150, spd, 'SPD', 1], [W - 150, alt, 'ALT', -1]]) {
    h.beginPath(); h.moveTo(x0, cy - 200); h.lineTo(x0, cy + 200); h.stroke();
    for (let q = -10; q <= 10; q++) { const v = Math.round(val) + q; const y = cy - (v - val) * 20; if (y < cy - 200 || y > cy + 200) continue; h.beginPath(); h.moveTo(x0, y); h.lineTo(x0 + dir * (v % 5 === 0 ? 18 : 9), y); h.stroke(); }
    h.textAlign = dir > 0 ? 'left' : 'right'; h.font = `26px ${MONO}`; h.fillText(`${lab} ${val.toFixed(1)}`, x0 + dir * 30, cy + 9);
  }
  ga(on(k, 0.5, 0.9)); h.textAlign = 'left'; h.font = `24px ${FONT}`; h.fillText('空中侦察 · 测绘 + 热成像', 110, bot - 24);
  h.font = `22px ${MONO}`; h.textAlign = 'right'; h.fillText('N 30°38′12″  E 104°04′51″', W - 110, bot - 24);
  if ((t % 1) < 0.6) { h.fillStyle = '#ff3b30'; h.beginPath(); h.arc(116, top + 40, 9, 0, 7); h.fill(); }
  h.fillStyle = c; h.textAlign = 'left'; h.font = `24px ${MONO}`; h.fillText('REC', 136, top + 48);
  h.restore();
}

// 生命探测界面：box 为目标框（屏幕坐标），found 0~1
export function detectHUD(h, t, { box = [860, 520, 300, 170], found = 1, k = 1, alpha = 1, W = 1920, H = 1080 } = {}) {
  h.save(); const ga = (x) => { h.globalAlpha = x * alpha; };
  const top = 60, bot = H - 60; const blue = 'rgba(130,210,255,0.95)';
  ga(on(k, 0, 0.4)); brackets(h, 60, top, W - 120, bot - top, 60, 'rgba(120,200,255,0.65)', 2);
  ga(on(k, 0.2, 0.6)); h.font = `26px ${FONT}`; h.fillStyle = blue; h.textAlign = 'left';
  h.fillText('生命探测 · 雷达 + 红外', 100, top + 50);
  h.font = `22px ${MONO}`; h.fillText(`SCAN ${(t * 37 % 100).toFixed(0).padStart(2, '0')}%  RANGE 6.0 m`, 100, top + 86);
  // 扫描线
  const sy = top + ((t * 0.6) % 1) * (bot - top);
  const g = h.createLinearGradient(0, sy - 70, 0, sy); g.addColorStop(0, 'rgba(80,180,255,0)'); g.addColorStop(1, 'rgba(80,180,255,0.16)');
  ga(on(k, 0, 0.3)); h.fillStyle = g; h.fillRect(60, sy - 70, W - 120, 70);
  if (found > 0) {
    const [x, y, w, ht] = box; const q = Math.min(1, found);
    const red = `rgba(255,80,60,${0.95 * q})`; ga(1);
    brackets(h, x - (1 - q) * 80, y - (1 - q) * 50, w + (1 - q) * 160, ht + (1 - q) * 100, 34, red, 4);
    h.fillStyle = red; h.beginPath(); h.arc(x + w / 2, y + ht / 2, 9 + 3 * Math.sin(t * 8), 0, 7); h.fill();
    let tx = x + w + 40, ty = y + 20; if (tx > W - 520) { tx = x - 470; if (tx < 90) { tx = W - 600; ty = 190; } }
    h.font = `bold 40px ${FONT}`; h.fillText('发现生命体征', tx, ty);
    h.font = `26px ${MONO}`; h.fillStyle = `rgba(255,225,215,${0.95 * q})`;
    h.fillText('埋深 1.5 m   置信度 97%', tx, ty + 46);
    h.fillText('呼吸 16 次/分  心率 92', tx, ty + 84);
    // 心电波形
    const px = W - 640, py = bot - 160, pw = 540, ph = 110;
    h.strokeStyle = `rgba(255,90,70,${0.5 * q})`; h.lineWidth = 1.5; h.strokeRect(px, py, pw, ph);
    h.strokeStyle = `rgba(255,110,90,${0.95 * q})`; h.lineWidth = 3; h.beginPath();
    for (let i = 0; i <= pw; i += 3) {
      const ph2 = ((i / pw) * 3 - t * 1.5) % 1; const u = ph2 < 0 ? ph2 + 1 : ph2;
      const beat = Math.exp(-(((u - 0.3) / 0.012) ** 2)) - Math.exp(-(((u - 0.33) / 0.015) ** 2)) * 0.35 + Math.exp(-(((u - 0.55) / 0.05) ** 2)) * 0.18;
      const yy = py + ph * 0.6 - beat * ph * 0.5 * q;
      if (i === 0) h.moveTo(px + i, yy); else h.lineTo(px + i, yy);
    }
    h.stroke();
  }
  h.restore();
}

// —— 指挥大屏界面（画在 1920×1080 的“屏幕像素”坐标里） ——
// st: { title, sub, count, alpha(整体), dots:[{x,y,state(0无 0~1出现 1红 1~2变绿), id}], t, legend }
export function screenUI(h, st) {
  const t = st.t || 0; const A = st.alpha ?? 1; if (A <= 0) return;
  h.save(); h.globalAlpha = A;
  h.fillStyle = 'rgba(3,12,22,0.78)'; h.fillRect(0, 0, 1920, 86);
  h.strokeStyle = 'rgba(90,190,255,0.55)'; h.lineWidth = 2; h.beginPath(); h.moveTo(0, 86); h.lineTo(1920, 86); h.stroke();
  h.fillStyle = '#d6efff'; h.font = `bold 44px ${FONT}`; h.textBaseline = 'middle'; h.textAlign = 'left'; h.fillText(st.title || '灾区生命探测态势', 40, 45);
  h.font = `30px ${FONT}`; h.fillStyle = '#7cc4ee'; h.fillText(st.sub || '空地协同 · 实时回传', 560, 47);
  const sec = Math.floor(2537 + t); h.font = `28px ${MONO}`; h.textAlign = 'right'; h.fillStyle = '#9fd6f5';
  h.fillText(`T+${String(Math.floor(sec / 3600)).padStart(2, '0')}:${String(Math.floor(sec / 60) % 60).padStart(2, '0')}:${String(sec % 60).padStart(2, '0')}`, 1880, 47);
  if ((t % 1) < 0.55) { h.fillStyle = '#ff3b30'; h.beginPath(); h.arc(1640, 46, 8, 0, 7); h.fill(); }
  h.fillStyle = '#9fd6f5'; h.font = `24px ${MONO}`; h.textAlign = 'left'; h.fillText('LIVE', 1656, 47);
  brackets(h, 24, 108, 1872, 948, 56, 'rgba(90,190,255,0.6)', 4);
  // 图例
  h.font = `26px ${FONT}`; h.textAlign = 'left';
  h.fillStyle = 'rgba(3,12,22,0.72)'; h.fillRect(50, 968, 330, 64);
  h.fillStyle = PAL.red; h.beginPath(); h.arc(80, 1000, 10, 0, 7); h.fill(); h.fillStyle = '#d6efff'; h.fillText('待救援', 100, 1001);
  h.fillStyle = PAL.green; h.beginPath(); h.arc(230, 1000, 10, 0, 7); h.fill(); h.fillStyle = '#d6efff'; h.fillText('已救出', 250, 1001);
  // 计数框
  if (st.count) {
    h.fillStyle = 'rgba(3,12,22,0.8)'; h.fillRect(1380, 930, 500, 104); h.strokeStyle = '#3aa8ff'; h.lineWidth = 3; h.strokeRect(1380, 930, 500, 104);
    h.font = `bold 54px ${FONT}`; h.fillStyle = '#eaf6ff'; h.textAlign = 'left'; h.fillText(st.count, 1410, 983);
  }
  h.restore();
}
// 被困者点：在“屏幕像素”坐标画，st 0~1 出现，1~2 由红变绿
export function drawDot(h, x, y, s, t, i, A = 1, R = 11, ringK = 1, labelK = 1) {
  if (s <= 0 || A <= 0) return;
  const appear = clamp(s), g = clamp(s - 1); const col = g < 0.5 ? PAL.red : PAL.green;
  h.save(); h.globalAlpha = A;
  const r = R * (0.6 + 0.4 * smooth(appear));
  const ph = ((t * 0.8 + i * 0.37) % 1); h.strokeStyle = col; h.lineWidth = 2.5; h.globalAlpha = A * (1 - ph) * (1 - g * 0.6) * appear * ringK;
  h.beginPath(); h.arc(x, y, r * (1.3 + 2.6 * ph), 0, 7); h.stroke();
  // 由红变绿：绿色从圆心向外铺开，边缘一圈亮线
  h.globalAlpha = A * appear; h.fillStyle = g < 1 ? PAL.red : PAL.green; h.beginPath(); h.arc(x, y, r, 0, 7); h.fill();
  if (g > 0 && g < 1) { const rg = r * smooth(g); h.fillStyle = PAL.green; h.beginPath(); h.arc(x, y, rg, 0, 7); h.fill(); h.strokeStyle = 'rgba(230,255,245,0.9)'; h.lineWidth = Math.max(1.5, r * 0.022); h.globalAlpha = A * 0.85 * (1 - g); h.beginPath(); h.arc(x, y, rg, 0, 7); h.stroke(); h.globalAlpha = A; }
  if (appear < 1) { h.globalAlpha = A * (1 - appear); h.strokeStyle = '#fff'; h.lineWidth = 2; h.beginPath(); h.arc(x, y, r * (1 + 3 * appear), 0, 7); h.stroke(); }
  h.globalAlpha = A * appear * 0.9 * labelK; h.font = `20px ${MONO}`; h.fillStyle = '#ffe2dc'; h.textAlign = 'left'; h.textBaseline = 'middle'; h.fillText(String(i + 1).padStart(2, '0'), x + r + 8, y - r - 4);
  h.restore();
}
export function mixHex(a, b, k) {
  const pa = [1, 3, 5].map((i) => parseInt(a.slice(i, i + 2), 16)), pb = [1, 3, 5].map((i) => parseInt(b.slice(i, i + 2), 16));
  return `rgb(${pa.map((v, i) => Math.round(v + (pb[i] - v) * k)).join(',')})`;
}

export function titleCard(h, t, { name = '六合', full = '空地协同生命搜救系统', slogan = '上天入地，不放弃每一个生命', W = 1920, H = 1080 } = {}) {
  const a1 = smooth((t - 0.4) / 0.9), a2 = smooth((t - 1.7) / 0.9);
  h.save(); h.textAlign = 'center'; h.textBaseline = 'middle';
  h.shadowColor = 'rgba(0,50,25,0.35)'; h.shadowBlur = 24;
  h.globalAlpha = a1; h.fillStyle = '#ffffff';
  h.font = `bold 150px ${FONT}`; h.fillText(name, W / 2, H / 2 - 120 + (1 - a1) * 20);
  h.font = `500 46px ${FONT}`; h.fillText(full, W / 2, H / 2 - 10 + (1 - a1) * 14);
  h.globalAlpha = a2; h.fillStyle = 'rgba(255,255,255,0.8)'; h.fillRect(W / 2 - 160 * a2, H / 2 + 52, 320 * a2, 3);
  h.fillStyle = '#ffffff'; h.font = `500 54px ${FONT}`; h.fillText(slogan, W / 2, H / 2 + 120);
  h.restore();
}
