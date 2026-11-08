// 2D 叠加层：无人机侦察界面、生命探测界面、片尾字幕卡。全部画在 1920×1080 的 HUD 画布上，由调色通道合成。
const FONT = '"Noto Sans SC","WenQuanYi Zen Hei",sans-serif';
const MONO = '"DejaVu Sans Mono","Noto Sans Mono",monospace';

function brackets(h, x, y, w, ht, L, color, lw = 3) {
  h.strokeStyle = color; h.lineWidth = lw;
  for (const [cx, cy, sx, sy] of [[x, y, 1, 1], [x + w, y, -1, 1], [x, y + ht, 1, -1], [x + w, y + ht, -1, -1]]) { h.beginPath(); h.moveTo(cx, cy + sy * L); h.lineTo(cx, cy); h.lineTo(cx + sx * L, cy); h.stroke(); }
}

export function reconHUD(h, t, { heading = 270, alt = 32, spd = 6, alpha = 1, W = 1920, H = 1080, bars = 0.105 } = {}) {
  h.save(); h.globalAlpha = alpha;
  const top = H * bars + 30, bot = H * (1 - bars) - 30;
  const c = 'rgba(210,240,255,0.9)';
  brackets(h, 60, top, W - 120, bot - top, 70, c, 3);
  // 准星
  h.strokeStyle = c; h.lineWidth = 2; const cx = W / 2, cy = H / 2;
  for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { h.beginPath(); h.moveTo(cx + dx * 14, cy + dy * 14); h.lineTo(cx + dx * 44, cy + dy * 44); h.stroke(); }
  h.beginPath(); h.arc(cx, cy, 3, 0, 7); h.fillStyle = c; h.fill();
  // 测绘网格
  h.strokeStyle = 'rgba(120,220,255,0.22)'; h.lineWidth = 1;
  for (let x = 0; x <= W; x += 120) { h.beginPath(); h.moveTo(x, top); h.lineTo(x, bot); h.stroke(); }
  for (let y = top; y <= bot; y += 120) { h.beginPath(); h.moveTo(60, y); h.lineTo(W - 60, y); h.stroke(); }
  // 罗盘带
  h.font = `22px ${MONO}`; h.textAlign = 'center'; h.fillStyle = c;
  for (let k = -12; k <= 12; k++) { const deg = Math.round(heading / 5) * 5 + k * 5; const x = cx + (deg - heading) * 14; if (x < 500 || x > W - 500) continue; h.fillRect(x, top + 8, 2, deg % 15 === 0 ? 18 : 9); if (deg % 15 === 0) h.fillText(String(((deg % 360) + 360) % 360).padStart(3, '0'), x, top + 50); }
  h.beginPath(); h.moveTo(cx, top + 30); h.lineTo(cx - 8, top + 44); h.lineTo(cx + 8, top + 44); h.fill();
  // 读数
  h.textAlign = 'left'; h.font = `26px ${MONO}`;
  h.fillText(`ALT ${alt.toFixed(1)} m`, W - 330, cy - 20); h.fillText(`SPD ${spd.toFixed(1)} m/s`, 120, cy - 20);
  h.font = `24px ${FONT}`; h.fillText('空中侦察 · 测绘 + 热成像', 120, bot - 20);
  h.font = `22px ${MONO}`; h.fillText('N 30°38′12″  E 104°04′51″', W - 520, bot - 20);
  if ((t % 1) < 0.6) { h.fillStyle = '#ff3b30'; h.beginPath(); h.arc(126, top + 34, 9, 0, 7); h.fill(); }
  h.fillStyle = c; h.font = `24px ${MONO}`; h.fillText('REC', 146, top + 42);
  h.restore();
}

export function detectHUD(h, t, { box = [860, 520, 300, 170], found = 1, alpha = 1, W = 1920, H = 1080, bars = 0.105 } = {}) {
  h.save(); h.globalAlpha = alpha;
  const top = H * bars + 30, bot = H * (1 - bars) - 30;
  const blue = 'rgba(120,200,255,0.95)';
  brackets(h, 60, top, W - 120, bot - top, 60, 'rgba(120,200,255,0.6)', 2);
  h.font = `26px ${FONT}`; h.fillStyle = blue; h.textAlign = 'left';
  h.fillText('生命探测 · 雷达 + 红外', 100, top + 50);
  // 扫描线
  const sy = top + ((t * 0.5) % 1) * (bot - top);
  const g = h.createLinearGradient(0, sy - 60, 0, sy); g.addColorStop(0, 'rgba(80,180,255,0)'); g.addColorStop(1, 'rgba(80,180,255,0.18)');
  h.fillStyle = g; h.fillRect(60, sy - 60, W - 120, 60);
  if (found > 0) {
    const [x, y, w, ht] = box; const k = Math.min(1, found);
    const red = `rgba(255,70,50,${0.95 * k})`;
    brackets(h, x - (1 - k) * 80, y - (1 - k) * 50, w + (1 - k) * 160, ht + (1 - k) * 100, 34, red, 4);
    h.fillStyle = red; h.beginPath(); h.arc(x + w / 2, y + ht / 2, 10 + 3 * Math.sin(t * 8), 0, 7); h.fill();
    h.font = `bold 40px ${FONT}`; h.fillText('发现生命体征', x + w + 34, y + 20);
    h.font = `26px ${MONO}`; h.fillStyle = 'rgba(255,220,210,0.95)';
    h.fillText('埋深 1.6 m   置信度 97%', x + w + 34, y + 66);
    h.fillText('呼吸 16 次/分  心率 92', x + w + 34, y + 104);
    // 心电波形
    const px = W - 640, py = bot - 150, pw = 540, ph = 110;
    h.strokeStyle = 'rgba(255,90,70,0.5)'; h.lineWidth = 1.5; h.strokeRect(px, py, pw, ph);
    h.strokeStyle = 'rgba(255,110,90,0.95)'; h.lineWidth = 3; h.beginPath();
    for (let i = 0; i <= pw; i += 3) {
      const ph2 = ((i / pw) * 3 - t * 1.5) % 1; const u = ph2 < 0 ? ph2 + 1 : ph2;
      const beat = Math.exp(-(((u - 0.3) / 0.012) ** 2)) * 1.0 - Math.exp(-(((u - 0.33) / 0.015) ** 2)) * 0.35 + Math.exp(-(((u - 0.55) / 0.05) ** 2)) * 0.18;
      const yy = py + ph * 0.6 - beat * ph * 0.5 * k;
      if (i === 0) h.moveTo(px + i, yy); else h.lineTo(px + i, yy);
    }
    h.stroke();
  }
  h.restore();
}

export function titleCard(h, t, { name = '六合', full = '空地协同生命搜救系统', slogan = '上天入地，不放弃每一个生命', team = '', W = 1920, H = 1080 } = {}) {
  const a1 = Math.min(1, Math.max(0, (t - 0.3) / 0.8)), a2 = Math.min(1, Math.max(0, (t - 1.6) / 0.8)), a3 = Math.min(1, Math.max(0, (t - 2.8) / 0.8));
  h.save(); h.textAlign = 'center'; h.textBaseline = 'middle';
  h.shadowColor = 'rgba(0,40,10,0.35)'; h.shadowBlur = 24;
  h.globalAlpha = a1; h.fillStyle = '#ffffff';
  h.font = `bold 150px ${FONT}`; h.fillText(name, W / 2, H / 2 - 120 + (1 - a1) * 20);
  h.font = `500 46px ${FONT}`; h.fillText(full, W / 2, H / 2 - 10 + (1 - a1) * 14);
  h.globalAlpha = a2; h.fillStyle = 'rgba(255,255,255,0.75)'; h.fillRect(W / 2 - 160 * a2, H / 2 + 52, 320 * a2, 3);
  h.fillStyle = '#ffffff'; h.font = `500 54px ${FONT}`; h.fillText(slogan, W / 2, H / 2 + 120);
  if (team) { h.globalAlpha = a3; h.font = `32px ${FONT}`; h.fillStyle = 'rgba(255,255,255,0.85)'; h.fillText(team, W / 2, H - 140); }
  h.restore();
}
