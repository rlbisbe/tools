const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const request = require('supertest');
const { escapeHtml, listMarkdownFiles, renderPage, createRequestHandler } = require('../server');

// ─── escapeHtml ──────────────────────────────────────────────────────────────

describe('escapeHtml', () => {
  test('escapes ampersands', () => {
    expect(escapeHtml('a & b')).toBe('a &amp; b');
  });

  test('escapes angle brackets', () => {
    expect(escapeHtml('<script>')).toBe('&lt;script&gt;');
  });

  test('escapes double quotes', () => {
    expect(escapeHtml('"hello"')).toBe('&quot;hello&quot;');
  });

  test('leaves plain text unchanged', () => {
    expect(escapeHtml('hello world')).toBe('hello world');
  });

  test('escapes multiple special characters in one string', () => {
    expect(escapeHtml('<a href="x&y">')).toBe('&lt;a href=&quot;x&amp;y&quot;&gt;');
  });
});

// ─── listMarkdownFiles ────────────────────────────────────────────────────────

describe('listMarkdownFiles', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'md-server-test-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  test('returns empty array for empty directory', () => {
    expect(listMarkdownFiles(tmpDir)).toEqual([]);
  });

  test('returns empty array for non-existent directory', () => {
    expect(listMarkdownFiles('/nonexistent/path/xyz')).toEqual([]);
  });

  test('returns only .md files sorted alphabetically', () => {
    fs.writeFileSync(path.join(tmpDir, 'zebra.md'), '');
    fs.writeFileSync(path.join(tmpDir, 'apple.md'), '');
    fs.writeFileSync(path.join(tmpDir, 'readme.txt'), '');
    fs.writeFileSync(path.join(tmpDir, 'notes.md'), '');

    expect(listMarkdownFiles(tmpDir)).toEqual(['apple.md', 'notes.md', 'zebra.md']);
  });

  test('ignores non-.md files', () => {
    fs.writeFileSync(path.join(tmpDir, 'file.js'), '');
    fs.writeFileSync(path.join(tmpDir, 'file.txt'), '');
    expect(listMarkdownFiles(tmpDir)).toEqual([]);
  });
});

// ─── renderPage ───────────────────────────────────────────────────────────────

describe('renderPage', () => {
  test('includes the title in the <title> tag', () => {
    const html = renderPage('My Doc', '<p>body</p>');
    expect(html).toContain('<title>My Doc</title>');
  });

  test('includes the body HTML', () => {
    const html = renderPage('Title', '<p>hello world</p>');
    expect(html).toContain('<p>hello world</p>');
  });

  test('escapes special characters in the title', () => {
    const html = renderPage('<script>alert(1)</script>', 'body');
    expect(html).toContain('&lt;script&gt;');
    expect(html).not.toContain('<script>alert(1)</script>');
  });

  test('includes the SSE script for live reload', () => {
    const html = renderPage('x', 'body');
    expect(html).toContain('EventSource');
    expect(html).toContain('/_sse');
  });
});

// ─── HTTP server ──────────────────────────────────────────────────────────────

describe('HTTP server', () => {
  let tmpDir;
  let server;
  let baseUrl;

  beforeEach((done) => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'md-server-http-'));
    server = http.createServer(createRequestHandler(tmpDir));
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      baseUrl = `http://127.0.0.1:${port}`;
      done();
    });
  });

  afterEach((done) => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
    server.close(done);
  });

  describe('GET /', () => {
    test('returns 200 with HTML', async () => {
      const res = await request(baseUrl).get('/');
      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toMatch(/text\/html/);
    });

    test('lists markdown files', async () => {
      fs.writeFileSync(path.join(tmpDir, 'hello.md'), '# Hello');
      const res = await request(baseUrl).get('/');
      expect(res.text).toContain('hello');
    });

    test('shows empty state when no files exist', async () => {
      const res = await request(baseUrl).get('/');
      expect(res.text).toContain('No markdown files found');
    });
  });

  describe('GET /<file>.md', () => {
    test('renders markdown as HTML', async () => {
      fs.writeFileSync(path.join(tmpDir, 'test.md'), '# Hello World');
      const res = await request(baseUrl).get('/test.md');
      expect(res.status).toBe(200);
      expect(res.text).toContain('<h1>Hello World</h1>');
    });

    test('returns 404 for non-existent file', async () => {
      const res = await request(baseUrl).get('/missing.md');
      expect(res.status).toBe(404);
    });

    test('includes the filename as page title', async () => {
      fs.writeFileSync(path.join(tmpDir, 'my-notes.md'), 'content');
      const res = await request(baseUrl).get('/my-notes.md');
      expect(res.text).toContain('<title>my-notes</title>');
    });
  });

  describe('GET /_sse', () => {
    test('returns 200 with event-stream content type', (done) => {
      const { port } = server.address();
      const req = http.get(`http://127.0.0.1:${port}/_sse`, (res) => {
        expect(res.statusCode).toBe(200);
        expect(res.headers['content-type']).toMatch(/text\/event-stream/);
        req.destroy();
        done();
      });
      req.on('error', () => {}); // suppress destroy error
    });
  });

  describe('security', () => {
    test('rejects or sanitizes path traversal attempts', async () => {
      // A filename containing '/' is caught by the contains-slash check → 404
      const res = await request(baseUrl).get('/..%2Fetc%2Fpasswd');
      expect([403, 404]).toContain(res.status);
    });

    test('returns 404 for non-.md routes', async () => {
      const res = await request(baseUrl).get('/some/nested/path');
      expect(res.status).toBe(404);
    });
  });
});
