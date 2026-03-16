# Markdown Server

A Node.js HTTP server that renders markdown files from a `docs/` directory with live reload via SSE, inline comments, and a dark mode toggle.

## Running

```bash
npm install
npm start          # http://localhost:3000
PORT=8080 npm start
DOCS_DIR=/my/docs npm start
```

## Testing

```bash
npm test           # jest (unit + integration)
```

All logic lives in `server.js`. Tests are in `__tests__/server.test.js` and `__tests__/commonmark.test.js`.

## Architecture

Everything is in a single file (`server.js`) — no framework, no build step.

**Key exports / functions:**

| Function | What it does |
|---|---|
| `createRequestHandler(docsDir)` | Returns the HTTP handler for a given docs directory |
| `renderPage(title, bodyHtml, pageData?)` | Builds the full HTML page. `pageData` adds the comment UI |
| `parseComments(raw)` | Extracts `<!-- @comment: {...} -->` tags from raw markdown |
| `stripComments(raw)` | Removes comment tags before passing to `marked` |
| `insertComment(raw, anchor, text)` | Inserts a comment after the first occurrence of `anchor` |
| `editComment(raw, anchor, newText)` | Updates the `text` field of a matching comment |
| `deleteComment(raw, anchor)` | Removes a matching comment tag entirely |

**Routes:**

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/_sse` | Server-Sent Events stream for live reload |
| `GET` | `/` | File index |
| `GET` | `/<file>.md` | Render markdown file |
| `POST` | `/_comment` | Add a comment to a file |
| `PATCH` | `/_comment` | Edit an existing comment |
| `DELETE` | `/_comment` | Delete a comment |

## Comment format

Comments are stored as HTML comments in the markdown file, immediately after the anchored text:

```markdown
Some important text<!-- @comment: {"anchor":"important text","text":"review this","date":"2026-03-15"} --> continues here.
```

- Invisible in rendered output (`marked` strips HTML comments from the render)
- Preserved on disk, round-trip safe
- Matched by anchor text (first occurrence wins)

## Dark mode

Uses CSS custom properties (`--bg`, `--surface`, `--border`, etc.) with a `[data-theme="dark"]` override block. Theme preference is persisted to `localStorage` and initialised before first paint (inline script in `<head>`) to avoid flash.

## Docs directory

Put `.md` files in `docs/` — they appear in the index automatically. The directory is created on first start if it doesn't exist.
