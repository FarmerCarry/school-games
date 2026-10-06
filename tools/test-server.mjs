import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

export const MIME = {
  '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css',
  '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.woff2': 'font/woff2', '.woff': 'font/woff', '.ico': 'image/x-icon', '.txt': 'text/plain',
  '.md': 'text/plain', '.webmanifest': 'application/manifest+json'
};

// Games don't declare a favicon, so Chromium asks for /favicon.ico. Serve the
// actual site icon there instead of hiding favicon failures in the test report.
export function createStaticServer(root, { base = '/', latency = 0, cacheControl = 'no-store', pages = {}, mounts = {} } = {}) {
  const absoluteRoot = path.resolve(root);
  const directories = Object.entries(mounts).map(([prefix, directory]) => [prefix, path.resolve(directory)]);
  return http.createServer((req, res) => {
    let pathname;
    try { pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname); }
    catch { res.writeHead(400); res.end('invalid URL'); return; }
    // Exact HTML fixtures and alternate asset roots keep specialized tests on
    // the same MIME, path-boundary and lifecycle handling as ordinary tests.
    if (Object.hasOwn(pages, pathname)) {
      res.writeHead(200, { 'content-type': 'text/html' }); res.end(pages[pathname]); return;
    }
    let rel, servedRoot = absoluteRoot;
    const mount = directories.find(([prefix]) => pathname.startsWith(prefix));
    if (mount) { servedRoot = mount[1]; rel = pathname.slice(mount[0].length); }
    else if (pathname === '/favicon.ico' || pathname === base + 'favicon.ico') rel = 'favicon.svg';
    else if (pathname.startsWith(base)) rel = pathname.slice(base.length);
    else { res.writeHead(404); res.end('not found'); return; }
    let fp = path.resolve(servedRoot, rel || 'index.html');
    const relative = path.relative(servedRoot, fp);
    if (relative.startsWith('..' + path.sep) || relative === '..' || path.isAbsolute(relative)) {
      res.writeHead(403); res.end('outside site'); return;
    }
    if (fs.existsSync(fp) && fs.statSync(fp).isDirectory()) fp = path.join(fp, 'index.html');
    fs.readFile(fp, (err, data) => setTimeout(() => {
      if (err) { res.writeHead(404); res.end('not found'); return; }
      res.writeHead(200, { 'content-type': MIME[path.extname(fp)] || 'application/octet-stream',
        ...(cacheControl == null ? {} : { 'cache-control': cacheControl }) });
      res.end(data);
    }, latency));
  });
}

export async function startTestServer(root, options = {}) {
  const server = createStaticServer(root, options);
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  return {
    server,
    origin: `http://127.0.0.1:${server.address().port}`,
    close: () => new Promise((resolve, reject) => server.close(err => err ? reject(err) : resolve()))
  };
}
