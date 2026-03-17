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
npm test           # jest (unit + integration + commonmark conformance)
```

All logic lives in `server.js`. Tests are in `__tests__/server.test.js` and `__tests__/commonmark.test.js`.

## Architecture

Everything is in a single file (`server.js`) — no framework, no build step.

**Key exports / functions:**

| Function | What it does |
|---|---|
| `createRequestHandler(docsDir)` | Returns the HTTP handler for a given docs directory |
| `renderPage(title, bodyHtml, pageData?)` | Builds the full HTML page. `pageData` enables comment UI + navbar actions |
| `parseComments(raw)` | Extracts `<!-- @comment: {...} -->` tags from raw markdown |
| `stripComments(raw)` | Removes comment tags before passing to `marked` |
| `insertComment(raw, anchor, text)` | Inserts a comment after the first occurrence of `anchor` |
| `editComment(raw, id, newText)` | Updates the `text` field of a matching comment by id |
| `deleteComment(raw, id)` | Removes a matching comment tag by id |

**Routes:**

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/_sse` | Server-Sent Events stream for live reload |
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

Uses CSS custom properties (`--bg`, `--surface`, `--border`, etc.) with a `[data-theme="dark"]` override block. Theme preference is persisted to `localStorage` and initialised before first paint (inline script in `<head>`) to avoid flash.

## File watcher

Uses `chokidar`. On local filesystems it uses native OS events (inotify on Linux, FSEvents on macOS). On **networked drives** (NFS, SMB, CIFS, network-mounted volumes) inotify events are not delivered — set `USE_POLLING=true` to switch to stat-based polling at 1-second intervals instead.

## Docs directory

Put `.md` files in `docs/` — they appear in the index automatically. The directory is created on first start if it doesn't exist.
