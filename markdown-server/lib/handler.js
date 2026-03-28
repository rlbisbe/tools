'use strict';

const fs = require('fs');
const path = require('path');
const { marked } = require('marked');
const { parseComments, stripComments, insertComment, editComment, deleteComment } = require('./comments');
const { escapeHtml, renderPage } = require('./renderer');

const PUBLIC_DIR = path.join(__dirname, '..', 'public');

// SSE clients waiting for reload events
const sseClients = new Set();

function notifyClients() {
  for (const res of sseClients) {
    res.write('data: reload\n\n');
  }
}

function listMarkdownFiles(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir)
    .filter(f => f.endsWith('.md'))
    .sort();
}

// Read request body and parse JSON. Calls cb(err, parsed) on completion.
function readJsonBody(req, res, cb) {
  let body = '';
  req.on('data', chunk => { body += chunk; });
  req.on('end', () => {
    try { cb(null, JSON.parse(body)); } catch {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: false, error: 'invalid JSON' }));
    }
  });
}

// Validate that `file` is a safe .md filename and resolve its path within docsDir.
// Returns filePath on success or sends an error response and returns null.
function resolveDocFile(file, docsDir, res) {
  if (!file || typeof file !== 'string' ||
      !file.endsWith('.md') || file.includes('/') || file.includes('\\')) {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: false, error: 'invalid file name' }));
    return null;
  }
  const filePath = path.join(docsDir, file);
  if (!path.resolve(filePath).startsWith(path.resolve(docsDir) + path.sep)) {
    res.writeHead(403, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: false, error: 'forbidden' }));
    return null;
  }
  if (!fs.existsSync(filePath)) {
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: false, error: 'file not found' }));
    return null;
  }
  return filePath;
}

// Apply a pure comment transform (raw → raw) to a file and respond.
function applyCommentCommand(res, filePath, transform, notFoundError) {
  const raw = fs.readFileSync(filePath, 'utf8');
  const updated = transform(raw);
  if (!updated) {
    res.writeHead(422, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: false, error: notFoundError }));
    return;
  }
  fs.writeFileSync(filePath, updated, 'utf8');
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ ok: true }));
}

function handleSSE(req, res) {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  res.write(': connected\n\n');
  sseClients.add(res);
  res.on('close', () => sseClients.delete(res));
}

function handleCommentPost(req, res, docsDir) {
  readJsonBody(req, res, (err, parsed) => {
    if (err) return;
    const { file, anchor, text, before = '', after = '' } = parsed;
    if (!anchor || !text || typeof anchor !== 'string' || typeof text !== 'string') {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: false, error: 'missing or invalid fields' }));
      return;
    }
    const filePath = resolveDocFile(file, docsDir, res);
    if (!filePath) return;
    applyCommentCommand(res, filePath,
      raw => insertComment(raw, anchor, text, { before, after }),
      'anchor text not found in file');
  });
}

function handleCommentPatch(req, res, docsDir) {
  readJsonBody(req, res, (err, parsed) => {
    if (err) return;
    const { file, id, text } = parsed;
    if (!id || !text || typeof id !== 'string' || typeof text !== 'string') {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: false, error: 'missing or invalid fields' }));
      return;
    }
    const filePath = resolveDocFile(file, docsDir, res);
    if (!filePath) return;
    applyCommentCommand(res, filePath,
      raw => editComment(raw, id, text),
      'comment not found');
  });
}

function handleCommentDelete(req, res, docsDir) {
  readJsonBody(req, res, (err, parsed) => {
    if (err) return;
    const { file, id } = parsed;
    if (!id || typeof id !== 'string') {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: false, error: 'missing or invalid fields' }));
      return;
    }
    const filePath = resolveDocFile(file, docsDir, res);
    if (!filePath) return;
    applyCommentCommand(res, filePath,
      raw => deleteComment(raw, id),
      'comment not found');
  });
}

function handleIndex(req, res, docsDir) {
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
}

function handleMarkdownFile(req, res, docsDir, filename) {
  const filePath = path.join(docsDir, filename);
  const resolvedDocsDir = path.resolve(docsDir);

  if (!filePath.startsWith(resolvedDocsDir + path.sep) && filePath !== resolvedDocsDir) {
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
  const comments = parseComments(raw);
  const cleanMd = stripComments(raw);
  const rendered = marked.parse(cleanMd);
  const title = filename.replace(/\.md$/, '');
  const html = renderPage(title, `<div class="markdown-body">${rendered}</div>`, { comments, filename, rawMarkdown: cleanMd });
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
  res.end(html);
}

function handleStaticFile(req, res, filename) {
  const filePath = path.join(PUBLIC_DIR, filename);
  if (!path.resolve(filePath).startsWith(path.resolve(PUBLIC_DIR) + path.sep)) {
    res.writeHead(403); res.end(); return;
  }
  const ext = path.extname(filename);
  const contentTypes = { '.css': 'text/css', '.js': 'application/javascript' };
  try {
    const content = fs.readFileSync(filePath);
    res.writeHead(200, { 'Content-Type': contentTypes[ext] || 'application/octet-stream' });
    res.end(content);
  } catch {
    res.writeHead(404); res.end();
  }
}

function createRequestHandler(docsDir) {
  const routes = [
    { method: 'GET',    path: '/_sse',        handler: (req, res) => handleSSE(req, res) },
    { method: 'POST',   path: '/_comment',    handler: (req, res) => handleCommentPost(req, res, docsDir) },
    { method: 'PATCH',  path: '/_comment',    handler: (req, res) => handleCommentPatch(req, res, docsDir) },
    { method: 'DELETE', path: '/_comment',    handler: (req, res) => handleCommentDelete(req, res, docsDir) },
    { method: 'GET',    path: '/',            handler: (req, res) => handleIndex(req, res, docsDir) },
    { method: 'GET',    path: '',             handler: (req, res) => handleIndex(req, res, docsDir) },
    { method: 'GET',    path: '/styles.css',  handler: (req, res) => handleStaticFile(req, res, 'styles.css') },
  ];

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

    const route = routes.find(r => r.method === req.method && r.path === pathname);
    if (route) { route.handler(req, res); return; }

    const filename = pathname.replace(/^\//, '');
    if (filename.endsWith('.md') && !filename.includes('/') && !filename.includes('\\')) {
      handleMarkdownFile(req, res, docsDir, filename);
      return;
    }

    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('Not found');
  };
}

module.exports = { createRequestHandler, notifyClients, listMarkdownFiles, readJsonBody, resolveDocFile };
