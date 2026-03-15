#!/usr/bin/env node

const http = require('http');
const fs = require('fs');
const path = require('path');
const { marked } = require('marked');
const chokidar = require('chokidar');

const PORT = process.env.PORT || 3000;
const DOCS_DIR = process.env.DOCS_DIR || path.join(__dirname, 'docs');

// SSE clients waiting for reload events
const sseClients = new Set();

function notifyClients() {
  for (const res of sseClients) {
    res.write('data: reload\n\n');
  }
}

function escapeHtml(str) {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function renderPage(title, bodyHtml) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(title)}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      line-height: 1.6;
      color: #24292e;
      background: #f6f8fa;
    }
    .container {
      max-width: 860px;
      margin: 0 auto;
      padding: 2rem 1.5rem;
    }
    header {
      background: #fff;
      border-bottom: 1px solid #e1e4e8;
      padding: 1rem 1.5rem;
      display: flex;
      align-items: center;
      gap: 1rem;
    }
    header a { text-decoration: none; color: #0366d6; font-weight: 600; }
    header a:hover { text-decoration: underline; }
    .breadcrumb { color: #586069; font-size: 0.9rem; }
    .breadcrumb span { margin: 0 0.4rem; }
    .card {
      background: #fff;
      border: 1px solid #e1e4e8;
      border-radius: 6px;
      padding: 2rem;
      margin-top: 1.5rem;
    }
    .file-list { list-style: none; }
    .file-list li { border-bottom: 1px solid #e1e4e8; }
    .file-list li:last-child { border-bottom: none; }
    .file-list a {
      display: flex;
      align-items: center;
      gap: 0.6rem;
      padding: 0.75rem 0;
      text-decoration: none;
      color: #0366d6;
      font-size: 1rem;
    }
    .file-list a:hover { text-decoration: underline; }
    .file-list .icon { font-size: 1.1rem; }
    .markdown-body h1, .markdown-body h2, .markdown-body h3,
    .markdown-body h4, .markdown-body h5, .markdown-body h6 {
      margin: 1.5rem 0 0.75rem;
      line-height: 1.3;
    }
    .markdown-body h1 { font-size: 2rem; border-bottom: 1px solid #e1e4e8; padding-bottom: 0.5rem; }
    .markdown-body h2 { font-size: 1.5rem; border-bottom: 1px solid #e1e4e8; padding-bottom: 0.3rem; }
    .markdown-body h3 { font-size: 1.25rem; }
    .markdown-body p { margin: 0.75rem 0; }
    .markdown-body ul, .markdown-body ol { margin: 0.75rem 0 0.75rem 1.5rem; }
    .markdown-body li { margin: 0.25rem 0; }
    .markdown-body code {
      background: #f3f4f6;
      padding: 0.15rem 0.4rem;
      border-radius: 3px;
      font-family: 'SFMono-Regular', Consolas, monospace;
      font-size: 0.875em;
    }
    .markdown-body pre {
      background: #f3f4f6;
      border: 1px solid #e1e4e8;
      border-radius: 6px;
      padding: 1rem;
      overflow-x: auto;
      margin: 1rem 0;
    }
    .markdown-body pre code { background: none; padding: 0; }
    .markdown-body blockquote {
      border-left: 4px solid #dfe2e5;
      padding: 0.25rem 1rem;
      color: #6a737d;
      margin: 1rem 0;
    }
    .markdown-body table {
      border-collapse: collapse;
      width: 100%;
      margin: 1rem 0;
    }
    .markdown-body th, .markdown-body td {
      border: 1px solid #e1e4e8;
      padding: 0.5rem 0.75rem;
    }
    .markdown-body th { background: #f6f8fa; font-weight: 600; }
    .markdown-body a { color: #0366d6; }
    .markdown-body img { max-width: 100%; }
    .markdown-body hr { border: none; border-top: 1px solid #e1e4e8; margin: 1.5rem 0; }
    #reload-indicator {
      position: fixed;
      bottom: 1rem;
      right: 1rem;
      background: #28a745;
      color: white;
      padding: 0.4rem 0.8rem;
      border-radius: 4px;
      font-size: 0.8rem;
      opacity: 0;
      transition: opacity 0.3s;
      pointer-events: none;
    }
    #reload-indicator.visible { opacity: 1; }
  </style>
</head>
<body>
  <header>
    <a href="/">📄 Markdown Server</a>
    <span class="breadcrumb">${title !== 'Index' ? `<span>/</span> ${escapeHtml(title)}` : ''}</span>
  </header>
  <div class="container">
    <div class="card">
      ${bodyHtml}
    </div>
  </div>
  <div id="reload-indicator">Reloaded</div>
  <script>
    const evtSource = new EventSource('/_sse');
    evtSource.onmessage = (e) => {
      if (e.data === 'reload') {
        window.location.reload();
      }
    };
  </script>
</body>
</html>`;
}

function listMarkdownFiles(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir)
    .filter(f => f.endsWith('.md'))
    .sort();
}

function createRequestHandler(docsDir) {
  return function handler(req, res) {
    const url = new URL(req.url, `http://localhost`);
    let pathname;
    try {
      pathname = decodeURIComponent(url.pathname);
    } catch {
      res.writeHead(400, { 'Content-Type': 'text/plain' });
      res.end('Bad Request');
      return;
    }

    if (pathname === '/_sse') {
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'X-Accel-Buffering': 'no',
      });
      res.write(': connected\n\n');
      sseClients.add(res);
      res.on('close', () => sseClients.delete(res));
      return;
    }

    if (pathname === '/' || pathname === '') {
      const files = listMarkdownFiles(docsDir);
      const items = files.length
        ? files.map(f => {
            const name = f.replace(/\.md$/, '');
            return `<li><a href="/${encodeURIComponent(f)}"><span class="icon">📝</span>${escapeHtml(name)}</a></li>`;
          }).join('\n')
        : '<li style="padding:0.75rem 0; color:#6a737d;">No markdown files found in <code>docs/</code></li>';
      const html = renderPage('Index', `<h2 style="margin-bottom:1rem;">📁 Documents</h2><ul class="file-list">${items}</ul>`);
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(html);
      return;
    }

    const filename = pathname.replace(/^\//, '');
    if (filename.endsWith('.md') && !filename.includes('/') && !filename.includes('\\')) {
      const filePath = path.join(docsDir, filename);
      const resolvedDocsDir = path.resolve(docsDir);

      // Security: ensure the resolved path stays within docsDir
      if (!filePath.startsWith(resolvedDocsDir + path.sep) &&
          filePath !== resolvedDocsDir) {
        res.writeHead(403, { 'Content-Type': 'text/plain' });
        res.end('Forbidden');
        return;
      }

      if (!fs.existsSync(filePath)) {
        res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(renderPage('Not Found', '<p>File not found.</p>'));
        return;
      }

      const raw = fs.readFileSync(filePath, 'utf8');
      const rendered = marked.parse(raw);
      const title = filename.replace(/\.md$/, '');
      const html = renderPage(title, `<div class="markdown-body">${rendered}</div>`);
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(html);
      return;
    }

    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('Not found');
  };
}

const server = http.createServer(createRequestHandler(DOCS_DIR));

// Start server and watcher only when run directly
if (require.main === module) {
  if (!fs.existsSync(DOCS_DIR)) {
    fs.mkdirSync(DOCS_DIR, { recursive: true });
  }

  const watcher = chokidar.watch(DOCS_DIR, {
    ignoreInitial: true,
    awaitWriteFinish: { stabilityThreshold: 100, pollInterval: 50 },
  });

  watcher.on('all', (event, filePath) => {
    console.log(`[watcher] ${event}: ${path.relative(DOCS_DIR, filePath)}`);
    notifyClients();
  });

  server.listen(PORT, () => {
    console.log(`Markdown server running at http://localhost:${PORT}`);
    console.log(`Serving files from: ${DOCS_DIR}`);
    console.log(`Watching for changes...`);
  });

  process.on('SIGINT', () => {
    watcher.close();
    server.close();
    process.exit(0);
  });
}

module.exports = { server, createRequestHandler, escapeHtml, listMarkdownFiles, renderPage };
