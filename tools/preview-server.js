/* ============================================================
 * 长留玉 · 本地预览服务器（Node 运行，不参与线上）
 * ------------------------------------------------------------
 * 为什么需要它：直接双击打开 HTML 是 file:// 协议，浏览器会限制
 * localStorage 和跨源图片，答题进度保存与分享图生成都会受影响。
 * 用这个不到 40 行的静态服务器即可正常调试。
 *
 * 运行（在项目根目录）：
 *   node tools/preview-server.js           # 默认 http://127.0.0.1:5173/
 *   node tools/preview-server.js 8080      # 指定端口
 *
 * 手机联调：让手机和电脑连同一个 Wi-Fi，把 127.0.0.1 换成本机内网 IP。
 * 停止：Ctrl + C
 * ============================================================ */
const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const PORT = Number(process.argv[2]) || 5173;
const HOST = process.argv[3] || '127.0.0.1';

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2'
};

http.createServer(function (req, res) {
  let rel = decodeURIComponent(req.url.split('?')[0]);
  if (rel === '/' || rel.endsWith('/')) rel += 'index.html';

  const file = path.join(ROOT, rel);
  // 防目录穿越
  if (!file.startsWith(ROOT)) {
    res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('403 Forbidden');
    return;
  }

  fs.readFile(file, function (err, data) {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('404 Not Found: ' + rel);
      return;
    }
    res.writeHead(200, {
      'Content-Type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream',
      'Cache-Control': 'no-store'      // 调试时不缓存，改了代码刷新立刻生效
    });
    res.end(data);
  });
}).listen(PORT, HOST, function () {
  console.log('长留玉 · 本地预览已启动');
  console.log('  目录：' + ROOT);
  console.log('  地址：http://' + HOST + ':' + PORT + '/');
});
