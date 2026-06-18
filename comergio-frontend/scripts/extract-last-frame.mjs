import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '../public');
const videoRel = process.argv[2] || '/landing/hero-scroll-section4.mp4';
const outRel = process.argv[3] || '/landing/frame-pagos-en-linea.png';
const width = Number(process.argv[4] || 1024);
const height = Number(process.argv[5] || 576);
const port = 9876;

const html = `<!DOCTYPE html>
<html><body>
<video id="v" muted playsinline></video>
<canvas id="c" width="${width}" height="${height}"></canvas>
<script>
(async () => {
  const v = document.getElementById('v');
  const c = document.getElementById('c');
  const ctx = c.getContext('2d');
  v.src = ${JSON.stringify(videoRel)};
  await new Promise((res, rej) => {
    v.onloadedmetadata = res;
    v.onerror = () => rej(new Error('video load failed'));
  });
  v.currentTime = Math.max(0, v.duration - 0.04);
  await new Promise((res) => { v.onseeked = res; });
  ctx.drawImage(v, 0, 0, ${width}, ${height});
  window.__DATA__ = c.toDataURL('image/png');
})();
</script>
</body></html>`;

const server = http.createServer((req, res) => {
  if (req.url === '/' || req.url === '/index.html') {
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(html);
    return;
  }

  const urlPath = decodeURIComponent(req.url.split('?')[0]);
  const filePath = path.join(root, urlPath);
  if (!filePath.startsWith(root) || !fs.existsSync(filePath)) {
    res.writeHead(404);
    res.end('not found');
    return;
  }

  const ext = path.extname(filePath);
  const types = {
    '.mp4': 'video/mp4',
    '.png': 'image/png',
  };
  res.writeHead(200, { 'Content-Type': types[ext] || 'application/octet-stream' });
  fs.createReadStream(filePath).pipe(res);
});

await new Promise((resolve) => server.listen(port, resolve));

try {
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-gpu'],
  });
  const page = await browser.newPage();
  await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: 'networkidle0', timeout: 60000 });
  await page.waitForFunction(() => typeof window.__DATA__ === 'string', { timeout: 30000 });
  const dataUrl = await page.evaluate(() => window.__DATA__);
  await browser.close();

  const outPath = path.join(root, outRel);
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, Buffer.from(dataUrl.split(',')[1], 'base64'));
  console.log(`Saved ${outPath} (${fs.statSync(outPath).size} bytes)`);
} finally {
  server.close();
}
