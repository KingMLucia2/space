import { createRequire } from 'module'; import http from 'http'; import fs from 'fs'; import path from 'path';
const require = createRequire(import.meta.url); const { chromium } = require('/opt/node-tools/node_modules/playwright');
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const types = { '.html': 'text/html', '.js': 'text/javascript' };
const server = http.createServer((req, res) => { const f = path.join(root, decodeURIComponent(req.url.split('?')[0])); if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end(); } res.writeHead(200, { 'Content-Type': types[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(res); }).listen(0);
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const [shot, frame, ...variants] = process.argv.slice(2);
for (const v of variants) {
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
  page.on('pageerror', (e) => console.log('[err]', e.message));
  await page.goto(`http://localhost:${server.address().port}/index.html?${v}`);
  await page.waitForFunction('window.ready === true', null, { timeout: 120000 });
  await page.evaluate(`prepare('${shot}')`);
  console.log(v.padEnd(28), JSON.stringify(await page.evaluate(`profile('${shot}', ${frame}, 2)`)));
  await page.close();
}
await browser.close(); server.close();
