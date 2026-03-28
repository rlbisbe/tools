const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const request = require('supertest');
const { escapeHtml, listMarkdownFiles, renderPage, createRequestHandler, parseComments, stripComments, insertComment, deleteComment, editComment, cleanPosToRawPos } = require('../server');

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

// ─── parseComments ────────────────────────────────────────────────────────────

describe('parseComments', () => {
  test('returns empty array when no comments', () => {
    expect(parseComments('# Hello\n\nSome text.')).toEqual([]);
  });

  test('parses a single comment', () => {
    const raw = 'Hello world<!-- @comment: {"anchor":"world","text":"nice","date":"2026-01-01"} -->!';
    const comments = parseComments(raw);
    expect(comments).toHaveLength(1);
    expect(comments[0]).toEqual({ anchor: 'world', text: 'nice', date: '2026-01-01' });
  });

  test('parses multiple comments', () => {
    const raw = [
      'foo<!-- @comment: {"anchor":"foo","text":"first","date":"2026-01-01"} -->',
      'bar<!-- @comment: {"anchor":"bar","text":"second","date":"2026-01-02"} -->',
    ].join('\n');
    expect(parseComments(raw)).toHaveLength(2);
  });

  test('silently skips malformed JSON inside a comment', () => {
    const raw = 'text<!-- @comment: not-valid-json -->more';
    expect(parseComments(raw)).toEqual([]);
  });
});

// ─── stripComments ────────────────────────────────────────────────────────────

describe('stripComments', () => {
  test('removes a comment tag leaving surrounding text intact', () => {
    const raw = 'Hello world<!-- @comment: {"anchor":"world","text":"nice","date":"2026-01-01"} -->!';
    expect(stripComments(raw)).toBe('Hello world!');
  });

  test('removes multiple comments', () => {
    const raw = 'A<!-- @comment: {"anchor":"A","text":"x","date":"2026-01-01"} --> B<!-- @comment: {"anchor":"B","text":"y","date":"2026-01-01"} -->';
    expect(stripComments(raw)).toBe('A B');
  });

  test('is a no-op when there are no comments', () => {
    const raw = '# Title\n\nPlain text.';
    expect(stripComments(raw)).toBe(raw);
  });
});

// ─── cleanPosToRawPos ─────────────────────────────────────────────────────────

describe('cleanPosToRawPos', () => {
  test('returns same position when there are no comment tags', () => {
    expect(cleanPosToRawPos('Hello world', 5)).toBe(5);
  });

  test('skips over a comment tag that sits between clean positions', () => {
    const tag = '<!-- @comment: {"id":"x","anchor":"Hello","text":"hi","date":"2026-01-01"} -->';
    const raw = 'Hello' + tag + ' world';
    // clean position 5 = just after "Hello" in "Hello world"
    // in raw that's just after "Hello" + the tag = 5 + tag.length
    expect(cleanPosToRawPos(raw, 5)).toBe(5 + tag.length);
  });
});

// ─── insertComment ────────────────────────────────────────────────────────────

describe('insertComment', () => {
  test('returns null when anchor is not found', () => {
    expect(insertComment('Hello world', 'missing', 'note')).toBeNull();
  });

  test('inserts a comment immediately after the anchor text', () => {
    const result = insertComment('Hello world', 'Hello', 'greeting');
    expect(result.indexOf('Hello')).toBeLessThan(result.indexOf('<!-- @comment:'));
    expect(result).toContain('Hello');
    expect(result).toContain(' world');
  });

  test('inserted comment stores anchor, before, after, id, and date', () => {
    const result = insertComment('the server runs fast', 'server', 'check this', { before: 'the ', after: ' runs' });
    const comments = parseComments(result);
    expect(comments).toHaveLength(1);
    expect(comments[0].anchor).toBe('server');
    expect(comments[0].before).toBe('the ');
    expect(comments[0].after).toBe(' runs');
    expect(comments[0].text).toBe('check this');
    expect(comments[0].id).toBeDefined();
    expect(comments[0].date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  test('uses context to anchor the second occurrence of a repeated word', () => {
    const raw = 'server one and server two';
    const result = insertComment(raw, 'server', 'second', { before: 'and ', after: ' two' });
    const comments = parseComments(result);
    expect(comments[0].anchor).toBe('server');
    // The comment tag should appear after "and server", not after the first "server"
    const tagPos = result.indexOf('<!-- @comment:');
    const firstServerEnd = 'server'.length;
    expect(tagPos).toBeGreaterThan(firstServerEnd + 'and '.length);
  });

  test('stripComments after insert restores original text', () => {
    const original = 'Hello world, this is a test.';
    const withComment = insertComment(original, 'world', 'a comment', { before: 'Hello ', after: ', this' });
    expect(stripComments(withComment)).toBe(original);
  });

  test('inserting a second comment on same word lands after existing tag', () => {
    const raw = 'server handles things';
    const first = insertComment(raw, 'server', 'first comment', { before: '', after: ' handles' });
    expect(first).not.toBeNull();
    const second = insertComment(first, 'server', 'second comment', { before: '', after: ' handles' });
    expect(second).not.toBeNull();
    expect(parseComments(second)).toHaveLength(2);
    expect(stripComments(second)).toBe(raw);
  });
});

// ─── POST /_comment ───────────────────────────────────────────────────────────

describe('POST /_comment', () => {
  let tmpDir;
  let server;
  let baseUrl;

  beforeEach((done) => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'md-comment-test-'));
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

  test('saves a comment and returns ok:true', async () => {
    fs.writeFileSync(path.join(tmpDir, 'doc.md'), '# Title\n\nHello world.');
    const res = await request(baseUrl)
      .post('/_comment')
      .send({ file: 'doc.md', anchor: 'Hello world', before: '\n\n', after: '.', text: 'looks good' });
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);

    const saved = fs.readFileSync(path.join(tmpDir, 'doc.md'), 'utf8');
    const comments = parseComments(saved);
    expect(comments).toHaveLength(1);
    expect(comments[0].anchor).toBe('Hello world');
    expect(comments[0].text).toBe('looks good');
    expect(comments[0].id).toBeDefined();
  });

  test('returns 422 when anchor text is not found in the file', async () => {
    fs.writeFileSync(path.join(tmpDir, 'doc.md'), '# Title\n\nHello world.');
    const res = await request(baseUrl)
      .post('/_comment')
      .send({ file: 'doc.md', anchor: 'not in file', text: 'oops' });
    expect(res.status).toBe(422);
    expect(res.body.ok).toBe(false);
  });

  test('returns 404 when the target file does not exist', async () => {
    const res = await request(baseUrl)
      .post('/_comment')
      .send({ file: 'missing.md', anchor: 'text', text: 'note' });
    expect(res.status).toBe(404);
    expect(res.body.ok).toBe(false);
  });

  test('returns 400 for missing fields', async () => {
    const res = await request(baseUrl)
      .post('/_comment')
      .send({ file: 'doc.md' });
    expect(res.status).toBe(400);
    expect(res.body.ok).toBe(false);
  });

  test('rejects file names with path separators', async () => {
    const res = await request(baseUrl)
      .post('/_comment')
      .send({ file: '../secret.md', anchor: 'text', text: 'note' });
    expect(res.status).toBe(400);
    expect(res.body.ok).toBe(false);
  });

  test('comments are stripped from rendered HTML in GET', async () => {
    const content = 'Hello world<!-- @comment: {"anchor":"Hello world","text":"note","date":"2026-01-01"} -->!';
    fs.writeFileSync(path.join(tmpDir, 'doc.md'), content);
    const res = await request(baseUrl).get('/doc.md');
    expect(res.status).toBe(200);
    expect(res.text).not.toContain('@comment:');
    expect(res.text).toContain('Hello world');
  });

  test('comment count appears in the toggle button', async () => {
    const content = 'Hello world<!-- @comment: {"anchor":"Hello world","text":"note","date":"2026-01-01"} -->!';
    fs.writeFileSync(path.join(tmpDir, 'doc.md'), content);
    const res = await request(baseUrl).get('/doc.md');
    expect(res.text).toContain('1 comment');
  });
});

// ─── deleteComment ────────────────────────────────────────────────────────────

describe('deleteComment', () => {
  test('removes a comment by id', () => {
    const raw = insertComment('Hello world!', 'world', 'note', { before: 'Hello ', after: '!' });
    const id = parseComments(raw)[0].id;
    const result = deleteComment(raw, id);
    expect(result).toBe('Hello world!');
    expect(parseComments(result)).toHaveLength(0);
  });

  test('returns null when id does not match any comment', () => {
    const raw = insertComment('Hello world', 'world', 'note');
    expect(deleteComment(raw, 'nonexistent-id')).toBeNull();
  });

  test('only removes the matching comment, leaving others intact', () => {
    const r1 = insertComment('foo bar', 'foo', 'first');
    const r2 = insertComment(r1, 'bar', 'second');
    const id1 = parseComments(r2)[0].id;
    const result = deleteComment(r2, id1);
    expect(parseComments(result)).toHaveLength(1);
    expect(parseComments(result)[0].text).toBe('second');
  });
});

// ─── editComment ──────────────────────────────────────────────────────────────

describe('editComment', () => {
  test('updates the text of the comment with the given id', () => {
    const raw = insertComment('Hello world!', 'world', 'old note', { before: 'Hello ', after: '!' });
    const id = parseComments(raw)[0].id;
    const result = editComment(raw, id, 'new note');
    const comments = parseComments(result);
    expect(comments).toHaveLength(1);
    expect(comments[0].text).toBe('new note');
    expect(comments[0].anchor).toBe('world');
    expect(comments[0].date).toBeDefined();
  });

  test('returns null when id does not match any comment', () => {
    const raw = insertComment('Hello world', 'world', 'note');
    expect(editComment(raw, { before: 'nonexistent-id', after: 'new text' })).toBeNull();
  });

  test('preserves other comments when editing one', () => {
    const r1 = insertComment('foo bar', 'foo', 'first');
    const r2 = insertComment(r1, 'bar', 'second');
    const id1 = parseComments(r2)[0].id;
    const result = editComment(r2, id1, 'updated');
    const comments = parseComments(result);
    expect(comments).toHaveLength(2);
    expect(comments[0].text).toBe('updated');
    expect(comments[1].text).toBe('second');
  });
});

// ─── PATCH /_comment (edit) ───────────────────────────────────────────────────

describe('PATCH /_comment', () => {
  let tmpDir;
  let server;
  let baseUrl;

  beforeEach((done) => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'md-edit-test-'));
    server = http.createServer(createRequestHandler(tmpDir));
    server.listen(0, '127.0.0.1', () => {
      baseUrl = `http://127.0.0.1:${server.address().port}`;
      done();
    });
  });

  afterEach((done) => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
    server.close(done);
  });

  test('updates the comment text and returns ok:true', async () => {
    const initial = insertComment('Hello world!', 'Hello world', 'old', { before: 'Hello ', after: '!' });
    const id = parseComments(initial)[0].id;
    fs.writeFileSync(path.join(tmpDir, 'doc.md'), initial);
    const res = await request(baseUrl)
      .patch('/_comment')
      .send({ file: 'doc.md', id, text: 'updated note' });
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    const saved = fs.readFileSync(path.join(tmpDir, 'doc.md'), 'utf8');
    expect(parseComments(saved)[0].text).toBe('updated note');
  });

  test('returns 422 when id does not match any comment', async () => {
    fs.writeFileSync(path.join(tmpDir, 'doc.md'), '# Hello world');
    const res = await request(baseUrl)
      .patch('/_comment')
      .send({ file: 'doc.md', id: 'nonexistent', text: 'note' });
    expect(res.status).toBe(422);
    expect(res.body.ok).toBe(false);
  });

  test('returns 400 for missing fields', async () => {
    const res = await request(baseUrl).patch('/_comment').send({ file: 'doc.md' });
    expect(res.status).toBe(400);
  });
});

// ─── DELETE /_comment ─────────────────────────────────────────────────────────

describe('DELETE /_comment', () => {
  let tmpDir;
  let server;
  let baseUrl;

  beforeEach((done) => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'md-delete-test-'));
    server = http.createServer(createRequestHandler(tmpDir));
    server.listen(0, '127.0.0.1', () => {
      baseUrl = `http://127.0.0.1:${server.address().port}`;
      done();
    });
  });

  afterEach((done) => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
    server.close(done);
  });

  test('removes the comment and returns ok:true', async () => {
    const initial = insertComment('Hello world!', 'Hello world', 'note', { before: '', after: '!' });
    const id = parseComments(initial)[0].id;
    fs.writeFileSync(path.join(tmpDir, 'doc.md'), initial);
    const res = await request(baseUrl)
      .delete('/_comment')
      .send({ file: 'doc.md', id });
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    const saved = fs.readFileSync(path.join(tmpDir, 'doc.md'), 'utf8');
    expect(parseComments(saved)).toHaveLength(0);
    expect(saved).toBe('Hello world!');
  });

  test('returns 422 when id does not match any comment', async () => {
    fs.writeFileSync(path.join(tmpDir, 'doc.md'), '# Hello world');
    const res = await request(baseUrl)
      .delete('/_comment')
      .send({ file: 'doc.md', id: 'nonexistent' });
    expect(res.status).toBe(422);
    expect(res.body.ok).toBe(false);
  });

  test('returns 400 for missing fields', async () => {
    const res = await request(baseUrl).delete('/_comment').send({ file: 'doc.md' });
    expect(res.status).toBe(400);
  });

  test('rejects path traversal in file name', async () => {
    const res = await request(baseUrl)
      .delete('/_comment')
      .send({ file: '../secret.md', id: 'abc' });
    expect(res.status).toBe(400);
  });
});
