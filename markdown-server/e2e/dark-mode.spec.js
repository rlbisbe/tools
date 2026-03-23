const fs = require('fs');
const path = require('path');
const { test, expect } = require('./fixtures');

test.describe('dark mode', () => {
  test.beforeEach(async ({ server }) => {
    fs.writeFileSync(path.join(server.docsDir, 'doc.md'), '# Hello\n\nSome text.');
  });

  test('defaults to light mode when no preference saved', async ({ page, server }) => {
    await page.goto(`${server.baseUrl}/doc.md`);
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
    await expect(page.locator('#theme-toggle')).toContainText('🌙');
  });

  test('toggle switches to dark mode', async ({ page, server }) => {
    await page.goto(`${server.baseUrl}/doc.md`);
    await page.click('#theme-toggle');
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    await expect(page.locator('#theme-toggle')).toContainText('☀️');
  });

  test('toggle switches back to light mode', async ({ page, server }) => {
    await page.goto(`${server.baseUrl}/doc.md`);
    await page.click('#theme-toggle');
    await page.click('#theme-toggle');
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  });

  test('theme preference persists to localStorage', async ({ page, server }) => {
    await page.goto(`${server.baseUrl}/doc.md`);
    await page.click('#theme-toggle');
    const stored = await page.evaluate(() => localStorage.getItem('theme'));
    expect(stored).toBe('dark');
  });

  test('saved dark preference is applied on next page load', async ({ page, server }) => {
    await page.goto(`${server.baseUrl}/doc.md`);
    await page.evaluate(() => localStorage.setItem('theme', 'dark'));
    await page.goto(`${server.baseUrl}/doc.md`);
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  });
});
