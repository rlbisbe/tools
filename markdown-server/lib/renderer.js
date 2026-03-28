'use strict';

const fs = require('fs');
const path = require('path');
const ejs = require('ejs');

const PAGE_TEMPLATE = path.join(__dirname, '..', 'views', 'page.ejs');

function escapeHtml(str) {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// Serialize a value to JSON safe for embedding inside a <script> block.
// JSON.stringify leaves </script> unescaped which terminates the script block.
function safeJson(value) {
  return JSON.stringify(value).replace(/</g, '\\u003c').replace(/>/g, '\\u003e');
}

function renderPage(title, bodyHtml, pageData) {
  return ejs.render(fs.readFileSync(PAGE_TEMPLATE, 'utf8'), {
    title,
    escapedTitle: escapeHtml(title),
    bodyHtml,
    pageData: pageData || null,
    commentsJson:    safeJson(pageData ? (pageData.comments    || []) : []),
    filenameJson:    safeJson(pageData ? (pageData.filename    || '') : ''),
    rawMarkdownJson: safeJson(pageData ? (pageData.rawMarkdown || '') : ''),
  });
}

module.exports = { escapeHtml, safeJson, renderPage };
