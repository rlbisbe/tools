const fs = require('fs');
const path = require('path');
const { insertComment, parseComments } = require('../server');
const { test, expect } = require('./fixtures');

test.describe('comment highlight', () => {
  test('comment anchor span is injected into rendered markdown', async ({ page, server }) => {
    const raw = insertComment('# Title\n\nHello world.', 'Hello world', 'note', '\n\n', '.');
    fs.writeFileSync(path.join(server.docsDir, 'doc.md'), raw);

    await page.goto(`${server.baseUrl}/doc.md`);
    const anchor = page.locator('.comment-anchor').first();
    await expect(anchor).toBeVisible();
    await expect(anchor).toContainText('Hello world');
  });

  test('clicking an anchor span opens the sidebar', async ({ page, server }) => {
    const raw = insertComment('# Title\n\nHello world.', 'Hello world', 'note', '\n\n', '.');
    fs.writeFileSync(path.join(server.docsDir, 'doc.md'), raw);

    await page.goto(`${server.baseUrl}/doc.md`);
    await page.locator('.comment-anchor').first().click();
    await expect(page.locator('#comment-sidebar')).toHaveClass(/open/);
  });

  test('clicking a sidebar row scrolls to the anchor', async ({ page, server }) => {
    const raw = insertComment('# Title\n\nHello world.', 'Hello world', 'note', '\n\n', '.');
    fs.writeFileSync(path.join(server.docsDir, 'doc.md'), raw);

    await page.goto(`${server.baseUrl}/doc.md`);
    await page.click('#comment-toggle');
    await page.locator('.sidebar-comment').first().click();
    // Anchor should be visible in viewport after scroll
    await expect(page.locator('.comment-anchor').first()).toBeInViewport();
  });
});

test.describe('comment CRUD via UI', () => {
  test('edit button opens form pre-filled with existing comment text', async ({ page, server }) => {
    const raw = insertComment('# Title\n\nHello world.', 'Hello world', 'original note', '\n\n', '.');
    fs.writeFileSync(path.join(server.docsDir, 'doc.md'), raw);

    await page.goto(`${server.baseUrl}/doc.md`);
    await page.click('#comment-toggle');
    await page.locator('.sc-btn.edit').first().click();

    await expect(page.locator('#comment-form-overlay')).toHaveClass(/open/);
    await expect(page.locator('#comment-form-title')).toHaveText('Edit comment');
    await expect(page.locator('#comment-text-input')).toHaveValue('original note');
  });

  test('editing a comment saves the new text', async ({ page, server }) => {
    const raw = insertComment('# Title\n\nHello world.', 'Hello world', 'old note', '\n\n', '.');
    fs.writeFileSync(path.join(server.docsDir, 'doc.md'), raw);

    await page.goto(`${server.baseUrl}/doc.md`);
    await page.click('#comment-toggle');
    await page.locator('.sc-btn.edit').first().click();

    await page.locator('#comment-text-input').fill('updated note');
    await page.click('#comment-submit');

    // Wait for page to reload (SSE or re-navigate)
    await page.reload();
    await page.click('#comment-toggle');
    await expect(page.locator('.sc-text').first()).toContainText('updated note');
  });

  test('delete button removes the comment', async ({ page, server }) => {
    const raw = insertComment('# Title\n\nHello world.', 'Hello world', 'to delete', '\n\n', '.');
    fs.writeFileSync(path.join(server.docsDir, 'doc.md'), raw);

    await page.goto(`${server.baseUrl}/doc.md`);
    await page.click('#comment-toggle');

    page.once('dialog', dialog => dialog.accept());
    await page.locator('.sc-btn.delete').first().click();

    await page.reload();
    const saved = fs.readFileSync(path.join(server.docsDir, 'doc.md'), 'utf8');
    expect(parseComments(saved)).toHaveLength(0);
  });

  test('comment count appears in toggle button', async ({ page, server }) => {
    const raw = insertComment('# Title\n\nHello world.', 'Hello world', 'note', '\n\n', '.');
    fs.writeFileSync(path.join(server.docsDir, 'doc.md'), raw);

    await page.goto(`${server.baseUrl}/doc.md`);
    await expect(page.locator('#comment-toggle')).toContainText('1 comment');
  });

  test('sidebar shows empty state when no comments', async ({ page, server }) => {
    fs.writeFileSync(path.join(server.docsDir, 'doc.md'), '# Title\n\nNo comments here.');

    await page.goto(`${server.baseUrl}/doc.md`);
    await page.click('#comment-toggle');
    await expect(page.locator('.sidebar-empty')).toBeVisible();
  });
});
