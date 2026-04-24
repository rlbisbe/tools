/**
 * Shared Playwright fixtures.
 *
 * Each test gets a fresh page with window.__TAURI_MOCK__ injected before
 * any scripts run, backed by an in-memory doc store.
 */
import { test as base, expect } from '@playwright/test';
import { startServer } from './server.js';

/** Default fixture documents — includes pre-annotated files for sidebar/edit/delete tests. */
export const DOCS = {
  'code.md':      '# Code\n\n```js\nconsole.log("hello");\n```\n',
  'duplicate.md': '# Duplicate\n\nthe cat sat on the mat.\n\nSomething else here.\n\nthe cat slept soundly.',
  'hello.md':     '# Hello World\n\nThis is a **test** document with some text.\n\nThe quick brown fox jumps over the lazy dog.',
  'mermaid.md':   '# Diagrams\n\n```mermaid\ngraph TD\n  A --> B\n```\n',
  'two-comments.md': '# Two Comments\n\nFirst paragraph with important text.\n\nSecond paragraph with notable text.',
  // Pre-annotated files for AT-SB-*, AT-ED-*, AT-ER-* tests (no reload needed)
  'annotated.md': 'Hello world<!-- @comment: {"id":"z1","anchor":"world","before":"Hello ","after":"","text":"first note","date":"2026-01-01"} -->',
  'three-comments.md':
    'foo<!-- @comment: {"id":"a1","anchor":"foo","before":"","after":"","text":"note a","date":"2026-01-01"} --> ' +
    'bar<!-- @comment: {"id":"b1","anchor":"bar","before":"","after":"","text":"note b","date":"2026-01-01"} --> ' +
    'baz<!-- @comment: {"id":"c1","anchor":"baz","before":"","after":"","text":"note c","date":"2026-01-01"} -->',
  'editable.md':
    'old note here<!-- @comment: {"id":"e1","anchor":"old note here","before":"","after":"","text":"old text","date":"2026-01-01"} -->',
  'deletable.md':
    'keep<!-- @comment: {"id":"k1","anchor":"keep","before":"","after":"","text":"stay","date":"2026-01-01"} --> ' +
    'remove<!-- @comment: {"id":"k2","anchor":"remove","before":"","after":"","text":"go away","date":"2026-01-01"} -->',
  'orphaned.md':
    '# Document\n\nSome content here.<!-- @comment: {"id":"o1","anchor":"missing text","before":"","after":"","text":"orphaned","date":"2026-01-01"} -->',
  'kb.md':
    'alpha<!-- @comment: {"id":"k1","anchor":"alpha","before":"","after":"","text":"first","date":"2026-01-01"} --> ' +
    'beta<!-- @comment: {"id":"k2","anchor":"beta","before":"","after":"","text":"second","date":"2026-01-01"} --> ' +
    'gamma<!-- @comment: {"id":"k3","anchor":"gamma","before":"","after":"","text":"third","date":"2026-01-01"} -->',
  // BUG-IMG-01: document containing relative image paths (REQ-CR-09)
  'images.md':
    '# Images\n\n' +
    '![A local photo](./photo.jpg)\n\n' +
    '![Another image](images/banner.png)\n\n' +
    'Some text after the images.\n',
};

/**
 * Build the mock as a self-contained script injected via addInitScript.
 * The `docs` argument is JSON-serialised by Playwright and available inside.
 */
function mockScript(docs) {
  // This function runs in the browser — no imports, no closures over Node vars.
  const store = Object.assign({}, docs);
  const eventBus = {};

  // Mirror of Rust's make_absolute_url + normalize_path (REQ-CR-09).
  // Rewrites relative image URLs to absolute paths rooted at docsDir.
  function makeAbsoluteUrl(url, docsDir) {
    if (url.startsWith('/') || url.includes('://') || url.startsWith('data:')) {
      return url;
    }
    // Join and normalize (collapse . and ..)
    const parts = (docsDir + '/' + url).split('/');
    const out = [];
    for (const p of parts) {
      if (p === '.' || p === '') { continue; }
      if (p === '..') { out.pop(); } else { out.push(p); }
    }
    return '/' + out.join('/');
  }

  function parseComments(raw) {
    const re = /<!-- @comment: ({.*?}) -->/g;
    const out = [];
    let m;
    while ((m = re.exec(raw)) !== null) {
      try { out.push(JSON.parse(m[1])); } catch {}
    }
    return out;
  }

  function minimalRender(md) {
    return md.split('\n').map(line => {
      if (line.startsWith('# '))   return `<h1>${line.slice(2)}</h1>`;
      if (line.startsWith('## '))  return `<h2>${line.slice(3)}</h2>`;
      if (line.startsWith('### ')) return `<h3>${line.slice(4)}</h3>`;
      if (line.trim() === '')      return '';
      // Images: ![alt](src) — src is rewritten to an absolute path rooted at
      // the mock docs dir, mirroring the fixed Rust render_markdown_for_dir
      // behaviour (REQ-CR-09).
      return `<p>${line
        .replace(/!\[([^\]]*)\]\(([^)]+)\)/g, (_, alt, src) => {
          const abs = makeAbsoluteUrl(src, '/mock/docs');
          return `<img src="${abs}" alt="${alt}">`;
        })
        .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      }</p>`;
    }).join('\n');
  }

  window.__TAURI_MOCK__ = {
    invoke: async function(cmd, args) {
      switch (cmd) {
        case 'list_files':
          return Object.keys(store).filter(f => f.endsWith('.md')).sort();

        case 'open_file': {
          const raw = store[args.filename];
          if (!raw) throw new Error('Not found: ' + args.filename);
          const clean = raw.replace(/<!-- @comment: .*? -->/g, '');
          return { filename: args.filename, html: minimalRender(clean), raw, comments: parseComments(raw) };
        }

        case 'create_comment': {
          const { filename, anchor, before, after, text } = args.args;
          const raw = store[filename];
          if (!raw) throw new Error('Not found: ' + filename);
          const id = 'c' + Date.now() + Math.random().toString(36).slice(2, 6);
          const tag = '<!-- @comment: ' + JSON.stringify({ id, anchor, before, after, text, date: '2026-01-01' }) + ' -->';
          const idx = raw.indexOf(anchor);
          if (idx === -1) throw new Error('Anchor not found: ' + anchor);
          store[filename] = raw.slice(0, idx + anchor.length) + tag + raw.slice(idx + anchor.length);
          return parseComments(store[filename]);
        }

        case 'update_comment': {
          const { filename, id, text } = args.args;
          let raw = store[filename];
          const re = /<!-- @comment: ({.*?}) -->/g;
          let m, found;
          while ((m = re.exec(raw)) !== null) {
            const c = JSON.parse(m[1]);
            if (c.id === id) { found = { tag: m[0], c }; break; }
          }
          if (!found) throw new Error('Comment not found: ' + id);
          found.c.text = text;
          store[filename] = raw.replace(found.tag, '<!-- @comment: ' + JSON.stringify(found.c) + ' -->');
          return parseComments(store[filename]);
        }

        case 'remove_comment': {
          const { filename, id } = args.args;
          let raw = store[filename];
          const re = /<!-- @comment: ({.*?}) -->/g;
          let m;
          while ((m = re.exec(raw)) !== null) {
            const c = JSON.parse(m[1]);
            if (c.id === id) { store[filename] = raw.replace(m[0], ''); break; }
          }
          return parseComments(store[filename]);
        }

        case 'get_raw_markdown':
          return (store[args.filename] || '').replace(/<!-- @comment: .*? -->/g, '');

        case 'get_docs_dir': return '/mock/docs';
        case 'set_docs_dir': return null;
        default: throw new Error('Unknown command: ' + cmd);
      }
    },

    listen: async function(event, handler) {
      if (!eventBus[event]) eventBus[event] = [];
      eventBus[event].push(handler);
      return function() {
        eventBus[event] = (eventBus[event] || []).filter(function(h) { return h !== handler; });
      };
    },

    // Test helpers exposed on the mock
    _emit: function(event, payload) {
      (eventBus[event] || []).forEach(function(h) { h(payload); });
    },
    _store: store,
  };
}

// ─── Server (one per worker) ──────────────────────────────────────────────────

let _server = null;
let _serverUrl = null;

async function getServer() {
  if (!_server) {
    const result = await startServer();
    _server = result.server;
    _serverUrl = result.url;
  }
  return _serverUrl;
}

// ─── Extended test ────────────────────────────────────────────────────────────

export const test = base.extend({
  page: async ({ page }, use) => {
    const serverUrl = await getServer();

    // Inject mock before any page scripts execute.
    // addInitScript(fn, arg) serialises arg as JSON and passes it to fn.
    await page.addInitScript(mockScript, DOCS);

    // Suppress console errors from the page (e.g. Tauri APIs not available)
    page.on('console', msg => {
      if (msg.type() === 'error') {
        // Log for debugging but don't fail the test
      }
    });

    await page.goto(serverUrl);
    // Wait for the app to boot: file index should be visible
    await page.waitForSelector('[data-testid="file-index"]', { timeout: 10_000 });

    await use(page);
  },
});

export { expect };
