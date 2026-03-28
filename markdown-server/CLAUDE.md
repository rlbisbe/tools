# Markdown Server

A Node.js HTTP server that renders markdown files from a `docs/` directory with live reload via SSE, inline comments, a navbar with dark mode, copy-as-markdown, and recent-files quick-switch.

## Running

```bash
npm install
npm start                              # http://localhost:3000
PORT=8080 npm start
DOCS_DIR=/my/docs npm start

# Networked drives (NFS, SMB, CIFS) — inotify won't fire, use polling:
USE_POLLING=true npm start
USE_POLLING=true POLL_INTERVAL=2000 npm start   # slower poll if needed
```

## Environment variables

| Variable | Default | Purpose |
|---|---|---|
| `PORT` | `3000` | HTTP listen port |
| `DOCS_DIR` | `./docs` | Directory of `.md` files to serve |
| `USE_POLLING` | `false` | Force polling watcher (required on network drives) |

## Testing

```bash
npm test              # jest: unit + integration + commonmark conformance
npm run test:e2e      # Playwright: browser E2E tests (chromium)
npm run test:all      # both suites
npm run test:e2e:ui   # Playwright interactive UI mode
```

**Jest** tests live in `__tests__/` — covers all server-side logic and HTTP routes.

**Playwright** tests live in `e2e/` — covers client-side behavior:
- `xss.spec.js` — XSS safety of comment sidebar rendering
- `comments.spec.js` — highlight anchors, CRUD via browser UI
- `dark-mode.spec.js` — theme toggle and localStorage persistence
- `recent-files.spec.js` — recent files dropdown
- `copy-md.spec.js` — copy-to-clipboard button

The `e2e/fixtures.js` shared fixture spins up a real HTTP server on a random port (no chokidar watcher) with an isolated temp `docsDir` per test, and calls `httpServer.closeAllConnections()` on teardown to prevent SSE from blocking shutdown.

Playwright config is at `playwright.config.js` (runs only Chromium by default). `playwright-report/` and `test-results/` are gitignored.

## Architecture

No framework, no build step. Code is split into focused modules:

| File | Purpose |
|---|---|
| `server.js` | Entry point — config, watcher, server startup, re-exports |
| `lib/comments.js` | Pure comment transforms (no dependencies) |
| `lib/renderer.js` | `renderPage`, `escapeHtml`, `safeJson` |
| `lib/handler.js` | `createRequestHandler`, SSE state, route handlers |
| `views/page.ejs` | EJS HTML template (structure + inline JS) |
| `public/styles.css` | All CSS |

**`lib/comments.js`**

| Function | What it does |
|---|---|
| `parseComments(raw)` | Extracts `<!-- @comment: {...} -->` tags from raw markdown |
| `stripComments(raw)` | Removes comment tags before passing to `marked` |
| `insertComment(raw, anchor, text)` | Inserts a comment after the first occurrence of `anchor` |
| `editComment(raw, id, newText)` | Updates the `text` field of a matching comment by id |
| `deleteComment(raw, id)` | Removes a matching comment tag by id |

**`lib/renderer.js`**

| Function | What it does |
|---|---|
| `renderPage(title, bodyHtml, pageData?)` | Renders `views/page.ejs`. `pageData` enables comment UI + navbar actions |
| `safeJson(value)` | `JSON.stringify` with `<`/`>` escaped — safe for embedding in `<script>` blocks |
| `escapeHtml(str)` | Escapes `&`, `<`, `>`, `"` for safe HTML output |

**`lib/handler.js`**

| Function | What it does |
|---|---|
| `createRequestHandler(docsDir)` | Returns the HTTP handler for a given docs directory |
| `notifyClients()` | Broadcasts a reload event to all SSE connections |
| `readJsonBody(req, res, cb)` | Reads request body, parses JSON, calls `cb(err, parsed)`; sends 400 on parse failure |
| `resolveDocFile(file, docsDir, res)` | Validates filename and resolves path; sends 400/403/404 and returns `null` on error |
| `listMarkdownFiles(dir)` | Returns sorted list of `.md` files in `dir` |

**Routes:**

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/_sse` | Server-Sent Events stream for live reload |
| `GET` | `/styles.css` | Serves `public/styles.css` |
| `GET` | `/` | File index |
| `GET` | `/<file>.md` | Render markdown file |
| `POST` | `/_comment` | Add a comment to a file |
| `PATCH` | `/_comment` | Edit an existing comment |
| `DELETE` | `/_comment` | Delete a comment |

## Navbar features (document view)

All four actions live in the `.navbar-actions` flex container in the `<header>`:

- **📋 Copy MD** — copies the raw markdown (with comment annotations stripped) to the clipboard. Uses `navigator.clipboard` API with an `execCommand` textarea fallback.
- **💬 Comments** — toggles the comment sidebar (shows count when comments exist).
- **🕒 Recent** — dropdown listing the last 8 visited files, stored in `localStorage` under key `md-server-recent`. Files are tracked on every document page load.
- **🌙/☀️ Dark mode** — toggles `data-theme="dark"` on `<html>`, persisted to `localStorage`.

## Comment format

Comments are stored as HTML comments in the markdown file, immediately after the anchored text:

```markdown
Some important text<!-- @comment: {"id":"abc123","anchor":"important text","text":"review this","date":"2026-03-15"} --> continues here.
```

- Invisible in rendered output (`marked` strips HTML comments from the render)
- Preserved on disk, round-trip safe
- Matched by anchor text plus before/after context (progressively looser fallback)

## Dark mode

Uses CSS custom properties (`--bg`, `--surface`, `--border`, etc.) defined in `public/styles.css`, with a `[data-theme="dark"]` override block. Theme preference is persisted to `localStorage` and initialised before first paint (inline script in `<head>` of `views/page.ejs`) to avoid flash.

## File watcher

Uses `chokidar`. On local filesystems it uses native OS events (inotify on Linux, FSEvents on macOS). On **networked drives** (NFS, SMB, CIFS, network-mounted volumes) inotify events are not delivered — set `USE_POLLING=true` to switch to stat-based polling at 1-second intervals instead.

## Docs directory

Put `.md` files in `docs/` — they appear in the index automatically. The directory is created on first start if it doesn't exist.
