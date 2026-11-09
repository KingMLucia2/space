// 第四版帧驱动：按镜头逐帧绘制（three.js 三维 → 二维画布叠界面层），镜头之间的转场在二维画布上合成。
import { W, H, mkCanvas, glCanvas, beginFrame, renderGL, FRAME } from './engine.js';
import { SHOTS } from './shots.js';
import { UI_TEXT } from './ui.js';
import { clamp, smooth } from './util.js';

export const FPS = 30;
const out = mkCanvas(W, H); document.body.appendChild(out); const O = out.getContext('2d');
export const hudC = mkCanvas(W, H); export const hud = hudC.getContext('2d');
const bufA = mkCanvas(W, H), A = bufA.getContext('2d'), bufB = mkCanvas(W, H), B = bufB.getContext('2d');
const grainC = mkCanvas(256, 256); { const g = grainC.getContext('2d'), d = g.createImageData(256, 256); let s = 12345; const r = () => ((s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff); for (let i = 0; i < d.data.length; i += 4) { const v = r() * 255; d.data[i] = d.data[i + 1] = d.data[i + 2] = v; d.data[i + 3] = 255; } g.putImageData(d, 0, 0); }
const fontsReady = Promise.all(['300', '400', '500', '700', '900'].map((w) => document.fonts.load(`${w} 40px "Noto Sans SC"`, UI_TEXT))).catch(() => null);
// 每帧后期参数（镜头里可改）
const POST0 = { fade: 0, fadeColor: '#f2efea', flash: 0, vignette: 0.1, grain: 0.025, hud: true, gl: true };
export const POST = { ...POST0 };
const PROF = { upd: 0, gl: 0, comp: 0, n: 0 };
window.prof = () => { const r = { update: PROF.upd / PROF.n, gl: PROF.gl / PROF.n, comp: PROF.comp / PROF.n }; PROF.upd = PROF.gl = PROF.comp = PROF.n = 0; return r; };

function renderShot(shot, t, target) {
  const t0 = performance.now();
  Object.assign(POST, POST0); hud.setTransform(1, 0, 0, 1, 0, 0); hud.clearRect(0, 0, W, H); hud.globalAlpha = 1;
  beginFrame(); FRAME.t = t; shot.update(t, { hud, POST });
  const t1 = performance.now(); if (POST.gl) renderGL(); const t2 = performance.now();
  const c = target; c.globalCompositeOperation = 'source-over'; c.globalAlpha = 1; c.filter = 'none'; c.setTransform(1, 0, 0, 1, 0, 0);
  if (POST.gl) c.drawImage(glCanvas, 0, 0); else { c.fillStyle = '#f2efea'; c.fillRect(0, 0, W, H); }
  if (POST.pre) POST.pre(c); // 三维画面之上、界面之下的二维层（例如面板的毛玻璃底）
  if (POST.fade > 0) { c.globalAlpha = POST.fade; c.fillStyle = POST.fadeColor; c.fillRect(0, 0, W, H); c.globalAlpha = 1; }
  if (POST.hud) c.drawImage(hudC, 0, 0);
  if (POST.flash > 0) { c.globalAlpha = POST.flash; c.fillStyle = '#fff'; c.fillRect(0, 0, W, H); c.globalAlpha = 1; }
  if (POST.vignette > 0) { const g = c.createRadialGradient(W / 2, H / 2, H * 0.45, W / 2, H / 2, H * 1.1); g.addColorStop(0, 'rgba(60,50,40,0)'); g.addColorStop(1, `rgba(60,50,40,${POST.vignette})`); c.fillStyle = g; c.fillRect(0, 0, W, H); }
  if (POST.grain > 0) { c.globalAlpha = POST.grain; c.globalCompositeOperation = 'overlay'; const ox = Math.floor((t * 977) % 256), oy = Math.floor((t * 613) % 256); c.fillStyle = c.createPattern(grainC, 'repeat'); c.save(); c.translate(-ox, -oy); c.fillRect(ox, oy, W, H); c.restore(); c.globalCompositeOperation = 'source-over'; c.globalAlpha = 1; }
  PROF.upd += t1 - t0; PROF.gl += t2 - t1; PROF.comp += performance.now() - t2; PROF.n++;
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
  if (!tr || !prev || t >= tr.dur) { renderShot(shot, t, O); return true; }
  renderShot(prev, prev.dur + t, A); renderShot(shot, t, B);
  const k = smooth(t / tr.dur); const o = O; o.globalCompositeOperation = 'source-over'; o.globalAlpha = 1; o.setTransform(1, 0, 0, 1, 0, 0);
  if (tr.type === 'wipe') { // 竖直橙色扫描线从左到右，左边是新镜头
    const x = k * (W + 40) - 20; o.drawImage(bufA, 0, 0); o.save(); o.beginPath(); o.rect(0, 0, Math.max(0, x), H); o.clip(); o.drawImage(bufB, 0, 0); o.restore();
    o.fillStyle = '#ec4e26'; o.fillRect(x - 2, 0, 3, H); o.globalAlpha = 0.25; o.fillRect(x - 14, 0, 12, H); o.globalAlpha = 1;
  } else if (tr.type === 'tiles') { // 方格逐块翻转（从中心向外）
    o.drawImage(bufA, 0, 0); const cs = 80; for (let y = 0; y < H; y += cs) for (let x = 0; x < W; x += cs) { const d = Math.hypot(x + cs / 2 - W / 2, y + cs / 2 - H / 2) / Math.hypot(W / 2, H / 2); const q = clamp((k - d * 0.6) / 0.4); if (q <= 0) continue; const s = smooth(q); o.save(); o.beginPath(); o.rect(x + cs / 2 - cs / 2 * s, y + cs / 2 - cs / 2 * s, cs * s, cs * s); o.clip(); o.drawImage(bufB, 0, 0); o.restore(); }
  } else { o.drawImage(bufA, 0, 0); o.globalAlpha = k; o.drawImage(bufB, 0, 0); o.globalAlpha = 1; }
  return true;
};
window.shotList = () => SHOTS.map((s) => ({ id: s.id, dur: s.dur, extra: !!s.extra }));
window.ready = true;
