// 逐帧渲染：本地起 HTTP 服务，无头 Chromium（SwiftShader WebGL）打开 index.html，按镜头逐帧截图，再用 ffmpeg 编码。
// 用法：node render.mjs --shots s01,s02 [--still 12] [--step 6] [--w 1920 --h 1080] [--encode]
import { createRequire } from 'module';
import http from 'http'; import fs from 'fs'; import path from 'path'; import { execFileSync } from 'child_process';
const require = createRequire(import.meta.url);
const { chromium } = require('/opt/node-tools/node_modules/playwright');
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..'); // 以 promo/ 为站点根目录
const FPS = 30;
const args = Object.fromEntries(process.argv.slice(2).join(' ').split('--').filter(Boolean).map((a) => { const [k, ...v] = a.trim().split(/\s+/); return [k, v.join(' ') || true]; }));
const W = +(args.w || 1920), H = +(args.h || 1080);
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.woff2': 'font/woff2', '.otf': 'font/otf', '.ttf': 'font/ttf' };
const server = http.createServer((req, res) => {
  const f = path.join(root, decodeURIComponent(req.url.split('?')[0]));
  if (!f.startsWith(root) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'Content-Type': types[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(res);
}).listen(0);
const browser = await chromium.launch({ args: ['--disable-gpu'] }); // 纯 Canvas 2D，用 CPU 软件光栅最快
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') console.log('[page]', m.text().slice(0, 300)); });
page.on('pageerror', (e) => console.log('[pageerror]', e.message));
await page.goto(`http://localhost:${server.address().port}/v2/index.html`);
await page.waitForFunction('window.ready === true', null, { timeout: 120000 });
if (args.style && args.style !== true) await page.evaluate(`setStyle(${JSON.stringify(args.style)})`);
const all = await page.evaluate('shotList()');
const ids = args.shots && args.shots !== true ? String(args.shots).split(',') : all.map((s) => s.id);
for (const id of ids) {
  const t0 = Date.now();
  const { frames } = await page.evaluate(`prepare(${JSON.stringify(id)})`);
  const prepMs = Date.now() - t0;
  if (args.still !== undefined) {
    const list = String(args.still).split(',').map(Number);
    fs.mkdirSync(path.join(root, 'out/v2/stills'), { recursive: true });
    for (const f of list) {
      await page.evaluate(`frame(${JSON.stringify(id)}, ${f})`);
      const out = path.join(root, `out/v2/stills/${id}_${String(f).padStart(4, '0')}${args.style && args.style !== true ? '_' + args.style : ''}.jpg`);
      fs.writeFileSync(out, await page.screenshot({ type: 'jpeg', quality: 92 }));
      console.log('still', out);
    }
    continue;
  }
  const dir = path.join(root, 'out/v2/frames', id); const rng = args.range && args.range !== true ? String(args.range).split(':').map(Number) : null; // --range a:b 只渲染第 a~b-1 帧（多进程分段）
  if (!rng) fs.rmSync(dir, { recursive: true, force: true }); fs.mkdirSync(dir, { recursive: true });
  const step = +(args.step || 1);
  let n = 0; const t1 = Date.now();
  for (let f = rng ? rng[0] : 0; f < (rng ? Math.min(rng[1], frames) : frames); f += step) {
    await page.evaluate(`frame(${JSON.stringify(id)}, ${f})`);
    fs.writeFileSync(path.join(dir, String(rng ? f : n).padStart(5, '0') + '.jpg'), await page.screenshot({ type: 'jpeg', quality: 94 })); n++;
  }
  const per = (Date.now() - t1) / n;
  console.log(`${id}: ${n} frames, prepare ${prepMs} ms, ${per.toFixed(0)} ms/frame`);
  if (args.encode && !rng) {
    fs.mkdirSync(path.join(root, 'out/v2/clips'), { recursive: true });
    execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-framerate', String(FPS / step), '-i', path.join(dir, '%05d.jpg'), '-c:v', 'libx264', '-preset', 'medium', '-crf', '16', '-pix_fmt', 'yuv420p', '-r', String(FPS), path.join(root, `out/v2/clips/${id}.mp4`)]);
    console.log('encoded', `out/v2/clips/${id}.mp4`);
  }
}
await browser.close(); server.close();
