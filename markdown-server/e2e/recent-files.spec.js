const fs = require('fs');
const path = require('path');
const { test, expect } = require('./fixtures');

test.describe('recent files', () => {
  test.beforeEach(async ({ server }) => {
    fs.writeFileSync(path.join(server.docsDir, 'alpha.md'), '# Alpha');
    fs.writeFileSync(path.join(server.docsDir, 'beta.md'), '# Beta');
  });

  test('visiting a doc records it in localStorage', async ({ page, server }) => {
    await page.goto(`${server.baseUrl}/alpha.md`);
    const recent = await page.evaluate(() => JSON.parse(localStorage.getItem('md-server-recent') || '[]'));
    expect(recent.some(r => r.file === 'alpha.md')).toBe(true);
  });

  test('recent dropdown shows previously visited files', async ({ page, server }) => {
    await page.goto(`${server.baseUrl}/alpha.md`);
    await page.goto(`${server.baseUrl}/beta.md`);
    await page.click('#recent-btn');
    await expect(page.locator('#recent-dropdown')).toHaveClass(/open/);
    await expect(page.locator('.recent-item')).toContainText('alpha');
  });

  test('current file is excluded from the recent dropdown', async ({ page, server }) => {
    await page.goto(`${server.baseUrl}/alpha.md`);
    await page.goto(`${server.baseUrl}/beta.md`);
    await page.click('#recent-btn');
    const items = page.locator('.recent-item');
    const count = await items.count();
    for (let i = 0; i < count; i++) {
      await expect(items.nth(i)).not.toContainText('beta');
    }
  });

  test('dropdown closes on outside click', async ({ page, server }) => {
    await page.goto(`${server.baseUrl}/alpha.md`);
    await page.goto(`${server.baseUrl}/beta.md`);
    await page.click('#recent-btn');
    await expect(page.locator('#recent-dropdown')).toHaveClass(/open/);
    await page.click('h1');
    await expect(page.locator('#recent-dropdown')).not.toHaveClass(/open/);
  });

  test('shows empty state when no recent files', async ({ page, server }) => {
    await page.goto(`${server.baseUrl}/alpha.md`);
    await page.evaluate(() => localStorage.removeItem('md-server-recent'));
    await page.click('#recent-btn');
    await expect(page.locator('.recent-empty')).toBeVisible();
  });
});
