// 第二版帧驱动：按镜头逐帧绘制；镜头可以声明入场转场（擦除、扫描、光圈、叠化），转场期间同时画上一镜头的延续和本镜头，再按蒙版合成。
// 同一地点的连续镜头不用转场，而是让相机路径跨镜头连续（见 shots.js）。
import { W, H, out, outCtx, composite, flush, resetFrame, mkCanvas, POST, hud } from './core.js';
import { SHOTS } from './shots.js';
import { UI_TEXT } from './hud.js';
import { clamp, smooth } from './util.js';

export const FPS = 30;
const bufA = mkCanvas(W, H), A = bufA.getContext('2d'), bufB = mkCanvas(W, H), B = bufB.getContext('2d');
const fontsReady = Promise.all(['400', '500', '700'].map((w) => document.fonts.load(`${w} 40px "Noto Sans SC"`, UI_TEXT))).catch(() => null);

function renderShot(shot, t, target) {
  resetFrame();
  shot.update(t, { hud });
  flush();
  composite(t, target);
}

window.prepare = async (id) => {
  await fontsReady;
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
  } else if (tr.type === 'iris') { // 新镜头从某点以圆形展开
    const cx = (tr.x ?? 0.5) * W, cy = (tr.y ?? 0.5) * H, r = k * Math.hypot(W, H);
    o.drawImage(bufA, 0, 0); o.save(); o.beginPath(); o.arc(cx, cy, r, 0, Math.PI * 2); o.clip(); o.drawImage(bufB, 0, 0); o.restore();
    o.strokeStyle = 'rgba(160,230,255,0.9)'; o.lineWidth = 3; o.beginPath(); o.arc(cx, cy, r, 0, Math.PI * 2); o.stroke();
  }
  return true;
};
window.shotList = () => SHOTS.map((s) => ({ id: s.id, dur: s.dur }));
window.ready = true;
