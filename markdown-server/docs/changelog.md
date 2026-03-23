# Changelog

## Code Quality Improvements

### Security: XSS fixes

The comment sidebar was building HTML by assigning user-controlled data directly to `innerHTML`. A comment stored with text like `<img src=x onerror="...">` would execute arbitrary JavaScript when the sidebar was opened.

Two related fixes were applied:

**`renderSidebar` now uses DOM APIs instead of `innerHTML`**. Each sidebar item is built with `createElement` and `textContent`, so comment text, anchor, and date are always treated as plain text — never parsed as HTML.

**`safeJson` for script-embedded JSON**. The server embeds comment data into `<script>` blocks as a JSON literal. If a comment contained `</script>`, the browser's HTML parser would terminate the script block early, breaking the page (or worse, executing injected content). A new `safeJson()` helper escapes `<` and `>` to their Unicode equivalents (`\u003c`, `\u003e`) before embedding.

---

### Server: DRY route handlers

The three `/_comment` routes (POST, PATCH, DELETE) each repeated the same ~50 lines of boilerplate:

- Read the request body
- Parse JSON, return 400 on failure
- Validate the filename (must end in `.md`, no path separators)
- Resolve the file path, check for path traversal
- Check the file exists

This was extracted into two shared helpers:

- **`readJsonBody(req, res, cb)`** — reads the body and parses JSON; calls back with the result or sends a 400 response automatically
- **`resolveDocFile(file, docsDir, res)`** — validates the filename and resolves its path; sends the appropriate error response and returns `null` if anything is wrong

Each route handler went from ~55 lines to ~15 lines.

---

### Client: smaller improvements

**`truncate(str, n)` helper** replaces a copy-pasted pattern that appeared three times — truncating a string to `n` characters and appending `…` if it was longer.

**Event delegation for the sidebar** replaces three separate `querySelectorAll().forEach()` loops that re-registered event listeners on every `renderSidebar()` call. Now a single `click` listener on the sidebar list handles all interactions (row click, edit button, delete button) by inspecting `event.target.closest(...)`.

**Copy button feedback deduplicated**. The "save original label → set ✓ Copied! → restore after 2s" logic was duplicated identically in both the `try` and `catch` branches. It is now a single `flashBtn()` helper called once after the copy attempt.

**`submitBtn` declaration moved** to before `openCommentForm`, which referenced it. Both are in the same IIFE scope so it worked, but the forward reference was confusing.

---

### Testing: Playwright E2E suite

The existing Jest suite covers server-side logic and HTTP routes well, but the client-side JavaScript had no tests at all. [Playwright](https://playwright.dev/) was added for browser-level E2E testing.

**24 tests across 5 spec files** in `e2e/`:

| File | What it covers |
|---|---|
| `xss.spec.js` | Comment text and anchor with HTML payloads are not executed |
| `comments.spec.js` | Anchor highlighting, sidebar click-through, edit and delete via browser UI |
| `dark-mode.spec.js` | Theme toggle, localStorage persistence, preference restored on reload |
| `recent-files.spec.js` | Visit tracking, dropdown contents, current file exclusion, outside-click close |
| `copy-md.spec.js` | Button label feedback, clipboard content strips comment annotations |

Each test gets its own isolated server instance on a random port with a fresh temp directory. The fixture calls `httpServer.closeAllConnections()` on teardown so SSE connections don't block the server from shutting down.

```bash
npm run test:e2e       # run Playwright tests
npm run test:all       # jest + Playwright together
npm run test:e2e:ui    # interactive Playwright UI
```
