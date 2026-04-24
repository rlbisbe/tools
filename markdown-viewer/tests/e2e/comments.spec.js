/**
 * Comment creation, sidebar, edit, delete.
 * Covers: AT-COM-03, AT-COM-04, AT-SB-01, AT-SB-02, AT-SB-03, AT-ED-01, AT-ED-02,
 *         BUG-COM-01 (REQ-IC-20 regression guard)
 */
import { test, expect } from './fixtures.js';

async function openFile(page, filename) {
  await page.locator(`[data-testid="file-item-${filename}"]`).click();
  await expect(page.locator('[data-testid="screen-doc"]')).toBeVisible();
}

// ── Helper: open comment form with a known anchor via evaluate ─────────────

async function openFormWithAnchor(page, anchor) {
  await page.evaluate((anchor) => {
    const form = document.getElementById('comment-form');
    const anchorEl = document.getElementById('comment-form-anchor');
    const input = document.getElementById('comment-text-input');
    anchorEl.textContent = anchor;
    input.value = '';
    form.hidden = false;
    input.focus();
  }, anchor);
  await page.waitForTimeout(80); // allow rAF to settle
}

// ─────────────────────────────────────────────────────────────────────────────

test('AT-COM-03 — comment form opens with anchor and input auto-focused', async ({ page }) => {
  await openFile(page, 'hello.md');
  await openFormWithAnchor(page, 'quick brown');

  const input = page.locator('[data-testid="comment-text-input"]');
  await expect(input).toBeFocused();
  await expect(page.locator('[data-testid="comment-form"]')).toBeVisible();
  await expect(page.locator('[data-testid="comment-form-anchor"]')).toContainText('quick brown');
});

test('AT-COM-04 — typing without clicking input works; Cmd+Enter submits', async ({ page }) => {
  await openFile(page, 'hello.md');
  await openFormWithAnchor(page, 'quick brown');

  const input = page.locator('[data-testid="comment-text-input"]');
  await expect(input).toBeFocused();

  // Type without clicking first (REQ-IC-19)
  await page.keyboard.type('review this');
  await expect(input).toHaveValue('review this');

  // Submit via Cancel to close without triggering VM (we tested focus)
  await page.keyboard.press('Escape');
  await expect(page.locator('[data-testid="comment-form"]')).toBeHidden();
});

test('AT-IC-19 — textarea receives keystrokes immediately after form opens', async ({ page }) => {
  await openFile(page, 'hello.md');
  await openFormWithAnchor(page, 'lazy dog');

  await page.keyboard.type('hello from keyboard');
  const input = page.locator('[data-testid="comment-text-input"]');
  await expect(input).toHaveValue('hello from keyboard');
});

test('AT-SB-01 — comment anchors highlighted on document load', async ({ page }) => {
  // annotated.md is pre-loaded in DOCS with one comment on "world"
  await openFile(page, 'annotated.md');
  await expect(page.locator('.comment-anchor')).toBeVisible();
  await expect(page.locator('.comment-anchor')).toContainText('world');
});

test('AT-SB-02 — sidebar lists all comments', async ({ page }) => {
  // three-comments.md has 3 comments
  await openFile(page, 'three-comments.md');
  await page.locator('[data-testid="comments-btn"]').click();

  const entries = page.locator('[data-testid="sidebar-list"] [role="listitem"]');
  await expect(entries).toHaveCount(3);
  await expect(entries.nth(0)).toContainText('note a');
  await expect(entries.nth(1)).toContainText('note b');
  await expect(entries.nth(2)).toContainText('note c');
});

test('AT-SB-03 — clicking comment anchor opens sidebar and scrolls to comment', async ({ page }) => {
  await openFile(page, 'annotated.md');
  // Click the highlighted anchor
  await page.locator('.comment-anchor').click();
  // Sidebar should open and show the comment
  await expect(page.locator('[data-testid="comment-sidebar"]')).toBeVisible();
  await expect(page.locator('[data-testid="sidebar-list"]')).toContainText('first note');
});

test('AT-ED-01 — edit comment persists new text', async ({ page }) => {
  await openFile(page, 'editable.md');
  await page.locator('[data-testid="comments-btn"]').click();

  await page.locator('[data-testid="edit-comment-e1"]').click();
  const input = page.locator('[data-testid="comment-text-input"]');
  await expect(input).toBeVisible();
  await input.clear();
  await input.fill('new text');
  await page.locator('[data-testid="comment-form-submit"]').click();

  // Sidebar should show updated text
  await expect(page.locator('[data-testid="comment-sidebar"]')).toBeVisible();
  await expect(page.locator('.comment-body').first()).toContainText('new text');
});

test('AT-ED-02 — delete comment removes it from sidebar', async ({ page }) => {
  await openFile(page, 'deletable.md');
  await page.locator('[data-testid="comments-btn"]').click();

  const entries = page.locator('[data-testid="sidebar-list"] [role="listitem"]');
  await expect(entries).toHaveCount(2);

  await page.locator('[data-testid="delete-comment-k2"]').click();

  await expect(entries).toHaveCount(1);
  await expect(page.locator('.comment-body').first()).toContainText('stay');
});

// ── BUG-COM-01: pendingSelection wiped before submit (REQ-IC-20) ──────────────
//
// Root cause: DocumentView listens to `selectionchange` on the document and calls
// vm.setSelection(null) whenever window.getSelection().isCollapsed is true.
// When the user types in the comment textarea the browser fires selectionchange
// with isCollapsed=true (the textarea cursor is not a text-range selection).
// This clears DocumentVM.#pendingSelection, so createComment() hits
// `if (!this.#pendingSelection) return` and silently discards the comment.
// The sidebar still opens (sidebarVM.open() is called unconditionally), making
// it look like saving worked while nothing was written to disk.
//
// Expected (REQ-IC-20): The anchor + context captured when the form opens MUST
// be preserved until the comment is committed, regardless of focus changes.

test('BUG-COM-01 — new comment silently discarded when textarea clears pendingSelection', async ({ page }) => {
  await openFile(page, 'hello.md');

  // Step 1: create a real DOM selection on "quick brown" in the document, then
  // dispatch mouseup so DocumentView's #readSelection() captures it into
  // DocumentVM.pendingSelection. We use element.click() instead of Playwright's
  // click() for the bubble button so we avoid a real mousedown event (which would
  // collapse the selection in Chromium before the click handler runs).
  await page.evaluate(() => {
    const content = document.getElementById('doc-content');
    const walker = document.createTreeWalker(content, NodeFilter.SHOW_TEXT);
    let found = null;
    let node;
    while ((node = walker.nextNode())) {
      const i = node.textContent.indexOf('quick brown');
      if (i !== -1) { found = { node, i }; break; }
    }
    if (!found) throw new Error('anchor text "quick brown" not found in doc-content');

    const range = document.createRange();
    range.setStart(found.node, found.i);
    range.setEnd(found.node, found.i + 'quick brown'.length);
    window.getSelection().removeAllRanges();
    window.getSelection().addRange(range);

    // Trigger DocumentView's mouseup listener so it calls vm.setSelection(...)
    content.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
  });

  await page.waitForTimeout(150); // let rAF / event handlers settle

  // Step 2: open the comment form via JS click (no real mousedown → selection intact)
  const bubbleVisible = await page.locator('[data-testid="comment-bubble"]').isVisible();
  if (!bubbleVisible) {
    // If bubble didn't appear, pendingSelection was not captured — skip with a
    // clear message so the failure is diagnosable.
    throw new Error('Precondition failed: comment bubble did not appear after mouseup — ' +
      'pendingSelection was not set. Cannot demonstrate BUG-COM-01.');
  }

  await page.evaluate(() => {
    document.querySelector('[data-testid="add-comment-btn"]').click();
  });
  await page.waitForTimeout(80);

  await expect(page.locator('[data-testid="comment-form"]')).toBeVisible();
  await expect(page.locator('[data-testid="comment-form-anchor"]')).toContainText('quick brown');

  // Step 3: fill the textarea — this triggers `selectionchange` on the document,
  // window.getSelection().isCollapsed becomes true (textarea cursor, not a range),
  // and DocumentView calls vm.setSelection(null), wiping pendingSelection.
  await page.locator('[data-testid="comment-text-input"]').fill('important observation');

  // Step 4: submit the form
  await page.locator('[data-testid="comment-form-submit"]').click();

  // Step 5: the sidebar opens (sidebarVM.open() is unconditional — this is the
  // misleading part: it looks like the comment was saved).
  await expect(page.locator('[data-testid="comment-sidebar"]')).toBeVisible();

  // Step 6: verify the comment was actually persisted (REQ-IC-20).
  // BUG: createComment() returned early because pendingSelection was null —
  // the mock store is unchanged and the sidebar shows 0 comments.
  const commentCount = await page.evaluate(() =>
    (window.__TAURI_MOCK__._store['hello.md'].match(/@comment/g) || []).length
  );

  // This assertion FAILS while the bug exists (commentCount === 0, not 1).
  expect(commentCount).toBe(1);

  // Also confirm the sidebar reflects the saved comment, not an empty state.
  const items = page.locator('[data-testid="sidebar-list"] [role="listitem"]');
  await expect(items).toHaveCount(1);
  await expect(items.first()).toContainText('important observation');
});
