// 第二版帧驱动：按镜头逐帧绘制；镜头可以声明入场转场（擦除、扫描、光圈、叠化），转场期间同时画上一镜头的延续和本镜头，再按蒙版合成。
// 同一地点的连续镜头不用转场，而是让相机路径跨镜头连续（见 shots.js）。
import { W, H, out, outCtx, composite, flush, resetFrame, mkCanvas, POST, hud, STYLE, setStyle } from './core.js';
import { SHOTS, COVER_VIEW } from './shots.js';
window.COVER_VIEW = COVER_VIEW; // 调封面构图用
import { UI_TEXT } from './hud.js';
import { clamp, smooth } from './util.js';

export const FPS = 30;
const bufA = mkCanvas(W, H), A = bufA.getContext('2d'), bufB = mkCanvas(W, H), B = bufB.getContext('2d');
const fontsReady = Promise.all(['400', '500', '700'].map((w) => document.fonts.load(`${w} 40px "Noto Sans SC"`, UI_TEXT))).catch(() => null);

// “代码驱动”风格：左侧编辑器面板逐字打出本镜头的源代码（语法高亮），右下角终端显示渲染进度
let SRC = null;
const srcReady = fetch('/v2/src/shots.js').then((r) => r.text()).then((x) => { SRC = x.split('\n'); }).catch(() => null);
function shotCode(id) {
  if (!SRC) return []; const i = SRC.findIndex((l) => l.startsWith(`  ${id}: {`)); if (i < 0) return [];
  let j = i + 1; while (j < SRC.length && !/^  s\d\d: \{/.test(SRC[j]) && !/^};/.test(SRC[j])) j++;
  const out2 = []; for (const l of SRC.slice(i, j)) { const ind = l.match(/^\s*/)[0]; let r = l.trim(); while (r.length > 58) { const k = r.lastIndexOf(' ', 58) > 20 ? r.lastIndexOf(' ', 58) : 58; out2.push(ind + r.slice(0, k)); r = '    ' + r.slice(k).trim(); } out2.push(ind + r); }
  return out2;
}
const KW = /^(const|let|var|function|return|if|else|for|of|in|new|true|false|null|import|from|export)$/;
function codeLine(h, line, x, y) {
  const re = /(\/\/.*$)|('[^']*'|`[^`]*`|"[^"]*")|(\b\d+(?:\.\d+)?\b)|([A-Za-z_$][\w$]*)|(\s+)|(.)/g; let m, cx = x;
  while ((m = re.exec(line))) { const tok = m[0]; let col = '#cfd8e3';
    if (m[1]) col = '#6a9955'; else if (m[2]) col = '#ce9178'; else if (m[3]) col = '#b5cea8'; else if (m[4]) col = KW.test(tok) ? '#c586c0' : (line[re.lastIndex] === '(' ? '#dcdcaa' : '#9cdcfe'); else if (m[6]) col = '#8fa3b8';
    h.fillStyle = col; h.fillText(tok, cx, y); cx += h.measureText(tok).width; }
  return cx;
}
function codeOverlay(h, shot, t) {
  const lines = shotCode(shot.id); if (!lines.length) return;
  const total = lines.reduce((a, l) => a + l.length + 1, 0); let chars = Math.floor(total * Math.min(1, t / (shot.dur * 0.75)));
  h.save(); const x0 = 48, y0 = 70, pw = 660, ph = 860, lh = 23;
  h.fillStyle = 'rgba(3,9,16,0.8)'; h.strokeStyle = 'rgba(90,190,255,0.35)'; h.lineWidth = 1.5; h.beginPath(); h.roundRect(x0, y0, pw, ph, 12); h.fill(); h.stroke();
  h.fillStyle = 'rgba(255,255,255,0.05)'; h.fillRect(x0 + 1, y0 + 1, pw - 2, 38);
  [['#ff5f57', 0], ['#febc2e', 1], ['#28c840', 2]].forEach(([c, k]) => { h.fillStyle = c; h.beginPath(); h.arc(x0 + 22 + k * 22, y0 + 20, 6.5, 0, 7); h.fill(); });
  h.font = '17px "DejaVu Sans Mono", monospace'; h.textBaseline = 'middle'; h.fillStyle = '#9fb3c8'; h.fillText(`shots.js — ${shot.id}`, x0 + 96, y0 + 20);
  h.beginPath(); h.rect(x0, y0 + 40, pw, ph - 44); h.clip();
  const vis = Math.floor((ph - 60) / lh); let shown = 0, lastY = 0, lastX = 0; const rowsTyped = [];
  for (const l of lines) { if (chars <= 0) break; const n = Math.min(l.length, chars); rowsTyped.push(l.slice(0, n)); chars -= l.length + 1; }
  const first = Math.max(0, rowsTyped.length - vis);
  rowsTyped.slice(first).forEach((l, k) => { const y = y0 + 62 + k * lh; h.fillStyle = '#4b5d70'; h.textAlign = 'right'; h.fillText(String(first + k + 1), x0 + 44, y); h.textAlign = 'left'; lastX = codeLine(h, l, x0 + 60, y); lastY = y; });
  if ((t * 2) % 1 < 0.6) { h.fillStyle = '#e8f4ff'; h.fillRect(lastX + 1, lastY - 10, 10, 20); }
  h.restore();
  // 终端
  h.save(); const tx = 1260, ty = 912, tw = 612, th = 120;
  h.fillStyle = 'rgba(2,6,10,0.82)'; h.strokeStyle = 'rgba(90,190,255,0.3)'; h.lineWidth = 1.5; h.beginPath(); h.roundRect(tx, ty, tw, th, 10); h.fill(); h.stroke();
  h.font = '18px "DejaVu Sans Mono", monospace'; h.textBaseline = 'middle'; h.fillStyle = '#7ee787'; h.fillText(`$ node v2/render.mjs --shots ${shot.id}`, tx + 18, ty + 28);
  const tot = Math.round(shot.dur * 30), fr = Math.min(tot, Math.floor(t * 30)), k = Math.min(1, fr / tot); const bar = '█'.repeat(Math.round(k * 24)) + '░'.repeat(24 - Math.round(k * 24));
  h.fillStyle = '#cfd8e3'; h.fillText(`frame ${String(fr).padStart(3, '0')}/${tot}  ${bar} ${Math.round(k * 100)}%`, tx + 18, ty + 62);
  h.fillStyle = '#6b7f93'; h.fillText(`canvas2d · 1920×1080 · ${(160 + 37 * Math.sin(t * 3)).toFixed(0)} ms/frame`, tx + 18, ty + 94);
  h.restore();
}

function renderShot(shot, t, target) {
  resetFrame();
  shot.update(t, { hud });
  if (STYLE.mode === 'code') codeOverlay(hud, shot, t);
  flush();
  composite(t, target);
}
window.setStyle = (m) => setStyle(m);

window.prepare = async (id) => {
  await fontsReady; await srcReady;
  const i = SHOTS.findIndex((s) => s.id === id); if (i < 0) throw new Error('unknown shot ' + id);
  for (const s of [SHOTS[i - 1], SHOTS[i]]) if (s && s.prepare) await s.prepare();
  return { frames: Math.round(SHOTS[i].dur * FPS), dur: SHOTS[i].dur };
};

window.frame = (id, f) => {
  const i = SHOTS.findIndex((s) => s.id === id); const shot = SHOTS[i], prev = SHOTS[i - 1];
  const t = f / FPS; const tr = shot.transIn;
  if (!tr || !prev || t >= tr.dur) { renderShot(shot, t, outCtx); return true; }
  // 转场：上一镜头继续往后走，本镜头从头开始
  renderShot(prev, prev.dur + t, A);
  renderShot(shot, t, B);
  const k = smooth(t / tr.dur);
  const o = outCtx; o.globalCompositeOperation = 'source-over'; o.globalAlpha = 1; o.setTransform(1, 0, 0, 1, 0, 0);
  if (tr.type === 'dissolve') { o.drawImage(bufA, 0, 0); o.globalAlpha = k; o.drawImage(bufB, 0, 0); o.globalAlpha = 1; }
  else if (tr.type === 'wipe') { // 竖直发光扫描线从左到右，左边是新镜头
    const x = k * (W + 120) - 60;
    o.drawImage(bufA, 0, 0); o.save(); o.beginPath(); o.rect(0, 0, Math.max(0, x), H); o.clip(); o.drawImage(bufB, 0, 0); o.restore();
    const g = o.createLinearGradient(x - 90, 0, x + 4, 0); g.addColorStop(0, 'rgba(87,207,255,0)'); g.addColorStop(0.8, 'rgba(87,207,255,0.22)'); g.addColorStop(1, 'rgba(225,248,255,0.95)');
    o.fillStyle = g; o.fillRect(x - 90, 0, 94, H);
    o.globalCompositeOperation = 'lighter'; o.fillStyle = 'rgba(120,220,255,0.10)'; for (let y = 0; y < H; y += 6) o.fillRect(x - 30, y, 30, 2); o.globalCompositeOperation = 'source-over';
  } else if (tr.type === 'scan') { // 水平扫描线从上到下，像设备画面刷新
    const y = k * (H + 80) - 40;
    o.drawImage(bufA, 0, 0); o.save(); o.beginPath(); o.rect(0, 0, W, Math.max(0, y)); o.clip(); o.drawImage(bufB, 0, 0); o.restore();
    const g = o.createLinearGradient(0, y - 70, 0, y + 3); g.addColorStop(0, 'rgba(87,207,255,0)'); g.addColorStop(0.85, 'rgba(87,207,255,0.25)'); g.addColorStop(1, 'rgba(225,248,255,0.95)');
    o.fillStyle = g; o.fillRect(0, y - 70, W, 73);
  } else if (tr.type === 'particles') { // 粒子转场：旧画面碎成粒子旋转飞散，新画面的粒子从四周汇聚成形
    o.fillStyle = '#02070e'; o.fillRect(0, 0, W, H);
    o.globalAlpha = 1 - smooth(k / 0.55); o.drawImage(bufA, 0, 0);
    o.globalAlpha = smooth((k - 0.45) / 0.55); o.drawImage(bufB, 0, 0); o.globalAlpha = 1;
    o.globalCompositeOperation = 'lighter';
    particleBurst(o, bufA, k, 1); particleBurst(o, bufB, 1 - k, -1);
    o.globalCompositeOperation = 'source-over';
  } else if (tr.type === 'iris') { // 新镜头从某点以圆形展开
    const cx = (tr.x ?? 0.5) * W, cy = (tr.y ?? 0.5) * H, r = k * Math.hypot(W, H);
    o.drawImage(bufA, 0, 0); o.save(); o.beginPath(); o.arc(cx, cy, r, 0, Math.PI * 2); o.clip(); o.drawImage(bufB, 0, 0); o.restore();
    o.strokeStyle = 'rgba(160,230,255,0.9)'; o.lineWidth = 3; o.beginPath(); o.arc(cx, cy, r, 0, Math.PI * 2); o.stroke();
  }
  return true;
};
const SMW = 240, SMH = 135; const smallC = mkCanvas(SMW, SMH), SM = smallC.getContext('2d', { willReadFrequently: true });
// 从画面采样亮点生成粒子：q=0 时在原位，q→1 时沿径向加旋转飞散并淡出；dir=1 飞散，-1 汇聚
function particleBurst(o, src, q, dir) {
  if (q >= 0.999) return; SM.clearRect(0, 0, SMW, SMH); SM.drawImage(src, 0, 0, SMW, SMH); const d = SM.getImageData(0, 0, SMW, SMH).data;
  const e = q * q, a = (1 - q) * (dir > 0 ? 1 : 0.9); const cx = W / 2, cy = H / 2;
  for (let y = 0; y < SMH; y++) for (let x = 0; x < SMW; x++) {
    const i = (y * SMW + x) * 4; const r = d[i], g = d[i + 1], b = d[i + 2]; const l = 0.3 * r + 0.59 * g + 0.11 * b; if (l < 38) continue;
    const h = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453; const hr = h - Math.floor(h);
    const px = (x + 0.5) * W / SMW, py = (y + 0.5) * H / SMH; const dx = px - cx, dy = py - cy; const ang = Math.atan2(dy, dx) + dir * e * (1.2 + hr), rad = Math.hypot(dx, dy) * (1 + e * (0.6 + 1.4 * hr)) + e * 260 * hr;
    const X = cx + Math.cos(ang) * rad, Y = cy + Math.sin(ang) * rad - e * 120 * hr * dir;
    const k2 = Math.min(1, 255 / Math.max(80, l)); o.globalAlpha = a * Math.min(1, l / 140); o.fillStyle = `rgb(${Math.min(255, r * k2) | 0},${Math.min(255, g * k2) | 0},${Math.min(255, b * k2) | 0})`;
    const sz = 2 + 2 * hr; o.fillRect(X - sz / 2, Y - sz / 2, sz, sz);
  }
  o.globalAlpha = 1;
}
window.shotList = () => SHOTS.map((s) => ({ id: s.id, dur: s.dur, extra: !!s.extra }));
window.ready = true;
