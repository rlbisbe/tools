#!/usr/bin/env node

'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const chokidar = require('chokidar');

const { createRequestHandler, notifyClients } = require('./lib/handler');
const { escapeHtml, safeJson, renderPage } = require('./lib/renderer');
const { parseComments, stripComments, cleanPosToRawPos, insertComment, deleteComment, editComment } = require('./lib/comments');
const { listMarkdownFiles, readJsonBody, resolveDocFile } = require('./lib/handler');

const PORT = process.env.PORT || 3000;
const DOCS_DIR = process.env.DOCS_DIR || path.join(__dirname, 'docs');
const USE_POLLING = process.env.USE_POLLING === 'true';

const server = http.createServer(createRequestHandler(DOCS_DIR));

// Start server and watcher only when run directly
if (require.main === module) {
  if (!fs.existsSync(DOCS_DIR)) {
    fs.mkdirSync(DOCS_DIR, { recursive: true });
  }

  const watcher = chokidar.watch(DOCS_DIR, {
    ignoreInitial: true,
    usePolling: USE_POLLING,
    interval: USE_POLLING ? 1000 : undefined,
    binaryInterval: USE_POLLING ? 2000 : undefined,
    awaitWriteFinish: { stabilityThreshold: 300, pollInterval: 100 },
  });

  watcher.on('all', (event, filePath) => {
    console.log(`[watcher] ${event}: ${path.relative(DOCS_DIR, filePath)}`);
    notifyClients();
  });

  server.listen(PORT, () => {
    console.log(`Markdown server running at http://localhost:${PORT}`);
    console.log(`Serving files from: ${DOCS_DIR}`);
    console.log(`Watching for changes... ${USE_POLLING ? '(polling mode)' : '(native fs events)'}`);
  });

  process.on('SIGINT', () => {
    watcher.close();
    server.close();
    process.exit(0);
  });
}

module.exports = {
  server, createRequestHandler, escapeHtml, safeJson, renderPage,
  listMarkdownFiles, readJsonBody, resolveDocFile,
  parseComments, stripComments, cleanPosToRawPos, insertComment, deleteComment, editComment,
};
