/**
 * Minimal static HTTP server for E2E tests.
 * Serves src/ with correct MIME types and no caching.
 */
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SRC_DIR = path.resolve(__dirname, '../../src');

const MIME = {
  '.html': 'text/html',
  '.js':   'application/javascript',
  '.css':  'text/css',
  '.png':  'image/png',
  '.ico':  'image/x-icon',
};

export function startServer(port = 0) {
  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      let filePath = path.join(SRC_DIR, req.url === '/' ? 'index.html' : req.url);
      // Strip query strings
      filePath = filePath.split('?')[0];

      if (!fs.existsSync(filePath)) {
        res.writeHead(404);
        res.end('Not found');
        return;
      }

      const ext = path.extname(filePath);
      res.writeHead(200, {
        'Content-Type': MIME[ext] || 'application/octet-stream',
        'Cache-Control': 'no-store',
      });
      fs.createReadStream(filePath).pipe(res);
    });

    server.listen(port, '127.0.0.1', () => {
      const addr = server.address();
      resolve({ server, url: `http://127.0.0.1:${addr.port}` });
    });
    server.on('error', reject);
  });
}
