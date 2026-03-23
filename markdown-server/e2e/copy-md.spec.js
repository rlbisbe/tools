const fs = require('fs');
const path = require('path');
const { insertComment } = require('../server');
const { test, expect } = require('./fixtures');

test.describe('copy MD button', () => {
  test('button text changes to "Copied!" after click', async ({ browser, server }) => {
    fs.writeFileSync(path.join(server.docsDir, 'doc.md'), '# Hello\n\nSome text.');
    const context = await browser.newContext({ permissions: ['clipboard-read', 'clipboard-write'] });
    const page = await context.newPage();

    await page.goto(`${server.baseUrl}/doc.md`);
    await page.click('#copy-md-btn');
    await expect(page.locator('#copy-md-btn')).toContainText('Copied!');
    await context.close();
  });

  test('copied content is the raw markdown without comment annotations', async ({ browser, server }) => {
    const raw = insertComment('# Hello\n\nSome text.', 'Some text', 'a note', '\n\n', '.');
    fs.writeFileSync(path.join(server.docsDir, 'doc.md'), raw);

    const context = await browser.newContext({ permissions: ['clipboard-read', 'clipboard-write'] });
    const page = await context.newPage();

    await page.goto(`${server.baseUrl}/doc.md`);
    await page.click('#copy-md-btn');

    const clip = await page.evaluate(() => navigator.clipboard.readText());
    expect(clip).not.toContain('@comment:');
    expect(clip).toContain('Some text');
    await context.close();
  });

  test('button label reverts after 2 seconds', async ({ browser, server }) => {
    fs.writeFileSync(path.join(server.docsDir, 'doc.md'), '# Hello\n\nSome text.');
    const context = await browser.newContext({ permissions: ['clipboard-read', 'clipboard-write'] });
    const page = await context.newPage();

    await page.goto(`${server.baseUrl}/doc.md`);
    const orig = await page.locator('#copy-md-btn').textContent();
    await page.click('#copy-md-btn');
    await expect(page.locator('#copy-md-btn')).toContainText('Copied!');
    await page.waitForTimeout(2100);
    await expect(page.locator('#copy-md-btn')).toContainText(orig.trim());
    await context.close();
  });
});
