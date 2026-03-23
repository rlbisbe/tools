#!/usr/bin/env node

const http = require('http');
const fs = require('fs');
const path = require('path');
const { marked } = require('marked');
const chokidar = require('chokidar');

const PORT = process.env.PORT || 3000;
const DOCS_DIR = process.env.DOCS_DIR || path.join(__dirname, 'docs');
const USE_POLLING = process.env.USE_POLLING === 'true';

// SSE clients waiting for reload events
const sseClients = new Set();

function notifyClients() {
  for (const res of sseClients) {
    res.write('data: reload\n\n');
  }
}

function escapeHtml(str) {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// ── Comment helpers ───────────────────────────────────────────────────────────

function parseComments(raw) {
  const comments = [];
  const re = /<!--\s*@comment:\s*([\s\S]*?)-->/g;
  let m;
  while ((m = re.exec(raw)) !== null) {
    try { comments.push(JSON.parse(m[1].trim())); } catch {}
  }
  return comments;
}

function stripComments(raw) {
  return raw.replace(/<!--\s*@comment:\s*[\s\S]*?-->/g, '');
}

// Map a character offset in stripComments(raw) back to an offset in raw,
// skipping over any comment tags that sit between the two positions.
function cleanPosToRawPos(raw, cleanPos) {
  const re = /<!--\s*@comment:\s*[\s\S]*?-->/g;
  const spans = [];
  let m;
  while ((m = re.exec(raw)) !== null) spans.push([m.index, m.index + m[0].length]);

  let rawPos = 0, cp = 0;
  while (rawPos < raw.length) {
    if (cp === cleanPos) {
      // Advance past any comment tag that starts exactly here
      let jumped = true;
      while (jumped) {
        jumped = false;
        for (const [s, e] of spans) {
          if (s === rawPos) { rawPos = e; jumped = true; break; }
        }
      }
      return rawPos;
    }
    // Skip comment tags
    let skipped = false;
    for (const [s, e] of spans) {
      if (s === rawPos) { rawPos = e; skipped = true; break; }
    }
    if (!skipped) { cp++; rawPos++; }
  }
  return rawPos;
}

function insertComment(raw, anchor, commentText, before = '', after = '') {
  const clean = stripComments(raw);

  // Try progressively looser context matches
  let anchorStart = -1;
  const searches = [
    before + anchor + after,
    anchor + after,
    before + anchor,
    anchor,
  ];
  for (const s of searches) {
    const i = clean.indexOf(s);
    if (i !== -1) {
      // anchor starts at i + (length of the before-portion of s)
      const beforeLen = s.startsWith(before) ? before.length : 0;
      anchorStart = i + beforeLen;
      break;
    }
  }
  if (anchorStart === -1) return null;

  const insertAt = cleanPosToRawPos(raw, anchorStart + anchor.length);
  const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  const payload = JSON.stringify({ id, anchor, before, after, text: commentText, date: new Date().toISOString().slice(0, 10) });
  return raw.slice(0, insertAt) + `<!-- @comment: ${payload} -->` + raw.slice(insertAt);
}

function deleteComment(raw, id) {
  const re = /<!--\s*@comment:\s*([\s\S]*?)-->/g;
  let m;
  while ((m = re.exec(raw)) !== null) {
    try {
      if (JSON.parse(m[1].trim()).id === id) {
        return raw.slice(0, m.index) + raw.slice(m.index + m[0].length);
      }
    } catch {}
  }
  return null;
}

function editComment(raw, id, newText) {
  const re = /<!--\s*@comment:\s*([\s\S]*?)-->/g;
  let m;
  while ((m = re.exec(raw)) !== null) {
    try {
      const parsed = JSON.parse(m[1].trim());
      if (parsed.id === id) {
        const updated = JSON.stringify({ ...parsed, text: newText });
        return raw.slice(0, m.index) + `<!-- @comment: ${updated} -->` + raw.slice(m.index + m[0].length);
      }
    } catch {}
  }
  return null;
}

// ── Page renderer ─────────────────────────────────────────────────────────────

// Serialize a value to JSON safe for embedding inside a <script> block.
// JSON.stringify leaves </script> unescaped which terminates the script block.
function safeJson(value) {
  return JSON.stringify(value).replace(/</g, '\\u003c').replace(/>/g, '\\u003e');
}

function renderPage(title, bodyHtml, pageData) {
  const commentsJson = safeJson(pageData ? (pageData.comments || []) : []);
  const filenameJson = safeJson(pageData ? (pageData.filename || '') : '');
  const rawMarkdownJson = safeJson(pageData ? (pageData.rawMarkdown || '') : '');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(title)}</title>
  <style>
    :root {
      --bg:          #f6f8fa;
      --surface:     #ffffff;
      --border:      #e1e4e8;
      --border-soft: #f0f0f0;
      --text:        #24292e;
      --text-muted:  #586069;
      --text-faint:  #959da5;
      --link:        #0366d6;
      --link-hover:  #0258b6;
      --code-bg:     #f3f4f6;
      --th-bg:       #f6f8fa;
      --blockquote:  #6a737d;
      --blockquote-border: #dfe2e5;
      --comment-hl:  #fff3cd;
      --comment-hl-hover: #ffe8a1;
      --comment-border: #f0ad4e;
      --bubble-bg:   #24292e;
      --btn-secondary-bg: #f3f4f6;
      --btn-secondary-hover: #e9eaec;
      --input-border: #e1e4e8;
      --overlay-bg:  rgba(0,0,0,0.35);
      --shadow:      0 8px 24px rgba(0,0,0,0.2);
    }
    [data-theme="dark"] {
      --bg:          #0d1117;
      --surface:     #161b22;
      --border:      #30363d;
      --border-soft: #21262d;
      --text:        #c9d1d9;
      --text-muted:  #8b949e;
      --text-faint:  #6e7681;
      --link:        #58a6ff;
      --link-hover:  #79b8ff;
      --code-bg:     #1c2128;
      --th-bg:       #1c2128;
      --blockquote:  #8b949e;
      --blockquote-border: #3d4450;
      --comment-hl:  #3d2e00;
      --comment-hl-hover: #4d3a00;
      --comment-border: #bb8009;
      --bubble-bg:   #e6edf3;
      --btn-secondary-bg: #21262d;
      --btn-secondary-hover: #30363d;
      --input-border: #30363d;
      --overlay-bg:  rgba(0,0,0,0.6);
      --shadow:      0 8px 24px rgba(0,0,0,0.5);
    }

    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      line-height: 1.6;
      color: var(--text);
      background: var(--bg);
      transition: background 0.2s, color 0.2s;
    }
    .container {
      max-width: 860px;
      margin: 0 auto;
      padding: 2rem 1.5rem;
    }
    header {
      background: var(--surface);
      border-bottom: 1px solid var(--border);
      padding: 1rem 1.5rem;
      display: flex;
      align-items: center;
      gap: 1rem;
    }
    header a { text-decoration: none; color: var(--link); font-weight: 600; }
    header a:hover { text-decoration: underline; }
    .breadcrumb { color: var(--text-muted); font-size: 0.9rem; }
    .breadcrumb span { margin: 0 0.4rem; }
    .navbar-actions {
      margin-left: auto;
      display: flex;
      align-items: center;
      gap: 0.4rem;
    }
    .nav-btn {
      background: none;
      border: 1px solid var(--border);
      border-radius: 4px;
      padding: 0.25rem 0.55rem;
      cursor: pointer;
      font-size: 0.8rem;
      color: var(--text-muted);
      white-space: nowrap;
      line-height: 1.4;
    }
    .nav-btn:hover { background: var(--code-bg); color: var(--text); }
    #theme-toggle {
      background: none;
      border: 1px solid var(--border);
      border-radius: 4px;
      padding: 0.25rem 0.5rem;
      cursor: pointer;
      font-size: 1rem;
      color: var(--text-muted);
      line-height: 1;
    }
    #theme-toggle:hover { background: var(--code-bg); }
    .recent-dropdown-wrapper { position: relative; }
    #recent-dropdown {
      position: absolute;
      top: calc(100% + 6px);
      right: 0;
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: 6px;
      box-shadow: var(--shadow);
      z-index: 500;
      min-width: 210px;
      max-width: 320px;
      display: none;
    }
    #recent-dropdown.open { display: block; }
    .recent-dropdown-header {
      padding: 0.45rem 0.75rem;
      font-size: 0.72rem;
      font-weight: 600;
      color: var(--text-muted);
      border-bottom: 1px solid var(--border);
      text-transform: uppercase;
      letter-spacing: 0.04em;
    }
    .recent-item {
      display: block;
      padding: 0.45rem 0.75rem;
      text-decoration: none;
      color: var(--text);
      font-size: 0.85rem;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      border-bottom: 1px solid var(--border-soft);
    }
    .recent-item:last-child { border-bottom: none; }
    .recent-item:hover { background: var(--code-bg); }
    .recent-item.current { color: var(--text-muted); font-style: italic; }
    .recent-empty {
      padding: 0.75rem;
      color: var(--text-muted);
      font-size: 0.82rem;
      text-align: center;
    }
    .card {
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: 6px;
      padding: 2rem;
      margin-top: 1.5rem;
    }
    .file-list { list-style: none; }
    .file-list li { border-bottom: 1px solid var(--border); }
    .file-list li:last-child { border-bottom: none; }
    .file-list a {
      display: flex;
      align-items: center;
      gap: 0.6rem;
      padding: 0.75rem 0;
      text-decoration: none;
      color: var(--link);
      font-size: 1rem;
    }
    .file-list a:hover { text-decoration: underline; }
    .file-list .icon { font-size: 1.1rem; }
    .markdown-body h1, .markdown-body h2, .markdown-body h3,
    .markdown-body h4, .markdown-body h5, .markdown-body h6 {
      margin: 1.5rem 0 0.75rem;
      line-height: 1.3;
      color: var(--text);
    }
    .markdown-body h1 { font-size: 2rem; border-bottom: 1px solid var(--border); padding-bottom: 0.5rem; }
    .markdown-body h2 { font-size: 1.5rem; border-bottom: 1px solid var(--border); padding-bottom: 0.3rem; }
    .markdown-body h3 { font-size: 1.25rem; }
    .markdown-body p { margin: 0.75rem 0; }
    .markdown-body ul, .markdown-body ol { margin: 0.75rem 0 0.75rem 1.5rem; }
    .markdown-body li { margin: 0.25rem 0; }
    .markdown-body code {
      background: var(--code-bg);
      padding: 0.15rem 0.4rem;
      border-radius: 3px;
      font-family: 'SFMono-Regular', Consolas, monospace;
      font-size: 0.875em;
    }
    .markdown-body pre {
      background: var(--code-bg);
      border: 1px solid var(--border);
      border-radius: 6px;
      padding: 1rem;
      overflow-x: auto;
      margin: 1rem 0;
    }
    .markdown-body pre code { background: none; padding: 0; }
    .markdown-body blockquote {
      border-left: 4px solid var(--blockquote-border);
      padding: 0.25rem 1rem;
      color: var(--blockquote);
      margin: 1rem 0;
    }
    .markdown-body table {
      border-collapse: collapse;
      width: 100%;
      margin: 1rem 0;
    }
    .markdown-body th, .markdown-body td {
      border: 1px solid var(--border);
      padding: 0.5rem 0.75rem;
    }
    .markdown-body th { background: var(--th-bg); font-weight: 600; }
    .markdown-body a { color: var(--link); }
    .markdown-body img { max-width: 100%; }
    .markdown-body hr { border: none; border-top: 1px solid var(--border); margin: 1.5rem 0; }
    #reload-indicator {
      position: fixed;
      bottom: 1rem;
      right: 1rem;
      background: #28a745;
      color: white;
      padding: 0.4rem 0.8rem;
      border-radius: 4px;
      font-size: 0.8rem;
      opacity: 0;
      transition: opacity 0.3s;
      pointer-events: none;
    }
    #reload-indicator.visible { opacity: 1; }

    /* ── Comments UI ──────────────────────────────────────────────────────── */
    .comment-anchor {
      background: var(--comment-hl);
      border-bottom: 2px solid var(--comment-border);
      cursor: pointer;
      border-radius: 2px;
    }
    .comment-anchor:hover { background: var(--comment-hl-hover); }

    #comment-toggle {
      background: var(--link);
      color: white;
      border: none;
      border-radius: 4px;
      padding: 0.25rem 0.55rem;
      cursor: pointer;
      font-size: 0.8rem;
      white-space: nowrap;
      line-height: 1.4;
    }
    #comment-toggle:hover { background: var(--link-hover); }

    #comment-sidebar {
      position: fixed;
      right: 0; top: 0; bottom: 0;
      width: 300px;
      background: var(--surface);
      border-left: 1px solid var(--border);
      overflow-y: auto;
      transform: translateX(100%);
      transition: transform 0.25s ease;
      z-index: 100;
      display: flex;
      flex-direction: column;
    }
    #comment-sidebar.open { transform: translateX(0); }
    #sidebar-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 1rem;
      border-bottom: 1px solid var(--border);
      font-weight: 600;
      font-size: 0.95rem;
      flex-shrink: 0;
    }
    #sidebar-close {
      background: none;
      border: none;
      font-size: 1.1rem;
      cursor: pointer;
      color: var(--text-muted);
      line-height: 1;
    }
    .sidebar-comment {
      padding: 0.75rem 1rem;
      border-bottom: 1px solid var(--border-soft);
      cursor: pointer;
    }
    .sidebar-comment:hover { background: var(--code-bg); }
    .sidebar-comment .sc-anchor {
      font-size: 0.8rem;
      color: var(--text-muted);
      font-style: italic;
      margin-bottom: 0.3rem;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .sidebar-comment .sc-text { font-size: 0.9rem; color: var(--text); }
    .sidebar-comment .sc-date { font-size: 0.75rem; color: var(--text-faint); margin-top: 0.25rem; }
    .sc-actions {
      display: flex;
      gap: 0.4rem;
      margin-top: 0.4rem;
    }
    .sc-btn {
      background: none;
      border: 1px solid var(--border);
      border-radius: 4px;
      padding: 0.15rem 0.5rem;
      font-size: 0.75rem;
      cursor: pointer;
      color: var(--text-muted);
    }
    .sc-btn:hover { background: var(--code-bg); color: var(--text); }
    .sc-btn.delete:hover { background: #ffeef0; border-color: #f97583; color: #d73a49; }
    [data-theme="dark"] .sc-btn.delete:hover { background: #3d1a1e; border-color: #f97583; }
    .sidebar-empty {
      padding: 2rem 1rem;
      color: var(--text-muted);
      text-align: center;
      font-size: 0.9rem;
    }

    #comment-bubble {
      position: absolute;
      background: var(--bubble-bg);
      color: var(--bg);
      padding: 0.35rem 0.8rem;
      border-radius: 4px;
      font-size: 0.8rem;
      cursor: pointer;
      z-index: 200;
      display: none;
      white-space: nowrap;
      user-select: none;
      transform: translateX(-50%);
    }
    #comment-bubble::after {
      content: '';
      position: absolute;
      top: 100%;
      left: 50%;
      transform: translateX(-50%);
      border: 5px solid transparent;
      border-top-color: var(--bubble-bg);
      border-bottom: none;
    }

    #comment-form-overlay {
      position: fixed;
      inset: 0;
      background: var(--overlay-bg);
      z-index: 300;
      display: none;
      align-items: center;
      justify-content: center;
    }
    #comment-form-overlay.open { display: flex; }
    #comment-form {
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: 8px;
      padding: 1.25rem;
      width: 380px;
      box-shadow: var(--shadow);
    }
    #comment-form h3 { font-size: 0.95rem; margin-bottom: 0.5rem; color: var(--text); }
    #comment-anchor-preview {
      font-size: 0.8rem;
      color: var(--text-muted);
      font-style: italic;
      background: var(--code-bg);
      border-radius: 4px;
      padding: 0.4rem 0.6rem;
      margin-bottom: 0.75rem;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    #comment-text-input {
      width: 100%;
      border: 1px solid var(--input-border);
      background: var(--surface);
      color: var(--text);
      border-radius: 4px;
      padding: 0.5rem;
      font-size: 0.9rem;
      font-family: inherit;
      resize: vertical;
      min-height: 80px;
      margin-bottom: 0.75rem;
    }
    #comment-text-input:focus { outline: none; border-color: var(--link); }
    .form-actions { display: flex; justify-content: flex-end; gap: 0.5rem; }
    .btn { border: none; border-radius: 4px; padding: 0.4rem 0.9rem; font-size: 0.85rem; cursor: pointer; }
    .btn-primary { background: var(--link); color: white; }
    .btn-primary:hover { background: var(--link-hover); }
    .btn-primary:disabled { opacity: 0.5; cursor: default; }
    .btn-secondary { background: var(--btn-secondary-bg); color: var(--text); border: 1px solid var(--border); }
    .btn-secondary:hover { background: var(--btn-secondary-hover); }
  </style>
  <script>
    (function () {
      const saved = localStorage.getItem('theme');
      const preferred = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
      document.documentElement.dataset.theme = saved || preferred;
    })();
  </script>
</head>
<body>
  <header>
    <a href="/">📄 Markdown Server</a>
    <span class="breadcrumb">${title !== 'Index' ? `<span>/</span> ${escapeHtml(title)}` : ''}</span>
    <div class="navbar-actions">
      ${pageData ? `<button id="copy-md-btn" class="nav-btn" title="Copy markdown without annotations">📋 Copy MD</button>
      <button id="comment-toggle" class="nav-btn">💬 ${pageData.comments && pageData.comments.length ? pageData.comments.length + ' comment' + (pageData.comments.length !== 1 ? 's' : '') : 'Comments'}</button>` : ''}
      <div class="recent-dropdown-wrapper">
        <button id="recent-btn" class="nav-btn" title="Recent files">🕒 Recent</button>
        <div id="recent-dropdown"></div>
      </div>
      <button id="theme-toggle" title="Toggle dark mode">🌙</button>
    </div>
  </header>
  <div class="container">
    <div class="card">
      ${bodyHtml}
    </div>
  </div>
  <div id="reload-indicator">Reloaded</div>

  ${pageData ? `
  <div id="comment-sidebar">
    <div id="sidebar-header">
      <span>Comments</span>
      <button id="sidebar-close" title="Close">✕</button>
    </div>
    <div id="sidebar-list"></div>
  </div>

  <div id="comment-bubble">💬 Add comment</div>

  <div id="comment-form-overlay">
    <div id="comment-form">
      <h3 id="comment-form-title">Add comment</h3>
      <div id="comment-anchor-preview"></div>
      <textarea id="comment-text-input" placeholder="Write your comment…"></textarea>
      <div class="form-actions">
        <button class="btn btn-secondary" id="comment-cancel">Cancel</button>
        <button class="btn btn-primary" id="comment-submit">Save</button>
      </div>
    </div>
  </div>
  ` : ''}

  <script>
    const evtSource = new EventSource('/_sse');
    evtSource.onmessage = (e) => {
      if (e.data === 'reload') {
        window.location.reload();
      }
    };

    (function () {
      const btn = document.getElementById('theme-toggle');
      function applyTheme(theme) {
        document.documentElement.dataset.theme = theme;
        btn.textContent = theme === 'dark' ? '☀️' : '🌙';
        localStorage.setItem('theme', theme);
      }
      applyTheme(document.documentElement.dataset.theme || 'light');
      btn.addEventListener('click', () => {
        applyTheme(document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark');
      });
    })();

    // ── Recent files ──────────────────────────────────────────────────────
    (function () {
      const RECENT_KEY = 'md-server-recent';
      const MAX_RECENT = 8;
      const currentFile = ${filenameJson};

      // Track current file visit
      if (currentFile) {
        try {
          const recent = JSON.parse(localStorage.getItem(RECENT_KEY) || '[]');
          const entry = { file: currentFile, title: document.title, ts: Date.now() };
          const filtered = recent.filter(r => r.file !== currentFile);
          filtered.unshift(entry);
          localStorage.setItem(RECENT_KEY, JSON.stringify(filtered.slice(0, MAX_RECENT)));
        } catch {}
      }

      const recentBtn = document.getElementById('recent-btn');
      const dropdown = document.getElementById('recent-dropdown');

      function escH(s) {
        return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
      }

      function renderDropdown() {
        try {
          const recent = JSON.parse(localStorage.getItem(RECENT_KEY) || '[]');
          const items = recent.filter(r => r.file !== currentFile);
          if (!items.length) {
            dropdown.innerHTML = '<div class="recent-empty">No recent files</div>';
          } else {
            dropdown.innerHTML = '<div class="recent-dropdown-header">Recent files</div>' +
              items.map(r => '<a class="recent-item" href="/' + encodeURIComponent(r.file) + '">' + escH(r.title || r.file) + '</a>').join('');
          }
        } catch {}
      }

      recentBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (dropdown.classList.contains('open')) {
          dropdown.classList.remove('open');
        } else {
          renderDropdown();
          dropdown.classList.add('open');
        }
      });

      document.addEventListener('click', (e) => {
        if (!e.target.closest('.recent-dropdown-wrapper')) {
          dropdown.classList.remove('open');
        }
      });
    })();

    ${pageData ? `
    // ── Copy as Markdown ──────────────────────────────────────────────────
    (function () {
      const btn = document.getElementById('copy-md-btn');
      if (!btn) return;
      const RAW_MD = ${rawMarkdownJson};

      function flashBtn(b) {
        const orig = b.textContent;
        b.textContent = '✓ Copied!';
        setTimeout(() => { b.textContent = orig; }, 2000);
      }

      btn.addEventListener('click', async () => {
        try {
          await navigator.clipboard.writeText(RAW_MD);
        } catch {
          const ta = document.createElement('textarea');
          ta.value = RAW_MD;
          ta.style.cssText = 'position:fixed;opacity:0';
          document.body.appendChild(ta);
          ta.select();
          document.execCommand('copy');
          document.body.removeChild(ta);
        }
        flashBtn(btn);
      });
    })();
    ` : ''}
  </script>

  ${pageData ? `
  <script>
  (function () {
    const COMMENTS = ${commentsJson};
    const FILE = ${filenameJson};

    function truncate(str, n) {
      return str.length > n ? str.slice(0, n) + '\u2026' : str;
    }

    // ── Highlight anchors using context ──────────────────────────────────
    function highlightComments() {
      const body = document.querySelector('.markdown-body');
      if (!body) return;

      const nodeMap = [];
      const walker = document.createTreeWalker(body, NodeFilter.SHOW_TEXT);
      let fullText = '';
      let node;
      while ((node = walker.nextNode())) {
        nodeMap.push({ node, start: fullText.length });
        fullText += node.textContent;
      }

      function wrapAt(charIdx, len, commentIdx) {
        const nm = nodeMap.find(n => n.start <= charIdx && charIdx < n.start + n.node.textContent.length);
        if (!nm) return;
        try {
          const range = document.createRange();
          const off = charIdx - nm.start;
          range.setStart(nm.node, off);
          range.setEnd(nm.node, off + len);
          const span = document.createElement('span');
          span.className = 'comment-anchor';
          span.dataset.commentIdx = commentIdx;
          range.surroundContents(span);
          span.addEventListener('click', () => openSidebar(commentIdx));
        } catch {}
      }

      COMMENTS.forEach((c, i) => {
        const before = c.before || '';
        const after  = c.after  || '';
        const candidates = [
          before + c.anchor + after,
          c.anchor + after,
          before + c.anchor,
          c.anchor,
        ];
        for (const s of candidates) {
          const idx = fullText.indexOf(s);
          if (idx !== -1) {
            const beforeLen = s.startsWith(before) ? before.length : 0;
            wrapAt(idx + beforeLen, c.anchor.length, i);
            break;
          }
        }
      });
    }

    // Extract up to len chars of plain text before/after the selection
    function getSelectionContext(sel, len = 30) {
      const body = document.querySelector('.markdown-body');
      if (!body || !sel.rangeCount) return { before: '', after: '' };
      const range = sel.getRangeAt(0);
      try {
        const pre = document.createRange();
        pre.setStart(body, 0);
        pre.setEnd(range.startContainer, range.startOffset);
        const before = pre.toString().slice(-len);

        const walker = document.createTreeWalker(body, NodeFilter.SHOW_TEXT);
        let last = body;
        while (walker.nextNode()) last = walker.currentNode;
        const post = document.createRange();
        post.setStart(range.endContainer, range.endOffset);
        post.setEnd(last, last.nodeType === 3 ? last.length : 0);
        const after = post.toString().slice(0, len);

        return { before, after };
      } catch { return { before: '', after: '' }; }
    }

    // ── Sidebar ───────────────────────────────────────────────────────────
    const sidebar = document.getElementById('comment-sidebar');
    const sidebarList = document.getElementById('sidebar-list');

    function makeSidebarItem(c, i) {
      const item = document.createElement('div');
      item.className = 'sidebar-comment';
      item.dataset.idx = i;

      const anchorEl = document.createElement('div');
      anchorEl.className = 'sc-anchor';
      anchorEl.textContent = '"' + truncate(c.anchor, 60) + '"';

      const textEl = document.createElement('div');
      textEl.className = 'sc-text';
      textEl.textContent = c.text;

      const dateEl = document.createElement('div');
      dateEl.className = 'sc-date';
      dateEl.textContent = c.date || '';

      const actions = document.createElement('div');
      actions.className = 'sc-actions';

      const editBtn = document.createElement('button');
      editBtn.className = 'sc-btn edit';
      editBtn.dataset.idx = i;
      editBtn.textContent = 'Edit';

      const delBtn = document.createElement('button');
      delBtn.className = 'sc-btn delete';
      delBtn.dataset.idx = i;
      delBtn.textContent = 'Delete';

      actions.append(editBtn, delBtn);
      item.append(anchorEl, textEl, dateEl, actions);
      return item;
    }

    function renderSidebar() {
      sidebarList.innerHTML = '';
      if (!COMMENTS.length) {
        const empty = document.createElement('p');
        empty.className = 'sidebar-empty';
        empty.innerHTML = 'No comments yet.<br>Select text to add one.';
        sidebarList.appendChild(empty);
        return;
      }
      COMMENTS.forEach((c, i) => sidebarList.appendChild(makeSidebarItem(c, i)));
    }

    // Event delegation — one listener handles all clicks in the sidebar list
    sidebarList.addEventListener('click', async (e) => {
      const editBtn = e.target.closest('.sc-btn.edit');
      const delBtn  = e.target.closest('.sc-btn.delete');
      const row     = e.target.closest('.sidebar-comment');
      if (!row) return;

      const idx = parseInt(row.dataset.idx);
      const c = COMMENTS[idx];

      if (editBtn) {
        e.stopPropagation();
        openCommentForm(c.anchor, c.text, c.before, c.after, c.id);
      } else if (delBtn) {
        e.stopPropagation();
        if (!confirm('Delete comment on "' + truncate(c.anchor, 60) + '"?')) return;
        try {
          const res = await fetch('/_comment', {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ file: FILE, id: c.id }),
          });
          const data = await res.json();
          if (!data.ok) alert('Could not delete: ' + (data.error || 'unknown error'));
        } catch (err) {
          alert('Error: ' + err.message);
        }
      } else {
        const anchor = document.querySelector('.comment-anchor[data-comment-idx="' + idx + '"]');
        if (anchor) anchor.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    });

    function openSidebar(scrollToIdx) {
      sidebar.classList.add('open');
      if (scrollToIdx !== undefined) {
        setTimeout(() => {
          const el = sidebarList.querySelector('[data-idx="' + scrollToIdx + '"]');
          if (el) el.scrollIntoView({ block: 'nearest' });
        }, 50);
      }
    }

    document.getElementById('comment-toggle').addEventListener('click', () => sidebar.classList.toggle('open'));
    document.getElementById('sidebar-close').addEventListener('click', () => sidebar.classList.remove('open'));

    // ── Selection bubble ──────────────────────────────────────────────────
    const bubble = document.getElementById('comment-bubble');
    let pendingAnchor = null;

    document.addEventListener('mouseup', (e) => {
      if (e.target.closest('#comment-sidebar') || e.target.closest('#comment-form-overlay')) return;
      setTimeout(() => {
        const sel = window.getSelection();
        const text = sel ? sel.toString().trim() : '';
        const mdBody = document.querySelector('.markdown-body');
        if (text && mdBody && mdBody.contains(sel.anchorNode)) {
          const rect = sel.getRangeAt(0).getBoundingClientRect();
          bubble.style.left = (rect.left + rect.width / 2 + window.scrollX) + 'px';
          bubble.style.top = (rect.top - 38 + window.scrollY) + 'px';
          bubble.style.display = 'block';
          pendingAnchor = { text, ...getSelectionContext(sel) };
        } else {
          bubble.style.display = 'none';
          pendingAnchor = null;
        }
      }, 10);
    });

    document.addEventListener('mousedown', (e) => {
      if (!e.target.closest('#comment-bubble')) {
        bubble.style.display = 'none';
      }
    });

    bubble.addEventListener('mousedown', (e) => e.preventDefault());
    bubble.addEventListener('click', () => {
      if (!pendingAnchor) return;
      bubble.style.display = 'none';
      window.getSelection().removeAllRanges();
      openCommentForm(pendingAnchor.text, undefined, pendingAnchor.before, pendingAnchor.after);
    });

    // ── Comment form (create + edit) ──────────────────────────────────────
    const overlay = document.getElementById('comment-form-overlay');
    const preview = document.getElementById('comment-anchor-preview');
    const input = document.getElementById('comment-text-input');
    const formTitle = document.getElementById('comment-form-title');
    const submitBtn = document.getElementById('comment-submit');
    let formState = null; // { mode: 'create'|'edit', anchor, before?, after?, id? }

    function openCommentForm(anchor, existingText, before, after, id) {
      const mode = existingText !== undefined ? 'edit' : 'create';
      formState = { mode, anchor, before: before || '', after: after || '', id };
      formTitle.textContent = mode === 'edit' ? 'Edit comment' : 'Add comment';
      preview.textContent = '"' + truncate(anchor, 80) + '"';
      input.value = existingText || '';
      submitBtn.disabled = false;
      overlay.classList.add('open');
      setTimeout(() => { input.focus(); input.setSelectionRange(input.value.length, input.value.length); }, 50);
    }

    document.getElementById('comment-cancel').addEventListener('click', () => overlay.classList.remove('open'));
    overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.classList.remove('open'); });

    submitBtn.addEventListener('click', submitComment);
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) submitComment();
    });

    async function submitComment() {
      const text = input.value.trim();
      if (!text || !formState) return;
      submitBtn.disabled = true;
      const isEdit = formState.mode === 'edit';
      const body = isEdit
        ? { file: FILE, id: formState.id, text }
        : { file: FILE, anchor: formState.anchor, before: formState.before, after: formState.after, text };
      try {
        const res = await fetch('/_comment', {
          method: isEdit ? 'PATCH' : 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
        const data = await res.json();
        if (data.ok) {
          overlay.classList.remove('open');
        } else {
          alert('Could not save comment: ' + (data.error || 'unknown error'));
          submitBtn.disabled = false;
        }
      } catch (err) {
        alert('Error: ' + err.message);
        submitBtn.disabled = false;
      }
    }

    // ── Init ──────────────────────────────────────────────────────────────
    highlightComments();
    renderSidebar();
  })();
  </script>
  ` : ''}
</body>
</html>`;
}

function listMarkdownFiles(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir)
    .filter(f => f.endsWith('.md'))
    .sort();
}

// Read request body and parse JSON. Calls cb(err, parsed) on completion.
function readJsonBody(req, res, cb) {
  let body = '';
  req.on('data', chunk => { body += chunk; });
  req.on('end', () => {
    try { cb(null, JSON.parse(body)); } catch {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: false, error: 'invalid JSON' }));
    }
  });
}

// Validate that `file` is a safe .md filename and resolve its path within docsDir.
// Returns { filePath } on success or sends an error response and returns null.
function resolveDocFile(file, docsDir, res) {
  if (!file || typeof file !== 'string' ||
      !file.endsWith('.md') || file.includes('/') || file.includes('\\')) {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: false, error: 'invalid file name' }));
    return null;
  }
  const filePath = path.join(docsDir, file);
  if (!path.resolve(filePath).startsWith(path.resolve(docsDir) + path.sep)) {
    res.writeHead(403, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: false, error: 'forbidden' }));
    return null;
  }
  if (!fs.existsSync(filePath)) {
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: false, error: 'file not found' }));
    return null;
  }
  return filePath;
}

function createRequestHandler(docsDir) {
  return function handler(req, res) {
    const url = new URL(req.url, `http://localhost`);
    let pathname;
    try {
      pathname = decodeURIComponent(url.pathname);
    } catch {
      res.writeHead(400, { 'Content-Type': 'text/plain' });
      res.end('Bad Request');
      return;
    }

    if (pathname === '/_sse') {
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'X-Accel-Buffering': 'no',
      });
      res.write(': connected\n\n');
      sseClients.add(res);
      res.on('close', () => sseClients.delete(res));
      return;
    }

    // ── POST /_comment ────────────────────────────────────────────────────
    if (pathname === '/_comment' && req.method === 'POST') {
      readJsonBody(req, res, (err, parsed) => {
        if (err) return;
        const { file, anchor, text, before = '', after = '' } = parsed;
        if (!anchor || !text || typeof anchor !== 'string' || typeof text !== 'string') {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ ok: false, error: 'missing or invalid fields' }));
          return;
        }
        const filePath = resolveDocFile(file, docsDir, res);
        if (!filePath) return;
        const raw = fs.readFileSync(filePath, 'utf8');
        const updated = insertComment(raw, anchor, text, before, after);
        if (!updated) {
          res.writeHead(422, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ ok: false, error: 'anchor text not found in file' }));
          return;
        }
        fs.writeFileSync(filePath, updated, 'utf8');
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true }));
      });
      return;
    }

    // ── PATCH /_comment (edit) ────────────────────────────────────────────
    if (pathname === '/_comment' && req.method === 'PATCH') {
      readJsonBody(req, res, (err, parsed) => {
        if (err) return;
        const { file, id, text } = parsed;
        if (!id || !text || typeof id !== 'string' || typeof text !== 'string') {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ ok: false, error: 'missing or invalid fields' }));
          return;
        }
        const filePath = resolveDocFile(file, docsDir, res);
        if (!filePath) return;
        const raw = fs.readFileSync(filePath, 'utf8');
        const updated = editComment(raw, id, text);
        if (!updated) {
          res.writeHead(422, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ ok: false, error: 'comment not found' }));
          return;
        }
        fs.writeFileSync(filePath, updated, 'utf8');
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true }));
      });
      return;
    }

    // ── DELETE /_comment ──────────────────────────────────────────────────
    if (pathname === '/_comment' && req.method === 'DELETE') {
      readJsonBody(req, res, (err, parsed) => {
        if (err) return;
        const { file, id } = parsed;
        if (!id || typeof id !== 'string') {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ ok: false, error: 'missing or invalid fields' }));
          return;
        }
        const filePath = resolveDocFile(file, docsDir, res);
        if (!filePath) return;
        const raw = fs.readFileSync(filePath, 'utf8');
        const updated = deleteComment(raw, id);
        if (!updated) {
          res.writeHead(422, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ ok: false, error: 'comment not found' }));
          return;
        }
        fs.writeFileSync(filePath, updated, 'utf8');
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true }));
      });
      return;
    }

    if (pathname === '/' || pathname === '') {
      const files = listMarkdownFiles(docsDir);
      const items = files.length
        ? files.map(f => {
            const name = f.replace(/\.md$/, '');
            return `<li><a href="/${encodeURIComponent(f)}"><span class="icon">📝</span>${escapeHtml(name)}</a></li>`;
          }).join('\n')
        : '<li style="padding:0.75rem 0; color:#6a737d;">No markdown files found in <code>docs/</code></li>';
      const html = renderPage('Index', `<h2 style="margin-bottom:1rem;">📁 Documents</h2><ul class="file-list">${items}</ul>`);
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(html);
      return;
    }

    const filename = pathname.replace(/^\//, '');
    if (filename.endsWith('.md') && !filename.includes('/') && !filename.includes('\\')) {
      const filePath = path.join(docsDir, filename);
      const resolvedDocsDir = path.resolve(docsDir);

      if (!filePath.startsWith(resolvedDocsDir + path.sep) &&
          filePath !== resolvedDocsDir) {
        res.writeHead(403, { 'Content-Type': 'text/plain' });
        res.end('Forbidden');
        return;
      }

      if (!fs.existsSync(filePath)) {
        res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(renderPage('Not Found', '<p>File not found.</p>'));
        return;
      }

      const raw = fs.readFileSync(filePath, 'utf8');
      const comments = parseComments(raw);
      const cleanMd = stripComments(raw);
      const rendered = marked.parse(cleanMd);
      const title = filename.replace(/\.md$/, '');
      const html = renderPage(title, `<div class="markdown-body">${rendered}</div>`, { comments, filename, rawMarkdown: cleanMd });
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(html);
      return;
    }

    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('Not found');
  };
}

const server = http.createServer(createRequestHandler(DOCS_DIR));

// Start server and watcher only when run directly
if (require.main === module) {
  if (!fs.existsSync(DOCS_DIR)) {
    fs.mkdirSync(DOCS_DIR, { recursive: true });
  }

  const watcher = chokidar.watch(DOCS_DIR, {
    ignoreInitial: true,
    usePolling: USE_POLLING,
    interval: USE_POLLING ? 1000 : undefined,
    binaryInterval: USE_POLLING ? 2000 : undefined,
    awaitWriteFinish: { stabilityThreshold: 300, pollInterval: 100 },
  });

  watcher.on('all', (event, filePath) => {
    console.log(`[watcher] ${event}: ${path.relative(DOCS_DIR, filePath)}`);
    notifyClients();
  });

  server.listen(PORT, () => {
    console.log(`Markdown server running at http://localhost:${PORT}`);
    console.log(`Serving files from: ${DOCS_DIR}`);
    console.log(`Watching for changes... ${USE_POLLING ? '(polling mode)' : '(native fs events)'}`);
  });

  process.on('SIGINT', () => {
    watcher.close();
    server.close();
    process.exit(0);
  });
}

module.exports = {
  server, createRequestHandler, escapeHtml, safeJson, listMarkdownFiles, renderPage,
  parseComments, stripComments, insertComment, deleteComment, editComment, cleanPosToRawPos,
  readJsonBody, resolveDocFile,
};
