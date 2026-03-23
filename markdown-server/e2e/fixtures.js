const { test: base, expect } = require('@playwright/test');
const http = require('http');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { createRequestHandler } = require('../server');

const test = base.extend({
  server: [async ({}, use) => {
    const docsDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pw-md-'));
    const httpServer = http.createServer(createRequestHandler(docsDir));
    await new Promise(resolve => httpServer.listen(0, '127.0.0.1', resolve));
    const { port } = httpServer.address();
    const baseUrl = `http://127.0.0.1:${port}`;

    await use({ baseUrl, docsDir });

    httpServer.closeAllConnections();
    await new Promise(resolve => httpServer.close(resolve));
    fs.rmSync(docsDir, { recursive: true, force: true });
  }, { scope: 'test' }],
});

module.exports = { test, expect };
