# Getting Started

Welcome to the **Markdown Server**! This tool renders your markdown files as styled HTML pages with live reload on save.

## Features

- Renders `.md` files from the `docs/` directory
- **Live reload** — the browser refreshes automatically when you save a file
- Clean, GitHub-style rendering
- No build step required

## Usage

```bash
# Install dependencies
npm install

# Start the server
npm start

# Or use a custom port / docs directory
PORT=8080 DOCS_DIR=./notes node server.js
```

Then open [http://localhost:3000](http://localhost:3000) in your browser.

## How It Works

1. The server watches the `docs/` folder with [chokidar](https://github.com/paulmillr/chokidar)
2. When a file changes, it sends a reload event via **Server-Sent Events (SSE)**
3. The browser receives the event and calls `window.location.reload()`

## Supported Markdown

| Element | Supported |
|---------|-----------|
| Headings | ✅ |
| Bold / Italic | ✅ |
| Code blocks | ✅ |
| Tables | ✅ |
| Blockquotes | ✅ |
| Lists | ✅ |
| Links & Images | ✅ |
