'use strict';

const path = require('path');
const fs = require('fs');
const { test, expect } = require('./fixtures');

test('renders mermaid diagram from fenced code block', async ({ page, server }) => {
  const { baseUrl, docsDir } = server;
  fs.writeFileSync(path.join(docsDir, 'diagram.md'), [
    '# Diagram',
    '',
    '```mermaid',
    'graph TD',
    '  A[Start] --> B[End]',
    '```',
  ].join('\n'));

  await page.goto(`${baseUrl}/diagram.md`);

  // Mermaid replaces pre>code.language-mermaid with a rendered SVG inside a .mermaid div
  const svg = page.locator('.mermaid svg').first();
  await expect(svg).toBeVisible({ timeout: 5000 });
});

test('does not leave raw mermaid code block in the page', async ({ page, server }) => {
  const { baseUrl, docsDir } = server;
  fs.writeFileSync(path.join(docsDir, 'diagram2.md'), [
    '# Diagram',
    '',
    '```mermaid',
    'sequenceDiagram',
    '  Alice->>Bob: Hello',
    '```',
  ].join('\n'));

  await page.goto(`${baseUrl}/diagram2.md`);

  await expect(page.locator('.mermaid svg').first()).toBeVisible({ timeout: 5000 });
  // The raw pre>code block should have been replaced
  await expect(page.locator('pre > code.language-mermaid')).toHaveCount(0);
});
