/* ==========================================================================
   server.js —— magic-hub 本地开发服务器（零依赖）

   它做什么：
   1. 监听 http://localhost:3000，把项目里的网页文件递给浏览器；
   2. 访问目录时自动返回该目录下的 index.html（如 /shumo/ → shumo/index.html）；
   3. 文件不存在时返回一个友好的 404 页（不白屏，带返回首页链接）；
   4. 拦截 .. 路径穿越，防止读到项目外的文件。

   以后长成极简后端时，/api/analyze 等接口就加在这个文件里（见 TECH_DESIGN.md）。

   启动方式：在本目录执行  npm start  （或 node server.js）
   停止方式：终端里按 Ctrl + C
   ========================================================================== */

const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = 3000;
const ROOT = __dirname; // 项目根目录 = server.js 所在目录

// 常见文件的 Content-Type（告诉浏览器这是什么类型的文件）
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon',
};

// 友好的 404 页（PRD 第 7 节：全站不出现白屏）
function notFound(res) {
  res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' });
  res.end(`<!DOCTYPE html>
<html lang="zh-CN"><head><meta charset="UTF-8"><title>页面不存在 · magic-hub</title></head>
<body style="font-family:sans-serif;text-align:center;padding:80px 24px;">
  <h1>404 · 页面不存在</h1>
  <p>这个地址没有对应的页面，可能还没有建好。</p>
  <p><a href="/">返回首页</a></p>
</body></html>`);
}

const server = http.createServer((req, res) => {
  // 去掉查询参数（?xxx=yyy），只留路径
  let urlPath = decodeURIComponent(req.url.split('?')[0]);

  // 访问根路径 → 首页
  if (urlPath === '/') urlPath = '/index.html';

  // 以 / 结尾的目录写法（如 /shumo/）→ 自动补 index.html
  if (urlPath.endsWith('/')) urlPath = urlPath + 'index.html';

  // 拼出磁盘上的真实路径，并拦截路径穿越（.. 不许越出项目根目录）
  const filePath = path.join(ROOT, urlPath);
  if (!filePath.startsWith(ROOT)) {
    notFound(res);
    return;
  }

  fs.readFile(filePath, (err, data) => {
    if (err) {
      // 文件不存在或读不了 → 友好 404
      notFound(res);
      return;
    }
    const type = MIME[path.extname(filePath).toLowerCase()] || 'application/octet-stream';
    res.writeHead(200, { 'Content-Type': type });
    res.end(data);
  });
});

server.listen(PORT, () => {
  console.log('==========================================');
  console.log('  magic-hub 本地服务器已启动');
  console.log('  打开浏览器访问：http://localhost:' + PORT);
  console.log('  停止服务器：按 Ctrl + C');
  console.log('==========================================');
});
