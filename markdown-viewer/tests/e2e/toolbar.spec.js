/**
 * Toolbar: dark mode, copy MD, recent files, keyboard nav.
 * Covers: AT-DM-02, AT-CP-01, AT-CP-02, AT-KB-01, REQ-NV-07, REQ-NV-08
 */
import { test, expect } from './fixtures.js';

async function openFile(page, filename) {
  await page.locator(`[data-testid="file-item-${filename}"]`).click();
  await expect(page.locator('[data-testid="screen-doc"]')).toBeVisible();
}

test('AT-DM-02 — theme switch applies without page reload', async ({ page }) => {
  await openFile(page, 'hello.md');

  const html = page.locator('html');
  await expect(html).toHaveAttribute('data-theme', 'light');

  await page.locator('[data-testid="theme-toggle"]').click();
  await expect(html).toHaveAttribute('data-theme', 'dark');

  // Still on the same doc — no reload needed
  await expect(page.locator('[data-testid="doc-content"]')).toBeVisible();
});

test('theme preference persists via localStorage', async ({ page }) => {
  await page.locator('[data-testid="theme-toggle"]').click();
  const stored = await page.evaluate(() => localStorage.getItem('md-viewer-theme'));
  expect(stored).toBe('dark');
});

test('AT-CP-01 — Copy MD strips comment annotations', async ({ page }) => {
  await openFile(page, 'annotated.md');

  // Intercept clipboard.writeText to capture what gets written
  const copied = await page.evaluate(async () => {
    let captured = null;
    navigator.clipboard.writeText = async (text) => { captured = text; };
    // Trigger copy — the toolbar reads doc-title.dataset.filename
    document.getElementById('copy-md-btn').click();
    // Wait briefly for the async mock invoke to resolve
    await new Promise(r => setTimeout(r, 200));
    return captured;
  });

  // The mock get_raw_markdown strips comment tags
  expect(copied).not.toBeNull();
  expect(copied).not.toContain('@comment');
  expect(copied).toContain('Hello world');
});

test('AT-CP-02 — Copy MD shows "Copied!" feedback then reverts', async ({ page }) => {
  await openFile(page, 'hello.md');

  // Replace clipboard.writeText so it resolves cleanly
  await page.evaluate(() => {
    navigator.clipboard.writeText = async () => {};
  });

  const btn = page.locator('[data-testid="copy-md-btn"]');
  await btn.click();
  await expect(btn).toContainText('Copied!');

  // Reverts within 3 seconds (REQ-NV-03)
  await page.waitForTimeout(3200);
  await expect(btn).toContainText('Copy MD');
});

test('AT-KB-01 — Tab moves focus through toolbar actions', async ({ page }) => {
  await openFile(page, 'hello.md');

  // Focus the back button directly (it's the first toolbar element)
  await page.locator('[data-testid="back-btn"]').focus();
  await expect(page.locator('[data-testid="back-btn"]')).toBeFocused();

  // Tab to copy-md-btn
  await page.keyboard.press('Tab');
  await expect(page.locator('[data-testid="copy-md-btn"]')).toBeFocused();

  // Tab to comments-btn
  await page.keyboard.press('Tab');
  await expect(page.locator('[data-testid="comments-btn"]')).toBeFocused();

  // Tab to recent-btn
  await page.keyboard.press('Tab');
  await expect(page.locator('[data-testid="recent-btn"]')).toBeFocused();

  // Tab to theme-toggle
  await page.keyboard.press('Tab');
  await expect(page.locator('[data-testid="theme-toggle"]')).toBeFocused();
});

test('REQ-NV-07/08 — recent files list updates and excludes current file', async ({ page }) => {
  await openFile(page, 'hello.md');

  // Go back to file index
  await page.locator('[data-testid="back-btn"]').click();
  await expect(page.locator('[data-testid="screen-index"]')).toBeVisible();

  // Open a second file
  await openFile(page, 'code.md');

  // Open recent dropdown
  await page.locator('[data-testid="recent-btn"]').click();
  const recent = page.locator('[data-testid="recent-dropdown"]');
  await expect(recent).toBeVisible();

  // hello.md should appear (previously visited)
  await expect(recent).toContainText('hello.md');
  // code.md (currently open) should NOT appear (REQ-NV-08)
  await expect(recent).not.toContainText('code.md');
});
