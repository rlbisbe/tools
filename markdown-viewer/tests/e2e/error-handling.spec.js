/**
 * Error handling: watcher errors, orphaned anchors.
 * Covers: AT-ER-01, AT-ER-02
 */
import { test, expect } from './fixtures.js';

test('AT-ER-02 — watcher error shows user-visible banner', async ({ page }) => {
  // Navigate to doc view
  await page.locator('[data-testid="file-item-hello.md"]').click();
  await expect(page.locator('[data-testid="screen-doc"]')).toBeVisible();

  // Simulate watcher error event
  await page.evaluate(() => {
    window.__TAURI_MOCK__._emit('watcher-error', { message: 'Directory deleted or inaccessible' });
  });

  const banner = page.locator('[data-testid="watcher-error-banner"]');
  await expect(banner).toBeVisible();
  await expect(banner).toContainText('watcher error');
});

test('AT-ER-01 — orphaned anchor: comment appears in sidebar, no highlight in document', async ({ page }) => {
  // orphaned.md has a comment whose anchor ("missing text") is not in the rendered text
  await page.locator('[data-testid="file-item-orphaned.md"]').click();
  await expect(page.locator('[data-testid="screen-doc"]')).toBeVisible();
  await page.locator('[data-testid="comments-btn"]').click();

  // Comment should still appear in sidebar
  const entry = page.locator('[data-testid="sidebar-comment-o1"]');
  await expect(entry).toBeVisible();

  // No highlight should appear in the document body
  // (The anchor "missing text" is not in "Some content here.")
  const highlights = page.locator('.comment-anchor');
  await expect(highlights).toHaveCount(0);
});
