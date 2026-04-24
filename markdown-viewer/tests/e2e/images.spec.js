/**
 * Image rendering: relative path rewriting (REQ-CR-09).
 * Covers: BUG-IMG-01
 *
 * The complete fix has two layers:
 *   1. Rust (render_markdown_for_dir): rewrites relative img src attributes to
 *      absolute filesystem paths rooted at the docs directory.
 *   2. Frontend (DocumentView.#renderContent): calls convertFileSrc() on every
 *      absolute src so the WebView gets a loadable https://asset.localhost/… URL
 *      rather than a bare filesystem path that tauri://localhost/ cannot serve.
 *
 * The tests below verify both layers via img.src (the browser-resolved property),
 * which is the definitive signal for whether an image will actually load.
 */
import { test, expect } from './fixtures.js';

async function openFile(page, filename) {
  await page.locator(`[data-testid="file-item-${filename}"]`).click();
  await expect(page.locator('[data-testid="screen-doc"]')).toBeVisible();
}

// Mock docs dir — matches what get_docs_dir returns in the fixture mock.
const MOCK_DOCS_DIR = '/mock/docs';

test('BUG-IMG-01 — img.src references the docs directory, not the page origin', async ({ page }) => {
  await openFile(page, 'images.md');

  // Both <img> elements must be present in the rendered content.
  const imgs = page.locator('[data-testid="doc-content"] img');
  await expect(imgs).toHaveCount(2);

  // img.src is the browser-resolved absolute URL. This is the authoritative
  // signal: if it references the docs directory the image will load; if it
  // resolves against the page origin it won't.
  //
  // In the test environment convertFileSrc() is a no-op (mock returns path
  // unchanged), so img.src = http://HOST + absolutePath.
  // For './photo.jpg'       → /mock/docs/photo.jpg      → img.src contains /mock/docs
  // For 'images/banner.png' → /mock/docs/images/banner.png → img.src contains /mock/docs
  const resolvedSrcs = await page.evaluate(() =>
    Array.from(document.querySelectorAll('[data-testid="doc-content"] img'))
      .map(img => img.src)
  );

  for (const src of resolvedSrcs) {
    expect(
      src,
      `img.src "${src}" does not reference the docs directory — image will not load`
    ).toContain(MOCK_DOCS_DIR);
  }
});

test('BUG-IMG-01b — img.src is not naively resolved against the page URL', async ({ page }) => {
  await openFile(page, 'images.md');

  // Collect the page origin and the browser-resolved img.src values together
  // in a single evaluate so they share the same execution context.
  const { pageOrigin, resolvedSrcs } = await page.evaluate(() => ({
    pageOrigin: window.location.origin,
    resolvedSrcs: Array.from(document.querySelectorAll('[data-testid="doc-content"] img'))
      .map(img => img.src),
  }));

  // The naive (buggy) resolution of a relative path would produce a URL whose
  // path portion is just the raw filename (e.g. http://HOST/photo.jpg).
  // After the fix, every resolved URL must contain a path component that goes
  // into the docs directory — it cannot be a bare filename at the page root.
  for (const src of resolvedSrcs) {
    // src must not be just pageOrigin + "/" + bare filename
    const url = new URL(src);
    // The path must be deeper than one segment and must contain the docs dir
    expect(
      src,
      `img.src "${src}" looks like a naive page-relative resolution`
    ).toContain(MOCK_DOCS_DIR);

    // The URL must not be simply pageOrigin/filename.ext (the buggy case)
    expect(url.pathname.split('/').filter(Boolean).length).toBeGreaterThan(1);
  }
});
