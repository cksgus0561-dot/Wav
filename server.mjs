import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = fileURLToPath(new URL('.', import.meta.url));
const port = Number(process.env.PORT || 4173);
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' };

http.createServer(async (request, response) => {
  try {
    const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
    const relative = pathname === '/' ? 'index.html' : pathname.slice(1);
    const filename = path.resolve(root, relative);
    if (!filename.startsWith(root) || relative.split(/[\\/]/).some(part => part.startsWith('.'))) {
      response.writeHead(403).end();
      return;
    }
    const body = await readFile(filename);
    response.writeHead(200, {
      'Content-Type': `${types[path.extname(filename)] || 'application/octet-stream'}; charset=utf-8`,
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff'
    });
    response.end(body);
  } catch {
    response.writeHead(404).end('Not found');
  }
}).listen(port, '127.0.0.1', () => {
  console.log(`Wave Curves — http://127.0.0.1:${port}`);
});
