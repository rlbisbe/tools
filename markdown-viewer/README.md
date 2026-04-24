# Markdown Viewer

A native macOS desktop app for reading and annotating markdown files. Built with Tauri v2 and Rust.

Migrated from [a web-based markdown server](https://rlbisbe.net/2026/03/30/llm12-un-visor-de-markdown-diferente/) using spec-driven development — the app was built from [`docs/spec.md`](docs/spec.md) without referencing the original web source code.

## Features

- Renders markdown files from a local directory
- Inline comments — select text, add a note, stored in the file itself
- Dark mode
- Live reload on file changes (via Tauri file watcher)
- Mermaid diagram support
- Recent files quick-switch

## Running

```bash
npm install
npm run dev        # cargo tauri dev — serves frontend from disk
npm run build      # cargo tauri build — produces .app bundle
```

Requires [Rust](https://rustup.rs/) and the [Tauri CLI prerequisites](https://tauri.app/start/prerequisites/).

The app reads `.md` files from `~/Documents/MarkdownDocs` by default. The directory can be changed from within the app.

## Testing

```bash
npm test           # unit (vitest) + E2E (playwright)
npm run test:unit  # vitest only
npm run test:e2e   # playwright only
```

E2E tests run against a local HTTP server with a Tauri mock — no Rust build required.

## Architecture

| Layer | Technology |
|---|---|
| Frontend | Vanilla JS, MVVM pattern |
| Backend | Rust (Tauri v2 commands) |
| Markdown parsing | pulldown-cmark |
| Unit tests | Vitest |
| E2E tests | Playwright (Chromium, headless) |

See [`docs/spec.md`](docs/spec.md) for the full product specification.

## Comment format

Comments are stored as HTML comment tags in the markdown file, immediately after the anchored text:

```markdown
Some important text<!-- @comment: {"id":"abc123","anchor":"important text","text":"review this","date":"2026-04-18"} --> continues here.
```

Invisible in rendered output, preserved on disk, round-trip safe.
