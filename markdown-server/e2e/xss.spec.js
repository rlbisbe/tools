const fs = require('fs');
const path = require('path');
const { insertComment } = require('../server');
const { test, expect } = require('./fixtures');

// These tests assert the safe (post-fix) behavior.
// Before the XSS fix they will fail — that is intentional.

test.describe('XSS: renderSidebar innerHTML', () => {
  test('comment text with HTML payload is not executed', async ({ page, server }) => {
    const raw = insertComment(
      '# Hello\n\nSome text.',
      'Some text',
      '<img src=x onerror="window.__xss_text=1">',
      '\n\n', '.'
    );
    fs.writeFileSync(path.join(server.docsDir, 'doc.md'), raw);

    await page.goto(`${server.baseUrl}/doc.md`);
    await page.click('#comment-toggle');

    const xssTriggered = await page.evaluate(() => typeof window.__xss_text !== 'undefined');
    expect(xssTriggered).toBe(false);

    // The text should be visible as literal characters, not rendered as HTML
    const scText = page.locator('.sc-text').first();
    await expect(scText).toContainText('<img');
  });

  test('comment anchor with HTML payload is shown as plain text in sidebar', async ({ page, server }) => {
    // Write a comment whose anchor field contains an XSS payload directly in the JSON.
    // The markdown content itself is safe; only the stored comment anchor is crafted.
    const payload = '<img src=x onerror="window.__xss_anchor=1">';
    const commentTag = `<!-- @comment: ${JSON.stringify({ id: 'xss1', anchor: payload, before: '', after: '', text: 'note', date: '2026-01-01' })} -->`;
    const raw = `# Hello\n\nSome text.${commentTag}`;
    fs.writeFileSync(path.join(server.docsDir, 'doc.md'), raw);

    await page.goto(`${server.baseUrl}/doc.md`);
    await page.click('#comment-toggle');

    const xssTriggered = await page.evaluate(() => typeof window.__xss_anchor !== 'undefined');
    expect(xssTriggered).toBe(false);

    // The anchor should be visible as literal text, not as a rendered img element
    const scAnchor = page.locator('.sc-anchor').first();
    await expect(scAnchor).toContainText('<img');
  });

  test('comment text with <script> tag is shown as plain text', async ({ page, server }) => {
    const raw = insertComment(
      '# Hello\n\nSome text.',
      'Some text',
      '<script>alert(1)</script>',
      '\n\n', '.'
    );
    fs.writeFileSync(path.join(server.docsDir, 'doc.md'), raw);

    await page.goto(`${server.baseUrl}/doc.md`);
    await page.click('#comment-toggle');

    const scText = page.locator('.sc-text').first();
    await expect(scText).toContainText('<script>alert(1)</script>');
  });
});
